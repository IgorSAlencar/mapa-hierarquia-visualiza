import React from 'react';
import { Building2, ChevronRight } from 'lucide-react';
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

/** Lista usada na navegação guiada Gerência → GC III → Gerente Comercial. */
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {options.map((option) => (
        <button
          key={option.chave}
          type="button"
          onClick={() => onSelect(option.chave)}
          disabled={option.disabled}
          className={cn(
            'group flex min-h-[68px] w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left transition-colors last:border-b-0',
            option.active
              ? 'bg-blue-50/80'
              : 'bg-white',
            option.disabled
              ? 'cursor-default opacity-60'
              : 'hover:bg-slate-50 active:bg-slate-100'
          )}
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              option.active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
            )}
          >
            <Building2 className="h-4 w-4" aria-hidden />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-slate-900">{option.titulo}</span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{option.subtitulo}</span>
          </span>

          {option.destaque && (
            <span
              className={cn(
                'max-w-[112px] shrink-0 rounded-full border px-2 py-1 text-right text-[10px] font-semibold leading-tight',
                option.destaqueAtivo
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              )}
            >
              {option.destaque}
            </span>
          )}

          {!option.disabled && (
            <ChevronRight
              className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-blue-600"
              aria-hidden
            />
          )}
        </button>
      ))}
    </div>
  );
};

export default HierarchyLevelCards;
