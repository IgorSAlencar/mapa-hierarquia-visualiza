import { MAPBOX_CONFIG } from '@/lib/mapbox-config';

/**
 * Busca na Mapbox Directions API o trajeto de carro passando por todas as
 * paradas, devolvendo a geometria que acompanha as ruas.
 *
 * Resultados ficam em cache por chave (id do roteiro), pois o trajeto do dia
 * não muda durante a sessão. Em caso de falha, retorna null e o chamador
 * mantém a linha reta como fallback.
 */

type LngLat = [number, number];

const geometryCache = new Map<string, LngLat[]>();
const pendingRequests = new Map<string, Promise<LngLat[] | null>>();

/** Roteiros sem rota de carro possível — mantém linha reta sem tentar de novo. */
const failedKeys = new Set<string>();

// A Directions API aceita no máximo 25 coordenadas por requisição.
const MAX_WAYPOINTS = 25;

async function requestDirections(coordinates: LngLat[]): Promise<LngLat[] | null> {
  const coordsParam = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_CONFIG.accessToken}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as {
    routes?: { geometry?: { coordinates?: LngLat[] } }[];
  };
  const geometry = data.routes?.[0]?.geometry?.coordinates;
  return Array.isArray(geometry) && geometry.length >= 2 ? geometry : null;
}

/** Consulta síncrona ao cache — permite redesenhar sem refazer a requisição. */
export function getCachedDrivingGeometry(cacheKey: string): LngLat[] | null {
  return geometryCache.get(cacheKey) ?? null;
}

export async function fetchDrivingGeometry(
  cacheKey: string,
  coordinates: LngLat[]
): Promise<LngLat[] | null> {
  if (coordinates.length < 2 || coordinates.length > MAX_WAYPOINTS) return null;
  if (failedKeys.has(cacheKey)) return null;

  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const request = requestDirections(coordinates)
    .then((geometry) => {
      if (geometry) geometryCache.set(cacheKey, geometry);
      else failedKeys.add(cacheKey);
      return geometry;
    })
    .catch(() => {
      failedKeys.add(cacheKey);
      return null;
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, request);
  return request;
}
