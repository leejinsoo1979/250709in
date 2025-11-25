import React, { useState, useEffect } from 'react';
import styles from './MobileToolbar.module.css';
import { ViewMode } from './ViewerControls';
import { useUIStore } from '@/store/uiStore';

interface MobileToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showDimensions: boolean;
  onToggleDimensions: () => void;
  showGuides?: boolean;
  onToggleGuides?: () => void;
  onMoreOptions?: () => void;
}

/**
 * 모바일용 뷰어 툴바 컴포넌트
 * 3D/2D 토글, 뷰 옵션, 치수 표시 등
 */
const MobileToolbar: React.FC<MobileToolbarProps> = ({
  viewMode,
  onViewModeChange,
  showDimensions,
  onToggleDimensions,
  showGuides,
  onToggleGuides,
  onMoreOptions,
}) => {
  const uiStore = useUIStore();
  const [directionMenuOpen, setDirectionMenuOpen] = useState(false);

  useEffect(() => {
    if (viewMode !== '2D') {
      setDirectionMenuOpen(false);
    }
  }, [viewMode]);

  const directionOptions: { id: 'front' | 'top' | 'left' | 'right'; label: string }[] = [
    { id: 'front', label: '정면' },
    { id: 'top', label: '상부' },
    { id: 'left', label: '좌측' },
    { id: 'right', label: '우측' }
  ];

  const currentDirectionLabel = directionOptions.find(opt => opt.id === uiStore.view2DDirection)?.label || '정면';
  return (
    <div className={styles.toolbar}>


      {/* 2D/3D 텍스트 토글 */}
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewToggleButton} ${viewMode === '3D' ? styles.active : ''}`}
          onClick={() => onViewModeChange('3D')}
        >
          3D
        </button>
        <button
          className={`${styles.viewToggleButton} ${viewMode === '2D' ? styles.active : ''}`}
          onClick={() => onViewModeChange('2D')}
        >
          2D
        </button>
      </div>

      {/* 2D 뷰 방향 드롭다운 */}
      {viewMode === '2D' && (
        <div className={styles.directionDropdown}>
          <button
            className={`${styles.directionSelect} ${directionMenuOpen ? styles.open : ''}`}
            onClick={() => setDirectionMenuOpen(!directionMenuOpen)}
          >
            {currentDirectionLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {directionMenuOpen && (
            <div className={styles.directionMenu}>
              {directionOptions.map(option => (
                <button
                  key={option.id}
                  className={`${styles.directionOption} ${uiStore.view2DDirection === option.id ? styles.active : ''}`}
                  onClick={() => {
                    uiStore.setView2DDirection(option.id);
                    setDirectionMenuOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 뷰 옵션 그룹: 치수, 더보기 */}
      <div className={styles.buttonGroup}>
        <button
          className={`${styles.iconButton} ${showDimensions ? styles.active : ''}`}
          onClick={onToggleDimensions}
          title="치수 표시"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 21L21 3" />
            <path d="M21 21L3 3" strokeOpacity="0" />
            <path d="M17 3h4v4" />
            <path d="M7 21H3v-4" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
        {onMoreOptions && (
          <button
            className={styles.iconButton}
            onClick={onMoreOptions}
            title="더보기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default MobileToolbar;
