"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronDown,
  ChevronsRight,
  ExternalLink,
  Wrench,
  User,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { AuraMessage } from "@/lib/types";
import { cn } from "@/lib/cn";
import { lamportsToSol, truncatePubkey } from "@/lib/status";

export function AuraConversation() {
  const messages = useStore((s) => s.transcript);
  const agentStatus = useStore((s) => s.agentStatus);

  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("aura-conv-collapsed") === "true");
    setHydrated(true);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("aura-conv-collapsed", String(next));
  }

  if (hydrated && collapsed) {
    return (
      <button
        onClick={toggle}
        className="flex h-full w-8 items-center justify-center border-l border-border bg-surface-1 text-subtle hover:bg-surface-2 hover:text-foreground"
        aria-label="expand Aura panel"
      >
        <span className="block py-4 font-mono text-[10px] uppercase tracking-[0.32em] [writing-mode:vertical-rl]">
          aura · transcript
        </span>
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[360px] flex-col border-l border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              agentStatus === "connected"
                ? "bg-foreground"
                : agentStatus === "connecting"
                  ? "bg-muted live-pip"
                  : "bg-subtle",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
            aura · transcript
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            {messages.length} msgs
          </span>
          <button
            onClick={toggle}
            className="text-subtle hover:text-foreground"
            aria-label="collapse Aura panel"
          >
            <ChevronsRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-auto px-3 py-3">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-2 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-subtle"
            >
              awaiting voice loop
              <div className="mt-1 normal-case tracking-normal">
                connect aura agent on :8770
              </div>
            </motion.div>
          )}
          {messages.map((msg, i) => (
            <motion.div
              key={`${msg.timestamp}-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Message msg={msg} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <footer className="border-t border-border px-4 py-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
          ws · {agentStatus}
        </span>
      </footer>
    </aside>
  );
}

function Message({ msg }: { msg: AuraMessage }) {
  if (msg.type === "user_turn") {
    return (
      <div className="flex items-start gap-2 px-1">
        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" strokeWidth={1.5} />
        <div className="flex-1 rounded-sm bg-surface-2 px-2.5 py-1.5 text-sm text-muted">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === "assistant_turn") {
    return (
      <div className="flex items-start gap-2 px-1">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" strokeWidth={1.5} />
        <div className="flex-1 px-1 py-0.5 text-sm text-foreground">{msg.content}</div>
      </div>
    );
  }

  if (msg.type === "tool_call" || msg.type === "tool_result") {
    return <ToolCard msg={msg} />;
  }

  return null;
}

function ToolCard({ msg }: { msg: AuraMessage }) {
  const [open, setOpen] = useState(false);
  const isPaid = (msg.cost_lamports ?? 0) > 0;
  const Chev = open ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "border bg-surface-2 px-2.5 py-2",
        isPaid ? "border-border-strong ring-1 ring-border-strong/40" : "border-border",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Chev className="h-3 w-3 shrink-0 text-subtle" strokeWidth={1.5} />
        <Wrench className="h-3 w-3 shrink-0 text-foreground" strokeWidth={1.5} />
        <span className="font-mono text-[11px] text-foreground">
          {msg.tool_name ?? msg.type}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-subtle">
          {msg.type === "tool_call" ? "call" : "result"}
        </span>
        {isPaid && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-foreground ring-1 ring-border-strong px-1.5 py-0.5">
            {lamportsToSol(msg.cost_lamports ?? 0, 6)}
          </span>
        )}
      </button>

      {msg.tx_signature && (
        <a
          href={`https://explorer.solana.com/tx/${msg.tx_signature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 flex items-center gap-1.5 pl-5 font-mono text-[10px] text-muted hover:text-foreground"
        >
          {truncatePubkey(msg.tx_signature, 6, 6)}
          <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
        </a>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              {msg.tool_args && Object.keys(msg.tool_args).length > 0 && (
                <PreBlock label="args" value={msg.tool_args} />
              )}
              {msg.tool_result && Object.keys(msg.tool_result).length > 0 && (
                <PreBlock label="result" value={msg.tool_result} />
              )}
              {msg.content && (
                <PreBlock label="content" value={msg.content} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PreBlock({ label, value }: { label: string; value: unknown }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-subtle">{label}</div>
      <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10px] text-muted">
        {text}
      </pre>
    </div>
  );
}
