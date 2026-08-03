import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

/** Retângulo mundial alinhado ao recorte usado no mapa (Web Mercator). */
const WORLD_RING: Position[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

const cachedOutsideMasks = new WeakMap<GeoJSON.Feature, GeoJSON.Feature<MultiPolygon>>();

function signedRingArea(ring: Position[]): number {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return twiceArea / 2;
}

function orientedRing(ring: Position[], clockwise: boolean): Position[] {
  const isClockwise = signedRingArea(ring) < 0;
  return isClockwise === clockwise ? ring : [...ring].reverse();
}

function polygonCoordinates(
  geometry: Polygon | MultiPolygon
): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/**
 * Área preenchida fora do Brasil: mundo com cada massa terrestre como vazio.
 *
 * A malha já está dissolvida e não possui polígonos sobrepostos; portanto não
 * precisamos executar `difference`/polygon-clipping na abertura do mapa. Os
 * anéis externos do Brasil viram buracos do mundo e eventuais anéis internos
 * (lagos) continuam mascarados como polígonos independentes.
 */
export function buildOutsideBrazilMaskFeature(
  brazil: GeoJSON.Feature
): GeoJSON.Feature<MultiPolygon> {
  const cached = cachedOutsideMasks.get(brazil);
  if (cached) return cached;

  if (brazil.geometry?.type !== 'Polygon' && brazil.geometry?.type !== 'MultiPolygon') {
    const fallback: GeoJSON.Feature<MultiPolygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [[[...WORLD_RING]]] },
    };
    cachedOutsideMasks.set(brazil, fallback);
    return fallback;
  }

  const countryHoles: Position[][] = [];
  const maskedInnerRings: Position[][][] = [];

  for (const polygon of polygonCoordinates(brazil.geometry)) {
    const [outerRing, ...innerRings] = polygon;
    if (!outerRing) continue;
    countryHoles.push(orientedRing(outerRing, true));
    for (const innerRing of innerRings) {
      maskedInnerRings.push([orientedRing(innerRing, false)]);
    }
  }

  const mask: GeoJSON.Feature<MultiPolygon> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[...WORLD_RING], ...countryHoles],
        ...maskedInnerRings,
      ],
    },
  };

  cachedOutsideMasks.set(brazil, mask);
  return mask;
}
