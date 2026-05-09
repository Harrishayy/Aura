"use client";

import { useEffect, useRef, useState } from "react";
import { VideoOff } from "lucide-react";
import { cn } from "@/lib/cn";

const SEEK_TOLERANCE_S = 0.05;

export function VideoFeed({
  src,
  title,
  aspect = "16/9",
  compact = false,
  currentTime,
  playing,
  onReadyChange,
}: {
  src: string;
  title: string;
  aspect?: "16/9" | "4/3";
  compact?: boolean;
  currentTime?: number;
  playing?: boolean;
  onReadyChange?: (ready: boolean) => void;
}) {
  const [hasFile, setHasFile] = useState<boolean | null>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const controlled = currentTime !== undefined;

  const onReadyChangeRef = useRef(onReadyChange);
  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  const lastReadyRef = useRef<boolean | null>(null);
  function reportReady(next: boolean) {
    if (lastReadyRef.current === next) return;
    lastReadyRef.current = next;
    onReadyChangeRef.current?.(next);
  }

  useEffect(() => {
    let cancelled = false;
    // Cross-origin hosts (e.g. R2 pub-*.r2.dev) don't send CORS headers, so a
    // HEAD probe would throw and falsely mark the file missing. Trust the URL
    // and let <video onError> surface real load failures.
    if (typeof window !== "undefined") {
      try {
        const url = new URL(src, window.location.href);
        if (url.origin !== window.location.origin) {
          setHasFile(true);
          return;
        }
      } catch {
        // fall through
      }
    }
    fetch(src, { method: "HEAD" })
      .then((r) => {
        if (!cancelled) setHasFile(r.ok);
      })
      .catch(() => {
        if (!cancelled) setHasFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Missing files don't gate the page — report ready=true so the barrier proceeds.
  useEffect(() => {
    if (!controlled) return;
    if (hasFile === false) reportReady(true);
  }, [controlled, hasFile]);

  // Seek to the requested time when it changes by more than the tolerance.
  useEffect(() => {
    const v = ref.current;
    if (!controlled || !v || currentTime === undefined) return;
    if (Math.abs(v.currentTime - currentTime) > SEEK_TOLERANCE_S) {
      reportReady(false);
      try {
        v.currentTime = currentTime;
      } catch {
        // Pre-metadata seek will retry inside onLoadedMetadata.
      }
    }
  }, [controlled, currentTime]);

  // Drive play/pause from the controlled `playing` flag.
  useEffect(() => {
    const v = ref.current;
    if (!controlled || !v) return;
    if (playing) {
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }, [controlled, playing]);

  // Continuously evaluate readiness — fires reportReady(true|false) on transitions.
  useEffect(() => {
    const v = ref.current;
    if (!controlled || !v || hasFile !== true) return;

    function evaluate() {
      if (!v || currentTime === undefined) return;
      const aligned = Math.abs(v.currentTime - currentTime) <= SEEK_TOLERANCE_S;
      const buffered = v.readyState >= 3; // HAVE_FUTURE_DATA
      reportReady(!v.seeking && aligned && buffered);
    }

    const events = [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "seeking",
      "seeked",
      "waiting",
      "stalled",
      "playing",
      "timeupdate",
    ] as const;
    for (const e of events) v.addEventListener(e, evaluate);
    evaluate();
    return () => {
      for (const e of events) v.removeEventListener(e, evaluate);
    };
  }, [controlled, hasFile, currentTime]);

  return (
    <div
      className={cn(
        "flex flex-col border border-border bg-surface-1",
        compact && "h-full min-h-0",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full bg-foreground",
              !controlled && "live-pip",
            )}
          />
          <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
            {controlled ? (playing ? "play" : "pause") : "live"}
          </span>
        </span>
      </div>
      <div
        className={cn(
          "relative bg-black",
          compact
            ? "min-h-0 flex-1"
            : aspect === "16/9"
              ? "aspect-video"
              : "aspect-[4/3]",
        )}
      >
        {hasFile ? (
          <video
            ref={ref}
            src={src}
            autoPlay={!controlled}
            muted
            loop={!controlled}
            playsInline
            preload="auto"
            onLoadedMetadata={() => {
              if (controlled && ref.current && currentTime !== undefined) {
                ref.current.currentTime = currentTime;
              }
            }}
            onError={() => setHasFile(false)}
            className={cn(
              "absolute inset-0 h-full w-full",
              compact ? "object-contain" : "object-cover",
            )}
          />
        ) : hasFile === false ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-1">
            <VideoOff className="h-6 w-6 text-subtle" strokeWidth={1.25} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
              camera offline
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
              loading…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
