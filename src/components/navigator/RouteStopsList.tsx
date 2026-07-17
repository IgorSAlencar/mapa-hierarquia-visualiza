import React from 'react';
import { Clock3, HelpCircle, Route as RouteIcon, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitRoute, VisitStopStatus } from '@/data/visitRoutesMock';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  footerAction?: React.ReactNode;
}

const DEFAULT_VISIT_MINUTES = 40;

function formatDurationMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}min`;
}

function parseDurationMinutes(value: string): number {
  const hours = Number(value.match(/(\d+)\s*h/i)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)\s*m/i)?.[1] ?? 0);
  return hours * 60 + minutes;
}

const RouteStopsList: React.FC<RouteStopsListProps> = ({
  route,
  selectedStopId,
  onStopSelect,
  onViewFullRoute,
  footerAction,
}) => {
  const [isDurationTooltipOpen, setIsDurationTooltipOpen] = React.useState(false);
  const concluidas = route.stops.filter((s) => s.status === 'concluida').length;
  const pendentes = route.stops.length - concluidas;
  const fallbackVisitMinutes = route.stops.length * DEFAULT_VISIT_MINUTES;
  const fallbackTotalMinutes = parseDurationMinutes(route.duracaoEstimada);
  const durationBreakdown = route.durationBreakdown ?? {
    travelMinutes: Math.max(0, fallbackTotalMinutes - fallbackVisitMinutes),
    visitMinutes: fallbackVisitMinutes,
    minutesPerVisit: DEFAULT_VISIT_MINUTES,
    source: 'planned' as const,
  };

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

      <TooltipProvider delayDuration={180}>
        <Tooltip open={isDurationTooltipOpen} onOpenChange={setIsDurationTooltipOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onMouseEnter={() => setIsDurationTooltipOpen(true)}
              onMouseLeave={() => setIsDurationTooltipOpen(false)}
              onFocus={() => setIsDurationTooltipOpen(true)}
              onBlur={() => setIsDurationTooltipOpen(false)}
              className="group relative w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center outline-none transition-colors hover:border-blue-200 hover:bg-blue-50/60 focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={`Duração estimada de ${route.duracaoEstimada}. Passe o mouse para entender o cálculo.`}
            >
              <HelpCircle className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-blue-600" aria-hidden />
              <p className="text-sm font-semibold text-slate-900">{route.duracaoEstimada}</p>
              <p className="text-[10px] font-medium text-slate-500">Duração estimada</p>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="center"
            sideOffset={10}
            className="w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-700 shadow-xl"
          >
            <p className="text-xs font-bold text-slate-900">Como chegamos a esse tempo?</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Somamos o deslocamento entre os pontos com o tempo reservado para realizar cada visita.
            </p>

            <div className="mt-3 space-y-2">
              <DurationDetail
                icon={<RouteIcon className="h-3.5 w-3.5" />}
                label="Deslocamento pela rota"
                value={formatDurationMinutes(durationBreakdown.travelMinutes)}
              />
              <DurationDetail
                icon={<Store className="h-3.5 w-3.5" />}
                label={`${route.stops.length} visitas × ${durationBreakdown.minutesPerVisit} min`}
                value={formatDurationMinutes(durationBreakdown.visitMinutes)}
              />
              <div className="border-t border-slate-200 pt-2">
                <DurationDetail
                  icon={<Clock3 className="h-3.5 w-3.5" />}
                  label="Duração total estimada"
                  value={route.duracaoEstimada}
                  emphasized
                />
              </div>
            </div>

            <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[9px] leading-relaxed text-slate-500">
              Cada loja recebe uma janela operacional de {durationBreakdown.minutesPerVisit} minutos para atendimento, identificação de oportunidades e registro da visita.
              {durationBreakdown.source === 'approximate' && ' O deslocamento está aproximado e será atualizado ao calcular a rota viária.'}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

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

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <button
          type="button"
          onClick={onViewFullRoute}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Ver roteiro completo
        </button>
        {footerAction}
      </div>
    </div>
  );
};

function DurationDetail({
  icon,
  label,
  value,
  emphasized = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
        emphasized ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'
      )}>
        {icon}
      </span>
      <span className={cn(
        'min-w-0 flex-1 text-[10px]',
        emphasized ? 'font-semibold text-slate-800' : 'text-slate-600'
      )}>
        {label}
      </span>
      <strong className={cn(
        'shrink-0 text-[11px]',
        emphasized ? 'text-blue-700' : 'text-slate-900'
      )}>
        {value}
      </strong>
    </div>
  );
}

export default RouteStopsList;
