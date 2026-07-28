function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasProductEvolved(productCode, baseline = {}, current = {}) {
  switch (productCode) {
    case 'CREDITO':
      return number(current.creditQuantity) > number(baseline.creditQuantity)
        || number(current.creditValue) > number(baseline.creditValue);
    case 'CIELO':
      return number(current.cieloQuantity) > number(baseline.cieloQuantity)
        || number(current.cieloValue) > number(baseline.cieloValue);
    case 'FAZER_NEGOCIO':
      return number(current.businessQuantity) > number(baseline.businessQuantity);
    case 'PROPOSTA_VALOR':
      return number(baseline.valueProposal) === 0 && number(current.valueProposal) === 1;
    case 'ATIVO_PADE':
      return number(current.activePade) > number(baseline.activePade)
        || number(current.accountingTransactions) > number(baseline.accountingTransactions)
        || number(current.businessQuantity) > number(baseline.businessQuantity);
    default:
      return false;
  }
}
