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

export async function fetchAgencyCoordinates({ bbox = null, limit = null } = {}) {
  const request = pool.request();
  request.input('bank', 'BANCO BRADESCO S.A.');
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  if (hasLimit) request.input('limit', Math.round(limit));
  const bboxSql = applyBboxFilter(request, bbox, 'CAST(lon AS float)', 'CAST(lat AS float)');
  const topSql = hasLimit ? 'TOP (@limit)' : '';

  const query = `
    SELECT ${topSql}
      CAST(lon AS float) AS lon,
      CAST(lat AS float) AS lat,
      BANCO AS banco
    FROM TESTE..COORDENADAS_AGENCIAS
    WHERE BANCO = @bank
      AND lon IS NOT NULL
      AND lat IS NOT NULL
      ${bboxSql}
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
