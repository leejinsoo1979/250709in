import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';

/**
 * DualType1 컴포넌트
 * - 2단 서랍 + 옷장 복합형 (dual-2drawer-hanging)
 * - ID 패턴: dual-2drawer-hanging-*
 * - 구조: 하단 2단서랍 + 상단 옷장 (듀얼 타입)
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const DualType1: React.FC<FurnitureTypeProps> = ({
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
  doorXOffset = 0,
  originalSlotWidth,
  slotIndex,
  slotCenterX,
  slotWidths,
  showFurniture = true,
  adjacentCabinets,
  adjustedWidth, // 조정된 너비 추가
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
    adjustedWidth, // 조정된 너비 전달
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 전달
    adjacentCabinets,
  });

  const { renderMode } = useSpace3DView();
  
  // 띄워서 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === 'float';
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  const showIndirectLight = false;
  
  console.log('🔥 DualType1 간접조명 체크:', {
    moduleId: moduleData.id,
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
          {console.log('🌟 DualType1 간접조명 렌더링:', {
            showIndirectLight,
            width: baseFurniture.innerWidth * 1.5,
            depth: baseFurniture.depth * 1.5,
            intensity: indirectLightIntensity || 0.8,
            position: [0, -baseFurniture.height/2 - 0.02, 0]
          })}
          <IndirectLight
            width={baseFurniture.innerWidth * 1.5}
            depth={baseFurniture.depth * 1.5}
            intensity={indirectLightIntensity || 0.8}
            position={[0, -baseFurniture.height/2 - 0.02, 0]}
          />
        </>
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <BaseFurnitureShell 
          {...baseFurniture} 
          isDragging={isDragging} 
          isEditMode={isEditMode}
          leftEndPanelMaterial={baseFurniture.leftEndPanelMaterial}
          rightEndPanelMaterial={baseFurniture.rightEndPanelMaterial}>
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
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX} // FurnitureItem에서 계산한 오프셋 사용
          slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
          isDragging={isDragging}
          isEditMode={isEditMode}
        slotIndex={slotIndex}
        />
      )}
    </>
  );
};

export default DualType1;