import React from 'react';
import { Clock3, GripVertical, HelpCircle, Route as RouteIcon, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitRoute, VisitStop, VisitStopStatus } from '@/data/visitRoutes';
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
  onStopsReorder?: (stops: VisitStop[]) => void;
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
  onStopsReorder,
  footerAction,
}) => {
  const [isDurationTooltipOpen, setIsDurationTooltipOpen] = React.useState(false);
  const [draggedStopId, setDraggedStopId] = React.useState<number | null>(null);
  const [dragOverStopId, setDragOverStopId] = React.useState<number | null>(null);
  const isSuggestedRoute = Boolean(onStopsReorder);
  const canReorder = isSuggestedRoute && route.stops.length > 1;
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

  const fullSummary = [
    { value: String(route.stops.length), label: 'Visitas planejadas', accent: 'text-slate-900' },
    { value: String(concluidas), label: 'Concluídas', accent: 'text-emerald-600' },
    { value: String(pendentes), label: 'Pendentes', accent: 'text-amber-600' },
    { value: `${route.distanciaKm} km`, label: 'Distância total', accent: 'text-slate-900' },
  ];
  const summary = isSuggestedRoute
    ? [fullSummary[0], fullSummary[3]]
    : fullSummary;

  const commitReorder = (sourceId: number, insertionIndex: number) => {
    if (!onStopsReorder) return;
    const sourceIndex = route.stops.findIndex((stop) => stop.id === sourceId);
    if (sourceIndex < 0) return;

    const nextStops = [...route.stops];
    const [movedStop] = nextStops.splice(sourceIndex, 1);
    const adjustedIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
    const safeIndex = Math.max(0, Math.min(adjustedIndex, nextStops.length));
    nextStops.splice(safeIndex, 0, movedStop);

    if (nextStops.every((stop, index) => stop.id === route.stops[index]?.id)) return;
    onStopsReorder(nextStops.map((stop, index) => ({ ...stop, ordem: index + 1 })));
  };

  const moveStopWithKeyboard = (stopId: number, direction: -1 | 1) => {
    const sourceIndex = route.stops.findIndex((stop) => stop.id === stopId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= route.stops.length) return;

    const nextStops = [...route.stops];
    const [movedStop] = nextStops.splice(sourceIndex, 1);
    nextStops.splice(targetIndex, 0, movedStop);
    onStopsReorder?.(nextStops.map((stop, index) => ({ ...stop, ordem: index + 1 })));
  };

  return (
    <div className="space-y-3">
      <div className={cn('grid gap-2', isSuggestedRoute ? 'grid-cols-2' : 'grid-cols-4')}>
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
            sideOffset={15}
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

      {canReorder && (
        <p className="flex items-center gap-1.5 px-1 text-[10px] leading-relaxed text-slate-500">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          Arraste as visitas para alterar a ordem. <br/>O mapa e os horários serão atualizados.
        </p>
      )}

      <ol className={cn(
        'space-y-2',
        isSuggestedRoute && route.stops.length > 4 &&
          'max-h-60 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]'
      )}>
        {route.stops.map((stop) => {
          const style = STOP_STATUS_STYLE[stop.status];
          const isSelected = selectedStopId === stop.id;
          return (
            <li
              key={stop.id}
              draggable={canReorder}
              onDragStart={canReorder ? (event) => {
                setDraggedStopId(stop.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(stop.id));
              } : undefined}
              onDragEnd={canReorder ? () => {
                setDraggedStopId(null);
                setDragOverStopId(null);
              } : undefined}
              onDragOver={canReorder ? (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverStopId(stop.id);
              } : undefined}
              onDrop={canReorder ? (event) => {
                event.preventDefault();
                if (draggedStopId == null) return;
                const targetIndex = route.stops.findIndex((item) => item.id === stop.id);
                if (targetIndex < 0) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const insertAfter = event.clientY >= rect.top + rect.height / 2;
                commitReorder(draggedStopId, targetIndex + (insertAfter ? 1 : 0));
                setDraggedStopId(null);
                setDragOverStopId(null);
              } : undefined}
              className={cn(
                'flex items-stretch overflow-hidden rounded-xl border transition-colors',
                isSelected
                  ? 'border-blue-300 bg-blue-50/80'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                draggedStopId === stop.id && 'opacity-50',
                dragOverStopId === stop.id && draggedStopId !== stop.id && 'border-blue-400 ring-2 ring-blue-100',
                canReorder && 'cursor-grab active:cursor-grabbing'
              )}
            >
              {canReorder && (
                <button
                  type="button"
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      moveStopWithKeyboard(stop.id, -1);
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      moveStopWithKeyboard(stop.id, 1);
                    }
                  }}
                  className="flex w-8 shrink-0 cursor-grab items-center justify-center border-r border-slate-100 text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-blue-600 focus-visible:bg-blue-50 focus-visible:text-blue-700 active:cursor-grabbing"
                  aria-label={`Reordenar ${stop.nome}. Use as setas para cima ou para baixo.`}
                  title="Arraste para alterar a ordem"
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => onStopSelect(stop.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
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

      {footerAction ? <div className="flex gap-2">{footerAction}</div> : null}
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
