// Numerical parity between lib/gr4h.ts and the unmodified reference/GR4H_model.py.
//
// Fixtures come from tests/fixtures/generate_python_fixtures.py, which runs the
// reference file twice per scenario:
//   float64   - identical formulas, output arrays widened float32 -> float64.
//               The TS port must match this to floating-point round-off.
//   asShipped - the file exactly as committed (float32 output storage, and
//               float32 arithmetic in the mm/h -> m3/s conversion).
//               Compared bit-for-bit after reproducing that float32 rounding.
// No comparison uses a tolerance chosen to make a mismatch disappear.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { simulateGR4H, type GR4HInput } from "@/lib/gr4h";
import { buildScenarioInput } from "@/lib/storm";
import { computeStormMetrics } from "@/lib/metrics";
import rawFixture from "./fixtures/python-reference.json";

type Series = Record<"qt_mm" | "qt" | "qd" | "qb" | "gwe" | "ps" | "rs", number[]>;

interface Scenario {
  id: string;
  description: string;
  input: GR4HInput;
  asShipped: Series;
  float64: Series;
  derived: {
    totalRainfallMm: number;
    peakTimeHour: number;
    peakTimeHourAsShipped: number;
    rainfallPeakTimeHour: number | null;
    rainfallOnsetHour: number | null;
    peakPrecedesRainfall: boolean;
    lagHours: number | null;
    totalRunoffVolumeMm: number;
    totalRunoffVolumeM3: number;
    runoffRatio: number;
  };
}

const fixture = rawFixture as unknown as {
  meta: { referenceSha256: string; python: string; numpy: string; pandas: string; numba: string };
  scenarios: Scenario[];
};

const SERIES_KEYS = ["qt_mm", "qt", "qd", "qb", "gwe", "ps", "rs"] as const;
const f32 = Math.fround;

// Same expression and rounding as pandas on float32 columns:
//   (column * self.area) / 3.6   ->   f32(f32(q * f32(area)) / f32(3.6))
const pandasFloat32ToCms = (qMm: number, areaKm2: number) =>
  f32(f32(f32(qMm) * f32(areaKm2)) / f32(3.6));

// Against the float64 run the only legitimate difference is the last few ulps
// from different pow/tanh implementations (V8 fdlibm vs. the platform libm),
// carried through the recursion. Measured worst case over all 9 scenarios x 7
// series is 1.3e-15; 1e-13 leaves ~100x headroom and is still 10 orders of
// magnitude tighter than an engineering tolerance. The absolute floor only
// matters for values that are exactly 0 in the reference.
const REL_TOL = 1e-13;
const ABS_FLOOR = 1e-15;

function expectCloseToFloat64(actual: number[], expected: number[], label: string) {
  expect(actual, `${label}: length`).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    const allowed = REL_TOL * Math.abs(expected[i]) + ABS_FLOOR;
    if (diff > allowed) {
      expect.fail(
        `${label}[${i}]: TS ${actual[i]} vs Python float64 ${expected[i]} ` +
          `(|diff| ${diff.toExponential(3)} > allowed ${allowed.toExponential(3)})`
      );
    }
  }
}

function expectBitExact(actual: number[], expected: number[], label: string) {
  expect(actual, `${label}: length`).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      expect.fail(`${label}[${i}]: TS ${actual[i]} !== Python ${expected[i]}`);
    }
  }
}

describe("fixture provenance", () => {
  it("was generated from the current, unmodified reference/GR4H_model.py", () => {
    const source = readFileSync(path.resolve(__dirname, "../reference/GR4H_model.py"));
    expect(createHash("sha256").update(source).digest("hex")).toBe(fixture.meta.referenceSha256);
  });

  it("covers the seven requested scenarios plus two extras", () => {
    expect(fixture.scenarios.map((s) => s.id)).toEqual([
      "no-rain-72h",
      "single-pulse",
      "default-storm",
      "x4-2.5h",
      "x4-10h",
      "ps0-0.2",
      "ps0-0.8",
      "area-250km2",
      "tanh-clamp",
    ]);
  });

  it("was produced by real numba, not the no-op stub", () => {
    expect(fixture.meta.numba).toMatch(/^numba \d/);
  });
});

describe("TS inputs reproduce the fixture inputs (storm generator vs Python)", () => {
  const byId = (id: string) => fixture.scenarios.find((s) => s.id === id)!.input;

  it.each([
    ["no-rain-72h", { rainfallMultiplier: 0 }],
    ["default-storm", {}],
    ["x4-2.5h", { x4: 2.5 }],
    ["x4-10h", { x4: 10 }],
    ["ps0-0.2", { ps0: 0.2 }],
    ["ps0-0.8", { ps0: 0.8 }],
    ["area-250km2", { areaKm2: 250 }],
  ] as const)("%s", (id, overrides) => {
    expect(buildScenarioInput(overrides)).toEqual(byId(id));
  });
});

describe.each(fixture.scenarios)("$id — $description", (scenario) => {
  const output = simulateGR4H(scenario.input);

  describe("vs Python float64 (same formulas, same precision)", () => {
    it.each(SERIES_KEYS)("%s", (key) => {
      expectCloseToFloat64(output[key], scenario.float64[key], key);
    });
  });

  describe("vs Python as shipped (float32 storage), bit-for-bit", () => {
    it.each(["qt_mm", "gwe", "ps", "rs"] as const)("%s: fround(TS) === Python", (key) => {
      expectBitExact(output[key].map(f32), scenario.asShipped[key], key);
    });

    it("qt: float32 mm/h -> m3/s conversion reproduced", () => {
      const expected = output.qt_mm.map((q) => pandasFloat32ToCms(q, scenario.input.areaKm2));
      expectBitExact(expected, scenario.asShipped.qt, "qt");
    });

    it.each(["qd", "qb"] as const)("%s: float32 mm/h -> m3/s conversion reproduced", (key) => {
      // qd/qb are not exposed in mm/h, so recover the mm/h value from the m3/s result.
      const recovered = output[key].map((q) => (q * 3.6) / scenario.input.areaKm2);
      const expected = recovered.map((q) => pandasFloat32ToCms(q, scenario.input.areaKm2));
      expectBitExact(expected, scenario.asShipped[key], key);
    });
  });

  describe("derived metrics vs Python", () => {
    const metrics = computeStormMetrics(scenario.input.precipitation, output, scenario.input.areaKm2);
    const ref = scenario.derived;

    it("peak time", () => {
      expect(metrics.peakDischargeTimeHour).toBe(ref.peakTimeHour);
      // float32 rounding must not have moved the peak in the shipped Python either
      expect(ref.peakTimeHourAsShipped).toBe(ref.peakTimeHour);
    });

    it("rainfall peak time and lag", () => {
      expect(metrics.rainfallPeakTimeHour).toBe(ref.rainfallPeakTimeHour);
      expect(metrics.rainfallOnsetHour).toBe(ref.rainfallOnsetHour);
      expect(metrics.peakPrecedesRainfall).toBe(ref.peakPrecedesRainfall);
      expect(metrics.lagHours).toBe(ref.lagHours);
    });

    it("total rainfall, runoff volume (mm and m3) and runoff ratio", () => {
      expect(metrics.totalRainfallMm).toBe(ref.totalRainfallMm);
      for (const [actual, expected, name] of [
        [metrics.totalRunoffVolumeMm, ref.totalRunoffVolumeMm, "totalRunoffVolumeMm"],
        [metrics.totalRunoffVolumeM3, ref.totalRunoffVolumeM3, "totalRunoffVolumeM3"],
        [metrics.runoffRatio, ref.runoffRatio, "runoffRatio"],
      ] as const) {
        expect(Math.abs(actual - expected), name).toBeLessThanOrEqual(REL_TOL * Math.abs(expected) + ABS_FLOOR);
      }
    });
  });
});

