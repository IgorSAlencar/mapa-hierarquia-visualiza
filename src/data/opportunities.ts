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

export interface StoreOpportunityFlags {
  cieloM0?: boolean | null;
  creditoM0?: boolean | null;
  negocioM0?: boolean | null;
  ativoPadeM0?: boolean | null;
  propostaValor?: boolean | null;
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

export function opportunitySnapshotFromStoreFlags(
  flags: StoreOpportunityFlags
): OpportunitySnapshot {
  return {
    oportunidadeCielo: flags.cieloM0 === true,
    oportunidadeCredito: flags.creditoM0 === true,
    oportunidadeNegocio: flags.negocioM0 === true,
    oportunidadeAtivoPade: flags.ativoPadeM0 === true,
    oportunidadePropostaValor: flags.propostaValor === true,
  };
}

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
