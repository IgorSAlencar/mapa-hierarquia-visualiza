import type { SqlHierarchyFilter } from '@/data/commercialStructureMock';

/** GA ou Coordenação ativa (sem supervisão única) — escopo do modo "Comparar áreas". */
export function isCompareScopeHierarchy(filter: SqlHierarchyFilter | null | undefined): boolean {
  if (!filter) return false;
  const supKey = Number(filter.chaveSupervisao);
  if (Number.isFinite(supKey) && supKey > 0) return false;
  const ga = Number(filter.chaveGerenciaArea);
  const coord = Number(filter.chaveCoordenacao);
  return (Number.isFinite(ga) && ga > 0) || (Number.isFinite(coord) && coord > 0);
}
