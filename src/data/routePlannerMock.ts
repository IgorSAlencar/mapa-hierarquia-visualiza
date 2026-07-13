import { MOCK_REGION_AGENCIAS, MOCK_REGION_LOJAS } from '@/data/regionMapPointsMock';
import type { VisitRoute, VisitStop } from '@/data/visitRoutesMock';

export type StoreScore = 'otimo' | 'atencao' | 'alerta';

export interface PlannerStore {
  id: string;
  nome: string;
  municipio: string;
  uf: string;
  lngLat: [number, number];
  pilares: { cielo: boolean; credito: boolean; negocio: boolean; pade: boolean; propostaValor: boolean };
  diasSemVisita: number;
}

const STORE_CONTEXT: Record<string, Omit<PlannerStore, 'id' | 'nome' | 'uf' | 'lngLat'>> = {
  'Loja Higienópolis': { municipio: 'São Paulo', pilares: { cielo: true, credito: true, negocio: true, pade: true, propostaValor: true }, diasSemVisita: 12 },
  'Loja Moema': { municipio: 'São Paulo', pilares: { cielo: true, credito: false, negocio: true, pade: true, propostaValor: false }, diasSemVisita: 31 },
  'Loja Campinas Shopping': { municipio: 'Campinas', pilares: { cielo: false, credito: true, negocio: false, pade: true, propostaValor: false }, diasSemVisita: 43 },
  'Loja Barra': { municipio: 'Rio de Janeiro', pilares: { cielo: true, credito: true, negocio: true, pade: false, propostaValor: false }, diasSemVisita: 26 },
  'Loja Tijuca': { municipio: 'Rio de Janeiro', pilares: { cielo: true, credito: true, negocio: true, pade: true, propostaValor: true }, diasSemVisita: 9 },
  'Loja Paralela': { municipio: 'Salvador', pilares: { cielo: false, credito: false, negocio: true, pade: false, propostaValor: false }, diasSemVisita: 51 },
  'Loja Feira de Santana': { municipio: 'Feira de Santana', pilares: { cielo: true, credito: true, negocio: false, pade: true, propostaValor: false }, diasSemVisita: 35 },
  'Loja Pampulha': { municipio: 'Belo Horizonte', pilares: { cielo: true, credito: false, negocio: true, pade: false, propostaValor: false }, diasSemVisita: 39 },
  'Loja Juiz de Fora': { municipio: 'Juiz de Fora', pilares: { cielo: false, credito: false, negocio: true, pade: false, propostaValor: false }, diasSemVisita: 48 },
};

export const PLANNER_AGENCIES = MOCK_REGION_AGENCIAS;
export const PLANNER_STORES: PlannerStore[] = MOCK_REGION_LOJAS.map((store) => ({
  id: store.id,
  nome: store.nome,
  uf: store.uf ?? '',
  lngLat: store.lngLat,
  ...STORE_CONTEXT[store.nome],
}));

export function scoreStore(store: PlannerStore): StoreScore {
  const active = Object.values(store.pilares).filter(Boolean).length;
  return active === 5 ? 'otimo' : active >= 3 ? 'atencao' : 'alerta';
}

export function missingPillars(store: PlannerStore): string[] {
  const labels = { cielo: 'Cielo', credito: 'Crédito', negocio: 'Negócio', pade: 'PADE', propostaValor: 'Proposta de Valor' };
  return (Object.keys(store.pilares) as Array<keyof PlannerStore['pilares']>)
    .filter((key) => !store.pilares[key])
    .map((key) => labels[key]);
}

export function priorityForStore(store: PlannerStore): number {
  const scoreWeight = { alerta: 60, atencao: 35, otimo: 10 }[scoreStore(store)];
  return scoreWeight + Math.min(35, store.diasSemVisita);
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Ordenação demonstrativa; em produção, substitua pela Optimization API v2. */
export function createSuggestedRoute(
  date: string,
  originId: string,
  destination: string,
  selectedIds: string[],
  agencies = PLANNER_AGENCIES
): VisitRoute | null {
  const origin = agencies.find((agency) => agency.id === originId);
  const selected = PLANNER_STORES.filter((store) => selectedIds.includes(store.id));
  if (!origin || selected.length === 0) return null;

  const ordered: PlannerStore[] = [];
  let current = origin.lngLat;
  const remaining = [...selected];
  while (remaining.length) {
    remaining.sort((a, b) => distanceKm(current, a.lngLat) - distanceKm(current, b.lngLat));
    const next = remaining.shift()!;
    ordered.push(next);
    current = next.lngLat;
  }
  const destinationStore = PLANNER_STORES.find((store) => store.municipio === destination) ?? ordered[ordered.length - 1];
  const stops: VisitStop[] = ordered.map((store, index) => ({
    id: index + 1,
    ordem: index + 1,
    nome: store.nome,
    horario: `${String(9 + index * 2).padStart(2, '0')}:00`,
    status: 'pendente',
    endereco: `${store.municipio}/${store.uf}`,
    cep: 'Visita planejada',
    produtoFoco: missingPillars(store)[0] ?? 'Manutenção de relacionamento',
    ultimaVisita: `Há ${store.diasSemVisita} dias`,
    proximaAcao: missingPillars(store).length
      ? `Desenvolver: ${missingPillars(store).join(', ')}.`
      : 'Manter os cinco pilares ativos e registrar oportunidades.',
    lat: store.lngLat[1],
    lng: store.lngLat[0],
  }));
  const linePoints = [origin.lngLat, ...ordered.map((store) => store.lngLat), destinationStore.lngLat];
  const totalKm = linePoints.slice(1).reduce((total, point, index) => total + distanceKm(linePoints[index], point), 0);
  return {
    id: `planejado-${date}-${originId}-${selectedIds.join('-')}`,
    chaveSupervisao: 0,
    gerenteComercial: 'Meu roteiro',
    nome: `${origin.nome} → ${destination}`,
    data: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(`${date}T12:00:00`)),
    distanciaKm: Math.round(totalKm * 1.22),
    duracaoEstimada: `${Math.max(1, Math.round(totalKm * 1.22 / 45 + stops.length))}h`,
    stops,
    origin: { nome: origin.nome, lng: origin.lngLat[0], lat: origin.lngLat[1] },
    destination: { nome: destination, lng: destinationStore.lngLat[0], lat: destinationStore.lngLat[1] },
  };
}
