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
  routeRole?: 'origin' | 'destination' | 'corridor' | null;
  chaveLoja?: string | null;
  municipio?: string | null;
  uf?: string | null;
  statusTablet?: string | null;
  dataBloqueio?: string | null;
  motivoBloqueio?: string | null;
  tipoPosto?: string | null;
  segmento?: string | null;
  dataUltimaTransacao?: string | null;
  cieloM0?: boolean | null;
  checklist?: boolean | null;
}

export interface StoreProductionPoint {
  periodo: number;
  qtdTrxContabil: number;
  qtdContas: number;
  qtdConsig: number;
  qtdLime: number;
  qtdCreditoParcelado: number;
  qtdCartao: number;
  qtdFgts: number;
  qtdVida: number;
  qtdMicro: number;
  qtdResidencial: number;
  qtdDental: number;
  qtdSuper: number;
  qtdSegDebito: number;
  qtdCred: number;
  vlrCred: number;
  segTotal: number;
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
  /** Ordena consultas espaciais do ponto mais próximo para o mais distante do centro da bbox. */
  sortByCenter?: boolean;
  hierarchy?: SqlHierarchyFilter | null;
  /** Filtra lojas vinculadas à agência (COD_AG em TB_COORD_BE_IGOR). */
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
  if (options.sortByCenter && options.bbox) params.set('sortByCenter', '1');
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

export async function fetchStoreProductionHistory(
  chaveLoja: string,
  signal?: AbortSignal
): Promise<StoreProductionPoint[]> {
  const key = String(chaveLoja ?? '').trim();
  if (!key) return [];

  const url = `${API_BASE_URL}/api/map/lojas/${encodeURIComponent(key)}/producao`;
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const detail = error instanceof Error ? ` Detalhe: ${error.message}` : '';
    throw new Error(
      `Não foi possível conectar à API de produção da loja.${detail}`
    );
  }

  if (!response.ok) {
    throw new Error(`Falha ao buscar a produção da loja (${response.status}).`);
  }

  const data = (await response.json()) as { history?: StoreProductionPoint[] };
  return Array.isArray(data.history) ? data.history : [];
}
