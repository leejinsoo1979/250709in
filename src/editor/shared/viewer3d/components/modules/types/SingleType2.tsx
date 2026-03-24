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
  customSections, // 사용자 정의 섹션 설정 (자유배치 freeHeight 조정)
  furnitureId,
  placedFurnitureId,
  doorTopGap = 5,
  doorBottomGap = 25,
  lowerSectionDepth,
  upperSectionDepth,
  lowerSectionDepthDirection = 'front',
  upperSectionDepthDirection = 'front',
  grainDirection,
  panelGrainDirections,
  backPanelThickness: backPanelThicknessProp,
  lowerSectionTopOffset,
  zone,
  hasBase,
  individualFloatHeight,
  parentGroupY
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    customSections, // 사용자 정의 섹션 설정
    grainDirection,
    panelGrainDirections,
    backPanelThicknessMm: backPanelThicknessProp
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
    textureUrl,
    panelGrainDirections: hookPanelGrainDirections,
    mmToThreeUnits,
    isMultiSectionFurniture,
    getSectionHeights
  } = baseFurniture;

  const { renderMode, viewMode } = useSpace3DView();
  const { isIndividualDoorOpen, toggleIndividualDoor } = useUIStore();

  // 띄워서 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === 'float';

  // 디버깅: 조절발 렌더링 조건 확인
  React.useEffect(() => {
    console.log('🔍 SingleType2 조절발 조건 체크:', {
      moduleId: moduleData.id,
      placedFurnitureId,
      showFurniture,
      isFloating,
      'spaceInfo.baseConfig.placementType': spaceInfo?.baseConfig?.placementType,
      lowerSectionTopOffset,
      '조절발렌더링': showFurniture && !isFloating && !(lowerSectionTopOffset && lowerSectionTopOffset > 0)
    });
  }, [showFurniture, isFloating, lowerSectionTopOffset, moduleData.id, placedFurnitureId, spaceInfo?.baseConfig?.placementType]);

  // 디버그: zone 값 확인
  React.useEffect(() => {
    console.log('🚪🔴 SingleType2 - zone prop:', {
      zone,
      moduleId: moduleData.id,
      placedFurnitureId,
      droppedCeilingEnabled: spaceInfo?.droppedCeiling?.enabled,
      dropHeight: spaceInfo?.droppedCeiling?.dropHeight
    });
  }, [zone, moduleData.id, placedFurnitureId, spaceInfo?.droppedCeiling]);

  // 가구 본체 클릭 시 열린 도어 닫기 핸들러
  const handleCabinetBodyClick = (e: any) => {
    if (!placedFurnitureId) return;

    e.stopPropagation();

    // 병합 모드: 섹션 0 체크
    const isDoorOpen = isIndividualDoorOpen(placedFurnitureId, 0);
    if (isDoorOpen) {
      toggleIndividualDoor(placedFurnitureId, 0);
      console.log('🚪 가구 본체 클릭 → 도어 닫기');
    }
  };
  const floatHeight = isFloating ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
  const showIndirectLight = false;
  const { view2DDirection, indirectLightEnabled, indirectLightIntensity, showDimensions, showDimensionsText, highlightedSection } = useUIStore();
  const { dimensionColor, baseFontSize } = useDimensionColor();
  const { theme } = useTheme();

  // 섹션별 깊이 계산 (기본값: 표준 깊이)
  const sectionDepths = React.useMemo(() => {
    const defaultDepth = depth;
    return [
      lowerSectionDepth ? mmToThreeUnits(lowerSectionDepth) : defaultDepth, // 하부 섹션
      upperSectionDepth ? mmToThreeUnits(upperSectionDepth) : defaultDepth  // 상부 섹션
    ];
  }, [lowerSectionDepth, upperSectionDepth, depth, mmToThreeUnits]);

  const sectionHeightsUnits = getSectionHeights();

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
              // 현재 섹션의 깊이
              const currentDepth = sectionDepths[index] || depth;

              // Z축 위치 조정: 깊이가 줄어들면 뒤쪽에서 줄어들도록
              // 앞면 위치는 고정, 뒤쪽에서 줄어듦
              const depthDiff = depth - currentDepth;
              const sectionDir = index === 0 ? lowerSectionDepthDirection : upperSectionDepthDirection;
              const zOffset = depthDiff === 0 ? 0 : sectionDir === 'back' ? depthDiff / 2 : -depthDiff / 2;

              // 현재 섹션의 중심 Y 위치
              const sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness;

              // 다음 섹션을 위해 누적
              const currentYPosition = accumulatedY;
              accumulatedY += sectionHeight;

            // 섹션별 강조 확인
              const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

            return (
              <React.Fragment key={`side-panels-${index}`}>
                {/* 왼쪽 측면 판재 - 섹션별로 분할, 깊이 적용 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, currentDepth]}
                  position={[-width/2 + basicThickness/2, sectionCenterY, zOffset]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                  onClick={handleCabinetBodyClick}
                  panelName={`${index === 0 ? '(하)' : '(상)'}좌측`}
                  panelGrainDirections={hookPanelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />

                {/* 오른쪽 측면 판재 - 섹션별로 분할, 깊이 적용 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, currentDepth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, zOffset]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                  onClick={handleCabinetBodyClick}
                  panelName={`${index === 0 ? '(하)' : '(상)'}우측`}
                  panelGrainDirections={hookPanelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />
                
                {/* 하부 섹션 상판 + 상부 섹션 바닥판 (2단 옷장 구조) - index=0일때만 */}
                {index === 0 && (() => {
                  const middlePanelY = sectionCenterY + sectionHeight/2 - basicThickness/2;
                  const lowerTopPanelY = middlePanelY; // 하부 섹션 상판 위치

                  // 중간판 강조: 하부 섹션 상판은 index 섹션에 속함
                  const isLowerHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;
                  const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-${index + 1}`;

                  // 하부 섹션 깊이 (index=0)
                  const lowerDepth = sectionDepths[0] || depth;
                  const lowerDepthDiff = depth - lowerDepth;
                  const lowerZOffset = lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2;

                  // 상부 섹션 깊이 (index=1)
                  const upperDepth = sectionDepths[1] || depth;
                  const upperDepthDiff = depth - upperDepth;
                  const upperZOffset = upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2;

                  console.log('📦 중간판 실제 렌더링 위치:', {
                    sectionCenterY,
                    sectionHeight,
                    basicThickness,
                    middlePanelY,
                    middlePanelY_mm: middlePanelY / 0.01,
                    lowerTopPanelY,
                    lowerTopPanelY_mm: lowerTopPanelY / 0.01,
                    lowerDepth,
                    lowerDepth_mm: lowerDepth / 0.01,
                    upperDepth,
                    upperDepth_mm: upperDepth / 0.01,
                    설명: '상부섹션 바닥판(middlePanelY), 하부섹션 상판(lowerTopPanelY)'
                  });

                  return (
                    <>
                      {/* 하부 섹션 상판 - 하부 섹션 깊이 적용 + 사용자 오프셋 (앞에서 줄어듦) + 뒤에서 26mm 줄임, 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        args={[innerWidth - mmToThreeUnits(1), basicThickness, lowerDepth - mmToThreeUnits(26) - mmToThreeUnits(lowerSectionTopOffset || 0)]}
                        position={[0, lowerTopPanelY, lowerZOffset + mmToThreeUnits(13) - mmToThreeUnits(lowerSectionTopOffset || 0) / 2]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isLowerHighlighted}
                        onClick={handleCabinetBodyClick}
                        panelName="(하)상판"
                        panelGrainDirections={hookPanelGrainDirections}
                        textureUrl={spaceInfo.materialConfig?.doorTexture}
                      />

                      {/* 상부 섹션 바닥판 - 상부 섹션 깊이 적용 + 뒤에서 26mm 줄임, 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        args={[innerWidth - mmToThreeUnits(1), basicThickness, upperDepth - mmToThreeUnits(26)]}
                        position={[0, middlePanelY + basicThickness, upperZOffset + mmToThreeUnits(13)]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isUpperHighlighted}
                        onClick={handleCabinetBodyClick}
                        panelName="(상)바닥"
                        panelGrainDirections={hookPanelGrainDirections}
                        textureUrl={spaceInfo.materialConfig?.doorTexture}
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
            furnitureId={placedFurnitureId}
            isDragging={isDragging}
            isEditMode={isEditMode}
            onClick={handleCabinetBodyClick}
            panelName="좌측판"
            panelGrainDirections={hookPanelGrainDirections}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
          />

          {/* 오른쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[width/2 - basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            furnitureId={placedFurnitureId}
            isDragging={isDragging}
            isEditMode={isEditMode}
            onClick={handleCabinetBodyClick}
            panelName="우측판"
            panelGrainDirections={hookPanelGrainDirections}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
          />
        </>
      )}

      {/* 상단 상판 두께 치수 표시 - 정면도에서만, 띄워서 배치가 아닐 때만 */}
      {showDimensions && showDimensionsText && viewMode !== '3D' && !isFloating && (
        <group>
          {/* 상판 두께 텍스트 */}
          <Text
            position={[
              viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
              height/2 - basicThickness/2,
              viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0
            ]}
            fontSize={baseFontSize}
            color={viewMode === '3D' ? '#000000' : dimensionColor}
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
            color={viewMode === '3D' ? '#000000' : dimensionColor}
            lineWidth={1}
          />
          {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
            <>
              <mesh position={[-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
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
            category={moduleData.category}
            placedFurnitureId={placedFurnitureId}
              textureUrl={spaceInfo.materialConfig?.doorTexture}
              panelGrainDirections={panelGrainDirections}
            sectionDepths={sectionDepths}
            sectionDepthDirections={[lowerSectionDepthDirection, upperSectionDepthDirection]}
            lowerSectionTopOffsetMm={lowerSectionTopOffset}
            isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
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

              // 안전선반 위치 찾기
              const safetyShelfPositionMm = section.shelfPositions?.find((pos: number) => pos > 0);

              // 옷걸이 봉 Y 위치 계산
              let rodYPosition: number;
              if (safetyShelfPositionMm !== undefined) {
                // 안전선반이 있는 경우: 브라켓 윗면이 안전선반 하단에 붙음
                const safetyShelfY = sectionBottomY + mmToThreeUnits(safetyShelfPositionMm);
                rodYPosition = safetyShelfY - basicThickness / 2 - mmToThreeUnits(75 / 2);
              } else if (sectionIndex === 0) {
                // 하부 섹션: 브라켓 상단이 하부 섹션 상판 밑면에 닿음
                // 측면판 렌더링과 동일한 계산 사용
                // sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness
                // middlePanelY = sectionCenterY + sectionHeight/2 + basicThickness/2
                // lowerTopPanelY = middlePanelY - basicThickness

                // 여기서 sectionBottomY는 옷봉용 계산값이므로 측면판과 다름
                // 측면판 계산: accumulatedY = -height/2 + basicThickness
                const accumulatedY = -height/2 + basicThickness;
                const sectionCenterY_panel = accumulatedY + actualSectionHeight / 2 - basicThickness;
                const middlePanelY = sectionCenterY_panel + actualSectionHeight/2 + basicThickness/2;
                const lowerTopPanelY = middlePanelY - basicThickness;
                const lowerTopPanelBottom = lowerTopPanelY - basicThickness / 2;

                // 브라켓 상단이 하부섹션 상판 밑면에 닿으므로
                rodYPosition = lowerTopPanelBottom - mmToThreeUnits(75 / 2);

                console.log('🔵 SingleType2 하부섹션 옷봉 위치 계산');
                console.log('  accumulatedY:', accumulatedY * 100);
                console.log('  actualSectionHeight:', actualSectionHeight * 100);
                console.log('  sectionCenterY_panel:', sectionCenterY_panel * 100);
                console.log('  middlePanelY (상부바닥중심):', middlePanelY * 100);
                console.log('  lowerTopPanelY (하부상판중심):', lowerTopPanelY * 100);
                console.log('  lowerTopPanelBottom (하부상판밑면):', lowerTopPanelBottom * 100);
                console.log('  bracketHeight:', 75);
                console.log('  rodYPosition (옷봉중심):', rodYPosition * 100);
              } else {
                // 상부 섹션: 브라켓 윗면이 상부 섹션 상판 하단에 붙음
                const sectionTopPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);

                console.log('🔵 SingleType2 상부섹션 옷봉 위치 계산');
                console.log('  sectionBottomY:', sectionBottomY * 100);
                console.log('  actualSectionHeight:', actualSectionHeight * 100);
                console.log('  sectionTopPanelBottom:', sectionTopPanelBottom * 100);
                console.log('  rodYPosition:', rodYPosition * 100);
              }

              // 해당 섹션의 깊이 사용
              const currentSectionDepth = sectionDepths[sectionIndex] || depth;
              const currentAdjustedDepthForShelves = currentSectionDepth - basicThickness;

              // Z 위치: 깊이 변화에 따른 오프셋 (앞면 고정)
              const depthDiff = depth - currentSectionDepth;
              const sectionDir = sectionIndex === 0 ? lowerSectionDepthDirection : upperSectionDepthDirection;
              const rodZOffset = depthDiff === 0 ? 0 : sectionDir === 'back' ? depthDiff / 2 : -depthDiff / 2;

              console.log(`🎽 ClothingRod Z 오프셋 계산 (섹션${sectionIndex}):`, {
                depth_mm: depth / 0.01,
                currentSectionDepth_mm: currentSectionDepth / 0.01,
                depthDiff_mm: depthDiff / 0.01,
                rodZOffset_mm: rodZOffset / 0.01,
                설명: '섹션 깊이 중앙 = 0, 앞으로 이동 = +양수'
              });

              return (
                <ClothingRod
                  key={`clothing-rod-${sectionIndex}`}
                  innerWidth={innerWidth}
                  yPosition={rodYPosition}
                  zPosition={rodZOffset}
                  renderMode={renderMode}
                  isDragging={false}
                  isEditMode={isEditMode}
                  adjustedDepthForShelves={currentAdjustedDepthForShelves}
                  depth={currentSectionDepth}
                />
              );
            });
          })()}
        </>
      )}

      {/* 상단 판재 - 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      {(() => {
        // 상단 판재는 마지막 섹션(상부 섹션)의 깊이 사용
        const lastSectionIndex = isMultiSectionFurniture() ? getSectionHeights().length - 1 : 0;
        const topPanelDepth = sectionDepths[lastSectionIndex] || depth;
        const backReduction = mmToThreeUnits(26); // 뒤에서 26mm 줄임
        const topPanelDepthDiff = depth - topPanelDepth;
        const topPanelZOffset = (topPanelDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? topPanelDepthDiff / 2 : -topPanelDepthDiff / 2) + backReduction / 2;

        return (
          <BoxWithEdges
            args={[innerWidth - mmToThreeUnits(1), basicThickness, topPanelDepth - backReduction]}
            position={[0, height/2 - basicThickness/2, topPanelZOffset]}
            material={material}
            renderMode={renderMode}
            furnitureId={placedFurnitureId}
            isDragging={isDragging}
            isEditMode={isEditMode}
            isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-${lastSectionIndex}` : false}
            onClick={handleCabinetBodyClick}
            panelName={isMultiSectionFurniture() ? "(상)상판" : "상판"}
            panelGrainDirections={hookPanelGrainDirections}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
          />
        );
      })()}

      {/* 하단 판재 - 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      {(() => {
        // 하단 판재는 첫 번째 섹션(하부 섹션)의 깊이 사용
        const bottomPanelDepth = sectionDepths[0] || depth;
        const backReduction = mmToThreeUnits(26); // 뒤에서 26mm 줄임
        const bottomPanelDepthDiff = depth - bottomPanelDepth;
        const bottomPanelZOffset = (bottomPanelDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? bottomPanelDepthDiff / 2 : -bottomPanelDepthDiff / 2) + backReduction / 2;

        return (
          <BoxWithEdges
            args={[innerWidth - mmToThreeUnits(1), basicThickness, bottomPanelDepth - backReduction]}
            position={[0, -height/2 + basicThickness/2, bottomPanelZOffset]}
            material={material}
            renderMode={renderMode}
            furnitureId={placedFurnitureId}
            isDragging={isDragging}
            isEditMode={isEditMode}
            isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-0` : false}
            onClick={handleCabinetBodyClick}
            panelName={isMultiSectionFurniture() ? "(하)바닥" : "바닥판"}
            panelGrainDirections={hookPanelGrainDirections}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
          />
        );
      })()}

      {/* 뒷면 판재 (9mm 백패널, 섹션별로 분리) */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 하부/상부 백패널 분리
        <>
          {(() => {
            const sectionHeights = getSectionHeights();
            const lowerSectionHeight = sectionHeights[0];
            const upperSectionHeight = sectionHeights[1];

            // 백패널 높이 = 섹션 내경높이 + 10mm + 26mm (위아래 각각 13mm씩 확장)
            // 내경높이 = 섹션높이 - 상하판(36mm)
            const lowerInnerHeight = lowerSectionHeight - basicThickness * 2;
            const upperInnerHeight = upperSectionHeight - basicThickness * 2;
            const backPanelExtension = 26; // 위아래 각각 13mm씩
            const lowerBackPanelHeight = lowerInnerHeight + mmToThreeUnits(10 + backPanelExtension);
            const upperBackPanelHeight = upperInnerHeight + mmToThreeUnits(10 + backPanelExtension);

            // 백패널 Y 위치 (확장된 높이의 중앙)
            const lowerBackPanelY = -height/2 + lowerSectionHeight/2;
            const upperBackPanelY = -height/2 + lowerSectionHeight + upperSectionHeight/2;

            // 각 섹션의 깊이 가져오기
            const lowerDepth = sectionDepths[0] || depth;
            const upperDepth = sectionDepths[1] || depth;

            // Z 위치: 각 섹션의 뒤쪽에서 17mm 앞으로
            // 앞면 고정이므로 depthDiff/2만큼 앞으로 이동
            const lowerDepthDiff = depth - lowerDepth;
            const upperDepthDiff = depth - upperDepth;

            const lowerBackPanelZ = -lowerDepth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1)) + (lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff/2 : -lowerDepthDiff/2);
            const upperBackPanelZ = -upperDepth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1)) + (upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff/2 : -upperDepthDiff/2);

            return (
              <>
                {/* 하부 섹션 백패널 - 하부 섹션 깊이 적용 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), lowerBackPanelHeight, backPanelThickness]}
                  position={[0, lowerBackPanelY, lowerBackPanelZ]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                  panelName="(하)백패널"
                  panelGrainDirections={hookPanelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />

                {/* 상부 섹션 백패널 - 상부 섹션 깊이 적용 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), upperBackPanelHeight, backPanelThickness]}
                  position={[0, upperBackPanelY, upperBackPanelZ]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                  panelName="(상)백패널"
                  panelGrainDirections={hookPanelGrainDirections}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                />

                {/* 보강대 (각 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께
                    2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임) */}
                {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
                  const reinforcementHeight = mmToThreeUnits(60);
                  const reinforcementDepth = mmToThreeUnits(15);
                  // 양쪽 0.5mm씩 축소 (총 1mm)
                  const reinforcementWidth = innerWidth - mmToThreeUnits(1);
                  const lowerReinforcementZ = lowerBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;
                  const upperReinforcementZ = upperBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;

                  return (
                    <>
                      {/* 하부 섹션 하단 보강대 */}
                      <BoxWithEdges
                        args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                        position={[0, lowerBackPanelY - lowerBackPanelHeight/2 + reinforcementHeight/2, lowerReinforcementZ]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                        panelName="(하)보강대 1"
                      />
                      {/* 하부 섹션 상단 보강대 */}
                      <BoxWithEdges
                        args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                        position={[0, lowerBackPanelY + lowerBackPanelHeight/2 - reinforcementHeight/2, lowerReinforcementZ]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                        panelName="(하)보강대 2"
                      />
                      {/* 상부 섹션 하단 보강대 */}
                      <BoxWithEdges
                        args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                        position={[0, upperBackPanelY - upperBackPanelHeight/2 + reinforcementHeight/2, upperReinforcementZ]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                        panelName="(상)보강대 1"
                      />
                      {/* 상부 섹션 상단 보강대 */}
                      <BoxWithEdges
                        args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                        position={[0, upperBackPanelY + upperBackPanelHeight/2 - reinforcementHeight/2, upperReinforcementZ]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                        panelName="(상)보강대 2"
                      />
                    </>
                  );
                })()}
              </>
            );
          })()}
        </>
      ) : (
        // 단일 섹션: 통짜 백패널 (위아래 13mm씩 확장)
        <>
          <BoxWithEdges
            args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10 + 26), backPanelThickness]}
            position={[0, 0, -depth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1))]}
            material={material}
            renderMode={renderMode}
            furnitureId={placedFurnitureId}
            isDragging={isDragging}
            isEditMode={isEditMode}
            isBackPanel={true}
            panelName="백패널"
            panelGrainDirections={hookPanelGrainDirections}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
          />

          {/* 보강대 (단일 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께
              2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임) */}
          {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
            const singleBackPanelHeight = innerHeight + mmToThreeUnits(10 + 26);
            const reinforcementHeight = mmToThreeUnits(60);
            const reinforcementDepth = mmToThreeUnits(15);
            // 양쪽 0.5mm씩 축소 (총 1mm)
            const reinforcementWidth = innerWidth - mmToThreeUnits(1);
            const backPanelZ = -depth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1));
            const reinforcementZ = backPanelZ - backPanelThickness/2 - reinforcementDepth/2;

            return (
              <>
                {/* 하단 보강대 */}
                <BoxWithEdges
                  args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                  position={[0, -singleBackPanelHeight/2 + reinforcementHeight/2, reinforcementZ]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  panelName="보강대 1"
                />
                {/* 상단 보강대 */}
                <BoxWithEdges
                  args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                  position={[0, singleBackPanelHeight/2 - reinforcementHeight/2, reinforcementZ]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  panelName="보강대 2"
                />
              </>
            );
          })()}
        </>
      )}

      {/* 환기캡 렌더링 */}
      {!isDragging && showFurniture && (
        <VentilationCap
          position={[
            innerWidth/2 - mmToThreeUnits(132),  // 우측 패널 안쪽으로 132mm
            height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
            -depth/2 + backPanelThickness + (basicThickness - mmToThreeUnits(1)) + 0.01  // 백패널 앞쪽에 살짝 앞으로
          ]}
          diameter={98}
          renderMode={renderMode}
        />
      )}
        </group>
      )}
      
      {/* 도어 렌더링 */}
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
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? floatHeight : 0}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
          zone={zone}
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
          parentGroupY={parentGroupY}
        />
      )}

      {/* 조절발통 (네 모서리) - showFurniture가 true이고 띄움배치가 아닐 때만 렌더링 */}
      {showFurniture && !isFloating && !(lowerSectionTopOffset && lowerSectionTopOffset > 0) && (() => {
        // 하부 섹션 깊이 사용 (조절발은 하부 섹션에 붙음)
        const lowerDepth = sectionDepths[0] || depth;
        const depthDiff = depth - lowerDepth;
        const zOffset = depthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? depthDiff / 2 : -depthDiff / 2;

        return (
          <group position={[0, 0, zOffset]}>
            <AdjustableFootsRenderer
              width={width}
              depth={lowerDepth}
              yOffset={-height / 2}
              placedFurnitureId={placedFurnitureId}
              renderMode={renderMode}
              isHighlighted={false}
              isFloating={isFloating}
              baseHeight={spaceInfo?.baseConfig?.height || 65}
              baseDepth={spaceInfo?.baseConfig?.depth || 0}
              viewMode={viewMode}
              view2DDirection={view2DDirection}
            />
          </group>
        );
      })()}
    </>
  );
};

export default SingleType2; 
