import type { MunicipalityProductivityRow } from '@/lib/expressoRegionMock';
import type { ProductionHeatmapRow } from '@/lib/mapDataApi';

export const PRODUCTION_HEATMAP_COLORS = [
  '#c8dcf0',
  '#86add1',
  '#4f82ad',
  '#275d8a',
  '#123a60',
] as const;

export interface ProductionQuantileScale {
  thresholds: number[];
  ranges: Array<{ min: number; max: number; color: string }>;
}

export type ChoroplethMetric = 'producaoMes';

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function municipalityNameFromProperties(props?: GeoJSON.GeoJsonProperties): string {
  return String(
    props?.name ??
      props?.nome ??
      props?.NM_MUNICIP ??
      props?.NOME ??
      props?.municipio ??
      props?.city ??
      ''
  );
}

export function listMunicipalityNamesFromFeatureCollection(fc: GeoJSON.FeatureCollection): string[] {
  const out: string[] = [];
  for (const f of fc.features) {
    const n = municipalityNameFromProperties(f.properties);
    if (n.trim()) out.push(n);
  }
  return out;
}

export function buildMunicipalityValueMap(
  rows: MunicipalityProductivityRow[],
  metric: ChoroplethMetric
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeText(row.municipio);
    if (!key) continue;
    map.set(key, row[metric]);
  }
  return map;
}

export function mergeChoroplethIntoFeatureCollection(
  fc: GeoJSON.FeatureCollection,
  valueMap: Map<string, number>
): GeoJSON.FeatureCollection {
  const features = fc.features.map((f) => {
    const label = municipalityNameFromProperties(f.properties);
    const key = normalizeText(label);
    const v = key ? valueMap.get(key) : undefined;
    const missing = v === undefined || !Number.isFinite(v);
    const props: GeoJSON.GeoJsonProperties = {
      ...(f.properties as GeoJSON.GeoJsonProperties),
      heatMissing: missing ? 1 : 0,
      ...(missing ? {} : { heatValue: v as number }),
    };
    return { ...f, properties: props } as GeoJSON.Feature;
  });
  return { type: 'FeatureCollection', features };
}

export function computeValueRange(values: number[]): { min: number; max: number } {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (filtered.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...filtered);
  let max = Math.max(...filtered);
  if (max <= min) max = min + 1;
  return { min, max };
}

export function computeValueRangeFromRows(
  rows: MunicipalityProductivityRow[],
  metric: ChoroplethMetric
): { min: number; max: number } {
  return computeValueRange(rows.map((r) => r[metric]));
}

export function normalizeMunicipalityCode(value: unknown): string | null {
  const digits = String(value ?? '').trim().replace(/\.0+$/, '');
  if (!/^\d{6,7}$/.test(digits)) return null;
  return digits.padStart(7, '0');
}

export function municipalityCodeFromProperties(
  props?: GeoJSON.GeoJsonProperties
): string | null {
  if (!props) return null;
  const candidates = [
    props.heatMunicipalityCode,
    props.CD_MUNIC,
    props.CD_MUN,
    props.cd_mun,
    props.COD_IBGE,
    props.cod_ibge,
    props.IBGE,
    props.ibge,
    props.id,
    props.code,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeMunicipalityCode(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function quantileValue(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export function buildProductionQuantileScale(values: number[]): ProductionQuantileScale {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (positive.length === 0) return { thresholds: [], ranges: [] };
  const thresholds = [0.2, 0.4, 0.6, 0.8].map((fraction) => quantileValue(positive, fraction));
  const boundaries = [positive[0], ...thresholds, positive[positive.length - 1]];
  const ranges = PRODUCTION_HEATMAP_COLORS.map((color, index) => ({
    min: index === 0 ? positive[0] : boundaries[index],
    max: index === PRODUCTION_HEATMAP_COLORS.length - 1
      ? positive[positive.length - 1]
      : boundaries[index + 1],
    color,
  }));
  return { thresholds, ranges };
}

export function productionQuantileClass(value: number, thresholds: number[]): number {
  if (!Number.isFinite(value) || value <= 0) return -1;
  let bucket = 0;
  for (const threshold of thresholds) {
    if (value > threshold) bucket += 1;
  }
  return Math.min(PRODUCTION_HEATMAP_COLORS.length - 1, bucket);
}

export function mergeProductionHeatmapIntoFeatureCollection(
  fc: GeoJSON.FeatureCollection,
  rows: ProductionHeatmapRow[],
  scale: ProductionQuantileScale
): GeoJSON.FeatureCollection {
  const values = new Map(rows.map((row) => [normalizeMunicipalityCode(row.municipalityCode), row]));
  return {
    type: 'FeatureCollection',
    features: fc.features.map((feature) => {
      const code = municipalityCodeFromProperties(feature.properties);
      const row = code ? values.get(code) : undefined;
      const value = Number(row?.value) || 0;
      const missing = !row;
      return {
        ...feature,
        properties: {
          ...(feature.properties as GeoJSON.GeoJsonProperties),
          heatMunicipalityCode: code,
          heatMissing: missing ? 1 : 0,
          heatZero: !missing && value <= 0 ? 1 : 0,
          heatValue: missing ? null : value,
          heatStores: row?.producingStores ?? 0,
          heatClass: missing ? -1 : productionQuantileClass(value, scale.thresholds),
          heatMunicipalityName: row?.municipalityName ?? municipalityNameFromProperties(feature.properties),
          heatUf: row?.uf ?? feature.properties?.heatUf ?? '',
        },
      } as GeoJSON.Feature;
    }),
  };
}
