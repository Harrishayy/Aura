"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { Sparkline } from "./Sparkline";
import { cn } from "@/lib/cn";
import type { TimelineFrame } from "@/lib/timeline";

const JOINT_COUNT = 7;
const ANOMALY_DELTA = 0.15;

export function LiveTelemetry({
  robotId,
  override,
  windowFrames,
}: {
  robotId: string;
  override?: TimelineFrame | null;
  windowFrames?: TimelineFrame[];
}) {
  const liveFrames = useStore((s) => s.telemetry[robotId]);
  const reviewing = override !== undefined;

  const latest = reviewing
    ? overrideToLatest(override)
    : liveFrames?.[liveFrames.length - 1];
  const empty = reviewing ? !override : !liveFrames || liveFrames.length === 0;

  const series = useMemo(() => {
    const out: number[][] = [];
    const source: { joints: number[] }[] = reviewing
      ? windowFrames && windowFrames.length > 0
        ? windowFrames
        : override
          ? [{ joints: override.joints }]
          : []
      : (liveFrames ?? []);
    for (let j = 0; j < JOINT_COUNT; j++) {
      out.push(source.map((f) => f.joints[j] ?? 0));
    }
    return out;
  }, [liveFrames, override, windowFrames, reviewing]);

  const meta = reviewing
    ? override
      ? `t = ${override.t.toFixed(2)}s · review`
      : "awaiting timeline"
    : empty
      ? "awaiting frames"
      : `${liveFrames!.length} samples · ${formatHz(liveFrames!)}Hz`;
  const reviewFlags = reviewing && override ? override.fault_flags : [];

  return (
    <section className="border border-border bg-surface-1">
      <SectionHeader title={reviewing ? "telemetry · review" : "live telemetry"} meta={meta} />

      <div className="divide-y divide-border">
        {Array.from({ length: JOINT_COUNT }).map((_, i) => {
          const angle = latest?.joints[i] ?? 0;
          const torque = latest?.torques[i] ?? 0;
          const anomalous = reviewing ? reviewFlags.length > 0 : isAnomalous(series[i]);
          return (
            <div
              key={i}
              className={cn(
                "grid grid-cols-[64px_88px_64px_1fr_28px] items-center gap-3 px-4 py-2",
                anomalous && "bg-surface-2",
              )}
            >
              <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
                j{i}
              </span>
              <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                {empty ? "—" : angle.toFixed(3)}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {empty ? "—" : `${torque.toFixed(2)} Nm`}
              </span>
              <Sparkline data={series[i]} height={28} />
              {anomalous ? (
                <AlertTriangle className="h-3.5 w-3.5 text-foreground" strokeWidth={1.75} />
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          gripper
        </span>
        <span className="font-mono text-xs text-foreground">
          {latest ? (latest.gripper.open ? "OPEN" : "CLOSED") : "—"}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {latest ? `${latest.gripper.force.toFixed(1)} N` : "— N"}
        </span>
      </div>
    </section>
  );
}

function overrideToLatest(frame: TimelineFrame | null | undefined) {
  if (!frame) return undefined;
  return {
    t: frame.t,
    joints: frame.joints,
    torques: frame.torques,
    gripper: { open: frame.gripper_open, force: frame.gripper_force },
  };
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
        {title}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">{meta}</span>
    </header>
  );
}

function isAnomalous(series: number[]): boolean {
  if (series.length < 5) return false;
  let max = -Infinity;
  let min = Infinity;
  for (let i = series.length - 5; i < series.length; i++) {
    if (series[i] > max) max = series[i];
    if (series[i] < min) min = series[i];
  }
  return max - min > ANOMALY_DELTA;
}

function formatHz(frames: { t: number }[]): string {
  if (frames.length < 2) return "0";
  const span = frames[frames.length - 1].t - frames[0].t;
  if (span <= 0) return "0";
  const hz = ((frames.length - 1) * 1000) / span;
  return hz.toFixed(0);
}
