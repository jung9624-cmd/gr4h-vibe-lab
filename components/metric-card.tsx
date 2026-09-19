import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  /** Short explanation shown under the value, e.g. why a value is undefined. */
  note?: string;
}

export function MetricCard({ icon: Icon, label, value, unit, note }: MetricCardProps) {
  return (
    <Card size="sm" className="px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className="size-[15px] text-[#2a78d6]" strokeWidth={2} />
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-[13px] text-muted-foreground">{unit}</span>
      </div>
      {note && <div className="mt-1 text-xs leading-snug text-muted-foreground">{note}</div>}
    </Card>
  );
}
