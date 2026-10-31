"""Multi-parent ancestry respects edge encoding and independent traversal limits."""
from __future__ import annotations

import unittest
from core.domain.memory.tree import ancestor_ids, parent_ids, tree_child_kind


class Edges:
    def __init__(self, rows):
        self.rows = rows
        self.reads = []

    def tree_parents(self, node_id, limit):
        self.reads.append(node_id)
        found = {other for other, kind, _ in self.rows.get(node_id, [])
                 if other and other != node_id and kind == tree_child_kind(other)}
        return sorted(found)[:limit]


class TreeDomainTest(unittest.TestCase):
    def test_multiple_parents_exclude_child_and_unrelated_edges(self):
        edges = Edges({"child": [
            ("b", tree_child_kind("b"), 1.0),
            ("other", "causal", 1.0),
            ("own-child", tree_child_kind("child"), 1.0),
            ("wrong", tree_child_kind("a"), 1.0),
            ("a", tree_child_kind("a"), 1.0),
            ("a", tree_child_kind("a"), 1.0),
        ]})
        self.assertEqual(parent_ids("child", edges), ("a", "b"))
        self.assertEqual(parent_ids("child", edges, limit=1), ("a",))
        self.assertEqual(parent_ids("", edges), ())
        with self.assertRaises(ValueError):
            parent_ids("child", edges, limit=0)

    def test_breadth_first_depth_visits_and_cycle(self):
        edges = Edges({
            "leaf": [("a", tree_child_kind("a"), 1.0),
                     ("b", tree_child_kind("b"), 1.0)],
            "a": [("root", tree_child_kind("root"), 1.0)],
            "b": [("root", tree_child_kind("root"), 1.0)],
            "root": [("leaf", tree_child_kind("leaf"), 1.0)],
        })
        self.assertEqual(ancestor_ids("leaf", edges), ("a", "b", "root"))
        self.assertEqual(ancestor_ids("leaf", edges, max_depth=1), ("a", "b"))
        self.assertEqual(ancestor_ids("leaf", edges, max_visits=2), ("a", "b"))
        self.assertEqual(ancestor_ids("leaf", edges, max_parents=1), ("a", "root"))
        with self.assertRaises(ValueError):
            ancestor_ids("leaf", edges, max_depth=0)
