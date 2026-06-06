// src/georef.js
// Survey-feet ↔ WGS84 lat/lon transform.
// Local point: {x = ft east of A, y = ft south of A}. Calibration: {lat0, lon0, theta(rad)}.

// feet per degree of LATITUDE (≈364,000 at ~37.7°N). Longitude degrees are
// shorter by cos(lat) — applied in the transform functions below, not here.
export const FT_PER_DEG_LAT = 364000;

// {x,y} feet → {lat, lon}
export function localToLatLon(pt, cal) {
  const { lat0, lon0, theta } = cal;
  const lat0Rad = (lat0 * Math.PI) / 180;
  const northFt = -pt.y;
  const e = pt.x * Math.cos(theta) - northFt * Math.sin(theta);
  const n = pt.x * Math.sin(theta) + northFt * Math.cos(theta);
  const lat = lat0 + n / FT_PER_DEG_LAT;
  const lon = lon0 + e / (FT_PER_DEG_LAT * Math.cos(lat0Rad));
  return { lat, lon };
}

// {lat, lon} → {x,y} feet (inverse of localToLatLon)
export function latLonToLocal(ll, cal) {
  const { lat0, lon0, theta } = cal;
  const lat0Rad = (lat0 * Math.PI) / 180;
  const n = (ll.lat - lat0) * FT_PER_DEG_LAT;
  const e = (ll.lon - lon0) * FT_PER_DEG_LAT * Math.cos(lat0Rad);
  // invert rotation
  const x = e * Math.cos(theta) + n * Math.sin(theta);
  const northFt = -e * Math.sin(theta) + n * Math.cos(theta);
  return { x, y: -northFt };
}
