// Scientific checks that do not depend on the Python fixtures' output values:
// unit conversion, runoff volume, peak time / lag definition, scenario state
// isolation and unit-hydrograph mass conservation.

import { describe, expect, it } from "vitest";
import { buildUnitHydrograph, simulateGR4H, type GR4HInput, type GR4HOutput } from "@/lib/gr4h";
import { buildScenarioInput } from "@/lib/storm";
import { computeStormMetrics, runX4SensitivityExperiment } from "@/lib/metrics";
import rawFixture from "./fixtures/python-reference.json";

const scenarios = (rawFixture as unknown as { scenarios: { id: string; input: GR4HInput }[] }).scenarios;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const relClose = (actual: number, expected: number, tol: number) =>
  Math.abs(actual - expected) <= tol * Math.abs(expected) + 1e-300;

function deepFreeze(input: GR4HInput): GR4HInput {
  Object.freeze(input.precipitation);
  Object.freeze(input.pet);
  return Object.freeze(input);
}

const clone = (input: GR4HInput): GR4HInput => ({
  ...input,
  precipitation: [...input.precipitation],
  pet: [...input.pet],
});

describe("mm/h -> m3/s conversion", () => {
  describe.each(scenarios)("$id", ({ input }) => {
    const out = simulateGR4H(input);

    it("uses (q_mm * area_km2) / 3.6 exactly, in the reference's operation order", () => {
      out.qt.forEach((q, i) => {
        expect(Object.is(q, (out.qt_mm[i] * input.areaKm2) / 3.6), `qt[${i}]`).toBe(true);
      });
    });

    it("agrees with the first-principles unit conversion (mm/h over km2 -> m3/s)", () => {
      // 1 mm/h over 1 km2 = 1e-3 m / 3600 s * 1e6 m2 = 1/3.6 m3/s
      out.qt.forEach((q, i) => {
        const fromUnits = (out.qt_mm[i] / 1000 / 3600) * (input.areaKm2 * 1e6);
        expect(relClose(q, fromUnits, 1e-14), `qt[${i}]`).toBe(true);
      });
    });

    it("keeps qt = qd + qb after conversion", () => {
      out.qt.forEach((q, i) => expect(relClose(out.qd[i] + out.qb[i], q, 1e-14), `hour ${i}`).toBe(true));
    });
  });

  it("scales linearly with area while the depth series (qt_mm, gwe, ps, rs) is area-independent", () => {
    const base = simulateGR4H({ ...buildScenarioInput(), areaKm2: 100 });
    const big = simulateGR4H({ ...buildScenarioInput(), areaKm2: 250 });
    expect(big.qt_mm).toEqual(base.qt_mm);
    expect(big.gwe).toEqual(base.gwe);
    expect(big.ps).toEqual(base.ps);
    expect(big.rs).toEqual(base.rs);
    base.qt.forEach((q, i) => expect(relClose(big.qt[i], q * 2.5, 1e-14), `qt[${i}]`).toBe(true));
  });

  it("maps 1 mm/h over 3.6 km2 to 1 m3/s", () => {
    const out = simulateGR4H({ ...buildScenarioInput(), areaKm2: 3.6 });
    out.qt.forEach((q, i) => expect(relClose(q, out.qt_mm[i], 1e-15), `hour ${i}`).toBe(true));
  });
});

describe("runoff volume", () => {
  describe.each(scenarios)("$id", ({ input }) => {
    const out = simulateGR4H(input);
    const metrics = computeStormMetrics(input.precipitation, out, input.areaKm2);

    it("depth = sum of hourly qt_mm", () => {
      expect(metrics.totalRunoffVolumeMm).toBe(sum(out.qt_mm));
    });

    it("volume by integrating m3/s over 3600 s steps equals the depth-based volume", () => {
      const integrated = sum(out.qt) * 3600;
      expect(relClose(integrated, metrics.totalRunoffVolumeM3, 1e-12)).toBe(true);
    });

    it("depth recovered from the m3 volume equals the mm depth", () => {
      const depthMm = (metrics.totalRunoffVolumeM3 / (input.areaKm2 * 1e6)) * 1000;
      expect(relClose(depthMm, metrics.totalRunoffVolumeMm, 1e-12)).toBe(true);
    });

    it("runoff ratio = runoff depth / rainfall depth (0 when there is no rain)", () => {
      const expected = metrics.totalRainfallMm > 0 ? metrics.totalRunoffVolumeMm / metrics.totalRainfallMm : 0;
      expect(metrics.runoffRatio).toBe(expected);
    });
  });

  it("depth is independent of area, m3 volume scales with it", () => {
    const input = buildScenarioInput();
    const a = computeStormMetrics(input.precipitation, simulateGR4H({ ...input, areaKm2: 100 }), 100);
    const b = computeStormMetrics(input.precipitation, simulateGR4H({ ...input, areaKm2: 250 }), 250);
    expect(b.totalRunoffVolumeMm).toBe(a.totalRunoffVolumeMm);
    expect(relClose(b.totalRunoffVolumeM3, a.totalRunoffVolumeM3 * 2.5, 1e-14)).toBe(true);
  });
});

describe("peak time and lag definition", () => {
  // Hand-built hydrographs isolate the metric arithmetic from the model.
  const outputWithQt = (qt: number[]): GR4HOutput => ({
    qt,
    qt_mm: qt.map((q) => q / 10),
    qd: qt,
    qb: qt.map(() => 0),
    gwe: qt.map(() => 0),
    ps: qt.map(() => 0),
    rs: qt.map(() => 0),
  });
  const series = (n: number, at: Record<number, number>, base = 0) =>
    Array.from({ length: n }, (_, i) => at[i] ?? base);

  it("lag = flow peak hour - rainfall peak hour", () => {
    const m = computeStormMetrics(series(72, { 20: 8 }), outputWithQt(series(72, { 30: 5 }, 0.1)), 100);
    expect(m.rainfallPeakTimeHour).toBe(20);
    expect(m.peakDischargeTimeHour).toBe(30);
    expect(m.lagHours).toBe(10);
  });

  it("is zero when both peaks fall in the same hour", () => {
    const m = computeStormMetrics(series(24, { 5: 3 }), outputWithQt(series(24, { 5: 9 })), 10);
    expect(m.lagHours).toBe(0);
  });

  it("takes the FIRST hour on ties, for both rainfall and flow", () => {
    const m = computeStormMetrics(series(24, { 4: 2, 9: 2 }), outputWithQt(series(24, { 12: 7, 15: 7 })), 10);
    expect(m.rainfallPeakTimeHour).toBe(4);
    expect(m.peakDischargeTimeHour).toBe(12);
    expect(m.lagHours).toBe(8);
  });

  it("returns null rainfall peak and lag when there is no rain", () => {
    const m = computeStormMetrics(series(24, {}), outputWithQt(series(24, { 3: 1 })), 10);
    expect(m.rainfallPeakTimeHour).toBeNull();
    expect(m.lagHours).toBeNull();
    expect(m.runoffRatio).toBe(0);
  });

  it("lag is undefined when the discharge peak precedes rainfall onset (initial-storage drainage)", () => {
    // rain starts at hour 12; the flow maximum is at hour 0
    const m = computeStormMetrics(series(72, { 12: 1, 17: 8, 20: 1 }), outputWithQt(series(72, { 0: 9 }, 0.1)), 100);
    expect(m.rainfallOnsetHour).toBe(12);
    expect(m.peakDischargeTimeHour).toBe(0);
    expect(m.peakPrecedesRainfall).toBe(true);
    expect(m.lagHours).toBeNull();
    expect(m.peakDischargeCms).toBe(9); // the maximum itself is still reported
  });

  it("a peak in the onset hour or later is a storm response", () => {
    const m = computeStormMetrics(series(72, { 12: 1, 17: 8 }), outputWithQt(series(72, { 12: 9 }, 0.1)), 100);
    expect(m.peakPrecedesRainfall).toBe(false);
    expect(m.lagHours).toBe(12 - 17);
  });

  it("real model: large rs0 with weak rain gives a t=0 peak flagged as initial-store drainage, no lag", () => {
    const input = buildScenarioInput({ rs0: 1, rainfallMultiplier: 0.1 });
    const m = computeStormMetrics(input.precipitation, simulateGR4H(input), input.areaKm2);
    expect(m.peakDischargeTimeHour).toBe(0);
    expect(m.peakPrecedesRainfall).toBe(true);
    expect(m.lagHours).toBeNull();
  });

  it("real model: the default scenario is a storm response with onset at hour 13", () => {
    const input = buildScenarioInput();
    const m = computeStormMetrics(input.precipitation, simulateGR4H(input), input.areaKm2);
    expect(m.rainfallOnsetHour).toBe(13);
    expect(m.peakPrecedesRainfall).toBe(false);
  });

  it("for the default storm: rain peaks at hour 17, flow peaks 5 h later", () => {
    const input = buildScenarioInput();
    const m = computeStormMetrics(input.precipitation, simulateGR4H(input), input.areaKm2);
    expect(m.rainfallPeakTimeHour).toBe(17);
    expect(m.peakDischargeTimeHour).toBe(22);
    expect(m.lagHours).toBe(5);
  });

  it("peak discharge is the maximum of the m3/s series", () => {
    const input = buildScenarioInput();
    const out = simulateGR4H(input);
    const m = computeStormMetrics(input.precipitation, out, input.areaKm2);
    expect(m.peakDischargeCms).toBe(Math.max(...out.qt));
    expect(out.qt[m.peakDischargeTimeHour]).toBe(m.peakDischargeCms);
  });

  it("the x4 experiment reports the same peak/lag as a direct run at each x4", () => {
    const input = buildScenarioInput();
    for (const s of runX4SensitivityExperiment(input)) {
      const direct = simulateGR4H({ ...input, x4: s.x4 });
      const m = computeStormMetrics(input.precipitation, direct, input.areaKm2);
      expect(s.peakDischargeCms).toBe(m.peakDischargeCms);
      expect(s.peakDischargeTimeHour).toBe(m.peakDischargeTimeHour);
      expect(s.lagHours).toBe(m.lagHours);
    }
  });
});

describe("scenario state isolation", () => {
  const reference = scenarios.map(({ input }) => simulateGR4H(clone(input)));

  it("gives identical results in forward, reverse and repeated order", () => {
    const forward = scenarios.map(({ input }) => simulateGR4H(input));
    const reverse = [...scenarios].reverse().map(({ input }) => simulateGR4H(input)).reverse();
    const twice = scenarios.map(({ input }) => (simulateGR4H(input), simulateGR4H(input)));
    expect(forward).toEqual(reference);
    expect(reverse).toEqual(reference);
    expect(twice).toEqual(reference);
  });

  it("is not affected by interleaving two scenarios call by call", () => {
    const [a, b] = [scenarios[2].input, scenarios[6].input];
    const seq = [simulateGR4H(a), simulateGR4H(b), simulateGR4H(a), simulateGR4H(b)];
    expect(seq[0]).toEqual(seq[2]);
    expect(seq[1]).toEqual(seq[3]);
    expect(seq[0]).toEqual(reference[2]);
    expect(seq[1]).toEqual(reference[6]);
  });

  it("survives x4 changes between calls (unit-hydrograph buffer length changes)", () => {
    const base = buildScenarioInput();
    const fresh = (x4: number) => simulateGR4H({ ...clone(base), x4 });
    const a = fresh(10);
    const b = fresh(2.5);
    const c = fresh(5);
    expect(simulateGR4H({ ...base, x4: 10 })).toEqual(a);
    expect(simulateGR4H({ ...base, x4: 2.5 })).toEqual(b);
    expect(simulateGR4H({ ...base, x4: 5 })).toEqual(c);
    expect(c).toEqual(simulateGR4H(base));
  });

  it("does not mutate its input (runs on deep-frozen inputs)", () => {
    scenarios.forEach(({ input }, i) => {
      expect(simulateGR4H(deepFreeze(clone(input)))).toEqual(reference[i]);
    });
  });

  it("returns fresh arrays that alias neither the input nor each other", () => {
    const input = buildScenarioInput();
    const out = simulateGR4H(input);
    const arrays = [out.qt, out.qt_mm, out.qd, out.qb, out.gwe, out.ps, out.rs, input.precipitation, input.pet];
    expect(new Set(arrays).size).toBe(arrays.length);

    const expected = simulateGR4H(input);
    out.qt_mm.fill(-1);
    out.ps.fill(-1);
    expect(simulateGR4H(input)).toEqual(expected);
  });

  it("runX4SensitivityExperiment leaves the base scenario and later runs untouched", () => {
    const input = deepFreeze(buildScenarioInput());
    const before = simulateGR4H(input);
    runX4SensitivityExperiment(input);
    expect(input.x4).toBe(5);
    expect(simulateGR4H(input)).toEqual(before);
  });

  it("buildScenarioInput calls never share state", () => {
    const a = buildScenarioInput();
    const b = buildScenarioInput();
    a.precipitation.fill(99);
    a.pet.fill(99);
    expect(b).toEqual(buildScenarioInput());
    expect(simulateGR4H(b)).toEqual(reference[2]);
  });
});

describe("unit hydrograph mass conservation", () => {
  it.each([1, 1.5, 2.5, 5, 7.3, 10, 20])("x4 = %s h: ordinates are >= 0, sum to 1 and have length ceil(x4), ceil(2*x4)", (x4) => {
    const { ordinates1, ordinates2 } = buildUnitHydrograph(x4);
    expect(ordinates1).toHaveLength(Math.ceil(x4));
    expect(ordinates2).toHaveLength(Math.ceil(2 * x4));
    for (const ordinates of [ordinates1, ordinates2]) {
      expect(Math.min(...ordinates)).toBeGreaterThanOrEqual(0);
      expect(Math.abs(sum(ordinates) - 1)).toBeLessThan(1e-12);
    }
  });
});
