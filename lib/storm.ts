// Synthetic 72h storm scenario for the GR4H demo dashboard.
//
// Produces a deterministic, hand-designed triangular hyetograph plus a flat
// PET series, and composes them with GR4H parameters into a ready-to-run
// GR4HInput. This is a teaching scenario, not observed or calibrated data.

import type { GR4HInput } from "./gr4h";

// ---------------------------------------------------------------------------
// Default scenario (as specified for the demo)
// ---------------------------------------------------------------------------

export const DEFAULT_SCENARIO = {
  totalHours: 72,
  areaKm2: 100,
  petMmPerHour: 0.1,
  stormStartHour: 12,
  stormDurationHours: 10,
  /** Peak hyetograph intensity at rainfallMultiplier = 1 (mm/h). */
  peakIntensityMmPerHour: 10,
  rainfallMultiplier: 1,
  x1: 500,
  x2: 3,
  x3: 200,
  x4: 5,
  ps0: 0.5,
  rs0: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Slider ranges for the parameter panel
//
// These are wide exploration ranges chosen so a class can see how each
// knob visibly reshapes the hydrograph. They are NOT calibrated,
// physically-validated parameter bounds for any real catchment — do not
// reuse them as such. Surface EDUCATIONAL_RANGE_DISCLAIMER next to the
// sliders in the UI.
// ---------------------------------------------------------------------------

export const EDUCATIONAL_RANGE_DISCLAIMER =
  "교육용 실험 범위이며 실제 보정 parameter bounds가 아닙니다.";

export interface ParameterRange {
  min: number;
  max: number;
  step: number;
}

export type AdjustableParameter =
  | "rainfallMultiplier"
  | "areaKm2"
  | "petMmPerHour"
  | "x1"
  | "x2"
  | "x3"
  | "x4"
  | "ps0"
  | "rs0";

export const PARAMETER_RANGES: Record<AdjustableParameter, ParameterRange> = {
  rainfallMultiplier: { min: 0, max: 3, step: 0.1 },
  areaKm2: { min: 10, max: 500, step: 10 },
  petMmPerHour: { min: 0, max: 2, step: 0.05 },
  x1: { min: 50, max: 1200, step: 10 },
  x2: { min: -5, max: 5, step: 0.5 },
  x3: { min: 20, max: 500, step: 10 },
  x4: { min: 1, max: 20, step: 0.5 },
  ps0: { min: 0, max: 1, step: 0.05 },
  rs0: { min: 0, max: 1, step: 0.05 },
};

// ---------------------------------------------------------------------------
// Hyetograph generation
// ---------------------------------------------------------------------------

export interface StormOptions {
  /** Simulation length (hours). Default 72. */
  totalHours?: number;
  /** Hour at which rainfall starts. Default 12. */
  stormStartHour?: number;
  /** Total duration of the rain event (hours). Default 10. */
  stormDurationHours?: number;
  /** Peak intensity at rainfallMultiplier = 1 (mm/h). Default 10. */
  peakIntensityMmPerHour?: number;
  /** Linear scale applied to the whole hyetograph. Default 1. */
  rainfallMultiplier?: number;
  /** Constant PET applied at every timestep (mm/h). Default 0.1. */
  petMmPerHour?: number;
}

export interface StormForcing {
  precipitation: number[];
  pet: number[];
}

/**
 * A symmetric triangular hyetograph: 0 at stormStartHour, rising linearly to
 * peakIntensityMmPerHour at the midpoint of the storm, then falling linearly
 * back to 0 at stormStartHour + stormDurationHours. Every hour outside that
 * window is 0. rainfallMultiplier scales the whole shape (and therefore the
 * total rainfall depth) linearly.
 */
export function generateSyntheticStorm(options: StormOptions = {}): StormForcing {
  const totalHours = options.totalHours ?? DEFAULT_SCENARIO.totalHours;
  const stormStartHour = options.stormStartHour ?? DEFAULT_SCENARIO.stormStartHour;
  const stormDurationHours = options.stormDurationHours ?? DEFAULT_SCENARIO.stormDurationHours;
  const peakIntensityMmPerHour =
    options.peakIntensityMmPerHour ?? DEFAULT_SCENARIO.peakIntensityMmPerHour;
  const rainfallMultiplier = options.rainfallMultiplier ?? DEFAULT_SCENARIO.rainfallMultiplier;
  const petMmPerHour = options.petMmPerHour ?? DEFAULT_SCENARIO.petMmPerHour;

  if (!Number.isFinite(totalHours) || totalHours <= 0) {
    throw new Error(`totalHours must be a finite number > 0, got ${totalHours}`);
  }
  if (!Number.isFinite(stormDurationHours) || stormDurationHours <= 0) {
    throw new Error(`stormDurationHours must be a finite number > 0, got ${stormDurationHours}`);
  }
  if (!Number.isFinite(stormStartHour) || stormStartHour < 0) {
    throw new Error(`stormStartHour must be a finite number >= 0, got ${stormStartHour}`);
  }

  const halfDuration = stormDurationHours / 2;
  const precipitation: number[] = new Array(totalHours);
  const pet: number[] = new Array(totalHours);

  for (let h = 0; h < totalHours; h++) {
    const tSinceStart = h - stormStartHour;
    let intensity = 0;
    if (tSinceStart >= 0 && tSinceStart <= stormDurationHours) {
      intensity =
        tSinceStart <= halfDuration
          ? peakIntensityMmPerHour * (tSinceStart / halfDuration)
          : peakIntensityMmPerHour * ((stormDurationHours - tSinceStart) / halfDuration);
    }

    precipitation[h] = Math.max(0, intensity * rainfallMultiplier);
    pet[h] = petMmPerHour;
  }

  return { precipitation, pet };
}

// ---------------------------------------------------------------------------
// Scenario composition
// ---------------------------------------------------------------------------

export interface ScenarioOverrides {
  rainfallMultiplier?: number;
  areaKm2?: number;
  petMmPerHour?: number;
  x1?: number;
  x2?: number;
  x3?: number;
  x4?: number;
  ps0?: number;
  rs0?: number;
}

/**
 * Builds a complete GR4HInput for the default 72h demo scenario, applying
 * any user-adjusted overrides on top of DEFAULT_SCENARIO. Pure: allocates a
 * fresh precipitation/pet series on every call.
 */
export function buildScenarioInput(overrides: ScenarioOverrides = {}): GR4HInput {
  const rainfallMultiplier = overrides.rainfallMultiplier ?? DEFAULT_SCENARIO.rainfallMultiplier;
  const petMmPerHour = overrides.petMmPerHour ?? DEFAULT_SCENARIO.petMmPerHour;
  const { precipitation, pet } = generateSyntheticStorm({ rainfallMultiplier, petMmPerHour });

  return {
    areaKm2: overrides.areaKm2 ?? DEFAULT_SCENARIO.areaKm2,
    precipitation,
    pet,
    x1: overrides.x1 ?? DEFAULT_SCENARIO.x1,
    x2: overrides.x2 ?? DEFAULT_SCENARIO.x2,
    x3: overrides.x3 ?? DEFAULT_SCENARIO.x3,
    x4: overrides.x4 ?? DEFAULT_SCENARIO.x4,
    ps0: overrides.ps0 ?? DEFAULT_SCENARIO.ps0,
    rs0: overrides.rs0 ?? DEFAULT_SCENARIO.rs0,
  };
}
