import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import styles from './GapControls.module.css';

interface GapControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

const GapControls: React.FC<GapControlsProps> = ({ spaceInfo, onUpdate }) => {
  const [leftGap, setLeftGap] = useState(spaceInfo.gapConfig?.left || 2);
  const [rightGap, setRightGap] = useState(spaceInfo.gapConfig?.right || 2);
  
  // spaceInfo 변경 시 상태 업데이트
  useEffect(() => {
    setLeftGap(spaceInfo.gapConfig?.left || 2);
    setRightGap(spaceInfo.gapConfig?.right || 2);
  }, [spaceInfo.gapConfig]);
  
  // 노서라운드가 아닌 경우 렌더링하지 않음
  if (spaceInfo.surroundType !== 'no-surround') {
    return null;
  }
  
  // 벽이 모두 없는 경우 (벽없음) 렌더링하지 않음
  const hasLeftWall = spaceInfo.wallConfig?.left ?? true;
  const hasRightWall = spaceInfo.wallConfig?.right ?? true;
  
  if (!hasLeftWall && !hasRightWall) {
    return null;
  }

  const updateGap = (side: 'left' | 'right', value: number) => {
    const newGapConfig = {
      ...spaceInfo.gapConfig,
      [side]: value
    };
    
    onUpdate({
      gapConfig: newGapConfig
    });
  };

  const handleInputChange = (side: 'left' | 'right', value: string) => {
    const numValue = parseInt(value) || 0;
    if (side === 'left') {
      setLeftGap(numValue);
    } else {
      setRightGap(numValue);
    }
  };

  const handleInputBlur = (side: 'left' | 'right') => {
    const value = side === 'left' ? leftGap : rightGap;
    const clampedValue = Math.max(0, Math.min(50, value)); // 0-50mm 범위로 제한
    
    if (side === 'left') {
      setLeftGap(clampedValue);
    } else {
      setRightGap(clampedValue);
    }
    
    updateGap(side, clampedValue);
  };

  return (
    <div className={styles.configSection}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionDot}></span>
        <h3 className={styles.sectionTitle}>이격거리 설정</h3>
      </div>
      
      <div className={styles.content}>
        <div className={styles.gapGrid}>
          {/* 좌측 이격거리 */}
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              좌측
              {!hasLeftWall && ' (벽 없음)'}
            </label>
            <div className={`${styles.gapControl} ${!hasLeftWall ? styles.disabled : ''}`}>
              <button 
                className={styles.controlButton}
                disabled={!hasLeftWall}
                onClick={() => {
                  if (hasLeftWall) {
                    const newValue = Math.max(0, leftGap - 1);
                    setLeftGap(newValue);
                    updateGap('left', newValue);
                  }
                }}
              >
                −
              </button>
              <input
                type="number"
                value={hasLeftWall ? leftGap : 0}
                onChange={(e) => hasLeftWall && handleInputChange('left', e.target.value)}
                onBlur={() => hasLeftWall && handleInputBlur('left')}
                className={styles.gapInput}
                min="0"
                max="50"
                disabled={!hasLeftWall}
              />
              <button 
                className={styles.controlButton}
                disabled={!hasLeftWall}
                onClick={() => {
                  if (hasLeftWall) {
                    const newValue = Math.min(50, leftGap + 1);
                    setLeftGap(newValue);
                    updateGap('left', newValue);
                  }
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* 우측 이격거리 */}
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              우측
              {!hasRightWall && ' (벽 없음)'}
            </label>
            <div className={`${styles.gapControl} ${!hasRightWall ? styles.disabled : ''}`}>
              <button 
                className={styles.controlButton}
                disabled={!hasRightWall}
                onClick={() => {
                  if (hasRightWall) {
                    const newValue = Math.max(0, rightGap - 1);
                    setRightGap(newValue);
                    updateGap('right', newValue);
                  }
                }}
              >
                −
              </button>
              <input
                type="number"
                value={hasRightWall ? rightGap : 0}
                onChange={(e) => hasRightWall && handleInputChange('right', e.target.value)}
                onBlur={() => hasRightWall && handleInputBlur('right')}
                className={styles.gapInput}
                min="0"
                max="50"
                disabled={!hasRightWall}
              />
              <button 
                className={styles.controlButton}
                disabled={!hasRightWall}
                onClick={() => {
                  if (hasRightWall) {
                    const newValue = Math.min(50, rightGap + 1);
                    setRightGap(newValue);
                    updateGap('right', newValue);
                  }
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GapControls;