import React from 'react';
import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  Calculator,
  ChevronRight,
  CreditCard,
  HandCoins,
  Leaf,
  Lightbulb,
  LineChart,
  Megaphone,
  Minus,
  Route,
  Settings,
  Shield,
  Store,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type NavigatorSection = 'visitas';

interface ProductItem {
  id: string;
  label: string;
  icon: React.ElementType;
  accent: string;
}

const PRODUCTS: ProductItem[] = [
  { id: 'conta-corrente', label: 'Conta Corrente', icon: CreditCard, accent: 'text-blue-600 bg-blue-50 border-blue-100' },
  { id: 'emprestimos', label: 'Empréstimos e Crédito', icon: HandCoins, accent: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { id: 'seguros', label: 'Seguros', icon: Shield, accent: 'text-violet-600 bg-violet-50 border-violet-100' },
  { id: 'investimentos', label: 'Investimentos', icon: LineChart, accent: 'text-orange-600 bg-orange-50 border-orange-100' },
  { id: 'consorcios', label: 'Consórcios', icon: BadgeDollarSign, accent: 'text-rose-600 bg-rose-50 border-rose-100' },
  { id: 'maquininhas', label: 'Maquininhas', icon: Calculator, accent: 'text-sky-600 bg-sky-50 border-sky-100' },
  { id: 'expresso', label: 'Bradesco Expresso', icon: Store, accent: 'text-red-600 bg-red-50 border-red-100' },
  { id: 'lime', label: 'LIME', icon: Leaf, accent: 'text-green-600 bg-green-50 border-green-100' },
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
  { id: 'metas', label: 'Metas e Desempenho', icon: Target, accent: 'text-emerald-600' },
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
}

const NavigatorPanel: React.FC<NavigatorPanelProps> = ({
  minimized,
  onMinimize,
  onRestore,
  activeSection,
  onSelectSection,
}) => {
  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="pointer-events-auto absolute left-0 top-[40%] z-20 flex -translate-y-1/2 items-center gap-2 rounded-r-xl border border-l-0 border-slate-200/90 bg-white/95 py-3 pl-2.5 pr-3 text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition-colors hover:bg-slate-50"
        aria-label="Reabrir painel Navegar"
        title="Reabrir painel Navegar"
      >
        <ChevronRight className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <span className="text-sm font-semibold leading-tight text-slate-900">Navegar</span>
      </button>
    );
  }

  return (
    <div className="pointer-events-auto flex max-h-full w-[300px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur-md">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">Navegar</h2>
        <button
          type="button"
          onClick={onMinimize}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Minimizar painel Navegar"
          title="Minimizar"
        >
          <Minus className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Produtos</p>
        <div className="grid grid-cols-4 gap-2">
          {PRODUCTS.map((product) => (
            <button
              key={product.id}
              type="button"
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors',
                product.accent,
                'cursor-default opacity-90'
              )}
              title={`${product.label} (em breve)`}
            >
              <product.icon className="h-5 w-5" aria-hidden />
              <span className="text-[9px] font-medium leading-tight text-slate-700">{product.label}</span>
            </button>
          ))}
        </div>

        <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assuntos</p>
        <div className="space-y-2">
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
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
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

      <footer className="shrink-0 border-t border-slate-200 p-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          title="Personalizar painel (em breve)"
        >
          <Settings className="h-4 w-4" aria-hidden />
          Personalizar painel
        </button>
      </footer>
    </div>
  );
};

export default NavigatorPanel;
