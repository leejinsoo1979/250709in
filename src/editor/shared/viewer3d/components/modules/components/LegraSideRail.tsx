import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

/**
 * 레그라 서랍 측판 (GLB 모델)
 *
 * GLB 모델 세계 좌표 (useGLTF 로드 후, glTF meters 기준):
 *   X: 0 → +0.065m (두께 65mm, 오른쪽 방향)
 *   Y: -0.242m → 0 (높이, 아래 방향으로 펼쳐짐) [SL500 기준]
 *   Z: 0 → +0.494m (깊이, 뒤쪽 방향)
 *
 * 원점 = 상단-전면-좌측 모서리
 *
 * 프로젝트 단위: 0.01 = 1mm
 * glTF meters → project units: × 10
 */

interface LegraSideRailProps {
  /** 서랍 단수: 1 = SL (228mm), 2 = L (164mm) */
  drawerTier: 1 | 2;
  /** 서랍 바닥판 Y 하단 좌표 (Three.js units) */
  drawerBottomY: number;
  /** 서랍 바닥판 두께 (Three.js units) */
  drawerBottomThickness: number;
  /** 뒷판 높이 (Three.js units) - 레그라 높이 스케일 기준 */
  backPanelHeight: number;
  /** 서랍 앞면 Z 좌표 (Three.js units) */
  drawerFrontZ: number;
  /** 캐비넷 측판 안쪽면 X 좌표 (Three.js units, 양수) */
  sidePanelInnerX: number;
}

// GLB 모델 원본 높이 (mm) - 높이 스케일 계산용
const MODEL_HEIGHT_MM = { SL: 241.70, L: 177.70 };

// glTF meters → project units 변환 계수
const GLTF_SCALE = 10;

/**
 * 클론된 씬에서 메시가 없는 불필요한 노드 제거 (Active View 등)
 */
function cleanClone(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);
  const toRemove: THREE.Object3D[] = [];
  clone.traverse((child) => {
    if (child.name === 'Active View') {
      toRemove.push(child);
    }
  });
  toRemove.forEach((node) => node.parent?.remove(node));
  return clone;
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

  const { leftClone, rightClone } = useMemo(() => ({
    leftClone: cleanClone(scene),
    rightClone: cleanClone(scene),
  }), [scene]);

  const { scaleL, scaleR, posL, posR } = useMemo(() => {
    const originalH = drawerTier === 1 ? MODEL_HEIGHT_MM.SL : MODEL_HEIGHT_MM.L;
    const targetH = backPanelHeight / 0.01; // Three.js units → mm
    const hScale = targetH / originalH;

    const sx = GLTF_SCALE;
    const sy = GLTF_SCALE * hScale; // 높이 방향만 스케일
    const sz = GLTF_SCALE;

    // Y: 모델 원점=상단 → 뒷판 상단에 배치
    const bottomPanelTop = drawerBottomY + drawerBottomThickness / 2;
    const topY = bottomPanelTop + backPanelHeight;

    // Z: 모델이 Z+ 방향(뒤쪽)으로 펼쳐짐 → 서랍 앞면에 배치
    const z = drawerFrontZ;

    return {
      scaleL: new THREE.Vector3(sx, sy, sz),
      scaleR: new THREE.Vector3(-sx, sy, sz), // X 미러링
      posL: new THREE.Vector3(-sidePanelInnerX, topY, z),
      posR: new THREE.Vector3(sidePanelInnerX, topY, z),
    };
  }, [drawerTier, drawerBottomY, drawerBottomThickness, backPanelHeight, drawerFrontZ, sidePanelInnerX]);

  return (
    <>
      <primitive object={leftClone} position={posL} scale={scaleL} />
      <primitive object={rightClone} position={posR} scale={scaleR} />
    </>
  );
};

useGLTF.preload('/models/Legra_SL500.glb');
useGLTF.preload('/models/Legra_L500.glb');

export default LegraSideRail;
