import React, { useState, useCallback, useMemo, useRef } from 'react';
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

/**
 * 자유배치 모드 - 클릭 배치
 * 1. 썸네일 클릭 → 고스트 나타남
 * 2. 마우스 이동 → 고스트 따라다니며 좌우 이격거리 실시간 표시
 * 3. 클릭 → 즉시 배치
 */
const FreePlacementDropZone: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, placedModules, addModule } = useFurnitureStore();
  const { theme } = useTheme();

  const [hoverXmm, setHoverXmm] = useState<number | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const planeRef = useRef<THREE.Mesh>(null);

  const isFreePlacement = spaceInfo.layoutMode === 'free-placement';

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
    setHoverXmm(clampedX);

    const newBounds: FurnitureBoundsX = {
      left: clampedX - halfWidth,
      right: clampedX + halfWidth,
      category: (category as 'full' | 'upper' | 'lower') || 'full',
    };

    // 스냅 위치에서는 충돌 판정 안함 (정확히 붙은 상태이므로)
    if (snapped) {
      setIsColliding(false);
    } else {
      setIsColliding(checkFreeCollision(placedModules, newBounds));
    }
  }, [spaceInfo, placedModules, spaceBounds]);

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
      const placed = executePlacement(activeModuleId, hoverXmm, activeDimensions, activeModuleData);
      if (placed) {
        // 배치 성공 후 선택 해제 (고스트 제거)
        useFurnitureStore.getState().setSelectedFurnitureId(null);
        useFurnitureStore.getState().setFurniturePlacementMode(false);
        setHoverXmm(null);
        setIsColliding(false);
      }
    },
    [activeModuleId, activeModuleData, activeDimensions, hoverXmm, isColliding, executePlacement]
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
                      ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY, 0.02,
                      ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY, 0.02,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#f59e0b" linewidth={1} />
              </line>
              {/* 왼쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY - 0.08, 0.02,
                      ghostDistanceGuides.leftObstacle * 0.01, ghostDistanceGuides.guideY + 0.08, 0.02,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#f59e0b" linewidth={1} />
              </line>
              {/* 오른쪽 틱 (고스트 왼쪽 가장자리) */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY - 0.08, 0.02,
                      ghostDistanceGuides.ghostLeft * 0.01, ghostDistanceGuides.guideY + 0.08, 0.02,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#f59e0b" linewidth={1} />
              </line>
              {/* 치수 라벨 */}
              <Html
                position={[
                  ((ghostDistanceGuides.leftObstacle + ghostDistanceGuides.ghostLeft) / 2) * 0.01,
                  ghostDistanceGuides.guideY + 0.15,
                  0.02,
                ]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: '#f59e0b',
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
                      ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY, 0.02,
                      ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY, 0.02,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#f59e0b" linewidth={1} />
              </line>
              {/* 왼쪽 틱 (고스트 오른쪽 가장자리) */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY - 0.08, 0.02,
                      ghostDistanceGuides.ghostRight * 0.01, ghostDistanceGuides.guideY + 0.08, 0.02,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#f59e0b" linewidth={1} />
              </line>
              {/* 오른쪽 틱 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={new Float32Array([
                      ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY - 0.08, 0.02,
                      ghostDistanceGuides.rightObstacle * 0.01, ghostDistanceGuides.guideY + 0.08, 0.02,
                    ])}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#f59e0b" linewidth={1} />
              </line>
              {/* 치수 라벨 */}
              <Html
                position={[
                  ((ghostDistanceGuides.ghostRight + ghostDistanceGuides.rightObstacle) / 2) * 0.01,
                  ghostDistanceGuides.guideY + 0.15,
                  0.02,
                ]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: '#f59e0b',
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

      {/* 배치 후 남은 공간 사이즈 표시 */}
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
