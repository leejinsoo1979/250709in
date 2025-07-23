import React, { useState, useEffect, useRef } from 'react';
import { SpaceInfo, SurroundType, FrameSize } from '@/store/core/spaceConfigStore';
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

  const [frameSize, setFrameSize] = useState<FrameSize>(() => {
    if (!spaceInfo.frameSize) return { left: 50, right: 50, top: 50 };
    return {
      left: !hasLeftWall && isSurround ? END_PANEL_WIDTH : spaceInfo.frameSize.left,
      right: !hasRightWall && isSurround ? END_PANEL_WIDTH : spaceInfo.frameSize.right,
      top: spaceInfo.frameSize.top,
    };
  });

  const [gapSize, setGapSize] = useState<2 | 3>((spaceInfo.gapConfig?.left as 2 | 3) || 2);

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
    const updates: Partial<SpaceInfo> = {
      surroundType: type,
    };

    if (type === 'surround') {
      updates.frameSize = {
        left: hasLeftWall ? 50 : END_PANEL_WIDTH,
        right: hasRightWall ? 50 : END_PANEL_WIDTH,
        top: 10,
      };
      updates.gapConfig = undefined;
    } else {
      // 노서라운드(타이트) 설정
      const gapSizeValue = 2; // 기본 이격거리
      
      updates.frameSize = {
        left: 0, // 좌측 프레임 제거
        right: 0, // 우측 프레임 제거
        top: 10, // 상단 프레임은 기본값 10mm 유지
      };
      
      updates.gapConfig = {
        left: gapSizeValue,
        right: gapSizeValue,
      };
    }

    onUpdate(updates);
  };

  // 프레임 크기 변경 핸들러
  const handleFrameSizeChange = (dimension: 'left' | 'right' | 'top', value: string) => {
    // 벽이 없는 쪽은 수정 불가능
    if ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall)) {
      return;
    }
    
    // 빈 문자열이거나 숫자인 경우에만 업데이트
    if (value === '' || (!isNaN(Number(value)) && Number(value) >= 0)) {
      const numValue = value === '' ? 0 : parseInt(value);
      const newFrameSize = { ...frameSize, [dimension]: numValue };
      setFrameSize(newFrameSize);
      
      // 실시간 업데이트: 유효한 숫자인 경우 즉시 store 업데이트
      if (value && !isNaN(Number(value)) && spaceInfo.frameSize) {
        let validatedValue = numValue;
        
        // 범위 검증
        if (dimension === 'left' || dimension === 'right') {
          if (validatedValue < 40) validatedValue = 40;
          if (validatedValue > 100) validatedValue = 100;
        } else {
          if (validatedValue < 10) validatedValue = 10;
          if (validatedValue > 200) validatedValue = 200;
        }
        
        // 즉시 store 업데이트
        onUpdate({
          frameSize: {
            ...spaceInfo.frameSize,
            [dimension]: validatedValue,
          },
        });
      }
    }
  };

  // 프레임 크기 업데이트 (blur 또는 Enter 시)
  const handleFrameSizeBlur = (dimension: 'left' | 'right' | 'top') => {
    if (!spaceInfo.frameSize) return;
    
    // 벽이 없는 쪽은 수정 불가능
    if ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall)) {
      return;
    }
    
    let value = frameSize[dimension];
    
    // 숫자로 변환
    if (typeof value === 'string') {
      value = value === '' ? 10 : parseInt(value);
    }
    
    // 유효하지 않은 숫자라면 기본값 사용
    if (isNaN(value)) {
      value = dimension === 'top' ? 10 : 50;
    }

    // 좌우 프레임은 40~100 범위, 상단 프레임은 10~200 범위
    if (dimension === 'left' || dimension === 'right') {
      if (value < 40) value = 40;
      if (value > 100) value = 100;
    } else {
      if (value < 10) value = 10;
      if (value > 200) value = 200;
    }

    // 로컬 상태 업데이트
    setFrameSize(prev => ({ ...prev, [dimension]: value }));

    // 값에 변화가 있을 때만 업데이트
    const currentValue = spaceInfo.frameSize[dimension as keyof typeof spaceInfo.frameSize];
    if (value !== currentValue) {
      onUpdate({
        frameSize: {
          ...spaceInfo.frameSize,
          [dimension]: value,
        },
      });
    }
  };

  // Enter 키 및 화살표 키 처리
  const handleKeyDown = (e: React.KeyboardEvent, dimension: 'left' | 'right' | 'top') => {
    if (e.key === 'Enter') {
      handleFrameSizeBlur(dimension);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      
      // 벽이 없는 쪽은 수정 불가능
      if ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall)) {
        return;
      }
      
      const currentValue = typeof frameSize[dimension] === 'string' 
        ? parseInt(frameSize[dimension] as string) || 0 
        : frameSize[dimension];
      
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
      
      if (newValue !== currentValue) {
        const newFrameSize = { ...frameSize, [dimension]: newValue };
        setFrameSize(newFrameSize);
        
        if (spaceInfo.frameSize) {
          onUpdate({
            frameSize: {
              ...spaceInfo.frameSize,
              [dimension]: newValue,
            },
          });
        }
      }
    }
  };

  // 이격 크기 변경 핸들러
  const handleGapSizeChange = (size: 2 | 3) => {
    setGapSize(size);
    onUpdate({
      gapConfig: {
        left: size,
        right: size,
      },
    });
  };

  return (
    <div className={styles.container}>
      {/* 서라운드 타입 선택 */}
      <SurroundTypeSelector
        surroundType={spaceInfo.surroundType || 'surround'}
        onSurroundTypeChange={handleSurroundTypeChange}
        disabled={disabled}
      />

      {/* 노서라운드 선택 시 이격거리 설정 */}
      {isNoSurround && (
        <GapControls
          gapSize={gapSize}
          onGapSizeChange={handleGapSizeChange}
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
        gapSize={gapSize}
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