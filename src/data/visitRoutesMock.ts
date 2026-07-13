import type { CommercialStructureItem } from '@/lib/commercialStructureApi';

/**
 * Dados estáticos de visitas e roteiros (entrega inicial).
 * Estrutura pronta para ser substituída por uma API: basta trocar a origem
 * de `VISIT_ROUTES` mantendo os tipos abaixo.
 */

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
  ultimaVisita: string;
  proximaAcao: string;
  lat: number;
  lng: number;
}

export interface VisitRoute {
  id: string;
  /** Chave da supervisão (Gerente Comercial) dona do roteiro. */
  chaveSupervisao: number;
  gerenteComercial: string;
  nome: string;
  data: string;
  distanciaKm: number;
  duracaoEstimada: string;
  stops: VisitStop[];
  origin?: { nome: string; lat: number; lng: number };
  destination?: { nome: string; lat: number; lng: number };
}

export const VISIT_ROUTES: VisitRoute[] = [
  {
    id: 'rota-campinas-dia',
    chaveSupervisao: 300001,
    gerenteComercial: 'Ana Beatriz Souza',
    nome: 'Roteiro do dia - Campinas/SP',
    data: 'Hoje, 11 de jun. de 2026',
    distanciaKm: 128,
    duracaoEstimada: '7h 30m',
    stops: [
      {
        id: 1,
        ordem: 1,
        nome: 'Bradesco Expresso Centro - Campinas',
        horario: '09:00',
        status: 'concluida',
        endereco: 'Av. Francisco Glicério, 1280 - Centro',
        cep: 'Campinas/SP · CEP 13012-100',
        produtoFoco: 'Conta Corrente',
        ultimaVisita: '02/05/2026',
        proximaAcao: 'Revisar metas do trimestre e reforçar campanha de abertura de contas.',
        lat: -22.9035,
        lng: -47.0617,
      },
      {
        id: 2,
        ordem: 2,
        nome: 'Bradesco Expresso Taquaral - Campinas',
        horario: '10:20',
        status: 'concluida',
        endereco: 'Av. Heitor Penteado, 940 - Taquaral',
        cep: 'Campinas/SP · CEP 13075-460',
        produtoFoco: 'Empréstimos e Crédito',
        ultimaVisita: '18/04/2026',
        proximaAcao: 'Acompanhar conversão das propostas de crédito consignado.',
        lat: -22.8746,
        lng: -47.0518,
      },
      {
        id: 3,
        ordem: 3,
        nome: 'Bradesco Expresso Cambuí - Campinas',
        horario: '11:40',
        status: 'concluida',
        endereco: 'Rua Coronel Quirino, 1320 - Cambuí',
        cep: 'Campinas/SP · CEP 13025-002',
        produtoFoco: 'Seguros',
        ultimaVisita: '25/04/2026',
        proximaAcao: 'Treinar equipe da loja na oferta de seguro residencial.',
        lat: -22.8949,
        lng: -47.052,
      },
      {
        id: 4,
        ordem: 4,
        nome: 'Bradesco Expresso Valinhos',
        horario: '14:00',
        status: 'pendente',
        endereco: 'Rua Antônio Carlos, 345 - Centro',
        cep: 'Valinhos/SP · CEP 13270-000',
        produtoFoco: 'Conta Corrente',
        ultimaVisita: '12/04/2026',
        proximaAcao: 'Apresentar benefícios da Conta Corrente e campanha de isenção de tarifas.',
        lat: -22.9698,
        lng: -46.9974,
      },
      {
        id: 5,
        ordem: 5,
        nome: 'Bradesco Expresso Vinhedo',
        horario: '15:30',
        status: 'pendente',
        endereco: 'Av. Independência, 2150 - Centro',
        cep: 'Vinhedo/SP · CEP 13280-000',
        produtoFoco: 'Maquininhas',
        ultimaVisita: '30/03/2026',
        proximaAcao: 'Mapear comércios da região para oferta de maquininhas.',
        lat: -23.0302,
        lng: -46.9833,
      },
    ],
  },
  {
    id: 'rota-sp-zona-sul',
    chaveSupervisao: 300002,
    gerenteComercial: 'Carlos Eduardo Lima',
    nome: 'Roteiro do dia - São Paulo/SP (Zona Sul)',
    data: 'Hoje, 11 de jun. de 2026',
    distanciaKm: 46,
    duracaoEstimada: '5h 45m',
    stops: [
      {
        id: 1,
        ordem: 1,
        nome: 'Bradesco Expresso Pinheiros',
        horario: '09:30',
        status: 'concluida',
        endereco: 'Rua dos Pinheiros, 870 - Pinheiros',
        cep: 'São Paulo/SP · CEP 05422-001',
        produtoFoco: 'Investimentos',
        ultimaVisita: '08/05/2026',
        proximaAcao: 'Divulgar nova carteira de investimentos para clientes PJ.',
        lat: -23.5629,
        lng: -46.6916,
      },
      {
        id: 2,
        ordem: 2,
        nome: 'Bradesco Expresso Vila Mariana',
        horario: '11:00',
        status: 'concluida',
        endereco: 'Rua Domingos de Morais, 2120 - Vila Mariana',
        cep: 'São Paulo/SP · CEP 04036-000',
        produtoFoco: 'Conta Corrente',
        ultimaVisita: '22/04/2026',
        proximaAcao: 'Acompanhar ranking de aberturas e reconhecer a equipe da loja.',
        lat: -23.588,
        lng: -46.6346,
      },
      {
        id: 3,
        ordem: 3,
        nome: 'Bradesco Expresso Moema',
        horario: '13:30',
        status: 'pendente',
        endereco: 'Av. Ibirapuera, 2540 - Moema',
        cep: 'São Paulo/SP · CEP 04028-002',
        produtoFoco: 'Consórcios',
        ultimaVisita: '15/04/2026',
        proximaAcao: 'Apresentar simulador de consórcio de veículos.',
        lat: -23.601,
        lng: -46.6633,
      },
      {
        id: 4,
        ordem: 4,
        nome: 'Bradesco Expresso Santo Amaro',
        horario: '15:00',
        status: 'pendente',
        endereco: 'Rua Amador Bueno, 389 - Santo Amaro',
        cep: 'São Paulo/SP · CEP 04752-005',
        produtoFoco: 'Bradesco Expresso',
        ultimaVisita: '05/04/2026',
        proximaAcao: 'Verificar pendências de credenciamento do correspondente.',
        lat: -23.6549,
        lng: -46.708,
      },
    ],
  },
];

export function getRouteForSupervisao(chaveSupervisao: number): VisitRoute | null {
  return VISIT_ROUTES.find((route) => route.chaveSupervisao === chaveSupervisao) ?? null;
}

/**
 * Hierarquia de contingência usada apenas quando a API de estrutura comercial
 * está indisponível, para que o painel continue demonstrável.
 */
export const FALLBACK_GERENCIAS: CommercialStructureItem[] = [
  { chave: 100001, descricao: 'GG SÃO PAULO INTERIOR' },
  { chave: 100002, descricao: 'GG SÃO PAULO CAPITAL' },
];

export const FALLBACK_COORDENACOES: CommercialStructureItem[] = [
  { chave: 200001, descricao: 'GC III CAMPINAS E REGIÃO', chaveGerenciaArea: 100001 },
  { chave: 200002, descricao: 'GC III SP ZONA SUL', chaveGerenciaArea: 100002 },
];

export const FALLBACK_SUPERVISOES: CommercialStructureItem[] = [
  { chave: 300001, descricao: 'GC CAMPINAS CENTRO', chaveCoordenacao: 200001, chaveGerenciaArea: 100001 },
  { chave: 300002, descricao: 'GC SP ZONA SUL', chaveCoordenacao: 200002, chaveGerenciaArea: 100002 },
  { chave: 300003, descricao: 'GC JUNDIAÍ', chaveCoordenacao: 200001, chaveGerenciaArea: 100001 },
  { chave: 300004, descricao: 'GC SOROCABA', chaveCoordenacao: 200001, chaveGerenciaArea: 100001 },
];
