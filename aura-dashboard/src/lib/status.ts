import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CircleCheck,
  Circle,
  CircleOff,
  CircleSlash,
  Info,
  AlertCircle,
  Siren,
} from "lucide-react";
import type { RobotStatus } from "./types";

type StatusStyle = {
  text: string;
  pip: string;
  icon: LucideIcon;
  weight: string;
  ring?: string;
};

export const STATUS_STYLE: Record<RobotStatus, StatusStyle> = {
  healthy: {
    text: "text-foreground",
    pip: "bg-foreground",
    icon: CircleCheck,
    weight: "font-normal",
  },
  idle: {
    text: "text-muted",
    pip: "bg-muted",
    icon: Circle,
    weight: "font-normal",
  },
  anomaly: {
    text: "text-foreground",
    pip: "bg-foreground",
    icon: AlertTriangle,
    weight: "font-semibold",
    ring: "ring-1 ring-border-strong",
  },
  paused: {
    text: "text-subtle",
    pip: "bg-subtle",
    icon: CircleSlash,
    weight: "font-normal",
  },
  offline: {
    text: "text-subtle line-through decoration-subtle",
    pip: "bg-subtle/40",
    icon: CircleOff,
    weight: "font-normal",
  },
};

export function severityStyle(level: number) {
  if (level >= 3) {
    return {
      bar: "bg-foreground",
      icon: Siren,
      label: "alert",
      weight: "font-semibold",
      chip: "bg-foreground text-inverse",
    };
  }
  if (level === 2) {
    return {
      bar: "bg-foreground",
      icon: AlertTriangle,
      label: "critical",
      weight: "font-semibold",
      chip: "ring-1 ring-border-strong",
    };
  }
  if (level === 1) {
    return {
      bar: "bg-muted",
      icon: AlertCircle,
      label: "warn",
      weight: "font-normal",
      chip: "",
    };
  }
  return {
    bar: "bg-subtle",
    icon: Info,
    label: "info",
    weight: "font-normal",
    chip: "",
  };
}

export function truncatePubkey(pk: string, head = 4, tail = 4): string {
  if (!pk) return "—";
  if (pk.length <= head + tail + 1) return pk;
  return `${pk.slice(0, head)}…${pk.slice(-tail)}`;
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function lamportsToSol(lamports: number, digits = 6): string {
  return `${(lamports / 1e9).toFixed(digits)} SOL`;
}
