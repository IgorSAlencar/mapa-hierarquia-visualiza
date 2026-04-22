import { fetchAgencyCoordinates, fetchStoreCoordinates } from '../repositories/mapDataRepository.js';

function validCoordinate(row) {
  const lon = Number(row.lon);
  const lat = Number(row.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180) return null;
  if (lat < -90 || lat > 90) return null;
  return [lon, lat];
}

export async function getAgencyMapPoints({ bbox = null, limit = 8000 } = {}) {
  const rows = await fetchAgencyCoordinates({ bbox, limit });

  return rows
    .map((row, index) => {
      const lngLat = validCoordinate(row);
      if (!lngLat) return null;
      return {
        id: `sql-agencia-${index}`,
        nome: 'Agência Bradesco',
        kind: 'agencia',
        lngLat,
      };
    })
    .filter(Boolean);
}

export async function getStoreMapPoints({ bbox = null, limit = 12000 } = {}) {
  const rows = await fetchStoreCoordinates({ bbox, limit });

  return rows
    .map((row, index) => {
      const lngLat = validCoordinate(row);
      if (!lngLat) return null;
      return {
        id: `sql-loja-${index}`,
        nome: 'Loja',
        kind: 'loja',
        lngLat,
      };
    })
    .filter(Boolean);
}
