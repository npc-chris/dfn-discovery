import { withRetry } from './here-retry';
import { NonRetryableHereError } from './here-retry';
import type { LatLng, MatrixResultEntry } from './here.types';

async function postHere(url: string, body: unknown) {
  return withRetry(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableHereError(`HERE matrix request failed ${res.status}`);
      }
      throw new Error(`Transient HERE matrix error ${res.status}`);
    }
    return res.json();
  });
}

export async function getMatrix(origins: LatLng[], destinations: LatLng[], opts?: { transportMode?: string }): Promise<MatrixResultEntry[]> {
  const hereApi = process.env.HERE_API_KEY;
  if (!hereApi) throw new Error('HERE_API_KEY not configured');

  const transport = opts?.transportMode || 'car';
  const url = `https://matrix.router.hereapi.com/v8/matrix?apikey=${hereApi}`;
  const body = {
    origins: origins.map(o => ({ lat: o.lat, lng: o.lng })),
    destinations: destinations.map(d => ({ lat: d.lat, lng: d.lng })),
    transportMode: transport,
  };

  const data = await postHere(url, body);

  // Normalize to array of entries
  const results: MatrixResultEntry[] = [];
  const matrix = data?.matrix; // provider-specific shape
  if (matrix && Array.isArray(matrix.rows)) {
    matrix.rows.forEach((row: any, i: number) => {
      row.columns.forEach((col: any, j: number) => {
        results.push({ originIndex: i, destinationIndex: j, travelTimeSeconds: col.travelTime, distanceMeters: col.distance });
      });
    });
  }

  return results;
}

export default { getMatrix };
