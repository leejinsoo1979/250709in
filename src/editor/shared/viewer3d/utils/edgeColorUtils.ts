/**
 * Edge 색상을 관리하는 유틸리티 함수
 */

import { getThemeHex } from '@/theme';

interface EdgeColorOptions {
  isDragging?: boolean;
  isEditMode?: boolean;
  isDragMode?: boolean;
  viewMode?: '2D' | '3D';
  view2DTheme?: 'dark' | 'light';
  renderMode?: 'solid' | 'wireframe';
}

/**
 * 가구의 Edge 색상을 결정하는 함수
 * @param options Edge 색상 결정에 필요한 옵션들
 * @returns Edge 색상 문자열
 */
export function getEdgeColor(options: EdgeColorOptions): string {
  const {
    isDragging = false,
    isEditMode = false,
    isDragMode = false,
    viewMode = '3D',
    view2DTheme = 'light',
    renderMode = 'solid'
  } = options;

  // 우선순위에 따른 색상 결정
  if (isDragging) {
    return getThemeHex(); // 드래그 중: 테마 색상
  }
  
  if (isEditMode) {
    return '#ff5500'; // 편집 모드: 주황색
  }
  
  if (isDragMode) {
    return '#ff0000'; // 드래그 모드: 빨간색
  }
  
  // 2D 와이어프레임 모드: 주황색
  if (viewMode === '2D' && renderMode === 'wireframe') {
    return '#ff5500';
  }
  
  // 2D 다크모드일 때 더 밝은 회색으로 변경
  if (viewMode === '2D' && view2DTheme === 'dark') {
    return '#999999'; // 더 밝게 변경하여 가시성 향상
  }
  
  // 기본 색상
  return '#cccccc';
}