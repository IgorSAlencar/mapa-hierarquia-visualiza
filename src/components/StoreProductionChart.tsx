import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Check,
  CreditCard,
  Minus,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
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
  type StoreProductionPoint,
} from '@/lib/mapDataApi';

type StoreProductionMetricKey = Exclude<keyof StoreProductionPoint, 'periodo'>;

type MetricMeta = {
  key: StoreProductionMetricKey;
  label: string;
  shortLabel: string;
  unit: 'quantity' | 'currency';
};

const METRIC_GROUPS: Array<{ label: string; metrics: MetricMeta[] }> = [
  {
    label: 'Relacionamento',
    metrics: [
      { key: 'qtdTrxContabil', label: 'Transações contábeis', shortLabel: 'Transações', unit: 'quantity' },
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
const DEFAULT_METRIC: StoreProductionMetricKey = 'qtdTrxContabil';

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
      maximumFractionDigits: 0,
    });
  }
  return Math.round(value).toLocaleString('pt-BR');
}

function formatCompact(value: number, unit: MetricMeta['unit']): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  let compact = '';
  if (absolute >= 1_000_000) compact = `${(absolute / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  else if (absolute >= 1_000) compact = `${(absolute / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  else compact = Math.round(absolute).toLocaleString('pt-BR');
  return unit === 'currency' ? `${sign}R$ ${compact}` : `${sign}${compact}`;
}

type QuickFactProduct = {
  label: string;
  value: number;
};

type QuickFact = {
  label: string;
  value: string;
  active: boolean | null;
  icon: LucideIcon;
  products?: QuickFactProduct[];
  tooltipAlign?: 'left' | 'right';
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
      <span className="min-w-0">
        <span className="block truncate text-[8px] font-semibold uppercase tracking-wide opacity-75">
          {fact.label}
        </span>
        <strong className="mt-0.5 block truncate text-[10px] font-bold leading-none">
          {fact.value}
        </strong>
      </span>
    </>
  );

  if (!fact.products) {
    return (
      <div
        className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 ${tone}`}
        aria-label={`${fact.label}: ${fact.value}`}
      >
        {contents}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`group relative flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-300 ${tone}`}
      aria-label={`${fact.label}: ${fact.value}. Passe o mouse ou pressione Tab para ver os produtos.`}
      aria-describedby={tooltipId}
    >
      {contents}
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-50 mt-2 w-[205px] translate-y-1 rounded-xl border border-slate-200 bg-white p-2.5 text-left text-slate-700 opacity-0 shadow-xl shadow-slate-900/15 transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-y-0 group-focus-visible:opacity-100 ${
          fact.tooltipAlign === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        <span className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
          <strong className="text-[10px] font-semibold text-slate-900">
            Produtos de {fact.label.toLowerCase()}
          </strong>
          <span className="text-[9px] font-normal text-slate-400">{periodLabel}</span>
        </span>
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
                  {produced ? Math.round(product.value).toLocaleString('pt-BR') : '—'}
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
};

const StoreProductionChart: React.FC<StoreProductionChartProps> = ({ chaveLoja, cieloM0 }) => {
  const [history, setHistory] = useState<StoreProductionPoint[]>([]);
  const [metricKey, setMetricKey] = useState<StoreProductionMetricKey>(DEFAULT_METRIC);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setHistory([]);

    fetchStoreProductionHistory(chaveLoja, controller.signal)
      .then((rows) => setHistory(rows))
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

  const metric = useMemo(
    () => METRICS.find((item) => item.key === metricKey) ?? METRICS[0],
    [metricKey]
  );

  const chartData = useMemo(
    () =>
      history.slice(-12).map((row) => ({
        periodo: row.periodo,
        label: formatPeriod(row.periodo),
        value: Number(row[metric.key]) || 0,
      })),
    [history, metric.key]
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
        { label: 'Consignado', value: latestHistory.qtdConsig },
        { label: 'LIME', value: latestHistory.qtdLime },
        { label: 'Crédito parcelado', value: latestHistory.qtdCreditoParcelado },
        { label: 'FGTS', value: latestHistory.qtdFgts },
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

  if (loading) {
    return (
      <section className="border-t border-slate-100 px-3 pb-3 pt-3" aria-busy="true">
        <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
        <div className="mt-3 h-36 animate-pulse rounded-lg bg-slate-100" />
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
    },
    {
      label: 'Cielo',
      value: cieloM0 == null ? 'Sem dado' : cieloM0 ? 'Tem' : 'Não tem',
      active: cieloM0,
      icon: CreditCard,
    },
    {
      label: 'Seguros',
      value: insuranceActive ? 'Produz' : 'Não produz',
      active: insuranceActive,
      icon: ShieldCheck,
      products: insuranceProducts,
      tooltipAlign: 'right',
    },
  ];

  return (
    <section className="border-t border-slate-100">
      <div className="px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Informações rápidas
          </p>
          <p className="text-[9px] text-slate-400">
            {latestHistory ? formatPeriod(latestHistory.periodo) : '—'}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
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

      <div className="border-t border-slate-100 px-3 pb-3 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">Produção mensal</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{metric.shortLabel} · últimos 12 períodos</p>
        </div>
        <label className="sr-only" htmlFor={`store-production-metric-${chaveLoja}`}>
          Produto exibido no gráfico
        </label>
        <select
          id={`store-production-metric-${chaveLoja}`}
          value={metricKey}
          onChange={(event) => setMetricKey(event.target.value as StoreProductionMetricKey)}
          className="h-8 max-w-[170px] min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
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

      <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/60 py-2.5">
        <div className="min-w-0 px-2 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Último mês</p>
          <p className="mt-1 truncate text-sm font-bold tabular-nums text-slate-900" title={latest ? formatValue(latest.value, metric.unit) : '—'}>
            {latest ? formatCompact(latest.value, metric.unit) : '—'}
          </p>
          <p className="mt-0.5 text-[9px] text-slate-400">{latest?.label ?? '—'}</p>
        </div>
        <div className="min-w-0 px-2 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Variação</p>
          <p
            className={`mt-1 flex items-center justify-center gap-1 text-sm font-bold tabular-nums ${
              variationUp ? 'text-emerald-600' : variationDown ? 'text-red-600' : 'text-slate-600'
            }`}
          >
            {variationUp ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : variationDown ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
            {variation == null
              ? '—'
              : `${Math.abs(variation).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          </p>
          <p className="mt-0.5 text-[9px] text-slate-400">vs. mês anterior</p>
        </div>
        <div className="min-w-0 px-2 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Média 3m</p>
          <p className="mt-1 truncate text-sm font-bold tabular-nums text-slate-900" title={formatValue(recentAverage, metric.unit)}>
            {formatCompact(recentAverage, metric.unit)}
          </p>
          <p className="mt-0.5 text-[9px] text-slate-400">ritmo recente</p>
        </div>
      </div>

      <div
        className="mt-3 h-[178px] w-full min-w-0"
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
              tick={{ fontSize: 9, fill: '#64748b' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={52}
              tickMargin={5}
              tick={{ fontSize: 9, fill: '#64748b' }}
              tickFormatter={(value: number) => formatCompact(value, metric.unit)}
              domain={[
                (dataMin: number) => Math.min(0, dataMin),
                (dataMax: number) => Math.max(0, dataMax),
              ]}
            />
            {hasNegativeValue ? <ReferenceLine y={0} stroke="#94a3b8" /> : null}
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
      </div>
    </section>
  );
};

export default StoreProductionChart;
