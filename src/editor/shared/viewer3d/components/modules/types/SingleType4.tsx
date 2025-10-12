import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import IndirectLight from '../IndirectLight';
import DoorModule from '../DoorModule';
import { ClothingRod } from '../components/ClothingRod';

/**
 * SingleType4 컴포넌트
 * - 4단 서랍 + 옷장 복합형 (single-4drawer-hanging)
 * - ID 패턴: single-4drawer-hanging-*
 * - 구조: 하단 4단서랍 + 상단 옷장
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const SingleType4: React.FC<FurnitureTypeProps> = ({
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
  originalSlotWidth,
  slotIndex,
  slotCenterX,
  adjustedWidth,
  slotInfo,
  showFurniture = true,
  placedFurnitureId
}) => {
  // 공통 로직 사용
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth
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
    getSectionHeights
  } = baseFurniture;

  const { renderMode } = useSpace3DView();
  
  // 띄워서 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === "float";
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  const showIndirectLight = false;

  return (
    <>
      {/* 간접조명은 BoxModule에서 처리 */}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <BaseFurnitureShell {...baseFurniture} isDragging={isDragging} isEditMode={isEditMode} spaceInfo={spaceInfo} moduleData={moduleData} placedFurnitureId={placedFurnitureId}>
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

                  // 4단서랍장: 하단은 서랍, 상단은 옷장
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
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX || 0}
        slotIndex={slotIndex}
        />
      )}
    </>
  );
};

export default SingleType4; 