"use client";

import { useEffect, useState } from "react";
import type { FleetStatus } from "./mockFleet";
import { mockFleet } from "./mockFleet";

const FLEET_HTTP =
  process.env.NEXT_PUBLIC_FLEET_HTTP ?? "http://localhost:8780";

export function useFleetStatus(): {
  fleet: FleetStatus;
  connected: boolean;
  lastUpdated: Date | null;
} {
  const [fleet, setFleet] = useState<FleetStatus>(mockFleet);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const r = await fetch(`${FLEET_HTTP}/fleet/status`, { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = (await r.json()) as FleetStatus;
        if (!cancelled) {
          setFleet(body);
          setConnected(true);
          setLastUpdated(new Date());
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    poll();
    const id = setInterval(poll, 2_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { fleet, connected, lastUpdated };
}
