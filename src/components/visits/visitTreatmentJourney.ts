export type TreatmentJourneyStep = 0 | 1 | 2;

interface ProductLike {
  active?: boolean;
  treatmentStatus: string;
}

interface VisitLike {
  status: string;
  checkin: unknown;
  products: ProductLike[];
}

export interface CompletionRequirements {
  checkin: unknown;
  products: ProductLike[];
  resultConfirmed: boolean;
  needsReturn: boolean;
  returnDate: string;
}

const TERMINAL_STATUSES = new Set([
  'REALIZADA',
  'NAO_REALIZADA',
  'REAGENDADA',
  'CANCELADA',
]);

export function isTerminalVisitStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function areVisitProductsComplete(products: ProductLike[]): boolean {
  return products
    .filter((product) => product.active !== false)
    .every((product) => product.treatmentStatus !== 'PENDENTE');
}

export function resolveTreatmentJourneyStep(
  visit: VisitLike,
  requestedStep = 0
): TreatmentJourneyStep {
  if (isTerminalVisitStatus(visit.status)) return 2;
  if (!visit.checkin) return 0;

  const normalized = Math.max(1, Math.min(2, Math.trunc(requestedStep)));
  if (normalized === 2 && !areVisitProductsComplete(visit.products)) return 1;
  return normalized as TreatmentJourneyStep;
}

export function treatmentCompletionIssues(
  requirements: CompletionRequirements
): string[] {
  const issues: string[] = [];
  if (!requirements.checkin) issues.push('CHECKIN_REQUIRED');
  if (!areVisitProductsComplete(requirements.products)) issues.push('PRODUCTS_REQUIRED');
  if (!requirements.resultConfirmed) issues.push('COMMERCIAL_RESULT_REQUIRED');
  if (requirements.needsReturn && !requirements.returnDate) issues.push('RETURN_DATE_REQUIRED');
  return issues;
}
