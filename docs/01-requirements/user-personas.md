# User Personas

*Operational Sense — Team Qubit (EPAM × LNCT Center of Excellence Program)*

---

### Persona 1: Frontline Maintenance Technician (Primary User)

- **Role:** Machine operator / mechanical maintenance technician on the plant floor.
- **Experience Level:** Junior to mid-level (1–3 years on site).
- **Core Pain Point:** Faces an abnormal machine symptom (vibration, acoustic chatter, overheating) while working in connectivity-starved areas (pits, boiler rooms). Has no direct access to senior technicians off-shift and struggles to search rigid manuals using colloquial descriptions.
- **Needs from Operational Sense:**
  - Fast, hands-free voice capture (<30 seconds) on a mobile PWA that works completely offline.
  - Ability to describe symptoms in plain or colloquial terms (e.g., Hinglish or sensory descriptions like "high-pitched whine near coupling").
  - Instant retrieval of verified historical cases on the exact machine model with low-risk, step-by-step next checks.

---

### Persona 2: Senior Maintenance / Reliability Engineer

- **Role:** Reliability engineer, plant maintenance lead, or senior diagnostic specialist.
- **Experience Level:** Senior (15–30 years of industrial troubleshooting heuristics).
- **Core Pain Point:** Tacit troubleshooting wisdom lives only in memory. Tired of answering the same repetitive escalation calls during off-shifts or watching junior staff repeat costly trial-and-error teardowns.
- **Needs from Operational Sense:**
  - Structured case capture that turns field heuristics into reusable organizational assets.
  - Alignment with standard equipment taxonomies (ISO 14224, FMEA).
  - Clear distinction between symptoms, failure modes, root causes, and corrective actions.

---

### Persona 3: Shift Supervisor / Maintenance Lead

- **Role:** Shift in-charge or maintenance supervisor accountable for uptime, safety, and escalation response.
- **Experience Level:** 8–15 years managing plant maintenance teams.
- **Core Pain Point:** Accountable for shift downtime and safety compliance. Risk of junior technicians performing unauthorized intrusive disassembly or rubber-stamping unverified fixes under time pressure.
- **Needs from Operational Sense:**
  - Clear authorization gate: Tier 3 intrusive interventions require explicit supervisor sign-off.
  - Verification workflow to review and sign off on submitted cases before they are promoted into the organization's vector knowledge base.
  - Complete audit telemetry tracking review timestamps and verification duration.

---

### Persona 4: Plant / Operations Manager (Executive Buyer)

- **Role:** Industrial Plant Manager, Director of Operations, or VP of Manufacturing.
- **Core Concern:** Overall plant availability, Mean Time to Resolution (MTTR), downtime costs ($10k–$100k+/hour), and the massive knowledge-continuity risk of an aging, retiring workforce.
- **Needs from Operational Sense:**
  - Measurable reduction in MTTR and repeat failures.
  - Accelerated onboarding for new technicians inheriting plant-specific failure history.
  - A compounding, defensible organizational knowledge asset that survives staff turnover.

---

### Persona 5: IT & Cybersecurity Stakeholder

- **Role:** Plant IT Administrator, Enterprise Security Architect.
- **Core Concern:** Secure deployment, enterprise CMMS/ERP integration (SAP PM, Maximo), data residency, role-based access control, and preventing corporate data leakage to public AI models.
- **Needs from Operational Sense:**
  - Strict multi-tenant data isolation via database-level Row-Level Security (RLS).
  - Clean API boundaries complementing rather than replacing existing CMMS.
  - Controlled, secure LLM and speech-to-text API integrations with auditability.
