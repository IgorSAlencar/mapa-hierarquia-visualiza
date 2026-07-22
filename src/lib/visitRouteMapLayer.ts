import type mapboxgl from 'mapbox-gl';
import type { VisitRoute } from '@/data/visitRoutes';
import { fetchDrivingGeometry, getCachedDrivingGeometry } from '@/lib/mapboxDirections';

/**
 * Camada de roteiro de visitas: linha azul ligando as paradas + círculos
 * numerados coloridos por status. Mantida fora do MapComponent para não
 * inchar o arquivo principal.
 *
 * A linha usa a Mapbox Directions API para seguir as ruas; enquanto a
 * resposta não chega (ou se falhar), mostra a ligação reta entre paradas.
 */

const SOURCE_ID = 'visit-route';
const LINE_LAYER_ID = 'visit-route-line';
const STOP_CIRCLE_LAYER_ID = 'visit-route-stops';
const STOP_NUMBER_LAYER_ID = 'visit-route-stop-numbers';

const STATUS_COLOR: Record<string, string> = {
  concluida: '#10b981',
  pendente: '#f59e0b',
};

const ROUTE_LINE_COLOR = '#3b82f6';

const ROUTE_LAYER_IDS = [
  LINE_LAYER_ID,
  STOP_CIRCLE_LAYER_ID,
  STOP_NUMBER_LAYER_ID,
] as const;

type StopClickHandler = (stopId: number) => void;

const registeredHandlers = new WeakMap<
  mapboxgl.Map,
  {
    click: (e: mapboxgl.MapLayerMouseEvent) => void;
    enter: () => void;
    leave: () => void;
  }
>();

const stopClickCallbacks = new WeakMap<mapboxgl.Map, StopClickHandler>();

/** Id do roteiro exibido em cada mapa, para descartar respostas atrasadas da Directions API. */
const activeRouteIds = new WeakMap<mapboxgl.Map, string>();

/**
 * Chave dos dados desenhados por mapa (`roteiro:tipoDeLinha`). Evita
 * reprocessar o GeoJSON quando só a parada selecionada mudou.
 */
const renderedDataKeys = new WeakMap<mapboxgl.Map, string>();

/** Aceita array de [lng,lat] ou GeoJSON LineString vindo do banco. */
function normalizeRouteGeometry(
  value: VisitRoute['routeGeometry'] | GeoJSON.LineString | null | undefined
): [number, number][] | null {
  if (!value) return null;
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && 'coordinates' in value && Array.isArray(value.coordinates)
      ? value.coordinates
      : null;
  if (!raw || raw.length < 2) return null;
  const coordinates: [number, number][] = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    coordinates.push([lng, lat]);
  }
  return coordinates.length >= 2 ? coordinates : null;
}

function buildFeatureCollection(
  route: VisitRoute,
  lineCoordinates?: [number, number][]
): GeoJSON.FeatureCollection {
  const isDistanceAnalysis = route.id.startsWith('analise-distancia-');
  const stopCoordinates = route.stops.map((stop) => [stop.lng, stop.lat] as [number, number]);
  const coordinates = lineCoordinates ?? [
    ...(route.origin ? [[route.origin.lng, route.origin.lat] as [number, number]] : []),
    ...stopCoordinates,
    ...(route.destination ? [[route.destination.lng, route.destination.lat] as [number, number]] : []),
  ];
  const line: GeoJSON.Feature = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: { kind: 'route-line' },
  };
  const points: GeoJSON.Feature[] = route.stops.map((stop) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
    properties: {
      kind: 'route-stop',
      stopId: stop.id,
      ordem: String(stop.ordem),
      status: stop.status,
    },
  }));
  if (route.origin) {
    points.unshift({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [route.origin.lng, route.origin.lat] },
      properties: {
        kind: 'route-origin',
        ordem: isDistanceAnalysis ? 'A' : 'I',
        status: 'origem',
        nome: route.origin.nome,
      },
    });
  }
  if (route.destination) {
    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [route.destination.lng, route.destination.lat] },
      properties: {
        kind: 'route-destination',
        ordem: isDistanceAnalysis ? 'B' : 'F',
        status: 'destino',
        nome: route.destination.nome,
      },
    });
  }
  return {
    type: 'FeatureCollection',
    features: [...(coordinates.length >= 2 ? [line] : []), ...points],
  };
}

function ensureLayers(m: mapboxgl.Map): void {
  if (!m.getSource(SOURCE_ID)) {
    m.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    // Fonte recriada (primeira vez ou troca de estilo): força novo setData.
    renderedDataKeys.delete(m);
  }

  if (!m.getLayer(LINE_LAYER_ID)) {
    m.addLayer({
      id: LINE_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      slot: 'top',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ROUTE_LINE_COLOR,
        'line-width': 3,
        'line-opacity': 0.9,
      },
    });
  }

  if (!m.getLayer(STOP_CIRCLE_LAYER_ID)) {
    m.addLayer({
      id: STOP_CIRCLE_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      slot: 'top',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 10,
        'circle-color': [
          'match',
          ['get', 'kind'],
          'route-origin',
          '#2563eb',
          'route-destination',
          '#10b981',
          [
            'match',
            ['get', 'status'],
            'concluida',
            STATUS_COLOR.concluida,
            'pendente',
            STATUS_COLOR.pendente,
            ROUTE_LINE_COLOR,
          ],
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }

  if (!m.getLayer(STOP_NUMBER_LAYER_ID)) {
    m.addLayer({
      id: STOP_NUMBER_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      slot: 'top',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'ordem'],
        'text-size': 11,
        'text-allow-overlap': true,
        'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
      },
      paint: {
        'text-color': '#ffffff',
      },
    });
  }
}

/** Standard ilumina o basemap; sem emissive a rota “some” (fica preta). */
function applyRouteEmissive(m: mapboxgl.Map): void {
  try {
    m.setPaintProperty(LINE_LAYER_ID, 'line-emissive-strength', 1);
  } catch {
    /* estilo clássico sem emissive */
  }
  try {
    m.setPaintProperty(STOP_CIRCLE_LAYER_ID, 'circle-emissive-strength', 1);
  } catch {
    /* estilo clássico sem emissive */
  }
  try {
    m.setPaintProperty(STOP_NUMBER_LAYER_ID, 'text-emissive-strength', 1);
  } catch {
    /* estilo clássico sem emissive */
  }
}

/**
 * A limpeza da rota esconde as camadas antes de removê-las. Durante uma troca
 * de estilo, o Mapbox pode aceitar o `visibility: none` e falhar na remoção;
 * nesse caso a próxima rota reutilizava camadas ainda invisíveis. Reaplicamos
 * a visibilidade e a ordem em toda sincronização, inclusive para camadas que
 * sobreviveram à troca de estilo.
 */
function showRouteLayers(m: mapboxgl.Map): void {
  for (const layerId of ROUTE_LAYER_IDS) {
    if (!m.getLayer(layerId)) continue;
    m.setLayoutProperty(layerId, 'visibility', 'visible');

    // No Mapbox Standard, o slot `top` mantém a rota acima do mapa-base.
    // Em estilos clássicos, `moveLayer` cumpre a mesma função.
    try {
      m.setSlot(layerId, 'top');
    } catch {
      /* o estilo atual não utiliza slots */
    }
    try {
      m.moveLayer(layerId);
    } catch {
      /* a ordem pode estar temporariamente bloqueada durante style.load */
    }
  }
  applyRouteEmissive(m);
}

function ensureInteractions(m: mapboxgl.Map): void {
  if (registeredHandlers.has(m)) return;

  const click = (e: mapboxgl.MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    const stopId = Number(feature?.properties?.stopId);
    if (!Number.isFinite(stopId)) return;
    stopClickCallbacks.get(m)?.(stopId);
  };
  const enter = () => {
    m.getCanvas().style.cursor = 'pointer';
  };
  const leave = () => {
    m.getCanvas().style.cursor = '';
  };

  m.on('click', STOP_CIRCLE_LAYER_ID, click);
  m.on('mouseenter', STOP_CIRCLE_LAYER_ID, enter);
  m.on('mouseleave', STOP_CIRCLE_LAYER_ID, leave);
  registeredHandlers.set(m, { click, enter, leave });
}

/**
 * Busca o trajeto pelas ruas (Directions API) e, quando disponível, troca a
 * linha reta pela geometria real. Se o roteiro ativo mudar antes da resposta,
 * o resultado é descartado.
 */
function applyStreetGeometry(m: mapboxgl.Map, route: VisitRoute): void {
  const stops = [
    ...(route.origin ? [[route.origin.lng, route.origin.lat] as [number, number]] : []),
    ...route.stops.map((stop) => [stop.lng, stop.lat] as [number, number]),
    ...(route.destination ? [[route.destination.lng, route.destination.lat] as [number, number]] : []),
  ];
  void fetchDrivingGeometry(route.id, stops).then((geometry) => {
    // Sem rota de carro possível: mantém a linha reta já desenhada.
    if (!geometry) return;
    if (activeRouteIds.get(m) !== route.id) return;
    try {
      const src = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(buildFeatureCollection(route, geometry));
      renderedDataKeys.set(m, `${route.id}:street`);
    } catch {
      /* mapa ou estilo descartado durante a requisição */
    }
  });
}

export function removeVisitRouteFromMap(m: mapboxgl.Map): void {
  activeRouteIds.delete(m);
  renderedDataKeys.delete(m);
  for (const layerId of [...ROUTE_LAYER_IDS].reverse()) {
    try {
      if (!m.getLayer(layerId)) continue;
      // Esconde primeiro para a rota sumir imediatamente, mesmo se a remocao
      // definitiva precisar aguardar a troca de estilo terminar.
      m.setLayoutProperty(layerId, 'visibility', 'none');
      m.removeLayer(layerId);
    } catch {
      /* camada recarregando; as demais ainda devem ser limpas */
    }
  }
  try {
    const source = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: [] });
    if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
  } catch {
    /* fonte recarregando */
  }
}

/**
 * Cria/atualiza (ou remove, se `route` for null) a camada do roteiro.
 * Idempotente: pode ser chamada a cada render e após troca de estilo.
 */
export function syncVisitRouteOnMap(
  m: mapboxgl.Map,
  route: VisitRoute | null,
  selectedStopId: number | null,
  onStopClick: StopClickHandler
): void {
  stopClickCallbacks.set(m, onStopClick);

  if (!route) {
    activeRouteIds.delete(m);
    removeVisitRouteFromMap(m);
    return;
  }

  activeRouteIds.set(m, route.id);

  try {
    ensureLayers(m);
    showRouteLayers(m);
    ensureInteractions(m);

    // Prioridade: geometria persistida (roteiro salvo) → cache Directions →
    // linha reta entre paradas. Em planejamento (não salvo), enquanto a API
    // não responde, omitimos a linha reta para não “piscar” o caminho errado.
    const persistedGeometry = normalizeRouteGeometry(route.routeGeometry);
    const streetGeometry = persistedGeometry ?? getCachedDrivingGeometry(route.id);
    const awaitingStreetGeometry = !streetGeometry && !route.saved;
    const lineCoordinates: [number, number][] | undefined = awaitingStreetGeometry
      ? []
      : (streetGeometry ?? undefined);
    const dataKey = `${route.id}:${persistedGeometry ? 'persisted' : streetGeometry ? 'street' : awaitingStreetGeometry ? 'pending' : 'straight'}`;

    const src = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    // Sempre reescreve o GeoJSON: confiar só na chave falha quando um sync
    // anterior marcou sucesso mas a fonte foi esvaziada no meio do fitBounds.
    src.setData(buildFeatureCollection(route, lineCoordinates));
    renderedDataKeys.set(m, dataKey);

    // Snapshot salvo não recalcula Directions (preserva o caminho histórico).
    // Sem geometria salva, a linha reta acima já cobre o "Ver rota".
    if (awaitingStreetGeometry) applyStreetGeometry(m, route);

    const baseRadius: mapboxgl.ExpressionSpecification = [
      'match',
      ['get', 'kind'],
      'route-origin',
      12,
      'route-destination',
      12,
      10,
    ];
    const highlight: number | mapboxgl.ExpressionSpecification =
      selectedStopId == null
        ? baseRadius
        : ['case', ['==', ['get', 'stopId'], selectedStopId], 14, baseRadius];
    m.setPaintProperty(STOP_CIRCLE_LAYER_ID, 'circle-radius', highlight);
    const strokeWidth: number | mapboxgl.ExpressionSpecification =
      selectedStopId == null
        ? 2
        : ['case', ['==', ['get', 'stopId'], selectedStopId], 3.5, 2];
    m.setPaintProperty(STOP_CIRCLE_LAYER_ID, 'circle-stroke-width', strokeWidth);
  } catch {
    /* estilo recarregando; o efeito reexecuta via mapReadyVersion */
  }
}

/** Bounds das paradas, para fitBounds da câmera. */
export function getVisitRouteBounds(route: VisitRoute): [[number, number], [number, number]] | null {
  const pointCount = route.stops.length + (route.origin ? 1 : 0) + (route.destination ? 1 : 0);
  if (pointCount < 2) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const stop of route.stops) {
    minLng = Math.min(minLng, stop.lng);
    minLat = Math.min(minLat, stop.lat);
    maxLng = Math.max(maxLng, stop.lng);
    maxLat = Math.max(maxLat, stop.lat);
  }
  if (route.origin) { minLng = Math.min(minLng, route.origin.lng); minLat = Math.min(minLat, route.origin.lat); maxLng = Math.max(maxLng, route.origin.lng); maxLat = Math.max(maxLat, route.origin.lat); }
  if (route.destination) { minLng = Math.min(minLng, route.destination.lng); minLat = Math.min(minLat, route.destination.lat); maxLng = Math.max(maxLng, route.destination.lng); maxLat = Math.max(maxLat, route.destination.lat); }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
