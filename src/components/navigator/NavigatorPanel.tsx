import React from 'react';
import type { CSSProperties } from 'react';
import {
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  HandCoins,
  Layers,
  Lightbulb,
  Megaphone,
  Minus,
  Route,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';
import { mergeHeaderDrag } from '@/components/navigator/mergeHeaderDrag';

export type NavigatorSection = 'visitas' | 'comparar';

interface ProductItem {
  id: string;
  label: string;
  icon: React.ElementType;
  accent: string;
}

const PRODUCTS: ProductItem[] = [
  { id: 'corbans-ativos', label: 'CorBans Ativos', icon: Building2, accent: 'text-blue-600 bg-blue-50/90 border-blue-100' },
  { id: 'pade-adm', label: 'PADE ADM', icon: ClipboardList, accent: 'text-teal-600 bg-teal-50/90 border-teal-100' },
  { id: 'ab-contas', label: 'Ab. de Contas', icon: CreditCard, accent: 'text-indigo-600 bg-indigo-50/90 border-indigo-100' },
  { id: 'emprestimos', label: 'Empréstimos e Crédito', icon: HandCoins, accent: 'text-emerald-600 bg-emerald-50/90 border-emerald-100' },
  { id: 'seguros', label: 'Seguros', icon: Shield, accent: 'text-violet-600 bg-violet-50/90 border-violet-100' },
];

interface SubjectItem {
  id: string;
  label: string;
  icon: React.ElementType;
  accent: string;
  section?: NavigatorSection;
}

const SUBJECTS: SubjectItem[] = [
  { id: 'acoes', label: 'Ações e Campanhas', icon: Megaphone, accent: 'text-blue-600' },
  { id: 'comparar', label: 'Território de Atuação', icon: Layers, accent: 'text-emerald-600', section: 'comparar' },
  { id: 'visitas', label: 'Visitas e Roteiros', icon: Route, accent: 'text-violet-600', section: 'visitas' },
  { id: 'oportunidades', label: 'Oportunidades', icon: Lightbulb, accent: 'text-amber-500' },
  { id: 'alertas', label: 'Alertas e Pendências', icon: Bell, accent: 'text-rose-600' },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3, accent: 'text-sky-600' },
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
            <button
              key={product.id}
              type="button"
              className={cn(
                'flex h-[72px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center transition-colors',
                product.accent,
                'cursor-default'
              )}
              title={`${product.label} (em breve)`}
            >
              <product.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="line-clamp-2 min-h-[2em] w-full px-0.5 text-[9px] font-medium leading-snug text-slate-700">
                {product.label}
              </span>
            </button>
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
                    ? 'border-violet-200 bg-violet-50 text-slate-900'
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
    </div>
  );
};

export default NavigatorPanel;
