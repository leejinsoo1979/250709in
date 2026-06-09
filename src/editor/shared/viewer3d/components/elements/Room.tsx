import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { SpaceInfo, useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/contexts/ThemeContext';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';
import {
  calculateRoomDimensions,
  calculateFloorFinishHeight,
  calculatePanelDepth,
  calculateFurnitureDepth,
  calculateFrameThickness,
  calculateBaseFrameWidth,
  calculateTopBottomFrameHeight,
  calculateBaseFrameHeight,
  calculateInternalSpace
} from '../../utils/geometry';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { computeBaseStripGroups, computeTopStripGroups, getBaseFrameBoundsX } from '@/editor/shared/utils/baseStripUtils';
import { getModuleBoundsX, getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import { filterSideViewModules } from '@/editor/shared/utils/sideViewModuleFilter';
import { getCategoryDefaultFurnitureDepth } from '@/editor/shared/utils/furnitureDepthDefaults';
import { getModuleById } from '@/data/modules';
import { MaterialFactory } from '../../utils/materials/MaterialFactory';
import NativeLine from './NativeLine';
import { useSpace3DView } from '../../context/useSpace3DView';
import PlacedFurnitureContainer from './furniture/PlacedFurnitureContainer';
import { FurnitureBoringOverlay } from './boring';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import DimensionText from '../modules/components/DimensionText';
import { getExcludedPanelAliases, useExcludedPanelsStore } from '../../context/ExcludedPanelsContext';
import {
  getPanelSimulationLayoutKey,
  getPanelSimulationPlaybackElapsed,
  getPanelSimulationStyleProgress,
  getPanelSimulationStyleTiming,
  resolvePanelSimulationLayout
} from '../../utils/panelSimulationMotion';
import { removePanelSimulationSource, updatePanelSimulationSource } from '../../utils/panelSimulationRegistry';
import { ROOM_BACK_MESH_GAP_MM, ROOM_MESH_BACK_SHIFT_MM } from '../../utils/sideWallPlacement';
import { PET_PANEL_THICKNESS_MM, resolvePetPanelThicknessMm } from '@/editor/shared/utils/panelThickness';

interface RoomProps {
  spaceInfo: SpaceInfo;
  floorColor?: string;
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
  renderMode?: 'solid' | 'wireframe';
  materialConfig?: {
    doorColor: string;
    doorTexture?: string;
    frameColor: string;
    frameTexture?: string;
  };
  showAll?: boolean;
  placedModules?: any[]; // 뷰어 모드용 가구 데이터
  showFrame?: boolean; // 프레임 표시 여부
  showDimensions?: boolean; // 치수 표시 여부
  isStep2?: boolean; // Step2 여부
  activeZone?: 'normal' | 'dropped'; // 활성 영역
  showFurniture?: boolean; // 가구 본체 표시 여부
  hideEdges?: boolean; // 외곽선 숨김 (PDF 캡처용)
  cameraModeOverride?: 'perspective' | 'orthographic'; // 카메라 모드 오버라이드
  readOnly?: boolean; // 읽기 전용 모드 (viewer 권한)
  onFurnitureClick?: (furnitureId: string, slotIndex: number) => void; // 가구 클릭 콜백 (미리보기용)
  ghostHighlightSlotIndex?: number | null; // 미리보기용 슬롯 강조
  islandSideFilter?: 'front' | 'back'; // 아일랜드 면별 가구 필터
}

// mm를 Three.js 단위로 변환 (1mm = 0.01 Three.js units)
const mmToThreeUnits = (mm: number): number => mm * 0.01;
const MIN_SIMULATION_BOX_SIZE = 0.001;
const panelSimulationSlots = new Map<string, number>();

const END_PANEL_THICKNESS = 18; // 슬롯/프레임 계산 기준
const endPanelRenderThickness = PET_PANEL_THICKNESS_MM; // 물리적 렌더링 두께 (PET)

const getPanelSimulationSlot = (key: string) => {
  const existing = panelSimulationSlots.get(key);
  if (existing !== undefined) return existing;
  const next = panelSimulationSlots.size;
  panelSimulationSlots.set(key, next);
  return next;
};

const getFrameAssemblyStage = (panelName?: string) => {
  const name = panelName || '';
  if (name.includes('걸레받이') || name.includes('걸래받이') || name.includes('상단몰딩') || name === 'top-frame' || name === 'base-frame') return 5;
  return 3;
};

const getFrameAssemblySequence = (
  furnitureId: string | undefined,
  panelName: string | undefined,
  localPosition: [number, number, number],
  parent?: THREE.Object3D | null
) => {
  const modules = useFurnitureStore.getState().placedModules;
  const sortedIds = [...modules]
    .sort((a, b) => (a.position?.x || 0) - (b.position?.x || 0))
    .map(module => module.id);
  const furnitureIndex = furnitureId ? Math.max(0, sortedIds.indexOf(furnitureId)) : 0;
  const stage = getFrameAssemblyStage(panelName);
  const worldPosition = new THREE.Vector3(localPosition[0], localPosition[1], localPosition[2]);
  if (parent) parent.localToWorld(worldPosition);
  const localOrder = Math.max(0, Math.round((worldPosition.x + 50) * 0.18 + (worldPosition.y + 20) * 0.08));
  return furnitureIndex * 120 + stage * 16 + localOrder;
};

const getFlatPanelAxes = (dims: [number, number, number]) => {
  const axes = [
    { name: 'x' as const, size: dims[0], index: 0 },
    { name: 'y' as const, size: dims[1], index: 1 },
    { name: 'z' as const, size: dims[2], index: 2 },
  ].sort((a, b) => a.size - b.size);
  const thicknessAxis = axes[0];
  const faceAxes = axes.slice(1).sort((a, b) => a.size - b.size);
  return {
    thicknessAxis,
    widthAxis: faceAxes[0],
    lengthAxis: faceAxes[1],
  };
};

const buildFlatPanelQuaternion = (dims: [number, number, number], rotationZ: number) => {
  const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(dims);
  const localBasis = {
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3(),
  };
  const widthVector = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationZ);
  const lengthVector = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationZ);

  localBasis[thicknessAxis.name].set(0, 1, 0);
  localBasis[widthAxis.name].copy(widthVector);
  localBasis[lengthAxis.name].copy(lengthVector);

  const matrix = new THREE.Matrix4().makeBasis(localBasis.x, localBasis.y, localBasis.z);
  if (matrix.determinant() < 0) {
    localBasis[lengthAxis.name].multiplyScalar(-1);
    matrix.makeBasis(localBasis.x, localBasis.y, localBasis.z);
  }

  return new THREE.Quaternion().setFromRotationMatrix(matrix);
};

// 전역 렌더링 카운터 (컴포넌트 마운트/언마운트에 영향받지 않음)
if (typeof window !== 'undefined') {
  if (!window.renderCounter) {
    window.renderCounter = {
      leftFrame: 0,
      rightFrame: 0,
      leftEndPanel: 0,
      rightEndPanel: 0
    };
  }
}

// 노서라운드 모드에서 엔드패널과 이격거리를 계산하는 헬퍼 함수
const calculateNoSurroundOffset = (spaceInfo: SpaceInfo, side: 'left' | 'right'): number => {
  if (spaceInfo.surroundType !== 'no-surround') return 0;

  const gapConfig = spaceInfo.gapConfig || { left: 0, right: 0 };
  const wallConfig = spaceInfo.wallConfig || { left: true, right: true };

  if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
    // 빌트인: 이격거리만
    return side === 'left' ? (gapConfig.left || 2) : (gapConfig.right || 2);
  } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
    // 세미스탠딩: 벽이 있어도 이격거리 무시, 없으면 엔드패널만
    if (side === 'left') {
      return wallConfig.left ? 0 : END_PANEL_THICKNESS;
    } else {
      return wallConfig.right ? 0 : END_PANEL_THICKNESS;
    }
  } else {
    // 프리스탠딩: 엔드패널만 (이격거리 무시)
    return END_PANEL_THICKNESS;
  }
};

// 노서라운드 모드에서 최대 오프셋을 계산 (상단/하단 프레임용)
const calculateMaxNoSurroundOffset = (spaceInfo: SpaceInfo): number => {
  // 모든 경우에 빌트인(양쪽벽) 기준으로 통일 - 항상 20 반환
  return 20;
};

const findGuideFrameSlotForModule = (module: any, spaceInfo: SpaceInfo, frameType: 'top' | 'base') => {
  const guides = spaceInfo.freePlacementGuides || [];
  if (guides.length === 0) return undefined;
  const category = getModuleCategory(module);
  if (frameType === 'top' && category === 'lower') return undefined;
  if (frameType === 'base' && category === 'upper') return undefined;
  const isGuideModule = module.guideSlotPlacement === true
    || module.guideDepthPlacement === true
    || (spaceInfo.customGuideMode === true && module.isFreePlacement === true);
  if (!isGuideModule) return undefined;

  const zoneBlock = frameType === 'top' ? 'lower' : 'upper';
  const useAll = frameType === 'top'
    ? (spaceInfo.guideTopFrameAllMode ?? true)
    : (spaceInfo.guideBaseFrameAllMode ?? true);
  if (useAll) {
    return guides.find((slot: any) => (slot.guideZone || 'full') !== zoneBlock);
  }

  const bounds = getModuleBoundsX(module);
  const targetZone = module.guideSlotZone || category;
  return guides.find((slot: any) => {
    const zone = slot.guideZone || 'full';
    if (zone === zoneBlock) return false;
    if (targetZone !== 'full' && zone !== targetZone) return false;
    const slotLeft = slot.x - spaceInfo.width / 2;
    const slotRight = slot.x + slot.width - spaceInfo.width / 2;
    return bounds.left < slotRight - 0.5 && bounds.right > slotLeft + 0.5;
  }) ?? guides.find((slot: any) => (slot.guideZone || 'full') !== zoneBlock);
};

const resolveEffectiveTopFrameOffsetMm = (module: any, spaceInfo: SpaceInfo): number => {
  if (typeof module.topFrameOffset === 'number') {
    return module.topFrameOffset;
  }
  const globalOffset = (spaceInfo.frameSize as any)?.topOffset;
  const guideSlot = findGuideFrameSlotForModule(module, spaceInfo, 'top');
  if (typeof guideSlot?.topFrameOffset === 'number') {
    return guideSlot.topFrameOffset;
  }
  if ((spaceInfo.guideTopFrameAllMode ?? true) && typeof globalOffset === 'number') {
    return globalOffset;
  }
  return module.topFrameOffset ?? globalOffset ?? 0;
};

const resolveEffectiveBaseFrameOffsetMm = (module: any, spaceInfo: SpaceInfo): number => {
  // 가구 본체/3D 걸래받이(FurnitureItem)와 동일한 로직으로 통일.
  // (측면뷰 걸래받이만 guideSlot 단계가 추가로 끼어 본체와 다른 inset이 적용되어
  //  측면뷰에서 걸래받이 위치가 어긋나던 문제 방지)
  const category = getModuleCategory(module);
  const isLowerModule = category === 'lower'
    || module.moduleId?.startsWith('lower-')
    || module.moduleId?.includes('dual-lower-');
  const globalOffset = isLowerModule
    ? (spaceInfo.baseboardLowerOffset ?? (spaceInfo.baseConfig as any)?.offset)
    : (spaceInfo.baseConfig as any)?.offset;
  const useGlobal = spaceInfo.guideBaseFrameAllMode ?? true;
  if (useGlobal && typeof globalOffset === 'number') {
    return globalOffset;
  }
  if (typeof module.baseFrameOffset === 'number') {
    return module.baseFrameOffset;
  }
  return globalOffset ?? 0;
};

// 프레임 병합 세그먼트 인터페이스
interface FrameRenderSegment {
  widthMm: number;
  centerXmm: number;
  zPosition: number;   // Three.js Z
  height: number;      // Three.js 높이
  yPosition: number;   // Three.js Y
  material?: THREE.Material;
  placedModuleId?: string; // 개별 프레임 하이라이트용 (비병합 모드)
  behindCeiling?: boolean; // 천장 뒤로 보낼 프레임 (커튼박스 구간)
}

const applyFrameWidthAdjustMm = (
  leftMm: number,
  rightMm: number,
  module: any,
  frameType: 'top' | 'base'
) => {
  const enabled = frameType === 'top'
    ? module.topFrameWidthAdjustEnabled === true
    : module.baseFrameWidthAdjustEnabled === true;
  if (!enabled) return { leftMm, rightMm };

  const leftAdjust = frameType === 'top'
    ? (module.topFrameLeftAdjustMm ?? 0)
    : (module.baseFrameLeftAdjustMm ?? 0);
  const rightAdjust = frameType === 'top'
    ? (module.topFrameRightAdjustMm ?? 0)
    : (module.baseFrameRightAdjustMm ?? 0);

  const nextLeft = leftMm - leftAdjust;
  const nextRight = rightMm + rightAdjust;
  if (nextRight - nextLeft < 1) {
    const center = (leftMm + rightMm) / 2;
    return { leftMm: center - 0.5, rightMm: center + 0.5 };
  }

  return { leftMm: nextLeft, rightMm: nextRight };
};

// 같은 Z축 위치의 프레임들을 좌측부터 2410mm 이내로 병합하는 유틸 함수
function mergeFrameSegments(
  segments: FrameRenderSegment[],
  maxWidthMm: number = 2420
): FrameRenderSegment[] {
  if (segments.length <= 1) return segments;

  // 1. Z축 + Y + height 그룹핑 (±0.001 허용)
  const groups = new Map<string, FrameRenderSegment[]>();
  for (const seg of segments) {
    const zKey = Math.round(seg.zPosition * 1000).toString();
    const yKey = Math.round(seg.yPosition * 1000).toString();
    const hKey = Math.round(seg.height * 1000).toString();
    const key = `${zKey}_${yKey}_${hKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(seg);
  }

  const result: FrameRenderSegment[] = [];

  for (const groupSegs of groups.values()) {
    // 2. X좌측 기준 정렬 (centerX - width/2 = leftEdge)
    const sorted = [...groupSegs].sort((a, b) =>
      (a.centerXmm - a.widthMm / 2) - (b.centerXmm - b.widthMm / 2)
    );

    // 3. 좌측부터 합산, maxWidthMm 미만이면 병합
    let currentGroup: FrameRenderSegment[] = [];
    let currentSum = 0;

    for (const seg of sorted) {
      if (currentGroup.length === 0) {
        currentGroup.push(seg);
        currentSum = seg.widthMm;
        continue;
      }

      if (currentSum + seg.widthMm <= maxWidthMm) {
        currentGroup.push(seg);
        currentSum += seg.widthMm;
      } else {
        // 현재 그룹 확정
        result.push(mergeSingleGroup(currentGroup));
        // 새 그룹 시작
        currentGroup = [seg];
        currentSum = seg.widthMm;
      }
    }

    // 마지막 그룹 확정
    if (currentGroup.length > 0) {
      result.push(mergeSingleGroup(currentGroup));
    }
  }

  return result;
}

// 단일 그룹의 세그먼트들을 하나로 병합
function mergeSingleGroup(segs: FrameRenderSegment[]): FrameRenderSegment {
  if (segs.length === 1) return segs[0];
  const leftEdge = Math.min(...segs.map(s => s.centerXmm - s.widthMm / 2));
  const rightEdge = Math.max(...segs.map(s => s.centerXmm + s.widthMm / 2));
  const totalWidth = rightEdge - leftEdge;
  const centerX = (leftEdge + rightEdge) / 2;
  return {
    widthMm: totalWidth,
    centerXmm: centerX,
    zPosition: segs[0].zPosition,
    height: segs[0].height,
    yPosition: segs[0].yPosition,
    material: segs[0].material,
  };
}

// 점선 라인 컴포넌트
const DashedLine: React.FC<{
  points: [number, number, number][];
  color: string;
  dashSize: number;
  gapSize: number;
}> = ({ points, color, dashSize, gapSize }) => {
  const lineRef = useRef<THREE.Line>(null);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [points]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(points.flat());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [points]);

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineDashedMaterial
        color={color}
        dashSize={dashSize}
        gapSize={gapSize}
        opacity={0.6}
        transparent={true}
      />
    </line>
  );
};

// 2D 모드용 Box with Edges 컴포넌트 - EdgesGeometry 사용으로 일관성 확보
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  onBeforeRender?: () => void;
  viewMode?: '2D' | '3D';
  view2DTheme?: 'dark' | 'light';
  isEndPanel?: boolean; // 엔드패널 여부
  shadowEnabled?: boolean; // 그림자 활성화 여부
  hideEdges?: boolean; // 외곽선 숨김
  isOuterFrame?: boolean; // 외곽 프레임 여부 (3D 은선모드에서 경계선 숨김용)
  name?: string; // 씬 추출용 이름
  renderOrder?: number; // 렌더링 순서 (낮을수록 먼저 그려짐)
  excludeKey?: string; // CNC 옵티마이저 패널 제외용 복합키 (furnitureId::meshName)
  excludeKeys?: string[]; // 복수 excludeKey (L자 서라운드: 전면+측면 중 어느 쪽이든 제외 시 숨김)
  furnitureId?: string;
  panelName?: string;
}> = ({ args, position, material, renderMode, onBeforeRender, viewMode: viewModeProp, view2DTheme, isEndPanel = false, shadowEnabled = true, hideEdges = false, isOuterFrame = false, name, renderOrder, excludeKey, excludeKeys, furnitureId, panelName }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { panelSimulationPhase, panelSimulationRevision, panelSimulationLayouts, liveDimensionSelectedKey, setLiveDimensionSelectedKey, isLiveDimensionMode, isTapeMeasureMode } = useUIStore();
  const simulationRevisionRef = useRef(panelSimulationRevision);
  const simulationStartTimeRef = useRef(0);
  const cleanupKey = excludeKey || (furnitureId && panelName ? `${furnitureId}::${panelName}` : undefined);
  useEffect(() => {
    return () => {
      if (cleanupKey) removePanelSimulationSource(cleanupKey);
    };
  }, [cleanupKey]);

  // CNC 옵티마이저 패널 제외 체크: excludeKey 또는 excludeKeys 중 하나라도 매칭되면 숨김
  const isExcludedByOptimizer = useExcludedPanelsStore((s) => {
    if (s.excludedKeys.size === 0) return false;
    const keys = [excludeKey, ...(excludeKeys ?? [])].filter((key): key is string => !!key);
    return keys.some((key) => {
      if (s.excludedKeys.has(key)) return true;
      const separatorIndex = key.indexOf('::');
      if (separatorIndex < 0) {
        return getExcludedPanelAliases(key).some(alias => s.excludedKeys.has(alias));
      }
      const furnitureId = key.slice(0, separatorIndex);
      const panelName = key.slice(separatorIndex + 2);
      return getExcludedPanelAliases(panelName).some(alias => s.excludedKeys.has(`${furnitureId}::${alias}`));
    });
  });

  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args[0], args[1], args[2]]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const { viewMode: contextViewMode } = useSpace3DView();
  const viewMode = viewModeProp || contextViewMode;
  const { theme } = useViewerTheme();
  const liveDimensionPanelName = panelName || name;
  const liveDimensionKey = excludeKey || (furnitureId && liveDimensionPanelName
    ? `${furnitureId}::${liveDimensionPanelName}`
    : liveDimensionPanelName
      ? `room-frame::${liveDimensionPanelName}`
      : undefined);
  const liveDimensionUserData = liveDimensionPanelName ? {
    ...(furnitureId ? { furnitureId } : {}),
    panelName: liveDimensionPanelName,
    ...(liveDimensionKey ? { liveDimensionKey } : {}),
    liveDimension: {
      widthMm: Math.round(args[0] / 0.01),
      heightMm: Math.round(args[1] / 0.01),
      depthMm: Math.round(args[2] / 0.01),
    },
  } : undefined;
  const isInspectionMode = viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode);
  const isLiveDimensionSelected = !!(liveDimensionKey && liveDimensionSelectedKey === liveDimensionKey);
  const handleFrameClick = (e: any) => {
    if (!isInspectionMode || !liveDimensionKey) return;
    e.stopPropagation?.();
    setLiveDimensionSelectedKey(isLiveDimensionSelected ? null : liveDimensionKey);
  };
  const selectedOutlineLines = useMemo<[number, number, number][][]>(() => {
    const [w, h, d] = args;
    const x0 = -w / 2;
    const x1 = w / 2;
    const y0 = -h / 2;
    const y1 = h / 2;
    const z0 = -d / 2;
    const z1 = d / 2;

    return [
      [[x0, y0, z0], [x1, y0, z0]],
      [[x1, y0, z0], [x1, y1, z0]],
      [[x1, y1, z0], [x0, y1, z0]],
      [[x0, y1, z0], [x0, y0, z0]],
      [[x0, y0, z1], [x1, y0, z1]],
      [[x1, y0, z1], [x1, y1, z1]],
      [[x1, y1, z1], [x0, y1, z1]],
      [[x0, y1, z1], [x0, y0, z1]],
      [[x0, y0, z0], [x0, y0, z1]],
      [[x1, y0, z0], [x1, y0, z1]],
      [[x1, y1, z0], [x1, y1, z1]],
      [[x0, y1, z0], [x0, y1, z1]],
    ];
  }, [args]);

  useFrame(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    const separatorIndex = excludeKey?.indexOf('::') ?? -1;
    const keyFurnitureId = separatorIndex >= 0 ? excludeKey!.slice(0, separatorIndex) : furnitureId;
    const keyPanelName = panelName || (separatorIndex >= 0 ? excludeKey!.slice(separatorIndex + 2) : name);
    const compositeKey = excludeKey || (keyFurnitureId && keyPanelName ? `${keyFurnitureId}::${keyPanelName}` : undefined);

    if (viewMode !== '3D' || isExcludedByOptimizer || !compositeKey || !keyFurnitureId || !keyPanelName) {
      group.position.set(position[0], position[1], position[2]);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);
      group.visible = !isExcludedByOptimizer;
      return;
    }

    if (simulationRevisionRef.current !== panelSimulationRevision) {
      simulationRevisionRef.current = panelSimulationRevision;
      simulationStartTimeRef.current = performance.now() / 1000;
    }

    if (panelSimulationRevision <= 0) return;

    const safeArgs = args.map(value => Math.max(MIN_SIMULATION_BOX_SIZE, value)) as [number, number, number];
    const simulationLayout = resolvePanelSimulationLayout(panelSimulationLayouts, keyFurnitureId, keyPanelName);
    const hasSimulationLayouts = Object.keys(panelSimulationLayouts).length > 0;
    const isMergedFramePiece = keyPanelName === 'top-frame' || keyPanelName === 'base-frame';
    if (panelSimulationPhase === 'assembled' && hasSimulationLayouts && !simulationLayout) {
      group.visible = false;
      if (import.meta.env.DEV) {
        console.warn('[PanelSimulation] room frame assembly target missing, hiding original pop-in:', `${keyFurnitureId}::${keyPanelName}`);
      }
      return;
    }
    if (panelSimulationPhase === 'layout' && !simulationLayout) {
      if (isMergedFramePiece && hasSimulationLayouts) {
        group.visible = false;
        return;
      }
      group.visible = false;
      group.position.set(position[0], position[1], position[2]);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);
      if (hasSimulationLayouts && import.meta.env.DEV) {
        console.warn('[PanelSimulation] room frame layout target missing:', `${keyFurnitureId}::${keyPanelName}`);
      }
      return;
    }

    if (group.visible === false) {
      group.visible = true;
    }

    const parent = group.parent;
    const layoutKey = getPanelSimulationLayoutKey(panelSimulationLayouts, keyFurnitureId, keyPanelName) || compositeKey;
    const slot = getPanelSimulationSlot(layoutKey);
    const targetScaleVector = new THREE.Vector3(1, 1, 1);
    let targetPosition = new THREE.Vector3(position[0], position[1], position[2]);
    let targetQuaternion = new THREE.Quaternion();

    if (panelSimulationPhase === 'layout' && simulationLayout) {
      updatePanelSimulationSource({
        key: layoutKey,
        furnitureId: keyFurnitureId,
        panelName: keyPanelName,
        args: safeArgs,
        object: group,
        material,
      });
      group.visible = false;
      return;
    }
    if (panelSimulationPhase === 'assembled' && simulationLayout) {
      updatePanelSimulationSource({
        key: layoutKey,
        furnitureId: keyFurnitureId,
        panelName: keyPanelName,
        args: safeArgs,
        object: group,
        material,
      });
      group.visible = false;
      return;
    }

    if (panelSimulationPhase === 'layout' && simulationLayout) {
      const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(safeArgs);
      targetScaleVector.setComponent(thicknessAxis.index, simulationLayout.scale);
      targetScaleVector.setComponent(widthAxis.index, simulationLayout.widthWorld / Math.max(safeArgs[widthAxis.index], MIN_SIMULATION_BOX_SIZE));
      targetScaleVector.setComponent(lengthAxis.index, simulationLayout.heightWorld / Math.max(safeArgs[lengthAxis.index], MIN_SIMULATION_BOX_SIZE));
      const thickness = Math.min(safeArgs[0], safeArgs[1], safeArgs[2]);
      targetPosition = new THREE.Vector3(
        simulationLayout.worldX,
        simulationLayout.worldY + thickness * simulationLayout.scale * 0.5 + 0.03,
        simulationLayout.worldZ
      );
      targetQuaternion = buildFlatPanelQuaternion(safeArgs, simulationLayout.rotationZ);

      if (parent) {
        parent.updateWorldMatrix(true, false);
        parent.worldToLocal(targetPosition);

        const parentWorldQuaternion = new THREE.Quaternion();
        parent.getWorldQuaternion(parentWorldQuaternion);
        targetQuaternion.premultiply(parentWorldQuaternion.invert());
      }
    }

    const sequenceIndex = panelSimulationPhase === 'layout'
      ? (simulationLayout?.order ?? slot)
      : getFrameAssemblySequence(keyFurnitureId, keyPanelName, position, parent);
    const playback = useUIStore.getState();
    const timing = getPanelSimulationStyleTiming(playback.panelSimulationAnimationStyle);
    const elapsed = getPanelSimulationPlaybackElapsed(playback) - (panelSimulationPhase === 'layout' ? timing.cameraSettleLayout : timing.cameraSettleAssembly) - sequenceIndex * (panelSimulationPhase === 'layout' ? timing.layoutDelayStep : timing.assemblyDelayStep);
    if (elapsed < 0) {
      if (panelSimulationPhase === 'assembled' && panelSimulationRevision > 0) {
        group.visible = false;
      }
      return;
    }

    const progress = getPanelSimulationStyleProgress(playback.panelSimulationAnimationStyle, elapsed / (panelSimulationPhase === 'layout' ? timing.layoutDuration : timing.duration));
    group.position.lerp(targetPosition, progress * 0.18);
    group.quaternion.slerp(targetQuaternion, progress * 0.18);
    group.scale.lerp(targetScaleVector, progress * 0.18);
  });

  // 메모리 누수 방지: 컴포넌트 언마운트 시 geometry 정리
  useEffect(() => {
    return () => {
      geometry.dispose();
      edgesGeometry.dispose();
    };
  }, [geometry, edgesGeometry]);

  return (
    <group
      ref={groupRef}
      position={position}
      name={name}
      visible={!isExcludedByOptimizer}
      userData={liveDimensionUserData}
      onClick={handleFrameClick}
    >
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh
          geometry={geometry}
          receiveShadow={viewMode === '3D' && shadowEnabled}
          castShadow={viewMode === '3D' && shadowEnabled}
          onBeforeRender={onBeforeRender}
          name={name ? `${name}-mesh` : undefined}
          renderOrder={renderOrder}
          userData={liveDimensionUserData}
          onClick={handleFrameClick}
        >
          <primitive key={material.uuid} object={material} attach="material" />
        </mesh>
      )}
      {renderMode === 'solid' && isLiveDimensionSelected && (
        <mesh
          geometry={geometry}
          renderOrder={(renderOrder ?? 10) + 1000}
          raycast={() => null}
          userData={{ liveDimensionOverlay: true, tapeMeasureOverlay: true, decoration: true }}
          scale={[1.012, 1.012, 1.012]}
        >
          <meshBasicMaterial
            color="#ef4444"
            transparent
            opacity={0.28}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      {/* 모서리 라인 렌더링 - hideEdges가 false일 때만 표시 */}
      {!hideEdges && (
        <lineSegments name={name || "space-frame"} geometry={edgesGeometry} onClick={handleFrameClick}>
          <lineBasicMaterial
            color={
              // 3D solid 모드에서 외곽 프레임 엣지도 표시
              isOuterFrame && renderMode === 'solid' && viewMode === '3D'
                ? "#3a3a3a"
                : // MeshBasicMaterial인 경우 (프레임 형광색) material의 색상 사용
                material instanceof THREE.MeshBasicMaterial
                  ? "#" + material.color.getHexString()
                  : // 2D 모드에서 엔드패널인 경우 도어와 같은 연두색 사용
                  viewMode === '2D' && isEndPanel
                    ? "#00FF00" // 연두색 (도어 색상)
                    : renderMode === 'wireframe'
                      ? (theme?.mode === 'dark' ? "#ffffff" : "#000000")
                      : (viewMode === '2D' && view2DTheme === 'dark' ? "#FFFFFF" : "#666666")
            }
            linewidth={viewMode === '2D' && view2DTheme === 'dark' ? 1.5 : 0.5}
            opacity={1.0}
            transparent={false}
          />
        </lineSegments>
      )}
      {isLiveDimensionSelected && (
        <group
          scale={[1.014, 1.014, 1.014]}
          userData={{ liveDimensionOverlay: true, tapeMeasureOverlay: true, decoration: true }}
        >
          {selectedOutlineLines.map((line, index) => (
            <React.Fragment key={`frame-selected-outline-${name || 'frame'}-${index}`}>
              <NativeLine
                name={`frame-selected-outline-shadow-${name || 'frame'}-${index}`}
                points={line}
                color="#111827"
                lineWidth={2.4}
                opacity={0.42}
                transparent
                depthTest={false}
                depthWrite={false}
                renderOrder={(renderOrder ?? 10) + 1002}
              />
              <NativeLine
                name={`frame-selected-outline-${name || 'frame'}-${index}`}
                points={line}
                color="#ef4444"
                lineWidth={1.35}
                opacity={0.98}
                transparent
                depthTest={false}
                depthWrite={false}
                renderOrder={(renderOrder ?? 10) + 1003}
              />
            </React.Fragment>
          ))}
        </group>
      )}
    </group>
  );
};

// Wireframe 모드에서 PlaneGeometry의 4변 외곽선만 렌더링
const PlaneOutline: React.FC<{
  args: [number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  color?: string;
}> = ({ args, position, rotation, color = "#333333" }) => {
  const geometry = useMemo(() => new THREE.PlaneGeometry(args[0], args[1]), [args[0], args[1]]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edgesGeometry.dispose();
    };
  }, [geometry, edgesGeometry]);

  return (
    <lineSegments position={position} rotation={rotation} geometry={edgesGeometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
};

const Room: React.FC<RoomProps> = ({
  spaceInfo,
  floorColor = '#FFCC99',
  viewMode = '3D',
  view2DDirection,
  materialConfig,
  showAll = true,
  showFrame = true,
  placedModules,
  showDimensions,
  isStep2,
  renderMode: renderModeProp,
  activeZone,
  showFurniture,
  hideEdges = false,
  cameraModeOverride,
  readOnly = false,
  onFurnitureClick,
  ghostHighlightSlotIndex,
  islandSideFilter,
}) => {
  // 고유 ID로 어떤 Room 인스턴스인지 구분
  const roomId = React.useRef(`room-${Date.now()}-${Math.random()}`).current;

  // 모든 훅들을 early return 전에 호출 (Rules of Hooks 준수)
  const { theme } = useViewerTheme();
  const { colors } = useThemeColors();
  const { theme: appTheme } = useTheme(); // 앱 테마 가져오기
  const { renderMode: contextRenderMode, plainMaterial: isPlainMaterial } = useSpace3DView(); // context에서 renderMode 가져오기
  const renderMode = renderModeProp || contextRenderMode; // props로 전달된 값을 우선 사용
  const { highlightedFrame, setHighlightedFrame, activeDroppedCeilingTab, view2DTheme, shadowEnabled, cameraMode: cameraModeFromStore, selectedSlotIndex, showBorings, isLayoutBuilderOpen, openSurroundEditPopup, activePopup, isLiveDimensionMode, isTapeMeasureMode, panelSimulationPhase, panelSimulationViewBackup, activePlacementWall } = useUIStore();
  const isLiveDimensionInspecting = viewMode === '3D' && isLiveDimensionMode;
  const isInspectionMode = viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode);
  const isPanelSimulationLayout = viewMode === '3D' && (panelSimulationPhase === 'layout' || !!panelSimulationViewBackup);
  const isDesignMode = isLayoutBuilderOpen || activePopup?.type === 'customizableEdit';
  const wireframeColor = view2DTheme === 'dark' ? "#ffffff" : "#333333"; // 은선모드 벽 라인 색상
  const placedModulesFromStore = useFurnitureStore((state) => state.placedModules); // 가구 정보 가져오기
  const firstModuleId = placedModulesFromStore[0]?.id || ''; // CNC 프레임 제외용
  const frameDimensionFurnitureIds = useMemo(
    () => placedModulesFromStore.filter(pm => !pm.isSurroundPanel).map(pm => pm.id),
    [placedModulesFromStore]
  );
  // CNC와 동일한 방식으로 좌/우 끝 모듈 ID 계산 (slotIndex 기준)
  const leftMostModuleId = useMemo(() => {
    if (placedModulesFromStore.length <= 1) return placedModulesFromStore[0]?.id || '';
    let minSlot = Infinity;
    let leftId = placedModulesFromStore[0]?.id || '';
    placedModulesFromStore.forEach((pm) => {
      const slot = pm.slotIndex ?? 0;
      if (slot < minSlot) { minSlot = slot; leftId = pm.id; }
    });
    return leftId;
  }, [placedModulesFromStore]);
  const rightMostModuleId = useMemo(() => {
    if (placedModulesFromStore.length <= 1) return placedModulesFromStore[0]?.id || '';
    let maxSlot = -Infinity;
    let rightId = placedModulesFromStore[placedModulesFromStore.length - 1]?.id || '';
    placedModulesFromStore.forEach((pm, idx) => {
      const slot = pm.slotIndex ?? idx;
      if (slot > maxSlot) { maxSlot = slot; rightId = pm.id; }
    });
    return rightId;
  }, [placedModulesFromStore]);
  const layoutMode = useSpaceConfigStore((state) => state.spaceInfo.layoutMode); // 배치 모드 직접 구독
  const isFreePlacement = layoutMode === 'free-placement';
  // 슬롯배치 커튼박스: curtainBox 필드에서 확인 (단내림과 독립)
  const isCurtainBoxSlot = !isFreePlacement && !!spaceInfo.curtainBox?.enabled;

  // 프레임/엔드패널 렌더링 두께: 사용자 선택 가구재 두께 사용 (기본 18mm)
  const endPanelRenderThickness = spaceInfo.panelThickness || 18;

  // 자유배치/슬롯배치 공통: surroundType에 따라 프레임 표시
  const effectiveShowFrame = showFrame;

  // hideEdges: PDF 캡처용 외곽선 숨김 (prop으로 제어)

  // 전체서라운드 여부: surround + frameConfig.top/bottom 모두 명시적 true → 상단 몰딩이 좌우와 같은 Z축
  const isFullSurround = spaceInfo.surroundType === 'surround' &&
    spaceInfo.frameConfig?.top === true && spaceInfo.frameConfig?.bottom === true;

  // 가구별 기본 깊이 (유리장 365, 신발장 380, 상부장 300, 기타 600)
  const getModBaseDepthMm = (moduleId: string): number => {
    if (moduleId.includes('glass-cabinet')) return 365;
    if (moduleId.includes('-entryway-') || moduleId.includes('-shelf-') ||
        moduleId.includes('-4drawer-shelf-') || moduleId.includes('-2drawer-shelf-')) return 380;
    if (moduleId.includes('upper-cabinet')) return 300;
    // 인출장: 모듈 기본 깊이 570 (W620×D570)
    if (moduleId.includes('pull-out-cabinet')) return 570;
    // 팬트리장/냉장고장: 600 (기본 분기에서 처리되지만 명시)
    if (moduleId.includes('pantry-cabinet')) return 600;
    if (moduleId.includes('fridge-cabinet') && !moduleId.includes('built-in-fridge')) return 600;
    return 600;
  };

  const getPlacedModuleDepthMm = (mod: any): number => {
    const mid = mod?.moduleId || '';
    const moduleData = mid
      ? getModuleById(mid, { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth }, spaceInfo)
      : undefined;
    return mod?.customDepth
      ?? mod?.freeDepth
      ?? mod?.depth
      ?? getCategoryDefaultFurnitureDepth(
        spaceInfo.depth || SPACE_BASE_DEPTH_MM,
        mid,
        spaceInfo.furnitureDepthDefaults
      )
      ?? moduleData?.dimensions?.depth
      ?? (moduleData as any)?.defaultDepth
      ?? getModBaseDepthMm(mid);
  };

  const getFrontPlacedModuleFrameCenterZ = (mod: any): number => {
    const panelDepthMm = spaceInfo.depth || 1500;
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const panelDepthUnits = mmToThreeUnits(panelDepthMm);
    const furnitureDepthUnits = mmToThreeUnits(furnitureDepthMm);
    const furnitureOffsetZ = -panelDepthUnits / 2 + (panelDepthUnits - furnitureDepthUnits) / 2;
    const moduleDepthUnits = mmToThreeUnits(getPlacedModuleDepthMm(mod));
    const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    const baseDepthOffset = isFloatPlacement ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
    const doorFrontOffset = mod?.hasDoor === false ? 0 : 20;
    const moduleFrontZ = furnitureOffsetZ - furnitureDepthUnits / 2 - mmToThreeUnits(doorFrontOffset) + moduleDepthUnits + baseDepthOffset;
    return moduleFrontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2;
  };

  const getFrontPlacedModuleTopFrameCenterZ = (mod: any): number => {
    const panelDepthMm = spaceInfo.depth || 1500;
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const panelDepthUnits = mmToThreeUnits(panelDepthMm);
    const furnitureDepthUnits = mmToThreeUnits(furnitureDepthMm);
    const furnitureOffsetZ = -panelDepthUnits / 2 + (panelDepthUnits - furnitureDepthUnits) / 2;
    const moduleDepthUnits = mmToThreeUnits(getPlacedModuleDepthMm(mod));
    const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    const baseDepthOffset = isFloatPlacement ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
    const moduleFrontZ = furnitureOffsetZ - furnitureDepthUnits / 2 - mmToThreeUnits(20) + moduleDepthUnits + baseDepthOffset;
    return moduleFrontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2;
  };

  const getBaseFrameCenterZ = (mod: any): number => {
    const panelDepthMm = spaceInfo.depth || 1500;
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const panelDepthUnits = mmToThreeUnits(panelDepthMm);
    const furnitureDepthUnits = mmToThreeUnits(furnitureDepthMm);
    const furnitureOffsetZ = -panelDepthUnits / 2 + (panelDepthUnits - furnitureDepthUnits) / 2;
    const mid = mod.moduleId || '';
    const sectionDepths = mod.sectionDepths as number[] | undefined;
    const defaultShoeDepthMm = mid.includes('glass-cabinet') ? 365 : 380;
    const isShoeBase = mid.includes('-entryway-')
      || mid.includes('-shelf-')
      || mid.includes('-4drawer-shelf-')
      || mid.includes('-2drawer-shelf-')
      || mid.includes('glass-cabinet');
    const baseDepthMm = isShoeBase
      ? (mod.lowerSectionDepth || mod.customDepth || mod.freeDepth || defaultShoeDepthMm)
      : (sectionDepths?.[0] || mod.lowerSectionDepth || mod.customDepth || mod.freeDepth || getPlacedModuleDepthMm(mod));
    const baseFrontCenterZ = furnitureOffsetZ
      - furnitureDepthUnits / 2
      - mmToThreeUnits(20)
      + mmToThreeUnits(baseDepthMm)
      - mmToThreeUnits(END_PANEL_THICKNESS) / 2;
    const baseInsetMm = (spaceInfo.baseConfig?.depth ?? 0) + resolveEffectiveBaseFrameOffsetMm(mod, spaceInfo);
    const backWallGapMm = mod.backWallGap ?? 0;
    return baseFrontCenterZ
      - mmToThreeUnits(baseInsetMm)
      + (backWallGapMm > 0 ? mmToThreeUnits(backWallGapMm) : 0);
  };

  // 해당 가구의 프레임 Z 이동량 계산 (공간 기본 깊이 600 기준)
  // - 신발장: 뒷벽 정렬 기본 380 → 무조건 220mm 뒤로 (customDepth 더 줄이면 그만큼 더)
  // - 기타 가구: 섹션 depth 줄인 만큼 뒤로 (direction=back이면 0, front이면 -diff)
  const SPACE_BASE_DEPTH_MM = 600;
  const computeDepthZOffset = (mod: any, useSection: 'upper' | 'lower' | 'any' = 'any'): number => {
    if (!mod) return 0;
    const mid = mod.moduleId || '';
    const isShoe = (
      mid.includes('-entryway-') || mid.includes('-shelf-') ||
      mid.includes('-4drawer-shelf-') || mid.includes('-2drawer-shelf-') ||
      mid.includes('glass-cabinet')
    );
    if (isShoe) {
      // 신발장/유리장: 공간 기본 600 기준. 섹션별 깊이 우선, 없으면 customDepth, 최후 기본 깊이
      // 상/하 섹션별로 프레임이 따라가도록 useSection에 따라 섹션 값 선택
      const defaultShoeDepth = mid.includes('glass-cabinet') ? 365 : 380;
      let shoeDepth: number;
      if (useSection === 'upper') {
        shoeDepth = mod.upperSectionDepth || mod.customDepth || mod.freeDepth || defaultShoeDepth;
      } else if (useSection === 'lower') {
        shoeDepth = mod.lowerSectionDepth || mod.customDepth || mod.freeDepth || defaultShoeDepth;
      } else {
        // any: 두 섹션 중 더 작게 줄어든(=프레임이 더 뒤로 가야 하는) 쪽 기준
        // 단, 더 큰 쪽이 공간 600보다 작으면 그 만큼만 이동
        const u = mod.upperSectionDepth || mod.customDepth || mod.freeDepth || defaultShoeDepth;
        const l = mod.lowerSectionDepth || mod.customDepth || mod.freeDepth || defaultShoeDepth;
        shoeDepth = Math.max(u, l); // 더 덜 줄어든 쪽 (프레임은 덜 줄인 쪽에 맞춤)
      }
      if (shoeDepth >= SPACE_BASE_DEPTH_MM) return 0;
      return -mmToThreeUnits(SPACE_BASE_DEPTH_MM - shoeDepth);
    }
    // 인출장/팬트리장/냉장고장: sectionDepths 배열 사용 (마지막 섹션 = 상부 = 도어/프레임 기준)
    const isNSecMod = mid.includes('pull-out-cabinet') ||
      mid.includes('pantry-cabinet') ||
      (mid.includes('fridge-cabinet') && !mid.includes('built-in-fridge'));
    if (isNSecMod) {
      const sectionDepthsArr = mod.sectionDepths as number[] | undefined;
      const sectionDirArr = mod.sectionDepthDirections as ('front'|'back')[] | undefined;
      const baseDepth = getModBaseDepthMm(mid);
      // 'upper' 요청: 마지막 섹션, 'lower' 요청: 첫 섹션
      const idx = useSection === 'lower' ? 0 : (sectionDepthsArr ? sectionDepthsArr.length - 1 : 0);
      const curDepth = sectionDepthsArr?.[idx];
      if (!curDepth || curDepth >= baseDepth) return 0;
      const diff = baseDepth - curDepth;
      const dir = sectionDirArr?.[idx] || 'front';
      return dir === 'back' ? 0 : -mmToThreeUnits(diff);
    }
    // 기타 가구: 카테고리 기본 깊이를 기준으로 실제 축소분만 반영한다.
    const baseDepth = getCategoryDefaultFurnitureDepth(
      spaceInfo.depth || SPACE_BASE_DEPTH_MM,
      mid,
      spaceInfo.furnitureDepthDefaults
    ) ?? getModBaseDepthMm(mid);
    let curDepth: number | undefined;
    if (useSection === 'upper') curDepth = mod.upperSectionDepth ?? mod.customDepth;
    else if (useSection === 'lower') curDepth = mod.lowerSectionDepth ?? mod.customDepth;
    else curDepth = mod.lowerSectionDepth ?? mod.upperSectionDepth ?? mod.customDepth;
    if (!curDepth || curDepth >= baseDepth) return 0;
    const diff = baseDepth - curDepth;
    const dir = useSection === 'upper'
      ? (mod.upperSectionDepthDirection || 'front')
      : (mod.lowerSectionDepthDirection || mod.upperSectionDepthDirection || 'front');
    return dir === 'back' ? 0 : -mmToThreeUnits(diff);
  };

  // props로 전달된 cameraMode가 있으면 우선 사용, 없으면 UIStore 값 사용
  const cameraMode = cameraModeOverride || cameraModeFromStore;

  // Three.js hooks for camera tracking
  const { camera, invalidate } = useThree();
  const spaceLineTone = useMemo(() => {
    const platformInfo = typeof navigator !== 'undefined'
      ? `${navigator.platform || ''} ${navigator.userAgent || ''}`
      : '';
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const isWindows = /Win/i.test(platformInfo);
    const isMac = /Mac/i.test(platformInfo);

    if (isWindows || dpr < 1.5) {
      return {
        base: '#a0a0a0',
        wallEdge: '#9a9a9a',
        backMix: 0.18,
        frontMix: 0.62,
        fadeWhiteMax: 0.78,
        lineOpacity: 0.74,
        cornerOpacity: 0.7
      };
    }

    if (isMac || dpr >= 1.5) {
      return {
        base: '#7c7c7c',
        wallEdge: '#808080',
        backMix: 0.08,
        frontMix: 0.38,
        fadeWhiteMax: 0.5,
        lineOpacity: 0.92,
        cornerOpacity: 0.88
      };
    }

    return {
      base: '#8f8f8f',
      wallEdge: '#8f8f8f',
      backMix: 0.12,
      frontMix: 0.48,
      fadeWhiteMax: 0.62,
      lineOpacity: 0.86,
      cornerOpacity: 0.82
    };
  }, []);

  // 벽 재질 refs - ShaderMaterial로 타입 변경
  const leftWallMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const rightWallMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const topWallMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const droppedWallMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const floorWallMaterialRef = useRef<THREE.ShaderMaterial>(null);

  // 바닥 그라데이션 머티리얼: 페이드 비활성화(불투명+depthWrite) — 정상 렌더 유지
  const floorGradientMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('vertical', viewMode, false, false), [viewMode]);

  // 카메라 각도에 따라 벽 투명도 업데이트
  useFrame(() => {
    // perspective 모드: 카메라가 벽 뒤로 돌아가면 점진적으로 투명
    if (viewMode === '3D' && cameraMode === 'perspective') {
      // 카메라 → 타겟(원점) 방향 벡터 (정규화)
      // 벽 법선은 방 안쪽 향함: left(+X), right(-X), top(-Y)
      // 카메라가 벽 바깥쪽에 있을 때 = view벡터·법선 < 0 → 투명
      const camPos = camera.position;
      const dist = Math.sqrt(camPos.x * camPos.x + camPos.y * camPos.y + camPos.z * camPos.z) || 1;
      const vx = camPos.x / dist;
      const vy = camPos.y / dist;
      // const vz = camPos.z / dist; // 정면벽은 그라데이션이 없으므로 사용 안 함

      // dot값이 음수(카메라가 벽 뒤로 회전)일 때만 페이드 시작
      // 정면뷰(dot≈0)에서는 완전 불투명 유지
      const computeOpacity = (dot: number, fadeStart = -0.05, fadeEnd = -0.4): number => {
        if (dot >= fadeStart) return 1;
        if (dot <= fadeEnd) return 0;
        return (dot - fadeEnd) / (fadeStart - fadeEnd);
      };

      // 좌측벽: 방 왼쪽(-X)에 위치, 안쪽(+X) 향함. 카메라가 오른쪽(+X)에 있을수록 좌측벽이 정면으로 보임 → 잘 보임
      // 카메라가 왼쪽(-X)으로 가면 좌측벽 뒤쪽으로 → 가구를 가림 → 투명화
      const leftDot = vx;
      // 우측벽: 방 오른쪽(+X)에 위치, 안쪽(-X) 향함. 카메라가 왼쪽(-X)에 있을수록 잘 보임
      // 카메라가 오른쪽(+X)으로 가면 우측벽 뒤로 → 투명화
      const rightDot = -vx;
      // 천장: 카메라가 매우 위(vy 큰 양수)로 올라가야만 천장이 시야를 가림
      // 정면뷰(vy 작은 양수)에서는 천장이 위쪽 배경으로 보여야 정상 → 불투명 유지
      // vy 음수(아래에서 올려다봄)에서도 천장은 위쪽 너머 → 불투명
      // 임계값: 페이드 시작 = vy 0.6, 완전 투명 = vy 0.9
      const topDot = vy;

      if (leftWallMaterialRef.current && leftWallMaterialRef.current.uniforms) {
        leftWallMaterialRef.current.uniforms.opacity.value = computeOpacity(leftDot);
      }
      if (rightWallMaterialRef.current && rightWallMaterialRef.current.uniforms) {
        rightWallMaterialRef.current.uniforms.opacity.value = computeOpacity(rightDot);
      }
      // 천장: vy(=topDot)가 클수록(카메라가 위로 회전) 천장이 가구 윗면을 가림 → 페이드
      // 정면뷰(vy ≈ 0.3 전후 추정)는 불투명 유지, 위로 더 회전하면 페이드 시작
      const computeTopOpacity = (dot: number, fadeStart = 0.35, fadeEnd = 0.6): number => {
        if (dot <= fadeStart) return 1;
        if (dot >= fadeEnd) return 0;
        return (fadeEnd - dot) / (fadeEnd - fadeStart);
      };
      if (topWallMaterialRef.current && topWallMaterialRef.current.uniforms) {
        topWallMaterialRef.current.uniforms.opacity.value = computeTopOpacity(topDot);
      }
      if (droppedWallMaterialRef.current && droppedWallMaterialRef.current.uniforms) {
        droppedWallMaterialRef.current.uniforms.opacity.value = computeTopOpacity(topDot);
      }
      // 바닥: 정면뷰에서는 가구 아래 거의 안 보이므로 항상 불투명 유지
      // 카메라가 아래로 많이 내려가야(거의 정수직 아래에서 올려다봄) 가릴 수 있는데
      // 그 경우는 매우 드물어 페이드 비활성화
      if (floorWallMaterialRef.current && floorWallMaterialRef.current.uniforms) {
        floorWallMaterialRef.current.uniforms.opacity.value = 1;
      }
    } else if (viewMode === '3D' && cameraMode === 'orthographic') {
      // orthographic 모드에서는 모든 그라데이션 메쉬 숨김
      if (leftWallMaterialRef.current && leftWallMaterialRef.current.uniforms) {
        leftWallMaterialRef.current.uniforms.opacity.value = 0;
      }
      if (rightWallMaterialRef.current && rightWallMaterialRef.current.uniforms) {
        rightWallMaterialRef.current.uniforms.opacity.value = 0;
      }
      if (topWallMaterialRef.current && topWallMaterialRef.current.uniforms) {
        topWallMaterialRef.current.uniforms.opacity.value = 0;
      }
      if (droppedWallMaterialRef.current && droppedWallMaterialRef.current.uniforms) {
        droppedWallMaterialRef.current.uniforms.opacity.value = 0;
      }
      if (floorWallMaterialRef.current && floorWallMaterialRef.current.uniforms) {
        floorWallMaterialRef.current.uniforms.opacity.value = 0;
      }
    }
  });

  // spaceInfo 유효성 체크 (early return 대신 플래그 사용 - Rules of Hooks 준수)
  const isSpaceInfoValid = spaceInfo && typeof spaceInfo.width === 'number' && typeof spaceInfo.height === 'number';

  // Room 컴포넌트 렌더링 추적
  React.useEffect(() => {
    if (!isSpaceInfoValid) return;
// console.log('🏠🏠🏠 Room 컴포넌트 렌더링:', {
      // roomId: roomId.substring(0, 20),
      // viewMode,
      // placedModulesProp: !!placedModules,
      // placedModulesCount: placedModules?.length,
      // activeZone,
      // droppedCeiling: spaceInfo?.droppedCeiling,
      // timestamp: Date.now()
    // });
  });

  // 노서라운드 모드에서 엔드패널이 생성되는 위치 확인
  const getEndPanelPositions = () => {
    if (!isSpaceInfoValid || spaceInfo.surroundType !== 'no-surround') return { left: false, right: false, slots: [] };

    const modules = placedModules || placedModulesFromStore;
    if (!modules || modules.length === 0) return { left: false, right: false, slots: [] };

    // 각 슬롯에서 엔드패널 생성 여부 확인
    const endPanelSlots = [];
    let hasLeftEndPanel = false;
    let hasRightEndPanel = false;

    const columnCount = spaceInfo.mainDoorCount || 3;

    // 모든 슬롯 확인
    for (let slotIndex = 0; slotIndex < columnCount; slotIndex++) {
      const slotModules = modules.filter(m => m.slotIndex === slotIndex);
      const hasTall = slotModules.some(m => m.category === 'tall-cabinet');
      const hasUpperLower = slotModules.some(m => m.category === 'upper-cabinet' || m.category === 'lower-cabinet');

      // 키큰장과 상하부장이 함께 있으면 엔드패널 생성
      if (hasTall && hasUpperLower) {
        endPanelSlots.push(slotIndex);

        // 첫 번째 슬롯
        if (slotIndex === 0) {
          hasLeftEndPanel = true;
        }
        // 마지막 슬롯
        if (slotIndex === columnCount - 1) {
          hasRightEndPanel = true;
        }
      }
    }

// console.log('🔍 엔드패널 생성 위치:', {
      // 노서라운드모드: spaceInfo.surroundType === 'no-surround',
      // 설치타입: spaceInfo.installType,
      // 엔드패널슬롯: endPanelSlots,
      // 왼쪽엔드패널: hasLeftEndPanel,
      // 오른쪽엔드패널: hasRightEndPanel,
      // 전체슬롯수: columnCount
    // });

    return {
      left: hasLeftEndPanel,
      right: hasRightEndPanel,
      slots: endPanelSlots
    };
  };

  const endPanelPositions = getEndPanelPositions();

  // 노서라운드 모드에서 각 끝에 가구가 있는지 확인
  const indexingForCheck = calculateSpaceIndexing(spaceInfo);
  const lastSlotIndex = indexingForCheck.columnCount - 1;

  // Zone별 왼쪽/오른쪽 가구 감지 (단내림 대응)
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
  const droppedPosition = spaceInfo.droppedCeiling?.position;

  // 공간의 왼쪽 끝(X축 음수 방향)에 가구가 있는지 체크
  const hasLeftFurniture = spaceInfo.surroundType === 'no-surround' &&
    placedModulesFromStore.some(module => {
      const isDual = module.isDualSlot || module.moduleId.includes('dual-');
      let isAtLeftEdge = false;

      if (hasDroppedCeiling) {
        const droppedZone = indexingForCheck.zones?.dropped;
        const normalZone = indexingForCheck.zones?.normal;

        if (droppedPosition === 'left') {
          // 단내림이 왼쪽에 있음 → 공간 왼쪽 끝 = dropped zone의 왼쪽 끝
          if (module.zone === 'dropped' && droppedZone) {
            const droppedFirstSlot = droppedZone.startSlotIndex ?? 0;
            isAtLeftEdge = module.slotIndex === droppedFirstSlot || (isDual && module.slotIndex === droppedFirstSlot + 1);
          }
        } else {
          // 단내림이 오른쪽에 있음 → 공간 왼쪽 끝 = normal zone의 왼쪽 끝
          if (module.zone === 'normal' || !module.zone) {
            isAtLeftEdge = module.slotIndex === 0 || (isDual && module.slotIndex === 1);
          }
        }
      } else {
        // 단내림 없음 → 공간 왼쪽 끝 = 슬롯 0
        isAtLeftEdge = module.slotIndex === 0 || (isDual && module.slotIndex === 1);
      }

      if (isAtLeftEdge) {
// console.log('🟢 공간 왼쪽 끝 가구 감지:', {
          // slotIndex: module.slotIndex,
          // zone: module.zone,
          // isDualSlot: module.isDualSlot,
          // isDual,
          // moduleId: module.moduleId,
          // droppedPosition
        // });
      }
      return isAtLeftEdge;
    });

  // 공간의 오른쪽 끝(X축 양수 방향)에 가구가 있는지 체크
  const hasRightFurniture = spaceInfo.surroundType === 'no-surround' &&
    placedModulesFromStore.some(module => {
      const isDual = module.isDualSlot || module.moduleId.includes('dual-');
      let isAtRightEdge = false;

      if (hasDroppedCeiling) {
        const droppedZone = indexingForCheck.zones?.dropped;
        const normalZone = indexingForCheck.zones?.normal;

        if (droppedPosition === 'right') {
          // 단내림이 오른쪽에 있음 → 공간 오른쪽 끝 = dropped zone의 오른쪽 끝
          if (module.zone === 'dropped' && droppedZone) {
            const droppedLastSlot = (droppedZone.startSlotIndex ?? 0) + droppedZone.columnCount - 1;
            isAtRightEdge = module.slotIndex === droppedLastSlot || (isDual && module.slotIndex === droppedLastSlot - 1);
          }
        } else {
          // 단내림이 왼쪽에 있음 → 공간 오른쪽 끝 = normal zone의 오른쪽 끝
          if ((module.zone === 'normal' || !module.zone) && normalZone) {
            const normalLastSlot = normalZone.columnCount - 1;
            isAtRightEdge = module.slotIndex === normalLastSlot || (isDual && module.slotIndex === normalLastSlot - 1);
          }
        }
      } else {
        // 단내림 없음 → 공간 오른쪽 끝 = 마지막 슬롯
        isAtRightEdge = module.slotIndex === lastSlotIndex || (isDual && module.slotIndex === indexingForCheck.columnCount - 2);
      }

      if (isAtRightEdge) {
// console.log('🔴 공간 오른쪽 끝 가구 감지:', {
          // slotIndex: module.slotIndex,
          // zone: module.zone,
          // isDualSlot: module.isDualSlot,
          // isDual,
          // moduleId: module.moduleId,
          // lastSlotIndex,
          // columnCount: indexingForCheck.columnCount,
          // droppedPosition
        // });
      }
      return isAtRightEdge;
    });

  // 단내림 구간의 가구 배치 여부 체크
  const hasDroppedZoneFurniture = spaceInfo.droppedCeiling?.enabled && spaceInfo.surroundType === 'no-surround' &&
    placedModulesFromStore.some(module => module.zone === 'dropped');

  const indexingDebug = calculateSpaceIndexing(spaceInfo);

  // 모든 가구에 대해 디버깅
  placedModulesFromStore.forEach(module => {
    const isDual = module.isDualSlot || module.moduleId.includes('dual-');
// console.log('📦 가구 정보:', {
      // moduleId: module.moduleId,
      // slotIndex: module.slotIndex,
      // isDualSlot: module.isDualSlot,
      // isDual,
      // '듀얼판단근거': module.isDualSlot ? 'isDualSlot속성' : (module.moduleId.includes('dual-') ? 'moduleId에dual포함' : '싱글'),
      // '차지하는슬롯': isDual ? [module.slotIndex, module.slotIndex + 1] : [module.slotIndex],
      // '왼쪽끝인가': module.slotIndex === 0 || (isDual && module.slotIndex === 1),
      // '오른쪽끝인가': module.slotIndex === lastSlotIndex || (isDual && module.slotIndex === indexingDebug.columnCount - 2),
      // lastSlotIndex,
      // columnCount: indexingDebug.columnCount
    // });
  });

// console.log('🔍 Room - 엔드패널 렌더링 최종 결과:', {
    // surroundType: spaceInfo.surroundType,
    // placedModulesCount: placedModulesFromStore.length,
    // hasLeftFurniture,
    // hasRightFurniture,
    // columnCount: indexingDebug.columnCount,
    // lastSlotIndex,
    // installType: spaceInfo.installType,
    // wallConfig: spaceInfo.wallConfig,
    // '오른쪽듀얼체크': placedModulesFromStore.filter(m => {
      // const isDual = m.isDualSlot || m.moduleId?.includes('dual-');
      // return isDual && m.slotIndex === indexingDebug.columnCount - 2;
    // }).map(m => ({
      // moduleId: m.moduleId,
      // slotIndex: m.slotIndex,
      // isDualSlot: m.isDualSlot
    // }))
  // });

  // spaceInfo 변경 시 재계산되도록 메모이제이션
  const dimensions = useMemo(() => {
    // spaceInfo가 유효하지 않으면 기본값 반환
    if (!isSpaceInfoValid) {
      return {
        width: 0, height: 0, panelDepth: 0, furnitureDepth: 0,
        floorFinishHeight: 0, frameThickness: { left: 0, right: 0 },
        baseFrame: 0, topBottomFrameHeight: 0, baseFrameHeight: 0
      };
    }
// console.log('🔍 Room Component - spaceInfo:', {
      // roomId,
      // surroundType: spaceInfo.surroundType,
      // installType: spaceInfo.installType,
      // frameSize: spaceInfo.frameSize,
      // showFrame,
      // 'showFrame prop value': showFrame,
      // timestamp: new Date().toISOString()
    // });
    const { width: widthMm, height: heightMm } = calculateRoomDimensions(spaceInfo);
    const floorFinishHeightMm = calculateFloorFinishHeight(spaceInfo);
    const panelDepthMm = calculatePanelDepth(spaceInfo); // 사용자 설정 깊이 사용
    const furnitureDepthMm = calculateFurnitureDepth(placedModules, spaceInfo); // 가구/프레임용 (동적 계산, 노서라운드 고려)

// console.log('🎯 frameThickness 계산 전 체크:', {
      // hasLeftFurniture,
      // hasRightFurniture,
      // surroundType: spaceInfo.surroundType
    // });

    // hasLeftFurniture와 hasRightFurniture는 이미 단내림을 고려하여 계산됨 (line 360, 400)
    const frameThicknessMm = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
// console.log('🔥 calculateDimensionsAndFrames 내부 - frameThicknessMm 계산 직후:', {
      // frameThicknessMm,
      // wallConfig: spaceInfo.wallConfig,
      // installType: spaceInfo.installType,
      // surroundType: spaceInfo.surroundType
    // });
    const baseFrameMm = calculateBaseFrameWidth(spaceInfo);
    const topBottomFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
    const baseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);

    // 노서라운드 프레임 디버그
// console.log('🔍 Room - 프레임 계산 결과:', {
      // surroundType: spaceInfo.surroundType,
      // installType: spaceInfo.installType,
      // wallConfig: spaceInfo.wallConfig,
      // frameThicknessMm,
      // topBottomFrameHeightMm,
      // baseFrameHeightMm,
      // baseFrameMm,
      // isNoSurround: spaceInfo.surroundType === 'no-surround',
      // isBuiltin: spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in',
      // isSemistanding: spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing',
      // shouldHideAllFrames: spaceInfo.surroundType === 'no-surround',
      // '예상 프레임': spaceInfo.surroundType === 'no-surround' && (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing')
        // ? (spaceInfo.wallConfig?.left
          // ? '좌측: 0mm (벽있음), 우측: 18mm (엔드패널)'
          // : '좌측: 18mm (엔드패널), 우측: 0mm (벽있음)')
        // : '서라운드 또는 다른 타입'
    // });

    // mm를 Three.js 단위로 변환
// console.log('🔥 calculateDimensionsAndFrames - 변환 직전:', {
      // 'frameThicknessMm.left': frameThicknessMm.left,
      // 'frameThicknessMm.right': frameThicknessMm.right,
      // 'mmToThreeUnits(frameThicknessMm.left)': mmToThreeUnits(frameThicknessMm.left),
      // 'mmToThreeUnits(frameThicknessMm.right)': mmToThreeUnits(frameThicknessMm.right)
    // });
    return {
      width: mmToThreeUnits(widthMm),
      height: mmToThreeUnits(heightMm),
      panelDepth: mmToThreeUnits(panelDepthMm), // 공간 메쉬용 (1500mm)
      furnitureDepth: mmToThreeUnits(furnitureDepthMm), // 가구/프레임용 (600mm)
      floorFinishHeight: mmToThreeUnits(floorFinishHeightMm),
      frameThickness: {
        left: mmToThreeUnits(frameThicknessMm.left),
        right: mmToThreeUnits(frameThicknessMm.right)
      },
      baseFrame: {
        width: mmToThreeUnits(baseFrameMm.width)
      },
      topBottomFrameHeight: mmToThreeUnits(topBottomFrameHeightMm),
      baseFrameHeight: mmToThreeUnits(baseFrameHeightMm),
      // 원본 mm 값들도 포함 (기존 코드에서 사용하기 위해)
      widthMm,
      heightMm,
      panelDepthMm,
      furnitureDepthMm,
      floorFinishHeightMm,
      frameThicknessMm,
      baseFrameMm,
      topBottomFrameHeightMm,
      baseFrameHeightMm
    };
  }, [isSpaceInfoValid, spaceInfo?.width, spaceInfo?.height, spaceInfo?.depth, spaceInfo?.installType, spaceInfo?.surroundType, spaceInfo?.baseConfig, spaceInfo?.hasFloorFinish, spaceInfo?.floorFinish, spaceInfo?.floorFinish?.height, spaceInfo?.frameSize, spaceInfo?.wallConfig, placedModules, placedModulesFromStore]);

  const {
    width, height, panelDepth, furnitureDepth, floorFinishHeight, frameThickness, baseFrame, topBottomFrameHeight, baseFrameHeight,
    // 원본 mm 값들
    widthMm, heightMm, panelDepthMm, furnitureDepthMm, floorFinishHeightMm, frameThicknessMm, baseFrameMm, topBottomFrameHeightMm, baseFrameHeightMm
  } = dimensions;

  // 받침대 시각적 높이: 사용자가 설정한 baseFrameHeight를 그대로 유지.
  //   바닥마감재가 깔리면 받침대는 마감재 위에 그대로 얹혀서 전체적으로 마감재 두께만큼 위로 올라감.
  const visualBaseFrameHeight = baseFrameHeight;
  const visualBaseFrameHeightMm = baseFrameHeightMm;

  // 좌우 프레임 렌더링 크기: 가구와 1.5mm 이격을 위해 프레임 두께를 1.5mm 줄임
  // (가구 배치 공간 계산에는 원본 frameThickness 사용, 렌더링에만 적용)
  const FRAME_FURNITURE_GAP = mmToThreeUnits(1.5);
  const frameRenderThickness = {
    left: frameThickness.left > 0 ? Math.max(0, frameThickness.left - FRAME_FURNITURE_GAP) : 0,
    right: frameThickness.right > 0 ? Math.max(0, frameThickness.right - FRAME_FURNITURE_GAP) : 0,
  };

  // 디버깅을 위한 로그
// console.log('🎯 Room - dimensions 디버깅:', {
    // frameThicknessMm,
    // frameThickness,
    // wallConfig: spaceInfo.wallConfig,
    // installType: spaceInfo.installType,
    // surroundType: spaceInfo.surroundType,
    // '계산된_엔드패널': {
      // 좌측mm: frameThicknessMm.left,
      // 우측mm: frameThicknessMm.right,
      // 좌측Three: frameThickness.left,
      // 우측Three: frameThickness.right
    // }
  // });

  // 기둥 분절 계산을 메모이제이션 (dimensions 정의 이후로 이동)
  const frameSegments = useMemo(() => {
    if (!isSpaceInfoValid) return null;
    const columns = spaceInfo.columns || [];
    const hasDeepColumns = columns.some(column => column.depth >= 730);

    if (columns.length === 0 || !hasDeepColumns) {
      return null; // 분절 없음
    }

    // 노서라운드일 때는 엔드패널 안쪽 범위 사용
    let frameWidth, frameX;
    if (spaceInfo.surroundType === 'no-surround') {
      const indexing = calculateSpaceIndexing(spaceInfo, placedModulesFromStore?.length > 0);
      const { threeUnitBoundaries } = indexing;
      const slotStartX = threeUnitBoundaries[0];
      const slotEndX = threeUnitBoundaries[threeUnitBoundaries.length - 1];

      // 엔드패널 안쪽으로 조정
      const endPanelThickness = mmToThreeUnits(END_PANEL_THICKNESS); // 18mm
      let adjustedStartX = slotStartX;
      let adjustedEndX = slotEndX;

      if (spaceInfo.installType === 'freestanding') {
        // 벽없음: 양쪽 엔드패널 안쪽으로
        adjustedStartX = slotStartX + endPanelThickness;
        adjustedEndX = slotEndX - endPanelThickness;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 벽1개: 벽이 없는 쪽만 조정
        if (spaceInfo.wallConfig?.left) {
          // 왼쪽 벽이 있으면 오른쪽만 조정
          adjustedEndX = slotEndX - endPanelThickness;
        } else if (spaceInfo.wallConfig?.right) {
          // 오른쪽 벽이 있으면 왼쪽만 조정
          adjustedStartX = slotStartX + endPanelThickness;
        }
      }
      // builtin은 양쪽 벽이 있으므로 조정 불필요

      frameWidth = adjustedEndX - adjustedStartX;
      frameX = (adjustedStartX + adjustedEndX) / 2;
    } else {
      frameWidth = baseFrame.width;
      // xOffset 직접 계산 (-width / 2)
      frameX = (-width / 2) + frameThickness.left + frameWidth / 2;
    }

    const segments: Array<{ width: number; x: number }> = [];
    const frameStartX = frameX - frameWidth / 2;
    const frameEndX = frameX + frameWidth / 2;

    // 기둥들을 X 위치 기준으로 정렬
    const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);

    let currentX = frameStartX;

    // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
    sortedColumns.forEach((column) => {
      const columnWidthM = column.width * 0.01;
      const columnLeftX = column.position[0] - columnWidthM / 2;
      const columnRightX = column.position[0] + columnWidthM / 2;

      if (columnLeftX < frameEndX && columnRightX > frameStartX && column.depth >= 730) {
        const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
        if (leftSegmentWidth > 0) {
          segments.push({
            width: leftSegmentWidth,
            x: currentX + leftSegmentWidth / 2
          });
        }
        currentX = columnRightX;
      }
    });

    // 마지막 세그먼트
    const lastSegmentWidth = Math.max(0, frameEndX - currentX);
    if (lastSegmentWidth > 0) {
      segments.push({
        width: lastSegmentWidth,
        x: currentX + lastSegmentWidth / 2
      });
    }

    return segments.length > 0 ? segments : null;
  }, [isSpaceInfoValid, spaceInfo?.columns, spaceInfo?.surroundType, spaceInfo?.width, spaceInfo?.gapConfig?.left, spaceInfo?.gapConfig?.right, baseFrame.width, frameThickness.left, width]);


  // 공통 프레임 재질 생성 함수 (도어와 동일한 재질로 통일)
  const createFrameMaterial = useCallback((frameType?: string, onTextureLoaded?: () => void) => {
    // 2D 모드에서 모든 프레임(상부/하부/좌우)을 형광 녹색으로 직접 반환
    const isNeonFrame = viewMode === '2D' && (frameType === 'top' || frameType === 'base' || frameType === 'left' || frameType === 'right');
    if (isNeonFrame) {
// console.log(`✅ 2D 모드 프레임에 형광 녹색 MeshBasicMaterial 적용:`, frameType);
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color('#18CF23'),
        transparent: true,
        opacity: 0.0, // 투명하게 설정하여 라인만 보이도록 함
        depthTest: true,
        depthWrite: true
      });
    }

    // 2D 다크모드에서는 더 밝은 색상 사용
    const defaultColor = (viewMode === '2D' && view2DTheme === 'dark') ? '#F0F0F0' : '#E0E0E0';

    let frameColor = isPlainMaterial ? defaultColor : (materialConfig?.doorColor || materialConfig?.frameColor || defaultColor);
    let baseFrameTransparent = false;

    const isHighlighted = frameType && highlightedFrame && (
      highlightedFrame === frameType
    );

    // 테마 색상 매핑
    const themeColorMap: Record<string, string> = {
      green: '#10b981',
      blue: '#3b82f6',
      purple: '#8b5cf6',
      vivid: '#a25378',
      red: '#D2042D',
      pink: '#ec4899',
      indigo: '#6366f1',
      teal: '#14b8a6',
      yellow: '#eab308',
      gray: '#6b7280',
      cyan: '#06b6d4',
      lime: '#84cc16',
      black: '#1a1a1a',
      wine: '#845EC2',
      gold: '#d97706',
      navy: '#1e3a8a',
      emerald: '#059669',
      violet: '#C128D7',
      mint: '#0CBA80',
      neon: '#18CF23',
      rust: '#FF7438',
      white: '#D65DB1',
      plum: '#790963',
      brown: '#5A2B1D',
      darkgray: '#2C3844',
      maroon: '#3F0D0D',
      turquoise: '#003A7A',
      slate: '#2E3A47',
      copper: '#AD4F34',
      forest: '#1B3924',
      olive: '#4C462C'
    };

    // 프레임 강조 색상 (붉은색)
    const highlightColor = '#ff3333';
    const highlightEmissive = 0xff3333 >> 1;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isHighlighted ? highlightColor : frameColor),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(isHighlighted ? highlightEmissive : 0x000000),
      emissiveIntensity: isHighlighted ? 1.0 : 0.0,
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || !!isHighlighted || baseFrameTransparent,
      opacity: baseFrameTransparent ? 0 : renderMode === 'wireframe' ? (isHighlighted ? 0.6 : 0.3) : (viewMode === '2D' && renderMode === 'solid') ? 0.8 : isHighlighted ? 0.6 : 1.0,
    });

    // 프레임 텍스처 적용 (doorTexture 우선, frameTexture 폴백)
    const frameTextureUrl = isPlainMaterial ? undefined : (materialConfig?.doorTexture || materialConfig?.frameTexture);
    const shouldApplyTexture =
      !isHighlighted &&
      frameTextureUrl &&
      !(viewMode === '2D' && (frameType === 'top' || frameType === 'base'));

    if (shouldApplyTexture) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isOakTexture(frameTextureUrl)) {
        applyOakTextureSettings(material);
      } else if (isCabinetTexture1(frameTextureUrl)) {
// console.log('🔧 프레임 Cabinet Texture1 즉시 어둡게 적용 중...');
        applyCabinetTexture1Settings(material);
// console.log('✅ 프레임 Cabinet Texture1 즉시 색상 적용 완료 (공통 설정 사용)');
      }

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        frameTextureUrl,
        (texture) => {
// console.log('🔧 프레임 텍스처 로딩 성공:', frameTextureUrl);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);

          // Oak 텍스처인 경우: 좌우 프레임은 세로 결, 상하 프레임은 가로 결 (90도 회전)
          if (isOakTexture(frameTextureUrl)) {
            const isVerticalFrame = frameType === 'left' || frameType === 'right';
            if (!isVerticalFrame) {
              // 상하 프레임(top/base)만 90도 회전
              texture.rotation = Math.PI / 2;
              texture.center.set(0.5, 0.5);
            }
            applyOakTextureSettings(material);
          }
          // Cabinet Texture1인 경우 설정 적용
          else if (isCabinetTexture1(frameTextureUrl)) {
            applyCabinetTexture1Settings(material);
          }
          // 그 외 텍스처는 기본 이미지 텍스처 설정 적용
          else {
            applyDefaultImageTextureSettings(material);
          }

          material.map = texture;
          material.needsUpdate = true;
          invalidate(); // 텍스처 로딩 후 즉시 리렌더링
          onTextureLoaded?.(); // 콜백으로 state 갱신 트리거
        },
        undefined,
        (error) => {
          console.error('❌ 프레임 텍스처 로딩 실패:', frameTextureUrl, error);
        }
      );
    }

    return material;
  }, [materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, renderMode, viewMode, view2DTheme, highlightedFrame, spaceInfo.frameSize, spaceInfo.baseConfig, appTheme.color, invalidate]);

  const columnsDeps = JSON.stringify(spaceInfo.columns ?? []);

  // 서라운드 연필 아이콘 팝업 state
  const [surroundPopup, setSurroundPopup] = useState<string | null>(null);
  const setSpaceInfo = useSpaceConfigStore((state) => state.setSpaceInfo);

  // 서라운드 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!surroundPopup) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-surround-options-panel]')) return;
      setSurroundPopup(null);
      setHighlightedFrame(null);
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [surroundPopup, setHighlightedFrame]);

  // useEffect+useState로 material을 관리
  const [baseFrameMaterial, setBaseFrameMaterial] = useState<THREE.Material>();
  const [baseDroppedFrameMaterial, setBaseDroppedFrameMaterial] = useState<THREE.Material>();
  const [leftFrameMaterial, setLeftFrameMaterial] = useState<THREE.Material>();
  const [leftSubFrameMaterial, setLeftSubFrameMaterial] = useState<THREE.Material>();
  const [rightFrameMaterial, setRightFrameMaterial] = useState<THREE.Material>();
  const [rightSubFrameMaterial, setRightSubFrameMaterial] = useState<THREE.Material>();
  const [topFrameMaterial, setTopFrameMaterial] = useState<THREE.Material>();
  const [topDroppedFrameMaterial, setTopDroppedFrameMaterial] = useState<THREE.Material>();
  const [topSubFrameMaterial, setTopSubFrameMaterial] = useState<THREE.Material>();
  // const [baseSubFrameMaterial, setBaseSubFrameMaterial] = useState<THREE.Material>(); // 하단 서브프레임 제거됨

  // 텍스처 로딩 완료 시 리렌더링 트리거용
  const [, forceUpdate] = useState(0);
  const triggerRerender = useCallback(() => forceUpdate(v => v + 1), []);

  const frameDeps = [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame] as const;

  useEffect(() => {
    const mat = createFrameMaterial('base', triggerRerender);
    setBaseFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('base', triggerRerender);
    setBaseDroppedFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('left', triggerRerender);
    setLeftFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('left', triggerRerender);
    setLeftSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('right', triggerRerender);
    setRightFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('right', triggerRerender);
    setRightSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('top', triggerRerender);
    setTopFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('top', triggerRerender);
    setTopDroppedFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  useEffect(() => {
    const mat = createFrameMaterial('top', triggerRerender);
    setTopSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [...frameDeps]);
  // 하단 서브프레임 제거됨
  // useEffect(() => {
  //   const mat = createFrameMaterial('base');
  //   setBaseSubFrameMaterial(mat);
  //   return () => mat.dispose();
  // }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);

  // 하이라이트 material — 단일 인스턴스 공유 (overlay mesh에서 사용)
  const highlightOverlayMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff3333'),
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, []);

  // MaterialFactory를 사용한 재질 생성 (자동 캐싱으로 성능 최적화)
  const frontToBackGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  const horizontalGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  const leftHorizontalGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);

  // 3D orthographic 모드용 벽 재질 생성 (refs와 함께 사용)
  const leftWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('horizontal', viewMode), [viewMode]);
  const rightWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse', viewMode), [viewMode]);
  const topWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('vertical-reverse', viewMode), [viewMode]);
  const droppedWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('horizontal', viewMode), [viewMode]);

  // 단내림 벽을 위한 불투명 material
  const opaqueLeftWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
  }, []);

  const opaqueRightWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
  }, []);

  // CB 전용 벽 material (depthTest=false + depthWrite=false → 먼저 그려지고 천장이 덮음)
  const cbLeftWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal', '3D');
    if (mat.uniforms) { mat.uniforms.opacity.value = 1.0; }
    mat.transparent = false;
    mat.depthTest = false;
    mat.depthWrite = false;
    return mat;
  }, []);
  const cbRightWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse', '3D');
    if (mat.uniforms) { mat.uniforms.opacity.value = 1.0; }
    mat.transparent = false;
    mat.depthTest = false;
    mat.depthWrite = false;
    return mat;
  }, []);

  // 커튼박스 영역 천장 material (depthTest=false + depthWrite=false → 먼저 그려지고 천장이 덮음)
  const opaqueTopWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('vertical-reverse', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthTest = false;
    mat.depthWrite = false;
    return mat;
  }, []);

  // 단내림 영역 천장 material (일반 depth 처리 — polygonOffset으로 프레임보다 앞)
  const stepCeilingMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('vertical-reverse', '3D');
    // 셰이더 fragmentShader에서 opacity → 1.0 강제 (alpha 채널 완전 불투명)
    mat.fragmentShader = mat.fragmentShader.replace(
      'gl_FragColor = vec4(color, opacity);',
      'gl_FragColor = vec4(color, 1.0);'
    );
    mat.transparent = false;
    mat.depthWrite = true;
    mat.depthTest = true;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    mat.needsUpdate = true;
    return mat;
  }, []);

  // CB 전용 경계벽 material (depthTest=false + depthWrite=false)
  const cbBoundaryWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal', '3D');
    if (mat.uniforms) { mat.uniforms.opacity.value = 1.0; }
    mat.transparent = false;
    mat.depthTest = false;
    mat.depthWrite = false;
    return mat;
  }, []);

  // 천장 구간 경계벽 material (일반 depth 처리 — polygonOffset으로 프레임보다 앞)
  const ceilingBoundaryWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    mat.depthTest = true;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    return mat;
  }, []);



  // 3D 룸 중앙 정렬을 위한 오프셋 계산
  const xOffset = -width / 2; // 가로 중앙 (전체 폭의 절반을 왼쪽으로)
  const yOffset = 0; // 바닥 기준
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙 (앞뒤 대칭)
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 가구/프레임용 깊이: 뒷벽에서 600mm만 나오도록

  // 전체 그룹을 z축 방향으로 약간 조정 (앞으로 당겨서 중앙에 오도록)
  const groupZOffset = 0; // 필요에 따라 조정 가능 (양수: 앞으로, 음수: 뒤로)

  // 공간 그라데이션 매쉬는 뷰 전환과 무관하게 기존 깊이를 유지한다.
  // 측면 배치 인디케이터/배치 좌표만 이 매쉬의 실제 좌표에 맞춘다.
  const extensionDepth = mmToThreeUnits(300);
  // ── 그라데이션 메쉬를 가구 뒷면까지만 당기는 옵션 ──
  // true: 공간 그라데이션(바닥/벽/천장) 뒷쪽 경계가 가구 뒷면에 맞춰 렌더링
  // false: 공간 전체 깊이 기준 (메쉬 깊이가 가구 무관 → 공간 깊이만큼 펼쳐짐)
  const SHRINK_MESH_TO_FURNITURE_BACK = false;
  const BACK_MESH_GAP = mmToThreeUnits(ROOM_BACK_MESH_GAP_MM);
  const MESH_Z_BACK_SHIFT = mmToThreeUnits(ROOM_MESH_BACK_SHIFT_MM);
  // 뒷쪽 경계는 항상 가구 뒷면 - 40mm (슬롯 가이드와 일치)
  // 앞쪽으로만 확장: SHRINK true면 가구 깊이 기반, false면 공간 깊이 기반
  const meshDepth = SHRINK_MESH_TO_FURNITURE_BACK
    ? (furnitureDepth + BACK_MESH_GAP)
    : panelDepth;
  const extendedPanelDepth = meshDepth + extensionDepth;
  const extendedZOffset = furnitureZOffset - furnitureDepth / 2 - BACK_MESH_GAP - MESH_Z_BACK_SHIFT;

  // 상단/하단 패널의 너비 (좌우 프레임 사이의 공간)
  const topBottomPanelWidth = baseFrame.width;

  // 최종적으로 사용할 패널 너비 (baseFrame.width가 이미 이격거리를 고려하여 계산됨)
  const finalPanelWidth = baseFrame.width;

  // 패널 X 좌표 계산 (노서라운드일 때는 이격거리를 고려한 정확한 중앙 정렬)
  const topBottomPanelX = spaceInfo.surroundType === 'no-surround'
    ? 0 // 노서라운드 모드에서는 정확히 중앙(원점)에 배치
    : xOffset + frameThickness.left + topBottomPanelWidth / 2;

  // 바닥재료가 있을 때 좌우 패널의 시작 Y 위치와 높이 조정
  const panelStartY = spaceInfo.hasFloorFinish && floorFinishHeight > 0 ? floorFinishHeight : 0;

  // 띄워서 배치일 때 높이 조정
  const floatHeight = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
    ? mmToThreeUnits(spaceInfo.baseConfig.floatHeight || 0)
    : 0;

  // 좌우 프레임 높이 (띄워서 배치일 때 줄어듦)
  const adjustedPanelHeight = height - floatHeight;
// console.log('🔍 adjustedPanelHeight 계산:', { height, floatHeight, adjustedPanelHeight, sideFrameStartY: panelStartY + floatHeight, baseConfig: spaceInfo.baseConfig });

  // 상단 요소들의 Y 위치 (띄워서 배치일 때 위로 이동)
  const topElementsY = panelStartY + height - topBottomFrameHeight / 2;

  // 좌우 프레임의 시작 Y 위치 (띄워서 배치일 때 위로 이동)
  const sideFrameStartY = panelStartY + floatHeight;
  const sideFrameCenterY = sideFrameStartY + adjustedPanelHeight / 2;

  // 좌/우 서라운드 프레임 분절용 — 최외곽 가구들의 카테고리/높이/Y 추출
  // 같은 X극단 위치에 상부장+하부장 공존 가능하므로 여러 개 반환
  type OuterMod = {
    category: 'full' | 'upper' | 'lower';
    heightMm: number;
    bottomMm: number;
    topMm: number;
    depthMm: number;
    frontHeightMm?: number;
    frontBottomMm?: number;
  };
  const computeOuterMods = (side: 'left' | 'right'): OuterMod[] => {
    const mods = placedModulesFromStore.filter(m => !m.isSurroundPanel);
    if (mods.length === 0) return [];
    // 공간 내경 경계 (mm, 중심 0 기준)
    const halfSpaceMm = (spaceInfo.width || 0) / 2;
    const frameLeftMm = spaceInfo.frameSize?.left || 0;
    const frameRightMm = spaceInfo.frameSize?.right || 0;
    const boundaryMm = side === 'left' ? -halfSpaceMm + frameLeftMm : halfSpaceMm - frameRightMm;
    // 자유배치: position.x 기준
    let extremeX: number | null = null;
    mods.forEach((m) => {
      const w = (m.isFreePlacement && m.freeWidth) ? m.freeWidth : (m.customWidth || m.adjustedWidth || m.moduleWidth || 0);
      const centerXmm = Math.round(m.position.x * 100);
      const edgeMm = side === 'left' ? centerXmm - w / 2 : centerXmm + w / 2;
      if (extremeX === null) extremeX = edgeMm;
      else if (side === 'left' && edgeMm < extremeX) extremeX = edgeMm;
      else if (side === 'right' && edgeMm > extremeX) extremeX = edgeMm;
    });
    if (extremeX === null) return [];
    // 내경 경계로부터 최외곽 가구까지 거리 — 50mm 초과면 "해당 측면에 가구 없음"으로 간주해 분절 스킵
    const distToBoundary = Math.abs((extremeX as number) - boundaryMm);
    if (distToBoundary > 50) return [];
    // 최외곽 좌표와 1mm 이내로 인접한 가구들만 후보
    const outermost = mods.filter((m) => {
      const w = (m.isFreePlacement && m.freeWidth) ? m.freeWidth : (m.customWidth || m.adjustedWidth || m.moduleWidth || 0);
      const centerXmm = Math.round(m.position.x * 100);
      const edgeMm = side === 'left' ? centerXmm - w / 2 : centerXmm + w / 2;
      return Math.abs(edgeMm - (extremeX as number)) <= 1;
    });
    // 카테고리 판별 + Y 범위 계산
    const floorFinishMM = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseH = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height ?? 0);
    const topFrameMM = spaceInfo.frameSize?.top ?? 30;
    return outermost.map((m): OuterMod => {
      const id = m.moduleId || '';
      const cat: 'full' | 'upper' | 'lower' =
        (id.startsWith('upper-') || id.includes('-upper-')) ? 'upper'
        : (id.startsWith('lower-') || id.includes('-lower-')) ? 'lower'
        : 'full';
      const freeHeightMm = typeof m.freeHeight === 'number' && m.freeHeight > 0 ? m.freeHeight : undefined;
      const customHeightMm = typeof m.customHeight === 'number' && m.customHeight > 0 ? m.customHeight : undefined;
      const hMm = cat === 'upper'
        ? (customHeightMm ?? freeHeightMm ?? 0)
        : (freeHeightMm ?? customHeightMm ?? 0);
      // 모듈 데이터에서 실제 높이 가져오기 (상부장: customHeight 우선, 그 외: freeHeight 우선)
      let moduleDataH = 0;
      try {
        const internalSp = { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth || 1500 };
        const md = getModuleById(m.moduleId, internalSp, spaceInfo);
        if (md?.dimensions?.height) moduleDataH = md.dimensions.height;
      } catch { /* noop */ }
      const defaultCabH = cat === 'lower' ? 785 : cat === 'upper' ? 785 : (spaceInfo.height - topFrameMM - floorFinishMM - baseH);
      const cabHeight = hMm > 0 ? hMm : (moduleDataH > 0 ? moduleDataH : defaultCabH);
      // 좌/우 서라운드 프레임 Y 범위
      //  - upper: 렌더링 기준 상부장 몸통 하단 ~ 몸통 상단
      //  - lower: 공간 바닥(0) ~ 가구 상단 (floorFinish + base + cabHeight)
      let bottomMm: number;
      let topMm: number;
      let frontBottomMm: number | undefined;
      let frontHeightMm: number | undefined;
      if (cat === 'upper') {
        let ceilingHeightMm = spaceInfo.height;
        if ((m as any).zone === 'dropped') {
          if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
            ceilingHeightMm = spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
          } else if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.dropHeight !== undefined) {
            ceilingHeightMm = spaceInfo.height - spaceInfo.droppedCeiling.dropHeight;
          }
        }
        const upperTopGapMm = (m as any).hasTopFrame === false
          ? ((m as any).topFrameGap ?? 0)
          : 0;
        const upperTopFrameMm = (m as any).hasTopFrame === false
          ? 0
          : ((m as any).topFrameThickness ?? topFrameMM);
        topMm = ceilingHeightMm - upperTopGapMm;
        bottomMm = topMm - cabHeight;
        const bodyTopMm = topMm - upperTopFrameMm;
        const bodyBottomMm = bodyTopMm - cabHeight;
        const doorBottomGapMm = (m as any).doorBottomGap ?? (spaceInfo as any).doorBottomGap ?? 0;
        frontBottomMm = bodyBottomMm - doorBottomGapMm;
        frontHeightMm = Math.max(0, topMm - frontBottomMm);
      } else if (cat === 'lower') {
        bottomMm = 0;
        // 하부장 프레임 상단 = floorFinish + 받침대(가구별) + 실제 하부장 높이
        //  - 가구에 baseFrameHeight가 있으면 그 값, 없으면 spaceInfo.baseConfig.height, 그것도 없으면 하부장 기본 100
        const modBaseH = spaceInfo.baseConfig?.type === 'stand' ? 0
          : ((m as any).baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 105);
        topMm = floorFinishMM + modBaseH + cabHeight;
      } else {
        bottomMm = 0;
        topMm = spaceInfo.height;
      }
      const heightMm = topMm - bottomMm;
      const depthMm = m.freeDepth || m.customDepth || (cat === 'upper' ? 300 : 600);
      return { category: cat, heightMm, bottomMm, topMm, depthMm, frontHeightMm, frontBottomMm };
    });
  };
  const leftOuterMods = useMemo(() => computeOuterMods('left'), [placedModulesFromStore, spaceInfo]);
  const rightOuterMods = useMemo(() => computeOuterMods('right'), [placedModulesFromStore, spaceInfo]);
  // 분절 조건: 최외곽 가구가 1개 이상, full 없음, 그리고 upper/lower만
  const isLeftFrameSplit = leftOuterMods.length > 0 && leftOuterMods.every(o => o.category !== 'full');
  const isRightFrameSplit = rightOuterMods.length > 0 && rightOuterMods.every(o => o.category !== 'full');


  // 벽 여부 확인
  const { wallConfig = { left: true, right: true } } = spaceInfo;
// console.log('🏠 Room - 노서라운드 프레임 체크:', {
    // installType: spaceInfo.installType,
    // surroundType: spaceInfo.surroundType,
    // isNoSurround: spaceInfo.surroundType === 'no-surround',
    // isBuiltin: spaceInfo.installType === 'builtin',
    // isSemistanding: spaceInfo.installType === 'semistanding',
    // wallConfig,
    // frameThicknessMm,
    // frameThickness,
    // leftPanel: frameThickness.left > 0 ? `${frameThicknessMm.left}mm` : 'none',
    // rightPanel: frameThickness.right > 0 ? `${frameThicknessMm.right}mm` : 'none',
    // shouldHaveEndPanelLeft: spaceInfo.surroundType === 'no-surround' && spaceInfo.installType === 'semistanding' && !wallConfig?.left,
    // shouldHaveEndPanelRight: spaceInfo.surroundType === 'no-surround' && spaceInfo.installType === 'semistanding' && !wallConfig?.right
  // });

  // 내부 공간 계산 (세로 가이드 선 위치 확인용)
  const internalSpace = calculateInternalSpace(spaceInfo);
  // backZ는 가구가 배치되는 공간의 뒷면 (가구 뒷면이 닿는 위치)
  const backZ = furnitureZOffset - furnitureDepth / 2; // 가구 뒷면 위치
  // 공간의 실제 뒷벽 위치 (노서라운드 엔드패널이 시작하는 위치)
  const spaceBackWallZ = zOffset - panelDepth / 2; // 공간 뒷벽 Z 위치 (가장 뒤)

  // SlotDropZonesSimple과 동일한 방식으로 계산
  const roomBackZ = -panelDepth / 2; // 공간 중심 기준 뒷면
  const frameEndZ = furnitureZOffset + furnitureDepth / 2; // 좌우 프레임의 앞쪽 끝
  const slotFloorDepth = frameEndZ - roomBackZ - mmToThreeUnits(20); // 슬롯 깊이 (730mm)

  // 서라운드 엔드패널: 슬롯 깊이 + 20mm (슬롯은 20mm 줄어들어 있으므로)
  const surroundEndPanelDepth = slotFloorDepth + mmToThreeUnits(20);
  // 서라운드 엔드패널 중심 Z 위치
  const surroundEndPanelZ = roomBackZ + surroundEndPanelDepth / 2 + mmToThreeUnits(2); // 서브프레임과 맞닿도록 2mm 앞으로

  // 노서라운드 엔드패널: 슬롯 깊이와 동일 (730mm)
  const noSurroundEndPanelDepth = slotFloorDepth;
  // 노서라운드 엔드패널 중심 Z 위치
  const noSurroundEndPanelZ = roomBackZ + noSurroundEndPanelDepth / 2;

  // 디버그용 - 엔드패널 깊이 차이 확인
  if (spaceInfo.installType === 'freestanding' ||
    (spaceInfo.installType === 'semistanding' && (!wallConfig?.left || !wallConfig?.right))) {
// console.log('🔍 노서라운드 엔드패널 계산:', {
      // 가구깊이mm: furnitureDepthMm,
      // 공간깊이mm: panelDepthMm,
      // roomBackZ,
      // frameEndZ,
      // slotFloorDepth,
      // slotFloorDepth_mm: slotFloorDepth / 0.01,
      // surroundEndPanelDepth_mm: surroundEndPanelDepth / 0.01,
      // noSurroundEndPanelDepth_mm: noSurroundEndPanelDepth / 0.01,
      // surroundEndPanelZ,
      // noSurroundEndPanelZ,
      // 끝점: frameEndZ - mmToThreeUnits(20),
      // 가구와공간뒷벽차이: (spaceBackWallZ - backZ) / 0.01
    // });
  }

  // 한쪽벽모드 엔드패널/프레임 개수 카운팅
  const endPanelCount = {
    left: frameThickness.left > 0 && !wallConfig?.left ? 1 : 0,
    right: frameThickness.right > 0 && !wallConfig?.right ? 1 : 0,
    leftFrame: frameThickness.left > 0 && wallConfig?.left ? 1 : 0,
    rightFrame: frameThickness.right > 0 && wallConfig?.right ? 1 : 0
  };

  // 실제 렌더링 카운터 초기화 (매 렌더링마다 리셋)
  if (typeof window !== 'undefined') {
    if (!window.renderCounter) {
      window.renderCounter = { leftEndPanel: 0, rightEndPanel: 0, leftFrame: 0, rightFrame: 0 };
    }
    // 매 렌더링 시작 시 카운터 리셋
    window.renderCounter = { leftEndPanel: 0, rightEndPanel: 0, leftFrame: 0, rightFrame: 0 };
  }

  const logData = {
    installType: spaceInfo.installType,
    surroundType: spaceInfo.surroundType,
    wallConfig,
    frameThicknessMm,
    '엔드패널개수': {
      왼쪽: endPanelCount.left,
      오른쪽: endPanelCount.right,
      총개수: endPanelCount.left + endPanelCount.right
    },
    '프레임개수': {
      왼쪽: endPanelCount.leftFrame,
      오른쪽: endPanelCount.rightFrame,
      총개수: endPanelCount.leftFrame + endPanelCount.rightFrame
    },
    '총합': endPanelCount.left + endPanelCount.right + endPanelCount.leftFrame + endPanelCount.rightFrame
  };

// console.log('🎯🎯🎯 [한쪽벽모드 총괄] 엔드패널/프레임 생성 개수:', logData);

  // 창 제목에도 표시 (디버그용) - useEffect로 렌더링 후 업데이트
  React.useEffect(() => {
    if (typeof window !== 'undefined' && spaceInfo.installType === 'semistanding') {
      setTimeout(() => {
        const actual = window.renderCounter || { leftEndPanel: 0, rightEndPanel: 0, leftFrame: 0, rightFrame: 0 };
        const title = `예상: 엔드L${endPanelCount.left}R${endPanelCount.right} 프레임L${endPanelCount.leftFrame}R${endPanelCount.rightFrame} | 실제: 엔드L${actual.leftEndPanel}R${actual.rightEndPanel} 프레임L${actual.leftFrame}R${actual.rightFrame}`;
        document.title = title;

        if (actual.leftEndPanel > 1 || actual.rightEndPanel > 1) {
          console.error('🚨🚨🚨 중복 렌더링 감지!', {
            왼쪽엔드패널: actual.leftEndPanel,
            오른쪽엔드패널: actual.rightEndPanel,
            왼쪽프레임: actual.leftFrame,
            오른쪽프레임: actual.rightFrame
          });
        }
      }, 100);
    }
  }, [spaceInfo?.installType, endPanelCount.left, endPanelCount.right, endPanelCount.leftFrame, endPanelCount.rightFrame]);

  // spaceInfo가 유효하지 않으면 null 반환 (모든 훅 호출 후)
  if (!isSpaceInfoValid) {
    return null;
  }

  // 아일랜드 모드: 벽/바닥/천장/프레임/받침대/엔드패널 전부 제거하고 가구만 렌더
  if (spaceInfo.isIsland) {
    return (
      <group position={[0, 0, groupZOffset]}>
        <PlacedFurnitureContainer
          viewMode={viewMode}
          view2DDirection={view2DDirection}
          renderMode={renderMode}
          activeZone={activeZone}
          showFurniture={showFurniture}
          readOnly={readOnly}
          onFurnitureClick={onFurnitureClick}
          ghostHighlightSlotIndex={ghostHighlightSlotIndex}
          islandSideFilter={islandSideFilter}
        />
      </group>
    );
  }

  return (
    <group position={[0, 0, groupZOffset]}>
      {/* 주변 벽면들 - ShaderMaterial 기반 그라데이션 (3D perspective 모드에서만 표시) */}
      {/* 아일랜드 모드에서는 벽/천장/바닥 그라데이션 숨김 */}
      {/* console.log('🔍 Room viewMode 체크:', viewMode, typeof viewMode) */}
      {!spaceInfo.isIsland && viewMode !== '2D' && cameraMode === 'perspective' && !isInspectionMode && !isPanelSimulationLayout && (
        <>
          {/* 왼쪽 외부 벽면 - 단내림 고려 */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 왼쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {/* 3D orthographic 모드에서 카메라 각도에 따라 숨김 */}
          {/* console.log('🔍 왼쪽 벽 installType 체크:', { ... }) */}
          {/* 2D 측면뷰(좌/우)에서는 좌우벽 숨김 */}
          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
            (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wallConfig?.left)) && (() => {
                const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
                const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
                const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
                  ? spaceInfo.droppedCeiling.dropHeight || 200
                  : 0;
                const droppedCeilingHeight = mmToThreeUnits(dropHeight);

                // 슬롯배치 커튼박스 좌측 체크 (droppedCeiling과 독립)
                const hasLeftCB = !isFreePlacement && spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left';
                const leftCBDropH = hasLeftCB ? mmToThreeUnits(spaceInfo.curtainBox!.dropHeight || 20) : 0;

                // stepCeiling 좌측 확인
                const hasLeftStep = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'left';
                const leftStepDropH = hasLeftStep ? mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200) : 0;

                // 슬롯배치 커튼박스 단독 좌측: 벽 위로 확장
                if (hasLeftCB && !hasDroppedCeiling) {
                  const cbWallHeight = height + leftCBDropH;
                  const cbCenterY = panelStartY + cbWallHeight / 2;
                  return renderMode === 'solid' ? (
                    <mesh
                      position={[-width / 2 - 0.01, cbCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, Math.PI / 2, 0]}
                      renderOrder={-1}
                    >
                      <planeGeometry args={[extendedPanelDepth, cbWallHeight]} />
                      <primitive object={cbLeftWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // 왼쪽이 단내림(커튼박스) 영역인 경우
                if (hasDroppedCeiling && isLeftDropped) {
                  // 자유배치 커튼박스: 위로 확장(+), 슬롯 단내림: 아래로(-)
                  // 슬롯배치 단내림+커튼박스 동시: 벽은 커튼박스 높이(위로 확장)로 렌더
                  let droppedWallHeight: number;
                  if (isFreePlacement) {
                    droppedWallHeight = height + droppedCeilingHeight;
                  } else if (hasLeftCB) {
                    // 단내림+커튼박스 동시: CB가 더 높으므로 CB 높이로 벽 렌더
                    droppedWallHeight = height + leftCBDropH;
                  } else {
                    droppedWallHeight = height - droppedCeilingHeight;
                  }
                  const droppedCenterY = panelStartY + droppedWallHeight / 2;

                  return renderMode === 'solid' ? (
                    <mesh
                      position={[-width / 2 - 0.01, droppedCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, Math.PI / 2, 0]}
                      renderOrder={hasLeftCB ? -1 : 1}
                    >
                      <planeGeometry args={[extendedPanelDepth, droppedWallHeight]} />
                      <primitive object={hasLeftCB ? cbLeftWallMaterial : opaqueLeftWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // 왼쪽이 stepCeiling 영역인 경우 (커튼박스 없고 단내림만)
                if (hasLeftStep && !isLeftDropped) {
                  const stepWallHeight = height - leftStepDropH;
                  const stepCenterY = panelStartY + stepWallHeight / 2;

                  return renderMode === 'solid' ? (
                    <mesh
                      position={[-width / 2 - 0.01, stepCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, Math.PI / 2, 0]}
                      renderOrder={1}
                    >
                      <planeGeometry args={[extendedPanelDepth, stepWallHeight]} />
                      <primitive object={opaqueLeftWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // DC가 반대쪽(우)이고 CB가 좌측인 경우: 벽을 CB 높이로 확장
                if (hasDroppedCeiling && !isLeftDropped && hasLeftCB) {
                  const cbWallHeight = height + leftCBDropH;
                  const cbCenterY = panelStartY + cbWallHeight / 2;
                  return renderMode === 'solid' ? (
                    <mesh
                      position={[-width / 2 - 0.01, cbCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, Math.PI / 2, 0]}
                      renderOrder={-1}
                    >
                      <planeGeometry args={[extendedPanelDepth, cbWallHeight]} />
                      <primitive object={cbLeftWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // 그 외: 전체 높이 렌더링
                if (!hasDroppedCeiling || !isLeftDropped) {
                  const bgColor = theme?.mode === 'dark' ? new THREE.Color("#1a1a2e") : new THREE.Color("#f5f5f5");
                  const wallEdgeBackColor = new THREE.Color(spaceLineTone.wallEdge).lerp(bgColor, spaceLineTone.backMix);
                  const wallEdgeFrontColor = new THREE.Color(spaceLineTone.wallEdge).lerp(bgColor, spaceLineTone.frontMix);
                  const halfD = extendedPanelDepth / 2;
                  const halfH = height / 2;
                  const wallEdgePos = new Float32Array([
                    -halfD, halfH, 0, halfD, halfH, 0,
                    -halfD, -halfH, 0, halfD, -halfH, 0,
                  ]);
                  const wallEdgeColors = new Float32Array([
                    wallEdgeFrontColor.r, wallEdgeFrontColor.g, wallEdgeFrontColor.b,
                    wallEdgeBackColor.r, wallEdgeBackColor.g, wallEdgeBackColor.b,
                    wallEdgeFrontColor.r, wallEdgeFrontColor.g, wallEdgeFrontColor.b,
                    wallEdgeBackColor.r, wallEdgeBackColor.g, wallEdgeBackColor.b,
                  ]);
                  return renderMode === 'solid' ? (
                    <mesh
                      position={[-width / 2 - 0.001, panelStartY + height / 2, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, Math.PI / 2, 0]}
                      renderOrder={-1}
                    >
                      <planeGeometry args={[extendedPanelDepth, height]} />
                      <primitive
                        ref={leftWallMaterialRef}
                        object={leftWallMaterial} />
                      <lineSegments renderOrder={-50}>
                        <bufferGeometry>
                          <bufferAttribute attach="attributes-position" args={[wallEdgePos, 3]} />
                          <bufferAttribute attach="attributes-color" args={[wallEdgeColors, 3]} />
                        </bufferGeometry>
                        <lineBasicMaterial
                          vertexColors
                          transparent={false}
                          depthTest={true}
                          depthWrite={false}
                        />
                      </lineSegments>
                    </mesh>
                  ) : null;
                }

                return null;
              })()}

          {/* 오른쪽 외부 벽면 - 단내림 고려 */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 오른쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {/* 3D orthographic 모드에서 카메라 각도에 따라 숨김 */}
          {/* 2D 측면뷰(좌/우)에서는 좌우벽 숨김 */}
          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
            (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wallConfig?.right)) && (() => {
                const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
                const isRightDropped = spaceInfo.droppedCeiling?.position === 'right';
                const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
                  ? spaceInfo.droppedCeiling.dropHeight || 200
                  : 0;
                const droppedCeilingHeight = mmToThreeUnits(dropHeight);

                // 슬롯배치 커튼박스 우측 체크
                const hasRightCB = !isFreePlacement && spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right';
                const rightCBDropH = hasRightCB ? mmToThreeUnits(spaceInfo.curtainBox!.dropHeight || 20) : 0;

                // stepCeiling 우측 확인
                const hasRightStep = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'right';
                const rightStepDropH = hasRightStep ? mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200) : 0;

                // 슬롯배치 커튼박스 단독 우측: 벽 위로 확장
                if (hasRightCB && !hasDroppedCeiling) {
                  const cbWallHeight = height + rightCBDropH;
                  const cbCenterY = panelStartY + cbWallHeight / 2;
                  return renderMode === 'solid' ? (
                    <mesh
                      position={[width / 2 + 0.01, cbCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, -Math.PI / 2, 0]}
                      renderOrder={-1}
                    >
                      <planeGeometry args={[extendedPanelDepth, cbWallHeight]} />
                      <primitive object={cbRightWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // 오른쪽이 단내림 영역인 경우
                if (hasDroppedCeiling && isRightDropped) {
                  // 자유배치 커튼박스: 위로 확장(+), 슬롯 단내림: 아래로(-)
                  // 슬롯배치 단내림+커튼박스 동시: 벽은 커튼박스 높이(위로 확장)로 렌더
                  let droppedWallHeight: number;
                  if (isFreePlacement) {
                    droppedWallHeight = height + droppedCeilingHeight;
                  } else if (hasRightCB) {
                    droppedWallHeight = height + rightCBDropH;
                  } else {
                    droppedWallHeight = height - droppedCeilingHeight;
                  }
                  const droppedCenterY = panelStartY + droppedWallHeight / 2;

                  return renderMode === 'solid' ? (
                    <mesh
                      position={[width / 2 + 0.01, droppedCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, -Math.PI / 2, 0]}
                      renderOrder={hasRightCB ? -1 : 1}
                    >
                      <planeGeometry args={[extendedPanelDepth, droppedWallHeight]} />
                      <primitive object={hasRightCB ? cbRightWallMaterial : opaqueRightWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // 오른쪽이 stepCeiling 영역인 경우 (커튼박스 없고 단내림만)
                if (hasRightStep && !isRightDropped) {
                  const stepWallHeight = height - rightStepDropH;
                  const stepCenterY = panelStartY + stepWallHeight / 2;

                  return renderMode === 'solid' ? (
                    <mesh
                      position={[width / 2 + 0.01, stepCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, -Math.PI / 2, 0]}
                      renderOrder={1}
                    >
                      <planeGeometry args={[extendedPanelDepth, stepWallHeight]} />
                      <primitive object={opaqueRightWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // DC가 반대쪽(좌)이고 CB가 우측인 경우: 벽을 CB 높이로 확장
                if (hasDroppedCeiling && !isRightDropped && hasRightCB) {
                  const cbWallHeight = height + rightCBDropH;
                  const cbCenterY = panelStartY + cbWallHeight / 2;
                  return renderMode === 'solid' ? (
                    <mesh
                      position={[width / 2 + 0.01, cbCenterY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, -Math.PI / 2, 0]}
                      renderOrder={-1}
                    >
                      <planeGeometry args={[extendedPanelDepth, cbWallHeight]} />
                      <primitive object={cbRightWallMaterial} />
                    </mesh>
                  ) : null;
                }

                // 그 외: 전체 높이로 렌더링
                if (!hasDroppedCeiling || !isRightDropped) {
                  const bgColor = theme?.mode === 'dark' ? new THREE.Color("#1a1a2e") : new THREE.Color("#f5f5f5");
                  const wallEdgeBackColor = new THREE.Color(spaceLineTone.wallEdge).lerp(bgColor, spaceLineTone.backMix);
                  const wallEdgeFrontColor = new THREE.Color(spaceLineTone.wallEdge).lerp(bgColor, spaceLineTone.frontMix);
                  const halfD = extendedPanelDepth / 2;
                  const halfH = height / 2;
                  const wallEdgePos = new Float32Array([
                    -halfD, halfH, 0, halfD, halfH, 0,
                    -halfD, -halfH, 0, halfD, -halfH, 0,
                  ]);
                  const wallEdgeColors = new Float32Array([
                    wallEdgeBackColor.r, wallEdgeBackColor.g, wallEdgeBackColor.b,
                    wallEdgeFrontColor.r, wallEdgeFrontColor.g, wallEdgeFrontColor.b,
                    wallEdgeBackColor.r, wallEdgeBackColor.g, wallEdgeBackColor.b,
                    wallEdgeFrontColor.r, wallEdgeFrontColor.g, wallEdgeFrontColor.b,
                  ]);
                  return renderMode === 'solid' ? (
                    <mesh
                      position={[width / 2 + 0.001, panelStartY + height / 2, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, -Math.PI / 2, 0]}
                      renderOrder={-1}
                    >
                      <planeGeometry args={[extendedPanelDepth, height]} />
                      <primitive
                        ref={rightWallMaterialRef}
                        object={rightWallMaterial} />
                      <lineSegments renderOrder={-50}>
                        <bufferGeometry>
                          <bufferAttribute attach="attributes-position" args={[wallEdgePos, 3]} />
                          <bufferAttribute attach="attributes-color" args={[wallEdgeColors, 3]} />
                        </bufferGeometry>
                        <lineBasicMaterial
                          vertexColors
                          transparent={false}
                          depthTest={true}
                          depthWrite={false}
                        />
                      </lineSegments>
                    </mesh>
                  ) : null;
                }

                return null;
              })()}

          {/* 상단 외부 벽면 (천장) - 단내림이 있는 경우 분할 - 탑뷰에서는 숨김 */}
          {/* 3D orthographic 모드에서 카메라 각도에 따라 숨김 */}
          {viewMode !== '2D' && (() => {
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
            const droppedWidth = hasDroppedCeiling && spaceInfo.droppedCeiling
              ? mmToThreeUnits(spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900))
              : 0;
            const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
            const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
              ? spaceInfo.droppedCeiling.dropHeight || 200
              : 0;
            const droppedCeilingHeight = mmToThreeUnits(dropHeight);

            // stepCeiling (자유배치 전용 단내림)
            const hasStepCeiling = isFreePlacement && spaceInfo.stepCeiling?.enabled;
            const stepWidth = hasStepCeiling ? mmToThreeUnits(spaceInfo.stepCeiling!.width || 900) : 0;
            const stepDropHeight = hasStepCeiling ? mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200) : 0;
            const isLeftStep = spaceInfo.stepCeiling?.position === 'left';

            // 커튼박스 (슬롯배치 + 자유배치 모두, droppedCeiling과 독립)
            const hasCBSlot = !!spaceInfo.curtainBox?.enabled;
            const hasCBOnly = hasCBSlot && !hasDroppedCeiling && !hasStepCeiling; // CB 단독
            const hasCBWithDC = hasCBSlot && (hasDroppedCeiling || hasStepCeiling); // CB + DC/SC 동시
            const cbOnlyWidth = hasCBSlot ? mmToThreeUnits(spaceInfo.curtainBox!.width || 150) : 0;
            const cbOnlyDropH = hasCBSlot ? mmToThreeUnits(spaceInfo.curtainBox!.dropHeight || 20) : 0;
            const cbOnlyIsLeft = hasCBSlot && spaceInfo.curtainBox!.position === 'left';
            // DC+CB 같은 쪽 vs 다른 쪽 판단 (3D 천장 렌더링에서만 사용)
            const _dcPos = hasDroppedCeiling ? (isLeftDropped ? 'left' : 'right')
              : hasStepCeiling ? ((spaceInfo.stepCeiling?.position === 'left') ? 'left' : 'right') : null;
            const _cbPos = hasCBSlot ? spaceInfo.curtainBox!.position : null;
            const isCBSameSideDC = hasCBWithDC && _dcPos === _cbPos;
            const isCBOppSideDC = hasCBWithDC && _dcPos !== _cbPos;

            if (!hasDroppedCeiling && !hasStepCeiling && !hasCBOnly) {
              // 단내림도 커튼박스도 없는 경우 전체 천장 렌더링
              return renderMode === 'solid' ? (
                <mesh
                  position={[xOffset + width / 2, panelStartY + height + 0.001, extendedZOffset + extendedPanelDepth / 2]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[width, extendedPanelDepth]} />
                  <primitive
                    ref={topWallMaterialRef}
                    object={topWallMaterial} />
                </mesh>
              ) : null;
            }

            // 슬롯배치 커튼박스 단독: 2구간 (커튼박스 높은 천장 + 메인 천장)
            if (hasCBOnly && !hasStepCeiling) {
              const cbAreaWidth = cbOnlyWidth;
              const mainAreaWidth = width - cbAreaWidth;
              const cbAreaX = cbOnlyIsLeft
                ? xOffset + cbAreaWidth / 2
                : xOffset + mainAreaWidth + cbAreaWidth / 2;
              const mainAreaX = cbOnlyIsLeft
                ? xOffset + cbAreaWidth + mainAreaWidth / 2
                : xOffset + mainAreaWidth / 2;
              const cbCeilingY = panelStartY + height + cbOnlyDropH + 0.001; // 위로 확장
              const mainCeilingY = panelStartY + height + 0.001;
              const cbBoundaryX = cbOnlyIsLeft
                ? xOffset + cbAreaWidth
                : xOffset + mainAreaWidth;
              const cbBoundaryY = panelStartY + height + cbOnlyDropH / 2;

              return renderMode === 'solid' ? (
                <>
                  {/* 커튼박스 영역 천장 — 맨 뒤 */}
                  <mesh
                    position={[cbAreaX, cbCeilingY, extendedZOffset + extendedPanelDepth / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    renderOrder={-1}
                  >
                    <planeGeometry args={[cbAreaWidth, extendedPanelDepth]} />
                    <primitive object={opaqueTopWallMaterial} />
                  </mesh>
                  {/* 메인 영역 천장 */}
                  <mesh
                    position={[mainAreaX, mainCeilingY, extendedZOffset + extendedPanelDepth / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    renderOrder={1}
                  >
                    <planeGeometry args={[mainAreaWidth, extendedPanelDepth]} />
                    <primitive ref={topWallMaterialRef} object={topWallMaterial} />
                  </mesh>
                  {/* 커튼박스 경계 수직 벽 — 맨 뒤 */}
                  <mesh
                    renderOrder={-1}
                    position={[cbBoundaryX, cbBoundaryY, extendedZOffset + extendedPanelDepth / 2]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <planeGeometry args={[extendedPanelDepth, cbOnlyDropH]} />
                    <primitive ref={droppedWallMaterialRef} object={cbBoundaryWallMaterial} />
                  </mesh>
                </>
              ) : null;
            }

            if (hasStepCeiling && (!hasDroppedCeiling || isFreePlacement)) {
              // 자유배치: 단내림(stepCeiling) ± 커튼박스(droppedCeiling 또는 curtainBox)
              // 슬롯배치: 단내림만 (hasDroppedCeiling=false)
              // CB 소스: droppedCeiling(자유배치 전용) 또는 curtainBox(독립 필드)
              const _scCbFromDC = isFreePlacement && hasDroppedCeiling;
              const _scCbFromSlot = isFreePlacement && hasCBSlot;
              const _scHasCB = _scCbFromDC || _scCbFromSlot;
              const _scCbSrc = _scCbFromDC ? spaceInfo.droppedCeiling! : (_scCbFromSlot ? spaceInfo.curtainBox! : null);
              const freeCbW = _scHasCB && _scCbSrc ? mmToThreeUnits(_scCbSrc.width || 150) : 0;
              const freeCbDropH = _scHasCB && _scCbSrc ? mmToThreeUnits(_scCbSrc.dropHeight || 20) : 0;
              const stepAreaWidth = stepWidth;
              const mainAreaWidth = width - stepWidth - freeCbW;

              // 커튼박스와 단내림이 같은 쪽인지 판단
              const freeCbIsLeft = _scHasCB && _scCbSrc?.position === 'left';
              const freeCbSameSide = freeCbW > 0 && (
                (isLeftStep && freeCbIsLeft) || (!isLeftStep && !freeCbIsLeft)
              );
              const freeCbOppSide = freeCbW > 0 && !freeCbSameSide;

              // 구간 배치:
              // 같은 쪽 우측: [메인] [단내림] [커튼박스]
              // 같은 쪽 좌측: [커튼박스] [단내림] [메인]
              // 반대쪽 (좌CB+우SC): [커튼박스] [메인] [단내림]
              // 반대쪽 (우CB+좌SC): [단내림] [메인] [커튼박스]
              let stepAreaX: number, mainAreaX: number, stepBoundaryX: number;

              if (freeCbOppSide) {
                // 반대쪽: CB와 SC가 양쪽 끝, 메인이 가운데
                if (isLeftStep) {
                  // 좌SC + 우CB: [단내림(좌)] [메인(중)] [커튼박스(우)]
                  stepAreaX = xOffset + stepAreaWidth / 2;
                  mainAreaX = xOffset + stepAreaWidth + mainAreaWidth / 2;
                  stepBoundaryX = xOffset + stepAreaWidth;
                } else {
                  // 우SC + 좌CB: [커튼박스(좌)] [메인(중)] [단내림(우)]
                  stepAreaX = xOffset + freeCbW + mainAreaWidth + stepAreaWidth / 2;
                  mainAreaX = xOffset + freeCbW + mainAreaWidth / 2;
                  stepBoundaryX = xOffset + freeCbW + mainAreaWidth;
                }
              } else {
                // 같은 쪽 또는 커튼박스 없음
                stepAreaX = isLeftStep
                  ? xOffset + freeCbW + stepAreaWidth / 2
                  : xOffset + mainAreaWidth + stepAreaWidth / 2;
                mainAreaX = isLeftStep
                  ? xOffset + freeCbW + stepAreaWidth + mainAreaWidth / 2
                  : xOffset + mainAreaWidth / 2;
                stepBoundaryX = isLeftStep
                  ? xOffset + freeCbW + stepAreaWidth
                  : xOffset + mainAreaWidth;
              }

              const stepCeilingY = panelStartY + height - stepDropHeight + 0.001;
              const mainCeilingY = panelStartY + height + 0.001;
              const stepBoundaryY = panelStartY + height - stepDropHeight / 2;

              return renderMode === 'solid' ? (
                <>
                  {/* 단내림 영역 천장 — 경계벽보다 앞 */}
                  <mesh
                    position={[stepAreaX, stepCeilingY, extendedZOffset + extendedPanelDepth / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    renderOrder={1}
                  >
                    <planeGeometry args={[stepAreaWidth, extendedPanelDepth]} />
                    <primitive object={stepCeilingMaterial} />
                  </mesh>
                  {/* 메인 영역 천장 — 경계벽보다 앞 */}
                  <mesh
                    position={[mainAreaX, mainCeilingY, extendedZOffset + extendedPanelDepth / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    renderOrder={1}
                  >
                    <planeGeometry args={[mainAreaWidth, extendedPanelDepth]} />
                    <primitive ref={topWallMaterialRef} object={topWallMaterial} />
                  </mesh>
                  {/* 메인↔단내림 경계 수직 벽 — 천장보다 뒤 */}
                  <mesh
                    renderOrder={0}
                    position={[stepBoundaryX, stepBoundaryY, extendedZOffset + extendedPanelDepth / 2]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <planeGeometry args={[extendedPanelDepth, stepDropHeight]} />
                    <primitive object={ceilingBoundaryWallMaterial} />
                  </mesh>
                  {/* 자유배치 커튼박스 영역 천장 (위로 확장) + 경계벽 */}
                  {freeCbW > 0 && (() => {
                    let cbAreaX: number, cbBoundaryX2: number;
                    // 경계벽 높이: 같은 쪽=단내림천장~CB천장, 반대쪽=메인천장~CB천장
                    let cbBoundaryH: number, cbBoundaryY2: number;

                    if (freeCbOppSide) {
                      // 반대쪽: CB가 SC와 반대편 벽에 위치
                      cbAreaX = freeCbIsLeft
                        ? xOffset + freeCbW / 2
                        : xOffset + freeCbW + mainAreaWidth + stepAreaWidth + freeCbW / 2 - freeCbW; // = xOffset + mainAreaWidth + stepAreaWidth + freeCbW/2
                      cbAreaX = freeCbIsLeft
                        ? xOffset + freeCbW / 2
                        : xOffset + mainAreaWidth + stepAreaWidth + freeCbW / 2; // 우측 끝
                      // CB-메인 경계벽
                      cbBoundaryX2 = freeCbIsLeft
                        ? xOffset + freeCbW
                        : xOffset + mainAreaWidth + stepAreaWidth;
                      cbBoundaryH = freeCbDropH; // 메인 천장 ~ CB 천장
                      cbBoundaryY2 = panelStartY + height + freeCbDropH / 2;
                    } else {
                      // 같은 쪽: CB가 SC 바깥쪽(벽 인접)
                      cbAreaX = isLeftStep
                        ? xOffset + freeCbW / 2
                        : xOffset + mainAreaWidth + stepAreaWidth + freeCbW / 2;
                      // 단내림↔커튼박스 경계벽
                      cbBoundaryX2 = isLeftStep
                        ? xOffset + freeCbW
                        : xOffset + mainAreaWidth + stepAreaWidth;
                      cbBoundaryH = stepDropHeight + freeCbDropH; // 단내림 천장 ~ CB 천장
                      cbBoundaryY2 = panelStartY + height - stepDropHeight + cbBoundaryH / 2;
                    }

                    const cbCeilingY2 = panelStartY + height + freeCbDropH + 0.001;
                    return (
                      <>
                        {/* 커튼박스 천장 — 맨 뒤 */}
                        <mesh
                          position={[cbAreaX, cbCeilingY2, extendedZOffset + extendedPanelDepth / 2]}
                          rotation={[Math.PI / 2, 0, 0]}
                          renderOrder={-1}
                        >
                          <planeGeometry args={[freeCbW, extendedPanelDepth]} />
                          <primitive object={opaqueTopWallMaterial} />
                        </mesh>
                        {/* CB 경계 수직 벽 — 맨 뒤 */}
                        <mesh
                          renderOrder={-1}
                          position={[cbBoundaryX2, cbBoundaryY2, extendedZOffset + extendedPanelDepth / 2]}
                          rotation={[0, Math.PI / 2, 0]}
                        >
                          <planeGeometry args={[extendedPanelDepth, cbBoundaryH]} />
                          <primitive object={cbBoundaryWallMaterial} />
                        </mesh>
                      </>
                    );
                  })()}
                </>
              ) : null;
            }

            // 천장은 프레임 영역을 포함한 전체 너비로 렌더링
            // 단내림이 있는 경우 천장을 두 영역으로 분할

            // 좌우 공간 축소값 계산 (프레임 또는 이격거리/엔드패널)
            let leftReduction = 0;
            let rightReduction = 0;

            if (spaceInfo.surroundType === 'surround') {
              const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
              leftReduction = frameThickness.left;
              rightReduction = frameThickness.right;
            } else {
              // 노서라운드: 이격거리 또는 엔드패널
              if (spaceInfo.installType === 'builtin') {
                leftReduction = 2;
                rightReduction = 2;
              } else if (spaceInfo.installType === 'semistanding') {
                // 한쪽벽 모드: gapConfig의 값을 사용
                leftReduction = spaceInfo.gapConfig?.left || 0;
                rightReduction = spaceInfo.gapConfig?.right || 0;
              } else {
                leftReduction = 20;
                rightReduction = 20;
              }
            }

            // DC+CB 동시: CB 너비를 normalArea에서 추가 제외
            const cbWForCeiling = hasCBWithDC ? cbOnlyWidth : 0;

            // 경계벽 X 위치를 먼저 계산 — 천장 메쉬도 이 경계에 맞춤
            const _zoneInfoForCeiling = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const _BOUNDARY_OFFSET = isFreePlacement ? 0 : 3; // mm
            const boundaryEdgeX = (() => {
              if (isLeftDropped) {
                return mmToThreeUnits(_zoneInfoForCeiling.normal.startX - _BOUNDARY_OFFSET);
              } else {
                if (_zoneInfoForCeiling.dropped) {
                  return mmToThreeUnits(_zoneInfoForCeiling.dropped.startX + _BOUNDARY_OFFSET);
                } else {
                  return mmToThreeUnits(_zoneInfoForCeiling.normal.startX + _zoneInfoForCeiling.normal.width + _BOUNDARY_OFFSET);
                }
              }
            })();

            // 천장 메쉬 영역을 boundaryEdgeX 기준으로 분할
            let droppedAreaWidth: number;
            let normalAreaWidth: number;
            let droppedAreaX: number;
            let normalAreaX: number;

            if (isLeftDropped) {
              // [CB?] [DC] | [메인] [CB?]
              if (isCBOppSideDC) {
                // [DC(좌)] | [메인] [CB(우)]
                droppedAreaWidth = boundaryEdgeX - xOffset;
                normalAreaWidth = (xOffset + width - cbWForCeiling) - boundaryEdgeX;
                droppedAreaX = xOffset + droppedAreaWidth / 2;
                normalAreaX = boundaryEdgeX + normalAreaWidth / 2;
              } else {
                // [CB(좌)] [DC] | [메인]
                droppedAreaWidth = boundaryEdgeX - (xOffset + cbWForCeiling);
                normalAreaWidth = (xOffset + width) - boundaryEdgeX;
                droppedAreaX = xOffset + cbWForCeiling + droppedAreaWidth / 2;
                normalAreaX = boundaryEdgeX + normalAreaWidth / 2;
              }
            } else {
              // [CB?] [메인] | [DC] [CB?]
              if (isCBOppSideDC) {
                // [CB(좌)] [메인] | [DC(우)]
                normalAreaWidth = boundaryEdgeX - (xOffset + cbWForCeiling);
                droppedAreaWidth = (xOffset + width) - boundaryEdgeX;
                normalAreaX = xOffset + cbWForCeiling + normalAreaWidth / 2;
                droppedAreaX = boundaryEdgeX + droppedAreaWidth / 2;
              } else {
                // [메인] | [DC] [CB(우)]
                normalAreaWidth = boundaryEdgeX - xOffset;
                droppedAreaWidth = (xOffset + width - cbWForCeiling) - boundaryEdgeX;
                normalAreaX = xOffset + normalAreaWidth / 2;
                droppedAreaX = boundaryEdgeX + droppedAreaWidth / 2;
              }
            }

// console.log('🔥 천장 분할 계산:', {
              // hasDroppedCeiling,
              // surroundType: spaceInfo.surroundType,
              // installType: spaceInfo.installType,
              // wallConfig: spaceInfo.wallConfig,
              // leftReduction,
              // rightReduction,
              // droppedWidth: droppedWidth / 0.01,
              // droppedAreaWidth: droppedAreaWidth / 0.01,
              // normalAreaWidth: normalAreaWidth / 0.01,
              // droppedAreaX,
              // normalAreaX,
              // droppedCeilingHeight: droppedCeilingHeight / 0.01,
              // totalWidth: width / 0.01,
              // calculatedTotal: (droppedAreaWidth + normalAreaWidth + mmToThreeUnits(leftReduction) + mmToThreeUnits(rightReduction)) / 0.01,
              // '일반 천장 Y좌표(mm)': (panelStartY + height) / 0.01,
              // '단내림 천장 Y좌표(mm)': (panelStartY + height - droppedCeilingHeight) / 0.01,
              // '천장 높이 차이(mm)': droppedCeilingHeight / 0.01,
              // '200mm 분절 확인': droppedCeilingHeight / 0.01 === 200 ? '✅' : '❌'
            // });

            // 단내림 경계벽 X 위치 — 위에서 계산한 boundaryEdgeX 재사용
            const boundaryWallX = boundaryEdgeX;

            const wfColor = theme?.mode === 'dark' ? "#ffffff" : "#333333";

            // stepCeiling과 동시 활성: normalArea를 단내림 + 메인으로 추가 분할
            const scWidth = hasStepCeiling ? stepWidth : 0;
            const scDropH = hasStepCeiling ? stepDropHeight : 0;

            // 단내림과 커튼박스가 같은 쪽인지 (같은 쪽이면 경계벽이 더 커야 함)
            const stepOnSameSide = hasStepCeiling && (isLeftStep === isLeftDropped);
            // 커튼박스 경계벽 높이: 같은 쪽이면 단내림 천장 ~ 커튼박스 천장, 아니면 메인 천장 ~ 커튼박스 천장
            const boundaryWallTotalH = stepOnSameSide
              ? droppedCeilingHeight + scDropH   // 단내림천장(2160) ~ 커튼박스천장(2400)
              : droppedCeilingHeight;             // 메인천장(2360) ~ 커튼박스천장(2400)

            // 자유배치 커튼박스: 커튼박스가 메인보다 dropHeight만큼 높음 (위로 확장)
            // 슬롯단내림: 단내림구간이 dropHeight만큼 낮음 (아래로 축소)
            // 슬롯배치에서 curtainBox는 별도 필드이므로 droppedCeiling은 항상 아래로
            const droppedCeilingY = isFreePlacement
              ? panelStartY + height + droppedCeilingHeight + 0.001   // 커튼박스: 메인 + dropHeight (위로 확장)
              : panelStartY + height - droppedCeilingHeight + 0.001;  // 슬롯단내림: 낮은 높이
            const normalCeilingY = panelStartY + height + 0.001;      // 메인: 공간설정 높이 그대로
            const boundaryWallY = isFreePlacement
              ? panelStartY + height + (droppedCeilingHeight - (stepOnSameSide ? scDropH : 0)) / 2  // 경계벽 중심
              : panelStartY + height - droppedCeilingHeight / 2;      // 단내림쪽 경계벽

            // 단내림이 normalArea 안에서 차지하는 위치 결정
            // 구간순서: 벽 → 커튼박스(바깥) → 단내림 → 메인
            // 커튼박스 반대쪽에 단내림이 오려면, 단내림은 커튼박스 쪽(normalArea의 dropped 인접 쪽)
            let actualMainWidth = normalAreaWidth - scWidth;
            let stepAreaX2: number;
            let mainAreaX2: number;
            let stepBoundaryX2: number;

            if (hasStepCeiling) {
              // 단내림은 커튼박스 인접 쪽 (normalArea에서 커튼박스에 가까운 쪽)
              if (isLeftDropped) {
                // 커튼박스=좌측 → normalArea 좌단(커튼박스 옆)에 단내림
                if (isLeftStep) {
                  // 단내림도 좌측: normalArea 왼쪽 edge
                  stepAreaX2 = (isLeftDropped ? xOffset + droppedAreaWidth : xOffset) + scWidth / 2;
                  mainAreaX2 = stepAreaX2 + scWidth / 2 + actualMainWidth / 2;
                  stepBoundaryX2 = stepAreaX2 + scWidth / 2;
                } else {
                  // 단내림 우측: normalArea 오른쪽 edge
                  mainAreaX2 = (isLeftDropped ? xOffset + droppedAreaWidth : xOffset) + actualMainWidth / 2;
                  stepAreaX2 = mainAreaX2 + actualMainWidth / 2 + scWidth / 2;
                  stepBoundaryX2 = mainAreaX2 + actualMainWidth / 2;
                }
              } else {
                // 커튼박스=우측 → normalArea 우단(커튼박스 옆)에 단내림
                if (isLeftStep) {
                  // 단내림 좌측: normalArea 왼쪽 edge
                  stepAreaX2 = xOffset + scWidth / 2;
                  mainAreaX2 = stepAreaX2 + scWidth / 2 + actualMainWidth / 2;
                  stepBoundaryX2 = stepAreaX2 + scWidth / 2;
                } else {
                  // 단내림 우측: normalArea 오른쪽 edge
                  mainAreaX2 = xOffset + actualMainWidth / 2;
                  stepAreaX2 = mainAreaX2 + actualMainWidth / 2 + scWidth / 2;
                  stepBoundaryX2 = mainAreaX2 + actualMainWidth / 2;
                }
              }
            } else {
              actualMainWidth = normalAreaWidth;
              stepAreaX2 = 0;
              mainAreaX2 = normalAreaX;
              stepBoundaryX2 = 0;
            }

            const stepCeilingY2 = panelStartY + height - scDropH + 0.001;
            const stepBoundaryY2 = panelStartY + height - scDropH / 2;

            return renderMode === 'solid' ? (
              <>
                {/* dropped 영역 천장 */}
                <mesh
                  position={[droppedAreaX, droppedCeilingY, extendedZOffset + extendedPanelDepth / 2]}
                  rotation={[Math.PI / 2, 0, 0]}
                  renderOrder={1}
                >
                  <planeGeometry args={[droppedAreaWidth, extendedPanelDepth]} />
                  <primitive
                    object={stepCeilingMaterial} />
                </mesh>

                {hasStepCeiling ? (
                  <>
                    {/* 단내림 영역 천장 — 경계벽보다 앞 */}
                    <mesh
                      position={[stepAreaX2, stepCeilingY2, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[Math.PI / 2, 0, 0]}
                      renderOrder={1}
                    >
                      <planeGeometry args={[scWidth, extendedPanelDepth]} />
                      <primitive object={stepCeilingMaterial} />
                    </mesh>
                    {/* 메인 영역 천장 — 경계벽보다 앞 */}
                    <mesh
                      position={[mainAreaX2, normalCeilingY, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[Math.PI / 2, 0, 0]}
                      renderOrder={1}
                    >
                      <planeGeometry args={[actualMainWidth, extendedPanelDepth]} />
                      <primitive ref={topWallMaterialRef} object={topWallMaterial} />
                    </mesh>
                    {/* 단내림 경계 수직 벽 — 천장보다 뒤 */}
                    <mesh
                      renderOrder={0}
                      position={[stepBoundaryX2, stepBoundaryY2, extendedZOffset + extendedPanelDepth / 2]}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      <planeGeometry args={[extendedPanelDepth, scDropH]} />
                      <primitive object={ceilingBoundaryWallMaterial} />
                    </mesh>
                  </>
                ) : (
                  /* 메인/일반 영역 천장 — 경계벽보다 앞 */
                  <mesh
                    position={[normalAreaX, normalCeilingY, extendedZOffset + extendedPanelDepth / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    renderOrder={1}
                  >
                    <planeGeometry args={[normalAreaWidth, extendedPanelDepth]} />
                    <primitive ref={topWallMaterialRef} object={topWallMaterial} />
                  </mesh>
                )}

                {/* 메인↔단내림 경계 수직 벽 — 천장보다 뒤 */}
                <mesh
                  renderOrder={0}
                  position={[boundaryWallX, boundaryWallY, extendedZOffset + extendedPanelDepth / 2]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <planeGeometry args={[extendedPanelDepth, hasCBWithDC ? droppedCeilingHeight : boundaryWallTotalH]} />
                  <primitive
                    ref={droppedWallMaterialRef}
                    object={ceilingBoundaryWallMaterial} />
                </mesh>
                {/* DC+CB 동시: 커튼박스 영역 천장 + 경계벽 */}
                {hasCBWithDC && (() => {
                  // CB 위치: 같은 쪽이면 DC 바깥쪽(벽), 다른 쪽이면 DC 반대편 벽
                  const cbAreaX = (() => {
                    if (isCBOppSideDC) {
                      // 다른 쪽: cbOnlyIsLeft로 판단
                      return cbOnlyIsLeft
                        ? xOffset + cbOnlyWidth / 2                   // CB 좌측벽
                        : xOffset + width - cbOnlyWidth / 2;          // CB 우측벽
                    }
                    return isLeftDropped
                      ? xOffset + cbOnlyWidth / 2
                      : xOffset + normalAreaWidth + droppedAreaWidth + cbOnlyWidth / 2;
                  })();
                  const cbCeilingY2 = panelStartY + height + cbOnlyDropH + 0.001;
                  // CB 경계벽 X: 같은 쪽이면 CB-DC 경계, 다른 쪽이면 CB-메인 경계
                  const cbBoundaryX2 = (() => {
                    if (isCBOppSideDC) {
                      return cbOnlyIsLeft
                        ? xOffset + cbOnlyWidth                       // CB 우측 edge (CB-메인 경계)
                        : xOffset + width - cbOnlyWidth;              // CB 좌측 edge (메인-CB 경계)
                    }
                    return isLeftDropped
                      ? xOffset + cbOnlyWidth
                      : xOffset + normalAreaWidth + droppedAreaWidth;
                  })();
                  // CB 경계벽 높이: 같은 쪽 = DC천장~CB천장(dcDropH+cbDropH), 다른 쪽 = 메인천장~CB천장(cbDropH만)
                  const cbBoundaryH = isCBOppSideDC ? cbOnlyDropH : (droppedCeilingHeight + cbOnlyDropH);
                  const cbBoundaryY2 = isCBOppSideDC
                    ? panelStartY + height + cbOnlyDropH / 2                            // 메인천장 ~ CB천장
                    : panelStartY + height - droppedCeilingHeight + cbBoundaryH / 2;

                  return (
                    <>
                      {/* 커튼박스 천장 (위로 확장) — 맨 뒤 */}
                      <mesh
                        position={[cbAreaX, cbCeilingY2, extendedZOffset + extendedPanelDepth / 2]}
                        rotation={[Math.PI / 2, 0, 0]}
                        renderOrder={-1}
                      >
                        <planeGeometry args={[cbOnlyWidth, extendedPanelDepth]} />
                        <primitive object={opaqueTopWallMaterial} />
                      </mesh>
                      {/* CB-DC 경계 수직 벽 — 맨 뒤 */}
                      <mesh
                        renderOrder={-1}
                        position={[cbBoundaryX2, cbBoundaryY2, extendedZOffset + extendedPanelDepth / 2]}
                        rotation={[0, Math.PI / 2, 0]}
                      >
                        <planeGeometry args={[extendedPanelDepth, cbBoundaryH]} />
                        <primitive object={cbBoundaryWallMaterial} />
                      </mesh>
                    </>
                  );
                })()}
              </>
            ) : null;
          })()}

          {/* 솔리드모드: 천장/바닥-벽 경계선 (테마색상) */}
          {viewMode !== '2D' && renderMode === 'solid' && (() => {
            const wc = spaceInfo.wallConfig || { left: true, right: true };
            const hasLW = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wc.left);
            const hasRW = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wc.right);
            const cY = panelStartY + height; // 천장 Y
            const fY = panelStartY;           // 바닥 Y
            const z1 = extendedZOffset;        // 뒷벽 Z
            const z2 = extendedZOffset + extendedPanelDepth; // 앞쪽 Z
            const x1 = xOffset;               // 좌측 벽 X
            const x2 = xOffset + width;        // 우측 벽 X
            const cornerLineNudge = mmToThreeUnits(1);
            const leftCornerLineX = x1 + cornerLineNudge;
            const rightCornerLineX = x2 - cornerLineNudge;
            const topCornerLineY = (y: number) => y - cornerLineNudge;

            const threeEdgeColor = new THREE.Color('#8f8f8f');

            // 단내림 정보
            const hasDC = spaceInfo.droppedCeiling?.enabled;
            const dcDropH = hasDC ? mmToThreeUnits(spaceInfo.droppedCeiling!.dropHeight || 200) : 0;
            const dcIsLeft = hasDC && spaceInfo.droppedCeiling?.position === 'left';
            const dcIsRight = hasDC && spaceInfo.droppedCeiling?.position === 'right';
            // stepCeiling 정보 (자유배치 전용)
            const hasSC = isFreePlacement && spaceInfo.stepCeiling?.enabled;
            const scDropHLine = hasSC ? mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200) : 0;
            const scIsLeft = hasSC && spaceInfo.stepCeiling?.position === 'left';
            const scIsRight = hasSC && spaceInfo.stepCeiling?.position === 'right';

            // 경계선 수집 (그라데이션: 뒷벽=진한, 앞쪽=투명)
            const lines: [number, number, number, number, number, number][] = [];

            // 커튼박스 정보 (슬롯배치 + 자유배치 모두)
            const hasCBStandalone = !!spaceInfo.curtainBox?.enabled;
            const cbDropHLine = hasCBStandalone ? mmToThreeUnits(spaceInfo.curtainBox!.dropHeight || 20) : 0;
            const cbIsLeft = hasCBStandalone && spaceInfo.curtainBox?.position === 'left';
            const cbIsRight = hasCBStandalone && spaceInfo.curtainBox?.position === 'right';

            // 천장-좌벽 경계
            // 슬롯배치에서 curtainBox는 별도 필드이므로 droppedCeiling 방향은 자유배치만 커튼박스
            if (hasLW) {
              let leftCY = cY;
              if (isFreePlacement) {
                // 자유배치 커튼박스: 위로 확장
                if (dcIsLeft) leftCY = cY + dcDropH;
                else if (scIsLeft) leftCY = cY - scDropHLine;
              } else {
                // 슬롯배치: DC+CB 동시이면 CB(위로)가 외벽 높이, DC단독이면 아래로, CB단독이면 위로
                if (dcIsLeft && cbIsLeft) leftCY = cY + cbDropHLine;       // DC+CB 동시: 외벽은 CB 높이
                else if (dcIsLeft) leftCY = cY - dcDropH;                  // 슬롯단내림: 아래로 축소
                else if (cbIsLeft) leftCY = cY + cbDropHLine;              // 슬롯 커튼박스 (단독 또는 DC 반대쪽): 위로 확장
              }
              lines.push([leftCornerLineX, topCornerLineY(leftCY), z1, leftCornerLineX, topCornerLineY(leftCY), z2]);
            }
            // 천장-우벽 경계
            if (hasRW) {
              let rightCY = cY;
              if (isFreePlacement) {
                if (dcIsRight) rightCY = cY + dcDropH;  // 자유배치 커튼박스: 위로 확장
                else if (scIsRight) rightCY = cY - scDropHLine;
              } else {
                if (dcIsRight && cbIsRight) rightCY = cY + cbDropHLine;
                else if (dcIsRight) rightCY = cY - dcDropH;
                else if (cbIsRight) rightCY = cY + cbDropHLine;            // 슬롯 커튼박스 (단독 또는 DC 반대쪽): 위로 확장
              }
              lines.push([rightCornerLineX, topCornerLineY(rightCY), z1, rightCornerLineX, topCornerLineY(rightCY), z2]);
            }
            // 바닥-좌벽 경계
            if (hasLW) {
              lines.push([x1, fY, z1, x1, fY, z2]);
            }
            // 바닥-우벽 경계
            if (hasRW) {
              lines.push([x2, fY, z1, x2, fY, z2]);
            }

            // === 커튼박스/단내림 경계벽 Z축 라인 (그라데이션) ===
            if (hasDC && spaceInfo.droppedCeiling) {
              const dcW = mmToThreeUnits(spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900));
              const dcIsL = spaceInfo.droppedCeiling.position === 'left';
              // DC+CB 동시: 같은 쪽일 때만 커튼박스 너비만큼 경계벽 X가 안쪽으로 이동
              const _cbEnabled = !isFreePlacement && spaceInfo.curtainBox?.enabled;
              const _cbSameSide2 = _cbEnabled &&
                spaceInfo.curtainBox!.position === spaceInfo.droppedCeiling.position;
              const _cbW = _cbSameSide2 ? mmToThreeUnits(spaceInfo.curtainBox!.width || 150) : 0;
              const bx = dcIsL ? x1 + _cbW + dcW : x2 - _cbW - dcW;
              const droppedCY = isFreePlacement ? cY + dcDropH : cY - dcDropH;
              const stepSameSideAsDC = hasSC && ((dcIsL && scIsLeft) || (!dcIsL && scIsRight));
              const bwTop = isFreePlacement ? droppedCY : cY;
              const bwBot = isFreePlacement
                ? (stepSameSideAsDC ? cY - scDropHLine : cY)
                : droppedCY;

              // 경계벽 Z축 라인 (뒷벽→앞쪽 그라데이션)
              lines.push([bx, bwTop, z1, bx, bwTop, z2]);  // 경계벽 상단
              // 경계벽 하단: 커튼박스에서 bwBot이 메인 천장과 같은 높이이면
              // 천장 mesh(단면)를 뚫고 안쪽에서 보이므로, 뒷벽 근처로만 제한
              if (isFreePlacement && !stepSameSideAsDC && bwBot === cY) {
                // 메인 천장과 동일 높이 → 뒷벽 실선만 (Z축 앞으로 연장 안 함)
                lines.push([bx, bwBot, z1, bx, bwBot, z2]);
              } else {
                lines.push([bx, bwBot, z1, bx, bwBot, z2]);  // 경계벽 하단
              }

              // 커튼박스쪽 외벽의 천장 높이 Z축 라인
              if (dcIsL && hasLW) {
                // 커튼박스: 천장이 메인보다 높으므로 외벽 라인도 뒷벽 근처로 제한
                if (isFreePlacement) {
                  lines.push([leftCornerLineX, topCornerLineY(droppedCY), z1, leftCornerLineX, topCornerLineY(droppedCY), z2]);
                } else {
                  lines.push([leftCornerLineX, topCornerLineY(droppedCY), z1, leftCornerLineX, topCornerLineY(droppedCY), z2]);
                }
              } else if (!dcIsL && hasRW) {
                if (isFreePlacement) {
                  lines.push([rightCornerLineX, topCornerLineY(droppedCY), z1, rightCornerLineX, topCornerLineY(droppedCY), z2]);
                } else {
                  lines.push([rightCornerLineX, topCornerLineY(droppedCY), z1, rightCornerLineX, topCornerLineY(droppedCY), z2]);
                }
              }
            }

            // === 커튼박스 경계벽 Z축 라인 (단독 또는 DC 반대쪽) (슬롯+자유배치) ===
            const _cbOppSideDC = hasCBStandalone && hasDC &&
              spaceInfo.curtainBox?.position !== spaceInfo.droppedCeiling?.position;
            if (hasCBStandalone && (!hasDC || _cbOppSideDC) && spaceInfo.curtainBox) {
              const cbW = mmToThreeUnits(spaceInfo.curtainBox.width || 150);
              const cbIsL = spaceInfo.curtainBox.position === 'left';
              const cbBx = cbIsL ? x1 + cbW : x2 - cbW;
              const cbCeilingY = cY + cbDropHLine; // 커튼박스: 위로 확장

              // 경계벽 상단 (커튼박스 천장 높이에서)
              lines.push([cbBx, cbCeilingY, z1, cbBx, cbCeilingY, z2]);
              // 경계벽 하단 (메인 천장 높이 = cY) → 뒷벽 근처로만 제한 (천장 mesh 관통 방지)
              lines.push([cbBx, cY, z1, cbBx, cY, z2]);

              // 커튼박스 쪽 외벽의 천장 높이 Z축 라인 (뒷벽 근처로 제한)
              if (cbIsL && hasLW) {
                lines.push([leftCornerLineX, topCornerLineY(cbCeilingY), z1, leftCornerLineX, topCornerLineY(cbCeilingY), z2]);
              } else if (!cbIsL && hasRW) {
                lines.push([rightCornerLineX, topCornerLineY(cbCeilingY), z1, rightCornerLineX, topCornerLineY(cbCeilingY), z2]);
              }
            }

            // solidThemeLines(X/Y축 뒷벽 실선)는 제거 — 이상한 윤곽선 원인
            const solidThemeLines: [number, number, number, number, number, number][] = [];

            // === 천장/바닥-벽 교차 z축(z1→z2) 윤곽선 ===
            // 좌벽-천장 z축 라인
            if (hasLW) {
              let leftCY2 = cY;
              if (isFreePlacement) {
                if (dcIsLeft) leftCY2 = cY + dcDropH;
                else if (scIsLeft) leftCY2 = cY - scDropHLine;
              } else {
                const _cbSL = hasCBStandalone && cbIsLeft;
                if (dcIsLeft && _cbSL) leftCY2 = cY + cbDropHLine;
                else if (dcIsLeft) leftCY2 = cY - dcDropH;
                else if (_cbSL) leftCY2 = cY + cbDropHLine;
              }
              solidThemeLines.push([leftCornerLineX, topCornerLineY(leftCY2), z1, leftCornerLineX, topCornerLineY(leftCY2), z2]); // 좌벽-천장
              solidThemeLines.push([x1, fY, z1, x1, fY, z2]); // 좌벽-바닥
            }
            // 우벽-천장, 우벽-바닥 z축 라인
            if (hasRW) {
              let rightCY2 = cY;
              if (isFreePlacement) {
                if (dcIsRight) rightCY2 = cY + dcDropH;
                else if (scIsRight) rightCY2 = cY - scDropHLine;
              } else {
                const _cbSR = hasCBStandalone && cbIsRight;
                if (dcIsRight && _cbSR) rightCY2 = cY + cbDropHLine;
                else if (dcIsRight) rightCY2 = cY - dcDropH;
                else if (_cbSR) rightCY2 = cY + cbDropHLine;
              }
              solidThemeLines.push([rightCornerLineX, topCornerLineY(rightCY2), z1, rightCornerLineX, topCornerLineY(rightCY2), z2]); // 우벽-천장
              solidThemeLines.push([x2, fY, z1, x2, fY, z2]); // 우벽-바닥
            }

            // === 단내림 천장 메쉬 z축 앞면(z=z2) 윤곽선 ===
            if (hasDC && !isFreePlacement && spaceInfo.droppedCeiling) {
              const dcW2 = mmToThreeUnits(spaceInfo.droppedCeiling.width || 900);
              const dcIsL = spaceInfo.droppedCeiling.position === 'left';
              const dcDH = mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight || 200);
              const droppedCY = cY - dcDH; // 단내림 천장 Y
              // DC+CB 동시: 같은 쪽에 있을 때만 커튼박스 너비만큼 단내림 메쉬가 안쪽으로 이동
              const cbSameSide = spaceInfo.curtainBox?.enabled &&
                spaceInfo.curtainBox.position === spaceInfo.droppedCeiling.position;
              const cbW2 = cbSameSide ? mmToThreeUnits(spaceInfo.curtainBox!.width || 150) : 0;
              // 단내림 메쉬의 실제 X 범위 (천장 메쉬와 동일하게)
              const dcStartX = dcIsL ? x1 + cbW2 : x2 - cbW2 - dcW2;
              const dcEndX = dcIsL ? x1 + cbW2 + dcW2 : x2 - cbW2;
              const bx2 = dcIsL ? dcEndX : dcStartX; // 경계벽 X

              // 단내림 천장 메쉬 z축 모서리 (z1→z2)
              solidThemeLines.push([dcStartX, droppedCY, z1, dcStartX, droppedCY, z2]); // 외벽쪽
              solidThemeLines.push([dcEndX, droppedCY, z1, dcEndX, droppedCY, z2]);     // 경계벽쪽
              // 경계벽 위치에서 메인 천장 높이 z축 라인 (단내림↔일반 구간 경계)
              solidThemeLines.push([bx2, cY, z1, bx2, cY, z2]);
              // 단내림↔메인 천장 경계의 수직 모서리 라인 (Y방향: droppedCY → cY)
              solidThemeLines.push([bx2, droppedCY, z1, bx2, cY, z1]); // 뒷벽 쪽 수직
              solidThemeLines.push([bx2, droppedCY, z2, bx2, cY, z2]); // 앞쪽 수직
              // 경계벽 아래(단내림 천장 높이)에서 Z방향 라인 — 메인 공간 안쪽에서 본 경계벽 하단
              solidThemeLines.push([bx2, droppedCY, z1, bx2, droppedCY, z2]);
            }

            // === 자유배치 stepCeiling z축 윤곽선 ===
            if (isFreePlacement && spaceInfo.stepCeiling?.enabled) {
              const scW2 = mmToThreeUnits(spaceInfo.stepCeiling.width || 900);
              const scDH = mmToThreeUnits(spaceInfo.stepCeiling.dropHeight || 200);
              const scIsL = spaceInfo.stepCeiling.position === 'left';
              const scCeilingY = cY - scDH;
              // CB(droppedCeiling)가 같은 쪽일 때만 offset 적용
              const _scCbSameSide = hasDC && spaceInfo.droppedCeiling?.position === spaceInfo.stepCeiling.position;
              const dcOffset = _scCbSameSide ? mmToThreeUnits(spaceInfo.droppedCeiling!.width || 150) : 0;
              const scStartX = scIsL ? x1 + dcOffset : x2 - dcOffset - scW2;
              const scEndX = scIsL ? x1 + dcOffset + scW2 : x2 - dcOffset;
              const scBx = scIsL ? scEndX : scStartX; // 경계벽 X

              // 단내림 천장 메쉬 z축 모서리 (z1→z2)
              solidThemeLines.push([scStartX, scCeilingY, z1, scStartX, scCeilingY, z2]); // 외벽쪽
              solidThemeLines.push([scEndX, scCeilingY, z1, scEndX, scCeilingY, z2]);     // 경계벽쪽
              // 경계벽 위치에서 메인 천장 높이 z축 라인 (단내림↔일반 구간 경계)
              solidThemeLines.push([scBx, cY, z1, scBx, cY, z2]);
            }

            // === 커튼박스 천장 메쉬 z축 안쪽 모서리 윤곽선 (슬롯+자유배치) ===
            if (spaceInfo.curtainBox?.enabled) {
              const _cbW3 = mmToThreeUnits(spaceInfo.curtainBox.width || 150);
              const _cbDH3 = mmToThreeUnits(spaceInfo.curtainBox.dropHeight || 20);
              const _cbIsL3 = spaceInfo.curtainBox.position === 'left';
              const _cbCY3 = cY + _cbDH3; // 커튼박스 천장 Y (위로 확장)
              const _cbBx3 = _cbIsL3 ? x1 + _cbW3 : x2 - _cbW3; // 안쪽 경계 X

              // 커튼박스 천장 안쪽 z축 모서리 (경계벽쪽, z1→z2)
              solidThemeLines.push([_cbBx3, _cbCY3, z1, _cbBx3, _cbCY3, z2]);
            }

            if (lines.length === 0 && solidThemeLines.length === 0) return null;

            const positions = new Float32Array(lines.length * 6);
            const vertColors = new Float32Array(lines.length * 6);
            const bgColor = theme?.mode === 'dark' ? new THREE.Color("#1a1a2e") : new THREE.Color("#f5f5f5");
            const softenSpaceLines = viewMode === '3D';
            const lineBaseColor = softenSpaceLines ? new THREE.Color(spaceLineTone.base) : threeEdgeColor;
            const lineBackMix = softenSpaceLines ? spaceLineTone.backMix : 0;
            const lineFrontMix = softenSpaceLines ? spaceLineTone.frontMix : 0.7;
            const lineBackColor = lineBaseColor.clone().lerp(bgColor, lineBackMix);
            const lineFrontColor = lineBaseColor.clone().lerp(bgColor, lineFrontMix);

            lines.forEach((line, i) => {
              for (let j = 0; j < 6; j++) positions[i * 6 + j] = line[j];
              // 뒷벽 쪽: 테마 색상
              vertColors[i * 6 + 0] = lineBackColor.r;
              vertColors[i * 6 + 1] = lineBackColor.g;
              vertColors[i * 6 + 2] = lineBackColor.b;
              // 앞쪽: 배경색으로 페이드
              vertColors[i * 6 + 3] = lineFrontColor.r;
              vertColors[i * 6 + 4] = lineFrontColor.g;
              vertColors[i * 6 + 5] = lineFrontColor.b;
            });

            // 단내림 뒷벽 실선 (그라데이션 없이 테마색상 단색)
            let solidThemePositions: Float32Array | null = null;
            let solidThemeColors: Float32Array | null = null;
            if (solidThemeLines.length > 0) {
              solidThemePositions = new Float32Array(solidThemeLines.length * 6);
              solidThemeColors = new Float32Array(solidThemeLines.length * 6);
              // 라인 endpoint별 색상 계산: z가 z1(뒷벽)에 가까우면 진하게, z2(앞쪽)에 가까우면 흐리게
              const zStart = extendedZOffset;
              const zEnd = extendedZOffset + extendedPanelDepth;
              const zRange = Math.max(0.0001, zEnd - zStart);
              // 회색 베이스: 윈도우 저DPR에서는 더 연한 회색으로 시작해 선 번짐을 줄임
              const baseGray = new THREE.Color(softenSpaceLines ? spaceLineTone.base : '#555555');
              const baseR = baseGray.r;
              const baseG = baseGray.g;
              const baseB = baseGray.b;
              // 앞쪽으로 갈수록 흰색에 섞이는 비율
              const fadeWhiteMax = softenSpaceLines ? spaceLineTone.fadeWhiteMax : 0.7;
              solidThemeLines.forEach((line, i) => {
                for (let j = 0; j < 6; j++) solidThemePositions![i * 6 + j] = line[j];
                // 각 endpoint의 z값으로 진하기 결정 (z1 → 0, z2 → 1)
                const z_a = line[2];
                const z_b = line[5];
                const tA = Math.min(1, Math.max(0, (z_a - zStart) / zRange));
                const tB = Math.min(1, Math.max(0, (z_b - zStart) / zRange));
                const wA = tA * fadeWhiteMax;
                const wB = tB * fadeWhiteMax;
                solidThemeColors![i * 6 + 0] = baseR * (1 - wA) + 1 * wA;
                solidThemeColors![i * 6 + 1] = baseG * (1 - wA) + 1 * wA;
                solidThemeColors![i * 6 + 2] = baseB * (1 - wA) + 1 * wA;
                solidThemeColors![i * 6 + 3] = baseR * (1 - wB) + 1 * wB;
                solidThemeColors![i * 6 + 4] = baseG * (1 - wB) + 1 * wB;
                solidThemeColors![i * 6 + 5] = baseB * (1 - wB) + 1 * wB;
              });
            }

            return (
              <>
                {lines.length > 0 && (
                  <lineSegments renderOrder={20}>
                    <bufferGeometry>
                      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                      <bufferAttribute attach="attributes-color" args={[vertColors, 3]} />
                    </bufferGeometry>
                    <lineBasicMaterial
                      vertexColors
                      depthTest={true}
                      depthWrite={false}
                      transparent={false}
                    />
                  </lineSegments>
                )}
                {solidThemePositions && solidThemeColors && (
                  <lineSegments key={`corner-lines-${solidThemeLines.length}-${extendedPanelDepth.toFixed(3)}`} renderOrder={20}>
                    <bufferGeometry>
                      <bufferAttribute attach="attributes-position" args={[solidThemePositions, 3]} />
                      <bufferAttribute attach="attributes-color" args={[solidThemeColors, 3]} />
                    </bufferGeometry>
                    <lineBasicMaterial
                      vertexColors
                      depthTest={true}
                      depthWrite={false}
                      transparent={false}
                    />
                  </lineSegments>
                )}
              </>
            );
          })()}

          {/* 바닥면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) - 탑뷰/아일랜드에서는 숨김 */}
          {!spaceInfo.isIsland && viewMode !== '2D' && renderMode === 'solid' && !isInspectionMode && !isPanelSimulationLayout && (
              <mesh
                position={[xOffset + width / 2, panelStartY - 0.001, extendedZOffset + extendedPanelDepth / 2]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[width, extendedPanelDepth]} />
                <primitive ref={floorWallMaterialRef} object={floorGradientMaterial} />
              </mesh>
          )}

          {/* 벽장 공간의 3면에서 나오는 그라데이션 오버레이들 - 입체감 효과 */}

          {(() => {
            const showGradients = false; // 그라디언트 면 비활성화 (기존 메쉬와 겹침 방지)
            return showGradients && (
              <>
                {/* 좌측 벽면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[-width / 2 - 0.001, panelStartY + adjustedPanelHeight / 2, zOffset + panelDepth / 2 + 10.81]}
                  rotation={[0, -Math.PI / 2, 0]} // 우측과 반대 방향
                >
                  <planeGeometry args={[panelDepth + 10, adjustedPanelHeight]} />
                  <primitive object={leftHorizontalGradientMaterial} />
                </mesh>

                {/* 우측 벽면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[width / 2 + 0.001, panelStartY + adjustedPanelHeight / 2, zOffset + panelDepth / 2 + 10.81]}
                  rotation={[0, Math.PI / 2, 0]} // Y축 기준 시계반대방향 90도 회전
                >
                  <planeGeometry args={[panelDepth + 10, adjustedPanelHeight]} />
                  <primitive object={horizontalGradientMaterial} />
                </mesh>

                {/* 윗면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[0, panelStartY + height + 0.001, zOffset + panelDepth / 2 + 10.81]}
                  rotation={[Math.PI / 2, 0, 0]} // 윗면을 향하도록 90도 회전
                >
                  <planeGeometry args={[width, panelDepth + 10]} />
                  <primitive object={frontToBackGradientMaterial} />
                </mesh>
              </>
            );
          }, [])}

          {/* 뒤쪽 외부 벽면 */}
          {/* console.log('🔍 백패널 렌더링 조건:', { ... }) */}
          {false ? (
            // 사용하지 않음
            (() => {
              // 점선을 위한 짧은 선분들 생성
              const dashLength = 0.3; // 점선 길이
              const gapLength = 0.15; // 간격 길이
              const segments = [];

              // 상단 가로선
              let currentX = -width / 2;
              while (currentX < width / 2) {
                const endX = Math.min(currentX + dashLength, width / 2);
                segments.push(
                  <line key={`top-${currentX}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          currentX, height / 2, 0,
                          endX, height / 2, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentX += dashLength + gapLength;
              }

              // 하단 가로선
              currentX = -width / 2;
              while (currentX < width / 2) {
                const endX = Math.min(currentX + dashLength, width / 2);
                segments.push(
                  <line key={`bottom-${currentX}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          currentX, -height / 2, 0,
                          endX, -height / 2, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentX += dashLength + gapLength;
              }

              // 좌측 세로선
              let currentY = -height / 2;
              while (currentY < height / 2) {
                const endY = Math.min(currentY + dashLength, height / 2);
                segments.push(
                  <line key={`left-${currentY}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          -width / 2, currentY, 0,
                          -width / 2, endY, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentY += dashLength + gapLength;
              }

              // 우측 세로선
              currentY = -height / 2;
              while (currentY < height / 2) {
                const endY = Math.min(currentY + dashLength, height / 2);
                segments.push(
                  <line key={`right-${currentY}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          width / 2, currentY, 0,
                          width / 2, endY, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentY += dashLength + gapLength;
              }

              return (
                <group position={[xOffset + width / 2, panelStartY + height / 2, zOffset - 0.01]}>
                  {segments}
                </group>
              );
            })()
          ) : (
            // 3D 모드나 다른 2D 뷰에서는 투명 처리
            <mesh
              position={[xOffset + width / 2, panelStartY + height / 2, zOffset - 0.01]}
              renderOrder={-1}
            >
              <planeGeometry args={[width, height]} />
              <meshStandardMaterial
                color="#ffffff"
                transparent={true}
                opacity={0.0}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}

          {/* 모서리 음영 라인들 - 벽면이 만나는 모서리에 어두운 선 (3D/wireframe에서는 숨김) */}
          {renderMode === 'solid' && viewMode === '2D' && (() => {
            const _hasDC = spaceInfo.droppedCeiling?.enabled;
            const _dcIsLeft = _hasDC && spaceInfo.droppedCeiling?.position === 'left';
            const _dcIsRight = _hasDC && spaceInfo.droppedCeiling?.position === 'right';
            const _dcDropH = _hasDC ? mmToThreeUnits(spaceInfo.droppedCeiling!.dropHeight || 200) : 0;
            const _dcW = _hasDC ? mmToThreeUnits(spaceInfo.droppedCeiling!.width || (isFreePlacement ? 150 : 900)) : 0;

            // 커튼박스 처리 (슬롯배치 + 자유배치 모두)
            const _hasCBOnly = !!spaceInfo.curtainBox?.enabled;
            const _cbIsLeft = _hasCBOnly && spaceInfo.curtainBox?.position === 'left';
            const _cbIsRight = _hasCBOnly && spaceInfo.curtainBox?.position === 'right';
            const _cbDropH = _hasCBOnly ? mmToThreeUnits(spaceInfo.curtainBox!.dropHeight || 20) : 0;
            const _cbW = _hasCBOnly ? mmToThreeUnits(spaceInfo.curtainBox!.width || 150) : 0;

            // 커튼박스/단내림 고려한 좌/우 벽 높이
            // 자유배치 커튼박스: 위로 확장(+), 슬롯배치 단내림: 아래로(-)
            // 슬롯배치 커튼박스 단독: 위로 확장(+)
            let leftWallH = height;
            let rightWallH = height;
            if (_dcIsLeft && _cbIsLeft) {
              leftWallH = height + _cbDropH;  // DC+CB 동시: 외벽은 CB 높이(위로)
            } else if (_dcIsLeft) {
              leftWallH = isFreePlacement ? height + _dcDropH : height - _dcDropH;
            } else if (_cbIsLeft) {
              leftWallH = height + _cbDropH;  // CB (단독 또는 DC 반대쪽)
            }
            if (_dcIsRight && _cbIsRight) {
              rightWallH = height + _cbDropH;
            } else if (_dcIsRight) {
              rightWallH = isFreePlacement ? height + _dcDropH : height - _dcDropH;
            } else if (_cbIsRight) {
              rightWallH = height + _cbDropH; // CB (단독 또는 DC 반대쪽)
            }
            // 좌/우 천장 Y
            let leftCeilingY = panelStartY + height;
            let rightCeilingY = panelStartY + height;
            if (_dcIsLeft && _cbIsLeft) {
              leftCeilingY = panelStartY + height + _cbDropH;
            } else if (_dcIsLeft) {
              leftCeilingY = isFreePlacement ? panelStartY + height + _dcDropH : panelStartY + height - _dcDropH;
            } else if (_cbIsLeft) {
              leftCeilingY = panelStartY + height + _cbDropH;   // CB (단독 또는 DC 반대쪽)
            }
            if (_dcIsRight && _cbIsRight) {
              rightCeilingY = panelStartY + height + _cbDropH;
            } else if (_dcIsRight) {
              rightCeilingY = isFreePlacement ? panelStartY + height + _dcDropH : panelStartY + height - _dcDropH;
            } else if (_cbIsRight) {
              rightCeilingY = panelStartY + height + _cbDropH;  // CB (단독 또는 DC 반대쪽)
            }
            // 경계벽 X 위치 (droppedCeiling 또는 curtainBox)
            // DC+CB 같은 쪽 동시: DC 경계는 CB 너비를 추가로 고려해야 함
            const _dcCbSameSide = (_dcIsLeft && _cbIsLeft) || (_dcIsRight && _cbIsRight);
            const _cbOffW = _dcCbSameSide ? _cbW : 0;
            const _bx = _dcIsLeft ? (xOffset + _cbOffW + _dcW)
              : _dcIsRight ? (xOffset + width - _cbOffW - _dcW)
              : _cbIsLeft ? (xOffset + _cbW)
              : _cbIsRight ? (xOffset + width - _cbW)
              : 0;
            const visibleEdgeShadowMaterial = MaterialFactory.createEdgeShadowMaterial();
            visibleEdgeShadowMaterial.depthTest = false;
            visibleEdgeShadowMaterial.depthWrite = false;
            const bottomEdgeY = panelStartY + 0.003;

            return (
            <>
            {/* 왼쪽 세로 모서리 (좌측벽과 뒷벽 사이) */}
            <mesh
              position={[-width / 2, panelStartY + leftWallH / 2, zOffset]}
              rotation={[0, 0, 0]}
              renderOrder={-1}
            >
              <planeGeometry args={[0.02, leftWallH]} />
              <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
            </mesh>

            {/* 오른쪽 세로 모서리 (우측벽과 뒷벽 사이) */}
            <mesh
              position={[width / 2, panelStartY + rightWallH / 2, zOffset]}
              rotation={[0, 0, 0]}
              renderOrder={-1}
            >
              <planeGeometry args={[0.02, rightWallH]} />
              <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
            </mesh>

            {/* 상단 가로 모서리 (천장과 뒷벽 사이) - 단내림/커튼박스 시 메인 구간만 */}
            {(_hasDC || (_hasCBOnly && !_hasDC)) ? (() => {
              // 단내림이 있으면 _dcW 사용, 커튼박스 단독이면 _cbW 사용
              // DC+CB 동시: DC 구간 + CB 구간 모두 메인에서 제외
              const _zoneW = _hasDC ? _dcW : _cbW;
              const _cbExtraW = (_hasDC && _hasCBOnly && _dcCbSameSide) ? _cbW : 0; // DC+CB 같은 쪽 시 CB 추가 제외
              const _zoneDropH = _hasDC ? _dcDropH : _cbDropH;
              const _zoneIsLeft = _hasDC ? _dcIsLeft : _cbIsLeft;
              const _scEnabled = isFreePlacement && spaceInfo.stepCeiling?.enabled;
              const _scW2 = _scEnabled ? mmToThreeUnits(spaceInfo.stepCeiling!.width || 900) : 0;
              const _mainW = width - _zoneW - _cbExtraW - _scW2;
              // 메인 구간 시작 X
              const _mainStartX = (_zoneIsLeft || (_scEnabled && spaceInfo.stepCeiling?.position === 'left'))
                ? xOffset + _zoneW + _cbExtraW + _scW2
                : xOffset;
              // 구간 천장 높이: 자유배치+DC = 위로, 슬롯+DC = 아래로, 슬롯+CB단독 = 위로
              const _zoneCeilingY = _hasDC
                ? (isFreePlacement ? panelStartY + height + _dcDropH : panelStartY + height - _dcDropH)
                : panelStartY + height + _cbDropH; // CB 단독은 항상 위로
              // 경계벽 중심Y와 높이
              const _boundaryMidY = _hasDC
                ? (isFreePlacement ? panelStartY + height + _dcDropH / 2 : panelStartY + height - _dcDropH / 2)
                : panelStartY + height + _cbDropH / 2;
              return (
                <>
                  {/* 메인 구간 천장 가로선 */}
                  <mesh
                    position={[
                      _mainStartX + _mainW / 2,
                      panelStartY + height,
                      zOffset
                    ]}
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={-1}
                  >
                    <planeGeometry args={[0.02, _mainW]} />
                    <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
                  </mesh>
                  {/* 커튼박스/단내림 구간 천장 가로선 */}
                  <mesh
                    position={[
                      _zoneIsLeft ? (xOffset + _cbExtraW + _zoneW / 2) : (xOffset + width - _cbExtraW - _zoneW / 2),
                      _zoneCeilingY,
                      zOffset
                    ]}
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={-1}
                  >
                    <planeGeometry args={[0.02, _zoneW]} />
                    <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
                  </mesh>
                  {/* 경계벽 수직 음영선 (뒷벽) */}
                  <mesh
                    position={[_bx, _boundaryMidY, zOffset]}
                    rotation={[0, 0, 0]}
                    renderOrder={-1}
                  >
                    <planeGeometry args={[0.02, _zoneDropH]} />
                    <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
                  </mesh>
                </>
              );
            })() : (
              <mesh
                position={[xOffset + width / 2, panelStartY + height, zOffset]}
                rotation={[0, 0, Math.PI / 2]}
                renderOrder={-1}
              >
                <planeGeometry args={[0.02, width]} />
                <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
              </mesh>
            )}

            {/* 하단 가로 모서리 (바닥과 뒷벽 사이) */}
            <mesh
              position={[xOffset + width / 2, bottomEdgeY, zOffset]}
              rotation={[0, 0, Math.PI / 2]}
              renderOrder={1002}
            >
              <planeGeometry args={[0.02, width]} />
              <primitive object={visibleEdgeShadowMaterial} />
            </mesh>

            {/* 왼쪽 위 세로 모서리 (좌측벽과 천장 사이) */}
            <mesh
              position={[-width / 2, leftCeilingY, extendedZOffset + extendedPanelDepth / 2]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.02, extendedPanelDepth]} />
              <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
            </mesh>

            {/* 오른쪽 위 세로 모서리 (우측벽과 천장 사이) */}
            <mesh
              position={[width / 2, rightCeilingY, extendedZOffset + extendedPanelDepth / 2]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.02, extendedPanelDepth]} />
              <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
            </mesh>

            {/* 왼쪽 아래 세로 모서리 (좌측벽과 바닥 사이) */}
            <mesh
              position={[-width / 2, bottomEdgeY, extendedZOffset + extendedPanelDepth / 2]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={1002}
            >
              <planeGeometry args={[0.02, extendedPanelDepth]} />
              <primitive object={visibleEdgeShadowMaterial} />
            </mesh>

            {/* 오른쪽 아래 세로 모서리 (우측벽과 바닥 사이) */}
            <mesh
              position={[width / 2, bottomEdgeY, extendedZOffset + extendedPanelDepth / 2]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={1002}
            >
              <planeGeometry args={[0.02, extendedPanelDepth]} />
              <primitive object={visibleEdgeShadowMaterial} />
            </mesh>

            {/* 커튼박스/단내림 경계벽 앞뒤 모서리 */}
            {_hasDC && !isFreePlacement && (
              <>
                {/* 경계벽 상단 모서리: 슬롯=메인 천장 */}
                <mesh
                  position={[_bx, panelStartY + height, extendedZOffset + extendedPanelDepth / 2]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[0.02, extendedPanelDepth]} />
                  <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
                </mesh>
                {/* 경계벽 하단 모서리: 슬롯=단내림 천장 */}
                <mesh
                  position={[_bx, panelStartY + height - _dcDropH, extendedZOffset + extendedPanelDepth / 2]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[0.02, extendedPanelDepth]} />
                  <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
                </mesh>
              </>
            )}

            {/* 단내림(stepCeiling) 경계벽 모서리 음영 (자유배치 전용) */}
            {/* 뒷벽 수직/가로 음영선만 표시, 앞뒤 모서리는 천장면에 사선으로 보이므로 제거 */}
            {isFreePlacement && spaceInfo.stepCeiling?.enabled && (() => {
              const _scW = mmToThreeUnits(spaceInfo.stepCeiling!.width || 900);
              const _scDropH2 = mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200);
              const _scIsLeft = spaceInfo.stepCeiling?.position === 'left';
              const _scBx = _hasDC
                ? (_scIsLeft ? (-width / 2 + _dcW + _scW) : (width / 2 - _dcW - _scW))
                : (_scIsLeft ? (-width / 2 + _scW) : (width / 2 - _scW));
              return (
                <>
                  {/* 단내림 경계벽 수직 음영선 (뒷벽) */}
                  <mesh
                    position={[_scBx, panelStartY + height - _scDropH2 / 2, zOffset]}
                    rotation={[0, 0, 0]}
                    renderOrder={-1}
                  >
                    <planeGeometry args={[0.02, _scDropH2]} />
                    <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
                  </mesh>
                  {/* 단내림 천장 가로 음영선 (뒷벽) */}
                  <mesh
                    position={[
                      _hasDC
                        ? (_scIsLeft ? (-width / 2 + _dcW + _scW / 2) : (width / 2 - _dcW - _scW / 2))
                        : (_scIsLeft ? (-width / 2 + _scW / 2) : (width / 2 - _scW / 2)),
                      panelStartY + height - _scDropH2,
                      zOffset
                    ]}
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={-1}
                  >
                    <planeGeometry args={[0.02, _scW]} />
                    <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
                  </mesh>
                </>
              );
            })()}
            </>
            );
          })()}

          {/* 그라데이션 메쉬 뒷면(z축 뒤) 경계 라인 — 좌벽/우벽 세로, 천장/바닥 가로 */}
          {renderMode === 'solid' && (() => {
            const lineColor = theme?.mode === 'dark' ? '#888888' : '#aaaaaa';
            const hasLW = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wallConfig?.left);
            const hasRW = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wallConfig?.right);
            const lx = xOffset;
            const rx = xOffset + width;
            const by = panelStartY;
            const ty = panelStartY + height; // 메인 천장
            const bz = extendedZOffset + 0.01;
            const lines: number[] = [];

            // 단내림/커튼박스 감지
            // 슬롯배치: 단내림=droppedCeiling(내려감), 커튼박스=curtainBox(올라감)
            // 자유배치: 단내림=stepCeiling(내려감), 커튼박스=droppedCeiling(올라감)
            // --- 단내림 ---
            const _hasStepDown = isFreePlacement
              ? !!(spaceInfo.stepCeiling?.enabled)
              : !!(spaceInfo.droppedCeiling?.enabled);
            const _sdSrc = isFreePlacement ? spaceInfo.stepCeiling : spaceInfo.droppedCeiling;
            const _sdIsLeft = _hasStepDown && _sdSrc?.position === 'left';
            const _sdIsRight = _hasStepDown && _sdSrc?.position === 'right';
            const _sdDropH = _hasStepDown ? mmToThreeUnits(_sdSrc!.dropHeight || 200) : 0;
            const _sdW = _hasStepDown ? mmToThreeUnits(_sdSrc!.width || (isFreePlacement ? 900 : 900)) : 0;
            // --- 커튼박스 ---
            const _hasCBx = isFreePlacement
              ? !!(spaceInfo.droppedCeiling?.enabled)
              : !!(spaceInfo.curtainBox?.enabled);
            const _cbSrc = isFreePlacement ? spaceInfo.droppedCeiling : spaceInfo.curtainBox;
            const _cbxIsLeft = _hasCBx && _cbSrc?.position === 'left';
            const _cbxIsRight = _hasCBx && _cbSrc?.position === 'right';
            const _cbxDropH = _hasCBx ? mmToThreeUnits((_cbSrc as any)?.dropHeight || 20) : 0;
            const _cbxW = _hasCBx ? mmToThreeUnits(_cbSrc!.width || 150) : 0;

            // 구간별 천장 높이 계산 (최대 3구간: 메인/단내림/커튼박스)
            const segments: {sx: number; ex: number; cy: number}[] = [];
            const mainCeilY = ty;

            // 단내림: 천장이 내려감
            // DC+CB 같은 쪽 동시: DC 경계는 CB 너비를 추가로 고려
            const dcSide = _hasStepDown
              ? (_sdIsLeft ? 'left' : _sdIsRight ? 'right' : null) : null;
            const dcCeilY = dcSide ? ty - _sdDropH : ty;
            const _dcCbSameSide2 = (dcSide === 'left' && _cbxIsLeft) || (dcSide === 'right' && _cbxIsRight);
            const _cbxWForDc = _dcCbSameSide2 ? _cbxW : 0;
            const dcBoundX = dcSide === 'left' ? lx + _cbxWForDc + _sdW : dcSide === 'right' ? rx - _cbxWForDc - _sdW : lx;

            // 커튼박스: 천장이 올라감
            const cbSide = _hasCBx
              ? (_cbxIsLeft ? 'left' : _cbxIsRight ? 'right' : null) : null;
            const cbCeilY = cbSide ? ty + _cbxDropH : ty;
            const cbBoundX = cbSide === 'left' ? lx + _cbxW : cbSide === 'right' ? rx - _cbxW : lx;

            // 경계 X 좌표 수집 (좌→우 정렬)
            // DC+CB 같은 쪽 좌측: [CB | DC | 메인] → CB 경계 rightCeilY=dcCeilY (DC 구간 진입)
            const _bothLeft = dcSide === 'left' && cbSide === 'left';
            const boundaries: {x: number; leftCeilY: number; rightCeilY: number}[] = [];
            if (dcSide === 'left') boundaries.push({x: dcBoundX, leftCeilY: dcCeilY, rightCeilY: mainCeilY});
            if (cbSide === 'left') boundaries.push({x: cbBoundX, leftCeilY: cbCeilY, rightCeilY: _bothLeft ? dcCeilY : mainCeilY});
            if (dcSide === 'right') boundaries.push({x: dcBoundX, leftCeilY: mainCeilY, rightCeilY: dcCeilY});
            if (cbSide === 'right') boundaries.push({x: cbBoundX, leftCeilY: mainCeilY, rightCeilY: cbCeilY});
            boundaries.sort((a, b) => a.x - b.x);

            // 구간 생성
            if (boundaries.length === 0) {
              segments.push({sx: lx, ex: rx, cy: mainCeilY});
            } else {
              // 좌측부터 경계점까지 순서대로
              let prevX = lx;
              // 좌측 끝 천장 높이 결정
              let currentCeilY = mainCeilY;
              if (dcSide === 'left') currentCeilY = dcCeilY;
              if (cbSide === 'left') currentCeilY = cbCeilY;

              for (const bd of boundaries) {
                if (bd.x > prevX) {
                  segments.push({sx: prevX, ex: bd.x, cy: currentCeilY});
                }
                // 경계 넘어서면 반대쪽 높이로
                currentCeilY = (bd.x <= (lx + rx) / 2) ? bd.rightCeilY : bd.rightCeilY;
                // 더 정확히: 경계의 오른쪽 높이
                currentCeilY = bd.rightCeilY;
                prevX = bd.x;
              }
              // 마지막 구간
              // 우측 끝 천장 높이
              let rightEndCeilY = mainCeilY;
              if (dcSide === 'right') rightEndCeilY = dcCeilY;
              if (cbSide === 'right') rightEndCeilY = cbCeilY;
              if (prevX < rx) {
                segments.push({sx: prevX, ex: rx, cy: rightEndCeilY});
              }
            }

            // 천장 가로 라인 (구간별)
            for (const seg of segments) {
              lines.push(seg.sx, seg.cy, bz, seg.ex, seg.cy, bz);
            }
            // 인접 구간 간 세로 연결선
            for (let i = 0; i < segments.length - 1; i++) {
              const cur = segments[i];
              const next = segments[i + 1];
              if (cur.cy !== next.cy) {
                const minY = Math.min(cur.cy, next.cy);
                const maxY = Math.max(cur.cy, next.cy);
                lines.push(cur.ex, minY, bz, cur.ex, maxY, bz);
              }
            }

            // 바닥 가로
            lines.push(lx, by, bz, rx, by, bz);
            // 좌벽 세로
            if (hasLW) lines.push(lx, by, bz, lx, segments[0].cy, bz);
            // 우벽 세로
            if (hasRW) lines.push(rx, by, bz, rx, segments[segments.length - 1].cy, bz);

            return lines.length > 0 ? (
              <lineSegments renderOrder={20}>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[new Float32Array(lines), 3]} />
                </bufferGeometry>
                <lineBasicMaterial color={lineColor} depthTest={true} depthWrite={false} transparent opacity={0.5} />
              </lineSegments>
            ) : null;
          })()}

        </>
      )}

      {/* 공간 윤곽선: wireframe 또는 orthographic 모드에서 표시 (아일랜드 모드에서는 숨김) */}
      {!spaceInfo.isIsland && viewMode !== '2D' && !isLiveDimensionInspecting && !isPanelSimulationLayout && (renderMode === 'wireframe' || cameraMode === 'orthographic') && (() => {
            const wfLineColor = theme?.mode === 'dark' ? "#ffffff" : "#333333";
            const hasLeftWall = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wallConfig?.left);
            const hasRightWall = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wallConfig?.right);
            const ceilingY = panelStartY + height;
            const z1 = extendedZOffset;
            const z2 = extendedZOffset + extendedPanelDepth;
            const x1 = xOffset;
            const x2 = xOffset + width;

            const floorY = panelStartY;
            // X/Y축 뒷벽 라인 + Z축 그라데이션 라인
            const solidLines: [number, number, number, number, number, number][] = [];
            const gradientLines: [number, number, number, number, number, number][] = [];
            const overlayLines: [number, number, number, number, number, number][] = [];

            // 뒷벽(z1)에 X/Y축 경계 라인 (단내림/커튼박스 분절 — 최대 3구간)
            // 슬롯배치: 단내림=droppedCeiling(내려감), 커튼박스=curtainBox(올라감)
            // 자유배치: 단내림=stepCeiling(내려감), 커튼박스=droppedCeiling(올라감)
            const _bHasSD = isFreePlacement
              ? !!(spaceInfo.stepCeiling?.enabled)
              : !!(spaceInfo.droppedCeiling?.enabled);
            const _bSdSrc = isFreePlacement ? spaceInfo.stepCeiling : spaceInfo.droppedCeiling;
            const _bSdIsLeft = _bHasSD && _bSdSrc?.position === 'left';
            const _bSdIsRight = _bHasSD && _bSdSrc?.position === 'right';
            const _bSdDropH = _bHasSD ? mmToThreeUnits(_bSdSrc!.dropHeight || 200) : 0;
            const _bSdW = _bHasSD ? mmToThreeUnits(_bSdSrc!.width || 900) : 0;

            const _bHasCBx = isFreePlacement
              ? !!(spaceInfo.droppedCeiling?.enabled)
              : !!(spaceInfo.curtainBox?.enabled);
            const _bCbSrc = isFreePlacement ? spaceInfo.droppedCeiling : spaceInfo.curtainBox;
            const _bCbxIsLeft = _bHasCBx && _bCbSrc?.position === 'left';
            const _bCbxIsRight = _bHasCBx && _bCbSrc?.position === 'right';
            const _bCbxDropH = _bHasCBx ? mmToThreeUnits((_bCbSrc as any)?.dropHeight || 20) : 0;
            const _bCbxW = _bHasCBx ? mmToThreeUnits(_bCbSrc!.width || 150) : 0;

            const bSegs: {sx: number; ex: number; cy: number}[] = [];
            const bMainCY = ceilingY;

            const bDcSide = _bHasSD ? (_bSdIsLeft ? 'left' : _bSdIsRight ? 'right' : null) : null;
            const bDcCY = bDcSide ? ceilingY - _bSdDropH : ceilingY;
            // DC+CB 같은 쪽 동시: DC 경계는 CB 너비를 추가로 고려
            const _bDcCbSameSide = (bDcSide === 'left' && _bCbxIsLeft) || (bDcSide === 'right' && _bCbxIsRight);
            const _bCbxWForDc = _bDcCbSameSide ? _bCbxW : 0;
            const bDcBX = bDcSide === 'left' ? x1 + _bCbxWForDc + _bSdW : bDcSide === 'right' ? x2 - _bCbxWForDc - _bSdW : x1;

            const bCbSide = _bHasCBx ? (_bCbxIsLeft ? 'left' : _bCbxIsRight ? 'right' : null) : null;
            const bCbCY = bCbSide ? ceilingY + _bCbxDropH : ceilingY;
            const bCbBX = bCbSide === 'left' ? x1 + _bCbxW : bCbSide === 'right' ? x2 - _bCbxW : x1;

            // DC+CB 같은 쪽 좌측: [CB | DC | 메인] → CB 경계 rightCeilY=bDcCY (DC 구간 진입)
            const _bBothLeft = bDcSide === 'left' && bCbSide === 'left';
            const bBounds: {x: number; rightCeilY: number}[] = [];
            if (bDcSide === 'left') bBounds.push({x: bDcBX, rightCeilY: bMainCY});
            if (bCbSide === 'left') bBounds.push({x: bCbBX, rightCeilY: _bBothLeft ? bDcCY : bMainCY});
            if (bDcSide === 'right') bBounds.push({x: bDcBX, rightCeilY: bDcCY});
            if (bCbSide === 'right') bBounds.push({x: bCbBX, rightCeilY: bCbCY});
            bBounds.sort((a, b) => a.x - b.x);

            if (bBounds.length === 0) {
              bSegs.push({sx: x1, ex: x2, cy: bMainCY});
            } else {
              let bPrevX = x1;
              let bCurCY = bMainCY;
              if (bDcSide === 'left') bCurCY = bDcCY;
              if (bCbSide === 'left') bCurCY = bCbCY;

              for (const bd of bBounds) {
                if (bd.x > bPrevX) bSegs.push({sx: bPrevX, ex: bd.x, cy: bCurCY});
                bCurCY = bd.rightCeilY;
                bPrevX = bd.x;
              }
              let bRightEndCY = bMainCY;
              if (bDcSide === 'right') bRightEndCY = bDcCY;
              if (bCbSide === 'right') bRightEndCY = bCbCY;
              if (bPrevX < x2) bSegs.push({sx: bPrevX, ex: x2, cy: bRightEndCY});
            }

            for (const seg of bSegs) {
              solidLines.push([seg.sx, seg.cy, z1, seg.ex, seg.cy, z1]);
            }
            for (let i = 0; i < bSegs.length - 1; i++) {
              const cur = bSegs[i];
              const next = bSegs[i + 1];
              if (cur.cy !== next.cy) {
                const minY = Math.min(cur.cy, next.cy);
                const maxY = Math.max(cur.cy, next.cy);
                solidLines.push([cur.ex, minY, z1, cur.ex, maxY, z1]);
              }
            }
            solidLines.push([x1, floorY, z1, x2, floorY, z1]);
            if (hasLeftWall) solidLines.push([x1, floorY, z1, x1, bSegs[0].cy, z1]);
            if (hasRightWall) solidLines.push([x2, floorY, z1, x2, bSegs[bSegs.length - 1].cy, z1]);

            const hasDC = spaceInfo.droppedCeiling?.enabled;
            const dcIsLeft = hasDC && spaceInfo.droppedCeiling?.position === 'left';
            const dcIsRight = hasDC && spaceInfo.droppedCeiling?.position === 'right';
            const dcW = hasDC ? mmToThreeUnits(spaceInfo.droppedCeiling!.width || (isFreePlacement ? 150 : 900)) : 0;
            const dcDropH = hasDC ? mmToThreeUnits(spaceInfo.droppedCeiling!.dropHeight || 200) : 0;
            // DC+CB 같은 쪽 동시: DC 경계는 CB 너비를 추가로 고려
            const _wfCbEnabled = !isFreePlacement && spaceInfo.curtainBox?.enabled;
            const _wfCbW = _wfCbEnabled ? mmToThreeUnits(spaceInfo.curtainBox!.width || 150) : 0;
            const _wfCbSameSide = _wfCbEnabled && (
              (dcIsLeft && spaceInfo.curtainBox!.position === 'left') ||
              (dcIsRight && spaceInfo.curtainBox!.position === 'right')
            );
            const _wfCbOff = _wfCbSameSide ? _wfCbW : 0;
            const dcBx = dcIsLeft ? x1 + _wfCbOff + dcW : x2 - _wfCbOff - dcW;

            // Z축 방향 그라데이션 라인만 유지 (천장-벽, 바닥-벽 경계)
            // DC+CB 동시: 벽쪽 최외곽 구간 높이 사용 (CB가 벽 인접)
            const _wfCbIsLeft = _wfCbEnabled && spaceInfo.curtainBox!.position === 'left';
            const _wfCbIsRight = _wfCbEnabled && spaceInfo.curtainBox!.position === 'right';
            const _wfCbDropH = _wfCbEnabled ? mmToThreeUnits(spaceInfo.curtainBox!.dropHeight || 20) : 0;
            if (hasLeftWall) {
              let leftCeilingY: number;
              if (dcIsLeft && _wfCbIsLeft) {
                // DC+CB 같은 쪽 좌측: 벽 인접 = CB → 위로 확장
                leftCeilingY = ceilingY + _wfCbDropH;
              } else if (_wfCbIsLeft && !dcIsLeft) {
                // CB만 좌측 (DC 우측 = 다른 쪽): 벽 인접 = CB → 위로 확장
                leftCeilingY = ceilingY + _wfCbDropH;
              } else if (dcIsLeft) {
                const leftDcDropH = mmToThreeUnits(spaceInfo.droppedCeiling!.dropHeight || 200);
                leftCeilingY = isFreePlacement ? ceilingY + leftDcDropH : ceilingY - leftDcDropH;
              } else {
                leftCeilingY = ceilingY;
              }
              gradientLines.push([x1, leftCeilingY, z1, x1, leftCeilingY, z2]); // 천장-좌벽
              gradientLines.push([x1, floorY, z1, x1, floorY, z2]); // 바닥-좌벽
            }
            if (hasRightWall) {
              let rightCeilingY: number;
              if (dcIsRight && _wfCbIsRight) {
                // DC+CB 같은 쪽 우측: 벽 인접 = CB → 위로 확장
                rightCeilingY = ceilingY + _wfCbDropH;
              } else if (_wfCbIsRight && !dcIsRight) {
                // CB만 우측 (DC 좌측 = 다른 쪽): 벽 인접 = CB → 위로 확장
                rightCeilingY = ceilingY + _wfCbDropH;
              } else if (dcIsRight) {
                const rightDcDropH = mmToThreeUnits(spaceInfo.droppedCeiling!.dropHeight || 200);
                rightCeilingY = isFreePlacement ? ceilingY + rightDcDropH : ceilingY - rightDcDropH;
              } else {
                rightCeilingY = ceilingY;
              }
              gradientLines.push([x2, rightCeilingY, z1, x2, rightCeilingY, z2]); // 천장-우벽
              gradientLines.push([x2, floorY, z1, x2, floorY, z2]); // 바닥-우벽
            }

            // 경계벽 Z축 그라데이션 라인
            if (hasDC && !isFreePlacement) {
              const bwBotY = ceilingY - dcDropH;
              gradientLines.push([dcBx, ceilingY, z1, dcBx, ceilingY, z2]); // 경계벽 상단
              gradientLines.push([dcBx, bwBotY, z1, dcBx, bwBotY, z2]); // 경계벽 하단
              // DC+CB 같은 쪽: 벽~DC 사이에 CB가 있으므로 벽에 DC 바닥선 그리지 않음
              if (dcIsLeft && hasLeftWall && !_wfCbIsLeft) {
                gradientLines.push([x1, bwBotY, z1, x1, bwBotY, z2]);
              } else if (dcIsRight && hasRightWall && !_wfCbIsRight) {
                gradientLines.push([x2, ceilingY - dcDropH, z1, x2, ceilingY - dcDropH, z2]);
              }
            }
            // DC+CB 동시: CB 경계벽 Z축 그라데이션 라인
            if (_bHasCBx && _bHasSD && !isFreePlacement) {
              const _cbGBx2 = _bCbxIsLeft ? x1 + _bCbxW : x2 - _bCbxW;
              const _cbGTopY2 = ceilingY + _bCbxDropH;
              gradientLines.push([_cbGBx2, _cbGTopY2, z1, _cbGBx2, _cbGTopY2, z2]); // CB 경계벽 상단
              // CB 경계벽 하단: 같은 쪽=DC천장(낮음), 다른 쪽=메인천장
              const _cbGBotY2 = _bDcCbSameSide ? ceilingY - dcDropH : ceilingY;
              gradientLines.push([_cbGBx2, _cbGBotY2, z1, _cbGBx2, _cbGBotY2, z2]);
            }
            // 커튼박스 단독 경계벽 Z축 그라데이션 라인 (슬롯+자유배치)
            if (_bHasCBx && !_bHasSD) {
              const _cbGW = _bCbxW;
              const _cbGIsL = _bCbxIsLeft;
              const _cbGBx = _cbGIsL ? x1 + _cbGW : x2 - _cbGW;
              const _cbGTopY = ceilingY + _bCbxDropH;
              gradientLines.push([_cbGBx, _cbGTopY, z1, _cbGBx, _cbGTopY, z2]); // 경계벽 상단 (CB 천장)
              gradientLines.push([_cbGBx, ceilingY, z1, _cbGBx, ceilingY, z2]); // 경계벽 하단 (메인 천장)
              if (_cbGIsL && hasLeftWall) {
                gradientLines.push([x1, _cbGTopY, z1, x1, _cbGTopY, z2]);
              } else if (!_cbGIsL && hasRightWall) {
                gradientLines.push([x2, _cbGTopY, z1, x2, _cbGTopY, z2]);
              }
            }

            // 단색 선 positions
            const solidPositions = new Float32Array(solidLines.length * 6);
            solidLines.forEach((line, i) => {
              for (let j = 0; j < 6; j++) solidPositions[i * 6 + j] = line[j];
            });

            // 오버레이 선 positions (depthTest=false로 항상 보이는 경계벽 선)
            const overlayPositions = new Float32Array(overlayLines.length * 6);
            overlayLines.forEach((line, i) => {
              for (let j = 0; j < 6; j++) overlayPositions[i * 6 + j] = line[j];
            });

            // 그라데이션 선 positions + vertex colors
            const gradPositions = new Float32Array(gradientLines.length * 6);
            const gradColors = new Float32Array(gradientLines.length * 6); // RGB per vertex
            const baseColor = new THREE.Color(wfLineColor);

            gradientLines.forEach((line, i) => {
              for (let j = 0; j < 6; j++) gradPositions[i * 6 + j] = line[j];
              // 첫 번째 꼭짓점(z=z1, 뒷벽): 진한 색
              gradColors[i * 6 + 0] = baseColor.r;
              gradColors[i * 6 + 1] = baseColor.g;
              gradColors[i * 6 + 2] = baseColor.b;
              // 두 번째 꼭짓점(z=z2, 앞쪽): 배경색 방향으로 페이드 (30% 원색 유지)
              const bgColor = theme?.mode === 'dark' ? new THREE.Color("#1a1a2e") : new THREE.Color("#f5f5f5");
              const blendRatio = 0.3; // 앞쪽 끝에서도 30% 원색 유지
              gradColors[i * 6 + 3] = baseColor.r * blendRatio + bgColor.r * (1 - blendRatio);
              gradColors[i * 6 + 4] = baseColor.g * blendRatio + bgColor.g * (1 - blendRatio);
              gradColors[i * 6 + 5] = baseColor.b * blendRatio + bgColor.b * (1 - blendRatio);
            });

            return (
              <>
                {/* 뒷벽 단색 선 — 도어/가구가 먼저 depth에 기록된 후 그려져 가려짐 */}
                {solidLines.length > 0 && (
                  <lineSegments renderOrder={20}>
                    <bufferGeometry>
                      <bufferAttribute attach="attributes-position" args={[solidPositions, 3]} />
                    </bufferGeometry>
                    <lineBasicMaterial color={wfLineColor} depthTest={true} depthWrite={false} />
                  </lineSegments>
                )}
                {/* 경계벽 오버레이 선 (depthTest=false: 뒷벽 mesh에 가려지지 않음) */}
                {overlayLines.length > 0 && (
                  <lineSegments renderOrder={10}>
                    <bufferGeometry>
                      <bufferAttribute attach="attributes-position" args={[overlayPositions, 3]} />
                    </bufferGeometry>
                    <lineBasicMaterial color={wfLineColor} depthTest={false} />
                  </lineSegments>
                )}
                {/* z축 그라데이션 선 — 도어/가구가 먼저 depth에 기록된 후 그려져 가려짐 */}
                {gradientLines.length > 0 && (
                  <lineSegments renderOrder={20}>
                    <bufferGeometry>
                      <bufferAttribute attach="attributes-position" args={[gradPositions, 3]} />
                      <bufferAttribute attach="attributes-color" args={[gradColors, 3]} />
                    </bufferGeometry>
                    <lineBasicMaterial vertexColors depthTest={true} depthWrite={false} />
                  </lineSegments>
                )}
              </>
            );
          })()}

      {/* 바닥 마감재가 있는 경우 - 전체 가구 폭으로 설치 */}
      {spaceInfo.hasFloorFinish && floorFinishHeight > 0 && (
        <>
          <BoxWithEdges
            hideEdges={hideEdges}
            isOuterFrame
            args={[width, floorFinishHeight, extendedPanelDepth]}
            position={[xOffset + width / 2, yOffset + floorFinishHeight / 2, extendedZOffset + extendedPanelDepth / 2]}
            material={new THREE.MeshLambertMaterial({ color: floorColor })}
            renderMode={renderMode}
            viewMode={viewMode}
            shadowEnabled={shadowEnabled}
            view2DTheme={view2DTheme}
          />
          {/* 2D 측면뷰: 바닥마감재 측면 단면에 빗금 패턴 표시
              CleanCAD2D 정면뷰 바닥마감재 해치와 동일한 패턴 (40mm 간격, 45도, #FFCC99/#CC8844) */}
          {viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') && (() => {
            const hatchColor = view2DTheme === 'dark' ? '#FFCC99' : '#CC8844';
            const bgColor = '#FFCC99';
            // 측면뷰 평면: Z(앞뒤) × Y(높이). Y는 0~floorFinishHeight, Z는 extendedZOffset~extendedZOffset+extendedPanelDepth
            const z0 = extendedZOffset;
            const z1 = extendedZOffset + extendedPanelDepth;
            const planeDepth = extendedPanelDepth;
            const planeHeight = floorFinishHeight;
            const hatchSpacing = mmToThreeUnits(40);
            const startOff = -planeHeight;
            const endOff = planeDepth;
            const hatchCount = Math.ceil((endOff - startOff) / hatchSpacing) + 1;

            // 좌측 측면 (view2DDirection === 'left'): X = xOffset, 반대편이 보임
            // 우측 측면 (view2DDirection === 'right'): X = xOffset + width
            const showLeft = view2DDirection === 'left';
            const showRight = view2DDirection === 'right';

            const buildHatch = (planeX: number, key: string) => {
              const lines: JSX.Element[] = [];
              for (let i = 0; i <= hatchCount; i++) {
                const off = startOff + i * hatchSpacing;
                // 시작점: (z = z0 + off, y = 0), 끝점: (z = z0 + off + planeHeight, y = planeHeight)
                let sz = z0 + off;
                let sy = 0;
                let ez = sz + planeHeight;
                let ey = planeHeight;
                // 클리핑
                if (sz < z0) { const d = z0 - sz; sz = z0; sy = sy + d; }
                if (ez > z1) { const d = ez - z1; ez = z1; ey = ey - d; }
                if (sz < z1 && ez > z0 && sy < planeHeight && ey > 0) {
                  lines.push(
                    <NativeLine
                      key={`${key}-hatch-${i}`}
                      name="floor-finish-hatch"
                      points={[
                        [planeX, yOffset + sy, sz],
                        [planeX, yOffset + ey, ez],
                      ]}
                      color={hatchColor}
                      lineWidth={0.6}
                      opacity={0.6}
                      transparent
                      renderOrder={100001}
                      depthTest={false}
                    />
                  );
                }
              }
              return lines;
            };

            const leftX = xOffset + 0.001;
            const rightX = xOffset + width - 0.001;
            return (
              <>
                {showLeft && (
                  <>
                    {/* 좌측 단면: 배경 + 상단 경계선 + 해치 라인 */}
                    <mesh
                      position={[leftX, yOffset + planeHeight / 2, z0 + planeDepth / 2]}
                      rotation={[0, -Math.PI / 2, 0]}
                      renderOrder={50}
                    >
                      <planeGeometry args={[planeDepth, planeHeight]} />
                      <meshBasicMaterial color={bgColor} transparent opacity={0.2} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
                    </mesh>
                    <NativeLine
                      name="floor-finish-top"
                      points={[[leftX, yOffset + planeHeight, z0], [leftX, yOffset + planeHeight, z1]]}
                      color={hatchColor}
                      lineWidth={1}
                      renderOrder={100001}
                      depthTest={false}
                    />
                    {buildHatch(leftX, 'left')}
                  </>
                )}
                {showRight && (
                  <>
                    <mesh
                      position={[rightX, yOffset + planeHeight / 2, z0 + planeDepth / 2]}
                      rotation={[0, Math.PI / 2, 0]}
                      renderOrder={50}
                    >
                      <planeGeometry args={[planeDepth, planeHeight]} />
                      <meshBasicMaterial color={bgColor} transparent opacity={0.2} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
                    </mesh>
                    <NativeLine
                      name="floor-finish-top"
                      points={[[rightX, yOffset + planeHeight, z0], [rightX, yOffset + planeHeight, z1]]}
                      color={hatchColor}
                      lineWidth={1}
                      renderOrder={100001}
                      depthTest={false}
                    />
                    {buildHatch(rightX, 'right')}
                  </>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* 슬롯 바닥면 - 그린색으로 표시 - showAll이 true일 때만 */}
      {showAll && !spaceInfo.customGuideMode && !isLiveDimensionInspecting && (() => {
        // 내경 공간 계산 (ColumnGuides와 동일한 방식)
        const internalSpace = calculateInternalSpace(spaceInfo);
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const frontZ = mmToThreeUnits(internalSpace.depth / 2);
        const backZ = -frontZ;

        // ColumnIndexer와 동일한 방식으로 슬롯 경계 계산
        const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

        // 슬롯 시작과 끝 위치 계산 - zoneSlotInfo의 normal 영역 사용
        const slotStartX = mmToThreeUnits(zoneSlotInfo.normal.startX);
        const slotEndX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);

        const slotWidth = slotEndX - slotStartX;
        const slotCenterX = (slotStartX + slotEndX) / 2;

        // 좌우 프레임의 앞쪽 끝 위치 계산
        const frameEndZ = furnitureZOffset + furnitureDepth / 2;

        // 바닥면의 시작점(뒤쪽)과 끝점(프레임 앞쪽) 사이의 거리
        // 앞쪽에서 END_PANEL_THICKNESS 줄이기
        const floorDepth = frameEndZ - backZ - mmToThreeUnits(END_PANEL_THICKNESS);

        const columns = spaceInfo.columns || [];

        // 슬롯 가이드와 동일한 Y 위치 계산 (ColumnGuides와 일치시킴)
        // internalSpace.startY는 이미 받침대 높이를 포함하고 있음
        const floorY = mmToThreeUnits(internalSpace.startY) + (
          spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
            ? floatHeight
            : 0
        );

// console.log('🎯 Floor mesh Y calculation:', {
          // internalSpace_startY: internalSpace.startY,
          // baseFrameHeightMm,
          // floorFinishHeightMm,
          // floatHeight,
          // floorY,
          // baseConfig: spaceInfo.baseConfig,
          // panelStartY
        // });

        // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
        const hasDeepColumns = columns.some(column => column.depth >= 730);

        if (columns.length === 0 || !hasDeepColumns) {
          // 기둥이 없거나 모든 기둥이 729mm 이하면 바닥면 렌더링 안함 (SlotDropZonesSimple에서 처리)
          return null;
        }

        // 기둥이 있는 경우 분절된 바닥면들 렌더링
        const floorSegments: Array<{
          width: number;
          x: number;
        }> = [];

        // 전체 바닥면 범위 계산 - 슬롯 가이드 범위로 변경
        const floorStartX = slotStartX;
        const floorEndX = slotEndX;
        const floorCenterX = slotCenterX;

        // 기둥들을 X 위치 기준으로 정렬
        const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);

        let currentX = floorStartX;

        // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
        sortedColumns.forEach((column, index) => {
          const columnWidthM = column.width * 0.01; // mm to Three.js units
          const columnLeftX = column.position[0] - columnWidthM / 2;
          const columnRightX = column.position[0] + columnWidthM / 2;

          // 기둥이 바닥면 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
          if (columnLeftX < floorEndX && columnRightX > floorStartX && column.depth >= 730) {
            // 기둥 왼쪽 바닥면 세그먼트
            const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
            if (leftSegmentWidth > 0) {
              floorSegments.push({
                width: leftSegmentWidth,
                x: currentX + leftSegmentWidth / 2
              });
            }

            // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
            currentX = columnRightX;
          }
        });

        // 마지막 세그먼트 (마지막 기둥 오른쪽)
        const lastSegmentWidth = Math.max(0, floorEndX - currentX);
        if (lastSegmentWidth > 0) {
          floorSegments.push({
            width: lastSegmentWidth,
            x: currentX + lastSegmentWidth / 2
          });
        }

        // 분절된 바닥면들 렌더링 (분절이 없으면 기본 바닥면 렌더링)
        if (floorSegments.length === 0) {
          return (
            <mesh
              position={[
                floorCenterX,
                floorY,
                backZ + floorDepth / 2  // 바닥면의 중심점을 backZ에서 프레임 앞쪽까지의 중앙에 배치
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow={shadowEnabled}
              renderOrder={-1}
            >
              <planeGeometry args={[slotWidth, floorDepth]} />
              <meshStandardMaterial
                color={colors.primary}
                transparent={true}
                opacity={0.4}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        }

        // 분절된 바닥면도 렌더링 안함 (SlotDropZonesSimple에서 처리)
        return null;
      })()}

      {/* 프레임 렌더링 디버그 */}
      {/* spaceInfo.surroundType === 'no-surround' && ... console.log('🔍 프레임 렌더링 체크:', { ... }) */}

      {/* 왼쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {(() => {
        const willRender = showFrame && frameThickness.left > 0;
        const elementType = !wallConfig?.left ? '엔드패널' : '프레임';

        if (willRender && spaceInfo.installType === 'semistanding') {
// console.log('🔴🔴🔴 [렌더링됨] 왼쪽 ' + elementType);
        }

// console.log('🔴🔴🔴 [한쪽벽모드] 왼쪽 프레임/엔드패널 렌더링 체크:', {
          // showFrame,
          // frameThicknessLeft: frameThickness.left,
          // frameThicknessLeftMm: frameThicknessMm.left,
          // condition: showFrame && frameThickness.left > 0,
          // surroundType: spaceInfo.surroundType,
          // installType: spaceInfo.installType,
          // wallConfigLeft: wallConfig?.left,
          // wallConfigRight: wallConfig?.right,
          // '렌더링여부': willRender,
          // '예상타입': elementType,
          // hasLeftFurniture
        // });

        return null;
      })()}
      {/* console.log('🚨 왼쪽 엔드패널 렌더링 직전 체크:', { ... }) */}
      {effectiveShowFrame && frameThickness.left > 0 && (spaceInfo.surroundType !== 'no-surround') && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (() => {
// console.log('🔥🔥🔥 [좌측 프레임/엔드패널 메인 렌더링 블록]', {
          // surroundType: spaceInfo.surroundType,
          // wallConfigLeft: wallConfig?.left,
          // isEndPanel: !wallConfig?.left
        // });
        // 자유배치 커튼박스가 이 쪽(좌측)에 있으면 프레임 불필요 (커튼박스에 패널이 있음)
        // 슬롯배치에서는 커튼박스와 단내림이 별도이므로 단내림 있어도 프레임 필요
        if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.position === 'left' && isFreePlacement) {
          return null;
        }
        // 슬롯배치 커튼박스만 좌측: 기존 엔드패널 유지 (커튼박스 마감은 별도 블록에서 전면+경계면만 추가)

        // 단내림 관련 변수
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
        const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
        const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
          ? spaceInfo.droppedCeiling.dropHeight || 200
          : 0;
        const droppedCeilingHeight = mmToThreeUnits(dropHeight);

        // stepCeiling 단내림 관련 변수
        const hasLeftStepCeiling = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'left';
        const stepDropHeight = hasLeftStepCeiling ? (spaceInfo.stepCeiling!.dropHeight || 200) : 0;
        const stepDropH = mmToThreeUnits(stepDropHeight);

        if (hasLeftStepCeiling) {
          const droppedH = adjustedPanelHeight - stepDropH; // 단내림 천장까지의 높이
          const droppedCY = sideFrameStartY + droppedH / 2;
          const upperH = stepDropH; // 단내림 천장 ~ 메인 천장
          const upperCY = sideFrameStartY + droppedH + upperH / 2;
          const stepFrameXL = xOffset + frameRenderThickness.left / 2;

          return (
            <>
              {/* 단내림 구간 프레임 (바닥 ~ 단내림 천장) */}
              <BoxWithEdges
                hideEdges={hideEdges}
                isOuterFrame
                name="left-surround-ep"
                key={`left-step-dropped-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                isEndPanel={!wallConfig?.left}
                args={[
                  frameRenderThickness.left,
                  droppedH,
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.left ? mmToThreeUnits(END_PANEL_THICKNESS) : noSurroundEndPanelDepth)
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                      ? surroundEndPanelDepth : mmToThreeUnits(END_PANEL_THICKNESS))
                ]}
                position={[
                  spaceInfo.surroundType === 'no-surround'
                    ? (indexingForCheck.threeUnitBoundaries.length > 0
                      ? indexingForCheck.threeUnitBoundaries[0] + frameRenderThickness.left / 2
                      : stepFrameXL)
                    : stepFrameXL,
                  droppedCY,
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.left
                      ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
                      : noSurroundEndPanelZ)
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                      ? surroundEndPanelZ
                      : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2)
                ]}
                material={leftFrameMaterial ?? createFrameMaterial('left')}
                renderMode={renderMode}
                shadowEnabled={shadowEnabled}
                excludeKey={`${leftMostModuleId}::left-surround-ep`}
                excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
              />
              {/* 상부 구간 프레임 (단내림 천장 ~ 메인 천장) - 서라운드 모드에서는 생략 */}
              {spaceInfo.surroundType !== 'surround' && (
                <BoxWithEdges
                  hideEdges={hideEdges}
                  isOuterFrame
                  isEndPanel={!wallConfig?.left}
                  args={[
                    frameRenderThickness.left,
                    upperH,
                    spaceInfo.surroundType === 'no-surround'
                      ? (wallConfig?.left ? mmToThreeUnits(END_PANEL_THICKNESS) : noSurroundEndPanelDepth)
                      : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                        (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? surroundEndPanelDepth : mmToThreeUnits(END_PANEL_THICKNESS))
                  ]}
                  position={[
                    spaceInfo.surroundType === 'no-surround'
                      ? (indexingForCheck.threeUnitBoundaries.length > 0
                        ? indexingForCheck.threeUnitBoundaries[0] + frameRenderThickness.left / 2
                        : stepFrameXL)
                      : stepFrameXL,
                    upperCY,
                    spaceInfo.surroundType === 'no-surround'
                      ? (wallConfig?.left
                        ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
                        : noSurroundEndPanelZ)
                      : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                        (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? surroundEndPanelZ
                        : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2)
                  ]}
                  material={leftFrameMaterial ?? createFrameMaterial('left')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                  excludeKey={`${leftMostModuleId}::left-surround-ep`}
                  excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                />
              )}
            </>
          );
        }

        // 왼쪽이 단내림 영역인 경우 두 부분으로 나누어 렌더링
        if (hasDroppedCeiling && isLeftDropped) {
          // 단내림+커튼박스 동시 활성 & 같은 쪽(좌측): CB 마감패널이 좌측 프레임 역할 → 좌측 프레임 생략
          if (isCurtainBoxSlot && spaceInfo.curtainBox?.position === 'left') {
            return null;
          }

          // 슬롯배치에서 커튼박스만 있고 단내림 없으면 여기 도달하지 않음
          // 단내림+커튼박스 동시 활성시 단내림은 정상 렌더링

          // 서라운드 모드에서도 단내림 프레임 렌더링 (띄움높이 반영)

          // 노서라운드 모드에서만 가구 여부로 엔드패널 렌더링 결정
          if (spaceInfo.surroundType === 'no-surround') {
            // 단내림 구간에 가구가 없으면 엔드패널 렌더링 생략
            if (!hasDroppedZoneFurniture) {
// console.log('🚫 [노서라운드] 왼쪽 단내림 엔드패널 렌더링 생략 (단내림 구간에 가구 없음)');
              return null;
            }

            // 단내림 구간은 독립적으로 엔드패널 필요
            // 단내림 구간에 가구가 있으면 무조건 바깥쪽 끝에 엔드패널 렌더링
            // (메인 구간 가구 여부와 무관)
          }

          const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
          const droppedFrameHeight = droppedHeight - floatHeight;
          const droppedCenterY = panelStartY + floatHeight + droppedFrameHeight / 2;
          const upperPartHeight = height - droppedHeight;
          const upperPartCenterY = panelStartY + droppedHeight + upperPartHeight / 2;

// console.log('🔥 [단내림 왼쪽 프레임] panelStartY:', panelStartY, 'floatHeight:', floatHeight, 'droppedHeight:', droppedHeight, 'droppedFrameHeight:', droppedFrameHeight, 'droppedCenterY:', droppedCenterY);
// console.log('✅✅✅ [단내림 왼쪽] 프레임 렌더링 시작');

          // 단내림 영역 렌더링 카운터
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.left) {
              window.renderCounter.leftEndPanel++;
// console.log('🚨🚨🚨 [단내림] 왼쪽 엔드패널 렌더링!', window.renderCounter.leftEndPanel, '번째');
            } else {
              window.renderCounter.leftFrame++;
// console.log('🚨🚨🚨 [단내림] 왼쪽 프레임 렌더링!', window.renderCounter.leftFrame, '번째');
            }
          }


          return (
            <>
              {/* 단내림 영역 프레임/엔드패널 */}
              <BoxWithEdges
                hideEdges={hideEdges}
                isOuterFrame
                name="left-surround-ep"
                key={`left-dropped-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                isEndPanel={!wallConfig?.left} // 왼쪽 벽이 없으면 엔드패널
                args={[
                  frameRenderThickness.left,
                  // 단내림 구간 프레임 높이 (띄움배치 시 floatHeight 제외)
                  droppedFrameHeight,
                  // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.left
                      ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                      : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                      ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 깊이
                      : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
                ]}
                position={[
                  // 서라운드 모드에서는 가구 배치 여부와 관계없이 엔드패널 위치 고정
                  // 노서라운드 모드에서만 가구가 있을 때 가구 옆에 붙여서 렌더링
                  (spaceInfo.surroundType !== 'surround' && hasLeftFurniture && indexingForCheck.threeUnitBoundaries.length > 0)
                    ? indexingForCheck.threeUnitBoundaries[0] - frameRenderThickness.left
                    : xOffset + frameRenderThickness.left / 2,
                  // 단내림 구간 중심 (띄움높이와 단내림높이 반영)
                  droppedCenterY,
                  // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.left
                      ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
                      : noSurroundEndPanelZ)  // 벽이 없는 경우: 공간 뒷벽과 가구 앞면-20mm의 중심
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                      ? surroundEndPanelZ  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                      : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2)
                ]}
                material={leftFrameMaterial ?? createFrameMaterial('left')}
                renderMode={renderMode}
                shadowEnabled={shadowEnabled}
                excludeKey={`${leftMostModuleId}::left-surround-ep`}
                excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
              />
              {/* 상부 영역 프레임 (천장까지) - 서라운드는 이미 전체 높이이므로 생략 */}
              {spaceInfo.surroundType !== 'surround' && (
                <BoxWithEdges
                  hideEdges={hideEdges}
                  isOuterFrame
                  name="left-surround-ep"
                  isEndPanel={!wallConfig?.left} // 왼쪽 벽이 없으면 엔드패널
                  args={[
                    frameRenderThickness.left,
                    upperPartHeight, // 상부 구간 높이
                    // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                    spaceInfo.surroundType === 'no-surround'
                      ? (wallConfig?.left
                        ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                        : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                      : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                        (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                        : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
                  ]}
                  position={[
                    // 서라운드 모드에서는 가구 배치 여부와 관계없이 엔드패널 위치 고정
                    // 노서라운드 모드에서만 가구가 있을 때 가구 옆에 붙여서 렌더링
                    (spaceInfo.surroundType !== 'surround' && hasLeftFurniture && indexingForCheck.threeUnitBoundaries.length > 0)
                      ? indexingForCheck.threeUnitBoundaries[0] - frameRenderThickness.left
                      : xOffset + frameRenderThickness.left / 2,
                    upperPartCenterY, // 상부 구간 중심
                    // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                    spaceInfo.surroundType === 'no-surround'
                      ? (wallConfig?.left
                        ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
                        : noSurroundEndPanelZ)  // 벽이 없는 경우: 공간 뒷벽과 가구 앞면-20mm의 중심
                      : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                        (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? surroundEndPanelZ  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                        : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2)
                  ]}
                  material={leftFrameMaterial ?? createFrameMaterial('left')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                  excludeKey={`${leftMostModuleId}::left-surround-ep`}
                  excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                />
              )}
            </>
          );
        }

        // 일반 구간 (단내림이 아닌 경우에만 렌더링)
        // 단내림 구간에서는 이미 위에서 return했으므로 여기 도달하지 않음
        // 하지만 명시적으로 체크하여 중복 방지
        if (!(hasDroppedCeiling && isLeftDropped)) {
// console.log('🔍 왼쪽 엔드패널 렌더링 디버그:', {
            // frameThicknessLeft: frameThickness.left,
            // wallConfigLeft: wallConfig?.left,
            // surroundType: spaceInfo.surroundType,
            // installType: spaceInfo.installType,
            // hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled,
            // 깊이: wallConfig?.left ? '프레임(18mm)' : '엔드패널(전체깊이-18mm)',
            // 위치: wallConfig?.left ? '프레임위치' : '엔드패널위치'
          // });

          // 렌더링 카운터 증가
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.left) {
              window.renderCounter.leftEndPanel++;
// console.log('🚨🚨🚨 [일반] 왼쪽 엔드패널 렌더링!', window.renderCounter.leftEndPanel, '번째');
            } else {
              window.renderCounter.leftFrame++;
// console.log('🚨🚨🚨 [일반] 왼쪽 프레임 렌더링!', window.renderCounter.leftFrame, '번째');
            }
          }
        }

// console.log('❓❓❓ [왼쪽 일반 구간] 렌더링 여부:', !(hasDroppedCeiling && isLeftDropped), 'hasDroppedCeiling:', hasDroppedCeiling, 'isLeftDropped:', isLeftDropped);
        // 좌측 최외곽 가구의 섹션 depth 변화 반영 (가구 기본 깊이 기준으로 "줄어든 만큼" 뒤로)
        const leftEdgeMod = placedModulesFromStore.find((pm) => pm.id === leftMostModuleId);
        const leftEdgeZOffset = computeDepthZOffset(leftEdgeMod, 'any');

        const leftPosition: [number, number, number] = [
          // X 위치
          spaceInfo.surroundType === 'no-surround'
            ? (indexingForCheck.threeUnitBoundaries.length > 0
              ? indexingForCheck.threeUnitBoundaries[0] + frameRenderThickness.left / 2
              : xOffset + frameRenderThickness.left / 2)
            : xOffset + frameRenderThickness.left / 2,
          // Y 위치
          sideFrameCenterY,
          // Z 위치
          spaceInfo.surroundType === 'no-surround'
            ? (wallConfig?.left
              ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3) + leftEdgeZOffset
              : noSurroundEndPanelZ)
            : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
              (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
              ? surroundEndPanelZ
              : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + leftEdgeZOffset)
        ];
        if (hasDroppedCeiling && isLeftDropped) return null;

        const leftFrameDepth = spaceInfo.surroundType === 'no-surround'
          ? (wallConfig?.left ? mmToThreeUnits(END_PANEL_THICKNESS) : noSurroundEndPanelDepth)
          : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
            (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
            ? surroundEndPanelDepth : mmToThreeUnits(END_PANEL_THICKNESS));
        const leftFrameMat = leftFrameMaterial ?? createFrameMaterial('left');

        // 분절 모드: 좌측 최외곽이 upper/lower만 (full 없음) → 각 가구 높이/Z/깊이에 맞춰 프레임 조각들
        if (isLeftFrameSplit && spaceInfo.surroundType !== 'no-surround') {
          return (
            <>
              {leftOuterMods.map((om, idx) => {
                const frontHeightMm = om.frontHeightMm ?? om.heightMm;
                const frontBottomMm = om.frontBottomMm ?? om.bottomMm;
                const segH = mmToThreeUnits(frontHeightMm);
                const segCY = panelStartY + mmToThreeUnits(frontBottomMm) + segH / 2;
                // 기본 Z(표준 600mm 깊이 가구 도어 앞면 기준)에서, 가구 깊이 차이만큼 뒤로 이동
                const refDepthMm = 600;
                const depthDiff = mmToThreeUnits(refDepthMm - om.depthMm);
                const segCZ = leftPosition[2] - depthDiff;
                return (
                  <BoxWithEdges
                    key={`left-frame-split-${idx}-${om.category}-${Math.round(frontHeightMm)}-${Math.round(frontBottomMm)}-${Math.round(om.depthMm)}-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                    hideEdges={hideEdges}
                    isOuterFrame
                    name="left-surround-ep"
                    isEndPanel={!wallConfig?.left}
                    args={[frameRenderThickness.left, segH, leftFrameDepth]}
                    position={[leftPosition[0], segCY, segCZ]}
                    material={leftFrameMat}
                    renderMode={renderMode}
                    shadowEnabled={shadowEnabled}
                    excludeKey={`${leftMostModuleId}::left-surround-ep`}
                    excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                  />
                );
              })}
            </>
          );
        }

        return (
          <BoxWithEdges
            hideEdges={hideEdges}
            isOuterFrame
            name="left-surround-ep"
            key={`left-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
            isEndPanel={!wallConfig?.left}
            args={[frameRenderThickness.left, adjustedPanelHeight, leftFrameDepth]}
            position={leftPosition}
            material={leftFrameMat}
            renderMode={renderMode}
            shadowEnabled={shadowEnabled}
            excludeKey={`${leftMostModuleId}::left-surround-ep`}
            excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
          />
        );
      })()}


      {/* 오른쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {(() => {
        const willRender = showFrame && frameThickness.right > 0;
        const elementType = !wallConfig?.right ? '엔드패널' : '프레임';

        if (willRender && spaceInfo.installType === 'semistanding') {
// console.log('🔵🔵🔵 [렌더링됨] 오른쪽 ' + elementType);
        }

// console.log('🔵🔵🔵 [한쪽벽모드] 오른쪽 프레임/엔드패널 렌더링 체크:', {
          // showFrame,
          // frameThicknessRight: frameThickness.right,
          // frameThicknessRightMm: frameThicknessMm.right,
          // condition: showFrame && frameThickness.right > 0,
          // surroundType: spaceInfo.surroundType,
          // installType: spaceInfo.installType,
          // wallConfigLeft: wallConfig?.left,
          // wallConfigRight: wallConfig?.right,
          // '렌더링여부': willRender,
          // '예상타입': elementType,
          // hasRightFurniture
        // });

        return null;
      })()}
      {(() => {
        const condition1 = showFrame && frameThickness.right > 0;
        const condition2 = (spaceInfo.surroundType !== 'no-surround' || spaceInfo.installType === 'freestanding' || hasRightFurniture);
        const condition3 = !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right'));
        const finalCondition = condition1 && condition2 && condition3;
// console.log('🔵🔵🔵 [오른쪽 프레임 렌더링 조건 체크]', {
          // condition1_showFrame_thickness: condition1,
          // condition2_surroundOrFreestandingOrFurniture: condition2,
          // condition3_not2DSide: condition3,
          // finalCondition,
          // showFrame,
          // frameThicknessRight: frameThickness.right,
          // surroundType: spaceInfo.surroundType,
          // installType: spaceInfo.installType,
          // hasRightFurniture,
          // viewMode,
          // view2DDirection
        // });
        return null;
      })()}
      {effectiveShowFrame && frameThickness.right > 0 && (spaceInfo.surroundType !== 'no-surround') && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (() => {
        // 자유배치 커튼박스가 이 쪽(우측)에 있으면 프레임 불필요
        if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.position === 'right' && isFreePlacement) {
          return null;
        }
        // 슬롯배치 커튼박스만 우측: 기존 엔드패널 유지 (커튼박스 마감은 별도 블록에서 전면+경계면만 추가)

        // 단내림 여부 확인
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
        const isRightDropped = hasDroppedCeiling && spaceInfo.droppedCeiling?.position === 'right';
        const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
          ? spaceInfo.droppedCeiling.dropHeight || 200
          : 0;
        const droppedCeilingHeight = mmToThreeUnits(dropHeight);

        // stepCeiling 단내림 관련 변수
        const hasRightStepCeiling = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'right';
        const stepDropHeightR = hasRightStepCeiling ? (spaceInfo.stepCeiling!.dropHeight || 200) : 0;
        const stepDropHR = mmToThreeUnits(stepDropHeightR);

        if (hasRightStepCeiling) {

          const droppedH = adjustedPanelHeight - stepDropHR; // 단내림 천장까지의 높이
          const droppedCY = sideFrameStartY + droppedH / 2;
          const upperH = stepDropHR; // 단내림 천장 ~ 메인 천장
          const upperCY = sideFrameStartY + droppedH + upperH / 2;
          const stepFrameX = xOffset + width - frameRenderThickness.right / 2;

          return (
            <>
              {/* 단내림 구간 프레임 (바닥 ~ 단내림 천장) */}
              <BoxWithEdges
                hideEdges={hideEdges}
                isOuterFrame
                name="right-surround-ep"
                key={`right-step-dropped-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                isEndPanel={!wallConfig?.right}
                args={[
                  frameRenderThickness.right,
                  droppedH,
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.right ? mmToThreeUnits(END_PANEL_THICKNESS) : noSurroundEndPanelDepth)
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                      ? surroundEndPanelDepth : mmToThreeUnits(END_PANEL_THICKNESS))
                ]}
                position={[
                  spaceInfo.surroundType === 'no-surround'
                    ? (indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
                      ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] - frameRenderThickness.right / 2
                      : stepFrameX)
                    : (hasRightFurniture && indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
                      ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] + frameRenderThickness.right
                      : stepFrameX),
                  droppedCY,
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.right
                      ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
                      : noSurroundEndPanelZ)
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                      ? surroundEndPanelZ
                      : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2)
                ]}
                material={rightFrameMaterial ?? createFrameMaterial('right')}
                renderMode={renderMode}
                shadowEnabled={shadowEnabled}
                excludeKey={`${rightMostModuleId}::right-surround-ep`}
                excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
              />
              {/* 상부 구간 프레임 (단내림 천장 ~ 메인 천장) - 서라운드 모드에서는 생략 */}
              {spaceInfo.surroundType !== 'surround' && (
                <BoxWithEdges
                  hideEdges={hideEdges}
                  isOuterFrame
                  name="right-surround-ep"
                  isEndPanel={!wallConfig?.right}
                  args={[
                    frameRenderThickness.right,
                    upperH,
                    spaceInfo.surroundType === 'no-surround'
                      ? (wallConfig?.right ? mmToThreeUnits(END_PANEL_THICKNESS) : noSurroundEndPanelDepth)
                      : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                        (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? surroundEndPanelDepth : mmToThreeUnits(END_PANEL_THICKNESS))
                  ]}
                  position={[
                    spaceInfo.surroundType === 'no-surround'
                      ? (indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
                        ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] - frameRenderThickness.right / 2
                        : stepFrameX)
                      : (hasRightFurniture && indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
                        ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] + frameRenderThickness.right
                        : stepFrameX),
                    upperCY,
                    spaceInfo.surroundType === 'no-surround'
                      ? (wallConfig?.right
                        ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
                        : noSurroundEndPanelZ)
                      : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                        (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? surroundEndPanelZ
                        : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2)
                  ]}
                  material={rightFrameMaterial ?? createFrameMaterial('right')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                  excludeKey={`${rightMostModuleId}::right-surround-ep`}
                  excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                />
              )}
            </>
          );
        }

        // 오른쪽이 단내림 영역인 경우
        if (hasDroppedCeiling && isRightDropped) {
          // 단내림+커튼박스 동시 활성 & 같은 쪽(우측): CB 마감패널이 우측 프레임 역할 → 우측 프레임 생략
          if (isCurtainBoxSlot && spaceInfo.curtainBox?.position === 'right') {
            return null;
          }

          // 서라운드 모드에서도 단내림 프레임 렌더링 (띄움높이 반영)

          // 노서라운드 모드에서만 가구 여부로 엔드패널 렌더링 결정
          if (spaceInfo.surroundType === 'no-surround') {
            // 단내림 구간에 가구가 없으면 엔드패널 렌더링 생략
            if (!hasDroppedZoneFurniture) {
// console.log('🚫 [노서라운드] 오른쪽 단내림 엔드패널 렌더링 생략 (단내림 구간에 가구 없음)');
              return null;
            }

            // 단내림 구간은 독립적으로 엔드패널 필요
            // 단내림 구간에 가구가 있으면 무조건 바깥쪽 끝에 엔드패널 렌더링
            // (메인 구간 가구 여부와 무관)
          }

          const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
          const droppedFrameHeight = droppedHeight - floatHeight;
          const droppedCenterY = panelStartY + floatHeight + droppedFrameHeight / 2;
          const upperPartHeight = droppedCeilingHeight;
          const upperPartCenterY = panelStartY + height - upperPartHeight / 2;

// console.log('🔥 [단내림 오른쪽 프레임] panelStartY:', panelStartY, 'floatHeight:', floatHeight, 'droppedHeight:', droppedHeight, 'droppedFrameHeight:', droppedFrameHeight, 'droppedCenterY:', droppedCenterY);
// console.log('🎯 [단내림 오른쪽 프레임 args] frameThickness.right:', frameThickness.right, 'droppedFrameHeight:', droppedFrameHeight);
// console.log('✅✅✅ [단내림 오른쪽] 프레임 렌더링 시작 - 이 다음에는 일반 구간이 렌더링되면 안됨!');

          // 단내림 구간의 경계 위치 계산
          const droppedZone = indexingForCheck.zones?.dropped;
          const droppedBoundaries = droppedZone?.threeUnitPositions || [];
          const droppedStartSlot = droppedZone?.startSlotIndex ?? 0;
          const droppedLastSlot = droppedStartSlot + (droppedZone?.columnCount ?? 1) - 1;

          // 단내림 구간 오른쪽 끝 가구 위치 찾기
          const droppedRightFurniture = placedModulesFromStore.find(m => {
            const isDual = m.isDualSlot || m.moduleId?.includes('dual-');
            if (m.zone !== 'dropped') return false;
            // 오른쪽 끝 = dropped zone의 마지막 슬롯 또는 마지막-1 슬롯(듀얼)
            return m.slotIndex === droppedLastSlot || (isDual && m.slotIndex === droppedLastSlot - 1);
          });

          // 엔드패널 X 위치: 가구가 있으면 가구 오른쪽 끝에 붙임
          let endPanelX = xOffset + width - frameRenderThickness.right / 2; // 기본값: 공간 끝

          // 서라운드 모드에서는 가구 배치 여부와 관계없이 엔드패널 위치 고정
          if (droppedRightFurniture && spaceInfo.surroundType !== 'surround') {
            const furnitureX = droppedRightFurniture.position.x;
            // customWidth는 placement 시 설정된 값, FurnitureItem에서 18mm 더 줄어듬
            const customWidthMm = droppedRightFurniture.customWidth ?? (droppedZone?.columnWidth ?? 0);
            const actualFurnitureWidth = (customWidthMm - END_PANEL_THICKNESS) * 0.01; // 실제 렌더링 너비

            // 엔드패널 왼쪽 끝 = 가구 오른쪽 끝
            const furnitureRightEdge = furnitureX + actualFurnitureWidth / 2;

            // 엔드패널 중심 = 가구 오른쪽 끝 (엔드패널은 가구 바로 옆에 붙음, 두께/2 더하지 않음)
            endPanelX = furnitureRightEdge;

// console.log('🔍 엔드패널 X 계산:', {
              // customWidthMm,
              // actualFurnitureWidth,
              // furnitureX,
              // furnitureRightEdge,
              // endPanelX
            // });
          }

// console.log('🔍 단내림 오른쪽 엔드패널 위치 계산:', {
            // droppedZone,
            // droppedBoundaries,
            // droppedStartSlot,
            // droppedLastSlot,
            // droppedRightFurniture: droppedRightFurniture ? {
              // slotIndex: droppedRightFurniture.slotIndex,
              // positionX: droppedRightFurniture.position.x,
              // customWidth: droppedRightFurniture.customWidth
            // } : null,
            // endPanelX,
            // hasRightFurniture
          // });

          // 단내림 영역 렌더링 카운터
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.right) {
              window.renderCounter.rightEndPanel++;
// console.log('🚨🚨🚨 [단내림] 오른쪽 엔드패널 렌더링!', window.renderCounter.rightEndPanel, '번째');
            } else {
              window.renderCounter.rightFrame++;
// console.log('🚨🚨🚨 [단내림] 오른쪽 프레임 렌더링!', window.renderCounter.rightFrame, '번째');
            }
          }

          return (
            <>
              {/* 단내림 영역 프레임/엔드패널 */}
              <BoxWithEdges
                hideEdges={hideEdges}
                isOuterFrame
                name="right-surround-ep"
                key={`right-dropped-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                isEndPanel={!wallConfig?.right} // 오른쪽 벽이 없으면 엔드패널
                args={[
                  frameRenderThickness.right,
                  // 단내림 구간 프레임 높이 (띄움배치 시 floatHeight 제외)
                  droppedFrameHeight,
                  // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.right
                      ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                      : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                      ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 깊이
                      : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
                ]}
                position={(() => {
                  const pos: [number, number, number] = [
                    // 가구 오른쪽 끝에 붙임
                    endPanelX,
                    // 단내림 구간 중심 Y
                    droppedCenterY,
                    // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                    spaceInfo.surroundType === 'no-surround'
                      ? (wallConfig?.right
                        ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
                        : noSurroundEndPanelZ)  // 벽이 없는 경우: 공간 뒷벽과 가구 앞면-20mm의 중심
                      : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                        (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? surroundEndPanelZ  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                        : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2)
                  ];
                  return pos;
                })()}
                material={rightFrameMaterial ?? createFrameMaterial('right')}
                renderMode={renderMode}
                shadowEnabled={shadowEnabled}
                excludeKey={`${rightMostModuleId}::right-surround-ep`}
                excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
              />
            </>
          );
        }

        // 일반 구간 (단내림이 아닌 경우에만 렌더링)
        // 단내림 구간에서는 이미 위에서 return했으므로 여기 도달하지 않음
        // 하지만 명시적으로 체크하여 중복 방지
// console.log('❓❓❓ [일반 구간 체크] hasDroppedCeiling:', hasDroppedCeiling, 'isRightDropped:', isRightDropped, '렌더링여부:', !(hasDroppedCeiling && isRightDropped));
        if (!(hasDroppedCeiling && isRightDropped)) {
          // 렌더링 카운터 증가
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.right) {
              window.renderCounter.rightEndPanel++;
// console.log('🚨🚨🚨 [일반] 오른쪽 엔드패널 렌더링!', window.renderCounter.rightEndPanel, '번째');
            } else {
              window.renderCounter.rightFrame++;
// console.log('🚨🚨🚨 [일반] 오른쪽 프레임 렌더링!', window.renderCounter.rightFrame, '번째');
            }
          }
        } else {
// console.log('🛑🛑🛑 [일반 구간 스킵] 단내림이 오른쪽이므로 일반 구간 렌더링 건너뜀');
        }

        if (hasDroppedCeiling && isRightDropped) return null;

        const rightFrameDepth = spaceInfo.surroundType === 'no-surround'
          ? (wallConfig?.right ? mmToThreeUnits(END_PANEL_THICKNESS) : noSurroundEndPanelDepth)
          : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
            (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
            ? surroundEndPanelDepth : mmToThreeUnits(END_PANEL_THICKNESS));
        const rightFrameX = spaceInfo.surroundType === 'no-surround'
          ? (indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
            ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] - frameRenderThickness.right / 2
            : xOffset + width - frameRenderThickness.right / 2)
          : (hasRightFurniture && indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
            ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] + frameRenderThickness.right
            : xOffset + width - frameRenderThickness.right / 2);
        // 우측 최외곽 가구의 섹션 depth 변화 반영
        const rightEdgeMod = placedModulesFromStore.find((pm) => pm.id === rightMostModuleId);
        const rightEdgeZOffset = computeDepthZOffset(rightEdgeMod, 'any');
        const rightFrameZ = spaceInfo.surroundType === 'no-surround'
          ? (wallConfig?.right
            ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3) + rightEdgeZOffset
            : noSurroundEndPanelZ)
          : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
            (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
            ? surroundEndPanelZ
            : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + rightEdgeZOffset);
        const rightFrameMat = rightFrameMaterial ?? createFrameMaterial('right');

        // 분절 모드: 우측 최외곽이 upper/lower만 → 각 가구 높이/Z/깊이에 맞춰 프레임 조각들
        if (isRightFrameSplit && spaceInfo.surroundType !== 'no-surround') {
          return (
            <>
              {rightOuterMods.map((om, idx) => {
                const frontHeightMm = om.frontHeightMm ?? om.heightMm;
                const frontBottomMm = om.frontBottomMm ?? om.bottomMm;
                const segH = mmToThreeUnits(frontHeightMm);
                const segCY = panelStartY + mmToThreeUnits(frontBottomMm) + segH / 2;
                const refDepthMm = 600;
                const depthDiff = mmToThreeUnits(refDepthMm - om.depthMm);
                const segCZ = rightFrameZ - depthDiff;
                return (
                  <BoxWithEdges
                    key={`right-frame-split-${idx}-${om.category}-${Math.round(frontHeightMm)}-${Math.round(frontBottomMm)}-${Math.round(om.depthMm)}-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                    hideEdges={hideEdges}
                    isOuterFrame
                    name="right-surround-ep"
                    isEndPanel={!wallConfig?.right}
                    args={[frameRenderThickness.right, segH, rightFrameDepth]}
                    position={[rightFrameX, segCY, segCZ]}
                    material={rightFrameMat}
                    renderMode={renderMode}
                    shadowEnabled={shadowEnabled}
                    excludeKey={`${rightMostModuleId}::right-surround-ep`}
                    excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                  />
                );
              })}
            </>
          );
        }

        return (
          <BoxWithEdges
            hideEdges={hideEdges}
            isOuterFrame
            name="right-surround-ep"
            key={`right-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
            isEndPanel={!wallConfig?.right}
            args={[frameRenderThickness.right, adjustedPanelHeight, rightFrameDepth]}
            position={[rightFrameX, sideFrameCenterY, rightFrameZ]}
            material={rightFrameMat}
            renderMode={renderMode}
            shadowEnabled={shadowEnabled}
            excludeKey={`${rightMostModuleId}::right-surround-ep`}
            excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
          />
        );
      })()}


      {/* 상단 패널 - ㄱ자 모양으로 구성 */}
      {/* 수평 상단 프레임 - 좌우 프레임 사이에만 배치 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 노서라운드 모드에서는 전체 너비로 확장하지만 좌우 프레임이 없을 때만 표시 */}
      {/* 상단 몰딩 - 균등분할: 전체 너비, 자유배치: 가구별 세그먼트 */}
      {effectiveShowFrame && !(viewMode === '2D' && view2DDirection === 'top') && (() => {
        // 슬롯배치: 가구가 하나도 없으면 상단몰딩 렌더링 안 함
        if (!isFreePlacement && placedModulesFromStore.filter(m => !m.isSurroundPanel).length === 0) return null;
        // 자유배치 모드: 가구별 세그먼트로 상단 몰딩 렌더링
        if (isFreePlacement) {
          const topStripGroups = computeTopStripGroups(placedModulesFromStore);

          // 자유배치 모듈의 X 범위를 직접 계산 (topStripGroups와 독립적)
          const freeModules = placedModulesFromStore.filter(m => m.isFreePlacement);
          const allModuleBounds = freeModules.map(m => getModuleBoundsX(m));
          const hasFreeMods = allModuleBounds.length > 0;
          const minLeftMM = hasFreeMods ? Math.min(...allModuleBounds.map(b => b.left)) : 0;
          const maxRightMM = hasFreeMods ? Math.max(...allModuleBounds.map(b => b.right)) : 0;

          // 서라운드와 상걸래받이 각각 독립적으로 도어기준 적용
          const DOOR_FRONT_OFFSET_MM = 20;
          const surroundDoorOffset = spaceInfo.surroundOffsetBase === 'door'
            ? mmToThreeUnits(DOOR_FRONT_OFFSET_MM)
            : 0;
          const freeSlotTopZPosition = isFullSurround
            ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
            : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 -
              mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo));
          const surroundBaseZPosition = isFullSurround
            ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3)
            : freeSlotTopZPosition;
          const surroundZPosition = surroundBaseZPosition + surroundDoorOffset;

          return (
            <>
              {/* 상단 몰딩 스트립 — 개별 가구의 hasTopFrame에 따라 렌더링 */}
              {(() => {
                // 모든 세그먼트를 수집
                const allTopSegments: (FrameRenderSegment & { key: string })[] = [];
                const topSurrMat = topFrameMaterial ?? createFrameMaterial('top');

                topStripGroups.forEach((group) => {
                  const internalSpaceHeight = calculateInternalSpace(spaceInfo).height;
                  const floatHeightForFrame = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
                    ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
                  const ceilingToBaseTopMM = internalSpaceHeight + topBottomFrameHeightMm - floatHeightForFrame;
                  group.modules.filter((mod) => {
                    if (((mod as any).placementWall || 'front') !== 'front') return false;
                    if (mod.hasTopFrame === false) return false;
                    // 하부장 모듈은 상단몰딩 불필요
                    if (getModuleCategory(mod) === 'lower') return false;
                    // Insert 프레임은 상걸래받이 불필요 (자유배치/단내림 자유배치 포함)
                    if (mod.moduleId?.includes('insert-frame')) return false;
                    const isSideViewLocal = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');
                    if (isSideViewLocal && selectedSlotIndex !== null && mod.slotIndex !== undefined) {
                      const isDual = mod.isDualSlot || mod.moduleId?.includes('dual-');
                      if (isDual) {
                        if (mod.slotIndex !== selectedSlotIndex && mod.slotIndex + 1 !== selectedSlotIndex) return false;
                      } else {
                        if (mod.slotIndex !== selectedSlotIndex) return false;
                      }
                    }
                    return true;
                  }).forEach((mod) => {
                    const bounds = getModuleBoundsX(mod);
                    // 기둥 회피로 인한 adjustedWidth/adjustedPosition 반영 (슬롯배치)
                    // 단, 기둥 앞 배치(front) 모드는 슬롯 전체 너비/슬롯 중심으로 복원
                    const isFrontMode = (mod as any).columnPlacementMode === 'front';
                    const adjW = (mod as any).adjustedWidth;
                    const adjPosX = (mod as any).adjustedPosition?.x;
                    let modLeft = bounds.left;
                    let modRight = bounds.right;
                    if (isFrontMode && mod.slotIndex !== undefined) {
                      const slotW = indexingForCheck.slotWidths?.[mod.slotIndex] ?? indexingForCheck.columnWidth;
                      const slotCx = indexingForCheck.threeUnitPositions?.[mod.slotIndex];
                      if (slotW != null && slotCx != null) {
                        const cxMm = slotCx * 100;
                        modLeft = cxMm - slotW / 2;
                        modRight = cxMm + slotW / 2;
                      }
                    } else if (adjW != null && adjW > 0) {
                      const cx = (adjPosX != null ? adjPosX * 100 : (bounds.left + bounds.right) / 2);
                      modLeft = cx - adjW / 2;
                      modRight = cx + adjW / 2;
                    }
                    const leftEpOffset = mod.leftEndPanelOffset ?? mod.endPanelOffset ?? 0;
                    const rightEpOffset = mod.rightEndPanelOffset ?? mod.endPanelOffset ?? 0;
                    const modTopOffsetMM = resolveEffectiveTopFrameOffsetMm(mod, spaceInfo);
                    const hasTopFrameOffset = Math.abs(modTopOffsetMM) > 0.001;
                    // EP 상단 갭이 0/음수이면 상단몰딩이 EP 자리까지 X 확장 → leftEpAdj/rightEpAdj 0 처리
                    // 외치(outside) EP: 본체가 안 줄고 EP가 바깥에 추가되므로 상단몰딩도 본체폭 그대로(축소 X)
                    const epTopGapMm = (mod as any).endPanelTopOffset;
                    const shouldInsetForEpCollision = (mod.endPanelMode !== 'outside')
                      && (epTopGapMm === undefined || epTopGapMm > 0);
                    let leftEpAdj = 0;
                    let rightEpAdj = 0;
                    if (isFullSurround) {
                      // 전체서라운드: EP 돌출 또는 상단몰딩 옵셋으로 충돌하면 EP 두께만큼 안쪽으로 축소
                      if (mod.hasLeftEndPanel && (leftEpOffset > 0 || hasTopFrameOffset) && shouldInsetForEpCollision) leftEpAdj = endPanelRenderThickness;
                      if (mod.hasRightEndPanel && (rightEpOffset > 0 || hasTopFrameOffset) && shouldInsetForEpCollision) rightEpAdj = endPanelRenderThickness;
                    } else {
                      if (mod.hasLeftEndPanel && shouldInsetForEpCollision) leftEpAdj = endPanelRenderThickness;
                      if (mod.hasRightEndPanel && shouldInsetForEpCollision) rightEpAdj = endPanelRenderThickness;
                    }
                    const adjustedTopBounds = applyFrameWidthAdjustMm(
                      modLeft + leftEpAdj,
                      modRight - rightEpAdj,
                      mod,
                      'top'
                    );
                    const modWidthMM = adjustedTopBounds.rightMm - adjustedTopBounds.leftMm;
                    const modCenterXmm = (adjustedTopBounds.leftMm + adjustedTopBounds.rightMm) / 2;
                    const modCategory = getModuleCategory(mod);
                    let modFreeHeight: number;
                    if (modCategory === 'full') {
                      const baseFH = mod.freeHeight || internalSpaceHeight;
                      const maxFH = internalSpaceHeight - floatHeightForFrame;
                      modFreeHeight = Math.min(baseFH, maxFH);
                      if (mod.topFrameThickness !== undefined) {
                        const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
                        const topFrameDelta = mod.topFrameThickness - globalTopFrame;
                        modFreeHeight -= topFrameDelta;
                      }
                    } else {
                      modFreeHeight = mod.freeHeight || internalSpaceHeight;
                    }

                    let effectiveCeilingToBase = ceilingToBaseTopMM;
                    let effectiveTopY = panelStartY + height;
                    if (mod.zone === 'dropped' && spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
                      const stepDropH = spaceInfo.stepCeiling.dropHeight || 0;
                      effectiveCeilingToBase = ceilingToBaseTopMM - stepDropH;
                      effectiveTopY = panelStartY + height - mmToThreeUnits(stepDropH);
                    } else if (mod.zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
                      const dropH = spaceInfo.droppedCeiling.dropHeight || 0;
                      effectiveCeilingToBase = ceilingToBaseTopMM - dropH;
                      effectiveTopY = panelStartY + height - mmToThreeUnits(dropH);
                    }
                    const modIdForTopFrame = mod.moduleId || '';
                    const isGlassCabinetTopFrame = modIdForTopFrame.includes('glass-cabinet');
                    const isPlainShelfTopFrame = (
                      modIdForTopFrame.startsWith('single-shelf-') ||
                      modIdForTopFrame.startsWith('dual-shelf-')
                    ) && !modIdForTopFrame.includes('-4drawer-shelf-')
                      && !modIdForTopFrame.includes('-2drawer-shelf-')
                      && !modIdForTopFrame.includes('shelf-split');
                    // 상부장/유리장/일반 선반장: 상단몰딩 = 설정값.
                    // 일반 키큰장(full)은 본체 높이 변경분을 상단몰딩이 흡수하므로 공간 기반으로 계산한다.
                    let totalFrameHeightMM: number;
                    if (modCategory === 'upper' || isGlassCabinetTopFrame || isPlainShelfTopFrame) {
                      totalFrameHeightMM = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
                    } else {
                      totalFrameHeightMM = Math.max(0, effectiveCeilingToBase - modFreeHeight);
                    }
                    const modTopFrameGapMM = totalFrameHeightMM > 0 ? Math.max(0, Math.min(totalFrameHeightMM, mod.topFrameGap ?? 0)) : 0;
                    const modFrameHeight = mmToThreeUnits(Math.max(0, totalFrameHeightMM - modTopFrameGapMM));
                    const modTopGapThreeUnits = mmToThreeUnits(modTopFrameGapMM);
                    const renderFrameHeight = modFrameHeight;
                    const modFrameCenterY = effectiveTopY - modTopGapThreeUnits - modFrameHeight / 2;

                    // 상부몰딩 옵셋은 걸레받이와 동일하게 양수일수록 뒤로 들어간다.
                    const modTopZOffset = modTopOffsetMM ? -mmToThreeUnits(modTopOffsetMM) : 0;
                    // FurnitureItem.tsx와 동일하게 furnitureDepthMm = min(panelDepthMm, 600) 사용
                    const upperModDepthMm = mod.freeDepth || mod.customDepth || 300;
                    const fiFurnitureDepthMm = Math.min(spaceInfo.depth || 1500, 600);
                    const fiFurnitureDepth = mmToThreeUnits(fiFurnitureDepthMm);
                    const fiZOffset = -mmToThreeUnits(spaceInfo.depth || 1500) / 2 + (mmToThreeUnits(spaceInfo.depth || 1500) - fiFurnitureDepth) / 2;
                    const upperFrontZ = fiZOffset - fiFurnitureDepth / 2 - mmToThreeUnits(20) + mmToThreeUnits(upperModDepthMm);
                    const upperFrameZ = upperFrontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2;
                    // 신발장 + 유리장: 뒷면이 뒷벽+0, 앞면 = 뒷벽 + customDepth. 상단몰딩은 앞면 기준
                    const modMidShoe = modIdForTopFrame;
                    const isShoeMod = (modMidShoe.includes('-entryway-') || modMidShoe.includes('-shelf-') || modMidShoe.includes('-4drawer-shelf-') || modMidShoe.includes('-2drawer-shelf-') || modMidShoe.includes('glass-cabinet'));
                    let shoeFrameZ: number | null = null;
                    if (isShoeMod) {
                      const defaultShoeDepthMm = modMidShoe.includes('glass-cabinet') ? 365 : 380;
                      const shoeDepthMm = mod.upperSectionDepth || mod.customDepth || mod.freeDepth || defaultShoeDepthMm;
                      const shoeBackZ = fiZOffset - fiFurnitureDepth / 2 - mmToThreeUnits(20);
                      const shoeFrontZ = shoeBackZ + mmToThreeUnits(shoeDepthMm);
                      shoeFrameZ = shoeFrontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2;
                    }
                    // 인출장/팬트리장/냉장고장: 키큰장(full)은 일반 키큰장과 같은 본체 앞 기준을 쓴다.
                    // 주방 키큰장만 섹션 깊이 기준으로 다시 잡으면 상단몰딩 옵셋 0에서도 앞으로 튀어나온다.
                    const isNSectionMod = modMidShoe.includes('pull-out-cabinet') ||
                      modMidShoe.includes('pantry-cabinet') ||
                      (modMidShoe.includes('fridge-cabinet') && !modMidShoe.includes('built-in-fridge'));
                    let nSectionFrameZ: number | null = null;
                    if (isNSectionMod && modCategory !== 'full') {
                      if (modMidShoe.includes('pull-out-cabinet')) {
                        nSectionFrameZ = freeSlotTopZPosition;
                      } else {
                        const sectionDepthsArr = (mod as any).sectionDepths as number[] | undefined;
                        const lastIdx = sectionDepthsArr ? sectionDepthsArr.length - 1 : -1;
                        const topSectionDepthMm = (sectionDepthsArr && lastIdx >= 0 && sectionDepthsArr[lastIdx])
                          ? sectionDepthsArr[lastIdx]
                          : (mod.customDepth || mod.freeDepth || 600);
                        const nBackZ = fiZOffset - fiFurnitureDepth / 2 - mmToThreeUnits(20);
                        const nFrontZ = nBackZ + mmToThreeUnits(topSectionDepthMm);
                        nSectionFrameZ = nFrontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2;
                      }
                    }
                    const fullModuleFrameZ = modCategory === 'full'
                      ? getFrontPlacedModuleTopFrameCenterZ(mod)
                      : null;
                    const generalFrameZ = freeSlotTopZPosition;
                    const freeTopFrameBaseZ = modCategory === 'upper'
                      ? upperFrameZ
                      : (modCategory === 'full'
                        ? (fullModuleFrameZ ?? generalFrameZ)
                        : (nSectionFrameZ !== null
                          ? nSectionFrameZ
                          : (shoeFrameZ !== null ? shoeFrameZ : generalFrameZ)));
                    // 가구별 뒷벽 이격(backWallGap) 반영: 상단몰딩도 가구 본체와 동일하게 앞으로 이동
                    const modTopBackWallGapMm = (mod as any).backWallGap ?? 0;
                    const modTopBackWallGapZ = modTopBackWallGapMm > 0 ? mmToThreeUnits(modTopBackWallGapMm) : 0;
                    allTopSegments.push({
                      widthMm: modWidthMM,
                      centerXmm: modCenterXmm,
                      zPosition: freeTopFrameBaseZ + modTopZOffset + modTopBackWallGapZ,
                      height: renderFrameHeight,
                      yPosition: modFrameCenterY,
                      material: topSurrMat,
                      key: `free-top-strip-${group.id}-${mod.id}`,
                      placedModuleId: mod.id,
                    });
                  });
                });

                // 병합 적용
                // 설계 과정에서는 항상 분절 표시 (병합은 CNC 내보내기 시에만 적용)
                const renderSegs = allTopSegments;

                return renderSegs.map((seg, idx) => {
                  const args: [number, number, number] = [
                    mmToThreeUnits(seg.widthMm),
                    seg.height,
                    mmToThreeUnits(endPanelRenderThickness)
                  ];
                  const pos: [number, number, number] = [
                    mmToThreeUnits(seg.centerXmm),
                    seg.yPosition,
                    seg.zPosition
                  ];
                  const isMergedHighlighted = false; // 설계 과정에서는 항상 분절
                  const isIndividualHighlighted = seg.placedModuleId && highlightedFrame === `top-${seg.placedModuleId}`;
                  // segment를 만든 owning 가구 ID — 사용자가 그 가구의 패널 목록에서 상단몰딩을 체크 해제하면
                  // 해당 segment만 숨기기 위해 사용 (firstModuleId 대신 segment별 placedModuleId 사용)
                  const owningId = seg.placedModuleId || firstModuleId;
                  return (
                    <React.Fragment key={`free-top-merged-${idx}`}>
                      <BoxWithEdges
                        hideEdges={hideEdges}
                        isOuterFrame
                        name={spaceInfo.frameMergeEnabled ? `top-frame-${idx}` : 'top-frame'}
                        args={args}
                        position={pos}
                        material={seg.material ?? topSurrMat}
                        renderMode={renderMode}
                        shadowEnabled={shadowEnabled}
                        excludeKey={`${owningId}::top-frame`}
                        furnitureId={owningId}
                        panelName="top-frame"
                      />
                      {(isMergedHighlighted || isIndividualHighlighted) && <mesh position={pos}><boxGeometry args={args} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>}
                    </React.Fragment>
                  );
                });
              })()}

              {/* 자유배치 좌측 서라운드 — L자 (전면에서 이격 가림) */}
              {/* surroundType가 surround/both-sides이면 슬롯 프레임이 좌우를 담당하므로 freeSurround 비활성 */}
              {spaceInfo.freeSurround?.left?.enabled && spaceInfo.freeSurround.left.method !== 'curtain-box' && hasFreeMods && spaceInfo.surroundType === 'no-surround' && (() => {
                const leftCfg = spaceInfo.freeSurround!.left;
                // method 미설정 시 gap 기반 자동 결정 (gap > 2 → lshape)
                const method = leftCfg.method || ((leftCfg.gap && leftCfg.gap > 2) ? 'lshape' : 'none');
                if (method === 'none') return null;
                const gapMM = leftCfg.gap || 0;
                // Z축 옵셋: 양수=앞으로, 음수=뒤로
                const leftZOffset = leftCfg.offset ? mmToThreeUnits(leftCfg.offset) : 0;
                const frontZ = surroundZPosition + leftZOffset;
                // 서라운드 높이 = 가구 배치공간 높이
                // 바닥배치: 전체높이 - 바닥마감재
                // 띄워서배치: 전체높이 - 바닥마감재 - 띄움높이
                // 단내림이 왼쪽에 있으면 서라운드 높이를 단내림 천장에 맞춤
                const _hasLeftStepCeiling = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'left';
                const leftStepDropH = _hasLeftStepCeiling ? mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200) : 0;
                const lTopGap = mmToThreeUnits(leftCfg.topGap || 0);
                const lBottomGap = mmToThreeUnits(leftCfg.bottomGap || 0);
                const surrH = (_hasLeftStepCeiling ? adjustedPanelHeight - leftStepDropH : adjustedPanelHeight) - lTopGap - lBottomGap;
                const surrCenterY = sideFrameStartY + lBottomGap + surrH / 2;
                const leftSurrMat = leftFrameMaterial ?? createFrameMaterial('left');
                const isLeftHighlighted = highlightedFrame === 'surround-left';

                if (method === 'ep') {
                  const epArgs: [number, number, number] = [mmToThreeUnits(endPanelRenderThickness), surrH, mmToThreeUnits(endPanelRenderThickness)];
                  const epPos: [number, number, number] = [mmToThreeUnits(minLeftMM - END_PANEL_THICKNESS / 2), surrCenterY, frontZ];
                  return (
                    <>
                      <BoxWithEdges hideEdges={hideEdges} isOuterFrame key="free-left-ep" name="left-surround-ep"
                        args={epArgs} position={epPos} material={leftSurrMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                        excludeKey={`${leftMostModuleId}::left-surround-ep`} />
                      {isLeftHighlighted && <mesh position={epPos}><boxGeometry args={epArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>}
                    </>
                  );
                }

                // L-shape (겹침 없는 L자)
                const SIDE_DEPTH_MM = 40;
                const sideX = mmToThreeUnits(minLeftMM - END_PANEL_THICKNESS / 2);
                const sideZ = frontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(SIDE_DEPTH_MM) / 2;
                const frontX = mmToThreeUnits(minLeftMM - gapMM / 2);
                const sideArgs: [number, number, number] = [mmToThreeUnits(END_PANEL_THICKNESS), surrH, mmToThreeUnits(SIDE_DEPTH_MM)];
                const sidePos: [number, number, number] = [sideX, surrCenterY, sideZ];
                const frontActualWidth = Math.max(0, gapMM - 3); // 양쪽 1.5mm씩 이격
                const frontArgs: [number, number, number] = [mmToThreeUnits(frontActualWidth), surrH, mmToThreeUnits(END_PANEL_THICKNESS)];
                const frontPos: [number, number, number] = [frontX, surrCenterY, frontZ];
                return (
                  <>
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame key="free-left-lshape-side" name="left-surround-lshape-side"
                      args={sideArgs} position={sidePos} material={leftSurrMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                      excludeKey={`${leftMostModuleId}::left-surround-lshape-side`} />
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame key="free-left-lshape-front" name="left-surround-lshape-front"
                      args={frontArgs} position={frontPos} material={leftSurrMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                      excludeKey={`${leftMostModuleId}::left-surround-lshape-front`} />
                    {isLeftHighlighted && (
                      <>
                        <mesh position={sidePos}><boxGeometry args={sideArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                        <mesh position={frontPos}><boxGeometry args={frontArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                      </>
                    )}

                    {/* 좌측 서라운드 전면 패널 상단 치수선 (이격치수와 겹치지 않도록 위로) */}
                    {showDimensions && frontActualWidth > 0 && (() => {
                      const extensionLineStart = mmToThreeUnits(10);
                      const extensionLineLength = mmToThreeUnits(50);
                      const tickSize = 0.008;
                      const dimColor = '#000000';
                      const halfW = mmToThreeUnits(frontActualWidth) / 2;
                      const dimY = frontPos[1] + surrH / 2 + extensionLineStart + extensionLineLength;
                      const extStart = frontPos[1] + surrH / 2 + extensionLineStart;
                      const zD = frontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.01;
                      return (
                        <>
                          <Line name="surround-dim" points={[[frontPos[0] - halfW, extStart, zD], [frontPos[0] - halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[frontPos[0] + halfW, extStart, zD], [frontPos[0] + halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[frontPos[0] - halfW, dimY, zD], [frontPos[0] + halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[frontPos[0] - halfW - tickSize, dimY, zD], [frontPos[0] - halfW + tickSize, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[frontPos[0] + halfW - tickSize, dimY, zD], [frontPos[0] + halfW + tickSize, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <DimensionText name="surround-dim-text" value={Math.round(frontActualWidth)} position={[frontPos[0], dimY + mmToThreeUnits(5), zD]} color={dimColor} anchorX="center" anchorY="bottom" forceShow={true} />
                        </>
                      );
                    })()}

                    {/* 좌측 서라운드 전면 패널 기어 아이콘 */}
                    {viewMode !== '2D' && showDimensions && (
                      <Html
                        position={[frontPos[0], frontPos[1], frontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.3]}
                        center
                        zIndexRange={[100, 0]}
                        style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 9999, background: 'transparent' }}
                      >
                        <div
                          data-surround-options-panel
                          style={{
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', border: `2px solid ${colors.primary}`, borderRadius: '50%',
                            backgroundColor: (viewMode === '2D' && view2DTheme === 'dark') ? '#1f2937' : '#ffffff', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__r3fClickHandled = true;
                            setSurroundPopup(surroundPopup === 'left' ? null : 'left');
                            setHighlightedFrame(surroundPopup === 'left' ? null : 'surround-left');
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="서라운드 설정"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </div>
                      </Html>
                    )}
                    {/* 좌측 서라운드 옵셋 팝업 */}
                    {surroundPopup === 'left' && (() => {
                      const fs = spaceInfo.freeSurround;
                      const d = fs?.left;
                      if (!d) return null;
                      return (
                        <Html
                          position={[frontPos[0] + mmToThreeUnits(frontActualWidth) / 2 + 1.5, frontPos[1], frontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.3]}
                          center zIndexRange={[200, 0]}
                          style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 9999, background: 'transparent' }}
                        >
                          <div data-surround-options-panel style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: `2px solid ${colors.primary}`, boxShadow: `0 4px 16px ${colors.primary}33`, padding: '12px', minWidth: '160px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '13px', color: '#1f2937' }}
                            onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px' }}>좌측 서라운드</span>
                              <button onClick={() => { setSurroundPopup(null); setHighlightedFrame(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', fontSize: '16px', lineHeight: 1 }}>✕</button>
                            </div>
                            <div style={{ marginBottom: '6px' }}>
                              <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>깊이 (앞뒤)</label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input type="text" inputMode="numeric" value={d.offset ?? 0}
                                  onChange={(e) => { const v = parseInt(e.target.value) || 0; setSpaceInfo({ freeSurround: { ...fs, left: { ...d, offset: v } } }); }}
                                  style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>천장 이격</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input type="text" inputMode="numeric" value={d.topGap ?? 0}
                                    onChange={(e) => { const v = parseInt(e.target.value) || 0; setSpaceInfo({ freeSurround: { ...fs, left: { ...d, topGap: v } } }); }}
                                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>바닥 이격</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input type="text" inputMode="numeric" value={d.bottomGap ?? 0}
                                    onChange={(e) => { const v = parseInt(e.target.value) || 0; setSpaceInfo({ freeSurround: { ...fs, left: { ...d, bottomGap: v } } }); }}
                                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Html>
                      );
                    })()}
                  </>
                );
              })()}

              {/* 자유배치 우측 서라운드 — L자 (전면에서 이격 가림) */}
              {/* surroundType가 surround/both-sides이면 슬롯 프레임이 우측을 담당하므로 freeSurround 비활성 */}
              {spaceInfo.freeSurround?.right?.enabled && spaceInfo.freeSurround.right.method !== 'curtain-box' && hasFreeMods && spaceInfo.surroundType === 'no-surround' && (() => {
                const rightCfg = spaceInfo.freeSurround!.right;
                // method 미설정 시 gap 기반 자동 결정
                const method = rightCfg.method || ((rightCfg.gap && rightCfg.gap > 2) ? 'lshape' : 'none');
                if (method === 'none') return null;
                const gapMM = rightCfg.gap || 0;
                // Z축 옵셋: 양수=앞으로, 음수=뒤로
                const rightZOffset = rightCfg.offset ? mmToThreeUnits(rightCfg.offset) : 0;
                const frontZ = surroundZPosition + rightZOffset;
                // 서라운드 높이 = 가구 배치공간 높이 (바닥마감재/띄움높이 반영)
                // 단내림이 오른쪽에 있으면 서라운드 높이를 단내림 천장에 맞춤
                const _hasRightStepCeiling = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'right';
                const rightStepDropH = _hasRightStepCeiling ? mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200) : 0;
                const rTopGap = mmToThreeUnits(rightCfg.topGap || 0);
                const rBottomGap = mmToThreeUnits(rightCfg.bottomGap || 0);
                const surrH = (_hasRightStepCeiling ? adjustedPanelHeight - rightStepDropH : adjustedPanelHeight) - rTopGap - rBottomGap;
                const surrCenterY = sideFrameStartY + rBottomGap + surrH / 2;
                const rightSurrMat = rightFrameMaterial ?? createFrameMaterial('right');
                const isRightHighlighted = highlightedFrame === 'surround-right';

                if (method === 'ep') {
                  const epArgs: [number, number, number] = [mmToThreeUnits(endPanelRenderThickness), surrH, mmToThreeUnits(endPanelRenderThickness)];
                  const epPos: [number, number, number] = [mmToThreeUnits(maxRightMM + END_PANEL_THICKNESS / 2), surrCenterY, frontZ];
                  return (
                    <>
                      <BoxWithEdges hideEdges={hideEdges} isOuterFrame key="free-right-ep" name="right-surround-ep"
                        args={epArgs} position={epPos} material={rightSurrMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                        excludeKey={`${rightMostModuleId}::right-surround-ep`} />
                      {isRightHighlighted && <mesh position={epPos}><boxGeometry args={epArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>}
                    </>
                  );
                }

                // L-shape
                const SIDE_DEPTH_MM = 40;
                const sideX = mmToThreeUnits(maxRightMM + END_PANEL_THICKNESS / 2);
                const sideZ = frontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(SIDE_DEPTH_MM) / 2;
                const frontX = mmToThreeUnits(maxRightMM + gapMM / 2);
                const rSideArgs: [number, number, number] = [mmToThreeUnits(END_PANEL_THICKNESS), surrH, mmToThreeUnits(SIDE_DEPTH_MM)];
                const rSidePos: [number, number, number] = [sideX, surrCenterY, sideZ];
                const rFrontActualWidth = Math.max(0, gapMM - 3); // 양쪽 1.5mm씩 이격
                const rFrontArgs: [number, number, number] = [mmToThreeUnits(rFrontActualWidth), surrH, mmToThreeUnits(END_PANEL_THICKNESS)];
                const rFrontPos: [number, number, number] = [frontX, surrCenterY, frontZ];
                return (
                  <>
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame key="free-right-lshape-side" name="right-surround-lshape-side"
                      args={rSideArgs} position={rSidePos} material={rightSurrMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                      excludeKey={`${rightMostModuleId}::right-surround-lshape-side`} />
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame key="free-right-lshape-front" name="right-surround-lshape-front"
                      args={rFrontArgs} position={rFrontPos} material={rightSurrMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                      excludeKey={`${rightMostModuleId}::right-surround-lshape-front`} />
                    {isRightHighlighted && (
                      <>
                        <mesh position={rSidePos}><boxGeometry args={rSideArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                        <mesh position={rFrontPos}><boxGeometry args={rFrontArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                      </>
                    )}

                    {/* 우측 서라운드 전면 패널 상단 치수선 (이격치수와 겹치지 않도록 위로) */}
                    {showDimensions && rFrontActualWidth > 0 && (() => {
                      const extensionLineStart = mmToThreeUnits(10);
                      const extensionLineLength = mmToThreeUnits(50);
                      const tickSize = 0.008;
                      const dimColor = '#000000';
                      const halfW = mmToThreeUnits(rFrontActualWidth) / 2;
                      const dimY = rFrontPos[1] + surrH / 2 + extensionLineStart + extensionLineLength;
                      const extStart = rFrontPos[1] + surrH / 2 + extensionLineStart;
                      const zD = rFrontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.01;
                      return (
                        <>
                          <Line name="surround-dim" points={[[rFrontPos[0] - halfW, extStart, zD], [rFrontPos[0] - halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[rFrontPos[0] + halfW, extStart, zD], [rFrontPos[0] + halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[rFrontPos[0] - halfW, dimY, zD], [rFrontPos[0] + halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[rFrontPos[0] - halfW - tickSize, dimY, zD], [rFrontPos[0] - halfW + tickSize, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[rFrontPos[0] + halfW - tickSize, dimY, zD], [rFrontPos[0] + halfW + tickSize, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <DimensionText name="surround-dim-text" value={Math.round(rFrontActualWidth)} position={[rFrontPos[0], dimY + mmToThreeUnits(5), zD]} color={dimColor} anchorX="center" anchorY="bottom" forceShow={true} />
                        </>
                      );
                    })()}

                    {/* 우측 서라운드 전면 패널 기어 아이콘 */}
                    {viewMode !== '2D' && showDimensions && (
                      <Html
                        position={[rFrontPos[0], rFrontPos[1], rFrontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.3]}
                        center
                        zIndexRange={[100, 0]}
                        style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 9999, background: 'transparent' }}
                      >
                        <div
                          data-surround-options-panel
                          style={{
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', border: `2px solid ${colors.primary}`, borderRadius: '50%',
                            backgroundColor: (viewMode === '2D' && view2DTheme === 'dark') ? '#1f2937' : '#ffffff', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__r3fClickHandled = true;
                            setSurroundPopup(surroundPopup === 'right' ? null : 'right');
                            setHighlightedFrame(surroundPopup === 'right' ? null : 'surround-right');
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="서라운드 설정"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </div>
                      </Html>
                    )}
                    {/* 우측 서라운드 옵셋 팝업 */}
                    {surroundPopup === 'right' && (() => {
                      const fs = spaceInfo.freeSurround;
                      const d = fs?.right;
                      if (!d) return null;
                      return (
                        <Html
                          position={[rFrontPos[0] - mmToThreeUnits(rFrontActualWidth) / 2 - 1.5, rFrontPos[1], rFrontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.3]}
                          center zIndexRange={[200, 0]}
                          style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 9999, background: 'transparent' }}
                        >
                          <div data-surround-options-panel style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: `2px solid ${colors.primary}`, boxShadow: `0 4px 16px ${colors.primary}33`, padding: '12px', minWidth: '160px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '13px', color: '#1f2937' }}
                            onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px' }}>우측 서라운드</span>
                              <button onClick={() => { setSurroundPopup(null); setHighlightedFrame(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', fontSize: '16px', lineHeight: 1 }}>✕</button>
                            </div>
                            <div style={{ marginBottom: '6px' }}>
                              <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>깊이 (앞뒤)</label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input type="text" inputMode="numeric" value={d.offset ?? 0}
                                  onChange={(e) => { const v = parseInt(e.target.value) || 0; setSpaceInfo({ freeSurround: { ...fs, right: { ...d, offset: v } } }); }}
                                  style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>천장 이격</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input type="text" inputMode="numeric" value={d.topGap ?? 0}
                                    onChange={(e) => { const v = parseInt(e.target.value) || 0; setSpaceInfo({ freeSurround: { ...fs, right: { ...d, topGap: v } } }); }}
                                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>바닥 이격</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input type="text" inputMode="numeric" value={d.bottomGap ?? 0}
                                    onChange={(e) => { const v = parseInt(e.target.value) || 0; setSpaceInfo({ freeSurround: { ...fs, right: { ...d, bottomGap: v } } }); }}
                                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Html>
                      );
                    })()}
                  </>
                );
              })()}

              {/* 자유배치 중간 gap 서라운드 — 가구 사이 빈 공간 가림 */}
              {spaceInfo.freeSurround?.middle?.map((midCfg, idx) => {
                // method 미설정 시 gap 기반 자동 결정
                const midMethod = midCfg.method || ((midCfg.gap && midCfg.gap > 2) ? 'lshape' : 'none');
                if (!midCfg.enabled || midMethod === 'none') return null;
                const gapMM = midCfg.gap;
                const centerXmm = (midCfg.leftX + midCfg.rightX) / 2;
                const mTopGap = mmToThreeUnits(midCfg.topGap || 0);
                const mBottomGap = mmToThreeUnits(midCfg.bottomGap || 0);
                const surrH = adjustedPanelHeight - mTopGap - mBottomGap;
                const surrCenterY = sideFrameStartY + mBottomGap + surrH / 2;
                const SIDE_DEPTH_MM = 40;

                // 전면패널: gap 너비만큼 앞면 가림 (offset 반영)
                const midZOffset = midCfg.offset ? mmToThreeUnits(midCfg.offset) : 0;
                const frontZ = surroundZPosition + midZOffset;
                // 좌측 측면패널: leftX(좌측 가구 오른쪽) + 18/2
                const leftSideX = mmToThreeUnits(midCfg.leftX + END_PANEL_THICKNESS / 2);
                const leftSideZ = frontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(SIDE_DEPTH_MM) / 2;
                // 우측 측면패널: rightX(우측 가구 왼쪽) - 18/2
                const rightSideX = mmToThreeUnits(midCfg.rightX - END_PANEL_THICKNESS / 2);
                const rightSideZ = leftSideZ;
                // 전면패널: gap 전체 폭
                const frontX = mmToThreeUnits(centerXmm);
                const isMiddleHighlighted = highlightedFrame === `surround-middle-${idx}`;
                const frameMat = leftFrameMaterial ?? createFrameMaterial('left');
                const mLSideArgs: [number, number, number] = [mmToThreeUnits(END_PANEL_THICKNESS), surrH, mmToThreeUnits(SIDE_DEPTH_MM)];
                const mLSidePos: [number, number, number] = [leftSideX, surrCenterY, leftSideZ];
                const mRSideArgs: [number, number, number] = [mmToThreeUnits(END_PANEL_THICKNESS), surrH, mmToThreeUnits(SIDE_DEPTH_MM)];
                const mRSidePos: [number, number, number] = [rightSideX, surrCenterY, rightSideZ];
                const mFrontActualWidth = Math.max(0, gapMM - 3); // 양쪽 1.5mm씩 이격
                const mFrontArgs: [number, number, number] = [mmToThreeUnits(mFrontActualWidth), surrH, mmToThreeUnits(END_PANEL_THICKNESS)];
                const mFrontPos: [number, number, number] = [frontX, surrCenterY, frontZ];

                return (
                  <group key={`free-middle-surround-${idx}`}>
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame key={`free-mid-lside-${idx}`} name={`middle-surround-left-side-${idx}`}
                      args={mLSideArgs} position={mLSidePos} material={frameMat} renderMode={renderMode} shadowEnabled={shadowEnabled} />
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame key={`free-mid-rside-${idx}`} name={`middle-surround-right-side-${idx}`}
                      args={mRSideArgs} position={mRSidePos} material={frameMat} renderMode={renderMode} shadowEnabled={shadowEnabled} />
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame key={`free-mid-front-${idx}`} name={`middle-surround-front-${idx}`}
                      args={mFrontArgs} position={mFrontPos} material={frameMat} renderMode={renderMode} shadowEnabled={shadowEnabled} />
                    {isMiddleHighlighted && (
                      <>
                        <mesh position={mLSidePos}><boxGeometry args={mLSideArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                        <mesh position={mRSidePos}><boxGeometry args={mRSideArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                        <mesh position={mFrontPos}><boxGeometry args={mFrontArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                      </>
                    )}

                    {/* 중간 서라운드 전면 패널 상단 치수선 (이격치수와 겹치지 않도록 위로) */}
                    {showDimensions && mFrontActualWidth > 0 && (() => {
                      const extensionLineStart = mmToThreeUnits(10);
                      const extensionLineLength = mmToThreeUnits(50);
                      const tickSize = 0.008;
                      const dimColor = '#000000';
                      const halfW = mmToThreeUnits(mFrontActualWidth) / 2;
                      const dimY = mFrontPos[1] + surrH / 2 + extensionLineStart + extensionLineLength;
                      const extStart = mFrontPos[1] + surrH / 2 + extensionLineStart;
                      const zD = mFrontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.01;
                      return (
                        <>
                          <Line name="surround-dim" points={[[mFrontPos[0] - halfW, extStart, zD], [mFrontPos[0] - halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[mFrontPos[0] + halfW, extStart, zD], [mFrontPos[0] + halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[mFrontPos[0] - halfW, dimY, zD], [mFrontPos[0] + halfW, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[mFrontPos[0] - halfW - tickSize, dimY, zD], [mFrontPos[0] - halfW + tickSize, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <Line name="surround-dim" points={[[mFrontPos[0] + halfW - tickSize, dimY, zD], [mFrontPos[0] + halfW + tickSize, dimY, zD]]} color={dimColor} lineWidth={1} />
                          <DimensionText name="surround-dim-text" value={Math.round(mFrontActualWidth)} position={[mFrontPos[0], dimY + mmToThreeUnits(5), zD]} color={dimColor} anchorX="center" anchorY="bottom" forceShow={true} />
                        </>
                      );
                    })()}

                    {/* 중간 서라운드 전면 패널 기어 아이콘 */}
                    {viewMode !== '2D' && showDimensions && (
                      <Html
                        position={[mFrontPos[0], mFrontPos[1], mFrontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.3]}
                        center
                        zIndexRange={[100, 0]}
                        style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 9999, background: 'transparent' }}
                      >
                        <div
                          data-surround-options-panel
                          style={{
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', border: `2px solid ${colors.primary}`, borderRadius: '50%',
                            backgroundColor: (viewMode === '2D' && view2DTheme === 'dark') ? '#1f2937' : '#ffffff', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__r3fClickHandled = true;
                            const key = `middle-${idx}`;
                            setSurroundPopup(surroundPopup === key ? null : key);
                            setHighlightedFrame(surroundPopup === key ? null : `surround-middle-${idx}`);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="서라운드 설정"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </div>
                      </Html>
                    )}
                    {/* 중간 서라운드 하단 연필 아이콘 (가구 편집용) */}
                    {viewMode !== '2D' && showDimensions && !readOnly && (
                      <Html
                        position={[mFrontPos[0], sideFrameStartY - 3.2, mFrontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.5]}
                        center
                        zIndexRange={[100, 0]}
                        style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 100, background: 'transparent' }}
                      >
                        <div
                          data-surround-edit-icon
                          style={{
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', border: `2px solid ${colors.primary}`, borderRadius: '50%',
                            backgroundColor: (viewMode === '2D' && view2DTheme === 'dark') ? '#1f2937' : '#ffffff', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            opacity: 0.8,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__r3fClickHandled = true;
                            openSurroundEditPopup(`middle-${idx}`);
                            setHighlightedFrame(`surround-middle-${idx}`);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="서라운드 편집"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </Html>
                    )}
                    {/* 중간 서라운드 편집 팝업 (우측에 표시) */}
                    {surroundPopup === `middle-${idx}` && (() => {
                      const fs = spaceInfo.freeSurround;
                      const midArr = fs?.middle;
                      const d = midArr?.[idx];
                      if (!d || !midArr) return null;
                      return (
                        <Html
                          position={[mFrontPos[0] + mmToThreeUnits(mFrontActualWidth) / 2 + 2.0, mFrontPos[1], mFrontPos[2] + mmToThreeUnits(END_PANEL_THICKNESS) / 2 + 0.3]}
                          center zIndexRange={[200, 0]}
                          style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 9999, background: 'transparent' }}
                        >
                          <div data-surround-options-panel style={{ background: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: `2px solid ${colors.primary}`, boxShadow: `0 4px 16px ${colors.primary}33`, padding: '12px', minWidth: '160px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '13px', color: '#1f2937' }}
                            onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px' }}>중간 서라운드 {idx + 1}</span>
                              <button onClick={() => { setSurroundPopup(null); setHighlightedFrame(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', fontSize: '16px', lineHeight: 1 }}>✕</button>
                            </div>
                            <div style={{ marginBottom: '6px' }}>
                              <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>깊이 (앞뒤)</label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input type="text" inputMode="numeric" value={d.offset ?? 0}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value) || 0;
                                    const newMiddle = [...midArr];
                                    newMiddle[idx] = { ...d, offset: v };
                                    setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                                  }}
                                  style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>천장 이격</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input type="text" inputMode="numeric" value={d.topGap ?? 0}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value) || 0;
                                      const newMiddle = [...midArr];
                                      newMiddle[idx] = { ...d, topGap: v };
                                      setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                                    }}
                                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>바닥 이격</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input type="text" inputMode="numeric" value={d.bottomGap ?? 0}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value) || 0;
                                      const newMiddle = [...midArr];
                                      newMiddle[idx] = { ...d, bottomGap: v };
                                      setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                                    }}
                                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000' }} />
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Html>
                      );
                    })()}
                  </group>
                );
              })}

              {/* 커튼박스 마감 — freeSurround의 curtain-box method로 제어 */}
              {spaceInfo.droppedCeiling?.enabled && (() => {
                const dcPos = spaceInfo.droppedCeiling!.position || 'right';
                const cbSurround = dcPos === 'left' ? spaceInfo.freeSurround?.left : spaceInfo.freeSurround?.right;
                // freeSurround가 없으면 기존 curtainBoxFinished 플래그로 폴백
                const cbEnabled = cbSurround ? (cbSurround.enabled && cbSurround.method === 'curtain-box') : !!spaceInfo.curtainBoxFinished;
                if (!cbEnabled) return null;
                const dcWidthMM = spaceInfo.droppedCeiling!.width || 150;
                const dcDropH = spaceInfo.droppedCeiling!.dropHeight || 100;
                const dcTotalH = heightMm + dcDropH; // 커튼박스 전체 높이(mm)
                const panelThickMM = PET_PANEL_THICKNESS_MM;

                const panelH = mmToThreeUnits(dcTotalH);
                const panelCenterY = panelH / 2; // 바닥(0)부터 커튼박스 천장까지

                // 커튼박스 구간 중심 X
                const spaceHalfW = (spaceInfo.width || 2400) / 2;
                const dcCenterX = dcPos === 'left'
                  ? mmToThreeUnits(-spaceHalfW + dcWidthMM / 2)
                  : mmToThreeUnits(spaceHalfW - dcWidthMM / 2);

                const frameMat = leftFrameMaterial ?? createFrameMaterial('left');

                // L자 구조: 전면패널 + 경계면 측면패널 (서라운드와 동일 구조)
                const cbOffsetMM = cbSurround?.offset || 0;
                const cbZOffset = mmToThreeUnits(cbOffsetMM);
                const frontZ = surroundZPosition + cbZOffset;
                const SIDE_BASE_DEPTH_MM = 40; // 측면패널 기본 깊이
                const sideDepthMM = SIDE_BASE_DEPTH_MM + cbOffsetMM; // offset만큼 측면 확장

                // 전면패널: 커튼박스 전체 폭, 가구 앞면 위치
                const frontArgs: [number, number, number] = [mmToThreeUnits(dcWidthMM), panelH, mmToThreeUnits(panelThickMM)];
                const frontPos: [number, number, number] = [dcCenterX, panelCenterY, frontZ];

                // 경계면 측면패널: 18mm 두께, 전면 뒤쪽으로 (40 + offset)mm 깊이
                const borderX = dcPos === 'left'
                  ? mmToThreeUnits(-spaceHalfW + dcWidthMM - panelThickMM / 2)
                  : mmToThreeUnits(spaceHalfW - dcWidthMM + panelThickMM / 2);
                const sideZ = frontZ - mmToThreeUnits(panelThickMM) / 2 - mmToThreeUnits(sideDepthMM) / 2;
                const sideArgs: [number, number, number] = [mmToThreeUnits(panelThickMM), panelH, mmToThreeUnits(sideDepthMM)];
                const sidePos: [number, number, number] = [borderX, panelCenterY, sideZ];

                const isCBHighlighted = highlightedFrame === 'curtain-box-finish';

                return (
                  <group key="curtain-box-finish">
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame name="curtain-box-front"
                      args={frontArgs} position={frontPos} material={frameMat} renderMode={renderMode} shadowEnabled={shadowEnabled} />
                    <BoxWithEdges hideEdges={hideEdges} isOuterFrame name="curtain-box-side"
                      args={sideArgs} position={sidePos} material={frameMat} renderMode={renderMode} shadowEnabled={shadowEnabled} />
                    {isCBHighlighted && (
                      <>
                        <mesh position={frontPos}><boxGeometry args={frontArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                        <mesh position={sidePos}><boxGeometry args={sideArgs} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>
                      </>
                    )}
                  </group>
                );
              })()}
            </>
          );
        }

        // 균등분할 모드: 기존 전체 너비 렌더링
        return (
        <>
          {/* 슬롯배치 커튼박스 L자 마감 (전면 가림판 + 경계면 칸막이) */}
          {/* 외측 엔드패널은 기존 좌/우 프레임 코드가 그대로 렌더링 */}
          {/* 자유배치 커튼박스 마감(line 3886)과 동일한 L자 구조: 전면=가구 앞면, 경계면=전면 뒤로 연장 */}
          {isCurtainBoxSlot && spaceInfo.curtainBox?.enabled && (() => {
            const cbPos = spaceInfo.curtainBox!.position || 'right';
            const cbWidthMM = spaceInfo.curtainBox!.width || 150;
            const panelThickMM = endPanelRenderThickness;

            // CB 프레임 높이: 커튼박스 천장(height + cbDropH)까지
            const cbDropH = spaceInfo.curtainBox!.dropHeight || 60;
            const cbPanelH = adjustedPanelHeight + mmToThreeUnits(cbDropH);
            const cbCenterY = sideFrameStartY + cbPanelH / 2;

            const cbFrameMat = cbPos === 'left'
              ? (leftFrameMaterial ?? createFrameMaterial('left'))
              : (rightFrameMaterial ?? createFrameMaterial('right'));
            const cbModuleId = cbPos === 'left' ? leftMostModuleId : rightMostModuleId;

            const spaceHalfW = (spaceInfo.width || 2400) / 2;

            // ── 전면 가림판: 좌/우 프레임과 동일한 Z 위치 ──
            const frontZ = furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 + mmToThreeUnits(3);
            // 전면 폭 = CB 폭에서 양쪽 1.5mm gap 적용 (150mm → 147mm)
            const cbRenderWidth = cbWidthMM - 3;
            const frontWidth = mmToThreeUnits(cbRenderWidth);
            // 양쪽 1.5mm 이격: 벽에서 1.5mm, 안쪽에서 1.5mm
            const frontCenterX = cbPos === 'left'
              ? mmToThreeUnits(-spaceHalfW + 1.5 + cbRenderWidth / 2)
              : mmToThreeUnits(spaceHalfW - 1.5 - cbRenderWidth / 2);

            // ── 경계면 칸막이: CB 구간 안쪽 경계에서 1.5mm 이격 ──
            const SIDE_BASE_DEPTH_MM = 40;
            const borderX = cbPos === 'left'
              ? mmToThreeUnits(-spaceHalfW + cbWidthMM - 1.5 - panelThickMM / 2)
              : mmToThreeUnits(spaceHalfW - cbWidthMM + 1.5 + panelThickMM / 2);
            const sideZ = frontZ - mmToThreeUnits(panelThickMM) / 2 - mmToThreeUnits(SIDE_BASE_DEPTH_MM) / 2;

            return (
              <group key="slot-curtain-box-finish">
                {/* 전면 가림판 */}
                <BoxWithEdges hideEdges={hideEdges} isOuterFrame
                  name="slot-cb-front-panel"
                  args={[frontWidth, cbPanelH, mmToThreeUnits(panelThickMM)]}
                  position={[frontCenterX, cbCenterY, frontZ]}
                  material={cbFrameMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                  excludeKey={`${cbModuleId}::slot-cb-front-panel`} />
                {/* 경계면 칸막이 */}
                <BoxWithEdges hideEdges={hideEdges} isOuterFrame
                  name="slot-cb-border-panel"
                  args={[mmToThreeUnits(panelThickMM), cbPanelH, mmToThreeUnits(SIDE_BASE_DEPTH_MM)]}
                  position={[borderX, cbCenterY, sideZ]}
                  material={cbFrameMat} renderMode={renderMode} shadowEnabled={shadowEnabled}
                  excludeKey={`${cbModuleId}::slot-cb-border-panel`} />
              </group>
            );
          })()}

          {/* 노서라운드 모드에서 상단프레임 폭 디버깅 */}
          {/* spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [상단프레임] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${baseFrame.width.toFixed(2)}`) */}

          {/* 기둥이 있거나 단내림이 있는 경우 상단 프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;

            // 단내림 관련 변수들
            let droppedWidth = 0;
            let droppedHeight = 0;
            let isLeftDropped = false;
            if (hasDroppedCeiling && spaceInfo.droppedCeiling) {
              droppedWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900));
              const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
              droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
              isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
            }

            // 슬롯 가이드와 동일한 범위 사용 - 모든 모드에서 calculateZoneSlotInfo 사용
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const normalZone = zoneInfo.normal;

            // mm 단위를 Three.js 단위로 변환 - 노서라운드에서 엔드패널 제외
            let frameStartX = mmToThreeUnits(normalZone.startX);
            let frameEndX = mmToThreeUnits(normalZone.startX + normalZone.width);

            // 노서라운드 모드에서 세미스탠딩/프리스탠딩은 엔드패널을 제외한 프레임 범위 계산
            if (spaceInfo.surroundType === 'no-surround' &&
              (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing' ||
                spaceInfo.installType === 'freestanding')) {
              if (spaceInfo.installType === 'freestanding') {
                // 프리스탠딩(벽없음)+노서라운드: 양쪽 모두 항상 18mm 감소 (엔드패널 공간)
                frameStartX += mmToThreeUnits(END_PANEL_THICKNESS);
                frameEndX -= mmToThreeUnits(END_PANEL_THICKNESS);
              } else {
                // 세미스탠딩: 엔드패널이 있는 쪽만 프레임 범위에서 제외
                if (endPanelPositions.left) {
                  frameStartX += mmToThreeUnits(END_PANEL_THICKNESS);
                }
                if (endPanelPositions.right) {
                  frameEndX -= mmToThreeUnits(END_PANEL_THICKNESS);
                }
              }
            }

            const frameWidth = frameEndX - frameStartX;
            const frameX = (frameStartX + frameEndX) / 2;

            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 + 단내림이 없는 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);

            if (columns.length === 0 || !hasDeepColumns) {
              // 슬롯배치: 항상 가구별 개별 상단몰딩 렌더링 (가구 없으면 프레임 없음)
              const slotModsForFrame = placedModulesFromStore.filter(m => !m.isSurroundPanel);
              if (slotModsForFrame.length === 0) return null; // 가구 없으면 상단몰딩 없음

              const topZPos = isFullSurround
                ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 -
                  mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo));

              const globalTopFrameMm = spaceInfo.frameSize?.top ?? 30;
              const topFrameMat = topFrameMaterial ?? createFrameMaterial('top');
              // 단내림 구간 가구 판별을 위한 정보 — X 위치 기반 판별
              const droppedCeilingHeight = hasDroppedCeiling
                ? height - mmToThreeUnits(spaceInfo.droppedCeiling?.dropHeight || 200)
                : height;
              const droppedWidthMm = hasDroppedCeiling ? (spaceInfo.droppedCeiling?.width || 900) : 0;
              const totalWidthMm = spaceInfo.width || 3600;
              const droppedBoundaryMm = isLeftDropped
                ? -(totalWidthMm / 2) + droppedWidthMm
                : (totalWidthMm / 2) - droppedWidthMm;
              // 커튼박스 구간 판별 — 단내림과 같은 쪽이면 프레임 높이를 단내림으로 제한
              const hasCBForFrame = !isFreePlacement && spaceInfo.curtainBox?.enabled;
              const cbWidthMm = hasCBForFrame ? (spaceInfo.curtainBox!.width || 150) : 0;
              const cbIsLeft = hasCBForFrame && spaceInfo.curtainBox!.position === 'left';
              const cbBoundaryMm = hasCBForFrame
                ? (cbIsLeft
                  ? -(totalWidthMm / 2) + cbWidthMm
                  : (totalWidthMm / 2) - cbWidthMm)
                : 0;
              // 커튼박스가 단내림과 같은 쪽인지 판별
              const cbSameSideAsDropped = hasCBForFrame && hasDroppedCeiling &&
                ((cbIsLeft && isLeftDropped) || (!cbIsLeft && !isLeftDropped));

              // 세그먼트 수집
              const slotTopSegments: (FrameRenderSegment & { key: string; showReturnFrame?: boolean })[] = [];
              slotModsForFrame
                  .filter(mod => {
                    if (((mod as any).placementWall || 'front') !== 'front') return false;
                    if (mod.hasTopFrame === false) return false;
                  // 하부장 모듈은 상단몰딩 불필요
                  if (getModuleCategory(mod) === 'lower') return false;
                  // Insert 프레임: 자체적으로 바닥~천장 ㄷ자 구조이므로 공간 상단 몰딩 불필요
                  if (mod.moduleId?.includes('insert-frame')) return false;
                  const isSideViewLocal = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');
                  if (isSideViewLocal && selectedSlotIndex !== null && mod.slotIndex !== undefined) {
                    const isDual = mod.isDualSlot || mod.moduleId?.includes('dual-');
                    if (isDual) {
                      if (mod.slotIndex !== selectedSlotIndex && mod.slotIndex + 1 !== selectedSlotIndex) return false;
                    } else {
                      if (mod.slotIndex !== selectedSlotIndex) return false;
                    }
                  }
                  return true;
                })
                .forEach((mod) => {
                  const bounds = getModuleBoundsX(mod);
                  let modWidthMM = bounds.right - bounds.left;
                  let modCenterXmm = (bounds.left + bounds.right) / 2;
                  // 기둥 회피로 인한 adjustedWidth/adjustedPosition 반영 (슬롯배치)
                  // 단, 기둥 앞 배치(front) 모드는 슬롯 전체 너비/슬롯 중심으로 복원
                  const isFrontMode = (mod as any).columnPlacementMode === 'front';
                  const adjW = (mod as any).adjustedWidth;
                  const adjPosX = (mod as any).adjustedPosition?.x;
                  if (isFrontMode && mod.slotIndex !== undefined) {
                    const slotW = indexingForCheck.slotWidths?.[mod.slotIndex] ?? indexingForCheck.columnWidth;
                    const slotCx = indexingForCheck.threeUnitPositions?.[mod.slotIndex];
                    if (slotW != null && slotCx != null) {
                      modWidthMM = slotW;
                      modCenterXmm = slotCx * 100;
                    }
                  } else if (adjW != null && adjW > 0) {
                    modWidthMM = adjW;
                    if (adjPosX != null) modCenterXmm = adjPosX * 100;
                  }
                  const epThk = resolvePetPanelThicknessMm(mod.endPanelThickness);
                  const leftEpOffset = mod.leftEndPanelOffset ?? mod.endPanelOffset ?? 0;
                  const rightEpOffset = mod.rightEndPanelOffset ?? mod.endPanelOffset ?? 0;
                  const modTopOffsetMM = resolveEffectiveTopFrameOffsetMm(mod, spaceInfo);
                  const hasTopFrameOffset = Math.abs(modTopOffsetMM) > 0.001;
                  // EP 상단 갭이 0/음수이면 상단몰딩이 EP 자리까지 X 확장 → 축소 안 함
                  const epTopGapMm2 = (mod as any).endPanelTopOffset;
                  const shouldInsetForEpCollision = epTopGapMm2 === undefined || epTopGapMm2 > 0;
                  if (isFullSurround) {
                    // 전체서라운드: EP 돌출 또는 상단몰딩 옵셋으로 충돌하면 EP 두께만큼 안쪽으로 축소
                    if (mod.hasLeftEndPanel && (leftEpOffset > 0 || hasTopFrameOffset) && shouldInsetForEpCollision) { modWidthMM -= epThk; modCenterXmm += epThk / 2; }
                    if (mod.hasRightEndPanel && (rightEpOffset > 0 || hasTopFrameOffset) && shouldInsetForEpCollision) { modWidthMM -= epThk; modCenterXmm -= epThk / 2; }
                  } else {
                    // 양쪽서라운드/노서라운드: EP와 충돌하면 축소
                    if (mod.hasLeftEndPanel && shouldInsetForEpCollision) { modWidthMM -= epThk; modCenterXmm += epThk / 2; }
                    if (mod.hasRightEndPanel && shouldInsetForEpCollision) { modWidthMM -= epThk; modCenterXmm -= epThk / 2; }
                  }
                  const adjustedSlotTopBounds = applyFrameWidthAdjustMm(
                    modCenterXmm - modWidthMM / 2,
                    modCenterXmm + modWidthMM / 2,
                    mod,
                    'top'
                  );
                  modWidthMM = adjustedSlotTopBounds.rightMm - adjustedSlotTopBounds.leftMm;
                  modCenterXmm = (adjustedSlotTopBounds.leftMm + adjustedSlotTopBounds.rightMm) / 2;

                  const rawTopThickness = mod.topFrameThickness ?? globalTopFrameMm;
                  const slotTopFrameGapMm = rawTopThickness > 0 ? Math.max(0, Math.min(rawTopThickness, mod.topFrameGap ?? 0)) : 0;
                  const modTopThickness = Math.max(0, rawTopThickness - slotTopFrameGapMm);
                  const modTopHeight = mmToThreeUnits(modTopThickness);
                  const slotTopGapThreeUnits = mmToThreeUnits(slotTopFrameGapMm);
                  const modCenterForZone = (bounds.left + bounds.right) / 2;
                  const isInDroppedZone = hasDroppedCeiling && (
                    isLeftDropped
                      ? modCenterForZone < droppedBoundaryMm
                      : modCenterForZone > droppedBoundaryMm
                  );
                  // 커튼박스 구간 판별: 단내림과 같은 쪽이면 천장 뒤로 보냄
                  const isInCBZone = hasCBForFrame && (
                    cbIsLeft
                      ? modCenterForZone < cbBoundaryMm
                      : modCenterForZone > cbBoundaryMm
                  );
                  const ceilingHeight = isInDroppedZone ? droppedCeilingHeight : height;
                  const slotModCategory = getModuleCategory(mod);
                  const slotModMid = mod.moduleId || '';
                  const slotRenderTopHeight = modTopHeight;
                  const modTopY = panelStartY + ceilingHeight - slotTopGapThreeUnits - modTopHeight / 2;
                  // 상부몰딩 옵셋은 걸레받이와 동일하게 양수일수록 뒤로 들어간다.
                  const modTopZOffset = modTopOffsetMM ? -mmToThreeUnits(modTopOffsetMM) : 0;

                  // 상부장은 프레임이 상부장 앞면에 맞춰 붙어야 함 (프레임 앞면 = 상부장 앞면)
                  let slotFrameZ = topZPos;
                  if (slotModCategory === 'upper') {
                    const slotUpperDepthMm = mod.freeDepth || mod.customDepth || 300;
                    const fiFurnitureDepthMm = Math.min(spaceInfo.depth || 1500, 600);
                    const fiFurnitureDepth = mmToThreeUnits(fiFurnitureDepthMm);
                    const fiZOffset = -mmToThreeUnits(spaceInfo.depth || 1500) / 2 + (mmToThreeUnits(spaceInfo.depth || 1500) - fiFurnitureDepth) / 2;
                    const slotUpperFrontZ = fiZOffset - fiFurnitureDepth / 2 - mmToThreeUnits(20) + mmToThreeUnits(slotUpperDepthMm);
                    slotFrameZ = slotUpperFrontZ - mmToThreeUnits(END_PANEL_THICKNESS) / 2;
                  } else if (slotModCategory === 'full') {
                    slotFrameZ = getFrontPlacedModuleTopFrameCenterZ(mod);
                  } else {
                    slotFrameZ = topZPos;
                  }
                  // 가구별 뒷벽 이격(backWallGap) 반영: 상단몰딩도 가구 본체와 동일하게 앞으로 이동
                  const slotTopBackWallGapMm = (mod as any).backWallGap ?? 0;
                  const slotTopBackWallGapZ = slotTopBackWallGapMm > 0 ? mmToThreeUnits(slotTopBackWallGapMm) : 0;
                  const hasAnyEndPanel =
                    mod.hasTopEndPanel === true
                    || mod.hasBottomEndPanel === true
                    || mod.hasLeftEndPanel === true
                    || mod.hasRightEndPanel === true;
                  slotTopSegments.push({
                    widthMm: modWidthMM,
                    centerXmm: modCenterXmm,
                    zPosition: slotFrameZ + modTopZOffset + slotTopBackWallGapZ,
                    height: slotRenderTopHeight,
                    yPosition: modTopY,
                    material: topFrameMat,
                    key: `slot-top-${mod.id}`,
                    placedModuleId: mod.id,
                    behindCeiling: isInCBZone && cbSameSideAsDropped,
                    showReturnFrame: modTopOffsetMM >= -19 && !hasAnyEndPanel,
                  });
                });

              // 설계 과정에서는 항상 분절 표시 (병합은 CNC 내보내기 시에만 적용)
              const renderSlotTopSegs = slotTopSegments;

              return (
                <>
                  {renderSlotTopSegs.map((seg, idx) => {
                    const args: [number, number, number] = [
                      mmToThreeUnits(seg.widthMm),
                      seg.height,
                      mmToThreeUnits(END_PANEL_THICKNESS)
                    ];
                    const pos: [number, number, number] = [
                      mmToThreeUnits(seg.centerXmm),
                      seg.yPosition,
                      seg.zPosition
                    ];
                    const returnArgs: [number, number, number] = [
                      mmToThreeUnits(seg.widthMm),
                      mmToThreeUnits(END_PANEL_THICKNESS),
                      mmToThreeUnits(40)
                    ];
                    const returnPos: [number, number, number] = [
                      pos[0],
                      seg.yPosition - seg.height / 2 + mmToThreeUnits(END_PANEL_THICKNESS) / 2,
                      seg.zPosition - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(40) / 2
                    ];
                    const isMergedHighlighted = false; // 설계 과정에서는 항상 분절
                    const isIndividualHighlighted = seg.placedModuleId && highlightedFrame === `top-${seg.placedModuleId}`;
                    const owningId = seg.placedModuleId || firstModuleId;
                    return (
                      <React.Fragment key={`slot-top-merged-${idx}`}>
                        <BoxWithEdges
                          hideEdges={hideEdges}
                          isOuterFrame
                          name={spaceInfo.frameMergeEnabled ? `top-frame-${idx}` : 'top-frame'}
                          args={args}
                          position={pos}
                          material={seg.material ?? topFrameMat}
                          renderMode={renderMode}
                          shadowEnabled={shadowEnabled}
                          renderOrder={seg.behindCeiling ? -1 : undefined}
                          excludeKey={`${owningId}::top-frame`}
                          furnitureId={owningId}
                          panelName="top-frame"
                        />
                        {isFullSurround && seg.showReturnFrame && (
                          <BoxWithEdges
                            hideEdges={hideEdges}
                            isOuterFrame
                            name={spaceInfo.frameMergeEnabled ? `top-frame-return-${idx}` : 'top-frame-return'}
                            args={returnArgs}
                            position={returnPos}
                            material={seg.material ?? topFrameMat}
                            renderMode={renderMode}
                            shadowEnabled={shadowEnabled}
                            renderOrder={seg.behindCeiling ? -1 : undefined}
                            excludeKey={`${owningId}::top-frame-return`}
                            furnitureId={owningId}
                            panelName="top-frame-return"
                          />
                        )}
                        {(isMergedHighlighted || isIndividualHighlighted) && <mesh position={pos}><boxGeometry args={args} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>}
                      </React.Fragment>
                    );
                  })}
                </>
              );
            }

            // 기둥이 있는 경우 분절된 프레임들 렌더링
            // 단내림만 있고 기둥이 없는 경우 처리
            if (hasDroppedCeiling && !hasDeepColumns) {
              const frameStartX = frameX - frameWidth / 2;
              const frameEndX = frameX + frameWidth / 2;
              const droppedBoundaryX = isLeftDropped
                ? frameStartX + droppedWidth
                : frameEndX - droppedWidth;

              // 프레임 너비 계산 - 동적 계산
              let droppedFrameWidth, normalFrameWidth;

              // 좌우 공간 축소값 계산 (프레임 또는 이격거리/엔드패널)
              let leftReduction = 0;
              let rightReduction = 0;

              if (spaceInfo.surroundType === 'surround') {
                const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
                leftReduction = frameThickness.left;
                rightReduction = frameThickness.right;
              } else {
                // 노서라운드: 엔드패널이 있는 쪽만 조정
                if (spaceInfo.installType === 'builtin') {
                  leftReduction = 2;
                  rightReduction = 2;
                } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
                  // 세미스탠딩: 엔드패널이 생성된 위치만 조정
                  leftReduction = endPanelPositions.left ? END_PANEL_THICKNESS : 0;
                  rightReduction = endPanelPositions.right ? END_PANEL_THICKNESS : 0;
                } else if (spaceInfo.installType === 'freestanding') {
                  // 프리스탠딩(벽없음)+노서라운드: 양쪽 항상 18mm 감소
                  leftReduction = END_PANEL_THICKNESS;
                  rightReduction = END_PANEL_THICKNESS;
                } else {
                  leftReduction = endPanelPositions.left ? END_PANEL_THICKNESS : 0;
                  rightReduction = endPanelPositions.right ? END_PANEL_THICKNESS : 0;
                }
              }

              // 경계면 이격거리 계산 (ColumnIndexer와 동일)
              const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

              // zoneSlotInfo에서 실제 계산된 너비 사용
              const droppedAreaInternalWidthMm = zoneSlotInfo.dropped
                ? (zoneSlotInfo.dropped.width + (zoneSlotInfo.dropped.startX - (-(spaceInfo.width / 2))))
                : (spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900));
              const normalAreaInternalWidthMm = zoneSlotInfo.normal.width +
                (zoneSlotInfo.normal.startX - (isLeftDropped
                  ? (-(spaceInfo.width / 2) + droppedAreaInternalWidthMm)
                  : -(spaceInfo.width / 2)));

              if (isLeftDropped) {
                // 왼쪽 단내림
                const droppedAreaWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900));
                const normalAreaWidth = mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900)));

                // 단내림: 왼쪽만 reduction, 오른쪽(경계면)은 확장
                droppedFrameWidth = droppedAreaWidth - mmToThreeUnits(leftReduction);

                // 일반구간: 오른쪽 reduction + 경계면 갭
                // zoneSlotInfo의 실제 계산된 너비 사용
                normalFrameWidth = mmToThreeUnits(zoneSlotInfo.normal.width);
              } else {
                // 오른쪽 단내림
                const normalAreaWidth = mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900)));
                const droppedAreaWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900));

                // 일반구간: 왼쪽 reduction + 경계면 갭
                normalFrameWidth = mmToThreeUnits(zoneSlotInfo.normal.width);

                // 단내림: 오른쪽만 reduction, 왼쪽(경계면)은 확장
                droppedFrameWidth = droppedAreaWidth - mmToThreeUnits(rightReduction);
              }

              // 각 영역의 시작점 계산 (ColumnIndexer와 동일하게)
              const normalStartXMm = zoneSlotInfo.normal.startX;
              const droppedStartXMm = zoneSlotInfo.dropped?.startX ||
                (isLeftDropped ? -(spaceInfo.width / 2) : normalStartXMm + zoneSlotInfo.normal.width);

              const normalStartX = mmToThreeUnits(normalStartXMm);
              const droppedStartX = mmToThreeUnits(droppedStartXMm);

              // 프레임 중심 위치 계산
              const droppedX = droppedStartX + droppedFrameWidth / 2;
              const normalX = normalStartX + normalFrameWidth / 2;

// console.log('🔥 상단 몰딩 너비 상세 계산:', {
                // 전체너비mm: width / 0.01,
                // frameWidth_mm: frameWidth / 0.01,
                // droppedWidth_mm: droppedWidth / 0.01,
                // leftReduction,
                // rightReduction,
                // 메인구간프레임너비_mm: normalFrameWidth / 0.01,
                // 단내림구간프레임너비_mm: droppedFrameWidth / 0.01,
                // 단내림위치: isLeftDropped ? '왼쪽' : '오른쪽',
                // 위치정보: {
                  // normalStartX_mm: normalStartX / 0.01,
                  // droppedStartX_mm: droppedStartX / 0.01,
                  // 경계점_mm: (isLeftDropped ? normalStartX : droppedStartX) / 0.01
                // },
                // 계산검증: {
                  // '단내림+메인': (droppedFrameWidth + normalFrameWidth) / 0.01,
                  // '전체내부너비': (mmToThreeUnits(spaceInfo.width) - mmToThreeUnits(leftReduction + rightReduction)) / 0.01
                // }
              // });

              // 측면뷰에서 선택된 슬롯이 어느 zone에 있는지 확인
              const isSideView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');
              const normalSlotCount = zoneSlotInfo.normal?.columnCount || (spaceInfo.customColumnCount || 4);
              const isSelectedSlotInDroppedZone = hasDroppedCeiling && selectedSlotIndex !== null && selectedSlotIndex >= normalSlotCount;

              // 슬롯이 선택되지 않은 경우 (PDF 내보내기 등) 모든 프레임 표시
              const noSlotSelected = selectedSlotIndex === null;

              // 측면뷰일 때 선택된 zone에 따라 프레임 표시 여부 결정
              // 슬롯 미선택 시 모든 프레임 표시 (PDF 내보내기용)
              const showDroppedFrame = !isSideView || noSlotSelected || isSelectedSlotInDroppedZone;
              const showNormalFrame = !isSideView || noSlotSelected || !isSelectedSlotInDroppedZone;

              // 단내림 영역과 일반 영역 프레임 렌더링
              return (
                <>
                  {/* 단내림 영역 상단 몰딩 - 측면뷰에서 단내림 구간 선택시만 표시 */}
                  {showDroppedFrame && (
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      isOuterFrame
                      name="top-frame"
                      args={[
                        droppedFrameWidth,
                        topBottomFrameHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[
                        droppedX,
                        panelStartY + (height - mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight)) - topBottomFrameHeight / 2, // 단내림 천장 위치에서 프레임 높이의 절반만큼 아래
                        isFullSurround
                          ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                          : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 -
                            mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                      ]}
                      material={topDroppedFrameMaterial ?? createFrameMaterial('top')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKey={`${firstModuleId}::top-frame`}
                      furnitureId={firstModuleId}
                      dimensionFurnitureIds={frameDimensionFurnitureIds}
                      panelName="top-frame"
                    />
                  )}
                  {/* 일반 영역 상단 몰딩 - 측면뷰에서 일반 구간 선택시만 표시 */}
                  {showNormalFrame && (
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      isOuterFrame
                      name="top-frame"
                      args={[
                        normalFrameWidth,
                        topBottomFrameHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[
                        normalX,
                        topElementsY,
                        isFullSurround
                          ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                          : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 -
                            mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                      ]}
                      material={topFrameMaterial ?? createFrameMaterial('top')}
                      renderMode={renderMode}

                      shadowEnabled={shadowEnabled}
                      excludeKey={`${firstModuleId}::top-frame`}
                      furnitureId={firstModuleId}
                      dimensionFurnitureIds={frameDimensionFurnitureIds}
                      panelName="top-frame"
                    />
                  )}
                </>
              );
            }
            const frameSegments: Array<{
              width: number;
              x: number;
            }> = [];

            // 프레임 범위는 이미 엔드패널이 조정되어 있음
            const adjustedFrameStartX = frameStartX;
            const adjustedFrameEndX = frameEndX;

// console.log('🔧 상단몰딩 분절 엔드패널 조정:', {
              // 조정된시작: adjustedFrameStartX,
              // 조정된끝: adjustedFrameEndX,
              // 왼쪽엔드패널: endPanelPositions.left,
              // 오른쪽엔드패널: endPanelPositions.right
            // });

            // 기둥들을 X 위치 기준으로 정렬
            const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);

            let currentX = adjustedFrameStartX;

            // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
            sortedColumns.forEach((column, index) => {
              const columnWidthM = column.width * 0.01; // mm to Three.js units
              const columnLeftX = column.position[0] - columnWidthM / 2;
              const columnRightX = column.position[0] + columnWidthM / 2;

              // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
              if (columnLeftX < adjustedFrameEndX && columnRightX > adjustedFrameStartX && column.depth >= 730) {
                // 기둥 왼쪽 프레임 세그먼트
                const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                if (leftSegmentWidth > 0) {
                  frameSegments.push({
                    width: leftSegmentWidth,
                    x: currentX + leftSegmentWidth / 2
                  });
                }

                // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
                currentX = columnRightX;
              }
            });

            // 마지막 세그먼트 (마지막 기둥 오른쪽)
            const lastSegmentWidth = Math.max(0, adjustedFrameEndX - currentX);
            if (lastSegmentWidth > 0) {
              frameSegments.push({
                width: lastSegmentWidth,
                x: currentX + lastSegmentWidth / 2
              });
            }

            // 분절된 프레임들 렌더링 (분절이 없으면 기본 프레임 렌더링)
            if (frameSegments.length === 0) {
              return (
                <BoxWithEdges
                  hideEdges={hideEdges}
                  isOuterFrame
                  name="top-frame"
                  args={[
                    frameWidth, // 노서라운드 모드에서는 전체 너비 사용
                    topBottomFrameHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[
                    frameX, // 노서라운드 모드에서는 전체 너비 중앙 정렬
                    topElementsY,
                    isFullSurround
                      ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                      : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 -
                        mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                  ]}
                  material={topFrameMaterial ?? createFrameMaterial('top')}
                  renderMode={renderMode}

                  shadowEnabled={shadowEnabled}
                  excludeKey={`${firstModuleId}::top-frame`}
                  furnitureId={firstModuleId}
                  dimensionFurnitureIds={frameDimensionFurnitureIds}
                  panelName="top-frame"
                />
              );
            }

            return frameSegments.map((segment, index) => {
              if (!topFrameMaterial) {
                console.warn(`⚠️ Top frame segment ${index} - material not ready, using default`);
              } else {
// console.log(`🎨 Top frame segment ${index} material:`, {
                  // hasTopFrameMaterial: !!topFrameMaterial,
                  // materialType: topFrameMaterial?.type,
                  // materialColor: topFrameMaterial && 'color' in topFrameMaterial ? (topFrameMaterial as any).color.getHexString() : 'unknown',
                  // materialTexture: topFrameMaterial && 'map' in topFrameMaterial ? !!(topFrameMaterial as any).map : false,
                  // segmentWidth: segment.width
                // });
              }

              return (
                <BoxWithEdges
                  hideEdges={hideEdges}
                  isOuterFrame
                  key={`top-frame-segment-${index}`}
                  name="top-frame"
                  args={[
                    segment.width,
                    topBottomFrameHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[
                    segment.x, // 분절된 위치
                    topElementsY,
                    isFullSurround
                      ? furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                      : furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 -
                        mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                  ]}
                  material={topFrameMaterial ?? createFrameMaterial('top')}
                  renderMode={renderMode}

                  shadowEnabled={shadowEnabled}
                  excludeKey={`${firstModuleId}::top-frame`}
                  furnitureId={firstModuleId}
                  dimensionFurnitureIds={frameDimensionFurnitureIds}
                  panelName="top-frame"
                />
              );
            });
          })()}
        </>
        );
      })()}

      {/* 상단 서브프레임 - 상단 프레임에서 앞쪽으로 내려오는 판 (ㄱ자의 세로 부분, X축 기준 90도 회전) */}
      {/* 노서라운드 모드에서는 상부 서브프레임도 숨김 */}
      {/* 상부 서브프레임 - 측면 뷰에서도 표시 */}
      {effectiveShowFrame && false && topBottomFrameHeightMm > 18 && (
        <>
          {/* 기둥이 있는 경우 상단 서브프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];

            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);

            if (columns.length === 0 || !hasDeepColumns) {
              // 기둥이 없거나 모든 기둥이 729mm 이하면 기존처럼 하나의 서브프레임으로 렌더링
              // 엔드패널이 있는 경우 해당 부분만큼 서브프레임 너비 조정
              let adjustedSubFrameWidth = finalPanelWidth;
              let adjustedSubFrameX = topBottomPanelX;

              if (spaceInfo.surroundType === 'no-surround') {
                // 엔드패널이 있는 쪽의 서브프레임 조정
                // EP(18.5mm)일 때 상단몰딩은 EP방향으로 1mm 확장 → 18 - 1 = 17mm 줄임
                const isFreestanding = spaceInfo.installType === 'freestanding';
                const EP_FRAME_EXTEND = 1; // EP 방향 상단몰딩 확장량 (mm)
                const leftAdjustment = (isFreestanding || endPanelPositions.left) ? mmToThreeUnits(END_PANEL_THICKNESS - EP_FRAME_EXTEND) : 0;
                const rightAdjustment = (isFreestanding || endPanelPositions.right) ? mmToThreeUnits(END_PANEL_THICKNESS - EP_FRAME_EXTEND) : 0;

                adjustedSubFrameWidth = finalPanelWidth - leftAdjustment - rightAdjustment;
                adjustedSubFrameX = topBottomPanelX + (leftAdjustment - rightAdjustment) / 2;
              }

              return (
                <group
                  position={[
                    adjustedSubFrameX, // 엔드패널이 있으면 조정된 위치 사용
                    topElementsY - topBottomFrameHeight / 2 + mmToThreeUnits(END_PANEL_THICKNESS) / 2, // 상단 프레임 하단에 정확히 맞물림 (패널 두께의 절반만큼 위로)
                    furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 // 캐비넷 앞면 위치로 통일
                  ]}
                  rotation={[Math.PI / 2, 0, 0]} // X축 기준 90도 회전
                >
                  <BoxWithEdges
                    hideEdges={hideEdges}
                    args={[
                      adjustedSubFrameWidth, // 엔드패널이 있으면 조정된 너비 사용
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={topFrameMaterial ?? createFrameMaterial('top')}
                    renderMode={renderMode}

                    shadowEnabled={shadowEnabled}
                  />
                </group>
              );
            }

            // 기둥이 있는 경우 분절된 서브프레임들 렌더링
            const frameSegments: Array<{
              width: number;
              x: number;
            }> = [];

            // 전체 프레임 범위 계산
            const frameStartX = topBottomPanelX - finalPanelWidth / 2;
            const frameEndX = topBottomPanelX + finalPanelWidth / 2;

            // 기둥들을 X 위치 기준으로 정렬
            const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);

            let currentX = frameStartX;

            // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
            sortedColumns.forEach((column, index) => {
              const columnWidthM = column.width * 0.01; // mm to Three.js units
              const columnLeftX = column.position[0] - columnWidthM / 2;
              const columnRightX = column.position[0] + columnWidthM / 2;

              // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
              if (columnLeftX < adjustedFrameEndX && columnRightX > adjustedFrameStartX && column.depth >= 730) {
                // 기둥 왼쪽 프레임 세그먼트
                const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                if (leftSegmentWidth > 0) {
                  frameSegments.push({
                    width: leftSegmentWidth,
                    x: currentX + leftSegmentWidth / 2
                  });
                }

                // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
                currentX = columnRightX;
              }
            });

            // 마지막 세그먼트 (마지막 기둥 오른쪽)
            const lastSegmentWidth = Math.max(0, adjustedFrameEndX - currentX);
            if (lastSegmentWidth > 0) {
              frameSegments.push({
                width: lastSegmentWidth,
                x: currentX + lastSegmentWidth / 2
              });
            }

            // 분절된 서브프레임들 렌더링 (분절이 없으면 기본 서브프레임 렌더링)
            if (frameSegments.length === 0) {
              return (
                <group
                  position={[
                    topBottomPanelX,
                    topElementsY - topBottomFrameHeight / 2 + mmToThreeUnits(END_PANEL_THICKNESS) / 2, // 상단 프레임 하단에 정확히 맞물림 (패널 두께의 절반만큼 위로)
                    furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 // 캐비넷 앞면 위치로 통일
                  ]}
                  rotation={[Math.PI / 2, 0, 0]} // X축 기준 90도 회전
                >
                  <BoxWithEdges
                    hideEdges={hideEdges}
                    args={[
                      finalPanelWidth,
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={topFrameMaterial ?? createFrameMaterial('top')}
                    renderMode={renderMode}

                    shadowEnabled={shadowEnabled}
                  />
                </group>
              );
            }

            return frameSegments.map((segment, index) => (
              <group
                key={`top-subframe-segment-${index}`}
                position={[
                  segment.x, // 분절된 위치
                  topElementsY - topBottomFrameHeight / 2 + mmToThreeUnits(END_PANEL_THICKNESS) / 2, // 상단 프레임 하단에 정확히 맞물림 (패널 두께의 절반만큼 위로)
                  furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 // 캐비넷 앞면 위치로 통일
                ]}
                rotation={[Math.PI / 2, 0, 0]} // X축 기준 90도 회전
              >
                <BoxWithEdges
                  hideEdges={hideEdges}
                  args={[
                    segment.width,
                    mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                    mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                  ]}
                  position={[0, 0, 0]} // group 내에서 원점에 배치
                  material={topSubFrameMaterial ?? createFrameMaterial('top')}
                  renderMode={renderMode}

                  shadowEnabled={shadowEnabled}
                />
              </group>
            ));
          })()}
        </>
      )}

      {/* 왼쪽 서브프레임 - 왼쪽 프레임에서 오른쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {/* 노서라운드 모드에서는 서브프레임도 숨김 */}
      {/* 좌우측 뷰에서는 숨김 */}
      {effectiveShowFrame && spaceInfo.surroundType !== 'no-surround' && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
          (spaceInfo.installType === 'semistanding' && wallConfig?.left)) && (() => {

            // 단내림 설정 확인
            const droppedCeilingEnabled = spaceInfo.droppedCeiling?.enabled ?? false;
            const droppedCeilingPosition = spaceInfo.droppedCeiling?.position ?? 'right';
            const dropHeight = spaceInfo.droppedCeiling?.dropHeight ?? 200;

            // 자유배치 커튼박스가 좌측에 있으면 서브프레임 불필요
            if (droppedCeilingEnabled && droppedCeilingPosition === 'left' && isFreePlacement) {
              return null;
            }

            // 슬롯배치 커튼박스가 좌측에 있으면 서브프레임 불필요
            if (!isFreePlacement && spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left') {
              return null;
            }

            // 왼쪽이 단내림(커튼박스) 영역인 경우 (슬롯모드)
            if (droppedCeilingEnabled && droppedCeilingPosition === 'left') {
              // 슬롯모드: 기존 로직
              const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
              const droppedFrameHeight = droppedHeight - floatHeight;
              const droppedCenterY = panelStartY + floatHeight + droppedFrameHeight / 2;
              const droppedCeilingWidth = mmToThreeUnits(spaceInfo.droppedCeiling?.width || (isFreePlacement ? 150 : 900));

// console.log('🔥🔥🔥 [왼쪽 서브프레임 - 단내림] floatHeight:', floatHeight, 'droppedHeight:', droppedHeight, 'droppedFrameHeight:', droppedFrameHeight, 'droppedCenterY:', droppedCenterY);

              return (
                <>
                  {/* 좌측 벽 안쪽 세로 서브프레임 (단내림 구간: 슬롯 가이드 정렬, 단내림 높이) */}
                  <group
                    position={[
                      xOffset + frameThickness.left - mmToThreeUnits(9),
                      droppedCenterY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(31)
                    ]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="left-surround-inner-side"
                      panelName="left-surround-inner-side"
                      furnitureId={leftMostModuleId}
                      key={`left-dropped-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        mmToThreeUnits(44),
                        droppedFrameHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={leftSubFrameMaterial ?? createFrameMaterial('left')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                    />
                  </group>
                  {/* 좌측 벽 안쪽 정면 프레임 (벽과 가구 사이 공간 메우기) */}
                  <group
                    position={[
                      xOffset + frameRenderThickness.left / 2,
                      droppedCenterY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                    ]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="left-surround-inner-front"
                      panelName="left-surround-inner-front"
                      furnitureId={leftMostModuleId}
                      key={`left-dropped-front-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        frameRenderThickness.left,
                        droppedFrameHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={leftSubFrameMaterial ?? createFrameMaterial('left')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                    />
                  </group>
                </>
              );
            }

            // stepCeiling: 왼쪽이 단내림 영역인 경우 (자유배치 전용)
            const hasLeftStepCeiling = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'left';
            if (hasLeftStepCeiling) {
              const stepDropH = mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200);
              const droppedH = adjustedPanelHeight - stepDropH;
              const droppedCY = sideFrameStartY + droppedH / 2;

              return (
                <>
                  {/* 좌측 벽 안쪽 세로 서브프레임 (stepCeiling 단내림 높이) */}
                  <group
                    position={[
                      xOffset + frameThickness.left - mmToThreeUnits(9),
                      droppedCY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(31)
                    ]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="left-surround-inner-side"
                      panelName="left-surround-inner-side"
                      furnitureId={leftMostModuleId}
                      key={`left-step-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        mmToThreeUnits(44),
                        droppedH,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={leftSubFrameMaterial ?? createFrameMaterial('left')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                    />
                  </group>
                  {/* 좌측 벽 안쪽 정면 프레임 (stepCeiling 단내림 높이) */}
                  <group
                    position={[
                      xOffset + frameRenderThickness.left / 2,
                      droppedCY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                    ]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="left-surround-inner-front"
                      panelName="left-surround-inner-front"
                      furnitureId={leftMostModuleId}
                      key={`left-step-front-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        frameRenderThickness.left,
                        droppedH,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={leftSubFrameMaterial ?? createFrameMaterial('left')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                    />
                  </group>
                </>
              );
            }

            // 단내림이 없거나 오른쪽에 있는 경우 (일반구간)
            // 왼쪽이 단내림이면 이미 위에서 렌더링했으므로 여기서는 스킵
            if (!droppedCeilingEnabled || droppedCeilingPosition !== 'left') {
              const subFrameX = xOffset + frameThickness.left - mmToThreeUnits(9);
              // 좌측 최외곽 가구(신발장 등)의 depth에 맞춰 서브프레임 Z 이동
              const leftSubEdgeMod = placedModulesFromStore.find((pm) => pm.id === leftMostModuleId);
              const leftSubEdgeZOffset = computeDepthZOffset(leftSubEdgeMod, 'any');
              const subFrameZ = furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(31) + leftSubEdgeZOffset;
              const subFrameMat = leftSubFrameMaterial ?? createFrameMaterial('left');

              // 분절 모드: 좌측 최외곽이 상/하부만 → 각 가구 몸통 높이/Z/깊이에 맞춰 세로 서브프레임 조각들
              if (isLeftFrameSplit && spaceInfo.surroundType !== 'no-surround') {
                return (
                  <>
                    {leftOuterMods.map((om, idx) => {
                      const segH = mmToThreeUnits(om.heightMm);
                      const segCY = panelStartY + mmToThreeUnits(om.bottomMm) + segH / 2;
                      const refDepthMm = 600;
                      const depthDiff = mmToThreeUnits(refDepthMm - om.depthMm);
                      const segSubZ = subFrameZ - depthDiff;
                      return (
                        <group
                          key={`left-normal-vertical-split-${idx}-${om.category}-${Math.round(om.heightMm)}-${Math.round(om.bottomMm)}-${Math.round(om.depthMm)}`}
                          position={[subFrameX, segCY, segSubZ]}
                          rotation={[0, Math.PI / 2, 0]}
                        >
                          <BoxWithEdges
                            hideEdges={hideEdges}
                            name={`left-surround-inner-side-${idx}`}
                            panelName="left-surround-inner-side"
                            furnitureId={leftMostModuleId}
                            key={`left-normal-vertical-split-inner-${idx}-${om.category}-${Math.round(om.heightMm)}-${Math.round(om.bottomMm)}-${Math.round(om.depthMm)}-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                            args={[mmToThreeUnits(44), segH, mmToThreeUnits(END_PANEL_THICKNESS)]}
                            position={[0, 0, 0]}
                            material={subFrameMat}
                            renderMode={renderMode}
                            shadowEnabled={shadowEnabled}
                            excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                          />
                        </group>
                      );
                    })}
                  </>
                );
              }

              return (
                <>
                  {/* 세로 서브프레임 (슬롯 가이드 끝선에 맞춤: x축 +1mm 이동) */}
                  <group
                    position={[subFrameX, sideFrameCenterY, subFrameZ]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="left-surround-inner-side"
                      panelName="left-surround-inner-side"
                      furnitureId={leftMostModuleId}
                      key={`left-normal-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        mmToThreeUnits(44),
                        adjustedPanelHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={subFrameMat}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${leftMostModuleId}::left-surround-lshape-side`, `${leftMostModuleId}::left-surround-lshape-front`]}
                    />
                  </group>
                </>
              );
            }
            return null;
          })()}

      {/* 오른쪽 서브프레임 - 오른쪽 프레임에서 왼쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {/* 노서라운드 모드에서는 서브프레임도 숨김 */}
      {/* 좌우측 뷰에서는 숨김 */}
      {effectiveShowFrame && spaceInfo.surroundType !== 'no-surround' && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
          (spaceInfo.installType === 'semistanding' && wallConfig?.right)) && (() => {

            // 단내림 설정 확인
            const droppedCeilingEnabled = spaceInfo.droppedCeiling?.enabled ?? false;
            const droppedCeilingPosition = spaceInfo.droppedCeiling?.position ?? 'right';
            const dropHeight = spaceInfo.droppedCeiling?.dropHeight ?? 200;

            // 자유배치 커튼박스가 우측에 있으면 서브프레임 불필요
            if (droppedCeilingEnabled && droppedCeilingPosition === 'right' && isFreePlacement) {
              return null;
            }

            // 슬롯배치 커튼박스가 우측에 있으면 서브프레임 불필요
            if (!isFreePlacement && spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right') {
              return null;
            }

            // 오른쪽이 단내림(커튼박스) 영역인 경우 (슬롯모드)
            if (droppedCeilingEnabled && droppedCeilingPosition === 'right') {
              // 슬롯모드: 기존 로직
              const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
              const subFrameH = droppedHeight - floatHeight;
              const subFrameCY = panelStartY + floatHeight + subFrameH / 2;

              return (
                <>
                  {/* 우측 벽 안쪽 정면 프레임 (벽과 가구 사이 공간 메우기) */}
                  <group
                    position={[
                      xOffset + width - frameRenderThickness.right / 2,
                      subFrameCY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                    ]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="right-surround-inner-front"
                      panelName="right-surround-inner-front"
                      furnitureId={rightMostModuleId}
                      key={`right-dropped-front-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        frameRenderThickness.right,
                        subFrameH,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={rightSubFrameMaterial ?? createFrameMaterial('right')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                    />
                  </group>

                  {/* 우측 벽 안쪽 세로 서브프레임 (단내림 구간: 슬롯 가이드 정렬) */}
                  <group
                    position={[
                      xOffset + width - frameThickness.right + mmToThreeUnits(9),
                      subFrameCY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(31)
                    ]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="right-surround-inner-side"
                      panelName="right-surround-inner-side"
                      furnitureId={rightMostModuleId}
                      key={`right-dropped-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        mmToThreeUnits(44),
                        subFrameH,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={rightSubFrameMaterial ?? createFrameMaterial('right')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                    />
                  </group>
                </>
              );
            }

            // stepCeiling: 오른쪽이 단내림 영역인 경우 (자유배치 전용)
            const hasRightStepCeiling = isFreePlacement && spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'right';
            if (hasRightStepCeiling) {
              const stepDropH = mmToThreeUnits(spaceInfo.stepCeiling!.dropHeight || 200);
              const droppedH = adjustedPanelHeight - stepDropH;
              const droppedCY = sideFrameStartY + droppedH / 2;

              return (
                <>
                  {/* 우측 벽 안쪽 정면 프레임 (stepCeiling 단내림 높이) */}
                  <group
                    position={[
                      xOffset + width - frameRenderThickness.right / 2,
                      droppedCY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2
                    ]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="right-surround-inner-front"
                      panelName="right-surround-inner-front"
                      furnitureId={rightMostModuleId}
                      key={`right-step-front-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        frameRenderThickness.right,
                        droppedH,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={rightSubFrameMaterial ?? createFrameMaterial('right')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                    />
                  </group>
                  {/* 우측 벽 안쪽 세로 서브프레임 (stepCeiling 단내림 높이) */}
                  <group
                    position={[
                      xOffset + width - frameThickness.right + mmToThreeUnits(9),
                      droppedCY,
                      furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(31)
                    ]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="right-surround-inner-side"
                      panelName="right-surround-inner-side"
                      furnitureId={rightMostModuleId}
                      key={`right-step-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        mmToThreeUnits(44),
                        droppedH,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={rightSubFrameMaterial ?? createFrameMaterial('right')}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                    />
                  </group>
                </>
              );
            }

            // 단내림이 없거나 왼쪽에 있는 경우 (일반구간)
            // 오른쪽이 단내림이면 이미 위에서 렌더링했으므로 여기서는 스킵
            if (!droppedCeilingEnabled || droppedCeilingPosition !== 'right') {
              const subFrameX = xOffset + width - frameThickness.right + mmToThreeUnits(9);
              // 우측 최외곽 가구(신발장 등)의 depth에 맞춰 서브프레임 Z 이동
              const rightSubEdgeMod = placedModulesFromStore.find((pm) => pm.id === rightMostModuleId);
              const rightSubEdgeZOffset = computeDepthZOffset(rightSubEdgeMod, 'any');
              const subFrameZ = furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(31) + rightSubEdgeZOffset;
              const subFrameMat = rightSubFrameMaterial ?? createFrameMaterial('right');

              // 분절 모드: 우측 최외곽이 상/하부만 → 각 가구 높이/Z/깊이에 맞춰
              if (isRightFrameSplit && spaceInfo.surroundType !== 'no-surround') {
                return (
                  <>
                    {rightOuterMods.map((om, idx) => {
                      const segH = mmToThreeUnits(om.heightMm);
                      const segCY = panelStartY + mmToThreeUnits(om.bottomMm) + segH / 2;
                      const refDepthMm = 600;
                      const depthDiff = mmToThreeUnits(refDepthMm - om.depthMm);
                      const segSubZ = subFrameZ - depthDiff;
                      return (
                        <group
                          key={`right-normal-vertical-split-${idx}-${om.category}-${Math.round(om.heightMm)}-${Math.round(om.bottomMm)}-${Math.round(om.depthMm)}`}
                          position={[subFrameX, segCY, segSubZ]}
                          rotation={[0, Math.PI / 2, 0]}
                        >
                          <BoxWithEdges
                            hideEdges={hideEdges}
                            name={`right-surround-inner-side-${idx}`}
                            panelName="right-surround-inner-side"
                            furnitureId={rightMostModuleId}
                            key={`right-normal-vertical-split-inner-${idx}-${om.category}-${Math.round(om.heightMm)}-${Math.round(om.bottomMm)}-${Math.round(om.depthMm)}-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                            args={[mmToThreeUnits(44), segH, mmToThreeUnits(END_PANEL_THICKNESS)]}
                            position={[0, 0, 0]}
                            material={subFrameMat}
                            renderMode={renderMode}
                            shadowEnabled={shadowEnabled}
                            excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                          />
                        </group>
                      );
                    })}
                  </>
                );
              }

              return (
                <>
                  {/* 세로 서브프레임 (슬롯 가이드 끝선에 맞춤: x축 -1mm 이동) */}
                  <group
                    position={[subFrameX, sideFrameCenterY, subFrameZ]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      name="right-surround-inner-side"
                      panelName="right-surround-inner-side"
                      furnitureId={rightMostModuleId}
                      key={`right-normal-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                      args={[
                        mmToThreeUnits(44),
                        adjustedPanelHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS)
                      ]}
                      position={[0, 0, 0]}
                      material={subFrameMat}
                      renderMode={renderMode}
                      shadowEnabled={shadowEnabled}
                      excludeKeys={[`${rightMostModuleId}::right-surround-lshape-side`, `${rightMostModuleId}::right-surround-lshape-front`]}
                    />
                  </group>
                </>
              );
            }
            return null;
          })()}

      {/* 하단 프레임 - 받침대 역할 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 받침대가 있는 경우에만 렌더링 */}
      {/* 하부 베이스프레임 - 균등분할: 전체 너비, 자유배치: 가구별 세그먼트 */}
      {effectiveShowFrame && baseFrameHeightMm > 0 && spaceInfo.baseConfig?.type === 'floor' && !(viewMode === '2D' && view2DDirection === 'top') && (() => {
        // 슬롯배치: 하부장/키큰장이 없으면 걸래받이 렌더링 안 함 (상부장만 있을 때는 숨김)
        const hasNonUpperFurniture = placedModulesFromStore.some(m =>
          !m.isSurroundPanel && !(m.moduleId || '').includes('upper-cabinet')
        );
        if (!isFreePlacement && !hasNonUpperFurniture) return null;
        // 모든 하부/키큰장 가구가 bottomPanelRaise 활성이면 걸래받이 전체 숨김
        // 일부만 활성이면 조절발 있는 가구용 걸래받이은 유지
        // 좌우분할 시 영역별 areaFinish도 확인
        const lowerFullModules = placedModulesFromStore.filter(m => {
          const id = m.moduleId || '';
          return !id.includes('upper');
        });
        const isAllRaised = lowerFullModules.length > 0 && lowerFullModules.every(m => {
          const secs = (m as any).customConfig?.sections;
          if (!secs?.[0]) return false;
          const sec0 = secs[0];
          // 섹션 전체 바닥판 올림
          if (sec0.bottomPanelRaise && sec0.bottomPanelRaise > 0) return true;
          // 좌우분할: 모든 영역이 바닥판 올림이면 전체 숨김
          if (sec0.areaFinish) {
            const hs = sec0.horizontalSplit;
            if (hs) {
              const leftRaise = sec0.areaFinish['left']?.bottomPanelRaise ?? 0;
              const rightRaise = sec0.areaFinish['right']?.bottomPanelRaise ?? 0;
              const centerRaise = sec0.areaFinish['center']?.bottomPanelRaise ?? 0;
              const is3split = hs.secondPosition !== undefined;
              if (is3split) return leftRaise > 0 && centerRaise > 0 && rightRaise > 0;
              return leftRaise > 0 && rightRaise > 0;
            }
          }
          return false;
        });
        if (isAllRaised) return null;
        return true;
      })() && (() => {

        // 자유배치 모드: 가구별 개별 걸래받이 렌더링 (상단몰딩과 동일 패턴)
        if (isFreePlacement) {
          const stripGroups = computeBaseStripGroups(placedModulesFromStore);
          if (stripGroups.length === 0) return null;

          const allBaseSegments: (FrameRenderSegment & { key: string })[] = [];
          const rawBaseMat = baseFrameMaterial ?? createFrameMaterial('base');
          // 디자인 모드: 조절발이 비치도록 반투명 처리
          const baseMat = isDesignMode && rawBaseMat instanceof THREE.MeshStandardMaterial
            ? (() => { const m = rawBaseMat.clone(); m.transparent = true; m.opacity = 0.35; m.depthWrite = false; m.needsUpdate = true; return m; })()
            : rawBaseMat;

          stripGroups.forEach((group) => {
            group.modules.filter((mod) => {
              if (((mod as any).placementWall || 'front') !== 'front') return false;
              if (mod.hasBase === false) return false;
              // Insert 프레임은 걸래받이(받침대) 불필요
              if (mod.moduleId?.includes('insert-frame')) return false;
              return true;
            }).forEach((mod) => {
              const bounds = getBaseFrameBoundsX(mod);
              const adjustedBaseBounds = applyFrameWidthAdjustMm(bounds.left, bounds.right, mod, 'base');
              const modWidthMM = adjustedBaseBounds.rightMm - adjustedBaseBounds.leftMm;
              const modCenterXmm = (adjustedBaseBounds.leftMm + adjustedBaseBounds.rightMm) / 2;
              const baseZPosition = getBaseFrameCenterZ(mod);
              const freeIsLower = getModuleCategory(mod) === 'lower';
              const rawBaseHeightMm = mod.baseFrameHeight ?? (freeIsLower
                ? (spaceInfo.baseboardLowerSize ?? 105)
                : (spaceInfo.baseConfig?.height ?? 60));
              const fallbackBaseGapMm = freeIsLower
                ? (spaceInfo.baseboardLowerGap ?? (spaceInfo.baseConfig as any)?.gap ?? 0)
                : ((spaceInfo.baseConfig as any)?.gap ?? 0);
              const modBaseFrameGapMm = rawBaseHeightMm > 0
                ? Math.max(0, Math.min(rawBaseHeightMm, mod.baseFrameGap ?? fallbackBaseGapMm))
                : 0;
              const modBaseHeightMm = Math.max(0, rawBaseHeightMm - modBaseFrameGapMm);
              const modBaseH = mmToThreeUnits(modBaseHeightMm);
              const modBaseGapThreeUnits = mmToThreeUnits(modBaseFrameGapMm);
              // gap은 걸레받이 하단 cut이다. 높이를 줄이고 중심만 gap만큼 보정해 윗선은 고정한다.
              const modBaseYCenter = panelStartY + floatHeight + modBaseGapThreeUnits + modBaseH / 2;

              // 커스터마이즈 가구 좌우분할: 무조건 걸래받이도 영역별 분할
              const customSec0 = (mod as any).customConfig?.sections?.[0];
              if (customSec0?.horizontalSplit && customSec0.areaFinish) {
                const hs = customSec0.horizontalSplit;
                const pnlThk = customSec0.panelThickness || (mod as any).customConfig?.panelThickness || 18;
                const innerW = modWidthMM - 2 * pnlThk;
                const leftInnerW = hs.position;
                const is3split = hs.secondPosition !== undefined;
                const centerInnerW = is3split ? hs.secondPosition : 0;
                const rightInnerW = innerW - leftInnerW - centerInnerW - (is3split ? 2 : 1) * pnlThk;

                const leftRaise = customSec0.areaFinish['left']?.bottomPanelRaise ?? 0;
                const rightRaise = customSec0.areaFinish['right']?.bottomPanelRaise ?? 0;
                const centerRaise = is3split ? (customSec0.areaFinish['center']?.bottomPanelRaise ?? 0) : 0;

                // 상하분할 하부 비움 체크: 비움이면 해당 영역 걸래받이도 숨김
                const subSplits = customSec0.areaSubSplits;
                const isSubLowerDeleted = (side: string) => {
                  const sub = subSplits?.[side];
                  return sub?.enabled && !sub.lowerElements;
                };
                const leftHidden = leftRaise > 0 || isSubLowerDeleted('left');
                const rightHidden = rightRaise > 0 || isSubLowerDeleted('right');
                const centerHidden = is3split ? (centerRaise > 0 || isSubLowerDeleted('center')) : false;
                const allHidden = leftHidden && rightHidden && (!is3split || centerHidden);

                if (allHidden) return; // 전체 숨김 → 걸래받이 없음

                // 좌우분할 시 무조건 영역별로 걸래받이 분할
                // 칸막이 귀속: non-raised 영역이 칸막이를 흡수 (raised 영역 옆 갭 방지)
                // 양쪽 모두 non-raised면 칸막이 중심에서 분할
                const modLeftMm = modCenterXmm - modWidthMM / 2;

                if (!is3split) {
                  // 2분할: 좌측 | 우측 (칸막이를 non-raised 쪽이 흡수)
                  const partitionStart = modLeftMm + pnlThk + leftInnerW; // 칸막이 시작 X

                  if (!leftHidden) {
                    // 좌측 piece: 좌측판 + 좌내경 + (우측 hidden이면 칸막이 전체, 아니면 절반)
                    const leftExtra = rightHidden ? pnlThk : pnlThk / 2;
                    const leftPieceW = pnlThk + leftInnerW + leftExtra;
                    allBaseSegments.push({
                      widthMm: leftPieceW,
                      centerXmm: modLeftMm + leftPieceW / 2,
                      zPosition: baseZPosition,
                      height: modBaseH,
                      yPosition: modBaseYCenter,
                      material: baseMat,
                      key: `free-base-strip-${group.id}-${mod.id}-left`,
                      placedModuleId: mod.id,
                    });
                  }

                  if (!rightHidden) {
                    // 우측 piece: (좌측 hidden이면 칸막이 전체, 아니면 절반) + 우내경 + 우측판
                    const rightExtra = leftHidden ? pnlThk : pnlThk / 2;
                    const rightPieceStartX = partitionStart + pnlThk - rightExtra;
                    const rightPieceW = rightExtra + Math.max(0, rightInnerW) + pnlThk;
                    allBaseSegments.push({
                      widthMm: rightPieceW,
                      centerXmm: rightPieceStartX + rightPieceW / 2,
                      zPosition: baseZPosition,
                      height: modBaseH,
                      yPosition: modBaseYCenter,
                      material: baseMat,
                      key: `free-base-strip-${group.id}-${mod.id}-right`,
                      placedModuleId: mod.id,
                    });
                  }
                } else {
                  // 3분할: 좌측 | 중앙 | 우측
                  const part1Start = modLeftMm + pnlThk + leftInnerW; // 첫 칸막이 시작
                  const part2Start = part1Start + pnlThk + centerInnerW; // 둘째 칸막이 시작

                  // 좌측 piece
                  if (!leftHidden) {
                    const leftExtra = centerHidden ? pnlThk : pnlThk / 2;
                    const leftPieceW = pnlThk + leftInnerW + leftExtra;
                    allBaseSegments.push({
                      widthMm: leftPieceW,
                      centerXmm: modLeftMm + leftPieceW / 2,
                      zPosition: baseZPosition,
                      height: modBaseH,
                      yPosition: modBaseYCenter,
                      material: baseMat,
                      key: `free-base-strip-${group.id}-${mod.id}-left`,
                      placedModuleId: mod.id,
                    });
                  }

                  // 중앙 piece
                  if (!centerHidden) {
                    const cLeftExtra = leftHidden ? pnlThk : pnlThk / 2;
                    const cRightExtra = rightHidden ? pnlThk : pnlThk / 2;
                    const centerPieceStartX = part1Start + pnlThk - cLeftExtra;
                    const centerPieceW = cLeftExtra + centerInnerW + cRightExtra;
                    allBaseSegments.push({
                      widthMm: centerPieceW,
                      centerXmm: centerPieceStartX + centerPieceW / 2,
                      zPosition: baseZPosition,
                      height: modBaseH,
                      yPosition: modBaseYCenter,
                      material: baseMat,
                      key: `free-base-strip-${group.id}-${mod.id}-center`,
                      placedModuleId: mod.id,
                    });
                  }

                  // 우측 piece
                  if (!rightHidden) {
                    const rightExtra = centerHidden ? pnlThk : pnlThk / 2;
                    const rightPieceStartX = part2Start + pnlThk - rightExtra;
                    const rightPieceW = rightExtra + Math.max(0, rightInnerW) + pnlThk;
                    allBaseSegments.push({
                      widthMm: rightPieceW,
                      centerXmm: rightPieceStartX + rightPieceW / 2,
                      zPosition: baseZPosition,
                      height: modBaseH,
                      yPosition: modBaseYCenter,
                      material: baseMat,
                      key: `free-base-strip-${group.id}-${mod.id}-right`,
                      placedModuleId: mod.id,
                    });
                  }
                }
                return;
              }
              // 섹션 전체 bottomPanelRaise → 걸래받이 없음
              if (customSec0?.bottomPanelRaise && customSec0.bottomPanelRaise > 0) return;

              // baseFrameOffset은 이미 baseZPosition에 반영됨
              allBaseSegments.push({
                widthMm: modWidthMM,
                centerXmm: modCenterXmm,
                zPosition: baseZPosition,
                height: modBaseH,
                yPosition: modBaseYCenter,
                material: baseMat,
                key: `free-base-strip-${group.id}-${mod.id}`,
                placedModuleId: mod.id,
              });
            });
          });

          // 설계 과정에서는 항상 분절 표시 (병합은 CNC 내보내기 시에만 적용)
          const renderBaseSegs = allBaseSegments;

          return (
            <>
              {renderBaseSegs.map((seg, idx) => {
                const args: [number, number, number] = [
                  mmToThreeUnits(seg.widthMm),
                  seg.height,
                  mmToThreeUnits(END_PANEL_THICKNESS)
                ];
                const pos: [number, number, number] = [
                  mmToThreeUnits(seg.centerXmm),
                  seg.yPosition,
                  seg.zPosition
                ];
                const isMergedHighlighted = false; // 설계 과정에서는 항상 분절
                const isIndividualHighlighted = seg.placedModuleId && highlightedFrame === `base-${seg.placedModuleId}`;
                const owningId = seg.placedModuleId || firstModuleId;
                return (
                  <React.Fragment key={`free-base-merged-${idx}`}>
                      <BoxWithEdges
                        hideEdges={hideEdges}
                        isOuterFrame
                        name={spaceInfo.frameMergeEnabled ? `base-frame-${idx}` : 'base-frame'}
                        args={args}
                      position={pos}
                      material={seg.material ?? baseMat}
                        renderMode={renderMode}
                        shadowEnabled={shadowEnabled}
                        excludeKey={`${owningId}::base-frame`}
                        furnitureId={owningId}
                        panelName="base-frame"
                      />
                    {(isMergedHighlighted || isIndividualHighlighted) && <mesh position={pos}><boxGeometry args={args} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>}
                  </React.Fragment>
                );
              })}
            </>
          );
        }

        // 균등분할 모드: 기존 전체 너비 렌더링
        return (
          <>
            {/* 노서라운드 모드에서 걸래받이 폭 디버깅 */}
            {/* spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [걸래받이] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${baseFrame.width.toFixed(2)}`) */}

            {/* 기둥이 있는 경우 걸래받이을 분절하여 렌더링 */}
            {(() => {
              const columns = spaceInfo.columns || [];

              // 슬롯 가이드와 동일한 범위 사용 - 모든 모드에서 calculateZoneSlotInfo 사용
              const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

              // 단내림이 활성화된 경우 두 영역 모두에 걸래받이 렌더링
              const renderZones = [];

              if (spaceInfo.droppedCeiling?.enabled && zoneInfo.dropped) {
                // 단내림 구간 추가
                renderZones.push({
                  zone: 'dropped',
                  startX: zoneInfo.dropped.startX,
                  width: zoneInfo.dropped.width,
                  endX: zoneInfo.dropped.startX + zoneInfo.dropped.width
                });
                // 메인 구간 추가
                renderZones.push({
                  zone: 'normal',
                  startX: zoneInfo.normal.startX,
                  width: zoneInfo.normal.width,
                  endX: zoneInfo.normal.startX + zoneInfo.normal.width
                });
              } else {
                // 단내림이 없는 경우 메인 구간만
                renderZones.push({
                  zone: 'normal',
                  startX: zoneInfo.normal.startX,
                  width: zoneInfo.normal.width,
                  endX: zoneInfo.normal.startX + zoneInfo.normal.width
                });
              }

              // 각 영역에 대해 걸래받이 렌더링
              return renderZones.map((renderZone, zoneIndex) => {
                // 단내림 구간은 별도 material 인스턴스 사용 (R3F primitive attach 이슈 방지)
                const rawZoneMaterial = renderZone.zone === 'dropped'
                  ? (baseDroppedFrameMaterial ?? createFrameMaterial('base'))
                  : (baseFrameMaterial ?? createFrameMaterial('base'));
                // 디자인 모드: 조절발이 비치도록 반투명 처리
                const zoneMaterial = isDesignMode && rawZoneMaterial instanceof THREE.MeshStandardMaterial
                  ? (() => { const m = rawZoneMaterial.clone(); m.transparent = true; m.opacity = 0.35; m.depthWrite = false; m.needsUpdate = true; return m; })()
                  : rawZoneMaterial;
                // mm 단위를 Three.js 단위로 변환 - 노서라운드에서 엔드패널 제외
                let frameStartX = mmToThreeUnits(renderZone.startX);
                let frameEndX = mmToThreeUnits(renderZone.endX);

                // 노서라운드 모드에서 세미스탠딩/프리스탠딩은 엔드패널을 제외한 프레임 범위 계산
                if (spaceInfo.surroundType === 'no-surround' &&
                  (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing' ||
                    spaceInfo.installType === 'freestanding')) {
                  if (spaceInfo.installType === 'freestanding') {
                    // 프리스탠딩(벽없음)+노서라운드: 양쪽 모두 항상 18mm 감소 (엔드패널 공간)
                    frameStartX += mmToThreeUnits(END_PANEL_THICKNESS);
                    frameEndX -= mmToThreeUnits(END_PANEL_THICKNESS);
                  } else {
                    // 세미스탠딩: 엔드패널이 있는 쪽만 프레임 범위에서 제외
                    if (endPanelPositions.left) {
                      frameStartX += mmToThreeUnits(END_PANEL_THICKNESS);
                    }
                    if (endPanelPositions.right) {
                      frameEndX -= mmToThreeUnits(END_PANEL_THICKNESS);
                    }
                  }
                }

                const frameWidth = frameEndX - frameStartX;
                const frameX = (frameStartX + frameEndX) / 2;

                // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
                const hasDeepColumns = columns.some(column => column.depth >= 730);

                // console.log('🔧 [걸래받이 윗면] 기둥 분절 확인:', {
                //   columnsCount: columns.length,
                //   hasDeepColumns,
                //   columnDepths: columns.map(c => c.depth)
                // });

                if (columns.length === 0 || !hasDeepColumns) {
                  // 슬롯배치: 하부장/키큰장이 없으면 걸래받이 없음 (상부장만 있을 때 숨김)
                  const slotModsForBase = placedModulesFromStore.filter(m =>
                    !m.isSurroundPanel && !(m.moduleId || '').includes('upper-cabinet')
                  );
                  if (slotModsForBase.length === 0) return null;

                  const globalBaseHeightMm = spaceInfo.baseConfig?.height ?? 65;
                  const baseMat = zoneMaterial;
                  const isSideViewBase = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');

                  // 세그먼트 수집
                  const slotBaseSegments: (FrameRenderSegment & { key: string })[] = [];
                  slotModsForBase
                    .filter(mod => {
                      if (((mod as any).placementWall || 'front') !== 'front') return false;
                      if (mod.hasBase === false) return false;
                      // Insert 프레임: 자체적으로 바닥~천장 ㄷ자 구조이므로 공간 걸래받이 불필요
                      if (mod.moduleId?.includes('insert-frame')) return false;
                      if (isSideViewBase && selectedSlotIndex !== null && mod.slotIndex !== undefined) {
                        const isDual = mod.isDualSlot || mod.moduleId?.includes('dual-');
                        if (isDual) {
                          if (mod.slotIndex !== selectedSlotIndex && mod.slotIndex + 1 !== selectedSlotIndex) return false;
                        } else {
                          if (mod.slotIndex !== selectedSlotIndex) return false;
                        }
                      }
                      return true;
                    })
                    .forEach((mod) => {
                      const bounds = getModuleBoundsX(mod);
                      let modWidthMM = bounds.right - bounds.left;
                      let modCenterXmm = (bounds.left + bounds.right) / 2;
                      // 기둥 회피로 인한 adjustedWidth/adjustedPosition 반영 (슬롯배치)
                      // 단, 기둥 앞 배치(front) 모드는 슬롯 전체 너비/슬롯 중심으로 복원
                      const isFrontMode = (mod as any).columnPlacementMode === 'front';
                      const adjW = (mod as any).adjustedWidth;
                      const adjPosX = (mod as any).adjustedPosition?.x;
                      if (isFrontMode && mod.slotIndex !== undefined) {
                        const slotW = indexingForCheck.slotWidths?.[mod.slotIndex] ?? indexingForCheck.columnWidth;
                        const slotCx = indexingForCheck.threeUnitPositions?.[mod.slotIndex];
                        if (slotW != null && slotCx != null) {
                          modWidthMM = slotW;
                          modCenterXmm = slotCx * 100;
                        }
                      } else if (adjW != null && adjW > 0) {
                        modWidthMM = adjW;
                        if (adjPosX != null) modCenterXmm = adjPosX * 100;
                      }
                      const epThk = resolvePetPanelThicknessMm(mod.endPanelThickness);
                      // EP 하단 갭이 0/음수이면 걸레받이가 EP 자리까지 X 확장 → 축소 안 함
                      // 외치(outside) EP: 본체가 안 줄고 EP가 바깥에 추가되므로 걸레받이도 본체폭 그대로(축소 X)
                      const epBottomGapMm = (mod as any).endPanelBottomOffset;
                      const shouldInsetForBottomEpCollision = (mod.endPanelMode !== 'outside')
                        && (epBottomGapMm === undefined || epBottomGapMm > 0);
                      if (mod.hasLeftEndPanel && shouldInsetForBottomEpCollision) { modWidthMM -= epThk; modCenterXmm += epThk / 2; }
                      if (mod.hasRightEndPanel && shouldInsetForBottomEpCollision) { modWidthMM -= epThk; modCenterXmm -= epThk / 2; }
                      const adjustedSlotBaseBounds = applyFrameWidthAdjustMm(
                        modCenterXmm - modWidthMM / 2,
                        modCenterXmm + modWidthMM / 2,
                        mod,
                        'base'
                      );
                      modWidthMM = adjustedSlotBaseBounds.rightMm - adjustedSlotBaseBounds.leftMm;
                      modCenterXmm = (adjustedSlotBaseBounds.leftMm + adjustedSlotBaseBounds.rightMm) / 2;
                      const slotBaseShoeMid = mod.moduleId || '';
                      const slotBaseCategory = getModuleCategory(mod);
                      const slotBaseIsLower = slotBaseCategory === 'lower'
                        || slotBaseShoeMid.startsWith('lower-')
                        || slotBaseShoeMid.includes('dual-lower-');
                      const rawBaseHeight = mod.baseFrameHeight ?? (slotBaseIsLower
                        ? (spaceInfo.baseboardLowerSize ?? 105)
                        : globalBaseHeightMm);
                      const fallbackBaseGapMm = slotBaseIsLower
                        ? (spaceInfo.baseboardLowerGap ?? (spaceInfo.baseConfig as any)?.gap ?? 0)
                        : ((spaceInfo.baseConfig as any)?.gap ?? 0);
                      const baseFrameGapMm = rawBaseHeight > 0
                        ? Math.max(0, Math.min(rawBaseHeight, mod.baseFrameGap ?? fallbackBaseGapMm))
                        : 0;
                      const modBaseHeight = Math.max(0, rawBaseHeight - baseFrameGapMm);
                      const modBaseH = mmToThreeUnits(modBaseHeight);
                      const baseGapThreeUnits = mmToThreeUnits(baseFrameGapMm);
                      const modBaseYCenter = panelStartY + floatHeight + baseGapThreeUnits + modBaseH / 2;
                      const baseZPosition = getBaseFrameCenterZ(mod);

                      // 커스터마이즈 가구 좌우분할: 무조건 걸래받이도 영역별 분할
                      const customSec0 = (mod as any).customConfig?.sections?.[0];
                      if (customSec0?.horizontalSplit && customSec0.areaFinish) {
                        const hs = customSec0.horizontalSplit;
                        const pnlThk = customSec0.panelThickness || (mod as any).customConfig?.panelThickness || 18;
                        const innerW = modWidthMM - 2 * pnlThk;
                        const leftInnerW = hs.position;
                        const is3split = hs.secondPosition !== undefined;
                        const centerInnerW = is3split ? hs.secondPosition : 0;
                        const rightInnerW = innerW - leftInnerW - centerInnerW - (is3split ? 2 : 1) * pnlThk;

                        const leftRaise = customSec0.areaFinish['left']?.bottomPanelRaise ?? 0;
                        const rightRaise = customSec0.areaFinish['right']?.bottomPanelRaise ?? 0;
                        const centerRaise = is3split ? (customSec0.areaFinish['center']?.bottomPanelRaise ?? 0) : 0;

                        // 상하분할 하부 비움 체크: 비움이면 해당 영역 걸래받이도 숨김
                        const subSplits = customSec0.areaSubSplits;
                        const isSubLowerDeleted = (side: string) => {
                          const sub = subSplits?.[side];
                          return sub?.enabled && !sub.lowerElements;
                        };
                        const leftHidden = leftRaise > 0 || isSubLowerDeleted('left');
                        const rightHidden = rightRaise > 0 || isSubLowerDeleted('right');
                        const centerHidden = is3split ? (centerRaise > 0 || isSubLowerDeleted('center')) : false;
                        const allHidden = leftHidden && rightHidden && (!is3split || centerHidden);

                        if (allHidden) return; // 전체 숨김 → 걸래받이 없음

                        // 좌우분할 시 무조건 영역별로 걸래받이 분할
                        // 칸막이 귀속: non-raised 영역이 칸막이를 흡수 (raised 영역 옆 갭 방지)
                        const modLeftMm = modCenterXmm - modWidthMM / 2;

                        if (!is3split) {
                          // 2분할
                          const partitionStart = modLeftMm + pnlThk + leftInnerW;

                          if (!leftHidden) {
                            const leftExtra = rightHidden ? pnlThk : pnlThk / 2;
                            const leftPieceW = pnlThk + leftInnerW + leftExtra;
                            slotBaseSegments.push({
                              widthMm: leftPieceW,
                              centerXmm: modLeftMm + leftPieceW / 2,
                              zPosition: baseZPosition,
                              height: modBaseH,
                              yPosition: modBaseYCenter,
                              material: baseMat,
                              key: `slot-base-${mod.id}-left`,
                              placedModuleId: mod.id,
                            });
                          }

                          if (!rightHidden) {
                            const rightExtra = leftHidden ? pnlThk : pnlThk / 2;
                            const rightPieceStartX = partitionStart + pnlThk - rightExtra;
                            const rightPieceW = rightExtra + Math.max(0, rightInnerW) + pnlThk;
                            slotBaseSegments.push({
                              widthMm: rightPieceW,
                              centerXmm: rightPieceStartX + rightPieceW / 2,
                              zPosition: baseZPosition,
                              height: modBaseH,
                              yPosition: modBaseYCenter,
                              material: baseMat,
                              key: `slot-base-${mod.id}-right`,
                              placedModuleId: mod.id,
                            });
                          }
                        } else {
                          // 3분할
                          const part1Start = modLeftMm + pnlThk + leftInnerW;
                          const part2Start = part1Start + pnlThk + centerInnerW;

                          if (!leftHidden) {
                            const leftExtra = centerHidden ? pnlThk : pnlThk / 2;
                            const leftPieceW = pnlThk + leftInnerW + leftExtra;
                            slotBaseSegments.push({
                              widthMm: leftPieceW,
                              centerXmm: modLeftMm + leftPieceW / 2,
                              zPosition: baseZPosition,
                              height: modBaseH,
                              yPosition: modBaseYCenter,
                              material: baseMat,
                              key: `slot-base-${mod.id}-left`,
                              placedModuleId: mod.id,
                            });
                          }

                          if (!centerHidden) {
                            const cLeftExtra = leftHidden ? pnlThk : pnlThk / 2;
                            const cRightExtra = rightHidden ? pnlThk : pnlThk / 2;
                            const centerPieceStartX = part1Start + pnlThk - cLeftExtra;
                            const centerPieceW = cLeftExtra + centerInnerW + cRightExtra;
                            slotBaseSegments.push({
                              widthMm: centerPieceW,
                              centerXmm: centerPieceStartX + centerPieceW / 2,
                              zPosition: baseZPosition,
                              height: modBaseH,
                              yPosition: modBaseYCenter,
                              material: baseMat,
                              key: `slot-base-${mod.id}-center`,
                              placedModuleId: mod.id,
                            });
                          }

                          if (!rightHidden) {
                            const rightExtra = centerHidden ? pnlThk : pnlThk / 2;
                            const rightPieceStartX = part2Start + pnlThk - rightExtra;
                            const rightPieceW = rightExtra + Math.max(0, rightInnerW) + pnlThk;
                            slotBaseSegments.push({
                              widthMm: rightPieceW,
                              centerXmm: rightPieceStartX + rightPieceW / 2,
                              zPosition: baseZPosition,
                              height: modBaseH,
                              yPosition: modBaseYCenter,
                              material: baseMat,
                              key: `slot-base-${mod.id}-right`,
                              placedModuleId: mod.id,
                            });
                          }
                        }
                        return;
                      }
                      // 섹션 전체 bottomPanelRaise → 걸래받이 없음
                      if (customSec0?.bottomPanelRaise && customSec0.bottomPanelRaise > 0) return;

                      // baseFrameOffset: 양수 = 안쪽(뒤쪽)으로 들어감
                      slotBaseSegments.push({
                        widthMm: modWidthMM,
                        centerXmm: modCenterXmm,
                        zPosition: baseZPosition,
                        height: modBaseH,
                        yPosition: modBaseYCenter,
                        material: baseMat,
                        key: `slot-base-${mod.id}`,
                        placedModuleId: mod.id,
                      });
                    });

                  // 설계 과정에서는 항상 분절 표시 (병합은 CNC 내보내기 시에만 적용)
                  const renderSlotBaseSegs = slotBaseSegments;

                  return (
                    <React.Fragment key={`base-frame-zone-${zoneIndex}`}>
                      {renderSlotBaseSegs.map((seg, idx) => {
                        const args: [number, number, number] = [
                          mmToThreeUnits(seg.widthMm),
                          seg.height,
                          mmToThreeUnits(END_PANEL_THICKNESS)
                        ];
                        const pos: [number, number, number] = [
                          mmToThreeUnits(seg.centerXmm),
                          seg.yPosition,
                          seg.zPosition
                        ];
                        const isMergedHighlighted = false; // 설계 과정에서는 항상 분절
                        const isIndividualHighlighted = seg.placedModuleId && highlightedFrame === `base-${seg.placedModuleId}`;
                        const owningId = seg.placedModuleId || firstModuleId;
                        return (
                          <React.Fragment key={`slot-base-merged-${idx}`}>
                            <BoxWithEdges
                              hideEdges={hideEdges}
                              isOuterFrame
                              name={spaceInfo.frameMergeEnabled ? `base-frame-${idx}` : 'base-frame'}
                              args={args}
                              position={pos}
                              material={seg.material ?? baseMat}
                              renderMode={renderMode}
                              shadowEnabled={shadowEnabled}
                              renderOrder={seg.behindCeiling ? -1 : undefined}
                              excludeKey={`${owningId}::base-frame`}
                              furnitureId={owningId}
                              panelName="base-frame"
                            />
                            {(isMergedHighlighted || isIndividualHighlighted) && <mesh position={pos}><boxGeometry args={args} /><primitive object={highlightOverlayMaterial} attach="material" /></mesh>}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                }

                // 기둥이 있는 경우 분절된 프레임들 렌더링
                const frameSegments: Array<{
                  width: number;
                  x: number;
                }> = [];

                // 프레임 범위는 이미 엔드패널이 조정되어 있음
                const adjustedFrameStartXCalc = frameStartX;
                const adjustedFrameEndXCalc = frameEndX;
                const zoneBaseFrameOffset = mmToThreeUnits(spaceInfo.baseConfig?.offset ?? 0);

// console.log('🔧 걸래받이 분절 엔드패널 조정:', {
                  // 조정된시작: adjustedFrameStartXCalc,
                  // 조정된끝: adjustedFrameEndXCalc,
                  // 왼쪽엔드패널: endPanelPositions.left,
                  // 오른쪽엔드패널: endPanelPositions.right
                // });

                // 기둥들을 X 위치 기준으로 정렬
                const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);

                let currentX = adjustedFrameStartXCalc;

                // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
                sortedColumns.forEach((column, index) => {
                  const columnWidthM = column.width * 0.01; // mm to Three.js units
                  const columnLeftX = column.position[0] - columnWidthM / 2;
                  const columnRightX = column.position[0] + columnWidthM / 2;

                  // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
                  if (columnLeftX < adjustedFrameEndXCalc && columnRightX > adjustedFrameStartXCalc && column.depth >= 730) {
                    // 기둥 왼쪽 프레임 세그먼트
                    const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                    if (leftSegmentWidth > 0) {
                      frameSegments.push({
                        width: leftSegmentWidth,
                        x: currentX + leftSegmentWidth / 2
                      });
                    }

                    // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
                    currentX = columnRightX;
                  }
                });

                // 마지막 세그먼트 (마지막 기둥 오른쪽)
                const lastSegmentWidth = Math.max(0, adjustedFrameEndXCalc - currentX);
                if (lastSegmentWidth > 0) {
                  frameSegments.push({
                    width: lastSegmentWidth,
                    x: currentX + lastSegmentWidth / 2
                  });
                }

                // 분절된 프레임들 렌더링 (분절이 없으면 기본 프레임 렌더링)
                if (frameSegments.length === 0) {
                  return (
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      isOuterFrame
                      key={`base-frame-zone-${zoneIndex}`}
                      name="base-frame"
                      args={[
                        frameWidth,
                        baseFrameHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                      ]}
                      position={[
                        frameX, // 중앙 정렬
                        panelStartY + floatHeight + baseFrameHeight / 2, // 바닥마감재 위 + 원래 높이
                        furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 -
                        mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo)) -
                        zoneBaseFrameOffset
                      ]}
                      material={zoneMaterial}
                      renderMode={renderMode}

                      shadowEnabled={shadowEnabled}
                      excludeKey={`${firstModuleId}::base-frame`}
                      furnitureId={firstModuleId}
                      dimensionFurnitureIds={frameDimensionFurnitureIds}
                      panelName="base-frame"
                    />
                  );
                }

                return frameSegments.map((segment, segmentIndex) => {
                  if (!baseFrameMaterial) {
                    console.warn(`⚠️ Base frame segment ${segmentIndex} - material not ready, using default`);
                  } else {
// console.log(`🎨 Base frame segment ${segmentIndex} material:`, {
                      // hasBaseFrameMaterial: !!baseFrameMaterial,
                      // materialType: baseFrameMaterial?.type,
                      // materialColor: baseFrameMaterial && 'color' in baseFrameMaterial ? (baseFrameMaterial as any).color.getHexString() : 'unknown',
                      // materialTexture: baseFrameMaterial && 'map' in baseFrameMaterial ? !!(baseFrameMaterial as any).map : false,
                      // doorColor: materialConfig?.doorColor,
                      // doorTexture: materialConfig?.doorTexture,
                      // segmentWidth: segment.width
                    // });
                  }

                  return (
                    <BoxWithEdges
                      hideEdges={hideEdges}
                      isOuterFrame
                      key={`base-frame-zone-${zoneIndex}-segment-${segmentIndex}`}
                      name="base-frame"
                      args={[
                        segment.width,
                        baseFrameHeight,
                        mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                      ]}
                      position={[
                        segment.x, // 분절된 위치
                        panelStartY + floatHeight + baseFrameHeight / 2, // 바닥마감재 위 + 원래 높이
                        furnitureZOffset + furnitureDepth / 2 - mmToThreeUnits(END_PANEL_THICKNESS) / 2 - mmToThreeUnits(END_PANEL_THICKNESS) -
                        zoneBaseFrameOffset
                      ]}
                      material={zoneMaterial}
                      renderMode={renderMode}

                      shadowEnabled={shadowEnabled}
                      excludeKey={`${firstModuleId}::base-frame`}
                      furnitureId={firstModuleId}
                      dimensionFurnitureIds={frameDimensionFurnitureIds}
                      panelName="base-frame"
                    />
                  );
                });
              });
            })()}
          </>
        );
      })()}

      {/* 하단 서브프레임 제거됨 */}

      {/* 배치된 가구들 */}
      {placedModules ? (
        // placedModules prop이 전달된 경우 (뷰어 모드)
        <>
          {(() => {
            // 1. activeZone이 있고 단내림이 활성화된 경우 zone 기준 필터링
            let filteredModules = activeZone && spaceInfo.droppedCeiling?.enabled && placedModules.length > 0
              ? placedModules.filter(module => module.zone === activeZone)
              : placedModules;

            // 2. 측면뷰이고 selectedSlotIndex가 있는 경우 슬롯/커스텀가이드 기준 필터링
            if (
              viewMode === '2D' &&
              (view2DDirection === 'left' || view2DDirection === 'right') &&
              selectedSlotIndex !== null
            ) {
              filteredModules = filterSideViewModules({
                placedModules: filteredModules,
                viewDirection: view2DDirection,
                selectedSlotIndex,
                isFreePlacement: isFreePlacement || spaceInfo.customGuideMode === true,
                spaceInfo,
                excludeSurroundPanels: false
              });
            }

            return (
              <>
                <PlacedFurnitureContainer
                  viewMode={viewMode}
                  view2DDirection={view2DDirection}
                  renderMode={renderMode}
                  placedModules={filteredModules}
                  showFurniture={showFurniture}
                  readOnly={readOnly}
                  onFurnitureClick={onFurnitureClick}
                  ghostHighlightSlotIndex={ghostHighlightSlotIndex}
                  islandSideFilter={islandSideFilter}
                />
                {/* 보링 시각화 오버레이 */}
                {showBorings && (
                  <FurnitureBoringOverlay
                    viewMode={viewMode}
                    opacity={0.7}
                    showLabels={false}
                  />
                )}
              </>
            );
          })()}
        </>
      ) : (
        // placedModules prop이 없는 경우 (에디터 모드)
        // key에 placedModules 해시를 사용하여 가구 속성 변경 시 re-render 보장
        <>
          <PlacedFurnitureContainer
            viewMode={viewMode}
            view2DDirection={view2DDirection}
            renderMode={renderMode}
            activeZone={activeZone}
            showFurniture={showFurniture}
            readOnly={readOnly}
            onFurnitureClick={onFurnitureClick}
            ghostHighlightSlotIndex={ghostHighlightSlotIndex}
            islandSideFilter={islandSideFilter}
          />
          {/* 보링 시각화 오버레이 */}
          {showBorings && (
            <FurnitureBoringOverlay
              viewMode={viewMode}
              opacity={0.7}
              showLabels={false}
            />
          )}
        </>
      )}
    </group>
  );
};

// Room 컴포넌트를 메모이제이션하여 불필요한 리렌더링 방지
export default React.memo(Room, (prevProps, nextProps) => {
  // 기본 props 비교
  if (prevProps.viewMode !== nextProps.viewMode) return false;
  if (prevProps.view2DDirection !== nextProps.view2DDirection) return false;
  if (prevProps.renderMode !== nextProps.renderMode) return false;
  if (prevProps.showAll !== nextProps.showAll) return false;
  if (prevProps.floorColor !== nextProps.floorColor) return false;
  if (prevProps.showFrame !== nextProps.showFrame) return false;
  if (prevProps.showDimensions !== nextProps.showDimensions) return false;
  if (prevProps.showFurniture !== nextProps.showFurniture) return false;
  if (prevProps.isStep2 !== nextProps.isStep2) return false;
  if (prevProps.activeZone !== nextProps.activeZone) return false;
  if (prevProps.ghostHighlightSlotIndex !== nextProps.ghostHighlightSlotIndex) return false;

  // spaceInfo 비교 (크기와 재질만 비교, 기둥 제외)
  const prevSpace = prevProps.spaceInfo;
  const nextSpace = nextProps.spaceInfo;

  if (prevSpace.width !== nextSpace.width) return false;
  if (prevSpace.height !== nextSpace.height) return false;
  if (prevSpace.depth !== nextSpace.depth) return false;
  if (prevSpace.leftSurround !== nextSpace.leftSurround) return false;
  if (prevSpace.rightSurround !== nextSpace.rightSurround) return false;
  if (prevSpace.hasWallFinish !== nextSpace.hasWallFinish) return false;
  if (prevSpace.wallFinishThickness !== nextSpace.wallFinishThickness) return false;
  if (prevSpace.hasFloorFinish !== nextSpace.hasFloorFinish) return false;
  if ((prevSpace.floorFinish?.height ?? 0) !== (nextSpace.floorFinish?.height ?? 0)) return false;

  // surroundType 비교 (노서라운드 설정 변경 시 프레임 업데이트)
  if (prevSpace.surroundType !== nextSpace.surroundType) return false;

  // frameConfig 비교 (전체서라운드 ↔ 양쪽서라운드 전환 시 업데이트)
  if (JSON.stringify(prevSpace.frameConfig) !== JSON.stringify(nextSpace.frameConfig)) return false;

  // frameSize 비교 (프레임 크기 변경 시 업데이트)
  if (JSON.stringify(prevSpace.frameSize) !== JSON.stringify(nextSpace.frameSize)) return false;

  // 재질 설정 비교
  if (JSON.stringify(prevSpace.materialConfig) !== JSON.stringify(nextSpace.materialConfig)) return false;
  if (JSON.stringify(prevProps.materialConfig) !== JSON.stringify(nextProps.materialConfig)) return false;

  // baseConfig 비교 (설치 타입 변경 시 벽 높이 업데이트를 위해)
  if (JSON.stringify(prevSpace.baseConfig) !== JSON.stringify(nextSpace.baseConfig)) return false;

  // installType과 wallConfig 비교 (벽 렌더링에 영향)
  if (prevSpace.installType !== nextSpace.installType) return false;
  if (JSON.stringify(prevSpace.wallConfig) !== JSON.stringify(nextSpace.wallConfig)) return false;

  // gapConfig 비교 (노서라운드 모드에서 엔드패널 위치에 영향)
  if (JSON.stringify(prevSpace.gapConfig) !== JSON.stringify(nextSpace.gapConfig)) return false;

  // freeSurround 비교 (자유배치 서라운드 토글)
  if (JSON.stringify(prevSpace.freeSurround) !== JSON.stringify(nextSpace.freeSurround)) return false;

  // surroundOffsetBase 비교 (서라운드 옵셋 기준 변경)
  if (prevSpace.surroundOffsetBase !== nextSpace.surroundOffsetBase) return false;
  // frameOffsetBase 비교 (상걸래받이 옵셋 기준 변경)
  if (prevSpace.frameOffsetBase !== nextSpace.frameOffsetBase) return false;

  // 가구 배치 비교
  const prevModules = prevProps.placedModules || [];
  const nextModules = nextProps.placedModules || [];
  if (prevModules.length !== nextModules.length) return false;

  // 개별 가구 속성 비교 (freeHeight, freeWidth, freeDepth, customConfig 등 변경 감지)
  for (let i = 0; i < prevModules.length; i++) {
    const prev = prevModules[i];
    const next = nextModules[i];
    if (!prev || !next) return false;
    if (prev.id !== next.id) return false;
    if (prev.moduleId !== next.moduleId) return false;
    if (prev.freeHeight !== next.freeHeight) return false;
    if (prev.freeWidth !== next.freeWidth) return false;
    if (prev.freeDepth !== next.freeDepth) return false;
    if (prev.freeX !== next.freeX) return false;
    if (prev.slotIndex !== next.slotIndex) return false;
    if (prev.customWidth !== next.customWidth) return false;
    if (prev.adjustedWidth !== next.adjustedWidth) return false;
    if (prev.hasTopFrame !== next.hasTopFrame) return false;
    if (prev.topFrameThickness !== next.topFrameThickness) return false;
    if (prev.topFrameGap !== next.topFrameGap) return false;
    if (prev.topFrameOffset !== next.topFrameOffset) return false;
    if (prev.hasBase !== next.hasBase) return false;
    if (prev.baseFrameHeight !== next.baseFrameHeight) return false;
    if (prev.baseFrameGap !== next.baseFrameGap) return false;
    if (prev.baseFrameOffset !== next.baseFrameOffset) return false;
    if (prev.individualFloatHeight !== next.individualFloatHeight) return false;
    if (prev.customSections !== next.customSections) return false;
    if (prev.customConfig !== next.customConfig) return false;
    if (prev.hasLeftEndPanel !== next.hasLeftEndPanel) return false;
    if (prev.hasRightEndPanel !== next.hasRightEndPanel) return false;
    if (prev.hasBottomEndPanel !== next.hasBottomEndPanel) return false;
    if (prev.hasTopEndPanel !== next.hasTopEndPanel) return false;
    if (prev.topEndPanelOffset !== next.topEndPanelOffset) return false;
    if (prev.topEndPanelBackOffset !== next.topEndPanelBackOffset) return false;
    if (prev.topEndPanelBackLip !== next.topEndPanelBackLip) return false;
    if (prev.topEndPanelBackLipThickness !== next.topEndPanelBackLipThickness) return false;
    if (JSON.stringify(prev.hingePositionsMm) !== JSON.stringify(next.hingePositionsMm)) return false;
    if (JSON.stringify(prev.upperDoorHingePositionsMm) !== JSON.stringify(next.upperDoorHingePositionsMm)) return false;
    if (JSON.stringify(prev.lowerDoorHingePositionsMm) !== JSON.stringify(next.lowerDoorHingePositionsMm)) return false;
  }

  // 기둥 배열이 변경되었는지 확인 (프레임 분절에 영향)
  const prevColumns = prevSpace.columns || [];
  const nextColumns = nextSpace.columns || [];

  // 기둥 개수가 다르면 리렌더
  if (prevColumns.length !== nextColumns.length) return false;

  // 기둥의 위치가 크게 변경되었는지 확인 (아주 작은 변화는 무시)
  for (let i = 0; i < prevColumns.length; i++) {
    const prevCol = prevColumns[i];
    const nextCol = nextColumns.find(c => c.id === prevCol.id);
    if (!nextCol) return false;

    // 위치 차이가 0.01 이상이면 리렌더 (약 1mm)
    if (Math.abs(prevCol.position[0] - nextCol.position[0]) > 0.01) return false;
    if (Math.abs(prevCol.position[2] - nextCol.position[2]) > 0.01) return false;

    // 크기가 변경되면 리렌더
    if (prevCol.width !== nextCol.width) return false;
    if (prevCol.depth !== nextCol.depth) return false;
    if (prevCol.height !== nextCol.height) return false;
  }

  // 모든 비교를 통과하면 리렌더링하지 않음
  return true;
}); 
