"""Reference lists the semantic validator needs, derived from the project's own SQL seeds.

Nothing is hard-coded here: classes, approved subsystems, taxonomy codes, failure-mode IDs,
source IDs and model designations are parsed from database/*.sql (the single source of truth),
so the validator cannot drift from the database.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from m09 import loaders as L

DEFAULT_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "database")


@dataclass(frozen=True)
class ReferenceData:
    class_names: dict            # EQ-PUMP -> 'Centrifugal Pump'
    class_subsystems: dict       # EQ-PUMP -> frozenset({'Bearing Assembly', ...})  (PENDING_REVIEW list)
    taxonomy: dict               # taxonomy_code -> equipment_class_id
    failure_modes: dict          # FM-051 -> equipment_class_id (or None)
    source_ids: frozenset
    models: dict                 # EQ-PUMP -> frozenset(designations)
    reference_review_status: str = "PENDING_REVIEW"


def load_reference(db_dir: str = DEFAULT_DB_DIR) -> ReferenceData:
    m06 = L.load_m06(db_dir)
    names, subs = {}, {}
    with open(os.path.join(db_dir, L.PROJECT_FILES["seed_ref"]), encoding="utf-8") as fh:
        seed = fh.read()
    for cid, cname in re.findall(r"\('(EQ-[A-Z]+)', '([^']+)', '[^']*', 'PENDING_REVIEW', 'Equipment_Reference'", seed):
        names[cid] = cname
    for r in m06:
        subs.setdefault(r["equipment_class_id"], set()).add(r["subsystem_assembly"].strip())
    tax, vocab = L.load_taxonomy(db_dir)
    _, models, _, _ = L.load_cases(db_dir)
    mdl = {}
    for cls, designation in models:
        mdl.setdefault(cls, set()).add(designation)
    return ReferenceData(
        class_names=names,
        class_subsystems={k: frozenset(v) for k, v in subs.items()},
        taxonomy={t["taxonomy_code"]: t["equipment_class_id"] for t in tax},
        failure_modes={v["failure_mode_id"]: v["equipment_class_id"] for v in vocab},
        source_ids=frozenset(L.load_sources(db_dir)),
        models={k: frozenset(v) for k, v in mdl.items()},
    )
