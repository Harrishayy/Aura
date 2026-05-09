"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Film } from "lucide-react";
import { useStore } from "@/lib/store";
import { STATUS_STYLE, truncatePubkey } from "@/lib/status";
import { IdentityTile } from "@/components/IdentityTile";
import { VideoFeed } from "@/components/VideoFeed";
import { LiveTelemetry } from "@/components/LiveTelemetry";
import { ComplianceLog } from "@/components/ComplianceLog";
import { PaymentTicker } from "@/components/PaymentTicker";
import { EvidencePanel } from "@/components/EvidencePanel";
import { ScrubBar } from "@/components/ScrubBar";
import { useTimeline, useScrub, frameAt, frameWindow } from "@/lib/timeline";
import { useReadinessBarrier } from "@/lib/videoSync";
import { assetUrl } from "@/lib/assetUrl";
import { cn } from "@/lib/cn";

const ROBOT_ID = "robot_01";
const FEEDS = ["third_person", "wrist_left", "wrist_right"] as const;

export default function Robot01Page() {
  const robot = useStore((s) => s.fleet.robots.find((r) => r.id === ROBOT_ID));
  const setSelected = useStore((s) => s.setSelected);

  const timeline = useTimeline(ROBOT_ID);
  const { allReady, handler } = useReadinessBarrier(FEEDS);
  const scrub = useScrub(timeline?.duration_s ?? 0, allReady);
  const effectivePlaying = scrub.playing && allReady;
  const syncing = scrub.playing && !allReady;
  const frame = frameAt(timeline, scrub.t);
  const window = frameWindow(timeline, scrub.t, 60);

  useEffect(() => {
    setSelected(ROBOT_ID);
    return () => setSelected(null);
  }, [setSelected]);

  if (!robot) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            unknown robot
          </div>
          <div className="mt-2 text-lg text-foreground">{ROBOT_ID}</div>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
            factory floor
          </Link>
        </div>
      </div>
    );
  }

  const style = STATUS_STYLE[robot.status];
  const StatusIcon = style.icon;

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4 px-8 py-6">
      <div className="flex items-end justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-subtle hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
            factory floor
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {robot.name}
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 border border-border bg-surface-1 px-2 py-1 font-mono text-[10px] uppercase tracking-widest",
                style.text,
              )}
            >
              <StatusIcon className="h-3 w-3" strokeWidth={1.5} />
              {robot.status}
            </span>
            <span
              className="inline-flex items-center gap-1.5 border border-border-strong bg-surface-2 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground"
              title="Telemetry + cameras are replayed from a prerecorded qwen episode (not live)."
            >
              <Film className="h-3 w-3" strokeWidth={1.5} />
              recorded · qwen replay
            </span>
          </div>
          <div className="mt-1 flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-subtle">
            <span>{robot.id.replace("_", " · ")}</span>
            <span>grade {robot.grade}</span>
            <span>{robot.runway_hours.toFixed(0)}h runway</span>
            <span>{truncatePubkey(robot.wallet_pubkey)}</span>
          </div>
        </div>
      </div>

      <ScrubBar scrub={scrub} syncing={syncing} />

      <div className="grid flex-1 grid-cols-[minmax(0,620px)_1fr] gap-4 overflow-hidden">
        <div className="flex flex-col gap-3 overflow-auto pr-1">
          <VideoFeed
            src={assetUrl(`/videos/${ROBOT_ID}/third_person.mp4`)}
            title="third-person · d405"
            aspect="16/9"
            currentTime={scrub.t}
            playing={effectivePlaying}
            onReadyChange={handler("third_person")}
          />
          <div className="grid grid-cols-2 gap-3">
            <VideoFeed
              src={assetUrl(`/videos/${ROBOT_ID}/wrist_left.mp4`)}
              title="wrist · zed left"
              aspect="4/3"
              currentTime={scrub.t}
              playing={effectivePlaying}
              onReadyChange={handler("wrist_left")}
            />
            <VideoFeed
              src={assetUrl(`/videos/${ROBOT_ID}/wrist_right.mp4`)}
              title="wrist · zed right"
              aspect="4/3"
              currentTime={scrub.t}
              playing={effectivePlaying}
              onReadyChange={handler("wrist_right")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 overflow-auto pr-1">
          <LiveTelemetry robotId={ROBOT_ID} override={frame} windowFrames={window} />
          <ComplianceLog robotId={ROBOT_ID} />
          <PaymentTicker robotId={ROBOT_ID} />
          <EvidencePanel robotId={ROBOT_ID} />
          <IdentityTile robotId={ROBOT_ID} />
        </div>
      </div>
    </div>
  );
}
