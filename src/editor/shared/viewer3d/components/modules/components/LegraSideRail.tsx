import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';

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
  drawerTier: number;
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
  /** 서랍 높이(mm) — 제공 시 높이 기반으로 GLB 모델 선택 (228↑ → SL, 그 외 → L) */
  drawerHeightMm?: number;
  /** 렌더 모드 — '2d'일 때 머티리얼을 밝은 단색으로 교체 */
  renderMode?: string;
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
  drawerHeightMm,
  renderMode,
}) => {
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const { theme } = useTheme();
  // drawerHeightMm 제공 시 높이 기반 모델 선택, 미제공 시 기존 tier 기반
  // 228↑ → SL500, 117↓ → M500, 나머지(164 등) → L500
  const modelPath = drawerHeightMm != null
    ? (drawerHeightMm >= 200 ? '/models/Legra%20F500_o.glb'
      : drawerHeightMm <= 120 ? '/models/Legra_M500.glb'
      : '/models/Legra_L500.glb')
    : (drawerTier === 1 ? '/models/Legra%20F500_o.glb' : '/models/Legra_L500.glb');
  const { scene } = useGLTF(modelPath);

  // 2D 측면뷰(left/right) 감지
  const is2DSideView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');
  // 2D 다크 모드 여부 (라이트 모드는 흰색 면, 다크 모드는 라인만)
  const is2DDark = view2DTheme === 'dark' || theme?.mode === 'dark';

  const { leftClone, rightClone, leftScale, rightScale, leftPos, rightPos } = useMemo(() => {
    const left = cleanClone(scene);
    const right = cleanClone(scene);

    // 2D 측면뷰 스타일링
    if (is2DSideView) {
      if (is2DDark) {
        // 다크 모드: 면은 완전 투명 + edges 라인만 흰색 표시
        const invisibleMat = new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const lineMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
        });
        [left, right].forEach((root) => {
          const edgesToAdd: Array<{ parent: THREE.Object3D; edges: THREE.LineSegments }> = [];
          root.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              mesh.material = invisibleMat;
              const edgesGeom = new THREE.EdgesGeometry(mesh.geometry, 30);

              // 모델 전체 높이 기준으로 "전체 높이에 가까운 수직 라인"을 제거
              // (2D 측면뷰에서 모델 바깥 실루엣 역할을 해서 서랍 영역을 가로지르는 선)
              const posAttr = edgesGeom.getAttribute('position');
              const meshBox = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute);
              const meshHeight = meshBox.max.y - meshBox.min.y;
              const kept: number[] = [];
              for (let i = 0; i < posAttr.count; i += 2) {
                const x1 = posAttr.getX(i),     y1 = posAttr.getY(i),     z1 = posAttr.getZ(i);
                const x2 = posAttr.getX(i + 1), y2 = posAttr.getY(i + 1), z2 = posAttr.getZ(i + 1);
                const dx = Math.abs(x2 - x1);
                const dy = Math.abs(y2 - y1);
                const dz = Math.abs(z2 - z1);
                // 순수 Y 방향 세로선이고 길이가 모델 높이의 70% 이상이면 제거 (실루엣 선)
                const isTallVertical = dy > meshHeight * 0.7 && dx < 1e-4 && dz < 1e-4;
                if (!isTallVertical) {
                  kept.push(x1, y1, z1, x2, y2, z2);
                }
              }
              const filteredGeom = new THREE.BufferGeometry();
              filteredGeom.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));

              const lineSeg = new THREE.LineSegments(filteredGeom, lineMat);
              lineSeg.name = 'legra-edges';
              edgesToAdd.push({ parent: mesh, edges: lineSeg });
            }
          });
          edgesToAdd.forEach(({ parent, edges }) => parent.add(edges));
        });
      } else {
        // 라이트 모드: 면만 흰색 단색으로 (실루엣 느낌)
        const whiteMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: false,
        });
        [left, right].forEach((root) => {
          root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = whiteMat;
            }
          });
        });
      }
    }

    // GLB 모델은 원본 크기 그대로 사용
    const yScale = GLTF_SCALE;

    const lScale = new THREE.Vector3(GLTF_SCALE, yScale, GLTF_SCALE);
    const rScale = new THREE.Vector3(-GLTF_SCALE, yScale, GLTF_SCALE); // X 미러링

    // 바운딩박스 측정 (스케일 적용 상태)
    const leftBox = getScaledBounds(left, lScale);
    const rightBox = getScaledBounds(right, rScale);

    // GLB 모델 상단 돌출부(레일 마운트) 보정값
    // - SL500/L500/M500: 13.7mm (기존 - 서랍 바닥판 하단 기준 -13.7mm)
    // - F500_o: 원점이 달라 별도 오프셋 사용
    const isF500 = modelPath.includes('F500');
    const targetMinY = isF500
      ? drawerBottomY - 21 * 0.01   // F500: 바닥판 하단 -21mm
      : drawerBottomY - 13.7 * 0.01; // 기존: 바닥판 하단 -13.7mm

    // X: 캐비넷 측판 안쪽면에서 7mm 안쪽으로 (서랍 뒷판과 맞닿도록)
    const INSET = 7 * 0.01; // 7mm → Three.js units

    // 왼쪽
    const lPos = new THREE.Vector3(
      -sidePanelInnerX + INSET - leftBox.min.x,
      targetMinY - leftBox.min.y,
      drawerFrontZ - leftBox.max.z,
    );

    // 오른쪽 (X 미러)
    const rPos = new THREE.Vector3(
      sidePanelInnerX - INSET - rightBox.max.x,
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
  }, [scene, drawerTier, drawerBottomY, drawerBottomThickness, backPanelHeight, drawerFrontZ, sidePanelInnerX, drawerHeightMm, is2DSideView, is2DDark]);

  // 2D 상단뷰에서는 숨김 (정면/측면뷰에서는 렌더링)
  if (viewMode === '2D' && view2DDirection === 'top') return null;

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

useGLTF.preload('/models/Legra%20F500_o.glb');
useGLTF.preload('/models/Legra_L500.glb');
useGLTF.preload('/models/Legra_M500.glb');

export default LegraSideRail;
