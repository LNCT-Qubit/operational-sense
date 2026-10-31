"""All SQL for M08 lives here, so the pipeline and search logic can be tested with a fake.

Every method expects a connection from db.tenant_connection(), so row-level security
(app.current_org_id) limits every query to one organisation. PostgresRepository has NOT
been run against a live database in the environment where it was written; see
documentation/m08/M08_FINAL_REPORT.md.
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any, Mapping, Optional, Sequence

from . import eligibility
from .errors import StorageError

try:  # psycopg is only needed for the real database
    import psycopg
    _DB_ERRORS: tuple = (psycopg.Error,)
except ImportError:  # pragma: no cover - lets the pure-Python tests run without psycopg
    _DB_ERRORS = ()

CASE_TEXT_COLUMNS = (
    "symptom_text", "symptom_structured", "component_name", "subsystem_source_label",
    "symptom_category", "operating_status", "symptom_frequency",
)


def _wrap(exc: Exception) -> StorageError:
    first = (str(exc).strip().splitlines() or ["unknown error"])[0]
    return StorageError(f"Database operation failed ({type(exc).__name__}): {first}")


class PostgresRepository:
    ALLOWS_MOCK_VECTORS = False   # real database: only real embeddings may be stored or compared

    def __init__(self, conn: Any, organization_id: str):
        self.conn = conn
        self.organization_id = organization_id

    # ---- schema check -------------------------------------------------
    def get_embedding_column_dimension(self) -> Optional[int]:
        """N from historical_case.embedding vector(N); None if the column has no fixed size."""
        try:
            row = self.conn.execute(
                "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
                "WHERE attrelid = 'public.historical_case'::regclass AND attname = 'embedding'"
            ).fetchone()
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None
        if not row:
            raise StorageError("Column historical_case.embedding was not found. Run the migrations first.")
        match = re.fullmatch(r"vector\((\d+)\)", row[0])
        return int(match.group(1)) if match else None

    # ---- ingestion ----------------------------------------------------
    def fetch_cases_for_embedding(self, include_demo: bool, limit: Optional[int] = None) -> list[dict]:
        cond = eligibility.sql_condition("c", include_demo)
        sql = (
            "SELECT c.case_id, c.case_reference, c.organization_id, c.equipment_class_id, "
            "c.subsystem_id, c.equipment_model_id, c.case_status, c.retrieval_eligibility, "
            + ", ".join("c." + col for col in CASE_TEXT_COLUMNS)
            + f" FROM operational_case c WHERE {cond} ORDER BY c.case_reference"
        )
        params: list = []
        if limit is not None:
            sql += " LIMIT %s"
            params.append(int(limit))
        try:
            cur = self.conn.execute(sql, params)
            names = [d.name for d in cur.description]
            return [dict(zip(names, r)) for r in cur.fetchall()]
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None

    def fetch_embedding_state(self) -> dict:
        """case_id -> (model, text_sha256, text_version) for rows that currently hold a vector."""
        try:
            cur = self.conn.execute("SELECT case_id, embedding_model, embedding_text_sha256, embedding_text_version "
                                    "FROM historical_case WHERE embedding IS NOT NULL")
            return {str(r[0]): (r[1], r[2], r[3]) for r in cur.fetchall()}
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None

    def upsert_embedding(self, case: Mapping[str, Any], vector_literal: str, meta: Optional[Mapping[str, Any]] = None) -> None:
        """Insert or update the ONE historical_case row for this case (primary key = case_id)."""
        sql = (
            "INSERT INTO historical_case (case_id, organization_id, equipment_class_id, subsystem_id, "
            "equipment_model_id, status, embedding, embedding_model, embedding_dimension, embedding_text_sha256, "
            "embedding_text_version, embedded_at) VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s, %s, %s, %s, now()) "
            "ON CONFLICT (case_id) DO UPDATE SET "
            "organization_id = EXCLUDED.organization_id, equipment_class_id = EXCLUDED.equipment_class_id, "
            "subsystem_id = EXCLUDED.subsystem_id, equipment_model_id = EXCLUDED.equipment_model_id, "
            "status = EXCLUDED.status, embedding = EXCLUDED.embedding, embedding_model = EXCLUDED.embedding_model, "
            "embedding_dimension = EXCLUDED.embedding_dimension, embedding_text_sha256 = EXCLUDED.embedding_text_sha256, "
            "embedding_text_version = EXCLUDED.embedding_text_version, embedded_at = now()"
        )
        meta = meta or {}
        try:
            self.conn.execute(sql, (
                case["case_id"], case["organization_id"], case["equipment_class_id"],
                case.get("subsystem_id"), case.get("equipment_model_id"),
                case["case_status"], vector_literal, meta.get("model"), meta.get("dimension"),
                meta.get("text_sha256"), meta.get("text_version"),
            ))
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None

    def withdraw_ineligible(self, include_demo: bool) -> int:
        """Clear vectors of cases that are no longer eligible (and mirror their new status)."""
        cond = eligibility.sql_condition("c", include_demo)
        sql = (
            "UPDATE historical_case h SET status = c.case_status, embedding = NULL, embedding_model = NULL, "
            "embedding_dimension = NULL, embedding_text_sha256 = NULL, embedding_text_version = NULL "
            "FROM operational_case c WHERE c.case_id = h.case_id AND h.embedding IS NOT NULL "
            f"AND NOT {cond}"
        )
        try:
            return self.conn.execute(sql).rowcount
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None

    def record_run(self, actor: str, action: str, details: Mapping[str, Any]) -> None:
        """Append one audit_log row (existing table; no schema change needed)."""
        try:
            self.conn.execute(
                "INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details) "
                "VALUES (%s, %s, %s, 'historical_case', NULL, %s::jsonb)",
                (self.organization_id, actor, action, json.dumps(details, default=str)),
            )
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None

    # ---- search -------------------------------------------------------
    def search(self, query_literal: str, *, include_demo: bool, limit: int,
               equipment_class_id: Optional[str] = None, subsystem_id: Optional[int] = None,
               equipment_model_id: Optional[str] = None, taxonomy_code: Optional[str] = None,
               failure_mode_id: Optional[str] = None, is_synthetic: Optional[bool] = None,
               embedding_model: Optional[str] = None) -> list[dict]:
        cond = eligibility.sql_condition("c", include_demo)
        where = [
            "h.embedding IS NOT NULL",
            "h.status = c.case_status",  # ignore a stale status copy in historical_case
            cond,
        ]
        params: dict[str, Any] = {"q": query_literal, "limit": int(limit)}
        if embedding_model is not None:   # never rank vectors produced by a different model together
            where.append("h.embedding_model = %(emb_model)s"); params["emb_model"] = embedding_model
        if equipment_class_id is not None:
            where.append("c.equipment_class_id = %(cls)s"); params["cls"] = equipment_class_id
        if subsystem_id is not None:
            where.append("c.subsystem_id = %(sub)s"); params["sub"] = int(subsystem_id)
        if equipment_model_id is not None:
            where.append("c.equipment_model_id = %(mdl)s"); params["mdl"] = equipment_model_id
        if is_synthetic is not None:
            where.append("c.is_synthetic = %(syn)s"); params["syn"] = bool(is_synthetic)
        if taxonomy_code is not None or failure_mode_id is not None:
            # case_failure_mapping is covered by RLS through its parent case; values are bound parameters.
            sub = ["m.case_id = c.case_id"]
            if taxonomy_code is not None:
                sub.append("m.taxonomy_code = %(tax)s"); params["tax"] = taxonomy_code
            if failure_mode_id is not None:
                sub.append("m.failure_mode_id = %(fm)s"); params["fm"] = failure_mode_id
            where.append("EXISTS (SELECT 1 FROM case_failure_mapping m WHERE " + " AND ".join(sub) + ")")
        sql = (
            "SELECT c.case_id, c.case_reference, c.case_status, c.retrieval_eligibility, "
            "c.equipment_class_id, c.subsystem_id, c.subsystem_source_label, c.equipment_model_id, "
            "c.component_name, c.symptom_category, c.symptom_text, c.symptom_structured, "
            "c.source_reliability, c.is_synthetic, c.primary_suspected_cause, c.corrective_action_text, "
            "1 - (h.embedding <=> %(q)s::vector) AS similarity "
            "FROM historical_case h JOIN operational_case c ON c.case_id = h.case_id "
            "WHERE " + " AND ".join(where) +
            " ORDER BY h.embedding <=> %(q)s::vector, c.case_reference LIMIT %(limit)s"
        )
        try:
            cur = self.conn.execute(sql, params)
            names = [d.name for d in cur.description]
            return [dict(zip(names, r)) for r in cur.fetchall()]
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None

    def fetch_steps(self, case_ids: Sequence[Any]) -> dict[str, list[dict]]:
        """Steps keyed by str(case_id)."""
        if not case_ids:
            return {}
        try:
            cur = self.conn.execute(
                "SELECT case_id, step_number, tier, diagnostic_question, check_measurement, "
                "required_instrument, safety_warning, supervisor_approval_required "
                "FROM troubleshooting_step WHERE case_id = ANY(%s) ORDER BY case_id, step_number",
                ([uuid.UUID(str(c)) for c in case_ids],),  # uuid[] so "= ANY" compares uuid with uuid
            )
            names = [d.name for d in cur.description]
            out: dict[str, list[dict]] = {}
            for r in cur.fetchall():
                row = dict(zip(names, r))
                out.setdefault(str(row["case_id"]), []).append(row)
            return out
        except _DB_ERRORS as exc:
            raise _wrap(exc) from None
