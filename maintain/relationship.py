"""Dream-side relationship evidence validation and Artifact revisions."""

from __future__ import annotations

import datetime

try:
    from ..app.ports import ArtifactCache, ArtifactStore, SourceStore
    from ..core.artifact import Artifact, Lineage, make, revise, validate
    from ..core.relationship import relationship_id
    from ..core.relationship_rules import (
        ConversationScope, RelationshipReason, RelationshipScoringPolicy,
        RelationshipStrength, VerifiedRelationshipEvent, project_relationship,
    )
except ImportError:
    from app.ports import ArtifactCache, ArtifactStore, SourceStore
    from core.artifact import Artifact, Lineage, make, revise, validate
    from core.relationship import relationship_id
    from core.relationship_rules import (
        ConversationScope, RelationshipReason, RelationshipScoringPolicy,
        RelationshipStrength, VerifiedRelationshipEvent, project_relationship,
    )


_RESERVED_SUBJECTS = {"", "self", "relation", "world"}


def consolidate_relationships(artifacts: ArtifactStore, sources: SourceStore, events=None, cache: ArtifactCache | None = None, policy: RelationshipScoringPolicy | None = None, *, as_of: datetime.datetime | None = None) -> int:
    """Replay verified events into one versioned V2 relationship per subject."""
    if events is None or cache is None:
        return 0
    policy = policy or RelationshipScoringPolicy()
    as_of = as_of or datetime.datetime.now(datetime.timezone.utc)
    made = 0
    subjects = events.subjects(policy.verifier_version)
    for subject in subjects:
        rows = [row for row in events.by_subject(subject, policy.verifier_version) if row.status == "verified"]
        verified = [VerifiedRelationshipEvent(row.event_id, row.subject_id, RelationshipReason(row.reason), RelationshipStrength(row.strength), ConversationScope(row.scope), datetime.fromisoformat(row.event_at), row.primary_source_id, row.source_ids, row.repair_of) for row in rows]
        snapshot = project_relationship(verified, as_of, policy)
        artifacts.commit(art, expected_revision=0, op="create", reason="relationship-v2")
        cache.put(art)
        made += 1
    return made



def _current_relationships(cache: ArtifactCache) -> dict[str, Artifact | bool]:
    grouped: dict[str, list[Artifact]] = {}
    for art in cache.active("relationship"):
        grouped.setdefault(str(art.header.subject_id or ""), []).append(art)
    out: dict[str, Artifact | bool] = {}
    for subject, rows in grouped.items():
        if subject in _RESERVED_SUBJECTS or len(rows) != 1:
            out[subject] = False
            continue
        art = rows[0]
        try:
            validate(art)
            snapshot_from_payload(
                art.payload,
                subject_id=subject,
                artifact_id=art.header.id,
                revision=art.header.revision,
            )
        except ValueError:
            out[subject] = False
            continue
        out[subject] = art
    return out


def _validated_observations(
    cache: ArtifactCache,
    sources: SourceStore,
    policy: RelationshipScoringPolicy,
) -> dict[str, list[tuple[RelationshipObservation, Artifact]]]:
    raw: list[tuple[Artifact, RelationshipReason, RelationshipStrength, float]] = []
    source_ids: list[str] = []
    for art in cache.active("memory"):
        subject = str(art.header.subject_id or "")
        if subject in _RESERVED_SUBJECTS or art.header.lineage.derived_from:
            continue
        if art.payload.get("relationship_policy_version") != RELATIONSHIP_POLICY_VERSION:
            continue
        try:
            reason = RelationshipReason(str(art.payload.get("relationship_reason") or ""))
            strength = RelationshipStrength(str(art.payload.get("relationship_strength") or ""))
        except ValueError:
            continue
        confidence = _confidence(art)
        if confidence < policy.minimum_evidence_confidence:
            continue
        ids = tuple(str(value) for value in art.header.lineage.sources if str(value))
        if not ids:
            continue
        raw.append((art, reason, strength, confidence))
        source_ids.extend(ids)

    originals = sources.sources_by_ids(list(dict.fromkeys(source_ids))) if source_ids else {}
    out: dict[str, list[tuple[RelationshipObservation, Artifact]]] = {}
    for art, reason, strength, confidence in raw:
        subject = str(art.header.subject_id or "")
        ids = tuple(str(value) for value in art.header.lineage.sources if str(value))
        rows = [originals.get(source_id) for source_id in ids]
        if any(row is None for row in rows):
            continue
        user_rows = [row for row in rows if row is not None and row.role == "user"]
        if not user_rows or any(row.speaker_id != subject for row in user_rows):
            continue
        scopes = {_scope_of(row.session_id) for row in rows if row is not None}
        if len(scopes) != 1:
            continue
        observation = RelationshipObservation(
            artifact_id=art.header.id,
            subject_id=subject,
            reason=reason,
            strength=strength,
            confidence=confidence,
            source_ids=ids,
            scope=next(iter(scopes)),
        )
        out.setdefault(subject, []).append((observation, art))
    return out


def migrate_v1_candidates(artifacts: ArtifactStore, sources: SourceStore, events) -> int:
    """Queue attributable V1 observations for independent V2 verification."""
    from core.relationship_rules import RelationshipCandidate, relationship_event_id
    queued = 0
    for art in artifacts.list("memory"):
        record = artifacts.inspect_record(art.header.id)
        for version in record.get("versions", []):
            header = version.get("header", {})
            payload = version.get("payload", {})
            if payload.get("relationship_policy_version") != "relationship-v1" or header.get("lineage", {}).get("derived_from"):
                continue
            ids = tuple(header.get("lineage", {}).get("sources", ()))
            loaded = sources.sources_by_ids(list(ids))
            primary = loaded.get(ids[0]) if ids else None
            if primary is None or primary.role != "user" or not primary.at.endswith("+00:00"):
                continue
            candidate = RelationshipCandidate(primary.speaker_id, RelationshipReason(payload["relationship_reason"]), RelationshipStrength(payload["relationship_strength"]), primary.id, ids, primary.session_id, _scope_of(primary.session_id), art.header.id, int(version.get("revision", 0)))
            events.record_pending({"event_id": relationship_event_id(candidate), "verifier_version": "relationship-verifier-v2", "subject_id": candidate.subject_id, "reason": candidate.reason.value, "strength": candidate.strength.value, "scope": candidate.scope.value, "event_at": primary.at, "primary_source_id": primary.id, "source_ids": ids, "origin_artifact_id": art.header.id, "origin_revision": candidate.origin_revision})
            queued += 1
    return queued



def _replacement(
    existing: Artifact | None,
    subject_id: str,
    plan,
    policy: RelationshipScoringPolicy,
) -> Artifact:
    payload = {
        "summary": summary_for(plan.band),
        "affinity": round(plan.affinity, 6),
        "confidence": round(plan.confidence, 6),
        "evidence_count": plan.evidence_count,
        "relation_band": plan.band.value,
        "policy": {
            "version": policy.version,
            "private_weight": policy.private_weight,
            "group_weight": policy.group_weight,
            "learning_rate": policy.learning_rate,
            "max_revision_delta": policy.max_revision_delta,
        },
    }
    old_sources = existing.header.lineage.sources if existing else ()
    old_derived = existing.header.lineage.derived_from if existing else ()
    lineage = Lineage(
        sources=tuple(dict.fromkeys((*old_sources, *plan.counted_source_ids))),
        derived_from=tuple(dict.fromkeys((*old_derived, *plan.reviewed_artifact_ids))),
    )
    if existing is not None:
        return revise(existing, payload=payload, lineage=lineage)
    return make(
        "relationship", payload, id=relationship_id(subject_id), subject_id=subject_id,
        scope="private", said_by="inferred", shareable="private_only", lineage=lineage,
    )


def _scope_of(session_id: str) -> ConversationScope:
    value = str(session_id or "")
    if ":FriendMessage:" in value:
        return ConversationScope.PRIVATE
    if ":GroupMessage:" in value:
        return ConversationScope.GROUP
    return ConversationScope.UNKNOWN


def _confidence(art: Artifact) -> float:
    value = art.header.strength.confidence
    if isinstance(value, bool):
        return 0.0
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return confidence if math.isfinite(confidence) and 0.0 <= confidence <= 1.0 else 0.0
