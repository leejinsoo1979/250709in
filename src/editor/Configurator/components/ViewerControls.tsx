import React, { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import styles from './ViewerControls.module.css';
import QRCodeGenerator from '@/editor/shared/ar/components/QRCodeGenerator';
import { useTheme } from '@/contexts/ThemeContext';

export type ViewMode = '2D' | '3D';
export type ViewDirection = 'front' | 'top' | 'left' | 'right' | 'all';
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
  
  showAxis: boolean;
  onShowAxisToggle: () => void;
  
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
  showAxis,
  onShowAxisToggle,
  doorsOpen,
  onDoorsToggle,
  hasDoorsInstalled = false,
  onDoorInstallationToggle
}) => {
  // UIStore에서 2D 뷰 방향 상태 가져오기
  const { view2DDirection, setView2DDirection, view2DTheme, toggleView2DTheme } = useUIStore();
  
  // 테마 컨텍스트
  const { theme, toggleTheme } = useTheme();
  
  // QR 코드 생성기 표시 상태
  const [showQRGenerator, setShowQRGenerator] = useState(false);

  const viewModes = [
    { id: '3D' as ViewMode, label: '3D' },
    { id: '2D' as ViewMode, label: '2D' }
  ];

  const viewDirections = [
    { id: 'front' as ViewDirection, label: 'front' },
    { id: 'top' as ViewDirection, label: 'top' },
    { id: 'left' as ViewDirection, label: 'left' },
    { id: 'right' as ViewDirection, label: 'right' }
  ];

  // 2D 모드에서 사용할 뷰 방향들
  const viewDirectionsWithAll = viewDirections;

  const renderModes = [
    { id: 'solid' as RenderMode, label: 'Solid' },
    { id: 'wireframe' as RenderMode, label: 'Wireframe' }
  ];

  // 2D 뷰 방향 변경 핸들러 - UIStore 직접 업데이트
  const handleViewDirectionChange = (direction: ViewDirection) => {
    setView2DDirection(direction);
    onViewDirectionChange(direction); // 기존 콜백도 호출 (호환성)
  };

  return (
    <div className={styles.viewerControls}>
      {/* 좌측 옵션 토글들 */}
      <div className={styles.leftControls}>
        {/* 치수 표시 토글 */}
        <div className={styles.toggleGroup}>
          <span 
            className={`${styles.toggleLabel} ${styles.clickable}`}
            onClick={() => {
              console.log('🎯 ON/OFF 라벨 클릭, 현재 상태:', showDimensions);
              
              // 토글이 꺼져있으면 켜고 모든 항목 체크
              if (!showDimensions) {
                onShowDimensionsToggle();
                // 모든 항목이 체크되어 있지 않으면 체크
                if (!showAll) onShowAllToggle();
                if (!showDimensionsText) onShowDimensionsTextToggle();
                if (!showGuides) onShowGuidesToggle();
                if (!showAxis) onShowAxisToggle();
                return;
              }
              
              // 토글이 켜져있을 때: 토글을 끄지 않고 모든 체크박스 해제
              const anyChecked = showAll || showDimensionsText || showGuides || showAxis;
              
              if (anyChecked) {
                // 하나라도 체크되어 있으면 모두 체크 해제
                if (showAll) onShowAllToggle();
                if (showDimensionsText) onShowDimensionsTextToggle();
                if (showGuides) onShowGuidesToggle();
                if (showAxis) onShowAxisToggle();
                // showDimensions는 끄지 않음
              } else {
                // 모두 체크 해제되어 있으면 토글 OFF
                onShowDimensionsToggle();
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            {showDimensions ? 'ON' : 'OFF'}
          </span>
          <button 
            className={`${styles.switch} ${showDimensions ? styles.on : styles.off}`}
            onClick={() => {
              console.log('🎯 치수 토글 클릭, 현재 상태:', showDimensions);
              
              // 치수 토글이 켜져있으면 끄고, showDimensionsText도 함께 끄기
              if (showDimensions) {
                onShowDimensionsToggle();
                if (showDimensionsText) {
                  onShowDimensionsTextToggle();
                }
              } else {
                // 치수 토글이 꺼져있으면 켜기
                onShowDimensionsToggle();
              }
            }}
          >
            <div className={styles.switchHandle}></div>
          </button>
        </div>

        {/* 체크박스 옵션들 - 항상 표시 */}
        <div className={styles.checkboxGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showDimensions && showAll}
              onChange={onShowAllToggle}
              className={styles.checkbox}
            />
            <span className={styles.checkmark}></span>
            가이드
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showDimensions && showDimensionsText}
              onChange={onShowDimensionsTextToggle}
              className={styles.checkbox}
            />
            <span className={styles.checkmark}></span>
            치수
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showDimensions && showGuides}
              onChange={onShowGuidesToggle}
              className={styles.checkbox}
            />
            <span className={styles.checkmark}></span>
            그리드
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showDimensions && showAxis}
              onChange={onShowAxisToggle}
              className={styles.checkbox}
            />
            <span className={styles.checkmark}></span>
            축
          </label>
        </div>

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
              title={mode.id === '3D' ? '3D 모드 - 휠 버튼 드래그: 회전' : '2D 모드'}
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
        {/* 뷰 방향 선택 - 2D 모드에서만 표시 */}
        {viewMode === '2D' && (
          <>
            <div className={styles.viewDirectionGroup}>
              {viewDirectionsWithAll.map((direction) => (
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
            
            {/* 다크모드/라이트모드 토글 - 2D 모드에서만 표시 */}
            <button
              className={styles.themeToggle}
              onClick={toggleView2DTheme}
              title={view2DTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {view2DTheme === 'dark' ? (
                // 해 아이콘 (라이트 모드)
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                // 달 아이콘 (다크 모드)
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </>
        )}
        
        {/* AR 버튼 - 3D 모드에서만 표시 */}
        {/* {viewMode === '3D' && (
          <button
            className={styles.arButton}
            onClick={() => setShowQRGenerator(true)}
            title="AR로 보기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              {/* 스마트폰 프레임 */}
              {/* <rect x="5" y="2" width="14" height="20" rx="2" strokeWidth="2"/> */}
              {/* 스크린 */}
              {/* <rect x="7" y="4" width="10" height="14" strokeWidth="1" opacity="0.5"/> */}
              {/* AR 큐브 */}
              {/* <path d="M9 10 L9 14 L12 16 L15 14 L15 10 L12 8 L9 10Z" strokeWidth="1.5" fill="none"/>
              <path d="M9 10 L12 8 L15 10" strokeWidth="1.5" fill="none"/>
              <path d="M12 16 L12 12" strokeWidth="1.5" fill="none"/> */}
              {/* AR 포인터 */}
              {/* <circle cx="12" cy="12" r="1" fill="currentColor"/> */}
            {/* </svg>
            <span>AR</span>
          </button>
        )} */}
      </div>
      
      {/* QR 코드 생성기 모달 */}
      {showQRGenerator && (
        <QRCodeGenerator onClose={() => setShowQRGenerator(false)} />
      )}
    </div>
  );
};

export default ViewerControls; 