import React from 'react';
import { ModuleData } from '../../../../../data/modules/shelving';
import { SpaceInfo, useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer } from './shared';
import DoorModule from './DoorModule';
import { useSpace3DView } from '../../context/useSpace3DView';
import SingleType1 from './types/SingleType1';
import SingleType2 from './types/SingleType2';
import SingleType4 from './types/SingleType4';
import DualType1 from './types/DualType1';
import DualType2 from './types/DualType2';
import DualType4 from './types/DualType4';
import DualType5 from './types/DualType5';
import DualType6 from './types/DualType6';

interface BoxModuleProps {
  moduleData: ModuleData;
  color?: string;
  isDragging?: boolean;
  internalHeight?: number;
  hasDoor?: boolean;
  customDepth?: number;
  hingePosition?: 'left' | 'right';
  spaceInfo?: SpaceInfo;
  doorWidth?: number; // 도어 너비 (사용하지 않음 - 도어는 항상 원래 슬롯 크기)
  doorXOffset?: number; // 도어 위치 보정값 (사용하지 않음)
  originalSlotWidth?: number; // 원래 슬롯 너비 (mm)
  slotCenterX?: number; // 원래 슬롯 중심 X 좌표 (Three.js 단위)
  adjustedWidth?: number; // 기둥/엔드판넬에 의해 조정된 폭 (mm)
}

/**
 * BoxModule 컴포넌트 (공통 로직 사용)
 * 
 * 1. 타입별 라우팅: 주요 타입들은 개별 컴포넌트로 라우팅
 * 2. 특수 케이스: DualType5/6 같은 복잡한 케이스는 별도 처리
 * 3. 일반 폴백: 나머지 케이스들은 공통 로직 사용
 */
const BoxModule: React.FC<BoxModuleProps> = ({
  moduleData,
  color,
  isDragging = false,
  internalHeight,
  hasDoor = false,
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  doorWidth,
  doorXOffset = 0,
  originalSlotWidth,
  slotCenterX,
  adjustedWidth
}) => {
  // === React Hooks는 항상 최상단에서 호출 ===
  useSpaceConfigStore(); // Hook 순서 보장을 위해 호출 (실제로는 사용하지 않음)
  
  // 공통 로직도 항상 호출 (조건부 사용)
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    adjustedWidth
  });
  
  // === 1단계: 타입별 라우팅 (주요 타입들) ===
  if (moduleData.id.includes('dual-4drawer-hanging')) {
    return (
      <DualType4
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }
  
  if (moduleData.id.includes('dual-2drawer-hanging')) {
    return (
      <DualType1
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }
  
  if (moduleData.id.includes('dual-2hanging')) {
    return (
      <DualType2
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }
  
  if (moduleData.id.includes('single-4drawer-hanging')) {
    return (
      <SingleType4
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }
  
  if (moduleData.id.includes('single-2drawer-hanging')) {
    return (
      <SingleType1
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }
  
  if (moduleData.id.includes('single-2hanging')) {
    return (
      <SingleType2
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }

  if (moduleData.id.includes('dual-2drawer-styler')) {
    return (
      <DualType5
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }

  if (moduleData.id.includes('dual-4drawer-pantshanger')) {
    return (
      <DualType6
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
      />
    );
  }

  // === 2단계: 일반 폴백 케이스 (공통 로직 사용) ===
  // 나머지 케이스들을 공통 로직으로 처리
  return (
    <BaseFurnitureShell {...baseFurniture}>
      {/* 드래그 중이 아닐 때만 내부 구조 렌더링 */}
      {!isDragging && (
        <SectionsRenderer
          modelConfig={baseFurniture.modelConfig}
          height={baseFurniture.height}
          innerWidth={baseFurniture.innerWidth}
          depth={baseFurniture.depth}
          adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
          basicThickness={baseFurniture.basicThickness}
          shelfZOffset={baseFurniture.shelfZOffset}
          material={baseFurniture.material}
          calculateSectionHeight={baseFurniture.calculateSectionHeight}
          renderMode={useSpace3DView().renderMode}
        />
      )}
      
      {/* 도어는 항상 렌더링 (가구 식별에 중요) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width} // 무시됨
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          doorXOffset={0} // 사용하지 않음
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
        />
      )}
    </BaseFurnitureShell>
  );
};

export default BoxModule; 