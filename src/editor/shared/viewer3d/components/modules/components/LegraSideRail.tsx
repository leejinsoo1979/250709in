import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';

interface LegraSideRailProps {
  drawerTier: number;
  drawerBottomY: number;
  drawerBottomThickness: number;
  backPanelHeight: number;
  drawerFrontZ: number;
  sidePanelInnerX: number;
  drawerHeightMm?: number;
  renderMode?: string;
}

// glTF meters → project units (0.01 = 1mm)
const GLTF_SCALE = 10;

type Variant = '3d' | '2dDark' | '2dLight';

type PreparedModel = {
  template: THREE.Object3D; // variant별 1회 처리된 scene 원본. 인스턴스는 이걸 clone해서 사용.
  box: THREE.Box3; // scale(GLTF_SCALE) 적용된 바운딩
};

// 모델별 × variant별 캐시 (재파싱/재clone 방지)
const prepCache = new Map<string, PreparedModel>();

function makeKey(path: string, variant: Variant): string {
  return `${path}::${variant}`;
}

function prepareModel(source: THREE.Object3D, variant: Variant): PreparedModel {
  const root = source.clone(true);

  // Active View 제거
  const toRemove: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.name === 'Active View') toRemove.push(child);
  });
  toRemove.forEach((node) => node.parent?.remove(node));

  // 2D 모드면 면 단색으로 교체 + 엣지 추가
  if (variant !== '3d') {
    const isDark = variant === '2dDark';
    const faceColor = isDark ? 0x000000 : 0xffffff;
    const edgeColor = isDark ? 0xffffff : 0x000000;

    const solidMat = new THREE.MeshBasicMaterial({
      color: faceColor,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });

    // 머티리얼 교체 + 엣지 추가용 타겟 수집
    const meshes: THREE.Mesh[] = [];
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
    });
    meshes.forEach((mesh) => {
      mesh.material = solidMat;
      if (mesh.geometry) {
        const edges = new THREE.EdgesGeometry(mesh.geometry, 15);
        const line = new THREE.LineSegments(edges, edgeMat);
        line.position.copy(mesh.position);
        line.rotation.copy(mesh.rotation);
        line.scale.copy(mesh.scale);
        mesh.parent?.add(line);
      }
    });
  }

  // 바운딩박스 (scale 적용)
  const tempGroup = new THREE.Group();
  tempGroup.add(root);
  tempGroup.scale.set(GLTF_SCALE, GLTF_SCALE, GLTF_SCALE);
  tempGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tempGroup);
  tempGroup.remove(root);

  // 2D에서 스냅용 박스도 씬에 포함 (1회)
  if (variant !== '3d') {
    const snapMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const lx = box.min.x / GLTF_SCALE;
    const ux = box.max.x / GLTF_SCALE;
    const ly = box.min.y / GLTF_SCALE;
    const uy = box.max.y / GLTF_SCALE;
    const lz = box.min.z / GLTF_SCALE;
    const uz = box.max.z / GLTF_SCALE;
    const corners: number[] = [];
    const add = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
      corners.push(x1, y1, z1, x2, y2, z2);
    };
    add(lx, ly, lz, ux, ly, lz);
    add(ux, ly, lz, ux, ly, uz);
    add(ux, ly, uz, lx, ly, uz);
    add(lx, ly, uz, lx, ly, lz);
    add(lx, uy, lz, ux, uy, lz);
    add(ux, uy, lz, ux, uy, uz);
    add(ux, uy, uz, lx, uy, uz);
    add(lx, uy, uz, lx, uy, lz);
    add(lx, ly, lz, lx, uy, lz);
    add(ux, ly, lz, ux, uy, lz);
    add(ux, ly, uz, ux, uy, uz);
    add(lx, ly, uz, lx, uy, uz);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    const lineSegs = new THREE.LineSegments(geom, snapMat);
    lineSegs.userData = { isSnapHelper: true };
    root.add(lineSegs);
  }

  return { template: root, box };
}

function getPrepared(path: string, source: THREE.Object3D, variant: Variant): PreparedModel {
  const key = makeKey(path, variant);
  const cached = prepCache.get(key);
  if (cached) return cached;
  const prepared = prepareModel(source, variant);
  prepCache.set(key, prepared);
  return prepared;
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

  const modelPath = drawerHeightMm != null
    ? (drawerHeightMm >= 200 ? '/models/f500.glb'
      : drawerHeightMm <= 120 ? '/models/Legra_M500.glb'
      : '/models/Legra_L500.glb')
    : (drawerTier === 1 ? '/models/f500.glb' : '/models/Legra_L500.glb');
  const { scene } = useGLTF(modelPath);

  const is2DSideView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');
  const is2DDark = view2DTheme === 'dark' || theme?.mode === 'dark';
  const variant: Variant = is2DSideView ? (is2DDark ? '2dDark' : '2dLight') : '3d';

  // 캐시된 prepared 모델 가져오기 (variant별 1회만 무거운 처리)
  const prepared = useMemo(() => getPrepared(modelPath, scene, variant), [modelPath, scene, variant]);

  // 인스턴스별 좌/우 scene: 처리된 template을 가볍게 clone (엣지/스냅박스 처리는 이미 완료됨)
  const { leftScene, rightScene } = useMemo(() => ({
    leftScene: prepared.template.clone(true),
    rightScene: prepared.template.clone(true),
  }), [prepared]);

  // 위치 계산
  const { leftPos, rightPos } = useMemo(() => {
    const box = prepared.box;
    const isF500 = modelPath.toLowerCase().includes('f500');
    const targetMinY = isF500
      ? drawerBottomY - 21 * 0.01
      : drawerBottomY - 13.7 * 0.01;
    const INSET = 7 * 0.01;

    // 좌: lScale.x = +GLTF_SCALE, 원본 box 사용
    const lPos = new THREE.Vector3(
      -sidePanelInnerX + INSET - box.min.x,
      targetMinY - box.min.y,
      drawerFrontZ - box.max.z,
    );
    // 우: X 미러링 후 박스 재계산 (미러링 시 min.x ↔ -max.x)
    const rMinX = -box.max.x;
    const rMaxX = -box.min.x;
    const rMaxZ = box.max.z;
    const rPos = new THREE.Vector3(
      sidePanelInnerX - INSET - rMaxX,
      targetMinY - box.min.y,
      drawerFrontZ - rMaxZ,
    );
    return { leftPos: lPos, rightPos: rPos };
  }, [prepared, drawerBottomY, drawerFrontZ, sidePanelInnerX, modelPath]);

  if (viewMode === '2D' && view2DDirection === 'top') return null;

  // 좌우 미러링은 group scale로 처리. scene은 인스턴스별 경량 clone (엣지/스냅박스는 템플릿에서 이미 생성됨).
  return (
    <>
      <group position={leftPos} scale={[GLTF_SCALE, GLTF_SCALE, GLTF_SCALE]}>
        <primitive object={leftScene} />
      </group>
      <group position={rightPos} scale={[-GLTF_SCALE, GLTF_SCALE, GLTF_SCALE]}>
        <primitive object={rightScene} />
      </group>
    </>
  );
};

useGLTF.preload('/models/f500.glb');
useGLTF.preload('/models/Legra_L500.glb');
useGLTF.preload('/models/Legra_M500.glb');

export default LegraSideRail;
