import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Check,
  LayoutGrid,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  TriangleAlert,
  UsersRound,
  History,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitRoute } from '@/data/visitRoutesMock';
import type { CSSProperties } from 'react';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from './mergeHeaderDrag';
import RoutePlanningJourney, { type PlanningPriority } from './RoutePlanningJourney';
import { fetchAgencyPoints, type SqlMapPoint } from '@/lib/mapDataApi';
import type { RegionMapPoint } from '@/data/regionMapPointsMock';
import type { DeviceLocation } from '@/lib/deviceGeolocation';

interface Props {
  onBack: () => void;
  onClose: () => void;
  onRouteChange: (route: VisitRoute | null) => void;
  onAgencyFocus?: (agency: RegionMapPoint) => void;
  onOriginLocationFocus?: (location: DeviceLocation) => void;
  onOriginClear?: () => void;
  onDestinationAgencyFocus?: (agency: RegionMapPoint) => void;
  onDestinationLocationFocus?: (location: DeviceLocation) => void;
  onDestinationClear?: () => void;
  onTerritoryRadiusChange?: (radiusKm: number | null) => void;
  onOpportunitySelectionChange?: (ids: string[]) => void;
  onOpportunityFocus?: (opportunity: { id: string; lngLat: [number, number] }) => void;
  plannerStores: SqlMapPoint[];
  territory: string | null;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

type View = 'cards' | 'table' | 'map';

const priorityStyle = {
  alta: 'border-rose-200 bg-rose-50 text-rose-700',
  media: 'border-amber-200 bg-amber-50 text-amber-700',
  baixa: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
const priorityBandLabel = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const priorityLabel: Record<PlanningPriority, string> = {
  potencial: 'Maior potencial',
  sem_visita: 'Lojas sem visita',
  deslocamento: 'Menor deslocamento',
  alertas: 'Alertas e pendências',
  equilibrado: 'Critérios equilibrados',
};

type PriorityBand = 'alta' | 'media' | 'baixa';
type OpportunitySortKey = 'municipio' | 'desvio' | 'prioridade' | 'sem_visita';
type SortDirection = 'asc' | 'desc';

interface PlannerOpportunity {
  id: string;
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
  focus: string;
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

function sqlStoreFocus(point: SqlMapPoint): string {
  if (point.cieloM0 === false) return 'Cielo M0';
  if (point.checklist === false) return 'Checklist';
  if (point.segmento) return point.segmento;
  if (point.statusTablet) return `Tablet: ${point.statusTablet}`;
  return 'Relacionamento';
}

function toPlannerOpportunity(point: SqlMapPoint): PlannerOpportunity {
  const location = sqlStoreLocation(point);
  const seed = `${point.id}|${point.chaveLoja ?? ''}|${point.lngLat.join(',')}`;
  const baseDeviation = point.routeRole === 'corridor' ? 5 : 2;
  return {
    id: point.id || seed,
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
    focus: sqlStoreFocus(point),
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

function priorityBand(store: PlannerOpportunity, priority: PlanningPriority): PriorityBand {
  const score = priorityScore(store, priority);
  return score >= 70 ? 'alta' : score >= 45 ? 'media' : 'baixa';
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
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
  const ordered: PlannerOpportunity[] = [];
  const remaining = [...stores];
  let current = originCoordinates;
  while (remaining.length) {
    remaining.sort((a, b) => distanceKm(current, a.lngLat) - distanceKm(current, b.lngLat));
    const next = remaining.shift()!;
    ordered.push(next);
    current = next.lngLat;
  }

  const stops = ordered.map((store, index) => ({
    id: index + 1,
    ordem: index + 1,
    nome: store.nome,
    horario: `${String(9 + Math.floor(index * 1.25)).padStart(2, '0')}:${index % 4 === 0 ? '00' : '30'}`,
    status: 'pendente' as const,
    endereco: store.endereco || [store.municipio, store.uf].filter(Boolean).join('/'),
    cep: store.codAg ? `Agência vinculada: ${store.codAg}` : 'Visita planejada',
    produtoFoco: store.focus,
    ultimaVisita: `Há ${store.daysWithoutVisit} dias`,
    proximaAcao: store.alerts > 0
      ? `Verificar ${store.alerts} alerta${store.alerts === 1 ? '' : 's'} e desenvolver ${store.focus}.`
      : `Desenvolver ${store.focus} e registrar a visita.`,
    lat: store.lngLat[1],
    lng: store.lngLat[0],
  }));
  const linePoints = [
    originCoordinates,
    ...ordered.map((store) => store.lngLat),
    ...(destinationCoordinates ? [destinationCoordinates] : []),
  ];
  const totalKm = linePoints.slice(1).reduce(
    (total, point, index) => total + distanceKm(linePoints[index], point),
    0
  );

  return {
    id: `planejado-${date}-${ordered.map((store) => store.id).join('-')}`,
    chaveSupervisao: 0,
    gerenteComercial: 'Meu roteiro',
    nome: `${originName} → ${destinationName}`,
    data: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(`${date}T12:00:00`)),
    distanciaKm: Math.round(totalKm),
    duracaoEstimada: `${Math.max(1, Math.round(totalKm / 45 + stops.length * 0.65))}h`,
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
  onOriginLocationFocus,
  onOriginClear,
  onDestinationAgencyFocus,
  onDestinationLocationFocus,
  onDestinationClear,
  onTerritoryRadiusChange,
  onOpportunitySelectionChange,
  onOpportunityFocus,
  plannerStores,
  territory,
  shellStyle,
  headerDragProps,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [agencies, setAgencies] = useState<RegionMapPoint[]>([]);
  const [journeyComplete, setJourneyComplete] = useState(false);
  const [resultsMinimized, setResultsMinimized] = useState(false);
  const [planningPriority, setPlanningPriority] = useState<PlanningPriority>('potencial');
  const [originId, setOriginId] = useState('');
  const [destination, setDestination] = useState('São Paulo');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<View>('table');
  const [onlyOnPath, setOnlyOnPath] = useState(true);
  const [query, setQuery] = useState('');
  const [originLocation, setOriginLocation] = useState<DeviceLocation | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<DeviceLocation | null>(null);

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
  const sqlOpportunities = useMemo(() => {
    const unique = new Map<string, PlannerOpportunity>();
    for (const point of plannerStores) {
      if (point.kind !== 'loja') continue;
      const opportunity = toPlannerOpportunity(point);
      unique.set(opportunity.id, opportunity);
    }
    return [...unique.values()];
  }, [plannerStores]);
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
  const suggestions = useMemo(() => {
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
  const selected = suggestions.filter((store) => selectedIds.includes(store.id));
  const totalDaysWithoutVisit = suggestions.filter((store) => store.daysWithoutVisit > 30).length;
  const alerts = suggestions.filter((store) => store.alerts > 0).length;
  const highPriority = suggestions.filter((store) => priorityBand(store, planningPriority) === 'alta').length;
  const nearbyGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const store of suggestions) {
      const label = [store.municipio, store.uf].filter(Boolean).join('/');
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 4);
  }, [suggestions]);
  const originCoordinates: [number, number] | null = originLocation
    ? [originLocation.longitude, originLocation.latitude]
    : origin?.lngLat ?? null;
  const routePoints = originCoordinates ? [originCoordinates, ...selected.map((store) => store.lngLat)] : [];
  const routeKm = Math.round(routePoints.slice(1).reduce(
    (total, point, index) => total + distanceKm(routePoints[index], point),
    0
  ));
  const travelMinutes = Math.round((routeKm / 45) * 60);
  const visitMinutes = selected.length * 40;
  const finishHour = 8 * 60 + travelMinutes + visitMinutes;
  const finish = `${String(Math.floor(finishHour / 60)).padStart(2, '0')}:${String(finishHour % 60).padStart(2, '0')}`;
  const toggle = (store: PlannerOpportunity) => {
    const selecting = !selectedIds.includes(store.id);
    setSelectedIds((items) => items.includes(store.id)
      ? items.filter((item) => item !== store.id)
      : [...items, store.id]);
    if (selecting) onOpportunityFocus?.({ id: store.id, lngLat: store.lngLat });
  };
  const editJourney = () => {
    setSelectedIds([]);
    setJourneyComplete(false);
  };
  const optimize = () => {
    if (!originCoordinates) return;
    const route = createSqlSuggestedRoute({
      date,
      originName: originLocation?.label ?? origin?.nome ?? 'Origem selecionada',
      originCoordinates,
      destinationName: destination,
      destinationCoordinates: destinationLocation
        ? [destinationLocation.longitude, destinationLocation.latitude]
        : null,
      stores: selected,
    });
    if (!route) return;
    onRouteChange(route);
  };
  const header = mergeHeaderDrag(
    'flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2',
    headerDragProps
  );

  if (!journeyComplete) {
    return <div style={shellStyle} className="max-w-[calc(100vw-32px)]"><RoutePlanningJourney agencies={agencies} originId={originId} destination={destination} onClose={onClose} onOriginAgencySelect={(agency) => {
      setOriginLocation(null);
      onAgencyFocus?.(agency);
    }} onOriginLocationSelect={(location) => {
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
      setJourneyComplete(true);
    }} /></div>;
  }

  if (resultsMinimized) {
    return <section
      data-route-planner-results
      style={shellStyle}
      className="pointer-events-auto w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 font-sans text-slate-700 shadow-xl shadow-slate-900/15 backdrop-blur-md"
    >
      <header className={cn(header.className, 'border-b-0')} style={header.dragStyle} {...header.dragHandlers} title="Arraste para mover o painel">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <Navigation className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-slate-800">Montamos um roteiro para você</p>
          <p className="text-[9px] text-slate-500">{selected.length} visita{selected.length === 1 ? '' : 's'} selecionada{selected.length === 1 ? '' : 's'}</p>
        </div>
        <button type="button" data-panel-drag-ignore onClick={() => setResultsMinimized(false)} className="rounded-lg p-1.5 text-violet-600 transition-colors hover:bg-violet-50 hover:text-violet-800" aria-label="Restaurar painel" title="Restaurar painel">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button type="button" data-panel-drag-ignore onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar" title="Fechar">
          <X className="h-4 w-4" />
        </button>
      </header>
    </section>;
  }

  return (
    <section
      data-route-planner-results
      style={shellStyle}
      className="pointer-events-auto flex h-[min(820px,calc(100dvh-166px))] max-h-[calc(100dvh-166px)] w-[calc(100vw-32px)] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 font-sans text-slate-700 shadow-2xl shadow-slate-900/15 backdrop-blur-md lg:w-[min(940px,calc(100vw-348px))]"
    >
      <header className={header.className} style={header.dragStyle} {...header.dragHandlers} title="Arraste para mover o painel">
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

      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
        <section data-planner-territory className="grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <button type="button" onClick={editJourney} className="flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Navigation className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[10px] font-medium text-slate-500">Origem</span><span className="block truncate text-xs font-bold text-slate-800">{originLocation?.label ?? (originLocation ? 'Minha localização' : origin?.nome ?? 'Não definida')}</span></span>
          </button>
          <button type="button" onClick={editJourney} className="flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><MapPin className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[10px] font-medium text-slate-500">Destino</span><span className="block truncate text-xs font-bold text-slate-800">{destination}</span></span>
          </button>
          <button type="button" onClick={editJourney} className="flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><TriangleAlert className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[10px] font-medium text-slate-500">Prioridade</span><span className="block truncate text-xs font-bold text-slate-800">{priorityLabel[planningPriority]}</span></span>
          </button>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-y-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white py-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { Icon: ShoppingCart, iconClass: 'bg-blue-50 text-blue-500', value: suggestions.length, label: 'oportunidades' },
            { Icon: Star, iconClass: 'bg-rose-50 text-rose-500', value: highPriority, label: 'prioritárias' },
            { Icon: TriangleAlert, iconClass: 'bg-amber-50 text-amber-500', value: alerts, label: 'alertas' },
            { Icon: History, iconClass: 'bg-violet-50 text-violet-500', value: totalDaysWithoutVisit, label: 'sem visita há >30 dias' },
            { Icon: UsersRound, iconClass: 'bg-emerald-50 text-emerald-500', value: nearbyGroups.length, label: 'regiões no resultado' },
          ].map(({ Icon, iconClass, value, label }) => <div key={label} className="flex items-center justify-center gap-2 px-3"><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', iconClass)}><Icon className="h-4 w-4" /></span><span className="text-left"><span className="block text-xl font-bold leading-none text-slate-800">{value}</span><span className="mt-1 block whitespace-nowrap text-[10px] font-medium text-slate-500">{label}</span></span></div>)}
        </section>

        <section className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5">{([{ id: 'cards', Icon: LayoutGrid, label: 'Cards' }, { id: 'table', Icon: Table2, label: 'Tabela' }, { id: 'map', Icon: MapPin, label: 'Mapa' }] as const).map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} className={cn('flex items-center gap-1 rounded-md px-2.5 py-2 text-[11px] font-semibold', view === item.id ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500')}><item.Icon className="h-3.5 w-3.5" />{item.label}</button>)}</div>
            <label className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400"><Search className="h-3 w-3" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar oportunidade" className="w-28 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400" /></label>
            <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-600"><SlidersHorizontal className="h-3 w-3" />Filtros</button>
            <button type="button" onClick={() => setOnlyOnPath((value) => !value)} className={cn('flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold', onlyOnPath ? 'bg-violet-50 text-violet-700' : 'text-slate-500')}><span className={cn('h-3 w-5 rounded-full p-0.5', onlyOnPath ? 'bg-violet-600' : 'bg-slate-300')}><span className={cn('block h-2 w-2 rounded-full bg-white transition-transform', onlyOnPath && 'translate-x-2')} /></span>Apenas no caminho</button>
          </div>
          {suggestions.length === 0 ? <div className="p-8 text-center"><ShoppingCart className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">Nenhuma oportunidade encontrada</p><p className="mt-1 text-[10px] text-slate-500">Revise a origem, o destino ou o raio selecionado.</p></div> : view === 'cards' ? <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">{suggestions.map((store) => <OpportunityCard key={store.id} store={store} priority={planningPriority} selected={selectedIds.includes(store.id)} onToggle={() => toggle(store)} />)}</div> : view === 'map' ? <div className="p-8 text-center"><MapPin className="mx-auto h-7 w-7 text-violet-500" /><p className="mt-2 text-xs font-semibold text-slate-700">As oportunidades desta lista são as mesmas exibidas no mapa</p><p className="mt-1 text-[10px] text-slate-500">Altere o destino ou o território para atualizar os resultados.</p></div> : <OpportunityTable stores={suggestions} priority={planningPriority} selectedIds={selectedIds} onToggle={toggle} />}
        </section>

        <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-[11px] font-bold text-slate-800">Distribuição das oportunidades</p>
          {nearbyGroups.length > 0 ? <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">{nearbyGroups.map(({ name, count }, index) => <div key={name} className="flex min-h-[70px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-900/[0.02]"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', index % 2 === 0 ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-500')}><UsersRound className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">{name}</span><span className="mt-0.5 block text-[10px] font-medium text-slate-600">{count} oportunidade{count === 1 ? '' : 's'}</span></span></div>)}</div> : <p className="mt-2 text-[10px] text-slate-500">Nenhuma região disponível para o recorte atual.</p>}
        </section>
      </main>

      <footer className="max-h-[45%] shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5">
          <div className="flex items-center gap-2 border-r border-slate-200 pr-4"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Check className="h-4 w-4" /></span><p className="text-xs font-bold text-slate-800">{selected.length} visitas selecionadas</p></div>
          <Metric label="Distância total" value={`${routeKm} km`} />
          <Metric label="Deslocamento" value={`${Math.floor(travelMinutes / 60)}h${String(travelMinutes % 60).padStart(2, '0')}`} />
          <Metric label="Tempo de visitas" value={`${Math.floor(visitMinutes / 60)}h${String(visitMinutes % 60).padStart(2, '0')}`} />
          <Metric label="Término previsto" value={finish} />
          <button type="button" disabled={!selected.length} onClick={optimize} className="ml-auto flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-violet-300 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4" />Sugerir melhor rota</button>
        </div>
      </footer>
    </section>
  );
};

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="hidden min-w-[72px] sm:block"><p className="text-sm font-bold text-slate-800">{value}</p><p className="text-[10px] text-slate-500">{label}</p></div>;
}

function OpportunityCard({ store, priority, selected, onToggle }: { store: PlannerOpportunity; priority: PlanningPriority; selected: boolean; onToggle: () => void }) {
  const band = priorityBand(store, priority);
  return <button type="button" onClick={onToggle} className={cn('rounded-lg border p-3 text-left transition-colors', selected ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300')}><span className="flex justify-between gap-2"><span className="text-sm font-bold text-slate-800">{store.nome}</span><span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', priorityStyle[band])}>{priorityBandLabel[band]}</span></span><span className="mt-1.5 block text-xs text-slate-500">{[store.municipio, store.uf].filter(Boolean).join('/')} · {store.daysWithoutVisit} dias sem visita</span><span className="mt-1 block text-[10px] text-slate-400">Foco: {store.focus}</span></button>;
}

function SortableTableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: OpportunitySortKey;
  activeSort: { key: OpportunitySortKey; direction: SortDirection } | null;
  onSort: (key: OpportunitySortKey) => void;
}) {
  const active = activeSort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : activeSort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <th
    className="px-2 py-2.5"
    aria-sort={!active ? 'none' : activeSort.direction === 'asc' ? 'ascending' : 'descending'}
  >
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 transition-colors hover:bg-slate-200/70 hover:text-slate-800',
        active && 'text-violet-700'
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  </th>;
}

function OpportunityTable({ stores, priority, selectedIds, onToggle }: { stores: PlannerOpportunity[]; priority: PlanningPriority; selectedIds: string[]; onToggle: (store: PlannerOpportunity) => void }) {
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
      if (activeSort.key === 'municipio') {
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
        direction: key === 'municipio' || key === 'desvio' ? 'asc' : 'desc',
      };
    });
  };

  return <div className="max-h-[285px] overflow-y-auto"><table className="w-full text-left"><thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="w-9 px-3 py-2.5" /><th className="px-2 py-2.5">Oportunidade</th><SortableTableHeader label="Município/UF" sortKey="municipio" activeSort={activeSort} onSort={handleSort} /><SortableTableHeader label="Desvio" sortKey="desvio" activeSort={activeSort} onSort={handleSort} /><SortableTableHeader label="Prioridade" sortKey="prioridade" activeSort={activeSort} onSort={handleSort} /><SortableTableHeader label="Sem visita" sortKey="sem_visita" activeSort={activeSort} onSort={handleSort} /><th className="px-3 py-2.5" /></tr></thead><tbody>{sortedStores.map((store) => {
    const selected = selectedIds.includes(store.id);
    const band = priorityBand(store, priority);
    const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggle(store);
    };
    return <tr key={store.id} onClick={() => onToggle(store)} className={cn('cursor-pointer border-t border-slate-100 text-xs text-slate-600 transition-colors', selected ? 'bg-orange-50/80' : 'hover:bg-slate-50/80')}><td className="px-3 py-3"><button type="button" onClick={handleButtonClick} aria-label={`${selected ? 'Remover' : 'Adicionar'} ${store.nome}`} className={cn('flex h-5 w-5 items-center justify-center rounded border transition-colors', selected ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white')}><Check className="h-3.5 w-3.5" /></button></td><td className="px-2 py-3"><p className="font-semibold text-slate-800">{store.nome}</p><p className="mt-0.5 text-[10px] text-slate-400">Foco: {store.focus}</p></td><td className="px-2 py-3">{[store.municipio, store.uf].filter(Boolean).join('/')}</td><td className="px-2 py-3">+{store.deviationMinutes} min</td><td className="px-2 py-3"><span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', priorityStyle[band])}>{priorityBandLabel[band]}</span></td><td className="px-2 py-3 font-medium">{store.daysWithoutVisit} dias</td><td className="px-3 py-3"><button type="button" onClick={handleButtonClick} className={cn('rounded-md border px-2.5 py-1.5 text-[10px] font-semibold transition-colors', selected ? 'border-orange-200 text-orange-700 hover:bg-orange-100' : 'border-blue-100 text-blue-600 hover:bg-blue-50')}>{selected ? 'Remover' : 'Adicionar'}</button></td></tr>;
  })}</tbody></table></div>;
}

export default RoutePlannerPanel;
