import assert from 'node:assert/strict';
import test from 'node:test';
import {
  missingOpportunityLabels,
  opportunityFocus,
  opportunitySnapshotFromStoreFlags,
  type OpportunitySnapshot,
} from './opportunities.ts';

const allActive: OpportunitySnapshot = {
  oportunidadeCielo: true,
  oportunidadeCredito: true,
  oportunidadeNegocio: true,
  oportunidadeAtivoPade: true,
  oportunidadePropostaValor: true,
};

test('produto foco lista todos os produtos marcados como Não na ordem oficial', () => {
  const snapshot = {
    ...allActive,
    oportunidadeCielo: false,
    oportunidadeNegocio: false,
    oportunidadePropostaValor: false,
  };
  assert.deepEqual(missingOpportunityLabels(snapshot), ['Cielo', 'Negócio', 'Proposta de Valor']);
  assert.deepEqual(opportunityFocus(snapshot), {
    labels: ['Cielo', 'Negócio', 'Proposta de Valor'],
    text: 'Cielo, Negócio, Proposta de Valor',
  });
});

test('produto foco usa Relacionamento quando todos os produtos estão ativos', () => {
  assert.deepEqual(opportunityFocus(allActive), {
    labels: ['Relacionamento'],
    text: 'Relacionamento',
  });
});

test('desc_segto não participa do cálculo do produto foco', () => {
  const storeSnapshot = { ...allActive, oportunidadeCredito: false, desc_segto: 'Varejo' };
  assert.equal(opportunityFocus(storeSnapshot).text, 'Crédito');
});

test('indicadores reais da loja são convertidos para os pilares do roteiro', () => {
  assert.deepEqual(
    opportunitySnapshotFromStoreFlags({
      cieloM0: true,
      creditoM0: false,
      negocioM0: true,
      ativoPadeM0: false,
      propostaValor: true,
    }),
    {
      oportunidadeCielo: true,
      oportunidadeCredito: false,
      oportunidadeNegocio: true,
      oportunidadeAtivoPade: false,
      oportunidadePropostaValor: true,
    }
  );
});

test('indicadores ausentes são tratados como oportunidade a desenvolver', () => {
  const snapshot = opportunitySnapshotFromStoreFlags({});
  assert.deepEqual(missingOpportunityLabels(snapshot), [
    'Cielo',
    'Crédito',
    'Negócio',
    'Ativo PADE',
    'Proposta de Valor',
  ]);
});
