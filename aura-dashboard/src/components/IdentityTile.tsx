"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { truncatePubkey } from "@/lib/status";
import { cn } from "@/lib/cn";

type Identity = {
  name: string;
  manufacturer: string;
  model: string;
  serial: string;
  deployment_date: string;
  operator: string;
  wallet_pubkey: string;
  agent_pda: string;
  registration_tx: string;
  explorer_url: string;
  episode_hash: string;
  image_url: string;
};

export function IdentityTile({ robotId }: { robotId: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    fetch(`/robot_metadata/${robotId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setIdentity)
      .catch(() => setIdentity(null));
  }, [robotId]);

  return (
    <section className="border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
          identity · spec sheet
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
          on-chain
        </span>
      </header>

      {!identity ? (
        <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-subtle">
          loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-border">
          <Row label="name" value={identity.name} />
          <Row label="operator" value={identity.operator} />
          <Row label="manufacturer" value={identity.manufacturer} />
          <Row label="model" value={identity.model} />
          <Row label="serial" value={identity.serial} mono />
          <Row label="deployed" value={identity.deployment_date} mono />
          {identity.wallet_pubkey && (
            <Row
              label="wallet"
              value={truncatePubkey(identity.wallet_pubkey)}
              copy={identity.wallet_pubkey}
              mono
            />
          )}
          {identity.agent_pda && (
            <Row
              label="agent pda"
              value={truncatePubkey(identity.agent_pda)}
              copy={identity.agent_pda}
              mono
            />
          )}
          {identity.episode_hash && (
            <Row
              label="episode hash"
              value={truncatePubkey(identity.episode_hash, 6, 6)}
              copy={identity.episode_hash}
              mono
              span2
            />
          )}
          {identity.registration_tx && identity.explorer_url && (
            <a
              href={identity.explorer_url}
              target="_blank"
              rel="noreferrer"
              className="col-span-2 flex items-center justify-between bg-surface-1 px-3 py-2 text-foreground hover:bg-surface-2"
            >
              <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
                registration tx
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs">
                solana explorer · devnet
                <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
              </span>
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  copy,
  span2,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: string;
  span2?: boolean;
}) {
  return (
    <div className={cn("bg-surface-1 px-3 py-2", span2 && "col-span-2")}>
      <div className="font-mono text-[9px] uppercase tracking-widest text-subtle">{label}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-foreground",
            mono ? "font-mono text-xs" : "text-sm",
          )}
        >
          {value}
        </span>
        {copy && <CopyButton value={copy} />}
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* unavailable */
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      onClick={onClick}
      className="text-subtle hover:text-foreground"
      aria-label={`copy ${value}`}
    >
      <Icon className="h-3 w-3" strokeWidth={1.5} />
    </button>
  );
}
