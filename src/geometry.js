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

// append to src/geometry.js

// Decimal degrees for a DMS bearing, e.g. dms(69,22,51) → 69.380833…
export function dms(d, m = 0, s = 0) {
  return d + m / 60 + s / 3600;
}

// Lot corners in feet relative to NW corner A (origin). Derived from the
// certified survey traverse bearings/distances.
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
