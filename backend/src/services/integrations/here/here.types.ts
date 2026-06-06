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
}

export interface GeocodeCandidate {
  title: string;
  address: unknown;
  position: { lat: number; lng: number };
  score?: number;
}

export interface IsolineResult {
  polygon?: unknown;
  range?: number;
  rangeType?: 'time' | 'distance';
}
