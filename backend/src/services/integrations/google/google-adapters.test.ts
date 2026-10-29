import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoute } from './google-routing.adapter';
import { getMatrix } from './google-matrix.adapter';
import { search, reverse } from './google-geocode.adapter';
import { getIsoline } from './google-isoline.adapter';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
  vi.stubGlobal('fetch', fetchMock);
});

describe('Google Maps Platform adapters', () => {
  describe('Routing Adapter (Routes API v2)', () => {
    it('normalizes Google Routes API v2 responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          routes: [
            {
              distanceMeters: 12345,
              duration: '678s',
              description: 'Fastest route via Lagos-Ibadan Expy',
              polyline: { encodedPolyline: 'abc123polyline' },
            },
          ],
        }),
      });

      const result = await getRoute(
        { lat: 6.52, lng: 3.38 },
        { lat: 7.12, lng: 3.42 },
        { transportMode: 'truck' }
      );

      expect(result).toEqual({
        distanceMeters: 12345,
        durationSeconds: 678,
        summary: {
          length: 12345,
          duration: 678,
          description: 'Fastest route via Lagos-Ibadan Expy',
        },
        polyline: 'abc123polyline',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-google-key',
            'X-Goog-FieldMask': expect.stringContaining('routes.duration,routes.distanceMeters'),
          }),
        })
      );
    });

    it('surfaces non-retryable error on client failure (400)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });

      await expect(
        getRoute({ lat: 6.52, lng: 3.38 }, { lat: 7.12, lng: 3.42 })
      ).rejects.toThrow('Google route request failed 400');
    });

    it('throws when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      await expect(
        getRoute({ lat: 6.52, lng: 3.38 }, { lat: 7.12, lng: 3.42 })
      ).rejects.toThrow('GOOGLE_MAPS_API_KEY not configured');
    });
  });

  describe('Matrix Adapter (Routes Matrix API v2)', () => {
    it('normalizes matrix entries from Google Routes Matrix API', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { originIndex: 0, destinationIndex: 0, duration: '11s', distanceMeters: 22, status: {} },
          { originIndex: 0, destinationIndex: 1, duration: '33s', distanceMeters: 44, status: {} },
          { originIndex: 1, destinationIndex: 0, duration: '55s', distanceMeters: 66, status: {} },
          { originIndex: 1, destinationIndex: 1, duration: '77s', distanceMeters: 88, status: {} },
        ],
      });

      const result = await getMatrix(
        [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }],
        [{ lat: 5, lng: 6 }, { lat: 7, lng: 8 }],
        { transportMode: 'car' }
      );

      expect(result).toEqual([
        { originIndex: 0, destinationIndex: 0, travelTimeSeconds: 11, distanceMeters: 22, status: 'OK' },
        { originIndex: 0, destinationIndex: 1, travelTimeSeconds: 33, distanceMeters: 44, status: 'OK' },
        { originIndex: 1, destinationIndex: 0, travelTimeSeconds: 55, distanceMeters: 66, status: 'OK' },
        { originIndex: 1, destinationIndex: 1, travelTimeSeconds: 77, distanceMeters: 88, status: 'OK' },
      ]);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-google-key',
          }),
        })
      );
    });
  });

  describe('Geocoding Adapter (Google Geocoding API)', () => {
    it('normalizes forward geocode search with Nigeria biasing', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: 'Ikeja, Lagos, Nigeria',
              address_components: [
                { long_name: 'Ikeja', short_name: 'Ikeja', types: ['locality'] },
                { long_name: 'Lagos', short_name: 'LA', types: ['administrative_area_level_1'] },
                { long_name: 'Nigeria', short_name: 'NG', types: ['country'] },
              ],
              geometry: {
                location: { lat: 6.6018, lng: 3.3515 },
              },
              place_id: 'ChIJ-abc123',
            },
          ],
          status: 'OK',
        }),
      });

      const candidates = await search('Ikeja Industrial Estate', { limit: 1, country: 'NG' });

      expect(candidates).toEqual([
        {
          title: 'Ikeja, Lagos, Nigeria',
          address: expect.any(Array),
          position: { lat: 6.6018, lng: 3.3515 },
          score: 1.0,
          placeId: 'ChIJ-abc123',
        },
      ]);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('country:NG')
      );
    });

    it('normalizes reverse geocode responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: 'Abuja Municipal, FCT, Nigeria',
              address_components: [],
              geometry: {
                location: { lat: 9.0765, lng: 7.3986 },
              },
              place_id: 'ChIJ-abuja123',
            },
          ],
          status: 'OK',
        }),
      });

      const candidate = await reverse(9.0765, 7.3986);

      expect(candidate).toEqual({
        title: 'Abuja Municipal, FCT, Nigeria',
        address: [],
        position: { lat: 9.0765, lng: 7.3986 },
        score: 1.0,
        placeId: 'ChIJ-abuja123',
      });
    });
  });

  describe('Isoline & Reachability Adapter', () => {
    it('generates geodesic boundary polygon for distance range', async () => {
      const result = await getIsoline(
        { lat: 6.5244, lng: 3.3792 },
        { range: 50, rangeType: 'distance' }
      );

      expect(result.range).toBe(50);
      expect(result.rangeType).toBe('distance');
      expect(result.polygon?.linestring).toBeDefined();
      expect(result.polygon!.linestring.length).toBeGreaterThan(10);
      // Verify coordinates are pairs of [lng, lat]
      const [lng, lat] = result.polygon!.linestring[0];
      expect(typeof lng).toBe('number');
      expect(typeof lat).toBe('number');
    });

    it('generates speed-calibrated boundary polygon for time range', async () => {
      const result = await getIsoline(
        { lat: 6.5244, lng: 3.3792 },
        { range: 60, rangeType: 'time', transportMode: 'truck' }
      );

      expect(result.range).toBe(60);
      expect(result.rangeType).toBe('time');
      expect(result.polygon?.linestring).toBeDefined();
      expect(result.polygon!.linestring.length).toBe(33); // 32 points + closing point
    });
  });
});
