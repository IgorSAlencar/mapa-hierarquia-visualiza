import {
  fetchAgencyCoordinates,
  fetchCommercialSeatCoordinates,
  fetchStoreCoordinates,
} from '../repositories/mapDataRepository.js';

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

function normalizeCodAg(v) {
  const s = normalizeText(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s;
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
      const codAg = normalizeCodAg(row.COD_AG);
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

export async function getStoreMapPoints({ bbox = null, limit = null, codAg = null, hierarchy = null } = {}) {
  const targetCodAg = normalizeCodAg(codAg);
  const rows = await fetchStoreCoordinates({
    bbox: targetCodAg ? null : bbox,
    limit,
    codAg: targetCodAg,
    hierarchy,
  });

  const scopedRows = targetCodAg
    ? rows.filter((row) => normalizeCodAg(row.COD_AG) === targetCodAg)
    : rows;

  return scopedRows
    .map((row, index) => {
      const lngLat = validCoordinate(row);
      if (!lngLat) return null;
      const rowCodAg = normalizeCodAg(row.COD_AG);
      return {
        id: `sql-loja-${rowCodAg ?? 'x'}-${index}`,
        nome: 'Loja',
        kind: 'loja',
        lngLat,
        codAg: rowCodAg,
      };
    })
    .filter(Boolean);
}

export async function getCommercialSeatMapPoints({ hierarchy = null } = {}) {
  const rows = await fetchCommercialSeatCoordinates({ hierarchy });

  return rows
    .map((row, index) => {
      const lngLat = validCoordinate(row);
      if (!lngLat) return null;
      const codAg = normalizeCodAg(row.COD_AG);
      const nome = normalizeText(row.entidadeNome) ?? 'Estrutura comercial';
      const commercialLevel = normalizeText(row.commercialLevel) ?? 'supervisor';
      const entidadeChave = Number(row.entidadeChave);
      const chaveGerenciaArea = Number(row.CHAVE_GERENCIA_AREA);
      const chaveCoordenacao = Number(row.CHAVE_COORDENACAO);
      const safeKey = Number.isFinite(entidadeChave) ? String(Math.trunc(entidadeChave)) : String(index);
      return {
        id: `sql-sede-${commercialLevel}-${safeKey}`,
        nome,
        kind: 'supervisor',
        commercialLevel,
        lngLat,
        codAg,
        chaveGerenciaArea: Number.isFinite(chaveGerenciaArea) ? Math.trunc(chaveGerenciaArea) : null,
        chaveCoordenacao: Number.isFinite(chaveCoordenacao) ? Math.trunc(chaveCoordenacao) : null,
        chaveEntidade: Number.isFinite(entidadeChave) ? Math.trunc(entidadeChave) : null,
      };
    })
    .filter(Boolean);
}
