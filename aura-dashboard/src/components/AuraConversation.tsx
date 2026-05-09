"use client";

import { useEffect, useRef, useState } from "react";
import { mockMessages, type AuraMessage } from "./AuraConversation.mock";

const AURA_WS =
  process.env.NEXT_PUBLIC_AURA_WS ?? "ws://localhost:8770/aura";

export function AuraConversation() {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<AuraMessage[]>(mockMessages);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("aura-conv-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(AURA_WS);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as AuraMessage;
          if (msg.type === "heartbeat") return;
          setMessages((prev) => [...prev.slice(-50), msg]);
        } catch {
          // ignore malformed
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("aura-conv-collapsed", String(next));
  }

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="border-l border-border bg-surface px-2 text-xs text-muted hover:text-foreground writing-mode-vertical"
        aria-label="expand Aura panel"
      >
        <span className="block py-4 [writing-mode:vertical-rl] font-mono uppercase tracking-widest">
          Aura
        </span>
      </button>
    );
  }

  return (
    <aside className="w-[360px] border-l border-border bg-surface flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-success" : "bg-muted"}`}
          />
          <span className="font-mono text-xs uppercase tracking-widest">Aura</span>
        </div>
        <button
          onClick={toggle}
          className="text-xs text-muted hover:text-foreground"
          aria-label="collapse Aura panel"
        >
          collapse
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <Message key={i} msg={msg} />
        ))}
      </div>
    </aside>
  );
}

function Message({ msg }: { msg: AuraMessage }) {
  if (msg.type === "user_turn") {
    return (
      <div className="flex">
        <div className="rounded-md bg-surface-elevated px-3 py-2 text-sm max-w-[85%]">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.type === "assistant_turn") {
    return (
      <div className="flex justify-end">
        <div className="rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-sm text-primary max-w-[85%]">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.type === "tool_call" || msg.type === "tool_result") {
    const isPaid = (msg.cost_lamports ?? 0) > 0;
    return (
      <div
        className={`rounded-md border px-3 py-2 text-xs font-mono ${
          isPaid ? "border-warning/40 bg-warning/5" : "border-border bg-surface-elevated"
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted uppercase tracking-wide">{msg.type}</span>
          <span className="text-foreground">{msg.tool_name}</span>
        </div>
        {msg.cost_lamports ? (
          <div className="text-warning text-[10px]">
            {(msg.cost_lamports / 1e9).toFixed(4)} SOL
          </div>
        ) : null}
        {msg.tx_signature ? (
          <a
            href={`https://explorer.solana.com/tx/${msg.tx_signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-[10px] underline"
          >
            view tx ↗
          </a>
        ) : null}
        {msg.content && <div className="text-muted mt-1 break-all">{msg.content}</div>}
      </div>
    );
  }
  return null;
}
