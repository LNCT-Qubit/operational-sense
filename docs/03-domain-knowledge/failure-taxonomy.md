# Failure Taxonomy

**FMEA & Failure Classification** · Epic 1 · Owner: Group 1 (Product & Domain Research)
> > Source workbook: [`services/backend/src/modules/taxonomy/G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx`](../../services/backend/src/modules/taxonomy/G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx)

## 1. Purpose

This document defines the vocabulary the platform uses to describe **what is failing, where, how, and why**. It is the single source of truth for:

- the hard-filter stage of retrieval (equipment class → subsystem → component → failure mode),
- the schema fields of a troubleshooting case (see Common Data Model),
- the labels used when the 50 synthetic cases are generated and validated.

The taxonomy is deliberately small: **3 equipment classes, 30 failure modes (10 per class)**. It is meant to be extended by the taxonomy steward, not treated as exhaustive.

## 2. Taxonomy layers

| Layer | Question it answers | Workbook sheet | Size in v1.0 |
|---|---|---|---|
| Equipment class | What kind of machine? | `Equipment_Taxonomy` | 5 nodes (root, rotating, 3 classes) |
| Subsystem / assembly | Which functional block? | `FMEA_Taxonomy` (col C) | see §4 |
| Component / maintainable item | Which replaceable part? | `FMEA_Taxonomy` (col D), `Component_Taxonomy` | 30 in FMEA rows; 27 in vocabulary list |
| Failure mode | How does it fail (mechanism)? | `FMEA_Taxonomy` (col E) | 30 |
| Failure effect (local / plant) | What happens as a result? | `FMEA_Taxonomy` (col G) | 30 |
| Failure cause | Why does it fail? | `FMEA_Taxonomy` (col H) | 30 |
| Corrective action | What fixes it? | `FMEA_Taxonomy` (col I) | 30 |
| Symptom vocabulary | What does the technician observe or report? | `Failure_Mode_Vocabulary` | 28 |

Two layers are easy to confuse and must be kept apart:

- **Failure mode** = the engineering mechanism (e.g. *Cavitation*, *Bearing Wear*). Used in the FMEA.
- **Symptom** = what a technician reports (e.g. *Unusual pump noise*, *Excessive vibration*). Used as the entry point of a case and in `Failure_Mode_Vocabulary`.

One symptom can map to several failure modes (the *symptom collision* problem, e.g. cavitation vs bearing wear both produce noise and vibration). Resolving that collision is a retrieval/diagnosis task, not a taxonomy task; the taxonomy only makes the candidate set explicit.

## 3. Equipment classes

```
EQ-ROOT        Industrial asset
└── EQ-ROTATING  Rotating equipment
    ├── EQ-PUMP    Pump            (scope in v1.0: Centrifugal Pump)
    ├── EQ-MOTOR   Electric motor  (scope in v1.0: Three-Phase Induction Motor)
    └── EQ-COMP    Air compressor  (scope in v1.0: Rotary Screw Air Compressor)
```

| ID | Name | Parent | Definition |
|---|---|---|---|
| `EQ-ROOT` | Industrial asset | – | Top-level project taxonomy root. |
| `EQ-ROTATING` | Rotating equipment | `EQ-ROOT` | Project grouping for rotating machinery. |
| `EQ-PUMP` | Pump | `EQ-ROTATING` | Machine used to impart energy to a liquid and move it through a system. |
| `EQ-MOTOR` | Electric motor | `EQ-ROTATING` | Electric machine converting electrical energy to mechanical output. |
| `EQ-COMP` | Air compressor | `EQ-ROTATING` | Machine that increases air pressure by reducing its volume. |

`EQ-ROOT` and `EQ-ROTATING` are project groupings, not ISO codes. Plant and area levels sit above `EQ-ROOT` and are defined in [`asset-hierarchy.md`](asset-hierarchy.md).

## 4. Code scheme

Each FMEA row carries a project-local code of the form:

```
<CLASS>.<SUBSYSTEM>.<ITEM> | ISO FM: <ISO 14224 failure-mode abbreviation>
e.g.  PUMP.BRNG.ROLL | ISO FM: VIB
```

- The hierarchy part (`PUMP.BRNG.ROLL`) is a **project code**. It is **not** an official ISO 14224 code.
- The `ISO FM` part is an ISO 14224 Annex B failure-mode abbreviation (see [`iso-14224-mapping.md`](iso-14224-mapping.md)).
- All 30 hierarchy codes are unique.

Class prefixes in use: `PUMP`, `ELEC.MOT` / `MOT` (motor), `COMP`.

> **Known inconsistency:** motor codes use `ELEC.MOT.*` for 9 rows but `MOT.MNTG.FEET` for the soft-foot row. Pick one prefix (`MOT` recommended, matching `PUMP` / `COMP`) before the codes are used as database keys.

## 5. Failure modes by equipment class

### 5.1 Centrifugal Pump (`EQ-PUMP`) – 10 failure modes

| # | Code | Subsystem | Component | Failure mode | ISO FM |
|---|---|---|---|---|---|
| 1 | `PUMP.BRNG.ROLL` | Bearing Assembly | Rolling Element Bearing | Bearing Wear | `VIB` |
| 2 | `PUMP.SEAL.FACE` | Mechanical Seal | Seal Faces (Rotating / Stationary) | Seal Face Leakage | `ELP` |
| 3 | `PUMP.HYDR.IMPL` | Hydraulic End | Impeller | Cavitation | `NOI` |
| 4 | `PUMP.HYDR.WEAR` | Hydraulic End | Impeller and Wear Rings | Impeller / Wear Ring Wear | `LOO` |
| 5 | `PUMP.DRVT.CPLG` | Drive Train | Flexible Coupling | Coupling Misalignment | `VIB` |
| 6 | `PUMP.SUCT.STRN` | Suction Line | Suction Strainer | Strainer Blockage | `PLU` |
| 7 | `PUMP.SHFT.SHAF` | Shaft Assembly | Pump Shaft | Shaft Fatigue Fracture | `STD` |
| 8 | `PUMP.SUCT.PRIM` | Suction and Priming | Suction Line Joints and Gland Seal Interface | Air Ingress / Loss of Prime | `LOO` |
| 9 | `PUMP.HYDR.RECR` | Hydraulic End | Impeller and Casing Volute | Low-Flow Recirculation | `VIB` |
| 10 | `PUMP.BRNG.SEAL` | Bearing Assembly | Bearing Housing Isolators / Lip Seals | Bearing Housing Seal Failure | `ELU` |

### 5.2 Three-Phase Induction Motor (`EQ-MOTOR`) – 10 failure modes

| # | Code | Subsystem | Component | Failure mode | ISO FM |
|---|---|---|---|---|---|
| 1 | `ELEC.MOT.STAT` | Stator & Windings | Winding Insulation (Copper Magnet Wire and Varnish) | Insulation Breakdown | `BRD` |
| 2 | `ELEC.MOT.BRNG` | Bearing Assembly | Drive-End Bearing and Grease | Bearing Overheating (Lubrication Failure) | `OHE` |
| 3 | `ELEC.MOT.ROTR` | Rotor Assembly | Squirrel-Cage Rotor Bars and End Rings | Broken Rotor Bar | `VIB` |
| 4 | `ELEC.MOT.COOL` | Cooling System | Cooling Fan and Cowl | Cooling Airflow Blockage | `OHE` |
| 5 | `ELEC.MOT.TERM` | Terminal Box | Terminal Lugs and Connections | Loose Electrical Connection | `OHE` |
| 6 | `MOT.MNTG.FEET` | Mounting and Foundation | Motor Feet and Foundation Bolts | Soft Foot / Mechanical Looseness | `VIB` |
| 7 | `ELEC.MOT.SUPP` | Power Supply | Supply Phase Conductors, Fuses and Contactor | Single-Phasing (Phase Loss) | `PDE` |
| 8 | `ELEC.MOT.BRDC` | Bearing Assembly | Bearing (Inverter-Fed Shaft Currents) | Bearing Electrical Discharge Damage (Fluting) | `VIB` |
| 9 | `ELEC.MOT.AGAP` | Rotor-Stator Interface | Air Gap (Rotor and Stator Core) | Air-Gap Eccentricity / Rotor-Stator Rub | `VIB` |
| 10 | `ELEC.MOT.IMBL` | Rotor Assembly | Rotor Core and Shaft | Rotor Imbalance | `VIB` |

### 5.3 Rotary Screw Air Compressor (`EQ-COMP`) – 10 failure modes

| # | Code | Subsystem | Component | Failure mode | ISO FM |
|---|---|---|---|---|---|
| 1 | `COMP.AEND.ROTR` | Air End | Rotor Screws (Male / Female) | Rotor Wear / Clearance Increase | `LOO` |
| 2 | `COMP.OSEP.ELEM` | Oil Separation System | Oil Separator Element | Separator Element Clogging | `PLU` |
| 3 | `COMP.INTK.FILT` | Air Intake | Intake Air Filter | Clogged Air Filter | `LOO` |
| 4 | `COMP.COOL.COLR` | Cooling System | Oil Cooler / Aftercooler | Cooler Fouling | `OHE` |
| 5 | `COMP.VALV.UNL` | Capacity Control | Inlet / Unloader Valve | Unloader Valve Sticking | `FTF` |
| 6 | `COMP.VALV.MPV` | Air-Oil Circuit | Minimum Pressure Valve | Minimum Pressure Valve Leakage / Sticking | `INL` |
| 7 | `COMP.AEND.BRNG` | Air End | Air End Bearings | Air End Bearing Failure | `VIB` |
| 8 | `COMP.OILS.THRM` | Oil System | Thermostatic (Temperature Control) Valve | Thermostatic Valve Sticking | `PDE` |
| 9 | `COMP.VALV.SOL` | Capacity Control | Solenoid Valve (Load / Unload) | Solenoid Valve Failure | `FTF` |
| 10 | `COMP.COND.DRN` | Condensate Management | Automatic Condensate Drain | Condensate Drain Blockage | `PLU` |

Full description, local/plant effect, cause and corrective action for every row are in the workbook sheet `FMEA_Taxonomy`.

## 6. Symptom vocabulary (`Failure_Mode_Vocabulary`)

28 symptom-level labels with project-local IDs (`FM-0xx`). They come from a synthetic pilot scenario, are **not** ISO codes, and no mechanism is inferred from them.

| ID | Symptom label | Class |
|---|---|---|
| `FM-002` | Abnormal startup noise | `EQ-COMP` |
| `FM-003` | Cavitation | `EQ-PUMP` |
| `FM-004` | Compressor fails to build pressure | `EQ-COMP` |
| `FM-005` | Compressor overheating | `EQ-COMP` |
| `FM-012` | Excessive compressor vibration | `EQ-COMP` |
| `FM-013` | Excessive condensate | `EQ-COMP` |
| `FM-016` | Excessive oil carryover | `EQ-COMP` |
| `FM-017` | Excessive power consumption | `EQ-PUMP` |
| `FM-018` | Excessive vibration | `EQ-PUMP` |
| `FM-019` | Frequent bearing failures | `EQ-PUMP` |
| `FM-020` | Frequent compressor cycling | `EQ-COMP` |
| `FM-028` | Insulation resistance degradation | `EQ-MOTOR` |
| `FM-029` | Low compressed-air pressure | `EQ-COMP` |
| `FM-030` | Low discharge pressure | `EQ-PUMP` |
| `FM-032` | Mechanical seal leakage | `EQ-PUMP` |
| `FM-034` | Motor abnormal noise | `EQ-MOTOR` |
| `FM-035` | Motor bearing overheating | `EQ-MOTOR` |
| `FM-036` | Motor excessive vibration | `EQ-MOTOR` |
| `FM-037` | Motor fails to start | `EQ-MOTOR` |
| `FM-038` | Motor hums but does not rotate | `EQ-MOTOR` |
| `FM-039` | Motor overheating | `EQ-MOTOR` |
| `FM-040` | Motor phase current imbalance | `EQ-MOTOR` |
| `FM-041` | Motor speed fluctuation | `EQ-MOTOR` |
| `FM-042` | Pump fails to deliver fluid | `EQ-PUMP` |
| `FM-043` | Pump overheating | `EQ-PUMP` |
| `FM-047` | Repeated motor overload trips | `EQ-MOTOR` |
| `FM-048` | Repeated pump shutdown | `EQ-PUMP` |
| `FM-050` | Unusual pump noise | `EQ-PUMP` |

The ID sequence has gaps (`FM-002` … `FM-050`) because the list was carried over from an earlier version. Do not renumber without updating every case that references an ID.

## 7. Component vocabulary (`Component_Taxonomy`)

27 flat component entries (no subsystem parent yet, `parent_subsystem_id` is empty).

- **Centrifugal Pump** (`EQ-PUMP`): Bearing assembly, Shaft, Mechanical seal, Impeller, Suction strainer, Coupling, Casing, Wear rings, Discharge line, Lubrication system
- **Three-Phase Induction Motor** (`EQ-MOTOR`): Stator winding, Rotor, Bearing, Cooling fan, Terminal box, Power supply, Coupling, Mounting base
- **Rotary Screw Air Compressor** (`EQ-COMP`): Air end, Oil separator, Aftercooler, Intercooler, Intake filter, Lubrication system, Drive belt, Pressure switch, Cooling system

## 8. Validation status and open items

All 30 FMEA rows are **Engineering Assumptions**. They were written from general reliability practice and cited at document level (no clause or page numbers). A row may be promoted to *Verified* only after its sources have been checked clause-by-clause.  All taxonomy and vocabulary sheets carry `pending_domain_review` / `project_taxonomy_pending_domain_approval`.

Open items for the taxonomy steward:

1. `Component_Taxonomy` and `Failure_Mode_Vocabulary` do not yet include the new components and failure modes added to `FMEA_Taxonomy` (e.g. rolling element bearing, air end bearings, solenoid valve, thermostatic valve, condensate drain; mechanism-level modes such as soft foot, single-phasing, EDM fluting).
2. Decide how symptoms (`FM-0xx`) link to failure modes (many-to-many mapping table).
3. Normalise motor code prefix (see §4).
4. `EQ-COMP` is defined as *Air compressor*, and the component list includes items not used by rotary screw machines (intercooler, drive belt). Confirm compressor subtype and boundary.
5. Replace document-level source citations with clause-level references after licensed-standard review.
