# Domain Assumptions, Definitions and References

**FMEA & Failure Classification** · Epic 1 · Owner: Group 1 (Product & Domain Research)
> Source files: [`G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx`](../../services/backend/src/modules/taxonomy/G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx) · [`Operational_Sense_Industrial_Knowledge_Base_g1.xlsx`](../../services/backend/src/modules/sources/Operational_Sense_Industrial_Knowledge_Base_g1.xlsx) · [`Operational_Sense_Equipment_Hierarchy_Proposal.xlsx`](../../services/backend/src/modules/sources/Operational_Sense_Equipment_Hierarchy_Proposal.xlsx) · [`Operational_Sense_Hierarchy_Diagram.pdf`](../../services/backend/src/modules/sources/Operational_Sense_Hierarchy_Diagram.pdf)

## 1. Purpose and how to use this document

This is the shared reference for the domain behind Operational Sense: which machines are in scope, what we assume about how they are run and maintained, what each term means, and which standards and books the content draws on. It sits beside the four classification documents and should be read first by anyone writing a case, a schema field, a prompt or a test.

| Document | What it covers |
|---|---|
| [`asset-hierarchy.md`](asset-hierarchy.md) | The seven-level tree from plant to failure mode |
| [`failure-taxonomy.md`](failure-taxonomy.md) | Equipment classes, failure modes, code scheme, symptom vocabulary |
| [`fmea-methodology.md`](fmea-methodology.md) | FMEA record structure and the severity / occurrence / detection scales |
| [`iso-14224-mapping.md`](iso-14224-mapping.md) | ISO 14224 failure-mode abbreviations used per row |
| **This document** | Assumptions, definitions, references |

## 2. Domain scope

| Item | In scope |
|---|---|
| Industry setting | General manufacturing and utility plants: water, compressed air, chemical dosing, cooling, conveying, extrusion, boiler feed |
| Equipment classes | Pump (`EQ-PUMP`), Electric motor (`EQ-MOTOR`), Air compressor (`EQ-COMP`) |
| Equipment types | Centrifugal pump, three-phase induction motor, rotary screw air compressor (oil-flooded) |
| Plants / areas | 3 utility plants (A, B, C) and 28 plant-area pairs |
| Failure coverage | 30 failure modes in the FMEA taxonomy (10 per class); 41 component-level entries in the hierarchy |
| Case base | 50 troubleshooting cases: 17 pump, 17 motor, 16 compressor |
| Users | Maintenance technicians and supervisors on the shop floor |
| Out of scope | Reciprocating, centrifugal and dry-screw compressors; positive-displacement pumps; synchronous and DC motors; instrumentation loops beyond the sensors named in the hierarchy |

## 3. Domain assumptions

Each assumption has an ID so that schema notes, prompts and tests can point to it.

### 3.1 Equipment and operating context

| ID | Assumption | What follows from it |
|---|---|---|
| DA-01 | Equipment is run in a utility or process-support role, in continuous or long-cycle duty, not in a safety-instrumented service. | Failure effects are written as local (machine) and plant (process) consequences. Safety-system failure is not modelled. |
| DA-02 | A centrifugal pump is a rotodynamic machine that adds energy to a liquid through an impeller, driven by a separate electric motor through a coupling. | The pump and the driver are separate equipment items. Overload protection sits with the motor and its starter (see DA-12). |
| DA-03 | The motor is a three-phase squirrel-cage induction motor, direct-on-line or inverter-fed. | Rotor-bar, air-gap, supply-phase and inverter-related shaft-current failures are in scope. |
| DA-04 | The compressor is an oil-flooded rotary screw machine with an air end, oil separation, cooler, capacity control and condensate drain. | Piston-compressor parts (intercooler, drive belt) in the earlier component list are not part of the screw-compressor failure modes. |
| DA-05 | Equipment makes named in cases (for example Kirloskar, KSB, Grundfos, Atlas Copco, Siemens, WEG) identify typical machines of that class. They are not a record of an installed base. | Equipment instances need a tag level between Area and Equipment class in a real plant. Model-specific limits must come from the OEM manual. |
| DA-06 | Plant and area names (for example Cooling Water Circuit, Main Compressed Air Header, Raw Water Intake) are a seed list of typical utility areas. The same area name can occur in more than one plant. | Area IDs carry the plant (`AR-<plant>-<AREA>`). |
| DA-07 | The ISO 14224 industry scope is petroleum, petrochemical and natural gas. Applying it to general manufacturing is a project extension. | Electric motor as a class, and several subsystems, follow the project hierarchy rather than the standard's taxonomy. |

### 3.2 Failure analysis

| ID | Assumption | What follows from it |
|---|---|---|
| DA-08 | A failure mode names the physical mechanism (cavitation, bearing wear, insulation breakdown). A symptom is what a technician sees or hears. The two are kept in separate vocabularies. | One symptom can point to several failure modes. Resolving that is a diagnostic task, not a taxonomy task. |
| DA-09 | Each FMEA row attributes one failure mode to one maintainable item. | Composite names such as "Impeller and Wear Rings" are carried as written; splitting them into atomic components is a planned refinement. |
| DA-10 | Effects are recorded at two levels: **local** (what is seen at the machine) and **plant** (what happens to the process). | Case text can also use four levels: component, equipment, operational, and if unresolved. |
| DA-11 | Several candidate causes are listed per failure mode; the cause on a case is the **suspected cause**. Differential diagnosis lists what else could produce the same symptom and how to tell them apart. | Cases do not claim a confirmed root cause. A negative visual finding never rules a cause out. |
| DA-12 | Protective trips (overload relay, thermal trip) are symptoms of an underlying condition, not equipment faults in themselves. Protection must never be bypassed or reset repeatedly without finding the cause. | Repeated-trip cases point to excess load, supply fault, setting error or mechanical binding. |
| DA-13 | The vibration signature alone does not identify a mechanism. Bearing wear, misalignment, imbalance, looseness, eccentricity and electrical discharge damage all raise vibration. | Vibration-class failure modes (`VIB`) are told apart by spectrum, phase, direction and context. |
| DA-14 | Recurring failure (for example repeated bearing replacement) usually means the ingress or loading path was not corrected, not that the replacement part was poor. | Recurrence cases point to the ingress source, lubrication practice or alignment. |

### 3.3 Measurement, thresholds and parts

| ID | Assumption | What follows from it |
|---|---|---|
| DA-15 | No universal numerical threshold is given for vibration, temperature, pressure, current or insulation resistance. | Acceptance uses the OEM specification or an approved site baseline taken at the same load and speed. |
| DA-16 | Cases do not carry recorded measurement values. They state what to measure, with which instrument, where, and how to interpret the reading against a baseline. | Measurement fields hold method and interpretation, not readings. |
| DA-17 | Relubrication intervals, torque values, clearances and alignment tolerances come from the OEM manual. | No interval or tolerance is stated in the knowledge base. |
| DA-18 | Spare-part numbers and compatibility come from the OEM parts list. | Spare-part entries name the function and the part type, not a catalogue number. |
| DA-19 | Vibration evaluation follows the ISO 20816 approach (measurement and evaluation method), using the machine's own baseline. | Zone limits are not copied into project content. |

### 3.4 Safety and troubleshooting tiers

| ID | Assumption | What follows from it |
|---|---|---|
| DA-20 | Troubleshooting runs in three tiers of increasing risk: Tier 1 observation, Tier 2 non-invasive measurement, Tier 3 intrusive corrective action. | Each diagnostic step belongs to exactly one tier. A step that could belong to two tiers goes to the higher-risk one. |
| DA-21 | Tier 3 work needs lockout/tagout (LOTO) and supervisor approval. | The `loto_requirement` and `supervisor_approval_required` fields are populated for every case. |
| DA-22 | Tier 2 work is done by trained personnel; electrical measurements only by a qualified person under an approved procedure. | Current, voltage and insulation tests carry a qualified-person instruction. |
| DA-23 | General hazards apply to every class: unexpected start-up, rotating parts, stored energy, hot surfaces, lubricant or chemical exposure. Class-specific hazards: pressurised or hazardous liquid and dry running (pump); electrical energy, residual charge and insulation testing (motor); pressurised air and hot oil (compressor). | Site procedures govern; the project text is general guidance. |

### 3.5 Data, language and retrieval

| ID | Assumption | What follows from it |
|---|---|---|
| DA-24 | Technicians describe symptoms in colloquial Hinglish (Hindi-English mix), for example "pump se zyada shor aur vibration aa raha hai". | Each case keeps the original Hinglish symptom and a structured English description. Both are embedded. |
| DA-25 | Retrieval is two-stage: structured filters first (class, subsystem, component, taxonomy code), then similarity within the filtered set. | Class, subsystem and taxonomy code must be present and consistent for a case to be filterable. |
| DA-26 | Results are shown as resemblance to past cases. Similarity is not a diagnosis and carries no probability. | The interface never states a cause as certain. |
| DA-27 | A blank taxonomy code or vocabulary ID means a known gap. It is loaded as NULL, not as text and not as an invented value. | Gap flags (`taxonomy_gap`, `vocab_gap`) travel with the record. |
| DA-28 | Case severity uses the project scale Low, Low-Medium, Medium, Medium-High, High, Critical. The FMEA severity score (1-5) is a separate scale. | Do not equate the two without a mapping table. |

## 4. Definitions

### 4.1 Asset hierarchy

| Term | Definition | ID pattern |
|---|---|---|
| Plant | A site or facility. | `PLT-<A/B/C>` |
| Area | A production line or plant section where equipment sits. | `AR-<plant>-<AREA-NAME>` |
| Equipment class | The broad kind of machine. Nearest ISO 14224 concept: equipment class. | `EQ-PUMP`, `EQ-MOTOR`, `EQ-COMP` |
| Equipment type | A specific design within a class (for example centrifugal pump). Nearest ISO concept: equipment type. | `TY-<CLASS>-<TYPE>` |
| Subsystem / assembly | A functional block of the machine (for example Bearing Assembly, Air End). Nearest ISO concept: subunit. | `SS-<CLASS>-<SUB>` |
| Component / maintainable item | The replaceable part a failure is attributed to. | `CP-<CLASS>-<SUB>-<nn>` |
| Failure mode (leaf) | The way a component fails. In ISO 14224 a failure mode is an attribute of a failure record; here it is also kept as a leaf so it can be filtered. | `MD-<CLASS>-<SUB>-<nn>-<nn>` |
| Taxonomy code | Project code `CLASS.SUBSYSTEM.ITEM` plus an ISO failure-mode abbreviation, for example `PUMP.BRNG.ROLL \| ISO FM: VIB`. The hierarchy part is a project code, not an ISO code. | – |
| Vocabulary ID | Project-local symptom label ID. | `FM-0xx` |

### 4.2 Failure and FMEA terms

| Term | Definition |
|---|---|
| Failure | Loss of the ability of an item to perform a required function. |
| Failure mode | The manner in which an item fails (mechanism level), for example cavitation, seal face leakage. |
| Failure mechanism | The physical or chemical process behind the failure, for example spalling, thermal cracking, elastomer hardening. |
| Failure cause | The circumstance that leads to the failure, for example contaminated grease, dry running, low NPSH available. |
| Failure effect (local) | What is observed at the machine itself. |
| Failure effect (plant) | The consequence for the process, production, safety or environment. |
| Symptom | What a technician reports or observes before the cause is known (noise, heat, leak, trip). |
| Suspected cause | The most likely cause stated on a case; the working hypothesis. |
| Differential diagnosis | The list of alternative causes for the same symptom and the observation that separates each one. |
| Corrective action | The repair or adjustment that removes the cause, written as steps a technician can carry out, ending with a post-repair check. |
| Early warning indicator | A trend or sign that shows before functional failure (rising bearing temperature, grease discolouration, pressure oscillation). |
| FMEA | Failure Mode and Effects Analysis: a structured way of listing failure modes with their effects, causes and actions. |
| FMECA | FMEA extended with criticality ranking. |
| Severity (S) | How serious the effect is, scale 1-5 (Negligible to Critical). Level 5 is escalated regardless of RPN. |
| Occurrence (O) | How often the cause or mode occurs, scale 1-5 (Rare to Very frequent). |
| Detection (D) | How likely the condition is caught before its effect, scale 1-5. A higher number means harder to detect (1 = almost certain detection, 5 = hidden). |
| RPN | Risk Priority Number = S x O x D, range 1-125. It never replaces the Severity 5 escalation rule. |
| Best efficiency point (BEP) | The flow at which a pump runs most efficiently. Operating far from it raises vibration, bearing load and wear. |
| NPSH available / required | Net positive suction head the system provides versus the head the pump needs to avoid cavitation. A margin is kept between them. |
| Cavitation | Vapour bubbles form where local pressure falls below vapour pressure, then collapse on impeller surfaces, causing noise, pitting and head loss. |
| Loss of prime / gas binding | Air in the casing or suction line breaks the liquid column so the impeller cannot move fluid. |
| Soft foot | Uneven contact of machine feet that distorts the frame and shifts alignment. |
| Single-phasing | Loss of one supply phase to a three-phase motor, causing severe current imbalance. |
| Polarisation index (PI) | Ratio of insulation resistance readings at two times; used to judge winding insulation condition. |
| Motor current signature analysis (MCSA) | Analysis of the motor current spectrum to detect faults such as broken rotor bars. |
| Fluting (electrical discharge machining of bearings) | Pattern etched on bearing raceways by high-frequency shaft currents from variable-speed drives. |
| Unloader / inlet valve | Valve that loads and unloads a screw compressor to match air demand. |
| Minimum pressure valve (MPV) | Valve that holds a minimum pressure in the separator vessel so oil circulates correctly. |
| Carry-over | Oil passing through the separator into the compressed-air line. |

### 4.3 Troubleshooting terms

| Term | Definition |
|---|---|
| Tier 1 | Zero-risk visual and sensory checks: oil sight glass, bolt tightness, leaks, discolouration, noise from a safe distance. |
| Tier 2 | Non-invasive measurement: infrared temperature, vibration pen or analyser, clamp meter, gauges. |
| Tier 3 | Intrusive corrective action. Always needs LOTO and supervisor approval. |
| LOTO | Lockout/tagout: isolating and locking every energy source before work, and confirming zero energy. |
| Reference value policy | The rule that acceptance limits come from the OEM specification or an approved site baseline, never from a universal figure. |
| Baseline | A reading of the same parameter, at the same load and speed, taken in normal condition on the same machine. |
| Source reliability grade | A to D grading of the source behind a case; D is engineering interpretation from general practice. |
| Mapping status | How a case links to the taxonomy and vocabulary: MAPPED (linked by case-level judgement), AMBIGUOUS (more than one fit), or FM-ID ONLY (vocabulary label without a taxonomy row). |
| Retrieval eligibility | A flag stating whether a case may be returned in search. |

### 4.4 ISO 14224 failure-mode abbreviations used

Abbreviations come from ISO 14224 Annex B. The expansions are paraphrased working labels; see the standard for exact wording.

| Abbrev. | Working label | Used for |
|---|---|---|
| `VIB` | Vibration | Bearing wear, misalignment, imbalance, looseness, eccentricity, fluting, recirculation |
| `NOI` | Noise | Cavitation, drive coupling element wear |
| `OHE` | Overheating | Lubrication failure, cooling blockage, loose connection, cooler fouling |
| `ELP` | External leakage, process medium | Seal face leakage |
| `ELU` | External leakage, utility medium | Bearing housing lubricant leakage |
| `INL` | Internal leakage | Minimum pressure valve leakage |
| `LOO` | Low output | Wear-ring wear, loss of prime, rotor wear, clogged intake filter |
| `HIO` | High output | High-flow run-out |
| `PLU` | Plugged / choked | Strainer, separator element, condensate drain, impeller passage |
| `BRD` | Breakdown | Insulation breakdown |
| `FTF` | Fail to function | Unloader valve, solenoid valve |
| `FTS` | Fail to start on demand | Overload relay trip preventing start |
| `STD` | Structural deficiency | Shaft fatigue fracture |
| `PDE` | Parameter deviation | Single-phasing, thermostatic valve sticking |
| `UST` | Spurious stop | Overload trips |
| `ERO` | Erratic output | Speed feedback fault |
| `SER` | Minor in-service problems | Control differential setting |
| `AIR` | Abnormal instrument reading | Pressure sensor drift |

## 5. Quick reference

### 5.1 Equipment in the hierarchy

| Class | Type | Subsystems | Components | Failure modes | Cases |
|---|---|---|---|---|---|
| Pump (`EQ-PUMP`) | Centrifugal pump (`TY-PUMP-CENT`) | 6 | 13 | 13 | 17 |
| Electric motor (`EQ-MOTOR`) | Three-phase induction motor (`TY-MOTOR-IND`) | 10 | 14 | 14 | 17 |
| Compressor (`EQ-COMP`) | Rotary screw air compressor (`TY-COMP-SCREW`) | 10 | 14 | 14 | 16 |
| **Total** | | **26** | **41** | **41** | **50** |

Of the 41 component-level entries, 30 come from the FMEA taxonomy and 11 are extension entries added to cover failure modes that appear in cases (pump 3, motor 4, compressor 4).

### 5.2 Subsystems by class

| Class | Subsystems |
|---|---|
| Pump | Bearing Assembly, Mechanical Seal, Hydraulic End, Drive Train, Suction System, Shaft Assembly |
| Motor | Stator and Windings, Bearing Assembly, Rotor Assembly, Cooling System, Terminal Box, Mounting and Foundation, Starter, Protection and Power Supply, Rotor-Stator Interface (Air Gap), Drive and Speed Control (VFD), Coupling |
| Compressor | Air End, Oil Separation and Air-Oil Circuit, Air Intake, Cooling System, Capacity Control, Oil System (Lubrication), Condensate Management, Controls and Instrumentation, Mounting and Foundation, Drive Train |

### 5.3 Symptom categories used on cases

Performance, Temperature, Vibration, Noise, Leakage, Protection trips, Control, Electrical, Starting, Speed, Moisture, Oil carryover, Recurring failure. A case can carry a combined category such as Noise/Vibration or Temperature/Noise.

### 5.4 FMEA scales

| Score | Severity | Occurrence | Detection |
|---|---|---|---|
| 1 | Negligible | Rare | Almost certain detection |
| 2 | Minor | Uncommon | High detectability |
| 3 | Moderate | Occasional | Moderate detectability |
| 4 | Major | Frequent | Low detectability |
| 5 | Critical | Very frequent | Very low detectability |

Criteria for each level are in [`fmea-methodology.md`](fmea-methodology.md).

### 5.5 Plants and areas

| Plant | Areas | Cases | Areas listed |
|---|---|---|---|
| Utility Plant A (`PLT-A`) | 9 | 16 | Chemical Dosing Line, Chilled Water Secondary Loop, Compressed Air Line, Cooling Water Circuit, Exhaust Blower Drive, Extruder Motor Line, Main Compressed Air Header, Plant Instrument Air Line, Raw Water Intake |
| Utility Plant B (`PLT-B`) | 11 | 18 | Chemical Dosing Line, Chilled Water Secondary Loop, Cooling Water Circuit, Exhaust Blower Drive, Extruder Motor Line, Main Compressed Air Header, Main Conveyor Drive, Plant Instrument Air Line, Raw Material Processing Line, Raw Water Intake, Utility Air Distribution |
| Utility Plant C (`PLT-C`) | 8 | 16 | Boiler Feedwater Line, Compressed Air Line, Cooling Water Circuit, Exhaust Blower Drive, Main Compressed Air Header, Plant Instrument Air Line, Raw Water Intake, Utility Air Distribution |

## 6. References

### 6.1 Standards

| Ref | Standard | Used for |
|---|---|---|
| S01 | **ISO 14224:2016**, *Petroleum, petrochemical and natural gas industries – Collection and exchange of reliability and maintenance data for equipment* (ISO, Edition 3). <https://www.iso.org/standard/64076.html> | Equipment taxonomy, failure-mode abbreviations, data-quality concepts |
| S02 | **IEC 60812:2018**, *Failure modes and effects analysis (FMEA and FMECA)* (IEC, Edition 3). <https://webstore.iec.ch/en/publication/26359> | FMEA process; separation of mode, effect, cause and action; criticality ranking |
| S03 | **ISO 20816-1:2016**, *Mechanical vibration – Measurement and evaluation of machine vibration – Part 1: General guidelines*. <https://www.iso.org/standard/63180.html> | Vibration measurement and evaluation approach |
| S04 | **ISO 20816-3:2022**, *Part 3: Industrial machinery with power above 15 kW and operating speeds between 120 r/min and 30 000 r/min* | Vibration evaluation for larger machines |
| S05 | **ISO 281**, *Rolling bearings – Dynamic load ratings and rating life* | Bearing life and lubrication principles |
| S06 | **ISO 21049 / API 682**, *Pumps – Shaft sealing systems for centrifugal and rotary pumps* | Mechanical seal practice, flush and quench plans |
| S07 | **IEEE Std 43**, *Recommended Practice for Testing Insulation Resistance of Electric Machinery* (2013) | Insulation resistance and polarisation index method |
| S08 | **ANSI/HI 9.6.1**, *Rotodynamic Pumps – Guideline for NPSH Margin* | NPSH margin and cavitation |
| S09 | **ISO 8573-1**, *Compressed air – Contaminants and purity classes* | Oil, water and particle purity of compressed air |
| S10 | **29 CFR 1910.147**, *The control of hazardous energy (lockout/tagout)*, OSHA. <https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147> | Lockout/tagout principle (site procedure governs) |
| S11 | **NFPA 70E**, *Standard for Electrical Safety in the Workplace* | Electrical work safety principle |

Row-level sources cited in the FMEA workbook (column K):

| Standard | Topic |
|---|---|
| API 610 / ISO 13709 | Centrifugal pumps for petroleum, petrochemical and natural gas industries |
| API 619 | Rotary-type positive-displacement compressors |
| ANSI/HI 9.6.3 | Allowable operating region for rotodynamic pumps |
| ANSI/HI 9.6.4 | Vibration of rotodynamic pumps |
| IEC 60034-1 | Rotating electrical machines: rating and performance |
| IEC 60034-6 | Rotating electrical machines: methods of cooling |
| IEC TS 60034-25 | Converter-fed motors |
| NEMA MG 1 | Motors and generators, including voltage unbalance |
| ISO 21940-11 (formerly ISO 1940-1) | Rotor balance quality |

### 6.2 Books and papers

- Bloch, H. P. and Geitner, F. K. *Machinery Failure Analysis and Troubleshooting*.
- Bloch, H. P. and Geitner, F. K. *Practical Machinery Management for Process Plants*, Vol. 1.
- Bloch, H. P. and Budris, A. R. *Pump User's Handbook*.
- Gülich, J. F. *Centrifugal Pumps*.
- Karassik, I. J. et al. *Pump Handbook*.
- Bonnett, A. H. and Soukup, G. C. Cause and analysis of stator and rotor failures in three-phase squirrel-cage induction motors. *IEEE Transactions on Industry Applications*, 1992.
- Thomson, W. T. and Fenger, M. Current signature analysis to detect induction motor faults. *IEEE Industry Applications Magazine*, 2001.

### 6.3 Manufacturer documentation

- Kirloskar centrifugal pump operation and maintenance manual.
- ABB Low Voltage Motors installation, operation and maintenance manual.
- Atlas Copco GA 37 instruction book (GA 30-90 series).
- Atlas Copco *Compressed Air Manual*.

Manufacturer manuals are the authority for model-specific limits, intervals, tolerances and part numbers (see DA-15 to DA-18).

### 6.4 Project documents

| Document | Role |
|---|---|
| `G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx` | Source of the FMEA rows, equipment and component lists, failure-mode vocabulary, scoring guide and source register |
| `Operational_Sense_Industrial_Knowledge_Base_g1.xlsx` | The 50 cases, diagnostic steps, measurement, spare-parts and safety reference sheets |
| `Operational_Sense_Equipment_Hierarchy_Proposal.xlsx` | Hierarchy nodes, component map and case links |
| `Operational_Sense_Hierarchy_Diagram.pdf` | Diagram of the hierarchy by class |
| [`asset-hierarchy.md`](asset-hierarchy.md), [`failure-taxonomy.md`](failure-taxonomy.md), [`fmea-methodology.md`](fmea-methodology.md), [`iso-14224-mapping.md`](iso-14224-mapping.md) | Classification documents for Issue #4 |
