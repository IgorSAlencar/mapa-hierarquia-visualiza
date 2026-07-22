import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import DistanceAnalysisPanel from '@/components/navigator/DistanceAnalysisPanel';
import type { VisitRoute, VisitStop } from '@/data/visitRoutes';
import type { RegionMapPoint } from '@/data/regionMapPointsMock';
import type { DeviceLocation } from '@/lib/deviceGeolocation';
import type { DistanceAnalysisMapPoint, DistanceAnalysisMapSelection } from '@/lib/distanceAnalysis';
import type { SqlMapPoint } from '@/lib/mapDataApi';
import { usePanelDrag } from '@/hooks/usePanelDrag';
import {
  FILTROS_INICIAIS,
  buildSqlHierarchyFilterFromUi,
  type FiltrosEstrutura,
  getMarcadoresParaFiltros,
} from '@/data/commercialStructureMock';
import { Map, Building2, X } from 'lucide-react';
import { LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchDrivingRoute } from '@/lib/mapboxDirections';
import { useAuth } from '@/context/AuthContext';
import type { AuthUser } from '@/lib/authApi';

const NAVIGATOR_PANEL_DOCK = { x: 16, y: 150 } as const;
const DISTANCE_PANEL_TOP = 150;
const PLANNER_ROUTE_START_MINUTES = 8 * 60;

const ROLE_LABEL: Record<AuthUser['role'], string> = {
  admin: 'Administrador',
  gerente_area: 'Gerente de Gestão',
  coordenador: 'Gerente Comercial III',
  supervisor: 'Gerente Comercial',
};

function baseFiltersForUser(user: AuthUser | null): FiltrosEstrutura {
  const base = { ...FILTROS_INICIAIS };
  if (!user || user.isAdmin || !user.scope) return base;
  if (user.scope.gerenciasArea.length === 1) {
    base.chaveGerenciaArea = String(user.scope.gerenciasArea[0]);
  }
  if (user.role !== 'gerente_area' && user.scope.coordenacoes.length === 1) {
    base.chaveCoordenacao = String(user.scope.coordenacoes[0]);
  }
  if (user.role === 'supervisor' && user.scope.supervisoes.length === 1) {
    base.chaveSupervisao = String(user.scope.supervisoes[0]);
  }
  return base;
}

function formatRouteDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}min`;
}

function formatRouteClock(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const remainingMinutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

function manualRouteId(routeId: string, stops: VisitStop[]): string {
  const baseId = routeId.replace(/-manual-order-[\d_-]+$/, '');
  return `${baseId}-manual-order-${stops.map((stop) => stop.id).join('_')}`;
}

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
  const { user, logout } = useAuth();
  const baseFilters = useMemo(() => baseFiltersForUser(user), [user]);
  const [filters, setFilters] = useState<FiltrosEstrutura>(() => baseFiltersForUser(user));
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [territoryFocusTick, setTerritoryFocusTick] = useState(0);

  useEffect(() => {
    setFilters(baseFilters);
  }, [baseFilters]);

  const [navigatorMinimized, setNavigatorMinimized] = useState(true);
  const [activeSection, setActiveSection] = useState<NavigatorSection | null>(null);
  const [activeRoute, setActiveRoute] = useState<VisitRoute | null>(null);
  const activeRouteIdRef = useRef<string | null>(null);
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
  const [plannerVisibleStoreIds, setPlannerVisibleStoreIds] = useState<string[] | null>(null);
  const [plannerOpportunityFocus, setPlannerOpportunityFocus] = useState<PlannerOpportunityFocus | null>(null);
  const [plannerHoveredStoreId, setPlannerHoveredStoreId] = useState<string | null>(null);
  const [plannerStoreClassifications, setPlannerStoreClassifications] = useState<Record<string, 'alta' | 'media' | 'baixa'>>({});
  const [plannerResultsPanelExpanded, setPlannerResultsPanelExpanded] = useState(false);
  const [plannerRouteReviewOpen, setPlannerRouteReviewOpen] = useState(false);
  const [distanceAnalysisRoute, setDistanceAnalysisRoute] = useState<VisitRoute | null>(null);
  const [distanceMapSelection, setDistanceMapSelection] = useState<DistanceAnalysisMapSelection | null>(null);
  const [compareSupervisionAreas, setCompareSupervisionAreas] = useState(false);
  const [compareApplyTick, setCompareApplyTick] = useState(0);
  /** "Todos" em GG e GC III: compara as áreas de toda a estrutura. */
  const [compareAllTerritory, setCompareAllTerritory] = useState(false);

  const navigatorDrag = usePanelDrag(NAVIGATOR_PANEL_DOCK);
  const visitasDrag = usePanelDrag({ x: 332, y: 150 });
  const plannerDrag = usePanelDrag(NAVIGATOR_PANEL_DOCK);
  const compararDrag = usePanelDrag({ x: 332, y: 150 });
  const distanceDrag = usePanelDrag({ x: 316, y: DISTANCE_PANEL_TOP });
  // Abre encostado à direita, antes da coluna de controles do mapa, com o topo
  // alinhado ao dock de controles (top-4 = 16px). Offset = 16 (margem à direita)
  // + 56 (largura do dock) + 12 (mesmo respiro da legenda até os botões).
  const [routeDetailsInitial] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 320 - 84) : 678,
    y: 16,
  }));
  const routeDetailsDrag = usePanelDrag(routeDetailsInitial);
  const setRouteDetailsPosition = routeDetailsDrag.setPosition;
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

  const positionRouteDetails = useCallback((resultsPanelExpanded: boolean) => {
    const viewportWidth = window.innerWidth;
    const resultsPanelWidth = Math.min(viewportWidth * 0.96, 480);
    const canPlaceBesideResults = resultsPanelExpanded && viewportWidth >= resultsPanelWidth + 420;
    setRouteDetailsPosition({
      x: canPlaceBesideResults
        ? Math.max(16, Math.round(viewportWidth - resultsPanelWidth - 320 - 84))
        : Math.max(16, viewportWidth - 320 - 84),
      y: 16,
    });
  }, [setRouteDetailsPosition]);

  const activeRouteId = activeRoute?.id ?? null;
  useEffect(() => {
    if (!activeRouteId || !routeDetailsOpen || activeSection !== 'planejar') return;
    positionRouteDetails(plannerResultsPanelExpanded);
  }, [activeRouteId, activeSection, plannerResultsPanelExpanded, positionRouteDetails, routeDetailsOpen]);

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
    setVisitFocus(null);
    setPlannerAgencyFocus({ tick: Date.now(), ...endpoint });
  }, []);

  const handlePlannerOriginStoreFocus = useCallback((store: SqlMapPoint) => {
    const codAg = String(store.codAg ?? '').trim();
    const endpoint: PlannerRouteEndpoint = {
      id: store.id,
      nome: store.nome,
      codAg: codAg || undefined,
      lngLat: store.lngLat,
      enderecoFormatado: store.enderecoFormatado ?? undefined,
    };
    setPlannerOriginAgency(endpoint);
    setPlannerDestination(null);
    setPlannerTerritoryRadiusKm(null);
    setPlannerSelectedStoreIds([]);
    setPlannerOpportunityFocus(null);
    setVisitFocus({ tick: Date.now(), stopId: null });
    setPlannerAgencyFocus(codAg ? { tick: Date.now(), ...endpoint, codAg } : null);
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
    setVisitFocus(null);
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
    setVisitFocus(null);
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
      id: `origin-location-${location.longitude.toFixed(6)}-${location.latitude.toFixed(6)}`,
      nome: location.label ?? 'Endereço selecionado',
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
    activeRouteIdRef.current = null;
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
    const leavingPlanner = activeSection === 'planejar' && section !== 'planejar';
    setActiveSection(section);
    if (section === 'planejar') {
      const viewportHeight = window.innerHeight;
      const compactNotebook = window.innerWidth <= 1600 && viewportHeight <= 900;
      const plannerHeightLimit = compactNotebook ? 468 : 520;
      const plannerHeight = Math.min(
        plannerHeightLimit,
        Math.max(320, viewportHeight - 96)
      );
      const responsivePlannerTop = Math.max(
        16,
        Math.min(150, Math.round((viewportHeight - plannerHeight) / 2))
      );
      navigatorDrag.setPosition(NAVIGATOR_PANEL_DOCK);
      plannerDrag.setPosition({
        x: NAVIGATOR_PANEL_DOCK.x,
        y: responsivePlannerTop,
      });
      setNavigatorMinimized(true);
    }
    if (section === 'distancia') {
      navigatorDrag.setPosition(NAVIGATOR_PANEL_DOCK);
      distanceDrag.setPosition({ x: 16, y: DISTANCE_PANEL_TOP });
      setNavigatorMinimized(true);
    }
    if (section !== 'planejar') {
      setPlannerTerritory(null);
      setPlannerTerritoryRadiusKm(null);
      setPlannerAgencyFocus(null);
      setPlannerOriginAgency(null);
      setPlannerDestination(null);
      setPlannerSqlStores([]);
      setPlannerSelectedStoreIds([]);
      setPlannerVisibleStoreIds(null);
      setPlannerOpportunityFocus(null);
      setPlannerHoveredStoreId(null);
      setPlannerStoreClassifications({});
      setPlannerResultsPanelExpanded(false);
      setPlannerRouteReviewOpen(false);
    }
    if (section !== 'distancia') {
      setDistanceAnalysisRoute(null);
      setDistanceMapSelection(null);
    }
    if (leavingPlanner || (section !== 'visitas' && section !== 'planejar')) clearVisitState();
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

  const handleRouteChange = (route: VisitRoute | null, options?: { resultsPanelExpanded?: boolean; resetManualOrder?: boolean }) => {
    const currentRouteId = activeRouteIdRef.current;
    if (
      route &&
      !options?.resetManualOrder &&
      currentRouteId?.startsWith(`${route.id}-manual-order-`)
    ) {
      return;
    }
    const isNewRoute = Boolean(route && activeRouteIdRef.current !== route.id);
    activeRouteIdRef.current = route?.id ?? null;
    if (route && isNewRoute) {
      positionRouteDetails(options?.resultsPanelExpanded ?? plannerResultsPanelExpanded);
      setRouteDetailsOpen(true);
      setSelectedStopId(null);
      // O MapComponent já faz fitBounds ao receber a nova rota; evitar um
      // segundo movimento de câmera que competia com o sync das camadas.
    }
    setActiveRoute(route);
    if (!route) {
      setRouteDetailsOpen(false);
      setSelectedStopId(null);
      setVisitFocus(null);
    }
  };

  const handlePlannerStopsReorder = (stops: VisitStop[]) => {
    if (!activeRoute || activeSection !== 'planejar') return;

    const timeSlots = activeRoute.stops.map((stop) => stop.horario);
    const reorderedStops = stops.map((stop, index) => ({
      ...stop,
      ordem: index + 1,
      horario: timeSlots[index] ?? stop.horario,
    }));
    const reorderedRoute: VisitRoute = {
      ...activeRoute,
      id: manualRouteId(activeRoute.id, reorderedStops),
      stops: reorderedStops,
      routeGeometry: undefined,
      distanceMeters: undefined,
      saved: undefined,
    };

    activeRouteIdRef.current = reorderedRoute.id;
    setActiveRoute(reorderedRoute);
    setSelectedStopId((current) => reorderedStops.some((stop) => stop.id === current) ? current : null);

    const coordinates: [number, number][] = [
      ...(reorderedRoute.origin
        ? [[reorderedRoute.origin.lng, reorderedRoute.origin.lat] as [number, number]]
        : []),
      ...reorderedStops.map((stop) => [stop.lng, stop.lat] as [number, number]),
      ...(reorderedRoute.destination
        ? [[reorderedRoute.destination.lng, reorderedRoute.destination.lat] as [number, number]]
        : []),
    ];
    if (coordinates.length < 2) return;

    void fetchDrivingRoute(reorderedRoute.id, coordinates).then((drivingRoute) => {
      if (!drivingRoute) return;
      const minutesPerVisit = reorderedRoute.durationBreakdown?.minutesPerVisit ?? 40;
      let elapsedMinutes = 0;
      const hasOrigin = Boolean(reorderedRoute.origin);
      const recalculatedStops = reorderedStops.map((stop, index) => {
        const legIndex = hasOrigin ? index : index - 1;
        if (legIndex >= 0) {
          elapsedMinutes += Math.ceil((drivingRoute.legDurationsSeconds[legIndex] ?? 0) / 60);
        }
        const horario = formatRouteClock(PLANNER_ROUTE_START_MINUTES + elapsedMinutes);
        elapsedMinutes += minutesPerVisit;
        return { ...stop, horario };
      });
      const travelMinutes = Math.ceil(drivingRoute.durationSeconds / 60);
      const visitMinutes = recalculatedStops.length * minutesPerVisit;

      setActiveRoute((current) => current?.id === reorderedRoute.id ? {
        ...current,
        distanceMeters: Math.round(drivingRoute.distanceMeters),
        routeGeometry: drivingRoute.geometry,
        stops: recalculatedStops,
        distanciaKm: Math.max(1, Math.round(drivingRoute.distanceMeters / 1000)),
        duracaoEstimada: formatRouteDuration(travelMinutes + visitMinutes),
        durationBreakdown: {
          travelMinutes,
          visitMinutes,
          minutesPerVisit,
          source: 'calculated',
        },
      } : current);
    });
  };

  const handleStopStep = (direction: -1 | 1) => {
    if (!activeRoute || !selectedStop) return;
    const next = activeRoute.stops.find((stop) => stop.ordem === selectedStop.ordem + direction);
    if (next) setSelectedStopId(next.id);
  };

  const handleNavigatorMinimize = () => {
    navigatorDrag.setPosition(NAVIGATOR_PANEL_DOCK);
    if (activeSection === 'distancia') distanceDrag.setPosition({ x: 16, y: DISTANCE_PANEL_TOP });
    setNavigatorMinimized(true);
  };

  const handleNavigatorRestore = () => {
    if (activeSection === 'distancia') distanceDrag.setPosition({ x: 316, y: DISTANCE_PANEL_TOP });
    setNavigatorMinimized(false);
  };

  const navigatorOverlays = (
    <>
      {navigatorMinimized ? (
        <NavigatorPanel
          minimized
          onMinimize={handleNavigatorMinimize}
          onRestore={handleNavigatorRestore}
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
        />
      ) : (
        <>
          <NavigatorPanel
            minimized={false}
            onMinimize={handleNavigatorMinimize}
            onRestore={handleNavigatorRestore}
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

      {/* O planejador é irmão do painel Navegar: minimizar o menu não desmonta o roteiro. */}
      {activeSection === 'planejar' && (
        <RoutePlannerPanel
          onBack={() => handleSelectSection(null)}
          onClose={() => handleSelectSection(null)}
          onRouteChange={handleRouteChange}
          onAgencyFocus={handlePlannerOriginAgencyFocus}
          onOriginStoreFocus={handlePlannerOriginStoreFocus}
          onOriginLocationFocus={handlePlannerOriginLocationFocus}
          onOriginClear={clearPlannerOrigin}
          onDestinationAgencyFocus={handlePlannerDestinationAgencyFocus}
          onDestinationLocationFocus={handlePlannerDestinationLocationFocus}
          onDestinationClear={clearPlannerDestination}
          onTerritoryRadiusChange={handlePlannerTerritoryRadiusChange}
          onOpportunitySelectionChange={setPlannerSelectedStoreIds}
          onOpportunityVisibilityChange={setPlannerVisibleStoreIds}
          onOpportunityFocus={handlePlannerOpportunityFocus}
          onOpportunityHover={setPlannerHoveredStoreId}
          onOpportunityClassificationsChange={setPlannerStoreClassifications}
          onResultsPanelExpandedChange={setPlannerResultsPanelExpanded}
          routeReviewOpen={plannerRouteReviewOpen}
          onRouteReviewOpenChange={setPlannerRouteReviewOpen}
          plannerStores={plannerSqlStores}
          territory={plannerTerritory}
          shellStyle={plannerDrag.shellStyle}
          headerDragProps={plannerDrag.headerDragProps}
        />
      )}

      {activeSection === 'distancia' && (
        <DistanceAnalysisPanel
          onBack={() => {
            handleSelectSection(null);
            navigatorDrag.setPosition(NAVIGATOR_PANEL_DOCK);
            setNavigatorMinimized(false);
          }}
          onClose={() => handleSelectSection(null)}
          onRouteChange={setDistanceAnalysisRoute}
          mapSelection={distanceMapSelection}
          shellStyle={distanceDrag.shellStyle}
          headerDragProps={distanceDrag.headerDragProps}
        />
      )}

      {activeRoute && routeDetailsOpen && (
        <RouteDetailsPanel
          route={activeRoute}
          selectedStopId={selectedStopId}
          onStopSelect={setSelectedStopId}
          onStopsReorder={activeSection === 'planejar'
            ? handlePlannerStopsReorder
            : undefined}
          onRouteSaved={(savedRoute) => {
            if (activeSection === 'planejar') {
              handleSelectSection(null);
              return;
            }
            activeRouteIdRef.current = savedRoute.id;
            setActiveRoute(savedRoute);
            setSelectedStopId(null);
          }}
          onBack={activeSection === 'planejar'
            ? () => {
                setPlannerRouteReviewOpen(false);
                handleRouteChange(null, { resultsPanelExpanded: true });
              }
            : undefined}
          onClose={activeSection === 'planejar'
            ? () => handleSelectSection(null)
            : () => handleRouteChange(null)}
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
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center gap-3">
              <div className="rounded-lg bg-map-primary/10 p-2">
                <Map className="h-6 w-6 text-map-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Mapa Comercial</h1>
                <p className="text-sm text-muted-foreground">
                  Gestão 360° - Igor Alencar
                </p>
              </div>
            </div>
            <div
              id="route-planner-header-summary"
              className="ml-auto hidden min-w-0 items-center justify-end md:flex"
              aria-live="polite"
            />
            {user && (
              <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-3">
                <div className="hidden items-center gap-2 rounded-xl border bg-background/70 px-3 py-1.5 sm:flex">
                  <UserRound className="h-4 w-4 text-map-primary" />
                  <div className="max-w-[190px] leading-tight">
                    <p className="truncate text-xs font-semibold">{user.nome}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {ROLE_LABEL[user.role]} · {user.funcional}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => void logout()} aria-label="Sair">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative h-[calc(100vh-81px)] overflow-hidden">
        <MapComponent
          mapMarkers={mapMarkers}
          hierarchyFilter={buildSqlHierarchyFilterFromUi(filters)}
          fitInitialAgencyScope={!user?.isAdmin}
          initialTerritoryRole={user?.role}
          territoryFocusTick={territoryFocusTick}
          filtersPanelOpen={filtersPanelOpen}
          onOpenFilters={() => setFiltersPanelOpen(true)}
          visitRoute={activeRoute ?? distanceAnalysisRoute ?? plannerPreviewRoute}
          selectedVisitStopId={selectedStopId}
          onVisitStopSelect={setSelectedStopId}
          visitFocus={visitFocus}
          plannerMode={activeSection === 'planejar'}
          onPlannerTerritorySelect={setPlannerTerritory}
          plannerAgencyFocus={plannerAgencyFocus}
          plannerRouteAgencies={plannerRouteAgencies}
          plannerTerritoryFocus={plannerTerritoryFocus}
          plannerSelectedStoreIds={plannerSelectedStoreIds}
          plannerVisibleStoreIds={plannerVisibleStoreIds}
          plannerOpportunityFocus={plannerOpportunityFocus}
          plannerHoveredStoreId={plannerHoveredStoreId}
          plannerStoreClassifications={plannerStoreClassifications}
          plannerResultsPanelExpanded={plannerResultsPanelExpanded}
          onPlannerStoresChange={setPlannerSqlStores}
          distanceAnalysisMode={activeSection === 'distancia'}
          onDistanceAnalysisPointSelect={(point: DistanceAnalysisMapPoint) => {
            setDistanceMapSelection({ tick: Date.now(), point });
          }}
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
              <CommercialStructureFilters
                filters={filters}
                onFiltersChange={setFilters}
                baseFilters={baseFilters}
                onReturnToTerritory={() => setTerritoryFocusTick((tick) => tick + 1)}
              />
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
