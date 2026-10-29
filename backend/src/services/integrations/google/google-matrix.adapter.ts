import { withRetry, NonRetryableGoogleError } from './google-retry';
import { parseDurationSeconds } from './google-routing.adapter';
import type { LatLng, MatrixResultEntry } from './google.types';

async function postGoogleMatrix(url: string, body: unknown, apiKey: string) {
  return withRetry(async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableGoogleError(`Google matrix request failed ${res.status}`);
      }
      throw new Error(`Transient Google matrix error ${res.status}`);
    }

    return res.json();
  });
}

export async function getMatrix(
  origins: LatLng[],
  destinations: LatLng[],
  _opts?: { transportMode?: string }
): Promise<MatrixResultEntry[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const url = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

  const body = {
    origins: origins.map((o) => ({
      waypoint: {
        location: {
          latLng: {
            latitude: o.lat,
            longitude: o.lng,
          },
        },
      },
    })),
    destinations: destinations.map((d) => ({
      waypoint: {
        location: {
          latLng: {
            latitude: d.lat,
            longitude: d.lng,
          },
        },
      },
    })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
  };

  const data = await postGoogleMatrix(url, body, apiKey);

  const results: MatrixResultEntry[] = [];
  const entries = Array.isArray(data) ? data : data?.matrix || [];

  for (const entry of entries) {
    results.push({
      originIndex: typeof entry.originIndex === 'number' ? entry.originIndex : 0,
      destinationIndex: typeof entry.destinationIndex === 'number' ? entry.destinationIndex : 0,
      travelTimeSeconds: parseDurationSeconds(entry.duration),
      distanceMeters: typeof entry.distanceMeters === 'number' ? entry.distanceMeters : 0,
      status: entry.status?.code ? String(entry.status.code) : 'OK',
    });
  }

  return results;
}

export default { getMatrix };
