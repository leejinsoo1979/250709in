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
import { getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SectionConfig } from '@/data/modules/shelving';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';

const DEFAULT_BASIC_THICKNESS_MM = 18;

const mmToThreeUnits = (mm: number) => mm * 0.01;

type SectionWithCalc = SectionConfig & { calculatedHeight?: number };

/**
 * FurnitureItem.tsx의 furnitureHeightMm 계산을 정확히 복제
 * (FurnitureItem.tsx line 1288-1341과 동기화)
 */
const computeFurnitureHeightMm = (
  mod: PlacedModule,
  moduleData: ReturnType<typeof getModuleById>,
  spaceInfo: SpaceInfo,
  internalSpace: { width: number; height: number; depth: number }
): number => {
  const category = getModuleCategory(mod);
  const isTall = category === 'full';
  const isStandFloat = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeightMm = isStandFloat ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const isStandType = spaceInfo.baseConfig?.type === 'stand';

  let heightMm: number;

  if (mod.isFreePlacement && isTall) {
    // 자유배치 키큰장: freeHeight 우선, 없으면 internalSpace.height
    const baseFreeHeight = mod.freeHeight || internalSpace.height;
    const maxFreeHeight = internalSpace.height - floatHeightMm;
    heightMm = Math.min(baseFreeHeight, maxFreeHeight);
    // 개별 상부프레임 두께 변경 시 보정
    if (mod.topFrameThickness !== undefined) {
      const globalTopFrame = spaceInfo.frameSize?.top || 30;
      heightMm -= (mod.topFrameThickness - globalTopFrame);
    }
  } else if (mod.isFreePlacement && mod.freeHeight) {
    // 자유배치 상/하부장: freeHeight 고정
    heightMm = mod.freeHeight;
  } else {
    // 슬롯 기반
    heightMm = moduleData?.dimensions.height || 0;
    if (!mod.isFreePlacement && heightMm > 0) {
      if (mod.topFrameThickness !== undefined) {
        const globalTop = spaceInfo.frameSize?.top ?? 30;
        heightMm -= (mod.topFrameThickness - globalTop);
      }
      if (mod.baseFrameHeight !== undefined && !isStandType) {
        const globalBase = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0;
        heightMm -= (mod.baseFrameHeight - globalBase);
      }
    }
  }

  // 바닥마감재 차감: 키큰장(full)만 (하부장/상부장은 고정 높이이므로 차감 불필요)
  const floorFinishH = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish) ? spaceInfo.floorFinish.height : 0;
  if (floorFinishH > 0 && isTall) {
    heightMm -= floorFinishH;
  }

  // hasBase=false: 하부프레임 높이 추가, 개별 띄움 차감
  if (mod.hasBase === false && spaceInfo.baseConfig?.type === 'floor') {
    const hiddenBaseH = mod.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 65;
    const indivFloat = mod.individualFloatHeight ?? 0;
    heightMm += hiddenBaseH - indivFloat;
  }

  return heightMm;
};

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

  // useBaseFurniture.ts(line 112-157)와 동일한 방식:
  // shelving.ts에서 sections 합 = dimensions.height (판재 두께 포함)
  // 하부 섹션 고정, 마지막(상부) 섹션이 높이 차이를 흡수
  let heightsMm: number[];

  const hasCalculatedHeights = rawSections.every(section => typeof (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight === 'number');

  if (hasCalculatedHeights && rawSections.length > 0) {
    // calculatedHeight가 있는 경우: 합산 후 internalHeightMm과 비교하여 마지막 섹션 보정
    const calcHeights = rawSections.map(section => {
      const calc = (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight;
      return Math.max(calc ?? 0, 0);
    });
    const calcTotal = calcHeights.reduce((sum, h) => sum + h, 0);
    if (Math.abs(calcTotal - internalHeightMm) > 1 && rawSections.length > 1) {
      // 하부 고정, 마지막(상부) 섹션이 차이 흡수
      const fixedSum = calcHeights.slice(0, -1).reduce((sum, h) => sum + h, 0);
      calcHeights[calcHeights.length - 1] = Math.max(0, internalHeightMm - fixedSum);
    }
    heightsMm = calcHeights;
  } else {
    // 하부 섹션 고정, 마지막(상부) 섹션이 높이 차이를 흡수 (useBaseFurniture 방식)
    const fixedSum = rawSections.slice(0, -1).reduce((sum, section) => sum + (section.height ?? 0), 0);
    const lastSectionNewHeight = Math.max(0, internalHeightMm - fixedSum);

    heightsMm = rawSections.map((section, idx) => {
      if (idx < rawSections.length - 1) {
        return section.height ?? 0; // 하부 섹션 고정
      }
      return lastSectionNewHeight; // 상부(마지막) 섹션이 나머지 흡수
    });
  }

  return {
    sections: rawSections,
    heightsMm,
    basicThicknessMm
  };
};

/**
 * 하부장 외부서랍 마이다 높이 계산 (LowerCabinet.tsx + ExternalDrawerRenderer 로직 복제)
 * lower-drawer-*, lower-door-lift-*, lower-top-down-* 모듈 전용
 */
const computeLowerCabinetMaidaHeights = (
  moduleId: string,
  moduleHeightMm: number,
  doorTopGap: number,
  doorBottomGap: number,
): { maidaHeightMm: number; maidaBottomMm: number; maidaTopMm: number }[] | null => {
  // 하부장 서랍 모듈만 처리
  const isLowerDrawer = moduleId.includes('lower-drawer-');
  const isLowerDoorLift = moduleId.includes('lower-door-lift-');
  const isLowerTopDown = moduleId.includes('lower-top-down-');
  if (!isLowerDrawer && !isLowerDoorLift && !isLowerTopDown) return null;

  const is3Tier = moduleId.includes('lower-drawer-3tier');
  const isDoorLift3Tier = moduleId.includes('lower-door-lift-3tier');
  const isDoorLift2Tier = moduleId.includes('lower-door-lift-2tier');
  const isTopDown3Tier = moduleId.includes('lower-top-down-3tier');
  const isTopDown2Tier = moduleId.includes('lower-top-down-2tier');

  // LowerCabinet.tsx line 349-350과 동일
  const notchFromBottoms = is3Tier ? [295, 510] : isDoorLift3Tier ? [315, 545] : isDoorLift2Tier ? [355] : isTopDown3Tier ? [225, 445, 665] : isTopDown2Tier ? [300, 665] : [330];
  const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : isTopDown3Tier ? [65, 65, 65] : isTopDown2Tier ? [65, 65] : [65];
  const hideTopNotch = isDoorLift2Tier || isDoorLift3Tier || isTopDown2Tier || isTopDown3Tier;
  const fixedMaidaHeights = isDoorLift2Tier ? [400, 400] : isDoorLift3Tier ? [360, 210, 210] : undefined;

  // 모듈별 기본 doorTopGap/doorBottomGap (LowerCabinet.tsx line 379-381)
  const defaultDoorTopGap = isTopDown2Tier || isTopDown3Tier ? -80 : isDoorLift2Tier || isDoorLift3Tier ? 30 : -20;
  const defaultDoorBottomGap = 5;

  // ExternalDrawerRenderer line 517-555: zone 계산
  const upperNotchH = 60;
  const upperNotchFromBottom = moduleHeightMm - upperNotchH;

  const sortedNotches = notchFromBottoms
    .map((fb, idx) => ({ fromBottom: fb, height: notchHeights[idx] || 65 }))
    .sort((a, b) => a.fromBottom - b.fromBottom);

  const allNotches = hideTopNotch
    ? [...sortedNotches]
    : [...sortedNotches, { fromBottom: upperNotchFromBottom, height: upperNotchH }];

  interface Zone { bottomMm: number; topMm: number; notchAboveBottom: number; notchBelowTop: number | null; }
  const zones: Zone[] = [];
  let cursor = 0;
  for (let ni = 0; ni < allNotches.length; ni++) {
    const notch = allNotches[ni];
    if (notch.fromBottom > cursor) {
      const notchAboveBottom = notch.fromBottom;
      const notchBelowTop = ni > 0 ? (allNotches[ni - 1].fromBottom + allNotches[ni - 1].height) : null;
      zones.push({ bottomMm: cursor, topMm: notch.fromBottom, notchAboveBottom, notchBelowTop });
    }
    cursor = notch.fromBottom + notch.height;
  }

  // ExternalDrawerRenderer line 149-154: 마이다 높이 계산
  return zones.map((zone, i) => {
    const isTopDrawer = i === zones.length - 1;
    const isBottomDrawer = i === 0;
    const maidaTopBase = zone.notchAboveBottom + 40;
    const maidaBottomBase = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
    const gapTopExt = isTopDrawer ? (doorTopGap - defaultDoorTopGap) : 0;
    const gapBottomExt = isBottomDrawer ? (doorBottomGap - defaultDoorBottomGap) : 0;
    const defaultMaidaH = maidaTopBase - maidaBottomBase + gapTopExt + gapBottomExt;
    const maidaH = (fixedMaidaHeights && fixedMaidaHeights[i]) ? fixedMaidaHeights[i] : defaultMaidaH;
    const maidaBottom = maidaBottomBase - gapBottomExt;
    const maidaTop = maidaBottom + maidaH;
    return { maidaHeightMm: maidaH, maidaBottomMm: maidaBottom, maidaTopMm: maidaTop };
  });
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

  // 프레임 높이 (전역값) — Room.tsx, calculateTopBottomFrameHeight와 동일한 기본값 30
  const globalTopFrameHeightMm = spaceInfo.frameSize?.top ?? 30;

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

  // 측면뷰에서 표시할 가구 필터링 (PlacedFurnitureContainer.tsx와 동일한 로직)
  const getVisibleFurnitureForSideView = () => {
    if (placedModules.length === 0) return [];

    const nonSurroundModules = placedModules.filter(m => !m.isSurroundPanel);
    if (nonSurroundModules.length === 0) return [];

    let filteredBySlot = nonSurroundModules;

    if (selectedSlotIndex !== null) {
      if (isFreePlacementMode) {
        // 자유배치 모드: X좌표 기반 가상 슬롯 그룹핑
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

        if (selectedSlotIndex < xGroups.length) {
          const selectedIds = new Set(
            xGroups[selectedSlotIndex].map(idx => sortedByX[idx].id)
          );
          filteredBySlot = nonSurroundModules.filter(m => selectedIds.has(m.id));
        }
      } else {
        // 슬롯 기반 배치: slotIndex로 직접 필터링 (PlacedFurnitureContainer와 동일)
        const hasDropCeiling = spaceInfo.droppedCeiling?.enabled || false;
        const normalSlotCount = zones?.normal?.columnCount || (spaceInfo.customColumnCount || 4);

        filteredBySlot = nonSurroundModules.filter(module => {
          if (module.slotIndex === undefined) return false;

          let moduleGlobalSlotIndex = module.slotIndex;
          let isInDroppedZone = module.zone === 'dropped';

          if (hasDropCeiling && !isInDroppedZone && zones?.dropped && zones?.normal) {
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

          if (hasDropCeiling && isInDroppedZone) {
            moduleGlobalSlotIndex = normalSlotCount + module.slotIndex;
          }

          return module.isDualSlot
            ? (moduleGlobalSlotIndex === selectedSlotIndex || moduleGlobalSlotIndex + 1 === selectedSlotIndex)
            : (moduleGlobalSlotIndex === selectedSlotIndex);
        });
      }
    }

    if (filteredBySlot.length === 0) return [];

    if (currentViewDirection === 'left') {
      return [filteredBySlot.reduce((a, b) => a.position.x < b.position.x ? a : b)];
    } else if (currentViewDirection === 'right') {
      return [filteredBySlot.reduce((a, b) => a.position.x > b.position.x ? a : b)];
    }

    return [];
  };

  const visibleFurniture = getVisibleFurnitureForSideView();

  // 선택된 가구의 개별 프레임 값 우선 사용 (자유배치/슬롯 공통)
  const selectedMod = visibleFurniture[0] as PlacedModule | undefined;
  const topFrameHeightMm = (selectedMod?.topFrameThickness !== undefined)
    ? selectedMod.topFrameThickness
    : globalTopFrameHeightMm;
  const topFrameHeight = mmToThreeUnits(topFrameHeightMm);
  // 개별 가구 hasBase/individualFloatHeight 반영 (FurnitureItem.tsx 1392-1395와 동기화)
  const modHasBaseOff = selectedMod?.hasBase === false && !isStandType;
  const railOrBaseHeightMm = modHasBaseOff
    ? 0  // 하부프레임 OFF → 받침대 0
    : (selectedMod?.baseFrameHeight !== undefined && !isStandType)
      ? selectedMod.baseFrameHeight
      : globalRailOrBaseHeightMm;
  const indivFloatMm = modHasBaseOff ? (selectedMod?.individualFloatHeight ?? 0) : 0;
  const railOrBaseHeight = mmToThreeUnits(railOrBaseHeightMm);

  // per-furniture 받침대/치수 변수
  const baseFrameHeightMm = isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm);
  // 하부프레임 표시값: 바닥마감재와 별개로 표시 (바닥마감재는 별도 치수선으로 표시)
  const baseFrameDisplayMm = baseFrameHeightMm;
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);
  const floorFinishY = isFloating ? 0 : mmToThreeUnits(floorFinishHeightMm);
  const furnitureBaseY = (isFloating ? floatHeight : baseFrameHeight) + floorFinishY;

  // 선택된 가구의 카테고리 확인 (키큰장만 바닥마감재 차감)
  const selectedModCategory = selectedMod ? getModuleCategory(selectedMod) : undefined;
  const isSelectedTall = selectedModCategory === 'full';

  // 내경 높이 (per-furniture delta 보정 적용)
  let adjustedInternalHeightMm = globalAdjustedInternalHeightMm;
  // 바닥마감재: 키큰장(full)만 가구 높이에서 차감 (하부장/상부장은 고정 높이)
  if (floorFinishHeightMm > 0 && isSelectedTall) {
    adjustedInternalHeightMm -= floorFinishHeightMm;
  }
  // 개별 프레임 높이 변경 시 내경 높이 보정 (자유배치/슬롯 공통)
  if (selectedMod) {
    if (selectedMod.topFrameThickness !== undefined) {
      adjustedInternalHeightMm -= (selectedMod.topFrameThickness - globalTopFrameHeightMm);
    }
    if (modHasBaseOff) {
      // 하부프레임 OFF: 받침대 높이만큼 가구 내경이 늘어나고, 개별 띄움만큼 줄어듦
      const hiddenBaseH = selectedMod.baseFrameHeight ?? globalRailOrBaseHeightMm;
      adjustedInternalHeightMm += hiddenBaseH - indivFloatMm;
    } else if (selectedMod.baseFrameHeight !== undefined && !isStandType) {
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

        {/* ===== 왼쪽 2단: 섹션별 높이 + 하부프레임 (하부장 선택 시만) ===== */}
        {selectedModCategory === 'lower' && visibleFurniture.length > 0 && (() => {
          const leftInnerZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) + mmToThreeUnits(200);
          const leftInnerExtStartZ = -spaceDepth/2 + mmToThreeUnits(110);

          const mod = visibleFurniture[0] as PlacedModule;
          let moduleData = getModuleById(
            mod.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!moduleData) {
            moduleData = buildModuleDataFromPlacedModule(mod, internalSpace, spaceInfo);
          }
          if (!moduleData) return null;

          const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);

          // 서랍 모듈(마이다 있음)이면 왼쪽 섹션 높이 생략 (오른쪽에 마이다 개별 높이로 대체)
          const hasLowerMaida = !!computeLowerCabinetMaidaHeights(
            mod.moduleId, moduleHeightMm, mod.doorTopGap ?? 0, mod.doorBottomGap ?? 0
          );
          if (hasLowerMaida) return null;

          const { sections: sectionConfigs, heightsMm: sectionHeightsMm } = computeSectionHeightsInfo(mod, moduleData, moduleHeightMm, 'left');
          if (sectionConfigs.length === 0) return null;

          const lowerSectionHeightMm = sectionHeightsMm[0] || 0;
          const upperSectionHeightMm = sectionHeightsMm.slice(1).reduce((sum, h) => sum + h, 0);
          const cabinetBottomY = furnitureBaseY;
          const cabinetHeight = mmToThreeUnits(moduleHeightMm);
          const cabinetTopY = cabinetBottomY + cabinetHeight;
          const lowerSectionEndY = cabinetBottomY + mmToThreeUnits(lowerSectionHeightMm);

          const displaySections = [
            { startY: cabinetBottomY, endY: lowerSectionEndY, heightMm: lowerSectionHeightMm, isFirst: true },
            { startY: lowerSectionEndY, endY: cabinetTopY, heightMm: upperSectionHeightMm, isFirst: false }
          ].filter(s => s.heightMm > 0);

          return (
            <group>
              {displaySections.map((sec, si) => {
                const shouldRenderStartGuide = !sec.isFirst || baseFrameHeightMm <= 0;
                return (
                  <group key={`left-sec-${si}`}>
                    {/* 시작 가이드선 */}
                    {shouldRenderStartGuide && (
                      <NativeLine name="dimension_line"
                        points={[[0, sec.startY, leftInnerExtStartZ], [0, sec.startY, leftInnerZ]]}
                        color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                      />
                    )}
                    {/* 끝 가이드선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, sec.endY, leftInnerExtStartZ], [0, sec.endY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    {/* 수직 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, sec.startY, leftInnerZ], [0, sec.endY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                    />
                    {/* 시작 티크 */}
                    {shouldRenderStartGuide && (
                      <NativeLine name="dimension_line"
                        points={[[-0.03, sec.startY, leftInnerZ], [0.03, sec.startY, leftInnerZ]]}
                        color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                      />
                    )}
                    {/* 끝 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[-0.03, sec.endY, leftInnerZ], [0.03, sec.endY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                    />
                    {/* 치수 텍스트 */}
                    <Text
                      position={[0, (sec.startY + sec.endY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, -Math.PI / 2, Math.PI / 2]}
                    >
                      {Math.round(sec.heightMm)}
                    </Text>
                  </group>
                );
              })}

              {/* 하부프레임 높이: 바닥마감재 상단 ~ 받침대 상단 */}
              {baseFrameHeightMm > 0 && (
                <>
                  {/* 바닥마감재 상단 연장선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, floorFinishY, leftInnerExtStartZ], [0, floorFinishY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  {/* 받침대 상단 연장선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, furnitureBaseY, leftInnerExtStartZ], [0, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  {/* 수직 치수선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, floorFinishY, leftInnerZ], [0, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                  />
                  {/* 바닥마감재 상단 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[-0.03, floorFinishY, leftInnerZ], [0.03, floorFinishY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                  />
                  {/* 받침대 상단 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[-0.03, furnitureBaseY, leftInnerZ], [0.03, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                  />
                  <Text
                    position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={1000} depthTest={false}
                    rotation={[0, -Math.PI / 2, Math.PI / 2]}
                  >
                    {baseFrameDisplayMm}
                  </Text>
                </>
              )}

            </group>
          );
        })()}

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

        {/* 가구별 섹션 치수 가이드 - 측면뷰에서 보이는 가구만 표시
            하부장 서랍 모듈(마이다 있음)은 섹션 높이 대신 마이다 개별 높이로 대체 */}
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

          const mod = module as PlacedModule;
          const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);
          const cabinetBottomY = furnitureBaseY;

          // 치수선 Z 위치 (기존 백색 섹션 높이와 동일 위치)
          const dimZ = spaceDepth/2 + rightDimOffset - mmToThreeUnits(750);
          const dimExtZ = dimZ - mmToThreeUnits(360);

          // 하부장 서랍 모듈: 섹션 높이 대신 마이다 개별 높이 표시
          const lowerMaidas = computeLowerCabinetMaidaHeights(
            mod.moduleId, moduleHeightMm,
            mod.doorTopGap ?? 0, mod.doorBottomGap ?? 0
          );
          if (lowerMaidas && lowerMaidas.length > 0) {
            return lowerMaidas.map((m, i) => {
              const dBotY = cabinetBottomY + mmToThreeUnits(m.maidaBottomMm);
              const dTopY = cabinetBottomY + mmToThreeUnits(m.maidaTopMm);
              const isFirst = i === 0;
              const shouldRenderStartGuide = !isFirst || baseFrameHeightMm <= 0;
              return (
                <group key={`section-maida-${moduleIndex}-${i}`}>
                  {shouldRenderStartGuide && (
                    <NativeLine name="dimension_line" points={[[0, dBotY, dimExtZ], [0, dBotY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  )}
                  <NativeLine name="dimension_line" points={[[0, dTopY, dimExtZ], [0, dTopY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[0, dBotY, dimZ], [0, dTopY, dimZ]]} color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false} />
                  {shouldRenderStartGuide && (
                    <NativeLine name="dimension_line" points={[[-0.03, dBotY, dimZ], [0.03, dBotY, dimZ]]} color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false} />
                  )}
                  <NativeLine name="dimension_line" points={[[-0.03, dTopY, dimZ], [0.03, dTopY, dimZ]]} color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (dBotY + dTopY) / 2, dimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                    {Math.round(m.maidaHeightMm)}
                  </Text>
                </group>
              );
            });
          }

          // 하부장(서랍 외): 왼쪽 2단에서 이미 표시하므로 오른쪽 섹션 높이 생략
          if (selectedModCategory === 'lower') return null;

          // 키큰장/상부장: 기존 섹션 높이 표시
          const { sections: sectionConfigs, heightsMm: sectionHeightsMm } = computeSectionHeightsInfo(mod, moduleData, moduleHeightMm, 'left');
          if (sectionConfigs.length === 0) return null;

          const lowerSectionHeightMm = sectionHeightsMm[0] || 0;
          const upperSectionHeightMm = sectionHeightsMm.slice(1).reduce((sum, h) => sum + h, 0);
          const cabinetHeight = mmToThreeUnits(moduleHeightMm);
          const cabinetTopY = cabinetBottomY + cabinetHeight;
          const lowerSectionEndY = cabinetBottomY + mmToThreeUnits(lowerSectionHeightMm);

          const displaySections = [
            { startY: cabinetBottomY, endY: lowerSectionEndY, heightMm: lowerSectionHeightMm, isFirst: true },
            { startY: lowerSectionEndY, endY: cabinetTopY, heightMm: upperSectionHeightMm, isFirst: false }
          ].filter(s => s.heightMm > 0);

          return displaySections.map((sectionDisplay, sectionIndex) => {
            const { startY: sectionStartY, endY: sectionEndY, heightMm: sectionHeightMm, isFirst } = sectionDisplay;
            const shouldRenderStartGuide = !isFirst || baseFrameHeightMm <= 0;

            return (
              <group key={`section-${moduleIndex}-${sectionIndex}`}>
                {shouldRenderStartGuide && (
                  <NativeLine name="dimension_line" points={[[0, sectionStartY, dimExtZ], [0, sectionStartY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                )}
                <NativeLine name="dimension_line" points={[[0, sectionEndY, dimExtZ], [0, sectionEndY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                <NativeLine name="dimension_line" points={[[0, sectionStartY, dimZ], [0, sectionEndY, dimZ]]} color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false} />
                {shouldRenderStartGuide && (
                  <NativeLine name="dimension_line" points={[[-0.03, sectionStartY, dimZ], [0.03, sectionStartY, dimZ]]} color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false} />
                )}
                <NativeLine name="dimension_line" points={[[-0.03, sectionEndY, dimZ], [0.03, sectionEndY, dimZ]]} color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false} />
                <Text position={[0, (sectionStartY + sectionEndY) / 2, dimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                  {Math.round(sectionHeightMm)}
                </Text>
              </group>
            );
          });
        })}

        {/* (하부장 서랍 마이다 치수는 위 섹션 치수 블록에서 흰색으로 처리) */}

        {/* 바닥마감재 치수 (별도 위치, 좌측뷰) — 하부장은 왼쪽 2단에서 표시하므로 제외 */}
        {floorFinishHeightMm > 0 && !isFloating && selectedModCategory !== 'lower' && (
        <group>
            {/* 보조 가이드 연장선 - 바닥 */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 보조 가이드 연장선 - 마감재 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 메인 치수선 (바닥 ~ 마감재 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 바닥 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 마감재 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              {floorFinishHeightMm}
            </Text>
        </group>
        )}

        {/* 받침대 높이 (마감재 상단 ~ 받침대 상단, 좌측뷰) — 하부장은 왼쪽 2단에서 표시하므로 제외 */}
        {baseFrameHeightMm > 0 && selectedModCategory !== 'lower' && (
        <group>
            {/* 보조 가이드 연장선 - 시작 (마감재 상단 or 바닥) */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 보조 가이드 연장선 - 받침대 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 메인 치수선 (마감재 상단 ~ 받침대 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 시작 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 받침대 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
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

        {/* ===== 도어 높이 치수선 (도어가 설치된 가구가 있을 때만) ===== */}
        {(() => {
          // 선택된 슬롯의 도어 가구만 표시 (듀얼 가구는 2슬롯 차지)
          const doorModule = placedModules.find(m =>
            m.hasDoor && !m.isSurroundPanel &&
            (selectedSlotIndex === null ||
              m.slotIndex === selectedSlotIndex ||
              (m.isDualSlot && m.slotIndex + 1 === selectedSlotIndex))
          );
          if (!doorModule) return null;

          let doorModData = getModuleById(
            doorModule.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!doorModData) {
            doorModData = buildModuleDataFromPlacedModule(doorModule as PlacedModule, internalSpace, spaceInfo);
          }

          const doorCategory = doorModData?.category
            ?? (doorModule.moduleId.includes('-upper-') ? 'upper'
              : doorModule.moduleId.startsWith('lower-') ? 'lower' : 'full');

          // DoorModule과 동일한 fallback: 개별값 → 글로벌값 → 0
          const doorTopGapVal = doorModule.doorTopGap ?? spaceInfo.doorTopGap ?? 0;
          const doorBottomGapVal = doorModule.doorBottomGap ?? spaceInfo.doorBottomGap ?? 0;

          let doorHeightMm = 0;
          let doorBottomAbsMm = 0;
          let doorTopAbsMm = 0;

          const effectiveH = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;

          if (doorCategory === 'upper') {
            const cabinetH = doorModData?.dimensions.height ?? 600;
            const topFrameVal = doorModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
            const topExtension = topFrameVal - doorTopGapVal;
            doorHeightMm = cabinetH + topExtension + doorBottomGapVal;
            doorTopAbsMm = effectiveH - doorTopGapVal;
            doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
          } else if (doorCategory === 'lower') {
            const cabinetH = doorModData?.dimensions.height ?? 1000;
            const isDoorLift = doorModData?.id?.includes('lower-door-lift-');
            const isTopDown = doorModData?.id?.includes('lower-top-down-');
            const cabinetBottomAbs = baseFrameHeightMm + floorFinishHeightMm;

            if (isTopDown) {
              doorHeightMm = 710;
              doorBottomAbsMm = cabinetBottomAbs - 5;
              doorTopAbsMm = doorBottomAbsMm + doorHeightMm;
            } else if (isDoorLift) {
              doorHeightMm = cabinetH + 5 + 30;
              doorTopAbsMm = cabinetBottomAbs + cabinetH + 30;
              doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
            } else {
              // 기본 하부장: DoorModule과 동일 — cabinetH + doorTopGap + doorBottomGap
              doorHeightMm = cabinetH + doorTopGapVal + doorBottomGapVal;
              doorTopAbsMm = cabinetBottomAbs + cabinetH + doorTopGapVal;
              doorBottomAbsMm = cabinetBottomAbs - doorBottomGapVal;
            }
          } else {
            // 키큰장
            const isFloorType = !spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor';
            const floorFinishForDoor = (isFloorType && spaceInfo.hasFloorFinish)
              ? (spaceInfo.floorFinish?.height || 0) : 0;
            doorBottomAbsMm = doorBottomGapVal + floorFinishForDoor;
            doorTopAbsMm = effectiveH - doorTopGapVal;
            doorHeightMm = Math.max(0, doorTopAbsMm - doorBottomAbsMm);
          }

          if (doorHeightMm <= 0) return null;

          const doorBottomY = mmToThreeUnits(doorBottomAbsMm);
          const doorTopY = mmToThreeUnits(doorTopAbsMm);
          const doorMidY = (doorBottomY + doorTopY) / 2;
          const doorColor = dimensionColor;

          // 도어 치수선 Z 위치: 가구 앞면(도어면) 바로 옆에 배치
          const panelDepthMm = spaceInfo.depth || 1500;
          const panelDepthU = mmToThreeUnits(panelDepthMm);
          const furnitureDepthU = mmToThreeUnits(600);
          const furnitureFrontZ = -panelDepthU / 2 + (panelDepthU - furnitureDepthU) / 2 + furnitureDepthU / 2;
          const doorDimZ = furnitureFrontZ + mmToThreeUnits(200);

          return (
            <group>
              {/* 수직 치수선 */}
              <NativeLine name="door_height_dim"
                points={[
                  [0, doorBottomY, doorDimZ],
                  [0, doorTopY, doorDimZ]
                ]}
                color={doorColor} lineWidth={2} renderOrder={100000} depthTest={false}
              />
              {/* 상단 티크 */}
              <NativeLine name="door_height_dim"
                points={[
                  [-0.03, doorTopY, doorDimZ],
                  [0.03, doorTopY, doorDimZ]
                ]}
                color={doorColor} lineWidth={2} renderOrder={100000} depthTest={false}
              />
              {/* 하단 티크 */}
              <NativeLine name="door_height_dim"
                points={[
                  [-0.03, doorBottomY, doorDimZ],
                  [0.03, doorBottomY, doorDimZ]
                ]}
                color={doorColor} lineWidth={2} renderOrder={100000} depthTest={false}
              />
              {/* 높이 텍스트 */}
              <Text
                position={[0, doorMidY, doorDimZ + mmToThreeUnits(60)]}
                fontSize={largeFontSize}
                color={doorColor}
                anchorX="center" anchorY="middle"
                renderOrder={1000} depthTest={false}
                rotation={[0, -Math.PI / 2, Math.PI / 2]}
              >
                {Math.round(doorHeightMm)}
              </Text>
              {/* 도어 상단 연장선: 가구 앞면에서 치수선까지 (끊김 없이 연결) */}
              <NativeLine name="door_height_ext"
                points={[
                  [0, doorTopY, furnitureFrontZ + mmToThreeUnits(20)],
                  [0, doorTopY, doorDimZ]
                ]}
                color={doorColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
              {/* 도어 하단 연장선: 가구 앞면에서 치수선까지 (끊김 없이 연결) */}
              <NativeLine name="door_height_ext"
                points={[
                  [0, doorBottomY, furnitureFrontZ + mmToThreeUnits(20)],
                  [0, doorBottomY, doorDimZ]
                ]}
                color={doorColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
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

        {/* ===== 왼쪽 2단: 섹션별 높이 + 하부프레임 (하부장 선택 시만) ===== */}
        {selectedModCategory === 'lower' && visibleFurniture.length > 0 && (() => {
          const leftInnerZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) + mmToThreeUnits(200);
          const leftInnerExtStartZ = -spaceDepth/2 + mmToThreeUnits(110);

          const mod = visibleFurniture[0] as PlacedModule;
          let moduleData = getModuleById(
            mod.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!moduleData) {
            moduleData = buildModuleDataFromPlacedModule(mod, internalSpace, spaceInfo);
          }
          if (!moduleData) return null;

          const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);
          const { sections: sectionConfigs, heightsMm: sectionHeightsMm } = computeSectionHeightsInfo(mod, moduleData, moduleHeightMm, 'right');
          if (sectionConfigs.length === 0) return null;

          const lowerSectionHeightMm = sectionHeightsMm[0] || 0;
          const upperSectionHeightMm = sectionHeightsMm.slice(1).reduce((sum, h) => sum + h, 0);
          const cabinetBottomY = furnitureBaseY;
          const cabinetHeight = mmToThreeUnits(moduleHeightMm);
          const cabinetTopY = cabinetBottomY + cabinetHeight;
          const lowerSectionEndY = cabinetBottomY + mmToThreeUnits(lowerSectionHeightMm);

          const displaySections = [
            { startY: cabinetBottomY, endY: lowerSectionEndY, heightMm: lowerSectionHeightMm, isFirst: true },
            { startY: lowerSectionEndY, endY: cabinetTopY, heightMm: upperSectionHeightMm, isFirst: false }
          ].filter(s => s.heightMm > 0);

          return (
            <group>
              {displaySections.map((sec, si) => {
                const shouldRenderStartGuide = !sec.isFirst || baseFrameHeightMm <= 0;
                return (
                  <group key={`right-sec-${si}`}>
                    {/* 시작 가이드선 */}
                    {shouldRenderStartGuide && (
                      <NativeLine name="dimension_line"
                        points={[[0, sec.startY, leftInnerExtStartZ], [0, sec.startY, leftInnerZ]]}
                        color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                      />
                    )}
                    {/* 끝 가이드선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, sec.endY, leftInnerExtStartZ], [0, sec.endY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    {/* 수직 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, sec.startY, leftInnerZ], [0, sec.endY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                    />
                    {/* 시작 티크 */}
                    {shouldRenderStartGuide && (
                      <NativeLine name="dimension_line"
                        points={[[-0.03, sec.startY, leftInnerZ], [0.03, sec.startY, leftInnerZ]]}
                        color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                      />
                    )}
                    {/* 끝 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[-0.03, sec.endY, leftInnerZ], [0.03, sec.endY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                    />
                    {/* 치수 텍스트 */}
                    <Text
                      position={[0, (sec.startY + sec.endY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, Math.PI / 2, Math.PI / 2]}
                    >
                      {Math.round(sec.heightMm)}
                    </Text>
                  </group>
                );
              })}

              {/* 하부프레임 높이: 바닥마감재 상단 ~ 받침대 상단 */}
              {baseFrameHeightMm > 0 && (
                <>
                  {/* 바닥마감재 상단 연장선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, floorFinishY, leftInnerExtStartZ], [0, floorFinishY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  {/* 받침대 상단 연장선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, furnitureBaseY, leftInnerExtStartZ], [0, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  {/* 수직 치수선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, floorFinishY, leftInnerZ], [0, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                  />
                  {/* 바닥마감재 상단 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[-0.03, floorFinishY, leftInnerZ], [0.03, floorFinishY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                  />
                  {/* 받침대 상단 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[-0.03, furnitureBaseY, leftInnerZ], [0.03, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
                  />
                  <Text
                    position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={1000} depthTest={false}
                    rotation={[0, Math.PI / 2, Math.PI / 2]}
                  >
                    {baseFrameDisplayMm}
                  </Text>
                </>
              )}

            </group>
          );
        })()}

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

        {/* 가구별 섹션 치수 가이드 - 우측뷰에서 보이는 가구만 표시 (하부장은 왼쪽 2단에서 표시하므로 제외) */}
        {selectedModCategory !== 'lower' && visibleFurniture.map((module, moduleIndex) => {
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

          const mod = module as PlacedModule;
          // FurnitureItem.tsx와 완전히 동일한 높이 계산
          const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);
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
          // computeFurnitureHeightMm으로 계산된 정확한 높이 사용
          const cabinetHeight = mmToThreeUnits(moduleHeightMm);
          const cabinetTopY = cabinetBottomY + cabinetHeight;
          const lowerSectionEndY = cabinetBottomY + mmToThreeUnits(lowerSectionHeightMm);

          // 2개 섹션만 표시 (하부/상부)
          const displaySections = [
            { startY: cabinetBottomY, endY: lowerSectionEndY, heightMm: lowerSectionHeightMm, isFirst: true },
            { startY: lowerSectionEndY, endY: cabinetTopY, heightMm: upperSectionHeightMm, isFirst: false }
          ].filter(s => s.heightMm > 0);

          return displaySections.map((sectionDisplay, sectionIndex) => {
            const { startY: sectionStartY, endY: sectionEndY, heightMm: sectionHeightMm, isFirst } = sectionDisplay;

            // 첫 번째 섹션(하부)은 받침대 치수가 있을 때만 하단 가이드선 생략 (겹침 방지)
            // 받침대가 없으면(hasBase=false + 띄움=0 등) 하단 가이드선 표시 필요
            const shouldRenderStartGuide = !isFirst || baseFrameHeightMm <= 0;

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

        {/* 바닥마감재 치수 (별도 위치, 우측뷰) — 하부장은 왼쪽 2단에서 표시하므로 제외 */}
        {floorFinishHeightMm > 0 && !isFloating && selectedModCategory !== 'lower' && (
        <group>
            {/* 보조 가이드 연장선 - 바닥 */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 보조 가이드 연장선 - 마감재 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 메인 치수선 (바닥 ~ 마감재 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 바닥 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 마감재 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {floorFinishHeightMm}
            </Text>
        </group>
        )}

        {/* 받침대 높이 (마감재 상단 ~ 받침대 상단, 우측뷰) — 하부장은 왼쪽 2단에서 표시하므로 제외 */}
        {baseFrameHeightMm > 0 && selectedModCategory !== 'lower' && (
        <group>
            {/* 보조 가이드 연장선 - 시작 (마감재 상단 or 바닥) */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 보조 가이드 연장선 - 받침대 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 메인 치수선 (마감재 상단 ~ 받침대 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 시작 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 받침대 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={2} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
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
