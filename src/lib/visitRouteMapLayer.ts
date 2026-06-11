import type mapboxgl from 'mapbox-gl';
import type { VisitRoute } from '@/data/visitRoutesMock';

/**
 * Camada de roteiro de visitas: linha azul ligando as paradas + círculos
 * numerados coloridos por status. Mantida fora do MapComponent para não
 * inchar o arquivo principal.
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

function buildFeatureCollection(route: VisitRoute): GeoJSON.FeatureCollection {
  const coordinates = route.stops.map((stop) => [stop.lng, stop.lat] as [number, number]);
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
  return { type: 'FeatureCollection', features: [line, ...points] };
}

function ensureLayers(m: mapboxgl.Map): void {
  if (!m.getSource(SOURCE_ID)) {
    m.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
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
          ['get', 'status'],
          'concluida',
          STATUS_COLOR.concluida,
          'pendente',
          STATUS_COLOR.pendente,
          ROUTE_LINE_COLOR,
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

export function removeVisitRouteFromMap(m: mapboxgl.Map): void {
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
    removeVisitRouteFromMap(m);
    return;
  }

  try {
    ensureLayers(m);
    ensureInteractions(m);

    const src = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(buildFeatureCollection(route));

    const highlight: number | mapboxgl.ExpressionSpecification =
      selectedStopId == null
        ? 10
        : ['case', ['==', ['get', 'stopId'], selectedStopId], 14, 10];
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
  if (route.stops.length === 0) return null;
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
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
