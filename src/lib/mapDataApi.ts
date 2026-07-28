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
  /** Resultado espacial leve exibido enquanto os indicadores da oportunidade são enriquecidos. */
  plannerDataPending?: boolean;
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
  /** Meses desde a última produção Cielo no histórico (1 = mês anterior, 12 = há 12 meses). */
  cieloHistoricoMeses?: number | null;
  creditoM0?: boolean | null;
  creditoHistorico?: boolean | null;
  creditoHistoricoMeses?: number | null;
  negocioM0?: boolean | null;
  negocioHistorico?: boolean | null;
  negocioHistoricoMeses?: number | null;
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

export interface StoreCertificationPerson {
  name: string;
  cpf: string | null;
  status: string;
  certificationDate: string | null;
  expirationDate: string | null;
}

export interface StoreCertificationOverview {
  status: string | null;
  people: StoreCertificationPerson[];
}

export interface StoreProductionOverview {
  history: StoreProductionPoint[];
  businessDaily: StoreBusinessDailyPoint[];
  certification: StoreCertificationOverview;
}

export type ProductionHeatmapUnit = 'quantity' | 'currency';

export interface ProductionHeatmapMetric {
  id: string;
  label: string;
  shortLabel: string;
  group: string;
  unit: ProductionHeatmapUnit;
  /** Agrupa as variantes Valor/QTD do mesmo produto. */
  productKey?: string;
  /** Variante exibida no seletor e escolhida por padrão. */
  defaultForProduct?: boolean;
}

export interface ProductionHeatmapOptions {
  metrics: ProductionHeatmapMetric[];
  periods: number[];
  currentPeriod: number | null;
}

export interface ProductionHeatmapRow {
  municipalityCode: string;
  municipalityName: string;
  uf: string;
  value: number;
  producingStores: number;
  /** Total de lojas do município no território (com ou sem produção). */
  storeCount: number;
}

export interface ProductionHeatmapUniverseByUf {
  uf: string;
  storeCount: number;
  municipalityCount: number;
}

export interface ProductionHeatmapData {
  metric: ProductionHeatmapMetric;
  period: number;
  rows: ProductionHeatmapRow[];
  /** Totais do território por UF (todas as lojas/municípios, não só com produção). */
  universeByUf?: ProductionHeatmapUniverseByUf[];
  summary: {
    value: number;
    producingStores: number;
    municipalitiesWithData: number;
    /** Total de lojas no território com município válido. */
    storeCount: number;
    /** Total oficial de municípios (ibge..IBGE_POP). */
    municipalityCount: number;
    excludedStoresWithoutMunicipality: number;
  };
}

export interface ProductionHeatmapStoreRow {
  chaveLoja: string;
  nome: string;
  codAg: string | null;
  nomeAg: string | null;
  municipalityCode: string;
  municipalityName: string;
  uf: string;
  value: number;
  qtdContas: number;
  /** True quando a loja realizou contas no período. */
  hasContas: boolean;
  /** True quando a loja produziu o indicador selecionado no período. */
  hasProduction: boolean;
  lng: number | null;
  lat: number | null;
}

export interface ProductionHeatmapStoresData {
  metric: ProductionHeatmapMetric;
  period: number;
  municipalityCode: string | null;
  municipalityName: string;
  uf: string;
  scope?: 'municipality' | 'uf';
  summary: {
    value: number;
    producingStores: number;
    storeCount: number;
    storesWithContas?: number;
    storesWithoutContas?: number;
    storesWithProduction?: number;
    storesWithoutProduction?: number;
  };
  stores: ProductionHeatmapStoreRow[];
}

export type ProductionHeatmapStoresScope =
  | { municipalityCode: string; uf?: never }
  | { uf: string; municipalityCode?: never };

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
  /** Retorna somente os campos necessarios para desenhar rapidamente as lojas no mapa. */
  mapOnly?: boolean;
  /** Payload do popup/card sem histórico de oportunidades do planner. */
  popupReady?: boolean;
  /** Grupo comercial. `varejo` = Tradicional + Ilha (oportunidades do roteiro). */
  segment?: 'varejo' | null;
}

function pointsCacheTtlMs(path: string, options: FetchPointsOptions): number {
  if (path === '/api/map/lojas' && options.popupReady) return 5 * 60_000;
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
  if (options.mapOnly) params.set('mapOnly', '1');
  if (options.popupReady && !options.mapOnly) params.set('popupReady', '1');
  if (options.segment === 'varejo') params.set('segment', 'varejo');
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
    options.mapOnly ||
    cached?.points.every((point) => {
      if (point.kind !== 'loja') return true;
      const hasPopupFields =
        Object.prototype.hasOwnProperty.call(point, 'cieloFaturamentoM0') &&
        Object.prototype.hasOwnProperty.call(point, 'propostaValor') &&
        Object.prototype.hasOwnProperty.call(point, 'nomeAg') &&
        Object.prototype.hasOwnProperty.call(point, 'descSupervisao') &&
        Object.prototype.hasOwnProperty.call(point, 'gerenteComercial') &&
        Object.prototype.hasOwnProperty.call(point, 'orgaoPagador');
      if (!hasPopupFields) return false;
      if (options.popupReady) return true;
      return (
        Object.prototype.hasOwnProperty.call(point, 'cieloHistorico') &&
        Object.prototype.hasOwnProperty.call(point, 'cieloHistoricoMeses') &&
        Object.prototype.hasOwnProperty.call(point, 'creditoM0') &&
        Object.prototype.hasOwnProperty.call(point, 'creditoHistorico') &&
        Object.prototype.hasOwnProperty.call(point, 'creditoHistoricoMeses') &&
        Object.prototype.hasOwnProperty.call(point, 'negocioM0') &&
        Object.prototype.hasOwnProperty.call(point, 'negocioHistorico') &&
        Object.prototype.hasOwnProperty.call(point, 'negocioHistoricoMeses') &&
        Object.prototype.hasOwnProperty.call(point, 'ativoPadeM0')
      );
    });
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
  if (!key) {
    return {
      history: [],
      businessDaily: [],
      certification: { status: null, people: [] },
    };
  }

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
    certification: {
      status:
        typeof data.certification?.status === 'string'
          ? data.certification.status
          : null,
      people: Array.isArray(data.certification?.people)
        ? data.certification.people
        : [],
    },
  };
}

async function fetchProductionHeatmapJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(`${API_BASE_URL}${path}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const detail = error instanceof Error ? ` Detalhe: ${error.message}` : '';
    throw new Error(`Não foi possível conectar ao mapa de produção.${detail}`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || `Falha ao carregar o mapa de produção (${response.status}).`);
  }
  return (await response.json()) as T;
}

export function fetchProductionHeatmapOptions(signal?: AbortSignal): Promise<ProductionHeatmapOptions> {
  return fetchProductionHeatmapJson<ProductionHeatmapOptions>(
    '/api/map/production-heatmap/options',
    signal
  );
}

export function fetchProductionHeatmap(
  metricId: string,
  period: number,
  signal?: AbortSignal
): Promise<ProductionHeatmapData> {
  const query = new URLSearchParams({ metricId, period: String(period) });
  return fetchProductionHeatmapJson<ProductionHeatmapData>(
    `/api/map/production-heatmap?${query.toString()}`,
    signal
  ).then((data) => {
    const rows = (Array.isArray(data.rows) ? data.rows : []).map((row) => {
      const producingStores = Math.max(0, Number(row.producingStores) || 0);
      return {
        ...row,
        municipalityCode: String(row.municipalityCode ?? '').trim(),
        municipalityName: String(row.municipalityName ?? '').trim(),
        uf: String(row.uf ?? '').trim().toUpperCase(),
        value: Number(row.value) || 0,
        producingStores,
        storeCount: Math.max(producingStores, Number(row.storeCount) || 0),
      };
    });
    const producingStores = Math.max(0, Number(data.summary?.producingStores) || 0);
    const municipalitiesWithData = Math.max(
      0,
      Number(data.summary?.municipalitiesWithData) || 0
    );
    return {
      ...data,
      rows,
      universeByUf: (Array.isArray(data.universeByUf) ? data.universeByUf : [])
        .map((row) => ({
          uf: String(row.uf ?? '').trim().toUpperCase(),
          storeCount: Math.max(0, Number(row.storeCount) || 0),
          municipalityCount: Math.max(0, Number(row.municipalityCount) || 0),
        }))
        .filter((row) => row.uf),
      summary: {
        value: Number(data.summary?.value) || 0,
        producingStores,
        municipalitiesWithData,
        storeCount: Math.max(
          producingStores,
          Number(data.summary?.storeCount) || 0,
          rows.reduce((sum, row) => sum + row.storeCount, 0)
        ),
        municipalityCount: Math.max(
          municipalitiesWithData,
          Number(data.summary?.municipalityCount) || 0
        ),
        excludedStoresWithoutMunicipality: Math.max(
          0,
          Number(data.summary?.excludedStoresWithoutMunicipality) || 0
        ),
      },
    };
  });
}

function normalizeHeatmapStoreCoords(
  lng: unknown,
  lat: unknown
): { lng: number | null; lat: number | null } {
  if (lng == null || lat == null) return { lng: null, lat: null };
  if (typeof lng === 'string' && lng.trim() === '') return { lng: null, lat: null };
  if (typeof lat === 'string' && lat.trim() === '') return { lng: null, lat: null };
  const lonN = Number(lng);
  const latN = Number(lat);
  if (!Number.isFinite(lonN) || !Number.isFinite(latN)) return { lng: null, lat: null };
  if (lonN < -180 || lonN > 180 || latN < -90 || latN > 90) return { lng: null, lat: null };
  if (lonN === 0 && latN === 0) return { lng: null, lat: null };
  return { lng: lonN, lat: latN };
}

export async function fetchProductionHeatmapStores(
  metricId: string,
  period: number,
  scope: ProductionHeatmapStoresScope,
  signal?: AbortSignal
): Promise<ProductionHeatmapStoresData> {
  const query = new URLSearchParams({
    metricId,
    period: String(period),
  });
  if ('municipalityCode' in scope && scope.municipalityCode) {
    query.set('municipalityCode', scope.municipalityCode);
  } else if ('uf' in scope && scope.uf) {
    query.set('uf', scope.uf.toUpperCase());
  } else {
    throw new Error('Informe municipalityCode ou uf para carregar as lojas.');
  }
  const data = await fetchProductionHeatmapJson<ProductionHeatmapStoresData>(
    `/api/map/production-heatmap/stores?${query.toString()}`,
    signal
  );
  const stores = (Array.isArray(data.stores) ? data.stores : []).map((store) => {
    const coords = normalizeHeatmapStoreCoords(store?.lng, store?.lat);
    const value = Number(store?.value) || 0;
    const hasProduction =
      typeof store?.hasProduction === 'boolean' ? store.hasProduction : value !== 0;
    return {
      ...store,
      chaveLoja: String(store?.chaveLoja ?? '').trim(),
      nome: String(store?.nome ?? 'Loja').trim() || 'Loja',
      municipalityCode: String(store?.municipalityCode ?? '').trim(),
      municipalityName: String(store?.municipalityName ?? '').trim(),
      uf: String(store?.uf ?? '').trim().toUpperCase(),
      value,
      qtdContas: Number(store?.qtdContas) || 0,
      hasContas: Boolean(store?.hasContas),
      hasProduction,
      lng: coords.lng,
      lat: coords.lat,
    };
  }).filter((store) => store.chaveLoja);
  return {
    ...data,
    municipalityCode: data.municipalityCode ?? null,
    stores,
    summary: {
      value: Number(data.summary?.value) || 0,
      producingStores: Math.max(0, Number(data.summary?.producingStores) || 0),
      storeCount: Math.max(stores.length, Number(data.summary?.storeCount) || 0),
      storesWithContas: Number(data.summary?.storesWithContas) || undefined,
      storesWithoutContas: Number(data.summary?.storesWithoutContas) || undefined,
      storesWithProduction: Number(data.summary?.storesWithProduction) || undefined,
      storesWithoutProduction: Number(data.summary?.storesWithoutProduction) || undefined,
    },
  };
}
