import {
  fetchAgencyCoordinates,
  fetchCommercialSeatCoordinates,
  fetchStoreCoordinates,
  fetchStoreProductionHistory,
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

function normalizeBinaryFlag(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n === 1;
}

function normalizeDate(v) {
  if (v == null || String(v).trim() === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? String(v).trim() : date.toISOString();
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

export async function getStoreMapPoints({ bbox = null, limit = null, codAg = null, hierarchy = null, sortByCenter = false } = {}) {
  const targetCodAg = normalizeCodAg(codAg);
  const rows = await fetchStoreCoordinates({
    bbox: targetCodAg ? null : bbox,
    limit,
    codAg: targetCodAg,
    hierarchy,
    sortByCenter,
  });

  const scopedRows = targetCodAg
    ? rows.filter((row) => normalizeCodAg(row.COD_AG) === targetCodAg)
    : rows;

  return scopedRows
    .map((row, index) => {
      const lngLat = validCoordinate(row);
      if (!lngLat) return null;
      const rowCodAg = normalizeCodAg(row.COD_AG);
      const chaveLoja = normalizeText(row.CHAVE_LOJA);
      return {
        id: `sql-loja-${chaveLoja ?? `${rowCodAg ?? 'x'}-${index}`}`,
        nome: normalizeText(row.NOME_LOJA) ?? 'Loja',
        kind: 'loja',
        lngLat,
        codAg: rowCodAg,
        chaveLoja,
        municipio: normalizeText(row.MUNICIPIO),
        uf: normalizeText(row.UF)?.toUpperCase() ?? null,
        statusTablet: normalizeText(row.STATUS_TABLET),
        dataBloqueio: normalizeDate(row.DT_BLOQUEIO),
        motivoBloqueio: normalizeText(row.MOTIVO_BLOQUEIO),
        tipoPosto: normalizeText(row.TIPO_POSTO),
        segmento: normalizeText(row.DESC_SEGTO),
        dataUltimaTransacao: normalizeDate(row.DT_ULT_TRX),
        cieloM0: normalizeBinaryFlag(row.CIELO_M0),
        checklist: normalizeBinaryFlag(row.CHECKLIST),
      };
    })
    .filter(Boolean);
}

const STORE_PRODUCTION_NUMBER_FIELDS = [
  'qtdTrxContabil',
  'qtdContas',
  'qtdConsig',
  'qtdLime',
  'qtdCreditoParcelado',
  'qtdCartao',
  'qtdFgts',
  'qtdVida',
  'qtdMicro',
  'qtdResidencial',
  'qtdDental',
  'qtdSuper',
  'qtdSegDebito',
  'qtdCred',
  'vlrCred',
  'segTotal',
];

export async function getStoreProductionHistory(chaveLoja) {
  const rows = await fetchStoreProductionHistory(chaveLoja);

  return rows.map((row) => {
    const normalized = { periodo: Number(row.periodo) };
    for (const field of STORE_PRODUCTION_NUMBER_FIELDS) {
      const value = Number(row[field]);
      normalized[field] = Number.isFinite(value) ? value : 0;
    }
    return normalized;
  });
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
