import {
  fetchAllCoordenacoes,
  fetchAllSupervisoes,
  fetchCoordenacoesByGerenciaArea,
  fetchAgencias,
  fetchGerenciasArea,
  fetchSupervisoesByCoordenacao,
} from '../repositories/commercialStructureRepository.js';

function normalizeListRow(row, keyField, labelField) {
  const chave = Number(row[keyField]);
  const descricao = String(row[labelField] ?? '').trim();
  if (!Number.isFinite(chave) || !descricao) return null;
  return { chave: Math.trunc(chave), descricao };
}

export async function getGerenciasArea(user) {
  const rows = await fetchGerenciasArea(user);
  return rows
    .map((row) => normalizeListRow(row, 'CHAVE_GERENCIA_AREA', 'DESC_GERENCIA_AREA'))
    .filter(Boolean);
}

export async function getCoordenacoesByGerenciaArea(chaveGerenciaArea, user) {
  const rows = await fetchCoordenacoesByGerenciaArea(chaveGerenciaArea, user);
  return rows
    .map((row) => normalizeListRow(row, 'CHAVE_COORDENACAO', 'DESC_COORDENACAO'))
    .filter(Boolean);
}

export async function getSupervisoesByCoordenacao(chaveCoordenacao, user) {
  const rows = await fetchSupervisoesByCoordenacao(chaveCoordenacao, user);
  return rows
    .map((row) => normalizeListRow(row, 'CHAVE_SUPERVISAO', 'DESC_SUPERVISAO'))
    .filter(Boolean);
}

function normalizeCoordenacaoRow(row) {
  const base = normalizeListRow(row, 'CHAVE_COORDENACAO', 'DESC_COORDENACAO');
  if (!base) return null;
  const chaveGerenciaArea = Number(row.CHAVE_GERENCIA_AREA);
  return {
    ...base,
    chaveGerenciaArea: Number.isFinite(chaveGerenciaArea) ? Math.trunc(chaveGerenciaArea) : null,
  };
}

function normalizeSupervisaoRow(row) {
  const base = normalizeListRow(row, 'CHAVE_SUPERVISAO', 'DESC_SUPERVISAO');
  if (!base) return null;
  const chaveCoordenacao = Number(row.CHAVE_COORDENACAO);
  const chaveGerenciaArea = Number(row.CHAVE_GERENCIA_AREA);
  return {
    ...base,
    chaveCoordenacao: Number.isFinite(chaveCoordenacao) ? Math.trunc(chaveCoordenacao) : null,
    chaveGerenciaArea: Number.isFinite(chaveGerenciaArea) ? Math.trunc(chaveGerenciaArea) : null,
  };
}

export async function getAllCoordenacoes(user) {
  const rows = await fetchAllCoordenacoes(user);
  return rows.map((row) => normalizeCoordenacaoRow(row)).filter(Boolean);
}

export async function getAllSupervisoes(user) {
  const rows = await fetchAllSupervisoes(user);
  return rows.map((row) => normalizeSupervisaoRow(row)).filter(Boolean);
}

export async function getAgencias(user) {
  const rows = await fetchAgencias(user);
  return rows
    .map((row) => {
      const codAg = String(row.COD_AG ?? '').trim();
      const nome = String(row.NOME_AG ?? '').trim();
      if (!codAg || !nome) return null;
      return { codAg, nome };
    })
    .filter(Boolean);
}
