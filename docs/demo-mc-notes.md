## Aura — demo MC notes (2–3 minutes)

Goal: show Aura’s voice-native supervision loop end-to-end across 3 scenarios: detect → summarize → request → confirm → log → report.

---

### Demo setup (5–10s)
- **On screen**: Fleet dashboard with 3 robot tiles + event feed + approvals panel (T0–T3).
- **Say**: “This is Aura: a voice-native operations and compliance agent for autonomous factory robotics. Watch how it keeps humans in control with tiered approvals and immutable logging.”

---

### Moment 1 — Fleet status + IMR congestion reroute (T0) (35–45s)
- **On screen**: Select `ARX-IMR-014` tile; highlight “Aisle 3 crossing obstruction” in event feed.
- **Say (prompt)**: “Aura, why is ARX-IMR-014 slowed near Aisle 3?”
- **Aura responds**: Concise summary:
  - Location: Aisle 3 crossing
  - Impact: +2–4 minutes delay
  - Safety: no stop triggered
  - Confidence: ~0.90
  - Recommendation: reroute via Aisle 4 + reduced speed at pedestrian crossing (**T0**)
- **Say (confirm)**: “Confirm T0 for ARX-IMR-014: reroute via Aisle 4 and reduce speed at crossings.”
- **Aura responds**: “Proceeding under T0. Logging decision.”
- **On-chain highlight (quick)**:
  - **On screen**: Event feed shows “Decision anchored” with robot_id + zone + time window.
  - **Say**: “Even low-risk decisions are anchored as immutable compliance records for traceability.”
- **Transition line**: “Now let’s move to a case where we need safety/compliance approval.”

---

### Moment 2 — Quality borderline defect → cloud inference + lot hold (T2) (45–60s)
- **On screen**: Select `QIU-VIS-022`; show a borderline inspection result for `SKU-ALPHA-7` (confidence 0.83 vs 0.85 threshold).
- **Say (prompt)**: “Aura, request cloud inference for the last borderline inspection on QIU-VIS-022.”
- **Aura responds**:
  - Feature: seal bead continuity
  - Data minimized: cropped image + measurement vector (no operator PII)
  - Action: submit cloud inference + hold lot pending result
  - **T2 approval required**
- **Approval moment**:
  - **On screen**: Approvals panel opens with a T2 request (scope + data minimization statement).
  - **Say (confirm)**: “Approve T2 for QIU-VIS-022: cloud inference for seal bead continuity; hold the lot pending result.”
- **Aura responds**: “T2 approval recorded. Submitting cloud inference now. Lot held. Logging on-chain.”
- **On-chain highlight (quick)**:
  - **On screen**: Immutable record includes approval tier + minimal payload statement + hold reference.
  - **Say**: “This is what auditors care about: who approved what, why, and what data left the plant boundary.”
- **Transition line**: “Last scenario: safety escalation that can reach plant management.”

---

### Moment 3 — Thermal excursion → safety hold assessment (T2) → escalation path (T3) (45–60s)
- **On screen**: Select `MSR-007`; show thermal anomaly: “+28°C rise on cabinet ER-2A over 6 minutes” near ER-2.
- **Say (prompt)**: “Aura, what triggered the thermal warning on MSR-007?”
- **Aura responds**:
  - Severity: High
  - Confidence: ~0.92
  - Risk: potential electrical overheating
  - Recommendation: initiate safety hold assessment + create EHS ticket
  - Cloud classification offered; **T2 required**
- **Approval moment**:
  - **On screen**: T2 approval request shows zone scope (ER-2) + workflow start.
  - **Say (confirm)**: “Approve T2 for MSR-007: cloud inference for thermal classification and initiate safety hold assessment for ER-2.”
- **Aura responds**:
  - “T2 approval recorded. Classification running. Safety hold workflow initiated. Logging on-chain.”
  - “If this repeats this shift, I will escalate to T3 for incident declaration per SOP-EHS-12.”
- **Optional closing beat (5s)**:
  - **On screen**: Show the escalation rule badge (T2 → T3 on repeat excursion) and the immutable audit trail entries.
  - **Say**: “Aura escalates by policy—fail-safe defaults, no improvisation.”

---

### Close (5–10s)
- **On screen**: Return to fleet overview; show last 3 anchored events in the compliance feed.
- **Say**: “Aura is ‘AI assists. Humans decide.’ Voice-native fleet supervision, tiered approvals, and immutable compliance logging—built to be deployable in real factories.”

