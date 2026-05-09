"use client";

import { create } from "zustand";
import type {
  AuraMessage,
  ComplianceEvent,
  ConnStatus,
  FleetStatus,
  JointFrame,
  PaymentEvent,
} from "./types";
import { mockFleet } from "./mockFleet";

const TELEMETRY_WINDOW = 60;
const PAYMENT_CAP = 100;
const COMPLIANCE_CAP = 50;
const TRANSCRIPT_CAP = 200;

type State = {
  fleet: FleetStatus;
  fleetUpdated: number;
  fleetStatus: ConnStatus;
  agentStatus: ConnStatus;
  selectedRobotId: string | null;
  telemetry: Record<string, JointFrame[]>;
  payments: PaymentEvent[];
  compliance: Record<string, ComplianceEvent[]>;
  transcript: AuraMessage[];

  setFleet: (fleet: FleetStatus) => void;
  setFleetStatus: (s: ConnStatus) => void;
  setAgentStatus: (s: ConnStatus) => void;
  setSelected: (id: string | null) => void;
  pushTelemetry: (robotId: string, frame: JointFrame) => void;
  pushPayment: (p: PaymentEvent) => void;
  pushCompliance: (robotId: string, e: ComplianceEvent) => void;
  setComplianceBackfill: (robotId: string, events: ComplianceEvent[]) => void;
  pushTranscript: (m: AuraMessage) => void;
};

export const useStore = create<State>((set) => ({
  fleet: mockFleet,
  fleetUpdated: 0,
  fleetStatus: "connecting",
  agentStatus: "connecting",
  selectedRobotId: null,
  telemetry: {},
  payments: [],
  compliance: {},
  transcript: [],

  setFleet: (fleet) => set({ fleet, fleetUpdated: Date.now() }),
  setFleetStatus: (fleetStatus) => set({ fleetStatus }),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  setSelected: (selectedRobotId) => set({ selectedRobotId }),

  pushTelemetry: (robotId, frame) =>
    set((s) => {
      const arr = s.telemetry[robotId] ?? [];
      const next = [...arr, frame];
      if (next.length > TELEMETRY_WINDOW) next.splice(0, next.length - TELEMETRY_WINDOW);
      return { telemetry: { ...s.telemetry, [robotId]: next } };
    }),

  pushPayment: (p) =>
    set((s) => {
      const next = [p, ...s.payments];
      if (next.length > PAYMENT_CAP) next.length = PAYMENT_CAP;
      return { payments: next };
    }),

  pushCompliance: (robotId, e) =>
    set((s) => {
      const arr = s.compliance[robotId] ?? [];
      if (arr.some((x) => x.tx_signature === e.tx_signature)) return s;
      const next = [e, ...arr];
      if (next.length > COMPLIANCE_CAP) next.length = COMPLIANCE_CAP;
      return { compliance: { ...s.compliance, [robotId]: next } };
    }),

  setComplianceBackfill: (robotId, events) =>
    set((s) => {
      const existing = s.compliance[robotId] ?? [];
      const seen = new Set(existing.map((e) => e.tx_signature || e.hash));
      const merged = [...existing];
      for (const e of events) {
        const key = e.tx_signature || e.hash;
        if (key && seen.has(key)) continue;
        merged.push(e);
        if (key) seen.add(key);
      }
      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (merged.length > COMPLIANCE_CAP) merged.length = COMPLIANCE_CAP;
      return { compliance: { ...s.compliance, [robotId]: merged } };
    }),

  pushTranscript: (m) =>
    set((s) => {
      const next = [...s.transcript, m];
      if (next.length > TRANSCRIPT_CAP) next.splice(0, next.length - TRANSCRIPT_CAP);
      return { transcript: next };
    }),
}));
