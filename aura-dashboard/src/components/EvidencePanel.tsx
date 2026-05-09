"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, VideoOff } from "lucide-react";

type InvestigationResult = {
  diagnosis: {
    proximate_cause: string;
    visual_evidence_cited: string[];
    telemetry_evidence_cited: string[];
    severity_assessment: string;
    recommended_action: string;
    confidence_pct: number;
  };
  encord_evidence_frame_index: number;
  encord_attestation_tx: string;
  encord_label_hash: string;
};

type Label = {
  frame_index: number;
  timestamp_s: number;
  type: "temporal_segment" | "bbox" | "keypoint";
  category: string;
  frame_range?: [number, number];
  bbox?: { x: number; y: number; w: number; h: number };
  point?: { x: number; y: number };
  confidence: number;
  encord_object_hash: string;
};

type Provenance = {
  encord_label_hash: string;
  exported_at: string;
  label_count: number;
  attestation_tx: string;
  attestation_explorer_url: string;
};

const FLEET_HTTP = "http://localhost:8780";
const AGENT_WS = "ws://localhost:8770/aura";

function totalFrames(robotId: string): number {
  return robotId === "robot_03" ? 450 : 900;
}

export function EvidencePanel({ robotId }: { robotId: string }) {
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [labelsAtFrame, setLabelsAtFrame] = useState<Label[]>([]);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch(`${FLEET_HTTP}/robot/${robotId}/encord_provenance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setProvenance(data as Provenance);
      })
      .catch(() => {});
  }, [robotId]);

  useEffect(() => {
    const ws = new WebSocket(AGENT_WS);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(evt.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.type !== "tool_result" || msg.tool_name !== "investigate_anomaly") return;

      const inv = msg.tool_result as InvestigationResult;
      setInvestigation(inv);

      const frame = inv.encord_evidence_frame_index ?? 0;
      fetch(`${FLEET_HTTP}/robot/${robotId}/encord_labels/at_frame?frame=${frame}`)
        .then((r) => (r.ok ? r.json() : { labels: [] }))
        .then((data: { labels: Label[] }) => setLabelsAtFrame(data.labels ?? []))
        .catch(() => setLabelsAtFrame([]));
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [robotId]);

  const total = totalFrames(robotId);

  if (!investigation) {
    return (
      <section className="border border-border bg-surface-1">
        <div className="border-b border-border px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
            visual ground truth · encord
          </span>
        </div>
        <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-subtle">
          no investigation yet · ask aura to investigate an anomaly
        </div>
      </section>
    );
  }

  const { diagnosis, encord_evidence_frame_index, encord_attestation_tx, encord_label_hash } =
    investigation;
  const attestTx = encord_attestation_tx || provenance?.attestation_tx || "";
  const explorerUrl =
    provenance?.attestation_explorer_url ||
    (attestTx && attestTx !== "PENDING"
      ? `https://explorer.solana.com/tx/${attestTx}?cluster=devnet`
      : "");

  const temporalLabels = labelsAtFrame.filter((lb) => lb.type === "temporal_segment");
  const bboxLabels = labelsAtFrame.filter((lb) => lb.type === "bbox");
  const keypointLabels = labelsAtFrame.filter((lb) => lb.type === "keypoint");
  const hasSpatial = bboxLabels.length > 0 || keypointLabels.length > 0;

  return (
    <section className="border border-border bg-surface-1">
      <div className="border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
          visual ground truth · encord
        </span>
      </div>

      {/* Timeline strip */}
      <div className="px-3 pt-3">
        <div className="font-mono text-[9px] uppercase tracking-widest text-subtle mb-1">
          episode timeline
        </div>
        <svg width="100%" height="24" className="block">
          {temporalLabels.map((lb) => {
            const fr = lb.frame_range ?? [lb.frame_index, lb.frame_index];
            const x = (fr[0] / total) * 100;
            const w = Math.max(((fr[1] - fr[0]) / total) * 100, 0.5);
            const isActive =
              encord_evidence_frame_index >= fr[0] && encord_evidence_frame_index <= fr[1];
            return (
              <rect
                key={lb.encord_object_hash}
                x={`${x}%`}
                y="4"
                width={`${w}%`}
                height="16"
                fill="var(--foreground)"
                fillOpacity={isActive ? 0.7 : 0.3}
              />
            );
          })}
          {/* Evidence frame marker */}
          <line
            x1={`${(encord_evidence_frame_index / total) * 100}%`}
            y1="0"
            x2={`${(encord_evidence_frame_index / total) * 100}%`}
            y2="24"
            stroke="var(--foreground)"
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Label list */}
      {labelsAtFrame.length > 0 && (
        <div className="px-3 pt-2 pb-1 flex flex-col gap-0.5">
          {labelsAtFrame.map((lb) => (
            <div key={lb.encord_object_hash} className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] text-foreground">{lb.category}</span>
              <span className="font-mono text-[9px] text-subtle">{lb.type}</span>
              <span className="font-mono text-[9px] text-subtle">
                t={lb.timestamp_s.toFixed(2)}s
              </span>
            </div>
          ))}
        </div>
      )}

      {/* SVG bbox/keypoint overlay */}
      <div className="px-3 pt-2">
        <div
          className="relative bg-black"
          style={{ width: "100%", aspectRatio: "16/9", maxWidth: "320px" }}
        >
          {hasSpatial ? (
            <svg
              viewBox="0 0 100 56.25"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
              style={{ color: "var(--foreground)" }}
            >
              {bboxLabels.map((lb) => {
                const b = lb.bbox!;
                return (
                  <g key={lb.encord_object_hash}>
                    <rect
                      x={b.x * 100}
                      y={b.y * 56.25}
                      width={b.w * 100}
                      height={b.h * 56.25}
                      stroke="currentColor"
                      strokeWidth="0.5"
                      fill="none"
                    />
                    <text
                      x={b.x * 100 + 0.5}
                      y={b.y * 56.25 + 3}
                      fontSize="3"
                      fill="currentColor"
                    >
                      {lb.category}
                    </text>
                  </g>
                );
              })}
              {keypointLabels.map((lb) => {
                const p = lb.point!;
                return (
                  <circle
                    key={lb.encord_object_hash}
                    cx={p.x * 100}
                    cy={p.y * 56.25}
                    r="1.5"
                    fill="currentColor"
                  />
                );
              })}
            </svg>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <VideoOff className="h-5 w-5 text-subtle" strokeWidth={1.25} />
              <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
                no spatial labels
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Diagnosis card */}
      <div className="px-3 pt-3 pb-1 flex flex-col gap-2">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-subtle mb-0.5">
            proximate cause
          </div>
          <div className="font-mono text-[11px] text-foreground">{diagnosis.proximate_cause}</div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-subtle mb-0.5">
            recommended action
          </div>
          <div className="font-mono text-[11px] text-muted">{diagnosis.recommended_action}</div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-subtle mb-1">
            confidence {diagnosis.confidence_pct}%
          </div>
          <div className="h-px w-full bg-surface-2">
            <div
              style={{ width: `${diagnosis.confidence_pct}%` }}
              className="h-0.5 bg-foreground"
            />
          </div>
        </div>
        {diagnosis.visual_evidence_cited.length > 0 && (
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-subtle mb-0.5">
              visual evidence
            </div>
            {diagnosis.visual_evidence_cited.map((ev, i) => (
              <div key={i} className="font-mono text-[10px] text-subtle">
                · {ev}
              </div>
            ))}
          </div>
        )}
        {diagnosis.telemetry_evidence_cited.length > 0 && (
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-subtle mb-0.5">
              telemetry evidence
            </div>
            {diagnosis.telemetry_evidence_cited.map((ev, i) => (
              <div key={i} className="font-mono text-[10px] text-subtle">
                · {ev}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attestation row */}
      <div className="border-t border-border px-3 py-2 flex items-center gap-2">
        {attestTx && attestTx !== "PENDING" ? (
          <>
            <span className="border border-border font-mono text-[9px] uppercase tracking-widest text-foreground px-1.5 py-0.5">
              encord-attested
            </span>
            <span className="font-mono text-[9px] text-subtle">{attestTx.slice(0, 8)}</span>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-subtle hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
              </a>
            )}
          </>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
            attestation pending
          </span>
        )}
      </div>
    </section>
  );
}
