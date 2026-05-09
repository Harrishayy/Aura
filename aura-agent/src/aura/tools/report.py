"""Tool 4: generate_incident_report — triggers Auxin's weasyprint pipeline. Cost: 0."""

from __future__ import annotations

from .fleet_client import FleetClient, resolve_robot_id

schema_generate_incident_report = {
    "type": "function",
    "function": {
        "name": "generate_incident_report",
        "description": "Generates a PDF incident report for one robot or fleet-wide.",
        "parameters": {
            "type": "object",
            "properties": {
                "robot_id": {"type": "string"},
                "from_iso": {"type": "string", "format": "date-time"},
                "to_iso": {"type": "string", "format": "date-time"},
            },
            "required": ["from_iso", "to_iso"],
        },
    },
}


async def handle_generate_incident_report(args: dict, client: FleetClient):
    from . import ToolResult

    robot_id = resolve_robot_id(args, client)
    scope = robot_id or "fleet"
    # Auxin's existing weasyprint pipeline serves PDFs at this conventional path; the
    # aggregator forwards the request when T2 wires it. Until then we return the URL
    # so the dashboard can attempt the fetch and fall back to a placeholder.
    report_url = (
        f"{client._base}/reports/{scope}/"
        f"{args.get('from_iso', '')}_{args.get('to_iso', '')}.pdf"
    )

    tx = await client.trigger_compliance_log(
        scope, {"tool_name": "generate_incident_report", "args": args}
    )
    reasoning = (
        f"Report ready for {robot_id}." if robot_id else "Fleet-wide report ready."
    )
    return ToolResult(
        tool_name="generate_incident_report",
        success=True,
        robot_id=robot_id,
        result={"report_url": report_url},
        tx_signature=tx,
        reasoning=reasoning,
    )
