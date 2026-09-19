"use client";

import { useId, useState } from "react";
import { ChevronDown, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { PARAMETER_RANGES, type AdjustableParameter } from "@/lib/storm";

// lib/storm.ts's EDUCATIONAL_RANGE_DISCLAIMER carries the Korean-language
// disclaimer required alongside PARAMETER_RANGES; the finalized Pencil
// design (design/gr4h-dashboard.pen) renders the same disclaimer in the
// dashboard's own English UI copy, shown below.

export interface ParameterValues {
  areaKm2: number;
  rainfallMultiplier: number;
  petMmPerHour: number;
  x1: number;
  x2: number;
  x3: number;
  x4: number;
  ps0: number;
  rs0: number;
}

export interface ParameterPanelProps {
  values: ParameterValues;
  onChange: (key: AdjustableParameter, value: number) => void;
  onReset: () => void;
}

// Shown under the slider being adjusted. Statements of what the parameter
// represents, not of what a "good" value is.
const PARAMETER_MEANINGS: Partial<Record<AdjustableParameter, string>> = {
  x1: "Production store capacity",
  x2: "Groundwater exchange coefficient",
  x3: "Routing store capacity",
  x4: "Unit hydrograph time base",
  ps0: "Initial production-store saturation",
  rs0: "Initial routing-store saturation",
};

interface RowSpec {
  param: AdjustableParameter;
  label: string;
  description?: string;
  unit: string;
  decimals?: number;
}

const GROUPS: { title: string; rows: RowSpec[] }[] = [
  {
    title: "Catchment",
    rows: [
      { param: "areaKm2", label: "Area", unit: "km²" },
      { param: "rainfallMultiplier", label: "Rainfall multiplier", unit: "×", decimals: 1 },
      { param: "petMmPerHour", label: "PET", unit: "mm/h", decimals: 2 },
    ],
  },
  {
    title: "Model Parameters",
    rows: [
      { param: "x1", label: "x1", description: "Production Store", unit: "mm" },
      { param: "x2", label: "x2", description: "Groundwater Exchange", unit: "mm", decimals: 1 },
      { param: "x3", label: "x3", description: "Routing Store", unit: "mm" },
      { param: "x4", label: "x4", description: "UH Time Base", unit: "h", decimals: 1 },
    ],
  },
  {
    title: "Initial Condition",
    rows: [
      { param: "ps0", label: "ps0", description: "Production Storage", unit: "× x1", decimals: 2 },
      { param: "rs0", label: "rs0", description: "Routing Storage", unit: "× x3", decimals: 2 },
    ],
  },
];

interface SliderRowProps extends RowSpec {
  value: number;
  active: boolean;
  onActivate: (key: AdjustableParameter) => void;
  onChange: (key: AdjustableParameter, value: number) => void;
}

function SliderRow({ param, label, description, unit, decimals = 0, value, active, onActivate, onChange }: SliderRowProps) {
  const range = PARAMETER_RANGES[param];
  const meaning = PARAMETER_MEANINGS[param];

  return (
    <div onFocus={() => onActivate(param)} onPointerDown={() => onActivate(param)}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm">
          {description ? <span className="font-semibold">{label} </span> : label}
          {description ? <span className="text-muted-foreground">{description}</span> : null}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {value.toFixed(decimals)} <span className="font-normal text-muted-foreground">{unit}</span>
        </span>
      </div>
      <Slider
        thumbLabel={description ? `${label} ${description}` : label}
        valueText={`${value.toFixed(decimals)} ${unit}`.trim()}
        value={[value]}
        min={range.min}
        max={range.max}
        step={range.step}
        onValueChange={(v) => {
          onActivate(param);
          onChange(param, Array.isArray(v) ? v[0] : v);
        }}
      />
      {meaning !== undefined && (
        // The line is always reserved so revealing it never shifts the sliders below.
        <div className="mt-1 h-4 text-xs leading-4 text-muted-foreground">{active ? meaning : null}</div>
      )}
    </div>
  );
}

function summarize(v: ParameterValues) {
  return [
    `Area ${v.areaKm2} km²`,
    `Rain ×${v.rainfallMultiplier.toFixed(1)}`,
    `PET ${v.petMmPerHour.toFixed(2)}`,
    `x1 ${v.x1}`,
    `x2 ${v.x2.toFixed(1)}`,
    `x3 ${v.x3}`,
    `x4 ${v.x4.toFixed(1)} h`,
    `ps0 ${v.ps0.toFixed(2)}`,
    `rs0 ${v.rs0.toFixed(2)}`,
  ].join(" · ");
}

export function ParameterPanel({ values, onChange, onReset }: ParameterPanelProps) {
  const [activeKey, setActiveKey] = useState<AdjustableParameter | null>(null);
  // Below lg the panel stacks above the results and is collapsible so the
  // hydrograph (the response) is reachable without scrolling past every slider.
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const handleReset = () => {
    setActiveKey(null);
    onReset();
  };

  const title = (
    <>
      <SlidersHorizontal className="size-4" strokeWidth={2} />
      Experiment Controls
    </>
  );

  return (
    <aside
      aria-label="Experiment controls"
      className="flex w-full shrink-0 flex-col border-b px-4 py-4 sm:px-6 lg:w-[300px] lg:border-r lg:border-b-0 lg:py-[22px]"
    >
      <h2 className="hidden items-center gap-2 text-sm font-semibold lg:flex">{title}</h2>
      <h2 className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">{title}</span>
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      {!open && (
        <div className="mt-2 lg:hidden">
          <p className="font-mono text-xs leading-5 text-muted-foreground">{summarize(values)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Teaching ranges only &mdash; not calibration bounds.</p>
        </div>
      )}

      <div id={bodyId} className={`${open ? "flex" : "hidden"} flex-1 flex-col gap-[18px] pt-[18px] lg:flex`}>
        {GROUPS.map((group, index) => {
          const hasMeanings = group.rows.some((row) => PARAMETER_MEANINGS[row.param] !== undefined);
          return (
            <div key={group.title} className="flex flex-col gap-[18px]">
              {index > 0 && <div className="h-px bg-border" />}
              <div>
                <div className="mb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.title}
                </div>
                <div className={`flex flex-col ${hasMeanings ? "gap-1.5" : "gap-[14px]"}`}>
                  {group.rows.map((row) => (
                    <SliderRow
                      key={row.param}
                      {...row}
                      value={values[row.param]}
                      active={activeKey === row.param}
                      onActivate={setActiveKey}
                      onChange={onChange}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex-1" />

        <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleReset}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
        <div className="text-xs leading-tight text-muted-foreground">
          Teaching ranges only &mdash; not calibration bounds.
        </div>
      </div>
    </aside>
  );
}
