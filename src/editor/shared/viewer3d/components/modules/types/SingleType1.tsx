import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import { ClothingRod } from '../components/ClothingRod';

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
  furnitureId,
  placedFurnitureId
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
    isHighlighted
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
          moduleData={moduleData}
          placedFurnitureId={placedFurnitureId}
          spaceInfo={spaceInfo}
        >
          {/* 드래그 중이 아닐 때만 내부 구조 렌더링 */}
          {!isDragging && (
            <>
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
                mmToThreeUnits={baseFurniture.mmToThreeUnits}
                renderMode={renderMode}
                furnitureId={moduleData.id}
                isHighlighted={isHighlighted}
                placedFurnitureId={placedFurnitureId}
              />

              {/* 옷걸이 봉 렌더링 - 상부 옷장 섹션에만 */}
              {(() => {
                const sections = baseFurniture.modelConfig.sections || [];
                let accumulatedY = -height/2 + basicThickness;

                return sections.map((section: any, sectionIndex: number) => {
                  const sectionHeight = baseFurniture.calculateSectionHeight(section, height, basicThickness);
                  const sectionBottomY = accumulatedY;
                  accumulatedY += sectionHeight;

                  // 2단서랍장: 하단은 서랍, 상단은 옷장
                  // 옷장 섹션(상부)에만 옷걸이 봉 렌더링
                  const isHangingSection = section.type === 'hanging';

                  if (!isHangingSection) {
                    return null;
                  }

                  // 안전선반 또는 마감 패널 위치 찾기
                  const safetyShelfPositionMm = section.shelfPositions?.find((pos: number) => pos > 0);
                  const hasFinishPanel = section.isTopFinishPanel && section.count === 1;

                  // 옷걸이 봉 Y 위치 계산
                  let rodYPosition: number;
                  if (safetyShelfPositionMm !== undefined) {
                    // 안전선반이 있는 경우: 브라켓 윗면이 안전선반 하단에 붙음
                    const safetyShelfY = sectionBottomY + mmToThreeUnits(safetyShelfPositionMm);
                    rodYPosition = safetyShelfY - basicThickness / 2 - mmToThreeUnits(75 / 2);
                  } else if (hasFinishPanel) {
                    // 마감 패널이 있는 경우: 브라켓 윗면이 마감 패널 하단에서 27mm 아래
                    const finishPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                    rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
                  } else {
                    // 안전선반도 마감 패널도 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
                    const sectionTopPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                    rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2);
                  }

                  return (
                    <ClothingRod
                      key={`clothing-rod-${sectionIndex}`}
                      innerWidth={innerWidth}
                      yPosition={rodYPosition}
                      zPosition={0}
                      renderMode={renderMode}
                      isDragging={false}
                      isEditMode={isEditMode}
                      adjustedDepthForShelves={adjustedDepthForShelves}
                      depth={depth}
                    />
                  );
                });
              })()}
            </>
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
