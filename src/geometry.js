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
