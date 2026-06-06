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
