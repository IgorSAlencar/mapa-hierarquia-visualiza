import crypto from 'node:crypto';
import { pool, poolConnect, sql } from '../db/sqlServer.js';
import { applyAccessScope } from '../auth/scopeSql.js';
import {
  storeBusinessQuantitySql,
  storeCreditQuantitySql,
} from '../domain/productionMetrics.js';
import { sqlTimeValue } from '../domain/sqlTime.js';

function visitScopeSql(request, user, alias = 'v', entityAlias = 'visit_ent', prefix = 'visitAuth') {
  if (user?.isAdmin) return '';
  if (user?.role === 'supervisor') {
    request.input(`${prefix}Owner`, sql.Int, Number(user.funcional));
    return ` AND ${alias}.COD_FUNC_RESPONSAVEL = @${prefix}Owner`;
  }
  const accessSql = applyAccessScope(request, user, entityAlias, `${prefix}Func`);
  return `
    AND EXISTS (
      SELECT 1
      FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ${entityAlias}
      WHERE ${entityAlias}.CHAVE_SUPERVISAO = ${alias}.CHAVE_SUPERVISAO
        ${accessSql}
    )
  `;
}

async function insertOutbox(transaction, {
  type,
  aggregateType,
  aggregateId,
  payload,
  correlationId,
  dedupeKey = null,
  occurredAt = new Date(),
}) {
  const request = new sql.Request(transaction);
  request.input('eventId', sql.UniqueIdentifier, crypto.randomUUID());
  request.input('type', sql.VarChar(80), type);
  request.input('aggregateType', sql.VarChar(30), aggregateType);
  request.input('aggregateId', sql.NVarChar(100), String(aggregateId));
  request.input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload));
  request.input('dedupeKey', sql.NVarChar(250), dedupeKey);
  request.input('correlationId', sql.UniqueIdentifier, correlationId);
  request.input('occurredAt', sql.DateTime2(3), occurredAt);
  const result = await request.query(`
    IF @dedupeKey IS NULL OR NOT EXISTS (
      SELECT 1
      FROM TESTE..TB_EVENTO_OUTBOX WITH (UPDLOCK, HOLDLOCK)
      WHERE CHAVE_DEDUPLICACAO = @dedupeKey
    )
    BEGIN
      INSERT INTO TESTE..TB_EVENTO_OUTBOX (
        EVENTO_ID,
        TIPO_EVENTO,
        AGREGADO_TIPO,
        AGREGADO_ID,
        PAYLOAD_JSON,
        CHAVE_DEDUPLICACAO,
        CORRELATION_ID,
        OCORRIDO_EM_UTC
      )
      OUTPUT INSERTED.EVENTO_ID
      VALUES (
        @eventId,
        @type,
        @aggregateType,
        @aggregateId,
        @payload,
        @dedupeKey,
        @correlationId,
        @occurredAt
      )
    END
  `);
  return result.recordset[0]?.EVENTO_ID ?? null;
}

export async function provisionVisitForStop(transaction, {
  routeId,
  stopId,
  stop,
  payload,
  productCodes,
  correlationId,
}) {
  const request = new sql.Request(transaction);
  request.input('stopId', sql.BigInt, stopId);
  request.input('routeId', sql.UniqueIdentifier, routeId);
  request.input('storeKey', sql.NVarChar(100), stop.chaveLoja);
  request.input('storeName', sql.NVarChar(250), stop.nome);
  request.input('agencyCode', sql.NVarChar(20), stop.codAg ?? null);
  request.input('supervisionKey', sql.Int, payload.owner.chaveSupervisao);
  request.input('address', sql.NVarChar(500), stop.endereco ?? null);
  request.input('ownerCode', sql.Int, Number(payload.owner.funcional));
  request.input('ownerName', sql.NVarChar(150), payload.owner.nome);
  request.input('creatorCode', sql.Int, Number(payload.createdBy.funcional));
  request.input('creatorName', sql.NVarChar(150), payload.createdBy.nome);
  request.input('plannedDate', sql.Date, payload.plannedDate);
  request.input('plannedTime', sql.Time(0), sqlTimeValue(stop.horario));
  request.input('priority', sql.VarChar(10), payload.priority ?? 'NORMAL');
  const inserted = await request.query(`
    INSERT INTO TESTE..TB_VISITA_TRATATIVA (
      PARADA_ROTEIRO_ID,
      ROTEIRO_ID,
      SEQUENCIA,
      EH_ATUAL,
      CHAVE_LOJA,
      NOME_LOJA,
      COD_AG,
      CHAVE_SUPERVISAO,
      ENDERECO,
      COD_FUNC_RESPONSAVEL,
      NOME_RESPONSAVEL,
      COD_FUNC_CRIADOR,
      NOME_CRIADOR,
      DATA_PLANEJADA,
      HORARIO_PLANEJADO,
      PRIORIDADE,
      STATUS,
      RESULTADO_COMERCIAL,
      CRIADO_POR,
      ATUALIZADO_POR
    )
    OUTPUT INSERTED.ID
    VALUES (
      @stopId,
      @routeId,
      1,
      1,
      @storeKey,
      @storeName,
      @agencyCode,
      @supervisionKey,
      @address,
      @ownerCode,
      @ownerName,
      @creatorCode,
      @creatorName,
      @plannedDate,
      @plannedTime,
      @priority,
      'PENDENTE',
      'SEM_RESULTADO',
      @creatorCode,
      @creatorCode
    )
  `);
  const visitId = inserted.recordset[0].ID;

  const products = new sql.Request(transaction);
  products.input(
    'productsJson',
    sql.NVarChar(sql.MAX),
    JSON.stringify(productCodes.map((code) => ({ code })))
  );
  products.input(
    'opportunityJson',
    sql.NVarChar(sql.MAX),
    JSON.stringify(stop.oportunidades ?? {})
  );
  products.input('visitId', sql.BigInt, visitId);
  products.input('creatorCode', sql.Int, Number(payload.createdBy.funcional));
  await products.query(`
    INSERT INTO TESTE..TB_VISITA_PRODUTO (
      VISITA_ID,
      PRODUTO_ID,
      REGRA_ACOMPANHAMENTO_ID,
      CODIGO_PRODUTO_SNAPSHOT,
      NOME_PRODUTO_SNAPSHOT,
      TIPO_OPORTUNIDADE,
      OPORTUNIDADE_SNAPSHOT_JSON,
      STATUS_TRATATIVA,
      NECESSITA_ACOMPANHAMENTO,
      STATUS_ACOMPANHAMENTO,
      CRIADO_POR,
      ATUALIZADO_POR
    )
    SELECT
      @visitId,
      p.ID,
      r.ID,
      p.CODIGO,
      p.NOME,
      'GERAL',
      @opportunityJson,
      'PENDENTE',
      0,
      'NAO_APLICAVEL',
      @creatorCode,
      @creatorCode
    FROM OPENJSON(@productsJson)
      WITH (CODIGO VARCHAR(40) '$.code') AS requested
    INNER JOIN TESTE..TB_PRODUTO_FOCO AS p
      ON p.CODIGO = requested.CODIGO
     AND p.ATIVO = 1
    LEFT JOIN TESTE..TB_PRODUTO_REGRA_ACOMPANHAMENTO AS r
      ON r.PRODUTO_ID = p.ID
     AND r.TIPO_OPORTUNIDADE = 'GERAL'
     AND r.ATIVO = 1
  `);

  await appendVisitHistory(transaction, {
    visitId,
    eventType: 'VISITA_CRIADA',
    newStatus: 'PENDENTE',
    newData: {
      routeId,
      stopId: String(stopId),
      plannedDate: payload.plannedDate,
      products: productCodes,
    },
    actorCode: Number(payload.createdBy.funcional),
    origin: 'USUARIO',
    correlationId,
    requestId: payload.requestId,
  });
  return visitId;
}

async function fetchSuperiorManagersBySupervision(transaction, chaveSupervisao) {
  const chave = Number(chaveSupervisao);
  if (!Number.isFinite(chave) || chave <= 0) return [];

  const request = new sql.Request(transaction);
  request.input('chaveSupervisao', sql.BigInt, chave);
  const result = await request.query(`
    SELECT DISTINCT
      TRY_CONVERT(INT, coord.COD_FUNC) AS COD_FUNC_COORDENADOR,
      TRY_CONVERT(INT, ga.COD_FUNC) AS COD_FUNC_GERENTE_AREA
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    LEFT JOIN TESTE..TB_COORD_COORDENADOR AS coord
      ON coord.CHAVE_COORDENACAO = ent.CHAVE_COORDENACAO
    LEFT JOIN TESTE..TB_COORD_GA AS ga
      ON ga.CHAVE_GERENCIA_AREA = ent.CHAVE_GERENCIA_AREA
    WHERE ent.CHAVE_SUPERVISAO = @chaveSupervisao
  `);

  const recipients = new Set();
  for (const row of result.recordset) {
    const coordenador = Number(row.COD_FUNC_COORDENADOR);
    const gerenteArea = Number(row.COD_FUNC_GERENTE_AREA);
    if (Number.isInteger(coordenador) && coordenador > 0) recipients.add(coordenador);
    if (Number.isInteger(gerenteArea) && gerenteArea > 0) recipients.add(gerenteArea);
  }
  return [...recipients];
}

function formatPlannedDateBr(value) {
  return String(value ?? '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
}

export async function recordRouteCreationEvents(transaction, {
  routeId,
  payload,
  stopCount,
  correlationId,
  notificationsEnabled,
}) {
  const audit = new sql.Request(transaction);
  audit.input('routeId', sql.UniqueIdentifier, routeId);
  audit.input('actorCode', sql.Int, Number(payload.createdBy.funcional));
  audit.input('correlationId', sql.UniqueIdentifier, correlationId);
  audit.input('requestId', sql.UniqueIdentifier, payload.requestId);
  audit.input(
    'newData',
    sql.NVarChar(sql.MAX),
    JSON.stringify({
      ownerCode: payload.owner.funcional,
      plannedDate: payload.plannedDate,
      priority: payload.priority ?? 'NORMAL',
      stopCount,
    })
  );
  await audit.query(`
    INSERT INTO TESTE..TB_AUDITORIA_ROTEIRO (
      ROTEIRO_ID,
      TIPO_EVENTO,
      DADOS_NOVOS_JSON,
      COD_FUNC_ATOR,
      ORIGEM,
      CORRELATION_ID,
      REQUEST_ID
    )
    VALUES (
      @routeId,
      'ROTEIRO_CRIADO',
      @newData,
      @actorCode,
      'USUARIO',
      @correlationId,
      @requestId
    )
  `);

  if (!notificationsEnabled) return;

  const ownerCode = Number(payload.owner.funcional);
  const creatorCode = Number(payload.createdBy.funcional);
  const plannedDateBr = formatPlannedDateBr(payload.plannedDate);
  const destination = {
    section: 'visitas',
    routeId,
    openTreatment: false,
    mapFocus: true,
  };

  // Superior atribuiu roteiro ao GC responsável.
  if (ownerCode !== creatorCode) {
    await insertOutbox(transaction, {
      type: 'ROTEIRO_ATRIBUIDO',
      aggregateType: 'ROTEIRO',
      aggregateId: routeId,
      correlationId,
      dedupeKey: `ROTEIRO_ATRIBUIDO:${routeId}:V1`,
      payload: {
        ruleCode: 'NOVO_ROTEIRO_ATRIBUIDO',
        dedupeKey: `NOVO_ROTEIRO_ATRIBUIDO:ROTEIRO:${routeId}:V1`,
        recipients: [ownerCode],
        originatorCode: creatorCode,
        routeId,
        entityType: 'ROTEIRO',
        entityId: routeId,
        storeKey: null,
        variables: {
          originatorName: payload.createdBy.nome,
          visitCount: stopCount,
          plannedDate: plannedDateBr,
        },
        destination,
      },
    });
  }

  // GC marcou visitas no próprio roteiro → avisa GC III e Gerente de Gestão.
  if (ownerCode === creatorCode) {
    const superiors = (await fetchSuperiorManagersBySupervision(
      transaction,
      payload.owner.chaveSupervisao
    )).filter((code) => code !== creatorCode);

    if (superiors.length > 0) {
      await insertOutbox(transaction, {
        type: 'ROTEIRO_MARCADO_EQUIPE',
        aggregateType: 'ROTEIRO',
        aggregateId: routeId,
        correlationId,
        dedupeKey: `ROTEIRO_MARCADO_EQUIPE:${routeId}:V1`,
        payload: {
          ruleCode: 'ROTEIRO_MARCADO_EQUIPE',
          dedupeKey: `ROTEIRO_MARCADO_EQUIPE:ROTEIRO:${routeId}:V1`,
          recipients: superiors,
          originatorCode: creatorCode,
          routeId,
          entityType: 'ROTEIRO',
          entityId: routeId,
          storeKey: null,
          variables: {
            originatorName: payload.createdBy.nome,
            ownerName: payload.owner.nome,
            visitCount: stopCount,
            plannedDate: plannedDateBr,
          },
          destination,
        },
      });
    }
  }
}

async function lockedVisit(transaction, id, user) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, id);
  const scopeSql = visitScopeSql(request, user, 'v', 'locked_ent', 'lockedAuth');
  const result = await request.query(`
    SELECT TOP (1)
      v.*,
      r.NOME AS ROTEIRO_NOME,
      r.STATUS_GESTAO AS ROTEIRO_STATUS,
      p.ATIVO AS PARADA_ATIVA,
      p.ORDEM AS PARADA_ORDEM
    FROM TESTE..TB_VISITA_TRATATIVA AS v WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN TESTE..ROTEIROS_MAPA AS r ON r.ID = v.ROTEIRO_ID
    INNER JOIN TESTE..ROTEIRO_PARADAS_MAPA AS p ON p.ID = v.PARADA_ROTEIRO_ID
    WHERE v.ID = @visitId
      ${scopeSql}
  `);
  return result.recordset[0] ?? null;
}

async function lockedProducts(transaction, visitId) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visitId);
  const result = await request.query(`
    SELECT *
    FROM TESTE..TB_VISITA_PRODUTO WITH (UPDLOCK, HOLDLOCK)
    WHERE VISITA_ID = @visitId
    ORDER BY ID
  `);
  return result.recordset;
}

export async function withLockedVisit(id, user, callback) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const visit = await lockedVisit(transaction, id, user);
    if (!visit) {
      await transaction.rollback();
      return { found: false, value: null };
    }
    const products = await lockedProducts(transaction, id);
    const value = await callback({ transaction, visit, products });
    await transaction.commit();
    return { found: true, value };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw error;
  }
}

export async function fetchVisitBundle(id, user) {
  const request = pool.request();
  request.input('visitId', sql.BigInt, id);
  const scopeSql = visitScopeSql(request, user, 'v', 'detail_ent', 'detailAuth');
  const result = await request.query(`
    SELECT TOP (1)
      v.*,
      r.NOME AS ROTEIRO_NOME,
      r.STATUS_GESTAO AS ROTEIRO_STATUS,
      r.PRIORIDADE AS ROTEIRO_PRIORIDADE,
      p.ORDEM AS PARADA_ORDEM,
      p.LAT AS LOJA_LAT,
      p.LNG AS LOJA_LNG,
      p.ATIVO AS PARADA_ATIVA,
      (
        SELECT TOP (1)
          LTRIM(RTRIM(CAST(agency_ent.NOME_AG AS NVARCHAR(255))))
        FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS agency_ent
        WHERE TRY_CAST(agency_ent.COD_AG AS BIGINT) = TRY_CAST(v.COD_AG AS BIGINT)
          AND NULLIF(LTRIM(RTRIM(CAST(agency_ent.NOME_AG AS NVARCHAR(255)))), N'') IS NOT NULL
        ORDER BY agency_ent.NOME_AG
      ) AS NOME_AG
    FROM TESTE..TB_VISITA_TRATATIVA AS v
    INNER JOIN TESTE..ROTEIROS_MAPA AS r ON r.ID = v.ROTEIRO_ID
    INNER JOIN TESTE..ROTEIRO_PARADAS_MAPA AS p ON p.ID = v.PARADA_ROTEIRO_ID
    WHERE v.ID = @visitId
      ${scopeSql};

    SELECT *
    FROM TESTE..TB_VISITA_PRODUTO
    WHERE VISITA_ID = @visitId
    ORDER BY ID;

    SELECT TOP (1) *
    FROM TESTE..TB_VISITA_CHECKIN
    WHERE VISITA_ID = @visitId
      AND TIPO = 'CHECKIN'
    ORDER BY DATA_HORA_SERVIDOR_UTC DESC;

    SELECT
      COUNT_BIG(*) AS TOTAL_VISITAS,
      SUM(CASE WHEN v2.STATUS IN (
        'REALIZADA', 'NAO_REALIZADA', 'REAGENDADA', 'CANCELADA'
      ) THEN 1 ELSE 0 END) AS VISITAS_TRATADAS,
      SUM(CASE WHEN v2.STATUS = 'EM_ANDAMENTO' THEN 1 ELSE 0 END) AS EM_ANDAMENTO,
      SUM(CASE WHEN v2.STATUS = 'PENDENTE' THEN 1 ELSE 0 END) AS PENDENTES
    FROM TESTE..TB_VISITA_TRATATIVA AS v2
    INNER JOIN TESTE..ROTEIRO_PARADAS_MAPA AS p2
      ON p2.ID = v2.PARADA_ROTEIRO_ID
    WHERE v2.ROTEIRO_ID = (
      SELECT ROTEIRO_ID FROM TESTE..TB_VISITA_TRATATIVA WHERE ID = @visitId
    )
      AND v2.EH_ATUAL = 1
      AND p2.ATIVO = 1;
  `);
  if (!result.recordsets[0]?.[0]) return null;
  return {
    visit: result.recordsets[0][0],
    products: result.recordsets[1] ?? [],
    checkin: result.recordsets[2]?.[0] ?? null,
    routeProgress: result.recordsets[3]?.[0] ?? null,
  };
}

export async function fetchVisitHistory(id, user, limit = 200) {
  const allowed = await fetchVisitBundle(id, user);
  if (!allowed) return null;
  const request = pool.request();
  request.input('visitId', sql.BigInt, id);
  request.input('limit', sql.Int, Math.min(500, Math.max(1, limit)));
  const result = await request.query(`
    SELECT TOP (@limit) *
    FROM TESTE..TB_HISTORICO_VISITA
    WHERE VISITA_ID = @visitId
    ORDER BY OCORRIDO_EM_UTC DESC, ID DESC
  `);
  return result.recordset;
}

export async function appendVisitHistory(transaction, {
  visitId,
  productId = null,
  checkinId = null,
  notificationId = null,
  eventType,
  previousStatus = null,
  newStatus = null,
  previousData = null,
  newData = null,
  reason = null,
  actorCode = null,
  origin = 'USUARIO',
  correlationId,
  requestId = null,
  ipAddress = null,
  userAgent = null,
}) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visitId);
  request.input('productId', sql.BigInt, productId);
  request.input('checkinId', sql.BigInt, checkinId);
  request.input('notificationId', sql.BigInt, notificationId);
  request.input('eventType', sql.VarChar(80), eventType);
  request.input('previousStatus', sql.VarChar(30), previousStatus);
  request.input('newStatus', sql.VarChar(30), newStatus);
  request.input(
    'previousData',
    sql.NVarChar(sql.MAX),
    previousData == null ? null : JSON.stringify(previousData)
  );
  request.input('newData', sql.NVarChar(sql.MAX), newData == null ? null : JSON.stringify(newData));
  request.input('reason', sql.NVarChar(1000), reason);
  request.input('actorCode', sql.Int, actorCode);
  request.input('origin', sql.VarChar(20), origin);
  request.input('correlationId', sql.UniqueIdentifier, correlationId);
  request.input('requestId', sql.UniqueIdentifier, requestId);
  request.input('ipAddress', sql.VarChar(45), ipAddress);
  request.input('userAgent', sql.NVarChar(500), userAgent);
  await request.query(`
    INSERT INTO TESTE..TB_HISTORICO_VISITA (
      VISITA_ID,
      VISITA_PRODUTO_ID,
      CHECKIN_ID,
      NOTIFICACAO_ID,
      TIPO_EVENTO,
      STATUS_ANTERIOR,
      STATUS_NOVO,
      DADOS_ANTERIORES_JSON,
      DADOS_NOVOS_JSON,
      MOTIVO,
      COD_FUNC_ATOR,
      ORIGEM,
      CORRELATION_ID,
      REQUEST_ID,
      IP_ADDRESS,
      USER_AGENT
    )
    VALUES (
      @visitId,
      @productId,
      @checkinId,
      @notificationId,
      @eventType,
      @previousStatus,
      @newStatus,
      @previousData,
      @newData,
      @reason,
      @actorCode,
      @origin,
      @correlationId,
      @requestId,
      @ipAddress,
      @userAgent
    )
  `);
}

export async function updateVisitDraftRow(transaction, visitId, values, actorCode) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visitId);
  request.input('answer', sql.VarChar(20), values.answer);
  request.input('visitDate', sql.Date, values.visitDate);
  request.input('startedAt', sql.DateTime2(3), values.startedAt);
  request.input('endedAt', sql.DateTime2(3), values.endedAt);
  request.input('notes', sql.NVarChar(2000), values.notes);
  request.input('needsReturn', sql.Bit, values.needsReturn);
  request.input('returnDate', sql.Date, values.returnDate);
  request.input('commercialResult', sql.VarChar(30), values.commercialResult);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_VISITA_TRATATIVA
    SET
      RESPOSTA_REALIZACAO = @answer,
      DATA_VISITA = @visitDate,
      INICIO_EM_UTC = @startedAt,
      TERMINO_EM_UTC = @endedAt,
      OBSERVACAO_GERAL = @notes,
      NECESSITA_RETORNO = @needsReturn,
      DATA_PREVISTA_RETORNO = @returnDate,
      RESULTADO_COMERCIAL = @commercialResult,
      SALVO_PARCIAL_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE ID = @visitId
  `);
}

export async function insertCheckinRow(transaction, visit, values, actorCode) {
  const existingRequest = new sql.Request(transaction);
  existingRequest.input('visitId', sql.BigInt, visit.ID);
  const existing = await existingRequest.query(`
    SELECT TOP (1) *
    FROM TESTE..TB_VISITA_CHECKIN WITH (UPDLOCK, HOLDLOCK)
    WHERE VISITA_ID = @visitId AND TIPO = 'CHECKIN'
  `);
  if (existing.recordset[0]) return { row: existing.recordset[0], created: false };

  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visit.ID);
  request.input('deviceAt', sql.DateTime2(3), values.deviceAt);
  request.input('offsetMinutes', sql.SmallInt, values.offsetMinutes);
  request.input('actorCode', sql.Int, actorCode);
  request.input('deviceEventId', sql.VarChar(100), values.deviceEventId);
  const inserted = await request.query(`
    INSERT INTO TESTE..TB_VISITA_CHECKIN (
      VISITA_ID,
      TIPO,
      DATA_HORA_DISPOSITIVO_UTC,
      FUSO_OFFSET_MINUTOS,
      COD_FUNC_USUARIO,
      STATUS_VALIDACAO,
      ORIGEM,
      DISPOSITIVO_EVENTO_ID
    )
    OUTPUT INSERTED.*
    VALUES (
      @visitId,
      'CHECKIN',
      @deviceAt,
      @offsetMinutes,
      @actorCode,
      'NAO_APLICAVEL',
      'SISTEMA',
      @deviceEventId
    )
  `);
  const row = inserted.recordset[0];

  const update = new sql.Request(transaction);
  update.input('visitId', sql.BigInt, visit.ID);
  update.input('deviceAt', sql.DateTime2(3), values.deviceAt);
  update.input('visitDate', sql.Date, values.visitDate);
  update.input('actorCode', sql.Int, actorCode);
  await update.query(`
    UPDATE TESTE..TB_VISITA_TRATATIVA
    SET
      STATUS = 'EM_ANDAMENTO',
      RESPOSTA_REALIZACAO = 'SIM',
      DATA_VISITA = COALESCE(DATA_VISITA, @visitDate),
      INICIO_EM_UTC = COALESCE(INICIO_EM_UTC, @deviceAt),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE ID = @visitId
  `);
  return { row, created: true };
}

export async function fetchVisitCheckinRow(transaction, visitId) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visitId);
  const result = await request.query(`
    SELECT TOP (1) *
    FROM TESTE..TB_VISITA_CHECKIN WITH (UPDLOCK, HOLDLOCK)
    WHERE VISITA_ID = @visitId
      AND TIPO = 'CHECKIN'
    ORDER BY DATA_HORA_SERVIDOR_UTC DESC
  `);
  return result.recordset[0] ?? null;
}

export async function updateVisitProductRow(transaction, productId, values, actorCode) {
  const request = new sql.Request(transaction);
  request.input('productId', sql.BigInt, productId);
  request.input('status', sql.VarChar(20), values.status);
  request.input('result', sql.VarChar(30), values.result);
  request.input('notes', sql.NVarChar(2000), values.notes);
  request.input('reason', sql.NVarChar(1000), values.notAddressedReason);
  request.input('needsFollowUp', sql.Bit, values.needsFollowUp);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_VISITA_PRODUTO
    SET
      STATUS_TRATATIVA = @status,
      RESULTADO_VISITA = @result,
      OBSERVACAO = @notes,
      JUSTIFICATIVA_NAO_ABORDADO = @reason,
      NECESSITA_ACOMPANHAMENTO = @needsFollowUp,
      STATUS_ACOMPANHAMENTO = CASE
        WHEN @needsFollowUp = 1 THEN 'ACOMPANHAMENTO_PENDENTE'
        ELSE 'NAO_APLICAVEL'
      END,
      TRATADO_EM_UTC = CASE WHEN @status = 'PENDENTE' THEN NULL ELSE SYSUTCDATETIME() END,
      TRATADO_POR = CASE WHEN @status = 'PENDENTE' THEN NULL ELSE @actorCode END,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE ID = @productId
      AND ATIVO = 1
  `);
}

export async function finalizeCompletedVisitRow(transaction, visit, values, snapshot, actorCode) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visit.ID);
  request.input('visitDate', sql.Date, values.visitDate);
  request.input('startedAt', sql.DateTime2(3), values.startedAt);
  request.input('endedAt', sql.DateTime2(3), values.endedAt);
  request.input('commercialResult', sql.VarChar(30), values.commercialResult);
  request.input('notes', sql.NVarChar(2000), values.notes);
  request.input('needsReturn', sql.Bit, values.needsReturn);
  request.input('returnDate', sql.Date, values.returnDate);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_VISITA_TRATATIVA
    SET
      STATUS = 'REALIZADA',
      RESPOSTA_REALIZACAO = 'SIM',
      DATA_VISITA = @visitDate,
      INICIO_EM_UTC = @startedAt,
      TERMINO_EM_UTC = @endedAt,
      RESULTADO_COMERCIAL = @commercialResult,
      OBSERVACAO_GERAL = @notes,
      NECESSITA_RETORNO = @needsReturn,
      DATA_PREVISTA_RETORNO = @returnDate,
      FINALIZADA_EM_UTC = SYSUTCDATETIME(),
      FINALIZADA_POR = @actorCode,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE ID = @visitId
  `);

  const products = new sql.Request(transaction);
  products.input('visitId', sql.BigInt, visit.ID);
  products.input('baseline', sql.NVarChar(sql.MAX), JSON.stringify(snapshot));
  products.input('actorCode', sql.Int, actorCode);
  await products.query(`
    UPDATE vp
    SET
      BASELINE_JSON = CASE
        WHEN vp.NECESSITA_ACOMPANHAMENTO = 1 AND vp.REGRA_ACOMPANHAMENTO_ID IS NOT NULL
          THEN @baseline
        ELSE vp.BASELINE_JSON
      END,
      BASELINE_EM_UTC = CASE
        WHEN vp.NECESSITA_ACOMPANHAMENTO = 1 AND vp.REGRA_ACOMPANHAMENTO_ID IS NOT NULL
          THEN SYSUTCDATETIME()
        ELSE vp.BASELINE_EM_UTC
      END,
      PROXIMA_VERIFICACAO_EM_UTC = CASE
        WHEN vp.NECESSITA_ACOMPANHAMENTO = 1 AND vp.REGRA_ACOMPANHAMENTO_ID IS NOT NULL
          THEN DATEADD(DAY, r.PRAZO_DIAS, SYSUTCDATETIME())
        ELSE NULL
      END,
      STATUS_ACOMPANHAMENTO = CASE
        WHEN vp.NECESSITA_ACOMPANHAMENTO = 1 AND vp.REGRA_ACOMPANHAMENTO_ID IS NOT NULL
          THEN 'AGUARDANDO_EVOLUCAO'
        WHEN vp.NECESSITA_ACOMPANHAMENTO = 1
          THEN 'ACOMPANHAMENTO_PENDENTE'
        ELSE 'NAO_APLICAVEL'
      END,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    FROM TESTE..TB_VISITA_PRODUTO AS vp
    LEFT JOIN TESTE..TB_PRODUTO_REGRA_ACOMPANHAMENTO AS r
      ON r.ID = vp.REGRA_ACOMPANHAMENTO_ID
    WHERE vp.VISITA_ID = @visitId
      AND vp.ATIVO = 1
  `);
  await resolveVisitNotifications(transaction, visit.ID, actorCode, 'VISITA_REALIZADA');
}

export async function finalizeNotCompletedVisitRow(transaction, visit, values, actorCode) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visit.ID);
  request.input('reason', sql.VarChar(40), values.reason);
  request.input('justification', sql.NVarChar(1000), values.justification);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_VISITA_TRATATIVA
    SET
      STATUS = 'NAO_REALIZADA',
      RESPOSTA_REALIZACAO = 'NAO',
      MOTIVO_NAO_REALIZACAO = @reason,
      JUSTIFICATIVA_NAO_REALIZACAO = @justification,
      FINALIZADA_EM_UTC = SYSUTCDATETIME(),
      FINALIZADA_POR = @actorCode,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE ID = @visitId
  `);

  const products = new sql.Request(transaction);
  products.input('visitId', sql.BigInt, visit.ID);
  products.input(
    'reason',
    sql.NVarChar(1000),
    `Visita não realizada: ${values.reason}${values.justification ? ` — ${values.justification}` : ''}`
  );
  products.input('actorCode', sql.Int, actorCode);
  await products.query(`
    UPDATE TESTE..TB_VISITA_PRODUTO
    SET
      STATUS_TRATATIVA = 'NAO_ABORDADO',
      RESULTADO_VISITA = 'NAO_ABORDADO',
      JUSTIFICATIVA_NAO_ABORDADO = @reason,
      NECESSITA_ACOMPANHAMENTO = 0,
      STATUS_ACOMPANHAMENTO = 'ENCERRADO',
      TRATADO_EM_UTC = SYSUTCDATETIME(),
      TRATADO_POR = @actorCode,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE VISITA_ID = @visitId
      AND ATIVO = 1
  `);
  await resolveVisitNotifications(transaction, visit.ID, actorCode, 'VISITA_NAO_REALIZADA');
}

export async function rescheduleVisitRows(transaction, visit, products, values, actorCode, correlationId) {
  const old = new sql.Request(transaction);
  old.input('visitId', sql.BigInt, visit.ID);
  old.input('actorCode', sql.Int, actorCode);
  await old.query(`
    UPDATE TESTE..TB_VISITA_TRATATIVA
    SET
      STATUS = 'REAGENDADA',
      RESPOSTA_REALIZACAO = 'REAGENDADA',
      EH_ATUAL = 0,
      FINALIZADA_EM_UTC = SYSUTCDATETIME(),
      FINALIZADA_POR = @actorCode,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE ID = @visitId
  `);

  const next = new sql.Request(transaction);
  next.input('originId', sql.BigInt, visit.ID);
  next.input('newDate', sql.Date, values.newDate);
  next.input('newTime', sql.Time(0), sqlTimeValue(values.newTime));
  next.input('priority', sql.VarChar(10), values.priority);
  next.input('actorCode', sql.Int, actorCode);
  const inserted = await next.query(`
    INSERT INTO TESTE..TB_VISITA_TRATATIVA (
      PARADA_ROTEIRO_ID,
      ROTEIRO_ID,
      VISITA_ORIGEM_ID,
      SEQUENCIA,
      EH_ATUAL,
      CHAVE_LOJA,
      NOME_LOJA,
      COD_AG,
      CHAVE_SUPERVISAO,
      ENDERECO,
      COD_FUNC_RESPONSAVEL,
      NOME_RESPONSAVEL,
      COD_FUNC_CRIADOR,
      NOME_CRIADOR,
      DATA_PLANEJADA,
      HORARIO_PLANEJADO,
      FUSO_HORARIO,
      PRIORIDADE,
      STATUS,
      RESULTADO_COMERCIAL,
      CRIADO_POR,
      ATUALIZADO_POR
    )
    OUTPUT INSERTED.ID
    SELECT
      PARADA_ROTEIRO_ID,
      ROTEIRO_ID,
      @originId,
      SEQUENCIA + 1,
      1,
      CHAVE_LOJA,
      NOME_LOJA,
      COD_AG,
      CHAVE_SUPERVISAO,
      ENDERECO,
      COD_FUNC_RESPONSAVEL,
      NOME_RESPONSAVEL,
      COD_FUNC_CRIADOR,
      NOME_CRIADOR,
      @newDate,
      @newTime,
      FUSO_HORARIO,
      @priority,
      'PENDENTE',
      'SEM_RESULTADO',
      @actorCode,
      @actorCode
    FROM TESTE..TB_VISITA_TRATATIVA
    WHERE ID = @originId
  `);
  const newVisitId = inserted.recordset[0].ID;

  const copyProducts = new sql.Request(transaction);
  copyProducts.input('oldVisitId', sql.BigInt, visit.ID);
  copyProducts.input('newVisitId', sql.BigInt, newVisitId);
  copyProducts.input('actorCode', sql.Int, actorCode);
  await copyProducts.query(`
    INSERT INTO TESTE..TB_VISITA_PRODUTO (
      VISITA_ID,
      PRODUTO_ID,
      REGRA_ACOMPANHAMENTO_ID,
      CODIGO_PRODUTO_SNAPSHOT,
      NOME_PRODUTO_SNAPSHOT,
      TIPO_OPORTUNIDADE,
      OPORTUNIDADE_SNAPSHOT_JSON,
      STATUS_TRATATIVA,
      NECESSITA_ACOMPANHAMENTO,
      STATUS_ACOMPANHAMENTO,
      CRIADO_POR,
      ATUALIZADO_POR
    )
    SELECT
      @newVisitId,
      PRODUTO_ID,
      REGRA_ACOMPANHAMENTO_ID,
      CODIGO_PRODUTO_SNAPSHOT,
      NOME_PRODUTO_SNAPSHOT,
      TIPO_OPORTUNIDADE,
      OPORTUNIDADE_SNAPSHOT_JSON,
      'PENDENTE',
      0,
      'NAO_APLICAVEL',
      @actorCode,
      @actorCode
    FROM TESTE..TB_VISITA_PRODUTO
    WHERE VISITA_ID = @oldVisitId
      AND ATIVO = 1
  `);

  const link = new sql.Request(transaction);
  link.input('oldVisitId', sql.BigInt, visit.ID);
  link.input('newVisitId', sql.BigInt, newVisitId);
  link.input('oldDate', sql.Date, visit.DATA_PLANEJADA);
  link.input('oldTime', sql.Time(0), sqlTimeValue(visit.HORARIO_PLANEJADO));
  link.input('newDate', sql.Date, values.newDate);
  link.input('newTime', sql.Time(0), sqlTimeValue(values.newTime));
  link.input('reason', sql.VarChar(40), values.reason);
  link.input('justification', sql.NVarChar(1000), values.justification);
  link.input('priority', sql.VarChar(10), values.priority);
  link.input('actorCode', sql.Int, actorCode);
  link.input('correlationId', sql.UniqueIdentifier, correlationId);
  await link.query(`
    INSERT INTO TESTE..TB_VISITA_REAGENDAMENTO (
      VISITA_ORIGEM_ID,
      VISITA_NOVA_ID,
      DATA_ANTERIOR,
      HORARIO_ANTERIOR,
      NOVA_DATA,
      NOVO_HORARIO,
      MOTIVO,
      JUSTIFICATIVA,
      PRIORIDADE,
      REAGENDADO_POR,
      CORRELATION_ID
    )
    VALUES (
      @oldVisitId,
      @newVisitId,
      @oldDate,
      @oldTime,
      @newDate,
      @newTime,
      @reason,
      @justification,
      @priority,
      @actorCode,
      @correlationId
    )
  `);
  await resolveVisitNotifications(transaction, visit.ID, actorCode, 'VISITA_REAGENDADA');
  return { newVisitId };
}

export async function resolveVisitNotifications(transaction, visitId, actorCode, reason) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, visitId);
  request.input('actorCode', sql.Int, actorCode);
  request.input('reason', sql.VarChar(60), reason);
  await request.query(`
    UPDATE TESTE..TB_NOTIFICACAO
    SET
      STATUS = 'RESOLVIDA',
      RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
      RESOLVIDA_POR = @actorCode,
      MOTIVO_RESOLUCAO = @reason
    WHERE VISITA_ID = @visitId
      AND STATUS = 'ATIVA';

    UPDATE nu
    SET
      STATUS = 'RESOLVIDA',
      RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN TESTE..TB_NOTIFICACAO AS n
      ON n.ID = nu.NOTIFICACAO_ID
    WHERE n.VISITA_ID = @visitId
      AND nu.STATUS NOT IN ('RESOLVIDA', 'CANCELADA');
  `);
}

export async function cancelRouteNotifications(
  transaction,
  routeId,
  actorCode,
  reason = 'ROTEIRO_CANCELADO'
) {
  const request = new sql.Request(transaction);
  request.input('routeId', sql.UniqueIdentifier, routeId);
  request.input('actorCode', sql.Int, actorCode);
  request.input('reason', sql.VarChar(60), reason);
  await request.query(`
    UPDATE TESTE..TB_NOTIFICACAO
    SET
      STATUS = 'CANCELADA',
      RESOLVIDA_EM_UTC = COALESCE(RESOLVIDA_EM_UTC, SYSUTCDATETIME()),
      RESOLVIDA_POR = @actorCode,
      MOTIVO_RESOLUCAO = @reason
    WHERE ROTEIRO_ID = @routeId
      AND STATUS = 'ATIVA';

    UPDATE nu
    SET
      STATUS = 'CANCELADA',
      RESOLVIDA_EM_UTC = COALESCE(nu.RESOLVIDA_EM_UTC, SYSUTCDATETIME()),
      ADIADA_ATE_EM_UTC = NULL,
      ACAO_EXECUTADA = @reason,
      ACAO_EXECUTADA_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN TESTE..TB_NOTIFICACAO AS n
      ON n.ID = nu.NOTIFICACAO_ID
    WHERE n.ROTEIRO_ID = @routeId
      AND nu.STATUS NOT IN ('RESOLVIDA', 'ARQUIVADA', 'CANCELADA');
  `);
}

export async function publishVisitEvent(transaction, event) {
  return insertOutbox(transaction, event);
}

export async function fetchStoreEvolutionSnapshot(storeKey) {
  const request = pool.request();
  request.input('storeKey', sql.NVarChar(100), String(storeKey));
  const creditQuantity = storeCreditQuantitySql('A');
  const businessQuantity = storeBusinessQuantitySql('A', 'E');
  const result = await request.query(`
    SELECT
      TRY_CONVERT(INT, A.PERIODO) AS sourcePeriod,
      ${creditQuantity} AS creditQuantity,
      ISNULL(A.VLR_CONSIG_CONTRATO_AVERBADO, 0)
        + ISNULL(A.VLR_CONSIG_CONTRATO_AVERBADO_PLATAF, 0)
        + ISNULL(A.VLR_EMPRESTIMO_CRED_CONSIG_PUB_AVERB, 0)
        + ISNULL(A.VLR_EMPRESTIMO_CRED_CONSIG_PRIV_AVERB, 0)
        + ISNULL(A.VLR_LIME_DTLHES_EMPRESTIMO, 0)
        + ISNULL(A.VLR_LIME_DTLHES_EMPRESTIMO_PLATAFORMA, 0)
        + ISNULL(A.VLR_CREDITO_PARCEL_DTLHES_EMPRESTIMO, 0) AS creditValue,
      ISNULL(A.QTD_CIELO, 0) AS cieloQuantity,
      ISNULL(A.VLR_FAT_CIELO, 0) AS cieloValue,
      ${businessQuantity} AS businessQuantity,
      ISNULL(A.QTD_TRX_CONTABIL_DTLHES, 0) AS accountingTransactions,
      CASE
        WHEN ISNULL(A.QTD_TRX_CONTABIL_DTLHES, 0) >= 200
          OR (${businessQuantity}) >= 5
        THEN 1 ELSE 0
      END AS activePade,
      CASE WHEN EXISTS (
        SELECT 1
        FROM TESTE..TB_PORTAL_COMERCIAL_LOJAS_S_PROPOSTA_VALOR AS missing
        WHERE LTRIM(RTRIM(CONVERT(NVARCHAR(100), missing.CHAVE_LOJA))) =
              LTRIM(RTRIM(CONVERT(NVARCHAR(100), @storeKey)))
      ) THEN 0 ELSE 1 END AS valueProposal
    FROM DATAWAREHOUSE..TB_INDICADORES_BE AS A
    LEFT JOIN (
      SELECT
        CHAVE_LOJA,
        ANO_MES,
        SUM(REALIZADO) AS REALIZADO
      FROM PADE..REALIZADO_CREDITO_CONCEDIDO
      WHERE INDICADOR = 'CONSORCIO'
      GROUP BY CHAVE_LOJA, ANO_MES
    ) AS E
      ON E.CHAVE_LOJA = A.CHAVE_LOJA
     AND E.ANO_MES = TRY_CONVERT(INT, A.PERIODO)
    WHERE LTRIM(RTRIM(CONVERT(NVARCHAR(100), A.CHAVE_LOJA))) = @storeKey
      AND TRY_CONVERT(INT, A.PERIODO) = YEAR(GETDATE()) * 100 + MONTH(GETDATE())
    ORDER BY TRY_CONVERT(INT, A.PERIODO) DESC
    OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
  `);
  return result.recordset[0] ?? {
    sourcePeriod: null,
    creditQuantity: 0,
    creditValue: 0,
    cieloQuantity: 0,
    cieloValue: 0,
    businessQuantity: 0,
    accountingTransactions: 0,
    activePade: 0,
    valueProposal: 0,
  };
}
