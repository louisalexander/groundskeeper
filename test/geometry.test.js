// test/geometry.test.js
import { describe, it, expect } from 'vitest';
import { bearingVec, move, corners } from '../src/geometry.js';

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
