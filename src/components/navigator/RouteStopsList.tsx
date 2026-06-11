import React from 'react';
import { cn } from '@/lib/utils';
import type { VisitRoute, VisitStopStatus } from '@/data/visitRoutesMock';

export const STOP_STATUS_STYLE: Record<VisitStopStatus, { label: string; badge: string; dot: string }> = {
  concluida: {
    label: 'Concluída',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  pendente: {
    label: 'Pendente',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
};

interface RouteStopsListProps {
  route: VisitRoute;
  selectedStopId: number | null;
  onStopSelect: (stopId: number) => void;
  onViewFullRoute: () => void;
}

const RouteStopsList: React.FC<RouteStopsListProps> = ({
  route,
  selectedStopId,
  onStopSelect,
  onViewFullRoute,
}) => {
  const concluidas = route.stops.filter((s) => s.status === 'concluida').length;
  const pendentes = route.stops.length - concluidas;

  const summary = [
    { value: String(route.stops.length), label: 'Visitas planejadas', accent: 'text-slate-900' },
    { value: String(concluidas), label: 'Concluídas', accent: 'text-emerald-600' },
    { value: String(pendentes), label: 'Pendentes', accent: 'text-amber-600' },
    { value: `${route.distanciaKm} km`, label: 'Distância total', accent: 'text-slate-900' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-center"
          >
            <p className={cn('text-base font-bold leading-tight', item.accent)}>{item.value}</p>
            <p className="mt-0.5 text-[9px] font-medium leading-tight text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
        <p className="text-sm font-semibold text-slate-900">{route.duracaoEstimada}</p>
        <p className="text-[10px] font-medium text-slate-500">Duração estimada</p>
      </div>

      <ol className="space-y-2">
        {route.stops.map((stop) => {
          const style = STOP_STATUS_STYLE[stop.status];
          const isSelected = selectedStopId === stop.id;
          return (
            <li key={stop.id}>
              <button
                type="button"
                onClick={() => onStopSelect(stop.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-blue-300 bg-blue-50/80'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                    style.dot
                  )}
                >
                  {stop.ordem}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-900">{stop.nome}</span>
                  <span className="block text-[11px] text-slate-500">{stop.horario}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                    style.badge
                  )}
                >
                  {style.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={onViewFullRoute}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        Ver roteiro completo
      </button>
    </div>
  );
};

export default RouteStopsList;
