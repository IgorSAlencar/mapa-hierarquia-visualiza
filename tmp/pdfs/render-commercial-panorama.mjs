import { writeFile } from 'node:fs/promises';
import { buildRoutePdf } from '../../src/lib/routePdfExport.ts';

const route = {
  id: 'visual-review',
  chaveSupervisao: 7,
  gerenteComercial: 'Gerente Comercial',
  nome: 'Roteiro Centro',
  data: '29/07/2026',
  plannedDate: '2026-07-29',
  distanciaKm: 18.4,
  duracaoEstimada: '3h 20m',
  durationBreakdown: {
    travelMinutes: 80,
    visitMinutes: 120,
    minutesPerVisit: 60,
    source: 'calculated',
  },
  origin: { nome: 'Agência Centro', lat: -23.55, lng: -46.63 },
  destination: { nome: 'Agência Centro', lat: -23.55, lng: -46.63 },
  stops: [
    {
      id: 1,
      ordem: 1,
      nome: 'Loja Centro',
      horario: '09:00',
      status: 'pendente',
      endereco: 'Rua Comercial, 100',
      cep: '',
      produtoFoco: 'Cielo',
      oportunidades: {
        oportunidadeCielo: true,
        oportunidadeCredito: true,
        oportunidadeNegocio: true,
        oportunidadeAtivoPade: true,
        oportunidadePropostaValor: true,
      },
      chaveLoja: '1',
      codAg: '123',
      ultimaVisita: '',
      proximaAcao: 'Realizar visita comercial',
      lat: -23.5,
      lng: -46.6,
    },
    {
      id: 2,
      ordem: 2,
      nome: 'Loja Bairro',
      horario: '11:00',
      status: 'pendente',
      endereco: 'Avenida Principal, 200',
      cep: '',
      produtoFoco: 'Cielo, Crédito',
      oportunidades: {
        oportunidadeCielo: false,
        oportunidadeCredito: true,
        oportunidadeNegocio: true,
        oportunidadeAtivoPade: true,
        oportunidadePropostaValor: false,
      },
      chaveLoja: '2',
      codAg: '123',
      ultimaVisita: '',
      proximaAcao: 'Realizar visita comercial',
      lat: -23.51,
      lng: -46.61,
    },
  ],
};

const bytes = await buildRoutePdf(route, {}, new Date('2026-07-29T12:00:00-03:00'));
await writeFile(new URL('./panorama-comercial.pdf', import.meta.url), bytes);
