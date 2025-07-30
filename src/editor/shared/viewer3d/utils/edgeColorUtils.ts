/**
 * Edge 색상을 관리하는 유틸리티 함수
 */

interface EdgeColorOptions {
  isDragging?: boolean;
  isEditMode?: boolean;
  isDragMode?: boolean;
  viewMode?: '2D' | '3D';
  view2DTheme?: 'dark' | 'light';
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
    view2DTheme = 'light'
  } = options;

  // 우선순위에 따른 색상 결정
  if (isDragging) {
    return '#00ff00'; // 드래그 중: 초록색
  }
  
  if (isEditMode) {
    return '#ff8800'; // 편집 모드: 주황색
  }
  
  if (isDragMode) {
    return '#ff0000'; // 드래그 모드: 빨간색
  }
  
  // 2D 다크모드일 때 밝은 회색
  if (viewMode === '2D' && view2DTheme === 'dark') {
    return '#666666';
  }
  
  // 기본 색상
  return '#cccccc';
}