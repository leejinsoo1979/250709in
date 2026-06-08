import React, { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import { useFrame, useThree } from '@react-three/fiber';
import { ModuleData } from '@/data/modules/shelving';
import { getModuleById } from '@/data/modules';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import IndirectLight from '../IndirectLight';
import DimensionText from '../components/DimensionText';
import MaidaWidthDimension from '../components/MaidaWidthDimension';
import MaidaHeightDimension, { MaidaHeightDimensionSegment } from '../components/MaidaHeightDimension';
import { useDimensionColor } from '../hooks/useDimensionColor';

import DoorModule from '../DoorModule';
import BoxWithEdges from '../components/BoxWithEdges';
import SidePanelBoring from '../components/SidePanelBoring';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { ExternalDrawerRenderer } from '../ExternalDrawerRenderer';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';
import LegraSideRail from '../components/LegraSideRail';
import { Line } from '@react-three/drei';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { resolveShelfFrontInsetMm } from '@/editor/shared/utils/shelfInsetCalculator';
import { calculateInternalSpace, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateFurnitureDepth } from '@/editor/shared/viewer3d/utils/geometry';
import { TOP_DOWN_STONE_FRONT_HEIGHT_MM, getTopDownStoneFrontVisibleHeightMm, resolveTopDown2TierGeometry, resolveTopDownTopPanelFrontReductionMm } from '@/editor/shared/utils/topDownCabinetGeometry';
import { getDirectLowerDowelShelfBoringDetails, getDirectLowerDowelShelfPositionsMm, hasDirectLowerTopPanel, isDirectLowerDowelShelfModule } from '@/editor/shared/utils/lowerCabinetDowelShelves';
import { calculateShelfBoringPositions } from '@/domain/boring/utils/calculateShelfBoringPositions';
import { PET_PANEL_THICKNESS_MM, resolveNominalBackPanelOffsetThicknessMm, resolvePetPanelThicknessMm, resolveTopEndPanelFrontOffsetMm } from '@/editor/shared/utils/panelThickness';
import { resolveDoorOuterOpenSides } from '@/editor/shared/utils/doorOuterGap';
import { isDoorDimensionCandidate, resolveDoorDimensionCategory, resolveDoorHeightDimensionSides } from '@/editor/shared/utils/doorDimensionGuides';
import { isPanelKeyExcluded, useExcludedPanelsStore } from '../../../context/ExcludedPanelsContext';
import {
  buildFlatPanelQuaternion,
  getFlatPanelAxes,
  getPanelAssemblySequence,
  getPanelSimulationPlaybackElapsed,
  getPanelSimulationStyleProgress,
  getPanelSimulationStyleTiming,
  getPanelSimulationLayoutKey,
  MIN_SIMULATION_BOX_SIZE,
  resolvePanelSimulationTarget
} from '../../../utils/panelSimulationMotion';

const applyLowerPanelSimulation = ({
  group,
  position,
  args,
  furnitureId,
  panelName,
  viewMode,
  panelSimulationPhase,
  panelSimulationRevision,
  panelSimulationLayouts,
  simulationRevisionRef,
  simulationStartTimeRef,
  material,
}: {
  group: THREE.Group;
  position: [number, number, number];
  args: [number, number, number];
  furnitureId?: string;
  panelName?: string;
  viewMode: '2D' | '3D';
  panelSimulationPhase: 'assembled' | 'layout';
  panelSimulationRevision: number;
  panelSimulationLayouts: Record<string, any>;
  simulationRevisionRef: React.MutableRefObject<number>;
  simulationStartTimeRef: React.MutableRefObject<number>;
  material?: THREE.Material;
}) => {
  if (viewMode !== '3D' || !furnitureId || !panelName) {
    group.position.set(position[0], position[1], position[2]);
    group.quaternion.identity();
    group.scale.set(1, 1, 1);
    return;
  }

  if (simulationRevisionRef.current !== panelSimulationRevision) {
    simulationRevisionRef.current = panelSimulationRevision;
    simulationStartTimeRef.current = performance.now() / 1000;
  }

  if (panelSimulationRevision <= 0) return;

  const safeArgs = args.map(value => Math.max(MIN_SIMULATION_BOX_SIZE, value)) as [number, number, number];
  const simulationTarget = resolvePanelSimulationTarget(panelSimulationLayouts, furnitureId, panelName, safeArgs);
  const simulationLayout = simulationTarget?.layout;
  const hasSimulationLayouts = Object.keys(panelSimulationLayouts).length > 0;
  if (!simulationLayout) {
    group.visible = true;
    group.position.set(position[0], position[1], position[2]);
    group.quaternion.identity();
    group.scale.set(1, 1, 1);
    if (hasSimulationLayouts && panelSimulationPhase === 'layout' && import.meta.env.DEV) {
      console.warn('[PanelSimulation] lower panel layout target missing, keeping original visible:', `${furnitureId}::${panelName}`);
    }
    return;
  }
  group.visible = true;

  const layoutKey = simulationTarget?.key || getPanelSimulationLayoutKey(panelSimulationLayouts, furnitureId, panelName) || `${furnitureId}::${panelName}`;
  const slot = layoutKey ? 0 : 0;
  const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(safeArgs);
  const originalPosition = new THREE.Vector3(position[0], position[1], position[2]);
  const originalQuaternion = new THREE.Quaternion();
  const originalScale = new THREE.Vector3(1, 1, 1);
  const layoutScaleVector = new THREE.Vector3(1, 1, 1);
  layoutScaleVector.setComponent(thicknessAxis.index, simulationLayout.scale);
  layoutScaleVector.setComponent(widthAxis.index, simulationLayout.widthWorld / Math.max(safeArgs[widthAxis.index], MIN_SIMULATION_BOX_SIZE));
  layoutScaleVector.setComponent(lengthAxis.index, simulationLayout.heightWorld / Math.max(safeArgs[lengthAxis.index], MIN_SIMULATION_BOX_SIZE));

  const thickness = Math.min(safeArgs[0], safeArgs[1], safeArgs[2]);
  const layoutPosition = new THREE.Vector3(
    simulationLayout.worldX,
    simulationLayout.worldY + thickness * simulationLayout.scale * 0.5 + 0.03,
    simulationLayout.worldZ
  );
  const layoutQuaternion = buildFlatPanelQuaternion(safeArgs, simulationLayout.rotationZ);
  const parent = group.parent;
  if (parent) {
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(layoutPosition);
    const parentWorldQuaternion = new THREE.Quaternion();
    parent.getWorldQuaternion(parentWorldQuaternion);
    layoutQuaternion.premultiply(parentWorldQuaternion.invert());
  }

  const fromPosition = panelSimulationPhase === 'layout' ? originalPosition : layoutPosition;
  const toPosition = panelSimulationPhase === 'layout' ? layoutPosition : originalPosition;
  const fromQuaternion = panelSimulationPhase === 'layout' ? originalQuaternion : layoutQuaternion;
  const toQuaternion = panelSimulationPhase === 'layout' ? layoutQuaternion : originalQuaternion;
  const fromScale = panelSimulationPhase === 'layout' ? originalScale : layoutScaleVector;
  const toScale = panelSimulationPhase === 'layout' ? layoutScaleVector : originalScale;

  const sequenceIndex = panelSimulationPhase === 'layout'
    ? (simulationLayout.order ?? slot)
    : getPanelAssemblySequence(furnitureId, panelName, position, group.parent, false);
  const playback = useUIStore.getState();
  const timing = getPanelSimulationStyleTiming(playback.panelSimulationAnimationStyle);
  const cameraSettleDelay = panelSimulationPhase === 'layout' ? timing.cameraSettleLayout : timing.cameraSettleAssembly;
  const elapsed = getPanelSimulationPlaybackElapsed(playback) - cameraSettleDelay - sequenceIndex * (panelSimulationPhase === 'layout' ? timing.layoutDelayStep : timing.assemblyDelayStep);
  if (elapsed < 0) {
    group.position.copy(fromPosition);
    group.quaternion.copy(fromQuaternion);
    group.scale.copy(fromScale);
    return;
  }
  const progress = getPanelSimulationStyleProgress(playback.panelSimulationAnimationStyle, elapsed / (panelSimulationPhase === 'layout' ? timing.layoutDuration : timing.duration));
  group.position.copy(fromPosition).lerp(toPosition, progress);
  group.quaternion.copy(fromQuaternion).slerp(toQuaternion, progress);
  group.scale.copy(fromScale).lerp(toScale, progress);
};

/**
 * 졸리컷 수평 상판 — 앞면 하단 모서리가 45도로 가공된 판
 * 측면(YZ) 단면:
 *
 *   상면: ──────────────────
 *          \               |
 *   45도→   \              | 뒷면
 *            \             |
 *   하면:     ─────────────
 */
const JollyCutHorizontalPlate: React.FC<{
  width: number; thickness: number; depth: number;
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  panelName?: string;
  furnitureId?: string;
}> = React.memo(({ width, thickness: t, depth: d, position, material, renderMode, panelName, furnitureId }) => {
  const geom = useMemo(() => {
    const hw = width / 2, ht = t / 2, hd = d / 2;
    // 0=좌상앞, 1=좌상뒤, 2=좌하뒤, 3=좌하앞(후퇴t)
    // 4=우상앞, 5=우상뒤, 6=우하뒤, 7=우하앞(후퇴t)
    const V: [number,number,number][] = [
      [-hw, +ht, +hd],   [-hw, +ht, -hd],   [-hw, -ht, -hd],   [-hw, -ht, +hd-t],
      [+hw, +ht, +hd],   [+hw, +ht, -hd],   [+hw, -ht, -hd],   [+hw, -ht, +hd-t],
    ];
    // non-indexed: 면별 독립 정점 + UV
    const pos: number[] = [];
    const uvs: number[] = [];
    // quad 헬퍼: 4정점 + 4 UV → 2 triangles (v0,v1,v2 + v0,v2,v3)
    const quad = (a:number,b:number,c:number,d_:number, u0:[number,number],u1:[number,number],u2:[number,number],u3:[number,number]) => {
      pos.push(...V[a],...V[b],...V[c], ...V[a],...V[c],...V[d_]);
      uvs.push(...u0,...u1,...u2, ...u0,...u2,...u3);
    };
    // 상면 ↑: 0,4,5,1 (좌앞→우앞→우뒤→좌뒤)
    quad(0,4,5,1, [0,1],[1,1],[1,0],[0,0]);
    // 하면 ↓: 3,2,6,7 (좌앞→좌뒤→우뒤→우앞) — 아래서 봄
    quad(3,2,6,7, [0,1],[0,0],[1,0],[1,1]);
    // 뒷면 -Z: 1,5,6,2 (좌상→우상→우하→좌하)
    quad(1,5,6,2, [0,1],[1,1],[1,0],[0,0]);
    // 45도 경사면: 0,3,7,4 (좌상→좌하→우하→우상) — 앞+아래서 봄
    quad(0,3,7,4, [0,1],[0,0],[1,0],[1,1]);
    // 좌측면 -X: 0,1,2,3 (상앞→상뒤→하뒤→하앞)
    quad(0,1,2,3, [1,1],[0,1],[0,0],[1,0]);
    // 우측면 +X: 4,7,6,5 (상앞→하앞→하뒤→상뒤)
    quad(4,7,6,5, [0,1],[0,0],[1,0],[1,1]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [width, t, d]);

  // 엣지 라인
  const edgeLines = useMemo(() => {
    const hw = width / 2, ht = t / 2, hd = d / 2;
    const V: [number,number,number][] = [
      [-hw, +ht, +hd], [-hw, +ht, -hd], [-hw, -ht, -hd], [-hw, -ht, +hd-t],
      [+hw, +ht, +hd], [+hw, +ht, -hd], [+hw, -ht, -hd], [+hw, -ht, +hd-t],
    ];
    return [
      [0,4],[4,5],[5,1],[1,0], // 상면
      [3,7],[7,6],[6,2],[2,3], // 하면
      [1,2],[5,6],             // 뒷면 수직
      [0,3],[4,7],             // 45도 경사
    ].map(([a,b]) => [V[a], V[b]] as [[number,number,number],[number,number,number]]);
  }, [width, t, d]);

  const lineColor = renderMode === 'wireframe' ? '#ffffff' : '#555555';
  const groupRef = useRef<THREE.Group>(null);
  const compositeKey = furnitureId && panelName ? `${furnitureId}::${panelName}` : null;
  const { viewMode } = useSpace3DView();
  const { panelSimulationPhase, panelSimulationRevision, panelSimulationLayouts } = useUIStore();
  const simulationRevisionRef = useRef(panelSimulationRevision);
  const simulationStartTimeRef = useRef(0);

  useFrame(() => {
    if (!groupRef.current || !compositeKey) return;
    const { excludedKeys } = useExcludedPanelsStore.getState();
    const shouldHide = isPanelKeyExcluded(excludedKeys, furnitureId, panelName);
    if (groupRef.current.visible === shouldHide) {
      groupRef.current.visible = !shouldHide;
    }
    if (shouldHide) return;
    applyLowerPanelSimulation({
      group: groupRef.current,
      position,
      args: [width, t, d],
      furnitureId,
      panelName,
      viewMode,
      panelSimulationPhase,
      panelSimulationRevision,
      panelSimulationLayouts,
      simulationRevisionRef,
      simulationStartTimeRef,
      material,
    });
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh material={material}>
        <primitive key={`hplate-${width}-${t}-${d}`} object={geom} attach="geometry" />
      </mesh>
      {edgeLines.map(([s,e], i) => (
        <line key={`h-edge-${i}-${width}-${t}-${d}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array([...s,...e])} count={2} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={lineColor} />
        </line>
      ))}
    </group>
  );
});

/**
 * 졸리컷 수직 앞판 — 뒷면 상단 모서리가 45도로 가공된 판
 * 측면(YZ) 단면:
 *
 *         뒤    앞
 *      3───────0   상면 (앞 전체, 뒤 후퇴)
 *       \      |
 * 45도→  \     | 앞면
 *         \    |
 *      2───────1   하면
 *         뒷면
 */
const JollyCutVerticalPlate: React.FC<{
  width: number; height: number; thickness: number;
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  panelName?: string;
  furnitureId?: string;
}> = React.memo(({ width, height: h, thickness: t, position, material, renderMode, panelName, furnitureId }) => {
  const geom = useMemo(() => {
    const hw = width / 2, hh = h / 2, ht = t / 2;
    // 0=좌상앞, 1=좌하앞, 2=좌하뒤, 3=좌상후퇴뒤
    // 4=우상앞, 5=우하앞, 6=우하뒤, 7=우상후퇴뒤
    const V: [number,number,number][] = [
      [-hw, +hh, +ht],   [-hw, -hh, +ht],   [-hw, -hh, -ht],   [-hw, +hh-t, -ht],
      [+hw, +hh, +ht],   [+hw, -hh, +ht],   [+hw, -hh, -ht],   [+hw, +hh-t, -ht],
    ];
    const pos: number[] = [];
    const uvs: number[] = [];
    const quad = (a:number,b:number,c:number,d_:number, u0:[number,number],u1:[number,number],u2:[number,number],u3:[number,number]) => {
      pos.push(...V[a],...V[b],...V[c], ...V[a],...V[c],...V[d_]);
      uvs.push(...u0,...u1,...u2, ...u0,...u2,...u3);
    };
    // 앞면 +Z: 0,1,5,4 (좌상→좌하→우하→우상)
    quad(0,1,5,4, [0,1],[0,0],[1,0],[1,1]);
    // 뒷면 -Z: 3,7,6,2 (좌상후퇴→우상후퇴→우하→좌하) — 뒤에서 봄
    quad(3,7,6,2, [0,1],[1,1],[1,0],[0,0]);
    // 하면 ↓: 1,2,6,5 (좌앞→좌뒤→우뒤→우앞)
    quad(1,2,6,5, [0,1],[0,0],[1,0],[1,1]);
    // 45도 경사면 (상): 0,4,7,3 (좌앞상→우앞상→우뒤후퇴→좌뒤후퇴) — 위+뒤에서 봄
    quad(0,4,7,3, [0,1],[1,1],[1,0],[0,0]);
    // 좌측면 -X: 0,3,2,1 (상앞→상뒤후퇴→하뒤→하앞)
    quad(0,3,2,1, [1,1],[0,1],[0,0],[1,0]);
    // 우측면 +X: 4,5,6,7 (상앞→하앞→하뒤→상뒤후퇴)
    quad(4,5,6,7, [0,1],[0,0],[1,0],[1,1]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [width, h, t]);

  const edgeLines = useMemo(() => {
    const hw = width / 2, hh = h / 2, ht = t / 2;
    const V: [number,number,number][] = [
      [-hw, +hh, +ht], [-hw, -hh, +ht], [-hw, -hh, -ht], [-hw, +hh-t, -ht],
      [+hw, +hh, +ht], [+hw, -hh, +ht], [+hw, -hh, -ht], [+hw, +hh-t, -ht],
    ];
    return [
      [0,4],[4,5],[5,1],[1,0], // 앞면
      [3,7],[7,6],[6,2],[2,3], // 뒷면+하면
      [1,2],[5,6],             // 앞뒤 수직
      [0,3],[4,7],             // 45도 경사
    ].map(([a,b]) => [V[a], V[b]] as [[number,number,number],[number,number,number]]);
  }, [width, h, t]);

  const lineColor = renderMode === 'wireframe' ? '#ffffff' : '#555555';
  const groupRef = useRef<THREE.Group>(null);
  const compositeKey = furnitureId && panelName ? `${furnitureId}::${panelName}` : null;
  const { viewMode } = useSpace3DView();
  const { panelSimulationPhase, panelSimulationRevision, panelSimulationLayouts } = useUIStore();
  const simulationRevisionRef = useRef(panelSimulationRevision);
  const simulationStartTimeRef = useRef(0);

  useFrame(() => {
    if (!groupRef.current || !compositeKey) return;
    const { excludedKeys } = useExcludedPanelsStore.getState();
    const shouldHide = isPanelKeyExcluded(excludedKeys, furnitureId, panelName);
    if (groupRef.current.visible === shouldHide) {
      groupRef.current.visible = !shouldHide;
    }
    if (shouldHide) return;
    applyLowerPanelSimulation({
      group: groupRef.current,
      position,
      args: [width, h, t],
      furnitureId,
      panelName,
      viewMode,
      panelSimulationPhase,
      panelSimulationRevision,
      panelSimulationLayouts,
      simulationRevisionRef,
      simulationStartTimeRef,
      material,
    });
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh material={material}>
        <primitive key={`vplate-${width}-${h}-${t}`} object={geom} attach="geometry" />
      </mesh>
      {edgeLines.map(([s,e], i) => (
        <line key={`v-edge-${i}-${width}-${h}-${t}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array([...s,...e])} count={2} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={lineColor} />
        </line>
      ))}
    </group>
  );
});

/**
 * 인덕션장 레그라박스 서랍 + 마이다 (인출 애니메이션 포함)
 * - 바닥판 + 뒷판 + 레그라 측판(GLB) + 마이다 2장
 * - 도어 오픈 시 서랍 본체 + 마이다가 Z축으로 300mm 슬라이드
 * - 2D 모드에서 마이다 오버레이 + V자 점선 인출 표시
 */
interface InductionDrawerAnimatedProps {
  moduleId: string;
  moduleHeightMm: number;
  adjustedHeight: number;
  adjustedWidth: number;
  basicThickness: number;   // Three.js units
  furnitureDepth: number;   // Three.js units
  furnitureMaterial: THREE.Material;
  doorMaterial: THREE.Material;
  backPanelThicknessProp?: number;
  renderMode: 'solid' | 'wireframe';
  cabinetYPosition: number;
  placedFurnitureId?: string;
  showFurniture: boolean;
  hasDoor: boolean;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  doorTopGap?: number;
  doorBottomGap?: number;
  floorY?: number;
  maidaDimensionSide?: 'left' | 'right' | null;
  maidaFrontWidthMm?: number;
  maidaXOffset?: number;
  // 레그라 서랍 종류 사용자 선택 (tier별, di=0 아래 1단 → di=1 위 2단). 측판 GLB override.
  legraDrawerTypes?: ('M' | 'L' | 'F')[];
}

// 레그라 서랍 깊이(mm) — 레일 GLB 깊이 단계와 동일하게 맞춘다.
//   바닥판·뒷판·레일 측판이 모두 같은 깊이가 되도록, 보유한 깊이별 GLB 단계(300~500) 중
//   몸통 깊이 - 여유 50mm 이하 최대값 선택. 단 최대 500(GLB 최대 단계).
//   예: 몸통 600 → 550→500, 몸통 550 → 500, 몸통 500 → 450, 몸통 450 → 400.
const LEGRA_GLB_DEPTH_STEPS_MM = [300, 350, 400, 450, 500];
const LEGRA_DRAWER_DEPTH_MARGIN_MM = 50;
const resolveLegraDrawerDepthMm = (bodyDepthMm: number): number => {
  const limit = bodyDepthMm - LEGRA_DRAWER_DEPTH_MARGIN_MM;
  let chosen = LEGRA_GLB_DEPTH_STEPS_MM[0];
  for (const step of LEGRA_GLB_DEPTH_STEPS_MM) {
    if (step <= limit) chosen = step; else break;
  }
  return chosen;
};

const InductionDrawerAnimated: React.FC<InductionDrawerAnimatedProps> = ({
  adjustedHeight,
  adjustedWidth,
  basicThickness,
  furnitureDepth,
  furnitureMaterial,
  doorMaterial,
  backPanelThicknessProp,
  renderMode,
  cabinetYPosition,
  placedFurnitureId,
  showFurniture,
  hasDoor,
  panelGrainDirections,
  doorTopGap,
  doorBottomGap,
  floorY,
  maidaDimensionSide = null,
  maidaFrontWidthMm,
  maidaXOffset = 0,
  legraDrawerTypes,
}) => {
  const { doorsOpen, isIndividualDoorOpen, isInteriorMaterialMode } = useUIStore();
  const { gl } = useThree();
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(s => s.view2DDirection);
  const view2DTheme = useUIStore(s => s.view2DTheme);
  const showDimensions = useUIStore(s => s.showDimensions);
  const { doorDimensionColor } = useDimensionColor();

  // 도어 오픈 상태 (ExternalDrawerRenderer와 동일 로직)
  const isDoorOpen = (doorsOpen !== null && !isInteriorMaterialMode)
    ? doorsOpen
    : placedFurnitureId ? isIndividualDoorOpen(placedFurnitureId, 0) : false;

  // 애니메이션 중 렌더링 갱신
  const [isAnimating, setIsAnimating] = useState(false);
  useEffect(() => {
    if (isDoorOpen !== undefined) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isDoorOpen]);
  useFrame(() => {
    if (isAnimating && gl && 'invalidate' in gl) {
      (gl as any).invalidate();
    }
  });

  const mmToThreeUnits = (mm: number) => mm * 0.01;
  const DRAWER_OPEN_DISTANCE = mmToThreeUnits(300);

  const spring = useSpring({
    z: isDoorOpen ? DRAWER_OPEN_DISTANCE : 0,
    config: { tension: 90, friction: 16, clamp: true },
  });

  const cabinetHeight = adjustedHeight;
  const cabinetBottomY = -cabinetHeight / 2;
  const basicThicknessMm = basicThickness / 0.01;
  const rawBackPanelThicknessMm = backPanelThicknessProp ?? 9;
  const drawerBottomThicknessMm = rawBackPanelThicknessMm === 9.5
    ? 9
    : rawBackPanelThicknessMm === 5 || rawBackPanelThicknessMm === 5.5
      ? 6
      : rawBackPanelThicknessMm === 3.5
        ? 3
        : rawBackPanelThicknessMm;
  const drawerPanelThicknessMm = 15;
  const bottomSideGapMm = 17;
  const backSideGapMm = 18.5;
  const widthMm = adjustedWidth;
  const drawerBottomWidthMm = widthMm - basicThicknessMm * 2 - bottomSideGapMm * 2;
  const drawerBackWidthMm = widthMm - basicThicknessMm * 2 - backSideGapMm * 2;
  // 레일 GLB 깊이 단계(300~500). 레일 측판은 이 깊이의 GLB를 그대로 사용.
  const railGlbDepthMm = resolveLegraDrawerDepthMm(furnitureDepth / 0.01);
  // 서랍 박스(바닥판·뒷판) 깊이 = 레일 깊이 - 10mm (예: 레일 500 → 박스 490).
  const drawerDepthMm = railGlbDepthMm - 10;
  const bottomGapMm = 28;
  const drawer1BottomY = cabinetBottomY + mmToThreeUnits(basicThicknessMm + bottomGapMm);
  // 레그라 종류(소/중/대)별 서랍 본체 표준 높이 — 측판 GLB와 동일 기준(M500/L500/F500).
  // 사용자가 종류를 선택하면 측판뿐 아니라 뒷판 높이(BackH)도 함께 줄어든다(터치서랍과 동일).
  const inductionLegraHeightByType: Record<'M' | 'L' | 'F', number> = { M: 117, L: 164, F: 228 };
  // drawer1(아래 서랍) 본체 높이: 일단 기본값. 아래 마이다(maida1) 높이 확정 후(아래) 마이다에 맞춰
  // 강제 자동 재결정한다(측판+뒷판 둘 다). 마이다가 작아지면 서랍도 한 등급 작아진다.
  let drawer1TotalH = legraDrawerTypes?.[0]
    ? inductionLegraHeightByType[legraDrawerTypes[0]]
    : 228;
  let drawer1BackH = drawer1TotalH - drawerBottomThicknessMm;
  const drawer2TotalH = legraDrawerTypes?.[1]
    ? inductionLegraHeightByType[legraDrawerTypes[1]]
    : 164;
  const drawer2BackH = drawer2TotalH - drawerBottomThicknessMm;
  // drawer2는 상단 마이다(maida2)와 연동되어야 하므로 maida2 계산 이후에 위치 결정 (아래 참조)

  const drawerBottomWidth = mmToThreeUnits(drawerBottomWidthMm);
  const drawerBackWidth = mmToThreeUnits(drawerBackWidthMm);
  const drawerDepth = mmToThreeUnits(drawerDepthMm);
  const drawerBottomThickness = mmToThreeUnits(drawerBottomThicknessMm);
  const drawerPanelThickness = mmToThreeUnits(drawerPanelThicknessMm);
  const drawerFrontZ = furnitureDepth / 2;
  const drawerZ = drawerFrontZ - drawerDepth / 2;
  const drawerBackZ = drawerFrontZ - drawerDepth + drawerPanelThickness / 2;
  const rebateWidth = mmToThreeUnits(38);
  const rebateHeight = mmToThreeUnits(7.5);

  // 마이다 관련 계산
  const moduleDepthMm = furnitureDepth / 0.01;
  const maidaWidthMm = Math.max(0, (maidaFrontWidthMm ?? widthMm) - 3);
  const maidaWidth = mmToThreeUnits(maidaWidthMm);
  const maidaThickness = basicThickness;
  const MAIDA_BACK_GAP_MM = 2;
  const maidaZ = furnitureDepth / 2 + mmToThreeUnits(MAIDA_BACK_GAP_MM) + maidaThickness / 2;

  const defaultDTG = -20;
  const defaultDBG = 5;
  const gapTopExt = (doorTopGap ?? defaultDTG) - defaultDTG;
  const gapBottomExt = (doorBottomGap ?? defaultDBG) - defaultDBG;
  const cabinetHeightMm = adjustedHeight / 0.01;

  // 인덕션장 마이다: H 변경 시 '상단 마이다(maida2)'는 크기 고정, 위치만 평행 이동
  //   - 상단갭 20mm, 마이다 사이 갭 3mm 고정
  //   - maida2 외경 높이 = 427 (H=785 기준 상수)
  //   - maida1 높이 = (maida2 하단 - 3) - (-5 - bottomExt) → H 변화는 maida1이 흡수
  const gapMm = 3;
  const FIXED_MAIDA2_H = 427;
  // 사용자 입력(customMaidaHeights, [아래, 위])이 유효하면 위 마이다 높이를 입력값으로 쓴다.
  const inductionCustomMaida = useFurnitureStore(state => {
    if (!placedFurnitureId) return undefined;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    const cmh = (pm as any)?.customMaidaHeights;
    return Array.isArray(cmh) && cmh.length === 2 && cmh.every((v: any) => typeof v === 'number' && v > 0)
      ? (cmh as number[]) : undefined;
  });
  const maida2HeightMm = inductionCustomMaida ? inductionCustomMaida[1] : Math.max(0, FIXED_MAIDA2_H + gapTopExt);
  const maida2TopMm = cabinetHeightMm - 20 + gapTopExt;
  const maida2BottomMm = maida2TopMm - maida2HeightMm;
  const maida2CenterY = cabinetBottomY + mmToThreeUnits(maida2BottomMm) + mmToThreeUnits(maida2HeightMm) / 2;

  // 아래 마이다: 하단 고정, 위가 커지면 높이가 줄어 흡수 (하단갭 침범 없음)
  const maida1TopMm = maida2BottomMm - gapMm;
  const maida1BottomMm = -5 - gapBottomExt;
  const maida1HeightMm = Math.max(0, maida1TopMm - maida1BottomMm);
  const maida1CenterY = cabinetBottomY + mmToThreeUnits(maida1BottomMm) + mmToThreeUnits(maida1HeightMm) / 2;

  // 아래 서랍(drawer1) 본체를 Y좌표 기준으로 강제 자동 결정한다(수동 선택·마이다 크기 무시).
  // 기준: 서랍 측판 상단 Y ≤ 아래 마이다(maida1) 상단 Y 가 되는 가장 큰 등급(F>L>M).
  //  → 마이다 상단이 (크기 변경이든 하단갭 이동이든) 내려와 서랍 측판 상단보다 아래가 되면,
  //    측판이 마이다 위로 튀어나오므로 서랍을 한 등급 작게 한다. (측판 GLB + 뒷판 둘 다 연동)
  //  drawer1 측판 바닥(mm, cabinetBottom 기준) = basicThicknessMm + bottomGapMm.
  let drawer1AutoLegraType: 'M' | 'L' | 'F' = 'F';
  {
    const drawer1BaseBottomMm = basicThicknessMm + bottomGapMm;
    const sideTopY = (h: number) => drawer1BaseBottomMm + h; // 측판 상단 Y(mm)
    const fits = (h: number) => sideTopY(h) <= maida1TopMm;   // 마이다1 상단 Y 이하면 OK
    drawer1TotalH = fits(228) ? 228 : fits(164) ? 164 : 117;
    drawer1AutoLegraType = drawer1TotalH === 228 ? 'F' : drawer1TotalH === 164 ? 'L' : 'M';
    drawer1BackH = drawer1TotalH - drawerBottomThicknessMm;
  }
  const floorLineY = floorY ?? -cabinetYPosition;
  const maida1BottomY = cabinetBottomY + mmToThreeUnits(maida1BottomMm);
  const maidaHeightSegments: MaidaHeightDimensionSegment[] = [
    ...(Math.abs((maida1BottomY - floorLineY) / 0.01) > 0 ? [{
      bottomY: Math.min(floorLineY, maida1BottomY),
      topY: Math.max(floorLineY, maida1BottomY),
      valueMm: Math.round(Math.abs((maida1BottomY - floorLineY) / 0.01) * 10) / 10,
      key: 'induction-maida-bottom-gap',
    }] : []),
    {
      bottomY: maida1CenterY - mmToThreeUnits(maida1HeightMm) / 2,
      topY: maida1CenterY + mmToThreeUnits(maida1HeightMm) / 2,
      valueMm: Math.round(maida1HeightMm * 10) / 10,
      key: 'induction-maida-height-1',
    },
    ...(maida2BottomMm - maida1TopMm > 0 ? [{
      bottomY: cabinetBottomY + mmToThreeUnits(maida1TopMm),
      topY: cabinetBottomY + mmToThreeUnits(maida2BottomMm),
      valueMm: Math.round((maida2BottomMm - maida1TopMm) * 10) / 10,
      key: 'induction-maida-gap-1',
    }] : []),
    {
      bottomY: maida2CenterY - mmToThreeUnits(maida2HeightMm) / 2,
      topY: maida2CenterY + mmToThreeUnits(maida2HeightMm) / 2,
      valueMm: Math.round(maida2HeightMm * 10) / 10,
      key: 'induction-maida-height-2',
    },
    ...(cabinetHeightMm - maida2TopMm > 0 ? [{
      bottomY: cabinetBottomY + mmToThreeUnits(maida2TopMm),
      topY: cabinetBottomY + mmToThreeUnits(cabinetHeightMm),
      valueMm: Math.round((cabinetHeightMm - maida2TopMm) * 10) / 10,
      key: 'induction-maida-top-gap',
    }] : []),
  ];

  // drawer2 위치: 상단 마이다(maida2)와 함께 평행 이동
  // 원래 H=785 기준: maida2 바닥(338) + 18 = drawer2 바닥(356)
  const drawer2BottomY = cabinetBottomY + mmToThreeUnits(maida2BottomMm + 18);

  // 2D 오버레이 표시 조건
  const showMaidaOverlay = viewMode === '2D' && view2DDirection === 'front';
  const maidaOverlayColor = view2DTheme === 'dark' ? '#3a5a7a' : '#a0b8d0';

  // V자 점선 생성 함수
  const makeDashedLine = (s: [number, number, number], e: [number, number, number], keyPrefix: string) => {
    const dx = e[0] - s[0], dy = e[1] - s[1];
    const totalLen = Math.sqrt(dx * dx + dy * dy);
    const longDash = 2.4, shortDash = 0.9, gap = 0.9;
    const segments: React.ReactElement[] = [];
    let pos = 0;
    let isLong = true;
    while (pos < totalLen) {
      const dashLen = isLong ? longDash : shortDash;
      const actual = Math.min(dashLen, totalLen - pos);
      const t1 = pos / totalLen;
      const t2 = (pos + actual) / totalLen;
      segments.push(
        <Line
          name="maida-v-guide"
          key={`${keyPrefix}-${pos}`}
          points={[
            [s[0] + dx * t1, s[1] + dy * t1, s[2]],
            [s[0] + dx * t2, s[1] + dy * t2, s[2]]
          ]}
          color="#FF8800"
          lineWidth={1}
          transparent
          opacity={1.0}
        />
      );
      if (pos + actual >= totalLen) break;
      pos += actual + gap;
      isLong = !isLong;
    }
    return segments;
  };

  // V자 렌더링 헬퍼
  const renderMaidaVLines = (maidaCY: number, maidaH: number, idx: number) => {
    const hw = maidaWidth / 2;
    const hh = mmToThreeUnits(maidaH) / 2;
    const frontZPos = maidaZ + maidaThickness / 2 + 0.002;
    const leftTop: [number, number, number] = [maidaXOffset - hw, maidaCY + hh, frontZPos];
    const centerBottom: [number, number, number] = [maidaXOffset, maidaCY - hh, frontZPos];
    const rightTop: [number, number, number] = [maidaXOffset + hw, maidaCY + hh, frontZPos];
    return (
      <>
        {makeDashedLine(leftTop, centerBottom, `ind-maida-v1-${idx}`)}
        {makeDashedLine(centerBottom, rightTop, `ind-maida-v2-${idx}`)}
      </>
    );
  };

  return (
    <group position={[0, cabinetYPosition, 0]}>
      {/* 서랍 본체 (바닥판 + 뒷판 + 레그라 측판) — 인출 애니메이션 */}
      {showFurniture && (
        <animated.group position-z={spring.z}>
          {/* 1단 서랍 바닥판 */}
          <BoxWithEdges
            args={[drawerBottomWidth, drawerBottomThickness, drawerDepth]}
            position={[0, drawer1BottomY + drawerBottomThickness / 2, drawerZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 1단서랍 바닥판"
            furnitureId={placedFurnitureId}
            bottomRebate={{ width: rebateWidth, height: rebateHeight }}
          />
          {/* 1단 서랍 뒷판 */}
          <BoxWithEdges
            args={[drawerBackWidth, mmToThreeUnits(drawer1BackH), drawerPanelThickness]}
            position={[0, drawer1BottomY + drawerBottomThickness + mmToThreeUnits(drawer1BackH) / 2, drawerBackZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 1단서랍 뒷판"
            furnitureId={placedFurnitureId}
          />
          {/* 2단 서랍 바닥판 */}
          <BoxWithEdges
            args={[drawerBottomWidth, drawerBottomThickness, drawerDepth]}
            position={[0, drawer2BottomY + drawerBottomThickness / 2, drawerZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 2단서랍 바닥판"
            furnitureId={placedFurnitureId}
            bottomRebate={{ width: rebateWidth, height: rebateHeight }}
          />
          {/* 2단 서랍 뒷판 */}
          <BoxWithEdges
            args={[drawerBackWidth, mmToThreeUnits(drawer2BackH), drawerPanelThickness]}
            position={[0, drawer2BottomY + drawerBottomThickness + mmToThreeUnits(drawer2BackH) / 2, drawerBackZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 2단서랍 뒷판"
            furnitureId={placedFurnitureId}
          />
          {/* 1단 서랍 레그라 측판 (GLB 모델) — 사용자 선택 종류(legraDrawerTypes[0]=아래 1단) 반영 */}
          <LegraSideRail
            drawerTier={1}
            drawerBottomY={drawer1BottomY}
            drawerBottomThickness={drawerBottomThickness}
            backPanelHeight={mmToThreeUnits(drawer1BackH)}
            drawerFrontZ={drawerFrontZ}
            sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
            renderMode={renderMode}
            furnitureId={placedFurnitureId}
            legraTypeOverride={drawer1AutoLegraType}
            railDepthMm={railGlbDepthMm}
            railHeightMm={drawer1TotalH}
          />
          {/* 2단 서랍 레그라 측판 (GLB 모델) — 사용자 선택 종류(legraDrawerTypes[1]=위 2단) 반영 */}
          <LegraSideRail
            drawerTier={2}
            drawerBottomY={drawer2BottomY}
            drawerBottomThickness={drawerBottomThickness}
            backPanelHeight={mmToThreeUnits(drawer2BackH)}
            drawerFrontZ={drawerFrontZ}
            sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
            renderMode={renderMode}
            furnitureId={placedFurnitureId}
            legraTypeOverride={legraDrawerTypes?.[1]}
            railDepthMm={railGlbDepthMm}
            railHeightMm={drawer2TotalH}
          />
        </animated.group>
      )}

      {/* 마이다 (도어면) — 인출 애니메이션 + 2D 오버레이/V자 */}
      {hasDoor && (
        <animated.group position-z={spring.z}>
          {/* 1단 서랍 마이다 */}
            <BoxWithEdges
            args={[maidaWidth, mmToThreeUnits(maida1HeightMm), maidaThickness]}
            position={[maidaXOffset, maida1CenterY, maidaZ]}
            material={doorMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 1단서랍(마이다)"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
          {/* 1단 마이다 2D 오버레이 */}
          {showMaidaOverlay && (
            <mesh position={[maidaXOffset, maida1CenterY, maidaZ + maidaThickness / 2 + 0.001]} renderOrder={9999}>
              <planeGeometry args={[maidaWidth, mmToThreeUnits(maida1HeightMm)]} />
              <meshBasicMaterial color={maidaOverlayColor} transparent opacity={0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
            </mesh>
          )}
          {/* 1단 마이다 V자 인출 표시 */}
          {showMaidaOverlay && renderMaidaVLines(maida1CenterY, maida1HeightMm, 0)}

          {/* 2단 서랍 마이다 */}
          <BoxWithEdges
            args={[maidaWidth, mmToThreeUnits(maida2HeightMm), maidaThickness]}
            position={[maidaXOffset, maida2CenterY, maidaZ]}
            material={doorMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 2단서랍(마이다)"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
          {/* 2단 마이다 2D 오버레이 */}
          {showMaidaOverlay && (
            <mesh position={[maidaXOffset, maida2CenterY, maidaZ + maidaThickness / 2 + 0.001]} renderOrder={9999}>
              <planeGeometry args={[maidaWidth, mmToThreeUnits(maida2HeightMm)]} />
              <meshBasicMaterial color={maidaOverlayColor} transparent opacity={0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
            </mesh>
          )}
          {/* 2단 마이다 V자 인출 표시 */}
          {showMaidaOverlay && renderMaidaVLines(maida2CenterY, maida2HeightMm, 1)}
        </animated.group>
      )}

      {/* 마이다 하단 폭 치수 (1단 마이다 기준) — 서랍 애니메이션 밖에서 고정, 공통 컴포넌트 사용 */}
      {hasDoor && showDimensions && (
        <group position={[maidaXOffset, maida1CenterY - mmToThreeUnits(maida1HeightMm) / 2, 0]}>
          <MaidaWidthDimension
            maidaWidthMm={maidaWidthMm}
            maidaWidth={maidaWidth}
            moduleDepthMm={moduleDepthMm}
            maidaZ={maidaZ}
            viewMode={viewMode as '3D' | '2D'}
            view2DDirection={view2DDirection as any}
            dimensionColor={doorDimensionColor}
            mmToThreeUnits={mmToThreeUnits}
          />
        </group>
      )}
      {hasDoor && showDimensions && maidaDimensionSide && (
        <MaidaHeightDimension
          segments={maidaHeightSegments}
          maidaWidth={maidaWidth}
          maidaXOffset={maidaXOffset}
          moduleDepthMm={moduleDepthMm}
          maidaZ={maidaZ}
          viewMode={viewMode as '3D' | '2D'}
          view2DDirection={view2DDirection as any}
          dimensionColor={doorDimensionColor}
          mmToThreeUnits={mmToThreeUnits}
          side={maidaDimensionSide}
        />
      )}
    </group>
  );
};

/**
 * 터치 레그라박스 서랍 + 마이다 (인출 애니메이션 포함)
 * - 도어올림 터치 / 상판내림 터치 전용
 * - 도어 오픈 시 서랍 본체 + 마이다 + 레그라 측판이 함께 Z축으로 슬라이드
 */
interface TouchDrawerAnimatedProps {
  moduleId: string;
  moduleHeightMm: number;
  adjustedHeight: number;
  adjustedWidth?: number;
  basicThickness: number;
  furnitureDepth: number;
  furnitureMaterial: THREE.Material;
  doorMaterial: THREE.Material;
  backPanelThicknessProp?: number;
  renderMode: 'solid' | 'wireframe';
  cabinetYPosition: number;
  placedFurnitureId?: string;
  showFurniture: boolean;
  hasDoor: boolean;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  doorTopGap?: number;
  doorBottomGap?: number;
  stoneThickness?: number;
  floorY?: number;
  maidaDimensionSide?: 'left' | 'right' | null;
  maidaFrontWidthMm?: number;
  maidaXOffset?: number;
}

const TouchDrawerAnimated: React.FC<TouchDrawerAnimatedProps> = ({
  moduleId,
  moduleHeightMm,
  adjustedHeight,
  adjustedWidth,
  basicThickness,
  furnitureDepth,
  furnitureMaterial,
  doorMaterial,
  renderMode,
  cabinetYPosition,
  placedFurnitureId,
  showFurniture,
  hasDoor,
  panelGrainDirections,
  doorTopGap,
  doorBottomGap,
  stoneThickness = 20,
  floorY,
  maidaDimensionSide = null,
  maidaFrontWidthMm,
  maidaXOffset = 0,
}) => {
  const { doorsOpen, isIndividualDoorOpen, isInteriorMaterialMode } = useUIStore();
  const { gl } = useThree();
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(s => s.view2DDirection);
  const view2DTheme = useUIStore(s => s.view2DTheme);
  const showDimensions = useUIStore(s => s.showDimensions);
  const { doorDimensionColor } = useDimensionColor();

  // 도어 오픈 상태 (ExternalDrawerRenderer와 동일 로직)
  const isDoorOpen = (doorsOpen !== null && !isInteriorMaterialMode)
    ? doorsOpen
    : placedFurnitureId ? isIndividualDoorOpen(placedFurnitureId, 0) : false;

  // 애니메이션 중 렌더링 갱신
  const [isAnimating, setIsAnimating] = useState(false);
  useEffect(() => {
    if (isDoorOpen !== undefined) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isDoorOpen]);
  useFrame(() => {
    if (isAnimating && gl && 'invalidate' in gl) {
      (gl as any).invalidate();
    }
  });

  const mmToThreeUnits = (mm: number) => mm * 0.01;
  const DRAWER_OPEN_DISTANCE = mmToThreeUnits(300);

  const spring = useSpring({
    z: isDoorOpen ? DRAWER_OPEN_DISTANCE : 0,
    config: { tension: 90, friction: 16, clamp: true },
  });

  const cabinetHeight = adjustedHeight;
  const cabinetBottomY = -cabinetHeight / 2;
  const basicThicknessMm = basicThickness / 0.01;
  const widthMm = adjustedWidth || 0;

  // === 서랍 본체 기하 ===
  const drawerThicknessMm = 15;
  const bottomSideGapMm = 17;
  const backSideGapMm = 18.5;
  const drawerBottomWidthMm = widthMm - basicThicknessMm * 2 - bottomSideGapMm * 2;
  const drawerBackWidthMm = widthMm - basicThicknessMm * 2 - backSideGapMm * 2;
  // 레일 GLB 깊이 단계(300~500). 레일 측판은 이 깊이의 GLB를 그대로 사용.
  const railGlbDepthMm = resolveLegraDrawerDepthMm(furnitureDepth / 0.01);
  // 서랍 박스(바닥판·뒷판) 깊이 = 레일 깊이 - 10mm (예: 레일 500 → 박스 490).
  const drawerDepthMm = railGlbDepthMm - 10;
  const drawerBottomWidth = mmToThreeUnits(drawerBottomWidthMm);
  const drawerBackWidth = mmToThreeUnits(drawerBackWidthMm);
  const drawerDepth = mmToThreeUnits(drawerDepthMm);
  const drawerThickness = mmToThreeUnits(drawerThicknessMm);
  const drawerFrontZ = furnitureDepth / 2;
  const drawerZ = drawerFrontZ - drawerDepth / 2;
  const drawerBackZ = drawerFrontZ - drawerDepth + drawerThickness / 2;
  const rebateWidth = mmToThreeUnits(38);
  const rebateHeight = mmToThreeUnits(7.5);

  // 모듈 판별
  const isTouch2A = moduleId.includes('lower-door-lift-touch-2tier-a');
  const isTouch2B = moduleId.includes('lower-door-lift-touch-2tier-b');
  const isTouch3 = moduleId.includes('lower-door-lift-touch-3tier');
  const isTDTouch2 = moduleId.includes('lower-top-down-touch-2tier');
  const isTDTouch3 = moduleId.includes('lower-top-down-touch-3tier');
  const isTopDownTouch = isTDTouch2 || isTDTouch3;

  // 서랍 스펙
  // 도어올림 터치 2A: H ≤ 590이면 레그라 측판 228 → 164 (작은 사이즈)로 자동 전환
  const cabHmmForLegra = Math.round(adjustedHeight / 0.01);
  const touch2ASmall = isTouch2A && cabHmmForLegra <= 590;
  const drawerSpecs: [number, number][] = isTouch2A
    ? (touch2ASmall ? [[164, 28], [164, 406]] : [[228, 28], [228, 406]])
    : isTouch2B ? [[228, 28], [164, 406]]
    : isTouch3 ? [[228, 28], [117, 357], [117, 587]]
    : isTDTouch2 ? [[228, 28], [228, 356]]
    : isTDTouch3 ? [[164, 28], [164, 166.4], [164, 438]]
    : [[228, 28], [228, 406]];

  const bottomPanelTopY = cabinetBottomY + mmToThreeUnits(basicThicknessMm);
  // 레그라 종류 override (di=0(아래) → di=N-1(위))
  const legraDrawerTypesRawForDrawers = useFurnitureStore(state => {
    if (!placedFurnitureId) return undefined;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return (pm as any)?.legraDrawerTypes as ('M' | 'L' | 'F')[] | undefined;
  });
  // 레그라 종류별 서랍 본체 표준 높이 (측판 - 바닥두께):
  //   M (M500, 측판 128.5) → 117  | L (L500, 측판 177) → 164  | F (F500, 측판 241) → 228
  const legraHeightByType: Record<'M' | 'L' | 'F', number> = { M: 117, L: 164, F: 228 };
  const drawers = drawerSpecs.map(([dh, offsetFromBottomPanel], idx) => {
    const tierIdx = idx;
    const overrideType = legraDrawerTypesRawForDrawers?.[tierIdx];
    const effDh = overrideType ? legraHeightByType[overrideType] : dh;
    return {
      height: effDh,
      backH: effDh - drawerThicknessMm,
      bottomY: bottomPanelTopY + mmToThreeUnits(offsetFromBottomPanel),
      tier: idx + 1
    };
  });

  // === 마이다 기하 ===
  const moduleWidthMm = adjustedWidth || 0;
  const maidaWidthMm = Math.max(0, (maidaFrontWidthMm ?? moduleWidthMm) - 3);
  const maidaWidth = mmToThreeUnits(maidaWidthMm);
  const maidaThickness = basicThickness;
  const moduleDepthMm = furnitureDepth / 0.01;
  const MAIDA_BACK_GAP_MM = 2;
  const maidaZ = furnitureDepth / 2 + mmToThreeUnits(MAIDA_BACK_GAP_MM) + maidaThickness / 2;

  // 마이다 비례: 2B는 2A와 동일하게 [228, 228] 사용 (서랍 본체 높이만 다름)
  const drawerHeights = isTouch2A ? [228, 228]
    : isTouch2B ? [228, 228]
    : isTouch3 ? [228, 117, 117]
    : isTDTouch2 ? [228, 228]
    : isTDTouch3 ? [164, 164, 164]
    : [228, 228];

  // 상판내림 터치: ㄱ자 상판 하단(=가로전대 하단)과 마이다 최상단 사이 갭을 항상 20mm 유지
  // 가로전대 높이는 stoneThickness별로 다름 (10mm→65, 20mm→55, 30mm→45)
  // 실측 결과 마이다 위치에 5mm 보정이 필요 (이전 공식은 15mm 갭)
  // → defaultTopExt = -(stretcher + 20 + 5) = -(stretcher + 25)
  const tdTouchStretcherH = stoneThickness === 10 ? 65 : stoneThickness === 30 ? 45 : 55;
  const defaultTopExtMm = isTopDownTouch ? -(tdTouchStretcherH + 25) : 30;
  const defaultBottomExtMm = 5;
  const topExtMm = isTopDownTouch
    ? (doorTopGap ?? defaultTopExtMm)
    : (doorTopGap ?? defaultTopExtMm);
  const bottomExtMm = doorBottomGap ?? defaultBottomExtMm;
  const gapTopExt = topExtMm - defaultTopExtMm;
  const gapBottomExt = bottomExtMm - defaultBottomExtMm;
  const totalFrontMm = moduleHeightMm + topExtMm + bottomExtMm;
  const gapMm = 3;
  const drawerCount = drawerHeights.length;
  const totalGaps = (drawerCount - 1) * gapMm;
  const totalMaidaMm = totalFrontMm - totalGaps;
  const totalDrawerH = drawerHeights.reduce((a, b) => a + b, 0);
  // 도어올림 터치 2단(2A/2B): 하→상 [408, 409]
  // 도어올림 터치 3단: 하→상 [360, 227, 227]
  // 상판내림 터치 2단: 하→상 [353, 354]
  // 상판내림 터치 3단: 하→상 [284, 210, 210]
  const isDoorLift2Fixed = drawerCount === 2 && (isTouch2A || isTouch2B);
  const isDoorLift3Fixed = drawerCount === 3 && isTouch3;
  const isTopDown2Fixed = drawerCount === 2 && isTDTouch2;
  const isTopDown3Fixed = drawerCount === 3 && isTDTouch3;
  // 사용자가 가구 편집 팝업에서 지정한 customMaidaHeights 있으면 우선 사용
  //   - 인덱스: di=0(아래) → di=N(위) 순서
  //   - 합이 가구 영역 초과하면 UI에서 막아주므로 여기는 그대로 사용
  const customMaidaHeightsRaw = useFurnitureStore(state => {
    if (!placedFurnitureId) return undefined;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return (pm as any)?.customMaidaHeights as number[] | undefined;
  });
  const legraDrawerTypesRaw = useFurnitureStore(state => {
    if (!placedFurnitureId) return undefined;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return (pm as any)?.legraDrawerTypes as ('M' | 'L' | 'F')[] | undefined;
  });
  const customMaidaValid = customMaidaHeightsRaw
    && customMaidaHeightsRaw.length === drawerHeights.length
    && customMaidaHeightsRaw.every(v => typeof v === 'number' && v > 0);

  const baseMaidaHeightsMm = customMaidaValid
    ? [...customMaidaHeightsRaw!]
    : (isDoorLift2Fixed
      ? [408, 409]
      : isDoorLift3Fixed
        ? [360, 227, 227]
        : isTopDown2Fixed
          ? [353, 354]
          : isTopDown3Fixed
            ? [185, 240, 240]
            : drawerHeights.map(h => (h / totalDrawerH) * totalMaidaMm));
  const maidaTotalFrontMm = isTopDownTouch
    ? totalFrontMm
    : moduleHeightMm + defaultTopExtMm + defaultBottomExtMm;
  const maidaHeightsMm = [...baseMaidaHeightsMm];
  // 도어올림 터치 2A/2B + 상판내림 터치 2단: 1단·2단 마이다 정수 균등 분배
  //   ※ customMaidaHeights 있으면 사용자 입력값 보존 → 스킵
  if (!customMaidaValid && (isDoorLift2Fixed || isTopDown2Fixed) && maidaHeightsMm.length === 2) {
    const total = Math.max(0, maidaTotalFrontMm - gapMm);
    const evenH = Math.floor(total / 2);
    maidaHeightsMm[0] = evenH;
    maidaHeightsMm[1] = evenH;
  }
  // 도어올림 터치 3단: 맨아래(3단) 마이다 360 고정, 위 2칸(1단/2단)은 균등 분배
  //   maida[0] = 3단(맨아래)·360 고정, maida[1] = 2단, maida[2] = 1단
  //   H 변경 시 위 2개 마이다 + 갭이 같이 늘어/줄어듦. 1·2단 서랍은 그에 맞춰 위로 이동.
  if (!customMaidaValid && isDoorLift3Fixed && maidaHeightsMm.length === 3) {
    const bottomFixed = 360;
    maidaHeightsMm[0] = bottomFixed;
    const remaining = Math.max(0, maidaTotalFrontMm - bottomFixed - gapMm * 2);
    const evenH = Math.floor(remaining / 2);
    maidaHeightsMm[1] = evenH;
    maidaHeightsMm[2] = evenH;
  }
  // 도어올림 터치 3단: 상단갭(doorTopGap) 변화량을 1단(맨위) 마이다에 흡수
  //   customMaida 값 보존 + 상단갭 변경 시 1단 마이다 윗변이 그만큼 올라가/내려가도록.
  if (isDoorLift3Fixed && maidaHeightsMm.length === 3) {
    const topExtDeltaMm = topExtMm - defaultTopExtMm;
    if (topExtDeltaMm !== 0) {
      maidaHeightsMm[2] = Math.max(0, maidaHeightsMm[2] + topExtDeltaMm);
    }
  }
  // 상판내림 터치(2단/3단): H 변경 시 상단 묶음(맨 위 마이다들 + 사이 갭) 크기 고정, maida0이 흡수
  //   ※ customMaidaHeights 있으면 사용자 입력값 보존 → 스킵
  if (!customMaidaValid && (isTopDown2Fixed || isTopDown3Fixed) && maidaHeightsMm.length >= 2) {
    const upperMaidasSum = maidaHeightsMm.slice(1).reduce((a, b) => a + b, 0);
    const upperGapsCount = maidaHeightsMm.length - 1;
    const upperBundle = upperMaidasSum + upperGapsCount * gapMm;
    maidaHeightsMm[0] = Math.max(0, maidaTotalFrontMm - upperBundle);
  }

  // 상판내림 터치: 마이다 묶음을 캐비넷 '상단'에서 채워 내려옴
  //   → 맨 위 마이다는 항상 stretcher 하단 - 20mm 위치 (1단)
  //   → 그 아래 마이다(2단)도 고정 위치
  //   → 맨 아래 마이다(3단/maidas[0])가 남은 공간 흡수
  // 그 외(터치 아닌 경우)는 기존대로 바닥에서 위로 누적
  let maidas: { height: number; centerY: number; tier: number; bottomMm: number }[];
  if ((isTopDownTouch || isDoorLift2Fixed || isDoorLift3Fixed) && maidaHeightsMm.length >= 2) {
    // 마이다 영역은 도어갭과 무관. 항상 default 위치 사용.
    //   ※ 도어올림 3단만 예외: 상단갭(topExtMm) 변화량을 시작점(top)에 반영해
    //      1단 마이다 윗변이 도어 상단을 따라 같이 올라가/내려가도록 함.
    const lastIdx = maidaHeightsMm.length - 1;
    const topShiftMm = isDoorLift3Fixed ? (topExtMm - defaultTopExtMm) : 0;
    const topPositionMm = isTopDownTouch
      ? -bottomExtMm + maidaTotalFrontMm
      : -defaultBottomExtMm + maidaTotalFrontMm + topShiftMm;
    let cursorTop = topPositionMm;
    const result: { height: number; centerY: number; tier: number; bottomMm: number }[] = new Array(maidaHeightsMm.length);
    // 맨 위(lastIdx)부터 아래(1)까지 위치 고정
    for (let i = lastIdx; i >= 1; i--) {
      const h = maidaHeightsMm[i];
      const bottomMm = cursorTop - h;
      result[i] = {
        height: h,
        centerY: cabinetBottomY + mmToThreeUnits(bottomMm + h / 2),
        tier: i + 1,
        bottomMm
      };
      cursorTop = bottomMm - gapMm;
    }
    // 맨 아래(0): 항상 자동 흡수 (customMaidaValid 여부와 무관)
    //   하단 = -bottomExtMm (가구 바닥), 상단 = cursorTop (1·2단 묶음 끝)
    //   하단갭 늘리면 가구 바닥 아래로 확장
    const bottomStart = -bottomExtMm;
    result[0] = {
      height: Math.max(0, cursorTop - bottomStart),
      centerY: cabinetBottomY + mmToThreeUnits((bottomStart + cursorTop) / 2),
      tier: 1,
      bottomMm: bottomStart
    };
    maidaHeightsMm[0] = result[0].height;
    maidas = result;
  } else {
    let currentBottomMm = -defaultBottomExtMm;
    maidas = maidaHeightsMm.map((h, idx) => {
      const bottomMm = currentBottomMm;
      const centerY = cabinetBottomY + mmToThreeUnits(currentBottomMm + h / 2);
      currentBottomMm += h + gapMm;
      return { height: h, centerY, tier: idx + 1, bottomMm };
    });
  }

  // 상판내림 터치 + 도어올림 터치 2A/2B: 서랍 2단~ 위치를 마이다 시작점에 묶음
  // - 1단 서랍은 원본 위치 유지 (캐비넷 바닥 기준)
  // - 2단~ 서랍은 마이다 위치 변화에 따라 이동
  const DRAWER_OFFSET_INSIDE_MAIDA = 21;
  if ((isTopDownTouch || isDoorLift2Fixed || isDoorLift3Fixed) && drawers.length >= 2 && maidas.length >= drawers.length) {
    for (let i = 1; i < drawers.length; i++) {
      const newBottomY = cabinetBottomY + mmToThreeUnits(maidas[i].bottomMm + DRAWER_OFFSET_INSIDE_MAIDA);
      drawers[i] = { ...drawers[i], bottomY: newBottomY };
    }
  }
  // 각 서랍 측판 등급을 "Y좌표"로 직접 비교해 자동 결정한다(수동·마이다 크기 무시).
  //  서랍 측판 바닥 Y = drawers[tier-1].bottomY (마이다 이동 반영된 실제 좌표)
  //  기준 상한 Y:
  //   - 맨 위 서랍(목찬넬 칸): 목찬넬 하단 Y − 15(최소 갭). 목찬넬 하단 = moduleHeightMm − (stretcherH + 65).
  //   - 그 외 서랍: 자기 마이다 상단 Y.
  //  조건: 측판 상단 Y(= 측판바닥 + 등급높이) ≤ 상한 Y 인 가장 큰 등급(F228>L164>M117), 없으면 소.
  const drawerTotalCount = drawers.length;
  const mokchannelBottomMm = moduleHeightMm - (tdTouchStretcherH + 65); // 목찬넬 하단(mm, cabinetBottom 기준)
  const MOKCHANNEL_MIN_GAP_MM = 15;
  const touchAutoLegraType = (tier: number): 'M' | 'L' | 'F' => {
    const m = maidas[tier - 1];
    const dr = drawers[tier - 1];
    if (!m || !dr) return 'M';
    const sideBottomY = dr.bottomY; // three units
    const isTopTier = tier === drawerTotalCount;
    const limitY = (isTopTier && isTopDownTouch)
      ? cabinetBottomY + mmToThreeUnits(mokchannelBottomMm - MOKCHANNEL_MIN_GAP_MM)
      : cabinetBottomY + mmToThreeUnits(m.bottomMm + m.height);
    const sideTopY = (bodyMm: number) => sideBottomY + mmToThreeUnits(bodyMm);
    return sideTopY(228) <= limitY ? 'F' : sideTopY(164) <= limitY ? 'L' : 'M';
  };
  // 최종 등급: 사용자 수동 선택(legraDrawerTypesRaw[tier-1])이 있으면 우선, 없으면 마이다 기반 자동.
  const resolveTouchLegraType = (tier: number): 'M' | 'L' | 'F' =>
    (legraDrawerTypesRaw?.[tier - 1] as ('M' | 'L' | 'F') | undefined) ?? touchAutoLegraType(tier);

  // 렌더가 계산한 "자동" 등급(수동 무시)을 store(legraDrawerTypesAuto)에 동기화한다.
  //  → 팝업 드롭다운이 수동값 없을 때 이 자동값을 그대로 표시 → 렌더와 실시간 일치.
  const touchAutoSig = drawers.map(d => touchAutoLegraType(d.tier)).join(',');
  useEffect(() => {
    if (!placedFurnitureId) return;
    const auto = drawers.map(d => touchAutoLegraType(d.tier));
    const pm = useFurnitureStore.getState().placedModules.find(m => m.id === placedFurnitureId);
    const cur = ((pm as any)?.legraDrawerTypesAuto ?? []) as ('M' | 'L' | 'F')[];
    const same = cur.length === auto.length && auto.every((v, i) => cur[i] === v);
    if (!same) {
      useFurnitureStore.getState().updatePlacedModule(placedFurnitureId, { legraDrawerTypesAuto: auto } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedFurnitureId, touchAutoSig]);
  const maidaHeightSegments: MaidaHeightDimensionSegment[] = maidas.flatMap((m, i) => {
    const bottomY = cabinetBottomY + mmToThreeUnits(m.bottomMm);
    const topY = bottomY + mmToThreeUnits(m.height);
    const current = [{
      bottomY,
      topY,
      valueMm: Math.round(m.height * 10) / 10,
      key: `touch-maida-height-${i}`,
    }];
    if (i >= maidas.length - 1) return current;

    const gapMm = maidas[i + 1].bottomMm - (m.bottomMm + m.height);
    if (gapMm <= 0) return current;
    return [
      ...current,
      {
        bottomY: topY,
        topY: topY + mmToThreeUnits(gapMm),
        valueMm: Math.round(gapMm * 10) / 10,
        key: `touch-maida-gap-${i}`,
      },
    ];
  });
  if (maidas.length > 0) {
    const firstMaida = maidas[0];
    const floorLineY = floorY ?? -cabinetYPosition;
    const firstMaidaBottomY = cabinetBottomY + mmToThreeUnits(firstMaida.bottomMm);
    const bottomGapMm = Math.abs((firstMaidaBottomY - floorLineY) / 0.01);
    if (bottomGapMm > 0) {
      maidaHeightSegments.unshift({
        bottomY: Math.min(floorLineY, firstMaidaBottomY),
        topY: Math.max(floorLineY, firstMaidaBottomY),
        valueMm: Math.round(bottomGapMm * 10) / 10,
        key: 'touch-maida-bottom-gap',
      });
    }

    const lastMaida = maidas[maidas.length - 1];
    const lastMaidaTopMm = lastMaida.bottomMm + lastMaida.height;
    const topGapMm = moduleHeightMm - lastMaidaTopMm;
    if (topGapMm > 0) {
      maidaHeightSegments.push({
        bottomY: cabinetBottomY + mmToThreeUnits(lastMaidaTopMm),
        topY: cabinetBottomY + mmToThreeUnits(moduleHeightMm),
        valueMm: Math.round(topGapMm * 10) / 10,
        key: 'touch-maida-top-gap',
      });
    }
  }

  return (
    <group position={[0, cabinetYPosition, 0]}>
    <animated.group position-z={spring.z}>
      <group>
        {/* 서랍 본체 + 레그라 레일 (showFurniture true일 때만) */}
        {showFurniture && drawers.map((d, i) => (
          <React.Fragment key={`touch-drawer-${i}`}>
            {/* 바닥판 (반턱) */}
            <BoxWithEdges
              args={[drawerBottomWidth, drawerThickness, drawerDepth]}
              position={[0, d.bottomY + drawerThickness / 2, drawerZ]}
              material={furnitureMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName={`터치${d.tier}단서랍 바닥판`}
              furnitureId={placedFurnitureId}
              bottomRebate={{ width: rebateWidth, height: rebateHeight }}
            />
            {/* 뒷판 — 자동 등급(마이다 Y좌표 기준) 높이 사용 */}
            {(() => {
              const autoType = resolveTouchLegraType(d.tier);
              const autoBodyH = autoType === 'F' ? 228 : autoType === 'L' ? 164 : 117;
              const autoBackH = autoBodyH - drawerThicknessMm;
              return (
                <>
                  <BoxWithEdges
                    args={[drawerBackWidth, mmToThreeUnits(autoBackH), drawerThickness]}
                    position={[0, d.bottomY + drawerThickness + mmToThreeUnits(autoBackH) / 2, drawerBackZ]}
                    material={furnitureMaterial}
                    renderMode={renderMode}
                    isHighlighted={false}
                    panelName={`터치${d.tier}단서랍 뒷판`}
                    furnitureId={placedFurnitureId}
                  />
                  {/* 레그라 측판 (GLB) — 마이다 Y좌표 기준 자동 등급 */}
                  <LegraSideRail
                    drawerTier={d.tier}
                    drawerBottomY={d.bottomY}
                    drawerBottomThickness={drawerThickness}
                    backPanelHeight={mmToThreeUnits(autoBackH)}
                    drawerFrontZ={drawerFrontZ}
                    sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
                    drawerHeightMm={autoBodyH}
                    maidaHeightMm={maidas[d.tier - 1]?.height}
                    legraTypeOverride={autoType}
                    railDepthMm={railGlbDepthMm}
                    railHeightMm={autoBodyH}
                    renderMode={renderMode}
                    furnitureId={placedFurnitureId}
                  />
                </>
              );
            })()}
          </React.Fragment>
        ))}

        {/* 마이다 (hasDoor true일 때만) */}
        {hasDoor && maidas.map((m, i) => (
          <BoxWithEdges
            key={`touch-maida-${i}`}
            args={[maidaWidth, mmToThreeUnits(m.height), maidaThickness]}
            position={[maidaXOffset, m.centerY, maidaZ]}
            material={doorMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName={`터치${m.tier}단서랍(마이다)`}
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
        ))}
      </group>
    </animated.group>

    {/* 마이다 하단 폭 치수 (맨 아래 마이다 기준) — 서랍 애니메이션 밖에서 고정, 공통 컴포넌트 사용 */}
    {hasDoor && maidas.length > 0 && showDimensions && (() => {
      const m = maidas[0]; // 1단 서랍
      return (
        <group position={[maidaXOffset, m.centerY - mmToThreeUnits(m.height) / 2, 0]}>
          <MaidaWidthDimension
            maidaWidthMm={maidaWidthMm}
            maidaWidth={maidaWidth}
            moduleDepthMm={moduleDepthMm}
            maidaZ={maidaZ}
            viewMode={viewMode as '3D' | '2D'}
            view2DDirection={view2DDirection as any}
            dimensionColor={doorDimensionColor}
            mmToThreeUnits={mmToThreeUnits}
          />
        </group>
      );
    })()}
    {hasDoor && maidas.length > 0 && showDimensions && maidaDimensionSide && (
      <MaidaHeightDimension
        segments={maidaHeightSegments}
        maidaWidth={maidaWidth}
        maidaXOffset={maidaXOffset}
        moduleDepthMm={moduleDepthMm}
        maidaZ={maidaZ}
        viewMode={viewMode as '3D' | '2D'}
        view2DDirection={view2DDirection as any}
        dimensionColor={doorDimensionColor}
        mmToThreeUnits={mmToThreeUnits}
        side={maidaDimensionSide}
      />
    )}
    </group>
  );
};

/**
 * 하부장 컴포넌트
 * - 하부장 선반형, 오픈형, 혼합형을 모두 처리
 * - 공통 렌더링 로직 사용
 * - 상부장과 동일한 구조이지만 하부장 높이(1000mm)로 렌더링
 */
const LowerCabinet: React.FC<FurnitureTypeProps> = ({
  moduleData,
  color,
  isDragging = false,
  isEditMode = false,
  internalHeight,
  hasDoor = false,
  hasBackPanel = true, // 기본값은 true (백패널 있음)
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  doorWidth,
  doorXOffset = 0,
  originalSlotWidth,
  slotIndex,
  slotCenterX,
  adjustedWidth,
  slotWidths, // 듀얼 가구의 개별 슬롯 너비들
  showFurniture = true,
  lowerSectionDepth,
  upperSectionDepth,
  lowerSectionDepthDirection = 'front',
  upperSectionDepthDirection = 'front',
  lowerSectionTopOffset,
  endPanelTopOffset,
  endPanelBottomOffset,
  placedFurnitureId,
  panelGrainDirections,
  backPanelThickness,
  renderMode: renderModeProp,
  zone, // 단내림 영역 정보
  hasBase,
  individualFloatHeight,
  parentGroupY,
  doorTopGap,
  doorBottomGap
}) => {
  const uiSelectedFurnitureId = useUIStore(state => state.selectedFurnitureId);
  const uiSelectedFurnitureIds = useUIStore(state => state.selectedFurnitureIds);
  const activePopup = useUIStore(state => state.activePopup);
  const storeSelectedFurnitureId = useFurnitureStore(state => state.selectedFurnitureId);
  const placedModuleForCorner = useFurnitureStore(state => (
    placedFurnitureId ? state.placedModules.find(p => p.id === placedFurnitureId) : undefined
  )) as any;
  const placedModulesForDoorDimensions = useFurnitureStore(state => state.placedModules);
  const isCurrentModuleFocused = !!placedFurnitureId && (
    uiSelectedFurnitureId === placedFurnitureId ||
    storeSelectedFurnitureId === placedFurnitureId ||
    (uiSelectedFurnitureIds?.includes(placedFurnitureId) ?? false) ||
    (activePopup?.type === 'furnitureEdit' && activePopup?.id === placedFurnitureId)
  );
  const isFreeOrCustomPlacement = spaceInfo?.layoutMode === 'free-placement' || spaceInfo?.customGuideMode === true;
  const isCurrentPositionPlaced = isFreeOrCustomPlacement
    || placedModuleForCorner?.isFreePlacement === true
    || placedModuleForCorner?.guideSlotPlacement === true;
  const maidaDimensionSide: 'left' | 'right' | null = (() => {
    if (placedFurnitureId) {
      const totalSlotCount = (() => {
        if (!spaceInfo) return 0;
        return spaceInfo.customColumnCount || calculateSpaceIndexing(spaceInfo).slotWidths?.length || 0;
      })();
      const internalSpaceForDoorDimensions = spaceInfo ? calculateInternalSpace(spaceInfo) : undefined;
      const currentDimensionCategory = resolveDoorDimensionCategory(moduleData.id, moduleData.category);
      const visibleModules = placedModulesForDoorDimensions
        .filter(module => {
          if (module.isSurroundPanel) return false;
          const candidateModuleData = module.id === placedFurnitureId
            ? moduleData
            : getModuleById(module.moduleId, internalSpaceForDoorDimensions, spaceInfo);
          if (!isDoorDimensionCandidate(module.hasDoor)) return false;
          return resolveDoorDimensionCategory(module.moduleId, candidateModuleData?.category) === currentDimensionCategory;
        })
        .map((module, index) => {
          const isPositionPlacedModule = isFreeOrCustomPlacement
            || module.isFreePlacement === true
            || module.guideSlotPlacement === true;
          const moduleSlotIndex = isPositionPlacedModule ? undefined : module.slotIndex;
          const moduleRightSlotIndex = moduleSlotIndex !== undefined
            ? moduleSlotIndex + (module.isDualSlot ? 1 : 0)
            : undefined;
          return {
            id: module.id,
            x: module.position?.x ?? 0,
            index,
            slotIndex: moduleSlotIndex,
            isRightmostSlot: moduleRightSlotIndex !== undefined
              && totalSlotCount > 0
              && moduleRightSlotIndex >= totalSlotCount - 1,
          };
        });
      const resolvedSides = resolveDoorHeightDimensionSides(visibleModules, placedFurnitureId);
      const sides = placedModuleForCorner?.placementWall === 'right'
        ? { left: resolvedSides.right, right: resolvedSides.left }
        : resolvedSides;
      if (sides.left) return 'left';
      if (sides.right) return 'right';
    }

    const resolvedSlotIndex = typeof slotIndex === 'number'
      ? slotIndex
      : typeof placedModuleForCorner?.slotIndex === 'number'
        ? placedModuleForCorner.slotIndex
        : undefined;
    const indexedSlotWidths = spaceInfo ? calculateSpaceIndexing(spaceInfo).slotWidths : undefined;
    // slotWidths prop은 듀얼 하부장에서 내부 좌/우 폭만 들어올 수 있으므로
    // 외곽 슬롯 판정에는 전체 공간 인덱싱 결과를 우선 사용해야 한다.
    const effectiveSlotWidths = Array.isArray(indexedSlotWidths) && indexedSlotWidths.length > 0
      ? indexedSlotWidths
      : slotWidths;
    const slotCount = Array.isArray(effectiveSlotWidths) ? effectiveSlotWidths.length : 0;
    const isDual = !!placedModuleForCorner?.isDualSlot || moduleData.id.includes('dual-');

    if (!isCurrentPositionPlaced && slotCount > 0 && typeof resolvedSlotIndex === 'number') {
      const endSlotIndex = resolvedSlotIndex + (isDual ? 1 : 0);
      if (resolvedSlotIndex <= 0) return 'left';
      if (endSlotIndex >= slotCount - 1) return 'right';
      return isCurrentModuleFocused ? 'left' : null;
    }

    if (!isCurrentPositionPlaced) {
      return isCurrentModuleFocused ? 'left' : null;
    }

    if (placedModuleForCorner?.placementWall === 'right') return 'right';
    if (placedModuleForCorner?.placementWall === 'left') return 'left';

    const x = placedModuleForCorner?.position?.x ?? slotCenterX ?? 0;
    const internalSpaceForDoorDimensions = spaceInfo ? calculateInternalSpace(spaceInfo) : undefined;
    const currentDimensionCategory = resolveDoorDimensionCategory(moduleData.id, moduleData.category);
    const visibleDoorXs = placedModulesForDoorDimensions
      .filter(module => {
        if (module.isSurroundPanel) return false;
        const candidateModuleData = module.id === placedFurnitureId
          ? moduleData
          : getModuleById(module.moduleId, internalSpaceForDoorDimensions, spaceInfo);
        if (!isDoorDimensionCandidate(module.hasDoor)) return false;
        return resolveDoorDimensionCategory(module.moduleId, candidateModuleData?.category) === currentDimensionCategory;
      })
      .map(module => module.position?.x ?? 0);
    if (visibleDoorXs.length > 0) {
      const leftmostX = Math.min(...visibleDoorXs);
      const rightmostX = Math.max(...visibleDoorXs);
      if (Math.abs(x - leftmostX) <= 0.001) return 'left';
      if (visibleDoorXs.length > 1 && Math.abs(x - rightmostX) <= 0.001) return 'right';
    }

    if (!isCurrentModuleFocused) return null;
    return x > 0 ? 'right' : 'left';
  })();
  const isRightCornerCabinet = moduleData.id.includes('right-corner');
  const isLeftCornerCabinet = moduleData.id.includes('left-corner');
  const isCornerCabinet = isRightCornerCabinet || isLeftCornerCabinet;
  const cornerFrontHingePosition = (
    placedModuleForCorner?.cornerFrontHingePosition
    ?? placedModuleForCorner?.hingePosition
    ?? (isRightCornerCabinet ? 'left' : 'right')
  ) as 'left' | 'right';
  const cornerSideHingePosition = (
    placedModuleForCorner?.cornerSideHingePosition
    ?? (isRightCornerCabinet ? 'right' : 'left')
  ) as 'left' | 'right';
  const { renderMode: contextRenderMode, viewMode, hideAccessories } = useSpace3DView();
  const renderMode = renderModeProp || contextRenderMode;
  
  // 공통 가구 로직 사용
  const { indirectLightEnabled, indirectLightIntensity, view2DDirection } = useUIStore();
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    lowerSectionDepth,
    upperSectionDepth,
    backPanelThicknessMm: backPanelThickness
  });
  const isTopDownModule = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');
  const isTopDownTouchForStretcher = moduleData.id.includes('lower-top-down-touch-') || moduleData.id.includes('dual-lower-top-down-touch-');
  // 실제 stretcher 높이 계산은 stoneThickness 정의 이후로 미룸 (아래 topDownStretcherHeightMm 참조)

  // 띄워서 배치 여부 확인 (간접조명용)
  const placementType = spaceInfo?.baseConfig?.placementType;
  const isFloating = placementType === 'float';
  const floatHeight = isFloating ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
  
  // 2D 모드 체크 - 2D 모드면 간접조명 안 보이게
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  const showIndirectLight = false;
  
  // 띄움 배치 시에도 캐비넷 높이는 변경하지 않음
  const adjustedHeight = baseFurniture.height;
  
  // 띄움 배치 시 Y 위치는 FurnitureItem에서 처리하므로 여기서는 0
  const cabinetYPosition = 0;
  const lowerCabinetBaseFrameMm = hasBase === false || spaceInfo?.baseConfig?.type === 'stand'
    ? 0
    : (placedModuleForCorner?.baseFrameHeight ?? spaceInfo?.baseConfig?.height ?? 105);
  const lowerCabinetFloatMm = hasBase === false
    ? (individualFloatHeight ?? placedModuleForCorner?.individualFloatHeight ?? 0)
    : 0;
  // 마이다 하단갭 기준은 원바닥이 아니라 바닥마감재 윗면이다.
  // 가구 Y 위치 계산에서 바닥마감재 높이는 이미 반영되므로 여기서 다시 빼면
  // 바닥마감재 높이만큼 하단갭 치수가 커진다.
  const lowerCabinetFloorY = -adjustedHeight / 2
    - (lowerCabinetBaseFrameMm + lowerCabinetFloatMm) * 0.01;
  
  // 간접조명 Y 위치 계산 (가구 바닥 바로 아래)
  const furnitureBottomY = cabinetYPosition - adjustedHeight/2;
  const lightY = furnitureBottomY - 0.5; // 가구 바닥에서 50cm 아래

  // 상판 재질 종류 (stone=인조대리석 / pet=도어재질 동일)
  const stoneTopKind = useFurnitureStore(state => {
    if (!placedFurnitureId) return 'stone';
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return (pm?.stoneTopMaterial as 'stone' | 'pet' | undefined) || 'stone';
  });
  // 상판 두께 — PET 재질이면 가구재 선택과 무관하게 18T 고정
  const petMappedThk = PET_PANEL_THICKNESS_MM;
  const stoneThickness = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    const mat = (pm?.stoneTopMaterial as 'stone' | 'pet' | undefined) || 'stone';
    const userThk = pm?.stoneTopThickness || 0;
    // PET: 두께 0이면 상판 없음, 그 외는 PET 매핑 두께
    if (mat === 'pet') return userThk > 0 ? petMappedThk : 0;
    return userThk;
  });

  const maidaFrontWidthMm = useMemo(() => {
    let frontWidth = typeof doorWidth === 'number' && doorWidth > 0
      ? doorWidth
      : typeof originalSlotWidth === 'number' && originalSlotWidth > 0
        ? originalSlotWidth
        : typeof adjustedWidth === 'number' && adjustedWidth > 0
          ? adjustedWidth
          : moduleData?.dimensions?.width ?? 0;

    const openOuterSides = spaceInfo
      ? resolveDoorOuterOpenSides({
        spaceInfo,
        placedModule: placedModuleForCorner,
        moduleWidthMm: frontWidth,
        slotCenterX
      })
      : { left: false, right: false };
    frontWidth += (openOuterSides.left ? 1.5 : 0) + (openOuterSides.right ? 1.5 : 0);

    if (placedModuleForCorner) {
      const epTrimMm = resolvePetPanelThicknessMm((placedModuleForCorner as any).endPanelThickness);
      const leftFrontOffset = Number((placedModuleForCorner as any).leftEndPanelOffset ?? 0);
      const rightFrontOffset = Number((placedModuleForCorner as any).rightEndPanelOffset ?? 0);

      if (placedModuleForCorner.hasLeftEndPanel && leftFrontOffset > 0) {
        frontWidth -= epTrimMm;
      }
      if (placedModuleForCorner.hasRightEndPanel && rightFrontOffset > 0) {
        frontWidth -= epTrimMm;
      }
    }

    const maidaAdjustEnabled = !!(placedModuleForCorner as any)?.maidaWidthAdjustEnabled;
    const maidaAdjustMm = (placedModuleForCorner as any)?.maidaWidthAdjustMm ?? -1.5;
    return Math.max(0, maidaAdjustEnabled ? frontWidth + maidaAdjustMm + 3 : frontWidth);
  }, [
    adjustedWidth,
    doorWidth,
    moduleData?.dimensions?.width,
    originalSlotWidth,
    placedModuleForCorner,
    slotCenterX,
    spaceInfo
  ]);

  const maidaXOffset = useMemo(() => {
    let offset = slotCenterX ?? 0;
    const frontWidth = typeof doorWidth === 'number' && doorWidth > 0
      ? doorWidth
      : typeof originalSlotWidth === 'number' && originalSlotWidth > 0
        ? originalSlotWidth
        : typeof adjustedWidth === 'number' && adjustedWidth > 0
          ? adjustedWidth
          : moduleData?.dimensions?.width ?? 0;
    const openOuterSides = spaceInfo
      ? resolveDoorOuterOpenSides({
        spaceInfo,
        placedModule: placedModuleForCorner,
        moduleWidthMm: frontWidth,
        slotCenterX
      })
      : { left: false, right: false };
    const outerLeftGapCompensationMm = openOuterSides.left ? 1.5 : 0;
    const outerRightGapCompensationMm = openOuterSides.right ? 1.5 : 0;
    offset += ((outerRightGapCompensationMm - outerLeftGapCompensationMm) / 2) * 0.01;

    const isFree = spaceInfo?.layoutMode === 'free-placement' || placedModuleForCorner?.isFreePlacement === true;
    if (isFree && placedModuleForCorner && !placedModuleForCorner.customConfig) {
      const epThk = resolvePetPanelThicknessMm((placedModuleForCorner as any).endPanelThickness) * 0.01;
      const leftEp = placedModuleForCorner.hasLeftEndPanel ? epThk : 0;
      const rightEp = placedModuleForCorner.hasRightEndPanel ? epThk : 0;
      offset += -(leftEp - rightEp) / 2;
    }
    if (placedModuleForCorner) {
      const epTrim = resolvePetPanelThicknessMm((placedModuleForCorner as any).endPanelThickness) * 0.01;
      const leftFrontOffset = Number((placedModuleForCorner as any).leftEndPanelOffset ?? 0);
      const rightFrontOffset = Number((placedModuleForCorner as any).rightEndPanelOffset ?? 0);
      const leftTrim = placedModuleForCorner.hasLeftEndPanel && leftFrontOffset > 0 ? epTrim : 0;
      const rightTrim = placedModuleForCorner.hasRightEndPanel && rightFrontOffset > 0 ? epTrim : 0;
      offset += (leftTrim - rightTrim) / 2;
    }
    return offset;
  }, [
    adjustedWidth,
    doorWidth,
    moduleData?.dimensions?.width,
    originalSlotWidth,
    placedModuleForCorner,
    slotCenterX,
    spaceInfo,
    spaceInfo?.layoutMode
  ]);

  const lowerCabinetSideBoringResult = useMemo(() => {
    const moduleId = moduleData.id;
    if (moduleId.includes('dummy')) {
      return { positions: [], details: [] };
    }
    const isTopDownForBoring = moduleId.includes('lower-top-down-') || moduleId.includes('dual-lower-top-down-');
    const isDirectDowelShelf = isDirectLowerDowelShelfModule(moduleId);
    if (!isTopDownForBoring && !isDirectDowelShelf) {
      return { positions: [], details: [] };
    }

    const sections = Array.isArray(placedModuleForCorner?.customSections)
      ? placedModuleForCorner.customSections
      : (moduleData.modelConfig?.sections || []);
    if (!sections.length) {
      return { positions: [], details: [] };
    }

    const basicThicknessMm = baseFurniture.basicThickness / 0.01;
    const cabinetHeightMm = adjustedHeight / 0.01;
    const depthMm = baseFurniture.depth / 0.01;
    const rawBackPanelMm = backPanelThickness || 9;
    const backPanelMm = rawBackPanelMm === 9.5
      ? 9
      : rawBackPanelMm === 5 || rawBackPanelMm === 5.5
        ? 6
        : rawBackPanelMm === 3.5
          ? 3
          : rawBackPanelMm;
    const backPanelOffsetThicknessMm = resolveNominalBackPanelOffsetThicknessMm(basicThicknessMm);
    const backReductionMm = backPanelMm + backPanelOffsetThicknessMm - 1;
    const baseBoring = calculateShelfBoringPositions({
      sections,
      totalHeightMm: cabinetHeightMm,
      basicThicknessMm,
      additionalDowelBorings: {
        enabled: !!placedModuleForCorner?.additionalDowelBoringsEnabled,
        count: placedModuleForCorner?.additionalDowelBoringCount ?? 0,
        spacingMm: 32,
      },
    });
    const boringDetails = isDirectDowelShelf
      ? [
        ...baseBoring.details.filter(detail => (
          detail.type === 'fixed-panel' &&
          (hasDirectLowerTopPanel(moduleId) || detail.role !== 'top-panel')
        )),
        ...getDirectLowerDowelShelfBoringDetails({
          moduleId,
          cabinetHeightMm,
          basicThicknessMm,
          sections,
          additionalDowelBorings: {
            enabled: !!placedModuleForCorner?.additionalDowelBoringsEnabled,
            count: placedModuleForCorner?.additionalDowelBoringCount ?? 0,
            spacingMm: 32,
          },
        }),
      ].sort((a, b) => a.y - b.y)
      : baseBoring.details;

    const shelfFrontInsetMm = resolveShelfFrontInsetMm({
      moduleId,
      cabinetCategory: 'lower',
      depthMm,
    });
    const topPanelFrontReductionMm = isTopDownForBoring
      ? resolveTopDownTopPanelFrontReductionMm(basicThicknessMm, stoneThickness)
      : 0;
    const mmToUnits = (mm: number) => mm * 0.01;
    const isFixedPanelDetail = (detail: typeof boringDetails[number]) => (
      detail.type === 'fixed-panel' ||
      detail.role === 'bottom-panel' ||
      detail.role === 'top-panel' ||
      detail.role === 'section-divider' ||
      detail.role === 'fixed-shelf'
    );
    const buildHoleZPositions = (detail: typeof boringDetails[number]) => {
      const isFixedPanel = isFixedPanelDetail(detail);
      const frontReductionMm = !isFixedPanel
        ? shelfFrontInsetMm
        : detail.role === 'top-panel'
          ? topPanelFrontReductionMm
          : 0;
      const panelDepthMm = Math.max(1, depthMm - backReductionMm - frontReductionMm);
      const panelCenterZ = mmToUnits(backReductionMm - frontReductionMm) / 2;
      const panelFrontZ = panelCenterZ + mmToUnits(panelDepthMm) / 2;
      const panelBackZ = panelCenterZ - mmToUnits(panelDepthMm) / 2;

      return isFixedPanel
        ? [panelFrontZ - mmToUnits(30), panelCenterZ, panelBackZ + mmToUnits(30)]
        : [panelFrontZ - mmToUnits(30), panelBackZ + mmToUnits(30)];
    };
    const details = boringDetails.map(detail => ({
      ...detail,
      holeZPositions: buildHoleZPositions(detail),
    }));

    return {
      positions: details.map(detail => detail.y),
      details,
    };
  }, [
    adjustedHeight,
    backPanelThickness,
    baseFurniture.basicThickness,
    baseFurniture.depth,
    moduleData.id,
    moduleData.modelConfig?.sections,
    placedModuleForCorner?.additionalDowelBoringCount,
    placedModuleForCorner?.additionalDowelBoringsEnabled,
    placedModuleForCorner?.customSections,
    stoneThickness,
  ]);

  // ㄱ자 꺾인 안쪽 전대(가로전대) 높이 결정
  // - 상판내림 터치/2단/3단/반통/한통: stoneThickness별로 결정
  //   · 대리석 10mm = 65mm, 20mm = 55mm (기본), 30mm = 45mm
  const isTopDown3TierForStretcher = moduleData.id.includes('lower-top-down-3tier') || moduleData.id.includes('dual-lower-top-down-3tier');
  const isTopDown2TierForStretcher = moduleData.id.includes('lower-top-down-2tier') || moduleData.id.includes('dual-lower-top-down-2tier');
  const isTopDownHalfForStretcher = moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half');
  const useStoneThicknessStretcher = isTopDownTouchForStretcher || isTopDown3TierForStretcher || isTopDown2TierForStretcher || isTopDownHalfForStretcher;
  const topDownStretcherHeightMm = isTopDownModule
    ? (useStoneThicknessStretcher
        ? (stoneThickness === 10 ? 65 : stoneThickness === 30 ? 45 : 55)
        : 55)
    : 55;
  const stoneFrontOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    // 상판내림은 두께 무관 23으로 고정 (인조대리석 상판 623)
    const isTopDownFO = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');
    if (isTopDownFO && (pm?.stoneTopThickness || 0) > 0) return 23;
    return pm?.stoneTopFrontOffset || 0;
  });
  const stoneBackOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackOffset || 0;
  });
  const stoneLeftOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopLeftOffset || 0;
  });
  const stoneRightOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopRightOffset || 0;
  });
  const stoneBackLip = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLip || 0;
  });
  const stoneBackLipThickness = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipThickness || 0; // 0이면 상판 두께 사용
  });
  const stoneBackLipDepthOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipDepthOffset || 0;
  });
  const stoneBackLipTopOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 20; // 기본 20mm
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipTopOffset ?? 20;
  });
  const stoneBackLipTopBackOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipTopBackOffset ?? 0;
  });
  const stoneBackLipFullFill = useFurnitureStore(state => {
    if (!placedFurnitureId) return false;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipFullFill || false;
  });
  const stoneBackLipFillHeightOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipFillHeight ?? 0;
  });

  // 상판내림 모듈 여부
  const isTopDown = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');

  // 좌/우 최외곽 하부장 자동 판별 — 분절 서라운드 프레임 옆이면 상판을 프레임 위로 확장
  // 원시값만 selector에서 반환하여 zustand 무한루프 방지
  const placedModulesForOuter = useFurnitureStore(state => state.placedModules);
  const outerExtendLeft = useMemo(() => {
    if (!placedFurnitureId || !spaceInfo) return 0;
    const self = placedModulesForOuter.find(mm => mm.id === placedFurnitureId);
    if (!self) return 0;
    const selfId = self.moduleId || '';
    const isLowerCat = selfId.startsWith('lower-') || selfId.includes('-lower-');
    if (!isLowerCat) return 0;
    const selfW = (self.isFreePlacement && self.freeWidth) ? self.freeWidth : (self.customWidth || self.adjustedWidth || self.moduleWidth || 0);
    const selfCx = Math.round(self.position.x * 100);
    const selfLeft = selfCx - selfW / 2;
    // 자기 좌측 edge가 공간 내경 좌측 경계에 1mm 이내 인접한 경우에만 확장
    const halfSpaceMm = (spaceInfo.width || 0) / 2;
    const leftFrameMM = spaceInfo.frameSize?.left || 0;
    const leftBoundaryMm = -halfSpaceMm + leftFrameMM;
    const isAdjLeft = Math.abs(selfLeft - leftBoundaryMm) <= 1;
    return isAdjLeft ? leftFrameMM : 0;
  }, [placedModulesForOuter, placedFurnitureId, spaceInfo?.frameSize?.left, spaceInfo?.width]);
  const outerExtendRight = useMemo(() => {
    if (!placedFurnitureId || !spaceInfo) return 0;
    const self = placedModulesForOuter.find(mm => mm.id === placedFurnitureId);
    if (!self) return 0;
    const selfId = self.moduleId || '';
    const isLowerCat = selfId.startsWith('lower-') || selfId.includes('-lower-');
    if (!isLowerCat) return 0;
    const selfW = (self.isFreePlacement && self.freeWidth) ? self.freeWidth : (self.customWidth || self.adjustedWidth || self.moduleWidth || 0);
    const selfCx = Math.round(self.position.x * 100);
    const selfRight = selfCx + selfW / 2;
    const halfSpaceMm = (spaceInfo.width || 0) / 2;
    const rightFrameMM = spaceInfo.frameSize?.right || 0;
    const rightBoundaryMm = halfSpaceMm - rightFrameMM;
    const isAdjRight = Math.abs(selfRight - rightBoundaryMm) <= 1;
    return isAdjRight ? rightFrameMM : 0;
  }, [placedModulesForOuter, placedFurnitureId, spaceInfo?.frameSize?.right, spaceInfo?.width]);

  // 상판 깊이 통일: 배치된 모든 하부장 중 가장 깊은 깊이에 맞춰 상판을 설치한다.
  //  - 가구는 앞면이 일직선으로 정렬되어 있고(앞면정렬), 깊이가 다르면 뒷면 위치가 다르다.
  //  - 얕은 가구는 뒷벽과 틈이 생기므로, 상판을 뒤쪽(뒷벽 방향)으로 확장해 뒷벽에 붙인다.
  //  - 앞면은 그대로 유지되어 깊은 가구 상판과 앞면이 일치한다.
  const unifiedFurnitureDepthMm = useMemo(
    () => calculateFurnitureDepth(placedModulesForOuter, spaceInfo),
    [placedModulesForOuter, spaceInfo]
  );

  const stoneTopData = useMemo(() => {
    if (stoneThickness <= 0) return null;
    const furW = adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width;
    const selfD = baseFurniture.depth; // 자기 가구 깊이 (Three 단위)
    // 전체 하부장 중 최대 깊이로 통일 (자기 깊이보다 작아지지 않도록 보정)
    const unifiedD = Math.max(selfD, unifiedFurnitureDepthMm * 0.01);
    // 통일로 늘어난 깊이만큼 뒤로 확장 → 뒷벽에 붙고 앞면은 유지 (Z+ = 앞쪽)
    const backExtend = (unifiedD - selfD) / 2;
    const fo = stoneFrontOff * 0.01;
    const bo = stoneBackOff * 0.01;
    const lo = (stoneLeftOff + outerExtendLeft) * 0.01;
    const ro = (stoneRightOff + outerExtendRight) * 0.01;
    const lipThicknessMm = stoneBackLipThickness || stoneThickness; // 미설정 시 상판 두께 사용
    return {
      thickness: stoneThickness * 0.01,
      width: furW + lo + ro,
      depth: unifiedD + fo + bo,
      xOffset: (ro - lo) / 2,
      zOffset: (fo - bo) / 2 - backExtend,
      backLipHeight: stoneBackLip * 0.01, // mm → m
      backLipThickness: lipThicknessMm * 0.01, // mm → m
      backLipDepthOffset: stoneBackLipDepthOff * 0.01, // mm → m
      backLipTopOffset: stoneBackLipTopOff * 0.01,    // mm → m
      backLipTopBackOffset: stoneBackLipTopBackOff * 0.01, // mm → m
      backLipFullFill: stoneBackLipFullFill,
      backLipFillHeight: stoneBackLipFillHeightOff * 0.01, // mm → m
    };
  }, [stoneThickness, stoneFrontOff, stoneBackOff, stoneLeftOff, stoneRightOff, outerExtendLeft, outerExtendRight, stoneBackLip, stoneBackLipThickness, stoneBackLipDepthOff, stoneBackLipTopOff, stoneBackLipTopBackOff, stoneBackLipFullFill, stoneBackLipFillHeightOff, adjustedWidth, baseFurniture.width, baseFurniture.depth, unifiedFurnitureDepthMm]);

  const topEndPanelData = useMemo(() => {
    if (placedModuleForCorner?.hasTopEndPanel !== true) return null;
    const frontOffset = resolveTopEndPanelFrontOffsetMm(
      placedModuleForCorner.moduleId,
      placedModuleForCorner.doorTopGap,
      (placedModuleForCorner as any).topEndPanelOffset
    ) * 0.01;
    const backOffset = ((placedModuleForCorner as any).topEndPanelBackOffset ?? 0) * 0.01;
    const thickness = resolvePetPanelThicknessMm((placedModuleForCorner as any).endPanelThickness) * 0.01;
    const backLipHeight = Math.max(0, ((placedModuleForCorner as any).topEndPanelBackLip ?? 0) * 0.01);
    const backLipThickness = Math.max(
      0.01,
      (((placedModuleForCorner as any).topEndPanelBackLipThickness ?? resolvePetPanelThicknessMm((placedModuleForCorner as any).endPanelThickness)) * 0.01)
    );
    const sideEpThickness = thickness;
    const sideEpTopExtension = Number(endPanelTopOffset ?? (placedModuleForCorner as any).endPanelTopOffset ?? 0);
    const sideEpWrapsTop = sideEpTopExtension > 0;
    const leftCover = placedModuleForCorner.hasLeftEndPanel && !sideEpWrapsTop ? sideEpThickness : 0;
    const rightCover = placedModuleForCorner.hasRightEndPanel && !sideEpWrapsTop ? sideEpThickness : 0;
    const panelFrontZ = baseFurniture.depth / 2 + frontOffset;
    const panelBackZ = -baseFurniture.depth / 2 - backOffset;
    const depth = Math.max(0.01, panelFrontZ - panelBackZ);
    return {
      thickness,
      width: (adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width) + leftCover + rightCover,
      depth,
      xOffset: (rightCover - leftCover) / 2,
      zOffset: (panelFrontZ + panelBackZ) / 2,
      backLipHeight,
      backLipThickness,
    };
  }, [
    placedModuleForCorner?.hasTopEndPanel,
    placedModuleForCorner?.hasLeftEndPanel,
    placedModuleForCorner?.hasRightEndPanel,
    (placedModuleForCorner as any)?.topEndPanelOffset,
    (placedModuleForCorner as any)?.topEndPanelBackOffset,
    (placedModuleForCorner as any)?.topEndPanelBackLip,
    (placedModuleForCorner as any)?.topEndPanelBackLipThickness,
    (placedModuleForCorner as any)?.endPanelThickness,
    endPanelTopOffset,
    adjustedWidth,
    baseFurniture.width,
    baseFurniture.depth
  ]);

  // 상판 재질 — PET이면 도어 재질 동일, stone이면 countertop(루나쉐도우 기본)
  const LUNA_SHADOW_TEXTURE = '/materials/countertop/luna_shadow_hanwha.png';
  const isPetTop = stoneTopKind === 'pet';
  const countertopTextureUrl = isPetTop
    ? (spaceInfo?.materialConfig?.doorTexture ?? spaceInfo?.materialConfig?.interiorTexture ?? null)
    : (spaceInfo?.materialConfig?.countertopTexture ?? LUNA_SHADOW_TEXTURE);
  const countertopColorVal = isPetTop
    ? (spaceInfo?.materialConfig?.doorColor || spaceInfo?.materialConfig?.interiorColor || '#FFFFFF')
    : (spaceInfo?.materialConfig?.countertopColor || '#FFFFFF');
  const stoneTopMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const stoneTopMaterial = useMemo(() => {
    if (!stoneTopData) return null;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(countertopColorVal),
      metalness: 0.0, roughness: 0.6, envMapIntensity: 0.0,
    });
    stoneTopMatRef.current = mat;
    return mat;
  }, [!!stoneTopData, isPetTop]);

  // countertop 색상 변경 반영
  useEffect(() => {
    if (stoneTopMatRef.current && !stoneTopMatRef.current.map) {
      stoneTopMatRef.current.color.set(countertopColorVal);
      stoneTopMatRef.current.needsUpdate = true;
    }
  }, [countertopColorVal, stoneTopMaterial]);

  // countertop 텍스처 로딩
  useEffect(() => {
    const mat = stoneTopMatRef.current;
    if (!mat) return;
    if (countertopTextureUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(countertopTextureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.colorSpace = THREE.SRGBColorSpace;
        mat.map = texture;
        mat.color.set('#ffffff');
        mat.toneMapped = false;
        mat.envMapIntensity = 0.0;
        mat.roughness = 0.8;
        mat.metalness = 0.0;
        mat.needsUpdate = true;
      });
    } else {
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.color.set(countertopColorVal);
      mat.needsUpdate = true;
    }
  }, [countertopTextureUrl, countertopColorVal, stoneTopMaterial]);

  // 상판내림 반통/한통 L프레임용 도어 재질 (텍스처 로드 포함)
  const doorTextureUrl = spaceInfo?.materialConfig?.doorTexture;
  const doorColorVal = baseFurniture.doorColor || '#E0E0E0';
  const doorMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lFrameDoorMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(doorColorVal),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
    });
    doorMaterialRef.current = mat;
    return mat;
  }, []);

  useEffect(() => {
    if (doorMaterialRef.current) {
      if (!doorMaterialRef.current.map) {
        doorMaterialRef.current.color.set(doorColorVal);
      }
      doorMaterialRef.current.needsUpdate = true;
    }
  }, [doorColorVal]);

  useEffect(() => {
    const mat = doorMaterialRef.current;
    if (!mat) return;
    if (doorTextureUrl) {
      if (isOakTexture(doorTextureUrl)) {
        applyOakTextureSettings(mat);
      } else if (isCabinetTexture1(doorTextureUrl)) {
        applyCabinetTexture1Settings(mat);
      }
      const loader = new THREE.TextureLoader();
      loader.load(doorTextureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        mat.map = texture;
        if (isOakTexture(doorTextureUrl)) {
          applyOakTextureSettings(mat);
        } else if (isCabinetTexture1(doorTextureUrl)) {
          applyCabinetTexture1Settings(mat);
        } else {
          applyDefaultImageTextureSettings(mat);
        }
        mat.needsUpdate = true;
        requestAnimationFrame(() => { mat.needsUpdate = true; });
      });
    } else {
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.color.set(doorColorVal);
      mat.toneMapped = true;
      mat.roughness = 0.6;
      mat.needsUpdate = true;
    }
  }, [doorTextureUrl, doorColorVal]);

  return (
    <>
      {/* 간접조명 렌더링 (띄워서 배치 시) */}
      {showIndirectLight && (
        <IndirectLight
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width} // 조정된 너비 우선 사용 (mm를 Three.js 단위로 변환)
          depth={baseFurniture.depth}
          intensity={indirectLightIntensity || 0.8}
          position={[0, lightY, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          <group position={[0, cabinetYPosition, 0]}>
            <BaseFurnitureShell
              {...baseFurniture}
              height={adjustedHeight}
              isDragging={isDragging}
              isEditMode={isEditMode}
              hasBackPanel={hasBackPanel}
              spaceInfo={spaceInfo}
              moduleData={moduleData}
              placedFurnitureId={placedFurnitureId}
              lowerSectionDepthMm={baseFurniture.lowerSectionDepthMm}
              upperSectionDepthMm={baseFurniture.upperSectionDepthMm}
              lowerSectionDepthDirection={lowerSectionDepthDirection}
              upperSectionDepthDirection={upperSectionDepthDirection}
              lowerSectionTopOffsetMm={lowerSectionTopOffset}
              endPanelTopOffsetMm={endPanelTopOffset}
              endPanelBottomOffsetMm={endPanelBottomOffset}
              renderMode={renderMode}
              isFloating={isFloating}
              hideVentilationCap={true}
              hideTopPanel={!moduleData.id.includes('lower-door-lift-') && !moduleData.id.includes('lower-top-down-')}
              topPanelFrontReduction={(() => {
                if (!moduleData.id.includes('lower-top-down-')) return 0;
                return resolveTopDownTopPanelFrontReductionMm(baseFurniture.basicThickness / 0.01, stoneThickness);
              })()}
              topStretcher={isTopDownModule ? { heightMm: topDownStretcherHeightMm, depthMm: 40 } : undefined}
              stoneTopThickness={stoneThickness}
              {...(moduleData.id.includes('lower-door-lift-touch-') ? {
                // 도어올림 터치: 따내기 없음
              } : moduleData.id.includes('lower-top-down-touch-') ? (() => {
                // 상판내림 터치: 측판 따내기는 가로전대 바로 아래에 위치
                // 따내기 하단 = 캐비넷 상단 - (stretcherH + notchHeight 65)
                //   stoneThickness 10 → stretcher 45 → fromBottom = H - 110
                //   stoneThickness 20 → stretcher 55 → fromBottom = H - 120 (= 665 @ H=785)
                //   stoneThickness 30 → stretcher 65 → fromBottom = H - 130
                const cabinetHmm_tdt = Math.round(adjustedHeight / 0.01);
                const notchHForTDT = 65;
                const fromBottomTDT = cabinetHmm_tdt - (topDownStretcherHeightMm + notchHForTDT);
                return {
                  sideNotches: [{ y: notchHForTDT, z: 40, fromBottom: fromBottomTDT }]
                };
              })() : moduleData.id.includes('lower-drawer-3tier') ? (() => {
                // 3단서랍장 H 변경 시 측판 노치도 캐비넷 상단에 붙어 평행이동
                // H=785 기준 [295, 510] → delta = H - 785
                const cabinetHmm = Math.round(adjustedHeight / 0.01);
                const delta3 = cabinetHmm - 785;
                return {
                  sideNotches: [
                    { y: 65, z: 40, fromBottom: 295 + delta3 },
                    { y: 65, z: 40, fromBottom: 510 + delta3 },
                  ]
                };
              })() : moduleData.id.includes('lower-drawer-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: (Math.round(adjustedHeight / 0.01) - 125) / 2 }]
              } : moduleData.id.includes('lower-door-lift-3tier') ? {
                // 도어올림 3단: notch1=315(고정), notch2는 위 2개 도어 균등 분할 (LowerCabinet.tsx doorLift3TierNotch2와 동일 공식)
                sideNotches: [
                  { y: 65, z: 40, fromBottom: 315 },
                  { y: 65, z: 40, fromBottom: Math.max(380, Math.max(0, Math.round((Math.round(adjustedHeight / 0.01) - 365) / 2)) + 335) }
                ]
              } : moduleData.id.includes('lower-door-lift-2tier') ? {
                // 도어올림 2단 반통: 몸통 H 변경 시 노치 위치 동적 계산 (LowerCabinet.tsx 1362 doorLift2TierNotch와 동일 공식)
                sideNotches: [{ y: 65, z: 40, fromBottom: Math.max(0, Math.round((Math.round(adjustedHeight / 0.01) - 75) / 2)) }]
              } : moduleData.id.includes('lower-top-down-3tier') ? (() => {
                // 상판내림 3단: H 변경 + stoneThickness별 stretcher 변화로 측판 노치 위치 동적 계산
                // - H 변화 (delta): 노치 전체 평행이동 (마이다1만 흡수)
                // - stretcher 변화 (stoneThickness): 10mm→65, 20mm→55, 30mm→45
                //   stretcherDelta>0 (10mm) → 묶음 아래로 → fromBottom -= delta
                //   stretcherDelta<0 (30mm) → 묶음 위로   → fromBottom += |delta|
                const cabinetHmmTd3 = Math.round(adjustedHeight / 0.01);
                const deltaTd3 = cabinetHmmTd3 - 785;
                const td3StretcherH = stoneThickness === 10 ? 65 : stoneThickness === 30 ? 45 : 55;
                const td3StretcherDelta = td3StretcherH - 55;
                return {
                  sideNotches: [
                    { y: 65, z: 40, fromBottom: 225 + deltaTd3 - td3StretcherDelta },
                    { y: 65, z: 40, fromBottom: 445 + deltaTd3 - td3StretcherDelta },
                    { y: 65, z: 40, fromBottom: 665 + deltaTd3 - td3StretcherDelta },
                  ]
                };
              })() : moduleData.id.includes('lower-top-down-2tier') ? (() => {
                // 상판내림 2단: 두 서랍 균등 + 상단 묶음 위로 평행이동
                // 중간 노치 = (cabH_normalized - 185) / 2 — stoneThk 변경에 따른 cabH 변동 흡수
                //   (cabH_normalized = cabH + stoneThk - 20 → 사용자 H 변경 없으면 항상 785)
                // 상단 노치 = H - (stretcher + 65) — stoneThk별로 stretcher 가변
                const cabHmm2 = Math.round(adjustedHeight / 0.01);
                const cabHNorm2 = cabHmm2 + stoneThickness - 20;
                return {
                  sideNotches: [
                    { y: 65, z: 40, fromBottom: Math.round((cabHNorm2 - 185) / 2) },
                    { y: 65, z: 40, fromBottom: cabHmm2 - (topDownStretcherHeightMm + 65) },
                  ]
                };
              })() : (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half')) ? (() => {
                // 상판내림 반통/한통: 노치 = 가로전대 바로 아래 (stoneThk별 stretcher 반영)
                const cabHmmH = Math.round(adjustedHeight / 0.01);
                return {
                  sideNotches: [{ y: 65, z: 40, fromBottom: cabHmmH - (topDownStretcherHeightMm + 65) }]
                };
              })() : {})}>
            {/* 내부 구조는 항상 렌더링 (서랍/선반) */}
            <>
                {/* 듀얼 가구인 경우 좌우 섹션 별도 렌더링 */}
                {baseFurniture.modelConfig.leftSections && baseFurniture.modelConfig.rightSections ? (
                  <>
                    {/* 왼쪽 섹션 - 왼쪽 구획의 중앙에서 왼쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[-(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 - baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.leftSections }}
                        height={adjustedHeight}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        placedFurnitureId={placedFurnitureId}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                    
                    {/* 중앙 분리대 - BoxWithEdges 사용 */}
                    <BoxWithEdges
                      args={[baseFurniture.basicThickness, adjustedHeight - baseFurniture.basicThickness * 2, baseFurniture.adjustedDepthForShelves]}
                      position={[0, 0, baseFurniture.shelfZOffset]}
                      material={baseFurniture.material}
                      renderMode={renderMode}
                      panelName="칸막이"
                      furnitureId={placedFurnitureId}
                    />
                    
                    {/* 오른쪽 섹션 - 오른쪽 구획의 중앙에서 오른쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 + baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.rightSections }}
                        height={adjustedHeight}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        placedFurnitureId={placedFurnitureId}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                  </>
                ) : (
                  /* 싱글 가구인 경우 기존 방식 */
                  <SectionsRenderer
                    modelConfig={baseFurniture.modelConfig}
                    height={adjustedHeight}
                    innerWidth={baseFurniture.innerWidth}
                    depth={baseFurniture.depth}
                    adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                    basicThickness={baseFurniture.basicThickness}
                    shelfZOffset={baseFurniture.shelfZOffset}
                    material={baseFurniture.material}
                    furnitureId={moduleData.id}
                    calculateSectionHeight={baseFurniture.calculateSectionHeight}
                    mmToThreeUnits={baseFurniture.mmToThreeUnits}
                    renderMode={renderMode}
                    placedFurnitureId={placedFurnitureId}
                    lowerSectionTopOffsetMm={lowerSectionTopOffset}
                    isFloatingPlacement={isFloating}
                    shelfFrontInsetMm={resolveShelfFrontInsetMm({
                      moduleId: moduleData.id,
                      cabinetCategory: moduleData.category,
                      depthMm: baseFurniture?.actualDepthMm
                    })}
                  />
                )}

                {isCornerCabinet && (() => {
                  const mmToUnits = (mm: number) => mm * 0.01;
                  const frameWidthMm = 18;
                  const frameWidth = mmToUnits(frameWidthMm);
                  const frameDepth = mmToUnits(58);
                  const cabinetBottomY = -adjustedHeight / 2;
                  const bottomPanelTopY = cabinetBottomY + baseFurniture.basicThickness;
                  const notchFromBottomMm = Math.round(adjustedHeight / 0.01) - 60;
                  const frameTopY = cabinetBottomY + mmToUnits(notchFromBottomMm);
                  const frameHeight = Math.max(0, frameTopY - bottomPanelTopY);
                  const frameCenterY = bottomPanelTopY + frameHeight / 2;
                  const sideFrameHeight = Math.max(0, frameTopY - cabinetBottomY);
                  const sideFrameCenterY = cabinetBottomY + sideFrameHeight / 2;
                  const frameZ = baseFurniture.depth / 2 - frameDepth / 2;
                  const frontFrameRightX = frameDepth;
                  const frontFrameX = frontFrameRightX - frameDepth / 2;
                  const rightSideOuterX = baseFurniture.width / 2;
                  const rightFrontFrameX = rightSideOuterX - frameDepth / 2;
                  const sideFrameZ = baseFurniture.depth / 2 + frameWidth / 2;
                  const frontSlotWidthMm = (isLeftCornerCabinet ? slotWidths?.[0] : slotWidths?.[slotWidths.length - 1])
                    ?? (adjustedWidth || moduleData.dimensions.width) / 2;
                  const sideCabinetDepthMm = Math.max(1, frontSlotWidthMm - 23);
                  const totalSideDepthMm = Math.max(
                    baseFurniture.actualDepthMm,
                    spaceInfo?.depth || baseFurniture.actualDepthMm
                  );
                  const remainingSideDepthMm = Math.max(0, totalSideDepthMm - baseFurniture.actualDepthMm);
                  const sideSlotCount = remainingSideDepthMm > 0.5
                    ? Math.max(1, Math.ceil(remainingSideDepthMm / 600))
                    : 0;
                  const sideCabinetWidthMm = sideSlotCount > 0
                    ? remainingSideDepthMm / sideSlotCount
                    : 0;
                  const sideCabinetWidth = mmToUnits(sideCabinetWidthMm);
                  const sideCabinetBodyWidthMm = Math.max(1, sideCabinetWidthMm - frameWidthMm);
                  const sideCabinetBodyWidth = mmToUnits(sideCabinetBodyWidthMm);
                  const sideCabinetDepth = mmToUnits(sideCabinetDepthMm);
                  const sideCabinetInnerWidth = Math.max(0.01, sideCabinetBodyWidth - baseFurniture.basicThickness * 2);
                  const sideCabinetInnerHeight = Math.max(0.01, adjustedHeight - baseFurniture.basicThickness * 2);
                  const sideCabinetHeight = adjustedHeight;
                  const sideCabinetCenterX = baseFurniture.width / 2 - sideCabinetDepth / 2;
                  const sideCabinetCenterZ = baseFurniture.depth / 2 + frameWidth + sideCabinetBodyWidth / 2;
                  const sideAssemblyCenterZ = baseFurniture.depth / 2 + sideCabinetWidth / 2;
                  const sideCabinetAdjustedDepthForShelves = Math.max(
                    0.01,
                    sideCabinetDepth - baseFurniture.basicThickness
                  );
                  const sideCabinetShelfZOffset = -baseFurniture.basicThickness / 2;
                  const sidePlacedFurnitureId = placedFurnitureId;
                  const sideModuleData = { id: 'lower-half-cabinet-side-corner-shell' };
                  const sideDoorModuleData = {
                    ...moduleData,
                    id: 'lower-half-cabinet-side-corner-door',
                    name: '우측코너장 측면가구',
                    category: 'lower' as const,
                    dimensions: {
                      width: sideCabinetBodyWidthMm,
                      height: Math.round(sideCabinetHeight / 0.01),
                      depth: sideCabinetDepthMm
                    },
                    hasDoor: true,
                    slotWidths: undefined
                  };
                  const sideNotchHeightMm = 60;
                  const sideBasicThicknessMm = baseFurniture.basicThickness / 0.01;
                  const sideVerticalFrameHeightMm = Math.max(0, sideNotchHeightMm - sideBasicThicknessMm);
                  const sideChannelDepthMm = 40;
                  const sideChannelHorizontalExtensionMm = 18;
                  const sideChannelVerticalExtensionMm = 58;
                  const sideChannelHorizontalWidth = sideCabinetBodyWidth + mmToUnits(sideChannelHorizontalExtensionMm);
                  const sideChannelHorizontalX = -mmToUnits(sideChannelHorizontalExtensionMm) / 2;
                  const sideChannelVerticalWidth = sideCabinetBodyWidth + mmToUnits(sideChannelVerticalExtensionMm);
                  const sideChannelVerticalX = -mmToUnits(sideChannelVerticalExtensionMm) / 2;
                  const sideCabinetBottomY = -sideCabinetHeight / 2;
                  const sideNotchFromBottomMm = Math.round(sideCabinetHeight / 0.01) - sideNotchHeightMm;
                  const sideHorzFrameY = sideCabinetBottomY
                    + mmToUnits(sideNotchFromBottomMm)
                    + baseFurniture.basicThickness / 2;
                  const sideHorzFrameZ = sideCabinetDepth / 2 - mmToUnits(sideChannelDepthMm) / 2;
                  const sideVertFrameY = sideCabinetBottomY
                    + mmToUnits(sideNotchFromBottomMm)
                    + baseFurniture.basicThickness
                    + mmToUnits(sideVerticalFrameHeightMm) / 2;
                  const sideVertFrameZ = sideCabinetDepth / 2
                    - mmToUnits(sideChannelDepthMm)
                    + baseFurniture.basicThickness / 2;
                  const placedModuleForSideBase = placedFurnitureId
                    ? useFurnitureStore.getState().placedModules.find(p => p.id === placedFurnitureId)
                    : undefined;
                  const rawSideBaseFrameHeightMm = (placedModuleForSideBase as any)?.baseFrameHeight
                    ?? spaceInfo?.baseConfig?.height
                    ?? 65;
                  const sideBaseFrameGapMm = rawSideBaseFrameHeightMm > 0
                    ? Math.max(0, Math.min(rawSideBaseFrameHeightMm, (placedModuleForSideBase as any)?.baseFrameGap ?? 0))
                    : 0;
                  const sideBaseFrameHeightMm = Math.max(0, rawSideBaseFrameHeightMm - sideBaseFrameGapMm);
                  const sideBaseFrameHeight = mmToUnits(sideBaseFrameHeightMm);
                  const sideBaseFrameGap = mmToUnits(sideBaseFrameGapMm);
                  const sideBaseFrameDepth = frameWidth;
                  const globalSideBaseFrameOffsetMm = (spaceInfo?.baseConfig as any)?.offset;
                  const useGlobalSideBaseFrameOffset = spaceInfo?.guideBaseFrameAllMode ?? true;
                  const sideBaseFrameOffsetMm = useGlobalSideBaseFrameOffset && typeof globalSideBaseFrameOffsetMm === 'number'
                    ? globalSideBaseFrameOffsetMm
                    : ((placedModuleForSideBase as any)?.baseFrameOffset ?? globalSideBaseFrameOffsetMm ?? 65);
                  const sideBaseFrameZ = sideCabinetDepth / 2
                    - sideBaseFrameDepth / 2
                    - mmToUnits(spaceInfo?.baseConfig?.depth ?? 0)
                    - mmToUnits(sideBaseFrameOffsetMm);
                  const sideBaseFrameY = sideCabinetBottomY - sideBaseFrameHeight / 2;
                  const shouldRenderSideBaseFrame = hasBase !== false
                    && sideBaseFrameHeightMm > 0
                    && spaceInfo?.baseConfig?.type !== 'stand'
                    && !(viewMode === '2D' && view2DDirection === 'top');
                  const cornerGhostMode = isEditMode && viewMode === '3D';

                  return (
                    <group scale={[isLeftCornerCabinet ? -1 : 1, 1, 1]}>
                      {sideCabinetWidthMm > 0 && (
                        <group
                          position={[sideCabinetCenterX, 0, sideCabinetCenterZ]}
                          rotation={[0, -Math.PI / 2, 0]}
                        >
                          <BaseFurnitureShell
                            width={sideCabinetBodyWidth}
                            height={sideCabinetHeight}
                            depth={sideCabinetDepth}
                            innerWidth={sideCabinetInnerWidth}
                            innerHeight={sideCabinetInnerHeight}
                            basicThickness={baseFurniture.basicThickness}
                            backPanelThickness={baseFurniture.backPanelThickness}
                            adjustedDepthForShelves={sideCabinetAdjustedDepthForShelves}
                            shelfZOffset={sideCabinetShelfZOffset}
                            material={baseFurniture.material}
                            isMultiSectionFurniture={() => false}
                            getSectionHeights={() => []}
                            mmToThreeUnits={baseFurniture.mmToThreeUnits}
                            isDragging={isDragging || cornerGhostMode}
                            isEditMode={isEditMode}
                            hasBackPanel={hasBackPanel}
                            moduleData={sideModuleData}
                            placedFurnitureId={sidePlacedFurnitureId}
                            spaceInfo={spaceInfo}
                            renderMode={renderMode}
                            isFloating={isFloating}
                            showFurniture={showFurniture}
                            hideVentilationCap={true}
                            hideTopPanel={true}
                            textureUrl={baseFurniture.textureUrl}
                            panelGrainDirections={panelGrainDirections}
                          />
                          <BoxWithEdges
                            args={[sideChannelHorizontalWidth, baseFurniture.basicThickness, mmToUnits(sideChannelDepthMm)]}
                            position={[sideChannelHorizontalX, sideHorzFrameY, sideHorzFrameZ]}
                            material={lFrameDoorMaterial}
                            renderMode={renderMode}
                            isDragging={isDragging || cornerGhostMode}
                            isHighlighted={false}
                            panelName="우측코너장 측면가구 목찬넬프레임수평(1)"
                            panelGrainDirections={panelGrainDirections}
                            furnitureId={sidePlacedFurnitureId}
                          />
                          <BoxWithEdges
                            args={[sideChannelVerticalWidth, mmToUnits(sideVerticalFrameHeightMm), baseFurniture.basicThickness]}
                            position={[sideChannelVerticalX, sideVertFrameY, sideVertFrameZ]}
                            material={lFrameDoorMaterial}
                            renderMode={renderMode}
                            isDragging={isDragging || cornerGhostMode}
                            isHighlighted={false}
                            panelName="우측코너장 측면가구 목찬넬프레임수직(1)"
                            panelGrainDirections={panelGrainDirections}
                            furnitureId={sidePlacedFurnitureId}
                          />
                          <AdjustableFootsRenderer
                            width={sideCabinetBodyWidth}
                            depth={sideCabinetDepth}
                            yOffset={-sideCabinetHeight / 2}
                            placedFurnitureId={placedFurnitureId}
                            renderMode={renderMode}
                            isHighlighted={false}
                            isFloating={isFloating}
                            baseHeight={spaceInfo?.baseConfig?.height || 105}
                            baseDepth={spaceInfo?.baseConfig?.depth || 0}
                            frontZInset={65}
                            viewMode={viewMode}
                            view2DDirection={useUIStore.getState().view2DDirection}
                          />
                        </group>
                      )}
                      {sideCabinetWidthMm > 0 && shouldRenderSideBaseFrame && (
                        <group
                          position={[sideCabinetCenterX, 0, sideAssemblyCenterZ]}
                          rotation={[0, -Math.PI / 2, 0]}
                        >
                          <BoxWithEdges
                            args={[sideCabinetWidth, sideBaseFrameHeight, sideBaseFrameDepth]}
                            position={[0, sideBaseFrameY, sideBaseFrameZ]}
                            material={lFrameDoorMaterial}
                            renderMode={renderMode}
                            isDragging={isDragging || cornerGhostMode}
                            isHighlighted={false}
                            panelName="우측코너장 측면가구 걸레받이"
                            panelGrainDirections={panelGrainDirections}
                            furnitureId={sidePlacedFurnitureId}
                          />
                        </group>
                      )}
                      {hasDoor && sideCabinetWidthMm > 0 && spaceInfo && (
                        <group
                          position={[sideCabinetCenterX, 0, sideCabinetCenterZ]}
                          rotation={[0, -Math.PI / 2, 0]}
                        >
                          <DoorModule
                            moduleWidth={sideCabinetBodyWidthMm}
                            moduleDepth={sideCabinetDepthMm}
                            hingePosition={cornerSideHingePosition}
                            spaceInfo={spaceInfo}
                            color={baseFurniture.doorColor}
                            moduleData={sideDoorModuleData}
                            isDragging={isDragging || cornerGhostMode}
                            isEditMode={isEditMode}
                            floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? floatHeight : 0}
                            textureUrl={spaceInfo.materialConfig?.doorTexture}
                            panelGrainDirections={panelGrainDirections}
                            furnitureId={sidePlacedFurnitureId}
                            zone={zone}
                            hasBase={hasBase}
                            individualFloatHeight={individualFloatHeight}
                            parentGroupY={parentGroupY}
                            doorTopGap={doorTopGap}
                            doorBottomGap={doorBottomGap}
                            internalHeight={Math.round(sideCabinetHeight / 0.01)}
                            isFreePlacement={true}
                          />
                        </group>
                      )}
                      <BoxWithEdges
                        args={[frameWidth, frameHeight, frameDepth]}
                        position={[-frameWidth / 2, frameCenterY, frameZ]}
                        material={baseFurniture.material}
                        renderMode={renderMode}
                        isDragging={isDragging || cornerGhostMode}
                        isHighlighted={false}
                        panelName="우측코너장 세로프레임 좌"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                      />
                      <BoxWithEdges
                        args={[frameDepth, frameHeight, frameWidth]}
                        position={[frameDepth / 2, frameCenterY, baseFurniture.depth / 2 - frameWidth / 2]}
                        material={baseFurniture.material}
                        renderMode={renderMode}
                        isDragging={isDragging || cornerGhostMode}
                        isHighlighted={false}
                        panelName="우측코너장 세로프레임 우"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                      />
                      {sideCabinetWidthMm > 0 && (
                        <>
                          <BoxWithEdges
                            args={[frameDepth, sideFrameHeight, frameWidth]}
                            position={[frontFrameX, sideFrameCenterY, sideFrameZ]}
                            material={baseFurniture.material}
                            renderMode={renderMode}
                            isDragging={isDragging || cornerGhostMode}
                            isHighlighted={false}
                            panelName="우측코너장 측면 쫄대프레임"
                            panelGrainDirections={panelGrainDirections}
                            furnitureId={placedFurnitureId}
                          />
                          <BoxWithEdges
                            args={[frameDepth, sideFrameHeight, frameWidth]}
                            position={[rightFrontFrameX, sideFrameCenterY, sideFrameZ]}
                            material={baseFurniture.material}
                            renderMode={renderMode}
                            isDragging={isDragging || cornerGhostMode}
                            isHighlighted={false}
                            panelName="우측코너장 우측측판 전면 쫄대프레임"
                            panelGrainDirections={panelGrainDirections}
                            furnitureId={placedFurnitureId}
                          />
                        </>
                      )}
                    </group>
                  );
                })()}
              </>

          {/* 다보 선반 렌더링 (하부장 반통·한통, 도어올림/상판내림 반통·한통) — 탑뷰에서는 숨김 */}
          {(() => {
            if (viewMode === '2D' && view2DDirection === 'top') return null;
            const moduleId = moduleData.id;
            if (moduleId.includes('dummy')) return null;
            const isRightCornerCabinet = moduleId.includes('right-corner') || moduleId.includes('left-corner');
            const isLowerHalf = moduleId.includes('lower-half-cabinet') || moduleId.includes('dual-lower-half-cabinet');
            const isDoorLiftHalf = moduleId.includes('lower-door-lift-half') || moduleId.includes('dual-lower-door-lift-half');
            const isTopDownHalf = moduleId.includes('lower-top-down-half') || moduleId.includes('dual-lower-top-down-half');
            if (isRightCornerCabinet) return null;
            if (!isLowerHalf && !isDoorLiftHalf && !isTopDownHalf) return null;

            // placedModule.customSections 우선 사용 (팝업 선반 갯수 토글/스피너 반영)
            const placedModuleForShelves = placedFurnitureId
              ? useFurnitureStore.getState().placedModules.find(p => p.id === placedFurnitureId)
              : undefined;
            const customSecForShelves = (placedModuleForShelves as any)?.customSections;

            const mmToUnits = (mm: number) => mm * 0.01;
            const basicThicknessMm = baseFurniture.basicThickness / 0.01;
            const cabinetHeightMm = adjustedHeight / 0.01;
            const depthMm = baseFurniture.depth / 0.01;
            const rawBackPanelMm = (backPanelThickness || 9);
            const backPanelMm = rawBackPanelMm === 9.5
              ? 9
              : rawBackPanelMm === 5 || rawBackPanelMm === 5.5
                ? 6
                : rawBackPanelMm === 3.5
                  ? 3
                  : rawBackPanelMm;

            // 팝업에서 사용자 정의한 선반 갯수/위치 우선
            //  - customSections count === 0이면 렌더링 안 함 (선반 없음)
            //  - shelfPositions가 있으면 그대로 사용
            //  - 없으면 기본 균등 분할 (기존 동작)
            const shelfPositions = getDirectLowerDowelShelfPositionsMm({
              moduleId,
              cabinetHeightMm,
              basicThicknessMm,
              sections: customSecForShelves || moduleData.modelConfig?.sections,
            });
            if (shelfPositions.length === 0) return null;

            const shelfThicknessMm = 18;
            const shelfFrontInsetMm = resolveShelfFrontInsetMm({
              moduleId: moduleData.id,
              cabinetCategory: 'lower',
              depthMm: depthMm
            }); // 깊이 < 400 → 20mm, 깊이 ≥ 400 → 72mm
            const backPanelOffsetThicknessMm = resolveNominalBackPanelOffsetThicknessMm(basicThicknessMm);
            const backReductionMm = backPanelMm + backPanelOffsetThicknessMm - 1; // 바닥판과 동일
            const shelfDepthMm = depthMm - backReductionMm - shelfFrontInsetMm;
            const shelfWidth = baseFurniture.innerWidth;
            const shelfDepth = mmToUnits(shelfDepthMm);
            const shelfThickness = mmToUnits(shelfThicknessMm);

            const shelfZ = (mmToUnits(backReductionMm) - mmToUnits(shelfFrontInsetMm)) / 2; // 뒤에서 26mm 줄이고 앞에서 30mm 들여보냄

            const cabinetBottomY = -adjustedHeight / 2;
            const bottomPanelTopY = cabinetBottomY + baseFurniture.basicThickness;

            return shelfPositions.map((posFromBottom, idx) => (
              <BoxWithEdges
                key={`dowel-shelf-${idx}`}
                args={[shelfWidth, shelfThickness, shelfDepth]}
                position={[0, bottomPanelTopY + mmToUnits(posFromBottom), shelfZ]}
                material={baseFurniture.material}
                renderMode={renderMode}
                isHighlighted={false}
                panelName={`선반 ${idx + 1}`}
                furnitureId={placedFurnitureId}
              />
            ));
          })()}

          <SidePanelBoring
            height={adjustedHeight}
            depth={baseFurniture.depth}
            basicThickness={baseFurniture.basicThickness}
            innerWidth={baseFurniture.innerWidth}
            boringPositions={lowerCabinetSideBoringResult.positions}
            boringDetails={lowerCabinetSideBoringResult.details}
            placedFurnitureId={placedFurnitureId}
            category={moduleData.category}
            doorTopGap={doorTopGap}
            doorBottomGap={doorBottomGap}
            mmToThreeUnits={(mm) => mm * 0.01}
          />

          </BaseFurnitureShell>

          {/* 하부장 상판 마감재 제거 - 하부모듈에는 상판 없음 */}
          </group>
        </>
      )}
      
      {/* 외부서랍 렌더링 (하부 서랍장 전용) */}
      {showFurniture && !moduleData.id.includes('lower-door-lift-touch-') && !moduleData.id.includes('lower-top-down-touch-') && (moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-1tier') || moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-top-down-1tier') || moduleData.id.includes('lower-top-down-2tier') || moduleData.id.includes('lower-top-down-3tier')) && (() => {
        const is1Tier = moduleData.id.includes('lower-drawer-1tier');
        const is3Tier = moduleData.id.includes('lower-drawer-3tier');
        const is2Tier = moduleData.id.includes('lower-drawer-2tier');
        const isDoorLift3Tier = moduleData.id.includes('lower-door-lift-3tier');
        const isDoorLift2Tier = moduleData.id.includes('lower-door-lift-2tier');
        const isDoorLift1Tier = moduleData.id.includes('lower-door-lift-1tier');
        const isTopDown3Tier = moduleData.id.includes('lower-top-down-3tier');
        const isTopDown2Tier = moduleData.id.includes('lower-top-down-2tier');
        const isTopDown1Tier = moduleData.id.includes('lower-top-down-1tier');
        // 상판내림 2/3단: 상부 EP 기본 -82, 일반 stoneThk별 10→-90, 20→-80, 30→-70
        const topDownDefaultTopGapLR = placedModuleForCorner?.hasTopEndPanel === true ? -82 : stoneThickness === 10 ? -90 : stoneThickness === 30 ? -70 : -80;
        const isTvOneDrawer = is1Tier || isDoorLift1Tier;
        const defaultDrawerTopGap = (isTopDown1Tier || isTopDown2Tier || isTopDown3Tier)
          ? topDownDefaultTopGapLR
          : (isDoorLift1Tier || isDoorLift2Tier || isDoorLift3Tier)
            ? 30
            : -20;
        const defaultDrawerBottomGap = 5;
        const effectiveDrawerTopGap = (isTopDown1Tier || isTopDown2Tier || isTopDown3Tier) && (doorTopGap === undefined || doorTopGap === 0)
          ? defaultDrawerTopGap
          : (doorTopGap ?? defaultDrawerTopGap);
        const effectiveDrawerBottomGap = doorBottomGap ?? defaultDrawerBottomGap;
        // 기존 서랍장: 상단 따내기 60mm 있음. 2단 fromBottom=330(균등), 3단 fromBottom=295+510
        // 도어올림 3단: fromBottom=315, 545 (1단=315, 따내기65, 2단=165, 따내기65, 3단=175)
        // 도어올림 2단: fromBottom=355
        // 상판내림 3단: fromBottom=225, 445, 665 (1단=225, 따내기65, 2단=155, 따내기65, 3단=155, 따내기65, 상단55)
        // 상판내림 2단: 1/2단 마이다 높이를 동일하게 유지하고, 사이 간격 20mm를 보존
        // 도어올림 2단: 사용자 몸통 H 변경 시 도어와 몸통이 균형있게 같이 변하도록 동적 계산
        // 노치높이 65, 도어갭 20 고정. notch=(H-75)/2, maida=notch+45 (도어갭 20mm 보존)
        // (H=785 기준: notch=355, 도어=400 — 기존 값과 동일)
        // 정수 반올림으로 0.5 단위 방지. maida를 notch에서 파생시켜 도어갭 일관성 보장
        const currentCabinetHmm = Math.round(adjustedHeight / 0.01);
        const drawer2TierFromBottom = (currentCabinetHmm - 125) / 2;
        const doorLift2TierNotch = Math.max(0, Math.round((currentCabinetHmm - 75) / 2));
        const doorLift2TierMaidaH = Math.max(0, doorLift2TierNotch + 45);
        // 도어올림 3단: 아래 도어(360mm)와 첫 노치(315) 고정, 위쪽 2개 도어만 균등하게 H 변경 흡수
        // notch1=315(고정), notch2=(H+305)/2 → 위 2개 도어가 균등 분할
        // 도어 = [360(고정), (H-365)/2, (H-365)/2] — 위 2개 도어가 균등
        // (H=785 기준: notch=[315,545], 도어=[360,210,210] — 기존 값과 동일)
        const doorLift3TierUpperMaidaH = Math.max(0, Math.round((currentCabinetHmm - 365) / 2));
        const doorLift3TierNotch2 = Math.max(380, doorLift3TierUpperMaidaH + 335);
        // 어제 저녁(e98ecfb44) 복원: 상판내림 2단 측판 노치는 [300, 665] 하드코딩 (대리석 두께 영향 X)
        // 3단서랍장/상판내림3단 H 변경: 상단 묶음(노치/마이다)은 캐비넷 상단에 붙어 평행이동
        //   → 노치 위치를 H 변화량(delta)만큼 위로 이동, 마이다1(맨아래)만 흡수
        // 상판내림 3단: stretcher 변화(stoneThickness별 65/55/45)도 노치 위치에 반영
        const drawer3TierDelta = currentCabinetHmm - 785;
        const td3StretcherForNotch = stoneThickness === 10 ? 65 : stoneThickness === 30 ? 45 : 55;
        const td3StretcherDeltaForNotch = td3StretcherForNotch - 55;
        const oneTierMaidaH = Math.max(0, currentCabinetHmm + defaultDrawerTopGap + defaultDrawerBottomGap);
        const topDownOneTierChannelBottom = currentCabinetHmm - (td3StretcherForNotch + 65);
        const topDownOneTierMaidaH = Math.max(0, topDownOneTierChannelBottom + 5);
        const drawerSideBottomMm = (baseFurniture.basicThickness / 0.01) + 15;
        const tvDrawerSideTopGapMm = 21;
        const basicOneTierSideH = Math.max(0, currentCabinetHmm - 60 - tvDrawerSideTopGapMm - drawerSideBottomMm);
        const doorLiftOneTierSideH = Math.max(0, currentCabinetHmm - (baseFurniture.basicThickness / 0.01) - tvDrawerSideTopGapMm - drawerSideBottomMm);
        const topDownOneTierSideH = Math.max(0, topDownOneTierChannelBottom - tvDrawerSideTopGapMm - drawerSideBottomMm);
        const notchFromBottoms = is3Tier
          ? [295 + drawer3TierDelta, 510 + drawer3TierDelta]
          : isDoorLift3Tier ? [315, doorLift3TierNotch2]
          : isDoorLift2Tier ? [doorLift2TierNotch]
          : isDoorLift1Tier ? []
          : isTopDown3Tier ? [225 + drawer3TierDelta - td3StretcherDeltaForNotch, 445 + drawer3TierDelta - td3StretcherDeltaForNotch, 665 + drawer3TierDelta - td3StretcherDeltaForNotch]
          : isTopDown2Tier ? [Math.round((currentCabinetHmm + stoneThickness - 20 - 185) / 2), currentCabinetHmm - (td3StretcherForNotch + 65)]
          : isTopDown1Tier ? [currentCabinetHmm - (td3StretcherForNotch + 65)]
          : is1Tier ? []
          : [drawer2TierFromBottom];
        const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : isTopDown3Tier ? [65, 65, 65] : isTopDown2Tier ? [65, 65] : isTopDown1Tier ? [65] : [];
        const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : (is1Tier || isDoorLift1Tier || isTopDown1Tier) ? 1 : 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <ExternalDrawerRenderer
              drawerCount={drawerCount}
              moduleWidth={adjustedWidth || moduleData.dimensions.width}
              innerWidth={baseFurniture.innerWidth}
              height={adjustedHeight}
              depth={baseFurniture.depth}
              basicThickness={baseFurniture.basicThickness}
              moduleDepthMm={baseFurniture.actualDepthMm}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              textureUrl={spaceInfo?.materialConfig?.texture}
              doorTextureUrl={spaceInfo?.materialConfig?.doorTexture}
              doorColor={baseFurniture.doorColor}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              showMaida={hasDoor}
              notchFromBottoms={notchFromBottoms}
              notchHeights={notchHeights}
              isEditMode={isEditMode}
              hideTopNotch={isDoorLift1Tier || isDoorLift2Tier || isDoorLift3Tier || isTopDown1Tier || isTopDown2Tier || isTopDown3Tier}
              maidaHeightsMm={isDoorLift1Tier || is1Tier ? [oneTierMaidaH] : isTopDown1Tier ? [topDownOneTierMaidaH] : isDoorLift2Tier ? [doorLift2TierMaidaH, doorLift2TierMaidaH] : isDoorLift3Tier ? [360, doorLift3TierUpperMaidaH, doorLift3TierUpperMaidaH] : undefined}
              sideHeightOverrides={
                is1Tier ? { all: basicOneTierSideH }
                : isTopDown1Tier ? { all: topDownOneTierSideH }
                : isDoorLift1Tier ? { all: doorLiftOneTierSideH }
                : isTopDown2Tier ? { all: 240 }
                : isTopDown3Tier ? { first: 180, rest: 130 }
                : isDoorLift3Tier ? { first: 240, rest: 130 } // 특대서랍 측판 높이 240
                : isDoorLift2Tier
                  // 도어올림 2단: H ≤ 640이면 대(180), 초과면 특대(240)
                  ? { all: currentCabinetHmm <= 640 ? 180 : 240 }
                : is2Tier
                  // 기본장 2단서랍장: H(발통제외) ≤ 673이면 대(180), 초과면 특대(240)
                  ? { all: currentCabinetHmm <= 673 ? 180 : 240 }
                : is3Tier ? { first: 240, rest: 130 } // 기본장 3단서랍장: 1단(특대) 240
                : undefined
              }
              doorTopGap={effectiveDrawerTopGap}
              doorBottomGap={effectiveDrawerBottomGap}
              defaultDoorTopGap={defaultDrawerTopGap}
              defaultDoorBottomGap={defaultDrawerBottomGap}
              backPanelThicknessOverride={backPanelThickness}
              floorY={lowerCabinetFloorY - cabinetYPosition}
              maidaDimensionSide={maidaDimensionSide}
              maidaFrontWidthMm={maidaFrontWidthMm}
              maidaXOffset={maidaXOffset}
              showDrawerFrontPanel={is1Tier || isDoorLift1Tier}
              showMaidaGapDimensions={!isTvOneDrawer}
            />
          </group>
        );
      })()}

      {/* 상판내림 반통/한통: L자 프레임만 렌더링 (서랍 없음, 도어는 별도) — 걸래받이 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half') || moduleData.id.includes('lower-top-down-touch-') || moduleData.id.includes('dual-lower-top-down-touch-')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        // 상판내림 터치: 측판 따내기 = 가로전대 바로 아래
        // fromBottom = 캐비넷H - (stretcherH + notchHeight 65)
        const isTopDownTouchHere = moduleData.id.includes('lower-top-down-touch-') || moduleData.id.includes('dual-lower-top-down-touch-');
        const cabinetHmmHere = Math.round(adjustedHeight / 0.01);
        const notchHeightLocal = 65;
        // 상판내림 반통/한통: 캐비넷 상단 기준 120mm 아래 (H 변경 시 함께 위로 이동)
        // 상판내림 반통/한통/터치: 노치 = 가로전대 바로 아래 (stoneThk별 stretcher 반영, 통일)
        const notchFromBottomLocal = cabinetHmmHere - (topDownStretcherHeightMm + notchHeightLocal);
        const notch = { fromBottom: notchFromBottomLocal, height: notchHeightLocal };
        const frameWidth = mmToThreeUnits(adjustedWidth || moduleData.dimensions.width);
        const petThickness = mmToThreeUnits(PET_PANEL_THICKNESS_MM);
        const verticalHMm = notch.height - PET_PANEL_THICKNESS_MM;
        const cabinetBottomY = -adjustedHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + petThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + petThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + petThickness / 2;

        return (
          <group position={[0, 0, 0]}>
            <BoxWithEdges
              args={[frameWidth, petThickness, mmToThreeUnits(40)]}
              position={[0, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[frameWidth, mmToThreeUnits(verticalHMm), petThickness]}
              position={[0, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 기본하부장/싱크장/인덕션장 반통/한통: 상단 따내기 L자 프레임 렌더링 — 걸래받이 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet') || moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const cabinetHeightMmLocal = cabinetHeight / 0.01;
        const notchHeightMm = 60;
        // 인덕션장은 H 변경 시 따내기도 캐비넷 상단 기준 60mm 아래로 함께 이동
        const isInductionForNotch = moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet');
        const notchFromBottomMm = isInductionForNotch
          ? (cabinetHeightMmLocal - notchHeightMm)
          : ((moduleData.dimensions.height || 785) - notchHeightMm);
        const frameBaseWidthMm = adjustedWidth || moduleData.dimensions.width;
        const epTrimMm = resolvePetPanelThicknessMm((placedModuleForCorner as any)?.endPanelThickness);
        const leftFrontOffset = Number((placedModuleForCorner as any)?.leftEndPanelOffset ?? 0);
        const rightFrontOffset = Number((placedModuleForCorner as any)?.rightEndPanelOffset ?? 0);
        const leftFrameTrimMm = placedModuleForCorner?.hasLeftEndPanel && leftFrontOffset > 0 ? epTrimMm : 0;
        const rightFrameTrimMm = placedModuleForCorner?.hasRightEndPanel && rightFrontOffset > 0 ? epTrimMm : 0;
        const trimmedFrameWidthMm = Math.max(0, frameBaseWidthMm - leftFrameTrimMm - rightFrameTrimMm);
        const frameTrimX = mmToThreeUnits((leftFrameTrimMm - rightFrameTrimMm) / 2);
        const fullFrameWidth = mmToThreeUnits(frameBaseWidthMm);
        const frontFrameWidth = mmToThreeUnits(trimmedFrameWidthMm);
        const isRightCornerCabinet = moduleData.id.includes('right-corner');
        const rightCornerHorzReach = mmToThreeUnits(isRightCornerCabinet ? 58 : 0);
        const rightCornerVertReach = mmToThreeUnits(isRightCornerCabinet ? 45 : 0);
        const horzFrameWidth = isRightCornerCabinet
          ? fullFrameWidth / 2 + rightCornerHorzReach
          : frontFrameWidth;
        const horzFrameX = isRightCornerCabinet
          ? (-fullFrameWidth / 2 + rightCornerHorzReach) / 2
          : frameTrimX;
        const vertFrameWidth = isRightCornerCabinet
          ? fullFrameWidth / 2 + rightCornerVertReach
          : frontFrameWidth;
        const vertFrameX = isRightCornerCabinet
          ? (-fullFrameWidth / 2 + rightCornerVertReach) / 2
          : frameTrimX;
        const petThickness = mmToThreeUnits(PET_PANEL_THICKNESS_MM);
        const verticalHMm = notchHeightMm - PET_PANEL_THICKNESS_MM;
        const cabinetBottomY = -cabinetHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + petThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + petThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + petThickness / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <BoxWithEdges
              args={[horzFrameWidth, petThickness, mmToThreeUnits(40)]}
              position={[horzFrameX, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[vertFrameWidth, mmToThreeUnits(verticalHMm), petThickness]}
              position={[vertFrameX, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 싱크장/인덕션장 전대 렌더링 — 상단 따내기 아래 높이 150mm — 걸래받이 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const cabinetHeightMm = cabinetHeight / 0.01;
        const isInductionCabinet = moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet');
        const cabinetBottomY = -cabinetHeight / 2;
        const notchHeightMm = 60;
        // 따내기 위치: 캐비넷 상단 기준 60mm 아래 (H 변경 시 함께 위로 이동)
        const notchFromBottomMm = cabinetHeightMm - notchHeightMm;
        // 전대 높이는 고정 150mm (인덕션장/싱크장 동일)
        // H 변경 시 전대 크기는 그대로, 위치만 따내기 하단에 맞춰 이동
        const apronHeightMm = 150;
        // 전대 상단 = 따내기 시작점(notchFromBottomMm), 전대 하단 = notchFromBottomMm - apronHeightMm
        const apronCenterY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm - apronHeightMm / 2);
        const apronWidth = baseFurniture.innerWidth; // 내경 (전체폭 - 측판두께×2)
        const apronHeight = mmToThreeUnits(apronHeightMm);
        const apronThickness = baseFurniture.basicThickness; // 18mm
        // 전대는 캐비넷 앞면에 위치
        const apronZ = baseFurniture.depth / 2 - apronThickness / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <BoxWithEdges
              args={[apronWidth, apronHeight, apronThickness]}
              position={[0, apronCenterY, apronZ]}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="전대"
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 인덕션장 블럼 레그라박스 서랍 + 마이다 (인출 애니메이션 + 2D V자 점선 포함) */}
      {(moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (showFurniture || hasDoor) && (
        <InductionDrawerAnimated
          moduleId={moduleData.id}
          moduleHeightMm={moduleData.dimensions.height || 785}
          adjustedHeight={adjustedHeight}
          adjustedWidth={adjustedWidth || moduleData.dimensions.width}
          basicThickness={baseFurniture.basicThickness}
          furnitureDepth={baseFurniture.depth}
          furnitureMaterial={baseFurniture.material}
          doorMaterial={lFrameDoorMaterial}
          backPanelThicknessProp={backPanelThickness}
          renderMode={renderMode}
          cabinetYPosition={cabinetYPosition}
          placedFurnitureId={placedFurnitureId}
          showFurniture={showFurniture}
          hasDoor={hasDoor}
          panelGrainDirections={panelGrainDirections}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
          floorY={lowerCabinetFloorY - cabinetYPosition}
          maidaDimensionSide={maidaDimensionSide}
          maidaFrontWidthMm={maidaFrontWidthMm}
          maidaXOffset={maidaXOffset}
          legraDrawerTypes={(placedModuleForCorner as any)?.legraDrawerTypes}
        />
      )}

      {/* 터치 레그라박스 서랍 + 마이다 (도어올림 터치 + 상판내림 터치) — 인출 애니메이션 포함 */}
      {(moduleData.id.includes('lower-door-lift-touch-') || moduleData.id.includes('lower-top-down-touch-')) && (showFurniture || hasDoor) && (
        <TouchDrawerAnimated
          moduleId={moduleData.id}
          moduleHeightMm={moduleData.dimensions.height || 785}
          adjustedHeight={adjustedHeight}
          adjustedWidth={adjustedWidth || moduleData.dimensions.width}
          basicThickness={baseFurniture.basicThickness}
          furnitureDepth={baseFurniture.depth}
          furnitureMaterial={baseFurniture.material}
          doorMaterial={lFrameDoorMaterial}
          backPanelThicknessProp={backPanelThickness}
          renderMode={renderMode}
          cabinetYPosition={cabinetYPosition}
          placedFurnitureId={placedFurnitureId}
          showFurniture={showFurniture}
          hasDoor={hasDoor}
          panelGrainDirections={panelGrainDirections}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
          stoneThickness={stoneThickness}
          floorY={lowerCabinetFloorY - cabinetYPosition}
          maidaDimensionSide={maidaDimensionSide}
          maidaFrontWidthMm={maidaFrontWidthMm}
          maidaXOffset={maidaXOffset}
        />
      )}

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {/* 단, 서랍장(lower-drawer-*)은 도어가 아닌 서랍이 달리므로 도어 렌더링 차단 */}
      {hasDoor && spaceInfo && !moduleData.id.includes('lower-drawer-') && !moduleData.id.includes('lower-door-lift-1tier') && !moduleData.id.includes('lower-door-lift-2tier') && !moduleData.id.includes('lower-door-lift-3tier') && !moduleData.id.includes('lower-door-lift-touch-') && !moduleData.id.includes('lower-top-down-1tier') && !moduleData.id.includes('lower-top-down-2tier') && !moduleData.id.includes('lower-top-down-3tier') && !moduleData.id.includes('lower-top-down-touch-') && !moduleData.id.includes('lower-induction-cabinet') && !moduleData.id.includes('dual-lower-induction-cabinet') && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={isCornerCabinet ? cornerFrontHingePosition : hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          moduleData={moduleData}
          isDragging={isDragging}
          isEditMode={isEditMode}
          slotWidths={slotWidths}
          slotIndex={slotIndex}
          floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? floatHeight : 0}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          zone={zone}
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
          parentGroupY={parentGroupY}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
        />
      )}

      {/* 하부장 상부 EP — 상판내림은 인조대리석 20T와 같은 ㄱ자 연귀 형상 */}
      {!hideAccessories && showFurniture && topEndPanelData && !(viewMode === '2D' && view2DDirection === 'top') && (
        isTopDown ? (() => {
          const t = topEndPanelData.thickness;
          const frontPlateH = TOP_DOWN_STONE_FRONT_HEIGHT_MM * 0.01;
          const cabinetTopY = cabinetYPosition + adjustedHeight / 2;
          const hPosY = cabinetTopY + t / 2;
          const vPosY = cabinetTopY + t - frontPlateH / 2;
          const frontZ = topEndPanelData.zOffset + topEndPanelData.depth / 2;
          const vPosZ = frontZ - t / 2;
          return (
            <>
              <JollyCutHorizontalPlate
                width={topEndPanelData.width}
                thickness={t}
                depth={topEndPanelData.depth}
                position={[topEndPanelData.xOffset, hPosY, topEndPanelData.zOffset]}
                material={lFrameDoorMaterial}
                renderMode={renderMode}
                panelName="상부 EP 상판"
                furnitureId={placedFurnitureId}
              />
              <JollyCutVerticalPlate
                width={topEndPanelData.width}
                height={frontPlateH}
                thickness={t}
                position={[topEndPanelData.xOffset, vPosY, vPosZ]}
                material={lFrameDoorMaterial}
                renderMode={renderMode}
                panelName="상부 EP 앞판"
                furnitureId={placedFurnitureId}
              />
            </>
          );
        })() : (
          <BoxWithEdges
            args={[topEndPanelData.width, topEndPanelData.thickness, topEndPanelData.depth]}
            position={[
              topEndPanelData.xOffset,
              cabinetYPosition + adjustedHeight / 2 + topEndPanelData.thickness / 2,
              topEndPanelData.zOffset
            ]}
            material={lFrameDoorMaterial}
            renderMode={renderMode}
            panelName="상부 EP"
            furnitureId={placedFurnitureId}
          />
        )
      )}

      {/* 하부장 상부 EP 뒷턱 — 상부 EP 뒤쪽 수직판 */}
      {!hideAccessories && showFurniture && topEndPanelData && topEndPanelData.backLipHeight > 0 && !(viewMode === '2D' && view2DDirection === 'top') && (
        <BoxWithEdges
          args={[topEndPanelData.width, topEndPanelData.backLipHeight, topEndPanelData.backLipThickness]}
          position={[
            topEndPanelData.xOffset,
            cabinetYPosition + adjustedHeight / 2 + topEndPanelData.thickness + topEndPanelData.backLipHeight / 2,
            (is2DMode && view2DDirection === 'front')
              ? topEndPanelData.zOffset
              : topEndPanelData.zOffset - topEndPanelData.depth / 2 + topEndPanelData.backLipThickness / 2
          ]}
          material={lFrameDoorMaterial}
          renderMode={renderMode}
          panelName="상부 EP 뒷턱"
          furnitureId={placedFurnitureId}
        />
      )}

      {/* 인조대리석 상판 — 상판내림은 졸리컷 L자, 그 외는 단순 박스 (탑뷰에서는 숨김) */}
      {!hideAccessories && showFurniture && stoneTopData && stoneTopMaterial && !isTopDown && !(viewMode === '2D' && view2DDirection === 'top') && (
        <BoxWithEdges
          args={[stoneTopData.width, stoneTopData.thickness, stoneTopData.depth]}
          position={[
            stoneTopData.xOffset,
            cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness / 2,
            stoneTopData.zOffset
          ]}
          material={stoneTopMaterial}
          renderMode={renderMode}
          panelName="인조대리석 상판"
          furnitureId={placedFurnitureId}
        />
      )}

      {/* 인조대리석 뒷턱 (back lip) — 상판 뒤쪽 수직판 */}
      {/* 2D 정면뷰에서는 상판과 같은 Z(중심)에 배치하여 정면에서 보이게 함 */}
      {!hideAccessories && showFurniture && stoneTopData && stoneTopData.backLipHeight > 0 && stoneTopMaterial && !(viewMode === '2D' && view2DDirection === 'top') && (
        stoneTopData.backLipDepthOffset > 0 ? (
          <>
            {/* 수직 측판 (현재 사용자가 설정한 뒷턱 높이 적용) */}
            <BoxWithEdges
              args={[stoneTopData.width, stoneTopData.backLipHeight - stoneTopData.backLipThickness, stoneTopData.backLipThickness]}
              position={[
                stoneTopData.xOffset,
                cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + (stoneTopData.backLipHeight - stoneTopData.backLipThickness) / 2,
                (is2DMode && view2DDirection === 'front')
                  ? stoneTopData.zOffset
                  : stoneTopData.zOffset - stoneTopData.depth / 2 + stoneTopData.backLipThickness / 2 + stoneTopData.backLipDepthOffset
              ]}
              material={stoneTopMaterial}
              renderMode={renderMode}
              panelName="인조대리석 뒷턱 전면부"
              furnitureId={placedFurnitureId}
            />
            {/* 수평 덮개판 (뒷벽까지 채움 + 상판 앞뒤 돌출 반영, 높이는 젠다이 상단 기준) */}
            <BoxWithEdges
              args={[stoneTopData.width, stoneTopData.backLipThickness, stoneTopData.backLipDepthOffset + stoneTopData.backLipThickness + stoneTopData.backLipTopOffset + stoneTopData.backLipTopBackOffset]}
              position={[
                stoneTopData.xOffset,
                cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + stoneTopData.backLipHeight - stoneTopData.backLipThickness / 2,
                (is2DMode && view2DDirection === 'front')
                  ? stoneTopData.zOffset
                  : stoneTopData.zOffset - stoneTopData.depth / 2 + (stoneTopData.backLipDepthOffset + stoneTopData.backLipThickness + stoneTopData.backLipTopOffset - stoneTopData.backLipTopBackOffset) / 2
              ]}
              material={stoneTopMaterial}
              renderMode={renderMode}
              panelName="인조대리석 뒷턱 상단부"
              furnitureId={placedFurnitureId}
            />
            {/* 다채움인 경우, Main Stone Top에서부터 올라가는 뒷벽 추가 대리석 패널 (후면 미드웨이 전체) */}
            {stoneTopData.backLipFullFill && stoneTopData.backLipFillHeight > 0 && (
              <BoxWithEdges
                args={[stoneTopData.width, stoneTopData.backLipFillHeight, stoneTopData.backLipThickness]}
                position={[
                  stoneTopData.xOffset,
                  cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + stoneTopData.backLipFillHeight / 2,
                  (is2DMode && view2DDirection === 'front')
                    ? stoneTopData.zOffset
                    : stoneTopData.zOffset - stoneTopData.depth / 2 + stoneTopData.backLipThickness / 2 // 가장 뒷벽에 밀착
                ]}
                material={stoneTopMaterial}
                renderMode={renderMode}
                panelName="인조대리석 벽체 미드웨이"
                furnitureId={placedFurnitureId}
              />
            )}
          </>
        ) : (
          /* 기존 (단일 뒷턱) - 다채움인 경우 전체 높이(backLipFillHeight)로 렌더링 */
          <BoxWithEdges
            args={[
              stoneTopData.width, 
              (stoneTopData.backLipFullFill && stoneTopData.backLipFillHeight > 0) ? stoneTopData.backLipFillHeight : stoneTopData.backLipHeight, 
              stoneTopData.backLipThickness
            ]}
            position={[
              stoneTopData.xOffset,
              cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + ((stoneTopData.backLipFullFill && stoneTopData.backLipFillHeight > 0) ? stoneTopData.backLipFillHeight : stoneTopData.backLipHeight) / 2,
              (is2DMode && view2DDirection === 'front')
                ? stoneTopData.zOffset
                : stoneTopData.zOffset - stoneTopData.depth / 2 + stoneTopData.backLipThickness / 2 + stoneTopData.backLipDepthOffset
            ]}
            material={stoneTopMaterial}
            renderMode={renderMode}
            panelName="인조대리석 뒷턱"
            furnitureId={placedFurnitureId}
          />
        )
      )}

      {/* 상판내림: 졸리컷 L자 (수평판 + 수직 앞판) — 탑뷰에서는 숨김 */}
      {!hideAccessories && showFurniture && stoneTopData && stoneTopMaterial && isTopDown && !(viewMode === '2D' && view2DDirection === 'top') && (() => {
        const t = stoneTopData.thickness;
        const frontPlateH = getTopDownStoneFrontVisibleHeightMm(adjustedHeight / 0.01, doorTopGap) * 0.01;
        const cabinetTopY = cabinetYPosition + adjustedHeight / 2;
        // 수평판: 중심Y = 캐비넷 상단 + 두께/2
        const hPosY = cabinetTopY + t / 2;
        // 수직 앞판: 상판 두께와 무관하게 전면 노출 높이 80mm 고정
        // 상단 = cabinetTopY + t (수평판 상면과 동일)
        const vTotalH = frontPlateH;
        const vPosY = cabinetTopY + t - vTotalH / 2;
        // 수직 앞판 Z: 앞면 = 수평판 앞면
        const frontZ = stoneTopData.zOffset + stoneTopData.depth / 2;
        const vPosZ = frontZ - t / 2;
        return (
          <>
            <JollyCutHorizontalPlate
              width={stoneTopData.width}
              thickness={t}
              depth={stoneTopData.depth}
              position={[stoneTopData.xOffset, hPosY, stoneTopData.zOffset]}
              material={stoneTopMaterial}
              renderMode={renderMode}
              panelName="인조대리석 상판"
              furnitureId={placedFurnitureId}
            />
            <JollyCutVerticalPlate
              width={stoneTopData.width}
              height={vTotalH}
              thickness={t}
              position={[stoneTopData.xOffset, vPosY, vPosZ]}
              material={stoneTopMaterial}
              renderMode={renderMode}
              panelName="인조대리석 앞판"
              furnitureId={placedFurnitureId}
            />
          </>
        );
      })()}

      {/* 조절발통 (네 모서리) - 키큰장과 동일하게 처리 */}
      {showFurniture && (
        <AdjustableFootsRenderer
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width}
          depth={baseFurniture.depth}
          yOffset={-adjustedHeight / 2}
          placedFurnitureId={placedFurnitureId}
          renderMode={renderMode}
          isHighlighted={false}
          isFloating={isFloating}
          baseHeight={spaceInfo?.baseConfig?.height || 105}
          baseDepth={spaceInfo?.baseConfig?.depth || 0}
          frontZInset={65}
          viewMode={viewMode}
          view2DDirection={useUIStore.getState().view2DDirection}
        />
      )}
    </>
  );
};

export default LowerCabinet;
