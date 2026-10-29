import type { IsolineResult } from './google.types';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Generates a geodesic circular polygon around an origin coordinate.
 * Coordinates are returned as [lng, lat] pairs matching GeoJSON / DFN linestring format.
 */
function generateGeodesicCircle(
  origin: { lat: number; lng: number },
  radiusMeters: number,
  points = 32
): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (origin.lat * Math.PI) / 180;
  const lngRad = (origin.lng * Math.PI) / 180;
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;

  for (let i = 0; i <= points; i++) {
    const bearing = (i * 2 * Math.PI) / points;

    const pointLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const pointLngRad =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLatRad)
      );

    const pointLat = (pointLatRad * 180) / Math.PI;
    const pointLng = (pointLngRad * 180) / Math.PI;

    coords.push([
      Math.round(pointLng * 10000) / 10000,
      Math.round(pointLat * 10000) / 10000,
    ]);
  }

  return coords;
}

/**
 * Computes reachability / service-area polygon.
 * For distance: uses exact geodesic circle.
 * For time: converts transit duration to effective distance using Nigerian road freight baselines:
 * - Urban / industrial corridor: ~35 km/h
 * - Long-haul interstate: ~60 km/h
 */
export async function getIsoline(
  origin: { lat: number; lng: number },
  opts: { range: number; rangeType: 'time' | 'distance'; transportMode?: string }
): Promise<IsolineResult> {
  let effectiveRadiusMeters: number;

  if (opts.rangeType === 'distance') {
    // Distance in meters (if < 1000 assume km and convert to meters)
    effectiveRadiusMeters = opts.range > 1000 ? opts.range : opts.range * 1000;
  } else {
    // Time range: if <= 120 assume minutes, if > 120 assume seconds
    const durationSeconds = opts.range <= 120 ? opts.range * 60 : opts.range;
    const durationHours = durationSeconds / 3600;

    // Nigerian freight speed profile: 40 km/h average
    const averageSpeedKmh = opts.transportMode === 'truck' ? 35 : 45;
    effectiveRadiusMeters = durationHours * averageSpeedKmh * 1000;
  }

  const linestring = generateGeodesicCircle(origin, Math.max(1000, effectiveRadiusMeters));

  return {
    polygon: { linestring },
    range: opts.range,
    rangeType: opts.rangeType,
  };
}

export default { getIsoline };
