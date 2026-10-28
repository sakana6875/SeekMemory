"""Relationship runtime isolation tests."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class RelationshipRuntimeIsolationTest(unittest.TestCase):
    def test_runtime_core_contains_no_relationship_semantics(self) -> None:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root, "app", "runtime", "runtime.py"), encoding="utf-8") as handle:
            source = handle.read()
        self.assertNotIn("relationship", source.lower())
        self.assertNotIn("InteractionGate", source)


if __name__ == "__main__":
    unittest.main()
