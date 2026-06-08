import type mapboxgl from 'mapbox-gl';

/** Movimento maior que isso conta como arrasto, não clique de seleção. */
const DRAG_THRESHOLD_PX = 9;
/** Bloqueia clique fantasma logo após soltar pan/rotate/pitch/zoom/toque. */
const DRAG_END_CLICK_BLOCK_MS = 220;

type GesturePoint = { x: number; y: number };

const extractPoint = (e: unknown): GesturePoint | null => {
  const evt = e as { point?: GesturePoint; points?: GesturePoint[] };
  if (evt?.point && typeof evt.point.x === 'number' && typeof evt.point.y === 'number') {
    return { x: evt.point.x, y: evt.point.y };
  }
  const first = evt?.points?.[0];
  if (first && typeof first.x === 'number' && typeof first.y === 'number') {
    return { x: first.x, y: first.y };
  }
  return null;
};

/**
 * Evita selecionar UF/município/cidade ao arrastar, rotacionar, inclinar,
 * dar zoom ou usar gestos de toque no mapa. O Mapbox ainda dispara `click`
 * no fim desses gestos em alguns dispositivos.
 */
export function attachMapPointerGestureGuard(m: mapboxgl.Map) {
  const state = {
    pressX: 0,
    pressY: 0,
    hasPress: false,
    gestureActive: false,
    blockSelectionUntil: 0,
    releaseTimer: 0 as number | 0,
  };

  const bumpBlock = () => {
    state.blockSelectionUntil = Date.now() + DRAG_END_CLICK_BLOCK_MS;
  };

  const scheduleRelease = () => {
    bumpBlock();
    if (state.releaseTimer) {
      window.clearTimeout(state.releaseTimer);
    }
    state.releaseTimer = window.setTimeout(() => {
      state.gestureActive = false;
      state.hasPress = false;
      state.releaseTimer = 0;
    }, DRAG_END_CLICK_BLOCK_MS);
  };

  const onPressStart = (e: unknown) => {
    const p = extractPoint(e);
    if (!p) return;
    state.pressX = p.x;
    state.pressY = p.y;
    state.hasPress = true;
    state.gestureActive = false;
  };

  const onGestureStart = () => {
    state.gestureActive = true;
    bumpBlock();
  };

  const onGestureEnd = () => {
    state.gestureActive = true;
    scheduleRelease();
  };

  const onTouchMove = (e: unknown) => {
    if (!state.hasPress) {
      bumpBlock();
      state.gestureActive = true;
      return;
    }
    const p = extractPoint(e);
    if (!p) return;
    const dx = p.x - state.pressX;
    const dy = p.y - state.pressY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      state.gestureActive = true;
      bumpBlock();
    }
  };

  const isSelectionClick = (e: { point: { x: number; y: number } }) => {
    if (Date.now() < state.blockSelectionUntil) return false;
    if (state.gestureActive) return false;
    if (!state.hasPress) return true;
    const dx = e.point.x - state.pressX;
    const dy = e.point.y - state.pressY;
    return dx * dx + dy * dy <= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
  };

  m.on('mousedown', onPressStart as (e: mapboxgl.MapMouseEvent) => void);
  m.on('touchstart', onPressStart as (e: mapboxgl.MapTouchEvent) => void);
  m.on('touchmove', onTouchMove as (e: mapboxgl.MapTouchEvent) => void);

  m.on('dragstart', onGestureStart);
  m.on('rotatestart', onGestureStart);
  m.on('pitchstart', onGestureStart);
  m.on('zoomstart', onGestureStart);

  m.on('dragend', onGestureEnd);
  m.on('rotateend', onGestureEnd);
  m.on('pitchend', onGestureEnd);
  m.on('zoomend', onGestureEnd);
  m.on('touchend', onGestureEnd as (e: mapboxgl.MapTouchEvent) => void);

  return {
    isSelectionClick,
    detach: () => {
      m.off('mousedown', onPressStart as (e: mapboxgl.MapMouseEvent) => void);
      m.off('touchstart', onPressStart as (e: mapboxgl.MapTouchEvent) => void);
      m.off('touchmove', onTouchMove as (e: mapboxgl.MapTouchEvent) => void);

      m.off('dragstart', onGestureStart);
      m.off('rotatestart', onGestureStart);
      m.off('pitchstart', onGestureStart);
      m.off('zoomstart', onGestureStart);

      m.off('dragend', onGestureEnd);
      m.off('rotateend', onGestureEnd);
      m.off('pitchend', onGestureEnd);
      m.off('zoomend', onGestureEnd);
      m.off('touchend', onGestureEnd as (e: mapboxgl.MapTouchEvent) => void);

      if (state.releaseTimer) {
        window.clearTimeout(state.releaseTimer);
        state.releaseTimer = 0;
      }
    },
  };
}
