import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Loader2,
  MapPinned,
  Pause,
  Play,
  RefreshCw,
  Store,
  X,
} from 'lucide-react';
import type {
  ProductionHeatmapMetric,
  ProductionHeatmapUnit,
} from '@/lib/mapDataApi';
import type { ProductionQuantileScale } from '@/lib/municipalityChoropleth';

export interface ProductionHeatmapPanelSummary {
  value: number;
  producingStores: number;
  municipalitiesWithData: number;
  /** Total de lojas na região (com ou sem produção). */
  storeCount: number;
  /** Total oficial de municípios na região (ibge..IBGE_POP). */
  municipalityCount: number;
  excludedStoresWithoutMunicipality: number;
}

interface ProductionHeatmapPanelProps {
  metrics: ProductionHeatmapMetric[];
  periods: number[];
  selectedMetricId: string;
  selectedPeriod: number | null;
  contextUf: string | null;
  contextLabel: string;
  optionsLoading: boolean;
  dataLoading: boolean;
  error: string | null;
  viewByMunicipality: boolean;
  onToggleViewByMunicipality: () => void;
  onMetricChange: (metricId: string) => void;
  onPeriodChange: (period: number) => void;
  onBackToBrazil: () => void;
  onRetry: () => void;
  onBack: () => void;
  onClose: () => void;
  /** Quando o painel lateral está aberto, recentra a barra na área útil restante. */
  sidePanelExpanded?: boolean;
}

export function formatHeatmapPeriod(period: number | null): string {
  if (!period) return 'Sem período';
  const year = Math.trunc(period / 100);
  const month = period % 100;
  if (month < 1 || month > 12) return String(period);
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(new Date(year, month - 1, 1))
    .replace('.', '')
    .trim();
  return `${monthLabel}'${String(year).slice(-2)}`;
}

export function formatHeatmapValue(value: number, unit: ProductionHeatmapUnit): string {
  if (unit === 'currency') {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
  }
  return Math.round(value).toLocaleString('pt-BR');
}

function formatCompactValue(value: number, unit: ProductionHeatmapUnit): string {
  if (unit === 'currency') {
    if (Math.abs(value) >= 1_000_000) {
      return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    }
    if (Math.abs(value) >= 1_000) {
      return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    }
    return formatHeatmapValue(value, unit);
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return Math.round(value).toLocaleString('pt-BR');
}

/** Card de totais — renderizado ao lado do dock de zoom no mapa. */
export function ProductionHeatmapTotalsCard({
  summary,
  metric,
  onOpenStoresPanel,
}: {
  summary: ProductionHeatmapPanelSummary;
  metric: ProductionHeatmapMetric;
  /** Abre o painel lateral de lojas/municípios do escopo atual. */
  onOpenStoresPanel?: () => void;
}) {
  const clickable = Boolean(onOpenStoresPanel);
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

  return (
    <aside
      className="pointer-events-auto w-[min(260px,calc(100vw-7rem))] rounded-2xl border border-white/70 bg-white/90 p-2 font-sans text-slate-700 shadow-lg shadow-slate-900/15 backdrop-blur-xl"
      aria-label="Totais de produção"
    >
      <div className="rounded-xl border border-teal-200/80 bg-teal-50 px-3 py-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[8px] font-semibold uppercase tracking-wide text-teal-700">
                Produto
              </p>
              <p className="truncate text-[11px] font-semibold text-slate-800">
                {metric.shortLabel || metric.label || 'Produção'}
              </p>
            </div>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-teal-700">
              Produção
            </p>
            <p className="truncate text-sm font-bold tabular-nums text-slate-900">
              {formatHeatmapValue(summary.value, metric.unit)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={onOpenStoresPanel}
          disabled={!clickable}
          aria-label={`${summary.storeCount} lojas no total, ${summary.producingStores} com produção. Ver detalhamento.`}
          title={clickable ? 'Ver lojas do escopo' : undefined}
          className={`min-w-0 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-sm transition-colors ${
            clickable
              ? 'cursor-pointer hover:border-teal-300 hover:bg-teal-50/50'
              : 'cursor-default'
          }`}
        >
          <span className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
              <Store className="h-3 w-3 shrink-0" aria-hidden />
              Lojas
            </span>
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[8px] font-semibold tabular-nums text-slate-600">
              {producingStoresPercentage}%
            </span>
          </span>
          <span className="mt-1.5 flex items-baseline gap-1">
            <strong className="text-sm font-bold tabular-nums text-slate-900">
              {summary.storeCount.toLocaleString('pt-BR')}
            </strong>
            <span className="text-[8px] uppercase text-slate-400">total</span>
          </span>
          <span className="mt-0.5 block truncate text-[9px] font-medium text-teal-700">
            {summary.producingStores.toLocaleString('pt-BR')} com produção
          </span>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-teal-600"
              style={{ width: `${producingStoresPercentage}%` }}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenStoresPanel}
          disabled={!clickable}
          aria-label={`${summary.municipalityCount} municípios no total, ${summary.municipalitiesWithData} com produção. Ver detalhamento.`}
          title={clickable ? 'Ver municípios do escopo' : undefined}
          className={`min-w-0 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-sm transition-colors ${
            clickable
              ? 'cursor-pointer hover:border-teal-300 hover:bg-teal-50/50'
              : 'cursor-default'
          }`}
        >
          <span className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
              <MapPinned className="h-3 w-3 shrink-0" aria-hidden />
              Municípios
            </span>
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[8px] font-semibold tabular-nums text-slate-600">
              {producingMunicipalitiesPercentage}%
            </span>
          </span>
          <span className="mt-1.5 flex items-baseline gap-1">
            <strong className="text-sm font-bold tabular-nums text-slate-900">
              {summary.municipalityCount.toLocaleString('pt-BR')}
            </strong>
            <span className="text-[8px] uppercase text-slate-400">total</span>
          </span>
          <span className="mt-0.5 block truncate text-[9px] font-medium text-teal-700">
            {summary.municipalitiesWithData.toLocaleString('pt-BR')} com produção
          </span>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-teal-600"
              style={{ width: `${producingMunicipalitiesPercentage}%` }}
            />
          </span>
        </button>
      </div>
      {summary.excludedStoresWithoutMunicipality > 0 ? (
        <p className="mt-1.5 px-0.5 text-[8px] leading-snug text-slate-400">
          {summary.excludedStoresWithoutMunicipality} lojas sem código municipal desconsideradas.
        </p>
      ) : null}
    </aside>
  );
}

/** Termômetro — renderizado logo abaixo do dock de zoom no mapa. */
export function ProductionHeatmapThermometer({
  scale,
  metric,
  selectedClasses = null,
  onSelectedClassesChange,
}: {
  scale: ProductionQuantileScale;
  metric: ProductionHeatmapMetric;
  /** Índices de faixa (0–4). `null`/vazio = todas visíveis. */
  selectedClasses?: number[] | null;
  onSelectedClassesChange?: (classes: number[] | null) => void;
}) {
  const filterActive = Boolean(selectedClasses && selectedClasses.length > 0);
  const topRange = scale.ranges[scale.ranges.length - 1];
  const bottomRange = scale.ranges[0];

  const toggleClass = (classIndex: number) => {
    if (!onSelectedClassesChange) return;
    const current = selectedClasses ?? [];
    if (!filterActive) {
      onSelectedClassesChange([classIndex]);
      return;
    }
    if (current.includes(classIndex)) {
      const next = current.filter((item) => item !== classIndex);
      onSelectedClassesChange(next.length === 0 ? null : next);
      return;
    }
    const next = [...current, classIndex].sort((a, b) => a - b);
    onSelectedClassesChange(
      next.length >= scale.ranges.length ? null : next
    );
  };

  if (scale.ranges.length === 0) return null;

  return (
    <aside
      className="pointer-events-auto flex w-[56px] flex-col items-center gap-1.5 rounded-2xl border border-white/70 bg-white/90 px-1.5 py-2.5 font-sans text-slate-700 shadow-lg shadow-slate-900/15 backdrop-blur-xl"
      aria-label="Legenda de intensidade — clique numa faixa para filtrar o mapa"
    >
      <p className="text-[7px] font-semibold uppercase tracking-wide text-slate-500">Int.</p>
      <span
        className="max-w-full truncate px-0.5 text-center text-[8px] font-bold tabular-nums text-slate-700"
        title={formatHeatmapValue(topRange.max, metric.unit)}
      >
        {formatCompactValue(topRange.max, metric.unit)}
      </span>
      <div
        className="flex h-[min(168px,28vh)] w-3.5 flex-col-reverse overflow-hidden rounded-full border border-white shadow-inner ring-1 ring-slate-200"
        role="group"
        aria-label="Faixas de intensidade"
      >
        {scale.ranges.map((range, classIndex) => {
          const selected = !filterActive || selectedClasses!.includes(classIndex);
          return (
            <button
              key={`${range.color}-${classIndex}`}
              type="button"
              onClick={() => toggleClass(classIndex)}
              aria-pressed={filterActive ? selected : false}
              title={`${formatHeatmapValue(range.min, metric.unit)} – ${formatHeatmapValue(range.max, metric.unit)}${
                filterActive && selected ? ' (filtro ativo)' : ''
              }`}
              className={`relative min-h-0 flex-1 transition-[opacity,box-shadow] ${
                selected
                  ? 'opacity-100'
                  : 'opacity-25'
              } ${filterActive && selected ? 'z-10 ring-1 ring-inset ring-sky-400/80' : ''}`}
              style={{ backgroundColor: range.color }}
            />
          );
        })}
      </div>
      <span
        className="max-w-full truncate px-0.5 text-center text-[8px] font-bold tabular-nums text-slate-700"
        title={formatHeatmapValue(bottomRange.min, metric.unit)}
      >
        {formatCompactValue(bottomRange.min, metric.unit)}
      </span>
      {filterActive ? (
        <button
          type="button"
          onClick={() => onSelectedClassesChange?.(null)}
          className="rounded px-1 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-sky-700 hover:bg-sky-50"
          title="Mostrar todas as faixas"
        >
          Todas
        </button>
      ) : null}
    </aside>
  );
}

const ProductionHeatmapPanel: React.FC<ProductionHeatmapPanelProps> = ({
  metrics,
  periods,
  selectedMetricId,
  selectedPeriod,
  contextUf,
  contextLabel,
  optionsLoading,
  dataLoading,
  error,
  viewByMunicipality,
  onToggleViewByMunicipality,
  onMetricChange,
  onPeriodChange,
  onBackToBrazil,
  onRetry,
  onBack,
  onClose,
  sidePanelExpanded = false,
}) => {
  const periodIndex = Math.max(0, periods.indexOf(selectedPeriod ?? -1));
  const selectableMetrics = useMemo(
    () => metrics.filter((item) => !item.productKey || item.defaultForProduct),
    [metrics]
  );
  const groups = useMemo(
    () => Array.from(new Set(selectableMetrics.map((item) => item.group))),
    [selectableMetrics]
  );
  const selectedMetric = metrics.find((item) => item.id === selectedMetricId) ?? null;
  const selectedProductVariants = selectedMetric?.productKey
    ? metrics.filter((item) => item.productKey === selectedMetric.productKey)
    : [];
  const selectedCurrencyMetric =
    selectedProductVariants.find((item) => item.unit === 'currency') ?? null;
  const selectedQuantityMetric =
    selectedProductVariants.find((item) => item.unit === 'quantity') ?? null;
  const metricSelectValue =
    selectedMetric?.productKey && selectedCurrencyMetric
      ? selectedCurrencyMetric.id
      : selectedMetricId;
  const showMeasureToggle = Boolean(selectedCurrencyMetric && selectedQuantityMetric);

  const [isPlaying, setIsPlaying] = useState(false);
  const periodIndexRef = useRef(periodIndex);
  periodIndexRef.current = periodIndex;
  const periodsRef = useRef(periods);
  periodsRef.current = periods;
  const onPeriodChangeRef = useRef(onPeriodChange);
  onPeriodChangeRef.current = onPeriodChange;

  // Pausa quando a lista de períodos deixa de suportar o autoplay.
  useEffect(() => {
    if (periods.length <= 1) setIsPlaying(false);
  }, [periods.length]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      const list = periodsRef.current;
      if (list.length <= 1) return;
      const next = list[(periodIndexRef.current + 1) % list.length];
      if (next) onPeriodChangeRef.current(next);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [isPlaying]);

  const isBusy = optionsLoading || dataLoading;

  return (
    <div
      className="pointer-events-none fixed z-30 flex -translate-x-1/2 justify-center transition-[left,max-width] duration-500 ease-out"
      style={{
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: sidePanelExpanded
          ? 'calc((100vw - min(96vw, 480px)) / 2)'
          : '50%',
        maxWidth: sidePanelExpanded
          ? 'calc(100vw - min(96vw, 480px) - 24px)'
          : 'calc(100vw - 24px)',
      }}
    >
      <section
        className="pointer-events-auto inline-flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/70 bg-white/90 p-2 font-sans text-slate-700 shadow-2xl shadow-slate-900/20 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Mapa de produção por município"
      >
        <div className="flex h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/85 px-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
            aria-label="Voltar ao menu Navegar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm shadow-sky-300">
            <MapPinned className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 max-w-[110px]">
            <p className="truncate text-[8px] font-semibold uppercase tracking-wide text-slate-500">
              Mapa de produção
            </p>
            <p className="truncate text-[11px] font-bold text-slate-800">Por município</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-800 sm:hidden"
            aria-label="Fechar mapa de produção"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-11 w-[128px] shrink-0 items-center gap-1.5 rounded-xl border border-sky-100 bg-sky-50/90 px-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Escopo</p>
            <p className="truncate text-[11px] font-bold text-slate-900">{contextLabel}</p>
          </div>
          {contextUf ? (
            <button
              type="button"
              onClick={onBackToBrazil}
              className="shrink-0 rounded-lg border border-sky-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-sky-800 transition-colors hover:bg-sky-50"
            >
              Brasil
            </button>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              BR
            </span>
          )}
        </div>

        <label className="flex h-11 min-w-[150px] max-w-[200px] shrink items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/85 px-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-500">
              Indicador
            </span>
            <select
              id="production-heatmap-metric"
              value={metricSelectValue}
              disabled={optionsLoading}
              onChange={(event) => onMetricChange(event.target.value)}
              className="mt-0.5 w-full truncate bg-transparent text-[11px] font-bold text-slate-800 outline-none disabled:opacity-60"
            >
              <option value="">Selecione uma produção</option>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {selectableMetrics
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </span>
        </label>

        {showMeasureToggle ? (
          <div
            className="flex h-11 w-[104px] shrink-0 flex-col justify-center rounded-xl border border-slate-200/90 bg-slate-50/85 px-2"
            aria-label="Medida da produção"
          >
            <span className="mb-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
              Medida
            </span>
            <span className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => selectedCurrencyMetric && onMetricChange(selectedCurrencyMetric.id)}
                disabled={optionsLoading || !selectedCurrencyMetric}
                aria-pressed={selectedMetric?.unit === 'currency'}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                  selectedMetric?.unit === 'currency'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                R$
              </button>
              <button
                type="button"
                onClick={() => selectedQuantityMetric && onMetricChange(selectedQuantityMetric.id)}
                disabled={optionsLoading || !selectedQuantityMetric}
                aria-pressed={selectedMetric?.unit === 'quantity'}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                  selectedMetric?.unit === 'quantity'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                QTD
              </button>
            </span>
          </div>
        ) : null}

        <div className="flex h-11 w-[240px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/85 px-2.5 pt-1.5">
          <button
            type="button"
            onClick={() => setIsPlaying((current) => !current)}
            disabled={periods.length <= 1}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? 'Pausar animação dos períodos' : 'Reproduzir períodos em sequência'}
            title={isPlaying ? 'Pausar' : 'Reproduzir períodos em loop'}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isPlaying
                ? 'border-sky-300 bg-sky-600 text-white shadow-sm shadow-sky-300'
                : 'border-slate-200/90 bg-white text-sky-700 hover:bg-sky-50'
            }`}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Play className="ml-0.5 h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          <CalendarDays className="h-4 w-4 shrink-0 text-sky-600" />
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="flex items-center justify-between gap-2 leading-none">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">
                Período
              </span>
              <span className="inline-flex items-center gap-1.5">
                {isBusy ? (
                  <Loader2
                    className="h-3 w-3 shrink-0 animate-spin text-sky-600"
                    aria-hidden
                  />
                ) : null}
                <span className="text-[11px] font-bold capitalize leading-none text-slate-800">
                  {formatHeatmapPeriod(selectedPeriod)}
                </span>
              </span>
            </span>
            <span className="relative mt-0 -translate-y-1.5 block">
              {periods.length > 1 ? (
                <span
                  className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-[2px]"
                  aria-hidden
                >
                  {periods.map((period) => (
                    <span
                      key={period}
                      className="h-2 w-px rounded-full bg-slate-400/70"
                    />
                  ))}
                </span>
              ) : null}
              <input
                className="relative h-1.5 w-full cursor-pointer accent-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                type="range"
                min={0}
                max={Math.max(0, periods.length - 1)}
                step={1}
                value={periodIndex}
                disabled={periods.length <= 1}
                onPointerDown={() => setIsPlaying(false)}
                onChange={(event) => {
                  const next = periods[Number(event.target.value)];
                  if (next) onPeriodChange(next);
                }}
                aria-label="Período da produção"
                aria-valuetext={formatHeatmapPeriod(selectedPeriod)}
              />
            </span>
          </span>
          {isBusy ? (
            <span className="sr-only" role="status">
              {optionsLoading ? 'Carregando…' : 'Atualizando…'}
            </span>
          ) : null}
        </div>

        {error ? (
          <div
            className="flex h-11 max-w-[180px] shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/90 px-2 text-red-800"
            role="alert"
            title={error}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <p className="min-w-0 flex-1 truncate text-[10px]">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white p-1 text-[10px] font-semibold hover:bg-red-50"
              aria-label="Tentar novamente"
              title="Tentar novamente"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        ) : null}

        {!contextUf ? (
          <button
            type="button"
            onClick={onToggleViewByMunicipality}
            disabled={!selectedMetricId}
            aria-pressed={viewByMunicipality}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              viewByMunicipality
                ? 'border-sky-300 bg-sky-100 text-sky-800'
                : 'border-slate-200/90 bg-slate-50/85 text-slate-600 hover:bg-white'
            }`}
            title="Alternar entre calor por estado e por município"
          >
            <span
              className={`h-3 w-5 shrink-0 rounded-full p-0.5 transition-colors ${
                viewByMunicipality ? 'bg-sky-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`block h-2 w-2 rounded-full bg-white shadow-sm transition-transform ${
                  viewByMunicipality ? 'translate-x-2' : ''
                }`}
              />
            </span>
            <span className="leading-tight">Municípios</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="hidden h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-2.5 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 sm:flex"
          aria-label="Fechar mapa de produção"
        >
          <X className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
};

export default ProductionHeatmapPanel;
