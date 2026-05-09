"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/store";
import type { ComplianceEvent } from "@/lib/types";
import { severityStyle, truncatePubkey } from "@/lib/status";
import { cn } from "@/lib/cn";

const FLEET_HTTP = process.env.NEXT_PUBLIC_FLEET_HTTP ?? "http://localhost:8780";

type SortKey = "timestamp" | "severity";
type SortDir = "asc" | "desc";

export function ComplianceLog({ robotId }: { robotId: string }) {
  const events = useStore((s) => s.compliance[robotId]);
  const setBackfill = useStore((s) => s.setComplianceBackfill);

  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    fetch(`${FLEET_HTTP}/robot/${robotId}/recent_events?n=20`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((body: ComplianceEvent[]) => {
        if (!cancelled && Array.isArray(body) && body.length) setBackfill(robotId, body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [robotId, setBackfill]);

  const sorted = useMemo(() => {
    const list = [...(events ?? [])];
    list.sort((a, b) => {
      if (sortKey === "severity") {
        return sortDir === "desc" ? b.severity - a.severity : a.severity - b.severity;
      }
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
    return list;
  }, [events, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <section className="border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
          compliance log
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          {sorted.length} events · on-chain
        </span>
      </header>

      <div className="grid grid-cols-[24px_120px_120px_1fr_120px] items-center gap-3 border-b border-border bg-surface-2 px-4 py-1.5">
        <span />
        <SortHeader
          label="time"
          active={sortKey === "timestamp"}
          dir={sortDir}
          onClick={() => toggleSort("timestamp")}
        />
        <SortHeader
          label="severity"
          active={sortKey === "severity"}
          dir={sortDir}
          onClick={() => toggleSort("severity")}
        />
        <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
          reason
        </span>
        <span className="text-right font-mono text-[9px] uppercase tracking-widest text-subtle">
          tx
        </span>
      </div>

      <div className="max-h-[280px] overflow-auto">
        {sorted.length === 0 ? (
          <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-subtle">
            no events yet · poll {robotId.replace("_", " · ")}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sorted.map((e) => {
              const style = severityStyle(e.severity);
              const Icon = style.icon;
              return (
                <motion.a
                  key={e.tx_signature || e.hash || e.timestamp}
                  href={e.explorer_url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "grid grid-cols-[24px_120px_120px_1fr_120px] items-center gap-3 border-b border-border px-4 py-2 hover:bg-surface-2",
                    style.weight,
                  )}
                >
                  <span className={cn("h-4 w-0.5 self-center justify-self-center", style.bar)} />
                  <span className="font-mono text-[11px] tabular-nums text-muted">
                    {fmtTime(e.timestamp)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground",
                    )}
                  >
                    <Icon className="h-3 w-3" strokeWidth={1.75} />
                    {style.label}
                  </span>
                  <span className="truncate font-mono text-xs text-foreground">
                    {e.reason_code}
                  </span>
                  <span className="flex items-center justify-end gap-1.5 font-mono text-[10px] text-subtle">
                    {truncatePubkey(e.tx_signature, 4, 4)}
                    <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                  </span>
                </motion.a>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Chev = dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest",
        active ? "text-foreground" : "text-subtle hover:text-muted",
      )}
    >
      {label}
      {active && <Chev className="h-3 w-3" strokeWidth={1.5} />}
    </button>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
