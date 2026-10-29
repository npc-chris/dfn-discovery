import { withRetry, NonRetryableGoogleError } from './google-retry';
import type { GeocodeCandidate } from './google.types';

async function fetchGoogleGeocode(url: string) {
  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableGoogleError(`Google geocode request failed ${res.status}`);
      }
      throw new Error(`Transient Google geocode error ${res.status}`);
    }
    const data = await res.json();
    if (data?.status === 'REQUEST_DENIED' || data?.status === 'INVALID_REQUEST') {
      throw new NonRetryableGoogleError(`Google geocode error: ${data.status} - ${data.error_message || ''}`);
    }
    return data;
  });
}

export async function search(
  query: string,
  opts?: { limit?: number; country?: string }
): Promise<GeocodeCandidate[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const limit = opts?.limit ?? 5;
  const country = opts?.country ?? 'NG';
  const components = country ? `&components=country:${encodeURIComponent(country)}` : '';
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}${components}&key=${apiKey}`;

  const data = await fetchGoogleGeocode(url);
  const items = data?.results || [];

  return items.slice(0, limit).map((it: any) => ({
    title: it.formatted_address || '',
    address: it.address_components || [],
    position: {
      lat: it.geometry?.location?.lat ?? 0,
      lng: it.geometry?.location?.lng ?? 0,
    },
    score: 1.0,
    placeId: it.place_id,
  }));
}

export async function reverse(lat: number, lng: number): Promise<GeocodeCandidate | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  const data = await fetchGoogleGeocode(url);
  const item = data?.results?.[0];

  if (!item) return null;

  return {
    title: item.formatted_address || '',
    address: item.address_components || [],
    position: {
      lat: item.geometry?.location?.lat ?? lat,
      lng: item.geometry?.location?.lng ?? lng,
    },
    score: 1.0,
    placeId: item.place_id,
  };
}

export default { search, reverse };
