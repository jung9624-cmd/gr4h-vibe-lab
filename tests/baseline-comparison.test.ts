import { describe, expect, it } from "vitest";
import { simulateGR4H } from "@/lib/gr4h";
import { buildScenarioInput, type ScenarioOverrides } from "@/lib/storm";
import { compareToBaseline, computeStormMetrics, type StormMetrics } from "@/lib/metrics";

const metrics = (over: Partial<StormMetrics> = {}): StormMetrics => ({
  totalRainfallMm: 50,
  peakDischargeCms: 4,
  peakDischargeTimeHour: 22,
  rainfallPeakTimeHour: 17,
  rainfallOnsetHour: 13,
  peakPrecedesRainfall: false,
  lagHours: 5,
  totalRunoffVolumeMm: 2,
  totalRunoffVolumeM3: 100,
  runoffRatio: 0.04,
  ...over,
});

const metricsFor = (overrides: ScenarioOverrides = {}) => {
  const input = buildScenarioInput(overrides);
  return computeStormMetrics(input.precipitation, simulateGR4H(input), input.areaKm2);
};

describe("compareToBaseline — arithmetic", () => {
  it("reports no change for identical metrics", () => {
    const c = compareToBaseline(metrics(), metrics());
    expect(c.peakDischarge).toMatchObject({ delta: 0, percent: 0, direction: "none" });
    expect(c.lag).toMatchObject({ deltaHours: 0, direction: "none" });
    expect(c.runoffVolume).toMatchObject({ delta: 0, percent: 0, direction: "none" });
  });

  it("computes signed percent change relative to the baseline", () => {
    const c = compareToBaseline(metrics({ peakDischargeCms: 5, totalRunoffVolumeM3: 80 }), metrics());
    expect(c.peakDischarge.percent).toBeCloseTo(25, 12);
    expect(c.peakDischarge.direction).toBe("up");
    expect(c.runoffVolume.percent).toBeCloseTo(-20, 12);
    expect(c.runoffVolume.direction).toBe("down");
    expect(c.runoffVolume.delta).toBe(-20);
  });

  it("computes lag change in hours, signed", () => {
    expect(compareToBaseline(metrics({ lagHours: 8 }), metrics()).lag).toMatchObject({
      baselineHours: 5,
      currentHours: 8,
      deltaHours: 3,
      direction: "up",
    });
    expect(compareToBaseline(metrics({ lagHours: 2 }), metrics()).lag).toMatchObject({
      deltaHours: -3,
      direction: "down",
    });
  });

  it("treats a change that rounds to 0.0 % as no change", () => {
    const c = compareToBaseline(metrics({ peakDischargeCms: 4.0004 }), metrics()); // +0.01 %
    expect(c.peakDischarge.direction).toBe("none");
    const d = compareToBaseline(metrics({ peakDischargeCms: 4.004 }), metrics()); // +0.1 %
    expect(d.peakDischarge.direction).toBe("up");
  });

  it("leaves percent null (direction from the raw delta) when the baseline is 0", () => {
    const c = compareToBaseline(metrics({ peakDischargeCms: 2 }), metrics({ peakDischargeCms: 0 }));
    expect(c.peakDischarge.percent).toBeNull();
    expect(c.peakDischarge.direction).toBe("up");
  });

  it("leaves lag undefined when either scenario has no rainfall", () => {
    const dry = metrics({ lagHours: null, rainfallPeakTimeHour: null });
    expect(compareToBaseline(dry, metrics()).lag).toMatchObject({ deltaHours: null, direction: "none" });
    expect(compareToBaseline(metrics(), dry).lag).toMatchObject({ deltaHours: null, direction: "none" });
  });

  it("exposes physical quantities only — no better/worse verdict", () => {
    const c = compareToBaseline(metrics({ peakDischargeCms: 9 }), metrics());
    expect(Object.keys(c)).toEqual(["peakDischarge", "lag", "runoffVolume"]);
    expect(Object.keys(c.peakDischarge).sort()).toEqual(["baseline", "current", "delta", "direction", "percent"]);
    expect(Object.keys(c.lag).sort()).toEqual(["baselineHours", "currentHours", "deltaHours", "direction"]);
  });
});

describe("compareToBaseline — physical direction with the real model", () => {
  const baseline = metricsFor();

  it("the default scenario compared with itself changes nothing", () => {
    const c = compareToBaseline(metricsFor(), baseline);
    expect([c.peakDischarge.direction, c.lag.direction, c.runoffVolume.direction]).toEqual(["none", "none", "none"]);
  });

  it("longer unit-hydrograph base (x4 up): lower peak, longer lag", () => {
    const c = compareToBaseline(metricsFor({ x4: 10 }), baseline);
    expect(c.peakDischarge.direction).toBe("down");
    expect(c.lag).toMatchObject({ deltaHours: 5, direction: "up" }); // 10 h vs 5 h
  });

  it("shorter unit-hydrograph base (x4 down): higher peak, shorter lag", () => {
    const c = compareToBaseline(metricsFor({ x4: 2.5 }), baseline);
    expect(c.peakDischarge.direction).toBe("up");
    expect(c.lag).toMatchObject({ deltaHours: -3, direction: "down" });
  });

  it("more rainfall: more runoff volume and a higher peak, same lag", () => {
    const c = compareToBaseline(metricsFor({ rainfallMultiplier: 2 }), baseline);
    expect(c.runoffVolume.direction).toBe("up");
    expect(c.peakDischarge.direction).toBe("up");
    expect(c.lag.direction).toBe("none");
  });

  it("wetter initial production store (ps0 up): more runoff volume", () => {
    expect(compareToBaseline(metricsFor({ ps0: 0.8 }), baseline).runoffVolume.direction).toBe("up");
    expect(compareToBaseline(metricsFor({ ps0: 0.2 }), baseline).runoffVolume.direction).toBe("down");
  });

  it("a larger catchment area scales peak discharge and volume by the area ratio", () => {
    const c = compareToBaseline(metricsFor({ areaKm2: 250 }), baseline);
    expect(c.peakDischarge.percent).toBeCloseTo(150, 9);
    expect(c.runoffVolume.percent).toBeCloseTo(150, 9);
  });
});
