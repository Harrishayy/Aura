"use client";

import { useStore } from "@/lib/store";
import { lamportsToSol, truncatePubkey } from "@/lib/status";
import { ExternalLink, Sparkles, User, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";

export default function AuraTranscriptPage() {
  const messages = useStore((s) => s.transcript);
  const agentStatus = useStore((s) => s.agentStatus);

  const totalCost = messages.reduce((sum, m) => sum + (m.cost_lamports ?? 0), 0);
  const toolCalls = messages.filter((m) => m.type === "tool_call").length;

  return (
    <div className="mx-auto flex h-full max-w-[1100px] flex-col gap-4 px-8 py-6">
      <div>
        <h1 className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted">
          aura · full transcript
        </h1>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          conversation history
        </p>
      </div>

      <div className="grid grid-cols-4 gap-px overflow-hidden border border-border bg-border">
        <Stat label="connection" value={agentStatus} />
        <Stat label="messages" value={`${messages.length}`} />
        <Stat label="tool calls" value={`${toolCalls}`} />
        <Stat label="cost · session" value={lamportsToSol(totalCost, 6)} />
      </div>

      <div className="flex-1 overflow-auto border border-border bg-surface-1">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center font-mono text-[10px] uppercase tracking-widest text-subtle">
              no messages yet · ws :8770
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((m, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <Icon msg={m} />
                <div className="flex-1">
                  <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-subtle">
                    <span>{m.type.replace("_", " ")}</span>
                    {m.tool_name && <span>· {m.tool_name}</span>}
                    {(m.cost_lamports ?? 0) > 0 && (
                      <span className="text-foreground ring-1 ring-border-strong px-1.5">
                        {lamportsToSol(m.cost_lamports ?? 0, 6)}
                      </span>
                    )}
                    <span className="ml-auto">{fmtTime(m.timestamp)}</span>
                  </div>
                  <div
                    className={cn(
                      "mt-1 break-words",
                      m.type === "assistant_turn"
                        ? "text-foreground"
                        : "text-muted",
                      m.type === "tool_call" || m.type === "tool_result"
                        ? "font-mono text-xs"
                        : "text-sm",
                    )}
                  >
                    {m.content}
                  </div>
                  {m.tx_signature && (
                    <a
                      href={`https://explorer.solana.com/tx/${m.tx_signature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] text-foreground hover:text-muted"
                    >
                      {truncatePubkey(m.tx_signature, 8, 8)}
                      <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-1 px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-subtle">
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function Icon({ msg }: { msg: { type: string } }) {
  if (msg.type === "user_turn")
    return <User className="mt-0.5 h-3.5 w-3.5 text-subtle" strokeWidth={1.5} />;
  if (msg.type === "assistant_turn")
    return <Sparkles className="mt-0.5 h-3.5 w-3.5 text-foreground" strokeWidth={1.5} />;
  return <Wrench className="mt-0.5 h-3.5 w-3.5 text-muted" strokeWidth={1.5} />;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  } catch {
    return iso;
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
