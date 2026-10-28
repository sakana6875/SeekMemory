"""Read-only V2 relationship lookup."""

from __future__ import annotations

try:
    from ..core.relationship import RelationshipSnapshot
    from ..app.ports import ArtifactCache
except ImportError:
    from core.relationship import RelationshipSnapshot
    from app.ports import ArtifactCache


class RelationshipReader:
    """Return a neutral snapshot while V2 remains observe-only."""

    def __init__(self, cache: ArtifactCache | None) -> None:
        self.cache = cache

    def get(self, subject_id: str) -> RelationshipSnapshot:
        return RelationshipSnapshot(subject_id=str(subject_id or "").strip())
