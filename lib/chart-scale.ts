// Axis scaling helpers for the hydrograph charts.

const NICE_STEPS = [1, 2, 2.5, 5, 10];

/**
 * Smallest "nice" number (1, 2, 2.5, 5 x 10^k) that is >= value. Used to give
 * the axes a scale that does not jump with every slider move, so a change in
 * peak height is actually visible against a fixed reference.
 */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  let exponent = Math.floor(Math.log10(value));
  // guard against log10 rounding at exact powers of ten
  while (10 ** exponent > value) exponent--;
  while (10 ** (exponent + 1) <= value) exponent++;
  const base = 10 ** exponent;
  for (const step of NICE_STEPS) {
    if (step * base >= value) return step * base;
  }
  return 10 * base;
}

/** Tick label without trailing zeros: 0, 2.5, 5, 1000. */
export function formatTick(value: number): string {
  return String(Number(value.toFixed(2)));
}
