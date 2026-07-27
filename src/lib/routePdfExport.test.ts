import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { buildRoutePdf, routePdfFilename } from './routePdfExport.ts';
import type { VisitRoute } from '../data/visitRoutes.ts';

function sampleRoute(stopCount = 3): VisitRoute {
  return {
    id: 'test-route',
    chaveSupervisao: 7,
    gerenteComercial: 'Gerente Teste',
    nome: 'Roteiro Centro',
    data: '21/07/2026',
    plannedDate: '2026-07-21',
    distanciaKm: 12,
    duracaoEstimada: '3h',
    durationBreakdown: { travelMinutes: 60, visitMinutes: 120, minutesPerVisit: 40, source: 'calculated' },
    destination: { nome: 'Agência Centro', lat: -23.55, lng: -46.63 },
    stops: Array.from({ length: stopCount }, (_, index) => ({
      id: index + 1,
      ordem: index + 1,
      nome: `Loja ${index + 1}`,
      horario: '09:00',
      status: 'pendente',
      endereco: 'Rua Comercial, 100',
      cep: '',
      produtoFoco: 'Relacionamento',
      oportunidades: {
        oportunidadeCielo: true,
        oportunidadeCredito: false,
        oportunidadeNegocio: true,
        oportunidadeAtivoPade: false,
        oportunidadePropostaValor: true,
      },
      chaveLoja: String(index + 1),
      codAg: '123',
      ultimaVisita: '',
      proximaAcao: 'Realizar visita comercial',
      lat: -23.5,
      lng: -46.6,
    })),
  };
}

test('gera capa e duas fichas de loja por página A4', async () => {
  const bytes = await buildRoutePdf(sampleRoute(3), {
    '1': {
      current: null,
      previous: null,
      certification: {
        status: 'CERTIFICAÇÃO OK - PENDENTE RENOVAÇÃO',
        people: [
          {
            name: 'Pessoa Certificada',
            cpf: '123',
            status: 'CERTIFICAÇÃO OK - PENDENTE RENOVAÇÃO',
            certificationDate: '2021-08-10T00:00:00.000Z',
            expirationDate: '2026-08-10T00:00:00.000Z',
          },
        ],
      },
    },
    '2': {
      current: null,
      previous: null,
      certification: {
        status: 'BLOQUEADO - SEM CERTIFICAÇÃO',
        people: [],
      },
    },
  });
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 3);
  for (const page of document.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.1);
  }
});

test('gera nome de arquivo com destino e data curta', () => {
  assert.equal(routePdfFilename(sampleRoute(1)), 'Roteiro Agência Centro - 21.07.pdf');
});
