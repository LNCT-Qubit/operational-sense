# Case schema documentation

Start with `case_schema/field_definitions.md` (every field, type, requirement, DB destination) and `case_schema/validation_rules.md` (all rules and severities). Version history: `case_schema/schema_version.md`.

**Validate a file**
```bash
python - <<'PY'
import json
from case_schema.case_validation import validate_dataset, summarize
from case_schema.reference_data import load_reference
cases = json.load(open("synthetic_dataset/synthetic_cases.json"))["cases"]   # or a bare list of cases
issues = validate_dataset(cases, load_reference())
print(summarize(issues))
for i in issues:
    if i.severity == "ERROR": print(i)
PY
```
**Examples**: `sample_cases/valid_samples.json` (5 records incl. unresolved values and a minimal record), `sample_cases/invalid_samples.json` (21 records, one deliberate defect each, with the expected rejection). Rebuild with `python -m tools.build_samples`.

**Design points**
- Suspected and confirmed causes are different fields; a confirmed cause requires confirming evidence; synthetic cases cannot have one.
- Steps keep their order (`step_number` 1..n); tier 3 requires supervisor approval and isolation wording.
- Unknown is `null`, never a placeholder; unresolved mappings are reported, never guessed.
- Similarity is not diagnosis: `corrective_action_text` is historical information, not an instruction.
- `jsonschema` is optional: a stdlib validator implements the keywords used (`case_schema/validator.py`), and a test cross-checks it with `jsonschema` when installed (skipped in the build environment).

## Group 3 Final notes (schema version unchanged: 1.0.0)
- `check_measurement` (Tier 2) now ends with `[suggested location ... verification required]` or `[measurement location not specified in source - pending ...]`; neither is an OEM-approved measuring point.
- `acceptance_criteria` starts with `PENDING VERIFICATION` and contains no numeric limit.
- `subsystem_name` may differ from `subsystem_source_label` only when `provenance.assumptions` holds a `SUBSYSTEM-RESOLUTION:` entry citing the M06 evidence (validator warning `SUBSYS-CURATED`); otherwise the validator raises `SUBSYS-GUESSED`.
- `provenance.unresolved_items` lists `UR-ACCEPT-*` for every case.
