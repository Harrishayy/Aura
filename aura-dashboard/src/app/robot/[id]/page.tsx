"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { STATUS_STYLE, truncatePubkey } from "@/lib/status";
import { IdentityTile } from "@/components/IdentityTile";
import { VideoFeed } from "@/components/VideoFeed";
import { LiveTelemetry } from "@/components/LiveTelemetry";
import { ComplianceLog } from "@/components/ComplianceLog";
import { PaymentTicker } from "@/components/PaymentTicker";
import { cn } from "@/lib/cn";

export default function RobotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const robot = useStore((s) => s.fleet.robots.find((r) => r.id === id));
  const setSelected = useStore((s) => s.setSelected);

  useEffect(() => {
    setSelected(id);
    return () => setSelected(null);
  }, [id, setSelected]);

  if (!robot) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            unknown robot
          </div>
          <div className="mt-2 text-lg text-foreground">{id}</div>
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
          </div>
          <div className="mt-1 flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-subtle">
            <span>{robot.id.replace("_", " · ")}</span>
            <span>grade {robot.grade}</span>
            <span>{robot.runway_hours.toFixed(0)}h runway</span>
            <span>{truncatePubkey(robot.wallet_pubkey)}</span>
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
        <div className="flex flex-col gap-4 overflow-auto pr-1">
          <VideoFeed
            src={`/videos/${robot.id}/third_person.mp4`}
            title="third-person camera"
            aspect="16/9"
          />
          <VideoFeed
            src={`/videos/${robot.id}/wrist.mp4`}
            title="wrist camera"
            aspect="4/3"
          />
        </div>

        <div className="flex flex-col gap-4 overflow-auto pr-1">
          <LiveTelemetry robotId={robot.id} />
          <ComplianceLog robotId={robot.id} />
          <PaymentTicker robotId={robot.id} />
          <IdentityTile robotId={robot.id} />
        </div>
      </div>
    </div>
  );
}
