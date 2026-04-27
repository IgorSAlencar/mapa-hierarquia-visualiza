import React, { useMemo, useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AGENCIAS,
  FILTROS_INICIAIS,
  PESSOAS,
  type FiltrosEstrutura,
} from '@/data/commercialStructureMock';

const ALL = 'all';

interface CommercialStructureFiltersProps {
  filters: FiltrosEstrutura;
  onFiltersChange: (f: FiltrosEstrutura) => void;
}

const CommercialStructureFilters: React.FC<CommercialStructureFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const diretorias = useMemo(
    () => PESSOAS.filter((p) => p.cargo === 'diretoria_regional'),
    []
  );
  const gerentesRegionais = useMemo(
    () => PESSOAS.filter((p) => p.cargo === 'gerente_regional'),
    []
  );
  const gerentesArea = useMemo(
    () => PESSOAS.filter((p) => p.cargo === 'gerente_area'),
    []
  );
  const coordenadores = useMemo(
    () => PESSOAS.filter((p) => p.cargo === 'coordenador'),
    []
  );
  const supervisores = useMemo(
    () => PESSOAS.filter((p) => p.cargo === 'supervisor'),
    []
  );
  const agencias = useMemo(() => [...AGENCIAS], []);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-map-primary shrink-0" />
          Estrutura comercial
        </h2>
        <p className="text-sm text-muted-foreground">
          Filtre por nível hierárquico para ver no mapa os responsáveis e as agências ligadas a
          essa escada (dados modelo).
        </p>
      </div>

      <div className="space-y-3">
        <Field
          label="Diretoria Regional"
          value={filters.diretoriaRegionalId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              diretoriaRegionalId: v === ALL ? '' : v,
            })
          }
          options={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
        />

        <Field
          label="Gerente Regional"
          value={filters.gerenteRegionalId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              gerenteRegionalId: v === ALL ? '' : v,
            })
          }
          options={gerentesRegionais.map((p) => ({ value: p.id, label: p.nome }))}
        />

        <Field
          label="Gerente de Área"
          value={filters.gerenteAreaId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              gerenteAreaId: v === ALL ? '' : v,
            })
          }
          options={gerentesArea.map((p) => ({ value: p.id, label: p.nome }))}
        />

        <Field
          label="Coordenador"
          value={filters.coordenadorId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              coordenadorId: v === ALL ? '' : v,
            })
          }
          options={coordenadores.map((p) => ({ value: p.id, label: p.nome }))}
        />

        <Field
          label="Supervisor"
          value={filters.supervisorId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              supervisorId: v === ALL ? '' : v,
            })
          }
          options={supervisores.map((p) => ({ value: p.id, label: p.nome }))}
        />

        <Field
          label="Agência"
          value={filters.agenciaId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              agenciaId: v === ALL ? '' : v,
            })
          }
          options={agencias.map((a) => ({
            value: a.id,
            label: `${a.codigo} — ${a.nome}`,
          }))}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onFiltersChange(FILTROS_INICIAIS)}
      >
        Limpar filtros
      </Button>
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
      />
    </div>
  );
}

function SearchableSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((option) => option.value === value)?.label ?? 'Todos';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between text-sm font-normal"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite para buscar..." />
          <CommandList>
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandItem
              value="Todos"
              onSelect={() => {
                onChange(ALL);
                setOpen(false);
              }}
            >
              <Check className={cn('mr-2 h-4 w-4', value === ALL ? 'opacity-100' : 'opacity-0')} />
              Todos
            </CommandItem>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CommercialStructureFilters;
