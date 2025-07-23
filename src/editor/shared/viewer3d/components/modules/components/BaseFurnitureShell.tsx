import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useThree } from '@react-three/fiber';

// 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  isInternalSurface?: boolean; // 내부 표면 여부
  isDragging?: boolean; // 드래그 상태
}> = ({ args, position, material, renderMode, isInternalSurface = false, isDragging = false }) => {
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  
  const { viewMode } = useSpace3DView();
  const { gl } = useThree();
  
  // BoxWithEdges 컴포넌트의 그림자 업데이트 - 빈도 제한
  useEffect(() => {
    if (viewMode === '3D' && gl && gl.shadowMap && !gl.shadowMap.autoUpdate) {
      const timeoutId = setTimeout(() => {
        if (gl.shadowMap) {
          gl.shadowMap.needsUpdate = true;
        }
      }, 50); // 50ms 디바운스
      
      return () => clearTimeout(timeoutId);
    }
  }, [viewMode, gl]);
  
  // 재질 처리 - 드래그 중일 때 고스트 효과 적용
  const processedMaterial = useMemo(() => {
    console.log('🔧 BaseFurnitureShell - isDragging:', isDragging, 'isInternalSurface:', isInternalSurface, 'material.map:', material instanceof THREE.MeshStandardMaterial ? material.map : 'N/A');
    
    // 드래그 중일 때 연두색 투명 고스트 효과
    if (isDragging && material instanceof THREE.MeshStandardMaterial) {
      const ghostMaterial = material.clone();
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = 0.6;
      ghostMaterial.color = new THREE.Color(0x90EE90); // 연두색
      ghostMaterial.needsUpdate = true;
      return ghostMaterial;
    }
    
    if (isInternalSurface && material instanceof THREE.MeshStandardMaterial) {
      console.log('🎯 내부 표면 재질 처리 - 원본 텍스처:', material.map);
      // 복제하지 말고 원본 재질을 그대로 사용 (텍스처 유지)
      return material;
    }
    
    // 2D 모드에서 솔리드 렌더링 시 투명도 적용
    if (material instanceof THREE.MeshStandardMaterial) {
      if (viewMode === '2D' && renderMode === 'solid') {
        const transparentMaterial = material.clone();
        // 텍스처와 모든 속성 복사
        transparentMaterial.map = material.map;
        transparentMaterial.color = material.color.clone();
        transparentMaterial.normalMap = material.normalMap;
        transparentMaterial.roughnessMap = material.roughnessMap;
        transparentMaterial.metalnessMap = material.metalnessMap;
        transparentMaterial.transparent = true;
        transparentMaterial.opacity = 0.5;
        transparentMaterial.needsUpdate = true;
        return transparentMaterial;
      }
    }
    
    return material;
  }, [material, isInternalSurface, renderMode, viewMode, isDragging]);

  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh 
          geometry={geometry} 
          receiveShadow={viewMode === '3D'} 
          castShadow={viewMode === '3D'}
          renderOrder={isInternalSurface ? 1 : 0}
        >
          <primitive object={processedMaterial} />
        </mesh>
      )}
      {/* 윤곽선 렌더링 - 3D에서 더 강력한 렌더링 */}
      {viewMode === '3D' ? (
        <lineSegments 
          geometry={edgesGeometry}
          renderOrder={999}
        >
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
        <lineSegments 
          geometry={edgesGeometry}
          renderOrder={1000}
        >
          <lineBasicMaterial 
            color={renderMode === 'wireframe' ? "#333333" : "#888888"} 
            linewidth={1}
            depthTest={false}
            transparent={false}
            opacity={1.0}
          />
        </lineSegments>
      )}
    </group>
  );
};

// BaseFurnitureShell Props 인터페이스
interface BaseFurnitureShellProps {
  // 치수 관련
  width: number;
  height: number;
  depth: number;
  innerWidth: number;
  innerHeight: number;
  
  // 계산된 값들
  basicThickness: number;
  backPanelThickness: number;
  adjustedDepthForShelves: number;
  shelfZOffset: number;
  
  // 재질
  material: THREE.Material;
  
  // 헬퍼 함수들
  isMultiSectionFurniture: () => boolean;
  getSectionHeights: () => number[];
  mmToThreeUnits: (mm: number) => number;
  
  // 드래그 상태
  isDragging?: boolean;
  
  // 자식 컴포넌트 (내부 구조)
  children?: React.ReactNode;
}

/**
 * BaseFurnitureShell 컴포넌트
 * - 가구의 기본 구조 (측면판, 상하판, 백패널) 렌더링
 * - 타입별 컴포넌트들이 공통으로 사용하는 기본 쉘
 * - 내부 구조는 children으로 전달받아 렌더링
 */
const BaseFurnitureShell: React.FC<BaseFurnitureShellProps> = ({
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
  isMultiSectionFurniture,
  getSectionHeights,
  mmToThreeUnits,
  isDragging = false,
  children
}) => {
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  
  // BaseFurnitureShell을 사용하는 가구들의 그림자 업데이트 - 제거
  // 그림자 자동 업데이트가 활성화되어 있으므로 수동 업데이트 불필요
  
  return (
    <group>
      {/* 좌우 측면 판재 */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {getSectionHeights().map((sectionHeight: number, index: number) => {
            let currentYPosition = -height/2 + basicThickness;
            
            // 현재 섹션까지의 Y 위치 계산
            for (let i = 0; i < index; i++) {
              currentYPosition += getSectionHeights()[i];
            }
            
            const sectionCenterY = currentYPosition + sectionHeight / 2 - basicThickness; // 18mm 아래로 내려서 바닥면부터 시작
            
            return (
              <React.Fragment key={`side-panels-${index}`}>
                {/* 왼쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[-width/2 + basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                />
                
                {/* 오른쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
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
      
      {/* 상단 판재 - 내부 표면으로 처리 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, height/2 - basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isInternalSurface={true}
        isDragging={isDragging}
      />
      
      {/* 하단 판재 - 내부 표면으로 처리 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, -height/2 + basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isInternalSurface={true}
        isDragging={isDragging}
      />
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) - 내부 표면으로 처리 */}
      <BoxWithEdges
        args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
        position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
        material={material}
        renderMode={renderMode}
        isInternalSurface={true}
        isDragging={isDragging}
      />
      
      {/* 내부 구조 (타입별로 다른 내용) */}
      {children}
    </group>
  );
};

export default BaseFurnitureShell; 