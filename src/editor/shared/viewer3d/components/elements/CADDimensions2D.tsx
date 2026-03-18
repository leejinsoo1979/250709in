import React, { useMemo } from 'react';
import { Text } from '@react-three/drei';
import NativeLine from './NativeLine';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing, calculateInternalSpace } from '@/editor/shared/utils/indexing';
import { calculateBaseFrameHeight } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SectionConfig } from '@/data/modules/shelving';

const DEFAULT_BASIC_THICKNESS_MM = 18;

const mmToThreeUnits = (mm: number) => mm * 0.01;

type SectionWithCalc = SectionConfig & { calculatedHeight?: number };

interface SectionHeightsInfo {
  sections: SectionWithCalc[];
  heightsMm: number[];
  basicThicknessMm: number;
}

const computeSectionHeightsInfo = (
  module: PlacedModule,
  moduleData: ReturnType<typeof getModuleById> | null,
  internalHeightMm: number,
  viewDirection?: 'left' | 'right'
): SectionHeightsInfo => {
  // 듀얼 가구의 경우 leftSections/rightSections 확인
  let rawSections: SectionWithCalc[] | undefined;

  if (module.customSections && module.customSections.length > 0) {
    rawSections = module.customSections as SectionWithCalc[];
  } else if (moduleData?.modelConfig?.leftSections || moduleData?.modelConfig?.rightSections) {
    // 듀얼 가구 (스타일러장 등): 좌측뷰는 leftSections, 우측뷰는 rightSections 사용
    // 기본적으로 leftSections 사용 (주요 섹션)
    rawSections = (viewDirection === 'right' && moduleData?.modelConfig?.rightSections)
      ? moduleData.modelConfig.rightSections as SectionWithCalc[]
      : (moduleData?.modelConfig?.leftSections as SectionWithCalc[] || moduleData?.modelConfig?.rightSections as SectionWithCalc[]);
  } else {
    rawSections = moduleData?.modelConfig?.sections as SectionWithCalc[] | undefined;
  }

  const basicThicknessMm = moduleData?.modelConfig?.basicThickness ?? DEFAULT_BASIC_THICKNESS_MM;

  if (!rawSections || rawSections.length === 0) {
    return {
      sections: [],
      heightsMm: [],
      basicThicknessMm
    };
  }

  const availableHeightMm = Math.max(internalHeightMm - basicThicknessMm * 2, 0);
  const hasCalculatedHeights = rawSections.every(section => typeof (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight === 'number');

  let heightsMm: number[];

  if (hasCalculatedHeights) {
    heightsMm = rawSections.map(section => {
      const calc = (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight;
      return Math.max(calc ?? 0, 0);
    });
  } else {
    const absoluteSections = rawSections.filter(section => section.heightType === 'absolute');
    const totalFixedMm = absoluteSections.reduce((sum, section) => {
      const value = typeof section.height === 'number' ? section.height : 0;
      return sum + Math.min(value, availableHeightMm);
    }, 0);

    const remainingMm = Math.max(availableHeightMm - totalFixedMm, 0);
    const percentageSections = rawSections.filter(section => section.heightType !== 'absolute');
    const totalPercentage = percentageSections.reduce((sum, section) => sum + (section.height ?? 0), 0);
    const percentageCount = percentageSections.length;

    heightsMm = rawSections.map(section => {
      if (section.heightType === 'absolute') {
        // 절대 높이 섹션: 측판 높이와 동일하게 section.height 그대로 사용
        return section.height ?? 0;
      }

      if (totalPercentage > 0) {
        return remainingMm * ((section.height ?? 0) / totalPercentage);
      }

      return percentageCount > 0 ? remainingMm / percentageCount : remainingMm;
    });
  }

  return {
    sections: rawSections,
    heightsMm,
    basicThicknessMm
  };
};

interface CADDimensions2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
  showDimensions?: boolean;
  isSplitView?: boolean;
}

/**
 * CAD 스타일 2D 치수 표기 컴포넌트 - 측면뷰 전용
 */
const CADDimensions2D: React.FC<CADDimensions2DProps> = ({ viewDirection, showDimensions: showDimensionsProp }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModulesStore = useFurnitureStore(state => state.placedModules);
  const { view2DDirection, showDimensions: showDimensionsFromStore, view2DTheme, selectedSlotIndex, showFurniture } = useUIStore();
  const { zones } = useDerivedSpaceStore();
  const placedModules = useMemo(
    () => (showFurniture ? placedModulesStore : []),
    [placedModulesStore, showFurniture]
  );

  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;

  // 2D 도면 치수 색상
  const dimensionColor = view2DTheme === 'light' ? '#000000' : '#FFFFFF';
  const textColor = dimensionColor;

  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;

  // showDimensions가 false이면 치수 표시하지 않음
  if (!showDimensions) {
    return null;
  }

  // 측면도(좌/우)가 아니면 렌더링하지 않음
  if (currentViewDirection !== 'left' && currentViewDirection !== 'right') {
    return null;
  }

  // 공간 크기
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  const spaceDepth = mmToThreeUnits(spaceInfo.depth || 1500);

  // 내부 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 띄워서 배치
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const floatHeightMm = spaceInfo.baseConfig?.floatHeight || 0;

  // 프레임 높이 (전역값)
  const globalTopFrameHeightMm = spaceInfo.frameSize?.top || 0;

  // 바닥레일/받침대 높이 계산 (전역값)
  // - floor 타입: 받침대 높이 (calculateBaseFrameHeight 사용)
  // - stand 타입 + 띄움 배치: 바닥 프레임 없음 (0)
  // - stand 타입 + 일반 배치: 바닥레일 높이 (baseConfig.height)
  const isStandType = spaceInfo.baseConfig?.type === 'stand';
  const globalRailOrBaseHeightMm = isStandType
    ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))  // 띄움 배치면 바닥 프레임 없음
    : calculateBaseFrameHeight(spaceInfo);

  const isFreePlacementMode = spaceInfo.layoutMode === 'free-placement';

  // 내경 높이 (전역 기준 — 후에 per-furniture delta 보정)
  const floatHeightMmForCalc = isFloating ? floatHeightMm : 0;
  const globalAdjustedInternalHeightMm = isStandType
    ? internalSpace.height - globalRailOrBaseHeightMm - floatHeightMmForCalc
    : internalSpace.height;
  // 바닥마감재 높이
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;

  // 단내림 설정
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
  const dropHeightMm = hasDroppedCeiling ? (spaceInfo.droppedCeiling?.dropHeight || 200) : 0;
  const dropHeight = mmToThreeUnits(dropHeightMm);
  const droppedCeilingHeight = spaceHeight - dropHeight; // 단내림 구간 높이
  const droppedCeilingHeightMm = spaceInfo.height - dropHeightMm; // 단내림 구간 높이 (mm)

  // 선택된 슬롯이 단내림 구간에 해당하는지 판단
  const normalSlotCount = zones?.normal?.columnCount || (spaceInfo.customColumnCount || 4);
  const isSelectedSlotInDroppedZone = hasDroppedCeiling && selectedSlotIndex !== null && selectedSlotIndex >= normalSlotCount;

  // 표시할 높이 (단내림 구간이면 단내림 높이, 아니면 전체 높이)
  const displaySpaceHeight = isSelectedSlotInDroppedZone ? droppedCeilingHeight : spaceHeight;
  const displaySpaceHeightMm = isSelectedSlotInDroppedZone ? droppedCeilingHeightMm : spaceInfo.height;

  // 폰트 크기
  const largeFontSize = mmToThreeUnits(40);
  const smallFontSize = mmToThreeUnits(30);

  // 치수선 오프셋
  const leftDimOffset = mmToThreeUnits(400);
  const rightDimOffset = mmToThreeUnits(400);

  // 측면뷰에서 표시할 가구 필터링
  const getVisibleFurnitureForSideView = () => {
    if (placedModules.length === 0) return [];

    // 선택된 슬롯의 가구만 필터링
    let filteredBySlot = placedModules;
    const isFreePlacementMode = spaceInfo.layoutMode === 'free-placement';

    if (selectedSlotIndex !== null) {
      if (isFreePlacementMode) {
        // 자유배치 모드: X좌표 순 가상 슬롯 인덱스 매핑
        const nonSurroundModules = placedModules.filter(m => !m.isSurroundPanel);
        const sortedByX = [...nonSurroundModules].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));

        const xGroups: number[][] = [];
        let lastX: number | null = null;
        sortedByX.forEach((m, idx) => {
          const mx = m.position?.x ?? 0;
          if (lastX === null || Math.abs(mx - lastX) > 0.01) {
            xGroups.push([idx]);
            lastX = mx;
          } else {
            xGroups[xGroups.length - 1].push(idx);
          }
        });

        const virtualSlotModuleIds = new Set<string>();
        if (selectedSlotIndex < xGroups.length) {
          xGroups[selectedSlotIndex].forEach(idx => {
            virtualSlotModuleIds.add(sortedByX[idx].id);
          });
        }

        filteredBySlot = placedModules.filter(module => {
          if (module.isSurroundPanel) return false;
          return virtualSlotModuleIds.has(module.id);
        });
      } else {
        // 슬롯 기반 배치: 기존 로직
        filteredBySlot = placedModules.filter(module => {
          if (module.slotIndex === undefined) return false;

          let moduleGlobalSlotIndex = module.slotIndex;

          let isInDroppedZone = module.zone === 'dropped';

          if (hasDroppedCeiling && !isInDroppedZone && zones?.dropped && zones?.normal) {
            const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
            const moduleXMm = module.position.x * 100;
            const normalWidth = zones.normal.width;
            const droppedWidth = zones.dropped.width;

            if (droppedPosition === 'left') {
              isInDroppedZone = moduleXMm < droppedWidth;
            } else {
              isInDroppedZone = moduleXMm >= normalWidth;
            }
          }

          if (hasDroppedCeiling && isInDroppedZone) {
            moduleGlobalSlotIndex = normalSlotCount + module.slotIndex;
          }

          if (module.isDualSlot) {
            return moduleGlobalSlotIndex === selectedSlotIndex || moduleGlobalSlotIndex + 1 === selectedSlotIndex;
          }

          return moduleGlobalSlotIndex === selectedSlotIndex;
        });
      }
    }

    if (filteredBySlot.length === 0) return [];

    if (currentViewDirection === 'left') {
      // 좌측뷰: X 좌표가 가장 작은(왼쪽 끝) 가구
      const leftmostModule = filteredBySlot.reduce((leftmost, current) =>
        current.position.x < leftmost.position.x ? current : leftmost
      );
      return [leftmostModule];
    } else if (currentViewDirection === 'right') {
      // 우측뷰: X 좌표가 가장 큰(오른쪽 끝) 가구
      const rightmostModule = filteredBySlot.reduce((rightmost, current) =>
        current.position.x > rightmost.position.x ? current : rightmost
      );
      return [rightmostModule];
    }

    return [];
  };

  const visibleFurniture = getVisibleFurnitureForSideView();

  // 슬롯모드: 선택된 가구의 개별 프레임 값 우선 사용
  const selectedMod = visibleFurniture[0] as PlacedModule | undefined;
  const topFrameHeightMm = (!isFreePlacementMode && selectedMod?.topFrameThickness !== undefined)
    ? selectedMod.topFrameThickness
    : globalTopFrameHeightMm;
  const topFrameHeight = mmToThreeUnits(topFrameHeightMm);
  const railOrBaseHeightMm = (!isFreePlacementMode && selectedMod?.baseFrameHeight !== undefined && !isStandType)
    ? selectedMod.baseFrameHeight
    : globalRailOrBaseHeightMm;
  const railOrBaseHeight = mmToThreeUnits(railOrBaseHeightMm);

  // per-furniture 받침대/치수 변수
  const baseFrameHeightMm = isFloating ? floatHeightMm : railOrBaseHeightMm;
  const baseFrameDisplayMm = Math.max(0, baseFrameHeightMm - (isFloating ? 0 : floorFinishHeightMm));
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);
  const floorFinishY = isFloating ? 0 : mmToThreeUnits(floorFinishHeightMm);
  const furnitureBaseY = (isFloating ? floatHeight : baseFrameHeight) + floorFinishY;

  // 내경 높이 (per-furniture delta 보정 적용)
  let adjustedInternalHeightMm = globalAdjustedInternalHeightMm;
  // 바닥마감재: 가구 높이에서 차감 (FurnitureItem과 동일)
  if (floorFinishHeightMm > 0) {
    adjustedInternalHeightMm -= floorFinishHeightMm;
  }
  if (!isFreePlacementMode && selectedMod) {
    if (selectedMod.topFrameThickness !== undefined) {
      adjustedInternalHeightMm -= (selectedMod.topFrameThickness - globalTopFrameHeightMm);
    }
    if (selectedMod.baseFrameHeight !== undefined && !isStandType) {
      adjustedInternalHeightMm -= (selectedMod.baseFrameHeight - globalRailOrBaseHeightMm);
    }
  }
  const internalHeight = mmToThreeUnits(adjustedInternalHeightMm);

  // 좌측뷰인 경우
  if (currentViewDirection === 'left') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 (공간 높이 - 바닥부터 시작) ===== */}
        {/* 단내림 구간이 선택된 경우 단내림 높이를 표시 */}
        {<group>
          {/* 보조 가이드 연장선 - 하단 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 보조 가이드 연장선 - 상단 */}
          <NativeLine name="dimension_line"
            points={[
              [0, displaySpaceHeight, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 수직 치수선 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.03, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 엔드포인트 - 상단 (세로선과 연장선 만나는 지점) */}
          <mesh position={[0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 엔드포인트 - 하단 (세로선과 연장선 만나는 지점) */}
          <mesh position={[0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 높이 텍스트 */}
          <Text
            position={[0, displaySpaceHeight / 2, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) - mmToThreeUnits(60)]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={1000}
            depthTest={false}
            rotation={[0, -Math.PI / 2, Math.PI / 2]}
          >
            {displaySpaceHeightMm}
          </Text>
        </group>}

        {/* ===== 오른쪽: 상부프레임/가구높이/받침대 ===== */}

        {/* 상부 프레임 두께 (단내림 구간에서는 단내림 높이 기준) */}
        {topFrameHeightMm > 0 && (
          <group>
            {/* 보조 가이드 연장선 - 하단 (상부 프레임 하단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 상단 (공간 최상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 수직 치수선 */}
            <NativeLine name="dimension_line"
              points={[
                [0, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <Text
              position={[0, displaySpaceHeight - topFrameHeight / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              {topFrameHeightMm}
            </Text>
          </group>
        )}

        {/* 가구별 섹션 치수 가이드 - 측면뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, moduleIndex) => {
          let moduleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );

          // 커스터마이징/자유배치 가구 폴백: buildModuleDataFromPlacedModule
          if (!moduleData) {
            moduleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
          }

          if (!moduleData) return null;

          // 가구의 실제 높이 사용 (FurnitureItem과 동일한 방식)
          // 슬롯모드: 개별 프레임 보정이 반영된 adjustedInternalHeightMm 사용
          const mod = module as PlacedModule;
          const moduleHeightMm = mod.freeHeight ?? mod.customHeight ?? (mod.isFreePlacement ? moduleData.dimensions.height : adjustedInternalHeightMm);
          const { sections: sectionConfigs, heightsMm: sectionHeightsMm } = computeSectionHeightsInfo(mod, moduleData, moduleHeightMm, 'left');
          if (sectionConfigs.length === 0) {
            return null;
          }

          // 하부섹션과 상부섹션 높이만 계산 (개별 섹션이 아닌 2개 섹션으로 합산)
          // 첫 번째 섹션 = 하부섹션, 나머지 = 상부섹션
          const lowerSectionHeightMm = sectionHeightsMm[0] || 0;
          const upperSectionHeightMm = sectionHeightsMm.slice(1).reduce((sum, h) => sum + h, 0);

          // 각 섹션의 실제 높이 계산 (받침대 + 하판(basicThickness) 위부터 시작)
          const cabinetBottomY = furnitureBaseY;
          // 자유배치 가구: freeHeight 기반 / 슬롯 가구: 보정된 내경 높이
          const moduleFreeH = mod.freeHeight;
          const cabinetHeight = moduleFreeH ? mmToThreeUnits(moduleFreeH) : internalHeight;
          const cabinetTopY = cabinetBottomY + cabinetHeight;
          const lowerSectionEndY = cabinetBottomY + mmToThreeUnits(lowerSectionHeightMm);

          // 2개 섹션만 표시 (하부/상부)
          const displaySections = [
            { startY: cabinetBottomY, endY: lowerSectionEndY, heightMm: lowerSectionHeightMm, isFirst: true },
            { startY: lowerSectionEndY, endY: cabinetTopY, heightMm: upperSectionHeightMm, isFirst: false }
          ].filter(s => s.heightMm > 0);

          return displaySections.map((sectionDisplay, sectionIndex) => {
            const { startY: sectionStartY, endY: sectionEndY, heightMm: sectionHeightMm, isFirst } = sectionDisplay;

            // 첫 번째 섹션(하부)은 하단 가이드선 표시 안 함 (받침대와 겹침)
            const shouldRenderStartGuide = !isFirst;

            return (
              <group key={`section-${moduleIndex}-${sectionIndex}`}>
                {/* 보조 가이드 연장선 - 시작 */}
                {shouldRenderStartGuide && (
                <NativeLine name="dimension_line"
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                {/* 보조 가이드 연장선 - 끝 (상부섹션은 가구 최상단에서) */}
                <NativeLine name="dimension_line"
                  points={[
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 치수선 */}
                <NativeLine name="dimension_line"
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 티크 마크 */}
                {shouldRenderStartGuide && (
                <NativeLine name="dimension_line"
                  points={[
                    [0 - 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                <NativeLine name="dimension_line"
                  points={[
                    [0 - 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 엔드포인트 - 시작 모서리 */}
                {shouldRenderStartGuide && (
                <mesh
                  position={[
                    0,
                    sectionStartY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>
                )}

                {/* 엔드포인트 - 끝 모서리 */}
                <mesh
                  position={[
                    0,
                    sectionEndY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>

                {/* 치수 텍스트 */}
                <Text
                  position={[
                    0,
                    (sectionStartY + sectionEndY) / 2,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)
                  ]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={1000}
                  depthTest={false}
                  rotation={[0, -Math.PI / 2, Math.PI / 2]}
                >
                  {Math.round(sectionHeightMm)}
                </Text>
              </group>
            );
          });
        })}

        {/* 받침대 높이 (바닥부터) */}
        {baseFrameHeightMm > 0 && (
        <group>
            {/* 보조 가이드 연장선 - 시작 (바닥) */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 끝 (받침대 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 치수선 (바닥 ~ furnitureBase) */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 엔드포인트 - 바닥 모서리 */}
            <mesh
              position={[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {/* 엔드포인트 - 받침대 상단 모서리 (가구가 없을 때만 표시) */}
            {visibleFurniture.length === 0 && (
            <mesh
              position={[0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>
            )}

            {/* 치수 텍스트 */}
            <Text
              position={[0, furnitureBaseY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              {baseFrameDisplayMm}
            </Text>
        </group>
        )}


        {/* ===== 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 ===== */}
        {visibleFurniture.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          // 상부섹션 깊이 우선 사용
          const upperDepth = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);

          // 가구 위치 계산 (FurnitureItem.tsx와 동일)
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureTopY = furnitureBaseY + internalHeight + mmToThreeUnits(200); // 가구 상단 + 200mm

          // Z축 위치 계산 (FurnitureItem.tsx와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600; // 가구 깊이 고정값
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;

          return (
            <group key={`furniture-depth-${index}`}>
              {/* 보조 가이드 연장선 - 앞쪽 */}
              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ + moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 보조 가이드 연장선 - 뒤쪽 */}
              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 가구 깊이 치수선 */}
              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 앞쪽 티크 */}
              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ + moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 뒤쪽 티크 */}
              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 엔드포인트 - 앞쪽 (치수선과 연장선 만나는 지점) */}
              <mesh position={[0, furnitureTopY, furnitureZ + moduleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 엔드포인트 - 뒤쪽 (치수선과 연장선 만나는 지점) */}
              <mesh position={[0, furnitureTopY, furnitureZ - moduleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 가구 깊이 텍스트 */}
              <Text
                position={[0, furnitureTopY + mmToThreeUnits(80), furnitureZ]}
                fontSize={largeFontSize}
                color={textColor}
                anchorX="center"
                anchorY="middle"
                renderOrder={1000}
                depthTest={false}
                rotation={[0, -Math.PI / 2, 0]}
              >
                {customDepth}
              </Text>

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {(module.lowerSectionDepth !== undefined) && (() => {
                const lowerDepth = module.lowerSectionDepth;
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - lowerModuleDepth/2;
                const lowerDimY = floatHeight - mmToThreeUnits(200); // 하단 치수선 위치 (가구 바닥 아래)

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 */}
                    <NativeLine name="dimension_line"
                      points={[
                        [0, floatHeight, lowerFurnitureZ + lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 보조 가이드 연장선 - 뒤쪽 */}
                    <NativeLine name="dimension_line"
                      points={[
                        [0, floatHeight, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 하부 깊이 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 앞쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 뒤쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 엔드포인트 - 앞쪽 */}
                    <mesh position={[0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

                    {/* 엔드포인트 - 뒤쪽 */}
                    <mesh position={[0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

                    {/* 하부 깊이 텍스트 */}
                    <Text
                      position={[0, lowerDimY - mmToThreeUnits(80), lowerFurnitureZ]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={1000}
                      depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      {lowerDepth}
                    </Text>
                  </group>
                );
              })()}
            </group>
          );
        })}

        {/* ===== 단내림 구간 선택 시 단내림 벽 표시 (빗금 패턴) ===== */}
        {isSelectedSlotInDroppedZone && (() => {
          // 보이는 가구의 깊이 가져오기 (가구가 없으면 기본값 600mm 사용)
          let actualFurnitureDepthMm = 600;
          if (visibleFurniture.length > 0) {
            const visibleModule = visibleFurniture[0];
            const visibleModuleData = getModuleById(
              visibleModule.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            // 상부섹션 깊이 우선 사용 (가구 치수 표시와 동일)
            actualFurnitureDepthMm = visibleModule.upperSectionDepth || visibleModule.customDepth || visibleModuleData?.dimensions.depth || 600;
          }
          const actualFurnitureDepth = mmToThreeUnits(actualFurnitureDepthMm);

          // 빗금 해칭 패턴 생성
          const hatchLines: JSX.Element[] = [];
          const hatchSpacing = mmToThreeUnits(40); // 40mm 간격
          const hatchColor = view2DTheme === 'dark' ? '#FFD700' : '#999999';

          // 가구 Z 위치 계산 (가구 치수와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const baseFurnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const baseFurnitureDepth = mmToThreeUnits(baseFurnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - baseFurnitureDepth) / 2;
          // 가구 Z 위치 (가구 치수 표시와 동일한 방식)
          const furnitureZ = furnitureZOffset + baseFurnitureDepth/2 - doorThickness - actualFurnitureDepth/2;
          // 가구 뒷면과 앞면 Z 위치
          const furnitureBackZ = furnitureZ - actualFurnitureDepth/2;
          const furnitureFrontZ = furnitureZ + actualFurnitureDepth/2;

          // 단내림 벽 영역: Z방향으로 가구 깊이만큼, Y방향으로 dropHeight
          const wallStartZ = furnitureBackZ;
          const wallEndZ = furnitureFrontZ;
          const wallDepth = wallEndZ - wallStartZ;
          const wallStartY = displaySpaceHeight;
          const wallEndY = spaceHeight;

          // 대각선 빗금 생성 (좌하단에서 우상단으로)
          const startOffset = -dropHeight;
          const endOffset = wallDepth;
          const hatchCount = Math.ceil((endOffset - startOffset) / hatchSpacing) + 1;

          for (let i = 0; i <= hatchCount; i++) {
            const offset = startOffset + i * hatchSpacing;

            // 시작점과 끝점 계산 (Z-Y 평면에서)
            let startZ = wallStartZ + offset;
            let startY = wallStartY;
            let endZ = startZ + dropHeight;
            let endY = wallEndY;

            // 클리핑
            if (startZ < wallStartZ) {
              const diff = wallStartZ - startZ;
              startZ = wallStartZ;
              startY = wallStartY + diff;
            }
            if (endZ > wallEndZ) {
              const diff = endZ - wallEndZ;
              endZ = wallEndZ;
              endY = wallEndY - diff;
            }

            // 유효한 선분인지 확인
            if (startZ < wallEndZ && endZ > wallStartZ && startY < wallEndY && endY > wallStartY) {
              hatchLines.push(
                <NativeLine
                  key={`hatch-left-${i}`}
                  name="hatch_line"
                  points={[
                    [0, startY, startZ],
                    [0, endY, endZ]
                  ]}
                  color={hatchColor}
                  lineWidth={0.5}
                  renderOrder={100000}
                  depthTest={false}
                />
              );
            }
          }

          return (
            <group>
              {/* 회색 반투명 배경 메쉬 (정면도와 동일) */}
              <mesh
                position={[0, (wallStartY + wallEndY) / 2, (wallStartZ + wallEndZ) / 2]}
                rotation={[0, -Math.PI / 2, 0]}
                renderOrder={99998}
              >
                <planeGeometry args={[wallDepth, dropHeight]} />
                <meshBasicMaterial color="#999999" transparent opacity={0.15} depthTest={false} />
              </mesh>
              {/* 단내림 벽 테두리 */}
              <NativeLine
                name="dropped_ceiling_border"
                points={[
                  [0, wallStartY, wallStartZ],
                  [0, wallEndY, wallStartZ],
                  [0, wallEndY, wallEndZ],
                  [0, wallStartY, wallEndZ],
                  [0, wallStartY, wallStartZ]
                ]}
                color={hatchColor}
                lineWidth={0.8}
                renderOrder={100000}
                depthTest={false}
              />
              {/* 빗금 패턴 */}
              {hatchLines}
            </group>
          );
        })()}
      </group>
    );
  }

  // 우측뷰인 경우 (좌측뷰와 대칭)
  if (currentViewDirection === 'right') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 (공간 높이 - 바닥부터 시작) ===== */}
        {/* 단내림 구간이 선택된 경우 단내림 높이를 표시 */}
        {<group>
          {/* 보조 가이드 연장선 - 하단 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 보조 가이드 연장선 - 상단 */}
          <NativeLine name="dimension_line"
            points={[
              [0, displaySpaceHeight, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 수직 치수선 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.03, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 엔드포인트 - 상단 */}
          <mesh position={[0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 엔드포인트 - 하단 */}
          <mesh position={[0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 높이 텍스트 */}
          <Text
            position={[0, displaySpaceHeight / 2, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) - mmToThreeUnits(60)]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={1000}
            depthTest={false}
            rotation={[0, Math.PI / 2, Math.PI / 2]}
          >
            {displaySpaceHeightMm}
          </Text>
        </group>}

        {/* ===== 오른쪽: 상부프레임/가구높이/받침대 (좌측뷰와 동일, rotation만 대칭) ===== */}

        {/* 상부 프레임 두께 (단내림 구간에서는 단내림 높이 기준) */}
        {topFrameHeightMm > 0 && (
          <group>
            {/* 보조 가이드 연장선 - 하단 (상부 프레임 하단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 상단 (공간 최상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 수직 치수선 */}
            <NativeLine name="dimension_line"
              points={[
                [0, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, displaySpaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, displaySpaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <Text
              position={[0, displaySpaceHeight - topFrameHeight / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {topFrameHeightMm}
            </Text>
          </group>
        )}

        {/* 가구별 섹션 치수 가이드 - 우측뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, moduleIndex) => {
          let moduleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );

          // 커스터마이징/자유배치 가구 폴백
          if (!moduleData) {
            moduleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
          }

          if (!moduleData) return null;

          // 가구의 실제 높이 사용 (FurnitureItem과 동일한 방식)
          // 슬롯모드: 개별 프레임 보정이 반영된 adjustedInternalHeightMm 사용
          const mod = module as PlacedModule;
          const moduleHeightMm = mod.freeHeight ?? mod.customHeight ?? (mod.isFreePlacement ? moduleData.dimensions.height : adjustedInternalHeightMm);
          const { sections: sectionConfigs, heightsMm: sectionHeightsMm } = computeSectionHeightsInfo(mod, moduleData, moduleHeightMm, 'right');
          if (sectionConfigs.length === 0) {
            return null;
          }

          // 하부섹션과 상부섹션 높이만 계산 (개별 섹션이 아닌 2개 섹션으로 합산)
          // 첫 번째 섹션 = 하부섹션, 나머지 = 상부섹션
          const lowerSectionHeightMm = sectionHeightsMm[0] || 0;
          const upperSectionHeightMm = sectionHeightsMm.slice(1).reduce((sum, h) => sum + h, 0);

          // 각 섹션의 실제 높이 계산 (받침대 + 하판(basicThickness) 위부터 시작)
          const cabinetBottomY = furnitureBaseY;
          // 자유배치 가구: freeHeight 기반 / 슬롯 가구: 보정된 내경 높이
          const moduleFreeH = mod.freeHeight;
          const cabinetHeight = moduleFreeH ? mmToThreeUnits(moduleFreeH) : internalHeight;
          const cabinetTopY = cabinetBottomY + cabinetHeight;
          const lowerSectionEndY = cabinetBottomY + mmToThreeUnits(lowerSectionHeightMm);

          // 2개 섹션만 표시 (하부/상부)
          const displaySections = [
            { startY: cabinetBottomY, endY: lowerSectionEndY, heightMm: lowerSectionHeightMm, isFirst: true },
            { startY: lowerSectionEndY, endY: cabinetTopY, heightMm: upperSectionHeightMm, isFirst: false }
          ].filter(s => s.heightMm > 0);

          return displaySections.map((sectionDisplay, sectionIndex) => {
            const { startY: sectionStartY, endY: sectionEndY, heightMm: sectionHeightMm, isFirst } = sectionDisplay;

            // 첫 번째 섹션(하부)은 하단 가이드선 표시 안 함 (받침대와 겹침)
            const shouldRenderStartGuide = !isFirst;

            return (
              <group key={`section-${moduleIndex}-${sectionIndex}`}>
                {/* 보조 가이드 연장선 - 시작 */}
                {shouldRenderStartGuide && (
                <NativeLine name="dimension_line"
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                {/* 보조 가이드 연장선 - 끝 (상부섹션은 가구 최상단에서) */}
                <NativeLine name="dimension_line"
                  points={[
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 치수선 */}
                <NativeLine name="dimension_line"
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 티크 마크 */}
                {shouldRenderStartGuide && (
                <NativeLine name="dimension_line"
                  points={[
                    [0 - 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                <NativeLine name="dimension_line"
                  points={[
                    [0 - 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 엔드포인트 - 시작 모서리 */}
                {shouldRenderStartGuide && (
                <mesh
                  position={[
                    0,
                    sectionStartY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>
                )}

                {/* 엔드포인트 - 끝 모서리 */}
                <mesh
                  position={[
                    0,
                    sectionEndY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>

                {/* 치수 텍스트 */}
                <Text
                  position={[
                    0,
                    (sectionStartY + sectionEndY) / 2,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)
                  ]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={1000}
                  depthTest={false}
                  rotation={[0, Math.PI / 2, Math.PI / 2]}
                >
                  {Math.round(sectionHeightMm)}
                </Text>
              </group>
            );
          });
        })}

        {/* 받침대 높이 (바닥부터, 우측뷰) */}
        {baseFrameHeightMm > 0 && (
        <group>
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={[
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={[
                [-0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <mesh
              position={[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {visibleFurniture.length === 0 && (
            <mesh
              position={[0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>
            )}

            <Text
              position={[0, furnitureBaseY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {baseFrameDisplayMm}
            </Text>
        </group>
        )}

        {/* 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          // 상부섹션 깊이 우선 사용
          const upperDepth = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);

          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureTopY = furnitureBaseY + internalHeight + mmToThreeUnits(200);

          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;

          return (
            <group key={`furniture-depth-${index}`}>
              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ + moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ + moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              <mesh position={[0, furnitureTopY, furnitureZ + moduleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              <mesh position={[0, furnitureTopY, furnitureZ - moduleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              <Text
                position={[0, furnitureTopY + mmToThreeUnits(80), furnitureZ]}
                fontSize={largeFontSize}
                color={textColor}
                anchorX="center"
                anchorY="middle"
                renderOrder={1000}
                depthTest={false}
                rotation={[0, Math.PI / 2, 0]}
              >
                {customDepth}
              </Text>

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {(module.lowerSectionDepth !== undefined) && (() => {
                const lowerDepth = module.lowerSectionDepth;
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - lowerModuleDepth/2;
                const lowerDimY = floatHeight - mmToThreeUnits(200); // 하단 치수선 위치 (가구 바닥 아래)

                return (
                  <group>
                    <NativeLine name="dimension_line"
                      points={[
                        [0, floatHeight, lowerFurnitureZ + lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0, floatHeight, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <mesh position={[0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

                    <mesh position={[0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

                    <Text
                      position={[0, lowerDimY - mmToThreeUnits(80), lowerFurnitureZ]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={1000}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      {lowerDepth}
                    </Text>
                  </group>
                );
              })()}
            </group>
          );
        })}

        {/* ===== 단내림 구간 선택 시 단내림 벽 표시 (빗금 패턴) ===== */}
        {isSelectedSlotInDroppedZone && (() => {
          // 보이는 가구의 깊이 가져오기 (가구가 없으면 기본값 600mm 사용)
          let actualFurnitureDepthMm = 600;
          if (visibleFurniture.length > 0) {
            const visibleModule = visibleFurniture[0];
            const visibleModuleData = getModuleById(
              visibleModule.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            // 상부섹션 깊이 우선 사용 (가구 치수 표시와 동일)
            actualFurnitureDepthMm = visibleModule.upperSectionDepth || visibleModule.customDepth || visibleModuleData?.dimensions.depth || 600;
          }
          const actualFurnitureDepth = mmToThreeUnits(actualFurnitureDepthMm);

          // 빗금 해칭 패턴 생성
          const hatchLines: JSX.Element[] = [];
          const hatchSpacing = mmToThreeUnits(40); // 40mm 간격
          const hatchColor = view2DTheme === 'dark' ? '#FFD700' : '#999999';

          // 가구 Z 위치 계산 (가구 치수와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const baseFurnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const baseFurnitureDepth = mmToThreeUnits(baseFurnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - baseFurnitureDepth) / 2;
          // 가구 Z 위치 (가구 치수 표시와 동일한 방식)
          const furnitureZ = furnitureZOffset + baseFurnitureDepth/2 - doorThickness - actualFurnitureDepth/2;
          // 가구 뒷면과 앞면 Z 위치
          const furnitureBackZ = furnitureZ - actualFurnitureDepth/2;
          const furnitureFrontZ = furnitureZ + actualFurnitureDepth/2;

          // 단내림 벽 영역: Z방향으로 가구 깊이만큼, Y방향으로 dropHeight
          const wallStartZ = furnitureBackZ;
          const wallEndZ = furnitureFrontZ;
          const wallDepth = wallEndZ - wallStartZ;
          const wallStartY = displaySpaceHeight;
          const wallEndY = spaceHeight;

          // 대각선 빗금 생성 (좌하단에서 우상단으로)
          const startOffset = -dropHeight;
          const endOffset = wallDepth;
          const hatchCount = Math.ceil((endOffset - startOffset) / hatchSpacing) + 1;

          for (let i = 0; i <= hatchCount; i++) {
            const offset = startOffset + i * hatchSpacing;

            // 시작점과 끝점 계산 (Z-Y 평면에서)
            let startZ = wallStartZ + offset;
            let startY = wallStartY;
            let endZ = startZ + dropHeight;
            let endY = wallEndY;

            // 클리핑
            if (startZ < wallStartZ) {
              const diff = wallStartZ - startZ;
              startZ = wallStartZ;
              startY = wallStartY + diff;
            }
            if (endZ > wallEndZ) {
              const diff = endZ - wallEndZ;
              endZ = wallEndZ;
              endY = wallEndY - diff;
            }

            // 유효한 선분인지 확인
            if (startZ < wallEndZ && endZ > wallStartZ && startY < wallEndY && endY > wallStartY) {
              hatchLines.push(
                <NativeLine
                  key={`hatch-right-${i}`}
                  name="hatch_line"
                  points={[
                    [0, startY, startZ],
                    [0, endY, endZ]
                  ]}
                  color={hatchColor}
                  lineWidth={0.5}
                  renderOrder={100000}
                  depthTest={false}
                />
              );
            }
          }

          return (
            <group>
              {/* 회색 반투명 배경 메쉬 (정면도와 동일) */}
              <mesh
                position={[0, (wallStartY + wallEndY) / 2, (wallStartZ + wallEndZ) / 2]}
                rotation={[0, Math.PI / 2, 0]}
                renderOrder={99998}
              >
                <planeGeometry args={[wallDepth, dropHeight]} />
                <meshBasicMaterial color="#999999" transparent opacity={0.15} depthTest={false} />
              </mesh>
              {/* 단내림 벽 테두리 */}
              <NativeLine
                name="dropped_ceiling_border"
                points={[
                  [0, wallStartY, wallStartZ],
                  [0, wallEndY, wallStartZ],
                  [0, wallEndY, wallEndZ],
                  [0, wallStartY, wallEndZ],
                  [0, wallStartY, wallStartZ]
                ]}
                color={hatchColor}
                lineWidth={0.8}
                renderOrder={100000}
                depthTest={false}
              />
              {/* 빗금 패턴 */}
              {hatchLines}
            </group>
          );
        })()}
      </group>
    );
  }

  return null;
};

export default CADDimensions2D;
