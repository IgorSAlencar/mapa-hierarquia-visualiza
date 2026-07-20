import { pool } from '../db/sqlServer.js';
import { applyAccessScope, accessScopeExistsForEntity } from '../auth/scopeSql.js';

function applyBboxFilter(request, bbox, lonExpr, latExpr) {
  if (!bbox) return '';
  request.input('minLng', bbox.minLng);
  request.input('maxLng', bbox.maxLng);
  request.input('minLat', bbox.minLat);
  request.input('maxLat', bbox.maxLat);
  return `
    AND ${lonExpr} BETWEEN @minLng AND @maxLng
    AND ${latExpr} BETWEEN @minLat AND @maxLat
  `;
}

function normalizeCodAgParam(codAg) {
  const raw = String(codAg ?? '').trim();
  if (!raw) return '';
  const asNumber = Number(raw.replace(',', '.'));
  if (Number.isFinite(asNumber)) return String(Math.trunc(asNumber));
  return raw;
}

function normalizeStoreSearchParam(search) {
  return String(search ?? '').trim().replace(/\s+/g, ' ');
}

function escapeSqlLike(value) {
  return value.replace(/[\\%_[\]]/g, '\\$&');
}

function applyHierarchyFilter(request, hierarchy = null, escadaAlias = 'esc') {
  if (!hierarchy) return '';
  const clauses = [];
  const mappings = [
    ['chaveGerenciaArea', 'CHAVE_GERENCIA_AREA', 'chaveGerenciaArea'],
    ['chaveCoordenacao', 'CHAVE_COORDENACAO', 'chaveCoordenacao'],
    ['chaveSupervisao', 'CHAVE_SUPERVISAO', 'chaveSupervisao'],
    // Compatibilidade com parâmetros antigos.
    ['codGerArea', 'CHAVE_GERENCIA_AREA', 'codGerArea'],
    ['codCoord', 'CHAVE_COORDENACAO', 'codCoord'],
    ['codSupervisao', 'CHAVE_SUPERVISAO', 'codSupervisao'],
    ['codAg', 'COD_AG', 'codAg'],
  ];
  for (const [field, column, param] of mappings) {
    const value = Number(hierarchy[field]);
    if (!Number.isFinite(value) || value <= 0) continue;
    request.input(param, Math.round(value));
    clauses.push(`${escadaAlias}.${column} = @${param}`);
  }
  if (clauses.length === 0) return '';
  return ` AND ${clauses.join(' AND ')}`;
}

const AGENCY_CONS_MATCH_SQL = `
  TRY_CAST(esc.COD_AG AS NVARCHAR(50)) = LTRIM(RTRIM(CAST(a.COD_AG AS NVARCHAR(50))))
`;

export async function fetchAgencyCoordinates({ bbox = null, limit = null, hierarchy = null, user = null } = {}) {
  const request = pool.request();
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  if (hasLimit) request.input('limit', Math.round(limit));
  const bboxSql = applyBboxFilter(
    request,
    bbox,
    'CAST(a.LONGITUDE AS float)',
    'CAST(a.LATITUDE AS float)'
  );
  const hierarchySql = applyHierarchyFilter(request, hierarchy, 'esc');
  const authSql = applyAccessScope(request, user, 'esc');
  const topSql = hasLimit ? 'TOP (@limit)' : '';
  const hierarchyFilterSql = hierarchySql || authSql
    ? `
    AND EXISTS (
      SELECT 1
      FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS esc
      WHERE ${AGENCY_CONS_MATCH_SQL}
      ${hierarchySql}
      ${authSql}
    )
  `
    : '';

  const query = `
    SELECT ${topSql}
      a.COD_AG AS COD_AG,
      a.NOME_AG AS NOME,
      CAST(a.LONGITUDE AS float) AS lon,
      CAST(a.LATITUDE AS float) AS lat,
      a.ENDERECO,
      a.BAIRRO,
      a.CEP,
      a.MUNICIPIO,
      a.UF
    FROM TESTE..TB_COORD_AG_IGOR AS a
    WHERE a.LONGITUDE IS NOT NULL
      AND a.LATITUDE IS NOT NULL
      ${bboxSql}
      ${hierarchyFilterSql}
  `;

  const result = await request.query(query);

  return result.recordset;
}

export async function fetchStoreCoordinates({ bbox = null, limit = null, codAg = null, hierarchy = null, sortByCenter = false, search = null, user = null } = {}) {
  const request = pool.request();
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  if (hasLimit) request.input('limit', Math.round(limit));
  const codAgNorm = normalizeCodAgParam(codAg);
  const hasCodAg = codAgNorm.length > 0;
  if (hasCodAg) request.input('codAg', codAgNorm);
  const storeSearch = normalizeStoreSearchParam(search);
  const hasStoreSearch = storeSearch.length >= 2;
  if (hasStoreSearch) {
    const escapedSearch = escapeSqlLike(storeSearch);
    request.input('storeSearchExact', storeSearch);
    request.input('storeSearchPrefix', `${escapedSearch}%`);
    request.input('storeSearchContains', `%${escapedSearch}%`);
  }

  const bboxSql = hasCodAg
    ? ''
    : applyBboxFilter(
        request,
        bbox,
        'CAST(l.LONGITUDE AS float)',
        'CAST(l.LATITUDE AS float)'
      );
  const codAgSql = hasCodAg
    ? ` AND TRY_CAST(be.COD_AG_LOJA AS BIGINT) = TRY_CAST(@codAg AS BIGINT)`
    : '';
  const hierarchyForFilter =
    hasCodAg && hierarchy
      ? (() => {
          const { codAg: _omitCodAg, ...rest } = hierarchy;
          return Object.keys(rest).length > 0 ? rest : null;
        })()
      : hierarchy;
  const hierarchySql = applyHierarchyFilter(request, hierarchyForFilter, 'esc');
  const authSql = applyAccessScope(request, user, 'esc');
  const hierarchyFilterSql = hierarchySql || authSql
    ? `
      AND EXISTS (
        SELECT 1
        FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS esc
        WHERE TRY_CAST(esc.COD_AG AS NVARCHAR(50)) = LTRIM(RTRIM(CAST(be.COD_AG_LOJA AS NVARCHAR(50))))
        ${hierarchySql}
        ${authSql}
      )
    `
    : '';
  const storeKeySql = `LTRIM(RTRIM(CONVERT(NVARCHAR(100), l.CHAVE_LOJA))) COLLATE Latin1_General_100_CI_AI`;
  const storeNameSql = `LTRIM(RTRIM(CONVERT(NVARCHAR(255), be.NOME_LOJA))) COLLATE Latin1_General_100_CI_AI`;
  const searchFilterSql = hasStoreSearch
    ? `
      AND (
        ${storeKeySql} LIKE @storeSearchPrefix ESCAPE N'\\'
        OR ${storeNameSql} LIKE @storeSearchContains ESCAPE N'\\'
      )
    `
    : '';
  const topSql = hasLimit ? 'TOP (@limit)' : '';
  const shouldSortByCenter = Boolean(sortByCenter && bbox && !hasCodAg);
  if (shouldSortByCenter) {
    request.input('centerLng', (bbox.minLng + bbox.maxLng) / 2);
    request.input('centerLat', (bbox.minLat + bbox.maxLat) / 2);
  }
  const orderBySql = hasStoreSearch
    ? `
      ORDER BY
        CASE
          WHEN ${storeKeySql} = @storeSearchExact THEN 0
          WHEN ${storeKeySql} LIKE @storeSearchPrefix ESCAPE N'\\' THEN 1
          WHEN ${storeNameSql} = @storeSearchExact THEN 2
          WHEN ${storeNameSql} LIKE @storeSearchPrefix ESCAPE N'\\' THEN 3
          ELSE 4
        END,
        ${storeNameSql},
        ${storeKeySql}
    `
    : shouldSortByCenter
    ? `
      ORDER BY
        POWER((CAST(l.LONGITUDE AS float) - @centerLng) * COS(RADIANS(@centerLat)), 2) +
        POWER(CAST(l.LATITUDE AS float) - @centerLat, 2),
        l.CHAVE_LOJA
    `
    : '';

  const query = `
    SELECT ${topSql}
      l.CHAVE_LOJA,
      be.COD_AG_LOJA AS COD_AG,
      CAST(l.LONGITUDE AS float) AS lon,
      CAST(l.LATITUDE AS float) AS lat,
      be.NOME_LOJA,
      be.MUNICIPIO,
      be.UF,
      be.STATUS_TABLET,
      be.DATA_BLOQUEIO AS DT_BLOQUEIO,
      be.MOTIVO_BLOQUEIO,
      CASE
        WHEN LTRIM(RTRIM(be.TIPO_POSTO)) IN (N'Tradicional', N'Ilha') THEN N'Varejo'
        WHEN LTRIM(RTRIM(be.TIPO_POSTO)) = N'Gerenciada' THEN N'Grandes Redes'
        WHEN LTRIM(RTRIM(be.TIPO_POSTO)) = N'Exclusivo' THEN N'Exclusivo'
        WHEN LTRIM(RTRIM(be.TIPO_POSTO)) = N'Mesa de Negócios' THEN N'Casas Bahia'
        ELSE be.TIPO_POSTO
      END AS TIPO_POSTO,
      be.DESC_SEGTO,
      be.DATA_ULT_TRANSACAO AS DT_ULT_TRX,
      CASE WHEN ind.QTD_CIELO > 0 THEN 1 ELSE 0 END AS CIELO_M0,
      CAST(NULL AS INT) AS CHECKLIST
    FROM TESTE..TB_COORD_BE_IGOR AS l
    INNER JOIN DATALAKE..DL_BRADESCO_EXPRESSO AS be
      ON be.CHAVE_LOJA = l.CHAVE_LOJA
    LEFT JOIN DATAWAREHOUSE..TB_INDICADORES_BE AS ind
      ON ind.CHAVE_LOJA = l.CHAVE_LOJA
      AND ind.PERIODO = 202607
    WHERE l.LONGITUDE IS NOT NULL
      AND l.LATITUDE IS NOT NULL
      ${codAgSql}
      ${hierarchyFilterSql}
      ${bboxSql}
      ${searchFilterSql}
    ${orderBySql}
  `;

  const result = await request.query(query);
  return result.recordset;
}

/**
 * Série mensal dos indicadores comerciais de uma loja.
 *
 * Mantém as mesmas regras de negócio da consulta validada para o painel e
 * limita a leitura aos 13 períodos mais recentes (12 meses visíveis + base
 * suficiente para comparações de variação).
 */
export async function hasStoreAccess(chaveLoja, user) {
  const request = pool.request();
  request.input('accessChaveLoja', String(chaveLoja ?? '').trim());
  const authSql = accessScopeExistsForEntity(
    request,
    user,
    `TRY_CAST(auth_ent.COD_AG AS NVARCHAR(50)) =
      LTRIM(RTRIM(CAST(store_auth.COD_AG_LOJA AS NVARCHAR(50))))`,
    'auth_ent'
  );
  const result = await request.query(`
    SELECT TOP (1) 1 AS allowed
    FROM DATALAKE..DL_BRADESCO_EXPRESSO AS store_auth
    WHERE LTRIM(RTRIM(CAST(store_auth.CHAVE_LOJA AS NVARCHAR(100)))) = @accessChaveLoja
      ${authSql}
  `);
  return result.recordset.length > 0;
}

export async function fetchStoreProductionHistory(chaveLoja) {
  const request = pool.request();
  request.input('chaveLoja', String(chaveLoja ?? '').trim());

  const result = await request.query(`
    SELECT
      historico.periodo,
      historico.qtdTrxContabil,
      historico.qtdTrxNegocio,
      historico.qtdContas,
      historico.qtdConsig,
      historico.qtdLime,
      historico.qtdCreditoParcelado,
      historico.qtdCartao,
      historico.qtdFgts,
      historico.qtdVida,
      historico.qtdMicro,
      historico.qtdResidencial,
      historico.qtdDental,
      historico.qtdSuper,
      historico.qtdSegDebito,
      historico.qtdCred,
      historico.vlrCred,
      historico.segTotal
    FROM (
      SELECT TOP (13)
        TRY_CONVERT(int, A.PERIODO) AS periodo,
        ISNULL(A.QTD_TRX_CONTABIL_DTLHES, 0) AS qtdTrxContabil,

        CASE
          WHEN TRY_CONVERT(int, A.PERIODO) <= 202606 THEN
            ISNULL(A.QTD_CONTAS_TABLET_POS, 0)
              + ISNULL(A.QTD_CONTA_SALARIO, 0)
              + ISNULL(A.QTD_CONSIG_AVERBADO, 0)
              + ISNULL(A.QTD_CONSIG_AVERBADO_PLATAF, 0)
              + ISNULL(A.QTD_LIME_DTLHES, 0)
              + ISNULL(A.QTD_LIME_DTLHES_PLATAFORMA, 0)
              + ISNULL(A.QTD_CREDITO_PARCEL_DTLHES, 0)
              + ISNULL(A.QTD_CARTAO_CONTRATADO, 0)
              + ISNULL(A.QTD_CARTAO_CONTRATADO_PLATAFORMA, 0)
              + ISNULL(A.QTD_CARTAO_AVULSO_PLATAFORMA, 0)
              + ISNULL(A.QTD_FGTS, 0)
              + ISNULL(A.QTD_MICRO_VIVAVIDA, 0)
              + ISNULL(A.QTD_MICROSSEGUROS, 0)
              + ISNULL(A.QTD_SEG_RESIDENCIAL, 0)
              + ISNULL(A.QTD_PLANO_ODONTO, 0)
              + ISNULL(A.QTD_DEPENDENTES_ODONTO, 0)
              + ISNULL(A.QTD_SUPER_PROTEGIDO, 0)
              + ISNULL(A.QTD_SUPERPROTEGIDO_PLATAFORMA, 0)
              + ISNULL(A.QTD_SEG_CARTAO_DEB_CTA, 0)
              + ISNULL(A.QTD_SEG_CARTAO_DEB_DESBL, 0)
              + (ISNULL(A.VLR_EXP_SORTE, 0) / 50.0)
          ELSE
            ISNULL(A.QTD_CONTAS_TABLET_POS, 0)
              + ISNULL(A.QTD_CONTA_SALARIO, 0)
              + ISNULL(A.QTD_CONSIG_AVERBADO, 0)
              + ISNULL(A.QTD_CONSIG_AVERBADO_PLATAF, 0)
              + ISNULL(A.QTD_LIME_DTLHES, 0)
              + ISNULL(A.QTD_LIME_DTLHES_PLATAFORMA, 0)
              + ISNULL(A.QTD_CREDITO_PARCEL_DTLHES, 0)
              + ISNULL(A.QTD_CARTAO_CONTRATADO, 0)
              + ISNULL(A.QTD_CARTAO_CONTRATADO_PLATAFORMA, 0)
              + ISNULL(A.QTD_CARTAO_AVULSO_PLATAFORMA, 0)
              + ISNULL(A.QTD_FGTS, 0)
              + FLOOR(ISNULL(A.QTD_MICRO_VIVAVIDA, 0) / 3.0)
              + FLOOR(ISNULL(A.QTD_MICROSSEGUROS, 0) / 3.0)
              + ISNULL(A.QTD_SEG_RESIDENCIAL, 0)
              + ISNULL(A.QTD_PLANO_ODONTO, 0)
              + ISNULL(A.QTD_DEPENDENTES_ODONTO, 0)
              + ISNULL(A.QTD_SUPER_PROTEGIDO, 0)
              + ISNULL(A.QTD_SUPERPROTEGIDO_PLATAFORMA, 0)
              + ISNULL(A.QTD_SEG_CARTAO_DEB_CTA, 0)
              + ISNULL(A.QTD_SEG_CARTAO_DEB_DESBL, 0)
              + FLOOR(ISNULL(A.VLR_EXP_SORTE, 0) / 50.0)
        END AS qtdTrxNegocio,

        ISNULL(A.QTD_CONTAS_TABLET_POS, 0)
          + ISNULL(A.QTD_CONTAS_FOLHA, 0) AS qtdContas,

        ISNULL(A.QTD_CONSIG_AVERBADO, 0)
          + ISNULL(A.QTD_CONSIG_AVERBADO_PLATAF, 0) AS qtdConsig,

        ISNULL(A.QTD_LIME_DTLHES, 0)
          + ISNULL(A.QTD_LIME_DTLHES_PLATAFORMA, 0) AS qtdLime,

        ISNULL(A.QTD_CREDITO_PARCEL_DTLHES, 0) AS qtdCreditoParcelado,

        ISNULL(A.QTD_CARTAO_CONTRATADO, 0)
          + ISNULL(A.QTD_CARTAO_CONTRATADO_PLATAFORMA, 0)
          + ISNULL(A.QTD_CARTAO_AVULSO_PLATAFORMA, 0) AS qtdCartao,

        ISNULL(A.QTD_FGTS, 0) AS qtdFgts,
        ISNULL(A.QTD_MICRO_VIVAVIDA, 0) AS qtdVida,
        ISNULL(A.QTD_MICROSSEGUROS, 0) AS qtdMicro,
        ISNULL(A.QTD_SEG_RESIDENCIAL, 0) AS qtdResidencial,

        ISNULL(A.QTD_PLANO_ODONTO, 0)
          + ISNULL(A.QTD_DEPENDENTES_ODONTO, 0) AS qtdDental,

        ISNULL(A.QTD_SUPER_PROTEGIDO, 0)
          + ISNULL(A.QTD_SUPERPROTEGIDO_PLATAFORMA, 0) AS qtdSuper,

        ISNULL(A.QTD_SEG_CARTAO_DEB_CTA, 0)
          + ISNULL(A.QTD_SEG_CARTAO_DEB_DESBL, 0) AS qtdSegDebito,

        ISNULL(A.QTD_CONSIG_AVERBADO, 0)
          + ISNULL(A.QTD_CONSIG_AVERBADO_PLATAF, 0)
          + ISNULL(A.QTD_CRED_CONSIG_PUB_AVERB, 0)
          + ISNULL(A.QTD_CRED_CONSIG_PRIV_AVERB, 0)
          + ISNULL(A.QTD_LIME_DTLHES, 0)
          + ISNULL(A.QTD_LIME_DTLHES_PLATAFORMA, 0)
          + ISNULL(A.QTD_CREDITO_PARCEL_DTLHES, 0) AS qtdCred,

        ISNULL(A.VLR_CONSIG_CONTRATO_AVERBADO, 0)
          + ISNULL(A.VLR_CONSIG_CONTRATO_AVERBADO_PLATAF, 0)
          + ISNULL(A.VLR_EMPRESTIMO_CRED_CONSIG_PUB_AVERB, 0)
          + ISNULL(A.VLR_EMPRESTIMO_CRED_CONSIG_PRIV_AVERB, 0)
          + ISNULL(A.VLR_LIME_DTLHES_EMPRESTIMO, 0)
          + ISNULL(A.VLR_LIME_DTLHES_EMPRESTIMO_PLATAFORMA, 0)
          + ISNULL(A.VLR_CREDITO_PARCEL_DTLHES_EMPRESTIMO, 0) AS vlrCred,

        ISNULL(A.QTD_MICROSSEGUROS, 0)
          + ISNULL(A.QTD_MICRO_VIVAVIDA, 0)
          + ISNULL(A.QTD_SUPER_PROTEGIDO, 0)
          + ISNULL(A.QTD_SUPERPROTEGIDO_PLATAFORMA, 0)
          + ISNULL(A.QTD_SEG_RESIDENCIAL, 0)
          + ISNULL(A.QTD_TITULO_EXP_SORTE, 0)
          + ISNULL(A.QTD_PLANO_ODONTO, 0)
          + ISNULL(A.QTD_DEPENDENTES_ODONTO, 0)
          + ISNULL(A.QTD_SEG_CARTAO_DEB_CTA, 0)
          + ISNULL(A.QTD_SEG_CARTAO_DEB_DESBL, 0) AS segTotal
      FROM DATAWAREHOUSE..TB_INDICADORES_BE AS A
      WHERE A.CHAVE_LOJA = @chaveLoja
        AND TRY_CONVERT(int, A.PERIODO) IS NOT NULL
        AND TRY_CONVERT(int, A.PERIODO) <= YEAR(GETDATE()) * 100 + MONTH(GETDATE())
      ORDER BY TRY_CONVERT(int, A.PERIODO) DESC
    ) AS historico
    ORDER BY historico.periodo ASC
  `);

  return result.recordset;
}

function normalizeSeatHierarchy(hierarchy = null) {
  if (!hierarchy) return { ga: null, coord: null, sup: null };
  const parse = (...keys) => {
    for (const key of keys) {
      const value = Number(hierarchy[key]);
      if (Number.isFinite(value) && value > 0) return Math.round(value);
    }
    return null;
  };
  return {
    ga: parse('chaveGerenciaArea', 'codGerArea'),
    coord: parse('chaveCoordenacao', 'codCoord'),
    sup: parse('chaveSupervisao', 'codSupervisao'),
  };
}

export async function fetchCommercialSeatCoordinates({ hierarchy = null, user = null } = {}) {
  const request = pool.request();
  const normalized = normalizeSeatHierarchy(hierarchy);
  const hasSupervisao = Number.isFinite(normalized.sup);
  const hasCoordenacao = Number.isFinite(normalized.coord);
  const hasGerenciaArea = Number.isFinite(normalized.ga);

  if (hasGerenciaArea) request.input('seatChaveGerenciaArea', normalized.ga);
  if (hasCoordenacao) request.input('seatChaveCoordenacao', normalized.coord);
  if (hasSupervisao) request.input('seatChaveSupervisao', normalized.sup);

  const gaFilterSql = hasGerenciaArea ? ' AND ent.CHAVE_GERENCIA_AREA = @seatChaveGerenciaArea' : '';
  const coordFilterSql = hasCoordenacao ? ' AND ent.CHAVE_COORDENACAO = @seatChaveCoordenacao' : '';
  const supFilterSql = hasSupervisao ? ' AND ent.CHAVE_SUPERVISAO = @seatChaveSupervisao' : '';
  const gaDirectFilterSql = hasGerenciaArea ? ' AND g.CHAVE_GERENCIA_AREA = @seatChaveGerenciaArea' : '';
  const coordDirectFilterSql = hasCoordenacao ? ' AND c.CHAVE_COORDENACAO = @seatChaveCoordenacao' : '';
  const supDirectFilterSql = hasSupervisao ? ' AND s.CHAVE_SUPERVISAO = @seatChaveSupervisao' : '';
  const entAuthSql = applyAccessScope(request, user, 'ent');
  const gaAccessSql = accessScopeExistsForEntity(
    request,
    user,
    'auth_ent.CHAVE_GERENCIA_AREA = g.CHAVE_GERENCIA_AREA',
    'auth_ent'
  );
  const coordAccessSql = accessScopeExistsForEntity(
    request,
    user,
    'auth_ent.CHAVE_COORDENACAO = c.CHAVE_COORDENACAO',
    'auth_ent'
  );
  const supAccessSql = accessScopeExistsForEntity(
    request,
    user,
    'auth_ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO',
    'auth_ent'
  );

  let query = '';
  if (hasSupervisao) {
    query = `
      SELECT
        CAST(s.CHAVE_SUPERVISAO AS BIGINT) AS entidadeChave,
        s.DESC_SUPERVISAO AS entidadeNome,
        CAST((
          SELECT TOP 1 ent.CHAVE_GERENCIA_AREA
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST((
          SELECT TOP 1 ent.CHAVE_COORDENACAO
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(s.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(s.LON AS float) AS lon,
        CAST(s.LAT AS float) AS lat,
        CAST('supervisor' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_SUP AS s
      WHERE s.LON IS NOT NULL
        AND s.LAT IS NOT NULL
        ${supDirectFilterSql}
        ${supAccessSql}
    `;
  } else if (hasCoordenacao) {
    query = `
      SELECT
        CAST(c.CHAVE_COORDENACAO AS BIGINT) AS entidadeChave,
        c.DESC_COORDENACAO AS entidadeNome,
        CAST((
          SELECT TOP 1 ent.CHAVE_GERENCIA_AREA
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_COORDENACAO = c.CHAVE_COORDENACAO
        ) AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST(c.CHAVE_COORDENACAO AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(c.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(c.LON AS float) AS lon,
        CAST(c.LAT AS float) AS lat,
        CAST('coordenador' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_COORDENADOR AS c
      WHERE c.LON IS NOT NULL
        AND c.LAT IS NOT NULL
        ${coordDirectFilterSql}
        ${coordAccessSql}
      UNION ALL
      SELECT
        CAST(s.CHAVE_SUPERVISAO AS BIGINT) AS entidadeChave,
        s.DESC_SUPERVISAO AS entidadeNome,
        CAST((
          SELECT TOP 1 ent.CHAVE_GERENCIA_AREA
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST((
          SELECT TOP 1 ent.CHAVE_COORDENACAO
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(s.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(s.LON AS float) AS lon,
        CAST(s.LAT AS float) AS lat,
        CAST('supervisor' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_SUP AS s
      WHERE s.LON IS NOT NULL
        AND s.LAT IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
          ${coordFilterSql}
          ${entAuthSql}
        )
    `;
  } else if (hasGerenciaArea) {
    query = `
      SELECT
        CAST(g.CHAVE_GERENCIA_AREA AS BIGINT) AS entidadeChave,
        g.DESC_GERENCIA_AREA AS entidadeNome,
        CAST(g.CHAVE_GERENCIA_AREA AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST(NULL AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(g.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(g.LON AS float) AS lon,
        CAST(g.LAT AS float) AS lat,
        CAST('gerente_area' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_GA AS g
      WHERE g.LON IS NOT NULL
        AND g.LAT IS NOT NULL
        ${gaDirectFilterSql}
        ${gaAccessSql}
      UNION ALL
      SELECT
        CAST(c.CHAVE_COORDENACAO AS BIGINT) AS entidadeChave,
        c.DESC_COORDENACAO AS entidadeNome,
        CAST((
          SELECT TOP 1 ent.CHAVE_GERENCIA_AREA
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_COORDENACAO = c.CHAVE_COORDENACAO
        ) AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST(c.CHAVE_COORDENACAO AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(c.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(c.LON AS float) AS lon,
        CAST(c.LAT AS float) AS lat,
        CAST('coordenador' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_COORDENADOR AS c
      WHERE c.LON IS NOT NULL
        AND c.LAT IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_COORDENACAO = c.CHAVE_COORDENACAO
          ${gaFilterSql}
          ${entAuthSql}
        )
      UNION ALL
      SELECT
        CAST(s.CHAVE_SUPERVISAO AS BIGINT) AS entidadeChave,
        s.DESC_SUPERVISAO AS entidadeNome,
        CAST((
          SELECT TOP 1 ent.CHAVE_GERENCIA_AREA
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST((
          SELECT TOP 1 ent.CHAVE_COORDENACAO
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(s.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(s.LON AS float) AS lon,
        CAST(s.LAT AS float) AS lat,
        CAST('supervisor' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_SUP AS s
      WHERE s.LON IS NOT NULL
        AND s.LAT IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
          ${gaFilterSql}
          ${entAuthSql}
        )
    `;
  } else {
    query = `
      SELECT
        CAST(g.CHAVE_GERENCIA_AREA AS BIGINT) AS entidadeChave,
        g.DESC_GERENCIA_AREA AS entidadeNome,
        CAST(g.CHAVE_GERENCIA_AREA AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST(NULL AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(g.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(g.LON AS float) AS lon,
        CAST(g.LAT AS float) AS lat,
        CAST('gerente_area' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_GA AS g
      WHERE g.LON IS NOT NULL
        AND g.LAT IS NOT NULL
        ${gaAccessSql}
      UNION ALL
      SELECT
        CAST(c.CHAVE_COORDENACAO AS BIGINT) AS entidadeChave,
        c.DESC_COORDENACAO AS entidadeNome,
        CAST((
          SELECT TOP 1 ent.CHAVE_GERENCIA_AREA
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_COORDENACAO = c.CHAVE_COORDENACAO
        ) AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST(c.CHAVE_COORDENACAO AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(c.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(c.LON AS float) AS lon,
        CAST(c.LAT AS float) AS lat,
        CAST('coordenador' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_COORDENADOR AS c
      WHERE c.LON IS NOT NULL
        AND c.LAT IS NOT NULL
        ${coordAccessSql}
      UNION ALL
      SELECT
        CAST(s.CHAVE_SUPERVISAO AS BIGINT) AS entidadeChave,
        s.DESC_SUPERVISAO AS entidadeNome,
        CAST((
          SELECT TOP 1 ent.CHAVE_GERENCIA_AREA
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_GERENCIA_AREA,
        CAST((
          SELECT TOP 1 ent.CHAVE_COORDENACAO
          FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
          WHERE ent.CHAVE_SUPERVISAO = s.CHAVE_SUPERVISAO
        ) AS BIGINT) AS CHAVE_COORDENACAO,
        CAST(s.COD_AG AS NVARCHAR(50)) AS COD_AG,
        CAST(s.LON AS float) AS lon,
        CAST(s.LAT AS float) AS lat,
        CAST('supervisor' AS NVARCHAR(30)) AS commercialLevel
      FROM TESTE..TB_COORD_SUP AS s
      WHERE s.LON IS NOT NULL
        AND s.LAT IS NOT NULL
        ${supAccessSql}
    `;
  }

  const result = await request.query(query);
  return result.recordset;
}
