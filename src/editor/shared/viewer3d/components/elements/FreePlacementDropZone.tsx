import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SpaceInfo, useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateInternalSpace } from '../../utils/geometry';
import { getModuleById } from '@/data/modules';
import {
  getInternalSpaceBoundsX,
  clampToSpaceBoundsX,
  checkFreeCollision,
  FurnitureBoundsX,
} from '@/editor/shared/utils/freePlacementUtils';
import { placeFurnitureFree } from '@/editor/shared/furniture/hooks/usePlaceFurnitureFree';
import BoxModule from '../modules/BoxModule';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * 자유배치 모드 드롭존
 * - 내부 공간 전체를 덮는 투명 평면 (raycasting용)
 * - 마우스 위치에 따른 가구 고스트 프리뷰
 * - 충돌 시 빨간색, 가능 시 녹색 표시
 * - 클릭으로 배치 확정
 */

const FreePlacementDropZone: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, placedModules, addModule } = useFurnitureStore();
  const { view2DTheme } = useUIStore();
  const { theme } = useTheme();
  const { camera, raycaster } = useThree();

  const [hoverXmm, setHoverXmm] = useState<number | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const planeRef = useRef<THREE.Mesh>(null);

  // 자유배치 모드가 아니면 렌더링하지 않음
  if (spaceInfo.layoutMode !== 'free-placement') return null;

  // 선택된 가구 모듈 데이터
  const internalSpace = useMemo(() => calculateInternalSpace(spaceInfo), [spaceInfo]);
  const moduleData = useMemo(() => {
    if (!selectedFurnitureId) return null;
    return getModuleById(selectedFurnitureId, internalSpace, spaceInfo);
  }, [selectedFurnitureId, internalSpace, spaceInfo]);

  // 가구 치수 - 기본값은 모듈 데이터에서 가져옴
  const dimensions = useMemo(() => {
    if (!moduleData) return null;
    return {
      width: moduleData.dimensions.width,
      height: moduleData.dimensions.height,
      depth: moduleData.dimensions.depth,
    };
  }, [moduleData]);

  // 내부 공간 범위
  const spaceBounds = useMemo(() => getInternalSpaceBoundsX(spaceInfo), [spaceInfo]);

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

  // 마우스 이동 시 X 위치 계산
  const handlePointerMove = useCallback(
    (e: any) => {
      if (!dimensions) return;
      e.stopPropagation();

      // Three.js 좌표를 mm로 변환
      const xThree = e.point.x;
      const xMm = xThree * 100;

      // 공간 경계 내로 클램핑
      const clampedX = clampToSpaceBoundsX(xMm, dimensions.width, spaceInfo);
      setHoverXmm(clampedX);

      // 충돌 체크
      const newBounds: FurnitureBoundsX = {
        left: clampedX - dimensions.width / 2,
        right: clampedX + dimensions.width / 2,
        category: (moduleData?.category as 'full' | 'upper' | 'lower') || 'full',
      };
      setIsColliding(checkFreeCollision(placedModules, newBounds));
    },
    [dimensions, spaceInfo, moduleData, placedModules]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverXmm(null);
    setIsColliding(false);
  }, []);

  // 클릭으로 배치 확정
  const handleClick = useCallback(
    (e: any) => {
      if (!selectedFurnitureId || !moduleData || !dimensions || hoverXmm === null || isColliding)
        return;
      e.stopPropagation();

      const result = placeFurnitureFree({
        moduleId: selectedFurnitureId,
        xPositionMM: hoverXmm,
        spaceInfo,
        dimensions,
        existingModules: placedModules,
        moduleData,
      });

      if (result.success && result.module) {
        addModule(result.module);
        console.log('✅ [FreePlacementDropZone] 가구 배치 완료:', result.module.id);
      } else {
        console.warn('❌ [FreePlacementDropZone] 배치 실패:', result.error);
      }
    },
    [selectedFurnitureId, moduleData, dimensions, hoverXmm, isColliding, spaceInfo, placedModules, addModule]
  );

  // 선택된 가구가 없으면 렌더링하지 않음
  if (!selectedFurnitureId || !moduleData || !dimensions) return null;

  // 고스트 프리뷰 위치 계산
  const ghostPosition = useMemo(() => {
    if (hoverXmm === null) return null;
    const xThree = hoverXmm * 0.01;

    // Y 위치: 카테고리별 자동 계산
    const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseHeightMm = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
    const floatHeightMm = spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;

    let yThree: number;
    if (moduleData.category === 'upper') {
      const topFrameMm = spaceInfo.frameSize?.top || 10;
      const upperTopY = spaceInfo.height - topFrameMm;
      yThree = (upperTopY - dimensions.height / 2) * 0.01;
    } else {
      yThree = (floorFinishMm + baseHeightMm + floatHeightMm + dimensions.height / 2) * 0.01;
    }

    return { x: xThree, y: yThree, z: 0 };
  }, [hoverXmm, spaceInfo, moduleData, dimensions]);

  // 고스트 색상
  const ghostColor = isColliding ? '#ef4444' : '#22c55e';
  const ghostOpacity = 0.4;

  return (
    <>
      {/* 투명 raycasting 평면 - 공간 전체를 덮음 */}
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

      {/* 고스트 프리뷰 */}
      {ghostPosition && (
        <group position={[ghostPosition.x, ghostPosition.y, ghostPosition.z]}>
          <mesh>
            <boxGeometry
              args={[
                dimensions.width * 0.01,
                dimensions.height * 0.01,
                dimensions.depth * 0.01,
              ]}
            />
            <meshBasicMaterial
              color={ghostColor}
              transparent
              opacity={ghostOpacity}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* 윤곽선 */}
          <lineSegments>
            <edgesGeometry
              args={[
                new THREE.BoxGeometry(
                  dimensions.width * 0.01,
                  dimensions.height * 0.01,
                  dimensions.depth * 0.01
                ),
              ]}
            />
            <lineBasicMaterial color={ghostColor} linewidth={2} />
          </lineSegments>
        </group>
      )}
    </>
  );
};

export default FreePlacementDropZone;
