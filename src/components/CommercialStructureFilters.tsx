import React, { useEffect, useMemo, useState } from 'react';
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
import {
  fetchCoordenacoes,
  fetchGerenciasArea,
  fetchSupervisoes,
  type CommercialStructureItem,
} from '@/lib/commercialStructureApi';

const ALL = 'all';

interface CommercialStructureFiltersProps {
  filters: FiltrosEstrutura;
  onFiltersChange: (f: FiltrosEstrutura) => void;
}

const CommercialStructureFilters: React.FC<CommercialStructureFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const [gerenciasAreaSql, setGerenciasAreaSql] = useState<CommercialStructureItem[]>([]);
  const [coordenacoesAllSql, setCoordenacoesAllSql] = useState<CommercialStructureItem[]>([]);
  const [supervisoesAllSql, setSupervisoesAllSql] = useState<CommercialStructureItem[]>([]);
  const [loadingGerencias, setLoadingGerencias] = useState(false);
  const [loadingCoordenacoes, setLoadingCoordenacoes] = useState(false);
  const [loadingSupervisoes, setLoadingSupervisoes] = useState(false);

  const diretorias = useMemo(
    () => PESSOAS.filter((p) => p.cargo === 'diretoria_regional'),
    []
  );
  const gerentesRegionais = useMemo(
    () => PESSOAS.filter((p) => p.cargo === 'gerente_regional'),
    []
  );
  const agencias = useMemo(() => [...AGENCIAS], []);

  useEffect(() => {
    let active = true;
    setLoadingGerencias(true);
    void fetchGerenciasArea()
      .then((items) => {
        if (!active) return;
        setGerenciasAreaSql(items);
      })
      .catch((error) => {
        console.warn('Falha ao carregar gerências de área da API.', error);
        if (!active) return;
        setGerenciasAreaSql([]);
      })
      .finally(() => {
        if (active) setLoadingGerencias(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingCoordenacoes(true);
    void fetchCoordenacoes()
      .then((items) => {
        if (!active) return;
        setCoordenacoesAllSql(items);
      })
      .catch((error) => {
        console.warn('Falha ao carregar coordenações da API.', error);
        if (!active) return;
        setCoordenacoesAllSql([]);
      })
      .finally(() => {
        if (active) setLoadingCoordenacoes(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingSupervisoes(true);
    void fetchSupervisoes()
      .then((items) => {
        if (!active) return;
        setSupervisoesAllSql(items);
      })
      .catch((error) => {
        console.warn('Falha ao carregar supervisões da API.', error);
        if (!active) return;
        setSupervisoesAllSql([]);
      })
      .finally(() => {
        if (active) setLoadingSupervisoes(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const chaveGerenciaAreaNum = Number(filters.chaveGerenciaArea);
  const chaveCoordenacaoNum = Number(filters.chaveCoordenacao);

  const coordenacoesOptions = useMemo(() => {
    if (Number.isFinite(chaveGerenciaAreaNum) && chaveGerenciaAreaNum > 0) {
      return coordenacoesAllSql.filter((item) => item.chaveGerenciaArea === Math.trunc(chaveGerenciaAreaNum));
    }
    return coordenacoesAllSql;
  }, [coordenacoesAllSql, chaveGerenciaAreaNum]);

  const supervisoesOptions = useMemo(() => {
    if (Number.isFinite(chaveCoordenacaoNum) && chaveCoordenacaoNum > 0) {
      return supervisoesAllSql.filter((item) => item.chaveCoordenacao === Math.trunc(chaveCoordenacaoNum));
    }
    return supervisoesAllSql;
  }, [supervisoesAllSql, chaveCoordenacaoNum]);

  const handleGerenciaAreaChange = (v: string) => {
    if (v === ALL) {
      onFiltersChange({
        ...filters,
        chaveGerenciaArea: '',
        chaveCoordenacao: '',
        chaveSupervisao: '',
      });
      return;
    }
    onFiltersChange({
      ...filters,
      chaveGerenciaArea: v,
      chaveCoordenacao: '',
      chaveSupervisao: '',
    });
  };

  const handleCoordenacaoChange = (v: string) => {
    if (v === ALL) {
      onFiltersChange({
        ...filters,
        chaveCoordenacao: '',
        chaveSupervisao: '',
      });
      return;
    }
    const item = coordenacoesAllSql.find((row) => String(row.chave) === v);
    onFiltersChange({
      ...filters,
      chaveCoordenacao: v,
      chaveSupervisao: '',
      chaveGerenciaArea:
        item?.chaveGerenciaArea != null && item.chaveGerenciaArea > 0
          ? String(item.chaveGerenciaArea)
          : filters.chaveGerenciaArea,
    });
  };

  const handleSupervisaoChange = (v: string) => {
    if (v === ALL) {
      onFiltersChange({
        ...filters,
        chaveSupervisao: '',
      });
      return;
    }
    const item = supervisoesAllSql.find((row) => String(row.chave) === v);
    onFiltersChange({
      ...filters,
      chaveSupervisao: v,
      chaveCoordenacao:
        item?.chaveCoordenacao != null && item.chaveCoordenacao > 0
          ? String(item.chaveCoordenacao)
          : filters.chaveCoordenacao,
      chaveGerenciaArea:
        item?.chaveGerenciaArea != null && item.chaveGerenciaArea > 0
          ? String(item.chaveGerenciaArea)
          : filters.chaveGerenciaArea,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-map-primary shrink-0" />
          Estrutura comercial
        </h2>
        <p className="text-sm text-muted-foreground">
          Filtre por nível hierárquico. Gerente Comercial III e Gerente Comercial podem ser escolhidos
          diretamente; ao selecionar um Gerente Comercial, os níveis acima são preenchidos automaticamente.
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
          label="Gerente de Gestão"
          value={filters.chaveGerenciaArea || ALL}
          onChange={handleGerenciaAreaChange}
          options={gerenciasAreaSql.map((item) => ({
            value: String(item.chave),
            label: `${item.chave} - ${item.descricao}`,
          }))}
          disabled={loadingGerencias}
        />

        <Field
          label="Gerente Comercial III"
          value={filters.chaveCoordenacao || ALL}
          onChange={handleCoordenacaoChange}
          options={coordenacoesOptions.map((item) => ({
            value: String(item.chave),
            label: `${item.chave} - ${item.descricao}`,
          }))}
          disabled={loadingCoordenacoes}
        />

        <Field
          label="Gerente Comercial"
          value={filters.chaveSupervisao || ALL}
          onChange={handleSupervisaoChange}
          options={supervisoesOptions.map((item) => ({
            value: String(item.chave),
            label: `${item.chave} - ${item.descricao}`,
          }))}
          disabled={loadingSupervisoes}
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
