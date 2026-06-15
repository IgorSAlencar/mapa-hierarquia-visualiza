import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Layers, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
} from '@/data/visitRoutesMock';
import {
  COMMERCIAL_TEAM_LEVEL_LABEL,
  COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL,
} from '@/data/regionMapPointsMock';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';
import { HIERARCHY_ALL, HierarchyScopeSelect } from '@/components/navigator/HierarchyScopeSelect';

interface CompararAreasPanelProps {
  onBack: () => void;
  onClose: () => void;
  compareActive: boolean;
  onApplyCompare: (gerenciaChave: string, coordenacaoChave: string) => void;
  onDeactivateCompare: () => void;
  appliedGerenciaChave: string;
  appliedCoordenacaoChave: string;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

const CompararAreasPanel: React.FC<CompararAreasPanelProps> = ({
  onBack,
  onClose,
  compareActive,
  onApplyCompare,
  onDeactivateCompare,
  appliedGerenciaChave,
  appliedCoordenacaoChave,
  shellStyle,
  headerDragProps,
}) => {
  const [gerencias, setGerencias] = useState<CommercialStructureItem[]>(FALLBACK_GERENCIAS);
  const [coordenacoes, setCoordenacoes] = useState<CommercialStructureItem[]>(FALLBACK_COORDENACOES);
  const [supervisoes, setSupervisoes] = useState<CommercialStructureItem[]>(FALLBACK_SUPERVISOES);
  const [gerenciaSel, setGerenciaSel] = useState(appliedGerenciaChave || HIERARCHY_ALL);
  const [coordenacaoSel, setCoordenacaoSel] = useState(appliedCoordenacaoChave || HIERARCHY_ALL);

  useEffect(() => {
    setGerenciaSel(appliedGerenciaChave || HIERARCHY_ALL);
    setCoordenacaoSel(appliedCoordenacaoChave || HIERARCHY_ALL);
  }, [appliedGerenciaChave, appliedCoordenacaoChave]);

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
    if (gerenciaSel === HIERARCHY_ALL) return coordenacoes;
    const chaveGg = Number(gerenciaSel);
    return coordenacoes.filter((item) => item.chaveGerenciaArea === chaveGg);
  }, [coordenacoes, gerenciaSel]);

  const supervisoesNoEscopo = useMemo(() => {
    if (coordenacaoSel !== HIERARCHY_ALL) {
      const chaveGc3 = Number(coordenacaoSel);
      return supervisoes.filter((item) => item.chaveCoordenacao === chaveGc3);
    }
    if (gerenciaSel !== HIERARCHY_ALL) {
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
    return [];
  }, [supervisoes, coordenacoes, gerenciaSel, coordenacaoSel]);

  const canApply =
    (gerenciaSel !== HIERARCHY_ALL && Number(gerenciaSel) > 0) ||
    (coordenacaoSel !== HIERARCHY_ALL && Number(coordenacaoSel) > 0);

  const handleGerenciaChange = (value: string) => {
    setGerenciaSel(value);
    setCoordenacaoSel(HIERARCHY_ALL);
  };

  const handleCoordenacaoChange = (value: string) => {
    setCoordenacaoSel(value);
    const item = coordenacoes.find((row) => String(row.chave) === value);
    if (item?.chaveGerenciaArea != null && item.chaveGerenciaArea > 0) {
      setGerenciaSel(String(item.chaveGerenciaArea));
    }
  };

  const header = mergeHeaderDrag(
    'flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-3',
    headerDragProps
  );

  const ggLabel = COMMERCIAL_TEAM_LEVEL_LABEL.gerente_area;
  const gc3Label = COMMERCIAL_TEAM_LEVEL_LABEL.coordenador;
  const gcPlural = COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor;

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
          Território de Atuação
        </h2>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar painel de comparar áreas"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-xs leading-snug text-slate-600">
          Escolha um <span className="font-semibold">{ggLabel}</span> ou um{' '}
          <span className="font-semibold">{gc3Label}</span> e confirme abaixo. As áreas dos{' '}
          {gcPlural} serão exibidas no mapa automaticamente.
        </p>

        <div className="space-y-2">
          <HierarchyScopeSelect
            placeholder="Gerente de Gestão"
            value={gerenciaSel}
            onChange={handleGerenciaChange}
            options={gerencias}
          />
          <HierarchyScopeSelect
            placeholder="Gerente Comercial III"
            value={coordenacaoSel}
            onChange={handleCoordenacaoChange}
            options={coordenacoesOptions}
          />
        </div>

        {canApply && supervisoesNoEscopo.length > 0 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{supervisoesNoEscopo.length}</span>{' '}
            {gcPlural.toLowerCase()} no escopo selecionado.
          </p>
        )}

        {canApply && supervisoesNoEscopo.length === 0 && (
          <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
            Nenhum {COMMERCIAL_TEAM_LEVEL_LABEL.supervisor.toLowerCase()} encontrado para este filtro.
            Ajuste a seleção ou aguarde o carregamento da estrutura.
          </p>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={!canApply}
          onClick={() => onApplyCompare(gerenciaSel, coordenacaoSel)}
        >
          <Layers className="mr-2 h-4 w-4" aria-hidden />
          Áreas de Atuação no mapa
        </Button>

        {compareActive && (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-xs font-medium text-emerald-900">Comparação exibida no mapa</p>
            <p className="text-[11px] text-emerald-800">
              Consulte a legenda no canto inferior esquerdo para identificar cada área por{' '}
              {COMMERCIAL_TEAM_LEVEL_LABEL.supervisor.toLowerCase()}.
            </p>
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={onDeactivateCompare}>
              Ocultar comparação
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompararAreasPanel;
