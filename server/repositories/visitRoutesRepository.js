import crypto from 'node:crypto';
import { pool, poolConnect, sql } from '../db/sqlServer.js';
import { applyAccessScope } from '../auth/scopeSql.js';
import { canAssignRouteOutsideOwnerPortfolio } from '../auth/routeAssignmentPolicy.js';
import { FEATURES } from '../config/features.js';
import { productCodesFromFocusLabels } from '../domain/visitWorkflow.js';
import { sqlTimeValue } from '../domain/sqlTime.js';
import {
  appendVisitHistory,
  publishVisitEvent,
  provisionVisitForStop,
  recordRouteCreationEvents,
} from './visitsRepository.js';

function routeScopeSql(request, user, routeAlias = 'r', entityAlias = 'route_ent') {
  const accessSql = applyAccessScope(request, user, entityAlias, 'routeAuthCodFunc');
  const ownSql = !user?.isAdmin && user?.role === 'supervisor'
    ? (() => {
        request.input('routeOwnerFuncional', Number(user.funcional));
        return ` AND ${routeAlias}.COD_FUNC_RESPONSAVEL = @routeOwnerFuncional`;
      })()
    : '';
  return `
    ${ownSql}
    ${accessSql ? `AND EXISTS (
      SELECT 1
      FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ${entityAlias}
      WHERE ${entityAlias}.CHAVE_SUPERVISAO = ${routeAlias}.CHAVE_SUPERVISAO
        ${accessSql}
    )` : ''}
  `;
}

export async function fetchAuthorizedRouteOwners(user, { storeKeys = [] } = {}) {
  const request = pool.request();
  const accessSql = applyAccessScope(request, user, 'ent', 'ownersAuthCodFunc');
  const ownSql = !user?.isAdmin && user?.role === 'supervisor'
    ? (() => {
        request.input('ownersFuncional', Number(user.funcional));
        return ' AND sup.COD_FUNC = @ownersFuncional';
      })()
    : '';

  // Escopo da sessão (já calculado no login): evita listar GCs fora da hierarquia
  // do Gerente de Gestão / GC III mesmo se o predicado SQL falhar.
  const scopeSupervisions = !user?.isAdmin && Array.isArray(user?.scope?.supervisoes)
    ? user.scope.supervisoes.map(Number).filter((value) => Number.isInteger(value) && value > 0)
    : null;
  if (scopeSupervisions && scopeSupervisions.length === 0) return [];

  let scopeSql = '';
  if (scopeSupervisions) {
    const params = scopeSupervisions.map((key, index) => {
      request.input(`ownerScopeSup${index}`, key);
      return `@ownerScopeSup${index}`;
    });
    scopeSql = ` AND sup.CHAVE_SUPERVISAO IN (${params.join(', ')})`;
  }

  const uniqueStoreKeys = canAssignRouteOutsideOwnerPortfolio(user)
    ? []
    : [...new Set(storeKeys.map((key) => String(key ?? '').trim()).filter(Boolean))];
  let storeCoverageSql = '';
  if (uniqueStoreKeys.length > 0) {
    const storeParams = uniqueStoreKeys.map((key, index) => {
      request.input(`ownerStore${index}`, sql.NVarChar(100), key);
      return `@ownerStore${index}`;
    });
    // Só GCs cuja supervisão cobre todas as lojas do roteiro.
    storeCoverageSql = `
      AND (
        SELECT COUNT(DISTINCT LTRIM(RTRIM(CONVERT(NVARCHAR(100), be.CHAVE_LOJA))))
        FROM DATALAKE..DL_BRADESCO_EXPRESSO AS be
        INNER JOIN MESU..CONS_DISTRIBUICAO_ENTIDADES AS store_ent
          ON TRY_CAST(store_ent.COD_AG AS BIGINT) = TRY_CAST(be.COD_AG_LOJA AS BIGINT)
        WHERE store_ent.CHAVE_SUPERVISAO = sup.CHAVE_SUPERVISAO
          AND LTRIM(RTRIM(CONVERT(NVARCHAR(100), be.CHAVE_LOJA))) IN (${storeParams.join(', ')})
      ) = ${uniqueStoreKeys.length}
    `;
  }

  const result = await request.query(`
    SELECT DISTINCT
      sup.COD_FUNC,
      sup.NOME_FUNC,
      sup.CHAVE_SUPERVISAO,
      sup.DESC_SUPERVISAO,
      ent.CHAVE_COORDENACAO,
      ent.DESC_COORDENACAO,
      gc3.NOME_FUNC AS NOME_COORDENADOR
    FROM TESTE..TB_COORD_SUP AS sup
    INNER JOIN MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
      ON ent.CHAVE_SUPERVISAO = sup.CHAVE_SUPERVISAO
    OUTER APPLY (
      SELECT TOP (1) coordenador.NOME_FUNC
      FROM TESTE..TB_COORD_COORDENADOR AS coordenador
      WHERE coordenador.CHAVE_COORDENACAO = ent.CHAVE_COORDENACAO
      ORDER BY coordenador.NOME_FUNC
    ) AS gc3
    WHERE sup.COD_FUNC IS NOT NULL
      ${ownSql}
      ${accessSql}
      ${scopeSql}
      ${storeCoverageSql}
    ORDER BY sup.NOME_FUNC, sup.CHAVE_SUPERVISAO
  `);
  return result.recordset;
}

export async function fetchAuthorizedStoreKeys(chaveSupervisao, storeKeys) {
  if (storeKeys.length === 0) return [];
  const request = pool.request();
  request.input('targetSupervision', chaveSupervisao);
  const params = storeKeys.map((key, index) => {
    request.input(`routeStore${index}`, String(key));
    return `@routeStore${index}`;
  });
  const result = await request.query(`
    SELECT DISTINCT LTRIM(RTRIM(CONVERT(NVARCHAR(100), be.CHAVE_LOJA))) AS CHAVE_LOJA
    FROM DATALAKE..DL_BRADESCO_EXPRESSO AS be
    INNER JOIN MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
      ON TRY_CAST(ent.COD_AG AS BIGINT) = TRY_CAST(be.COD_AG_LOJA AS BIGINT)
    WHERE ent.CHAVE_SUPERVISAO = @targetSupervision
      AND LTRIM(RTRIM(CONVERT(NVARCHAR(100), be.CHAVE_LOJA))) IN (${params.join(', ')})
  `);
  return result.recordset.map((row) => String(row.CHAVE_LOJA));
}

export async function fetchUserAuthorizedStoreKeys(user, storeKeys) {
  if (storeKeys.length === 0) return [];
  const request = pool.request();
  const accessSql = applyAccessScope(request, user, 'ent', 'routeStoreAuthCodFunc');
  const hierarchyJoinSql = user?.isAdmin
    ? ''
    : `INNER JOIN MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
        ON TRY_CAST(ent.COD_AG AS BIGINT) = TRY_CAST(be.COD_AG_LOJA AS BIGINT)`;
  const params = storeKeys.map((key, index) => {
    request.input(`userRouteStore${index}`, sql.NVarChar(100), String(key));
    return `@userRouteStore${index}`;
  });
  const result = await request.query(`
    SELECT DISTINCT LTRIM(RTRIM(CONVERT(NVARCHAR(100), be.CHAVE_LOJA))) AS CHAVE_LOJA
    FROM DATALAKE..DL_BRADESCO_EXPRESSO AS be
    ${hierarchyJoinSql}
    WHERE LTRIM(RTRIM(CONVERT(NVARCHAR(100), be.CHAVE_LOJA))) IN (${params.join(', ')})
      ${accessSql}
  `);
  return result.recordset.map((row) => String(row.CHAVE_LOJA));
}

function bindHeader(request, payload, version) {
  request.input('requestId', sql.UniqueIdentifier, payload.requestId);
  request.input('responsavelFuncional', payload.owner.funcional);
  request.input('responsavelNome', sql.NVarChar(150), payload.owner.nome);
  request.input('chaveSupervisao', payload.owner.chaveSupervisao);
  request.input('descSupervisao', sql.NVarChar(150), payload.owner.descricaoSupervisao);
  request.input('criadorFuncional', Number(payload.createdBy.funcional));
  request.input('criadorNome', sql.NVarChar(150), payload.createdBy.nome);
  request.input('plannedDate', sql.Date, payload.plannedDate);
  request.input('version', version);
  request.input('nome', sql.NVarChar(250), payload.nome);
  request.input('priority', sql.VarChar(10), payload.priority ?? 'NORMAL');
  request.input('orientation', sql.NVarChar(1000), payload.orientation ?? null);
  request.input('originName', sql.NVarChar(250), payload.origin.nome);
  request.input('originLat', payload.origin.lat);
  request.input('originLng', payload.origin.lng);
  request.input('destinationName', sql.NVarChar(250), payload.destination?.nome ?? null);
  request.input('destinationLat', payload.destination?.lat ?? null);
  request.input('destinationLng', payload.destination?.lng ?? null);
  request.input('distanceMeters', sql.BigInt, payload.distanceMeters);
  request.input('travelMinutes', payload.durationBreakdown.travelMinutes);
  request.input('visitMinutes', payload.durationBreakdown.visitMinutes);
  request.input('minutesPerVisit', payload.durationBreakdown.minutesPerVisit);
  request.input('geometryJson', sql.NVarChar(sql.MAX), JSON.stringify(payload.routeGeometry));
}

export async function insertVisitRoute(payload) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const existingRequest = new sql.Request(transaction);
    existingRequest.input('requestId', sql.UniqueIdentifier, payload.requestId);
    const existing = await existingRequest.query(`
      SELECT TOP (1) ID FROM TESTE..ROTEIROS_MAPA WHERE REQUEST_ID = @requestId
    `);
    if (existing.recordset[0]) {
      await transaction.commit();
      return { id: existing.recordset[0].ID, existing: true };
    }

    const versionRequest = new sql.Request(transaction);
    versionRequest.input('responsavelFuncional', payload.owner.funcional);
    versionRequest.input('plannedDate', sql.Date, payload.plannedDate);
    const versionResult = await versionRequest.query(`
      SELECT ISNULL(MAX(VERSAO), 0) + 1 AS nextVersion
      FROM TESTE..ROTEIROS_MAPA WITH (UPDLOCK, HOLDLOCK)
      WHERE COD_FUNC_RESPONSAVEL = @responsavelFuncional
        AND DATA_ROTEIRO = @plannedDate
    `);
    const version = Number(versionResult.recordset[0]?.nextVersion) || 1;

    const headerRequest = new sql.Request(transaction);
    bindHeader(headerRequest, payload, version);
    const inserted = await headerRequest.query(`
      INSERT INTO TESTE..ROTEIROS_MAPA (
        REQUEST_ID, COD_FUNC_RESPONSAVEL, NOME_RESPONSAVEL, CHAVE_SUPERVISAO,
        DESC_SUPERVISAO, COD_FUNC_CRIADOR, NOME_CRIADOR, DATA_ROTEIRO, VERSAO,
        NOME, PRIORIDADE, ORIENTACAO, ORIGEM_NOME, ORIGEM_LAT, ORIGEM_LNG, DESTINO_NOME, DESTINO_LAT,
        DESTINO_LNG, DISTANCIA_METROS, DESLOCAMENTO_MINUTOS, VISITAS_MINUTOS,
        MINUTOS_POR_VISITA, GEOMETRIA_JSON
      )
      OUTPUT INSERTED.ID
      VALUES (
        @requestId, @responsavelFuncional, @responsavelNome, @chaveSupervisao,
        @descSupervisao, @criadorFuncional, @criadorNome, @plannedDate, @version,
        @nome, @priority, @orientation, @originName, @originLat, @originLng, @destinationName, @destinationLat,
        @destinationLng, @distanceMeters, @travelMinutes, @visitMinutes,
        @minutesPerVisit, @geometryJson
      )
    `);
    const routeId = inserted.recordset[0].ID;

    for (const stop of payload.stops) {
      const stopRequest = new sql.Request(transaction);
      stopRequest.input('routeId', sql.UniqueIdentifier, routeId);
      stopRequest.input('ordem', stop.ordem);
      stopRequest.input('chaveLoja', sql.NVarChar(100), stop.chaveLoja);
      stopRequest.input('codAg', sql.NVarChar(20), stop.codAg);
      stopRequest.input('nomeStop', sql.NVarChar(250), stop.nome);
      stopRequest.input('horario', sql.NVarChar(20), stop.horario);
      stopRequest.input('status', sql.VarChar(20), stop.status);
      stopRequest.input('endereco', sql.NVarChar(500), stop.endereco);
      stopRequest.input('cep', sql.NVarChar(250), stop.cep);
      stopRequest.input('produtoFoco', sql.NVarChar(500), stop.produtoFoco);
      stopRequest.input('focosJson', sql.NVarChar(sql.MAX), JSON.stringify(stop.focos));
      stopRequest.input('oportunidadesJson', sql.NVarChar(sql.MAX), JSON.stringify(stop.oportunidades));
      stopRequest.input('ultimaVisita', sql.NVarChar(100), stop.ultimaVisita);
      stopRequest.input('proximaAcao', sql.NVarChar(1000), stop.proximaAcao);
      stopRequest.input('lat', stop.lat);
      stopRequest.input('lng', stop.lng);
      const insertedStop = await stopRequest.query(`
        INSERT INTO TESTE..ROTEIRO_PARADAS_MAPA (
          ROTEIRO_ID, ORDEM, CHAVE_LOJA, COD_AG, NOME, HORARIO, STATUS, ENDERECO,
          CEP_CONTEXTO, PRODUTO_FOCO, FOCOS_JSON, OPORTUNIDADES_JSON, ULTIMA_VISITA,
          PROXIMA_ACAO, LAT, LNG
        )
        OUTPUT INSERTED.ID
        VALUES (
          @routeId, @ordem, @chaveLoja, @codAg, @nomeStop, @horario, @status, @endereco,
          @cep, @produtoFoco, @focosJson, @oportunidadesJson, @ultimaVisita,
          @proximaAcao, @lat, @lng
        )
      `);
      if (FEATURES.visits) {
        await provisionVisitForStop(transaction, {
          routeId,
          stopId: insertedStop.recordset[0].ID,
          stop,
          payload,
          productCodes: productCodesFromFocusLabels(stop.focos),
          correlationId: payload.correlationId,
        });
      }
    }
    if (FEATURES.visits) {
      await recordRouteCreationEvents(transaction, {
        routeId,
        payload,
        stopCount: payload.stops.length,
        correlationId: payload.correlationId,
        notificationsEnabled: FEATURES.notifications,
      });
    }
    await transaction.commit();
    return { id: routeId, version, existing: false };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}

export async function fetchVisitRouteSummaries({ user, from, to, chaveSupervisao, offset, limit }) {
  const request = pool.request();
  request.input('fromDate', sql.Date, from);
  request.input('toDate', sql.Date, to);
  request.input('offsetRows', offset);
  request.input('limitRows', limit);
  const supervisionSql = chaveSupervisao
    ? (() => {
        request.input('filterSupervision', chaveSupervisao);
        return ' AND r.CHAVE_SUPERVISAO = @filterSupervision';
      })()
    : '';
  const scopeSql = routeScopeSql(request, user, 'r', 'list_ent');
  const result = await request.query(`
    SELECT
      r.ID, r.COD_FUNC_RESPONSAVEL, r.NOME_RESPONSAVEL, r.CHAVE_SUPERVISAO,
      r.DESC_SUPERVISAO, r.COD_FUNC_CRIADOR, r.NOME_CRIADOR, r.DATA_ROTEIRO,
      r.VERSAO, r.NOME, r.DISTANCIA_METROS, r.DESLOCAMENTO_MINUTOS,
      r.VISITAS_MINUTOS, r.MINUTOS_POR_VISITA, r.CRIADO_EM,
      COUNT(p.ID) AS TOTAL_PARADAS
    FROM TESTE..ROTEIROS_MAPA AS r
    LEFT JOIN TESTE..ROTEIRO_PARADAS_MAPA AS p
      ON p.ROTEIRO_ID = r.ID
     ${FEATURES.visits ? 'AND p.ATIVO = 1' : ''}
    WHERE r.DATA_ROTEIRO BETWEEN @fromDate AND @toDate
      ${supervisionSql}
      ${scopeSql}
    GROUP BY
      r.ID, r.COD_FUNC_RESPONSAVEL, r.NOME_RESPONSAVEL, r.CHAVE_SUPERVISAO,
      r.DESC_SUPERVISAO, r.COD_FUNC_CRIADOR, r.NOME_CRIADOR, r.DATA_ROTEIRO,
      r.VERSAO, r.NOME, r.DISTANCIA_METROS, r.DESLOCAMENTO_MINUTOS,
      r.VISITAS_MINUTOS, r.MINUTOS_POR_VISITA, r.CRIADO_EM
    ORDER BY r.DATA_ROTEIRO DESC, r.CRIADO_EM DESC, r.ID
    OFFSET @offsetRows ROWS FETCH NEXT @limitRows ROWS ONLY
  `);
  return result.recordset;
}

export async function fetchVisitRouteSummaryBySupervision({ user, from, to }) {
  const request = pool.request();
  request.input('fromDate', sql.Date, from);
  request.input('toDate', sql.Date, to);
  const scopeSql = routeScopeSql(request, user, 'r', 'summary_ent');
  const result = await request.query(`
    WITH latest AS (
      SELECT r.*,
        (
          SELECT COUNT_BIG(*)
          FROM TESTE..ROTEIRO_PARADAS_MAPA p
          WHERE p.ROTEIRO_ID = r.ID
          ${FEATURES.visits ? 'AND p.ATIVO = 1' : ''}
        ) AS TOTAL_VISITAS,
        ROW_NUMBER() OVER (
          PARTITION BY r.COD_FUNC_RESPONSAVEL, r.DATA_ROTEIRO
          ORDER BY r.VERSAO DESC, r.CRIADO_EM DESC
        ) AS rn
      FROM TESTE..ROTEIROS_MAPA AS r
      WHERE r.DATA_ROTEIRO BETWEEN @fromDate AND @toDate
        ${scopeSql}
    )
    SELECT
      latest.CHAVE_SUPERVISAO,
      COUNT(*) AS TOTAL_ROTEIROS,
      COUNT(DISTINCT latest.COD_FUNC_RESPONSAVEL) AS GERENTES_COM_ROTEIRO,
      SUM(latest.TOTAL_VISITAS) AS TOTAL_VISITAS
    FROM latest
    WHERE latest.rn = 1
    GROUP BY latest.CHAVE_SUPERVISAO
  `);
  return result.recordset;
}

export async function fetchVisitRouteById(id, user) {
  const request = pool.request();
  request.input('routeId', sql.UniqueIdentifier, id);
  const scopeSql = routeScopeSql(request, user, 'r', 'detail_ent');
  const header = await request.query(`
    SELECT TOP (1) *
    FROM TESTE..ROTEIROS_MAPA AS r
    WHERE r.ID = @routeId
      ${scopeSql}
  `);
  if (!header.recordset[0]) return null;

  const stopsRequest = pool.request();
  stopsRequest.input('routeId', sql.UniqueIdentifier, id);
  const treatmentFields = FEATURES.visits
    ? `,
      visita.ID AS VISITA_ID,
      visita.STATUS AS VISITA_STATUS,
      visita.VERSAO_LINHA AS VISITA_VERSAO_LINHA,
      produtos.TOTAL_PRODUTOS,
      produtos.PRODUTOS_TRATADOS`
    : `,
      CAST(NULL AS BIGINT) AS VISITA_ID,
      CAST(NULL AS VARCHAR(20)) AS VISITA_STATUS,
      CAST(NULL AS VARBINARY(8)) AS VISITA_VERSAO_LINHA,
      CAST(0 AS BIGINT) AS TOTAL_PRODUTOS,
      CAST(0 AS BIGINT) AS PRODUTOS_TRATADOS`;
  const treatmentJoins = FEATURES.visits
    ? `
    LEFT JOIN TESTE..TB_VISITA_TRATATIVA AS visita
      ON visita.PARADA_ROTEIRO_ID = p.ID
     AND visita.EH_ATUAL = 1
    OUTER APPLY (
      SELECT
        COUNT_BIG(*) AS TOTAL_PRODUTOS,
        SUM(CASE WHEN vp.STATUS_TRATATIVA <> 'PENDENTE' THEN 1 ELSE 0 END) AS PRODUTOS_TRATADOS
      FROM TESTE..TB_VISITA_PRODUTO AS vp
      WHERE vp.VISITA_ID = visita.ID
        AND vp.ATIVO = 1
    ) AS produtos`
    : '';
  const stops = await stopsRequest.query(`
    SELECT
      p.*${treatmentFields},
      (
        SELECT TOP (1) LTRIM(RTRIM(CAST(ent.NOME_AG AS NVARCHAR(255))))
        FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
        WHERE TRY_CAST(ent.COD_AG AS BIGINT) = TRY_CAST(p.COD_AG AS BIGINT)
          AND ent.NOME_AG IS NOT NULL
      ) AS NOME_AG,
      LTRIM(RTRIM(CAST(be.STATUS_TABLET AS NVARCHAR(50)))) AS STATUS_TABLET,
      LTRIM(RTRIM(CAST(be.MUNICIPIO AS NVARCHAR(120)))) AS MUNICIPIO,
      LTRIM(RTRIM(CAST(be.UF AS NVARCHAR(5)))) AS UF,
      CASE
        WHEN LTRIM(RTRIM(be.TIPO_POSTO)) IN (
          N'Gerenciada',
          N'Casas Bahia',
          N'Mesa de Negócios',
          N'Exclusivo'
        ) THEN N'NÃO APTO'
        WHEN checklist.DT_VENCIMENTO_CHECKLIST > GETDATE() THEN N'OK'
        ELSE N'VENCIDO'
      END AS STATUS_CHECKLIST
    FROM TESTE..ROTEIRO_PARADAS_MAPA AS p
    LEFT JOIN DATALAKE..DL_BRADESCO_EXPRESSO AS be
      ON be.CHAVE_LOJA = p.CHAVE_LOJA
    ${treatmentJoins}
    LEFT JOIN (
      SELECT
        DATEADD(YEAR, 1, MAX(DT_CADASTRO)) AS DT_VENCIMENTO_CHECKLIST,
        CHAVE_LOJA
      FROM PAA.DBO.TB_ANALISE_CHECKLIST_AG WITH (NOLOCK)
      WHERE ID_STATUS_CHECKLIST_AG = 1
      GROUP BY CHAVE_LOJA
    ) AS checklist
      ON checklist.CHAVE_LOJA = p.CHAVE_LOJA
    WHERE p.ROTEIRO_ID = @routeId
    ORDER BY p.ORDEM
  `);
  return { header: header.recordset[0], stops: stops.recordset };
}

/**
 * Exclui o roteiro e as paradas, respeitando o escopo do usuário.
 * Retorna true se removeu, false se não encontrou (ou fora do escopo).
 */
export async function deleteVisitRouteById(id, user) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const checkRequest = new sql.Request(transaction);
    checkRequest.input('routeId', sql.UniqueIdentifier, id);
    const scopeSql = routeScopeSql(checkRequest, user, 'r', 'delete_ent');
    const existing = await checkRequest.query(`
      SELECT TOP (1) r.ID, r.STATUS_GESTAO
      FROM TESTE..ROTEIROS_MAPA AS r
      ${FEATURES.visits ? 'WITH (UPDLOCK, HOLDLOCK)' : ''}
      WHERE r.ID = @routeId
        ${scopeSql}
    `);
    if (!existing.recordset[0]) {
      await transaction.rollback();
      return false;
    }

    if (FEATURES.visits) {
      const actorCode = Number(user.funcional);
      const correlationId = crypto.randomUUID();
      const visitsRequest = new sql.Request(transaction);
      visitsRequest.input('routeId', sql.UniqueIdentifier, id);
      const visits = await visitsRequest.query(`
        SELECT ID, STATUS
        FROM TESTE..TB_VISITA_TRATATIVA WITH (UPDLOCK, HOLDLOCK)
        WHERE ROTEIRO_ID = @routeId
          AND EH_ATUAL = 1
      `);
      if (visits.recordset.some((visit) => visit.STATUS !== 'PENDENTE')) {
        const error = new Error('Roteiros com visita iniciada ou concluída não podem ser cancelados.');
        error.status = 409;
        error.code = 'ROUTE_HAS_ACTIVITY';
        throw error;
      }

      const cancelRequest = new sql.Request(transaction);
      cancelRequest.input('routeId', sql.UniqueIdentifier, id);
      cancelRequest.input('actorCode', sql.Int, actorCode);
      await cancelRequest.query(`
        UPDATE TESTE..TB_VISITA_TRATATIVA
        SET
          STATUS = 'CANCELADA',
          EH_ATUAL = 0,
          FINALIZADA_EM_UTC = SYSUTCDATETIME(),
          FINALIZADA_POR = @actorCode,
          ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
          ATUALIZADO_POR = @actorCode
        WHERE ROTEIRO_ID = @routeId
          AND EH_ATUAL = 1
          AND STATUS = 'PENDENTE';

        UPDATE TESTE..ROTEIRO_PARADAS_MAPA
        SET
          ATIVO = 0,
          CANCELADO_EM_UTC = SYSUTCDATETIME(),
          CANCELADO_POR = @actorCode,
          ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
          ATUALIZADO_POR = @actorCode
        WHERE ROTEIRO_ID = @routeId
          AND ATIVO = 1;

        UPDATE TESTE..ROTEIROS_MAPA
        SET
          STATUS_GESTAO = 'CANCELADO',
          ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
          ATUALIZADO_POR = @actorCode
        WHERE ID = @routeId;
      `);
      for (const visit of visits.recordset) {
        await appendVisitHistory(transaction, {
          visitId: visit.ID,
          eventType: 'VISITA_CANCELADA',
          previousStatus: visit.STATUS,
          newStatus: 'CANCELADA',
          actorCode,
          correlationId,
          reason: 'Cancelamento do roteiro antes do início das visitas.',
        });
      }
      const audit = new sql.Request(transaction);
      audit.input('routeId', sql.UniqueIdentifier, id);
      audit.input('actorCode', sql.Int, actorCode);
      audit.input('correlationId', sql.UniqueIdentifier, correlationId);
      await audit.query(`
        INSERT INTO TESTE..TB_AUDITORIA_ROTEIRO (
          ROTEIRO_ID, TIPO_EVENTO, DADOS_NOVOS_JSON, COD_FUNC_ATOR, ORIGEM, CORRELATION_ID
        )
        VALUES (
          @routeId, 'ROTEIRO_CANCELADO', N'{"status":"CANCELADO"}',
          @actorCode, 'USUARIO', @correlationId
        )
      `);
    } else {
      const stopsRequest = new sql.Request(transaction);
      stopsRequest.input('routeId', sql.UniqueIdentifier, id);
      await stopsRequest.query(`
        DELETE FROM TESTE..ROTEIRO_PARADAS_MAPA
        WHERE ROTEIRO_ID = @routeId
      `);

      const headerRequest = new sql.Request(transaction);
      headerRequest.input('routeId', sql.UniqueIdentifier, id);
      await headerRequest.query(`
        DELETE FROM TESTE..ROTEIROS_MAPA
        WHERE ID = @routeId
      `);
    }

    await transaction.commit();
    return true;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}

export async function patchVisitRouteById(id, user, payload) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const routeRequest = new sql.Request(transaction);
    routeRequest.input('routeId', sql.UniqueIdentifier, id);
    const scopeSql = routeScopeSql(routeRequest, user, 'r', 'patch_ent');
    const routeResult = await routeRequest.query(`
      SELECT TOP (1) *
      FROM TESTE..ROTEIROS_MAPA AS r WITH (UPDLOCK, HOLDLOCK)
      WHERE r.ID = @routeId
        ${scopeSql}
    `);
    const route = routeResult.recordset[0];
    if (!route) {
      await transaction.rollback();
      return null;
    }

    const currentRequest = new sql.Request(transaction);
    currentRequest.input('routeId', sql.UniqueIdentifier, id);
    const current = await currentRequest.query(`
      SELECT
        p.*,
        v.ID AS VISITA_ID,
        v.STATUS AS VISITA_STATUS,
        v.VERSAO_LINHA AS VISITA_VERSAO_LINHA
      FROM TESTE..ROTEIRO_PARADAS_MAPA AS p WITH (UPDLOCK, HOLDLOCK)
      LEFT JOIN TESTE..TB_VISITA_TRATATIVA AS v WITH (UPDLOCK, HOLDLOCK)
        ON v.PARADA_ROTEIRO_ID = p.ID
       AND v.EH_ATUAL = 1
      WHERE p.ROTEIRO_ID = @routeId
    `);
    const activeStops = current.recordset.filter((stop) => Boolean(stop.ATIVO));
    const changesAllVisits = payload.plannedDate != null
      || payload.owner != null
      || payload.priority != null
      || payload.orientation !== undefined;
    if (
      changesAllVisits
      && activeStops.some((stop) => stop.VISITA_STATUS !== 'PENDENTE')
    ) {
      const error = new Error('O roteiro possui visita iniciada; alterações globais foram bloqueadas.');
      error.status = 409;
      error.code = 'ROUTE_VISIT_ALREADY_STARTED';
      throw error;
    }

    const nextOwner = payload.owner ?? {
      funcional: String(route.COD_FUNC_RESPONSAVEL),
      nome: route.NOME_RESPONSAVEL,
      chaveSupervisao: route.CHAVE_SUPERVISAO,
      descricaoSupervisao: route.DESC_SUPERVISAO,
    };
    const nextDate = payload.plannedDate ?? route.DATA_ROTEIRO;
    const nextPriority = payload.priority ?? route.PRIORIDADE ?? 'NORMAL';
    const nextOrientation = payload.orientation === undefined
      ? route.ORIENTACAO
      : payload.orientation;

    const updateRoute = new sql.Request(transaction);
    updateRoute.input('routeId', sql.UniqueIdentifier, id);
    updateRoute.input('ownerCode', sql.Int, Number(nextOwner.funcional));
    updateRoute.input('ownerName', sql.NVarChar(150), nextOwner.nome);
    updateRoute.input('supervisionKey', sql.Int, Number(nextOwner.chaveSupervisao));
    updateRoute.input('supervisionName', sql.NVarChar(150), nextOwner.descricaoSupervisao);
    updateRoute.input('plannedDate', sql.Date, nextDate);
    updateRoute.input('priority', sql.VarChar(10), nextPriority);
    updateRoute.input('orientation', sql.NVarChar(1000), nextOrientation);
    updateRoute.input('actorCode', sql.Int, Number(payload.actor.funcional));
    await updateRoute.query(`
      UPDATE TESTE..ROTEIROS_MAPA
      SET
        COD_FUNC_RESPONSAVEL = @ownerCode,
        NOME_RESPONSAVEL = @ownerName,
        CHAVE_SUPERVISAO = @supervisionKey,
        DESC_SUPERVISAO = @supervisionName,
        DATA_ROTEIRO = @plannedDate,
        PRIORIDADE = @priority,
        ORIENTACAO = @orientation,
        ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
        ATUALIZADO_POR = @actorCode
      WHERE ID = @routeId;

      UPDATE TESTE..TB_VISITA_TRATATIVA
      SET
        COD_FUNC_RESPONSAVEL = @ownerCode,
        NOME_RESPONSAVEL = @ownerName,
        CHAVE_SUPERVISAO = @supervisionKey,
        DATA_PLANEJADA = @plannedDate,
        PRIORIDADE = @priority,
        ORIENTACAO = @orientation,
        ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
        ATUALIZADO_POR = @actorCode
      WHERE ROTEIRO_ID = @routeId
        AND EH_ATUAL = 1
        AND STATUS = 'PENDENTE';
    `);

    if (payload.stops) {
      const desiredById = new Map(
        payload.stops
          .filter((stop) => stop.id != null)
          .map((stop) => [Number(stop.id), stop])
      );
      for (const existing of activeStops) {
        const desired = desiredById.get(Number(existing.ID));
        if (!desired) {
          if (existing.VISITA_STATUS !== 'PENDENTE') {
            const error = new Error(`A parada ${existing.ID} já foi iniciada e não pode ser removida.`);
            error.status = 409;
            error.code = 'ROUTE_VISIT_ALREADY_STARTED';
            throw error;
          }
          const cancel = new sql.Request(transaction);
          cancel.input('stopId', sql.BigInt, existing.ID);
          cancel.input('visitId', sql.BigInt, existing.VISITA_ID);
          cancel.input('actorCode', sql.Int, Number(payload.actor.funcional));
          await cancel.query(`
            UPDATE TESTE..ROTEIRO_PARADAS_MAPA
            SET
              ATIVO = 0,
              CANCELADO_EM_UTC = SYSUTCDATETIME(),
              CANCELADO_POR = @actorCode,
              ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
              ATUALIZADO_POR = @actorCode
            WHERE ID = @stopId;

            UPDATE TESTE..TB_VISITA_TRATATIVA
            SET
              STATUS = 'CANCELADA',
              EH_ATUAL = 0,
              FINALIZADA_EM_UTC = SYSUTCDATETIME(),
              FINALIZADA_POR = @actorCode,
              ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
              ATUALIZADO_POR = @actorCode
            WHERE ID = @visitId;
          `);
          await appendVisitHistory(transaction, {
            visitId: existing.VISITA_ID,
            eventType: 'VISITA_CANCELADA_POR_REMOCAO_DA_PARADA',
            previousStatus: 'PENDENTE',
            newStatus: 'CANCELADA',
            actorCode: Number(payload.actor.funcional),
            correlationId: payload.correlationId,
            reason: payload.changeReason,
          });
          continue;
        }
        if (existing.VISITA_STATUS !== 'PENDENTE') {
          const changed = Number(desired.ordem) !== Number(existing.ORDEM)
            || desired.horario !== String(existing.HORARIO)
            || JSON.stringify(desired.focos) !== JSON.stringify(
              JSON.parse(String(existing.FOCOS_JSON ?? '[]'))
            );
          if (changed) {
            const error = new Error(`A parada ${existing.ID} já foi iniciada e não pode ser alterada.`);
            error.status = 409;
            error.code = 'ROUTE_VISIT_ALREADY_STARTED';
            throw error;
          }
          continue;
        }
        const stopUpdate = new sql.Request(transaction);
        stopUpdate.input('stopId', sql.BigInt, existing.ID);
        stopUpdate.input('ordem', sql.Int, desired.ordem);
        stopUpdate.input('horario', sql.NVarChar(20), desired.horario);
        stopUpdate.input('productFocus', sql.NVarChar(500), desired.produtoFoco);
        stopUpdate.input('focusJson', sql.NVarChar(sql.MAX), JSON.stringify(desired.focos));
        stopUpdate.input(
          'opportunitiesJson',
          sql.NVarChar(sql.MAX),
          JSON.stringify(desired.oportunidades)
        );
        stopUpdate.input('nextAction', sql.NVarChar(1000), desired.proximaAcao);
        stopUpdate.input('plannedTime', sql.Time(0), sqlTimeValue(desired.horario));
        stopUpdate.input('actorCode', sql.Int, Number(payload.actor.funcional));
        await stopUpdate.query(`
          UPDATE TESTE..ROTEIRO_PARADAS_MAPA
          SET
            ORDEM = @ordem,
            HORARIO = @horario,
            PRODUTO_FOCO = @productFocus,
            FOCOS_JSON = @focusJson,
            OPORTUNIDADES_JSON = @opportunitiesJson,
            PROXIMA_ACAO = @nextAction,
            ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
            ATUALIZADO_POR = @actorCode
          WHERE ID = @stopId;

          UPDATE TESTE..TB_VISITA_TRATATIVA
          SET
            HORARIO_PLANEJADO = @plannedTime,
            ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
            ATUALIZADO_POR = @actorCode
          WHERE ID = ${Number(existing.VISITA_ID)};
        `);

        const codes = productCodesFromFocusLabels(desired.focos);
        const products = new sql.Request(transaction);
        products.input('visitId', sql.BigInt, existing.VISITA_ID);
        products.input('codes', sql.NVarChar(sql.MAX), JSON.stringify(codes));
        products.input('actorCode', sql.Int, Number(payload.actor.funcional));
        products.input(
          'opportunity',
          sql.NVarChar(sql.MAX),
          JSON.stringify(desired.oportunidades)
        );
        await products.query(`
          UPDATE vp
          SET
            ATIVO = 0,
            REMOVIDO_EM_UTC = SYSUTCDATETIME(),
            REMOVIDO_POR = @actorCode,
            ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
            ATUALIZADO_POR = @actorCode
          FROM TESTE..TB_VISITA_PRODUTO AS vp
          WHERE vp.VISITA_ID = @visitId
            AND vp.ATIVO = 1
            AND vp.CODIGO_PRODUTO_SNAPSHOT NOT IN (
              SELECT value FROM OPENJSON(@codes)
            );

          UPDATE vp
          SET
            ATIVO = 1,
            REMOVIDO_EM_UTC = NULL,
            REMOVIDO_POR = NULL,
            OPORTUNIDADE_SNAPSHOT_JSON = @opportunity,
            ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
            ATUALIZADO_POR = @actorCode
          FROM TESTE..TB_VISITA_PRODUTO AS vp
          WHERE vp.VISITA_ID = @visitId
            AND vp.CODIGO_PRODUTO_SNAPSHOT IN (
              SELECT value FROM OPENJSON(@codes)
            );

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
            @opportunity,
            'PENDENTE',
            0,
            'NAO_APLICAVEL',
            @actorCode,
            @actorCode
          FROM OPENJSON(@codes) AS requested
          INNER JOIN TESTE..TB_PRODUTO_FOCO AS p
            ON p.CODIGO = requested.value
           AND p.ATIVO = 1
          LEFT JOIN TESTE..TB_PRODUTO_REGRA_ACOMPANHAMENTO AS r
            ON r.PRODUTO_ID = p.ID
           AND r.TIPO_OPORTUNIDADE = 'GERAL'
           AND r.ATIVO = 1
          WHERE NOT EXISTS (
            SELECT 1
            FROM TESTE..TB_VISITA_PRODUTO AS existingProduct
            WHERE existingProduct.VISITA_ID = @visitId
              AND existingProduct.PRODUTO_ID = p.ID
          );
        `);
        await appendVisitHistory(transaction, {
          visitId: existing.VISITA_ID,
          eventType: 'PARADA_E_PRODUTOS_ALTERADOS',
          previousStatus: 'PENDENTE',
          newStatus: 'PENDENTE',
          newData: { order: desired.ordem, time: desired.horario, products: codes },
          actorCode: Number(payload.actor.funcional),
          correlationId: payload.correlationId,
          reason: payload.changeReason,
        });
      }

      for (const stop of payload.stops.filter((item) => item.id == null)) {
        const insertStop = new sql.Request(transaction);
        insertStop.input('routeId', sql.UniqueIdentifier, id);
        insertStop.input('ordem', sql.Int, stop.ordem);
        insertStop.input('storeKey', sql.NVarChar(100), stop.chaveLoja);
        insertStop.input('agencyCode', sql.NVarChar(20), stop.codAg);
        insertStop.input('name', sql.NVarChar(250), stop.nome);
        insertStop.input('time', sql.NVarChar(20), stop.horario);
        insertStop.input('address', sql.NVarChar(500), stop.endereco);
        insertStop.input('zip', sql.NVarChar(250), stop.cep);
        insertStop.input('focus', sql.NVarChar(500), stop.produtoFoco);
        insertStop.input('focusJson', sql.NVarChar(sql.MAX), JSON.stringify(stop.focos));
        insertStop.input(
          'opportunitiesJson',
          sql.NVarChar(sql.MAX),
          JSON.stringify(stop.oportunidades)
        );
        insertStop.input('lastVisit', sql.NVarChar(100), stop.ultimaVisita);
        insertStop.input('nextAction', sql.NVarChar(1000), stop.proximaAcao);
        insertStop.input('lat', stop.lat);
        insertStop.input('lng', stop.lng);
        const inserted = await insertStop.query(`
          INSERT INTO TESTE..ROTEIRO_PARADAS_MAPA (
            ROTEIRO_ID, ORDEM, CHAVE_LOJA, COD_AG, NOME, HORARIO, STATUS, ENDERECO,
            CEP_CONTEXTO, PRODUTO_FOCO, FOCOS_JSON, OPORTUNIDADES_JSON,
            ULTIMA_VISITA, PROXIMA_ACAO, LAT, LNG
          )
          OUTPUT INSERTED.ID
          VALUES (
            @routeId, @ordem, @storeKey, @agencyCode, @name, @time, 'pendente', @address,
            @zip, @focus, @focusJson, @opportunitiesJson,
            @lastVisit, @nextAction, @lat, @lng
          )
        `);
        await provisionVisitForStop(transaction, {
          routeId: id,
          stopId: inserted.recordset[0].ID,
          stop,
          payload: {
            requestId: null,
            owner: nextOwner,
            createdBy: payload.actor,
            plannedDate: nextDate,
            priority: nextPriority,
            orientation: nextOrientation,
          },
          productCodes: productCodesFromFocusLabels(stop.focos),
          correlationId: payload.correlationId,
        });
      }
    }

    const audit = new sql.Request(transaction);
    audit.input('routeId', sql.UniqueIdentifier, id);
    audit.input('actorCode', sql.Int, Number(payload.actor.funcional));
    audit.input('correlationId', sql.UniqueIdentifier, payload.correlationId);
    audit.input('reason', sql.NVarChar(1000), payload.changeReason);
    audit.input('oldData', sql.NVarChar(sql.MAX), JSON.stringify({
      ownerCode: route.COD_FUNC_RESPONSAVEL,
      plannedDate: route.DATA_ROTEIRO,
      priority: route.PRIORIDADE,
      orientation: route.ORIENTACAO,
    }));
    audit.input('newData', sql.NVarChar(sql.MAX), JSON.stringify({
      ownerCode: nextOwner.funcional,
      plannedDate: nextDate,
      priority: nextPriority,
      orientation: nextOrientation,
      stops: payload.stops?.length ?? activeStops.length,
    }));
    await audit.query(`
      INSERT INTO TESTE..TB_AUDITORIA_ROTEIRO (
        ROTEIRO_ID,
        TIPO_EVENTO,
        DADOS_ANTERIORES_JSON,
        DADOS_NOVOS_JSON,
        MOTIVO,
        COD_FUNC_ATOR,
        ORIGEM,
        CORRELATION_ID
      )
      VALUES (
        @routeId,
        'ROTEIRO_ALTERADO',
        @oldData,
        @newData,
        @reason,
        @actorCode,
        'USUARIO',
        @correlationId
      )
    `);

    if (
      FEATURES.notifications
      && Number(nextOwner.funcional) !== Number(payload.actor.funcional)
    ) {
      const eventPayload = {
        ruleCode: 'ROTEIRO_ATUALIZADO',
        dedupeKey: `ROTEIRO_ATUALIZADO:${id}:${payload.correlationId}`,
        recipients: [Number(nextOwner.funcional)],
        originatorCode: Number(payload.actor.funcional),
        entityType: 'ROTEIRO',
        entityId: id,
        routeId: id,
        storeKey: null,
        destination: {
          section: 'visitas',
          routeId: id,
          openTreatment: false,
          mapFocus: true,
        },
        variables: {
          routeName: route.NOME,
          originatorName: payload.actor.nome,
          changeSummary: payload.changeReason,
        },
      };
      await publishVisitEvent(transaction, {
        type: 'ROTEIRO_ALTERADO',
        aggregateType: 'ROTEIRO',
        aggregateId: id,
        payload: eventPayload,
        correlationId: payload.correlationId,
        dedupeKey: `ROTEIRO_ALTERADO:${id}:${payload.correlationId}`,
      });
    }
    await transaction.commit();
    return true;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}
