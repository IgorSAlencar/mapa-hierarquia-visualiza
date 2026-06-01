import bboxPolygon from '@turf/bbox-polygon';
import difference from '@turf/difference';
import rewind from '@turf/rewind';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/** Retângulo mundial alinhado ao recorte usado no mapa (Web Mercator). */
const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

let cachedOutsideMask: GeoJSON.Feature<Polygon | MultiPolygon> | null = null;

/**
 * Área preenchida fora do Brasil: `mundo − geometria do país`.
 * Evita um único polígono com dezenas de buracos (artefatos de triangulação no Mapbox).
 */
export function buildOutsideBrazilMaskFeature(
  brazil: GeoJSON.Feature
): GeoJSON.Feature<Polygon | MultiPolygon> {
  if (cachedOutsideMask) return cachedOutsideMask;

  const world = bboxPolygon(WORLD_BBOX);
  const br = rewind(brazil, { reverse: false }) as Feature<Polygon | MultiPolygon>;

  const clipped = difference({
    type: 'FeatureCollection',
    features: [world, br],
  } satisfies FeatureCollection<Polygon | MultiPolygon>);

  cachedOutsideMask = clipped?.geometry
    ? { type: 'Feature', properties: {}, geometry: clipped.geometry }
    : { type: 'Feature', properties: {}, geometry: world.geometry };

  return cachedOutsideMask;
}
