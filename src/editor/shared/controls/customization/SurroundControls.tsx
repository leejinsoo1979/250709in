import React, { useEffect, useRef } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import styles from '../styles/common.module.css';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSurroundCalculations } from './hooks/useSurroundCalculations';
import SurroundTypeSelector from './components/SurroundTypeSelector';
import GapControls from './components/GapControls';
import FrameSizeControls from './components/FrameSizeControls';
import { inferFrameConfig } from '@/editor/shared/utils/frameConfigBridge';

interface SurroundControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  disabled?: boolean;
}

const SurroundControls: React.FC<SurroundControlsProps> = ({ spaceInfo, onUpdate, disabled = false }) => {
  // 파생 상태 스토어 사용
  const derivedStore = useDerivedSpaceStore();

  // 이전 spaceInfo 값을 추적하여 불필요한 재계산 방지
  const prevSpaceInfoRef = useRef(spaceInfo);

  // 기존 로컬 상태들
  const frameConfig = inferFrameConfig(spaceInfo);
  const isSurround = spaceInfo.surroundType === 'surround';
  const isNoSurround = spaceInfo.surroundType === 'no-surround';
  const hasLeftWall = spaceInfo.wallConfig.left;
  const hasRightWall = spaceInfo.wallConfig.right;
  const END_PANEL_WIDTH = 18; // 고정 18mm

  // frameSize는 spaceInfo에서 직접 가져옴 (FrameSizeControls가 자체 문자열 상태 관리)
  const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 30 };

  // 계산 로직을 커스텀 훅으로 분리
  const { noSurroundFrameWidth, surroundFrameWidth, columnInfo } = useSurroundCalculations(
    spaceInfo,
    hasLeftWall,
    hasRightWall
  );

  // 파생 상태 스토어 동기화 - spaceInfo 변경 시 재계산
  useEffect(() => {
    const prev = prevSpaceInfoRef.current;
    const current = spaceInfo;

    // 실제로 중요한 값들이 변경되었을 때만 재계산
    if (
      prev.width !== current.width ||
      prev.surroundType !== current.surroundType ||
      JSON.stringify(prev.frameSize) !== JSON.stringify(current.frameSize) ||
      JSON.stringify(prev.gapConfig) !== JSON.stringify(current.gapConfig) ||
      prev.customColumnCount !== current.customColumnCount
    ) {
      derivedStore.recalculateFromSpaceInfo(spaceInfo);
      prevSpaceInfoRef.current = spaceInfo;
    }
  }, [spaceInfo, derivedStore]);

  // 벽이 없는 쪽은 항상 18mm 엔드 패널로 유지
  useEffect(() => {
    if (isSurround && spaceInfo.frameSize) {
      let needsUpdate = false;
      const updates = { ...spaceInfo.frameSize };

      if (!hasLeftWall && updates.left !== END_PANEL_WIDTH) {
        updates.left = END_PANEL_WIDTH;
        needsUpdate = true;
      }

      if (!hasRightWall && updates.right !== END_PANEL_WIDTH) {
        updates.right = END_PANEL_WIDTH;
        needsUpdate = true;
      }

      if (needsUpdate) {
        onUpdate({ frameSize: updates });
      }
    }
  }, [isSurround, hasLeftWall, hasRightWall, spaceInfo.frameSize, onUpdate]);

  // 서라운드 모드 변경 처리
  const handleModeChange = (mode: 'full-surround' | 'sides-only' | 'no-surround') => {
    console.log('🔧 SurroundControls - handleModeChange called:', mode);

    if (mode === 'full-surround') {
      // 전체서라운드: 기존 서라운드 + frameConfig top/bottom 활성
      const updates: Partial<SpaceInfo> = { surroundType: 'surround' };
      const installType = spaceInfo.installType;
      const currentTop = spaceInfo.frameSize?.top || 30;

      if (installType === 'builtin' || installType === 'built-in') {
        updates.frameSize = { left: 50, right: 50, top: currentTop };
      } else if (installType === 'semistanding' || installType === 'semi-standing') {
        updates.frameSize = {
          left: hasLeftWall ? 50 : END_PANEL_WIDTH,
          right: hasRightWall ? 50 : END_PANEL_WIDTH,
          top: currentTop,
        };
      } else if (installType === 'freestanding') {
        updates.frameSize = { left: END_PANEL_WIDTH, right: END_PANEL_WIDTH, top: currentTop };
      }

      updates.gapConfig = { left: 2, right: 2, middle: spaceInfo.gapConfig?.middle ?? 1.5 };
      updates.frameConfig = { left: true, right: true, top: true, bottom: true };
      // 전체서라운드 시 도어 상단갭 = 상부프레임 두께 + 3mm
      updates.doorTopGap = currentTop + 3;

      onUpdate(updates);

      // 전체서라운드: EP 있는 가구의 옵셋을 23으로 설정
      const { placedModules, updatePlacedModule } = useFurnitureStore.getState();
      console.log('🔧 전체서라운드 EP 옵셋 업데이트:', placedModules.length, '개 가구');
      placedModules.forEach(m => {
        const epUpdate: Record<string, number> = {};
        if (m.hasLeftEndPanel) epUpdate.leftEndPanelOffset = 23;
        if (m.hasRightEndPanel) epUpdate.rightEndPanelOffset = 23;
        if (Object.keys(epUpdate).length > 0) {
          console.log('🔧 EP 옵셋 설정:', m.id, epUpdate);
          updatePlacedModule(m.id, epUpdate);
        }
      });
    } else if (mode === 'sides-only') {
      // 양쪽서라운드 = 기존 서라운드 그대로, frameConfig만 구분용으로 변경
      onUpdate({
        surroundType: 'surround',
        frameConfig: { ...frameConfig, top: false, bottom: false },
        doorTopGap: 3, // 양쪽서라운드: 상단갭 3mm
      });

      // 양쪽서라운드: EP 옵셋을 0으로 리셋
      const { placedModules, updatePlacedModule } = useFurnitureStore.getState();
      console.log('🔧 양쪽서라운드 EP 옵셋 리셋:', placedModules.length, '개 가구');
      placedModules.forEach(m => {
        const epUpdate: Record<string, number> = {};
        if (m.hasLeftEndPanel) epUpdate.leftEndPanelOffset = 0;
        if (m.hasRightEndPanel) epUpdate.rightEndPanelOffset = 0;
        if (Object.keys(epUpdate).length > 0) {
          console.log('🔧 EP 옵셋 리셋:', m.id, epUpdate);
          updatePlacedModule(m.id, epUpdate);
        }
      });
    } else {
      // 노서라운드
      const updates: Partial<SpaceInfo> = { surroundType: 'no-surround' };
      updates.frameSize = {
        left: 0,
        right: 0,
        top: spaceInfo.frameSize?.top || 30
      };

      if (spaceInfo.installType !== 'builtin' && spaceInfo.installType !== 'built-in') {
        updates.gapConfig = {
          left: hasLeftWall ? 2 : 0,
          right: hasRightWall ? 2 : 0,
          middle: spaceInfo.gapConfig?.middle ?? 1.5,
        };
      }

      updates.frameConfig = { left: false, right: false, top: true, bottom: false };
      updates.doorTopGap = 5; // 노서라운드: 기본 상단갭 5mm
      onUpdate(updates);

      // 노서라운드: EP 옵셋을 0으로 리셋
      const { placedModules, updatePlacedModule } = useFurnitureStore.getState();
      placedModules.forEach(m => {
        const epUpdate: Record<string, number> = {};
        if (m.hasLeftEndPanel) epUpdate.leftEndPanelOffset = 0;
        if (m.hasRightEndPanel) epUpdate.rightEndPanelOffset = 0;
        if (Object.keys(epUpdate).length > 0) updatePlacedModule(m.id, epUpdate);
      });
    }
  };

  // 프레임 크기 변경 핸들러 (FrameSizeControls가 자체 문자열 상태 관리, 여기서는 사용 안함)
  const handleFrameSizeChange = (_dimension: 'left' | 'right' | 'top', _value: string) => {
    // FrameSizeControls가 자체적으로 입력 상태를 관리하므로 여기서는 아무것도 하지 않음
  };

  // 프레임 크기 업데이트 (blur 시) - FrameSizeControls에서 호출
  const handleFrameSizeBlur = (dimension: 'left' | 'right' | 'top', value: string) => {
    // 벽이 없는 쪽은 수정 불가능
    if ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall)) {
      return;
    }

    let numValue = parseInt(value, 10);

    // 유효하지 않은 숫자라면 기본값 사용
    if (isNaN(numValue)) {
      numValue = dimension === 'top' ? 30 : 50;
    }

    // 범위 검증
    if (dimension === 'left' || dimension === 'right') {
      if (numValue < 40) numValue = 40;
      if (numValue > 100) numValue = 100;
    } else {
      if (numValue < 30) numValue = 30;
      if (numValue > 200) numValue = 200;
    }

    // store 업데이트
    if (spaceInfo.frameSize) {
      onUpdate({
        frameSize: {
          ...spaceInfo.frameSize,
          [dimension]: numValue,
        },
      });
    }
  };

  // Enter 키 및 화살표 키 처리
  const handleKeyDown = (e: React.KeyboardEvent, dimension: 'left' | 'right' | 'top') => {
    // 벽이 없는 쪽은 수정 불가능
    if ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall)) {
      return;
    }

    if (e.key === 'Enter') {
      const input = e.target as HTMLInputElement;
      let value = parseInt(input.value, 10);

      if (isNaN(value)) {
        value = dimension === 'top' ? 30 : 50;
      }

      if (dimension === 'left' || dimension === 'right') {
        if (value < 40) value = 40;
        if (value > 100) value = 100;
      } else {
        if (value < 30) value = 30;
        if (value > 200) value = 200;
      }

      if (spaceInfo.frameSize) {
        onUpdate({
          frameSize: {
            ...spaceInfo.frameSize,
            [dimension]: value,
          },
        });
      }

      input.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();

      const currentValue = frameSize[dimension];

      let minValue, maxValue;
      if (dimension === 'left' || dimension === 'right') {
        minValue = 40;
        maxValue = 100;
      } else {
        minValue = 30;
        maxValue = 200;
      }

      let newValue;
      if (e.key === 'ArrowUp') {
        newValue = Math.min(currentValue + 1, maxValue);
      } else {
        newValue = Math.max(currentValue - 1, minValue);
      }

      if (newValue !== currentValue && spaceInfo.frameSize) {
        onUpdate({
          frameSize: {
            ...spaceInfo.frameSize,
            [dimension]: newValue,
          },
        });
      }
    }
  };


  return (
    <div className={styles.container}>
      {/* 서라운드 모드 선택 */}
      <SurroundTypeSelector
        surroundType={spaceInfo.surroundType || 'surround'}
        frameConfig={frameConfig}
        onModeChange={handleModeChange}
        disabled={disabled}
      />

      {/* 노서라운드 선택 시 이격거리 설정 (빌트인 - 양쪽 벽이 모두 있는 경우에만) */}
      {isNoSurround && hasLeftWall && hasRightWall && (
        <GapControls
          spaceInfo={spaceInfo}
          onUpdate={onUpdate}
        />
      )}

      {/* 프레임 크기 설정 */}
      <FrameSizeControls
        frameSize={frameSize}
        hasLeftWall={hasLeftWall}
        hasRightWall={hasRightWall}
        isSurround={isSurround}
        frameConfig={frameConfig}
        surroundFrameWidth={surroundFrameWidth}
        noSurroundFrameWidth={noSurroundFrameWidth}
        gapSize={2}
        spaceWidth={spaceInfo.width}
        columnInfo={columnInfo}
        onFrameSizeChange={handleFrameSizeChange}
        onFrameSizeBlur={handleFrameSizeBlur}
        onKeyDown={handleKeyDown}
        droppedCeilingPosition={spaceInfo.droppedCeiling?.enabled ? spaceInfo.droppedCeiling.position : undefined}
        middleGap={spaceInfo.gapConfig?.middle ?? 1.5}
        onMiddleGapChange={(value) => {
          onUpdate({
            gapConfig: {
              ...spaceInfo.gapConfig,
              left: spaceInfo.gapConfig?.left ?? 1.5,
              right: spaceInfo.gapConfig?.right ?? 1.5,
              middle: value,
            },
          });
        }}
      />
    </div>
  );
};

export default SurroundControls;
