"""Pure, versioned rules for relationship evidence consolidation."""

from __future__ import annotations
import hashlib
from datetime import datetime

import math
from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Mapping

from .relationship import RELATIONSHIP_POLICY_VERSION, RelationshipSnapshot


class RelationshipSignal(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    REPAIR = "repair"
    BOUNDARY_VIOLATION = "boundary_violation"


class RelationshipReason(str, Enum):
    FRIENDLY_GREETING = "friendly_greeting"
    GRATITUDE = "gratitude"
    CARE = "care"
    RESPECT = "respect"
    SUPPORT = "support"
    REPAIR = "repair"
    DISRESPECT = "disrespect"
    INSULT = "insult"
    THREAT = "threat"
    HARASSMENT = "harassment"


class RelationshipStrength(str, Enum):
    MILD = "mild"
    STRONG = "strong"


class ConversationScope(str, Enum):
    PRIVATE = "private"
    GROUP = "group"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class EvidenceRule:
    signal: RelationshipSignal
    mild_target: float
    strong_target: float
    max_per_cycle: int


EVIDENCE_RULES: dict[RelationshipReason, EvidenceRule] = {
    RelationshipReason.FRIENDLY_GREETING: EvidenceRule(
        RelationshipSignal.POSITIVE, 0.35, 0.50, 1
    ),
    RelationshipReason.GRATITUDE: EvidenceRule(
        RelationshipSignal.POSITIVE, 0.35, 0.70, 2
    ),
    RelationshipReason.CARE: EvidenceRule(
        RelationshipSignal.POSITIVE, 0.40, 0.75, 1
    ),
    RelationshipReason.RESPECT: EvidenceRule(
        RelationshipSignal.POSITIVE, 0.45, 0.80, 1
    ),
    RelationshipReason.SUPPORT: EvidenceRule(
        RelationshipSignal.POSITIVE, 0.50, 0.85, 1
    ),
    RelationshipReason.REPAIR: EvidenceRule(
        RelationshipSignal.REPAIR, 0.70, 1.00, 1
    ),
    RelationshipReason.DISRESPECT: EvidenceRule(
        RelationshipSignal.NEGATIVE, -0.35, -0.60, 2
    ),
    RelationshipReason.INSULT: EvidenceRule(
        RelationshipSignal.NEGATIVE, -0.50, -0.80, 2
    ),
    RelationshipReason.THREAT: EvidenceRule(
        RelationshipSignal.BOUNDARY_VIOLATION, -0.75, -1.00, 1
    ),
    RelationshipReason.HARASSMENT: EvidenceRule(
        RelationshipSignal.BOUNDARY_VIOLATION, -0.75, -1.00, 1
    ),
}

@dataclass(frozen=True)
class RelationshipCandidate:
    subject_id: str
    reason: RelationshipReason
    strength: RelationshipStrength
    primary_source_id: str
    source_ids: tuple[str, ...]
    session_id: str
    scope: ConversationScope
    origin_artifact_id: str = ""
    origin_revision: int = 0



VERIFIER_VERSION = "relationship-verifier-v2"


def relationship_event_id(candidate: RelationshipCandidate) -> str:
    raw = "\x1f".join((
        "relationship-v2", candidate.subject_id, candidate.reason.value,
        candidate.strength.value, *sorted(candidate.source_ids),
    ))
    return "re_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class VerifiedRelationshipEvent:
    event_id: str
    subject_id: str
    reason: RelationshipReason
    strength: RelationshipStrength
    scope: ConversationScope
    event_at: datetime
    primary_source_id: str
    source_ids: tuple[str, ...]
    repair_of: str = ""


def project_relationship(events: Iterable[VerifiedRelationshipEvent], as_of: datetime, policy: RelationshipScoringPolicy) -> RelationshipSnapshot:
    """Replay verified events at an explicit timezone-aware clock."""
    if as_of.tzinfo is None:
        raise ValueError("relationship projection requires a timezone")
    chosen = sorted((event for event in events if event.event_at <= as_of), key=lambda event: (event.event_at, event.event_id))
    by_primary: dict[str, list[VerifiedRelationshipEvent]] = {}
    for event in chosen:
        by_primary.setdefault(event.primary_source_id, []).append(event)
    accepted = [rows[0] for rows in by_primary.values() if len({row.reason for row in rows}) == 1]
    accepted.sort(key=lambda event: (event.event_at, event.event_id))
    if not accepted:
        return RelationshipSnapshot(evaluated_at=as_of.date().isoformat())
    weights = {ConversationScope.PRIVATE: policy.private_weight, ConversationScope.GROUP: policy.group_weight, ConversationScope.UNKNOWN: policy.unknown_weight}
    warmth_reasons = {RelationshipReason.FRIENDLY_GREETING, RelationshipReason.GRATITUDE, RelationshipReason.CARE, RelationshipReason.SUPPORT, RelationshipReason.REPAIR}
    total = 0.0
    for event in accepted:
        if event.reason not in warmth_reasons:
            continue
        age = max(0, (as_of.date() - event.event_at.date()).days)
        strength = 1 if event.strength == RelationshipStrength.MILD else 2
        total += strength * weights[event.scope] * 2 ** (-age / policy.warmth_half_life_days)
    warmth = max(-1.0, min(1.0, math.tanh(policy.learning_rate * total)))
    trust_positive = {RelationshipReason.RESPECT, RelationshipReason.SUPPORT, RelationshipReason.REPAIR}
    trust_negative = {RelationshipReason.DISRESPECT, RelationshipReason.INSULT, RelationshipReason.THREAT, RelationshipReason.HARASSMENT}
    trust_total = 0.0
    tension_total = 0.0
    for event in accepted:
        age = max(0, (as_of.date() - event.event_at.date()).days)
        strength = 1 if event.strength == RelationshipStrength.MILD else 2
        base = strength * weights[event.scope]
        if event.reason in trust_positive:
            trust_total += base * 2 ** (-age / policy.trust_half_life_days)
        if event.reason in trust_negative:
            trust_total -= base * 2 ** (-age / policy.trust_half_life_days)
            if age <= policy.tension_half_life_days:
                tension_total += base
    return RelationshipSnapshot(
        accepted[-1].subject_id, warmth=round(warmth, 6),
        trust=round(max(-1.0, min(1.0, math.tanh(policy.learning_rate * trust_total))), 6),
        tension=round(max(0.0, min(1.0, 1 - math.exp(-policy.learning_rate * tension_total))), 6),
        evidence_count=len(accepted), last_evidence_at=accepted[-1].event_at.isoformat(),
        evaluated_at=as_of.date().isoformat(),
    )



@dataclass(frozen=True)
class RelationshipObservation:
    artifact_id: str
    subject_id: str
    reason: RelationshipReason
    strength: RelationshipStrength
    confidence: float
    source_ids: tuple[str, ...]
    scope: ConversationScope


@dataclass(frozen=True)
class RelationshipScoringPolicy:
    version: str = RELATIONSHIP_POLICY_VERSION
    verifier_version: str = VERIFIER_VERSION
    learning_rate: float = 0.25
    private_weight: float = 1.0
    group_weight: float = 0.5
    unknown_weight: float = 0.5
    familiarity_half_life_days: float = 180
    trust_half_life_days: float = 180
    warmth_half_life_days: float = 45
    tension_half_life_days: float = 14
    stability_half_life_days: float = 90
    confidence_half_life_days: float = 90
    negative_cooldown_hours: float = 24

    def __post_init__(self) -> None:
        if not isinstance(self.version, str) or not self.version.strip():
            raise ValueError("relationship policy version is required")
        for name in (
            "learning_rate", "private_weight", "group_weight", "unknown_weight",
            "familiarity_half_life_days", "trust_half_life_days", "warmth_half_life_days",
            "tension_half_life_days", "stability_half_life_days", "confidence_half_life_days",
            "negative_cooldown_hours",
        ):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or float(value) < 0:
                raise ValueError(f"{name} must be a non-negative number")
            if name.endswith("weight") or name == "learning_rate":
                if not 0.0 <= float(value) <= 1.0:
                    raise ValueError(f"{name} must be within [0, 1]")


@dataclass(frozen=True)
class ScoredRelationshipEvidence:
    observation: RelationshipObservation
    signal: RelationshipSignal
    effective_target: float


@dataclass(frozen=True)
class RelationshipRevisionPlan:
    target: float
    delta: float
    affinity: float
    confidence: float
    evidence_count: int
    band: RelationshipBand
    counted_artifact_ids: tuple[str, ...]
    reviewed_artifact_ids: tuple[str, ...]
    counted_source_ids: tuple[str, ...]


def score_observation(
    observation: RelationshipObservation,
    policy: RelationshipScoringPolicy = RelationshipScoringPolicy(),
) -> ScoredRelationshipEvidence:
    """Derive signal and scope-weighted target from one categorical observation."""
    try:
        reason = RelationshipReason(observation.reason)
        strength = RelationshipStrength(observation.strength)
        scope = ConversationScope(observation.scope)
    except ValueError as exc:
        raise ValueError("invalid relationship observation vocabulary") from exc
    confidence = _bounded_confidence(observation.confidence)
    if not str(observation.artifact_id or "").strip():
        raise ValueError("relationship observation artifact_id is required")
    if not str(observation.subject_id or "").strip():
        raise ValueError("relationship observation subject_id is required")
    if not observation.source_ids or any(
        not str(source_id or "").strip() for source_id in observation.source_ids
    ):
        raise ValueError("relationship observation source_ids are required")
    rule = EVIDENCE_RULES[reason]
    target = (
        rule.mild_target
        if strength is RelationshipStrength.MILD
        else rule.strong_target
    )
    weight = {
        ConversationScope.PRIVATE: policy.private_weight,
        ConversationScope.GROUP: policy.group_weight,
        ConversationScope.UNKNOWN: policy.unknown_weight,
    }[scope]
    normalized = RelationshipObservation(
        artifact_id=str(observation.artifact_id),
        subject_id=str(observation.subject_id),
        reason=reason,
        strength=strength,
        confidence=confidence,
        source_ids=tuple(dict.fromkeys(str(value) for value in observation.source_ids)),
        scope=scope,
    )
    return ScoredRelationshipEvidence(normalized, rule.signal, target * weight)


def plan_relationship_revision(
    current: RelationshipSnapshot,
    observations: Iterable[RelationshipObservation],
    policy: RelationshipScoringPolicy = RelationshipScoringPolicy(),
    *,
    previously_reviewed_artifact_ids: Iterable[str] = (),
    created_by_artifact_id: Mapping[str, str] | None = None,
) -> RelationshipRevisionPlan | None:
    """Plan one bounded revision from fresh valid evidence, consuming capped rows."""
    previously_reviewed = {
        str(value) for value in previously_reviewed_artifact_ids if str(value)
    }
    scored: list[ScoredRelationshipEvidence] = []
    for observation in observations:
        if str(observation.artifact_id or "") in previously_reviewed:
            continue
        try:
            evidence = score_observation(observation, policy)
        except (TypeError, ValueError):
            continue
        if evidence.observation.subject_id != current.subject_id:
            continue
        if evidence.observation.confidence < policy.minimum_evidence_confidence:
            continue
        scored.append(evidence)
    created = created_by_artifact_id or {}
    scored.sort(
        key=lambda evidence: (
            str(created.get(evidence.observation.artifact_id, "")),
            evidence.observation.artifact_id,
        )
    )
    if not scored:
        return None

    reviewed_ids = tuple(item.observation.artifact_id for item in scored)
    per_reason: dict[RelationshipReason, int] = {}
    counted: list[ScoredRelationshipEvidence] = []
    for evidence in scored:
        reason = evidence.observation.reason
        seen = per_reason.get(reason, 0)
        if seen >= EVIDENCE_RULES[reason].max_per_cycle:
            continue
        per_reason[reason] = seen + 1
        counted.append(evidence)
    if not counted:
        return None

    total_confidence = sum(item.observation.confidence for item in counted)
    target = sum(
        item.effective_target * item.observation.confidence for item in counted
    ) / total_confidence
    raw_delta = policy.learning_rate * (target - current.affinity)
    delta = max(-policy.max_revision_delta, min(policy.max_revision_delta, raw_delta))
    affinity = max(-1.0, min(1.0, current.affinity + delta))
    evidence_count = current.evidence_count + len(counted)
    confidence = evidence_count / (evidence_count + 2.0)
    positive = any(
        item.signal in (RelationshipSignal.POSITIVE, RelationshipSignal.REPAIR)
        for item in counted
    )
    band = band_for(
        affinity,
        confidence,
        previous=current.band,
        positive_evidence=positive,
    )
    counted_ids = tuple(item.observation.artifact_id for item in counted)
    counted_sources = tuple(dict.fromkeys(
        source_id
        for item in counted
        for source_id in item.observation.source_ids
    ))
    return RelationshipRevisionPlan(
        target=target,
        delta=delta,
        affinity=affinity,
        confidence=confidence,
        evidence_count=evidence_count,
        band=band,
        counted_artifact_ids=counted_ids,
        reviewed_artifact_ids=reviewed_ids,
        counted_source_ids=counted_sources,
    )


def _bounded_confidence(value: object) -> float:
    if isinstance(value, bool):
        raise ValueError("relationship evidence confidence must be numeric")
    try:
        confidence = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("relationship evidence confidence must be numeric") from exc
    if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
        raise ValueError("relationship evidence confidence must be within [0, 1]")
    return confidence
