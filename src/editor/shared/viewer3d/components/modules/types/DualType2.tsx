import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from "@/contexts/ThemeContext";
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { Text, Line } from '@react-three/drei';
import { useDimensionColor } from '../hooks/useDimensionColor';
import { ClothingRod } from '../components/ClothingRod';
import { VentilationCap } from '../components/VentilationCap';

/**
 * DualType2 컴포넌트
 * - 2단 옷장 (dual-2hanging)
 * - ID 패턴: dual-2hanging-*
 * - 구조: 하단 선반구역 + 상단 옷걸이구역 (듀얼 타입)
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const DualType2: React.FC<FurnitureTypeProps> = ({
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
  slotWidths,
  adjustedWidth, // adjustedWidth 추가
  placedFurnitureId,
  showFurniture = true, // 가구 본체 표시 여부
  visibleSectionIndex = null, // 듀얼 가구 섹션 필터링 (이 타입은 대칭이므로 사용하지 않음)
  doorTopGap = 5,
  doorBottomGap = 25,
  doorSplit,
  upperDoorTopGap,
  upperDoorBottomGap,
  lowerDoorTopGap,
  lowerDoorBottomGap,
  lowerSectionDepth,
  upperSectionDepth,
  panelGrainDirections: propsPanelGrainDirections
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
    textureUrl,
    panelGrainDirections
  } = baseFurniture;

  const { renderMode, viewMode } = useSpace3DView();
  const { view2DDirection, showDimensions, showDimensionsText, highlightedSection } = useUIStore();
  const { theme } = useTheme();
  const { dimensionColor, baseFontSize } = useDimensionColor();

  const sectionHeights = getSectionHeights();
  const isMulti = sectionHeights.length >= 2;

  // sectionHeightsMm 계산 (도어 분할용)
  const unitsToMmFactor = (() => {
    const unit = mmToThreeUnits(1);
    return unit === 0 ? 100 : 1 / unit;
  })();
  const sectionHeightsMm = sectionHeights.length
    ? sectionHeights.map(sectionHeight => Math.round(sectionHeight * unitsToMmFactor))
    : undefined;

  // 섹션별 깊이 배열 생성 (Three.js 단위) - SingleType2와 동일한 방식
  const sectionDepths = React.useMemo(() => {
    const defaultDepth = depth;

    console.log('🔍 [DualType2 섹션 깊이 계산]', {
      moduleId: moduleData.id,
      lowerSectionDepth_prop: lowerSectionDepth,
      upperSectionDepth_prop: upperSectionDepth,
      defaultDepth_three: defaultDepth,
      defaultDepth_mm: defaultDepth / 0.01
    });

    return [
      lowerSectionDepth ? mmToThreeUnits(lowerSectionDepth) : defaultDepth, // 하부 섹션
      upperSectionDepth ? mmToThreeUnits(upperSectionDepth) : defaultDepth  // 상부 섹션
    ];
  }, [lowerSectionDepth, upperSectionDepth, depth, mmToThreeUnits]);

  // 디버그: showFurniture 값 확인
  useEffect(() => {
    console.log('🎨 DualType2 - showFurniture:', showFurniture, 'moduleId:', moduleData.id);
  }, [showFurniture, moduleData.id]);

  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <group>
          {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
      {isMulti ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {(() => {
            let accumulatedY = -height/2 + basicThickness;

            return sectionHeights.map((sectionHeight: number, index: number) => {
              // 현재 섹션의 중심 Y 위치
              const sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness;

              // 다음 섹션을 위해 누적
              accumulatedY += sectionHeight;

              // 섹션별 강조 확인
              const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

              // 현재 섹션의 깊이 가져오기
              const currentSectionDepth = (sectionDepths && sectionDepths[index]) ? sectionDepths[index] : depth;

              // 깊이 차이 계산 (기본 깊이 대비)
              const depthDiff = depth - currentSectionDepth;

              // Z 위치 오프셋: 뒤쪽으로만 줄어들도록 (양수: 앞쪽 고정, 뒤쪽 줄어듦)
              const zOffset = depthDiff / 2;

            return (
              <React.Fragment key={`side-panels-${index}`}>
                {/* 왼쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, currentSectionDepth]}
                  position={[-width/2 + basicThickness/2, sectionCenterY, zOffset]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                  panelName="좌측판"
                  panelGrainDirections={panelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />

                {/* 오른쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, currentSectionDepth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, zOffset]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                  panelName="우측판"
                  panelGrainDirections={panelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />
                
                {/* 중간 구분 패널 (하부 섹션 상판) - 백패널 방향으로 26mm 확장 */}
                {index === 0 && (() => {
                  const lowerTopPanelY = sectionCenterY + sectionHeight/2 - basicThickness/2;

                  // 하부 섹션 깊이 사용
                  const lowerSectionDepth = (sectionDepths && sectionDepths[0]) ? sectionDepths[0] : depth;
                  const lowerDepthDiff = depth - lowerSectionDepth;

                  // 백패널 방향으로 26mm 확장 (하부 섹션 깊이 기준)
                  const backPanelThickness = depth - adjustedDepthForShelves;
                  const lowerAdjustedDepth = lowerSectionDepth - backPanelThickness;
                  const originalDepth = lowerAdjustedDepth - basicThickness;
                  const extendedDepth = originalDepth + mmToThreeUnits(26);

                  // Z 위치: 뒤쪽으로만 줄어들도록 + 26mm 확장 고려 (양수: 앞쪽 고정, 뒤쪽 줄어듦)
                  const zOffset = lowerDepthDiff / 2;
                  const extendedZPosition = basicThickness/2 + shelfZOffset - mmToThreeUnits(13) + zOffset;

                  return (
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, extendedDepth]}
                      position={[0, lowerTopPanelY, extendedZPosition]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                      panelName="하부섹션 상판"
                      panelGrainDirections={panelGrainDirections}
                      textureUrl={spaceInfo.materialConfig?.doorTexture}
                    />
                  );
                })()}

                {/* 상부 섹션의 바닥판 - 백패널 방향으로 26mm 확장 */}
                {index === 1 && (() => {
                  // 하부 섹션의 높이와 중심 위치 계산
                  const lowerSectionHeight = sectionHeights[0];
                  let lowerAccumulatedY = -height/2 + basicThickness;
                  const lowerSectionCenterY = lowerAccumulatedY + lowerSectionHeight / 2 - basicThickness;
                  const lowerTopPanelY = lowerSectionCenterY + lowerSectionHeight/2 - basicThickness/2;

                  // 상부 섹션 깊이 사용 (index=1)
                  const upperSectionDepth = (sectionDepths && sectionDepths[1]) ? sectionDepths[1] : depth;
                  const upperDepthDiff = depth - upperSectionDepth;

                  // 백패널 방향으로 26mm 확장 (상부 섹션 깊이 기준)
                  const backPanelThickness = depth - adjustedDepthForShelves;
                  const upperAdjustedDepth = upperSectionDepth - backPanelThickness;
                  const originalDepth = upperAdjustedDepth - basicThickness;
                  const extendedDepth = originalDepth + mmToThreeUnits(26);

                  // Z 위치: 뒤쪽으로만 줄어들도록 + 26mm 확장 고려 (양수: 앞쪽 고정, 뒤쪽 줄어듦)
                  const zOffset = upperDepthDiff / 2;
                  const extendedZPosition = basicThickness/2 + shelfZOffset - mmToThreeUnits(13) + zOffset;

                  return (
                    <>
                      {/* 상부 섹션 바닥판 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, extendedDepth]}
                        position={[0, lowerTopPanelY + basicThickness, extendedZPosition]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                        panelName="상부섹션 바닥판"
                        panelGrainDirections={panelGrainDirections}
                        textureUrl={spaceInfo.materialConfig?.doorTexture}
                      />
                    
                    {/* 중간판 두께 치수 표시 */}
                    {showFurniture && showDimensions && showDimensionsText && (
                      <group>
                        {/* 하부 섹션 상판 두께 텍스트 */}
                        <Text
                          position={[
                            -innerWidth/2 * 0.3 - 0.5,
                            lowerTopPanelY,
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

                        {/* 하부 섹션 상판 두께 수직선 */}
                        <Line
                          points={[
                            [-innerWidth/2 * 0.3, lowerTopPanelY - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
                            [-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                        />
                        {/* 하부 섹션 상판 수직선 양끝 점 - 측면뷰에서 숨김 */}
                        {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                          <>
                            <mesh position={[-innerWidth/2 * 0.3, lowerTopPanelY - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                              <sphereGeometry args={[0.05, 8, 8]} />
                              <meshBasicMaterial color={dimensionColor} />
                            </mesh>
                            <mesh position={[-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                              <sphereGeometry args={[0.05, 8, 8]} />
                              <meshBasicMaterial color={dimensionColor} />
                            </mesh>
                          </>
                        )}
                      </group>
                    )}
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
            panelName="좌측판"
            panelGrainDirections={panelGrainDirections}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
          />

          {/* 오른쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[width/2 - basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            panelName="우측판"
            panelGrainDirections={panelGrainDirections}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
          />
        </>
      )}
      
      {/* 상단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, sectionDepths && sectionDepths[1] ? sectionDepths[1] : depth]}
        position={[0, height/2 - basicThickness/2, sectionDepths && sectionDepths[1] ? (depth - sectionDepths[1]) / 2 : 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isMulti ? highlightedSection === `${placedFurnitureId}-${sectionHeights.length - 1}` : false}
        panelName="상판"
        panelGrainDirections={panelGrainDirections}
        textureUrl={spaceInfo.materialConfig?.doorTexture}
      />
      
      {/* 상단 상판 두께 치수 표시 - 정면도에서만 */}
      {showFurniture && showDimensions && showDimensionsText && (viewMode === '3D' || view2DDirection === 'front') && (
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

      {/* 하단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, sectionDepths && sectionDepths[0] ? sectionDepths[0] : depth]}
        position={[0, -height/2 + basicThickness/2, sectionDepths && sectionDepths[0] ? (depth - sectionDepths[0]) / 2 : 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isMulti ? highlightedSection === `${placedFurnitureId}-0` : false}
        panelName="바닥판"
        panelGrainDirections={panelGrainDirections}
        textureUrl={spaceInfo.materialConfig?.doorTexture}
      />

      {/* 뒷면 판재 (9mm 백패널, 섹션별로 분리) */}
      {isMulti ? (
        // 다중 섹션: 하부/상부 백패널 분리
        <>
          {(() => {
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

            // 하부 섹션 깊이 및 Z 오프셋
            const lowerSectionDepth = (sectionDepths && sectionDepths[0]) ? sectionDepths[0] : depth;
            const lowerDepthDiff = depth - lowerSectionDepth;
            const lowerZOffset = lowerDepthDiff / 2;

            // 상부 섹션 깊이 및 Z 오프셋
            const upperSectionDepth = (sectionDepths && sectionDepths[1]) ? sectionDepths[1] : depth;
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
                  isBackPanel={true}
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
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                  panelName="상부섹션 백패널"
                  panelGrainDirections={panelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
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
          isBackPanel={true}
          panelName="백패널"
          panelGrainDirections={panelGrainDirections}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
        />
      )}

      {/* 환기캡 렌더링 */}
      {!isDragging && (
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
              sectionDepths={sectionDepths}
              textureUrl={spaceInfo.materialConfig?.doorTexture}
              panelGrainDirections={panelGrainDirections}
            />

            {/* 옷걸이 봉 렌더링 - hanging 섹션만 */}
            {(() => {
              const sections = baseFurniture.modelConfig.sections || [];
              let accumulatedY = -height/2 + basicThickness;
              const availableHeight = height - basicThickness * 2;

              return sections.map((section: any, sectionIndex: number) => {
                // hanging 타입이 아니면 렌더링 안함
                if (section.type !== 'hanging') {
                  // accumulatedY는 업데이트해야 다음 섹션 위치가 맞음
                  const sectionHeight = baseFurniture.calculateSectionHeight(section, availableHeight);
                  accumulatedY += sectionHeight;
                  return null;
                }

                const sectionHeight = baseFurniture.calculateSectionHeight(section, availableHeight);
                const sectionBottomY = accumulatedY;
                const sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness;

                // 누적 Y 위치 업데이트
                accumulatedY += sectionHeight;

                // 안전선반 또는 마감 패널 위치 찾기
                const safetyShelfPositionMm = section.shelfPositions?.find((pos: number) => pos > 0);
                const hasFinishPanel = section.isTopFinishPanel && section.count === 1;

                // 옷걸이 봉 Y 위치 계산
                let rodYPosition: number;
                if (safetyShelfPositionMm !== undefined) {
                  // 안전선반이 있는 경우: 브라켓 윗면이 안전선반 하단에 붙음
                  const safetyShelfY = sectionBottomY + mmToThreeUnits(safetyShelfPositionMm);
                  rodYPosition = safetyShelfY - basicThickness / 2 - mmToThreeUnits(75 / 2);
                } else if (sectionIndex === 0) {
                  // 하부 섹션: 브라켓 상단이 하부 섹션 상판 밑면에 닿음
                  // 측면판 렌더링과 동일한 계산 사용
                  const lowerTopPanelY = sectionCenterY + sectionHeight/2 - basicThickness/2;
                  const lowerTopPanelBottom = lowerTopPanelY - basicThickness / 2;
                  rodYPosition = lowerTopPanelBottom - mmToThreeUnits(75 / 2);
                } else if (hasFinishPanel) {
                  // 마감 패널이 있는 경우: 브라켓 윗면이 마감 패널 하단에서 27mm 아래
                  const finishPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                  rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
                } else {
                  // 안전선반도 마감 패널도 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
                  const sectionTopPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                  rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);
                }

                // 옷봉 Z 위치 계산 (섹션 깊이에 따라 조정)
                let rodZPosition = 0;
                const currentSectionDepth = sectionDepths && sectionDepths[sectionIndex] ? sectionDepths[sectionIndex] : depth;
                const depthDiff = depth - currentSectionDepth;
                rodZPosition = depthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦

                // 섹션별 깊이에 맞는 adjustedDepth 계산
                const sectionAdjustedDepth = currentSectionDepth - basicThickness * 2;

                return (
                  <ClothingRod
                    key={`clothing-rod-${sectionIndex}`}
                    innerWidth={innerWidth}
                    yPosition={rodYPosition}
                    zPosition={rodZPosition}
                    renderMode={renderMode}
                    isDragging={false}
                    isEditMode={isEditMode}
                    adjustedDepthForShelves={sectionAdjustedDepth}
                    depth={currentSectionDepth}
                  />
                );
              });
            })()}
          </>
        )}

        {/* 조절발통 (네 모서리) */}
        <AdjustableFootsRenderer
          width={width}
          depth={depth}
          yOffset={-height / 2}
          backZOffset={sectionDepths && sectionDepths[0] ? (depth - sectionDepths[0]) : 0}
          renderMode={renderMode}
          isHighlighted={false}
          isFloating={false}
          baseHeight={spaceInfo?.baseConfig?.height || 65}
          baseDepth={spaceInfo?.baseConfig?.depth || 0}
          viewMode={viewMode}
          view2DDirection={view2DDirection}
        />
        </group>
      )}

      {/* 도어는 showFurniture와 관계없이 항상 렌더링 (도어 도면 출력용) */}
      {hasDoor && spaceInfo && (() => {
        console.log('🚪 [DualType2 도어 렌더링]', {
          hasDoor,
          doorSplit,
          doorSplitType: typeof doorSplit,
          isUndefined: doorSplit === undefined,
          renderingMode: doorSplit ? '분할' : '병합'
        });
        return (
        <>
          {!doorSplit ? (
            // 병합 모드: 도어 하나
            <DoorModule
              moduleWidth={doorWidth || moduleData.dimensions.width}
              moduleDepth={baseFurniture.actualDepthMm}
              hingePosition={hingePosition}
              spaceInfo={spaceInfo}
              color={baseFurniture.doorColor}
              moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
              originalSlotWidth={originalSlotWidth}
              slotCenterX={slotCenterX || 0} // slotCenterX가 전달되면 사용, 아니면 0
              slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
              isDragging={isDragging}
              isEditMode={isEditMode}
              slotIndex={slotIndex}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
              doorTopGap={doorTopGap}
              doorBottomGap={doorBottomGap}
              furnitureId={placedFurnitureId}
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
                moduleData={moduleData}
                originalSlotWidth={originalSlotWidth}
                slotCenterX={slotCenterX || 0}
                slotWidths={slotWidths}
                isDragging={isDragging}
                isEditMode={isEditMode}
                slotIndex={slotIndex}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
                sectionHeightsMm={sectionHeightsMm}
                sectionIndex={1}
                totalSections={2}
                doorTopGap={upperDoorTopGap ?? doorTopGap}
                doorBottomGap={upperDoorBottomGap ?? 0}
                furnitureId={placedFurnitureId}
              />

              {/* 하부 섹션 도어 */}
              <DoorModule
                moduleWidth={doorWidth || moduleData.dimensions.width}
                moduleDepth={baseFurniture.actualDepthMm}
                hingePosition={hingePosition}
                spaceInfo={spaceInfo}
                color={baseFurniture.doorColor}
                moduleData={moduleData}
                originalSlotWidth={originalSlotWidth}
                slotCenterX={slotCenterX || 0}
                slotWidths={slotWidths}
                isDragging={isDragging}
                isEditMode={isEditMode}
                slotIndex={slotIndex}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
                sectionHeightsMm={sectionHeightsMm}
                sectionIndex={0}
                totalSections={2}
                doorTopGap={lowerDoorTopGap ?? 0}
                doorBottomGap={lowerDoorBottomGap ?? doorBottomGap}
                furnitureId={placedFurnitureId}
              />
            </>
          )}
        </>
        );
      })()}
    </>
  );
};

export default DualType2; 
