"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Robot } from "@/lib/types";
import { useStore } from "@/lib/store";
import { STATUS_STYLE, relativeTime, truncatePubkey } from "@/lib/status";
import { cn } from "@/lib/cn";
import { Sparkline } from "./Sparkline";

export function RobotTile({ robot }: { robot: Robot }) {
  const telemetry = useStore((s) => s.telemetry[robot.id]);
  const compliance = useStore((s) => s.compliance[robot.id]);

  const sparkData = (telemetry ?? []).map((f) => f.joints[0] ?? 0);
  const eventsPerMin = useEventsLastMinute(compliance ?? []);
  const lastEventDelta = useClientRelativeTime(robot.latest_event_ts);

  const style = STATUS_STYLE[robot.status];
  const Icon = style.icon;

  return (
    <Link
      href={`/robot/${robot.id}`}
      className={cn(
        "group flex flex-col rounded-sm border border-border bg-surface-1 p-4 transition-colors",
        "hover:border-border-strong hover:bg-surface-2",
        style.ring,
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={cn("h-3.5 w-3.5", style.text)} strokeWidth={1.5} />
            <span className={cn("font-mono text-[10px] uppercase tracking-[0.28em]", style.text)}>
              {robot.status}
            </span>
          </div>
          <div className="mt-2 text-lg font-semibold leading-tight text-foreground">
            {robot.name}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            {robot.id.replace("_", " · ")}
          </div>
        </div>
        <ArrowUpRight
          className="h-4 w-4 text-subtle group-hover:text-foreground"
          strokeWidth={1.5}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-sm border border-border bg-border">
        <Cell label="grade" value={robot.grade} />
        <Cell label="runway" value={`${robot.runway_hours.toFixed(0)}h`} />
        <Cell label="events·60s" value={`${eventsPerMin}`} />
        <Cell label="last evt" value={shortDelta(lastEventDelta)} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-subtle">
          <span>joint 0 · 60s</span>
          <span>{sparkData.length ? `${sparkData.length} samples` : "awaiting"}</span>
        </div>
        <Sparkline data={sparkData} height={48} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
            wallet
          </span>
          <span className="font-mono text-[11px] text-foreground">
            {truncatePubkey(robot.wallet_pubkey)}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle group-hover:text-foreground">
          focus →
        </span>
      </div>
    </Link>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-1 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-widest text-subtle">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function useEventsLastMinute(events: { timestamp: string }[]): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    function recompute() {
      const cutoff = Date.now() - 60_000;
      setCount(events.filter((e) => new Date(e.timestamp).getTime() > cutoff).length);
    }
    recompute();
    const id = setInterval(recompute, 5000);
    return () => clearInterval(id);
  }, [events]);
  return count;
}

function useClientRelativeTime(iso: string): string {
  const [label, setLabel] = useState("—");
  useEffect(() => {
    function tick() {
      setLabel(relativeTime(iso).replace(" ago", ""));
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [iso]);
  return label;
}

function shortDelta(label: string): string {
  return label;
}
