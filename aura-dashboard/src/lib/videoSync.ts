"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type ReadinessBarrier = {
  allReady: boolean;
  handler: (key: string) => (ready: boolean) => void;
};

export function useReadinessBarrier(keys: readonly string[]): ReadinessBarrier {
  const [ready, setReady] = useState<Record<string, boolean>>({});

  const update = useCallback((key: string, value: boolean) => {
    setReady((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const handlerCache = useRef<Record<string, (r: boolean) => void>>({});
  const handler = useCallback(
    (key: string) => {
      let cached = handlerCache.current[key];
      if (!cached) {
        cached = (r: boolean) => update(key, r);
        handlerCache.current[key] = cached;
      }
      return cached;
    },
    [update],
  );

  const allReady = useMemo(
    () => keys.length > 0 && keys.every((k) => ready[k] === true),
    [keys, ready],
  );

  return { allReady, handler };
}
