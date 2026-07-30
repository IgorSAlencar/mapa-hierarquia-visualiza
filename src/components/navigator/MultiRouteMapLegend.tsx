import { CalendarRange, Crosshair, Focus, Layers3, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitRouteMapView } from '@/lib/visitRouteComparison';

interface MultiRouteMapLegendProps {
  view: VisitRouteMapView;
  selectedRouteId: string | null;
  isolatedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  onIsolateRoute: (routeId: string) => void;
  onShowAll: () => void;
  onFitRoutes: () => void;
  onClear: () => void;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${value}T12:00:00`));
}

const MultiRouteMapLegend = ({
  view,
  selectedRouteId,
  isolatedRouteId,
  onSelectRoute,
  onIsolateRoute,
  onShowAll,
  onFitRoutes,
  onClear,
}: MultiRouteMapLegendProps) => {
  const selected = view.items.find(({ route }) => route.id === selectedRouteId) ?? null;
  const title = view.mode === 'daily'
    ? `${view.items.length} rota${view.items.length === 1 ? '' : 's'} em ${shortDate(view.date)}`
    : `${view.items.length} rota${view.items.length === 1 ? '' : 's'} no período`;
  const selectedStops = selected?.route.stops.filter((stop) => stop.active !== false) ?? [];
  const selectedCompleted = selectedStops.filter(
    (stop) => stop.status === 'concluida' || stop.visitStatus === 'REALIZADA'
  ).length;
  return (
    <aside
      className="pointer-events-auto isolate w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/15"
      aria-label="Legenda das rotas no mapa"
    >
      <div className="flex items-start gap-3 border-b border-slate-200 px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
          {view.mode === 'daily'
            ? <Layers3 className="h-4 w-4" />
            : <CalendarRange className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600">
            {view.mode === 'daily' ? 'Comparação diária' : 'Evolução temporal'}
          </p>
          <p className="mt-0.5 truncate text-xs font-bold text-slate-900">{title}</p>
          {view.mode === 'daily' && view.missingSupervisionKeys.length > 0 && (
            <p className="mt-0.5 text-[10px] font-medium text-amber-700">
              {view.missingSupervisionKeys.length} selecionado
              {view.missingSupervisionKeys.length === 1 ? '' : 's'} sem roteiro
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Remover rotas do mapa"
          title="Remover rotas do mapa"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {view.mode === 'daily' ? (
        <div className="max-h-44 overflow-y-auto py-1">
          {view.items.map(({ route, color }) => {
            const active = route.id === selectedRouteId;
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(active ? null : route.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors',
                  active ? 'bg-indigo-50' : 'hover:bg-slate-50'
                )}
              >
                <span
                  className="h-2.5 w-7 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-800">
                  {route.owner?.nome ?? route.gerenteComercial}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                  {route.stops.filter((stop) => stop.active !== false).length} visitas
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="max-h-52 overflow-y-auto py-1">
          {view.items.map(({ route, color }) => {
            const active = route.id === selectedRouteId;
            const activeStops = route.stops.filter((stop) => stop.active !== false).length;
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(active ? null : route.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors',
                  active ? 'bg-blue-50' : 'hover:bg-slate-50'
                )}
              >
                <span className="relative h-3 w-7 shrink-0" aria-hidden>
                  <span
                    className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-slate-800">
                    {shortDate(route.plannedDate || route.data)} · {route.nome}
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-slate-500">
                    {activeStops} visita{activeStops === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="border-t border-slate-200 bg-white px-3.5 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-slate-900">
                {selected.route.owner?.nome ?? selected.route.gerenteComercial}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {shortDate(selected.route.plannedDate || selected.route.data)} · {selected.route.nome}
              </p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <span className="rounded-md bg-slate-50 px-1 py-1.5 text-[10px] font-semibold text-slate-700">
              {Math.round((selected.route.distanceMeters ?? selected.route.distanciaKm * 1000) / 1000)} km
            </span>
            <span className="rounded-md bg-slate-50 px-1 py-1.5 text-[10px] font-semibold text-slate-700">
              {selectedStops.length} visitas
            </span>
            <span className="rounded-md bg-emerald-50 px-1 py-1.5 text-[10px] font-semibold text-emerald-700">
              {selectedCompleted} realizadas
            </span>
          </div>
          <button
            type="button"
            onClick={() => isolatedRouteId === selected.route.id
              ? onShowAll()
              : onIsolateRoute(selected.route.id)}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
          >
            {isolatedRouteId === selected.route.id
              ? <RotateCcw className="h-3.5 w-3.5" />
              : <Focus className="h-3.5 w-3.5" />}
            {isolatedRouteId === selected.route.id ? 'Restaurar conjunto' : 'Isolar esta rota'}
          </button>
        </div>
      )}

      <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
        <button
          type="button"
          onClick={onShowAll}
          disabled={!selectedRouteId && !isolatedRouteId}
          className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-700 disabled:opacity-40"
        >
          Mostrar todas
        </button>
        <button
          type="button"
          onClick={onFitRoutes}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Enquadrar rotas
        </button>
      </div>
    </aside>
  );
};

export default MultiRouteMapLegend;
