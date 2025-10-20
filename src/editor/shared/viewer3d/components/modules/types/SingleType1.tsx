import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import { ClothingRod } from '../components/ClothingRod';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';

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
  placedFurnitureId,
  panelGrainDirections: propsPanelGrainDirections,
  lowerSectionDepth,
  upperSectionDepth
}) => {
  // 간접조명 관련 상태
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();

  // 공통 로직 사용 - SingleType2 패턴과 동일하게 섹션 깊이를 전달하지 않음
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    isHighlighted,
    panelGrainDirections: propsPanelGrainDirections
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
    actualDepthMm,
    textureUrl,
    panelGrainDirections
  } = baseFurniture;

  const { renderMode, viewMode, view2DDirection } = useSpace3DView();
  const { showDimensions, highlightedSection, isIndividualDoorOpen, toggleIndividualDoor } = useUIStore();

  // 가구 본체 클릭 시 열린 도어 닫기 핸들러
  const handleCabinetBodyClick = (e: any) => {
    if (!placedFurnitureId) return;
    e.stopPropagation();

    // 도어가 열려있으면 닫기
    const isDoorOpen = isIndividualDoorOpen(placedFurnitureId, 0);
    if (isDoorOpen) {
      toggleIndividualDoor(placedFurnitureId, 0);
      console.log('🚪 가구 본체 클릭 → 도어 닫기');
    }
  };

  // 섹션별 깊이 계산 (기본값: 표준 깊이) - props에서 직접 사용
  const sectionDepths = React.useMemo(() => {
    const defaultDepth = depth;
    return [
      lowerSectionDepth ? mmToThreeUnits(lowerSectionDepth) : defaultDepth, // 하부 섹션 (서랍)
      upperSectionDepth ? mmToThreeUnits(upperSectionDepth) : defaultDepth  // 상부 섹션 (옷장)
    ];
  }, [lowerSectionDepth, upperSectionDepth, depth, mmToThreeUnits]);

  // 디버깅: SingleType1이 받은 textureUrl과 panelGrainDirections 확인
  React.useEffect(() => {
    console.log('🔵 SingleType1 - baseFurniture에서 추출한 값:', {
      moduleId: moduleData.id,
      textureUrl,
      panelGrainDirections: panelGrainDirections ? JSON.stringify(panelGrainDirections) : 'undefined',
      timestamp: Date.now()
    });
  }, [textureUrl, panelGrainDirections, moduleData.id]);

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
        <group>
          {/* 좌우 측면 판재 - 섹션별 분할 */}
          {(() => {
            let accumulatedY = -height/2 + basicThickness;

            return getSectionHeights().map((sectionHeight: number, index: number) => {
              // 현재 섹션의 깊이
              const currentDepth = sectionDepths[index] || depth;

              // Z축 위치 조정: 깊이가 줄어들면 뒤쪽에서 줄어들도록
              const depthDiff = depth - currentDepth;
              const zOffset = depthDiff / 2;

              // 현재 섹션의 중심 Y 위치
              const sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness;

              // 다음 섹션을 위해 누적
              accumulatedY += sectionHeight;

              // 섹션별 강조 확인
              const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

              return (
                <React.Fragment key={`side-panels-${index}`}>
                  {/* 왼쪽 측면 판재 */}
                  <BoxWithEdges
                    args={[basicThickness, sectionHeight, currentDepth]}
                    position={[-width/2 + basicThickness/2, sectionCenterY, zOffset]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    isHighlighted={isSectionHighlighted}
                    onClick={handleCabinetBodyClick}
                    panelName="좌측판"
                    panelGrainDirections={panelGrainDirections}
                    textureUrl={spaceInfo.materialConfig?.doorTexture}
                  />

                  {/* 오른쪽 측면 판재 */}
                  <BoxWithEdges
                    args={[basicThickness, sectionHeight, currentDepth]}
                    position={[width/2 - basicThickness/2, sectionCenterY, zOffset]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    isHighlighted={isSectionHighlighted}
                    onClick={handleCabinetBodyClick}
                    panelName="우측판"
                    panelGrainDirections={panelGrainDirections}
                    textureUrl={spaceInfo.materialConfig?.doorTexture}
                  />

                  {/* 하부 섹션 상판 + 상부 섹션 바닥판 - index=0일때만 */}
                  {index === 0 && (() => {
                    const middlePanelY = sectionCenterY + sectionHeight/2 + basicThickness/2;

                    // 하부 섹션 깊이 (index=0)
                    const lowerDepth = sectionDepths[0] || depth;
                    const lowerDepthDiff = depth - lowerDepth;
                    const lowerZOffset = lowerDepthDiff / 2;

                    // 상부 섹션 깊이 (index=1)
                    const upperDepth = sectionDepths[1] || depth;
                    const upperDepthDiff = depth - upperDepth;
                    const upperZOffset = upperDepthDiff / 2;

                    const isLowerHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;
                    const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-${index + 1}`;

                    return (
                      <>
                        {/* 하부 섹션 상판 (서랍 상단) */}
                        <BoxWithEdges
                          args={[innerWidth, basicThickness, lowerDepth]}
                          position={[0, middlePanelY - basicThickness, lowerZOffset]}
                          material={material}
                          renderMode={renderMode}
                          isDragging={isDragging}
                          isEditMode={isEditMode}
                          isHighlighted={isLowerHighlighted}
                          onClick={handleCabinetBodyClick}
                          panelName="하부상판"
                          panelGrainDirections={panelGrainDirections}
                          textureUrl={spaceInfo.materialConfig?.doorTexture}
                        />

                        {/* 상부 섹션 바닥판 (옷장 하단) */}
                        <BoxWithEdges
                          args={[innerWidth, basicThickness, upperDepth]}
                          position={[0, middlePanelY, upperZOffset]}
                          material={material}
                          renderMode={renderMode}
                          isDragging={isDragging}
                          isEditMode={isEditMode}
                          isHighlighted={isUpperHighlighted}
                          onClick={handleCabinetBodyClick}
                          panelName="상부바닥판"
                          panelGrainDirections={panelGrainDirections}
                          textureUrl={spaceInfo.materialConfig?.doorTexture}
                        />
                      </>
                    );
                  })()}
                </React.Fragment>
              );
            });
          })()}

          {/* 상하판 - 각 섹션 깊이 적용 */}
          {(() => {
            // 하부 섹션(index=0) 깊이
            const lowerDepth = sectionDepths[0] || depth;
            const lowerDepthDiff = depth - lowerDepth;
            const lowerZOffset = lowerDepthDiff / 2;

            // 상부 섹션(index=1) 깊이
            const upperDepth = sectionDepths[1] || depth;
            const upperDepthDiff = depth - upperDepth;
            const upperZOffset = upperDepthDiff / 2;

            return (
              <>
                {/* 하판 - 하부 섹션 깊이 적용 */}
                <BoxWithEdges
                  args={[innerWidth, basicThickness, lowerDepth]}
                  position={[0, -height/2 + basicThickness/2, lowerZOffset]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  onClick={handleCabinetBodyClick}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                  panelName="하판"
                  panelGrainDirections={panelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />

                {/* 상판 - 상부 섹션 깊이 적용 */}
                <BoxWithEdges
                  args={[innerWidth, basicThickness, upperDepth]}
                  position={[0, height/2 - basicThickness/2, upperZOffset]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  onClick={handleCabinetBodyClick}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                  panelName="상판"
                  panelGrainDirections={panelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />
              </>
            );
          })()}

          {/* 백패널 - 섹션별로 분리 */}
          {(() => {
            const sectionHeights = getSectionHeights();
            const lowerSectionHeight = sectionHeights[0];
            const upperSectionHeight = sectionHeights[1];

            // 백패널 높이 = 섹션 내경높이 + 10mm
            const lowerInnerHeight = lowerSectionHeight - basicThickness * 2;
            const upperInnerHeight = upperSectionHeight - basicThickness * 2;
            const lowerBackPanelHeight = lowerInnerHeight + mmToThreeUnits(10);
            const upperBackPanelHeight = upperInnerHeight + mmToThreeUnits(10);

            // 백패널 Y 위치
            const lowerBackPanelY = -height/2 + basicThickness + lowerInnerHeight/2;
            const upperBackPanelY = -height/2 + lowerSectionHeight + basicThickness + upperInnerHeight/2;

            // 하부 섹션 깊이 및 Z 오프셋
            const lowerSectionDepth = sectionDepths[0] || depth;
            const lowerDepthDiff = depth - lowerSectionDepth;
            const lowerZOffset = lowerDepthDiff / 2;

            // 상부 섹션 깊이 및 Z 오프셋
            const upperSectionDepth = sectionDepths[1] || depth;
            const upperDepthDiff = depth - upperSectionDepth;
            const upperZOffset = upperDepthDiff / 2;

            return (
              <>
                {/* 하부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), lowerBackPanelHeight, backPanelThickness]}
                  position={[0, lowerBackPanelY, -lowerSectionDepth/2 + backPanelThickness/2 + mmToThreeUnits(17) + lowerZOffset]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  onClick={handleCabinetBodyClick}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                  panelName="하부섹션 백패널"
                  panelGrainDirections={panelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />

                {/* 상부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), upperBackPanelHeight, backPanelThickness]}
                  position={[0, upperBackPanelY, -upperSectionDepth/2 + backPanelThickness/2 + mmToThreeUnits(17) + upperZOffset]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  onClick={handleCabinetBodyClick}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                  panelName="상부섹션 백패널"
                  panelGrainDirections={panelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />
              </>
            );
          })()}

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

                console.log('🟢 SingleType1 섹션 계산 시작');
                console.log('  moduleId:', moduleData.id);
                console.log('  internalHeight:', internalHeight);
                console.log('  height(Three):', height * 100);
                console.log('  availableHeight:', availableHeight * 100);
                console.log('  basicThickness:', basicThickness * 100);
                console.log('  sectionsCount:', sections.length);

                return sections.map((section: any, sectionIndex: number) => {
                  // 옷봉 위치용: 실제 가구 높이 기반 계산 (동적)
                  const sectionBottomY = sideAccumulatedY;

                  console.log(`🟡 SingleType1 섹션[${sectionIndex}] (${section.type})`);
                  console.log('  sectionBottomY:', sectionBottomY * 100);
                  console.log('  heightType:', section.heightType);
                  console.log('  heightValue:', section.height);

                  // 측판용 누적 Y 위치 업데이트 (원본 높이 사용)
                  const originalSectionHeight = mmToThreeUnits(section.height);
                  sideAccumulatedY += originalSectionHeight;

                  // 2단서랍장: 하단은 서랍, 상단은 옷장
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

                    console.log('🔵 SingleType1 옷봉 위치 계산');
                    console.log('  moduleId:', moduleData.id);
                    console.log('  internalHeight:', internalHeight);
                    console.log('  height(Three→mm):', height * 100);
                    console.log('  actualSectionHeight:', actualSectionHeight * 100);
                    console.log('  sectionBottomY:', sectionBottomY * 100);
                    console.log('  sectionTopPanelBottom:', sectionTopPanelBottom * 100);
                    console.log('  rodYPosition:', rodYPosition * 100);
                    console.log('  basicThickness:', basicThickness * 100);
                  }

                  // 옷봉 Z 위치 계산 (섹션 깊이에 따라 조정)
                  let rodZPosition = 0;
                  if (sectionDepths && sectionDepths[sectionIndex]) {
                    // 현재 섹션의 깊이 사용
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
        </group>
      )}

      {/* 조절발 - 하부 섹션 깊이 적용 */}
      {(() => {
        // 하부 섹션 깊이 사용 (조절발은 하부 섹션에 붙음)
        const lowerDepth = sectionDepths[0] || depth;
        const depthDiff = depth - lowerDepth;
        const zOffset = depthDiff / 2; // 앞면 고정, 뒤쪽만 이동

        return (
          <group position={[0, 0, zOffset]}>
            <AdjustableFootsRenderer
              width={width}
              depth={lowerDepth}
              yOffset={-height / 2}
              renderMode={renderMode}
              isHighlighted={false}
              isFloating={false}
              baseHeight={spaceInfo?.baseConfig?.height || 65}
              baseDepth={spaceInfo?.baseConfig?.depth || 0}
              viewMode={viewMode}
              view2DDirection={view2DDirection}
            />
          </group>
        );
      })()}

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
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          slotCenterX={slotCenterX}
        />
      )}
    </>
  );
};

export default SingleType1; 
