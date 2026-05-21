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
  const canUsePlacementWallTools = user?.email === 'sbbc212@gmail.com';

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
    return {
      startZMm,
      depthMm
    };
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
    const textOffsetX = surfaceOffsetX + (wall === 'left' ? 0.01 : -0.01);
    const dimensionOffsetX = wall === 'left' ? 0.16 : -0.16;
    const meshes: React.ReactNode[] = [];
    const sideWallRange = getSideWallMeshRangeMm();
    const totalSideDepthMm = sideSlotSizes.reduce((sum, size) => sum + size, 0);
    let currentDepthFromFrontMm = 0;
    const rangeCenterZMm = sideWallRange.startZMm + sideWallRange.depthMm / 2;
    const rangeCenterZ = mmToThreeUnits(rangeCenterZMm);
    const rangeWidth = mmToThreeUnits(sideWallRange.depthMm);
    const dimensionColor = '#333333';
    const textColor = '#222222';
    const dimensionOffset = mmToThreeUnits(120);
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
        name="occludable-dimension-line"
        points={points}
        color={dimensionColor}
        lineWidth={dimensionLineWidth}
        renderOrder={dimensionRenderOrder}
        depthTest={true}
        depthWrite={false}
      />
    );

    const renderSideWallDimensionGuides = () => {
      if (!showDimensions || activePlacementWall !== wall) return null;

      const hasPlacedSideWallModule = placedModules.some(mod => ((mod as any).placementWall || 'front') === wall);
      const dimensionRange = getSideWallDimensionRangeMm(wall);
      const dimensionHeight = mmToThreeUnits(dimensionRange.heightMm);
      const dimensionCenterY = mmToThreeUnits(dimensionRange.centerYmm);
      const halfWidth = rangeWidth / 2;
      const halfHeight = dimensionHeight / 2;
      const topLineY = halfHeight + dimensionOffset;
      const innerDimensionOffset = mmToThreeUnits(120);
      const outerDimensionOffset = mmToThreeUnits(320);
      const lineZ = 0.002;
      const textZ = 0.01;
      const widthLabel = totalSideDepthMm % 1 === 0 ? String(totalSideDepthMm) : totalSideDepthMm.toFixed(1);
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

      return (
        <group
          key={`side-wall-${wall}-dimension-guides`}
          position={[wallX + dimensionOffsetX, dimensionCenterY, rangeCenterZ]}
          rotation={[0, rotationY, 0]}
          renderOrder={dimensionRenderOrder}
        >
          {renderDimensionLine('side-top-main', [[-halfWidth, topLineY, lineZ], [halfWidth, topLineY, lineZ]])}
          {renderDimensionLine('side-top-left-end', createArrowHead([-halfWidth, topLineY, lineZ], [-halfWidth + 0.05, topLineY, lineZ]))}
          {renderDimensionLine('side-top-right-end', createArrowHead([halfWidth, topLineY, lineZ], [halfWidth - 0.05, topLineY, lineZ]))}
          {renderDimensionLine('side-top-left-ext', [[-halfWidth, halfHeight, lineZ], [-halfWidth, topLineY + dimensionTextGap, lineZ]])}
          {renderDimensionLine('side-top-right-ext', [[halfWidth, halfHeight, lineZ], [halfWidth, topLineY + dimensionTextGap, lineZ]])}
          <Text
            position={[0, topLineY + dimensionTextGap, textZ]}
            fontSize={dimensionFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={dimensionRenderOrder + 1}
            material-depthTest={true}
            material-transparent={true}
          >
            {widthLabel}
          </Text>

          {[
            {
              key: 'left',
              edgeX: -halfWidth,
              innerX: -halfWidth - innerDimensionOffset,
              outerX: -halfWidth - outerDimensionOffset,
              fullTextX: -halfWidth - outerDimensionOffset - mmToThreeUnits(10),
              segmentTextX: -halfWidth - innerDimensionOffset - mmToThreeUnits(10),
              anchorX: 'right' as const
            },
            {
              key: 'right',
              edgeX: halfWidth,
              innerX: halfWidth + innerDimensionOffset,
              outerX: halfWidth + outerDimensionOffset,
              fullTextX: halfWidth + outerDimensionOffset + mmToThreeUnits(10),
              segmentTextX: halfWidth + innerDimensionOffset + mmToThreeUnits(10),
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
                material-depthTest={true}
                material-transparent={true}
              >
                {heightLabel}
              </Text>

              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-main`, [[item.innerX, -halfHeight, lineZ], [item.innerX, halfHeight, lineZ]])}
              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-bottom-end`, createArrowHead([item.innerX, -halfHeight, lineZ], [item.innerX, -halfHeight + 0.05, lineZ]))}
              {hasPlacedSideWallModule && renderDimensionLine(`side-height-${item.key}-inner-top-end`, createArrowHead([item.innerX, halfHeight, lineZ], [item.innerX, halfHeight - 0.05, lineZ]))}
              {dimensionSegments.map(segment => {
                const startY = -halfHeight + dimensionHeight * (segment.startMm / dimensionRange.heightMm);
                const endY = -halfHeight + dimensionHeight * (segment.endMm / dimensionRange.heightMm);
                const midY = (startY + endY) / 2;
                const label = segment.valueMm % 1 === 0 ? String(segment.valueMm) : segment.valueMm.toFixed(1);
                const tickHalf = mmToThreeUnits(30);

                return (
                  <React.Fragment key={`side-height-${item.key}-${segment.key}`}>
                    {segment.startMm > 0.5 && renderDimensionLine(
                      `side-height-${item.key}-${segment.key}-start-tick`,
                      [[item.innerX - tickHalf, startY, lineZ], [item.innerX + tickHalf, startY, lineZ]]
                    )}
                    <Text
                      position={[item.segmentTextX, midY, textZ]}
                      fontSize={dimensionFontSize}
                      color={textColor}
                      anchorX={item.anchorX}
                      anchorY="middle"
                      renderOrder={dimensionRenderOrder + 1}
                      material-depthTest={true}
                      material-transparent={true}
                    >
                      {label}
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
      if (!showDimensions || activePlacementWall !== wall) return null;

      const sideModules = placedModules.filter(mod => ((mod as any).placementWall || 'front') === wall);
      if (sideModules.length === 0) return null;

      const halfHeight = slotHeight / 2;
      const topLineY = halfHeight + mmToThreeUnits(65);
      const textY = topLineY + mmToThreeUnits(34);
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
            const slotIndex = Math.max(0, mod.slotIndex ?? 0);
            if (slotIndex >= sideSlotSizes.length) return null;

            const span = mod.isDualSlot ? 2 : 1;
            const logicalStartMm = sideSlotSizes
              .slice(0, slotIndex)
              .reduce((sum, size) => sum + size, 0);
            const logicalWidthMm = sideSlotSizes
              .slice(slotIndex, Math.min(sideSlotSizes.length, slotIndex + span))
              .reduce((sum, size) => sum + size, 0);
            if (logicalWidthMm <= 0.5 || totalSideDepthMm <= 0.5) return null;

            const startX = -rangeWidth / 2 + rangeWidth * (logicalStartMm / totalSideDepthMm);
            const endX = -rangeWidth / 2 + rangeWidth * ((logicalStartMm + logicalWidthMm) / totalSideDepthMm);
            const centerX = (startX + endX) / 2;
            const labelValue = mod.customWidth ?? logicalWidthMm;
            const label = labelValue % 1 === 0 ? String(labelValue) : labelValue.toFixed(1);

            return (
              <React.Fragment key={`side-wall-${wall}-placed-width-${mod.id}`}>
                {renderDimensionLine(`side-placed-width-${mod.id}-main`, [[startX, topLineY, lineZ], [endX, topLineY, lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-left-tick`, [[startX, topLineY - tick, lineZ], [startX, topLineY + tick, lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-right-tick`, [[endX, topLineY - tick, lineZ], [endX, topLineY + tick, lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-left-ext`, [[startX, halfHeight, lineZ], [startX, topLineY + tick, lineZ]])}
                {renderDimensionLine(`side-placed-width-${mod.id}-right-ext`, [[endX, halfHeight, lineZ], [endX, topLineY + tick, lineZ]])}
                <Text
                  position={[centerX, textY, textZ]}
                  fontSize={dimensionFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={dimensionRenderOrder + 11}
                  material-depthTest={true}
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
