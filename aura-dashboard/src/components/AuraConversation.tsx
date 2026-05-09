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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "@/lib/store";
import type { AuraMessage } from "@/lib/types";
import { cn } from "@/lib/cn";
import { lamportsToSol, truncatePubkey } from "@/lib/status";
import { PushToTalk } from "./PushToTalk";

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

      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
        <PushToTalk />
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
          <Markdown text={msg.content} />
        </div>
      </div>
    );
  }

  if (msg.type === "assistant_turn") {
    return (
      <div className="flex items-start gap-2 px-1">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" strokeWidth={1.5} />
        <div className="flex-1 px-1 py-0.5 text-sm text-foreground">
          <Markdown text={msg.content} />
        </div>
      </div>
    );
  }

  if (msg.type === "tool_call" || msg.type === "tool_result") {
    return <ToolCard msg={msg} />;
  }

  return null;
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-aura">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-0.5 first:mt-0 last:mb-0">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-subtle underline-offset-2 hover:decoration-foreground"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-1 list-disc pl-4 marker:text-subtle">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1 list-decimal pl-4 marker:text-subtle">{children}</ol>
          ),
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, ...props }) => {
            const inline = !("data-language" in props);
            return inline ? (
              <code className="rounded-sm border border-border bg-surface-1 px-1 py-px font-mono text-[11px] text-foreground">
                {children}
              </code>
            ) : (
              <code className="font-mono text-[11px]">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-1 overflow-auto rounded-sm border border-border bg-surface-1 p-2 font-mono text-[11px] text-foreground">
              {children}
            </pre>
          ),
          h1: ({ children }) => (
            <div className="mt-1 mb-0.5 font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
              {children}
            </div>
          ),
          h2: ({ children }) => (
            <div className="mt-1 mb-0.5 font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
              {children}
            </div>
          ),
          h3: ({ children }) => (
            <div className="mt-1 mb-0.5 font-mono text-[10px] uppercase tracking-widest text-muted">
              {children}
            </div>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1 border-l-2 border-border pl-2 text-muted">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-border" />,
          table: ({ children }) => (
            <table className="my-1 w-full border-collapse text-[11px]">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-surface-2 px-1.5 py-0.5 text-left font-mono text-[10px] uppercase tracking-widest text-subtle">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-1.5 py-0.5">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
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
