import type { RobotStatus } from "./mockFleet";

export const STATUS_COLOR: Record<RobotStatus, string> = {
  healthy: "bg-success/20 text-success border-success/30",
  anomaly: "bg-danger/20 text-danger border-danger/30",
  idle: "bg-warning/20 text-warning border-warning/30",
  paused: "bg-muted/20 text-muted border-muted/30",
  offline: "bg-muted/10 text-muted border-muted/20 line-through",
};

export const STATUS_DOT: Record<RobotStatus, string> = {
  healthy: "bg-success",
  anomaly: "bg-danger animate-pulse",
  idle: "bg-warning",
  paused: "bg-muted",
  offline: "bg-muted/40",
};

export function truncatePubkey(pk: string, head = 4, tail = 4): string {
  if (!pk) return "—";
  if (pk.length <= head + tail + 1) return pk;
  return `${pk.slice(0, head)}…${pk.slice(-tail)}`;
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
