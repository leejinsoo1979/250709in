import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
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

  // 2D 모드용 투명 재질
  const transparentMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
  }), []);

  const finalMaterial = material || defaultMaterial;

  // 2D 모드에서는 투명 재질 사용, 3D 모드에서는 기본 재질 사용
  const meshMaterial = viewMode === '2D' ? transparentMaterial : finalMaterial;

  // 엣지 라인 색상
  const edgeColor = useMemo(() => {
    if (viewMode === '3D') {
      return '#505050';
    }
    // 2D 모드
    return view2DTheme === 'dark' ? '#FFFFFF' : '#808080';
  }, [viewMode, view2DTheme]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 상단 플레이트 (64×64mm, 두께 7mm) - 윗면이 가구 바닥판 아래에 부착 */}
      <mesh position={[0, -plateHeight / 2, 0]}>
        <boxGeometry args={[plateWidth, plateHeight, plateWidth]} />
        <primitive object={meshMaterial} />
      </mesh>

      {/* 원통형 발통 (지름 56mm) - 플레이트 아래에 위치 */}
      <mesh position={[0, -plateHeight - cylinderHeight / 2, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[cylinderRadius, cylinderRadius, cylinderHeight, 32]} />
        <primitive object={meshMaterial} />
      </mesh>

      {/* 라인 렌더링 */}
      {viewMode === '2D' ? (
        // 2D 모드: 원통 간소화 (상/하 원 + 세로선 4개)
        <>
          {/* 플레이트 상단면 외곽선 */}
          <lineSegments name="adjustable-foot-plate" position={[0, -plateHeight / 2, 0]}>
            <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(plateWidth, plateHeight, plateWidth)]} />
            <lineBasicMaterial attach="material" color={edgeColor} opacity={0.4} transparent />
          </lineSegments>

          {/* 원통 상단 원 */}
          <Line
            name="adjustable-foot-cylinder-top"
            points={(() => {
              const segments = 32;
              const points: [number, number, number][] = [];
              const y = -plateHeight;
              for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = Math.cos(angle) * cylinderRadius;
                const z = Math.sin(angle) * cylinderRadius;
                points.push([x, y, z]);
              }
              return points;
            })()}
            color={edgeColor}
            lineWidth={1}
          />

          {/* 원통 하단 원 */}
          <Line
            name="adjustable-foot-cylinder-bottom"
            points={(() => {
              const segments = 32;
              const points: [number, number, number][] = [];
              const y = -plateHeight - cylinderHeight;
              for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = Math.cos(angle) * cylinderRadius;
                const z = Math.sin(angle) * cylinderRadius;
                points.push([x, y, z]);
              }
              return points;
            })()}
            color={edgeColor}
            lineWidth={1}
          />

          {/* 세로선 16개 (22.5도 간격) */}
          {Array.from({ length: 16 }, (_, i) => i * 22.5).map((angle) => {
            const radian = (angle * Math.PI) / 180;
            const x = Math.cos(radian) * cylinderRadius;
            const z = Math.sin(radian) * cylinderRadius;
            return (
              <Line
                key={angle}
                name={`adjustable-foot-vertical-${angle}`}
                points={[
                  [x, -plateHeight, z],
                  [x, -plateHeight - cylinderHeight, z]
                ]}
                color={edgeColor}
                lineWidth={1}
              />
            );
          })}
        </>
      ) : renderMode === 'wireframe' ? (
        // 3D wireframe 모드: 원통 형태 유지
        <>
          <lineSegments name="adjustable-foot-plate-wireframe" position={[0, -plateHeight / 2, 0]}>
            <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(plateWidth, plateHeight, plateWidth)]} />
            <lineBasicMaterial attach="material" color={edgeColor} opacity={0.4} transparent />
          </lineSegments>
          <lineSegments name="adjustable-foot-cylinder-wireframe" position={[0, -plateHeight - cylinderHeight / 2, 0]}>
            <edgesGeometry attach="geometry" args={[new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 32)]} />
            <lineBasicMaterial attach="material" color={edgeColor} opacity={0.4} transparent />
          </lineSegments>
        </>
      ) : null}
    </group>
  );
};

export default AdjustableFoot;
