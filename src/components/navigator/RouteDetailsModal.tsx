import React from 'react';
import { CalendarDays, Route as RouteIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import RouteStopsList from './RouteStopsList';
import type { VisitRoute } from '@/data/visitRoutesMock';

interface RouteDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: VisitRoute | null;
  selectedStopId: number | null;
  onStopSelect: (stopId: number) => void;
  onViewFullRoute: () => void;
}

const RouteDetailsModal: React.FC<RouteDetailsModalProps> = ({
  open,
  onOpenChange,
  route,
  selectedStopId,
  onStopSelect,
  onViewFullRoute,
}) => {
  if (!route) return null;

  const handleStopSelect = (stopId: number) => {
    onStopSelect(stopId);
    onOpenChange(false);
  };

  const handleViewFullRoute = () => {
    onViewFullRoute();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md gap-3 overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-2 pr-6 text-left">
            <span className="mt-0.5 rounded-lg bg-violet-50 p-1.5 text-violet-600">
              <RouteIcon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">{route.gerenteComercial}</DialogTitle>
              <DialogDescription className="truncate text-xs">{route.nome}</DialogDescription>
            </div>
          </div>
          <p className="flex items-center gap-1 text-[11px] text-slate-500">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {route.data}
          </p>
        </DialogHeader>

        <RouteStopsList
          route={route}
          selectedStopId={selectedStopId}
          onStopSelect={handleStopSelect}
          onViewFullRoute={handleViewFullRoute}
        />
      </DialogContent>
    </Dialog>
  );
};

export default RouteDetailsModal;
