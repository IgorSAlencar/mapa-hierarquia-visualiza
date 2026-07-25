import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Minus,
  Store,
  Trophy,
  X,
} from 'lucide-react';
import type {
  ProductionHeatmapMetric,
  ProductionHeatmapRow,
  ProductionHeatmapStoreRow,
  ProductionHeatmapStoresData,
} from '@/lib/mapDataApi';
import { fetchProductionHeatmapStores } from '@/lib/mapDataApi';
import {
  formatHeatmapPeriod,
  formatHeatmapValue,
  type ProductionHeatmapPanelSummary,
} from '@/components/navigator/ProductionHeatmapPanel';

/**
 * Lojas no mapa enquanto o painel está aberto.
 * `municipality = null` → escopo do estado (lista); com município → drill-down.
 */
export interface ProductionMunicipalityDetail {
  municipality: ProductionHeatmapRow | null;
  stores: ProductionHeatmapStoreRow[];
}

interface ProductionHeatmapStoresPanelProps {
  rows: ProductionHeatmapRow[];
  summary: ProductionHeatmapPanelSummary;
  metric: ProductionHeatmapMetric;
  period: number | null;
  /** "Brasil" ou o nome/UF do estado em foco. */
  contextLabel: string;
  /** UF do escopo (quando houver). Dispara carga das lojas do estado. */
  scopeUf?: string | null;
  onClose: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  /** Foca o município no mapa (quando disponível). */
  onSelectMunicipality?: (row: ProductionHeatmapRow) => void;
  /**
   * Lojas no mapa: estado na lista; município no drill-down.
   * `null` ao fechar o painel.
   */
  onMunicipalityDetailChange?: (detail: ProductionMunicipalityDetail | null) => void;
  /**
   * Pedido externo (ex.: botão Selecionar no popup do mapa) para abrir
   * o detalhe de um município. Usa `tick` para reaplicar o mesmo código.
   */
  municipalitySelectRequest?: { row: ProductionHeatmapRow; tick: number } | null;
}

function rankAccent(rank: number): {
  badge: string;
  bar: string;
} {
  if (rank === 1) {
    return {
      badge: 'bg-slate-800 text-white',
      bar: 'bg-teal-600',
    };
  }
  if (rank === 2) {
    return {
      badge: 'bg-slate-500 text-white',
      bar: 'bg-teal-500',
    };
  }
  if (rank === 3) {
    return {
      badge: 'bg-slate-400 text-white',
      bar: 'bg-teal-400',
    };
  }
  return {
    badge: 'bg-slate-100 text-slate-700',
    bar: 'bg-slate-400',
  };
}

/**
 * Painel lateral do mapa de produção: municípios do escopo e drill-down
 * das lojas do município selecionado.
 */
const ProductionHeatmapStoresPanel: React.FC<ProductionHeatmapStoresPanelProps> = ({
  rows,
  summary,
  metric,
  period,
  contextLabel,
  scopeUf = null,
  onClose,
  minimized = false,
  onMinimize,
  onRestore,
  onSelectMunicipality,
  onMunicipalityDetailChange,
  municipalitySelectRequest = null,
}) => {
  const [animateIn, setAnimateIn] = useState(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState<ProductionHeatmapRow | null>(
    null
  );
  const [storesData, setStoresData] = useState<ProductionHeatmapStoresData | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);
  const onMunicipalityDetailChangeRef = useRef(onMunicipalityDetailChange);
  onMunicipalityDetailChangeRef.current = onMunicipalityDetailChange;
  const onSelectMunicipalityRef = useRef(onSelectMunicipality);
  onSelectMunicipalityRef.current = onSelectMunicipality;
  const lastSelectRequestTickRef = useRef(0);
  const normalizedScopeUf = String(scopeUf ?? '').trim().toUpperCase() || null;

  useEffect(() => {
    setAnimateIn(false);
    const timer = window.setTimeout(() => setAnimateIn(true), 12);
    return () => window.clearTimeout(timer);
  }, [contextLabel, selectedMunicipality?.municipalityCode]);

  // Troca de escopo/período/métrica: volta à lista de municípios (dados já no heatmap).
  useEffect(() => {
    setSelectedMunicipality(null);
    setStoresData(null);
    setStoresError(null);
    onMunicipalityDetailChangeRef.current?.(null);
  }, [contextLabel, metric.id, period, normalizedScopeUf]);

  // Seleção vinda do popup do mapa ("Selecionar").
  useEffect(() => {
    if (!municipalitySelectRequest) return;
    if (municipalitySelectRequest.tick === lastSelectRequestTickRef.current) return;
    lastSelectRequestTickRef.current = municipalitySelectRequest.tick;
    const requested = municipalitySelectRequest.row;
    const fromList = rows.find(
      (row) => row.municipalityCode === requested.municipalityCode
    );
    const next = fromList ?? requested;
    setStoresError(null);
    setSelectedMunicipality(next);
    onSelectMunicipalityRef.current?.(next);
  }, [municipalitySelectRequest, rows]);

  // Lojas só no drill-down municipal (evita fetch gigante do UF ao abrir o painel —
  // esse request derrubava a API/sessão e mandava o usuário de volta ao login).
  useEffect(() => {
    if (!selectedMunicipality || !period || !metric.id) {
      setStoresData(null);
      setStoresLoading(false);
      if (!selectedMunicipality) {
        setStoresError(null);
        onMunicipalityDetailChangeRef.current?.(null);
      }
      return;
    }
    const controller = new AbortController();
    setStoresLoading(true);
    setStoresError(null);
    void fetchProductionHeatmapStores(
      metric.id,
      period,
      { municipalityCode: selectedMunicipality.municipalityCode },
      controller.signal
    )
      .then((data) => {
        setStoresData(data);
        onMunicipalityDetailChangeRef.current?.({
          municipality: selectedMunicipality,
          stores: data.stores,
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStoresData(null);
        onMunicipalityDetailChangeRef.current?.({
          municipality: selectedMunicipality,
          stores: [],
        });
        setStoresError(
          error instanceof Error ? error.message : 'Falha ao carregar as lojas do município.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setStoresLoading(false);
      });
    return () => controller.abort();
  }, [selectedMunicipality, period, metric.id]);

  useEffect(() => {
    return () => onMunicipalityDetailChangeRef.current?.(null);
  }, []);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)),
    [rows]
  );

  const storeRows = useMemo(
    () => (selectedMunicipality ? storesData?.stores ?? [] : []),
    [selectedMunicipality, storesData]
  );

  const maxStoreValue = useMemo(
    () => Math.max(0, ...storeRows.map((store) => Number(store.value) || 0)),
    [storeRows]
  );
  const municipalityTotal = useMemo(() => {
    if (storeRows.length > 0) {
      return storeRows.reduce((sum, store) => sum + (Number(store.value) || 0), 0);
    }
    return Number(selectedMunicipality?.value) || 0;
  }, [storeRows, selectedMunicipality]);

  const openMunicipality = (row: ProductionHeatmapRow) => {
    setSelectedMunicipality(row);
    onSelectMunicipality?.(row);
  };

  const backToMunicipalities = () => {
    setSelectedMunicipality(null);
    setStoresData(null);
    setStoresError(null);
    onMunicipalityDetailChangeRef.current?.(null);
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="pointer-events-auto absolute right-0 top-[68%] z-20 flex -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-slate-200/90 bg-white/95 py-3 pl-3 pr-2.5 text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition-colors hover:bg-slate-50"
        aria-label="Reabrir painel de lojas"
        title="Reabrir painel de lojas"
      >
        <ChevronLeft className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
        <span className="max-w-[140px] truncate text-sm font-semibold leading-tight text-slate-900">
          {selectedMunicipality ? selectedMunicipality.municipalityName : 'Lojas'}
        </span>
      </button>
    );
  }

  const inStoresView = Boolean(selectedMunicipality);

  return (
    <div
      className={`pointer-events-auto absolute inset-y-0 right-0 z-20 w-[min(96vw,480px)] transform transition-all duration-500 ease-out ${
        animateIn ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      }`}
      role="dialog"
      aria-labelledby="production-stores-panel-title"
    >
      <div className="flex h-full max-h-full flex-col overflow-hidden rounded-l-2xl border border-slate-200/90 bg-slate-50/98 shadow-2xl backdrop-blur-md">
        <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {inStoresView ? (
                <button
                  type="button"
                  onClick={backToMunicipalities}
                  className="mb-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700 transition-colors hover:bg-slate-100"
                >
                  <ArrowLeft className="h-3 w-3" aria-hidden />
                  Municípios
                </button>
              ) : (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Mapa de produção
                </p>
              )}
              <h2
                id="production-stores-panel-title"
                className="mt-0.5 truncate text-lg font-semibold leading-tight text-slate-900"
              >
                {inStoresView
                  ? selectedMunicipality!.municipalityName
                  : 'Lojas por município'}
              </h2>
              <p className="mt-1 text-xs leading-snug text-slate-500">
                {inStoresView
                  ? `${selectedMunicipality!.uf} · ${metric.shortLabel || metric.label} · ${formatHeatmapPeriod(period)}`
                  : `${metric.label} · ${formatHeatmapPeriod(period)}`}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                {onMinimize ? (
                  <button
                    type="button"
                    onClick={onMinimize}
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Minimizar painel de lojas"
                    title="Minimizar painel"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fechar painel de lojas"
                  title="Fechar painel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p
                className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                title={`Escopo: ${contextLabel}`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
                <span className="truncate">
                  {inStoresView ? selectedMunicipality!.uf : contextLabel}
                </span>
              </p>
            </div>
          </div>
        </header>

        <div className="shrink-0 border-b border-slate-200 bg-white/80 px-4 py-3">
          {!inStoresView ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-center shadow-sm">
                <p className="truncate text-xs font-semibold tabular-nums text-slate-900">
                  {formatHeatmapValue(summary.value, metric.unit)}
                </p>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  Produção
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-center shadow-sm">
                <p className="text-xs font-semibold tabular-nums text-slate-900">
                  {summary.producingStores.toLocaleString('pt-BR')}
                </p>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  Lojas
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-center shadow-sm">
                <p className="text-xs font-semibold tabular-nums text-slate-900">
                  {summary.municipalitiesWithData.toLocaleString('pt-BR')}
                </p>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  Municípios
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-medium text-slate-600">Produção do município</p>
                <p className="mt-1.5 truncate text-base font-semibold tabular-nums tracking-tight text-slate-900">
                  {formatHeatmapValue(municipalityTotal, metric.unit)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-medium text-slate-600">Lojas no município</p>
                <p className="mt-1.5 text-base font-semibold tabular-nums tracking-tight text-slate-900">
                  {(storeRows.length > 0
                    ? storeRows.length
                    : storesData?.summary.storeCount ??
                      (Number(selectedMunicipality?.producingStores) || 0)
                  ).toLocaleString('pt-BR')}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {(storeRows.length > 0
                    ? storeRows.filter((store) => store.hasProduction).length
                    : storesData?.summary.producingStores ??
                      (Number(selectedMunicipality?.producingStores) || 0)
                  ).toLocaleString('pt-BR')}{' '}
                  com produção
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!inStoresView ? (
            sortedRows.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-500">
                Nenhum município com produção no escopo atual.
              </p>
            ) : (
              <ul className="space-y-1.5" aria-label="Municípios com produção">
                {sortedRows.map((row) => (
                  <li key={`${row.municipalityCode}-${row.uf}`}>
                    <button
                      type="button"
                      onClick={() => openMunicipality(row)}
                      className="group flex w-full items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 shadow-sm transition-colors hover:bg-slate-50"
                      title={`Ver lojas de ${row.municipalityName}`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Store className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[12px] font-semibold leading-tight text-slate-900">
                          {row.municipalityName}
                          <span className="ml-1 text-[10px] font-medium text-slate-400">
                            {row.uf}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">
                          {Number(row.producingStores).toLocaleString('pt-BR')}{' '}
                          {Number(row.producingStores) === 1 ? 'loja' : 'lojas'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-800">
                        {formatHeatmapValue(Number(row.value) || 0, metric.unit)}
                      </span>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600"
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : storesLoading ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-2 py-16 text-slate-600"
              role="status"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-xs font-medium">Carregando lojas…</p>
            </div>
          ) : storesError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-center text-xs text-red-700">
              {storesError}
            </p>
          ) : storeRows.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-500">
              Nenhuma loja encontrada neste município para o período.
            </p>
          ) : (
            <div className="space-y-3" aria-label="Lojas do município">
              <div className="flex items-center gap-2 px-0.5">
                <Trophy className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Ranking por {metric.shortLabel || 'produção'}
                </p>
              </div>
              <ul className="space-y-2">
                {storeRows.map((store, index) => (
                  <StoreRankCard
                    key={store.chaveLoja}
                    store={store}
                    rank={index + 1}
                    metric={metric}
                    maxValue={maxStoreValue}
                    municipalityTotal={municipalityTotal}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function StoreRankCard({
  store,
  rank,
  metric,
  maxValue,
  municipalityTotal,
}: {
  store: ProductionHeatmapStoreRow;
  rank: number;
  metric: ProductionHeatmapMetric;
  maxValue: number;
  municipalityTotal: number;
}) {
  const accent = rankAccent(rank);
  const value = Number(store.value) || 0;
  const barWidth =
    maxValue > 0 ? Math.max(value > 0 ? 6 : 0, Math.round((value / maxValue) * 100)) : 0;
  const share =
    municipalityTotal > 0 ? Math.round((value / municipalityTotal) * 1000) / 10 : 0;

  return (
    <li className="rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums ${accent.badge}`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">
                {store.nome}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                #{store.chaveLoja}
                {store.nomeAg ? ` · ${store.nomeAg}` : store.codAg ? ` · Ag. ${store.codAg}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-semibold tabular-nums leading-none text-slate-900">
                {formatHeatmapValue(value, metric.unit)}
              </p>
              {municipalityTotal > 0 ? (
                <p className="mt-0.5 text-[9px] font-medium tabular-nums text-slate-400">
                  {share.toLocaleString('pt-BR')}% do município
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${accent.bar}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

export default ProductionHeatmapStoresPanel;
