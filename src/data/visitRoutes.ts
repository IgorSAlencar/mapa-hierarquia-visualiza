import type { OpportunitySnapshot } from '@/data/opportunities';

export type VisitStopStatus = 'concluida' | 'pendente';

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
  ultimaVisita: string;
  proximaAcao: string;
  lat: number;
  lng: number;
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
}

