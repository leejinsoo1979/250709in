import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import styles from './GapControls.module.css';

interface GapControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

const GapControls: React.FC<GapControlsProps> = ({ spaceInfo, onUpdate }) => {
  // 실제 스토어에 저장된 값 사용 (자동 계산하지 않음)
  const [leftGap, setLeftGap] = useState(spaceInfo?.gapConfig?.left || 1.5);
  const [rightGap, setRightGap] = useState(spaceInfo?.gapConfig?.right || 1.5);
  
  // spaceInfo 변경 시 상태 업데이트
  useEffect(() => {
    if (spaceInfo?.gapConfig) {
      setLeftGap(spaceInfo.gapConfig.left || 1.5);
      setRightGap(spaceInfo.gapConfig.right || 1.5);
    }
  }, [spaceInfo?.gapConfig?.left, spaceInfo?.gapConfig?.right]);
  
  // spaceInfo가 없거나 노서라운드가 아닌 경우 렌더링하지 않음
  if (!spaceInfo || spaceInfo.surroundType !== 'no-surround') {
    return null;
  }
  
  // 벽 상태 확인
  const hasLeftWall = spaceInfo.wallConfig?.left ?? true;
  const hasRightWall = spaceInfo.wallConfig?.right ?? true;
  
  // 빌트인(양쪽 벽이 모두 있는 경우)에만 표시
  // 세미스탠딩(한쪽 벽만) 또는 프리스탠딩(벽 없음)에서는 렌더링하지 않음
  if (!(hasLeftWall && hasRightWall)) {
    const desiredGapConfig = {
      left: hasLeftWall ? (spaceInfo.gapConfig?.left ?? 1.5) : 0,
      right: hasRightWall ? (spaceInfo.gapConfig?.right ?? 1.5) : 0,
    };

    if (
      !spaceInfo.gapConfig ||
      spaceInfo.gapConfig.left !== desiredGapConfig.left ||
      spaceInfo.gapConfig.right !== desiredGapConfig.right
    ) {
      onUpdate({ gapConfig: desiredGapConfig });
    }

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
    const numValue = parseFloat(value) || 0;
    if (side === 'left') {
      setLeftGap(numValue);
    } else {
      setRightGap(numValue);
    }
  };

  const handleInputBlur = (side: 'left' | 'right') => {
    const value = side === 'left' ? leftGap : rightGap;
    const clampedValue = Math.max(1.5, Math.min(5, Math.round(value * 2) / 2)); // 2-5mm 범위, 0.5 단위
    
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
        <h3 className={styles.sectionTitle}>이격거리 설정 (1.5-5mm)</h3>
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
                    const newValue = Math.max(1.5, Math.round((leftGap - 0.5) * 10) / 10);
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
                min="1.5"
                max="5"
                step="0.5"
                disabled={!hasLeftWall}
              />
              <button 
                className={styles.controlButton}
                disabled={!hasLeftWall}
                onClick={() => {
                  if (hasLeftWall) {
                    const newValue = Math.min(5, Math.round((leftGap + 0.5) * 10) / 10);
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
                    const newValue = Math.max(1.5, Math.round((rightGap - 0.5) * 10) / 10);
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
                min="1.5"
                max="5"
                step="0.5"
                disabled={!hasRightWall}
              />
              <button 
                className={styles.controlButton}
                disabled={!hasRightWall}
                onClick={() => {
                  if (hasRightWall) {
                    const newValue = Math.min(5, Math.round((rightGap + 0.5) * 10) / 10);
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
