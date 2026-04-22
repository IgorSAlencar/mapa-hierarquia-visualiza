import React, { useEffect, useState } from 'react';
import { Building2, MapPin, Store, X } from 'lucide-react';
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

  useEffect(() => {
    setAnimateIn(false);
    const timer = window.setTimeout(() => setAnimateIn(true), 12);
    return () => window.clearTimeout(timer);
  }, [regionName, cityFocus]);

  return (
    <div
      className={`absolute inset-y-0 right-0 z-20 w-[min(96vw,420px)] transform transition-all duration-500 ease-out pointer-events-auto ${
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
                {regionName}
              </h2>
              <p className="mt-1 text-xs leading-snug text-slate-200/90">
                Performance comercial na região
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
              {cityFocus && (
                <p className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/95">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{cityFocus}</span>
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
              <KpiCard
                icon={<Store className="h-4 w-4 text-slate-600" />}
                label="Lojas"
                value={String(metrics.lojas)}
                hint={`${metrics.lojasAtivas} ativas`}
                className="sm:col-span-3"
              />
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

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Fechar painel
          </button>
        </div>
      </div>
    </div>
  );
};

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
