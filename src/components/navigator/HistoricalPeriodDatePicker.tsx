import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { localIsoDate } from '@/lib/visitRoutesApi';

interface HistoricalPeriodDatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  align?: 'start' | 'end';
  futureHint?: boolean;
}

function parseLocalDate(value: string): Date | undefined {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compactDateLabel(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) return 'Selecionar';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

const HistoricalPeriodDatePicker: React.FC<HistoricalPeriodDatePickerProps> = ({
  label,
  value,
  onChange,
  align = 'start',
  futureHint = false,
}) => {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => parseLocalDate(value), [value]);

  const selectDate = (date: Date) => {
    onChange(toLocalIsoDate(date));
    setOpen(false);
  };

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {futureHint && (
          <span className="truncate text-[9px] font-semibold text-blue-600">aceita datas futuras</span>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${compactDateLabel(value)}`}
            aria-expanded={open}
            className={cn(
              'group flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border bg-white px-2.5 text-left outline-none transition',
              'border-slate-200 hover:border-blue-300 hover:bg-blue-50/40',
              'focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100',
              open && 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-100'
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-bold capitalize text-slate-800">
              {compactDateLabel(value)}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                open && 'rotate-180 text-blue-600'
              )}
              aria-hidden
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align={align}
          side="bottom"
          sideOffset={7}
          collisionPadding={12}
          className="w-[min(276px,calc(100vw-24px))] overflow-hidden rounded-2xl border-blue-100 bg-white p-0 shadow-xl shadow-blue-950/15"
        >
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(date) => {
              if (date) selectDate(date);
            }}
            initialFocus
            className="p-3"
            classNames={{
              month: 'w-full space-y-2.5',
              caption: 'relative flex h-8 items-center justify-center',
              caption_label: 'text-xs font-bold capitalize text-slate-800',
              nav: 'flex items-center',
              nav_button: 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-500 opacity-100 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 [&>svg]:mx-auto [&>svg]:shrink-0',
              nav_button_previous: 'absolute left-0',
              nav_button_next: 'absolute right-0',
              table: 'w-full border-collapse',
              head_row: 'flex justify-between',
              head_cell: 'w-8 rounded-md text-center text-[9px] font-bold uppercase text-slate-400',
              row: 'mt-1 flex w-full justify-between',
              cell: 'relative h-8 w-8 p-0 text-center text-xs focus-within:relative focus-within:z-20',
              day: 'h-8 w-8 rounded-lg p-0 text-[11px] font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700',
              day_selected: 'bg-blue-600 text-white shadow-sm shadow-blue-200 hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white',
              day_today: 'border border-blue-300 bg-blue-50 font-bold text-blue-700',
              day_outside: 'text-slate-300 opacity-55',
            }}
          />

          <div className="flex items-center justify-between border-t border-blue-100 bg-blue-50/50 px-3 py-2">
            <span className="text-[10px] font-medium text-slate-500">
              {futureHint ? 'Datas futuras disponíveis' : 'Escolha o dia'}
            </span>
            <button
              type="button"
              onClick={() => selectDate(parseLocalDate(localIsoDate()) ?? new Date())}
              className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100"
            >
              Ir para hoje
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default HistoricalPeriodDatePicker;
