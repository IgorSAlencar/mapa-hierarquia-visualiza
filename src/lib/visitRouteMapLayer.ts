import type mapboxgl from 'mapbox-gl';
import type { VisitRoute } from '@/data/visitRoutesMock';
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

function buildFeatureCollection(
  route: VisitRoute,
  lineCoordinates?: [number, number][]
): GeoJSON.FeatureCollection {
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
      properties: { kind: 'route-origin', ordem: 'I', status: 'origem', nome: route.origin.nome },
    });
  }
  if (route.destination) {
    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [route.destination.lng, route.destination.lat] },
      properties: { kind: 'route-destination', ordem: 'F', status: 'destino', nome: route.destination.nome },
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
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'ordem'],
        'text-size': 11,
        'text-allow-overlap': true,
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      },
      paint: {
        'text-color': '#ffffff',
      },
    });
  }
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
  renderedDataKeys.delete(m);
  try {
    for (const layerId of [STOP_NUMBER_LAYER_ID, STOP_CIRCLE_LAYER_ID, LINE_LAYER_ID]) {
      if (m.getLayer(layerId)) m.removeLayer(layerId);
    }
    if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
  } catch {
    /* estilo recarregando */
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
    ensureInteractions(m);

    // Usa a geometria das ruas do cache se já disponível; senão, linha reta
    // imediata enquanto a Directions API responde (uma única vez por roteiro).
    const cachedGeometry = getCachedDrivingGeometry(route.id);
    const dataKey = `${route.id}:${cachedGeometry ? 'street' : 'pending'}`;

    if (renderedDataKeys.get(m) !== dataKey) {
      const src = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      // Sem geometria em cache, envia uma lista vazia para desenhar apenas
      // os markers. A linha aparece somente com o trajeto real das ruas.
      src?.setData(buildFeatureCollection(route, cachedGeometry ?? []));
      renderedDataKeys.set(m, dataKey);
    }

    if (!cachedGeometry) applyStreetGeometry(m, route);

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
