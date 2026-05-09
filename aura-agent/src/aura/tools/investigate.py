"""Tool 3: investigate_anomaly — visual + telemetry diagnosis via GPT-4o."""

from __future__ import annotations

import asyncio
import json

from openai import AsyncOpenAI

from .fleet_client import FleetClient, resolve_robot_id

COST_LAMPORTS = 800_000
VIDEO_FPS = 30.0
ANOMALY_EPISODE_TIMES: dict[str, float] = {
    "robot_01": 12.5,
    "robot_02": 12.0,  # gripper_slip at t≈12s
    "robot_03": 7.5,
}
LABEL_WINDOW_BEFORE_S = 3.0
LABEL_WINDOW_AFTER_S = 1.5

DIAGNOSTIC_PROMPT = """\
You are an industrial robotics diagnostician. A Franka Emika Panda arm has flagged a compliance event.
You have two streams of evidence:

TELEMETRY (from joint sensors):
{telemetry_json}

{visual_context_block}

Reason over BOTH streams together. Identify the proximate cause and recommend an action.
Your diagnosis MUST cite specific visual evidence from the labelled context.

Reply as JSON:
{{
  "proximate_cause": "<one sentence>",
  "visual_evidence_cited": ["<label category cited>"],
  "telemetry_evidence_cited": ["<sensor reading cited>"],
  "severity_assessment": "low|medium|high",
  "recommended_action": "<one sentence>",
  "confidence_pct": 0
}}

Be concise; this will be read aloud to a human operator."""


schema_investigate_anomaly = {
    "type": "function",
    "function": {
        "name": "investigate_anomaly",
        "description": (
            "Diagnose a flagged compliance event using GPT-4o with Encord visual ground truth. "
            "Costs 800000 lamports (~0.0008 SOL). Requires verbal confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "robot_id": {"type": "string"},
                "event_id": {"type": "string", "description": "tx_signature of the event"},
            },
            "required": ["event_id"],
        },
    },
}


def _format_visual_context(labels: list[dict], attestation_tx: str) -> str:
    if not labels:
        return "VISUAL CONTEXT: no Encord labels available for this window."

    tx_short = attestation_tx[:12] if attestation_tx else "pending"
    lines = [f"VISUAL CONTEXT (Encord ground truth, attestation: {tx_short}):"]

    sorted_labels = sorted(labels, key=lambda lb: lb.get("timestamp_s", 0.0))
    for lb in sorted_labels[:10]:
        ts = lb.get("timestamp_s", 0.0)
        lb_type = lb.get("type", "")
        category = lb.get("category", "")

        if lb_type == "temporal_segment":
            fr = lb.get("frame_range", [0, 0])
            extra = f"(frames {fr[0]}\u2013{fr[1]})"
        elif lb_type == "bbox":
            b = lb.get("bbox", {})
            extra = f"bbox at ({b.get('x', 0):.2f}, {b.get('y', 0):.2f}) size {b.get('w', 0):.2f}\u00d7{b.get('h', 0):.2f}"
        elif lb_type == "keypoint":
            p = lb.get("point", {})
            extra = f"point at ({p.get('x', 0):.2f}, {p.get('y', 0):.2f})"
        else:
            extra = ""

        lines.append(f"- [{ts:.2f}s] {lb_type}: {category} {extra}")

    return "\n".join(lines)


def _best_evidence_frame(labels: list[dict]) -> int:
    for lb in labels:
        if lb.get("type") in ("bbox", "keypoint"):
            return lb.get("frame_index", 0)
    for lb in labels:
        if lb.get("type") == "temporal_segment":
            fr = lb.get("frame_range", [0, 0])
            return (fr[0] + fr[1]) // 2
    return 0


def _build_spoken_reasoning(diagnosis: dict, labels: list[dict]) -> str:
    cause = diagnosis.get("proximate_cause", "unknown cause")
    action = diagnosis.get("recommended_action", "manual inspection recommended")

    temporal_segments = [lb for lb in labels if lb.get("type") == "temporal_segment"]
    if temporal_segments:
        seg = temporal_segments[0]
        category = seg.get("category", "")
        return (
            f"The camera shows {category} phase at the moment of the spike. "
            f"Diagnosis: {cause}. Recommended action: {action}."
        )
    return f"Diagnosis: {cause}. Recommended action: {action}."


async def handle_investigate_anomaly(args: dict, client: FleetClient) -> "ToolResult":
    from . import ToolResult

    robot_id = resolve_robot_id(args, client) or args.get("robot_id") or "robot_02"
    event_id = args.get("event_id", "")

    try:
        events = await asyncio.wait_for(client.get_recent_events(robot_id, n=5), timeout=5.0)
    except Exception:
        events = []

    episode_t = ANOMALY_EPISODE_TIMES.get(robot_id, 12.0)

    try:
        encord_data = await asyncio.wait_for(
            client.get_encord_labels(
                robot_id,
                episode_t - LABEL_WINDOW_BEFORE_S,
                episode_t + LABEL_WINDOW_AFTER_S,
            ),
            timeout=5.0,
        )
        labels = encord_data.get("labels", [])
        attestation_tx = encord_data.get("attestation_tx", "")
        encord_label_hash = encord_data.get("encord_label_hash", "")
    except Exception:
        labels = []
        attestation_tx = ""
        encord_label_hash = ""

    telemetry_json = json.dumps(events[:3], indent=2) if events else '{"note": "no recent events available"}'
    visual_context_block = _format_visual_context(labels, attestation_tx)
    prompt = DIAGNOSTIC_PROMPT.format(
        telemetry_json=telemetry_json,
        visual_context_block=visual_context_block,
    )

    oai = AsyncOpenAI()
    try:
        resp = await asyncio.wait_for(
            oai.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                max_tokens=400,
            ),
            timeout=15.0,
        )
        raw = resp.choices[0].message.content or "{}"
        diagnosis = json.loads(raw)
    except Exception:
        diagnosis = {
            "proximate_cause": "diagnosis unavailable (GPT-4o timeout or error)",
            "visual_evidence_cited": [],
            "telemetry_evidence_cited": [],
            "severity_assessment": "medium",
            "recommended_action": "manual inspection recommended",
            "confidence_pct": 0,
        }

    tx = await client.trigger_inference_payment(robot_id, COST_LAMPORTS, "anomaly diagnosis")
    await client.trigger_compliance_log(
        robot_id,
        {"tool_name": "investigate_anomaly", "args": args, "diagnosis": diagnosis},
    )

    evidence_frame = _best_evidence_frame(labels)
    cited_hashes = [lb.get("encord_object_hash", "") for lb in labels[:5]]
    reasoning = _build_spoken_reasoning(diagnosis, labels)

    return ToolResult(
        tool_name="investigate_anomaly",
        success=True,
        robot_id=robot_id,
        result={
            "diagnosis": diagnosis,
            "event_id": event_id,
            "encord_evidence_frame_index": evidence_frame,
            "encord_attestation_tx": attestation_tx,
            "encord_label_hash": encord_label_hash,
            "encord_labels_used": cited_hashes,
        },
        cost_lamports=COST_LAMPORTS,
        tx_signature=tx,
        reasoning=reasoning,
    )
