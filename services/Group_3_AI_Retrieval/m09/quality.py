"""Offline data-quality checks over the synthetic dataset found in the project SQL files.

Every check returns {id, severity, status, title, detail}. status: PASS | FAIL | WARN | INFO.
These are STRUCTURAL checks. They cannot judge industrial correctness; that needs a domain expert.
"""
import collections
import itertools
import os
import re
from . import loaders as L

REQUIRED_CASE_FIELDS = ["case_reference", "equipment_class_id", "model_designation", "subsystem_source_label",
                        "component_name", "symptom_text", "primary_suspected_cause", "failure_mechanism",
                        "corrective_action_text", "post_repair_verification"]
EXPECTED = {"cases": 50, "steps": 350, "steps_per_case": 7,
            "class_counts": {"EQ-PUMP": 17, "EQ-MOTOR": 17, "EQ-COMP": 16}}
TOKEN = re.compile(r"[a-z]{3,}")


def _tok(c):
    return set(TOKEN.findall((c["symptom_text"] + " " + (c["primary_suspected_cause"] or "")).lower()))


def near_duplicates(cases, threshold=0.6):
    """Pairs with token-Jaccard >= threshold on symptom + suspected cause, split into same/cross class."""
    same, cross = [], []
    toks = {c["case_reference"]: _tok(c) for c in cases}
    for a, b in itertools.combinations(cases, 2):
        ta, tb = toks[a["case_reference"]], toks[b["case_reference"]]
        j = len(ta & tb) / len(ta | tb) if ta | tb else 0.0
        if j >= threshold:
            (same if a["equipment_class_id"] == b["equipment_class_id"] else cross).append(
                (a["case_reference"], b["case_reference"], round(j, 2)))
    return same, cross


def resolve_subsystems(cases, m06_rows):
    """Exact (case-insensitive, trimmed) label match against the subsystems listed for the case's class.
    This mirrors sql/m09/m09_010_resolve_subsystem_fk.sql. Returns (resolved_refs, unresolved_refs)."""
    allowed = collections.defaultdict(set)
    for m in m06_rows:
        allowed[m["equipment_class_id"]].add(m["subsystem_assembly"].strip().lower())
    ok, bad = [], []
    for c in cases:
        lab = (c["subsystem_source_label"] or "").strip().lower()
        (ok if lab and lab in allowed[c["equipment_class_id"]] else bad).append(c["case_reference"])
    return ok, bad


def spare_links_resolution(spare_links, spare_parts):
    """For each (case, part_name) link: how many spare rows the CASE-SPECIFIC join matches, and how many the
    original part_name-only join matched."""
    out = []
    for sl in spare_links:
        by_name = [p for p in spare_parts if p["part_name"] == sl["part_name"]]
        specific = [p for p in by_name if sl["case_reference"] in (p["compatibility_note"] or "")]
        out.append((sl["case_reference"], sl["part_name"], len(by_name), len(specific)))
    return out


def run(project):
    f = []

    def add(i, sev, status, title, detail=""):
        f.append({"id": i, "severity": sev, "status": status, "title": title, "detail": detail})

    cases, models, defaults, sets_sub = L.load_cases(project)
    steps = L.load_steps(project)
    tax, vocab = L.load_taxonomy(project)
    m06 = L.load_m06(project)
    seed, spare_links = L.load_links(project)
    spare_parts = L.load_spare_parts(project)
    safety = L.load_safety(project)
    sources = set(L.load_sources(project))
    refs = [c["case_reference"] for c in cases]
    ctr = collections.Counter(c["equipment_class_id"] for c in cases)

    add("Q01", "High", "PASS" if len(cases) == EXPECTED["cases"] else "FAIL", "Case count", "%d cases (expected 50)" % len(cases))
    add("Q02", "High", "PASS" if len(steps) == EXPECTED["steps"] else "FAIL", "Step count", "%d steps (expected 350)" % len(steps))
    dups = [k for k, v in collections.Counter(refs).items() if v > 1]
    add("Q03", "High", "PASS" if not dups else "FAIL", "Unique case references", "duplicates: %s" % dups)
    add("Q04", "Medium", "PASS" if dict(ctr) == EXPECTED["class_counts"] else "FAIL", "Cases per equipment class", str(dict(ctr)))

    blanks = {k: [c["case_reference"] for c in cases if c.get(k) in (None, "") or (isinstance(c.get(k), str) and not c[k].strip())]
              for k in REQUIRED_CASE_FIELDS}
    blanks = {k: v for k, v in blanks.items() if v}
    add("Q05", "Medium", "FAIL" if blanks else "PASS", "Required case fields populated",
        "; ".join("%s blank in %d cases" % (k, len(v)) for k, v in blanks.items()) or "all populated")

    defined = {(c, d) for c, d in models}
    missing_models = [c["case_reference"] for c in cases if (c["equipment_class_id"], c["model_designation"]) not in defined]
    add("Q06", "High", "PASS" if not missing_models else "FAIL", "Every case model exists in the model list",
        "missing: %s; %d models defined, all illustrative" % (missing_models, len(models)))

    refset = set(refs)
    orphan = [s["step_reference"] for s in steps if s["case_reference"] not in refset]
    per = collections.defaultdict(list)
    for s in steps:
        per[s["case_reference"]].append(s)
    bad_order = [r for r, ss in per.items() if sorted(x["step_number"] for x in ss) != list(range(1, EXPECTED["steps_per_case"] + 1))]
    no_steps = sorted(refset - set(per))
    add("Q07", "High", "PASS" if not (orphan or bad_order or no_steps) else "FAIL", "Steps link to cases, numbered 1..7",
        "orphans=%d, bad numbering=%s, cases without steps=%s" % (len(orphan), bad_order, no_steps))
    badtier = [s["step_reference"] for s in steps if s["tier"] != {1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 3}[s["step_number"]]]
    add("Q08", "Medium", "PASS" if not badtier else "FAIL", "Tier pattern 1,1,1,2,2,2,3", "violations: %s" % badtier[:5])
    t3 = [s for s in steps if s["tier"] == 3 and s["supervisor_approval_required"] is not True]
    add("Q09", "High", "PASS" if not t3 else "FAIL", "Every Tier-3 step requires supervisor approval", "violations: %d" % len(t3))
    t3loto = [s for s in steps if s["tier"] == 3 and not re.search(r"LOTO|lock", (s["safety_warning"] or "") + (s["check_measurement"] or ""), re.I)]
    add("Q10", "High", "PASS" if not t3loto else "FAIL", "Tier-3 steps mention LOTO / lock-out", "without: %d" % len(t3loto))
    badref = [s["step_reference"] for s in steps
              if s["step_reference"] != "DS-%s-%02d" % (s["case_reference"].split("-", 1)[1], s["step_number"])]
    add("Q11", "Low", "PASS" if not badref else "FAIL", "step_reference matches case and step number", "violations: %d" % len(badref))

    taxd, vocd = {t["taxonomy_code"]: t for t in tax}, {v["failure_mode_id"]: v for v in vocab}
    seedd = {s["case_reference"]: s for s in seed}
    miss_seed = sorted(refset - set(seedd))
    tmis, no_code = [], []
    for c in cases:
        s = seedd.get(c["case_reference"])
        if not s:
            continue
        if s["taxonomy_code"] is None:
            no_code.append(c["case_reference"])
            continue
        t = taxd.get(s["taxonomy_code"])
        if t is None:
            tmis.append((c["case_reference"], "unknown taxonomy code"))
        elif (t["equipment_class_id"], t["subsystem_name"], t["component_name"] or "") != \
                (c["equipment_class_id"], c["subsystem_source_label"], c["component_name"] or ""):
            tmis.append((c["case_reference"], "class/subsystem/component differs from taxonomy"))
    unk_fm = [s["case_reference"] for s in seed if s["failure_mode_id"] and s["failure_mode_id"] not in vocd]
    add("Q12", "High", "PASS" if not (tmis or unk_fm or miss_seed) else "FAIL", "Taxonomy / vocabulary references consistent",
        "cases w/o mapping seed=%s, mismatches=%s, unknown FM ids=%s" % (miss_seed, tmis, unk_fm))
    add("Q13", "Medium", "WARN" if no_code else "PASS", "Cases without a taxonomy code (known FMEA gaps)",
        "%d cases: %s" % (len(no_code), ", ".join(no_code)))
    src_bad = {x for s in seed for x in L.parse_source_ids(s["source_ref_ids"]) if x not in sources}
    add("Q14", "Medium", "PASS" if not src_bad else "FAIL", "Source ids referenced exist", "unknown: %s" % sorted(src_bad))

    ok, bad = resolve_subsystems(cases, m06)
    fix_present = os.path.exists(os.path.join(project, "sql", "m09", "m09_010_resolve_subsystem_fk.sql"))
    add("Q15", "High", "PASS" if (sets_sub or fix_present) else "FAIL",
        "A mechanism exists that sets operational_case.subsystem_id",
        "Step 4.5 sets subsystem_id: %s; m09_010 fix file present: %s. Label matches approved subsystem for %d cases; "
        "%d unresolved (%s)" % (sets_sub, fix_present, len(ok), len(bad), ", ".join(bad)))
    add("Q16", "Medium", "WARN" if bad else "PASS", "Cases whose subsystem label is not in the approved list",
        "%d cases need a Group 1 mapping decision" % len(bad))

    acc = {c["acceptance_criteria"] for c in cases}
    add("Q17", "Medium", "WARN" if len(acc) == 1 else "PASS", "Acceptance criteria are case-specific",
        "%d distinct value(s) over %d cases; value says the OEM/site source is 'not stated' (placeholder, not a limit)" % (len(acc), len(cases)))
    generic = sum(1 for s in steps if "Per OEM / site procedure" in (s["check_measurement"] or ""))
    add("Q18", "Medium", "WARN" if generic else "PASS", "Steps with generic measurement-point wording", "%d of %d steps" % (generic, len(steps)))
    depth = [c["case_reference"] for c in cases if c["needs_depth_expansion"]]
    add("Q19", "Low", "INFO", "Cases flagged needs_depth_expansion", "%d: %s" % (len(depth), ", ".join(depth)))

    same, cross = near_duplicates(cases)
    exact = len(cases) - len({c["symptom_text"] for c in cases})
    add("Q20", "Medium", "PASS" if not (same or exact) else "FAIL", "No exact / near-duplicate cases within a class (Jaccard >= 0.6)",
        "exact duplicate symptom texts=%d; same-class near-dups=%s; cross-class pairs>=0.6 (informational)=%s" % (exact, same, cross))

    ph = [p["part_name"] for p in spare_parts if re.match(r"^\s*none\b", p["part_name"] or "", re.I)]
    phl = [(s["case_reference"], s["part_name"]) for s in spare_links if re.match(r"^\s*none\b", s["part_name"] or "", re.I)]
    add("Q21", "High", "PASS" if not (ph or phl) else "FAIL", "No placeholder text loaded as a spare part",
        "spare rows=%s, links=%s" % (ph, phl))
    res = spare_links_resolution(spare_links, spare_parts)
    fanout = [r for r in res if r[3] != 1]
    old_rows = sum(max(r[2], 0) for r in res)
    add("Q22", "High", "PASS" if not fanout else "FAIL", "Each spare link resolves to exactly one spare row (case-specific join)",
        "links=%d, not-exactly-one=%s; original name-only join would create %d rows" % (len(res), fanout[:5], old_rows))
    gen_safety = all(s["equipment_class_id"] is None for s in safety)
    add("Q23", "Medium", "WARN" if gen_safety else "PASS", "Safety procedures are class-specific",
        "%d safety rows, all general (class NULL): every case links to all %d (%d links)" % (len(safety), len(safety), len(safety) * len(cases)))

    life_bad = []
    for c in cases:
        if defaults.get("case_status") != "DRAFT" or defaults.get("retrieval_eligibility") != "demo_only_until_expert_review":
            life_bad.append(c["case_reference"])
    add("Q24", "High", "PASS" if not life_bad else "FAIL", "Import keeps all cases DRAFT + demo_only_until_expert_review (+ synthetic)",
        "import defaults: %s; model/synthetic flags hard-coded TRUE in the import SELECT" % defaults)
    add("Q25", "Info", "INFO", "All 50 cases state illustrative operating context / no recorded readings",
        "%d of %d" % (sum(1 for c in cases if "illustrative" in (c["operating_status"] or "").lower()), len(cases)))
    add("Q26", "Info", "INFO", "Scope of contradiction checking",
        "Only structural contradictions are tested (class/subsystem/component vs taxonomy, tier vs approval, status vs eligibility). "
        "Semantic symptom/cause/measurement contradictions need expert review.")
    return f, {"cases": cases, "steps": steps, "unresolved": bad, "resolved": ok, "no_taxonomy": no_code, "depth": depth}
