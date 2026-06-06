import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoute } from './here-routing.adapter';
import { getMatrix } from './here-matrix.adapter';
import { search, reverse } from './here-geocode.adapter';
import { getIsoline } from './here-isoline.adapter';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HERE_API_KEY = 'test-here-key';
  vi.stubGlobal('fetch', fetchMock);
});

describe('HERE adapters', () => {
  it('normalizes routing responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [
          {
            sections: [
              { summary: { length: 12345, duration: 678 }, polyline: 'abc123' },
            ],
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
      summary: { length: 12345, duration: 678 },
      polyline: 'abc123',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('router.hereapi.com/v8/routes'),
    );
  });

  it('surfaces routing errors for client failures', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });

    await expect(
      getRoute({ lat: 6.52, lng: 3.38 }, { lat: 7.12, lng: 3.42 })
    ).rejects.toThrow('HERE request failed 400');
  });

  it('flattens matrix results for multiple candidates', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        matrix: {
          rows: [
            { columns: [{ travelTime: 11, distance: 22 }, { travelTime: 33, distance: 44 }] },
            { columns: [{ travelTime: 55, distance: 66 }, { travelTime: 77, distance: 88 }] },
          ],
        },
      }),
    });

    const result = await getMatrix(
      [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }],
      [{ lat: 5, lng: 6 }, { lat: 7, lng: 8 }],
      { transportMode: 'car' }
    );

    expect(result).toEqual([
      { originIndex: 0, destinationIndex: 0, travelTimeSeconds: 11, distanceMeters: 22 },
      { originIndex: 0, destinationIndex: 1, travelTimeSeconds: 33, distanceMeters: 44 },
      { originIndex: 1, destinationIndex: 0, travelTimeSeconds: 55, distanceMeters: 66 },
      { originIndex: 1, destinationIndex: 1, travelTimeSeconds: 77, distanceMeters: 88 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('matrix.router.hereapi.com/v8/matrix'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('normalizes geocode search and reverse responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            title: 'Lagos, Nigeria',
            address: { city: 'Lagos', countryCode: 'NGA' },
            position: { lat: 6.5244, lng: 3.3792 },
            score: 0.94,
          },
        ],
      }),
    });

    const candidates = await search('Lagos', { limit: 1, country: 'NGA' });
    expect(candidates).toEqual([
      {
        title: 'Lagos, Nigeria',
        address: { city: 'Lagos', countryCode: 'NGA' },
        position: { lat: 6.5244, lng: 3.3792 },
        score: 0.94,
      },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            title: 'Abuja, Nigeria',
            address: { city: 'Abuja', countryCode: 'NGA' },
            position: { lat: 9.0765, lng: 7.3986 },
            scoring: { queryScore: 0.81 },
          },
        ],
      }),
    });

    const candidate = await reverse(9.0765, 7.3986);
    expect(candidate).toEqual({
      title: 'Abuja, Nigeria',
      address: { city: 'Abuja', countryCode: 'NGA' },
      position: { lat: 9.0765, lng: 7.3986 },
      score: 0.81,
    });
  });

  it('normalizes isoline responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isolines: [
          {
            polygons: [{ linestring: [[3.1, 6.1], [3.2, 6.2]] }],
          },
        ],
      }),
    });

    const result = await getIsoline(
      { lat: 6.1, lng: 3.1 },
      { range: 30, rangeType: 'time', transportMode: 'truck' }
    );

    expect(result).toEqual({
      polygon: { linestring: [[3.1, 6.1], [3.2, 6.2]] },
      range: 30,
      rangeType: 'time',
    });
  });
});
