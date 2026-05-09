"use client";

export function PaymentTicker({ robotId: _robotId }: { robotId: string }) {
  // TODO: subscribe to /fleet WS filtered for type=payment, robot_id matching.
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">
        Payments
      </div>
      <div className="text-xs text-muted">no payments yet</div>
    </div>
  );
}
