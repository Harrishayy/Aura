"use client";

import { useEffect, useState } from "react";
import { truncatePubkey } from "@/lib/status";

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

  if (!identity) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">
          Identity
        </div>
        <div className="text-xs text-muted">loading…</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Identity
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] text-success font-mono uppercase">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          on chain
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <Row label="name" value={identity.name} />
        <Row label="manufacturer" value={identity.manufacturer} />
        <Row label="serial" value={identity.serial} mono />
        <Row label="deployed" value={identity.deployment_date} mono />
        {identity.wallet_pubkey && (
          <Row label="wallet" value={truncatePubkey(identity.wallet_pubkey)} mono />
        )}
        {identity.agent_pda && (
          <Row label="agent pda" value={truncatePubkey(identity.agent_pda)} mono />
        )}
        {identity.registration_tx && (
          <a
            href={identity.explorer_url}
            target="_blank"
            rel="noreferrer"
            className="block pt-2 mt-2 border-t border-border text-xs text-primary hover:underline font-mono"
          >
            view on Solana Explorer ↗
          </a>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs text-muted font-mono uppercase">{label}</span>
      <span className={`text-foreground ${mono ? "font-mono" : ""} text-right truncate`}>
        {value}
      </span>
    </div>
  );
}
