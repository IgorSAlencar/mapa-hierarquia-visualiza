export type SqlMapPointKind = 'agencia' | 'loja' | 'supervisor';
import type { SqlHierarchyFilter } from '@/data/commercialStructureMock';

export interface SqlMapPoint {
  id: string;
  nome: string;
  kind: SqlMapPointKind;
  lngLat: [number, number];
  codAg?: string | null;
  enderecoFormatado?: string | null;
  commercialLevel?: 'supervisor' | 'coordenador' | 'gerente_area' | null;
  chaveGerenciaArea?: number | null;
  chaveCoordenacao?: number | null;
  chaveEntidade?: number | null;
  seatColor?: string | null;
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
  /** Filtra lojas vinculadas à agência (COD_AG em COORDENADAS_LOJAS). */
  codAg?: string | null;
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
  const codAgRaw = options.codAg != null ? String(options.codAg).trim() : '';
  const codAgNum = Number(codAgRaw.replace(',', '.'));
  const codAg =
    codAgRaw && Number.isFinite(codAgNum) ? String(Math.trunc(codAgNum)) : codAgRaw;
  if (codAg) params.set('codAg', codAg);
  // Evita que filtros de hierarquia (codAg da escada) sobrescrevam o codAg de lojas.
  if (options.hierarchy) {
    const entries: Array<[keyof SqlHierarchyFilter, string]> = [
      ['chaveGerenciaArea', 'chaveGerenciaArea'],
      ['chaveCoordenacao', 'chaveCoordenacao'],
      ['chaveSupervisao', 'chaveSupervisao'],
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
      if (paramName === 'codAg' && codAg) continue;
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

export function fetchCommercialSeatPoints(options?: FetchPointsOptions) {
  return fetchPoints('/api/map/sedes', options);
}
