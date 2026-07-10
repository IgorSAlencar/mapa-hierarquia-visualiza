import React from 'react';
import type { CSSProperties } from 'react';
import { CalendarDays, Route as RouteIcon, X } from 'lucide-react';
import RouteStopsList from './RouteStopsList';
import type { VisitRoute } from '@/data/visitRoutesMock';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';

interface RouteDetailsPanelProps {
  route: VisitRoute;
  selectedStopId: number | null;
  onStopSelect: (stopId: number) => void;
  onViewFullRoute: () => void;
  /** Fecha apenas o painel; a rota permanece plotada no mapa. */
  onClose: () => void;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

/**
 * Painel flutuante com o roteiro do gerente selecionado. Abre ao lado do
 * painel de Visitas e Roteiros, sem overlay: o mapa continua interativo.
 */
const RouteDetailsPanel: React.FC<RouteDetailsPanelProps> = ({
  route,
  selectedStopId,
  onStopSelect,
  onViewFullRoute,
  onClose,
  shellStyle,
  headerDragProps,
}) => {
  const header = mergeHeaderDrag(
    'flex shrink-0 items-start gap-2 border-b border-slate-200 px-3 py-3',
    headerDragProps
  );

  return (
    <div
      style={shellStyle}
      className="pointer-events-auto flex max-h-full w-[320px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur-md"
    >
      <header
        className={header.className}
        style={header.dragStyle}
        {...header.dragHandlers}
        title="Arraste para mover o painel"
      >
        <span className="mt-0.5 rounded-lg bg-violet-50 p-1.5 text-violet-600">
          <RouteIcon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">
            {route.gerenteComercial}
          </p>
          <p className="truncate text-[11px] text-slate-500">{route.nome}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {route.data}
          </p>
        </div>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar detalhes do roteiro (mantém a rota no mapa)"
          title="Fechar (mantém a rota no mapa)"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <RouteStopsList
          route={route}
          selectedStopId={selectedStopId}
          onStopSelect={onStopSelect}
          onViewFullRoute={onViewFullRoute}
        />
      </div>
    </div>
  );
};

export default RouteDetailsPanel;
