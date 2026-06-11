/**
 * coordsToMeters.js
 * -----------------
 * Converts an array of WGS84 [longitude, latitude] pairs into
 * local flat-plane [x, y] pairs in metres, relative to the first point.
 *
 * Uses the Equirectangular approximation — accurate for small plots
 * (sub-kilometre), no external library required.
 *
 *   x = (lon - lon0) * cos(lat0_rad) * 111320
 *   y = (lat - lat0) * 111320
 *
 * @param {[number, number][]} points  Array of [longitude, latitude] pairs
 * @returns {[number, number][]}       Array of [x, y] in metres, first point = [0, 0]
 */
export function wgs84ToLocalMeters(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('wgs84ToLocalMeters: need at least 2 [lon, lat] pairs');
  }

  const [lon0, lat0] = points[0];
  const lat0Rad = (lat0 * Math.PI) / 180;
  const cosLat0 = Math.cos(lat0Rad);
  const METERS_PER_DEG = 111320; // metres per degree of latitude

  return points.map(([lon, lat]) => {
    const x = (lon - lon0) * cosLat0 * METERS_PER_DEG;
    const y = (lat - lat0) * METERS_PER_DEG;
    // Round to 2 decimal places (cm precision)
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });
}
