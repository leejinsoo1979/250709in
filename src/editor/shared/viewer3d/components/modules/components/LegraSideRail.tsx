import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';
import { getPanelSimulationSourceRegistryVersion, removePanelSimulationSource, updatePanelSimulationSource } from '../../../utils/panelSimulationRegistry';

interface LegraSideRailProps {
  drawerTier: number;
  drawerBottomY: number;
  drawerBottomThickness: number;
  backPanelHeight: number;
  drawerFrontZ: number;
  sidePanelInnerX: number;
  drawerHeightMm?: number;
  // 마이다 높이(mm). 있으면 이 값을 기준으로 GLB 선택 (사용자가 마이다 사이즈 변경 → 측판 자동 매칭).
  // 마이다 값과 LEGRABOX 표준 설치공간 매핑:
  //   ≤ 125 → K (측판 128.5, Legra_M500.glb)
  //   ≤ 220 → C (측판 177, Legra_L500.glb)
  //    > 220 → F (측판 241, f500.glb)
  maidaHeightMm?: number;
  // 사용자가 직접 선택한 레그라 종류 (있으면 GLB 강제 매칭)
  legraTypeOverride?: 'M' | 'L' | 'F' | 'N';
  // 레일 깊이(mm). 지정 시 그 깊이에 맞는 깊이별 GLB(300/350/400/450/500)를 불러온다.
  railDepthMm?: number;
  // 레일 높이(mm). (현재 깊이별 GLB 방식에서는 미사용, 향후 높이 매칭용으로 받아만 둠)
  railHeightMm?: number;
  renderMode?: string;
  furnitureId?: string;
}

// 레일 깊이(mm) → 보유한 깊이별 GLB 단계(이하 최대값) 매핑.
const RAIL_GLB_DEPTH_STEPS = [300, 350, 400, 450, 500];
const resolveRailGlbDepth = (depthMm: number): number => {
  let chosen = RAIL_GLB_DEPTH_STEPS[0];
  for (const step of RAIL_GLB_DEPTH_STEPS) {
    if (step <= depthMm) chosen = step; else break;
  }
  return chosen;
};

// 등급(M/L/SL) × 깊이(300~500) → GLB 경로.
//  파일명 규칙: M등급 300~450은 공백 'Legra M###', 그 외(M500/L/SL)는 언더스코어 'Legra_등급###'.
const buildRailModelPath = (grade: 'M' | 'L' | 'SL' | 'N', glbDepth: number): string => {
  if (grade === 'N') {
    // N(특소) — 깊이별 어셈블리 GLB (Legra N300/350/450/500_o)
    const step = glbDepth >= 500 ? 500 : glbDepth === 400 ? 350 : glbDepth; // 400 단계 미보유 → 350
    return `/models/Legra N${step}_o.glb`;
  }
  if (grade === 'M') {
    return glbDepth >= 500 ? '/models/Legra_M500.glb' : `/models/Legra M${glbDepth}.glb`;
  }
  return `/models/Legra_${grade}${glbDepth}.glb`;
};

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
  maidaHeightMm,
  legraTypeOverride,
  railDepthMm,
  renderMode,
  furnitureId,
}) => {
  const { viewMode, hideAccessories } = useSpace3DView();
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const panelSimulationRevision = useUIStore(state => state.panelSimulationRevision);
  const panelSimulationPhase = useUIStore(state => state.panelSimulationPhase);
  const { theme } = useTheme();
  const leftGroupRef = React.useRef<THREE.Group>(null);
  const rightGroupRef = React.useRef<THREE.Group>(null);
  const leftSourceSignatureRef = React.useRef<string | null>(null);
  const rightSourceSignatureRef = React.useRef<string | null>(null);

  // 등급(높이) 결정: M(낮은) / L(중간) / SL(대서랍, 높은). 기존 F는 SL로 매핑(깊이별 GLB 보유).
  const grade: 'M' | 'L' | 'SL' | 'N' = legraTypeOverride
    ? (legraTypeOverride === 'F' ? 'SL' : legraTypeOverride === 'N' ? 'N' : legraTypeOverride === 'M' ? 'M' : 'L')
    : drawerHeightMm != null
    ? (drawerHeightMm >= 200 ? 'SL' : drawerHeightMm <= 120 ? 'M' : 'L')
    : (drawerTier === 1 ? 'SL' : 'L');

  // railDepthMm 지정 시 → 등급 × 깊이별 GLB를 직접 불러옴(변형 없음). 미지정 시 500 깊이 기본.
  const glbDepth = railDepthMm != null ? resolveRailGlbDepth(railDepthMm) : 500;
  const modelPath = buildRailModelPath(grade, glbDepth);
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

  const railSize = useMemo<[number, number, number]>(() => {
    const size = prepared.box.getSize(new THREE.Vector3());
    return [
      Math.max(0.025, size.x),
      Math.max(0.025, size.y),
      Math.max(0.025, size.z),
    ];
  }, [prepared]);

  const leftRegistryKey = furnitureId ? `accessory::${furnitureId}::레그라서랍측판-${drawerTier}-좌` : null;
  const rightRegistryKey = furnitureId ? `accessory::${furnitureId}::레그라서랍측판-${drawerTier}-우` : null;

  React.useEffect(() => {
    return () => {
      if (leftRegistryKey) removePanelSimulationSource(leftRegistryKey);
      if (rightRegistryKey) removePanelSimulationSource(rightRegistryKey);
      leftSourceSignatureRef.current = null;
      rightSourceSignatureRef.current = null;
    };
  }, [leftRegistryKey, rightRegistryKey]);

  useFrame(() => {
    const isSimulationActive = viewMode === '3D' && panelSimulationRevision > 0 && !!furnitureId;
    const registerRail = (
      group: THREE.Group | null,
      key: string | null,
      panelName: string
    ) => {
      if (!group) return;
      if (!isSimulationActive || !key || !furnitureId) {
        group.visible = true;
        return;
      }
      const signature = `${getPanelSimulationSourceRegistryVersion()}:${panelSimulationRevision}:${panelSimulationPhase}:${key}:${railSize.join(',')}`;
      const signatureRef = panelName.includes('좌') ? leftSourceSignatureRef : rightSourceSignatureRef;
      if (signatureRef.current !== signature) {
        updatePanelSimulationSource({
          key,
          furnitureId,
          panelName,
          args: railSize,
          object: group,
          assemblyOnly: true,
        });
        signatureRef.current = signature;
      }
      group.visible = false;
    };

    registerRail(leftGroupRef.current, leftRegistryKey, `레그라 서랍${drawerTier} 측판 좌`);
    registerRail(rightGroupRef.current, rightRegistryKey, `레그라 서랍${drawerTier} 측판 우`);
  });

  if (hideAccessories) return null;
  if (viewMode === '2D' && view2DDirection === 'top') return null;

  // 좌우 미러링은 group scale로 처리. scene은 인스턴스별 경량 clone (엣지/스냅박스는 템플릿에서 이미 생성됨).
  return (
    <>
      <group ref={leftGroupRef} position={leftPos} scale={[GLTF_SCALE, GLTF_SCALE, GLTF_SCALE]}>
        <primitive object={leftScene} />
      </group>
      <group ref={rightGroupRef} position={rightPos} scale={[-GLTF_SCALE, GLTF_SCALE, GLTF_SCALE]}>
        <primitive object={rightScene} />
      </group>
    </>
  );
};

useGLTF.preload('/models/f500.glb');
useGLTF.preload('/models/Legra_L500.glb');
useGLTF.preload('/models/Legra_M500.glb');

export default LegraSideRail;
