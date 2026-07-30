import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import type mapboxgl from 'mapbox-gl';
import type { VisitRoute } from '../data/visitRoutes.ts';

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const layer = await vite.ssrLoadModule('/src/lib/visitRouteMapLayer.ts') as typeof import(
  './visitRouteMapLayer.ts'
);

after(async () => {
  await vite.close();
});

function makeRoute(
  id: string,
  chaveSupervisao: number,
  plannedDate: string,
  offset = 0
): VisitRoute {
  return {
    id,
    chaveSupervisao,
    gerenteComercial: `Gerente ${id}`,
    nome: `Rota ${id}`,
    data: plannedDate,
    plannedDate,
    distanciaKm: 10,
    duracaoEstimada: '1h',
    saved: {
      version: 1,
      savedAt: `${plannedDate}T12:00:00.000Z`,
      createdByFuncional: '123',
      createdByName: 'Admin',
    },
    origin: { nome: 'Origem', lng: -48 + offset, lat: -16 + offset },
    destination: { nome: 'Destino', lng: -47.5 + offset, lat: -15.5 + offset },
    routeGeometry: [
      [-48 + offset, -16 + offset],
      [-47.75 + offset, -15.75 + offset],
      [-47.5 + offset, -15.5 + offset],
    ],
    stops: [
      {
        id: 1,
        ordem: 1,
        nome: `Loja ${id}`,
        horario: '09:00',
        status: 'pendente',
        endereco: '',
        cep: '',
        produtoFoco: '',
        ultimaVisita: '',
        proximaAcao: '',
        lng: -47.75 + offset,
        lat: -15.75 + offset,
      },
    ],
  };
}

type Handler = (event: mapboxgl.MapLayerMouseEvent) => void;

function createMapMock() {
  const sources = new Map<string, { data: GeoJSON.FeatureCollection; setData(data: GeoJSON.FeatureCollection): void }>();
  const layers = new Map<string, mapboxgl.AnyLayer>();
  const handlers = new Map<string, Handler>();
  const paint = new Map<string, unknown>();
  const offCalls: string[] = [];
  const canvas = { style: { cursor: '' } };

  const map = {
    addSource(id: string, definition: { data: GeoJSON.FeatureCollection }) {
      const source = {
        data: definition.data,
        setData(data: GeoJSON.FeatureCollection) {
          source.data = data;
        },
      };
      sources.set(id, source);
    },
    getSource(id: string) {
      return sources.get(id);
    },
    removeSource(id: string) {
      sources.delete(id);
    },
    addLayer(definition: mapboxgl.AnyLayer) {
      layers.set(definition.id, definition);
    },
    getLayer(id: string) {
      return layers.get(id);
    },
    removeLayer(id: string) {
      layers.delete(id);
    },
    setPaintProperty(layerId: string, property: string, value: unknown) {
      paint.set(`${layerId}:${property}`, value);
    },
    setLayoutProperty() {},
    setSlot() {},
    moveLayer() {},
    getCanvas() {
      return canvas;
    },
    on(event: string, layerId: string | string[], handler: Handler) {
      handlers.set(`${event}:${layerId}`, handler);
    },
    off(event: string, layerId: string | string[]) {
      handlers.delete(`${event}:${layerId}`);
      offCalls.push(`${event}:${layerId}`);
    },
  } as unknown as mapboxgl.Map;

  return { map, sources, layers, handlers, paint, offCalls };
}

test('gera coleção multi-rota com identidade, cor e chave de parada composta', () => {
  const first = makeRoute('rota-a', 101, '2026-07-28');
  const second = makeRoute('rota-b', 202, '2026-07-29', 2);
  const collection = layer.buildVisitRoutesFeatureCollection([
    { route: first, color: '#ef4444' },
    { route: second, color: '#22c55e' },
  ]);

  const lines = collection.features.filter((feature) => feature.properties?.kind === 'route-line');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].geometry, {
    type: 'LineString',
    coordinates: first.routeGeometry,
  });
  assert.deepEqual(lines[0].properties, {
    routeId: 'rota-a',
    chaveSupervisao: 101,
    plannedDate: '2026-07-28',
    color: '#ef4444',
    kind: 'route-line',
  });

  const stops = collection.features.filter((feature) => feature.properties?.kind === 'route-stop');
  assert.equal(stops[0].properties?.stopKey, 'rota-a:1');
  assert.equal(stops[1].properties?.stopKey, 'rota-b:1');
  assert.equal(stops[0].properties?.markerColor, '#ef4444');
  assert.equal(stops[1].properties?.markerColor, '#22c55e');
  assert.notEqual(stops[0].properties?.stopKey, stops[1].properties?.stopKey);

  const firstRoutePoints = collection.features.filter(
    (feature) => feature.properties?.routeId === 'rota-a' && feature.geometry.type === 'Point'
  );
  assert.deepEqual(
    firstRoutePoints.map((feature) => feature.properties?.ordem),
    ['I', '1', 'F']
  );
});

test('calcula bounds combinados e ignora coordenadas inválidas', () => {
  const first = makeRoute('rota-a', 101, '2026-07-28');
  const second = makeRoute('rota-b', 202, '2026-07-29', 2);
  second.stops.push({ ...second.stops[0], id: 2, lng: Number.NaN, lat: Number.NaN });

  assert.deepEqual(
    layer.getVisitRoutesBounds([
      { route: first, color: '#ef4444' },
      { route: second, color: '#22c55e' },
    ]),
    [[-48, -16], [-45.5, -13.5]]
  );
  assert.equal(layer.getVisitRoutesBounds([]), null);
});

test('sincroniza estilos, identifica cliques de linha/parada e limpa handlers', () => {
  const route = makeRoute('rota-a', 101, '2026-07-28');
  const mock = createMapMock();
  const clicks: Array<{
    kind: 'route' | 'stop';
    routeId: string;
    stopId: number | null;
    stopKey: string | null;
  }> = [];

  layer.syncVisitRoutesOnMap(
    mock.map,
    [{ route, color: '#ef4444' }],
    'rota-a',
    'rota-a:1',
    (feature) => clicks.push(feature)
  );

  const source = mock.sources.get('visit-route');
  assert.ok(source);
  assert.equal(source.data.features.length, 4);
  assert.deepEqual(mock.paint.get('visit-route-line:line-width'), [
    'case',
    ['==', ['get', 'routeId'], 'rota-a'],
    5,
    2.5,
  ]);

  const featureClick = mock.handlers.get('click:visit-route-stops,visit-route-line');
  featureClick?.({
    features: [{
      properties: {
        kind: 'route-stop',
        routeId: 'rota-a',
        stopId: 1,
        stopKey: 'rota-a:1',
      },
    }],
  } as unknown as mapboxgl.MapLayerMouseEvent);
  featureClick?.({
    features: [{ properties: { kind: 'route-line', routeId: 'rota-a' } }],
  } as unknown as mapboxgl.MapLayerMouseEvent);
  assert.deepEqual(clicks, [
    { kind: 'stop', routeId: 'rota-a', stopId: 1, stopKey: 'rota-a:1' },
    { kind: 'route', routeId: 'rota-a', stopId: null, stopKey: null },
  ]);

  layer.removeVisitRouteFromMap(mock.map);
  assert.equal(mock.sources.size, 0);
  assert.equal(mock.layers.size, 0);
  assert.equal(mock.handlers.size, 0);
  assert.equal(mock.offCalls.length, 3);
  assert.doesNotThrow(() => layer.removeVisitRouteFromMap(mock.map));
});

test('mostra início, ordem e fim de todas as rotas logo após aplicar no mapa', () => {
  const route = makeRoute('rota-a', 101, '2026-07-28');
  const mock = createMapMock();

  layer.syncVisitRoutesOnMap(
    mock.map,
    [{ route, color: '#2563eb' }],
    null,
    null,
    () => undefined
  );

  assert.deepEqual(mock.paint.get('visit-route-stops:circle-radius'), [
    'match',
    ['get', 'kind'],
    'route-origin',
    12,
    'route-destination',
    12,
    10,
  ]);
  assert.equal(mock.paint.get('visit-route-stops:circle-opacity'), 1);
  assert.equal(mock.paint.get('visit-route-stop-numbers:text-opacity'), 1);
});

test('mantém callback numérico da API single-route', () => {
  const route = makeRoute('rota-legada', 303, '2026-07-29');
  const mock = createMapMock();
  const stops: number[] = [];

  layer.syncVisitRouteOnMap(mock.map, route, 1, (stopId) => stops.push(stopId));
  mock.handlers.get('click:visit-route-stops,visit-route-line')?.({
    features: [{
      properties: {
        kind: 'route-stop',
        routeId: route.id,
        stopId: 1,
        stopKey: `${route.id}:1`,
      },
    }],
  } as unknown as mapboxgl.MapLayerMouseEvent);

  assert.deepEqual(stops, [1]);
  assert.deepEqual(mock.paint.get('visit-route-stops:circle-radius'), [
    'case',
    ['==', ['get', 'stopKey'], 'rota-legada:1'],
    14,
    ['match', ['get', 'kind'], 'route-origin', 12, 'route-destination', 12, 10],
  ]);
});
