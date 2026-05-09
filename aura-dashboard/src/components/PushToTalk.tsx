"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { AuraMessage } from "@/lib/types";
import { cn } from "@/lib/cn";

type Phase = "idle" | "recording" | "thinking" | "speaking" | "error";

const HISTORY_TURNS = 6;

export function PushToTalk() {
  const transcript = useStore((s) => s.transcript);
  const pushTranscript = useStore((s) => s.pushTranscript);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  async function start() {
    setErrMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void send(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setPhase("recording");
    } catch (e) {
      setPhase("error");
      setErrMsg(e instanceof Error ? e.message : "mic error");
    }
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
      setPhase("thinking");
    }
  }

  async function send(blob: Blob) {
    setPhase("thinking");
    const history = transcript
      .filter((m) => m.type === "user_turn" || m.type === "assistant_turn")
      .slice(-HISTORY_TURNS * 2)
      .map((m) => ({
        role: m.type === "user_turn" ? "user" : "assistant",
        content: m.content,
      }));

    const context = buildAuraContext(useStore.getState());
    const frames = await captureVideoFrames(3);

    const form = new FormData();
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
    form.append("audio", blob, `turn.${ext}`);
    form.append("history", JSON.stringify(history));
    form.append("context", JSON.stringify(context));
    if (frames.length > 0) form.append("frames", JSON.stringify(frames));

    let res: Response;
    try {
      res = await fetch("/api/voice/turn", { method: "POST", body: form });
    } catch (e) {
      setPhase("error");
      setErrMsg(e instanceof Error ? e.message : "network error");
      return;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setPhase("error");
      setErrMsg(`server ${res.status}: ${text.slice(0, 120)}`);
      return;
    }
    const data = (await res.json()) as {
      user_text: string;
      assistant_text: string;
      audio_base64: string;
      audio_mime: string;
      timestamp: string;
    };

    const userMsg: AuraMessage = {
      type: "user_turn",
      timestamp: data.timestamp,
      content: data.user_text,
    };
    const assistantMsg: AuraMessage = {
      type: "assistant_turn",
      timestamp: data.timestamp,
      content: data.assistant_text,
    };
    pushTranscript(userMsg);
    pushTranscript(assistantMsg);

    setPhase("speaking");
    const audio = new Audio(`data:${data.audio_mime};base64,${data.audio_base64}`);
    audioRef.current = audio;
    audio.onended = () => setPhase("idle");
    audio.onerror = () => setPhase("idle");
    try {
      await audio.play();
    } catch {
      setPhase("idle");
    }
  }

  const busy = phase === "thinking";
  const recording = phase === "recording";
  const speaking = phase === "speaking";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={recording ? stop : start}
        disabled={busy}
        className={cn(
          "flex h-7 items-center gap-1.5 border px-2.5 font-mono text-[10px] uppercase tracking-widest",
          recording
            ? "border-border-strong bg-surface-3 text-foreground"
            : "border-border bg-surface-2 text-muted hover:bg-surface-3 hover:text-foreground",
          busy && "cursor-not-allowed opacity-60",
        )}
        aria-label={recording ? "stop recording" : "start recording"}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
        ) : recording ? (
          <Square className="h-3 w-3" strokeWidth={1.5} />
        ) : (
          <Mic className="h-3 w-3" strokeWidth={1.5} />
        )}
        <span>
          {recording ? "stop" : busy ? "thinking" : speaking ? "speaking" : "talk"}
        </span>
      </button>
      {errMsg && (
        <span
          className="truncate font-mono text-[9px] text-subtle"
          title={errMsg}
        >
          {errMsg}
        </span>
      )}
    </div>
  );
}

function pickMime(): string | null {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function round(n: number, d = 3): number {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

function buildAuraContext(state: ReturnType<typeof useStore.getState>) {
  const fleet = state.fleet.robots.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    grade: r.grade,
    runway_hours: r.runway_hours,
    wallet_pubkey: r.wallet_pubkey,
  }));

  const telemetry: Record<string, unknown> = {};
  for (const [id, frames] of Object.entries(state.telemetry)) {
    const last = frames[frames.length - 1];
    if (!last) continue;
    telemetry[id] = {
      joints: last.joints.map((v) => round(v, 3)),
      torques: last.torques.map((v) => round(v, 3)),
      gripper: { open: last.gripper.open, force: round(last.gripper.force, 3) },
      anomaly_flags: last.anomaly_flags ?? [],
      window_size: frames.length,
    };
  }

  const compliance: Record<string, unknown[]> = {};
  for (const [id, events] of Object.entries(state.compliance)) {
    compliance[id] = events.slice(0, 5).map((e) => ({
      severity: e.severity,
      reason_code: e.reason_code,
      timestamp: e.timestamp,
      tx: e.tx_signature ? e.tx_signature.slice(0, 16) : "",
    }));
  }

  const payments = state.payments.slice(0, 5).map((p) => ({
    robot_id: p.robot_id,
    amount_lamports: p.amount_lamports,
    provider: p.provider_pubkey ? p.provider_pubkey.slice(0, 16) : "",
    timestamp: p.timestamp,
    privacy_routed: !!p.privacy_routed,
  }));

  return {
    timestamp: new Date().toISOString(),
    selected_robot_id: state.selectedRobotId,
    fleet_status_age_ms:
      state.fleetUpdated > 0 ? Date.now() - state.fleetUpdated : null,
    fleet,
    telemetry,
    compliance,
    payments,
  };
}

async function captureVideoFrames(maxFrames: number): Promise<
  Array<{ label: string; data_url: string }>
> {
  if (typeof document === "undefined") return [];
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
  const out: Array<{ label: string; data_url: string }> = [];
  for (const v of videos) {
    if (out.length >= maxFrames) break;
    if (v.readyState < 2 || !v.videoWidth || !v.videoHeight) continue;
    const w = 384;
    const h = Math.round((v.videoHeight / v.videoWidth) * w);
    try {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(v, 0, 0, w, h);
      const dataUrl = c.toDataURL("image/jpeg", 0.7);
      const label =
        v.getAttribute("data-aura-label") ||
        v.getAttribute("title") ||
        v.getAttribute("aria-label") ||
        `camera ${out.length + 1}`;
      out.push({ label, data_url: dataUrl });
    } catch {
      // canvas/CORS taint — skip silently
    }
  }
  return out;
}
