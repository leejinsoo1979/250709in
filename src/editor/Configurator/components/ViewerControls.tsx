import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BiDoorOpen } from 'react-icons/bi';
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
  
  showFurniture: boolean;
  onShowFurnitureToggle: () => void;
  
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
  showFurniture,
  onShowFurnitureToggle,
  doorsOpen,
  onDoorsToggle,
  hasDoorsInstalled = false,
  onDoorInstallationToggle
}) => {
  // UIStore에서 2D 뷰 방향 상태 및 측정 모드 상태 가져오기
  const { view2DDirection, setView2DDirection, view2DTheme, toggleView2DTheme, setView2DTheme, isMeasureMode, toggleMeasureMode } = useUIStore();
  
  // 테마 컨텍스트
  const { theme } = useTheme();
  
  // QR 코드 생성기 표시 상태
  const [showQRGenerator, setShowQRGenerator] = useState(false);
  
  // 컴포넌트 마운트 시 localStorage 캐시 정리 및 초기 동기화
  useEffect(() => {
    // localStorage에서 ui-store의 view2DTheme 제거
    try {
      const stored = localStorage.getItem('ui-store');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.state && data.state.view2DTheme !== undefined) {
          delete data.state.view2DTheme;
          localStorage.setItem('ui-store', JSON.stringify(data));
        }
      }
    } catch (e) {
      console.warn('localStorage 정리 실패:', e);
    }
    
    // 앱 테마와 동기화
    const desiredTheme = theme.mode === 'dark' ? 'dark' : 'light';
    console.log('ViewerControls mount - theme mode:', theme.mode, 'setting 2D theme to:', desiredTheme);
    setView2DTheme(desiredTheme);
  }, [theme, setView2DTheme]); // theme 변경 시 동기화
  
  const { t } = useTranslation();

  const viewModes = [
    { id: '3D' as ViewMode, label: '3D' },
    { id: '2D' as ViewMode, label: '2D' }
  ];

  const viewDirections = [
    { id: 'front' as ViewDirection, label: t('viewer.front') },
    { id: 'top' as ViewDirection, label: t('viewer.top') },
    { id: 'left' as ViewDirection, label: t('viewer.left') },
    { id: 'right' as ViewDirection, label: t('viewer.right') }
  ];

  // 2D 모드에서 사용할 뷰 방향들 (all 포함)
  const viewDirectionsWithAll = [
    { id: 'all' as ViewDirection, label: t('viewer.all') },
    ...viewDirections
  ];

  const renderModes = [
    { id: 'solid' as RenderMode, label: t('viewer.solid') },
    { id: 'wireframe' as RenderMode, label: t('viewer.wireframe') }
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
              // 단순히 치수 표시만 토글
              onShowDimensionsToggle();
            }}
            style={{ cursor: 'pointer' }}
          >
            {showDimensions ? t('viewer.on').toUpperCase() : t('viewer.off').toUpperCase()}
          </span>
          <button 
            className={`${styles.switch} ${showDimensions ? styles.on : styles.off}`}
            onClick={() => {
              // 단순히 치수 표시만 토글
              onShowDimensionsToggle();
            }}
          >
            <div className={styles.switchHandle}></div>
          </button>
        </div>

        {/* 체크박스 옵션들 - showDimensions가 true일 때만 표시 */}
        {showDimensions && (
        <div className={styles.checkboxGroup}>
          {/* 가구 체크박스 - 2D 모드에서만 표시 */}
          {viewMode === '2D' && (
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showFurniture}
                onChange={(e) => {
                  console.log('🔘 Furniture checkbox clicked - current:', showFurniture, '-> new:', !showFurniture);
                  onShowFurnitureToggle();
                }}
                className={styles.checkbox}
              />
              <span className={styles.checkmark}></span>
              {t('furniture.title')}
            </label>
          )}

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showAll}
              onChange={onShowAllToggle}
              className={styles.checkbox}
            />
            <span className={styles.checkmark}></span>
            {t('viewer.column')}
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showDimensionsText}
              onChange={onShowDimensionsTextToggle}
              className={styles.checkbox}
            />
            <span className={styles.checkmark}></span>
            {t('viewer.dimensions')}
          </label>

          {/* 그리드와 축 - 2D 모드에서만 표시 */}
          {viewMode === '2D' && (
            <>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showGuides}
                  onChange={onShowGuidesToggle}
                  className={styles.checkbox}
                />
                <span className={styles.checkmark}></span>
                {t('viewer.grid')}
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showAxis}
                  onChange={onShowAxisToggle}
                  className={styles.checkbox}
                />
                <span className={styles.checkmark}></span>
                {t('viewer.axis')}
              </label>
            </>
          )}
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
              onClick={() => {
                onViewModeChange(mode.id);
                // 2D 모드로 전환 시
                if (mode.id === '2D') {
                  // 와이어프레임을 기본으로 설정
                  if (renderMode !== 'wireframe') {
                    onRenderModeChange('wireframe');
                  }
                  // 앱 테마에 따라 2D 테마 자동 설정 (2D 모드 진입 시에만)
                  const desiredTheme = theme.mode === 'dark' ? 'dark' : 'light';
                  setView2DTheme(desiredTheme);
                }
              }}
              title={mode.id === '3D' ? '3D' : '2D'}
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
              <BiDoorOpen size={16} />
              {t('viewer.doorInstallation')}
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
              onClick={() => {
                toggleView2DTheme();
              }}
              title={view2DTheme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
            >
              {view2DTheme === 'dark' ? (
                // 달 아이콘 (다크 모드 상태)
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                // 해 아이콘 (라이트 모드 상태)
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