import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Crosshair,
  ListChecks,
  Map,
  MapPin,
  Navigation,
  Route,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLANNER_STORES } from '@/data/routePlannerMock';
import type { RegionMapPoint } from '@/data/regionMapPointsMock';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { requestDeviceLocation, type DeviceLocation } from '@/lib/deviceGeolocation';
import {
  fetchAddressSuggestions,
  type AddressSuggestion,
} from '@/lib/mapboxGeocoding';
import { mergeHeaderDrag } from './mergeHeaderDrag';

export type PlanningPriority = 'potencial' | 'sem_visita' | 'deslocamento' | 'alertas' | 'equilibrado';

interface JourneyResult {
  intention: string;
  originId: string;
  destination: string;
  priority: PlanningPriority;
}

interface Props {
  agencies: RegionMapPoint[];
  originId: string;
  destination: string;
  onClose: () => void;
  onComplete: (result: JourneyResult) => void;
  onOriginAgencySelect?: (agency: RegionMapPoint) => void;
  onOriginLocationSelect?: (location: DeviceLocation | null) => void;
  onDestinationAgencySelect?: (agency: RegionMapPoint) => void;
  headerDragProps?: PanelHeaderDragProps;
}

const INTENTIONS = [
  { id: 'rotina', title: 'Visitas de rotina', description: 'Acompanhar e manter relacionamento', icon: ShieldCheck },
  { id: 'pendencias', title: 'Resolver pendências', description: 'Lojas com alertas ou atividades abertas', icon: Clock3 },
  { id: 'prospectar', title: 'Prospectar novas lojas', description: 'Encontrar novas oportunidades', icon: Target },
  { id: 'viagem', title: 'Aproveitar viagem', description: 'Visitar lojas no caminho de uma viagem', icon: Navigation },
  { id: 'cidade', title: 'Visitar cidade específica', description: 'Quero visitar uma cidade ou região', icon: MapPin },
  { id: 'outro', title: 'Outro objetivo', description: 'Personalizar minha intenção', icon: ListChecks },
];

const PRIORITIES: Array<{ id: PlanningPriority; title: string; description: string; icon: React.ElementType }> = [
  { id: 'potencial', title: 'Maior potencial comercial', description: 'Priorizar oportunidades com maior potencial', icon: Target },
  { id: 'sem_visita', title: 'Lojas sem visita', description: 'Priorizar lojas sem visita há mais tempo', icon: Clock3 },
  { id: 'deslocamento', title: 'Menor deslocamento', description: 'Priorizar menor distância e tempo', icon: Route },
  { id: 'alertas', title: 'Alertas e pendências', description: 'Priorizar lojas com alertas e pendências', icon: Bell },
  { id: 'equilibrado', title: 'Misturar tudo automaticamente', description: 'Equilibrar todos os critérios', icon: Sparkles },
];

const ROUTE_PLANNER_HERO_IMG_CLASS =
  'mx-auto block w-full max-h-[clamp(96px,28dvh,260px)] object-contain object-bottom';

/** Esmaece cantos superior, inferior, esquerdo e direito (interseção dos gradientes).
 *  Intensidade do fade: percentuais do meio (ex. 18% / 82%) — quanto mais perto de 50%, mais forte. */
const ROUTE_PLANNER_HERO_EDGE_FADE: React.CSSProperties = {
  maskImage:
    'linear-gradient(to right, transparent 0%, black 18%, black 82%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
  WebkitMaskImage:
    'linear-gradient(to right, transparent 0%, black 18%, black 82%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
};

const RoutePlanningJourney: React.FC<Props> = ({ agencies, originId, destination, onClose, onComplete, onOriginAgencySelect, onOriginLocationSelect, onDestinationAgencySelect, headerDragProps }) => {
  const [screen, setScreen] = useState(0);
  const [intention, setIntention] = useState('rotina');
  const [originType, setOriginType] = useState('agencia');
  const [selectedOriginId, setSelectedOriginId] = useState('');
  const [destinationType, setDestinationType] = useState('agencia');
  const [destinationAgencyId, setDestinationAgencyId] = useState('');
  const [selectedDestination, setSelectedDestination] = useState(destination);
  const [priority, setPriority] = useState<PlanningPriority>('potencial');
  const [originLocation, setOriginLocation] = useState<DeviceLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [addressLocation, setAddressLocation] = useState<DeviceLocation | null>(null);
  const locationRequestIdRef = useRef(0);

  useEffect(() => {
    if (selectedOriginId && !agencies.some((agency) => agency.id === selectedOriginId)) {
      setSelectedOriginId('');
    }
    if (destinationAgencyId && !agencies.some((agency) => agency.id === destinationAgencyId)) {
      setDestinationAgencyId('');
    }
  }, [agencies, selectedOriginId, destinationAgencyId]);

  useEffect(() => {
    if (screen !== 2 || originType !== 'agencia') return;
    const agency = agencies.find((item) => item.id === selectedOriginId);
    if (agency) onOriginAgencySelect?.(agency);
  }, [agencies, onOriginAgencySelect, originType, screen, selectedOriginId]);

  useEffect(() => {
    if (screen !== 3 || destinationType !== 'agencia') return;
    const agency = agencies.find((item) => item.id === destinationAgencyId);
    if (agency) onDestinationAgencySelect?.(agency);
  }, [agencies, destinationAgencyId, destinationType, onDestinationAgencySelect, screen]);

  const finish = () => {
    const agencyDestination = agencies.find((agency) => agency.id === destinationAgencyId)?.nome;
    onComplete({
      intention,
      originId: selectedOriginId || originId,
      destination: destinationType === 'agencia' ? agencyDestination ?? selectedDestination : selectedDestination,
      priority,
    });
  };

  const handleContinue = () => {
    if (screen === 4) finish();
    else setScreen((value) => value + 1);
  };

  const handleCurrentLocation = async () => {
    if (locationLoading) return;
    const requestId = ++locationRequestIdRef.current;
    setOriginType('localizacao');
    setAddressLocation(null);
    setOriginLocation(null);
    onOriginLocationSelect?.(null);
    setLocationLoading(true);
    setLocationError(null);
    try {
      const location = await requestDeviceLocation();
      if (requestId !== locationRequestIdRef.current) return;
      setOriginLocation(location);
      onOriginLocationSelect?.(location);
    } catch (error) {
      if (requestId !== locationRequestIdRef.current) return;
      setOriginLocation(null);
      setLocationError(
        error instanceof Error ? error.message : 'Não foi possível obter sua localização.'
      );
    } finally {
      if (requestId === locationRequestIdRef.current) setLocationLoading(false);
    }
  };

  const handleOriginTypeSelect = (type: string) => {
    if (type === originType) return;
    ++locationRequestIdRef.current;
    setOriginType(type);
    setLocationLoading(false);
    setLocationError(null);
    if (type !== 'localizacao') setOriginLocation(null);
    if (type !== 'endereco') setAddressLocation(null);
    onOriginLocationSelect?.(null);
  };

  const canContinue =
    (screen !== 2 || originType !== 'agencia' || Boolean(selectedOriginId)) &&
    (screen !== 2 || originType !== 'localizacao' || Boolean(originLocation)) &&
    (screen !== 2 || originType !== 'endereco' || Boolean(addressLocation)) &&
    (screen !== 3 || destinationType !== 'agencia' || Boolean(destinationAgencyId));

  if (screen === 0) {
    return (
      <JourneyShell title="Montar meu roteiro" onClose={onClose} headerDragProps={headerDragProps}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-1 sm:px-6 sm:pb-5 sm:pt-2">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className="relative mx-auto w-full max-w-[400px] shrink-0 sm:max-w-[420px]">
            <img
                aria-hidden
                src="/IMG_ROTEIRO.jpg"
                alt=""
                width={1000}
                height={622}
              style={ROUTE_PLANNER_HERO_EDGE_FADE}
              className={cn(
                'pointer-events-none absolute inset-0 z-0 scale-[.01] opacity-[0.10] blur-md',
                ROUTE_PLANNER_HERO_IMG_CLASS,
              )}
            />
            <img
                src="/IMG_ROTEIRO.jpg"
                alt="Ilustração de planejamento de roteiro"
                width={1000}
                height={622}
                loading="eager"
                fetchPriority="high"
              style={ROUTE_PLANNER_HERO_EDGE_FADE}
              className={cn('relative z-[1]', ROUTE_PLANNER_HERO_IMG_CLASS)}
            />
            </div>
            <div className="mt-3 text-center sm:mt-4">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Para onde vamos hoje?</h2>
              <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-slate-500 sm:mt-3">Vamos montar o melhor roteiro de visitas com base na sua intenção.</p>
            </div>
            <div className="mx-auto mt-4 grid w-full max-w-[320px] gap-2 text-sm text-slate-600 sm:mt-5 sm:gap-3">
              {[['Oportunidades certas', Target], ['Melhor ordem de visitas', MapPin], ['Menos deslocamento', Navigation], ['Mais resultados', Zap]].map(([label, Icon]) => <div key={String(label)} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span><span>{String(label)}</span></div>)}
            </div>
          </div>
          <div className="shrink-0 border-t border-slate-100 bg-white pt-3">
            <button type="button" onClick={() => setScreen(1)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 sm:py-3.5">Começar <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </JourneyShell>
    );
  }

  return (
    <JourneyShell title="Montar meu roteiro" step={screen} onClose={onClose} headerDragProps={headerDragProps}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-7 sm:pb-5 sm:pt-5">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {screen === 1 && <>
          <JourneyTitle title="Qual é sua intenção hoje?" subtitle="Selecione uma ou mais opções." />
          <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:mt-5">{INTENTIONS.map((option) => <ChoiceCard key={option.id} {...option} selected={intention === option.id} onClick={() => setIntention(option.id)} />)}</div>
        </>}
        {screen === 2 && <>
          <JourneyTitle title="De onde você vai sair?" subtitle="Selecione sua origem." />
          <div className="mt-4 space-y-2 sm:mt-5">
            <ChoiceRow icon={UsersRound} title="Agência" description="Sair de uma agência" selected={originType === 'agencia'} onClick={() => handleOriginTypeSelect('agencia')}>
              {originType === 'agencia' && <AgencySearchSelect agencies={agencies} value={selectedOriginId} onChange={setSelectedOriginId} placeholder="Buscar agência por código ou nome..." />}
            </ChoiceRow>
            <ChoiceRow icon={Crosshair} title="Minha localização" description="Usar a localização atual do dispositivo" selected={originType === 'localizacao'} onClick={() => void handleCurrentLocation()}>
              {originType === 'localizacao' && <p className={cn('mt-2 text-[10px] leading-snug', locationError ? 'text-rose-600' : originLocation ? 'text-emerald-600' : 'text-slate-500')}>
                {locationLoading
                  ? 'Aguardando autorização do dispositivo...'
                  : locationError
                    ? locationError
                    : originLocation
                      ? `Localização obtida · precisão aproximada de ${Math.round(originLocation.accuracy)} m`
                      : 'Clique novamente para solicitar a localização.'}
              </p>}
            </ChoiceRow>
            <ChoiceRow icon={MapPin} title="Endereço" description="Digitar um endereço específico" selected={originType === 'endereco'} onClick={() => handleOriginTypeSelect('endereco')}>
              {originType === 'endereco' && <AddressAutocomplete
                value={addressLocation}
                onChange={(location) => {
                  setAddressLocation(location);
                  onOriginLocationSelect?.(location);
                }}
              />}
            </ChoiceRow>
            <ChoiceRow icon={Store} title="Loja específica" description="Sair de uma loja" selected={originType === 'loja'} onClick={() => handleOriginTypeSelect('loja')} />
          </div>
        </>}
        {screen === 3 && <>
          <JourneyTitle title="Para onde pretende ir?" subtitle="Defina seu destino ou área de atuação." />
          <div className="mt-4 space-y-2 sm:mt-5">
            <ChoiceRow icon={Building2} title="Agência" description="Escolher uma agência como destino" selected={destinationType === 'agencia'} onClick={() => setDestinationType('agencia')}>
              {destinationType === 'agencia' && <AgencySearchSelect agencies={agencies} value={destinationAgencyId} onChange={setDestinationAgencyId} placeholder="Buscar agência de destino..." />}
            </ChoiceRow>
            <ChoiceRow icon={MapPin} title="Município" description="Escolher uma cidade" selected={destinationType === 'municipio'} onClick={() => setDestinationType('municipio')}>
              {destinationType === 'municipio' && <select value={selectedDestination} onChange={(event) => setSelectedDestination(event.target.value)} onClick={(event) => event.stopPropagation()} className="mt-1.5 w-full rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs outline-none">{[...new Set(PLANNER_STORES.map((store) => store.municipio))].map((city) => <option key={city}>{city}</option>)}</select>}
            </ChoiceRow>
            <ChoiceRow icon={Navigation} title="Região / Bairro" description="Escolher uma região ou bairro" selected={destinationType === 'regiao'} onClick={() => setDestinationType('regiao')} />
            <ChoiceRow icon={ShieldCheck} title="Território" description="Usar meu território de atuação" selected={destinationType === 'territorio'} onClick={() => setDestinationType('territorio')} />
            <ChoiceRow icon={Map} title="Sem destino definido" description="Mostrar oportunidades próximas" selected={destinationType === 'aberto'} onClick={() => setDestinationType('aberto')} />
          </div>
        </>}
        {screen === 4 && <>
          <JourneyTitle title="Qual é a prioridade do roteiro?" subtitle="Como devemos priorizar as oportunidades?" />
          <div className="mt-4 space-y-2 sm:mt-5">{PRIORITIES.map((option) => <ChoiceRow key={option.id} icon={option.icon} title={option.title} description={option.description} selected={priority === option.id} onClick={() => setPriority(option.id)} />)}</div>
        </>}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white pt-3 sm:gap-3">
          <button type="button" onClick={() => setScreen((value) => Math.max(0, value - 1))} className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-2 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"><ArrowLeft className="h-4 w-4 shrink-0" />Voltar</button>
          <button type="button" disabled={!canContinue} onClick={handleContinue} className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-sky-600 px-2 py-2.5 text-center text-xs font-semibold leading-tight text-white shadow-md shadow-blue-200 disabled:cursor-not-allowed disabled:opacity-45 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"><span>{screen === 4 ? 'Gerar oportunidades' : 'Continuar'}</span> {screen === 4 ? <Sparkles className="h-4 w-4 shrink-0" /> : <ArrowRight className="h-4 w-4 shrink-0" />}</button>
        </div>
      </div>
    </JourneyShell>
  );
};

function JourneyShell({ title, step, onClose, children, headerDragProps }: { title: string; step?: number; onClose: () => void; children: React.ReactNode; headerDragProps?: PanelHeaderDragProps }) {
  const header = mergeHeaderDrag('flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2', headerDragProps);
  return <section className="pointer-events-auto flex h-[min(650px,calc(100dvh-166px))] max-h-[calc(100dvh-166px)] min-h-0 w-[min(430px,calc(100vw-32px))] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white font-sans text-slate-700 shadow-2xl shadow-slate-900/20"><header className={header.className} style={header.dragStyle} {...header.dragHandlers} title="Arraste para mover"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Map className="h-3.5 w-3.5" /></span><h1 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide text-slate-900">{title}</h1>{step ? <span className="shrink-0 text-[10px] font-medium text-slate-500">Passo {step} de 4</span> : null}<button type="button" data-panel-drag-ignore onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button></header>{step ? <div className="mx-3 mt-2 h-0.5 shrink-0 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${step * 25}%` }} /></div> : null}{children}</section>;
}

function JourneyTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="shrink-0"><h2 className="text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>;
}

function ChoiceCard({ icon: Icon, title, description, selected, onClick }: { icon: React.ElementType; title: string; description: string; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('flex min-h-[68px] items-start gap-2 rounded-xl border p-2 text-left transition-colors sm:min-h-[76px] sm:p-2.5', selected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200')}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600"><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0"><span className="block text-sm font-medium leading-tight text-slate-700">{title}</span><span className="mt-1 block text-[10px] leading-snug text-slate-500">{description}</span></span></button>;
}

function ChoiceRow({ icon: Icon, title, description, selected, onClick, children }: { icon: React.ElementType; title: string; description: string; selected: boolean; onClick: () => void; children?: React.ReactNode }) {
  return <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onClick(); }} className={cn('relative w-full rounded-xl border px-3 py-2 text-left transition-colors', selected ? 'z-20 border-blue-600 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200')}><span className="flex items-center gap-2.5"><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-600')}><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-700">{title}</span><span className="mt-0.5 block text-[10px] leading-tight text-slate-500">{description}</span></span>{selected ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-white"><Check className="h-3 w-3" /></span> : null}</span>{children}</div>;
}

function normalizeAgencySearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function agencyLabel(agency: RegionMapPoint | undefined): string {
  if (!agency) return '';
  return agency.codAg ? `${agency.codAg} - ${agency.nome}` : agency.nome;
}

function AgencySearchSelect({ agencies, value, onChange, placeholder }: { agencies: RegionMapPoint[]; value: string; onChange: (id: string) => void; placeholder: string }) {
  const selected = agencies.find((agency) => agency.id === value);
  const [query, setQuery] = useState(() => agencyLabel(selected));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) setQuery(agencyLabel(selected));
  }, [selected, open]);

  const matches = useMemo(() => {
    const search = normalizeAgencySearch(query);
    const filtered = search
      ? agencies.filter((agency) => normalizeAgencySearch(`${agency.codAg ?? ''} ${agency.nome}`).includes(search))
      : agencies;
    return filtered.slice(0, 10);
  }, [agencies, query]);

  return <div className="relative mt-2" onClick={(event) => event.stopPropagation()}>
    <div className="relative h-10 rounded-full border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/5">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        placeholder={placeholder}
        className="h-full w-full rounded-full border-0 bg-transparent pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
        aria-label={placeholder}
        autoComplete="off"
      />
    </div>
    {open && <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/15 ring-1 ring-slate-900/5" role="listbox">
      {matches.length === 0 ? <p className="px-3 py-2.5 text-xs text-slate-500">Nenhuma agência encontrada.</p> : matches.map((agency) => <button key={agency.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(agency.id); setQuery(agencyLabel(agency)); setOpen(false); }} className={cn('flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-blue-50', agency.id === value && 'bg-blue-50')} role="option" aria-selected={agency.id === value}>
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
        <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-700">{agency.codAg ? `${agency.codAg} - ` : ''}{agency.nome}</span>{agency.enderecoFormatado ? <span className="mt-0.5 block truncate text-[10px] text-slate-500">{agency.enderecoFormatado}</span> : null}</span>
      </button>)}
    </div>}
  </div>;
}

function AddressAutocomplete({ value, onChange }: { value: DeviceLocation | null; onChange: (location: DeviceLocation | null) => void }) {
  const [query, setQuery] = useState(value?.label ?? '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const search = query.trim();
    if (!open || value?.label === query || search.length < 3) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setSuggestions([]);
    setActiveIndex(-1);
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetchAddressSuggestions(search, controller.signal)
        .then((items) => {
          setSuggestions(items);
          setActiveIndex(items.length ? 0 : -1);
        })
        .catch((requestError) => {
          if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
          setSuggestions([]);
          setError(requestError instanceof Error ? requestError.message : 'Não foi possível buscar endereços.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, value?.label]);

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    const location: DeviceLocation = {
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      accuracy: 0,
      label: suggestion.label,
    };
    setQuery(suggestion.label);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange(location);
  };

  const status = query.trim().length < 3
    ? 'Digite pelo menos 3 caracteres.'
    : loading
      ? 'Buscando endereços...'
      : error
        ? error
        : suggestions.length === 0
          ? 'Nenhum endereço encontrado.'
          : '';

  return <div className="relative mt-2" onClick={(event) => event.stopPropagation()}>
    <div className={cn('relative h-10 rounded-full border bg-white/95 shadow-md shadow-slate-900/5', value ? 'border-emerald-300' : 'border-slate-200/90')}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'ArrowDown' && suggestions.length) {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp' && suggestions.length) {
            event.preventDefault();
            setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
          } else if (event.key === 'Enter' && open && activeIndex >= 0) {
            event.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
          } else if (event.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Rua, número, bairro ou CEP..."
        className="h-full w-full rounded-full border-0 bg-transparent pl-9 pr-9 text-sm text-slate-700 outline-none placeholder:text-slate-400"
        aria-label="Buscar endereço de origem"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="address-suggestions"
        autoComplete="street-address"
      />
      {value ? <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden /> : null}
    </div>
    {value ? <p className="mt-1.5 px-2 text-[10px] leading-snug text-emerald-700">Endereço confirmado · coordenadas prontas para a próxima etapa.</p> : null}
    {open && !value && <div id="address-suggestions" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/15 ring-1 ring-slate-900/5" role="listbox">
      {status ? <p className={cn('px-3 py-2.5 text-xs', error ? 'text-rose-600' : 'text-slate-500')}>{status}</p> : suggestions.map((suggestion, index) => <button
        key={suggestion.id}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => selectSuggestion(suggestion)}
        className={cn('flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors', index === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50')}
        role="option"
        aria-selected={index === activeIndex}
      >
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
        <span className="text-xs leading-snug text-slate-700">{suggestion.label}</span>
      </button>)}
    </div>}
  </div>;
}

export default RoutePlanningJourney;
