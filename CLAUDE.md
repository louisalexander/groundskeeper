# CLAUDE.md — Yard Map: 12009 Blairmont Court

This file is the authoritative context document for Claude Code working on this repository. Read it fully before making any changes.

---

## What This Is

A single-file HTML/SVG web application for mapping the irrigation system and plant inventory at **12009 Blairmont Court, Glen Allen, VA 23059**. It runs as a published Claude artifact (for persistent storage) but can also run as a standalone HTML file in any browser.

The tool has two primary views:
- **🗺 Map View** — desktop-oriented, shows a geometrically accurate SVG lot map with sprinkler heads and plants as interactive overlays
- **📍 Survey View** — mobile-optimized workflow for walking the property and recording GPS positions of heads and plants

---

## Repository Structure

```
yard-map/
├── src/
│   └── yard-map.html          # THE ENTIRE APPLICATION — single file, self-contained
├── data/
│   ├── survey-geometry.json   # Survey bearings, lot dimensions, house offsets, sensor/zone config
│   └── plant-care.json        # All 17 plant species with care instructions
├── docs/
│   └── survey_lot25-105.jpg   # Scanned survey plat (page 105 of closing docs)
├── CLAUDE.md                  # This file
└── README.md                  # User-facing documentation
```

**The entire application is `src/yard-map.html`.** All CSS, JavaScript, SVG rendering, GPS logic, plant data, and storage are in this one file. There is no build step, no npm, no bundler.

---

## Running & Developing

There is **no build, lint, or test tooling** — it's a single static HTML file. To work on it:

```bash
# Preview with a local server (REQUIRED for GPS — geolocation needs a secure context)
python3 -m http.server 8000          # then open http://localhost:8000/src/yard-map.html

# Quick non-GPS preview (map/plant/UI work only)
open src/yard-map.html               # file:// works, but Survey GPS will be blocked
```

- **GPS (`navigator.geolocation`) only works over HTTPS or `http://localhost`** — never from a `file://` path. Test the Survey view via the local server or the published artifact.
- **Persistent storage (`window.storage`) only exists inside the Claude artifact iframe.** Locally it is `undefined`, so `saveData()`/`loadData()` throw and are swallowed by their try/catch — placements live only in memory for that page load. This is expected; do real persistence testing in the published artifact.
- After editing, just reload the browser. To validate geometry changes, eyeball the SVG against `docs/survey_lot25-105.jpg` and the dimension labels rendered on the map.

---

## The SVG Map — Geometry Rules (CRITICAL)

The lot map is computed from **certified survey bearings and distances**. Do not guess or estimate coordinates — derive everything mathematically.

### Coordinate System
- **Scale:** 4 px per foot (`const F = 4.0`)
- **Y-axis:** Positive Y = South (standard SVG, y-down)
- **X-axis:** Positive X = East
- **Origin:** NW corner of lot (Point A) placed at canvas position after `OFF_X`/`OFF_Y` margin offset

### Bearing → SVG Vector Conversion
The actual identifiers in the source are terse — grep for these, not the descriptive names:

| Concept | Real name in `yard-map.html` |
|---------|------------------------------|
| bearing → unit vector | `bv(deg)` |
| move point along bearing | `mv(pt, brg, dist)` |
| apply margin offset to a point | `o(pt)` |
| point → `"x,y"` string | `p(pt)` |
| create SVG element | `el(tag, attrs)` |
| create + append SVG element | `add(parent, tag, attrs, text)` |
| dimension line | `dimL(...)` (inner fn of `buildMap`) |

```javascript
function bv(deg) {                       // "bearingVec"
  const r = (90 - deg) * Math.PI / 180;  // compass bearing to math angle
  return { x: Math.cos(r), y: -Math.sin(r) };  // negate y for SVG y-down
}
function mv(pt, brg, dist) {             // "move"
  const v = bv(brg);
  return { x: pt.x + v.x * ft(dist), y: pt.y + v.y * ft(dist) };
}
```

### Lot Corners (computed from survey)
| Point | Description | How Computed |
|-------|-------------|--------------|
| A | NW rear-left | Origin `{x:0, y:0}` |
| B | NE rear-right | `move(A, 47.5°, 92.00ft)` |
| C | SE front-right | `move(B, 137.5°, 150.00ft)` |
| D | SW front-left | `move(A, 137.5°, 133.47ft)` |
| C1end | End of C1 arc | `move(D, 69.3808°, 29.81ft)` |
| C2end | End of C2 arc | `move(C1end, 86.3°, 8.65ft)` |

### Front Boundary (Blairmont Court Cul-de-sac)
The front is NOT a straight line — it's a reverse S-curve:
```
D → C1 arc (R=40', Δ=43.76°, CW) → C2 arc (R=50', Δ=9.92°, CCW) → straight 57.59' → C
```
**SVG path (backward traversal C→D in lot outline):**
```javascript
`... L ${p(oC2end)} A ${c2R},${c2R} 0 0,1 ${p(oC1end)} A ${c1R},${c1R} 0 0,0 ${p(oD)} Z`
```
Sweep flags are **reversed** from the forward direction because the lot path traverses backward (C→D):
- Forward D→C: C1=sweep 1 (CW), C2=sweep 0 (CCW)
- Backward C→D: C2=sweep 1, C1=sweep 0

**Do not change arc sweep flags without re-deriving from the tangent analysis.**

### House Footprint
Computed from survey offsets:
```javascript
const hNW = move(move(A, 137.5°, 22.70ft), 47.5°, 22.67ft);  // rear setback then left offset
const hNE = move(hNW, 47.5°, 56.89ft);   // width = 92 - 22.67 - 12.44
const hSW = move(hNW, 137.5°, 59.85ft);  // depth = 133.47 - 22.70 - 50.92
const hSE = move(hNE, 137.5°, 59.85ft);
```

### GPS Anchor Point
The **Power Box** (square marker on survey, left boundary ~126ft from NW corner A) is the designated GPS anchor. Its SVG coordinates are:
```javascript
const POWBOX_RAW = move(A, 137.5°, 126ft);
const POWBOX_SVG = o(POWBOX_RAW);  // after margin offset applied
```
All GPS-placed items are positioned relative to this anchor using haversine offsets.

---

## GPS Workflow

### How It Works
1. User stands at the Power Box → app averages 40 GPS readings (~60 sec) → stores as `anchor`
2. User stands at each head/plant → app averages 20 GPS readings (~20 sec)
3. App computes lat/lon delta from anchor → converts to feet using haversine → places item at `anchor.svgX + eastFt * F`

### Haversine Offset
```javascript
function haversineOffset(lat1, lon1, lat2, lon2) {
  const R = 20902231; // Earth radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const latMid = ((lat1 + lat2) / 2) * Math.PI / 180;
  return {
    eastFt: dLon * R * Math.cos(latMid),
    southFt: -dLat * R   // positive = south in SVG
  };
}
```

### GPS Accuracy
- Raw phone GPS: 3–10m typical
- Averaged readings reduce noise
- **Relative accuracy** (offset from anchor) is much better than absolute — atmospheric errors cancel
- Expected: 1–3ft relative accuracy for items surveyed in same session as anchor
- Items marked with orange 📍 dot on map have recorded GPS coordinates

---

## Persistent Storage

The app uses the **Claude artifact storage API** (`window.storage`) for persistence:

```javascript
const STORAGE_KEY = 'lot25-yard-map-v1';

// Save (called automatically after every placement, delete, edit, anchor)
await window.storage.set(STORAGE_KEY, JSON.stringify(data));

// Load (on init)
const result = await window.storage.get(STORAGE_KEY);
```

**Critical:** `window.storage.get()` throws (not returns null) when a key doesn't exist. Always wrap in try/catch with two separate blocks — one for the API call, one for JSON parsing:
```javascript
let result;
try {
  result = await window.storage.get(STORAGE_KEY);
} catch(e) {
  // Key doesn't exist yet — treat as no data
  return;
}
try {
  const data = JSON.parse(result.value);
  // ... restore state
} catch(e) {
  // JSON parse error
}
```

**Also critical:** `prompt()` is **blocked in the Claude artifact iframe**. Use inline DOM inputs instead (see `renameZone()` for the correct pattern). ⚠️ **Known bug:** `addZone()` still calls `prompt()` — adding a custom zone silently fails in the artifact. It needs converting to the inline-input pattern; don't copy it.

---

## Data Model

### Heads (sprinkler heads)
```javascript
{
  id: Number,           // auto-increment
  x: Number,           // SVG x coordinate (px)
  y: Number,           // SVG y coordinate (px)
  zoneId: Number,       // references zones[].id (1-6)
  type: String,         // 'Rotor'|'Fixed Spray'|'Drip'|'MP Rotator'|'Bubbler'
  radius: Number,       // spray radius in feet (shown as dashed circle on map)
  label: String,        // e.g. 'Z1-H3' (Zone 1, Head 3)
  gps: { lat, lon, acc } | null,  // acc = accuracy in meters
  notes: String
}
```

### Plants
```javascript
{
  id: Number,
  x: Number,           // SVG x coordinate
  y: Number,           // SVG y coordinate
  typeId: String,       // references PLANT_TYPES[].id (e.g. 'JML', 'AHY')
  label: String,        // e.g. 'JML-2'
  gps: { lat, lon, acc } | null,
  notes: String
}
```

### Zones
```javascript
{ id: Number, name: String, color: String }  // 6 built-in, user can add more
```

### Anchor
```javascript
{
  lat: Number,
  lon: Number,
  accuracy: Number,   // meters
  svgX: Number,       // always = POWBOX_SVG.x
  svgY: Number        // always = POWBOX_SVG.y
}
```

---

## Plant Types

17 species defined in `PLANT_TYPES` array. Full care data in `data/plant-care.json`. Each type:
```javascript
{
  id: String,      // e.g. 'JML'
  name: String,    // full name
  emoji: String,
  color: String,   // hex color for map rendering
  abbr: String,    // 3-letter abbreviation for labels
  care: String,    // brief care note (shown in right panel)
  warn: String,    // warning (shown in orange box)
  prune: String    // pruning timing
}
```

Plants render as **hexagons** on the map (vs circles for heads). Orange 📍 dot indicates GPS-recorded position.

---

## Irrigation & Sensor Integration

### Rachio (6 zones)
| Zone ID | Default Name | HA Entity |
|---------|-------------|-----------|
| 1 | Front | `switch.rachio_zone_1` |
| 2 | Left Side | `switch.rachio_zone_2` |
| 3 | Right Side | `switch.rachio_zone_3` |
| 4 | Rear Left | `switch.rachio_zone_4` |
| 5 | Rear Right | `switch.rachio_zone_5` |
| 6 | Drip/Garden | `switch.rachio_zone_6` |

*Zone names are user-editable in the app. Verify actual HA entity IDs in Developer Tools → States.*

### Ecowitt WS90
- `sensor.ecowitt_ws90_rain_rate`
- `sensor.ecowitt_ws90_temperature`
- `sensor.ecowitt_ws90_wind_speed`

### THIRDREALITY Soil Moisture Sensors
- Zigbee protocol (Zigbee2MQTT or ZHA)
- Entity pattern: `sensor.soil_moisture_*`
- Planned: front yard (Zone 1) and rear (Zone 4/5)

### Weather Underground
- Also integrated for weather data

---

## Home Assistant Export

The **"⬇ HA"** button generates a `picture-elements` card YAML:
- Background: `/local/lot25-yard.svg` (user must export SVG and place in HA www folder)
- Rachio zone badges positioned at each head's % position in the SVG
- WS90 weather sensor overlays
- Soil moisture sensor overlays

---

## UI Structure

```
header (title + export buttons)
view-bar (🗺 MAP | 📍 SURVEY tabs)

MAP VIEW:
  sidebar (Zones | Plants | List tabs)
  layer-bar (toggle heads/plants/anchor layers + pan/select mode)
  map-container (SVG canvas, zoom controls)
  right-panel (selected item details + GPS anchor info + stats)

SURVEY VIEW:
  Step 1: GPS Anchor (average 40 readings at Power Box)
  Step 2: What to Place (sprinkler head → zone picker | plant → species picker)
  Step 3: Record Position (average 20 readings or manual lat/lon entry)
  Recent Placements log

status-bar (heads count, plants count, anchor status, save status, coordinates)
```

---

## Key Rendering Functions

| Function | Purpose |
|----------|---------|
| `buildMap()` | Draws the base lot SVG (lot boundary, grid, house, dim lines, markers, compass) |
| `renderItems()` | Redraws all heads and plants on top of base map |
| `renderHeads()` | Draws head circles with zone colors and spray radius rings |
| `renderPlants()` | Draws plant hexagons with emoji and species colors |
| `renderAnchor()` | Draws anchor indicator at Power Box |
| `dimL()` | Draws a dimension line with rotated label parallel to the measured edge (defined inside `buildMap`) |

---

## Common Tasks for Claude Code

### Add a new plant species
1. Add entry to `PLANT_TYPES` array in `src/yard-map.html`
2. Add matching entry to `data/plant-care.json`
3. Choose a unique `id` (3-letter abbr), `color` (hex), and `emoji`

### Change the map scale
Change `const F = 4.0` — everything derives from this. SVG_W and SVG_H will auto-resize.

### Add a new sensor overlay to HA export
Find the `exportHA()` function and add a new `state-label` element to the YAML string.

### Fix storage issues
- Always use two try/catch blocks (API call separate from JSON parse)
- `prompt()` is blocked — use inline DOM input pattern from `renameZone()`
- `localStorage` and `sessionStorage` do NOT work in Claude artifacts — use `window.storage` only

### Add a new irrigation zone
Zones are user-addable via the "+ Add Zone" button. Default 6 zones are hardcoded; custom zones are serialized to storage. Zone colors cycle through `ZONE_COLORS` array.

---

## Property Context for HA Automations

### Suggested Automation Logic
1. **Rain skip:** `sensor.ecowitt_ws90_rain_rate > 0.1` OR WU forecast → pause Rachio
2. **Soil gate:** `sensor.soil_moisture_front > 60%` → skip Zone 1
3. **Dogwood drought alert:** no rain 3+ days AND temp > 85°F → notify (dogwood is most drought-sensitive)
4. **Wind hold:** `sensor.ecowitt_ws90_wind_speed > 15mph` → pause active zones
5. **Japanese beetle season:** June 1–July 31 → weekly notification to check Knockout Roses
6. **Rootstock reminder:** April–September → monthly check Japanese Maples for green shoots
7. **Bigleaf Hydrangea guard:** Never allow pruning reminder in fall/winter/spring (blooms on old wood)

### Physical Property Notes
- Backyard is shallow (~23ft) — largely garage + brick patio
- Front yard is ~51ft deep
- Left side yard: 22.67ft wide (driveway side)
- Right side yard: 12.44ft wide (Lot 24 side)
- Dogwood is the most drought-sensitive plant — prioritize in dry spells
- Nandina is invasive in VA and toxic to birds — homeowner aware, considering replacement
- Both Japanese Maples have rootstock issues requiring monthly inspection Apr–Sep
