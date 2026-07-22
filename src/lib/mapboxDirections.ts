import { MAPBOX_CONFIG } from '@/lib/mapbox-config';

/**
 * Busca na Mapbox Directions API o trajeto de carro passando por todas as
 * paradas. A mesma resposta alimenta a geometria, a distância e a duração.
 */

type LngLat = [number, number];

export type TravelMode = 'driving' | 'walking';

export interface TravelRouteResult {
  geometry: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
  legDurationsSeconds: number[];
}

export type DrivingRouteResult = TravelRouteResult;

const routeCache = new Map<string, TravelRouteResult>();
const pendingRequests = new Map<string, Promise<TravelRouteResult | null>>();

/** Roteiros sem rota de carro possível — não tenta a mesma chave novamente. */
const failedKeys = new Set<string>();

// A Directions API aceita no máximo 25 coordenadas por requisição.
const MAX_WAYPOINTS = 25;

async function requestDirectionsSegment(
  coordinates: LngLat[],
  mode: TravelMode
): Promise<TravelRouteResult | null> {
  const coordsParam = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coordsParam}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_CONFIG.accessToken}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as {
    routes?: Array<{
      geometry?: { coordinates?: LngLat[] };
      distance?: number;
      duration?: number;
      legs?: Array<{ duration?: number }>;
    }>;
  };
  const route = data.routes?.[0];
  const geometry = route?.geometry?.coordinates;
  if (!Array.isArray(geometry) || geometry.length < 2) return null;

  return {
    geometry,
    distanceMeters: Number(route?.distance) || 0,
    durationSeconds: Number(route?.duration) || 0,
    legDurationsSeconds: route?.legs?.map((leg) => Number(leg.duration) || 0) ?? [],
  };
}

function splitIntoDirectionsSegments(coordinates: LngLat[]): LngLat[][] {
  if (coordinates.length <= MAX_WAYPOINTS) return [coordinates];
  const segments: LngLat[][] = [];
  let start = 0;
  while (start < coordinates.length - 1) {
    const end = Math.min(start + MAX_WAYPOINTS - 1, coordinates.length - 1);
    segments.push(coordinates.slice(start, end + 1));
    start = end;
  }
  return segments;
}

async function requestDirections(
  coordinates: LngLat[],
  mode: TravelMode
): Promise<TravelRouteResult | null> {
  const results = await Promise.all(
    splitIntoDirectionsSegments(coordinates).map((segment) => requestDirectionsSegment(segment, mode))
  );
  if (results.some((result) => result == null)) return null;

  return (results as TravelRouteResult[]).reduce<TravelRouteResult>((combined, result, index) => ({
    geometry: [...combined.geometry, ...(index === 0 ? result.geometry : result.geometry.slice(1))],
    distanceMeters: combined.distanceMeters + result.distanceMeters,
    durationSeconds: combined.durationSeconds + result.durationSeconds,
    legDurationsSeconds: [...combined.legDurationsSeconds, ...result.legDurationsSeconds],
  }), {
    geometry: [],
    distanceMeters: 0,
    durationSeconds: 0,
    legDurationsSeconds: [],
  });
}

/** Consulta síncrona ao cache — permite redesenhar sem refazer a requisição. */
export function getCachedDrivingGeometry(cacheKey: string): LngLat[] | null {
  return routeCache.get(cacheKey)?.geometry ?? null;
}

export async function fetchDrivingRoute(
  cacheKey: string,
  coordinates: LngLat[]
): Promise<TravelRouteResult | null> {
  return fetchTravelRoute(cacheKey, coordinates, 'driving');
}

export async function fetchTravelRoute(
  cacheKey: string,
  coordinates: LngLat[],
  mode: TravelMode
): Promise<TravelRouteResult | null> {
  if (coordinates.length < 2) return null;
  const effectiveCacheKey = mode === 'driving' ? cacheKey : `${mode}:${cacheKey}`;
  if (failedKeys.has(effectiveCacheKey)) return null;

  const cached = routeCache.get(effectiveCacheKey);
  if (cached) return cached;

  const pending = pendingRequests.get(effectiveCacheKey);
  if (pending) return pending;

  const request = requestDirections(coordinates, mode)
    .then((route) => {
      if (route) routeCache.set(effectiveCacheKey, route);
      else failedKeys.add(effectiveCacheKey);
      return route;
    })
    .catch(() => {
      failedKeys.add(effectiveCacheKey);
      return null;
    })
    .finally(() => {
      pendingRequests.delete(effectiveCacheKey);
    });

  pendingRequests.set(effectiveCacheKey, request);
  return request;
}

export async function fetchDrivingGeometry(
  cacheKey: string,
  coordinates: LngLat[]
): Promise<LngLat[] | null> {
  return (await fetchDrivingRoute(cacheKey, coordinates))?.geometry ?? null;
}
