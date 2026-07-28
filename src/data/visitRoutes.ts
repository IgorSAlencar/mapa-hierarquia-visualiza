import type { OpportunitySnapshot } from '@/data/opportunities';
import type { ChecklistStatus } from '@/lib/mapDataApi';

export type VisitOperationalStatus =
  | 'PENDENTE'
  | 'EM_ANDAMENTO'
  | 'REALIZADA'
  | 'NAO_REALIZADA'
  | 'REAGENDADA'
  | 'CANCELADA';

export type VisitStopStatus =
  | 'concluida'
  | 'pendente'
  | 'em_andamento'
  | 'nao_realizada'
  | 'reagendada'
  | 'cancelada';

export interface VisitStop {
  id: number;
  ordem: number;
  nome: string;
  horario: string;
  status: VisitStopStatus;
  endereco: string;
  cep: string;
  produtoFoco: string;
  focos?: string[];
  oportunidades?: OpportunitySnapshot;
  chaveLoja?: string | null;
  codAg?: string | null;
  nomeAg?: string | null;
  statusTablet?: string | null;
  checklist?: ChecklistStatus | null;
  municipio?: string | null;
  uf?: string | null;
  ultimaVisita: string;
  proximaAcao: string;
  lat: number;
  lng: number;
  active?: boolean;
  currentVisitId?: string | null;
  visitStatus?: VisitOperationalStatus | null;
  visitRowVersion?: string | null;
  productProgress?: { treated: number; total: number };
}

export interface VisitRouteDurationBreakdown {
  travelMinutes: number;
  visitMinutes: number;
  minutesPerVisit: number;
  source: 'calculated' | 'approximate' | 'planned';
}

export interface VisitRouteOwner {
  funcional: string;
  nome: string;
  chaveSupervisao: number;
  descricaoSupervisao?: string | null;
  chaveCoordenacao?: number | null;
  descricaoCoordenacao?: string | null;
  nomeCoordenador?: string | null;
}

export interface VisitRouteSaveMetadata {
  version: number;
  savedAt: string;
  createdByFuncional: string;
  createdByName: string;
}

export interface VisitRoute {
  id: string;
  chaveSupervisao: number;
  gerenteComercial: string;
  nome: string;
  data: string;
  plannedDate?: string;
  distanciaKm: number;
  distanceMeters?: number;
  duracaoEstimada: string;
  durationBreakdown?: VisitRouteDurationBreakdown;
  stops: VisitStop[];
  origin?: { nome: string; lat: number; lng: number };
  destination?: { nome: string; lat: number; lng: number };
  routeGeometry?: [number, number][];
  owner?: VisitRouteOwner;
  saved?: VisitRouteSaveMetadata;
  managementStatus?: string;
  priority?: 'BAIXA' | 'NORMAL' | 'ALTA' | 'CRITICA';
  orientation?: string | null;
  rowVersion?: string | null;
}
