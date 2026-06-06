# Groundskeeper — Design Spec

**Date:** 2026-06-05
**Repo:** https://github.com/louisalexander/groundskeeper
**Status:** Approved design — pending implementation plan
**Supersedes:** the single-file Claude artifact `yard-map.html`

---

## 1. Purpose & Goals

Take the existing single-file "Yard Map" Claude artifact (irrigation heads + plant
inventory on a survey-accurate SVG of a residential lot) to a hosted, multi-device,
higher-accuracy web app.

**Prioritized goals (from brainstorming):**

1. **Home Assistant export (the core purpose).** The whole field-survey → map pipeline exists to
   produce a Home Assistant yard dashboard. Phase 1 emits a `picture-elements` card + a rendered
   background image with accurately positioned, **tappable Rachio zones** and live **sensor
   overlays**; a `floorplan` custom-card output is a planned Phase 2. See §6.
2. **Accessible anywhere** — stable URL, any device, data persists outside the Claude artifact.
3. **Sharper map accuracy** — imagery-aligned to the certified survey + better GPS math (so the
   exported dashboard is positionally correct).
4. **Polish & robustness** — fix latent bugs, undo, offline support, clean mobile UX, exports.

**Explicitly out of scope:**
- **App-side live HA control** — the app *generates artifacts* (image + YAML) the user imports;
  it does not hold HA tokens or call HA live. (Live behavior — toggling zones, live sensor values
  — happens *in the imported card*, which is HA-native.)
- **Multi-user / shared editing** (single owner, multi-device only).
- **Automation-blueprint export** and **floorplan output** — designed-for but deferred to later
  phases.

**Owner model:** single owner, multiple devices (survey on phone → view on laptop), auto-sync.
No shared/multi-user editing.

---

## 2. Architecture

**Stack**
- **Leaflet** — map engine (georeferenced imagery, pan/zoom/touch, markers). ~40KB.
- **Bundled public-domain orthophoto** — the default *and* offline basemap (see §3.3). Sourced
  from VGIN (Virginia GIS) / the county GIS portal / USDA NAIP, committed as a static app asset.
  Optional live tile layers (Esri/Google/Mapbox) can be toggled on when online for freshness.
- **Vanilla JS in ES modules** — no framework.
- **Supabase JS client** — sync + passwordless auth (free tier).
- **Vite** — dev server + static production build.
- **Cloudflare Pages** — static hosting, custom domain, automatic HTTPS (required for GPS).

**Decision: light build + modules** (vs. staying zero-build single-file). Vite outputs a plain
static site; the payoff is isolation, testability, and files small enough to reason about. The
valuable survey-geometry math ports over nearly verbatim as a pure, unit-tested module.

**Project structure**
```
groundskeeper/
├── index.html                 # thin shell
├── src/
│   ├── main.js                # bootstrap, view wiring
│   ├── geometry.js            # survey math (bv/mv/corners/house) — pure + unit-tested
│   ├── georef.js              # survey-feet ↔ WGS84 lat/lon transform (accuracy core)
│   ├── map.js                 # Leaflet map, imagery layer, outline/house polygons, markers
│   ├── gps.js                 # averaging, outlier rejection, confidence
│   ├── survey.js              # Survey-view workflow (place/record heads/plants/sensors)
│   ├── store.js               # Supabase + IndexedDB cache, offline queue
│   ├── plants.js              # PLANT_TYPES + care data (imported from data/plant-care.json)
│   ├── ha.js                  # HA export: render background image + picture-elements YAML
│   └── ui/                    # panels, sidebar, pickers, HA-entity settings
├── public/
│   └── basemap/               # bundled georeferenced orthophoto (.jpg/.png) + bounds.json
├── data/                      # survey-geometry.json, plant-care.json (source of truth)
├── test/                      # geometry + georef + gps unit tests (Vitest)
├── docs/                      # survey plat, specs
└── CLAUDE.md / README.md
```

---

## 3. Georeferencing & Map Rendering (accuracy core)

### 3.1 The transform
The survey gives exact relative geometry in feet (origin = NW corner A, +x east, +y south)
with true-north bearings. A single 2-D similarity transform maps survey-feet ↔ WGS84 lat/lon,
defined by three stored numbers: `lat0, lon0` (real-world position of origin A) and `θ` (small
rotation correcting survey-grid north vs. imagery/true north; ≈0, nudge-able).

```
// local (E ft east, S ft south) → lat/lon
northFt = -S
e' = E·cosθ − northFt·sinθ
n' = E·sinθ + northFt·cosθ
lat = lat0 + n'/364000
lon = lon0 + e'/(364000·cos(lat0))      // inverse used for GPS → local
```
(`364000` ft/degree latitude is a local-flat-earth approximation, valid over a single lot.)

### 3.2 Calibration — align-by-imagery (primary)
The owner drags/rotates the survey outline over the basemap to match rooflines / driveway,
**once**. Because every map pixel has a known lat/lon, reading the outline's final position
yields `lat0, lon0, θ`. This achieves **sub-foot precision** (relative error cancels; see §3.5),
takes ~30 seconds, is stored in `calibration`, and syncs to all devices.

The **Power-Box GPS anchor is demoted to an optional fallback / sanity check** — no longer a
required ritual.

### 3.3 Basemap — bundled public-domain orthophoto
Because this is a **fixed single lot**, a live global slippy-tile service is the wrong tool: it's
finicky to cache and its terms generally forbid offline tile storage. Instead the basemap is
**one high-resolution, georeferenced orthophoto of the lot, committed as a static app asset**
(`public/basemap/`) and drawn via `L.imageOverlay` at its known lat/lon corner bounds.

- **Source:** public-domain imagery — **VGIN (Virginia GIS)**, **the county GIS portal**, or
  **USDA NAIP**. VA local orthoimagery is often **6-inch to 1-foot** resolution (frequently
  crisper than consumer basemaps) and legal to store and ship.
- **Offline by construction:** it's part of the app shell, so it works with no signal — no tile
  pre-fetching or tile-pyramid caching needed (see §4.4).
- **Accuracy bonus:** higher-res orthorectified county imagery can improve the align-by-imagery
  calibration vs. consumer tiles.
- **Optional live layer:** when online, the user may toggle a live tile layer (Esri/Google/
  Mapbox) for current imagery. Online-only, off by default; not relied upon.

### 3.4 Rendering on Leaflet
- Base: the bundled orthophoto `imageOverlay` (+ optional live tile layer when online).
- Lot outline + house footprint: georeferenced polygons. The front cul-de-sac arcs (R=40'/50',
  reverse-S) are **tessellated into short lat/lon segments** using the existing arc math so the
  curve stays survey-accurate.
- Heads: colored circle markers + a true-to-scale spray-radius ring (real feet). Plants:
  emoji/hex `divIcon` markers. Sensors: a distinct marker by `kind` (soil/weather). All
  **draggable** (drag-to-correct).
- North-up. The stylized "blueprint" outline is drawn on top of imagery to preserve the survey
  aesthetic.

### 3.5 Expected accuracy (honest budget)
Accuracy is **relative**: imagery's ~1–3 m absolute error is a near-uniform shift across the
~40 m lot and cancels when outline + items share the same basemap. Internal imagery accuracy is
~0.15–0.3 m/pixel.

| Feature | Visible from above? | Realistic accuracy | Method |
|---|---|---|---|
| Hedges, shrubs, trees, beds | ✅ Yes | **~1 ft** (sometimes inches) | Click the plant in the imagery |
| Sprinkler heads | ❌ No (flush pop-ups) | **~1–3 ft** | GPS/measure, then **drag-correct** |

Heads are invisible to imagery, so they land at GPS accuracy (3–8 ft suburban, multipath) unless
drag-corrected against the accurate basemap or measured from now-accurate landmarks (~1–2 ft).
Survey-grade sub-foot for heads would require RTK hardware (~$300–1000) — out of scope.

---

## 4. Data Model, Sync, Offline & Auth

### 4.1 Canonical coordinates
`lat/lon` is canonical (imagery-aligned, GPS-native). Feet/px are **derived** for display via the
inverse transform — the "X ft E · Y ft S" readout is preserved.

```
calibration: { lat0, lon0, theta, method, updatedAt }
zone:   { id, name, color, haEntity, updatedAt, deletedAt }       // haEntity: Rachio switch (§6.2)
head:   { id, lat, lon, zoneId, type, radiusFt, label, notes,
          gps:{acc}|null, placedBy:'imagery|gps|manual|drag', confidenceFt, updatedAt, deletedAt }
plant:  { id, lat, lon, typeId, label, notes, updatedAt, deletedAt }
sensor: { id, lat, lon, kind:'soil|weather|other', label, haEntity, notes,
          placedBy, confidenceFt, gps:{acc}|null, updatedAt, deletedAt }   // §6.3
```
Every entity carries `deletedAt` (soft-delete / tombstone) — see §4.2.

### 4.2 Supabase — per-entity tables (not a JSON blob)
Tables: `heads`, `plants`, `sensors`, `zones`, `settings` (calibration + global HA entity map +
misc). Each row carries `user_id` and `updated_at`.

**Rationale:** a single JSON-document model would clobber a laptop edit when the phone syncs
(whole-doc last-write-wins). Per-entity rows mean edits to *different* items on *different*
devices both survive. Same-row conflicts are last-write-wins by `updated_at` — fine for a single
owner.

**Soft-delete / tombstones (required for correct offline sync):** deletes set `deleted_at`
rather than removing the row, and sync like any other edit. Without this, deleting an item on an
offline phone would let a stale device that still has the row "win" on reconnect and resurrect
it. The UI filters out `deleted_at != null`; a background job may hard-purge old tombstones later.

**Row-Level Security:** every row tied to `auth.uid()`; only the owner can read/write.

### 4.3 Auth
Supabase **magic-link email** (passwordless). New device = click an emailed link. No passwords.

### 4.4 Offline-first (PWA)
**Full offline is a hard requirement** — the property has spotty cell signal and wifi does not
reach the backyard. The whole survey workflow must work with zero connectivity.

This is made tractable by the bundled-orthophoto decision (§3.3): there is **no tile pyramid to
cache** — the basemap is a single static asset in the app shell.

- Full dataset cached in **IndexedDB**; app renders from cache instantly, works with no signal.
- **Optimistic writes:** update cache → render → queue to Supabase → flush on reconnect.
- **Load:** render cache → fetch remote → merge per-row by `updated_at` (respecting `deleted_at`)
  → update cache.
- **Service worker** caches a *small, fixed* set: app shell + Leaflet + the one orthophoto image.
  No on-demand tile caching, which removes the finicky/ToS-laden part of offline maps.
- **Manifest** for "Add to Home Screen."
- **iOS caveat & mitigation:** iOS may evict PWA storage after ~7 days unused and lacks
  background sync. Neutralized here because (a) the basemap is a build asset, cheaply re-fetched
  when next online if evicted, and (b) the dataset is tiny and re-syncs on reconnect. Queued
  writes flush on next app open with signal (no reliance on iOS background sync).
- Sync status reuses the existing status-bar indicator (✓ Saved / ⚠ offline-queued).

### 4.5 Migration
One-time importer: existing data (current `x,y` SVG pixels, or exported JSON) → feet
(subtract `OFF_X/OFF_Y`, ÷ `F`) → lat/lon via the new calibration. Low-stakes (little field data
yet) but provided.

---

## 5. GPS Math, Polish & Bugfixes

### 5.1 Better GPS math (`gps.js`, unit-tested)
- **Outlier rejection:** drop readings with reported accuracy worse than ~15 m, then drop points
  beyond 2σ from the running median.
- **Accuracy-weighted average:** combine survivors weighted by 1/acc² (inverse-variance).
- **Confidence per point:** spread in feet → stored as `confidenceFt`, drawn as a faint
  confidence ring + "±X ft" readout.
- Averaging caps by count and time, with live convergence feedback (existing meter UI retained).

### 5.2 Polish & robustness
- **Fix `addZone()` `prompt()` bug** → inline DOM input (the `renameZone()` pattern).
- **Undo/redo:** small action-history stack (place / move / delete / edit) + button + Ctrl/Cmd-Z.
- **Drag-correct wiring:** dragging updates lat/lon, sets `placedBy:'drag'`, bumps `updatedAt`, syncs.
- **Mobile:** Leaflet native touch (removes custom touch code); larger tap targets in survey flow.
- **Export:** keep JSON export; add one-click **PNG/print** of the map. The HA export is a
  primary feature with its own pipeline — see §6.
- **Error states:** denied GPS permission, expired login (keep working offline), queued-write status.

---

## 6. Home Assistant Export & Integration

HA export is a **primary deliverable**, not a side feature. Phase 1 targets a `picture-elements`
card; a `floorplan` custom-card output is a planned Phase 2 (the same georeference + entity map
feeds both). The app produces files the user imports into HA — it does not call HA live.

### 6.1 Rendered background image
Export generates a self-contained background **PNG**: the bundled orthophoto with the survey
outline + house drawn on top, at fixed, known pixel dimensions and known lat/lon bounds. Because
the image bounds are known, every item's on-image position is an exact linear map from its
lat/lon → percentage, so card elements line up perfectly with the imagery.
→ saved to `/config/www/` (e.g. `yard-basemap.png`).

### 6.2 Entity mapping (settings UI)
A **Settings → "HA Entities"** panel maps app concepts to *your* real HA entity IDs, replacing
the old hardcoded `switch.rachio_zone_N`:
- each **zone** → a Rachio switch entity (e.g. `switch.rachio_zone_1`), stored as `zone.haEntity`
- each placed **sensor** → its HA entity (`sensor.soil_moisture_*`, `sensor.ecowitt_ws90_*`),
  stored as `sensor.haEntity`
- any non-placed/global entities (e.g. a WS90 rain-rate label) → kept in `settings`
Synced across devices; consumed by the export.

### 6.3 New entity type: `sensor`
A third placeable item type alongside heads/plants (schema in §4.1), positioned with the same
imagery / GPS / drag workflow and rendered with a distinct marker by `kind` (soil / weather).
This lets soil-moisture and weather sensors export at their true physical positions.

### 6.4 Generated picture-elements card
Card YAML positions each element by % over the background image:
- **Heads** → `state-badge` bound to the zone's mapped Rachio switch; **tap toggles** the zone and
  the badge **colors by running state**.
- **Sensors** → `state-label` (or badge) showing the live value (rain rate, soil %, temperature)
  at its true position.
- **Plants** → lightweight label/marker (info only).
→ saved as `yard-card.yaml`, pasted into a dashboard. **No HACS/add-ons required** for Phase 1.

### 6.5 Deferred (designed-for, later phases)
- **Floorplan custom-card** output (SVG + config) — Phase 2.
- **Automation blueprints** (rain skip, soil-moisture gate, wind hold, beetle-season reminders)
  referencing the mapped entities.

---

## 7. Testing
- **Vitest unit tests** on the pure modules:
  - `geometry.js` — computed corners match certified survey values.
  - `georef.js` — local↔lat/lon round-trips; a known reference point lands correctly.
  - `gps.js` — outlier rejection + weighted averaging on synthetic readings.
  - `ha.js` — lat/lon → image-% positioning matches the rendered background bounds; YAML emits
    the mapped entity IDs for zones/sensors.
- **Manual field checklist** for GPS / imagery-calibration / sync paths, plus an
  **import-into-HA smoke test** (paste card YAML + drop the PNG, confirm elements align).
- No heavy E2E framework yet (YAGNI); add Playwright later only if it earns its keep.

---

## 8. Deployment
- Repo: `github.com/louisalexander/groundskeeper`.
- Cloudflare Pages connected to the repo → auto-deploy on push; build = `vite build`, output `dist/`.
- Custom domain (e.g. `groundskeeper.app`) optional; Cloudflare provides HTTPS (GPS requires it).
- Supabase project (free tier) holds data + auth; keys via Vite env vars (anon key is public-safe
  with RLS enforcing per-user access).

---

## 9. Open questions / deferred
- **Sourcing the orthophoto** (implementation task): obtain the best available public-domain
  georeferenced image of the lot from VGIN / the county GIS portal / USDA NAIP, record its lat/lon
  corner bounds, and commit it to `public/basemap/`.
- Optional live tile layer + any API key (Mapbox/Google) — deferred; bundled orthophoto is the
  default and is sufficient to start.
- Per-plant photos (deferred — not requested).
- RTK / survey-grade head placement (out of scope unless hardware is acquired).
- Playwright E2E (deferred).
