"""Relationship Artifact payload validation."""

from __future__ import annotations

import math
from typing import Any


def _number(payload: dict[str, Any], key: str, low: float, high: float) -> float:
    value = payload.get(key)
    if isinstance(value, bool):
        raise ValueError(f"relationship.{key} must be numeric")
    number = float(value)
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError(f"relationship.{key} must be within [{low}, {high}]")
    return number


def validate(payload: dict[str, Any]) -> None:
    policy = payload.get("policy")
    if not isinstance(policy, dict):
        raise ValueError("relationship.policy must be an object")
    version = policy.get("version")
    if version == "relationship-v1":
        _number(payload, "affinity", -1.0, 1.0)
        return
    if version != "relationship-v2":
        raise ValueError("unsupported relationship policy")
    for key in ("familiarity", "tension", "stability", "confidence"):
        _number(payload, key, 0.0, 1.0)
    for key in ("trust", "warmth"):
        _number(payload, key, -1.0, 1.0)
    if payload.get("summary") != "关系状态：观察中":
        raise ValueError("relationship summary is fixed during observation")
