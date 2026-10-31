# Operational Sense — Synthetic Troubleshooting Case Authoring Template (M09)

> **Status rule:** Every generated case is synthetic and DRAFT/demo-only until reviewed and approved by a qualified domain expert. Similarity is not diagnosis.

## Case identity and equipment
- Case reference:
- Equipment class (controlled vocabulary):
- Equipment model (mark illustrative if not sourced/verified):
- Subsystem label from source:
- Approved subsystem taxonomy ID (leave blank until mapped; do not guess):
- Component:
- Facility / production line (synthetic labels only for demo data):

## Symptom and context
- Technician symptom narrative (plain language; preserve observed facts):
- Structured symptom summary:
- Operating status / duty point:
- Frequency / duration / onset:
- Severity (proposed; explain basis):
- Actual measurements available? (Yes/No; list values, units, instrument, time, baseline and source if yes):

## Cause reasoning (not a diagnosis)
- Primary suspected cause (state uncertainty):
- Alternative causes:
- Failure mechanism (why the suspected cause could produce the symptoms):
- Differential checks that distinguish alternatives:
- Conditions requiring stop/escalation:

## Safe diagnostic steps
For each step include:
- Step number and tier (Tier 1 observation / Tier 2 measurement / Tier 3 corrective action)
- Check or measurement:
- Instrument / measurement point:
- Expected observation and units/baseline:
- Interpretation (positive and negative result; avoid treating absence as proof):
- What to do next / when to escalate:
- Safety warning:
- Supervisor approval required? (Tier 3 must be TRUE)
- Source reference / source reliability:

## Action and verification
- Corrective action (qualified-person and LOTO controls where applicable):
- Required spares (no invented part numbers):
- Post-repair verification (repeat comparable measurements and check symptom):
- Acceptance criterion (verified OEM/site source; if unavailable, explicitly mark TBD—not an invented limit):
- Recurrence prevention:
- Early warning indicators:

## Evidence and governance
- Case origin: Synthetic Scenario
- Evidence type: Engineering interpretation unless real source evidence exists
- Source reliability: label honestly; never imply field validation
- `is_synthetic = TRUE`
- `case_status = DRAFT`
- `retrieval_eligibility = demo_only_until_expert_review`
- `needs_depth_expansion`: TRUE when important evidence/context is still missing
- Expert reviewer / date / decision: blank until actual review
