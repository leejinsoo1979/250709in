import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateInternalSpace } from '../../utils/geometry';
import { getModuleById } from '@/data/modules';
import {
  getInternalSpaceBoundsX,
  clampToSpaceBoundsX,
  checkFreeCollision,
  getModuleBoundsX,
  detectDroppedZone,
  getModuleCategory,
  FurnitureBoundsX,
} from '@/editor/shared/utils/freePlacementUtils';
import { placeFurnitureFree, calculateYPosition } from '@/editor/shared/furniture/hooks/usePlaceFurnitureFree';
import BoxModule from '../modules/BoxModule';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { isCustomizableModuleId, getCustomizableCategory, getCustomDimensionKey, getStandardDimensionKey, CUSTOMIZABLE_DEFAULTS } from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { IoLockClosed, IoLockOpen } from 'react-icons/io5';

// 키보드 이동 단위 (mm)
const KEYBOARD_STEP_MM = 1;
const KEYBOARD_SHIFT_STEP_MM = 10;

/** bufferAttribute가 변해도 실시간 갱신되는 라인 컴포넌트 */
const DynamicLine: React.FC<{ points: number[]; color: string }> = ({ points, color }) => {
  const ref = useRef<THREE.BufferAttribute>(null);
  const arr = useMemo(() => new Float32Array(points), [points]);
  useEffect(() => {
    if (ref.current) {
      ref.current.array = arr;
      ref.current.needsUpdate = true;
    }
  }, [arr]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute ref={ref} attach="attributes-position" array={arr} count={arr.length / 3} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={1} />
    </line>
  );
};

/**
 * 자유배치 모드 - 클릭 배치 + 배치된 가구 이동
 * 1. 썸네일 클릭 → 고스트 나타남
 * 2. 마우스 이동 → 고스트 따라다니며 좌우 이격거리 실시간 표시
 * 3. 클릭 → 즉시 배치
 * 4. 배치된 가구 클릭 → 선택 후 마우스 드래그 또는 키보드 좌우키로 이동
 */
const FreePlacementDropZone: React.FC = () => {
  const { spaceInfo, setLockedWallGap } = useSpaceConfigStore();
  const { selectedFurnitureId, placedModules, addModule, updatePlacedModule, lastCustomDimensions, pendingCustomConfig } = useFurnitureStore();
  const { theme } = useTheme();
  const activePopup = useUIStore(state => state.activePopup);
  const pendingPlacement = useMyCabinetStore(state => state.pendingPlacement);

  const [hoverXmm, setHoverXmm] = useState<number | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const [isSnapped, setIsSnapped] = useState(false);
  const planeRef = useRef<THREE.Mesh>(null);

  // 배치된 가구 이동 상태
  const [movingModuleId, setMovingModuleId] = useState<string | null>(null);
  const [isDraggingPlaced, setIsDraggingPlaced] = useState(false);
  const dragPlaneRef = useRef<THREE.Mesh>(null);

  const isFreePlacement = spaceInfo.layoutMode === 'free-placement';

  // 테마 색상 (Three.js용 hex)
  const themeColorMap: Record<string, string> = {
    green: '#10b981', blue: '#3b82f6', purple: '#8b5cf6', vivid: '#a25378',
    red: '#D2042D', pink: '#ec4899', indigo: '#6366f1', teal: '#14b8a6',
    yellow: '#eab308', gray: '#6b7280', cyan: '#06b6d4', lime: '#84cc16',
    black: '#1a1a1a', wine: '#845EC2', gold: '#d97706', navy: '#1e3a8a',
    emerald: '#059669', violet: '#C128D7', mint: '#0CBA80', neon: '#18CF23',
    rust: '#FF7438', white: '#D65DB1', plum: '#790963', brown: '#5A2B1D',
    darkgray: '#2C3844', maroon: '#3F0D0D', turquoise: '#003A7A', slate: '#2E3A47',
    copper: '#AD4F34', forest: '#1B3924', olive: '#4C462C',
  };
  const themeColor = themeColorMap[theme.color] || '#3b82f6';

  // 이격거리 인라인 편집 상태
  const [editingGapIndex, setEditingGapIndex] = useState<number | null>(null);
  const [editingGapValue, setEditingGapValue] = useState<string>('');
  const gapInputRef = useRef<HTMLInputElement>(null);

  // 더블클릭으로 편집 중인 자유배치 가구 ID
  const editingFreeModuleId = useMemo(() => {
    if (activePopup?.type !== 'furnitureEdit' || !activePopup.id) return null;
    const mod = placedModules.find(m => m.id === activePopup.id && m.isFreePlacement);
    return mod ? mod.id : null;
  }, [activePopup, placedModules]);

  // 내부 공간 계산
  const internalSpace = useMemo(() => calculateInternalSpace(spaceInfo), [spaceInfo]);
  const spaceBounds = useMemo(() => getInternalSpaceBoundsX(spaceInfo), [spaceInfo]);

  // 자유배치 모듈 및 정렬된 bounds 캐싱 (드래그 중 반복 계산 방지)
  const freeModules = useMemo(() => placedModules.filter(m => m.isFreePlacement), [placedModules]);
  const sortedBoundsWithId = useMemo(() =>
    freeModules.map(m => ({ id: m.id, ...getModuleBoundsX(m) })).sort((a, b) => a.left - b.left),
    [freeModules]
  );
  const sortedBoundsCache = useMemo(() =>
    sortedBoundsWithId.map(({ id, ...rest }) => rest),
    [sortedBoundsWithId]
  );

  // 남은 최대 빈 공간 계산 (이미 배치된 가구를 제외한 최대 연속 빈 공간)
  const maxRemainingWidth = useMemo(() => {
    const { startX, endX } = spaceBounds;
    const totalAvailable = endX - startX;
    if (freeModules.length === 0) return totalAvailable;

    const bounds = sortedBoundsCache;
    let maxGap = 0;
    // 왼쪽 벽 ~ 첫 가구
    if (bounds[0].left > startX) maxGap = Math.max(maxGap, bounds[0].left - startX);
    // 가구 사이
    for (let i = 0; i < bounds.length - 1; i++) {
      maxGap = Math.max(maxGap, bounds[i + 1].left - bounds[i].right);
    }
    // 마지막 가구 ~ 오른쪽 벽
    maxGap = Math.max(maxGap, endX - bounds[bounds.length - 1].right);
    return Math.round(maxGap);
  }, [placedModules, spaceBounds]);

  // 활성 가구 데이터 (클릭 선택 기반 - 자유배치는 currentDragData 미사용)
  const activeModuleId = selectedFurnitureId;
  const activeModuleData = useMemo(() => {
    if (!selectedFurnitureId) return null;

    // 커스터마이징 가구 ID 처리
    if (isCustomizableModuleId(selectedFurnitureId)) {
      const category = getCustomizableCategory(selectedFurnitureId);
      const dimKey = getCustomDimensionKey(selectedFurnitureId);
      // dimKey별 기본값 우선 (full-single/full-dual 구분), 없으면 category 기본값
      const defaults = CUSTOMIZABLE_DEFAULTS[dimKey] || CUSTOMIZABLE_DEFAULTS[category];
      const height = category === 'full' ? internalSpace.height : defaults.height;
      const lastDims = lastCustomDimensions[dimKey];

      // 우선순위: pendingPlacement(My캐비넷) > lastCustomDimensions(마지막 치수) > CUSTOMIZABLE_DEFAULTS(기본값)
      const pp = pendingPlacement;
      let useWidth = pp ? pp.width : (lastDims ? lastDims.width : defaults.width);
      const useHeight = pp ? pp.height : (lastDims ? lastDims.height : height);
      const useDepth = pp ? pp.depth : (lastDims ? lastDims.depth : defaults.depth);

      // 남은 공간보다 크면 남은 공간으로 클램핑 (lastDims가 있으면 사용자 의도이므로 유지)
      if (!pp && !lastDims && useWidth > maxRemainingWidth) {
        useWidth = maxRemainingWidth;
      }

      return {
        id: selectedFurnitureId,
        name: pp ? '커스텀 캐비넷' : defaults.label,
        category: (pp ? pp.category : category) as 'full' | 'upper' | 'lower',
        dimensions: { width: useWidth, height: useHeight, depth: useDepth },
        color: '#D4C5A9',
        description: pp ? '커스텀 캐비넷' : defaults.label,
        hasDoor: false,
        isDynamic: false,
        type: 'box' as const,
        defaultDepth: useDepth,
        modelConfig: {
          basicThickness: 18,
          hasOpenFront: true,
          hasShelf: false,
          sections: [],
        },
      };
    }

    // 표준 가구: 기본값 조회 후 마지막 사용 치수 적용
    const baseModule = getModuleById(selectedFurnitureId, internalSpace, spaceInfo);
    if (!baseModule) return null;

    const groupKey = getStandardDimensionKey(selectedFurnitureId);
    const lastDims = lastCustomDimensions[groupKey];
    if (lastDims) {
      return {
        ...baseModule,
        dimensions: {
          width: lastDims.width,
          height: lastDims.height,
          depth: lastDims.depth,
        },
      };
    }

    // lastDims 없고 기본 너비가 남은 공간보다 크면 남은 공간으로 클램핑
    if (baseModule.dimensions.width > maxRemainingWidth) {
      return {
        ...baseModule,
        dimensions: {
          ...baseModule.dimensions,
          width: maxRemainingWidth,
        },
      };
    }
    return baseModule;
  }, [selectedFurnitureId, internalSpace, spaceInfo, pendingPlacement, lastCustomDimensions, maxRemainingWidth]);

  // 활성 가구 치수
  const activeDimensions = useMemo(() => {
    if (!activeModuleData) return null;
    return {
      width: activeModuleData.dimensions.width,
      height: activeModuleData.dimensions.height,
      depth: activeModuleData.dimensions.depth,
    };
  }, [activeModuleData]);

  // 활성 카테고리
  const activeCategory = useMemo(() => {
    if (activeModuleData?.category) return activeModuleData.category;
    return 'full';
  }, [activeModuleData]);

  // 평면 크기 및 위치 계산
  const planeConfig = useMemo(() => {
    const totalWidth = spaceInfo.width;
    const internalCenterXmm = -(totalWidth / 2) + internalSpace.startX + (internalSpace.width / 2);
    const planeWidth = internalSpace.width * 0.01;
    const planeHeight = spaceInfo.height * 0.01;
    const planeCenterX = internalCenterXmm * 0.01;
    const planeCenterY = (spaceInfo.height / 2) * 0.01;

    return { planeWidth, planeHeight, planeCenterX, planeCenterY };
  }, [spaceInfo, internalSpace]);

  // 스냅 거리 (mm) - 이 거리 이내이면 가구/벽에 붙음
  const SNAP_DISTANCE_MM = 30;

  // 충돌 체크 + hover 상태 업데이트 (스냅 포함)
  const updateHoverState = useCallback((xMm: number, widthMm: number, category: string) => {
    let clampedX = clampToSpaceBoundsX(xMm, widthMm, spaceInfo);
    const halfWidth = widthMm / 2;
    const { startX, endX } = spaceBounds;

    // 잠긴 이격 구간 침범 방지 (새 가구 배치 시)
    // 공간 레벨 lockedWallGaps에서 직접 읽기
    let effectiveStartX = startX;
    let effectiveEndX = endX;
    const lockedWallGaps = spaceInfo.lockedWallGaps;
    if (lockedWallGaps?.left != null && lockedWallGaps.left > 0) {
      effectiveStartX = startX + lockedWallGaps.left;
    }
    if (lockedWallGaps?.right != null && lockedWallGaps.right > 0) {
      effectiveEndX = endX - lockedWallGaps.right;
    }
    clampedX = Math.max(effectiveStartX + halfWidth, Math.min(effectiveEndX - halfWidth, clampedX));

    // 배치된 가구의 X범위 (캐싱된 값 사용)
    const bounds = sortedBoundsCache;

    // 스냅 포인트 수집: 벽 + 가구 가장자리
    const snapPoints: number[] = [];
    snapPoints.push(effectiveStartX + halfWidth);   // 왼쪽 벽 (잠긴 이격 반영)
    snapPoints.push(effectiveEndX - halfWidth);     // 오른쪽 벽 (잠긴 이격 반영)
    for (const b of bounds) {
      snapPoints.push(b.right + halfWidth); // 가구 오른쪽에 붙기
      snapPoints.push(b.left - halfWidth);  // 가구 왼쪽에 붙기
    }

    // 가장 가까운 스냅 포인트 찾기
    let snapped = false;
    let bestSnap = clampedX;
    let bestDist = SNAP_DISTANCE_MM + 1;
    for (const sp of snapPoints) {
      const dist = Math.abs(clampedX - sp);
      if (dist < bestDist) {
        bestDist = dist;
        bestSnap = sp;
      }
    }
    if (bestDist <= SNAP_DISTANCE_MM) {
      clampedX = bestSnap;
      snapped = true;
    }

    clampedX = clampToSpaceBoundsX(clampedX, widthMm, spaceInfo);

    // 충돌 시 가장 가까운 빈 공간으로 밀어내기
    const newBounds: FurnitureBoundsX = {
      left: clampedX - halfWidth,
      right: clampedX + halfWidth,
      category: (category as 'full' | 'upper' | 'lower') || 'full',
    };

    setIsSnapped(snapped);

    if (!snapped && checkFreeCollision(placedModules, newBounds)) {
      // 충돌 발생 → 왼쪽/오른쪽 중 가까운 빈 자리로 밀어냄
      let pushLeftX: number | null = null;
      let pushRightX: number | null = null;

      for (const b of bounds) {
        // 겹치는 가구 찾기
        if (b.right > clampedX - halfWidth && b.left < clampedX + halfWidth) {
          const candidateLeft = b.left - halfWidth;   // 가구 왼쪽에 배치
          const candidateRight = b.right + halfWidth;  // 가구 오른쪽에 배치
          if (candidateLeft >= startX + halfWidth) {
            if (pushLeftX === null || candidateLeft > pushLeftX) pushLeftX = candidateLeft;
          }
          if (candidateRight <= endX - halfWidth) {
            if (pushRightX === null || candidateRight < pushRightX) pushRightX = candidateRight;
          }
        }
      }

      // 가장 가까운 방향 선택
      const distLeft = pushLeftX !== null ? Math.abs(clampedX - pushLeftX) : Infinity;
      const distRight = pushRightX !== null ? Math.abs(clampedX - pushRightX) : Infinity;

      let pushedX = clampedX;
      if (distLeft <= distRight && pushLeftX !== null) {
        pushedX = pushLeftX;
      } else if (pushRightX !== null) {
        pushedX = pushRightX;
      }

      // 밀어낸 위치에서 다시 충돌 체크
      pushedX = clampToSpaceBoundsX(pushedX, widthMm, spaceInfo);
      const pushedBounds: FurnitureBoundsX = {
        left: pushedX - halfWidth,
        right: pushedX + halfWidth,
        category: (category as 'full' | 'upper' | 'lower') || 'full',
      };

      if (!checkFreeCollision(placedModules, pushedBounds)) {
        clampedX = pushedX;
        setIsColliding(false);
      } else {
        setIsColliding(true);
      }
    } else {
      setIsColliding(false);
    }

    setHoverXmm(clampedX);
  }, [spaceInfo, placedModules, spaceBounds]);

  // 배치 실행 공통 함수 — 성공 시 배치된 모듈 ID 반환, 실패 시 null
  const executePlacement = useCallback((moduleId: string, xMm: number, dims: { width: number; height: number; depth: number }, modData: any, skipCollision?: boolean): string | null => {
    const result = placeFurnitureFree({
      moduleId,
      xPositionMM: xMm,
      spaceInfo,
      dimensions: dims,
      existingModules: placedModules,
      moduleData: modData,
      skipCollisionCheck: skipCollision,
      pendingPlacement,
    });

    if (result.success && result.module) {
      addModule(result.module);
      console.log('✅ [FreePlacement] 배치 완료:', result.module.id);
      return result.module.id;
    } else {
      console.warn('❌ [FreePlacement] 배치 실패:', result.error);
      return null;
    }
  }, [spaceInfo, placedModules, addModule, pendingPlacement]);

  // R3F onPointerMove - 고스트가 마우스를 따라다님
  const handlePointerMove = useCallback(
    (e: any) => {
      if (!activeDimensions) return;
      e.stopPropagation();
      const xMm = e.point.x * 100;
      updateHoverState(xMm, activeDimensions.width, activeCategory);
    },
    [activeDimensions, activeCategory, updateHoverState]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverXmm(null);
    setIsColliding(false);
  }, []);

  // R3F onClick - 클릭하면 즉시 배치, 배치 모드가 아니면 선택 해제
  const handleClick = useCallback(
    (e: any) => {
      if (!activeModuleId || !activeModuleData || !activeDimensions || hoverXmm === null || isColliding) {
        // 배치 모드가 아닌 경우: 허공 클릭 시 선택 해제 및 팝업 닫기
        e.stopPropagation();
        (window as any).__r3fClickHandled = true; // HTML레벨 deselect 중복 방지
        useFurnitureStore.getState().setSelectedFurnitureId(null);
        useUIStore.getState().setSelectedFurnitureId(null);
        useUIStore.getState().closeAllPopups();
        return;
      }
      e.stopPropagation();
      const isDesignMode = useUIStore.getState().isLayoutBuilderOpen;
      const placedId = executePlacement(activeModuleId, hoverXmm, activeDimensions, activeModuleData, isSnapped);
      if (placedId) {
        // 배치 성공 후 배치 모드 해제 (고스트 제거)
        useFurnitureStore.getState().setFurniturePlacementMode(false);
        setHoverXmm(null);
        setIsColliding(false);

        if (isDesignMode) {
          // 설계모드: 배치된 가구를 선택 상태로 유지 → hiddenInDesignMode 방지
          useFurnitureStore.getState().setSelectedFurnitureId(placedId);
          useUIStore.getState().setSelectedFurnitureId(placedId);

          // 설계모드(커스텀 가구 설계) 시 배치 직후 속성 패널 열기
          const placedMod = useFurnitureStore.getState().placedModules.find(m => m.id === placedId);
          if (placedMod && isCustomizableModuleId(placedMod.moduleId)) {
            useFurnitureStore.getState().setNewlyPlacedCustomModuleId(placedId);
            useUIStore.getState().openCustomizableEditPopup(placedId);
          }
        } else {
          // 일반 모드: 선택 해제
          useFurnitureStore.getState().setSelectedFurnitureId(null);
        }
      }
    },
    [activeModuleId, activeModuleData, activeDimensions, hoverXmm, isColliding, isSnapped, executePlacement]
  );

  // 단내림 구간 감지 → 고스트 높이 조정
  const ghostDroppedZone = useMemo(() => {
    if (hoverXmm === null || !activeDimensions || !spaceInfo.droppedCeiling?.enabled) {
      return { zone: 'normal' as const, droppedInternalHeight: undefined };
    }
    const result = detectDroppedZone(hoverXmm, spaceInfo, activeDimensions.width);
    return result;
  }, [hoverXmm, spaceInfo, activeDimensions]);

  const ghostEffectiveHeight = useMemo(() => {
    if (!activeDimensions) return 0;
    // full 카테고리만 단내림 높이 적용 (placeFurnitureFree와 동일 로직)
    if (ghostDroppedZone.zone === 'dropped' && ghostDroppedZone.droppedInternalHeight !== undefined
      && activeCategory === 'full') {
      return ghostDroppedZone.droppedInternalHeight;
    }
    return activeDimensions.height;
  }, [activeDimensions, ghostDroppedZone, activeCategory]);

  // 고스트 Y 위치 계산 — calculateYPosition과 동일 로직 사용
  const ghostYThree = useMemo(() => {
    if (!activeDimensions) return 0;
    return calculateYPosition(activeCategory, ghostEffectiveHeight, spaceInfo);
  }, [activeDimensions, activeCategory, spaceInfo, ghostEffectiveHeight]);

  // 고스트 이동 중 실시간 이격거리 계산 (좌/우 벽 또는 가구와의 거리)
  const ghostDistanceGuides = useMemo(() => {
    if (hoverXmm === null || !activeDimensions) return null;

    const ghostLeft = hoverXmm - activeDimensions.width / 2;
    const ghostRight = hoverXmm + activeDimensions.width / 2;
    const { startX, endX } = spaceBounds;

    // 배치된 가구의 X범위 (캐싱된 값 사용)
    const bounds = sortedBoundsCache;

    // 왼쪽 이격: 고스트 왼쪽 가장자리 ~ 가장 가까운 왼쪽 장애물
    let leftObstacle = startX;
    for (const b of bounds) {
      if (b.right <= ghostLeft) {
        leftObstacle = b.right;
      }
    }
    const leftDistance = Math.round(ghostLeft - leftObstacle);

    // 오른쪽 이격: 고스트 오른쪽 가장자리 ~ 가장 가까운 오른쪽 장애물
    let rightObstacle = endX;
    for (const b of bounds) {
      if (b.left >= ghostRight) {
        rightObstacle = b.left;
        break;
      }
    }
    const rightDistance = Math.round(rightObstacle - ghostRight);

    const guideY = ghostYThree;

    return { leftObstacle, rightObstacle, leftDistance, rightDistance, ghostLeft, ghostRight, guideY };
  }, [hoverXmm, activeDimensions, spaceBounds, placedModules, ghostYThree]);

  // 편집/이동 중인 가구의 실시간 이격거리 계산
  const editingDistanceGuides = useMemo(() => {
    const targetId = movingModuleId || editingFreeModuleId;
    if (!targetId) return null;
    const mod = placedModules.find(m => m.id === targetId && m.isFreePlacement);
    if (!mod) return null;

    const widthMm = mod.freeWidth || mod.moduleWidth || 450;
    const centerXmm = mod.position.x * 100;
    const modLeft = centerXmm - widthMm / 2;
    const modRight = centerXmm + widthMm / 2;
    const { startX, endX } = spaceBounds;

    // 자기 자신 제외한 가구의 X범위
    const otherModules = placedModules.filter(m => m.isFreePlacement && m.id !== targetId);
    const bounds = otherModules.map(m => getModuleBoundsX(m)).sort((a, b) => a.left - b.left);

    // 왼쪽 장애물
    let leftObstacle = startX;
    for (const b of bounds) {
      if (b.right <= modLeft) {
        leftObstacle = b.right;
      }
    }
    const leftDistance = Math.round(modLeft - leftObstacle);

    // 오른쪽 장애물
    let rightObstacle = endX;
    for (const b of bounds) {
      if (b.left >= modRight) {
        rightObstacle = b.left;
        break;
      }
    }
    const rightDistance = Math.round(rightObstacle - modRight);

    const guideY = mod.position.y;
    const heightMm = mod.freeHeight || 2325;
    const halfHeightThree = (heightMm * 0.01) / 2;
    const modTop = guideY + halfHeightThree;
    const modBottom = guideY - halfHeightThree;

    return { leftObstacle, rightObstacle, leftDistance, rightDistance, modLeft, modRight, guideY, modTop, modBottom };
  }, [movingModuleId, editingFreeModuleId, placedModules, spaceBounds]);

  // 고스트 모듈 데이터 (BoxModule에 전달)
  const ghostModuleData = useMemo(() => {
    if (!activeModuleId) return null;
    // getModuleById로 실제 모듈 데이터를 가져옴
    const modData = getModuleById(activeModuleId, internalSpace, spaceInfo);
    if (modData) return modData;
    // 못 찾으면 activeModuleData에서 생성
    if (!activeModuleData) return null;
    return activeModuleData;
  }, [activeModuleId, internalSpace, spaceInfo, activeModuleData]);

  // 고스트 Z 위치 계산 (SlotDropZonesSimple과 동일한 로직)
  const ghostZPosition = useMemo(() => {
    if (!activeDimensions) return 0;
    const panelDepthMm = spaceInfo.depth || 600;
    const panelDepth = panelDepthMm * 0.01;
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const furnitureDepth = furnitureDepthMm * 0.01;
    const zOffset = -panelDepth / 2;
    const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
    const doorThickness = 20 * 0.01;
    const previewDepth = activeDimensions.depth * 0.01;
    return furnitureZOffset + furnitureDepth / 2 - doorThickness - previewDepth / 2;
  }, [activeDimensions, spaceInfo.depth]);

  // 치수선 Z 좌표 (가구 앞면에 표시)
  const guideZPosition = useMemo(() => {
    const panelDepthMm = spaceInfo.depth || 600;
    const panelDepth = panelDepthMm * 0.01;
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const furnitureDepth = furnitureDepthMm * 0.01;
    const zOffset = -panelDepth / 2;
    const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
    return furnitureZOffset + furnitureDepth / 2 + 0.01; // 가구 앞면 + 약간 앞
  }, [spaceInfo.depth]);

  // 고스트 위치
  const ghostPosition = useMemo(() => {
    if (hoverXmm === null || !activeDimensions) return null;
    return { x: hoverXmm * 0.01, y: ghostYThree, z: ghostZPosition };
  }, [hoverXmm, activeDimensions, ghostYThree, ghostZPosition]);

  // 남은 공간 사이즈 계산 (배치된 가구 사이의 갭)
  const remainingGaps = useMemo(() => {
    if (freeModules.length === 0) return [];

    // 모든 가구의 X범위를 구해서 왼쪽부터 정렬 (캐싱된 bounds + id 추가)
    const bounds = freeModules.map(m => ({
      ...getModuleBoundsX(m),
      id: m.id,
    })).sort((a, b) => a.left - b.left);

    const gaps: Array<{
      startX: number; endX: number; width: number;
      centerX: number; centerY: number;
      adjacentModuleId: string | null; // 이격거리 변경 시 이동할 가구 (기본: 오른쪽)
      leftModuleId?: string | null; // between 갭의 왼쪽 가구 ID
      isWallGap: 'left' | 'right' | null; // 벽과의 갭인 경우
      gapType: 'left-wall' | 'right-wall' | 'between'; // 갭 유형
      anchorX: number; // 갭 기준점 (가구 이동 계산용, mm)
    }> = [];
    const { startX, endX } = spaceBounds;

    // Y 위치: 모든 갭을 상단 치수선 위치에 표시 (CleanCAD2D의 slotDimensionY와 동일)
    const gapLabelY = spaceInfo.height * 0.01 + 120 * 0.01; // spaceHeight + DIM_GAP

    // 왼쪽 벽 ~ 첫 가구
    if (bounds[0].left - startX > 0.5) {
      const gapWidth = bounds[0].left - startX;
      gaps.push({
        startX,
        endX: bounds[0].left,
        width: Math.round(gapWidth),
        centerX: ((startX + bounds[0].left) / 2) * 0.01,
        centerY: gapLabelY,
        adjacentModuleId: bounds[0].id,
        isWallGap: 'left',
        gapType: 'left-wall',
        anchorX: startX,
      });
    }

    // 가구 사이 갭
    for (let i = 0; i < bounds.length - 1; i++) {
      const gapStart = bounds[i].right;
      const gapEnd = bounds[i + 1].left;
      if (gapEnd - gapStart > 0.5) {
        gaps.push({
          startX: gapStart,
          endX: gapEnd,
          width: Math.round(gapEnd - gapStart),
          centerX: ((gapStart + gapEnd) / 2) * 0.01,
          centerY: gapLabelY,
          adjacentModuleId: bounds[i + 1].id,
          leftModuleId: bounds[i].id,
          isWallGap: null,
          gapType: 'between',
          anchorX: gapStart,
        });
      }
    }

    // 마지막 가구 ~ 오른쪽 벽
    const lastBound = bounds[bounds.length - 1];
    if (endX - lastBound.right > 0.5) {
      const gapWidth = endX - lastBound.right;
      gaps.push({
        startX: lastBound.right,
        endX,
        width: Math.round(gapWidth),
        centerX: ((lastBound.right + endX) / 2) * 0.01,
        centerY: gapLabelY,
        adjacentModuleId: lastBound.id,
        isWallGap: 'right',
        gapType: 'right-wall',
        anchorX: endX,
      });
    }

    return gaps;
  }, [placedModules, spaceBounds, spaceInfo]);

  // 이격거리 편집 시작
  const handleGapLabelClick = useCallback((index: number, currentWidth: number) => {
    // 잠긴 이격은 편집 불가 (공간 레벨 잠금 기준)
    const gap = remainingGaps[index];
    if (gap) {
      const lockedWallGaps = spaceInfo.lockedWallGaps;
      if (gap.gapType === 'left-wall' && lockedWallGaps?.left != null) return;
      if (gap.gapType === 'right-wall' && lockedWallGaps?.right != null) return;
    }
    setEditingGapIndex(index);
    setEditingGapValue(Math.round(currentWidth).toString());
    setTimeout(() => {
      gapInputRef.current?.focus();
      gapInputRef.current?.select();
    }, 100);
  }, [remainingGaps, spaceInfo]);

  // 이격거리 편집 확정 - 가구 위치 이동
  const handleGapEditSubmit = useCallback(() => {
    if (editingGapIndex === null) return;
    const gap = remainingGaps[editingGapIndex];
    if (!gap || !gap.adjacentModuleId) {
      setEditingGapIndex(null);
      setEditingGapValue('');
      return;
    }

    const newGapMm = parseFloat(editingGapValue);
    if (isNaN(newGapMm) || newGapMm < 0) {
      setEditingGapIndex(null);
      setEditingGapValue('');
      return;
    }

    const { startX, endX } = spaceBounds;

    // 이동할 가구 결정 — between 갭에서 오른쪽 가구가 잠겨있으면 왼쪽 가구를 이동
    let moveModuleId = gap.adjacentModuleId;
    let moveDirection: 'default' | 'reverse' = 'default';

    if (gap.gapType === 'between') {
      const lockedGaps = spaceInfo.lockedWallGaps;
      // 오른쪽 가구가 잠겨있는지: 벽 잠금 위치에 고정되어있으면 이동 불가
      const rightMod = placedModules.find(m => m.id === gap.adjacentModuleId);
      const rightLocked = rightMod && (
        (rightMod.freeLeftGapLocked) ||
        (rightMod.freeRightGapLocked) ||
        (lockedGaps?.right != null && !placedModules.some(m =>
          m.id !== rightMod.id && m.isFreePlacement && getModuleBoundsX(m).right > getModuleBoundsX(rightMod).right
        ))
      );
      if (rightLocked && gap.leftModuleId) {
        const leftMod = placedModules.find(m => m.id === gap.leftModuleId);
        const leftLocked = leftMod && (
          (leftMod.freeLeftGapLocked) ||
          (leftMod.freeRightGapLocked) ||
          (lockedGaps?.left != null && !placedModules.some(m =>
            m.id !== leftMod.id && m.isFreePlacement && getModuleBoundsX(m).left < getModuleBoundsX(leftMod).left
          ))
        );
        if (leftLocked) {
          setEditingGapIndex(null);
          setEditingGapValue('');
          return;
        }
        moveModuleId = gap.leftModuleId;
        moveDirection = 'reverse';
      }
    }

    const targetModule = placedModules.find(m => m.id === moveModuleId);
    if (!targetModule) {
      setEditingGapIndex(null);
      setEditingGapValue('');
      return;
    }

    const moduleWidthMm = targetModule.freeWidth || 0;
    const halfWidth = moduleWidthMm / 2;

    let newCenterXmm: number;
    if (gap.gapType === 'left-wall') {
      newCenterXmm = startX + newGapMm + halfWidth;
    } else if (gap.gapType === 'right-wall') {
      newCenterXmm = endX - newGapMm - halfWidth;
    } else if (moveDirection === 'reverse') {
      // between 역방향: 오른쪽 가구의 왼쪽 끝에서 newGapMm 만큼 왼쪽으로
      const rightMod = placedModules.find(m => m.id === gap.adjacentModuleId);
      const rightLeft = rightMod ? getModuleBoundsX(rightMod).left : gap.endX;
      newCenterXmm = rightLeft - newGapMm - halfWidth;
    } else {
      // between 기본: 왼쪽 가구의 오른쪽 끝에서 newGapMm 만큼 오른쪽으로
      newCenterXmm = gap.anchorX + newGapMm + halfWidth;
    }

    const clampedX = clampToSpaceBoundsX(newCenterXmm, moduleWidthMm, spaceInfo);
    updatePlacedModule(moveModuleId, {
      position: { ...targetModule.position, x: clampedX * 0.01 },
    });

    setEditingGapIndex(null);
    setEditingGapValue('');
  }, [editingGapIndex, editingGapValue, remainingGaps, placedModules, spaceBounds, spaceInfo, updatePlacedModule]);

  const handleGapEditCancel = useCallback(() => {
    setEditingGapIndex(null);
    setEditingGapValue('');
  }, []);

  // === 배치된 가구 이동 관련 로직 ===

  // 이동 중인 가구의 스냅 + 클램핑 계산 (자기 자신 제외)
  const calcMovedPosition = useCallback((xMm: number, moduleId: string, skipSnap = false) => {
    const movingModule = placedModules.find(m => m.id === moduleId);
    if (!movingModule) return { x: xMm, snapped: false, colliding: false };

    const widthMm = movingModule.freeWidth || getModuleBoundsX(movingModule).right - getModuleBoundsX(movingModule).left;
    let clampedX = clampToSpaceBoundsX(xMm, widthMm, spaceInfo);
    const halfWidth = widthMm / 2;
    const { startX, endX } = spaceBounds;

    // ── 공간 레벨 벽 잠금 처리 ──
    const lockedWallGaps = spaceInfo.lockedWallGaps;
    const hasLockedLeft = lockedWallGaps?.left != null;
    const hasLockedRight = lockedWallGaps?.right != null;

    // 이동 가구가 잠긴 벽에 인접한 가구인지 확인
    const movingBounds = getModuleBoundsX(movingModule);
    const isLeftmostModule = !placedModules.some(m =>
      m.id !== moduleId && m.isFreePlacement && getModuleBoundsX(m).left < movingBounds.left
    );
    const isRightmostModule = !placedModules.some(m =>
      m.id !== moduleId && m.isFreePlacement && getModuleBoundsX(m).right > movingBounds.right
    );

    // 좌측 벽 잠금 + 이 가구가 가장 왼쪽 → 위치 고정
    if (hasLockedLeft && isLeftmostModule) {
      const fixedLeft = startX + lockedWallGaps.left!;
      clampedX = fixedLeft + halfWidth;
    }
    // 우측 벽 잠금 + 이 가구가 가장 오른쪽 → 위치 고정
    if (hasLockedRight && isRightmostModule) {
      const fixedRight = endX - lockedWallGaps.right!;
      clampedX = fixedRight - halfWidth;
    }

    // 잠긴 벽에 인접한 가구는 이동 차단
    const isLockedToWall = (hasLockedLeft && isLeftmostModule) || (hasLockedRight && isRightmostModule);
    if (isLockedToWall) {
      return { x: Math.round(clampedX), snapped: false, colliding: false };
    }

    // ── 잠긴 벽 이격 영역 침범 불가 ──
    let effectiveStartX = startX;
    let effectiveEndX = endX;
    if (hasLockedLeft && lockedWallGaps.left! > 0) {
      effectiveStartX = startX + lockedWallGaps.left!;
    }
    if (hasLockedRight && lockedWallGaps.right! > 0) {
      effectiveEndX = endX - lockedWallGaps.right!;
    }

    // 잠긴 영역 경계 내로 클램핑
    clampedX = Math.max(effectiveStartX + halfWidth, Math.min(effectiveEndX - halfWidth, clampedX));

    // 자기 자신 제외한 가구의 X범위 (캐싱된 bounds에서 필터)
    const otherModules = freeModules.filter(m => m.id !== moduleId);
    const bounds = sortedBoundsWithId.filter(b => b.id !== moduleId);

    let snapped = false;

    // 키보드 이동 시에는 스냅 건너뜀 (정확한 1mm 이동)
    if (!skipSnap) {
      // 스냅 포인트 수집
      const snapPoints: number[] = [];
      snapPoints.push(effectiveStartX + halfWidth);
      snapPoints.push(effectiveEndX - halfWidth);
      for (const b of bounds) {
        snapPoints.push(b.right + halfWidth);
        snapPoints.push(b.left - halfWidth);
      }

      let bestSnap = clampedX;
      let bestDist = SNAP_DISTANCE_MM + 1;
      for (const sp of snapPoints) {
        const dist = Math.abs(clampedX - sp);
        if (dist < bestDist) { bestDist = dist; bestSnap = sp; }
      }
      if (bestDist <= SNAP_DISTANCE_MM) { clampedX = bestSnap; snapped = true; }
    }

    clampedX = clampToSpaceBoundsX(clampedX, widthMm, spaceInfo);

    // 충돌 체크 (자기 자신 제외)
    // 스냅 성공 시 충돌 무시 (스냅 = 기존 가구/벽 가장자리에 밀착 → 의도된 배치)
    const newBounds: FurnitureBoundsX = {
      left: clampedX - halfWidth,
      right: clampedX + halfWidth,
      category: (movingModule as any).category || 'full',
    };
    const colliding = snapped ? false : checkFreeCollision(otherModules, newBounds);

    return { x: Math.round(clampedX), snapped, colliding };
  }, [freeModules, placedModules, sortedBoundsWithId, spaceInfo, spaceBounds]);

  // 배치된 가구 마우스 드래그 시작
  const handlePlacedPointerDown = useCallback((e: any, moduleId: string) => {
    // 새 가구 배치 모드 중이면 무시
    if (selectedFurnitureId) return;
    e.stopPropagation();
    setMovingModuleId(moduleId);
    setIsDraggingPlaced(true);
    window.dispatchEvent(new CustomEvent('furniture-drag-start'));
  }, [selectedFurnitureId]);

  // 편집 중인 가구 드래그 시작 (더블클릭 후 드래그)
  const handleEditDragPointerDown = useCallback((e: any) => {
    if (!editingFreeModuleId) return;
    // 이격거리 편집 중이면 드래그 시작하지 않음
    if (editingGapIndex !== null) return;

    // R3F Html 툴바 버튼 클릭 시 이 핸들러가 호출되지 않도록
    // __r3fClickHandled 플래그 확인
    if ((window as any).__r3fClickHandled) return;

    // 클릭 지점이 가구 위인지 확인 — 아니면 선택 해제 + 팝업 닫기
    const mod = placedModules.find(m => m.id === editingFreeModuleId);
    if (mod && e.point) {
      const bounds = getModuleBoundsX(mod);
      const clickXmm = e.point.x * 100;
      const clickYmm = e.point.y * 100;
      const modHeight = mod.freeHeight || 2325;
      const modBottomY = (mod.position.y * 100) - modHeight / 2;
      const modTopY = (mod.position.y * 100) + modHeight / 2;
      const margin = 30; // 30mm 여유

      // 툴바 영역 (가구 상단 위쪽)은 드래그 시작하지 않음 — HTML 버튼 클릭 허용
      const toolbarMargin = 200; // 200mm (툴바 높이 + 여유)
      if (clickYmm > modTopY - margin && clickYmm < modTopY + toolbarMargin &&
          clickXmm >= bounds.left - margin && clickXmm <= bounds.right + margin) {
        // 툴바 영역 → 아무 것도 하지 않음 (선택 해제도 안 함)
        e.stopPropagation();
        return;
      }

      const outsideX = clickXmm < bounds.left - margin || clickXmm > bounds.right + margin;
      const outsideY = clickYmm < modBottomY - margin || clickYmm > modTopY + toolbarMargin;
      if (outsideX || outsideY) {
        // 허공 클릭 → 선택 해제
        useFurnitureStore.getState().setSelectedFurnitureId(null);
        useUIStore.getState().setSelectedFurnitureId(null);
        useUIStore.getState().closeAllPopups();
        return;
      }
    }

    e.stopPropagation();
    setMovingModuleId(editingFreeModuleId);
    setIsDraggingPlaced(true);
    window.dispatchEvent(new CustomEvent('furniture-drag-start'));
  }, [editingFreeModuleId, editingGapIndex, placedModules]);

  // 이동 시 zone 변경에 따른 높이/Y 재계산
  const recalcZoneUpdate = useCallback((mod: typeof placedModules[0], newXmm: number) => {
    const widthMm = mod.freeWidth || mod.moduleWidth || 450;
    const category = getModuleCategory(mod);
    const droppedZone = detectDroppedZone(newXmm, spaceInfo, widthMm);

    // 원래 높이 구하기 (단내림 조정 전 높이)
    const originalModuleData = getModuleById(mod.moduleId, internalSpace, spaceInfo);
    const originalHeight = originalModuleData?.dimensions.height || mod.freeHeight || 0;

    let effectiveHeight = mod.freeHeight || originalHeight;
    let newZone = mod.zone || 'normal';

    if (droppedZone.zone === 'dropped' && droppedZone.droppedInternalHeight !== undefined) {
      if (category === 'full') {
        effectiveHeight = droppedZone.droppedInternalHeight;
      }
      newZone = 'dropped';
    } else {
      // normal zone: 사용자가 설정한 freeHeight 유지, 없으면 원래 높이 사용
      effectiveHeight = mod.freeHeight || originalHeight;
      newZone = 'normal';
    }

    const newY = calculateYPosition(category, effectiveHeight, spaceInfo);

    return { freeHeight: effectiveHeight, zone: newZone, y: newY };
  }, [spaceInfo, internalSpace]);

  // 배치된 가구 드래그 중 (1mm 단위로 이동)
  const handleDragPointerMove = useCallback((e: any) => {
    if (!isDraggingPlaced || !movingModuleId) return;
    e.stopPropagation();
    const xMm = Math.round(e.point.x * 100); // 1mm 단위로 반올림
    const result = calcMovedPosition(xMm, movingModuleId);
    if (!result.colliding) {
      const mod = placedModules.find(m => m.id === movingModuleId);
      if (mod) {
        const zoneUpdate = recalcZoneUpdate(mod, result.x);
        updatePlacedModule(movingModuleId, {
          position: { x: result.x * 0.01, y: zoneUpdate.y, z: mod.position.z },
          freeHeight: zoneUpdate.freeHeight,
          zone: zoneUpdate.zone as 'normal' | 'dropped',
        });
      }
    }
  }, [isDraggingPlaced, movingModuleId, calcMovedPosition, placedModules, updatePlacedModule, recalcZoneUpdate]);

  // 배치된 가구 드래그 종료
  const handleDragPointerUp = useCallback(() => {
    if (isDraggingPlaced) {
      window.dispatchEvent(new CustomEvent('furniture-drag-end'));
    }
    setIsDraggingPlaced(false);
  }, [isDraggingPlaced]);

  // 키보드 좌우 화살표로 미세 이동
  useEffect(() => {
    if (!isFreePlacement) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Escape') return;

      // 이동할 가구: movingModuleId 또는 편집 중인 자유배치 가구
      const targetId = movingModuleId || editingFreeModuleId;
      if (!targetId) return;
      const mod = placedModules.find(m => m.id === targetId && m.isFreePlacement);
      if (!mod) return;

      if (e.key === 'Escape') {
        setMovingModuleId(null);
        e.preventDefault();
        return;
      }

      // 화살표 키는 input 포커스와 무관하게 가구 이동 처리
      e.preventDefault();
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      const step = e.shiftKey ? KEYBOARD_SHIFT_STEP_MM : KEYBOARD_STEP_MM;
      const currentXmm = mod.position.x * 100;
      const newXmm = currentXmm + direction * step;

      // 키보드 이동은 스냅 건너뜀 (정확한 1mm 이동)
      const result = calcMovedPosition(newXmm, targetId, true);
      if (!result.colliding) {
        const zoneUpdate = recalcZoneUpdate(mod, result.x);
        updatePlacedModule(targetId, {
          position: { x: result.x * 0.01, y: zoneUpdate.y, z: mod.position.z },
          freeHeight: zoneUpdate.freeHeight,
          zone: zoneUpdate.zone as 'normal' | 'dropped',
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFreePlacement, movingModuleId, editingFreeModuleId, placedModules, calcMovedPosition, updatePlacedModule, recalcZoneUpdate]);

  // 렌더링 조건: 자유배치 모드가 아니면 null
  const hasActiveModule = !!(activeModuleId && activeDimensions);
  if (!isFreePlacement) return null;

  return (
    <>
      {/* 투명 raycasting 평면 (클릭-앤-플레이스 모드) */}
      {hasActiveModule && (
        <mesh
          ref={planeRef}
          position={[planeConfig.planeCenterX, planeConfig.planeCenterY, 0.01]}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
        >
          <planeGeometry args={[planeConfig.planeWidth, planeConfig.planeHeight]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 고스트 프리뷰 - 실제 BoxModule 사용 */}
      {ghostPosition && activeDimensions && ghostModuleData && !isColliding && (
        <group position={[ghostPosition.x, ghostPosition.y, ghostPosition.z]}>
          <BoxModule
            moduleData={ghostModuleData}
            color={theme.color}
            isDragging={true}
            hasDoor={false}
            customDepth={activeDimensions.depth}
            adjustedWidth={activeDimensions.width}
            internalHeight={ghostEffectiveHeight}
            spaceInfo={spaceInfo}
            customConfig={pendingCustomConfig || (pendingPlacement?.customConfig) || undefined}
          />
        </group>
      )}

      {/* 충돌 시 빨간 박스 고스트 */}
      {ghostPosition && activeDimensions && isColliding && (
        <group position={[ghostPosition.x, ghostPosition.y, ghostPosition.z]}>
          <mesh>
            <boxGeometry
              args={[
                activeDimensions.width * 0.01,
                ghostEffectiveHeight * 0.01,
                activeDimensions.depth * 0.01,
              ]}
            />
            <meshBasicMaterial
              color="#ef4444"
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry
              args={[
                new THREE.BoxGeometry(
                  activeDimensions.width * 0.01,
                  ghostEffectiveHeight * 0.01,
                  activeDimensions.depth * 0.01
                ),
              ]}
            />
            <lineBasicMaterial color="#ef4444" linewidth={2} />
          </lineSegments>
        </group>
      )}

      {/* 실시간 이격거리 가이드 (고스트 이동 중) */}
      {ghostDistanceGuides && ghostPosition && activeDimensions && !isColliding && (
        <>
          {/* 왼쪽 이격거리 */}
          {ghostDistanceGuides.leftDistance > 2 && (
            <group>
              <DynamicLine points={[
                ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY, guideZPosition,
                ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY, guideZPosition,
              ]} color={themeColor} />
              <DynamicLine points={[
                ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
              ]} color={themeColor} />
              <DynamicLine points={[
                ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
              ]} color={themeColor} />
              <Html
                position={[
                  ((ghostDistanceGuides.leftObstacle + ghostDistanceGuides.ghostLeft) / 2) * 0.01,
                  ghostDistanceGuides.guideY + 0.15,
                  guideZPosition,
                ]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: themeColor, color: 'white', padding: '1px 6px',
                  borderRadius: '3px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
                }}>
                  {ghostDistanceGuides.leftDistance}mm
                </div>
              </Html>
            </group>
          )}

          {/* 오른쪽 이격거리 */}
          {ghostDistanceGuides.rightDistance > 2 && (
            <group>
              <DynamicLine points={[
                ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY, guideZPosition,
                ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY, guideZPosition,
              ]} color={themeColor} />
              <DynamicLine points={[
                ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
              ]} color={themeColor} />
              <DynamicLine points={[
                ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
              ]} color={themeColor} />
              <Html
                position={[
                  ((ghostDistanceGuides.ghostRight + ghostDistanceGuides.rightObstacle) / 2) * 0.01,
                  ghostDistanceGuides.guideY + 0.15,
                  guideZPosition,
                ]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: themeColor, color: 'white', padding: '1px 6px',
                  borderRadius: '3px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
                }}>
                  {ghostDistanceGuides.rightDistance}mm
                </div>
              </Html>
            </group>
          )}
        </>
      )}

      {/* 고스트 가구 너비 치수 (상단 CAD 스타일) + 전체 공간 폭 치수 */}
      {ghostPosition && activeDimensions && !isColliding && (() => {
        const slotDimY = spaceInfo.height * 0.01 + 120 * 0.01;
        const topDimY = spaceInfo.height * 0.01 + 120 * 0.01 * 3; // 전체 폭 치수선 Y (3단)
        const ghostLeftX = ghostPosition.x - (activeDimensions.width * 0.01) / 2;
        const ghostRightX = ghostPosition.x + (activeDimensions.width * 0.01) / 2;
        const ghostTopY = ghostPosition.y + (ghostEffectiveHeight * 0.01) / 2;
        const spaceLeftX = -(spaceInfo.width * 0.01) / 2;
        const spaceRightX = (spaceInfo.width * 0.01) / 2;
        return (
          <group>
            {/* 고스트 가구 너비 치수 */}
            <DynamicLine points={[ghostLeftX, ghostTopY, 0.002, ghostLeftX, slotDimY, 0.002]} color={themeColor} />
            <DynamicLine points={[ghostRightX, ghostTopY, 0.002, ghostRightX, slotDimY, 0.002]} color={themeColor} />
            <DynamicLine points={[ghostLeftX, slotDimY, 0.002, ghostRightX, slotDimY, 0.002]} color={themeColor} />
            <DynamicLine points={[ghostLeftX, slotDimY - 0.06, 0.002, ghostLeftX, slotDimY + 0.06, 0.002]} color={themeColor} />
            <DynamicLine points={[ghostRightX, slotDimY - 0.06, 0.002, ghostRightX, slotDimY + 0.06, 0.002]} color={themeColor} />
            {/* 너비 라벨 */}
            <Html
              position={[ghostPosition.x, slotDimY + 0.12, 0.002]}
              center
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              <div style={{
                background: themeColor,
                color: 'white',
                padding: '1px 6px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: '600',
                whiteSpace: 'nowrap',
              }}>
                {activeDimensions.width}mm
              </div>
            </Html>

            {/* 전체 공간 폭 치수선 (고스트 활성화 시에도 항상 표시) */}
            <DynamicLine points={[spaceLeftX, topDimY, 0.003, spaceRightX, topDimY, 0.003]} color="#888888" />
            <DynamicLine points={[spaceLeftX, 0, 0.003, spaceLeftX, topDimY + 0.04, 0.003]} color="#888888" />
            <DynamicLine points={[spaceRightX, 0, 0.003, spaceRightX, topDimY + 0.04, 0.003]} color="#888888" />
            <Html
              position={[0, topDimY + 0.06, 0.003]}
              center
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              <div style={{
                fontSize: '13px',
                fontWeight: '700',
                color: '#888888',
                whiteSpace: 'nowrap',
              }}>
                {spaceInfo.width}
              </div>
            </Html>
          </group>
        );
      })()}

      {/* 드래그 이동 중인 가구의 실시간 이격거리 가이드 (편집 팝업 시에는 remainingGaps 사용) */}
      {editingDistanceGuides && isDraggingPlaced && (
        <>
          {/* 가구 좌우 수직 연장선 */}
          <DynamicLine points={[
            editingDistanceGuides.modLeft * 0.01, editingDistanceGuides.modBottom, guideZPosition,
            editingDistanceGuides.modLeft * 0.01, editingDistanceGuides.modTop, guideZPosition,
          ]} color={themeColor} />
          <DynamicLine points={[
            editingDistanceGuides.modRight * 0.01, editingDistanceGuides.modBottom, guideZPosition,
            editingDistanceGuides.modRight * 0.01, editingDistanceGuides.modTop, guideZPosition,
          ]} color={themeColor} />

          {/* 왼쪽 이격거리 */}
          {editingDistanceGuides.leftDistance > 2 && (
            <group>
              <DynamicLine points={[
                editingDistanceGuides.leftObstacle * 0.01, editingDistanceGuides.guideY, guideZPosition,
                editingDistanceGuides.modLeft * 0.01, editingDistanceGuides.guideY, guideZPosition,
              ]} color={themeColor} />
              {/* 왼쪽 틱 */}
              <DynamicLine points={[
                editingDistanceGuides.leftObstacle * 0.01, editingDistanceGuides.guideY - 0.08, guideZPosition,
                editingDistanceGuides.leftObstacle * 0.01, editingDistanceGuides.guideY + 0.08, guideZPosition,
              ]} color={themeColor} />
              <Html
                position={[
                  ((editingDistanceGuides.leftObstacle + editingDistanceGuides.modLeft) / 2) * 0.01,
                  editingDistanceGuides.guideY + 0.15,
                  guideZPosition,
                ]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: themeColor, color: 'white', padding: '1px 6px',
                  borderRadius: '3px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
                }}>
                  {editingDistanceGuides.leftDistance}mm
                </div>
              </Html>
            </group>
          )}

          {/* 오른쪽 이격거리 */}
          {editingDistanceGuides.rightDistance > 2 && (
            <group>
              <DynamicLine points={[
                editingDistanceGuides.modRight * 0.01, editingDistanceGuides.guideY, guideZPosition,
                editingDistanceGuides.rightObstacle * 0.01, editingDistanceGuides.guideY, guideZPosition,
              ]} color={themeColor} />
              {/* 모듈 쪽 틱 */}
              <DynamicLine points={[
                editingDistanceGuides.modRight * 0.01, editingDistanceGuides.guideY - 0.08, guideZPosition,
                editingDistanceGuides.modRight * 0.01, editingDistanceGuides.guideY + 0.08, guideZPosition,
              ]} color={themeColor} />
              {/* 장애물 쪽 틱 */}
              <DynamicLine points={[
                editingDistanceGuides.rightObstacle * 0.01, editingDistanceGuides.guideY - 0.08, guideZPosition,
                editingDistanceGuides.rightObstacle * 0.01, editingDistanceGuides.guideY + 0.08, guideZPosition,
              ]} color={themeColor} />
              <Html
                position={[
                  ((editingDistanceGuides.modRight + editingDistanceGuides.rightObstacle) / 2) * 0.01,
                  editingDistanceGuides.guideY + 0.15,
                  guideZPosition,
                ]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: themeColor, color: 'white', padding: '1px 6px',
                  borderRadius: '3px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
                }}>
                  {editingDistanceGuides.rightDistance}mm
                </div>
              </Html>
            </group>
          )}
        </>
      )}

      {/* 배치된 가구 드래그용 투명 평면 (드래그 중 또는 편집 모드에서 표시) */}
      {(isDraggingPlaced && movingModuleId) || editingFreeModuleId ? (
        <mesh
          ref={dragPlaneRef}
          position={[planeConfig.planeCenterX, planeConfig.planeCenterY, 0.02]}
          onPointerDown={!isDraggingPlaced ? handleEditDragPointerDown : undefined}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          onPointerLeave={handleDragPointerUp}
        >
          <planeGeometry args={[planeConfig.planeWidth * 2, planeConfig.planeHeight * 2]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}

      {/* 배치 후 남은 공간 사이즈 표시 (드래그 중에는 editingDistanceGuides가 대신 표시) */}
      {!isDraggingPlaced && remainingGaps.map((gap, i) => {
        const lineColor = themeColor;

        return (
          <group key={`gap-${i}`}>
            {/* 가로 치수선 */}
            <DynamicLine points={[
              gap.startX * 0.01, gap.centerY, guideZPosition,
              gap.endX * 0.01, gap.centerY, guideZPosition,
            ]} color={lineColor} />
            {/* 양쪽 틱 마크 */}
            <DynamicLine points={[
              gap.startX * 0.01, gap.centerY - 0.08, guideZPosition,
              gap.startX * 0.01, gap.centerY + 0.08, guideZPosition,
            ]} color={lineColor} />
            <DynamicLine points={[
              gap.endX * 0.01, gap.centerY - 0.08, guideZPosition,
              gap.endX * 0.01, gap.centerY + 0.08, guideZPosition,
            ]} color={lineColor} />
            {/* 치수 라벨 - 클릭하면 인라인 편집 */}
            {editingGapIndex === i ? (
              <Html
                position={[gap.centerX, gap.centerY + 0.1, guideZPosition]}
                center
                style={{ pointerEvents: 'auto' }}
                zIndexRange={[10000, 10001]}
              >
                <div
                  style={{
                    background: 'white',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    border: `2px solid ${themeColor}`,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                >
                  <input
                    ref={gapInputRef}
                    type="number"
                    value={editingGapValue}
                    onChange={(e) => setEditingGapValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGapEditSubmit();
                      else if (e.key === 'Escape') handleGapEditCancel();
                    }}
                    onBlur={handleGapEditSubmit}
                    style={{
                      width: '60px',
                      padding: '2px 4px',
                      border: '1px solid #ccc',
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <span style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>mm</span>
                </div>
              </Html>
            ) : (
              <Html
                position={[gap.centerX, gap.centerY + 0.1, guideZPosition]}
                center
                style={{ pointerEvents: 'auto', userSelect: 'none', zIndex: 9999, background: 'transparent' }}
                zIndexRange={[9999, 10000]}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'transparent' }}>
                  {/* 잠금 아이콘 - 벽 갭에서만 표시 (공간 레벨 잠금) */}
                  {(gap.gapType === 'left-wall' || gap.gapType === 'right-wall') && (() => {
                    const side = gap.gapType === 'left-wall' ? 'left' : 'right';
                    const isLocked = spaceInfo.lockedWallGaps?.[side] != null;
                    return (
                      <div
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: isLocked ? 1 : 0.4,
                          transition: 'opacity 0.15s',
                          color: isLocked ? '#e53e3e' : themeColor,
                          background: 'transparent',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                        onMouseLeave={(e) => { if (!isLocked) (e.currentTarget as HTMLDivElement).style.opacity = '0.4'; }}
                        onPointerDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.nativeEvent.stopImmediatePropagation();
                          setLockedWallGap(side, isLocked ? undefined : gap.width);
                        }}
                        title={isLocked ? '잠금 해제' : '잠금'}
                      >
                        {isLocked ? <IoLockClosed size={20} /> : <IoLockOpen size={20} />}
                      </div>
                    );
                  })()}
                  {/* 치수 라벨 */}
                  <div
                    style={{
                      background: themeColor,
                      color: 'white',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.12)';
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                      handleGapLabelClick(i, gap.width);
                    }}
                  >
                    {gap.width}mm
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
};

export default FreePlacementDropZone;
