import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStoreCertificationRows } from './storeCertificationNormalizer.js';

test('normaliza, ordena e remove certificações duplicadas', () => {
  const result = normalizeStoreCertificationRows([
    {
      NOME_INSCRITO: 'Pessoa Dois',
      CPF: '222',
      STATUS_CERTIFICACAO: 'CERTIFICAÇÃO OK',
      DATA_CERTIFICACAO: '2024-01-10',
      DATA_VENCIMENTO: '2029-01-10',
    },
    {
      NOME_INSCRITO: 'Pessoa Um',
      CPF: '111',
      STATUS_CERTIFICACAO: 'CERTIFICAÇÃO OK - PENDENTE RENOVAÇÃO',
      DATA_CERTIFICACAO: '2021-08-01',
      DATA_VENCIMENTO: '2026-08-01',
    },
    {
      NOME_INSCRITO: 'Pessoa Um duplicada',
      CPF: '111',
      STATUS_CERTIFICACAO: 'CERTIFICAÇÃO OK - PENDENTE RENOVAÇÃO',
      DATA_CERTIFICACAO: '2021-08-01',
      DATA_VENCIMENTO: '2026-08-01',
    },
  ]);

  assert.equal(result.status, 'CERTIFICAÇÃO OK - PENDENTE RENOVAÇÃO');
  assert.equal(result.people.length, 2);
  assert.equal(result.people[0].name, 'Pessoa Um');
  assert.equal(result.people[0].expirationDate, '2026-08-01T00:00:00.000Z');
});

test('preserva o status de loja sem certificação sem criar pessoa', () => {
  const result = normalizeStoreCertificationRows([
    {
      NOME_INSCRITO: null,
      CPF: null,
      STATUS_CERTIFICACAO: 'BLOQUEADO - SEM CERTIFICAÇÃO',
      DATA_CERTIFICACAO: null,
      DATA_VENCIMENTO: null,
    },
  ]);

  assert.equal(result.status, 'BLOQUEADO - SEM CERTIFICAÇÃO');
  assert.deepEqual(result.people, []);
});
