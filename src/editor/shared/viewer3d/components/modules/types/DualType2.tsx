import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from "@/contexts/ThemeContext";
import DoorModule from '../DoorModule';

// 독립적인 엣지 표시를 위한 박스 컴포넌트
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
        if (typeof window !== 'undefined') {
          const computedStyle = getComputedStyle(document.documentElement);
          const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
          if (primaryColor) {
            return primaryColor;
          }
        }
        return '#10b981'; // 기본값 (green)
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
    mmToThreeUnits,
    isMultiSectionFurniture,
    getSectionHeights
  } = baseFurniture;

  const { renderMode } = useSpace3DView();

  return (
    <group>
      {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {getSectionHeights().map((sectionHeight: number, index: number) => {
            let currentYPosition = -height/2 + basicThickness;
            
            // 현재 섹션까지의 Y 위치 계산
            for (let i = 0; i < index; i++) {
              currentYPosition += getSectionHeights()[i];
            }
            
            const sectionCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
            
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
                />
                
                {/* 오른쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                />
                
                {/* 중간 구분 패널 (마지막 섹션 제외) */}
                {index < getSectionHeights().length - 1 && (
                  <BoxWithEdges
                    args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                    position={[0, sectionCenterY + sectionHeight/2 + basicThickness/2, basicThickness/2 + shelfZOffset]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                  />
                )}
              </React.Fragment>
            );
          })}
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
          />
          
          {/* 오른쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[width/2 - basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
          />
        </>
      )}
      
      {/* 상단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, height/2 - basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
      />
      
      {/* 하단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, -height/2 + basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
      />
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) */}
      <BoxWithEdges
        args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
        position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
      />
      
      {/* 드래그 중이 아닐 때만 내부 구조 렌더링 */}
      {!isDragging && (
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
          renderMode={renderMode}
        />
      )}
      
      {/* 도어는 항상 렌더링 (가구 식별에 중요) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={0} // 이미 FurnitureItem에서 절대 좌표로 배치했으므로 0
          isDragging={isDragging}
          isEditMode={isEditMode}
        />
      )}
    </group>
  );
};

export default DualType2; 