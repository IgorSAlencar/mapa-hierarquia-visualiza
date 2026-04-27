export type SqlMapPointKind = 'agencia' | 'loja';
import type { SqlHierarchyFilter } from '@/data/commercialStructureMock';

export interface SqlMapPoint {
  id: string;
  nome: string;
  kind: SqlMapPointKind;
  lngLat: [number, number];
  codAg?: string | null;
  enderecoFormatado?: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface BboxQuery {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

interface FetchPointsOptions {
  bbox?: BboxQuery | null;
  limit?: number;
  hierarchy?: SqlHierarchyFilter | null;
}

function buildQueryParams(options: FetchPointsOptions = {}) {
  const params = new URLSearchParams();
  if (options.bbox) {
    params.set('minLng', String(options.bbox.minLng));
    params.set('minLat', String(options.bbox.minLat));
    params.set('maxLng', String(options.bbox.maxLng));
    params.set('maxLat', String(options.bbox.maxLat));
  }
  if (options.limit && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.max(1, Math.round(options.limit))));
  }
  if (options.hierarchy) {
    const entries: Array<[keyof SqlHierarchyFilter, string]> = [
      ['direReg', 'direReg'],
      ['codGerReg', 'codGerReg'],
      ['codGerArea', 'codGerArea'],
      ['codCoord', 'codCoord'],
      ['codSupervisao', 'codSupervisao'],
      ['codAg', 'codAg'],
    ];
    for (const [key, paramName] of entries) {
      const value = options.hierarchy[key];
      if (value == null || !Number.isFinite(value)) continue;
      params.set(paramName, String(Math.round(value)));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

async function fetchPoints(path: string, options: FetchPointsOptions = {}): Promise<SqlMapPoint[]> {
  const url = `${API_BASE_URL}${path}${buildQueryParams(options)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const detail = error instanceof Error ? ` Detalhe: ${error.message}` : '';
    throw new Error(
      `Não foi possível conectar à API (${url}). Verifique se o backend está rodando em "npm run dev:api".${detail}`
    );
  }

  if (!response.ok) {
    throw new Error(`Falha na API (${response.status})`);
  }

  const data = (await response.json()) as { points?: SqlMapPoint[] };
  return Array.isArray(data.points) ? data.points : [];
}

export function fetchAgencyPoints(options?: FetchPointsOptions) {
  return fetchPoints('/api/map/agencias', options);
}

export function fetchStorePoints(options?: FetchPointsOptions) {
  return fetchPoints('/api/map/lojas', options);
}
