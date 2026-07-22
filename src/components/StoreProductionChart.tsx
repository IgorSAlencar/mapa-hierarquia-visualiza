import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  ClipboardCheck,
  History,
  Minus,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import CieloIcon from '@/components/CieloIcon';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchStoreProductionHistory,
  type StoreBusinessDailyPoint,
  type StoreProductionPoint,
} from '@/lib/mapDataApi';

type StoreProductionMetricKey = Exclude<keyof StoreProductionPoint, 'periodo'>;
type SelectedStoreProductionMetricKey = StoreProductionMetricKey | '';
const ACCOUNTING_BREAK_EVEN_TARGET = 200;
const BUSINESS_BREAK_EVEN_TARGET = 5;

type MetricMeta = {
  key: StoreProductionMetricKey;
  label: string;
  shortLabel: string;
  unit: 'quantity' | 'currency';
  referenceValue?: number;
  referenceLabel?: string;
};

const METRIC_GROUPS: Array<{ label: string; metrics: MetricMeta[] }> = [
  {
    label: 'Relacionamento',
    metrics: [
      { key: 'qtdTrxContabil', label: 'Transações contábeis', shortLabel: 'Transações', unit: 'quantity' },
      {
        key: 'qtdTrxNegocio',
        label: 'Transações de negócio',
        shortLabel: 'Transações de negócio',
        unit: 'quantity',
        referenceValue: BUSINESS_BREAK_EVEN_TARGET,
        referenceLabel: 'Mín. 5',
      },
      { key: 'qtdContas', label: 'Contas', shortLabel: 'Contas', unit: 'quantity' },
      { key: 'qtdCartao', label: 'Cartões', shortLabel: 'Cartões', unit: 'quantity' },
    ],
  },
  {
    label: 'Crédito',
    metrics: [
      { key: 'qtdCred', label: 'Crédito (QTD)', shortLabel: 'Crédito em QTD', unit: 'quantity' },
      { key: 'vlrCred', label: 'Crédito (R$)', shortLabel: 'Crédito em R$', unit: 'currency' },
      { key: 'qtdConsig', label: 'Consignado', shortLabel: 'Consignado', unit: 'quantity' },
      { key: 'qtdLime', label: 'LIME', shortLabel: 'LIME', unit: 'quantity' },
      {
        key: 'qtdCreditoParcelado',
        label: 'Crédito parcelado',
        shortLabel: 'Crédito parcelado',
        unit: 'quantity',
      },
      { key: 'qtdFgts', label: 'FGTS', shortLabel: 'FGTS', unit: 'quantity' },
    ],
  },
  {
    label: 'Seguros',
    metrics: [
      { key: 'segTotal', label: 'Seguros (QTD)', shortLabel: 'Seguros em QTD', unit: 'quantity' },
      { key: 'qtdVida', label: 'Vida', shortLabel: 'Vida', unit: 'quantity' },
      { key: 'qtdMicro', label: 'Microsseguros', shortLabel: 'Microsseguros', unit: 'quantity' },
      { key: 'qtdResidencial', label: 'Residencial', shortLabel: 'Residencial', unit: 'quantity' },
      { key: 'qtdDental', label: 'Dental', shortLabel: 'Dental', unit: 'quantity' },
      { key: 'qtdSuper', label: 'Super Protegido', shortLabel: 'Super Protegido', unit: 'quantity' },
      { key: 'qtdSegDebito', label: 'Seguro débito', shortLabel: 'Seguro débito', unit: 'quantity' },
    ],
  },
];

const METRICS = METRIC_GROUPS.flatMap((group) => group.metrics);
const DEFAULT_METRIC: SelectedStoreProductionMetricKey = '';

function formatPeriod(periodo: number): string {
  const raw = String(Math.trunc(Number(periodo))).padStart(6, '0');
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  if (!Number.isFinite(year) || month < 1 || month > 12) return raw;
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
    .format(new Date(year, month - 1, 1))
    .replace('.', '');
}

function formatValue(value: number, unit: MetricMeta['unit']): string {
  if (unit === 'currency') {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return Math.round(value).toLocaleString('pt-BR');
}

function businessHeatmapTone(value: number, maxValue: number): string {
  if (value <= 0) return 'border-slate-200 bg-slate-200';
  const intensity = maxValue > 0 ? value / maxValue : 0;
  if (intensity <= 1 / 3) return 'border-emerald-200 bg-emerald-200';
  if (intensity <= 2 / 3) return 'border-emerald-500 bg-emerald-500';
  return 'border-emerald-900 bg-emerald-900';
}

function BusinessProductionHeatmap({ data }: { data: StoreBusinessDailyPoint[] }) {
  const periodValues = new Map<number, Map<number, number>>();
  let maxBusinessDay = 0;
  let maxValue = 0;

  for (const row of data) {
    const periodo = Number(row.periodo);
    const diaUtil = Math.trunc(Number(row.diaUtil));
    const qtdNeg = Number(row.qtdNeg);
    if (!Number.isFinite(periodo) || diaUtil <= 0 || !Number.isFinite(qtdNeg)) continue;
    const values = periodValues.get(periodo) ?? new Map<number, number>();
    values.set(diaUtil, qtdNeg);
    periodValues.set(periodo, values);
    maxBusinessDay = Math.max(maxBusinessDay, diaUtil);
    maxValue = Math.max(maxValue, qtdNeg);
  }

  const periods = Array.from(periodValues.entries()).sort(([left], [right]) => left - right);
  const businessDays = Array.from({ length: maxBusinessDay }, (_, index) => index + 1);

  return (
    <section
      className="border-t border-slate-100 px-3 py-3"
      aria-labelledby="business-production-heatmap-title"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p id="business-production-heatmap-title" className="text-xs font-semibold text-slate-900">
            Produção de negócios por dia útil
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Meses nas linhas · intensidade calculada para esta loja
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-emerald-700">
          Base diária
        </span>
      </div>

      {periods.length > 0 ? (
        <>
          <div className="mt-3" role="img" aria-label="Mapa de calor da produção de negócios por mês e dia útil">
            <div className="flex items-end gap-1.5">
              <span className="w-9 shrink-0 pb-0.5 text-[8px] font-medium text-slate-400">Mês</span>
              <div
                className="grid min-w-0 flex-1 gap-[2px]"
                style={{ gridTemplateColumns: `repeat(${maxBusinessDay}, minmax(0, 1fr))` }}
                aria-hidden
              >
                {businessDays.map((day) => (
                  <span key={day} className="text-center text-[7px] leading-none text-slate-400">
                    {day % 2 === 1 ? day : ''}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-1.5 space-y-[3px]">
              {periods.map(([periodo, values]) => {
                const month = formatPeriod(periodo);
                return (
                  <div key={periodo} className="flex items-center gap-1.5">
                    <span className="w-9 shrink-0 text-[8px] font-medium text-slate-500">{month}</span>
                    <div
                      className="grid min-w-0 flex-1 gap-[2px]"
                      style={{ gridTemplateColumns: `repeat(${maxBusinessDay}, minmax(0, 1fr))` }}
                    >
                      {businessDays.map((day) => {
                        const value = values.get(day) ?? 0;
                        const formattedValue = value.toLocaleString('pt-BR', {
                          maximumFractionDigits: 2,
                        });
                        return (
                          <span
                            key={`${periodo}-${day}`}
                            className={`aspect-square min-h-[8px] rounded-[3px] border ${businessHeatmapTone(value, maxValue)}`}
                            role="img"
                            aria-label={`${month}, ${day}º dia útil: ${formattedValue} transações de negócio`}
                            title={`${day}º DU: ${formattedValue}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[8px] text-slate-400">
            <span>Sem produção</span>
            {[0, 1 / 3, 2 / 3, 1].map((intensity) => (
              <span
                key={intensity}
                className={`h-2.5 w-2.5 rounded-[3px] border ${businessHeatmapTone(
                  intensity,
                  1
                )}`}
                aria-hidden
              />
            ))}
            <span>Maior intensidade</span>
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-center">
          <p className="text-[10px] text-slate-500">
            Nenhuma produção diária encontrada para esta loja.
          </p>
        </div>
      )}
    </section>
  );
}

type QuickFactProduct = {
  label: string;
  value: number;
  unit?: 'quantity' | 'currency';
  amount?: number | null;
};

type QuickFact = {
  label: string;
  value: string;
  active: boolean | null;
  icon: React.ComponentType<{ className?: string }>;
  products?: QuickFactProduct[];
  tooltipTitle?: string;
  tooltipAlign?: 'left' | 'right';
  historyNote?: string;
  showQuantityValueColumns?: boolean;
};

function QuickFactCard({
  fact,
  periodLabel,
  tooltipId,
}: {
  fact: QuickFact;
  periodLabel: string;
  tooltipId: string;
}) {
  const Icon = fact.icon;
  const tone =
    fact.active === true
      ? 'border-emerald-100 bg-emerald-50/80 text-emerald-700'
      : fact.active === false
        ? 'border-slate-200 bg-slate-50 text-slate-500'
        : 'border-amber-100 bg-amber-50/80 text-amber-700';
  const contents = (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col items-center">
        <span className="flex min-h-[18px] items-center justify-center text-[7.5px] font-semibold uppercase leading-[9px] tracking-wide opacity-75">
          {fact.label}
        </span>
        <strong className="mt-0.5 block max-w-full truncate text-[9.5px] font-bold leading-none">
          {fact.value}
        </strong>
      </span>
      {fact.historyNote ? (
        <span
          className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-blue-500 bg-blue-500 text-white shadow-[0_1px_2px_rgba(15,23,42,0.10)]"
          title="Teve Cielo em meses anteriores"
          aria-label="Teve Cielo em meses anteriores"
        >
          <History className="h-2.5 w-2.5" aria-hidden />
        </span>
      ) : null}
    </>
  );

  if (!fact.products) {
    return (
      <div
        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center ${tone}`}
        aria-label={`${fact.label}: ${fact.value}${fact.historyNote ? `. ${fact.historyNote}` : ''}`}
      >
        {contents}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-300 ${tone}`}
      aria-label={`${fact.label}: ${fact.value}${fact.historyNote ? `. ${fact.historyNote}` : ''}. Passe o mouse ou pressione Tab para ver os produtos.`}
      aria-describedby={tooltipId}
    >
      {contents}
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-50 mt-2 translate-y-1 rounded-xl border border-slate-200 bg-white p-2.5 text-left text-slate-700 opacity-0 shadow-xl shadow-slate-900/15 transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-y-0 group-focus-visible:opacity-100 ${
          fact.showQuantityValueColumns ? 'w-[260px]' : 'w-[205px]'
        } ${
          fact.tooltipAlign === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        <span className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
          <strong className="text-[10px] font-semibold text-slate-900">
            {fact.tooltipTitle ?? `Produtos de ${fact.label.toLowerCase()}`}
          </strong>
          <span className="text-[9px] font-normal text-slate-400">{periodLabel}</span>
        </span>
        {fact.showQuantityValueColumns ? (
          <span className="mt-1.5 flex items-center justify-between gap-2 px-1.5 text-[8px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Produto</span>
            <span className="tabular-nums">QTD | VLR</span>
          </span>
        ) : null}
        <span className="mt-1.5 flex flex-col gap-1">
          {fact.products.map((product) => {
            const produced = Number(product.value) > 0;
            return (
              <span
                key={product.label}
                className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 ${
                  produced ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {produced ? (
                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                  ) : (
                    <Minus className="h-3 w-3 shrink-0" aria-hidden />
                  )}
                  <span className="truncate text-[10px] font-medium">{product.label}</span>
                </span>
                <strong className="shrink-0 text-[10px] tabular-nums">
                  {product.amount !== undefined ? (
                    <span className="flex items-center gap-1">
                      <span>{Math.round(product.value).toLocaleString('pt-BR')}</span>
                      <span className="font-normal text-slate-300">|</span>
                      <span>
                        {product.amount == null
                          ? '—'
                          : Number(product.amount).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                      </span>
                    </span>
                  ) : product.unit === 'currency'
                    ? Number(product.value).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : produced
                      ? Math.round(product.value).toLocaleString('pt-BR')
                      : '—'}
                </strong>
              </span>
            );
          })}
        </span>
      </span>
    </button>
  );
}

type StoreProductionChartProps = {
  chaveLoja: string;
  cieloM0: boolean | null;
  propostaValor: boolean | null;
};

const StoreProductionChart: React.FC<StoreProductionChartProps> = ({
  chaveLoja,
  cieloM0,
  propostaValor,
}) => {
  const [history, setHistory] = useState<StoreProductionPoint[]>([]);
  const [businessDaily, setBusinessDaily] = useState<StoreBusinessDailyPoint[]>([]);
  const [metricKey, setMetricKey] = useState<SelectedStoreProductionMetricKey>(DEFAULT_METRIC);
  const [showMonthlyHistory, setShowMonthlyHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setHistory([]);
    setBusinessDaily([]);

    fetchStoreProductionHistory(chaveLoja, controller.signal)
      .then((production) => {
        setHistory(production.history);
        setBusinessDaily(production.businessDaily);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar a produção desta loja.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [chaveLoja, retryTick]);

  useEffect(() => {
    setMetricKey(DEFAULT_METRIC);
    setShowMonthlyHistory(false);
  }, [chaveLoja]);

  const metric = useMemo(
    () => METRICS.find((item) => item.key === metricKey) ?? null,
    [metricKey]
  );

  const chartData = useMemo(
    () => {
      if (!metric) return [];
      return history.slice(-12).map((row) => ({
        periodo: row.periodo,
        label: formatPeriod(row.periodo),
        value: Number(row[metric.key]) || 0,
      }));
    },
    [history, metric]
  );

  const latest = chartData.at(-1) ?? null;
  const previous = chartData.at(-2) ?? null;
  const variation =
    latest && previous && previous.value !== 0
      ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
      : null;
  const recent = chartData.slice(-3);
  const recentAverage =
    recent.length > 0 ? recent.reduce((total, row) => total + row.value, 0) / recent.length : 0;
  const hasNegativeValue = chartData.some((row) => row.value < 0);
  const latestHistory = history.at(-1) ?? null;
  const creditProducts: QuickFactProduct[] = latestHistory
    ? [
        { label: 'Consignado', value: latestHistory.qtdConsig, amount: latestHistory.vlrConsig },
        { label: 'LIME', value: latestHistory.qtdLime, amount: latestHistory.vlrLime },
        {
          label: 'Crédito parcelado',
          value: latestHistory.qtdCreditoParcelado,
          amount: latestHistory.vlrCreditoParcelado,
        },
        { label: 'FGTS', value: latestHistory.qtdFgts, amount: null },
      ]
    : [];
  const insuranceProducts: QuickFactProduct[] = latestHistory
    ? [
        { label: 'Vida', value: latestHistory.qtdVida },
        { label: 'Microsseguros', value: latestHistory.qtdMicro },
        { label: 'Residencial', value: latestHistory.qtdResidencial },
        { label: 'Dental', value: latestHistory.qtdDental },
        { label: 'Super Protegido', value: latestHistory.qtdSuper },
        { label: 'Seguro débito', value: latestHistory.qtdSegDebito },
      ]
    : [];
  const creditActive = latestHistory
    ? creditProducts.some((product) => Number(product.value) > 0)
    : false;
  const insuranceActive = latestHistory
    ? insuranceProducts.some((product) => Number(product.value) > 0)
    : false;
  const accountingTransactions = latestHistory ? Number(latestHistory.qtdTrxContabil) || 0 : 0;
  const businessTransactions = latestHistory ? Number(latestHistory.qtdTrxNegocio) || 0 : 0;
  const cieloHistory: QuickFactProduct[] = history.slice(-12).reverse().map((row) => ({
    label: formatPeriod(row.periodo),
    value: Number(row.vlrFatCielo) || 0,
    unit: 'currency',
  }));
  const today = new Date();
  const currentPeriod = today.getFullYear() * 100 + today.getMonth() + 1;
  const cieloHadPreviousProduction = history.some(
    (row) => row.periodo < currentPeriod && Number(row.vlrFatCielo) > 0
  );
  const accountingBreakEven = accountingTransactions >= ACCOUNTING_BREAK_EVEN_TARGET;
  const businessBreakEven = businessTransactions >= BUSINESS_BREAK_EVEN_TARGET;
  const breakEvenReached = accountingBreakEven || businessBreakEven;

  if (loading) {
    return (
      <section className="border-t border-slate-100 px-3 py-2.5" aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 grid grid-cols-2 divide-x divide-slate-100">
          {[0, 1].map((item) => (
            <div key={item} className="mx-2 h-9 animate-pulse rounded bg-slate-100 first:ml-0 last:mr-0" />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
        <div className="mt-2 h-10 animate-pulse rounded-lg bg-slate-100" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="border-t border-slate-100 px-3 py-4">
        <p className="text-xs font-semibold text-slate-800">Produção mensal</p>
        <p className="mt-1 text-xs leading-relaxed text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => setRetryTick((value) => value + 1)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </button>
      </section>
    );
  }

  if (history.length === 0) {
    return (
      <section className="border-t border-slate-100 px-3 py-4">
        <p className="text-xs font-semibold text-slate-800">Produção mensal</p>
        <p className="mt-1 text-xs text-slate-500">
          Nenhum indicador encontrado para esta chave de loja.
        </p>
      </section>
    );
  }

  const variationUp = variation != null && variation > 0;
  const variationDown = variation != null && variation < 0;
  const quickFacts: QuickFact[] = [
    {
      label: 'Crédito',
      value: creditActive ? 'Produz' : 'Não produz',
      active: creditActive,
      icon: Banknote,
      products: creditProducts,
      tooltipAlign: 'left',
      showQuantityValueColumns: true,
    },
    {
      label: 'Cielo',
      value: cieloM0 == null ? 'Sem dado' : cieloM0 ? 'Tem' : 'Não tem',
      active: cieloM0,
      icon: CieloIcon,
      products: cieloHistory,
      tooltipTitle: 'Faturamento Cielo',
      historyNote: cieloM0 === false && cieloHadPreviousProduction ? 'Teve antes' : undefined,
    },
    {
      label: 'Seguros',
      value: insuranceActive ? 'Produz' : 'Não produz',
      active: insuranceActive,
      icon: ShieldCheck,
      products: insuranceProducts,
      tooltipAlign: 'right',
    },
    {
      label: 'Proposta de valor',
      value: propostaValor == null ? 'Sem dado' : propostaValor ? 'Tem' : 'Não tem',
      active: propostaValor,
      icon: ClipboardCheck,
    },
  ];

  if (showMonthlyHistory) {
    return (
      <section className="border-t border-slate-100 px-3 py-3" aria-label="Histórico mensal da loja">
        <button
          type="button"
          onClick={() => setShowMonthlyHistory(false)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          autoFocus
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Voltar para o resumo
        </button>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Histórico mensal</p>
            <p className="mt-0.5 truncate text-[10px] text-slate-500">
              {metric ? `${metric.shortLabel} · últimos 12 períodos` : 'Escolha um indicador'}
            </p>
          </div>
          <div className="w-[172px] shrink-0">
            <label
              className="mb-1 block text-[8px] font-semibold uppercase tracking-wide text-slate-500"
              htmlFor={`store-production-metric-${chaveLoja}`}
            >
              Produção mensal
            </label>
            <select
              id={`store-production-metric-${chaveLoja}`}
              value={metricKey}
              onChange={(event) =>
                setMetricKey(event.target.value as SelectedStoreProductionMetricKey)
              }
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              aria-label="Produto exibido no gráfico"
            >
              <option value="">Selecione</option>
              {METRIC_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.metrics.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {metric ? (
          <>
            <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/60 py-2.5">
              <div className="min-w-0 px-2 text-center">
                <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Mês atual</p>
                <p
                  className="mt-1 whitespace-nowrap text-xs font-bold tabular-nums text-slate-900"
                  title={latest ? formatValue(latest.value, metric.unit) : '—'}
                >
                  {latest ? formatValue(latest.value, metric.unit) : '—'}
                </p>
                <p className="mt-0.5 text-[8px] text-slate-400">{latest?.label ?? '—'}</p>
              </div>
              <div className="min-w-0 px-2 text-center">
                <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Variação</p>
                <p
                  className={`mt-1 flex items-center justify-center gap-1 text-sm font-bold tabular-nums ${
                    variationUp ? 'text-emerald-600' : variationDown ? 'text-red-600' : 'text-slate-600'
                  }`}
                >
                  {variationUp ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : variationDown ? (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {variation == null
                    ? '—'
                    : `${Math.abs(variation).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                </p>
                <p className="mt-0.5 text-[8px] text-slate-400">vs. mês anterior</p>
              </div>
              <div className="min-w-0 px-2 text-center">
                <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Média 3m</p>
                <p
                  className="mt-1 whitespace-nowrap text-xs font-bold tabular-nums text-slate-900"
                  title={formatValue(recentAverage, metric.unit)}
                >
                  {formatValue(recentAverage, metric.unit)}
                </p>
                <p className="mt-0.5 text-[8px] text-slate-400">ritmo recente</p>
              </div>
            </div>

            <div
              className="mt-3 h-[190px] w-full min-w-0"
              role="img"
              aria-label={`Evolução mensal de ${metric.label} da loja ${chaveLoja}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={18}
                    tick={{ fontSize: 8, fill: '#64748b' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={metric.unit === 'currency' ? 96 : 62}
                    tickMargin={5}
                    tick={{ fontSize: 8, fill: '#64748b' }}
                    tickFormatter={(value: number) => formatValue(value, metric.unit)}
                    domain={[
                      (dataMin: number) => Math.min(0, dataMin),
                      (dataMax: number) => Math.max(0, dataMax),
                    ]}
                  />
                  {hasNegativeValue ? <ReferenceLine y={0} stroke="#94a3b8" /> : null}
                  {metric.referenceValue != null ? (
                    <ReferenceLine
                      y={metric.referenceValue}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                      label={{
                        value: metric.referenceLabel ?? String(metric.referenceValue),
                        position: 'insideTopRight',
                        fill: '#64748b',
                        fontSize: 8,
                      }}
                    />
                  ) : null}
                  <Tooltip
                    formatter={(value: number) => [formatValue(Number(value), metric.unit), metric.label]}
                    labelFormatter={(label) => `Período: ${String(label)}`}
                    contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: '#e2e8f0' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={metric.label}
                    stroke="#991b1b"
                    strokeWidth={2.25}
                    dot={false}
                    activeDot={{ r: 4, fill: '#991b1b', stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="mt-3 flex h-[132px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
            <ChartNoAxesCombined className="h-5 w-5 text-slate-400" aria-hidden />
            <p className="mt-2 text-[11px] font-semibold text-slate-700">Selecione uma produção</p>
            <p className="mt-0.5 text-[9px] text-slate-500">O resumo e o gráfico serão exibidos aqui.</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="border-t border-slate-100">
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Indicadores principais
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-slate-400">
              {latestHistory ? formatPeriod(latestHistory.periodo) : '—'}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide ${
                breakEvenReached
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
              aria-label={`Ponto de equilíbrio: ${breakEvenReached ? 'atingido' : 'pendente'}`}
            >
              {breakEvenReached ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}
              {breakEvenReached ? 'Equilíbrio atingido' : 'Equilíbrio pendente'}
            </span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 divide-x divide-slate-100">
          <div className="min-w-0 pr-2.5">
            <div className="flex items-center gap-1">
              <span className="flex min-w-0 items-center gap-1 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
                <ArrowRightLeft className="h-3 w-3 shrink-0" aria-hidden />
                Transações contábeis
              </span>
            </div>
            <div className="mt-1">
              <strong
                className={`text-base font-bold leading-none tabular-nums ${
                  accountingBreakEven ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {formatValue(accountingTransactions, 'quantity')}
              </strong>
            </div>
          </div>

          <div className="min-w-0 pl-2.5">
            <div className="flex items-center gap-1">
              <span className="flex min-w-0 items-center gap-1 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
                <BriefcaseBusiness className="h-3 w-3 shrink-0" aria-hidden />
                Transações de negócio
              </span>
            </div>
            <div className="mt-1">
              <strong
                className={`text-base font-bold leading-none tabular-nums ${
                  businessBreakEven ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {formatValue(businessTransactions, 'quantity')}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Informações rápidas
          </p>
          <p className="text-[9px] text-slate-400">
            {latestHistory ? formatPeriod(latestHistory.periodo) : '—'}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {quickFacts.map((fact) => (
            <QuickFactCard
              key={fact.label}
              fact={fact}
              periodLabel={latestHistory ? formatPeriod(latestHistory.periodo) : '—'}
              tooltipId={`store-quick-${chaveLoja}-${fact.label.toLowerCase()}`}
            />
          ))}
        </div>
      </div>

      <BusinessProductionHeatmap data={businessDaily} />

      <div className="border-t border-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={() => {
            setMetricKey(DEFAULT_METRIC);
            setShowMonthlyHistory(true);
          }}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-left text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
          aria-label="Abrir histórico mensal da produção da loja"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ChartNoAxesCombined className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
            <span className="min-w-0">
              <strong className="block text-[11px] font-semibold text-slate-800">Ver histórico mensal</strong>
              <span className="block truncate text-[9px] text-slate-500">Indicadores e evolução dos últimos 12 períodos</span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      </div>

    </section>
  );
};

export default StoreProductionChart;
