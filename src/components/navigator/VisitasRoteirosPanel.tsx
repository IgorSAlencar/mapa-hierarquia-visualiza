import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Filter,
  History,
  Layers3,
  Loader2,
  MapPin,
  Minus,
  Route as RouteIcon,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchCoordenacoes,
  fetchGerenciasArea,
  fetchSupervisoes,
  type CommercialStructureItem,
} from '@/lib/commercialStructureApi';
import type { VisitRoute, VisitRouteOwner } from '@/data/visitRoutes';
import {
  defaultRouteHistoryRange,
  deleteSavedRoute,
  fetchDailyRouteMap,
  fetchHistoricalRouteMap,
  fetchRouteHistory,
  fetchRouteOwners,
  fetchRouteSummary,
  fetchSavedRoute,
  localIsoDate,
  type VisitRouteSummary,
  type VisitRouteSupervisionSummary,
  type VisitRouteHistoricalMapResponse,
} from '@/lib/visitRoutesApi';
import {
  buildDailyRouteMapItems,
  buildHistoricalRouteMapItems,
  type VisitRouteMapView,
} from '@/lib/visitRouteComparison';
import { useAuth } from '@/context/AuthContext';
import HierarchyBreadcrumb, { type BreadcrumbStep } from './HierarchyBreadcrumb';
import HierarchyLevelCards, { type LevelCardOption } from './HierarchyLevelCards';
import HistoricalPeriodDatePicker from './HistoricalPeriodDatePicker';
import RegionOverviewCards from './RegionOverviewCards';
import VisitRouteHistoricalAnalysis from './VisitRouteHistoricalAnalysis';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface VisitasRoteirosPanelProps {
  onBack: () => void;
  onClose: () => void;
  activeRoute: VisitRoute | null;
  onRouteChange: (route: VisitRoute | null) => void;
  routeMapView: VisitRouteMapView | null;
  onRouteMapViewChange: (view: VisitRouteMapView | null) => void;
  onExpandedChange?: (expanded: boolean) => void;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`));
}

function shortDateLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`));
}

function savedAtLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${rest}min`;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GC';
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''}`.toUpperCase();
}

function inclusiveDayCount(from: string, to: string): number {
  const fromTime = Date.parse(`${from}T12:00:00Z`);
  const toTime = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 0;
  return Math.floor((toTime - fromTime) / 86_400_000) + 1;
}

type TeamFilter = 'all' | 'with_route' | 'without_route';
type TeamSort = 'attention' | 'name' | 'visits';
type VisitsJourneyMode = 'daily' | 'historical';

const VisitasRoteirosPanel: React.FC<VisitasRoteirosPanelProps> = ({
  onBack,
  onClose,
  activeRoute,
  onRouteChange,
  routeMapView,
  onRouteMapViewChange,
  onExpandedChange,
}) => {
  const { user } = useAuth();
  const [gerencias, setGerencias] = useState<CommercialStructureItem[]>([]);
  const [coordenacoes, setCoordenacoes] = useState<CommercialStructureItem[]>([]);
  const [supervisoes, setSupervisoes] = useState<CommercialStructureItem[]>([]);
  const [owners, setOwners] = useState<VisitRouteOwner[]>([]);
  const [summaryDate, setSummaryDate] = useState(() => localIsoDate());
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);
  const [routeSummary, setRouteSummary] = useState<VisitRouteSupervisionSummary[] | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [gerenciaSel, setGerenciaSel] = useState<CommercialStructureItem | null>(null);
  const [coordenacaoSel, setCoordenacaoSel] = useState<CommercialStructureItem | null>(null);
  const [ownerSel, setOwnerSel] = useState<VisitRouteOwner | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [range, setRange] = useState(defaultRouteHistoryRange);
  const [history, setHistory] = useState<VisitRouteSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null);
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null);
  const [routePendingDelete, setRoutePendingDelete] = useState<VisitRouteSummary | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [teamQuery, setTeamQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [teamSort, setTeamSort] = useState<TeamSort>('attention');
  const [journeyMode, setJourneyMode] = useState<VisitsJourneyMode>('daily');
  const [selectedSupervisionKeys, setSelectedSupervisionKeys] = useState<number[]>([]);
  const [loadingDailyMap, setLoadingDailyMap] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [historicalAnalysis, setHistoricalAnalysis] = useState<VisitRouteHistoricalMapResponse | null>(null);
  const [loadingHistoricalAnalysis, setLoadingHistoricalAnalysis] = useState(false);
  const dailyRequestRef = useRef(0);
  const historicalRequestRef = useRef(0);
  const dailyAbortRef = useRef<AbortController | null>(null);
  const historicalAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onExpandedChange?.(!minimized);
  }, [minimized, onExpandedChange]);

  useEffect(() => {
    if (user?.role !== 'supervisor') return;
    setJourneyMode('historical');
  }, [user?.role]);

  useEffect(() => () => {
    dailyAbortRef.current?.abort();
    historicalAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      fetchGerenciasArea(),
      fetchCoordenacoes(),
      fetchSupervisoes(),
      fetchRouteOwners(),
    ]).then(([gg, gc3, gc, routeOwners]) => {
      if (!active) return;
      if (gg.status === 'fulfilled') setGerencias(gg.value);
      if (gc3.status === 'fulfilled') setCoordenacoes(gc3.value);
      if (gc.status === 'fulfilled') setSupervisoes(gc.value);
      if (routeOwners.status === 'fulfilled') setOwners(routeOwners.value);
    });
    return () => { active = false; };
  }, []);

  // O resumo hierárquico e o detalhe precisam consultar a mesma data civil.
  useEffect(() => {
    if (ownerSel) return;
    let active = true;
    setRouteSummary(null);
    setSummaryError(null);
    void fetchRouteSummary(summaryDate, summaryDate)
      .then((summary) => {
        if (active) setRouteSummary(summary);
      })
      .catch((reason) => {
        if (!active) return;
        setSummaryError(
          reason instanceof Error
            ? reason.message
            : 'Não foi possível carregar o resumo de visitas.'
        );
      });
    return () => { active = false; };
  }, [ownerSel, summaryDate, summaryReloadKey]);

  useEffect(() => {
    if (user?.role !== 'supervisor' || ownerSel || owners.length === 0) return;
    setOwnerSel(owners.find((owner) => owner.funcional === user.funcional) ?? owners[0]);
  }, [ownerSel, owners, user]);

  const loadHistory = async (cursor: string | null, append: boolean) => {
    if (!ownerSel) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const result = await fetchRouteHistory({
        from: range.from,
        to: range.to,
        chaveSupervisao: ownerSel.chaveSupervisao,
        cursor,
        limit: 50,
      });
      setHistory((current) => append ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : 'Não foi possível carregar o histórico.');
      if (!append) setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!ownerSel) {
      setHistory([]);
      return;
    }
    void loadHistory(null, false);
    // A função depende apenas do responsável e do período neste carregamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerSel, range.from, range.to]);

  useEffect(() => {
    historicalRequestRef.current += 1;
    historicalAbortRef.current?.abort();
    setHistoricalAnalysis(null);
    setMapLoadError(null);
    if (
      routeMapView?.mode === 'historical'
      && (
        routeMapView.from !== range.from
        || routeMapView.to !== range.to
        || routeMapView.owner.chaveSupervisao !== ownerSel?.chaveSupervisao
      )
    ) {
      onRouteMapViewChange(null);
    }
    // A visualização aplicada não invalida o próprio resultado; somente uma
    // mudança real de responsável/período cancela a análise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerSel?.chaveSupervisao, range.from, range.to]);

  useEffect(() => {
    dailyRequestRef.current += 1;
    dailyAbortRef.current?.abort();
    setLoadingDailyMap(false);
    if (routeMapView?.mode === 'daily' && routeMapView.date !== summaryDate) {
      onRouteMapViewChange(null);
    }
  }, [onRouteMapViewChange, routeMapView, summaryDate]);

  const ownersBySupervision = useMemo(
    () => new Map(owners.map((owner) => [owner.chaveSupervisao, owner])),
    [owners]
  );
  const summaryBySupervision = useMemo(
    () => new Map((routeSummary ?? []).map((item) => [item.chaveSupervisao, item])),
    [routeSummary]
  );
  const supervisoesDaCoordenacao = (chave: number) => supervisoes.filter((item) => item.chaveCoordenacao === chave);
  const supervisoesDaGerencia = (chave: number) => {
    const coordinationKeys = new Set(coordenacoes.filter((item) => item.chaveGerenciaArea === chave).map((item) => item.chave));
    return supervisoes.filter((item) => item.chaveGerenciaArea === chave || (item.chaveCoordenacao && coordinationKeys.has(item.chaveCoordenacao)));
  };
  const coordenacoesNoNivelAtual = user?.role === 'gerente_area'
    ? coordenacoes
    : gerenciaSel
      ? coordenacoes.filter((item) => item.chaveGerenciaArea === gerenciaSel.chave)
      : [];
  const coordenacaoEfetiva = user?.role === 'gerente_area' && coordenacoesNoNivelAtual.length === 1
    ? coordenacoesNoNivelAtual[0]
    : coordenacaoSel;
  const supervisoesNoNivelAtual = useMemo(() => {
    if (user?.role === 'coordenador') return supervisoes;
    if (!coordenacaoEfetiva) return [];
    return supervisoes.filter((item) => item.chaveCoordenacao === coordenacaoEfetiva.chave);
  }, [coordenacaoEfetiva, supervisoes, user?.role]);
  const supervisoesEscopo = useMemo(() => {
    if (user?.role === 'coordenador') return supervisoes;
    if (coordenacaoEfetiva) return supervisoesDaCoordenacao(coordenacaoEfetiva.chave);
    if (user?.role === 'gerente_area') return supervisoes;
    if (gerenciaSel) return supervisoesDaGerencia(gerenciaSel.chave);
    return supervisoes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenacaoEfetiva, coordenacoes, gerenciaSel, supervisoes, user?.role]);

  useEffect(() => {
    setTeamQuery('');
    setTeamFilter('all');
  }, [coordenacaoEfetiva?.chave, gerenciaSel?.chave]);

  const teamCounts = useMemo(() => {
    const withRoute = routeSummary == null
      ? 0
      : supervisoesNoNivelAtual.filter(
          (item) => (summaryBySupervision.get(item.chave)?.routes ?? 0) > 0
        ).length;
    return {
      all: supervisoesNoNivelAtual.length,
      withRoute,
      withoutRoute: routeSummary == null ? 0 : Math.max(0, supervisoesNoNivelAtual.length - withRoute),
    };
  }, [routeSummary, summaryBySupervision, supervisoesNoNivelAtual]);

  const visibleTeam = useMemo(() => {
    const normalizedQuery = normalizeSearch(teamQuery);
    return supervisoesNoNivelAtual
      .map((item) => {
        const owner = ownersBySupervision.get(item.chave);
        const summary = summaryBySupervision.get(item.chave);
        const hasRoute = (summary?.routes ?? 0) > 0;
        const ownerName = owner?.nome ?? item.descricao;
        return { item, owner, summary, hasRoute, ownerName };
      })
      .filter(({ item, ownerName, hasRoute }) => {
        const matchesQuery = !normalizedQuery
          || normalizeSearch(`${ownerName} ${item.descricao} ${item.chave}`).includes(normalizedQuery);
        const matchesFilter = teamFilter === 'all'
          || (teamFilter === 'with_route' && hasRoute)
          || (teamFilter === 'without_route' && !hasRoute);
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        if (teamSort === 'name') return a.ownerName.localeCompare(b.ownerName, 'pt-BR');
        if (teamSort === 'visits') {
          const visitDifference = (b.summary?.visits ?? 0) - (a.summary?.visits ?? 0);
          return visitDifference || a.ownerName.localeCompare(b.ownerName, 'pt-BR');
        }
        if (a.hasRoute !== b.hasRoute) return a.hasRoute ? 1 : -1;
        const visitDifference = (a.summary?.visits ?? 0) - (b.summary?.visits ?? 0);
        return visitDifference || a.ownerName.localeCompare(b.ownerName, 'pt-BR');
      });
  }, [
    ownersBySupervision,
    summaryBySupervision,
    supervisoesNoNivelAtual,
    teamFilter,
    teamQuery,
    teamSort,
  ]);

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, VisitRouteSummary[]>();
    for (const route of history) groups.set(route.plannedDate, [...(groups.get(route.plannedDate) ?? []), route]);
    return [...groups.entries()].map(([date, versions]) => ({
      date,
      versions: versions.sort((a, b) => b.version - a.version),
    }));
  }, [history]);

  const summaryPeriodLabel = summaryDate === localIsoDate()
    ? 'hoje'
    : `em ${shortDateLabel(summaryDate)}`;
  const summaryStatusLabel = summaryError ? 'Resumo indisponível' : 'Carregando resumo...';

  const gerenciaCards: LevelCardOption[] = gerencias.map((item) => {
    const scope = supervisoesDaGerencia(item.chave);
    const routeCount = scope.reduce((total, supervision) => total + (summaryBySupervision.get(supervision.chave)?.routes ?? 0), 0);
    return {
      chave: item.chave,
      titulo: item.descricao,
      subtitulo: `${scope.length} gerentes comerciais`,
      destaque: routeSummary == null
        ? summaryStatusLabel
        : `${routeCount} roteiro${routeCount === 1 ? '' : 's'} ${summaryPeriodLabel}`,
      destaqueAtivo: routeSummary != null && routeCount > 0,
    };
  });
  const coordenacaoCards: LevelCardOption[] = coordenacoesNoNivelAtual.map((item) => {
    const scope = supervisoesDaCoordenacao(item.chave);
    const routeCount = scope.reduce((total, supervision) => total + (summaryBySupervision.get(supervision.chave)?.routes ?? 0), 0);
    return {
      chave: item.chave,
      titulo: item.descricao,
      subtitulo: `${scope.length} gerente${scope.length === 1 ? '' : 's'}`,
      destaque: routeSummary == null
        ? summaryStatusLabel
        : `${routeCount} roteiro${routeCount === 1 ? '' : 's'} ${summaryPeriodLabel}`,
      destaqueAtivo: routeSummary != null && routeCount > 0,
    };
  });

  const toggleSupervisionSelection = (key: number) => {
    setMapLoadError(null);
    setSelectedSupervisionKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 15) {
        setMapLoadError('Você pode comparar até 15 gerentes comerciais por vez.');
        return current;
      }
      return [...current, key];
    });
  };

  const selectVisibleRoutes = () => {
    const available = visibleTeam
      .filter(({ owner, hasRoute }) => owner && hasRoute)
      .map(({ item }) => item.chave);
    setSelectedSupervisionKeys((current) => {
      const merged = [...current];
      for (const key of available) {
        if (merged.includes(key)) continue;
        if (merged.length === 15) break;
        merged.push(key);
      }
      if (available.some((key) => !merged.includes(key))) {
        setMapLoadError('Foram selecionados os primeiros 15 gerentes com roteiro.');
      } else {
        setMapLoadError(null);
      }
      return merged;
    });
  };

  const applyDailyRoutesToMap = async () => {
    if (selectedSupervisionKeys.length === 0) {
      setMapLoadError('Selecione ao menos um gerente com roteiro.');
      return;
    }
    const requestId = ++dailyRequestRef.current;
    dailyAbortRef.current?.abort();
    const controller = new AbortController();
    dailyAbortRef.current = controller;
    setLoadingDailyMap(true);
    setMapLoadError(null);
    try {
      const result = await fetchDailyRouteMap(
        summaryDate,
        selectedSupervisionKeys,
        controller.signal
      );
      if (requestId !== dailyRequestRef.current) return;
      onRouteMapViewChange({
        mode: 'daily',
        date: result.date,
        items: buildDailyRouteMapItems(result.routes, selectedSupervisionKeys),
        selectedSupervisionKeys: [...selectedSupervisionKeys],
        missingSupervisionKeys: result.missingSupervisionKeys,
      });
      if (result.routes.length === 0) {
        setMapLoadError('Nenhum dos gerentes selecionados possui roteiro ativo nessa data.');
      }
      if (window.matchMedia('(max-width: 767px)').matches) setMinimized(true);
    } catch (reason) {
      if (requestId !== dailyRequestRef.current) return;
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setMapLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar as rotas no mapa.');
    } finally {
      if (requestId === dailyRequestRef.current) setLoadingDailyMap(false);
    }
  };

  const applyHistoricalAnalysisToMap = async () => {
    if (!ownerSel) return;
    const days = inclusiveDayCount(range.from, range.to);
    if (days <= 0) {
      setMapLoadError('A data inicial deve ser anterior ou igual à data final.');
      return;
    }
    if (days > 90) {
      setMapLoadError('O intervalo histórico pode ter no máximo 90 dias.');
      return;
    }
    const requestId = ++historicalRequestRef.current;
    historicalAbortRef.current?.abort();
    const controller = new AbortController();
    historicalAbortRef.current = controller;
    setLoadingHistoricalAnalysis(true);
    setMapLoadError(null);
    try {
      const result = await fetchHistoricalRouteMap(
        range.from,
        range.to,
        ownerSel.chaveSupervisao,
        controller.signal
      );
      if (requestId !== historicalRequestRef.current) return;
      setHistoricalAnalysis(result);
      onRouteMapViewChange({
        mode: 'historical',
        from: result.from,
        to: result.to,
        owner: result.owner,
        items: buildHistoricalRouteMapItems(result.routes),
        metrics: result.metrics,
        weeklySeries: result.weeklySeries,
      });
      if (result.routes.length === 0) {
        setMapLoadError('Nenhum roteiro ativo foi encontrado no período selecionado.');
      }
      if (window.matchMedia('(max-width: 767px)').matches) setMinimized(true);
    } catch (reason) {
      if (requestId !== historicalRequestRef.current) return;
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setMapLoadError(reason instanceof Error ? reason.message : 'Não foi possível gerar a análise histórica.');
    } finally {
      if (requestId === historicalRequestRef.current) setLoadingHistoricalAnalysis(false);
    }
  };

  const selectOwnerForSummary = (owner: VisitRouteOwner) => {
    setJourneyMode('historical');
    setRange(defaultRouteHistoryRange());
    setExpandedDates([]);
    setOwnerSel(owner);
  };

  const returnToSummary = () => {
    setRouteSummary(null);
    setSummaryError(null);
    setOwnerSel(null);
  };

  let breadcrumbSteps: BreadcrumbStep[];
  if (ownerSel) {
    breadcrumbSteps = [{ label: user?.role === 'supervisor' ? 'Meus roteiros' : ownerSel.nome }];
  } else if (user?.role === 'coordenador') {
    breadcrumbSteps = [{
      label: coordenacoes.length === 1 ? coordenacoes[0].descricao : 'Meus gerentes comerciais',
    }];
  } else if (user?.role === 'gerente_area') {
    breadcrumbSteps = coordenacaoEfetiva && coordenacoesNoNivelAtual.length > 1
      ? [
          { label: 'Gerentes Comerciais III', onClick: () => setCoordenacaoSel(null) },
          { label: coordenacaoEfetiva.descricao },
        ]
      : [{ label: coordenacaoEfetiva?.descricao ?? 'Gerentes Comerciais III' }];
  } else {
    breadcrumbSteps = [
      { label: 'Gerências', onClick: gerenciaSel ? () => { setGerenciaSel(null); setCoordenacaoSel(null); } : undefined },
      ...(gerenciaSel ? [{ label: gerenciaSel.descricao, onClick: coordenacaoSel ? () => setCoordenacaoSel(null) : undefined }] : []),
      ...(coordenacaoSel ? [{ label: coordenacaoSel.descricao }] : []),
    ];
  }

  const openRoute = async (summary: VisitRouteSummary) => {
    setLoadingRouteId(summary.id);
    setHistoryError(null);
    try {
      onRouteChange(await fetchSavedRoute(summary.id));
      if (window.matchMedia('(max-width: 767px)').matches) setMinimized(true);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : 'Não foi possível abrir o roteiro.');
    } finally {
      setLoadingRouteId(null);
    }
  };

  const confirmDeleteRoute = async () => {
    if (!routePendingDelete) return;
    const target = routePendingDelete;
    setDeletingRouteId(target.id);
    setHistoryError(null);
    try {
      await deleteSavedRoute(target.id);
      setHistory((current) => current.filter((route) => route.id !== target.id));
      if (activeRoute?.id === target.id) onRouteChange(null);
      if (routeMapView?.items.some(({ route }) => route.id === target.id)) {
        const remaining = routeMapView.items.filter(({ route }) => route.id !== target.id);
        onRouteMapViewChange(remaining.length > 0 ? { ...routeMapView, items: remaining } : null);
      }
      setSummaryReloadKey((key) => key + 1);
      setRoutePendingDelete(null);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : 'Não foi possível excluir o roteiro.');
    } finally {
      setDeletingRouteId(null);
    }
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        data-visits-sidebar-rail
        data-tutorial="visits-panel"
        className="pointer-events-auto absolute left-0 top-1/2 z-30 flex w-14 -translate-y-1/2 flex-col items-center gap-2 rounded-r-2xl border border-l-0 border-slate-200 bg-white px-2 py-3 text-slate-700 shadow-xl shadow-slate-900/10 transition-colors hover:bg-blue-50"
        aria-label="Reabrir gestão de visitas e roteiros"
        title="Reabrir visitas e roteiros"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-200">
          <RouteIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="rotate-180 text-[10px] font-bold uppercase tracking-[0.12em] [writing-mode:vertical-rl]">
          Visitas
        </span>
        <ChevronRight className="h-4 w-4 text-blue-600" aria-hidden />
      </button>
    );
  }

  return (
    <aside
      data-visits-sidebar
      data-tutorial="visits-panel"
      className="pointer-events-auto absolute inset-y-0 left-0 z-30 flex w-[min(94vw,410px)] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
      role="dialog"
      aria-labelledby="visitas-roteiros-title"
    >
      <header className="shrink-0 border-b border-blue-100 bg-gradient-to-br from-white via-blue-50 to-sky-50 px-4 pb-4 pt-3.5 text-slate-950">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={ownerSel && user?.role !== 'supervisor' ? returnToSummary : onBack}
            className="mt-0.5 rounded-lg p-2 text-slate-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
            aria-label={ownerSel && user?.role !== 'supervisor' ? 'Voltar para a equipe' : 'Voltar para o menu Navegar'}
            title="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-200">
            <RouteIcon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="visitas-roteiros-title" className="truncate text-base font-bold">
              Visitas e roteiros
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {ownerSel ? 'Histórico e rotas do responsável' : 'Cobertura diária da estrutura comercial'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
              aria-label="Minimizar gestão de visitas"
              title="Minimizar"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
              aria-label="Fechar gestão de visitas"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <HierarchyBreadcrumb steps={breadcrumbSteps} />
      </div>

      {user?.role !== 'supervisor' && (
        <nav data-tutorial="visits-filters" className="grid shrink-0 grid-cols-2 gap-1 border-b border-slate-200 bg-white px-3 py-2" aria-label="Modo de gestão de rotas">
          <button
            type="button"
            onClick={() => {
              setJourneyMode('daily');
              setOwnerSel(null);
              setMapLoadError(null);
              onRouteMapViewChange(null);
            }}
            aria-pressed={journeyMode === 'daily' && !ownerSel}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold transition-colors',
              journeyMode === 'daily' && !ownerSel
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            <Layers3 className="h-3.5 w-3.5" />
            Operação do dia
          </button>
          <button
            type="button"
            onClick={() => {
              setJourneyMode('historical');
              setOwnerSel(null);
              setMapLoadError(null);
              onRouteMapViewChange(null);
            }}
            aria-pressed={journeyMode === 'historical'}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold transition-colors',
              journeyMode === 'historical'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Análise histórica
          </button>
        </nav>
      )}

      <div data-tutorial="visits-list" className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50">
        {ownerSel ? (
          <div>
            <section className="border-b border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-sm font-bold text-blue-700">
                  {initials(ownerSel.nome)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {user?.role === 'supervisor' ? 'Minha agenda' : 'Responsável selecionado'}
                  </p>
                  <h3 className="mt-0.5 truncate text-sm font-bold text-slate-950">{ownerSel.nome}</h3>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {ownerSel.descricaoSupervisao ?? `Supervisão ${ownerSel.chaveSupervisao}`}
                  </p>
                </div>
              </div>
            </section>

            <section data-tutorial="visits-filters" className="border-b border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Período do histórico</p>
                  <p className="mt-0.5 text-xs text-slate-600">Consulte roteiros salvos por data.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const today = localIsoDate();
                    setRange({ from: today, to: today });
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-50"
                >
                  Hoje
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <HistoricalPeriodDatePicker
                  label="De"
                  value={range.from}
                  onChange={(value) => setRange((current) => ({ ...current, from: value }))}
                />
                <HistoricalPeriodDatePicker
                  label="Até"
                  value={range.to}
                  onChange={(value) => setRange((current) => ({ ...current, to: value }))}
                  align="end"
                  futureHint
                />
              </div>
              <button
                type="button"
                onClick={() => void applyHistoricalAnalysisToMap()}
                disabled={loadingHistoricalAnalysis}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {loadingHistoricalAnalysis
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CalendarRange className="h-4 w-4" />}
                {loadingHistoricalAnalysis ? 'Gerando análise...' : 'Analisar período no mapa'}
              </button>
              <p className="mt-2 text-center text-[10px] text-slate-500">
                Até 90 dias · inclui roteiros futuros já planejados
              </p>
              {mapLoadError && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {mapLoadError}
                </p>
              )}
            </section>

            {historicalAnalysis && (
              <section className="border-b border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">
                    Planejamento e execução
                  </p>
                  <h3 className="mt-0.5 text-sm font-bold text-slate-950">Tendência do período</h3>
                </div>
                <VisitRouteHistoricalAnalysis
                  metrics={historicalAnalysis.metrics}
                  weeklySeries={historicalAnalysis.weeklySeries}
                />
              </section>
            )}

            <section className="px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">Histórico</p>
                  <h3 className="mt-0.5 text-sm font-bold text-slate-950">Roteiros salvos</h3>
                </div>
                {!loadingHistory && (
                  <span className="text-[11px] font-medium text-slate-500">
                    {history.length} registro{history.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {historyError && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {historyError}
                </p>
              )}

              {loadingHistory && history.length === 0 ? (
                <p className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
                </p>
              ) : groupedHistory.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                  <History className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">Nenhum roteiro no período</p>
                  <p className="mt-1 text-xs text-slate-500">Altere as datas para consultar outros dias.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                {groupedHistory.map((group) => {
                  const expanded = expandedDates.includes(group.date);
                  const visibleVersions = expanded ? group.versions : group.versions.slice(0, 1);
                  return (
                    <section key={group.date} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5">
                        <CalendarDays className="h-4 w-4 text-blue-600" />
                        <p className="flex-1 text-xs font-bold capitalize text-slate-800">{dateLabel(group.date)}</p>
                        {group.versions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setExpandedDates((current) => expanded ? current.filter((date) => date !== group.date) : [...current, group.date])}
                            className="flex items-center gap-1 text-[11px] font-semibold text-blue-700"
                          >
                            {group.versions.length} versões
                            <ChevronDown className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-180')} />
                          </button>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100">
                        {visibleVersions.map((route) => (
                          <div key={route.id} className={cn('px-3.5 py-3.5', activeRoute?.id === route.id && 'bg-blue-50/70')}>
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-bold text-slate-900">{route.nome}</p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  Salvo em {savedAtLabel(route.savedAt)} por {route.createdBy.nome}
                                </p>
                              </div>
                              {activeRoute?.id === route.id && (
                                <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                                  No mapa
                                </span>
                              )}
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-600">
                              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{route.stopCount} visitas planejadas</span>
                              <span aria-hidden>·</span>
                              <span>{Math.max(1, Math.round(route.distanceMeters / 1000))} km</span>
                              <span aria-hidden>·</span>
                              <span>{durationLabel(route.durationMinutes)}</span>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => void openRoute(route)}
                                disabled={loadingRouteId === route.id || deletingRouteId === route.id}
                                className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                              >
                                {loadingRouteId === route.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                                Ver no mapa
                              </button>
                              <button
                                type="button"
                                onClick={() => setRoutePendingDelete(route)}
                                disabled={deletingRouteId === route.id || loadingRouteId === route.id}
                                className="flex h-9 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                aria-label={`Excluir roteiro ${route.nome}`}
                                title="Excluir roteiro"
                              >
                                {deletingRouteId === route.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
                  {nextCursor && (
                    <button
                      type="button"
                      disabled={loadingHistory}
                      onClick={() => void loadHistory(nextCursor, true)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      {loadingHistory ? 'Carregando...' : 'Carregar mais'}
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div>
            <section className="border-b border-slate-200 bg-white px-4 py-3.5">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <HistoricalPeriodDatePicker
                    label="Data da gestão"
                    value={summaryDate}
                    onChange={(value) => {
                      setRouteSummary(null);
                      setSummaryError(null);
                      setSummaryDate(value);
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const today = localIsoDate();
                    if (summaryDate !== today) {
                      setRouteSummary(null);
                      setSummaryError(null);
                      setSummaryDate(today);
                    }
                  }}
                  disabled={summaryDate === localIsoDate()}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-50 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400"
                >
                  Hoje
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {journeyMode === 'daily'
                  ? 'Selecione os gerentes com roteiro para comparar no mapa.'
                  : 'Esta referência ajuda a escolher o gerente; o período histórico vem na próxima etapa.'}
              </p>
            </section>

            {journeyMode === 'historical' && (
              <section className="border-b border-blue-100 bg-blue-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-blue-950">Escolha um gerente para analisar</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-blue-700">
                      Você verá frequência, quilômetros e execução das visitas em até 90 dias.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <div className="space-y-5 px-4 py-4">
              <section data-tutorial="visits-summary">
                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">Visão geral</p>
                    <h3 className="mt-0.5 text-sm font-bold text-slate-950">Situação da equipe</h3>
                  </div>
                  <span className="text-[11px] font-medium capitalize text-slate-500">{summaryPeriodLabel}</span>
                </div>
                {summaryError ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs text-red-700">
                    <p className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>{summaryError}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRouteSummary(null);
                        setSummaryError(null);
                        setSummaryReloadKey((key) => key + 1);
                      }}
                      className="mt-2 ml-6 font-bold text-red-800 underline underline-offset-2"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : routeSummary == null ? (
                  <div className="flex min-h-40 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-xs font-medium text-blue-700">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" />
                    Carregando resumo...
                  </div>
                ) : (
                  <RegionOverviewCards
                    supervisoes={supervisoesEscopo}
                    summaries={routeSummary}
                    periodLabel={summaryPeriodLabel}
                  />
                )}
              </section>

              {user?.role === 'admin' && !gerenciaSel && (
                <section>
                  <div className="mb-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">Estrutura comercial</p>
                    <h3 className="mt-0.5 text-sm font-bold text-slate-950">Selecione uma gerência</h3>
                    <p className="mt-1 text-xs text-slate-500">Avance pela hierarquia para chegar à equipe.</p>
                  </div>
                  <HierarchyLevelCards
                    options={gerenciaCards}
                    onSelect={(key) => {
                      setGerenciaSel(gerencias.find((item) => item.chave === key) ?? null);
                      setCoordenacaoSel(null);
                    }}
                    emptyMessage="Nenhuma Gerência disponível."
                  />
                </section>
              )}

              {((user?.role === 'admin' && gerenciaSel && !coordenacaoEfetiva) || (user?.role === 'gerente_area' && !coordenacaoEfetiva)) && (
                <section>
                  <div className="mb-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">Estrutura comercial</p>
                    <h3 className="mt-0.5 text-sm font-bold text-slate-950">Selecione um Gerente Comercial III</h3>
                    <p className="mt-1 text-xs text-slate-500">Veja a cobertura dos gerentes sob essa coordenação.</p>
                  </div>
                  <HierarchyLevelCards
                    options={coordenacaoCards}
                    onSelect={(key) => setCoordenacaoSel(coordenacoes.find((item) => item.chave === key) ?? null)}
                    emptyMessage="Nenhum Gerente Comercial III disponível."
                  />
                </section>
              )}

              {(user?.role === 'coordenador' || coordenacaoEfetiva) && (
                <section className="-mx-4">
                  <div className="sticky top-0 z-10 border-y border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">Gestão da equipe</p>
                        <h3 className="mt-0.5 text-sm font-bold text-slate-950">
                          {journeyMode === 'daily' ? 'Selecione as rotas' : 'Selecione um gerente'}
                        </h3>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500">
                        {visibleTeam.length} de {teamCounts.all}
                      </span>
                    </div>

                    {journeyMode === 'daily' && (
                      <div className="mt-2.5 flex items-center justify-between rounded-lg bg-blue-50 px-2.5 py-2">
                        <span className="text-[10px] font-bold text-blue-900">
                          {selectedSupervisionKeys.length}/15 selecionados
                        </span>
                        <button
                          type="button"
                          onClick={selectVisibleRoutes}
                          className="text-[10px] font-bold text-blue-700 hover:underline"
                        >
                          Selecionar visíveis com roteiro
                        </button>
                      </div>
                    )}

                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={teamQuery}
                        onChange={(event) => setTeamQuery(event.target.value)}
                        placeholder="Buscar por gerente ou equipe..."
                        data-team-search
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      <Filter className="mr-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      {([
                        ['all', `Todos ${teamCounts.all}`],
                        ['with_route', `Com roteiro ${routeSummary == null ? '…' : teamCounts.withRoute}`],
                        ['without_route', `Sem roteiro ${routeSummary == null ? '…' : teamCounts.withoutRoute}`],
                      ] as Array<[TeamFilter, string]>).map(([filter, label]) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setTeamFilter(filter)}
                          aria-pressed={teamFilter === filter}
                          data-team-filter={filter}
                          className={cn(
                            'shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold transition-colors',
                            teamFilter === filter
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <label className="mt-2.5 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Ordenar por
                      <select
                        value={teamSort}
                        onChange={(event) => setTeamSort(event.target.value as TeamSort)}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-blue-400"
                      >
                        <option value="attention">Requer atenção</option>
                        <option value="name">Nome</option>
                        <option value="visits">Mais visitas planejadas</option>
                      </select>
                    </label>
                  </div>

                  <div className="divide-y divide-slate-100 border-b border-slate-200 bg-white">
                    {visibleTeam.map(({ item, owner, summary, hasRoute, ownerName }) => {
                      const summaryAvailable = routeSummary != null;
                      const selected = selectedSupervisionKeys.includes(item.chave);
                      const canSelectDaily = Boolean(owner && hasRoute);
                      return (
                        <div
                          key={item.chave}
                          data-team-row
                          className={cn(
                            'group flex min-h-[76px] w-full items-center gap-2 px-3 py-2.5 text-left transition-colors',
                            selected ? 'bg-blue-50/80' : 'hover:bg-slate-50',
                            !owner && 'opacity-60'
                          )}
                        >
                          <button
                            type="button"
                            disabled={journeyMode === 'daily' ? !canSelectDaily : !owner}
                            onClick={() => {
                              if (journeyMode === 'daily') {
                                toggleSupervisionSelection(item.chave);
                              } else if (owner) {
                                selectOwnerForSummary(owner);
                              }
                            }}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left disabled:cursor-default"
                            aria-pressed={journeyMode === 'daily' ? selected : undefined}
                            aria-label={journeyMode === 'daily'
                              ? `${selected ? 'Remover' : 'Selecionar'} rota de ${ownerName}`
                              : `Analisar histórico de ${ownerName}`}
                          >
                            {journeyMode === 'daily' && (
                              <span className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                                selected
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-300 bg-white text-transparent',
                                !canSelectDaily && 'bg-slate-100 opacity-50'
                              )}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <span className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
                              hasRoute ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            )}>
                              {initials(ownerName)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-slate-950">{ownerName}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                                {owner ? item.descricao : 'Responsável não vinculado'}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              {hasRoute ? (
                                <>
                                  <span className="flex items-center justify-end gap-1 text-[11px] font-bold text-emerald-700">
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                    Com roteiro
                                  </span>
                                  <span className="mt-1 block text-[10px] text-slate-500">
                                    {summary?.visits ?? 0} planejada{(summary?.visits ?? 0) === 1 ? '' : 's'}
                                  </span>
                                </>
                              ) : summaryAvailable ? (
                                <span className="flex items-center justify-end gap-1 text-[11px] font-bold text-amber-700">
                                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                                  Sem roteiro
                                </span>
                              ) : summaryError ? (
                                <span className="text-[10px] font-semibold text-red-600">Indisponível</span>
                              ) : (
                                <span className="flex items-center justify-end gap-1 text-[10px] font-semibold text-slate-500">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Carregando
                                </span>
                              )}
                            </span>
                          </button>
                          {owner && journeyMode === 'daily' && (
                            <button
                              type="button"
                              onClick={() => selectOwnerForSummary(owner)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
                              aria-label={`Analisar histórico de ${ownerName}`}
                              title="Analisar histórico"
                            >
                              <BarChart3 className="h-4 w-4" />
                            </button>
                          )}
                          {owner && journeyMode === 'historical' && (
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-blue-600" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {journeyMode === 'daily' && selectedSupervisionKeys.length > 0 && (
                    <div className="sticky bottom-0 z-20 border-t border-blue-100 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
                      {mapLoadError && (
                        <p className="mb-2 flex items-start gap-1.5 text-[11px] font-medium text-red-700">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {mapLoadError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSupervisionKeys([]);
                            setMapLoadError(null);
                          }}
                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          onClick={() => void applyDailyRoutesToMap()}
                          disabled={loadingDailyMap}
                          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:opacity-50"
                        >
                          {loadingDailyMap
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Layers3 className="h-4 w-4" />}
                          {loadingDailyMap
                            ? 'Carregando rotas...'
                            : `Aplicar ${selectedSupervisionKeys.length} no mapa`}
                        </button>
                      </div>
                    </div>
                  )}

                  {visibleTeam.length === 0 && (
                    <div className="border-b border-slate-200 bg-white px-6 py-10 text-center">
                      <Users className="mx-auto h-7 w-7 text-slate-300" />
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {teamCounts.all === 0 ? 'Nenhum gerente comercial disponível' : 'Nenhum gerente encontrado'}
                      </p>
                      {teamCounts.all > 0 && (
                        <>
                          <p className="mt-1 text-xs text-slate-500">Ajuste a busca ou o filtro selecionado.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setTeamQuery('');
                              setTeamFilter('all');
                            }}
                            className="mt-3 text-xs font-bold text-blue-700 hover:underline"
                          >
                            Limpar filtros
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}

              {user?.role === 'supervisor' && (
                <p className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando seus roteiros...
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={routePendingDelete != null} onOpenChange={(open) => { if (!open && !deletingRouteId) setRoutePendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir roteiro salvo?</AlertDialogTitle>
            <AlertDialogDescription>
              {routePendingDelete
                ? `O roteiro "${routePendingDelete.nome}" será removido do painel e não poderá ser utilizado novamente.`
                : 'O roteiro será removido do painel e não poderá ser utilizado novamente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingRouteId)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingRouteId)}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteRoute();
              }}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {deletingRouteId ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
};

export default VisitasRoteirosPanel;
