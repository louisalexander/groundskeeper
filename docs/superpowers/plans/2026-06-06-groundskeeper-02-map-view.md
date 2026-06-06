# Groundskeeper — Plan 2: Map View (Leaflet + georeferenced overlay + calibration + drag-correct)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the survey-accurate lot outline + house on a real Leaflet map over aerial imagery, let the user calibrate it to the imagery once (align-by-imagery → solve `{lat0, lon0, theta}`), and place/move heads & plants as draggable lat/lon markers — the first *visual* milestone, deployable to GitHub Pages.

**Architecture:** Build on Plan 1's pure modules. A new pure `calibrate.js` solves the georeference from two placed corner correspondences (TDD). A `map.js` module owns all Leaflet/DOM: base imagery layer, georeferenced outline/house polygons (via `geometry.js` + `georef.js`), a two-click calibration flow, and draggable item markers. Persistence this milestone is **localStorage only** (a tiny `devstore.js`); Supabase replaces it in Plan 4. No network basemap dependency for the math — the basemap layer is pluggable.

**Tech Stack:** Leaflet 1.9, Vite, Vitest, vanilla ES modules.

**Series:** Plan 2 of 6 (see `docs/superpowers/specs/2026-06-05-groundskeeper-design.md`). Consumes Plan 1's `corners()`, `house()`, `frontEdgePoints()`, `localToLatLon()`. Produces a calibratable, interactive map. Survey/GPS placement is Plan 3; cloud sync is Plan 4.

**Note on imagery:** the spec's *bundled public-domain orthophoto* is sourced in a later/parallel task (spec §9). For this milestone the base layer is **Esri World Imagery tiles (online, no key)** so development isn't blocked; `map.js` exposes a single `setBaseLayer()` seam so the bundled `L.imageOverlay` orthophoto drops in later without touching anything else. True offline is Plan 4.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | add `leaflet` dependency |
| `src/calibrate.js` | **pure** — solve `{lat0, lon0, theta}` from two corner↔latlon correspondences |
| `test/calibrate.test.js` | unit tests (round-trip against `georef.js`) |
| `src/devstore.js` | tiny localStorage get/set for calibration + items (Plan 4 swaps for Supabase) |
| `src/map.js` | Leaflet map: base layer, outline/house polygons, calibration flow, item markers, drag-correct |
| `src/main.js` | bootstrap: build map, load dev data, wire calibration button |
| `index.html` | map container + Leaflet CSS + controls |
| `data/dev-items.json` | a few sample heads/plants (lat/lon-less; placed via local feet for dev) for visual testing |

---

## Task 1: Add Leaflet and a map shell

**Files:**
- Modify: `package.json`
- Modify: `index.html`
- Create: `src/map.js` (stub)
- Modify: `src/main.js`

- [ ] **Step 1: Install Leaflet**

Run: `cd /Users/pk/code/groundskeeper && npm install leaflet@^1.9.4`
Expected: `leaflet` added to `dependencies` in `package.json`, lockfile updated, no errors.

- [ ] **Step 2: Replace `index.html` with a map shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>Groundskeeper</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
    #map { position: absolute; inset: 0; }
    #toolbar {
      position: absolute; z-index: 1000; top: 10px; left: 50px;
      display: flex; gap: 6px; background: #fff; padding: 6px 8px;
      border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.3); font-size: 13px;
    }
    #toolbar button { cursor: pointer; }
    #hint { color: #555; align-self: center; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="toolbar">
    <button id="calibrate-btn">Calibrate</button>
    <span id="hint"></span>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `src/map.js` stub that initializes Leaflet with a base imagery layer**

```javascript
// src/map.js
import L from 'leaflet';

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics';

// Default view when uncalibrated: roughly central Virginia, zoomed out.
const DEFAULT_CENTER = [37.6, -77.5];
const DEFAULT_ZOOM = 18;

let map = null;
let baseLayer = null;

export function initMap(elementId = 'map') {
  map = L.map(elementId, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  setBaseLayer(L.tileLayer(ESRI_IMAGERY, { maxZoom: 22, maxNativeZoom: 19, attribution: ESRI_ATTR }));
  return map;
}

// Single seam for swapping in the bundled orthophoto (L.imageOverlay) later.
export function setBaseLayer(layer) {
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = layer.addTo(map);
  return baseLayer;
}

export function getMap() {
  return map;
}
```

- [ ] **Step 4: Replace `src/main.js` to boot the map**

```javascript
// src/main.js
import { initMap } from './map.js';

initMap('map');
console.log('Groundskeeper map initialized');
```

- [ ] **Step 5: Verify it builds and renders**

Run: `cd /Users/pk/code/groundskeeper && npm run build`
Expected: build succeeds, no unresolved imports.
Manual: `npm run dev`, open the local URL — an Esri satellite map fills the screen with a "Calibrate" toolbar. (Tests unchanged; geometry/georef suites still pass: `npm test`.)

- [ ] **Step 6: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add package.json package-lock.json index.html src/map.js src/main.js
git commit -m "feat(map): Leaflet map shell with Esri imagery base layer"
```

---

## Task 2: `calibrate.js` — solve the georeference from two corner correspondences (pure, TDD)

**Files:**
- Create: `src/calibrate.js`
- Test: `test/calibrate.test.js`

The user pins two known lot corners onto the imagery; this solves the `{lat0, lon0, theta}` that
`georef.js` consumes. Math: rotation `θ` from the angle between the source feet-vector A→B and the
target geo-feet vector A→B; then `lat0/lon0` so the origin maps exactly to corner A's lat/lon. Must
be consistent with `georef.js` (same `FT_PER_DEG_LAT`, same `cos(lat0)` longitude scaling).

- [ ] **Step 1: Write the failing test**

```javascript
// test/calibrate.test.js
import { describe, it, expect } from 'vitest';
import { solveCalibration } from '../src/calibrate.js';
import { localToLatLon } from '../src/georef.js';
import { corners } from '../src/geometry.js';

const close = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('solveCalibration', () => {
  const { A, B, C } = corners();

  it('recovers a known calibration from two corner correspondences (A & B)', () => {
    const cal0 = { lat0: 37.65, lon0: -77.55, theta: 0.03 };
    const llA = localToLatLon(A, cal0);
    const llB = localToLatLon(B, cal0);
    const got = solveCalibration(A, llA, B, llB);
    close(got.lat0, cal0.lat0, 1e-9);
    close(got.lon0, cal0.lon0, 1e-9);
    close(got.theta, cal0.theta, 1e-6);
  });

  it('recovers a known calibration using the long diagonal (A & C)', () => {
    const cal0 = { lat0: 37.7, lon0: -77.6, theta: -0.12 };
    const llA = localToLatLon(A, cal0);
    const llC = localToLatLon(C, cal0);
    const got = solveCalibration(A, llA, C, llC);
    close(got.lat0, cal0.lat0, 1e-9);
    close(got.lon0, cal0.lon0, 1e-9);
    close(got.theta, cal0.theta, 1e-6);
  });

  it('places the calibrated origin exactly at corner A’s lat/lon', () => {
    const cal0 = { lat0: 37.65, lon0: -77.55, theta: 0.2 };
    const llA = localToLatLon(A, cal0);
    const llB = localToLatLon(B, cal0);
    const got = solveCalibration(A, llA, B, llB);
    const originBack = localToLatLon(A, got);
    close(originBack.lat, llA.lat, 1e-9);
    close(originBack.lon, llA.lon, 1e-9);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/calibrate.test.js`
Expected: FAIL — `src/calibrate.js` missing.

- [ ] **Step 3: Implement**

```javascript
// src/calibrate.js
// Solve a georeference calibration {lat0, lon0, theta} from two correspondences:
// two local survey points (feet, {x,y}) and where the user placed them on the map (lat/lon).
// Consistent with georef.js (same FT_PER_DEG_LAT and cos(lat0) longitude scaling).
import { FT_PER_DEG_LAT } from './georef.js';

const rad = (d) => (d * Math.PI) / 180;
const norm = (t) => Math.atan2(Math.sin(t), Math.cos(t)); // wrap to (-pi, pi]

export function solveCalibration(localA, llA, localB, llB) {
  // source feet-vector A->B in (east, north): east = x, north = -y
  const sdx = localB.x - localA.x;
  const sdn = -localB.y - -localA.y;
  // target geo-feet vector A->B (longitude scaled at llA's latitude)
  const cosLat = Math.cos(rad(llA.lat));
  const tdx = (llB.lon - llA.lon) * FT_PER_DEG_LAT * cosLat;
  const tdn = (llB.lat - llA.lat) * FT_PER_DEG_LAT;
  // rotation that maps the source vector onto the target vector
  const theta = norm(Math.atan2(tdn, tdx) - Math.atan2(sdn, sdx));
  // choose lat0/lon0 so localToLatLon(localA) === llA exactly
  const sAx = localA.x;
  const sAn = -localA.y;
  const ePrimeA = sAx * Math.cos(theta) - sAn * Math.sin(theta);
  const nPrimeA = sAx * Math.sin(theta) + sAn * Math.cos(theta);
  const lat0 = llA.lat - nPrimeA / FT_PER_DEG_LAT;
  const lon0 = llA.lon - ePrimeA / (FT_PER_DEG_LAT * cosLat);
  return { lat0, lon0, theta };
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/calibrate.test.js`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/calibrate.js test/calibrate.test.js
git commit -m "feat(calibrate): solve {lat0,lon0,theta} from two corner correspondences"
```

---

## Task 3: `devstore.js` — localStorage persistence (interim)

**Files:**
- Create: `src/devstore.js`
- Test: `test/devstore.test.js`

A minimal typed wrapper over `localStorage`, swapped for Supabase in Plan 4. Pure-ish: guard for
absent `localStorage` (returns defaults) so it doesn't throw in Node tests.

- [ ] **Step 1: Write the failing test**

```javascript
// test/devstore.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadState, saveState, DEFAULT_STATE } from '../src/devstore.js';

// jsdom-free fake localStorage
beforeEach(() => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
});

describe('devstore', () => {
  it('returns DEFAULT_STATE when nothing is stored', () => {
    expect(loadState()).toEqual(DEFAULT_STATE);
  });
  it('round-trips saved state', () => {
    const s = { calibration: { lat0: 1, lon0: 2, theta: 0.1 }, heads: [{ id: 1 }], plants: [] };
    saveState(s);
    expect(loadState()).toEqual(s);
  });
  it('survives corrupt JSON by returning defaults', () => {
    localStorage.setItem('groundskeeper-dev-v1', '{not json');
    expect(loadState()).toEqual(DEFAULT_STATE);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/devstore.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```javascript
// src/devstore.js
// Interim localStorage persistence for the map milestone. Plan 4 replaces this with Supabase.
const KEY = 'groundskeeper-dev-v1';

export const DEFAULT_STATE = { calibration: null, heads: [], plants: [] };

export function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredCloneSafe(DEFAULT_STATE), ...parsed };
  } catch {
    return structuredCloneSafe(DEFAULT_STATE);
  }
}

export function saveState(state) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore (private mode / no storage) */
  }
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}
```

Note: the round-trip test stores exactly `{calibration, heads, plants}`, which equals the merged
shape, so `toEqual` holds.

- [ ] **Step 4: Run, confirm PASS**

Run: `cd /Users/pk/code/groundskeeper && npx vitest run test/devstore.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/devstore.js test/devstore.test.js
git commit -m "feat(devstore): interim localStorage persistence (calibration + items)"
```

---

## Task 4: Render the georeferenced lot outline + house

**Files:**
- Modify: `src/map.js`
- Modify: `src/main.js`

Draws the survey outline and house as Leaflet polygons given a calibration. Pure geometry comes
from Plan 1; this task is DOM/Leaflet, verified manually (no unit test — visual correctness).

- [ ] **Step 1: Add outline/house rendering to `src/map.js`**

Append:

```javascript
import { corners, house, frontEdgePoints } from './geometry.js';
import { localToLatLon } from './georef.js';

let overlayGroup = null;

// Build the full lot ring in lat/lon: A -> B -> C -> (straight to C2end) -> arcs back to D -> close.
function lotRingLatLng(cal) {
  const { A, B, C, C2end, D } = corners();
  const front = frontEdgePoints(); // D -> ... -> C2end (in feet)
  const ringFeet = [A, B, C, C2end, ...front.slice().reverse()]; // ...C2end..back to D
  // front.reverse() starts at C2end and ends at D, so the ring closes naturally at D.
  return ringFeet.map((p) => {
    const ll = localToLatLon(p, cal);
    return [ll.lat, ll.lon];
  });
}

function houseRingLatLng(cal) {
  const h = house();
  return [h.NW, h.NE, h.SE, h.SW].map((p) => {
    const ll = localToLatLon(p, cal);
    return [ll.lat, ll.lon];
  });
}

export function renderOverlay(cal) {
  if (!cal) return;
  if (overlayGroup) overlayGroup.remove();
  overlayGroup = L.layerGroup().addTo(map);
  L.polygon(lotRingLatLng(cal), { color: '#3ecf8e', weight: 2, fill: false }).addTo(overlayGroup);
  L.polygon(houseRingLatLng(cal), { color: '#5b8dee', weight: 2, fillOpacity: 0.1 }).addTo(overlayGroup);
  map.fitBounds(L.polygon(lotRingLatLng(cal)).getBounds(), { padding: [40, 40] });
  return overlayGroup;
}
```

- [ ] **Step 2: Render a dev calibration on load (temporary) to verify geometry**

In `src/main.js`, temporarily render with a hardcoded dev calibration to eyeball the outline shape
(this is replaced by the real calibration flow in Task 5):

```javascript
// src/main.js
import { initMap, renderOverlay } from './map.js';

initMap('map');

// TEMP dev calibration to verify outline geometry; removed once Task 5 calibration flow lands.
const DEV_CAL = { lat0: 37.6, lon0: -77.5, theta: 0 };
renderOverlay(DEV_CAL);
```

- [ ] **Step 3: Verify visually**

Run: `cd /Users/pk/code/groundskeeper && npm run dev`
Manual checks (this is the acceptance test):
- A green lot outline appears with the **reverse-S cul-de-sac curve** on the front edge (smooth, not a straight line), and the three straight sides.
- A blue house parallelogram sits inside, offset toward the rear.
- The outline is a *closed* ring (no gap at corner D).
- `npm run build` succeeds; `npm test` still green.

If the front edge looks wrong (straight, or a gap at D), re-check `lotRingLatLng` ordering against
`geometry.js`'s note: ring = `[A, B, C, C2end, ...frontEdgePoints().reverse()]` where
`frontEdgePoints()` runs D→C2end, so reversed it runs C2end→D and closes to A. Do not fudge.

- [ ] **Step 4: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/map.js src/main.js
git commit -m "feat(map): render georeferenced lot outline + house polygons"
```

---

## Task 5: Align-by-imagery calibration flow

**Files:**
- Modify: `src/map.js`
- Modify: `src/main.js`

The user clicks **Calibrate**, then clicks the map where **corner A** (rear-left) is, then where
**corner C** (front-right, the long diagonal for precision) is. We solve `{lat0,lon0,theta}` with
`calibrate.js`, persist via `devstore.js`, and render the overlay. On reload, the saved calibration
is reused.

- [ ] **Step 1: Add the calibration flow to `src/map.js`**

```javascript
import { solveCalibration } from './calibrate.js';

// Two-click calibration: collect corner A then corner C, solve, callback with the calibration.
export function startCalibration(onDone, setHint) {
  const { A, C } = corners();
  const picks = [];
  const order = [
    { local: A, label: 'rear-LEFT corner (A)' },
    { local: C, label: 'front-RIGHT corner (C)' },
  ];
  setHint(`Click the ${order[0].label} on the imagery`);

  function onClick(e) {
    picks.push({ local: order[picks.length].local, ll: { lat: e.latlng.lat, lon: e.latlng.lng } });
    if (picks.length < order.length) {
      setHint(`Now click the ${order[picks.length].label}`);
      return;
    }
    map.off('click', onClick);
    setHint('');
    const cal = solveCalibration(picks[0].local, picks[0].ll, picks[1].local, picks[1].ll);
    onDone(cal);
  }

  map.on('click', onClick);
}
```

- [ ] **Step 2: Wire the button + persistence in `src/main.js`**

```javascript
// src/main.js
import { initMap, renderOverlay, startCalibration } from './map.js';
import { loadState, saveState } from './devstore.js';

initMap('map');
const state = loadState();
const hintEl = document.getElementById('hint');
const setHint = (t) => { hintEl.textContent = t; };

if (state.calibration) renderOverlay(state.calibration);

document.getElementById('calibrate-btn').addEventListener('click', () => {
  startCalibration((cal) => {
    state.calibration = cal;
    saveState(state);
    renderOverlay(cal);
  }, setHint);
});
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`. Acceptance:
- Pan/zoom to any house with a clear yard. Click **Calibrate**, click two points; the outline snaps
  onto the imagery at the placed corners, rotated to match.
- Reload the page: the outline reappears in the same place (calibration persisted in localStorage).
- `npm run build` + `npm test` green.

- [ ] **Step 4: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add src/map.js src/main.js
git commit -m "feat(map): align-by-imagery calibration flow (two-corner solve + persist)"
```

---

## Task 6: Draggable head/plant markers + drag-correct

**Files:**
- Create: `data/dev-items.json`
- Modify: `src/map.js`
- Modify: `src/main.js`

Render items as draggable lat/lon markers; dragging updates their coordinates and persists (the
drag-correct workflow). Plan 3 adds real placement/GPS; here we seed a few dev items so the
interaction is testable.

- [ ] **Step 1: Seed dev items (positioned in local feet, converted to lat/lon at load)**

`data/dev-items.json`:
```json
{
  "heads": [
    { "id": 1, "label": "Z1-H1", "feet": { "x": 30, "y": 40 }, "color": "#3ecf8e" },
    { "id": 2, "label": "Z1-H2", "feet": { "x": 55, "y": 70 }, "color": "#3ecf8e" }
  ],
  "plants": [
    { "id": 1, "label": "DOG-1", "feet": { "x": 20, "y": 110 }, "color": "#c0392b" }
  ]
}
```

- [ ] **Step 2: Add marker rendering + drag-correct to `src/map.js`**

```javascript
import { latLonToLocal } from './georef.js';

let itemGroup = null;

// items: [{id,label,color, lat,lon}]  (lat/lon canonical). onMove(id, kind, lat, lon) on dragend.
export function renderItems(cal, heads, plants, onMove) {
  if (itemGroup) itemGroup.remove();
  itemGroup = L.layerGroup().addTo(map);
  const place = (kind, it) => {
    const marker = L.circleMarker([it.lat, it.lon], {
      radius: kind === 'head' ? 6 : 7, color: it.color, fillColor: it.color, fillOpacity: 0.85,
    }).bindTooltip(it.label, { permanent: false }).addTo(itemGroup);
    // circleMarker isn't draggable; use a transparent draggable marker on top for correction.
    const handle = L.marker([it.lat, it.lon], { draggable: true, opacity: 0 }).addTo(itemGroup);
    handle.on('drag', (e) => marker.setLatLng(e.latlng));
    handle.on('dragend', (e) => {
      const { lat, lng } = e.target.getLatLng();
      onMove(it.id, kind, lat, lng);
    });
  };
  heads.forEach((h) => place('head', h));
  plants.forEach((p) => place('plant', p));
}
```

- [ ] **Step 3: Wire dev items in `src/main.js` (convert feet→lat/lon once calibrated)**

```javascript
import { renderItems } from './map.js';
import { localToLatLon } from './georef.js';
import devItems from '../data/dev-items.json';

function ensureLatLon(state) {
  // First run: convert seed feet positions to lat/lon using the calibration, then persist.
  if (state.calibration && state.heads.length === 0 && state.plants.length === 0) {
    const conv = (arr) => arr.map((it) => {
      const ll = localToLatLon(it.feet, state.calibration);
      return { id: it.id, label: it.label, color: it.color, lat: ll.lat, lon: ll.lon };
    });
    state.heads = conv(devItems.heads);
    state.plants = conv(devItems.plants);
    saveState(state);
  }
}

function drawItems() {
  renderItems(state.calibration, state.heads, state.plants, (id, kind, lat, lon) => {
    const list = kind === 'head' ? state.heads : state.plants;
    const it = list.find((x) => x.id === id);
    if (it) { it.lat = lat; it.lon = lon; saveState(state); }
  });
}

// after renderOverlay(cal) in both the load path and the calibration callback:
//   ensureLatLon(state); drawItems();
```
(Integrate these two calls right after each `renderOverlay(...)` call site.)

- [ ] **Step 4: Verify visually**

Run: `npm run dev`. Acceptance:
- After calibrating, two green head dots and one red plant dot appear inside the lot at sensible
  positions.
- Drag a dot; it follows the cursor and stays where dropped. Reload — it persists at the new spot.
- `npm run build` + `npm test` green (geometry, georef, calibrate, devstore suites).

- [ ] **Step 5: Commit**

```bash
cd /Users/pk/code/groundskeeper
git add data/dev-items.json src/map.js src/main.js
git commit -m "feat(map): draggable head/plant markers with drag-correct persistence"
```

---

## Task 7: Finalize — full suite, build, README, push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full test + build**

Run: `cd /Users/pk/code/groundskeeper && npm test && npm run build`
Expected: all unit suites pass (geometry, georef, calibrate, devstore); build clean.

- [ ] **Step 2: Update README roadmap + structure**

In `README.md`: set Milestone 2 status to ✅ Done; in the Project structure tree mark
`map.js` / `calibrate.js` / `devstore.js` as implemented (drop their "(Plan 2)" tag, add ✅).

- [ ] **Step 3: Commit + push**

```bash
cd /Users/pk/code/groundskeeper
git add README.md
git commit -m "docs: mark Plan 2 (map view) complete in README"
git push origin main
```

- [ ] **Step 4: Confirm CI + Pages green**

Run: `gh run list --branch main --limit 3` — CI and Pages should be `success`. Open
`https://louisalexander.github.io/groundskeeper/` and confirm the map loads (note: GitHub Pages
serves over HTTPS, so the Esri imagery and future GPS will work there).

---

## Done criteria
- [ ] `calibrate.js` + `devstore.js` are pure and unit-tested; full suite green.
- [ ] Map renders the survey outline (with the cul-de-sac curve) + house over imagery.
- [ ] Two-click align-by-imagery calibration solves `{lat0,lon0,theta}`, persists, and survives reload.
- [ ] Heads/plants render as draggable markers; drag-correct updates and persists lat/lon.
- [ ] CI + Pages green; map visible on the live Pages site.

## Notes / handoff to Plan 3
- Persistence is localStorage (`devstore.js`); **Plan 4** swaps it for Supabase + IndexedDB + the
  full entity schema (incl. `sensor`, `updatedAt`/`deletedAt`). Keep the `onMove`/state shape simple.
- The base layer is online Esri; the **bundled orthophoto** drops into `setBaseLayer()` once sourced.
- **Plan 3** replaces the dev seed items with real survey placement (GPS averaging, sensor type,
  confidence rings) and should reuse `renderItems` + the drag-correct handler.
- Carry over the deferred Plan-1 review nits: add an `arcPoints` `segments<1` guard test, a second
  non-axis `move` bearing test, and a lot-closure test (`dist(C2end, C) ≈ 57.59 ft`).
```
