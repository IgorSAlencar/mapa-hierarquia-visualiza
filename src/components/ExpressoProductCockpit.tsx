import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MapPin,
  Shield,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  PeriodoEvolucaoId,
  ProdutoExpressoId,
  ProdutoExpressoResumo,
  ProdutoStatusSemantico,
} from '@/lib/expressoRegionMock';

const PERIODOS: { id: PeriodoEvolucaoId; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '3m', label: '3M' },
  { id: '12m', label: '12M' },
];

const STATUS_LABEL: Record<ProdutoStatusSemantico, string> = {
  critico: 'Crítico',
  atencao: 'Atenção',
  saudavel: 'Saudável',
};

const STATUS_BADGE: Record<ProdutoStatusSemantico, string> = {
  critico: 'bg-red-50 text-red-700 ring-1 ring-red-200/80',
  atencao: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80',
  saudavel: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80',
};

/** Mês atual — vermelho fechado (ênfase) */
const CHART_STROKE_ATUAL = '#991b1b';
/** Mês anterior — vermelho mais claro + tracejado (comparativo com tom “de alerta”) */
const CHART_STROKE_ANTERIOR = '#f87171';

function chartYDomain(rows: { atualMil: number; anteriorMil: number }[]): [number, number] {
  if (rows.length === 0) return [0, 1];
  const vals = rows.flatMap((r) => [r.atualMil, r.anteriorMil]);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max === min) {
    const pad = Math.max(Math.abs(max) * 0.08, 0.5);
    return [Math.max(0, min - pad), max + pad];
  }
  const span = max - min;
  const pad = Math.max(span * 0.1, 0.05);
  const floor = min - pad;
  const ceil = max + pad;
  return [Math.max(0, floor), ceil];
}

const fmtMoney = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Reais em algarismos com separador de milhar pt-BR (ex.: 1000 → 1.000). */
function fmtContabilReais(reais: number): string {
  return Math.round(reais).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

const PRODUCT_META: Record<
  ProdutoExpressoId,
  {
    producaoLabel: string;
    chartLabel: string;
    detalheLabel: string;
    valueMode: 'currency' | 'quantity';
    icon: (className: string) => React.ReactNode;
  }
> = {
  consignado: {
    producaoLabel: 'Produção (R$)',
    chartLabel: 'Evolução da produção (R$ mil)',
    detalheLabel: 'Detalhe — linhas',
    valueMode: 'currency',
    icon: (className) => <Banknote className={className} />,
  },
  lime: {
    producaoLabel: 'Produção (R$)',
    chartLabel: 'Evolução da produção (R$ mil)',
    detalheLabel: 'Detalhe — subprodutos',
    valueMode: 'currency',
    icon: (className) => <CreditCard className={className} />,
  },
  contas: {
    producaoLabel: 'Produção (QTD)',
    chartLabel: 'Evolução da produção (QTD)',
    detalheLabel: 'Detalhe — subprodutos',
    valueMode: 'quantity',
    icon: (className) => <Wallet className={className} />,
  },
  seguros: {
    producaoLabel: 'Produção (QTD)',
    chartLabel: 'Evolução da produção (QTD)',
    detalheLabel: 'Detalhe — subprodutos',
    valueMode: 'quantity',
    icon: (className) => <Shield className={className} />,
  },
};

function productIcon(id: ProdutoExpressoResumo['id']) {
  const cls = 'h-5 w-5 shrink-0';
  return PRODUCT_META[id].icon(cls);
}

function formatProductValue(id: ProdutoExpressoId, value: number): string {
  return PRODUCT_META[id].valueMode === 'currency' ? fmtMoney(value) : fmtContabilReais(value);
}

interface ExpressoProductCockpitProps {
  produtos: ProdutoExpressoResumo[];
  onVerLojasQueda: () => void;
  onVerAnaliseCompleta?: () => void;
}

const ExpressoProductCockpit: React.FC<ExpressoProductCockpitProps> = ({
  produtos,
  onVerLojasQueda,
  onVerAnaliseCompleta,
}) => {
  const [index, setIndex] = useState(0);
  const [periodo, setPeriodo] = useState<PeriodoEvolucaoId>('30d');

  useEffect(() => {
    setIndex(0);
  }, [produtos]);

  const n = produtos.length;
  const safeIndex = n === 0 ? 0 : ((index % n) + n) % n;
  const p = produtos[safeIndex] ?? null;

  const chartData = useMemo(() => {
    if (!p) return [];
    return p.evolucaoPorPeriodo[periodo].map((row) => ({
      ...row,
      name: row.label,
    }));
  }, [p, periodo]);

  const yDomain = useMemo(() => chartYDomain(chartData), [chartData]);

  if (!p) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-6 text-center text-sm text-slate-500">
        Nenhum produto disponível para esta região.
      </div>
    );
  }

  const up = p.variacaoPct >= 0;
  const barTone =
    p.statusSemantico === 'critico'
      ? 'bg-red-500'
      : p.variacaoPct < 0
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  const prev = () => setIndex((i) => (n <= 1 ? i : (i - 1 + n) % n));
  const next = () => setIndex((i) => (n <= 1 ? i : (i + 1) % n));
  const producaoLabel = PRODUCT_META[p.id].producaoLabel;
  const chartLabel = PRODUCT_META[p.id].chartLabel;
  const detalheLabel = PRODUCT_META[p.id].detalheLabel;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-3 pt-3">

        <div className="mt-3 flex items-center gap-2 pb-3">
          <button
            type="button"
            onClick={prev}
            disabled={n <= 1}
            className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Produto anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-3">
            <span className={p.statusSemantico === 'critico' ? 'text-red-600' : 'text-slate-600'}>
              {productIcon(p.id)}
            </span>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold text-slate-900">{p.nome}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[p.statusSemantico]}`}
            >
              {STATUS_LABEL[p.statusSemantico]}
            </span>
          </div>
          <button
            type="button"
            onClick={next}
            disabled={n <= 1}
            className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Próximo produto"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 px-1 py-3">
        <div className="px-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{producaoLabel}</p>
          <p className="mt-1 text-lg font-bold tabular-nums leading-none text-slate-900">
            {p.producaoMes > 0 ? fmtContabilReais(p.producaoMes) : '—'}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">{p.lojasAtivas} lojas produzindo</p>
        </div>
        <div className="px-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Variação</p>
          <p
            className={`mt-1 flex items-center justify-center gap-0.5 text-lg font-bold tabular-nums leading-none ${
              up ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            <span>
              {up ? '↑' : '↓'}{' '}
              {Math.abs(p.variacaoPct).toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1,
              })}
              %
            </span>
          </p>
          <p className="mt-1 text-[10px] text-slate-500">vs mês anterior</p>
        </div>
        <div className="px-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Participação</p>
          <p className="mt-1 text-lg font-bold tabular-nums leading-none text-slate-900">
            {p.participacaoPct.toLocaleString('pt-BR', {
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            })}
            %
          </p>
          <p className="mt-1 text-[10px] text-slate-500">do total da região</p>
          <div className="mx-auto mt-2 h-1 max-w-[100px] overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${barTone}`}
              style={{ width: `${Math.min(100, Math.max(0, p.participacaoPct))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 px-3 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-800">{chartLabel}</p>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {PERIODOS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriodo(id)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  periodo === id
                    ? 'bg-sky-100 text-sky-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={(v: number) =>
                  Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                }
              />
              <Tooltip
                formatter={(value: number) =>
                  `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
                }
                labelFormatter={(l) => l}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="atualMil"
                name="Mês atual"
                stroke={CHART_STROKE_ATUAL}
                strokeWidth={2.25}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="anteriorMil"
                name="Mês anterior"
                stroke={CHART_STROKE_ANTERIOR}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mx-3 mb-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5">
        <div className="flex gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-950">Principais destaques</p>
            <p className="mt-1 text-[11px] leading-snug text-amber-950/90">{p.insightDestaque}</p>
            <button
              type="button"
              onClick={onVerAnaliseCompleta ?? onVerLojasQueda}
              className="mt-2 text-[11px] font-semibold text-sky-700 hover:text-sky-900"
            >
              Ver análise completa &gt;
            </button>
          </div>
        </div>
      </div>

      {p.subprodutos.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {detalheLabel}
          </p>
          <ul className="mt-2 space-y-2">
            {p.subprodutos.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-xs shadow-sm"
              >
                {s.valorLegenda ? (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-800">{s.nome}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {s.valorLegenda}
                      </p>
                      <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
                        {formatProductValue(p.id, s.producaoMes)}
                      </p>
                      {typeof s.quantidade === 'number' && s.quantidadeLegenda && (
                        <>
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {s.quantidadeLegenda}
                          </p>
                          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
                            {fmtContabilReais(s.quantidade)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-slate-800">{s.nome}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        {s.lojas} lojas
                      </span>
                      <span className="tabular-nums font-semibold text-slate-900">
                        {formatProductValue(p.id, s.producaoMes)}
                      </span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ExpressoProductCockpit;
