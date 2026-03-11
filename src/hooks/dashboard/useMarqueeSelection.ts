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
  const startPointRef = useRef({ x: 0, y: 0 });
  const addModeRef = useRef(false); // Ctrl 누른 채 마키 → 기존 선택에 추가

  const getItemElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll('[data-item-id]'));
  }, [containerRef]);

  const getIntersectingIds = useCallback((rect: MarqueeRect): Set<string> => {
    const ids = new Set<string>();
    const items = getItemElements();

    for (const el of items) {
      const elRect = el.getBoundingClientRect();
      // 겹침 판정
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
    // 아이템 위에서 시작하면 무시 (아이템 드래그용)
    const target = e.target as HTMLElement;
    if (target.closest('[data-item-card]')) return;
    // INPUT, TEXTAREA, SELECT, BUTTON 등 인터랙티브 요소에서는 마키 무시
    if (target.closest('input, textarea, select, button')) return;
    // 좌클릭만
    if (e.button !== 0) return;

    isDrawingRef.current = true;
    addModeRef.current = e.ctrlKey || e.metaKey;
    startPointRef.current = { x: e.clientX, y: e.clientY };

    // Ctrl 안 누르면 기존 선택 초기화
    if (!addModeRef.current) {
      onSelectionChange(new Set());
    }

    e.preventDefault();
  }, [enabled, onSelectionChange]);

  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;

      const x = Math.min(startPointRef.current.x, e.clientX);
      const y = Math.min(startPointRef.current.y, e.clientY);
      const width = Math.abs(e.clientX - startPointRef.current.x);
      const height = Math.abs(e.clientY - startPointRef.current.y);

      // 최소 5px 이동해야 마키 시작
      if (width < 5 && height < 5) return;

      const rect: MarqueeRect = { x, y, width, height };
      setMarqueeRect(rect);

      // 실시간 선택 업데이트
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
    },
  };
}
