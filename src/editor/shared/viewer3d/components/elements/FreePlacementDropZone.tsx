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
  FurnitureBoundsX,
} from '@/editor/shared/utils/freePlacementUtils';
import { placeFurnitureFree } from '@/editor/shared/furniture/hooks/usePlaceFurnitureFree';
import BoxModule from '../modules/BoxModule';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';

// 키보드 이동 단위 (mm)
const KEYBOARD_STEP_MM = 1;
const KEYBOARD_SHIFT_STEP_MM = 10;

/**
 * 자유배치 모드 - 클릭 배치 + 배치된 가구 이동
 * 1. 썸네일 클릭 → 고스트 나타남
 * 2. 마우스 이동 → 고스트 따라다니며 좌우 이격거리 실시간 표시
 * 3. 클릭 → 즉시 배치
 * 4. 배치된 가구 클릭 → 선택 후 마우스 드래그 또는 키보드 좌우키로 이동
 */
const FreePlacementDropZone: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, placedModules, addModule, updatePlacedModule } = useFurnitureStore();
  const { theme } = useTheme();
  const activePopup = useUIStore(state => state.activePopup);

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

  // 활성 가구 데이터 (클릭 선택 기반 - 자유배치는 currentDragData 미사용)
  const activeModuleId = selectedFurnitureId;
  const activeModuleData = useMemo(() => {
    if (!selectedFurnitureId) return null;
    return getModuleById(selectedFurnitureId, internalSpace, spaceInfo);
  }, [selectedFurnitureId, internalSpace, spaceInfo]);

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

    // 배치된 가구의 X범위
    const freeModules = placedModules.filter(m => m.isFreePlacement);
    const bounds = freeModules.map(m => getModuleBoundsX(m)).sort((a, b) => a.left - b.left);

    // 스냅 포인트 수집: 벽 + 가구 가장자리
    const snapPoints: number[] = [];
    snapPoints.push(startX + halfWidth);   // 왼쪽 벽
    snapPoints.push(endX - halfWidth);     // 오른쪽 벽
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

  // 배치 실행 공통 함수
  const executePlacement = useCallback((moduleId: string, xMm: number, dims: { width: number; height: number; depth: number }, modData: any, skipCollision?: boolean) => {
    const result = placeFurnitureFree({
      moduleId,
      xPositionMM: xMm,
      spaceInfo,
      dimensions: dims,
      existingModules: placedModules,
      moduleData: modData,
      skipCollisionCheck: skipCollision,
    });

    if (result.success && result.module) {
      addModule(result.module);
      console.log('✅ [FreePlacement] 배치 완료:', result.module.id);
      return true;
    } else {
      console.warn('❌ [FreePlacement] 배치 실패:', result.error);
      return false;
    }
  }, [spaceInfo, placedModules, addModule]);

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

  // R3F onClick - 클릭하면 즉시 배치
  const handleClick = useCallback(
    (e: any) => {
      if (!activeModuleId || !activeModuleData || !activeDimensions || hoverXmm === null || isColliding)
        return;
      e.stopPropagation();
      const placed = executePlacement(activeModuleId, hoverXmm, activeDimensions, activeModuleData, isSnapped);
      if (placed) {
        // 배치 성공 후 선택 해제 (고스트 제거)
        useFurnitureStore.getState().setSelectedFurnitureId(null);
        useFurnitureStore.getState().setFurniturePlacementMode(false);
        setHoverXmm(null);
        setIsColliding(false);
      }
    },
    [activeModuleId, activeModuleData, activeDimensions, hoverXmm, isColliding, isSnapped, executePlacement]
  );

  // 고스트 Y 위치 계산
  const ghostYThree = useMemo(() => {
    if (!activeDimensions) return 0;
    const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseHeightMm = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
    const floatHeightMm = spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;

    if (activeCategory === 'upper') {
      const topFrameMm = spaceInfo.frameSize?.top || 10;
      const upperTopY = spaceInfo.height - topFrameMm;
      return (upperTopY - activeDimensions.height / 2) * 0.01;
    }
    return (floorFinishMm + baseHeightMm + floatHeightMm + activeDimensions.height / 2) * 0.01;
  }, [activeDimensions, activeCategory, spaceInfo]);

  // 고스트 이동 중 실시간 이격거리 계산 (좌/우 벽 또는 가구와의 거리)
  const ghostDistanceGuides = useMemo(() => {
    if (hoverXmm === null || !activeDimensions) return null;

    const ghostLeft = hoverXmm - activeDimensions.width / 2;
    const ghostRight = hoverXmm + activeDimensions.width / 2;
    const { startX, endX } = spaceBounds;

    // 배치된 가구의 X범위
    const freeModules = placedModules.filter(m => m.isFreePlacement);
    const bounds = freeModules.map(m => getModuleBoundsX(m)).sort((a, b) => a.left - b.left);

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

    return { leftObstacle, rightObstacle, leftDistance, rightDistance, modLeft, modRight, guideY };
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

  // 치수선 Z 좌표 (가구 측판과 동일 평면 z=0)
  const guideZPosition = 0;

  // 고스트 위치
  const ghostPosition = useMemo(() => {
    if (hoverXmm === null || !activeDimensions) return null;
    return { x: hoverXmm * 0.01, y: ghostYThree, z: ghostZPosition };
  }, [hoverXmm, activeDimensions, ghostYThree, ghostZPosition]);

  // 남은 공간 사이즈 계산 (배치된 가구 사이의 갭)
  const remainingGaps = useMemo(() => {
    const freeModules = placedModules.filter(m => m.isFreePlacement);
    if (freeModules.length === 0) return [];

    // 모든 가구의 X범위를 구해서 왼쪽부터 정렬
    const bounds = freeModules.map(m => ({
      ...getModuleBoundsX(m),
      id: m.id,
    })).sort((a, b) => a.left - b.left);

    const gaps: Array<{
      startX: number; endX: number; width: number;
      centerX: number; centerY: number;
      adjacentModuleId: string | null; // 이격거리 변경 시 이동할 가구
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
    setEditingGapIndex(index);
    setEditingGapValue(currentWidth.toString());
    setTimeout(() => {
      gapInputRef.current?.focus();
      gapInputRef.current?.select();
    }, 100);
  }, []);

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

    const targetModule = placedModules.find(m => m.id === gap.adjacentModuleId);
    if (!targetModule) {
      setEditingGapIndex(null);
      setEditingGapValue('');
      return;
    }

    const moduleWidthMm = targetModule.freeWidth || 0;
    const halfWidth = moduleWidthMm / 2;

    let newCenterXmm: number;
    if (gap.gapType === 'left-wall') {
      // 왼쪽 벽에서 newGapMm 만큼 떨어지게
      newCenterXmm = spaceBounds.startX + newGapMm + halfWidth;
    } else if (gap.gapType === 'right-wall') {
      // 오른쪽 벽에서 newGapMm 만큼 떨어지게
      newCenterXmm = spaceBounds.endX - newGapMm - halfWidth;
    } else {
      // between: 왼쪽 가구의 오른쪽 끝(anchorX)에서 newGapMm 만큼 떨어지게
      newCenterXmm = gap.anchorX + newGapMm + halfWidth;
    }

    const clampedX = clampToSpaceBoundsX(newCenterXmm, moduleWidthMm, spaceInfo);
    updatePlacedModule(gap.adjacentModuleId, {
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

    // 자기 자신 제외한 가구의 X범위
    const otherModules = placedModules.filter(m => m.isFreePlacement && m.id !== moduleId);
    const bounds = otherModules.map(m => getModuleBoundsX(m)).sort((a, b) => a.left - b.left);

    let snapped = false;

    // 키보드 이동 시에는 스냅 건너뜀 (정확한 1mm 이동)
    if (!skipSnap) {
      // 스냅 포인트 수집
      const snapPoints: number[] = [];
      snapPoints.push(startX + halfWidth);
      snapPoints.push(endX - halfWidth);
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
  }, [placedModules, spaceInfo, spaceBounds]);

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
    e.stopPropagation();
    setMovingModuleId(editingFreeModuleId);
    setIsDraggingPlaced(true);
    window.dispatchEvent(new CustomEvent('furniture-drag-start'));
  }, [editingFreeModuleId]);

  // 배치된 가구 드래그 중 (1mm 단위로 이동)
  const handleDragPointerMove = useCallback((e: any) => {
    if (!isDraggingPlaced || !movingModuleId) return;
    e.stopPropagation();
    const xMm = Math.round(e.point.x * 100); // 1mm 단위로 반올림
    const result = calcMovedPosition(xMm, movingModuleId);
    if (!result.colliding) {
      const mod = placedModules.find(m => m.id === movingModuleId);
      if (mod) {
        updatePlacedModule(movingModuleId, {
          position: { x: result.x * 0.01, y: mod.position.y, z: mod.position.z },
        });
      }
    }
  }, [isDraggingPlaced, movingModuleId, calcMovedPosition, placedModules, updatePlacedModule]);

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
        updatePlacedModule(targetId, {
          position: { x: result.x * 0.01, y: mod.position.y, z: mod.position.z },
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFreePlacement, movingModuleId, editingFreeModuleId, placedModules, calcMovedPosition, updatePlacedModule]);

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
            internalHeight={activeDimensions.height}
            spaceInfo={spaceInfo}
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
                activeDimensions.height * 0.01,
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
                  activeDimensions.height * 0.01,
                  activeDimensions.depth * 0.01
                ),
              ]}
            />
            <lineBasicMaterial color="#ef4444" linewidth={2} />
          </lineSegments>
        </group>
      )}

      {/* 고스트 위 너비 표시 */}
      {ghostPosition && activeDimensions && (
        <Html
          position={[ghostPosition.x, ghostPosition.y + (activeDimensions.height * 0.01) / 2 + 0.15, ghostPosition.z]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div style={{
            background: isColliding ? '#ef4444' : '#22c55e',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
          }}>
            {activeDimensions.width}mm
          </div>
        </Html>
      )}

      {/* 실시간 이격거리 가이드 (고스트 이동 중) */}
      {ghostDistanceGuides && ghostPosition && activeDimensions && !isColliding && (
        <>
          {/* 왼쪽 이격거리 */}
          {ghostDistanceGuides.leftDistance > 2 && (
            <group>
              {/* 가이드 라인 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY, guideZPosition,
                      ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 왼쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                      ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 오른쪽 틱 (고스트 왼쪽 가장자리) */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                      ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 치수 라벨 */}
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
                  background: themeColor,
                  color: 'white',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                }}>
                  {ghostDistanceGuides.leftDistance}mm
                </div>
              </Html>
            </group>
          )}

          {/* 오른쪽 이격거리 */}
          {ghostDistanceGuides.rightDistance > 2 && (
            <group>
              {/* 가이드 라인 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY, guideZPosition,
                      ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 왼쪽 틱 (고스트 오른쪽 가장자리) */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                      ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 오른쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY - 0.08, guideZPosition,
                      ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 치수 라벨 */}
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
                  background: themeColor,
                  color: 'white',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                }}>
                  {ghostDistanceGuides.rightDistance}mm
                </div>
              </Html>
            </group>
          )}
        </>
      )}

      {/* 드래그 이동 중인 가구의 실시간 이격거리 가이드 (편집 팝업 시에는 remainingGaps 사용) */}
      {editingDistanceGuides && isDraggingPlaced && (
        <>
          {/* 왼쪽 이격거리 */}
          {editingDistanceGuides.leftDistance > 2 && (
            <group>
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      editingDistanceGuides.leftObstacle * 0.01, editingDistanceGuides.guideY, guideZPosition,
                      editingDistanceGuides.modLeft * 0.01, editingDistanceGuides.guideY, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 왼쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      editingDistanceGuides.leftObstacle * 0.01, editingDistanceGuides.guideY - 0.08, guideZPosition,
                      editingDistanceGuides.leftObstacle * 0.01, editingDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 오른쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      editingDistanceGuides.modLeft * 0.01, editingDistanceGuides.guideY - 0.08, guideZPosition,
                      editingDistanceGuides.modLeft * 0.01, editingDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 치수 라벨 */}
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
                  background: themeColor,
                  color: 'white',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                }}>
                  {editingDistanceGuides.leftDistance}mm
                </div>
              </Html>
            </group>
          )}

          {/* 오른쪽 이격거리 */}
          {editingDistanceGuides.rightDistance > 2 && (
            <group>
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      editingDistanceGuides.modRight * 0.01, editingDistanceGuides.guideY, guideZPosition,
                      editingDistanceGuides.rightObstacle * 0.01, editingDistanceGuides.guideY, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 왼쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      editingDistanceGuides.modRight * 0.01, editingDistanceGuides.guideY - 0.08, guideZPosition,
                      editingDistanceGuides.modRight * 0.01, editingDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 오른쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      editingDistanceGuides.rightObstacle * 0.01, editingDistanceGuides.guideY - 0.08, guideZPosition,
                      editingDistanceGuides.rightObstacle * 0.01, editingDistanceGuides.guideY + 0.08, guideZPosition,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={themeColor} linewidth={1} />
              </line>
              {/* 치수 라벨 */}
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
                  background: themeColor,
                  color: 'white',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
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
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([
                  gap.startX * 0.01, gap.centerY, guideZPosition,
                  gap.endX * 0.01, gap.centerY, guideZPosition,
                ])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={lineColor} linewidth={1} />
          </line>
          {/* 양쪽 틱 마크 */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([
                  gap.startX * 0.01, gap.centerY - 0.08, guideZPosition,
                  gap.startX * 0.01, gap.centerY + 0.08, guideZPosition,
                ])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={lineColor} linewidth={1} />
          </line>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([
                  gap.endX * 0.01, gap.centerY - 0.08, guideZPosition,
                  gap.endX * 0.01, gap.centerY + 0.08, guideZPosition,
                ])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={lineColor} linewidth={1} />
          </line>
          {/* 치수 라벨 - 클릭하면 인라인 편집 */}
          {editingGapIndex === i ? (
            <Html
              position={[gap.centerX, gap.centerY + 0.1, guideZPosition]}
              center
              style={{ pointerEvents: 'auto' }}
              zIndexRange={[10000, 10001]}
            >
              <div style={{
                background: 'white',
                padding: '2px 4px',
                borderRadius: '4px',
                border: `2px solid ${themeColor}`,
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}>
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
                />
                <span style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>mm</span>
              </div>
            </Html>
          ) : (
            <Html
              position={[gap.centerX, gap.centerY + 0.1, guideZPosition]}
              center
              style={{ pointerEvents: 'auto', userSelect: 'none' }}
            >
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
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleGapLabelClick(i, gap.width);
                }}
              >
                {gap.width}mm
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
