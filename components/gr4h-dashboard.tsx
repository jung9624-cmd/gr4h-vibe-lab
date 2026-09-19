"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CloudRain, Droplets, Percent, TrendingUp, Clock } from "lucide-react";
import { simulateGR4H } from "@/lib/gr4h";
import { DEFAULT_SCENARIO, buildScenarioInput, type AdjustableParameter } from "@/lib/storm";
import { compareToBaseline, computeStormMetrics, runX4SensitivityExperiment } from "@/lib/metrics";
import { Card } from "@/components/ui/card";
import { ParameterPanel, type ParameterValues } from "@/components/parameter-panel";
import { MetricCard } from "@/components/metric-card";
import { BaselineComparison } from "@/components/baseline-comparison";
import { HydrographChart } from "@/components/hydrograph-chart";
import { SensitivityChart } from "@/components/sensitivity-chart";
import { SensitivityTable } from "@/components/sensitivity-table";
import { InsightCard } from "@/components/insight-card";

const INITIAL_VALUES: ParameterValues = {
  areaKm2: DEFAULT_SCENARIO.areaKm2,
  rainfallMultiplier: DEFAULT_SCENARIO.rainfallMultiplier,
  petMmPerHour: DEFAULT_SCENARIO.petMmPerHour,
  x1: DEFAULT_SCENARIO.x1,
  x2: DEFAULT_SCENARIO.x2,
  x3: DEFAULT_SCENARIO.x3,
  x4: DEFAULT_SCENARIO.x4,
  ps0: DEFAULT_SCENARIO.ps0,
  rs0: DEFAULT_SCENARIO.rs0,
};

// Reference for the "change vs. baseline" readout and the dashed baseline
// curve: the default scenario, independent of the current slider positions.
const BASELINE = (() => {
  const input = buildScenarioInput(INITIAL_VALUES);
  const output = simulateGR4H(input);
  return {
    metrics: computeStormMetrics(input.precipitation, output, input.areaKm2),
    qt: output.qt,
    precipitation: input.precipitation,
  };
})();

function lagNote(peakPrecedesRainfall: boolean, totalRainfallMm: number) {
  if (peakPrecedesRainfall) return "첨두가 강우보다 먼저 발생: 초기 저류 배수이며 강우 반응이 아님";
  if (totalRainfallMm === 0) return "강우 없음";
  return undefined;
}

export function Gr4hDashboard() {
  const [values, setValues] = useState<ParameterValues>(INITIAL_VALUES);

  const handleChange = (key: AdjustableParameter, value: number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => setValues(INITIAL_VALUES);

  // Recomputed synchronously from lib/gr4h.ts + lib/storm.ts + lib/metrics.ts
  // (all React-free pure functions) on every parameter change.
  const { chartData, metrics, comparison, sensitivityScenarios, sensitivityChartData } = useMemo(() => {
    const input = buildScenarioInput(values);
    const output = simulateGR4H(input);
    const stormMetrics = computeStormMetrics(input.precipitation, output, input.areaKm2);
    const sensitivity = runX4SensitivityExperiment(input);

    const chartData = input.precipitation.map((precipitation, i) => ({
      hour: i,
      precipitation,
      qt: output.qt[i],
      qd: output.qd[i],
      qb: output.qb[i],
      baselineQt: BASELINE.qt[i],
      baselinePrecipitation: BASELINE.precipitation[i],
    }));

    const [half, base, double] = sensitivity;
    const sensitivityChartData = base.qt.map((_, i) => ({
      hour: i,
      half: half.qt[i],
      base: base.qt[i],
      double: double.qt[i],
    }));

    return {
      chartData,
      metrics: stormMetrics,
      comparison: compareToBaseline(stormMetrics, BASELINE.metrics),
      sensitivityScenarios: sensitivity,
      sensitivityChartData,
    };
  }, [values]);

  const rainPeakHour = metrics.rainfallPeakTimeHour;
  const rainPeakValue = rainPeakHour !== null ? chartData[rainPeakHour].precipitation : 0;
  const qPeakHour = metrics.peakDischargeTimeHour;
  const qPeakValue = metrics.peakDischargeCms;

  const [halfScenario, baseScenario, doubleScenario] = sensitivityScenarios;

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f6]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-[#f7f7f6] px-4 py-4 sm:h-[88px] sm:px-8 sm:py-0">
        <div className="flex items-center gap-3">
          <Droplets className="size-[26px] shrink-0 text-[#2a78d6]" strokeWidth={2} aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">GR4H Vibe Lab</h1>
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              시간단위 강우&ndash;유출 실험실
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-[11px] tracking-wide text-muted-foreground uppercase">참조 모형</div>
          <div className="mt-0.5 text-[15px] font-semibold">GR4H</div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">1시간 간격</div>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col lg:flex-row">
        <ParameterPanel values={values} onChange={handleChange} onReset={handleReset} />

        <div
          aria-hidden="true"
          className="absolute top-1/2 left-[300px] z-10 hidden size-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#171717] lg:flex"
        >
          <ArrowRight className="size-[13px] text-white" strokeWidth={2.5} />
        </div>

        <main className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-[22px]">
          <HydrographChart
            data={chartData}
            rainPeakHour={rainPeakHour}
            rainPeakValue={rainPeakValue}
            qPeakHour={qPeakHour}
            qPeakValue={qPeakValue}
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              icon={CloudRain}
              label="총강우량"
              value={metrics.totalRainfallMm.toFixed(1)}
              unit="mm"
            />
            <MetricCard
              icon={TrendingUp}
              label="첨두유량"
              value={metrics.peakDischargeCms.toFixed(2)}
              unit="m³/s"
            />
            <MetricCard
              icon={Clock}
              label="첨두 지체시간"
              value={metrics.lagHours === null ? "—" : String(metrics.lagHours)}
              unit="h"
              note={lagNote(metrics.peakPrecedesRainfall, metrics.totalRainfallMm)}
            />
            <MetricCard
              icon={Percent}
              label="유출률"
              value={(metrics.runoffRatio * 100).toFixed(1)}
              unit="%"
            />
          </div>

          <BaselineComparison comparison={comparison} />

          <Card className="p-4 sm:p-5">
            <div className="mb-2.5">
              <h2 className="text-[15px] font-semibold">x4 민감도 실험</h2>
              <div className="mt-0.5 text-xs text-muted-foreground">
                x4/2, x4, 2&times;x4 &mdash; 나머지 매개변수는 현재 값으로 고정
              </div>
            </div>
            <div className="flex flex-col gap-5 md:flex-row">
              <div className="min-w-0 flex-1">
                <SensitivityChart
                  data={sensitivityChartData}
                  halfLabel={`x4/2 = ${halfScenario.x4.toFixed(1)}h`}
                  baseLabel={`x4 = ${baseScenario.x4.toFixed(1)}h`}
                  doubleLabel={`2×x4 = ${doubleScenario.x4.toFixed(1)}h`}
                />
              </div>
              <div className="w-full shrink-0 md:w-[230px]">
                <SensitivityTable
                  rows={[
                    { label: "x4/2", color: "#eb6834", peakQCms: halfScenario.peakDischargeCms, lagHours: halfScenario.lagHours },
                    { label: "x4", color: "#2a78d6", peakQCms: baseScenario.peakDischargeCms, lagHours: baseScenario.lagHours, highlight: true },
                    { label: "2×x4", color: "#1baf7a", peakQCms: doubleScenario.peakDischargeCms, lagHours: doubleScenario.lagHours },
                  ]}
                />
              </div>
            </div>
          </Card>

          <InsightCard
            halfPeakQCms={halfScenario.peakDischargeCms}
            halfLagHours={halfScenario.lagHours}
            doublePeakQCms={doubleScenario.peakDischargeCms}
            doubleLagHours={doubleScenario.lagHours}
          />

          <footer className="space-y-1 pt-1 text-center text-xs text-muted-foreground">
            <p lang="en">
              Based on the open-source GR4H implementation by{" "}
              <a
                href="https://github.com/crdykman/GR4H"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                crdykman
              </a>
              . Educational demonstration.
            </p>
            <p>
              오픈소스 GR4H 구현(crdykman)을 바탕으로 한 교육용 시연입니다. GR4H는 GR4J 모형의 시간단위 개량판
              (Perrin et al., 2003; Mathevet, 2005)이며, 이 페이지는 이를 TypeScript로 다시 구현해 브라우저에서만
              계산합니다.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
