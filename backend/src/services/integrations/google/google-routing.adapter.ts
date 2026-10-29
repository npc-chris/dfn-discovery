import { withRetry, NonRetryableGoogleError } from './google-retry';
import type { LatLng, RouteResult } from './google.types';

export function parseDurationSeconds(duration: unknown): number {
  if (typeof duration === 'number') {
    return Math.round(duration);
  }
  if (typeof duration === 'string') {
    const numericPart = parseFloat(duration.replace('s', ''));
    return Number.isFinite(numericPart) ? Math.round(numericPart) : 0;
  }
  return 0;
}

async function postGoogleRoutes(url: string, body: unknown, apiKey: string) {
  return withRetry(async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableGoogleError(`Google route request failed ${res.status}`);
      }
      throw new Error(`Transient Google route error ${res.status}`);
    }

    return res.json();
  });
}

export async function getRoute(
  origin: LatLng,
  destination: LatLng,
  opts?: { transportMode?: string; departureTime?: string; avoidTolls?: boolean }
): Promise<RouteResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: origin.lat,
          longitude: origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: destination.lat,
          longitude: destination.lng,
        },
      },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
  };

  if (opts?.departureTime) {
    body.departureTime = opts.departureTime;
  }

  if (opts?.avoidTolls) {
    body.routeModifiers = {
      avoidTolls: true,
    };
  }

  const data = await postGoogleRoutes(url, body, apiKey);
  const route = data?.routes?.[0];

  const distanceMeters = typeof route?.distanceMeters === 'number' ? route.distanceMeters : 0;
  const durationSeconds = parseDurationSeconds(route?.duration);

  return {
    distanceMeters,
    durationSeconds,
    summary: {
      length: distanceMeters,
      duration: durationSeconds,
      description: route?.description,
    },
    polyline: route?.polyline?.encodedPolyline || undefined,
  };
}

export default { getRoute, parseDurationSeconds };
