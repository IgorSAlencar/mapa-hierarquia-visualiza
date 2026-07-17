import type mapboxgl from 'mapbox-gl';
import {
  PLANNER_PRIORITY_BADGE_LAYER_IDS,
  PLANNER_PRIORITY_BADGE_SOURCE_ID,
} from '@/lib/plannerPriorityBadges';

export const PLANNER_TRANSIENT_SOURCE_IDS = [
  'planner-route-lojas',
  'planner-selected-lojas',
  'planner-hovered-loja',
  'planner-territory-area',
  PLANNER_PRIORITY_BADGE_SOURCE_ID,
] as const;

const PLANNER_TRANSIENT_LAYER_IDS = [
  'planner-route-lojas-cir',
  'planner-selected-lojas-cir',
  'planner-hovered-loja-halo',
  'planner-hovered-loja-cir',
  'planner-territory-area-fill',
  'planner-territory-area-line',
  ...PLANNER_PRIORITY_BADGE_LAYER_IDS,
] as const;

/** Remove todos os desenhos temporários criados durante a montagem do roteiro. */
export function clearPlannerMapArtifacts(map: mapboxgl.Map): void {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  for (const sourceId of PLANNER_TRANSIENT_SOURCE_IDS) {
    const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(empty);
  }
  for (const layerId of PLANNER_TRANSIENT_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    map.setLayoutProperty(layerId, 'visibility', 'none');
  }
}
