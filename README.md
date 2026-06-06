<div align="center">

# 🌳 Groundskeeper

### Survey-grade yard mapping for irrigation, plants & sensors — built to drive a live Home Assistant dashboard.

[![CI](https://github.com/louisalexander/groundskeeper/actions/workflows/ci.yml/badge.svg)](https://github.com/louisalexander/groundskeeper/actions/workflows/ci.yml)
[![Pages](https://github.com/louisalexander/groundskeeper/actions/workflows/pages.yml/badge.svg)](https://louisalexander.github.io/groundskeeper/)
![Made with Vanilla JS](https://img.shields.io/badge/made%20with-vanilla%20JS-f7df1e?logo=javascript&logoColor=000)
![Leaflet](https://img.shields.io/badge/map-Leaflet-199900?logo=leaflet&logoColor=fff)
![No build framework](https://img.shields.io/badge/framework-none-blue)

**[🌐 Live demo](https://louisalexander.github.io/groundskeeper/)** · **[📐 Design spec](docs/superpowers/specs/2026-06-05-groundskeeper-design.md)** · **[🗺 Roadmap](#-roadmap)**

</div>

---

## What is this?

**Groundskeeper** turns a certified property survey into an interactive, georeferenced map of everything that matters in a yard — every **sprinkler head**, **plant**, and **soil/weather sensor** — placed within a foot or two of where it actually is. You survey the yard once from your phone, and Groundskeeper generates a **Home Assistant dashboard** with tappable Rachio zones and live sensor overlays, perfectly aligned to real aerial imagery of your lot.

It started as a single-file tool for one property — **12009 Blairmont Court, Glen Allen, VA** (Lot 25) — and is being rebuilt as a hosted, offline-capable, multi-device web app.

> **Why "ground truth"?** The whole point is reconciling three sources of position — the legal **survey**, real **aerial imagery**, and field **GPS** — into one accurate map you can actually act on.

---

## ✨ Features

- 🛰 **Georeferenced to real imagery.** The survey-accurate lot outline is aligned to a high-resolution public-domain orthophoto, so you place plants by clicking the actual shrub in the photo.
- 📍 **GPS-assisted field survey.** Walk the yard, average GPS at each item with outlier rejection and a confidence ring — then nudge to perfection.
- ✋ **Drag-to-correct.** Your eye beats GPS noise. Grab any marker and drop it where it belongs.
- 💧 **Irrigation mapping.** Heads grouped into Rachio zones, drawn with true-to-scale spray radii.
- 🌿 **Plant inventory.** Species with care notes, pruning windows, and warnings.
- 🌡 **Sensor placement.** Soil-moisture and weather sensors mapped at their real positions.
- 🏠 **Home Assistant export.** A `picture-elements` card + rendered basemap with **tap-to-run zones** and **live sensor labels** — no add-ons required.
- 📶 **Offline-first.** Spotty signal in the backyard? The whole survey works with zero connectivity (PWA).
- ☁️ **Synced across devices.** Survey on your phone, review on your laptop.

---

## 🎯 Accuracy, honestly

Accuracy is **relative** — aerial imagery's ~1–3 m absolute error is a near-uniform shift across a small lot and cancels once the outline and items share the same basemap.

| What you're placing | Visible from above? | Realistic accuracy | How |
|---|---|---|---|
| 🌿 Hedges, shrubs, trees, beds | ✅ Yes | **~1 ft** (sometimes inches) | Click the plant in the imagery |
| 💧 Sprinkler heads | ❌ No (flush pop-ups) | **~1–3 ft** | GPS/measure, then drag-correct |

Survey-grade sub-foot head placement would need RTK hardware — intentionally out of scope.

---

## 🧭 How georeferencing works

The certified survey gives exact relative geometry in feet (origin = NW corner, bearings clockwise from true north). A single 2-D similarity transform maps **survey feet ↔ WGS84 lat/lon**, defined by three numbers — `lat0, lon0` (the origin's real-world position) and `θ` (a small rotation) — solved **once** by dragging the outline onto the satellite imagery. After that, every GPS reading and every item lives in lat/lon and lands on the imagery exactly.

```
 survey bearings + distances ──┐
                               ├─►  geometry.js  (lot corners, house, arcs — in feet)
 align-by-imagery calibration ─┘            │
                                            ▼
                                       georef.js  (feet ⇄ lat/lon, with rotation θ)
                                            │
                                            ▼
                              Leaflet map · GPS · HA export
```

---

## 🚀 Getting started

```bash
git clone https://github.com/louisalexander/groundskeeper.git
cd groundskeeper
npm install

npm run dev      # local dev server (use this for GPS — needs http://localhost or HTTPS)
npm test         # run the Vitest unit suite
npm run build    # production build → dist/
npm run preview  # preview the production build
```

> **GPS note:** `navigator.geolocation` only works over **HTTPS** or **`http://localhost`** — never from a `file://` path.

---

## 🛠 Tech stack

| Concern | Choice | Why |
|---|---|---|
| Map engine | **Leaflet** | Georeferenced imagery, touch, markers — ~40 KB |
| Basemap | **Bundled public-domain orthophoto** (VGIN / county / USDA NAIP) | Offline-by-construction, license-clean, often higher-res than consumer tiles |
| Language | **Vanilla JS, ES modules** | No framework; small, pure, testable units |
| Build/test | **Vite + Vitest** | Fast dev, static output, real unit tests |
| Sync + auth | **Supabase** (per-entity tables, magic-link, RLS) | Multi-device sync without running a server |
| Offline | **IndexedDB + Service Worker (PWA)** | Full survey works with no signal |
| Hosting | **Cloudflare Pages** (prod) · **GitHub Pages** (preview) | Free, HTTPS, custom domain |

---

## 🗺 Roadmap

Built as a sequence of milestone plans, each shippable on its own.

| # | Milestone | Status |
|---|---|---|
| 1 | **Foundation** — scaffold + pure `geometry.js` / `georef.js`, fully unit-tested | ✅ Done |
| 2 | **Map view** — Leaflet + orthophoto, georeferenced outline/house, markers, align-by-imagery calibration, drag-correct | ⬜ Next |
| 3 | **Survey + GPS** — weighted/outlier-rejected averaging, survey workflow, sensor placement, confidence rings | ⬜ Planned |
| 4 | **Sync / auth / offline** — Supabase per-entity tables + RLS, magic-link, IndexedDB cache, tombstones, PWA | ⬜ Planned |
| 5 | **HA export** — entity-mapping settings, rendered background PNG, picture-elements YAML | ⬜ Planned |
| 6 | **Deploy** — Cloudflare Pages + Supabase env wiring | ⬜ Planned |

Specs and step-by-step plans live in [`docs/superpowers/`](docs/superpowers/).

---

## 🏠 Home Assistant export

Groundskeeper generates files you import into HA (it never holds HA tokens itself):

- **`lot25-basemap.png`** → `/config/www/` — your aerial + survey outline, with exact lat/lon→% positioning.
- **`lot25-card.yaml`** → a `picture-elements` card where head badges **toggle their Rachio zone** and color by run state, and sensor labels show live values (rain rate, soil %, temperature).

Entity IDs are mapped in-app (Settings → HA Entities), so the export matches *your* Home Assistant. A `floorplan` custom-card output and automation blueprints are designed-for and planned.

---

## 📦 Project structure

```
groundskeeper/
├── index.html            # thin shell
├── src/
│   ├── geometry.js       # ✅ pure survey math (corners, house, cul-de-sac arcs) — in feet
│   ├── georef.js         # ✅ survey-feet ⇄ WGS84 lat/lon transform
│   ├── map.js            # Leaflet map + georeferenced overlays         (Plan 2)
│   ├── gps.js            # averaging, outlier rejection, confidence      (Plan 3)
│   ├── survey.js         # field survey workflow                          (Plan 3)
│   ├── store.js          # Supabase + IndexedDB offline sync             (Plan 4)
│   ├── ha.js             # Home Assistant export pipeline                (Plan 5)
│   └── ui/               # panels, pickers, HA-entity settings
├── public/basemap/       # bundled georeferenced orthophoto
├── data/                 # survey-geometry.json, plant-care.json
├── test/                 # Vitest unit tests
└── docs/                 # survey plat, design specs & plans
```

---

## 📍 Property

| | |
|--|--|
| Address | 12009 Blairmont Court, Glen Allen, VA 23059 |
| Lot | 25, Block B — Blairmont at Grey Oaks |
| Survey | A.G. Harocopos & Associates, P.C. · 2026-02-16 · JN 54826 · NAD 83 |
| Lot area | ~13,099 sq ft (0.30 acres) |

---

<div align="center">

Built with [Claude Code](https://claude.com/claude-code) · 🌱

</div>
