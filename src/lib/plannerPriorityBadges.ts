import type mapboxgl from 'mapbox-gl';

export type PlannerPriorityBand = 'alta' | 'media' | 'baixa';

export const PLANNER_PRIORITY_BADGE_SOURCE_ID = 'planner-priority-badges';
export const PLANNER_PRIORITY_BADGE_LAYER_IDS = [
  'planner-priority-badges-bg',
  'planner-priority-badges-icon',
] as const;

interface PlannerPriorityBadgePoint {
  id: string;
  kind: string;
  lngLat: [number, number];
}

export function buildPlannerPriorityBadgeFeatureCollection(
  points: PlannerPriorityBadgePoint[],
  classifications: Record<string, PlannerPriorityBand>
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.flatMap((point) => {
      const priorityBand = classifications[point.id];
      if (!priorityBand) return [];
      return [{
        type: 'Feature' as const,
        properties: {
          id: point.id,
          kind: point.kind,
          priority_band: priorityBand,
          priority_icon: priorityBand === 'baixa' ? '✓' : '!',
        },
        geometry: {
          type: 'Point' as const,
          coordinates: point.lngLat,
        },
      }];
    }),
  };
}

export function addPlannerPriorityBadgeLayers(map: mapboxgl.Map): void {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  if (!map.getSource(PLANNER_PRIORITY_BADGE_SOURCE_ID)) {
    map.addSource(PLANNER_PRIORITY_BADGE_SOURCE_ID, { type: 'geojson', data: empty });
  }

  const priorityColor: mapboxgl.ExpressionSpecification = [
    'match',
    ['get', 'priority_band'],
    'alta', '#dc2626',
    'media', '#f59e0b',
    'baixa', '#16a34a',
    '#64748b',
  ];
  const zoomOpacity: mapboxgl.ExpressionSpecification = [
    'interpolate', ['linear'], ['zoom'],
    4, 0,
    5, 0.42,
    8, 0.62,
    12, 0.76,
  ];

  if (!map.getLayer(PLANNER_PRIORITY_BADGE_LAYER_IDS[0])) {
    map.addLayer({
      id: PLANNER_PRIORITY_BADGE_LAYER_IDS[0],
      type: 'symbol',
      source: PLANNER_PRIORITY_BADGE_SOURCE_ID,
      minzoom: 4,
      layout: {
        'text-field': '●',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 7, 7, 9, 11, 12, 14, 14],
        'text-offset': [0.55, -0.55],
        'text-anchor': 'center',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': priorityColor,
        'text-opacity': zoomOpacity,
        'text-halo-color': '#ffffff',
        'text-halo-width': 1,
      },
    });
  }

  if (!map.getLayer(PLANNER_PRIORITY_BADGE_LAYER_IDS[1])) {
    map.addLayer({
      id: PLANNER_PRIORITY_BADGE_LAYER_IDS[1],
      type: 'symbol',
      source: PLANNER_PRIORITY_BADGE_SOURCE_ID,
      minzoom: 4,
      layout: {
        'text-field': ['get', 'priority_icon'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 4, 7, 5, 11, 7, 14, 8],
        'text-offset': [0.96, -0.96],
        'text-anchor': 'center',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-opacity': zoomOpacity,
      },
    });
  }
}

export function syncPlannerPriorityBadges(
  map: mapboxgl.Map,
  featureCollection: GeoJSON.FeatureCollection,
  visible: boolean
): boolean {
  const source = map.getSource(PLANNER_PRIORITY_BADGE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return false;
  source.setData(visible ? featureCollection : { type: 'FeatureCollection', features: [] });
  for (const layerId of PLANNER_PRIORITY_BADGE_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }
  return true;
}
