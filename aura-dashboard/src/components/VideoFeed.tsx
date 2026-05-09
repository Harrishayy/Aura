"use client";

import { useEffect, useRef, useState } from "react";
import { VideoOff } from "lucide-react";
import { cn } from "@/lib/cn";

export function VideoFeed({
  src,
  title,
  aspect = "16/9",
}: {
  src: string;
  title: string;
  aspect?: "16/9" | "4/3";
}) {
  const [hasFile, setHasFile] = useState<boolean | null>(null);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
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

  return (
    <div className="border border-border bg-surface-1">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="live-pip inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
            live
          </span>
        </span>
      </div>
      <div
        className={cn(
          "relative bg-black",
          aspect === "16/9" ? "aspect-video" : "aspect-[4/3]",
        )}
      >
        {hasFile ? (
          <video
            ref={ref}
            src={src}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-1">
            <VideoOff className="h-6 w-6 text-subtle" strokeWidth={1.25} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
              no feed
            </span>
            <span className="font-mono text-[9px] text-subtle">{src}</span>
          </div>
        )}
      </div>
    </div>
  );
}
