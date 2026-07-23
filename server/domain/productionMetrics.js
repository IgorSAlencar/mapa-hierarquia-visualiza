const quantity = 'quantity';
const currency = 'currency';

export function storeCreditQuantitySql(indicatorAlias) {
  return `
    ISNULL(${indicatorAlias}.QTD_CONSIG_AVERBADO, 0)
      + ISNULL(${indicatorAlias}.QTD_CONSIG_AVERBADO_PLATAF, 0)
      + ISNULL(${indicatorAlias}.QTD_CRED_CONSIG_PUB_AVERB, 0)
      + ISNULL(${indicatorAlias}.QTD_CRED_CONSIG_PRIV_AVERB, 0)
      + ISNULL(${indicatorAlias}.QTD_LIME_DTLHES, 0)
      + ISNULL(${indicatorAlias}.QTD_LIME_DTLHES_PLATAFORMA, 0)
      + ISNULL(${indicatorAlias}.QTD_CREDITO_PARCEL_DTLHES, 0)
  `;
}

export function storeBusinessQuantitySql(indicatorAlias, consortiumAlias) {
  return `
    CASE
      WHEN TRY_CONVERT(int, ${indicatorAlias}.PERIODO) <= 202606 THEN
        ISNULL(${indicatorAlias}.QTD_CONTAS_TABLET_POS, 0)
          + ISNULL(${indicatorAlias}.QTD_CONTA_SALARIO, 0)
          + ISNULL(${indicatorAlias}.QTD_CONSIG_AVERBADO, 0)
          + ISNULL(${indicatorAlias}.QTD_CONSIG_AVERBADO_PLATAF, 0)
          + ISNULL(${indicatorAlias}.QTD_LIME_DTLHES, 0)
          + ISNULL(${indicatorAlias}.QTD_LIME_DTLHES_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_CREDITO_PARCEL_DTLHES, 0)
          + ISNULL(${indicatorAlias}.QTD_CARTAO_CONTRATADO, 0)
          + ISNULL(${indicatorAlias}.QTD_CARTAO_CONTRATADO_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_CARTAO_AVULSO_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_FGTS, 0)
          + ISNULL(${indicatorAlias}.QTD_MICRO_VIVAVIDA, 0)
          + ISNULL(${indicatorAlias}.QTD_MICROSSEGUROS, 0)
          + ISNULL(${indicatorAlias}.QTD_SEG_RESIDENCIAL, 0)
          + ISNULL(${indicatorAlias}.QTD_PLANO_ODONTO, 0)
          + ISNULL(${indicatorAlias}.QTD_DEPENDENTES_ODONTO, 0)
          + ISNULL(${indicatorAlias}.QTD_SUPER_PROTEGIDO, 0)
          + ISNULL(${indicatorAlias}.QTD_SUPERPROTEGIDO_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_SEG_CARTAO_DEB_CTA, 0)
          + ISNULL(${indicatorAlias}.QTD_SEG_CARTAO_DEB_DESBL, 0)
          + (ISNULL(${indicatorAlias}.VLR_EXP_SORTE, 0) / 50.0)
      ELSE
        ISNULL(${indicatorAlias}.QTD_CONTAS_TABLET_POS, 0)
          + ISNULL(${indicatorAlias}.QTD_CONTA_SALARIO, 0)
          + ISNULL(${indicatorAlias}.QTD_CONSIG_AVERBADO, 0)
          + ISNULL(${indicatorAlias}.QTD_CONSIG_AVERBADO_PLATAF, 0)
          + ISNULL(${indicatorAlias}.QTD_LIME_DTLHES, 0)
          + ISNULL(${indicatorAlias}.QTD_LIME_DTLHES_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_CREDITO_PARCEL_DTLHES, 0)
          + ISNULL(${indicatorAlias}.QTD_CARTAO_CONTRATADO, 0)
          + ISNULL(${indicatorAlias}.QTD_CARTAO_CONTRATADO_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_CARTAO_AVULSO_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_FGTS, 0)
          + FLOOR(ISNULL(${indicatorAlias}.QTD_MICRO_VIVAVIDA, 0) / 3.0)
          + FLOOR(ISNULL(${indicatorAlias}.QTD_MICROSSEGUROS, 0) / 3.0)
          + ISNULL(${indicatorAlias}.QTD_SEG_RESIDENCIAL, 0)
          + ISNULL(${indicatorAlias}.QTD_PLANO_ODONTO, 0)
          + ISNULL(${indicatorAlias}.QTD_DEPENDENTES_ODONTO, 0)
          + ISNULL(${indicatorAlias}.QTD_SUPER_PROTEGIDO, 0)
          + ISNULL(${indicatorAlias}.QTD_SUPERPROTEGIDO_PLATAFORMA, 0)
          + ISNULL(${indicatorAlias}.QTD_SEG_CARTAO_DEB_CTA, 0)
          + ISNULL(${indicatorAlias}.QTD_SEG_CARTAO_DEB_DESBL, 0)
          + CASE WHEN ISNULL(${consortiumAlias}.REALIZADO, 0) > 0 THEN 1 ELSE 0 END
          + FLOOR(ISNULL(${indicatorAlias}.VLR_EXP_SORTE, 0) / 50.0)
    END
  `;
}

const sqlBuilders = {
  qtdTrxContabil: (a) => `ISNULL(${a}.QTD_TRX_CONTABIL_DTLHES, 0)`,
  qtdTrxNegocio: (a, e) => storeBusinessQuantitySql(a, e),
  qtdContas: (a) => `ISNULL(${a}.QTD_CONTAS_TABLET_POS, 0) + ISNULL(${a}.QTD_CONTA_SALARIO, 0)`,
  qtdCartao: (a) => `ISNULL(${a}.QTD_CARTAO_CONTRATADO, 0) + ISNULL(${a}.QTD_CARTAO_CONTRATADO_PLATAFORMA, 0) + ISNULL(${a}.QTD_CARTAO_AVULSO_PLATAFORMA, 0)`,
  qtdCred: (a) => storeCreditQuantitySql(a),
  vlrCred: (a) => `ISNULL(${a}.VLR_CONSIG_CONTRATO_AVERBADO, 0) + ISNULL(${a}.VLR_CONSIG_CONTRATO_AVERBADO_PLATAF, 0) + ISNULL(${a}.VLR_EMPRESTIMO_CRED_CONSIG_PUB_AVERB, 0) + ISNULL(${a}.VLR_EMPRESTIMO_CRED_CONSIG_PRIV_AVERB, 0) + ISNULL(${a}.VLR_LIME_DTLHES_EMPRESTIMO, 0) + ISNULL(${a}.VLR_LIME_DTLHES_EMPRESTIMO_PLATAFORMA, 0) + ISNULL(${a}.VLR_CREDITO_PARCEL_DTLHES_EMPRESTIMO, 0)`,
  qtdConsig: (a) => `ISNULL(${a}.QTD_CONSIG_AVERBADO, 0) + ISNULL(${a}.QTD_CONSIG_AVERBADO_PLATAF, 0)`,
  qtdLime: (a) => `ISNULL(${a}.QTD_LIME_DTLHES, 0) + ISNULL(${a}.QTD_LIME_DTLHES_PLATAFORMA, 0)`,
  qtdCreditoParcelado: (a) => `ISNULL(${a}.QTD_CREDITO_PARCEL_DTLHES, 0)`,
  qtdFgts: (a) => `ISNULL(${a}.QTD_FGTS, 0)`,
  segTotal: (a) => `ISNULL(${a}.QTD_MICROSSEGUROS, 0) + ISNULL(${a}.QTD_MICRO_VIVAVIDA, 0) + ISNULL(${a}.QTD_SUPER_PROTEGIDO, 0) + ISNULL(${a}.QTD_SUPERPROTEGIDO_PLATAFORMA, 0) + ISNULL(${a}.QTD_SEG_RESIDENCIAL, 0) + ISNULL(${a}.QTD_TITULO_EXP_SORTE, 0) + ISNULL(${a}.QTD_PLANO_ODONTO, 0) + ISNULL(${a}.QTD_DEPENDENTES_ODONTO, 0) + ISNULL(${a}.QTD_SEG_CARTAO_DEB_CTA, 0) + ISNULL(${a}.QTD_SEG_CARTAO_DEB_DESBL, 0)`,
  qtdVida: (a) => `ISNULL(${a}.QTD_MICRO_VIVAVIDA, 0)`,
  qtdMicro: (a) => `ISNULL(${a}.QTD_MICROSSEGUROS, 0)`,
  qtdResidencial: (a) => `ISNULL(${a}.QTD_SEG_RESIDENCIAL, 0)`,
  qtdDental: (a) => `ISNULL(${a}.QTD_PLANO_ODONTO, 0) + ISNULL(${a}.QTD_DEPENDENTES_ODONTO, 0)`,
  qtdSuper: (a) => `ISNULL(${a}.QTD_SUPER_PROTEGIDO, 0) + ISNULL(${a}.QTD_SUPERPROTEGIDO_PLATAFORMA, 0)`,
  qtdSegDebito: (a) => `ISNULL(${a}.QTD_SEG_CARTAO_DEB_CTA, 0) + ISNULL(${a}.QTD_SEG_CARTAO_DEB_DESBL, 0)`,
};

export const PRODUCTION_HEATMAP_METRICS = [
  { id: 'qtdTrxContabil', label: 'Transações contábeis', shortLabel: 'Transações', group: 'Relacionamento', unit: quantity },
  { id: 'qtdTrxNegocio', label: 'Transações de negócio', shortLabel: 'Negócios', group: 'Relacionamento', unit: quantity },
  { id: 'qtdContas', label: 'Contas', shortLabel: 'Contas', group: 'Relacionamento', unit: quantity },
  { id: 'qtdCartao', label: 'Cartões', shortLabel: 'Cartões', group: 'Relacionamento', unit: quantity },
  { id: 'qtdCred', label: 'Crédito (QTD)', shortLabel: 'Crédito QTD', group: 'Crédito', unit: quantity },
  { id: 'vlrCred', label: 'Crédito (R$)', shortLabel: 'Crédito R$', group: 'Crédito', unit: currency },
  { id: 'qtdConsig', label: 'Consignado', shortLabel: 'Consignado', group: 'Crédito', unit: quantity },
  { id: 'qtdLime', label: 'LIME', shortLabel: 'LIME', group: 'Crédito', unit: quantity },
  { id: 'qtdCreditoParcelado', label: 'Crédito parcelado', shortLabel: 'Crédito parcelado', group: 'Crédito', unit: quantity },
  { id: 'qtdFgts', label: 'FGTS', shortLabel: 'FGTS', group: 'Crédito', unit: quantity },
  { id: 'segTotal', label: 'Seguros (QTD)', shortLabel: 'Seguros', group: 'Seguros', unit: quantity },
  { id: 'qtdVida', label: 'Vida', shortLabel: 'Vida', group: 'Seguros', unit: quantity },
  { id: 'qtdMicro', label: 'Microsseguros', shortLabel: 'Microsseguros', group: 'Seguros', unit: quantity },
  { id: 'qtdResidencial', label: 'Residencial', shortLabel: 'Residencial', group: 'Seguros', unit: quantity },
  { id: 'qtdDental', label: 'Dental', shortLabel: 'Dental', group: 'Seguros', unit: quantity },
  { id: 'qtdSuper', label: 'Super Protegido', shortLabel: 'Super Protegido', group: 'Seguros', unit: quantity },
  { id: 'qtdSegDebito', label: 'Seguro débito', shortLabel: 'Seguro débito', group: 'Seguros', unit: quantity },
];

const metricsById = new Map(PRODUCTION_HEATMAP_METRICS.map((metric) => [metric.id, metric]));

export function getProductionHeatmapMetric(metricId) {
  return metricsById.get(String(metricId ?? '').trim()) ?? null;
}

export function productionMetricSql(metricId, indicatorAlias = 'A', consortiumAlias = 'E') {
  const builder = sqlBuilders[metricId];
  if (!builder) return null;
  return builder(indicatorAlias, consortiumAlias);
}

export function normalizeProductionHeatmapPeriods(rows = [], now = new Date()) {
  const currentPeriod = now.getFullYear() * 100 + now.getMonth() + 1;
  return Array.from(new Set(
    rows
      .map((row) => Number(row?.periodo))
      .filter((period) => {
        const month = period % 100;
        return Number.isInteger(period) && period <= currentPeriod && month >= 1 && month <= 12;
      })
  ))
    .sort((left, right) => left - right)
    .slice(-12);
}
