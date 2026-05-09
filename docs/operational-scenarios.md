## Operational scenarios (hackathon demo flows)

These scenarios are short, technically believable, and easy to demo end-to-end. Each follows the same supervised loop: detect → summarize → request → confirm → log → report.

### Scenario A — IMR congestion anomaly + supervised reroute (T0/T1)
1. **Robot detects anomaly**
   - ARX-IMR-014 reports repeated obstruction at Aisle 3 crossing (3 detections in 4 minutes).
2. **Aura summarizes telemetry**
   - “Location: Aisle 3 crossing. Impact: +2–4 minutes delay. Safety: no stop triggered. Confidence: 0.90. Recommendation: reroute via Aisle 4 with reduced speed at pedestrian crossing.”
3. **Robot requests cloud inference**
   - Not required; Aura proposes local policy action (T0) and offers optional camera snapshot classification (T1/T2 depending on policy).
4. **Operator verbally confirms**
   - Operator: “Confirm T0 for ARX-IMR-014: reroute via Aisle 4 and reduce speed at crossings.”
5. **Action logged on-chain**
   - Aura anchors the decision event (reroute + constraints) with robot_id, zone, and time window.
6. **Aura reports completion**
   - “ARX-IMR-014 rerouted successfully. ETA to Line 2 dock: 2 minutes. Monitoring crossings for repeat obstruction.”

### Scenario B — Quality borderline defect → cloud inference → batch hold (T2)
1. **Robot detects anomaly**
   - QIU-VIS-022 flags a borderline defect on a safety-relevant feature (confidence 0.83 vs threshold 0.85).
2. **Aura summarizes telemetry**
   - “Part: SKU-ALPHA-7. Feature: seal bead continuity. Reject decision uncertain. Suggested: hold lot and request cloud inference for second opinion.”
3. **Robot requests cloud inference**
   - QIU-VIS-022 requests a cloud inference job with a minimal payload (cropped image + measurement vector).
4. **Operator verbally confirms**
   - Operator: “Approve T2 for QIU-VIS-022: cloud inference for seal bead continuity; hold the lot pending result.”
5. **Action logged on-chain**
   - Aura logs: request, approver tier, data-minimization statement, and the hold action reference.
6. **Aura reports completion**
   - “Cloud inference submitted. Lot held. I’ll report the result and recommended disposition with confidence and evidence package.”

### Scenario C — Maintenance rover thermal excursion → safety escalation (T2 → T3)
1. **Robot detects anomaly**
   - MSR-007 detects a +28°C rise on cabinet ER-2A over 6 minutes near Electrical Room ER-2.
2. **Aura summarizes telemetry**
   - “Severity: High. Confidence: 0.92. Risk: potential electrical overheating. Recommendation: initiate safety hold assessment and create an EHS ticket with thermal snapshots.”
3. **Robot requests cloud inference**
   - MSR-007 requests cloud classification to distinguish reflection artifact vs true hotspot (thermal pattern analysis).
4. **Operator verbally confirms**
   - Operator: “Approve T2 for MSR-007: cloud inference for thermal classification and initiate safety hold assessment for ER-2.”
5. **Action logged on-chain**
   - Aura logs the T2 approval, the inferred hazard category when results return, and the safety hold workflow start.
6. **Aura reports completion**
   - “Thermal classification indicates likely hotspot (0.89). Safety hold workflow initiated. If this repeats, I will escalate to T3 for incident declaration per SOP-EHS-12.”

