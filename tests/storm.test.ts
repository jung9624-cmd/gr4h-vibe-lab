import { describe, it, expect } from "vitest";
import {
  generateSyntheticStorm,
  buildScenarioInput,
  DEFAULT_SCENARIO,
  PARAMETER_RANGES,
  EDUCATIONAL_RANGE_DISCLAIMER,
} from "@/lib/storm";

describe("generateSyntheticStorm — default scenario", () => {
  const storm = generateSyntheticStorm();

  it("is 72 hours long", () => {
    expect(storm.precipitation).toHaveLength(72);
    expect(storm.pet).toHaveLength(72);
  });

  it("has no rainfall before hour 12 or after hour 22 (start 12 + duration 10)", () => {
    for (let h = 0; h < 12; h++) expect(storm.precipitation[h]).toBe(0);
    for (let h = 23; h < 72; h++) expect(storm.precipitation[h]).toBe(0);
  });

  it("peaks at the midpoint of the storm (hour 17) at the configured peak intensity", () => {
    expect(storm.precipitation[17]).toBeCloseTo(DEFAULT_SCENARIO.peakIntensityMmPerHour, 10);
    for (let h = 12; h < 23; h++) {
      expect(storm.precipitation[h]).toBeLessThanOrEqual(DEFAULT_SCENARIO.peakIntensityMmPerHour);
    }
  });

  it("totals a triangular-area depth of 50mm (0.5 * 10h * 10mm/h)", () => {
    const total = storm.precipitation.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(50, 10);
  });

  it("holds PET constant at the configured value", () => {
    for (const v of storm.pet) expect(v).toBe(DEFAULT_SCENARIO.petMmPerHour);
  });
});

describe("generateSyntheticStorm — rainfallMultiplier", () => {
  it("scales the hyetograph linearly", () => {
    const base = generateSyntheticStorm({ rainfallMultiplier: 1 });
    const doubled = generateSyntheticStorm({ rainfallMultiplier: 2 });
    for (let h = 0; h < base.precipitation.length; h++) {
      expect(doubled.precipitation[h]).toBeCloseTo(base.precipitation[h] * 2, 10);
    }
  });

  it("produces an all-dry series at multiplier 0", () => {
    const dry = generateSyntheticStorm({ rainfallMultiplier: 0 });
    expect(dry.precipitation.every((v) => v === 0)).toBe(true);
  });
});

describe("generateSyntheticStorm — validation", () => {
  it("throws on non-positive totalHours", () => {
    expect(() => generateSyntheticStorm({ totalHours: 0 })).toThrow(/totalHours/);
  });

  it("throws on non-positive stormDurationHours", () => {
    expect(() => generateSyntheticStorm({ stormDurationHours: -1 })).toThrow(
      /stormDurationHours/
    );
  });

  it("throws on negative stormStartHour", () => {
    expect(() => generateSyntheticStorm({ stormStartHour: -1 })).toThrow(/stormStartHour/);
  });
});

describe("buildScenarioInput", () => {
  it("uses DEFAULT_SCENARIO values when no overrides are given", () => {
    const input = buildScenarioInput();
    expect(input.areaKm2).toBe(DEFAULT_SCENARIO.areaKm2);
    expect(input.x1).toBe(DEFAULT_SCENARIO.x1);
    expect(input.x2).toBe(DEFAULT_SCENARIO.x2);
    expect(input.x3).toBe(DEFAULT_SCENARIO.x3);
    expect(input.x4).toBe(DEFAULT_SCENARIO.x4);
    expect(input.ps0).toBe(DEFAULT_SCENARIO.ps0);
    expect(input.rs0).toBe(DEFAULT_SCENARIO.rs0);
    expect(input.precipitation).toHaveLength(DEFAULT_SCENARIO.totalHours);
  });

  it("applies overrides on top of the defaults", () => {
    const input = buildScenarioInput({ x1: 800, areaKm2: 250 });
    expect(input.x1).toBe(800);
    expect(input.areaKm2).toBe(250);
    expect(input.x3).toBe(DEFAULT_SCENARIO.x3);
  });

  it("scales total rainfall with the rainfallMultiplier override", () => {
    const doubled = buildScenarioInput({ rainfallMultiplier: 2 });
    const total = doubled.precipitation.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it("threads the petMmPerHour override into every timestep", () => {
    const input = buildScenarioInput({ petMmPerHour: 0.4 });
    expect(input.pet.every((v) => v === 0.4)).toBe(true);
  });

  it("returns an independent precipitation/pet array on every call", () => {
    const first = buildScenarioInput();
    first.precipitation[0] = 999;
    const second = buildScenarioInput();
    expect(second.precipitation[0]).toBe(0);
  });
});

describe("PARAMETER_RANGES", () => {
  const keys = [
    "rainfallMultiplier",
    "areaKm2",
    "petMmPerHour",
    "x1",
    "x2",
    "x3",
    "x4",
    "ps0",
    "rs0",
  ] as const;

  it("defines a min/max/step for every user-adjustable parameter", () => {
    for (const key of keys) {
      const range = PARAMETER_RANGES[key];
      expect(range).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
    }
  });

  it("brackets every DEFAULT_SCENARIO value within its own range", () => {
    for (const key of keys) {
      const range = PARAMETER_RANGES[key];
      const value = DEFAULT_SCENARIO[key];
      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
  });

  it("ships a non-empty educational-range disclaimer for the UI", () => {
    expect(EDUCATIONAL_RANGE_DISCLAIMER.length).toBeGreaterThan(0);
  });
});
