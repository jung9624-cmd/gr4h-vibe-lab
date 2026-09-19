export interface SensitivityTableRow {
  label: string;
  color: string;
  peakQCms: number;
  lagHours: number | null;
  highlight?: boolean;
}

export interface SensitivityTableProps {
  rows: SensitivityTableRow[];
}

export function SensitivityTable({ rows }: SensitivityTableProps) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <caption className="sr-only">Peak discharge and lag for x4/2, x4 and 2×x4</caption>
      <thead>
        <tr className="border-b">
          <th scope="col" className="px-0 py-1.5 pr-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Case
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Peak Q
          </th>
          <th scope="col" className="py-1.5 pl-2 text-right font-mono text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Lag
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className={`border-b last:border-b-0 ${row.highlight ? "bg-muted/50 font-semibold" : ""}`}
          >
            <th scope="row" className="px-0 py-2 pr-2 text-left font-[inherit]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-sm" style={{ background: row.color }} aria-hidden="true" />
                {row.label}
              </span>
            </th>
            <td className="px-2 py-2 text-right font-mono tabular-nums">{row.peakQCms.toFixed(2)} m³/s</td>
            <td className="py-2 pl-2 text-right font-mono tabular-nums">
              {row.lagHours === null ? "—" : `${row.lagHours}h`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
