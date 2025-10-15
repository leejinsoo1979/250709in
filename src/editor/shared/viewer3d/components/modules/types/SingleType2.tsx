import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { Text, Line } from '@react-three/drei';
import { useDimensionColor } from '../hooks/useDimensionColor';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { ClothingRod } from '../components/ClothingRod';
import { VentilationCap } from '../components/VentilationCap';

/**
 * SingleType2 컴포넌트
 * - 2단 옷장 (single-2hanging)
 * - ID 패턴: single-2hanging-*
 * - 구조: 하단 선반구역 + 상단 옷걸이구역
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const SingleType2: React.FC<FurnitureTypeProps> = ({
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
  furnitureId,
  placedFurnitureId
}) => {
  // 공통 로직 사용
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

  const { renderMode, viewMode } = useSpace3DView();

  // 띄워서 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === "float";
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  const showIndirectLight = false;
  const { view2DDirection, indirectLightEnabled, indirectLightIntensity, showDimensions, showDimensionsText, highlightedSection } = useUIStore();
  const { dimensionColor, baseFontSize } = useDimensionColor();
  const { theme } = useTheme();

  return (
    <>
      {/* 띄워서 배치 시 간접조명 효과 */}
      {showIndirectLight && (
        <IndirectLight
          width={baseFurniture.innerWidth * 1.5}
          depth={baseFurniture.depth * 1.5}
          intensity={indirectLightIntensity || 0.8}
          position={[0, -baseFurniture.height/2 - 0.02, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <group>
          {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
          {isMultiSectionFurniture() ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {(() => {
            let accumulatedY = -height/2 + basicThickness;

            return getSectionHeights().map((sectionHeight: number, index: number) => {
              // 현재 섹션의 중심 Y 위치
              const sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness;

              // 다음 섹션을 위해 누적
              const currentYPosition = accumulatedY;
              accumulatedY += sectionHeight;
            
            // 섹션별 강조 확인
              const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

            return (
              <React.Fragment key={`side-panels-${index}`}>
                {/* 왼쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[-width/2 + basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                />

                {/* 오른쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                />
                
                {/* 하부 섹션 상판 + 상부 섹션 바닥판 (2단 옷장 구조) - index=0일때만 */}
                {index === 0 && (() => {
                  const middlePanelY = sectionCenterY + sectionHeight/2 + basicThickness/2;
                  const lowerTopPanelY = middlePanelY - basicThickness; // 하부 섹션 상판 위치

                  console.log('🟡 SingleType2 중간패널 렌더링:', {
                    index,
                    middlePanelY,
                    lowerTopPanelY,
                    sectionCenterY,
                    sectionHeight,
                    totalSections: getSectionHeights().length
                  });

                  // 중간판 강조: 하부 섹션 상판은 index 섹션에 속함
                  const isLowerHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;
                  const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-${index + 1}`;

                  // 백패널 방향으로 26mm 확장
                  const originalDepth = adjustedDepthForShelves - basicThickness;
                  const extendedDepth = originalDepth + mmToThreeUnits(26);
                  // 중심이 뒤로 이동 (음의 Z 방향으로 26mm의 절반 = -13mm)
                  const extendedZPosition = basicThickness/2 + shelfZOffset - mmToThreeUnits(13);

                  return (
                    <>
                      {/* 하부 섹션 상판 - 백패널 방향으로 26mm 확장 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, extendedDepth]}
                        position={[0, lowerTopPanelY, extendedZPosition]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isLowerHighlighted}
                      />

                      {/* 상부 섹션 바닥판 - 백패널 방향으로 26mm 확장 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, extendedDepth]}
                        position={[0, middlePanelY, extendedZPosition]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isUpperHighlighted}
                      />
                    </>
                  );
                })()}
              </React.Fragment>
            );
            });
          })()}
        </>
      ) : (
        // 단일 섹션: 기존 통짜 측면 패널
        <>
          {/* 왼쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[-width/2 + basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isEditMode={isEditMode}
          />
          
          {/* 오른쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[width/2 - basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isEditMode={isEditMode}
          />
        </>
      )}

      {/* 상단 상판 두께 치수 표시 - 정면도에서만 */}
      {showDimensions && showDimensionsText && (viewMode === '3D' || view2DDirection === 'front') && (
        <group>
          {/* 상판 두께 텍스트 */}
          <Text
            position={[
              viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
              height/2 - basicThickness/2,
              viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0
            ]}
            fontSize={baseFontSize}
            color={dimensionColor}
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, Math.PI / 2]}
            renderOrder={999}
            depthTest={false}
          >
            {Math.round(basicThickness * 100)}
          </Text>
          
          {/* 상판 두께 수직선 */}
          <Line
            points={[
              [-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
              [-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
            ]}
            color={dimensionColor}
            lineWidth={1}
          />
          {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
            <>
              <mesh position={[-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
            </>
          )}
        </group>
      )}

      {/* 드래그 중이 아닐 때만 내부 구조 렌더링 */}
      {!isDragging && showFurniture && (
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

          {/* 옷걸이 봉 렌더링 - hanging 섹션만 */}
          {(() => {
            const sections = baseFurniture.modelConfig.sections || [];
            const availableHeight = height - basicThickness * 2;

            // 측판용: modelConfig의 원본 섹션 높이 (항상 고정)
            let sideAccumulatedY = -height/2 + basicThickness;

            console.log('🟢 SingleType2 섹션 계산 시작');
            console.log('  moduleId:', moduleData.id);
            console.log('  internalHeight:', internalHeight);
            console.log('  height(Three):', height * 100);
            console.log('  availableHeight:', availableHeight * 100);
            console.log('  basicThickness:', basicThickness * 100);
            console.log('  sectionsCount:', sections.length);

            return sections.map((section: any, sectionIndex: number) => {
              // 옷봉 위치용: 실제 가구 높이 기반 계산 (동적)
              const sectionBottomY = sideAccumulatedY;

              console.log(`🟡 SingleType2 섹션[${sectionIndex}] (${section.type})`);
              console.log('  sectionBottomY:', sectionBottomY * 100);
              console.log('  heightType:', section.heightType);
              console.log('  heightValue:', section.height);

              // 측판용 누적 Y 위치 업데이트 (원본 높이 사용)
              const originalSectionHeight = mmToThreeUnits(section.height);
              sideAccumulatedY += originalSectionHeight;

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

              // hanging 섹션이 아니면 옷걸이봉 렌더링하지 않음
              const isHangingSection = section.type === 'hanging';
              if (!isHangingSection) {
                console.log('  ⏭️ hanging 섹션이 아니므로 옷봉 렌더링 생략');
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
                // 마감 패널이 있는 경우 (하부섹션): 브라켓 윗면이 마감 패널 하단에서 27mm 아래
                const finishPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
              } else {
                // 안전선반도 마감 패널도 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
                const sectionTopPanelBottom = actualSectionTopY;
                // 브라켓 중심 = 상판 하단 - (브라켓 높이 / 2) + 9mm 보정
                rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);

                console.log('🔵 SingleType2 옷봉 위치 계산');
                console.log('  moduleId:', moduleData.id);
                console.log('  internalHeight:', internalHeight);
                console.log('  height(Three→mm):', height * 100);
                console.log('  actualSectionHeight:', actualSectionHeight * 100);
                console.log('  sectionBottomY:', sectionBottomY * 100);
                console.log('  sectionTopPanelBottom:', sectionTopPanelBottom * 100);
                console.log('  rodYPosition:', rodYPosition * 100);
                console.log('  basicThickness:', basicThickness * 100);
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

      {/* 상단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, height/2 - basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-${getSectionHeights().length - 1}` : false}
      />

      {/* 하단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, -height/2 + basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-0` : false}
      />

      {/* 뒷면 판재 (9mm 백패널, 섹션별로 분리) */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 하부/상부 백패널 분리
        <>
          {(() => {
            const sectionHeights = getSectionHeights();
            const lowerSectionHeight = sectionHeights[0];
            const upperSectionHeight = sectionHeights[1];

            // 백패널 높이 = 섹션 내경높이 + 10mm
            // 내경높이 = 섹션높이 - 상하판(36mm)
            const lowerInnerHeight = lowerSectionHeight - basicThickness * 2;
            const upperInnerHeight = upperSectionHeight - basicThickness * 2;
            const lowerBackPanelHeight = lowerInnerHeight + mmToThreeUnits(10);
            const upperBackPanelHeight = upperInnerHeight + mmToThreeUnits(10);

            // 백패널 Y 위치
            const lowerBackPanelY = -height/2 + basicThickness + lowerInnerHeight/2;
            const upperBackPanelY = -height/2 + lowerSectionHeight + basicThickness + upperInnerHeight/2;

            return (
              <>
                {/* 하부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), lowerBackPanelHeight, backPanelThickness]}
                  position={[0, lowerBackPanelY, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                />

                {/* 상부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), upperBackPanelHeight, backPanelThickness]}
                  position={[0, upperBackPanelY, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                />
              </>
            );
          })()}
        </>
      ) : (
        // 단일 섹션: 기존 통짜 백패널
        <BoxWithEdges
          args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          isBackPanel={true}
        />
      )}

      {/* 환기캡 렌더링 */}
      {!isDragging && showFurniture && (
        <VentilationCap
          position={[
            innerWidth/2 - mmToThreeUnits(132),  // 우측 패널 안쪽으로 132mm
            height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
            -depth/2 + backPanelThickness + mmToThreeUnits(17) + 0.01  // 백패널 앞쪽에 살짝 앞으로
          ]}
          diameter={98}
          renderMode={renderMode}
        />
      )}
        </group>
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

      {/* 조절발통 (네 모서리) - showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <AdjustableFootsRenderer
          width={width}
          depth={depth}
          yOffset={-height / 2}
          renderMode={renderMode}
          isHighlighted={false}
          isFloating={false}
          baseHeight={spaceInfo?.baseConfig?.height || 65}
          viewMode={viewMode}
          view2DDirection={view2DDirection}
        />
      )}
    </>
  );
};

export default SingleType2; 
