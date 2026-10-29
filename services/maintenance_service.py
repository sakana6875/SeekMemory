"""Memory maintenance: decay, merge, impression and persona evolution."""

from __future__ import annotations

import datetime
import math
from typing import Any, Awaitable, Callable

try:
    from ..app.persona_synthesis import (
        PersonaEvidence,
        build_persona_request,
        parse_persona_draft,
    )
    from ..app.ports import ArtifactStore, SourceStore
    from ..core.artifact import Lineage, Strength, content_of, revise
    from ..core.bot_behavior import SELF_SUBJECT
    from ..core.persona import PERSONA_SYNTHESIS_VERSION
except ImportError:  # Standalone tests use the repository as the import root.
    from app.persona_synthesis import (
        PersonaEvidence,
        build_persona_request,
        parse_persona_draft,
    )
    from app.ports import ArtifactStore, SourceStore
    from core.artifact import Lineage, Strength, content_of, revise
    from core.bot_behavior import SELF_SUBJECT
    from core.persona import PERSONA_SYNTHESIS_VERSION


PersonaModelFactory = Callable[[], Awaitable[Any]]


class MaintenanceService:
    """Own the weekly memory-maintenance pipeline."""

    def __init__(
        self,
        *,
        artifacts: ArtifactStore | None,
        sources: SourceStore | None,
        cache: Any,
        journal,
        task_id: Callable[[], str],
        logger,
        config: Callable[[str, Any], Any] | None = None,
        persona_model: PersonaModelFactory | None = None,
        clock: Callable[[], datetime.datetime] | None = None,
        relationship_events: Any | None = None,
        provider_for: Callable[[str], Awaitable[Any]] | None = None,
    ) -> None:
        self.artifacts = artifacts
        self.sources = sources
        self.cache = cache
        self.journal = journal
        self.task_id = task_id
        self.logger = logger
        self._c = config or (lambda _key, default: default)
        self.persona_model = persona_model
        self.clock = clock or (lambda: datetime.datetime.now(datetime.timezone.utc))
        self.relationship_events = relationship_events
        self.provider_for = provider_for

    def _relationship_mode(self) -> str:
        mode = str(self._c("relationship_mode", "observe") or "").strip().lower()
        if mode in ("off", "observe", "enforce"):
            return mode
        self.logger.warning("[seekmemory] invalid relationship config: relationship_mode")
        return "observe"

    def _relationship_weight(self, key: str, default: float) -> float:
        invalid = False
        try:
            value = float(self._c(key, default))
        except (TypeError, ValueError):
            value = default
            invalid = True
        if not math.isfinite(value):
            value = default
            invalid = True
        clamped = max(0.0, min(1.0, value))
        if invalid or clamped != value:
            self.logger.warning(f"[seekmemory] clamped relationship config: {key}")
        return clamped

    def _relationship_policy(self):
        try:
            from ..core.relationship_rules import RelationshipScoringPolicy
        except ImportError:
            from core.relationship_rules import RelationshipScoringPolicy
        private_weight = self._relationship_weight(
            "relationship_private_weight", 1.0
        )
        group_weight = self._relationship_weight(
            "relationship_group_weight", 0.5
        )
        return RelationshipScoringPolicy(
            private_weight=private_weight,
            group_weight=group_weight,
            unknown_weight=group_weight,
        )

    async def weekly(self) -> dict:
        try:
            from ..maintain.decay import decay_all
            from ..maintain.merge import merge_similar
            from ..maintain.persona import distill_self_persona
            from ..maintain.self_impression import build_self_impressions
            from ..maintain.relationship import consolidate_relationships, migrate_v1_candidates
        except ImportError:
            from maintain.decay import decay_all
            from maintain.merge import merge_similar
            from maintain.persona import distill_self_persona
            from maintain.self_impression import build_self_impressions
            from maintain.relationship import consolidate_relationships, migrate_v1_candidates

        if self.artifacts is None or self.sources is None or self.cache is None:
            return {}
        today = datetime.date.today().isoformat()
        relationships = 0
        if self._relationship_mode() != "off":
            if self.relationship_events is not None:
                migrate_v1_candidates(self.artifacts, self.sources, self.relationship_events)
            await self._verify_relationships()
            with self.journal.span("weekly", "relationship") as metrics:
                relationships = consolidate_relationships(
                    self.artifacts, self.sources, self.relationship_events, self.cache,
                    self._relationship_policy(), as_of=self.clock(),
                )
                metrics["updated"] = relationships
        with self.journal.span("weekly", "self_impression") as metrics:
            self_made = build_self_impressions(self.artifacts, self.sources, self.cache, today=today)
            metrics["made"] = self_made
        with self.journal.span("weekly", "decay") as metrics:
            dropped = decay_all(self.artifacts, self.cache, today)
            metrics["forgotten"] = dropped
        with self.journal.span("weekly", "merge", threshold=0.6) as metrics:
            merged = merge_similar(self.artifacts, self.cache, threshold=0.6)
            metrics["merged"] = merged
        with self.journal.span("weekly", "persona") as metrics:
            if self.persona_model is None:
                persona = distill_self_persona(self.artifacts, self.sources, self.cache, today)
                persona_result = {
                    "status": "updated" if persona else "unchanged",
                    "mode": "legacy_deterministic",
                }
            else:
                persona_result = await self._synthesize_persona_async()
                persona = persona_result.get("status") == "updated"
                if not persona and persona_result.get("status") in (
                    "no_persona", "not_bootstrapped"
                ):
                    # Backward-compatible transition for legacy installs: if
                    # there is no seeded persona to synthesize from, keep the
                    # historical deterministic self-impression persona path.
                    persona = distill_self_persona(
                        self.artifacts, self.sources, self.cache, today
                    )
                    persona_result = {
                        "status": "updated" if persona else "unchanged",
                        "mode": "legacy_deterministic_fallback",
                        "synthesis": persona_result,
                    }
            metrics.update(persona_result)
        self.journal.record(
            "weekly",
            "info",
            f"relationships {relationships}, forgot {dropped}, merged {merged}, persona: {persona_result.get('status', 'unchanged')}",
            self.task_id(),
        )
        self.logger.info(
            f"[seekmemory] weekly maintenance: relationships {relationships}, "
            f"forgot {dropped}, merged {merged}, "
            f"persona {persona_result.get('status', 'unchanged')}"
        )
        return {
            "forgotten": dropped,
            "merged": merged,
            "self_impressions": self_made,
            "persona": bool(persona),
            "persona_result": persona_result,
            "relationships": relationships,
        }
    async def _verify_relationships(self) -> None:
        if self.relationship_events is None or self.provider_for is None or self.sources is None:
            return
        from perceive.model import ProviderChatModel
        from perceive.relationship import verify_relationship
        from core.relationship_rules import (
            ConversationScope, RelationshipCandidate, RelationshipReason,
            RelationshipStrength, VERIFIER_VERSION,
        )
        negative = {
            RelationshipReason.DISRESPECT, RelationshipReason.INSULT,
            RelationshipReason.THREAT, RelationshipReason.HARASSMENT,
        }
        for row in self.relationship_events.pending(24):
            try:
                sources = self.sources.sources_by_ids(list(row.source_ids))
                evidence = tuple(sources[source_id] for source_id in row.source_ids)
                provider = ProviderChatModel(await self.provider_for(evidence[0].session_id))
                candidate = RelationshipCandidate(
                    row.subject_id, RelationshipReason(row.reason), RelationshipStrength(row.strength),
                    row.primary_source_id, row.source_ids, evidence[0].session_id, ConversationScope(row.scope),
                )
                prior_negative = (
                    tuple(prior for prior in self.relationship_events.by_subject(row.subject_id, VERIFIER_VERSION)
                          if prior.status == "verified" and RelationshipReason(prior.reason) in negative)
                    if candidate.reason is RelationshipReason.REPAIR else ()
                )
                verdict = await verify_relationship(candidate, evidence, provider, prior_negative)
                self.relationship_events.decide(row.event_id, VERIFIER_VERSION, verdict.status, verdict.repair_of)
            except Exception:
                self.logger.warning("[seekmemory] relationship verdict deferred")


    async def _synthesize_persona_async(self) -> dict:
        if not bool(self._c("persona_synthesis_enabled", True)):
            return {"status": "disabled"}
        active = sorted(
            self.cache.active("persona"),
            key=lambda art: (
                int(art.header.revision or 0),
                str(art.header.time.updated or ""),
                art.header.id,
            ),
        )
        if not active:
            return {"status": "no_persona"}
        current = active[-1]
        payload = current.payload
        if not str(payload.get("text") or "").strip():
            return {"status": "empty_persona"}
        if not (payload.get("origin") or payload.get("seed_id")):
            return {"status": "not_bootstrapped"}
        interval_days = max(0, int(self._c("persona_synthesis_interval_days", 7)))
        age_days = self._persona_age_days(current)
        if interval_days and age_days is not None and age_days < interval_days:
            return {
                "status": "not_due",
                "age_days": round(age_days, 3),
                "interval_days": interval_days,
            }
        evidence = self._persona_evidence()
        if not evidence:
            return {"status": "no_evidence"}
        if not any(item.source_ids for item in evidence):
            return {"status": "no_sources"}
        try:
            model = await self.persona_model()  # type: ignore[misc]
            request = build_persona_request(
                payload,
                evidence,
                max_evidence_chars=max(
                    200, int(self._c("persona_synthesis_evidence_chars", 2400))
                ),
            )
            response = await model.complete(request)
            draft = parse_persona_draft(
                str(getattr(response, "text", "") or ""), payload
            )
        except Exception as exc:  # noqa: BLE001 - keep the old persona on failure
            self.logger.warning(
                f"[seekmemory] persona synthesis failed: {type(exc).__name__}: {exc}"
            )
            return {"status": "failed", "error": type(exc).__name__}
        if draft is None:
            return {"status": "unchanged", "reason": "same_text"}
        try:
            replacement = self._persona_revision(current, draft, evidence)
            self.artifacts.commit(
                replacement,
                expected_revision=current.header.revision,
                op="revise",
                reason="dream persona synthesis",
                source_ids=tuple(replacement.header.lineage.sources),
            )
        except Exception as exc:  # noqa: BLE001 - no partial persona write
            self.logger.warning(
                f"[seekmemory] persona synthesis write failed: {type(exc).__name__}: {exc}"
            )
            return {"status": "failed", "error": type(exc).__name__}
        self.cache.put(replacement)
        return {
            "status": "updated",
            "revision": replacement.header.revision,
            "evidence": len(evidence),
            "usage": {
                "in": int(getattr(response, "usage_in", 0) or 0),
                "cached": int(getattr(response, "usage_cached", 0) or 0),
                "out": int(getattr(response, "usage_out", 0) or 0),
            },
        }

    def _persona_age_days(self, current) -> float | None:
        raw = str(current.header.time.updated or "")
        if not raw:
            return None
        try:
            last = datetime.datetime.fromisoformat(raw)
        except ValueError:
            return None
        now = self.clock()
        if last.tzinfo is not None and now.tzinfo is None:
            now = now.replace(tzinfo=last.tzinfo)
        elif last.tzinfo is None and now.tzinfo is not None:
            last = last.replace(tzinfo=now.tzinfo)
        return max(0.0, (now - last).total_seconds() / 86400.0)

    def _persona_evidence(self) -> list[PersonaEvidence]:
        try:
            from ..maintain.self_impression import promote_self_candidates
        except ImportError:
            from maintain.self_impression import promote_self_candidates

        limit = max(1, int(self._c("persona_synthesis_evidence_limit", 8)))
        out: list[PersonaEvidence] = []
        seen: set[str] = set()

        def add(art: Any, kind: str) -> None:
            if len(out) >= limit or art.header.id in seen:
                return
            try:
                text = content_of(art)
            except Exception:  # noqa: BLE001 - one bad row must not block synthesis
                return
            text = str(text or "").strip()
            if not text:
                return
            out.append(
                PersonaEvidence(
                    id=art.header.id,
                    kind=kind,
                    text=text,
                    source_ids=tuple(art.header.lineage.sources),
                )
            )
            seen.add(art.header.id)

        for art in promote_self_candidates(self.cache, self.sources):
            add(art, "self_impression")

        shared_memories = []
        for art in self.cache.active():
            if art.header.family != "memory":
                continue
            # Shared scope is the existing global-visibility boundary. Do not
            # use private memories for a persona that will be injected into
            # every conversation.
            if art.header.scope != "shared" or art.header.shareable == "secret":
                continue
            level = str(art.payload.get("level") or "")
            if level not in ("scene", "detail", "fact", "impression"):
                continue
            shared_memories.append(art)
        shared_memories.sort(
            key=lambda art: (
                -float(art.header.strength.weight or 0),
                str(art.header.time.updated or ""),
                art.header.id,
            )
        )
        for art in shared_memories:
            add(art, f"memory:{art.payload.get('level')}")
        return out

    def _persona_revision(
        self, current, draft: dict, evidence: list[PersonaEvidence]
    ) -> Any:
        payload = dict(current.payload)
        payload.update(
            {
                "text": draft["persona"],
                "origin": "dream",
                "synthesis": PERSONA_SYNTHESIS_VERSION,
                "style": draft["style"],
                "boundaries": draft["boundaries"],
                "change_reason": draft["change_reason"],
            }
        )
        payload.pop("corpus", None)
        payload.pop("behaviors", None)
        payload.pop("base_text", None)
        source_ids = tuple(
            sorted({source for item in evidence for source in item.source_ids if source})
        )
        derived_from = tuple(item.id for item in evidence)
        confidence = max(
            0.9, min(1.0, float(current.header.strength.confidence or 0.9))
        )
        strength = Strength(
            weight=float(current.header.strength.weight or 1.0),
            confidence=confidence,
            hits=int(current.header.strength.hits or 0) + len(evidence),
        )
        return revise(
            current,
            payload=payload,
            subject_id=SELF_SUBJECT,
            scope="shared",
            shareable="public",
            said_by="inferred",
            lineage=Lineage(sources=source_ids, derived_from=derived_from),
            strength=strength,
        )

    def compact_artifacts(self) -> int:
        """Merge similar active memories through the single maintenance path."""
        try:
            from ..maintain.merge import merge_similar
        except ImportError:
            from maintain.merge import merge_similar
        if self.artifacts is None or self.cache is None:
            return 0
        with self.journal.span("capacity", "compact_artifacts") as metrics:
            merged = merge_similar(self.artifacts, self.cache, threshold=0.6)
            metrics["merged"] = merged
        return merged

    def forget_expired(self, today: str = "") -> int:
        """Forget expired artifacts through the single maintenance path."""
        try:
            from ..maintain.lifecycle import forget_expired
        except ImportError:
            from maintain.lifecycle import forget_expired
        if self.artifacts is None or self.cache is None:
            return 0
        with self.journal.span("capacity", "forget_expired") as metrics:
            forgotten = forget_expired(self.artifacts, self.cache, today)
            metrics["forgotten"] = forgotten
        return forgotten
