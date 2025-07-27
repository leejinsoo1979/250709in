import { useCallback, useRef } from 'react';

/**
 * 지정된 시간 간격으로 함수 호출을 제한하는 훅
 * @param callback 실행할 함수
 * @param delay 제한 시간 (밀리초)
 * @returns throttled 함수
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        // 충분한 시간이 지났으면 즉시 실행
        lastRunRef.current = now;
        callback(...args);
      } else {
        // 아직 시간이 안 됐으면 나중에 실행 예약
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          lastRunRef.current = Date.now();
          callback(...args);
        }, delay - timeSinceLastRun);
      }
    },
    [callback, delay]
  );
}