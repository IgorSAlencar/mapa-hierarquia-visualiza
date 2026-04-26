import React, { useEffect, useState } from 'react';
import { Building2, Crown, MapPin, ShoppingCart, Store, X } from 'lucide-react';
import ExpressoProductCockpit from '@/components/ExpressoProductCockpit';
import type { ExpressoRegionMetrics } from '@/lib/expressoRegionMock';

interface ExpressoStatePanelProps {
  regionName: string;
  cityFocus: string | null;
  metrics: ExpressoRegionMetrics;
  onClose: () => void;
  onOpenProductivitySheet: () => void;
}

const ExpressoStatePanel: React.FC<ExpressoStatePanelProps> = ({
  regionName,
  cityFocus,
  metrics,
  onClose,
  onOpenProductivitySheet,
}) => {
  const [animateIn, setAnimateIn] = useState(false);
  const lojasBreakdown = buildLojasBreakdown(metrics.lojas, metrics.lojasAtivas);
  /** Com município selecionado: destaque no município; estado no chip. Só estado: título é o estado. */
  const headerTitle = cityFocus?.trim() ? cityFocus.trim() : regionName;
  const stateContextLabel = cityFocus?.trim() && regionName?.trim() ? regionName.trim() : null;

  useEffect(() => {
    setAnimateIn(false);
    const timer = window.setTimeout(() => setAnimateIn(true), 12);
    return () => window.clearTimeout(timer);
  }, [regionName, cityFocus]);

  return (
    <div
      className={`absolute inset-y-0 right-0 z-20 w-[min(96vw,480px)] transform transition-all duration-500 ease-out pointer-events-auto ${
        animateIn ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      }`}
      role="dialog"
      aria-labelledby="expresso-panel-title"
    >
      <div className="flex h-full max-h-full flex-col overflow-hidden rounded-l-2xl border border-slate-200/90 bg-slate-50/98 shadow-2xl backdrop-blur-md">
        <header className="shrink-0 border-b border-slate-200 bg-gradient-to-br from-slate-700 to-slate-600 px-4 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">

              <h2 id="expresso-panel-title" className="mt-1 truncate text-lg font-semibold leading-tight">
                {headerTitle}
              </h2>
              <p className="mt-1 text-xs leading-snug text-slate-200/90">
                {stateContextLabel
                  ? `Performance comercial · ${stateContextLabel}`
                  : 'Performance comercial na região'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-white/90 transition-colors hover:bg-white/10"
                aria-label="Fechar painel"
              >
                <X className="h-4 w-4" />
              </button>
              {stateContextLabel && (
                <p
                  className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/95"
                  title={`Estado: ${stateContextLabel}`}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">{stateContextLabel}</span>
                </p>
              )}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section aria-label="Indicadores principais">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Indicadores principais
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <KpiCard
                icon={<Building2 className="h-4 w-4 text-slate-600" />}
                label="Agências"
                value={String(metrics.agencias)}
              />
              <KpiCard
                icon={<Store className="h-4 w-4 text-slate-600" />}
                label="PAs"
                value={String(metrics.pas)}
              />
              <KpiCard
                icon={<MapPin className="h-4 w-4 text-slate-600" />}
                label="Praças Presenças"
                value={String(metrics.pracasPresencas)}
              />
              <LojasBreakdownCard total={metrics.lojas} ativas={metrics.lojasAtivas} groups={lojasBreakdown} />
            </div>
          </section>

          <section aria-label="Desempenho por produto">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Desempenho por produto
            </p>
            <ExpressoProductCockpit
              produtos={metrics.produtos}
              onVerLojasQueda={onOpenProductivitySheet}
              onVerAnaliseCompleta={onOpenProductivitySheet}
            />
          </section>

          <button
            type="button"
            onClick={onOpenProductivitySheet}
            className="w-full rounded-xl border border-slate-300 bg-slate-200/70 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-200"
          >
            Ver produtividade por município
          </button>
        </div>
      </div>
    </div>
  );
};

function buildLojasBreakdown(lojas: number, lojasAtivas: number) {
  const groups = [
    { id: 'varejo', label: 'Varejo', ratio: 0.49, activeRatio: 0.48, color: 'text-sky-600', iconTone: 'bg-sky-50' },
    {
      id: 'grandes-redes',
      label: 'Grandes Redes',
      ratio: 0.28,
      activeRatio: 0.28,
      color: 'text-emerald-700',
      iconTone: 'bg-emerald-50',
    },
    {
      id: 'exclusivo',
      label: 'Exclusivo',
      ratio: 0.13,
      activeRatio: 0.13,
      color: 'text-violet-600',
      iconTone: 'bg-violet-50',
    },
    {
      id: 'casas-bahia',
      label: 'Casas Bahia',
      ratio: 0.1,
      activeRatio: 0.11,
      color: 'text-rose-500',
      iconTone: 'bg-rose-50',
    },
  ] as const;

  const split = (total: number, key: 'ratio' | 'activeRatio') => {
    const normalizedTotal = Math.max(0, Math.round(total));
    let remaining = normalizedTotal;
    return groups.map((group, index) => {
      const isLast = index === groups.length - 1;
      const value = isLast ? remaining : Math.max(0, Math.round(normalizedTotal * group[key]));
      if (!isLast) remaining -= value;
      return value;
    });
  };

  const totalSplit = split(lojas, 'ratio');
  const activeSplit = split(lojasAtivas, 'activeRatio');

  return groups.map((group, index) => ({
    ...group,
    total: totalSplit[index],
    ativas: activeSplit[index],
  }));
}

function fmtInt(n: number) {
  return Math.max(0, Math.round(n)).toLocaleString('pt-BR');
}

function LojasBreakdownCard({
  total,
  ativas,
  groups,
}: {
  total: number;
  ativas: number;
  groups: Array<{
    id: string;
    label: string;
    total: number;
    ativas: number;
    color: string;
    iconTone: string;
  }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm sm:col-span-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium leading-tight text-slate-600">Lojas</span>
        <Store className="h-4 w-4 text-slate-600" />
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{fmtInt(total)}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{fmtInt(ativas)} ativas</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
        {groups.map((group) => (
          <div key={group.id} className="flex min-h-[72px] flex-col justify-between py-1">
            <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-1.5">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${group.iconTone}`}>
                {group.id === 'varejo' ? (
                  <ShoppingCart className="h-4 w-4 text-sky-600" />
                ) : group.id === 'grandes-redes' ? (
                  <Building2 className="h-4 w-4 text-emerald-700" />
                ) : group.id === 'exclusivo' ? (
                  <Crown className="h-4 w-4 text-violet-600" />
                ) : (
                  <span className="text-sm font-bold leading-none text-rose-500">B</span>
                )}
              </span>
              <p className="min-w-0 break-words text-[11px] font-medium leading-snug text-slate-700">
                {group.label}
              </p>
            </div>
            <div className="mt-2 grid h-[34px] grid-cols-[1fr_auto_1fr] items-center gap-1.5 text-base font-semibold tabular-nums">
              <span className="text-right text-slate-900">{fmtInt(group.total)}</span>
              <span className="shrink-0 text-slate-300">|</span>
              <span className={`text-left ${group.color}`}>{fmtInt(group.ativas)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Colunas com largura mínima uniforme; borda à esquerda + padding para não sobrepor texto */}
      <div className="mt-3 hidden min-w-0 sm:grid sm:grid-cols-[repeat(4,minmax(6.75rem,1fr))] sm:gap-0">
        {groups.map((group, index) => (
          <div
            key={group.id}
            className={`grid min-h-[76px] min-w-0 grid-rows-[1fr_auto] py-1 ${
              index > 0 ? 'border-l border-slate-200 pl-3 pr-2' : 'pr-3'
            }`}
          >
            <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-1.5 pt-0.5">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${group.iconTone}`}>
                {group.id === 'varejo' ? (
                  <ShoppingCart className="h-4 w-4 text-sky-600" />
                ) : group.id === 'grandes-redes' ? (
                  <Building2 className="h-4 w-4 text-emerald-700" />
                ) : group.id === 'exclusivo' ? (
                  <Crown className="h-4 w-4 text-violet-600" />
                ) : (
                  <span className="text-sm font-bold leading-none text-rose-500">B</span>
                )}
              </span>
              <p className="min-w-0 break-words pr-1 text-[11px] font-medium leading-snug text-slate-700">
                {group.label}
              </p>
            </div>
            <div className="mt-auto grid h-[34px] grid-cols-[1fr_auto_1fr] items-center gap-1.5 text-base font-semibold tabular-nums">
              <span className="text-right text-slate-900">{fmtInt(group.total)}</span>
              <span className="shrink-0 text-slate-300">|</span>
              <span className={`min-w-0 text-left ${group.color}`}>{fmtInt(group.ativas)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  className = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium leading-tight text-slate-600">{label}</span>
        <span className="shrink-0">{icon}</span>
      </div>
      <p className="mt-1.5 text-base font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default ExpressoStatePanel;
