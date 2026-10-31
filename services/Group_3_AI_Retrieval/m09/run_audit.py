"""python -m m09.run_audit [project_dir] [out_dir]  -> prints findings, writes CSV/JSON evidence files."""
import csv
import json
import os
import sys
from . import quality


def main(argv):
    project = argv[1] if len(argv) > 1 else "database"
    out = argv[2] if len(argv) > 2 else "data"
    os.makedirs(out, exist_ok=True)
    findings, ctx = quality.run(project)
    for x in findings:
        print("%-4s %-6s %-5s %s | %s" % (x["id"], x["severity"], x["status"], x["title"], x["detail"][:200]))
    with open(os.path.join(out, "m09_findings.json"), "w", encoding="utf-8") as fh:
        json.dump(findings, fh, indent=2, ensure_ascii=False)
    unresolved, depth, notax = set(ctx["unresolved"]), set(ctx["depth"]), set(ctx["no_taxonomy"])
    with open(os.path.join(out, "m09_expert_review_queue.csv"), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["case_reference", "equipment_class_id", "subsystem_source_label", "component_name",
                    "subsystem_id_resolvable", "needs_group1_subsystem_decision", "no_taxonomy_code",
                    "needs_depth_expansion", "acceptance_criteria_is_placeholder", "reason_codes"])
        for c in ctx["cases"]:
            r = c["case_reference"]
            reasons = []
            if r in unresolved: reasons.append("SUBSYSTEM_LABEL_NOT_IN_APPROVED_LIST")
            if not c["component_name"]: reasons.append("COMPONENT_BLANK")
            if r in notax: reasons.append("NO_TAXONOMY_CODE")
            if r in depth: reasons.append("DEPTH_EXPANSION_FLAG")
            reasons.append("ACCEPTANCE_PLACEHOLDER")
            w.writerow([r, c["equipment_class_id"], c["subsystem_source_label"], c["component_name"] or "",
                        r not in unresolved, r in unresolved, r in notax, r in depth, True, ";".join(reasons)])
    fails = [x for x in findings if x["status"] == "FAIL"]
    print("\nFAIL: %d  WARN: %d  PASS: %d  INFO: %d" % tuple(
        sum(1 for x in findings if x["status"] == s) for s in ("FAIL", "WARN", "PASS", "INFO")))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
