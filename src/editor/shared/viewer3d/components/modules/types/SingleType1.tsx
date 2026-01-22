import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DoorModule from '../DoorModule';
import { ClothingRod } from '../components/ClothingRod';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';

/**
 * SingleType1 컴포넌트
 * - 2단 서랍 + 옷장 복합형 (single-2drawer-hanging)
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
  placedFurnitureId,
  panelGrainDirections,
  lowerSectionDepth,
  upperSectionDepth,
  doorSplit,
  doorTopGap = 5,
  doorBottomGap = 25,
  upperDoorTopGap,
  upperDoorBottomGap,
  lowerDoorTopGap,
  lowerDoorBottomGap,
  lowerSectionTopOffset,
  zone
}) => {
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
    basicThickness,
    adjustedDepthForShelves,
    mmToThreeUnits,
    modelConfig,
    getSectionHeights
  } = baseFurniture;

  const { renderMode, viewMode, view2DDirection } = useSpace3DView();

  // 플로팅 높이 디버그
  React.useEffect(() => {
    if (spaceInfo?.baseConfig) {
      console.log('🔍 SingleType1 spaceInfo.baseConfig:', {
        floatHeight: spaceInfo.baseConfig.floatHeight,
        placementType: spaceInfo.baseConfig.placementType,
        height: spaceInfo.baseConfig.height,
        전체baseConfig: spaceInfo.baseConfig
      });
    }
  }, [spaceInfo?.baseConfig]);

  // 디버그: zone 값 확인
  React.useEffect(() => {
    console.log('🚪🔴 SingleType1 - zone prop:', {
      zone,
      moduleId: moduleData.id,
      placedFurnitureId,
      droppedCeilingEnabled: spaceInfo?.droppedCeiling?.enabled,
      dropHeight: spaceInfo?.droppedCeiling?.dropHeight
    });
  }, [zone, moduleData.id, placedFurnitureId, spaceInfo?.droppedCeiling]);

  const sectionDepths = React.useMemo(() => {
    const defaultDepth = depth;
    if (!modelConfig.sections || modelConfig.sections.length !== 2) {
      return undefined;
    }

    return [
      lowerSectionDepth ? mmToThreeUnits(lowerSectionDepth) : defaultDepth,
      upperSectionDepth ? mmToThreeUnits(upperSectionDepth) : defaultDepth
    ];
  }, [modelConfig.sections, lowerSectionDepth, upperSectionDepth, depth, mmToThreeUnits]);

  const sectionHeightsUnits = React.useMemo(() => getSectionHeights(), [getSectionHeights]);
  const unitToMmFactor = React.useMemo(() => {
    const oneMmUnit = mmToThreeUnits(1);
    return oneMmUnit === 0 ? 100 : 1 / oneMmUnit;
  }, [mmToThreeUnits]);
  const sectionHeightsMm = React.useMemo(() => {
    if (!sectionHeightsUnits || sectionHeightsUnits.length === 0) return undefined;
    return sectionHeightsUnits.map(sectionHeight => Math.round(sectionHeight * unitToMmFactor));
  }, [sectionHeightsUnits, unitToMmFactor]);

  const clothingRods = React.useMemo(() => {
    const sections = modelConfig.sections || [];
    if (sections.length === 0) return null;

    const availableHeight = height - basicThickness * 2;
    let accumulatedY = -height / 2 + basicThickness;

    return sections.map((section, index) => {
      const sectionBottomY = accumulatedY;
      const originalSectionHeight = mmToThreeUnits(section.height);
      accumulatedY += originalSectionHeight;

      if (section.type !== 'hanging') {
        return null;
      }

      let actualSectionHeight: number;
      if (index === 0) {
        actualSectionHeight = originalSectionHeight;
      } else {
        const bottomSectionHeight = mmToThreeUnits(sections[0].height);
        actualSectionHeight = availableHeight - bottomSectionHeight;
      }

      const safetyShelfPositionMm = section.shelfPositions?.find(pos => pos > 0);
      const hasFinishPanel = section.isTopFinishPanel && section.count === 1;

      let rodYPosition: number;
      if (safetyShelfPositionMm !== undefined) {
        const safetyShelfY = sectionBottomY + mmToThreeUnits(safetyShelfPositionMm);
        rodYPosition = safetyShelfY - basicThickness / 2 - mmToThreeUnits(75 / 2);
      } else if (hasFinishPanel) {
        const finishPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
        rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
      } else {
        const sectionTopPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
        rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);
      }

      let rodZPosition = 0;
      if (sectionDepths && sectionDepths[index]) {
        const sectionDepth = sectionDepths[index];
        rodZPosition = (depth - sectionDepth) / 2;
      }

      return (
        <ClothingRod
          key={`clothing-rod-${index}`}
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
  }, [
    modelConfig.sections,
    height,
    basicThickness,
    mmToThreeUnits,
    sectionDepths,
    depth,
    innerWidth,
    renderMode,
    isEditMode,
    adjustedDepthForShelves
  ]);

  // 띄움 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === 'float';
  const shouldRenderFeet = showFurniture && !(viewMode === '2D' && view2DDirection === 'top') && !isFloating;
  const lowerSectionDepthUnits = sectionDepths?.[0] ?? depth;
  const footZOffset = (depth - lowerSectionDepthUnits) / 2;

  return (
    <>
      {showFurniture && (
        <BaseFurnitureShell
          {...baseFurniture}
          isDragging={isDragging}
          isEditMode={isEditMode}
          spaceInfo={spaceInfo}
          moduleData={moduleData}
          placedFurnitureId={placedFurnitureId}
          lowerSectionDepthMm={lowerSectionDepth}
          upperSectionDepthMm={upperSectionDepth}
          lowerSectionTopOffsetMm={lowerSectionTopOffset}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          renderMode={renderMode}
        >
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
                category={moduleData.category}
                placedFurnitureId={placedFurnitureId}
                textureUrl={spaceInfo.materialConfig?.doorTexture}
                panelGrainDirections={panelGrainDirections}
                sectionDepths={sectionDepths}
                lowerSectionTopOffsetMm={lowerSectionTopOffset}
                isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
              />

              {clothingRods}
            </>
          )}
        </BaseFurnitureShell>
      )}

      {shouldRenderFeet && (
        <group position={[0, 0, footZOffset]}>
          <AdjustableFootsRenderer
            width={width}
            depth={lowerSectionDepthUnits}
            yOffset={-height / 2}
            renderMode={renderMode}
            isHighlighted={false}
            isFloating={isFloating}
            baseHeight={spaceInfo?.baseConfig?.height || 65}
            baseDepth={spaceInfo?.baseConfig?.depth || 0}
            viewMode={viewMode}
            view2DDirection={view2DDirection}
          />
        </group>
      )}

      {hasDoor && spaceInfo &&
       !(slotInfo && slotInfo.hasColumn && (slotInfo.columnType === 'deep' || adjustedWidth !== undefined)) && (
        <>
          {!doorSplit ? (
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
              slotCenterX={slotCenterX || 0}
              slotIndex={slotIndex}
              textureUrl={spaceInfo.materialConfig?.doorTexture}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              doorTopGap={doorTopGap}
              doorBottomGap={doorBottomGap}
              floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
              zone={zone}
            />
          ) : (
            <>
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
                slotCenterX={slotCenterX || 0}
                slotIndex={slotIndex}
                textureUrl={spaceInfo.materialConfig?.doorTexture}
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId}
                sectionHeightsMm={sectionHeightsMm}
                doorTopGap={upperDoorTopGap ?? doorTopGap}
                doorBottomGap={upperDoorBottomGap ?? 0}
                sectionIndex={1}
                totalSections={2}
                floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
                zone={zone}
              />

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
                slotCenterX={slotCenterX || 0}
                slotIndex={slotIndex}
                textureUrl={spaceInfo.materialConfig?.doorTexture}
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId}
                sectionHeightsMm={sectionHeightsMm}
                doorTopGap={lowerDoorTopGap ?? 0}
                doorBottomGap={lowerDoorBottomGap ?? doorBottomGap}
                sectionIndex={0}
                totalSections={2}
                floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
                zone={zone}
              />
            </>
          )}
        </>
      )}
    </>
  );
};

export default SingleType1;
