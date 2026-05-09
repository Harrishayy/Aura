"use client";

import Link from "next/link";
import type { Robot } from "@/lib/mockFleet";
import { STATUS_COLOR, STATUS_DOT, relativeTime, truncatePubkey } from "@/lib/status";

export function RobotTile({ robot }: { robot: Robot }) {
  return (
    <Link
      href={`/robot/${robot.id}`}
      className="group block w-60 rounded-lg border border-border bg-surface p-4 transition-all hover:border-primary/40 hover:bg-surface-elevated hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="font-mono text-xs uppercase tracking-wide text-muted">
          {robot.name}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_COLOR[robot.status]}`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[robot.status]}`} />
          {robot.status}
        </span>
      </div>

      <div className="mb-2">
        <div className="font-mono text-4xl font-bold text-foreground">{robot.grade}</div>
        <div className="font-mono text-xs text-muted">{robot.runway_hours.toFixed(0)}h runway</div>
      </div>

      <div className="font-mono text-[11px] text-muted">
        {relativeTime(robot.latest_event_ts)}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted">
          {truncatePubkey(robot.wallet_pubkey)}
        </span>
        <span className="text-[10px] text-muted group-hover:text-primary">view →</span>
      </div>
    </Link>
  );
}
