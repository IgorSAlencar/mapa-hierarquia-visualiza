import assert from 'node:assert/strict';
import test from 'node:test';
import { hasProductEvolved } from './visitEvolution.js';

test('Crédito evolui por quantidade ou valor', () => {
  const baseline = { creditQuantity: 1, creditValue: 100 };
  assert.equal(hasProductEvolved('CREDITO', baseline, { creditQuantity: 2, creditValue: 100 }), true);
  assert.equal(hasProductEvolved('CREDITO', baseline, { creditQuantity: 1, creditValue: 101 }), true);
  assert.equal(hasProductEvolved('CREDITO', baseline, { creditQuantity: 1, creditValue: 100 }), false);
});

test('Cielo evolui por ativação, quantidade ou faturamento representados nas métricas', () => {
  const baseline = { cieloQuantity: 0, cieloValue: 0 };
  assert.equal(hasProductEvolved('CIELO', baseline, { cieloQuantity: 1, cieloValue: 0 }), true);
  assert.equal(hasProductEvolved('CIELO', baseline, { cieloQuantity: 0, cieloValue: 50 }), true);
});

test('Fazer Negócio evolui somente com crescimento da quantidade', () => {
  assert.equal(
    hasProductEvolved('FAZER_NEGOCIO', { businessQuantity: 3 }, { businessQuantity: 4 }),
    true
  );
  assert.equal(
    hasProductEvolved('FAZER_NEGOCIO', { businessQuantity: 3 }, { businessQuantity: 3 }),
    false
  );
});

test('Proposta de Valor evolui ao sair da relação de lojas sem proposta', () => {
  assert.equal(hasProductEvolved('PROPOSTA_VALOR', { valueProposal: 0 }, { valueProposal: 1 }), true);
  assert.equal(hasProductEvolved('PROPOSTA_VALOR', { valueProposal: 1 }, { valueProposal: 1 }), false);
});

test('Relacionamento permanece manual e não gera evolução automática', () => {
  assert.equal(hasProductEvolved('RELACIONAMENTO', {}, { arbitrary: 99 }), false);
});
