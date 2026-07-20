import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
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
import type { RegionMapPoint } from '@/data/regionMapPointsMock';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import type { DeviceLocation } from '@/lib/deviceGeolocation';
import { fetchStorePoints, type SqlMapPoint } from '@/lib/mapDataApi';
import {
  fetchAddressSuggestions,
  fetchMunicipalitySuggestions,
  type AddressSuggestion,
} from '@/lib/mapboxGeocoding';
import { mergeHeaderDrag } from './mergeHeaderDrag';

export type PlanningPriority = 'potencial' | 'sem_visita' | 'deslocamento' | 'alertas' | 'equilibrado';
export type RoutePlanningScreen = 0 | 1 | 2 | 3 | 4;

interface JourneyResult {
  intention: string;
  originId: string;
  destination: string;
  initialScreen?: RoutePlanningScreen;
  initialPriority?: PlanningPriority;
  initialDestinationLocation?: DeviceLocation | null;
  territoryRadiusKm: number | null;
  priority: PlanningPriority;
}

type DestinationType = 'agencia' | 'municipio' | 'endereco' | 'territorio';
type OriginType = 'agencia' | 'endereco' | 'loja';

interface Props {
  agencies: RegionMapPoint[];
  originId: string;
  destination: string;
  initialScreen?: RoutePlanningScreen;
  initialPriority?: PlanningPriority;
  initialDestinationLocation?: DeviceLocation | null;
  onClose: () => void;
  onComplete: (result: JourneyResult) => void;
  initialOriginStore?: SqlMapPoint | null;
  initialOriginLocation?: DeviceLocation | null;
  onOriginAgencySelect?: (agency: RegionMapPoint) => void;
  onOriginStoreSelect?: (store: SqlMapPoint | null) => void;
  onOriginLocationSelect?: (location: DeviceLocation | null) => void;
  onDestinationAgencySelect?: (agency: RegionMapPoint) => void;
  onDestinationLocationSelect?: (location: DeviceLocation | null) => void;
  onDestinationClear?: () => void;
  onTerritoryRadiusSelect?: (radiusKm: number | null) => void;
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
  'route-planning-welcome-image mx-auto block w-full max-h-[clamp(88px,24dvh,220px)] object-contain object-bottom';

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

const RoutePlanningJourney: React.FC<Props> = ({ agencies, originId, destination, initialScreen = 0, initialPriority = 'potencial', initialOriginStore = null, initialOriginLocation = null, initialDestinationLocation = null, onClose, onComplete, onOriginAgencySelect, onOriginStoreSelect, onOriginLocationSelect, onDestinationAgencySelect, onDestinationLocationSelect, onDestinationClear, onTerritoryRadiusSelect, headerDragProps }) => {
  const initialDestinationAgencyId = agencies.find((agency) => agency.nome === destination)?.id ?? '';
  const initialTerritoryRadius = /^Território em um raio de (\d+(?:[.,]\d+)?) km$/i.exec(destination)?.[1];
  const parsedInitialTerritoryRadius = initialTerritoryRadius
    ? Number(initialTerritoryRadius.replace(',', '.'))
    : null;
  const [screen, setScreen] = useState<RoutePlanningScreen>(initialScreen);
  const [intention, setIntention] = useState('rotina');
  const [originType, setOriginType] = useState<OriginType>(initialOriginStore ? 'loja' : initialOriginLocation ? 'endereco' : 'agencia');
  const [selectedOriginId, setSelectedOriginId] = useState(originId);
  const [selectedOriginStore, setSelectedOriginStore] = useState<SqlMapPoint | null>(initialOriginStore);
  const [destinationType, setDestinationType] = useState<DestinationType>(
    initialDestinationAgencyId
      ? 'agencia'
      : parsedInitialTerritoryRadius
        ? 'territorio'
        : initialDestinationLocation
          ? 'municipio'
          : 'municipio'
  );
  const [destinationAgencyId, setDestinationAgencyId] = useState(initialDestinationAgencyId);
  const [selectedDestination, setSelectedDestination] = useState(destination);
  const [destinationLocation, setDestinationLocation] = useState<DeviceLocation | null>(initialDestinationLocation);
  const [territoryRadiusKm, setTerritoryRadiusKm] = useState<number | null>(parsedInitialTerritoryRadius);
  const [priority, setPriority] = useState<PlanningPriority>(initialPriority);
  const [addressLocation, setAddressLocation] = useState<DeviceLocation | null>(initialOriginLocation);
  const notifiedOriginAgencyIdRef = useRef<string | null>(null);
  const notifiedDestinationAgencyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedOriginId && !agencies.some((agency) => agency.id === selectedOriginId)) {
      setSelectedOriginId('');
    }
    if (destinationAgencyId && !agencies.some((agency) => agency.id === destinationAgencyId)) {
      setDestinationAgencyId('');
    }
  }, [agencies, selectedOriginId, destinationAgencyId]);

  useEffect(() => {
    if (screen !== 2 || originType !== 'agencia' || !selectedOriginId) {
      notifiedOriginAgencyIdRef.current = null;
      return;
    }
    const agency = agencies.find((item) => item.id === selectedOriginId);
    if (!agency || notifiedOriginAgencyIdRef.current === agency.id) return;
    notifiedOriginAgencyIdRef.current = agency.id;
    onOriginAgencySelect?.(agency);
  }, [agencies, onOriginAgencySelect, originType, screen, selectedOriginId]);

  useEffect(() => {
    if (screen !== 3 || destinationType !== 'agencia' || !destinationAgencyId) {
      notifiedDestinationAgencyIdRef.current = null;
      return;
    }
    const agency = agencies.find((item) => item.id === destinationAgencyId);
    if (!agency || notifiedDestinationAgencyIdRef.current === agency.id) return;
    notifiedDestinationAgencyIdRef.current = agency.id;
    onDestinationAgencySelect?.(agency);
  }, [agencies, destinationAgencyId, destinationType, onDestinationAgencySelect, screen]);

  const finish = () => {
    const agencyDestination = agencies.find((agency) => agency.id === destinationAgencyId)?.nome;
    onComplete({
      intention,
      originId: originType === 'agencia' ? selectedOriginId : '',
      destination: destinationType === 'agencia' ? agencyDestination ?? selectedDestination : selectedDestination,
      territoryRadiusKm,
      priority,
    });
  };

  const handleContinue = () => {
    if (screen === 4) finish();
    else setScreen((value) => Math.min(4, value + 1) as RoutePlanningScreen);
  };

  const handleOriginTypeSelect = (type: OriginType) => {
    if (type === originType) return;
    setOriginType(type);
    if (type !== 'agencia') setSelectedOriginId('');
    if (type !== 'loja') {
      setSelectedOriginStore(null);
      onOriginStoreSelect?.(null);
    }
    if (type !== 'endereco') {
      setAddressLocation(null);
      onOriginLocationSelect?.(null);
    }
  };

  const handleOriginStoreSelect = (store: SqlMapPoint | null) => {
    setSelectedOriginStore(store);
    if (store) {
      setSelectedOriginId('');
      setAddressLocation(null);
      onOriginLocationSelect?.(null);
    }
    onOriginStoreSelect?.(store);
  };

  const handleDestinationTypeSelect = (type: DestinationType) => {
    if (type === destinationType) return;
    setDestinationType(type);
    setDestinationAgencyId('');
    setDestinationLocation(null);
    setTerritoryRadiusKm(null);
    setSelectedDestination('');
    onDestinationClear?.();
    onTerritoryRadiusSelect?.(null);
  };

  const handleDestinationLocation = (location: DeviceLocation | null) => {
    setDestinationLocation(location);
    setSelectedDestination(location?.label ?? '');
    onDestinationLocationSelect?.(location);
  };

  const handleTerritoryRadius = (radiusKm: number) => {
    setTerritoryRadiusKm(radiusKm);
    setSelectedDestination(`Território em um raio de ${radiusKm} km`);
    onTerritoryRadiusSelect?.(radiusKm);
  };

  const canContinue =
    (screen !== 2 || originType !== 'agencia' || Boolean(selectedOriginId)) &&
    (screen !== 2 || originType !== 'endereco' || Boolean(addressLocation)) &&
    (screen !== 2 || originType !== 'loja' || Boolean(selectedOriginStore)) &&
    (screen !== 3 || destinationType !== 'agencia' || Boolean(destinationAgencyId)) &&
    (screen !== 3 || destinationType !== 'municipio' || Boolean(destinationLocation)) &&
    (screen !== 3 || destinationType !== 'endereco' || Boolean(destinationLocation)) &&
    (screen !== 3 || destinationType !== 'territorio' || Boolean(territoryRadiusKm));

  if (screen === 0) {
    return (
      <JourneyShell title="Montar meu roteiro" onClose={onClose} headerDragProps={headerDragProps}>
        <div className="route-planning-welcome-body flex min-h-0 flex-col overflow-hidden px-3 pb-3 pt-1 sm:px-6 sm:pb-5 sm:pt-2">
          <div className="route-planning-stage min-h-0 overflow-hidden">
            <div className="route-planning-welcome-hero relative mx-auto w-full max-w-[400px] shrink-0 sm:max-w-[420px]">
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
              style={ROUTE_PLANNER_HERO_EDGE_FADE}
              className={cn('relative z-[1]', ROUTE_PLANNER_HERO_IMG_CLASS)}
            />
            </div>
            <div className="mt-3 text-center sm:mt-4">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Para onde vamos hoje?</h2>
              <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-slate-500 sm:mt-3">Vamos montar o melhor roteiro de visitas com base na sua intenção.</p>
            </div>
            <div className="route-planning-welcome-features mx-auto mt-4 grid w-full max-w-[360px] grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600 sm:mt-5 sm:gap-y-3">
              {[['Oportunidades certas', Target], ['Melhor ordem de visitas', MapPin], ['Menos deslocamento', Navigation], ['Mais resultados', Zap]].map(([label, Icon]) => <div key={String(label)} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span><span>{String(label)}</span></div>)}
            </div>
          </div>
          <div className="route-planning-footer shrink-0 border-t border-slate-100 bg-white pt-3">
            <button type="button" onClick={() => setScreen(1)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 sm:py-3.5">Começar <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </JourneyShell>
    );
  }

  return (
    <JourneyShell title="Montar meu roteiro" step={screen} onClose={onClose} headerDragProps={headerDragProps}>
      <div className="route-planning-step-body flex min-h-0 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-7 sm:pb-5 sm:pt-5">
        <div className="route-planning-stage min-h-0 overflow-hidden">
          {screen === 1 && <>
          <JourneyTitle title="Qual é sua intenção hoje?" subtitle="Selecione uma ou mais opções." />
          <div className="route-planning-choice-list route-planning-intention-grid mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:mt-5">{INTENTIONS.map((option) => <ChoiceCard key={option.id} {...option} selected={intention === option.id} onClick={() => setIntention(option.id)} />)}</div>
        </>}
        {screen === 2 && <>
          <JourneyTitle title="De onde você vai sair?" subtitle="Selecione sua origem." />
          <div className="route-planning-choice-list mt-4 space-y-2 sm:mt-5">
            <ChoiceRow icon={UsersRound} title="Agência" description="Sair de uma agência" selected={originType === 'agencia'} onClick={() => handleOriginTypeSelect('agencia')}>
              {originType === 'agencia' && <AgencySearchSelect agencies={agencies} value={selectedOriginId} onChange={setSelectedOriginId} placeholder="Buscar agência por código ou nome..." />}
            </ChoiceRow>
            <ChoiceRow icon={MapPin} title="Endereço" description="Digitar um endereço específico" selected={originType === 'endereco'} onClick={() => handleOriginTypeSelect('endereco')}>
              {originType === 'endereco' && <AddressAutocomplete
                value={addressLocation}
                inputLabel="Buscar endereço de origem"
                onChange={(location) => {
                  setAddressLocation(location);
                  onOriginLocationSelect?.(location);
                }}
              />}
            </ChoiceRow>
            <ChoiceRow icon={Store} title="Loja específica" description="Sair de uma loja" selected={originType === 'loja'} onClick={() => handleOriginTypeSelect('loja')}>
              {originType === 'loja' && <StoreSearchSelect value={selectedOriginStore} onChange={handleOriginStoreSelect} />}
            </ChoiceRow>
          </div>
        </>}
        {screen === 3 && <>
          <JourneyTitle title="Para onde pretende ir?" subtitle="Defina seu destino ou área de atuação." />
          <div className="route-planning-choice-list route-planning-destination-list mt-4 space-y-2 sm:mt-5">
            <ChoiceRow icon={MapPin} title="Município" description="Buscar uma cidade pelo nome" selected={destinationType === 'municipio'} onClick={() => handleDestinationTypeSelect('municipio')}>
              {destinationType === 'municipio' && <MunicipalityAutocomplete value={destinationLocation} onChange={handleDestinationLocation} />}
            </ChoiceRow>
            <ChoiceRow icon={Building2} title="Agência" description="Escolher uma agência como destino" selected={destinationType === 'agencia'} onClick={() => handleDestinationTypeSelect('agencia')}>
              {destinationType === 'agencia' && <AgencySearchSelect agencies={agencies} value={destinationAgencyId} onChange={setDestinationAgencyId} placeholder="Buscar agência de destino..." />}
            </ChoiceRow>
            <ChoiceRow icon={Navigation} title="Endereço" description="Digitar um endereço específico" selected={destinationType === 'endereco'} onClick={() => handleDestinationTypeSelect('endereco')}>
              {destinationType === 'endereco' && <AddressAutocomplete value={destinationLocation} inputLabel="Buscar endereço de destino" onChange={handleDestinationLocation} />}
            </ChoiceRow>
            <ChoiceRow icon={ShieldCheck} title="Território" description="Definir uma área ao redor da origem" selected={destinationType === 'territorio'} onClick={() => handleDestinationTypeSelect('territorio')}>
              {destinationType === 'territorio' && <TerritoryRadiusSelect value={territoryRadiusKm} onChange={handleTerritoryRadius} />}
            </ChoiceRow>
          </div>
        </>}
        {screen === 4 && <>
          <JourneyTitle title="Qual é a prioridade do roteiro?" subtitle="Como devemos priorizar as oportunidades?" />
          <div className="route-planning-choice-list route-planning-priority-list mt-4 space-y-2 sm:mt-5">{PRIORITIES.map((option) => <ChoiceRow key={option.id} icon={option.icon} title={option.title} description={option.description} selected={priority === option.id} onClick={() => setPriority(option.id)} />)}</div>
        </>}
        </div>
        <div className="route-planning-footer grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white pt-3 sm:gap-3">
          <button type="button" onClick={() => setScreen((value) => Math.max(0, value - 1) as RoutePlanningScreen)} className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-2 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"><ArrowLeft className="h-4 w-4 shrink-0" />Voltar</button>
          <button type="button" disabled={!canContinue} onClick={handleContinue} className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-sky-600 px-2 py-2.5 text-center text-xs font-semibold leading-tight text-white shadow-md shadow-blue-200 disabled:cursor-not-allowed disabled:opacity-45 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"><span>{screen === 4 ? 'Gerar oportunidades' : 'Continuar'}</span> {screen === 4 ? <Sparkles className="h-4 w-4 shrink-0" /> : <ArrowRight className="h-4 w-4 shrink-0" />}</button>
        </div>
      </div>
    </JourneyShell>
  );
};

function JourneyShell({ title, step, onClose, children, headerDragProps }: { title: string; step?: number; onClose: () => void; children: React.ReactNode; headerDragProps?: PanelHeaderDragProps }) {
  const header = mergeHeaderDrag('flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2', headerDragProps);
  return <section className="route-planning-journey pointer-events-auto flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white font-sans text-slate-700 shadow-2xl shadow-slate-900/20"><header className={header.className} style={header.dragStyle} {...header.dragHandlers} title="Arraste para mover"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Map className="h-3.5 w-3.5" /></span><h1 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide text-slate-900">{title}</h1>{step ? <span className="shrink-0 text-[10px] font-medium text-slate-500">Passo {step} de 4</span> : null}<button type="button" data-panel-drag-ignore onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button></header>{step ? <div className="route-planning-progress mx-3 mt-2 h-0.5 shrink-0 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${step * 25}%` }} /></div> : null}{children}</section>;
}

function JourneyTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="route-planning-title shrink-0"><h2 className="text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>;
}

function ChoiceCard({ icon: Icon, title, description, selected, onClick }: { icon: React.ElementType; title: string; description: string; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('route-planning-choice-card flex min-h-[68px] items-start gap-2 rounded-xl border p-2 text-left transition-colors sm:min-h-[76px] sm:p-2.5', selected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200')}><span className="route-planning-choice-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600"><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0"><span className="route-planning-choice-title block text-sm font-medium leading-tight text-slate-700">{title}</span><span className="route-planning-choice-description mt-1 block text-[10px] leading-snug text-slate-500">{description}</span></span></button>;
}

function ChoiceRow({ icon: Icon, title, description, selected, onClick, children }: { icon: React.ElementType; title: string; description: string; selected: boolean; onClick: () => void; children?: React.ReactNode }) {
  return <div role="button" aria-pressed={selected} data-selected={selected ? 'true' : 'false'} tabIndex={0} onClick={onClick} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onClick(); }} className={cn('route-planning-choice-row relative w-full rounded-xl border px-3 py-2 text-left transition-colors', selected ? 'z-20 border-blue-600 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200')}><span className="flex items-center gap-2.5"><span className={cn('route-planning-choice-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-600')}><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="route-planning-choice-title block text-sm font-medium text-slate-700">{title}</span><span className="route-planning-choice-description mt-0.5 block text-[10px] leading-tight text-slate-500">{description}</span></span>{selected ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-white"><Check className="h-3 w-3" /></span> : null}</span>{children}</div>;
}

function normalizeAgencySearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function normalizeAgencyCodeSearch(value: string | null | undefined): string {
  const raw = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
  if (!raw) return '';

  // Aceita zeros a esquerda e o sufixo ".0" exibido por outras ferramentas.
  if (/^\+?\d+(?:\.0+)?$/.test(raw)) {
    try {
      return BigInt(raw.split('.')[0].replace(/^\+/, '')).toString();
    } catch {
      // Usa busca textual quando o valor nao segue o formato numerico esperado.
    }
  }

  return normalizeAgencySearch(raw);
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
    if (!search) return agencies.slice(0, 20);

    const queryLooksLikeCode = /^\+?[\d\s]+(?:[.,]0+)?$/.test(query.trim());
    const codeSearch = queryLooksLikeCode ? normalizeAgencyCodeSearch(query) : '';

    return agencies
      .map((agency, index) => {
        const code = normalizeAgencyCodeSearch(agency.codAg);
        const name = normalizeAgencySearch(agency.nome);
        const searchableLabel = normalizeAgencySearch(`${agency.codAg ?? ''} ${agency.nome}`);
        let rank = Number.POSITIVE_INFINITY;

        if (codeSearch && code === codeSearch) rank = 0;
        else if (codeSearch && code.startsWith(codeSearch)) rank = 1;
        else if (codeSearch && code.includes(codeSearch)) rank = 2;
        else if (name === search) rank = 3;
        else if (name.startsWith(search)) rank = 4;
        else if (searchableLabel.includes(search)) rank = 5;

        return { agency, index, rank };
      })
      .filter((match) => Number.isFinite(match.rank))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, 20)
      .map((match) => match.agency);
  }, [agencies, query]);

  return <div className="route-planning-inline-control relative mt-2" onClick={(event) => event.stopPropagation()}>
    <div className="route-planning-input-shell relative h-10 rounded-full border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/5">
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

function storeLabel(store: SqlMapPoint | null | undefined): string {
  if (!store) return '';
  return store.chaveLoja ? `${store.chaveLoja} - ${store.nome}` : store.nome;
}

function StoreSearchSelect({ value, onChange }: { value: SqlMapPoint | null; onChange: (store: SqlMapPoint | null) => void }) {
  const [query, setQuery] = useState(() => storeLabel(value));
  const [matches, setMatches] = useState<SqlMapPoint[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setQuery(storeLabel(value));
  }, [open, value]);

  useEffect(() => {
    const search = query.trim();
    if (!open || value || search.length < 2) {
      setMatches([]);
      setLoading(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }

    let active = true;
    setMatches([]);
    setActiveIndex(-1);
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetchStorePoints({ search, limit: 20 })
        .then((points) => {
          if (!active) return;
          const stores = points.filter((point) => point.kind === 'loja').slice(0, 20);
          setMatches(stores);
          setActiveIndex(stores.length ? 0 : -1);
        })
        .catch((requestError) => {
          if (!active) return;
          setMatches([]);
          setError(requestError instanceof Error ? requestError.message : 'Não foi possível buscar lojas.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 320);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [open, query, value]);

  const selectStore = (store: SqlMapPoint) => {
    setQuery(storeLabel(store));
    setMatches([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange(store);
  };

  const search = query.trim();
  const status = search.length < 2
    ? 'Digite pelo menos 2 caracteres.'
    : loading
      ? 'Buscando lojas...'
      : error
        ? error
        : matches.length === 0
          ? 'Nenhuma loja encontrada.'
          : '';

  return <div className="route-planning-inline-control relative mt-2" onClick={(event) => event.stopPropagation()}>
    <div className={cn('route-planning-input-shell relative h-10 rounded-full border bg-white/95 shadow-md shadow-slate-900/5', value ? 'border-emerald-300' : 'border-slate-200/90')}>
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
          if (event.key === 'ArrowDown' && matches.length) {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % matches.length);
          } else if (event.key === 'ArrowUp' && matches.length) {
            event.preventDefault();
            setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
          } else if (event.key === 'Enter' && open && activeIndex >= 0) {
            event.preventDefault();
            selectStore(matches[activeIndex]);
          } else if (event.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Buscar por chave ou nome da loja..."
        className="h-full w-full rounded-full border-0 bg-transparent pl-9 pr-9 text-sm text-slate-700 outline-none placeholder:text-slate-400"
        aria-label="Buscar loja de origem por chave ou nome"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="origin-store-suggestions"
        autoComplete="off"
      />
      {value ? <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden /> : null}
    </div>
    {value ? <p className="mt-1.5 px-2 text-[10px] leading-snug text-emerald-700">Loja confirmada · ponto de saída localizado no mapa.</p> : null}
    {open && !value && <div id="origin-store-suggestions" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/15 ring-1 ring-slate-900/5" role="listbox">
      {status ? <p className={cn('px-3 py-2.5 text-xs', error ? 'text-rose-600' : 'text-slate-500')}>{status}</p> : matches.map((store, index) => <button
        key={store.id}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => selectStore(store)}
        className={cn('flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors', index === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50')}
        role="option"
        aria-selected={index === activeIndex}
      >
        <Store className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-700">{storeLabel(store)}</span>
          <span className="mt-0.5 block truncate text-[10px] text-slate-500">{[store.municipio, store.uf].filter(Boolean).join('/') || 'Localidade não informada'}{store.codAg ? ` · Agência ${store.codAg}` : ''}</span>
        </span>
      </button>)}
    </div>}
  </div>;
}

function AddressAutocomplete({ value, onChange, inputLabel }: { value: DeviceLocation | null; onChange: (location: DeviceLocation | null) => void; inputLabel: string }) {
  return <LocationAutocomplete kind="address" value={value} onChange={onChange} inputLabel={inputLabel} />;
}

function MunicipalityAutocomplete({ value, onChange }: { value: DeviceLocation | null; onChange: (location: DeviceLocation | null) => void }) {
  return <LocationAutocomplete kind="municipality" value={value} onChange={onChange} inputLabel="Buscar município de destino" />;
}

function LocationAutocomplete({ kind, value, onChange, inputLabel }: { kind: 'address' | 'municipality'; value: DeviceLocation | null; onChange: (location: DeviceLocation | null) => void; inputLabel: string }) {
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
      const fetchSuggestions = kind === 'municipality'
        ? fetchMunicipalitySuggestions
        : fetchAddressSuggestions;
      void fetchSuggestions(search, controller.signal)
        .then((items) => {
          setSuggestions(items);
          setActiveIndex(items.length ? 0 : -1);
        })
        .catch((requestError) => {
          if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
          setSuggestions([]);
          setError(requestError instanceof Error ? requestError.message : `Não foi possível buscar ${kind === 'municipality' ? 'municípios' : 'endereços'}.`);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [kind, open, query, value?.label]);

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
      ? `Buscando ${kind === 'municipality' ? 'municípios' : 'endereços'}...`
      : error
        ? error
        : suggestions.length === 0
          ? `Nenhum ${kind === 'municipality' ? 'município' : 'endereço'} encontrado.`
          : '';

  return <div className="route-planning-inline-control relative mt-2" onClick={(event) => event.stopPropagation()}>
    <div className={cn('route-planning-input-shell relative h-10 rounded-full border bg-white/95 shadow-md shadow-slate-900/5', value ? 'border-emerald-300' : 'border-slate-200/90')}>
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
        placeholder={kind === 'municipality' ? 'Digite o nome da cidade...' : 'Rua, número, bairro ou CEP...'}
        className="h-full w-full rounded-full border-0 bg-transparent pl-9 pr-9 text-sm text-slate-700 outline-none placeholder:text-slate-400"
        aria-label={inputLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${kind}-suggestions`}
        autoComplete={kind === 'municipality' ? 'address-level2' : 'street-address'}
      />
      {value ? <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden /> : null}
    </div>
    {value ? <p className="mt-1.5 px-2 text-[10px] leading-snug text-emerald-700">{kind === 'municipality' ? 'Município confirmado · centro da cidade localizado no mapa.' : 'Endereço confirmado · coordenadas prontas para a próxima etapa.'}</p> : null}
    {open && !value && <div id={`${kind}-suggestions`} className="absolute left-0 right-0 top-full z-50 mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/15 ring-1 ring-slate-900/5" role="listbox">
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

const TERRITORY_RADIUS_OPTIONS_KM = [5, 10, 15, 20, 25, 30];

function TerritoryRadiusSelect({ value, onChange }: { value: number | null; onChange: (radiusKm: number) => void }) {
  return <div className="route-planning-territory mt-2" onClick={(event) => event.stopPropagation()}>
    <p className="mb-2 text-[10px] leading-snug text-slate-500">Raio calculado a partir do ponto de origem.</p>
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Raio do território">
      {TERRITORY_RADIUS_OPTIONS_KM.map((radiusKm) => <button
        key={radiusKm}
        type="button"
        role="radio"
        aria-checked={value === radiusKm}
        onClick={() => onChange(radiusKm)}
        className={cn(
          'route-planning-territory-option rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
          value === radiusKm
            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
        )}
      >
        {radiusKm} km
      </button>)}
    </div>
  </div>;
}

export default RoutePlanningJourney;
