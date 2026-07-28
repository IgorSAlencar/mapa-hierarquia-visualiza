import crypto from 'node:crypto';
import { ApiError } from '../domain/apiError.js';
import {
  COMMERCIAL_RESULTS,
  NOT_COMPLETED_REASONS,
  PRIORITIES,
  PRODUCT_RESULTS,
  PRODUCT_TREATMENT_STATUS,
  VISIT_STATUS,
  assertProductsComplete,
  assertVisitEditable,
  assertVisitTransition,
  optionalIsoDate,
  optionalText,
  requireIsoDate,
  requireOffsetTimestamp,
  requiredText,
  timestampOffsetMinutes,
} from '../domain/visitWorkflow.js';
import {
  appendVisitHistory,
  fetchStoreEvolutionSnapshot,
  fetchVisitBundle,
  fetchVisitCheckinRow,
  fetchVisitHistory,
  finalizeCompletedVisitRow,
  finalizeNotCompletedVisitRow,
  insertCheckinRow,
  publishVisitEvent,
  rescheduleVisitRows,
  updateVisitDraftRow,
  updateVisitProductRow,
  withLockedVisit,
} from '../repositories/visitsRepository.js';

function requirePositiveId(value, field = 'id') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ApiError('Identificador inválido.', {
      code: 'INVALID_ID',
      errors: [{ field, code: 'INVALID_ID', message: 'Informe um identificador positivo.' }],
    });
  }
  return parsed;
}

function actorCode(user) {
  const value = Number(user?.funcional);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ApiError('Usuário autenticado sem funcional válido.', {
      status: 403,
      code: 'INVALID_AUTHENTICATED_USER',
    });
  }
  return value;
}

function assertCanTreat(visit, user) {
  if (user?.isAdmin) return;
  if (Number(visit.COD_FUNC_RESPONSAVEL) !== actorCode(user)) {
    throw new ApiError('Somente o responsável pode registrar a tratativa desta visita.', {
      status: 403,
      code: 'VISIT_TREATMENT_FORBIDDEN',
    });
  }
}

function versionBase64(value) {
  return value == null ? null : Buffer.from(value).toString('base64');
}

function normalizeIfMatch(value) {
  const text = String(value ?? '').trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  if (!text) {
    throw new ApiError('Envie If-Match com a versão atual do registro.', {
      status: 428,
      code: 'PRECONDITION_REQUIRED',
    });
  }
  return text;
}

function assertVersion(value, ifMatch) {
  const expected = normalizeIfMatch(ifMatch);
  const current = versionBase64(value);
  if (current !== expected) {
    throw new ApiError('O registro foi alterado por outra operação. Atualize os dados e tente novamente.', {
      status: 412,
      code: 'ROW_VERSION_MISMATCH',
    });
  }
}

function iso(value) {
  return value == null ? null : new Date(value).toISOString();
}

function dateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timeOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(11, 19);
  return String(value).slice(0, 8);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function productDto(row) {
  return {
    id: String(row.ID),
    productId: Number(row.PRODUTO_ID),
    code: String(row.CODIGO_PRODUTO_SNAPSHOT),
    name: String(row.NOME_PRODUTO_SNAPSHOT),
    opportunityType: String(row.TIPO_OPORTUNIDADE),
    opportunity: parseJson(row.OPORTUNIDADE_SNAPSHOT_JSON, {}),
    treatmentStatus: String(row.STATUS_TRATATIVA),
    result: row.RESULTADO_VISITA == null ? null : String(row.RESULTADO_VISITA),
    notes: row.OBSERVACAO == null ? null : String(row.OBSERVACAO),
    notAddressedReason: row.JUSTIFICATIVA_NAO_ABORDADO == null
      ? null
      : String(row.JUSTIFICATIVA_NAO_ABORDADO),
    needsFollowUp: Boolean(row.NECESSITA_ACOMPANHAMENTO),
    followUpStatus: String(row.STATUS_ACOMPANHAMENTO),
    baseline: parseJson(row.BASELINE_JSON),
    evidence: parseJson(row.EVIDENCIA_ATUAL_JSON),
    nextEvaluationAt: iso(row.PROXIMA_VERIFICACAO_EM_UTC),
    evolutionDetectedAt: iso(row.EVOLUCAO_DETECTADA_EM_UTC),
    active: Boolean(row.ATIVO),
    rowVersion: versionBase64(row.VERSAO_LINHA),
  };
}

function visitDto(bundle) {
  const row = bundle.visit;
  const products = bundle.products.filter((product) => Boolean(product.ATIVO)).map(productDto);
  const treated = products.filter((product) => product.treatmentStatus !== 'PENDENTE').length;
  return {
    id: String(row.ID),
    routeId: String(row.ROTEIRO_ID),
    routeName: String(row.ROTEIRO_NOME ?? ''),
    routeStatus: String(row.ROTEIRO_STATUS ?? ''),
    stopId: String(row.PARADA_ROTEIRO_ID),
    stopOrder: Number(row.PARADA_ORDEM),
    current: Boolean(row.EH_ATUAL),
    sequence: Number(row.SEQUENCIA),
    store: {
      key: String(row.CHAVE_LOJA),
      name: String(row.NOME_LOJA),
      agencyCode: row.COD_AG == null ? null : String(row.COD_AG),
      supervisionKey: Number(row.CHAVE_SUPERVISAO),
      address: row.ENDERECO == null ? null : String(row.ENDERECO),
    },
    owner: {
      code: String(row.COD_FUNC_RESPONSAVEL).padStart(7, '0'),
      name: String(row.NOME_RESPONSAVEL),
    },
    createdBy: {
      code: String(row.COD_FUNC_CRIADOR).padStart(7, '0'),
      name: String(row.NOME_CRIADOR),
    },
    plannedDate: dateOnly(row.DATA_PLANEJADA),
    plannedTime: timeOnly(row.HORARIO_PLANEJADO),
    timeZone: String(row.FUSO_HORARIO),
    priority: String(row.PRIORIDADE),
    orientation: row.ORIENTACAO == null ? null : String(row.ORIENTACAO),
    status: String(row.STATUS),
    answer: row.RESPOSTA_REALIZACAO == null ? null : String(row.RESPOSTA_REALIZACAO),
    commercialResult: String(row.RESULTADO_COMERCIAL),
    visitDate: dateOnly(row.DATA_VISITA),
    startedAt: iso(row.INICIO_EM_UTC),
    endedAt: iso(row.TERMINO_EM_UTC),
    notCompletedReason: row.MOTIVO_NAO_REALIZACAO == null
      ? null
      : String(row.MOTIVO_NAO_REALIZACAO),
    notCompletedJustification: row.JUSTIFICATIVA_NAO_REALIZACAO == null
      ? null
      : String(row.JUSTIFICATIVA_NAO_REALIZACAO),
    notes: row.OBSERVACAO_GERAL == null ? null : String(row.OBSERVACAO_GERAL),
    needsReturn: Boolean(row.NECESSITA_RETORNO),
    returnDate: dateOnly(row.DATA_PREVISTA_RETORNO),
    checkin: bundle.checkin
      ? {
          id: String(bundle.checkin.ID),
          deviceAt: iso(bundle.checkin.DATA_HORA_DISPOSITIVO_UTC),
          serverAt: iso(bundle.checkin.DATA_HORA_SERVIDOR_UTC),
          offsetMinutes: Number(bundle.checkin.FUSO_OFFSET_MINUTOS),
          userCode: String(bundle.checkin.COD_FUNC_USUARIO).padStart(7, '0'),
          validationStatus: String(bundle.checkin.STATUS_VALIDACAO),
        }
      : null,
    products,
    productProgress: { treated, total: products.length },
    routeProgress: {
      treated: Number(bundle.routeProgress?.VISITAS_TRATADAS ?? 0),
      total: Number(bundle.routeProgress?.TOTAL_VISITAS ?? 0),
      inProgress: Number(bundle.routeProgress?.EM_ANDAMENTO ?? 0),
      pending: Number(bundle.routeProgress?.PENDENTES ?? 0),
    },
    rowVersion: versionBase64(row.VERSAO_LINHA),
    updatedAt: iso(row.ATUALIZADO_EM_UTC),
  };
}

async function canonicalVisit(id, user) {
  const bundle = await fetchVisitBundle(id, user);
  if (!bundle) {
    throw new ApiError('Visita não encontrada ou fora do seu escopo.', {
      status: 404,
      code: 'VISIT_NOT_FOUND',
    });
  }
  return visitDto(bundle);
}

function requestContext(req) {
  return {
    correlationId: req.correlationId ?? crypto.randomUUID(),
    requestId: /^[0-9a-f-]{36}$/i.test(String(req.get('Idempotency-Key') ?? ''))
      ? req.get('Idempotency-Key')
      : null,
    ipAddress: req.ip ?? null,
    userAgent: optionalText(req.get('user-agent'), 500),
  };
}

async function mutateVisit(id, req, callback) {
  const visitId = requirePositiveId(id, 'visitId');
  const context = requestContext(req);
  const result = await withLockedVisit(visitId, req.user, async ({ transaction, visit, products }) => {
    assertCanTreat(visit, req.user);
    return callback({
      transaction,
      visit,
      products,
      actorCode: actorCode(req.user),
      context,
    });
  });
  if (result == null) {
    throw new ApiError('Visita não encontrada ou fora do seu escopo.', {
      status: 404,
      code: 'VISIT_NOT_FOUND',
    });
  }
  return result;
}

function normalizedCommon(body) {
  const commercialResult = String(body?.commercialResult ?? 'SEM_RESULTADO').toUpperCase();
  if (!COMMERCIAL_RESULTS.has(commercialResult)) {
    throw new ApiError('Resultado comercial inválido.', { code: 'INVALID_COMMERCIAL_RESULT' });
  }
  const needsReturn = Boolean(body?.needsReturn);
  const returnDate = optionalIsoDate(body?.returnDate, 'returnDate');
  if (needsReturn && !returnDate) {
    throw new ApiError('Informe a data prevista para retorno.', {
      code: 'RETURN_DATE_REQUIRED',
      errors: [{ field: 'returnDate', code: 'REQUIRED_FIELD', message: 'Campo obrigatório.' }],
    });
  }
  return {
    commercialResult,
    notes: optionalText(body?.notes, 2000),
    needsReturn,
    returnDate: needsReturn ? returnDate : null,
  };
}

function normalizedVisitPeriod(body) {
  const visitDate = requireIsoDate(body?.visitDate, 'visitDate');
  const startedAt = requireOffsetTimestamp(body?.startedAt, 'startedAt');
  const endedAt = body?.endedAt
    ? requireOffsetTimestamp(body.endedAt, 'endedAt')
    : null;
  if (endedAt && endedAt < startedAt) {
    throw new ApiError('O término não pode ser anterior ao início.', {
      code: 'INVALID_VISIT_PERIOD',
    });
  }
  return { visitDate, startedAt, endedAt };
}

export async function getVisit(id, user) {
  return canonicalVisit(requirePositiveId(id, 'visitId'), user);
}

export async function getHistory(id, user, limit) {
  const rows = await fetchVisitHistory(
    requirePositiveId(id, 'visitId'),
    user,
    Math.min(500, Math.max(1, Number(limit) || 200))
  );
  if (!rows) {
    throw new ApiError('Visita não encontrada ou fora do seu escopo.', {
      status: 404,
      code: 'VISIT_NOT_FOUND',
    });
  }
  return rows.map((row) => ({
    id: String(row.ID),
    type: String(row.TIPO_EVENTO),
    previousStatus: row.STATUS_ANTERIOR == null ? null : String(row.STATUS_ANTERIOR),
    newStatus: row.STATUS_NOVO == null ? null : String(row.STATUS_NOVO),
    previousData: parseJson(row.DADOS_ANTERIORES_JSON),
    newData: parseJson(row.DADOS_NOVOS_JSON),
    reason: row.MOTIVO == null ? null : String(row.MOTIVO),
    actorCode: row.COD_FUNC_ATOR == null ? null : String(row.COD_FUNC_ATOR).padStart(7, '0'),
    origin: String(row.ORIGEM),
    correlationId: String(row.CORRELATION_ID),
    occurredAt: iso(row.OCORRIDO_EM_UTC),
  }));
}

export async function saveDraft(id, body, req) {
  await mutateVisit(id, req, async ({ transaction, visit, actorCode: code, context }) => {
    assertVersion(visit.VERSAO_LINHA, req.get('If-Match'));
    assertVisitEditable(visit.STATUS);
    const answer = body?.answer == null ? null : String(body.answer).toUpperCase();
    if (answer != null && !['SIM', 'NAO', 'REAGENDADA'].includes(answer)) {
      throw new ApiError('Resposta de realização inválida.', { code: 'INVALID_VISIT_ANSWER' });
    }
    const values = {
      answer,
      visitDate: optionalIsoDate(body?.visitDate, 'visitDate'),
      startedAt: body?.startedAt ? requireOffsetTimestamp(body.startedAt, 'startedAt') : null,
      endedAt: body?.endedAt ? requireOffsetTimestamp(body.endedAt, 'endedAt') : null,
      ...normalizedCommon(body),
    };
    if (values.startedAt && values.endedAt && values.endedAt < values.startedAt) {
      throw new ApiError('O término não pode ser anterior ao início.', {
        code: 'INVALID_VISIT_PERIOD',
      });
    }
    await updateVisitDraftRow(transaction, visit.ID, values, code);
    await appendVisitHistory(transaction, {
      visitId: visit.ID,
      eventType: 'RASCUNHO_SALVO',
      previousStatus: visit.STATUS,
      newStatus: visit.STATUS,
      newData: values,
      actorCode: code,
      ...context,
    });
  });
  return canonicalVisit(id, req.user);
}

export async function checkinVisit(id, body, req) {
  await mutateVisit(id, req, async ({ transaction, visit, actorCode: code, context }) => {
    assertVersion(visit.VERSAO_LINHA, req.get('If-Match'));
    assertVisitEditable(visit.STATUS);
    if (visit.STATUS === VISIT_STATUS.PENDING) {
      assertVisitTransition(visit.STATUS, VISIT_STATUS.IN_PROGRESS);
    } else if (visit.STATUS !== VISIT_STATUS.IN_PROGRESS) {
      assertVisitTransition(visit.STATUS, VISIT_STATUS.IN_PROGRESS);
    }
    const rawOccurredAt = String(body?.occurredAt ?? '');
    const occurredAt = requireOffsetTimestamp(rawOccurredAt, 'occurredAt');
    const values = {
      deviceAt: occurredAt,
      offsetMinutes: timestampOffsetMinutes(rawOccurredAt),
      visitDate: requireIsoDate(body?.visitDate ?? rawOccurredAt.slice(0, 10), 'visitDate'),
      deviceEventId: requiredText(body?.deviceEventId, 100, 'deviceEventId'),
    };
    const result = await insertCheckinRow(transaction, visit, values, code);
    if (result.created) {
      await appendVisitHistory(transaction, {
        visitId: visit.ID,
        checkinId: result.row.ID,
        eventType: 'CHECKIN_REGISTRADO',
        previousStatus: visit.STATUS,
        newStatus: VISIT_STATUS.IN_PROGRESS,
        newData: {
          deviceAt: occurredAt.toISOString(),
          serverAt: result.row.DATA_HORA_SERVIDOR_UTC,
          validationStatus: 'NAO_APLICAVEL',
        },
        actorCode: code,
        ...context,
      });
    }
  });
  return canonicalVisit(id, req.user);
}

export async function treatProduct(id, productIdValue, body, req) {
  const productId = requirePositiveId(productIdValue, 'productId');
  await mutateVisit(id, req, async ({ transaction, visit, products, actorCode: code, context }) => {
    assertVisitEditable(visit.STATUS);
    const product = products.find((item) => Number(item.ID) === productId && Boolean(item.ATIVO));
    if (!product) {
      throw new ApiError('Produto foco não encontrado nesta visita.', {
        status: 404,
        code: 'VISIT_PRODUCT_NOT_FOUND',
      });
    }
    assertVersion(product.VERSAO_LINHA, req.get('If-Match'));
    const status = String(body?.status ?? '').toUpperCase();
    if (![PRODUCT_TREATMENT_STATUS.TREATED, PRODUCT_TREATMENT_STATUS.NOT_ADDRESSED].includes(status)) {
      throw new ApiError('Status de tratativa do produto inválido.', {
        code: 'INVALID_PRODUCT_TREATMENT_STATUS',
      });
    }
    const notAddressed = status === PRODUCT_TREATMENT_STATUS.NOT_ADDRESSED;
    const result = notAddressed ? 'NAO_ABORDADO' : String(body?.result ?? '').toUpperCase();
    if (!PRODUCT_RESULTS.has(result) || (!notAddressed && result === 'NAO_ABORDADO')) {
      throw new ApiError('Resultado do produto inválido.', { code: 'INVALID_PRODUCT_RESULT' });
    }
    const values = {
      status,
      result,
      notes: optionalText(body?.notes, 2000),
      notAddressedReason: notAddressed
        ? requiredText(body?.notAddressedReason, 1000, 'notAddressedReason')
        : null,
      needsFollowUp: notAddressed ? false : Boolean(body?.needsFollowUp),
    };
    await updateVisitProductRow(transaction, productId, values, code);
    await appendVisitHistory(transaction, {
      visitId: visit.ID,
      productId,
      eventType: 'PRODUTO_TRATADO',
      previousStatus: visit.STATUS,
      newStatus: visit.STATUS,
      previousData: productDto(product),
      newData: values,
      actorCode: code,
      ...context,
    });
  });
  return canonicalVisit(id, req.user);
}

export async function completeVisit(id, body, req) {
  await mutateVisit(id, req, async ({
    transaction,
    visit,
    products,
    actorCode: code,
    context,
  }) => {
    assertVersion(visit.VERSAO_LINHA, req.get('If-Match'));
    assertVisitTransition(visit.STATUS, VISIT_STATUS.COMPLETED);
    assertProductsComplete(products);
    const checkin = await fetchVisitCheckinRow(transaction, visit.ID);
    if (!checkin) {
      throw new ApiError('Registre o check-in antes de concluir a visita.', {
        status: 422,
        code: 'VISIT_CHECKIN_REQUIRED',
      });
    }
    const values = { ...normalizedVisitPeriod(body), ...normalizedCommon(body) };
    const snapshot = await fetchStoreEvolutionSnapshot(visit.CHAVE_LOJA);
    await finalizeCompletedVisitRow(transaction, visit, values, snapshot, code);
    await appendVisitHistory(transaction, {
      visitId: visit.ID,
      eventType: 'VISITA_CONCLUIDA',
      previousStatus: visit.STATUS,
      newStatus: VISIT_STATUS.COMPLETED,
      newData: {
        visitDate: values.visitDate,
        startedAt: values.startedAt.toISOString(),
        endedAt: values.endedAt?.toISOString() ?? null,
        commercialResult: values.commercialResult,
      },
      actorCode: code,
      ...context,
    });
    await publishVisitEvent(transaction, {
      type: 'VISITA_REALIZADA',
      aggregateType: 'VISITA',
      aggregateId: visit.ID,
      correlationId: context.correlationId,
      dedupeKey: `VISITA_REALIZADA:${visit.ID}`,
      payload: { visitId: String(visit.ID), storeKey: String(visit.CHAVE_LOJA) },
    });
  });
  return canonicalVisit(id, req.user);
}

export async function notCompleteVisit(id, body, req) {
  await mutateVisit(id, req, async ({ transaction, visit, actorCode: code, context }) => {
    assertVersion(visit.VERSAO_LINHA, req.get('If-Match'));
    assertVisitTransition(visit.STATUS, VISIT_STATUS.NOT_COMPLETED);
    const reason = String(body?.reason ?? '').toUpperCase();
    if (!NOT_COMPLETED_REASONS.has(reason)) {
      throw new ApiError('Motivo de não realização inválido.', {
        code: 'INVALID_NOT_COMPLETED_REASON',
      });
    }
    const justification = reason === 'OUTRO'
      ? requiredText(body?.justification, 1000, 'justification')
      : optionalText(body?.justification, 1000);
    await finalizeNotCompletedVisitRow(transaction, visit, { reason, justification }, code);
    await appendVisitHistory(transaction, {
      visitId: visit.ID,
      eventType: 'VISITA_NAO_REALIZADA',
      previousStatus: visit.STATUS,
      newStatus: VISIT_STATUS.NOT_COMPLETED,
      reason,
      newData: { reason, justification },
      actorCode: code,
      ...context,
    });
  });
  return canonicalVisit(id, req.user);
}

function normalizedTime(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)) {
    throw new ApiError('Horário inválido. Use HH:mm.', {
      code: 'INVALID_TIME_FORMAT',
    });
  }
  return text.length === 5 ? `${text}:00` : text;
}

export async function rescheduleVisit(id, body, req) {
  let successorId;
  await mutateVisit(id, req, async ({
    transaction,
    visit,
    products,
    actorCode: code,
    context,
  }) => {
    assertVersion(visit.VERSAO_LINHA, req.get('If-Match'));
    assertVisitTransition(visit.STATUS, VISIT_STATUS.RESCHEDULED);
    const priority = String(body?.priority ?? visit.PRIORIDADE ?? 'NORMAL').toUpperCase();
    if (!PRIORITIES.has(priority)) {
      throw new ApiError('Prioridade inválida.', { code: 'INVALID_PRIORITY' });
    }
    const values = {
      newDate: requireIsoDate(body?.newDate, 'newDate'),
      newTime: normalizedTime(body?.newTime),
      reason: requiredText(body?.reason, 40, 'reason').toUpperCase(),
      justification: optionalText(body?.justification, 1000),
      orientation: optionalText(body?.orientation ?? visit.ORIENTACAO, 1000),
      priority,
    };
    const result = await rescheduleVisitRows(
      transaction,
      visit,
      products,
      values,
      code,
      context.correlationId
    );
    successorId = result.newVisitId;
    await appendVisitHistory(transaction, {
      visitId: visit.ID,
      eventType: 'VISITA_REAGENDADA',
      previousStatus: visit.STATUS,
      newStatus: VISIT_STATUS.RESCHEDULED,
      reason: values.reason,
      newData: { ...values, successorVisitId: String(successorId) },
      actorCode: code,
      ...context,
    });
    await appendVisitHistory(transaction, {
      visitId: successorId,
      eventType: 'VISITA_CRIADA_POR_REAGENDAMENTO',
      newStatus: VISIT_STATUS.PENDING,
      newData: { previousVisitId: String(visit.ID), ...values },
      actorCode: code,
      ...context,
    });
    await publishVisitEvent(transaction, {
      type: 'VISITA_REAGENDADA',
      aggregateType: 'VISITA',
      aggregateId: successorId,
      correlationId: context.correlationId,
      dedupeKey: `VISITA_REAGENDADA:${visit.ID}:${successorId}`,
      payload: {
        previousVisitId: String(visit.ID),
        visitId: String(successorId),
        plannedDate: values.newDate,
      },
    });
  });
  return canonicalVisit(successorId, req.user);
}
