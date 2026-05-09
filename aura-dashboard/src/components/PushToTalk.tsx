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

    const form = new FormData();
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
    form.append("audio", blob, `turn.${ext}`);
    form.append("history", JSON.stringify(history));

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
