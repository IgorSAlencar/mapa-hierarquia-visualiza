import React from 'react';
import { Building2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  FILTROS_INICIAIS,
  type FiltrosEstrutura,
  listarAgenciasFiltradas,
  listarCoordenadores,
  listarDiretorias,
  listarGerentesArea,
  listarGerentesRegionais,
  listarSupervisores,
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
  const diretorias = listarDiretorias();
  const gerentesRegionais = listarGerentesRegionais(filters.diretoriaRegionalId);
  const gerentesArea = listarGerentesArea(filters.gerenteRegionalId);
  const coordenadores = listarCoordenadores(filters.gerenteAreaId);
  const supervisores = listarSupervisores(filters.coordenadorId);
  const agencias = listarAgenciasFiltradas(filters);

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
              ...FILTROS_INICIAIS,
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
              gerenteAreaId: '',
              coordenadorId: '',
              supervisorId: '',
              agenciaId: '',
            })
          }
          options={gerentesRegionais.map((p) => ({ value: p.id, label: p.nome }))}
          disabled={!filters.diretoriaRegionalId}
        />

        <Field
          label="Gerente de Área"
          value={filters.gerenteAreaId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              gerenteAreaId: v === ALL ? '' : v,
              coordenadorId: '',
              supervisorId: '',
              agenciaId: '',
            })
          }
          options={gerentesArea.map((p) => ({ value: p.id, label: p.nome }))}
          disabled={!filters.gerenteRegionalId}
        />

        <Field
          label="Coordenador"
          value={filters.coordenadorId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              coordenadorId: v === ALL ? '' : v,
              supervisorId: '',
              agenciaId: '',
            })
          }
          options={coordenadores.map((p) => ({ value: p.id, label: p.nome }))}
          disabled={!filters.gerenteAreaId}
        />

        <Field
          label="Supervisor"
          value={filters.supervisorId || ALL}
          onChange={(v) =>
            onFiltersChange({
              ...filters,
              supervisorId: v === ALL ? '' : v,
              agenciaId: '',
            })
          }
          options={supervisores.map((p) => ({ value: p.id, label: p.nome }))}
          disabled={!filters.coordenadorId}
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
          disabled={agencias.length === 0}
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
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default CommercialStructureFilters;
