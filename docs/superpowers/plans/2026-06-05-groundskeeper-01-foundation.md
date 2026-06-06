# Groundskeeper — Plan 1: Foundation (Scaffold + Geometry + Georeference)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `groundskeeper` repo (Vite + Vitest) and implement the two pure, fully-unit-tested foundation modules — survey `geometry.js` (feet) and `georef.js` (survey-feet ↔ WGS84 lat/lon) — that every later milestone builds on.

**Architecture:** A static Vite app. All survey math is extracted from the legacy `yard-map.html` into pure ES modules that take inputs and return values (no DOM, no globals), so they can be unit-tested with Vitest. `geometry.js` computes lot corners, house footprint, the Power-Box marker, and tessellated cul-de-sac arcs in **feet** relative to NW corner A. `georef.js` converts those feet to lat/lon (and back) given a calibration `{lat0, lon0, theta}`.

**Tech Stack:** Node.js + npm, Vite (dev/build), Vitest (tests), vanilla ES modules. No framework.

**Series:** This is Plan 1 of 6 (see `docs/superpowers/specs/2026-06-05-groundskeeper-design.md` §roadmap). It produces a buildable repo and two tested modules; no UI yet.

**Source of truth for the math:** legacy `yard-map.html` lines ~309–335 (the `bv`/`mv`/corner/house/POWBOX block) and spec §3.1. The legacy code works in pixels (`ft(v)=v*4`); this milestone re-expresses everything in **feet** (no scale factor) because feet is now the survey-space unit and `georef.js` handles the jump to lat/lon.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | npm scripts (`dev`, `build`, `test`), deps (vite, vitest) |
| `vite.config.js` | Vite config (root, build output) |
| `index.html` | thin shell (placeholder this milestone) |
| `src/main.js` | bootstrap (sanity import this milestone) |
| `src/geometry.js` | pure survey math in feet: bearing→vector, move, corners, house, power box, arc tessellation |
| `src/georef.js` | pure transform: `localToLatLon` / `latLonToLocal` given `{lat0, lon0, theta}` |
| `test/geometry.test.js` | verifies computed geometry reproduces certified survey distances/bearings |
| `test/georef.test.js` | verifies round-trips and known-point mapping |
| `data/` | `survey-geometry.json`, `plant-care.json` (copied from legacy repo) |
| `docs/superpowers/` | spec + this plan (copied from legacy repo) |

---

## Task 1: Scaffold the repo

**Files:**
- Create: `/Users/pk/code/groundskeeper/package.json`
- Create: `/Users/pk/code/groundskeeper/vite.config.js`
- Create: `/Users/pk/code/groundskeeper/.gitignore`
- Create: `/Users/pk/code/groundskeeper/index.html`
- Create: `/Users/pk/code/groundskeeper/src/main.js`

- [ ] **Step 1: Create the project directory and copy carry-over assets from the legacy repo**

```bash
mkdir -p /Users/pk/code/groundskeeper/src /Users/pk/code/groundskeeper/test /Users/pk/code/groundskeeper/public/basemap
cp -R /Users/pk/code/yard-map/data /Users/pk/code/groundskeeper/data
mkdir -p /Users/pk/code/groundskeeper/docs
cp -R /Users/pk/code/yard-map/docs/superpowers /Users/pk/code/groundskeeper/docs/superpowers
cp /Users/pk/code/yard-map/docs/survey_lot25-105.jpg /Users/pk/code/groundskeeper/docs/ 2>/dev/null || true
# keep the legacy app around as reference
cp /Users/pk/code/yard-map/src/yard-map.html /Users/pk/code/groundskeeper/docs/legacy-yard-map.html
cp /Users/pk/code/yard-map/CLAUDE.md /Users/pk/code/groundskeeper/CLAUDE.md
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "groundskeeper",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `vite.config.js`**

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
});
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.local
.env
.env.*
```

- [ ] **Step 5: Write a placeholder `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Groundskeeper</title>
</head>
<body>
  <div id="app">Groundskeeper — foundation build</div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: Write a sanity `src/main.js`**

```javascript
import { corners } from './geometry.js';
import { localToLatLon } from './georef.js';

// Foundation sanity check — proves the modules load and compute.
const c = corners();
console.log('Lot corners (ft):', c);
console.log('geometry + georef modules loaded', typeof localToLatLon === 'function');
```

- [ ] **Step 7: Install dependencies**

Run: `cd /Users/pk/code/groundskeeper && npm install`
Expected: `node_modules/` created, no errors. (`src/main.js` will not run yet — modules arrive in Tasks 2–7; that's fine, nothing imports `main.js` during tests.)

- [ ] **Step 8: Initialize git, connect the remote, first commit**

```bash
cd /Users/pk/code/groundskeeper
git init
git add -A
git commit -m "chore: scaffold groundskeeper (vite + vitest), carry over data/docs"
git branch -M main
git remote add origin https://github.com/louisalexander/groundskeeper.git
```

(Do not push yet — push happens after the first tests pass in Task 7, Step 5.)

---

## Task 2: `geometry.js` — bearing→vector and move (in feet)

**Files:**
- Create: `/Users/pk/code/groundskeeper/src/geometry.js`
- Test: `/Users/pk/code/groundskeeper/test/geometry.test.js`

Survey convention: a point is `{x, y}` where `x` = feet **east** of NW corner A, `y` = feet **south** of A. Compass bearings are degrees clockwise from north.

- [ ] **Step 1: Write the failing test**

```javascript
// test/geometry.test.js
import { describe, it, expect } from 'vitest';
import { bearingVec, move } from '../src/geometry.js';

const close = (a, b, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('bearingVec', () => {
  it('points east (+x) for a 90° bearing', () => {
    const v = bearingVec(90);
    close(v.x, 1); close(v.y, 0);
  });
  it('points south (+y, SVG/down) for a 180° bearing', () => {
    const v = bearingVec(180);
    close(v.x, 0); close(v.y, 1);
  });
  it('points north (−y) for a 0° bearing', () => {
    const v = bearingVec(0);
    close(v.x, 0); close(v.y, -1);
  });
});

describe('move', () => {
  it('moves a point east by the given feet for bearing 90°', () => {
    const p = move({ x: 0, y: 0 }, 90, 10);
    close(p.x, 10); close(p.y, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: FAIL — `bearingVec`/`move` not exported (module has no such export).

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/geometry.js

// Compass bearing (deg clockwise from north) → unit vector in survey space
// where +x = east, +y = south (y-down, matching the legacy SVG convention).
export function bearingVec(deg) {
  const r = ((90 - deg) * Math.PI) / 180; // compass → math angle
  return { x: Math.cos(r), y: -Math.sin(r) }; // negate y for y-down
}

// Move `distFt` feet from `pt` along compass bearing `deg`. Units: feet.
export function move(pt, deg, distFt) {
  const v = bearingVec(deg);
  return { x: pt.x + v.x * distFt, y: pt.y + v.y * distFt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: PASS (all `bearingVec` and `move` tests green).

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/geometry.js test/geometry.test.js
git commit -m "feat(geometry): bearingVec + move in feet"
```

---

## Task 3: `geometry.js` — lot corners reproduce certified survey

**Files:**
- Modify: `/Users/pk/code/groundskeeper/src/geometry.js`
- Test: `/Users/pk/code/groundskeeper/test/geometry.test.js`

Certified values (spec §"Lot Corners", README): A→B 92.00' @ traverse 47.5°; B→C 150.00' @ 137.5°; A→D 133.47' @ 137.5°.

- [ ] **Step 1: Write the failing test**

```javascript
// append to test/geometry.test.js
import { corners } from '../src/geometry.js';

const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

describe('corners', () => {
  const c = corners();

  it('places origin A at {0,0}', () => {
    close(c.A.x, 0); close(c.A.y, 0);
  });
  it('reproduces the rear line A→B = 92.00 ft', () => {
    close(dist(c.A, c.B), 92.0, 1e-3);
  });
  it('reproduces the right line B→C = 150.00 ft', () => {
    close(dist(c.B, c.C), 150.0, 1e-3);
  });
  it('reproduces the left line A→D = 133.47 ft', () => {
    close(dist(c.A, c.D), 133.47, 1e-3);
  });
  it('B is east and slightly south of A (bearing 47.5° → +x, +y small)', () => {
    expect(c.B.x).toBeGreaterThan(0);
    expect(c.B.y).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: FAIL — `corners` not exported.

- [ ] **Step 3: Write minimal implementation**

```javascript
// append to src/geometry.js

// Decimal degrees for a DMS bearing, e.g. dms(69,22,51) → 69.380833…
export function dms(d, m = 0, s = 0) {
  return d + m / 60 + s / 3600;
}

// Lot corners in feet relative to NW corner A (origin). Derived from the
// certified survey traverse bearings/distances (see spec §3 + README).
export function corners() {
  const A = { x: 0, y: 0 };
  const B = move(A, 47.5, 92.0);     // rear line A→B
  const C = move(B, 137.5, 150.0);   // right line B→C
  const D = move(A, 137.5, 133.47);  // left line A→D
  // Front cul-de-sac arc endpoints (used for the curved boundary, Task 5).
  const C1end = move(D, dms(69, 22, 51), 29.81);
  const C2end = move(C1end, dms(86, 18), 8.65);
  return { A, B, C, D, C1end, C2end };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/geometry.js test/geometry.test.js
git commit -m "feat(geometry): lot corners from certified survey traverse"
```

---

## Task 4: `geometry.js` — house footprint + Power-Box marker

**Files:**
- Modify: `/Users/pk/code/groundskeeper/src/geometry.js`
- Test: `/Users/pk/code/groundskeeper/test/geometry.test.js`

Certified offsets (legacy lines 327–333, spec §"House Footprint"): house NW = from A move 22.70' @137.5° then 22.67' @47.5°; width 56.89' @47.5°; depth 59.85' @137.5°. Power Box = from A 126' @137.5°.

- [ ] **Step 1: Write the failing test**

```javascript
// append to test/geometry.test.js
import { house, powerBox } from '../src/geometry.js';

describe('house', () => {
  const h = house();
  it('has width ≈ 56.89 ft (NW→NE)', () => {
    close(dist(h.NW, h.NE), 56.89, 1e-3);
  });
  it('has depth ≈ 59.85 ft (NW→SW)', () => {
    close(dist(h.NW, h.SW), 59.85, 1e-3);
  });
  it('is a parallelogram (NE→SE depth equals NW→SW depth)', () => {
    close(dist(h.NE, h.SE), dist(h.NW, h.SW), 1e-6);
  });
});

describe('powerBox', () => {
  it('lies 126 ft from A along the 137.5° left boundary', () => {
    const A = { x: 0, y: 0 };
    close(dist(A, powerBox()), 126.0, 1e-3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: FAIL — `house`/`powerBox` not exported.

- [ ] **Step 3: Write minimal implementation**

```javascript
// append to src/geometry.js

// House footprint corners in feet (parallelogram aligned to the lot bearings).
export function house() {
  const A = { x: 0, y: 0 };
  const NW = move(move(A, 137.5, 22.7), 47.5, 22.67); // rear setback then left offset
  const NE = move(NW, 47.5, 56.89);  // width
  const SW = move(NW, 137.5, 59.85); // depth
  const SE = move(NE, 137.5, 59.85);
  return { NW, NE, SW, SE };
}

// Power Box survey marker (the GPS anchor reference) in feet.
export function powerBox() {
  return move({ x: 0, y: 0 }, 137.5, 126);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/geometry.js test/geometry.test.js
git commit -m "feat(geometry): house footprint + power-box marker"
```

---

## Task 5: `geometry.js` — cul-de-sac arc tessellation

**Files:**
- Modify: `/Users/pk/code/groundskeeper/src/geometry.js`
- Test: `/Users/pk/code/groundskeeper/test/geometry.test.js`

The front boundary D→C is a reverse-S: C1 arc (R=40', Δ=43.76°, CW) then C2 arc (R=50', Δ=9.92°, CCW) then a straight tangent to C (spec §"Front Boundary"). For rendering as a polyline we need the curve sampled into a list of `{x,y}` feet points. This function returns the **front-edge points from D to C1end to C2end** (the straight tangent C2end→C is just a line the caller draws). We tessellate each arc into N segments.

The arc center is offset perpendicular to the start bearing by R on the turn side. For an arc starting at `start`, initial travel bearing `bearing0`, radius `R`, sweep `deltaDeg`, with `cw` direction: the center is 90° to the right of travel for CW, 90° to the left for CCW.

**Deriving the entry tangents (do not guess these):** the survey gives each arc as a *chord* (bearing + length), not a tangent. For an arc, `chordBearing = entryTangent ± Δ/2`. From `corners()`: chord D→C1end is 69.38°, Δ=43.76° (CW) ⟹ entry tangent = 69.38 − 43.76/2 = **47.5°**; chord C1end→C2end is 86.3°, Δ=9.92° (CCW) ⟹ entry tangent = 86.3 + 9.92/2 = **91.26°**. Tangent continuity checks out: C1 exit = 47.5 + 43.76 = 91.26° = C2 entry. Use these constants; the chord length of each arc (2·R·sin(Δ/2)) reproduces the survey 29.81'/8.65' to ~0.01 ft, which is why the endpoint test tolerance is 0.1 ft, not 1e-3.

- [ ] **Step 1: Write the failing test**

```javascript
// append to test/geometry.test.js
import { arcPoints, frontEdgePoints } from '../src/geometry.js';

describe('arcPoints', () => {
  it('returns segments+1 points, starting at the start point', () => {
    const start = { x: 0, y: 0 };
    const pts = arcPoints(start, 90, 40, 43.76, true, 8);
    expect(pts.length).toBe(9);
    close(pts[0].x, 0, 1e-9); close(pts[0].y, 0, 1e-9);
  });
  it('keeps every sampled point at radius R from the computed center', () => {
    const start = { x: 0, y: 0 };
    const R = 40;
    const pts = arcPoints(start, 90, R, 43.76, true, 16);
    // center is 90° right of travel (south of an east-bound start) → {0, R}
    const center = { x: 0, y: R };
    for (const p of pts) close(Math.hypot(p.x - center.x, p.y - center.y), R, 1e-6);
  });
});

describe('frontEdgePoints', () => {
  it('starts at D and ends at ≈ C2end (within survey rounding)', () => {
    const { D, C2end } = corners();
    const pts = frontEdgePoints();
    close(pts[0].x, D.x, 1e-6); close(pts[0].y, D.y, 1e-6);
    const last = pts[pts.length - 1];
    // chord(2R·sin(Δ/2)) vs survey-rounded chord differ ~0.01 ft per arc
    close(last.x, C2end.x, 0.1); close(last.y, C2end.y, 0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: FAIL — `arcPoints`/`frontEdgePoints` not exported.

- [ ] **Step 3: Write minimal implementation**

```javascript
// append to src/geometry.js

// Sample an arc into `segments`+1 points (feet).
//  start      : {x,y} arc start
//  bearing0   : initial travel bearing (deg) at start
//  R          : radius (ft)
//  deltaDeg   : swept angle (deg, positive magnitude)
//  cw         : true = clockwise travel, false = counter-clockwise
//  segments   : number of straight chords to approximate the arc
export function arcPoints(start, bearing0, R, deltaDeg, cw, segments = 24) {
  // Center is perpendicular to travel: 90° right (CW) or 90° left (CCW).
  const toCenterBearing = bearing0 + (cw ? 90 : -90);
  const center = move(start, toCenterBearing, R);
  // Angle (math convention) from center to start.
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  // y-down space: CW travel = increasing math angle; CCW = decreasing.
  const sign = cw ? 1 : -1;
  const total = (deltaDeg * Math.PI) / 180;
  const out = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + sign * total * (i / segments);
    out.push({ x: center.x + R * Math.cos(a), y: center.y + R * Math.sin(a) });
  }
  return out;
}

// The curved front edge sampled from D through the C1 and C2 arcs.
// Entry tangent at D is 47.5° (derived from chord 69.38° − Δ/2; see plan notes),
// NOT the 137.5° left-boundary bearing — the boundary turns onto the cul-de-sac at D.
export function frontEdgePoints(segments = 24) {
  const { D } = corners();
  const c1 = arcPoints(D, 47.5, 40, 43.76, true, segments);    // CW, entry tangent 47.5°
  const bearingAfterC1 = 47.5 + 43.76;                         // = 91.26°, C1 exit = C2 entry
  const c2 = arcPoints(c1[c1.length - 1], bearingAfterC1, 50, 9.92, false, segments); // CCW
  return [...c1, ...c2.slice(1)]; // drop duplicate join point
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/geometry.test.js`
Expected: PASS. If `frontEdgePoints` last-point assertion fails, the arc direction/bearing constants are off — re-derive from spec §"Front Boundary" (do **not** loosen the tolerance to mask it).

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/geometry.js test/geometry.test.js
git commit -m "feat(geometry): cul-de-sac arc tessellation (front edge)"
```

---

## Task 6: `georef.js` — local feet ↔ lat/lon transform

**Files:**
- Create: `/Users/pk/code/groundskeeper/src/georef.js`
- Test: `/Users/pk/code/groundskeeper/test/georef.test.js`

Implements spec §3.1. A calibration is `{ lat0, lon0, theta }` (theta in radians; rotation of survey-grid north relative to true north). `FT_PER_DEG_LAT = 364000` per spec (a local flat-earth constant; must be identical in both directions so round-trips are exact).

- [ ] **Step 1: Write the failing test**

```javascript
// test/georef.test.js
import { describe, it, expect } from 'vitest';
import { localToLatLon, latLonToLocal } from '../src/georef.js';

const close = (a, b, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);
const CAL = { lat0: 37.6500000, lon0: -77.5500000, theta: 0 };

describe('localToLatLon', () => {
  it('maps the origin to (lat0, lon0)', () => {
    const p = localToLatLon({ x: 0, y: 0 }, CAL);
    close(p.lat, CAL.lat0); close(p.lon, CAL.lon0);
  });
  it('100 ft north of origin raises latitude by 100/364000 deg', () => {
    // 100 ft north = y (south) of −100
    const p = localToLatLon({ x: 0, y: -100 }, CAL);
    close(p.lat, CAL.lat0 + 100 / 364000, 1e-9);
    close(p.lon, CAL.lon0, 1e-9);
  });
  it('100 ft east of origin raises longitude (scaled by cos lat)', () => {
    const p = localToLatLon({ x: 100, y: 0 }, CAL);
    const expected = CAL.lon0 + 100 / (364000 * Math.cos((CAL.lat0 * Math.PI) / 180));
    close(p.lon, expected, 1e-9);
    close(p.lat, CAL.lat0, 1e-9);
  });
});

describe('round-trip', () => {
  it('latLonToLocal(localToLatLon(p)) === p for theta=0', () => {
    const p = { x: 42.5, y: -88.25 };
    const ll = localToLatLon(p, CAL);
    const back = latLonToLocal(ll, CAL);
    close(back.x, p.x, 1e-6); close(back.y, p.y, 1e-6);
  });
  it('round-trips with a nonzero rotation theta', () => {
    const cal = { lat0: 37.65, lon0: -77.55, theta: 0.05 };
    const p = { x: 30, y: -120 };
    const back = latLonToLocal(localToLatLon(p, cal), cal);
    close(back.x, p.x, 1e-6); close(back.y, p.y, 1e-6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/georef.test.js`
Expected: FAIL — `src/georef.js` does not exist / exports missing.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/georef.js
// Survey-feet ↔ WGS84 lat/lon transform (spec §3.1).
// Local point: {x = ft east of A, y = ft south of A}. Calibration: {lat0, lon0, theta(rad)}.

export const FT_PER_DEG_LAT = 364000; // local flat-earth constant; identical both directions

// {x,y} feet → {lat, lon}
export function localToLatLon(pt, cal) {
  const { lat0, lon0, theta } = cal;
  const northFt = -pt.y;
  const e = pt.x * Math.cos(theta) - northFt * Math.sin(theta);
  const n = pt.x * Math.sin(theta) + northFt * Math.cos(theta);
  const lat = lat0 + n / FT_PER_DEG_LAT;
  const lon = lon0 + e / (FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180));
  return { lat, lon };
}

// {lat, lon} → {x,y} feet (inverse of localToLatLon)
export function latLonToLocal(ll, cal) {
  const { lat0, lon0, theta } = cal;
  const n = (ll.lat - lat0) * FT_PER_DEG_LAT;
  const e = (ll.lon - lon0) * FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  // invert rotation
  const x = e * Math.cos(theta) + n * Math.sin(theta);
  const northFt = -e * Math.sin(theta) + n * Math.cos(theta);
  return { x, y: -northFt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/georef.test.js`
Expected: PASS (origin, north, east, and both round-trip cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/georef.js test/georef.test.js
git commit -m "feat(georef): survey-feet <-> lat/lon transform with rotation"
```

---

## Task 7: Full test + build green, push to remote

**Files:** none (verification + push).

- [ ] **Step 1: Run the entire test suite**

Run: `cd /Users/pk/code/groundskeeper && npm test`
Expected: PASS — all `geometry.test.js` and `georef.test.js` cases green, 0 failures.

- [ ] **Step 2: Verify the production build succeeds**

Run: `cd /Users/pk/code/groundskeeper && npm run build`
Expected: Vite writes `dist/` with no errors. (The placeholder `index.html` builds; `main.js` resolves its imports now that both modules exist.)

- [ ] **Step 3: Sanity-run the dev entry (optional manual check)**

Run: `cd /Users/pk/code/groundskeeper && node src/main.js`
Expected: prints lot corners (feet) and `geometry + georef modules loaded true`. (Confirms the modules cooperate; no DOM needed.)

- [ ] **Step 4: Commit any build config tweaks (if Step 2 required changes)**

```bash
cd /Users/pk/code/groundskeeper
git add -A
git commit -m "chore: ensure production build is green" || echo "nothing to commit"
```

- [ ] **Step 5: Push the foundation to GitHub**

```bash
cd /Users/pk/code/groundskeeper
git push -u origin main
```
Expected: branch `main` published to `github.com/louisalexander/groundskeeper`.

---

## Done criteria
- [ ] `npm test` passes (geometry reproduces certified survey distances/bearings; georef round-trips, incl. rotation).
- [ ] `npm run build` produces `dist/` cleanly.
- [ ] Repo pushed to `github.com/louisalexander/groundskeeper` with focused commits per task.
- [ ] `geometry.js` exports: `bearingVec`, `move`, `dms`, `corners`, `house`, `powerBox`, `arcPoints`, `frontEdgePoints`.
- [ ] `georef.js` exports: `FT_PER_DEG_LAT`, `localToLatLon`, `latLonToLocal`.

## Handoff to Plan 2 (Map view)
Plan 2 consumes `corners()`, `house()`, `frontEdgePoints()`, and `localToLatLon()` to draw the georeferenced outline/house on Leaflet over the bundled orthophoto, and adds the **calibration solver** (`{lat0, lon0, theta}` from the user's align-by-imagery drag/rotate) — deliberately deferred to live with the calibration UI.
