import { pool } from '../db/sqlServer.js';

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

export async function fetchAgencyCoordinates({ bbox = null, limit = null, hierarchy = null } = {}) {
  const request = pool.request();
  request.input('bank', 'BANCO BRADESCO S.A.');
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  if (hasLimit) request.input('limit', Math.round(limit));
  const bboxSql = applyBboxFilter(request, bbox, 'CAST(a.lon AS float)', 'CAST(a.lat AS float)');
  const hierarchySql = applyHierarchyFilter(request, hierarchy, 'esc');
  const topSql = hasLimit ? 'TOP (@limit)' : '';
  const hierarchyFilterSql = hierarchySql
    ? `
    AND EXISTS (
      SELECT 1
      FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS esc
      WHERE ${AGENCY_CONS_MATCH_SQL}
      ${hierarchySql}
    )
  `
    : '';

  const query = `
    SELECT ${topSql}
      a.COD_AG AS COD_AG,
      a.NOME_AGENCIA AS NOME,
      CAST(a.lon AS float) AS lon,
      CAST(a.lat AS float) AS lat,
      a.ENDERECO,
      a.BAIRRO,
      a.CEP,
      a.MUNICIPIO,
      a.UF,
      a.BANCO AS banco
    FROM TESTE..COORDENADAS_AGENCIAS AS a
    WHERE a.BANCO = @bank
      AND a.lon IS NOT NULL
      AND a.lat IS NOT NULL
      ${bboxSql}
      ${hierarchyFilterSql}
  `;

  const result = await request.query(query);

  return result.recordset;
}

export async function fetchStoreCoordinates({ bbox = null, limit = null, codAg = null, hierarchy = null } = {}) {
  const request = pool.request();
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  if (hasLimit) request.input('limit', Math.round(limit));
  const codAgNorm = normalizeCodAgParam(codAg);
  const hasCodAg = codAgNorm.length > 0;
  if (hasCodAg) request.input('codAg', codAgNorm);

  const bboxSql = hasCodAg
    ? ''
    : applyBboxFilter(
        request,
        bbox,
        'CAST(l.geolocation_lng AS float)',
        'CAST(l.geolocation_lat AS float)'
      );
  const codAgSql = hasCodAg
    ? ` AND TRY_CAST(l.COD_AG AS BIGINT) = TRY_CAST(@codAg AS BIGINT)`
    : '';
  const hierarchyForFilter =
    hasCodAg && hierarchy
      ? (() => {
          const { codAg: _omitCodAg, ...rest } = hierarchy;
          return Object.keys(rest).length > 0 ? rest : null;
        })()
      : hierarchy;
  const hierarchySql = applyHierarchyFilter(request, hierarchyForFilter, 'esc');
  const hierarchyFilterSql = hierarchySql
    ? `
      AND EXISTS (
        SELECT 1
        FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS esc
        WHERE TRY_CAST(esc.COD_AG AS NVARCHAR(50)) = LTRIM(RTRIM(CAST(l.COD_AG AS NVARCHAR(50))))
        ${hierarchySql}
      )
    `
    : '';
  const topSql = hasLimit ? 'TOP (@limit)' : '';

  const query = `
    SELECT ${topSql}
      l.COD_AG,
      CAST(l.geolocation_lng AS float) AS lon,
      CAST(l.geolocation_lat AS float) AS lat
    FROM TESTE..COORDENADAS_LOJAS AS l
    WHERE l.geolocation_lng IS NOT NULL
      AND l.geolocation_lat IS NOT NULL
      ${codAgSql}
      ${hierarchyFilterSql}
      ${bboxSql}
  `;

  const result = await request.query(query);
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

export async function fetchCommercialSeatCoordinates({ hierarchy = null } = {}) {
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
    `;
  }

  const result = await request.query(query);
  return result.recordset;
}
