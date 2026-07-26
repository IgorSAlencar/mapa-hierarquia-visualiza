import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
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

const STATE_STORES_PAGE_SIZE = 100;

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
  /** Destaca temporariamente a loja no mapa enquanto card recebe hover/foco. */
  onHoverStore?: (store: ProductionHeatmapStoreRow | null) => void;
  /** Seleciona a loja no mapa; `null` remove seleção atual. */
  onSelectStore?: (store: ProductionHeatmapStoreRow | null) => void;
  /** Loja selecionada pelo painel ou pelo próprio mapa. */
  selectedStoreKey?: string | null;
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
  onHoverStore,
  onSelectStore,
  selectedStoreKey = null,
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
  const [stateStoresOpen, setStateStoresOpen] = useState(false);
  const [stateStoresPage, setStateStoresPage] = useState(1);
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
    setStateStoresOpen(false);
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
    setStateStoresOpen(false);
    setStoresError(null);
    setSelectedMunicipality(next);
    onSelectMunicipalityRef.current?.(next);
  }, [municipalitySelectRequest, rows]);

  // Município carrega ao abrir o drill-down. Estado carrega somente após ação explícita:
  // evita request grande de UF ao abrir o painel.
  useEffect(() => {
    const municipalityCode = selectedMunicipality?.municipalityCode ?? null;
    const stateUf = stateStoresOpen ? normalizedScopeUf : null;
    if ((!municipalityCode && !stateUf) || !period || !metric.id) {
      setStoresData(null);
      setStoresLoading(false);
      if (!municipalityCode && !stateUf) {
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
      municipalityCode ? { municipalityCode } : { uf: stateUf! },
      controller.signal
    )
      .then((data) => {
        setStoresData(data);
        const visibleStores = selectedMunicipality
          ? data.stores
          : data.stores.filter((store) => store.hasProduction);
        onMunicipalityDetailChangeRef.current?.({
          municipality: selectedMunicipality ?? null,
          stores: visibleStores,
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStoresData(null);
        onMunicipalityDetailChangeRef.current?.({
          municipality: selectedMunicipality ?? null,
          stores: [],
        });
        setStoresError(
          error instanceof Error
            ? error.message
            : `Falha ao carregar as lojas do ${municipalityCode ? 'município' : 'estado'}.`
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setStoresLoading(false);
      });
    return () => controller.abort();
  }, [selectedMunicipality, stateStoresOpen, normalizedScopeUf, period, metric.id]);

  useEffect(() => {
    return () => onMunicipalityDetailChangeRef.current?.(null);
  }, []);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)),
    [rows]
  );

  const inStateStoresView = stateStoresOpen && !selectedMunicipality;
  const inStoresView = Boolean(selectedMunicipality || inStateStoresView);
  const storeRows = useMemo(
    () =>
      inStoresView
        ? (storesData?.stores ?? []).filter(
            (store) => !inStateStoresView || store.hasProduction
          )
        : [],
    [inStoresView, inStateStoresView, storesData]
  );

  const maxStoreValue = useMemo(
    () => Math.max(0, ...storeRows.map((store) => Number(store.value) || 0)),
    [storeRows]
  );
  const stateStoresPageCount = Math.max(
    1,
    Math.ceil(storeRows.length / STATE_STORES_PAGE_SIZE)
  );
  const displayedStoreRows = useMemo(() => {
    if (!inStateStoresView) return storeRows;
    const start = (stateStoresPage - 1) * STATE_STORES_PAGE_SIZE;
    return storeRows.slice(start, start + STATE_STORES_PAGE_SIZE);
  }, [inStateStoresView, stateStoresPage, storeRows]);

  useEffect(() => {
    setStateStoresPage((current) => Math.min(current, stateStoresPageCount));
  }, [stateStoresPageCount]);

  const municipalityTotal = useMemo(() => {
    if (storeRows.length > 0) {
      return storeRows.reduce((sum, store) => sum + (Number(store.value) || 0), 0);
    }
    return Number(selectedMunicipality?.value) || 0;
  }, [storeRows, selectedMunicipality]);

  const municipalityStoreTotal =
    inStateStoresView
      ? storesData?.summary.storeCount ?? summary.storeCount
      : storeRows.length > 0
      ? storeRows.length
      : storesData?.summary.storeCount ??
        (Number(selectedMunicipality?.producingStores) || 0);
  const municipalityStoresWithProduction =
    storeRows.length > 0
      ? storeRows.filter((store) => store.hasProduction).length
      : storesData?.summary.producingStores ??
        (Number(selectedMunicipality?.producingStores) || 0);
  const municipalityProducingPercentage =
    municipalityStoreTotal > 0
      ? Math.min(
          100,
          Math.round(
            (municipalityStoresWithProduction / municipalityStoreTotal) * 100
          )
        )
      : 0;
  const producingStoresPercentage =
    summary.storeCount > 0
      ? Math.min(100, Math.round((summary.producingStores / summary.storeCount) * 100))
      : 0;
  const producingMunicipalitiesPercentage =
    summary.municipalityCount > 0
      ? Math.min(
          100,
          Math.round(
            (summary.municipalitiesWithData / summary.municipalityCount) * 100
          )
        )
      : 0;
  const totalScopeLabel = normalizedScopeUf ? 'total no estado' : 'total no Brasil';

  const openMunicipality = (row: ProductionHeatmapRow) => {
    setStateStoresOpen(false);
    setSelectedMunicipality(row);
    onSelectMunicipality?.(row);
  };

  const openStateStores = () => {
    if (!normalizedScopeUf) return;
    setSelectedMunicipality(null);
    setStoresData(null);
    setStoresError(null);
    setStateStoresPage(1);
    setStateStoresOpen(true);
  };

  const backToMunicipalities = () => {
    setStateStoresOpen(false);
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
          {selectedMunicipality
            ? selectedMunicipality.municipalityName
            : inStateStoresView
              ? `Lojas ${normalizedScopeUf}`
              : 'Lojas'}
        </span>
      </button>
    );
  }

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
                  className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Voltar para municípios"
                  title="Voltar para municípios"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : null}
              <div className={inStoresView ? 'mt-2' : ''}>
                {!inStoresView ? (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Mapa de produção
                  </p>
                ) : null}
                <h2
                  id="production-stores-panel-title"
                  className="mt-0.5 truncate text-lg font-semibold leading-tight text-slate-900"
                >
                  {inStoresView
                    ? inStateStoresView
                      ? `Lojas de ${contextLabel}`
                      : selectedMunicipality!.municipalityName
                    : 'Lojas por município'}
                </h2>
                <p className="mt-1 text-xs leading-snug text-slate-500">
                  {inStoresView
                    ? `${inStateStoresView ? normalizedScopeUf : selectedMunicipality!.uf} · ${metric.shortLabel || metric.label} · ${formatHeatmapPeriod(period)}`
                    : `${metric.label} · ${formatHeatmapPeriod(period)}`}
                </p>
              </div>
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
                  {inStoresView
                    ? inStateStoresView
                      ? contextLabel
                      : selectedMunicipality!.uf
                    : contextLabel}
                </span>
              </p>
            </div>
          </div>
        </header>

        <div className="shrink-0 border-b border-slate-200 bg-white/80 px-4 py-2.5">
          {!inStoresView ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-teal-200/80 bg-teal-50 px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-teal-700 shadow-sm">
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">
                    Produção no período
                  </p>
                </div>
                <p className="truncate text-base font-semibold tabular-nums tracking-tight text-slate-900">
                  {formatHeatmapValue(summary.value, metric.unit)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Lojas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold tabular-nums leading-none text-slate-900">
                      {summary.storeCount.toLocaleString('pt-BR')}
                    </p>
                    <p className="mt-0.5 text-[8px] uppercase tracking-wide text-slate-400">
                      {totalScopeLabel}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1 text-[9px] font-medium text-teal-700">
                  <span>
                    <strong className="font-semibold tabular-nums">
                      {summary.producingStores.toLocaleString('pt-BR')}
                    </strong>{' '}
                    com produção
                  </span>
                  <span className="tabular-nums">{producingStoresPercentage}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${producingStoresPercentage}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Municípios
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold tabular-nums leading-none text-slate-900">
                      {summary.municipalityCount.toLocaleString('pt-BR')}
                    </p>
                    <p className="mt-0.5 text-[8px] uppercase tracking-wide text-slate-400">
                      {totalScopeLabel}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1 text-[9px] font-medium text-teal-700">
                  <span>
                    <strong className="font-semibold tabular-nums">
                      {summary.municipalitiesWithData.toLocaleString('pt-BR')}
                    </strong>{' '}
                    com produção
                  </span>
                  <span className="tabular-nums">{producingMunicipalitiesPercentage}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${producingMunicipalitiesPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-teal-200/80 bg-teal-50 p-2.5 shadow-sm">
                <div className="flex min-w-0 items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden />
                  <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-teal-800">
                    Produção
                  </p>
                </div>
                <p className="truncate text-sm font-semibold tabular-nums tracking-tight text-slate-900">
                  {formatHeatmapValue(municipalityTotal, metric.unit)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                      Lojas
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums leading-none text-slate-900">
                    {municipalityStoreTotal.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1 text-[9px] font-medium text-teal-700">
                  <span>
                    {municipalityStoresWithProduction.toLocaleString('pt-BR')} com produção
                  </span>
                  <span className="tabular-nums">{municipalityProducingPercentage}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${municipalityProducingPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!inStoresView ? (
            <div className="space-y-3">
              {normalizedScopeUf ? (
                <button
                  type="button"
                  onClick={openStateStores}
                  className="group flex w-full items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-left shadow-sm transition-colors hover:bg-teal-100"
                  aria-label={`Ver ranking das lojas produtoras de ${contextLabel}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">
                    <Store className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-slate-900">
                      Ver lojas produtoras do estado
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-600">
                      Ranking e localização de{' '}
                      {summary.producingStores.toLocaleString('pt-BR')} lojas com produção
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-teal-600 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </button>
              ) : null}
              {sortedRows.length === 0 ? (
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
                            {Math.max(
                              Number(row.storeCount) || 0,
                              Number(row.producingStores) || 0
                            ).toLocaleString('pt-BR')}
                            <span className="mx-1 text-slate-300" aria-hidden>
                              |
                            </span>
                            {Number(row.producingStores).toLocaleString('pt-BR')} com produção
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
              )}
            </div>
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
              Nenhuma loja encontrada neste {inStateStoresView ? 'estado' : 'município'} para o
              período.
            </p>
          ) : (
            <div
              className="space-y-3"
              aria-label={`Lojas do ${inStateStoresView ? 'estado' : 'município'}`}
            >
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
                    <Trophy className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                      Ranking por
                    </p>
                    <p className="truncate text-[12px] font-semibold text-slate-900">
                      {metric.shortLabel || metric.label || 'Produção'}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-700">
                  {storeRows.length.toLocaleString('pt-BR')}{' '}
                  {storeRows.length === 1 ? 'loja' : 'lojas'}
                </span>
              </div>
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
                aria-label="Legenda dos símbolos das lojas no mapa"
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  No mapa
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-600">
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold leading-none text-white"
                    aria-hidden
                  >
                    ✓
                  </span>
                  Com produção
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-600">
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold leading-none text-white"
                    aria-hidden
                  >
                    !
                  </span>
                  Atenção: sem produção
                </span>
              </div>
              <ul className="space-y-2">
                {displayedStoreRows.map((store, index) => (
                  <StoreRankCard
                    key={store.chaveLoja}
                    store={store}
                    rank={
                      index +
                      1 +
                      (inStateStoresView
                        ? (stateStoresPage - 1) * STATE_STORES_PAGE_SIZE
                        : 0)
                    }
                    metric={metric}
                    maxValue={maxStoreValue}
                    municipalityTotal={municipalityTotal}
                    showMunicipality={inStateStoresView}
                    shareScope={inStateStoresView ? 'estado' : 'município'}
                    selected={
                      selectedStoreKey === String(store.chaveLoja ?? '').trim()
                    }
                    onHover={onHoverStore}
                    onSelect={onSelectStore}
                  />
                ))}
              </ul>
              {inStateStoresView && stateStoresPageCount > 1 ? (
                <nav
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                  aria-label="Paginação das lojas do estado"
                >
                  <button
                    type="button"
                    onClick={() => setStateStoresPage((current) => Math.max(1, current - 1))}
                    disabled={stateStoresPage === 1}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    Anterior
                  </button>
                  <span className="text-[11px] font-medium tabular-nums text-slate-500">
                    {stateStoresPage} de {stateStoresPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setStateStoresPage((current) =>
                        Math.min(stateStoresPageCount, current + 1)
                      )
                    }
                    disabled={stateStoresPage === stateStoresPageCount}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
                  >
                    Próxima
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </nav>
              ) : null}
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
  showMunicipality,
  shareScope,
  selected,
  onHover,
  onSelect,
}: {
  store: ProductionHeatmapStoreRow;
  rank: number;
  metric: ProductionHeatmapMetric;
  maxValue: number;
  municipalityTotal: number;
  showMunicipality: boolean;
  shareScope: 'estado' | 'município';
  selected: boolean;
  onHover?: (store: ProductionHeatmapStoreRow | null) => void;
  onSelect?: (store: ProductionHeatmapStoreRow | null) => void;
}) {
  const accent = rankAccent(rank);
  const value = Number(store.value) || 0;
  const barWidth =
    maxValue > 0 ? Math.max(value > 0 ? 6 : 0, Math.round((value / maxValue) * 100)) : 0;
  const share =
    municipalityTotal > 0 ? Math.round((value / municipalityTotal) * 1000) / 10 : 0;

  return (
    <li>
      <button
        type="button"
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition-[border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
          selected
            ? 'border-amber-400 bg-amber-50/60 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]'
            : 'border-slate-200/90 hover:border-slate-300'
        }`}
        onMouseEnter={() => onHover?.(store)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(store)}
        onBlur={() => onHover?.(null)}
        onClick={() => onSelect?.(selected ? null : store)}
        aria-pressed={selected}
        aria-label={`${selected ? 'Remover seleção da' : 'Selecionar'} loja ${store.nome} no mapa`}
      >
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
                  {store.chaveLoja} | {store.codAg} - {store.nomeAg}
                </p>
                {showMunicipality ? (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500">
                    <MapPin className="h-3 w-3 shrink-0 text-teal-600" aria-hidden />
                    <span className="truncate">
                      {store.municipalityName || 'Município não informado'} · {store.uf}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-semibold tabular-nums leading-none text-slate-900">
                  {formatHeatmapValue(value, metric.unit)}
                </p>
                {municipalityTotal > 0 ? (
                  <p className="mt-0.5 text-[9px] font-medium tabular-nums text-slate-400">
                    {share.toLocaleString('pt-BR')}% do {shareScope}
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
      </button>
    </li>
  );
}

export default ProductionHeatmapStoresPanel;
