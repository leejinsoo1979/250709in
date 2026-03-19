import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import ShelfRenderer from '../ShelfRenderer';
import DrawerRenderer from '../DrawerRenderer';
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { useUIStore } from '@/store/uiStore';
import { Text, Line } from '@react-three/drei';
import { useDimensionColor } from '../hooks/useDimensionColor';
import { ClothingRod } from '../components/ClothingRod';
import { VentilationCap } from '../components/VentilationCap';


/**
 * DualType5 컴포넌트 (듀얼 서랍+스타일러)
 * - 좌우 비대칭 구조: 좌측 서랍+옷장, 우측 스타일러장
 * - ID 패턴: dual-2drawer-styler-*
 * - 특징: 절대폭 지정, 좌측 섹션별 분할, 우측 전체높이 측면판
 */
const DualType5: React.FC<FurnitureTypeProps> = ({
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
  customSections, // 사용자 정의 섹션 설정 (자유배치 freeHeight 조정)
  showFurniture = true, // 가구 본체 표시 여부
  placedFurnitureId,
  visibleSectionIndex = null, // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
  textureUrl,
  panelGrainDirections,
  backPanelThickness: backPanelThicknessProp,
  lowerSectionTopOffset,
  zone, // 단내림 영역 정보
  hasBase,
  individualFloatHeight
}) => {
  // 공통 로직 사용 (좌측 깊이만 반영)
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 전달
    adjustedWidth, // adjustedWidth 전달
    customSections, // 사용자 정의 섹션 설정
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
    material,
    calculateSectionHeight,
    mmToThreeUnits,
    modelConfig
  } = baseFurniture;

  const { view2DDirection, showDimensions, showDimensionsText, highlightedSection } = useUIStore();
  const { renderMode, viewMode } = useSpace3DView();
  const { dimensionColor, baseFontSize } = useDimensionColor();

  // 띄워서 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === 'float';

  // 측면뷰에서 치수 X 위치 계산 함수 (섹션 너비 기준)
  const getDimensionXPosition = (sectionWidth: number, forText: boolean = false, sectionGroupOffset: number = 0) => {
    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      const textOffset = forText ? 0.3 : 0;
      const targetWorldX = view2DDirection === 'left'
        ? -innerWidth/2 - textOffset  // 좌측뷰: 가구 좌측 끝 밖으로
        : innerWidth/2 + textOffset;  // 우측뷰: 가구 우측 끝 밖으로
      const xPos = targetWorldX - sectionGroupOffset;

      console.log('📏 DualType5 getDimensionXPosition:',
        `viewMode=${viewMode}`,
        `view2DDirection=${view2DDirection}`,
        `sectionWidth=${sectionWidth}`,
        `forText=${forText}`,
        `textOffset=${textOffset}`,
        `sectionGroupOffset=${sectionGroupOffset}`,
        `targetWorldX=${targetWorldX}`,
        `xPos=${xPos}`,
        `moduleId=${moduleData.id}`,
        `visibleSectionIndex=${visibleSectionIndex}`
      );

      return xPos;
    }
    // 3D 또는 정면뷰: 기본 왼쪽 위치
    return forText ? -sectionWidth/2 * 0.3 - 0.8 : -sectionWidth/2 * 0.3;
  };

  // 측면뷰에서 치수 Z 위치 계산 함수 (통일된 Z 위치)
  const getDimensionZPosition = (sectionDepth: number, isBottomFrame: boolean = false) => {
    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      // 측면뷰: Z축 오른쪽으로 324mm (3.24) 이동
      const baseZ = sectionDepth/2 + 1.0 + 3.24;
      // 하부 프레임은 왼쪽으로 6mm (0.06) 추가 이동 (2mm + 4mm)
      return isBottomFrame ? baseZ - 0.06 : baseZ;
    }
    // 3D 모드: 우측 섹션(스타일러장)은 rightShelfZOffset + rightAdjustedDepthForShelves/2
    if (viewMode === '3D' && sectionDepth === rightDepth) {
      // 우측 섹션용 깊이 계산 (660mm 기준 절대 위치 고정)
      const adjustedDepth = mmToThreeUnits(660 - 18); // 660mm - 18mm (패널 두께)
      const shelfZOffset = mmToThreeUnits(18) / 2 + (leftDepth - rightDepth) / 2; // 전체 가구 깊이 변화 보정
      return shelfZOffset + adjustedDepth/2;
    }
    // 3D 또는 정면뷰: 표준 위치 (다른 모듈과 동일)
    return sectionDepth/2 + 0.1;
  };

  // 디버깅: visibleSectionIndex 값 확인
  React.useEffect(() => {
    console.log('🔍 DualType5 - moduleData.id:', moduleData.id, 'visibleSectionIndex:', visibleSectionIndex);
    console.log('🔍 DualType5 - 중앙 칸막이 렌더링:', visibleSectionIndex === null, 'moduleData.id:', moduleData.id);
  }, [visibleSectionIndex, moduleData.id]);

  // spaceInfo 가져오기 - 제거됨 (baseFurniture의 material 사용)
  // const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  // const materialConfig = storeSpaceInfo.materialConfig || { interiorColor: '#FFFFFF', doorColor: '#E0E0E0' };

  // 서랍용 재질은 baseFurniture의 material을 그대로 사용 (cabinet texture 1 포함)
  // 별도 생성 제거

  // 좌우 폭 분할 계산 (절대폭 지정)
  const rightAbsoluteWidth = modelConfig.rightAbsoluteWidth;
  let leftWidth, rightWidth, leftXOffset, rightXOffset;
  
  if (rightAbsoluteWidth) {
    // 절대값 모드: 우측 고정폭, 좌측 나머지 (중앙 칸막이 두께 제외)
    rightWidth = mmToThreeUnits(rightAbsoluteWidth);
    leftWidth = innerWidth - rightWidth - basicThickness; // 중앙 칸막이 두께 제외
    
    // X 오프셋 계산 (중앙 칸막이 고려)
    leftXOffset = -(rightWidth + basicThickness) / 2;
    rightXOffset = (leftWidth + basicThickness) / 2;
  } else {
    // 기본 균등 분할 모드
    leftWidth = innerWidth / 2;
    rightWidth = innerWidth / 2;
    leftXOffset = -innerWidth / 4;
    rightXOffset = innerWidth / 4;
  }

  // 좌우 깊이 분할 계산 (절대깊이 지정)
  const rightAbsoluteDepthConfig = modelConfig.rightAbsoluteDepth;
  let leftDepth, rightDepth, leftDepthMm, rightDepthMm;
  
  if (rightAbsoluteDepthConfig) {
    // 좌측: customDepth 또는 기본 깊이 (600mm)
    leftDepthMm = customDepth || 600;
    leftDepth = mmToThreeUnits(leftDepthMm);
    
    // 우측: 스타일러장 고정 깊이 (660mm)
    rightDepthMm = rightAbsoluteDepthConfig;
    rightDepth = mmToThreeUnits(rightDepthMm);
  } else {
    // 기본: 좌우 동일 깊이
    leftDepthMm = rightDepthMm = customDepth || 600;
    leftDepth = rightDepth = mmToThreeUnits(leftDepthMm);
  }

  // 우측 스타일러장은 항상 Z=0 중심 (660mm 깊이 기준)

  // 좌측 섹션 높이 계산 (좌측 측면판 분할용)
  const calculateLeftSectionHeights = () => {
    const leftSections = modelConfig.leftSections || [];
    if (leftSections.length === 0) return [height - basicThickness * 2];

    const availableHeight = height - basicThickness * 2;
    
    // 고정 높이 섹션들 분리
    const fixedSections = leftSections.filter(s => s.heightType === 'absolute');
    
    // 고정 섹션들의 총 높이 계산
    const totalFixedHeight = fixedSections.reduce((sum, section) => {
      return sum + calculateSectionHeight(section, availableHeight);
    }, 0);
    
    // 나머지 공간 계산
    const remainingHeight = availableHeight - totalFixedHeight;
    
    // 모든 섹션의 높이 계산
    return leftSections.map(section => {
      return (section.heightType === 'absolute') 
        ? calculateSectionHeight(section, availableHeight)
        : calculateSectionHeight(section, remainingHeight);
    });
  };

  // 좌우 섹션 렌더링
  const renderAsymmetricSections = () => {
    const leftSections = modelConfig.leftSections || [];
    const rightSections = modelConfig.rightSections || [];
    
    if (leftSections.length === 0 && rightSections.length === 0) {
      return null;
    }

    // 좌측 섹션용 깊이 계산 (백패널 안쪽면과 맞닿도록 뒤에서 8mm 축소)
    const leftAdjustedDepthForShelves = leftDepth - mmToThreeUnits(8);
    const leftShelfZOffset = mmToThreeUnits(4); // 중심을 앞으로 4mm 이동
    
    // 우측 섹션용 깊이 계산 (660mm 기준 절대 위치 고정)
    const rightAdjustedDepthForShelves = mmToThreeUnits(660 - 18); // 660mm - 18mm (패널 두께)  
    const rightShelfZOffset = mmToThreeUnits(18) / 2 + (leftDepth - rightDepth) / 2; // 전체 가구 깊이 변화 보정

    // 좌측 섹션 렌더링
    const renderLeftSections = () => {
      if (leftSections.length === 0) return null;

      const availableHeight = height - basicThickness * 2;
      
      // 고정 높이 섹션들 분리
      const fixedSections = leftSections.filter(s => s.heightType === 'absolute');
      
      // 고정 섹션들의 총 높이 계산
      const totalFixedHeight = fixedSections.reduce((sum, section) => {
        return sum + calculateSectionHeight(section, availableHeight);
      }, 0);
      
      // 나머지 공간 계산
      const remainingHeight = availableHeight - totalFixedHeight;
      
      // 모든 섹션의 높이 계산 (SectionsRenderer와 동일한 로직)
      const allSections = leftSections.map((section, index) => {
        let calcHeight: number;

        if (section.heightType === 'absolute') {
          if (index === 0) {
            // 첫 번째 섹션: 지정된 높이 사용
            calcHeight = calculateSectionHeight(section, availableHeight);
          } else {
            // 상부 섹션: 전체 높이에서 하부 섹션들을 뺀 나머지
            const lowerSectionsHeight = leftSections
              .slice(0, index)
              .reduce((sum, s) => sum + calculateSectionHeight(s, availableHeight), 0);
            calcHeight = availableHeight - lowerSectionsHeight;
          }
        } else {
          calcHeight = calculateSectionHeight(section, remainingHeight);
        }

        return {
          ...section,
          calculatedHeight: calcHeight
        };
      });

      // 렌더링 — 하판 위에서 시작
      let currentYPosition = -height/2 + basicThickness;

      return allSections.map((section, index) => {
        const sectionHeight = section.calculatedHeight;
        const sectionCenterY = currentYPosition + sectionHeight / 2;

        let sectionContent = null;

        switch (section.type) {
          case 'shelf':
            if (section.count && section.count > 0) {
              sectionContent = (
                <ShelfRenderer
                  shelfCount={section.count}
                  innerWidth={leftWidth}
                  innerHeight={sectionHeight}
                  depth={leftAdjustedDepthForShelves}
                  basicThickness={basicThickness}
                  material={material}
                  yOffset={sectionCenterY}
                  zOffset={leftShelfZOffset}
                  shelfPositions={section.shelfPositions}
                  isTopFinishPanel={section.isTopFinishPanel}
                  renderMode={renderMode}
                  furnitureId={moduleData.id}
                  allowSideViewDimensions={true}
                  sideViewTextX={getDimensionXPosition(leftWidth, true, leftXOffset)}
                  sideViewLineX={getDimensionXPosition(leftWidth, false, leftXOffset)}
                />
              );
            }
            break;

          case 'hanging':
            if (section.count && section.count > 0) {
              sectionContent = (
                <ShelfRenderer
                  shelfCount={section.count}
                  innerWidth={leftWidth}
                  innerHeight={sectionHeight}
                  depth={leftAdjustedDepthForShelves}
                  basicThickness={basicThickness}
                  material={material}
                  yOffset={sectionCenterY}
                  zOffset={leftShelfZOffset}
                  shelfPositions={section.shelfPositions}
                  isTopFinishPanel={section.isTopFinishPanel}
                  renderMode={renderMode}
                  furnitureId={moduleData.id}
                  allowSideViewDimensions={true}
                  sideViewTextX={getDimensionXPosition(leftWidth, true, leftXOffset)}
                  sideViewLineX={getDimensionXPosition(leftWidth, false, leftXOffset)}
                  sectionIndex={index}
                />
              );
            } else {
              // 옷걸이 구역 (선반 없음)
              sectionContent = null;
            }
            break;
            
          case 'drawer':
            if (section.count && section.count > 0) {
              // 서랍 섹션은 항상 하부장
              const sectionName = '(하)';
              // 서랍속장 프레임 높이 = 섹션 내경 (외경 - 상판 - 바닥판) — SectionsRenderer와 동일
              const drawerInnerHeight = sectionHeight - basicThickness * 2;
              // 2단 vs 4단 서랍장 구분 (섹션 높이 700mm 미만이면 2단)
              const is2TierDrawer = sectionHeight < mmToThreeUnits(700);
              // Y 위치: 2단은 바닥에 붙도록 18mm 아래로 — SectionsRenderer와 동일
              const drawerYOffset = is2TierDrawer
                ? sectionCenterY - basicThickness
                : sectionCenterY;
              sectionContent = (
                <DrawerRenderer
                  drawerCount={section.count}
                  innerWidth={leftWidth}
                  innerHeight={drawerInnerHeight}
                  depth={leftDepth}
                  basicThickness={basicThickness}
                  yOffset={drawerYOffset}
                  drawerHeights={section.drawerHeights}
                  gapHeight={section.gapHeight}
                  material={material}
                  renderMode={renderMode}
                  sectionName={sectionName}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={placedFurnitureId}
                />
              );
            }
            break;
        }
        
        // 개별 구분 패널 렌더링 (좌측 섹션 간, 마지막 섹션 제외)
        // visibleSectionIndex가 1(스타일러장 선택)일 때는 좌측 구분 패널도 흐리게 표시
        let separatorPanel = null;
        if (index < allSections.length - 1) {
          // 하부섹션 상판(drawer 섹션 위)은 앞에서 사용자 오프셋만큼 줄임 (앞에서 줄어듦) + 뒤에서 26mm 줄임
          const isDrawerTopPanel = section.type === 'drawer';
          const panelDepth = isDrawerTopPanel
            ? leftDepth - mmToThreeUnits(26) - mmToThreeUnits(lowerSectionTopOffset || 0)
            : leftDepth - mmToThreeUnits(26);
          const panelZPosition = isDrawerTopPanel
            ? mmToThreeUnits(13) - mmToThreeUnits((lowerSectionTopOffset || 0) / 2)
            : mmToThreeUnits(13);

          separatorPanel = (
            <BoxWithEdges
              args={[leftWidth, basicThickness, panelDepth]}
              position={[0, sectionCenterY + sectionHeight/2 - basicThickness * 1.5, panelZPosition]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
              edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
            />
          );
        }
        
        // 다음 섹션을 위해 Y 위치 이동
        currentYPosition += sectionHeight;
        
        return (
          <group key={`left-section-${index}`}>
            {sectionContent}
            {separatorPanel}
            
            {/* 좌측 섹션 치수 표시 - 3D 모드에서는 숨김 */}
            {showDimensions && showDimensionsText &&
             viewMode !== '3D' &&
             !(viewMode === '2D' && view2DDirection === 'top') &&
             !(viewMode === '2D' && view2DDirection === 'right') && (
              <>
                {/* 섹션 구분 패널 두께 표시 (마지막 섹션 제외, 측면뷰 제외) */}
                {index < allSections.length - 1 && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                  <group>
                    {/* 구분 패널 두께 텍스트 */}
                    
                    <Text
                      position={[
                        getDimensionXPosition(leftWidth, true, leftXOffset),
                        sectionCenterY + sectionHeight/2 - basicThickness/2,
                        getDimensionZPosition(leftDepth)
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(basicThickness * 100)}
                    </Text>

                    {/* 구분 패널 두께 수직선 */}
                    <Line
                      points={[
                        [getDimensionXPosition(leftWidth, false, leftXOffset), sectionCenterY + sectionHeight/2 - basicThickness, getDimensionZPosition(leftDepth)],
                        [getDimensionXPosition(leftWidth, false, leftXOffset), sectionCenterY + sectionHeight/2, getDimensionZPosition(leftDepth)]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2 - basicThickness, getDimensionZPosition(leftDepth)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2, getDimensionZPosition(leftDepth)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </group>
                )}
                
                {/* 상판 두께 표시 (마지막 섹션일 때만, 측면뷰 제외, 띄워서 배치가 아닐 때만) */}
                {showDimensions && showDimensionsText && index === allSections.length - 1 && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && !isFloating && (
                  <group>
                    {/* 상판 두께 텍스트 */}
                    
                    <Text
                      position={[
                        getDimensionXPosition(leftWidth, true, leftXOffset),
                        height/2 - basicThickness/2,
                        getDimensionZPosition(leftDepth)
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(basicThickness * 100)}
                    </Text>

                    {/* 상판 두께 수직선 */}
                    <Line
                      points={[
                        [getDimensionXPosition(leftWidth, false, leftXOffset), height/2 - basicThickness, getDimensionZPosition(leftDepth)],
                        [getDimensionXPosition(leftWidth, false, leftXOffset), height/2, getDimensionZPosition(leftDepth)]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[getDimensionXPosition(leftWidth, false, leftXOffset), height/2 - basicThickness, getDimensionZPosition(leftDepth)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[getDimensionXPosition(leftWidth, false, leftXOffset), height/2, getDimensionZPosition(leftDepth)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </group>
                )}
                
                {/* 세로 섹션 높이 표시 */}
                {(() => {
                  let lineBottomY: number;
                  let lineTopY: number;

                  console.log('DualType5 좌측 allSections.length:', allSections.length, 'index:', index, 'sectionHeight:', Math.round(sectionHeight * 100));

                  if (allSections.length === 2) {
                    if (index === 0) {
                      // 하부섹션 (drawer): 바닥판 상단 ~ 섹션 상단 (=구분판 시작점)
                      lineBottomY = -height/2 + basicThickness;
                      lineTopY = sectionCenterY + sectionHeight/2;
                    } else {
                      // 상부섹션 (hanging): 섹션 하단 ~ 상판 하단
                      lineBottomY = sectionCenterY - sectionHeight/2;
                      lineTopY = height/2 - basicThickness;
                    }
                    console.log('DualType5 조건 통과! lineBottomY:', lineBottomY, 'lineTopY:', lineTopY);
                  } else {
                    console.log('DualType5 조건 불통과 - return null');
                    return null;
                  }

                  let internalHeight = lineTopY - lineBottomY;
                  console.log('DualType5 internalHeight:', Math.round(internalHeight * 100));

                  // 띄워서 배치 시 치수 가이드에서 띄움 높이 제외
                  if (isFloating && section.type === 'drawer') {
                    const floatHeightMm = spaceInfo?.baseConfig?.floatHeight || 0;
                    const floatHeight = floatHeightMm * 0.01;
                    internalHeight = internalHeight - floatHeight;
                  }

                  const textCenterY = (lineBottomY + lineTopY) / 2;

                  return (
                    <group>
                      {/* 내경 높이 텍스트 */}
                      <Text
                        position={[
                          getDimensionXPosition(leftWidth, true, leftXOffset),
                          textCenterY,
                          getDimensionZPosition(leftDepth)
                        ]}
                        fontSize={viewMode === '3D' ? 0.45 : 0.32}
                        color={viewMode === '3D' ? '#000000' : dimensionColor}
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={999}
                      >
                        {Math.round(internalHeight * 100)}
                      </Text>

                      {/* 내경 높이 수직선 */}
                      <Line
                        points={[
                          [getDimensionXPosition(leftWidth, false, leftXOffset), lineBottomY, getDimensionZPosition(leftDepth)],
                          [getDimensionXPosition(leftWidth, false, leftXOffset), lineTopY, getDimensionZPosition(leftDepth)]
                        ]}
                        color={viewMode === '3D' ? '#000000' : dimensionColor}
                        lineWidth={1}
                      />

                      {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                      {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                        <>
                          <mesh position={[-leftWidth/2 * 0.3, lineBottomY, getDimensionZPosition(leftDepth)]}>
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                          </mesh>
                          <mesh position={[-leftWidth/2 * 0.3, lineTopY, getDimensionZPosition(leftDepth)]}>
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                          </mesh>
                        </>
                      )}
                    </group>
                  );
                })()}

                {/* 첫 번째 섹션(서랍)의 하부 프레임 두께 표시 (측면뷰 제외) */}
                {index === 0 && section.type === 'drawer' && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                  <group>
                    {/* 하부 프레임 두께 텍스트 */}
                    
                    <Text
                      position={[
                        getDimensionXPosition(leftWidth, true, leftXOffset),
                        -height/2 + basicThickness/2,
                        getDimensionZPosition(leftDepth, true)
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(basicThickness * 100)}
                    </Text>

                    {/* 하부 프레임 두께 수직선 - 측면뷰에서는 위아래로 18mm씩 연장 */}
                    <Line
                      points={[
                        [getDimensionXPosition(leftWidth, false, leftXOffset),
                         viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') ? -height/2 - 0.18 : -height/2,
                         getDimensionZPosition(leftDepth, true)],
                        [getDimensionXPosition(leftWidth, false, leftXOffset),
                         viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') ? -height/2 + basicThickness + 0.18 : -height/2 + basicThickness,
                         getDimensionZPosition(leftDepth, true)]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[getDimensionXPosition(leftWidth, false, leftXOffset), -height/2, getDimensionZPosition(leftDepth, true)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[getDimensionXPosition(leftWidth, false, leftXOffset), -height/2 + basicThickness, getDimensionZPosition(leftDepth, true)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </group>
                )}
              </>
            )}
          </group>
        );
      });
    };

    // 우측 섹션 렌더링 (스타일러장 - 단순 옷걸이 구역)
    const renderRightSections = () => {
      if (rightSections.length === 0) return null;

      const availableHeight = height - basicThickness * 2;
      
      // 고정 높이 섹션들 분리
      const fixedSections = rightSections.filter(s => s.heightType === 'absolute');
      
      // 고정 섹션들의 총 높이 계산
      const totalFixedHeight = fixedSections.reduce((sum, section) => {
        return sum + calculateSectionHeight(section, availableHeight);
      }, 0);
      
      // 나머지 공간 계산
      const remainingHeight = availableHeight - totalFixedHeight;
      
      // 모든 섹션의 높이 계산
      const allSections = rightSections.map(section => ({
        ...section,
        calculatedHeight: (section.heightType === 'absolute') 
          ? calculateSectionHeight(section, availableHeight)
          : calculateSectionHeight(section, remainingHeight)
      }));

      // 렌더링
      let currentYPosition = -height/2 + basicThickness;
      
      return allSections.map((section, index) => {
        const sectionHeight = section.calculatedHeight;
        const sectionCenterY = currentYPosition + sectionHeight / 2;
        
        let sectionContent = null;
        
        switch (section.type) {
          case 'hanging':
            // 스타일러장 - 안전선반이 있는 경우 렌더링
            if (section.count && section.count > 0) {
              // 우측 스타일러장의 경우 특별한 furnitureId 전달
              const rightFurnitureId = `${moduleData.id}-right-section`;
              sectionContent = (
                <ShelfRenderer
                  shelfCount={section.count}
                  innerWidth={rightWidth}
                  innerHeight={sectionHeight}
                  depth={rightDepth}
                  basicThickness={basicThickness}
                  material={material}
                  yOffset={sectionCenterY}
                  zOffset={rightShelfZOffset}
                  shelfPositions={section.shelfPositions}
                  isTopFinishPanel={section.isTopFinishPanel}
                  renderMode={renderMode}
                  furnitureId={rightFurnitureId}
                  allowSideViewDimensions={true}
                  sideViewTextX={getDimensionXPosition(rightWidth, true, rightXOffset)}
                  sideViewLineX={getDimensionXPosition(rightWidth, false, rightXOffset)}
                />
              );
            } else {
              // 완전 오픈 (선반 없음)
              sectionContent = null;
            }
            break;

          case 'shelf':
            if (section.count && section.count > 0) {
              sectionContent = (
                <ShelfRenderer
                  shelfCount={section.count}
                  innerWidth={rightWidth}
                  innerHeight={sectionHeight}
                  depth={rightAdjustedDepthForShelves}
                  basicThickness={basicThickness}
                  material={material}
                  yOffset={sectionCenterY}
                  zOffset={rightShelfZOffset}
                  shelfPositions={section.shelfPositions}
                  isTopFinishPanel={section.isTopFinishPanel}
                  renderMode={renderMode}
                  furnitureId={moduleData.id}
                  allowSideViewDimensions={true}
                  sideViewTextX={getDimensionXPosition(rightWidth, true, rightXOffset)}
                  sideViewLineX={getDimensionXPosition(rightWidth, false, rightXOffset)}
                />
              );
            }
            break;
        }
        
        // 다음 섹션을 위해 Y 위치 이동
        currentYPosition += sectionHeight;
        
        return (
          <group key={`right-section-${index}`}>
            {sectionContent}
            
            {/* 우측 섹션 치수 표시 - 3D 모드에서는 숨김 */}
            {showDimensions && showDimensionsText &&
             viewMode !== '3D' &&
             !(viewMode === '2D' && view2DDirection === 'top') &&
             !(viewMode === '2D' && view2DDirection === 'left') && (
              <group>
                {/* 첫 번째 섹션일 때만 하부 프레임 두께 표시 (측면뷰 제외) */}
                {index === 0 && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                  <>
                    {/* 하부 프레임 두께 텍스트 */}
                    
                    <Text
                      position={[
                        getDimensionXPosition(rightWidth, true, rightXOffset),
                        -height/2 + basicThickness/2,
                        getDimensionZPosition(rightDepth, true)
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(basicThickness * 100)}
                    </Text>

                    {/* 하부 프레임 두께 수직선 - 측면뷰에서는 위아래로 18mm씩 연장 */}
                    <Line
                      points={[
                        [getDimensionXPosition(rightWidth, false, rightXOffset),
                         viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') ? -height/2 - 0.18 : -height/2,
                         getDimensionZPosition(rightDepth, true)],
                        [getDimensionXPosition(rightWidth, false, rightXOffset),
                         viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') ? -height/2 + basicThickness + 0.18 : -height/2 + basicThickness,
                         getDimensionZPosition(rightDepth, true)]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-rightWidth/2 * 0.3, -height/2, getDimensionZPosition(rightDepth, true)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[-rightWidth/2 * 0.3, -height/2 + basicThickness, getDimensionZPosition(rightDepth, true)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </>
                )}
                
                {/* 마지막 섹션일 때 상판 두께 표시 (측면뷰 제외, 띄워서 배치가 아닐 때만) */}
                {showDimensions && showDimensionsText && index === allSections.length - 1 && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && !isFloating && (
                  <>
                    {/* 상판 두께 텍스트 */}
                    
                    <Text
                      position={[
                        getDimensionXPosition(rightWidth, true, rightXOffset), 
                        height/2 - basicThickness/2,
                        getDimensionZPosition(rightDepth)
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(basicThickness * 100)}
                    </Text>
                    
                    {/* 상판 두께 수직선 */}
                    <Line
                      points={[
                        [getDimensionXPosition(rightWidth, false, rightXOffset), height/2 - basicThickness, getDimensionZPosition(rightDepth)],
                        [getDimensionXPosition(rightWidth, false, rightXOffset), height/2, getDimensionZPosition(rightDepth)]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-rightWidth/2 * 0.3, height/2 - basicThickness, getDimensionZPosition(rightDepth)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[-rightWidth/2 * 0.3, height/2, getDimensionZPosition(rightDepth)]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </>
                )}
                
                {/* 세로 내경 높이 표시 */}
                {(() => {
                  // 내경 높이 계산: 섹션 높이 - 상하 기본두께
                  const lineBottomY = sectionCenterY - sectionHeight/2 + basicThickness;
                  const lineTopY = index === allSections.length - 1
                    ? sectionCenterY + sectionHeight/2 - basicThickness  // 마지막 섹션: 상판 두께 제외
                    : sectionCenterY + sectionHeight/2;  // 중간 섹션: 분리판까지
                  let internalHeight = lineTopY - lineBottomY;

                  // 띄워서 배치 시 치수 가이드에서 띄움 높이 제외
                  if (isFloating) {
                    const floatHeightMm = spaceInfo?.baseConfig?.floatHeight || 0;
                    const floatHeight = floatHeightMm * 0.01;
                    internalHeight = internalHeight - floatHeight;
                  }

                  const textCenterY = (lineBottomY + lineTopY) / 2;

                  return (
                    <group>
                      {/* 내경 높이 텍스트 */}
                      <Text
                        position={[
                          getDimensionXPosition(rightWidth, true, rightXOffset),
                          textCenterY,
                          getDimensionZPosition(rightDepth)
                        ]}
                        fontSize={viewMode === '3D' ? 0.45 : 0.32}
                        color={viewMode === '3D' ? '#000000' : dimensionColor}
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={999}
                      >
                        {Math.round(internalHeight * 100)}
                      </Text>

                      {/* 내경 높이 수직선 */}
                      <Line
                        points={[
                          [getDimensionXPosition(rightWidth, false, rightXOffset), lineBottomY, getDimensionZPosition(rightDepth)],
                          [getDimensionXPosition(rightWidth, false, rightXOffset), lineTopY, getDimensionZPosition(rightDepth)]
                        ]}
                        color={viewMode === '3D' ? '#000000' : dimensionColor}
                        lineWidth={1}
                      />

                      {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                      {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                        <>
                          <mesh position={[-rightWidth/2 * 0.3, lineBottomY, getDimensionZPosition(rightDepth)]}>
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                          </mesh>
                          <mesh position={[-rightWidth/2 * 0.3, lineTopY, getDimensionZPosition(rightDepth)]}>
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                          </mesh>
                        </>
                      )}
                    </group>
                  );
                })()}

                {/* 상단 가로 내경 치수 표시 (첫 번째 섹션일 때만) - 칸 내부에 표시 */}
                {index === 0 && (
                  <>
                    {/* 가로 내경 수평선 */}
                    <Line
                      points={[
                        [-rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightShelfZOffset + rightAdjustedDepthForShelves/2 : rightDepth/2 + 1.0],
                        [rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightShelfZOffset + rightAdjustedDepthForShelves/2 : rightDepth/2 + 1.0]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />

                    {/* 가로 내경 텍스트 - 가이드선 아래 */}
                    
                    <Text
                      position={[
                        0,
                        sectionCenterY + sectionHeight/2 - basicThickness - 1.2,
                        viewMode === '3D' ? rightShelfZOffset + rightAdjustedDepthForShelves/2 : rightDepth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="top"
                      renderOrder={999}
                    >
                      {Math.round(rightWidth * 100)}
                    </Text>

                    {/* 수평선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightShelfZOffset + rightAdjustedDepthForShelves/2 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightShelfZOffset + rightAdjustedDepthForShelves/2 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </>
                )}
              </group>
            )}
          </group>
        );
      });
    };

    return (
      <>
        {/* 좌측 섹션 그룹 - 3D 모드에서는 항상 표시, 측면뷰에서는 visibleSectionIndex에 따라 표시 */}
        {(viewMode === '3D' || visibleSectionIndex === null || visibleSectionIndex === 0) && (
          <group position={[leftXOffset, 0, 0]}>
            {renderLeftSections()}
          </group>
        )}

        {/* 우측 섹션 그룹 (660mm 깊이 기준 절대 고정) - 3D 모드에서는 항상 표시, 측면뷰에서는 visibleSectionIndex에 따라 표시 */}
        {(viewMode === '3D' || visibleSectionIndex === null || visibleSectionIndex === 1) && (
          <group position={[rightXOffset, 0, 0]}>
            {renderRightSections()}
          </group>
        )}

        {/* 옷걸이 봉 렌더링 - 좌측 옷장 섹션에만 (3D 모드에서는 항상 표시, 측면뷰에서는 visibleSectionIndex에 따라 표시) */}
        {(viewMode === '3D' || visibleSectionIndex === null || visibleSectionIndex === 0) && (
          <group position={[leftXOffset, 0, 0]}>
            {(() => {
            const leftSections = modelConfig.leftSections || [];
            const availableHeight = height - basicThickness * 2;

            // 측판용: modelConfig의 원본 섹션 높이 (항상 고정)
            let sideAccumulatedY = -height/2 + basicThickness;

            return leftSections.map((section: any, sectionIndex: number) => {
              // 옷봉 위치용: 실제 가구 높이 기반 계산 (동적)
              const sectionBottomY = sideAccumulatedY;

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
                const bottomSectionHeight = mmToThreeUnits(leftSections[0].height);
                actualSectionHeight = availableHeight - bottomSectionHeight;
              }

              // 스타일러장: 좌측 상부 섹션이 옷장 섹션
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
                const finishPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
              } else {
                // 안전선반도 마감 패널도 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
                const sectionTopPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
                rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);
              }

              // 좌측 깊이 사용
              const leftAdjustedDepthForShelves = leftDepth - backPanelThickness - basicThickness;

              return (
                <ClothingRod
                  key={`clothing-rod-left-${sectionIndex}`}
                  innerWidth={leftWidth}
                  yPosition={rodYPosition}
                  zPosition={0}
                  renderMode={renderMode}
                  isDragging={false}
                  isEditMode={isEditMode}
                  adjustedDepthForShelves={leftAdjustedDepthForShelves}
                  depth={leftDepth}
                />
              );
            });
            })()}
          </group>
        )}
        
        {/* 중앙 칸막이 (섹션별로 분할, 더 큰 깊이 사용, 바닥판 두께 고려) - 3D 모드에서는 항상 표시, 측면뷰에서는 전체 보기일 때만 */}
        {(viewMode === '3D' || visibleSectionIndex === null) && (() => {
          const leftSections = modelConfig.leftSections || [];

          // 하부 섹션(drawer) 개수 확인
          let drawerCount = 0;
          leftSections.forEach(section => {
            if (section.type === 'drawer') drawerCount++;
          });

          return calculateLeftSectionHeights().map((sectionHeight, index) => {
            console.log('🔍 중앙 칸막이 렌더링 중:', { index, visibleSectionIndex, moduleId: moduleData.id });

            let currentYPosition = -height/2 + basicThickness;

            // 현재 섹션까지의 Y 위치 계산
            for (let i = 0; i < index; i++) {
              currentYPosition += calculateLeftSectionHeights()[i];
            }

            // 하부/상부 섹션에 따른 높이 및 위치 조정
            const isLastLowerSection = index === drawerCount - 1;
            const isUpperSection = index >= drawerCount;

            let adjustedHeight = sectionHeight;
            let adjustedCenterY = currentYPosition + sectionHeight / 2 - basicThickness;

            if (drawerCount > 0 && leftSections.length > drawerCount) {
              // 하부와 상부가 모두 존재하는 경우
              // BaseFurnitureShell(2drawer-hanging)과 동일: 높이 = sectionHeight 그대로
              if (isLastLowerSection) {
                adjustedHeight = sectionHeight;
                adjustedCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
              } else if (isUpperSection) {
                adjustedHeight = sectionHeight;
                adjustedCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
              }
            }

            const middlePanelDepth = Math.max(leftDepth, rightDepth); // 더 큰 깊이 사용

            // 중앙 칸막이 Z 위치: 좌측 깊이가 우측보다 클 때는 좌측 기준, 아니면 우측 기준
            const middlePanelZOffset = leftDepth > rightDepth ? 0 : (leftDepth - rightDepth) / 2;

            return (
              <BoxWithEdges
                key={`middle-panel-${moduleData.id}-${index}`}
                args={[basicThickness, adjustedHeight, middlePanelDepth]}
                position={[(leftWidth - rightWidth) / 2, adjustedCenterY, middlePanelZOffset]}
                material={material}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                edgeOpacity={view2DDirection === 'left' ? 0.1 : undefined}
              />
            );
          });
        })()}
      </>
    );
  };

  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          {/* 좌측 측면 판재 - 섹션별로 분할 (바닥판 두께 고려) */}
          {(() => {
            const leftSections = modelConfig.leftSections || [];

            // 하부 섹션(drawer) 개수 확인
            let drawerCount = 0;
            leftSections.forEach(section => {
              if (section.type === 'drawer') drawerCount++;
            });

            return calculateLeftSectionHeights().map((sectionHeight, index) => {
              let currentYPosition = -height/2 + basicThickness;

              // 현재 섹션까지의 Y 위치 계산
              for (let i = 0; i < index; i++) {
                currentYPosition += calculateLeftSectionHeights()[i];
              }

              // 하부/상부 섹션에 따른 높이 및 위치 조정
              const isLowerSection = index < drawerCount;
              const isLastLowerSection = index === drawerCount - 1;
              const isUpperSection = index >= drawerCount;

              let adjustedHeight = sectionHeight;
              let adjustedCenterY = currentYPosition + sectionHeight / 2 - basicThickness;

              if (drawerCount > 0 && leftSections.length > drawerCount) {
                // 하부와 상부가 모두 존재하는 경우
                // BaseFurnitureShell(2drawer-hanging)과 동일: 측판 높이 = sectionHeight 그대로
                if (isLastLowerSection) {
                  // 하부 마지막 측판: sectionHeight 그대로 (2단서랍장과 동일)
                  adjustedHeight = sectionHeight;
                  adjustedCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
                } else if (isUpperSection) {
                  // 상부 모든 측판: sectionHeight 그대로
                  adjustedHeight = sectionHeight;
                  adjustedCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
                }
              }

              return (
                <BoxWithEdges
                  key={`left-side-panel-${index}`}
                  args={[basicThickness, adjustedHeight, leftDepth]}
                  position={[-width/2 + basicThickness/2, adjustedCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
                />
              );
            });
          })()}

      {/* 우측 측면 판재 - 전체 높이 (스타일러장은 분할 안됨) */}
      <BoxWithEdges
        args={[basicThickness, height, rightDepth]}
        position={[width/2 - basicThickness/2, 0, (leftDepth - rightDepth) / 2]}
        material={material}
        renderMode={useSpace3DView().renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        edgeOpacity={(view2DDirection === 'left' || visibleSectionIndex === 0) && visibleSectionIndex !== 1 ? 0.1 : undefined}
      />
      
      {/* 상단 판재 - 좌/우 분리, 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      <>
        {/* 좌측 상단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, leftDepth - mmToThreeUnits(26)]}
          position={[leftXOffset, height/2 - basicThickness/2, mmToThreeUnits(13)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
        />

        {/* 우측 상단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, rightDepth - mmToThreeUnits(26)]}
          position={[rightXOffset, height/2 - basicThickness/2, (leftDepth - rightDepth) / 2 + mmToThreeUnits(13)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={(view2DDirection === 'left' || visibleSectionIndex === 0) && visibleSectionIndex !== 1 ? 0.1 : undefined}
        />
      </>
      
      {/* 하단 판재 - 좌/우 분리, 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      <>
        {/* 좌측 하단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, leftDepth - mmToThreeUnits(26)]}
          position={[leftXOffset, -height/2 + basicThickness/2, mmToThreeUnits(13)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
        />

        {/* 우측 하단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, rightDepth - mmToThreeUnits(26)]}
          position={[rightXOffset, -height/2 + basicThickness/2, (leftDepth - rightDepth) / 2 + mmToThreeUnits(13)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={(view2DDirection === 'left' || visibleSectionIndex === 0) && visibleSectionIndex !== 1 ? 0.1 : undefined}
        />
      </>
      
      {/* 뒷면 판재 - 좌/우 분리 (9mm 얇은 백패널, 각각 상하좌우 5mm 확장) */}
      <>
        {/* 좌측 백패널 - 하부/상부 분할 (visibleSectionIndex가 1이 아닐 때만) */}
        {visibleSectionIndex !== 1 && (() => {
          const leftSections = modelConfig.leftSections || [];

          // 하부 섹션(drawer)와 상부 섹션(hanging/shelf) 구분
          let lowerHeight = 0;
          let upperHeight = 0;
          let lowerSectionCount = 0;

          const availableHeight = height - basicThickness * 2;
          const fixedSections = leftSections.filter(s => s.heightType === 'absolute');
          const totalFixedHeight = fixedSections.reduce((sum, section) => {
            return sum + calculateSectionHeight(section, availableHeight);
          }, 0);
          const remainingHeight = availableHeight - totalFixedHeight;

          leftSections.forEach((section) => {
            const sectionHeight = (section.heightType === 'absolute')
              ? calculateSectionHeight(section, availableHeight)
              : calculateSectionHeight(section, remainingHeight);

            if (section.type === 'drawer') {
              lowerHeight += sectionHeight;
              lowerSectionCount++;
            } else {
              upperHeight += sectionHeight;
            }
          });

          // 하부와 상부가 모두 있는 경우에만 분할
          const shouldSplit = lowerHeight > 0 && upperHeight > 0;

          if (!shouldSplit) {
            // 분할하지 않고 전체 백패널 렌더링
            const fullBackPanelHeight = innerHeight + mmToThreeUnits(36);
            const fullBackPanelZ = -leftDepth/2 + backPanelThickness/2 + mmToThreeUnits(17);
            const reinforcementHeight = mmToThreeUnits(60);
            const reinforcementDepth = mmToThreeUnits(15);
            const reinforcementZ = fullBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;

            return (
              <>
                <BoxWithEdges
                  key="left-backpanel-full"
                  args={[leftWidth + mmToThreeUnits(10), fullBackPanelHeight, backPanelThickness]}
                  position={[leftXOffset, 0, fullBackPanelZ]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  hideEdges={false}
                  isBackPanel={true}
                />
                {/* 보강대 (좌측 전체 백패널 상/하단)
                    2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임)
                    상부/측면 뷰에서만 표시됨 */}
                {!(viewMode === '2D' && view2DDirection === 'front') && (
                  <>
                    <BoxWithEdges
                      key="left-reinforcement-bottom"
                      args={[leftWidth, reinforcementHeight, reinforcementDepth]}
                      position={[leftXOffset, -fullBackPanelHeight/2 + reinforcementHeight/2, reinforcementZ]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      panelName="(좌)하단보강대"
                    />
                    <BoxWithEdges
                      key="left-reinforcement-top"
                      args={[leftWidth, reinforcementHeight, reinforcementDepth]}
                      position={[leftXOffset, fullBackPanelHeight/2 - reinforcementHeight/2, reinforcementZ]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      panelName="(좌)상단보강대"
                    />
                  </>
                )}
              </>
            );
          }

          // 하부 백패널: 측판과 동일 높이 (하판 위 ~ 구분판 아래)
          const lowerBackPanelHeight = lowerHeight;
          const lowerBackPanelY = -height/2 + lowerHeight / 2; // 측판과 동일 기준
          const lowerBackPanelZ = -leftDepth/2 + backPanelThickness/2 + mmToThreeUnits(17);

          // 상부 백패널: 측판과 동일 높이 (구분판 위 ~ 상판 아래)
          const upperBackPanelHeight = upperHeight;
          const upperBackPanelY = -height/2 + lowerHeight + upperHeight / 2; // 측판과 동일 기준
          const upperBackPanelZ = -leftDepth/2 + backPanelThickness/2 + mmToThreeUnits(17);

          // 상부 섹션 바닥판 위치 (하부 마지막 측판 조정과 동일하게 +9mm)
          const floorPanelY = -height/2 + lowerHeight + basicThickness/2;

          // 보강대 치수
          const reinforcementHeight = mmToThreeUnits(60);
          const reinforcementDepth = mmToThreeUnits(15);
          const lowerReinforcementZ = lowerBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;
          const upperReinforcementZ = upperBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;

          return (
            <>
              {/* 하부 백패널 */}
              <BoxWithEdges
                key="left-backpanel-lower"
                args={[leftWidth + mmToThreeUnits(10), lowerBackPanelHeight, backPanelThickness]}
                position={[leftXOffset, lowerBackPanelY, lowerBackPanelZ]}
                material={material}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                hideEdges={false}
                isBackPanel={true}
              />

              {/* 하부 백패널 보강대 (상/하단)
                  2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임)
                  상부/측면 뷰에서만 표시됨 */}
              {!(viewMode === '2D' && view2DDirection === 'front') && (
                <>
                  <BoxWithEdges
                    key="left-lower-reinforcement-bottom"
                    args={[leftWidth, reinforcementHeight, reinforcementDepth]}
                    position={[leftXOffset, lowerBackPanelY - lowerBackPanelHeight/2 + reinforcementHeight/2, lowerReinforcementZ]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                    panelName="(좌하)하단보강대"
                  />
                  <BoxWithEdges
                    key="left-lower-reinforcement-top"
                    args={[leftWidth, reinforcementHeight, reinforcementDepth]}
                    position={[leftXOffset, lowerBackPanelY + lowerBackPanelHeight/2 - reinforcementHeight/2, lowerReinforcementZ]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                    panelName="(좌하)상단보강대"
                  />
                </>
              )}

              {/* 상부 백패널 */}
              <BoxWithEdges
                key="left-backpanel-upper"
                args={[leftWidth + mmToThreeUnits(10), upperBackPanelHeight, backPanelThickness]}
                position={[leftXOffset, upperBackPanelY, upperBackPanelZ]}
                material={material}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                hideEdges={false}
                isBackPanel={true}
              />

              {/* 상부 백패널 보강대 (상/하단)
                  2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임)
                  상부/측면 뷰에서만 표시됨 */}
              {!(viewMode === '2D' && view2DDirection === 'front') && (
                <>
                  <BoxWithEdges
                    key="left-upper-reinforcement-bottom"
                    args={[leftWidth, reinforcementHeight, reinforcementDepth]}
                    position={[leftXOffset, upperBackPanelY - upperBackPanelHeight/2 + reinforcementHeight/2, upperReinforcementZ]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                    panelName="(좌상)하단보강대"
                  />
                  <BoxWithEdges
                    key="left-upper-reinforcement-top"
                    args={[leftWidth, reinforcementHeight, reinforcementDepth]}
                    position={[leftXOffset, upperBackPanelY + upperBackPanelHeight/2 - reinforcementHeight/2, upperReinforcementZ]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                    panelName="(좌상)상단보강대"
                  />
                </>
              )}

              {/* 상부 섹션 바닥판 (하부와 상부 사이) - 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
              <BoxWithEdges
                key="left-floor-panel"
                args={[leftWidth, basicThickness, leftDepth - mmToThreeUnits(26)]}
                position={[leftXOffset, floorPanelY, mmToThreeUnits(13)]}
                material={material}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
              />
            </>
          );
        })()}

        {/* 우측 백패널 (고정 깊이 660mm 기준) - 3D 모드에서는 항상 표시 */}
        {(viewMode === '3D' || visibleSectionIndex !== 0) && (() => {
          const rightBackPanelHeight = innerHeight + mmToThreeUnits(36);
          const rightBackPanelZ = -rightDepth/2 + backPanelThickness/2 + mmToThreeUnits(17) + (leftDepth - rightDepth) / 2;
          const reinforcementHeight = mmToThreeUnits(60);
          const reinforcementDepth = mmToThreeUnits(15);
          const rightReinforcementZ = rightBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;

          return (
            <>
              <BoxWithEdges
                args={[rightWidth + mmToThreeUnits(10), rightBackPanelHeight, backPanelThickness]}
                position={[rightXOffset, 0, rightBackPanelZ]}
                material={material}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                hideEdges={false} // 엣지는 표시하되
                isBackPanel={true} // 백패널임을 표시
                edgeOpacity={view2DDirection === 'left' && visibleSectionIndex !== 1 ? 0.1 : undefined}
              />
              {/* 우측 백패널 보강대 (상/하단)
                  2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임)
                  상부/측면 뷰에서만 표시됨 */}
              {!(viewMode === '2D' && view2DDirection === 'front') && (
                <>
                  <BoxWithEdges
                    key="right-reinforcement-bottom"
                    args={[rightWidth, reinforcementHeight, reinforcementDepth]}
                    position={[rightXOffset, -rightBackPanelHeight/2 + reinforcementHeight/2, rightReinforcementZ]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    panelName="(우)하단보강대"
                    edgeOpacity={view2DDirection === 'left' && visibleSectionIndex !== 1 ? 0.1 : undefined}
                  />
                  <BoxWithEdges
                    key="right-reinforcement-top"
                    args={[rightWidth, reinforcementHeight, reinforcementDepth]}
                    position={[rightXOffset, rightBackPanelHeight/2 - reinforcementHeight/2, rightReinforcementZ]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    panelName="(우)상단보강대"
                    edgeOpacity={view2DDirection === 'left' && visibleSectionIndex !== 1 ? 0.1 : undefined}
                  />
                </>
              )}
            </>
          );
        })()}
      </>

      {/* 환기캡 렌더링 */}
      {!isDragging && (
        <>
          {/* 좌측 백패널 환기캡 (visibleSectionIndex가 null 또는 0일 때만) */}
          {(visibleSectionIndex === null || visibleSectionIndex === 0) && (
            <VentilationCap
              position={[
                leftXOffset + leftWidth/2 - mmToThreeUnits(132),  // 좌측 백패널 우측 끝에서 안쪽으로 132mm
                height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
                -leftDepth/2 + backPanelThickness + mmToThreeUnits(17) + 0.01  // 좌측 백패널 앞쪽에 살짝 앞으로
              ]}
              diameter={98}
              renderMode={renderMode}
            />
          )}

          {/* 우측 백패널 환기캡 (visibleSectionIndex가 null 또는 1일 때만) */}
          {(visibleSectionIndex === null || visibleSectionIndex === 1) && (
            <VentilationCap
              position={[
                rightXOffset + rightWidth/2 - mmToThreeUnits(132),  // 우측 백패널 우측 끝에서 안쪽으로 132mm
                height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
                -rightDepth/2 + backPanelThickness + mmToThreeUnits(17) + (leftDepth - rightDepth) / 2 + 0.01  // 우측 백패널 앞쪽 (깊이 차이 보정)
              ]}
              diameter={98}
              renderMode={renderMode}
            />
          )}
        </>
      )}

          {/* 드래그 중이 아닐 때만 비대칭 섹션 렌더링 */}
          {!isDragging && renderAsymmetricSections()}

          {/* 조절발통 (네 모서리) - 띄움 배치 시에는 렌더링하지 않음 */}
          {!isFloating && !(viewMode === '2D' && view2DDirection === 'top') && (
            <AdjustableFootsRenderer
              width={width}
              depth={depth}
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
          )}
        </>
      )}

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width} // 커버도어용 너비 우선 사용
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX} // FurnitureItem에서 전달받은 보정값 사용
          slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
          isDragging={isDragging}
          isEditMode={isEditMode}
          slotIndex={slotIndex}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
          zone={zone}
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
        />
      )}
    </>
  );
};

export default DualType5; 
