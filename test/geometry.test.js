// test/geometry.test.js
import { describe, it, expect } from 'vitest';
import { bearingVec, move, corners, house, powerBox, arcPoints, frontEdgePoints } from '../src/geometry.js';

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

// append to test/geometry.test.js

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
  it('B is east and slightly north of A (bearing 47.5° NNE → +x, −y)', () => {
    expect(c.B.x).toBeGreaterThan(0);
    expect(c.B.y).toBeLessThan(0);  // 47.5° is NNE → northward = negative y in +y=south space
  });
});

// append to test/geometry.test.js

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

// append to test/geometry.test.js

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
