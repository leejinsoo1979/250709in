import React, { useEffect, useRef } from 'react';
import { SpaceInfo, SurroundType } from '@/store/core/spaceConfigStore';
import styles from '../styles/common.module.css';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useSurroundCalculations } from './hooks/useSurroundCalculations';
import SurroundTypeSelector from './components/SurroundTypeSelector';
import GapControls from './components/GapControls';
import FrameSizeControls from './components/FrameSizeControls';

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
  const isSurround = spaceInfo.surroundType === 'surround';
  const isNoSurround = spaceInfo.surroundType === 'no-surround';
  const hasLeftWall = spaceInfo.wallConfig.left;
  const hasRightWall = spaceInfo.wallConfig.right;
  const END_PANEL_WIDTH = 18; // 고정 18mm

  // frameSize는 spaceInfo에서 직접 가져옴 (FrameSizeControls가 자체 문자열 상태 관리)
  const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 10 };

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

  // 서라운드 타입 변경 처리
  const handleSurroundTypeChange = (type: SurroundType) => {
    console.log('🔧 SurroundControls - handleSurroundTypeChange called:', type);
    const updates: Partial<SpaceInfo> = {
      surroundType: type,
    };

    if (type === 'surround') {
      // 서라운드 모드: 설치 타입에 따라 프레임 크기 결정
      const installType = spaceInfo.installType;
      
      if (installType === 'builtin' || installType === 'built-in') {
        // 양쪽벽: 기본 프레임 50mm
        updates.frameSize = {
          left: 50,
          right: 50,
          top: 10,
        };
      } else if (installType === 'semistanding' || installType === 'semi-standing') {
        // 한쪽벽: 벽 있는 쪽은 50mm, 없는 쪽은 20mm
        updates.frameSize = {
          left: hasLeftWall ? 50 : END_PANEL_WIDTH,
          right: hasRightWall ? 50 : END_PANEL_WIDTH,
          top: 10,
        };
      } else if (installType === 'freestanding') {
        // 벽없음: 양쪽 모두 20mm 엔드패널 (서라운드에서는 frameSize로 관리)
        updates.frameSize = {
          left: END_PANEL_WIDTH,
          right: END_PANEL_WIDTH,
          top: 10,
        };
      }
      
      // 서라운드 모드에서도 gapConfig 기본값 유지
      updates.gapConfig = {
        left: 2,
        right: 2
      };
    } else {
      // 노서라운드(타이트) 설정
      
      // 노서라운드에서도 상부프레임은 필요하므로 기존 값 유지 또는 기본값 설정
      // (Firebase는 undefined를 허용하지 않음)
      updates.frameSize = { 
        left: 0, 
        right: 0, 
        top: spaceInfo.frameSize?.top || 10  // 상부프레임은 유지 (기본값 10mm)
      };
      
      // 빌트인 모드에서는 스토어가 자동으로 최적 이격거리를 계산함
      // 세미스탠딩/프리스탠딩일 때만 수동 설정
      if (spaceInfo.installType !== 'builtin' && spaceInfo.installType !== 'built-in') {
        const gapSizeValue = 2; // 기본 이격거리
        updates.gapConfig = {
          left: hasLeftWall ? gapSizeValue : 0,
          right: hasRightWall ? gapSizeValue : 0,
        };
      }
      // builtin의 경우 gapConfig를 설정하지 않아 스토어가 자동 계산하도록 함
    }

    onUpdate(updates);
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
      numValue = dimension === 'top' ? 10 : 50;
    }

    // 범위 검증
    if (dimension === 'left' || dimension === 'right') {
      if (numValue < 40) numValue = 40;
      if (numValue > 100) numValue = 100;
    } else {
      if (numValue < 10) numValue = 10;
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
      // Enter 키: 현재 input 값을 가져와서 store 업데이트
      const input = e.target as HTMLInputElement;
      let value = parseInt(input.value, 10);

      // 유효하지 않은 숫자라면 기본값 사용
      if (isNaN(value)) {
        value = dimension === 'top' ? 10 : 50;
      }

      // 범위 검증
      if (dimension === 'left' || dimension === 'right') {
        if (value < 40) value = 40;
        if (value > 100) value = 100;
      } else {
        if (value < 10) value = 10;
        if (value > 200) value = 200;
      }

      // store 업데이트
      if (spaceInfo.frameSize) {
        onUpdate({
          frameSize: {
            ...spaceInfo.frameSize,
            [dimension]: value,
          },
        });
      }

      // blur 처리
      input.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();

      const currentValue = frameSize[dimension];
      
      let minValue, maxValue;
      if (dimension === 'left' || dimension === 'right') {
        minValue = 40;
        maxValue = 100;
      } else {
        minValue = 10;
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
      {/* 서라운드 타입 선택 */}
      <SurroundTypeSelector
        surroundType={spaceInfo.surroundType || 'surround'}
        onSurroundTypeChange={handleSurroundTypeChange}
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
        surroundFrameWidth={surroundFrameWidth}
        noSurroundFrameWidth={noSurroundFrameWidth}
        gapSize={2}
        spaceWidth={spaceInfo.width}
        columnInfo={columnInfo}
        onFrameSizeChange={handleFrameSizeChange}
        onFrameSizeBlur={handleFrameSizeBlur}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};

export default SurroundControls; 