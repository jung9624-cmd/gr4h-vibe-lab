"""Generate JSON fixtures by running the UNMODIFIED reference/GR4H_model.py.

Usage (from the project root):
    python tests/fixtures/generate_python_fixtures.py

Two runs per scenario, both executing the reference source:
  asShipped - the file exactly as committed. Its internal output arrays are
              float32 (np.zeros(..., dtype=np.float32)), and GR4H.run() then
              converts qt/qd/qb to m3/s in float32 as well.
  float64   - the same source text with ONLY "dtype=np.float32" replaced by
              "dtype=np.float64" (asserted to hit exactly the 6 output
              arrays), loaded from memory. reference/GR4H_model.py itself is
              never written to. This isolates the float32 storage rounding so
              the TypeScript port (float64) can be checked against a
              double-precision run of the original formulas instead of a
              loosened tolerance.
"""

import hashlib
import importlib.util
import json
import platform
import sys
import types
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REFERENCE = HERE.parent.parent / "reference" / "GR4H_model.py"
OUT = HERE / "python-reference.json"

try:
    import numba  # noqa: F401

    NUMBA = f"numba {numba.__version__}"
except ImportError:  # pure-Python fallback: @jit becomes a no-op
    sys.path.insert(0, str(HERE / "numba_stub"))
    NUMBA = "numba stub (no-op @jit)"


def load_as_shipped():
    spec = importlib.util.spec_from_file_location("gr4h_ref_asshipped", REFERENCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_float64():
    source = REFERENCE.read_text(encoding="utf-8")
    needle = "dtype=np.float32"
    assert source.count(needle) == 6, "expected exactly the 6 output arrays"
    module = types.ModuleType("gr4h_ref_float64")
    module.__file__ = str(REFERENCE)
    exec(compile(source.replace(needle, "dtype=np.float64"), str(REFERENCE), "exec"), module.__dict__)
    return module


def run_model(module, scenario):
    inp = scenario["input"]
    params = {k: inp[k] for k in ("x1", "x2", "x3", "x4", "ps0", "rs0")}
    model = module.GR4H(area=inp["areaKm2"], params=params)
    forcings = pd.DataFrame({"prec": inp["precipitation"], "pet": inp["pet"]})
    out = model.run(forcings, save_state=False)
    return {k: out[k].astype(float).tolist() for k in ("qt_mm", "qt", "qd", "qb", "gwe", "ps", "rs")}


def argmax_first(values):
    return int(np.argmax(values))  # first occurrence on ties, like the TS port


def derived_metrics(inp, f64, asshipped):
    prec = np.asarray(inp["precipitation"], dtype=float)
    total_rain = float(prec.sum())
    peak = argmax_first(f64["qt"])
    rain_peak = argmax_first(prec) if total_rain > 0 else None
    onset = int(np.argmax(prec > 0)) if total_rain > 0 else None
    precedes = onset is not None and peak < onset
    total_runoff_mm = float(np.sum(f64["qt_mm"]))
    return {
        "totalRainfallMm": total_rain,
        "peakTimeHour": peak,
        "peakTimeHourAsShipped": argmax_first(asshipped["qt"]),
        "rainfallPeakTimeHour": rain_peak,
        "rainfallOnsetHour": onset,
        "peakPrecedesRainfall": precedes,
        # lag is undefined when there is no rainfall, or when the discharge peak
        # precedes rainfall onset (initial-storage drainage, not a storm response)
        "lagHours": None if rain_peak is None or precedes else peak - rain_peak,
        "totalRunoffVolumeMm": total_runoff_mm,
        "totalRunoffVolumeM3": total_runoff_mm / 1000.0 * (inp["areaKm2"] * 1_000_000.0),
        "runoffRatio": (total_runoff_mm / total_rain) if total_rain > 0 else 0.0,
    }


HOURS = 72
DEFAULTS = dict(areaKm2=100.0, x1=500.0, x2=3.0, x3=200.0, x4=5.0, ps0=0.5, rs0=0.1)


def synthetic_storm():
    """Triangular 10 h storm starting at hour 12, peak 10 mm/h (lib/storm.ts)."""
    start, duration, peak = 12, 10, 10.0
    half = duration / 2
    prec = []
    for h in range(HOURS):
        t = h - start
        if 0 <= t <= duration:
            prec.append(peak * (t / half) if t <= half else peak * ((duration - t) / half))
        else:
            prec.append(0.0)
    return prec


def scenario(sid, description, prec, pet=None, **overrides):
    inp = {**DEFAULTS, **overrides}
    inp["precipitation"] = [float(v) for v in prec]
    inp["pet"] = [0.1] * HOURS if pet is None else [float(v) for v in pet]
    return {"id": sid, "description": description, "input": inp}


def build_scenarios():
    storm = synthetic_storm()
    pulse = [0.0] * HOURS
    pulse[12] = 20.0
    clamp_prec = [0.0] * HOURS
    clamp_prec[12] = 100.0
    clamp_pet = [0.1] * HOURS
    clamp_pet[40] = 100.0
    return [
        scenario("no-rain-72h", "72 h without rainfall, PET 0.1 mm/h", [0.0] * HOURS),
        scenario("single-pulse", "one 20 mm/h pulse at hour 12", pulse),
        scenario("default-storm", "default synthetic storm (lib/storm.ts)", storm),
        scenario("x4-2.5h", "default storm, x4 = 2.5 h", storm, x4=2.5),
        scenario("x4-10h", "default storm, x4 = 10 h", storm, x4=10.0),
        scenario("ps0-0.2", "default storm, ps0 = 0.2", storm, ps0=0.2),
        scenario("ps0-0.8", "default storm, ps0 = 0.8", storm, ps0=0.8),
        scenario("area-250km2", "extra: default storm, area 250 km2 (mm/h -> m3/s)", storm, areaKm2=250.0),
        scenario(
            "tanh-clamp",
            "extra: x1 = 1 mm with 100 mm/h rain and a 100 mm/h PET hour, hitting the min(.., 13) clamp in both branches",
            clamp_prec,
            pet=clamp_pet,
            x1=1.0,
        ),
    ]


def main():
    as_shipped = load_as_shipped()
    float64 = load_float64()
    scenarios = build_scenarios()
    for s in scenarios:
        s["asShipped"] = run_model(as_shipped, s)
        s["float64"] = run_model(float64, s)
        s["derived"] = derived_metrics(s["input"], s["float64"], s["asShipped"])

    payload = {
        "meta": {
            "referenceSha256": hashlib.sha256(REFERENCE.read_bytes()).hexdigest(),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "numba": NUMBA,
        },
        "scenarios": scenarios,
    }
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"wrote {OUT.relative_to(HERE.parent.parent)}: {len(scenarios)} scenarios, {NUMBA}")


if __name__ == "__main__":
    main()
