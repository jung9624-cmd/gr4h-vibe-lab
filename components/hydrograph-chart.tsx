"use client";

import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { formatTick, niceCeil } from "@/lib/chart-scale";

export interface HydrographPoint {
  hour: number;
  precipitation: number;
  qt: number;
  qd: number;
  qb: number;
  /** Total discharge of the baseline (default) scenario, for visual comparison. */
  baselineQt: number;
  /** Precipitation of the baseline scenario; only used to keep the rain axis stable. */
  baselinePrecipitation: number;
}

export interface HydrographChartProps {
  data: HydrographPoint[];
  rainPeakHour: number | null;
  rainPeakValue: number;
  qPeakHour: number;
  qPeakValue: number;
}

const PRECIP_FILL = "#9ec5f4";
const PRECIP_EDGE = "#5598e7";
const TOTAL_Q = "#2a78d6";
const DIRECT_Q = "#eb6834";
const BASE_Q = "#1baf7a";
const BASELINE_Q = "#8a8985";
const AXIS_TEXT = "#5c5c58";
const AXIS_LINE = "#e4e4e2";
const RAIN_PEAK_LINE = "#b6b5ae";
const Q_PEAK_LINE = "#52514e";

// Both charts share the same left/right geometry so the hour axis lines up.
const Y_AXIS_WIDTH = 70;
const SIDE_MARGIN = { left: 4, right: 8 };
// Headroom above the plot area for the peak labels (they are drawn above it).
const LABEL_HEADROOM = 22;

function hourTick(hour: number) {
  return `${hour}h`;
}

function LegendSwatch({
  color,
  label,
  bold,
  square,
  dashed,
}: {
  color: string;
  label: string;
  bold?: boolean;
  square?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className={`flex items-center gap-1.5 text-xs ${bold ? "font-semibold" : ""}`}>
      <span
        className="inline-block rounded-sm"
        aria-hidden="true"
        style={{
          width: dashed ? 14 : 10,
          height: square ? 10 : bold ? 2.5 : 2,
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}

export function HydrographChart({
  data,
  rainPeakHour,
  rainPeakValue,
  qPeakHour,
  qPeakValue,
}: HydrographChartProps) {
  // Axis limits come from the larger of the current and the baseline scenario
  // and snap to round numbers. They therefore stay put while a slider moves, so
  // a change in peak height or rainfall intensity is visible instead of being
  // rescaled away.
  // The rain axis has no baseline curve to compare against, so it keeps 2x
  // headroom over the baseline storm: a x2 rainfall multiplier then fills the
  // panel instead of being rescaled to look identical.
  const precipMax = niceCeil(
    Math.max(...data.map((d) => Math.max(d.precipitation, 2 * d.baselinePrecipitation)))
  );
  const flowMax = niceCeil(Math.max(...data.map((d) => Math.max(d.qt, d.qd, d.qb, d.baselineQt))));
  const lastHour = data.length > 0 ? data[data.length - 1].hour : 0;
  const xTicks = [0, 12, 24, 36, 48, 60, 72].filter((h) => h <= lastHour);

  const summary =
    `Hydrograph over ${data.length} hours. ` +
    (rainPeakHour !== null
      ? `Rainfall peaks at hour ${rainPeakHour} at ${rainPeakValue.toFixed(1)} millimetres per hour. `
      : "No rainfall. ") +
    `Peak discharge is ${qPeakValue.toFixed(2)} cubic metres per second at hour ${qPeakHour}.`;

  return (
    <Card className="p-4 sm:p-[22px]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-[15px] font-semibold">Hydrograph</h2>
          <div className="mt-0.5 text-xs text-muted-foreground">Model response to the controls</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendSwatch color={PRECIP_FILL} label="Precipitation" square />
          <LegendSwatch color={TOTAL_Q} label="Total Q" bold />
          <LegendSwatch color={DIRECT_Q} label="Direct Q" />
          <LegendSwatch color={BASE_Q} label="Routing/Base Q" />
          <LegendSwatch color={BASELINE_Q} label="Baseline Total Q" dashed />
        </div>
      </div>
      <p className="sr-only">{summary}</p>

      {/* Precipitation — inverted axis: 0 at the top, bars hang down toward the hydrograph */}
      <div className="h-[110px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} syncId="hydrograph" margin={{ top: LABEL_HEADROOM, bottom: 4, ...SIDE_MARGIN }}>
            <XAxis dataKey="hour" type="number" domain={[0, lastHour]} hide />
            <YAxis
              reversed
              domain={[0, precipMax]}
              width={Y_AXIS_WIDTH}
              ticks={[0, precipMax]}
              tickFormatter={(v: number) => `${formatTick(v)} mm/h`}
              tick={{ fontSize: 12, fill: AXIS_TEXT }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: unknown) => [`${Number(value).toFixed(1)} mm/h`, "Precipitation"]}
              labelFormatter={(label: unknown) => hourTick(Number(label))}
            />
            <Bar
              dataKey="precipitation"
              fill={PRECIP_FILL}
              stroke={PRECIP_EDGE}
              strokeWidth={0.5}
              isAnimationActive={false}
            />
            {rainPeakHour !== null && (
              <ReferenceLine
                x={rainPeakHour}
                stroke={RAIN_PEAK_LINE}
                strokeWidth={1.25}
                strokeDasharray="2 3"
                label={{
                  value: `Rain Peak ${rainPeakHour}:00`,
                  position: "top",
                  fontSize: 11,
                  fill: "#3f3f3c",
                }}
              />
            )}
            <ReferenceLine x={qPeakHour} stroke={Q_PEAK_LINE} strokeWidth={1.5} strokeDasharray="5 3" />
            {rainPeakHour !== null && (
              <ReferenceDot
                x={rainPeakHour}
                y={rainPeakValue}
                r={4}
                fill={PRECIP_EDGE}
                stroke="#ffffff"
                strokeWidth={1.25}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Streamflow — total / direct / routing-base discharge against the baseline */}
      <div className="h-[260px] w-full sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} syncId="hydrograph" margin={{ top: LABEL_HEADROOM, bottom: 4, ...SIDE_MARGIN }}>
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, lastHour]}
              ticks={xTicks}
              tickFormatter={hourTick}
              tick={{ fontSize: 12, fill: AXIS_TEXT }}
              axisLine={{ stroke: AXIS_LINE }}
              tickLine={false}
            />
            <YAxis
              domain={[0, flowMax]}
              width={Y_AXIS_WIDTH}
              ticks={[0, flowMax / 2, flowMax]}
              tickFormatter={(v: number) => `${formatTick(v)} m³/s`}
              tick={{ fontSize: 12, fill: AXIS_TEXT }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                const labels: Record<string, string> = {
                  qt: "Total Q",
                  qd: "Direct Q",
                  qb: "Routing/Base Q",
                  baselineQt: "Baseline Total Q",
                };
                return [`${Number(value).toFixed(2)} m³/s`, labels[String(name)] ?? String(name)];
              }}
              labelFormatter={(label: unknown) => hourTick(Number(label))}
            />
            {rainPeakHour !== null && (
              <ReferenceLine x={rainPeakHour} stroke={RAIN_PEAK_LINE} strokeWidth={1.25} strokeDasharray="2 3" />
            )}
            <ReferenceLine
              x={qPeakHour}
              stroke={Q_PEAK_LINE}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              label={{
                value: `Q Peak ${qPeakHour}:00`,
                position: "top",
                fontSize: 11,
                fontWeight: 600,
                fill: "#0b0b0b",
              }}
            />
            <Line
              type="monotone"
              dataKey="baselineQt"
              stroke={BASELINE_Q}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line type="monotone" dataKey="qb" stroke={BASE_Q} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="qd" stroke={DIRECT_Q} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="qt" stroke={TOTAL_Q} strokeWidth={3} dot={false} isAnimationActive={false} />
            <ReferenceDot x={qPeakHour} y={qPeakValue} r={4.5} fill={TOTAL_Q} stroke="#ffffff" strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
