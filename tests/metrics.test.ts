import { describe, it, expect } from "vitest";
import { simulateGR4H } from "@/lib/gr4h";
import { buildScenarioInput } from "@/lib/storm";
import { computeStormMetrics, runX4SensitivityExperiment } from "@/lib/metrics";

describe("computeStormMetrics — default scenario", () => {
  const input = buildScenarioInput();
  const output = simulateGR4H(input);
  const metrics = computeStormMetrics(input.precipitation, output, input.areaKm2);

  it("sums precipitation to the total rainfall depth (50mm)", () => {
    expect(metrics.totalRainfallMm).toBeCloseTo(50, 10);
  });

  it("finds the rainfall peak at hour 17 (storm midpoint)", () => {
    expect(metrics.rainfallPeakTimeHour).toBe(17);
  });

  it("finds a discharge peak that occurs after the rainfall peak", () => {
    expect(metrics.peakDischargeTimeHour).toBeGreaterThan(metrics.rainfallPeakTimeHour!);
    expect(metrics.peakDischargeCms).toBeGreaterThan(0);
  });

  it("computes a positive rainfall -> flow lag", () => {
    expect(metrics.lagHours).toBe(
      metrics.peakDischargeTimeHour - metrics.rainfallPeakTimeHour!
    );
    expect(metrics.lagHours).toBeGreaterThan(0);
  });

  it("keeps the runoff ratio within a physically sane [0, 1] range for this scenario", () => {
    expect(metrics.runoffRatio).toBeGreaterThan(0);
    expect(metrics.runoffRatio).toBeLessThan(1);
    expect(metrics.runoffRatio).toBeCloseTo(
      metrics.totalRunoffVolumeMm / metrics.totalRainfallMm,
      10
    );
  });

  it("converts runoff volume to m3 consistently with the mm depth and area", () => {
    const expectedM3 = (metrics.totalRunoffVolumeMm / 1000) * (input.areaKm2 * 1_000_000);
    expect(metrics.totalRunoffVolumeM3).toBeCloseTo(expectedM3, 6);
  });
});

describe("computeStormMetrics — no-rainfall edge case", () => {
  it("returns null peak/lag and a zero runoff ratio when there is no rainfall", () => {
    const input = buildScenarioInput({ rainfallMultiplier: 0 });
    const output = simulateGR4H(input);
    const metrics = computeStormMetrics(input.precipitation, output, input.areaKm2);

    expect(metrics.totalRainfallMm).toBe(0);
    expect(metrics.rainfallPeakTimeHour).toBeNull();
    expect(metrics.lagHours).toBeNull();
    expect(metrics.runoffRatio).toBe(0);
  });
});

describe("computeStormMetrics — validation", () => {
  it("throws when precipitation and output series lengths differ", () => {
    const input = buildScenarioInput();
    const output = simulateGR4H(input);
    expect(() =>
      computeStormMetrics(input.precipitation.slice(0, -1), output, input.areaKm2)
    ).toThrow(/same length/);
  });
});

describe("runX4SensitivityExperiment", () => {
  const input = buildScenarioInput(); // x4 = 5 by default
  const scenarios = runX4SensitivityExperiment(input);

  it("runs exactly the x4/2, x4, and 2x4 scenarios in that order", () => {
    expect(scenarios.map((s) => s.label)).toEqual(["x4/2", "x4", "2x4"]);
    expect(scenarios.map((s) => s.x4)).toEqual([input.x4 / 2, input.x4, input.x4 * 2]);
  });

  it("shows a faster (smaller x4) response producing a higher, earlier peak", () => {
    const [half, base, double] = scenarios;
    expect(half.peakDischargeCms).toBeGreaterThan(base.peakDischargeCms);
    expect(base.peakDischargeCms).toBeGreaterThan(double.peakDischargeCms);

    expect(half.lagHours!).toBeLessThan(base.lagHours!);
    expect(base.lagHours!).toBeLessThan(double.lagHours!);
  });

  it("does not mutate the base scenario input", () => {
    expect(input.x4).toBe(5);
  });

  it("matches a direct simulateGR4H + computeStormMetrics run for the x4 = base case", () => {
    const directOutput = simulateGR4H(input);
    const directMetrics = computeStormMetrics(input.precipitation, directOutput, input.areaKm2);
    const baseScenario = scenarios.find((s) => s.label === "x4")!;

    expect(baseScenario.peakDischargeCms).toBeCloseTo(directMetrics.peakDischargeCms, 10);
    expect(baseScenario.lagHours).toBe(directMetrics.lagHours);
  });
});
