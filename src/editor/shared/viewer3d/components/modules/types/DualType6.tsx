import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DrawerRenderer from '../DrawerRenderer';
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { useUIStore } from '@/store/uiStore';
import { Text, Line } from '@react-three/drei';
import { useDimensionColor } from '../hooks/useDimensionColor';
import { ClothingRod } from '../components/ClothingRod';
import { VentilationCap } from '../components/VentilationCap';


/**
 * DualType6 컴포넌트 (듀얼 서랍+바지걸이)
 * - 좌우 비대칭 구조: 좌측 4단서랍+옷장, 우측 바지걸이+옷장
 * - ID 패턴: dual-4drawer-pantshanger-*
 * - 특징: 통합 중단선반, 통합 안전선반, 절대폭 지정
 */
const DualType6: React.FC<FurnitureTypeProps> = ({
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
  showFurniture = true, // 가구 본체 표시 여부
  visibleSectionIndex = null,
  textureUrl,
  panelGrainDirections, // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
  placedFurnitureId, // 배치된 가구 ID
  // 추가: 섹션별 깊이 및 도어 분할 관련
  lowerSectionDepth,
  upperSectionDepth,
  doorSplit,
  upperDoorTopGap,
  upperDoorBottomGap,
  lowerDoorTopGap,
  lowerDoorBottomGap,
  lowerSectionTopOffset,
  zone // 단내림 영역 정보
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 전달
    adjustedWidth // adjustedWidth 전달
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
    calculateSectionHeight,
    mmToThreeUnits,
    modelConfig
  } = baseFurniture;

  // 띄움 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === 'float';

  // Three.js 단위를 mm로 변환하는 함수
  const threeUnitsToMm = (units: number) => units * 100;

  const { view2DDirection, showDimensions, showDimensionsText } = useUIStore();
  const { dimensionColor, baseFontSize, viewMode } = useDimensionColor();
  const { renderMode } = useSpace3DView();

  // 측면뷰에서 치수 X 위치 계산 함수 (가구 측면에 맞춤)
  const getDimensionXPosition = (sectionWidth: number, forText: boolean = false) => {
    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      const textOffset = forText ? 0.3 : 0;
      const targetWorldX = view2DDirection === 'left'
        ? -innerWidth/2 - textOffset  // 좌측뷰: 가구 좌측 끝 밖으로
        : innerWidth/2 + textOffset;  // 우측뷰: 가구 우측 끝 밖으로
      return targetWorldX;
    }
    // 3D 또는 정면뷰: 기본 왼쪽 위치
    return forText ? -sectionWidth/2 * 0.3 - 0.5 : -sectionWidth/2 * 0.3;
  };

  // 측면뷰에서 치수 Z 위치 계산 함수 (프레임과 정렬)
  const getDimensionZPosition = () => {
    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      // 측면뷰: Z축 오른쪽으로 이동 (프레임과 정렬)
      return depth/2 + 1.0 + 3.24;
    }
    // 3D 또는 정면뷰: 표준 위치
    return viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0;
  };

  // 좌우 폭 분할 계산 - 실제 렌더링되는 가구의 innerWidth 기반
  let leftWidth, rightWidth, leftXOffset, rightXOffset;
  
  // modelConfig에 rightAbsoluteWidth가 있으면 그 비율대로 분할
  if (modelConfig.rightAbsoluteWidth) {
    // 원래 모듈의 전체 너비 대비 우측 절대폭의 비율 계산
    const originalTotalWidth = moduleData.dimensions.width;
    const rightRatio = modelConfig.rightAbsoluteWidth / (originalTotalWidth - 36); // 36 = 양쪽 측판 두께
    
    // 현재 innerWidth에서 같은 비율로 분할
    rightWidth = innerWidth * rightRatio;
    leftWidth = innerWidth - rightWidth - basicThickness; // 중앙 칸막이 두께 제외
    
    leftXOffset = -(rightWidth + basicThickness) / 2;
    rightXOffset = (leftWidth + basicThickness) / 2;
  } else {
    // 기본 균등 분할 모드
    leftWidth = innerWidth / 2;
    rightWidth = innerWidth / 2;
    leftXOffset = -innerWidth / 4;
    rightXOffset = innerWidth / 4;
  }

  // 통합 중단선반 및 안전선반 관련 계산
  const hasSharedMiddlePanel = modelConfig.hasSharedMiddlePanel || false;
  const middlePanelHeight = modelConfig.middlePanelHeight || 0;
  const hasSharedSafetyShelf = modelConfig.hasSharedSafetyShelf || false;
  const safetyShelfHeight = modelConfig.safetyShelfHeight || 0;

  // 좌우 섹션 렌더링
  const renderAsymmetricSections = () => {
    const leftSections = modelConfig.leftSections || [];
    const rightSections = modelConfig.rightSections || [];
    
    if (leftSections.length === 0 && rightSections.length === 0) {
      return null;
    }

    // 좌측 섹션 렌더링 (4단서랍 + 옷장)
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
      
      // 모든 섹션의 높이 계산
      const allSections = leftSections.map(section => ({
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
          case 'drawer':
            if (section.count && section.count > 0) {
              // 서랍 섹션은 항상 하부장
              const sectionName = '(하)';
              // 서랍속장 프레임 높이 = 섹션 내경 (외경 - 상판 - 바닥판)
              const drawerFrameHeight = sectionHeight - basicThickness * 2;
              // Y 위치: 바닥에 붙도록 18mm 아래로
              const drawerYOffset = sectionCenterY - basicThickness;
              sectionContent = (
                <DrawerRenderer
                  drawerCount={section.count}
                  innerWidth={leftWidth}
                  innerHeight={drawerFrameHeight}
                  depth={depth}
                  basicThickness={basicThickness}
                  yOffset={drawerYOffset}
                  drawerHeights={section.drawerHeights}
                  gapHeight={section.gapHeight}
                  material={material}
                  renderMode={useSpace3DView().renderMode}
                  sectionName={sectionName}
                  textureUrl={spaceInfo.materialConfig?.doorTexture}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={placedFurnitureId}
                />
              );
            }
            break;
            
          case 'hanging':
            // 옷걸이 구역 - 안전선반은 통합으로 처리되므로 여기서는 렌더링하지 않음
            sectionContent = null;
            break;
        }
        
        // 다음 섹션을 위해 Y 위치 이동
        currentYPosition += sectionHeight;
        
        return (
          <group key={`left-section-${index}`}>
            {sectionContent}
            
            {/* 좌측 섹션 치수 표시 - 탑뷰에서는 숨김 */}
            {showDimensions && showDimensionsText &&
             !(viewMode === '2D' && view2DDirection === 'top') &&
             (section.type === 'drawer' || section.type === 'hanging') && (
              <group>
                {section.type === 'drawer' ? (
                  <>
                    {/* 서랍 섹션 전체 높이 텍스트 - 바닥판 윗면부터 중간 가로선반 하단까지 */}
                    {(() => {
                      // 치수선 하단: 바닥판 윗면
                      const lineBottomY = sectionCenterY - sectionHeight/2 + basicThickness;
                      // 치수선 상단: 중간 가로선반 하단
                      const lineTopY = -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2;
                      // 텍스트 중심 위치
                      const textCenterY = (lineBottomY + lineTopY) / 2;
                      // 내경 높이
                      const internalHeightMm = threeUnitsToMm(lineTopY - lineBottomY);

                      return (
                        <>
                          <Text
                            position={[
                              getDimensionXPosition(leftWidth, true),
                              textCenterY,
                              getDimensionZPosition()
                            ]}
                            fontSize={baseFontSize}
                            color={viewMode === '3D' ? '#000000' : dimensionColor}
                            anchorX="center"
                            anchorY="middle"
                            rotation={[0, 0, Math.PI / 2]}
                            renderOrder={999}
                            depthTest={false}
                          >
                            {Math.round(internalHeightMm)}
                          </Text>

                          {/* 서랍 섹션 높이 수직선 - 바닥판 윗면부터 중간 가로선반 하단까지 */}
                          <Line
                            points={[
                              [getDimensionXPosition(leftWidth, false), lineBottomY, getDimensionZPosition()],
                              [getDimensionXPosition(leftWidth, false), lineTopY, getDimensionZPosition()]
                            ]}
                            color={viewMode === '3D' ? '#000000' : dimensionColor}
                            lineWidth={1}
                          />
                          {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                            <>
                              <mesh position={[-leftWidth/2 * 0.3, lineBottomY, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                                <sphereGeometry args={[0.05, 8, 8]} />
                                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                              </mesh>
                              <mesh position={[-leftWidth/2 * 0.3, lineTopY, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                                <sphereGeometry args={[0.05, 8, 8]} />
                                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                              </mesh>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : null}
                
                {/* 첫 번째 섹션(서랍)의 하부 프레임 두께 표시 */}
                {index === 0 && (
                  <group>
                    {/* 하부 프레임 두께 텍스트 */}
                    <Text
                      position={[
                        getDimensionXPosition(leftWidth, true),
                        -height/2 + basicThickness/2,
                        getDimensionZPosition()
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                      depthTest={false}
                    >
                      {Math.round(threeUnitsToMm(basicThickness))}
                    </Text>

                    {/* 하부 프레임 두께 수직선 */}
                    <Line
                      points={[
                        [getDimensionXPosition(leftWidth, false), -height/2, getDimensionZPosition()],
                        [getDimensionXPosition(leftWidth, false), -height/2 + basicThickness, getDimensionZPosition()]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-leftWidth/2 * 0.3, -height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </group>
                )}
              </group>
            )}
          </group>
        );
      });
    };

    // 우측 섹션 렌더링 (바지걸이 + 옷장)
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

      // 렌더링 (우측은 바지걸이장으로 완전 오픈)
      let currentYPosition = -height/2 + basicThickness;
      
      return allSections.map((section, index) => {
        const sectionHeight = section.calculatedHeight;
        const sectionCenterY = currentYPosition + sectionHeight / 2;
        
        let sectionContent = null;
        
        switch (section.type) {
          case 'hanging':
            // 바지걸이 또는 옷걸이 구역 - 안전선반은 통합으로 처리
            sectionContent = null;
            break;
        }
        
        const dimensionGroup = (
          <group key={`right-section-${index}`}>
            {sectionContent}
            
            {/* 우측 섹션 치수 표시 - 탑뷰에서는 숨김 */}
            {showDimensions && showDimensionsText &&
             !(viewMode === '2D' && view2DDirection === 'top') &&
             section.type === 'hanging' && (
              <group>
                {index === 0 && (
                  <>
                    {/* 하단 바지걸이 구역 - 하부 프레임부터 중단선반까지 */}
                    <Text
                      position={[
                        getDimensionXPosition(rightWidth, true),
                        (sectionCenterY - sectionHeight/2 + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2)) / 2,
                        getDimensionZPosition()
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                      depthTest={false}
                    >
                      {Math.round(threeUnitsToMm(((-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2) - (sectionCenterY - sectionHeight/2))))}
                    </Text>

                    <Line
                      points={[
                        [getDimensionXPosition(rightWidth, false), sectionCenterY - sectionHeight/2, getDimensionZPosition()],
                        [getDimensionXPosition(rightWidth, false), -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, getDimensionZPosition()]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                    />
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-rightWidth/2 * 0.3, sectionCenterY - sectionHeight/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                        </mesh>
                        <mesh position={[-rightWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
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
        
        currentYPosition += sectionHeight;
        return dimensionGroup;
      });
    };

    return (
      <>
        {/* 좌측 섹션 그룹 */}
        <group position={[leftXOffset, 0, 0]}>
          {renderLeftSections()}
        </group>

        {/* 우측 섹션 그룹 */}
        <group position={[rightXOffset, 0, 0]}>
          {renderRightSections()}
        </group>

        {/* 옷걸이 봉 렌더링 - 상부 옷장 섹션 (전체 너비) */}
        {(() => {
          const rightSections = modelConfig.rightSections || [];
          const availableHeight = height - basicThickness * 2;

          // 측판용: modelConfig의 원본 섹션 높이 (항상 고정)
          let sideAccumulatedY = -height/2 + basicThickness;

          return rightSections.map((section: any, sectionIndex: number) => {
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
              const bottomSectionHeight = mmToThreeUnits(rightSections[0].height);
              actualSectionHeight = availableHeight - bottomSectionHeight;
            }

            // 바지걸이장: 우측 상부 섹션(index 1)이 옷장 섹션 - 전체 너비 사용
            const isUpperHangingSection = section.type === 'hanging' && sectionIndex === 1;

            if (!isUpperHangingSection) {
              return null;
            }

            // 안전선반 위치 계산
            let rodYPosition: number;
            if (hasSharedSafetyShelf && safetyShelfHeight > 0) {
              // 안전선반이 있는 경우: 브라켓 윗면이 안전선반 하단에 붙음
              const safetyShelfY = -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight);
              rodYPosition = safetyShelfY - basicThickness / 2 - mmToThreeUnits(75 / 2);
            } else {
              // 안전선반이 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
              const sectionTopPanelBottom = sectionBottomY + actualSectionHeight - basicThickness / 2;
              rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2) + mmToThreeUnits(9);
            }

            return (
              <ClothingRod
                key={`clothing-rod-upper-${sectionIndex}`}
                innerWidth={innerWidth}  // 상부 옷장은 전체 너비 사용 (중앙 칸막이가 없음)
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
        
        {/* 중간 세로 칸막이 (바닥부터 중단선반까지만) */}
        {hasSharedMiddlePanel && middlePanelHeight > 0 && (
          <BoxWithEdges
            args={[basicThickness, mmToThreeUnits(middlePanelHeight), adjustedDepthForShelves - basicThickness]}
            position={[(leftWidth - rightWidth) / 2, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight)/2 - mmToThreeUnits(18), basicThickness/2 + shelfZOffset]}
            material={material}
            renderMode={useSpace3DView().renderMode}
            isDragging={isDragging}
            isEditMode={isEditMode}
          />
        )}
        
        {/* 통합 중단선반 (전체 폭) */}
        {hasSharedMiddlePanel && middlePanelHeight > 0 && (
          <>
            <BoxWithEdges
              args={[innerWidth - mmToThreeUnits(1), basicThickness, adjustedDepthForShelves - basicThickness]}
              position={[0, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9), basicThickness/2 + shelfZOffset]}
              material={material}
              renderMode={useSpace3DView().renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
            />
            
            {/* 중단선반 두께 치수 표시 - 탑뷰에서는 숨김 */}
            {showDimensions && showDimensionsText &&
             !(viewMode === '2D' && view2DDirection === 'top') && (
              <group>
                {/* 중단선반 두께 텍스트 */}
                <Text
                  position={[
                    getDimensionXPosition(rightWidth, true),
                    -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9),
                    getDimensionZPosition()
                  ]}
                  fontSize={baseFontSize}
                  color={viewMode === '3D' ? '#000000' : dimensionColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, Math.PI / 2]}
                  renderOrder={999}
                  depthTest={false}
                >
                  {Math.round(basicThickness / 0.01)}
                </Text>

                {/* 중단선반 두께 수직선 */}
                <Line
                  points={[
                    [getDimensionXPosition(rightWidth, false), -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, getDimensionZPosition()],
                    [getDimensionXPosition(rightWidth, false), -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, getDimensionZPosition()]
                  ]}
                  color={viewMode === '3D' ? '#000000' : dimensionColor}
                  lineWidth={1}
                />
                {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                  <>
                    <mesh position={[-rightWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                    </mesh>
                    <mesh position={[-rightWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                    </mesh>
                  </>
                )}
              </group>
            )}
          </>
        )}
        
        {/* 통합 안전선반 (전체 폭) */}
        {hasSharedSafetyShelf && safetyShelfHeight > 0 && (
          <>
            <BoxWithEdges
              args={[innerWidth - mmToThreeUnits(1), basicThickness, adjustedDepthForShelves - basicThickness]}
              position={[0, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight), basicThickness/2 + shelfZOffset]}
              material={material}
              renderMode={useSpace3DView().renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
            />
            
            {/* 안전선반 두께 치수 표시 - 탑뷰에서는 숨김 */}
            {showDimensions && showDimensionsText &&
             !(viewMode === '2D' && view2DDirection === 'top') && (
              <group>
                {/* 안전선반 두께 텍스트 */}
                <Text
                  position={[
                    getDimensionXPosition(rightWidth, true),
                    -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight),
                    getDimensionZPosition()
                  ]}
                  fontSize={baseFontSize}
                  color={viewMode === '3D' ? '#000000' : dimensionColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, Math.PI / 2]}
                  renderOrder={999}
                  depthTest={false}
                >
                  {Math.round(basicThickness / 0.01)}
                </Text>

                {/* 안전선반 두께 수직선 */}
                <Line
                  points={[
                    [getDimensionXPosition(rightWidth, false), -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, getDimensionZPosition()],
                    [getDimensionXPosition(rightWidth, false), -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, getDimensionZPosition()]
                  ]}
                  color={viewMode === '3D' ? '#000000' : dimensionColor}
                  lineWidth={1}
                />
                {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                  <>
                    <mesh position={[-rightWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                    </mesh>
                    <mesh position={[-rightWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                    </mesh>
                  </>
                )}
              </group>
            )}
          </>
        )}
        
        {/* 상단 프레임 두께 치수 표시 - 탑뷰에서는 숨김 */}
        {showDimensions && showDimensionsText &&
         !(viewMode === '2D' && view2DDirection === 'top') && (
          <group>
            {/* 상단 프레임 두께 텍스트 */}
            <Text
              position={[
                getDimensionXPosition(rightWidth, true),
                height/2 - basicThickness/2,
                getDimensionZPosition()
              ]}
              fontSize={baseFontSize}
              color={viewMode === '3D' ? '#000000' : dimensionColor}
              anchorX="center"
              anchorY="middle"
              rotation={[0, 0, Math.PI / 2]}
              renderOrder={999}
              depthTest={false}
            >
              {Math.round(basicThickness / 0.01)}
            </Text>

            {/* 상단 프레임 두께 수직선 */}
            <Line
              points={[
                [getDimensionXPosition(rightWidth, false), height/2, getDimensionZPosition()],
                [getDimensionXPosition(rightWidth, false), height/2 - basicThickness, getDimensionZPosition()]
              ]}
              color={viewMode === '3D' ? '#000000' : dimensionColor}
              lineWidth={1}
            />
            {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
            {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
              <>
                <mesh position={[-rightWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                </mesh>
                <mesh position={[-rightWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                </mesh>
              </>
            )}
          </group>
        )}
      </>
    );
  };

  return (
    <group>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          {/* 좌측 측면 판재 - 통짜 (측면판 분할 안됨) */}
          <BoxWithEdges
        args={[basicThickness, height, depth]}
        position={[-width/2 + basicThickness/2, 0, 0]}
        material={material}
        renderMode={useSpace3DView().renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />
      
      {/* 우측 측면 판재 - 통짜 (측면판 분할 안됨) */}
      <BoxWithEdges
        args={[basicThickness, height, depth]}
        position={[width/2 - basicThickness/2, 0, 0]}
        material={material}
        renderMode={useSpace3DView().renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />
      
      {/* 상단 판재 - 통합 (상단 옷장이 좌우 연결되어 있음), 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      <BoxWithEdges
        args={[innerWidth - mmToThreeUnits(1), basicThickness, depth - mmToThreeUnits(26)]}
        position={[0, height/2 - basicThickness/2, mmToThreeUnits(13)]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />
      
      {/* 하단 판재 - 좌/우 분리, 뒤에서 26mm 줄여서 백패널과 맞닿게 */}
      <>
        {/* 좌측 하단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, depth - mmToThreeUnits(26)]}
          position={[leftXOffset, -height/2 + basicThickness/2, mmToThreeUnits(13)]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />

        {/* 우측 하단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, depth - mmToThreeUnits(26)]}
          position={[rightXOffset, -height/2 + basicThickness/2, mmToThreeUnits(13)]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
        
        {/* 우측 하단 가로 치수 표시 - 하부장(서랍영역) 내부에 표시, 탑뷰에서는 숨김 */}
        {showDimensions && showDimensionsText &&
         !(viewMode === '2D' && view2DDirection === 'top') &&
         hasSharedMiddlePanel && middlePanelHeight > 0 && (
          <group>
            {/* 가로 내경 수평선 - 중간 칸막이 우측면부터 우측 측판 내측면까지 */}
            <Line
              points={[
                [(leftWidth - rightWidth) / 2 + basicThickness/2, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset],
                [width/2 - basicThickness, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]
              ]}
              color={viewMode === '3D' ? '#000000' : dimensionColor}
              lineWidth={1}
            />
            
            {/* 가로 내경 텍스트 - 실제 우측 구간 너비 표시 */}
            <Text
              position={[
                ((leftWidth - rightWidth) / 2 + basicThickness/2 + width/2 - basicThickness) / 2, 
                (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2 - 0.2,
                viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset
              ]}
              fontSize={baseFontSize}
              color={viewMode === '3D' ? '#000000' : dimensionColor}
              anchorX="center"
              anchorY="top"
              renderOrder={999}
              depthTest={false}
            >
              {Math.round(threeUnitsToMm(rightWidth))}
            </Text>
            
            {/* 수평선 양끝 점 - 측면뷰에서 숨김 */}
            {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
              <>
                <mesh position={[(leftWidth - rightWidth) / 2 + basicThickness/2, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                </mesh>
                <mesh position={[width/2 - basicThickness, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                </mesh>
              </>
            )}
          </group>
        )}
      </>
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) */}
      {(() => {
        const backPanelHeight = innerHeight + mmToThreeUnits(36);
        const backPanelZ = -depth/2 + backPanelThickness/2 + mmToThreeUnits(17);
        const reinforcementHeight = mmToThreeUnits(60);
        const reinforcementDepth = mmToThreeUnits(15);
        const reinforcementZ = backPanelZ - backPanelThickness/2 - reinforcementDepth/2;

        return (
          <>
            <BoxWithEdges
              args={[innerWidth + mmToThreeUnits(10), backPanelHeight, backPanelThickness]}
              position={[0, 0, backPanelZ]}
              material={material}
              renderMode={useSpace3DView().renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
              isBackPanel={true} // 백패널임을 표시
            />
            {/* 보강대 (백패널 상/하단) - 60mm 높이, 15.5mm 두께 - 2D 정면도에서는 숨김 */}
            {!(viewMode === '2D' && view2DDirection === 'front') && (
              <>
                <BoxWithEdges
                  key="reinforcement-bottom"
                  args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                  position={[0, -backPanelHeight/2 + reinforcementHeight/2, reinforcementZ]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  panelName="하단보강대"
                />
                <BoxWithEdges
                  key="reinforcement-top"
                  args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                  position={[0, backPanelHeight/2 - reinforcementHeight/2, reinforcementZ]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  panelName="상단보강대"
                />
              </>
            )}
          </>
        );
      })()}

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

          {/* 드래그 중이 아닐 때만 비대칭 섹션 렌더링 */}
          {!isDragging && renderAsymmetricSections()}

          {/* 상부 옷장 치수 표시 - 전체 너비 기준, 탑뷰에서는 숨김 */}
          {!isDragging && showDimensions && showDimensionsText &&
           !(viewMode === '2D' && view2DDirection === 'top') && (
            <group>
              {hasSharedSafetyShelf ? (
                <>
                  {/* 중간 가로선반 상단부터 안전선반 하단까지 */}
                  <Text
                    position={[
                      getDimensionXPosition(innerWidth, true),
                      ((-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2) + (-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2)) / 2,
                      getDimensionZPosition()
                    ]}
                    fontSize={baseFontSize}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={999}
                    depthTest={false}
                  >
                    {Math.round(threeUnitsToMm(((-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2) - (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2))))}
                  </Text>

                  <Line
                    points={[
                      [getDimensionXPosition(innerWidth, false), -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, getDimensionZPosition()],
                      [getDimensionXPosition(innerWidth, false), -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, getDimensionZPosition()]
                    ]}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    lineWidth={1}
                  />
                  {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                    <>
                      <mesh position={[-innerWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                      <mesh position={[-innerWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                    </>
                  )}

                  {/* 안전선반 상단부터 상단 프레임 하단까지 */}
                  <Text
                    position={[
                      getDimensionXPosition(innerWidth, true),
                      ((-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2) + (height/2 - basicThickness)) / 2,
                      getDimensionZPosition()
                    ]}
                    fontSize={baseFontSize}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={999}
                    depthTest={false}
                  >
                    {Math.round(threeUnitsToMm(((height/2 - basicThickness) - (-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2))))}
                  </Text>

                  <Line
                    points={[
                      [getDimensionXPosition(innerWidth, false), -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, getDimensionZPosition()],
                      [getDimensionXPosition(innerWidth, false), height/2 - basicThickness, getDimensionZPosition()]
                    ]}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    lineWidth={1}
                  />
                  {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                    <>
                      <mesh position={[-innerWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                      <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* 안전선반이 없는 경우 - 중간 가로선반 상단부터 상단 프레임 하단까지 */}
                  <Text
                    position={[
                      getDimensionXPosition(innerWidth, true),
                      ((-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2) + (height/2 - basicThickness)) / 2,
                      getDimensionZPosition()
                    ]}
                    fontSize={baseFontSize}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={999}
                    depthTest={false}
                  >
                    {Math.round(threeUnitsToMm(((height/2 - basicThickness) - (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2))))}
                  </Text>

                  <Line
                    points={[
                      [getDimensionXPosition(innerWidth, false), -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, getDimensionZPosition()],
                      [getDimensionXPosition(innerWidth, false), height/2 - basicThickness, getDimensionZPosition()]
                    ]}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    lineWidth={1}
                  />
                  {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                    <>
                      <mesh position={[-innerWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                      <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                    </>
                  )}
                </>
              )}
            </group>
          )}

          {/* 조절발통 (네 모서리) - 띄움 배치 시에는 렌더링하지 않음 */}
          {!isFloating && !(lowerSectionTopOffset && lowerSectionTopOffset > 0) && (
            <AdjustableFootsRenderer
              width={width}
              depth={depth}
              yOffset={-height / 2}
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

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 */}
      {hasDoor && spaceInfo && (
        !doorSplit ? (
          // 병합 모드: 도어 하나
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
            doorTopGap={undefined}
            doorBottomGap={undefined}
            floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
            zone={zone}
          />
        ) : (
          // 분할 모드: 상/하부 도어 각각
          <>
            {/* 하부 도어 */}
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
              doorTopGap={lowerDoorTopGap}
              doorBottomGap={lowerDoorBottomGap}
              floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
              zone={zone}
            />
            {/* 상부 도어 */}
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
              doorTopGap={upperDoorTopGap}
              doorBottomGap={upperDoorBottomGap}
              floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
              zone={zone}
            />
          </>
        )
      )}
    </group>
  );
};

export default DualType6; 
