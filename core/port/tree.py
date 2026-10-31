"""Read-only tree edge capability / 树查询所需的只读连接能力。"""

from __future__ import annotations

from typing import Protocol


class TreeEdgeReader(Protocol):
    """Supply stored edges without exposing SQL or cache / 提供已存连接，不暴露 SQL 或缓存。"""

    def tree_parents(self, node_id: str, limit: int) -> list[str]:
        """Read a limited ordered parent ID page / 限量读取排序后的父节点编号。"""
        ...
