"""MOCK test doubles for M08. NOTHING here is a real embedding model or a real database.

HashingBackend turns words into vector slots, so texts that share words get similar
vectors. That is enough to test ranking mechanics, filters, eligibility and error
handling. It says NOTHING about how well a real multilingual model understands
paraphrases or Hinglish; that must be measured with the evaluation runner.
"""
from __future__ import annotations

import math
import re
import zlib
import uuid

from retrieval import eligibility
from retrieval.embedding_config import EmbeddingSettings
from retrieval.errors import StorageError

DIM = 256


def small_settings(**overrides) -> EmbeddingSettings:
    base = dict(provider="fake", model="fake-hashing-256", dimension=DIM,
                query_prefix="query: ", document_prefix="passage: ", batch_size=4)
    base.update(overrides)
    return EmbeddingSettings(**base)


class HashingBackend:
    is_mock = True   # MOCK: refused by real repositories (see retrieval.embedder.EmbeddingService.require_real)

    def __init__(self, dim: int = DIM):
        self.dim = dim
        self.seen_texts: list[str] = []   # lets tests check that prefixes were applied

    def encode(self, texts):
        out = []
        for text in texts:
            self.seen_texts.append(text)
            vec = [0.0] * self.dim
            for tok in re.findall(r"[a-z0-9]+", text.lower()):
                if tok in ("query", "passage"):   # prefixes carry no meaning here
                    continue
                vec[zlib.crc32(tok.encode()) % self.dim] += 1.0
            out.append(vec)
        return out


class BrokenBackend:
    """Simulates an unavailable provider."""
    def encode(self, texts):
        raise ConnectionError("simulated provider outage")


class WrongDimensionBackend:
    def encode(self, texts):
        return [[1.0, 0.0, 0.0] for _ in texts]


def make_case(ref, symptom, *, cls="EQ-PUMP", status="VERIFIED", elig="eligible", subsystem_id=None,
              component="Rolling Element Bearing", category="Noise", **extra):
    row = {
        "case_id": str(uuid.uuid5(uuid.NAMESPACE_URL, ref)), "case_reference": ref,
        "organization_id": "00000000-0000-0000-0000-000000000001", "equipment_class_id": cls,
        "subsystem_id": subsystem_id, "subsystem_source_label": "Bearing Assembly",
        "equipment_model_id": None, "case_status": status, "retrieval_eligibility": elig,
        "symptom_text": symptom, "symptom_structured": None, "component_name": component,
        "symptom_category": category, "operating_status": None, "symptom_frequency": None,
        "source_reliability": "D", "is_synthetic": True,
        "primary_suspected_cause": f"suspected cause of {ref}", "corrective_action_text": f"action for {ref}",
    }
    row.update(extra)
    return row


class InMemoryRepository:
    """MOCK repository with the same methods as PostgresRepository. Uses the same
    eligibility constants, but it is NOT a test of the real SQL."""

    ALLOWS_MOCK_VECTORS = True    # in-memory test store only; PostgresRepository is False

    def __init__(self, cases, column_dim=DIM):
        self.cases = list(cases)
        self.column_dim = column_dim
        self.historical: dict[str, dict] = {}
        self.audit: list[dict] = []
        self.steps: dict[str, list[dict]] = {}
        self.mappings: dict[str, list[tuple]] = {}   # case_id -> [(taxonomy_code, failure_mode_id)]
        self.fail_on: set[str] = set()
        self.upsert_calls = 0
        self.last_search_args = None

    def _maybe_fail(self, name):
        if name in self.fail_on:
            raise StorageError(f"simulated database failure in {name}")

    def get_embedding_column_dimension(self):
        self._maybe_fail("get_embedding_column_dimension")
        return self.column_dim

    def fetch_cases_for_embedding(self, include_demo, limit=None):
        self._maybe_fail("fetch_cases_for_embedding")
        rows = [c for c in self.cases if eligibility.evidence_level(
            c["case_status"], c["retrieval_eligibility"], include_demo=include_demo)]
        rows.sort(key=lambda c: c["case_reference"])
        return rows[:limit] if limit else rows

    def fetch_embedding_state(self):
        return {cid: (h.get("embedding_model"), h.get("embedding_text_sha256"), h.get("embedding_text_version"))
                for cid, h in self.historical.items() if h["embedding"] is not None}

    def upsert_embedding(self, case, vector_literal, meta=None):
        self._maybe_fail("upsert_embedding")
        self.upsert_calls += 1
        vec = [float(x) for x in vector_literal.strip("[]").split(",")]
        meta = meta or {}
        self.historical[case["case_id"]] = {"status": case["case_status"], "embedding": vec,
            "embedding_model": meta.get("model"), "embedding_text_sha256": meta.get("text_sha256"),
            "embedding_text_version": meta.get("text_version")}

    def withdraw_ineligible(self, include_demo):
        n = 0
        by_id = {c["case_id"]: c for c in self.cases}
        for cid, h in self.historical.items():
            c = by_id[cid]
            if h["embedding"] is not None and not eligibility.evidence_level(
                    c["case_status"], c["retrieval_eligibility"], include_demo=include_demo):
                h["embedding"], h["status"] = None, c["case_status"]; n += 1
        return n

    def record_run(self, actor, action, details):
        self._maybe_fail("record_run")
        self.audit.append({"actor": actor, "action": action, "details": dict(details)})

    def search(self, query_literal, *, include_demo, limit, equipment_class_id=None,
               subsystem_id=None, equipment_model_id=None, taxonomy_code=None,
               failure_mode_id=None, is_synthetic=None, embedding_model=None):
        self._maybe_fail("search")
        self.last_search_args = dict(include_demo=include_demo, limit=limit)
        q = [float(x) for x in query_literal.strip("[]").split(",")]
        by_id = {c["case_id"]: c for c in self.cases}
        hits = []
        for cid, h in self.historical.items():
            c = by_id[cid]
            if h["embedding"] is None or h["status"] != c["case_status"]:
                continue
            if embedding_model is not None and h.get("embedding_model") not in (None, embedding_model):
                continue    # vector from another model: never mixed into this ranking
            if not eligibility.evidence_level(c["case_status"], c["retrieval_eligibility"], include_demo=include_demo):
                continue
            if equipment_class_id and c["equipment_class_id"] != equipment_class_id:
                continue
            if subsystem_id is not None and c["subsystem_id"] != subsystem_id:
                continue
            if equipment_model_id is not None and c.get("equipment_model_id") != equipment_model_id:
                continue
            if is_synthetic is not None and c.get("is_synthetic") != is_synthetic:
                continue
            if taxonomy_code is not None or failure_mode_id is not None:
                maps = self.mappings.get(c["case_id"], [])
                if not any((taxonomy_code is None or m[0] == taxonomy_code) and
                           (failure_mode_id is None or m[1] == failure_mode_id) for m in maps):
                    continue
            sim = sum(a * b for a, b in zip(q, h["embedding"]))   # both are unit length
            hits.append(dict(c, similarity=sim))
        hits.sort(key=lambda r: (-r["similarity"], r["case_reference"]))
        return hits[:limit]

    def fetch_steps(self, case_ids):
        self._maybe_fail("fetch_steps")
        return {cid: self.steps[cid] for cid in case_ids if cid in self.steps}
