"""Bounded multi-parent ancestry over existing parent-scoped tree edges.

基于现有父节点作用域树边的有界多父祖先查询。
"""
from __future__ import annotations

from ...port.tree import TreeEdgeReader

EDGE_PREFIX = "tree_child:"


def tree_child_kind(parent_id: str) -> str:
    """Encode the parent-scoped edge kind / 编码父节点作用域边类型。"""
    return EDGE_PREFIX + parent_id


def parent_ids(node_id: str, edges: TreeEdgeReader, *, limit: int = 8) -> tuple[str, ...]:
    """Return distinct parents encoded on adjacent edges, never child/unrelated edges.

    仅从相邻树边取不同父节点，不把子节点或无关边当作父节点。
    """
    if limit < 1:
        raise ValueError("limit must be positive")
    if not node_id:
        return ()
    return tuple(edges.tree_parents(node_id, limit))


def ancestor_ids(node_id: str, edges: TreeEdgeReader, *, max_depth: int = 3,
                 max_visits: int = 32, max_parents: int = 8) -> tuple[str, ...]:
    """Breadth-first ancestry with path deduplication and independent work limits.

    广度查询祖先，按路径去重并分别限制深度、总访问数和每节点父数。
    """
    if min(max_depth, max_visits, max_parents) < 1:
        raise ValueError("tree limits must be positive")
    found: list[str] = []
    seen = {node_id}
    frontier = [node_id] if node_id else []
    for _ in range(max_depth):
        following: list[str] = []
        for current in frontier:
            for parent in parent_ids(current, edges, limit=max_parents):
                if parent in seen:
                    continue
                seen.add(parent)
                found.append(parent)
                following.append(parent)
                if len(found) >= max_visits:
                    return tuple(found)
        frontier = following
        if not frontier:
            break
    return tuple(found)
