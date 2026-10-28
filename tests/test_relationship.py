"""Relationship scoring, extraction, consolidation, and validation tests."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import unittest
from unittest.mock import patch
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from adapters.relationship_policy import RelationshipReader
from app.contracts import DialogueTurn
from core.artifact import Lineage, Strength, TimeSpan, content_of, make, validate
from core.relationship import RelationshipSnapshot
from core.relationship_rules import (
    ConversationScope, RelationshipReason, RelationshipScoringPolicy,
    RelationshipStrength, VerifiedRelationshipEvent, project_relationship,
)
from core.source import Source
from maintain.relationship import consolidate_relationships
from perceive.absorb import build_plan
from perceive.relationship import signal_of
from services.maintenance_service import MaintenanceService
from store import open_store
from store.cache import Cache


def relationship_payload(**updates):
    payload = {
        "summary": "关系状态：观察中", "familiarity": 0.0, "trust": 0.0,
        "warmth": 0.0, "tension": 0.0, "stability": 0.0, "confidence": 0.0,
        "evidence_count": 0, "last_evidence_at": "", "evaluated_at": "2026-10-26",
        "policy": {"version": "relationship-v2"},
    }
    payload.update(updates)
    return payload




class RelationshipCoreTest(unittest.TestCase):
    def test_relationship_artifact_requires_v2_dimensions(self) -> None:
        art = make("relationship", relationship_payload(), subject_id="u1")
        validate(art)
        self.assertEqual(content_of(art), "关系状态：观察中")
        with self.assertRaises(ValueError):
            validate(make("relationship", relationship_payload(warmth=2), subject_id="u1"))

    def test_projection_is_deterministic_and_decays(self) -> None:
        from datetime import datetime, timedelta, timezone
        now = datetime(2026, 10, 26, tzinfo=timezone.utc)
        event = VerifiedRelationshipEvent("e", "u1", RelationshipReason.GRATITUDE, RelationshipStrength.MILD, ConversationScope.PRIVATE, now, "s", ("s",))
        first = project_relationship([event], now, RelationshipScoringPolicy())
        later = project_relationship([event], now + timedelta(days=45), RelationshipScoringPolicy())
        self.assertGreater(first.warmth, 0)
        self.assertLess(later.warmth, first.warmth)
        self.assertEqual(first.tension, 0)



class RelationshipExtractionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.turn = DialogueTurn(
            "bot:FriendMessage:u1",
            "u1",
            "user",
            "早安呀",
            "2026-10-26T08:00:00",
            "s1",
            "topic-1",
        )

    def _raw(self, **updates) -> str:
        item = {
            "level": "scene",
            "text": "对机器人友好问候",
            "about": "relation",
            "subject_kind": "speaker",
            "subject_id": "u1",
            "confidence": 0.95,
            "relationship_reason": "friendly_greeting",
            "relationship_strength": "mild",
            "relationship_actor_source_id": "s1",
            "evidence_source_ids": ["s1"],
        }
        item.update(updates)
        return json.dumps([item], ensure_ascii=False)

    def test_relationship_candidate_is_not_memory_artifact(self) -> None:
        plan = build_plan([self.turn], [self.turn], self._raw(), None, strict=True)
        self.assertEqual(plan.artifacts, ())
        self.assertEqual(len(plan.relationship_candidates), 1)
        candidate = plan.relationship_candidates[0]
        self.assertEqual(candidate.subject_id, "u1")
        self.assertEqual(candidate.primary_source_id, "s1")
        self.assertEqual(candidate.source_ids, ("s1",))

    def test_model_signal_is_rejected_and_missing_evidence_is_retryable(self) -> None:
        signaled = build_plan(
            [self.turn], [self.turn], self._raw(relationship_signal="positive"), None
        )
        missing = build_plan(
            [self.turn], [self.turn], self._raw(evidence_source_ids=[]), None
        )
        self.assertTrue(signaled.outcome.model_failed)
        self.assertTrue(missing.outcome.model_failed)

    def test_relationship_candidates_reject_mixed_speakers_and_dedupe(self) -> None:
        second = DialogueTurn(
            "bot:FriendMessage:u1", "other", "user", "鱼，你真蠢",
            "2026-10-26T08:00:00", "s2", "topic-1",
        )
        raw = json.dumps([{
            "about": "relation", "relationship_reason": "insult",
            "relationship_strength": "strong", "relationship_actor_source_id": "s1",
            "evidence_source_ids": ["s1", "s2"],
        }])
        wrong = build_plan([self.turn, second], [self.turn, second], raw, None)
        duplicate = build_plan(
            [self.turn], [self.turn], json.dumps(json.loads(self._raw()) * 2), None
        )
        self.assertTrue(wrong.outcome.retryable)
        self.assertEqual(wrong.relationship_candidates, ())
        self.assertEqual(len(duplicate.relationship_candidates), 1)







if __name__ == "__main__":
    unittest.main()
