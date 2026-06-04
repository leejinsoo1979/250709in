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
import { getModuleBoundsX, getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import { getCategoryDefaultFurnitureDepth } from '@/editor/shared/utils/furnitureDepthDefaults';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SectionConfig } from '@/data/modules/shelving';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import { TOP_DOWN_STONE_FRONT_HEIGHT_MM, resolveTopDown2TierGeometry } from '@/editor/shared/utils/topDownCabinetGeometry';
import { resolvePetPanelThicknessMm } from '@/editor/shared/utils/panelThickness';
import { filterSideViewModules } from '@/editor/shared/utils/sideViewModuleFilter';

const DEFAULT_BASIC_THICKNESS_MM = 18;

const resolveGuideBaseFrameOffsetMm = (
  module: PlacedModule,
  spaceInfo: SpaceInfo,
  fallbackOffsetMm: number
): number => {
  const baseDefault = spaceInfo.baseConfig?.offset ?? fallbackOffsetMm;
  if (typeof module.baseFrameOffset === 'number') {
    return module.baseFrameOffset;
  }
  const useGlobalBase = spaceInfo.guideBaseFrameAllMode ?? true;
  if (useGlobalBase && typeof spaceInfo.baseConfig?.offset === 'number') {
    return spaceInfo.baseConfig.offset;
  }
  const guides = spaceInfo.freePlacementGuides || [];
  const category = getModuleCategory(module);
  const isGuideModule = module.guideSlotPlacement === true
    || module.guideDepthPlacement === true
    || (spaceInfo.customGuideMode === true && module.isFreePlacement === true);

  if (isGuideModule && guides.length > 0 && category !== 'upper') {
    const useAllGuideBase = spaceInfo.guideBaseFrameAllMode ?? true;
    const guideSlot = useAllGuideBase
      ? (
        guides.find((slot) => (slot.guideZone || 'full') === 'lower')
        ?? guides.find((slot) => (slot.guideZone || 'full') === 'full')
      )
      : (() => {
        const bounds = getModuleBoundsX(module);
        const targetZone = module.guideSlotZone || category;
        return guides.find((slot) => {
          const zone = slot.guideZone || 'full';
          if (zone === 'upper') return false;
          if (targetZone !== 'full' && zone !== targetZone) return false;
          const slotLeft = slot.x - spaceInfo.width / 2;
          const slotRight = slot.x + slot.width - spaceInfo.width / 2;
          return bounds.left < slotRight - 0.5 && bounds.right > slotLeft + 0.5;
        }) ?? guides.find((slot) => (slot.guideZone || 'full') === 'lower')
          ?? guides.find((slot) => (slot.guideZone || 'full') === 'full');
      })();

    if (typeof guideSlot?.baseFrameOffset === 'number') {
      return guideSlot.baseFrameOffset;
    }
  }

  return module.baseFrameOffset ?? baseDefault;
};

// 상판 실효 두께 계산 — 하부장 상판설치는 인조대리석 선택값만 사용
const getStoneTopThicknessMm = (mod: any): number => {
  const t = mod?.stoneTopThickness || 0;
  if (t <= 0) return 0;
  return t;
};

const getTopEndPanelThicknessMm = (mod: any): number => {
  if (!mod?.hasTopEndPanel) return 0;
  return resolvePetPanelThicknessMm(mod?.endPanelThickness);
};

const getLowerTopFinishThicknessMm = (mod: any): number => {
  return Math.max(getStoneTopThicknessMm(mod), getTopEndPanelThicknessMm(mod));
};

const getTopDownDoorTopGap = (stoneTopThickness?: number, hasTopEndPanel?: boolean): number => {
  if (hasTopEndPanel) return -82;
  if (stoneTopThickness === 10) return -90;
  if (stoneTopThickness === 30) return -70;
  return -80;
};

/** 연장선 + 양쪽 꼭지점 점 표시 */
const ExtLine: React.FC<{
  points: [number, number, number][];
  color?: string;
  lineWidth?: number;
  name?: string;
}> = ({ points, color = '#ffffff', lineWidth = 1, name = 'dimension_line' }) => (
  <group>
    <NativeLine name={name} points={points} color={color} lineWidth={lineWidth} renderOrder={100000} depthTest={false} />
    <mesh position={points[points.length - 1]} renderOrder={100001}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} transparent />
    </mesh>
  </group>
);

const mmToThreeUnits = (mm: number) => mm * 0.01;
const INSTALLED_FRONT_EXTENSION_MM = 20;

const getInstalledFrontExtensionMm = (mod: any): number => {
  return mod?.hasDoor === true ? INSTALLED_FRONT_EXTENSION_MM : 0;
};

const getBaseFrameReferenceFrontZ = (furnitureFrontZ: number): number => {
  return furnitureFrontZ;
};

const resolveFurnitureDepthDimensionLayout = (
  module: PlacedModule,
  moduleData: any,
  spaceInfo: SpaceInfo
) => {
  const moduleId = module.moduleId || '';
  const category = getModuleCategory(module);
  const panelDepthMm = spaceInfo.depth || 600;
  const furnitureDepthMm = Math.min(panelDepthMm, 600);
  const panelDepth = mmToThreeUnits(panelDepthMm);
  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
  const doorThickness = mmToThreeUnits(20);
  const zOffset = -panelDepth / 2;
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
  const categoryDefaultDepth = getCategoryDefaultFurnitureDepth(
    spaceInfo.depth || 600,
    moduleId,
    spaceInfo.furnitureDepthDefaults
  );
  const hasCustomDepth = typeof module.customDepth === 'number' && module.customDepth > 0;
  const defaultDepthMm = categoryDefaultDepth
    ?? (moduleData as any)?.defaultDepth
    ?? moduleData?.dimensions?.depth
    ?? 600;
  const rawActualDepthMm = hasCustomDepth ? module.customDepth! : defaultDepthMm;
  const actualDepthMm = moduleId.includes('-entryway-') && Math.abs(rawActualDepthMm - 400) < 0.5
    ? 380
    : rawActualDepthMm;
  const moduleDimDepthMm = moduleData?.dimensions?.depth ?? defaultDepthMm;
  const resolveSectionDepthMm = (sectionDepth?: number) => {
    if (typeof sectionDepth !== 'number' || sectionDepth <= 0) return actualDepthMm;
    return Math.abs(sectionDepth - moduleDimDepthMm) < 0.5
      ? actualDepthMm
      : sectionDepth;
  };
  const lowerDepthMm = resolveSectionDepthMm(module.lowerSectionDepth);
  const upperDepthMm = resolveSectionDepthMm(module.upperSectionDepth);
  const lowerDir = module.lowerSectionDepthDirection || 'front';
  const upperDir = module.upperSectionDepthDirection || 'front';
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const baseDepthOffset = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
  const backWallGapZ = mmToThreeUnits(module.backWallGap ?? 0);
  const isFrontSpaceFurniture = module.columnSlotInfo?.spaceType === 'front';
  const isSideWallFurniture = module.placementWall === 'left' || module.placementWall === 'right';
  const isUpper = category === 'upper' || moduleId.includes('upper-cabinet');
  const isLower = category === 'lower' || moduleId.startsWith('lower-') || moduleId.includes('dual-lower-');
  const isShoe = moduleId.includes('-entryway-')
    || moduleId.includes('-shelf-')
    || moduleId.includes('-4drawer-shelf-')
    || moduleId.includes('-2drawer-shelf-')
    || moduleId.includes('glass-cabinet');
  const isKitchenTall = moduleId.includes('pull-out-cabinet')
    || moduleId.includes('pantry-cabinet')
    || moduleId.includes('fridge-cabinet')
    || moduleId.includes('built-in-fridge');
  const isBackAlignedFull = category === 'full'
    && !isShoe
    && !moduleId.includes('insert-frame');
  const fixedBackWithBase = furnitureZOffset - furnitureDepth / 2 - doorThickness + baseDepthOffset + backWallGapZ;
  const fixedBackWithoutBase = furnitureZOffset - furnitureDepth / 2 - doorThickness + backWallGapZ;
  const fixedFrontWithBase = fixedBackWithBase + mmToThreeUnits(defaultDepthMm);
  const actualDepth = mmToThreeUnits(actualDepthMm);

  let bodyCenterZ: number;
  if (isFrontSpaceFurniture || isSideWallFurniture) {
    bodyCenterZ = module.position.z;
  } else if (isUpper) {
    bodyCenterZ = fixedBackWithoutBase + actualDepth / 2;
  } else if (isKitchenTall || isBackAlignedFull) {
    bodyCenterZ = lowerDir === 'back'
      ? fixedFrontWithBase - actualDepth / 2
      : fixedBackWithBase + actualDepth / 2;
  } else if (isLower) {
    const lowerBaseDepth = mmToThreeUnits(defaultDepthMm);
    const baseFrontZ = fixedBackWithBase + lowerBaseDepth;
    bodyCenterZ = lowerDir === 'back'
      ? baseFrontZ - actualDepth / 2
      : fixedBackWithBase + actualDepth / 2;
  } else if (isShoe) {
    const sameSectionDepth = Math.abs(lowerDepthMm - upperDepthMm) < 0.5;
    bodyCenterZ = sameSectionDepth && lowerDir === upperDir && lowerDir === 'back'
      ? fixedFrontWithBase - actualDepth / 2
      : fixedBackWithBase + actualDepth / 2;
  } else {
    bodyCenterZ = fixedFrontWithBase - actualDepth / 2;
    const usesUnifiedSectionDepthDirection = lowerDir === upperDir
      && Math.abs(lowerDepthMm - actualDepthMm) < 0.5
      && Math.abs(upperDepthMm - actualDepthMm) < 0.5;
    if (usesUnifiedSectionDepthDirection && lowerDir === 'front') {
      const isUsingCategoryDefaultDepth = categoryDefaultDepth !== undefined
        && Math.abs(actualDepthMm - categoryDefaultDepth) < 0.5;
      const baseDepthMm = isUsingCategoryDefaultDepth ? actualDepthMm : moduleDimDepthMm;
      bodyCenterZ -= mmToThreeUnits(baseDepthMm - actualDepthMm);
    }
  }

  const resolveSpan = (depthMm: number, direction: 'front' | 'back') => {
    const depth = mmToThreeUnits(depthMm);
    const depthDiff = actualDepth - depth;
    const localZ = depthDiff === 0 ? 0 : direction === 'back' ? depthDiff / 2 : -depthDiff / 2;
    const centerZ = bodyCenterZ + localZ;
    return {
      backZ: centerZ - depth / 2,
      frontZ: centerZ + depth / 2,
      centerZ,
      depthMm,
    };
  };

  return {
    bodyCenterZ,
    actualDepthMm,
    upper: resolveSpan(upperDepthMm, upperDir),
    lower: resolveSpan(lowerDepthMm, lowerDir),
  };
};

const isShoeCabinetDimensionModuleId = (moduleId?: string): boolean => {
  const id = moduleId || '';
  const key = id.replace(/-[\d.]+$/, '');
  return !id.includes('upper-cabinet-') && (
    id.includes('entryway') ||
    id.includes('shelf-split') ||
    id.includes('-4drawer-shelf-') ||
    id.includes('-2drawer-shelf-') ||
    /(^|-)shelf$/.test(key)
  );
};

const resolveShelfSplitTopDistanceMm = (
  mod: any,
  spaceInfo: SpaceInfo,
  effectiveHeightMm = spaceInfo.height
): number | null => {
  const sections = Array.isArray(mod?.customSections) ? mod.customSections : [];
  if (!mod?.moduleId?.includes('shelf-split') || sections.length < 2) return null;

  const baseDistance = mod.hasBase === false
    ? (mod.individualFloatHeight ?? 0)
    : (mod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
  const bodyTopMm = baseDistance + sections
    .slice(0, 2)
    .reduce((sum: number, section: any) => sum + (Number(section?.height) || 0), 0);
  return Math.max(0, Math.round(effectiveHeightMm - bodyTopMm));
};

const resolveTopFrameDistanceMm = (
  mod: any,
  spaceInfo: SpaceInfo,
  fallbackTopFrameMm: number,
  effectiveHeightMm = spaceInfo.height
): number => {
  const shelfSplitTopDistance = resolveShelfSplitTopDistanceMm(mod, spaceInfo, effectiveHeightMm);
  if (mod?.hasTopFrame === false) {
    return Math.max(0, Math.round(mod?.topFrameGap ?? shelfSplitTopDistance ?? 0));
  }
  return mod?.topFrameThickness ?? fallbackTopFrameMm;
};

const resolveShoeCabinetDoorFrontZ = (
  modules: PlacedModule[],
  panelDepthMm: number
): number | undefined => {
  const shoeModule = modules.find(mod => mod.hasDoor && isShoeCabinetDimensionModuleId(mod.moduleId));
  if (!shoeModule) return undefined;

  const furnitureDepthMm = Math.min(panelDepthMm, 600);
  const panelDepth = mmToThreeUnits(panelDepthMm);
  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
  const doorThickness = mmToThreeUnits(20);
  const zOffset = -panelDepth / 2;
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
  const rawDepthMm = shoeModule.customDepth
    ?? shoeModule.upperSectionDepth
    ?? shoeModule.lowerSectionDepth
    ?? 380;
  const actualDepthMm = shoeModule.moduleId?.includes('-entryway-') && Math.abs(rawDepthMm - 400) < 0.5
    ? 380
    : rawDepthMm;
  const depth = mmToThreeUnits(actualDepthMm);
  const backWallGapZ = mmToThreeUnits((shoeModule as any).backWallGap ?? 0);
  const furnitureZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + backWallGapZ + depth / 2;

  return furnitureZ + depth / 2 + doorThickness;
};

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
    // 개별 상단몰딩 두께 변경 시 보정
    if (mod.topFrameThickness !== undefined || mod.moduleId?.includes('shelf-split')) {
      const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
      heightMm -= (resolveTopFrameDistanceMm(mod, spaceInfo, globalTopFrame) - globalTopFrame);
    }
    if ((mod as any).hasTopFrame === false) {
      const topFrameMm = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30);
      const topGapMm = (mod as any).topFrameGap ?? 0;
      heightMm += (topFrameMm - topGapMm);
    }
    if ((mod as any).hasBase === false) {
      const globalBaseMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
      const absorbedBase = mod.baseFrameHeight ?? globalBaseMm;
      const floatH = (mod as any).individualFloatHeight ?? 0;
      heightMm += (absorbedBase - floatH);
    }
  } else if (category === 'upper' && mod.customHeight) {
    // 상부장 몸통 H 직접 입력: 자유배치여도 customHeight를 최우선 적용
    heightMm = mod.customHeight;
  } else if (mod.isFreePlacement && mod.freeHeight) {
    // 자유배치 상/하부장: freeHeight 고정
    heightMm = mod.freeHeight;
  } else {
    // 슬롯 기반
    const manualHeightMm = category === 'upper'
      ? (mod.customHeight || mod.freeHeight)
      : (mod.freeHeight || mod.customHeight);
    // cabinetBodyHeight가 있으면 2단서랍장 몸통 높이 오버라이드 (FurnitureItem.tsx와 동기화)
    if (mod.cabinetBodyHeight && (mod.moduleId.includes('lower-drawer-2tier') || mod.moduleId.includes('dual-lower-drawer-2tier'))) {
      heightMm = mod.cabinetBodyHeight;
    } else if (manualHeightMm) {
      // 표준 모듈 수동 높이 변경: FurnitureItem에서 freeHeight로 moduleData.height를 오버라이드하는 것과 동일 기준
      heightMm = manualHeightMm;
    } else {
      heightMm = moduleData?.dimensions.height || 0;
    }
    if (!mod.isFreePlacement && heightMm > 0) {
      if (isTall && (mod.topFrameThickness !== undefined || mod.moduleId?.includes('shelf-split'))) {
        const globalTop = spaceInfo.frameSize?.top ?? 30;
        heightMm -= (resolveTopFrameDistanceMm(mod, spaceInfo, globalTop) - globalTop);
      }
      if ((mod as any).hasTopFrame === false && isTall) {
        const topFrameMm = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30);
        const topGapMm = (mod as any).topFrameGap ?? 0;
        heightMm += (topFrameMm - topGapMm);
      }
      if (mod.baseFrameHeight !== undefined && !isStandType && isTall) {
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

  // 인출장/팬트리장/의류장: hasBase=false → 가구가 걸래받이 자리 흡수 (FurnitureItem.tsx와 동일)
  const isPullOutOrPantry = !!(mod.moduleId?.includes('pull-out-cabinet') || mod.moduleId?.includes('pantry-cabinet'));
  const isClothingCabinet = !!(
    mod.moduleId?.includes('2drawer-hanging') ||
    mod.moduleId?.includes('2hanging') ||
    mod.moduleId?.includes('4drawer-hanging')
  );
  if (!mod.isFreePlacement && (mod as any).hasBase === false && isTall && (isPullOutOrPantry || isClothingCabinet)) {
    const globalBaseMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
    const absorbedBase = mod.baseFrameHeight ?? globalBaseMm;
    const floatH = (mod as any).individualFloatHeight ?? 0;
    heightMm += (absorbedBase - floatH);
    // 인출장/팬트리장은 바닥마감재도 흡수
    if (floorFinishH > 0) {
      heightMm += floorFinishH;
    }
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
  viewDirection?: 'left' | 'right',
  spaceInfo?: SpaceInfo
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

  const moduleId = module.moduleId || moduleData?.id || '';
  const isPlainShelf = /(^|-)(?:single|dual)-shelf-/.test(moduleId) &&
    !moduleId.includes('-4drawer-shelf-') &&
    !moduleId.includes('-2drawer-shelf-') &&
    !moduleId.includes('shelf-split');
  const isShelfSplit = moduleId.includes('shelf-split');
  if (spaceInfo && (isPlainShelf || isShelfSplit) && rawSections.length === 2) {
    const rawLower = rawSections[0];
    const lowerOrig = rawLower.heightType === 'percentage'
      ? Math.round(internalHeightMm * ((rawLower.height ?? 0) / 100))
      : (rawLower.height ?? 0);
    const globalBaseForShelf = spaceInfo.baseConfig?.type === 'floor'
      ? (spaceInfo.baseConfig?.height ?? 60)
      : 0;
    const baseAbsorbedMm = !isShelfSplit && (module as any).hasBase === false
      ? globalBaseForShelf
      : 0;
    const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand'
      && spaceInfo.baseConfig?.placementType === 'float';
    const globalFloatMm = isFloatPlacement ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
    const floatAbsorbedMm = isShelfSplit
      ? 0
      : (module as any).hasBase === false
      ? Math.max(0, (module as any).individualFloatHeight ?? 0)
      : globalFloatMm;
    const baseFrameDeltaMm = 0;
    const lowerHeightMm = Math.min(
      Math.max(0, Math.round(internalHeightMm)),
      Math.max(0, Math.round(lowerOrig + baseAbsorbedMm - floatAbsorbedMm - baseFrameDeltaMm))
    );
    const remainingUpperHeightMm = Math.max(0, Math.round(internalHeightMm - lowerHeightMm));
    const upperHeightMm = isShelfSplit && Array.isArray((module as any).customSections)
      ? Math.min(remainingUpperHeightMm, Math.max(0, Math.round(rawSections[1]?.height ?? 0)))
      : remainingUpperHeightMm;

    return {
      sections: rawSections,
      heightsMm: [lowerHeightMm, upperHeightMm],
      basicThicknessMm
    };
  }

  // useBaseFurniture.ts(line 112-157)와 동일한 방식:
  // shelving.ts에서 sections 합 = dimensions.height (판재 두께 포함)
  // 일반 가구: 하부 섹션 고정, 마지막(상부) 섹션이 높이 차이를 흡수
  // 신발장(현관장 H/선반장): 첫(하부) 섹션이 흡수, 상부 섹션 고정
  const modIdForAbsorb = moduleId;
  const isShoeAbsorb = modIdForAbsorb.includes('-entryway-') ||
    modIdForAbsorb.includes('-shelf-') ||
    modIdForAbsorb.includes('-4drawer-shelf-') ||
    modIdForAbsorb.includes('-2drawer-shelf-');
  const absorbIdx = isShoeAbsorb ? 0 : rawSections.length - 1;

  let heightsMm: number[];

  const hasCalculatedHeights = rawSections.every(section => typeof (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight === 'number');

  if (hasCalculatedHeights && rawSections.length > 0) {
    const calcHeights = rawSections.map(section => {
      const calc = (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight;
      return Math.max(calc ?? 0, 0);
    });
    const calcTotal = calcHeights.reduce((sum, h) => sum + h, 0);
    if (Math.abs(calcTotal - internalHeightMm) > 1 && rawSections.length > 1) {
      const fixedSum = calcHeights.reduce((s, h, i) => i === absorbIdx ? s : s + h, 0);
      calcHeights[absorbIdx] = Math.max(0, internalHeightMm - fixedSum);
    }
    heightsMm = calcHeights;
  } else {
    const fixedSum = rawSections.reduce((s, section, i) =>
      i === absorbIdx ? s : s + (section.height ?? 0), 0);
    const absorbingNewHeight = Math.max(0, internalHeightMm - fixedSum);

    heightsMm = rawSections.map((section, idx) => {
      if (idx === absorbIdx) return absorbingNewHeight;
      return section.height ?? 0;
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
  stoneTopThicknessMm: number = 20,
  customMaidaHeights?: number[],
  hasTopEndPanel?: boolean,
): { maidaHeightMm: number; maidaBottomMm: number; maidaTopMm: number }[] | null => {
  // 하부장 서랍/마이다 모듈만 처리
  const isLowerDrawer = moduleId.includes('lower-drawer-');
  const isLowerDoorLift = moduleId.includes('lower-door-lift-');
  const isLowerTopDown = moduleId.includes('lower-top-down-');
  const isInduction = moduleId.includes('lower-induction-cabinet') || moduleId.includes('dual-lower-induction-cabinet');

  // 인덕션장: H 변경 시 '상단 마이다(빨간 박스 영역)'는 크기 고정으로 위/아래 평행이동
  //  - 상단갭 20mm, 마이다 사이 갭 3mm 고정
  //  - 마이다2 외경 높이 = 427 (H=785 기준 상수: 785 - 20[상단갭] - 338[하단 묶음])
  //  - 마이다1 높이 = 총 외경 - 마이다2 - 3(갭) → H 변화는 마이다1이 흡수
  if (isInduction) {
    const defaultDTG = -20;
    const defaultDBG = 5;
    const gapTopExt = doorTopGap - defaultDTG;
    const gapBottomExt = doorBottomGap - defaultDBG;
    const gapMm = 3;
    const FIXED_MAIDA2_H = 427; // 상단 마이다 높이 고정 (H=785 기준 상수)
    // 마이다2 (상단): 위치만 H에 연동, 크기는 FIXED_MAIDA2_H + 상단/하단 갭 확장 반영
    const maida2H = Math.max(0, FIXED_MAIDA2_H + gapTopExt);
    const maida2Top = moduleHeightMm - 20 + gapTopExt;
    const maida2Bottom = maida2Top - maida2H;
    // 마이다1 (하단): 마이다2 아래 3mm 갭 이후부터 캐비넷 하단(-5 - bottomExt)까지 (= H 변화 흡수)
    const maida1Top = maida2Bottom - gapMm;
    const maida1Bottom = -5 - gapBottomExt;
    const maida1H = Math.max(0, maida1Top - maida1Bottom);
    return [
      { maidaHeightMm: maida1H, maidaBottomMm: maida1Bottom, maidaTopMm: maida1Top },
      { maidaHeightMm: maida2H, maidaBottomMm: maida2Bottom, maidaTopMm: maida2Top },
    ];
  }

  if (!isLowerDrawer && !isLowerDoorLift && !isLowerTopDown) return null;

  // 터치 변형 (도어올림터치 / 상판내림터치): LowerCabinet.tsx line 758-800과 동일한 비례 계산
  const isDoorLiftTouch = moduleId.includes('lower-door-lift-touch-');
  const isTopDownTouch = moduleId.includes('lower-top-down-touch-');
  if (isDoorLiftTouch || isTopDownTouch) {
    const isTouch2A = moduleId.includes('lower-door-lift-touch-2tier-a');
    const isTouch2B = moduleId.includes('lower-door-lift-touch-2tier-b');
    const isTouch3 = moduleId.includes('lower-door-lift-touch-3tier');
    const isTDTouch2 = moduleId.includes('lower-top-down-touch-2tier');
    const isTDTouch3 = moduleId.includes('lower-top-down-touch-3tier');
    // 마이다 비례: 2B는 2A와 동일하게 [228, 228] 사용 (서랍 본체 높이만 다름)
    const drawerHeights = isTouch2A ? [228, 228]
      : isTouch2B ? [228, 228]
      : isTouch3 ? [228, 117, 117]
      : isTDTouch2 ? [228, 228]
      : isTDTouch3 ? [164, 117, 117]
      : [228, 228];

    // 상판내림 터치: 가로전대 높이 stoneThickness별로 다름 (10→65, 20→55, 30→45)
    // 마이다 최상단 = 캐비넷상단 - (stretcher + 25)  ← 실측 보정 +5
    // doorTopGap/doorBottomGap 변경은 3D 렌더링과 동일하게 마이다 치수에도 반영한다.
    const tdTouchStretcherH = stoneTopThicknessMm === 10 ? 65 : stoneTopThicknessMm === 30 ? 45 : 55;
    const defaultTopExtMm = isTopDownTouch ? -(tdTouchStretcherH + 25) : 30;
    const defaultBottomExtMm = 5;
    const topExtMm = isTopDownTouch ? (doorTopGap ?? defaultTopExtMm) : doorTopGap;
    const bottomExtMm = doorBottomGap;
    const gapTopExt = topExtMm - defaultTopExtMm;
    const gapBottomExt = bottomExtMm - defaultBottomExtMm;
    const totalFrontMm = moduleHeightMm + topExtMm + bottomExtMm;
    const gapMm = 3;
    const drawerCount = drawerHeights.length;
    const totalGaps = (drawerCount - 1) * gapMm;
    const totalMaidaMm = totalFrontMm - totalGaps;
    const totalDrawerH = drawerHeights.reduce((a, b) => a + b, 0);
    // 도어올림 터치 2단(2A/2B): 하→상 [408, 409] 고정
    // 도어올림 터치 3단: 하→상 [360, 227, 227] 고정
    // 상판내림 터치 2단: 하→상 [353, 354] 고정
    // 상판내림 터치 3단: 하→상 [284, 210, 210] 고정
    const isDoorLift2Fixed = drawerCount === 2 && (isTouch2A || isTouch2B);
    const isDoorLift3Fixed = drawerCount === 3 && isTouch3;
    const isTopDown2Fixed = drawerCount === 2 && isTDTouch2;
    const isTopDown3Fixed = drawerCount === 3 && isTDTouch3;
    // 사용자가 가구 편집 팝업에서 지정한 customMaidaHeights 우선 사용
    const cmhValid = customMaidaHeights
      && customMaidaHeights.length === drawerHeights.length
      && customMaidaHeights.every(v => typeof v === 'number' && v > 0);
    const baseMaidaHeightsMm = cmhValid
      ? [...customMaidaHeights!]
      : (isDoorLift2Fixed
        ? [408, 409]
        : isDoorLift3Fixed
          ? [360, 227, 227]
          : isTopDown2Fixed
            ? [353, 354]
            : isTopDown3Fixed
              ? [185, 240, 240]
              : drawerHeights.map(h => (h / totalDrawerH) * totalMaidaMm));
    const maidaHeightsMm = [...baseMaidaHeightsMm];
    if (!isTopDownTouch && maidaHeightsMm.length > 0) {
      maidaHeightsMm[0] = Math.max(0, maidaHeightsMm[0] + gapBottomExt);
      const topIndex = maidaHeightsMm.length - 1;
      maidaHeightsMm[topIndex] = Math.max(0, maidaHeightsMm[topIndex] + gapTopExt);
    }
    // 도어올림 터치 2A/2B + 상판내림 터치 2단: 1단·2단 마이다 균등 분배 (정수, 도어 갭 3 + 상단 20 + 하단 5 유지)
    //   ※ customMaidaHeights 있으면 사용자 입력값 보존 → 스킵
    if (!cmhValid && (isDoorLift2Fixed || isTopDown2Fixed) && maidaHeightsMm.length === 2) {
      const total = Math.max(0, totalFrontMm - gapMm);
      const evenH = Math.floor(total / 2);
      maidaHeightsMm[0] = evenH;
      maidaHeightsMm[1] = evenH;
    }
    // 도어올림 터치 3단: 맨아래(3단·maida0) 360 고정, 위 2개(1·2단) 균등 분배
    //   ※ customMaidaHeights 있으면 사용자 입력값 보존 → 스킵
    if (!cmhValid && isDoorLift3Fixed && maidaHeightsMm.length === 3) {
      const bottomFixed = 360;
      maidaHeightsMm[0] = bottomFixed;
      const remaining = Math.max(0, totalFrontMm - bottomFixed - gapMm * 2);
      const evenH = Math.floor(remaining / 2);
      maidaHeightsMm[1] = evenH;
      maidaHeightsMm[2] = evenH;
    }
    // 상판내림 터치(2단/3단) + 도어올림 터치 2A/2B/3: 상단 마이다 묶음(맨 위 마이다들 + 사이 갭 3mm)은 크기 고정,
    // 마이다 묶음을 캐비넷 상단에서 아래로 채워 내림. 맨 아래(maida0)가 남은 공간 흡수.
    if ((isTopDown2Fixed || isTopDown3Fixed || isDoorLift2Fixed || isDoorLift3Fixed) && maidaHeightsMm.length >= 2) {
      const lastIdx = maidaHeightsMm.length - 1;
      const topPositionMm = -bottomExtMm + totalFrontMm; // 마이다 묶음 끝 (캐비넷 바닥 기준)
      const result: { maidaHeightMm: number; maidaBottomMm: number; maidaTopMm: number }[] = new Array(maidaHeightsMm.length);
      let cursorTop = topPositionMm;
      for (let i = lastIdx; i >= 1; i--) {
        const h = maidaHeightsMm[i];
        const bottomMm = cursorTop - h;
        result[i] = { maidaHeightMm: h, maidaBottomMm: bottomMm, maidaTopMm: cursorTop };
        cursorTop = bottomMm - gapMm;
      }
      // 3단(맨 아래) 마이다는 항상 자동 흡수 (LowerCabinet과 동일)
      //   하단 = -bottomExtMm (가구 본체 바닥, 도어 하단갭 늘면 아래로 확장)
      //   상단 = cursorTop (1·2단 묶음 끝)
      const bottomStart = -bottomExtMm;
      const newMaida0H = Math.max(0, cursorTop - bottomStart);
      result[0] = { maidaHeightMm: newMaida0H, maidaBottomMm: bottomStart, maidaTopMm: bottomStart + newMaida0H };
      return result;
    }

    // 그 외(도어올림 터치 등) - 기존 방식: 캐비넷 하단부터 위로 누적
    let currentBottomMm = -bottomExtMm;
    return maidaHeightsMm.map(h => {
      const maidaBottom = currentBottomMm;
      const maidaTop = maidaBottom + h;
      currentBottomMm += h + gapMm;
      return { maidaHeightMm: h, maidaBottomMm: maidaBottom, maidaTopMm: maidaTop };
    });
  }

  const is3Tier = moduleId.includes('lower-drawer-3tier');
  // 3단 서랍장 H 변경 동작: 상단 묶음(마이다3 + 노치2갭 + 마이다2 + 노치1갭 + 상단갭) 크기 고정,
  //   캐비넷 상단에 붙어 평행 이동. H 변화는 하단 마이다1이 흡수.
  //   H=785 기준 상수: 마이다1 외경 H=340 → 마이다1Top(335) → 노치1 295~360, 노치2 510~575
  //   상단 묶음 총 외경 = 430 (마이다3 195 + 마이다2 195 + 2*갭18 + 4(반올림) → 측면상 평행이동 유지)
  if (is3Tier && !moduleId.includes('-touch-')) {
    const defaultDTG_3t = -20;
    const defaultDBG_3t = 5;
    const gapTopExt_3t = doorTopGap - defaultDTG_3t;
    const gapBottomExt_3t = doorBottomGap - defaultDBG_3t;
    const MAIDA_TOP_H = 195;       // 마이다3 외경
    const MAIDA_MID_H = 195;       // 마이다2 외경
    const NOTCH_H = 65;
    const TOP_NOTCH_H = 60;
    // H=785 기준: 노치2 510~575, 노치1 295~360
    // 상단 묶음 = 노치1 하단(295) ~ 캐비넷 상단(785) = 490
    // 마이다1 외경 = 340 (고정), 마이다1 끝(335) 위로 노치1 갭, 그 다음 마이다2 시작
    // H가 늘면 노치1·노치2·상단노치 모두 위로 같은 양 평행 이동
    const delta = moduleHeightMm - 785;
    const notch1FromBottom_3t = 295 + delta;
    const notch2FromBottom_3t = 510 + delta;
    const topNotchFromBottom_3t = moduleHeightMm - TOP_NOTCH_H;
    // 마이다1 (하단): -5 ~ (notch1 + 40), H 변화 흡수
    const maida1Bottom_3t = -5 - gapBottomExt_3t;
    const maida1Top_3t = notch1FromBottom_3t + 40;
    const maida1H_3t = Math.max(0, maida1Top_3t - maida1Bottom_3t);
    // 마이다2 (중간): (notch1.top - 5) ~ (notch2 + 40), 외경 195 유지
    const maida2Bottom_3t = (notch1FromBottom_3t + NOTCH_H) - 5;
    const maida2Top_3t = notch2FromBottom_3t + 40;
    const maida2H_3t = Math.max(0, maida2Top_3t - maida2Bottom_3t);
    // 마이다3 (상단): (notch2.top - 5) ~ (topNotch + 40), 외경 195 유지 + 상단갭 확장
    const maida3Bottom_3t = (notch2FromBottom_3t + NOTCH_H) - 5;
    const maida3Top_3t = topNotchFromBottom_3t + 40 + gapTopExt_3t;
    const maida3H_3t = Math.max(0, maida3Top_3t - maida3Bottom_3t);
    return [
      { maidaHeightMm: maida1H_3t, maidaBottomMm: maida1Bottom_3t, maidaTopMm: maida1Top_3t },
      { maidaHeightMm: maida2H_3t, maidaBottomMm: maida2Bottom_3t, maidaTopMm: maida2Top_3t },
      { maidaHeightMm: maida3H_3t, maidaBottomMm: maida3Bottom_3t, maidaTopMm: maida3Top_3t },
    ];
  }
  const isDoorLift3Tier = moduleId.includes('lower-door-lift-3tier');
  const isDoorLift2Tier = moduleId.includes('lower-door-lift-2tier');
  const isTopDown3Tier = moduleId.includes('lower-top-down-3tier');
  const isTopDown2Tier = moduleId.includes('lower-top-down-2tier');

  // LowerCabinet.tsx line 349-350과 동일 (2단서랍장은 동적 계산)
  const drawer2TierFromBottom = (moduleHeightMm - 125) / 2;
  // 도어올림 2단 반통: 몸통 H 변경 시 도어/노치 동적 스케일링 (LowerCabinet.tsx와 동기화)
  // 노치 65, 도어갭 20 고정. notch=(H-75)/2, maida=notch+45 (도어갭 20mm 보존)
  // 정수 반올림으로 0.5 단위 방지. maida를 notch에서 파생시켜 도어갭 일관성 보장
  const doorLift2TierNotch = Math.max(0, Math.round((moduleHeightMm - 75) / 2));
  const doorLift2TierMaidaH = Math.max(0, doorLift2TierNotch + 45);
  // 도어올림 3단: 아래 도어(360) 고정, 위 2개 도어만 균등하게 H 변경 흡수
  // notch1=315(고정), notch2=(H+305)/2, 도어=[360, (H-365)/2, (H-365)/2]
  // (H=785 기준: notch=[315,545], 도어=[360,210,210])
  const doorLift3TierUpperMaidaH = Math.max(0, Math.round((moduleHeightMm - 365) / 2));
  const doorLift3TierNotch2 = Math.max(380, doorLift3TierUpperMaidaH + 335);
  // 어제 저녁(e98ecfb44) 복원: 상판내림 2단 측판 노치는 [300, 665] 하드코딩 (대리석 두께 영향 X)
  // 상판내림 3단: H 변경 + stoneThickness별 stretcher 변화 노치 위치 동적 계산
  //   - H 변화 (delta): 마이다1만 흡수, 노치 전체 평행이동
  //   - stretcher (10→65/20→55/30→45) 변화량 stretcherDelta:
  //     stretcherDelta>0 (10mm) → 노치 아래로 (fromBottom 감소)
  //     stretcherDelta<0 (30mm) → 노치 위로 (fromBottom 증가)
  const td3TierDeltaDim = moduleHeightMm - 785;
  const td3StretcherForDim = stoneTopThicknessMm === 10 ? 65 : stoneTopThicknessMm === 30 ? 45 : 55;
  const td3StretcherDeltaForDim = td3StretcherForDim - 55;
  const notchFromBottoms = is3Tier
    ? [295, 510]
    : isDoorLift3Tier ? [315, doorLift3TierNotch2]
    : isDoorLift2Tier ? [doorLift2TierNotch]
    : isTopDown3Tier ? [225 + td3TierDeltaDim - td3StretcherDeltaForDim, 445 + td3TierDeltaDim - td3StretcherDeltaForDim, 665 + td3TierDeltaDim - td3StretcherDeltaForDim]
    : isTopDown2Tier ? [Math.round((moduleHeightMm + stoneTopThicknessMm - 20 - 185) / 2), moduleHeightMm - (td3StretcherForDim + 65)]
    : [drawer2TierFromBottom];
  const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : isTopDown3Tier ? [65, 65, 65] : isTopDown2Tier ? [65, 65] : [65];
  const hideTopNotch = isDoorLift2Tier || isDoorLift3Tier || isTopDown2Tier || isTopDown3Tier;
  const fixedMaidaHeights = isDoorLift2Tier ? [doorLift2TierMaidaH, doorLift2TierMaidaH] : isDoorLift3Tier ? [360, doorLift3TierUpperMaidaH, doorLift3TierUpperMaidaH] : undefined;
  // 실제 서랍 개수 (ExternalDrawerRenderer drawerCount와 동일)
  const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : 2;

  // 모듈별 기본 doorTopGap/doorBottomGap (LowerCabinet.tsx line 379-381)
  // 상판내림 2/3단: stoneThk별 기본 갭(10→-90, 20→-80, 30→-70)로 마이다 사이즈 stoneThk 무관 유지
  const topDownDefaultTopGap = hasTopEndPanel ? -82 : stoneTopThicknessMm === 10 ? -90 : stoneTopThicknessMm === 30 ? -70 : -80;
  const defaultDoorTopGap = isTopDown2Tier || isTopDown3Tier ? topDownDefaultTopGap : isDoorLift2Tier || isDoorLift3Tier ? 30 : -20;
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
  // hideTopNotch일 때 마지막 노치 위 남은 공간을 추가 zone으로 생성
  // 단, zone이 이미 drawerCount만큼 있으면 추가하지 않음 (ExternalDrawerRenderer와 동일)
  // 상판내림: 마지막 노치 위 55mm는 전대+상판 영역이지 서랍 zone이 아님
  if (cursor < moduleHeightMm && zones.length < drawerCount) {
    const lastNotch = allNotches[allNotches.length - 1];
    zones.push({
      bottomMm: cursor,
      topMm: moduleHeightMm,
      notchAboveBottom: moduleHeightMm,
      notchBelowTop: lastNotch ? (lastNotch.fromBottom + lastNotch.height) : null,
    });
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
    const maidaH = fixedMaidaHeights?.[i] != null
      ? fixedMaidaHeights[i] + gapTopExt + gapBottomExt
      : defaultMaidaH;
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
  // 상판 실효 두께 — 하부장 상판설치는 인조대리석 선택값만 사용
  const _stoneTopThk = (mod: any) => getStoneTopThicknessMm(mod);
  const _lowerTopFinishThk = (mod: any) => getLowerTopFinishThicknessMm(mod);
  const placedModulesStore = useFurnitureStore(state => state.placedModules);
  const { view2DDirection, showDimensions: showDimensionsFromStore, view2DTheme, selectedSlotIndex, showFurniture, doorGapDisplayMode } = useUIStore();
  const { zones } = useDerivedSpaceStore();
  const placedModules = useMemo(
    () => (showFurniture ? placedModulesStore : []),
    [placedModulesStore, showFurniture]
  );

  const getLowerTopFinishThicknessForModule = (mod: PlacedModule): number => {
    const direct = getLowerTopFinishThicknessMm(mod);
    if (direct > 0) return direct;

    const candidates = placedModulesStore.filter(candidate => {
      if (candidate.isSurroundPanel) return false;
      if (getModuleCategory(candidate as PlacedModule) !== 'lower') return false;
      if (candidate.id === mod.id) return true;
      if (mod.slotIndex !== undefined && candidate.slotIndex !== undefined) {
        const candidateGlobalSlot = candidate.slotIndex;
        const modGlobalSlot = mod.slotIndex;
        return candidate.isDualSlot
          ? (candidateGlobalSlot === modGlobalSlot || candidateGlobalSlot + 1 === modGlobalSlot)
          : candidateGlobalSlot === modGlobalSlot;
      }
      return Math.abs((candidate.position?.x ?? 0) - (mod.position?.x ?? 0)) < 0.01;
    });

    return candidates.reduce((max, candidate) => {
      return Math.max(max, getLowerTopFinishThicknessMm(candidate));
    }, 0);
  };

  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;

  // 2D 도면 치수 색상
  const dimensionColor = view2DTheme === 'light' ? '#000000' : '#FFFFFF';
  const textColor = dimensionColor;
  const getThemeColorFromCSS = () => {
    if (typeof window === 'undefined') return '#10b981';
    return getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim() || '#10b981';
  };
  const doorDimensionColor = getThemeColorFromCSS();

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

  const isFreePlacementMode = spaceInfo.layoutMode === 'free-placement' || spaceInfo.customGuideMode === true;

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

  // 치수 텍스트 크기 통일 (CleanCAD2D와 동일: 2D = 0.4)
  const largeFontSize = 0.4;
  const smallFontSize = 0.4;

  // 치수선 오프셋
  const leftDimOffset = mmToThreeUnits(400);
  const rightDimOffset = mmToThreeUnits(400);

  // 측면뷰에서 표시할 가구 필터링 (PlacedFurnitureContainer.tsx와 동일한 유틸 사용)
  const getVisibleFurnitureForSideView = () => {
    if (placedModules.length === 0) return [];
    return filterSideViewModules({
      placedModules: placedModules as PlacedModule[],
      viewDirection: currentViewDirection,
      selectedSlotIndex,
      isFreePlacement: isFreePlacementMode,
      spaceInfo,
      zones,
      excludeSurroundPanels: true,
    });
  };

  const visibleFurniture = getVisibleFurnitureForSideView();

  // 선택된 가구의 개별 프레임 값 우선 사용 (자유배치/슬롯 공통)
  // 하부장/키큰장 우선 선택 — 받침대·걸래받이 치수의 기준이 되어야 함
  const selectedMod = (() => {
    if (visibleFurniture.length === 0) return undefined;
    const lowerOrFull = visibleFurniture.find(m => {
      const cat = getModuleCategory(m as PlacedModule);
      return cat === 'lower' || cat === 'full';
    });
    return (lowerOrFull ?? visibleFurniture[0]) as PlacedModule;
  })();
  const topFrameHeightMm = selectedMod
    ? resolveTopFrameDistanceMm(selectedMod, spaceInfo, globalTopFrameHeightMm)
    : globalTopFrameHeightMm;
  const topFrameHeight = mmToThreeUnits(topFrameHeightMm);
  // 개별 가구 hasBase/individualFloatHeight 반영 (FurnitureItem.tsx 1392-1395와 동기화)
  const modHasBaseOff = selectedMod?.hasBase === false && !isStandType;
  const railOrBaseHeightMm = modHasBaseOff
    ? 0  // 걸래받이 OFF → 받침대 0
    : (selectedMod?.baseFrameHeight !== undefined && !isStandType)
      ? selectedMod.baseFrameHeight
      : globalRailOrBaseHeightMm;
  const indivFloatMm = modHasBaseOff ? (selectedMod?.individualFloatHeight ?? 0) : 0;
  const railOrBaseHeight = mmToThreeUnits(railOrBaseHeightMm);

  // per-furniture 받침대/치수 변수
  const baseFrameHeightMm = isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm);
  const baseFrameGapMm = (!isFloating && !modHasBaseOff && baseFrameHeightMm > 0)
    ? Math.max(0, Math.min(baseFrameHeightMm, selectedMod?.baseFrameGap ?? (spaceInfo.baseConfig as any)?.gap ?? 0))
    : 0;
  const baseFrameDisplayMm = Math.max(0, baseFrameHeightMm - baseFrameGapMm);
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);
  const floorFinishY = isFloating ? 0 : mmToThreeUnits(floorFinishHeightMm);
  const furnitureBaseY = (isFloating ? floatHeight : baseFrameHeight) + floorFinishY;
  const getEffectiveDoorSpaceHeightMm = (mod: PlacedModule) => {
    if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled && mod.zone === 'dropped') {
      return spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
    }
    if (spaceInfo.droppedCeiling?.enabled && (mod.zone === 'dropped' || isSelectedSlotInDroppedZone)) {
      return spaceInfo.height - (spaceInfo.droppedCeiling.dropHeight || 0);
    }
    return spaceInfo.height;
  };

  const getModuleCabinetBottomAbsMm = (mod: PlacedModule, category: string) => {
    const isInsertFrame = typeof mod.moduleId === 'string' && mod.moduleId.includes('insert-frame');
    const hasBaseOff = !isInsertFrame && mod.hasBase === false;
    if (isFloating) return floatHeightMm;
    const isLowerModule = category === 'lower' || mod.moduleId?.startsWith('lower-') || mod.moduleId?.includes('-lower-');
    const baseMm = spaceInfo.baseConfig?.type === 'stand'
      ? 0
      : hasBaseOff
        ? 0
        : (mod.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? (isLowerModule ? 105 : 60));
    const individualFloatMm = hasBaseOff ? (mod.individualFloatHeight ?? 0) : 0;
    return floorFinishHeightMm + baseMm + individualFloatMm;
  };

  const resolveDoorBounds = (
    mod: PlacedModule,
    modData: NonNullable<ReturnType<typeof getModuleById>>,
    category: string
  ) => {
    const effectiveH = getEffectiveDoorSpaceHeightMm(mod);
    const doorTopGapVal = mod.doorTopGap ?? spaceInfo.doorTopGap ?? 0;
    const doorBottomGapVal = mod.doorBottomGap ?? spaceInfo.doorBottomGap ?? 0;
    const effectiveDoorBottomGapVal = doorBottomGapVal;

    if (category === 'upper') {
      const cabinetH = mod.customHeight ?? mod.freeHeight ?? modData.dimensions.height ?? 600;
      const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH);
      const cabinetTopAbs = effectiveH - topFrameVal;
      const cabinetBottomAbs = cabinetTopAbs - cabinetH;
      const doorTopAbsMm = cabinetTopAbs + doorTopGapVal;
      const doorBottomAbsMm = cabinetBottomAbs - doorBottomGapVal;
      return {
        doorBottomAbsMm,
        doorTopAbsMm,
        doorHeightMm: Math.max(0, doorTopAbsMm - doorBottomAbsMm),
        cabinetBottomAbsMm: cabinetBottomAbs,
        cabinetTopAbsMm: cabinetTopAbs,
        cabinetHeightMm: cabinetH,
      };
    }

    const cabinetH = category === 'lower'
      ? (mod.customHeight ?? mod.freeHeight ?? modData.dimensions.height ?? 1000)
      : computeFurnitureHeightMm(mod, modData, spaceInfo, internalSpace);
    const cabinetBottomAbs = getModuleCabinetBottomAbsMm(mod, category);
    const isShelfSplitFull = category === 'full' && typeof modData.id === 'string' && modData.id.includes('shelf-split');
    if (isShelfSplitFull) {
      const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH);
      const topGapVal = Math.max(0, Math.round((mod as any).topFrameGap ?? 0));
      const cabinetTopAbs = (mod as any).hasTopFrame === false
        ? effectiveH - topGapVal
        : effectiveH - topFrameVal;
      const fixedCabinetH = Math.max(0, cabinetTopAbs - cabinetBottomAbs);
      const doorBottomAbsMm = cabinetBottomAbs - effectiveDoorBottomGapVal;
      const doorTopAbsMm = cabinetTopAbs + doorTopGapVal;
      return {
        doorBottomAbsMm,
        doorTopAbsMm,
        doorHeightMm: Math.max(0, doorTopAbsMm - doorBottomAbsMm),
        cabinetBottomAbsMm: cabinetBottomAbs,
        cabinetTopAbsMm: cabinetTopAbs,
        cabinetHeightMm: fixedCabinetH,
      };
    }

    if (category === 'lower') {
      const isTopDown = modData.id?.includes('lower-top-down-');
      if (isTopDown) {
        const effectiveTopDownTopGap = mod.doorTopGap ?? getTopDownDoorTopGap(mod.stoneTopThickness, mod.hasTopEndPanel === true);
        const effectiveTopDownBottomGap = mod.doorBottomGap ?? 5;
        const doorBottomAbsMm = cabinetBottomAbs - effectiveTopDownBottomGap;
        const doorTopAbsMm = cabinetBottomAbs + cabinetH + effectiveTopDownTopGap;
        return {
          doorBottomAbsMm,
          doorTopAbsMm,
          doorHeightMm: Math.max(0, doorTopAbsMm - doorBottomAbsMm),
          cabinetBottomAbsMm: cabinetBottomAbs,
          cabinetTopAbsMm: cabinetBottomAbs + cabinetH,
          cabinetHeightMm: cabinetH,
        };
      }
    }

    const doorBottomAbsMm = cabinetBottomAbs - effectiveDoorBottomGapVal;
    const doorTopAbsMm = cabinetBottomAbs + cabinetH + doorTopGapVal;
    return {
      doorBottomAbsMm,
      doorTopAbsMm,
      doorHeightMm: Math.max(0, doorTopAbsMm - doorBottomAbsMm),
      cabinetBottomAbsMm: cabinetBottomAbs,
      cabinetTopAbsMm: cabinetBottomAbs + cabinetH,
      cabinetHeightMm: cabinetH,
    };
  };

  const resolveSplitDoorBounds = (
    mod: PlacedModule,
    modData: NonNullable<ReturnType<typeof getModuleById>>,
    category: string
  ) => {
    const bounds = resolveDoorBounds(mod, modData, category);
    const isPantrySplit = modData.id.includes('pantry-cabinet-split');
    const defaultLowerSectionTopMm = isPantrySplit ? 1825 : 860;
    const customSections = (mod as any).customSections;
    const modelLowerSectionH = (modData.modelConfig?.sections?.[0] as any)?.height as number | undefined;
    const customLowerSectionH = customSections && customSections.length > 0 ? customSections[0].height : undefined;
    const sectionInfo = computeSectionHeightsInfo(mod, modData, bounds.cabinetHeightMm, undefined, spaceInfo);
    const lowerSectionTopMm = sectionInfo.heightsMm.length >= 2
      ? sectionInfo.heightsMm[0]
      : (typeof customLowerSectionH === 'number' && customLowerSectionH > 0)
        ? customLowerSectionH
        : (typeof modelLowerSectionH === 'number' && modelLowerSectionH > 0)
          ? modelLowerSectionH
          : defaultLowerSectionTopMm;
    const upperSectionTopMm = sectionInfo.heightsMm.length >= 2
      ? Math.min(bounds.cabinetHeightMm, sectionInfo.heightsMm[0] + sectionInfo.heightsMm[1])
      : bounds.cabinetHeightMm;
    const defaultLowerTopGap = isPantrySplit ? -2 : -40;
    const defaultUpperBottomGap = isPantrySplit ? -1 : 20;
    const lowerTopGap = typeof (mod as any).lowerDoorTopGap === 'number'
      ? ((mod as any).lowerDoorTopGap === (isPantrySplit ? 2 : 40) ? defaultLowerTopGap : (mod as any).lowerDoorTopGap)
      : defaultLowerTopGap;
	    const upperBottomGap = typeof (mod as any).upperDoorBottomGap === 'number'
	      ? (
	        (!isPantrySplit && (mod as any).upperDoorBottomGap === -20)
	          ? defaultUpperBottomGap
	          : (isPantrySplit && (mod as any).upperDoorBottomGap === 1 ? defaultUpperBottomGap : (mod as any).upperDoorBottomGap)
	      )
	      : defaultUpperBottomGap;
	    const lowerBottomGap = (mod as any).lowerDoorBottomGap ?? 0;
	    const shelfSplitDefaultUpperTopGap = !isPantrySplit
	      ? (spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false && (mod as any).hasTopFrame !== false ? -3 : 5)
	      : 0;
	    const upperTopGap = typeof (mod as any).upperDoorTopGap === 'number'
	      ? (mod as any).upperDoorTopGap
	      : !isPantrySplit && (mod.doorTopGap === undefined || mod.doorTopGap === 0 || mod.doorTopGap === 5 || mod.doorTopGap === -3)
	        ? shelfSplitDefaultUpperTopGap
	        : (mod.doorTopGap ?? spaceInfo.doorTopGap ?? 0);
    const lowerDoorTopFromBottom = lowerSectionTopMm + lowerTopGap;
    const lowerDoorBottomAbs = bounds.cabinetBottomAbsMm - lowerBottomGap;
    const lowerDoorTopAbs = bounds.cabinetBottomAbsMm + lowerDoorTopFromBottom;
    const upperDoorBottomAbs = bounds.cabinetBottomAbsMm + lowerSectionTopMm - upperBottomGap;
    const upperDoorTopAbs = bounds.cabinetBottomAbsMm + upperSectionTopMm + upperTopGap;
    const splitGapHeightMm = Math.max(0, upperDoorBottomAbs - lowerDoorTopAbs);
    const ceilingAbsMm = getEffectiveDoorSpaceHeightMm(mod);
    const topGapHeightMm = Math.max(0, ceilingAbsMm - upperDoorTopAbs);
    return {
      lower: {
        bottomAbsMm: lowerDoorBottomAbs,
        topAbsMm: lowerDoorTopAbs,
        heightMm: lowerDoorTopAbs - lowerDoorBottomAbs,
      },
      splitGap: {
        bottomAbsMm: lowerDoorTopAbs,
        topAbsMm: upperDoorBottomAbs,
        heightMm: splitGapHeightMm,
      },
      upper: {
        bottomAbsMm: upperDoorBottomAbs,
        topAbsMm: upperDoorTopAbs,
        heightMm: upperDoorTopAbs - upperDoorBottomAbs,
      },
      topGap: {
        bottomAbsMm: upperDoorTopAbs,
        topAbsMm: ceilingAbsMm,
        heightMm: topGapHeightMm,
      },
    };
  };

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
    if (selectedMod.topFrameThickness !== undefined || selectedMod.moduleId?.includes('shelf-split')) {
      adjustedInternalHeightMm -= (topFrameHeightMm - globalTopFrameHeightMm);
    }
    if (modHasBaseOff) {
      // hasBase=false → 가구 높이 유지 (FurnitureItem.tsx와 동일하게 높이 증가 제거)
    } else if (selectedMod.baseFrameHeight !== undefined && !isStandType) {
      adjustedInternalHeightMm -= (selectedMod.baseFrameHeight - globalRailOrBaseHeightMm);
    }
  }
  const internalHeight = mmToThreeUnits(adjustedInternalHeightMm);

  // 좌측뷰인 경우
  // 좌측뷰 연장선 시작점
  const leftExtStartZ = -spaceDepth/2 + mmToThreeUnits(70);
  const getVisibleTopGapMm = () => {
    const target = visibleFurniture.find(module => {
      const mod = module as PlacedModule;
      const cat = getModuleCategory(mod);
      return (cat === 'full' || cat === 'upper') && Number((mod as any).topFrameGap ?? 0) > 0;
    }) as PlacedModule | undefined;

    if (!target) return 0;
    return Math.min(displaySpaceHeightMm, Math.max(0, Math.round(Number((target as any).topFrameGap ?? 0))));
  };

  if (currentViewDirection === 'left') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 (공간 높이 - 바닥부터 시작) ===== */}
        {/* 단내림 구간이 선택된 경우 단내림 높이를 표시 */}
        {<group>
          {/* 보조 가이드 연장선 - 하단 */}
          <ExtLine points={[[0, 0, leftExtStartZ], [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 보조 가이드 연장선 - 상단 */}
          <ExtLine points={[[0, displaySpaceHeight, leftExtStartZ], [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 수직 치수선 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
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
            renderOrder={100001}
            depthTest={false}
            rotation={[0, -Math.PI / 2, Math.PI / 2]}
          >
            {displaySpaceHeightMm}
          </Text>
        </group>}

        {/* 상단갭: 좌측 치수 레벨에만 표시 */}
        {(() => {
          const topGapMm = getVisibleTopGapMm();
          if (topGapMm <= 0) return null;

          const gapTopY = displaySpaceHeight;
          const gapBottomY = mmToThreeUnits(displaySpaceHeightMm - topGapMm);
          const leftGapZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(350);

          return (
            <group>
              <ExtLine points={[[0, gapBottomY, leftExtStartZ], [0, gapBottomY, leftGapZ]]} color={dimensionColor} />
              <ExtLine points={[[0, gapTopY, leftExtStartZ], [0, gapTopY, leftGapZ]]} color={dimensionColor} />
              <NativeLine name="dimension_line" points={[[0, gapBottomY, leftGapZ], [0, gapTopY, leftGapZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <NativeLine name="dimension_line" points={[[-0.008, gapBottomY, leftGapZ], [0.008, gapBottomY, leftGapZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <NativeLine name="dimension_line" points={[[-0.008, gapTopY, leftGapZ], [0.008, gapTopY, leftGapZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <Text position={[0, (gapBottomY + gapTopY) / 2, leftGapZ - mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                {topGapMm}
              </Text>
            </group>
          );
        })()}

        {/* ===== 왼쪽 2단: 몸통 사이즈 (segment-based, 모든 카테고리) ===== */}
        {visibleFurniture.length > 0 && (() => {
          const leftInnerZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) + mmToThreeUnits(200);
          const leftInnerExtStartZ = leftExtStartZ;
          const effectiveH_l2 = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;

          const segments_l2: { bottomY: number; topY: number; heightMm: number; key: string; extStartZ?: number; upperModuleId?: string; currentHeightMm?: number }[] = [];
          // 도어 안쪽에 표시할 갭 치수 (상판 윗면~도어 상단)
          const innerGapSegments_l2: { bottomY: number; topY: number; heightMm: number; key: string }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            let moduleData = getModuleById(
              module.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!moduleData) {
              moduleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
            }
            if (!moduleData) return;

            const mod = module as PlacedModule;
            const modCat_l2 = getModuleCategory(mod);
            const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);

            let cabinetBottomMm: number;
            let cabinetTopMm: number;

            if (modCat_l2 === 'upper') {
              const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH_l2);
              cabinetTopMm = effectiveH_l2 - topFrameVal;
              cabinetBottomMm = cabinetTopMm - moduleHeightMm;
            } else {
              cabinetBottomMm = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              cabinetTopMm = cabinetBottomMm + moduleHeightMm;
            }
            const isShelfSplitFull = modCat_l2 === 'full' && typeof module.moduleId === 'string' && module.moduleId.includes('shelf-split');
            const cabinetHeightForDimMm = (() => {
              if (!isShelfSplitFull) return moduleHeightMm;
              const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH_l2);
              const topGapVal = Math.max(0, Math.round((mod as any).topFrameGap ?? topFrameVal));
              cabinetTopMm = (mod as any).hasTopFrame === false
                ? effectiveH_l2 - topGapVal
                : effectiveH_l2 - topFrameVal;
              return Math.max(0, cabinetTopMm - cabinetBottomMm);
            })();

            // 하부장 + 상판/상부 EP: 장 높이와 상부 마감 두께를 분리하여 표시
            const topFinishThicknessL2 = modCat_l2 === 'lower' ? getLowerTopFinishThicknessForModule(mod) : 0;

            // 2섹션 가구(의류장: 코트장/붙박이장B/D)는 섹션별로 분할하여 표시
            // 하부장/상부장은 단일 표시, full 카테고리만 섹션 분할 적용
            let didSplitSections = false;
            if (modCat_l2 === 'full') {
              const sectionInfo = computeSectionHeightsInfo(mod, moduleData, cabinetHeightForDimMm, 'left', spaceInfo);
              if (sectionInfo.heightsMm.length >= 2) {
                // 하부 → 상부 순서로 누적 쌓기
                let cursorMm = cabinetBottomMm;
                sectionInfo.heightsMm.forEach((hMm, sIdx) => {
                  const sBottom = cursorMm;
                  const sTop = cursorMm + hMm;
                  segments_l2.push({
                    bottomY: mmToThreeUnits(sBottom),
                    topY: mmToThreeUnits(sTop),
                    heightMm: Math.round(hMm),
                    key: `furniture-${moduleIndex}-sec${sIdx}`,
                  });
                  cursorMm = sTop;
                });
                didSplitSections = true;
              }
            }

            // 섹션 분할이 아니면 장 높이 세그먼트 1개 (상판 제외 순수 캐비넷 높이)
            if (!didSplitSections) {
              segments_l2.push({
                bottomY: mmToThreeUnits(cabinetBottomMm),
                topY: mmToThreeUnits(cabinetTopMm),
                heightMm: Math.round(cabinetHeightForDimMm),
                key: `furniture-${moduleIndex}`,
                // 상부장이면 미드웨이 편집 시 참조할 id/현재높이 기록
                upperModuleId: modCat_l2 === 'upper' ? mod.id : undefined,
                currentHeightMm: modCat_l2 === 'upper' ? cabinetHeightForDimMm : undefined,
              });
            }

            if (modCat_l2 === 'upper' && (mod as any).hasBottomEndPanel !== false) {
              segments_l2.push({
                bottomY: mmToThreeUnits(cabinetBottomMm - DEFAULT_BASIC_THICKNESS_MM),
                topY: mmToThreeUnits(cabinetBottomMm),
                heightMm: DEFAULT_BASIC_THICKNESS_MM,
                key: `upper-bottom-ep-${moduleIndex}`
              });
            }

            // 상판/상부 EP 두께 세그먼트 (인조대리석 상판과 동일 표기)
            if (topFinishThicknessL2 > 0) {
              segments_l2.push({
                bottomY: mmToThreeUnits(cabinetTopMm),
                topY: mmToThreeUnits(cabinetTopMm + topFinishThicknessL2),
                heightMm: topFinishThicknessL2,
                key: `lower-top-finish-${moduleIndex}`
              });
            }

            // 상부장/키큰장(full): 상단몰딩 치수 세그먼트 추가 (캐비넷 상단 ~ 몰딩 상단)
            if (modCat_l2 === 'upper' || modCat_l2 === 'full') {
              const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH_l2);
              const topGapVal = Math.min(topFrameVal, Math.max(0, Math.round((mod as any).topFrameGap ?? (spaceInfo.frameSize as any)?.topGap ?? 0)));
              const visibleTopFrameVal = mod.hasTopFrame === false ? 0 : Math.max(0, topFrameVal - topGapVal);
              if (visibleTopFrameVal > 0) {
                segments_l2.push({
                  bottomY: mmToThreeUnits(cabinetTopMm),
                  topY: mmToThreeUnits(effectiveH_l2 - topGapVal),
                  heightMm: Math.round(visibleTopFrameVal),
                  key: `upper-topframe-${moduleIndex}`
                });
              }
              if (mod.hasTopFrame !== false && topGapVal > 0) {
                segments_l2.push({
                  bottomY: mmToThreeUnits(effectiveH_l2 - topGapVal),
                  topY: mmToThreeUnits(effectiveH_l2),
                  heightMm: Math.round(topGapVal),
                  key: `upper-topgap-${moduleIndex}`
                });
              }
            }

            // 하부장: 뒷턱 치수만 (상판 두께는 몸통에 합산됨)
            if (modCat_l2 === 'lower') {
              const stoneThickness = _stoneTopThk(mod);
              const topFinishThickness = getLowerTopFinishThicknessForModule(mod);

              // 뒷턱 치수 (상판 위에 추가)
              if (stoneThickness > 0) {
                const backLipH = mod.stoneTopBackLip || 0;
                if (backLipH > 0) {
                  segments_l2.push({
                    bottomY: mmToThreeUnits(cabinetTopMm + topFinishThickness),
                    topY: mmToThreeUnits(cabinetTopMm + topFinishThickness + backLipH),
                    heightMm: backLipH,
                    key: `stone-backlip-${moduleIndex}`
                  });
                }
              }
            }
          });

          if (segments_l2.length === 0) return null;

          segments_l2.sort((a, b) => a.bottomY - b.bottomY);

          const allSegments_l2 = segments_l2;

          // 하부장의 받침대/바닥마감재도 표시
          const hasLower = visibleFurniture.some(m => getModuleCategory(m as PlacedModule) === 'lower' || getModuleCategory(m as PlacedModule) === 'full');

          return (
            <group>
              {allSegments_l2.map((seg) => {
                const segExtStartZ = seg.extStartZ !== undefined ? seg.extStartZ : leftInnerExtStartZ;
                return (
                <React.Fragment key={`l2-sec-${seg.key}`}>
                  <group>
                    <ExtLine points={[[0, seg.bottomY, segExtStartZ], [0, seg.bottomY, leftInnerZ]]} color={dimensionColor} />
                    <ExtLine points={[[0, seg.topY, segExtStartZ], [0, seg.topY, leftInnerZ]]} color={dimensionColor} />
                    <NativeLine name="dimension_line"
                      points={[[0, seg.bottomY, leftInnerZ], [0, seg.topY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[-0.008, seg.bottomY, leftInnerZ], [0.008, seg.bottomY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[-0.008, seg.topY, leftInnerZ], [0.008, seg.topY, leftInnerZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <Text
                      position={[0, (seg.bottomY + seg.topY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={100001} depthTest={false}
                      rotation={[0, -Math.PI / 2, Math.PI / 2]}
                    >
                      {seg.heightMm}
                    </Text>
                  </group>
                </React.Fragment>
                );
              })}

              {/* 도어 안쪽 갭 치수 (상판 윗면~도어 상단) — 도어 치수선 바깥(오른쪽) */}
              {innerGapSegments_l2.length > 0 && (() => {
                // 도어 전면 Z 계산
                const panelDepthMm_ig = spaceInfo.depth || 1500;
                const furnitureDepthMm_ig = Math.min(panelDepthMm_ig, 600);
                const zOff_ig = -mmToThreeUnits(panelDepthMm_ig) / 2;
                const fzOff_ig = zOff_ig + (mmToThreeUnits(panelDepthMm_ig) - mmToThreeUnits(furnitureDepthMm_ig)) / 2;
                const doorFrontZ_ig = fzOff_ig + mmToThreeUnits(furnitureDepthMm_ig) / 2;
                // 도어 치수선(150mm) 바깥에 배치: 도어 전면 + 300mm
                const innerDimZ = doorFrontZ_ig + mmToThreeUnits(300);
                const innerExtStart = doorFrontZ_ig + mmToThreeUnits(180);
                return innerGapSegments_l2.map((seg) => (
                  <group key={`inner-gap-${seg.key}`}>
                    <ExtLine points={[[0, seg.bottomY, innerExtStart], [0, seg.bottomY, innerDimZ]]} color={dimensionColor} />
                    <ExtLine points={[[0, seg.topY, innerExtStart], [0, seg.topY, innerDimZ]]} color={dimensionColor} />
                    <NativeLine name="dimension_line"
                      points={[[0, seg.bottomY, innerDimZ], [0, seg.topY, innerDimZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[-0.008, seg.bottomY, innerDimZ], [0.008, seg.bottomY, innerDimZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[-0.008, seg.topY, innerDimZ], [0.008, seg.topY, innerDimZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <Text
                      position={[0, (seg.bottomY + seg.topY) / 2, innerDimZ + mmToThreeUnits(60)]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={100001} depthTest={false}
                      rotation={[0, -Math.PI / 2, Math.PI / 2]}
                    >
                      {seg.heightMm}
                    </Text>
                  </group>
                ));
              })()}

              {/* 걸래받이 높이: 갭 + 실제 걸레받이 높이로 분리 표시 */}
              {hasLower && baseFrameHeightMm > 0 && (() => {
                const gapTopY = floorFinishY + mmToThreeUnits(baseFrameGapMm);
                const segments = baseFrameGapMm > 0
                  ? [
                    { key: 'gap', bottomY: floorFinishY, topY: gapTopY, heightMm: baseFrameGapMm },
                    { key: 'base', bottomY: gapTopY, topY: furnitureBaseY, heightMm: baseFrameDisplayMm },
                  ].filter(seg => seg.heightMm > 0)
                  : [{ key: 'base', bottomY: floorFinishY, topY: furnitureBaseY, heightMm: baseFrameDisplayMm }];
                const tickYs = [floorFinishY, ...(baseFrameGapMm > 0 ? [gapTopY] : []), furnitureBaseY];
                return (
                  <>
                    {tickYs.map((y, index) => (
                      <React.Fragment key={`base-ext-${index}`}>
                        <ExtLine points={[[0, y, leftInnerExtStartZ], [0, y, leftInnerZ]]} color={dimensionColor} />
                        <NativeLine name="dimension_line"
                          points={[[-0.008, y, leftInnerZ], [0.008, y, leftInnerZ]]}
                          color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                        />
                      </React.Fragment>
                    ))}
                    {segments.map((seg) => (
                      <group key={`base-seg-${seg.key}`}>
                        <NativeLine name="dimension_line"
                          points={[[0, seg.bottomY, leftInnerZ], [0, seg.topY, leftInnerZ]]}
                          color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                        />
                        <Text
                          position={[0, (seg.bottomY + seg.topY) / 2, leftInnerZ - mmToThreeUnits(seg.key === 'gap' ? 120 : 60)]}
                          fontSize={largeFontSize} color={textColor}
                          anchorX="center" anchorY="middle"
                          renderOrder={100001} depthTest={false}
                          rotation={[0, -Math.PI / 2, Math.PI / 2]}
                        >
                          {seg.heightMm}
                        </Text>
                      </group>
                    ))}
                  </>
                );
              })()}

            </group>
          );
        })()}

        {/* ===== 오른쪽: 상단몰딩 치수 제거됨 (좌측 세그먼트로 이동) ===== */}

        {/* 우측 도어 사이즈 (hasDoor 가구만) */}
        {(() => {
          // 가구 앞면 Z 계산 (FurnitureItem.tsx와 동일)
          const panelDepthMm_ud = spaceInfo.depth || 1500;
          const panelDepth_ud = mmToThreeUnits(panelDepthMm_ud);
          const furnitureDepth_ud = mmToThreeUnits(Math.min(panelDepthMm_ud, 600));
          const doorThk_ud = mmToThreeUnits(20);
          const zOff_ud = -panelDepth_ud / 2;
          const fzOff_ud = zOff_ud + (panelDepth_ud - furnitureDepth_ud) / 2;
          // 하부장/키큰장 도어 앞면 Z (도어 포함)
          // 도어분절 가구는 sectionDepths 최대값을 기준으로 도어가 더 앞으로 나옴 → 가이드도 같이 이동
          const doorSplitMod = visibleFurniture.find(m => {
            const mid = (m as PlacedModule).moduleId || '';
            return mid.includes('shelf-split') || mid.includes('pantry-cabinet-split');
          }) as PlacedModule | undefined;
          const splitSectionDepths = (doorSplitMod as any)?.sectionDepths as number[] | undefined;
          const maxSplitSectionDepth = (splitSectionDepths && splitSectionDepths.length > 0)
            ? Math.max(...splitSectionDepths.filter(d => typeof d === 'number' && d > 0))
            : 0;
          const furnitureDepthMmForSplit = Math.min(panelDepthMm_ud, 600);
          const splitExtraDepthMm = maxSplitSectionDepth > 0
            ? Math.max(0, maxSplitSectionDepth - furnitureDepthMmForSplit)
            : 0;
          const defaultDoorFrontZ = fzOff_ud + furnitureDepth_ud / 2 + mmToThreeUnits(splitExtraDepthMm);
          const hasShoeDoorDimensionModule = visibleFurniture.some(module => {
            const mod = module as PlacedModule;
            return mod.hasDoor && isShoeCabinetDimensionModuleId(mod.moduleId);
          });
          const lowerDoorFrontZ = hasShoeDoorDimensionModule
            ? (resolveShoeCabinetDoorFrontZ(visibleFurniture as PlacedModule[], panelDepthMm_ud) ?? defaultDoorFrontZ)
            : defaultDoorFrontZ;
          // 도어 치수선: 신발장 측면뷰는 도어에 더 가깝게 배치
          const dimOffsetMm = hasShoeDoorDimensionModule ? 100 : 150;
          const dimZ = lowerDoorFrontZ + mmToThreeUnits(dimOffsetMm);
          const dimExtZ = lowerDoorFrontZ + mmToThreeUnits(hasShoeDoorDimensionModule ? 20 : 30);
          const dimTextZ = dimZ + mmToThreeUnits(hasShoeDoorDimensionModule ? 45 : 60);
          // 상부장 Z: 하부장 뒷면에 정렬 (하부장 뒷면 = fzOff_ud - furnitureDepth_ud/2 - doorThk_ud)
          // 상부장 깊이 (첫 번째 상부장 모듈 기준)
          const firstUpperMod = visibleFurniture.find(m => getModuleCategory(m as PlacedModule) === 'upper') as PlacedModule | undefined;
          const upperModDepthMm = firstUpperMod?.upperSectionDepth || firstUpperMod?.customDepth || 300;
          const upperModDepth_ud = mmToThreeUnits(upperModDepthMm);
          // 상부장 중심 Z = 하부장 뒷면 + 상부장 깊이/2
          const upperFurnitureZ = fzOff_ud - furnitureDepth_ud / 2 - doorThk_ud + upperModDepth_ud / 2;
          const upperFrontZ = upperFurnitureZ + upperModDepth_ud / 2;
          const upperDimZ = upperFrontZ + mmToThreeUnits(200);
          const upperDimExtZ = upperFrontZ + mmToThreeUnits(20);
          const hasUpperSideModule = visibleFurniture.some(module => {
            const mod = module as PlacedModule;
            return getModuleCategory(mod) === 'upper';
          });

          const doorSegs: {
            bottomY: number;
            topY: number;
            heightMm: number;
            key: string;
            isUpper: boolean;
            suppressGapAfter?: boolean;
          }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            const mod = module as PlacedModule;
            if (!mod.hasDoor) return;

            // 서랍/마이다 모듈은 마이다 치수 블록에서 별도 처리 → 도어 치수 건너뜀
            const isDrawerMod = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');
            if (isDrawerMod) return;

            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod, internalSpace, spaceInfo);
            if (!modData) return;

            const modCat = getModuleCategory(mod);
            const doorBounds = resolveDoorBounds(mod, modData, modCat);
            let { doorBottomAbsMm, doorTopAbsMm, doorHeightMm, cabinetTopAbsMm } = doorBounds;

            const isShelfSplitDoorSeg = typeof modData.id === 'string' &&
              (modData.id.includes('shelf-split') || modData.id.includes('pantry-cabinet-split'));
            if (modCat === 'full' && isShelfSplitDoorSeg) {
              const splitBounds = resolveSplitDoorBounds(mod, modData, modCat);
              if (splitBounds.lower.heightMm > 0) {
                doorSegs.push({
                  bottomY: mmToThreeUnits(splitBounds.lower.bottomAbsMm),
                  topY: mmToThreeUnits(splitBounds.lower.topAbsMm),
                  heightMm: Math.round(splitBounds.lower.heightMm),
                  key: `door-split-lower-${moduleIndex}`,
                  isUpper: false,
                  suppressGapAfter: true,
                });
              }
              if (splitBounds.upper.heightMm > 0) {
                doorSegs.push({
                  bottomY: mmToThreeUnits(splitBounds.upper.bottomAbsMm),
                  topY: mmToThreeUnits(splitBounds.upper.topAbsMm),
                  heightMm: Math.round(splitBounds.upper.heightMm),
                  key: `door-split-upper-${moduleIndex}`,
                  isUpper: false,
                });
              }
              if (splitBounds.topGap.heightMm > 0) {
                doorSegs.push({
                  bottomY: mmToThreeUnits(splitBounds.topGap.bottomAbsMm),
                  topY: mmToThreeUnits(splitBounds.topGap.topAbsMm),
                  heightMm: Math.round(splitBounds.topGap.heightMm),
                  key: `door-split-topgap-${moduleIndex}`,
                  isUpper: false,
                });
              }
              return;
            }

            if (doorHeightMm <= 0) return;

            doorSegs.push({
              bottomY: mmToThreeUnits(doorBottomAbsMm),
              topY: mmToThreeUnits(doorTopAbsMm),
              heightMm: Math.round(doorHeightMm),
              key: `door-${moduleIndex}`,
              isUpper: modCat === 'upper'
            });

            // 하부장: 상판/상부 EP가 있으면 도어 상단 ~ 상부 마감 하단 갭 표시
            // lower-top-down: 도어 상단 ~ 상부 마감 앞판 하단 갭 표시
            // lower-door-lift는 도어가 가구 위로 올라가므로 좌측 2단에서 표시 (여기서 제외)
            const _effTopFinishThk_l = getLowerTopFinishThicknessForModule(mod);
            if (modCat === 'lower' && modData.id?.includes('lower-top-down-') && _effTopFinishThk_l > 0) {
              const cabinetH = mod.customHeight ?? mod.freeHeight ?? modData.dimensions.height ?? 785;
              const cabinetBottomAbs = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              const cabinetTopAbs = cabinetBottomAbs + cabinetH;
              const gapBottomAbs = doorTopAbsMm; // 도어 상단
              const frontPlateTopAbs = cabinetTopAbs + _effTopFinishThk_l;
              const frontPlateBottomAbs = frontPlateTopAbs - TOP_DOWN_STONE_FRONT_HEIGHT_MM;
              const doorGapMm = Math.round(frontPlateBottomAbs - gapBottomAbs);
              if (doorGapMm > 0) {
                doorSegs.push({
                  bottomY: mmToThreeUnits(gapBottomAbs),
                  topY: mmToThreeUnits(frontPlateBottomAbs),
                  heightMm: doorGapMm,
                  key: `door-topgap-${moduleIndex}`,
                  isUpper: false
                });
              }
              doorSegs.push({
                bottomY: mmToThreeUnits(frontPlateBottomAbs),
                topY: mmToThreeUnits(frontPlateTopAbs),
                heightMm: TOP_DOWN_STONE_FRONT_HEIGHT_MM,
                key: `door-frontplate-${moduleIndex}`,
                isUpper: false
              });
            } else if (modCat === 'lower' && _effTopFinishThk_l > 0) {
              const countertopBottomGapMm = Math.round(cabinetTopAbsMm - doorTopAbsMm);
              if (countertopBottomGapMm > 0) {
                doorSegs.push({
                  bottomY: mmToThreeUnits(doorTopAbsMm),
                  topY: mmToThreeUnits(cabinetTopAbsMm),
                  heightMm: countertopBottomGapMm,
                  key: `door-countertop-bottom-gap-${moduleIndex}`,
                  isUpper: false
                });
              }
            } else if (modCat === 'full') {
              // 키큰장: 도어 상단갭 = 천장(또는 단내림) ~ 도어 상단 거리.
              // 하부장은 상판이 없으면 도어 사이즈만 표시하고, 상판이 있을 때만 위 분기에서 상판 하단 갭을 표시한다.
              const isLowerSpecial = modData.id?.includes('lower-top-down-') || modData.id?.includes('lower-door-lift-');
              if (!isLowerSpecial) {
                const isDroppedZone = (mod as any).zone === 'dropped';
                const ceilingAbsMm = isDroppedZone && spaceInfo.droppedCeiling?.enabled
                  ? (spaceInfo.height - (spaceInfo.droppedCeiling.dropHeight || 0))
                  : spaceInfo.height;
                const topGapMm = Math.round(Math.max(0, ceilingAbsMm - doorTopAbsMm));
                if (topGapMm > 0) {
                  doorSegs.push({
                    bottomY: mmToThreeUnits(doorTopAbsMm),
                    topY: mmToThreeUnits(ceilingAbsMm),
                    heightMm: topGapMm,
                    key: `door-topgap-${moduleIndex}`,
                    isUpper: false
                  });
                }
              }
              // 하단갭은 doorSegs 밖 별도 분기에서 바닥 기준으로 표시
            }
          });

          if (doorSegs.length === 0) return null;

          // 상부장 도어와 하부장/키큰장 도어 분리
          const upperDoorSegsRaw = doorSegs.filter(s => s.isUpper);
          const lowerDoorSegsRaw = doorSegs.filter(s => !s.isUpper);

          // 같은 높이·위치의 중복 세그먼트 제거 (같은 슬롯에 여러 가구가 있을 때)
          const dedup = (segs: typeof doorSegs) => {
            const seen = new Set<string>();
            return segs.filter(s => {
              const k = `${s.heightMm}_${Math.round(s.bottomY * 1000)}_${Math.round(s.topY * 1000)}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          };
          const upperDoorSegs = dedup(upperDoorSegsRaw);
          const lowerDoorSegs = dedup(lowerDoorSegsRaw);

          // 하부장/키큰장 도어 간 간격 계산
          upperDoorSegs.sort((a, b) => a.bottomY - b.bottomY);
          lowerDoorSegs.sort((a, b) => a.bottomY - b.bottomY);
          const allLowerDoorSegs: typeof doorSegs = [];
          for (let i = 0; i < lowerDoorSegs.length; i++) {
            allLowerDoorSegs.push(lowerDoorSegs[i]);
            if (i < lowerDoorSegs.length - 1) {
              if (lowerDoorSegs[i].suppressGapAfter) continue;
              const gapBottomY = lowerDoorSegs[i].topY;
              const gapTopY = lowerDoorSegs[i + 1].bottomY;
              const gapMm = Math.round((gapTopY - gapBottomY) / 0.01);
              if (gapMm > 0) {
                allLowerDoorSegs.push({
                  bottomY: gapBottomY,
                  topY: gapTopY,
                  heightMm: gapMm,
                  key: `door-gap-${i}`,
                  isUpper: false
                });
              }
            }
          }

          return (
            <>
              {/* 하부장/키큰장 도어: 기존 우측 고정 위치 */}
              {allLowerDoorSegs.map((seg) => (
                <group key={`r-door-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, dimExtZ], [0, seg.bottomY, dimZ]]} color={doorDimensionColor} />
                  <ExtLine points={[[0, seg.topY, dimExtZ], [0, seg.topY, dimZ]]} color={doorDimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, seg.bottomY, dimZ], [0, seg.topY, dimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, dimZ], [0.008, seg.bottomY, dimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.topY, dimZ], [0.008, seg.topY, dimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (seg.bottomY + seg.topY) / 2, dimTextZ]} fontSize={largeFontSize} color={doorDimensionColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                    {seg.heightMm}
                  </Text>
                </group>
              ))}
              {/* 상부장 도어: 가구 앞면 바로 우측 */}
              {upperDoorSegs.map((seg) => (
                <group key={`r-upper-door-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, upperDimExtZ], [0, seg.bottomY, upperDimZ]]} color={doorDimensionColor} />
                  <ExtLine points={[[0, seg.topY, upperDimExtZ], [0, seg.topY, upperDimZ]]} color={doorDimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, seg.bottomY, upperDimZ], [0, seg.topY, upperDimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, upperDimZ], [0.008, seg.bottomY, upperDimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.topY, upperDimZ], [0.008, seg.topY, upperDimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (seg.bottomY + seg.topY) / 2, upperDimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={doorDimensionColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                    {seg.heightMm}
                  </Text>
                </group>
              ))}
              {/* 하부장/키큰장 도어 하단갭: 바닥(마감재 있으면 마감재 상단) ~ 도어 하단 */}
              {(() => {
                if (allLowerDoorSegs.length === 0) return null;
                const bottomStartY = floorFinishHeightMm > 0 ? mmToThreeUnits(floorFinishHeightMm) : 0;
                const shouldUseClearanceForBottomGap = (isFloating || modHasBaseOff) && baseFrameHeightMm > 0;
                const lowestBottomY = Math.min(...allLowerDoorSegs.map(s => s.bottomY));
                const bottomGuideTopY = shouldUseClearanceForBottomGap
                  ? Math.max(lowestBottomY, bottomStartY + mmToThreeUnits(baseFrameHeightMm))
                  : lowestBottomY;
                const bottomGapMm = Math.round((bottomGuideTopY - bottomStartY) / 0.01);
                if (bottomGapMm <= 0) return null;
                return (
                  <group key="r-door-bottomgap">
                    <ExtLine points={[[0, bottomStartY, dimExtZ], [0, bottomStartY, dimZ]]} color={doorDimensionColor} />
                    <NativeLine name="dimension_line" points={[[0, bottomStartY, dimZ], [0, bottomGuideTopY, dimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[-0.008, bottomStartY, dimZ], [0.008, bottomStartY, dimZ]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <Text position={[0, (bottomStartY + bottomGuideTopY) / 2, dimTextZ]} fontSize={largeFontSize} color={doorDimensionColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                      {bottomGapMm}
                    </Text>
                  </group>
                );
              })()}
            </>
          );
        })()}

        {/* 바닥마감재 치수 — 받침대(걸래받이) 치수와 동일 Z 라인 + 동일 연장선 길이 */}
        {floorFinishHeightMm > 0 && !isFloating && selectedModCategory !== 'lower' && selectedModCategory !== 'upper' && (() => {
          // 받침대 치수와 동일한 Z 라인 (메인 치수선 위치)
          const dimZ = spaceDepth/2 + rightDimOffset - mmToThreeUnits(750);
          // 연장선 길이 240mm (기존 360mm에서 1/3 단축)
          const extStartZ = spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(240);
          return (
            <group>
              {/* 보조 가이드 연장선 - 바닥 (받침대 시작 ExtLine과 길이 동일 360mm) */}
              <ExtLine points={[[0, 0, extStartZ], [0, 0, dimZ]]} color={dimensionColor} />
              {/* 마감재 상단의 ExtLine은 받침대 치수의 시작 ExtLine과 중복되므로 생략 */}
              {/* 메인 치수선 (바닥 ~ 마감재 상단) */}
              <NativeLine name="dimension_line"
                points={[
                  [0, 0, dimZ],
                  [0, floorFinishY, dimZ]
                ]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              {/* 티크 마크 - 바닥 */}
              <NativeLine name="dimension_line"
                points={[
                  [-0.008, 0, dimZ],
                  [0.008, 0, dimZ]
                ]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              {/* 티크 마크 - 마감재 상단 */}
              <NativeLine name="dimension_line"
                points={[
                  [-0.008, floorFinishY, dimZ],
                  [0.008, floorFinishY, dimZ]
                ]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <Text
                position={[0, floorFinishY / 2, dimZ + mmToThreeUnits(60)]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={100001} depthTest={false}
                rotation={[0, -Math.PI / 2, Math.PI / 2]}
              >
                {floorFinishHeightMm}
              </Text>
            </group>
          );
        })()}

        {/* 우측 영역 — 걸레받이 높이 표시
            좌측 65 = 조절발(받침대 본체) 높이 / 우측 = 걸레받이 = baseFrameGap 사용자 입력값
            사용자가 baseFrameGap 입력 안 하면 표시 안함 */}
        {(() => {
          const baseGapMm = baseFrameGapMm;
          if (!baseGapMm || baseGapMm <= 0) return null;
          if (selectedModCategory === 'lower' || selectedModCategory === 'upper') return null;
          // 걸레받이 = 바닥마감재 상단 ~ baseGapMm 만큼 위
          const gapStartY = floorFinishY;
          const gapEndY = floorFinishY + mmToThreeUnits(baseGapMm);
          return (
            <group>
              <ExtLine points={[[0, gapStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(240)], [0, gapStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]]} color={dimensionColor} />
              <ExtLine points={[[0, gapEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(240)], [0, gapEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]]} color={dimensionColor} />
              <NativeLine name="dimension_line"
                points={[
                  [0, gapStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                  [0, gapEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                ]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={[
                  [-0.008, gapStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                  [0.008, gapStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                ]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={[
                  [-0.008, gapEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                  [0.008, gapEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                ]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <Text
                position={[0, gapStartY + (gapEndY - gapStartY) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={100001} depthTest={false}
                rotation={[0, -Math.PI / 2, Math.PI / 2]}
              >
                {baseGapMm}
              </Text>
            </group>
          );
        })()}


        {/* 하부장: 걸레받이+몸통 H, 상부장: 몸통 H */}
        {(selectedModCategory === 'lower' || selectedModCategory === 'upper') && selectedMod && (() => {
          let selModData = getModuleById(
            selectedMod.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!selModData) {
            selModData = buildModuleDataFromPlacedModule(selectedMod, internalSpace, spaceInfo);
          }
          if (!selModData) return null;
          const selFurnitureHeightMm = computeFurnitureHeightMm(selectedMod, selModData, spaceInfo, internalSpace);
          const selModCatCombined = getModuleCategory(selectedMod);
          const selectedBaseFrameMm = selModCatCombined === 'lower'
            ? baseFrameHeightMm
            : 0;
          const selectedTopFinishMm = selModCatCombined === 'lower'
            ? getLowerTopFinishThicknessForModule(selectedMod)
            : 0;
          const selectedDimensionHeightMm = selModCatCombined === 'lower'
            ? selectedBaseFrameMm + selFurnitureHeightMm + selectedTopFinishMm
            : selFurnitureHeightMm;
          const dimensionBottomMm = selModCatCombined === 'upper'
            ? (isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height)
                - resolveTopFrameDistanceMm(selectedMod, spaceInfo, spaceInfo.frameSize?.top ?? 30, isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height)
                - selFurnitureHeightMm
            : floorFinishHeightMm;
          const dimensionTopMm = dimensionBottomMm + selectedDimensionHeightMm;
          const dimensionBottomY = mmToThreeUnits(dimensionBottomMm);
          const dimensionTopY = mmToThreeUnits(dimensionTopMm);
          // 가구 도어 앞면 Z 계산 (도어 치수와 동일 기준)
          const panelDepthMm_c = spaceInfo.depth || 1500;
          const furnitureDepthMm_c = Math.min(panelDepthMm_c, 600);
          const zOff_c = -mmToThreeUnits(panelDepthMm_c) / 2;
          const fzOff_c = zOff_c + (mmToThreeUnits(panelDepthMm_c) - mmToThreeUnits(furnitureDepthMm_c)) / 2;
          const doorFrontZ_c = fzOff_c + mmToThreeUnits(furnitureDepthMm_c) / 2;
          // H 치수: 도어 앞면에서 300mm 바깥 (도어 치수 150mm + 간격 150mm)
          const dimZ_combined = doorFrontZ_c + mmToThreeUnits(300);
          const dimZ_combined_ext = doorFrontZ_c + mmToThreeUnits(30);
          return (
            <group>
              <ExtLine points={[[0, dimensionBottomY, dimZ_combined_ext], [0, dimensionBottomY, dimZ_combined]]} color={dimensionColor} />
              <ExtLine points={[[0, dimensionTopY, dimZ_combined_ext], [0, dimensionTopY, dimZ_combined]]} color={dimensionColor} />
              <NativeLine name="dimension_line"
                points={[[0, dimensionBottomY, dimZ_combined], [0, dimensionTopY, dimZ_combined]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={[[-0.008, dimensionBottomY, dimZ_combined], [0.008, dimensionBottomY, dimZ_combined]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={[[-0.008, dimensionTopY, dimZ_combined], [0.008, dimensionTopY, dimZ_combined]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <Text
                position={[0, (dimensionBottomY + dimensionTopY) / 2, dimZ_combined + mmToThreeUnits(60)]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={100001} depthTest={false}
                rotation={[0, -Math.PI / 2, Math.PI / 2]}
              >
                {Math.round(selectedDimensionHeightMm)}
              </Text>
            </group>
          );
        })()}

        {/* ===== 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 ===== */}
        {visibleFurniture.map((module, index) => {
          let depthModuleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!depthModuleData) {
            depthModuleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
          }
          if (!depthModuleData) return null;

          const mod = module as PlacedModule;
          const modCategory = getModuleCategory(mod);
          const isLowerMod = modCategory === 'lower';

          // 신발장 계열 판별 (entryway / shelf / Ndrawer-shelf — upper-cabinet-shelf 제외)
          const midSideCheck = mod.moduleId || '';
          const keyForShoe = midSideCheck.replace(/-[\d.]+$/, '');
          const isEntrywayH = midSideCheck.includes('-entryway-');
          const isShelfDrawer = midSideCheck.includes('-4drawer-shelf-') || midSideCheck.includes('-2drawer-shelf-');
          const isPlainShelf = /(^|-)shelf$/.test(keyForShoe) && !midSideCheck.includes('upper-cabinet-');
          const isShoeCategory = (isEntrywayH || isShelfDrawer || isPlainShelf) && !midSideCheck.includes('upper-cabinet-');

          // 현관장 H(entryway-h)는 dimensions.depth가 도어 포함 400mm → 도어 20 차감
          const DOOR_THK_MM = 20;
          // 신발장 하부섹션 기본 깊이 (실제 가구 패널 기준)
          const SHOE_LOWER_DEFAULT_MM = 380;

          // 우선순위:
          // - 일반 가구: upper/lowerSectionDepth > customDepth > dimensions.depth
          // - 신발장: customDepth가 설정되어 있고 섹션이 dimensions.depth(600 초기값)면
          //   customDepth 우선(잘못 저장된 600 무시). 섹션이 다른 값이면 사용자 설정 존중.
          const hasCustomDepth = typeof module.customDepth === 'number' && module.customDepth > 0;
          const categoryDefaultDepth = getCategoryDefaultFurnitureDepth(
            spaceInfo.depth || 600,
            module.moduleId || '',
            spaceInfo.furnitureDepthDefaults
          );
          const baseFallback = isShoeCategory ? 380 : (categoryDefaultDepth ?? depthModuleData.dimensions.depth);
          const modDimDepth = depthModuleData.dimensions.depth;
          const resolveSectionDepth = (sectionVal: number | undefined): number => {
            if (isShoeCategory && hasCustomDepth && sectionVal === modDimDepth) {
              // 신발장: 섹션이 모듈 dimensions.depth(600)와 동일한 초기값이면 customDepth 우선
              return module.customDepth!;
            }
            return sectionVal ?? (hasCustomDepth ? module.customDepth! : baseFallback);
          };
          const upperDepthRaw = resolveSectionDepth(module.upperSectionDepth);
          const lowerDepthRaw = resolveSectionDepth(module.lowerSectionDepth);

          // 현관장 H는 dimensions.depth(400 도어포함) 기반일 때만 20 차감
          // 섹션별 depth 또는 customDepth는 이미 실제값
          const upperUsesDimDepth = module.upperSectionDepth === undefined && !hasCustomDepth;
          const lowerUsesDimDepth = module.lowerSectionDepth === undefined && !hasCustomDepth;
          const upperDepth = (upperUsesDimDepth && isEntrywayH) ? Math.max(0, upperDepthRaw - DOOR_THK_MM) : upperDepthRaw;
          const lowerDepth = (lowerUsesDimDepth && isEntrywayH) ? Math.max(0, lowerDepthRaw - DOOR_THK_MM) : lowerDepthRaw;
          // 2섹션 구조면 상/하부 분리 표시
          // 판정: 신발장 카테고리 / upper·lowerSectionDepth 둘 다 정의 /
          //      customSections 길이>=2 / modelConfig.sections 길이>=2 (의류장 붙박이장 B 등)
          const cfgSections = (module as any).customSections;
          const mdSections = depthModuleData.modelConfig?.sections;
          const hasTwoSections = (Array.isArray(cfgSections) && cfgSections.length >= 2)
            || (Array.isArray(mdSections) && mdSections.length >= 2);
          const isShoeTwoSection = isShoeCategory
            || (!isLowerMod && module.upperSectionDepth !== undefined && module.lowerSectionDepth !== undefined)
            || (!isLowerMod && hasTwoSections);

          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);
          const moduleDepthLower = mmToThreeUnits(lowerDepth);

          // 가구 위치 계산 (FurnitureItem.tsx와 동일)
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;

          // 가구 깊이 치수: 하부장은 가구 바닥 아래, 키큰장/상부장은 가구 상단 위
          const isUpperMod = modCategory === 'upper';
          const modHeightMm = isLowerMod
            ? computeFurnitureHeightMm(mod, depthModuleData, spaceInfo, internalSpace)
            : isUpperMod
              ? computeFurnitureHeightMm(mod, depthModuleData, spaceInfo, internalSpace)
              : adjustedInternalHeightMm;
          const modHeight = mmToThreeUnits(modHeightMm);

          // 상부장: 천장 기준 Y 계산 (FurnitureItem.tsx와 동일)
          const depthEffectiveH = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
          const depthSpaceTopDimY = mmToThreeUnits(depthEffectiveH) + mmToThreeUnits(200);
          let furnitureTopEdge: number;
          let furnitureBottomEdge: number;
          if (isUpperMod) {
            const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, depthEffectiveH);
            const cabinetTopMm = depthEffectiveH - topFrameVal;
            const cabinetBottomMm = cabinetTopMm - modHeightMm;
            furnitureTopEdge = mmToThreeUnits(cabinetTopMm);
            furnitureBottomEdge = mmToThreeUnits(cabinetBottomMm);
          } else {
            furnitureBottomEdge = furnitureBaseY;
            furnitureTopEdge = furnitureBaseY + modHeight;
          }

          const depthDimY = isLowerMod
            ? furnitureBottomEdge - mmToThreeUnits(200)    // 하부장: 가구 바닥 아래
            : depthSpaceTopDimY; // 키큰장/상부장: 가구 높이와 무관하게 공간 상단 기준
          const depthDimEdge = isLowerMod ? furnitureBottomEdge : furnitureTopEdge;

          // 신발장 하부섹션 치수 위치 (가구 바닥 아래)
          const depthDimYLower = furnitureBottomEdge - mmToThreeUnits(200);
          const depthDimEdgeLower = furnitureBottomEdge;

          // Z축 위치 계산 (FurnitureItem.tsx와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = Math.min(panelDepthMm, 600); // 가구 공간 깊이
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const baseDepthOffset = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
          const midSide = mod.moduleId || '';
          const isShoeSide = midSide.includes('-entryway-') || midSide.includes('-shelf-') || midSide.includes('-4drawer-shelf-') || midSide.includes('-2drawer-shelf-');
          const isKitchenTallCabinet = (
            midSide.includes('pull-out-cabinet') ||
            midSide.includes('pantry-cabinet') ||
            midSide.includes('fridge-cabinet') ||
            midSide.includes('built-in-fridge')
          );
          const isBackAlignedTallCabinet = modCategory === 'full'
            && !isShoeSide
            && !midSide.includes('insert-frame');
          // 가구 기본 공간 기준 깊이로 섹션 중심 Z 기본 공식 계산 후
          // direction에 따라 추가 오프셋을 적용 (SectionsRenderer 로직과 일치)
          // - 앞면 정렬(의류장/하부장 기본): frontZ 고정, depth 줄이면 중심이 앞쪽 부근 유지
          // - 뒷면 정렬(상부장/신발장/뒤고정): backZ 고정, depth 줄이면 중심이 뒤쪽 부근 유지
          // 신발장은 실제 가구 기본 depth 380 기준 (의류장은 600)
          const baseModuleDepthMm = isShoeSide
            ? (module.customDepth || 380)
            : (categoryDefaultDepth ?? depthModuleData.dimensions.depth);
          const baseModuleDepth = mmToThreeUnits(baseModuleDepthMm);
          const moduleBackWallGapZ = mmToThreeUnits((module as any).backWallGap ?? 0);
          const fixedBackZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + baseDepthOffset + moduleBackWallGapZ;
          const baseFrontZ = furnitureZOffset + furnitureDepth / 2 - doorThickness - baseModuleDepth / 2 + baseDepthOffset + moduleBackWallGapZ;
          const baseBackZ = fixedBackZ + baseModuleDepth / 2;

          // 상부섹션/단일 섹션 Z
          const upperDir = (mod.upperSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const lowerDir = (mod.lowerSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const upperDiff = baseModuleDepth - moduleDepth;
          const upperOffset = upperDiff === 0 ? 0 : upperDir === 'back' ? upperDiff / 2 : -upperDiff / 2;
          // 하부장 단일 본체는 기준 깊이와 현재 깊이가 같으면 토글해도 같은 위치여야 하고,
          // 깊이가 줄었을 때만 앞고정(back)=앞면 고정 / 뒤고정(front)=뒷면 고정을 적용한다.
          const isLowerSingleBackAligned = isLowerMod && !isShoeSide;
          let furnitureZ: number;
          if (isLowerSingleBackAligned) {
            const fixedBackZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + moduleBackWallGapZ;
            const baseFrontZEdge = fixedBackZ + baseModuleDepth;
            furnitureZ = lowerDir === 'back'
              ? baseFrontZEdge - moduleDepth / 2
              : fixedBackZ + moduleDepth / 2;
          } else if (isKitchenTallCabinet || isBackAlignedTallCabinet) {
            furnitureZ = fixedBackZ + moduleDepth / 2;
          } else if (isUpperMod || isShoeSide) {
            // 뒷면 정렬 기준: 중심 = baseBack + directionOffset
            furnitureZ = baseBackZ + upperOffset;
          } else {
            // 앞면 정렬 기준: 중심 = baseFront + directionOffset
            furnitureZ = baseFrontZ + upperOffset;
          }

          // 하부 섹션 Z (하부장 단일은 뒷면 정렬 → 방향 무관)
          const lowerDiff = baseModuleDepth - moduleDepthLower;
          const lowerOffset = lowerDiff === 0 ? 0 : lowerDir === 'back' ? lowerDiff / 2 : -lowerDiff / 2;
          const furnitureZLower = isShoeTwoSection
            ? (isShoeSide
                ? baseBackZ + lowerOffset  // 신발장 하부: 뒷면 정렬
                : furnitureZ + lowerOffset) // 의류장/키큰장 하부: 실제 본체 기준
            : furnitureZ;

	          // 걸래받이 옵셋 깊이
	          const shouldShowBaseFrameOffset = isLowerMod || modCategory === 'full';
	          const globalBaseFrameOffsetMm = spaceInfo.baseConfig?.offset ?? (isLowerMod ? 65 : 0);
	          const baseFrameOffsetMm = shouldShowBaseFrameOffset
	            ? resolveGuideBaseFrameOffsetMm(mod, spaceInfo, globalBaseFrameOffsetMm)
	            : 0;
          const baseFrameOffsetDepth = mmToThreeUnits(baseFrameOffsetMm);
          const baseOffsetDimEdge = isLowerMod ? depthDimEdge : furnitureBottomEdge;
          const baseOffsetDimY = isLowerMod ? depthDimY : depthDimYLower;
          const installedFrontExtensionMm = getInstalledFrontExtensionMm(mod);
          const installedFrontExtension = mmToThreeUnits(installedFrontExtensionMm);
          const depthLayout = resolveFurnitureDepthDimensionLayout(mod, depthModuleData, spaceInfo);
          const upperBackZ = depthLayout.upper.backZ;
          const upperFrontZ = depthLayout.upper.frontZ + installedFrontExtension;
          const upperDepthTextZ = (upperBackZ + upperFrontZ) / 2;
          const upperDisplayDepth = Math.round(depthLayout.upper.depthMm + installedFrontExtensionMm);
          const lowerBackZ = depthLayout.lower.backZ;
          const lowerFrontZ = depthLayout.lower.frontZ + installedFrontExtension;
          const lowerDepthTextZ = (lowerBackZ + lowerFrontZ) / 2;
          const lowerDisplayDepth = Math.round(depthLayout.lower.depthMm + installedFrontExtensionMm);

          return (
            <group key={`furniture-depth-${index}`}>
              {/* 상부섹션(또는 단일) 가구 깊이 — 상단 */}
              {/* 보조 가이드 연장선 - 앞쪽 */}
              <ExtLine points={[[0, depthDimEdge, upperFrontZ], [0, depthDimY, upperFrontZ]]} color={dimensionColor} />
              {/* 보조 가이드 연장선 - 뒤쪽 */}
              <ExtLine points={[[0, depthDimEdge, upperBackZ], [0, depthDimY, upperBackZ]]} color={dimensionColor} />
              {/* 가구 깊이 치수선 */}
              <NativeLine name="dimension_line"
                points={[[0, depthDimY, upperBackZ], [0, depthDimY, upperFrontZ]]}
                color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
              {/* 앞쪽 티크 */}
              <NativeLine name="dimension_line"
                points={[[0 - 0.02, depthDimY, upperFrontZ], [0 + 0.02, depthDimY, upperFrontZ]]}
                color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
              {/* 뒤쪽 티크 */}
              <NativeLine name="dimension_line"
                points={[[0 - 0.02, depthDimY, upperBackZ], [0 + 0.02, depthDimY, upperBackZ]]}
                color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
              {/* 가구 깊이 텍스트 */}
              <Text
                position={[0, depthDimY + mmToThreeUnits(isLowerMod ? -40 : 40), upperDepthTextZ]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={100001} depthTest={false}
                rotation={[0, -Math.PI / 2, 0]}
              >
                {upperDisplayDepth}
              </Text>

              {/* ─── 2섹션 가구 하부섹션 깊이 — 하단에 별도 표시 ─── */}
              {isShoeTwoSection && (
                <>
                  {/* 보조 가이드 연장선 - 앞쪽 */}
                  <ExtLine points={[[0, depthDimEdgeLower, lowerFrontZ], [0, depthDimYLower, lowerFrontZ]]} color={dimensionColor} />
                  {/* 보조 가이드 연장선 - 뒤쪽 */}
                  <ExtLine points={[[0, depthDimEdgeLower, lowerBackZ], [0, depthDimYLower, lowerBackZ]]} color={dimensionColor} />
                  {/* 하부섹션 깊이 치수선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, depthDimYLower, lowerBackZ], [0, depthDimYLower, lowerFrontZ]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  {/* 앞쪽 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, depthDimYLower, lowerFrontZ], [0 + 0.02, depthDimYLower, lowerFrontZ]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  {/* 뒤쪽 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, depthDimYLower, lowerBackZ], [0 + 0.02, depthDimYLower, lowerBackZ]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  {/* 하부섹션 깊이 텍스트 */}
                  <Text
                    position={[0, depthDimYLower - mmToThreeUnits(40), lowerDepthTextZ]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={100001} depthTest={false}
                    rotation={[0, -Math.PI / 2, 0]}
                  >
                    {lowerDisplayDepth}
                  </Text>
                </>
              )}

              {/* 상부장 하부마감판 깊이 치수 + 뒤쪽 갭 치수 — 하부 EP 체크 해제 시 미표시 */}
              {isUpperMod && (module as any).hasBottomEndPanel !== false && (() => {
                // 사용자 입력 갭 (기본: 전면 0, 후면 -35mm)
                const frontGapMm = (module as any).bottomEndPanelOffset ?? 0;
                const backGapMm = (module as any).bottomEndPanelBackOffset ?? -35;
                const backInsetMm = Math.abs(backGapMm);
                const finishDepthMm = Math.max(0, depthLayout.upper.depthMm - frontGapMm - backInsetMm);
                const finishDepth = mmToThreeUnits(finishDepthMm);
                // 렌더와 동일: 상부장 본체 중심에서 전면/후면 갭만큼 하부 EP 깊이를 줄인다.
                const finishZ = depthLayout.upper.centerZ + mmToThreeUnits((backInsetMm - frontGapMm) / 2);
                const finishDimY = furnitureBottomEdge - mmToThreeUnits(80);
                const cabinetBackZ = depthLayout.upper.backZ;
                const cabinetFrontZ = depthLayout.upper.frontZ;
                const finishBackZ = finishZ - finishDepth / 2;
                const offsetMm = backGapMm;

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge, finishZ + finishDepth/2], [0, finishDimY, finishZ + finishDepth/2]]} color={dimensionColor} />

                    {/* 보조 가이드 연장선 - 마감판 뒤쪽 (갭 치수선 높이까지) */}
                    <ExtLine points={[[0, furnitureBottomEdge, finishBackZ], [0, finishDimY, finishBackZ]]} color={dimensionColor} />

                    {/* 보조 가이드 연장선 - 가구 뒤쪽 (갭 치수선 높이까지) */}
                    <ExtLine points={[[0, furnitureBottomEdge, cabinetBackZ], [0, finishDimY, cabinetBackZ]]} color={dimensionColor} />

                    {/* 마감판 깊이 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, finishDimY, finishBackZ], [0, finishDimY, finishZ + finishDepth/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 앞쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY, finishZ + finishDepth/2], [0 + 0.02, finishDimY, finishZ + finishDepth/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 뒤쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY, finishBackZ], [0 + 0.02, finishDimY, finishBackZ]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 마감판 깊이 텍스트 */}
                    <Text
                      position={[0, finishDimY - mmToThreeUnits(40), finishZ]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={100001} depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      {finishDepthMm}
                    </Text>

                    {/* 후면갭 치수선 (가구 뒷면 ~ 마감판 뒷면) — 후면갭이 있으면 표시 */}
                    {backInsetMm > 0 && (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[0, finishDimY, cabinetBackZ], [0, finishDimY, finishBackZ]]}
                          color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={[[0 - 0.02, finishDimY, cabinetBackZ], [0 + 0.02, finishDimY, cabinetBackZ]]}
                          color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                        />
                        <Text
                          position={[0, finishDimY - mmToThreeUnits(40), (cabinetBackZ + finishBackZ) / 2]}
                          fontSize={largeFontSize} color={textColor}
                          anchorX="center" anchorY="middle"
                          renderOrder={100001} depthTest={false}
                          rotation={[0, -Math.PI / 2, 0]}
                        >
                          {backGapMm}
                        </Text>
                      </>
                    )}

                    {/* 전면갭 치수선 (마감판 앞면 ~ 가구 앞면) — 전면갭 > 0 일 때만 표시 */}
                    {frontGapMm > 0 && (() => {
                      const finishFrontZ = finishZ + finishDepth / 2;
                      return (
                        <>
                          {/* 가구 앞쪽 가이드 연장선 */}
                          <ExtLine points={[[0, furnitureBottomEdge, cabinetFrontZ], [0, finishDimY, cabinetFrontZ]]} color={dimensionColor} />
                          {/* 전면갭 치수선 */}
                          <NativeLine name="dimension_line"
                            points={[[0, finishDimY, finishFrontZ], [0, finishDimY, cabinetFrontZ]]}
                            color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                          />
                          {/* 가구 앞쪽 티크 */}
                          <NativeLine name="dimension_line"
                            points={[[0 - 0.02, finishDimY, cabinetFrontZ], [0 + 0.02, finishDimY, cabinetFrontZ]]}
                            color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                          />
                          {/* 전면갭 텍스트 */}
                          <Text
                            position={[0, finishDimY - mmToThreeUnits(40), (finishFrontZ + cabinetFrontZ) / 2]}
                            fontSize={largeFontSize} color={textColor}
                            anchorX="center" anchorY="middle"
                            renderOrder={100001} depthTest={false}
                            rotation={[0, -Math.PI / 2, 0]}
                          >
                            {frontGapMm}
                          </Text>
                        </>
                      );
                    })()}
                  </group>
                );
              })()}

              {/* 걸래받이 옵셋 깊이 치수 — hasBase=false이면 숨김 */}
              {shouldShowBaseFrameOffset && baseFrameOffsetMm > 0 && mod.hasBase !== false && (() => {
                // 걸래받이는 실제 하부장 앞면에서 옵셋만큼 뒤로 들어간다.
                // 뒤고정 상태로 깊이를 줄이면 furnitureZ가 같이 이동하므로 치수선도 같은 기준을 따라야 한다.
                const furnitureFrontZ = depthLayout.lower.frontZ;
                const frontZ = getBaseFrameReferenceFrontZ(furnitureFrontZ);
                const offsetBackZ = frontZ - baseFrameOffsetDepth;

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 (절반 길이, 위에서 시작) */}
                    <ExtLine points={[[0, baseOffsetDimEdge, frontZ], [0, (baseOffsetDimEdge + baseOffsetDimY) / 2, frontZ]]} color={dimensionColor} />
                    {/* 보조 가이드 연장선 - 뒤쪽 (절반 길이, 위에서 시작) */}
                    <ExtLine points={[[0, baseOffsetDimEdge, offsetBackZ], [0, (baseOffsetDimEdge + baseOffsetDimY) / 2, offsetBackZ]]} color={dimensionColor} />

                    {/* 걸래받이 옵셋 깊이 치수선 (연장선 끝점 = 중간) */}
                    <NativeLine name="dimension_line"
                      points={[[0, (baseOffsetDimEdge + baseOffsetDimY) / 2, offsetBackZ], [0, (baseOffsetDimEdge + baseOffsetDimY) / 2, frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    {/* 앞쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, (baseOffsetDimEdge + baseOffsetDimY) / 2, frontZ], [0 + 0.02, (baseOffsetDimEdge + baseOffsetDimY) / 2, frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    {/* 뒤쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, (baseOffsetDimEdge + baseOffsetDimY) / 2, offsetBackZ], [0 + 0.02, (baseOffsetDimEdge + baseOffsetDimY) / 2, offsetBackZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    {/* 걸래받이 옵셋 깊이 텍스트 */}
                    <Text
                      position={[0, (baseOffsetDimEdge + baseOffsetDimY) / 2 - mmToThreeUnits(40), (frontZ + offsetBackZ) / 2]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={100001}
                      depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      {baseFrameOffsetMm}
                    </Text>
                  </group>
                );
              })()}

              {/* 구 하부섹션 깊이 치수 블록 제거 (신발장용은 isShoeTwoSection 블록에서 도어 차감하여 표시) */}
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
                  lineWidth={0.3}
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
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />
              {/* 빗금 패턴 */}
              {hatchLines}
            </group>
          );
        })()}

        {/* ===== 도어/마이다 높이 치수선 ===== */}
        {(() => {
          // 도어 치수선 Z 위치 (공통)
          const panelDepthMm = spaceInfo.depth || 1500;
          const panelDepthU = mmToThreeUnits(panelDepthMm);
          const furnitureDepthU = mmToThreeUnits(600);
          const furnitureFrontZ = -panelDepthU / 2 + (panelDepthU - furnitureDepthU) / 2 + furnitureDepthU / 2;
          const doorDimZ = furnitureFrontZ + mmToThreeUnits(150);
          const doorExtStartZ = furnitureFrontZ + mmToThreeUnits(30);
          const doorTextOffsetZ = mmToThreeUnits(60);
          const doorColor = doorDimensionColor;

          // 측면뷰에 보이는 가구만 대상 (visibleFurniture 기반)
          const visibleIds = new Set(visibleFurniture.map(m => m.id));
          // 도어 달린 가구만 필터 (인덕션장도 hasDoor=true일 때만)
          const doorModules = placedModules.filter(m =>
            !m.isSurroundPanel && visibleIds.has(m.id) && m.hasDoor
          );
          if (doorModules.length === 0) return null;

          const effectiveH = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
          const elements: JSX.Element[] = [];

          doorModules.forEach((mod, modIdx) => {
            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod as PlacedModule, internalSpace, spaceInfo);

            const modCategory = modData?.category
              ?? (mod.moduleId.includes('-upper-') ? 'upper'
                : mod.moduleId.startsWith('lower-') ? 'lower' : 'full');

            // 서랍/마이다 모듈 체크 (인덕션장 포함)
            const isDrawerModule = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');

            if (modCategory === 'lower' && isDrawerModule) {
              // 서랍 모듈: 마이다 개별 높이
              const modHeightMm = modData ? computeFurnitureHeightMm(mod as PlacedModule, modData, spaceInfo, internalSpace) : 0;
              // 모듈별 기본 doorTopGap (computeLowerCabinetMaidaHeights 내부 defaultDTG와 일치해야 함)
              const isDL = mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-');
              const isTD = mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-');
              const modDefaultTopGap = isDL ? 30 : isTD ? getTopDownDoorTopGap(mod.stoneTopThickness, mod.hasTopEndPanel === true) : -20;
              const effectiveTopGap = isTD && (mod.doorTopGap === undefined || mod.doorTopGap === 0)
                ? modDefaultTopGap
                : (mod.doorTopGap ?? modDefaultTopGap);
              const effectiveBotGap = mod.doorBottomGap ?? 5;
              const topFinishThicknessForMaida = isTD
                ? getLowerTopFinishThicknessForModule(mod as PlacedModule)
                : getStoneTopThicknessMm(mod);
              const lowerMaidas = computeLowerCabinetMaidaHeights(mod.moduleId, modHeightMm, effectiveTopGap, effectiveBotGap, topFinishThicknessForMaida, (mod as any).customMaidaHeights, mod.hasTopEndPanel === true);
              if (lowerMaidas && lowerMaidas.length > 0) {
                const cabinetBottomY = furnitureBaseY;

                const gaps: { bottomMm: number; topMm: number; heightMm: number; absCoord?: boolean }[] = [];
                // 하단 갭: 캐비넷 바닥 ~ 마이다 하단 (캐비넷 내부 기준, maidaBottomMm > 0일 때만)
                const firstMaida = lowerMaidas[0];
                const floorToMaidaBottomMm = baseFrameHeightMm + firstMaida.maidaBottomMm;
                const useFloorBottomGapForMaida = (isFloating || modHasBaseOff) && baseFrameHeightMm > 0;
                if (firstMaida.maidaBottomMm > 0) {
                  if (useFloorBottomGapForMaida) {
                    const floorGapMm = baseFrameHeightMm + firstMaida.maidaBottomMm;
                    gaps.push({ bottomMm: 0, topMm: floorGapMm, heightMm: Math.round(floorGapMm), absCoord: true });
                  } else {
                    gaps.push({ bottomMm: 0, topMm: firstMaida.maidaBottomMm, heightMm: Math.round(firstMaida.maidaBottomMm) });
                  }
                }
                // maidaBottomMm < 0인 경우 (인덕션장): 바닥~마이다하단 치수는 마이다 그룹 밖에서 별도 렌더링
                // 마이다 사이 갭
                for (let gi = 0; gi < lowerMaidas.length - 1; gi++) {
                  const gapBotMm = lowerMaidas[gi].maidaTopMm;
                  const gapTopMm = lowerMaidas[gi + 1].maidaBottomMm;
                  if (gapTopMm - gapBotMm > 0) {
                    gaps.push({ bottomMm: gapBotMm, topMm: gapTopMm, heightMm: Math.round(gapTopMm - gapBotMm) });
                  }
                }
                // 상단 갭: 마지막 마이다 상단 ~ 캐비넷 상단
                const lastMaida = lowerMaidas[lowerMaidas.length - 1];
                const topGapTotal = modHeightMm - lastMaida.maidaTopMm;
                if (topGapTotal > 0) {
                  const topFinishThicknessForTopDown = isTD ? topFinishThicknessForMaida : _stoneTopThk(mod);
                  if (isTD && topFinishThicknessForTopDown > 0) {
                    const frontPlateTopMm = modHeightMm + topFinishThicknessForTopDown;
                    const frontPlateBottomMm = frontPlateTopMm - TOP_DOWN_STONE_FRONT_HEIGHT_MM;
                    const doorGapMm = Math.round(frontPlateBottomMm - lastMaida.maidaTopMm);
                    if (doorGapMm > 0) {
                      gaps.push({ bottomMm: lastMaida.maidaTopMm, topMm: frontPlateBottomMm, heightMm: doorGapMm });
                    }
                    gaps.push({ bottomMm: frontPlateBottomMm, topMm: frontPlateTopMm, heightMm: TOP_DOWN_STONE_FRONT_HEIGHT_MM });
                  } else {
                    gaps.push({ bottomMm: lastMaida.maidaTopMm, topMm: modHeightMm, heightMm: Math.round(topGapTotal) });
                  }
                }

                elements.push(
                  <group key={`door-maida-group-${modIdx}`}>
                    {lowerMaidas.map((m, i) => {
                      const dBotY = cabinetBottomY + mmToThreeUnits(m.maidaBottomMm);
                      const dTopY = cabinetBottomY + mmToThreeUnits(m.maidaTopMm);
                      return (
                        <group key={`door-maida-${modIdx}-${i}`}>
                          <NativeLine name="drawer_height_dim" points={[[0, dBotY, doorDimZ], [0, dTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, dBotY, doorDimZ], [0.008, dBotY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, dTopY, doorDimZ], [0.008, dTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text name="drawer_height_dim_text" position={[0, (dBotY + dTopY) / 2, doorDimZ + doorTextOffsetZ]} fontSize={largeFontSize} color={doorColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                            {Number.isInteger(m.maidaHeightMm) ? m.maidaHeightMm.toString() : (Math.round(m.maidaHeightMm * 10) / 10).toString()}
                          </Text>
                          <ExtLine points={[[0, dTopY, doorExtStartZ], [0, dTopY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="drawer_height_ext" />
                          <ExtLine points={[[0, dBotY, doorExtStartZ], [0, dBotY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="drawer_height_ext" />
                        </group>
                      );
                    })}
                    {gaps.map((gap, gi) => {
                      const floorBaselineY = floorFinishHeightMm > 0 ? mmToThreeUnits(floorFinishHeightMm) : 0;
                      const gBotY = gap.absCoord ? floorBaselineY + mmToThreeUnits(gap.bottomMm) : cabinetBottomY + mmToThreeUnits(gap.bottomMm);
                      const gTopY = gap.absCoord ? floorBaselineY + mmToThreeUnits(gap.topMm) : cabinetBottomY + mmToThreeUnits(gap.topMm);
                      return (
                        <group key={`door-gap-${modIdx}-${gi}`}>
                          <NativeLine name="drawer_height_dim" points={[[0, gBotY, doorDimZ], [0, gTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, gBotY, doorDimZ], [0.008, gBotY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, gTopY, doorDimZ], [0.008, gTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text name="drawer_height_dim_text" position={[0, (gBotY + gTopY) / 2, doorDimZ + doorTextOffsetZ]} fontSize={largeFontSize} color={doorColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                            {gap.heightMm}
                          </Text>
                          <ExtLine points={[[0, gTopY, doorExtStartZ], [0, gTopY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="drawer_height_ext" />
                          <ExtLine points={[[0, gBotY, doorExtStartZ], [0, gBotY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="drawer_height_ext" />
                        </group>
                      );
                    })}
                  </group>
                );

                // 바닥 ~ 마이다 하단 치수 (마이다 그룹과 별도로 하단 영역에 표시)
                if (firstMaida.maidaBottomMm < 0 && Math.abs(floorToMaidaBottomMm) >= 1) {
                  const bottomStartY = floorFinishHeightMm > 0 ? mmToThreeUnits(floorFinishHeightMm) : 0;
                  const bottomClearanceMm = useFloorBottomGapForMaida
                    ? Math.max(baseFrameHeightMm, floorToMaidaBottomMm)
                    : floorToMaidaBottomMm;
                  const maidaBottomAbsY = bottomStartY + mmToThreeUnits(bottomClearanceMm);
                  const floorToMaidaDispMm = Math.round(bottomClearanceMm);
                  elements.push(
                    <group key={`maida-floor-gap-${modIdx}`}>
                      <ExtLine points={[[0, bottomStartY, doorExtStartZ], [0, bottomStartY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="drawer_height_ext" />
                      <NativeLine name="drawer_height_dim" points={[[0, bottomStartY, doorDimZ], [0, maidaBottomAbsY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <NativeLine name="drawer_height_dim" points={[[-0.008, bottomStartY, doorDimZ], [0.008, bottomStartY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <NativeLine name="drawer_height_dim" points={[[-0.008, maidaBottomAbsY, doorDimZ], [0.008, maidaBottomAbsY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text name="drawer_height_dim_text" position={[0, (bottomStartY + maidaBottomAbsY) / 2, doorDimZ + doorTextOffsetZ]} fontSize={largeFontSize} color={doorColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                        {floorToMaidaDispMm}
                      </Text>
                    </group>
                  );
                }

                return; // this module done
              }
            }
            // 마이다가 없는 단일 도어 가구는 첫 번째 도어 치수 블록에서 이미 처리됨
          });

          return elements.length > 0 ? <group>{elements}</group> : null;
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
          <ExtLine points={[[0, 0, leftExtStartZ], [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 보조 가이드 연장선 - 상단 */}
          <ExtLine points={[[0, displaySpaceHeight, leftExtStartZ], [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 수직 치수선 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
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
            renderOrder={100001}
            depthTest={false}
            rotation={[0, Math.PI / 2, Math.PI / 2]}
          >
            {displaySpaceHeightMm}
          </Text>
        </group>}

        {/* 상단갭: 좌측 치수 레벨에만 표시 */}
        {(() => {
          const topGapMm = getVisibleTopGapMm();
          if (topGapMm <= 0) return null;

          const gapTopY = displaySpaceHeight;
          const gapBottomY = mmToThreeUnits(displaySpaceHeightMm - topGapMm);
          const leftGapZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(350);

          return (
            <group>
              <ExtLine points={[[0, gapBottomY, leftExtStartZ], [0, gapBottomY, leftGapZ]]} color={dimensionColor} />
              <ExtLine points={[[0, gapTopY, leftExtStartZ], [0, gapTopY, leftGapZ]]} color={dimensionColor} />
              <NativeLine name="dimension_line" points={[[0, gapBottomY, leftGapZ], [0, gapTopY, leftGapZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <NativeLine name="dimension_line" points={[[-0.008, gapBottomY, leftGapZ], [0.008, gapBottomY, leftGapZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <NativeLine name="dimension_line" points={[[-0.008, gapTopY, leftGapZ], [0.008, gapTopY, leftGapZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <Text position={[0, (gapBottomY + gapTopY) / 2, leftGapZ - mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                {topGapMm}
              </Text>
            </group>
          );
        })()}

        {/* ===== 왼쪽 2단: 몸통 사이즈 (segment-based, 모든 카테고리) — 우측뷰 ===== */}
        {visibleFurniture.length > 0 && (() => {
          const leftInnerZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) + mmToThreeUnits(200);
          const leftInnerExtStartZ = leftExtStartZ;
          const effectiveH_rl2 = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;

          const segments_rl2: { bottomY: number; topY: number; heightMm: number; key: string; extStartZ?: number }[] = [];
          const innerGapSegments_rl2: { bottomY: number; topY: number; heightMm: number; key: string }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            let moduleData = getModuleById(
              module.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!moduleData) moduleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
            if (!moduleData) return;

            const mod = module as PlacedModule;
            const modCat_rl2 = getModuleCategory(mod);
            const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);

            let cabinetBottomMm: number;
            let cabinetTopMm: number;

            if (modCat_rl2 === 'upper') {
              const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH_rl2);
              cabinetTopMm = effectiveH_rl2 - topFrameVal;
              cabinetBottomMm = cabinetTopMm - moduleHeightMm;
            } else {
              cabinetBottomMm = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              cabinetTopMm = cabinetBottomMm + moduleHeightMm;
            }
            const isShelfSplitFull = modCat_rl2 === 'full' && typeof module.moduleId === 'string' && module.moduleId.includes('shelf-split');
            const cabinetHeightForDimMm = (() => {
              if (!isShelfSplitFull) return moduleHeightMm;
              const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH_rl2);
              const topGapVal = Math.max(0, Math.round((mod as any).topFrameGap ?? topFrameVal));
              cabinetTopMm = (mod as any).hasTopFrame === false
                ? effectiveH_rl2 - topGapVal
                : effectiveH_rl2 - topFrameVal;
              return Math.max(0, cabinetTopMm - cabinetBottomMm);
            })();

            // 하부장 + 상판/상부 EP: 장 높이와 상부 마감 두께를 분리하여 표시
            const topFinishThicknessRL2 = modCat_rl2 === 'lower' ? getLowerTopFinishThicknessForModule(mod) : 0;

            // 2섹션 가구(의류장: 코트장/붙박이장B/D)는 섹션별로 분할하여 표시
            let didSplitSectionsRL2 = false;
            if (modCat_rl2 === 'full') {
              const sectionInfo = computeSectionHeightsInfo(mod, moduleData, cabinetHeightForDimMm, 'right', spaceInfo);
              if (sectionInfo.heightsMm.length >= 2) {
                let cursorMm = cabinetBottomMm;
                sectionInfo.heightsMm.forEach((hMm, sIdx) => {
                  const sBottom = cursorMm;
                  const sTop = cursorMm + hMm;
                  segments_rl2.push({
                    bottomY: mmToThreeUnits(sBottom),
                    topY: mmToThreeUnits(sTop),
                    heightMm: Math.round(hMm),
                    key: `furniture-${moduleIndex}-sec${sIdx}`
                  });
                  cursorMm = sTop;
                });
                didSplitSectionsRL2 = true;
              }
            }

            if (!didSplitSectionsRL2) {
              segments_rl2.push({
                bottomY: mmToThreeUnits(cabinetBottomMm),
                topY: mmToThreeUnits(cabinetTopMm),
                heightMm: Math.round(cabinetHeightForDimMm),
                key: `furniture-${moduleIndex}`
              });
            }

            if (modCat_rl2 === 'upper' && (mod as any).hasBottomEndPanel !== false) {
              segments_rl2.push({
                bottomY: mmToThreeUnits(cabinetBottomMm - DEFAULT_BASIC_THICKNESS_MM),
                topY: mmToThreeUnits(cabinetBottomMm),
                heightMm: DEFAULT_BASIC_THICKNESS_MM,
                key: `upper-bottom-ep-${moduleIndex}`
              });
            }

            // 상판/상부 EP 두께 세그먼트 (인조대리석 상판과 동일 표기)
            if (topFinishThicknessRL2 > 0) {
              segments_rl2.push({
                bottomY: mmToThreeUnits(cabinetTopMm),
                topY: mmToThreeUnits(cabinetTopMm + topFinishThicknessRL2),
                heightMm: topFinishThicknessRL2,
                key: `lower-top-finish-${moduleIndex}`
              });
            }

            // 상부장/키큰장(full) 상단몰딩: 몸통 섹션 치수와 같은 연장선 기준으로 표시
            if (modCat_rl2 === 'upper' || modCat_rl2 === 'full') {
              const topFrameVal = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, effectiveH_rl2);
              const topGapVal = Math.min(topFrameVal, Math.max(0, Math.round((mod as any).topFrameGap ?? (spaceInfo.frameSize as any)?.topGap ?? 0)));
              const visibleTopFrameVal = mod.hasTopFrame === false ? 0 : Math.max(0, topFrameVal - topGapVal);
              if (visibleTopFrameVal > 0) {
                segments_rl2.push({
                  bottomY: mmToThreeUnits(cabinetTopMm),
                  topY: mmToThreeUnits(effectiveH_rl2 - topGapVal),
                  heightMm: Math.round(visibleTopFrameVal),
                  key: `upper-topframe-${moduleIndex}`
                });
              }
              if (mod.hasTopFrame !== false && topGapVal > 0) {
                segments_rl2.push({
                  bottomY: mmToThreeUnits(effectiveH_rl2 - topGapVal),
                  topY: mmToThreeUnits(effectiveH_rl2),
                  heightMm: Math.round(topGapVal),
                  key: `upper-topgap-${moduleIndex}`
                });
              }
            }

            // 하부장: 뒷턱 치수
            if (modCat_rl2 === 'lower') {
              const stoneThickness = _stoneTopThk(mod);
              const topFinishThickness = getLowerTopFinishThicknessForModule(mod);

              // 뒷턱 치수 (상판 위에 추가)
              if (stoneThickness > 0) {
                const backLipH = mod.stoneTopBackLip || 0;
                if (backLipH > 0) {
                  segments_rl2.push({
                    bottomY: mmToThreeUnits(cabinetTopMm + topFinishThickness),
                    topY: mmToThreeUnits(cabinetTopMm + topFinishThickness + backLipH),
                    heightMm: backLipH,
                    key: `stone-backlip-${moduleIndex}`
                  });
                }
              }
            }
          });

          if (segments_rl2.length === 0) return null;
          segments_rl2.sort((a, b) => a.bottomY - b.bottomY);

          const allSegments_rl2 = segments_rl2;

          const hasLower_r = visibleFurniture.some(m => getModuleCategory(m as PlacedModule) === 'lower' || getModuleCategory(m as PlacedModule) === 'full');

          return (
            <group>
              {allSegments_rl2.map((seg) => {
                const segExtStartZ = seg.extStartZ !== undefined ? seg.extStartZ : leftInnerExtStartZ;
                const extendLowerGuideToFloor = seg.key.startsWith('lower-top-finish');
                return (
                  <React.Fragment key={`rl2-sec-${seg.key}`}>
                    <group>
                      {extendLowerGuideToFloor && (
                        <NativeLine
                          name="dimension_line"
                          points={[[0, 0, segExtStartZ], [0, seg.bottomY, segExtStartZ]]}
                          color={dimensionColor}
                          lineWidth={1}
                          renderOrder={100000}
                          depthTest={false}
                        />
                      )}
                      <ExtLine points={[[0, seg.bottomY, segExtStartZ], [0, seg.bottomY, leftInnerZ]]} color={dimensionColor} />
                      <ExtLine points={[[0, seg.topY, segExtStartZ], [0, seg.topY, leftInnerZ]]} color={dimensionColor} />
                      <NativeLine name="dimension_line" points={[[0, seg.bottomY, leftInnerZ], [0, seg.topY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, leftInnerZ], [0.008, seg.bottomY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <NativeLine name="dimension_line" points={[[-0.008, seg.topY, leftInnerZ], [0.008, seg.topY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <Text position={[0, (seg.bottomY + seg.topY) / 2, leftInnerZ - mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                        {seg.heightMm}
                      </Text>
                    </group>
                  </React.Fragment>
                );
              })}

              {/* 도어 안쪽 갭 치수 (상판 윗면~도어 상단) — 우측뷰: 도어 치수선 바깥 */}
              {innerGapSegments_rl2.length > 0 && (() => {
                const panelDepthMm_ig = spaceInfo.depth || 1500;
                const furnitureDepthMm_ig = Math.min(panelDepthMm_ig, 600);
                const zOff_ig = -mmToThreeUnits(panelDepthMm_ig) / 2;
                const fzOff_ig = zOff_ig + (mmToThreeUnits(panelDepthMm_ig) - mmToThreeUnits(furnitureDepthMm_ig)) / 2;
                const doorFrontZ_ig = fzOff_ig + mmToThreeUnits(furnitureDepthMm_ig) / 2;
                const innerDimZ = doorFrontZ_ig + mmToThreeUnits(300);
                const innerExtStart = doorFrontZ_ig + mmToThreeUnits(180);
                return innerGapSegments_rl2.map((seg) => (
                  <group key={`inner-gap-${seg.key}`}>
                    <ExtLine points={[[0, seg.bottomY, innerExtStart], [0, seg.bottomY, innerDimZ]]} color={dimensionColor} />
                    <ExtLine points={[[0, seg.topY, innerExtStart], [0, seg.topY, innerDimZ]]} color={dimensionColor} />
                    <NativeLine name="dimension_line" points={[[0, seg.bottomY, innerDimZ], [0, seg.topY, innerDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, innerDimZ], [0.008, seg.bottomY, innerDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[-0.008, seg.topY, innerDimZ], [0.008, seg.topY, innerDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <Text position={[0, (seg.bottomY + seg.topY) / 2, innerDimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                      {seg.heightMm}
                    </Text>
                  </group>
                ));
              })()}

              {hasLower_r && baseFrameHeightMm > 0 && (() => {
                const gapTopY = floorFinishY + mmToThreeUnits(baseFrameGapMm);
                const segments = baseFrameGapMm > 0
                  ? [
                    { key: 'gap', bottomY: floorFinishY, topY: gapTopY, heightMm: baseFrameGapMm },
                    { key: 'base', bottomY: gapTopY, topY: furnitureBaseY, heightMm: baseFrameDisplayMm },
                  ].filter(seg => seg.heightMm > 0)
                  : [{ key: 'base', bottomY: floorFinishY, topY: furnitureBaseY, heightMm: baseFrameDisplayMm }];
                const tickYs = [floorFinishY, ...(baseFrameGapMm > 0 ? [gapTopY] : []), furnitureBaseY];
                return (
                  <>
                    {tickYs.map((y, index) => (
                      <React.Fragment key={`base-ext-r-${index}`}>
                        <ExtLine points={[[0, y, leftInnerExtStartZ], [0, y, leftInnerZ]]} color={dimensionColor} />
                        <NativeLine name="dimension_line" points={[[-0.008, y, leftInnerZ], [0.008, y, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      </React.Fragment>
                    ))}
                    {segments.map((seg) => (
                      <group key={`base-seg-r-${seg.key}`}>
                        <NativeLine name="dimension_line" points={[[0, seg.bottomY, leftInnerZ], [0, seg.topY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                        <Text position={[0, (seg.bottomY + seg.topY) / 2, leftInnerZ - mmToThreeUnits(seg.key === 'gap' ? 120 : 60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                          {seg.heightMm}
                        </Text>
                      </group>
                    ))}
                  </>
                );
              })()}
            </group>
          );
        })()}

        {/* ===== 오른쪽: 상단몰딩 치수 제거됨 (좌측으로 이동) ===== */}

        {/* 우측뷰 — 우측 도어 사이즈 */}
        {(() => {
          // 가구 도어 앞면 기준 (좌측뷰와 동일)
          const panelDepthMm_rd = spaceInfo.depth || 1500;
          const furnitureDepthMm_rd = Math.min(panelDepthMm_rd, 600);
          const furnitureDepth_rd = mmToThreeUnits(furnitureDepthMm_rd);
          const doorThk_rd = mmToThreeUnits(20);
          const zOff_rd = -mmToThreeUnits(panelDepthMm_rd) / 2;
          const fzOff_rd = zOff_rd + (mmToThreeUnits(panelDepthMm_rd) - furnitureDepth_rd) / 2;
          const defaultDoorFrontZ_rd = fzOff_rd + furnitureDepth_rd / 2;
          const hasShoeDoorDimensionModule_r = visibleFurniture.some(module => {
            const mod = module as PlacedModule;
            return mod.hasDoor && isShoeCabinetDimensionModuleId(mod.moduleId);
          });
          const doorFrontZ_rd = hasShoeDoorDimensionModule_r
            ? (resolveShoeCabinetDoorFrontZ(visibleFurniture as PlacedModule[], panelDepthMm_rd) ?? defaultDoorFrontZ_rd)
            : defaultDoorFrontZ_rd;
          const dimOffsetMm_r = hasShoeDoorDimensionModule_r ? 100 : 150;
          const dimZ_r = doorFrontZ_rd + mmToThreeUnits(dimOffsetMm_r);
          const dimExtZ_r = doorFrontZ_rd + mmToThreeUnits(hasShoeDoorDimensionModule_r ? 20 : 30);
          const dimTextZ_r = dimZ_r + mmToThreeUnits(hasShoeDoorDimensionModule_r ? 45 : 60);
          const firstUpperMod_r = visibleFurniture.find(m => getModuleCategory(m as PlacedModule) === 'upper') as PlacedModule | undefined;
          const upperModDepthMm_r = firstUpperMod_r?.upperSectionDepth || firstUpperMod_r?.customDepth || 300;
          const upperModDepth_r = mmToThreeUnits(upperModDepthMm_r);
          const upperFurnitureZ_r = fzOff_rd - furnitureDepth_rd / 2 - doorThk_rd + upperModDepth_r / 2;
          const upperFrontZ_r = upperFurnitureZ_r + upperModDepth_r / 2;
          const upperDimZ_r = upperFrontZ_r + mmToThreeUnits(200);
          const upperDimExtZ_r = upperFrontZ_r + mmToThreeUnits(20);
          const hasUpperSideModule_r = visibleFurniture.some(module => {
            const mod = module as PlacedModule;
            return getModuleCategory(mod) === 'upper';
          });

          const doorSegs_r: {
            bottomY: number;
            topY: number;
            heightMm: number;
            key: string;
            isUpper: boolean;
            suppressGapAfter?: boolean;
          }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            const mod = module as PlacedModule;
            if (!mod.hasDoor) return;

            // 서랍/마이다 모듈은 마이다 치수 블록에서 별도 처리 → 도어 치수 건너뜀
            const isDrawerMod = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');
            if (isDrawerMod) return;

            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod, internalSpace, spaceInfo);
            if (!modData) return;

            const modCat = getModuleCategory(mod);
            const doorBounds = resolveDoorBounds(mod, modData, modCat);
            let { doorBottomAbsMm, doorTopAbsMm, doorHeightMm, cabinetTopAbsMm } = doorBounds;

            const isShelfSplitDoorSegR = typeof modData.id === 'string' &&
              (modData.id.includes('shelf-split') || modData.id.includes('pantry-cabinet-split'));
            if (modCat === 'full' && isShelfSplitDoorSegR) {
              const splitBounds = resolveSplitDoorBounds(mod, modData, modCat);
              if (splitBounds.lower.heightMm > 0) {
                doorSegs_r.push({
                  bottomY: mmToThreeUnits(splitBounds.lower.bottomAbsMm),
                  topY: mmToThreeUnits(splitBounds.lower.topAbsMm),
                  heightMm: Math.round(splitBounds.lower.heightMm),
                  key: `door-split-lower-r-${moduleIndex}`,
                  isUpper: false,
                  suppressGapAfter: true,
                });
              }
              if (splitBounds.upper.heightMm > 0) {
                doorSegs_r.push({
                  bottomY: mmToThreeUnits(splitBounds.upper.bottomAbsMm),
                  topY: mmToThreeUnits(splitBounds.upper.topAbsMm),
                  heightMm: Math.round(splitBounds.upper.heightMm),
                  key: `door-split-upper-r-${moduleIndex}`,
                  isUpper: false,
                });
              }
              if (splitBounds.topGap.heightMm > 0) {
                doorSegs_r.push({
                  bottomY: mmToThreeUnits(splitBounds.topGap.bottomAbsMm),
                  topY: mmToThreeUnits(splitBounds.topGap.topAbsMm),
                  heightMm: Math.round(splitBounds.topGap.heightMm),
                  key: `door-split-topgap-r-${moduleIndex}`,
                  isUpper: false,
                });
              }
              return;
            }

            if (doorHeightMm <= 0) return;

            doorSegs_r.push({
              bottomY: mmToThreeUnits(doorBottomAbsMm),
              topY: mmToThreeUnits(doorTopAbsMm),
              heightMm: Math.round(doorHeightMm),
              key: `door-${moduleIndex}`,
              isUpper: modCat === 'upper',
            });

            // 상판내림 + 상판/상부 EP: 도어 상단 ~ 앞판 하단 갭 + 80mm 앞판 영역
            const _effTopFinishThk_r = getLowerTopFinishThicknessForModule(mod);
            if (modCat === 'lower' && modData.id?.includes('lower-top-down-') && _effTopFinishThk_r > 0) {
              // 하부장 몸통 H: 사용자 수정값(customHeight/freeHeight) 우선 적용
              const cabinetH_r = mod.customHeight ?? mod.freeHeight ?? modData.dimensions.height ?? 785;
              const cabinetBottomAbs_r = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              const cabinetTopAbs_r = cabinetBottomAbs_r + cabinetH_r;
              const frontPlateTopAbs_r = cabinetTopAbs_r + _effTopFinishThk_r;
              const frontPlateBottomAbs_r = frontPlateTopAbs_r - TOP_DOWN_STONE_FRONT_HEIGHT_MM;
              const doorGapMm = Math.round(frontPlateBottomAbs_r - doorTopAbsMm);
              if (doorGapMm > 0) {
                doorSegs_r.push({
                  bottomY: mmToThreeUnits(doorTopAbsMm),
                  topY: mmToThreeUnits(frontPlateBottomAbs_r),
                  heightMm: doorGapMm,
                  key: `door-topgap-${moduleIndex}`,
                  isUpper: false,
                });
              }
              doorSegs_r.push({
                bottomY: mmToThreeUnits(frontPlateBottomAbs_r),
                topY: mmToThreeUnits(frontPlateTopAbs_r),
                heightMm: TOP_DOWN_STONE_FRONT_HEIGHT_MM,
                key: `door-frontplate-${moduleIndex}`,
                isUpper: false,
              });
            } else if (modCat === 'lower' && _effTopFinishThk_r > 0) {
              const countertopBottomGapMm = Math.round(cabinetTopAbsMm - doorTopAbsMm);
              if (countertopBottomGapMm > 0) {
                doorSegs_r.push({
                  bottomY: mmToThreeUnits(doorTopAbsMm),
                  topY: mmToThreeUnits(cabinetTopAbsMm),
                  heightMm: countertopBottomGapMm,
                  key: `door-countertop-bottom-gap-${moduleIndex}`,
                  isUpper: false,
                });
              }
            } else if (modCat === 'full') {
              // 키큰장만 천장(또는 단내림)까지의 상단갭을 표시한다.
              // 하부장은 상판 없을 때 도어 사이즈만, 상판 있을 때만 위 분기에서 상판 하단 갭을 표시한다.
              const isLowerSpecial = modData.id?.includes('lower-top-down-') || modData.id?.includes('lower-door-lift-');
              if (!isLowerSpecial) {
                const isDroppedZone = (mod as any).zone === 'dropped';
                const ceilingAbsMm = isDroppedZone && spaceInfo.droppedCeiling?.enabled
                  ? (spaceInfo.height - (spaceInfo.droppedCeiling.dropHeight || 0))
                  : spaceInfo.height;
                const topGapMm = Math.round(Math.max(0, ceilingAbsMm - doorTopAbsMm));
                if (topGapMm > 0) {
                  doorSegs_r.push({
                    bottomY: mmToThreeUnits(doorTopAbsMm),
                    topY: mmToThreeUnits(ceilingAbsMm),
                    heightMm: topGapMm,
                    key: `door-topgap-${moduleIndex}`,
                    isUpper: false,
                  });
                }
              }
            }
          });

          if (doorSegs_r.length === 0) return null;
          // 같은 높이·위치의 중복 세그먼트 제거
          const dedupSegs = (segs: typeof doorSegs_r) => {
            const seen = new Set<string>();
            return segs.filter(s => {
              const k = `${s.heightMm}_${Math.round(s.bottomY * 1000)}_${Math.round(s.topY * 1000)}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          };
          const upperDoorSegs_r = dedupSegs(doorSegs_r.filter(s => s.isUpper));
          const lowerDoorSegs_r = dedupSegs(doorSegs_r.filter(s => !s.isUpper));
          upperDoorSegs_r.sort((a, b) => a.bottomY - b.bottomY);
          lowerDoorSegs_r.sort((a, b) => a.bottomY - b.bottomY);

          const allLowerDoorSegs_r: typeof lowerDoorSegs_r = [];
          for (let i = 0; i < lowerDoorSegs_r.length; i++) {
            allLowerDoorSegs_r.push(lowerDoorSegs_r[i]);
            if (i < lowerDoorSegs_r.length - 1) {
              if (lowerDoorSegs_r[i].suppressGapAfter) continue;
              const gapBottomY = lowerDoorSegs_r[i].topY;
              const gapTopY = lowerDoorSegs_r[i + 1].bottomY;
              const gapMm = Math.round((gapTopY - gapBottomY) / 0.01);
              if (gapMm > 0) {
                allLowerDoorSegs_r.push({ bottomY: gapBottomY, topY: gapTopY, heightMm: gapMm, key: `door-gap-${i}`, isUpper: false });
              }
            }
          }

          return (
            <>
              {allLowerDoorSegs_r.map((seg) => (
                <group key={`r-door-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, dimExtZ_r], [0, seg.bottomY, dimZ_r]]} color={doorDimensionColor} />
                  <ExtLine points={[[0, seg.topY, dimExtZ_r], [0, seg.topY, dimZ_r]]} color={doorDimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, seg.bottomY, dimZ_r], [0, seg.topY, dimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, dimZ_r], [0.008, seg.bottomY, dimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.topY, dimZ_r], [0.008, seg.topY, dimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (seg.bottomY + seg.topY) / 2, dimTextZ_r]} fontSize={largeFontSize} color={doorDimensionColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                    {seg.heightMm}
                  </Text>
                </group>
              ))}
              {upperDoorSegs_r.map((seg) => (
                <group key={`r-upper-door-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, upperDimExtZ_r], [0, seg.bottomY, upperDimZ_r]]} color={doorDimensionColor} />
                  <ExtLine points={[[0, seg.topY, upperDimExtZ_r], [0, seg.topY, upperDimZ_r]]} color={doorDimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, seg.bottomY, upperDimZ_r], [0, seg.topY, upperDimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, upperDimZ_r], [0.008, seg.bottomY, upperDimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.topY, upperDimZ_r], [0.008, seg.topY, upperDimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (seg.bottomY + seg.topY) / 2, upperDimZ_r + mmToThreeUnits(60)]} fontSize={largeFontSize} color={doorDimensionColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                    {seg.heightMm}
                  </Text>
                </group>
              ))}
              {(() => {
                if (allLowerDoorSegs_r.length === 0) return null;
                const bottomStartY = floorFinishHeightMm > 0 ? mmToThreeUnits(floorFinishHeightMm) : 0;
                const shouldUseClearanceForBottomGap = (isFloating || modHasBaseOff) && baseFrameHeightMm > 0;
                const lowestBottomY = Math.min(...allLowerDoorSegs_r.map(s => s.bottomY));
                const bottomGuideTopY = shouldUseClearanceForBottomGap
                  ? Math.max(lowestBottomY, bottomStartY + mmToThreeUnits(baseFrameHeightMm))
                  : lowestBottomY;
                const bottomGapMm = Math.round((bottomGuideTopY - bottomStartY) / 0.01);
                if (bottomGapMm <= 0) return null;
                return (
                  <group key="r-door-bottomgap">
                    <ExtLine points={[[0, bottomStartY, dimExtZ_r], [0, bottomStartY, dimZ_r]]} color={doorDimensionColor} />
                    <NativeLine name="dimension_line" points={[[0, bottomStartY, dimZ_r], [0, bottomGuideTopY, dimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[-0.008, bottomStartY, dimZ_r], [0.008, bottomStartY, dimZ_r]]} color={doorDimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <Text position={[0, (bottomStartY + bottomGuideTopY) / 2, dimTextZ_r]} fontSize={largeFontSize} color={doorDimensionColor} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                      {bottomGapMm}
                    </Text>
                  </group>
                );
              })()}
            </>
          );
        })()}

        {/* 바닥마감재 치수 (별도 위치, 우측뷰) — 하부장은 왼쪽 2단에서 표시, 상부장은 받침대 없으므로 제외 */}
        {floorFinishHeightMm > 0 && !isFloating && selectedModCategory !== 'lower' && selectedModCategory !== 'upper' && (
        <group>
            {/* 보조 가이드 연장선 - 바닥: 마감재 끝(spaceDepth/2) 부터 치수선까지 */}
            <ExtLine points={[[0, 0, spaceDepth/2], [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]]} color={dimensionColor} />
            {/* 보조 가이드 연장선 - 마감재 상단: 마감재 끝(spaceDepth/2) 부터 치수선까지 */}
            <ExtLine points={[[0, floorFinishY, spaceDepth/2], [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]]} color={dimensionColor} />
            {/* 메인 치수선 (바닥 ~ 마감재 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 바닥 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.008, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 마감재 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={100001} depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {floorFinishHeightMm}
            </Text>
        </group>
        )}

        {/* 받침대 높이 (마감재 상단 ~ 받침대 상단, 우측뷰) — 하부장은 왼쪽 2단에서 표시, 상부장은 받침대 없으므로 제외 */}
        {baseFrameHeightMm > 0 && selectedModCategory !== 'lower' && selectedModCategory !== 'upper' && (() => {
          const dimZ = spaceDepth / 2 + rightDimOffset - mmToThreeUnits(750);
          const extStartZ = dimZ - mmToThreeUnits(360);
          const gapTopY = floorFinishY + mmToThreeUnits(baseFrameGapMm);
          const segments = baseFrameGapMm > 0
            ? [
              { key: 'gap', bottomY: floorFinishY, topY: gapTopY, heightMm: baseFrameGapMm },
              { key: 'base', bottomY: gapTopY, topY: furnitureBaseY, heightMm: baseFrameDisplayMm },
            ].filter(seg => seg.heightMm > 0)
            : [{ key: 'base', bottomY: floorFinishY, topY: furnitureBaseY, heightMm: baseFrameDisplayMm }];
          const tickYs = [floorFinishY, ...(baseFrameGapMm > 0 ? [gapTopY] : []), furnitureBaseY];
          return (
            <group>
              {tickYs.map((y, index) => (
                <React.Fragment key={`base-full-ext-r-${index}`}>
                  <ExtLine points={[[0, y, extStartZ], [0, y, dimZ]]} color={dimensionColor} />
                  <NativeLine name="dimension_line"
                    points={[[-0.008, y, dimZ], [0.008, y, dimZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                </React.Fragment>
              ))}
              {segments.map((seg) => (
                <group key={`base-full-seg-r-${seg.key}`}>
                  <NativeLine name="dimension_line"
                    points={[[0, seg.bottomY, dimZ], [0, seg.topY, dimZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  <Text
                    position={[0, (seg.bottomY + seg.topY) / 2, dimZ + mmToThreeUnits(seg.key === 'gap' ? 120 : 60)]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={100001} depthTest={false}
                    rotation={[0, Math.PI / 2, Math.PI / 2]}
                  >
                    {seg.heightMm}
                  </Text>
                </group>
              ))}
            </group>
          );
        })()}

        {/* 하부장: 걸레받이+몸통 H, 상부장: 몸통 H — 우측뷰 */}
        {(selectedModCategory === 'lower' || selectedModCategory === 'upper') && selectedMod && (() => {
          let selModData_r = getModuleById(
            selectedMod.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!selModData_r) {
            selModData_r = buildModuleDataFromPlacedModule(selectedMod, internalSpace, spaceInfo);
          }
          if (!selModData_r) return null;
          const selFurnitureHeightMm_r = computeFurnitureHeightMm(selectedMod, selModData_r, spaceInfo, internalSpace);
          const selModCatCombined_r = getModuleCategory(selectedMod);
          const selectedBaseFrameMm_r = selModCatCombined_r === 'lower'
            ? baseFrameHeightMm
            : 0;
          const selectedTopFinishMm_r = selModCatCombined_r === 'lower'
            ? getLowerTopFinishThicknessForModule(selectedMod)
            : 0;
          const selectedDimensionHeightMm_r = selModCatCombined_r === 'lower'
            ? selectedBaseFrameMm_r + selFurnitureHeightMm_r + selectedTopFinishMm_r
            : selFurnitureHeightMm_r;
          const dimensionBottomMm_r = selModCatCombined_r === 'upper'
            ? (isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height)
                - resolveTopFrameDistanceMm(selectedMod, spaceInfo, spaceInfo.frameSize?.top ?? 30, isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height)
                - selFurnitureHeightMm_r
            : floorFinishHeightMm;
          const dimensionTopMm_r = dimensionBottomMm_r + selectedDimensionHeightMm_r;
          const dimensionBottomY_r = mmToThreeUnits(dimensionBottomMm_r);
          const dimensionTopY_r = mmToThreeUnits(dimensionTopMm_r);
          // 가구 도어 앞면 Z 계산
          const panelDepthMm_cr = spaceInfo.depth || 1500;
          const furnitureDepthMm_cr = Math.min(panelDepthMm_cr, 600);
          const zOff_cr = -mmToThreeUnits(panelDepthMm_cr) / 2;
          const fzOff_cr = zOff_cr + (mmToThreeUnits(panelDepthMm_cr) - mmToThreeUnits(furnitureDepthMm_cr)) / 2;
          const doorFrontZ_cr = fzOff_cr + mmToThreeUnits(furnitureDepthMm_cr) / 2;
          // H 치수: 도어 앞면에서 300mm 바깥
          const dimZ_combined_r = doorFrontZ_cr + mmToThreeUnits(300);
          const dimZ_combined_r_ext = doorFrontZ_cr + mmToThreeUnits(30);
          return (
            <group>
              <ExtLine points={[[0, dimensionBottomY_r, dimZ_combined_r_ext], [0, dimensionBottomY_r, dimZ_combined_r]]} color={dimensionColor} />
              <ExtLine points={[[0, dimensionTopY_r, dimZ_combined_r_ext], [0, dimensionTopY_r, dimZ_combined_r]]} color={dimensionColor} />
              <NativeLine name="dimension_line"
                points={[[0, dimensionBottomY_r, dimZ_combined_r], [0, dimensionTopY_r, dimZ_combined_r]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={[[-0.008, dimensionBottomY_r, dimZ_combined_r], [0.008, dimensionBottomY_r, dimZ_combined_r]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={[[-0.008, dimensionTopY_r, dimZ_combined_r], [0.008, dimensionTopY_r, dimZ_combined_r]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <Text
                position={[0, (dimensionBottomY_r + dimensionTopY_r) / 2, dimZ_combined_r + mmToThreeUnits(60)]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={100001} depthTest={false}
                rotation={[0, Math.PI / 2, Math.PI / 2]}
              >
                {Math.round(selectedDimensionHeightMm_r)}
              </Text>
            </group>
          );
        })()}

        {/* 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          // 신발장 계열 판별 + 현관장만 도어 차감
          const midSide_d2 = module.moduleId || '';
          const keyForShoe_d2 = midSide_d2.replace(/-[\d.]+$/, '');
          const isEntrywayH_d2 = midSide_d2.includes('-entryway-');
          const isShelfDrawer_d2 = midSide_d2.includes('-4drawer-shelf-') || midSide_d2.includes('-2drawer-shelf-');
          const isPlainShelf_d2 = /(^|-)shelf$/.test(keyForShoe_d2) && !midSide_d2.includes('upper-cabinet-');
          const isShoeCategory_d2 = (isEntrywayH_d2 || isShelfDrawer_d2 || isPlainShelf_d2) && !midSide_d2.includes('upper-cabinet-');
          // 뒷면 정렬 판정은 신발장 계열 전부 유지
          const isBackAlign_d2 = isEntrywayH_d2 || isShelfDrawer_d2 || isPlainShelf_d2 || midSide_d2.includes('-shelf-');
          const DOOR_THK_MM_D2 = 20;
          const SHOE_LOWER_DEFAULT_MM_D2 = 380;

          // 우선순위: customDepth > upperSection/lowerSection > 기본값
          const hasCustomDepth_d2 = typeof module.customDepth === 'number' && module.customDepth > 0;
          const categoryDefaultDepth_d2 = getCategoryDefaultFurnitureDepth(
            spaceInfo.depth || 600,
            module.moduleId || '',
            spaceInfo.furnitureDepthDefaults
          );
          const upperDepthRaw_d2 = hasCustomDepth_d2
            ? module.customDepth!
            : (module.upperSectionDepth || categoryDefaultDepth_d2 || moduleData.dimensions.depth);
          const lowerDepthRaw_d2 = hasCustomDepth_d2
            ? module.customDepth!
            : (module.lowerSectionDepth ?? (isShoeCategory_d2 ? SHOE_LOWER_DEFAULT_MM_D2 : (categoryDefaultDepth_d2 ?? moduleData.dimensions.depth)));
          const upperDepth = (!hasCustomDepth_d2 && isEntrywayH_d2) ? Math.max(0, upperDepthRaw_d2 - DOOR_THK_MM_D2) : upperDepthRaw_d2;
          const lowerDepth_d2 = (!hasCustomDepth_d2 && isEntrywayH_d2) ? Math.max(0, lowerDepthRaw_d2 - DOOR_THK_MM_D2) : lowerDepthRaw_d2;
          // 신발장 계열이면 항상 상/하부 분리 표시
          const isShoeSide_d2 = isShoeCategory_d2;
          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);
          const moduleDepthLower_d2 = mmToThreeUnits(lowerDepth_d2);

          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const depthEffectiveH_d2 = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
          const furnitureTopEdgeY_d2 = furnitureBaseY + internalHeight;
          const furnitureTopY = mmToThreeUnits(depthEffectiveH_d2) + mmToThreeUnits(200);
          const furnitureBottomDimY_d2 = furnitureBaseY - mmToThreeUnits(200);

          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const isFloating_d2 = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const baseDepthOffset_d2 = isFloating_d2 ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
          // 상부장/신발장은 하부장 뒷면 정렬, 그 외는 앞면 정렬
          const modCategory_d2 = getModuleCategory(module as PlacedModule);
          const isUpperMod_d2 = modCategory_d2 === 'upper';
          const isLowerMod_d2 = modCategory_d2 === 'lower';
          const isKitchenTallCabinet_d2 = (
            midSide_d2.includes('pull-out-cabinet') ||
            midSide_d2.includes('pantry-cabinet') ||
            midSide_d2.includes('fridge-cabinet') ||
            midSide_d2.includes('built-in-fridge')
          );
          const isBackAlignedTallCabinet_d2 = modCategory_d2 === 'full'
            && !isShoeSide_d2
            && !midSide_d2.includes('insert-frame');
          // 신발장 실제 기본 깊이 (380) 또는 의류장/일반 (600) 기준
          const baseModuleDepthMm_d2 = isShoeSide_d2
            ? (module.customDepth || 380)
            : (categoryDefaultDepth_d2 ?? moduleData.dimensions.depth);
          const baseModuleDepth_d2 = mmToThreeUnits(baseModuleDepthMm_d2);
          const moduleBackWallGapZ_d2 = mmToThreeUnits((module as any).backWallGap ?? 0);
          const fixedBackZ_d2 = furnitureZOffset - furnitureDepth / 2 - doorThickness + baseDepthOffset_d2 + moduleBackWallGapZ_d2;
          const baseFrontZ_d2 = furnitureZOffset + furnitureDepth / 2 - doorThickness - baseModuleDepth_d2 / 2 + baseDepthOffset_d2 + moduleBackWallGapZ_d2;
          const baseBackZ_d2 = fixedBackZ_d2 + baseModuleDepth_d2 / 2;
          // 상부 방향 오프셋
          // 하부장 단일 본체는 기준 깊이와 현재 깊이가 같으면 토글해도 같은 위치여야 하고,
          // 깊이가 줄었을 때만 앞고정(back)=앞면 고정 / 뒤고정(front)=뒷면 고정을 적용한다.
          const isLowerSingleBackAligned_d2 = isLowerMod_d2 && !isShoeSide_d2;
          const upperDir_d2 = (module.upperSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const lowerDir_d2 = (module.lowerSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const upperDiff_d2 = baseModuleDepth_d2 - moduleDepth;
          const upperOffset_d2 = upperDiff_d2 === 0 ? 0 : upperDir_d2 === 'back' ? upperDiff_d2/2 : -upperDiff_d2/2;
          const furnitureZ = isLowerSingleBackAligned_d2
            ? (() => {
              const fixedBackZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + moduleBackWallGapZ_d2;
              const baseFrontZEdge = fixedBackZ + baseModuleDepth_d2;
              return lowerDir_d2 === 'back'
                ? baseFrontZEdge - moduleDepth / 2
                : fixedBackZ + moduleDepth / 2;
            })()
            : (isKitchenTallCabinet_d2 || isBackAlignedTallCabinet_d2)
              ? (fixedBackZ_d2 + moduleDepth / 2)
            : (isUpperMod_d2 || isBackAlign_d2)
              ? (baseBackZ_d2 + upperOffset_d2)
              : (baseFrontZ_d2 + upperOffset_d2);
          // 현관장 하부섹션 Z (하부 섹션 direction 반영)
          const lowerDiff_d2 = baseModuleDepth_d2 - moduleDepthLower_d2;
          const lowerOffset_d2 = lowerDiff_d2 === 0 ? 0 : lowerDir_d2 === 'back' ? lowerDiff_d2/2 : -lowerDiff_d2/2;
          const furnitureZLower_d2 = isShoeSide_d2
            ? (baseBackZ_d2 + lowerOffset_d2)
            : furnitureZ;
	          const shouldShowBaseFrameOffset_d2 = isLowerMod_d2 || modCategory_d2 === 'full';
	          const globalBaseFrameOffsetMm_d2 = spaceInfo.baseConfig?.offset ?? (isLowerMod_d2 ? 65 : 0);
	          const baseFrameOffsetMm_d2 = shouldShowBaseFrameOffset_d2
	            ? resolveGuideBaseFrameOffsetMm(module as PlacedModule, spaceInfo, globalBaseFrameOffsetMm_d2)
	            : 0;
          const baseFrameOffsetDepth_d2 = mmToThreeUnits(baseFrameOffsetMm_d2);
          const installedFrontExtensionMm_d2 = getInstalledFrontExtensionMm(module);
          const installedFrontExtension_d2 = mmToThreeUnits(installedFrontExtensionMm_d2);
          const depthLayout_d2 = resolveFurnitureDepthDimensionLayout(module as PlacedModule, moduleData, spaceInfo);
          const upperBackZ_d2 = depthLayout_d2.upper.backZ;
          const upperFrontZ_d2 = depthLayout_d2.upper.frontZ + installedFrontExtension_d2;
          const upperDepthTextZ_d2 = (upperBackZ_d2 + upperFrontZ_d2) / 2;
          const upperDisplayDepth_d2 = Math.round(depthLayout_d2.upper.depthMm + installedFrontExtensionMm_d2);
          const lowerBackZ_d2 = depthLayout_d2.lower.backZ;
          const lowerFrontZ_d2 = depthLayout_d2.lower.frontZ + installedFrontExtension_d2;
          const lowerDepthTextZ_d2 = (lowerBackZ_d2 + lowerFrontZ_d2) / 2;
          const lowerDisplayDepth_d2 = Math.round(depthLayout_d2.lower.depthMm + installedFrontExtensionMm_d2);

          return (
            <group key={`furniture-depth-${index}`}>
              <ExtLine points={[[0, furnitureTopEdgeY_d2, upperFrontZ_d2], [0, furnitureTopY, upperFrontZ_d2]]} color={dimensionColor} />
              <ExtLine points={[[0, furnitureTopEdgeY_d2, upperBackZ_d2], [0, furnitureTopY, upperBackZ_d2]]} color={dimensionColor} />

              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureTopY, upperBackZ_d2],
                  [0, furnitureTopY, upperFrontZ_d2]
                ]}
                color={dimensionColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, upperFrontZ_d2],
                  [0 + 0.02, furnitureTopY, upperFrontZ_d2]
                ]}
                color={dimensionColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, upperBackZ_d2],
                  [0 + 0.02, furnitureTopY, upperBackZ_d2]
                ]}
                color={dimensionColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />

              <Text
                position={[0, furnitureTopY + mmToThreeUnits(80), upperDepthTextZ_d2]}
                fontSize={largeFontSize}
                color={textColor}
                anchorX="center"
                anchorY="middle"
                renderOrder={100001}
                depthTest={false}
                rotation={[0, Math.PI / 2, 0]}
              >
                {upperDisplayDepth_d2}
              </Text>

              {/* 걸래받이 옵셋 깊이 치수 — 우측뷰 하단 */}
              {shouldShowBaseFrameOffset_d2 && baseFrameOffsetMm_d2 > 0 && (module as PlacedModule).hasBase !== false && (() => {
                const furnitureFrontZ = depthLayout_d2.lower.frontZ;
                const frontZ = getBaseFrameReferenceFrontZ(furnitureFrontZ);
                const offsetBackZ = frontZ - baseFrameOffsetDepth_d2;
                const offsetDimY = (furnitureBaseY + furnitureBottomDimY_d2) / 2;

                return (
                  <group>
                    <ExtLine points={[[0, furnitureBaseY, frontZ], [0, offsetDimY, frontZ]]} color={dimensionColor} />
                    <ExtLine points={[[0, furnitureBaseY, offsetBackZ], [0, offsetDimY, offsetBackZ]]} color={dimensionColor} />
                    <NativeLine name="dimension_line"
                      points={[[0, offsetDimY, offsetBackZ], [0, offsetDimY, frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, offsetDimY, frontZ], [0 + 0.02, offsetDimY, frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, offsetDimY, offsetBackZ], [0 + 0.02, offsetDimY, offsetBackZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <Text
                      position={[0, offsetDimY - mmToThreeUnits(40), (frontZ + offsetBackZ) / 2]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={100001}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      {baseFrameOffsetMm_d2}
                    </Text>
                  </group>
                );
              })()}

              {/* ─── 신발장 하부섹션 깊이 — 우측뷰 하단, 상/하부 깊이가 다를 때만 ─── */}
              {isShoeSide_d2 && upperDepth !== lowerDepth_d2 && (
                <>
                  <ExtLine points={[[0, furnitureBaseY, lowerFrontZ_d2], [0, furnitureBottomDimY_d2, lowerFrontZ_d2]]} color={dimensionColor} />
                  <ExtLine points={[[0, furnitureBaseY, lowerBackZ_d2], [0, furnitureBottomDimY_d2, lowerBackZ_d2]]} color={dimensionColor} />
                  <NativeLine name="dimension_line"
                    points={[[0, furnitureBottomDimY_d2, lowerBackZ_d2], [0, furnitureBottomDimY_d2, lowerFrontZ_d2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, furnitureBottomDimY_d2, lowerFrontZ_d2], [0 + 0.02, furnitureBottomDimY_d2, lowerFrontZ_d2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, furnitureBottomDimY_d2, lowerBackZ_d2], [0 + 0.02, furnitureBottomDimY_d2, lowerBackZ_d2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  <Text
                    position={[0, furnitureBottomDimY_d2 - mmToThreeUnits(40), lowerDepthTextZ_d2]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={100001} depthTest={false}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    {lowerDisplayDepth_d2}
                  </Text>
                </>
              )}

              {/* 상부장 하부마감판 깊이 치수 (우측뷰) — 하부 EP 체크 해제 시 미표시 */}
              {(() => {
                const mod = module as PlacedModule;
                const modCat = getModuleCategory(mod);
                if (modCat !== 'upper') return null;
                if ((mod as any).hasBottomEndPanel === false) return null;

                const modHeightMm_r = computeFurnitureHeightMm(mod, moduleData!, spaceInfo, internalSpace);
                const depthEffH_r = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
                const topFrameVal_r = resolveTopFrameDistanceMm(mod, spaceInfo, spaceInfo.frameSize?.top ?? 30, depthEffH_r);
                const cabinetTopMm_r = depthEffH_r - topFrameVal_r;
                const cabinetBottomMm_r = cabinetTopMm_r - modHeightMm_r;
                const furnitureBottomEdge_r = mmToThreeUnits(cabinetBottomMm_r);

                const frontGapMm_r = (mod as any).bottomEndPanelOffset ?? 0;
                const backGapMm_r = (mod as any).bottomEndPanelBackOffset ?? -35;
                const backInsetMm_r = Math.abs(backGapMm_r);
                const finishDepthMm_r = Math.max(0, depthLayout_d2.upper.depthMm - frontGapMm_r - backInsetMm_r);
                const finishDepth_r = mmToThreeUnits(finishDepthMm_r);
                const finishZ_r = depthLayout_d2.upper.centerZ + mmToThreeUnits((backInsetMm_r - frontGapMm_r) / 2);
                const finishDimY_r = furnitureBottomEdge_r - mmToThreeUnits(80);
                const cabinetBackZ_r = depthLayout_d2.upper.backZ;
                const cabinetFrontZ_r = depthLayout_d2.upper.frontZ;
                const finishBackZ_r = finishZ_r - finishDepth_r / 2;
                const offsetMm_r = backGapMm_r;

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge_r, finishZ_r + finishDepth_r/2], [0, finishDimY_r, finishZ_r + finishDepth_r/2]]} color={dimensionColor} />
                    {/* 보조 가이드 연장선 - 마감판 뒤쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge_r, finishBackZ_r], [0, finishDimY_r, finishBackZ_r]]} color={dimensionColor} />
                    {/* 보조 가이드 연장선 - 가구 뒤쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge_r, cabinetBackZ_r], [0, finishDimY_r, cabinetBackZ_r]]} color={dimensionColor} />

                    {/* 마감판 깊이 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, finishDimY_r, finishBackZ_r], [0, finishDimY_r, finishZ_r + finishDepth_r/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY_r, finishZ_r + finishDepth_r/2], [0 + 0.02, finishDimY_r, finishZ_r + finishDepth_r/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY_r, finishBackZ_r], [0 + 0.02, finishDimY_r, finishBackZ_r]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <Text
                      position={[0, finishDimY_r - mmToThreeUnits(40), finishZ_r]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={100001} depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      {finishDepthMm_r}
                    </Text>

                    {/* 갭 치수선 (가구 뒷면 ~ 마감판 뒷면) — 같은 높이 */}
                    {backInsetMm_r > 0 && (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[0, finishDimY_r, cabinetBackZ_r], [0, finishDimY_r, finishBackZ_r]]}
                          color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={[[0 - 0.02, finishDimY_r, cabinetBackZ_r], [0 + 0.02, finishDimY_r, cabinetBackZ_r]]}
                          color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                        />
                        <Text
                          position={[0, finishDimY_r - mmToThreeUnits(40), (cabinetBackZ_r + finishBackZ_r) / 2]}
                          fontSize={largeFontSize} color={textColor}
                          anchorX="center" anchorY="middle"
                          renderOrder={100001} depthTest={false}
                          rotation={[0, Math.PI / 2, 0]}
                        >
                          {offsetMm_r}
                        </Text>
                      </>
                    )}

                    {/* 전면갭 치수선 (마감판 앞면 ~ 가구 앞면) — 전면갭 > 0 일 때만 표시 */}
                    {frontGapMm_r > 0 && (() => {
                      const finishFrontZ_r = finishZ_r + finishDepth_r / 2;
                      return (
                        <>
                          <ExtLine points={[[0, furnitureBottomEdge_r, cabinetFrontZ_r], [0, finishDimY_r, cabinetFrontZ_r]]} color={dimensionColor} />
                          <NativeLine name="dimension_line"
                            points={[[0, finishDimY_r, finishFrontZ_r], [0, finishDimY_r, cabinetFrontZ_r]]}
                            color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                          />
                          <NativeLine name="dimension_line"
                            points={[[0 - 0.02, finishDimY_r, cabinetFrontZ_r], [0 + 0.02, finishDimY_r, cabinetFrontZ_r]]}
                            color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                          />
                          <Text
                            position={[0, finishDimY_r - mmToThreeUnits(40), (finishFrontZ_r + cabinetFrontZ_r) / 2]}
                            fontSize={largeFontSize} color={textColor}
                            anchorX="center" anchorY="middle"
                            renderOrder={100001} depthTest={false}
                            rotation={[0, Math.PI / 2, 0]}
                          >
                            {frontGapMm_r}
                          </Text>
                        </>
                      );
                    })()}
                  </group>
                );
              })()}

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {(module.lowerSectionDepth !== undefined) && (() => {
                const lowerDepth = module.lowerSectionDepth;
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - lowerModuleDepth/2;
                const lowerBackZ = lowerFurnitureZ - lowerModuleDepth / 2;
                const lowerFrontZ = lowerFurnitureZ + lowerModuleDepth / 2 + installedFrontExtension_d2;
                const lowerTextZ = (lowerBackZ + lowerFrontZ) / 2;
                const lowerDisplayDepth = Math.round(lowerDepth + installedFrontExtensionMm_d2);
                const lowerDimY = floatHeight - mmToThreeUnits(200); // 하단 치수선 위치 (가구 바닥 아래)

                return (
                  <group>
                    <ExtLine points={[[0, floatHeight, lowerFrontZ], [0, lowerDimY, lowerFrontZ]]} color={dimensionColor} />
                    <ExtLine points={[[0, floatHeight, lowerBackZ], [0, lowerDimY, lowerBackZ]]} color={dimensionColor} />

                    <NativeLine name="dimension_line"
                      points={[
                        [0, lowerDimY, lowerBackZ],
                        [0, lowerDimY, lowerFrontZ]
                      ]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerFrontZ],
                        [0 + 0.02, lowerDimY, lowerFrontZ]
                      ]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerBackZ],
                        [0 + 0.02, lowerDimY, lowerBackZ]
                      ]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <Text
                      position={[0, lowerDimY - mmToThreeUnits(80), lowerTextZ]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={100001}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      {lowerDisplayDepth}
                    </Text>
                  </group>
                );
              })()}
            </group>
          );
        })}


        {/* ===== 도어/마이다 높이 치수선 (우측뷰) ===== */}
        {(() => {
          const panelDepthMm_door = spaceInfo.depth || 1500;
          const panelDepthU_door = mmToThreeUnits(panelDepthMm_door);
          const furnitureDepthU_door = mmToThreeUnits(600);
          const furnitureFrontZ_door = -panelDepthU_door / 2 + (panelDepthU_door - furnitureDepthU_door) / 2 + furnitureDepthU_door / 2;
          const doorDimZ_r = furnitureFrontZ_door + mmToThreeUnits(200);
          const doorColor_r = doorDimensionColor;

          // 측면뷰에 보이는 가구만 대상 (visibleFurniture 기반)
          const visibleIds_r = new Set(visibleFurniture.map(m => m.id));
          const doorModules_r = placedModules.filter(m =>
            !m.isSurroundPanel && visibleIds_r.has(m.id) && m.hasDoor
          );
          if (doorModules_r.length === 0) return null;

          const effectiveH_r = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
          const elements_r: JSX.Element[] = [];

          doorModules_r.forEach((mod, modIdx) => {
            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod as PlacedModule, internalSpace, spaceInfo);

            const modCategory = modData?.category
              ?? (mod.moduleId.includes('-upper-') ? 'upper'
                : mod.moduleId.startsWith('lower-') ? 'lower' : 'full');

            const isDrawerModule = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');

            if (modCategory === 'lower' && isDrawerModule) {
              const modHeightMm = modData ? computeFurnitureHeightMm(mod as PlacedModule, modData, spaceInfo, internalSpace) : 0;
              const isDL_r = mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-');
              const isTD_r = mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-');
              const modDefaultTopGap_r = isDL_r ? 30 : isTD_r ? getTopDownDoorTopGap(mod.stoneTopThickness, mod.hasTopEndPanel === true) : -20;
              const effectiveTopGap_r = isTD_r && (mod.doorTopGap === undefined || mod.doorTopGap === 0)
                ? modDefaultTopGap_r
                : (mod.doorTopGap ?? modDefaultTopGap_r);
              const effectiveBotGap_r = mod.doorBottomGap ?? 5;
              const topFinishThicknessForMaida_r = isTD_r
                ? getLowerTopFinishThicknessForModule(mod as PlacedModule)
                : getStoneTopThicknessMm(mod);
              const lowerMaidas = computeLowerCabinetMaidaHeights(mod.moduleId, modHeightMm, effectiveTopGap_r, effectiveBotGap_r, topFinishThicknessForMaida_r, (mod as any).customMaidaHeights, mod.hasTopEndPanel === true);
              if (lowerMaidas && lowerMaidas.length > 0) {
                const cabinetBottomY_r = furnitureBaseY;

                const gaps_r: { bottomMm: number; topMm: number; heightMm: number; absCoord?: boolean }[] = [];
                // 하단 갭: 바닥~마이다 하단 거리
                const firstMaida_r = lowerMaidas[0];
                const floorToMaidaBottomMm_r = baseFrameHeightMm + firstMaida_r.maidaBottomMm;
                const useFloorBottomGapForMaida_r = (isFloating || modHasBaseOff) && baseFrameHeightMm > 0;
                if (firstMaida_r.maidaBottomMm > 0) {
                  if (useFloorBottomGapForMaida_r) {
                    const floorGapMm_r = baseFrameHeightMm + firstMaida_r.maidaBottomMm;
                    gaps_r.push({ bottomMm: 0, topMm: floorGapMm_r, heightMm: Math.round(floorGapMm_r), absCoord: true });
                  } else {
                    gaps_r.push({ bottomMm: 0, topMm: firstMaida_r.maidaBottomMm, heightMm: Math.round(firstMaida_r.maidaBottomMm) });
                  }
                } else if (firstMaida_r.maidaBottomMm < 0 && Math.abs(floorToMaidaBottomMm_r) >= 1) {
                  const bottomClearanceMm_r = useFloorBottomGapForMaida_r
                    ? Math.max(baseFrameHeightMm, floorToMaidaBottomMm_r)
                    : floorToMaidaBottomMm_r;
                  gaps_r.push({ bottomMm: 0, topMm: bottomClearanceMm_r, heightMm: Math.round(bottomClearanceMm_r), absCoord: true });
                }
                // 마이다 사이 갭
                for (let gi = 0; gi < lowerMaidas.length - 1; gi++) {
                  const gapBotMm = lowerMaidas[gi].maidaTopMm;
                  const gapTopMm = lowerMaidas[gi + 1].maidaBottomMm;
                  if (gapTopMm - gapBotMm > 0) {
                    gaps_r.push({ bottomMm: gapBotMm, topMm: gapTopMm, heightMm: Math.round(gapTopMm - gapBotMm) });
                  }
                }
                // 상단 갭: 마지막 마이다 상단 ~ 캐비넷 상단
                const lastMaida_r = lowerMaidas[lowerMaidas.length - 1];
                const topGapTotal_r = modHeightMm - lastMaida_r.maidaTopMm;
                if (topGapTotal_r > 0) {
                  const topFinishThicknessForTopDown_r = isTD_r ? topFinishThicknessForMaida_r : _stoneTopThk(mod);
                  if (isTD_r && topFinishThicknessForTopDown_r > 0) {
                    const frontPlateTopMm_r = modHeightMm + topFinishThicknessForTopDown_r;
                    const frontPlateBottomMm_r = frontPlateTopMm_r - TOP_DOWN_STONE_FRONT_HEIGHT_MM;
                    const doorGapMm = Math.round(frontPlateBottomMm_r - lastMaida_r.maidaTopMm);
                    if (doorGapMm > 0) {
                      gaps_r.push({ bottomMm: lastMaida_r.maidaTopMm, topMm: frontPlateBottomMm_r, heightMm: doorGapMm });
                    }
                    gaps_r.push({ bottomMm: frontPlateBottomMm_r, topMm: frontPlateTopMm_r, heightMm: TOP_DOWN_STONE_FRONT_HEIGHT_MM });
                  } else {
                    gaps_r.push({ bottomMm: lastMaida_r.maidaTopMm, topMm: modHeightMm, heightMm: Math.round(topGapTotal_r) });
                  }
                }

                elements_r.push(
                  <group key={`r-door-maida-group-${modIdx}`}>
                    {lowerMaidas.map((m, i) => {
                      const dBotY = cabinetBottomY_r + mmToThreeUnits(m.maidaBottomMm);
                      const dTopY = cabinetBottomY_r + mmToThreeUnits(m.maidaTopMm);
                      return (
                        <group key={`r-door-maida-${modIdx}-${i}`}>
                          <NativeLine name="drawer_height_dim" points={[[0, dBotY, doorDimZ_r], [0, dTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, dBotY, doorDimZ_r], [0.008, dBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, dTopY, doorDimZ_r], [0.008, dTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text name="drawer_height_dim_text" position={[0, (dBotY + dTopY) / 2, doorDimZ_r + mmToThreeUnits(60)]} fontSize={largeFontSize} color={doorColor_r} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                            {Number.isInteger(m.maidaHeightMm) ? m.maidaHeightMm.toString() : (Math.round(m.maidaHeightMm * 10) / 10).toString()}
                          </Text>
                          <ExtLine points={[[0, dTopY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, dTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="drawer_height_ext" />
                          <ExtLine points={[[0, dBotY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, dBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="drawer_height_ext" />
                        </group>
                      );
                    })}
                    {gaps_r.map((gap, gi) => {
                      const floorBaselineY_r = floorFinishHeightMm > 0 ? mmToThreeUnits(floorFinishHeightMm) : 0;
                      const gBotY = gap.absCoord ? floorBaselineY_r + mmToThreeUnits(gap.bottomMm) : cabinetBottomY_r + mmToThreeUnits(gap.bottomMm);
                      const gTopY = gap.absCoord ? floorBaselineY_r + mmToThreeUnits(gap.topMm) : cabinetBottomY_r + mmToThreeUnits(gap.topMm);
                      return (
                        <group key={`r-door-gap-${modIdx}-${gi}`}>
                          <NativeLine name="drawer_height_dim" points={[[0, gBotY, doorDimZ_r], [0, gTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, gBotY, doorDimZ_r], [0.008, gBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="drawer_height_dim" points={[[-0.008, gTopY, doorDimZ_r], [0.008, gTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text name="drawer_height_dim_text" position={[0, (gBotY + gTopY) / 2, doorDimZ_r + mmToThreeUnits(60)]} fontSize={largeFontSize} color={doorColor_r} anchorX="center" anchorY="middle" renderOrder={100001} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                            {gap.heightMm}
                          </Text>
                          <ExtLine points={[[0, gTopY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, gTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="drawer_height_ext" />
                          <ExtLine points={[[0, gBotY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, gBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="drawer_height_ext" />
                        </group>
                      );
                    })}
                  </group>
                );
                return;
              }
            }
          });

          return elements_r.length > 0 ? <group>{elements_r}</group> : null;
        })()}

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
                  lineWidth={0.3}
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
                lineWidth={0.5}
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
