import { pool, poolConnect, sql } from '../db/sqlServer.js';
import { applyAccessScope } from '../auth/scopeSql.js';
import { canAssignRouteOutsideOwnerPortfolio } from '../auth/routeAssignmentPolicy.js';

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
      sup.DESC_SUPERVISAO
    FROM TESTE..TB_COORD_SUP AS sup
    INNER JOIN MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
      ON ent.CHAVE_SUPERVISAO = sup.CHAVE_SUPERVISAO
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
        NOME, ORIGEM_NOME, ORIGEM_LAT, ORIGEM_LNG, DESTINO_NOME, DESTINO_LAT,
        DESTINO_LNG, DISTANCIA_METROS, DESLOCAMENTO_MINUTOS, VISITAS_MINUTOS,
        MINUTOS_POR_VISITA, GEOMETRIA_JSON
      )
      OUTPUT INSERTED.ID
      VALUES (
        @requestId, @responsavelFuncional, @responsavelNome, @chaveSupervisao,
        @descSupervisao, @criadorFuncional, @criadorNome, @plannedDate, @version,
        @nome, @originName, @originLat, @originLng, @destinationName, @destinationLat,
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
      await stopRequest.query(`
        INSERT INTO TESTE..ROTEIRO_PARADAS_MAPA (
          ROTEIRO_ID, ORDEM, CHAVE_LOJA, COD_AG, NOME, HORARIO, STATUS, ENDERECO,
          CEP_CONTEXTO, PRODUTO_FOCO, FOCOS_JSON, OPORTUNIDADES_JSON, ULTIMA_VISITA,
          PROXIMA_ACAO, LAT, LNG
        ) VALUES (
          @routeId, @ordem, @chaveLoja, @codAg, @nomeStop, @horario, @status, @endereco,
          @cep, @produtoFoco, @focosJson, @oportunidadesJson, @ultimaVisita,
          @proximaAcao, @lat, @lng
        )
      `);
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
    LEFT JOIN TESTE..ROTEIRO_PARADAS_MAPA AS p ON p.ROTEIRO_ID = r.ID
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
        (SELECT COUNT_BIG(*) FROM TESTE..ROTEIRO_PARADAS_MAPA p WHERE p.ROTEIRO_ID = r.ID) AS TOTAL_VISITAS,
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
  const stops = await stopsRequest.query(`
    SELECT * FROM TESTE..ROTEIRO_PARADAS_MAPA
    WHERE ROTEIRO_ID = @routeId
    ORDER BY ORDEM
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
      SELECT TOP (1) r.ID
      FROM TESTE..ROTEIROS_MAPA AS r
      WHERE r.ID = @routeId
        ${scopeSql}
    `);
    if (!existing.recordset[0]) {
      await transaction.rollback();
      return false;
    }

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

    await transaction.commit();
    return true;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}
