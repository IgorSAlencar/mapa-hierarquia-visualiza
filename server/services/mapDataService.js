import { fetchAgencyCoordinates, fetchStoreCoordinates } from '../repositories/mapDataRepository.js';

function validCoordinate(row) {
  const lon = Number(row.lon);
  const lat = Number(row.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180) return null;
  if (lat < -90 || lat > 90) return null;
  return [lon, lat];
}

function normalizeText(v) {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

function formatAgencyAddress(row) {
  const endereco = normalizeText(row.ENDERECO);
  const bairro = normalizeText(row.BAIRRO);
  const municipio = normalizeText(row.MUNICIPIO);
  const uf = normalizeText(row.UF);
  const cep = normalizeText(row.CEP);

  const line1 = [endereco, bairro].filter(Boolean).join(' - ');
  const cityUf = [municipio, uf].filter(Boolean).join('/');
  const line2 = [cityUf, cep ? `CEP ${cep}` : null].filter(Boolean).join(' - ');

  return [line1, line2].filter(Boolean).join(', ');
}

export async function getAgencyMapPoints({ bbox = null, limit = null, hierarchy = null } = {}) {
  const rows = await fetchAgencyCoordinates({ bbox, limit, hierarchy });

  return rows
    .map((row, index) => {
      const lngLat = validCoordinate(row);
      if (!lngLat) return null;
      const codAg = normalizeText(row.COD_AG);
      const nome = normalizeText(row.NOME) ?? 'Agência Bradesco';
      return {
        id: `sql-agencia-${codAg ?? index}`,
        nome,
        kind: 'agencia',
        lngLat,
        codAg,
        enderecoFormatado: formatAgencyAddress(row),
      };
    })
    .filter(Boolean);
}

export async function getStoreMapPoints({ bbox = null, limit = null } = {}) {
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
