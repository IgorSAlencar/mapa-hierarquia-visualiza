import React, { useCallback, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import MapComponent from '@/components/MapComponent';
import CommercialStructureFilters from '@/components/CommercialStructureFilters';
import NavigatorPanel, { type NavigatorSection } from '@/components/navigator/NavigatorPanel';
import CompararAreasPanel from '@/components/navigator/CompararAreasPanel';
import { HIERARCHY_ALL } from '@/components/navigator/HierarchyScopeSelect';
import VisitasRoteirosPanel from '@/components/navigator/VisitasRoteirosPanel';
import VisitStopDetailCard from '@/components/navigator/VisitStopDetailCard';
import RouteDetailsPanel from '@/components/navigator/RouteDetailsPanel';
import RoutePlannerPanel from '@/components/navigator/RoutePlannerPanel';
import type { VisitRoute } from '@/data/visitRoutesMock';
import type { RegionMapPoint } from '@/data/regionMapPointsMock';
import type { DeviceLocation } from '@/lib/deviceGeolocation';
import type { SqlMapPoint } from '@/lib/mapDataApi';
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

interface PlannerRouteEndpoint {
  id: string;
  nome: string;
  codAg?: string;
  lngLat: [number, number];
  enderecoFormatado?: string;
}

interface PlannerAgencyEndpoint extends PlannerRouteEndpoint {
  codAg: string;
}

interface PlannerOpportunityFocus {
  tick: number;
  id: string;
  lngLat: [number, number];
}

const Index = () => {
  const [filters, setFilters] = useState<FiltrosEstrutura>(FILTROS_INICIAIS);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

  const [navigatorMinimized, setNavigatorMinimized] = useState(true);
  const [activeSection, setActiveSection] = useState<NavigatorSection | null>(null);
  const [activeRoute, setActiveRoute] = useState<VisitRoute | null>(null);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);
  const [visitFocus, setVisitFocus] = useState<{ tick: number; stopId: number | null } | null>(null);
  const [plannerTerritory, setPlannerTerritory] = useState<string | null>(null);
  const [plannerTerritoryRadiusKm, setPlannerTerritoryRadiusKm] = useState<number | null>(null);
  const [plannerAgencyFocus, setPlannerAgencyFocus] = useState<(PlannerAgencyEndpoint & { tick: number }) | null>(null);
  const [plannerOriginAgency, setPlannerOriginAgency] = useState<PlannerRouteEndpoint | null>(null);
  const [plannerDestination, setPlannerDestination] = useState<PlannerRouteEndpoint | null>(null);
  const [plannerSqlStores, setPlannerSqlStores] = useState<SqlMapPoint[]>([]);
  const [plannerSelectedStoreIds, setPlannerSelectedStoreIds] = useState<string[]>([]);
  const [plannerOpportunityFocus, setPlannerOpportunityFocus] = useState<PlannerOpportunityFocus | null>(null);
  const [compareSupervisionAreas, setCompareSupervisionAreas] = useState(false);
  const [compareApplyTick, setCompareApplyTick] = useState(0);
  /** "Todos" em GG e GC III: compara as áreas de toda a estrutura. */
  const [compareAllTerritory, setCompareAllTerritory] = useState(false);

  const navigatorDrag = usePanelDrag(NAVIGATOR_PANEL_DOCK);
  const visitasDrag = usePanelDrag({ x: 332, y: 150 });
  const plannerDrag = usePanelDrag(NAVIGATOR_PANEL_DOCK);
  const compararDrag = usePanelDrag({ x: 332, y: 150 });
  // Abre encostado à direita, antes da coluna de controles do mapa, com o topo
  // alinhado ao dock de controles (top-4 = 16px). Offset = 16 (margem à direita)
  // + 56 (largura do dock) + 12 (mesmo respiro da legenda até os botões).
  const [routeDetailsInitial] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 320 - 84) : 678,
    y: 16,
  }));
  const routeDetailsDrag = usePanelDrag(routeDetailsInitial);
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

  const plannerPreviewRoute = useMemo<VisitRoute | null>(() => {
    if (!plannerOriginAgency || activeSection !== 'planejar') return null;
    return {
      id: `planner-preview-${plannerOriginAgency.id}-${plannerDestination?.id ?? 'origem'}`,
      chaveSupervisao: 0,
      gerenteComercial: 'Meu roteiro',
      nome: plannerDestination
        ? `${plannerOriginAgency.nome} → ${plannerDestination.nome}`
        : `Saída: ${plannerOriginAgency.nome}`,
      data: 'Prévia do roteiro',
      distanciaKm: 0,
      duracaoEstimada: 'Calculando...',
      stops: [],
      origin: {
        nome: plannerOriginAgency.nome,
        lng: plannerOriginAgency.lngLat[0],
        lat: plannerOriginAgency.lngLat[1],
      },
      destination: plannerDestination
        ? {
            nome: plannerDestination.nome,
            lng: plannerDestination.lngLat[0],
            lat: plannerDestination.lngLat[1],
          }
        : undefined,
    };
  }, [activeSection, plannerOriginAgency, plannerDestination]);

  const plannerRouteAgencies = useMemo(() => {
    if (!plannerOriginAgency || !plannerDestination || activeSection !== 'planejar') {
      return null;
    }
    return { origin: plannerOriginAgency, destination: plannerDestination };
  }, [activeSection, plannerOriginAgency, plannerDestination]);

  const plannerTerritoryFocus = useMemo(() => {
    if (!plannerOriginAgency || !plannerTerritoryRadiusKm || activeSection !== 'planejar') {
      return null;
    }
    return { center: plannerOriginAgency.lngLat, radiusKm: plannerTerritoryRadiusKm };
  }, [activeSection, plannerOriginAgency, plannerTerritoryRadiusKm]);

  const handlePlannerOriginAgencyFocus = useCallback((agency: RegionMapPoint) => {
    const codAg = String(agency.codAg ?? '').trim();
    if (!codAg) return;
    const endpoint: PlannerAgencyEndpoint = {
      id: agency.id,
      nome: agency.nome,
      codAg,
      lngLat: agency.lngLat,
      enderecoFormatado: agency.enderecoFormatado,
    };
    setPlannerOriginAgency(endpoint);
    setPlannerDestination(null);
    setPlannerTerritoryRadiusKm(null);
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setPlannerAgencyFocus({ tick: Date.now(), ...endpoint });
  }, []);

  const handlePlannerDestinationAgencyFocus = useCallback((agency: RegionMapPoint) => {
    const codAg = String(agency.codAg ?? '').trim();
    if (!codAg) return;
    setPlannerDestination({
      id: agency.id,
      nome: agency.nome,
      codAg,
      lngLat: agency.lngLat,
      enderecoFormatado: agency.enderecoFormatado,
    });
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setVisitFocus({ tick: Date.now(), stopId: null });
  }, []);

  const handlePlannerDestinationLocationFocus = useCallback((location: DeviceLocation) => {
    setPlannerDestination({
      id: `destination-location-${location.longitude.toFixed(6)}-${location.latitude.toFixed(6)}`,
      nome: location.label ?? 'Destino selecionado',
      lngLat: [location.longitude, location.latitude],
    });
    setPlannerTerritoryRadiusKm(null);
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setVisitFocus({ tick: Date.now(), stopId: null });
  }, []);

  const clearPlannerDestination = useCallback(() => {
    setPlannerDestination(null);
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setVisitFocus(null);
  }, []);

  const handlePlannerTerritoryRadiusChange = useCallback((radiusKm: number | null) => {
    setPlannerDestination(null);
    setPlannerTerritoryRadiusKm(radiusKm);
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setVisitFocus(null);
  }, []);

  const handlePlannerOriginLocationFocus = useCallback((location: DeviceLocation) => {
    const lngLat: [number, number] = [location.longitude, location.latitude];
    setPlannerOriginAgency({
      id: `device-location-${location.longitude.toFixed(6)}-${location.latitude.toFixed(6)}`,
      nome: location.label ?? 'Minha localização',
      lngLat,
    });
    setPlannerDestination(null);
    setPlannerTerritoryRadiusKm(null);
    setPlannerAgencyFocus(null);
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setVisitFocus({ tick: Date.now(), stopId: null });
  }, []);

  const clearPlannerOrigin = useCallback(() => {
    setPlannerOriginAgency(null);
    setPlannerDestination(null);
    setPlannerTerritoryRadiusKm(null);
    setPlannerAgencyFocus(null);
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setVisitFocus(null);
  }, []);

  const handlePlannerOpportunityFocus = useCallback((opportunity: {
    id: string;
    lngLat: [number, number];
  }) => {
    setPlannerOpportunityFocus({ ...opportunity, tick: Date.now() });
  }, []);

  const clearVisitState = () => {
    setActiveRoute(null);
    setRouteDetailsOpen(false);
    setSelectedStopId(null);
    setVisitFocus(null);
  };

  /** Desliga a comparação e desfaz o filtro de GG/GC III aplicado pelo painel. */
  const clearCompareState = () => {
    setCompareSupervisionAreas(false);
    setCompareAllTerritory(false);
    setFilters((prev) => ({
      ...prev,
      chaveGerenciaArea: '',
      chaveCoordenacao: '',
    }));
  };

  const handleSelectSection = (section: NavigatorSection | null) => {
    const leavingComparar = activeSection === 'comparar' && section !== 'comparar';
    setActiveSection(section);
    if (section !== 'planejar') {
      setPlannerTerritory(null);
      setPlannerTerritoryRadiusKm(null);
      setPlannerAgencyFocus(null);
      setPlannerOriginAgency(null);
      setPlannerDestination(null);
      setPlannerSqlStores([]);
      setPlannerSelectedStoreIds([]);
      setPlannerOpportunityFocus(null);
    }
    if (section !== 'visitas' && section !== 'planejar') clearVisitState();
    if (leavingComparar) clearCompareState();
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
    setCompareAllTerritory(gerenciaSel === HIERARCHY_ALL && coordenacaoSel === HIERARCHY_ALL);
    setCompareSupervisionAreas(true);
    setCompareApplyTick((tick) => tick + 1);
  };

  const handleCompareActiveChange = (active: boolean) => {
    setCompareSupervisionAreas(active);
    if (!active) setCompareAllTerritory(false);
  };

  const handleRouteChange = (route: VisitRoute | null) => {
    if (route) {
      setPlannerOriginAgency(null);
      setPlannerDestination(null);
      setPlannerTerritoryRadiusKm(null);
    }
    setActiveRoute(route);
    setRouteDetailsOpen(route != null);
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
              shellStyle={visitasDrag.shellStyle}
              headerDragProps={visitasDrag.headerDragProps}
            />
          )}
          {activeSection === 'planejar' && (
            <RoutePlannerPanel
              onBack={() => handleSelectSection(null)}
              onClose={() => handleSelectSection(null)}
              onRouteChange={handleRouteChange}
              onAgencyFocus={handlePlannerOriginAgencyFocus}
              onOriginLocationFocus={handlePlannerOriginLocationFocus}
              onOriginClear={clearPlannerOrigin}
              onDestinationAgencyFocus={handlePlannerDestinationAgencyFocus}
              onDestinationLocationFocus={handlePlannerDestinationLocationFocus}
              onDestinationClear={clearPlannerDestination}
              onTerritoryRadiusChange={handlePlannerTerritoryRadiusChange}
              onOpportunitySelectionChange={setPlannerSelectedStoreIds}
              onOpportunityFocus={handlePlannerOpportunityFocus}
              plannerStores={plannerSqlStores}
              territory={plannerTerritory}
              shellStyle={plannerDrag.shellStyle}
              headerDragProps={plannerDrag.headerDragProps}
            />
          )}
          {activeSection === 'comparar' && (
            <CompararAreasPanel
              onBack={() => handleSelectSection(null)}
              onClose={() => handleSelectSection(null)}
              compareActive={compareSupervisionAreas}
              onApplyCompare={handleApplyCompare}
              onDeactivateCompare={() => handleCompareActiveChange(false)}
              appliedGerenciaChave={filters.chaveGerenciaArea}
              appliedCoordenacaoChave={filters.chaveCoordenacao}
              shellStyle={compararDrag.shellStyle}
              headerDragProps={compararDrag.headerDragProps}
            />
          )}
        </>
      )}

      {activeRoute && routeDetailsOpen && (
        <RouteDetailsPanel
          route={activeRoute}
          selectedStopId={selectedStopId}
          onStopSelect={setSelectedStopId}
          onViewFullRoute={() => {
            setSelectedStopId(null);
            setVisitFocus({ tick: Date.now(), stopId: null });
          }}
          onClose={() => setRouteDetailsOpen(false)}
          shellStyle={routeDetailsDrag.shellStyle}
          headerDragProps={routeDetailsDrag.headerDragProps}
        />
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
          visitRoute={plannerPreviewRoute ?? activeRoute}
          selectedVisitStopId={selectedStopId}
          onVisitStopSelect={setSelectedStopId}
          visitFocus={visitFocus}
          plannerMode={activeSection === 'planejar'}
          onPlannerTerritorySelect={setPlannerTerritory}
          plannerAgencyFocus={plannerAgencyFocus}
          plannerRouteAgencies={plannerRouteAgencies}
          plannerTerritoryFocus={plannerTerritoryFocus}
          plannerSelectedStoreIds={plannerSelectedStoreIds}
          plannerOpportunityFocus={plannerOpportunityFocus}
          onPlannerStoresChange={setPlannerSqlStores}
          compareSupervisionAreas={compareSupervisionAreas}
          onCompareSupervisionAreasChange={handleCompareActiveChange}
          compareApplyTick={compareApplyTick}
          compareAllTerritory={compareAllTerritory}
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
