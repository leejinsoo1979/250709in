import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DrawerRenderer from '../DrawerRenderer';
import { useTheme } from "@/contexts/ThemeContext";
import IndirectLight from '../IndirectLight';
import DoorModule from '../DoorModule';
import { useUIStore } from '@/store/uiStore';
import { Text, Line } from '@react-three/drei';


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
  showFurniture = true
}) => {
  try {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    slotWidths // 듀얼 가구의 개별 슬롯 너비 전달
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
  
  // Three.js 단위를 mm로 변환하는 함수
  const threeUnitsToMm = (units: number) => units * 100;

  const { viewMode, view2DDirection, showDimensions, indirectLightEnabled, indirectLightIntensity } = useUIStore();
  const { theme } = useTheme();
  
  // 띄워서 배치 여부 확인
  const placementType = spaceInfo?.baseConfig?.placementType;
  const isFloating = placementType === 'float';
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  
  // 간접조명 표시 조건 (3D 모드에서만)
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  const showIndirectLight = !is2DMode && !!(isFloating && floatHeight > 0 && !isDragging && indirectLightEnabled);
  
  // 간접조명 Y 위치 계산 (가구 바닥 바로 아래)
  const furnitureBottomY = -baseFurniture.height/2;  // 가구 하단 (가구 중심이 0일 때)
  // 가구 바닥에서 약간 아래에 위치
  const lightY = furnitureBottomY - 0.5;  // 가구 바닥에서 50cm 아래
  
  console.log('🔥 DualType6 간접조명 계산:', {
    moduleId: moduleData.id,
    hasSpaceInfo: !!spaceInfo,
    baseConfig: spaceInfo?.baseConfig,
    placementType,
    isFloating,
    floatHeight,
    isDragging,
    indirectLightEnabled,
    is2DMode,
    showIndirectLight,
    lightY
  });

  // 치수 표시용 색상 설정 - 3D에서는 테마 색상, 2D에서는 고정 색상
  const getThemeColor = () => {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
  };
  
  const dimensionColor = viewMode === '3D' ? getThemeColor() : '#4CAF50';
  const baseFontSize = viewMode === '3D' ? 0.45 : 0.32;

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
  
  console.log('🔍 DualType6 좌우 분할 계산:', {
    moduleId: moduleData.id,
    width,
    innerWidth,
    leftWidth,
    rightWidth,
    leftXOffset,
    rightXOffset,
    modelConfig: {
      rightAbsoluteWidth: modelConfig.rightAbsoluteWidth,
      hasSharedMiddlePanel: modelConfig.hasSharedMiddlePanel,
      leftSections: modelConfig.leftSections,
      rightSections: modelConfig.rightSections
    }
  });

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
              sectionContent = (
                <DrawerRenderer
                  drawerCount={section.count}
                  innerWidth={leftWidth}
                  innerHeight={sectionHeight}
                  depth={depth}
                  basicThickness={basicThickness}
                  yOffset={sectionCenterY}
                  drawerHeights={section.drawerHeights}
                  gapHeight={section.gapHeight}
                  material={material}
                  renderMode={useSpace3DView().renderMode}
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
            
            {/* 좌측 섹션 치수 표시 */}
            {showDimensions && (section.type === 'drawer' || section.type === 'hanging') && (
              <group>
                {section.type === 'drawer' ? (
                  <>
                    {/* 서랍 섹션 전체 높이 텍스트 - 중간 가로선반 하단까지 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -leftWidth/2 * 0.3 - 0.8 + 0.01, 
                          (sectionCenterY - sectionHeight/2 + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2)) / 2 - 0.01,
                          adjustedDepthForShelves/2 + 0.1 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(threeUnitsToMm(((-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2) - (sectionCenterY - sectionHeight/2))))}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -leftWidth/2 * 0.3 - 0.8 : -leftWidth/2 * 0.3 - 0.5, 
                        (sectionCenterY - sectionHeight/2 + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2)) / 2,
                        viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                      depthTest={false}
                    >
                      {Math.round(threeUnitsToMm(((-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2) - (sectionCenterY - sectionHeight/2))))}
                    </Text>
                    
                    {/* 서랍 섹션 높이 수직선 - 중간 가로선반 하단까지 */}
                    <Line
                      points={[
                        [-leftWidth/2 * 0.3, sectionCenterY - sectionHeight/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                        [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 */}
                    <mesh position={[-leftWidth/2 * 0.3, sectionCenterY - sectionHeight/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color={dimensionColor} />
                    </mesh>
                    <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color={dimensionColor} />
                    </mesh>
                  </>
                ) : section.type === 'hanging' && index === 1 ? (
                  <>
                    {/* 상부 옷장 내경 높이 */}
                    {hasSharedSafetyShelf ? (
                      <>
                        {/* 중간 가로선반 상단부터 안전선반 하단까지 */}
                        <Text
                          position={[
                            -leftWidth/2 * 0.3 - 0.5, 
                            ((-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2) + (-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2)) / 2,
                            viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
                          ]}
                          fontSize={baseFontSize}
                          color={dimensionColor}
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
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                        />
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        
                        {/* 안전선반 상단부터 상단 프레임 하단까지 */}
                        <Text
                          position={[
                            -leftWidth/2 * 0.3 - 0.5, 
                            ((-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2) + (height/2 - basicThickness)) / 2,
                            viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
                          ]}
                          fontSize={baseFontSize}
                          color={dimensionColor}
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
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                            [-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                        />
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </>
                    ) : (
                      <>
                        {/* 안전선반이 없는 경우 - 중간 가로선반 상단부터 상단 프레임 하단까지 */}
                        <Text
                          position={[
                            -leftWidth/2 * 0.3 - 0.5, 
                            sectionCenterY,
                            viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
                          ]}
                          fontSize={baseFontSize}
                          color={dimensionColor}
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
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                            [-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                        />
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </>
                    )}
                  </>
                ) : null}
                
                {/* 첫 번째 섹션(서랍)의 하부 프레임 두께 표시 */}
                {index === 0 && (
                  <group>
                    {/* 하부 프레임 두께 텍스트 */}
                    <Text
                      position={[
                        -leftWidth/2 * 0.3 - 0.5, 
                        -height/2 + basicThickness/2,
                        viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
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
                        [-leftWidth/2 * 0.3, -height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                        [-leftWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 */}
                    <mesh position={[-leftWidth/2 * 0.3, -height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color={dimensionColor} />
                    </mesh>
                    <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color={dimensionColor} />
                    </mesh>
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
      return allSections.map((section, index) => {
        let sectionContent = null;
        
        switch (section.type) {
          case 'hanging':
            // 바지걸이 또는 옷걸이 구역 - 안전선반은 통합으로 처리
            sectionContent = null;
            break;
        }
        
        return (
          <group key={`right-section-${index}`}>
            {sectionContent}
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
        
        {/* 우측 섹션 그룹 */}
        <group position={[rightXOffset, 0, 0]}>
          {renderRightSections()}
        </group>
        
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
              args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
              position={[0, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9), basicThickness/2 + shelfZOffset]}
              material={material}
              renderMode={useSpace3DView().renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
            />
            
            {/* 중단선반 두께 치수 표시 */}
            {showDimensions && (
              <group>
                {/* 중단선반 두께 텍스트 */}
                <Text
                  position={[
                    -leftWidth/2 * 0.3 - 0.5, 
                    -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9),
                    viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
                  ]}
                  fontSize={baseFontSize}
                  color={dimensionColor}
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
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                />
                {/* 수직선 양끝 점 */}
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color={dimensionColor} />
                </mesh>
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color={dimensionColor} />
                </mesh>
              </group>
            )}
          </>
        )}
        
        {/* 통합 안전선반 (전체 폭) */}
        {hasSharedSafetyShelf && safetyShelfHeight > 0 && (
          <>
            <BoxWithEdges
              args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
              position={[0, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight), basicThickness/2 + shelfZOffset]}
              material={material}
              renderMode={useSpace3DView().renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
            />
            
            {/* 안전선반 두께 치수 표시 */}
            {showDimensions && (
              <group>
                {/* 안전선반 두께 텍스트 */}
                <Text
                  position={[
                    -leftWidth/2 * 0.3 - 0.5, 
                    -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight),
                    viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
                  ]}
                  fontSize={baseFontSize}
                  color={dimensionColor}
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
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                />
                {/* 수직선 양끝 점 */}
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color={dimensionColor} />
                </mesh>
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color={dimensionColor} />
                </mesh>
              </group>
            )}
          </>
        )}
        
        {/* 상단 프레임 두께 치수 표시 */}
        {showDimensions && (
          <group>
            {/* 상단 프레임 두께 텍스트 */}
            <Text
              position={[
                -leftWidth/2 * 0.3 - 0.5, 
                height/2 - basicThickness/2,
                viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5
              ]}
              fontSize={baseFontSize}
              color={dimensionColor}
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
                [-leftWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5],
                [-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]
              ]}
              color={dimensionColor}
              lineWidth={1}
            />
            {/* 수직선 양끝 점 */}
            <mesh position={[-leftWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color={dimensionColor} />
            </mesh>
            <mesh position={[-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : basicThickness/2 + shelfZOffset + 0.5]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color={dimensionColor} />
            </mesh>
          </group>
        )}
      </>
    );
  };

  console.log('🚨 DualType6 렌더링 시작:', {
    moduleId: moduleData.id,
    showFurniture,
    isDragging,
    baseFurniture: {
      width: baseFurniture.width,
      height: baseFurniture.height,
      depth: baseFurniture.depth,
      material: baseFurniture.material
    }
  });

  return (
    <>
      {/* 띄워서 배치 시 간접조명 효과 */}
      {showIndirectLight && (
        <IndirectLight
          width={baseFurniture.innerWidth * 1.5}
          depth={baseFurniture.depth * 1.5}
          intensity={indirectLightIntensity || 0.8}
          position={[0, lightY, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <group>
          {console.log('🔍 DualType6 기본 구조 렌더링:', {
            width,
            height,
            depth,
            innerWidth,
            innerHeight,
            basicThickness,
            leftPanelPosition: -width/2 + basicThickness/2,
            rightPanelPosition: width/2 - basicThickness/2
          })}
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
      
      {/* 상단 판재 - 통합 (상단 옷장이 좌우 연결되어 있음) */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, height/2 - basicThickness/2, 0]}
        material={material}
        renderMode={useSpace3DView().renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />
      
      {/* 하단 판재 - 좌/우 분리 */}
      <>
        {/* 좌측 하단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, depth]}
          position={[leftXOffset, -height/2 + basicThickness/2, 0]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
        
        {/* 우측 하단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, depth]}
          position={[rightXOffset, -height/2 + basicThickness/2, 0]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
        
        {/* 우측 하단 가로 치수 표시 - 하부장(서랍영역) 내부에 표시 */}
        {showDimensions && hasSharedMiddlePanel && middlePanelHeight > 0 && (
          <group>
            {/* 가로 내경 수평선 - 중간 칸막이 우측면부터 우측 측판 내측면까지 */}
            <Line
              points={[
                [(leftWidth - rightWidth) / 2 + basicThickness/2, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset],
                [width/2 - basicThickness, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]
              ]}
              color={dimensionColor}
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
              color={dimensionColor}
              anchorX="center"
              anchorY="top"
              renderOrder={999}
              depthTest={false}
            >
              {Math.round(threeUnitsToMm(rightWidth))}
            </Text>
            
            {/* 수평선 양끝 점 */}
            <mesh position={[(leftWidth - rightWidth) / 2 + basicThickness/2, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color={dimensionColor} />
            </mesh>
            <mesh position={[width/2 - basicThickness, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color={dimensionColor} />
            </mesh>
          </group>
        )}
      </>
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) */}
      <BoxWithEdges
        args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
        position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
        material={material}
        renderMode={useSpace3DView().renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isBackPanel={true} // 백패널임을 표시
      />
      
      {/* 드래그 중이 아닐 때만 비대칭 섹션 렌더링 */}
      {!isDragging && renderAsymmetricSections()}
        </group>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          moduleData={moduleData} // 실제 듀얼캐빔넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX} // FurnitureItem에서 계산한 오프셋 사용
          slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
          isDragging={isDragging}
          isEditMode={isEditMode}
        slotIndex={slotIndex}
        />
      )}
    </>
  );
  } catch (error) {
    console.error('🚨 DualType6 렌더링 에러:', error);
    console.error('스택 트레이스:', error.stack);
    console.error('모듈 데이터:', moduleData);
    console.error('Props:', {
      color,
      internalHeight,
      hasDoor,
      customDepth,
      isDragging,
      isEditMode,
      showFurniture,
      slotWidths
    });
    
    // 에러가 발생해도 빈 group을 반환하여 전체 씬이 충돌하지 않도록 함
    return <group />;
  }
};

export default DualType6; 