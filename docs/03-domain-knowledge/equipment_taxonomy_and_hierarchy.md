# Equipment Taxonomy & Hierarchy

**Operational Sense Knowledge Base** · Epic 1 · Owner: Group 1 (LNCT Qubit Cohort)

> Source workbooks: `services/backend/src/modules/taxonomy/G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx` and `Operational_Sense_Industrial_Knowledge_Base_g1.xlsx` (GitHub Issues #2 and #5)

## 1. Purpose and Architectural Role

The Equipment Taxonomy defines the standardized asset hierarchy for the **Operational Sense** diagnostic engine. Built on the structural principles of **ISO 14224:2016**, this taxonomy bridges informal shop-floor maintenance reports (including Hinglish technician observations) with structured relational filtering and semantic vector retrieval in PostgreSQL.

Unlike traditional Computerized Maintenance Management Systems (CMMS) that rely solely on rigid work-order keyword lookups, Operational Sense uses this taxonomy as the deterministic foundation for a **two-stage hybrid retrieval pipeline**:

$$\text{Technician Query} \rightarrow \text{Stage 1: SQL Taxonomy Filter} \rightarrow \text{Stage 2: pgvector Similarity} \rightarrow \text{Guided Diagnosis}$$

## 2. Five-Level Asset Hierarchy Structure

Every maintainable item in the knowledge base is organized into a five-level top-down engineering tree:

1. **Level 1 - Root Asset Domain (`EQ-ROOT`):** Top-level industrial plant or facility boundary.
2. **Level 2 - Equipment Grouping (`EQ-ROTATING`):** Functional grouping for rotating mechanical and electrical machinery.
3. **Level 3 - Equipment Class:** Specific machine category (`EQ-PUMP`, `EQ-MOTOR`, `EQ-COMP`).
4. **Level 4 - Subsystem / Functional Assembly:** Major functional block within the machine (such as Bearing Assembly, Hydraulic End, Stator Assembly, or Air End).
5. **Level 5 - Maintainable Item / Component:** Specific replaceable part where the physical failure mechanism originates.

| Hierarchy Level | Canonical ID | Initial Sprint 1 Tag | Scope Description |
|---|---|---|---|
| Level 1 | `EQ-ROOT` | N/A | Industrial plant asset root |
| Level 2 | `EQ-ROTATING` | N/A | Rotating machinery asset group |
| Level 3 | `EQ-PUMP` | `PUMP-CENT` | Horizontal end-suction centrifugal pump |
| Level 3 | `EQ-MOTOR` | `MOTOR-IM3` | Squirrel-cage three-phase induction motor |
| Level 3 | `EQ-COMP` | `COMP-SCREW` | Oil-injected rotary screw air compressor |

The table above reconciles the initial Sprint 1 class labels (`PUMP-CENT`, `MOTOR-IM3`, `COMP-SCREW`) with the canonical database foreign keys (`EQ-PUMP`, `EQ-MOTOR`, `EQ-COMP`) used across the master workbook and PostgreSQL schema.

## 3. Dot-Notation Naming Convention

Each component-level failure mode is assigned a unique project-local hierarchy code formatted in uppercase dot-notation:

* **Three-Segment Format (`CLASS.SUBSYSTEM.COMPONENT`):** Used for pumps, compressors, and mechanical motor mountings (for example, `PUMP.BRNG.ROLL` or `MOT.MNTG.FEET`).
* **Four-Segment Format (`DOMAIN.CLASS.SUBSYSTEM.COMPONENT`):** Used for electrical and electromagnetic motor components under the `ELEC.MOT` prefix (for example, `ELEC.MOT.STAT`).

## 4. Complete Component & Failure Mode Taxonomy (30 Core Rows)

The v1.0 taxonomy comprises $3$ equipment classes, $10$ maintainable component mappings per class, and $30$ canonical FMEA rows that anchor the $50$ troubleshooting cases in the master knowledge base.

### 4.1 Centrifugal Pump (`EQ-PUMP`)

| Taxonomy Code | Subsystem | Maintainable Item | Failure Mode | ISO Tag |
|---|---|---|---|---|
| `PUMP.BRNG.ROLL` | Bearing Assembly | Rolling Element Bearing | Bearing Wear | `VIB` |
| `PUMP.SEAL.FACE` | Mechanical Seal | Seal Faces | Seal Face Leakage | `ELP` |
| `PUMP.HYDR.IMPL` | Hydraulic End | Impeller | Cavitation | `NOI` |
| `PUMP.HYDR.WEAR` | Hydraulic End | Impeller & Wear Rings | Impeller / Wear Ring Wear | `LOO` |
| `PUMP.DRVT.CPLG` | Drive Train | Flexible Coupling | Coupling Misalignment | `VIB` |
| `PUMP.SUCT.STRN` | Suction System | Suction Strainer | Strainer Blockage | `PLU` |
| `PUMP.SHFT.SHAF` | Rotating Assembly | Pump Shaft | Shaft Fatigue Fracture | `STD` |
| `PUMP.SUCT.PRIM` | Suction System | Suction Piping & Casing | Air Ingress / Loss of Prime | `LOO` |
| `PUMP.HYDR.RECR` | Hydraulic End | Impeller & Volute | Low-Flow Recirculation | `VIB` |
| `PUMP.BRNG.SEAL` | Bearing Assembly | Housing Labyrinth Seal | Bearing Housing Seal Failure | `ELU` |

All $10$ centrifugal pump codes map directly to industrial hydraulic and mechanical standards including API 610 / ISO 13709, API 682 / ISO 21049, and ANSI/HI 9.6 guidelines.

### 4.2 Three-Phase Induction Motor (`EQ-MOTOR`)

| Taxonomy Code | Subsystem | Maintainable Item | Failure Mode | ISO Tag |
|---|---|---|---|---|
| `ELEC.MOT.STAT` | Stator Assembly | Stator Winding Insulation | Insulation Breakdown | `BRD` |
| `ELEC.MOT.BRNG` | Bearing Assembly | Motor Rolling Bearing | Bearing Overheating (Lubrication Failure) | `OHE` |
| `ELEC.MOT.ROTR` | Rotor Assembly | Squirrel-Cage Rotor Bars | Broken Rotor Bar | `VIB` |
| `ELEC.MOT.COOL` | Cooling System | Fan, Cowl & Cooling Fins | Cooling Airflow Blockage | `OHE` |
| `ELEC.MOT.TERM` | Terminal Box | Terminal Lugs & Leads | Loose Electrical Connection | `OHE` |
| `MOT.MNTG.FEET` | Mounting & Frame | Mounting Feet & Baseplate | Soft Foot / Mechanical Looseness | `VIB` |
| `ELEC.MOT.SUPP` | Power Supply | Three-Phase Supply Feed | Single-Phasing (Phase Loss) | `PDE` |
| `ELEC.MOT.BRDC` | Bearing Assembly | Bearing Races & Rolling Elements | Bearing Electrical Discharge Damage (Fluting) | `VIB` |
| `ELEC.MOT.AGAP` | Air-Gap Geometry | Rotor & Stator Core | Air-Gap Eccentricity / Rotor-Stator Rub | `VIB` |
| `ELEC.MOT.IMBL` | Rotor Assembly | Rotor Shaft Assembly | Rotor Imbalance | `VIB` |

Motor failure modes cover both electrical supply/insulation faults and mechanical rotor/bearing degradation, referenced against IEC 60034, NEMA MG 1, IEEE Std 43, and ISO 20816-1.

### 4.3 Rotary Screw Air Compressor (`EQ-COMP`)

| Taxonomy Code | Subsystem | Maintainable Item | Failure Mode | ISO Tag |
|---|---|---|---|---|
| `COMP.AEND.ROTR` | Air End Assembly | Male & Female Rotors | Rotor Wear / Clearance Increase | `LOO` |
| `COMP.OSEP.ELEM` | Oil Separation | Separator Element | Separator Element Clogging | `PLU` |
| `COMP.INTK.FILT` | Air Intake | Inlet Air Filter | Clogged Air Filter | `LOO` |
| `COMP.COOL.COLR` | Cooling System | Oil & Aftercooler Core | Cooler Fouling | `OHE` |
| `COMP.VALV.UNL` | Intake Control | Inlet Unloader Valve | Unloader Valve Sticking | `FTF` |
| `COMP.VALV.MPV` | Pressure Control | Minimum Pressure Valve | Minimum Pressure Valve Leakage / Sticking | `INL` |
| `COMP.AEND.BRNG` | Air End Assembly | Thrust & Radial Bearings | Air End Bearing Failure | `VIB` |
| `COMP.OILS.THRM` | Thermal Control | Thermostatic Bypass Valve | Thermostatic Valve Sticking | `PDE` |
| `COMP.VALV.SOL` | Actuation System | Control Solenoid Valve | Solenoid Valve Failure | `FTF` |
| `COMP.COND.DRN` | Condensate System | Auto Condensate Drain | Condensate Drain Blockage | `PLU` |

Compressor mappings align with API 619, ISO 8573-1 compressed air quality standards, and Atlas Copco GA-series industrial maintenance manuals.

## 5. Database Ingestion & `Import_View` Data Contract

In `Operational_Sense_Industrial_Knowledge_Base_g1.xlsx`, the $30$ taxonomy codes above expand into **$50$ real-world troubleshooting cases** (GitHub Issue #5). The `Import_View` sheet structures these $50$ cases for direct ingestion into PostgreSQL with the `pgvector` extension:

| Column Category | `Import_View` Fields | System Role in Operational Sense |
|---|---|---|
| **Hard Filters** | `equipment_class_id`, `subsystem`, `taxonomy_code` | Stage 1 SQL `WHERE` clause filtering |
| **ISO Classification** | `iso_failure_mode`, `failure_mode_name` | Cross-class reliability analytics |
| **Vector Embeddings** | `symptom_reported_hinglish`, `symptom_structured` | Stage 2 `pgvector` cosine similarity search |
| **Diagnostic Logic** | `candidate_causes`, `guided_checks` | Interactive root-cause elimination |
| **Action & Safety** | `corrective_action`, `risk_tier`, `verification` | Step-by-step repair and safety escalation |

### How Two-Stage Hybrid Retrieval Uses This Schema

1. **Stage 1 - Deterministic SQL Hard Filter:** When a technician selects a machine class (such as `EQ-PUMP`) and optional subsystem (such as `Bearing Assembly`), PostgreSQL restricts the candidate pool strictly to matching taxonomy rows. This prevents a pump vibration query from returning motor rotor-bar cases.
2. **Stage 2 - Semantic Vector Search (`pgvector`):** Within the filtered subset, the engine converts the technician's natural language or Hinglish query (for example, *"Pump ke bearing side se tez ghurghurahat aur heat aa rahi hai"*) into a vector embedding and ranks candidates against `symptom_reported_hinglish` and `symptom_structured`.
3. **Stage 3 - Risk-Tiered Action Delivery:** The matched taxonomy record returns ordered diagnostic checks and corrective actions governed by its safety tier (Tier 1 visual check, Tier 2 non-invasive measurement, or Tier 3 intrusive overhaul requiring supervisor sign-off).

## 6. Governance and Expansion Rules

* **Scope Boundary:** This taxonomy represents the initial Sprint 1 scope ($30$ failure modes across $3$ rotating equipment classes supporting $50$ diagnostic cases), not an exhaustive plant-wide asset register.
* **Adding Equipment Classes:** Introducing new asset classes (such as gearboxes, heat exchangers, or control valves) requires assigning a canonical `EQ-` identifier, decomposing subsystems to maintainable items, mapping ISO 14224 Annex B codes, and validating FMEA scoring scales with domain reviewers.