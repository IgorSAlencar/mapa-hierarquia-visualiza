import React from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft } from 'lucide-react';
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
}) => {
  if (!open) return null;

  const selected = products.find((p) => p.id === selectedProduct) ?? null;

  return (
    <div className={`pointer-events-none absolute bottom-0 left-0 z-30 ${rightInsetClass}`}>
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
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectProduct(p.id)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-slate-50"
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
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => onScopeChange('estado')}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    scope === 'estado' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Estado
                </button>
                <button
                  type="button"
                  onClick={() => onScopeChange('municipio')}
                  disabled={!showMunicipalityScope}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    scope === 'municipio'
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Município
                </button>
              </div>
              {!showMunicipalityScope && (
                <span className="text-[11px] text-slate-500">Selecione um estado para visão municipal</span>
              )}
            </div>
            <div className="mb-2">
              <button
                type="button"
                onClick={onBackToCards}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </button>
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
