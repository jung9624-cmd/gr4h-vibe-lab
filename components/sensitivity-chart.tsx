"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SensitivityChartPoint {
  hour: number;
  half: number;
  base: number;
  double: number;
}

export interface SensitivityChartProps {
  data: SensitivityChartPoint[];
  halfLabel: string;
  baseLabel: string;
  doubleLabel: string;
}

const HALF_COLOR = "#eb6834";
const BASE_COLOR = "#2a78d6";
const DOUBLE_COLOR = "#1baf7a";
const AXIS_TEXT = "#5c5c58";

function hourTick(hour: number) {
  return `${hour}h`;
}

function LegendSwatch({ color, label, bold }: { color: string; label: string; bold?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs ${bold ? "font-semibold" : ""}`}>
      <span className="inline-block rounded-sm" aria-hidden="true" style={{ background: color, width: 10, height: bold ? 2.5 : 2 }} />
      {label}
    </span>
  );
}

export function SensitivityChart({ data, halfLabel, baseLabel, doubleLabel }: SensitivityChartProps) {
  const lastHour = data.length > 0 ? data[data.length - 1].hour : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        <LegendSwatch color={HALF_COLOR} label={halfLabel} />
        <LegendSwatch color={BASE_COLOR} label={baseLabel} bold />
        <LegendSwatch color={DOUBLE_COLOR} label={doubleLabel} />
      </div>
      <div className="h-[148px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, lastHour]}
              ticks={[0, 24, 48, 72].filter((h) => h <= lastHour)}
              tickFormatter={hourTick}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              axisLine={{ stroke: "#e4e4e2" }}
              tickLine={false}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                const labels: Record<string, string> = { half: halfLabel, base: baseLabel, double: doubleLabel };
                return [`${Number(value).toFixed(2)} m³/s`, labels[String(name)] ?? String(name)];
              }}
              labelFormatter={(label: unknown) => hourTick(Number(label))}
            />
            <Line type="monotone" dataKey="double" stroke={DOUBLE_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="half" stroke={HALF_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="base" stroke={BASE_COLOR} strokeWidth={3} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
