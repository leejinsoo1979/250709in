import React, { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '../../utils/geometry';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { useAuth } from '@/auth/AuthProvider';
import NativeLine from './NativeLine';
import { calculateSideWallPlacementRangeMm, resolveSideWallCornerBodyDepthMm } from '../../utils/sideWallPlacement';

interface FurniturePlacementPlaneProps {
  spaceInfo: SpaceInfo;
}

const FurniturePlacementPlane: React.FC<FurniturePlacementPlaneProps> = ({ spaceInfo }) => {
  const { user } = useAuth();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const isLiveDimensionMode = useUIStore(state => state.isLiveDimensionMode);
  const isTapeMeasureMode = useUIStore(state => state.isTapeMeasureMode);
  const viewMode = useUIStore(state => state.viewMode);
  const activePlacementWall = useUIStore(state => state.activePlacementWall);
  const showDimensions = useUIStore(state => state.showDimensions);
  const { theme } = useTheme();
  const isNoWallSpace = spaceInfo.installType === 'freestanding'
    || (!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right);
  const hasPlacementWall = (wall: 'left' | 'right') => wall === 'left'
    ? !!spaceInfo.wallConfig?.left
    : !!spaceInfo.wallConfig?.right;
  const canUsePlacementWallTools = user?.email === 'sbbc212@gmail.com' && !isNoWallSpace;

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

    const cornerDepthMm = resolveSideWallCornerBodyDepthMm(frontCornerModule, frontCornerData, totalDepthMm);
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
    return calculateSideWallPlacementRangeMm(panelDepthMm);
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

  const getSideWallDimensionRangeMm = (wall: 'left' | 'right') => {
    const droppedCeiling = spaceInfo.droppedCeiling;
    const isDroppedWall = droppedCeiling?.enabled && droppedCeiling.position === wall;
    const dropHeightMm = isDroppedWall ? (droppedCeiling.dropHeight || 0) : 0;
    const heightMm = Math.max(1, (spaceInfo.height || internalSpace.height) - dropHeightMm);
    return {
      heightMm,
      centerYmm: heightMm / 2
    };
  };

  const getModuleSectionHeightsMm = (mod: any, moduleData: any, sectionBodyHeightMm: number) => {
    const rawSections = mod.customConfig?.sections
      || mod.customSections
      || moduleData?.modelConfig?.sections
      || moduleData?.modelConfig?.leftSections
      || [];
    if (!Array.isArray(rawSections) || rawSections.length < 2) {
      return [];
    }

    const availableHeightMm = Math.max(0, sectionBodyHeightMm);
    const calculateSectionHeightMm = (section: any, availableMm: number) => {
      const heightType = section.heightType || 'percentage';
      if (heightType === 'absolute') {
        return Math.max(0, Math.min(section.height || 0, availableMm));
      }
      return Math.max(0, availableMm * ((section.height || section.heightRatio || 100) / 100));
    };
    const fixedHeightMm = rawSections
      .filter((section: any) => section.heightType === 'absolute')
      .reduce((sum: number, section: any) => sum + calculateSectionHeightMm(section, availableHeightMm), 0);
    const remainingHeightMm = Math.max(0, availableHeightMm - fixedHeightMm);
    const sectionHeightsMm = rawSections.map((section: any) => section.heightType === 'absolute'
      ? calculateSectionHeightMm(section, availableHeightMm)
      : calculateSectionHeightMm(section, remainingHeightMm));

    if (sectionHeightsMm.length >= 2) {
      const lastIndex = sectionHeightsMm.length - 1;
      const lowerHeightSumMm = sectionHeightsMm
        .slice(0, lastIndex)
        .reduce((sum: number, heightMm: number) => sum + heightMm, 0);
      sectionHeightsMm[lastIndex] = Math.max(0, availableHeightMm - lowerHeightSumMm);
    }

    return sectionHeightsMm.filter((heightMm: number) => heightMm > 0.5);
  };

  const renderSideWallSlotMeshes = (wall: 'left' | 'right') => {
    if (isNoWallSpace || !hasPlacementWall(wall)) {
      return null;
    }
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
    const surfaceOffsetX = wall === 'left' ? 0.001 : -0.001;
    const textOffsetX = surfaceOffsetX + (wall === 'left' ? 0.001 : -0.001);
    const sideModulesForWall = placedModules.filter(mod => ((mod as any).placementWall || 'front') === wall);
    const maxSideFurnitureDepthMm = sideModulesForWall.reduce((maxDepth, mod) => {
      const moduleData = getModuleById(mod.moduleId, internalSpace, spaceInfo);
      return Math.max(
        maxDepth,
        mod.customDepth
          ?? mod.freeDepth
          ?? moduleData?.defaultDepth
          ?? moduleData?.dimensions?.depth
          ?? 0
      );
    }, 0);
    const dimensionOffsetX = maxSideFurnitureDepthMm > 0
      ? mmToThreeUnits(maxSideFurnitureDepthMm + 20) * (wall === 'left' ? 1 : -1)
      : (wall === 'left' ? 0.16 : -0.16);
    const meshes: React.ReactNode[] = [];
    const sideWallRange = getSideWallMeshRangeMm();
    const totalSideDepthMm = sideSlotSizes.reduce((sum, size) => sum + size, 0);
    let currentDepthFromFrontMm = 0;
    const rangeCenterZMm = sideWallRange.startZMm + sideWallRange.depthMm / 2;
    const rangeCenterZ = mmToThreeUnits(rangeCenterZMm);
    const rangeWidth = mmToThreeUnits(sideWallRange.depthMm);
    // 정면벽에 배치된 가구의 최대 깊이 (정면 모드에서 측면 깊이 가이드를 가구 앞단으로 옮기기 위함)
    const frontModulesForDim = placedModules.filter(mod => ((mod as any).placementWall || 'front') === 'front');
    const maxFrontFurnitureDepthMm = frontModulesForDim.reduce((maxDepth, mod) => {
      const moduleData = getModuleById(mod.moduleId, internalSpace, spaceInfo);
      const d = mod.customDepth
        ?? mod.upperSectionDepth
        ?? mod.lowerSectionDepth
        ?? moduleData?.dimensions?.depth
        ?? 0;
      return Math.max(maxDepth, d);
    }, 0);
    // 측면 깊이 치수 가이드:
    // - 가구 배치 전: 가이드를 공간 뒷벽 라인 측면에 표시 (라벨 = 공간 전체 깊이)
    // - 가구 배치 후: 가이드를 가구 앞단 라인 측면으로 이동 (라벨 = 가구 깊이)
    const sideWallEndZMm = sideWallRange.startZMm + sideWallRange.depthMm; // 앞벽 Z
    const sideWallStartZMm = sideWallRange.startZMm; // 뒷벽 Z
    const dimRangeDepthMm = maxFrontFurnitureDepthMm > 0
      ? maxFrontFurnitureDepthMm
      : sideWallRange.depthMm;
    const dimRangeCenterZMm = maxFrontFurnitureDepthMm > 0
      ? sideWallEndZMm - maxFrontFurnitureDepthMm / 2 // 가구 앞단 영역 중앙
      : sideWallStartZMm + sideWallRange.depthMm / 2; // 공간 전체 중앙
    // 가이드 라인을 짧게 + 라벨 위치를 가구 유무에 따라 이동
    // left wall: rotation Y=+90° → group local +X = 월드 +Z(앞벽쪽), -X = 뒷벽쪽
    // right wall: rotation Y=-90° → group local +X = 월드 -Z(뒷벽쪽), -X = 앞벽쪽
    // 라벨 항상 가이드 중앙 정렬
    const labelZOffsetMm = 0;
    const dimRangeCenterZ = mmToThreeUnits(dimRangeCenterZMm);
    const dimRangeWidth = mmToThreeUnits(dimRangeDepthMm);
    const labelZOffset = mmToThreeUnits(labelZOffsetMm);
    const dimensionColor = '#333333';
    const textColor = '#222222';
    // 정면 폭 치수선과 동일 Y 정렬: 천장(=halfHeight) + DIM_GAP(120) × 3 = +360mm, 연장선 끝 = +400mm
    const dimensionOffset = mmToThreeUnits(360);
    const dimensionTextGap = mmToThreeUnits(40);
    const dimensionRenderOrder = 100000;
    const dimensionLineWidth = 0.6;
    const dimensionFontSize = 0.5;
    const slotGuideLineWidth = 0.75;
    const slotGuideDashSize = 0.2;
    const slotGuideGapSize = 0.1;
    const slotGuideOpacity = 1;
    const createArrowHead = (
      start: [number, number, number],
      end: [number, number, number],
      size = 0.008
    ): [number, number, number][] => {
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy) || 1;
      const nx = dx / length;
      const ny = dy / length;
      const px = -ny * size;
      const py = nx * size;
      return [
        [start[0] + nx * size + px, start[1] + ny * size + py, start[2]],
        start,
        [start[0] + nx * size - px, start[1] + ny * size - py, start[2]]
      ];
    };
    const renderDimensionLine = (key: string, points: [number, number, number][]) => (
      <NativeLine
        key={key}
        name="side-wall-dimension-line"
        points={points}
        color={dimensionColor}
        lineWidth={dimensionLineWidth}
        renderOrder={dimensionRenderOrder}
        depthTest={false}
        depthWrite={false}
      />
    );

    const renderSideWallDimensionGuides = () => {
      if (!showDimensions || (activePlacementWall !== wall && activePlacementWall !== 'front')) return null;

      const hasPlacedSideWallModule = placedModules.some(mod => ((mod as any).placementWall || 'front') === wall);
      const hasDoorOnSideWall = sideModulesForWall.some(mod => mod.hasDoor);
      const dimensionRange = getSideWallDimensionRangeMm(wall);
      const dimensionHeight = mmToThreeUnits(dimensionRange.heightMm);
      const dimensionCenterY = mmToThreeUnits(dimensionRange.centerYmm);
      // 가이드 길이: 가구 배치 전엔 공간 전체 깊이, 배치 후엔 가구 깊이만큼만
      const halfWidth = dimRangeWidth / 2;
      const halfHeight = dimensionHeight / 2;
      const topLineY = halfHeight + dimensionOffset;
      // 정면뷰와 동일한 레이어 규칙:
      // 도어가 달리면 도어치수는 안쪽에 두고, 가구/공간 높이 치수는 더 바깥쪽으로 벌린다.
      const innerDimensionOffset = mmToThreeUnits(hasDoorOnSideWall ? 500 : 340);
      const sectionDimensionOffset = mmToThreeUnits(hasDoorOnSideWall ? 340 : 180);
      const outerDimensionOffset = mmToThreeUnits(hasDoorOnSideWall ? 680 : 500);
      const lineZ = 0.002;
      const textZ = 0.01;
      // 라벨도 동일하게 — 가구 있으면 가구 깊이, 없으면 공간 전체 깊이
      const widthLabel = dimRangeDepthMm % 1 === 0 ? String(Math.round(dimRangeDepthMm)) : dimRangeDepthMm.toFixed(1);
      const heightLabel = dimensionRange.heightMm % 1 === 0 ? String(dimensionRange.heightMm) : dimensionRange.heightMm.toFixed(1);
      const topFrameHeightMm = spaceInfo.frameSize?.top ?? 30;
      const baseFrameDisplayMm = (() => {
        if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
          return spaceInfo.baseConfig?.height ?? 65;
        }
        if (spaceInfo.baseConfig.type === 'stand' && spaceInfo.baseConfig.placementType === 'float') {
          return spaceInfo.baseConfig.floatHeight ?? 0;
        }
        return spaceInfo.baseConfig.height ?? 0;
      })();
      const dimensionSegments = hasPlacedSideWallModule ? [
        {
          key: 'base',
          valueMm: Math.max(0, baseFrameDisplayMm),
          startMm: 0,
          endMm: Math.max(0, baseFrameDisplayMm)
        },
        {
          key: 'body',
          valueMm: Math.max(0, dimensionRange.heightMm - baseFrameDisplayMm - topFrameHeightMm),
          startMm: Math.max(0, baseFrameDisplayMm),
          endMm: Math.max(0, dimensionRange.heightMm - topFrameHeightMm)
        },
        {
          key: 'top',
          valueMm: Math.max(0, topFrameHeightMm),
          startMm: Math.max(0, dimensionRange.heightMm - topFrameHeightMm),
          endMm: dimensionRange.heightMm
        }
      ].filter(segment => segment.valueMm > 0.5) : [];
      const sectionDimensionModules = sideModulesForWall
        .map(mod => {
          const moduleData = getModuleById(mod.moduleId, internalSpace, spaceInfo);
      const moduleHeightMm = mod.freeHeight
        ?? mod.customHeight
        ?? moduleData?.dimensions?.height
        ?? 0;
          const sectionBodyHeightMm = Math.max(0, dimensionRange.heightMm - baseFrameDisplayMm - topFrameHeightMm);
          const sectionHeightsMm = getModuleSectionHeightsMm(mod, moduleData, sectionBodyHeightMm);
          if (moduleHeightMm <= 0.5 || sectionHeightsMm.length === 0) {
            return null;
          }
          let currentY = -halfHeight + mmToThreeUnits(baseFrameDisplayMm);
          const sections = sectionHeightsMm.map((heightMm: number, index: number) => {
            const startY = currentY;
            const endY = startY + mmToThreeUnits(heightMm);
            currentY = endY;
            return {
              key: `${mod.id}-${index}`,
              startY,
              endY,
              midY: (startY + endY) / 2,
              valueMm: Math.round(heightMm)
            };
          });

          return {
            id: mod.id,
            localCenterX: wall === 'left'
              ? -(mod.position.z - rangeCenterZ)
              : mod.position.z - rangeCenterZ,
            sections
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          localCenterX: number;
          sections: Array<{ key: string; startY: number; endY: number; midY: number; valueMm: number }>;
        }>;
      const sortedSectionDimensionModules = [...sectionDimensionModules]
        .sort((a, b) => a.localCenterX - b.localCenterX);
      const sectionDimensionBySide = {
        left: sortedSectionDimensionModules[0],
        right: sortedSectionDimensionModules[sortedSectionDimensionModules.length - 1]
      };

      return (
        <group
          key={`side-wall-${wall}-dimension-guides`}
          position={[wallX + dimensionOffsetX, dimensionCenterY, dimRangeCenterZ]}
          rotation={[0, rotationY, 0]}
          renderOrder={dimensionRenderOrder}
        >
          {renderDimensionLine('side-top-main', [[-halfWidth, topLineY, lineZ], [halfWidth, topLineY, lineZ]])}
          {renderDimensionLine('side-top-left-end', createArrowHead([-halfWidth, topLineY, lineZ], [-halfWidth + 0.05, topLineY, lineZ]))}
          {renderDimensionLine('side-top-right-end', createArrowHead([halfWidth, topLineY, lineZ], [halfWidth - 0.05, topLineY, lineZ]))}
          {renderDimensionLine('side-top-left-ext', [[-halfWidth, halfHeight, lineZ], [-halfWidth, topLineY + dimensionTextGap, lineZ]])}
          {renderDimensionLine('side-top-right-ext', [[halfWidth, halfHeight, lineZ], [halfWidth, topLineY + dimensionTextGap, lineZ]])}
          <Text
            position={[labelZOffset, topLineY + dimensionTextGap, textZ]}
            fontSize={dimensionFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={dimensionRenderOrder + 1}
            material-depthTest={false}
            material-depthWrite={false}
            material-transparent={true}
          >
            {widthLabel}
          </Text>

          {[
            {
              key: 'left',
              edgeX: -halfWidth,
              innerX: -halfWidth - innerDimensionOffset,
              sectionX: -halfWidth - sectionDimensionOffset,
              outerX: -halfWidth - outerDimensionOffset,
              fullTextX: -halfWidth - outerDimensionOffset - mmToThreeUnits(10),
              segmentTextX: -halfWidth - innerDimensionOffset - mmToThreeUnits(10),
              sectionTextX: -halfWidth - sectionDimensionOffset - mmToThreeUnits(10),
              anchorX: 'right' as const
            },
            {
              key: 'right',
              edgeX: halfWidth,
              innerX: halfWidth + innerDimensionOffset,
              sectionX: halfWidth + sectionDimensionOffset,
              outerX: halfWidth + outerDimensionOffset,
              fullTextX: halfWidth + outerDimensionOffset + mmToThreeUnits(10),
              segmentTextX: halfWidth + innerDimensionOffset + mmToThreeUnits(10),
              sectionTextX: halfWidth + sectionDimensionOffset + mmToThreeUnits(10),
              anchorX: 'left' as const
            }
          ].map(item => (
            <group key={`side-wall-${wall}-height-${item.key}`}>
              {renderDimensionLine(`side-height-${item.key}-outer-main`, [[item.outerX, -halfHeight, lineZ], [item.outerX, halfHeight, lineZ]])}
              {renderDimensionLine(`side-height-${item.key}-outer-bottom-end`, createArrowHead([item.outerX, -halfHeight, lineZ], [item.outerX, -halfHeight + 0.05, lineZ]))}
              {renderDimensionLine(`side-height-${item.key}-outer-top-end`, createArrowHead([item.outerX, halfHeight, lineZ], [item.outerX, halfHeight - 0.05, lineZ]))}
              {renderDimensionLine(`side-height-${item.key}-outer-bottom-ext`, [[item.edgeX, -halfHeight, lineZ], [item.outerX, -halfHeight, lineZ]])}
              {renderDimensionLine(`side-height-${item.key}-outer-top-ext`, [[item.edgeX, halfHeight, lineZ], [item.outerX, halfHeight, lineZ]])}
              <Text
                position={[item.fullTextX, 0, textZ]}
                fontSize={dimensionFontSize}
                color={textColor}
                anchorX={item.anchorX}
                anchorY="middle"
                renderOrder={dimensionRenderOrder + 1}
                material-depthTest={false}
                material-depthWrite={false}
                material-transparent={true}
              >
                {heightLabel}
              </Text>

              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-main`, [[item.innerX, -halfHeight, lineZ], [item.innerX, halfHeight, lineZ]])}
              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-bottom-end`, createArrowHead([item.innerX, -halfHeight, lineZ], [item.innerX, -halfHeight + 0.05, lineZ]))}
              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-top-end`, createArrowHead([item.innerX, halfHeight, lineZ], [item.innerX, halfHeight - 0.05, lineZ]))}
              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-bottom-ext`, [[item.edgeX, -halfHeight, lineZ], [item.innerX, -halfHeight, lineZ]])}
              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-top-ext`, [[item.edgeX, halfHeight, lineZ], [item.innerX, halfHeight, lineZ]])}
              {hasPlacedSideWallModule && (
                <Text
                  position={[item.segmentTextX, 0, textZ]}
                  fontSize={dimensionFontSize}
                  color={textColor}
                  anchorX={item.anchorX}
                  anchorY="middle"
                  renderOrder={dimensionRenderOrder + 1}
                  material-depthTest={false}
                  material-depthWrite={false}
                  material-transparent={true}
                >
                  {heightLabel}
                </Text>
              )}
              {dimensionSegments.map(segment => {
                const sideSections = sectionDimensionBySide[item.key]?.sections ?? [];
                if (sideSections.length > 0 && segment.key === 'body') {
                  return null;
                }
                const startY = -halfHeight + dimensionHeight * (segment.startMm / dimensionRange.heightMm);
                const endY = -halfHeight + dimensionHeight * (segment.endMm / dimensionRange.heightMm);
                const midY = (startY + endY) / 2;
                const label = segment.valueMm % 1 === 0 ? String(segment.valueMm) : segment.valueMm.toFixed(1);
                const tickHalf = mmToThreeUnits(30);

                return (
                  <React.Fragment key={`side-height-${item.key}-${segment.key}`}>
                    {renderDimensionLine(
                      `side-height-${item.key}-${segment.key}-section-main`,
                      [[item.sectionX, startY, lineZ], [item.sectionX, endY, lineZ]]
                    )}
                    {segment.startMm > 0.5 && renderDimensionLine(
                      `side-height-${item.key}-${segment.key}-start-tick`,
                      [[item.sectionX - tickHalf, startY, lineZ], [item.sectionX + tickHalf, startY, lineZ]]
                    )}
                    {renderDimensionLine(
                      `side-height-${item.key}-${segment.key}-end-tick`,
                      [[item.sectionX - tickHalf, endY, lineZ], [item.sectionX + tickHalf, endY, lineZ]]
                    )}
                    <Text
                      position={[item.sectionTextX, midY, textZ]}
                      fontSize={dimensionFontSize}
                      color={textColor}
                      anchorX={item.anchorX}
                      anchorY="middle"
                      renderOrder={dimensionRenderOrder + 1}
                      material-depthTest={false}
                      material-depthWrite={false}
                      material-transparent={true}
                    >
                      {label}
                    </Text>
                  </React.Fragment>
                );
              })}
              {sectionDimensionBySide[item.key]?.sections.map(section => {
                const tickHalf = mmToThreeUnits(24);

                return (
                  <React.Fragment key={`side-section-height-${item.key}-${section.key}`}>
                    {renderDimensionLine(
                      `side-section-height-${item.key}-${section.key}-main`,
                      [[item.sectionX, section.startY, lineZ], [item.sectionX, section.endY, lineZ]]
                    )}
                    {renderDimensionLine(
                      `side-section-height-${item.key}-${section.key}-start-tick`,
                      [[item.sectionX - tickHalf, section.startY, lineZ], [item.sectionX + tickHalf, section.startY, lineZ]]
                    )}
                    {renderDimensionLine(
                      `side-section-height-${item.key}-${section.key}-end-tick`,
                      [[item.sectionX - tickHalf, section.endY, lineZ], [item.sectionX + tickHalf, section.endY, lineZ]]
                    )}
                    <Text
                      position={[item.sectionTextX, section.midY, textZ]}
                      fontSize={dimensionFontSize}
                      color={textColor}
                      anchorX={item.anchorX}
                      anchorY="middle"
                      renderOrder={dimensionRenderOrder + 1}
                      material-depthTest={false}
                      material-depthWrite={false}
                      material-transparent={true}
                    >
                      {section.valueMm}
                    </Text>
                  </React.Fragment>
                );
              })}
            </group>
          ))}
        </group>
      );
    };

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
              side={2}
            />
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
              depthTest={false}
            >
              {currentSlotDepth % 1 === 0 ? currentSlotDepth : currentSlotDepth.toFixed(1)}
            </Text>
          )}
        </group>
      );

      currentDepthFromFrontMm += currentSlotDepth;
    }

    const sideSlotGuides = (() => {
      const boundaries: number[] = [0];
      let accumulatedDepthMm = 0;
      sideSlotSizes.forEach(sizeMm => {
        accumulatedDepthMm += sizeMm;
        boundaries.push(accumulatedDepthMm);
      });

      return (
        <group
          key={`side-wall-${wall}-slot-guides-${theme.color}-${theme.mode}`}
          position={[wallX + surfaceOffsetX, slotY, rangeCenterZ]}
          rotation={[0, rotationY, 0]}
          renderOrder={4}
        >
          <NativeLine
            name="slot_line"
            points={[
              [-rangeWidth / 2, -slotHeight / 2, 0.006],
              [rangeWidth / 2, -slotHeight / 2, 0.006]
            ]}
            color={themeColorHex}
            lineWidth={slotGuideLineWidth}
            dashed
            dashSize={slotGuideDashSize}
            gapSize={slotGuideGapSize}
            opacity={slotGuideOpacity}
            transparent
            renderOrder={4}
          />
          <NativeLine
            name="slot_line"
            points={[
              [-rangeWidth / 2, slotHeight / 2, 0.006],
              [rangeWidth / 2, slotHeight / 2, 0.006]
            ]}
            color={themeColorHex}
            lineWidth={slotGuideLineWidth}
            dashed
            dashSize={slotGuideDashSize}
            gapSize={slotGuideGapSize}
            opacity={slotGuideOpacity}
            transparent
            renderOrder={4}
          />
          {boundaries.map((depthMm, index) => {
            const x = -rangeWidth / 2 + rangeWidth * (depthMm / totalSideDepthMm);
            return (
              <NativeLine
                key={`side-wall-${wall}-slot-guide-${index}`}
                name="slot_line"
                points={[
                  [x, -slotHeight / 2, 0.006],
                  [x, slotHeight / 2, 0.006]
                ]}
                color={themeColorHex}
                lineWidth={slotGuideLineWidth}
                dashed
                dashSize={slotGuideDashSize}
                gapSize={slotGuideGapSize}
                opacity={slotGuideOpacity}
                transparent
                renderOrder={4}
              />
            );
          })}
        </group>
      );
    })();

    const sidePlacedWidthDimensions = (() => {
      if (!showDimensions || (activePlacementWall !== wall && activePlacementWall !== 'front')) return null;

      const sideModules = sideModulesForWall;
      if (sideModules.length === 0) return null;

      const lineZ = 0.018;
      const textZ = 0.03;
      const tick = mmToThreeUnits(26);

      return (
        <group
          key={`side-wall-${wall}-placed-width-dimensions`}
          position={[wallX + dimensionOffsetX, slotY, rangeCenterZ]}
          rotation={[0, rotationY, 0]}
          renderOrder={dimensionRenderOrder + 10}
        >
          {sideModules.map(mod => {
            const logicalWidthMm = (mod as any).sideLogicalWidth
              ?? mod.customWidth
              ?? sideSlotSizes[Math.max(0, mod.slotIndex ?? 0)]
              ?? 0;
            if (logicalWidthMm <= 0.5 || totalSideDepthMm <= 0.5) return null;

            const worldDeltaZ = mod.position.z - rangeCenterZ;
            const localCenterX = wall === 'left' ? -worldDeltaZ : worldDeltaZ;
            const visualWidth = rangeWidth * (logicalWidthMm / totalSideDepthMm);
            const startX = localCenterX - visualWidth / 2;
            const endX = localCenterX + visualWidth / 2;
            const centerX = (startX + endX) / 2;
            const moduleData = getModuleById(mod.moduleId, internalSpace, spaceInfo);
            const moduleHeightMm = mod.freeHeight
              ?? moduleData?.dimensions?.height
              ?? 600;
            const moduleTopY = mod.position.y + mmToThreeUnits(moduleHeightMm) / 2;
            const topLineY = moduleTopY - slotY + mmToThreeUnits(105);
            const textY = topLineY + mmToThreeUnits(42);
            const labelValue = logicalWidthMm;
            const label = labelValue % 1 === 0 ? String(labelValue) : labelValue.toFixed(1);

            return (
              <React.Fragment key={`side-wall-${wall}-placed-width-${mod.id}`}>
                {renderDimensionLine(`side-placed-width-${mod.id}-main`, [[startX, topLineY, lineZ], [endX, topLineY, lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-left-tick`, [[startX, topLineY - tick, lineZ], [startX, topLineY + tick, lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-right-tick`, [[endX, topLineY - tick, lineZ], [endX, topLineY + tick, lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-left-ext`, [[startX, moduleTopY - slotY, lineZ], [startX, textY + mmToThreeUnits(20), lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-right-ext`, [[endX, moduleTopY - slotY, lineZ], [endX, textY + mmToThreeUnits(20), lineZ]])}
                <Text
                  position={[centerX, textY, textZ]}
                  fontSize={dimensionFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={dimensionRenderOrder + 11}
                  material-depthTest={false}
                  material-depthWrite={false}
                  material-transparent={true}
                >
                  {label}
                </Text>
              </React.Fragment>
            );
          })}
        </group>
      );
    })();

    return (
      <>
        {meshes}
        {sideSlotGuides}
        {renderSideWallDimensionGuides()}
        {sidePlacedWidthDimensions}
      </>
    );
  };

  // 영역(zone)별로 차지된 슬롯 인덱스 Set 생성
  // SlotDropZonesSimple.getOccupiedSlots와 동일한 규칙 사용
  const getOccupiedSlots = (zoneType: 'full' | 'normal' | 'dropped'): Set<number> => {
    const occupied = new Set<number>();
    placedModules.forEach(mod => {
      if (((mod as any).placementWall || 'front') !== 'front') return;
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
    if (!canUsePlacementWallTools) {
      return null;
    }
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
