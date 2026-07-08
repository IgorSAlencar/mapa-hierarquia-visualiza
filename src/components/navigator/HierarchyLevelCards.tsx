import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LevelCardOption {
  chave: number;
  titulo: string;
  subtitulo: string;
  destaque?: string;
  destaqueAtivo?: boolean;
  disabled?: boolean;
  active?: boolean;
}

interface HierarchyLevelCardsProps {
  options: LevelCardOption[];
  onSelect: (chave: number) => void;
  emptyMessage: string;
}

/**
 * Grade de cards clicáveis usada na navegação guiada da hierarquia
 * (Gerência de Gestão → Gerente Comercial III → Gerente Comercial).
 */
const HierarchyLevelCards: React.FC<HierarchyLevelCardsProps> = ({
  options,
  onSelect,
  emptyMessage,
}) => {
  if (options.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button
          key={option.chave}
          type="button"
          onClick={() => onSelect(option.chave)}
          disabled={option.disabled}
          className={cn(
            'group flex min-h-[84px] flex-col justify-between rounded-xl border p-2.5 text-left transition-all',
            option.active
              ? 'border-blue-300 bg-blue-50/80 shadow-sm'
              : 'border-slate-200 bg-white',
            option.disabled
              ? 'cursor-default opacity-60'
              : 'hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100'
          )}
        >
          <span className="block text-[11px] font-semibold leading-snug text-slate-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {option.titulo}
          </span>
          <span className="mt-1.5 flex items-end justify-between gap-1">
            <span className="min-w-0">
              <span className="block truncate text-[10px] text-slate-500">{option.subtitulo}</span>
              {option.destaque && (
                <span
                  className={cn(
                    'mt-0.5 inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-semibold',
                    option.destaqueAtivo
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  )}
                >
                  {option.destaque}
                </span>
              )}
            </span>
            {!option.disabled && (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500"
                aria-hidden
              />
            )}
          </span>
        </button>
      ))}
    </div>
  );
};

export default HierarchyLevelCards;
