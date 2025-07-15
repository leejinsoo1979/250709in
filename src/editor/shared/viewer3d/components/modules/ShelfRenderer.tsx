import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';

// 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
}> = ({ args, position, material, renderMode }) => {
  // 진짜 물리적 그림자를 위한 원래 재질 사용
  const createInnerMaterial = (originalMaterial: THREE.Material) => {
    const { viewMode } = useSpace3DView();
    
    if (originalMaterial instanceof THREE.MeshStandardMaterial) {
      console.log('📚 ShelfRenderer - 원본 텍스처:', originalMaterial.map);
      
      // 2D 모드에서 솔리드 렌더링 시 투명도 적용이 필요한 경우에만 복제
      if (viewMode === '2D' && renderMode === 'solid') {
        const transparentMaterial = originalMaterial.clone();
        // 텍스처와 모든 속성 복사
        transparentMaterial.map = originalMaterial.map;
        transparentMaterial.color = originalMaterial.color.clone();
        transparentMaterial.normalMap = originalMaterial.normalMap;
        transparentMaterial.roughnessMap = originalMaterial.roughnessMap;
        transparentMaterial.metalnessMap = originalMaterial.metalnessMap;
        transparentMaterial.transparent = true;
        transparentMaterial.opacity = 0.5;
        transparentMaterial.needsUpdate = true;
        return transparentMaterial;
      }
      
      // 다른 경우에는 원본 재질을 그대로 사용 (텍스처 유지)
      return originalMaterial;
    }
    return material;
  };

  const innerMaterial = createInnerMaterial(material);
  const { viewMode } = useSpace3DView();

  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh receiveShadow={viewMode === '3D'} castShadow={viewMode === '3D'}>
          <boxGeometry args={args} />
          <primitive object={innerMaterial} />
        </mesh>
      )}
      {/* 윤곽선 렌더링 */}
      {((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color={renderMode === 'wireframe' ? "#333333" : "#888888"} 
            linewidth={1} 
          />
        </lineSegments>
      )}
    </group>
  );
};

interface ShelfRendererProps {
  shelfCount: number;
  innerWidth: number;
  innerHeight: number;
  depth: number;
  basicThickness: number;
  material: THREE.Material;
  yOffset?: number; // 전체 선반 그룹의 Y축 오프셋
  zOffset?: number; // 선반의 Z축 위치 조정 (백패널 전진 대응)
  // 절대 위치 지정 (DrawerRenderer 스타일)
  shelfPositions?: number[]; // 각 선반의 Y 위치 (mm, 섹션 하단 기준)
  isTopFinishPanel?: boolean; // 최상단 마감 패널 여부
  renderMode: 'solid' | 'wireframe'; // 렌더 모드 추가
}

/**
 * ShelfRenderer 컴포넌트 (범용적으로 개선)
 * 
 * 임의의 선반 개수에 대응하여 선반을 렌더링합니다.
 * yOffset을 통해 특정 구역(section) 내에서 위치 조정 가능합니다.
 */
export const ShelfRenderer: React.FC<ShelfRendererProps> = ({
  shelfCount,
  innerWidth,
  innerHeight,
  depth,
  basicThickness,
  material,
  yOffset = 0,
  zOffset = 0,
  shelfPositions,
  isTopFinishPanel,
  renderMode,
}) => {
  if (shelfCount <= 0) {
    return null;
  }

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // 절대 위치 모드: 마감 패널 또는 절대 위치 지정
  if (isTopFinishPanel && shelfCount === 1) {
    // 최상단 마감 패널 모드
    const topPosition = innerHeight / 2 - basicThickness / 2;
    
    return (
      <group position={[0, yOffset, 0]}>
        <BoxWithEdges
          args={[innerWidth, basicThickness, depth - basicThickness]}
          position={[0, topPosition, basicThickness/2 + zOffset]}
          material={material}
          renderMode={renderMode}
        />
      </group>
    );
  }
  
  if (shelfPositions && shelfPositions.length === shelfCount) {
    // 절대 위치 모드: 지정된 위치에 선반 배치
          return (
        <group position={[0, yOffset, 0]}>
          {shelfPositions.map((positionMm, i) => {
            // 섹션 하단 기준 위치를 Three.js 좌표로 변환
            const relativeYPosition = (-innerHeight / 2) + mmToThreeUnits(positionMm);
            return (
              <BoxWithEdges
                key={`shelf-${i}`}
                args={[innerWidth, basicThickness, depth - basicThickness]}
                position={[0, relativeYPosition, basicThickness/2 + zOffset]}
                material={material}
                renderMode={renderMode}
              />
            );
          })}
        </group>
      );
  }

  // 기존 균등 분할 모드 (하위 호환성)
  const shelfSpacing = innerHeight / (shelfCount + 1);
  
  return (
    <group position={[0, yOffset, 0]}>
      {Array.from({ length: shelfCount }, (_, i) => {
        // 섹션 내에서의 상대적 Y 위치 계산
        const relativeYPosition = (-innerHeight / 2) + shelfSpacing * (i + 1);
        return (
          <BoxWithEdges
            key={`shelf-${i}`}
            args={[innerWidth, basicThickness, depth - basicThickness]}
            position={[0, relativeYPosition, basicThickness/2 + zOffset]}
            material={material}
            renderMode={renderMode}
          />
        );
      })}
    </group>
  );
};

export default ShelfRenderer; 