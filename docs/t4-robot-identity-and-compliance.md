## Aura T4 — Robot Identity & Compliance (Factory Operations)

Aura is a voice-native operations and compliance agent for autonomous factory robotics. This document defines the T4 responsibility area: robot identity, metadata, approval tiers, escalation logic, compliance events, and operationally realistic supervision behaviors.

### System philosophy
- **AI assists. Humans decide.**
- Aura may recommend actions and provide concise risk/impact summaries, but **does not execute safety- or compliance-relevant steps without the required human tier confirmation**.
- Autonomy is constrained by **plant policy**, **robot risk profile**, **zone rules**, and **current plant state** (e.g., maintenance lockout, line stop, emergency mode).

### Operational governance model
Aura operates under a governance model aligned to real factory controls:
- **Policy-driven permissions**: actions are allowed/denied based on approval tier (T0–T3), robot identity, zone, and task category.
- **Separation of duties**: the person confirming a safety or compliance action (T2) is not necessarily the same as the operator requesting it (T1), depending on plant policy.
- **Immutable audit trail**: significant decisions, approvals, and escalations are logged to an append-only compliance record; selected events are **logged on-chain** for tamper-evident auditability.
- **Fail-safe defaults**: when context is incomplete or telemetry is degraded, Aura escalates rather than improvising.

### Approval hierarchy (T0–T3)
- **T0 — Autonomous low-risk actions**
  - Examples: reroute around congestion, reduce speed in shared aisle, retry non-safety sensor read, reschedule a low-criticality mission.
  - Constraints: must not change safety state, must remain within defined operating envelope.

- **T1 — Supervisor confirmation**
  - Examples: release a blocked mission with revised route, temporarily relax a non-safety constraint, approve remote diagnostic bundle upload, approve a robot to enter a restricted but non-hazard zone.

- **T2 — Safety / compliance approval**
  - Examples: override a safety-related interlock, resume operation after a safety stop, authorize work in LOTO (lockout/tagout) adjacency zones, approve cloud inference for safety-adjacent perception, approve changes to safety-related speed/zone rules.

- **T3 — Plant manager escalation**
  - Examples: authorize continued production with unresolved safety alerts, approve extended operation under degraded sensing, approve major deviation from SOP, approve incident declaration and cross-team response, approve on-chain logging for incident package finalization (if required by policy).

### Robot fleet overview (demo set)
This hackathon demo fleet models a realistic cross-section of factory robotics.

- **ARX-IMR-014** — Intralogistics Mobile Robot (IMR)
  - Primary function: pallet/tote transport, line-side delivery, kitting runs
  - Typical integration: WMS/MES task dispatch, aisle map, docking stations, gate controls

- **QIU-VIS-022** — Quality Inspection Unit (fixed cell + vision)
  - Primary function: inline visual inspection, measurement checks, reject lane decisions
  - Typical integration: PLC signals, part presence sensors, inspection recipe management

- **MSR-007** — Maintenance & Safety Rover
  - Primary function: patrols, thermal/acoustic checks, spill detection, safety signage checks
  - Typical integration: EHS workflows, maintenance ticketing, restricted-zone access controls

### Escalation rules (global)
Aura evaluates escalation based on action category, telemetry confidence, and environment:
- **Immediate T2** if any of:
  - safety stop / e-stop history in last 30 minutes for the robot
  - people detection uncertainty above threshold in shared zones
  - operation involves **restricted zones**, **high-speed travel**, **heavy payloads**, **hot surfaces**, **chemical areas**, or **LOTO proximity**
- **Immediate T3** if any of:
  - repeated safety stop within a shift, or recurring fault pattern that may indicate systemic hazard
  - production impact requires deviation from SOP (e.g., “run with degraded sensing”)
  - incident classification requires management notification under plant policy
- **Escalate one tier** when:
  - telemetry confidence is degraded, sensor health is partial, network latency is high, or localization quality drops below minimum
  - the request exceeds the robot’s declared risk envelope or zone permit list

### Human confirmation logic (voice-first, enterprise-grade)
Aura uses explicit verbal confirmation with a structured, auditable pattern.

- **Two-step confirmation for T2/T3**
  - Step 1: Aura presents **risk summary** + **proposed action** + **scope** (robot, zone, duration).
  - Step 2: Operator/approver repeats a **confirmation phrase** including the robot_id and the action.

- **Confirmation phrase template**
  - T1: “Confirm T1 for <robot_id>: <action>.”
  - T2: “Approve T2 for <robot_id>: <action> in <zone>, duration <N> minutes.”
  - T3: “Escalate to T3 for <robot_id>: approve deviation <SOP-ID> for <reason>.”

- **Hard stops**
  - Aura refuses to proceed if the speaker identity is unknown, authorization is insufficient, or the request conflicts with active safety states (e.g., e-stop active, LOTO enforced).

### Concise operational summaries (standard format)
Aura summarizes with a consistent, scannable structure:
- **What happened**: trigger, fault code, deviation, or anomaly
- **Where**: robot + zone + line/cell
- **Impact**: safety, quality, throughput
- **Confidence**: telemetry quality + sensor health
- **Next safe step**: recommendation + required approval tier

---

## Robot identity profiles (T4)

### 1) Intralogistics Mobile Robot — ARX-IMR-014
- **robot_id**: `ARX-IMR-014`
- **role**: line-side intralogistics transport (totes/pallets)
- **capabilities**
  - autonomous navigation with dynamic rerouting
  - docking/charging and station handshakes
  - load presence + basic weight validation
  - congestion-aware speed control in shared aisles
- **risk profile**
  - **Medium**: human-robot interaction in shared aisles; payload stability and pinch/crush hazards
  - Elevated risk during peak traffic, blind corners, and heavy payload missions
- **escalation conditions**
  - localization quality below threshold for >30 seconds → **T1** (pause and request supervisor)
  - repeated obstacle detection in same aisle segment (possible obstruction/spill) → **T1**
  - safety stop triggered / near-miss proximity alert → **T2**
  - request to enter a restricted zone (forklift-only corridor, chemical storage adjacency) → **T2**
  - operate under degraded perception (camera/LiDAR partial failure) → **T3**
- **operational environment**
  - mixed pedestrian aisles, line-side delivery points, pallet staging, charging area
  - interfaces with gate sensors and marked pedestrian crossings
- **human approval requirements**
  - T0: reroute, reduce speed, reassign mission to alternate aisle
  - T1: release blocked mission with revised path; approve remote diagnostics upload
  - T2: resume after safety stop; authorize restricted-zone crossing
  - T3: extended operation under degraded sensing; SOP deviation for throughput-critical delivery

### 2) Quality Inspection Unit — QIU-VIS-022
- **robot_id**: `QIU-VIS-022`
- **role**: inline quality inspection (vision + metrology) for assembled parts
- **capabilities**
  - camera-based defect detection and dimensional checks
  - recipe-based inspection configuration (SKU/variant)
  - reject lane actuation signaling (via PLC handshake)
  - evidence package generation (images + measurement summary)
- **risk profile**
  - **Low-to-Medium**: generally fixed and guarded; quality risk can become compliance risk (traceability, product release)
  - Main hazards are misclassification and improper product release decisions
- **escalation conditions**
  - inspection confidence below threshold on safety-critical feature → **T2** (quality/compliance approval)
  - recipe mismatch or unapproved recipe change request → **T2**
  - reject rate spike sustained over 10 minutes → **T1** (supervisor to review line conditions)
  - request to bypass inspection cell or release product under uncertain results → **T3**
- **operational environment**
  - guarded inspection cell, PLC-controlled conveyor, part presence sensors, controlled lighting
  - interacts with MES traceability and batch/lot tracking
- **human approval requirements**
  - T0: re-run inspection on the same part; adjust non-critical exposure within validated bounds
  - T1: pause line for inspection review; request maintenance check for lighting/dirty lens
  - T2: authorize cloud inference for borderline defects; approve recipe changes; approve disposition holds
  - T3: approve bypass/release under deviation; authorize shipment hold release against SOP

### 3) Maintenance & Safety Rover — MSR-007
- **robot_id**: `MSR-007`
- **role**: patrol and safety support (thermal, acoustic, spill/obstruction detection)
- **capabilities**
  - thermal scanning of electrical cabinets and motors (external surfaces)
  - acoustic anomaly detection for bearings/compressors
  - spill/obstruction detection in walkways
  - safety signage/guarding verification snapshots
- **risk profile**
  - **Medium-to-High**: may operate near restricted zones and safety infrastructure; findings can trigger safety actions
  - Elevated risk near high-voltage rooms, chemical storage, and LOTO areas
- **escalation conditions**
  - thermal excursion above EHS threshold in electrical area → **T2** (safety approval + escalation workflow)
  - detection near LOTO zone or request to enter LOTO proximity area → **T2**
  - repeated thermal excursions or suspected fire risk → **T3** (plant manager + emergency protocol)
  - request to disable a patrol alert or suppress safety notification → **T3**
- **operational environment**
  - perimeter routes, restricted access corridors, maintenance bays, EHS-controlled rooms
  - interfaces with maintenance ticketing and EHS incident workflows
- **human approval requirements**
  - T0: continue patrol with reduced speed; re-check sensor reading; capture additional snapshot
  - T1: create maintenance ticket; request operator to validate area is clear
  - T2: initiate safety hold workflow; authorize cloud inference for thermal classification; request controlled shutdown sequence
  - T3: declare incident; authorize emergency response escalation; authorize extended monitoring under abnormal conditions

