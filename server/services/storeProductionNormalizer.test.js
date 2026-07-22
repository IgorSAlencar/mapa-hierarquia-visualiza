import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStoreProductionRows } from './storeProductionNormalizer.js';

test('normaliza os componentes adicionais da transação de negócio', () => {
  const [row] = normalizeStoreProductionRows([{
    periodo: '202607',
    qtdTrxNegocio: '7',
    qtdConsorcio: '1',
    qtdExpSorte: '3',
  }]);

  assert.equal(row.periodo, 202607);
  assert.equal(row.qtdTrxNegocio, 7);
  assert.equal(row.qtdConsorcio, 1);
  assert.equal(row.qtdExpSorte, 3);
  assert.equal(row.qtdContas, 0);
});

