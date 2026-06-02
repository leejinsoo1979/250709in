import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import { calculateSpaceIndexing, recalculateWithCustomWidths } from '@/editor/shared/utils/indexing';
import { resolvePetPanelThicknessMm } from '@/editor/shared/utils/panelThickness';

const MM_TO_THREE = 0.01;

const getSlotSpan = (module: PlacedModule): number => (
  module.isDualSlot || module.moduleId?.includes('dual-') ? 2 : 1
);

const shouldSkipWidthAdjustment = (module: PlacedModule): boolean => (
  module.isFreePlacement === true ||
  module.isSurroundPanel === true ||
  module.slotCustomWidth !== undefined ||
  module.moduleId?.includes('insert-frame') === true ||
  module.moduleId?.includes('built-in-fridge') === true
);

const isFrontSlotModule = (module: PlacedModule): boolean => (
  (module.placementWall || 'front') === 'front' &&
  module.isFreePlacement !== true &&
  module.isSurroundPanel !== true &&
  typeof module.slotIndex === 'number'
);

const getOutsideEpThickness = (module: PlacedModule, side: 'left' | 'right'): number => {
  if (module.endPanelMode !== 'outside') return 0;
  if (side === 'left' && !module.hasLeftEndPanel) return 0;
  if (side === 'right' && !module.hasRightEndPanel) return 0;
  return Math.max(0, resolvePetPanelThicknessMm(module.endPanelThickness));
};

const getZoneIndexing = (
  spaceInfo: SpaceInfo,
  modules: PlacedModule[],
  zone: 'normal' | 'dropped'
) => {
  const baseIndexing = calculateSpaceIndexing(spaceInfo);
  const hasCustomWidthModules = modules.some(module =>
    isFrontSlotModule(module) &&
    (module.zone || 'normal') === zone &&
    module.slotCustomWidth !== undefined
  );

  if (spaceInfo.droppedCeiling?.enabled && baseIndexing.zones) {
    const zoneBase = zone === 'dropped' ? baseIndexing.zones.dropped : baseIndexing.zones.normal;
    if (!zoneBase) return null;
    return hasCustomWidthModules
      ? recalculateWithCustomWidths(zoneBase as any, modules, zone)
      : zoneBase;
  }

  return hasCustomWidthModules
    ? recalculateWithCustomWidths(baseIndexing, modules, zone)
    : baseIndexing;
};

const getSlotWidth = (zoneIndexing: any, slotIndex: number): number => (
  zoneIndexing?.slotWidths?.[slotIndex] ??
  zoneIndexing?.columnWidth ??
  0
);

const getSlotCenterX = (zoneIndexing: any, slotIndex: number): number | undefined => (
  zoneIndexing?.threeUnitPositions?.[slotIndex]
);

const findOutsideEpTrims = (
  module: PlacedModule,
  modules: PlacedModule[]
): { left: number; right: number } => {
  const slotIndex = module.slotIndex;
  if (typeof slotIndex !== 'number') return { left: 0, right: 0 };

  const zone = module.zone || 'normal';
  const wall = module.placementWall || 'front';
  const span = getSlotSpan(module);
  const start = slotIndex;
  const end = slotIndex + span - 1;

  let left = 0;
  let right = 0;

  modules.forEach(other => {
    if (other.id === module.id || !isFrontSlotModule(other)) return;
    if ((other.zone || 'normal') !== zone || (other.placementWall || 'front') !== wall) return;

    const otherStart = other.slotIndex as number;
    const otherEnd = otherStart + getSlotSpan(other) - 1;

    if (otherEnd === start - 1) {
      left = Math.max(left, getOutsideEpThickness(other, 'right'));
    }
    if (otherStart === end + 1) {
      right = Math.max(right, getOutsideEpThickness(other, 'left'));
    }
  });

  return { left, right };
};

export const applySlotOutsideEpAdjustments = (
  modules: PlacedModule[],
  spaceInfo: SpaceInfo
): PlacedModule[] => {
  if (spaceInfo.layoutMode === 'free-placement') return modules;

  return modules.map(module => {
    if (shouldSkipWidthAdjustment(module) || typeof module.slotIndex !== 'number') return module;

    const zone = (module.zone || 'normal') as 'normal' | 'dropped';
    const zoneIndexing = getZoneIndexing(spaceInfo, modules, zone);
    if (!zoneIndexing) return module;

    const span = getSlotSpan(module);
    const start = module.slotIndex;
    const end = start + span - 1;
    const baseCenterX = span > 1
      ? (() => {
        const first = getSlotCenterX(zoneIndexing, start);
        const last = getSlotCenterX(zoneIndexing, end);
        return first !== undefined && last !== undefined ? (first + last) / 2 : undefined;
      })()
      : getSlotCenterX(zoneIndexing, start);

    if (baseCenterX === undefined) return module;

    const baseWidth = Array.from({ length: span }, (_, index) => getSlotWidth(zoneIndexing, start + index))
      .reduce((sum, width) => sum + width, 0);
    if (baseWidth <= 0) return module;

    const trims = findOutsideEpTrims(module, modules);
    const adjustedWidth = Math.max(1, baseWidth - trims.left - trims.right);
    const adjustedX = baseCenterX + ((trims.left - trims.right) / 2) * MM_TO_THREE;
    const needsWidthUpdate = Math.abs((module.customWidth ?? 0) - adjustedWidth) >= 0.5;
    const needsPositionUpdate = Math.abs((module.position?.x ?? adjustedX) - adjustedX) > 1e-6;

    if (!needsWidthUpdate && !needsPositionUpdate) return module;

    return {
      ...module,
      customWidth: adjustedWidth,
      position: {
        ...module.position,
        x: adjustedX,
      },
    };
  });
};
