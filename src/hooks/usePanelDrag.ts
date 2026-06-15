import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface PanelPosition {
  x: number;
  y: number;
}

export type PanelHeaderDragProps = Pick<
  HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'className' | 'style'
>;

/**
 * Arrasta um painel flutuante pela barra de título.
 * Botões no header devem usar `data-panel-drag-ignore` para não iniciar o drag.
 */
export function usePanelDrag(initial: PanelPosition) {
  const [position, setPosition] = useState(initial);
  const positionRef = useRef(position);
  positionRef.current = position;

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const onHeaderPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('[data-panel-drag-ignore]')) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onHeaderPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* já liberado */
    }
  }, []);

  const shellStyle: CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    zIndex: 10,
    maxHeight: 'calc(100vh - 120px)',
  };

  const headerDragProps: PanelHeaderDragProps = {
    onPointerDown: onHeaderPointerDown,
    onPointerMove: onHeaderPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    className: 'cursor-grab active:cursor-grabbing select-none touch-none',
    style: { touchAction: 'none' },
  };

  return { position, setPosition, shellStyle, headerDragProps };
}
