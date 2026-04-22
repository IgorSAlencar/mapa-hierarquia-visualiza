import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronUp, Minimize2, X } from 'lucide-react';
import type {
  MunicipalityProductivityRow,
  ProdutoExpressoId,
  ProdutoExpressoResumo,
} from '@/lib/expressoRegionMock';

interface ExpressoBottomSheetProps {
  open: boolean;
  products: ProdutoExpressoResumo[];
  selectedProduct: ProdutoExpressoId | null;
  rows: MunicipalityProductivityRow[];
  scope: 'estado' | 'municipio';
  showMunicipalityScope: boolean;
  onScopeChange: (scope: 'estado' | 'municipio') => void;
  rightInsetClass?: string;
  onClose: () => void;
  onSelectProduct: (id: ProdutoExpressoId) => void;
  onBackToCards: () => void;
  choroplethEnabled: boolean;
  onChoroplethEnabledChange: (enabled: boolean) => void;
  canUseChoropleth: boolean;
  choroplethModeLabel?: string;
  /** Quando true, o pai posiciona o bloco; aqui só ocupa a largura (ex.: stack com legenda). */
  dock?: boolean;
}

const fmtMoney = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fmtPct = (n: number) =>
  `${n >= 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

const ExpressoBottomSheet: React.FC<ExpressoBottomSheetProps> = ({
  open,
  products,
  selectedProduct,
  rows,
  scope,
  showMunicipalityScope,
  onScopeChange,
  rightInsetClass = 'right-0',
  onClose,
  onSelectProduct,
  onBackToCards,
  choroplethEnabled,
  onChoroplethEnabledChange,
  canUseChoropleth,
  choroplethModeLabel,
  dock = false,
}) => {
  const outerClass = dock
    ? 'pointer-events-none w-full min-w-0'
    : `pointer-events-none absolute bottom-0 left-0 z-30 ${rightInsetClass}`;
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!open) setMinimized(false);
  }, [open]);

  useEffect(() => {
    if (selectedProduct == null) setMinimized(false);
  }, [selectedProduct]);

  if (!open) return null;

  const selected = products.find((p) => p.id === selectedProduct) ?? null;

  if (minimized && selected) {
    return (
      <div className={outerClass}>
        <div className="pointer-events-auto w-full overflow-hidden rounded-t-2xl border border-slate-200/90 bg-slate-50/98 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              onClick={() => setMinimized(false)}
              title="Restaurar painel"
              aria-label="Restaurar painel de produtividade"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-slate-200 hover:bg-white/80"
            >
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate text-sm font-semibold text-slate-800">{selected.nome}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Fechar"
              aria-label="Fechar painel de produtividade"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
      <div className="pointer-events-auto w-full overflow-hidden rounded-t-2xl border border-slate-200/90 bg-slate-50/98 shadow-2xl backdrop-blur-md">
        {!selected ? (
          <div className="p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Produtos
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {products.map((p) => {
                const up = p.variacaoPct >= 0;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectProduct(p.id)}
                      className="flex-1 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <p className="text-sm font-semibold text-slate-900">{p.nome}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {fmtMoney(p.producaoMes)} · {p.lojas} lojas
                      </p>
                      <span
                        className={`mt-1 inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          up ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {fmtPct(p.variacaoPct)}
                      </span>
                    </button>
                    <div className="flex justify-center border-t border-slate-100 bg-slate-50/90 py-1.5">
                      <button
                        type="button"
                        disabled={!canUseChoropleth}
                        title={canUseChoropleth ? 'Coropleto por produção no mapa' : 'Coropleto indisponível'}
                        aria-label={canUseChoropleth ? 'Ativar coropleto por produção' : 'Coropleto indisponível'}
                        onClick={() => {
                          onSelectProduct(p.id);
                          onScopeChange(showMunicipalityScope ? 'municipio' : 'estado');
                          onChoroplethEnabledChange(true);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-sky-500/70 bg-white text-sky-700 shadow-sm transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-60"
                      >
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-600" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-2.5">
            <div className="mb-3 rounded-xl border border-slate-200/95 bg-white p-2.5 shadow-sm shadow-slate-900/5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="order-1 flex justify-center sm:order-2 sm:flex-1 sm:justify-center">
                  <div
                    className="inline-flex rounded-lg border border-slate-200 bg-slate-50/90 p-0.5 shadow-inner"
                    role="group"
                    aria-label="Agrupamento dos dados"
                  >
                    <button
                      type="button"
                      onClick={() => onScopeChange('estado')}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        scope === 'estado'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Estado
                    </button>
                    <button
                      type="button"
                      onClick={() => onScopeChange('municipio')}
                      disabled={!showMunicipalityScope}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        scope === 'municipio'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      Município
                    </button>
                  </div>
                </div>

                <div className="order-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 sm:order-3 sm:border-t-0 sm:border-l sm:border-slate-200 sm:pl-3 sm:pt-0">
                  <span className="text-[11px] font-medium text-slate-500 sm:hidden">Mapa por produção</span>
                  <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">
                    Mapa
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
                    <button
                      type="button"
                      disabled={!canUseChoropleth}
                      title={
                        choroplethEnabled
                          ? 'Desligar coropleto no mapa'
                          : 'Ligar coropleto por produção no mapa'
                      }
                      aria-label={choroplethEnabled ? 'Desligar coropleto' : 'Ligar coropleto por produção'}
                      onClick={() => onChoroplethEnabledChange(!choroplethEnabled)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                        choroplethEnabled && canUseChoropleth
                          ? 'border-sky-600 bg-sky-600 text-white shadow-md shadow-sky-900/15'
                          : 'border-slate-300 bg-white text-slate-500 hover:border-sky-300 hover:bg-sky-50/80'
                      } disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-45 disabled:hover:bg-white`}
                    >
                      <span
                        className={`h-3 w-3 rounded-full ${
                          choroplethEnabled && canUseChoropleth ? 'bg-white' : 'bg-slate-400'
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMinimized(true)}
                      title="Minimizar painel"
                      aria-label="Minimizar painel de produtividade"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      title="Fechar painel"
                      aria-label="Fechar painel de produtividade"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onBackToCards}
                  className="order-3 inline-flex h-9 w-full shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50/90 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 sm:order-1 sm:w-auto sm:justify-start sm:px-2.5"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0 opacity-80" />
                  Voltar
                </button>
              </div>
            </div>

            <div className="max-h-[24vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">{scope === 'estado' ? 'Estado' : 'Município'}</th>
                    <th className="px-2 py-2 font-semibold">Lojas</th>
                    <th className="px-2 py-2 font-semibold">Produção</th>
                    <th className="px-2 py-2 font-semibold">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${selected.id}-${row.municipio}`} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-medium text-slate-800">{row.municipio}</td>
                      <td className="px-2 py-2 text-slate-700">{row.lojas}</td>
                      <td className="px-2 py-2 tabular-nums text-slate-700">{fmtMoney(row.producaoMes)}</td>
                      <td
                        className={`px-2 py-2 tabular-nums font-semibold ${
                          row.variacaoPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {fmtPct(row.variacaoPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpressoBottomSheet;
