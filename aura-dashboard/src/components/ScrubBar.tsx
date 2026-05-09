"use client";

import { Pause, Play, Rewind, FastForward, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ScrubState } from "@/lib/timeline";
import { cn } from "@/lib/cn";

const STEP_FINE = 0.1;
const STEP_COARSE = 1.0;

export function ScrubBar({
  scrub,
  syncing = false,
}: {
  scrub: ScrubState;
  syncing?: boolean;
}) {
  const { t, playing, duration, setT, togglePlay, step } = scrub;
  const Icon = playing ? Pause : Play;
  const ready = duration > 0;

  return (
    <section className="border border-border bg-surface-1">
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          onClick={togglePlay}
          disabled={!ready}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center border border-border bg-surface-2 text-foreground",
            "hover:border-border-strong hover:bg-surface-3",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
          aria-label={playing ? "pause" : "play"}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        <div className="flex items-center gap-1">
          <StepButton onClick={() => step(-STEP_COARSE)} disabled={!ready} label="-1s" Icon={ChevronsLeft} />
          <StepButton onClick={() => step(-STEP_FINE)} disabled={!ready} label="-0.1s" Icon={Rewind} />
          <StepButton onClick={() => step(STEP_FINE)} disabled={!ready} label="+0.1s" Icon={FastForward} />
          <StepButton onClick={() => step(STEP_COARSE)} disabled={!ready} label="+1s" Icon={ChevronsRight} />
        </div>

        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={t}
          disabled={!ready}
          onChange={(e) => setT(parseFloat(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none bg-surface-3 accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
        />

        <span className="font-mono text-[11px] tabular-nums text-foreground">
          {ready ? formatTime(t) : "—"}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-subtle">
          / {ready ? formatTime(duration) : "—"}
        </span>

        <span
          className={cn(
            "ml-2 inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
            syncing
              ? "border-border-strong bg-surface-3 text-foreground"
              : "border-border bg-surface-2 text-subtle",
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              syncing ? "bg-foreground live-pip" : "bg-muted",
            )}
          />
          {syncing ? "syncing" : "in sync"}
        </span>
      </div>
    </section>
  );
}

function StepButton({
  onClick,
  disabled,
  label,
  Icon,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  Icon: typeof Play;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center border border-border bg-surface-2 text-muted",
        "hover:border-border-strong hover:bg-surface-3 hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} />
    </button>
  );
}

function formatTime(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = (s - mm * 60).toFixed(1).padStart(4, "0");
  return `${mm}:${ss}`;
}
