import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Route as RouteIcon, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import RouteStopsList from './RouteStopsList';

const ALL = 'all';

interface VisitasRoteirosPanelProps {
  onBack: () => void;
  onClose: () => void;
  activeRoute: VisitRoute | null;
  onRouteChange: (route: VisitRoute | null) => void;
  selectedStopId: number | null;
  onStopSelect: (stopId: number) => void;
  onViewFullRoute: () => void;
}

const VisitasRoteirosPanel: React.FC<VisitasRoteirosPanelProps> = ({
  onBack,
  onClose,
  activeRoute,
  onRouteChange,
  selectedStopId,
  onStopSelect,
  onViewFullRoute,
}) => {
  const [gerencias, setGerencias] = useState<CommercialStructureItem[]>(FALLBACK_GERENCIAS);
  const [coordenacoes, setCoordenacoes] = useState<CommercialStructureItem[]>(FALLBACK_COORDENACOES);
  const [supervisoes, setSupervisoes] = useState<CommercialStructureItem[]>(FALLBACK_SUPERVISOES);
  const [gerenciaSel, setGerenciaSel] = useState<string>(ALL);
  const [coordenacaoSel, setCoordenacaoSel] = useState<string>(ALL);

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

  const coordenacoesOptions = useMemo(() => {
    if (gerenciaSel === ALL) return coordenacoes;
    const chaveGg = Number(gerenciaSel);
    return coordenacoes.filter((item) => item.chaveGerenciaArea === chaveGg);
  }, [coordenacoes, gerenciaSel]);

  const supervisoesOptions = useMemo(() => {
    if (coordenacaoSel !== ALL) {
      const chaveGc3 = Number(coordenacaoSel);
      return supervisoes.filter((item) => item.chaveCoordenacao === chaveGc3);
    }
    if (gerenciaSel !== ALL) {
      const chaveGg = Number(gerenciaSel);
      const coordsDaGerencia = new Set(
        coordenacoes.filter((c) => c.chaveGerenciaArea === chaveGg).map((c) => c.chave)
      );
      return supervisoes.filter(
        (item) =>
          item.chaveGerenciaArea === chaveGg ||
          (item.chaveCoordenacao != null && coordsDaGerencia.has(item.chaveCoordenacao))
      );
    }
    return supervisoes;
  }, [supervisoes, coordenacoes, gerenciaSel, coordenacaoSel]);

  const handleGerenciaChange = (value: string) => {
    setGerenciaSel(value);
    setCoordenacaoSel(ALL);
    onRouteChange(null);
  };

  const handleCoordenacaoChange = (value: string) => {
    setCoordenacaoSel(value);
    onRouteChange(null);
  };

  const handleGcClick = (item: CommercialStructureItem) => {
    const route = getRouteForSupervisao(item.chave);
    if (!route) return;
    onRouteChange(activeRoute?.id === route.id ? null : route);
  };

  return (
    <div className="pointer-events-auto flex max-h-full w-[330px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur-md">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-3">
        <button
          type="button"
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
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar painel de visitas e roteiros"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <Tabs defaultValue="roteiros" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-3 grid shrink-0 grid-cols-3">
          <TabsTrigger value="visao-geral" className="text-xs">Visão geral</TabsTrigger>
          <TabsTrigger value="roteiros" className="text-xs">Roteiros</TabsTrigger>
          <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="min-h-0 flex-1 overflow-y-auto p-4">
          <PlaceholderTab message="A visão geral das visitas da equipe estará disponível em breve." />
        </TabsContent>

        <TabsContent value="roteiros" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="space-y-2">
            <HierarchySelect
              placeholder="Gerente de Gestão"
              value={gerenciaSel}
              onChange={handleGerenciaChange}
              options={gerencias}
            />
            <HierarchySelect
              placeholder="Gerente Comercial III"
              value={coordenacaoSel}
              onChange={handleCoordenacaoChange}
              options={coordenacoesOptions}
            />
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Gerentes Comerciais
            </p>
            {supervisoesOptions.map((item) => {
              const route = getRouteForSupervisao(item.chave);
              const isActive = Boolean(route && activeRoute?.id === route.id);
              return (
                <button
                  key={item.chave}
                  type="button"
                  onClick={() => handleGcClick(item)}
                  disabled={!route}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                    isActive
                      ? 'border-blue-300 bg-blue-50/80'
                      : 'border-slate-200 bg-white',
                    route ? 'hover:border-slate-300 hover:bg-slate-50' : 'cursor-default opacity-70'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-900">
                      {route ? route.gerenteComercial : item.descricao}
                    </span>
                    <span className="block truncate text-[10px] text-slate-500">{item.descricao}</span>
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
            {supervisoesOptions.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                Nenhum Gerente Comercial encontrado para o filtro selecionado.
              </p>
            )}
          </div>

          {activeRoute && (
            <div className="space-y-3 border-t border-slate-200 pt-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 rounded-lg bg-violet-50 p-1.5 text-violet-600">
                  <RouteIcon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{activeRoute.nome}</p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-500">
                    <CalendarDays className="h-3 w-3" aria-hidden />
                    {activeRoute.data}
                  </p>
                </div>
              </div>
              <RouteStopsList
                route={activeRoute}
                selectedStopId={selectedStopId}
                onStopSelect={onStopSelect}
                onViewFullRoute={onViewFullRoute}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="min-h-0 flex-1 overflow-y-auto p-4">
          <PlaceholderTab message="O histórico de visitas realizadas estará disponível em breve." />
        </TabsContent>
      </Tabs>
    </div>
  );
};

function HierarchySelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: CommercialStructureItem[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full bg-white text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">
          {placeholder}: todos
        </SelectItem>
        {options.map((item) => (
          <SelectItem key={item.chave} value={String(item.chave)} className="text-xs">
            {item.chave} - {item.descricao}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PlaceholderTab({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
      {message}
    </div>
  );
}

export default VisitasRoteirosPanel;
