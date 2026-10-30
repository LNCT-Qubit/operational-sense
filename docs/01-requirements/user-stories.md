# User Stories

*Operational Sense — Team Qubit (EPAM × LNCT Center of Excellence Program)*

---

### Epic 1: Frontline Incident Capture & Offline Sync
- **US-01 (Offline Audio Capture):** As a frontline technician in a boiler pit with zero cellular reception, I want to record a 20-second spoken voice note describing a strange motor noise so that I don't have to type on a greasy mobile screen.
- **US-02 (Automatic Background Sync):** As a technician returning to the shop floor where Wi-Fi reconnects, I want my pending voice recordings to upload automatically in the background without manual intervention.
- **US-03 (Structured Confirmation):** As a technician, I want to see the AI's structured interpretation of my colloquial notes (e.g., Hinglish translated into equipment/symptom categories) so I can verify accuracy before final submission.

---

### Epic 2: Guided Troubleshooting & Hybrid Retrieval
- **US-04 (Exact Equipment Filtering):** As a field engineer troubleshooting a slurry pump bearing, I want search results strictly restricted to centrifugal pumps so that I never receive irrelevant advice from unrelated equipment like centrifuges.
- **US-05 (Sensory Similarity Retrieval):** As a technician describing a "high-pitched whining vibration near 1800 RPM", I want the system to surface past verified cases with matching acoustic patterns, even if my words differ from the technical manual.
- **US-06 (Falsification Guidance):** As a junior engineer, I want the system to suggest simple, zero-risk visual checks (Tier 1) first before suggesting dismantling machinery.
- **US-07 (Honest Abstention):** As a technician facing a novel machine fault, I want the system to clearly state when no verified historical cases exist so that I know to escalate rather than act on guesswork.

---

### Epic 3: Verification, Safety Gates & Knowledge Reuse
- **US-08 (Tier 3 Supervisor Authorization):** As a shift supervisor, I want intrusive actions (e.g., bearing housing removal) to require my explicit digital approval so that plant safety and operational protocols are maintained.
- **US-09 (Case Verification Gate):** As a reliability engineer, I want to review submitted cases, verify supporting measurements/photos, and approve them before they become visible to other technicians in search.
- **US-10 (Case Revocation):** As a reliability engineer, I want to revoke an approved case if post-repair testing reveals an incorrect diagnosis, immediately removing it from search while retaining full audit history.
