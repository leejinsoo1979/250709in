import { useState, useRef, useCallback, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  enabled?: boolean;
}

interface UsePullToRefreshReturn {
  isRefreshing: boolean;
  pullDistance: number;
  pullIndicatorStyle: React.CSSProperties;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  enabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshReturn => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return;
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
    isPullingRef.current = true;
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPullingRef.current || !enabled || isRefreshing) return;
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }
    const currentY = e.touches[0].clientY;
    const diff = Math.max(0, currentY - startYRef.current);
    // Apply resistance: diminishing returns past threshold
    const distance = diff > threshold ? threshold + (diff - threshold) * 0.3 : diff;
    setPullDistance(distance);
    if (distance > 0) {
      e.preventDefault();
    }
  }, [enabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;

    if (pullDistance > threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold); // Hold at threshold during refresh
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled]);

  const progress = Math.min(pullDistance / threshold, 1);

  const pullIndicatorStyle: React.CSSProperties = {
    position: 'absolute' as const,
    top: 0,
    left: '50%',
    transform: `translate(-50%, ${pullDistance - 40}px)`,
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: progress,
    transition: isPullingRef.current ? 'none' : 'all 0.3s ease',
    pointerEvents: 'none' as const,
    zIndex: 10,
  };

  return {
    isRefreshing,
    pullDistance,
    pullIndicatorStyle,
    containerRef,
  };
};
