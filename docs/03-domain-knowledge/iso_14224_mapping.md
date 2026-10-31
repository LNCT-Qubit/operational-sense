# ISO 14224 Mapping

**FMEA & Failure Classification** · Epic 1 · Owner: Group 1 (LNCT Qubit Cohort)

> Source workbooks: `services/backend/src/modules/taxonomy/G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx` and `Operational_Sense_Industrial_Knowledge_Base_g1.xlsx` (GitHub Issues #2, #5, and #6)

## 1. What This Mapping Does and Does Not Claim

**ISO 14224:2016** (*Petroleum, petrochemical and natural gas industries - Collection and exchange of reliability and maintenance data for equipment*, Edition 3) is used as the reference for equipment taxonomy, failure data, maintenance data, and data-quality concepts.

| Claim | Status |
|---|---|
| Each FMEA row is tagged with an ISO 14224 Annex B **failure-mode abbreviation** | **Yes** ($12$ distinct abbreviations used across $30$ FMEA rows and $50$ cases) |
| Project hierarchy codes (`PUMP.BRNG.ROLL` etc.) are ISO codes | **No.** They are project-local database keys |
| Equipment classes map one-to-one to ISO 14224 equipment classes | **Not verified.** Boundary and subunit mapping needs the licensed standard |
| Clause/table-level citations | **Not yet.** Sources are cited at document level only |
| Hinglish symptom descriptions (`symptom_reported_hinglish`) are part of ISO 14224 | **No.** They are a project extension for `pgvector` semantic search |

The standard is copyrighted. This repository contains only project-authored labels and abbreviations, not reproduced standard text or tables. Use an authorised copy for any detailed code-level work.

## 2. Failure-Mode Abbreviations Used

Abbreviations are from ISO 14224 Annex B. The expansions below are working labels; confirm exact wording against the licensed standard.

| Abbrev. | Working Label | Rows | Failure Modes Tagged |
|---|---|---|---|
| `VIB` | Vibration | 9 | Bearing Wear; Coupling Misalignment; Low-Flow Recirculation; Broken Rotor Bar; Soft Foot / Mechanical Looseness; Bearing Electrical Discharge Damage (Fluting); Air-Gap Eccentricity / Rotor-Stator Rub; Rotor Imbalance; Air End Bearing Failure |
| `LOO` | Low output | 4 | Impeller / Wear Ring Wear; Air Ingress / Loss of Prime; Rotor Wear / Clearance Increase; Clogged Air Filter |
| `OHE` | Overheating | 4 | Bearing Overheating (Lubrication Failure); Cooling Airflow Blockage; Loose Electrical Connection; Cooler Fouling |
| `PLU` | Plugged / choked | 3 | Strainer Blockage; Separator Element Clogging; Condensate Drain Blockage |
| `FTF` | Fail to function | 2 | Unloader Valve Sticking; Solenoid Valve Failure |
| `PDE` | Parameter deviation | 2 | Single-Phasing (Phase Loss); Thermostatic Valve Sticking |
| `BRD` | Breakdown | 1 | Insulation Breakdown |
| `ELP` | External leakage - process medium | 1 | Seal Face Leakage |
| `ELU` | External leakage - utility medium | 1 | Bearing Housing Seal Failure |
| `INL` | Internal leakage | 1 | Minimum Pressure Valve Leakage / Sticking |
| `NOI` | Noise | 1 | Cavitation |
| `STD` | Structural deficiency | 1 | Shaft Fatigue Fracture |

## 3. Row-Level Mapping

Every FMEA row, with its project code, ISO abbreviation, and primary cited engineering sources.

### 3.1 Centrifugal Pump (`EQ-PUMP`)

| Project Code | Failure Mode | ISO FM | Primary Cited Sources |
|---|---|---|---|
| `PUMP.BRNG.ROLL` | Bearing Wear | `VIB` | ISO 14224:2016 Annex B; ISO 281 (rolling bearing life); Bloch & Geitner, Machinery Failure Analysis and Troubleshooting |
| `PUMP.SEAL.FACE` | Seal Face Leakage | `ELP` | ISO 21049 / API 682 (pump shaft sealing systems); API 610 / ISO 13709; Bloch & Budris, Pump User's Handbook |
| `PUMP.HYDR.IMPL` | Cavitation | `NOI` | ANSI/HI 9.6.1 (NPSH margin guideline); Gülich, Centrifugal Pumps; Karassik et al., Pump Handbook |
| `PUMP.HYDR.WEAR` | Impeller / Wear Ring Wear | `LOO` | API 610 / ISO 13709; Karassik et al., Pump Handbook; Kirloskar pump O&M manual |
| `PUMP.DRVT.CPLG` | Coupling Misalignment | `VIB` | API 610 / ISO 13709; ANSI/HI 9.6.4 (rotodynamic pump vibration); Bloch & Geitner, Machinery Failure Analysis and Troubleshooting |
| `PUMP.SUCT.STRN` | Strainer Blockage | `PLU` | ANSI/HI 9.6.1 (suction conditions); Kirloskar pump O&M manual; ISO 14224:2016 Annex B |
| `PUMP.SHFT.SHAF` | Shaft Fatigue Fracture | `STD` | API 610 / ISO 13709 (shaft stiffness and deflection); Gülich, Centrifugal Pumps; Bloch & Geitner, Machinery Failure Analysis and Troubleshooting |
| `PUMP.SUCT.PRIM` | Air Ingress / Loss of Prime | `LOO` | Karassik et al., Pump Handbook; Kirloskar pump O&M manual; ISO 14224:2016 Annex B |
| `PUMP.HYDR.RECR` | Low-Flow Recirculation | `VIB` | ANSI/HI 9.6.3 (allowable operating region); Gülich, Centrifugal Pumps; API 610 / ISO 13709 |
| `PUMP.BRNG.SEAL` | Bearing Housing Seal Failure | `ELU` | API 610 / ISO 13709 (bearing housing protection); Bloch & Geitner, Machinery Failure Analysis and Troubleshooting; Kirloskar pump O&M manual |

### 3.2 Three-Phase Induction Motor (`EQ-MOTOR`)

| Project Code | Failure Mode | ISO FM | Primary Cited Sources |
|---|---|---|---|
| `ELEC.MOT.STAT` | Insulation Breakdown | `BRD` | IEEE Std 43-2013 (insulation resistance testing); Bonnett & Soukup, stator and rotor failures in squirrel-cage motors (IEEE Trans. Ind. Appl., 1992); IEC 60034-1 |
| `ELEC.MOT.BRNG` | Bearing Overheating (Lubrication Failure) | `OHE` | ISO 281; ABB Low Voltage Motors installation, operation, maintenance manual; Bonnett & Soukup (IEEE Trans. Ind. Appl., 1992) |
| `ELEC.MOT.ROTR` | Broken Rotor Bar | `VIB` | Thomson & Fenger, Current Signature Analysis to Detect Induction Motor Faults (IEEE Ind. Appl. Mag., 2001); Bonnett & Soukup (IEEE Trans. Ind. Appl., 1992) |
| `ELEC.MOT.COOL` | Cooling Airflow Blockage | `OHE` | IEC 60034-6 (methods of cooling); IEC 60034-1; NEMA MG 1 |
| `ELEC.MOT.TERM` | Loose Electrical Connection | `OHE` | NEMA MG 1; IEC 60034-1; ABB Low Voltage Motors installation, operation, maintenance manual |
| `MOT.MNTG.FEET` | Soft Foot / Mechanical Looseness | `VIB` | ISO 20816-1 (vibration evaluation); Bloch & Geitner, Machinery Failure Analysis and Troubleshooting; ABB Low Voltage Motors manual |
| `ELEC.MOT.SUPP` | Single-Phasing (Phase Loss) | `PDE` | NEMA MG 1 (voltage unbalance); IEC 60034-1; Bonnett & Soukup (IEEE Trans. Ind. Appl., 1992) |
| `ELEC.MOT.BRDC` | Bearing Electrical Discharge Damage (Fluting) | `VIB` | IEC TS 60034-25 (converter-fed motors); ABB Low Voltage Motors manual; Bonnett & Soukup (IEEE Trans. Ind. Appl., 1992) |
| `ELEC.MOT.AGAP` | Air-Gap Eccentricity / Rotor-Stator Rub | `VIB` | Thomson & Fenger (IEEE Ind. Appl. Mag., 2001); Bonnett & Soukup (IEEE Trans. Ind. Appl., 1992); ISO 20816-1 |
| `ELEC.MOT.IMBL` | Rotor Imbalance | `VIB` | ISO 21940-11 (formerly ISO 1940-1, balance quality); ISO 20816-1; Bloch & Geitner, Machinery Failure Analysis and Troubleshooting |

### 3.3 Rotary Screw Air Compressor (`EQ-COMP`)

| Project Code | Failure Mode | ISO FM | Primary Cited Sources |
|---|---|---|---|
| `COMP.AEND.ROTR` | Rotor Wear / Clearance Increase | `LOO` | API 619 (rotary positive displacement compressors); Atlas Copco Compressed Air Manual; ISO 14224:2016 Annex B |
| `COMP.OSEP.ELEM` | Separator Element Clogging | `PLU` | Atlas Copco GA 37 instruction book (GA 30-90 series); Atlas Copco Compressed Air Manual; ISO 8573-1 (compressed air purity) |
| `COMP.INTK.FILT` | Clogged Air Filter | `LOO` | Atlas Copco Compressed Air Manual; Atlas Copco GA 37 instruction book; ISO 8573-1 |
| `COMP.COOL.COLR` | Cooler Fouling | `OHE` | Atlas Copco GA 37 instruction book; Atlas Copco Compressed Air Manual; ISO 14224:2016 Annex B |
| `COMP.VALV.UNL` | Unloader Valve Sticking | `FTF` | Atlas Copco GA 37 instruction book; API 619; Atlas Copco Compressed Air Manual |
| `COMP.VALV.MPV` | Minimum Pressure Valve Leakage / Sticking | `INL` | Atlas Copco GA 37 instruction book; Atlas Copco Compressed Air Manual |
| `COMP.AEND.BRNG` | Air End Bearing Failure | `VIB` | API 619; ISO 281; Atlas Copco Compressed Air Manual |
| `COMP.OILS.THRM` | Thermostatic Valve Sticking | `PDE` | Atlas Copco GA 37 instruction book; Atlas Copco Compressed Air Manual |
| `COMP.VALV.SOL` | Solenoid Valve Failure | `FTF` | Atlas Copco GA 37 instruction book; Atlas Copco Compressed Air Manual |
| `COMP.COND.DRN` | Condensate Drain Blockage | `PLU` | ISO 8573-1; Atlas Copco Compressed Air Manual; Atlas Copco GA 37 instruction book |

## 4. Equipment-Class Alignment

| Project Class | Canonical ID | Legacy Tag | Relationship to ISO 14224 (as recorded in workbook) |
|---|---|---|---|
| Industrial asset | `EQ-ROOT` | N/A | Project hierarchy root; not an ISO code. |
| Rotating equipment | `EQ-ROTATING` | N/A | Project grouping; not an ISO code. |
| Pump | `EQ-PUMP` | `PUMP-CENT` | Equipment-class concept aligned in spirit; verify exact class/subunit mapping against licensed standard and asset boundary. |
| Electric motor | `EQ-MOTOR` | `MOTOR-IM3` | Project extension for broad manufacturing scope; verify applicability and exact taxonomy against asset context. |
| Air compressor | `EQ-COMP` | `COMP-SCREW` | Equipment-class concept; confirm compressor subtype and boundary for each asset. |

Summary: pump is aligned in concept with ISO 14224 equipment classes; **electric motor is a project extension** for broad manufacturing scope; air compressor needs subtype and boundary confirmation per asset.

## 5. Observations from the Mapping & Role of Vector Search

* **Vibration Dominates (`VIB` Cannot Diagnose Alone):** $9$ of $30$ rows ($30\%$) are tagged `VIB`, covering very different physical mechanisms (bearing wear, coupling misalignment, rotor imbalance, air-gap eccentricity, EDM fluting, soft foot, broken rotor bar, low-flow recirculation, and air-end bearing failure). `VIB` is therefore a broad classification level, not a diagnosis.
* **Disambiguation via Hinglish & Semantic Vector Search (`pgvector`):** While the project hierarchy code (`PUMP.BRNG.ROLL`, `ELEC.MOT.ROTR`, etc.) and failure mode name carry the discriminating engineering identity, a shop-floor technician rarely knows the taxonomy code upfront. In **Operational Sense**, the $50$ cases in `Import_View` pair each taxonomy code with `symptom_reported_hinglish` and `symptom_structured` embeddings so `pgvector` can distinguish between different `VIB` mechanisms directly from natural technician descriptions.
* **Mechanism vs. Manifestation:** Where a row's mode is a *mechanism* (e.g. cavitation) and ISO FM is a *manifestation* (noise), the tag records the observable effect class. This is intentional for `NOI`, `VIB`, and `OHE`.
* **Process vs. Utility Leakage:** `ELP` vs `ELU` distinguishes leakage of the process medium (mechanical seal face leakage, `PUMP.SEAL.FACE`) from leakage of the utility medium (bearing-housing lubricant seal failure, `PUMP.BRNG.SEAL`).
* **Reviewer Judgement Calls:** Some tags are judgement calls that the domain reviewer should confirm: `STD` for shaft fatigue fracture, `PDE` for single-phasing and thermostatic valve sticking, `INL` for minimum pressure valve leakage, and `FTF` for unloader and solenoid valve faults.

## 6. Next Steps for a Licensed Review

1. Obtain an authorised copy of **ISO 14224:2016**.
2. Confirm each of the $12$ abbreviations and its official definition.
3. Confirm equipment-class and subunit mapping for pump, motor, and compressor, and record the boundary for each asset.
4. Replace document-level citations with clause/table references and update the row status from *Engineering Assumption* to *Verified* where supported.
5. Record any deviations (including general manufacturing motor mappings and Hinglish symptom fields) as formal project extensions.

## 7. Source Register Entries

* `SRC-STD-001` - **ISO 14224:2016**, International standard, ISO, 2016, Edition 3; confirmed current in ISO catalogue. Status: *reference identified; clause-level mapping requires licensed standard review*. <https://www.iso.org/standard/64076.html>
* Related: `SRC-STD-002` - **IEC 60812:2018** for the FMEA process (see `fmea-methodology.md`).