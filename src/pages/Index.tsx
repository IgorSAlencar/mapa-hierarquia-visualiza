import React, { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import MapComponent from '@/components/MapComponent';
import CommercialStructureFilters from '@/components/CommercialStructureFilters';
import NavigatorPanel, { type NavigatorSection } from '@/components/navigator/NavigatorPanel';
import CompararAreasPanel from '@/components/navigator/CompararAreasPanel';
import { HIERARCHY_ALL } from '@/components/navigator/HierarchyScopeSelect';
import VisitasRoteirosPanel from '@/components/navigator/VisitasRoteirosPanel';
import VisitStopDetailCard from '@/components/navigator/VisitStopDetailCard';
import RouteLegend from '@/components/navigator/RouteLegend';
import type { VisitRoute } from '@/data/visitRoutesMock';
import { usePanelDrag } from '@/hooks/usePanelDrag';
import {
  FILTROS_INICIAIS,
  buildSqlHierarchyFilterFromUi,
  type FiltrosEstrutura,
  getMarcadoresParaFiltros,
} from '@/data/commercialStructureMock';
import { Map, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NAVIGATOR_PANEL_DOCK = { x: 16, y: 150 } as const;

const Index = () => {
  const [filters, setFilters] = useState<FiltrosEstrutura>(FILTROS_INICIAIS);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

  const [navigatorMinimized, setNavigatorMinimized] = useState(true);
  const [activeSection, setActiveSection] = useState<NavigatorSection | null>(null);
  const [activeRoute, setActiveRoute] = useState<VisitRoute | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);
  const [visitFocus, setVisitFocus] = useState<{ tick: number; stopId: number | null } | null>(null);
  const [compareSupervisionAreas, setCompareSupervisionAreas] = useState(false);
  const [compareApplyTick, setCompareApplyTick] = useState(0);

  const navigatorDrag = usePanelDrag(NAVIGATOR_PANEL_DOCK);
  const visitasDrag = usePanelDrag({ x: 332, y: 150 });
  const compararDrag = usePanelDrag({ x: 332, y: 150 });
  const [stopDetailInitial] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 400) : 16,
    y: 96,
  }));
  const stopDetailDrag = usePanelDrag(stopDetailInitial);

  const mapMarkers = useMemo(() => getMarcadoresParaFiltros(filters), [filters]);

  const hasActiveFilter =
    Boolean(
      filters.diretoriaRegionalId ||
        filters.gerenteRegionalId ||
        filters.gerenteAreaId ||
        filters.coordenadorId ||
        filters.supervisorId ||
        filters.agenciaId
    );

  const selectedStop = useMemo(
    () => activeRoute?.stops.find((stop) => stop.id === selectedStopId) ?? null,
    [activeRoute, selectedStopId]
  );

  const clearVisitState = () => {
    setActiveRoute(null);
    setSelectedStopId(null);
    setVisitFocus(null);
  };

  const handleSelectSection = (section: NavigatorSection | null) => {
    setActiveSection(section);
    if (section !== 'visitas') clearVisitState();
  };

  const handleApplyCompare = (gerenciaSel: string, coordenacaoSel: string) => {
    flushSync(() => {
      setFilters((prev) => ({
        ...prev,
        chaveGerenciaArea: gerenciaSel === HIERARCHY_ALL ? '' : gerenciaSel,
        chaveCoordenacao: coordenacaoSel === HIERARCHY_ALL ? '' : coordenacaoSel,
        chaveSupervisao: '',
        supervisorId: '',
      }));
    });
    setCompareSupervisionAreas(true);
    setCompareApplyTick((tick) => tick + 1);
  };

  const handleRouteChange = (route: VisitRoute | null) => {
    setActiveRoute(route);
    setSelectedStopId(null);
  };

  const handleStopStep = (direction: -1 | 1) => {
    if (!activeRoute || !selectedStop) return;
    const next = activeRoute.stops.find((stop) => stop.ordem === selectedStop.ordem + direction);
    if (next) setSelectedStopId(next.id);
  };

  const handleNavigatorMinimize = () => {
    navigatorDrag.setPosition(NAVIGATOR_PANEL_DOCK);
    setNavigatorMinimized(true);
  };

  const navigatorOverlays = (
    <>
      {navigatorMinimized ? (
        <NavigatorPanel
          minimized
          onMinimize={handleNavigatorMinimize}
          onRestore={() => setNavigatorMinimized(false)}
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
        />
      ) : (
        <>
          <NavigatorPanel
            minimized={false}
            onMinimize={handleNavigatorMinimize}
            onRestore={() => setNavigatorMinimized(false)}
            activeSection={activeSection}
            onSelectSection={handleSelectSection}
            shellStyle={navigatorDrag.shellStyle}
            headerDragProps={navigatorDrag.headerDragProps}
          />
          {activeSection === 'visitas' && (
            <VisitasRoteirosPanel
              onBack={() => handleSelectSection(null)}
              onClose={() => handleSelectSection(null)}
              activeRoute={activeRoute}
              onRouteChange={handleRouteChange}
              selectedStopId={selectedStopId}
              onStopSelect={setSelectedStopId}
              onViewFullRoute={() => {
                setSelectedStopId(null);
                setVisitFocus({ tick: Date.now(), stopId: null });
              }}
              shellStyle={visitasDrag.shellStyle}
              headerDragProps={visitasDrag.headerDragProps}
            />
          )}
          {activeSection === 'comparar' && (
            <CompararAreasPanel
              onBack={() => handleSelectSection(null)}
              onClose={() => handleSelectSection(null)}
              compareActive={compareSupervisionAreas}
              onApplyCompare={handleApplyCompare}
              onDeactivateCompare={() => setCompareSupervisionAreas(false)}
              appliedGerenciaChave={filters.chaveGerenciaArea}
              appliedCoordenacaoChave={filters.chaveCoordenacao}
              shellStyle={compararDrag.shellStyle}
              headerDragProps={compararDrag.headerDragProps}
            />
          )}
        </>
      )}

      {activeRoute && (
        <div className="pointer-events-none absolute right-16 top-4">
          <RouteLegend />
        </div>
      )}

      {activeRoute && selectedStop && (
        <VisitStopDetailCard
          route={activeRoute}
          stop={selectedStop}
          onClose={() => setSelectedStopId(null)}
          onOpenOnMap={() => setVisitFocus({ tick: Date.now(), stopId: selectedStop.id })}
          onPrev={() => handleStopStep(-1)}
          onNext={() => handleStopStep(1)}
          shellStyle={stopDetailDrag.shellStyle}
          headerDragProps={stopDetailDrag.headerDragProps}
        />
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-map-surface/50 backdrop-blur-sm">
        <div className="w-full px-4 py-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-map-primary/10 rounded-lg">
              <Map className="h-6 w-6 text-map-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Mapa Comercial</h1>
              <p className="text-sm text-muted-foreground">
                Gestão 360° - Igor Alencar
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative h-[calc(100vh-81px)] overflow-hidden">
        <MapComponent
          mapMarkers={mapMarkers}
          hierarchyFilter={buildSqlHierarchyFilterFromUi(filters)}
          filtersPanelOpen={filtersPanelOpen}
          onOpenFilters={() => setFiltersPanelOpen(true)}
          visitRoute={activeRoute}
          selectedVisitStopId={selectedStopId}
          onVisitStopSelect={setSelectedStopId}
          visitFocus={visitFocus}
          compareSupervisionAreas={compareSupervisionAreas}
          onCompareSupervisionAreasChange={setCompareSupervisionAreas}
          compareApplyTick={compareApplyTick}
          navigatorOverlays={navigatorOverlays}
        />

        <div
          className={`absolute inset-0 z-30 bg-black/20 transition-opacity duration-300 ${
            filtersPanelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setFiltersPanelOpen(false)}
          aria-hidden={!filtersPanelOpen}
        />

        <aside
          className={`absolute inset-y-0 left-0 z-40 w-[90vw] max-w-sm border-r bg-background/95 backdrop-blur-md shadow-xl transition-transform duration-300 ease-out ${
            filtersPanelOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-hidden={!filtersPanelOpen}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Filtros da estrutura comercial</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setFiltersPanelOpen(false)}
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <CommercialStructureFilters filters={filters} onFiltersChange={setFilters} />
              {!hasActiveFilter && (
                <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground flex gap-2">
                  <Building2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Escolha pelo menos um nível ou uma agência para plotar pontos. Subir na escada
                    (ex.: só Diretoria) mostra toda a subárvore e as agências dos supervisores.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Index;
