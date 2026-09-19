import { describe, it, expect } from "vitest";
import { simulateGR4H, type GR4HInput } from "@/lib/gr4h";

// Inputs below are only used for structural, purity and validation checks.
// Numerical parity with the Python reference lives in python-parity.test.ts.
const referenceInput: GR4HInput = {
  areaKm2: 100.0,
  precipitation: [0, 0, 5, 15, 25, 15, 5, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pet: new Array(24).fill(0.1),
  x1: 500.0,
  x2: 3.0,
  x3: 200.0,
  x4: 5.0,
  ps0: 1.0,
  rs0: 0.5,
};

describe("simulateGR4H — structural invariants", () => {
  it("returns arrays the same length as the input series", () => {
    const result = simulateGR4H(referenceInput);
    for (const key of ["qt", "qt_mm", "qd", "qb", "gwe", "ps", "rs"] as const) {
      expect(result[key]).toHaveLength(referenceInput.precipitation.length);
    }
  });

  it("qt equals qd + qb at every timestep (same mm/h->m3/s scale factor)", () => {
    const result = simulateGR4H(referenceInput);
    for (let i = 0; i < result.qt.length; i++) {
      expect(result.qt[i]).toBeCloseTo(result.qd[i] + result.qb[i], 6);
    }
  });

  it("every output value is finite", () => {
    const result = simulateGR4H(referenceInput);
    for (const key of ["qt", "qt_mm", "qd", "qb", "gwe", "ps", "rs"] as const) {
      for (const v of result[key]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("simulateGR4H — purity / no shared state across calls", () => {
  it("produces identical output on repeated calls with the same input", () => {
    const first = simulateGR4H(referenceInput);
    const second = simulateGR4H(referenceInput);
    expect(second).toEqual(first);
  });

  it("does not mutate the input arrays", () => {
    const prec = [...referenceInput.precipitation];
    const pet = [...referenceInput.pet];
    simulateGR4H({ ...referenceInput, precipitation: prec, pet });
    expect(prec).toEqual(referenceInput.precipitation);
    expect(pet).toEqual(referenceInput.pet);
  });

  it("a later run with different forcing does not leak state into an earlier scenario", () => {
    const dry: GR4HInput = { ...referenceInput, precipitation: new Array(24).fill(0) };
    const before = simulateGR4H(referenceInput);
    simulateGR4H(dry);
    const after = simulateGR4H(referenceInput);
    expect(after).toEqual(before);
  });
});

describe("simulateGR4H — input validation", () => {
  it("throws when precipitation and pet lengths differ", () => {
    expect(() =>
      simulateGR4H({ ...referenceInput, pet: referenceInput.pet.slice(0, -1) })
    ).toThrow(/same length/);
  });

  it("throws on empty series", () => {
    expect(() => simulateGR4H({ ...referenceInput, precipitation: [], pet: [] })).toThrow();
  });

  it("throws on NaN in precipitation", () => {
    const prec = [...referenceInput.precipitation];
    prec[3] = NaN;
    expect(() => simulateGR4H({ ...referenceInput, precipitation: prec })).toThrow(/finite/);
  });

  it("throws on negative pet", () => {
    const pet = [...referenceInput.pet];
    pet[0] = -1;
    expect(() => simulateGR4H({ ...referenceInput, pet })).toThrow(/>= 0/);
  });

  it("throws on non-positive areaKm2", () => {
    expect(() => simulateGR4H({ ...referenceInput, areaKm2: 0 })).toThrow(/areaKm2/);
  });

  it("throws on non-positive x1/x3/x4", () => {
    expect(() => simulateGR4H({ ...referenceInput, x1: 0 })).toThrow(/x1/);
    expect(() => simulateGR4H({ ...referenceInput, x3: -10 })).toThrow(/x3/);
    expect(() => simulateGR4H({ ...referenceInput, x4: 0 })).toThrow(/x4/);
  });

  it("throws on negative ps0/rs0", () => {
    expect(() => simulateGR4H({ ...referenceInput, ps0: -0.1 })).toThrow(/ps0/);
    expect(() => simulateGR4H({ ...referenceInput, rs0: -0.1 })).toThrow(/rs0/);
  });
});
