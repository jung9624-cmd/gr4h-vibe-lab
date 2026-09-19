// Summary metrics derived from a GR4H simulation, plus the x4 (unit
// hydrograph time base) sensitivity experiment.

import { simulateGR4H, type GR4HInput, type GR4HOutput } from "./gr4h";

// ---------------------------------------------------------------------------
// Storm / hydrograph metrics
// ---------------------------------------------------------------------------

export interface StormMetrics {
  /** Sum of the precipitation series (mm). */
  totalRainfallMm: number;
  /** Maximum of qt (m3/s). */
  peakDischargeCms: number;
  /** Hour index (0-based, same resolution as the input series) of the qt peak. */
  peakDischargeTimeHour: number;
  /** Hour index of the precipitation peak, or null if total rainfall is 0. */
  rainfallPeakTimeHour: number | null;
  /** First hour with rainfall > 0, or null if total rainfall is 0. */
  rainfallOnsetHour: number | null;
  /**
   * True when the discharge maximum occurs before rainfall begins, i.e. it is
   * the recession of the initial storage state (rs0/ps0), not a storm response.
   */
  peakPrecedesRainfall: boolean;
  /**
   * peakDischargeTimeHour - rainfallPeakTimeHour. null when there is no rainfall,
   * or when peakPrecedesRainfall (a lag to a peak the storm did not cause is
   * not meaningful).
   */
  lagHours: number | null;
  /** Sum of qt_mm — total runoff depth equivalent over the catchment (mm). */
  totalRunoffVolumeMm: number;
  /** Total runoff volume converted to m3 via areaKm2. */
  totalRunoffVolumeM3: number;
  /** totalRunoffVolumeMm / totalRainfallMm (0 when there is no rainfall). */
  runoffRatio: number;
}

function argmax(values: number[]): number {
  let bestIndex = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > bestValue) {
      bestValue = values[i];
      bestIndex = i;
    }
  }
  return bestIndex;
}

function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Computes the demo dashboard's summary metrics for one simulation.
 * Pure: reads its arguments only, allocates a fresh result object.
 */
export function computeStormMetrics(
  precipitation: number[],
  output: GR4HOutput,
  areaKm2: number
): StormMetrics {
  if (precipitation.length !== output.qt.length) {
    throw new Error(
      `precipitation and output series must have the same length (got ${precipitation.length} and ${output.qt.length})`
    );
  }
  if (precipitation.length === 0) {
    throw new Error("precipitation/output must contain at least one timestep");
  }

  const totalRainfallMm = sum(precipitation);
  const hasRainfall = totalRainfallMm > 0;

  const peakDischargeTimeHour = argmax(output.qt);
  const peakDischargeCms = output.qt[peakDischargeTimeHour];

  const rainfallPeakTimeHour = hasRainfall ? argmax(precipitation) : null;
  const rainfallOnsetHour = hasRainfall ? precipitation.findIndex((v) => v > 0) : null;
  const peakPrecedesRainfall = rainfallOnsetHour !== null && peakDischargeTimeHour < rainfallOnsetHour;
  const lagHours =
    rainfallPeakTimeHour === null || peakPrecedesRainfall
      ? null
      : peakDischargeTimeHour - rainfallPeakTimeHour;

  const totalRunoffVolumeMm = sum(output.qt_mm);
  // mm equivalent depth -> m3: (mm / 1000) * (areaKm2 * 1e6 m2/km2)
  const totalRunoffVolumeM3 = (totalRunoffVolumeMm / 1000) * (areaKm2 * 1_000_000);
  const runoffRatio = hasRainfall ? totalRunoffVolumeMm / totalRainfallMm : 0;

  return {
    totalRainfallMm,
    peakDischargeCms,
    peakDischargeTimeHour,
    rainfallPeakTimeHour,
    rainfallOnsetHour,
    peakPrecedesRainfall,
    lagHours,
    totalRunoffVolumeMm,
    totalRunoffVolumeM3,
    runoffRatio,
  };
}

// ---------------------------------------------------------------------------
// x4 sensitivity experiment
//
// Runs the same scenario at x4/2, x4, and 2*x4 (every other parameter held
// fixed) and compares peak discharge and rainfall->flow lag across the
// three runs. Each run goes through simulateGR4H() independently — since
// that function is pure and allocates fresh state per call (see
// lib/gr4h.ts), the three scenarios below cannot leak state into each
// other.
// ---------------------------------------------------------------------------

export interface X4SensitivityScenario {
  label: "x4/2" | "x4" | "2x4";
  x4: number;
  peakDischargeCms: number;
  peakDischargeTimeHour: number;
  lagHours: number | null;
  /** Full total-discharge series of this scenario (m3/s). */
  qt: number[];
}

const X4_SENSITIVITY_FACTORS: Array<{ label: X4SensitivityScenario["label"]; factor: number }> = [
  { label: "x4/2", factor: 0.5 },
  { label: "x4", factor: 1 },
  { label: "2x4", factor: 2 },
];

/**
 * Runs simulateGR4H three times, sweeping x4 relative to baseInput.x4
 * (x4/2, x4, 2*x4), and returns the peak discharge / lag comparison for
 * each. baseInput itself is never mutated.
 */
export function runX4SensitivityExperiment(baseInput: GR4HInput): X4SensitivityScenario[] {
  return X4_SENSITIVITY_FACTORS.map(({ label, factor }) => {
    const x4 = baseInput.x4 * factor;
    const scenarioInput: GR4HInput = { ...baseInput, x4 };
    const output = simulateGR4H(scenarioInput);
    const metrics = computeStormMetrics(
      scenarioInput.precipitation,
      output,
      scenarioInput.areaKm2
    );

    return {
      label,
      x4,
      peakDischargeCms: metrics.peakDischargeCms,
      peakDischargeTimeHour: metrics.peakDischargeTimeHour,
      lagHours: metrics.lagHours,
      qt: output.qt,
    };
  });
}

// ---------------------------------------------------------------------------
// Change relative to a baseline scenario
//
// Reports only the physical difference between two simulations. It never
// classifies a change as better or worse — that depends on the question
// being asked, not on the model.
// ---------------------------------------------------------------------------

/** Decimals shown for percentage changes; "no change" is decided after rounding to this. */
export const PERCENT_DISPLAY_DECIMALS = 1;

export type ChangeDirection = "up" | "down" | "none";

export interface QuantityChange {
  baseline: number;
  current: number;
  /** current - baseline, in the quantity's own unit. */
  delta: number;
  /** 100 * delta / |baseline|; null when the baseline is 0. */
  percent: number | null;
  direction: ChangeDirection;
}

export interface LagChange {
  baselineHours: number | null;
  currentHours: number | null;
  /** currentHours - baselineHours; null if either lag is undefined (no rainfall). */
  deltaHours: number | null;
  direction: ChangeDirection;
}

export interface BaselineComparison {
  peakDischarge: QuantityChange;
  lag: LagChange;
  runoffVolume: QuantityChange;
}

function directionOfSign(value: number): ChangeDirection {
  return value > 0 ? "up" : value < 0 ? "down" : "none";
}

function quantityChange(baseline: number, current: number): QuantityChange {
  const delta = current - baseline;
  const percent = baseline === 0 ? null : (delta / Math.abs(baseline)) * 100;
  const scale = 10 ** PERCENT_DISPLAY_DECIMALS;
  // Direction follows what is displayed: +0.04 % rounds to 0.0 and reads as "no change".
  const displayed = percent === null ? delta : Math.round(percent * scale) / scale;
  return { baseline, current, delta, percent, direction: directionOfSign(displayed) };
}

/** Peak discharge, peak lag and runoff volume (m3) of `current` relative to `baseline`. */
export function compareToBaseline(current: StormMetrics, baseline: StormMetrics): BaselineComparison {
  const lagDelta =
    current.lagHours === null || baseline.lagHours === null ? null : current.lagHours - baseline.lagHours;

  return {
    peakDischarge: quantityChange(baseline.peakDischargeCms, current.peakDischargeCms),
    lag: {
      baselineHours: baseline.lagHours,
      currentHours: current.lagHours,
      deltaHours: lagDelta,
      direction: lagDelta === null ? "none" : directionOfSign(lagDelta),
    },
    runoffVolume: quantityChange(baseline.totalRunoffVolumeM3, current.totalRunoffVolumeM3),
  };
}
