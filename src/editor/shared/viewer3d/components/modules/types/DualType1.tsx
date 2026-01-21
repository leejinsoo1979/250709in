import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DoorModule from '../DoorModule';
import { ClothingRod } from '../components/ClothingRod';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { useUIStore } from '@/store/uiStore';

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
  visibleSectionIndex = null, // 듀얼 가구 섹션 필터링 (이 타입은 대칭이므로 사용하지 않음)
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
  panelGrainDirections: propsPanelGrainDirections,
  zone // 단내림 영역 정보
}) => {
  console.log('🔍🔍🔍 [DualType1] Props 확인 - 렌더링됨!');
  console.log('  moduleId:', moduleData.id);
  console.log('  lowerSectionTopOffset:', lowerSectionTopOffset);
  console.log('  lowerSectionTopOffset type:', typeof lowerSectionTopOffset);
  console.log('  hasLowerSectionTopOffset:', lowerSectionTopOffset !== undefined);
  console.log('  🔴 zone:', zone, '(단내림:', zone === 'dropped' ? '✅' : '❌', ')');

  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 전달
    adjustedWidth, // adjustedWidth 전달
    customSections, // 사용자 정의 섹션 설정
    panelGrainDirections: propsPanelGrainDirections
  });

  const {
    textureUrl,
    panelGrainDirections,
    depth,
    width,
    height,
    mmToThreeUnits,
    lowerSectionDepthMm: baseLowerSectionDepthMm,
    upperSectionDepthMm: baseUpperSectionDepthMm
  } = baseFurniture;

  // props로 받은 섹션별 깊이를 우선 사용
  const lowerSectionDepthMm = lowerSectionDepth !== undefined ? lowerSectionDepth : baseLowerSectionDepthMm;
  const upperSectionDepthMm = upperSectionDepth !== undefined ? upperSectionDepth : baseUpperSectionDepthMm;

  const { renderMode, viewMode } = useSpace3DView();
  const { view2DDirection } = useUIStore();

  // 섹션별 깊이 계산 (하부 섹션 0, 상부 섹션 1)
  const defaultDepth = depth;
  const sectionDepths = React.useMemo(() => {
    console.log('🔍 [DualType1 섹션 깊이 디버깅]', {
      moduleId: moduleData.id,
      lowerSectionDepth,
      upperSectionDepth,
      lowerSectionDepthMm,
      upperSectionDepthMm,
      depth,
      sections: baseFurniture.modelConfig?.sections
    });

    const result = [
      lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : defaultDepth, // 하부 섹션 (서랍)
      upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : defaultDepth  // 상부 섹션 (옷장)
    ];

    console.log('✅ [DualType1 섹션 깊이 결과]', result);

    return result;
  }, [lowerSectionDepthMm, upperSectionDepthMm, depth, mmToThreeUnits, moduleData.id, baseFurniture.modelConfig?.sections]);

  // 섹션별 높이 계산 (도어 분할용)
  const sectionHeightsMm = React.useMemo(() => {
    const sectionHeights = baseFurniture.getSectionHeights();
    const unitsToMmFactor = (() => {
      const unit = mmToThreeUnits(1);
      return unit === 0 ? 100 : 1 / unit;
    })();
    
    return sectionHeights.length
      ? sectionHeights.map(sectionHeight => Math.round(sectionHeight * unitsToMmFactor))
      : undefined;
  }, [baseFurniture.getSectionHeights, mmToThreeUnits]);

  console.log('🔵 DualType1에서 추출한 값:', {
    moduleId: moduleData.id,
    textureUrl,
    panelGrainDirections: panelGrainDirections ? JSON.stringify(panelGrainDirections) : 'undefined',
    timestamp: Date.now()
  });

  const doorElements = hasDoor && spaceInfo ? (
    !doorSplit ? (
      <DoorModule
        moduleWidth={doorWidth || moduleData.dimensions.width}
        moduleDepth={baseFurniture.actualDepthMm}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        color={baseFurniture.doorColor}
        doorXOffset={0}
        moduleData={moduleData}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        slotWidths={slotWidths}
        isDragging={isDragging}
        isEditMode={isEditMode}
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
          doorXOffset={0}
          moduleData={moduleData}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          slotWidths={slotWidths}
          isDragging={isDragging}
          isEditMode={isEditMode}
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
          doorXOffset={0}
          moduleData={moduleData}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          slotWidths={slotWidths}
          isDragging={isDragging}
          isEditMode={isEditMode}
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
    )
  ) : null;

  if (!showFurniture) {
    return <>{doorElements}</>;
  }

  return (
    <>
      <BaseFurnitureShell
        {...baseFurniture}
        isDragging={isDragging}
        isEditMode={isEditMode}
        spaceInfo={spaceInfo}
        moduleData={moduleData}
        placedFurnitureId={placedFurnitureId}
        showFurniture={showFurniture}
        textureUrl={spaceInfo.materialConfig?.doorTexture}
        panelGrainDirections={panelGrainDirections}
        lowerSectionDepthMm={lowerSectionDepth}
        upperSectionDepthMm={upperSectionDepth}
        lowerSectionTopOffsetMm={lowerSectionTopOffset}
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
              placedFurnitureId={placedFurnitureId}
              textureUrl={spaceInfo.materialConfig?.doorTexture}
              panelGrainDirections={panelGrainDirections}
              sectionDepths={sectionDepths}
              lowerSectionTopOffsetMm={lowerSectionTopOffset}
              isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
            />

            {/* 옷걸이 봉 렌더링 - hanging 섹션에만 */}
            {(() => {
              const sections = baseFurniture.modelConfig?.sections || [];
              const { height, innerWidth, basicThickness, mmToThreeUnits, adjustedDepthForShelves, depth } = baseFurniture;
              const availableHeight = height - basicThickness * 2;

              console.log('🟢 DualType1 섹션 계산 시작');
              console.log('  moduleId:', moduleData.id);
              console.log('  internalHeight:', internalHeight);
              console.log('  height(Three):', height * 100);
              console.log('  availableHeight:', availableHeight * 100);
              console.log('  basicThickness:', basicThickness * 100);
              console.log('  sectionsCount:', sections.length);
              console.log('  dropHeight:', spaceInfo?.droppedCeiling?.dropHeight);
              console.log('  originalCeilingHeight:', spaceInfo?.dimensions?.ceilingHeight);

              let accumulatedY = -height / 2 + basicThickness;

              return sections.map((section: any, sectionIndex: number) => {
                console.log(`🟡 DualType1 섹션[${sectionIndex}] (${section.type})`);

                // 현재 섹션의 시작 Y 위치 (측판 기준)
                const sectionBottomY = accumulatedY;
                // 원본 섹션 높이로 누적 (측판 위치 계산용)
                const originalSectionHeight = mmToThreeUnits(section.height);
                accumulatedY += originalSectionHeight;

                if (section.type !== 'hanging') {
                  console.log('  ⏭️ hanging 섹션이 아니므로 옷봉 렌더링 생략');
                  return null;
                }

                // 실제 섹션 높이 계산 (현재 가구 높이 기반)
                let actualSectionHeight: number;
                if (sectionIndex === 0) {
                  // 하부 섹션: 항상 고정 높이
                  actualSectionHeight = originalSectionHeight;
                } else {
                  // 상부 섹션: 전체 높이에서 하부 섹션 높이를 뺀 나머지
                  const bottomSectionHeight = mmToThreeUnits(sections[0].height);
                  actualSectionHeight = availableHeight - bottomSectionHeight;
                }

                console.log('  actualSectionHeight:', actualSectionHeight * 100);
                console.log('  sectionBottomY:', sectionBottomY * 100);
                console.log('  heightType:', section.heightType);
                console.log('  heightValue:', section.height);

                // 현재 섹션의 깊이 및 Z 오프셋 계산
                const currentSectionDepth = sectionDepths[sectionIndex] || depth;
                const depthDiff = depth - currentSectionDepth;
                const zOffset = depthDiff / 2; // 앞면 고정, 뒤쪽만 이동

                // 안전선반 또는 마감 패널 위치 찾기
                const safetyShelfPositionMm = section.shelfPositions?.find((pos: number) => pos > 0);
                const hasFinishPanel = section.isTopFinishPanel && section.count === 1;

                // 띄움 배치 여부 확인 - spaceInfo의 baseConfig를 사용해야 함
                const isFloating = spaceInfo?.baseConfig?.placementType === 'float';

                // 옷걸이 봉 Y 위치 계산
                let rodYPosition: number;
                if (safetyShelfPositionMm !== undefined && !isFloating) {
                  // 안전선반이 있고 띄움 배치가 아닌 경우: 브라켓 윗면이 안전선반 하단에 붙음
                  const safetyShelfY = sectionBottomY + mmToThreeUnits(safetyShelfPositionMm);
                  rodYPosition = safetyShelfY - basicThickness / 2 - mmToThreeUnits(75 / 2);
                } else if (hasFinishPanel) {
                  // 마감 패널이 있는 경우 (하부섹션): 브라켓 윗면이 마감 패널 하단에서 27mm 아래
                  const finishPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                  rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
                } else {
                  // 띄움 배치 또는 안전선반/마감패널 없는 경우: 브라켓 윗면이 상부 섹션 상판 하단에 붙음
                  const sectionTopPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                  rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);

                  console.log('🔵 DualType1 옷봉 위치 계산 (띄움 또는 안전선반 없음)');
                  console.log('  isFloating:', isFloating);
                  console.log('  lowerSectionTopOffset:', lowerSectionTopOffset);
                  console.log('  moduleId:', moduleData.id);
                  console.log('  internalHeight:', internalHeight);
                  console.log('  height(Three→mm):', height * 100);
                  console.log('  actualSectionHeight:', actualSectionHeight * 100);
                  console.log('  sectionBottomY:', sectionBottomY * 100);
                  console.log('  sectionTopPanelBottom:', sectionTopPanelBottom * 100);
                  console.log('  rodYPosition:', rodYPosition * 100);
                  console.log('  basicThickness:', basicThickness * 100);
                }

                // 섹션별 깊이에 맞는 adjustedDepth 계산
                const sectionAdjustedDepth = currentSectionDepth - basicThickness * 2;

                return (
                  <group key={`clothing-rod-${sectionIndex}`} position={[0, 0, zOffset]}>
                    <ClothingRod
                      innerWidth={innerWidth}
                      yPosition={rodYPosition}
                      zPosition={0}
                      renderMode={renderMode}
                      isDragging={false}
                      isEditMode={isEditMode}
                      adjustedDepthForShelves={sectionAdjustedDepth}
                      depth={currentSectionDepth}
                      furnitureId={placedFurnitureId}
                    />
                  </group>
                );
              });
            })()}
          </>
        )}

        {/* 조절발통 (네 모서리) - 띄움 배치 시에만 렌더링하지 않음 */}
        {(() => {
          const isFloating = spaceInfo?.baseConfig?.placementType === 'float';

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

      {/* 도어는 showFurniture와 관계없이 항상 렌더링 (도어 도면 출력용) */}
      {doorElements}
    </>
  );
};

export default DualType1;
