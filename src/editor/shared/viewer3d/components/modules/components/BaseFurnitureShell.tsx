import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';

// 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  isInternalSurface?: boolean; // 내부 표면 여부
}> = ({ args, position, material, renderMode, isInternalSurface = false }) => {
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  
  const { viewMode } = useSpace3DView();
  
  // 진짜 물리적 그림자를 위한 원래 재질 사용 (내부 표면도 동일)
  const processedMaterial = useMemo(() => {
    if (isInternalSurface && material instanceof THREE.MeshStandardMaterial) {
      const innerMaterial = material.clone();
      
      // 색상 조작 없이 원래 색상 유지 - 물리적 그림자만 의존
      // innerMaterial.color는 원래 색상 그대로 유지
      
      // 자체발광 완전 제거 (순수 그림자 의존)
      innerMaterial.emissive = new THREE.Color(0x000000);
      
      // 그림자 수신 최적화 - 바닥판은 특히 그림자를 잘 받아야 함
      innerMaterial.roughness = 0.8;  // 더 거칠게 하여 그림자 수신 강화
      
      // 환경맵 완전 제거
      innerMaterial.envMapIntensity = 0.0;
      
      return innerMaterial;
    }
    
    // 2D 모드에서 솔리드 렌더링 시 투명도 적용
    if (material instanceof THREE.MeshStandardMaterial) {
      if (viewMode === '2D' && renderMode === 'solid') {
        const transparentMaterial = material.clone();
        transparentMaterial.transparent = true;
        transparentMaterial.opacity = 0.5;
        return transparentMaterial;
      }
    }
    
    return material;
  }, [material, isInternalSurface, renderMode, viewMode]);

  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh geometry={geometry} receiveShadow={viewMode === '3D'} castShadow={viewMode === '3D'}>
          <primitive object={processedMaterial} />
        </mesh>
      )}
      {/* 윤곽선 렌더링 */}
      {((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial 
            color={renderMode === 'wireframe' ? "#333333" : "#888888"} 
            linewidth={1} 
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
  children
}) => {
  const { renderMode } = useSpace3DView(); // context에서 renderMode 가져오기
  
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
                />
                
                {/* 오른쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                />
                
                {/* 중간 구분 패널 (마지막 섹션 제외) */}
                {index < getSectionHeights().length - 1 && (
                  <BoxWithEdges
                    args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                    position={[0, sectionCenterY + sectionHeight/2 + basicThickness/2, basicThickness/2 + shelfZOffset]}
                    material={material}
                    renderMode={renderMode}
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
          />
          
          {/* 오른쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[width/2 - basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
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
      />
      
      {/* 하단 판재 - 내부 표면으로 처리 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, -height/2 + basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isInternalSurface={true}
      />
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) - 내부 표면으로 처리 */}
      <BoxWithEdges
        args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
        position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
        material={material}
        renderMode={renderMode}
        isInternalSurface={true}
      />
      
      {/* 내부 구조 (타입별로 다른 내용) */}
      {children}
    </group>
  );
};

export default BaseFurnitureShell; 