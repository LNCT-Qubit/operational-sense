# Manifest — Operational Sense M06 v2.0

| Path | Purpose | Status |
|---|---|---|
| `README.md` | Entry point, safe execution instructions and status | Updated |
| `CHANGELOG.md` | Version history | Updated |
| `LICENSE_OR_ATTRIBUTION.md` | Source attribution and licensing caveat | Updated |
| `source_audit/source_inventory.md` | Input audit, sheet inventory, repository status | Updated |
| `source_audit/compatibility_audit.md` | M04/M05 and stack compatibility findings | Updated |
| `source_audit/equipment_reference_source_snapshot.csv` | Exact 30 source rows with original worksheet row numbers | New |
| `source_audit/requirements_traceability.csv` | Acceptance criterion to implementation/evidence mapping | Updated |
| `source_audit/open_decisions.csv` | Domain, architecture and repository blockers | Updated |
| `tests/fixtures/expected_source_inventory.json` | Source hashes, sheet names, counts and class distribution | Updated |
| `sql/migrations/0001_m06_asset_hierarchy.sql` | Provisional PostgreSQL candidate migration with preflight, FKs and cycle trigger | New; database NOT RUN |
| `sql/seed_data/equipment_class_reference.csv` | Three source-backed class seed records | Updated |
| `sql/seed_data/equipment_component_reference.csv` | 30 source-backed subsystem/component mappings | Updated |
| `sql/seed_data/seed_m06_reference_data.sql` | Insert-only, rerunnable PostgreSQL seed script | New; database NOT RUN |
| `sql/validation/01_duplicate_source_identifiers.sql` | Duplicate source/provenance and diagnostic duplicate-label checks | Updated |
| `sql/validation/02_orphan_parent_references.sql` | Orphan parent audit | Updated |
| `sql/validation/03_seed_data_integrity.sql` | Assertions for class and mapping seeds | New; database NOT RUN |
| `sql/validation/04_asset_class_assignment_review.sql` | Review query for class/level consistency | New |
| `sql/queries/01_list_equipment_classes.sql` | Class lookup query | Updated |
| `sql/queries/02_recursive_asset_descendants.sql` | Cycle-bounded recursive descendant query | Updated |
| `sql/rollback/README.md` | Safe test rollback guidance | Updated |
| `tests/postgres/verify_m06.sql` | FK, duplicate, self-parent, cycle and recursive traversal checks | New; database NOT RUN |
| `tests/postgres/run_clean_database_tests.sh` | Guarded disposable database test runner | New; database NOT RUN |
| `tests/test_m06_package.py` | Python static regression tests | New |
| `tests/README.md` | Test instructions and actual execution boundaries | Updated |
| `scripts/validate_package.py` | Source-to-seed static validator and SQL guardrails | Updated |
| `documentation/source_audit.md` | Source facts and approval status | New |
| `documentation/data_dictionary.md` | Candidate table/column dictionary | New |
| `documentation/hierarchy_and_relationships.md` | Hierarchy model, constraints and open enforcement rules | New |
| `documentation/seed_data_mapping.md` | Source-to-seed mapping and repeatability | New |
| `documentation/validation_report.md` | PASS/NOT RUN/BLOCKED/PENDING REVIEW statuses | New |
| `documentation/decisions_and_open_questions.md` | Confirmed facts, provisional choices and decisions needed | New |
| `documentation/integration_with_m04_m05.md` | Integration contract and proposed destination mapping | New |
| `documentation/implementation_notes.md` | Scope, implementation choices and non-goals | New |
| `documentation/pr_review_checklist.md` | Review and approval checklist | New |
| `documentation/changes_from_v1.md` | Explicit list of v1.0 replacements, additions and retained work | New |
| `diagrams/equipment_hierarchy.mmd` | Editable Mermaid diagram source | Updated |
| `diagrams/equipment_hierarchy.dot` | Editable Graphviz source | Updated |
| `diagrams/equipment_hierarchy.svg` | Rendered diagram | Regenerated |
| `diagrams/equipment_hierarchy.png` | Rendered diagram | Regenerated |
| `diagrams/relationship_notes.md` | Diagram semantics and caveats | Updated |
| `integration/changed_files_manifest.md` | Proposed repository path mapping | Updated |
| `integration/dependency_notes.md` | Environment and integration dependencies | Updated |
| `integration/integration_patch.md` | Safe integration and Git handoff commands | Updated |
| `integration/PR_DESCRIPTION.md` | Complete suggested PR description | New |
| `evidence/test_results.md` | Actual static test output and database blockers | Updated with actual static test output |
| `evidence/static_validation_output.txt` | Exact static validator output | Updated with actual static test output |
| `evidence/pytest_output.txt` | Actual pytest summary from working output directory | PASS: 5 tests |
| `evidence/pytest_output_packaged.txt` | Actual pytest summary rerun against extracted ZIP contents | PASS: 5 tests |
| `evidence/shell_syntax_check.txt` | Actual Bash syntax check | PASS |
| `evidence/final_package_checks.txt` | Final check summary and explicit blockers | Updated |
| `evidence/validation_summary.csv` | Requirement status summary | Updated with actual static test output |

No live repository files, Git metadata, credentials, environment secrets, dependency caches or production data are included.
