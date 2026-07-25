import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoreProductionPoint } from '../mapDataApi.ts';
import {
  buildProductComparisonRows,
  dashWhenZero,
  formatPeriodShort,
  formatSignedCurrency,
  formatSignedQuantity,
} from './productionComparison.ts';

function samplePoint(overrides: Partial<StoreProductionPoint> = {}): StoreProductionPoint {
  return {
    periodo: 202607,
    qtdTrxContabil: 0,
    qtdTrxNegocio: 0,
    qtdContas: 0,
    qtdConsig: 0,
    vlrConsig: 0,
    qtdLime: 0,
    vlrLime: 0,
    qtdCreditoParcelado: 0,
    vlrCreditoParcelado: 0,
    qtdCartao: 0,
    vlrFatCielo: 0,
    qtdFgts: 0,
    qtdVida: 0,
    qtdMicro: 0,
    qtdResidencial: 0,
    qtdDental: 0,
    qtdSuper: 0,
    qtdSegDebito: 0,
    qtdConsorcio: 0,
    qtdExpSorte: 0,
    qtdCred: 0,
    vlrCred: 0,
    segTotal: 0,
    ...overrides,
  };
}

test('monta 14 linhas com delta positivo e negativo entre os meses', () => {
  const rows = buildProductComparisonRows({
    current: samplePoint({ qtdContas: 5, qtdConsig: 2, vlrConsig: 1500 }),
    previous: samplePoint({ periodo: 202606, qtdContas: 3, qtdConsig: 4, vlrConsig: 2200 }),
  });
  assert.equal(rows.length, 14);

  const contas = rows.find((row) => row.label === 'Contas');
  assert.ok(contas);
  assert.equal(contas.currentQuantity, 5);
  assert.equal(contas.previousQuantity, 3);
  assert.equal(contas.quantityDelta, 2);
  assert.equal(contas.currentValue, null);

  const consignado = rows.find((row) => row.label === 'Consignado');
  assert.ok(consignado);
  assert.equal(consignado.quantityDelta, -2);
  assert.equal(consignado.valueDelta, -700);
  assert.equal(consignado.currentValue, 1500);
  assert.equal(consignado.previousValue, 2200);
});

test('loja sem mês anterior zera o lado anterior sem quebrar', () => {
  const rows = buildProductComparisonRows({
    current: samplePoint({ qtdCartao: 7 }),
    previous: null,
  });
  const cartoes = rows.find((row) => row.label === 'Cartões');
  assert.ok(cartoes);
  assert.equal(cartoes.previousQuantity, 0);
  assert.equal(cartoes.quantityDelta, 7);
});

test('produção ausente gera todas as linhas zeradas', () => {
  const rows = buildProductComparisonRows(null);
  assert.equal(rows.length, 14);
  assert.ok(rows.every((row) => row.currentQuantity === 0 && row.quantityDelta === 0));
});

test('zero vira travessão e delta recebe sinal explícito', () => {
  assert.equal(dashWhenZero('0', 0), '-');
  assert.equal(dashWhenZero('4', 4), '4');
  assert.equal(formatSignedQuantity(3), '+3');
  assert.equal(formatSignedQuantity(-2), '-2');
  assert.equal(formatSignedQuantity(0), '-');
  assert.equal(formatSignedCurrency(700), '+R$\u00A0700');
  assert.equal(formatSignedCurrency(-700), '-R$\u00A0700');
  assert.equal(formatSignedCurrency(0), '-');
  assert.equal(formatSignedCurrency(null), '-');
  assert.equal(formatPeriodShort(202607), 'JUL/26');
  assert.equal(formatPeriodShort(202606), 'JUN/26');
  assert.equal(formatPeriodShort(null, 'ATUAL'), 'ATUAL');
});
