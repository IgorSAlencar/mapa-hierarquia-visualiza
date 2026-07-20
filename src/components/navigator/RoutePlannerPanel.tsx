import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  UsersRound,
  History,
  LayoutGrid,
  Table2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitRoute } from '@/data/visitRoutes';
import type { CSSProperties } from 'react';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from './mergeHeaderDrag';
import RoutePlanningJourney, { type PlanningPriority, type RoutePlanningScreen } from './RoutePlanningJourney';
import { fetchAgencyPoints, type SqlMapPoint } from '@/lib/mapDataApi';
import type { RegionMapPoint } from '@/data/regionMapPointsMock';
import type { DeviceLocation } from '@/lib/deviceGeolocation';
import RouteOpportunitiesSidePanel from './RouteOpportunitiesSidePanel';
import { fetchDrivingRoute } from '@/lib/mapboxDirections';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  OPPORTUNITY_DEFINITIONS,
  opportunityFocus,
  type OpportunityKey,
  type OpportunitySnapshot,
} from '@/data/opportunities';

interface Props {
  onBack: () => void;
  onClose: () => void;
  onRouteChange: (route: VisitRoute | null, options?: { resultsPanelExpanded?: boolean; resetManualOrder?: boolean }) => void;
  onAgencyFocus?: (agency: RegionMapPoint) => void;
  onOriginStoreFocus?: (store: SqlMapPoint) => void;
  onOriginLocationFocus?: (location: DeviceLocation) => void;
  onOriginClear?: () => void;
  onDestinationAgencyFocus?: (agency: RegionMapPoint) => void;
  onDestinationLocationFocus?: (location: DeviceLocation) => void;
  onDestinationClear?: () => void;
  onTerritoryRadiusChange?: (radiusKm: number | null) => void;
  onOpportunitySelectionChange?: (ids: string[]) => void;
  onOpportunityVisibilityChange?: (ids: string[] | null) => void;
  onOpportunityFocus?: (opportunity: { id: string; lngLat: [number, number] }) => void;
  onOpportunityHover?: (id: string | null) => void;
  onOpportunityClassificationsChange?: (classifications: Record<string, PriorityBand>) => void;
  onResultsPanelExpandedChange?: (expanded: boolean) => void;
  plannerStores: SqlMapPoint[];
  territory: string | null;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

const priorityBandLabel = { alta: 'Alerta', media: 'Atenção', baixa: 'Ótimo' };
const priorityLabel: Record<PlanningPriority, string> = {
  potencial: 'Maior potencial',
  sem_visita: 'Lojas sem visita',
  deslocamento: 'Menor deslocamento',
  alertas: 'Alertas e pendências',
  equilibrado: 'Critérios equilibrados',
};

type PriorityBand = 'alta' | 'media' | 'baixa';
type OpportunitySortKey = 'localidade' | 'desvio' | 'prioridade' | 'sem_visita';
type SortDirection = 'asc' | 'desc';
type ResizeCorner = 'north-west' | 'north-east' | 'south-west' | 'south-east';
type OpportunityFilterKey = OpportunityKey;
type DrivingMetricStatus = 'idle' | 'loading' | 'actual' | 'approximate';

const VISIT_DURATION_MINUTES = 40;
const ROUTE_START_MINUTES = 8 * 60;

const OPPORTUNITY_FILTER_OPTIONS = OPPORTUNITY_DEFINITIONS;

interface PlannerOpportunity extends OpportunitySnapshot {
  id: string;
  chaveLoja: string;
  nome: string;
  codAg: string;
  endereco: string;
  municipio: string;
  uf: string;
  lngLat: [number, number];
  routeRole: SqlMapPoint['routeRole'];
  potential: number;
  daysWithoutVisit: number;
  alerts: number;
  deviationMinutes: number;
}

function storeHasMissingOpportunity(store: PlannerOpportunity, filter: OpportunityFilterKey): boolean {
  const definition = OPPORTUNITY_DEFINITIONS.find((item) => item.key === filter);
  return definition ? !store[definition.field] : false;
}

function formatAgencyLabel(agency: RegionMapPoint | undefined): string {
  if (!agency) return '';
  const codAg = String(agency.codAg ?? '').trim();
  return codAg ? `${codAg} - ${agency.nome}` : agency.nome;
}

function stableMetric(seed: string, salt: string, min: number, max: number): number {
  let hash = 2166136261;
  for (const char of `${seed}|${salt}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return min + ((hash >>> 0) % (max - min + 1));
}

function sqlStoreLocation(point: SqlMapPoint): { municipio: string; uf: string } {
  return {
    municipio: String(point.municipio ?? '').trim() || 'Município não informado',
    uf: String(point.uf ?? '').trim().toUpperCase(),
  };
}

function opportunityRegionKey(store: Pick<PlannerOpportunity, 'municipio' | 'uf'>): string {
  return [store.municipio.trim(), store.uf.trim().toUpperCase()].join('|');
}

function toPlannerOpportunity(point: SqlMapPoint): PlannerOpportunity {
  const location = sqlStoreLocation(point);
  const seed = `${point.id}|${point.chaveLoja ?? ''}|${point.lngLat.join(',')}`;
  const baseDeviation = point.routeRole === 'corridor' ? 5 : 2;
  const opportunities: OpportunitySnapshot = {
    // Flags provisórias e estáveis até esses campos serem fornecidos pela API.
    oportunidadeCredito: stableMetric(seed, 'oportunidade-credito', 0, 1) === 1,
    oportunidadeCielo: stableMetric(seed, 'oportunidade-cielo', 0, 1) === 1,
    oportunidadeNegocio: stableMetric(seed, 'oportunidade-negocio', 0, 1) === 1,
    oportunidadeAtivoPade: stableMetric(seed, 'oportunidade-ativo-pade', 0, 1) === 1,
    oportunidadePropostaValor: stableMetric(seed, 'oportunidade-proposta-valor', 0, 1) === 1,
  };
  return {
    id: point.id || seed,
    chaveLoja: String(point.chaveLoja ?? '').trim(),
    nome: point.nome,
    codAg: String(point.codAg ?? '').trim(),
    endereco: String(point.enderecoFormatado ?? '').trim(),
    municipio: location.municipio,
    uf: location.uf,
    lngLat: point.lngLat,
    routeRole: point.routeRole,
    potential: Math.min(100, stableMetric(seed, 'potential', 35, 92) + (point.cieloM0 ? 4 : 0) + (point.checklist ? 4 : 0)),
    daysWithoutVisit: stableMetric(seed, 'days-without-visit', 4, 95),
    alerts: stableMetric(seed, 'alerts', 0, 3),
    deviationMinutes: stableMetric(seed, 'deviation', baseDeviation, point.routeRole === 'corridor' ? 28 : 14),
    ...opportunities,
  };
}

function priorityScore(store: PlannerOpportunity, priority: PlanningPriority): number {
  const visitScore = Math.min(100, store.daysWithoutVisit);
  const alertScore = Math.min(100, store.alerts * 30 + 10);
  const distanceScore = Math.max(0, 100 - store.deviationMinutes * 3);
  if (priority === 'potencial') return store.potential;
  if (priority === 'sem_visita') return visitScore;
  if (priority === 'alertas') return alertScore;
  if (priority === 'deslocamento') return distanceScore;
  return Math.round(
    store.potential * 0.35 + visitScore * 0.25 + alertScore * 0.25 + distanceScore * 0.15
  );
}

function completedPillarCount(store: PlannerOpportunity): number {
  return OPPORTUNITY_DEFINITIONS.filter((item) => store[item.field]).length;
}

function priorityBand(store: PlannerOpportunity): PriorityBand {
  const completedPillars = completedPillarCount(store);
  if (completedPillars <= 2) return 'alta';
  if (completedPillars <= 4) return 'media';
  return 'baixa';
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function orderStoresByNearestNeighbor(
  originCoordinates: [number, number],
  stores: PlannerOpportunity[]
): PlannerOpportunity[] {
  const ordered: PlannerOpportunity[] = [];
  const remaining = [...stores];
  let current = originCoordinates;
  while (remaining.length) {
    remaining.sort((a, b) => distanceKm(current, a.lngLat) - distanceKm(current, b.lngLat));
    const next = remaining.shift()!;
    ordered.push(next);
    current = next.lngLat;
  }
  return ordered;
}

function formatDurationMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return `${Math.floor(safeMinutes / 60)}h${String(safeMinutes % 60).padStart(2, '0')}`;
}

function formatClockMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const dayOffset = Math.floor(safeMinutes / (24 * 60));
  const clockMinutes = safeMinutes % (24 * 60);
  const clock = `${String(Math.floor(clockMinutes / 60)).padStart(2, '0')}:${String(clockMinutes % 60).padStart(2, '0')}`;
  return dayOffset > 0 ? `+${dayOffset}d ${clock}` : clock;
}

function drivingRouteCacheKey(date: string, coordinates: [number, number][]): string {
  let hash = 2166136261;
  const signature = `${date}|${coordinates.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';')}`;
  for (const char of signature) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `planejado-${date}-${(hash >>> 0).toString(36)}`;
}

function enrichRouteWithDrivingData(
  route: VisitRoute,
  distanceMeters: number,
  durationSeconds: number,
  legDurationsSeconds: number[],
  geometry: [number, number][]
): VisitRoute {
  let elapsedMinutes = 0;
  const stops = route.stops.map((stop, index) => {
    elapsedMinutes += Math.ceil((legDurationsSeconds[index] ?? 0) / 60);
    const horario = formatClockMinutes(ROUTE_START_MINUTES + elapsedMinutes);
    elapsedMinutes += VISIT_DURATION_MINUTES;
    return { ...stop, horario };
  });
  const travelMinutes = Math.ceil(durationSeconds / 60);
  const visitMinutes = stops.length * VISIT_DURATION_MINUTES;
  return {
    ...route,
    distanceMeters: Math.round(distanceMeters),
    routeGeometry: geometry,
    distanciaKm: Math.max(1, Math.round(distanceMeters / 1000)),
    duracaoEstimada: formatDurationMinutes(travelMinutes + visitMinutes),
    durationBreakdown: {
      travelMinutes,
      visitMinutes,
      minutesPerVisit: VISIT_DURATION_MINUTES,
      source: 'calculated',
    },
    stops,
  };
}

function createSqlSuggestedRoute({
  date,
  originName,
  originCoordinates,
  destinationName,
  destinationCoordinates,
  stores,
}: {
  date: string;
  originName: string;
  originCoordinates: [number, number];
  destinationName: string;
  destinationCoordinates: [number, number] | null;
  stores: PlannerOpportunity[];
}): VisitRoute | null {
  if (stores.length === 0) return null;
  const ordered = orderStoresByNearestNeighbor(originCoordinates, stores);
  const linePoints = [
    originCoordinates,
    ...ordered.map((store) => store.lngLat),
    ...(destinationCoordinates ? [destinationCoordinates] : []),
  ];
  const fallbackLegMinutes = linePoints.slice(1).map(
    (point, index) => Math.ceil((distanceKm(linePoints[index], point) / 45) * 60)
  );
  let elapsedMinutes = 0;
  const stops = ordered.map((store, index) => {
    elapsedMinutes += fallbackLegMinutes[index] ?? 0;
    const horario = formatClockMinutes(ROUTE_START_MINUTES + elapsedMinutes);
    elapsedMinutes += VISIT_DURATION_MINUTES;
    const opportunities: OpportunitySnapshot = {
      oportunidadeCielo: store.oportunidadeCielo,
      oportunidadeCredito: store.oportunidadeCredito,
      oportunidadeNegocio: store.oportunidadeNegocio,
      oportunidadeAtivoPade: store.oportunidadeAtivoPade,
      oportunidadePropostaValor: store.oportunidadePropostaValor,
    };
    const focus = opportunityFocus(opportunities);
    return {
    id: index + 1,
    ordem: index + 1,
    nome: store.nome,
    horario,
    status: 'pendente' as const,
    endereco: store.endereco || [store.municipio, store.uf].filter(Boolean).join('/'),
    cep: store.codAg ? `Agência vinculada: ${store.codAg}` : 'Visita planejada',
    chaveLoja: store.chaveLoja,
    codAg: store.codAg,
    oportunidades: opportunities,
    focos: focus.labels,
    produtoFoco: focus.text,
    ultimaVisita: `Há ${store.daysWithoutVisit} dias`,
    proximaAcao: store.alerts > 0
      ? `Verificar ${store.alerts} alerta${store.alerts === 1 ? '' : 's'} e desenvolver ${focus.text}.`
      : `Desenvolver ${focus.text} e registrar a visita.`,
    lat: store.lngLat[1],
    lng: store.lngLat[0],
  };
  });
  const totalKm = linePoints.slice(1).reduce(
    (total, point, index) => total + distanceKm(linePoints[index], point),
    0
  );
  const fallbackTravelMinutes = fallbackLegMinutes.reduce((total, minutes) => total + minutes, 0);

  return {
    id: drivingRouteCacheKey(date, linePoints),
    plannedDate: date,
    chaveSupervisao: 0,
    gerenteComercial: 'Meu roteiro',
    nome: `${originName} → ${destinationName}`,
    data: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(`${date}T12:00:00`)),
    distanciaKm: Math.round(totalKm),
    duracaoEstimada: `≈ ${formatDurationMinutes(fallbackTravelMinutes + stops.length * VISIT_DURATION_MINUTES)}`,
    durationBreakdown: {
      travelMinutes: fallbackTravelMinutes,
      visitMinutes: stops.length * VISIT_DURATION_MINUTES,
      minutesPerVisit: VISIT_DURATION_MINUTES,
      source: 'approximate',
    },
    stops,
    origin: { nome: originName, lng: originCoordinates[0], lat: originCoordinates[1] },
    destination: destinationCoordinates
      ? { nome: destinationName, lng: destinationCoordinates[0], lat: destinationCoordinates[1] }
      : undefined,
  };
}

const RoutePlannerPanel: React.FC<Props> = ({
  onBack,
  onClose,
  onRouteChange,
  onAgencyFocus,
  onOriginStoreFocus,
  onOriginLocationFocus,
  onOriginClear,
  onDestinationAgencyFocus,
  onDestinationLocationFocus,
  onDestinationClear,
  onTerritoryRadiusChange,
  onOpportunitySelectionChange,
  onOpportunityVisibilityChange,
  onOpportunityFocus,
  onOpportunityHover,
  onOpportunityClassificationsChange,
  onResultsPanelExpandedChange,
  plannerStores,
  territory,
  shellStyle,
  headerDragProps,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [agencies, setAgencies] = useState<RegionMapPoint[]>([]);
  const [journeyComplete, setJourneyComplete] = useState(false);
  const [journeyStartScreen, setJourneyStartScreen] = useState<RoutePlanningScreen>(0);
  const [resultsMinimized, setResultsMinimized] = useState(false);
  const [planningPriority, setPlanningPriority] = useState<PlanningPriority>('potencial');
  const [originId, setOriginId] = useState('');
  const [destination, setDestination] = useState('São Paulo');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>([]);
  const [onlyOnPath, setOnlyOnPath] = useState(true);
  const [query, setQuery] = useState('');
  const [opportunityView, setOpportunityView] = useState<'table' | 'cards'>('table');
  const [opportunityFiltersOpen, setOpportunityFiltersOpen] = useState(false);
  const [selectedOpportunityFilters, setSelectedOpportunityFilters] = useState<OpportunityFilterKey[]>([]);
  const [selectedPriorityBands, setSelectedPriorityBands] = useState<PriorityBand[]>([]);
  const [onlyWithoutVisit, setOnlyWithoutVisit] = useState(false);
  const [drivingMetrics, setDrivingMetrics] = useState<{
    distanceKm: number;
    travelMinutes: number;
    status: DrivingMetricStatus;
  }>({ distanceKm: 0, travelMinutes: 0, status: 'idle' });
  const [optimizing, setOptimizing] = useState(false);
  const drivingMetricsRequestRef = useRef(0);
  const optimizationRequestRef = useRef(0);
  const [originLocation, setOriginLocation] = useState<DeviceLocation | null>(null);
  const [originStore, setOriginStore] = useState<SqlMapPoint | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<DeviceLocation | null>(null);
  const [headerSummaryTarget, setHeaderSummaryTarget] = useState<HTMLElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth);
  const [resultsPanelSize, setResultsPanelSize] = useState<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const resizeRef = useRef<{
    corner: ResizeCorner;
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    maxWidth: number;
    maxHeight: number;
  } | null>(null);
  const opportunityFiltersRef = useRef<HTMLDivElement | null>(null);

  const startResultsResize = (corner: ResizeCorner, event: React.PointerEvent<HTMLSpanElement>) => {
    const panel = event.currentTarget.closest<HTMLElement>('[data-route-planner-results]');
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const growsWest = corner.endsWith('west');
    const growsNorth = corner.startsWith('north');
    resizeRef.current = {
      corner,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      offsetX: resultsPanelSize?.offsetX ?? 0,
      offsetY: resultsPanelSize?.offsetY ?? 0,
      maxWidth: Math.max(320, growsWest ? rect.right - 12 : window.innerWidth - rect.left - 12),
      maxHeight: Math.max(260, growsNorth ? rect.bottom - 12 : window.innerHeight - rect.top - 12),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const resizeResults = (event: React.PointerEvent<HTMLSpanElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const growsWest = resize.corner.endsWith('west');
    const growsNorth = resize.corner.startsWith('north');
    const deltaX = event.clientX - resize.startX;
    const deltaY = event.clientY - resize.startY;
    const minWidth = Math.min(560, resize.maxWidth);
    const minHeight = Math.min(320, resize.maxHeight);
    const width = Math.min(resize.maxWidth, Math.max(minWidth, resize.width + (growsWest ? -deltaX : deltaX)));
    const height = Math.min(resize.maxHeight, Math.max(minHeight, resize.height + (growsNorth ? -deltaY : deltaY)));
    setResultsPanelSize({
      width,
      height,
      offsetX: growsWest ? resize.offsetX + resize.width - width : resize.offsetX,
      offsetY: growsNorth ? resize.offsetY + resize.height - height : resize.offsetY,
    });
  };

  const stopResultsResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* captura já liberada */
    }
  };

  useEffect(() => {
    setHeaderSummaryTarget(document.getElementById('route-planner-header-summary'));
  }, []);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  useEffect(() => {
    onResultsPanelExpandedChange?.(journeyComplete && !resultsMinimized);
    return () => onResultsPanelExpandedChange?.(false);
  }, [journeyComplete, onResultsPanelExpandedChange, resultsMinimized]);

  useEffect(() => {
    if (!opportunityFiltersOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!opportunityFiltersRef.current?.contains(event.target as Node)) {
        setOpportunityFiltersOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [opportunityFiltersOpen]);

  useEffect(() => {
    let active = true;
    void fetchAgencyPoints()
      .then((points) => {
        if (!active || points.length === 0) return;
        const next: RegionMapPoint[] = points
          .filter((point) => point.kind === 'agencia')
          .map((point) => ({
            id: point.id,
            nome: point.nome,
            kind: 'agencia',
            lngLat: point.lngLat,
            codAg: point.codAg ?? undefined,
            enderecoFormatado: point.enderecoFormatado ?? undefined,
          }));
        if (next.length === 0) return;
        setAgencies(next);
        setOriginId((current) => next.some((agency) => agency.id === current) ? current : next[0].id);
      })
      .catch((error) => {
        console.error('Falha ao carregar agências no planejador:', error);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (territory) setDestination(territory);
  }, [territory]);

  const origin = agencies.find((agency) => agency.id === originId);
  const originAgencyLabel = formatAgencyLabel(origin);
  const sqlOpportunities = useMemo(() => {
    const unique = new Map<string, PlannerOpportunity>();
    for (const point of plannerStores) {
      if (point.kind !== 'loja') continue;
      const opportunity = toPlannerOpportunity(point);
      unique.set(opportunity.id, opportunity);
    }
    return [...unique.values()];
  }, [plannerStores]);
  const opportunityClassifications = useMemo(() => Object.fromEntries(
    sqlOpportunities.map((store) => [store.id, priorityBand(store)])
  ) as Record<string, PriorityBand>, [sqlOpportunities]);
  useEffect(() => {
    onOpportunityClassificationsChange?.(opportunityClassifications);
  }, [onOpportunityClassificationsChange, opportunityClassifications]);
  useEffect(() => () => {
    onOpportunityClassificationsChange?.({});
  }, [onOpportunityClassificationsChange]);
  useEffect(() => {
    const visibleIds = new Set(sqlOpportunities.map((store) => store.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [sqlOpportunities]);
  useEffect(() => {
    onOpportunitySelectionChange?.(selectedIds);
  }, [onOpportunitySelectionChange, selectedIds]);
  const rankedSuggestions = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('pt-BR');
    const stores = sqlOpportunities.filter((store) => !text ||
      `${store.nome} ${store.municipio} ${store.uf} ${store.codAg} ${store.endereco}`
        .toLocaleLowerCase('pt-BR')
        .includes(text));
    return stores.sort((a, b) =>
      priorityScore(b, planningPriority) - priorityScore(a, planningPriority) ||
      a.nome.localeCompare(b.nome, 'pt-BR')
    );
  }, [sqlOpportunities, query, planningPriority]);
  const nearbyGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; count: number }>();
    for (const store of rankedSuggestions) {
      const key = opportunityRegionKey(store);
      const name = [store.municipio, store.uf].filter(Boolean).join('/');
      const current = groups.get(key);
      if (current) current.count += 1;
      else groups.set(key, { key, name, count: 1 });
    }
    return [...groups.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
  }, [rankedSuggestions]);
  useEffect(() => {
    const availableRegionKeys = new Set(nearbyGroups.map((group) => group.key));
    setSelectedRegionKeys((current) => {
      const next = current.filter((key) => availableRegionKeys.has(key));
      return next.length === current.length ? current : next;
    });
  }, [nearbyGroups]);
  const regionFilteredSuggestions = useMemo(() => {
    if (selectedRegionKeys.length === 0) return rankedSuggestions;
    const selectedRegions = new Set(selectedRegionKeys);
    return rankedSuggestions.filter((store) => selectedRegions.has(opportunityRegionKey(store)));
  }, [rankedSuggestions, selectedRegionKeys]);
  const opportunityFilteredSuggestions = useMemo(() => {
    if (selectedOpportunityFilters.length === 0) return regionFilteredSuggestions;
    return regionFilteredSuggestions.filter((store) =>
      selectedOpportunityFilters.some((filter) => storeHasMissingOpportunity(store, filter))
    );
  }, [regionFilteredSuggestions, selectedOpportunityFilters]);
  const suggestions = useMemo(() => opportunityFilteredSuggestions.filter((store) => {
    if (selectedPriorityBands.length > 0 && !selectedPriorityBands.includes(priorityBand(store))) {
      return false;
    }
    return !onlyWithoutVisit || store.daysWithoutVisit > 30;
  }), [onlyWithoutVisit, opportunityFilteredSuggestions, selectedPriorityBands]);
  const mapVisibleStoreIds = useMemo(() => {
    const hasActiveFilter = selectedRegionKeys.length > 0 ||
      selectedOpportunityFilters.length > 0 ||
      selectedPriorityBands.length > 0 ||
      onlyWithoutVisit;
    if (!hasActiveFilter) return null;
    const selectedRegions = new Set(selectedRegionKeys);
    return sqlOpportunities
      .filter((store) => selectedRegionKeys.length === 0 || selectedRegions.has(opportunityRegionKey(store)))
      .filter((store) => selectedOpportunityFilters.length === 0 ||
        selectedOpportunityFilters.some((filter) => storeHasMissingOpportunity(store, filter)))
      .filter((store) => selectedPriorityBands.length === 0 ||
        selectedPriorityBands.includes(priorityBand(store)))
      .filter((store) => !onlyWithoutVisit || store.daysWithoutVisit > 30)
      .map((store) => store.id);
  }, [onlyWithoutVisit, selectedOpportunityFilters, selectedPriorityBands, selectedRegionKeys, sqlOpportunities]);
  useEffect(() => {
    onOpportunityVisibilityChange?.(mapVisibleStoreIds);
  }, [mapVisibleStoreIds, onOpportunityVisibilityChange]);
  useEffect(() => () => {
    onOpportunityVisibilityChange?.(null);
  }, [onOpportunityVisibilityChange]);
  useEffect(() => {
    onOpportunityHover?.(null);
    return () => onOpportunityHover?.(null);
  }, [onOpportunityHover, opportunityView, onlyWithoutVisit, selectedOpportunityFilters, selectedPriorityBands]);
  const selected = useMemo(
    () => sqlOpportunities.filter((store) => selectedIds.includes(store.id)),
    [selectedIds, sqlOpportunities]
  );
  const totalDaysWithoutVisit = opportunityFilteredSuggestions.filter((store) => store.daysWithoutVisit > 30).length;
  const alertPriorityCount = opportunityFilteredSuggestions.filter((store) => priorityBand(store) === 'alta').length;
  const attentionPriorityCount = opportunityFilteredSuggestions.filter((store) => priorityBand(store) === 'media').length;
  const optimalPriorityCount = opportunityFilteredSuggestions.filter((store) => priorityBand(store) === 'baixa').length;
  const originCoordinates = useMemo<[number, number] | null>(() => originStore?.lngLat
    ?? (originLocation ? [originLocation.longitude, originLocation.latitude] : origin?.lngLat ?? null),
  [origin, originLocation, originStore]);
  const destinationCoordinates = useMemo<[number, number] | null>(() => destinationLocation
    ? [destinationLocation.longitude, destinationLocation.latitude]
    : null, [destinationLocation]);
  const orderedSelected = useMemo(
    () => originCoordinates ? orderStoresByNearestNeighbor(originCoordinates, selected) : selected,
    [originCoordinates, selected]
  );
  const routePoints = useMemo<[number, number][]>(() => {
    if (!originCoordinates || orderedSelected.length === 0) return [];
    return [
      originCoordinates,
      ...orderedSelected.map((store) => store.lngLat),
      ...(destinationCoordinates ? [destinationCoordinates] : []),
    ];
  }, [destinationCoordinates, orderedSelected, originCoordinates]);
  const routeMetricsCacheKey = useMemo(
    () => routePoints.length >= 2 ? drivingRouteCacheKey(date, routePoints) : '',
    [date, routePoints]
  );

  useEffect(() => {
    const requestId = ++drivingMetricsRequestRef.current;
    if (!routeMetricsCacheKey || routePoints.length < 2) {
      setDrivingMetrics({ distanceKm: 0, travelMinutes: 0, status: 'idle' });
      return;
    }

    setDrivingMetrics({ distanceKm: 0, travelMinutes: 0, status: 'loading' });
    const timer = window.setTimeout(() => {
      void fetchDrivingRoute(routeMetricsCacheKey, routePoints).then((route) => {
        if (drivingMetricsRequestRef.current !== requestId) return;
        if (route) {
          setDrivingMetrics({
            distanceKm: Math.max(1, Math.round(route.distanceMeters / 1000)),
            travelMinutes: Math.max(1, Math.ceil(route.durationSeconds / 60)),
            status: 'actual',
          });
          return;
        }
        const directKm = routePoints.slice(1).reduce(
          (total, point, index) => total + distanceKm(routePoints[index], point),
          0
        );
        setDrivingMetrics({
          distanceKm: Math.max(1, Math.round(directKm)),
          travelMinutes: Math.max(1, Math.ceil((directKm / 45) * 60)),
          status: 'approximate',
        });
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [routeMetricsCacheKey, routePoints]);

  const routeKm = drivingMetrics.distanceKm;
  const travelMinutes = drivingMetrics.travelMinutes;
  const visitMinutes = selected.length * VISIT_DURATION_MINUTES;
  const finish = formatClockMinutes(ROUTE_START_MINUTES + travelMinutes + visitMinutes);
  const routeMetricsLoading = drivingMetrics.status === 'loading';
  const routeMetricsApproximate = drivingMetrics.status === 'approximate';
  const routeDistanceValue = routeMetricsLoading ? '…' : `${routeMetricsApproximate ? '≈ ' : ''}${routeKm} km`;
  const routeTravelValue = routeMetricsLoading
    ? '…'
    : `${routeMetricsApproximate ? '≈ ' : ''}${formatDurationMinutes(travelMinutes)}`;
  const toggle = (store: PlannerOpportunity) => {
    const selecting = !selectedIds.includes(store.id);
    setSelectedIds((items) => items.includes(store.id)
      ? items.filter((item) => item !== store.id)
      : [...items, store.id]);
    if (selecting) onOpportunityFocus?.({ id: store.id, lngLat: store.lngLat });
  };
  const toggleRegion = (regionKey: string, append: boolean) => {
    setSelectedRegionKeys((current) => {
      if (!append) {
        return current.length === 1 && current[0] === regionKey ? [] : [regionKey];
      }
      return current.includes(regionKey)
        ? current.filter((key) => key !== regionKey)
        : [...current, regionKey];
    });
  };
  const toggleOpportunityFilter = (filter: OpportunityFilterKey) => {
    setSelectedOpportunityFilters((current) => current.includes(filter)
      ? current.filter((item) => item !== filter)
      : [...current, filter]);
  };
  const togglePriorityBand = (band: PriorityBand) => {
    setSelectedPriorityBands((current) => current.includes(band)
      ? current.filter((item) => item !== band)
      : [...current, band]);
  };
  const editJourney = (screen: RoutePlanningScreen) => {
    onRouteChange(null);
    setJourneyStartScreen(screen);
    setJourneyComplete(false);
  };
  const optimize = () => {
    if (!originCoordinates) return;
    const route = createSqlSuggestedRoute({
      date,
      originName: originStore?.nome ?? originLocation?.label ?? (originAgencyLabel || 'Origem selecionada'),
      originCoordinates,
      destinationName: destination,
      destinationCoordinates,
      stores: selected,
    });
    if (!route) return;
    const initialRoute = drivingMetrics.status === 'idle' || drivingMetrics.status === 'loading'
      ? route
      : {
          ...route,
          distanciaKm: routeKm,
          duracaoEstimada: `${routeMetricsApproximate ? '≈ ' : ''}${formatDurationMinutes(travelMinutes + visitMinutes)}`,
          durationBreakdown: {
            travelMinutes,
            visitMinutes,
            minutesPerVisit: VISIT_DURATION_MINUTES,
            source: routeMetricsApproximate ? 'approximate' as const : 'calculated' as const,
          },
        };
    setResultsMinimized(true);
    onResultsPanelExpandedChange?.(false);
    setOptimizing(true);
    onRouteChange(initialRoute, { resultsPanelExpanded: false, resetManualOrder: true });

    const requestId = ++optimizationRequestRef.current;
    void fetchDrivingRoute(initialRoute.id, routePoints)
      .then((drivingRoute) => {
        if (!drivingRoute || optimizationRequestRef.current !== requestId) return;
        onRouteChange(enrichRouteWithDrivingData(
          initialRoute,
          drivingRoute.distanceMeters,
          drivingRoute.durationSeconds,
          drivingRoute.legDurationsSeconds,
          drivingRoute.geometry
        ), { resultsPanelExpanded: false });
      })
      .finally(() => {
        if (optimizationRequestRef.current === requestId) setOptimizing(false);
      });
  };
  const header = mergeHeaderDrag(
    'flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2',
    headerDragProps
  );
  const originSummaryLabel = originStore
    ? `${originStore.chaveLoja ? `${originStore.chaveLoja} - ` : ''}${originStore.nome}`
    : originLocation?.label ?? (originLocation ? 'Endereço selecionado' : originAgencyLabel || 'Não definida');
  const resultsResizeHandles = (['north-west', 'north-east', 'south-west', 'south-east'] as const).map((corner) => {
    const north = corner.startsWith('north');
    const west = corner.endsWith('west');
    return (
      <span
        key={corner}
        data-panel-drag-ignore
        role="separator"
        aria-label={`Redimensionar painel pelo canto ${north ? 'superior' : 'inferior'} ${west ? 'esquerdo' : 'direito'}`}
        title="Arraste para ajustar largura e altura"
        onPointerDown={(event) => startResultsResize(corner, event)}
        onPointerMove={resizeResults}
        onPointerUp={stopResultsResize}
        onPointerCancel={stopResultsResize}
        className={cn(
          'absolute z-30 h-4 w-4 touch-none border-violet-400/80 opacity-45 transition-opacity hover:opacity-100',
          north ? 'top-0 border-t-2' : 'bottom-0 border-b-2',
          west ? 'left-0 border-l-2' : 'right-0 border-r-2',
          (corner === 'north-west' || corner === 'south-east') ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
          corner === 'north-west' && 'rounded-tl-xl',
          corner === 'north-east' && 'rounded-tr-xl',
          corner === 'south-west' && 'rounded-bl-xl',
          corner === 'south-east' && 'rounded-br-xl'
        )}
      />
    );
  });
  const opportunitySummaryDock = (
    <aside
      data-route-planner-opportunity-summary
      aria-label="Resumo das oportunidades"
      className="pointer-events-auto absolute left-3 top-1/2 z-20 w-[180px] -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 font-sans text-slate-700 shadow-xl shadow-slate-900/15 backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={() => {
          setSelectedPriorityBands([]);
          setOnlyWithoutVisit(false);
        }}
        title="Mostrar todas as classificações"
        className="block w-full border-b border-blue-100/80 bg-gradient-to-br from-blue-50/85 to-violet-50/80 px-3 py-3 text-left transition-colors hover:from-blue-100/90 hover:to-violet-100/85"
      >
        <p className="text-xs font-bold text-slate-900">Resumo do recorte</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-200">
            <ShoppingCart className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-lg font-bold leading-none text-slate-900">{suggestions.length}</span>
            <span className="mt-1 block text-[10px] font-medium text-slate-500">Oportunidades</span>
          </span>
        </div>
      </button>

      <div className="px-2.5 py-2.5">
        <p className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Classificação</p>
        {[
          { band: 'alta' as const, Icon: TriangleAlert, iconClass: 'bg-rose-100 text-rose-600', badgeClass: 'bg-rose-50 text-rose-700', value: alertPriorityCount, label: 'Alerta', tooltip: 'Está em 2 ou menos pilares.' },
          { band: 'media' as const, Icon: TriangleAlert, iconClass: 'bg-amber-100 text-amber-600', badgeClass: 'bg-amber-50 text-amber-700', value: attentionPriorityCount, label: 'Atenção', tooltip: 'Está em 3 ou 4 pilares.' },
          { band: 'baixa' as const, Icon: Check, iconClass: 'bg-emerald-100 text-emerald-600', badgeClass: 'bg-emerald-50 text-emerald-700', value: optimalPriorityCount, label: 'Ótimo', tooltip: 'Está nos 5 pilares: todos os indicadores estão como Sim.' },
        ].map(({ band, Icon, iconClass, badgeClass, value, label, tooltip }) => {
          const active = selectedPriorityBands.includes(band);
          return <Tooltip key={label}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => togglePriorityBand(band)}
                aria-pressed={active}
                className={cn('flex w-full items-center gap-2 rounded-lg border px-1 py-1.5 text-left transition-all', active ? 'border-violet-200 bg-violet-50/90 shadow-sm' : 'border-transparent hover:bg-white/70')}
              >
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', iconClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10px] font-medium text-slate-600">{label}</span>
                <span className={cn('ml-auto min-w-7 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold', badgeClass)}>{value}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="max-w-[240px] text-xs leading-relaxed">{tooltip}</TooltipContent>
          </Tooltip>;
        })}

        <div className="my-2 border-t border-slate-100" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOnlyWithoutVisit((current) => !current)}
              aria-pressed={onlyWithoutVisit}
              className={cn('flex w-full items-center gap-2 rounded-lg border px-1 py-1.5 text-left transition-all', onlyWithoutVisit ? 'border-violet-200 bg-violet-50/90 shadow-sm' : 'border-transparent hover:bg-white/70')}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600"><History className="h-3.5 w-3.5" /></span>
              <span className="text-[10px] font-medium text-slate-600">Sem visita</span>
              <span className="ml-auto min-w-7 rounded-full bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-bold text-slate-700">{totalDaysWithoutVisit}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="max-w-[240px] text-xs leading-relaxed">Lojas sem visita há mais de 30 dias.</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div tabIndex={0} className="flex items-center gap-2 rounded-lg border border-transparent px-1 py-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600"><UsersRound className="h-3.5 w-3.5" /></span>
              <span className="text-[10px] font-medium text-slate-600">Regiões</span>
              <span className="ml-auto min-w-7 rounded-full bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-bold text-slate-700">{nearbyGroups.length}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="max-w-[240px] text-xs leading-relaxed">Quantidade de regiões com lojas no recorte atual.</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
  const bottomDock = (
    <section
      data-route-planner-bottom-dock
      className="pointer-events-auto absolute bottom-3 left-1/2 z-20 w-[min(900px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 font-sans text-slate-700 shadow-xl shadow-slate-900/15 backdrop-blur-md"
    >
      <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-900">Distribuição das oportunidades</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Clique para filtrar · Shift+clique para combinar.</p>
          </div>
          <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700">
            {suggestions.length} oportunidade{suggestions.length === 1 ? '' : 's'}
          </span>
        </div>
        {nearbyGroups.length > 0 ? (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedRegionKeys([])}
              aria-pressed={selectedRegionKeys.length === 0}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left shadow-sm transition-colors',
                selectedRegionKeys.length === 0
                  ? 'border-violet-300 bg-violet-100 shadow-violet-200/40'
                  : 'border-slate-200 bg-white shadow-slate-900/[0.03] hover:border-violet-200 hover:bg-violet-50/60'
              )}
            >
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', selectedRegionKeys.length === 0 ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500')}>
                <UsersRound className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-[10px] font-bold text-slate-800">Todas</span>
                <span className="mt-0.5 block text-[9px] font-medium text-slate-500">{rankedSuggestions.length} oportunidades</span>
              </span>
            </button>
            {nearbyGroups.map(({ key, name, count }, index) => {
              const active = selectedRegionKeys.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={(event) => toggleRegion(key, event.shiftKey)}
                  aria-pressed={active}
                  title="Clique para filtrar. Use Shift+clique para combinar regiões."
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left shadow-sm transition-colors',
                    active
                      ? 'border-violet-300 bg-violet-100 shadow-violet-200/40'
                      : 'border-slate-200 bg-white shadow-slate-900/[0.03] hover:border-violet-200 hover:bg-violet-50/60'
                  )}
                >
                  <span className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    active ? 'bg-violet-600 text-white' : index % 2 === 0 ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-500'
                  )}>
                    <UsersRound className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-36 truncate text-[10px] font-bold text-slate-800">{name}</span>
                    <span className="mt-0.5 block text-[9px] font-medium text-slate-500">{count} oportunidade{count === 1 ? '' : 's'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Nenhuma região disponível para o recorte atual.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <Check className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold leading-none text-slate-900">{selected.length}</p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">visitas selecionadas</p>
          </div>
        </div>
        <Metric label="Distância pela rota" value={routeDistanceValue} title={routeMetricsApproximate ? 'Aproximação temporária: não foi possível consultar a malha viária.' : 'Distância calculada pela malha viária.'} />
        <Metric label="Deslocamento" value={routeTravelValue} title={routeMetricsApproximate ? 'Tempo aproximado enquanto a rota viária está indisponível.' : 'Tempo de direção calculado pela rota.'} />
        <Metric label="Visitas estim." value={formatDurationMinutes(visitMinutes)} title={`Estimativa operacional de ${VISIT_DURATION_MINUTES} minutos por loja selecionada.`} />
        <Metric label="Término previsto" value={routeMetricsLoading ? '…' : finish} />
        <button type="button" disabled={!selected.length || optimizing || routeMetricsLoading} onClick={optimize} className="ml-auto flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-300/40 transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Sparkles className="h-4 w-4" />
          {optimizing ? 'Traçando rota...' : routeMetricsLoading ? 'Calculando trajeto...' : 'Sugerir melhor rota'}
        </button>
      </div>
    </section>
  );
  const plannerSidePanelWidth = resultsMinimized ? 0 : Math.min(viewportWidth * 0.96, 480);
  const routeSummaryAvailableWidth = Math.max(320, viewportWidth - plannerSidePanelWidth);
  const routeSummaryLayout = !resultsMinimized && viewportWidth < 1536
    ? {
        left: 12,
        width: Math.min(900, Math.max(280, routeSummaryAvailableWidth - 306)),
      }
    : (() => {
        const center = routeSummaryAvailableWidth / 2;
        const halfWidth = Math.min(450, Math.max(140, center - 294));
        return { left: Math.round(center - halfWidth), width: Math.round(halfWidth * 2) };
      })();
  const routeSummaryDock = (
    <div
      style={{
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: routeSummaryLayout.left,
        width: routeSummaryLayout.width,
      }}
      className="pointer-events-none absolute z-40 flex justify-center transition-[left,width] duration-300 lg:z-20"
    >
      <section
        data-route-planner-summary-dock
        aria-label="Resumo do roteiro selecionado"
        className="pointer-events-auto flex w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/90 p-2.5 font-sans text-slate-700 shadow-2xl shadow-slate-900/20 backdrop-blur-xl"
      >
        <label className="flex min-h-11 min-w-[142px] flex-1 items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/85 px-3 sm:flex-none">
          <CalendarDays className="h-4 w-4 shrink-0 text-violet-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-500">Data do roteiro</span>
            <input
              type="date"
              aria-label="Data do roteiro"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-0.5 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none"
            />
          </span>
        </label>
        <div className="flex min-h-11 min-w-[112px] items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/90 px-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm shadow-violet-300">
            <Check className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-bold leading-none text-slate-900">{selected.length}</p>
            <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-500">Selecionadas</p>
          </div>
        </div>
        <div className="grid min-w-[260px] flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Metric label="Distância pela rota" value={routeDistanceValue} title={routeMetricsApproximate ? 'Aproximação temporária: não foi possível consultar a malha viária.' : 'Distância calculada pela malha viária.'} />
          <Metric label="Deslocamento" value={routeTravelValue} title={routeMetricsApproximate ? 'Tempo aproximado enquanto a rota viária está indisponível.' : 'Tempo de direção calculado pela rota.'} />
          <Metric label="Visitas estim." value={formatDurationMinutes(visitMinutes)} title={`Estimativa operacional de ${VISIT_DURATION_MINUTES} minutos por loja selecionada.`} />
          <Metric label="Término" value={routeMetricsLoading ? '…' : finish} />
        </div>
        <button type="button" disabled={!selected.length || optimizing || routeMetricsLoading} onClick={optimize} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 text-xs font-bold text-white shadow-md shadow-violet-300/45 transition hover:from-violet-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">
          <Sparkles className="h-4 w-4" />
          {optimizing ? 'Traçando rota...' : routeMetricsLoading ? 'Calculando trajeto...' : 'Sugerir melhor rota'}
        </button>
      </section>
    </div>
  );
  const headerSummaryPortal = headerSummaryTarget && journeyComplete
    ? createPortal(
        <div className="flex h-12 w-[min(720px,calc(100vw-300px))] min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white/90 font-sans shadow-sm shadow-slate-900/10">
          <HeaderRouteSummaryItem
            label="Origem"
            value={originSummaryLabel}
            title={originSummaryLabel}
            icon={<Navigation className="h-4 w-4" />}
            iconClass="bg-blue-50 text-blue-700"
            onClick={() => editJourney(2)}
          />
          <HeaderRouteSummaryItem
            label="Destino"
            value={destination}
            title={destination}
            icon={<MapPin className="h-4 w-4" />}
            iconClass="bg-violet-50 text-violet-700"
            onClick={() => editJourney(3)}
          />
          <HeaderRouteSummaryItem
            label="Prioridade"
            value={priorityLabel[planningPriority]}
            title={priorityLabel[planningPriority]}
            icon={<TriangleAlert className="h-4 w-4" />}
            iconClass="bg-amber-50 text-amber-600"
            onClick={() => editJourney(4)}
          />
        </div>,
        headerSummaryTarget
      )
    : null;

  if (!journeyComplete) {
    return <div style={shellStyle} className="max-w-[calc(100vw-32px)]"><RoutePlanningJourney agencies={agencies} originId={originId} destination={destination} initialScreen={journeyStartScreen} initialPriority={planningPriority} initialOriginStore={originStore} initialOriginLocation={originLocation} initialDestinationLocation={destinationLocation} onClose={onClose} onOriginAgencySelect={(agency) => {
      setOriginStore(null);
      setOriginLocation(null);
      onAgencyFocus?.(agency);
    }} onOriginStoreSelect={(store) => {
      setOriginStore(store);
      setOriginLocation(null);
      if (store) onOriginStoreFocus?.(store);
      else onOriginClear?.();
    }} onOriginLocationSelect={(location) => {
      setOriginStore(null);
      setOriginLocation(location);
      if (location) onOriginLocationFocus?.(location);
      else onOriginClear?.();
    }} onDestinationAgencySelect={(agency) => {
      setDestinationLocation({
        latitude: agency.lngLat[1],
        longitude: agency.lngLat[0],
        accuracy: 0,
        label: agency.nome,
      });
      onTerritoryRadiusChange?.(null);
      onDestinationAgencyFocus?.(agency);
    }} onDestinationLocationSelect={(location) => {
      setDestinationLocation(location);
      onTerritoryRadiusChange?.(null);
      if (location) onDestinationLocationFocus?.(location);
      else onDestinationClear?.();
    }} onDestinationClear={() => {
      setDestinationLocation(null);
      onDestinationClear?.();
    }} onTerritoryRadiusSelect={(radiusKm) => {
      setDestinationLocation(null);
      onDestinationClear?.();
      onTerritoryRadiusChange?.(radiusKm);
    }} headerDragProps={headerDragProps} onComplete={(result) => {
      setOriginId(result.originId);
      setDestination(result.destination);
      setPlanningPriority(result.priority);
      setJourneyStartScreen(0);
      setJourneyComplete(true);
    }} /></div>;
  }

  const showLegacyResults = false;
  return (
    <>
    <RouteOpportunitiesSidePanel
      minimized={resultsMinimized}
      stores={suggestions}
      selectedIds={selectedIds}
      priorityByStoreId={opportunityClassifications}
      summary={{
        opportunities: suggestions.length,
        alert: alertPriorityCount,
        attention: attentionPriorityCount,
        optimal: optimalPriorityCount,
        withoutVisit: totalDaysWithoutVisit,
        regions: nearbyGroups.length,
      }}
      regions={nearbyGroups}
      selectedRegionKeys={selectedRegionKeys}
      query={query}
      filtersOpen={opportunityFiltersOpen}
      filtersContainerRef={opportunityFiltersRef}
      opportunityFilters={OPPORTUNITY_FILTER_OPTIONS}
      selectedOpportunityFilters={selectedOpportunityFilters}
      selectedPriorityBands={selectedPriorityBands}
      onlyWithoutVisit={onlyWithoutVisit}
      onlyOnPath={onlyOnPath}
      date={date}
      routeMetrics={{ distanceKm: routeKm, travelMinutes, visitMinutes, finish }}
      onQueryChange={setQuery}
      onToggleFilters={() => setOpportunityFiltersOpen((current) => !current)}
      onToggleOpportunityFilter={toggleOpportunityFilter}
      onClearOpportunityFilters={() => setSelectedOpportunityFilters([])}
      onTogglePriorityBand={togglePriorityBand}
      onToggleWithoutVisit={() => setOnlyWithoutVisit((current) => !current)}
      onClearSummaryFilters={() => {
        setSelectedPriorityBands([]);
        setOnlyWithoutVisit(false);
      }}
      onClearRegions={() => setSelectedRegionKeys([])}
      onToggleRegion={toggleRegion}
      onToggleOnlyOnPath={() => setOnlyOnPath((current) => !current)}
      onToggleStore={(panelStore) => {
        const store = sqlOpportunities.find((item) => item.id === panelStore.id);
        if (store) toggle(store);
      }}
      onStoreHover={onOpportunityHover}
      onDateChange={setDate}
      onOptimize={optimize}
      onMinimize={() => setResultsMinimized(true)}
      onRestore={() => setResultsMinimized(false)}
      onClose={onClose}
    />
    {showLegacyResults && <section
      data-route-planner-results
      style={{
        ...shellStyle,
        ...(resultsPanelSize ? {
          width: resultsPanelSize.width,
          height: resultsPanelSize.height,
          transform: `translate3d(${resultsPanelSize.offsetX}px, ${resultsPanelSize.offsetY}px, 0)`,
        } : null),
      }}
      className="pointer-events-auto flex h-[min(560px,calc(100dvh-260px))] max-h-[calc(100dvh-120px)] min-h-[320px] w-[calc(100vw-24px)] min-w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/55 bg-slate-50/45 font-sans text-slate-700 shadow-2xl shadow-slate-900/20 backdrop-blur-xl lg:w-[min(980px,calc(100vw-348px))]"
    >
      <header className={cn(header.className, 'border-white/60 bg-white/30')} style={header.dragStyle} {...header.dragHandlers} title="Arraste para mover o painel">
        <button type="button" data-panel-drag-ignore onClick={onBack} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-900">Montamos um roteiro para você! 🎉</h2>
          <p className="text-[10px] text-slate-500">Veja as oportunidades encontradas e monte sua rota ideal.</p>
        </div>
        <button type="button" data-panel-drag-ignore onClick={() => setResultsMinimized(true)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Minimizar painel" title="Minimizar painel">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" data-panel-drag-ignore onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-3">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/60 bg-white/25 shadow-lg shadow-slate-900/[0.06] backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/65 bg-white/30 p-2.5">
            <div className="mr-auto min-w-[160px]">
              <p className="text-xs font-bold text-slate-800">Oportunidades encontradas</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Selecione as lojas do roteiro.</p>
            </div>
            <label className="flex min-h-9 items-center gap-2 rounded-lg border border-white/75 bg-white/45 px-2.5 text-slate-400 shadow-sm backdrop-blur-sm transition-colors focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
              <Search className="h-3.5 w-3.5" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar loja ou município" className="w-40 bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-400" />
            </label>
            <div className="inline-flex min-h-9 items-center rounded-lg border border-white/75 bg-white/45 p-0.5 shadow-sm backdrop-blur-sm" role="group" aria-label="Formato de visualização">
              <button
                type="button"
                onClick={() => setOpportunityView('table')}
                aria-pressed={opportunityView === 'table'}
                title="Visualizar como tabela"
                className={cn('flex h-8 w-8 items-center justify-center rounded-md transition-colors', opportunityView === 'table' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white/80')}
              >
                <Table2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpportunityView('cards')}
                aria-pressed={opportunityView === 'cards'}
                title="Visualizar como cards"
                className={cn('flex h-8 w-8 items-center justify-center rounded-md transition-colors', opportunityView === 'cards' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white/80')}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <div ref={opportunityFiltersRef} className="relative">
              <button
                type="button"
                onClick={() => setOpportunityFiltersOpen((current) => !current)}
                aria-expanded={opportunityFiltersOpen}
                className={cn(
                  'flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm transition-colors',
                  selectedOpportunityFilters.length > 0
                    ? 'border-violet-300 bg-violet-100/90 text-violet-800'
                    : 'border-white/90 bg-white/55 text-slate-600 hover:border-slate-300 hover:bg-white/75'
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros
                {selectedOpportunityFilters.length > 0 && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{selectedOpportunityFilters.length}</span>}
              </button>
              {opportunityFiltersOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 overflow-hidden rounded-xl border border-white/80 bg-slate-50/85 text-slate-700 shadow-xl shadow-slate-900/20 backdrop-blur-xl">
                  <div className="border-b border-white/80 px-3 py-2.5">
                    <p className="text-[11px] font-bold text-slate-900">Filtrar oportunidades</p>
                    <p className="mt-0.5 text-[9px] text-slate-500">Exibe lojas com qualquer opção selecionada.</p>
                  </div>
                  <div className="space-y-0.5 p-2">
                    {OPPORTUNITY_FILTER_OPTIONS.map(({ key, label }) => {
                      const active = selectedOpportunityFilters.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleOpportunityFilter(key)}
                          aria-pressed={active}
                          className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[10px] font-medium transition-colors', active ? 'bg-violet-100/90 text-violet-800' : 'hover:bg-white/75')}
                        >
                          <span className={cn('flex h-4 w-4 items-center justify-center rounded border', active ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white/70 text-transparent')}>
                            <Check className="h-3 w-3" />
                          </span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {selectedOpportunityFilters.length > 0 && (
                    <button type="button" onClick={() => setSelectedOpportunityFilters([])} className="w-full border-t border-white/80 px-3 py-2 text-left text-[9px] font-bold text-violet-700 transition-colors hover:bg-white/65">
                      Limpar filtros de oportunidades
                    </button>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={() => setOnlyOnPath((value) => !value)} className={cn('flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold backdrop-blur-sm transition-colors', onlyOnPath ? 'bg-violet-100/80 text-violet-800' : 'bg-white/45 text-slate-500 hover:bg-white/70')}><span className={cn('h-3.5 w-6 rounded-full p-0.5', onlyOnPath ? 'bg-violet-600' : 'bg-slate-300')}><span className={cn('block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform', onlyOnPath && 'translate-x-2.5')} /></span>Apenas no caminho</button>
          </div>
          {suggestions.length === 0 ? (
            <div className="p-8 text-center"><ShoppingCart className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">Nenhuma oportunidade encontrada</p><p className="mt-1 text-[10px] text-slate-500">Revise a origem, o destino ou o raio selecionado.</p></div>
          ) : opportunityView === 'table' ? (
            <OpportunityTable stores={suggestions} priority={planningPriority} selectedIds={selectedIds} onToggle={toggle} onHover={onOpportunityHover} />
          ) : (
            <OpportunityCardGrid stores={suggestions} selectedIds={selectedIds} onToggle={toggle} onHover={onOpportunityHover} />
          )}
        </section>

      </main>
      {resultsResizeHandles}
    </section>}
    {opportunitySummaryDock}
    {routeSummaryDock}
    {headerSummaryPortal}
    </>
  );
};

function HeaderRouteSummaryItem({
  label,
  value,
  title,
  icon,
  iconClass,
  onClick,
}: {
  label: string;
  value: string;
  title: string;
  icon: React.ReactNode;
  iconClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}: ${title} · Clique para editar`}
      className="group flex min-w-0 flex-1 items-center gap-2.5 border-r border-slate-200 px-3 text-left transition-colors last:border-r-0 hover:bg-slate-50"
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconClass)}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="mt-0.5 block truncate text-xs font-bold text-slate-800">{value}</span>
      </span>
    </button>
  );
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/85 px-2.5 py-2 text-center" title={title}><p className="truncate text-xs font-bold leading-none text-slate-900">{value}</p><p className="mt-1 truncate text-[8px] font-semibold uppercase tracking-wide text-slate-500">{label}</p></div>;
}

function SortableTableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
  rowSpan,
  className,
}: {
  label: string;
  sortKey: OpportunitySortKey;
  activeSort: { key: OpportunitySortKey; direction: SortDirection } | null;
  onSort: (key: OpportunitySortKey) => void;
  rowSpan?: number;
  className?: string;
}) {
  const active = activeSort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : activeSort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <th
    rowSpan={rowSpan}
    className={cn('px-2.5 py-2.5 align-middle', className)}
    aria-sort={!active ? 'none' : activeSort.direction === 'asc' ? 'ascending' : 'descending'}
  >
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors hover:bg-slate-200/70 hover:text-slate-800',
        active && 'text-violet-700'
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  </th>;
}

function OpportunityTable({ stores, priority, selectedIds, onToggle, onHover }: { stores: PlannerOpportunity[]; priority: PlanningPriority; selectedIds: string[]; onToggle: (store: PlannerOpportunity) => void; onHover?: (id: string | null) => void }) {
  const [activeSort, setActiveSort] = useState<{
    key: OpportunitySortKey;
    direction: SortDirection;
  } | null>(null);
  const sortedStores = useMemo(() => {
    if (!activeSort) return stores;
    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
    const direction = activeSort.direction === 'asc' ? 1 : -1;
    return [...stores].sort((a, b) => {
      let comparison = 0;
      if (activeSort.key === 'localidade') {
        comparison = collator.compare(
          [a.municipio, a.uf].filter(Boolean).join('/'),
          [b.municipio, b.uf].filter(Boolean).join('/')
        );
      } else if (activeSort.key === 'desvio') {
        comparison = a.deviationMinutes - b.deviationMinutes;
      } else if (activeSort.key === 'prioridade') {
        comparison = priorityScore(a, priority) - priorityScore(b, priority);
      } else {
        comparison = a.daysWithoutVisit - b.daysWithoutVisit;
      }
      return comparison * direction || collator.compare(a.nome, b.nome);
    });
  }, [activeSort, priority, stores]);
  const handleSort = (key: OpportunitySortKey) => {
    setActiveSort((current) => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return {
        key,
        direction: key === 'localidade' || key === 'desvio' ? 'asc' : 'desc',
      };
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-transparent">
      <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-20 isolate bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-[0_2px_5px_-2px_rgba(15,23,42,0.25)]">
          <tr className="bg-slate-50">
            <th rowSpan={2} className="w-10 px-3 py-2.5 align-middle" />
            <SortableTableHeader rowSpan={2} className="w-[76px]" label="Prioridade" sortKey="prioridade" activeSort={activeSort} onSort={handleSort} />
            <SortableTableHeader rowSpan={2} className="min-w-[230px]" label="Loja e localização" sortKey="localidade" activeSort={activeSort} onSort={handleSort} />
            <th colSpan={5} className="border-x border-violet-100 bg-violet-50/80 px-2.5 py-2 text-center text-violet-800">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Oportunidades identificadas
              </span>
            </th>
            <SortableTableHeader rowSpan={2} label="Desvio" sortKey="desvio" activeSort={activeSort} onSort={handleSort} />
            <SortableTableHeader rowSpan={2} label="Sem visita" sortKey="sem_visita" activeSort={activeSort} onSort={handleSort} />
            <th rowSpan={2} className="min-w-[96px] px-3 py-2.5 text-center align-middle">Ação</th>
          </tr>
          <tr className="border-t border-violet-100 bg-violet-50 text-violet-800">
            <OpportunityFlagHeader label="Cielo" />
            <OpportunityFlagHeader label="Crédito" />
            <OpportunityFlagHeader label="Negócio" />
            <OpportunityFlagHeader label="Ativo PADE" />
            <OpportunityFlagHeader label="Proposta de Valor" />
          </tr>
        </thead>
        <tbody>
          {sortedStores.map((store) => {
            const selected = selectedIds.includes(store.id);
            const band = priorityBand(store);
            const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onToggle(store);
            };
            return (
              <tr
                key={store.id}
                onClick={() => onToggle(store)}
                onMouseEnter={() => onHover?.(store.id)}
                onMouseLeave={() => onHover?.(null)}
                className={cn(
                  'group cursor-pointer text-xs text-slate-600 transition duration-150 ease-out [&>td]:border-b [&>td]:border-slate-100',
                  'hover:relative hover:z-10 hover:scale-[1.006] hover:bg-violet-50/90 hover:shadow-[0_8px_18px_-10px_rgba(76,29,149,0.65)]',
                  selected ? 'bg-orange-50/75' : 'bg-white/10'
                )}
              >
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={handleButtonClick}
                    aria-label={`${selected ? 'Remover' : 'Adicionar'} ${store.nome}`}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border-2 shadow-sm transition-all',
                      selected
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-300 bg-white text-transparent group-hover:border-violet-300'
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </td>
                <PriorityTableCell band={band} />
                <td className="min-w-[230px] px-2.5 py-3">
                  <p className="text-[13px] font-bold leading-snug text-slate-900">{store.nome}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                    {[store.municipio, store.uf].filter(Boolean).join('/')}
                  </p>
                </td>
                <OpportunityFlagCell active={store.oportunidadeCielo} label="Cielo" />
                <OpportunityFlagCell active={store.oportunidadeCredito} label="Crédito" />
                <OpportunityFlagCell active={store.oportunidadeNegocio} label="Negócio" />
                <OpportunityFlagCell active={store.oportunidadeAtivoPade} label="Ativo PADE" />
                <OpportunityFlagCell active={store.oportunidadePropostaValor} label="Proposta de Valor" />
                <td className="whitespace-nowrap px-2.5 py-3 font-semibold text-slate-700">+{store.deviationMinutes} min</td>
                <td className="whitespace-nowrap px-2.5 py-3 font-semibold text-slate-700">{store.daysWithoutVisit} dias</td>
                <td className="px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={handleButtonClick}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-[10px] font-bold transition-colors',
                      selected
                        ? 'border-orange-200 text-orange-700 hover:bg-orange-100'
                        : 'border-blue-100 text-blue-600 hover:bg-blue-50'
                    )}
                  >
                    {selected ? 'Remover' : 'Adicionar'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpportunityCardGrid({ stores, selectedIds, onToggle, onHover }: { stores: PlannerOpportunity[]; selectedIds: string[]; onToggle: (store: PlannerOpportunity) => void; onHover?: (id: string | null) => void }) {
  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5 overflow-auto p-3">
      {stores.map((store) => {
        const selected = selectedIds.includes(store.id);
        const band = priorityBand(store);
        const opportunityLabels = [
          store.oportunidadeCielo && 'Cielo',
          store.oportunidadeCredito && 'Crédito',
          store.oportunidadeNegocio && 'Negócio',
          store.oportunidadeAtivoPade && 'Ativo PADE',
          store.oportunidadePropostaValor && 'Proposta de Valor',
        ].filter((label): label is string => Boolean(label));
        return (
          <article
            key={store.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={() => onToggle(store)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onToggle(store);
              }
            }}
            onMouseEnter={() => onHover?.(store.id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(store.id)}
            onBlur={() => onHover?.(null)}
            className={cn(
              'group cursor-pointer rounded-xl border p-3 outline-none backdrop-blur-md transition duration-150 ease-out',
              'hover:z-10 hover:scale-[1.025] hover:border-violet-300 hover:bg-violet-50/95 hover:shadow-xl hover:shadow-violet-900/15 focus-visible:ring-2 focus-visible:ring-violet-400',
              selected
                ? 'border-orange-300 bg-orange-50/85 shadow-md shadow-orange-900/10'
                : 'border-white/70 bg-white/40 shadow-sm shadow-slate-900/[0.06]'
            )}
          >
            <div className="flex items-start gap-2.5">
              <PriorityIcon band={band} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[12px] font-bold text-slate-900" title={store.nome}>{store.nome}</h3>
                <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{[store.municipio, store.uf].filter(Boolean).join('/')}</span>
                </p>
              </div>
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors', selected ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white/80 text-transparent group-hover:border-violet-400')}>
                <Check className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-3 border-t border-slate-200/70 pt-2.5">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Oportunidades</p>
              <div className="flex flex-wrap gap-1">
                {opportunityLabels.length > 0 ? opportunityLabels.map((label) => (
                  <span key={label} className="rounded-full border border-emerald-200/90 bg-emerald-50/90 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                    {label}
                  </span>
                )) : (
                  <span className="text-[9px] font-medium text-slate-400">Nenhuma oportunidade sinalizada</span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PriorityIcon({ band }: { band: PriorityBand }) {
  const isOptimal = band === 'baixa';
  const label = priorityBandLabel[band];
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm',
        band === 'alta' && 'border-rose-200 bg-rose-100 text-rose-600',
        band === 'media' && 'border-amber-200 bg-amber-100 text-amber-600',
        band === 'baixa' && 'border-emerald-200 bg-emerald-100 text-emerald-600'
      )}
      role="img"
      aria-label={`Prioridade: ${label}`}
      title={label}
    >
      {isOptimal ? <Check className="h-4 w-4 stroke-[2.5]" /> : <TriangleAlert className="h-4 w-4 stroke-[2.25]" />}
    </span>
  );
}

function PriorityTableCell({ band }: { band: PriorityBand }) {
  return (
    <td className="px-2.5 py-3 text-center">
      <span className="inline-flex"><PriorityIcon band={band} /></span>
    </td>
  );
}

function OpportunityFlagHeader({ label }: { label: string }) {
  return <th className="min-w-[104px] border-t border-violet-100 px-2.5 py-2.5 text-center text-[10px] leading-snug">{label}</th>;
}

function OpportunityFlagCell({ active, label }: { active: boolean; label: string }) {
  const status = active ? 'Sim' : 'Não';
  return (
    <td className="px-2.5 py-3 text-center">
      <span
        role="img"
        aria-label={`${label}: ${status}`}
        title={`${label}: ${status}`}
        className={cn(
          'mx-auto inline-flex min-w-[62px] items-center justify-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold',
          active
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
            : 'border-slate-200 bg-slate-50 text-slate-400'
        )}
      >
        {active ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        {status}
      </span>
    </td>
  );
}

export default RoutePlannerPanel;
