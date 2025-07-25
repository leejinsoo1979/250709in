import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';

// 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
}> = ({ args, position, material, renderMode }) => {
  const { theme } = useTheme();
  // 진짜 물리적 그림자를 위한 원래 재질 사용 (서랍과 동일)
  const createInnerMaterial = (originalMaterial: THREE.Material) => {
    const { viewMode } = useSpace3DView();
    
    if (originalMaterial instanceof THREE.MeshStandardMaterial) {
      // console.log('📚 ShelfRenderer - 원본 텍스처:', originalMaterial.map);
      // 복제하지 말고 원본 재질을 그대로 사용 (텍스처 유지)
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
          {viewMode === '2D' ? (
            <meshStandardMaterial 
              map={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.map : null}
              color={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.color : new THREE.Color('#FFFFFF')}
              transparent={true}
              opacity={0.5}
              metalness={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.metalness : 0.0}
              roughness={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.roughness : 0.6}
              toneMapped={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.toneMapped : true}
              envMapIntensity={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.envMapIntensity : 1.0}
              emissive={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.emissive : new THREE.Color(0x000000)}
            />
          ) : (
            <primitive object={innerMaterial} attach="material" />
          )}
        </mesh>
      )}
      {/* 윤곽선 렌더링 - 3D에서 더 강력한 렌더링 */}
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
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color={renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : (theme?.mode === 'dark' ? "#cccccc" : "#888888")} 
            linewidth={0.5}
            transparent={false}
            opacity={1.0}
            depthTest={false}
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