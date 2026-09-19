// Robustness over the whole teaching range (PARAMETER_RANGES): every slider
// corner (2^9) plus 3000 seeded random points must give finite, physically
// admissible output. A failure here would show up in class as NaN or negative
// discharge when a student drags a slider to an extreme.

import { describe, expect, it } from "vitest";
import { simulateGR4H } from "@/lib/gr4h";
import { PARAMETER_RANGES, buildScenarioInput, type AdjustableParameter, type ScenarioOverrides } from "@/lib/storm";
import { computeStormMetrics, runX4SensitivityExperiment } from "@/lib/metrics";

const KEYS = Object.keys(PARAMETER_RANGES) as AdjustableParameter[];

function* corners(): Generator<ScenarioOverrides> {
  for (let mask = 0; mask < 1 << KEYS.length; mask++) {
    yield Object.fromEntries(
      KEYS.map((k, i) => [k, mask & (1 << i) ? PARAMETER_RANGES[k].max : PARAMETER_RANGES[k].min])
    ) as ScenarioOverrides;
  }
}

function* randoms(count: number): Generator<ScenarioOverrides> {
  let s = 123456789; // xorshift32, deterministic
  const next = () => ((s ^= s << 13), (s ^= s >>> 17), (s ^= s << 5), (s >>> 0) / 2 ** 32);
  for (let n = 0; n < count; n++) {
    yield Object.fromEntries(
      KEYS.map((k) => {
        const { min, max, step } = PARAMETER_RANGES[k];
        return [k, min + Math.round((next() * (max - min)) / step) * step];
      })
    ) as ScenarioOverrides;
  }
}

function check(overrides: ScenarioOverrides) {
  const input = buildScenarioInput(overrides);
  const out = simulateGR4H(input);
  for (const key of ["qt", "qt_mm", "qd", "qb", "gwe", "ps", "rs"] as const) {
    for (const v of out[key]) if (!Number.isFinite(v)) return `${key} not finite for ${JSON.stringify(overrides)}`;
  }
  for (const key of ["qt", "qt_mm", "qd", "qb", "rs"] as const) {
    for (const v of out[key]) if (v < 0) return `${key} negative (${v}) for ${JSON.stringify(overrides)}`;
  }
  const ps0 = overrides.ps0 ?? 0;
  for (const v of out.ps) if (v < 0 || v > Math.max(1, ps0) + 1e-9) return `ps ${v} outside [0, 1] for ${JSON.stringify(overrides)}`;
  const m = computeStormMetrics(input.precipitation, out, input.areaKm2);
  if (!Number.isFinite(m.peakDischargeCms) || !Number.isFinite(m.runoffRatio)) return `metrics not finite for ${JSON.stringify(overrides)}`;
  for (const s of runX4SensitivityExperiment(input)) {
    if (!Number.isFinite(s.peakDischargeCms)) return `x4 experiment not finite for ${JSON.stringify(overrides)}`;
  }
  return null;
}

describe("slider-range robustness", () => {
  it("all 512 slider corners are finite and physically admissible", () => {
    const failures = [...corners()].map(check).filter(Boolean);
    expect(failures).toEqual([]);
  });

  it("3000 seeded random slider combinations are finite and physically admissible", () => {
    const failures = [...randoms(3000)].map(check).filter(Boolean);
    expect(failures.slice(0, 5)).toEqual([]);
  });
});
