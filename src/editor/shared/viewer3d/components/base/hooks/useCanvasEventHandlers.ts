import { useCallback } from 'react';

export interface CanvasEventHandlers {
  handleDrop: (event: React.DragEvent) => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDragLeave: (event: React.DragEvent) => void;
}

/**
 * Canvas의 드래그앤드롭 이벤트 핸들러를 제공하는 훅
 * step0 이후로는 모든 step이 configurator로 통일되어 동일하게 처리
 * @returns 이벤트 핸들러 객체
 */
export const useCanvasEventHandlers = (): CanvasEventHandlers => {
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // event.stopPropagation() 제거 - 상위 컴포넌트로 이벤트 전파 허용
    
    // step0 이후로는 모든 step에서 드롭 이벤트 처리 허용
    // 드롭 이벤트를 상위 컴포넌트(ViewerWithDropSupport)가 처리하도록 전파
  }, []); // step 의존성 제거

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  return {
    handleDrop,
    handleDragOver,
    handleDragLeave,
  };
}; 