import type { SqlHierarchyFilter } from '@/data/commercialStructureMock';
import { apiFetch } from '@/lib/apiClient';

export type SqlMapPointKind = 'agencia' | 'loja' | 'supervisor';
export type ChecklistStatus = 'NÃO APTO' | 'OK' | 'VENCIDO';
export type CommercialSeatLevel = 'supervisor' | 'coordenador' | 'gerente_area';

export interface SqlMapPoint {
  id: string;
  nome: string;
  kind: SqlMapPointKind;
  lngLat: [number, number];
  codAg?: string | null;
  nomeAg?: string | null;
  descSupervisao?: string | null;
  gerenteComercial?: string | null;
  orgaoPagador?: boolean | null;
  personName?: string | null;
  warName?: string | null;
  email?: string | null;
  enderecoFormatado?: string | null;
  commercialLevel?: CommercialSeatLevel | null;
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
  cieloFaturamentoM0?: number | null;
  cieloHistorico?: boolean | null;
  creditoM0?: boolean | null;
  negocioM0?: boolean | null;
  ativoPadeM0?: boolean | null;
  propostaValor?: boolean | null;
  checklist?: ChecklistStatus | null;
}

export interface StoreProductionPoint {
  periodo: number;
  qtdTrxContabil: number;
  qtdTrxNegocio: number;
  qtdContas: number;
  qtdConsig: number;
  vlrConsig: number;
  qtdLime: number;
  vlrLime: number;
  qtdCreditoParcelado: number;
  vlrCreditoParcelado: number;
  qtdCartao: number;
  vlrFatCielo: number;
  qtdFgts: number;
  qtdVida: number;
  qtdMicro: number;
  qtdResidencial: number;
  qtdDental: number;
  qtdSuper: number;
  qtdSegDebito: number;
  qtdConsorcio: number;
  qtdExpSorte: number;
  qtdCred: number;
  vlrCred: number;
  segTotal: number;
}

export interface StoreBusinessDailyPoint {
  periodo: number;
  diaUtil: number;
  qtdNeg: number;
}

export interface StoreProductionOverview {
  history: StoreProductionPoint[];
  businessDaily: StoreBusinessDailyPoint[];
}

export interface CommercialSeatDetail {
  commercialLevel: CommercialSeatLevel;
  chaveEntidade: number;
  entidadeNome: string | null;
  personName: string | null;
  warName: string | null;
  email: string | null;
  superiorLevel: string | null;
  superiorKey: number | null;
  superiorDescription: string | null;
  superiorPersonName: string | null;
  superiorWarName: string | null;
  upperSuperiorLevel: string | null;
  upperSuperiorKey: number | null;
  upperSuperiorDescription: string | null;
  upperSuperiorPersonName: string | null;
  upperSuperiorWarName: string | null;
  agencyCount: number;
  storeCount: number;
}

export interface AgencyHierarchyItem {
  level: 'Gerente Comercial' | 'Gerente Comercial III' | 'Gerente de Gestão';
  key: number | null;
  description: string | null;
  personName: string | null;
  warName: string | null;
}

export interface AgencyDetail {
  codAg: string | null;
  agencyName: string | null;
  hierarchy: AgencyHierarchyItem[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const POINTS_CACHE_MAX_ENTRIES = 120;
const pointsResponseCache = new Map<string, { expiresAt: number; points: SqlMapPoint[] }>();
const pendingPointsRequests = new Map<string, Promise<SqlMapPoint[]>>();
let pointsCacheGeneration = 0;

export interface BboxQuery {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface FetchPointsOptions {
  bbox?: BboxQuery | null;
  limit?: number;
  /** Ordena consultas espaciais do ponto mais próximo para o mais distante do centro da bbox. */
  sortByCenter?: boolean;
  hierarchy?: SqlHierarchyFilter | null;
  /** Filtra lojas vinculadas à agência (COD_AG em TB_COORD_BE_IGOR). */
  codAg?: string | null;
  /** Busca lojas por CHAVE_LOJA ou nome. Consultas com menos de 2 caracteres retornam vazio. */
  search?: string | null;
}

function pointsCacheTtlMs(path: string, options: FetchPointsOptions): number {
  if (path === '/api/map/lojas' && options.search != null) return 60_000;
  if (path === '/api/map/lojas' && options.codAg) return 2 * 60_000;
  if (path === '/api/map/lojas' && options.bbox) return 30_000;
  if (path === '/api/map/lojas' && options.hierarchy) return 30_000;
  if (path === '/api/map/lojas') return 2 * 60_000;
  if (path === '/api/map/agencias' && !options.bbox && !options.hierarchy) return 2 * 60_000;
  return 0;
}

function rememberPoints(url: string, points: SqlMapPoint[], ttlMs: number): void {
  if (ttlMs <= 0) return;
  pointsResponseCache.delete(url);
  pointsResponseCache.set(url, { expiresAt: Date.now() + ttlMs, points });
  while (pointsResponseCache.size > POINTS_CACHE_MAX_ENTRIES) {
    const oldestKey = pointsResponseCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    pointsResponseCache.delete(oldestKey);
  }
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
  if (options.search != null) params.set('search', String(options.search).trim());
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

async function fetchPointsFromApi(path: string, options: FetchPointsOptions = {}): Promise<SqlMapPoint[]> {
  const url = `${API_BASE_URL}${path}${buildQueryParams(options)}`;
  let response: Response;
  try {
    response = await apiFetch(url);
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

async function fetchPoints(path: string, options: FetchPointsOptions = {}): Promise<SqlMapPoint[]> {
  const url = `${API_BASE_URL}${path}${buildQueryParams(options)}`;
  const ttlMs = pointsCacheTtlMs(path, options);
  const cached = pointsResponseCache.get(url);
  const cachedShapeIsCurrent =
    path !== '/api/map/lojas' ||
    cached?.points.every(
      (point) =>
        point.kind !== 'loja' ||
        (Object.prototype.hasOwnProperty.call(point, 'cieloFaturamentoM0') &&
          Object.prototype.hasOwnProperty.call(point, 'cieloHistorico') &&
          Object.prototype.hasOwnProperty.call(point, 'creditoM0') &&
          Object.prototype.hasOwnProperty.call(point, 'negocioM0') &&
          Object.prototype.hasOwnProperty.call(point, 'ativoPadeM0') &&
          Object.prototype.hasOwnProperty.call(point, 'propostaValor') &&
          Object.prototype.hasOwnProperty.call(point, 'nomeAg') &&
          Object.prototype.hasOwnProperty.call(point, 'descSupervisao') &&
          Object.prototype.hasOwnProperty.call(point, 'gerenteComercial') &&
          Object.prototype.hasOwnProperty.call(point, 'orgaoPagador'))
    );
  if (cached && cached.expiresAt > Date.now() && cachedShapeIsCurrent) {
    pointsResponseCache.delete(url);
    pointsResponseCache.set(url, cached);
    return cached.points;
  }
  if (cached) pointsResponseCache.delete(url);

  const pending = pendingPointsRequests.get(url);
  if (pending) return pending;

  const requestGeneration = pointsCacheGeneration;
  const request = fetchPointsFromApi(path, options)
    .then((points) => {
      if (requestGeneration === pointsCacheGeneration) rememberPoints(url, points, ttlMs);
      return points;
    })
    .finally(() => {
      pendingPointsRequests.delete(url);
    });

  pendingPointsRequests.set(url, request);
  return request;
}

export function fetchAgencyPoints(options?: FetchPointsOptions) {
  return fetchPoints('/api/map/agencias', options);
}

export async function fetchAgencyDetail(
  codAg: string,
  signal?: AbortSignal
): Promise<AgencyDetail> {
  const url = `${API_BASE_URL}/api/map/agencias/${encodeURIComponent(codAg)}/detalhes`;
  const response = await apiFetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Falha ao buscar os detalhes da agência (${response.status}).`);
  }
  const data = (await response.json()) as { detail?: AgencyDetail };
  if (!data.detail) throw new Error('Detalhes da agência não encontrados.');
  return data.detail;
}

export function fetchStorePoints(options?: FetchPointsOptions) {
  return fetchPoints('/api/map/lojas', options);
}

export function fetchCommercialSeatPoints(options?: FetchPointsOptions) {
  return fetchPoints('/api/map/sedes', options);
}

export async function fetchCommercialSeatDetail(
  commercialLevel: CommercialSeatLevel,
  chaveEntidade: number,
  signal?: AbortSignal
): Promise<CommercialSeatDetail> {
  const url = `${API_BASE_URL}/api/map/estrutura/${encodeURIComponent(
    commercialLevel
  )}/${encodeURIComponent(String(chaveEntidade))}/detalhes`;
  const response = await apiFetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Falha ao buscar os detalhes do responsável comercial (${response.status}).`);
  }
  const data = (await response.json()) as { detail?: CommercialSeatDetail };
  if (!data.detail) throw new Error('Detalhes do responsável comercial não encontrados.');
  return data.detail;
}

export function clearMapDataCache() {
  pointsCacheGeneration += 1;
  pointsResponseCache.clear();
  pendingPointsRequests.clear();
}

export async function fetchStoreProductionHistory(
  chaveLoja: string,
  signal?: AbortSignal
): Promise<StoreProductionOverview> {
  const key = String(chaveLoja ?? '').trim();
  if (!key) return { history: [], businessDaily: [] };

  const url = `${API_BASE_URL}/api/map/lojas/${encodeURIComponent(key)}/producao`;
  let response: Response;
  try {
    response = await apiFetch(url, { signal });
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

  const data = (await response.json()) as Partial<StoreProductionOverview>;
  return {
    history: Array.isArray(data.history) ? data.history : [],
    businessDaily: Array.isArray(data.businessDaily) ? data.businessDaily : [],
  };
}
