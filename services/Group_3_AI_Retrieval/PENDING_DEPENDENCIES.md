# Group 3 Sprint 1 — Pending Dependencies

| Dependency | Required action | Owner / approver | Why it remains open |
|---|---|---|---|
| Canonical schema acceptance | Confirm schema v1.0.0 and downstream contract | M07 / Udit + Group 2 | Implementation exists; personal confirmation absent |
| Embedding strategy acceptance | Confirm provisional model, prefixes, text and metadata design | M08 / Aastha | No owner confirmation in package |
| Real model inference | Install `sentence-transformers`, load model, verify 384-d output, embed records | M08 | Package environment lacked dependency/model access |
| Live pgvector verification | Run migrations, load data, real vector ingest/search on disposable DB | M08 + Group 2 | No live PostgreSQL endpoint/client available in this audit session |
| Synthetic domain validation | Resolve 11 components, 10 subsystem mappings, 11 taxonomy gaps, 15 depth flags | Group 1 / domain reviewer | No authoritative plant/OEM source or expert approval supplied |
| Taxonomy cross-link review | Review provisional/ambiguous taxonomy links in unresolved register | Group 1 | Mapping validation does not equal approval |
| Evaluation ground truth | Confirm relevant case IDs for 17 queries and establish keyword baseline | Group 3 + domain reviewer | No validated relevance labels/baseline supplied |
| Independent QA | Review package and run target-environment tests | Group 4 | No independent QA sign-off supplied |
| RLS target-environment check | Re-run cross-tenant SELECT/INSERT/UPDATE tests on target deployment | Group 2 / QA | Static checks passed; fresh live DB not available here |

**Do not** promote any DRAFT case to VERIFIED or eligible until authorized domain review is recorded. Do not report the >35% Recall@3/MRR target as an achieved result.
