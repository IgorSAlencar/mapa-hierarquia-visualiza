import {
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
