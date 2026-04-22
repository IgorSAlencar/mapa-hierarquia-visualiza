import type { MunicipalityProductivityRow } from '@/lib/expressoRegionMock';

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
  let min = Math.min(...filtered);
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
