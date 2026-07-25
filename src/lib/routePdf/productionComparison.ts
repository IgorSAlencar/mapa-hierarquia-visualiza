import type { StoreProductionPoint } from '../mapDataApi';

/** Produção da loja nos dois períodos usados no comparativo do PDF. */
export interface RoutePdfStoreProduction {
  current: StoreProductionPoint | null;
  previous: StoreProductionPoint | null;
}

interface ProductMetric {
  label: string;
  quantity: keyof StoreProductionPoint;
  value?: keyof StoreProductionPoint;
}

const PRODUCT_METRICS: readonly ProductMetric[] = [
  { label: 'Contas', quantity: 'qtdContas' },
  { label: 'Cartões', quantity: 'qtdCartao' },
  { label: 'Consignado', quantity: 'qtdConsig', value: 'vlrConsig' },
  { label: 'LIME', quantity: 'qtdLime', value: 'vlrLime' },
  { label: 'Crédito Parcelado', quantity: 'qtdCreditoParcelado', value: 'vlrCreditoParcelado' },
  { label: 'FGTS', quantity: 'qtdFgts' },
  { label: 'Consórcio', quantity: 'qtdConsorcio' },
  { label: 'Microsseguros', quantity: 'qtdMicro' },
  { label: 'Vida', quantity: 'qtdVida' },
  { label: 'Residencial', quantity: 'qtdResidencial' },
  { label: 'Dental', quantity: 'qtdDental' },
  { label: 'Super Protegido', quantity: 'qtdSuper' },
  { label: 'Seguro Débito', quantity: 'qtdSegDebito' },
  { label: 'Sorte Expressa', quantity: 'qtdExpSorte' },
];

export interface ProductComparisonRow {
  label: string;
  currentQuantity: number;
  previousQuantity: number;
  currentValue: number | null;
  previousValue: number | null;
  quantityDelta: number;
  valueDelta: number | null;
}

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function metricValue(
  point: StoreProductionPoint | null,
  key: keyof StoreProductionPoint | undefined
): number | null {
  if (!key) return null;
  return safeNumber(point?.[key]);
}

export function buildProductComparisonRows(
  pair: RoutePdfStoreProduction | null
): ProductComparisonRow[] {
  const current = pair?.current ?? null;
  const previous = pair?.previous ?? null;
  return PRODUCT_METRICS.map((metric) => {
    const currentQuantity = safeNumber(current?.[metric.quantity]);
    const previousQuantity = safeNumber(previous?.[metric.quantity]);
    const currentValue = metricValue(current, metric.value);
    const previousValue = metricValue(previous, metric.value);
    return {
      label: metric.label,
      currentQuantity,
      previousQuantity,
      currentValue,
      previousValue,
      quantityDelta: currentQuantity - previousQuantity,
      valueDelta: currentValue == null || previousValue == null
        ? null
        : currentValue - previousValue,
    };
  });
}

/** Troca zero por travessão para não poluir a grade do PDF. */
export function dashWhenZero(text: string, raw: number): string {
  return raw === 0 ? '-' : text;
}

const SIGNED_QUANTITY_FORMAT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const SIGNED_CURRENCY_FORMAT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MONTH_SHORT = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
] as const;

/** Diferença de quantidade com sinal explícito; zero vira travessão. */
export function formatSignedQuantity(delta: number): string {
  if (delta === 0) return '-';
  const formatted = SIGNED_QUANTITY_FORMAT.format(Math.abs(delta));
  return delta > 0 ? `+${formatted}` : `-${formatted}`;
}

/** Diferença de valor com sinal explícito; zero ou nulo vira travessão. */
export function formatSignedCurrency(delta: number | null): string {
  if (delta == null || delta === 0) return '-';
  const formatted = SIGNED_CURRENCY_FORMAT.format(Math.abs(delta));
  return delta > 0 ? `+${formatted}` : `-${formatted}`;
}

/** Período AAAAMM → rótulo curto (ex.: JUL/26). */
export function formatPeriodShort(period: unknown, fallback = '-'): string {
  const raw = String(Math.trunc(safeNumber(period))).padStart(6, '0');
  if (!/^\d{6}$/.test(raw)) return fallback;
  const monthIndex = Number(raw.slice(4, 6)) - 1;
  if (monthIndex < 0 || monthIndex > 11) return fallback;
  return `${MONTH_SHORT[monthIndex]}/${raw.slice(2, 4)}`;
}
