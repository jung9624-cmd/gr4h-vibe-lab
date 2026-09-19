// GR4H hourly rainfall-runoff model — TypeScript port of reference/GR4H_model.py.
//
// Do not edit reference/GR4H_model.py: it is the source of truth for the
// calculation rules this module must reproduce exactly. Line references
// below (L###) point at that file.
//
// GR4H deviates from the standard daily GR4J model in two places (see the
// reference module docstring, L27-39): the unit hydrograph S-curve exponent
// is 1.25 instead of 2.5, and the percolation coefficient is 21/4 (5.25)
// instead of 9/4 (2.25). Both are preserved below — do not "correct" them
// back to the GR4J values.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GR4HParameters {
  /** Maximum production store capacity (mm). */
  x1: number;
  /** Groundwater exchange coefficient (mm). */
  x2: number;
  /** Routing store reference capacity (mm). */
  x3: number;
  /** UH1 unit hydrograph time base (hours). */
  x4: number;
  /** Initial production store level as a fraction of x1 (ps/x1). */
  ps0: number;
  /** Initial routing store level as a fraction of x3 (rs/x3). */
  rs0: number;
}

export interface GR4HInput extends GR4HParameters {
  /** Catchment area (km^2); used only for the mm/h -> m3/s conversion. */
  areaKm2: number;
  /** Precipitation time series (mm/h). Must be the same length as pet. */
  precipitation: number[];
  /** Potential evapotranspiration time series (mm/h). */
  pet: number[];
}

export interface GR4HOutput {
  /** Total streamflow, qd + qb (m3/s). */
  qt: number[];
  /** Total streamflow, unconverted (mm/h) — mirrors the Python `qt_mm` column. */
  qt_mm: number[];
  /** Direct-flow / fast branch discharge (UH2 + groundwater exchange) (m3/s). */
  qd: number[];
  /** Baseflow: routing store outflow (m3/s). */
  qb: number[];
  /** Groundwater exchange (mm/h); positive = catchment gain, negative = loss. */
  gwe: number[];
  /** Production store level as a fraction of x1 (dimensionless, not mm). */
  ps: number[];
  /** Routing store level as a fraction of x3 (dimensionless, not mm). */
  rs: number[];
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function assertFiniteNonNegativeSeries(values: number[], name: string): void {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      throw new Error(`${name}[${i}] must be a finite number, got ${v}`);
    }
    if (v < 0) {
      throw new Error(`${name}[${i}] must be >= 0 (mm/h can't be negative), got ${v}`);
    }
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite number > 0, got ${value}`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite number >= 0, got ${value}`);
  }
}

function validateInput(input: GR4HInput): void {
  const { areaKm2, precipitation, pet, x1, x2, x3, x4, ps0, rs0 } = input;

  if (precipitation.length !== pet.length) {
    throw new Error(
      `precipitation and pet must have the same length (got ${precipitation.length} and ${pet.length})`
    );
  }
  if (precipitation.length === 0) {
    throw new Error("precipitation/pet must contain at least one timestep");
  }

  assertFiniteNonNegativeSeries(precipitation, "precipitation");
  assertFiniteNonNegativeSeries(pet, "pet");

  assertPositiveFinite(areaKm2, "areaKm2");
  assertPositiveFinite(x1, "x1");
  assertPositiveFinite(x3, "x3");
  assertPositiveFinite(x4, "x4");
  if (!Number.isFinite(x2)) {
    throw new Error(`x2 must be a finite number, got ${x2}`);
  }
  assertNonNegativeFinite(ps0, "ps0");
  assertNonNegativeFinite(rs0, "rs0");
}

// ---------------------------------------------------------------------------
// Reservoir evaporation / production
// Mirrors _reservoirs_evaporation (reference/GR4H_model.py L254-276).
// ---------------------------------------------------------------------------

export interface ReservoirEvaporationResult {
  evap: number;
  reservoirProduction: number;
  routedPattern: number;
}

export function reservoirEvaporation(
  prec: number,
  pet: number,
  productionStore: number,
  x1: number
): ReservoirEvaporationResult {
  if (prec > pet) {
    const snp = Math.min((prec - pet) / x1, 13.0);
    const tsnp = Math.tanh(snp);
    const reservoirProduction =
      (x1 * (1 - (productionStore / x1) ** 2) * tsnp) / (1 + (productionStore / x1) * tsnp);

    return {
      evap: 0,
      reservoirProduction,
      routedPattern: prec - pet - reservoirProduction,
    };
  }

  const sne = Math.min((pet - prec) / x1, 13.0);
  const tsne = Math.tanh(sne);
  const psDivX1 = (2 - productionStore / x1) * tsne;
  const evap = (productionStore * psDivX1) / (1 + (1 - productionStore / x1) * tsne);

  return { evap, reservoirProduction: 0, routedPattern: 0 };
}

// ---------------------------------------------------------------------------
// Percolation
// Mirrors the percolation line inside _gr4h (reference/GR4H_model.py L397).
// ---------------------------------------------------------------------------

export function percolation(productionStore: number, x1: number): number {
  return productionStore * (1 - (1 + (productionStore / 5.25 / x1) ** 4) ** -0.25);
}

// ---------------------------------------------------------------------------
// Unit hydrograph S-curves
// Mirrors _s_curves1 / _s_curves2 (reference/GR4H_model.py L280-300).
// ---------------------------------------------------------------------------

export function sCurve1(t: number, x4: number): number {
  if (t <= 0) return 0;
  if (t < x4) return (t / x4) ** 1.25;
  return 1;
}

export function sCurve2(t: number, x4: number): number {
  if (t <= 0) return 0;
  if (t < x4) return 0.5 * (t / x4) ** 1.25;
  if (t < 2 * x4) return 1 - 0.5 * (2 - t / x4) ** 1.25;
  return 1;
}

// ---------------------------------------------------------------------------
// Unit hydrograph generation
// Mirrors _compute_unitary_hydrograph and _compute_hydrograph
// (reference/GR4H_model.py L303-335).
//
// buildUnitHydrograph() derives the fixed UH1/UH2 ordinates from x4 once.
// advanceUnitHydrograph() performs the per-timestep convolution shift; it is
// called once per timestep for UH1 and once for UH2 (the Python
// _compute_hydrograph updates both arrays together using the same loop
// body). It returns a new array rather than mutating its input, so the
// convolution state threaded through the main loop stays local to each
// simulateGR4H() call.
// ---------------------------------------------------------------------------

export interface UnitHydrograph {
  ordinates1: number[];
  ordinates2: number[];
}

export function buildUnitHydrograph(x4: number): UnitHydrograph {
  const nuh1 = Math.ceil(x4);
  const nuh2 = Math.ceil(2 * x4);

  const ordinates1 = new Array(nuh1);
  for (let t = 1; t <= nuh1; t++) {
    ordinates1[t - 1] = sCurve1(t, x4) - sCurve1(t - 1, x4);
  }

  const ordinates2 = new Array(nuh2);
  for (let t = 1; t <= nuh2; t++) {
    ordinates2[t - 1] = sCurve2(t, x4) - sCurve2(t - 1, x4);
  }

  return { ordinates1, ordinates2 };
}

export function advanceUnitHydrograph(
  routedPattern: number,
  ordinates: number[],
  state: number[]
): number[] {
  const next = new Array(state.length);
  for (let i = 0; i < state.length - 1; i++) {
    next[i] = state[i + 1] + ordinates[i] * routedPattern;
  }
  next[state.length - 1] = ordinates[state.length - 1] * routedPattern;
  return next;
}

// ---------------------------------------------------------------------------
// Groundwater exchange
// Mirrors _compute_exchange (reference/GR4H_model.py L338-345).
// ---------------------------------------------------------------------------

export interface GroundwaterExchangeResult {
  gwExchange: number;
  routingStore: number;
}

export function groundwaterExchange(
  uh1State: number[],
  routingStore: number,
  x2: number,
  x3: number
): GroundwaterExchangeResult {
  const cr = 1; // catchment ratio; hardcoded to 1 in the reference implementation
  const gwExchange = x2 * ((1 / cr) * (routingStore / x3)) ** 3.5;
  const updatedRoutingStore = Math.max(0, routingStore + uh1State[0] * 0.9 + gwExchange);

  return { gwExchange, routingStore: updatedRoutingStore };
}

// ---------------------------------------------------------------------------
// Routing store discharge (baseflow) + direct flow
// Mirrors _compute_discharge (reference/GR4H_model.py L348-355). qd reuses
// the same gwExchange value computed by groundwaterExchange() above, exactly
// as the Python implementation does — it is not recomputed here.
// ---------------------------------------------------------------------------

export interface RoutingStoreResult {
  /** Baseflow: routing store outflow (mm/h). */
  qr: number;
  /** Direct flow: UH2 branch + groundwater exchange (mm/h). */
  qd: number;
  routingStore: number;
}

export function routingStoreDischarge(
  uh2State: number[],
  gwExchange: number,
  routingStore: number,
  x3: number
): RoutingStoreResult {
  const newRoutingStore = routingStore / (1 + (routingStore / x3) ** 4) ** 0.25;
  const qr = routingStore - newRoutingStore;
  const qd = Math.max(0, uh2State[0] * 0.1 + gwExchange);

  return { qr, qd, routingStore: newRoutingStore };
}

// ---------------------------------------------------------------------------
// Main simulation loop
// Mirrors _gr4h and the unit conversion in GR4H.run()
// (reference/GR4H_model.py L166-246, L358-416).
//
// Pure function: every piece of state (production/routing store levels, UH
// convolution buffers) is allocated fresh from the function arguments on
// each call. Nothing is read from or written to module-level state, so
// running the same scenario twice, or running two different scenarios back
// to back, never leaks state between calls.
// ---------------------------------------------------------------------------

export function simulateGR4H(input: GR4HInput): GR4HOutput {
  validateInput(input);

  const { areaKm2, precipitation, pet, x1, x2, x3, x4, ps0, rs0 } = input;
  const n = precipitation.length;

  const { ordinates1, ordinates2 } = buildUnitHydrograph(x4);
  let uh1State = new Array(ordinates1.length).fill(0);
  let uh2State = new Array(ordinates2.length).fill(0);

  let productionStore = ps0 * x1;
  let routingStore = rs0 * x3;

  const qtMmArray: number[] = new Array(n);
  const qdArray: number[] = new Array(n);
  const qbArray: number[] = new Array(n);
  const gweArray: number[] = new Array(n);
  const psArray: number[] = new Array(n);
  const rsArray: number[] = new Array(n);

  for (let t = 0; t < n; t++) {
    const { evap, reservoirProduction, routedPattern: interceptedPattern } = reservoirEvaporation(
      precipitation[t],
      pet[t],
      productionStore,
      x1
    );

    productionStore = productionStore - evap + reservoirProduction;

    const perc = percolation(productionStore, x1);
    const routedPattern = perc + interceptedPattern;
    productionStore = productionStore - perc;

    uh1State = advanceUnitHydrograph(routedPattern, ordinates1, uh1State);
    uh2State = advanceUnitHydrograph(routedPattern, ordinates2, uh2State);

    const exchange = groundwaterExchange(uh1State, routingStore, x2, x3);
    routingStore = exchange.routingStore;

    const discharge = routingStoreDischarge(uh2State, exchange.gwExchange, routingStore, x3);
    routingStore = discharge.routingStore;

    qtMmArray[t] = discharge.qr + discharge.qd;
    qdArray[t] = discharge.qd;
    qbArray[t] = discharge.qr;
    gweArray[t] = exchange.gwExchange;
    psArray[t] = productionStore / x1;
    rsArray[t] = routingStore / x3;
  }

  // mm/h -> m3/s, exactly matching reference/GR4H_model.py L235-237.
  // qt_mm intentionally stays in mm/h, mirroring the Python `qt_mm` column,
  // which is populated from the same array as `qt` but never converted.
  // Same operation order as the Python `column * self.area / 3.6`, i.e.
  // (q * area) / 3.6 — not q * (area / 3.6), which rounds differently.
  const toCms = (q: number) => (q * areaKm2) / 3.6;

  return {
    qt: qtMmArray.map(toCms),
    qt_mm: qtMmArray,
    qd: qdArray.map(toCms),
    qb: qbArray.map(toCms),
    gwe: gweArray,
    ps: psArray,
    rs: rsArray,
  };
}
