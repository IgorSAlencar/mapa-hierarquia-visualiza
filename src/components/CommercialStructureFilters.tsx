import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FILTROS_INICIAIS, type FiltrosEstrutura } from '@/data/commercialStructureMock';
import {
  fetchAgencias,
  fetchCoordenacoes,
  fetchGerenciasArea,
  fetchSupervisoes,
  type CommercialAgencyItem,
  type CommercialStructureItem,
} from '@/lib/commercialStructureApi';

const ALL = 'all';

interface CommercialStructureFiltersProps {
  filters: FiltrosEstrutura;
  onFiltersChange: (filters: FiltrosEstrutura) => void;
  baseFilters?: FiltrosEstrutura;
  onReturnToTerritory?: () => void;
}

const CommercialStructureFilters: React.FC<CommercialStructureFiltersProps> = ({
  filters,
  onFiltersChange,
  baseFilters = FILTROS_INICIAIS,
  onReturnToTerritory,
}) => {
  const [gerencias, setGerencias] = useState<CommercialStructureItem[]>([]);
  const [coordenacoes, setCoordenacoes] = useState<CommercialStructureItem[]>([]);
  const [supervisoes, setSupervisoes] = useState<CommercialStructureItem[]>([]);
  const [agencias, setAgencias] = useState<CommercialAgencyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.allSettled([
      fetchGerenciasArea(),
      fetchCoordenacoes(),
      fetchSupervisoes(),
      fetchAgencias(),
    ]).then(([ga, coord, sup, agency]) => {
      if (!active) return;
      setGerencias(ga.status === 'fulfilled' ? ga.value : []);
      setCoordenacoes(coord.status === 'fulfilled' ? coord.value : []);
      setSupervisoes(sup.status === 'fulfilled' ? sup.value : []);
      setAgencias(agency.status === 'fulfilled' ? agency.value : []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const chaveGerenciaArea = Number(filters.chaveGerenciaArea);
  const chaveCoordenacao = Number(filters.chaveCoordenacao);

  const coordenacoesOptions = useMemo(() => {
    if (Number.isFinite(chaveGerenciaArea) && chaveGerenciaArea > 0) {
      return coordenacoes.filter((item) => item.chaveGerenciaArea === Math.trunc(chaveGerenciaArea));
    }
    return coordenacoes;
  }, [coordenacoes, chaveGerenciaArea]);

  const supervisoesOptions = useMemo(() => {
    if (Number.isFinite(chaveCoordenacao) && chaveCoordenacao > 0) {
      return supervisoes.filter((item) => item.chaveCoordenacao === Math.trunc(chaveCoordenacao));
    }
    return supervisoes;
  }, [supervisoes, chaveCoordenacao]);

  const changeGerencia = (value: string) => {
    onFiltersChange({
      ...filters,
      chaveGerenciaArea: value === ALL ? '' : value,
      chaveCoordenacao: '',
      chaveSupervisao: '',
      agenciaId: '',
    });
  };

  const changeCoordenacao = (value: string) => {
    if (value === ALL) {
      onFiltersChange({ ...filters, chaveCoordenacao: '', chaveSupervisao: '', agenciaId: '' });
      return;
    }
    const item = coordenacoes.find((row) => String(row.chave) === value);
    onFiltersChange({
      ...filters,
      chaveGerenciaArea: item?.chaveGerenciaArea ? String(item.chaveGerenciaArea) : filters.chaveGerenciaArea,
      chaveCoordenacao: value,
      chaveSupervisao: '',
      agenciaId: '',
    });
  };

  const changeSupervisao = (value: string) => {
    if (value === ALL) {
      onFiltersChange({ ...filters, chaveSupervisao: '', agenciaId: '' });
      return;
    }
    const item = supervisoes.find((row) => String(row.chave) === value);
    onFiltersChange({
      ...filters,
      chaveGerenciaArea: item?.chaveGerenciaArea ? String(item.chaveGerenciaArea) : filters.chaveGerenciaArea,
      chaveCoordenacao: item?.chaveCoordenacao ? String(item.chaveCoordenacao) : filters.chaveCoordenacao,
      chaveSupervisao: value,
      agenciaId: '',
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5 shrink-0 text-map-primary" />
          Estrutura comercial
        </h2>
        <p className="text-sm text-muted-foreground">
          As opções e os pontos apresentados respeitam seu território de acesso.
        </p>
      </div>

      <div className="space-y-3">
        <Field
          label="Gerente de Gestão"
          value={filters.chaveGerenciaArea || ALL}
          onChange={changeGerencia}
          options={gerencias.map((item) => ({ value: String(item.chave), label: `${item.chave} - ${item.descricao}` }))}
          disabled={loading}
        />
        <Field
          label="Gerente Comercial III"
          value={filters.chaveCoordenacao || ALL}
          onChange={changeCoordenacao}
          options={coordenacoesOptions.map((item) => ({ value: String(item.chave), label: `${item.chave} - ${item.descricao}` }))}
          disabled={loading}
        />
        <Field
          label="Gerente Comercial"
          value={filters.chaveSupervisao || ALL}
          onChange={changeSupervisao}
          options={supervisoesOptions.map((item) => ({ value: String(item.chave), label: `${item.chave} - ${item.descricao}` }))}
          disabled={loading}
        />
        <Field
          label="Agência"
          value={filters.agenciaId || ALL}
          onChange={(value) => onFiltersChange({ ...filters, agenciaId: value === ALL ? '' : value })}
          options={agencias.map((agency) => ({ value: agency.codAg, label: `${agency.codAg} — ${agency.nome}` }))}
          disabled={loading}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => {
          onFiltersChange(baseFilters);
          onReturnToTerritory?.();
        }}
      >
        Voltar ao meu território
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
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <SearchableSelect value={value} onChange={onChange} options={options} disabled={disabled} />
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
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((option) => option.value === value)?.label ?? 'Todos';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="h-9 w-full justify-between text-sm font-normal">
          <span className="truncate">{currentLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite para buscar..." />
          <CommandList>
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandItem value="Todos" onSelect={() => { onChange(ALL); setOpen(false); }}>
              <Check className={cn('mr-2 h-4 w-4', value === ALL ? 'opacity-100' : 'opacity-0')} />
              Todos
            </CommandItem>
            {options.map((option) => (
              <CommandItem key={option.value} value={option.label} onSelect={() => { onChange(option.value); setOpen(false); }}>
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
