import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import {
  PANEL_SIMULATION_ASSEMBLY_DELAY_STEP,
  PANEL_SIMULATION_DURATION,
  PANEL_SIMULATION_FURNITURE_SPAN
} from '../../../utils/panelSimulationMotion';
import { getPanelSimulationSourceRegistryVersion, removePanelSimulationSource, updatePanelSimulationSource } from '../../../utils/panelSimulationRegistry';

interface AdjustableFootProps {
  position: [number, number, number];
  rotation?: number; // Y축 회전 (라디안)
  material?: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  baseHeight?: number; // 받침대 높이 (mm)
  furnitureId?: string;
  panelName?: string;
}

const getFootAssemblySequence = (
  furnitureId: string | undefined,
  localPosition: [number, number, number],
  parent?: THREE.Object3D | null
) => {
  const modules = useFurnitureStore.getState().placedModules;
  const sortedIds = [...modules]
    .sort((a, b) => {
      const aSlot = typeof a.slotIndex === 'number' ? a.slotIndex : Number.POSITIVE_INFINITY;
      const bSlot = typeof b.slotIndex === 'number' ? b.slotIndex : Number.POSITIVE_INFINITY;
      if (aSlot !== bSlot) return aSlot - bSlot;
      return (a.position?.x || 0) - (b.position?.x || 0);
    })
    .map(module => module.id);
  const furnitureIndex = furnitureId ? Math.max(0, sortedIds.indexOf(furnitureId)) : 0;
  const worldPosition = new THREE.Vector3(localPosition[0], localPosition[1], localPosition[2]);
  if (parent) parent.localToWorld(worldPosition);
  const localOrder = Math.min(80, Math.max(0, Math.round(
    (worldPosition.x + 50) * 0.3 +
    (worldPosition.z + 50) * 0.18
  )));
  return furnitureIndex * PANEL_SIMULATION_FURNITURE_SPAN + localOrder;
};

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
  furnitureId,
  panelName,
}) => {
  const groupRef = React.useRef<THREE.Group>(null);
  const simulationStartTimeRef = React.useRef(0);
  const { panelSimulationPhase, panelSimulationRevision } = useUIStore();
  const simulationRevisionRef = React.useRef(panelSimulationRevision);
  const assemblySourceSignatureRef = React.useRef<string | null>(null);
  const { viewMode } = useSpace3DView();
  const { view2DTheme, view2DDirection } = useUIStore();
  const registryKey = furnitureId && panelName ? `accessory::${furnitureId}::${panelName}` : null;
  
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

  React.useEffect(() => {
    return () => {
      if (registryKey) removePanelSimulationSource(registryKey);
      assemblySourceSignatureRef.current = null;
    };
  }, [registryKey]);

  useFrame(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    if (viewMode === '3D' && furnitureId && panelName && registryKey && panelSimulationRevision > 0) {
      const sourceArgs: [number, number, number] = [plateWidth, mmToThreeUnits(baseHeight), plateWidth];
      const signature = `${getPanelSimulationSourceRegistryVersion()}:${panelSimulationRevision}:${panelSimulationPhase}:${registryKey}:${sourceArgs.join(',')}`;
      if (assemblySourceSignatureRef.current !== signature) {
        updatePanelSimulationSource({
          key: registryKey,
          furnitureId,
          panelName,
          args: sourceArgs,
          object: group,
          material: finalMaterial,
          assemblyOnly: true,
          shape: 'adjustableFoot',
        });
        assemblySourceSignatureRef.current = signature;
      }
      group.visible = false;
      return;
    }
    if (panelSimulationPhase === 'layout') {
      groupRef.current.visible = false;
      return;
    }
    if (groupRef.current.visible === false) {
      groupRef.current.visible = true;
    }
    if (viewMode !== '3D' || !furnitureId || !panelName || panelSimulationRevision <= 0) {
      groupRef.current.position.set(position[0], position[1], position[2]);
      groupRef.current.quaternion.identity();
      groupRef.current.scale.set(1, 1, 1);
      return;
    }

    if (simulationRevisionRef.current !== panelSimulationRevision) {
      simulationRevisionRef.current = panelSimulationRevision;
      simulationStartTimeRef.current = performance.now() / 1000;
      if (panelSimulationPhase === 'assembled') {
        group.visible = true;
        group.position.set(position[0], position[1] + 1.35, position[2] + 0.45);
        group.scale.set(1, 1, 1);
      }
    }
    const parent = group.parent;
    let targetPosition = new THREE.Vector3(position[0], position[1], position[2]);
    let targetScale = 1;

    const order = getFootAssemblySequence(furnitureId, position, parent);
    const elapsed = performance.now() / 1000 - simulationStartTimeRef.current - order * PANEL_SIMULATION_ASSEMBLY_DELAY_STEP;
    if (elapsed < 0) {
      group.visible = true;
      return;
    }
    if (group.visible === false) {
      group.visible = true;
    }
    const t = Math.min(1, elapsed / PANEL_SIMULATION_DURATION);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    group.position.lerp(targetPosition, eased * 0.18);
    group.quaternion.slerp(new THREE.Quaternion(), eased * 0.18);
    group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), eased * 0.18);
  });

  // 2D 모드에서는 투명 재질 사용, 3D 모드에서는 기본 재질 사용
  const meshMaterial = viewMode === '2D' ? transparentMaterial : finalMaterial;

  // 엣지 라인 색상 (정면뷰: 걸래받이 뒤이므로 흐리게)
  const footDepthOpacity = viewMode === '2D' && view2DDirection === 'front' ? 0.05 : 1.0;
  const edgeColor = useMemo(() => {
    if (viewMode === '3D') {
      return '#505050';
    }
    const baseColor = view2DTheme === 'dark' ? '#FFFFFF' : '#808080';
    if (footDepthOpacity >= 1.0) return baseColor;
    // 정면뷰에서 배경색과 블렌딩
    const base = new THREE.Color(baseColor);
    const bg = new THREE.Color(view2DTheme === 'dark' ? '#1a1a2e' : '#ffffff');
    bg.lerp(base, footDepthOpacity);
    return '#' + bg.getHexString();
  }, [viewMode, view2DTheme, footDepthOpacity]);

  return (
    <group ref={groupRef} position={position} rotation={[0, rotation, 0]}>
      {/* 상단 플레이트 (64×64mm, 두께 7mm) - 윗면이 가구 바닥판 아래에 부착 */}
      {/* DXF 내보내기를 위해 mesh에도 이름 추가 */}
      {renderMode !== 'wireframe' && (
        <mesh name="adjustable-foot-plate-mesh" position={[0, -plateHeight / 2, 0]}>
          <boxGeometry args={[plateWidth, plateHeight, plateWidth]} />
          <primitive object={meshMaterial} />
        </mesh>
      )}

      {/* 원통형 발통 (지름 56mm) - 플레이트 아래에 위치 */}
      {renderMode !== 'wireframe' && (
        <mesh name="adjustable-foot-cylinder-mesh" position={[0, -plateHeight - cylinderHeight / 2, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[cylinderRadius, cylinderRadius, cylinderHeight, 32]} />
          <primitive object={meshMaterial} />
        </mesh>
      )}

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
            <lineBasicMaterial attach="material" color="#333333" />
          </lineSegments>
          <lineSegments name="adjustable-foot-cylinder-wireframe" position={[0, -plateHeight - cylinderHeight / 2, 0]}>
            <edgesGeometry attach="geometry" args={[new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 32)]} />
            <lineBasicMaterial attach="material" color="#333333" />
          </lineSegments>
        </>
      ) : null}
    </group>
  );
};

export default AdjustableFoot;
