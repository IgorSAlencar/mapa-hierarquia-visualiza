import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Edit3,
  LayoutGrid,
  MapPin,
  Navigation,
  Route as RouteIcon,
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
import {
  PLANNER_AGENCIES,
  PLANNER_STORES,
  createSuggestedRoute,
  missingPillars,
  priorityForStore,
  scoreStore,
} from '@/data/routePlannerMock';
import type { VisitRoute } from '@/data/visitRoutesMock';
import type { CSSProperties } from 'react';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from './mergeHeaderDrag';
import RoutePlanningJourney, { type PlanningPriority } from './RoutePlanningJourney';
import { fetchAgencyPoints } from '@/lib/mapDataApi';
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
  territory: string | null;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

type View = 'cards' | 'table' | 'map';

const scoreStyle = {
  alerta: 'border-rose-200 bg-rose-50 text-rose-700',
  atencao: 'border-amber-200 bg-amber-50 text-amber-700',
  otimo: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
const scoreLabel = { alerta: 'Alta', atencao: 'Média', otimo: 'Baixa' };
const priorityLabel: Record<PlanningPriority, string> = {
  potencial: 'Maior potencial',
  sem_visita: 'Lojas sem visita',
  deslocamento: 'Menor deslocamento',
  alertas: 'Alertas e pendências',
  equilibrado: 'Critérios equilibrados',
};

const RoutePlannerPanel: React.FC<Props> = ({
  onBack,
  onClose,
  onRouteChange,
  onAgencyFocus,
  onOriginLocationFocus,
  onOriginClear,
  onDestinationAgencyFocus,
  territory,
  shellStyle,
  headerDragProps,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [agencies, setAgencies] = useState<RegionMapPoint[]>(PLANNER_AGENCIES);
  const [journeyComplete, setJourneyComplete] = useState(false);
  const [planningPriority, setPlanningPriority] = useState<PlanningPriority>('potencial');
  const [originId, setOriginId] = useState(PLANNER_AGENCIES[0]?.id ?? '');
  const [destination, setDestination] = useState('São Paulo');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<View>('table');
  const [onlyOnPath, setOnlyOnPath] = useState(true);
  const [query, setQuery] = useState('');
  const [originLocation, setOriginLocation] = useState<DeviceLocation | null>(null);

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
      .catch(() => {
        // Mantém as agências mockadas como contingência quando a API estiver indisponível.
      });
    return () => { active = false; };
  }, []);

  const destinations = useMemo(
    () => [...new Set([...agencies.map((agency) => agency.nome), ...PLANNER_STORES.map((store) => store.municipio)])],
    [agencies]
  );
  useEffect(() => {
    if (territory && destinations.includes(territory)) setDestination(territory);
  }, [territory, destinations]);

  const origin = agencies.find((agency) => agency.id === originId);
  const suggestions = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('pt-BR');
    const stores = PLANNER_STORES.filter((store) => {
      if (store.uf !== (origin?.uf ?? store.uf)) return false;
      return !text || `${store.nome} ${store.municipio}`.toLocaleLowerCase('pt-BR').includes(text);
    });
    return stores.sort((a, b) => {
      if (planningPriority === 'sem_visita') return b.diasSemVisita - a.diasSemVisita;
      if (planningPriority === 'alertas') return Number(scoreStore(a) !== 'alerta') - Number(scoreStore(b) !== 'alerta') || priorityForStore(b) - priorityForStore(a);
      if (planningPriority === 'deslocamento') return a.diasSemVisita - b.diasSemVisita;
      return priorityForStore(b) - priorityForStore(a);
    });
  }, [origin?.uf, query, planningPriority]);
  const selected = suggestions.filter((store) => selectedIds.includes(store.id));
  const totalDaysWithoutVisit = suggestions.filter((store) => store.diasSemVisita > 30).length;
  const alerts = suggestions.filter((store) => scoreStore(store) === 'alerta').length;
  const highPriority = suggestions.filter((store) => priorityForStore(store) >= 60).length;
  const routeKm = Math.max(0, selected.length * 11 + (selected.length ? 8 : 0));
  const travelMinutes = selected.length * 22 + (selected.length ? 15 : 0);
  const visitMinutes = selected.length * 40;
  const finishHour = 8 * 60 + travelMinutes + visitMinutes;
  const finish = `${String(Math.floor(finishHour / 60)).padStart(2, '0')}:${String(finishHour % 60).padStart(2, '0')}`;
  const toggle = (id: string) => setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const optimize = () => {
    const route = createSuggestedRoute(date, originId, destination, selectedIds, agencies);
    if (!route) return;
    if (originLocation) {
      route.id = `${route.id}-device-location`;
      route.origin = {
        nome: originLocation.label ?? 'Minha localização',
        lng: originLocation.longitude,
        lat: originLocation.latitude,
      };
    }
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
    }} onDestinationAgencySelect={onDestinationAgencyFocus} headerDragProps={headerDragProps} onComplete={(result) => {
      setOriginId(result.originId);
      setDestination(result.destination);
      setPlanningPriority(result.priority);
      setJourneyComplete(true);
    }} /></div>;
  }

  return (
    <section
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
        <button type="button" data-panel-drag-ignore onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
        <section data-planner-territory className="grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <button type="button" onClick={() => setJourneyComplete(false)} className="flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Navigation className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[10px] font-medium text-slate-500">Origem</span><span className="block truncate text-xs font-bold text-slate-800">{originLocation?.label ?? (originLocation ? 'Minha localização' : origin?.nome ?? 'Não definida')}</span></span>
          </button>
          <button type="button" onClick={() => setJourneyComplete(false)} className="flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><MapPin className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[10px] font-medium text-slate-500">Destino</span><span className="block truncate text-xs font-bold text-slate-800">{destination}</span></span>
          </button>
          <button type="button" onClick={() => setJourneyComplete(false)} className="flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50">
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
            { Icon: UsersRound, iconClass: 'bg-emerald-50 text-emerald-500', value: Math.max(0, suggestions.length - 1), label: 'em regiões próximas' },
          ].map(({ Icon, iconClass, value, label }) => <div key={label} className="flex items-center justify-center gap-2 px-3"><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', iconClass)}><Icon className="h-4 w-4" /></span><span className="text-left"><span className="block text-xl font-bold leading-none text-slate-800">{value}</span><span className="mt-1 block whitespace-nowrap text-[10px] font-medium text-slate-500">{label}</span></span></div>)}
        </section>

        <section className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5">{([{ id: 'cards', Icon: LayoutGrid, label: 'Cards' }, { id: 'table', Icon: Table2, label: 'Tabela' }, { id: 'map', Icon: MapPin, label: 'Mapa' }] as const).map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} className={cn('flex items-center gap-1 rounded-md px-2.5 py-2 text-[11px] font-semibold', view === item.id ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500')}><item.Icon className="h-3.5 w-3.5" />{item.label}</button>)}</div>
            <label className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-400"><Search className="h-3 w-3" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar oportunidade" className="w-28 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400" /></label>
            <button type="button" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-600"><SlidersHorizontal className="h-3 w-3" />Filtros</button>
            <button type="button" onClick={() => setOnlyOnPath((value) => !value)} className={cn('flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold', onlyOnPath ? 'bg-violet-50 text-violet-700' : 'text-slate-500')}><span className={cn('h-3 w-5 rounded-full p-0.5', onlyOnPath ? 'bg-violet-600' : 'bg-slate-300')}><span className={cn('block h-2 w-2 rounded-full bg-white transition-transform', onlyOnPath && 'translate-x-2')} /></span>Apenas no caminho</button>
          </div>
          {view === 'cards' ? <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">{suggestions.map((store) => <OpportunityCard key={store.id} store={store} selected={selectedIds.includes(store.id)} onToggle={() => toggle(store.id)} />)}</div> : view === 'map' ? <div className="p-8 text-center"><MapPin className="mx-auto h-7 w-7 text-violet-500" /><p className="mt-2 text-xs font-semibold text-slate-700">Use o mapa ao lado para explorar o território</p><p className="mt-1 text-[10px] text-slate-500">Clique nos municípios da malha para atualizar o contexto.</p></div> : <OpportunityTable stores={suggestions} selectedIds={selectedIds} onToggle={toggle} />}
        </section>

        <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-[11px] font-bold text-slate-800">Próximas da região</p>
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">{[
            { name: 'Osasco', count: 3, icon: UsersRound, style: 'bg-violet-50 text-violet-600' },
            { name: 'Guarulhos', count: 2, icon: ShoppingCart, style: 'bg-blue-50 text-blue-500' },
            { name: 'Santo André', count: 1, icon: UsersRound, style: 'bg-emerald-50 text-emerald-500' },
          ].map(({ name, count, icon: Icon, style }) => <button key={name} type="button" className="flex min-h-[78px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm shadow-slate-900/[0.02] hover:border-violet-200"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', style)}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">{name}</span><span className="mt-0.5 block text-[10px] font-medium text-slate-600">{count} oportunidade{count === 1 ? '' : 's'}</span><span className="mt-1 block whitespace-nowrap text-[9px] text-emerald-600">◉ Desvio inferior a 15 min</span></span></button>)}<button type="button" className="flex min-h-[78px] items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2 text-left shadow-sm shadow-slate-900/[0.02] hover:bg-violet-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600"><UsersRound className="h-4 w-4" /></span><span className="min-w-0 flex-1 text-[10px] font-bold leading-snug text-violet-700">Ver todas as regiões próximas</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-500" /></button></div>
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

function OpportunityCard({ store, selected, onToggle }: { store: typeof PLANNER_STORES[number]; selected: boolean; onToggle: () => void }) {
  const score = scoreStore(store);
  return <button type="button" onClick={onToggle} className={cn('rounded-lg border p-3 text-left', selected ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300')}><span className="flex justify-between gap-2"><span className="text-sm font-bold text-slate-800">{store.nome}</span><span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', scoreStyle[score])}>{scoreLabel[score]}</span></span><span className="mt-1.5 block text-xs text-slate-500">{store.municipio} · {store.diasSemVisita} dias sem visita</span></button>;
}

function OpportunityTable({ stores, selectedIds, onToggle }: { stores: typeof PLANNER_STORES; selectedIds: string[]; onToggle: (id: string) => void }) {
  return <div className="max-h-[285px] overflow-y-auto"><table className="w-full text-left"><thead className="sticky top-0 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="w-9 px-3 py-2.5" /><th className="px-2 py-2.5">Oportunidade</th><th className="px-2 py-2.5">Município</th><th className="px-2 py-2.5">Desvio</th><th className="px-2 py-2.5">Prioridade</th><th className="px-2 py-2.5">Sem visita</th><th className="px-3 py-2.5" /></tr></thead><tbody>{stores.map((store, index) => { const selected = selectedIds.includes(store.id); const score = scoreStore(store); const missing = missingPillars(store); return <tr key={store.id} className="border-t border-slate-100 text-xs text-slate-600"><td className="px-3 py-3"><button type="button" onClick={() => onToggle(store.id)} className={cn('flex h-5 w-5 items-center justify-center rounded border', selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white')}><Check className="h-3.5 w-3.5" /></button></td><td className="px-2 py-3"><p className="font-semibold text-slate-800">{store.nome}</p><p className="mt-0.5 text-[10px] text-slate-400">{missing[0] ? `Foco: ${missing[0]}` : 'Manutenção'}</p></td><td className="px-2 py-3">{store.municipio}</td><td className="px-2 py-3">+{2 + index * 2} min</td><td className="px-2 py-3"><span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', scoreStyle[score])}>{scoreLabel[score]}</span></td><td className="px-2 py-3 font-medium">{store.diasSemVisita} dias</td><td className="px-3 py-3"><button type="button" onClick={() => onToggle(store.id)} className="rounded-md border border-blue-100 px-2.5 py-1.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50">{selected ? 'Remover' : 'Adicionar'}</button></td></tr>; })}</tbody></table></div>;
}

export default RoutePlannerPanel;
