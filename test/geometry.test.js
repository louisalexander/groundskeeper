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
