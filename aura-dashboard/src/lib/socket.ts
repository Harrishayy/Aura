"use client";

import { useEffect, useRef } from "react";
import { useStore } from "./store";
import type { AuraMessage, FleetMessage, FleetStatus, JointFrame } from "./types";

const FLEET_HTTP = process.env.NEXT_PUBLIC_FLEET_HTTP ?? "http://localhost:8780";
const FLEET_WS = process.env.NEXT_PUBLIC_FLEET_WS ?? "ws://localhost:8780/fleet";
const SELECTED_WS = process.env.NEXT_PUBLIC_SELECTED_WS ?? "ws://localhost:8780/selected";
const AURA_WS = process.env.NEXT_PUBLIC_AURA_WS ?? "ws://localhost:8770/aura";

const POLL_MS = 2000;
const RECONNECT_MS = 2000;

function asNum(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function decodeTelemetry(payload: Record<string, unknown>): JointFrame {
  const joints = (payload.joints as number[] | undefined) ?? [];
  const torques = (payload.torques as number[] | undefined) ?? [];
  const gripper = (payload.gripper as { open?: boolean; force?: number } | undefined) ?? {};
  return {
    t: asNum(payload.t, Date.now()),
    joints,
    torques,
    gripper: { open: !!gripper.open, force: asNum(gripper.force) },
  };
}

export function SocketManager() {
  const store = useStore;
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const cleanups: Array<() => void> = [];

    cleanups.push(startFleetPoll(store));
    cleanups.push(startFleetSocket(store));
    cleanups.push(startAuraSocket(store));
    cleanups.push(startSelectedSocket(store));

    return () => {
      cleanups.forEach((c) => c());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function startFleetPoll(store: typeof useStore): () => void {
  let cancelled = false;
  let id: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    try {
      const r = await fetch(`${FLEET_HTTP}/fleet/status`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const body = (await r.json()) as FleetStatus;
      if (!cancelled) store.getState().setFleet(body);
    } catch {
      // fleet WS will own the connection-status flag; polling silently retries
    } finally {
      if (!cancelled) id = setTimeout(poll, POLL_MS);
    }
  }

  poll();
  return () => {
    cancelled = true;
    if (id) clearTimeout(id);
  };
}

function startFleetSocket(store: typeof useStore): () => void {
  let cancelled = false;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (cancelled) return;
    store.getState().setFleetStatus("connecting");
    try {
      ws = new WebSocket(FLEET_WS);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => store.getState().setFleetStatus("connected");
    ws.onclose = () => {
      store.getState().setFleetStatus("disconnected");
      schedule();
    };
    ws.onerror = () => ws?.close();
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as FleetMessage;
        const robotId = String(msg.robot_id);
        const s = store.getState();
        if (msg.type === "telemetry") {
          s.pushTelemetry(robotId, decodeTelemetry(msg.payload));
        } else if (msg.type === "payment") {
          s.pushPayment({
            robot_id: robotId,
            amount_lamports: asNum(msg.payload.amount_lamports),
            provider_pubkey: String(msg.payload.provider_pubkey ?? ""),
            tx_signature: String(msg.payload.tx_signature ?? ""),
            explorer_url: String(msg.payload.explorer_url ?? ""),
            timestamp: String(msg.payload.timestamp ?? new Date().toISOString()),
            privacy_routed: !!msg.payload.privacy_routed,
          });
        } else if (msg.type === "compliance") {
          s.pushCompliance(robotId, {
            hash: String(msg.payload.hash ?? ""),
            severity: asNum(msg.payload.severity),
            reason_code: String(msg.payload.reason_code ?? ""),
            timestamp: String(msg.payload.timestamp ?? new Date().toISOString()),
            tx_signature: String(msg.payload.tx_signature ?? ""),
            explorer_url: String(msg.payload.explorer_url ?? ""),
          });
        }
      } catch {
        // malformed frames ignored
      }
    };
  }

  function schedule() {
    if (cancelled) return;
    timer = setTimeout(connect, RECONNECT_MS);
  }

  connect();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}

function startAuraSocket(store: typeof useStore): () => void {
  let cancelled = false;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (cancelled) return;
    store.getState().setAgentStatus("connecting");
    try {
      ws = new WebSocket(AURA_WS);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => store.getState().setAgentStatus("connected");
    ws.onclose = () => {
      store.getState().setAgentStatus("disconnected");
      schedule();
    };
    ws.onerror = () => ws?.close();
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as AuraMessage;
        if (msg.type === "heartbeat") return;
        store.getState().pushTranscript(msg);
      } catch {
        // ignore
      }
    };
  }

  function schedule() {
    if (cancelled) return;
    timer = setTimeout(connect, RECONNECT_MS);
  }

  connect();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}

function startSelectedSocket(store: typeof useStore): () => void {
  let cancelled = false;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSent: string | null = "__init__";
  let unsub: () => void = () => {};

  function send() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const id = store.getState().selectedRobotId;
    if (id === lastSent) return;
    try {
      ws.send(JSON.stringify({ selected_robot_id: id }));
      lastSent = id;
    } catch {
      // ignore
    }
  }

  function connect() {
    if (cancelled) return;
    try {
      ws = new WebSocket(SELECTED_WS);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => {
      lastSent = "__init__";
      send();
    };
    ws.onclose = () => schedule();
    ws.onerror = () => ws?.close();
  }

  function schedule() {
    if (cancelled) return;
    timer = setTimeout(connect, RECONNECT_MS);
  }

  unsub = store.subscribe((state, prev) => {
    if (state.selectedRobotId !== prev.selectedRobotId) send();
  });

  connect();
  return () => {
    cancelled = true;
    unsub();
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
