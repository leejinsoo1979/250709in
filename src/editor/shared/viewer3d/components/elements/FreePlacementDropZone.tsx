import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
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

// window 타입 확장
declare global {
  interface Window {
    handleFreeDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

/**
 * 자유배치 모드 드롭존
 * - 드래그앤드롭 + 클릭 배치 모두 지원
 * - 드래그 중 고스트 프리뷰가 마우스를 따라다님
 * - 배치 후 남은 공간 사이즈 표시
 */
const FreePlacementDropZone: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, currentDragData, placedModules, addModule } = useFurnitureStore();
  const { view2DTheme } = useUIStore();
  const { theme } = useTheme();
  const { camera } = useThree();

  const [hoverXmm, setHoverXmm] = useState<number | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const planeRef = useRef<THREE.Mesh>(null);

  const isFreePlacement = spaceInfo.layoutMode === 'free-placement';

  // 내부 공간 계산
  const internalSpace = useMemo(() => calculateInternalSpace(spaceInfo), [spaceInfo]);
  const spaceBounds = useMemo(() => getInternalSpaceBoundsX(spaceInfo), [spaceInfo]);

  // 활성 가구 데이터 (클릭 선택 or 드래그 중)
  const activeModuleId = currentDragData?.moduleData?.id || selectedFurnitureId;
  const activeModuleData = useMemo(() => {
    if (currentDragData?.moduleData) {
      return currentDragData.moduleData;
    }
    if (!selectedFurnitureId) return null;
    return getModuleById(selectedFurnitureId, internalSpace, spaceInfo);
  }, [currentDragData, selectedFurnitureId, internalSpace, spaceInfo]);

  // 활성 가구 치수
  const activeDimensions = useMemo(() => {
    if (currentDragData?.moduleData?.dimensions) {
      return currentDragData.moduleData.dimensions;
    }
    if (!activeModuleData) return null;
    return {
      width: activeModuleData.dimensions.width,
      height: activeModuleData.dimensions.height,
      depth: activeModuleData.dimensions.depth,
    };
  }, [currentDragData, activeModuleData]);

  // 활성 카테고리
  const activeCategory = useMemo(() => {
    if (currentDragData?.moduleData?.category) return currentDragData.moduleData.category;
    if (activeModuleData?.category) return activeModuleData.category;
    return 'full';
  }, [currentDragData, activeModuleData]);

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

  // clientX,clientY → mm X좌표 변환 (HTML5 drag 이벤트용)
  const clientToXmm = useCallback((clientX: number, clientY: number): number | null => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), camera);

    // Z=0 평면과 교차점
    const ray = raycaster.ray;
    const t = -ray.origin.z / ray.direction.z;
    if (t <= 0) return null;
    const intersectX = ray.origin.x + ray.direction.x * t;
    return intersectX * 100; // Three.js → mm
  }, [camera]);

  // 충돌 체크 + hover 상태 업데이트 공통 함수
  const updateHoverState = useCallback((xMm: number, widthMm: number, category: string) => {
    const clampedX = clampToSpaceBoundsX(xMm, widthMm, spaceInfo);
    setHoverXmm(clampedX);

    const newBounds: FurnitureBoundsX = {
      left: clampedX - widthMm / 2,
      right: clampedX + widthMm / 2,
      category: (category as 'full' | 'upper' | 'lower') || 'full',
    };
    setIsColliding(checkFreeCollision(placedModules, newBounds));
  }, [spaceInfo, placedModules]);

  // 배치 실행 공통 함수
  const executePlacement = useCallback((moduleId: string, xMm: number, dims: { width: number; height: number; depth: number }, modData: any) => {
    const result = placeFurnitureFree({
      moduleId,
      xPositionMM: xMm,
      spaceInfo,
      dimensions: dims,
      existingModules: placedModules,
      moduleData: modData,
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

  // R3F onPointerMove (클릭-앤-플레이스 모드)
  const handlePointerMove = useCallback(
    (e: any) => {
      if (!activeDimensions || currentDragData) return; // 드래그 중이면 R3F 이벤트 무시
      e.stopPropagation();

      const xMm = e.point.x * 100;
      updateHoverState(xMm, activeDimensions.width, activeCategory);
    },
    [activeDimensions, currentDragData, activeCategory, updateHoverState]
  );

  const handlePointerLeave = useCallback(() => {
    if (!currentDragData) {
      setHoverXmm(null);
      setIsColliding(false);
    }
  }, [currentDragData]);

  // R3F onClick (클릭-앤-플레이스 모드)
  const handleClick = useCallback(
    (e: any) => {
      if (!activeModuleId || !activeModuleData || !activeDimensions || hoverXmm === null || isColliding || currentDragData)
        return;
      e.stopPropagation();
      executePlacement(activeModuleId, hoverXmm, activeDimensions, activeModuleData);
    },
    [activeModuleId, activeModuleData, activeDimensions, hoverXmm, isColliding, currentDragData, executePlacement]
  );

  // HTML5 드래그 이벤트 핸들러 (canvas에 직접 연결)
  useEffect(() => {
    if (!isFreePlacement || !currentDragData) return;

    const dragDims = currentDragData.moduleData?.dimensions;
    const dragCategory = currentDragData.moduleData?.category || 'full';
    if (!dragDims) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      const xMm = clientToXmm(e.clientX, e.clientY);
      if (xMm === null) return;
      updateHoverState(xMm, dragDims.width, dragCategory);
    };

    const handleDragLeave = () => {
      setHoverXmm(null);
      setIsColliding(false);
    };

    const canvas = document.querySelector('canvas');
    const canvasContainer = canvas?.parentElement;
    if (canvasContainer) {
      canvasContainer.addEventListener('dragover', handleDragOver);
      canvasContainer.addEventListener('dragleave', handleDragLeave);
    }

    return () => {
      if (canvasContainer) {
        canvasContainer.removeEventListener('dragover', handleDragOver);
        canvasContainer.removeEventListener('dragleave', handleDragLeave);
      }
    };
  }, [isFreePlacement, currentDragData, clientToXmm, updateHoverState]);

  // window.handleFreeDrop 등록 (Space3DView/ThreeCanvas에서 호출)
  // store에서 직접 읽어 stale closure 방지
  useEffect(() => {
    if (!isFreePlacement) return;

    window.handleFreeDrop = (dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
      console.log('🎯 [handleFreeDrop] 호출됨!');

      // store에서 최신 상태 직접 읽기
      const store = useFurnitureStore.getState();
      const latestDragData = store.currentDragData;
      const latestPlacedModules = store.placedModules;
      const latestSpaceInfo = useSpaceConfigStore.getState().spaceInfo;

      // 드래그 데이터 결정: store → dataTransfer fallback
      let moduleData: any = null;
      let dims: { width: number; height: number; depth: number } | null = null;
      let moduleId: string | null = null;

      if (latestDragData?.moduleData) {
        moduleData = latestDragData.moduleData;
        dims = moduleData.dimensions;
        moduleId = moduleData.id;
      } else {
        try {
          const raw = dragEvent.dataTransfer?.getData('application/json');
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          if (parsed.type !== 'furniture' || !parsed.moduleData) return false;
          moduleData = parsed.moduleData;
          dims = moduleData.dimensions;
          moduleId = moduleData.id;
        } catch {
          return false;
        }
      }

      if (!moduleId || !dims || !moduleData) return false;

      // X 좌표 계산
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const normalizedX = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;
      const normalizedY = -((dragEvent.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), camera);
      const ray = raycaster.ray;
      const t = -ray.origin.z / ray.direction.z;
      if (t <= 0) return false;
      const xMm = (ray.origin.x + ray.direction.x * t) * 100;

      const clampedX = clampToSpaceBoundsX(xMm, dims.width, latestSpaceInfo);

      // 충돌 체크
      const newBounds: FurnitureBoundsX = {
        left: clampedX - dims.width / 2,
        right: clampedX + dims.width / 2,
        category: (moduleData.category as 'full' | 'upper' | 'lower') || 'full',
      };
      if (checkFreeCollision(latestPlacedModules, newBounds)) return false;

      // 배치 실행
      const result = placeFurnitureFree({
        moduleId,
        xPositionMM: clampedX,
        spaceInfo: latestSpaceInfo,
        dimensions: dims,
        existingModules: latestPlacedModules,
        moduleData,
      });

      if (result.success && result.module) {
        store.addModule(result.module);
        console.log('✅ [handleFreeDrop] 배치 완료:', result.module.id);
        // 고스트 초기화
        setHoverXmm(null);
        setIsColliding(false);
        return true;
      }
      console.warn('❌ [handleFreeDrop] 배치 실패:', result.error);
      return false;
    };

    return () => { delete window.handleFreeDrop; };
  }, [isFreePlacement, camera]);

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

    const gaps: Array<{ startX: number; endX: number; width: number; centerX: number; centerY: number }> = [];
    const { startX, endX } = spaceBounds;

    // 바닥 기준 Y 위치 계산
    const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseHeightMm = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
    const labelYmm = floorFinishMm + baseHeightMm + 30; // 바닥 위 30mm

    // 왼쪽 벽 ~ 첫 가구
    if (bounds[0].left - startX > 5) {
      const gapWidth = bounds[0].left - startX;
      gaps.push({
        startX,
        endX: bounds[0].left,
        width: Math.round(gapWidth),
        centerX: ((startX + bounds[0].left) / 2) * 0.01,
        centerY: labelYmm * 0.01,
      });
    }

    // 가구 사이 갭
    for (let i = 0; i < bounds.length - 1; i++) {
      const gapStart = bounds[i].right;
      const gapEnd = bounds[i + 1].left;
      if (gapEnd - gapStart > 5) {
        gaps.push({
          startX: gapStart,
          endX: gapEnd,
          width: Math.round(gapEnd - gapStart),
          centerX: ((gapStart + gapEnd) / 2) * 0.01,
          centerY: labelYmm * 0.01,
        });
      }
    }

    // 마지막 가구 ~ 오른쪽 벽
    const lastBound = bounds[bounds.length - 1];
    if (endX - lastBound.right > 5) {
      const gapWidth = endX - lastBound.right;
      gaps.push({
        startX: lastBound.right,
        endX,
        width: Math.round(gapWidth),
        centerX: ((lastBound.right + endX) / 2) * 0.01,
        centerY: labelYmm * 0.01,
      });
    }

    return gaps;
  }, [placedModules, spaceBounds, spaceInfo]);

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

      {/* 남은 공간 사이즈 표시 */}
      {remainingGaps.map((gap, i) => (
        <group key={`gap-${i}`}>
          {/* 갭 영역 표시선 (바닥 위) */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([
                  gap.startX * 0.01, gap.centerY, 0.02,
                  (gap.startX + gap.width) * 0.01, gap.centerY, 0.02,
                ])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#3b82f6" linewidth={1} />
          </line>
          {/* 양쪽 틱 마크 */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([
                  gap.startX * 0.01, gap.centerY - 0.05, 0.02,
                  gap.startX * 0.01, gap.centerY + 0.05, 0.02,
                ])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#3b82f6" linewidth={1} />
          </line>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([
                  (gap.startX + gap.width) * 0.01, gap.centerY - 0.05, 0.02,
                  (gap.startX + gap.width) * 0.01, gap.centerY + 0.05, 0.02,
                ])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#3b82f6" linewidth={1} />
          </line>
          {/* 치수 라벨 */}
          <Html
            position={[gap.centerX, gap.centerY + 0.1, 0.02]}
            center
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <div style={{
              background: '#3b82f6',
              color: 'white',
              padding: '1px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
            }}>
              {gap.width}mm
            </div>
          </Html>
        </group>
      ))}
    </>
  );
};

export default FreePlacementDropZone;
