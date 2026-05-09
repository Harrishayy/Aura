"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

type Props = {
  data: number[];
  height?: number;
  stroke?: string;
  fill?: string;
};

export function Sparkline({
  data,
  height = 36,
  stroke = "var(--muted)",
  fill = "var(--surface-2)",
}: Props) {
  const reactId = useId();
  if (!data || data.length < 2) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center font-mono text-[9px] uppercase tracking-widest text-subtle"
      >
        no data
      </div>
    );
  }

  const points = data.map((v, i) => ({ i, v }));
  const id = `spark-${reactId.replace(/:/g, "")}`;

  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity={0.7} />
              <stop offset="100%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
