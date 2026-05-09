"use client";

import Link from "next/link";
import { useFleetStatus } from "@/lib/fleet";

export function Header() {
  const { connected, lastUpdated } = useFleetStatus();

  return (
    <header className="border-b border-border bg-surface/60 backdrop-blur-sm">
      <div className="mx-auto max-w-[1600px] flex items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-bold tracking-[0.3em] uppercase text-foreground hover:text-primary transition-colors"
        >
          Aura
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted font-mono">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? "bg-success" : "bg-danger"
            }`}
            aria-label={connected ? "fleet online" : "fleet offline"}
          />
          <span>
            {connected ? "fleet:live" : "fleet:offline"}
            {lastUpdated && ` · ${lastUpdated.toISOString().slice(11, 19)}`}
          </span>
        </div>
      </div>
    </header>
  );
}
