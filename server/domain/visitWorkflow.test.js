import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VISIT_STATUS,
  addCalendarDays,
  assertProductsComplete,
  assertVisitTransition,
  productCodesFromFocusLabels,
  requireIsoDate,
  requireOffsetTimestamp,
  timestampOffsetMinutes,
} from './visitWorkflow.js';

test('permite somente transições operacionais válidas', () => {
  assert.doesNotThrow(() =>
    assertVisitTransition(VISIT_STATUS.PENDING, VISIT_STATUS.IN_PROGRESS)
  );
  assert.doesNotThrow(() =>
    assertVisitTransition(VISIT_STATUS.IN_PROGRESS, VISIT_STATUS.COMPLETED)
  );
  assert.throws(
    () => assertVisitTransition(VISIT_STATUS.COMPLETED, VISIT_STATUS.PENDING),
    (error) => error.code === 'VISIT_INVALID_TRANSITION'
  );
});

test('CANCELADA é terminal e não pode ser reaberta pela máquina comum', () => {
  assert.throws(
    () => assertVisitTransition(VISIT_STATUS.CANCELLED, VISIT_STATUS.PENDING),
    (error) => error.code === 'VISIT_INVALID_TRANSITION'
  );
});

test('bloqueia conclusão quando existe produto pendente', () => {
  assert.throws(
    () => assertProductsComplete([
      { ID: 10, ATIVO: true, STATUS_TRATATIVA: 'PENDENTE', NOME_PRODUTO_SNAPSHOT: 'Crédito' },
    ]),
    (error) => error.code === 'VISIT_PRODUCTS_INCOMPLETE'
  );
  assert.doesNotThrow(() => assertProductsComplete([
    { ID: 10, ATIVO: true, STATUS_TRATATIVA: 'TRATADO', NOME_PRODUTO_SNAPSHOT: 'Crédito' },
    { ID: 11, ATIVO: true, STATUS_TRATATIVA: 'NAO_ABORDADO', NOME_PRODUTO_SNAPSHOT: 'Cielo' },
  ]));
});

test('mapeia Negócio e Fazer Negócio para o mesmo catálogo', () => {
  assert.deepEqual(
    productCodesFromFocusLabels(['Negócio', 'Fazer Negócio', 'Relacionamento']),
    ['FAZER_NEGOCIO', 'RELACIONAMENTO']
  );
});

test('valida data civil sem depender do formato regional do SQL Server', () => {
  assert.equal(requireIsoDate('2026-07-28'), '2026-07-28');
  assert.throws(() => requireIsoDate('28/07/2026'));
  assert.throws(() => requireIsoDate('2026-02-30'));
});

test('exige offset explícito nos horários e preserva -03:00', () => {
  assert.equal(
    requireOffsetTimestamp('2026-07-28T09:30:00-03:00').toISOString(),
    '2026-07-28T12:30:00.000Z'
  );
  assert.equal(timestampOffsetMinutes('2026-07-28T09:30:00-03:00'), -180);
  assert.throws(() => requireOffsetTimestamp('2026-07-28T09:30:00'));
});

test('prazo de quatro dias usa dias corridos', () => {
  assert.equal(
    addCalendarDays(new Date('2026-07-24T12:00:00.000Z'), 4).toISOString(),
    '2026-07-28T12:00:00.000Z'
  );
});
