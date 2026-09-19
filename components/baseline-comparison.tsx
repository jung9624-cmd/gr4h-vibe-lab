import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  PERCENT_DISPLAY_DECIMALS,
  type BaselineComparison as BaselineComparisonData,
  type ChangeDirection,
} from "@/lib/metrics";

const percentFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: PERCENT_DISPLAY_DECIMALS,
  maximumFractionDigits: PERCENT_DISPLAY_DECIMALS,
});
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface BaselineComparisonProps {
  comparison: BaselineComparisonData;
}

// Direction is shown with a neutral glyph and the same ink as the rest of the
// UI: a change is a physical difference, not a good or bad outcome.
function Delta({ direction, children }: { direction: ChangeDirection; children: ReactNode }) {
  if (direction === "none") {
    return <span className="text-base font-medium text-muted-foreground">No change</span>;
  }
  const up = direction === "up";
  return (
    <span className="font-mono text-xl font-semibold tabular-nums">
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "Increased by " : "Decreased by "}</span> {children}
    </span>
  );
}

function Item({ label, delta, detail }: { label: string; delta: ReactNode; detail: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 leading-7">{delta}</div>
      <div className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">{detail}</div>
    </div>
  );
}

function hours(value: number | null) {
  return value === null ? "—" : `${value} h`;
}

function percentText(percent: number | null) {
  return percent === null ? "n/a (baseline 0)" : `${percentFormat.format(Math.abs(percent))} %`;
}

export function BaselineComparison({ comparison }: BaselineComparisonProps) {
  const { peakDischarge, lag, runoffVolume } = comparison;
  const thousandM3 = (m3: number) => `${oneDecimal.format(m3 / 1000)}`;

  return (
    <Card className="px-5 py-4">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold">Change vs. baseline</h2>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Baseline = default scenario. Physical differences only &mdash; no better or worse judgement.
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
        <Item
          label="Peak Q"
          delta={<Delta direction={peakDischarge.direction}>{percentText(peakDischarge.percent)}</Delta>}
          detail={`${twoDecimals.format(peakDischarge.baseline)} → ${twoDecimals.format(peakDischarge.current)} m³/s`}
        />
        <Item
          label="Lag"
          delta={
            lag.deltaHours === null ? (
              <span className="text-base font-medium text-muted-foreground">n/a (no storm-response peak)</span>
            ) : (
              <Delta direction={lag.direction}>{Math.abs(lag.deltaHours)} h</Delta>
            )
          }
          detail={`${hours(lag.baselineHours)} → ${hours(lag.currentHours)}`}
        />
        <Item
          label="Runoff volume"
          delta={<Delta direction={runoffVolume.direction}>{percentText(runoffVolume.percent)}</Delta>}
          detail={`${thousandM3(runoffVolume.baseline)} → ${thousandM3(runoffVolume.current)} ×10³ m³`}
        />
      </div>
    </Card>
  );
}
