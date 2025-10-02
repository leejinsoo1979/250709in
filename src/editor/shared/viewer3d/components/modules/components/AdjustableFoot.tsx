import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';

interface AdjustableFootProps {
  position: [number, number, number];
  rotation?: number; // Y축 회전 (라디안)
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
  rotation = 0, // 기본값 0 (회전 없음)
  material,
  renderMode = 'solid',
  isHighlighted = false,
  baseHeight = 65, // 기본값 65mm
}) => {
  const { viewMode } = useSpace3DView();
  const { view2DTheme } = useUIStore();
  
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 플레이트 크기
  const plateWidth = mmToThreeUnits(64);
  const plateHeight = mmToThreeUnits(7);
  
  // 원통 크기
  const cylinderRadius = mmToThreeUnits(56) / 2; // 지름 56mm
  // 전체 발통 높이 = 받침대 높이
  // 실린더 높이 = 받침대 높이 - 플레이트 두께(7mm)
  const cylinderHeight = mmToThreeUnits(baseHeight - 7);
  
  // 발통 색상: 3D는 검정색, 2D는 테마에 따라
  const footColor = useMemo(() => {
    if (viewMode === '3D') {
      return '#000000'; // 3D: 항상 검정색
    }
    // 2D 모드
    return view2DTheme === 'dark' ? '#FFFFFF' : '#808080'; // 다크모드: 흰색, 라이트모드: 회색
  }, [viewMode, view2DTheme]);
  
  // 기본 재질
  const defaultMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: isHighlighted ? '#ff9800' : footColor,
    metalness: 0.5,
    roughness: 0.5,
  }), [isHighlighted, footColor]);
  
  const finalMaterial = material || defaultMaterial;
  
  return (
    <group position={position} rotation={[0, rotation, 0]}>
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
