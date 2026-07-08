import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbStep {
  label: string;
  onClick?: () => void;
}

interface HierarchyBreadcrumbProps {
  steps: BreadcrumbStep[];
}

/** Trilha de navegação da jornada Gerência → GC III → Gerentes Comerciais. */
const HierarchyBreadcrumb: React.FC<HierarchyBreadcrumbProps> = ({ steps }) => {
  return (
    <nav aria-label="Nível da hierarquia" className="flex min-w-0 items-center gap-1">
      <Home className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <React.Fragment key={`${step.label}-${index}`}>
            {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />}
            {step.onClick && !isLast ? (
              <button
                type="button"
                onClick={step.onClick}
                className="max-w-[110px] truncate text-[10px] font-medium text-blue-600 transition-colors hover:text-blue-800 hover:underline"
              >
                {step.label}
              </button>
            ) : (
              <span
                className={cn(
                  'truncate text-[10px]',
                  isLast ? 'font-semibold text-slate-800' : 'font-medium text-slate-500'
                )}
              >
                {step.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default HierarchyBreadcrumb;
