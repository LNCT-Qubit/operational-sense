"""Group 3 Final curation overlay for the 50 synthetic cases (Fix 2 and Fix 3).

Design: the SQL imports under database/ stay UNTOUCHED (provenance). This module is a pure, deterministic
function over the exported case records. It is used by
  * tools/export_synthetic_cases.py  (JSON dataset), and
  * tools/build_curation_sql.py      (generates database/sql/m09/m09_040_apply_curation.sql from the same diff),
so the JSON dataset and the database cannot drift apart.

Hard rules (from the task brief):
  * No OEM limits, torques, clearances, temperature/vibration thresholds, protection settings or site-specific
    safety procedures are created here. Locations are WORDS about where a reading is usually taken for the
    component named in the case; every suggested location is labelled "verification required".
  * A mapping is changed only when the project's own reference data (M06 component list) makes it unambiguous.
  * Anything not supported by the case stays visibly pending (never silently generic, never invented).
"""
from __future__ import annotations

import copy
import re

CURATION_VERSION = "g3-final-1"

GENERIC = " at Per OEM / site procedure (measurement point to be marked on equipment)"
SUFFIX_SUGGESTED = " [suggested location from equipment context; exact point per OEM/site procedure - verification required]"
SUFFIX_PENDING = " [measurement location not specified in source - pending Group 1 / OEM verification]"
ACCEPT_PREFIX = "PENDING VERIFICATION (no case-specific limit available in project data)"

# --------------------------------------------------------------------------------------------------
# Fix 2: subsystem resolutions. Only unambiguous, supported by the project's own M06 component reference.
# --------------------------------------------------------------------------------------------------
SUBSYSTEM_RESOLUTIONS = {
    "CASE-PUMP-010": {
        "equipment_class_id": "EQ-PUMP",
        "source_label": "Impeller and casing",
        "subsystem_name": "Hydraulic End",
        "evidence": ("M06 component reference (m06_equipment_component_reference): both 'Impeller' (PUMP.HYDR.IMPL), "
                     "'Impeller and Casing Volute' (PUMP.HYDR.RECR) and 'Impeller and Wear Rings' (PUMP.HYDR.WEAR) "
                     "belong to subsystem 'Hydraulic End' for EQ-PUMP; no other EQ-PUMP subsystem lists an impeller "
                     "or casing component. Subsystem only: component_name and taxonomy_code stay NULL because the "
                     "case could map to PUMP.HYDR.IMPL or PUMP.HYDR.RECR (ambiguous)."),
        "confirm_with": "Group 1 (domain) - confirmation requested",
    },
}

# Reasons an unresolved subsystem/component/taxonomy is NOT changed (case -> reason). Used by the register.
UNRESOLVED_REASONS = {
    "CASE-COMP-006": "Label 'Pressure control system' could be 'Capacity Control' (id 14) but the label also covers set-point/differential logic that the approved list does not name; not an exact or unique match.",
    "CASE-COMP-007": "Compound label ('Drive assembly and compressor element'); EQ-COMP has no drive-train or mounting subsystem in the approved list.",
    "CASE-COMP-010": "'Drive coupling and motor': EQ-COMP has no drive-train subsystem. 'Drive Train' exists only for EQ-PUMP; cross-class use would violate fk_case_class_subsystem.",
    "CASE-COMP-016": "'Controls and Instrumentation' is not an approved EQ-COMP subsystem and no M06 component or taxonomy code covers sensors/controllers.",
    "CASE-MOT-004": "'Starter circuit and motor supply': nearest approved subsystem is 'Power Supply' but its M06 component is 'Supply Phase Conductors, Fuses and Contactor'; the case is about an overload relay, which is not listed. Ambiguous.",
    "CASE-MOT-007": "'Motor and overload protection': compound label; no overload/protection subsystem or taxonomy code exists for EQ-MOTOR.",
    "CASE-MOT-010": "'Variable-frequency drive and motor': no drive/VFD subsystem or taxonomy code exists for EQ-MOTOR.",
    "CASE-MOT-017": "'Coupling': EQ-MOTOR has no coupling subsystem ('Drive Train / Flexible Coupling' exists only for EQ-PUMP; cross-class use is invalid).",
    "CASE-PUMP-011": "'Impeller and drive assembly' spans two approved subsystems (Hydraulic End and Drive Train); not unique.",
    "CASE-PUMP-012": "'Motor protection and pump system': compound label; no motor-protection subsystem exists for EQ-PUMP.",
}

# --------------------------------------------------------------------------------------------------
# Fix 3: measurement location rules. (regex on lower-cased quantity, location text or {class: text}).
# First match wins. Locations describe WHERE a reading is normally taken; they contain no numbers/limits.
# --------------------------------------------------------------------------------------------------
_UNIT = {"EQ-PUMP": "pump and its motor", "EQ-MOTOR": "motor", "EQ-COMP": "compressor air end and drive motor"}
ISOLATION_TOKENS = (r"insulation|ir/pi|winding resistance|continuity|resistance \(isolated\)|cable test|ground path|"
                    r"alignment|laser/dial|foot gap|uncoupled")

RULES = [
    (r"resistance \(isolated\)", {"EQ-COMP": "the solenoid valve coil terminals, with the circuit isolated and proven dead (site LOTO + approved electrical test procedure)"}),
    (r"insulation|ir/pi|winding resistance|continuity|cable test|ground path",
     "the motor terminal box and supply cable ends, with the circuit isolated and proven dead (site LOTO + approved electrical test procedure)"),
    (r"alignment|laser/dial", "the shaft coupling between motor and driven machine, after approved isolation (site LOTO)"),
    (r"foot gap", "the motor feet / base interface, after approved isolation (site LOTO)"),
    (r"mount gap", "the mounting pads and frame feet of the unit"),
    (r"uncoupled", "the motor alone with the coupling disconnected, under an approved procedure"),
    (r"thermograph", "the exterior surfaces of motor, frame and terminal area, from a safe distance (non-contact)"),
    (r"airflow", "the motor cooling-fan inlet and fan cowl"),
    (r"shaft voltage", "the motor shaft / bearing end, by a qualified person"),
    (r"current spectrum|mcsa", "one supply conductor of the motor at the starter / MCC, by a qualified person"),
    (r"motor current and power|motor current|running current|current vs nameplate|phase currents|^current$|motor power|^power$",
     "the motor supply conductors at the starter / MCC outgoing feeder (each phase)"),
    (r"control voltage", "the control-circuit terminals of the starter / controller"),
    (r"coil voltage", "the solenoid valve coil terminals"),
    (r"supply voltage|phase voltages|^voltage$", "the supply side of the starter / motor terminals"),
    (r"drive parameters", "the drive keypad / parameter list (drive display)"),
    (r"feedback signal", "the speed-feedback (encoder) circuit at the drive input terminals"),
    (r"actual speed|^speed$", "the drive display or a shaft tachometer reading on the motor / pump shaft"),
    (r"seal-housing temperature", "the surface of the seal housing / gland area, with a non-contact thermometer from a safe position"),
    (r"temperature rise in casing", "the pump casing surface, with a non-contact thermometer from a safe position"),
    (r"bearing temperature|housing surface temperature|housing temperature|vibration/temperature",
     "the bearing housing surface (drive end and non-drive end), with a non-contact thermometer from a safe position"),
    (r"winding/frame temperature", "the motor frame surface and the winding temperature indication, if fitted"),
    (r"fluid temperature", "the process fluid at the pump suction / casing (existing temperature indication, if fitted)"),
    (r"^ambient", "the ambient air near the unit, away from exhaust and heat sources"),
    (r"vibration", lambda cls: f"the bearing housings of the {_UNIT[cls]} (drive end and non-drive end)"),
    (r"strainer differential", "across the suction strainer (upstream vs downstream pressure points)"),
    (r"suction pressure", "the suction pressure gauge / tapping on the suction line"),
    (r"discharge/suction pressure", "the suction and discharge pressure gauges / tappings"),
    (r"discharge pressure and flow|discharge pressure/flow|head and flow|flow vs oem",
     "the discharge pressure gauge and flow indication on the discharge line (if fitted)"),
    (r"discharge pressure", "the discharge pressure gauge / transmitter on the pump discharge line"),
    (r"process fluid composition", "a process fluid sample taken from the pumped line or tank"),
    (r"rotation direction", "the motor shaft / fan, by visual check under approved isolation"),
    (r"lubricant analysis|oil sample", {"EQ-PUMP": "the bearing housing oil sump (sample point per OEM)"}),
    (r"oil analysis", {"EQ-COMP": "the compressor oil circuit sample point (per OEM)"}),
    (r"oil consumption", {"EQ-COMP": "the compressor oil level / top-up records"}),
    (r"separator [δΔ]p", "across the oil separator element (inlet-side vs outlet-side pressure points)"),
    (r"separator pressure", "the oil separator vessel pressure indication"),
    (r"intake vacuum", "the air intake downstream of the intake filter (vacuum tapping or indicator, if fitted)"),
    (r"discharge temp", "the air-end discharge temperature indication"),
    (r"^oil temp", "the compressor oil circuit temperature indication"),
    (r"cooler", "the cooler inlet and outlet connections (air side / oil side)"),
    (r"pressure band", "the controller pressure display (load / unload band)"),
    (r"pressure build time|line pressure", "the line pressure gauge / controller display"),
    (r"cycle count|^cycle$", "the controller load / unload cycle indication"),
    (r"control pressure|control air", "the control-air line to the unloader / inlet valve (pressure tapping, if fitted)"),
    (r"reference pressure", "a calibrated reference gauge at the sensor tapping point"),
    (r"^signal$", "the pressure transmitter output at the controller input terminals"),
    (r"^trend$", "the controller / PLC trend display of the pressure signal"),
    (r"^leakage$", "the air-line joints and fittings downstream of the compressor"),
    (r"drain cycle", "the automatic condensate drain outlet (observe the discharge cycle)"),
    (r"dewpoint|air quality", "the downstream compressed-air line (sampling point per site procedure)"),
    (r"fad test", "the compressor discharge, using the OEM-approved flow test method"),
]


def _location(quantity: str, cls: str, component: str | None):
    q = quantity.strip().lower()
    for pat, loc in RULES:
        if re.search(pat, q):
            if callable(loc):
                return loc(cls)
            if isinstance(loc, dict):
                if cls in loc:
                    return loc[cls]
                continue
            return loc
    return None


def needs_isolation(quantity: str) -> bool:
    return re.search(ISOLATION_TOKENS, quantity.strip().lower()) is not None


ISOLATION_WARNING = ("Requires a de-energised, isolated and proven-dead condition under the site LOTO / permit-to-work "
                     "before this check; qualified persons only. General guidance only - not an approved plant "
                     "procedure; site safety officer to confirm the tier assignment of this step.")


def improve_step(step: dict, case: dict) -> dict:
    """Return a curated copy of one step (Tier 2 measurement wording, isolation warning, Tier 3 linkage)."""
    s = dict(step)
    cm = s["check_measurement"]
    if s["tier"] == 2 and cm.endswith(GENERIC):
        quantity = cm[: -len(GENERIC)]
        loc = _location(quantity, case["equipment_class_id"], case.get("component_name"))
        if loc:
            s["check_measurement"] = f"{quantity} - measure at {loc}{SUFFIX_SUGGESTED}"
        else:
            s["check_measurement"] = f"{quantity}{SUFFIX_PENDING}"
        if needs_isolation(quantity):
            s["safety_warning"] = ISOLATION_WARNING
    elif s["tier"] == 3 and len(cm.strip()) < 60:
        t2 = [x["check_measurement"] for x in case["troubleshooting_steps"] if x["tier"] == 2]
        names = [re.split(r" - measure at | \[| at Per OEM", n)[0] for n in t2]
        s["check_measurement"] = (
            f"{cm.rstrip('.')}. Linked to suspected cause: {s['possible_failure_indication']} (unconfirmed). "
            f"After the action, repeat the Tier 2 checks ({'; '.join(names)}) and compare with the OEM/site baseline. "
            "Detailed work instructions and any limits require the OEM manual / site procedure (not provided here).")
    return s


def acceptance_text(case: dict) -> str:
    names = [re.split(r" - measure at | \[| at Per OEM", s["check_measurement"])[0]
             for s in case["troubleshooting_steps"] if s["tier"] == 2]
    sym = (case.get("symptom_structured") or "").strip().rstrip(".")
    return (f"{ACCEPT_PREFIX}: after the corrective action, repeat the Tier 2 checks ({'; '.join(names)}) at the same "
            "locations and compare with the OEM-specified limits or the approved site baseline (values not provided; "
            "requires OEM manual / site standard / expert verification). Also confirm the original symptom is no "
            f"longer observed: {sym}.")


def curate_case(case: dict, class_subsystems: dict) -> dict:
    """Return a curated deep copy of a case record. `class_subsystems` = {class_id: set(subsystem names)}."""
    c = copy.deepcopy(case)
    res = SUBSYSTEM_RESOLUTIONS.get(c["case_reference"])
    if res and c["subsystem_name"] is None:
        assert c["equipment_class_id"] == res["equipment_class_id"]
        assert c["subsystem_source_label"] == res["source_label"]
        assert res["subsystem_name"] in class_subsystems[c["equipment_class_id"]], "invalid subsystem for class"
        c["subsystem_name"] = res["subsystem_name"]
        c["provenance"]["assumptions"].append(
            f"SUBSYSTEM-RESOLUTION: {res['subsystem_name']} (source label {res['source_label']!r}) - {res['evidence']} "
            f"Needs: {res['confirm_with']}.")
    c["troubleshooting_steps"] = [improve_step(s, c) for s in case["troubleshooting_steps"]]
    # acceptance text is built from the ORIGINAL measurement names (Tier 2) so it is stable
    c["acceptance_criteria"] = acceptance_text(case)
    unresolved = []
    if c["subsystem_name"] is None: unresolved.append(f"UR-SUBSYS-{c['case_reference']}")
    if not c["component_name"]: unresolved.append(f"UR-COMP-{c['case_reference']}")
    if any(m["taxonomy_code"] is None for m in c["failure_mappings"]): unresolved.append(f"UR-TAX-{c['case_reference']}")
    if c["needs_depth_expansion"]: unresolved.append(f"UR-DEPTH-{c['case_reference']}")
    unresolved.append(f"UR-ACCEPT-{c['case_reference']}")
    c["provenance"]["unresolved_items"] = unresolved
    c["provenance"]["assumptions"].append(
        f"CURATION {CURATION_VERSION} (tools/curation.py): suggested measurement locations, pending-verification "
        "acceptance text, isolation warnings and, where unambiguous, subsystem mapping were applied on top of the SQL "
        "imports. Suggested locations are NOT OEM-verified.")
    return c


# --------------------------------------------------------------------------------------------------
# Safety procedure wording (database table safety_procedure). Wording only; no new procedures.
# --------------------------------------------------------------------------------------------------
SAFETY_SCOPE_SUFFIX = " | NOT an approved plant procedure; site safety officer / Group 1 verification required"
SAFETY_PROJECT_RULE_HAZARDS = ("Tier policy", "AI/retrieval caution")   # project rules, left unchanged
