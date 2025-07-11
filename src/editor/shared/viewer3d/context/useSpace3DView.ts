import { useContext } from 'react';
import { Space3DViewContext } from './Space3DViewContextTypes';

// 커스텀 훅: 컨텍스트 사용을 위한 훅
export const useSpace3DView = () => {
  const context = useContext(Space3DViewContext);
  if (!context) {
    throw new Error('useSpace3DView must be used within a Space3DViewProvider');
  }
  return context;
}; 