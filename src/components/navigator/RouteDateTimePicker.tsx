import React, { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3 } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface RouteDateTimePickerProps {
  date: string;
  startTime: string;
  onDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  className?: string;
}

const QUICK_TIMES = ['08:00', '09:00', '10:00', '13:00'];

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

function formatRouteDate(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) return 'Escolha uma data';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(parsed).replace('.', '');
}

const RouteDateTimePicker: React.FC<RouteDateTimePickerProps> = ({
  date,
  startTime,
  onDateChange,
  onStartTimeChange,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => parseLocalDate(date), [date]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-panel-drag-ignore
          aria-label={`Data do roteiro: ${formatRouteDate(date)}, início às ${startTime}`}
          className={cn(
            'group flex min-h-10 min-w-[170px] items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-2.5 text-left transition',
            'hover:border-violet-200 hover:bg-white hover:shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2',
            open && 'border-violet-300 bg-white ring-2 ring-violet-100',
            className
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <CalendarDays className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">Data do roteiro</span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-bold capitalize text-slate-900">
              {formatRouteDate(date)}
              <span className="h-3 w-px bg-slate-300" aria-hidden="true" />
              <Clock3 className="h-3 w-3 text-violet-600" />
              {startTime}
            </span>
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-180 text-violet-600')} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        data-panel-drag-ignore
        align="start"
        alignOffset={-10}
        side="top"
        sideOffset={22}
        className="w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border-slate-200 bg-white p-0 shadow-xl shadow-slate-900/15"
      >
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selectedDate}
          onSelect={(value) => {
            if (value) onDateChange(toLocalIsoDate(value));
          }}
          initialFocus
          className="p-2.5"
          classNames={{
            month: 'w-full space-y-2.5',
            table: 'w-full border-collapse',
            head_row: 'flex justify-between',
            head_cell: 'w-8 rounded-md text-center text-[9px] font-bold uppercase text-slate-400',
            row: 'mt-1 flex w-full justify-between',
            cell: 'relative h-8 w-8 p-0 text-center text-xs focus-within:relative focus-within:z-20',
            day: 'h-8 w-8 rounded-lg p-0 text-[11px] font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700',
            day_selected: 'bg-violet-600 text-white hover:bg-violet-700 hover:text-white focus:bg-violet-600 focus:text-white',
            day_today: 'border border-violet-300 bg-violet-50 text-violet-700',
            day_outside: 'text-slate-300 opacity-60',
            caption_label: 'text-xs font-bold capitalize text-slate-800',
            nav_button: 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-500 opacity-100 hover:bg-violet-50 hover:text-violet-700 [&>svg]:mx-auto [&>svg]:shrink-0',
          }}
        />

        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="route-start-time" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Clock3 className="h-4 w-4 text-violet-600" />
              Horário de início
            </label>
            <input
              id="route-start-time"
              type="time"
              step={300}
              value={startTime}
              onChange={(event) => onStartTimeChange(event.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold tabular-nums text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div className="mt-2.5 flex gap-1.5" aria-label="Sugestões de horário">
            {QUICK_TIMES.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => onStartTimeChange(time)}
                className={cn(
                  'flex-1 rounded-lg border px-1.5 py-1 text-[9px] font-bold tabular-nums transition',
                  startTime === time
                    ? 'border-violet-200 bg-violet-100 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700'
                )}
              >
                {time}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2.5 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-[11px] font-bold text-white transition hover:bg-violet-700"
          >
            <Check className="h-3.5 w-3.5" />
            Confirmar data e horário
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default RouteDateTimePicker;
