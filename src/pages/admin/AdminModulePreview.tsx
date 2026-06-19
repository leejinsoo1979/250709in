import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Grid as StageGrid,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  SoftShadows
} from '@react-three/drei';
import * as THREE from 'three';
import { Space3DViewProvider } from '@/editor/shared/viewer3d/context/Space3DViewContext';
import { getExcludedPanelAliases } from '@/editor/shared/viewer3d/context/ExcludedPanelsContext';
import BoxModule from '@/editor/shared/viewer3d/components/modules/BoxModule';
import DimensionText from '@/editor/shared/viewer3d/components/modules/components/DimensionText';
import LiveDimensionInspector from '@/editor/shared/viewer3d/components/elements/LiveDimensionInspector';
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

const DIM_COLOR = '#10b981';

/**
 * 에디터와 동일한 치수 표기 — 가는 치수선 + 끝 틱 + DimensionText(테마 그린)
 * 키큰장 하부/상부 분리 모듈은 높이를 구간 분절(안쪽) + 전체(바깥쪽)로 표기
 */
const DimensionGuides = ({
  widthMm,
  heightMm,
  depthMm,
  lowerSectionHeightMm = 0,
  viewKey = '3d'
}: {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  lowerSectionHeightMm?: number;
  viewKey?: '3d' | 'front' | 'top' | 'left';
}) => {
  // 방향별 표시/회전 — 에지온(보이지 않는 축) 치수는 숨기고, 텍스트는 카메라를 향하게
  const showW = viewKey !== 'left';
  const showH = viewKey !== 'top';
  const showD = viewKey !== 'front';
  const wTextRot: [number, number, number] = viewKey === 'top' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  const hTextRot: [number, number, number] = viewKey === 'left' ? [0, -Math.PI / 2, Math.PI / 2] : [0, 0, Math.PI / 2];
  const dTextRot: [number, number, number] = viewKey === 'top'
    ? [-Math.PI / 2, 0, Math.PI / 2]
    : viewKey === 'left' ? [0, -Math.PI / 2, 0] : [0, Math.PI / 2, 0];
  const w = mmToThreeUnits(widthMm);
  const h = mmToThreeUnits(heightMm);
  const d = mmToThreeUnits(depthMm);
  const off = mmToThreeUnits(100);   // 가구에서 1차 치수선까지
  const off2 = mmToThreeUnits(260);  // 전체 높이 치수선 (분절 시 바깥쪽)
  const tick = mmToThreeUnits(25);   // 끝 틱 반길이
  const floorY = 0.02;
  const lineProps = { color: DIM_COLOR, lineWidth: 1, depthTest: false } as const;

  const hasSplit = lowerSectionHeightMm > 0 && lowerSectionHeightMm < heightMm;
  const lowerH = mmToThreeUnits(lowerSectionHeightMm);
  const upperMm = Math.round(heightMm - lowerSectionHeightMm);

  return (
    <group>
      {/* W — 전면 하단 */}
      {showW && (
        <>
          <Line points={[[-w / 2, floorY, d / 2 + off], [w / 2, floorY, d / 2 + off]]} {...lineProps} />
          <Line points={[[-w / 2, floorY, d / 2 + off - tick], [-w / 2, floorY, d / 2 + off + tick]]} {...lineProps} />
          <Line points={[[w / 2, floorY, d / 2 + off - tick], [w / 2, floorY, d / 2 + off + tick]]} {...lineProps} />
          <DimensionText
            value={Math.round(widthMm)}
            position={[0, floorY + mmToThreeUnits(70), d / 2 + off + mmToThreeUnits(40)]}
            rotation={wTextRot}
            forceShow
            color={DIM_COLOR}
          />
        </>
      )}

      {/* H — 좌측 전면 세로 (하부/상부 분절 시 구간 치수 + 바깥 전체 치수) */}
      {showH && hasSplit ? (
        <>
          {/* 구간 치수선 (안쪽): 하부 / 상부 */}
          <Line points={[[-w / 2 - off, 0, d / 2], [-w / 2 - off, h, d / 2]]} {...lineProps} />
          <Line points={[[-w / 2 - off - tick, 0, d / 2], [-w / 2 - off + tick, 0, d / 2]]} {...lineProps} />
          <Line points={[[-w / 2 - off - tick, lowerH, d / 2], [-w / 2 - off + tick, lowerH, d / 2]]} {...lineProps} />
          <Line points={[[-w / 2 - off - tick, h, d / 2], [-w / 2 - off + tick, h, d / 2]]} {...lineProps} />
          <DimensionText
            value={Math.round(lowerSectionHeightMm)}
            position={[-w / 2 - off - mmToThreeUnits(60), lowerH / 2, d / 2]}
            rotation={hTextRot}
            forceShow
            color={DIM_COLOR}
          />
          <DimensionText
            value={upperMm}
            position={[-w / 2 - off - mmToThreeUnits(60), lowerH + (h - lowerH) / 2, d / 2]}
            rotation={hTextRot}
            forceShow
            color={DIM_COLOR}
          />

          {/* 전체 높이 치수선 (바깥쪽) */}
          <Line points={[[-w / 2 - off2, 0, d / 2], [-w / 2 - off2, h, d / 2]]} {...lineProps} />
          <Line points={[[-w / 2 - off2 - tick, 0, d / 2], [-w / 2 - off2 + tick, 0, d / 2]]} {...lineProps} />
          <Line points={[[-w / 2 - off2 - tick, h, d / 2], [-w / 2 - off2 + tick, h, d / 2]]} {...lineProps} />
          <DimensionText
            value={Math.round(heightMm)}
            position={[-w / 2 - off2 - mmToThreeUnits(60), h / 2, d / 2]}
            rotation={hTextRot}
            forceShow
            color={DIM_COLOR}
          />
        </>
      ) : showH ? (
        <>
          <Line points={[[-w / 2 - off, 0, d / 2], [-w / 2 - off, h, d / 2]]} {...lineProps} />
          <Line points={[[-w / 2 - off - tick, 0, d / 2], [-w / 2 - off + tick, 0, d / 2]]} {...lineProps} />
          <Line points={[[-w / 2 - off - tick, h, d / 2], [-w / 2 - off + tick, h, d / 2]]} {...lineProps} />
          <DimensionText
            value={Math.round(heightMm)}
            position={[-w / 2 - off - mmToThreeUnits(60), h / 2, d / 2]}
            rotation={hTextRot}
            forceShow
            color={DIM_COLOR}
          />
        </>
      ) : null}

      {/* D — 우측 바닥 (좌측면 뷰에서는 좌측에 표시) */}
      {showD && (() => {
        const dx = viewKey === 'left' ? -(w / 2 + off) : (w / 2 + off);
        const dTextX = viewKey === 'left' ? dx - mmToThreeUnits(60) : dx + mmToThreeUnits(60);
        return (
          <>
            <Line points={[[dx, floorY, -d / 2], [dx, floorY, d / 2]]} {...lineProps} />
            <Line points={[[dx - tick, floorY, -d / 2], [dx + tick, floorY, -d / 2]]} {...lineProps} />
            <Line points={[[dx - tick, floorY, d / 2], [dx + tick, floorY, d / 2]]} {...lineProps} />
            <DimensionText
              value={Math.round(depthMm)}
              position={[dTextX, floorY + mmToThreeUnits(70), 0]}
              rotation={dTextRot}
              forceShow
              color={DIM_COLOR}
            />
          </>
        );
      })()}
    </group>
  );
};

const ResizeGuideLine = ({
  widthMm,
  heightMm,
  depthMm,
  guideY,
  confirmed,
  viewKey = '3d'
}: {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  guideY: number;
  confirmed: boolean;
  viewKey?: '3d' | 'front' | 'top' | 'left';
}) => {
  if (viewKey === 'top') return null;

  const w = mmToThreeUnits(widthMm);
  const d = mmToThreeUnits(depthMm);
  const y = mmToThreeUnits(Math.min(Math.max(0, guideY), heightMm));
  const offset = mmToThreeUnits(24);
  const color = confirmed ? '#22c55e' : '#f59e0b';
  const lineProps = { color, lineWidth: 2, depthTest: false } as const;

  return (
    <group>
      {viewKey !== 'left' && (
        <Line
          points={[
            [-w / 2 - offset, y, d / 2 + offset],
            [w / 2 + offset, y, d / 2 + offset]
          ]}
          {...lineProps}
        />
      )}
      {viewKey !== 'front' && (
        <Line
          points={[
            [-w / 2 - offset, y, -d / 2 - offset],
            [-w / 2 - offset, y, d / 2 + offset]
          ]}
          {...lineProps}
        />
      )}
      <DimensionText
        value={Math.round(guideY)}
        position={[
          viewKey === 'left' ? -w / 2 - offset - mmToThreeUnits(70) : w / 2 + offset + mmToThreeUnits(70),
          y,
          viewKey === 'left' ? 0 : d / 2 + offset
        ]}
        rotation={viewKey === 'left' ? [0, -Math.PI / 2, Math.PI / 2] : [0, 0, Math.PI / 2]}
        forceShow
        color={color}
      />
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
  highlightedPanelName = null,
  viewMode = '3D',
  direction2D = 'front',
  scanMode = false,
  showResizeGuide = false,
  resizeGuideY = 0,
  resizeGuideConfirmed = false
}: {
  moduleData: ModuleData;
  highlightedPanelName?: string | null;
  viewMode?: '2D' | '3D';
  direction2D?: 'front' | 'top' | 'left';
  scanMode?: boolean;
  showResizeGuide?: boolean;
  resizeGuideY?: number;
  resizeGuideConfirmed?: boolean;
}) => {
  const is2D = viewMode === '2D';
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

  // 키큰장 하부 섹션 실측 높이 (mm) — 높이 치수 분절용 (비율 칸은 남은 높이 비율 분배)
  const lowerSectionHeightMm = useMemo(() => {
    const sections = moduleData.modelConfig?.sections;
    const lowerCount = moduleData.modelConfig?.lowerSectionCount ?? 0;
    if (moduleData.category !== 'full' || !sections || sections.length < 2 || lowerCount <= 0 || lowerCount >= sections.length) {
      return 0;
    }
    const absTotal = sections.filter(sec => sec.heightType === 'absolute').reduce((sum, sec) => sum + (sec.height || 0), 0);
    const pctTotal = sections.filter(sec => sec.heightType !== 'absolute').reduce((sum, sec) => sum + (sec.height || 0), 0);
    const remaining = Math.max(height - absTotal, 0);
    const resolved = sections.map(sec => (
      sec.heightType === 'absolute' ? (sec.height || 0) : (pctTotal > 0 ? remaining * ((sec.height || 0) / pctTotal) : 0)
    ));
    return Math.round(resolved.slice(0, lowerCount).reduce((sum, x) => sum + x, 0));
  }, [moduleData, height]);

  return (
    <Space3DViewProvider
      spaceInfo={previewSpaceInfo}
      svgSize={{ width: 800, height: 600 }}
      renderMode={is2D ? 'wireframe' : 'solid'}
      viewMode={viewMode}
    >
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        {/* 스테이지: 3D 다크 / 2D CAD 다크 */}
        <color attach="background" args={[is2D ? '#1b1e21' : '#22262a']} />
        {!is2D && <fog attach="fog" args={['#22262a', cameraDistance * 2.2, cameraDistance * 5.5]} />}
        {!is2D && <SoftShadows size={22} samples={14} focus={0.6} />}

        {is2D ? (
          <OrthographicCamera
            key={direction2D}
            makeDefault
            position={
              direction2D === 'top' ? [0, cameraDistance, 0.001]
                : direction2D === 'left' ? [-cameraDistance, centerY, 0]
                  : [0, centerY, cameraDistance]
            }
            zoom={Math.max(10, 660 / Math.max(mmToThreeUnits(
              direction2D === 'top' ? Math.max(width, depth)
                : direction2D === 'left' ? Math.max(depth, height)
                  : Math.max(width, height)
            ) * 1.2, 1))}
          />
        ) : (
          <PerspectiveCamera
            makeDefault
            position={[cameraDistance * 0.72, centerY + cameraDistance * 0.26, cameraDistance]}
            fov={30}
          />
        )}
        <OrbitControls
          key={`${viewMode}-${direction2D}`}
          target={[0, is2D && direction2D === 'top' ? 0 : centerY, 0]}
          zoomToCursor

          enableDamping
          dampingFactor={0.08}
          enableRotate={!is2D}
          minDistance={cameraDistance * 0.3}
          maxDistance={cameraDistance * 3}
          // 바닥 아래 시점 방지 가드는 3D 전용 — 2D 정면/측면은 정확히 90°라 클램프가 시선을 0.57° 밀어 올림
          maxPolarAngle={is2D ? Math.PI : Math.PI / 2 - 0.01}
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
            {/* 외부서랍 모듈: doorTopGap/doorBottomGap 미전달 — 빌더의 마이다 갭 설정이 적용되게 (전달값은 '배치 후 편집' 우선) */}
            <BoxModule
              key={draftKey}
              moduleData={moduleData}
              // color 강제 안 함 — 실배치와 동일하게 공간 재질(내부 화이트 / 도어 그레이) 사용
              spaceInfo={previewSpaceInfo}
              hasDoor={moduleData.hasDoor === true}
              viewMode={viewMode}
              renderMode={is2D ? 'wireframe' : 'solid'}
              showFurniture
              placedFurnitureId={ADMIN_PREVIEW_FURNITURE_ID}
              // 도어/내부 폭 계산이 가상 공간이 아닌 모듈 자신의 폭을 기준으로 하도록
              originalSlotWidth={width}
              doorWidth={width}
              adjustedWidth={width}
              slotWidths={moduleData.slotWidths}
              slotIndex={0}
              // 프리뷰는 받침대 없이 바닥에 놓이므로 도어 갭 0 — 도어가 몸통과 정확히 일치
              doorTopGap={moduleData.modelConfig?.externalDrawers ? undefined : 0}
              doorBottomGap={moduleData.modelConfig?.externalDrawers ? undefined : 0}
            />
          </group>
        </Suspense>

        {/* 가구 외곽 치수 (W/H/D mm) — 2D/3D 공통 */}
        <DimensionGuides widthMm={width} heightMm={height} depthMm={depth} lowerSectionHeightMm={lowerSectionHeightMm} viewKey={is2D ? direction2D : '3d'} />
        {showResizeGuide && (
          <ResizeGuideLine
            widthMm={width}
            heightMm={height}
            depthMm={depth}
            guideY={resizeGuideY}
            confirmed={resizeGuideConfirmed}
            viewKey={is2D ? direction2D : '3d'}
          />
        )}

        {/* 패널 스캔 — 에디터 스캔모드와 동일: 패널 클릭 시 치수/따내기/홈 표시 */}
        <LiveDimensionInspector enabled={scanMode} />

        {/* 바닥: 컨택트 섀도우(접지감) + 페이드 그리드 — 3D 전용 */}
        {!is2D && (
          <>
            <ContactShadows
              position={[0, 0.001, 0]}
              opacity={0.38}
              scale={Math.max(mmToThreeUnits(maxDim) * 3.2, 24)}
              blur={2.6}
              far={mmToThreeUnits(height) * 1.2}
              resolution={1024}
              color="#000000"
            />
            <StageGrid
              position={[0, -0.002, 0]}
              args={[10, 10]}
              cellSize={mmToThreeUnits(100)}
              cellThickness={0.55}
              cellColor="#3a4045"
              sectionSize={mmToThreeUnits(1000)}
              sectionThickness={1}
              sectionColor="#4d555b"
              fadeDistance={cameraDistance * 3.2}
              fadeStrength={1.2}
              infiniteGrid
            />
          </>
        )}


        <PreviewPanelHighlighter panelName={highlightedPanelName} />
      </Canvas>
    </Space3DViewProvider>
  );
};

export default AdminModulePreview;
