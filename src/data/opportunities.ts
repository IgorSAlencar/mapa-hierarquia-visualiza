export type OpportunityKey =
  | 'cielo'
  | 'credito'
  | 'negocio'
  | 'ativo_pade'
  | 'proposta_valor';

export interface OpportunitySnapshot {
  oportunidadeCielo: boolean;
  oportunidadeCredito: boolean;
  oportunidadeNegocio: boolean;
  oportunidadeAtivoPade: boolean;
  oportunidadePropostaValor: boolean;
}

export const OPPORTUNITY_DEFINITIONS: ReadonlyArray<{
  key: OpportunityKey;
  label: string;
  field: keyof OpportunitySnapshot;
}> = [
  { key: 'cielo', label: 'Cielo', field: 'oportunidadeCielo' },
  { key: 'credito', label: 'Crédito', field: 'oportunidadeCredito' },
  { key: 'negocio', label: 'Negócio', field: 'oportunidadeNegocio' },
  { key: 'ativo_pade', label: 'Ativo PADE', field: 'oportunidadeAtivoPade' },
  { key: 'proposta_valor', label: 'Proposta de Valor', field: 'oportunidadePropostaValor' },
];

export function missingOpportunityLabels(snapshot: OpportunitySnapshot): string[] {
  return OPPORTUNITY_DEFINITIONS
    .filter((item) => snapshot[item.field] === false)
    .map((item) => item.label);
}

export function opportunityFocus(snapshot: OpportunitySnapshot): { labels: string[]; text: string } {
  const missing = missingOpportunityLabels(snapshot);
  return missing.length > 0
    ? { labels: missing, text: missing.join(', ') }
    : { labels: ['Relacionamento'], text: 'Relacionamento' };
}

