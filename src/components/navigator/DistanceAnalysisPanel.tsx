import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Building2,
  CarFront,
  Check,
  Clock3,
  ExternalLink,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import type { VisitRoute } from '@/data/visitRoutes';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { cn } from '@/lib/utils';
import { fetchAddressSuggestions, type AddressSuggestion } from '@/lib/mapboxGeocoding';
import { fetchAgencyPoints, fetchStorePoints, type SqlMapPoint } from '@/lib/mapDataApi';
import { fetchTravelRoute, type TravelMode } from '@/lib/mapboxDirections';
import type { DistanceAnalysisMapSelection } from '@/lib/distanceAnalysis';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';

type EndpointKind = 'endereco' | 'loja' | 'agencia';

interface DistanceEndpoint {
  id: string;
  kind: EndpointKind;
  label: string;
  description: string;
  lngLat: [number, number];
}

interface DistanceResult {
  distanceMeters: number;
  durationSeconds: number;
  generatedAt: Date;
}

interface DistanceAnalysisPanelProps {
  onBack: () => void;
  onClose: () => void;
  onRouteChange: (route: VisitRoute | null) => void;
  mapSelection?: DistanceAnalysisMapSelection | null;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

const ENDPOINT_KIND_OPTIONS: Array<{
  id: EndpointKind;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'endereco', label: 'Endereço', icon: MapPin },
  { id: 'loja', label: 'Loja', icon: Store },
  { id: 'agencia', label: 'Agência', icon: Building2 },
];

const ENDPOINT_KIND_LABEL: Record<EndpointKind, string> = {
  endereco: 'Endereço',
  loja: 'Loja',
  agencia: 'Agência',
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function pointLabel(point: SqlMapPoint): string {
  if (point.kind === 'agencia') {
    return [String(point.codAg ?? '').trim(), point.nome].filter(Boolean).join(' - ');
  }
  return [String(point.chaveLoja ?? '').trim(), point.nome].filter(Boolean).join(' - ');
}

function pointDescription(point: SqlMapPoint): string {
  if (point.enderecoFormatado) return point.enderecoFormatado;
  const location = [point.municipio, point.uf].filter(Boolean).join('/');
  if (point.kind === 'loja' && point.codAg) {
    return [location, `Agência ${point.codAg}`].filter(Boolean).join(' · ');
  }
  return location || (point.kind === 'agencia' ? 'Agência localizada no mapa' : 'Loja localizada no mapa');
}

function toEndpoint(point: SqlMapPoint, kind: EndpointKind): DistanceEndpoint {
  return {
    id: `${kind}-${point.id}`,
    kind,
    label: pointLabel(point),
    description: pointDescription(point),
    lngLat: point.lngLat,
  };
}

function addressToEndpoint(suggestion: AddressSuggestion): DistanceEndpoint {
  return {
    id: `endereco-${suggestion.id}`,
    kind: 'endereco',
    label: suggestion.label,
    description: 'Endereço confirmado no mapa',
    lngLat: [suggestion.longitude, suggestion.latitude],
  };
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes} min`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}min`;
}

function formatDistance(meters: number): string {
  if (meters < 1_000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1_000).toLocaleString('pt-BR', {
    minimumFractionDigits: meters < 10_000 ? 1 : 0,
    maximumFractionDigits: 1,
  })} km`;
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function calendarDayKey(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatArrival(generatedAt: Date, durationSeconds: number): string {
  const arrival = new Date(generatedAt.getTime() + durationSeconds * 1_000);
  const dayOffset = Math.max(
    0,
    Math.round((calendarDayKey(arrival) - calendarDayKey(generatedAt)) / 86_400_000)
  );
  const arrivalClock = formatClock(arrival);
  if (dayOffset === 0) return arrivalClock;
  return `+${dayOffset} ${dayOffset === 1 ? 'dia' : 'dias'} · ${arrivalClock}`;
}

function routeCacheKey(
  origin: DistanceEndpoint,
  destination: DistanceEndpoint,
  mode: TravelMode
): string {
  const coordinates = [...origin.lngLat, ...destination.lngLat]
    .map((value) => value.toFixed(5))
    .join('-');
  return `analise-distancia-${mode}-${coordinates}`;
}

function googleMapsUrl(
  origin: DistanceEndpoint,
  destination: DistanceEndpoint,
  mode: TravelMode
): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lngLat[1].toFixed(6)},${origin.lngLat[0].toFixed(6)}`,
    destination: `${destination.lngLat[1].toFixed(6)},${destination.lngLat[0].toFixed(6)}`,
    travelmode: mode,
    dir_action: 'navigate',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function EndpointField({
  role,
  kind,
  value,
  agencies,
  agenciesLoading,
  onKindChange,
  onChange,
}: {
  role: 'partida' | 'destino';
  kind: EndpointKind | null;
  value: DistanceEndpoint | null;
  agencies: SqlMapPoint[];
  agenciesLoading: boolean;
  onKindChange: (kind: EndpointKind) => void;
  onChange: (value: DistanceEndpoint | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<DistanceEndpoint[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value?.label ?? '');
  }, [value]);

  useEffect(() => {
    if (!kind || !open || value) {
      setMatches([]);
      setLoading(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }

    const search = query.trim();
    const minimumLength = kind === 'endereco' ? 3 : kind === 'loja' ? 2 : 0;
    if (search.length < minimumLength) {
      setMatches([]);
      setLoading(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }

    if (kind === 'agencia') {
      const normalizedSearch = normalize(search);
      const filtered = agencies
        .map((point) => ({
          point,
          searchable: normalize(`${point.codAg ?? ''} ${point.nome} ${point.enderecoFormatado ?? ''}`),
        }))
        .filter(({ searchable }) => searchable.includes(normalizedSearch))
        .slice(0, 20)
        .map(({ point }) => toEndpoint(point, 'agencia'));
      setMatches(filtered);
      setActiveIndex(filtered.length ? 0 : -1);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setMatches([]);
    setActiveIndex(-1);
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const request = kind === 'endereco'
        ? fetchAddressSuggestions(search, controller.signal).then((items) => items.map(addressToEndpoint))
        : fetchStorePoints({ search, limit: 20 }).then((points) =>
            points
              .filter((point) => point.kind === 'loja')
              .slice(0, 20)
              .map((point) => toEndpoint(point, 'loja'))
          );

      void request
        .then((items) => {
          if (!active) return;
          setMatches(items);
          setActiveIndex(items.length ? 0 : -1);
        })
        .catch((reason) => {
          if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
          setMatches([]);
          setError(
            reason instanceof Error
              ? reason.message
              : `Não foi possível buscar ${kind === 'loja' ? 'lojas' : 'endereços'}.`
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, kind === 'endereco' ? 350 : 320);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [agencies, kind, open, query, value]);

  useEffect(() => {
    if (!open || value) {
      setDropdownStyle(null);
      return;
    }

    const updatePosition = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;
      const desiredHeight = 192;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < 150 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        96,
        Math.min(desiredHeight, openAbove ? spaceAbove - gap : spaceBelow - gap)
      );

      setDropdownStyle({
        position: 'fixed',
        left: Math.max(viewportPadding, rect.left),
        top: openAbove ? Math.max(viewportPadding, rect.top - maxHeight - gap) : rect.bottom + gap,
        width: Math.min(rect.width, window.innerWidth - viewportPadding * 2),
        maxHeight,
        zIndex: 120,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('pointermove', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('pointermove', updatePosition);
    };
  }, [open, value]);

  const select = (endpoint: DistanceEndpoint) => {
    setQuery(endpoint.label);
    setMatches([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange(endpoint);
  };

  const placeholder = kind === 'endereco'
    ? 'Rua, número, bairro ou CEP...'
    : kind === 'loja'
      ? 'Chave ou nome da loja...'
      : 'Código ou nome da agência...';
  const minimumLength = kind === 'endereco' ? 3 : kind === 'loja' ? 2 : 0;
  const helper = query.trim().length < minimumLength
    ? `Digite pelo menos ${minimumLength} caracteres.`
    : loading || (kind === 'agencia' && agenciesLoading)
      ? `Buscando ${kind === 'agencia' ? 'agências' : kind === 'loja' ? 'lojas' : 'endereços'}...`
      : error
        ? error
        : matches.length === 0
          ? kind === 'endereco'
            ? 'Nenhum endereço encontrado.'
            : kind === 'agencia'
              ? 'Nenhuma agência encontrada.'
              : 'Nenhuma loja encontrada.'
          : '';

  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white',
              role === 'partida' ? 'bg-blue-700' : 'bg-emerald-500'
            )}
          >
            {role === 'partida' ? 'A' : 'B'}
          </span>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {role === 'partida' ? 'Ponto de partida' : 'Ponto de ida'}
            </p>
            <p className="text-xs font-semibold text-slate-800">
              {role === 'partida' ? 'De onde você vai sair?' : 'Para onde você vai?'}
            </p>
          </div>
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Limpar ponto de ${role}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={`Tipo do ponto de ${role}`}>
        {ENDPOINT_KIND_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = kind === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onKindChange(option.id)}
              className={cn(
                'flex min-w-0 items-center justify-center gap-1 rounded-xl border bg-white px-1.5 py-2.5 text-[10px] font-semibold shadow-sm transition-all',
                selected
                  ? 'border-blue-400 text-blue-700 ring-2 ring-blue-100'
                  : 'border-slate-200 text-slate-500 hover:border-blue-200 hover:text-slate-700'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-2.5">
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex w-full items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-left transition-colors hover:border-emerald-300"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-800">{value.label}</span>
              <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                {ENDPOINT_KIND_LABEL[value.kind]} · {value.description}
              </span>
            </span>
          </button>
        ) : kind ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 170)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && matches.length) {
                    event.preventDefault();
                    setActiveIndex((index) => (index + 1) % matches.length);
                  } else if (event.key === 'ArrowUp' && matches.length) {
                    event.preventDefault();
                    setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
                  } else if (event.key === 'Enter' && open && activeIndex >= 0) {
                    event.preventDefault();
                    select(matches[activeIndex]);
                  } else if (event.key === 'Escape') {
                    setOpen(false);
                    inputRef.current?.blur();
                  }
                }}
                placeholder={placeholder}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-9 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                aria-label={`Buscar ${ENDPOINT_KIND_LABEL[kind].toLowerCase()} para o ponto de ${role}`}
                aria-autocomplete="list"
                aria-expanded={open}
                autoComplete="off"
              />
              {(loading || (kind === 'agencia' && agenciesLoading)) ? (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" />
              ) : null}
            </div>

            {open && dropdownStyle ? createPortal(
              <div
                style={dropdownStyle}
                className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5"
                role="listbox"
              >
                {helper ? (
                  <p className={cn('px-3 py-2.5 text-[11px] leading-snug', error ? 'text-rose-600' : 'text-slate-500')}>
                    {helper}
                  </p>
                ) : (
                  matches.map((endpoint, index) => {
                    const Icon = endpoint.kind === 'agencia' ? Building2 : endpoint.kind === 'loja' ? Store : MapPin;
                    return (
                      <button
                        key={endpoint.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => select(endpoint)}
                        className={cn(
                          'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          index === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                        )}
                        role="option"
                        aria-selected={index === activeIndex}
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800">{endpoint.label}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500">{endpoint.description}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>,
              document.body
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

const DistanceAnalysisPanel: React.FC<DistanceAnalysisPanelProps> = ({
  onBack,
  onClose,
  onRouteChange,
  mapSelection = null,
  shellStyle,
  headerDragProps,
}) => {
  const [agencies, setAgencies] = useState<SqlMapPoint[]>([]);
  const [agenciesLoading, setAgenciesLoading] = useState(true);
  const [originKind, setOriginKind] = useState<EndpointKind | null>(null);
  const [destinationKind, setDestinationKind] = useState<EndpointKind | null>(null);
  const [origin, setOrigin] = useState<DistanceEndpoint | null>(null);
  const [destination, setDestination] = useState<DistanceEndpoint | null>(null);
  const [mode, setMode] = useState<TravelMode>('driving');
  const [modePopupOpen, setModePopupOpen] = useState(false);
  const [result, setResult] = useState<DistanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const endpointStateRef = useRef({ origin, destination });
  const nextMapReplacementRef = useRef<'origin' | 'destination'>('origin');
  endpointStateRef.current = { origin, destination };

  useEffect(() => {
    let active = true;
    setAgenciesLoading(true);
    void fetchAgencyPoints()
      .then((points) => {
        if (active) setAgencies(points.filter((point) => point.kind === 'agencia'));
      })
      .catch(() => {
        if (active) setAgencies([]);
      })
      .finally(() => {
        if (active) setAgenciesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => onRouteChange(null), [onRouteChange]);

  useEffect(() => {
    if (!mapSelection) return;

    requestIdRef.current += 1;
    setResult(null);
    setLoading(false);
    setError(null);
    setModePopupOpen(false);
    onRouteChange(null);

    const endpoint: DistanceEndpoint = mapSelection.point;
    const current = endpointStateRef.current;

    if (!current.origin) {
      setOriginKind(endpoint.kind);
      setOrigin(endpoint);
      nextMapReplacementRef.current = 'destination';
      return;
    }

    if (!current.destination) {
      setDestinationKind(endpoint.kind);
      setDestination(endpoint);
      nextMapReplacementRef.current = 'origin';
      return;
    }

    if (nextMapReplacementRef.current === 'origin') {
      setOriginKind(endpoint.kind);
      setOrigin(endpoint);
      nextMapReplacementRef.current = 'destination';
      return;
    }

    setDestinationKind(endpoint.kind);
    setDestination(endpoint);
    nextMapReplacementRef.current = 'origin';
  }, [mapSelection, onRouteChange]);

  const invalidateResult = () => {
    requestIdRef.current += 1;
    setResult(null);
    setLoading(false);
    setError(null);
    onRouteChange(null);
  };

  const closeModePopup = () => {
    requestIdRef.current += 1;
    setLoading(false);
    setModePopupOpen(false);
  };

  const updateOrigin = (endpoint: DistanceEndpoint | null) => {
    invalidateResult();
    setOrigin(endpoint);
  };

  const updateDestination = (endpoint: DistanceEndpoint | null) => {
    invalidateResult();
    setDestination(endpoint);
  };

  const changeOriginKind = (kind: EndpointKind) => {
    if (kind === originKind) return;
    invalidateResult();
    setOriginKind(kind);
    setOrigin(null);
  };

  const changeDestinationKind = (kind: EndpointKind) => {
    if (kind === destinationKind) return;
    invalidateResult();
    setDestinationKind(kind);
    setDestination(null);
  };

  const changeMode = (nextMode: TravelMode) => {
    if (nextMode === mode) return;
    invalidateResult();
    setMode(nextMode);
  };

  const swapEndpoints = () => {
    invalidateResult();
    setOrigin(destination);
    setDestination(origin);
    setOriginKind(destination?.kind ?? destinationKind);
    setDestinationKind(origin?.kind ?? originKind);
  };

  useEffect(() => {
    if (!modePopupOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      requestIdRef.current += 1;
      setLoading(false);
      setModePopupOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [modePopupOpen]);

  const canGenerate = Boolean(origin && destination) && !loading;

  const handleGenerate = async () => {
    if (!origin || !destination || loading) return;
    if (
      Math.abs(origin.lngLat[0] - destination.lngLat[0]) < 0.000001 &&
      Math.abs(origin.lngLat[1] - destination.lngLat[1]) < 0.000001
    ) {
      setError('O ponto de partida e o ponto de ida precisam ser diferentes.');
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setResult(null);
    setError(null);
    onRouteChange(null);

    const key = routeCacheKey(origin, destination, mode);
    const travelRoute = await fetchTravelRoute(key, [origin.lngLat, destination.lngLat], mode);
    if (requestIdRef.current !== requestId) return;

    if (!travelRoute) {
      setLoading(false);
      setError(
        mode === 'walking'
          ? 'Não encontramos um trajeto a pé entre esses pontos. Tente ajustar a origem ou o destino.'
          : 'Não encontramos um trajeto dirigindo entre esses pontos. Tente ajustar a origem ou o destino.'
      );
      return;
    }

    const generatedAt = new Date();
    const route: VisitRoute = {
      id: key,
      chaveSupervisao: 0,
      gerenteComercial: 'Análise de distância',
      nome: `${origin.label} → ${destination.label}`,
      data: 'Rota calculada agora',
      distanciaKm: Number((travelRoute.distanceMeters / 1_000).toFixed(1)),
      duracaoEstimada: formatDuration(travelRoute.durationSeconds),
      distanceMeters: Math.round(travelRoute.distanceMeters),
      durationBreakdown: {
        travelMinutes: Math.max(1, Math.round(travelRoute.durationSeconds / 60)),
        visitMinutes: 0,
        minutesPerVisit: 0,
        source: 'calculated',
      },
      routeGeometry: travelRoute.geometry,
      stops: [],
      origin: { nome: origin.label, lng: origin.lngLat[0], lat: origin.lngLat[1] },
      destination: {
        nome: destination.label,
        lng: destination.lngLat[0],
        lat: destination.lngLat[1],
      },
    };

    setResult({
      distanceMeters: travelRoute.distanceMeters,
      durationSeconds: travelRoute.durationSeconds,
      generatedAt,
    });
    setLoading(false);
    onRouteChange(route);
  };

  const routeLink = useMemo(
    () => origin && destination ? googleMapsUrl(origin, destination, mode) : null,
    [destination, mode, origin]
  );

  const header = mergeHeaderDrag(
    'flex shrink-0 items-center gap-2 border-b border-slate-200/80 px-3 py-2.5',
    headerDragProps
  );

  return (
    <>
    <section
      style={{ ...shellStyle, maxHeight: 'calc(100vh - 250px)' }}
      className="pointer-events-auto flex max-h-[calc(100vh-110px)] w-[430px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-md"
      aria-label="Análise de distância"
    >
      <header
        className={header.className}
        style={header.dragStyle}
        {...header.dragHandlers}
        title="Arraste para mover o painel"
      >
        <button
          type="button"
          data-panel-drag-ignore
          onClick={onBack}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Voltar para o painel Navegar"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Route className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xs font-bold uppercase tracking-wide text-slate-900">
            Análise de Distância
          </h2>
          <p className="truncate text-[9px] text-slate-500">Compare o trajeto antes de sair</p>
        </div>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar análise de distância"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/65">
        <div className="space-y-3 p-3.5">
          <div className="space-y-2">
            <EndpointField
              role="partida"
              kind={originKind}
              value={origin}
              agencies={agencies}
              agenciesLoading={agenciesLoading}
              onKindChange={changeOriginKind}
              onChange={updateOrigin}
            />

            <div className="flex items-center gap-2 py-0.5">
              <span className="h-px flex-1 bg-slate-200" aria-hidden />
              <button
                type="button"
                onClick={swapEndpoints}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-700 shadow-sm transition-all hover:scale-105 hover:border-blue-200 hover:bg-blue-50"
                aria-label="Inverter ponto de partida e ponto de ida"
                title="Inverter os pontos"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
              <span className="h-px flex-1 bg-slate-200" aria-hidden />
            </div>

            <EndpointField
              role="destino"
              kind={destinationKind}
              value={destination}
              agencies={agencies}
              agenciesLoading={agenciesLoading}
              onKindChange={changeDestinationKind}
              onChange={updateDestination}
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-[10px] leading-relaxed text-sky-800">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Segure <kbd className="rounded border border-sky-200 bg-white px-1 py-0.5 font-semibold">Shift</kbd> e clique em uma loja ou agÃªncia no mapa para preencher A e B.
            </p>
          </div>

          <button
            type="button"
            disabled={!origin || !destination}
            onClick={() => {
              setError(null);
              setModePopupOpen(true);
            }}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200/80 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-45 disabled:shadow-none"
          >
            Continuar
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>

    {modePopupOpen && origin && destination ? (
            <section
              style={{
                position: 'absolute',
                right: typeof window !== 'undefined' && window.innerWidth >= 1050 ? 84 : 16,
                top: 16,
                zIndex: 11,
                maxHeight: 'calc(100vh - 120px)',
              }}
              aria-labelledby="distance-mode-title"
              className="pointer-events-auto flex w-[430px] max-w-[calc(100vw-32px)] animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 fade-in slide-in-from-right-4 duration-300"
            >
              <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  {mode === 'driving' ? <CarFront className="h-4 w-4" /> : <Footprints className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="distance-mode-title" className="text-sm font-bold text-slate-900">Como você vai?</h2>
                  <p className="text-[10px] text-slate-500">Escolha o tipo de rota e gere sua jornada.</p>
                </div>
                <button
                  type="button"
                  onClick={closeModePopup}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fechar escolha do tipo de rota"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/65 p-4">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-[9px] font-bold text-white">A</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-700">{origin.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-right text-[10px] font-medium text-slate-700">{destination.label}</span>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">B</span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/[0.03]">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de deslocamento">
              {([
                { id: 'driving' as const, label: 'Dirigindo', detail: 'Pelas vias', icon: CarFront },
                { id: 'walking' as const, label: 'A pé', detail: 'Caminhando', icon: Footprints },
              ]).map((option) => {
                const Icon = option.icon;
                const selected = mode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => changeMode(option.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all',
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm ring-1 ring-blue-100'
                        : 'border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-slate-50'
                    )}
                  >
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', selected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold">{option.label}</span>
                      <span className="block text-[9px] opacity-70">{option.detail}</span>
                    </span>
                    {selected ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-relaxed text-rose-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {!result ? (
            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200/80 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-45 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculando o melhor caminho...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Gerar análise da jornada
                </>
              )}
            </button>
          ) : null}

          {result && origin && destination ? (
            <article className="animate-in overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-xl shadow-blue-900/10 fade-in slide-in-from-bottom-2 duration-300" aria-label="Resultado da análise de distância">
              <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 px-4 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-300/20">
                      <Check className="h-3 w-3" /> Rota calculada
                    </span>
                    <h3 className="mt-2 text-base font-semibold">Sua jornada está pronta</h3>
                    <p className="mt-1 text-[10px] text-blue-100">
                      {mode === 'driving' ? 'Trajeto viário dirigindo' : 'Trajeto otimizado para caminhada'} · partida agora às {formatClock(result.generatedAt)}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    {mode === 'driving' ? <CarFront className="h-5 w-5" /> : <Footprints className="h-5 w-5" />}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/10 px-2.5 py-2 ring-1 ring-white/10">
                    <Route className="h-3.5 w-3.5 text-sky-300" />
                    <p className="mt-1.5 text-sm font-bold">{formatDistance(result.distanceMeters)}</p>
                    <p className="text-[8px] uppercase tracking-wide text-blue-200">Distância</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-2.5 py-2 ring-1 ring-white/10">
                    <Clock3 className="h-3.5 w-3.5 text-sky-300" />
                    <p className="mt-1.5 text-sm font-bold">{formatDuration(result.durationSeconds)}</p>
                    <p className="text-[8px] uppercase tracking-wide text-blue-200">Duração</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-2.5 py-2 ring-1 ring-white/10">
                    <Navigation className="h-3.5 w-3.5 text-emerald-300" />
                    <p className="mt-1.5 whitespace-nowrap text-[13px] font-bold">{formatArrival(result.generatedAt, result.durationSeconds)}</p>
                    <p className="text-[8px] uppercase tracking-wide text-blue-200">Chegada estim.</p>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3">
                  <div className="flex flex-col items-center" aria-hidden>
                    <span className="mt-1 h-3 w-3 rounded-full border-[3px] border-blue-700 bg-white shadow-sm" />
                    <span className="my-1 min-h-10 w-0.5 flex-1 bg-gradient-to-b from-blue-500 to-emerald-400" />
                    <span className="mb-1 h-3 w-3 rounded-full bg-emerald-500 shadow-sm ring-4 ring-emerald-50" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-blue-600">Partida</p>
                      <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-snug text-slate-800">{origin.label}</p>
                      <p className="mt-0.5 truncate text-[9px] text-slate-500">{ENDPOINT_KIND_LABEL[origin.kind]} · {origin.description}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-emerald-600">Ponto de ida</p>
                      <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-snug text-slate-800">{destination.label}</p>
                      <p className="mt-0.5 truncate text-[9px] text-slate-500">{ENDPOINT_KIND_LABEL[destination.kind]} · {destination.description}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                  <p className="text-[10px] leading-relaxed text-slate-600">
                    A rota está destacada no mapa. A duração é uma estimativa e pode variar conforme as condições do percurso.
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  {routeLink ? (
                    <a
                      href={routeLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Iniciar no Maps
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={invalidateResult}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    title="Manter os pontos e gerar novamente"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refazer
                  </button>
                </div>
              </div>
            </article>
          ) : null}
              </div>
            </section>
      ) : null}
    </>
  );
};

export default DistanceAnalysisPanel;
