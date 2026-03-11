import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import styles from './GapControls.module.css';

interface GapControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  forceShow?: boolean; // 자유배치 모드 등에서 surround 조건 무시
}

const GapControls: React.FC<GapControlsProps> = ({ spaceInfo, onUpdate, forceShow = false }) => {
  // gapConfig 없으면 기본값으로 초기화
  useEffect(() => {
    if (forceShow && !spaceInfo.gapConfig) {
      onUpdate({ gapConfig: { left: 1.5, right: 1.5, top: 0 } });
    }
  }, [forceShow, spaceInfo.gapConfig, onUpdate]);

  const [leftGap, setLeftGap] = useState(spaceInfo?.gapConfig?.left ?? 1.5);
  const [rightGap, setRightGap] = useState(spaceInfo?.gapConfig?.right ?? 1.5);
  const [middleGap, setMiddleGap] = useState(spaceInfo?.gapConfig?.middle ?? 2);

  // 단내림 활성화 여부
  const hasDroppedCeiling = spaceInfo?.droppedCeiling?.enabled === true;

  // spaceInfo 변경 시 상태 업데이트
  useEffect(() => {
    setLeftGap(spaceInfo?.gapConfig?.left ?? 1.5);
    setRightGap(spaceInfo?.gapConfig?.right ?? 1.5);
    setMiddleGap(spaceInfo?.gapConfig?.middle ?? 2);
  }, [spaceInfo?.gapConfig?.left, spaceInfo?.gapConfig?.right, spaceInfo?.gapConfig?.middle]);

  if (!forceShow) {
    // 기존 로직: 노서라운드가 아니면 숨김
    if (!spaceInfo || spaceInfo.surroundType !== 'no-surround') {
      return null;
    }

    const hasLeftWall = spaceInfo.wallConfig?.left ?? true;
    const hasRightWall = spaceInfo.wallConfig?.right ?? true;

    // 빌트인(양쪽 벽)에만 표시
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
  }

  // 벽 상태: installType 기반으로 결정
  const installType = spaceInfo.installType || 'builtin';
  let hasLeftWall: boolean;
  let hasRightWall: boolean;

  if (forceShow) {
    // 자유배치: installType에 따라 벽 상태 결정하되, 항상 표시
    if (installType === 'freestanding') {
      hasLeftWall = true;
      hasRightWall = true;
    } else if (installType === 'semistanding') {
      hasLeftWall = spaceInfo.wallConfig?.left ?? true;
      hasRightWall = spaceInfo.wallConfig?.right ?? true;
      // 한쪽벽인데 둘 다 false면 양쪽 다 표시
      if (!hasLeftWall && !hasRightWall) { hasLeftWall = true; hasRightWall = true; }
    } else {
      hasLeftWall = true;
      hasRightWall = true;
    }
  } else {
    if (installType === 'freestanding') {
      return null;
    } else if (installType === 'semistanding') {
      hasLeftWall = spaceInfo.wallConfig?.left ?? true;
      hasRightWall = spaceInfo.wallConfig?.right ?? true;
      if (!hasLeftWall && !hasRightWall) return null;
    } else {
      hasLeftWall = true;
      hasRightWall = true;
    }
  }

  const updateGap = (side: 'left' | 'right' | 'middle', value: number) => {
    const newGapConfig = {
      left: spaceInfo.gapConfig?.left ?? 1.5,
      right: spaceInfo.gapConfig?.right ?? 1.5,
      top: spaceInfo.gapConfig?.top ?? 0,
      middle: spaceInfo.gapConfig?.middle ?? 2,
      [side]: value
    };

    onUpdate({
      gapConfig: newGapConfig
    });
  };

  const handleInputChange = (side: 'left' | 'right' | 'middle', value: string) => {
    const numValue = parseFloat(value) || 0;
    if (side === 'left') {
      setLeftGap(numValue);
    } else if (side === 'right') {
      setRightGap(numValue);
    } else {
      setMiddleGap(numValue);
    }
  };

  const handleInputBlur = (side: 'left' | 'right' | 'middle') => {
    const value = side === 'left' ? leftGap : side === 'right' ? rightGap : middleGap;
    const clampedValue = Math.max(0, Math.min(5, Math.round(value * 2) / 2)); // 0-5mm 범위, 0.5 단위

    if (side === 'left') {
      setLeftGap(clampedValue);
    } else if (side === 'right') {
      setRightGap(clampedValue);
    } else {
      setMiddleGap(clampedValue);
    }

    updateGap(side, clampedValue);
  };

  // 표시할 항목이 하나라도 있는지
  const showLeft = hasLeftWall;
  const showRight = hasRightWall;

  return (
    <div className={styles.configSection}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionDot}></span>
        <h3 className={styles.sectionTitle}>이격거리 설정 (0-5mm)</h3>
      </div>

      <div className={styles.content}>
        <div className={styles.gapGrid}>
          {/* 좌측 이격거리 */}
          {showLeft && (
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              좌측
            </label>
            <div className={styles.gapControl}>
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.max(0, Math.round((leftGap - 0.5) * 10) / 10);
                  setLeftGap(newValue);
                  updateGap('left', newValue);
                }}
              >
                −
              </button>
              <input
                type="number"
                value={leftGap}
                onChange={(e) => handleInputChange('left', e.target.value)}
                onBlur={() => handleInputBlur('left')}
                className={styles.gapInput}
                min="0"
                max="5"
                step="0.5"
              />
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.min(5, Math.round((leftGap + 0.5) * 10) / 10);
                  setLeftGap(newValue);
                  updateGap('left', newValue);
                }}
              >
                +
              </button>
            </div>
          </div>
          )}

          {/* 중간 이격거리 - 단내림 활성 시에만 표시 */}
          {hasDroppedCeiling && (
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              중간
            </label>
            <div className={styles.gapControl}>
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.max(0, Math.round((middleGap - 0.5) * 10) / 10);
                  setMiddleGap(newValue);
                  updateGap('middle', newValue);
                }}
              >
                −
              </button>
              <input
                type="number"
                value={middleGap}
                onChange={(e) => handleInputChange('middle', e.target.value)}
                onBlur={() => handleInputBlur('middle')}
                className={styles.gapInput}
                min="0"
                max="5"
                step="0.5"
              />
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.min(5, Math.round((middleGap + 0.5) * 10) / 10);
                  setMiddleGap(newValue);
                  updateGap('middle', newValue);
                }}
              >
                +
              </button>
            </div>
          </div>
          )}

          {/* 우측 이격거리 */}
          {showRight && (
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              우측
            </label>
            <div className={styles.gapControl}>
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.max(0, Math.round((rightGap - 0.5) * 10) / 10);
                  setRightGap(newValue);
                  updateGap('right', newValue);
                }}
              >
                −
              </button>
              <input
                type="number"
                value={rightGap}
                onChange={(e) => handleInputChange('right', e.target.value)}
                onBlur={() => handleInputBlur('right')}
                className={styles.gapInput}
                min="0"
                max="5"
                step="0.5"
              />
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.min(5, Math.round((rightGap + 0.5) * 10) / 10);
                  setRightGap(newValue);
                  updateGap('right', newValue);
                }}
              >
                +
              </button>
            </div>
          </div>
          )}
        </div>
        {((showLeft && leftGap < 1.5) || (showRight && rightGap < 1.5) || (hasDroppedCeiling && middleGap < 1.5)) && (
          <p style={{ color: '#e53e3e', fontSize: '11px', margin: '6px 0 0', fontWeight: 500 }}>
            이격거리 1.5mm 이상을 권장
          </p>
        )}
      </div>
    </div>
  );
};

export default GapControls;
