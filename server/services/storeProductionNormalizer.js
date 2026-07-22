export const STORE_PRODUCTION_NUMBER_FIELDS = [
  'qtdTrxContabil',
  'qtdTrxNegocio',
  'qtdContas',
  'qtdConsig',
  'vlrConsig',
  'qtdLime',
  'vlrLime',
  'qtdCreditoParcelado',
  'vlrCreditoParcelado',
  'qtdCartao',
  'vlrFatCielo',
  'qtdFgts',
  'qtdVida',
  'qtdMicro',
  'qtdResidencial',
  'qtdDental',
  'qtdSuper',
  'qtdSegDebito',
  'qtdConsorcio',
  'qtdExpSorte',
  'qtdCred',
  'vlrCred',
  'segTotal',
];

export function normalizeStoreProductionRows(rows = []) {
  return rows.map((row) => {
    const normalized = { periodo: Number(row.periodo) };
    for (const field of STORE_PRODUCTION_NUMBER_FIELDS) {
      const value = Number(row[field]);
      normalized[field] = Number.isFinite(value) ? value : 0;
    }
    return normalized;
  });
}
