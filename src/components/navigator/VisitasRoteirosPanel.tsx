import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronUp, Minus, Route as RouteIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchCoordenacoes,
  fetchGerenciasArea,
  fetchSupervisoes,
  type CommercialStructureItem,
} from '@/lib/commercialStructureApi';
import {
  FALLBACK_COORDENACOES,
  FALLBACK_GERENCIAS,
  FALLBACK_SUPERVISOES,
  getRouteForSupervisao,
  type VisitRoute,
} from '@/data/visitRoutesMock';
import HierarchyBreadcrumb, { type BreadcrumbStep } from './HierarchyBreadcrumb';
import HierarchyLevelCards, { type LevelCardOption } from './HierarchyLevelCards';
import RegionOverviewCards from './RegionOverviewCards';
import type { CSSProperties } from 'react';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';

interface VisitasRoteirosPanelProps {
  onBack: () => void;
  onClose: () => void;
  activeRoute: VisitRoute | null;
  onRouteChange: (route: VisitRoute | null) => void;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

const VisitasRoteirosPanel: React.FC<VisitasRoteirosPanelProps> = ({
  onBack,
  onClose,
  activeRoute,
  onRouteChange,
  shellStyle,
  headerDragProps,
}) => {
  const [gerencias, setGerencias] = useState<CommercialStructureItem[]>(FALLBACK_GERENCIAS);
  const [coordenacoes, setCoordenacoes] = useState<CommercialStructureItem[]>(FALLBACK_COORDENACOES);
  const [supervisoes, setSupervisoes] = useState<CommercialStructureItem[]>(FALLBACK_SUPERVISOES);
  const [gerenciaSel, setGerenciaSel] = useState<CommercialStructureItem | null>(null);
  const [coordenacaoSel, setCoordenacaoSel] = useState<CommercialStructureItem | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([fetchGerenciasArea(), fetchCoordenacoes(), fetchSupervisoes()]).then(
      ([gg, gc3, gc]) => {
        if (!active) return;
        if (gg.status === 'fulfilled' && gg.value.length > 0) setGerencias(gg.value);
        if (gc3.status === 'fulfilled' && gc3.value.length > 0) setCoordenacoes(gc3.value);
        if (gc.status === 'fulfilled' && gc.value.length > 0) setSupervisoes(gc.value);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const supervisoesDaCoordenacao = (chaveCoord: number) =>
    supervisoes.filter((s) => s.chaveCoordenacao === chaveCoord);

  const supervisoesDaGerencia = (chaveGg: number) => {
    const coordsDaGerencia = new Set(
      coordenacoes.filter((c) => c.chaveGerenciaArea === chaveGg).map((c) => c.chave)
    );
    return supervisoes.filter(
      (s) =>
        s.chaveGerenciaArea === chaveGg ||
        (s.chaveCoordenacao != null && coordsDaGerencia.has(s.chaveCoordenacao))
    );
  };

  /** Supervisões do escopo atual — alimenta os números da visão geral. */
  const supervisoesEscopo = useMemo(() => {
    if (coordenacaoSel) return supervisoesDaCoordenacao(coordenacaoSel.chave);
    if (gerenciaSel) return supervisoesDaGerencia(gerenciaSel.chave);
    return supervisoes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supervisoes, coordenacoes, gerenciaSel, coordenacaoSel]);

  const contarRoteiros = (itens: CommercialStructureItem[]) =>
    itens.filter((s) => getRouteForSupervisao(s.chave)).length;

  const nivel: 'gerencia' | 'coordenacao' | 'gerente' = coordenacaoSel
    ? 'gerente'
    : gerenciaSel
      ? 'coordenacao'
      : 'gerencia';

  const breadcrumbSteps: BreadcrumbStep[] = [
    {
      label: 'Gerências',
      onClick:
        nivel === 'gerencia'
          ? undefined
          : () => {
              setGerenciaSel(null);
              setCoordenacaoSel(null);
            },
    },
    ...(gerenciaSel
      ? [
          {
            label: gerenciaSel.descricao,
            onClick: nivel === 'coordenacao' ? undefined : () => setCoordenacaoSel(null),
          },
        ]
      : []),
    ...(coordenacaoSel ? [{ label: coordenacaoSel.descricao }] : []),
  ];

  const gerenciaCards: LevelCardOption[] = useMemo(
    () =>
      gerencias.map((g) => {
        const escopo = supervisoesDaGerencia(g.chave);
        const roteiros = contarRoteiros(escopo);
        const totalCoords = coordenacoes.filter((c) => c.chaveGerenciaArea === g.chave).length;
        return {
          chave: g.chave,
          titulo: g.descricao,
          subtitulo: `${totalCoords} GC III · ${escopo.length} gerentes`,
          destaque: `${roteiros} roteiro${roteiros === 1 ? '' : 's'} hoje`,
          destaqueAtivo: roteiros > 0,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gerencias, coordenacoes, supervisoes]
  );

  const coordenacaoCards: LevelCardOption[] = useMemo(() => {
    if (!gerenciaSel) return [];
    return coordenacoes
      .filter((c) => c.chaveGerenciaArea === gerenciaSel.chave)
      .map((c) => {
        const escopo = supervisoesDaCoordenacao(c.chave);
        const roteiros = contarRoteiros(escopo);
        return {
          chave: c.chave,
          titulo: c.descricao,
          subtitulo: `${escopo.length} gerente${escopo.length === 1 ? '' : 's'}`,
          destaque: `${roteiros} roteiro${roteiros === 1 ? '' : 's'} hoje`,
          destaqueAtivo: roteiros > 0,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenacoes, supervisoes, gerenciaSel]);

  const handleSelectGerencia = (chave: number) => {
    const item = gerencias.find((g) => g.chave === chave) ?? null;
    setGerenciaSel(item);
    setCoordenacaoSel(null);
  };

  const handleSelectCoordenacao = (chave: number) => {
    const item = coordenacoes.find((c) => c.chave === chave) ?? null;
    setCoordenacaoSel(item);
  };

  const handleGerenteClick = (item: CommercialStructureItem) => {
    const route = getRouteForSupervisao(item.chave);
    if (!route) return;
    // Abre o painel lateral de detalhes (controlado pelo pai via onRouteChange).
    onRouteChange(route);
  };

  const tituloNivel =
    nivel === 'gerencia'
      ? 'Selecione uma Gerência de Gestão'
      : nivel === 'coordenacao'
        ? 'Selecione um Gerente Comercial III'
        : 'Gerentes Comerciais';

  const header = mergeHeaderDrag(
    'flex shrink-0 items-center gap-1.5 border-b border-slate-200 px-3 py-3',
    headerDragProps
  );

  const minimizedBar = mergeHeaderDrag(
    'pointer-events-auto flex w-[330px] items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-xl shadow-slate-900/10 backdrop-blur-md',
    headerDragProps
  );

  if (minimized) {
    return (
      <div
        style={{ ...shellStyle, ...minimizedBar.dragStyle }}
        className={minimizedBar.className}
        {...minimizedBar.dragHandlers}
        title="Arraste para mover o painel"
      >
        <span className="rounded-lg bg-violet-50 p-1.5 text-violet-600">
          <RouteIcon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-900">
            Visitas e Roteiros
          </p>
          {activeRoute && (
            <p className="truncate text-[10px] text-slate-500">{activeRoute.gerenteComercial}</p>
          )}
        </div>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={() => setMinimized(false)}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Restaurar painel de visitas e roteiros"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={shellStyle}
      className="pointer-events-auto flex max-h-full w-[330px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur-md"
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
        <h2 className="flex-1 truncate text-sm font-bold uppercase tracking-wide text-slate-900">
          Visitas e Roteiros
        </h2>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={() => setMinimized(true)}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Minimizar painel (mantém a rota no mapa)"
          title="Minimizar (mantém a rota no mapa)"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar painel de visitas e roteiros"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <HierarchyBreadcrumb steps={breadcrumbSteps} />

        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Visão geral {coordenacaoSel ? 'da equipe' : gerenciaSel ? 'da gerência' : 'geral'}
          </p>
          <RegionOverviewCards supervisoes={supervisoesEscopo} />
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {tituloNivel}
          </p>

          {nivel === 'gerencia' && (
            <HierarchyLevelCards
              options={gerenciaCards}
              onSelect={handleSelectGerencia}
              emptyMessage="Nenhuma Gerência de Gestão disponível."
            />
          )}

          {nivel === 'coordenacao' && (
            <HierarchyLevelCards
              options={coordenacaoCards}
              onSelect={handleSelectCoordenacao}
              emptyMessage="Nenhum Gerente Comercial III nesta gerência."
            />
          )}

          {nivel === 'gerente' && (
            <div className="space-y-2">
              {supervisoesEscopo.map((item) => {
                const route = getRouteForSupervisao(item.chave);
                const isActive = Boolean(route && activeRoute?.id === route.id);
                return (
                  <button
                    key={item.chave}
                    type="button"
                    onClick={() => handleGerenteClick(item)}
                    disabled={!route}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                      isActive ? 'border-blue-300 bg-blue-50/80' : 'border-slate-200 bg-white',
                      route
                        ? 'hover:border-slate-300 hover:bg-slate-50'
                        : 'cursor-default opacity-70'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-900">
                        {route ? route.gerenteComercial : item.descricao}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {item.descricao}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                        route
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      )}
                    >
                      {route ? 'Roteiro do dia' : 'Sem roteiro hoje'}
                    </span>
                  </button>
                );
              })}
              {supervisoesEscopo.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                  Nenhum Gerente Comercial nesta coordenação.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisitasRoteirosPanel;
