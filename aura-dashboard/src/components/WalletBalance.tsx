"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Wallet } from "lucide-react";
import { truncatePubkey } from "@/lib/status";
import { cn } from "@/lib/cn";

const RPC_URL = "https://api.devnet.solana.com";
const REFRESH_MS = 15_000;

export function WalletBalance({ pubkey }: { pubkey: string }) {
  const [lamports, setLamports] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;

    const fetchBalance = async () => {
      try {
        const r = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [pubkey, { commitment: "confirmed" }],
          }),
        });
        const j = await r.json();
        if (cancelled) return;
        const value = j?.result?.value;
        if (typeof value === "number") {
          setLamports(value);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBalance();
    const id = setInterval(fetchBalance, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pubkey]);

  const sol =
    lamports !== null ? (lamports / 1e9).toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }) : "—";

  const explorerUrl = pubkey
    ? `https://explorer.solana.com/address/${pubkey}?cluster=devnet`
    : "";

  return (
    <section className="border border-border-strong bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
          <Wallet className="h-3 w-3" strokeWidth={1.5} />
          wallet balance
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          devnet · live
        </span>
      </header>
      <div className="flex items-end justify-between gap-4 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-mono text-3xl tabular-nums leading-none",
              loading || error ? "text-subtle" : "text-foreground",
            )}
          >
            {error ? "—" : sol}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            SOL
          </span>
        </div>
        {pubkey && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-subtle hover:text-foreground"
            title={pubkey}
          >
            {truncatePubkey(pubkey)}
            <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
          </a>
        )}
      </div>
      {error && (
        <div className="border-t border-border px-4 py-1 font-mono text-[9px] uppercase tracking-widest text-subtle">
          rpc unreachable · retry in 15s
        </div>
      )}
    </section>
  );
}
