import React from 'react';
import { useUIStore, View2DDirection } from '@/store/uiStore';
import styles from './ViewDirectionSelector.module.css';

/**
 * 2D 뷰 방향 선택 컴포넌트
 * 정면, 좌측, 우측, 상단 뷰를 방향별 버튼으로 표시
 */
const ViewDirectionSelector: React.FC = () => {
  const { viewMode, view2DDirection, setView2DDirection } = useUIStore();

  // 3D 모드에서는 표시하지 않음
  if (viewMode === '3D') {
    return null;
  }

  // 방향 변경 핸들러
  const handleDirectionChange = (direction: View2DDirection) => {
    setView2DDirection(direction);
  };

  return (
    <div className={styles.container}>
      {/* 방향별 버튼을 그리드 레이아웃으로 배치 */}
      <div className={styles.buttonGrid}>
        {/* 상단 버튼 */}
        <button
          onClick={() => handleDirectionChange('top')}
          className={`${styles.directionButton} ${styles.topButton} ${
            view2DDirection === 'top' ? styles.active : ''
          }`}
          title="상단 뷰"
        >
          ↑
        </button>

        {/* 좌측 버튼 */}
        <button
          onClick={() => handleDirectionChange('left')}
          className={`${styles.directionButton} ${styles.leftButton} ${
            view2DDirection === 'left' ? styles.active : ''
          }`}
          title="좌측 뷰"
        >
          ←
        </button>

        {/* 정면 버튼 */}
        <button
          onClick={() => handleDirectionChange('front')}
          className={`${styles.directionButton} ${styles.frontButton} ${
            view2DDirection === 'front' ? styles.active : ''
          }`}
          title="정면 뷰"
        >
          ⬜
        </button>

        {/* 우측 버튼 */}
        <button
          onClick={() => handleDirectionChange('right')}
          className={`${styles.directionButton} ${styles.rightButton} ${
            view2DDirection === 'right' ? styles.active : ''
          }`}
          title="우측 뷰"
        >
          →
        </button>
      </div>
    </div>
  );
};

export default ViewDirectionSelector; 