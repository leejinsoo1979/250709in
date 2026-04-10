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

    // 2D 측면뷰: 면은 단색 + 윤곽선 추가 (material만 교체, 바운딩박스에는 영향 없음)
    // 다크: 검정 면 + 흰색 윤곽선
    // 라이트: 흰색 면 + 검정 윤곽선
    if (is2DSideView) {
      const faceColor = is2DDark ? 0x000000 : 0xffffff;
      const solidMat = new THREE.MeshBasicMaterial({
        color: faceColor,
        transparent: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      [left, right].forEach((root) => {
        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = solidMat;
          }
        });
      });
    }

    // GLB 모델은 원본 크기 그대로 사용
    const yScale = GLTF_SCALE;

    const lScale = new THREE.Vector3(GLTF_SCALE, yScale, GLTF_SCALE);
    const rScale = new THREE.Vector3(-GLTF_SCALE, yScale, GLTF_SCALE); // X 미러링

    // 바운딩박스 측정 (스케일 적용 상태, 엣지 라인 추가 전)
    const leftBox = getScaledBounds(left, lScale);
    const rightBox = getScaledBounds(right, rScale);

    // 바운딩박스 계산 이후에 엣지 라인 추가 (Y정렬에 영향 주지 않도록)
    if (is2DSideView) {
      const edgeColor = is2DDark ? 0xffffff : 0x000000;
      const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
      [left, right].forEach((root) => {
        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) {
              const edges = new THREE.EdgesGeometry(mesh.geometry, 15);
              const line = new THREE.LineSegments(edges, edgeMat);
              line.position.copy(mesh.position);
              line.rotation.copy(mesh.rotation);
              line.scale.copy(mesh.scale);
              (mesh as any).__edgeLine = line;
            }
          }
        });
        root.traverse((child) => {
          const edgeLine = (child as any).__edgeLine as THREE.LineSegments | undefined;
          if (edgeLine && child.parent) {
            child.parent.add(edgeLine);
            delete (child as any).__edgeLine;
          }
        });
      });
    }

    // 2D 측면뷰 스냅용: 바운딩박스 기반 외곽 코너 포인트 제공
    // extractVertices()가 LineSegments의 vertex를 수집하므로,
    // 바운딩박스 8개 corner를 연결하는 얇은 LineSegments를 추가하면
    // 사용자가 측면뷰에서 레그라 모서리에 스냅 가능해짐
    // 로컬 박스: scale이 적용되지 않은 원본 box → scaled로 다시 계산
    if (is2DSideView) {
      const snapMat = new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.0, // 시각적으로 완전 투명
        depthWrite: false,
      });
      const makeSnapBox = (box: THREE.Box3, scale: THREE.Vector3): THREE.LineSegments => {
        // box는 scale 적용된 world-space 박스이므로
        // group position에 추가되기 전 기준 로컬 좌표로 변환
        // → group이 (targetMinY - box.min.y) 등으로 위치하므로
        // 스냅 박스도 동일한 group의 자식으로 들어가 자동 정렬됨
        const lx = box.min.x / scale.x;
        const ux = box.max.x / scale.x;
        const ly = box.min.y / scale.y;
        const uy = box.max.y / scale.y;
        const lz = box.min.z / scale.z;
        const uz = box.max.z / scale.z;
        // 8개 corner를 연결하는 12개 엣지
        const corners: number[] = [];
        const add = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
          corners.push(x1, y1, z1, x2, y2, z2);
        };
        // 하단 사각형
        add(lx, ly, lz, ux, ly, lz);
        add(ux, ly, lz, ux, ly, uz);
        add(ux, ly, uz, lx, ly, uz);
        add(lx, ly, uz, lx, ly, lz);
        // 상단 사각형
        add(lx, uy, lz, ux, uy, lz);
        add(ux, uy, lz, ux, uy, uz);
        add(ux, uy, uz, lx, uy, uz);
        add(lx, uy, uz, lx, uy, lz);
        // 수직 엣지
        add(lx, ly, lz, lx, uy, lz);
        add(ux, ly, lz, ux, uy, lz);
        add(ux, ly, uz, ux, uy, uz);
        add(lx, ly, uz, lx, uy, uz);

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
        const lineSegs = new THREE.LineSegments(geom, snapMat);
        lineSegs.userData = { isSnapHelper: true };
        return lineSegs;
      };

      const leftSnap = makeSnapBox(leftBox, lScale);
      const rightSnap = makeSnapBox(rightBox, rScale);
      left.add(leftSnap);
      right.add(rightSnap);
    }

    // GLB 모델 상단 돌출부(레일 마운트) 보정값
    // - SL500/L500/M500: 13.7mm (기존 - 서랍 바닥판 하단 기준 -13.7mm)
    // - F500_o: 원점이 달라 별도 오프셋(-21mm) 사용
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
