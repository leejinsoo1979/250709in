import React, { useMemo } from 'react';
import { Edges, Text } from '@react-three/drei';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '../../utils/geometry';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';

interface FurniturePlacementPlaneProps {
  spaceInfo: SpaceInfo;
}

const FurniturePlacementPlane: React.FC<FurniturePlacementPlaneProps> = ({ spaceInfo }) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const isLiveDimensionMode = useUIStore(state => state.isLiveDimensionMode);
  const isTapeMeasureMode = useUIStore(state => state.isTapeMeasureMode);
  const viewMode = useUIStore(state => state.viewMode);
  const activePlacementWall = useUIStore(state => state.activePlacementWall);
  const showDimensions = useUIStore(state => state.showDimensions);
  const { theme } = useTheme();

  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 바닥재 높이 계산
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
  
  // 받침대 설정에 따른 기준면 높이 계산
  let planeY: number;
  
  if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
    // 받침대 있음: baseConfig.height가 바닥마감재 높이를 이미 포함
    planeY = mmToThreeUnits(baseFrameHeightMm);
  } else if (spaceInfo.baseConfig.type === 'stand') {
    // 받침대 없음
    if (spaceInfo.baseConfig.placementType === 'float') {
      // 띄워서 배치: 바닥재 + 띄움 높이
      const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
      planeY = mmToThreeUnits(floorFinishHeightMm + floatHeightMm);
    } else {
      // 바닥에 배치: 바닥재만
      planeY = mmToThreeUnits(floorFinishHeightMm);
    }
  } else {
    // 기본값: 바닥재만
    planeY = mmToThreeUnits(floorFinishHeightMm);
  }
  
  // 내경 공간 크기 - 공간 뒷면에 정확히 맞춤
  const planeDepth = mmToThreeUnits(internalSpace.depth - 200 - 20); // 내경 공간에서 220mm 줄인 깊이 사용 (앞쪽에서 20mm 추가)
  
  // 기준면을 내경 공간 중앙에 정확히 배치 (Z=0이 공간 앞면, -depth가 뒷면)
  // 앞쪽에서 20mm 줄였으므로 중심을 10mm 뒤로 이동
  // + 공간 그라데이션 메쉬와 동일하게 30mm 추가 뒤로 이동 (총 -40mm)
  const planeZ = mmToThreeUnits(-40);
  
  // placedModules 중 도어가 장착된 모듈이 하나라도 있으면 바닥 슬롯 매쉬를 숨김
  const hasAnyDoor = placedModules.some(module => module.hasDoor);

  // 테마 색상을 실제 hex 값으로 변환
  const themeColorHex = useMemo(() => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  }, [theme.color]);

  // 단내림 영역 정보 계산
  const indexing = calculateSpaceIndexing(spaceInfo);
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled && indexing.zones;

  const getSideSlotSizes = (wall: 'left' | 'right') => {
    // 좌측벽 메쉬 깊이 = spaceInfo.depth (1500)
    const totalDepthMm = Math.max(1, spaceInfo.depth || internalSpace.depth || 600);
    const distributeDepth = (depthMm: number) => {
      if (depthMm <= 0.5) {
        return [];
      }
      const slotCount = Math.max(1, Math.ceil(depthMm / 600));
      const slotDepthMm = depthMm / slotCount;
      return Array.from({ length: slotCount }, () => slotDepthMm);
    };
    const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const cornerSlotIndex = wall === 'left'
      ? 0
      : zoneSlotInfo.normal.columnCount - 1;
    const frontCornerModule = placedModules.find(mod => {
      const wall = (mod as any).placementWall || 'front';
      return wall === 'front' && mod.slotIndex === cornerSlotIndex;
    });
    const frontCornerData = frontCornerModule
      ? getModuleById(frontCornerModule.moduleId, internalSpace, spaceInfo)
      : undefined;
    if (!frontCornerModule) {
      return distributeDepth(totalDepthMm);
    }

    const fallbackCornerDepthMm = Math.min(600, totalDepthMm);
    const cornerDepthMm = Math.min(
      totalDepthMm,
      Math.max(
        1,
        frontCornerModule?.customDepth
          ?? frontCornerModule?.freeDepth
          ?? frontCornerData?.dimensions?.depth
          ?? fallbackCornerDepthMm
      )
    );
    const remainingDepthMm = Math.max(0, totalDepthMm - cornerDepthMm);
    if (remainingDepthMm <= 0.5) {
      return [totalDepthMm];
    }

    return [
      cornerDepthMm,
      ...distributeDepth(remainingDepthMm)
    ];
  };

  const getSideWallMeshRangeMm = () => {
    const panelDepthMm = Math.max(1, spaceInfo.depth || internalSpace.depth || 600);
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const furnitureZOffsetMm = -panelDepthMm / 2 + (panelDepthMm - furnitureDepthMm) / 2;
    const backMeshGapMm = 10;
    const meshBackShiftMm = 30;
    const extensionDepthMm = 300;
    const startZMm = furnitureZOffsetMm - furnitureDepthMm / 2 - backMeshGapMm - meshBackShiftMm;
    const depthMm = panelDepthMm + extensionDepthMm;
    return { startZMm, depthMm };
  };

  const getSideWallVerticalRangeMm = (wall: 'left' | 'right') => {
    const droppedCeiling = spaceInfo.droppedCeiling;
    const isDroppedWall = droppedCeiling?.enabled && droppedCeiling.position === wall;
    const dropHeightMm = isDroppedWall ? (droppedCeiling.dropHeight || 0) : 0;
    const heightMm = Math.max(1, internalSpace.height - dropHeightMm);
    return {
      startYmm: internalSpace.startY,
      heightMm,
      centerYmm: internalSpace.startY + heightMm / 2
    };
  };

  const renderSideWallSlotMeshes = (wall: 'left' | 'right') => {
    if (spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox.position === wall) {
      return null;
    }

    const sideSlotSizes = getSideSlotSizes(wall);
    const sideWallX = wall === 'left'
      ? -spaceInfo.width / 2
      : spaceInfo.width / 2;
    const wallX = mmToThreeUnits(sideWallX);
    const verticalRange = getSideWallVerticalRangeMm(wall);
    const slotHeight = mmToThreeUnits(verticalRange.heightMm);
    const slotY = mmToThreeUnits(verticalRange.centerYmm);
    const rotationY = wall === 'left' ? Math.PI / 2 : -Math.PI / 2;
    const surfaceOffsetX = wall === 'left' ? 0.03 : -0.03;
    const textOffsetX = wall === 'left' ? 0.03 : -0.03;
    const meshes: React.ReactNode[] = [];
    const sideWallRange = getSideWallMeshRangeMm();
    const totalSideDepthMm = sideSlotSizes.reduce((sum, size) => sum + size, 0);
    let currentDepthFromFrontMm = 0;

    for (let i = 0; i < sideSlotSizes.length; i++) {
      const currentSlotDepth = sideSlotSizes[i];
      // 코너 슬롯은 좌/우측 모두 정면 뒷벽 모서리에서 시작하고, 나머지는 방 안쪽으로 이어진다.
      const slotStartRatio = currentDepthFromFrontMm / totalSideDepthMm;
      const slotDepthRatio = currentSlotDepth / totalSideDepthMm;
      const slotCenterZMm = sideWallRange.startZMm + sideWallRange.depthMm * (slotStartRatio + slotDepthRatio / 2);
      const slotVisualDepthMm = sideWallRange.depthMm * slotDepthRatio;
      const slotCenterZ = mmToThreeUnits(slotCenterZMm);

      meshes.push(
        <group key={`side-wall-${wall}-slot-${i}-${theme.color}-${theme.mode}`}>
          <mesh
            position={[wallX + surfaceOffsetX, slotY, slotCenterZ]}
            rotation={[0, rotationY, 0]}
            renderOrder={2}
          >
            <planeGeometry args={[mmToThreeUnits(slotVisualDepthMm), slotHeight]} />
            <meshBasicMaterial
              color={themeColorHex}
              transparent
              opacity={0.08}
              depthTest={false}
              depthWrite={false}
              side={2}
            />
            <Edges color={themeColorHex} />
          </mesh>
          {showDimensions && (
            <Text
              position={[
                wallX + textOffsetX,
                slotY,
                slotCenterZ
              ]}
              rotation={[0, rotationY, 0]}
              fontSize={0.5}
              color={themeColorHex}
              anchorX="center"
              anchorY="middle"
              renderOrder={5}
            >
              {currentSlotDepth % 1 === 0 ? currentSlotDepth : currentSlotDepth.toFixed(1)}
            </Text>
          )}
        </group>
      );

      currentDepthFromFrontMm += currentSlotDepth;
    }

    return meshes;
  };

  // 영역(zone)별로 차지된 슬롯 인덱스 Set 생성
  // SlotDropZonesSimple.getOccupiedSlots와 동일한 규칙 사용
  const getOccupiedSlots = (zoneType: 'full' | 'normal' | 'dropped'): Set<number> => {
    const occupied = new Set<number>();
    placedModules.forEach(mod => {
      const matchesZone = zoneType === 'full'
        || (zoneType === 'normal' && (!mod.zone || mod.zone === 'normal'))
        || (zoneType === 'dropped' && mod.zone === 'dropped');
      if (!matchesZone) return;
      if (mod.slotIndex === undefined || mod.slotIndex === null) return;
      occupied.add(mod.slotIndex);
      const isDual = mod.isDualSlot || mod.moduleId?.includes('dual-');
      if (isDual) occupied.add(mod.slotIndex + 1);
    });
    return occupied;
  };

  // 단일 zone 영역을 슬롯별 메쉬로 분할 렌더링 (차지된 슬롯은 제외)
  const renderZoneSlotMeshes = (
    zoneStartXmm: number,
    zoneColumnCount: number,
    zoneColumnWidth: number,
    zoneSlotWidths: number[] | undefined,
    zoneType: 'full' | 'normal' | 'dropped',
    keyPrefix: string
  ) => {
    const occupied = getOccupiedSlots(zoneType);
    const totalWidth = spaceInfo.width;
    const meshes: React.ReactNode[] = [];
    let currentXmm = zoneStartXmm;

    for (let i = 0; i < zoneColumnCount; i++) {
      const slotWmm = zoneSlotWidths?.[i] ?? zoneColumnWidth;
      if (!occupied.has(i)) {
        const slotCenterXmm = currentXmm + slotWmm / 2;
        const slotCenterX = -(totalWidth / 2) + slotCenterXmm;
        meshes.push(
          <mesh
            key={`${keyPrefix}-slot-${i}`}
            position={[mmToThreeUnits(slotCenterX), planeY - 0.1, planeZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[mmToThreeUnits(slotWmm), planeDepth]} />
            <meshBasicMaterial
              color={themeColorHex}
              transparent
              opacity={0.05}
              side={2}
            />
          </mesh>
        );
      }
      currentXmm += slotWmm;
    }
    return meshes;
  };
  
  // 도어가 하나라도 장착되면 바닥 슬롯 매쉬를 모두 숨김 (기존 동작 유지)
  if (viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode)) {
    return null;
  }

  if (viewMode === '3D') {
    if (activePlacementWall === 'front') {
      return (
        <>
          {renderSideWallSlotMeshes('left')}
          {renderSideWallSlotMeshes('right')}
        </>
      );
    }
    if (activePlacementWall === 'left' || activePlacementWall === 'right') {
      return <>{renderSideWallSlotMeshes(activePlacementWall)}</>;
    }
    return null;
  }

  if (hasAnyDoor) {
    return null;
  }

  // 단내림이 있을 때: 영역별로 슬롯 단위 메쉬 생성 (배치된 슬롯 제외)
  if (hasDroppedCeiling && indexing.zones) {
    const meshes: React.ReactNode[] = [];

    if (indexing.zones.normal) {
      meshes.push(
        ...renderZoneSlotMeshes(
          indexing.zones.normal.startX,
          indexing.zones.normal.columnCount,
          indexing.zones.normal.columnWidth,
          indexing.zones.normal.slotWidths,
          'normal',
          'normal-zone'
        )
      );
    }

    if (indexing.zones.dropped) {
      meshes.push(
        ...renderZoneSlotMeshes(
          indexing.zones.dropped.startX,
          indexing.zones.dropped.columnCount,
          indexing.zones.dropped.columnWidth,
          indexing.zones.dropped.slotWidths,
          'dropped',
          'dropped-zone'
        )
      );
    }

    return <>{meshes}</>;
  }

  // 단내림이 없을 때: 내경 영역을 슬롯 단위로 분할하여 배치된 슬롯 제외
  return (
    <>
      {renderZoneSlotMeshes(
        internalSpace.startX,
        indexing.columnCount,
        indexing.columnWidth,
        indexing.slotWidths,
        'full',
        `slot-mesh-${theme.color}-${theme.mode}`
      )}
    </>
  );
};

export default FurniturePlacementPlane; 
