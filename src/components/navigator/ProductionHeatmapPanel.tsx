import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Loader2,
  MapPinned,
  RefreshCw,
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
}

function formatPeriod(period: number | null): string {
  if (!period) return 'Sem período';
  const year = Math.trunc(period / 100);
  const month = period % 100;
  if (month < 1 || month > 12) return String(period);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
    .format(new Date(year, month - 1, 1))
    .replace('.', '');
}

function formatValue(value: number, unit: ProductionHeatmapUnit): string {
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
    return formatValue(value, unit);
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
}: {
  summary: ProductionHeatmapPanelSummary;
  metric: ProductionHeatmapMetric;
}) {
  return (
    <aside
      className="pointer-events-auto w-[min(260px,calc(100vw-7rem))] rounded-2xl border border-white/70 bg-white/90 p-2 font-sans text-slate-700 shadow-lg shadow-slate-900/15 backdrop-blur-xl"
      aria-label="Totais de produção"
    >
      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white">
        <div className="border-b border-slate-100 px-3 py-2 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">
            Produção
          </p>
          <p className="mt-1 break-words text-sm font-bold leading-tight text-slate-900">
            {formatValue(summary.value, metric.unit)}
          </p>
        </div>
        <div className="flex items-stretch">
          <div className="min-w-0 flex-1 border-r border-slate-100 px-2 py-2 text-center">
            <p className="truncate text-xs font-bold leading-none text-slate-900">
              {summary.producingStores.toLocaleString('pt-BR')}
            </p>
            <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
              Lojas
            </p>
          </div>
          <div className="min-w-0 flex-1 px-2 py-2 text-center">
            <p className="truncate text-xs font-bold leading-none text-slate-900">
              {summary.municipalitiesWithData.toLocaleString('pt-BR')}
            </p>
            <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
              Municípios
            </p>
          </div>
        </div>
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
}: {
  scale: ProductionQuantileScale;
  metric: ProductionHeatmapMetric;
}) {
  const thermometerGradient = useMemo(() => {
    if (scale.ranges.length === 0) return undefined;
    return `linear-gradient(to top, ${scale.ranges.map((range) => range.color).join(', ')})`;
  }, [scale.ranges]);

  if (scale.ranges.length === 0) return null;

  return (
    <aside
      className="pointer-events-auto flex w-[56px] flex-col items-center gap-1.5 rounded-2xl border border-white/70 bg-white/90 px-1.5 py-2.5 font-sans text-slate-700 shadow-lg shadow-slate-900/15 backdrop-blur-xl"
      aria-label="Legenda de intensidade"
      title={scale.ranges
        .map((range) => `${formatValue(range.min, metric.unit)} – ${formatValue(range.max, metric.unit)}`)
        .join(' · ')}
    >
      <p className="text-[7px] font-semibold uppercase tracking-wide text-slate-500">Int.</p>
      <span
        className="max-w-full truncate px-0.5 text-center text-[8px] font-bold tabular-nums text-slate-700"
        title={formatValue(scale.ranges.at(-1)!.max, metric.unit)}
      >
        {formatCompactValue(scale.ranges.at(-1)!.max, metric.unit)}
      </span>
      <div
        className="h-[min(168px,28vh)] w-3.5 rounded-full border border-white shadow-inner ring-1 ring-slate-200"
        style={{ background: thermometerGradient }}
        aria-hidden
      />
      <span
        className="max-w-full truncate px-0.5 text-center text-[8px] font-bold tabular-nums text-slate-700"
        title={formatValue(scale.ranges[0].min, metric.unit)}
      >
        {formatCompactValue(scale.ranges[0].min, metric.unit)}
      </span>
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
}) => {
  const periodIndex = Math.max(0, periods.indexOf(selectedPeriod ?? -1));
  const groups = useMemo(
    () => Array.from(new Set(metrics.map((item) => item.group))),
    [metrics]
  );

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-30 w-[min(1000px,calc(100vw-24px))] -translate-x-1/2"
      style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
    >
      <section
        className="pointer-events-auto flex w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/90 p-2.5 font-sans text-slate-700 shadow-2xl shadow-slate-900/20 backdrop-blur-xl"
        aria-label="Mapa de produção por município"
      >
        <div className="flex min-h-11 min-w-[168px] flex-1 items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/85 px-2.5 sm:flex-none">
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
          <div className="min-w-0 flex-1">
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

        <div className="flex min-h-11 w-[150px] shrink-0 items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/90 px-3">
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Escopo</p>
            <p className="truncate text-[11px] font-bold text-slate-900">{contextLabel}</p>
          </div>
          {contextUf ? (
            <button
              type="button"
              onClick={onBackToBrazil}
              className="shrink-0 rounded-lg border border-sky-200 bg-white px-2 py-1 text-[10px] font-semibold text-sky-800 transition-colors hover:bg-sky-50"
            >
              Brasil
            </button>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              BR
            </span>
          )}
        </div>

        <label className="flex min-h-11 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/85 px-3 sm:flex-none sm:min-w-[210px]">
          <span className="min-w-0 flex-1">
            <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-500">
              Indicador
            </span>
            <select
              id="production-heatmap-metric"
              value={selectedMetricId}
              disabled={optionsLoading}
              onChange={(event) => onMetricChange(event.target.value)}
              className="mt-0.5 w-full max-w-[200px] truncate bg-transparent text-[11px] font-bold text-slate-800 outline-none disabled:opacity-60"
            >
              <option value="">Selecione uma produção</option>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {metrics.filter((item) => item.group === group).map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </span>
        </label>

        <div className="flex min-h-11 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/85 px-3 sm:min-w-[240px]">
          <CalendarDays className="h-4 w-4 shrink-0 text-sky-600" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">
                Período
              </span>
              <span className="text-[11px] font-bold capitalize text-slate-800">
                {formatPeriod(selectedPeriod)}
              </span>
            </span>
            <input
              className="mt-1.5 h-1.5 w-full cursor-pointer accent-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
              type="range"
              min={0}
              max={Math.max(0, periods.length - 1)}
              step={1}
              value={periodIndex}
              disabled={periods.length <= 1}
              onChange={(event) => {
                const next = periods[Number(event.target.value)];
                if (next) onPeriodChange(next);
              }}
              aria-label="Período da produção"
              aria-valuetext={formatPeriod(selectedPeriod)}
            />
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="hidden min-h-11 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-2.5 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 sm:flex"
          aria-label="Fechar mapa de produção"
        >
          <X className="h-4 w-4" />
        </button>

        {optionsLoading || dataLoading ? (
          <div
            className="flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50/90 px-2.5 text-sky-800"
            role="status"
            title={optionsLoading ? 'Carregando…' : 'Atualizando…'}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : error ? (
          <div
            className="flex min-h-11 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-red-200 bg-red-50/90 px-3 text-red-800"
            role="alert"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <p className="min-w-0 flex-1 truncate text-[11px]">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold hover:bg-red-50"
            >
              <RefreshCw className="h-3 w-3" /> Tentar
            </button>
          </div>
        ) : null}

        {!contextUf ? (
          <button
            type="button"
            onClick={onToggleViewByMunicipality}
            disabled={!selectedMetricId}
            aria-pressed={viewByMunicipality}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
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
      </section>
    </div>
  );
};

export default ProductionHeatmapPanel;
