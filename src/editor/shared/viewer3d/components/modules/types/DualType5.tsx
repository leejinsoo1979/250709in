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
  showFurniture = true, // 가구 본체 표시 여부
  placedFurnitureId,
  visibleSectionIndex = null // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
}) => {
  // 공통 로직 사용 (좌측 깊이만 반영)
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
    material,
    calculateSectionHeight,
    mmToThreeUnits,
    modelConfig
  } = baseFurniture;

  const { view2DDirection, showDimensions, showDimensionsText } = useUIStore();
  const { renderMode, viewMode } = useSpace3DView();
  const { dimensionColor, baseFontSize } = useDimensionColor();

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

    // 좌측 섹션용 깊이 계산
    const leftAdjustedDepthForShelves = leftDepth - basicThickness;
    const leftShelfZOffset = basicThickness / 2;
    
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
                />
              );
            } else {
              // 옷걸이 구역 (선반 없음)
              sectionContent = null;
            }
            break;
            
          case 'drawer':
            if (section.count && section.count > 0) {
              sectionContent = (
                <DrawerRenderer
                  drawerCount={section.count}
                  innerWidth={leftWidth}
                  innerHeight={sectionHeight}
                  depth={leftDepth}
                  basicThickness={basicThickness}
                  yOffset={sectionCenterY}
                  drawerHeights={section.drawerHeights}
                  gapHeight={section.gapHeight}
                  material={material}
                  renderMode={renderMode}
                />
              );
            }
            break;
        }
        
        // 개별 구분 패널 렌더링 (좌측 섹션 간, 마지막 섹션 제외)
        let separatorPanel = null;
        if (index < allSections.length - 1) {
          separatorPanel = (
            <BoxWithEdges
              args={[leftWidth, basicThickness, leftAdjustedDepthForShelves - basicThickness]}
              position={[0, sectionCenterY + sectionHeight/2 - basicThickness/2, basicThickness/2 + leftShelfZOffset]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
            />
          );
        }
        
        // 다음 섹션을 위해 Y 위치 이동
        currentYPosition += sectionHeight;
        
        return (
          <group key={`left-section-${index}`}>
            {sectionContent}
            {separatorPanel}
            
            {/* 좌측 섹션 치수 표시 - 2D 탑뷰에서는 표시하지 않음 */}
            {showDimensions && showDimensionsText && !(viewMode === '2D' && view2DDirection === 'top') && (
              <>
                {/* 섹션 구분 패널 두께 표시 (마지막 섹션 제외) */}
                {index < allSections.length - 1 && (
                  <group>
                    {/* 구분 패널 두께 텍스트 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -leftWidth/2 * 0.3 - 0.8 + 0.01, 
                          sectionCenterY + sectionHeight/2 - basicThickness/2 - 0.01,
                          leftAdjustedDepthForShelves/2 + 0.1 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(basicThickness * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -leftWidth/2 * 0.3 - 0.8 : -leftWidth/2 * 0.3 - 0.5, 
                        sectionCenterY + sectionHeight/2 - basicThickness/2,
                        viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
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
                        [-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2 - basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0],
                        [-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2 - basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </group>
                )}
                
                {/* 상판 두께 표시 (마지막 섹션일 때만) */}
                {index === allSections.length - 1 && (
                  <group>
                    {/* 상판 두께 텍스트 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -leftWidth/2 * 0.3 - 0.8 + 0.01, 
                          height/2 - basicThickness/2 - 0.01,
                          leftAdjustedDepthForShelves/2 + 0.1 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(basicThickness * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -leftWidth/2 * 0.3 - 0.8 : -leftWidth/2 * 0.3 - 0.5, 
                        height/2 - basicThickness/2,
                        viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
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
                        [-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0],
                        [-leftWidth/2 * 0.3, height/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, height/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </group>
                )}
                
                {/* 섹션 높이 표시 (drawer 섹션만 - hanging은 ShelfRenderer에서 칸별로 표시) */}
                {(section.type === 'drawer') && (
                  <group>
                    {/* 서랍 섹션 전체 높이 텍스트 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -leftWidth/2 * 0.3 - 0.8 + 0.01, 
                          sectionCenterY - 0.01,
                          leftAdjustedDepthForShelves/2 + 0.1 - 0.01
                        ]}
                        fontSize={0.45}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(sectionHeight * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -leftWidth/2 * 0.3 - 0.8 : -leftWidth/2 * 0.3 - 0.5, 
                        sectionCenterY,
                        viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0
                      ]}
                      fontSize={viewMode === '3D' ? 0.45 : 0.32}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(sectionHeight * 100)}
                    </Text>
                    
                    {/* 서랍 섹션 높이 수직선 */}
                    <Line
                      points={[
                        [-leftWidth/2 * 0.3, sectionCenterY - sectionHeight/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0],
                        [-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2 - basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-leftWidth/2 * 0.3, sectionCenterY - sectionHeight/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, sectionCenterY + sectionHeight/2 - basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </group>
                )}
                
                {/* 첫 번째 섹션(서랍)의 하부 프레임 두께 표시 */}
                {index === 0 && section.type === 'drawer' && (
                  <group>
                    {/* 하부 프레임 두께 텍스트 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -leftWidth/2 * 0.3 - 0.8 + 0.01, 
                          -height/2 + basicThickness/2 - 0.01,
                          leftAdjustedDepthForShelves/2 + 0.1 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(basicThickness * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -leftWidth/2 * 0.3 - 0.8 : -leftWidth/2 * 0.3 - 0.5, 
                        -height/2 + basicThickness/2,
                        viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(basicThickness * 100)}
                    </Text>
                    
                    {/* 하부 프레임 두께 수직선 */}
                    <Line
                      points={[
                        [-leftWidth/2 * 0.3, -height/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0],
                        [-leftWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-leftWidth/2 * 0.3, -height/2, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? leftAdjustedDepthForShelves/2 + 0.1 : leftDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
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
                  depth={rightAdjustedDepthForShelves}
                  basicThickness={basicThickness}
                  material={material}
                  yOffset={sectionCenterY}
                  zOffset={rightShelfZOffset}
                  shelfPositions={section.shelfPositions}
                  isTopFinishPanel={section.isTopFinishPanel}
                  renderMode={renderMode}
                  furnitureId={rightFurnitureId}
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
            
            {/* 우측 섹션 치수 표시 - 2D 탑뷰에서는 표시하지 않음 */}
            {showDimensions && showDimensionsText && !(viewMode === '2D' && view2DDirection === 'top') && (
              <group>
                {/* 첫 번째 섹션일 때만 하부 프레임 두께 표시 */}
                {index === 0 && (
                  <>
                    {/* 하부 프레임 두께 텍스트 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -rightWidth/2 * 0.3 - 0.8 + 0.01, 
                          -height/2 + basicThickness/2 - 0.01,
                          3.01 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(basicThickness * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -rightWidth/2 * 0.3 - 0.8 : -rightWidth/2 * 0.3 - 0.5, 
                        -height/2 + basicThickness/2,
                        viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                    >
                      {Math.round(basicThickness * 100)}
                    </Text>
                    
                    {/* 하부 프레임 두께 수직선 */}
                    <Line
                      points={[
                        [-rightWidth/2 * 0.3, -height/2, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0],
                        [-rightWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-rightWidth/2 * 0.3, -height/2, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-rightWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </>
                )}
                
                {/* 마지막 섹션일 때 상판 두께 표시 */}
                {index === allSections.length - 1 && (
                  <>
                    {/* 상판 두께 텍스트 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -rightWidth/2 * 0.3 - 0.8 + 0.01, 
                          height/2 - basicThickness/2 - 0.01,
                          3.01 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(basicThickness * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -rightWidth/2 * 0.3 - 0.8 : -rightWidth/2 * 0.3 - 0.5, 
                        height/2 - basicThickness/2,
                        viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
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
                        [-rightWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0],
                        [-rightWidth/2 * 0.3, height/2, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-rightWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-rightWidth/2 * 0.3, height/2, viewMode === '3D' ? 3.01 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </>
                )}
                
                {/* 상단 가로 내경 치수 표시 (첫 번째 섹션일 때만) - 칸 내부에 표시 */}
                {index === 0 && (
                  <>
                    {/* 가로 내경 수평선 */}
                    <Line
                      points={[
                        [-rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightAdjustedDepthForShelves/2 - 0.5 : rightDepth/2 + 1.0],
                        [rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightAdjustedDepthForShelves/2 - 0.5 : rightDepth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    
                    {/* 가로 내경 텍스트 - 가이드선 아래 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          0 + 0.01, 
                          sectionCenterY + sectionHeight/2 - basicThickness - 1.2 - 0.01,
                          rightAdjustedDepthForShelves/2 - 0.5 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="top"
                        renderOrder={998}
                      >
                        {Math.round(rightWidth * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        0, 
                        sectionCenterY + sectionHeight/2 - basicThickness - 1.2,
                        viewMode === '3D' ? rightAdjustedDepthForShelves/2 - 0.5 : rightDepth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="top"
                      renderOrder={999}
                    >
                      {Math.round(rightWidth * 100)}
                    </Text>
                    
                    {/* 수평선 양끝 점 - 측면뷰에서 숨김 */}
                    {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                      <>
                        <mesh position={[-rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightAdjustedDepthForShelves/2 - 0.5 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[rightWidth/2, sectionCenterY + sectionHeight/2 - basicThickness - 1.0, viewMode === '3D' ? rightAdjustedDepthForShelves/2 - 0.5 : rightDepth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
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
        {/* 좌측 섹션 그룹 */}
        <group position={[leftXOffset, 0, 0]}>
          {renderLeftSections()}
        </group>

        {/* 우측 섹션 그룹 (660mm 깊이 기준 절대 고정) */}
        <group position={[rightXOffset, 0, 0]}>
          {renderRightSections()}
        </group>

        {/* 옷걸이 봉 렌더링 - 좌측 옷장 섹션에만 */}
        <group position={[leftXOffset, 0, 0]}>
          {(() => {
            const leftSections = modelConfig.leftSections || [];
            let accumulatedY = -height/2 + basicThickness;

            return leftSections.map((section: any, sectionIndex: number) => {
              const availableHeight = height - basicThickness * 2;
              const fixedSections = leftSections.filter((s: any) => s.heightType === 'absolute');
              const totalFixedHeight = fixedSections.reduce((sum: number, s: any) => {
                return sum + calculateSectionHeight(s, availableHeight);
              }, 0);
              const remainingHeight = availableHeight - totalFixedHeight;

              const sectionHeight = (section.heightType === 'absolute')
                ? calculateSectionHeight(section, availableHeight)
                : calculateSectionHeight(section, remainingHeight);

              const sectionBottomY = accumulatedY;
              accumulatedY += sectionHeight;

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
                const finishPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                rodYPosition = finishPanelBottom - mmToThreeUnits(27) - mmToThreeUnits(75 / 2);
              } else {
                // 안전선반도 마감 패널도 없는 경우: 브라켓 윗면이 섹션 상판 하단에 붙음
                const sectionTopPanelBottom = sectionBottomY + sectionHeight - basicThickness / 2;
                rodYPosition = sectionTopPanelBottom - mmToThreeUnits(75 / 2);
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
        
        {/* 중앙 칸막이 (섹션별로 분할, 더 큰 깊이 사용) */}
        {calculateLeftSectionHeights().map((sectionHeight, index) => {
          let currentYPosition = -height/2 + basicThickness;
          
          // 현재 섹션까지의 Y 위치 계산
          for (let i = 0; i < index; i++) {
            currentYPosition += calculateLeftSectionHeights()[i];
          }
          
          const sectionCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
          const middlePanelDepth = Math.max(leftDepth, rightDepth); // 더 큰 깊이 사용
          
          // 중앙 칸막이 Z 위치: 좌측 깊이가 우측보다 클 때는 좌측 기준, 아니면 우측 기준
          const middlePanelZOffset = leftDepth > rightDepth ? 0 : (leftDepth - rightDepth) / 2;
          
          return (
            <BoxWithEdges
              key={`middle-panel-${index}`}
              args={[basicThickness, sectionHeight, middlePanelDepth]}
              position={[(leftWidth - rightWidth) / 2, sectionCenterY, middlePanelZOffset]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
              edgeOpacity={(view2DDirection === 'left' || visibleSectionIndex === 0) && visibleSectionIndex !== 1 ? 0.1 : undefined}
            />
          );
        })}
      </>
    );
  };

  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          {/* 좌측 측면 판재 - 섹션별로 분할 */}
          {calculateLeftSectionHeights().map((sectionHeight, index) => {
        let currentYPosition = -height/2 + basicThickness;
        
        // 현재 섹션까지의 Y 위치 계산
        for (let i = 0; i < index; i++) {
          currentYPosition += calculateLeftSectionHeights()[i];
        }
        
        const sectionCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
        
        return (
          <BoxWithEdges
            key={`left-side-panel-${index}`}
            args={[basicThickness, sectionHeight, leftDepth]}
            position={[-width/2 + basicThickness/2, sectionCenterY, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isEditMode={isEditMode}
            edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
          />
        );
      })}

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
      
      {/* 상단 판재 - 좌/우 분리 */}
      <>
        {/* 좌측 상단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, leftDepth]}
          position={[leftXOffset, height/2 - basicThickness/2, 0]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
        />

        {/* 우측 상단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, rightDepth]}
          position={[rightXOffset, height/2 - basicThickness/2, (leftDepth - rightDepth) / 2]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={(view2DDirection === 'left' || visibleSectionIndex === 0) && visibleSectionIndex !== 1 ? 0.1 : undefined}
        />
      </>
      
      {/* 하단 판재 - 좌/우 분리 */}
      <>
        {/* 좌측 하단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, leftDepth]}
          position={[leftXOffset, -height/2 + basicThickness/2, 0]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
        />

        {/* 우측 하단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, rightDepth]}
          position={[rightXOffset, -height/2 + basicThickness/2, (leftDepth - rightDepth) / 2]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          edgeOpacity={(view2DDirection === 'left' || visibleSectionIndex === 0) && visibleSectionIndex !== 1 ? 0.1 : undefined}
        />
      </>
      
      {/* 뒷면 판재 - 좌/우 분리 (9mm 얇은 백패널, 각각 상하좌우 5mm 확장) */}
      <>
        {/* 좌측 백패널 */}
        <BoxWithEdges
          args={[leftWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[leftXOffset, 0, -leftDepth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          hideEdges={false} // 엣지는 표시하되
          isBackPanel={true} // 백패널임을 표시
          edgeOpacity={visibleSectionIndex === 1 ? 0.1 : undefined}
        />

        {/* 우측 백패널 (고정 깊이 660mm 기준) */}
        <BoxWithEdges
          args={[rightWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[rightXOffset, 0, -rightDepth/2 + backPanelThickness/2 + mmToThreeUnits(17) + (leftDepth - rightDepth) / 2]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          hideEdges={false} // 엣지는 표시하되
          isBackPanel={true} // 백패널임을 표시
          edgeOpacity={(view2DDirection === 'left' || visibleSectionIndex === 0) && visibleSectionIndex !== 1 ? 0.1 : undefined}
        />
      </>

      {/* 환기캡 렌더링 */}
      {!isDragging && (
        <>
          {/* 좌측 백패널 환기캡 */}
          <VentilationCap
            position={[
              leftXOffset + leftWidth/2 - mmToThreeUnits(132),  // 좌측 백패널 우측 끝에서 안쪽으로 132mm
              height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
              -leftDepth/2 + backPanelThickness + mmToThreeUnits(17) + 0.01  // 좌측 백패널 앞쪽에 살짝 앞으로
            ]}
            diameter={98}
            renderMode={renderMode}
          />

          {/* 우측 백패널 환기캡 */}
          <VentilationCap
            position={[
              rightXOffset + rightWidth/2 - mmToThreeUnits(132),  // 우측 백패널 우측 끝에서 안쪽으로 132mm
              height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
              -rightDepth/2 + backPanelThickness + mmToThreeUnits(17) + (leftDepth - rightDepth) / 2 + 0.01  // 우측 백패널 앞쪽 (깊이 차이 보정)
            ]}
            diameter={98}
            renderMode={renderMode}
          />
        </>
      )}

          {/* 드래그 중이 아닐 때만 비대칭 섹션 렌더링 */}
          {!isDragging && renderAsymmetricSections()}

          {/* 조절발통 (네 모서리) */}
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
        />
      )}
    </>
  );
};

export default DualType5; 
