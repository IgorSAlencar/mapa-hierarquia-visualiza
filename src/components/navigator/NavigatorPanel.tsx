import React from 'react';
import type { CSSProperties } from 'react';
import {
  Building2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  HandCoins,
  Layers,
  Minus,
  Route,
  Ruler,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';

export type NavigatorSection = 'visitas' | 'planejar' | 'comparar' | 'distancia' | 'heatmap';

interface ProductItem {
  id: string;
  label: string;
  icon: React.ElementType;
  accent: string;
  section?: NavigatorSection;
}

const BrazilHeatIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('relative flex items-center justify-center', className)} aria-hidden>
    <span className="absolute h-6 w-6 rounded-full bg-sky-400/30 blur-[5px]" />
    <svg viewBox="0 0 32 32" className="relative h-full w-full drop-shadow-sm" fill="none">
      <path
        d="M11.2 3.1 17 4.5l2.4 2.2 4.2.8 2.2 3.4-1.5 3.7.4 3.2-3.1 2.5-1.2 4.4-3.1 4.2-2.1-2.7-2.4-1.2-1.1-3.9-3.5-2.2.8-4-2.1-3.3 2.4-2.2.2-3.5 2.9-1.3Z"
        fill="url(#brazilHeatGradient)"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="brazilHeatGradient" x1="8" y1="4" x2="23" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E0F2FE" />
          <stop offset=".55" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#0C4A6E" />
        </linearGradient>
      </defs>
    </svg>
  </span>
);

const PRODUCTS: ProductItem[] = [
  { id: 'corbans-ativos', label: 'CorBans Ativos', icon: Building2, accent: 'text-blue-600 bg-blue-50/90 border-blue-100' },
  { id: 'pade-adm', label: 'PADE ADM', icon: ClipboardList, accent: 'text-teal-600 bg-teal-50/90 border-teal-100' },
  { id: 'ab-contas', label: 'Ab. de Contas', icon: CreditCard, accent: 'text-indigo-600 bg-indigo-50/90 border-indigo-100' },
  { id: 'emprestimos', label: 'Empréstimos e Crédito', icon: HandCoins, accent: 'text-emerald-600 bg-emerald-50/90 border-emerald-100' },
  { id: 'seguros', label: 'Seguros', icon: Shield, accent: 'text-violet-600 bg-violet-50/90 border-violet-100' },
  { id: 'heatmap', label: 'Mapa de produção', icon: BrazilHeatIcon, accent: 'text-sky-700 bg-sky-50/90 border-sky-200', section: 'heatmap' },
];

interface SubjectItem {
  id: string;
  label: string;
  icon: React.ElementType;
  accent: string;
  section?: NavigatorSection;
}

const SUBJECTS: SubjectItem[] = [
  { id: 'comparar', label: 'Território de Atuação', icon: Layers, accent: 'text-emerald-600', section: 'comparar' },
  { id: 'visitas', label: 'Visitas e Roteiros', icon: Route, accent: 'text-violet-600', section: 'visitas' },
  { id: 'planejar', label: 'Montar meu roteiro', icon: ClipboardList, accent: 'text-blue-600', section: 'planejar' },
  { id: 'distancia', label: 'Análise de Distância', icon: Ruler, accent: 'text-sky-600', section: 'distancia' },
];

interface NavigatorPanelProps {
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  activeSection: NavigatorSection | null;
  onSelectSection: (section: NavigatorSection | null) => void;
  shellStyle?: CSSProperties;
  headerDragProps?: PanelHeaderDragProps;
}

const NavigatorPanel: React.FC<NavigatorPanelProps> = ({
  minimized,
  onMinimize,
  onRestore,
  activeSection,
  onSelectSection,
  shellStyle,
  headerDragProps,
}) => {
  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="pointer-events-auto absolute bottom-4 left-0 z-20 flex items-center gap-2 rounded-r-xl border border-l-0 border-slate-200/90 bg-white/95 py-3 pl-2.5 pr-3 text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition-colors hover:bg-slate-50"
        aria-label="Reabrir painel Navegar"
        title="Reabrir painel Navegar"
      >
        <ChevronRight className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <span className="text-sm font-semibold leading-tight text-slate-900">Navegar</span>
      </button>
    );
  }

  const header = mergeHeaderDrag(
    'flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2',
    headerDragProps
  );

  return (
    <div
      style={shellStyle}
      className="pointer-events-auto flex max-h-full w-[288px] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-lg shadow-slate-900/8 backdrop-blur-md"
    >
      <header
        className={header.className}
        style={header.dragStyle}
        {...header.dragHandlers}
        title="Arraste para mover o painel"
      >
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-900">Navegar</h2>
        <button
          type="button"
          data-panel-drag-ignore
          onClick={onMinimize}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Minimizar painel Navegar"
          title="Minimizar"
        >
          <Minus className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Produtos</p>
        <div className="grid grid-cols-3 gap-2">
          {PRODUCTS.map((product) => (
            (() => {
              const isClickable = Boolean(product.section);
              const isActive = isClickable && activeSection === product.section;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={isClickable ? () => onSelectSection(isActive ? null : product.section!) : undefined}
                  aria-pressed={isClickable ? isActive : undefined}
                  className={cn(
                    'flex h-[72px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center transition-all',
                    product.accent,
                    isActive && 'border-sky-400 bg-sky-100 ring-2 ring-sky-200 shadow-sm',
                    isClickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm' : 'cursor-default'
                  )}
                  title={isClickable ? product.label : `${product.label} (em breve)`}
                >
                  <product.icon className={cn('shrink-0', product.id === 'heatmap' ? 'h-7 w-7' : 'h-4 w-4')} aria-hidden />
                  <span className="line-clamp-2 min-h-[2em] w-full px-0.5 text-[9px] font-medium leading-snug text-slate-700">
                    {product.label}
                  </span>
                </button>
              );
            })()
          ))}
        </div>

        <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assuntos</p>
        <div className="space-y-1.5">
          {SUBJECTS.map((subject) => {
            const isClickable = Boolean(subject.section);
            const isActive = isClickable && activeSection === subject.section;
            return (
              <button
                key={subject.id}
                type="button"
                onClick={
                  isClickable
                    ? () => onSelectSection(isActive ? null : subject.section!)
                    : undefined
                }
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  isActive
                    ? subject.section === 'planejar'
                      ? 'border-blue-300 bg-blue-50 text-slate-900'
                      : subject.section === 'distancia'
                        ? 'border-sky-300 bg-sky-50 text-slate-900'
                        : subject.section === 'comparar'
                          ? 'border-emerald-200 bg-emerald-50 text-slate-900'
                          : 'border-violet-200 bg-violet-50 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700',
                  isClickable ? 'hover:border-slate-300 hover:bg-slate-50' : 'cursor-default opacity-80'
                )}
                title={isClickable ? subject.label : `${subject.label} (em breve)`}
              >
                <subject.icon className={cn('h-4 w-4 shrink-0', subject.accent)} aria-hidden />
                <span className="flex-1 truncate text-sm font-medium">{subject.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>
      {activeSection === 'planejar' && (
        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            data-panel-drag-ignore
            onClick={onMinimize}
            className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[10px] font-bold text-slate-700 shadow-sm shadow-slate-900/[0.03] transition-colors hover:bg-slate-50"
            aria-label="Recolher menu"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-50 text-slate-600">
              <ChevronRight className="h-3.5 w-3.5 rotate-180" aria-hidden />
            </span>
            <span className="flex-1">Recolher menu</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
};

export default NavigatorPanel;
