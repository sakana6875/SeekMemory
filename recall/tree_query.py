"""Bounded multi-parent tree search; only ranked IDs and counters leave this stage.

有界多父树查询；只输出排序编号和统计，不披露正文或写入。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

try:
    from ..core.domain.memory.artifact import Artifact
    from ..app.ports import ArtifactStore, SourceStore
    from .score import score
except ImportError:
    from core.domain.memory.artifact import Artifact
    from app.ports import ArtifactStore, SourceStore
    from recall.score import score


class LegacyTreeGap(RuntimeError):
    """Legacy parent-only links require an explicit migration / 旧父字段缺边需要明确迁移。"""


class TreeLookup(Protocol):
    """TreeService read surface / TreeService 只读能力。"""

    def legacy_gap_count(self) -> int: ...
    def parents(self, node_id: str, *, limit: int = 8) -> tuple[str, ...]: ...
    def children(self, node_id: str, *, limit: int = 8) -> list[Artifact]: ...


@dataclass(frozen=True)
class TreeQueryLimits:
    """Independent internal limits; not public settings / 独立的内部上限，非公开配置。"""

    anchors: int = 2
    depth: int = 3
    children: int = 6
    siblings: int = 2
    parents: int = 4
    visits: int = 48
    total: int = 8


@dataclass(frozen=True)
class TreeQueryResult:
    """Ranked IDs and aggregate, content-free diagnostics / 排序编号及无正文汇总。"""

    ids: tuple[str, ...] = ()
    parents: int = 0
    children: int = 0
    siblings: int = 0
    rejected: dict[str, int] = field(default_factory=dict)
    collateral: int = 0
    visits: int = 0

    def info(self) -> dict:
        """Return counters only / 仅返回统计。"""
        return {"expanded": len(self.ids), "parents": self.parents,
                "children": self.children, "siblings": self.siblings,
                "collateral": self.collateral, "visits": self.visits,
                "rejected": dict(self.rejected)}


def expand_tree(anchors: list[Artifact], eligible: list[Artifact], tree: TreeLookup,
                artifacts: ArtifactStore, sources: SourceStore,
                limits: TreeQueryLimits = TreeQueryLimits(), *, text: str = "",
                signals: dict[str, tuple[float, float]] | None = None) -> TreeQueryResult:
    """Rank safe ancestors, descendants and collateral evidence from multiple paths.

    多路径查询祖先、后代及旁支证据；越界或异常由调用方回退平面召回。
    """
    if tree.legacy_gap_count():
        raise LegacyTreeGap("unmigrated legacy tree links")
    pool = {art.header.id: art for art in eligible if art.header.family == "memory"}
    anchor_ids = {art.header.id for art in anchors}
    rejected: dict[str, int] = {}
    # ID -> best score, role, distance, distinct path count.
    matches: dict[str, tuple[float, str, int, int]] = {}
    visits = 0

    def reject(reason: str) -> None:
        rejected[reason] = rejected.get(reason, 0) + 1

    def accept(node_id: str, anchor: Artifact, role: str, distance: int) -> bool:
        nonlocal visits
        if visits >= limits.visits:
            reject("visit_limit")
            return False
        visits += 1
        art = pool.get(node_id)
        if art is None:
            reject("not_eligible")
            return False
        if (art.header.subject_id, art.header.scope) != (anchor.header.subject_id, anchor.header.scope):
            reject("identity")
            return False
        current = artifacts.get(node_id)
        if (current is None or current.header.revision != art.header.revision
                or current.header.state != "active" or current.header.family != "memory"
                or (current.header.subject_id, current.header.scope) !=
                (anchor.header.subject_id, anchor.header.scope)):
            reject("stale")
            return False
        evidence = set(current.header.lineage.sources)
        if not evidence or len(sources.sources_by_ids(list(evidence))) != len(evidence):
            reject("evidence")
            return False
        if node_id not in anchor_ids:
            activation, lexical = (signals or {}).get(node_id, (0.0, 0.0))
            relevance = min(5.0, max(0.0, score(art, text, activation, 0.0)
                                       + max(0.0, lexical)))
            proximity = {"parent": 1.2, "child": 1.0, "sibling": 0.7,
                         "collateral": 0.4}[role] / max(1, distance)
            overlap = 0.25 if evidence.intersection(anchor.header.lineage.sources) else 0.0
            value = 0.7 * relevance + proximity + overlap
            old = matches.get(node_id)
            count = min(3, (old[3] if old else 0) + 1)
            if old is None or value > old[0]:
                matches[node_id] = (value, role, distance, count)
            else:
                matches[node_id] = (*old[:3], count)
        return True

    def downward(anchor: Artifact, start: str, depth: int, role: str,
                 distance: int, blocked: frozenset[str], allowance: int) -> None:
        nonlocal visits
        queue = [(start, 0, blocked)]
        checked = 0
        while queue and checked < allowance and visits < limits.visits:
            node, level, path = queue.pop(0)
            if level >= depth:
                continue
            # Read only a bounded slice of each returned neighborhood.
            for child in tree.children(node, limit=max(1, min(limits.children, allowance - checked))):
                if visits >= limits.visits:
                    break
                checked += 1
                cid = child.header.id
                if cid in path:
                    visits += 1
                    reject("cycle")
                    continue
                if accept(cid, anchor, role, distance + level + 1):
                    queue.append((cid, level + 1, path | {cid}))

    for anchor in anchors[:max(0, limits.anchors)]:
        if anchor.header.family != "memory" or visits >= limits.visits:
            break
        frontier = [(anchor.header.id, 0, frozenset({anchor.header.id}))]
        branches: list[tuple[str, str, int, frozenset[str]]] = []
        while frontier and visits < limits.visits:
            node, level, path = frontier.pop(0)
            if level >= limits.depth:
                continue
            for parent in tree.parents(node, limit=limits.parents):
                if visits >= limits.visits:
                    break
                if parent in path:
                    visits += 1
                    reject("cycle")
                    continue
                if accept(parent, anchor, "parent", level + 1):
                    next_path = path | {parent}
                    frontier.append((parent, level + 1, next_path))
                    branches.append((parent, node, level + 1, next_path))
        downward(anchor, anchor.header.id, limits.depth, "child", 0,
                 frozenset({anchor.header.id}), limits.children)
        for parent, direct, level, path in branches:
            if visits >= limits.visits:
                break
            if level + 1 > limits.depth:
                continue
            inspected = 0
            for sibling in tree.children(parent, limit=max(1, limits.siblings + 1)):
                if inspected >= limits.siblings or visits >= limits.visits:
                    break
                cid = sibling.header.id
                if cid == direct:
                    continue
                inspected += 1
                if cid in path:
                    visits += 1
                    reject("cycle")
                    continue
                role = "sibling" if level == 1 else "collateral"
                if accept(cid, anchor, role, level + 1):
                    downward(anchor, cid, min(1, limits.depth - level - 1),
                             "collateral", level + 1,
                             path | {cid}, limits.children)

    ranked = sorted(matches, key=lambda node_id: (
        -(matches[node_id][0] + 0.15 * (matches[node_id][3] - 1)),
        matches[node_id][2], node_id))[:max(0, limits.total)]
    counts = {role: sum(matches[node_id][1] == role for node_id in ranked)
              for role in ("parent", "child", "sibling", "collateral")}
    return TreeQueryResult(tuple(ranked), counts["parent"], counts["child"],
                           counts["sibling"], rejected, counts["collateral"], visits)
