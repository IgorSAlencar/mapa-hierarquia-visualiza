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

export async function fetchAgencyCoordinates({ bbox = null, limit = 8000 } = {}) {
  const request = pool.request();
  request.input('bank', 'BANCO BRADESCO S.A.');
  request.input('limit', limit);
  const bboxSql = applyBboxFilter(request, bbox, 'CAST(lon AS float)', 'CAST(lat AS float)');

  const query = `
    SELECT TOP (@limit)
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

export async function fetchStoreCoordinates({ bbox = null, limit = 12000 } = {}) {
  const request = pool.request();
  request.input('limit', limit);
  const bboxSql = applyBboxFilter(
    request,
    bbox,
    'CAST(geolocation_lng AS float)',
    'CAST(geolocation_lat AS float)'
  );

  const query = `
    SELECT TOP (@limit)
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
