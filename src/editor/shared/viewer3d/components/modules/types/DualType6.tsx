import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DrawerRenderer from '../DrawerRenderer';
import { useTheme } from "@/contexts/ThemeContext";
import DoorModule from '../DoorModule';
import { useUIStore } from '@/store/uiStore';
import { Text, Line } from '@react-three/drei';

// 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean;
}> = ({ args, position, material, renderMode = 'solid', isDragging = false, isEditMode = false }) => {
  const { viewMode } = useSpace3DView();
  const { gl } = useThree();
  const { theme } = useTheme();
  
  // Shadow auto-update enabled - manual shadow updates removed

  // 드래그 중이거나 편집 모드일 때 고스트 효과 적용
  const processedMaterial = React.useMemo(() => {
    if ((isDragging || isEditMode) && material instanceof THREE.MeshStandardMaterial) {
      const ghostMaterial = material.clone();
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = isEditMode ? 0.2 : 0.6;
      
      // 테마 색상 가져오기
      const getThemeColor = () => {
        if (typeof window !== "undefined") {
          const computedStyle = getComputedStyle(document.documentElement);
          const primaryColor = computedStyle.getPropertyValue("--theme-primary").trim();
          if (primaryColor) {
            return primaryColor;
          }
        }
        return "#10b981"; // 기본값 (green)
      };
      
      ghostMaterial.color = new THREE.Color(getThemeColor());
      if (isEditMode) {
        ghostMaterial.emissive = new THREE.Color(getThemeColor());
        ghostMaterial.emissiveIntensity = 0.1;
        ghostMaterial.depthWrite = false;
      }
      ghostMaterial.needsUpdate = true;
      return ghostMaterial;
    }
    return material;
  }, [material, isDragging, isEditMode]);

  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh receiveShadow={viewMode === '3D'} castShadow={viewMode === '3D'}>
          <boxGeometry args={args} />
          <primitive object={processedMaterial} attach="material" />
        </mesh>
      )}
      {/* 윤곽선 렌더링 */}
      {viewMode === '3D' ? (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color="#505050"
            transparent={true}
            opacity={0.9}
            depthTest={true}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        </lineSegments>
      ) : (
        ((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
            <lineBasicMaterial 
              color={renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : (theme?.mode === 'dark' ? "#cccccc" : "#666666")} 
              linewidth={2} 
            />
          </lineSegments>
        )
      )}
    </group>
  );
};

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
  slotCenterX
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode
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

  const { viewMode, view2DDirection, showDimensions } = useUIStore();
  const { theme } = useTheme();

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
                    <Text
                      position={[
                        -leftWidth/2 * 0.3 - 0.5, 
                        (sectionCenterY - sectionHeight/2 + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2)) / 2,
                        viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
                      ]}
                      fontSize={0.32}
                      color="#4CAF50"
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                      depthTest={false}
                    >
                      {Math.round(((-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2) - (sectionCenterY - sectionHeight/2)) / 0.01)}
                    </Text>
                    
                    {/* 서랍 섹션 높이 수직선 - 중간 가로선반 하단까지 */}
                    <Line
                      points={[
                        [-leftWidth/2 * 0.3, sectionCenterY - sectionHeight/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                        [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
                      ]}
                      color="#4CAF50"
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 */}
                    <mesh position={[-leftWidth/2 * 0.3, sectionCenterY - sectionHeight/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color="#4CAF50" />
                    </mesh>
                    <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color="#4CAF50" />
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
                            viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
                          ]}
                          fontSize={0.32}
                          color="#4CAF50"
                          anchorX="center"
                          anchorY="middle"
                          rotation={[0, 0, Math.PI / 2]}
                          renderOrder={999}
                          depthTest={false}
                        >
                          {Math.round(((-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2) - (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2)) / 0.01)}
                        </Text>
                        
                        <Line
                          points={[
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
                          ]}
                          color="#4CAF50"
                          lineWidth={1}
                        />
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color="#4CAF50" />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color="#4CAF50" />
                        </mesh>
                        
                        {/* 안전선반 상단부터 상단 프레임 하단까지 */}
                        <Text
                          position={[
                            -leftWidth/2 * 0.3 - 0.5, 
                            ((-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2) + (height/2 - basicThickness)) / 2,
                            viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
                          ]}
                          fontSize={0.32}
                          color="#4CAF50"
                          anchorX="center"
                          anchorY="middle"
                          rotation={[0, 0, Math.PI / 2]}
                          renderOrder={999}
                          depthTest={false}
                        >
                          {Math.round(((height/2 - basicThickness) - (-height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2)) / 0.01)}
                        </Text>
                        
                        <Line
                          points={[
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                            [-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
                          ]}
                          color="#4CAF50"
                          lineWidth={1}
                        />
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color="#4CAF50" />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color="#4CAF50" />
                        </mesh>
                      </>
                    ) : (
                      <>
                        {/* 안전선반이 없는 경우 - 중간 가로선반 상단부터 상단 프레임 하단까지 */}
                        <Text
                          position={[
                            -leftWidth/2 * 0.3 - 0.5, 
                            sectionCenterY,
                            viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
                          ]}
                          fontSize={0.32}
                          color="#4CAF50"
                          anchorX="center"
                          anchorY="middle"
                          rotation={[0, 0, Math.PI / 2]}
                          renderOrder={999}
                          depthTest={false}
                        >
                          {Math.round(((height/2 - basicThickness) - (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2)) / 0.01)}
                        </Text>
                        
                        <Line
                          points={[
                            [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                            [-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
                          ]}
                          color="#4CAF50"
                          lineWidth={1}
                        />
                        <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color="#4CAF50" />
                        </mesh>
                        <mesh position={[-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                          <sphereGeometry args={[0.02, 8, 8]} />
                          <meshBasicMaterial color="#4CAF50" />
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
                        viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
                      ]}
                      fontSize={0.32}
                      color="#4CAF50"
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={999}
                      depthTest={false}
                    >
                      {Math.round(basicThickness / 0.01)}
                    </Text>
                    
                    {/* 하부 프레임 두께 수직선 */}
                    <Line
                      points={[
                        [-leftWidth/2 * 0.3, -height/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                        [-leftWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
                      ]}
                      color="#4CAF50"
                      lineWidth={1}
                    />
                    {/* 수직선 양끝 점 */}
                    <mesh position={[-leftWidth/2 * 0.3, -height/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color="#4CAF50" />
                    </mesh>
                    <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                      <sphereGeometry args={[0.02, 8, 8]} />
                      <meshBasicMaterial color="#4CAF50" />
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
                    viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
                  ]}
                  fontSize={0.32}
                  color="#4CAF50"
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
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
                  ]}
                  color="#4CAF50"
                  lineWidth={1}
                />
                {/* 수직선 양끝 점 */}
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color="#4CAF50" />
                </mesh>
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color="#4CAF50" />
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
                    viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
                  ]}
                  fontSize={0.32}
                  color="#4CAF50"
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
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                    [-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
                  ]}
                  color="#4CAF50"
                  lineWidth={1}
                />
                {/* 수직선 양끝 점 */}
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) - basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color="#4CAF50" />
                </mesh>
                <mesh position={[-leftWidth/2 * 0.3, -height/2 + basicThickness + mmToThreeUnits(safetyShelfHeight) + basicThickness/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
                  <sphereGeometry args={[0.02, 8, 8]} />
                  <meshBasicMaterial color="#4CAF50" />
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
                viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5
              ]}
              fontSize={0.32}
              color="#4CAF50"
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
                [-leftWidth/2 * 0.3, height/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5],
                [-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]
              ]}
              color="#4CAF50"
              lineWidth={1}
            />
            {/* 수직선 양끝 점 */}
            <mesh position={[-leftWidth/2 * 0.3, height/2, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color="#4CAF50" />
            </mesh>
            <mesh position={[-leftWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? basicThickness/2 + shelfZOffset + (adjustedDepthForShelves - basicThickness)/2 + 0.01 : basicThickness/2 + shelfZOffset + 0.5]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color="#4CAF50" />
            </mesh>
          </group>
        )}
      </>
    );
  };

  return (
    <group>
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
              color="#4CAF50"
              lineWidth={1}
            />
            
            {/* 가로 내경 텍스트 */}
            <Text
              position={[
                ((leftWidth - rightWidth) / 2 + basicThickness/2 + width/2 - basicThickness) / 2, 
                (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2 - 0.2,
                viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset
              ]}
              fontSize={0.32}
              color="#4CAF50"
              anchorX="center"
              anchorY="top"
              renderOrder={999}
              depthTest={false}
            >
              {Math.round(((width/2 - basicThickness) - ((leftWidth - rightWidth) / 2 + basicThickness/2)) / 0.01)}
            </Text>
            
            {/* 수평선 양끝 점 */}
            <mesh position={[(leftWidth - rightWidth) / 2 + basicThickness/2, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color="#4CAF50" />
            </mesh>
            <mesh position={[width/2 - basicThickness, (-height/2 + basicThickness + (-height/2 + basicThickness + mmToThreeUnits(middlePanelHeight - 9))) / 2, viewMode === '3D' ? shelfZOffset + adjustedDepthForShelves/2 : shelfZOffset]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color="#4CAF50" />
            </mesh>
          </group>
        )}
      </>
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) */}
      {viewMode === '2D' && view2DDirection === 'front' ? (
        <group position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}>
          <lineSegments
            onUpdate={(self) => {
              if (self.geometry) {
                self.computeLineDistances();
              }
            }}
          >
            <edgesGeometry args={[new THREE.BoxGeometry(innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness)]} />
            <lineDashedMaterial 
              color={theme?.mode === 'dark' ? "#666666" : "#999999"}
              transparent={true}
              opacity={0.5}
              depthTest={false}
              linewidth={1}
              dashSize={0.05}
              gapSize={0.03}
              scale={1}
            />
          </lineSegments>
        </group>
      ) : (
        <BoxWithEdges
          args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
        />
      )}
      
      {/* 드래그 중이 아닐 때만 비대칭 섹션 렌더링 */}
      {!isDragging && renderAsymmetricSections()}
      
      {/* 도어 렌더링 */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          moduleData={moduleData} // 실제 듀얼캐빔넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={0} // 이미 FurnitureItem에서 절대 좌표로 배치했으므로 0
          isDragging={isDragging}
          isEditMode={isEditMode}
        />
      )}
    </group>
  );
};

export default DualType6; 