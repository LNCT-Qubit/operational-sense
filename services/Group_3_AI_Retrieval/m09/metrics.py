"""Recall@k, MRR and evaluation-dataset validation. Pure arithmetic: it never produces retrieval results."""


def recall_at_k(ranked_ids, relevant_ids, k=3):
    """Fraction of the relevant cases found in the top-k. Undefined (None) when there are no relevant cases."""
    rel = set(relevant_ids)
    if not rel:
        return None
    return len(rel & set(ranked_ids[:k])) / len(rel)


def reciprocal_rank(ranked_ids, relevant_ids):
    rel = set(relevant_ids)
    for i, cid in enumerate(ranked_ids, 1):
        if cid in rel:
            return 1.0 / i
    return 0.0


def mean_metrics(runs, k=3):
    """runs: {query_id: (ranked_ids, relevant_ids)} -> (mean Recall@k, MRR). Queries without labels are skipped."""
    rec, rr = [], []
    for ranked, rel in runs.values():
        r = recall_at_k(ranked, rel, k)
        if r is None:
            continue
        rec.append(r)
        rr.append(reciprocal_rank(ranked, rel))
    if not rec:
        return None, None
    return sum(rec) / len(rec), sum(rr) / len(rr)


def relative_improvement(baseline, improved):
    """(improved - baseline) / baseline; None when the baseline is 0 or missing (undefined, not infinite)."""
    if baseline in (None, 0) or improved is None:
        return None
    return (improved - baseline) / baseline


def validate_eval_dataset(dataset, case_refs, class_by_case=None):
    """Structural validation of an evaluation set.

    ASSUMED schema (the real m08_eval_dataset.json was NOT supplied, so this is not verified against it):
      {"queries": [{"query_id": str, "query": str, "relevant_case_references": [str, ...],
                    "equipment_class_id": str (optional)}]}
    Returns a list of problem strings (empty list = structurally fine; says nothing about label correctness).
    """
    problems, seen_ids, seen_text = [], set(), set()
    qs = dataset.get("queries") if isinstance(dataset, dict) else None
    if not isinstance(qs, list) or not qs:
        return ["dataset has no 'queries' list"]
    for i, q in enumerate(qs):
        qid = q.get("query_id")
        if not qid:
            problems.append("query #%d has no query_id" % i)
        elif qid in seen_ids:
            problems.append("duplicate query_id %s" % qid)
        seen_ids.add(qid)
        text = (q.get("query") or "").strip()
        if len(text.split()) < 4:
            problems.append("%s: query text empty or trivially short" % qid)
        if text.lower() in seen_text:
            problems.append("%s: duplicate query text" % qid)
        seen_text.add(text.lower())
        rel = q.get("relevant_case_references") or []
        if not rel:
            problems.append("%s: no relevant cases labelled" % qid)
        for r in rel:
            if r not in case_refs:
                problems.append("%s: relevant case %s does not exist" % (qid, r))
            elif class_by_case and q.get("equipment_class_id") and class_by_case.get(r) != q["equipment_class_id"]:
                problems.append("%s: relevant case %s is in another equipment class" % (qid, r))
    return problems
