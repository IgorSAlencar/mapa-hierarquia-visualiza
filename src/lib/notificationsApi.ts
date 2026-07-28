import { apiFetch } from '@/lib/apiClient';
import { randomUuid } from '@/lib/randomUuid';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'BAIXA' | 'NORMAL' | 'ALTA' | 'CRITICA';
  status: 'NOVA' | 'VISUALIZADA' | 'LIDA' | 'ADIADA' | 'RESOLVIDA';
  occurrenceStatus: string;
  entityType: string;
  entityId: string;
  routeId: string | null;
  visitId: string | null;
  visitProductId: string | null;
  storeKey: string | null;
  destination: Record<string, unknown>;
  actions: string[];
  createdAt: string;
  availableAt: string;
  expiresAt: string | null;
  firstDeliveredAt: string;
  lastDeliveredAt: string;
  deliveryCount: number;
  readAt: string | null;
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
  snoozeCount: number;
  executedAction: string | null;
  rowVersion: string;
}

async function errorFrom(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { detail?: string; message?: string; code?: string };
    const error = new Error(body.detail ?? body.message ?? `Erro ${response.status}`);
    error.name = body.code ?? 'NOTIFICATION_ERROR';
    return error;
  } catch {
    return new Error(`Erro ${response.status}`);
  }
}

function commandHeaders(rowVersion?: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Idempotency-Key': randomUuid(),
    ...(rowVersion ? { 'If-Match': `"${rowVersion}"` } : {}),
  };
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await apiFetch(`${API_BASE_URL}/api/notificacoes/contador`);
  if (!response.ok) throw await errorFrom(response);
  return Number((await response.json() as { unread?: number }).unread ?? 0);
}

export async function fetchNotifications(options: {
  offset?: number;
  limit?: number;
  status?: string;
} = {}): Promise<{ items: AppNotification[]; nextOffset: number | null }> {
  const params = new URLSearchParams();
  if (options.offset) params.set('offset', String(options.offset));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.status) params.set('status', options.status);
  const response = await apiFetch(`${API_BASE_URL}/api/notificacoes?${params}`);
  if (!response.ok) throw await errorFrom(response);
  const body = await response.json() as {
    items?: AppNotification[];
    nextOffset?: number | null;
  };
  return {
    items: Array.isArray(body.items) ? body.items : [],
    nextOffset: body.nextOffset ?? null,
  };
}

export async function markNotificationRead(notification: AppNotification): Promise<AppNotification> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/notificacoes/${notification.id}/leitura`,
    {
      method: 'PATCH',
      headers: commandHeaders(notification.rowVersion),
      body: '{}',
    }
  );
  if (!response.ok) throw await errorFrom(response);
  return (await response.json() as { notification: AppNotification }).notification;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await apiFetch(`${API_BASE_URL}/api/notificacoes/leitura-em-massa`, {
    method: 'POST',
    headers: commandHeaders(),
    body: '{}',
  });
  if (!response.ok) throw await errorFrom(response);
  return Number((await response.json() as { updated?: number }).updated ?? 0);
}

export async function snoozeNotification(
  notification: AppNotification,
  until: string,
  notes?: string
): Promise<AppNotification> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/notificacoes/${notification.id}/adiamento`,
    {
      method: 'POST',
      headers: commandHeaders(notification.rowVersion),
      body: JSON.stringify({ until, notes }),
    }
  );
  if (!response.ok) throw await errorFrom(response);
  return (await response.json() as { notification: AppNotification }).notification;
}

export async function executeNotificationAction(
  notification: AppNotification,
  action: string,
  payload: Record<string, unknown> = {}
): Promise<{ notification: AppNotification; destination: Record<string, unknown> }> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/notificacoes/${notification.id}/acoes`,
    {
      method: 'POST',
      headers: commandHeaders(notification.rowVersion),
      body: JSON.stringify({ action, ...payload }),
    }
  );
  if (!response.ok) throw await errorFrom(response);
  return response.json() as Promise<{
    notification: AppNotification;
    destination: Record<string, unknown>;
  }>;
}

/** Formata datas ISO embutidas em mensagens já persistidas (`2026-07-28` → `28/07/2026`). */
export function formatNotificationMessage(message: string): string {
  return String(message ?? '').replace(
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    (_match, year: string, month: string, day: string) => `${day}/${month}/${year}`
  );
}

export function notificationDestinationUrl(notification: AppNotification): string {
  const destination = notification.destination ?? {};
  const params = new URLSearchParams();
  params.set('section', String(destination.section ?? 'visitas'));
  if (notification.routeId) params.set('routeId', notification.routeId);
  if (notification.visitId) params.set('visitId', notification.visitId);
  if (notification.visitProductId) params.set('visitProductId', notification.visitProductId);
  if (destination.openTreatment !== false && notification.visitId) params.set('drawer', '1');
  if (destination.step != null) params.set('step', String(destination.step));
  // Garante reentrada: React Router ignora navigate() para a mesma URL,
  // e o Index só processa cada deep link uma vez.
  params.set('focus', String(Date.now()));
  return `/?${params}`;
}
