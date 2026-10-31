# M09 — Synthetic Case Quality Checklist

Use one checklist per case; mark Pass / Fail / N/A and add evidence. A filled field is not automatically a good field.

## A. Identity and taxonomy
- [ ] Unique case reference
- [ ] Equipment class uses controlled vocabulary (pump / motor / compressor)
- [ ] Model designation clearly marked illustrative unless verified against an authoritative source
- [ ] Subsystem source label retained
- [ ] Subsystem FK mapped to an approved taxonomy value; if not mapped, flag unresolved (do not silently treat as mapped)
- [ ] Component is specific enough to help retrieval; missing component flagged

## B. Symptom and context
- [ ] Symptom narrative describes observable facts, onset, location and operating condition
- [ ] Structured summary matches the narrative without adding unsupported facts
- [ ] Operating status and frequency/duration are explicit
- [ ] Units, actual readings, instrument, measurement point and baseline are included when claiming measurements
- [ ] If no actual readings exist, state that this is illustrative/synthetic

## C. Cause reasoning
- [ ] Primary cause is labelled suspected vs confirmed
- [ ] At least one plausible alternative cause is listed
- [ ] Mechanism connects cause to symptom
- [ ] Differential checks can distinguish the primary cause from alternatives
- [ ] No single similarity result is presented as a diagnosis

## D. Steps and safety
- [ ] Diagnostic steps are linked to the correct case and ordered
- [ ] Tier 1 observations do not require unsafe contact with running/hot/energised equipment
- [ ] Tier 2 measurement includes appropriate instrument, point, unit/baseline and qualified-person limits
- [ ] Tier 3 actions require supervisor approval and LOTO where relevant
- [ ] Every Tier 3 row has supervisor_approval_required = TRUE
- [ ] Ambiguous results have a stop/escalation path
- [ ] Step wording is specific to the case rather than generic boilerplate

## E. Repair, verification and provenance
- [ ] Corrective action matches suspected failure mode and is within qualified-person/OEM procedures
- [ ] Spare part numbers are not invented
- [ ] Post-repair verification repeats relevant checks and confirms symptom resolution
- [ ] Acceptance criteria cite an actual OEM/site source; otherwise explicitly remain TBD
- [ ] Source references and reliability label are honest
- [ ] Synthetic status is explicit
- [ ] Case remains DRAFT/demo-only until expert approval
- [ ] `needs_depth_expansion` reflects unresolved gaps
