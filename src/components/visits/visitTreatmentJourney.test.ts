import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areVisitProductsComplete,
  resolveTreatmentJourneyStep,
  treatmentCompletionIssues,
} from './visitTreatmentJourney.ts';

const pendingProduct = { active: true, treatmentStatus: 'PENDENTE' };
const treatedProduct = { active: true, treatmentStatus: 'TRATADO' };

test('visita sem check-in sempre começa em Início', () => {
  assert.equal(resolveTreatmentJourneyStep({
    status: 'PENDENTE',
    checkin: null,
    products: [pendingProduct],
  }, 2), 0);
});

test('visita iniciada abre Produtos e só permite Finalizar após todos os produtos', () => {
  assert.equal(resolveTreatmentJourneyStep({
    status: 'EM_ANDAMENTO',
    checkin: {},
    products: [pendingProduct],
  }, 2), 1);
  assert.equal(resolveTreatmentJourneyStep({
    status: 'EM_ANDAMENTO',
    checkin: {},
    products: [treatedProduct],
  }, 2), 2);
});

test('produtos inativos não bloqueiam a tratativa', () => {
  assert.equal(areVisitProductsComplete([
    treatedProduct,
    { active: false, treatmentStatus: 'PENDENTE' },
  ]), true);
});

test('conclusão exige check-in, produtos e escolha explícita do resultado', () => {
  assert.deepEqual(treatmentCompletionIssues({
    checkin: null,
    products: [pendingProduct],
    resultConfirmed: false,
    needsReturn: false,
    returnDate: '',
  }), [
    'CHECKIN_REQUIRED',
    'PRODUCTS_REQUIRED',
    'COMMERCIAL_RESULT_REQUIRED',
  ]);
});

test('data de retorno só é obrigatória quando há acompanhamento', () => {
  assert.deepEqual(treatmentCompletionIssues({
    checkin: {},
    products: [treatedProduct],
    resultConfirmed: true,
    needsReturn: true,
    returnDate: '',
  }), ['RETURN_DATE_REQUIRED']);
  assert.deepEqual(treatmentCompletionIssues({
    checkin: {},
    products: [treatedProduct],
    resultConfirmed: true,
    needsReturn: true,
    returnDate: '2026-08-01',
  }), []);
});
