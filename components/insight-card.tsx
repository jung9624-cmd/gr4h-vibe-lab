import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface InsightCardProps {
  halfPeakQCms: number;
  halfLagHours: number | null;
  doublePeakQCms: number;
  doubleLagHours: number | null;
}

function formatLag(hours: number | null) {
  return hours === null ? "—" : `${hours}h`;
}

export function InsightCard({ halfPeakQCms, halfLagHours, doublePeakQCms, doubleLagHours }: InsightCardProps) {
  return (
    <Card className="flex gap-3 bg-[#fafaf7] p-4 px-5">
      <Lightbulb className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" strokeWidth={2} />
      <div>
        <h2 className="mb-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          What changed?
        </h2>
        <div className="text-sm leading-relaxed">
          Increasing x4 spreads effective rainfall over a longer unit hydrograph, typically delaying and
          attenuating the hydrograph peak. In this run, halving x4 raises the peak to{" "}
          <span className="font-mono font-semibold tabular-nums">{halfPeakQCms.toFixed(2)} m³/s</span> and
          shortens the lag to{" "}
          <span className="font-mono font-semibold tabular-nums">{formatLag(halfLagHours)}</span>, while
          doubling it lowers the peak to{" "}
          <span className="font-mono font-semibold tabular-nums">{doublePeakQCms.toFixed(2)} m³/s</span> and
          stretches the lag to{" "}
          <span className="font-mono font-semibold tabular-nums">{formatLag(doubleLagHours)}</span>.
        </div>
      </div>
    </Card>
  );
}
