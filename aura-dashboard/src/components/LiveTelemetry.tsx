"use client";

export function LiveTelemetry({ robotId: _robotId }: { robotId: string }) {
  // TODO: subscribe to ws://localhost:8780/fleet, filter robot_id, render joint values.
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">
        Live telemetry
      </div>
      <div className="space-y-1 font-mono text-sm">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-muted">joint_{i}</span>
            <span className="text-foreground">{(0).toFixed(3)}</span>
          </div>
        ))}
        <div className="pt-2 mt-2 border-t border-border flex justify-between text-xs">
          <span className="text-muted">gripper</span>
          <span className="text-foreground">open</span>
        </div>
      </div>
    </div>
  );
}
