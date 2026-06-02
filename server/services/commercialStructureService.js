import {
  fetchAllCoordenacoes,
  fetchAllSupervisoes,
  fetchCoordenacoesByGerenciaArea,
  fetchGerenciasArea,
  fetchSupervisoesByCoordenacao,
} from '../repositories/commercialStructureRepository.js';

function normalizeListRow(row, keyField, labelField) {
  const chave = Number(row[keyField]);
  const descricao = String(row[labelField] ?? '').trim();
  if (!Number.isFinite(chave) || !descricao) return null;
  return { chave: Math.trunc(chave), descricao };
}

export async function getGerenciasArea() {
  const rows = await fetchGerenciasArea();
  return rows
    .map((row) => normalizeListRow(row, 'CHAVE_GERENCIA_AREA', 'DESC_GERENCIA_AREA'))
    .filter(Boolean);
}

export async function getCoordenacoesByGerenciaArea(chaveGerenciaArea) {
  const rows = await fetchCoordenacoesByGerenciaArea(chaveGerenciaArea);
  return rows
    .map((row) => normalizeListRow(row, 'CHAVE_COORDENACAO', 'DESC_COORDENACAO'))
    .filter(Boolean);
}

export async function getSupervisoesByCoordenacao(chaveCoordenacao) {
  const rows = await fetchSupervisoesByCoordenacao(chaveCoordenacao);
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

export async function getAllCoordenacoes() {
  const rows = await fetchAllCoordenacoes();
  return rows.map((row) => normalizeCoordenacaoRow(row)).filter(Boolean);
}

export async function getAllSupervisoes() {
  const rows = await fetchAllSupervisoes();
  return rows.map((row) => normalizeSupervisaoRow(row)).filter(Boolean);
}
