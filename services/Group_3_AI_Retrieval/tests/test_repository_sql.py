"""Checks the SQL TEXT and parameters PostgresRepository sends, using a recording fake
connection. This does NOT execute SQL: real PostgreSQL verification is still required
(scripts/verify_m08_retrieval.sql and the setup guide)."""
import unittest
from unittest import mock

from retrieval import repository
from retrieval.errors import StorageError
from retrieval.repository import PostgresRepository


class _Cursor:
    def __init__(self, rows=(), names=()):
        self._rows, self.description, self.rowcount = list(rows), [mock.Mock(**{"name": n}) for n in names], 3
        for d, n in zip(self.description, names):
            d.name = n
    def fetchall(self): return self._rows
    def fetchone(self): return self._rows[0] if self._rows else None


class _Conn:
    def __init__(self, cursor=None, error=None):
        self.calls, self._cursor, self._error = [], cursor or _Cursor(), error
    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if self._error:
            raise self._error
        return self._cursor


class RepositorySqlTests(unittest.TestCase):
    def test_search_sql_applies_eligibility_cosine_order_and_limit_with_bound_values(self):
        conn = _Conn(_Cursor([], ["case_id"]))
        PostgresRepository(conn, "org").search("[0.1,0.2]", include_demo=False, limit=3,
                                               equipment_class_id="EQ-PUMP'; DROP TABLE x;--", subsystem_id=4)
        sql, params = conn.calls[0]
        self.assertIn("h.embedding <=> %(q)s::vector", sql)
        self.assertIn("c.case_status IN ('VERIFIED')", sql)
        self.assertNotIn("DRAFT", sql)
        self.assertIn("h.status = c.case_status", sql)
        self.assertIn("LIMIT %(limit)s", sql)
        self.assertNotIn("DROP TABLE", sql)                       # user text only travels as a parameter
        self.assertEqual(params["cls"], "EQ-PUMP'; DROP TABLE x;--")
        self.assertEqual(params["q"], "[0.1,0.2]")

    def test_search_with_demo_includes_draft_condition(self):
        conn = _Conn(_Cursor([], ["case_id"]))
        PostgresRepository(conn, "org").search("[1]", include_demo=True, limit=3)
        self.assertIn("'DRAFT', 'SUBMITTED'", conn.calls[0][0])

    def test_upsert_is_on_conflict_update_by_case_id(self):
        conn = _Conn()
        PostgresRepository(conn, "org").upsert_embedding(
            {"case_id": "c", "organization_id": "o", "equipment_class_id": "EQ-PUMP", "case_status": "VERIFIED"}, "[1]")
        sql, params = conn.calls[0]
        self.assertIn("ON CONFLICT (case_id) DO UPDATE", sql)
        self.assertIn("[1]", params)                       # vector literal is a bound parameter
        self.assertNotIn("[1]", sql)                       # never interpolated into the SQL text
        self.assertIn("embedding_model", sql)              # provenance stored with the vector (migration 008)

    def test_column_dimension_parsed(self):
        for text, expected in (("vector(384)", 384), ("vector", None)):
            repo = PostgresRepository(_Conn(_Cursor([(text,)])), "org")
            self.assertEqual(repo.get_embedding_column_dimension(), expected)

    def test_missing_column_is_a_clear_storage_error(self):
        with self.assertRaises(StorageError):
            PostgresRepository(_Conn(_Cursor([])), "org").get_embedding_column_dimension()

    def test_database_errors_are_wrapped(self):
        class FakeDbError(Exception):
            pass
        with mock.patch.object(repository, "_DB_ERRORS", (FakeDbError,)):
            repo = PostgresRepository(_Conn(error=FakeDbError("connection lost\nsecret detail")), "org")
            with self.assertRaises(StorageError) as ctx:
                repo.search("[1]", include_demo=False, limit=3)
        self.assertIn("connection lost", str(ctx.exception))
        self.assertNotIn("secret detail", str(ctx.exception))   # only the first line is kept

    def test_audit_row_uses_existing_audit_log_columns(self):
        conn = _Conn()
        PostgresRepository(conn, "org-1").record_run("tester", "EMBEDDING_RUN", {"model": "m"})
        sql, params = conn.calls[0]
        self.assertIn("INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details)", sql)
        self.assertEqual(params[0], "org-1")


if __name__ == "__main__":
    unittest.main()
