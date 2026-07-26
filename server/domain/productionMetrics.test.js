import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProductionHeatmapMetric,
  normalizeProductionHeatmapPeriods,
  productionMetricSql,
  PRODUCTION_HEATMAP_METRICS,
} from './productionMetrics.js';

test('catálogo público contém as 20 métricas permitidas', () => {
  assert.equal(PRODUCTION_HEATMAP_METRICS.length, 20);
  assert.equal(getProductionHeatmapMetric('segTotal')?.unit, 'quantity');
  assert.equal(getProductionHeatmapMetric('vlrCred')?.unit, 'currency');
  assert.equal(getProductionHeatmapMetric('vlrConsig')?.unit, 'currency');
  assert.equal(getProductionHeatmapMetric('vlrLime')?.unit, 'currency');
  assert.equal(getProductionHeatmapMetric('vlrCreditoParcelado')?.unit, 'currency');
  assert.equal(getProductionHeatmapMetric('qtdFgts')?.unit, 'quantity');
  assert.equal(getProductionHeatmapMetric('DROP TABLE'), null);
  assert.equal(productionMetricSql('DROP TABLE'), null);
});

test('expressões SQL são escolhidas somente pela whitelist', () => {
  assert.match(productionMetricSql('qtdContas', 'A', 'E'), /QTD_CONTAS_TABLET_POS/);
  assert.match(productionMetricSql('qtdTrxNegocio', 'A', 'E'), /202606/);
  assert.match(productionMetricSql('qtdTrxNegocio', 'A', 'E'), /E\.REALIZADO/);
  assert.match(productionMetricSql('qtdConsig', 'A', 'E'), /QTD_CRED_CONSIG_PUB_AVERB/);
  assert.match(productionMetricSql('qtdConsig', 'A', 'E'), /QTD_CRED_CONSIG_PRIV_AVERB/);
  assert.match(productionMetricSql('vlrConsig', 'A', 'E'), /VLR_CONSIG_CONTRATO_AVERBADO/);
  assert.match(
    productionMetricSql('vlrConsig', 'A', 'E'),
    /VLR_EMPRESTIMO_CRED_CONSIG_PUB_AVERB/
  );
  assert.match(
    productionMetricSql('vlrConsig', 'A', 'E'),
    /VLR_EMPRESTIMO_CRED_CONSIG_PRIV_AVERB/
  );
  assert.match(productionMetricSql('vlrLime', 'A', 'E'), /VLR_LIME_DTLHES_EMPRESTIMO/);
  assert.match(
    productionMetricSql('vlrCreditoParcelado', 'A', 'E'),
    /VLR_CREDITO_PARCEL_DTLHES_EMPRESTIMO/
  );
});

test('períodos são válidos, ordenados, limitados e não futuros', () => {
  const rows = [
    { periodo: 202508 },
    { periodo: 202607 },
    { periodo: 202608 },
    { periodo: 202607 },
    { periodo: 202613 },
    { periodo: 'inválido' },
  ];
  assert.deepEqual(
    normalizeProductionHeatmapPeriods(rows, new Date(2026, 6, 22)),
    [202508, 202607]
  );
});
