export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  summary?: unknown;
  polyline?: string;
}

export interface MatrixResultEntry {
  originIndex: number;
  destinationIndex: number;
  travelTimeSeconds?: number;
  distanceMeters?: number;
  status?: string;
}

export interface GeocodeCandidate {
  title: string;
  address: unknown;
  position: { lat: number; lng: number };
  score?: number;
  placeId?: string;
}

export interface IsolineResult {
  polygon?: {
    linestring: [number, number][];
  };
  range?: number;
  rangeType?: 'time' | 'distance';
}
