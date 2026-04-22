/**
 * Pontos modelo para camadas regionais (agências / supervisores / lojas) no mapa.
 * Independentes dos filtros da escada comercial.
 */

export type RegionMapPointKind = 'agencia' | 'supervisor' | 'loja';

export interface RegionMapPoint {
  id: string;
  nome: string;
  /** [lng, lat] */
  lngLat: [number, number];
  /** Apenas legível / debug */
  uf?: string;
  kind: RegionMapPointKind;
}

type GeoJSONPosition = [number, number];

function pointInRing(point: GeoJSONPosition, ring: GeoJSONPosition[]): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(point: GeoJSONPosition, rings: GeoJSONPosition[][]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

function pointInGeometry(point: GeoJSONPosition, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonRings(point, geometry.coordinates as GeoJSONPosition[][]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) =>
      pointInPolygonRings(point, poly as GeoJSONPosition[][])
    );
  }
  return false;
}

/** Filtra pontos: município tem prioridade sobre estado; sem seleção retorna todos. */
export function filterRegionMapPoints<T extends { lngLat: [number, number] }>(
  points: T[],
  municipalityFeature: GeoJSON.Feature | null,
  stateFeature: GeoJSON.Feature | null
): T[] {
  const muniGeom = municipalityFeature?.geometry;
  if (muniGeom) {
    return points.filter((p) => pointInGeometry(p.lngLat, muniGeom as GeoJSON.Geometry));
  }
  const stateGeom = stateFeature?.geometry;
  if (stateGeom) {
    return points.filter((p) => pointInGeometry(p.lngLat, stateGeom as GeoJSON.Geometry));
  }
  return points;
}

export function regionPointsToFeatureCollection(
  points: RegionMapPoint[]
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature' as const,
      properties: {
        id: p.id,
        nome: p.nome,
        kind: p.kind,
        subtitulo:
          p.kind === 'agencia'
            ? 'Agência'
            : p.kind === 'supervisor'
              ? 'Supervisor'
              : 'Loja',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: p.lngLat,
      },
    })),
  };
}

/** Agências modelo — SP, RJ, BA, MG */
export const MOCK_REGION_AGENCIAS: RegionMapPoint[] = [
  { id: 'ra-sp-1', nome: 'Agência Paulista', kind: 'agencia', uf: 'SP', lngLat: [-46.6333, -23.5505] },
  { id: 'ra-sp-2', nome: 'Agência Pinheiros', kind: 'agencia', uf: 'SP', lngLat: [-46.6919, -23.5615] },
  { id: 'ra-sp-3', nome: 'Agência Campinas Centro', kind: 'agencia', uf: 'SP', lngLat: [-47.0618, -22.9056] },
  { id: 'ra-rj-1', nome: 'Agência Copacabana', kind: 'agencia', uf: 'RJ', lngLat: [-43.1822, -22.9711] },
  { id: 'ra-rj-2', nome: 'Agência Niterói', kind: 'agencia', uf: 'RJ', lngLat: [-43.1033, -22.8833] },
  { id: 'ra-ba-1', nome: 'Agência Pelourinho', kind: 'agencia', uf: 'BA', lngLat: [-38.508, -12.9718] },
  { id: 'ra-ba-2', nome: 'Agência Lauro de Freitas', kind: 'agencia', uf: 'BA', lngLat: [-38.321, -12.8978] },
  { id: 'ra-mg-1', nome: 'Agência Savassi', kind: 'agencia', uf: 'MG', lngLat: [-43.937, -19.934] },
  { id: 'ra-mg-2', nome: 'Agência Uberlândia', kind: 'agencia', uf: 'MG', lngLat: [-48.2772, -18.9186] },
];

export const MOCK_REGION_SUPERVISORES: RegionMapPoint[] = [
  { id: 'rs-sp-1', nome: 'Supervisão — Centro SP', kind: 'supervisor', uf: 'SP', lngLat: [-46.641, -23.548] },
  { id: 'rs-sp-2', nome: 'Supervisão — Zona Sul SP', kind: 'supervisor', uf: 'SP', lngLat: [-46.672, -23.62] },
  { id: 'rs-sp-3', nome: 'Supervisão — Campinas', kind: 'supervisor', uf: 'SP', lngLat: [-47.058, -22.89] },
  { id: 'rs-rj-1', nome: 'Supervisão — Zona Norte RJ', kind: 'supervisor', uf: 'RJ', lngLat: [-43.25, -22.87] },
  { id: 'rs-rj-2', nome: 'Supervisão — Baixada', kind: 'supervisor', uf: 'RJ', lngLat: [-43.1, -22.82] },
  { id: 'rs-ba-1', nome: 'Supervisão — Salvador', kind: 'supervisor', uf: 'BA', lngLat: [-38.49, -12.99] },
  { id: 'rs-ba-2', nome: 'Supervisão — Camaçari', kind: 'supervisor', uf: 'BA', lngLat: [-38.324, -12.698] },
  { id: 'rs-mg-1', nome: 'Supervisão — BH Centro', kind: 'supervisor', uf: 'MG', lngLat: [-43.938, -19.92] },
];

export const MOCK_REGION_LOJAS: RegionMapPoint[] = [
  { id: 'rl-sp-1', nome: 'Loja Higienópolis', kind: 'loja', uf: 'SP', lngLat: [-46.655, -23.541] },
  { id: 'rl-sp-2', nome: 'Loja Moema', kind: 'loja', uf: 'SP', lngLat: [-46.662, -23.603] },
  { id: 'rl-sp-3', nome: 'Loja Campinas Shopping', kind: 'loja', uf: 'SP', lngLat: [-47.048, -22.905] },
  { id: 'rl-rj-1', nome: 'Loja Barra', kind: 'loja', uf: 'RJ', lngLat: [-43.365, -23.006] },
  { id: 'rl-rj-2', nome: 'Loja Tijuca', kind: 'loja', uf: 'RJ', lngLat: [-43.233, -22.924] },
  { id: 'rl-ba-1', nome: 'Loja Paralela', kind: 'loja', uf: 'BA', lngLat: [-38.456, -12.983] },
  { id: 'rl-ba-2', nome: 'Loja Feira de Santana', kind: 'loja', uf: 'BA', lngLat: [-38.966, -12.266] },
  { id: 'rl-mg-1', nome: 'Loja Pampulha', kind: 'loja', uf: 'MG', lngLat: [-43.993, -19.856] },
  { id: 'rl-mg-2', nome: 'Loja Juiz de Fora', kind: 'loja', uf: 'MG', lngLat: [-43.35, -21.76] },
];
