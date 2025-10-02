import React from 'react';
import * as THREE from 'three';

interface AdjustableFootProps {
  position: [number, number, number];
  material?: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  baseHeight?: number; // 받침대 높이 (mm)
}

/**
 * 조절발통 컴포넌트
 * - 상단 플레이트: 64×64mm 정사각형, 두께 7mm
 * - 원통형 발통: 지름 56mm
 */
export const AdjustableFoot: React.FC<AdjustableFootProps> = ({
  position,
  material,
  renderMode = 'solid',
  isHighlighted = false,
  baseHeight = 65, // 기본값 65mm
}) => {
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 플레이트 크기
  const plateWidth = mmToThreeUnits(64);
  const plateHeight = mmToThreeUnits(7);
  
  // 원통 크기
  const cylinderRadius = mmToThreeUnits(56) / 2; // 지름 56mm
  // 전체 발통 높이 = 받침대 높이
  // 실린더 높이 = 받침대 높이 - 플레이트 두께(7mm)
  const cylinderHeight = mmToThreeUnits(baseHeight - 7);
  
  // 기본 재질
  const defaultMaterial = new THREE.MeshStandardMaterial({
    color: isHighlighted ? '#ff9800' : '#808080',
    metalness: 0.5,
    roughness: 0.5,
  });
  
  const finalMaterial = material || defaultMaterial;
  
  return (
    <group position={position}>
      {/* 상단 플레이트 (64×64mm, 두께 7mm) - 윗면이 가구 바닥판 아래에 부착 */}
      <mesh position={[0, -plateHeight / 2, 0]}>
        <boxGeometry args={[plateWidth, plateHeight, plateWidth]} />
        <primitive object={finalMaterial} />
      </mesh>
      
      {/* 원통형 발통 (지름 56mm) - 플레이트 아래에 위치 */}
      <mesh position={[0, -plateHeight - cylinderHeight / 2, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[cylinderRadius, cylinderRadius, cylinderHeight, 32]} />
        <primitive object={finalMaterial} />
      </mesh>
      
      {renderMode === 'wireframe' && (
        <>
          {/* 플레이트 외곽선 */}
          <lineSegments position={[0, -plateHeight / 2, 0]}>
            <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(plateWidth, plateHeight, plateWidth)]} />
            <lineBasicMaterial attach="material" color="#000000" />
          </lineSegments>
          
          {/* 원통 외곽선 */}
          <lineSegments position={[0, -plateHeight - cylinderHeight / 2, 0]}>
            <edgesGeometry attach="geometry" args={[new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 32)]} />
            <lineBasicMaterial attach="material" color="#000000" />
          </lineSegments>
        </>
      )}
    </group>
  );
};

export default AdjustableFoot;
