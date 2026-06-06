// test/georef.test.js
import { describe, it, expect } from 'vitest';
import { localToLatLon, latLonToLocal } from '../src/georef.js';

const close = (a, b, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);
const CAL = { lat0: 37.6500000, lon0: -77.5500000, theta: 0 };

describe('localToLatLon', () => {
  it('maps the origin to (lat0, lon0)', () => {
    const p = localToLatLon({ x: 0, y: 0 }, CAL);
    close(p.lat, CAL.lat0); close(p.lon, CAL.lon0);
  });
  it('100 ft north of origin raises latitude by 100/364000 deg', () => {
    // 100 ft north = y (south) of −100
    const p = localToLatLon({ x: 0, y: -100 }, CAL);
    close(p.lat, CAL.lat0 + 100 / 364000, 1e-9);
    close(p.lon, CAL.lon0, 1e-9);
  });
  it('100 ft east of origin raises longitude (scaled by cos lat)', () => {
    const p = localToLatLon({ x: 100, y: 0 }, CAL);
    const expected = CAL.lon0 + 100 / (364000 * Math.cos((CAL.lat0 * Math.PI) / 180));
    close(p.lon, expected, 1e-9);
    close(p.lat, CAL.lat0, 1e-9);
  });
});

describe('round-trip', () => {
  it('latLonToLocal(localToLatLon(p)) === p for theta=0', () => {
    const p = { x: 42.5, y: -88.25 };
    const ll = localToLatLon(p, CAL);
    const back = latLonToLocal(ll, CAL);
    close(back.x, p.x, 1e-6); close(back.y, p.y, 1e-6);
  });
  it('round-trips with a nonzero rotation theta', () => {
    const cal = { lat0: 37.65, lon0: -77.55, theta: 0.05 };
    const p = { x: 30, y: -120 };
    const back = latLonToLocal(localToLatLon(p, cal), cal);
    close(back.x, p.x, 1e-6); close(back.y, p.y, 1e-6);
  });
  it('maps (lat0, lon0) back to the origin', () => {
    const p = latLonToLocal({ lat: CAL.lat0, lon: CAL.lon0 }, CAL);
    close(p.x, 0); close(p.y, 0);
  });
});
