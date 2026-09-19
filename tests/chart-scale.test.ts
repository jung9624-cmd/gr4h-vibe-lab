import { describe, expect, it } from "vitest";
import { formatTick, niceCeil } from "@/lib/chart-scale";

describe("niceCeil", () => {
  it.each([
    [4.584, 5],
    [2.61, 5],
    [2.5, 2.5],
    [1.01, 2],
    [10, 10],
    [10.0001, 20],
    [0.03, 0.05],
    [1016.2, 2000],
    [1, 1],
    [1000, 1000],
    [0.1, 0.1],
  ])("%s -> %s", (input, expected) => {
    expect(niceCeil(input)).toBeCloseTo(expected, 12);
  });

  it("is never smaller than its input and never more than 2x larger", () => {
    for (let x = 0.001; x < 5000; x *= 1.07) {
      const n = niceCeil(x);
      expect(n).toBeGreaterThanOrEqual(x);
      expect(n).toBeLessThanOrEqual(2 * x + 1e-12);
    }
  });

  it("falls back to 1 for non-positive or non-finite input", () => {
    for (const bad of [0, -3, NaN, Infinity]) expect(niceCeil(bad)).toBe(1);
  });
});

describe("formatTick", () => {
  it("drops trailing zeros", () => {
    expect(formatTick(0)).toBe("0");
    expect(formatTick(2.5)).toBe("2.5");
    expect(formatTick(5)).toBe("5");
    expect(formatTick(1000)).toBe("1000");
    expect(formatTick(0.05)).toBe("0.05");
  });
});
