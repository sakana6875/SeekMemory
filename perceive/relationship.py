"""Validate relationship observations proposed during extraction."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

try:
    from ..app.contracts import ChatRequest
    from ..core.relationship_rules import (
        EVIDENCE_RULES, RelationshipCandidate, RelationshipReason, RelationshipStrength,
    )
    from ..core.source import Source
except ImportError:
    from app.contracts import ChatRequest
    from core.relationship_rules import (
        EVIDENCE_RULES, RelationshipCandidate, RelationshipReason, RelationshipStrength,
    )
    from core.source import Source

SEPARATOR = "\x1d"


def reason_of(payload: Mapping[str, Any] | None) -> RelationshipReason | None:
    if not isinstance(payload, Mapping):
        return None
    try:
        return RelationshipReason(str(payload.get("relationship_reason") or "").strip())
    except ValueError:
        return None



def signal_of(payload: Mapping[str, Any] | None) -> str:
    """Return the program-derived signal for one validated reason."""
    reason = reason_of(payload)
    return EVIDENCE_RULES[reason].signal.value if reason is not None else ""


def is_relationship_observation(payload: Mapping[str, Any] | None) -> bool:
    return reason_of(payload) is not None


def validate_observation(payload: Mapping[str, Any] | None) -> None:
    """Reject partial, unknown, or model-scored relationship observations."""
    if not isinstance(payload, Mapping):
        raise ValueError("memory payload must be a mapping")
    if payload.get("relationship_signal") not in (None, ""):
        raise ValueError("relationship_signal is program-derived")
    raw_reason = payload.get("relationship_reason")
    raw_strength = payload.get("relationship_strength")
    if raw_reason in (None, "") and raw_strength in (None, ""):
        return
    try:
        RelationshipReason(str(raw_reason or "").strip())
    except ValueError as exc:
        raise ValueError(f"unknown relationship_reason: {raw_reason!r}") from exc
    try:
        RelationshipStrength(str(raw_strength or "").strip())
    except ValueError as exc:
        raise ValueError(f"unknown relationship_strength: {raw_strength!r}") from exc
    if str(payload.get("about") or "") != "relation":
        raise ValueError("relationship observation requires about=relation")


def observation_boundary(
    boundary: str,
    payload: Mapping[str, Any],
    evidence_ids: tuple[str, ...] | list[str],
) -> str:
    reason = reason_of(payload)
    evidence = "|".join(str(value) for value in evidence_ids if str(value))
    return f"{boundary}{SEPARATOR}{reason.value if reason else ''}{SEPARATOR}{evidence}"


@dataclass(frozen=True)
class RelationshipVerdict:
    status: str
    repair_of: str = ""


async def verify_relationship(candidate: RelationshipCandidate, evidence: tuple[Source, ...], model, prior_negative: tuple = ()) -> RelationshipVerdict:
    """Cross-check one candidate without approving identity or scores."""
    lines = [f"{source.id} {source.role}: {source.text}" for source in evidence]
    priors = [f"{item.event_id}: {item.reason}" for item in prior_negative[:3]]
    response = await model.complete(ChatRequest(
        session_id=candidate.session_id, system_prompt=(
            "只返回一个 JSON 对象，字段 reason,source_ids,target,decision,repair_of,stop_source_id。"
            "decision 只能是 verified 或 abstain；target 只能是 assistant、other 或 unknown。"
        ), prompt="\n".join((*lines, f"candidate={candidate.reason.value}", *priors)),
    ))
    parsed = json.loads(response.text)
    if not isinstance(parsed, dict) or parsed.get("decision") not in ("verified", "abstain"):
        raise ValueError("invalid relationship verdict")
    if parsed["decision"] == "abstain":
        return RelationshipVerdict("abstain")
    if parsed.get("reason") != candidate.reason.value or tuple(parsed.get("source_ids") or ()) != candidate.source_ids or parsed.get("target") != "assistant":
        return RelationshipVerdict("abstain")
    return RelationshipVerdict("verified", str(parsed.get("repair_of") or ""))
