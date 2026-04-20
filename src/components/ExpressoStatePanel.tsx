import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Store,
  X,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ExpressoRegionMetrics, ProdutoExpressoId } from '@/lib/expressoRegionMock';

interface ExpressoStatePanelProps {
  regionName: string;
  cityFocus: string | null;
  metrics: ExpressoRegionMetrics;
  onClose: () => void;
  showLojasOnMap: boolean;
  onShowLojasOnMapChange: (value: boolean) => void;
  onOpenProductivitySheet: () => void;
}

const fmtMoney = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fmtPct = (n: number) =>
  `${n >= 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

const ExpressoStatePanel: React.FC<ExpressoStatePanelProps> = ({
  regionName,
  cityFocus,
  metrics,
  onClose,
  showLojasOnMap,
  onShowLojasOnMapChange,
  onOpenProductivitySheet,
}) => {
  const [expandedProduct, setExpandedProduct] = useState<ProdutoExpressoId | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    setExpandedProduct(null);
  }, [regionName]);

  useEffect(() => {
    setAnimateIn(false);
    const timer = window.setTimeout(() => setAnimateIn(true), 12);
    return () => window.clearTimeout(timer);
  }, [regionName, cityFocus]);

  const toggleProduct = (id: ProdutoExpressoId) => {
    setExpandedProduct((prev) => (prev === id ? null : id));
  };

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
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <div className="min-w-0">
              <Label htmlFor="toggle-lojas-mapa" className="text-xs font-medium text-slate-800">
                Exibir lojas no mapa
              </Label>
              <p className="text-[11px] leading-snug text-slate-500">
                Pontos clusterizados ao ativar — mapa permanece interativo
              </p>
            </div>
            <Switch
              id="toggle-lojas-mapa"
              checked={showLojasOnMap}
              onCheckedChange={onShowLojasOnMapChange}
            />
          </div>

          <section aria-label="Indicadores principais">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Indicadores principais
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <KpiCard
                icon={<Building2 className="h-4 w-4 text-slate-600" />}
                label="Agências"
                value={String(metrics.agencias)}
              />
              <KpiCard
                icon={<Store className="h-4 w-4 text-slate-600" />}
                label="Lojas"
                value={String(metrics.lojas)}
              />
            </div>
          </section>

          <section aria-label="Resumo por produto">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Resumo por produto
            </p>
            <div className="space-y-2">
              {metrics.produtos.map((p) => {
                const open = expandedProduct === p.id;
                const up = p.variacaoPct >= 0;
                const hasDetail = p.subprodutos.length > 0;
                const resumoLinha =
                  p.id === 'contas' || p.id === 'lime'
                    ? `${p.lojas} lojas`
                    : `${fmtMoney(p.producaoMes)} · ${p.lojas} lojas`;

                return (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
                  >
                    {hasDetail ? (
                      <button
                        type="button"
                        onClick={() => toggleProduct(p.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50/90"
                        aria-expanded={open}
                      >
                        <span className="text-slate-400">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{p.nome}</p>
                          <p className="text-[11px] text-slate-500">{resumoLinha}</p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            up ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                          }`}
                        >
                          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {fmtPct(p.variacaoPct)}
                        </span>
                      </button>
                    ) : (
                      <div className="flex w-full items-center gap-3 px-3 py-2.5">
                        <span className="w-4 shrink-0" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{p.nome}</p>
                          <p className="text-[11px] text-slate-500">{resumoLinha}</p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            up ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                          }`}
                        >
                          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {fmtPct(p.variacaoPct)}
                        </span>
                      </div>
                    )}
                    {hasDetail && (
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {p.id === 'consignado' ? 'Detalhe — linhas' : 'Detalhe — subprodutos'}
                            </p>
                            <ul className="space-y-2">
                              {p.subprodutos.map((s) => (
                                <li
                                  key={s.id}
                                  className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-xs"
                                >
                                  {s.valorLegenda ? (
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="font-medium text-slate-800">{s.nome}</p>
                                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-600 tabular-nums">
                                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                          {s.lojas} lojas
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                          {s.valorLegenda}
                                        </p>
                                        <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
                                          {fmtMoney(s.producaoMes)}
                                        </p>
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
                                          {fmtMoney(s.producaoMes)}
                                        </span>
                                      </span>
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
