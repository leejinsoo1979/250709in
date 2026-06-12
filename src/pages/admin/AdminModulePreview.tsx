import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Grid as StageGrid,
  Line,
  OrbitControls,
  PerspectiveCamera,
  SoftShadows,
  Text
} from '@react-three/drei';
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

const DIM_COLOR = '#0e7a5c';
const DIM_TEXT_SIZE_MM = 90;

/** 치수선 한 줄: 양 끝 틱 + 본선 + 수치 라벨 */
const DimensionLine = ({
  from,
  to,
  label,
  labelOffset,
  labelRotationY = 0
}: {
  from: [number, number, number];
  to: [number, number, number];
  label: string;
  labelOffset: [number, number, number];
  labelRotationY?: number;
}) => {
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2 + labelOffset[0],
    (from[1] + to[1]) / 2 + labelOffset[1],
    (from[2] + to[2]) / 2 + labelOffset[2]
  ];
  return (
    <group>
      <Line points={[from, to]} color={DIM_COLOR} lineWidth={1.5} />
      <Text
        position={mid}
        rotation={[0, labelRotationY, 0]}
        fontSize={mmToThreeUnits(DIM_TEXT_SIZE_MM)}
        color={DIM_COLOR}
        anchorX="center"
        anchorY="middle"
        outlineWidth={mmToThreeUnits(6)}
        outlineColor="#ecedeb"
      >
        {label}
      </Text>
    </group>
  );
};

/** 가구 외곽 치수 가이드 — W(전면 하단) / H(좌측 전면) / D(우측 바닥) */
const DimensionGuides = ({ widthMm, heightMm, depthMm }: { widthMm: number; heightMm: number; depthMm: number }) => {
  const w = mmToThreeUnits(widthMm);
  const h = mmToThreeUnits(heightMm);
  const d = mmToThreeUnits(depthMm);
  const off = mmToThreeUnits(140);
  const tick = mmToThreeUnits(40);

  return (
    <group>
      {/* W — 전면 하단 */}
      <DimensionLine
        from={[-w / 2, 0.001, d / 2 + off]}
        to={[w / 2, 0.001, d / 2 + off]}
        label={`${Math.round(widthMm)}`}
        labelOffset={[0, mmToThreeUnits(110), 0]}
      />
      <Line points={[[-w / 2, 0.001, d / 2 + off - tick], [-w / 2, 0.001, d / 2 + off + tick]]} color={DIM_COLOR} lineWidth={1.5} />
      <Line points={[[w / 2, 0.001, d / 2 + off - tick], [w / 2, 0.001, d / 2 + off + tick]]} color={DIM_COLOR} lineWidth={1.5} />

      {/* H — 좌측 전면 세로 */}
      <DimensionLine
        from={[-w / 2 - off, 0, d / 2]}
        to={[-w / 2 - off, h, d / 2]}
        label={`${Math.round(heightMm)}`}
        labelOffset={[-mmToThreeUnits(160), 0, 0]}
      />
      <Line points={[[-w / 2 - off - tick, 0, d / 2], [-w / 2 - off + tick, 0, d / 2]]} color={DIM_COLOR} lineWidth={1.5} />
      <Line points={[[-w / 2 - off - tick, h, d / 2], [-w / 2 - off + tick, h, d / 2]]} color={DIM_COLOR} lineWidth={1.5} />

      {/* D — 우측 바닥 */}
      <DimensionLine
        from={[w / 2 + off, 0.001, -d / 2]}
        to={[w / 2 + off, 0.001, d / 2]}
        label={`${Math.round(depthMm)}`}
        labelOffset={[mmToThreeUnits(140), mmToThreeUnits(60), 0]}
        labelRotationY={Math.PI / 2}
      />
      <Line points={[[w / 2 + off - tick, 0.001, -d / 2], [w / 2 + off + tick, 0.001, -d / 2]]} color={DIM_COLOR} lineWidth={1.5} />
      <Line points={[[w / 2 + off - tick, 0.001, d / 2], [w / 2 + off + tick, 0.001, d / 2]]} color={DIM_COLOR} lineWidth={1.5} />
    </group>
  );
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

  // BoxModule이 참조할 가상 공간
  // 키큰장 도어는 공간 기준(공간높이 − 상단프레임 − 받침대)으로 계산되므로,
  // 공간 높이를 역산해 도어 높이가 정확히 모듈 몸통과 일치하도록 한다.
  const previewSpaceInfo = useMemo<SpaceInfo>(() => {
    const topFrameMm = DEFAULT_SPACE_CONFIG.frameSize?.top || 30;
    const baseMm = DEFAULT_SPACE_CONFIG.baseConfig?.height || 60;
    return {
      ...DEFAULT_SPACE_CONFIG,
      width: Math.max(width + 200, 1200),
      height: height + topFrameMm + baseMm,
      depth: Math.max(depth + 100, 700)
    };
  }, [width, height, depth]);

  const maxDim = Math.max(width, height, depth);
  const cameraDistance = Math.max(mmToThreeUnits(maxDim) * 1.6, 18);
  const centerY = mmToThreeUnits(height) / 2;

  // 드래프트가 바뀌면 BoxModule을 리마운트 — 섹션/따내기/서랍 수정이 즉시 반영되도록
  // (moduleData는 빌더에서 useMemo로 안정화되어 있어 실제 변경 시에만 키가 바뀐다)
  const draftKey = useMemo(() => JSON.stringify(moduleData), [moduleData]);

  return (
    <Space3DViewProvider
      spaceInfo={previewSpaceInfo}
      svgSize={{ width: 800, height: 600 }}
      renderMode="solid"
      viewMode="3D"
    >
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        {/* 스테이지: 종이톤 배경 + 원거리 포그로 그리드가 수평선으로 사라지게 */}
        <color attach="background" args={['#ecedeb']} />
        <fog attach="fog" args={['#ecedeb', cameraDistance * 2.2, cameraDistance * 5.5]} />
        <SoftShadows size={22} samples={14} focus={0.6} />

        <PerspectiveCamera
          makeDefault
          position={[cameraDistance * 0.72, centerY + cameraDistance * 0.26, cameraDistance]}
          fov={30}
        />
        <OrbitControls
          target={[0, centerY, 0]}
          enableDamping
          dampingFactor={0.08}
          minDistance={cameraDistance * 0.3}
          maxDistance={cameraDistance * 3}
          maxPolarAngle={Math.PI / 2 - 0.01}
        />

        {/* 3점 조명: 키(그림자) + 필 + 림 + 하늘빛 */}
        <hemisphereLight args={['#ffffff', '#d9dbd6', 0.5]} />
        <directionalLight
          position={[6, 14, 9]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0002}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        <directionalLight position={[-8, 7, -5]} intensity={0.35} />
        <directionalLight position={[0, 5, -12]} intensity={0.25} color="#eef3ff" />

        <Suspense fallback={null}>
          <group position={[0, centerY, 0]}>
            <BoxModule
              key={draftKey}
              moduleData={moduleData}
              color={moduleData.color}
              spaceInfo={previewSpaceInfo}
              hasDoor={moduleData.hasDoor === true}
              viewMode="3D"
              renderMode="solid"
              showFurniture
              placedFurnitureId={ADMIN_PREVIEW_FURNITURE_ID}
              // 도어/내부 폭 계산이 가상 공간이 아닌 모듈 자신의 폭을 기준으로 하도록
              originalSlotWidth={width}
              doorWidth={width}
              adjustedWidth={width}
              slotWidths={moduleData.slotWidths}
              slotIndex={0}
            />
          </group>
        </Suspense>

        {/* 바닥: 컨택트 섀도우(접지감) + 페이드 그리드 */}
        <ContactShadows
          position={[0, 0.001, 0]}
          opacity={0.38}
          scale={Math.max(mmToThreeUnits(maxDim) * 3.2, 24)}
          blur={2.6}
          far={mmToThreeUnits(height) * 1.2}
          resolution={1024}
          color="#3a3f3a"
        />
        {/* 가구 외곽 치수 (W/H/D mm) */}
        <DimensionGuides widthMm={width} heightMm={height} depthMm={depth} />

        <StageGrid
          position={[0, -0.002, 0]}
          args={[10, 10]}
          cellSize={mmToThreeUnits(100)}
          cellThickness={0.55}
          cellColor="#c9ccc6"
          sectionSize={mmToThreeUnits(1000)}
          sectionThickness={1}
          sectionColor="#aab0a8"
          fadeDistance={cameraDistance * 3.2}
          fadeStrength={1.2}
          infiniteGrid
        />

        <PreviewPanelHighlighter panelName={highlightedPanelName} />
      </Canvas>
    </Space3DViewProvider>
  );
};

export default AdminModulePreview;
