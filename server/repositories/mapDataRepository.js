import { pool } from '../db/sqlServer.js';
import { applyAccessScope, accessScopeExistsForEntity } from '../auth/scopeSql.js';
import {
  productionMetricSql,
  storeBusinessQuantitySql,
  storeCreditQuantitySql,
} from '../domain/productionMetrics.js';

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

export async function fetchAgencyDetail({ codAg, user = null }) {
  const request = pool.request();
  request.input('agencyDetailCodAg', String(codAg).trim());
  const authSql = accessScopeExistsForEntity(
    request,
    user,
    `TRY_CONVERT(bigint, auth_ent.COD_AG) = TRY_CONVERT(bigint, agency.COD_AG)`,
    'auth_ent'
  );

  const result = await request.query(`
    SELECT TOP (1)
      LTRIM(RTRIM(CAST(agency.COD_AG AS NVARCHAR(50)))) AS COD_AG,
      agency.NOME_AG,
      hierarchy.CHAVE_SUPERVISAO,
      hierarchy.DESC_SUPERVISAO,
      supervisor.NOME_FUNC AS SUPERVISOR_NOME_FUNC,
      supervisor.GUERRA_FUNC AS SUPERVISOR_GUERRA_FUNC,
      hierarchy.CHAVE_COORDENACAO,
      hierarchy.DESC_COORDENACAO,
      coordinator.NOME_FUNC AS COORDENADOR_NOME_FUNC,
      coordinator.GUERRA_FUNC AS COORDENADOR_GUERRA_FUNC,
      hierarchy.CHAVE_GERENCIA_AREA,
      hierarchy.DESC_GERENCIA_AREA,
      areaManager.NOME_FUNC AS GERENTE_AREA_NOME_FUNC,
      areaManager.GUERRA_FUNC AS GERENTE_AREA_GUERRA_FUNC
    FROM TESTE..TB_COORD_AG_IGOR AS agency
    OUTER APPLY (
      SELECT TOP (1)
        ent.CHAVE_SUPERVISAO,
        ent.DESC_SUPERVISAO,
        ent.CHAVE_COORDENACAO,
        ent.DESC_COORDENACAO,
        ent.CHAVE_GERENCIA_AREA,
        ent.DESC_GERENCIA_AREA
      FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
      WHERE TRY_CONVERT(bigint, ent.COD_AG) = TRY_CONVERT(bigint, agency.COD_AG)
      ORDER BY ent.CHAVE_SUPERVISAO, ent.CHAVE_COORDENACAO, ent.CHAVE_GERENCIA_AREA
    ) AS hierarchy
    LEFT JOIN TESTE..TB_COORD_SUP AS supervisor
      ON supervisor.CHAVE_SUPERVISAO = hierarchy.CHAVE_SUPERVISAO
    LEFT JOIN TESTE..TB_COORD_COORDENADOR AS coordinator
      ON coordinator.CHAVE_COORDENACAO = hierarchy.CHAVE_COORDENACAO
    LEFT JOIN TESTE..TB_COORD_GA AS areaManager
      ON areaManager.CHAVE_GERENCIA_AREA = hierarchy.CHAVE_GERENCIA_AREA
    WHERE TRY_CONVERT(bigint, agency.COD_AG) = TRY_CONVERT(bigint, @agencyDetailCodAg)
      ${authSql}
  `);

  return result.recordset[0] ?? null;
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
  const creditQuantitySql = storeCreditQuantitySql('ind');
  const businessQuantitySql = storeBusinessQuantitySql('ind', 'consortium');

  const query = `
    SELECT ${topSql}
      l.CHAVE_LOJA,
      be.COD_AG_LOJA AS COD_AG,
      be.NOME_AG,
      supervision.DESC_SUPERVISAO,
      supervisor.GUERRA_FUNC AS NOME_GERENTE_COMERCIAL,
      CASE
        WHEN UPPER(LTRIM(RTRIM(be.BE_ORG_PAGADOR))) = 'S' THEN 1
        ELSE 0
      END AS ORGAO_PAGADOR,
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
      ISNULL(ind.VLR_FAT_CIELO, 0) AS VLR_FAT_CIELO_M0,
      CASE WHEN previousCielo.CHAVE_LOJA IS NOT NULL THEN 1 ELSE 0 END AS CIELO_HISTORICO,
      CASE
        WHEN previousCielo.ULTIMO_PERIODO IS NULL THEN NULL
        ELSE DATEDIFF(
          MONTH,
          DATEFROMPARTS(previousCielo.ULTIMO_PERIODO / 100, previousCielo.ULTIMO_PERIODO % 100, 1),
          DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
        )
      END AS CIELO_HISTORICO_MESES,
      CASE WHEN (${creditQuantitySql}) > 0 THEN 1 ELSE 0 END AS CREDITO_M0,
      CASE WHEN previousCredito.CHAVE_LOJA IS NOT NULL THEN 1 ELSE 0 END AS CREDITO_HISTORICO,
      CASE
        WHEN previousCredito.ULTIMO_PERIODO IS NULL THEN NULL
        ELSE DATEDIFF(
          MONTH,
          DATEFROMPARTS(previousCredito.ULTIMO_PERIODO / 100, previousCredito.ULTIMO_PERIODO % 100, 1),
          DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
        )
      END AS CREDITO_HISTORICO_MESES,
      CASE WHEN (${businessQuantitySql}) > 0 THEN 1 ELSE 0 END AS NEGOCIO_M0,
      CASE WHEN previousNegocio.CHAVE_LOJA IS NOT NULL THEN 1 ELSE 0 END AS NEGOCIO_HISTORICO,
      CASE
        WHEN previousNegocio.ULTIMO_PERIODO IS NULL THEN NULL
        ELSE DATEDIFF(
          MONTH,
          DATEFROMPARTS(previousNegocio.ULTIMO_PERIODO / 100, previousNegocio.ULTIMO_PERIODO % 100, 1),
          DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
        )
      END AS NEGOCIO_HISTORICO_MESES,
      CASE
        WHEN ISNULL(ind.QTD_TRX_CONTABIL_DTLHES, 0) >= 200
          OR (${businessQuantitySql}) >= 5
        THEN 1
        ELSE 0
      END AS ATIVO_PADE_M0,
      CASE WHEN missingProposal.CHAVE_LOJA IS NULL THEN 1 ELSE 0 END AS PROPOSTA_VALOR,
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
    FROM TESTE..TB_COORD_BE_IGOR AS l
    INNER JOIN DATALAKE..DL_BRADESCO_EXPRESSO AS be
      ON be.CHAVE_LOJA = l.CHAVE_LOJA
    LEFT JOIN MESU..CONS_DISTRIBUICAO_ENTIDADES AS supervision
      ON TRY_CONVERT(bigint, supervision.COD_AG) = TRY_CONVERT(bigint, be.COD_AG_LOJA)
    LEFT JOIN TESTE..TB_COORD_SUP AS supervisor
      ON supervisor.CHAVE_SUPERVISAO = supervision.CHAVE_SUPERVISAO
    LEFT JOIN DATAWAREHOUSE..TB_INDICADORES_BE AS ind
      ON ind.CHAVE_LOJA = l.CHAVE_LOJA
      AND ind.PERIODO = YEAR(GETDATE()) * 100 + MONTH(GETDATE())
    LEFT JOIN (
      SELECT
        CHAVE_LOJA,
        MAX(TRY_CONVERT(int, PERIODO)) AS ULTIMO_PERIODO
      FROM DATAWAREHOUSE..TB_INDICADORES_BE
      WHERE TRY_CONVERT(int, PERIODO) >=
          YEAR(DATEADD(MONTH, -12, GETDATE())) * 100
            + MONTH(DATEADD(MONTH, -12, GETDATE()))
        AND TRY_CONVERT(int, PERIODO) < YEAR(GETDATE()) * 100 + MONTH(GETDATE())
        AND ISNULL(VLR_FAT_CIELO, 0) > 0
      GROUP BY CHAVE_LOJA
    ) AS previousCielo
      ON previousCielo.CHAVE_LOJA = l.CHAVE_LOJA
    LEFT JOIN (
      SELECT
        prevCred.CHAVE_LOJA,
        MAX(TRY_CONVERT(int, prevCred.PERIODO)) AS ULTIMO_PERIODO
      FROM DATAWAREHOUSE..TB_INDICADORES_BE AS prevCred
      WHERE TRY_CONVERT(int, prevCred.PERIODO) >=
          YEAR(DATEADD(MONTH, -12, GETDATE())) * 100
            + MONTH(DATEADD(MONTH, -12, GETDATE()))
        AND TRY_CONVERT(int, prevCred.PERIODO) < YEAR(GETDATE()) * 100 + MONTH(GETDATE())
        AND (${storeCreditQuantitySql('prevCred')}) > 0
      GROUP BY prevCred.CHAVE_LOJA
    ) AS previousCredito
      ON previousCredito.CHAVE_LOJA = l.CHAVE_LOJA
    LEFT JOIN (
      SELECT
        prevNeg.CHAVE_LOJA,
        MAX(TRY_CONVERT(int, prevNeg.PERIODO)) AS ULTIMO_PERIODO
      FROM DATAWAREHOUSE..TB_INDICADORES_BE AS prevNeg
      LEFT JOIN (
        SELECT
          CHAVE_LOJA,
          ANO_MES,
          SUM(REALIZADO) AS REALIZADO
        FROM PADE..REALIZADO_CREDITO_CONCEDIDO
        WHERE INDICADOR = 'CONSORCIO'
        GROUP BY CHAVE_LOJA, ANO_MES
      ) AS prevNegConsortium
        ON prevNegConsortium.CHAVE_LOJA = prevNeg.CHAVE_LOJA
        AND prevNegConsortium.ANO_MES = TRY_CONVERT(int, prevNeg.PERIODO)
      WHERE TRY_CONVERT(int, prevNeg.PERIODO) >=
          YEAR(DATEADD(MONTH, -12, GETDATE())) * 100
            + MONTH(DATEADD(MONTH, -12, GETDATE()))
        AND TRY_CONVERT(int, prevNeg.PERIODO) < YEAR(GETDATE()) * 100 + MONTH(GETDATE())
        AND (${storeBusinessQuantitySql('prevNeg', 'prevNegConsortium')}) > 0
      GROUP BY prevNeg.CHAVE_LOJA
    ) AS previousNegocio
      ON previousNegocio.CHAVE_LOJA = l.CHAVE_LOJA
    LEFT JOIN (
      SELECT
        CHAVE_LOJA,
        SUM(REALIZADO) AS REALIZADO
      FROM PADE..REALIZADO_CREDITO_CONCEDIDO
      WHERE INDICADOR = 'CONSORCIO'
        AND ANO_MES = YEAR(GETDATE()) * 100 + MONTH(GETDATE())
      GROUP BY CHAVE_LOJA
    ) AS consortium
      ON consortium.CHAVE_LOJA = ind.CHAVE_LOJA
    LEFT JOIN TESTE..TB_PORTAL_COMERCIAL_LOJAS_S_PROPOSTA_VALOR AS missingProposal
      ON missingProposal.CHAVE_LOJA = CONVERT(VARCHAR(50), l.CHAVE_LOJA)
    LEFT JOIN (
      SELECT
        DATEADD(YEAR, 1, MAX(DT_CADASTRO)) AS DT_VENCIMENTO_CHECKLIST,
        CHAVE_LOJA
      FROM PAA.DBO.TB_ANALISE_CHECKLIST_AG WITH (NOLOCK)
      WHERE ID_STATUS_CHECKLIST_AG = 1
      GROUP BY CHAVE_LOJA
    ) AS checklist
      ON checklist.CHAVE_LOJA = l.CHAVE_LOJA
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

const COMMERCIAL_SEAT_DETAIL_CONFIG = {
  supervisor: {
    table: 'TB_COORD_SUP',
    key: 'CHAVE_SUPERVISAO',
    description: 'DESC_SUPERVISAO',
    parentTable: 'TB_COORD_COORDENADOR',
    parentKey: 'CHAVE_COORDENACAO',
    parentDescription: 'DESC_COORDENACAO',
    parentLevel: 'Gerente Comercial III',
    grandParentTable: 'TB_COORD_GA',
    grandParentKey: 'CHAVE_GERENCIA_AREA',
    grandParentDescription: 'DESC_GERENCIA_AREA',
    grandParentLevel: 'Gerente de Gestão',
  },
  coordenador: {
    table: 'TB_COORD_COORDENADOR',
    key: 'CHAVE_COORDENACAO',
    description: 'DESC_COORDENACAO',
    parentTable: 'TB_COORD_GA',
    parentKey: 'CHAVE_GERENCIA_AREA',
    parentDescription: 'DESC_GERENCIA_AREA',
    parentLevel: 'Gerente de Gestão',
    grandParentTable: null,
    grandParentKey: null,
    grandParentDescription: null,
    grandParentLevel: null,
  },
  gerente_area: {
    table: 'TB_COORD_GA',
    key: 'CHAVE_GERENCIA_AREA',
    description: 'DESC_GERENCIA_AREA',
    parentTable: null,
    parentKey: null,
    parentDescription: null,
    parentLevel: null,
    grandParentTable: null,
    grandParentKey: null,
    grandParentDescription: null,
    grandParentLevel: null,
  },
};

export async function fetchCommercialSeatDetail({ commercialLevel, chaveEntidade, user = null }) {
  const config = COMMERCIAL_SEAT_DETAIL_CONFIG[commercialLevel];
  if (!config) return null;

  const request = pool.request();
  request.input('seatDetailKey', Math.round(Number(chaveEntidade)));
  const authSql = applyAccessScope(request, user, 'ent');
  const grandParentSelectSql = config.grandParentTable
    ? `,
          CAST(ent.${config.grandParentKey} AS BIGINT) AS superiorAcimaChave,
          ent.${config.grandParentDescription} AS superiorAcimaDescricao,
          superiorAcima.NOME_FUNC AS superiorAcimaPessoaNome,
          superiorAcima.GUERRA_FUNC AS superiorAcimaNomeGuerra`
    : `,
          CAST(NULL AS BIGINT) AS superiorAcimaChave,
          CAST(NULL AS NVARCHAR(255)) AS superiorAcimaDescricao,
          CAST(NULL AS NVARCHAR(255)) AS superiorAcimaPessoaNome,
          CAST(NULL AS NVARCHAR(255)) AS superiorAcimaNomeGuerra`;
  const grandParentJoinSql = config.grandParentTable
    ? `LEFT JOIN TESTE..${config.grandParentTable} AS superiorAcima
          ON superiorAcima.${config.grandParentKey} = ent.${config.grandParentKey}`
    : '';
  const parentApplySql = config.parentTable
    ? `
      OUTER APPLY (
        SELECT TOP (1)
          CAST(ent.${config.parentKey} AS BIGINT) AS superiorChave,
          ent.${config.parentDescription} AS superiorDescricao,
          superior.NOME_FUNC AS superiorPessoaNome,
          superior.GUERRA_FUNC AS superiorNomeGuerra
          ${grandParentSelectSql}
        FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
        LEFT JOIN TESTE..${config.parentTable} AS superior
          ON superior.${config.parentKey} = ent.${config.parentKey}
        ${grandParentJoinSql}
        WHERE ent.${config.key} = person.${config.key}
        ORDER BY ent.${config.parentKey}
      ) AS parentInfo
    `
    : `
      OUTER APPLY (
        SELECT
          CAST(NULL AS BIGINT) AS superiorChave,
          CAST(NULL AS NVARCHAR(255)) AS superiorDescricao,
          CAST(NULL AS NVARCHAR(255)) AS superiorPessoaNome,
          CAST(NULL AS NVARCHAR(255)) AS superiorNomeGuerra,
          CAST(NULL AS BIGINT) AS superiorAcimaChave,
          CAST(NULL AS NVARCHAR(255)) AS superiorAcimaDescricao,
          CAST(NULL AS NVARCHAR(255)) AS superiorAcimaPessoaNome,
          CAST(NULL AS NVARCHAR(255)) AS superiorAcimaNomeGuerra
      ) AS parentInfo
    `;

  const result = await request.query(`
    SELECT TOP (1)
      CAST(person.${config.key} AS BIGINT) AS chaveEntidade,
      person.${config.description} AS entidadeNome,
      person.NOME_FUNC AS pessoaNome,
      person.GUERRA_FUNC AS nomeGuerra,
      person.EMAIL_FUNC AS email,
      parentInfo.superiorChave,
      parentInfo.superiorDescricao,
      parentInfo.superiorPessoaNome,
      parentInfo.superiorNomeGuerra,
      parentInfo.superiorAcimaChave,
      parentInfo.superiorAcimaDescricao,
      parentInfo.superiorAcimaPessoaNome,
      parentInfo.superiorAcimaNomeGuerra,
      ISNULL(linked.qtdAgencias, 0) AS qtdAgencias,
      ISNULL(linked.qtdLojas, 0) AS qtdLojas
    FROM TESTE..${config.table} AS person
    ${parentApplySql}
    OUTER APPLY (
      SELECT
        COUNT(DISTINCT TRY_CONVERT(bigint, ent.COD_AG)) AS qtdAgencias,
        COUNT(DISTINCT LTRIM(RTRIM(CONVERT(NVARCHAR(100), store.CHAVE_LOJA)))) AS qtdLojas
      FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
      LEFT JOIN DATALAKE..DL_BRADESCO_EXPRESSO AS store
        ON TRY_CONVERT(bigint, store.COD_AG_LOJA) = TRY_CONVERT(bigint, ent.COD_AG)
      WHERE ent.${config.key} = person.${config.key}
    ) AS linked
    WHERE person.${config.key} = @seatDetailKey
      AND EXISTS (
        SELECT 1
        FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
        WHERE ent.${config.key} = person.${config.key}
        ${authSql}
      )
  `);

  const row = result.recordset[0];
  return row
    ? {
        ...row,
        commercialLevel,
        superiorNivel: config.parentLevel,
        superiorAcimaNivel: config.grandParentLevel,
      }
    : null;
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

export async function fetchProductionHeatmapPeriods() {
  const result = await pool.request().query(`
    SELECT DISTINCT TOP (12)
      TRY_CONVERT(int, PERIODO) AS periodo
    FROM DATAWAREHOUSE..TB_INDICADORES_BE
    WHERE TRY_CONVERT(int, PERIODO) IS NOT NULL
      AND TRY_CONVERT(int, PERIODO) <= YEAR(GETDATE()) * 100 + MONTH(GETDATE())
    ORDER BY periodo DESC
  `);
  return result.recordset;
}

export async function fetchProductionHeatmapRows({ metricId, period, user }) {
  const metricExpression = productionMetricSql(metricId, 'A', 'E');
  if (!metricExpression) throw new Error('Indicador de mapa de produção inválido.');

  const request = pool.request();
  request.input('period', period);
  const accessSql = applyAccessScope(request, user, 'esc', 'heatmapAuthCodFunc');

  const result = await request.query(`
    SELECT DISTINCT
      store.CHAVE_LOJA,
      -- CD_MUNIC é float(53): CONVERT(varchar, float) vira notação científica
      -- (ex.: 4.102321e+006). STR(..., 0) força o inteiro IBGE em texto.
      CASE
        WHEN store.CD_MUNIC IS NULL THEN NULL
        ELSE RIGHT(
          REPLICATE('0', 7) + LTRIM(RTRIM(STR(ROUND(CONVERT(float, store.CD_MUNIC), 0), 20, 0))),
          7
        )
      END AS municipalityCode,
      LTRIM(RTRIM(CONVERT(nvarchar(200), store.MUNICIPIO))) AS municipalityName,
      UPPER(LTRIM(RTRIM(CONVERT(varchar(2), store.UF)))) AS uf,
      CAST(${metricExpression} AS float) AS metricValue
    INTO #ProductionHeatmapBase
    FROM DATAWAREHOUSE..TB_INDICADORES_BE AS A
    INNER JOIN DATALAKE..DL_BRADESCO_EXPRESSO AS store
      ON store.CHAVE_LOJA = A.CHAVE_LOJA
    INNER JOIN MESU..CONS_DISTRIBUICAO_ENTIDADES AS esc
      ON TRY_CONVERT(bigint, esc.COD_AG) = TRY_CONVERT(bigint, store.COD_AG_LOJA)
    LEFT JOIN (
      SELECT
        ANO_MES,
        CHAVE_LOJA,
        SUM(REALIZADO) AS REALIZADO
      FROM PADE..REALIZADO_CREDITO_CONCEDIDO
      WHERE INDICADOR = 'CONSORCIO'
      GROUP BY ANO_MES, CHAVE_LOJA
    ) AS E
      ON TRY_CONVERT(int, E.ANO_MES) = TRY_CONVERT(int, A.PERIODO)
      AND E.CHAVE_LOJA = A.CHAVE_LOJA
    WHERE TRY_CONVERT(int, A.PERIODO) = @period
      ${accessSql};

    SELECT
      municipalityCode,
      MAX(municipalityName) AS municipalityName,
      MAX(uf) AS uf,
      SUM(metricValue) AS value,
      COUNT(DISTINCT CASE WHEN metricValue <> 0 THEN CHAVE_LOJA END) AS producingStores
    FROM #ProductionHeatmapBase
    WHERE LEN(municipalityCode) = 7
      AND municipalityCode NOT LIKE '%[^0-9]%'
    GROUP BY municipalityCode
    ORDER BY municipalityCode;

    SELECT
      ISNULL(SUM(CASE
        WHEN LEN(municipalityCode) = 7 AND municipalityCode NOT LIKE '%[^0-9]%'
          THEN metricValue ELSE 0 END), 0) AS value,
      COUNT(DISTINCT CASE
        WHEN LEN(municipalityCode) = 7
          AND municipalityCode NOT LIKE '%[^0-9]%'
          AND metricValue <> 0
          THEN CHAVE_LOJA END) AS producingStores,
      COUNT(DISTINCT CASE
        WHEN LEN(municipalityCode) = 7 AND municipalityCode NOT LIKE '%[^0-9]%'
          THEN municipalityCode END) AS municipalitiesWithData,
      COUNT(DISTINCT CASE
        WHEN municipalityCode IS NULL
          OR LEN(municipalityCode) <> 7
          OR municipalityCode LIKE '%[^0-9]%'
          THEN CHAVE_LOJA END) AS excludedStoresWithoutMunicipality
    FROM #ProductionHeatmapBase;
  `);

  return {
    rows: result.recordsets?.[0] ?? [],
    summary: result.recordsets?.[1]?.[0] ?? null,
  };
}

export async function fetchStoreProductionHistory(chaveLoja) {
  const request = pool.request();
  request.input('chaveLoja', String(chaveLoja ?? '').trim());
  const businessQuantitySql = storeBusinessQuantitySql('A', 'E');
  const creditQuantitySql = storeCreditQuantitySql('A');

  const result = await request.query(`
    SELECT
      historico.periodo,
      historico.qtdTrxContabil,
      historico.qtdTrxNegocio,
      historico.qtdContas,
      historico.qtdConsig,
      historico.vlrConsig,
      historico.qtdLime,
      historico.vlrLime,
      historico.qtdCreditoParcelado,
      historico.vlrCreditoParcelado,
      historico.qtdCartao,
      historico.vlrFatCielo,
      historico.qtdFgts,
      historico.qtdVida,
      historico.qtdMicro,
      historico.qtdResidencial,
      historico.qtdDental,
      historico.qtdSuper,
      historico.qtdSegDebito,
      historico.qtdConsorcio,
      historico.qtdExpSorte,
      historico.qtdCred,
      historico.vlrCred,
      historico.segTotal
    FROM (
      SELECT TOP (13)
        TRY_CONVERT(int, A.PERIODO) AS periodo,
        ISNULL(A.QTD_TRX_CONTABIL_DTLHES, 0) AS qtdTrxContabil,

        ${businessQuantitySql} AS qtdTrxNegocio,

        ISNULL(A.QTD_CONTAS_TABLET_POS, 0)
          + ISNULL(A.QTD_CONTA_SALARIO, 0) AS qtdContas,

        ISNULL(A.QTD_CONSIG_AVERBADO, 0)
          + ISNULL(A.QTD_CONSIG_AVERBADO_PLATAF, 0) AS qtdConsig,

        ISNULL(A.VLR_CONSIG_CONTRATO_AVERBADO, 0)
          + ISNULL(A.VLR_CONSIG_CONTRATO_AVERBADO_PLATAF, 0) AS vlrConsig,

        ISNULL(A.QTD_LIME_DTLHES, 0)
          + ISNULL(A.QTD_LIME_DTLHES_PLATAFORMA, 0) AS qtdLime,

        ISNULL(A.VLR_LIME_DTLHES_EMPRESTIMO, 0)
          + ISNULL(A.VLR_LIME_DTLHES_EMPRESTIMO_PLATAFORMA, 0) AS vlrLime,

        ISNULL(A.QTD_CREDITO_PARCEL_DTLHES, 0) AS qtdCreditoParcelado,

        ISNULL(A.VLR_CREDITO_PARCEL_DTLHES_EMPRESTIMO, 0) AS vlrCreditoParcelado,

        ISNULL(A.QTD_CARTAO_CONTRATADO, 0)
          + ISNULL(A.QTD_CARTAO_CONTRATADO_PLATAFORMA, 0)
          + ISNULL(A.QTD_CARTAO_AVULSO_PLATAFORMA, 0) AS qtdCartao,

        ISNULL(A.VLR_FAT_CIELO, 0) AS vlrFatCielo,

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

        CASE
          WHEN TRY_CONVERT(int, A.PERIODO) > 202606
            AND ISNULL(E.REALIZADO, 0) > 0 THEN 1
          ELSE 0
        END AS qtdConsorcio,

        CASE
          WHEN TRY_CONVERT(int, A.PERIODO) <= 202606
            THEN ISNULL(A.VLR_EXP_SORTE, 0) / 50.0
          ELSE FLOOR(ISNULL(A.VLR_EXP_SORTE, 0) / 50.0)
        END AS qtdExpSorte,

        ${creditQuantitySql} AS qtdCred,

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
      LEFT JOIN (
        SELECT
          ANO_MES,
          CHAVE_LOJA,
          SUM(REALIZADO) AS REALIZADO
        FROM PADE..REALIZADO_CREDITO_CONCEDIDO
        WHERE INDICADOR = 'CONSORCIO'
        GROUP BY ANO_MES, CHAVE_LOJA
      ) AS E
        ON TRY_CONVERT(int, E.ANO_MES) = TRY_CONVERT(int, A.PERIODO)
        AND E.CHAVE_LOJA = A.CHAVE_LOJA
      WHERE A.CHAVE_LOJA = @chaveLoja
        AND TRY_CONVERT(int, A.PERIODO) IS NOT NULL
        AND TRY_CONVERT(int, A.PERIODO) <= YEAR(GETDATE()) * 100 + MONTH(GETDATE())
      ORDER BY TRY_CONVERT(int, A.PERIODO) DESC
    ) AS historico
    ORDER BY historico.periodo ASC
  `);

  return result.recordset;
}

/**
 * Produção diária de transações de negócio dos três períodos mais recentes.
 * O número do dia útil vem do calendário corporativo MESU..TB_DIA_UTIL.
 */
export async function fetchStoreBusinessDailyHistory(chaveLoja) {
  const request = pool.request();
  request.input('chaveLoja', String(chaveLoja ?? '').trim());

  const result = await request.query(`
    WITH producaoDiaria AS (
      SELECT
        TRY_CONVERT(int, A.PERIODO) AS periodo,
        CASE
          WHEN ISNULL(B.QT_DIAS_UTEIS_MES, 0) = 0 THEN 1
          ELSE B.QT_DIAS_UTEIS_MES
        END AS diaUtil,
        SUM(
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
          END
        ) AS qtdNeg
      FROM DATAWAREHOUSE..TB_INDICADORES_BE_DIA AS A
      LEFT JOIN MESU..TB_DIA_UTIL AS B
        ON CONVERT(VARCHAR(8), A.ANO_MES, 112) = CONVERT(VARCHAR(8), B.DT_REFERENCIA, 112)
      WHERE A.CHAVE_LOJA = @chaveLoja
        AND TRY_CONVERT(int, A.PERIODO) IS NOT NULL
        AND TRY_CONVERT(int, A.PERIODO) <= YEAR(GETDATE()) * 100 + MONTH(GETDATE())
      GROUP BY
        TRY_CONVERT(int, A.PERIODO),
        CASE
          WHEN ISNULL(B.QT_DIAS_UTEIS_MES, 0) = 0 THEN 1
          ELSE B.QT_DIAS_UTEIS_MES
        END
    ), periodosRecentes AS (
      SELECT
        periodo,
        diaUtil,
        qtdNeg,
        DENSE_RANK() OVER (ORDER BY periodo DESC) AS ordemPeriodo
      FROM producaoDiaria
    )
    SELECT
      periodo,
      diaUtil,
      qtdNeg
    FROM periodosRecentes
    WHERE ordemPeriodo <= 3
    ORDER BY periodo ASC, diaUtil ASC
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

  const enrichedQuery = `
    WITH seatPoints AS (
      ${query}
    )
    SELECT
      seatPoints.*,
      COALESCE(supervisor.NOME_FUNC, coordinator.NOME_FUNC, areaManager.NOME_FUNC) AS pessoaNome,
      COALESCE(supervisor.GUERRA_FUNC, coordinator.GUERRA_FUNC, areaManager.GUERRA_FUNC) AS nomeGuerra,
      COALESCE(supervisor.EMAIL_FUNC, coordinator.EMAIL_FUNC, areaManager.EMAIL_FUNC) AS email
    FROM seatPoints
    LEFT JOIN TESTE..TB_COORD_SUP AS supervisor
      ON seatPoints.commercialLevel = 'supervisor'
      AND supervisor.CHAVE_SUPERVISAO = seatPoints.entidadeChave
    LEFT JOIN TESTE..TB_COORD_COORDENADOR AS coordinator
      ON seatPoints.commercialLevel = 'coordenador'
      AND coordinator.CHAVE_COORDENACAO = seatPoints.entidadeChave
    LEFT JOIN TESTE..TB_COORD_GA AS areaManager
      ON seatPoints.commercialLevel = 'gerente_area'
      AND areaManager.CHAVE_GERENCIA_AREA = seatPoints.entidadeChave
  `;

  const result = await request.query(enrichedQuery);
  return result.recordset;
}
