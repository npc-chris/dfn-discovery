import { withRetry } from './here-retry';
import { NonRetryableHereError } from './here-retry';
import type { LatLng, RouteResult } from './here.types';

async function fetchHere(url: string) {
  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableHereError(`HERE request failed ${res.status}`);
      }
      throw new Error(`Transient HERE error ${res.status}`);
    }
    return res.json();
  });
}

export async function getRoute(origin: LatLng, destination: LatLng, opts?: { transportMode?: string, departureTime?: string }): Promise<RouteResult> {
  const hereApi = process.env.HERE_API_KEY;
  if (!hereApi) throw new Error('HERE_API_KEY not configured');

  const transport = opts?.transportMode || 'truck';
  const dep = opts?.departureTime ? `&departureTime=${encodeURIComponent(opts.departureTime)}` : '';
  const url = `https://router.hereapi.com/v8/routes?transportMode=${encodeURIComponent(transport)}&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&return=summary,polyline${dep}&apikey=${hereApi}`;

  const data = await fetchHere(url);

  const route = data?.routes?.[0];
  const section = route?.sections?.[0];
  const summary = section?.summary;

  return {
    distanceMeters: typeof summary?.length === 'number' ? summary.length : 0,
    durationSeconds: typeof summary?.duration === 'number' ? summary.duration : 0,
    summary: summary,
    polyline: route?.sections?.map((s: any) => s?.polyline).filter(Boolean).join('|') || undefined,
  };
}

export default { getRoute };
