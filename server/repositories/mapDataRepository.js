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

function applyHierarchyFilter(request, hierarchy = null, escadaAlias = 'esc') {
  if (!hierarchy) return '';
  const clauses = [];
  const mappings = [
    ['direReg', 'DIRE_REG', 'direReg'],
    ['codGerReg', 'COD_GER_REG', 'codGerReg'],
    ['codGerArea', 'COD_GER_AREA', 'codGerArea'],
    ['codCoord', 'COD_COORD', 'codCoord'],
    ['codSupervisao', 'COD_SUPERVISAO', 'codSupervisao'],
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

export async function fetchAgencyCoordinates({ bbox = null, limit = null, hierarchy = null } = {}) {
  const request = pool.request();
  request.input('bank', 'BANCO BRADESCO S.A.');
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  if (hasLimit) request.input('limit', Math.round(limit));
  const bboxSql = applyBboxFilter(request, bbox, 'CAST(a.lon AS float)', 'CAST(a.lat AS float)');
  const hierarchySql = applyHierarchyFilter(request, hierarchy);
  const topSql = hasLimit ? 'TOP (@limit)' : '';

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
    INNER JOIN dbo.TB_ESCADA_COMERCIAL AS esc
      ON esc.COD_AG = a.COD_AG
    WHERE a.BANCO = @bank
      AND a.lon IS NOT NULL
      AND a.lat IS NOT NULL
      ${bboxSql}
      ${hierarchySql}
  `;

  const result = await request.query(query);

  return result.recordset;
}

export async function fetchStoreCoordinates({ bbox = null, limit = null } = {}) {
  const request = pool.request();
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  if (hasLimit) request.input('limit', Math.round(limit));
  const bboxSql = applyBboxFilter(
    request,
    bbox,
    'CAST(geolocation_lng AS float)',
    'CAST(geolocation_lat AS float)'
  );
  const topSql = hasLimit ? 'TOP (@limit)' : '';

  const query = `
    SELECT ${topSql}
      CAST(geolocation_lng AS float) AS lon,
      CAST(geolocation_lat AS float) AS lat
    FROM TESTE..COORDENADAS_LOJAS
    WHERE geolocation_lng IS NOT NULL
      AND geolocation_lat IS NOT NULL
      ${bboxSql}
  `;

  const result = await request.query(query);
  return result.recordset;
}
