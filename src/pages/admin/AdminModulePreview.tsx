import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Space3DViewProvider } from '@/editor/shared/viewer3d/context/Space3DViewContext';
import { getExcludedPanelAliases } from '@/editor/shared/viewer3d/context/ExcludedPanelsContext';
import BoxModule from '@/editor/shared/viewer3d/components/modules/BoxModule';
import { DEFAULT_SPACE_CONFIG, type SpaceInfo } from '@/store/core/spaceConfigStore';
import type { ModuleData } from '@/data/modules';

const mmToThreeUnits = (mm: number) => mm * 0.01;

/** 프리뷰 가구의 합성 ID — ExcludedPanelsStore 숨김(BoxWithEdges)이 furnitureId를 요구함 */
export const ADMIN_PREVIEW_FURNITURE_ID = 'admin-module-builder-preview';

const MESH_PREFIX_RE = /^(furniture-mesh-|back-panel-mesh-)/;
const EDGE_PREFIX_RE = /^(furniture-edge-|back-panel-edge-)/;

/** mesh/edge 이름에서 패널명 추출 — PanelHighlight3DViewer와 동일 규칙 */
const extractPanelName = (objName: string): string | null => {
  const meshStripped = objName.replace(MESH_PREFIX_RE, '');
  if (meshStripped !== objName) return meshStripped || null;
  const edgeStripped = objName.replace(EDGE_PREFIX_RE, '');
  if (edgeStripped !== objName) return edgeStripped.replace(/-\d+$/, '') || null;
  return null;
};

type DimmableMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.LineBasicMaterial;

const isDimmable = (mat: THREE.Material): mat is DimmableMaterial => (
  mat instanceof THREE.MeshStandardMaterial
  || mat instanceof THREE.MeshLambertMaterial
  || mat instanceof THREE.LineBasicMaterial
);

/**
 * 패널목록에서 선택한 패널을 강조 — 대상은 파란 발광, 나머지는 반투명.
 * 공유 material 오염 방지를 위해 전부 클론 후 교체, 해제 시 원본 복원.
 */
const PreviewPanelHighlighter = ({ panelName }: { panelName: string | null }) => {
  const { scene, invalidate } = useThree();
  const originals = useRef(new Map<string, THREE.Material>());

  useEffect(() => {
    if (!panelName) return;

    const targetAliases = new Set(getExcludedPanelAliases(panelName));

    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments)) return;
      const mat = obj.material;
      if (Array.isArray(mat) || !mat || !isDimmable(mat)) return;

      const meshPanelName = obj.name ? extractPanelName(obj.name) : null;
      const isTarget = !!meshPanelName
        && getExcludedPanelAliases(meshPanelName).some(alias => targetAliases.has(alias));

      originals.current.set(obj.uuid, mat);
      const cloned = mat.clone() as DimmableMaterial;
      obj.material = cloned;

      if (cloned instanceof THREE.LineBasicMaterial) {
        if (isTarget) {
          cloned.color.set(0x0033ee);
          cloned.opacity = 1;
          cloned.transparent = false;
        } else {
          cloned.opacity = 0.1;
          cloned.transparent = true;
        }
      } else if (isTarget) {
        cloned.emissive.set(0x0033ee);
        cloned.emissiveIntensity = 0.85;
        cloned.opacity = 1;
        cloned.transparent = false;
      } else {
        cloned.opacity = 0.12;
        cloned.transparent = true;
      }
      cloned.needsUpdate = true;
    });

    invalidate();

    return () => {
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments)) return;
        const original = originals.current.get(obj.uuid);
        if (!original) return;
        const cloned = obj.material;
        obj.material = original;
        if (cloned !== original && cloned instanceof THREE.Material) cloned.dispose();
      });
      originals.current.clear();
      invalidate();
    };
  }, [panelName, scene, invalidate]);

  return null;
};

/**
 * 모듈빌더 실시간 미리보기 — 실제 뷰어 렌더 파이프라인(BoxModule)을 그대로 사용한다.
 * 간이 모델이 아닌 실배치와 동일한 메시(측판/선반/서랍/백패널/도어)가 표시되므로
 * "프리뷰 = 배치 결과"가 보장된다.
 */
const AdminModulePreview = ({
  moduleData,
  highlightedPanelName = null
}: {
  moduleData: ModuleData;
  highlightedPanelName?: string | null;
}) => {
  const { width, height, depth } = moduleData.dimensions;

  // BoxModule이 참조할 가상 공간 — 모듈 치수를 감싸는 크기로 구성
  const previewSpaceInfo = useMemo<SpaceInfo>(() => ({
    ...DEFAULT_SPACE_CONFIG,
    width: Math.max(width + 200, 1200),
    height: Math.max(height + 100, 1500),
    depth: Math.max(depth + 100, 700)
  }), [width, height, depth]);

  const maxDim = Math.max(width, height, depth);
  const cameraDistance = Math.max(mmToThreeUnits(maxDim) * 1.6, 18);
  const centerY = mmToThreeUnits(height) / 2;

  return (
    <Space3DViewProvider
      spaceInfo={previewSpaceInfo}
      svgSize={{ width: 800, height: 600 }}
      renderMode="solid"
      viewMode="3D"
    >
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#f8fafc']} />
        <PerspectiveCamera
          makeDefault
          position={[cameraDistance * 0.7, centerY + cameraDistance * 0.3, cameraDistance]}
          fov={34}
        />
        <OrbitControls
          target={[0, centerY, 0]}
          enableDamping
          dampingFactor={0.08}
          minDistance={cameraDistance * 0.3}
          maxDistance={cameraDistance * 3}
        />
        <ambientLight intensity={0.65} />
        <directionalLight position={[5, 12, 8]} intensity={1.4} castShadow />
        <directionalLight position={[-6, 6, -4]} intensity={0.4} />
        <gridHelper args={[40, 40, '#cbd5e1', '#e2e8f0']} />
        <Suspense fallback={null}>
          <group position={[0, centerY, 0]}>
            <BoxModule
              key={moduleData.id}
              moduleData={moduleData}
              color={moduleData.color}
              spaceInfo={previewSpaceInfo}
              hasDoor={moduleData.hasDoor === true}
              viewMode="3D"
              renderMode="solid"
              showFurniture
              placedFurnitureId={ADMIN_PREVIEW_FURNITURE_ID}
            />
          </group>
        </Suspense>
        <PreviewPanelHighlighter panelName={highlightedPanelName} />
      </Canvas>
    </Space3DViewProvider>
  );
};

export default AdminModulePreview;
