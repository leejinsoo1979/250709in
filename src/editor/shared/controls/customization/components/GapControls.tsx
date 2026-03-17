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

  // 표시할 gap 항목 목록 구성
  type GapEntry = { label: string; key: 'left' | 'right' | 'middle' | 'middle2'; value: number; setter: (v: number) => void };
  const gapEntries: GapEntry[] = [];

  if (showLeft) {
    const key = isLeftBoundaryMiddle ? 'middle' as const : 'left' as const;
    const value = isLeftBoundaryMiddle ? middleGap : leftGap;
    const setter = isLeftBoundaryMiddle ? setMiddleGap : setLeftGap;
    gapEntries.push({ label: '좌이격', key, value, setter });
  }
  if (hasMultipleBoundaries) {
    gapEntries.push({
      label: droppedPosition === 'left' ? '단↔메' : '메↔단',
      key: 'middle', value: middleGap, setter: setMiddleGap
    });
    gapEntries.push({
      label: droppedPosition === 'left' ? '커↔단' : '단↔커',
      key: 'middle2', value: middle2Gap, setter: setMiddle2Gap
    });
  }
  if (showRight) {
    const key = isRightBoundaryMiddle ? 'middle' as const : 'right' as const;
    const value = isRightBoundaryMiddle ? middleGap : rightGap;
    const setter = isRightBoundaryMiddle ? setMiddleGap : setRightGap;
    gapEntries.push({ label: '우이격', key, value, setter });
  }

  return (
    <div className={styles.configSection}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionDot}></span>
        <h3 className={styles.sectionTitle}>이격거리 설정 (0-5mm)</h3>
      </div>

      <div className={styles.content}>
        {/* 1행: 라벨 */}
        <div className={styles.gapRow}>
          {gapEntries.map((entry) => (
            <span key={`label-${entry.key}`} className={styles.gapCellLabel}>{entry.label}</span>
          ))}
        </div>
        {/* 2행: 숫자 컨트롤 */}
        <div className={styles.gapRow}>
          {gapEntries.map((entry) => (
            <div key={`ctrl-${entry.key}`} className={styles.gapCellControl}>
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.max(0, Math.round((entry.value - 0.5) * 10) / 10);
                  entry.setter(newValue);
                  updateGap(entry.key, newValue);
                }}
              >−</button>
              <input
                type="number"
                value={entry.value}
                onChange={(e) => handleInputChange(entry.key, e.target.value)}
                onBlur={() => handleInputBlur(entry.key)}
                className={styles.gapInput}
                min="0" max="5" step="0.5"
              />
              <button
                className={styles.controlButton}
                onClick={() => {
                  const newValue = Math.min(5, Math.round((entry.value + 0.5) * 10) / 10);
                  entry.setter(newValue);
                  updateGap(entry.key, newValue);
                }}
              >+</button>
            </div>
          ))}
        </div>
        {(() => {
          const leftVal = isLeftBoundaryMiddle ? middleGap : leftGap;
          const rightVal = isRightBoundaryMiddle ? middleGap : rightGap;
          return ((showLeft && leftVal < 1.5) || (showRight && rightVal < 1.5)) ? (
            <p style={{ color: '#e53e3e', fontSize: '11px', margin: '4px 0 0', fontWeight: 500 }}>
              이격거리 1.5mm 이상을 권장
            </p>
          ) : null;
        })()}
      </div>
    </div>
  );
};

export default GapControls;
