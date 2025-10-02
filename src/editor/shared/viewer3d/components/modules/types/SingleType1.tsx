import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';

/**
 * SingleType1 컴포넌트
 * - 2단 서랍 + 옷장 복합형 (single-2drawer-hanging)
 * - ID 패턴: single-2drawer-hanging-*
 * - 구조: 하단 2단서랍 + 상단 옷장
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const SingleType1: React.FC<FurnitureTypeProps> = ({
  moduleData,
  color,
  internalHeight,
  hasDoor,
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  isDragging = false,
  isEditMode = false,
  doorWidth,
  adjustedWidth,
  originalSlotWidth,
  slotIndex,
  slotInfo,
  slotCenterX,
  showFurniture = true,
  isHighlighted = false,
  furnitureId
}) => {
  // 간접조명 관련 상태
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();
  
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    isHighlighted,
    
  });

  const {
    width,
    height,
    depth,
    innerWidth,
    innerHeight,
    basicThickness,
    backPanelThickness,
    adjustedDepthForShelves,
    shelfZOffset,
    material,
    mmToThreeUnits,
    isMultiSectionFurniture,
    getSectionHeights,
    actualDepthMm
  } = baseFurniture;

  const { renderMode } = useSpace3DView();
  
  // 띄워서 배치 여부 확인
  const placementType = spaceInfo?.baseConfig?.placementType;
  const isFloating = placementType === 'float';
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  const showIndirectLight = false;
  
  console.log('🔥 SingleType1 간접조명 체크:', {
    moduleId: moduleData.id,
    placementType,
    isFloating,
    floatHeight,
    isDragging,
    indirectLightEnabled,
    showIndirectLight
  });

  return (
    <>
      {/* 띄워서 배치 시 간접조명 효과 */}
      {showIndirectLight && (
        <>
          {console.log('🌟 SingleType1 간접조명 렌더링:', {
            showIndirectLight,
            width: innerWidth * 1.5,
            depth: depth * 1.5,
            intensity: indirectLightIntensity || 0.8,
            position: [0, -height/2 - 0.02, 0]
          })}
          <IndirectLight
            width={innerWidth * 1.5}
            depth={depth * 1.5}
            intensity={indirectLightIntensity || 0.8}
            position={[0, -height/2 - 0.02, 0]}
          />
        </>
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <BaseFurnitureShell 
          {...baseFurniture} 
          isDragging={isDragging} 
          isEditMode={isEditMode} 
          isHighlighted={isHighlighted}
          
          
        >
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
              furnitureId={moduleData.id}
              isHighlighted={isHighlighted}
            />
          )}
        </BaseFurnitureShell>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) - 단, 기둥 A(deep) 침범 시에는 FurnitureItem에서 별도 렌더링 */}
      {hasDoor && spaceInfo && 
       !(slotInfo && slotInfo.hasColumn && (slotInfo.columnType === 'deep' || adjustedWidth !== undefined)) && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          isDragging={isDragging}
          isEditMode={isEditMode}
          moduleData={moduleData}
          originalSlotWidth={originalSlotWidth || doorWidth}
          slotIndex={slotIndex}
          slotCenterX={slotCenterX}
        />
      )}
    </>
  );
};

export default SingleType1; 