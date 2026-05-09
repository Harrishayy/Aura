## Voice interactions (operator ↔ Aura)

These examples are designed to feel like real shop-floor supervision: short, directive, and safety-aware. Aura uses consistent IDs and ties decisions to approval tiers (T0–T3) and audit logging.

### 1) Querying an anomaly (maintenance rover thermal)
Operator: Aura, what triggered the thermal warning on MSR-007?
Aura: MSR-007 detected a +28°C rise on cabinet ER-2A over 6 minutes. Severity: High. Confidence: 0.92. Recommended next step: initiate safety hold assessment. **T2 approval required**.
Operator: Show the last two scans and location.
Aura: Last scans at 12:36 and 12:39 near Electrical Room ER-2 door line. I can attach the thermal snapshots to an EHS ticket. **T1 to create ticket; T2 to initiate hold**.

### 2) Fleet summary (operations supervisor)
Operator: Give me a fleet status summary.
Aura: Fleet: 3 robots active. ARX-IMR-014 delivering tote batch K-18 to Line 2, battery 68%, no faults. QIU-VIS-022 running SKU-ALPHA-7 Rev C, reject rate 3.1%, stable. MSR-007 on perimeter patrol near ER-2, thermal anomaly pending review. No line stops active.

### 3) Investigating an IMR warning (navigation + congestion)
Operator: Why is ARX-IMR-014 paused in Aisle 3?
Aura: ARX-IMR-014 detected repeated obstruction at the Aisle 3 crossing, three events in 4 minutes. Suggest reroute via Aisle 4. Impact: +2 minutes. **T0** if you accept the reroute; **T1** if you want to release the original mission with a manual override.
Operator: Take the reroute.
Aura: Confirm: reroute ARX-IMR-014 via Aisle 4, maintain reduced speed at pedestrian crossing. Proceeding under **T0**. Logging decision.

### 4) Approving cloud inference (quality borderline defect)
Operator: Aura, request cloud inference for the last borderline inspection on QIU-VIS-022.
Aura: The last part failed feature “seal bead continuity” with confidence 0.83 (threshold 0.85). Cloud inference may improve classification. Data shared: cropped image + measurement vector, no operator PII. **T2 approval required**.
Operator: Approve T2 for QIU-VIS-022: cloud inference for seal bead continuity.
Aura: T2 approval recorded for QIU-VIS-022. Submitting cloud inference request now. I will hold the lot pending result and log the request on-chain.

### 5) Telemetry alert with safety implication (resume after stop)
Operator: Can I resume ARX-IMR-014 after that safety stop?
Aura: Safety stop triggered at Aisle 2 crossing due to proximity alert. No injuries reported; sensor health nominal. Before resuming, confirm area is clear and crossings are staffed. **T2 approval required** to resume.
Operator: Approve T2 for ARX-IMR-014: resume mission in Aisle 2 crossing, duration 10 minutes.
Aura: Approved. I’m resuming ARX-IMR-014 with reduced speed and increased stopping distance for 10 minutes. Logging on-chain and monitoring for repeat events.

### 6) Escalating an incident (repeat thermal excursions)
Operator: Aura, MSR-007 flagged ER-2 again. Escalate this.
Aura: This is the second high thermal excursion this shift near ER-2. Severity: Critical. Recommended action: declare an incident and notify plant manager per SOP-EHS-12. **T3 escalation required**.
Operator: Escalate to T3 for MSR-007: approve incident declaration under SOP-EHS-12 for repeat thermal excursions.
Aura: T3 escalation recorded. Incident package created with timestamps, rover scans, and route context. Notifying plant manager and logging the escalation event on-chain.

