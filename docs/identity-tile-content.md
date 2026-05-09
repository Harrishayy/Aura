## Aura — Fleet identity tiles (dashboard copy)

Format: compact identity card content for the live fleet dashboard.

---

### ARX-IMR-014 — Intralogistics Mobile Robot (IMR)
- **Display title**: ARX-IMR-014 (IMR) — Line-side Transport
- **Operational description**: Pallet/tote transport for kitting and line-side delivery; congestion-aware navigation in shared aisles.
- **Current task**: Delivering tote batch `K-18` to Line 2 dock (reroute candidate: Aisle 4).
- **Autonomy level**: **T0** (policy-bound reroute/speed control); **T1+** for mission release overrides; **T2** to resume after safety stop.
- **Battery / health**: 68% • Sensor health nominal • Localization stable (monitoring crossings)
- **Operational status**: Active • In motion • Shared-aisle mode
- **Approval state**: No pending approvals (next action: optional T0 reroute confirmation if obstruction repeats)
- **Risk summary**: Medium interaction risk in pedestrian crossings; monitor repeat obstruction at Aisle 3 crossing (3 events / 4 min). Fail-safe: pause + escalate if localization degrades.

---

### QIU-VIS-022 — Quality Inspection Unit (Vision + Metrology)
- **Display title**: QIU-VIS-022 (QIU) — Inline Inspection Cell
- **Operational description**: Recipe-based visual inspection and measurement checks; generates evidence packages and PLC reject/hold signals.
- **Current task**: Running inspection recipe `SKU-ALPHA-7 Rev C`; borderline defect review in progress (seal bead continuity).
- **Autonomy level**: **T0** re-run/validated parameter adjustments; **T2** for cloud inference, recipe change, or disposition holds.
- **Battery / health**: Fixed cell • Camera/lighting stable • PLC handshake OK
- **Operational status**: Inspecting • Lot traceability active
- **Approval state**: **Pending T2** (cloud inference request + hold lot pending result)
- **Risk summary**: Primary risk is misclassification on safety-relevant feature; escalation required for uncertain release decisions. Bypass/release under deviation is **T3**.

---

### MSR-007 — Maintenance & Safety Rover
- **Display title**: MSR-007 (MSR) — Patrol & EHS Support
- **Operational description**: Perimeter patrol with thermal/acoustic/spill checks; findings can trigger safety workflows and EHS tickets.
- **Current task**: Investigating thermal rise near Electrical Room ER-2 (cabinet `ER-2A`); capturing repeat scan set.
- **Autonomy level**: **T0** re-check/capture additional snapshot; **T1** create maintenance ticket; **T2** initiate safety hold assessment / cloud thermal classification; **T3** incident declaration under `SOP-EHS-12`.
- **Battery / health**: 74% • Thermal sensor OK • Network latency nominal
- **Operational status**: Alerted • Patrolling paused at ER-2 route checkpoint
- **Approval state**: **Pending T2** (cloud classification + safety hold assessment); escalates to **T3** on repeat excursion this shift
- **Risk summary**: Medium-to-high risk due to proximity to restricted electrical areas and LOTO adjacency; severity high if hotspot confirmed (potential overheating). Fail-safe: escalate on uncertainty or repeat anomaly.

