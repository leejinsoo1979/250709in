import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useDimensionColor } from '../hooks/useDimensionColor';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from "@/contexts/ThemeContext";
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { useUIStore } from '@/store/uiStore';
import { ClothingRod } from '../components/ClothingRod';
import { VentilationCap } from '../components/VentilationCap';


/**
 * DualType4 컴포넌트
 * - 4단 서랍 + 옷장 복합형 (dual-4drawer-hanging)
 * - ID 패턴: dual-4drawer-hanging-*
 * - 구조: 하단 4단서랍 + 상단 옷장 (듀얼 타입)
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const DualType4: React.FC<FurnitureTypeProps> = ({
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
  customSections, // 사용자 정의 섹션 설정
  placedFurnitureId,
  showFurniture = true, // 가구 본체 표시 여부
  visibleSectionIndex = null,
  textureUrl,
  panelGrainDirections, // 듀얼 가구 섹션 필터링 (이 타입은 대칭이므로 사용하지 않음)
  backPanelThickness: backPanelThicknessProp,
  doorTopGap = 5,
  doorBottomGap = 25,
  lowerSectionDepth,
  upperSectionDepth,
  lowerSectionDepthDirection = 'front',
  upperSectionDepthDirection = 'front',
  lowerSectionTopOffset,
  zone, // 단내림 영역 정보
  hasBase,
  individualFloatHeight
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
    customSections, // 사용자 정의 섹션 설정
    lowerSectionDepth,
    upperSectionDepth,
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
    mmToThreeUnits,
    isMultiSectionFurniture,
    getSectionHeights
  } = baseFurniture;

  const { renderMode, viewMode } = useSpace3DView();
  const { view2DDirection, showDimensions, showDimensionsText, highlightedSection, highlightedPanel } = useUIStore();
  const { theme } = useTheme();
  const { dimensionColor, baseFontSize } = useDimensionColor();

  // 디버그: zone 값 확인
  React.useEffect(() => {
    console.log('🚪🔴 DualType4 - zone prop:', {
      zone,
      moduleId: moduleData.id,
      placedFurnitureId
    });
  }, [zone, moduleData.id, placedFurnitureId]);

  // sectionHeightsMm 계산 (도어 분할용)
  const sectionHeights = getSectionHeights();
  const isFloating = spaceInfo?.baseConfig?.placementType === 'float';
  // 섹션별 깊이 배열 생성 (Three.js 단위)
  const sectionDepths = (() => {
    const { lowerSectionDepthMm, upperSectionDepthMm } = baseFurniture;

    console.log('🔍 [DualType4 섹션 깊이 디버깅]', {
      moduleId: moduleData.id,
      lowerSectionDepth,
      upperSectionDepth,
      lowerSectionDepthMm,
      upperSectionDepthMm,
      sections: baseFurniture.modelConfig.sections,
      sectionsLength: baseFurniture.modelConfig.sections?.length
    });

    // 2섹션 가구가 아니면 null 반환
    if (!baseFurniture.modelConfig.sections || baseFurniture.modelConfig.sections.length !== 2) {
      console.warn('⚠️ [DualType4] 2섹션 가구가 아님');
      return undefined;
    }

    const result = [
      lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : depth,
      upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : depth
    ];

    console.log('✅ [DualType4 섹션 깊이 결과]', result);

    return result;
  })();

  // 패널 강조용 형광색 material
  const highlightMaterial = React.useMemo(() =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00FF00'), // 형광 녹색
      transparent: true,
      opacity: 1.0
    }),
  []);

  // 패널별 material 결정 함수
  const getPanelMaterial = React.useCallback((panelName: string) => {
    const panelId = `${placedFurnitureId}-${panelName}`;
    const isHighlighted = highlightedPanel === panelId;

    if (highlightedPanel) {
      console.log('🔍 DualType4 패널 material 체크:', {
        panelName,
        placedFurnitureId,
        highlightedPanel,
        panelId,
        isHighlighted,
        returningMaterial: isHighlighted ? 'highlight' : 'normal'
      });
    }

    // ONLY highlighted panel gets highlightMaterial, others stay normal
    if (isHighlighted) {
      return highlightMaterial;
    }
    return material;
  }, [highlightedPanel, placedFurnitureId, material, highlightMaterial]);

  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <group>
          {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {(() => {
            // 하부 측판 높이 = 1000mm
            const drawerSectionHeight = mmToThreeUnits(1000);
            const hangingSectionHeight = getSectionHeights()[1];
            // 중간 패널 위치: 하부 측판 상단(1000mm)에서 패널 두께 절반만 빼기
            const lowerTopPanelY = -height/2 + drawerSectionHeight - basicThickness/2;
            const lowerPanelY = -height/2 + drawerSectionHeight/2;
            const upperPanelY = -height/2 + drawerSectionHeight + hangingSectionHeight/2;
            
            return getSectionHeights().map((sectionHeight: number, index: number) => {
              let currentYPosition = -height/2 + basicThickness;

              // 현재 섹션까지의 Y 위치 계산
              for (let i = 0; i < index; i++) {
                currentYPosition += getSectionHeights()[i];
              }

              const sectionCenterY = currentYPosition + sectionHeight / 2 - basicThickness;

              // 섹션별 강조 확인
              const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

              // 현재 섹션의 깊이 가져오기
              const currentSectionDepth = (sectionDepths && sectionDepths[index]) ? sectionDepths[index] : depth;

              // 깊이 차이 계산 (방향에 따라 앞/뒤에서 줄어듦)
              const depthDiff = depth - currentSectionDepth;
              const sectionDir = index === 0 ? lowerSectionDepthDirection : upperSectionDepthDirection;
              const zOffset = depthDiff === 0 ? 0 : sectionDir === 'back' ? depthDiff / 2 : -depthDiff / 2;

              return (
                <React.Fragment key={`side-panels-${index}`}>
                  {index === 0 ? (
                    // 하부 섹션: 1000mm + 18mm
                    <>
                      {/* 왼쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, drawerSectionHeight, currentSectionDepth]}
                        position={[-width/2 + basicThickness/2, lowerPanelY, zOffset]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                        panelName="(하)좌측"
                      />

                      {/* 오른쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, drawerSectionHeight, currentSectionDepth]}
                        position={[width/2 - basicThickness/2, lowerPanelY, zOffset]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                        panelName="(하)우측"
                      />
                    </>
                  ) : (
                    // 상부 섹션: 18mm 줄어든 높이
                    <>
                      {/* 왼쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, hangingSectionHeight, currentSectionDepth]}
                        position={[-width/2 + basicThickness/2, upperPanelY, zOffset]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                        panelName="(상)좌측"
                      />

                      {/* 오른쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, hangingSectionHeight, currentSectionDepth]}
                        position={[width/2 - basicThickness/2, upperPanelY, zOffset]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                        panelName="(상)우측"
                      />
                    </>
                  )}
                  
                  {/* 중간 구분 패널 (하부 섹션 상판) - 뒤에서 26mm 줄여서 백패널과 맞닿게 + 사용자 오프셋 적용 (앞에서 줄어듦) */}
                  {index === 0 && (() => {
                    const lowerSectionDepth = (sectionDepths && sectionDepths[0]) ? sectionDepths[0] : depth;
                    const lowerDepthDiff = depth - lowerSectionDepth;
                    const panelDepth = lowerSectionDepth - mmToThreeUnits(26) - mmToThreeUnits(lowerSectionTopOffset || 0);
                    const panelZOffset = (lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2) + mmToThreeUnits(13) - mmToThreeUnits(lowerSectionTopOffset || 0)/2;

                    return (
                      <BoxWithEdges
                        key={`lower-top-panel-${getPanelMaterial('(하)상판').uuid}`}
                        args={[innerWidth - mmToThreeUnits(1), basicThickness, panelDepth]}
                        position={[0, lowerTopPanelY, panelZOffset]}
                        material={getPanelMaterial('(하)상판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedPanel === `${placedFurnitureId}-(하)상판`}
                        panelName="(하)상판"
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                        panelGrainDirections={panelGrainDirections}
                      />
                    );
                  })()}

                  {/* 상부 섹션의 바닥판 - 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
                  {index === 1 && (() => {
                    // 상부 섹션 깊이 사용 (index=1)
                    const upperSectionDepth = (sectionDepths && sectionDepths[1]) ? sectionDepths[1] : depth;
                    const upperDepthDiff = depth - upperSectionDepth;
                    const panelDepth = upperSectionDepth - mmToThreeUnits(26);
                    const panelZOffset = (upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2) + mmToThreeUnits(13);

                    return (
                      <BoxWithEdges
                        args={[innerWidth - mmToThreeUnits(1), basicThickness, panelDepth]}
                        position={[0, lowerTopPanelY + basicThickness, panelZOffset]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                        panelName="(상)바닥"
                      />
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
            panelName="좌측판"
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
            panelName="우측판"
          />
        </>
      )}
      
      {/* 상단 판재 - 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      <BoxWithEdges
        args={[innerWidth - mmToThreeUnits(1), basicThickness, (sectionDepths && sectionDepths[1] ? sectionDepths[1] : depth) - mmToThreeUnits(26)]}
        position={[0, height/2 - basicThickness/2, (sectionDepths && sectionDepths[1] ? ((depth - sectionDepths[1]) === 0 ? 0 : upperSectionDepthDirection === 'back' ? (depth - sectionDepths[1]) / 2 : -(depth - sectionDepths[1]) / 2) : 0) + mmToThreeUnits(13)]}
        material={material}
        renderMode={renderMode}
        furnitureId={placedFurnitureId}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-1` : false}
        panelName={isMultiSectionFurniture() ? "(상)상판" : "상판"}
      />
      
      {/* Type4 상단 상판 두께 치수 표시 - 정면도에서만, 띄워서 배치가 아닐 때만 */}
      {moduleData?.id?.includes('4drawer-hanging') && showFurniture && showDimensions && showDimensionsText && viewMode !== '3D' && !isFloating && (
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
      
      {/* 하단 판재 - 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      <BoxWithEdges
        args={[innerWidth - mmToThreeUnits(1), basicThickness, (sectionDepths && sectionDepths[0] ? sectionDepths[0] : depth) - mmToThreeUnits(26)]}
        position={[0, -height/2 + basicThickness/2, (sectionDepths && sectionDepths[0] ? ((depth - sectionDepths[0]) === 0 ? 0 : lowerSectionDepthDirection === 'back' ? (depth - sectionDepths[0]) / 2 : -(depth - sectionDepths[0]) / 2) : 0) + mmToThreeUnits(13)]}
        material={material}
        renderMode={renderMode}
        furnitureId={placedFurnitureId}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-0` : false}
        panelName={isMultiSectionFurniture() ? "(하)바닥" : "바닥판"}
      />
      
      {/* 뒷면 판재 (9mm 백패널, 섹션별로 분리) */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 하부/상부 백패널 분리
        <>
          {(() => {
            const lowerSectionHeight = mmToThreeUnits(1000);
            const upperSectionHeight = getSectionHeights()[1];

            // 백패널 높이 = 섹션 내경높이 + 10mm
            // 내경높이 = 섹션높이 - 상하판(36mm)
            const lowerInnerHeight = lowerSectionHeight - basicThickness * 2;
            const upperInnerHeight = upperSectionHeight - basicThickness * 2;
            const lowerBackPanelHeight = lowerInnerHeight + mmToThreeUnits(36);
            const upperBackPanelHeight = upperInnerHeight + mmToThreeUnits(36);

            // 백패널 Y 위치
            const lowerBackPanelY = -height/2 + basicThickness + lowerInnerHeight/2;
            const upperBackPanelY = -height/2 + lowerSectionHeight + basicThickness + upperInnerHeight/2;

            // 하부 섹션 깊이 및 Z 오프셋
            const lowerSectionDepth = (sectionDepths && sectionDepths[0]) ? sectionDepths[0] : depth;
            const lowerDepthDiff = depth - lowerSectionDepth;
            const lowerZOffset = lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2;

            // 상부 섹션 깊이 및 Z 오프셋
            const upperSectionDepth = (sectionDepths && sectionDepths[1]) ? sectionDepths[1] : depth;
            const upperDepthDiff = depth - upperSectionDepth;
            const upperZOffset = upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2;

            return (
              <>
                {/* 하부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), lowerBackPanelHeight, backPanelThickness]}
                  position={[0, lowerBackPanelY, -lowerSectionDepth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1)) + lowerZOffset]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                  panelName="(하)백패널"
                />

                {/* 상부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), upperBackPanelHeight, backPanelThickness]}
                  position={[0, upperBackPanelY, -upperSectionDepth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1)) + upperZOffset]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                  panelName="(상)백패널"
                />

                {/* 보강대 (각 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께
                    2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임) */}
                {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
                  const reinforcementHeight = mmToThreeUnits(60);
                  const reinforcementDepth = mmToThreeUnits(15);
                  // 양쪽 0.5mm씩 축소 (총 1mm)
                  const reinforcementWidth = innerWidth - mmToThreeUnits(1);
                  const lowerBackPanelZ = -lowerSectionDepth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1)) + lowerZOffset;
                  const upperBackPanelZ = -upperSectionDepth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1)) + upperZOffset;
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
                        isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                        panelName="(하)보강대"
                      />
                      {/* 하부 섹션 상단 보강대 */}
                      <BoxWithEdges
                        args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                        position={[0, lowerBackPanelY + lowerBackPanelHeight/2 - reinforcementHeight/2, lowerReinforcementZ]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                        panelName="(하)보강대"
                      />
                      {/* 상부 섹션 하단 보강대 */}
                      <BoxWithEdges
                        args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                        position={[0, upperBackPanelY - upperBackPanelHeight/2 + reinforcementHeight/2, upperReinforcementZ]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                        panelName="(상)보강대"
                      />
                      {/* 상부 섹션 상단 보강대 */}
                      <BoxWithEdges
                        args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                        position={[0, upperBackPanelY + upperBackPanelHeight/2 - reinforcementHeight/2, upperReinforcementZ]}
                        material={material}
                        renderMode={renderMode}
                        furnitureId={placedFurnitureId}
                        isDragging={isDragging}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                        panelName="(상)보강대"
                      />
                    </>
                  );
                })()}
              </>
            );
          })()}
        </>
      ) : (
        // 단일 섹션: 기존 통짜 백패널
        <>
          <BoxWithEdges
            args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(36), backPanelThickness]}
            position={[0, 0, -depth/2 + backPanelThickness/2 + (basicThickness - mmToThreeUnits(1))]}
            material={material}
            renderMode={renderMode}
            furnitureId={placedFurnitureId}
            isDragging={isDragging}
            isBackPanel={true}
            panelName="백패널"
          />

          {/* 보강대 (단일 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께
              2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임) */}
          {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
            const singleBackPanelHeight = innerHeight + mmToThreeUnits(36);
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
                  panelName="보강대"
                />
                {/* 상단 보강대 */}
                <BoxWithEdges
                  args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                  position={[0, singleBackPanelHeight/2 - reinforcementHeight/2, reinforcementZ]}
                  material={material}
                  renderMode={renderMode}
                  furnitureId={placedFurnitureId}
                  isDragging={isDragging}
                  panelName="보강대"
                />
              </>
            );
          })()}
        </>
      )}

      {/* 환기캡 렌더링 */}
      {!isDragging && (
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
            category={moduleData.category}
            placedFurnitureId={placedFurnitureId}
              textureUrl={spaceInfo.materialConfig?.doorTexture}
              panelGrainDirections={panelGrainDirections}
            sectionDepths={sectionDepths}
            sectionDepthDirections={[lowerSectionDepthDirection, upperSectionDepthDirection]}
            lowerSectionTopOffsetMm={lowerSectionTopOffset}
            isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
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

              // 실제 섹션 높이 계산 (현재 가구 높이 기반)
              let actualSectionHeight: number;
              if (sectionIndex === 0) {
                // 하부 섹션 (서랍): 항상 고정 높이
                actualSectionHeight = mmToThreeUnits(section.height);
              } else {
                // 상부 섹션 (옷장): 전체 높이에서 하부 섹션 높이를 뺀 나머지
                const bottomSectionHeight = mmToThreeUnits(sections[0].height);
                actualSectionHeight = availableHeight - bottomSectionHeight;
              }

              // 4단 듀얼장: 하단은 서랍, 상단은 옷장
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
                // 마감 패널이 있는 경우 (하부섹션): 브라켓 윗면이 마감 패널 하단에서 27mm 아래
                const finishPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
              } else {
                // 안전선반/마감패널 없는 경우: 브라켓 윗면이 상부 섹션 상판 하단에 붙음
                const sectionTopPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2);
              }

              // 옷봉 Z 위치 계산 (섹션 깊이에 따라 조정)
              let rodZPosition = 0;
              if (sectionDepths && sectionDepths[sectionIndex]) {
                const sectionDepth = sectionDepths[sectionIndex];
                const depthDiff = depth - sectionDepth;
                const sectionDir = sectionIndex === 0 ? lowerSectionDepthDirection : upperSectionDepthDirection;
                rodZPosition = depthDiff === 0 ? 0 : sectionDir === 'back' ? depthDiff / 2 : -depthDiff / 2;
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

        {/* 조절발통 (네 모서리) - 띄움 배치 시에는 렌더링하지 않음 */}
        {!isFloating && (
          <AdjustableFootsRenderer
            width={width}
            depth={depth}
            yOffset={-height / 2}
            backZOffset={sectionDepths && sectionDepths[0] ? (lowerSectionDepthDirection === 'back' ? (depth - sectionDepths[0]) : 0) : 0}
            placedFurnitureId={placedFurnitureId}
            renderMode={renderMode}
            isHighlighted={false}
            isFloating={isFloating}
            baseHeight={spaceInfo?.baseConfig?.height || 65}
            baseDepth={spaceInfo?.baseConfig?.depth || 0}
            viewMode={viewMode}
            view2DDirection={view2DDirection}
          />
        )}
        </group>
      )}

      {/* 도어는 showFurniture와 관계없이 항상 렌더링 (도어 도면 출력용) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
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
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
        />
      )}
    </>
  );
};

export default DualType4; 
