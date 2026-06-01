import type mapboxgl from 'mapbox-gl';

/** Movimento maior que isso conta como arrasto, não clique de seleção. */
const DRAG_THRESHOLD_PX = 7;
/** Bloqueia clique fantasma logo após soltar o pan. */
const DRAG_END_CLICK_BLOCK_MS = 80;

/**
 * Evita selecionar UF/município/cidade ao arrastar o mapa.
 * Mapbox ainda dispara `click` no fim do pan em alguns casos.
 */
export function attachMapPointerGestureGuard(m: mapboxgl.Map) {
  const state = {
    pressX: 0,
    pressY: 0,
    hasPress: false,
    dragPan: false,
    blockSelectionUntil: 0,
  };

  const onMouseDown = (e: mapboxgl.MapMouseEvent) => {
    state.pressX = e.point.x;
    state.pressY = e.point.y;
    state.hasPress = true;
    state.dragPan = false;
  };

  const onDragStart = () => {
    state.dragPan = true;
    state.blockSelectionUntil = Date.now() + DRAG_END_CLICK_BLOCK_MS;
  };

  const onDragEnd = () => {
    state.dragPan = true;
    state.blockSelectionUntil = Date.now() + DRAG_END_CLICK_BLOCK_MS;
    window.setTimeout(() => {
      state.dragPan = false;
      state.hasPress = false;
    }, DRAG_END_CLICK_BLOCK_MS);
  };

  const isSelectionClick = (e: { point: { x: number; y: number } }) => {
    if (Date.now() < state.blockSelectionUntil) return false;
    if (state.dragPan) return false;
    if (!state.hasPress) return true;
    const dx = e.point.x - state.pressX;
    const dy = e.point.y - state.pressY;
    return dx * dx + dy * dy <= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
  };

  m.on('mousedown', onMouseDown);
  m.on('dragstart', onDragStart);
  m.on('dragend', onDragEnd);

  return {
    isSelectionClick,
    detach: () => {
      m.off('mousedown', onMouseDown);
      m.off('dragstart', onDragStart);
      m.off('dragend', onDragEnd);
    },
  };
}
