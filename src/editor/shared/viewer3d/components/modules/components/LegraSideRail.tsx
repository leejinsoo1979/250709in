import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

/**
 * 레그라 서랍 측판 (GLB 모델)
 *
 * 바운딩박스 기반 위치 보정:
 * - GLB scene 로드 후 실제 바운딩박스를 측정
 * - 뒷판 Y 위치에 맞춰 하단 정렬
 * - 서랍 앞면 Z에 맞춰 전면 정렬
 * - 캐비넷 측판 안쪽면 X에 밀착 배치
 */

interface LegraSideRailProps {
  drawerTier: 1 | 2;
  /** 서랍 바닥판 하단 Y (Three.js units) */
  drawerBottomY: number;
  /** 서랍 바닥판 두께 (Three.js units) */
  drawerBottomThickness: number;
  /** 뒷판 높이 (Three.js units) */
  backPanelHeight: number;
  /** 서랍 앞면 Z (Three.js units) */
  drawerFrontZ: number;
  /** 캐비넷 측판 안쪽면 X (양수, Three.js units) */
  sidePanelInnerX: number;
}

// glTF meters → project units (0.01 = 1mm)
const GLTF_SCALE = 10;

function cleanClone(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);
  const toRemove: THREE.Object3D[] = [];
  clone.traverse((child) => {
    if (child.name === 'Active View') toRemove.push(child);
  });
  toRemove.forEach((node) => node.parent?.remove(node));
  return clone;
}

/**
 * 스케일이 적용된 scene의 바운딩박스를 계산
 */
function getScaledBounds(obj: THREE.Object3D, scale: THREE.Vector3): THREE.Box3 {
  // 임시로 스케일 적용 → 바운딩박스 측정 → 복원
  const tempGroup = new THREE.Group();
  tempGroup.add(obj);
  tempGroup.scale.copy(scale);
  tempGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tempGroup);
  tempGroup.remove(obj);
  return box;
}

const LegraSideRail: React.FC<LegraSideRailProps> = ({
  drawerTier,
  drawerBottomY,
  drawerBottomThickness,
  backPanelHeight,
  drawerFrontZ,
  sidePanelInnerX,
}) => {
  const modelPath = drawerTier === 1 ? '/models/Legra_SL500.glb' : '/models/Legra_L500.glb';
  const { scene } = useGLTF(modelPath);

  const { leftClone, rightClone, leftScale, rightScale, leftPos, rightPos } = useMemo(() => {
    const left = cleanClone(scene);
    const right = cleanClone(scene);

    // 원본 크기 유지 — glTF meters → project units 변환만 적용
    const lScale = new THREE.Vector3(GLTF_SCALE, GLTF_SCALE, GLTF_SCALE);
    const rScale = new THREE.Vector3(-GLTF_SCALE, GLTF_SCALE, GLTF_SCALE); // X 미러링

    // 바운딩박스 측정 (스케일 적용 상태)
    const leftBox = getScaledBounds(left, lScale);
    const rightBox = getScaledBounds(right, rScale);

    // GLB 모델 높이가 서랍 높이보다 13.7mm 큼 (레일 마운트 돌출부)
    // 레그라 상단을 서랍 상단에 맞추려면 13.7mm 아래로 오프셋
    const RAIL_MOUNT_OVERHANG = 13.7 * 0.01; // 13.7mm → Three.js units
    const targetMinY = drawerBottomY - RAIL_MOUNT_OVERHANG;

    // 왼쪽: 하단을 뒷판 하단에, 좌측면을 캐비넷 측판 안쪽에, Z앞면을 서랍 앞면에
    const lPos = new THREE.Vector3(
      -sidePanelInnerX - leftBox.min.x, // 모델 min.x를 -sidePanelInnerX로
      targetMinY - leftBox.min.y,        // 모델 min.y를 바닥판 윗면으로
      drawerFrontZ - leftBox.max.z,      // 모델 max.z를 서랍 앞면으로
    );

    // 오른쪽 (X 미러): max.x를 +sidePanelInnerX로
    const rPos = new THREE.Vector3(
      sidePanelInnerX - rightBox.max.x,
      targetMinY - rightBox.min.y,
      drawerFrontZ - rightBox.max.z,
    );

    return {
      leftClone: left,
      rightClone: right,
      leftScale: lScale,
      rightScale: rScale,
      leftPos: lPos,
      rightPos: rPos,
    };
  }, [scene, drawerTier, drawerBottomY, drawerBottomThickness, backPanelHeight, drawerFrontZ, sidePanelInnerX]);

  return (
    <>
      <group position={leftPos}>
        <primitive object={leftClone} scale={leftScale} />
      </group>
      <group position={rightPos}>
        <primitive object={rightClone} scale={rightScale} />
      </group>
    </>
  );
};

useGLTF.preload('/models/Legra_SL500.glb');
useGLTF.preload('/models/Legra_L500.glb');

export default LegraSideRail;
