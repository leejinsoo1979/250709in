import { useState, useCallback, useRef, useEffect } from 'react';

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseMarqueeSelectionOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  existingSelection?: Set<string>;
  enabled?: boolean;
}

export function useMarqueeSelection({
  containerRef,
  onSelectionChange,
  existingSelection,
  enabled = true,
}: UseMarqueeSelectionOptions) {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const isDrawingRef = useRef(false);
  const didDrawRef = useRef(false); // 실제 마키 드래그가 발생했는지
  const startPointRef = useRef({ x: 0, y: 0 });
  const addModeRef = useRef(false);

  const getItemElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll('[data-item-id]'));
  }, [containerRef]);

  const getIntersectingIds = useCallback((rect: MarqueeRect): Set<string> => {
    const ids = new Set<string>();
    const items = getItemElements();

    for (const el of items) {
      const elRect = el.getBoundingClientRect();
      if (
        rect.x < elRect.right &&
        rect.x + rect.width > elRect.left &&
        rect.y < elRect.bottom &&
        rect.y + rect.height > elRect.top
      ) {
        const id = (el as HTMLElement).dataset.itemId;
        if (id) ids.add(id);
      }
    }

    return ids;
  }, [getItemElements]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-item-card]')) return;
    if (target.closest('input, textarea, select, button, [data-no-marquee]')) return;
    if (e.button !== 0) return;

    isDrawingRef.current = true;
    didDrawRef.current = false;
    addModeRef.current = e.ctrlKey || e.metaKey;
    startPointRef.current = { x: e.clientX, y: e.clientY };

    if (!addModeRef.current) {
      onSelectionChange(new Set());
    }

    e.preventDefault();
  }, [enabled, onSelectionChange]);

  // 마키 드래그 직후 click 이벤트가 선택을 초기화하는 것을 방지
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (didDrawRef.current) {
      e.stopPropagation();
      didDrawRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;

      const x = Math.min(startPointRef.current.x, e.clientX);
      const y = Math.min(startPointRef.current.y, e.clientY);
      const width = Math.abs(e.clientX - startPointRef.current.x);
      const height = Math.abs(e.clientY - startPointRef.current.y);

      if (width < 5 && height < 5) return;

      didDrawRef.current = true;
      const rect: MarqueeRect = { x, y, width, height };
      setMarqueeRect(rect);

      const intersecting = getIntersectingIds(rect);
      if (addModeRef.current && existingSelection) {
        const merged = new Set(existingSelection);
        intersecting.forEach(id => merged.add(id));
        onSelectionChange(merged);
      } else {
        onSelectionChange(intersecting);
      }
    };

    const handleMouseUp = () => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        setMarqueeRect(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [enabled, getIntersectingIds, onSelectionChange, existingSelection]);

  return {
    marqueeRect,
    marqueeHandlers: {
      onMouseDown: handleMouseDown,
      onClickCapture: handleClick,
    },
  };
}
