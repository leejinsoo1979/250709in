import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DoorModule from '../DoorModule';
import { ClothingRod } from '../components/ClothingRod';

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
  adjustedWidth, // adjustedWidth 추가
  customSections, // 사용자 정의 섹션 설정
  placedFurnitureId,
  showFurniture = true, // 가구 본체 표시 여부
  visibleSectionIndex = null // 듀얼 가구 섹션 필터링 (이 타입은 대칭이므로 사용하지 않음)
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 전달
    adjustedWidth, // adjustedWidth 전달
    customSections // 사용자 정의 섹션 설정
  });

  const { renderMode } = useSpace3DView();

  return (
    <>
      <BaseFurnitureShell {...baseFurniture} isDragging={isDragging} isEditMode={isEditMode} spaceInfo={spaceInfo} moduleData={moduleData} placedFurnitureId={placedFurnitureId} showFurniture={showFurniture}>
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

            {/* 옷걸이 봉 렌더링 - hanging 섹션에만 */}
            {(() => {
              const sections = baseFurniture.modelConfig?.sections || [];
              const { height, innerWidth, basicThickness, mmToThreeUnits, adjustedDepthForShelves, depth } = baseFurniture;

              return sections.map((section: any, sectionIndex: number) => {
                if (section.type !== 'hanging') return null;

                // 섹션 높이 계산
                const sectionHeight = baseFurniture.calculateSectionHeight(section, height);
                let sectionBottomY = -height / 2 + basicThickness;

                for (let i = 0; i < sectionIndex; i++) {
                  sectionBottomY += baseFurniture.calculateSectionHeight(sections[i], height);
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
                  // 마감 패널이 있는 경우 (하부섹션): 브라켓 윗면이 마감 패널 하단에서 27mm 아래
                  const finishPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                  rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
                } else {
                  // 안전선반도 마감 패널도 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
                  const sectionTopPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                  rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75);
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

      {/* 도어는 showFurniture와 관계없이 항상 렌더링 (도어 도면 출력용) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          doorXOffset={0} // 도어 위치 고정 (커버 방식)
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX} // FurnitureItem에서 전달받은 보정값 사용
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
