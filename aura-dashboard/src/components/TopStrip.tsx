"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Wifi, WifiOff } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { truncatePubkey } from "@/lib/status";

const AGENT_PUBKEY =
  process.env.NEXT_PUBLIC_AGENT_PUBKEY ?? "AurAgentPDA1111111111111111111111111111111";

export function TopStrip() {
  const fleetStatus = useStore((s) => s.fleetStatus);
  const agentStatus = useStore((s) => s.agentStatus);
  const fleetUpdated = useStore((s) => s.fleetUpdated);
  const robotCount = useStore((s) => s.fleet.robots.length);

  const [now, setNow] = useState<string>("");

  useEffect(() => {
    function tick() {
      setNow(formatUtc(new Date()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 items-stretch border-b border-border bg-background">
      <div className="flex items-center gap-3 border-r border-border px-5">
        <span className="font-mono text-sm font-bold uppercase tracking-[0.32em] text-foreground">
          Aura
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          fleet ops
        </span>
      </div>

      <div className="flex flex-1 items-center gap-3 px-5">
        <StatusPill label="fleet" status={fleetStatus} />
        <StatusPill label="agent" status={agentStatus} />
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          {robotCount} robots
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          {fleetUpdated ? `synced ${formatHms(new Date(fleetUpdated))}` : "awaiting sync"}
        </span>
      </div>

      <div className="flex items-center gap-4 border-l border-border px-5">
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
            agent pda
          </span>
          <CopyPubkey pubkey={AGENT_PUBKEY} />
        </div>
        <div className="flex flex-col items-end gap-0.5 border-l border-border pl-4">
          <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
            utc
          </span>
          <span className="font-mono text-xs text-foreground">{now || "—"}</span>
        </div>
      </div>
    </header>
  );
}

function StatusPill({
  label,
  status,
}: {
  label: string;
  status: "connecting" | "connected" | "disconnected";
}) {
  const Icon = status === "connected" ? Wifi : WifiOff;
  const tone =
    status === "connected"
      ? "text-foreground"
      : status === "connecting"
        ? "text-muted"
        : "text-subtle";
  const dotTone =
    status === "connected"
      ? "bg-foreground"
      : status === "connecting"
        ? "bg-muted live-pip"
        : "bg-subtle";

  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-sm border border-border bg-surface-1 px-2 py-1",
        tone,
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotTone)} />
      <Icon className="h-3 w-3" strokeWidth={1.5} />
      <span className="font-mono text-[10px] uppercase tracking-widest">
        {label} · {status}
      </span>
    </span>
  );
}

function CopyPubkey({ pubkey }: { pubkey: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pubkey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const Icon = copied ? Check : Copy;

  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 font-mono text-xs text-foreground hover:text-muted"
      aria-label="copy agent pubkey"
    >
      <span>{truncatePubkey(pubkey, 4, 4)}</span>
      <Icon className="h-3 w-3" strokeWidth={1.5} />
    </button>
  );
}

function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function formatHms(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
