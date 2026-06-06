# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

---

## What this is

**Groundskeeper** is a hosted, offline-capable web app for survey-grade yard mapping —
irrigation heads, plants, and sensors — whose **primary purpose is generating a Home Assistant
dashboard** (a `picture-elements` card + a rendered, georeferenced basemap with tappable Rachio
zones and live sensor overlays).

It is a ground-up rebuild of a legacy single-file Claude artifact (`docs/legacy-yard-map.html`,
kept only as reference) into a real Vite app with pure, tested modules. It maps one residential
property; the survey geometry is real and certified, but **no street address or owner-identifying
metadata lives in this repo — keep it that way** (see Privacy below).

---

## ⚠️ Privacy (hard rule)

This repo and its GitHub Pages demo are **public**. **Never commit the property's street address**
(or city/zip/subdivision/surveyor/job-number) anywhere — README, docs, specs, code, sample data,
or commit messages. Refer to the property generically ("a residential lot", at most "Virginia").
If you find such identifiers, scrub them from the file *and* flag that history may need purging
(`git filter-repo`). This rule has already been enforced once via a history rewrite.

---

## Commands

No framework; Vite + Vitest only.

```bash
npm install
npm run dev      # dev server — use this for GPS (geolocation needs HTTPS or http://localhost)
npm test         # Vitest unit suite (CI runs this)
npm run test:watch
npm run build    # production build → dist/
npm run preview  # serve the production build
```

- **GPS only works over HTTPS or `http://localhost`** — never `file://`.
- **Supabase/`window.storage` are not present in plain local dev** — sync code must degrade
  gracefully (operate from the local cache) when they're absent.
- Run a single test file: `npx vitest run test/geometry.test.js`.

---

## Architecture & stack

| Concern | Choice |
|---|---|
| Map engine | **Leaflet** (georeferenced imagery, touch, markers) |
| Basemap | **Bundled public-domain orthophoto** (`public/basemap/`) drawn via `L.imageOverlay`; live tiles optional/online-only |
| Language | **Vanilla JS, ES modules** — pure, small, testable units; no framework |
| Build/test | **Vite + Vitest** |
| Sync + auth | **Supabase** — per-entity tables, magic-link auth, Row-Level Security |
| Offline | **IndexedDB cache + Service Worker (PWA)** — full survey works with no signal |
| Hosting | **Cloudflare Pages** (prod) · **GitHub Pages** (preview) |

The design favors **small modules with one responsibility and a clean interface**. The valuable,
hard part (survey geometry) is pure and unit-tested; UI/IO layers sit on top.

---

## Repository structure

```
groundskeeper/
├── index.html            # thin shell
├── src/
│   ├── main.js           # bootstrap / view wiring
│   ├── geometry.js       # ✅ pure survey math (corners, house, cul-de-sac arcs) — in FEET
│   ├── georef.js         # ✅ survey-feet ⇄ WGS84 lat/lon transform (with rotation θ)
│   ├── map.js            # Leaflet map + georeferenced overlays + calibration   (Plan 2)
│   ├── gps.js            # averaging, outlier rejection, confidence             (Plan 3)
│   ├── survey.js         # field survey workflow (heads/plants/sensors)         (Plan 3)
│   ├── store.js          # Supabase + IndexedDB offline sync                    (Plan 4)
│   ├── ha.js             # Home Assistant export pipeline                       (Plan 5)
│   └── ui/               # panels, pickers, HA-entity settings
├── public/basemap/       # bundled georeferenced orthophoto + bounds
├── data/                 # survey-geometry.json, plant-care.json (source data)
├── test/                 # Vitest unit tests
└── docs/
    ├── superpowers/specs/ # design spec (authoritative)
    ├── superpowers/plans/ # per-milestone implementation plans
    └── legacy-yard-map.html  # the old single-file app (reference only)
```

✅ = implemented. Others land in the milestone noted.

---

## The geometry/georef foundation (implemented — read before touching coordinates)

### `geometry.js` — pure survey math, in **feet**
- Convention: a point is `{x, y}` where **x = feet east**, **y = feet south** of NW corner **A**
  (origin). Compass **bearings are degrees clockwise from north**.
- Exports: `bearingVec(deg)`, `move(pt, deg, distFt)`, `dms(d,m,s)`, `corners()` →
  `{A,B,C,D,C1end,C2end}`, `house()` → `{NW,NE,SW,SE}`, `powerBox()`, `arcPoints(start, bearing0,
  R, deltaDeg, cw, segments)`, `frontEdgePoints(segments)`.
- Corners reproduce the certified traverse: A→B 92.00 ft, B→C 150.00 ft, A→D 133.47 ft.
- The front boundary is a reverse-S cul-de-sac: arc C1 (R=40', Δ=43.76°, CW) → arc C2 (R=50',
  Δ=9.92°, CCW) → straight tangent to C. **Arc entry tangents are derived from the certified
  chord bearings** (chordBearing = entryTangent ± Δ/2): 47.5° into C1, 91.26° into C2 — *not*
  the side-boundary bearing. Don't change these without re-deriving.
- Lot polygon assembly (for Plan 2): `[A, B, C, C2end, ...frontEdgePoints() reversed..., D]` —
  straight A→B→C, straight C→C2end, then the arc points back to D. The C2end→C segment is NOT
  arc-tangent-continuous (matches the real survey); draw it as a straight line.

### `georef.js` — survey-feet ⇄ WGS84 lat/lon
- Calibration is `{lat0, lon0, theta}` (theta in **radians**). `localToLatLon(pt, cal)` /
  `latLonToLocal(ll, cal)` are exact inverses (rotation transpose); `FT_PER_DEG_LAT = 364000`
  (feet per degree latitude; longitude is scaled by `cos(lat0)` — applied in the functions).
- **Canonical coordinates are lat/lon** (imagery-aligned, GPS-native). Feet/px are derived for
  display via `latLonToLocal`.
- The calibration `{lat0, lon0, theta}` is **solved once** by the user dragging/rotating the
  survey outline onto the orthophoto (align-by-imagery) — this calibration *solver* lives with the
  Plan 2 map UI, not in `georef.js`.

---

## Data model (target — built across Plans 3–5)

Per-entity, lat/lon canonical, each row with `updatedAt` + `deletedAt` (soft-delete tombstones
for correct offline multi-device sync):

```
calibration: { lat0, lon0, theta, method, updatedAt }
zone:   { id, name, color, haEntity, updatedAt, deletedAt }
head:   { id, lat, lon, zoneId, type, radiusFt, label, notes, gps, placedBy, confidenceFt, updatedAt, deletedAt }
plant:  { id, lat, lon, typeId, label, notes, updatedAt, deletedAt }
sensor: { id, lat, lon, kind:'soil|weather|other', label, haEntity, notes, placedBy, confidenceFt, gps, updatedAt, deletedAt }
```

Supabase tables `heads/plants/sensors/zones/settings`, each row `user_id`-scoped via RLS
(single owner, multi-device). Last-write-wins per row by `updatedAt`.

---

## Workflow & process

Work is **plan-driven** using the superpowers skills:
**brainstorm → spec → milestone plan → subagent-driven execution (TDD, two-stage review)**.

- Authoritative design: `docs/superpowers/specs/2026-06-05-groundskeeper-design.md`.
- Per-milestone plans: `docs/superpowers/plans/`.
- Roadmap: **1 Foundation ✅ · 2 Map view · 3 Survey+GPS · 4 Sync/auth/offline · 5 HA export ·
  6 Deploy.**
- Each milestone is independently shippable and must keep `npm test` + `npm run build` green.

When you finish substantive work, **update `README.md`** in the same change (roadmap statuses,
structure tree, features, commands) — it backs the public repo page and the Pages demo.

---

## Testing conventions

- Pure modules get **real** Vitest unit tests (computed values, round-trips, invariants) — not
  mocks/tautologies. See `test/geometry.test.js`, `test/georef.test.js`.
- Follow TDD: write the failing test, confirm it fails for the right reason, implement minimally,
  confirm green, commit.
- Don't loosen a tolerance to make a geometry test pass — re-derive from the survey.

---

## GitHub / CI

- **CI** (`.github/workflows/ci.yml`): `npm ci` + Vitest + Vite build on push/PR.
- **Pages** (`pages.yml`): builds with `--base=/groundskeeper/` and deploys the preview.
- **Deploy** (`deploy.yml`): Cloudflare Pages; a no-op until `CLOUDFLARE_*` / `VITE_SUPABASE_*`
  secrets exist.
- **Dependabot**: weekly; **major bumps of `vite`/`vitest` are intentionally ignored** (they're
  peer-locked and need a deliberate, tested migration — don't accept auto-PRs for them).
- `main` has branch protection (no force-push / no deletion); PRs are not required, so per-task
  commits can land directly during plan execution.

---

## Gotchas

- `geometry.js` is in **feet**; rendering/GPS go through `georef.js` to lat/lon. Don't mix units.
- The legacy app used pixels (`F = 4 px/ft`) and `window.storage`; that's reference only — the
  new app is lat/lon + Supabase/IndexedDB.
- Keep files small and single-purpose; if one grows unwieldy while you work in it, a focused split
  is reasonable (note it).
