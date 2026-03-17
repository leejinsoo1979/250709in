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
  const [middleGap, setMiddleGap] = useState(spaceInfo?.gapConfig?.middle ?? 1.5);
  const [middle2Gap, setMiddle2Gap] = useState(spaceInfo?.gapConfig?.middle2 ?? spaceInfo?.gapConfig?.middle ?? 1.5);

  // 단내림/커튼박스 활성화 여부
  const hasDroppedCeiling = spaceInfo?.droppedCeiling?.enabled === true;
  const droppedPosition = spaceInfo?.droppedCeiling?.position; // 'left' | 'right'
  const hasStepCeiling = spaceInfo?.stepCeiling?.enabled === true;

  // 경계가 여러 개인지 판별 (단내림+커튼박스 → 경계 2개)
  // 경계 2개일 때는 middle을 별도 행으로 표시하고, 좌/우이격은 순수 벽이격만
  const hasMultipleBoundaries = hasDroppedCeiling && hasStepCeiling;

  // 단내림만 있을 때(커튼박스 없이): 경계쪽 이격은 middle로 매핑
  // 우단내림 → "우이격" = middle (메인-단내림 경계)
  // 좌단내림 → "좌이격" = middle (단내림-메인 경계)
  const isRightBoundaryMiddle = hasDroppedCeiling && !hasMultipleBoundaries && droppedPosition === 'right';
  const isLeftBoundaryMiddle = hasDroppedCeiling && !hasMultipleBoundaries && droppedPosition === 'left';

  // spaceInfo 변경 시 상태 업데이트
  useEffect(() => {
    setLeftGap(spaceInfo?.gapConfig?.left ?? 1.5);
    setRightGap(spaceInfo?.gapConfig?.right ?? 1.5);
    setMiddleGap(spaceInfo?.gapConfig?.middle ?? 1.5);
    setMiddle2Gap(spaceInfo?.gapConfig?.middle2 ?? spaceInfo?.gapConfig?.middle ?? 1.5);
  }, [spaceInfo?.gapConfig?.left, spaceInfo?.gapConfig?.right, spaceInfo?.gapConfig?.middle, spaceInfo?.gapConfig?.middle2]);

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

  const updateGap = (side: 'left' | 'right' | 'middle' | 'middle2', value: number) => {
    const newGapConfig = {
      left: spaceInfo.gapConfig?.left ?? 1.5,
      right: spaceInfo.gapConfig?.right ?? 1.5,
      top: spaceInfo.gapConfig?.top ?? 0,
      middle: spaceInfo.gapConfig?.middle ?? 1.5,
      middle2: spaceInfo.gapConfig?.middle2 ?? spaceInfo.gapConfig?.middle ?? 1.5,
      [side]: value
    };

    onUpdate({
      gapConfig: newGapConfig
    });
  };

  const handleInputChange = (side: 'left' | 'right' | 'middle' | 'middle2', value: string) => {
    const numValue = parseFloat(value) || 0;
    if (side === 'left') setLeftGap(numValue);
    else if (side === 'right') setRightGap(numValue);
    else if (side === 'middle') setMiddleGap(numValue);
    else setMiddle2Gap(numValue);
  };

  const handleInputBlur = (side: 'left' | 'right' | 'middle' | 'middle2') => {
    const value = side === 'left' ? leftGap : side === 'right' ? rightGap : side === 'middle' ? middleGap : middle2Gap;
    const clampedValue = Math.max(0, Math.min(5, Math.round(value * 2) / 2));

    if (side === 'left') setLeftGap(clampedValue);
    else if (side === 'right') setRightGap(clampedValue);
    else if (side === 'middle') setMiddleGap(clampedValue);
    else setMiddle2Gap(clampedValue);

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
          {/* 좌단내림 시: "좌이격" = middle (단내림-메인 경계) */}
          {showLeft && (
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              좌이격
            </label>
            <div className={styles.gapControl}>
              <button
                className={styles.controlButton}
                onClick={() => {
                  const key = isLeftBoundaryMiddle ? 'middle' : 'left';
                  const current = isLeftBoundaryMiddle ? middleGap : leftGap;
                  const newValue = Math.max(0, Math.round((current - 0.5) * 10) / 10);
                  if (isLeftBoundaryMiddle) { setMiddleGap(newValue); } else { setLeftGap(newValue); }
                  updateGap(key, newValue);
                }}
              >
                −
              </button>
              <input
                type="number"
                value={isLeftBoundaryMiddle ? middleGap : leftGap}
                onChange={(e) => handleInputChange(isLeftBoundaryMiddle ? 'middle' : 'left', e.target.value)}
                onBlur={() => handleInputBlur(isLeftBoundaryMiddle ? 'middle' : 'left')}
                className={styles.gapInput}
                min="0"
                max="5"
                step="0.5"
              />
              <button
                className={styles.controlButton}
                onClick={() => {
                  const key = isLeftBoundaryMiddle ? 'middle' : 'left';
                  const current = isLeftBoundaryMiddle ? middleGap : leftGap;
                  const newValue = Math.min(5, Math.round((current + 0.5) * 10) / 10);
                  if (isLeftBoundaryMiddle) { setMiddleGap(newValue); } else { setLeftGap(newValue); }
                  updateGap(key, newValue);
                }}
              >
                +
              </button>
            </div>
          </div>
          )}

          {/* 우측 이격거리 */}
          {/* 우단내림 시: "우이격" = middle (메인-단내림 경계) */}
          {showRight && (
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              우이격
            </label>
            <div className={styles.gapControl}>
              <button
                className={styles.controlButton}
                onClick={() => {
                  const key = isRightBoundaryMiddle ? 'middle' : 'right';
                  const current = isRightBoundaryMiddle ? middleGap : rightGap;
                  const newValue = Math.max(0, Math.round((current - 0.5) * 10) / 10);
                  if (isRightBoundaryMiddle) { setMiddleGap(newValue); } else { setRightGap(newValue); }
                  updateGap(key, newValue);
                }}
              >
                −
              </button>
              <input
                type="number"
                value={isRightBoundaryMiddle ? middleGap : rightGap}
                onChange={(e) => handleInputChange(isRightBoundaryMiddle ? 'middle' : 'right', e.target.value)}
                onBlur={() => handleInputBlur(isRightBoundaryMiddle ? 'middle' : 'right')}
                className={styles.gapInput}
                min="0"
                max="5"
                step="0.5"
              />
              <button
                className={styles.controlButton}
                onClick={() => {
                  const key = isRightBoundaryMiddle ? 'middle' : 'right';
                  const current = isRightBoundaryMiddle ? middleGap : rightGap;
                  const newValue = Math.min(5, Math.round((current + 0.5) * 10) / 10);
                  if (isRightBoundaryMiddle) { setMiddleGap(newValue); } else { setRightGap(newValue); }
                  updateGap(key, newValue);
                }}
              >
                +
              </button>
            </div>
          </div>
          )}
          {/* 경계 이격거리 — 단내림+커튼박스 동시 활성 시 2개 표시 */}
          {hasMultipleBoundaries && (<>
          {/* 메인↔단내림 경계이격 (middle) */}
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              {droppedPosition === 'left' ? '단↔메' : '메↔단'}
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
          {/* 단내림↔커튼박스 경계이격 (middle2) */}
          <div className={styles.gapItem}>
            <label className={styles.gapLabel}>
              {droppedPosition === 'left' ? '커↔단' : '단↔커'}
            </label>
            <div className={styles.gapControl}>
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.max(0, Math.round((middle2Gap - 0.5) * 10) / 10);
                  setMiddle2Gap(newValue);
                  updateGap('middle2', newValue);
                }}
              >
                −
              </button>
              <input
                type="number"
                value={middle2Gap}
                onChange={(e) => handleInputChange('middle2', e.target.value)}
                onBlur={() => handleInputBlur('middle2')}
                className={styles.gapInput}
                min="0"
                max="5"
                step="0.5"
              />
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.min(5, Math.round((middle2Gap + 0.5) * 10) / 10);
                  setMiddle2Gap(newValue);
                  updateGap('middle2', newValue);
                }}
              >
                +
              </button>
            </div>
          </div>
          </>)}
        </div>
        {(() => {
          const leftVal = isLeftBoundaryMiddle ? middleGap : leftGap;
          const rightVal = isRightBoundaryMiddle ? middleGap : rightGap;
          return ((showLeft && leftVal < 1.5) || (showRight && rightVal < 1.5)) ? (
            <p style={{ color: '#e53e3e', fontSize: '11px', margin: '6px 0 0', fontWeight: 500 }}>
              이격거리 1.5mm 이상을 권장
            </p>
          ) : null;
        })()}
      </div>
    </div>
  );
};

export default GapControls;
