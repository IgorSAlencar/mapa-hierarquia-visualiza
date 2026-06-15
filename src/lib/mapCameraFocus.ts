import type mapboxgl from 'mapbox-gl';
import { MAPBOX_CONFIG } from '@/lib/mapbox-config';

const { interactive3d, zoom: zoomConfig } = MAPBOX_CONFIG;

export type SavedMapCamera = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

export function getPointCoordinates(
  input: GeoJSON.Feature | mapboxgl.LngLatLike
): [number, number] | null {
  if (Array.isArray(input) && input.length >= 2) {
    return [input[0], input[1]];
  }
  if (input && typeof input === 'object' && 'lng' in input && 'lat' in input) {
    const ll = input as mapboxgl.LngLat;
    return [ll.lng, ll.lat];
  }
  const feature = input as GeoJSON.Feature;
  const geom = feature?.geometry;
  if (geom?.type === 'Point') {
    const c = geom.coordinates as [number, number];
    return [c[0], c[1]];
  }
  return null;
}

export function fitMapToBrazilOverview(m: mapboxgl.Map, options?: { duration?: number }): void {
  const { center, zoom } = MAPBOX_CONFIG.initialBrazilView;
  const duration = options?.duration ?? 0;
  try {
    if (duration <= 0) {
      m.jumpTo({ center, zoom, pitch: 0, bearing: 0 });
      return;
    }
    m.easeTo({ center, zoom, pitch: 0, bearing: 0, duration, essential: true });
  } catch {
    /* ignore */
  }
}

export function applyMapScrollZoomSettings(m: mapboxgl.Map): void {
  const cfg = MAPBOX_CONFIG.scrollZoom;
  if (!cfg) return;
  try {
    m.scrollZoom.enable();
    const handler = m.scrollZoom as mapboxgl.ScrollZoomHandler & {
      setWheelZoomRate?: (rate: number) => void;
      setZoomRate?: (rate: number) => void;
    };
    if (cfg.wheelZoomRate != null && typeof handler.setWheelZoomRate === 'function') {
      handler.setWheelZoomRate(cfg.wheelZoomRate);
    }
    if (cfg.zoomRate != null && typeof handler.setZoomRate === 'function') {
      handler.setZoomRate(cfg.zoomRate);
    }
  } catch {
    /* ignore */
  }
}

export function captureMapCamera(m: mapboxgl.Map): SavedMapCamera {
  const center = m.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: m.getZoom(),
    bearing: m.getBearing(),
    pitch: m.getPitch(),
  };
}

export function restoreMapCamera(m: mapboxgl.Map, camera: SavedMapCamera): void {
  try {
    m.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch,
    });
  } catch {
    /* ignore */
  }
}

function resolveFocusZoom(currentZoom: number): number {
  const target = Math.max(
    interactive3d.focusZoomMin,
    Math.min(zoomConfig.max, Math.max(currentZoom + 1.2, interactive3d.focusZoomStreet))
  );
  return target;
}

export function animateToPointFocus(m: mapboxgl.Map, center: [number, number]): void {
  const currentZoom = m.getZoom();
  const targetZoom = resolveFocusZoom(currentZoom);
  const zoomDelta = Math.abs(currentZoom - targetZoom);
  const useFlyTo = zoomDelta > interactive3d.focusFlyToZoomDelta;

  const camera = {
    center,
    zoom: targetZoom,
    pitch: interactive3d.focusPitch,
    bearing: m.getBearing(),
    offset: interactive3d.focusOffset,
    duration: interactive3d.focusDurationMs,
    essential: true,
  };

  try {
    if (useFlyTo) {
      m.flyTo(camera);
    } else {
      m.easeTo(camera);
    }
  } catch {
    /* ignore */
  }
}

/** Restaura câmera salva antes do foco; sem `restore`, apenas nivela pitch/bearing em 0. */
export function animateToFlatView(m: mapboxgl.Map, restore?: SavedMapCamera | null): void {
  try {
    if (restore) {
      m.easeTo({
        center: restore.center,
        zoom: restore.zoom,
        bearing: restore.bearing,
        pitch: restore.pitch,
        duration: interactive3d.flatDurationMs,
        essential: true,
      });
      return;
    }
    m.easeTo({
      pitch: 0,
      bearing: 0,
      duration: interactive3d.flatDurationMs,
      essential: true,
    });
  } catch {
    /* ignore */
  }
}
