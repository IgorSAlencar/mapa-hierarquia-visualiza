import { cn } from '@/lib/utils';
import type { PanelHeaderDragProps } from '@/hooks/usePanelDrag';

export function mergeHeaderDrag(
  baseClassName: string,
  headerDragProps?: PanelHeaderDragProps
): { className: string; dragHandlers: Omit<PanelHeaderDragProps, 'className' | 'style'>; dragStyle: PanelHeaderDragProps['style'] } {
  if (!headerDragProps) {
    return { className: baseClassName, dragHandlers: {}, dragStyle: undefined };
  }
  const { className: dragClass, style: dragStyle, ...dragHandlers } = headerDragProps;
  return {
    className: cn(baseClassName, dragClass),
    dragHandlers,
    dragStyle,
  };
}
