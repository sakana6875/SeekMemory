"""Replayable relationship snapshots."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


RELATIONSHIP_POLICY_VERSION = "relationship-v2"
SUMMARY = "关系状态：观察中"


@dataclass(frozen=True)
class RelationshipSnapshot:
    subject_id: str = ""
    familiarity: float = 0.0
    trust: float = 0.0
    warmth: float = 0.0
    tension: float = 0.0
    stability: float = 0.0
    confidence: float = 0.0
    evidence_count: int = 0
    last_evidence_at: str = ""
    evaluated_at: str = ""
    artifact_id: str = ""
    revision: int = 0


def relationship_id(subject_id: str) -> str:
    digest = hashlib.sha256(str(subject_id or "").encode("utf-8")).hexdigest()[:24]
    return f"relationship_{digest}"
