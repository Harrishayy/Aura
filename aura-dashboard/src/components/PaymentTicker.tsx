"use client";

import { useMemo } from "react";
import { ExternalLink, Lock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { lamportsToSol, truncatePubkey } from "@/lib/status";

const VISIBLE_CAP = 8;

export function PaymentTicker({ robotId }: { robotId: string }) {
  const allPayments = useStore((s) => s.payments);
  const payments = useMemo(
    () => allPayments.filter((p) => p.robot_id === robotId).slice(0, VISIBLE_CAP),
    [allPayments, robotId],
  );

  return (
    <section className="border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
          m2m payments
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
          {payments.length ? `last ${payments.length}` : "no payments yet"}
        </span>
      </header>

      <div className="divide-y divide-border">
        <AnimatePresence initial={false}>
          {payments.map((p) => (
            <motion.a
              key={p.tx_signature || `${p.timestamp}-${p.provider_pubkey}`}
              href={p.explorer_url || "#"}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-[120px_1fr_auto] items-center gap-4 px-4 py-2 hover:bg-surface-2"
            >
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {lamportsToSol(p.amount_lamports, 6)}
              </span>
              <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
                {p.privacy_routed ? (
                  <Lock className="h-3 w-3" strokeWidth={1.5} />
                ) : (
                  <span className="inline-block w-3" />
                )}
                <span>→ {truncatePubkey(p.provider_pubkey)}</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-subtle">
                <span>{truncatePubkey(p.tx_signature, 4, 4)}</span>
                <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
              </span>
            </motion.a>
          ))}
        </AnimatePresence>
        {payments.length === 0 && (
          <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-subtle">
            awaiting m2m flow
          </div>
        )}
      </div>
    </section>
  );
}
