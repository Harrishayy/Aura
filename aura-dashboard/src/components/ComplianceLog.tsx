"use client";

import { useEffect, useState } from "react";

type Event = {
  hash: string;
  severity: number;
  reason_code: string;
  timestamp: string;
  tx_signature: string;
  explorer_url: string;
};

const FLEET_HTTP =
  process.env.NEXT_PUBLIC_FLEET_HTTP ?? "http://localhost:8780";

export function ComplianceLog({ robotId }: { robotId: string }) {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(`${FLEET_HTTP}/robot/${robotId}/recent_events?n=10`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const body = (await r.json()) as Event[];
        if (!cancelled) setEvents(body);
      } catch {
        /* noop */
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [robotId]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">
        Compliance log
      </div>
      <div className="space-y-1 max-h-[280px] overflow-auto">
        {events.length === 0 && (
          <div className="text-xs text-muted">no recent events</div>
        )}
        {events.map((e) => (
          <a
            key={e.tx_signature}
            href={e.explorer_url}
            target="_blank"
            rel="noreferrer"
            className="block rounded border border-border bg-surface-elevated px-3 py-2 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-muted">
                {new Date(e.timestamp).toISOString().slice(11, 19)}
              </span>
              <span
                className={
                  e.severity >= 2 ? "text-danger" : "text-warning"
                }
              >
                sev {e.severity}
              </span>
            </div>
            <div className="font-mono text-xs text-foreground">{e.reason_code}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
