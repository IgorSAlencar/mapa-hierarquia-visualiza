import type { VisitRoute, VisitRouteOwner } from '@/data/visitRoutes';
import type { StoreProductionPoint } from '@/lib/mapDataApi';
import { apiFetch } from '@/lib/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface VisitRouteSummary {
  id: string;
  nome: string;
  plannedDate: string;
  version: number;
  savedAt: string;
  owner: VisitRouteOwner;
  createdBy: { funcional: string; nome: string };
  stopCount: number;
  distanceMeters: number;
  durationMinutes: number;
}

export interface VisitRouteSupervisionSummary {
  chaveSupervisao: number;
  routes: number;
  managersWithRoute: number;
  visits: number;
}

export interface VisitRouteExportStoreData {
  chaveLoja: string;
  production: StoreProductionPoint | null;
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { message?: string };
    return new Error(body.message || `Erro ${response.status}`);
  } catch {
    return new Error(`Erro ${response.status}`);
  }
}

export async function fetchRouteOwners(storeKeys: Array<string | null | undefined> = []): Promise<VisitRouteOwner[]> {
  const params = new URLSearchParams();
  for (const key of storeKeys) {
    const normalized = String(key ?? '').trim();
    if (normalized) params.append('chaveLoja', normalized);
  }
  const query = params.toString();
  const response = await apiFetch(`${API_BASE_URL}/api/roteiros/responsaveis${query ? `?${query}` : ''}`);
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as { items?: VisitRouteOwner[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function saveRouteVersion(
  route: VisitRoute,
  owner: VisitRouteOwner,
  requestId: string
): Promise<VisitRoute> {
  const response = await apiFetch(`${API_BASE_URL}/api/roteiros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      ownerFuncional: owner.funcional,
      chaveSupervisao: owner.chaveSupervisao,
      plannedDate: route.plannedDate,
      nome: route.nome,
      origin: route.origin,
      destination: route.destination,
      distanceMeters: route.distanceMeters,
      durationBreakdown: route.durationBreakdown,
      routeGeometry: route.routeGeometry,
      stops: route.stops,
    }),
  });
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as { route: VisitRoute };
  return data.route;
}

export async function fetchRouteHistory(options: {
  from: string;
  to: string;
  chaveSupervisao?: number | null;
  cursor?: string | null;
  limit?: number;
}): Promise<{ items: VisitRouteSummary[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ from: options.from, to: options.to });
  if (options.chaveSupervisao) params.set('chaveSupervisao', String(options.chaveSupervisao));
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.limit) params.set('limit', String(options.limit));
  const response = await apiFetch(`${API_BASE_URL}/api/roteiros?${params}`);
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as { items?: VisitRouteSummary[]; nextCursor?: string | null };
  return { items: Array.isArray(data.items) ? data.items : [], nextCursor: data.nextCursor ?? null };
}

export async function fetchRouteSummary(from: string, to: string): Promise<VisitRouteSupervisionSummary[]> {
  const params = new URLSearchParams({ from, to });
  const response = await apiFetch(`${API_BASE_URL}/api/roteiros/resumo?${params}`);
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as { items?: VisitRouteSupervisionSummary[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchSavedRoute(id: string): Promise<VisitRoute> {
  const response = await apiFetch(`${API_BASE_URL}/api/roteiros/${encodeURIComponent(id)}`);
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as { route: VisitRoute };
  return data.route;
}

export async function fetchSavedRouteExportData(id: string): Promise<VisitRouteExportStoreData[]> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/roteiros/${encodeURIComponent(id)}/exportacao-dados`
  );
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as { stores?: VisitRouteExportStoreData[] };
  return Array.isArray(data.stores) ? data.stores : [];
}

export async function deleteSavedRoute(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/roteiros/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw await responseError(response);
}

export function defaultRouteHistoryRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 89);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
