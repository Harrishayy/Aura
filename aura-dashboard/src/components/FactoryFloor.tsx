"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { RobotTile } from "./RobotTile";
import { cn } from "@/lib/cn";

export function FactoryFloor() {
  const robots = useStore((s) => s.fleet.robots);
  const compliance = useStore((s) => s.compliance);
  const fleetStatus = useStore((s) => s.fleetStatus);

  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const totalRunway = useMemo(
    () => robots.reduce((acc, r) => acc + (r.runway_hours ?? 0), 0),
    [robots],
  );

  const totalEvents = useMemo(() => {
    let count = 0;
    for (const arr of Object.values(compliance)) count += arr.length;
    return count;
  }, [compliance]);

  const eventsLastMinute = useMemo(() => {
    if (!now) return totalEvents;
    const cutoff = now - 60_000;
    let count = 0;
    for (const arr of Object.values(compliance)) {
      for (const e of arr) {
        if (new Date(e.timestamp).getTime() > cutoff) count += 1;
      }
    }
    return count;
  }, [compliance, now, totalEvents]);

  const healthyCount = robots.filter((r) => r.status === "healthy").length;

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col px-8 py-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted">
            factory floor
          </h1>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            three Panda arms, one operator.
          </p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          {fleetStatus === "connected" ? "live · ws://:8780" : "polling fallback"}
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: "fleet runway", value: `${totalRunway.toFixed(0)}h`, sub: "aggregate" },
          { label: "healthy", value: `${healthyCount}/${robots.length}`, sub: "robots online" },
          { label: "events · 60s", value: `${eventsLastMinute}`, sub: "compliance writes" },
          { label: "demo", value: <DemoClock />, sub: "elapsed since boot" },
        ]}
      />

      <div className="mt-5 grid flex-1 grid-cols-3 gap-4">
        {robots.map((robot) => (
          <RobotTile key={robot.id} robot={robot} />
        ))}
      </div>

      <FloorLegend />
    </div>
  );
}

function SummaryStrip({
  items,
}: {
  items: { label: string; value: React.ReactNode; sub: string }[];
}) {
  return (
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-sm border border-border bg-border">
      {items.map((it) => (
        <div key={it.label} className="bg-surface-1 px-5 py-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-subtle">
            {it.label}
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {it.value}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-subtle">
            {it.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function DemoClock() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return (
    <span>
      {h > 0 ? `${h}:` : ""}
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function FloorLegend() {
  return (
    <div className="mt-4 flex items-center gap-6 border-t border-border pt-3">
      {[
        { dot: "bg-foreground", label: "healthy" },
        { dot: "bg-foreground ring-1 ring-border-strong", label: "anomaly" },
        { dot: "bg-muted", label: "idle" },
        { dot: "bg-subtle", label: "paused" },
        { dot: "bg-subtle/40", label: "offline" },
      ].map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", it.dot)} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            {it.label}
          </span>
        </div>
      ))}
      <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-subtle">
        click a tile to focus
      </span>
    </div>
  );
}
