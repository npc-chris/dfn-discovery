import { withRetry } from './here-retry';
import { NonRetryableHereError } from './here-retry';
import type { GeocodeCandidate } from './here.types';

async function fetchHere(url: string) {
  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableHereError(`HERE geocode request failed ${res.status}`);
      }
      throw new Error(`Transient HERE geocode error ${res.status}`);
    }
    return res.json();
  });
}

export async function search(query: string, opts?: { limit?: number, country?: string }): Promise<GeocodeCandidate[]> {
  const hereApi = process.env.HERE_API_KEY;
  if (!hereApi) throw new Error('HERE_API_KEY not configured');
  const limit = opts?.limit ?? 5;
  const country = opts?.country ? `&inCountry=${encodeURIComponent(opts.country)}` : '';
  const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(query)}&limit=${limit}${country}&apikey=${hereApi}`;
  const data = await fetchHere(url);
  const items = data?.items || [];
  return items.map((it: any) => ({ title: it.title, address: it.address, position: { lat: it.position.lat, lng: it.position.lng }, score: it.score }));
}

export async function reverse(lat: number, lng: number): Promise<GeocodeCandidate | null> {
  const hereApi = process.env.HERE_API_KEY;
  if (!hereApi) throw new Error('HERE_API_KEY not configured');
  const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apikey=${hereApi}`;
  const data = await fetchHere(url);
  const item = data?.items?.[0];
  if (!item) return null;
  return { title: item.title, address: item.address, position: { lat: item.position.lat, lng: item.position.lng }, score: item.scoring?.queryScore };
}

export default { search, reverse };
