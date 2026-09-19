# GR4H Vibe Lab

Interactive teaching dashboard for the hourly GR4H rainfall–runoff model.
Move a parameter and the hydrograph, KPIs and change-vs-baseline readout update
immediately. All computation runs in the browser (no server API, no Python).

> Based on the open-source GR4H implementation by [crdykman](https://github.com/crdykman/GR4H).
> Educational demonstration. Slider ranges are teaching ranges, not calibration bounds.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (also type-checks)
npm test           # vitest
npm run lint
```

## Layout

| Path | Purpose |
|---|---|
| `lib/gr4h.ts` | Pure TypeScript port of the model (no React) |
| `lib/storm.ts` | 72 h synthetic storm, defaults, slider (teaching) ranges |
| `lib/metrics.ts` | Peak / lag / volume metrics, x4 sensitivity, baseline comparison |
| `lib/chart-scale.ts` | Stable "nice" axis limits |
| `components/` | UI (`gr4h-dashboard.tsx` is the only stateful client component) |
| `reference/GR4H_model.py` | Unmodified upstream source, kept as the numerical reference |
| `tests/` | Unit tests + numerical parity against the Python reference |

## Validation against the Python reference

`tests/fixtures/python-reference.json` is produced by running the unmodified
`reference/GR4H_model.py` (real numba) on 9 scenarios. Regenerate with
`npm run fixtures:generate` (needs Python with numpy, pandas, numba). The TS port
matches a float64 run of the original formulas to ≤ 1.3e-15 relative error and
reproduces the shipped float32 output bit-for-bit. The test suite fails if the
reference file changes without regenerating the fixture.

## Licensing note

The upstream repository has no license file. Confirm the author's permission
before making this repository or the deployed site public.
