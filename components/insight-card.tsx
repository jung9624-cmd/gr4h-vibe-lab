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
          무엇이 달라졌나?
        </h2>
        <div className="text-sm leading-relaxed">
          x4를 늘리면 유효우량이 더 긴 단위도에 걸쳐 분산되어, 일반적으로 수문곡선의 첨두가 늦어지고 낮아집니다.
          이번 결과에서는 x4를 절반으로 줄이면 첨두가{" "}
          <span className="font-mono font-semibold tabular-nums">{halfPeakQCms.toFixed(2)} m³/s</span>로
          높아지고 지체시간이{" "}
          <span className="font-mono font-semibold tabular-nums">{formatLag(halfLagHours)}</span>로 짧아지며, 두
          배로 늘리면 첨두가{" "}
          <span className="font-mono font-semibold tabular-nums">{doublePeakQCms.toFixed(2)} m³/s</span>로
          낮아지고 지체시간이{" "}
          <span className="font-mono font-semibold tabular-nums">{formatLag(doubleLagHours)}</span>로 길어집니다.
        </div>
      </div>
    </Card>
  );
}
