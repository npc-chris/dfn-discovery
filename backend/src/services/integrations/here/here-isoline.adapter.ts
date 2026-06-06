import { withRetry } from './here-retry';
import { NonRetryableHereError } from './here-retry';
import type { IsolineResult } from './here.types';

async function postHere(url: string, body: unknown) {
  return withRetry(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableHereError(`HERE isoline request failed ${res.status}`);
      }
      throw new Error(`Transient HERE isoline error ${res.status}`);
    }
    return res.json();
  });
}

export async function getIsoline(origin: { lat:number, lng:number }, opts: { range: number, rangeType: 'time'|'distance', transportMode?: string }): Promise<IsolineResult> {
  const hereApi = process.env.HERE_API_KEY;
  if (!hereApi) throw new Error('HERE_API_KEY not configured');

  const url = `https://isoline.router.hereapi.com/v8/isolines?apikey=${hereApi}`;
  const body = {
    origin: { lat: origin.lat, lng: origin.lng },
    range: opts.range,
    rangeType: opts.rangeType,
    transportMode: opts.transportMode || 'car'
  };

  const data = await postHere(url, body);
  const isoline = data?.isolines?.[0];
  return { polygon: isoline?.polygons?.[0], range: opts.range, rangeType: opts.rangeType };
}

export default { getIsoline };
