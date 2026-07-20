import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Eye,
  History,
  Loader2,
  Minus,
  Route as RouteIcon,
  Trash2,
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
  fetchRouteHistory,
  fetchRouteOwners,
  fetchRouteSummary,
  fetchSavedRoute,
  type VisitRouteSummary,
  type VisitRouteSupervisionSummary,
} from '@/lib/visitRoutesApi';
import { useAuth } from '@/context/AuthContext';
import HierarchyBreadcrumb, { type BreadcrumbStep } from './HierarchyBreadcrumb';
import HierarchyLevelCards, { type LevelCardOption } from './HierarchyLevelCards';
import RegionOverviewCards from './RegionOverviewCards';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';
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
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`));
}

function savedAtLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${rest}min`;
}

const VisitasRoteirosPanel: React.FC<VisitasRoteirosPanelProps> = ({
  onBack,
  onClose,
  activeRoute,
  onRouteChange,
  shellStyle,
  headerDragProps,
}) => {
  const { user } = useAuth();
  const [gerencias, setGerencias] = useState<CommercialStructureItem[]>([]);
  const [coordenacoes, setCoordenacoes] = useState<CommercialStructureItem[]>([]);
  const [supervisoes, setSupervisoes] = useState<CommercialStructureItem[]>([]);
  const [owners, setOwners] = useState<VisitRouteOwner[]>([]);
  const [todaySummary, setTodaySummary] = useState<VisitRouteSupervisionSummary[]>([]);
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

  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().slice(0, 10);
    void Promise.allSettled([
      fetchGerenciasArea(),
      fetchCoordenacoes(),
      fetchSupervisoes(),
      fetchRouteOwners(),
      fetchRouteSummary(today, today),
    ]).then(([gg, gc3, gc, routeOwners, summary]) => {
      if (!active) return;
      if (gg.status === 'fulfilled') setGerencias(gg.value);
      if (gc3.status === 'fulfilled') setCoordenacoes(gc3.value);
      if (gc.status === 'fulfilled') setSupervisoes(gc.value);
      if (routeOwners.status === 'fulfilled') setOwners(routeOwners.value);
      if (summary.status === 'fulfilled') setTodaySummary(summary.value);
    });
    return () => { active = false; };
  }, []);

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

  const ownersBySupervision = useMemo(
    () => new Map(owners.map((owner) => [owner.chaveSupervisao, owner])),
    [owners]
  );
  const summaryBySupervision = useMemo(
    () => new Map(todaySummary.map((item) => [item.chaveSupervisao, item])),
    [todaySummary]
  );
  const supervisoesDaCoordenacao = (chave: number) => supervisoes.filter((item) => item.chaveCoordenacao === chave);
  const supervisoesDaGerencia = (chave: number) => {
    const coordinationKeys = new Set(coordenacoes.filter((item) => item.chaveGerenciaArea === chave).map((item) => item.chave));
    return supervisoes.filter((item) => item.chaveGerenciaArea === chave || (item.chaveCoordenacao && coordinationKeys.has(item.chaveCoordenacao)));
  };
  const supervisoesEscopo = useMemo(() => {
    if (coordenacaoSel) return supervisoesDaCoordenacao(coordenacaoSel.chave);
    if (gerenciaSel) return supervisoesDaGerencia(gerenciaSel.chave);
    return supervisoes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenacaoSel, coordenacoes, gerenciaSel, supervisoes]);

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, VisitRouteSummary[]>();
    for (const route of history) groups.set(route.plannedDate, [...(groups.get(route.plannedDate) ?? []), route]);
    return [...groups.entries()].map(([date, versions]) => ({
      date,
      versions: versions.sort((a, b) => b.version - a.version),
    }));
  }, [history]);

  const gerenciaCards: LevelCardOption[] = gerencias.map((item) => {
    const scope = supervisoesDaGerencia(item.chave);
    const routeCount = scope.reduce((total, supervision) => total + (summaryBySupervision.get(supervision.chave)?.routes ?? 0), 0);
    return {
      chave: item.chave,
      titulo: item.descricao,
      subtitulo: `${scope.length} gerentes comerciais`,
      destaque: `${routeCount} roteiro${routeCount === 1 ? '' : 's'} hoje`,
      destaqueAtivo: routeCount > 0,
    };
  });
  const coordenacaoCards: LevelCardOption[] = (gerenciaSel ? coordenacoes.filter((item) => item.chaveGerenciaArea === gerenciaSel.chave) : []).map((item) => {
    const scope = supervisoesDaCoordenacao(item.chave);
    const routeCount = scope.reduce((total, supervision) => total + (summaryBySupervision.get(supervision.chave)?.routes ?? 0), 0);
    return {
      chave: item.chave,
      titulo: item.descricao,
      subtitulo: `${scope.length} gerente${scope.length === 1 ? '' : 's'}`,
      destaque: `${routeCount} roteiro${routeCount === 1 ? '' : 's'} hoje`,
      destaqueAtivo: routeCount > 0,
    };
  });

  const breadcrumbSteps: BreadcrumbStep[] = ownerSel
    ? [{ label: user?.role === 'supervisor' ? 'Meus roteiros' : ownerSel.nome }]
    : [
        { label: 'Gerências', onClick: gerenciaSel ? () => { setGerenciaSel(null); setCoordenacaoSel(null); } : undefined },
        ...(gerenciaSel ? [{ label: gerenciaSel.descricao, onClick: coordenacaoSel ? () => setCoordenacaoSel(null) : undefined }] : []),
        ...(coordenacaoSel ? [{ label: coordenacaoSel.descricao }] : []),
      ];

  const openRoute = async (summary: VisitRouteSummary) => {
    setLoadingRouteId(summary.id);
    setHistoryError(null);
    try {
      onRouteChange(await fetchSavedRoute(summary.id));
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
      setRoutePendingDelete(null);
      const today = new Date().toISOString().slice(0, 10);
      void fetchRouteSummary(today, today).then(setTodaySummary).catch(() => undefined);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : 'Não foi possível excluir o roteiro.');
    } finally {
      setDeletingRouteId(null);
    }
  };

  const header = mergeHeaderDrag('flex shrink-0 items-center gap-1.5 border-b border-slate-200 px-3 py-3', headerDragProps);
  const minimizedBar = mergeHeaderDrag('pointer-events-auto flex w-[360px] items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-xl shadow-slate-900/10 backdrop-blur-md', headerDragProps);

  if (minimized) {
    return (
      <div style={{ ...shellStyle, ...minimizedBar.dragStyle }} className={minimizedBar.className} {...minimizedBar.dragHandlers}>
        <RouteIcon className="h-4 w-4 text-violet-600" />
        <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase">Visitas e Roteiros</p>
        <button type="button" onClick={() => setMinimized(false)} className="rounded-lg p-1.5 text-slate-500"><ChevronUp className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div style={shellStyle} className="pointer-events-auto flex max-h-full w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur-md">
      <header className={header.className} style={header.dragStyle} {...header.dragHandlers}>
        <button type="button" data-panel-drag-ignore onClick={ownerSel && user?.role !== 'supervisor' ? () => setOwnerSel(null) : onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></button>
        <h2 className="flex-1 truncate text-sm font-bold uppercase tracking-wide">Visitas e Roteiros</h2>
        <button type="button" data-panel-drag-ignore onClick={() => setMinimized(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Minus className="h-4 w-4" /></button>
        <button type="button" data-panel-drag-ignore onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <HierarchyBreadcrumb steps={breadcrumbSteps} />

        {ownerSel ? (
          <>
            <section className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2.5">
              <p className="text-xs font-bold text-violet-900">{user?.role === 'supervisor' ? 'Meus roteiros' : ownerSel.nome}</p>
              <p className="mt-0.5 text-[10px] text-violet-700">{ownerSel.descricaoSupervisao ?? `Supervisão ${ownerSel.chaveSupervisao}`}</p>
            </section>

            <section className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <label className="text-[9px] font-semibold uppercase text-slate-500">De<input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px] text-slate-700" /></label>
              <label className="text-[9px] font-semibold uppercase text-slate-500">Até<input type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px] text-slate-700" /></label>
            </section>

            {historyError && <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{historyError}</p>}
            {loadingHistory && history.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...</p>
            ) : groupedHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center"><History className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">Nenhum roteiro no período</p></div>
            ) : (
              <div className="space-y-2">
                {groupedHistory.map((group) => {
                  const expanded = expandedDates.includes(group.date);
                  const visibleVersions = expanded ? group.versions : group.versions.slice(0, 1);
                  return (
                    <section key={group.date} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                        <CalendarDays className="h-3.5 w-3.5 text-violet-600" />
                        <p className="flex-1 text-[11px] font-bold capitalize text-slate-800">{dateLabel(group.date)}</p>
                        {group.versions.length > 1 && <button type="button" onClick={() => setExpandedDates((current) => expanded ? current.filter((date) => date !== group.date) : [...current, group.date])} className="flex items-center gap-1 text-[9px] font-semibold text-violet-700">{group.versions.length} versões <ChevronDown className={cn('h-3 w-3 transition', expanded && 'rotate-180')} /></button>}
                      </div>
                      <div className="divide-y divide-slate-100">
                        {visibleVersions.map((route) => (
                          <div key={route.id} className={cn('px-3 py-2.5', activeRoute?.id === route.id && 'bg-blue-50/60')}>
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900">{route.nome}</p><p className="mt-1 text-[9px] text-slate-500">v{route.version} · salva em {savedAtLabel(route.savedAt)} por {route.createdBy.nome}</p></div>
                              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">v{route.version}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-[9px] font-semibold text-slate-600"><span>{route.stopCount} visitas</span><span>·</span><span>{Math.max(1, Math.round(route.distanceMeters / 1000))} km</span><span>·</span><span>{durationLabel(route.durationMinutes)}</span></div>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => void openRoute(route)}
                                disabled={loadingRouteId === route.id || deletingRouteId === route.id}
                                className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 py-1.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                              >
                                {loadingRouteId === route.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                Ver rota
                              </button>
                              <button
                                type="button"
                                onClick={() => setRoutePendingDelete(route)}
                                disabled={deletingRouteId === route.id || loadingRouteId === route.id}
                                className="flex items-center justify-center rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-red-600 hover:bg-red-100 disabled:opacity-50"
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
                {nextCursor && <button type="button" disabled={loadingHistory} onClick={() => void loadHistory(nextCursor, true)} className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{loadingHistory ? 'Carregando...' : 'Carregar mais'}</button>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Visão geral</p><RegionOverviewCards supervisoes={supervisoesEscopo} summaries={todaySummary} /></div>
            {!gerenciaSel && <HierarchyLevelCards options={gerenciaCards} onSelect={(key) => setGerenciaSel(gerencias.find((item) => item.chave === key) ?? null)} emptyMessage="Nenhuma Gerência disponível." />}
            {gerenciaSel && !coordenacaoSel && <HierarchyLevelCards options={coordenacaoCards} onSelect={(key) => setCoordenacaoSel(coordenacoes.find((item) => item.chave === key) ?? null)} emptyMessage="Nenhum Gerente Comercial III nesta gerência." />}
            {coordenacaoSel && (
              <div className="space-y-2">
                {supervisoesDaCoordenacao(coordenacaoSel.chave).map((item) => {
                  const owner = ownersBySupervision.get(item.chave);
                  const today = summaryBySupervision.get(item.chave);
                  return (
                    <button key={item.chave} type="button" disabled={!owner} onClick={() => owner && setOwnerSel(owner)} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
                      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900">{owner?.nome ?? item.descricao}</span><span className="block truncate text-[10px] text-slate-500">{item.descricao}</span></span>
                      <span className={cn('rounded-md border px-2 py-0.5 text-[9px] font-semibold', today ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500')}>{today ? `${today.visits} visitas hoje` : 'Ver histórico'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={routePendingDelete != null} onOpenChange={(open) => { if (!open && !deletingRouteId) setRoutePendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir roteiro salvo?</AlertDialogTitle>
            <AlertDialogDescription>
              {routePendingDelete
                ? `O roteiro "${routePendingDelete.nome}" (v${routePendingDelete.version}) será removido permanentemente do histórico e do banco de dados.`
                : 'O roteiro será removido permanentemente.'}
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
    </div>
  );
};

export default VisitasRoteirosPanel;
