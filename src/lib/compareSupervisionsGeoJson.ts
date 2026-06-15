import type mapboxgl from 'mapbox-gl';
import type { SqlHierarchyFilter } from '@/data/commercialStructureMock';
import type { SqlMapPoint } from '@/lib/mapDataApi';
import { fetchSupervisoes } from '@/lib/commercialStructureApi';
import { loadSupervisionAreas } from '@/lib/supervisionAreas';
import { COMMERCIAL_TEAM_LEVEL_LABEL } from '@/data/regionMapPointsMock';

export interface CompareSupervisionItem {
  chaveSupervisao: number;
  nome: string;
  color: string;
}

const COMPARE_SUPERVISION_PALETTE: readonly string[] = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#0d9488',
  '#9333ea',
  '#475569',
  '#b91c1c',
  '#15803d',
  '#a16207',
  '#1d4ed8',
];

export function compareColorForIndex(i: number): string {
  if (!Number.isFinite(i) || i < 0) return COMPARE_SUPERVISION_PALETTE[0];
  return COMPARE_SUPERVISION_PALETTE[i % COMPARE_SUPERVISION_PALETTE.length];
}

export function buildCompareSupervisionsFromSeatPoints(
  sqlSeatPoints: SqlMapPoint[],
  scope: SqlHierarchyFilter | null
): CompareSupervisionItem[] {
  if (!scope) return [];

  const activeGa = Number(scope.chaveGerenciaArea);
  const activeCoord = Number(scope.chaveCoordenacao);
  const hasGa = Number.isFinite(activeGa) && activeGa > 0;
  const hasCoord = Number.isFinite(activeCoord) && activeCoord > 0;
  if (!hasGa && !hasCoord) return [];

  const supervisors = sqlSeatPoints.filter((point) => {
    if (point.commercialLevel !== 'supervisor') return false;
    if (hasGa && Number(point.chaveGerenciaArea) !== activeGa) return false;
    return true;
  });

  const dedup = new Map<number, string>();
  for (const point of supervisors) {
    const chave = Number(point.chaveEntidade);
    if (!Number.isFinite(chave) || chave <= 0) continue;
    if (dedup.has(chave)) continue;
    dedup.set(chave, String(point.nome ?? `${COMMERCIAL_TEAM_LEVEL_LABEL.supervisor} ${chave}`));
  }

  return [...dedup.entries()]
    .sort(([a], [b]) => a - b)
    .map(([chaveSupervisao, nome], index) => ({
      chaveSupervisao,
      nome,
      color: compareColorForIndex(index),
    }));
}

export async function fetchSupervisoesForCompareScope(
  scope: SqlHierarchyFilter
): Promise<Array<{ chave: number; descricao: string }>> {
  const activeCoord = Number(scope.chaveCoordenacao);
  const activeGa = Number(scope.chaveGerenciaArea);
  const items = await fetchSupervisoes(
    Number.isFinite(activeCoord) && activeCoord > 0 ? activeCoord : null
  );
  if (Number.isFinite(activeCoord) && activeCoord > 0) {
    return items.map((item) => ({ chave: item.chave, descricao: item.descricao }));
  }
  if (Number.isFinite(activeGa) && activeGa > 0) {
    return items
      .filter((item) => item.chaveGerenciaArea === Math.trunc(activeGa))
      .map((item) => ({ chave: item.chave, descricao: item.descricao }));
  }
  return items.map((item) => ({ chave: item.chave, descricao: item.descricao }));
}

export function mergeCompareSupervisionList(
  seatPoints: SqlMapPoint[],
  apiSupervisoes: Array<{ chave: number; descricao: string }>,
  scope: SqlHierarchyFilter
): CompareSupervisionItem[] {
  const fromSeats = buildCompareSupervisionsFromSeatPoints(seatPoints, scope);
  if (fromSeats.length > 0) return fromSeats;
  return [...apiSupervisoes]
    .sort((a, b) => a.chave - b.chave)
    .map((item, index) => ({
      chaveSupervisao: item.chave,
      nome: item.descricao,
      color: compareColorForIndex(index),
    }));
}

export async function writeCompareSupervisionsToMap(
  map: mapboxgl.Map,
  list: CompareSupervisionItem[]
): Promise<void> {
  const source = map.getSource('supervisions-compare') as mapboxgl.GeoJSONSource | undefined;
  const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  if (!source) return;

  if (list.length === 0) {
    source.setData(emptyFc);
    return;
  }

  const index = await loadSupervisionAreas();
  const colorByChave = new Map<number, string>();
  for (const item of list) {
    colorByChave.set(item.chaveSupervisao, item.color);
  }
  const baseFeatures = index.getManyByChaves(list.map((item) => item.chaveSupervisao));
  const features: GeoJSON.Feature[] = baseFeatures.map((feature) => {
    const rawChave = (feature.properties as { chave_supervisao?: string | number } | null)
      ?.chave_supervisao;
    const chaveNum = Number(rawChave);
    const color = colorByChave.get(chaveNum) ?? compareColorForIndex(0);
    return {
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        compare_color: color,
      },
    };
  });
  source.setData({ type: 'FeatureCollection', features });
}
