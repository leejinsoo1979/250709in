import React, { useState, useEffect, useRef } from 'react';
import { SpaceInfo, SurroundType, FrameSize } from '@/store/core/spaceConfigStore';
import styles from '../styles/common.module.css';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useSurroundCalculations } from './hooks/useSurroundCalculations';
import SurroundTypeSelector from './components/SurroundTypeSelector';
import GapControls from './components/GapControls';
import FrameSizeControls from './components/FrameSizeControls';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useAlert } from '@/contexts/AlertContext';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';

interface SurroundControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  disabled?: boolean;
}

const SurroundControls: React.FC<SurroundControlsProps> = ({ spaceInfo, onUpdate, disabled = false }) => {
  // 파생 상태 스토어 사용
  const derivedStore = useDerivedSpaceStore();
  
  // 가구 스토어와 Alert 훅 추가
  const placedModules = useFurnitureStore(state => state.placedModules);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const { showAlert } = useAlert();
  
  // 이전 spaceInfo 값을 추적하여 불필요한 재계산 방지
  const prevSpaceInfoRef = useRef(spaceInfo);
  
  // 기존 로컬 상태들
  const isSurround = spaceInfo.surroundType === 'surround';
  const isNoSurround = spaceInfo.surroundType === 'no-surround';
  const hasLeftWall = spaceInfo.wallConfig.left;
  const hasRightWall = spaceInfo.wallConfig.right;
  const END_PANEL_WIDTH = 18; // 고정 18mm

  const [frameSize, setFrameSize] = useState<FrameSize | any>(() => {
    if (!spaceInfo.frameSize) return { left: '50', right: '50', top: '50' };
    return {
      left: String(!hasLeftWall && isSurround ? END_PANEL_WIDTH : spaceInfo.frameSize.left),
      right: String(!hasRightWall && isSurround ? END_PANEL_WIDTH : spaceInfo.frameSize.right),
      top: String(spaceInfo.frameSize.top),
    };
  });

  // 서라운드 타입이 변경될 때만 frameSize 업데이트
  useEffect(() => {
    if (spaceInfo.frameSize) {
      setFrameSize({
        left: String(!hasLeftWall && isSurround ? END_PANEL_WIDTH : spaceInfo.frameSize.left),
        right: String(!hasRightWall && isSurround ? END_PANEL_WIDTH : spaceInfo.frameSize.right),
        top: String(spaceInfo.frameSize.top),
      });
    }
  }, [spaceInfo.surroundType]);


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
    
    // 노서라운드로 변경 시 엔드패널 슬롯의 듀얼 가구 체크
    if (type === 'no-surround') {
      const indexing = calculateSpaceIndexing(spaceInfo);
      const dualFurnituresInEndSlots: any[] = [];
      
      placedModules.forEach(module => {
        // 듀얼 가구인지 확인
        if (module.isDualSlot || module.moduleId.includes('dual-')) {
          const isFirstSlot = module.slotIndex === 0;
          const isLastSlot = module.slotIndex >= indexing.columnCount - 2; // 듀얼은 2슬롯 차지
          
          // 엔드패널이 있는 슬롯인지 확인
          const hasLeftEndPanel = isFirstSlot && (spaceInfo.installType === 'freestanding' || 
                                 (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right));
          const hasRightEndPanel = isLastSlot && (spaceInfo.installType === 'freestanding' || 
                                  (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left));
          
          if (hasLeftEndPanel || hasRightEndPanel) {
            dualFurnituresInEndSlots.push(module);
          }
        }
      });
      
      if (dualFurnituresInEndSlots.length > 0) {
        console.log('🚫 엔드패널 슬롯에 듀얼 가구 발견:', dualFurnituresInEndSlots);
        
        showAlert(
          `노서라운드 모드에서 듀얼 캐비닛은 커버 도어 적용이 불가합니다.\n해당 위치의 듀얼 캐비닛을 자동으로 제거합니다.`,
          { 
            title: '듀얼 캐비닛 제거 안내',
            onConfirm: () => {
              // 엔드패널 슬롯의 듀얼 가구들 제거
              dualFurnituresInEndSlots.forEach(module => {
                removeModule(module.id);
              });
            }
          }
        );
      }
    }
    
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
      const gapSizeValue = 2; // 기본 이격거리
      
      // 노서라운드에서는 프레임 크기를 기본값으로 설정
      // (Firebase는 undefined를 허용하지 않음)
      updates.frameSize = { left: 0, right: 0, top: 0 };
      
      updates.gapConfig = {
        left: hasLeftWall ? gapSizeValue : 0,
        right: hasRightWall ? gapSizeValue : 0,
      };
    }

    onUpdate(updates);
  };

  // 프레임 크기 변경 핸들러
  const handleFrameSizeChange = (dimension: 'left' | 'right' | 'top', value: string) => {
    // 서라운드 모드에서 벽이 없는 쪽은 수정 불가능 (18mm 고정)
    if (isSurround && ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall))) {
      return;
    }
    
    // 빈 문자열이면 그대로 허용 (삭제 가능하도록)
    if (value === '') {
      setFrameSize(prev => ({ ...prev, [dimension]: '' }));
      return;
    }
    
    // 숫자만 허용
    const numericValue = value.replace(/[^0-9]/g, '');
    
    // 로컬 상태 즉시 업데이트 (입력 필드 반영)
    setFrameSize(prev => ({ ...prev, [dimension]: numericValue }));
  };

  // 프레임 크기 업데이트 (blur 또는 Enter 시)
  const handleFrameSizeBlur = (dimension: 'left' | 'right' | 'top') => {
    if (!spaceInfo.frameSize) return;
    
    // 서라운드 모드에서 벽이 없는 쪽은 수정 불가능
    if (isSurround && ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall))) {
      return;
    }
    
    let value = frameSize[dimension];
    
    // 빈 문자열이면 기본값 설정
    if (value === '' || value === undefined || value === null) {
      value = dimension === 'top' ? 10 : 50;
    } else if (typeof value === 'string') {
      value = parseInt(value);
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

    // store 업데이트
    onUpdate({
      frameSize: {
        ...spaceInfo.frameSize,
        [dimension]: value,
      },
    });
  };

  // Enter 키 및 화살표 키 처리
  const handleKeyDown = (e: React.KeyboardEvent, dimension: 'left' | 'right' | 'top') => {
    if (e.key === 'Enter') {
      handleFrameSizeBlur(dimension);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      
      // 서라운드 모드에서 벽이 없는 쪽은 수정 불가능
      if (isSurround && ((dimension === 'left' && !hasLeftWall) || (dimension === 'right' && !hasRightWall))) {
        return;
      }
      
      const currentValue = typeof frameSize[dimension] === 'string' 
        ? (frameSize[dimension] === '' ? 0 : parseInt(frameSize[dimension] as string) || 0)
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