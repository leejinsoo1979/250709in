import React from 'react';
import styles from './MobileToolbar.module.css';
import { ViewMode } from './ViewerControls';

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

      {/* 뷰 옵션 그룹: 분할뷰, 치수, 더보기 */}
      <div className={styles.buttonGroup}>
        <button
          className={styles.iconButton}
          title="분할 뷰"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        </button>
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
      </div>
    </div>
  );
};

export default MobileToolbar;
