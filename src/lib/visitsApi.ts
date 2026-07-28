import { apiFetch } from '@/lib/apiClient';
import { randomUuid } from '@/lib/randomUuid';
import type { VisitOperationalStatus } from '@/data/visitRoutes';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export type VisitCommercialResult =
  | 'SEM_RESULTADO'
  | 'APRESENTADO'
  | 'INTERESSE'
  | 'PROPOSTA'
  | 'CONTRATADO'
  | 'TRANSACIONOU'
  | 'SEM_INTERESSE'
  | 'SEM_OPORTUNIDADE'
  | 'OUTRO';

export interface VisitProduct {
  id: string;
  productId: number;
  code: string;
  name: string;
  opportunityType: string;
  opportunity: Record<string, unknown>;
  treatmentStatus: 'PENDENTE' | 'TRATADO' | 'NAO_ABORDADO';
  result: string | null;
  notes: string | null;
  notAddressedReason: string | null;
  needsFollowUp: boolean;
  followUpStatus: string;
  baseline: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  nextEvaluationAt: string | null;
  evolutionDetectedAt: string | null;
  active: boolean;
  rowVersion: string;
}

export interface VisitTreatment {
  id: string;
  routeId: string;
  routeName: string;
  routeStatus: string;
  stopId: string;
  stopOrder: number;
  current: boolean;
  sequence: number;
  store: {
    key: string;
    name: string;
    agencyCode: string | null;
    supervisionKey: number;
    address: string | null;
  };
  owner: { code: string; name: string };
  createdBy: { code: string; name: string };
  plannedDate: string;
  plannedTime: string | null;
  timeZone: string;
  priority: string;
  orientation: string | null;
  status: VisitOperationalStatus;
  answer: 'SIM' | 'NAO' | 'REAGENDADA' | null;
  commercialResult: VisitCommercialResult;
  visitDate: string | null;
  startedAt: string | null;
  endedAt: string | null;
  notCompletedReason: string | null;
  notCompletedJustification: string | null;
  notes: string | null;
  needsReturn: boolean;
  returnDate: string | null;
  checkin: {
    id: string;
    deviceAt: string;
    serverAt: string;
    offsetMinutes: number;
    userCode: string;
    validationStatus: 'NAO_APLICAVEL';
  } | null;
  products: VisitProduct[];
  productProgress: { treated: number; total: number };
  routeProgress: { treated: number; total: number; inProgress: number; pending: number };
  rowVersion: string;
  updatedAt: string;
}

export class VisitApiError extends Error {
  status: number;
  code: string;
  correlationId: string | null;
  errors: Array<{ field?: string; code?: string; message?: string }>;

  constructor(body: Record<string, unknown>, status: number) {
    super(String(body.detail ?? body.message ?? `Erro ${status}`));
    this.name = 'VisitApiError';
    this.status = status;
    this.code = String(body.code ?? 'UNKNOWN_ERROR');
    this.correlationId = body.correlationId == null ? null : String(body.correlationId);
    this.errors = Array.isArray(body.errors)
      ? body.errors as Array<{ field?: string; code?: string; message?: string }>
      : [];
  }
}

async function errorFrom(response: Response): Promise<VisitApiError> {
  try {
    return new VisitApiError(await response.json() as Record<string, unknown>, response.status);
  } catch {
    return new VisitApiError({ detail: `Erro ${response.status}` }, response.status);
  }
}

function commandHeaders(rowVersion: string, idempotencyKey = randomUuid()): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
    'If-Match': `"${rowVersion}"`,
  };
}

async function visitCommand(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH',
  body: unknown,
  rowVersion: string
): Promise<VisitTreatment> {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: commandHeaders(rowVersion),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await errorFrom(response);
  return (await response.json() as { visit: VisitTreatment }).visit;
}

export async function fetchVisit(id: string): Promise<VisitTreatment> {
  const response = await apiFetch(`${API_BASE_URL}/api/visitas/${encodeURIComponent(id)}`);
  if (!response.ok) throw await errorFrom(response);
  return (await response.json() as { visit: VisitTreatment }).visit;
}

export function saveVisitDraft(
  visit: VisitTreatment,
  body: {
    answer: 'SIM' | 'NAO' | 'REAGENDADA' | null;
    visitDate?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    commercialResult: VisitCommercialResult;
    notes?: string | null;
    needsReturn: boolean;
    returnDate?: string | null;
  }
) {
  return visitCommand(`/api/visitas/${visit.id}/rascunho`, 'PATCH', body, visit.rowVersion);
}

export function registerCheckin(
  visit: VisitTreatment,
  body: { occurredAt: string; visitDate: string; deviceEventId: string }
) {
  return visitCommand(`/api/visitas/${visit.id}/checkins`, 'POST', body, visit.rowVersion);
}

export function saveProductTreatment(
  visit: VisitTreatment,
  product: VisitProduct,
  body: {
    status: 'TRATADO' | 'NAO_ABORDADO';
    result?: string;
    notes?: string | null;
    notAddressedReason?: string | null;
    needsFollowUp: boolean;
  }
) {
  return visitCommand(
    `/api/visitas/${visit.id}/produtos/${product.id}`,
    'PUT',
    body,
    product.rowVersion
  );
}

export function concludeVisit(
  visit: VisitTreatment,
  body: {
    visitDate: string;
    startedAt: string;
    endedAt?: string | null;
    commercialResult: VisitCommercialResult;
    notes?: string | null;
    needsReturn: boolean;
    returnDate?: string | null;
  }
) {
  return visitCommand(`/api/visitas/${visit.id}/conclusao`, 'POST', body, visit.rowVersion);
}

export function registerNotCompleted(
  visit: VisitTreatment,
  body: { reason: string; justification?: string | null }
) {
  return visitCommand(
    `/api/visitas/${visit.id}/nao-realizacao`,
    'POST',
    body,
    visit.rowVersion
  );
}

export function rescheduleTreatment(
  visit: VisitTreatment,
  body: {
    newDate: string;
    newTime?: string | null;
    reason: string;
    justification?: string | null;
    orientation?: string | null;
    priority?: string;
  }
) {
  return visitCommand(
    `/api/visitas/${visit.id}/reagendamentos`,
    'POST',
    body,
    visit.rowVersion
  );
}

export async function fetchVisitHistory(id: string) {
  const response = await apiFetch(
    `${API_BASE_URL}/api/visitas/${encodeURIComponent(id)}/historico`
  );
  if (!response.ok) throw await errorFrom(response);
  return (await response.json() as { items: Array<Record<string, unknown>> }).items;
}

export function invalidateNotifications() {
  window.dispatchEvent(new Event('mapa-notifications-invalidated'));
}
