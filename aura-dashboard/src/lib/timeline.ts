"use client";

import { useEffect, useRef, useState } from "react";
import { assetUrl } from "./assetUrl";

export type TimelineFrame = {
  t: number;
  joints: number[];
  torques: number[];
  gripper_open: boolean;
  gripper_force: number;
  fault_flags: string[];
};

export type TimelineEvent = {
  t: number;
  type: string;
  payload: Record<string, unknown>;
};

export type Timeline = {
  robot_id: string;
  duration_s: number;
  rate_hz: number;
  frame_count: number;
  frames: TimelineFrame[];
  events: TimelineEvent[];
};

const cache = new Map<string, Timeline>();
const inflight = new Map<string, Promise<Timeline>>();

export function useTimeline(robotId: string): Timeline | null {
  const [timeline, setTimeline] = useState<Timeline | null>(
    () => cache.get(robotId) ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    const cached = cache.get(robotId);
    if (cached) {
      setTimeline(cached);
      return;
    }
    let pending = inflight.get(robotId);
    if (!pending) {
      pending = fetch(assetUrl(`/qwen/${robotId}/timeline.json`))
        .then((r) => {
          if (!r.ok) throw new Error(`timeline ${robotId}: ${r.status}`);
          return r.json() as Promise<Timeline>;
        })
        .then((data) => {
          cache.set(robotId, data);
          inflight.delete(robotId);
          return data;
        })
        .catch((err) => {
          inflight.delete(robotId);
          throw err;
        });
      inflight.set(robotId, pending);
    }
    pending.then((data) => {
      if (!cancelled) setTimeline(data);
    }).catch(() => {
      if (!cancelled) setTimeline(null);
    });
    return () => {
      cancelled = true;
    };
  }, [robotId]);

  return timeline;
}

export type ScrubState = {
  t: number;
  playing: boolean;
  duration: number;
  setT: (t: number) => void;
  togglePlay: () => void;
  step: (dt: number) => void;
  reset: () => void;
};

export function useScrub(duration: number, enabled: boolean = true): ScrubState {
  const [t, setTState] = useState(0);
  const [playing, setPlaying] = useState(true);
  const tRef = useRef(0);
  const durRef = useRef(duration);

  useEffect(() => {
    durRef.current = duration;
  }, [duration]);

  function setT(next: number) {
    const clamped = Math.max(0, Math.min(durRef.current, next));
    tRef.current = clamped;
    setTState(clamped);
  }

  function togglePlay() {
    setPlaying((p) => !p);
  }

  function step(dt: number) {
    setT(tRef.current + dt);
  }

  function reset() {
    setT(0);
  }

  useEffect(() => {
    if (!playing || !enabled) return;
    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      const next = tRef.current + dt;
      if (next >= durRef.current) {
        tRef.current = durRef.current;
        setTState(durRef.current);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setTState(next);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, enabled]);

  return { t, playing, duration, setT, togglePlay, step, reset };
}

export function frameAt(timeline: Timeline | null, t: number): TimelineFrame | null {
  if (!timeline || timeline.frames.length === 0) return null;
  const frames = timeline.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) {
    lo -= 1;
  }
  return frames[lo];
}

export function frameWindow(
  timeline: Timeline | null,
  t: number,
  count: number,
): TimelineFrame[] {
  if (!timeline || timeline.frames.length === 0) return [];
  const frames = timeline.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const end = lo + 1;
  const start = Math.max(0, end - count);
  return frames.slice(start, end);
}
