import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import IndirectLight from '../IndirectLight';
import DoorModule from '../DoorModule';
import { ClothingRod } from '../components/ClothingRod';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';

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
  placedFurnitureId,
  textureUrl,
  panelGrainDirections,
  doorTopGap = 5,
  doorBottomGap = 25,
  doorSplit,
  upperDoorTopGap,
  upperDoorBottomGap,
  lowerDoorTopGap,
  lowerDoorBottomGap,
  lowerSectionDepth,
  upperSectionDepth,
  lowerSectionTopOffset,
  zone
}) => {
  // 공통 로직 사용
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    panelGrainDirections
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

  const { renderMode, viewMode } = useSpace3DView();
  const { view2DDirection } = useUIStore();

  // 띄워서 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === "float";
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  const showIndirectLight = false;

  // 디버그: zone 값 확인
  React.useEffect(() => {
    console.log('🚪🔴 SingleType4 - zone prop:', {
      zone,
      moduleId: moduleData.id,
      placedFurnitureId,
      droppedCeilingEnabled: spaceInfo?.droppedCeiling?.enabled,
      dropHeight: spaceInfo?.droppedCeiling?.dropHeight
    });
  }, [zone, moduleData.id, placedFurnitureId, spaceInfo?.droppedCeiling]);

  const sectionHeightsUnits = getSectionHeights();
  const unitsToMmFactor = (() => {
    const unit = mmToThreeUnits(1);
    return unit === 0 ? 100 : 1 / unit;
  })();
  const sectionHeightsMm = sectionHeightsUnits.length
    ? sectionHeightsUnits.map(sectionHeight => Math.round(sectionHeight * unitsToMmFactor))
    : undefined;

  // 섹션별 깊이 배열 생성 (Three.js 단위) - SingleType2와 동일한 방식
  const sectionDepths = React.useMemo(() => {
    const defaultDepth = depth;

    // 2섹션 가구가 아니면 undefined 반환
    if (!baseFurniture.modelConfig.sections || baseFurniture.modelConfig.sections.length !== 2) {
      return undefined;
    }

    return [
      lowerSectionDepth ? mmToThreeUnits(lowerSectionDepth) : defaultDepth, // 하부 섹션
      upperSectionDepth ? mmToThreeUnits(upperSectionDepth) : defaultDepth  // 상부 섹션
    ];
  }, [lowerSectionDepth, upperSectionDepth, depth, mmToThreeUnits, baseFurniture.modelConfig.sections]);

  return (
    <>
      {/* 간접조명은 BoxModule에서 처리 */}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <BaseFurnitureShell {...baseFurniture} isDragging={isDragging} isEditMode={isEditMode} spaceInfo={spaceInfo} moduleData={moduleData} placedFurnitureId={placedFurnitureId} lowerSectionDepthMm={lowerSectionDepth} upperSectionDepthMm={upperSectionDepth} lowerSectionTopOffsetMm={lowerSectionTopOffset} textureUrl={spaceInfo.materialConfig?.doorTexture} panelGrainDirections={panelGrainDirections}>
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
              textureUrl={spaceInfo.materialConfig?.doorTexture}
              panelGrainDirections={panelGrainDirections}
                sectionDepths={sectionDepths}
              />

              {/* 옷걸이 봉 렌더링 - 상부 옷장 섹션에만 */}
              {(() => {
                const sections = baseFurniture.modelConfig.sections || [];
                const availableHeight = height - basicThickness * 2;

                // 측판용: modelConfig의 원본 섹션 높이 (항상 고정)
                let sideAccumulatedY = -height/2 + basicThickness;

                return sections.map((section: any, sectionIndex: number) => {
                  // 옷봉 위치용: 실제 가구 높이 기반 계산 (동적)
                  const sectionBottomY = sideAccumulatedY;

                  // 측판용 누적 Y 위치 업데이트 (원본 높이 사용)
                  const originalSectionHeight = mmToThreeUnits(section.height);
                  sideAccumulatedY += originalSectionHeight;

                  // 4단서랍장: 하단은 서랍, 상단은 옷장
                  // 옷장 섹션(상부)에만 옷걸이 봉 렌더링
                  const isHangingSection = section.type === 'hanging';

                  if (!isHangingSection) {
                    return null;
                  }

                  // 실제 섹션 높이 계산 (현재 가구 높이 기반)
                  let actualSectionHeight: number;
                  if (sectionIndex === 0) {
                    // 하부 섹션: 항상 고정 높이
                    actualSectionHeight = mmToThreeUnits(section.height);
                  } else {
                    // 상부 섹션: 전체 높이에서 하부 섹션 높이를 뺀 나머지
                    const bottomSectionHeight = mmToThreeUnits(sections[0].height);
                    actualSectionHeight = availableHeight - bottomSectionHeight;
                  }

                  const actualSectionTopY = sectionBottomY + actualSectionHeight - basicThickness;

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
                    const finishPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                    rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
                  } else {
                    // 안전선반도 마감 패널도 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
                    const sectionTopPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                    rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);
                  }

                  // 옷봉 Z 위치 계산 (섹션 깊이에 따라 조정)
                  let rodZPosition = 0;
                  if (sectionDepths && sectionDepths[sectionIndex]) {
                    // 상부 섹션의 깊이 사용
                    const sectionDepth = sectionDepths[sectionIndex];
                    const depthDiff = depth - sectionDepth;
                    rodZPosition = depthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦
                  }

                  return (
                    <ClothingRod
                      key={`clothing-rod-${sectionIndex}`}
                      innerWidth={innerWidth}
                      yPosition={rodYPosition}
                      zPosition={rodZPosition}
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

          {/* 조절발통 (네 모서리) - 띄움 배치 시에만 렌더링하지 않음 */}
          {(() => {
            if (isFloating) {
              return null;
            }

            return (
              <AdjustableFootsRenderer
                width={width}
                depth={depth}
                yOffset={-height / 2}
                backZOffset={sectionDepths && sectionDepths[0] ? (depth - sectionDepths[0]) : 0}
                renderMode={renderMode}
                isHighlighted={false}
                isFloating={isFloating}
                baseHeight={spaceInfo?.baseConfig?.height || 65}
                baseDepth={spaceInfo?.baseConfig?.depth || 0}
                viewMode={viewMode}
                view2DDirection={view2DDirection}
              />
            );
          })()}
        </BaseFurnitureShell>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) - 단, 기둥 A(deep) 침범 시에는 FurnitureItem에서 별도 렌더링 */}
      {hasDoor && spaceInfo &&
       !(slotInfo && slotInfo.hasColumn && (slotInfo.columnType === 'deep' || adjustedWidth !== undefined)) && (
        <>
          {!doorSplit ? (
            // 병합 모드: 도어 하나
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
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
              zone={zone}
            />
          ) : (
            // 분할 모드: 상하부 도어 각각
            <>
              {/* 상부 섹션 도어 (옷장) */}
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
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
              sectionHeightsMm={sectionHeightsMm}
              sectionIndex={1}
              totalSections={2}
              doorTopGap={upperDoorTopGap ?? doorTopGap}
              doorBottomGap={upperDoorBottomGap ?? 0}
                zone={zone}
              />

              {/* 하부 섹션 도어 (4단 서랍) */}
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
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
              sectionHeightsMm={sectionHeightsMm}
              sectionIndex={0}
              totalSections={2}
              doorTopGap={lowerDoorTopGap ?? 0}
              doorBottomGap={lowerDoorBottomGap ?? doorBottomGap}
                zone={zone}
              />
            </>
          )}
        </>
      )}
    </>
  );
};

export default SingleType4; 
