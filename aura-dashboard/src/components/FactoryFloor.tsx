"use client";

import { useFleetStatus } from "@/lib/fleet";
import { RobotTile } from "./RobotTile";

export function FactoryFloor() {
  const { fleet } = useFleetStatus();

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Factory floor</h1>
        <p className="text-sm text-muted">
          Three robots online. Click a tile to focus, or speak to Aura.
        </p>
      </div>

      <div className="relative aspect-[16/9] rounded-xl border border-border bg-surface/40 p-8">
        <FloorLabels />

        {/* Tile grid: top-left, centre, bottom-right per playbook P3 */}
        <div className="absolute left-[8%] top-[15%]">
          {fleet.robots[0] && <RobotTile robot={fleet.robots[0]} />}
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {fleet.robots[1] && <RobotTile robot={fleet.robots[1]} />}
        </div>
        <div className="absolute right-[8%] bottom-[15%]">
          {fleet.robots[2] && <RobotTile robot={fleet.robots[2]} />}
        </div>
      </div>
    </div>
  );
}

function FloorLabels() {
  return (
    <>
      <div className="absolute left-1/2 top-2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-widest text-muted">
        Loading dock
      </div>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-muted [writing-mode:vertical-rl]">
        QC station
      </div>
      <div className="absolute left-1/2 bottom-2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-widest text-muted">
        Packing line
      </div>
    </>
  );
}
