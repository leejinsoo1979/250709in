import { useUIStore } from '@/store/uiStore';
import { useSpace3DView } from '../../../context/useSpace3DView';

/**
 * 치수 텍스트 색상을 일관되게 관리하는 커스텀 훅
 * 
 * 색상 패턴:
 * - 3D 모드: 테마 색상 (초록색)
 * - 2D 다크 모드: 흰색 (#ffffff)
 * - 2D 라이트 모드: 검정색 (#000000)
 */
export const useDimensionColor = () => {
  const { view2DTheme } = useUIStore();
  const { viewMode } = useSpace3DView();
  
  const getThemeColor = () => {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
  };
  
  const dimensionColor = viewMode === '3D' 
    ? getThemeColor() 
    : (view2DTheme === 'dark' ? '#ffffff' : '#000000');
  
  const baseFontSize = viewMode === '3D' ? 0.45 : 0.32;
  
  return {
    dimensionColor,
    baseFontSize,
    viewMode,
    view2DTheme
  };
};
