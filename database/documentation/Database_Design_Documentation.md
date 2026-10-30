# Operational Sense --- M05 Database Design Documentation

## Sprint 1 · Group 2 (M04--M06)

**Database:** PostgreSQL (`opsense`) running in Docker\
**Tenant context used in validation:**
`b2a7dce7-b449-4381-ba3b-b520f2c88c2e`

> **Data-quality note:** Sample cases are synthetic, marked `DRAFT` and
> `demo_only_until_expert_review`. Equipment classes and taxonomy
> entries in the sample outputs are `PENDING_REVIEW`. Do not present
> these as approved expert guidance.

## 1. Scope and observed status

The database has 23 public tables. Reported development data counts are
50 operational cases, 350 troubleshooting steps, 286 source links, 50
taxonomy mappings, 700 safety-procedure links, 120 spare-part links, and
50 pending verification records. The relationship checks previously run
reported no missing parent references for the checks performed.

`asset_node` exists but currently contains zero rows, so the physical
asset hierarchy has not yet been demonstrated with seeded records. The
pgvector extension, embedding type, and a working similarity query must
be checked before claiming vector retrieval is implemented.

## 2. Entity descriptions

### Organization and audit

-   **`organization`**: Tenant identity; primary key `organization_id`,
    unique organization name.
-   **`audit_log`**: Action history with actor, action, entity type/id,
    optional JSON details and timestamp; belongs to an organization.

### Physical asset and equipment reference

-   **`asset_node`**: Physical asset tree with self-referencing
    `parent_asset_id`, level/name, optional equipment class/model, site
    identifier, status and hierarchy path. A cycle-prevention trigger is
    installed.
-   **`equipment_class`**: Equipment categories. Current examples are
    `EQ-PUMP` (Centrifugal Pump), `EQ-MOTOR` (Three-Phase Induction
    Motor), and `EQ-COMP` (Rotary Screw Air Compressor).
-   **`equipment_model`**: Model designations associated with an
    equipment class; model designation is unique within a class.
-   **`subsystem`**: Shared subsystem vocabulary and review status.
-   **`class_subsystem`**: Bridge table defining allowed
    equipment-class/subsystem combinations.

### Cases and diagnostic workflow

-   **`operational_case`**: Main troubleshooting case with tenant,
    equipment class/subsystem/model/asset references, symptoms,
    operating context, suspected/confirmed causes, failure effects,
    corrective actions, spares, post-repair checks, evidence metadata,
    synthetic/illustrative flags, case status and retrieval eligibility.
-   **`troubleshooting_step`**: Ordered diagnostic steps with tier,
    check/measurement, instruments, expected observations,
    interpretation, next step and safety warning.
-   **`historical_case`**: Case metadata for historical/retrieval
    workflows, including an optional embedding column. Its type must be
    verified before claiming pgvector support.

### Taxonomy, evidence and verification

-   **`failure_mode_taxonomy`**: Structured failure modes linked to
    equipment class and optionally subsystem, including
    cause/effect/action and review status.
-   **`failure_mode_vocabulary`**: Preferred failure-mode labels,
    optionally scoped to class.
-   **`case_failure_mapping`**: Maps cases to taxonomy codes and/or
    vocabulary IDs, with mapping status and review note.
-   **`source_reference`**: Source catalogue, reliability class and
    verification status.
-   **`case_source`**: Bridge between cases and sources, with evidence
    role/relation note.
-   **`case_verification`**: Technical, taxonomy, source, safety and
    measurement review states, overall decision, reviewer/date and
    comments.
-   **`media_evidence`**: Case media metadata, storage URI and
    organization ownership.
-   **`safety_procedure`** and **`case_safety_procedure`**: Safety
    requirements and case-to-procedure links.
-   **`spare_part_reference`** and **`case_spare_part`**: Spare
    catalogue and case-to-spare links.
-   **`measurement_reference`**: Measurement parameter, unit,
    instrument, location, applicability, policy and limitation
    information.
-   **`m06_equipment_component_reference`**: Preserves M06 workbook
    component/subsystem/taxonomy rows and source-sheet/row provenance.

## 3. Primary keys and main relationships

  --------------------------------------------------------------------------------------------------------------
  Table                                 Primary key                            Main relationships
  ------------------------------------- -------------------------------------- ---------------------------------
  `organization`                        `organization_id`                      Tenant parent for owned records

  `audit_log`                           `audit_id`                             FK to organization

  `equipment_class`                     `equipment_class_id`                   Parent of models and class-linked
                                                                               reference data

  `equipment_model`                     `equipment_model_id`                   FK to equipment class

  `subsystem`                           `subsystem_id`                         Referenced by class/subsystem and
                                                                               case/taxonomy data

  `class_subsystem`                     `(equipment_class_id, subsystem_id)`   Class/subsystem bridge

  `asset_node`                          `asset_id`                             Organization, optional
                                                                               class/model, self-FK parent

  `operational_case`                    `case_id`                              Organization, asset, class/model
                                                                               and allowed class/subsystem pair

  `troubleshooting_step`                `step_id`                              FK to operational case

  `historical_case`                     `case_id`                              Organization, operational case,
                                                                               class/subsystem/model

  `failure_mode_taxonomy`               `taxonomy_code`                        Equipment class and optional
                                                                               subsystem

  `failure_mode_vocabulary`             `failure_mode_id`                      Optional equipment-class FK

  `case_failure_mapping`                `mapping_id`                           Case, taxonomy and vocabulary FKs

  `source_reference`                    `source_id`                            Parent source catalogue

  `case_source`                         `(case_id, source_id)`                 Case/source bridge

  `case_verification`                   `verification_id`                      FK to operational case

  `media_evidence`                      `media_id`                             Case and organization FKs

  `safety_procedure`                    `safety_procedure_id`                  Optional class/source FKs

  `case_safety_procedure`               `(case_id, safety_procedure_id)`       Case/safety bridge

  `spare_part_reference`                `spare_part_id`                        Optional source FK

  `case_spare_part`                     `(case_id, spare_part_id)`             Case/spare bridge

  `measurement_reference`               `measurement_reference_id`             Optional
                                                                               class/subsystem/taxonomy/source
                                                                               FKs

  `m06_equipment_component_reference`   `reference_id`                         Equipment-class FK and source
                                                                               provenance
  --------------------------------------------------------------------------------------------------------------

Most foreign keys use `ON DELETE RESTRICT` to preserve traceability and
prevent deleting referenced records.

## 4. Important constraints

  ---------------------------------------------------------------------------------------------------------
  Table                                 Constraint                                  Reason
  ------------------------------------- ------------------------------------------- -----------------------
  `organization`                        Unique `name`                               Avoid duplicate
                                                                                    organization names

  `equipment_class`                     Unique `class_name`; review status in       Stable catalogue and
                                        `PENDING_REVIEW`, `APPROVED`, `REJECTED`    explicit review
                                                                                    workflow

  `equipment_model`                     Unique                                      No duplicate model
                                        `(equipment_class_id, model_designation)`   designation within a
                                                                                    class

  `subsystem`                           Unique `subsystem_name`; controlled review  Stable subsystem
                                        status                                      vocabulary

  `class_subsystem`                     Composite primary key                       Prevent duplicate
                                                                                    class/subsystem pairs

  `asset_node`                          Nonblank level/name/status; parent cannot   Basic asset validity
                                        equal itself; cycle-prevention trigger      and cycle prevention

  `operational_case`                    Nonblank symptom; controlled                Valid and predictable
                                        status/eligibility/reliability values;      case data
                                        nonnegative verification duration

  `operational_case`                    Unique `(organization_id, case_reference)`  Tenant-scoped duplicate
                                        and `(organization_id, client_capture_id)`  prevention

  `operational_case`                    Composite FK                                Only allow defined
                                        `(equipment_class_id, subsystem_id)` to     class/subsystem pairs
                                        `class_subsystem`

  `troubleshooting_step`                Step number \> 0; tier in 1,2,3; unique     Valid ordering and no
                                        `(case_id, step_number)`                    duplicate step numbers

  `troubleshooting_step`                Tier 3 requires                             Ensures approval is
                                        `supervisor_approval_required = true`       flagged; does not prove
                                                                                    approval occurred

  `case_verification`                   Controlled overall decision; reviewer/date  Review traceability
                                        required for approved decisions

  Taxonomy/vocabulary tables            Controlled review status                    Separate pending data
                                                                                    from approved
                                                                                    vocabulary

  `source_reference`                    Controlled reliability and verification     Standardize source
                                        status                                      quality/review state

  `media_evidence`                      Media type limited to photo/video/audio     Prevent unsupported
                                                                                    media labels

  `m06_equipment_component_reference`   Nonblank labels; source row \> 1; unique    Preserve provenance and
                                        source sheet/row and mapping combination    avoid duplicates

  Case bridge tables                    Composite primary keys                      Prevent duplicate links
  ---------------------------------------------------------------------------------------------------------

## 5. Indexes and performance

Important supporting indexes include: - `operational_case`:
organization, asset, model, class/subsystem/status, plus GIN full-text
search over symptom/cause/effect text. - `troubleshooting_step`: case
lookup and unique `(case_id, step_number)`. - `asset_node`:
organization, parent, class and model. - Case-link tables: indexes on
foreign keys for reverse lookups. - `historical_case`: organization and
strict class/subsystem/status filtering. - `measurement_reference`:
class, subsystem and taxonomy. - `m06_equipment_component_reference`:
class and unique provenance/mapping indexes.

The GIN full-text index is **not** a vector index. Although pgvector `0.8.7` is installed and the `historical_case.embedding` column is of type `vector`, there are currently zero historical cases and zero embeddings. A temporary vector-operator test can demonstrate that the operator works, but it does not demonstrate retrieval against project data.

## 6. Row-level security

RLS is enabled and forced on 12 tables: `asset_node`, `audit_log`,
`case_failure_mapping`, `case_safety_procedure`, `case_source`,
`case_spare_part`, `case_verification`, `historical_case`,
`media_evidence`, `operational_case`, `organization`, and
`troubleshooting_step`.

RLS is disabled on 11 tables: `class_subsystem`, `equipment_class`,
`equipment_model`, `failure_mode_taxonomy`, `failure_mode_vocabulary`,
`m06_equipment_component_reference`, `measurement_reference`,
`safety_procedure`, `source_reference`, `spare_part_reference`, and
`subsystem`.

Policies use `app.current_org_id` for organization-owned records or
check ownership through the parent case. The policy output showed no
DELETE policies. Confirm whether global reference tables are
intentionally shared and whether write/delete access is adequately
restricted; do not claim complete tenant isolation across all tables.

Tenant-scoped test pattern:

``` sql
BEGIN;
SET LOCAL app.current_org_id = 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e';
SELECT case_reference, case_status, retrieval_eligibility
FROM operational_case
ORDER BY case_reference
LIMIT 5;
COMMIT;
```

## 7. Representative sample records

### Operational cases

  ----------------------------------------------------------------------------------------------------------
  Case              Class       Sample symptom     Status      Retrieval eligibility             Synthetic
                                summary
  ----------------- ----------- ------------------ ----------- --------------------------------- -----------
  `CASE-COMP-001`   `EQ-COMP`   Slow pressure      `DRAFT`     `demo_only_until_expert_review`   Yes
                                build-up, elevated
                                current and high
                                separator
                                differential
                                pressure;
                                separator change
                                date overdue

  `CASE-COMP-002`   `EQ-COMP`   High-temperature   `DRAFT`     `demo_only_until_expert_review`   Yes
                                shutdown, dusty
                                oil-cooler fins
                                and blocked
                                ventilation louvre

  `CASE-COMP-003`   `EQ-COMP`   High discharge     `DRAFT`     `demo_only_until_expert_review`   Yes
                                temperature and
                                suspected internal
                                oil-cooler sludge
  ----------------------------------------------------------------------------------------------------------

These are synthetic scenarios, not confirmed diagnoses.

### Troubleshooting steps

A sampled case has step numbers 1, 2 and 3, all Tier 1:
`Scraping noise`, `Bearing play`, and `Heat`. The sample rows have
`supervisor_approval_required = false`.

### Equipment classes

-   `EQ-COMP` --- Rotary Screw Air Compressor --- `PENDING_REVIEW`
-   `EQ-MOTOR` --- Three-Phase Induction Motor --- `PENDING_REVIEW`
-   `EQ-PUMP` --- Centrifugal Pump --- `PENDING_REVIEW`

### Taxonomy examples

-   `COMP.AEND.BRNG` --- Air End Bearing Failure --- `PENDING_REVIEW`
-   `COMP.AEND.ROTR` --- Rotor Wear / Clearance Increase ---
    `PENDING_REVIEW`
-   `COMP.COND.DRN` --- Condensate Drain Blockage --- `PENDING_REVIEW`

### Verification and hierarchy

Sample verification rows have `overall_decision = PENDING` with
reviewer/date empty. The asset query returned zero rows; physical
hierarchy seed data is still outstanding.

## 8. Assumptions and decisions

1.  Organization-owned operational data is scoped by `organization_id`
    and/or its parent case. The application must set
    `app.current_org_id` correctly for each transaction.
2.  Reference/catalogue data is treated as shared for now; confirm this
    matches the team's security model because several reference tables
    have RLS disabled.
3.  Synthetic cases, illustrative models, pending taxonomy mappings and
    unverified sources are not approved industrial guidance.
4.  Foreign keys mostly use `ON DELETE RESTRICT` to preserve provenance.
5.  The Tier 3 check requires an approval flag only; actual approval
    needs a separate workflow/evidence.
6.  A self-referencing asset model is used; trigger exists, but
    hierarchy rows still need to be seeded and tested.
7.  Full-text search is present. Vector search must not be claimed until
    pgvector and a similarity query are verified.
8.  Confirm alignment with the team's approved Common Data Model v1.0
    before bulk generation or approving reference data.

## 9. Remaining checks before submission

-   [ ] Load and validate pump, motor and compressor asset hierarchy
    seed records, or document ownership/dependency if another teammate
    supplies them.
-   [ ] Verify the pgvector extension and `historical_case.embedding`
    type.
-   [ ] Run a basic similarity query against actual embeddings, if
    available; otherwise document the limitation.
-   [ ] Confirm whether the 11 RLS-disabled reference tables are
    intentionally shared.
-   [ ] Review whether DELETE actions should be restricted through
    grants or policies.
-   [ ] Test migrations against a clean database and document the
    migration order.
-   [ ] Ensure README explains Docker setup, database creation,
    migrations, seed loading, tenant context and validation.
-   [ ] Keep review states pending until appropriate reviewers approve
    the data.

## 10. Useful verification commands

``` bash
# List tables
docker exec -it opsense-db psql -U postgres -d opsense -c "\dt public.*"

# Inspect asset hierarchy table
docker exec -it opsense-db psql -U postgres -d opsense -c "\d public.asset_node"

# Verify pgvector extension and embedding type
docker exec -it opsense-db psql -P pager=off -U postgres -d opsense -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'; SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'historical_case' AND column_name = 'embedding';"

# Inspect RLS status
docker exec -it opsense-db psql -P pager=off -U postgres -d opsense -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname;"
```

## 11. Suggested submission structure

``` text
Group_2_Backend_Database/
├── diagrams/
├── schema/
├── migrations/
├── seed_data/
└── documentation/
```

This document describes observed schema and sample outputs. It does not
replace the actual SQL migrations, ER diagram, approved Common Data
Model, or a clean-database migration test.
