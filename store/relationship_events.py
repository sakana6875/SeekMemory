"""Pending and decided relationship event repository."""

from __future__ import annotations

from dataclasses import dataclass

try:
    from .sqlite import SqliteRepository, dump_json, load_json_any, now_iso
except ImportError:
    from sqlite import SqliteRepository, dump_json, load_json_any, now_iso


@dataclass(frozen=True)
class RelationshipEventRow:
    event_id: str
    verifier_version: str
    subject_id: str
    reason: str
    strength: str
    scope: str
    event_at: str
    primary_source_id: str
    source_ids: tuple[str, ...]
    repair_of: str = ""
    origin_artifact_id: str = ""
    origin_revision: int = 0
    status: str = "pending"
    created_at: str = ""
    decided_at: str = ""

class RelationshipEventRepository(SqliteRepository):
    """Own relationship event decisions without copying Source text."""

    def record_pending(self, event: RelationshipEventRow | dict) -> None:
        if isinstance(event, dict):
            event = RelationshipEventRow(**event)
        existing = self._get(event.event_id, event.verifier_version)
        if existing is not None:
            if self._identity(existing) != self._identity(event):
                raise ValueError("relationship event identity conflict")
            return
        with self.conn:
            self.conn.execute(
                "INSERT INTO relationship_events("
                "event_id, verifier_version, subject_id, reason, strength, scope, "
                "event_at, primary_source_id, source_ids, repair_of, "
                "origin_artifact_id, origin_revision, status, created_at, decided_at"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 'pending', ?, '')",
                (
                    event.event_id, event.verifier_version, event.subject_id,
                    event.reason, event.strength, event.scope, event.event_at,
                    event.primary_source_id, dump_json(list(event.source_ids)),
                    event.origin_artifact_id, int(event.origin_revision),
                    event.created_at or now_iso(),
                ),
            )

    def decide(self, event_id: str, verifier_version: str, status: str, repair_of: str = "") -> None:
        if status not in ("verified", "abstain"):
            raise ValueError("invalid relationship verdict")
        existing = self._get(event_id, verifier_version)
        if existing is None:
            raise ValueError("relationship event missing")
        if existing.status == status and existing.repair_of == repair_of:
            return
        if existing.status != "pending":
            raise ValueError("relationship verdict conflict")
        with self.conn:
            self.conn.execute(
                "UPDATE relationship_events SET status = ?, repair_of = ?, decided_at = ? "
                "WHERE event_id = ? AND verifier_version = ? AND status = 'pending'",
                (status, repair_of, now_iso(), event_id, verifier_version),
            )

    def pending(self, limit: int) -> tuple[RelationshipEventRow, ...]:
        rows = self.conn.execute(
            "SELECT * FROM relationship_events WHERE status = 'pending' "
            "ORDER BY event_at, event_id LIMIT ?",
            (max(0, int(limit)),),
        ).fetchall()
        return tuple(self._row(row) for row in rows)

    def by_subject(self, subject_id: str, verifier_version: str) -> tuple[RelationshipEventRow, ...]:
        rows = self.conn.execute(
            "SELECT * FROM relationship_events WHERE subject_id = ? AND verifier_version = ? "
            "ORDER BY event_at, event_id",
            (subject_id, verifier_version),
        ).fetchall()
        return tuple(self._row(row) for row in rows)
    def subjects(self, verifier_version: str) -> tuple[str, ...]:
        rows = self.conn.execute(
            "SELECT DISTINCT subject_id FROM relationship_events WHERE verifier_version = ? AND status = 'verified'",
            (verifier_version,),
        ).fetchall()
        return tuple(str(row["subject_id"]) for row in rows)


    def _get(self, event_id: str, verifier_version: str) -> RelationshipEventRow | None:
        row = self.conn.execute(
            "SELECT * FROM relationship_events WHERE event_id = ? AND verifier_version = ?",
            (event_id, verifier_version),
        ).fetchone()
        return self._row(row) if row is not None else None

    @staticmethod
    def _identity(event: RelationshipEventRow) -> tuple[object, ...]:
        return (
            event.subject_id, event.reason, event.strength, event.scope, event.event_at,
            event.primary_source_id, event.source_ids, event.origin_artifact_id,
            event.origin_revision,
        )

    @staticmethod
    def _row(row) -> RelationshipEventRow:
        return RelationshipEventRow(
            str(row["event_id"]), str(row["verifier_version"]), str(row["subject_id"]),
            str(row["reason"]), str(row["strength"]), str(row["scope"]), str(row["event_at"]),
            str(row["primary_source_id"]), tuple(load_json_any(row["source_ids"], [])),
            str(row["repair_of"] or ""), str(row["origin_artifact_id"] or ""),
            int(row["origin_revision"] or 0), str(row["status"]), str(row["created_at"] or ""),
            str(row["decided_at"] or ""),
        )
