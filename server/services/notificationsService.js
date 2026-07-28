import { ApiError } from '../domain/apiError.js';
import {
  optionalText,
  requireOffsetTimestamp,
  requiredText,
} from '../domain/visitWorkflow.js';
import {
  acknowledgeNotificationRow,
  closeProductWithoutContinuityRow,
  completeNotificationActionRow,
  createFollowUpRow,
  fetchNotificationForUser,
  fetchNotificationsForUser,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationReadRow,
  snoozeNotificationRow,
  withLockedUserNotification,
} from '../repositories/notificationsRepository.js';
import { appendVisitHistory } from '../repositories/visitsRepository.js';

function userCode(user) {
  const value = Number(user?.funcional);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ApiError('Usuário autenticado inválido.', {
      status: 403,
      code: 'INVALID_AUTHENTICATED_USER',
    });
  }
  return value;
}

function positiveId(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ApiError('Notificação inválida.', { code: 'INVALID_NOTIFICATION_ID' });
  }
  return parsed;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function iso(value) {
  return value == null ? null : new Date(value).toISOString();
}

function version(value) {
  return value == null ? null : Buffer.from(value).toString('base64');
}

function resolveActions(row) {
  const actions = parseJson(row.ACOES_JSON, [])
    .map((item) => String(item).toUpperCase())
    .filter((action) => action && action !== 'ABRIR_MAPA');
  if (row.CIENCIA_EM_UTC) {
    return actions.filter((action) => action !== 'CONFIRMAR_CIENCIA');
  }
  return actions;
}

function notificationDto(row) {
  return {
    id: String(row.ID),
    type: String(row.TIPO),
    title: String(row.TITULO),
    message: String(row.MENSAGEM),
    priority: String(row.PRIORIDADE),
    status: String(row.USUARIO_STATUS),
    occurrenceStatus: String(row.STATUS),
    entityType: String(row.ENTIDADE_TIPO),
    entityId: String(row.ENTIDADE_ID),
    routeId: row.ROTEIRO_ID == null ? null : String(row.ROTEIRO_ID),
    visitId: row.VISITA_ID == null ? null : String(row.VISITA_ID),
    visitProductId: row.VISITA_PRODUTO_ID == null ? null : String(row.VISITA_PRODUTO_ID),
    storeKey: row.CHAVE_LOJA == null ? null : String(row.CHAVE_LOJA),
    destination: parseJson(row.DESTINO_JSON, {}),
    actions: resolveActions(row),
    createdAt: iso(row.CRIADO_EM_UTC),
    availableAt: iso(row.DISPONIVEL_EM_UTC),
    expiresAt: iso(row.EXPIRA_EM_UTC),
    firstDeliveredAt: iso(row.PRIMEIRA_ENTREGA_EM_UTC),
    lastDeliveredAt: iso(row.ULTIMA_ENTREGA_EM_UTC),
    deliveryCount: Number(row.QTD_ENTREGAS),
    readAt: iso(row.LIDA_EM_UTC),
    acknowledgedAt: iso(row.CIENCIA_EM_UTC),
    snoozedUntil: iso(row.ADIADA_ATE_EM_UTC),
    snoozeCount: Number(row.QTD_ADIAMENTOS),
    executedAction: row.ACAO_EXECUTADA == null ? null : String(row.ACAO_EXECUTADA),
    rowVersion: version(row.USUARIO_VERSAO_LINHA),
  };
}

function assertIfMatch(row, header) {
  const expected = String(header ?? '').trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  if (!expected) {
    throw new ApiError('Envie If-Match com a versão atual da notificação.', {
      status: 428,
      code: 'PRECONDITION_REQUIRED',
    });
  }
  if (expected !== version(row.USUARIO_VERSAO_LINHA)) {
    throw new ApiError('A notificação já foi alterada. Atualize a lista.', {
      status: 412,
      code: 'ROW_VERSION_MISMATCH',
    });
  }
}

function assertActionable(row) {
  if (row.STATUS !== 'ATIVA') {
    throw new ApiError('Esta notificação não está mais ativa.', {
      status: 409,
      code: 'NOTIFICATION_ALREADY_RESOLVED',
    });
  }
  if (row.EXPIRA_EM_UTC && new Date(row.EXPIRA_EM_UTC) <= new Date()) {
    throw new ApiError('Esta ação expirou.', {
      status: 410,
      code: 'NOTIFICATION_ACTION_EXPIRED',
    });
  }
}

async function canonical(id, code) {
  const row = await fetchNotificationForUser(id, code);
  if (!row) {
    throw new ApiError('Notificação não encontrada.', {
      status: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });
  }
  return notificationDto(row);
}

export async function listNotifications(user, query = {}) {
  const status = query.status == null || query.status === ''
    ? null
    : String(query.status).toUpperCase();
  const validStatuses = new Set(['NOVA', 'VISUALIZADA', 'LIDA', 'ADIADA']);
  if (status && !validStatuses.has(status)) {
    throw new ApiError('Filtro de status inválido.', { code: 'INVALID_NOTIFICATION_STATUS' });
  }
  const offset = Math.max(0, Number(query.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
  const rows = await fetchNotificationsForUser(userCode(user), { status, offset, limit: limit + 1 });
  return {
    items: rows.slice(0, limit).map(notificationDto),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}

export async function unreadCount(user) {
  return fetchUnreadNotificationCount(userCode(user));
}

export async function readNotification(idValue, user, ifMatch) {
  const id = positiveId(idValue);
  const code = userCode(user);
  const result = await withLockedUserNotification(id, code, async (transaction, row) => {
    assertIfMatch(row, ifMatch);
    await markNotificationReadRow(transaction, id, code, code);
    return true;
  });
  if (!result) {
    throw new ApiError('Notificação não encontrada.', {
      status: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });
  }
  return canonical(id, code);
}

export async function readAllNotifications(user) {
  return { updated: await markAllNotificationsRead(userCode(user)) };
}

export async function snoozeNotification(idValue, body, req) {
  const id = positiveId(idValue);
  const code = userCode(req.user);
  const until = requireOffsetTimestamp(body?.until, 'until');
  const now = new Date();
  if (until <= now || until > new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) {
    throw new ApiError('O adiamento deve ficar entre agora e 30 dias.', {
      code: 'INVALID_SNOOZE_WINDOW',
    });
  }
  const result = await withLockedUserNotification(id, code, async (transaction, row) => {
    assertIfMatch(row, req.get('If-Match'));
    assertActionable(row);
    await snoozeNotificationRow(transaction, id, code, until, code);
    if (row.VISITA_ID) {
      const followUpId = await createFollowUpRow(transaction, row, {
        type: 'LEMBRETE_ADIADO',
        action: 'ADIAR_LEMBRETE',
        status: 'AGENDADO',
        notes: optionalText(body?.notes, 2000) ?? 'Lembrete adiado pelo usuário.',
        nextAt: until,
      }, code);
      await appendVisitHistory(transaction, {
        visitId: row.VISITA_ID,
        productId: row.VISITA_PRODUTO_ID,
        notificationId: row.ID,
        eventType: 'NOTIFICACAO_ADIADA',
        newData: { followUpId: String(followUpId), until: until.toISOString() },
        actorCode: code,
        correlationId: req.correlationId,
        origin: 'USUARIO',
      });
    }
    return true;
  });
  if (!result) {
    throw new ApiError('Notificação não encontrada.', {
      status: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });
  }
  return canonical(id, code);
}

function allowedActions(row) {
  return new Set(resolveActions(row));
}

export async function executeNotificationAction(idValue, body, req) {
  const id = positiveId(idValue);
  const code = userCode(req.user);
  const action = String(body?.action ?? '').toUpperCase();
  let destination = null;
  const result = await withLockedUserNotification(id, code, async (transaction, row) => {
    assertIfMatch(row, req.get('If-Match'));
    assertActionable(row);
    if (!allowedActions(row).has(action)) {
      throw new ApiError('Ação indisponível para esta notificação.', {
        code: 'NOTIFICATION_ACTION_NOT_ALLOWED',
      });
    }
    destination = parseJson(row.DESTINO_JSON, {});
    if (['VER_VISITA', 'VER_ROTEIRO', 'REGISTRAR_VISITA'].includes(action)) {
      await markNotificationReadRow(transaction, id, code, code);
      return true;
    }
    if (action === 'CONFIRMAR_CIENCIA') {
      if (!row.CIENCIA_EM_UTC) {
        await acknowledgeNotificationRow(transaction, id, code, code);
      }
      return true;
    }
    if (!row.VISITA_ID) {
      throw new ApiError('A notificação não possui visita associada.', {
        status: 409,
        code: 'NOTIFICATION_WITHOUT_VISIT',
      });
    }

    if (action === 'REGISTRAR_ACOMPANHAMENTO') {
      const notes = requiredText(body?.notes, 2000, 'notes');
      const followUpId = await createFollowUpRow(transaction, row, {
        type: 'CONTATO',
        action,
        status: 'CONCLUIDO',
        notes,
        nextAt: null,
      }, code);
      await completeNotificationActionRow(transaction, row, code, action, code, {
        resolveOccurrence: true,
      });
      await appendVisitHistory(transaction, {
        visitId: row.VISITA_ID,
        productId: row.VISITA_PRODUTO_ID,
        notificationId: row.ID,
        eventType: 'ACOMPANHAMENTO_REGISTRADO',
        newData: { followUpId: String(followUpId), notes },
        actorCode: code,
        correlationId: req.correlationId,
        origin: 'USUARIO',
      });
      return true;
    }

    if (action === 'REAGENDAR_CONTATO') {
      const nextAt = requireOffsetTimestamp(body?.nextAt, 'nextAt');
      if (nextAt <= new Date()) {
        throw new ApiError('A nova data do contato precisa estar no futuro.', {
          code: 'FOLLOW_UP_DATE_MUST_BE_FUTURE',
        });
      }
      const notes = optionalText(body?.notes, 2000) ?? 'Contato reagendado.';
      const followUpId = await createFollowUpRow(transaction, row, {
        type: 'REAGENDAMENTO_CONTATO',
        action,
        status: 'AGENDADO',
        notes,
        nextAt,
      }, code);
      await snoozeNotificationRow(transaction, id, code, nextAt, code);
      await appendVisitHistory(transaction, {
        visitId: row.VISITA_ID,
        productId: row.VISITA_PRODUTO_ID,
        notificationId: row.ID,
        eventType: 'CONTATO_REAGENDADO',
        newData: { followUpId: String(followUpId), nextAt: nextAt.toISOString() },
        actorCode: code,
        correlationId: req.correlationId,
        origin: 'USUARIO',
      });
      return true;
    }

    if (action === 'MARCAR_SEM_CONTINUIDADE') {
      if (!row.VISITA_PRODUTO_ID) {
        throw new ApiError('A notificação não possui produto associado.', {
          status: 409,
          code: 'NOTIFICATION_WITHOUT_PRODUCT',
        });
      }
      const notes = requiredText(body?.notes, 1000, 'notes');
      const followUpId = await createFollowUpRow(transaction, row, {
        type: 'SEM_CONTINUIDADE',
        action,
        status: 'CONCLUIDO',
        notes,
        nextAt: null,
      }, code);
      await closeProductWithoutContinuityRow(transaction, row.VISITA_PRODUTO_ID, notes, code);
      await completeNotificationActionRow(transaction, row, code, action, code, {
        resolveOccurrence: true,
      });
      await appendVisitHistory(transaction, {
        visitId: row.VISITA_ID,
        productId: row.VISITA_PRODUTO_ID,
        notificationId: row.ID,
        eventType: 'PRODUTO_SEM_CONTINUIDADE',
        newData: { followUpId: String(followUpId), notes },
        actorCode: code,
        correlationId: req.correlationId,
        origin: 'USUARIO',
      });
      return true;
    }

    if (action === 'SOLICITAR_ACOMPANHAMENTO') {
      const notes = optionalText(body?.notes, 2000)
        ?? 'Acompanhamento solicitado pelo gestor responsável pelo alerta.';
      const followUpId = await createFollowUpRow(transaction, row, {
        type: 'COMENTARIO_SUPERIOR',
        action,
        status: 'ABERTO',
        notes,
        nextAt: null,
      }, code);
      await completeNotificationActionRow(transaction, row, code, action, code);
      await appendVisitHistory(transaction, {
        visitId: row.VISITA_ID,
        productId: row.VISITA_PRODUTO_ID,
        notificationId: row.ID,
        eventType: 'ACOMPANHAMENTO_SOLICITADO_POR_SUPERIOR',
        newData: { followUpId: String(followUpId), notes },
        actorCode: code,
        correlationId: req.correlationId,
        origin: 'USUARIO',
      });
      return true;
    }

    throw new ApiError('Ação ainda não implementada para este tipo.', {
      status: 422,
      code: 'NOTIFICATION_ACTION_NOT_IMPLEMENTED',
    });
  });
  if (!result) {
    throw new ApiError('Notificação não encontrada.', {
      status: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });
  }
  return { notification: await canonical(id, code), destination };
}
