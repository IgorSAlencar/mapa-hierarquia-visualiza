import React, { useEffect, type RefObject } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  History,
  MapPin,
  Minus,
  Navigation,
  Route,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  UsersRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type RouteOpportunityPriorityBand = 'alta' | 'media' | 'baixa';
export type RouteOpportunityFilterKey =
  | 'cielo'
  | 'credito'
  | 'negocio'
  | 'ativo_pade'
  | 'proposta_valor';

export interface RouteOpportunityPanelItem {
  id: string;
  nome: string;
  codAg: string;
  endereco: string;
  municipio: string;
  uf: string;
  routeRole?: 'origin' | 'destination' | 'corridor';
  daysWithoutVisit: number;
  deviationMinutes: number;
  oportunidadeCredito: boolean;
  oportunidadeCielo: boolean;
  oportunidadeNegocio: boolean;
  oportunidadeAtivoPade: boolean;
  oportunidadePropostaValor: boolean;
}

interface RegionOption {
  key: string;
  name: string;
  count: number;
}

interface RouteMetrics {
  distanceKm: number;
  travelMinutes: number;
  visitMinutes: number;
  finish: string;
}

interface SummaryCounts {
  opportunities: number;
  alert: number;
  attention: number;
  optimal: number;
  withoutVisit: number;
  regions: number;
}

interface Props {
  minimized: boolean;
  stores: RouteOpportunityPanelItem[];
  selectedIds: string[];
  priorityByStoreId: Record<string, RouteOpportunityPriorityBand>;
  summary: SummaryCounts;
  regions: RegionOption[];
  selectedRegionKeys: string[];
  query: string;
  filtersOpen: boolean;
  filtersContainerRef: RefObject<HTMLDivElement>;
  opportunityFilters: Array<{ key: RouteOpportunityFilterKey; label: string }>;
  selectedOpportunityFilters: RouteOpportunityFilterKey[];
  selectedPriorityBands: RouteOpportunityPriorityBand[];
  onlyWithoutVisit: boolean;
  onlyOnPath: boolean;
  date: string;
  routeMetrics: RouteMetrics;
  onQueryChange: (value: string) => void;
  onToggleFilters: () => void;
  onToggleOpportunityFilter: (key: RouteOpportunityFilterKey) => void;
  onClearOpportunityFilters: () => void;
  onTogglePriorityBand: (band: RouteOpportunityPriorityBand) => void;
  onToggleWithoutVisit: () => void;
  onClearSummaryFilters: () => void;
  onClearRegions: () => void;
  onToggleRegion: (key: string, append: boolean) => void;
  onToggleOnlyOnPath: () => void;
  onToggleStore: (store: RouteOpportunityPanelItem) => void;
  onStoreHover?: (id: string | null) => void;
  onDateChange: (value: string) => void;
  onOptimize: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}

const opportunityBadges: Array<{
  key: RouteOpportunityFilterKey;
  label: string;
  active: (store: RouteOpportunityPanelItem) => boolean;
  className: string;
}> = [
  { key: 'cielo', label: 'Cielo', active: (store) => store.oportunidadeCielo, className: 'border-sky-200 bg-sky-50 text-sky-700' },
  { key: 'credito', label: 'Crédito', active: (store) => store.oportunidadeCredito, className: 'border-violet-200 bg-violet-50 text-violet-700' },
  { key: 'negocio', label: 'Negócio', active: (store) => store.oportunidadeNegocio, className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { key: 'ativo_pade', label: 'Ativo PADE', active: (store) => store.oportunidadeAtivoPade, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { key: 'proposta_valor', label: 'Proposta de Valor', active: (store) => store.oportunidadePropostaValor, className: 'border-rose-200 bg-rose-50 text-rose-700' },
];

const priorityLabel: Record<RouteOpportunityPriorityBand, string> = {
  alta: 'Alerta',
  media: 'Atenção',
  baixa: 'Ótimo',
};

const routeRoleLabel: Record<NonNullable<RouteOpportunityPanelItem['routeRole']>, string> = {
  origin: 'Origem',
  destination: 'Destino',
  corridor: 'No trajeto',
};

const OPPORTUNITY_PAGE_SIZE = 40;

const RouteOpportunitiesSidePanel: React.FC<Props> = ({
  minimized,
  stores,
  selectedIds,
  priorityByStoreId,
  summary,
  regions,
  selectedRegionKeys,
  query,
  filtersOpen,
  filtersContainerRef,
  opportunityFilters,
  selectedOpportunityFilters,
  selectedPriorityBands,
  onlyWithoutVisit,
  onlyOnPath,
  date,
  routeMetrics,
  onQueryChange,
  onToggleFilters,
  onToggleOpportunityFilter,
  onClearOpportunityFilters,
  onTogglePriorityBand,
  onToggleWithoutVisit,
  onClearSummaryFilters,
  onClearRegions,
  onToggleRegion,
  onToggleOnlyOnPath,
  onToggleStore,
  onStoreHover,
  onDateChange,
  onOptimize,
  onMinimize,
  onRestore,
  onClose,
}) => {
  const [animateIn, setAnimateIn] = React.useState(false);
  const [visibleLimit, setVisibleLimit] = React.useState(OPPORTUNITY_PAGE_SIZE);

  useEffect(() => {
    setAnimateIn(false);
    const timer = window.setTimeout(() => setAnimateIn(true), 12);
    return () => window.clearTimeout(timer);
  }, [minimized]);

  useEffect(() => {
    setVisibleLimit(OPPORTUNITY_PAGE_SIZE);
  }, [stores]);

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="pointer-events-auto absolute right-0 top-[62%] z-30 flex -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-violet-200/90 bg-white/95 py-3 pl-3 pr-2.5 text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition-colors hover:bg-violet-50"
        aria-label="Reabrir oportunidades do roteiro"
        title="Reabrir oportunidades do roteiro"
      >
        <ChevronLeft className="h-4 w-4 shrink-0 text-violet-600" />
        <span className="text-left">
          <span className="block text-xs font-semibold text-slate-900">Roteiro</span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {selectedIds.length} selecionada{selectedIds.length === 1 ? '' : 's'}
          </span>
        </span>
      </button>
    );
  }

  const selectedCount = selectedIds.length;
  const visibleStores = stores.slice(0, visibleLimit);
  const travelHours = `${Math.floor(routeMetrics.travelMinutes / 60)}h${String(routeMetrics.travelMinutes % 60).padStart(2, '0')}`;
  const visitHours = `${Math.floor(routeMetrics.visitMinutes / 60)}h${String(routeMetrics.visitMinutes % 60).padStart(2, '0')}`;
  const showInlineSummary = false;
  const showRouteSummaryFooter = false;

  return (
    <aside
      data-route-planner-results
      className={cn(
        'pointer-events-auto absolute inset-y-0 right-0 z-30 w-[min(96vw,480px)] transform transition-all duration-500 ease-out',
        animateIn ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      )}
      role="dialog"
      aria-labelledby="route-opportunities-title"
    >
      <div className="flex h-full max-h-full flex-col overflow-hidden rounded-l-2xl border border-slate-200/90 bg-slate-50/95 font-sans text-slate-700 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
        <header className="shrink-0 border-b border-slate-200/80 bg-white/90 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-md shadow-violet-200">
              <Navigation className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">Planejamento de visitas</p>
              <h2 id="route-opportunities-title" className="mt-0.5 truncate text-base font-bold text-slate-900">Oportunidades do roteiro</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {stores.length} exibida{stores.length === 1 ? '' : 's'} · {selectedCount} selecionada{selectedCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={onMinimize} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Minimizar oportunidades do roteiro" title="Minimizar painel">
                <Minus className="h-4 w-4" />
              </button>
              <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600" aria-label="Fechar montagem do roteiro" title="Fechar roteiro">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {showInlineSummary && <section className="border-b border-slate-200/80 bg-gradient-to-br from-white/95 to-violet-50/55 px-4 py-3" aria-label="Resumo das oportunidades">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-slate-900">Resumo do recorte</p>
                <p className="mt-0.5 text-[9px] text-slate-500">Clique nos indicadores para filtrar.</p>
              </div>
              {(selectedPriorityBands.length > 0 || onlyWithoutVisit) && (
                <button type="button" onClick={onClearSummaryFilters} className="text-[9px] font-bold text-violet-700 hover:text-violet-900">Limpar classificação</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <SummaryButton label="Oportunidades" value={summary.opportunities} icon={<ShoppingCart className="h-3.5 w-3.5" />} tone="blue" active={selectedPriorityBands.length === 0 && !onlyWithoutVisit} onClick={onClearSummaryFilters} />
              <SummaryButton label="Alerta" value={summary.alert} icon={<TriangleAlert className="h-3.5 w-3.5" />} tone="rose" active={selectedPriorityBands.includes('alta')} onClick={() => onTogglePriorityBand('alta')} />
              <SummaryButton label="Atenção" value={summary.attention} icon={<TriangleAlert className="h-3.5 w-3.5" />} tone="amber" active={selectedPriorityBands.includes('media')} onClick={() => onTogglePriorityBand('media')} />
              <SummaryButton label="Ótimo" value={summary.optimal} icon={<Check className="h-3.5 w-3.5" />} tone="emerald" active={selectedPriorityBands.includes('baixa')} onClick={() => onTogglePriorityBand('baixa')} />
              <SummaryButton label="Sem visita" value={summary.withoutVisit} icon={<History className="h-3.5 w-3.5" />} tone="violet" active={onlyWithoutVisit} onClick={onToggleWithoutVisit} />
              <SummaryButton label="Regiões" value={summary.regions} icon={<UsersRound className="h-3.5 w-3.5" />} tone="sky" active={selectedRegionKeys.length > 0} onClick={selectedRegionKeys.length > 0 ? onClearRegions : undefined} />
            </div>
          </section>}

          <section ref={filtersContainerRef} className="border-b border-slate-200/80 bg-white/80 px-4 py-3" aria-label="Busca e filtros">
            <div className="flex gap-2">
              <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-400 shadow-sm transition focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
                <Search className="h-4 w-4 shrink-0" />
                <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar loja, município ou agência" className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-400" />
              </label>
              <button
                type="button"
                onClick={onToggleFilters}
                aria-expanded={filtersOpen}
                className={cn(
                  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-colors',
                  filtersOpen || selectedOpportunityFilters.length > 0
                    ? 'border-violet-300 bg-violet-100 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                )}
                aria-label="Filtrar oportunidades"
                title="Filtrar oportunidades"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {selectedOpportunityFilters.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[8px] font-bold text-white">{selectedOpportunityFilters.length}</span>}
              </button>
            </div>

            <button type="button" onClick={onToggleOnlyOnPath} className="mt-1.5 flex min-h-7 w-full items-center justify-between rounded-lg px-1 text-left">
              <span className="text-[9px] font-semibold text-slate-600">Apenas lojas do caminho</span>
              <span className={cn('h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors', onlyOnPath ? 'bg-violet-600' : 'bg-slate-300')}>
                <span className={cn('block h-4 w-4 rounded-full bg-white shadow-sm transition-transform', onlyOnPath && 'translate-x-4')} />
              </span>
            </button>

            {filtersOpen && (
              <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/55 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold text-slate-800">Oportunidades identificadas</p>
                  {selectedOpportunityFilters.length > 0 && <button type="button" onClick={onClearOpportunityFilters} className="text-[9px] font-bold text-violet-700">Limpar</button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {opportunityFilters.map(({ key, label }) => {
                    const active = selectedOpportunityFilters.includes(key);
                    return (
                      <button key={key} type="button" onClick={() => onToggleOpportunityFilter(key)} aria-pressed={active} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold transition-colors', active ? 'border-violet-300 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200')}>
                        <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-full border', active ? 'border-white/50 bg-white/15' : 'border-slate-300')}>
                          {active && <Check className="h-2.5 w-2.5" />}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-2.5" aria-label="Distribuição por região">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-slate-800">Distribuição por região</p>
              <span className="text-[9px] text-slate-500">Shift + clique combina</span>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              <RegionChip label="Todas" count={summary.opportunities} active={selectedRegionKeys.length === 0} onClick={onClearRegions} />
              {regions.map((region) => (
                <RegionChip key={region.key} label={region.name} count={region.count} active={selectedRegionKeys.includes(region.key)} onClick={(event) => onToggleRegion(region.key, event.shiftKey)} />
              ))}
            </div>
          </section>

          <section className="space-y-2.5 p-3 pb-40 lg:pb-3" aria-label="Lojas encontradas">
            {stores.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center">
                <ShoppingCart className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-xs font-bold text-slate-700">Nenhuma oportunidade encontrada</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Revise os filtros, a origem ou o destino do roteiro.</p>
              </div>
            ) : visibleStores.map((store) => (
              <OpportunityCard
                key={store.id}
                store={store}
                priority={priorityByStoreId[store.id] ?? 'media'}
                selected={selectedIds.includes(store.id)}
                onToggle={() => onToggleStore(store)}
                onHover={onStoreHover}
              />
            ))}
            {visibleLimit < stores.length && (
              <button
                type="button"
                onClick={() => setVisibleLimit((current) => Math.min(stores.length, current + OPPORTUNITY_PAGE_SIZE))}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-[10px] font-bold text-violet-700 shadow-sm transition-colors hover:bg-violet-50"
              >
                Mostrar mais {Math.min(OPPORTUNITY_PAGE_SIZE, stores.length - visibleLimit)} oportunidades
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] text-violet-700">{visibleLimit} de {stores.length}</span>
              </button>
            )}
          </section>
        </div>

        {showRouteSummaryFooter && <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-10px_30px_-24px_rgba(15,23,42,0.55)]">
          <div className="flex items-center gap-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-violet-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-500">Data do roteiro</span>
                <input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="mt-0.5 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none" />
              </span>
            </label>
            <div className="flex min-w-[116px] items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
              <Check className="h-4 w-4 shrink-0 text-violet-600" />
              <span>
                <span className="block text-sm font-bold leading-none text-slate-900">{selectedCount}</span>
                <span className="mt-1 block text-[8px] font-semibold uppercase tracking-wide text-slate-500">Selecionadas</span>
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <RouteMetric icon={<Route className="h-3 w-3" />} label="Distância" value={`${routeMetrics.distanceKm} km`} />
            <RouteMetric icon={<Navigation className="h-3 w-3" />} label="Deslocamento" value={travelHours} />
            <RouteMetric icon={<Clock3 className="h-3 w-3" />} label="Visitas" value={visitHours} />
            <RouteMetric icon={<CalendarDays className="h-3 w-3" />} label="Término" value={routeMetrics.finish} />
          </div>
          <button type="button" disabled={selectedCount === 0} onClick={onOptimize} className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 text-xs font-bold text-white shadow-md shadow-violet-300/45 transition hover:from-violet-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-45">
            <Sparkles className="h-4 w-4" />
            Sugerir melhor rota
          </button>
        </footer>}
      </div>
    </aside>
  );
};

function SummaryButton({ label, value, icon, tone, active, onClick }: { label: string; value: number; icon: React.ReactNode; tone: 'blue' | 'rose' | 'amber' | 'emerald' | 'violet' | 'sky'; active: boolean; onClick?: () => void }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
  };
  return (
    <button type="button" onClick={onClick} disabled={!onClick} aria-pressed={active} className={cn('flex min-w-0 w-full items-center gap-2 rounded-xl border px-2 py-2 text-left transition-all', tones[tone], active ? 'ring-2 ring-violet-300 ring-offset-1' : onClick && 'hover:-translate-y-0.5 hover:shadow-sm')}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/80">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block truncate text-[8px] font-semibold uppercase tracking-wide opacity-75">{label}</span>
      </span>
    </button>
  );
}

function RegionChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn('flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left shadow-sm transition-colors', active ? 'border-violet-300 bg-violet-100 text-violet-800' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200')}>
      <MapPin className="h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="block max-w-[128px] truncate text-[9px] font-bold">{label}</span>
        <span className="mt-0.5 block text-[8px] opacity-70">{count} oportunidade{count === 1 ? '' : 's'}</span>
      </span>
    </button>
  );
}

function OpportunityCard({ store, priority, selected, onToggle, onHover }: { store: RouteOpportunityPanelItem; priority: RouteOpportunityPriorityBand; selected: boolean; onToggle: () => void; onHover?: (id: string | null) => void }) {
  const activeOpportunities = opportunityBadges.filter((item) => item.active(store));
  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      onMouseEnter={() => onHover?.(store.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(store.id)}
      onBlur={() => onHover?.(null)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-3.5 outline-none transition duration-150 [content-visibility:auto] [contain-intrinsic-size:176px]',
        'hover:z-10 hover:-translate-y-0.5 hover:scale-[1.01] hover:border-violet-300 hover:shadow-xl hover:shadow-violet-900/10 focus-visible:ring-2 focus-visible:ring-violet-400',
        selected ? 'border-violet-300 bg-gradient-to-br from-white to-violet-50 shadow-md shadow-violet-900/10' : 'border-slate-200/90 shadow-sm shadow-slate-900/[0.04]'
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-500 to-blue-500" />}
      <div className="flex items-start gap-3">
        <PriorityBadge band={priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[13px] font-bold leading-snug text-slate-900" title={store.nome}>{store.nome}</h3>
              <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
                <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate">{[store.municipio, store.uf].filter(Boolean).join('/')}</span>
              </p>
            </div>
            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors', selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-transparent group-hover:border-violet-400')}>
              <Check className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
            {store.codAg && <span className="rounded-md bg-slate-100 px-1.5 py-1">Ag. {store.codAg}</span>}
            {store.routeRole && <span className="rounded-md bg-blue-50 px-1.5 py-1 text-blue-700">{routeRoleLabel[store.routeRole]}</span>}
            <span className="rounded-md bg-slate-50 px-1.5 py-1 text-slate-500">{priorityLabel[priority]}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2.5">
        <p className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">Oportunidades identificadas</p>
        <div className="flex flex-wrap gap-1.5">
          {activeOpportunities.length > 0 ? activeOpportunities.map((item) => (
            <span key={item.key} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold', item.className)}>
              <Check className="h-2.5 w-2.5" />
              {item.label}
            </span>
          )) : <span className="text-[9px] font-medium text-slate-400">Nenhuma oportunidade sinalizada</span>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <CardMetric icon={<Route className="h-3 w-3" />} label="Desvio" value={`+${store.deviationMinutes} min`} />
        <CardMetric icon={<History className="h-3 w-3" />} label="Sem visita" value={`${store.daysWithoutVisit} dias`} />
        <CardMetric icon={<Check className="h-3 w-3" />} label="No roteiro" value={selected ? 'Selecionada' : 'Adicionar'} active={selected} />
      </div>
    </article>
  );
}

function PriorityBadge({ band }: { band: RouteOpportunityPriorityBand }) {
  const optimal = band === 'baixa';
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm', band === 'alta' && 'border-rose-200 bg-rose-100 text-rose-600', band === 'media' && 'border-amber-200 bg-amber-100 text-amber-600', band === 'baixa' && 'border-emerald-200 bg-emerald-100 text-emerald-600')} role="img" aria-label={`Prioridade: ${priorityLabel[band]}`} title={priorityLabel[band]}>
      {optimal ? <Check className="h-4 w-4 stroke-[2.5]" /> : <TriangleAlert className="h-4 w-4 stroke-[2.25]" />}
    </span>
  );
}

function CardMetric({ icon, label, value, active = false }: { icon: React.ReactNode; label: string; value: string; active?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-xl border px-2 py-2', active ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-100 bg-slate-50 text-slate-600')}>
      <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wide opacity-70">{icon}<span className="truncate">{label}</span></div>
      <p className="mt-1 truncate text-[9px] font-bold" title={value}>{value}</p>
    </div>
  );
}

function RouteMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 text-center">
      <div className="flex items-center justify-center gap-1 text-[8px] font-medium text-slate-400">{icon}<span className="truncate">{label}</span></div>
      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-800" title={value}>{value}</p>
    </div>
  );
}

export default RouteOpportunitiesSidePanel;
