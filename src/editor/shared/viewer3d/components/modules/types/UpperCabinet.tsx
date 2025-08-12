import React from 'react';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import IndirectLight from '../IndirectLight';
import DoorModule from '../DoorModule';

/**
 * 상부장 컴포넌트
 * - 상부장 선반형, 오픈형, 혼합형을 모두 처리
 * - 공통 렌더링 로직 사용
 */
const UpperCabinet: React.FC<FurnitureTypeProps> = ({
  moduleData,
  color,
  isDragging = false,
  isEditMode = false,
  internalHeight,
  hasDoor = false,
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  doorWidth,
  doorXOffset = 0,
  originalSlotWidth,
  slotIndex,
  slotCenterX,
  adjustedWidth,
  showFurniture = true
}) => {
  const { renderMode } = useSpace3DView();
  
  // 공통 가구 로직 사용
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth
  });

  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <BaseFurnitureShell {...baseFurniture} isDragging={isDragging} isEditMode={isEditMode}>
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
              renderMode={renderMode}
            />
          )}
        </BaseFurnitureShell>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          moduleData={moduleData}
          isDragging={isDragging}
          isEditMode={isEditMode}
        slotIndex={slotIndex}
        />
      )}
    </>
  );
};

export default UpperCabinet;