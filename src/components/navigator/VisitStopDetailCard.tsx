import React from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, CalendarClock, MapPin, MapPinned, Package, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitRoute, VisitStop } from '@/data/visitRoutesMock';
import { STOP_STATUS_STYLE } from './RouteStopsList';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';

interface VisitStopDetailCardProps {
  route: VisitRoute;
  stop: VisitStop;
  onClose: () => void;
  onOpenOnMap: () => void;
  onPrev: () => void;
  onNext: () => void;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

const VisitStopDetailCard: React.FC<VisitStopDetailCardProps> = ({
  route,
  stop,
  onClose,
  onOpenOnMap,
  onPrev,
  onNext,
  shellStyle,
  headerDragProps,
}) => {
  const style = STOP_STATUS_STYLE[stop.status];
  const isFirst = stop.ordem <= 1;
  const isLast = stop.ordem >= route.stops.length;

  const header = mergeHeaderDrag(
    'flex items-start gap-2 border-b border-slate-200 px-3 py-3',
    headerDragProps
  );

  return (
    <div
      style={shellStyle}
      className="pointer-events-auto w-[320px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur-md"
    >
      <header
        className={header.className}
        style={header.dragStyle}
        {...header.dragHandlers}
        title="Arraste para mover o painel"
      >
        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white', style.dot)}>
          {stop.ordem}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">{stop.nome}</p>
          <p className="text-[11px] text-slate-500">{stop.horario}</p>
        </div>
        <span className={cn('shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold', style.badge)}>
          {style.label}
        </span>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar detalhes da visita"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-3 px-3 py-3">
        <div className="flex items-start gap-2 text-xs text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <p>
            {stop.endereco}
            <span className="block text-[11px] text-slate-500">{stop.cep}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenOnMap}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <MapPinned className="h-3.5 w-3.5" aria-hidden />
          Abrir no mapa
        </button>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
              <Package className="h-3 w-3" aria-hidden />
              Produto foco
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-900">{stop.produtoFoco}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
              <CalendarClock className="h-3 w-3" aria-hidden />
              Última visita
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-900">{stop.ultimaVisita}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Próxima ação</p>
          <p className="mt-1 text-xs leading-snug text-slate-700">{stop.proximaAcao}</p>
        </div>

        <button
          type="button"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          title="Detalhes da loja (em breve)"
        >
          Ver detalhes da loja
        </button>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Anterior
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={isLast}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-default disabled:opacity-50"
          >
            Próxima
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VisitStopDetailCard;
