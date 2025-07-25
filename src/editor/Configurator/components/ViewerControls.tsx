import React from 'react';
import { useUIStore } from '@/store/uiStore';
import styles from './ViewerControls.module.css';

export type ViewMode = '2D' | '3D';
export type ViewDirection = 'front' | 'top' | 'left' | 'right';
export type RenderMode = 'solid' | 'wireframe';

interface ViewerControlsProps {
  // 뷰 모드 관련
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  
  // 뷰 방향 관련 (UIStore와 연동)
  viewDirection: ViewDirection;
  onViewDirectionChange: (direction: ViewDirection) => void;
  
  // 렌더링 모드 관련
  renderMode: RenderMode;
  onRenderModeChange: (mode: RenderMode) => void;
  
  // 옵션 토글들
  showAll: boolean;
  onShowAllToggle: () => void;
  
  showDimensions: boolean;
  onShowDimensionsToggle: () => void;
  
  showDimensionsText: boolean;
  onShowDimensionsTextToggle: () => void;
  
  showGuides: boolean;
  onShowGuidesToggle: () => void;
  
  doorsOpen: boolean;
  onDoorsToggle: () => void;
  
  // 도어 설치 관련
  hasDoorsInstalled?: boolean;
  onDoorInstallationToggle?: () => void;
}

const ViewerControls: React.FC<ViewerControlsProps> = ({
  viewMode,
  onViewModeChange,
  viewDirection,
  onViewDirectionChange,
  renderMode,
  onRenderModeChange,
  showAll,
  onShowAllToggle,
  showDimensions,
  onShowDimensionsToggle,
  showDimensionsText,
  onShowDimensionsTextToggle,
  showGuides,
  onShowGuidesToggle,
  doorsOpen,
  onDoorsToggle,
  hasDoorsInstalled = false,
  onDoorInstallationToggle
}) => {
  // UIStore에서 2D 뷰 방향 상태 가져오기
  const { view2DDirection, setView2DDirection } = useUIStore();

  const viewModes = [
    { id: '3D' as ViewMode, label: '3D' },
    { id: '2D' as ViewMode, label: '2D' }
  ];

  const viewDirections = [
    { id: 'front' as ViewDirection, label: '정면' },
    { id: 'top' as ViewDirection, label: '상부' },
    { id: 'left' as ViewDirection, label: '좌측면' },
    { id: 'right' as ViewDirection, label: '우측면' }
  ];

  const renderModes = [
    { id: 'solid' as RenderMode, label: 'Solid' },
    { id: 'wireframe' as RenderMode, label: 'Wireframe' }
  ];

  // 2D 뷰 방향 변경 핸들러 - UIStore 직접 업데이트
  const handleViewDirectionChange = (direction: ViewDirection) => {
    setView2DDirection(direction);
    onViewDirectionChange(direction); // 기존 콜백도 호출 (호환성)
    
    // 3D 모드에서 상부 버튼을 누르면 자동으로 2D 모드로 전환
    if (viewMode === '3D' && direction === 'top') {
      onViewModeChange('2D');
    }
  };

  return (
    <div className={styles.viewerControls}>
      {/* 좌측 옵션 토글들 */}
      <div className={styles.leftControls}>
        {/* 치수 표시 토글 */}
        <div className={styles.toggleGroup}>
          <span className={styles.toggleLabel}>{showDimensions ? 'ON' : 'OFF'}</span>
          <button 
            className={`${styles.switch} ${showDimensions ? styles.on : styles.off}`}
            onClick={() => {
              console.log('🎯 치수 토글 클릭, 현재 상태:', showDimensions);
              onShowDimensionsToggle();
            }}
          >
            <div className={styles.switchHandle}></div>
          </button>
        </div>

        {/* 체크박스 옵션들 - showDimensions가 true일 때만 표시 */}
        {showDimensions && (
          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showAll}
                onChange={onShowAllToggle}
                className={styles.checkbox}
              />
              <span className={styles.checkmark}></span>
              가이드
            </label>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showDimensionsText}
                onChange={onShowDimensionsTextToggle}
                className={styles.checkbox}
              />
              <span className={styles.checkmark}></span>
              치수
            </label>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showGuides}
                onChange={onShowGuidesToggle}
                className={styles.checkbox}
              />
              <span className={styles.checkmark}></span>
              그리드
            </label>
          </div>
        )}

        {/* 두 번째 도어 토글 제거 (불필요) */}
      </div>

      {/* 중앙 뷰 컨트롤들 */}
      <div className={styles.centerControls}>
        {/* 보기 옵션 (Solid/Wireframe) */}
        <div className={styles.renderModeGroup}>
          {renderModes.map((mode) => (
            <button
              key={mode.id}
              className={`${styles.renderModeButton} ${renderMode === mode.id ? styles.active : ''}`}
              onClick={() => onRenderModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* 3D/2D 토글 */}
        <div className={styles.viewModeGroup}>
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              data-view-mode={mode.id}
              className={`${styles.viewModeButton} ${viewMode === mode.id ? styles.active : ''}`}
              onClick={() => onViewModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* 도어 설치 버튼 */}
        {onDoorInstallationToggle && (
          <div className={styles.doorButtonGroup}>
            <button 
              className={`${styles.doorButton} ${hasDoorsInstalled ? styles.active : ''}`}
              onClick={onDoorInstallationToggle}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="9" cy="12" r="1" fill="currentColor"/>
                {hasDoorsInstalled && (
                  <path d="M8 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none"/>
                )}
              </svg>
              도어설치
            </button>
          </div>
        )}
        </div>

      {/* 우측 뷰 컨트롤들 */}
      <div className={styles.rightControls}>
        {/* 뷰 방향 선택 - 3D/2D 모드 모두에서 표시 */}
        <div className={styles.viewDirectionGroup}>
          {viewDirections.map((direction) => (
            <button
              key={direction.id}
              data-view-direction={direction.id}
              className={`${styles.viewDirectionButton} ${view2DDirection === direction.id ? styles.active : ''}`}
              onClick={() => handleViewDirectionChange(direction.id)}
            >
              {direction.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ViewerControls; 