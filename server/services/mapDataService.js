import {
  fetchAgencyCoordinates,
  fetchAgencyDetail,
  fetchCommercialSeatDetail,
  fetchStoreBusinessDailyHistory,
  fetchCommercialSeatCoordinates,
  fetchStoreCoordinates,
  fetchStoreProductionHistory,
  hasStoreAccess,
} from '../repositories/mapDataRepository.js';
import { normalizeStoreProductionRows } from './storeProductionNormalizer.js';

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

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export async function getAgencyMapPoints({ bbox = null, limit = null, hierarchy = null, user = null } = {}) {
  const rows = await fetchAgencyCoordinates({ bbox, limit, hierarchy, user });

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

export async function getAgencyDetail(codAg, user) {
  const row = await fetchAgencyDetail({ codAg, user });
  if (!row) return null;

  const hierarchy = [
    {
      level: 'Gerente Comercial',
      key: Number(row.CHAVE_SUPERVISAO),
      description: normalizeText(row.DESC_SUPERVISAO),
      personName: normalizeText(row.SUPERVISOR_NOME_FUNC),
      warName: normalizeText(row.SUPERVISOR_GUERRA_FUNC),
    },
    {
      level: 'Gerente Comercial III',
      key: Number(row.CHAVE_COORDENACAO),
      description: normalizeText(row.DESC_COORDENACAO),
      personName: normalizeText(row.COORDENADOR_NOME_FUNC),
      warName: normalizeText(row.COORDENADOR_GUERRA_FUNC),
    },
    {
      level: 'Gerente de Gestão',
      key: Number(row.CHAVE_GERENCIA_AREA),
      description: normalizeText(row.DESC_GERENCIA_AREA),
      personName: normalizeText(row.GERENTE_AREA_NOME_FUNC),
      warName: normalizeText(row.GERENTE_AREA_GUERRA_FUNC),
    },
  ]
    .filter((item) => item.description || item.personName || item.warName)
    .map((item) => ({
      ...item,
      key: Number.isFinite(item.key) && item.key > 0 ? Math.trunc(item.key) : null,
    }));

  return {
    codAg: normalizeCodAg(row.COD_AG),
    agencyName: normalizeText(row.NOME_AG),
    hierarchy,
  };
}

export async function getStoreMapPoints({ bbox = null, limit = null, codAg = null, hierarchy = null, sortByCenter = false, search = null, user = null } = {}) {
  const targetCodAg = normalizeCodAg(codAg);
  const rows = await fetchStoreCoordinates({
    bbox: targetCodAg ? null : bbox,
    limit,
    codAg: targetCodAg,
    hierarchy,
    sortByCenter,
    search,
    user,
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
        nomeAg: normalizeText(row.NOME_AG),
        descSupervisao: normalizeText(row.DESC_SUPERVISAO),
        gerenteComercial: normalizeText(row.NOME_GERENTE_COMERCIAL),
        orgaoPagador: normalizeBinaryFlag(row.ORGAO_PAGADOR),
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
        cieloFaturamentoM0: normalizeNumber(row.VLR_FAT_CIELO_M0),
        cieloHistorico: normalizeBinaryFlag(row.CIELO_HISTORICO),
        creditoM0: normalizeBinaryFlag(row.CREDITO_M0),
        negocioM0: normalizeBinaryFlag(row.NEGOCIO_M0),
        ativoPadeM0: normalizeBinaryFlag(row.ATIVO_PADE_M0),
        propostaValor: normalizeBinaryFlag(row.PROPOSTA_VALOR),
        checklist: normalizeText(row.STATUS_CHECKLIST)?.toUpperCase() ?? null,
      };
    })
    .filter(Boolean);
}

export async function getStoreProductionHistory(chaveLoja, user) {
  const allowed = await hasStoreAccess(chaveLoja, user);
  if (!allowed) return null;
  const [rows, dailyRows] = await Promise.all([
    fetchStoreProductionHistory(chaveLoja),
    fetchStoreBusinessDailyHistory(chaveLoja),
  ]);

  const history = normalizeStoreProductionRows(rows);

  const businessDaily = dailyRows
    .map((row) => ({
      periodo: Number(row.periodo),
      diaUtil: Number(row.diaUtil),
      qtdNeg: Number(row.qtdNeg),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.periodo) &&
        Number.isInteger(row.diaUtil) &&
        row.diaUtil > 0 &&
        Number.isFinite(row.qtdNeg)
    );

  return { history, businessDaily };
}

export async function getCommercialSeatMapPoints({ hierarchy = null, user = null } = {}) {
  const rows = await fetchCommercialSeatCoordinates({ hierarchy, user });

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
        personName: normalizeText(row.pessoaNome),
        warName: normalizeText(row.nomeGuerra),
        email: normalizeText(row.email),
        chaveGerenciaArea: Number.isFinite(chaveGerenciaArea) ? Math.trunc(chaveGerenciaArea) : null,
        chaveCoordenacao: Number.isFinite(chaveCoordenacao) ? Math.trunc(chaveCoordenacao) : null,
        chaveEntidade: Number.isFinite(entidadeChave) ? Math.trunc(entidadeChave) : null,
      };
    })
    .filter(Boolean);
}

export async function getCommercialSeatDetail(commercialLevel, chaveEntidade, user) {
  const row = await fetchCommercialSeatDetail({ commercialLevel, chaveEntidade, user });
  if (!row) return null;

  const numberOrNull = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  };

  return {
    commercialLevel: normalizeText(row.commercialLevel),
    chaveEntidade: numberOrNull(row.chaveEntidade),
    entidadeNome: normalizeText(row.entidadeNome),
    personName: normalizeText(row.pessoaNome),
    warName: normalizeText(row.nomeGuerra),
    email: normalizeText(row.email),
    superiorLevel: normalizeText(row.superiorNivel),
    superiorKey: numberOrNull(row.superiorChave),
    superiorDescription: normalizeText(row.superiorDescricao),
    superiorPersonName: normalizeText(row.superiorPessoaNome),
    superiorWarName: normalizeText(row.superiorNomeGuerra),
    upperSuperiorLevel: normalizeText(row.superiorAcimaNivel),
    upperSuperiorKey: numberOrNull(row.superiorAcimaChave),
    upperSuperiorDescription: normalizeText(row.superiorAcimaDescricao),
    upperSuperiorPersonName: normalizeText(row.superiorAcimaPessoaNome),
    upperSuperiorWarName: normalizeText(row.superiorAcimaNomeGuerra),
    agencyCount: Math.max(0, numberOrNull(row.qtdAgencias) ?? 0),
    storeCount: Math.max(0, numberOrNull(row.qtdLojas) ?? 0),
  };
}
