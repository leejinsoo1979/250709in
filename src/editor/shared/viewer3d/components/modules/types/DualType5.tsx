import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import ShelfRenderer from '../ShelfRenderer';
import DrawerRenderer from '../DrawerRenderer';
import DoorModule from '../DoorModule';
// import { SectionConfig } from '@/data/modules/shelving'; // 사용되지 않음

// 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
}> = ({ args, position, material, renderMode = 'solid', isDragging = false }) => {
  const { viewMode } = useSpace3DView();
  const { gl } = useThree();
  
  // 스타일러장은 독립적인 BoxWithEdges를 사용하므로 개별 그림자 업데이트 필요
  useEffect(() => {
    if (viewMode === '3D' && gl && gl.shadowMap) {
      gl.shadowMap.needsUpdate = true;
      requestAnimationFrame(() => {
        gl.shadowMap.needsUpdate = true;
      });
    }
  }, [viewMode, gl, args, position, material]);

  // 드래그 중일 때 고스트 효과 적용
  const processedMaterial = React.useMemo(() => {
    if (isDragging && material instanceof THREE.MeshStandardMaterial) {
      const ghostMaterial = material.clone();
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = 0.6;
      ghostMaterial.color = new THREE.Color(0x90EE90); // 연두색
      ghostMaterial.needsUpdate = true;
      return ghostMaterial;
    }
    return material;
  }, [material, isDragging]);

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
      {((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color={renderMode === 'wireframe' ? "#333333" : "#666666"} 
            linewidth={2} 
          />
        </lineSegments>
      )}
    </group>
  );
};

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
  doorWidth,
  originalSlotWidth,
  slotCenterX
}) => {
  // 공통 로직 사용 (좌측 깊이만 반영)
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging
  });

  const {
    width,
    height,
    innerWidth,
    innerHeight,
    basicThickness,
    backPanelThickness,
    material,
    calculateSectionHeight,
    mmToThreeUnits,
    modelConfig
  } = baseFurniture;

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
      let currentYPosition = -height/2;
      
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
                  renderMode={useSpace3DView().renderMode}
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
                  renderMode={useSpace3DView().renderMode}
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
                  renderMode={useSpace3DView().renderMode}
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
              position={[0, sectionCenterY + sectionHeight/2 + basicThickness/2, basicThickness/2 + leftShelfZOffset]}
              material={material}
              renderMode={useSpace3DView().renderMode}
              isDragging={isDragging}
            />
          );
        }
        
        // 다음 섹션을 위해 Y 위치 이동
        currentYPosition += sectionHeight;
        
        return (
          <group key={`left-section-${index}`}>
            {sectionContent}
            {separatorPanel}
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
      let currentYPosition = -height/2;
      
      return allSections.map((section, index) => {
        const sectionHeight = section.calculatedHeight;
        const sectionCenterY = currentYPosition + sectionHeight / 2;
        
        let sectionContent = null;
        
        switch (section.type) {
          case 'hanging':
            // 스타일러장 - 안전선반이 있는 경우 렌더링
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
                  renderMode={useSpace3DView().renderMode}
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
                  renderMode={useSpace3DView().renderMode}
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
        
        {/* 중앙 칸막이 (섹션별로 분할, 더 큰 깊이 사용) */}
        {calculateLeftSectionHeights().map((sectionHeight, index) => {
          let currentYPosition = -height/2;
          
          // 현재 섹션까지의 Y 위치 계산
          for (let i = 0; i < index; i++) {
            currentYPosition += calculateLeftSectionHeights()[i];
          }
          
          const sectionCenterY = currentYPosition + sectionHeight / 2;
          const middlePanelDepth = Math.max(leftDepth, rightDepth); // 더 큰 깊이 사용
          
          // 중앙 칸막이 Z 위치: 좌측 깊이가 우측보다 클 때는 좌측 기준, 아니면 우측 기준
          const middlePanelZOffset = leftDepth > rightDepth ? 0 : (leftDepth - rightDepth) / 2;
          
          return (
            <BoxWithEdges
              key={`middle-panel-${index}`}
              args={[basicThickness, sectionHeight, middlePanelDepth]}
              position={[(leftWidth - rightWidth) / 2, sectionCenterY, middlePanelZOffset]}
              material={material}
              renderMode={useSpace3DView().renderMode}
              isDragging={isDragging}
            />
          );
        })}
      </>
    );
  };

  return (
    <group>
      {/* 좌측 측면 판재 - 섹션별로 분할 */}
      {calculateLeftSectionHeights().map((sectionHeight, index) => {
        let currentYPosition = -height/2;
        
        // 현재 섹션까지의 Y 위치 계산
        for (let i = 0; i < index; i++) {
          currentYPosition += calculateLeftSectionHeights()[i];
        }
        
        const sectionCenterY = currentYPosition + sectionHeight / 2;
        
        return (
          <BoxWithEdges
            key={`left-side-panel-${index}`}
            args={[basicThickness, sectionHeight, leftDepth]}
            position={[-width/2 + basicThickness/2, sectionCenterY, 0]}
            material={material}
            renderMode={useSpace3DView().renderMode}
            isDragging={isDragging}
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
      />
      
      {/* 상단 판재 - 좌/우 분리 */}
      <>
        {/* 좌측 상단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, leftDepth]}
          position={[leftXOffset, height/2 - basicThickness/2, 0]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
        
        {/* 우측 상단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, rightDepth]}
          position={[rightXOffset, height/2 - basicThickness/2, (leftDepth - rightDepth) / 2]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
      </>
      
      {/* 하단 판재 - 좌/우 분리 */}
      <>
        {/* 좌측 하단판 */}
        <BoxWithEdges
          args={[leftWidth, basicThickness, leftDepth]}
          position={[leftXOffset, -height/2 + basicThickness/2, 0]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
        
        {/* 우측 하단판 */}
        <BoxWithEdges
          args={[rightWidth, basicThickness, rightDepth]}
          position={[rightXOffset, -height/2 + basicThickness/2, (leftDepth - rightDepth) / 2]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
      </>
      
      {/* 뒷면 판재 - 좌/우 분리 (9mm 얇은 백패널, 각각 상하좌우 5mm 확장) */}
      <>
        {/* 좌측 백패널 */}
        <BoxWithEdges
          args={[leftWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[leftXOffset, 0, -leftDepth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
        
        {/* 우측 백패널 (고정 깊이 660mm 기준) */}
        <BoxWithEdges
          args={[rightWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[rightXOffset, 0, -rightDepth/2 + backPanelThickness/2 + mmToThreeUnits(17) + (leftDepth - rightDepth) / 2]}
          material={material}
          renderMode={useSpace3DView().renderMode}
          isDragging={isDragging}
        />
      </>
      
      {/* 드래그 중이 아닐 때만 비대칭 섹션 렌더링 */}
      {!isDragging && renderAsymmetricSections()}
      
      {/* 도어 렌더링 */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width} // 커버도어용 너비 우선 사용
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={0} // 이미 FurnitureItem에서 절대 좌표로 배치했으므로 0
          isDragging={isDragging}
        />
      )}
    </group>
  );
};

export default DualType5; 