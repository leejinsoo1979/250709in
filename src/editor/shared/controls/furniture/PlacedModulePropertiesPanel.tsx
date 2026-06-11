import React, { useState, useEffect, useCallback } from 'react';
import { FaExchangeAlt } from 'react-icons/fa';
import { useSpaceConfigStore, FURNITURE_LIMITS } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, buildModuleDataFromPlacedModule, ModuleData, calculateEvenShelfPositions } from '@/data/modules';
import type { SectionConfig } from '@/data/modules';
import { calculateInternalSpace, calculateTopBottomFrameHeight, calculateBaseFrameHeight } from '../../viewer3d/utils/geometry';
import { analyzeColumnSlots } from '../../utils/columnSlotProcessor';
import { calculateSpaceIndexing } from '../../utils/indexing';
import { useTranslation } from '@/i18n/useTranslation';
import { calculatePanelDetails, calculateSurroundPanels } from '@/editor/shared/utils/calculatePanelDetails';
import {
  findRenderedPanelDimension,
  findRenderedPanelDimensions,
  getRenderedPanelDimensionsSnapshot,
  subscribeRenderedPanelDimensions
} from '@/editor/shared/utils/renderedPanelDimensionRegistry';
import {
  findDoorHingeGeometry,
  getDoorHingeGeometrySnapshot,
  subscribeDoorHingeGeometry
} from '@/editor/shared/utils/doorHingeGeometryRegistry';
import {
  applyFramePanelListWidthFallback,
  stripFramePanelListFallbackMarker
} from '@/editor/shared/utils/framePanelListDimensions';
import { withUpperSafetyShelfRemoved, isUpperSafetyShelfModule } from '@/editor/shared/utils/upperSafetyShelf';
import { getDefaultGrainDirection } from '@/editor/shared/utils/materialConstants';
import { isCustomizableModuleId, getCustomDimensionKey, getStandardDimensionKey } from './CustomizableFurnitureLibrary';
import { calcInsertFrameResizedPositionX, calcResizedPositionX, getModuleBoundsX, getModuleCategory, resolveInsertFrameResizeHingePosition } from '@/editor/shared/utils/freePlacementUtils';
import { parseBackWallGapInput, stepBackWallGapMm } from '@/editor/shared/utils/backWallGapValidation';
import { getDefaultFurnitureDepth, getCategoryDefaultFurnitureDepth, computeLowerFrontAlignedGaps } from '@/editor/shared/utils/furnitureDepthDefaults';
import { resolveCountertopThicknessMm } from '@/editor/shared/utils/countertopHeightCompensation';
import {
  normalizeDoorHingePositionsMm,
  resolveDefaultDoorHingePositionsMm,
  resolveDoorVerticalGeometry,
  resolveHingeGapEditPlan,
  resolveHingeGapEqualizePlan,
  resolveHingeOppositeDoorWidthAdjustment,
  resolveSideAnchoredDoorHingePositionsMm,
  type DoorCabinetCategory,
  type DoorHingeMode
} from '@/editor/shared/utils/doorGeometryCalculator';
import { resolveDoorOuterOpenSides } from '@/editor/shared/utils/doorOuterGap';
import { Lock, Unlock } from 'lucide-react';
import { resolveDrawerRailSizingMm } from '@/editor/shared/utils/drawerRailSizing';
import { isDummyModuleId } from '@/editor/shared/utils/dummyModule';
import { FurniturePresetButtons } from './FurniturePresetButtons';
import { useAlert } from '@/contexts/AlertContext';
import styles from './PlacedModulePropertiesPanel.module.css';
import {
  PET_PANEL_THICKNESS_MM,
  TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM,
  isBasicLowerTopEndPanelDoorGapModuleId,
  isDoorLiftTopEndPanelModuleId,
  resolvePetPanelThicknessMm,
  resolveTopEndPanelFrontOffsetMm
} from '@/editor/shared/utils/panelThickness';
import { computeLowerCabinetExternalMaidaRanges } from '@/editor/shared/utils/lowerCabinetMaidaGeometry';

// 가구 썸네일 이미지 경로 — ModuleGallery와 동일한 규칙
const getImagePath = (filename: string) => {
  return `/images/furniture-thumbnails/${filename}`;
};

const isPlainShoeShelfModuleId = (moduleId?: string): boolean => {
  if (!moduleId) return false;
  return /(^|-)(?:single|dual)-shelf-/.test(moduleId)
    && !moduleId.includes('-4drawer-shelf-')
    && !moduleId.includes('-2drawer-shelf-')
    && !moduleId.includes('shelf-split');
};

const isShelfSplitModuleId = (moduleId?: string): boolean => {
  return !!moduleId?.includes('shelf-split');
};

const isDoorSplitModuleId = (moduleId?: string): boolean => {
  return !!moduleId && (moduleId.includes('shelf-split') || moduleId.includes('pantry-cabinet-split'));
};

const applyRenderedPanelDimension = (panel: any, furnitureId?: string) => {
  if (!panel?.name || !furnitureId) return panel;
  if (!panel.width && !panel.height && !panel.depth) return panel;

  const rendered = findRenderedPanelDimension(furnitureId, panel.name);
  if (!rendered) return panel;
  return applyRenderedPanelDimensionItem(panel, rendered);
};

const applyRenderedPanelDimensionItem = (panel: any, rendered: any) => {
  const next = { ...panel };
  const panelThickness = Number(panel.thickness);
  const xIsThickness = Number.isFinite(panelThickness)
    ? Math.abs(rendered.widthMm - panelThickness) <= Math.abs(rendered.depthMm - panelThickness)
    : rendered.widthMm <= rendered.depthMm && rendered.widthMm <= rendered.heightMm;

  if (panel.width !== undefined && panel.height !== undefined) {
    next.width = xIsThickness ? rendered.depthMm : rendered.widthMm;
    next.height = rendered.heightMm;
    next.thickness = xIsThickness ? rendered.widthMm : rendered.depthMm;
  } else if (panel.width !== undefined && panel.depth !== undefined) {
    next.width = rendered.widthMm;
    next.depth = rendered.depthMm;
    next.thickness = rendered.heightMm;
  } else if (panel.height !== undefined && panel.depth !== undefined) {
    next.height = rendered.heightMm;
    next.depth = xIsThickness ? rendered.depthMm : rendered.widthMm;
    next.thickness = xIsThickness ? rendered.widthMm : rendered.depthMm;
  } else if (panel.width !== undefined) {
    next.width = xIsThickness ? rendered.depthMm : rendered.widthMm;
    next.thickness = xIsThickness ? rendered.widthMm : rendered.depthMm;
  } else if (panel.height !== undefined) {
    next.height = rendered.heightMm;
    next.thickness = xIsThickness ? rendered.widthMm : rendered.depthMm;
  } else if (panel.depth !== undefined) {
    next.depth = rendered.depthMm;
    next.thickness = rendered.heightMm;
  }

  return stripFramePanelListFallbackMarker(next);
};

const applyRenderedPanelDimensions = (panel: any, furnitureId?: string) => {
  if (!panel?.name || !furnitureId) return [panel];
  if (!panel.width && !panel.height && !panel.depth) return [panel];

  const renderedItems = findRenderedPanelDimensions(furnitureId, panel.name);
  if (
    panel.__preferFrameWidthFallback === true &&
    renderedItems.length > 0 &&
    renderedItems.every(rendered => rendered.sourceScope === 'shared')
  ) {
    return [stripFramePanelListFallbackMarker(panel)];
  }
  if (renderedItems.length <= 1) return [stripFramePanelListFallbackMarker(applyRenderedPanelDimension(panel, furnitureId))];

  return renderedItems.map((rendered, index) => {
    const next = applyRenderedPanelDimensionItem(panel, rendered);

    return {
      ...stripFramePanelListFallbackMarker(next),
      name: `${panel.name} ${index + 1}`,
    };
  });
};

const isHangingWardrobeModuleId = (moduleId?: string): boolean => {
  return !!moduleId?.includes('hanging');
};

const getTopDownDoorTopGap = (stoneTopThickness?: number, hasTopEndPanel?: boolean): number => {
  if (hasTopEndPanel) return -82;
  if (stoneTopThickness === 10) return -90;
  if (stoneTopThickness === 30) return -70;
  return -80;
};

const BASIC_LOWER_DOOR_TOP_GAP_DEFAULT = -20;
const DOOR_LIFT_DOOR_TOP_GAP_DEFAULT = 40;
const DOOR_LIFT_TOP_EP_COLLISION_GAP = -3;

const isBasicLowerDoorGapModuleId = (moduleId?: string): boolean => {
  return isBasicLowerTopEndPanelDoorGapModuleId(moduleId);
};

const usesStableShelfSectionBoundary = (moduleId?: string): boolean => {
  return isPlainShoeShelfModuleId(moduleId) || isShelfSplitModuleId(moduleId) || isHangingWardrobeModuleId(moduleId);
};

const getStableShelfSectionOffsets = (module: any, spaceInfo: any) => {
  if (isShelfSplitModuleId(module?.moduleId)) {
    return { baseAbsorbedMm: 0, floatAbsorbedMm: 0, baseFrameDeltaMm: 0 };
  }
  const globalBaseMm = spaceInfo?.baseConfig?.type === 'floor'
    ? (spaceInfo?.baseConfig?.height ?? 60)
    : 0;
  const baseAbsorbedMm = module?.hasBase === false
    ? globalBaseMm
    : 0;
  const isFloatPlacement = spaceInfo?.baseConfig?.type === 'stand'
    && spaceInfo?.baseConfig?.placementType === 'float';
  const globalFloatMm = isFloatPlacement ? Math.max(0, spaceInfo?.baseConfig?.floatHeight ?? 0) : 0;
  const floatAbsorbedMm = module?.hasBase === false
    ? Math.max(0, module?.individualFloatHeight ?? 0)
    : globalFloatMm;
  const baseFrameDeltaMm = isHangingWardrobeModuleId(module?.moduleId)
    && module?.hasBase !== false
    && typeof module?.baseFrameHeight === 'number'
    ? module.baseFrameHeight - globalBaseMm
    : 0;
  return { baseAbsorbedMm, floatAbsorbedMm, baseFrameDeltaMm };
};

const getPlainShoeShelfSectionHeights = (
  module: any,
  spaceInfo: any,
  sections: SectionConfig[],
  sectionBasisH: number
): number[] | null => {
  if (!usesStableShelfSectionBoundary(module?.moduleId) || sections.length !== 2) return null;
  const sourceSections = Array.isArray(module?.customSections)
    && module.customSections.length >= 2
    ? module.customSections
    : sections;
  const { baseAbsorbedMm, floatAbsorbedMm, baseFrameDeltaMm } = getStableShelfSectionOffsets(module, spaceInfo);
  const lowerH = isShelfSplitModuleId(module?.moduleId)
    ? Math.max(0, Math.round(sourceSections[0]?.height || 0))
    : Math.max(0, Math.round((sourceSections[0]?.height || 0) + baseAbsorbedMm - floatAbsorbedMm - baseFrameDeltaMm));
  const remainingUpperH = Math.max(0, Math.round(sectionBasisH - lowerH));
  const hasExplicitShelfSplitSections = isShelfSplitModuleId(module?.moduleId)
    && Array.isArray(module?.customSections);
  const upperH = hasExplicitShelfSplitSections
    ? Math.min(remainingUpperH, Math.max(0, Math.round(sourceSections[1]?.height || 0)))
    : remainingUpperH;
  return [lowerH, upperH];
};

const recalculateSectionShelves = (section: any, height: number, thickness: number) => {
  const updated: any = { ...section, height: Math.round(height), heightType: 'absolute' };
  if ((section.type === 'shelf' || section.type === 'open') && (section.count > 0 || (Array.isArray(section.shelfPositions) && section.shelfPositions.length > 0))) {
    const shelfCount = section.count || (section.shelfPositions?.length ?? 0);
    const innerH = Math.max(0, Math.round(height) - 2 * thickness);
    updated.shelfPositions = calculateEvenShelfPositions(innerH, shelfCount, thickness);
  }
  return updated;
};

const resolveStandardSectionHeights = (
  sections: any[],
  sectionBasisH: number
): number[] => {
  const roundedBasis = Math.max(0, Math.round(sectionBasisH || 0));
  const heights = sections.map((section, index) => {
    const isLast = index === sections.length - 1;
    if (isLast) return 0;
    if ((section.heightType || 'percentage') === 'absolute') {
      return Math.max(0, Math.round(section.height || 0));
    }
    const ratio = (section.height || section.heightRatio || 50) / 100;
    return Math.max(0, Math.round(roundedBasis * ratio));
  });
  const fixedBeforeLast = heights.slice(0, -1).reduce((sum, height) => sum + height, 0);
  heights[sections.length - 1] = Math.max(0, roundedBasis - fixedBeforeLast);
  return heights;
};

const buildSectionsWithUpperAbsorbingBodyHeight = (
  sections: any[],
  currentSectionBasisH: number,
  requestedBodyHeight: number,
  thickness: number
) => {
  if (!Array.isArray(sections) || sections.length < 2) {
    return { bodyHeight: Math.max(100, Math.round(requestedBodyHeight)), sections: undefined };
  }
  const currentHeights = resolveStandardSectionHeights(sections, currentSectionBasisH);
  const fixedLowerSum = currentHeights.slice(0, -1).reduce((sum, height) => sum + height, 0);
  const bodyHeight = Math.max(Math.round(requestedBodyHeight), fixedLowerSum + 100);
  const nextHeights = currentHeights.map((height, index) => (
    index === currentHeights.length - 1
      ? Math.max(100, bodyHeight - fixedLowerSum)
      : height
  ));
  return {
    bodyHeight,
    sections: sections.map((section, index) => recalculateSectionShelves(section, nextHeights[index], thickness)),
  };
};

const buildOppositeAbsorbedStandardSections = (
  sections: any[],
  sectionBasisH: number,
  editedIndex: number,
  requestedHeight: number,
  thickness: number
) => {
  if (!Array.isArray(sections) || sections.length < 2) return null;
  const currentHeights = resolveStandardSectionHeights(sections, sectionBasisH);
  const lastIndex = sections.length - 1;
  const absorbIndex = editedIndex === lastIndex ? 0 : lastIndex;
  const nextEditedHeight = Math.max(100, Math.round(requestedHeight));
  const nextHeights = [...currentHeights];
  nextHeights[editedIndex] = nextEditedHeight;
  const otherSum = nextHeights.reduce((sum, height, index) => (
    index === absorbIndex ? sum : sum + height
  ), 0);
  const nextAbsorbHeight = Math.round(sectionBasisH) - otherSum;
  if (nextAbsorbHeight < 100) return null;
  nextHeights[absorbIndex] = nextAbsorbHeight;
  return sections.map((section, index) => recalculateSectionShelves(section, nextHeights[index], thickness));
};

const getRenderedSectionBasisHeight = (
  module: any,
  spaceInfo: any,
  fallbackBasisH: number
): number => {
  if (!module || !spaceInfo) return Math.max(0, Math.round(fallbackBasisH || 0));
  let effectiveHeight = spaceInfo.height ?? fallbackBasisH ?? 0;
  if (module.zone === 'dropped') {
    if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
      effectiveHeight = (spaceInfo.height ?? effectiveHeight) - (spaceInfo.stepCeiling.dropHeight || 0);
    } else if (spaceInfo.droppedCeiling?.enabled) {
      effectiveHeight = (spaceInfo.height ?? effectiveHeight) - (spaceInfo.droppedCeiling.dropHeight || 0);
    }
  }
  const topClearance = module.hasTopFrame === false
    ? Math.max(0, Math.round(module.topFrameGap ?? 0))
    : Math.max(0, Math.round(module.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30));
  const bottomClearance = module.hasBase === false
    ? Math.max(0, Math.round(module.individualFloatHeight ?? 0))
    : Math.max(0, Math.round(module.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0)));
  const floorFinish = spaceInfo.hasFloorFinish && spaceInfo.floorFinish
    ? Math.max(0, Math.round(spaceInfo.floorFinish.height || 0))
    : 0;
  return Math.max(0, Math.round(effectiveHeight - topClearance - bottomClearance - floorFinish));
};

const getEffectiveCabinetSpaceHeight = (module: any, spaceInfo: any): number => {
  if (!module || !spaceInfo) return Math.max(0, Math.round(spaceInfo?.height ?? 0));
  let effectiveHeight = spaceInfo.height ?? 0;
  if (module.zone === 'dropped') {
    if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
      effectiveHeight = (spaceInfo.height ?? effectiveHeight) - (spaceInfo.stepCeiling.dropHeight || 0);
    } else if (spaceInfo.droppedCeiling?.enabled) {
      effectiveHeight = (spaceInfo.height ?? effectiveHeight) - (spaceInfo.droppedCeiling.dropHeight || 0);
    }
  }
  return Math.max(0, Math.round(effectiveHeight));
};

const computeTopOffGapForBodyHeight = (
  module: any,
  spaceInfo: any,
  bodyHeightMm: number
): number => {
  const effectiveHeight = getEffectiveCabinetSpaceHeight(module, spaceInfo);
  const bottomClearance = module?.hasBase === false
    ? Math.max(0, Math.round(module?.individualFloatHeight ?? 0))
    : Math.max(0, Math.round(module?.baseFrameHeight ?? (spaceInfo?.baseConfig?.type === 'floor' ? (spaceInfo?.baseConfig?.height ?? 65) : 0)));
  const floorFinish = spaceInfo?.hasFloorFinish && spaceInfo?.floorFinish
    ? Math.max(0, Math.round(spaceInfo.floorFinish.height || 0))
    : 0;
  return Math.max(0, Math.round(effectiveHeight - Math.max(0, bodyHeightMm) - bottomClearance - floorFinish));
};

const applyFullTopClearanceForBodyHeight = (
  updates: Record<string, any>,
  module: any,
  spaceInfo: any,
  category: string | undefined,
  bodyHeightMm: number
) => {
  if (category !== 'full') return;
  const topClearance = computeTopOffGapForBodyHeight(module, spaceInfo, bodyHeightMm);
  if (module?.hasTopFrame === false) {
    updates.topFrameGap = topClearance;
    return;
  }
  updates.topFrameThickness = topClearance;
  updates.topFrameGap = 0;
};

const getFullBodyDisplayHeight = (
  module: any,
  spaceInfo: any,
  fallbackHeight: number
): number => {
  if (!module || !spaceInfo) return Math.max(0, Math.round(fallbackHeight || 0));
  let effectiveHeight = spaceInfo.height ?? fallbackHeight ?? 0;
  if (module.zone === 'dropped') {
    if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
      effectiveHeight = (spaceInfo.height ?? effectiveHeight) - (spaceInfo.stepCeiling.dropHeight || 0);
    } else if (spaceInfo.droppedCeiling?.enabled) {
      effectiveHeight = (spaceInfo.height ?? effectiveHeight) - (spaceInfo.droppedCeiling.dropHeight || 0);
    }
  }
  const topGap = Math.max(0, Math.round(module.topFrameGap ?? 0));
  return Math.max(0, Math.round(effectiveHeight - topGap));
};

type RenderedSurroundPanelMod = {
  sideHeightMm: number;
  frontHeightMm: number;
};

const getPlacedModuleCategoryForPanels = (module: any): 'full' | 'upper' | 'lower' => {
  const id = module?.moduleId || '';
  if (id.startsWith('upper-') || id.includes('-upper-')) return 'upper';
  if (id.startsWith('lower-') || id.includes('-lower-')) return 'lower';
  return 'full';
};

const getPlacedModuleWidthForPanels = (module: any): number => {
  return module?.isFreePlacement && module?.freeWidth
    ? module.freeWidth
    : (module?.customWidth || module?.adjustedWidth || module?.moduleWidth || 0);
};

const isOuterRenderedSurroundModule = (
  module: any,
  placedModules: any[],
  spaceInfo: any,
  side: 'left' | 'right'
): boolean => {
  const mods = placedModules.filter(m => !m.isSurroundPanel);
  if (!module || mods.length === 0) return false;

  const halfSpaceMm = (spaceInfo.width || 0) / 2;
  const frameLeftMm = spaceInfo.frameSize?.left || 0;
  const frameRightMm = spaceInfo.frameSize?.right || 0;
  const boundaryMm = side === 'left' ? -halfSpaceMm + frameLeftMm : halfSpaceMm - frameRightMm;

  let extremeEdgeMm: number | null = null;
  mods.forEach((m) => {
    const w = getPlacedModuleWidthForPanels(m);
    const centerXmm = Math.round((m.position?.x ?? 0) * 100);
    const edgeMm = side === 'left' ? centerXmm - w / 2 : centerXmm + w / 2;
    if (extremeEdgeMm === null) extremeEdgeMm = edgeMm;
    else if (side === 'left' && edgeMm < extremeEdgeMm) extremeEdgeMm = edgeMm;
    else if (side === 'right' && edgeMm > extremeEdgeMm) extremeEdgeMm = edgeMm;
  });

  if (extremeEdgeMm === null || Math.abs(extremeEdgeMm - boundaryMm) > 50) return false;

  const moduleWidthMm = getPlacedModuleWidthForPanels(module);
  const moduleCenterXmm = Math.round((module.position?.x ?? 0) * 100);
  const moduleEdgeMm = side === 'left'
    ? moduleCenterXmm - moduleWidthMm / 2
    : moduleCenterXmm + moduleWidthMm / 2;
  return Math.abs(moduleEdgeMm - extremeEdgeMm) <= 1;
};

const getRenderedSurroundPanelMod = (module: any, spaceInfo: any): RenderedSurroundPanelMod => {
  const category = getPlacedModuleCategoryForPanels(module);
  const freeHeightMm = typeof module?.freeHeight === 'number' && module.freeHeight > 0 ? module.freeHeight : undefined;
  const customHeightMm = typeof module?.customHeight === 'number' && module.customHeight > 0 ? module.customHeight : undefined;
  const explicitHeightMm = category === 'upper'
    ? (customHeightMm ?? freeHeightMm)
    : (freeHeightMm ?? customHeightMm);

  let moduleDataH = 0;
  try {
    const internalSp = { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth || 1500 };
    const md = getModuleById(module.moduleId, internalSp, spaceInfo);
    if (md?.dimensions?.height) moduleDataH = md.dimensions.height;
  } catch {
    // Use the fallback below when module lookup is unavailable.
  }

  const defaultCabH = category === 'lower' ? 785 : category === 'upper' ? 785 : spaceInfo.height;
  const cabHeight = explicitHeightMm ?? (moduleDataH > 0 ? moduleDataH : defaultCabH);

  if (category === 'upper') {
    let ceilingHeightMm = spaceInfo.height;
    if (module.zone === 'dropped') {
      if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
        ceilingHeightMm = spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
      } else if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.dropHeight !== undefined) {
        ceilingHeightMm = spaceInfo.height - spaceInfo.droppedCeiling.dropHeight;
      }
    }

    const topGapMm = module.hasTopFrame === false ? (module.topFrameGap ?? 0) : 0;
    const topMm = ceilingHeightMm - topGapMm;
    const topFrameMm = module.hasTopFrame === false ? 0 : (module.topFrameThickness ?? (spaceInfo.frameSize?.top || 30));
    const bodyTopMm = topMm - topFrameMm;
    const bodyBottomMm = bodyTopMm - cabHeight;
    // 상부장 카테고리 글로벌 도어 갭 우선, 없으면 공통 폴백
    const doorBottomGapMm = module.doorBottomGap ?? spaceInfo.doorBottomGapUpper ?? spaceInfo.doorBottomGap ?? 0;

    return {
      sideHeightMm: cabHeight,
      frontHeightMm: Math.max(0, topMm - (bodyBottomMm - doorBottomGapMm)),
    };
  }

  if (category === 'lower') {
    const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseFrameMm = spaceInfo.baseConfig?.type === 'stand'
      ? 0
      : (module.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 105);
    const heightMm = floorFinishMm + baseFrameMm + cabHeight;
    return { sideHeightMm: heightMm, frontHeightMm: heightMm };
  }

  return { sideHeightMm: spaceInfo.height, frontHeightMm: spaceInfo.height };
};

// 마이다치수 H 입력칸: controlled. 타이핑 중엔 로컬 state 유지(연속 입력),
// 외부에서 값이 바뀌면(흡수로 반대 칸 변경 등) 동기화. blur/Enter/화살표로 적용.
const MaidaHeightInput: React.FC<{
  value: number;
  className?: string;
  onApply: (v: number) => void;
  readOnly?: boolean;
}> = ({ value, className, onApply, readOnly }) => {
  const [text, setText] = React.useState(String(value));
  const focusedRef = React.useRef(false);
  const lastValueRef = React.useRef(value);
  React.useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setText(String(value));
    } else if (!focusedRef.current) {
      setText(String(value));
    }
  }, [value]);
  const apply = () => {
    const n = parseFloat(text);
    if (Number.isFinite(n) && n > 0 && n !== value) onApply(n);
  };
  if (readOnly) {
    return (
      <input
        type="text"
        value={String(value)}
        readOnly
        className={className}
        style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }}
      />
    );
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      className={className}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { focusedRef.current = false; apply(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); const n = (parseFloat(text) || value) + 1; setText(String(n)); onApply(n); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); const n = (parseFloat(text) || value) - 1; setText(String(n)); onApply(n); }
      }}
      style={{ fontSize: '12px', cursor: 'text', color: 'var(--theme-text-primary)' }}
    />
  );
};

const isLowerDrawerMaidaModuleId = (moduleId?: string): boolean => {
  if (!moduleId) return false;
  return moduleId.includes('lower-drawer-')
    || moduleId.includes('lower-door-lift-1tier')
    || moduleId.includes('lower-door-lift-2tier')
    || moduleId.includes('lower-door-lift-3tier')
    || moduleId.includes('lower-door-lift-touch-')
    || moduleId.includes('lower-top-down-1tier')
    || moduleId.includes('lower-top-down-2tier')
    || moduleId.includes('lower-top-down-3tier')
    || moduleId.includes('lower-top-down-touch-')
    || moduleId.includes('lower-induction-cabinet')
    || moduleId.includes('dual-lower-induction-cabinet');
};

const findRenderedMaidaHeightsBottomToTop = (
  furnitureId: string | undefined,
  moduleId: string | undefined,
  maidaCount: number
): number[] | undefined => {
  if (!furnitureId || !moduleId || maidaCount <= 0) return undefined;

  const names = (() => {
    if (moduleId.includes('lower-induction-cabinet') || moduleId.includes('dual-lower-induction-cabinet')) {
      return Array.from({ length: maidaCount }, (_, i) => `인덕션 ${i + 1}단서랍(마이다)`);
    }
    if (moduleId.includes('lower-door-lift-touch-') || moduleId.includes('lower-top-down-touch-')) {
      return Array.from({ length: maidaCount }, (_, i) => `터치${i + 1}단서랍(마이다)`);
    }
    return Array.from({ length: maidaCount }, (_, i) => `서랍${i + 1}(마이다)`);
  })();

  const heights = names.map(name => {
    const rendered = findRenderedPanelDimension(furnitureId, name);
    return typeof rendered?.heightMm === 'number' && Number.isFinite(rendered.heightMm)
      ? rendered.heightMm
      : undefined;
  });

  return heights.every((height): height is number => typeof height === 'number')
    ? heights
    : undefined;
};

const formatMaidaTierLabel = (displayIndex: number, total: number): string => {
  if (total <= 1) return '마이다';
  if (total === 2) return displayIndex === 0 ? '1단(위)' : '2단(아래)';
  return displayIndex === 0 ? '1단(위)' : displayIndex === total - 1 ? `${total}단(아래)` : `${displayIndex + 1}단(중간)`;
};

const formatMmInputValue = (value: number | string | undefined): string => {
  if (value === '' || value == null) return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 10) / 10);
};

const roundMmToTenth = (value: number): number => Math.round(value * 10) / 10;

const resolveMaidaDisplayWidthMm = (
  module: any,
  moduleData: any,
  bodyWidthMm: number,
  outerOpenSides: { left: boolean; right: boolean } = { left: false, right: false }
): number => {
  let frontWidth = bodyWidthMm || module?.slotCustomWidth || module?.customWidth || module?.adjustedWidth || moduleData?.dimensions?.width || 0;
  frontWidth += (outerOpenSides.left ? 1.5 : 0) + (outerOpenSides.right ? 1.5 : 0);

  if (module) {
    const epTrimMm = resolvePetPanelThicknessMm(module.endPanelThickness);
    const leftFrontOffset = Number(module.leftEndPanelOffset ?? 0);
    const rightFrontOffset = Number(module.rightEndPanelOffset ?? 0);

    if (module.hasLeftEndPanel && leftFrontOffset > 0) frontWidth -= epTrimMm;
    if (module.hasRightEndPanel && rightFrontOffset > 0) frontWidth -= epTrimMm;
  }

  const adjustEnabled = !!module?.maidaWidthAdjustEnabled;
  const adjustMm = module?.maidaWidthAdjustMm ?? -1.5;
  return Math.max(0, Math.round(adjustEnabled ? frontWidth + adjustMm : frontWidth - 3));
};

const resolveExternalMaidaHeightsMm = (
  moduleId: string,
  bodyHeightMm: number,
  moduleData: any,
  stoneThickness: number,
  doorTopGap?: number,
  doorBottomGap?: number,
  hasTopEndPanel?: boolean
): number[] => {
  const is3Tier = moduleId.includes('lower-drawer-3tier');
  const is2Tier = moduleId.includes('lower-drawer-2tier');
  const isDoorLift3Tier = moduleId.includes('lower-door-lift-3tier');
  const isDoorLift2Tier = moduleId.includes('lower-door-lift-2tier');
  const isTopDown3Tier = moduleId.includes('lower-top-down-3tier');
  const isTopDown2Tier = moduleId.includes('lower-top-down-2tier');
  if (!(is3Tier || is2Tier || isDoorLift3Tier || isDoorLift2Tier || isTopDown3Tier || isTopDown2Tier)) return [];

  const currentCabinetHmm = Math.round(bodyHeightMm);
  const topDownDefaultTopGap = hasTopEndPanel ? -82 : stoneThickness === 10 ? -90 : stoneThickness === 30 ? -70 : -80;
  const defaultTopGap = (isTopDown2Tier || isTopDown3Tier) ? topDownDefaultTopGap : (isDoorLift2Tier || isDoorLift3Tier) ? 30 : -20;
  const defaultBottomGap = 5;
  const effectiveTopGap = (isTopDown2Tier || isTopDown3Tier) && (doorTopGap === undefined || doorTopGap === 0)
    ? defaultTopGap
    : (doorTopGap ?? defaultTopGap);
  const effectiveBottomGap = doorBottomGap ?? defaultBottomGap;

  const drawer2TierFromBottom = (currentCabinetHmm - 125) / 2;
  const doorLift2TierNotch = Math.max(0, Math.round((currentCabinetHmm - 75) / 2));
  const doorLift2TierMaidaH = Math.max(0, doorLift2TierNotch + 45);
  const doorLift3TierUpperMaidaH = Math.max(0, Math.round((currentCabinetHmm - 365) / 2));
  const doorLift3TierNotch2 = Math.max(380, doorLift3TierUpperMaidaH + 335);
  const drawer3TierDelta = currentCabinetHmm - 785;
  const topDownStretcherH = stoneThickness === 10 ? 65 : stoneThickness === 30 ? 45 : 55;
  const td3StretcherDelta = topDownStretcherH - 55;
  const notchFromBottoms = is3Tier
    ? [295 + drawer3TierDelta, 510 + drawer3TierDelta]
    : isDoorLift3Tier ? [315, doorLift3TierNotch2]
    : isDoorLift2Tier ? [doorLift2TierNotch]
    : isTopDown3Tier ? [225 + drawer3TierDelta - td3StretcherDelta, 445 + drawer3TierDelta - td3StretcherDelta, 665 + drawer3TierDelta - td3StretcherDelta]
    : isTopDown2Tier ? [Math.round((currentCabinetHmm + stoneThickness - 20 - 185) / 2), currentCabinetHmm - (topDownStretcherH + 65)]
    : [drawer2TierFromBottom];
  const notchHeights = notchFromBottoms.map(() => 65);
  const hideTopNotch = isDoorLift2Tier || isDoorLift3Tier || isTopDown2Tier || isTopDown3Tier;
  const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : 2;
  const fixedMaidaHeights = isDoorLift2Tier
    ? [doorLift2TierMaidaH, doorLift2TierMaidaH]
    : isDoorLift3Tier ? [360, doorLift3TierUpperMaidaH, doorLift3TierUpperMaidaH] : undefined;

  const basicThicknessMm = moduleData?.modelConfig?.basicThickness ?? 18;
  const sidePanelHeightMm = currentCabinetHmm;
  const upperNotchH = 60;
  const upperNotchFromBottom = sidePanelHeightMm - upperNotchH;
  const sortedNotches = notchFromBottoms
    .map((fromBottom, idx) => ({ fromBottom, height: notchHeights[idx] || 65 }))
    .sort((a, b) => a.fromBottom - b.fromBottom);
  const allNotches = hideTopNotch ? [...sortedNotches] : [...sortedNotches, { fromBottom: upperNotchFromBottom, height: upperNotchH }];
  const zones: { notchAboveBottom: number; notchBelowTop: number | null }[] = [];
  let cursor = 0;

  allNotches.forEach((notch, idx) => {
    if (notch.fromBottom > cursor) {
      zones.push({
        notchAboveBottom: notch.fromBottom,
        notchBelowTop: idx > 0 ? (allNotches[idx - 1].fromBottom + allNotches[idx - 1].height) : null,
      });
    }
    cursor = notch.fromBottom + notch.height;
  });

  if (hideTopNotch && cursor < sidePanelHeightMm && zones.length < drawerCount) {
    const lastNotch = allNotches[allNotches.length - 1];
    zones.push({
      notchAboveBottom: sidePanelHeightMm - basicThicknessMm,
      notchBelowTop: lastNotch ? (lastNotch.fromBottom + lastNotch.height) : null,
    });
  }

  return zones.slice(0, drawerCount).map((zone, idx) => {
    const isTopDrawer = idx === drawerCount - 1;
    const isBottomDrawer = idx === 0;
    const maidaTopMm = zone.notchAboveBottom + 40;
    const maidaBottomMm = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
    const gapTopExt = isTopDrawer ? (effectiveTopGap - defaultTopGap) : 0;
    const gapBottomExt = isBottomDrawer ? (effectiveBottomGap - defaultBottomGap) : 0;
    const defaultHeight = maidaTopMm - maidaBottomMm + gapTopExt + gapBottomExt;
    const fixedHeight = fixedMaidaHeights?.[idx];
    return Math.max(0, Math.round((fixedHeight != null ? fixedHeight + gapTopExt + gapBottomExt : defaultHeight) * 10) / 10);
  });
};

const resolveTouchMaidaHeightsMm = (
  module: any,
  moduleId: string,
  bodyHeightMm: number,
  stoneThickness: number
): number[] => {
  const isTouch2A = moduleId.includes('lower-door-lift-touch-2tier-a');
  const isTouch2B = moduleId.includes('lower-door-lift-touch-2tier-b');
  const isTouch3 = moduleId.includes('lower-door-lift-touch-3tier');
  const isTopDownTouch2 = moduleId.includes('lower-top-down-touch-2tier');
  const isTopDownTouch3 = moduleId.includes('lower-top-down-touch-3tier');
  const isTopDownTouch = isTopDownTouch2 || isTopDownTouch3;
  if (!(isTouch2A || isTouch2B || isTouch3 || isTopDownTouch2 || isTopDownTouch3)) return [];

  const drawerHeights = isTouch3 ? [228, 117, 117]
    : isTopDownTouch3 ? [164, 164, 164]
    : [228, 228];
  const drawerCount = drawerHeights.length;
  const customMaida = Array.isArray(module?.customMaidaHeights) && module.customMaidaHeights.length === drawerCount
    ? [...module.customMaidaHeights]
    : undefined;
  const tdStretcherH = stoneThickness === 10 ? 65 : stoneThickness === 30 ? 45 : 55;
  const defaultTopExt = isTopDownTouch ? -(tdStretcherH + 25) : 30;
  const defaultBottomExt = 5;
  const topExt = module?.doorTopGap ?? defaultTopExt;
  const bottomExt = module?.doorBottomGap ?? defaultBottomExt;
  const gapMm = 3;
  const baseMaidaTotalFront = bodyHeightMm + defaultTopExt + defaultBottomExt;
  const maidaTotalFront = baseMaidaTotalFront;
  let heights = customMaida
    ? customMaida
    : (isTouch3
      ? [360, 227, 227]
      : isTopDownTouch3 ? [185, 240, 240] : [0, 0]);

  if (!customMaida && drawerCount === 2) {
    const evenH = Math.floor(Math.max(0, maidaTotalFront - gapMm) / 2);
    heights = [evenH, evenH];
  }
  if (!customMaida && isTouch3) {
    const remaining = Math.max(0, maidaTotalFront - 360 - gapMm * 2);
    const evenH = Math.floor(remaining / 2);
    heights = [360, evenH, evenH];
  }
  if (!customMaida && isTopDownTouch3) {
    const bottomFixed = 185;
    const remaining = Math.max(0, maidaTotalFront - bottomFixed - gapMm * 2);
    const evenH = Math.floor(remaining / 2);
    heights = [bottomFixed, evenH, evenH];
  }

  if (isTouch3) {
    const topDelta = topExt - defaultTopExt;
    heights[2] = Math.max(0, heights[2] + topDelta);
  }
  if (!customMaida && isTopDownTouch) {
    const topDelta = topExt - defaultTopExt;
    heights[heights.length - 1] = Math.max(0, heights[heights.length - 1] + topDelta);
  }
  if ((isTopDownTouch || isTouch2A || isTouch2B || isTouch3) && heights.length >= 2) {
    const topShift = isTouch3 ? (topExt - defaultTopExt) : 0;
    const topPosition = isTopDownTouch
      ? -defaultBottomExt + maidaTotalFront + (topExt - defaultTopExt)
      : -defaultBottomExt + maidaTotalFront + topShift;
    let cursorTop = topPosition;
    const positioned = new Array(heights.length).fill(0);
    for (let i = heights.length - 1; i >= 1; i--) {
      const h = heights[i];
      positioned[i] = h;
      cursorTop = cursorTop - h - gapMm;
    }
    positioned[0] = Math.max(0, cursorTop - (-bottomExt));
    heights = positioned;
  }

  return heights.map(h => Math.max(0, Math.round(h * 10) / 10));
};

const resolveInductionMaidaHeightsMm = (
  module: any,
  bodyHeightMm: number
): number[] => {
  const defaultTopGap = -20;
  const defaultBottomGap = 5;
  const gapTopExt = (module?.doorTopGap ?? defaultTopGap) - defaultTopGap;
  const gapBottomExt = (module?.doorBottomGap ?? defaultBottomGap) - defaultBottomGap;
  const gapMm = 3;
  const maida2Height = Math.max(0, 427 + gapTopExt);
  const maida2Top = bodyHeightMm - 20 + gapTopExt;
  const maida2Bottom = maida2Top - maida2Height;
  const maida1Top = maida2Bottom - gapMm;
  const maida1Bottom = -5 - gapBottomExt;
  return [
    Math.max(0, Math.round((maida1Top - maida1Bottom) * 10) / 10),
    Math.max(0, Math.round(maida2Height * 10) / 10),
  ];
};

const calculateRenderedSurroundPanelsForModule = (
  currentPlacedModule: any,
  placedModules: any[],
  spaceInfo: any
): any[] => {
  if (spaceInfo.surroundType !== 'surround' || !spaceInfo.frameSize || !currentPlacedModule) return [];

  const frameSize = spaceInfo.frameSize;
  const userPanelThickness = spaceInfo.panelThickness ?? 18;
  const surroundThickness = (userPanelThickness === 18.5 || userPanelThickness === 15.5) ? PET_PANEL_THICKNESS_MM : 18;
  const surroundMaterial = (userPanelThickness === 18.5 || userPanelThickness === 15.5) ? 'PET' : 'PB';
  const sideDepthMm = 40;
  const panels: any[] = [];

  ([
    { side: 'left' as const, label: '좌측', frameWidth: frameSize.left || 0 },
    { side: 'right' as const, label: '우측', frameWidth: frameSize.right || 0 },
  ]).forEach(({ side, label, frameWidth }) => {
    if (frameWidth <= 0 || !isOuterRenderedSurroundModule(currentPlacedModule, placedModules, spaceInfo, side)) return;

    const rendered = getRenderedSurroundPanelMod(currentPlacedModule, spaceInfo);
    panels.push({
      name: `${label} 서라운드 측면판`,
      width: sideDepthMm,
      height: rendered.sideHeightMm,
      thickness: surroundThickness,
      material: surroundMaterial,
    });
    panels.push({
      name: `${label} 서라운드 전면판`,
      width: Math.max(0, frameWidth - 3),
      height: rendered.frontHeightMm,
      thickness: surroundThickness,
      material: surroundMaterial,
    });
  });

  return panels;
};

// ModuleGallery의 FURNITURE_ICONS와 동일하게 동기화 유지 (수정 시 양쪽 함께 변경)
const FURNITURE_ICONS: Record<string, string> = {
  // 키큰장 (주방)
  'built-in-fridge': getImagePath('single_builtin.png'),
  'insert-frame': getImagePath('insert_frame.png'),
  'dual-built-in-fridge': getImagePath('dual_builtin.png'),
  'single-pull-out-cabinet': getImagePath('microwave.png'),
  'single-pantry-cabinet': getImagePath('pantry.png'),
  'single-fridge-cabinet': getImagePath('single_builtin.png'),
  'single-2drawer-hanging': getImagePath('single-2drawer-hanging.png'),
  'single-2hanging': getImagePath('single-2hanging.png'),
  'single-4drawer-hanging': getImagePath('single-4drawer-hanging.png'),
  'dual-2drawer-hanging': getImagePath('dual-2drawer-hanging.png'),
  'dual-2hanging': getImagePath('dual-2hanging.png'),
  'dual-4drawer-hanging': getImagePath('dual-4drawer-hanging.png'),
  'dual-2drawer-styler': getImagePath('dual-2drawer-styler.png'),
  'dual-4drawer-pantshanger': getImagePath('dual-4drawer-pantshanger.png'),
  // 싱글 상부장
  'upper-cabinet-shelf': getImagePath('upper-cabinet-shelf.png'),
  'upper-cabinet-2tier': getImagePath('upper-cabinet-2tier.png'),
  'upper-cabinet-open': getImagePath('upper-cabinet-open.png'),
  'upper-cabinet-mixed': getImagePath('upper-cabinet-mixed.png'),
  // 싱글 하부장 (새)
  'lower-half-cabinet': getImagePath('lower-half-cabinet.png'),
  'lower-sink-cabinet': getImagePath('lower-sink-cabinet.png'),
  'lower-induction-cabinet': getImagePath('lower-induction-cabinet.png'),
  // 듀얼 상부장
  'dual-upper-cabinet-shelf': getImagePath('dual-upper-cabinet-shelf.png'),
  'dual-upper-cabinet-2tier': getImagePath('dual-upper-cabinet-2tier.png'),
  'dual-upper-cabinet-open': getImagePath('dual-upper-cabinet-open.png'),
  'dual-upper-cabinet-mixed': getImagePath('dual-upper-cabinet-mixed.png'),
  // 듀얼 하부장 (새)
  'dual-lower-half-cabinet': getImagePath('dual-lower-half-cabinet.png'),
  'dual-lower-sink-cabinet': getImagePath('dual-lower-sink-cabinet.png'),
  'dual-lower-induction-cabinet': getImagePath('dual-lower-induction-cabinet.png'),
  // 기본 하부장 서랍
  'lower-drawer-2tier': getImagePath('lower-drawer-2tier.png'),
  'dual-lower-drawer-2tier': getImagePath('dual-lower-drawer-2tier.png'),
  'lower-drawer-3tier': getImagePath('lower-drawer-3tier.png'),
  'dual-lower-drawer-3tier': getImagePath('dual-lower-drawer-3tier.png'),
  // 도어올림 하부장
  'lower-door-lift-half': getImagePath('lower-door-lift-half.png'),
  'dual-lower-door-lift-half': getImagePath('dual-lower-door-lift-half.png'),
  'lower-door-lift-2tier': getImagePath('lower-door-lift-2tier.png'),
  'dual-lower-door-lift-2tier': getImagePath('dual-lower-door-lift-2tier.png'),
  'lower-door-lift-3tier': getImagePath('lower-door-lift-3tier.png'),
  'dual-lower-door-lift-3tier': getImagePath('dual-lower-door-lift-3tier.png'),
  // 도어올림 터치 하부장
  'lower-door-lift-touch-2tier-a': getImagePath('lower-door-lift-touch-2tier-a.png'),
  'dual-lower-door-lift-touch-2tier-a': getImagePath('dual-lower-door-lift-touch-2tier-a.png'),
  'lower-door-lift-touch-2tier-b': getImagePath('lower-door-lift-touch-2tier-b.png'),
  'dual-lower-door-lift-touch-2tier-b': getImagePath('dual-lower-door-lift-touch-2tier-b.png'),
  'lower-door-lift-touch-3tier': getImagePath('lower-door-lift-touch-3tier.png'),
  'dual-lower-door-lift-touch-3tier': getImagePath('dual-lower-door-lift-touch-3tier.png'),
  // 상판내림 하부장
  'lower-top-down-half': getImagePath('lower-top-down-half.png'),
  'dual-lower-top-down-half': getImagePath('dual-lower-top-down-half.png'),
  'lower-top-down-2tier': getImagePath('lower-top-down-2tier.png'),
  'dual-lower-top-down-2tier': getImagePath('dual-lower-top-down-2tier.png'),
  'lower-top-down-3tier': getImagePath('lower-top-down-3tier.png'),
  'dual-lower-top-down-3tier': getImagePath('dual-lower-top-down-3tier.png'),
  'lower-top-down-touch-2tier': getImagePath('lower-top-down-touch-2tier.png'),
  'dual-lower-top-down-touch-2tier': getImagePath('dual-lower-top-down-touch-2tier.png'),
  'lower-top-down-touch-3tier': getImagePath('lower-top-down-touch-3tier.png'),
  'dual-lower-top-down-touch-3tier': getImagePath('dual-lower-top-down-touch-3tier.png'),
  // 싱글 선반장
  'single-2drawer-shelf': getImagePath('7.png'),
  'single-4drawer-shelf': getImagePath('8.png'),
  'single-shelf': getImagePath('9.png'),
  // 듀얼 선반장
  'dual-4drawer-shelf': getImagePath('18.png'),
  'dual-2drawer-shelf': getImagePath('19.png'),
  'dual-shelf': getImagePath('20.png'),
  // 현관장 H
  'single-entryway-h': getImagePath('entrance_single-H.png'),
  'dual-entryway-h': getImagePath('entrance_duel-H.png'),
};

// 가구 이미지 매핑 함수 — 매핑에 없으면 null 반환 (텍스트 썸네일로 대체)
const getFurnitureImagePath = (moduleId: string): string | null => {
  // 너비 접미사 제거 (정수/소수 모두 처리: e.g., -586, -586.4)
  const baseModuleType = moduleId.replace(/-[\d.]+$/, '');
  return FURNITURE_ICONS[baseModuleType] || null;
};

// Remove local calculatePanelDetails - now using shared utility
/* const calculatePanelDetails = (moduleData: ModuleData, customWidth: number, customDepth: number, hasDoor: boolean = false, t: any = (key: string) => key) => {
  const panels = {
    common: [],    // 공통 패널 (좌우측판, 뒷판)
    upper: [],     // 상부장 패널
    lower: [],     // 하부장 패널
    door: []       // 도어 패널
  };
  
  // 실제 3D 렌더링과 동일한 두께 값들 (BaseFurnitureShell.tsx와 DrawerRenderer.tsx 참조)
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;
  const backPanelThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? 9.5 : 9; // MDF+PET 코팅 시 +0.5mm
  const drawerHandleThickness = basicThickness; // 마이다는 외부 노출 패널이므로 도어와 동일한 basicThickness
  const drawerSideThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? 15.5 : 15; // PB+PET 코팅 시 15.5mm
  const drawerBottomThickness = backPanelThickness; // 서랍 바닥판 - MDF 재질, 백패널과 동일
  const backPanelTopClearance = 1; // 백패널 상단 조립 공차 1mm
  
  const height = moduleData.dimensions.height;
  // 내경 = 전체폭 - 실제 측판두께×2 (18.5T는 18.5×2)
  const innerWidth = customWidth - (basicThickness * 2);
  const innerHeight = height - (basicThickness * 2);
  
  // 섹션 정보 가져오기
  // 듀얼 타입5,6 특별 처리 (leftSections/rightSections 구조)
  let sections;
  if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
    // leftSections를 기준으로 처리 (서랍 + 옷장)
    sections = moduleData.modelConfig?.leftSections || [];
  } else {
    sections = moduleData.modelConfig?.sections || [];
  }
  
  // availableHeight는 mm 단위로 사용 (내경이 아닌 전체 높이 기준)
  const availableHeightMm = height;
  
  
  // 전체 가구의 기본 구조는 일단 저장하지만 표시하지 않음
  // 나중에 필요시 사용할 수 있도록 보관
  
  // === 섹션별 패널 계산 ===
  if (sections && sections.length > 0) {
    // 실제 사용 가능한 내부 높이 (상하판 제외)
    const actualAvailableHeight = height - (basicThickness * 2);
    
    // 섹션 높이 계산 함수 (3D 렌더링과 동일한 로직)
    const calculateSectionHeight = (section, availableHeightMm) => {
      const heightType = section.heightType || 'percentage';
      
      if (heightType === 'absolute') {
        // 절대값인 경우 section.height는 이미 mm 단위
        // 하지만 availableHeightMm를 초과하지 않도록 제한
        return Math.min(section.height || 0, availableHeightMm);
      } else {
        // 비율인 경우
        return availableHeightMm * ((section.height || section.heightRatio || 100) / 100);
      }
    };
    
    // 고정 높이 섹션들 분리
    const fixedSections = sections.filter(s => s.heightType === 'absolute');
    const totalFixedHeight = fixedSections.reduce((sum, section) => {
      return sum + calculateSectionHeight(section, actualAvailableHeight);
    }, 0);
    
    // 중간 칸막이 두께 고려 (섹션 개수 - 1개의 칸막이)
    const dividerCount = sections.length > 1 ? (sections.length - 1) : 0;
    const dividerThickness = dividerCount * basicThickness;
    
    // 나머지 높이 계산 (전체 - 고정높이 - 칸막이)
    const remainingHeight = actualAvailableHeight - totalFixedHeight - dividerThickness;
    
    
    // 섹션 사이 구분판 (안전선반/칸막이) - 상부장과 하부장 사이
    if (sections.length > 1 && moduleData.id.includes('2hanging')) {
      // 2단 옷장의 경우 안전선반으로 표시
      panels.common.push({
        name: '선반 (칸막이)',
        width: innerWidth,
        depth: customDepth - backPanelThickness - 17, // 실제 렌더링 값
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
    } else if (sections.length > 1) {
      // 다른 가구의 경우 중간 칸막이로 표시
      panels.common.push({
        name: '중간 칸막이',
        width: innerWidth,
        depth: customDepth - backPanelThickness - 17, // 실제 렌더링 값
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
    }
    
    // 각 섹션별 내부 구조 처리
    sections.forEach((section, sectionIndex) => {
      // 상부장/하부장 구분 
      // 가구 타입에 따른 구분 로직
      let sectionName = '';
      let targetPanel = null;
      
      // 2단 옷장 (single-2hanging): 첫 번째 섹션(shelf)이 하부장, 두 번째 섹션(hanging)이 상부장
      if (moduleData.id.includes('2hanging')) {
        if (sectionIndex === 0) {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 듀얼 타입5,6 (스타일러, 바지걸이장): leftSections 기준으로 처리
      else if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
        // 첫 번째 섹션이 drawer면 하부장, 두 번째가 hanging이면 상부장
        if (section.type === 'drawer') {
          sectionName = '하부장 (좌측)';
          targetPanel = panels.lower;
        } else if (section.type === 'hanging') {
          sectionName = '상부장 (좌측)';
          targetPanel = panels.upper;
        }
      }
      // 4단서랍+옷장: drawer는 하부장, hanging은 상부장
      else if (section.type === 'drawer') {
        sectionName = '하부장';
        targetPanel = panels.lower;
      } else if (section.type === 'hanging') {
        sectionName = '상부장';
        targetPanel = panels.upper;
      } 
      // 기타 가구: 인덱스 기반 구분 (0=상부, 1=하부)
      else {
        const isUpperSection = sectionIndex === 0;
        sectionName = isUpperSection ? '상부장' : '하부장';
        targetPanel = isUpperSection ? panels.upper : panels.lower;
      }
      
      // 섹션 실제 높이 계산 (mm 단위)
      const sectionHeightMm = section.heightType === 'absolute' 
        ? calculateSectionHeight(section, actualAvailableHeight)
        : calculateSectionHeight(section, remainingHeight);
      
      
      // 각 섹션의 기본 구조 패널 추가
      // 섹션 좌측판
      targetPanel.push({
        name: `${sectionName} ${t('furniture.leftPanel')}`,
        width: customDepth,
        height: Math.round(sectionHeightMm),
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
      
      // 섹션 우측판
      targetPanel.push({
        name: `${sectionName} ${t('furniture.rightPanel')}`,
        width: customDepth,
        height: Math.round(sectionHeightMm),
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
      
      // 섹션 상판 (마지막 섹션에만) - 뒤에서 26mm 줄임
      if (sectionIndex === sections.length - 1) {
        targetPanel.push({
          name: `${sectionName} ${t('furniture.topPanel')}`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      }

      // 섹션 하판 (각 섹션의 바닥판) - 뒤에서 26mm 줄임
      if (sectionIndex === 0) {
        // 하부섹션의 바닥판 (가구 전체 하판)
        targetPanel.push({
          name: `${sectionName} ${t('furniture.bottomPanel')}`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      } else {
        // 상부섹션의 바닥판 (하부 상판과 같은 깊이)
        targetPanel.push({
          name: `${sectionName} ${t('furniture.bottomPanel')}`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      }
      
      // 안전선반 (칸막이)는 섹션 밖에서 별도 처리 (아래로 이동)
      
      // 섹션 뒷판
      targetPanel.push({
        name: `${sectionName} ${t('furniture.backPanel')}`,
        width: innerWidth + 10,
        height: Math.max(0, Math.round(sectionHeightMm) - backPanelTopClearance),
        thickness: backPanelThickness,
        material: 'MDF'  // 뒷판은 MDF 재질
      });

      // 백패널 보강대 (상단/하단) - 60mm 높이, 15mm 깊이
      // 15mm/18mm: 양쪽 0.5mm씩 축소 (총 1mm), 15.5mm/18.5mm: 갭 없음
      const reinforcementHeight = 60; // mm
      const reinforcementDepth = 15; // mm
      const sidePanelGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
      const reinforcementWidth = innerWidth - sidePanelGap;
      targetPanel.push({
        name: `${sectionName} 후면 보강대`,
        width: reinforcementWidth,
        height: reinforcementHeight,
        thickness: reinforcementDepth,
        material: 'PB'
      });
      targetPanel.push({
        name: `${sectionName} 후면 보강대`,
        width: reinforcementWidth,
        height: reinforcementHeight,
        thickness: reinforcementDepth,
        material: 'PB'
      });

      if (section.type === 'drawer' && section.count) {
        // 서랍 개별 높이 계산 (DrawerRenderer.tsx 로직 참조)
        const drawerHeights = section.drawerHeights || [];
        const gapHeight = section.gapHeight || 23.6; // mm
        
        // 각 서랍별로 계산
        for (let i = 0; i < section.count; i++) {
          const drawerNum = i + 1;
          
          // 개별 서랍 높이 (drawerHeights 배열에서 가져오거나 균등 분할)
          let individualDrawerHeight;
          if (drawerHeights && drawerHeights[i]) {
            individualDrawerHeight = drawerHeights[i];
          } else {
            // 균등 분할 (전체 섹션 높이 - 칸막이 두께) / 서랍 개수
            individualDrawerHeight = Math.floor((sectionHeightMm - basicThickness * (section.count - 1)) / section.count);
          }
          
          // 서랍 손잡이판 (마이다) - PB 15mm
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.handlePlate')}`,
            width: customWidth,
            height: individualDrawerHeight,
            thickness: drawerHandleThickness,
            material: 'PB'
          });
          
          // 서랍 본체 크기 계산 (DrawerRenderer 참조)
          // drawerWidth = 내경 - 좌우날개 100mm - 레일 공차 11mm
          // 앞판/뒷판: drawerWidth - 좌우 측판 두께
          // 좌측판/우측판: 전체 깊이 사용 (앞뒤 15mm씩 확장)
          const drawerWidth = innerWidth - 111; // 서랍 전체 폭
          const drawerFrontBackWidth = drawerWidth - drawerSideThickness * 2; // 앞판/뒷판 폭 (좌우 측판에 끼워짐)
          const drawerBodyHeight = individualDrawerHeight - 30; // 상하 15mm씩 감소
          const drawerRailSizing = resolveDrawerRailSizingMm(customDepth, backPanelThickness, basicThickness);
          const drawerBodyDepth = drawerRailSizing.railSizeMm != null
            ? drawerRailSizing.drawerSideDepthMm
            : customDepth - 47 - drawerHandleThickness; // 앞30mm 뒤17mm 후퇴 + 손잡이판 두께
          const drawerFrontBackHeight = Math.max(0, drawerBodyHeight - 13 - drawerBottomThickness);

          // 서랍 앞판 (두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.frontPanel')}`,
            width: drawerFrontBackWidth,
            height: drawerFrontBackHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 뒷판 (두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.backPanel')}`,
            width: drawerFrontBackWidth,
            height: drawerFrontBackHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 좌측판 (전체 깊이 사용, 두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.leftPanel')}`,
            depth: drawerBodyDepth, // 전체 깊이 사용 (앞뒤로 확장됨)
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 우측판 (전체 깊이 사용, 두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.rightPanel')}`,
            depth: drawerBodyDepth, // 전체 깊이 사용 (앞뒤로 확장됨)
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });
          
          // 서랍 바닥판 (DrawerRenderer의 Drawer Bottom)
          // 측판 홈 깊이 7.5mm에서 0.5mm 여유를 두고 좌우 각 7mm씩 끼움
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.bottomPanel')}`,
            width: drawerWidth - drawerSideThickness * 2 + 14,
            depth: Math.max(0, drawerBodyDepth - 1), // 측판 깊이보다 앞쪽 1mm 공차
            thickness: drawerBottomThickness,
            material: 'MDF'  // 서랍 바닥판은 MDF 재질
          });
        }
        
        // 서랍 칸막이 (서랍 사이에만, 마지막 서랍 제외)
        for (let i = 1; i < section.count; i++) {
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawerDivider')} ${i}`,
            width: innerWidth,
            depth: customDepth - backPanelThickness - 17, // 뒷판 공간 고려
            thickness: basicThickness,
            material: 'PB'  // 기본 재질
          });
        }
      } else if (section.type === 'hanging') {
        // 옷장 섹션 (ShelfRenderer.tsx 참조)
        if (section.shelfPositions && section.shelfPositions.length > 0) {
          section.shelfPositions.forEach((pos, i) => {
            // BoxWithEdges args={[innerWidth, basicThickness, depth - basicThickness]}
            // 실제 선반 깊이 = adjustedDepthForShelves - basicThickness = (depth - 8) - basicThickness
            targetPanel.push({
              name: `${sectionName} 선반 ${i + 1}`,
              width: innerWidth,
              depth: customDepth - 8 - basicThickness, // 실제 렌더링되는 선반 깊이
              thickness: basicThickness,
              material: 'PB'  // 기본 재질
            });
          });
        } else {
          // 옷걸이 구역 내부 높이 정보
          const hangingInternalHeight = Math.round(sectionHeightMm);
          targetPanel.push({
            name: `${sectionName} 옷걸이 공간`,
            description: '내부 높이',
            height: hangingInternalHeight,
            isInfo: true
          });
        }
      } else if (section.type === 'shelf' && section.count) {
        // 선반 구역 (ShelfRenderer.tsx 참조)
        // 실제 선반 깊이 = adjustedDepthForShelves - basicThickness = (depth - 8) - basicThickness
        for (let i = 1; i <= section.count; i++) {
          targetPanel.push({
            name: `${sectionName} 선반 ${i}`,
            width: innerWidth,
            depth: customDepth - 8 - basicThickness, // 실제 렌더링되는 선반 깊이
            thickness: basicThickness,
            material: 'PB'  // 기본 재질
          });
        }
      } else if (section.type === 'open') {
        // 오픈 섹션 내부 높이 정보
        const openInternalHeight = Math.round(sectionHeightMm);
        targetPanel.push({
          name: `${sectionName} 오픈 공간`,
          description: '내부 높이',
          height: openInternalHeight,
          isInfo: true
        });
      }
    });
  }
  
  // === 도어 패널 ===
  if (hasDoor) {
    const doorGap = 2;
    
    if (moduleData.id.includes('dual')) {
      const doorWidth = roundMmToTenth((customWidth - doorGap * 3) / 2);
      panels.door.push({
        name: '좌측 도어',
        width: doorWidth,
        height: height - doorGap * 2,
        thickness: PET_PANEL_THICKNESS_MM,
        material: 'PET'
      });
      panels.door.push({
        name: '우측 도어',
        width: doorWidth,
        height: height - doorGap * 2,
        thickness: PET_PANEL_THICKNESS_MM,
        material: 'PET'
      });
    } else {
      panels.door.push({
        name: '도어',
        width: customWidth - doorGap * 2,
        height: height - doorGap * 2,
        thickness: PET_PANEL_THICKNESS_MM,
        material: 'PET'
      });
    }
  }
  
  // 플랫 배열로 변환하여 반환 (상부장 → 안전선반 → 하부장 순서)
  const result = [];
  
  // 상부장 패널 (상부 섹션)
  if (panels.upper.length > 0) {
    result.push({ name: `=== ${t('furniture.upperSection')} ===` });
    result.push(...panels.upper);
  }
  
  // 공통 패널 (안전선반/칸막이) - 상부장과 하부장 사이
  if (panels.common.length > 0) {
    result.push(...panels.common);
  }
  
  // 하부장 패널 (하부 섹션)
  if (panels.lower.length > 0) {
    result.push({ name: `=== ${t('furniture.lowerSection')} ===` });
    result.push(...panels.lower);
  }
  
  // 도어 패널은 필요시 표시
  if (panels.door.length > 0 && hasDoor) {
    result.push({ name: `=== ${t('furniture.door')} ===` });
    result.push(...panels.door);
  }
  
  return result;
};
*/

// 뒷턱 다채움 높이 계산: 상판 윗면 ~ 상부장 하단 (또는 천장)
const calcBackLipFillHeight = (
  currentMod: any, moduleData: any, spaceInfo: any, placedModules: any[]
): number => {
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 상판 윗면 절대 위치
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatH = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const isStandType = spaceInfo.baseConfig?.type === 'stand';
  const modHasBaseOff = currentMod.hasBase === false && !isStandType;
  const railOrBaseH = modHasBaseOff ? 0
    : (currentMod.baseFrameHeight !== undefined && !isStandType) ? currentMod.baseFrameHeight
    : isStandType ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))
    : calculateBaseFrameHeight(spaceInfo);
  const indivFloat = modHasBaseOff ? (currentMod.individualFloatHeight ?? 0) : 0;
  const baseH = isFloating ? floatH : (railOrBaseH + indivFloat);
  const floorH = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const lowerBodyH = currentMod.cabinetBodyHeight ?? currentMod.freeHeight ?? currentMod.customHeight ?? moduleData?.dimensions?.height ?? 785;
  const stoneT = resolveCountertopThicknessMm(currentMod, spaceInfo);
  const lowerTopMm = floorH + baseH + lowerBodyH + stoneT;

  // 현재 하부장의 X 영역(좌→우 mm)
  const selfWmm = (currentMod.isFreePlacement && currentMod.freeWidth)
    ? currentMod.freeWidth
    : (currentMod.customWidth || currentMod.adjustedWidth || currentMod.moduleWidth || moduleData?.dimensions?.width || 0);
  const selfCxMm = Math.round((currentMod.position?.x ?? 0) * 100);
  const selfL = selfCxMm - selfWmm / 2;
  const selfR = selfCxMm + selfWmm / 2;

  // X 영역이 겹치는 상부장 모두 찾기 (듀얼/싱글 혼용 대응)
  const overlappingUppers = placedModules.filter((m: any) => {
    if (m.id === currentMod.id) return false;
    const md = getModuleById(m.moduleId, internalSpace, spaceInfo) || buildModuleDataFromPlacedModule(m);
    if (md?.category !== 'upper') return false;
    const wmm = (m.isFreePlacement && m.freeWidth)
      ? m.freeWidth
      : (m.customWidth || m.adjustedWidth || m.moduleWidth || md?.dimensions?.width || 0);
    const cxMm = Math.round((m.position?.x ?? 0) * 100);
    const l = cxMm - wmm / 2;
    const r = cxMm + wmm / 2;
    return l < selfR - 1 && r > selfL + 1; // 1mm 미만 접촉은 비겹침
  });

  let targetMm: number;
  if (overlappingUppers.length > 0) {
    // 겹치는 상부장 중 가장 낮은(=가구 하단이 가장 아래) 천장 한계로 결정
    let minTarget = Infinity;
    for (const upper of overlappingUppers) {
      const upperMd = getModuleById(upper.moduleId, internalSpace, spaceInfo) || buildModuleDataFromPlacedModule(upper);
      const upperH = upper.cabinetBodyHeight ?? upperMd?.dimensions?.height ?? 785;
      const topFrame = upper.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
      const t = (spaceInfo.height || 2400) - topFrame - upperH;
      if (t < minTarget) minTarget = t;
    }
    targetMm = minTarget;
  } else {
    targetMm = spaceInfo.height || 2400;
  }

  return Math.max(0, Math.round(targetMm - lowerTopMm));
};

const PlacedModulePropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState<number | null>(null);
  const setHighlightedPanel = useUIStore(state => state.setHighlightedPanel);
  const setHighlightedSection = useUIStore(state => state.setHighlightedSection);
  const setSelectedFurnitureId = useUIStore(state => state.setSelectedFurnitureId);
  const setPanelListTabActive = useUIStore(state => state.setPanelListTabActive);
  const activePopup = useUIStore(state => state.activePopup);
  const closeAllPopups = useUIStore(state => state.closeAllPopups);
  const setHighlightedFrame = useUIStore(state => state.setHighlightedFrame);
  const hingePositionEditModeModuleId = useUIStore(state => state.hingePositionEditModeModuleId);
  const setHingePositionEditModeModuleId = useUIStore(state => state.setHingePositionEditModeModuleId);
  const lockedHingeGaps = useUIStore(state => state.lockedHingeGaps);
  const toggleHingeGapLock = useUIStore(state => state.toggleHingeGapLock);
  const clearHingeGapLocks = useUIStore(state => state.clearHingeGapLocks);
  const setViewMode = useUIStore(state => state.setViewMode);
  const setView2DDirection = useUIStore(state => state.setView2DDirection);
  const setShowDimensions = useUIStore(state => state.setShowDimensions);

  // 컴포넌트 언마운트 시 패널 강조 해제
  useEffect(() => {
    return () => {
      setHighlightedPanel(null);
    };
  }, [setHighlightedPanel]);

  // 패널 목록 탭 활성 상태를 전역으로 공유하여 3D 툴바 표시를 제어
  useEffect(() => {
    setPanelListTabActive(showDetails);
    return () => {
      setPanelListTabActive(false);
    };
  }, [showDetails, setPanelListTabActive]);

  // 팝업이 열려 있는 동안 선택 상태 유지 (패널 목록 탭 전환 시 강조 유지)
  useEffect(() => {
    if (activePopup?.type === 'furnitureEdit' && activePopup.id) {
      setSelectedFurnitureId(activePopup.id);
    }
  }, [activePopup?.type, activePopup?.id, setSelectedFurnitureId]);

  // 컴포넌트 마운트 시 스타일 강제 적용 (다크모드 대응)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* 모든 테마에서 input 필드는 항상 흰 배경에 검은 텍스트 */
      .furniture-depth-input,
      input.furniture-depth-input,
      .${styles.depthInput},
      .${styles.panel} input[type="text"],
      .${styles.panel} input[type="number"],
      .${styles.depthInputWrapper} input,
      .${styles.inputWithUnit} input {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
        opacity: 1 !important;
        caret-color: #000000 !important;
      }
      .furniture-depth-input:focus,
      input.furniture-depth-input:focus,
      .${styles.depthInput}:focus,
      .${styles.panel} input[type="text"]:focus,
      .${styles.panel} input[type="number"]:focus,
      .${styles.depthInputWrapper} input:focus,
      .${styles.inputWithUnit} input:focus {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
      }
      /* 모든 상태에서 적용 */
      .${styles.depthInput}:hover,
      .${styles.depthInput}:active,
      .${styles.depthInput}:disabled,
      .${styles.depthInput}::placeholder {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
      }
      /* 다크 테마 클래스가 있는 경우 */
      .theme-dark .furniture-depth-input,
      .theme-dark input.furniture-depth-input,
      .theme-dark .${styles.depthInput},
      .theme-dark .${styles.panel} input,
      body.theme-dark .${styles.depthInput},
      html.theme-dark .${styles.depthInput} {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
      }
    `;
    // 스타일을 가장 마지막에 추가하여 우선순위 보장
    document.head.appendChild(style);
    style.setAttribute('data-furniture-panel-styles', 'true');
    
    return () => {
      if (style.parentNode) {
        document.head.removeChild(style);
      }
    };
  }, []);
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const removeModule = useFurnitureStore(state => state.removeModule);

  // 훅 선언부를 조건문 위로 이동
  const [customDepth, setCustomDepth] = useState<number>(580); // 임시 기본값
  const [depthInputValue, setDepthInputValue] = useState<string>('580');
  const [depthError, setDepthError] = useState<string>('');
  const [lowerSectionDepth, setLowerSectionDepth] = useState<number | undefined>(undefined); // 하부 섹션 깊이
  const [upperSectionDepth, setUpperSectionDepth] = useState<number | undefined>(undefined); // 상부 섹션 깊이
  const [lowerDepthInput, setLowerDepthInput] = useState<string>(''); // 하부 섹션 깊이 입력 필드
  const [upperDepthInput, setUpperDepthInput] = useState<string>(''); // 상부 섹션 깊이 입력 필드
  const [lowerDepthDirection, setLowerDepthDirection] = useState<'front' | 'back'>('front'); // 하부 깊이 줄이는 방향
  const [upperDepthDirection, setUpperDepthDirection] = useState<'front' | 'back'>('front'); // 상부 깊이 줄이는 방향
  const [lowerWidthInput, setLowerWidthInput] = useState<string>(''); // 하부 섹션 너비 입력 필드
  const [upperWidthInput, setUpperWidthInput] = useState<string>(''); // 상부 섹션 너비 입력 필드
  const [lowerWidthDirection, setLowerWidthDirection] = useState<'left' | 'right'>('left'); // 하부 너비 줄이는 방향 (left: 좌고정, right: 우고정)
  const [upperWidthDirection, setUpperWidthDirection] = useState<'left' | 'right'>('left'); // 상부 너비 줄이는 방향
  const [lowerTopOffset, setLowerTopOffset] = useState<number>(0); // 하부 섹션 상판 옵셋 (mm)
  const [lowerTopOffsetInput, setLowerTopOffsetInput] = useState<string>('0'); // 하부 섹션 상판 옵셋 입력
  // EP 옵셋 입력 임시 문자열 — '-' 단독 입력 허용용 (undefined면 store값 표시)
  const [epInputs, setEpInputs] = useState<{
    topGap?: string;
    bottomGap?: string;
    leftFront?: string;
    leftBack?: string;
    rightFront?: string;
    rightBack?: string;
    topBackLip?: string;
    topBackLipThickness?: string;
  }>({});
  const [customWidth, setCustomWidth] = useState<number>(600); // 기본 컬럼 너비로 변경
  const [widthInputValue, setWidthInputValue] = useState<string>('600');
  const [widthError, setWidthError] = useState<string>('');
  const [hingePosition, setHingePosition] = useState<'left' | 'right'>('right');
  const [hingeType, setHingeType] = useState<'A' | 'B'>('A');
  const [hingePositionDrafts, setHingePositionDrafts] = useState<Record<string, string>>({});
  const [hingeGapDrafts, setHingeGapDrafts] = useState<Record<string, string>>({});
  const [hingeGapEditBases, setHingeGapEditBases] = useState<Record<string, { topDistancesMm: number[]; doorHeightMm: number }>>({});
  const [hasDoor, setHasDoor] = useState<boolean>(false);
  const [doorSplit, setDoorSplit] = useState<boolean>(false);
  const [hasGapBackPanel, setHasGapBackPanel] = useState<boolean>(false); // 상하부장 사이 갭 백패널 상태
  const [backPanelThicknessValue, setBackPanelThicknessValue] = useState<number>(9); // 백패널 두께 (기본값: 9mm)
  const [columnPlacementMode, setColumnPlacementMode] = useState<'beside' | 'front'>('beside'); // 기둥 C 배치 모드
  const [cabinetBodyHeightInput, setCabinetBodyHeightInput] = useState<string>('785'); // 하부장 몸통 높이 입력

  // 자유배치 모드 치수 상태
  const [freeWidthInput, setFreeWidthInput] = useState<string>('');
  const [freeHeightInput, setFreeHeightInput] = useState<string>('');
  const [freeDepthInput, setFreeDepthInput] = useState<string>('');
  const freeHeightFocusedRef = React.useRef(false); // H 입력 포커스 추적
  const epDepthFocusedRef = React.useRef(false); // EP 깊이 (unused, kept for compat)
  const [epThicknessInput, setEpThicknessInput] = useState<string>(''); // EP 두께 로컬 버퍼
  const epThicknessFocusedRef = React.useRef(false); // EP 두께 입력 포커스 추적

  // 섹션별 치수 상태 (자유배치 + customConfig 분할 가구용)
  const [sectionHeightInputs, setSectionHeightInputs] = useState<Record<number, string>>({});
  const [sectionHeightFocusedIndex, setSectionHeightFocusedIndex] = useState<number | null>(null);
  const [sectionDepthInputs, setSectionDepthInputs] = useState<Record<number, string>>({});
  const [sectionWidthInputs, setSectionWidthInputs] = useState<Record<number, string>>({});
  // 좌우분할(horizontalSplit) 서브박스 치수
  const [hsLeftWidthInput, setHsLeftWidthInput] = useState<Record<number, string>>({});
  const [hsRightWidthInput, setHsRightWidthInput] = useState<Record<number, string>>({});
  const [hsLeftDepthInput, setHsLeftDepthInput] = useState<Record<number, string>>({});
  const [hsRightDepthInput, setHsRightDepthInput] = useState<Record<number, string>>({});
  const [hsCenterWidthInput, setHsCenterWidthInput] = useState<Record<number, string>>({});
  const [hsCenterDepthInput, setHsCenterDepthInput] = useState<Record<number, string>>({});

  // 띄움배치일 때 바닥 이격거리를 띄움 높이로 연동
  const [doorTopGap, setDoorTopGap] = useState<number>(0); // 병합 모드: 천장에서 아래로 (바닥/천장 기준)
  const [doorBottomGap, setDoorBottomGap] = useState<number>(0); // 병합 모드: 바닥에서 위로 (바닥/천장 기준)
  const [doorTopGapInput, setDoorTopGapInput] = useState<string>('0');

  // 분할 모드용 섹션별 이격거리
  const [upperDoorTopGap, setUpperDoorTopGap] = useState<number>(0); // 상부: 몸통 기준 +값이면 위로 확장
  const [upperDoorBottomGap, setUpperDoorBottomGap] = useState<number>(0); // 상부: 몸통 기준 +값이면 아래로 확장
  const [lowerDoorTopGap, setLowerDoorTopGap] = useState<number>(0); // 하부: 중간판에서 아래로
  const [lowerDoorBottomGap, setLowerDoorBottomGap] = useState<number>(0); // 하부: 몸통 기준 +값이면 아래로 확장
  const [upperDoorTopGapInput, setUpperDoorTopGapInput] = useState<string>('0');
  const [upperDoorBottomGapInput, setUpperDoorBottomGapInput] = useState<string>('0');
  const [lowerDoorTopGapInput, setLowerDoorTopGapInput] = useState<string>('0');
  const [lowerDoorBottomGapInput, setLowerDoorBottomGapInput] = useState<string>('0');
  const [doorBottomGapInput, setDoorBottomGapInput] = useState<string>('0');
  const [originalDoorTopGap, setOriginalDoorTopGap] = useState<number>(0);
  const [originalDoorBottomGap, setOriginalDoorBottomGap] = useState<number>(0);

  // 도어 셋팅 (자유배치 모드)
  const [doorSettingMode, setDoorSettingMode] = useState<'auto' | 'manual'>('auto');
  const [doorOverlayLeft, setDoorOverlayLeft] = useState<number>(0);
  const [doorOverlayRight, setDoorOverlayRight] = useState<number>(0);
  const [doorOverlayTop, setDoorOverlayTop] = useState<number>(0);
  const [doorOverlayBottom, setDoorOverlayBottom] = useState<number>(0);
  const [doorOverlayLeftInput, setDoorOverlayLeftInput] = useState<string>('0');
  const [doorOverlayRightInput, setDoorOverlayRightInput] = useState<string>('0');
  const [doorOverlayTopInput, setDoorOverlayTopInput] = useState<string>('0');
  const [doorOverlayBottomInput, setDoorOverlayBottomInput] = useState<string>('0');
  const [doorWidthAdjustInput, setDoorWidthAdjustInput] = useState<string>('');
  const [doorWidthAdjustInputFocused, setDoorWidthAdjustInputFocused] = useState(false);
  const [originalDoorSettingMode, setOriginalDoorSettingMode] = useState<'auto' | 'manual'>('auto');
  const [originalDoorOverlayLeft, setOriginalDoorOverlayLeft] = useState<number>(0);
  const [originalDoorOverlayRight, setOriginalDoorOverlayRight] = useState<number>(0);
  const [originalDoorOverlayTop, setOriginalDoorOverlayTop] = useState<number>(0);
  const [originalDoorOverlayBottom, setOriginalDoorOverlayBottom] = useState<number>(0);

  // 취소 시 복원을 위한 모든 초기값 저장
  const [originalCustomDepth, setOriginalCustomDepth] = useState<number>(580);
  const [originalCustomWidth, setOriginalCustomWidth] = useState<number>(600);
  const [originalLowerSectionDepth, setOriginalLowerSectionDepth] = useState<number | undefined>(undefined);
  const [originalUpperSectionDepth, setOriginalUpperSectionDepth] = useState<number | undefined>(undefined);
  const [originalLowerDepthDirection, setOriginalLowerDepthDirection] = useState<'front' | 'back'>('front');
  const [originalUpperDepthDirection, setOriginalUpperDepthDirection] = useState<'front' | 'back'>('front');
  const [originalLowerTopOffset, setOriginalLowerTopOffset] = useState<number>(0);
  const [originalHingePosition, setOriginalHingePosition] = useState<'left' | 'right'>('right');
  const [originalHingeType, setOriginalHingeType] = useState<'A' | 'B'>('A');
  const [originalHasDoor, setOriginalHasDoor] = useState<boolean>(false);
  const [originalDoorSplit, setOriginalDoorSplit] = useState<boolean>(false);
  const [originalHasGapBackPanel, setOriginalHasGapBackPanel] = useState<boolean>(false);
  const [originalBackPanelThickness, setOriginalBackPanelThickness] = useState<number>(9);
  const [originalColumnPlacementMode, setOriginalColumnPlacementMode] = useState<'beside' | 'front'>('beside');
  const [originalUpperDoorTopGap, setOriginalUpperDoorTopGap] = useState<number>(5);
  const [originalUpperDoorBottomGap, setOriginalUpperDoorBottomGap] = useState<number>(0);
  const [originalLowerDoorTopGap, setOriginalLowerDoorTopGap] = useState<number>(0);
  const [originalLowerDoorBottomGap, setOriginalLowerDoorBottomGap] = useState<number>(45);

  // 선반장 편집 상태 (섹션별)
  const [lowerShelfCount, setLowerShelfCount] = useState<number>(0);
  const [lowerShelfPositionInputs, setLowerShelfPositionInputs] = useState<string[]>([]);
  const [upperShelfCount, setUpperShelfCount] = useState<number>(0);
  const [upperShelfPositionInputs, setUpperShelfPositionInputs] = useState<string[]>([]);

  // 전체 팝업에서 엔터키 처리 - 조건문 위로 이동
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // e.target과 activeElement 둘 다 체크 — input의 onKeyDown(blur())이 먼저 실행돼
      // activeElement는 body로 바뀌어도 e.target은 여전히 원래 input
      const target = e.target as HTMLElement | null;
      const activeElement = document.activeElement as HTMLElement | null;
      const isTargetForm = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const isActiveForm = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
      const isFormElement = isTargetForm || isActiveForm;
      if (isFormElement) {
        if (e.key === 'Escape') {
          e.preventDefault();
          // 취소: 원래값 복원 후 팝업 닫기
          activeElement?.blur();
          handleCancel();
        }
        // Enter는 input의 onKeyDown 핸들러가 처리하도록 글로벌 핸들러는 건드리지 않음
        // (글로벌이 먼저 closeAllPopups 호출하면 React input onKeyDown이 실행 안 됨)
        return;
      }

      // 메인 팝업이 열려있을 때 (input 밖)
      if (activePopup.type === 'furnitureEdit') {
        if (e.key === 'Enter') {
          e.preventDefault();
          closeAllPopups(); // 확인
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel(); // 취소: 원래값 복원
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePopup.type, closeAllPopups]);
  
  // 기본 가구 깊이 계산
  const getDefaultDepth = useCallback((moduleData?: ModuleData) => {
    return getDefaultFurnitureDepth(spaceInfo, moduleData);
  }, [spaceInfo]);

  // 현재 편집 중인 배치된 모듈 찾기 (조건부 렌더링 전에 미리 계산)
  const currentPlacedModule = activePopup.type === 'furnitureEdit' && activePopup.id 
    ? placedModules.find(module => module.id === activePopup.id)
    : null;
  const isGlassCabinetModule = !!currentPlacedModule?.moduleId?.includes('glass-cabinet');
  const isDummyModule = isDummyModuleId(currentPlacedModule?.moduleId);
  const isHingePositionEditMode = !!currentPlacedModule && hingePositionEditModeModuleId === currentPlacedModule.id;

  useEffect(() => {
    setDoorWidthAdjustInput('');
    setDoorWidthAdjustInputFocused(false);
  }, [currentPlacedModule?.id]);

  useEffect(() => {
    if (
      hingePositionEditModeModuleId &&
      (
        activePopup.type !== 'furnitureEdit' ||
        activePopup.id !== hingePositionEditModeModuleId ||
        currentPlacedModule?.moduleId?.includes('glass-cabinet') ||
        isDummyModuleId(currentPlacedModule?.moduleId)
      )
    ) {
      setHingePositionEditModeModuleId(null);
    }
  }, [activePopup.type, activePopup.id, currentPlacedModule?.moduleId, hingePositionEditModeModuleId, setHingePositionEditModeModuleId]);

  useEffect(() => {
    setHingeGapDrafts({});
  }, [
    currentPlacedModule?.id
  ]);

  // 같은 슬롯의 반대편 캐비넷이 이미 백패널을 가지고 있는지 확인
  const isBackPanelAlreadyInSlot = React.useMemo(() => {
    if (!currentPlacedModule || currentPlacedModule.slotIndex === undefined) return false;
    
    const internalSpace = calculateInternalSpace(spaceInfo);
    const currentModuleData = getModuleById(currentPlacedModule.moduleId, internalSpace, spaceInfo)
      || buildModuleDataFromPlacedModule(currentPlacedModule);
    if (!currentModuleData) return false;

    const isCurrentUpper = currentModuleData.category === 'upper' || currentPlacedModule.moduleId.includes('upper-cabinet');
    const isCurrentLower = currentModuleData.category === 'lower' || currentPlacedModule.moduleId.includes('lower-cabinet');

    if (!isCurrentUpper && !isCurrentLower) return false;

    // 같은 슬롯의 다른 가구들 확인
    return placedModules.some(module => {
      if (module.id === currentPlacedModule.id) return false; // 자기 자신 제외
      if (module.slotIndex !== currentPlacedModule.slotIndex) return false; // 다른 슬롯 제외

      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo)
        || buildModuleDataFromPlacedModule(module);
      if (!moduleData) return false;
      
      const isUpper = moduleData.category === 'upper' || module.moduleId.includes('upper-cabinet');
      const isLower = moduleData.category === 'lower' || module.moduleId.includes('lower-cabinet');
      
      // 현재가 상부장이면 하부장 확인, 현재가 하부장이면 상부장 확인
      if (isCurrentUpper && isLower && module.hasGapBackPanel) return true;
      if (isCurrentLower && isUpper && module.hasGapBackPanel) return true;
      
      return false;
    });
  }, [currentPlacedModule, placedModules, spaceInfo]);

  // 모듈 데이터 가져오기 (조건부 렌더링 전에 미리 계산)
  const moduleData = currentPlacedModule
    ? (() => {
        // 커스텀 모듈 (My캐비넷 또는 customizable 자유배치): buildModuleDataFromPlacedModule 사용
        if (currentPlacedModule.customConfig && (!currentPlacedModule.isCustomizable || currentPlacedModule.moduleId.startsWith('customizable-'))) {
          return buildModuleDataFromPlacedModule(currentPlacedModule) || ({
            id: currentPlacedModule.moduleId,
            name: '커스텀 캐비넷',
            category: 'full' as const,
            dimensions: { width: 600, height: 2000, depth: 580 },
            color: '#C8B69E',
            hasDoor: false,
            isDynamic: false,
            modelConfig: { basicThickness: spaceInfo.panelThickness ?? 18 },
          } as ModuleData);
        }

        // customWidth가 있으면 해당 너비로 모듈 ID 생성 (소수점 포함)
        let targetModuleId = currentPlacedModule.moduleId;
        if (currentPlacedModule.customWidth) {
          const baseType = currentPlacedModule.moduleId.replace(/-[\d.]+$/, '');
          targetModuleId = `${baseType}-${currentPlacedModule.customWidth}`;
        }
        // 단내림 구간 가구는 zone 정보를 포함한 spaceInfo로 moduleData 조회
        // (3D 렌더링의 FurnitureItem.tsx와 동일하게 zone 반영)
        let effectiveSpaceInfo = spaceInfo;
        if (currentPlacedModule.zone === 'dropped') {
          effectiveSpaceInfo = { ...spaceInfo, zone: 'dropped' as const };
        }
        const data = getModuleById(targetModuleId, calculateInternalSpace(effectiveSpaceInfo), effectiveSpaceInfo)
          || buildModuleDataFromPlacedModule(currentPlacedModule);
        return withUpperSafetyShelfRemoved(data as ModuleData, currentPlacedModule.removeUpperSafetyShelf);
      })()
    : null;

  const autoDroppedUpperHeight = (() => {
    if (!currentPlacedModule || !moduleData) return false;
    const matchesAutoHeight = (value?: number) => {
      if (moduleData.category !== 'upper' || currentPlacedModule.zone !== 'dropped' || typeof value !== 'number') {
        return false;
      }

      const expectedHeights: number[] = [];
      if (spaceInfo.droppedCeiling?.enabled && typeof spaceInfo.droppedCeiling.dropHeight === 'number') {
        const topFrameMm = spaceInfo.frameSize?.top || 0;
        const baseFrameMm = spaceInfo.baseConfig?.height || 0;
        expectedHeights.push(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight - topFrameMm - baseFrameMm);
        expectedHeights.push(calculateInternalSpace({ ...spaceInfo, zone: 'dropped' as const }).height);
      }
      if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
        expectedHeights.push(calculateInternalSpace({
          ...spaceInfo,
          height: spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0)
        }).height);
      }

      return expectedHeights.some(height => Math.round(height) === Math.round(value));
    };

    return {
      freeHeight: matchesAutoHeight(currentPlacedModule.freeHeight),
      customHeight: matchesAutoHeight(currentPlacedModule.customHeight),
    };
  })();

  const isStaleUpperTotalHeight = (value?: number) => {
    if (!moduleData || moduleData.category !== 'upper' || typeof value !== 'number') return false;
    const rounded = Math.round(value);
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 65;
    return rounded === 850
      || rounded === 868
      || rounded === Math.round(moduleData.dimensions.height + baseFrameHeight)
      || rounded === Math.round(moduleData.dimensions.height + 60)
      || rounded === Math.round(moduleData.dimensions.height + 65);
  };
  const normalizeLowerBodyHeightForDisplay = React.useCallback((height: number) => {
    if (!currentPlacedModule || !moduleData || moduleData.category !== 'lower') return height;
    if (!Number.isFinite(height) || spaceInfo.baseConfig?.type === 'stand') return height;

    const baseFrameHeight = Math.max(0, Math.round(
      currentPlacedModule.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 0
    ));
    if (baseFrameHeight <= 0) return height;

    const storedHeight = Math.round(height);
    const bodyCandidate = storedHeight - baseFrameHeight;
    if (bodyCandidate <= 0) return height;

    const expectedBodyHeights = [
      moduleData.dimensions.height,
      currentPlacedModule.cabinetBodyHeight,
      currentPlacedModule.customHeight,
    ]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
      .map(value => Math.round(value));

    return expectedBodyHeights.some(expected => Math.abs(expected - bodyCandidate) <= 1)
      ? bodyCandidate
      : height;
  }, [
    currentPlacedModule,
    moduleData,
    spaceInfo.baseConfig?.height,
    spaceInfo.baseConfig?.type,
  ]);

  const placedBodyHeight = currentPlacedModule && moduleData
    ? (() => {
      // 자유배치: 사용자가 직접 조정한 freeHeight/customHeight를 항상 우선 신뢰한다.
      //  (autoDroppedUpperHeight가 없을 때 freeHeight를 무시해 팝업이 옛 기본 높이를
      //   표시하던 문제 수정 — 자유배치 키큰장 높이 변경이 팝업에 반영 안 되던 원인)
      const isFreePlacementModule = !!currentPlacedModule.isFreePlacement;
      const validFreeHeight = isFreePlacementModule
        ? (typeof currentPlacedModule.freeHeight === 'number' && currentPlacedModule.freeHeight > 0
            ? currentPlacedModule.freeHeight
            : undefined)
        : (autoDroppedUpperHeight && !autoDroppedUpperHeight.freeHeight && !isStaleUpperTotalHeight(currentPlacedModule.freeHeight)
            ? currentPlacedModule.freeHeight
            : undefined);
      const validCustomHeight = isFreePlacementModule
        ? (typeof currentPlacedModule.customHeight === 'number' && currentPlacedModule.customHeight > 0
            ? currentPlacedModule.customHeight
            : undefined)
        : (autoDroppedUpperHeight && !autoDroppedUpperHeight.customHeight
            ? currentPlacedModule.customHeight
            : undefined);
      const storedModuleHeight = isFreePlacementModule
        && typeof currentPlacedModule.moduleData?.dimensions?.height === 'number'
        && currentPlacedModule.moduleData.dimensions.height > 0
        ? currentPlacedModule.moduleData.dimensions.height
        : undefined;
      const topFrameDerivedFullHeight = isFreePlacementModule
        && moduleData.category === 'full'
        && !isPlainShoeShelfModuleId(currentPlacedModule.moduleId)
        && typeof currentPlacedModule.topFrameThickness === 'number'
        && currentPlacedModule.userResizedHeight !== true
        ? Math.max(100, Math.round(
            calculateInternalSpace(spaceInfo).height
            - (currentPlacedModule.topFrameThickness - (spaceInfo.frameSize?.top ?? 30))
          ))
        : undefined;
      const manuallyResizedHeight = isFreePlacementModule && currentPlacedModule.userResizedHeight === true
        ? (validFreeHeight ?? validCustomHeight)
        : undefined;

      const baseHeight = moduleData.category === 'upper'
        ? (validCustomHeight ?? validFreeHeight ?? storedModuleHeight ?? moduleData.dimensions.height)
        : (manuallyResizedHeight ?? topFrameDerivedFullHeight ?? validFreeHeight ?? validCustomHeight ?? storedModuleHeight ?? moduleData.dimensions.height);
      const normalizedBodyHeight = normalizeLowerBodyHeightForDisplay(baseHeight);
      // 자유배치 가구는 공간 높이가 아니라 사용자가 정한 실제 높이를 쓴다.
      //  (getFullBodyDisplayHeight는 spaceInfo.height로 고정 → 자유배치에서 높이 변경이
      //   팝업에 반영 안 되고 초기화되던 원인. 슬롯배치 키큰장만 공간높이 고정 유지.)
      return (usesStableShelfSectionBoundary(currentPlacedModule.moduleId) && !currentPlacedModule.isFreePlacement)
        ? getFullBodyDisplayHeight(currentPlacedModule, spaceInfo, normalizedBodyHeight)
        : normalizedBodyHeight;
    })()
    : 0;
  const isAutoBodyHeightInput = !!currentPlacedModule
    && usesStableShelfSectionBoundary(currentPlacedModule.moduleId)
    && !currentPlacedModule.isFreePlacement;
  const bodyHeightInputValue = isAutoBodyHeightInput ? Math.round(placedBodyHeight).toString() : freeHeightInput;

  const buildFreePlacementBodyHeightSectionUpdate = React.useCallback((requestedBodyHeight: number) => {
    if (
      !currentPlacedModule?.isFreePlacement ||
      !moduleData ||
      moduleData.category !== 'full' ||
      isPlainShoeShelfModuleId(currentPlacedModule.moduleId)
    ) {
      return { bodyHeight: Math.max(100, Math.round(requestedBodyHeight)) };
    }

    const sourceSections = Array.isArray((currentPlacedModule as any).customSections)
      && (currentPlacedModule as any).customSections.length >= 2
      ? (currentPlacedModule as any).customSections
      : moduleData.modelConfig?.sections;
    if (!Array.isArray(sourceSections) || sourceSections.length < 2) {
      return { bodyHeight: Math.max(100, Math.round(requestedBodyHeight)) };
    }

    return buildSectionsWithUpperAbsorbingBodyHeight(
      sourceSections,
      placedBodyHeight || moduleData.dimensions.height || requestedBodyHeight,
      requestedBodyHeight,
      moduleData.modelConfig?.basicThickness || 18
    );
  }, [
    currentPlacedModule,
    moduleData,
    placedBodyHeight,
  ]);

  const getCountertopThicknessHeightUpdates = React.useCallback((targetModule: any, nextThickness: number) => {
    const targetId = targetModule?.moduleId || '';
    const isLower = targetId.startsWith('lower-') || targetId.includes('-lower-') ||
      targetId.includes('lower-door-lift') || targetId.includes('lower-top-down') ||
      targetId.includes('lower-drawer') || targetId.includes('lower-sink') ||
      targetId.includes('lower-induction');
    if (!isLower) return {};

    const internalSpace = calculateInternalSpace(spaceInfo);
    const targetModuleData = getModuleById(targetId, internalSpace, spaceInfo) || buildModuleDataFromPlacedModule(targetModule);
    const currentBodyHeight = targetModule.cabinetBodyHeight
      ?? targetModule.freeHeight
      ?? targetModule.customHeight
      ?? targetModuleData?.dimensions?.height
      ?? 785;
    const currentThickness = resolveCountertopThicknessMm(targetModule, spaceInfo) || 20;
    const nextThicknessMm = resolveCountertopThicknessMm({ ...targetModule, stoneTopThickness: nextThickness }, spaceInfo) || 20;
    const nextBodyHeight = Math.max(100, Math.min(3000, Math.round(currentBodyHeight + currentThickness - nextThicknessMm)));
    const usesCabinetBodyHeight = targetId.includes('lower-drawer-2tier') || targetId.includes('dual-lower-drawer-2tier');
    return usesCabinetBodyHeight
      ? { cabinetBodyHeight: nextBodyHeight }
      : { freeHeight: nextBodyHeight };
  }, [spaceInfo]);
  // 기둥 슬롯 정보 및 기둥 C 여부 확인 (조건부 렌더링 전에 미리 계산)
  const { slotInfo, isCoverDoor, isColumnC } = React.useMemo(() => {
    if (!currentPlacedModule || !moduleData) return { slotInfo: null, isCoverDoor: false, isColumnC: false };
    
    // 슬롯 인덱스가 있으면 기둥 슬롯 분석
    let slotInfo = null;
    if (currentPlacedModule.slotIndex !== undefined) {
      const columnSlots = analyzeColumnSlots(spaceInfo);
      slotInfo = columnSlots[currentPlacedModule.slotIndex];
    } else {
      // 슬롯 인덱스가 없으면 위치 기반으로 판단
      const columnSlots = analyzeColumnSlots(spaceInfo);
      const indexing = calculateSpaceIndexing(spaceInfo);
      
      // 가구 위치에서 가장 가까운 슬롯 찾기
      const slotIndex = indexing.threeUnitPositions.findIndex(pos => 
        Math.abs(pos - currentPlacedModule.position.x) < 0.1
      );
      
      if (slotIndex >= 0) {
        slotInfo = columnSlots[slotIndex];
      }
    }
    
    const isCoverDoor = slotInfo?.hasColumn || false;
    // 기둥 C 판단: columnType이 'medium'인 경우 (300mm 깊이 기둥)
    const isColumnC = slotInfo?.columnType === 'medium' || false;

    return { slotInfo, isCoverDoor, isColumnC };
  }, [currentPlacedModule, moduleData, spaceInfo]);

  const moduleDefaultLowerTopOffset = React.useMemo(() => {
    if (!moduleData?.id) return 0;
    // 2단/4단 서랍장, 인출장: 85mm 기본 (1·2단 상판 앞 옵셋)
    // 팬트리장: 0 (1단 상판 풀깊이)
    return moduleData.id.includes('2drawer') || moduleData.id.includes('4drawer') || moduleData.id.includes('pull-out-cabinet') ? 85 : 0;
  }, [moduleData?.id]);

  // 초기값 설정 - 의존성에서 getDefaultDepth 제거하여 불필요한 재실행 방지
  useEffect(() => {
    if (currentPlacedModule && moduleData) {
      const initialDepth = currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null
        ? currentPlacedModule.customDepth
        : getDefaultDepth(moduleData);

      // 기둥에 의해 조정된 너비가 있으면 우선 사용, 없으면 slotCustomWidth, customWidth, 기본 너비 순
      const initialWidth = currentPlacedModule.adjustedWidth !== undefined && currentPlacedModule.adjustedWidth !== null
        ? currentPlacedModule.adjustedWidth
        : (currentPlacedModule.slotCustomWidth !== undefined
          ? currentPlacedModule.slotCustomWidth
          : (currentPlacedModule.customWidth !== undefined && currentPlacedModule.customWidth !== null
            ? currentPlacedModule.customWidth
            : moduleData.dimensions.width));

      // customDepth 초기화 — 가구 변경 시 항상 갱신
      setCustomDepth(initialDepth);
      setDepthInputValue(initialDepth.toString());
      setOriginalCustomDepth(initialDepth);
      // 섹션별 깊이 초기화
      const lowerDepth = currentPlacedModule.lowerSectionDepth;
      const upperDepth = currentPlacedModule.upperSectionDepth;
      const lowerDepthDir = currentPlacedModule.lowerSectionDepthDirection || 'front';
      const upperDepthDir = currentPlacedModule.upperSectionDepthDirection || lowerDepthDir;
      setLowerSectionDepth(lowerDepth);
      setUpperSectionDepth(upperDepth);
      setOriginalLowerSectionDepth(lowerDepth); // 원래 값 저장
      setOriginalUpperSectionDepth(upperDepth); // 원래 값 저장
      setLowerDepthDirection(lowerDepthDir);
      setUpperDepthDirection(upperDepthDir);
      setOriginalLowerDepthDirection(lowerDepthDir);
      setOriginalUpperDepthDirection(upperDepthDir);
      // 섹션별 깊이 입력 필드 초기화
      setLowerDepthInput(lowerDepth?.toString() ?? '');
      setUpperDepthInput(upperDepth?.toString() ?? '');

      const lowerOffset = currentPlacedModule.lowerSectionTopOffset ?? moduleDefaultLowerTopOffset;
      setLowerTopOffset(lowerOffset);
      setLowerTopOffsetInput(lowerOffset.toString());
      setOriginalLowerTopOffset(lowerOffset);
      // customWidth 초기화 — 가구 변경 시 항상 갱신
      const roundedWidth = Math.round(initialWidth * 10) / 10;
      setCustomWidth(roundedWidth);
      setWidthInputValue(roundedWidth % 1 === 0 ? roundedWidth.toString() : roundedWidth.toFixed(1));
      setOriginalCustomWidth(initialWidth);
      const isRightCornerCabinet = !!currentPlacedModule.moduleId?.includes('right-corner');
      const hingePos = currentPlacedModule.hingePosition || (isRightCornerCabinet ? 'left' : 'right');
      const hingeTypeVal = currentPlacedModule.hingeType || 'A';
      const hasDoorVal = currentPlacedModule.hasDoor ?? false; // 3D 렌더링(FurnitureItem)과 동일 기준
      const doorSplitVal = currentPlacedModule.doorSplit ?? false;
      const hasGapVal = currentPlacedModule.hasGapBackPanel ?? false;
      const rawBackPanelThicknessVal = currentPlacedModule.backPanelThickness ?? 9;
      const backPanelThicknessVal = rawBackPanelThicknessVal === 9.5
        ? 9
        : rawBackPanelThicknessVal === 5 || rawBackPanelThicknessVal === 5.5
          ? 6
          : rawBackPanelThicknessVal === 3.5
            ? 3
            : rawBackPanelThicknessVal;
      if (rawBackPanelThicknessVal !== backPanelThicknessVal && activePopup.id) {
        updatePlacedModule(activePopup.id, { backPanelThickness: backPanelThicknessVal });
      }
      setHingePosition(hingePos);
      setHingeType(hingeTypeVal);
      setHasDoor(hasDoorVal);
      setDoorSplit(doorSplitVal);
      setHasGapBackPanel(hasGapVal);
      setBackPanelThicknessValue(backPanelThicknessVal);
      setOriginalHingePosition(hingePos); // 원래 값 저장
      setOriginalHingeType(hingeTypeVal); // 원래 값 저장
      setOriginalHasDoor(hasDoorVal); // 원래 값 저장
      setOriginalDoorSplit(doorSplitVal); // 원래 값 저장
      setOriginalHasGapBackPanel(hasGapVal); // 원래 값 저장
      setOriginalBackPanelThickness(backPanelThicknessVal); // 원래 값 저장

      // 기둥 C 배치 모드 초기화
      const placementModeVal = currentPlacedModule.columnPlacementMode || 'beside';
      setColumnPlacementMode(placementModeVal);
      setOriginalColumnPlacementMode(placementModeVal);

      // 하부장 몸통 높이 초기화 (2단서랍장만)
      setCabinetBodyHeightInput((currentPlacedModule.cabinetBodyHeight ?? 785).toString());

      // 치수 초기화 (슬롯/자유배치 공통)
      // NOTE: roundedWidth를 사용 (customWidth state는 이 useEffect 내에서 아직 이전 값)
      {
        const isSlotMode = spaceInfo.layoutMode !== 'free-placement';
        const slotModeWidth = isSlotMode
          ? (currentPlacedModule.slotCustomWidth ?? roundedWidth ?? moduleData.dimensions.width)
          : (currentPlacedModule.freeWidth || roundedWidth || moduleData.dimensions.width);
        setFreeWidthInput((() => { const v = Math.round(slotModeWidth * 10) / 10; return v % 1 === 0 ? v.toString() : v.toFixed(1); })());
        // 2단서랍장: cabinetBodyHeight 우선, 그 외: 렌더링과 동일하게 freeHeight → customHeight → 기본 높이
        const is2TierDrawer = currentPlacedModule.moduleId.includes('lower-drawer-2tier') || currentPlacedModule.moduleId.includes('dual-lower-drawer-2tier');
        const rawBaseHeight = is2TierDrawer && currentPlacedModule.cabinetBodyHeight
          ? currentPlacedModule.cabinetBodyHeight
          : placedBodyHeight;
        const baseHeight = rawBaseHeight;
        // 상단몰딩 OFF 흡수분만 몸통 표시 높이에 반영한다.
        // 걸레받이 OFF는 가구 몸통 H에 더하지 않는다.
        const shouldAbsorbTopForBodyH = moduleData.category === 'full';
        const absorbedTopForH = shouldAbsorbTopForBodyH && currentPlacedModule.hasTopFrame === false
          ? Math.max(0, (currentPlacedModule.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30) - (currentPlacedModule.topFrameGap ?? 0))
          : 0;
        const lowerBaseForDisplay = moduleData.category === 'lower' && currentPlacedModule.hasBase !== false && spaceInfo.baseConfig?.type !== 'stand'
          ? (currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 105))
          : 0;
        const effectiveHeight = baseHeight + absorbedTopForH + lowerBaseForDisplay;
        // 자동 산정 가구는 상단/하단 프레임 변경에 따라 항상 갱신되어야 한다.
        if (usesStableShelfSectionBoundary(currentPlacedModule.moduleId) || !freeHeightFocusedRef.current) {
          setFreeHeightInput(Math.round(effectiveHeight).toString());
        }
        setFreeDepthInput(Math.round(currentPlacedModule.freeDepth || initialDepth).toString());

        // EP 두께 초기화
        if (!epThicknessFocusedRef.current) {
          setEpThicknessInput((currentPlacedModule.endPanelThickness ?? 18).toString());
        }

        // 섹션별 치수 초기화 (customConfig가 있을 때)
        const cc = currentPlacedModule.customConfig;
        if (cc && cc.sections && cc.sections.length > 0) {
          const pt = cc.panelThickness || 18;
          const totalDepth = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || moduleData.dimensions.depth;
          // 몸통치수 W와 동일한 우선순위 (slotCustomWidth = 슬롯 실폭 포함)
          const totalWidth = currentPlacedModule.freeWidth
            ?? currentPlacedModule.adjustedWidth
            ?? currentPlacedModule.slotCustomWidth
            ?? currentPlacedModule.customWidth
            ?? moduleData.dimensions.width;
          // 신발장: 옛 데이터의 섹션 깊이가 moduleData.dimensions.depth(600)로 stale 저장된 경우 무시
          const _isShoeCat =
            currentPlacedModule.moduleId.includes('-entryway-') ||
            currentPlacedModule.moduleId.includes('-shelf-') ||
            currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
            currentPlacedModule.moduleId.includes('-2drawer-shelf-');
          const _modDim = moduleData.dimensions.depth;
          const _hasCustom = typeof currentPlacedModule.customDepth === 'number' && currentPlacedModule.customDepth > 0;
          const _sec = (v: number | undefined) => (_isShoeCat && _hasCustom && v === _modDim) ? undefined : v;
          const _lowerSec = _sec(currentPlacedModule.lowerSectionDepth);
          const _upperSec = _sec(currentPlacedModule.upperSectionDepth);
          const hInputs: Record<number, string> = {};
          const dInputs: Record<number, string> = {};
          const wInputs: Record<number, string> = {};
          const hsLW: Record<number, string> = {};
          const hsRW: Record<number, string> = {};
          const hsLD: Record<number, string> = {};
          const hsRD: Record<number, string> = {};
          const hsCW: Record<number, string> = {};
          const hsCD: Record<number, string> = {};
          cc.sections.forEach((sec: any, i: number) => {
            // 섹션 높이 (내경 + 상하판 = 외경)
            hInputs[i] = Math.round(sec.height + 2 * pt).toString();
            // 섹션 깊이 (개별 깊이가 없으면 전체 깊이)
            if (i === 0) dInputs[i] = Math.round(_lowerSec ?? totalDepth).toString();
            else if (i === 1) dInputs[i] = Math.round(_upperSec ?? totalDepth).toString();
            else dInputs[i] = Math.round(totalDepth).toString();
            // 섹션 너비 (개별 너비가 없으면 전체 너비)
            wInputs[i] = (() => { const v = Math.round((sec.width || totalWidth) * 10) / 10; return v % 1 === 0 ? v.toString() : v.toFixed(1); })();
            // horizontalSplit 서브박스
            const hs = sec.horizontalSplit;
            if (hs) {
              const innerW = (sec.width || totalWidth) - 2 * pt;
              hsLW[i] = Math.round(hs.position || Math.floor(innerW / 2)).toString();
              if (hs.secondPosition) {
                hsCW[i] = Math.round(hs.secondPosition).toString();
                hsRW[i] = Math.round(innerW - (hs.position || 0) - (hs.secondPosition || 0) - 2 * pt).toString();
              } else {
                hsRW[i] = Math.round(innerW - (hs.position || Math.floor(innerW / 2)) - pt).toString();
              }
              hsLD[i] = Math.round(hs.leftDepth || totalDepth).toString();
              hsRD[i] = Math.round(hs.rightDepth || totalDepth).toString();
              if (hs.centerDepth) hsCD[i] = Math.round(hs.centerDepth).toString();
            }
          });
          setSectionHeightInputs(hInputs);
          setSectionDepthInputs(dInputs);
          setSectionWidthInputs(wInputs);
          setHsLeftWidthInput(hsLW);
          setHsRightWidthInput(hsRW);
          setHsLeftDepthInput(hsLD);
          setHsRightDepthInput(hsRD);
          setHsCenterWidthInput(hsCW);
          setHsCenterDepthInput(hsCD);
        } else {
          const isPullOutOrPantryInit = !!(
            currentPlacedModule.moduleId?.includes('pull-out-cabinet') ||
            currentPlacedModule.moduleId?.includes('pantry-cabinet') ||
            (currentPlacedModule.moduleId?.includes('fridge-cabinet') && !currentPlacedModule.moduleId?.includes('built-in-fridge')) ||
            currentPlacedModule.moduleId?.includes('shelf-split')
          );
          // 표준 가구: 사용자가 섹션 높이를 바꾼 경우 customSections를 우선 사용
          const userCustomSections = (currentPlacedModule as any).customSections;
          const mcSections = (Array.isArray(userCustomSections) && userCustomSections.length >= 2)
            ? userCustomSections
            : (moduleData.modelConfig?.sections || []);
          if (mcSections.length >= 2) {
            const pt = moduleData.modelConfig?.basicThickness || 18;
            // moduleData는 zone 반영된 getModuleById로 조회되므로 dimensions.height에 단내림이 반영됨.
            // 섹션별 높이 합은 팝업의 몸통치수 H와 같아야 한다.
            const baseBodyHeightForSections = placedBodyHeight;
            // 상부장은 천장/바닥과 무관 → 흡수 적용 안 함 (full/lower만)
            const shouldAbsorbTopForSections = moduleData.category === 'full';
            const absorbedTopForSections = shouldAbsorbTopForSections && currentPlacedModule.hasTopFrame === false
              ? Math.max(0, (currentPlacedModule.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30) - (currentPlacedModule.topFrameGap ?? 0))
              : 0;
            const rawSectionBasisH = Math.max(0, baseBodyHeightForSections + absorbedTopForSections);
            const isStableShelfSectionInit = usesStableShelfSectionBoundary(currentPlacedModule.moduleId);
            const sectionBasisH = isStableShelfSectionInit
              ? getRenderedSectionBasisHeight(currentPlacedModule, spaceInfo, rawSectionBasisH)
              : rawSectionBasisH;
            const totalD = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || moduleData.dimensions.depth;
            // 몸통치수 W와 동일한 우선순위 (slotCustomWidth = 슬롯 실폭 포함)
            const totalW = currentPlacedModule.freeWidth
              ?? currentPlacedModule.adjustedWidth
              ?? currentPlacedModule.slotCustomWidth
              ?? currentPlacedModule.customWidth
              ?? moduleData.dimensions.width;
            // 신발장: 옛 데이터의 섹션 깊이가 moduleData.dimensions.depth(600)로 stale 저장된 경우 무시
            const _isShoeCat2 =
              currentPlacedModule.moduleId.includes('-entryway-') ||
              currentPlacedModule.moduleId.includes('-shelf-') ||
              currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
              currentPlacedModule.moduleId.includes('-2drawer-shelf-');
            const _modDim2 = moduleData.dimensions.depth;
            const _hasCustom2 = typeof currentPlacedModule.customDepth === 'number' && currentPlacedModule.customDepth > 0;
            const _sec2 = (v: number | undefined) => (_isShoeCat2 && _hasCustom2 && v === _modDim2) ? undefined : v;
            const _lowerSec2 = _sec2(currentPlacedModule.lowerSectionDepth);
            const _upperSec2 = _sec2(currentPlacedModule.upperSectionDepth);
            const hInputs: Record<number, string> = {};
            const dInputs: Record<number, string> = {};
            const wInputs: Record<number, string> = {};
            const plainShoeShelfInitHeights = isStableShelfSectionInit
              ? getPlainShoeShelfSectionHeights(currentPlacedModule, spaceInfo, mcSections, sectionBasisH)
              : null;
            mcSections.forEach((sec: any, i: number) => {
              const ht = sec.heightType || 'percentage';
              const isLast = i === mcSections.length - 1;
              let sH: number;
              if (plainShoeShelfInitHeights) {
                sH = plainShoeShelfInitHeights[i] ?? 0;
              } else if (isPullOutOrPantryInit && (Array.isArray(userCustomSections) || sec.heightType === 'absolute')) {
                sH = sec.height || 0;
              } else if (isLast) {
                const fixedSum = mcSections.slice(0, -1).reduce((acc: number, s: any) => {
                  if ((s.heightType || 'percentage') === 'absolute') return acc + (s.height || 0);
                  const r = (s.height || s.heightRatio || 50) / 100;
                  return acc + Math.round(sectionBasisH * r);
                }, 0);
                sH = Math.max(0, sectionBasisH - fixedSum);
              } else if (ht === 'absolute') {
                sH = sec.height || 0;
              } else {
                sH = Math.round(sectionBasisH * ((sec.height || sec.heightRatio || 50) / 100));
              }
              hInputs[i] = Math.round(sH).toString();
              if (i === 0) dInputs[i] = Math.round(_lowerSec2 ?? totalD).toString();
              else if (i === 1) dInputs[i] = Math.round(_upperSec2 ?? totalD).toString();
              else dInputs[i] = Math.round(totalD).toString();
              // 0.1mm 단위 유지 (정수 반올림 시 599.5 → 600으로 몸통치수와 어긋남)
              wInputs[i] = (() => { const v = Math.round(totalW * 10) / 10; return v % 1 === 0 ? v.toString() : v.toFixed(1); })();
            });
            setSectionHeightInputs(hInputs);
            setSectionDepthInputs(dInputs);
            setSectionWidthInputs(wInputs);
          }
        }
      }

      // 도어 상하 갭 초기값 (몸통 기준, EP와 동일)
      // 상단갭 = 몸통 상단에서 위로, 하단갭 = 몸통 하단에서 아래로
      // 기본값 0 = 도어 == 몸통. 도어올림/상판내림은 모듈별 기본값 사용
      const modId = currentPlacedModule.moduleId || '';
      const isDoorSplitForDoorGaps = isDoorSplitModuleId(modId);
      const isDoorLift = isDoorLiftTopEndPanelModuleId(modId);
      const isTopDown = modId.includes('lower-top-down-');
      const isBasicLowerDoorGap = isBasicLowerDoorGapModuleId(modId);
      const isLowerCategory = moduleData?.category === 'lower';
      const isFullSurroundForDoorDefaults = spaceInfo.surroundType === 'surround'
        && spaceInfo.frameConfig?.top !== false;
      // 카테고리별 글로벌 도어 갭 (공간설정 모달에서 셋팅한 값) — 하부장 3종/상부장/키큰장
      const isUpperCategory = moduleData?.category === 'upper'
        || modId.startsWith('upper-')
        || modId.includes('-upper-')
        || modId.includes('upper-cabinet');
      const catTopGap = isUpperCategory
        ? spaceInfo.doorTopGapUpper
        : isLowerCategory
          ? (isDoorLift ? spaceInfo.doorTopGapLowerDoorLift
            : isTopDown ? spaceInfo.doorTopGapLowerTopDown
              : spaceInfo.doorTopGapLower)
          : spaceInfo.doorTopGapTall;
      const catBottomGap = isUpperCategory
        ? spaceInfo.doorBottomGapUpper
        : isLowerCategory
          ? (isDoorLift ? spaceInfo.doorBottomGapLowerDoorLift
            : isTopDown ? spaceInfo.doorBottomGapLowerTopDown
              : spaceInfo.doorBottomGapLower)
          : spaceInfo.doorBottomGapTall;
      const defaultTopGap = catTopGap ?? (isDoorLift
        ? DOOR_LIFT_DOOR_TOP_GAP_DEFAULT
        : isTopDown
          ? getTopDownDoorTopGap(currentPlacedModule.stoneTopThickness, currentPlacedModule.hasTopEndPanel === true)
          : isBasicLowerDoorGap
            ? BASIC_LOWER_DOOR_TOP_GAP_DEFAULT
            : isLowerCategory
              ? 20
              : (isFullSurroundForDoorDefaults ? -3 : 5));
      const defaultBottomGap = catBottomGap ?? (isTopDown || isDoorLift || isBasicLowerDoorGap
        ? 5
          : isUpperCategory
            ? 28
          : isLowerCategory
          ? 2
          : 25);
      // 개별 가구값이 최우선. 카테고리 글로벌은 개별값이 없을 때의 폴백(defaultTopGap)에만 반영한다.
      // (catTopGap을 개별값보다 우선하면 카테고리 판별이 어긋날 때 키큰장 값으로 되돌아가는 버그)
      const rawTopGap = currentPlacedModule.doorTopGap;
      const staleDoorLiftAutoTopGap = false;
      const topDownNoEpDefaultGap = isTopDown
        ? getTopDownDoorTopGap(currentPlacedModule.stoneTopThickness, false)
        : undefined;
      const legacyTopGapValues = isTopDown
        ? [getTopDownDoorTopGap(currentPlacedModule.stoneTopThickness, currentPlacedModule.hasTopEndPanel === true), topDownNoEpDefaultGap, 5]
        : isDoorLift
          ? [DOOR_LIFT_DOOR_TOP_GAP_DEFAULT, 30, (currentPlacedModule.stoneTopThickness || 0) + 15]
          : isBasicLowerDoorGap
            ? [BASIC_LOWER_DOOR_TOP_GAP_DEFAULT, 5, 20]
            : isLowerCategory
              ? [20, 5]
              : isUpperCategory
                ? [-3, 5]
                : [isFullSurroundForDoorDefaults ? -3 : 5];
      const legacyBottomGapValues = isUpperCategory
        ? [28, 25, 5]
        : isTopDown || isDoorLift
          ? [5]
          : isBasicLowerDoorGap
            ? [5, 25]
            : isLowerCategory
              ? [2, 25]
              : [25];
      const shouldApplyLegacyTopGap =
        typeof rawTopGap === 'number'
        && legacyTopGapValues.includes(rawTopGap)
        && !isUpperCategory
        && !isLowerCategory
        && !isBasicLowerDoorGap
        && !isDoorLift
        && !isTopDown
        && (!isTopDown || rawTopGap === 5);
      const initialTopGap = !isDoorSplitForDoorGaps && !isUpperCategory && isFullSurroundForDoorDefaults && currentPlacedModule.hasTopFrame !== false && rawTopGap === 5
        ? -3
          : shouldApplyLegacyTopGap
            ? defaultTopGap
          : staleDoorLiftAutoTopGap
            ? defaultTopGap
          : (rawTopGap ?? defaultTopGap);
      const rawBotGap = currentPlacedModule.doorBottomGap;
      const shouldApplyLegacyBottomGap =
        typeof rawBotGap === 'number'
        && legacyBottomGapValues.includes(rawBotGap)
        && !isUpperCategory
        && !isLowerCategory
        && !isBasicLowerDoorGap
        && !isDoorLift
        && !isTopDown;
      const initialBottomGap = shouldApplyLegacyBottomGap
        ? defaultBottomGap
        : (rawBotGap ?? defaultBottomGap);
      // State 업데이트
      const needsUpdate = doorTopGap !== initialTopGap || doorBottomGap !== initialBottomGap;

      if (doorTopGap !== initialTopGap) {
        setDoorTopGap(initialTopGap);
        setDoorTopGapInput(initialTopGap.toString());
        setOriginalDoorTopGap(initialTopGap);
      }
      if (doorBottomGap !== initialBottomGap) {
        setDoorBottomGap(initialBottomGap);
        setDoorBottomGapInput(initialBottomGap.toString());
        setOriginalDoorBottomGap(initialBottomGap);
      }

      // 바닥배치인데 doorTopGap이나 doorBottomGap이 기본값이 아니면 업데이트
      if (needsUpdate && (currentPlacedModule.doorTopGap !== initialTopGap || currentPlacedModule.doorBottomGap !== initialBottomGap)) {
        updatePlacedModule(currentPlacedModule.id, {
          doorTopGap: initialTopGap,
          doorBottomGap: initialBottomGap
        });
      }

      // 인조대리석 상판 앞 오프셋 자동 보정: 상판 설치 상태에서 frontOffset 미설정 시 기본값 적용
      const stoneT = currentPlacedModule.stoneTopThickness || 0;
      const stoneFO = currentPlacedModule.stoneTopFrontOffset;
      if (stoneT > 0 && isDoorLift && stoneFO !== 0) {
        updatePlacedModule(currentPlacedModule.id, { stoneTopFrontOffset: 0 });
      }
      if (stoneT > 0 && (stoneFO === undefined || stoneFO === 0)) {
        const defaultFO = isTopDown
          ? (stoneT === 30 ? 33 : 23)
          : isDoorLift ? 0 : 23;
        if (defaultFO > 0) {
          updatePlacedModule(currentPlacedModule.id, { stoneTopFrontOffset: defaultFO });
        }
      }

      if (
        currentPlacedModule.hasTopEndPanel === true
        && isBasicLowerDoorGap
        && (currentPlacedModule as any).topEndPanelOffset !== (initialTopGap > 0 ? 0 : TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM)
      ) {
        updatePlacedModule(currentPlacedModule.id, {
          topEndPanelOffset: initialTopGap > 0 ? 0 : TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM
        } as any);
      }

      // 분할 모드용 섹션별 이격거리 초기화
      const isPantrySplitForDoorGaps = modId.includes('pantry-cabinet-split');
      const splitLowerTopDefault = isPantrySplitForDoorGaps ? -2 : -40;
      const splitUpperBottomDefault = isPantrySplitForDoorGaps ? -1 : 20;
      const rawSplitLowerTopGap = currentPlacedModule.lowerDoorTopGap;
      const rawSplitUpperBottomGap = currentPlacedModule.upperDoorBottomGap;
      const upperTopGap = currentPlacedModule.upperDoorTopGap
        ?? currentPlacedModule.doorTopGap
        ?? (isPantrySplitForDoorGaps ? (spaceInfo.doorTopGapTall ?? spaceInfo.doorTopGap ?? 0) : 0);
      const upperBottomGap = typeof rawSplitUpperBottomGap === 'number'
        ? (isPantrySplitForDoorGaps
          ? splitUpperBottomDefault
          : (rawSplitUpperBottomGap === -20 ? splitUpperBottomDefault : rawSplitUpperBottomGap))
        : (isDoorSplitForDoorGaps ? splitUpperBottomDefault : 0);
      const lowerTopGap = typeof rawSplitLowerTopGap === 'number'
        ? (isPantrySplitForDoorGaps
          ? splitLowerTopDefault
          : (rawSplitLowerTopGap === 40 ? splitLowerTopDefault : rawSplitLowerTopGap))
        : (isDoorSplitForDoorGaps ? splitLowerTopDefault : 0);
      const lowerBottomGap = currentPlacedModule.lowerDoorBottomGap
        ?? currentPlacedModule.doorBottomGap
        ?? (isPantrySplitForDoorGaps ? (spaceInfo.doorBottomGapTall ?? spaceInfo.doorBottomGap ?? 0) : 0);

      setUpperDoorTopGap(upperTopGap);
      setUpperDoorTopGapInput(upperTopGap.toString());
      setOriginalUpperDoorTopGap(upperTopGap); // 원래 값 저장

      setUpperDoorBottomGap(upperBottomGap);
      setUpperDoorBottomGapInput(upperBottomGap.toString());
      setOriginalUpperDoorBottomGap(upperBottomGap); // 원래 값 저장

      setLowerDoorTopGap(lowerTopGap);
      setLowerDoorTopGapInput(lowerTopGap.toString());
      setOriginalLowerDoorTopGap(lowerTopGap); // 원래 값 저장

      setLowerDoorBottomGap(lowerBottomGap);
      setLowerDoorBottomGapInput(lowerBottomGap.toString());
      setOriginalLowerDoorBottomGap(lowerBottomGap); // 원래 값 저장

      // 도어 셋팅 (자유배치 모드) 초기화
      const doorSettingModeVal = currentPlacedModule.doorSettingMode ?? 'auto';
      const overlayLeft = currentPlacedModule.doorOverlayLeft ?? 0;
      const overlayRight = currentPlacedModule.doorOverlayRight ?? 0;
      const overlayTop = currentPlacedModule.doorOverlayTop ?? 0;
      const overlayBottom = currentPlacedModule.doorOverlayBottom ?? 0;
      setDoorSettingMode(doorSettingModeVal);
      setDoorOverlayLeft(overlayLeft);
      setDoorOverlayRight(overlayRight);
      setDoorOverlayTop(overlayTop);
      setDoorOverlayBottom(overlayBottom);
      setDoorOverlayLeftInput(overlayLeft.toString());
      setDoorOverlayRightInput(overlayRight.toString());
      setDoorOverlayTopInput(overlayTop.toString());
      setDoorOverlayBottomInput(overlayBottom.toString());
      setOriginalDoorSettingMode(doorSettingModeVal);
      setOriginalDoorOverlayLeft(overlayLeft);
      setOriginalDoorOverlayRight(overlayRight);
      setOriginalDoorOverlayTop(overlayTop);
      setOriginalDoorOverlayBottom(overlayBottom);

      // 2섹션 가구의 섹션 깊이 초기화 (인출장/팬트리장은 N섹션도 포함)
      const sections = currentPlacedModule.customSections || moduleData.modelConfig?.sections || [];
      const isPullOutOrPantryInit = !!(
        currentPlacedModule.moduleId?.includes('pull-out-cabinet') ||
        currentPlacedModule.moduleId?.includes('pantry-cabinet') ||
        (currentPlacedModule.moduleId?.includes('fridge-cabinet') && !currentPlacedModule.moduleId?.includes('built-in-fridge'))
      );
      if (sections.length === 2 || (isPullOutOrPantryInit && sections.length >= 2)) {
        // customDepth/freeDepth 우선 (신발장 380 등), 없으면 모듈 템플릿 깊이
        const defaultDepth = currentPlacedModule.customDepth
          ?? currentPlacedModule.freeDepth
          ?? moduleData.dimensions.depth;

        // 신발장(entryway/shelf) 카테고리 판별 — 옛 데이터에 섹션 깊이가 모듈 기본(600)으로
        // 잘못 저장된 경우가 있어 무효값으로 간주하고 customDepth(380)로 대체
        const isShoeCategory =
          currentPlacedModule.moduleId.includes('-entryway-') ||
          currentPlacedModule.moduleId.includes('-shelf-') ||
          currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
          currentPlacedModule.moduleId.includes('-2drawer-shelf-');
        const modDimDepth = moduleData.dimensions.depth;
        const hasCustomDepth = typeof currentPlacedModule.customDepth === 'number' && currentPlacedModule.customDepth > 0;
        const resolveStored = (v: number | undefined): number | undefined => {
          if (v === undefined) return undefined;
          if (hasCustomDepth && Math.abs(v - modDimDepth) < 0.5 && Math.abs(currentPlacedModule.customDepth! - modDimDepth) >= 0.5) return undefined; // stale 값 무시
          return v;
        };

        // 저장된 섹션 깊이가 있으면 그대로 존중 (상/하 동기화 금지)
        // 없을 때만 defaultDepth로 초기화
        const storedLower = resolveStored(currentPlacedModule.lowerSectionDepth);
        const storedUpper = resolveStored(currentPlacedModule.upperSectionDepth);
        const lowerDepth = storedLower ?? defaultDepth;
        const upperDepth = storedUpper ?? defaultDepth;

        // 인출장/팬트리장은 sectionDepths 배열 사용 — lowerSectionDepth/upperSectionDepth 자동 설정 안 함
        const needsLowerFix = !isPullOutOrPantryInit && (currentPlacedModule.lowerSectionDepth === undefined
          || (hasCustomDepth && Math.abs((currentPlacedModule.lowerSectionDepth ?? 0) - modDimDepth) < 0.5 && Math.abs(currentPlacedModule.customDepth! - modDimDepth) >= 0.5));
        const needsUpperFix = !isPullOutOrPantryInit && (currentPlacedModule.upperSectionDepth === undefined
          || (hasCustomDepth && Math.abs((currentPlacedModule.upperSectionDepth ?? 0) - modDimDepth) < 0.5 && Math.abs(currentPlacedModule.customDepth! - modDimDepth) >= 0.5));
        if (needsLowerFix || needsUpperFix) {
          updatePlacedModule(currentPlacedModule.id, {
            lowerSectionDepth: lowerDepth,
            upperSectionDepth: upperDepth,
            lowerSectionTopOffset: currentPlacedModule.lowerSectionTopOffset ?? moduleDefaultLowerTopOffset
          });
        }

        setLowerSectionDepth(lowerDepth);
        setUpperSectionDepth(upperDepth);
        setLowerDepthInput(lowerDepth.toString());
        setUpperDepthInput(upperDepth.toString());
        setLowerDepthDirection(currentPlacedModule.lowerSectionDepthDirection || 'front');
        setUpperDepthDirection(currentPlacedModule.upperSectionDepthDirection || 'front');
        setOriginalLowerDepthDirection(currentPlacedModule.lowerSectionDepthDirection || 'front');
        setOriginalUpperDepthDirection(currentPlacedModule.upperSectionDepthDirection || 'front');

        // 섹션별 너비 초기화 (기둥 침범 시 adjustedWidth 기준)
        const baseW = currentPlacedModule.adjustedWidth || currentPlacedModule.customWidth || initialWidth;
        const lw = currentPlacedModule.lowerSectionWidth ?? baseW;
        const uw = currentPlacedModule.upperSectionWidth ?? baseW;
        setLowerWidthInput(Math.round(lw).toString());
        setUpperWidthInput(Math.round(uw).toString());
        setLowerWidthDirection(currentPlacedModule.lowerSectionWidthDirection || 'left');
        setUpperWidthDirection(currentPlacedModule.upperSectionWidthDirection || 'left');

        if (currentPlacedModule.lowerSectionTopOffset === undefined) {
          updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: moduleDefaultLowerTopOffset });
        }
      }
      
// console.log('🔧 팝업 초기값 설정:', {
        // moduleId: currentPlacedModule.moduleId,
        // hasCustomDepth: currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null,
        // customDepth: currentPlacedModule.customDepth,
        // defaultDepth: getDefaultDepth(moduleData),
        // finalDepth: initialDepth,
        // hasCustomWidth: currentPlacedModule.customWidth !== undefined && currentPlacedModule.customWidth !== null,
        // customWidth: currentPlacedModule.customWidth,
        // defaultWidth: moduleData.dimensions.width,
        // finalWidth: initialWidth
      // });

      // 선반장 모듈 초기화 (2섹션: 하단/상단 각각, 1섹션: upperShelf만 사용)
      // 기본하부장(lower-half-cabinet) + 도어올림/상판내림 반통/한통도 동일하게 처리
      const isShelfModule = currentPlacedModule.moduleId.includes('-shelf-') ||
        currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
        currentPlacedModule.moduleId.includes('-2drawer-shelf-') ||
        currentPlacedModule.moduleId.includes('-entryway-') ||
        (currentPlacedModule.moduleId.includes('upper-cabinet') && (
          moduleData.modelConfig?.sections?.some((section: SectionConfig) => section.type === 'shelf') ||
          moduleData.modelConfig?.leftSections?.some((section: SectionConfig) => section.type === 'shelf')
        )) ||
        currentPlacedModule.moduleId.includes('lower-half-cabinet') ||
        currentPlacedModule.moduleId.includes('lower-door-lift-half') ||
        currentPlacedModule.moduleId.includes('lower-top-down-half');
      if (isShelfModule) {
        // dual-upper-cabinet-shelf 등은 modelConfig.sections가 없고 leftSections만 있음 → fallback
        const effectiveSections = currentPlacedModule.customSections
          || moduleData.modelConfig?.sections
          || moduleData.modelConfig?.leftSections
          || [];
        const isSingleSec = effectiveSections.length < 2;
        if (isSingleSec) {
          // 1섹션 가구(상부장 3단형 등): 섹션0을 upperShelf 상태에 매핑 (편집 UI에서 단일 에디터로 표시)
          const sec0 = effectiveSections[0];
          if (sec0 && sec0.type === 'shelf') {
            setUpperShelfCount(sec0.count || 0);
            setUpperShelfPositionInputs((sec0.shelfPositions || []).map((p: number) => Math.round(p).toString()));
          } else {
            setUpperShelfCount(0);
            setUpperShelfPositionInputs([]);
          }
          setLowerShelfCount(0);
          setLowerShelfPositionInputs([]);
        } else {
          // 하단(섹션0) shelf
          const sec0 = effectiveSections[0];
          if (sec0 && sec0.type === 'shelf') {
            setLowerShelfCount(sec0.count || 0);
            setLowerShelfPositionInputs((sec0.shelfPositions || []).map((p: number) => Math.round(p).toString()));
          } else {
            setLowerShelfCount(0);
            setLowerShelfPositionInputs([]);
          }
          // 상단(섹션1) shelf
          const sec1 = effectiveSections[1];
          if (sec1 && sec1.type === 'shelf') {
            setUpperShelfCount(sec1.count || 0);
            setUpperShelfPositionInputs((sec1.shelfPositions || []).map((p: number) => Math.round(p).toString()));
          } else {
            setUpperShelfCount(0);
            setUpperShelfPositionInputs([]);
          }
        }
      }
    }
  }, [currentPlacedModule?.id, moduleData?.id, moduleData?.category, placedBodyHeight, currentPlacedModule?.freeHeight, currentPlacedModule?.customHeight, currentPlacedModule?.moduleData?.dimensions?.height, currentPlacedModule?.isFreePlacement, currentPlacedModule?.userResizedHeight, currentPlacedModule?.customDepth, currentPlacedModule?.customWidth, currentPlacedModule?.adjustedWidth, currentPlacedModule?.hasDoor, currentPlacedModule?.doorTopGap, currentPlacedModule?.doorBottomGap, moduleDefaultLowerTopOffset, currentPlacedModule?.customSections, currentPlacedModule?.hasTopFrame, currentPlacedModule?.hasTopEndPanel, currentPlacedModule?.hasBase, currentPlacedModule?.topFrameThickness, currentPlacedModule?.topFrameGap, currentPlacedModule?.baseFrameHeight, currentPlacedModule?.individualFloatHeight, currentPlacedModule?.stoneTopThickness, currentPlacedModule?.lowerSectionDepthDirection, currentPlacedModule?.upperSectionDepthDirection, spaceInfo.height, spaceInfo.frameSize?.top, spaceInfo.baseConfig?.type, spaceInfo.baseConfig?.height, spaceInfo.baseConfig?.floatHeight, spaceInfo.baseConfig?.placementType, spaceInfo.hasFloorFinish, spaceInfo.floorFinish?.height, spaceInfo.droppedCeiling?.enabled, spaceInfo.droppedCeiling?.dropHeight, spaceInfo.stepCeiling?.enabled, spaceInfo.stepCeiling?.dropHeight, spaceInfo.layoutMode, spaceInfo.surroundType, spaceInfo.frameConfig?.top, spaceInfo.doorTopGap, spaceInfo.doorBottomGap, spaceInfo.doorTopGapTall, spaceInfo.doorBottomGapTall, spaceInfo.doorTopGapUpper, spaceInfo.doorBottomGapUpper, spaceInfo.doorTopGapLower, spaceInfo.doorBottomGapLower, spaceInfo.doorTopGapLowerDoorLift, spaceInfo.doorBottomGapLowerDoorLift, spaceInfo.doorTopGapLowerTopDown, spaceInfo.doorBottomGapLowerTopDown]); // 토글 변경 시 흡수된 높이 재계산

  // 도어 상하갭은 바닥/천장 기준 (받침대/띄움 무관)
  // 배치 타입 변경 시 갭값을 자동으로 바꾸지 않음 — 사용자가 도어갭에서 직접 조정

  // ⚠️ CRITICAL: 모든 hooks는 조건부 return 전에 호출되어야 함 (React hooks 규칙)
  // 듀얼 가구 여부 확인 (moduleId 기반)
  const isRightCornerCabinet = !!moduleData?.id.includes('right-corner');
  const isLeftCornerCabinet = !!moduleData?.id.includes('left-corner');
  const isCornerCabinet = isRightCornerCabinet || isLeftCornerCabinet;
  const isDualFurniture = moduleData ? moduleData.id.startsWith('dual-') : false;

  // 싱글 가구 여부 확인 (듀얼이 아닌 경우)
  const isSingleFurniture = !isDualFurniture;

  // 2섹션 가구 여부 확인
  const sections = moduleData?.modelConfig?.sections || [];
  // 인출장(3섹션)/팬트리장(2섹션) 모두 상판 옵셋 입력 필드 노출
  // 인출장/팬트리장/냉장고장: sectionDepths 배열 사용
  const isPullOutOrPantry = !!(
    moduleData?.id?.includes('pull-out-cabinet') ||
    moduleData?.id?.includes('pantry-cabinet') ||
    (moduleData?.id?.includes('fridge-cabinet') && !moduleData?.id?.includes('built-in-fridge')) ||
    // 도어분절 현관장(싱글/듀얼): 하부/상부 섹션 양쪽 편집 가능, 반대 섹션 자동 흡수
    moduleData?.id?.includes('shelf-split')
  );
  const isTwoSectionFurniture = sections.length === 2 || (isPullOutOrPantry && sections.length >= 2);

  const coverDoorBodyWidthMm = currentPlacedModule && moduleData
    ? (
      currentPlacedModule.adjustedWidth
      ?? currentPlacedModule.freeWidth
      ?? currentPlacedModule.slotCustomWidth
      ?? currentPlacedModule.customWidth
      ?? moduleData.dimensions.width
    )
    : 0;
  const autoCoverDoorSlotWidthMm = (() => {
    if (!currentPlacedModule || !moduleData || currentPlacedModule.isFreePlacement) return undefined;
    if (!currentPlacedModule.hasDoor || !slotInfo?.hasColumn) return undefined;
    if (typeof slotInfo.doorWidth === 'number' && slotInfo.doorWidth > 0) {
      return roundMmToTenth(slotInfo.doorWidth + 3);
    }
    return currentPlacedModule.slotCustomWidth ?? currentPlacedModule.customWidth ?? moduleData.dimensions.width;
  })();
  const autoCoverDoorWidthAdjustMm = autoCoverDoorSlotWidthMm && coverDoorBodyWidthMm > 0
    ? Math.max(0, Math.round(((autoCoverDoorSlotWidthMm - 3) - coverDoorBodyWidthMm) * 10) / 10)
    : 0;

  // 도어용 원래 너비 계산. 기둥 커버도어는 렌더링과 동일하게 원 슬롯폭을 도어 기준으로 쓴다.
  const doorOriginalWidth = autoCoverDoorSlotWidthMm
    ?? currentPlacedModule?.slotCustomWidth
    ?? currentPlacedModule?.customWidth
    ?? moduleData?.dimensions.width;

  // 프레임 높이 계산 (상단몰딩, 걸래받이)
  const topFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
  // 개별 가구 baseFrameHeight 우선 → 글로벌 spaceInfo 폴백 (FurnitureItem.tsx와 동일 우선순위)
  const globalBaseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);
  const baseFrameHeightMm = currentPlacedModule?.baseFrameHeight ?? globalBaseFrameHeightMm;
  const baseFrameGapMm = Math.max(0, Math.min(baseFrameHeightMm, currentPlacedModule?.baseFrameGap ?? 0));
  const panelTopFrameHeightMm = currentPlacedModule?.topFrameThickness ?? topFrameHeightMm;
  const topFrameGapMm = Math.max(0, Math.min(panelTopFrameHeightMm, currentPlacedModule?.topFrameGap ?? 0));
  // 받침대 높이는 바닥마감재와 무관하게 원래 값 사용
  const floorFinishH = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 15) : 0;
  const visualBaseFrameHeightMm = baseFrameHeightMm;
  // 사용자가 명시한 값(0 포함, undefined가 아니면)을 우선 사용. undefined일 때만 default.
  const endPanelTopOffsetForPanels = currentPlacedModule?.endPanelTopOffset !== undefined
    ? (currentPlacedModule.endPanelTopOffset as number)
    : (currentPlacedModule?.hasTopFrame === false ? 0 : (currentPlacedModule?.topFrameThickness ?? topFrameHeightMm));
  const endPanelBottomOffsetForPanels = currentPlacedModule?.endPanelBottomOffset !== undefined
    ? (currentPlacedModule.endPanelBottomOffset as number)
    : (currentPlacedModule?.hasBase === false ? 0 : visualBaseFrameHeightMm);

  // 패널 상세정보 계산 (hasDoor 변경 시 자동 재계산)
  // moduleData는 zone 반영된 effectiveSpaceInfo로 getModuleById 조회되므로
  // dimensions.height에 이미 단내림이 반영됨 → freeHeight 추가 보정 불필요
  // EP ㄷ자 프레임: 인접 가구 판단 (측판 생략 여부)
  const { leftEpAdjacent, rightEpAdjacent } = React.useMemo(() => {
    if (!currentPlacedModule) return { leftEpAdjacent: false, rightEpAdjacent: false };
    const mySlot = currentPlacedModule.slotIndex;
    const myZone = currentPlacedModule.zone || 'normal';
    const isDual = currentPlacedModule.isDualSlot;
    if (mySlot === undefined || currentPlacedModule.isFreePlacement) return { leftEpAdjacent: false, rightEpAdjacent: false };
    const leftAdj = placedModules.some(m =>
      m.id !== currentPlacedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
      m.slotIndex !== undefined && (m.slotIndex === mySlot - 1 || (m.isDualSlot && m.slotIndex === mySlot - 2))
    );
    const rightEnd = isDual ? mySlot + 1 : mySlot;
    const rightAdj = placedModules.some(m =>
      m.id !== currentPlacedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
      m.slotIndex !== undefined && (m.slotIndex === rightEnd + 1 || (m.isDualSlot && m.slotIndex === rightEnd + 1))
    );
    return { leftEpAdjacent: leftAdj, rightEpAdjacent: rightAdj };
  }, [currentPlacedModule, placedModules]);

  // 개별 baseFrameHeight가 글로벌과 다르면 가구 높이 보정
  // moduleData.dimensions.height는 글로벌 baseFrame 기준이므로, 차이만큼 가구 높이에 반영
  const baseFrameDelta = globalBaseFrameHeightMm - baseFrameHeightMm; // 글로벌65 - 개별60 = +5mm
  const adjustedFreeHeight = (() => {
    const base = currentPlacedModule ? placedBodyHeight : undefined;
    if (baseFrameDelta !== 0) {
      // freeHeight가 있으면 delta 보정, 없으면 moduleData 높이 + delta
      return (base || moduleData?.dimensions.height || 0) + baseFrameDelta;
    }
    return base;
  })();

  const renderedPanelDimensionsRevision = React.useSyncExternalStore(
    subscribeRenderedPanelDimensions,
    getRenderedPanelDimensionsSnapshot,
    getRenderedPanelDimensionsSnapshot
  );

  // 뷰어(DoorModule)가 publish한 경첩 지오메트리 변경 시 리렌더 (뷰어-우측바 경첩 간격 동기화)
  const doorHingeGeometryRevision = React.useSyncExternalStore(
    subscribeDoorHingeGeometry,
    getDoorHingeGeometrySnapshot,
    getDoorHingeGeometrySnapshot
  );
  void doorHingeGeometryRevision;

  const panelDetails = React.useMemo(() => {
    if (!moduleData) return [];
    const renderedWidthForPanels =
      currentPlacedModule?.isFreePlacement && currentPlacedModule?.freeWidth
        ? currentPlacedModule.freeWidth
        : (currentPlacedModule?.placementWall === 'left' || currentPlacedModule?.placementWall === 'right') &&
          typeof (currentPlacedModule as any)?.sideLogicalWidth === 'number'
          ? (currentPlacedModule as any).sideLogicalWidth
          : currentPlacedModule?.adjustedWidth
            ?? currentPlacedModule?.slotCustomWidth
            ?? currentPlacedModule?.customWidth
            ?? customWidth;
    const renderedDepthForPanels =
      currentPlacedModule?.isFreePlacement && currentPlacedModule?.freeDepth
        ? currentPlacedModule.freeDepth
        : typeof currentPlacedModule?.customDepth === 'number' && currentPlacedModule.customDepth > 0
          ? currentPlacedModule.customDepth
          : getDefaultDepth(moduleData);
    const renderedHasDoor = currentPlacedModule?.hasDoor ?? hasDoor;
    const doorOuterOpenSides = resolveDoorOuterOpenSides({
      spaceInfo,
      placedModule: currentPlacedModule,
      moduleWidthMm: doorOriginalWidth ?? renderedWidthForPanels
    });
    const rawDoorWidthAdjustEnabled = !!(currentPlacedModule as any)?.doorWidthAdjustEnabled;
    const isCoverDoorWidthAdjustZero = autoCoverDoorSlotWidthMm !== undefined
      && (currentPlacedModule as any)?.doorWidthAdjustMm === 0;
    const autoCoverDoorMatchesManual = autoCoverDoorSlotWidthMm !== undefined
      && Math.round((((currentPlacedModule as any)?.doorWidthAdjustMm ?? autoCoverDoorWidthAdjustMm) - autoCoverDoorWidthAdjustMm) * 10) === 0;
    const panelDoorOriginalWidth = isCoverDoorWidthAdjustZero
      ? undefined
      : autoCoverDoorSlotWidthMm !== undefined && autoCoverDoorMatchesManual
      ? autoCoverDoorSlotWidthMm
      : autoCoverDoorWidthAdjustMm > 0 && rawDoorWidthAdjustEnabled
      ? undefined
      : doorOriginalWidth;
    const panelDoorWidthAdjustEnabled = isCoverDoorWidthAdjustZero || (autoCoverDoorSlotWidthMm !== undefined && autoCoverDoorMatchesManual)
      ? false
      : rawDoorWidthAdjustEnabled;
    const calculatedPanels = calculatePanelDetails(
      moduleData, renderedWidthForPanels, renderedDepthForPanels, renderedHasDoor, t, panelDoorOriginalWidth,
      currentPlacedModule?.hingePosition, currentPlacedModule?.hingeType, undefined, currentPlacedModule?.doorTopGap, currentPlacedModule?.doorBottomGap, undefined,
      backPanelThicknessValue, currentPlacedModule?.customConfig,
      currentPlacedModule?.hasLeftEndPanel, currentPlacedModule?.hasRightEndPanel,
      currentPlacedModule?.endPanelThickness, adjustedFreeHeight,
      panelTopFrameHeightMm, visualBaseFrameHeightMm,
      currentPlacedModule?.hasTopFrame, currentPlacedModule?.hasBase,
      currentPlacedModule?.isDualSlot,
      leftEpAdjacent, rightEpAdjacent,
      currentPlacedModule?.topPanelNotchSize, currentPlacedModule?.topPanelNotchSide,
      // 인조대리석 상판설치
      currentPlacedModule?.stoneTopThickness,
      currentPlacedModule?.stoneTopFrontOffset,
      currentPlacedModule?.stoneTopBackOffset,
      currentPlacedModule?.stoneTopLeftOffset,
      currentPlacedModule?.stoneTopRightOffset,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      endPanelTopOffsetForPanels,
      endPanelBottomOffsetForPanels,
      currentPlacedModule?.customMaidaHeights,
      currentPlacedModule?.hingePositionsMm,
      currentPlacedModule?.upperDoorHingePositionsMm,
      currentPlacedModule?.lowerDoorHingePositionsMm,
      currentPlacedModule?.customSections,
      doorOuterOpenSides,
      {
        upperDoorTopGap: currentPlacedModule?.upperDoorTopGap,
        upperDoorBottomGap: currentPlacedModule?.upperDoorBottomGap,
        lowerDoorTopGap: currentPlacedModule?.lowerDoorTopGap,
        lowerDoorBottomGap: currentPlacedModule?.lowerDoorBottomGap
      },
      currentPlacedModule?.lowerSectionTopOffset,
      !!(currentPlacedModule as any)?.maidaWidthAdjustEnabled,
      (currentPlacedModule as any)?.maidaWidthAdjustMm ?? -1.5,
      currentPlacedModule?.leftEndPanelOffset ?? 0,
      currentPlacedModule?.rightEndPanelOffset ?? 0,
      panelDoorWidthAdjustEnabled,
      (currentPlacedModule as any)?.doorWidthAdjustMm ?? -1.5,
      baseFrameGapMm,
      topFrameGapMm,
      !!(currentPlacedModule as any)?.topFrameWidthAdjustEnabled,
      (currentPlacedModule as any)?.topFrameLeftAdjustMm ?? 0,
      (currentPlacedModule as any)?.topFrameRightAdjustMm ?? 0,
      !!(currentPlacedModule as any)?.baseFrameWidthAdjustEnabled,
      (currentPlacedModule as any)?.baseFrameLeftAdjustMm ?? 0,
      (currentPlacedModule as any)?.baseFrameRightAdjustMm ?? 0,
      currentPlacedModule?.hasTopEndPanel === true,
      (currentPlacedModule as any)?.topEndPanelBackLip ?? 0,
      (currentPlacedModule as any)?.topEndPanelBackLipThickness ?? 0,
      (currentPlacedModule as any)?.topEndPanelOffset,
      (currentPlacedModule as any)?.topEndPanelBackOffset,
      true,
      (currentPlacedModule as any)?.customMaidaHeightsMode,
      currentPlacedModule?.leftEndPanelBackOffset ?? 0,
      currentPlacedModule?.rightEndPanelBackOffset ?? 0,
      (currentPlacedModule as any)?.endPanelDepth
    );
    return calculatedPanels.flatMap(panel => applyRenderedPanelDimensions(
      applyFramePanelListWidthFallback(panel, currentPlacedModule, renderedWidthForPanels, spaceInfo),
      currentPlacedModule?.id
    ));
  }, [moduleData, customWidth, customDepth, hasDoor, t, doorOriginalWidth, autoCoverDoorWidthAdjustMm, backPanelThicknessValue, currentPlacedModule, spaceInfo, currentPlacedModule?.customConfig, currentPlacedModule?.hasLeftEndPanel, currentPlacedModule?.hasRightEndPanel, currentPlacedModule?.endPanelThickness, adjustedFreeHeight, panelTopFrameHeightMm, visualBaseFrameHeightMm, baseFrameGapMm, topFrameGapMm, currentPlacedModule?.hasTopFrame, currentPlacedModule?.hasBase, currentPlacedModule?.topFrameThickness, currentPlacedModule?.topFrameGap, currentPlacedModule?.endPanelTopOffset, currentPlacedModule?.endPanelBottomOffset, currentPlacedModule?.leftEndPanelOffset, currentPlacedModule?.rightEndPanelOffset, currentPlacedModule?.isDualSlot, leftEpAdjacent, rightEpAdjacent, currentPlacedModule?.topPanelNotchSize, currentPlacedModule?.topPanelNotchSide, currentPlacedModule?.stoneTopThickness, currentPlacedModule?.stoneTopFrontOffset, currentPlacedModule?.stoneTopBackOffset, currentPlacedModule?.stoneTopLeftOffset, currentPlacedModule?.stoneTopRightOffset, currentPlacedModule?.doorTopGap, currentPlacedModule?.doorBottomGap, currentPlacedModule?.upperDoorTopGap, currentPlacedModule?.upperDoorBottomGap, currentPlacedModule?.lowerDoorTopGap, currentPlacedModule?.lowerDoorBottomGap, currentPlacedModule?.hingePositionsMm, currentPlacedModule?.upperDoorHingePositionsMm, currentPlacedModule?.lowerDoorHingePositionsMm, currentPlacedModule?.customSections, currentPlacedModule?.lowerSectionTopOffset, currentPlacedModule?.maidaWidthAdjustEnabled, currentPlacedModule?.maidaWidthAdjustMm, currentPlacedModule?.doorWidthAdjustEnabled, currentPlacedModule?.doorWidthAdjustMm, currentPlacedModule?.topFrameWidthAdjustEnabled, currentPlacedModule?.topFrameLeftAdjustMm, currentPlacedModule?.topFrameRightAdjustMm, currentPlacedModule?.baseFrameWidthAdjustEnabled, currentPlacedModule?.baseFrameLeftAdjustMm, currentPlacedModule?.baseFrameRightAdjustMm, currentPlacedModule?.hasTopEndPanel, (currentPlacedModule as any)?.topEndPanelBackLip, (currentPlacedModule as any)?.topEndPanelBackLipThickness, (currentPlacedModule as any)?.topEndPanelOffset, (currentPlacedModule as any)?.topEndPanelBackOffset, endPanelTopOffsetForPanels, endPanelBottomOffsetForPanels, currentPlacedModule?.customMaidaHeights, (currentPlacedModule as any)?.customMaidaHeightsMode, currentPlacedModule?.freeWidth, currentPlacedModule?.freeDepth, currentPlacedModule?.slotCustomWidth, (currentPlacedModule as any)?.sideLogicalWidth, currentPlacedModule?.placementWall, renderedPanelDimensionsRevision]);

  // 서라운드 패널 계산 — 맨 좌측 가구에 좌측 서라운드, 맨 우측 가구에 우측 서라운드 귀속
  const surroundPanels = React.useMemo(() => {
    if (currentPlacedModule && spaceInfo.surroundType === 'surround') {
      const renderedPanels = calculateRenderedSurroundPanelsForModule(currentPlacedModule, placedModules, spaceInfo);
      return renderedPanels.length > 0 ? [{ name: '=== 서라운드 ===' }, ...renderedPanels] : [];
    }

    if (!spaceInfo.freeSurround || !currentPlacedModule) return [];
    // 서라운드 높이 = 공간높이 - 바닥마감재 - 띄움높이
    const spaceH = spaceInfo.height || 2400;
    const floatH = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
      ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
    const surroundH = spaceH - floorFinishH - floatH;
    const allSurroundPanels = calculateSurroundPanels(spaceInfo.freeSurround, surroundH, spaceInfo.panelThickness ?? 18);
    if (allSurroundPanels.length === 0) return [];

    // 맨 좌측/우측 가구 판별
    let minSlot = Infinity, maxSlot = -Infinity;
    placedModules.forEach((pm, idx) => {
      const slot = pm.slotIndex ?? idx;
      if (slot < minSlot) minSlot = slot;
      if (slot > maxSlot) maxSlot = slot;
    });
    const currentSlot = currentPlacedModule.slotIndex ?? placedModules.indexOf(currentPlacedModule);
    const isLeftMost = currentSlot === minSlot;
    const isRightMost = currentSlot === maxSlot;

    // 현재 가구에 해당하는 서라운드만 필터
    const filtered = allSurroundPanels.filter((p: any) => {
      const isLeft = p.name.includes('좌측');
      const isRight = p.name.includes('우측');
      const isMiddle = !isLeft && !isRight; // 중간 서라운드
      if (isLeft) return isLeftMost;
      if (isRight) return isRightMost;
      return isMiddle; // 중간 서라운드는 모든 가구에 표시하지 않음 (별도)
    });
    // 중간 서라운드는 어떤 가구에도 표시하지 않음
    const finalFiltered = filtered.filter((p: any) => p.name.includes('좌측') || p.name.includes('우측'));

    if (finalFiltered.length === 0) return [];
    return [{ name: '=== 서라운드 ===' }, ...finalFiltered];
  }, [spaceInfo, floorFinishH, currentPlacedModule, placedModules]);

  // panelDetails + surroundPanels 합산
  const allPanelDetails = React.useMemo(() => {
    return [...panelDetails, ...surroundPanels];
  }, [panelDetails, surroundPanels]);

  // 디버깅용 로그 (개발 모드에서만 출력)
  if (import.meta.env.DEV) {
// console.log(`🔍 [가구 타입 확인] ${moduleData?.id}: 듀얼=${isDualFurniture}, 싱글=${isSingleFurniture}, 커버도어=${isCoverDoor}`);
// console.log(`🚪 [도어 경첩 표시 조건] hasDoor=${hasDoor}, isSingleFurniture=${isSingleFurniture}, 표시여부=${hasDoor && isSingleFurniture}`);
// console.log(`📐 [섹션 정보] sections.length=${sections.length}, isTwoSectionFurniture=${isTwoSectionFurniture}, showDetails=${showDetails}, sections=`, sections);
// console.log(`🎯 [섹션 깊이 UI 표시 조건] !showDetails=${!showDetails}, isTwoSectionFurniture=${isTwoSectionFurniture}, 표시여부=${!showDetails && isTwoSectionFurniture}`);
// console.log(`🔧 [도어 분할 UI 표시 조건] !showDetails=${!showDetails}, moduleData.hasDoor=${moduleData?.hasDoor}, hasDoor=${hasDoor}, isTwoSectionFurniture=${isTwoSectionFurniture}, 최종표시=${!showDetails && moduleData?.hasDoor && hasDoor && isTwoSectionFurniture}`);
// console.log(`📋 [전체 modelConfig]`, moduleData?.modelConfig);
  }

  // 가구 편집 팝업이 활성화되지 않았으면 렌더링하지 않음
  if (activePopup.type !== 'furnitureEdit' || !activePopup.id) {
// console.log('📝 PlacedModulePropertiesPanel 렌더링 안 함:', {
      // type: activePopup.type,
      // id: activePopup.id
    // });
    return null;
  }

// console.log('📝 PlacedModulePropertiesPanel 렌더링됨:', {
    // type: activePopup.type,
    // id: activePopup.id
  // });

  // ── 서라운드 패널 전용 속성 패널 ──
  if (currentPlacedModule?.isSurroundPanel) {
    const panelTypeLabel = currentPlacedModule.surroundPanelType === 'left' ? '좌측 패널'
      : currentPlacedModule.surroundPanelType === 'right' ? '우측 패널' : '상단 패널';
    const currentWidth = currentPlacedModule.surroundPanelWidth || 40;
    const isTopPanel = currentPlacedModule.surroundPanelType === 'top';
    const widthMin = 18;
    const widthMax = isTopPanel ? 100 : 200;

    const handleSurroundWidthChange = (value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      const clamped = Math.max(widthMin, Math.min(widthMax, num));
      updatePlacedModule(currentPlacedModule.id, {
        surroundPanelWidth: clamped,
        ...(isTopPanel ? { freeHeight: PET_PANEL_THICKNESS_MM } : { freeWidth: PET_PANEL_THICKNESS_MM }),
      });
    };

    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.headerTabs}>
              <button className={`${styles.tabButton} ${styles.activeTab}`}>
                서라운드 패널
              </button>
            </div>
            <button className={styles.closeButton} onClick={() => closeAllPopups()} aria-label="닫기"></button>
          </div>
          <div className={styles.content}>
            <div className={styles.moduleInfo}>
              <div className={styles.moduleDetails}>
                <h4 className={styles.moduleName}>{panelTypeLabel}</h4>
                <div className={styles.property}>
                  <span className={styles.propertyValue}>
                    두께: 18.5mm (고정) / 폭: {currentWidth}mm
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.propertySection}>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>패널 폭 (mm)</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentWidth}
                    min={widthMin}
                    max={widthMax}
                    onChange={(e) => handleSurroundWidthChange(e.target.value)}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>두께</span>
                <span className={styles.propertyValue}>18.5mm (고정)</span>
              </div>
            </div>

            {/* 서라운드 옵셋 설정 */}
            <div className={styles.propertySection}>
              <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>옵셋 조정</h5>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>좌 ←</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetLeft ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetLeft: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>우 →</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetRight ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetRight: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>상 ↑</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetTop ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetTop: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>하 ↓</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetBottom ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetBottom: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>깊이</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetDepth ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetDepth: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 0', borderTop: '1px solid var(--theme-border, #eee)' }}>
              <button
                className={`${styles.deleteButton}`}
                onClick={() => {
                  if (activePopup.id) {
                    removeModule(activePopup.id);
                    closeAllPopups();
                  }
                }}
                style={{ width: '100%' }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 모듈 데이터가 없으면 렌더링하지 않음
  if (!currentPlacedModule || !moduleData) {
    return null;
  }

  const handleClose = () => {
    // 패널 강조 해제
    setHighlightedPanel(null);
    setSelectedPanelIndex(null);
    closeAllPopups();
  };

  const handleCancel = () => {
    // 패널 강조 해제
    setHighlightedPanel(null);
    setSelectedPanelIndex(null);

    // 취소 시 모든 값을 원래 값으로 복원
    if (currentPlacedModule) {
      updatePlacedModule(currentPlacedModule.id, {
        customDepth: originalCustomDepth,
        customWidth: originalCustomWidth,
        lowerSectionDepth: originalLowerSectionDepth,
        upperSectionDepth: originalUpperSectionDepth,
        lowerSectionDepthDirection: originalLowerDepthDirection,
        upperSectionDepthDirection: originalUpperDepthDirection,
        hingePosition: originalHingePosition,
        hasDoor: originalHasDoor,
        doorSplit: originalDoorSplit,
        hasGapBackPanel: originalHasGapBackPanel,
        backPanelThickness: originalBackPanelThickness,
        doorTopGap: originalDoorTopGap,
        doorBottomGap: originalDoorBottomGap,
        upperDoorTopGap: originalUpperDoorTopGap,
        upperDoorBottomGap: originalUpperDoorBottomGap,
        lowerDoorTopGap: originalLowerDoorTopGap,
        lowerDoorBottomGap: originalLowerDoorBottomGap,
        doorSettingMode: originalDoorSettingMode,
        doorOverlayLeft: originalDoorOverlayLeft,
        doorOverlayRight: originalDoorOverlayRight,
        doorOverlayTop: originalDoorOverlayTop,
        doorOverlayBottom: originalDoorOverlayBottom
      });
    }
    closeAllPopups();
  };

  const handleDeleteClick = () => {
    if (activePopup.id) {
      removeModule(activePopup.id);
      closeAllPopups();
    }
  };

  const getPlacedBodyDepth = (module: any): number => {
    const sectionMaxDepth = Array.isArray(module?.sectionDepths)
      ? Math.max(0, ...module.sectionDepths.filter((depth: number) => typeof depth === 'number' && depth > 0))
      : 0;
    return module?.freeDepth
      ?? module?.customDepth
      ?? module?.lowerSectionDepth
      ?? (sectionMaxDepth > 0 ? sectionMaxDepth : undefined)
      ?? customDepth;
  };

  const getDepthFrontReference = (module: any, fallbackDepth: number): number => {
    if (typeof module?.depthFrontReferenceMm === 'number' && module.depthFrontReferenceMm > 0) {
      return module.depthFrontReferenceMm;
    }
    const storedDepth = getPlacedBodyDepth(module);
    const storedGap = typeof module?.backWallGap === 'number' ? module.backWallGap : 0;
    const categoryDefaultDepth = getCategoryDefaultFurnitureDepth(
      spaceInfo.depth || 600,
      module?.moduleId || currentPlacedModule?.moduleId || moduleData?.id || '',
      spaceInfo.furnitureDepthDefaults
    ) ?? 0;
    const moduleDefaultDepth = moduleData?.defaultDepth
      ?? moduleData?.dimensions?.depth
      ?? 0;
    return Math.max(fallbackDepth, storedDepth + storedGap, categoryDefaultDepth, moduleDefaultDepth);
  };

  // 뒷벽이격(backWallGap): 앞고정일 때 저장된 기준 앞라인 깊이에서 현재 깊이를 뺀 값.
  // 뒷고정 550 상태에서 500으로 줄이면 기준 앞라인은 550으로 저장되고, 앞고정 전환 시 50이 된다.
  const computeLowerBackWallGap = (direction: 'front' | 'back', myDepth: number, referenceDepth?: number): number => {
    if (!currentPlacedModule) return 0;
    if (direction !== 'back') return 0;
    const baselineDepth = referenceDepth ?? getDepthFrontReference(currentPlacedModule, myDepth);
    return Math.max(0, Math.round(baselineDepth - myDepth));
  };

  const buildBodyDepthUpdates = (newDepth: number, includeFreeDepth = false) => {
    if (!currentPlacedModule) return { customDepth: newDepth };

    const updates: Record<string, any> = {
      customDepth: newDepth,
      lowerSectionDepth: newDepth,
      upperSectionDepth: newDepth,
      endPanelDepth: newDepth,
    };

    if (includeFreeDepth || currentPlacedModule.isFreePlacement || currentPlacedModule.freeDepth !== undefined) {
      updates.freeDepth = newDepth;
    }

    if (Array.isArray((currentPlacedModule as any).sectionDepths)) {
      updates.sectionDepths = (currentPlacedModule as any).sectionDepths.map(() => newDepth);
    }
    const latestPlacedModule = useFurnitureStore.getState().placedModules.find(module => module.id === currentPlacedModule.id);
    const nextLowerDepthDirection = latestPlacedModule?.lowerSectionDepthDirection
      ?? currentPlacedModule.lowerSectionDepthDirection
      ?? lowerDepthDirection
      ?? 'front';
    const nextUpperDepthDirection = latestPlacedModule?.upperSectionDepthDirection
      ?? currentPlacedModule.upperSectionDepthDirection
      ?? upperDepthDirection
      ?? nextLowerDepthDirection;
    updates.lowerSectionDepthDirection = nextLowerDepthDirection;
    updates.upperSectionDepthDirection = nextUpperDepthDirection;
    const previousDepth = getPlacedBodyDepth(latestPlacedModule ?? currentPlacedModule);
    const previousReference = getDepthFrontReference(latestPlacedModule ?? currentPlacedModule, previousDepth);
    const nextReference = nextLowerDepthDirection === 'front'
      ? previousDepth
      : previousReference;
    updates.depthFrontReferenceMm = Math.max(newDepth, Math.round(nextReference));

    const currentModuleCategory = moduleData?.category ?? getPlacedModuleCategoryForPanels(currentPlacedModule);
    const isCurrentUpperModule = currentModuleCategory === 'upper';

    // backWallGap은 하부장 앞라인 정렬용 값이다.
    // 상부장에 이 값이 들어가면 하부장 최대 깊이에 영향을 받아 뒷고정 위치가 틀어진다.
    updates.backWallGap = isCurrentUpperModule ? 0 : computeLowerBackWallGap(nextLowerDepthDirection, newDepth, updates.depthFrontReferenceMm);

    if (Array.isArray((currentPlacedModule as any).sectionDepthDirections)) {
      const latestSectionDepthDirections = Array.isArray((latestPlacedModule as any)?.sectionDepthDirections)
        ? (latestPlacedModule as any).sectionDepthDirections as ('front' | 'back')[]
        : undefined;
      updates.sectionDepthDirections = ((currentPlacedModule as any).sectionDepthDirections as ('front' | 'back')[]).map((direction, index, directions) => (
        latestSectionDepthDirections?.[index]
        ?? direction
        ?? (index === directions.length - 1 ? nextUpperDepthDirection : nextLowerDepthDirection)
      ));
    }

    if (currentPlacedModule.customConfig) {
      const newSections = currentPlacedModule.customConfig.sections.map((sec: any) => {
        if (!sec.horizontalSplit) return sec;
        const hs = { ...sec.horizontalSplit };
        if (hs.leftDepth !== undefined) hs.leftDepth = newDepth;
        if (hs.rightDepth !== undefined) hs.rightDepth = newDepth;
        if (hs.centerDepth !== undefined) hs.centerDepth = newDepth;
        return { ...sec, horizontalSplit: hs };
      });
      updates.customConfig = { ...currentPlacedModule.customConfig, sections: newSections };
    }

    return updates;
  };

  const syncBodyDepthLocalState = (newDepth: number) => {
    const depthText = newDepth.toString();
    setCustomDepth(newDepth);
    setFreeDepthInput(depthText);
    setDepthInputValue(depthText);
    setLowerSectionDepth(newDepth);
    setUpperSectionDepth(newDepth);
    setLowerDepthInput(depthText);
    setUpperDepthInput(depthText);
    setSectionDepthInputs(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      return keys.reduce<Record<number, string>>((acc, key) => {
        acc[Number(key)] = depthText;
        return acc;
      }, {});
    });
    setHsLeftDepthInput(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      return keys.reduce<Record<number, string>>((acc, key) => {
        acc[Number(key)] = depthText;
        return acc;
      }, {});
    });
    setHsRightDepthInput(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      return keys.reduce<Record<number, string>>((acc, key) => {
        acc[Number(key)] = depthText;
        return acc;
      }, {});
    });
    setHsCenterDepthInput(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      return keys.reduce<Record<number, string>>((acc, key) => {
        acc[Number(key)] = depthText;
        return acc;
      }, {});
    });
  };

  // 어떤 가구든 배치/깊이변경이 일어나면, 현재 배치된 "모든 하부 가구"의 backWallGap을
  // 가장 깊은 하부 가구 기준으로 다시 계산해 일괄 갱신한다(항상 앞라인 정렬, 라이브 추종).
  // editedId/editedDepth: 방금 깊이를 바꾼 가구(아직 store 반영 전일 수 있어 직접 주입).
  const refreshLowerFrontFixedGaps = (editedId?: string, editedDepth?: number, editedUpdates?: Record<string, any>) => {
    const latest = useFurnitureStore.getState().placedModules;
    // 방금 바꾼 가구의 깊이를 즉시 반영(아직 store에 안 들어왔을 수 있음)
    const effective = (editedId && typeof editedDepth === 'number')
      ? latest.map(m => m.id === editedId
          ? { ...m, ...editedUpdates, customDepth: editedDepth, lowerSectionDepth: editedDepth, freeDepth: editedDepth }
          : m)
      : latest;
    const changes = computeLowerFrontAlignedGaps(effective, spaceInfo);
    changes.forEach(({ id, backWallGap }) => updatePlacedModule(id, { backWallGap }));
  };

  const applyBodyDepthChange = (newDepth: number, includeFreeDepth = false) => {
    syncBodyDepthLocalState(newDepth);
    if (activePopup.id) {
      const updates = buildBodyDepthUpdates(newDepth, includeFreeDepth);
      updatePlacedModule(activePopup.id, updates);
      // 내 깊이 변경이 다른 앞고정 하부 가구 앞라인 기준을 바꿀 수 있으므로 일괄 갱신
      refreshLowerFrontFixedGaps(activePopup.id, newDepth, updates);
    }
  };

  const handleCustomDepthChange = (newDepth: number) => {
    applyBodyDepthChange(newDepth);
  };

  const handleCustomWidthChange = (newWidth: number) => {
    setCustomWidth(newWidth);
    if (activePopup.id) {
      // 기존 customDepth 유지
      const updateData: any = {
        customWidth: newWidth,
        isSplit: true // 너비가 조정되면 분할 상태로 표시
      };

      // 기존 customDepth가 있으면 유지
      if (currentPlacedModule.customDepth !== undefined) {
        updateData.customDepth = currentPlacedModule.customDepth;
      }

      // 자유배치 가구는 freeWidth/moduleWidth도 함께 갱신하고 userResizedWidth 표시
      // (화살표 이동 시 원래 폭으로 되돌아가는 문제 방지)
      if (currentPlacedModule.isFreePlacement) {
        updateData.freeWidth = newWidth;
        updateData.moduleWidth = newWidth;
        updateData.userResizedWidth = true;
      }

      updatePlacedModule(activePopup.id, updateData);
      
// console.log('📏 가구 너비 조정:', {
        // originalWidth: moduleData.dimensions.width,
        // newWidth,
        // columnPosition: slotInfo?.column?.position,
        // customDepth: currentPlacedModule.customDepth
      // });
    }
  };

  const applyLowerCabinetDepth = (nextDepth: number) => {
    if (!currentPlacedModule) return;

    applyBodyDepthChange(nextDepth, true);
  };

  const applyLowerCabinetDepthDirection = (direction: 'front' | 'back') => {
    if (!currentPlacedModule) return;

    const latestPlacedModule = useFurnitureStore.getState().placedModules.find(module => module.id === currentPlacedModule.id);
    const parsedFreeDepthInput = parseInt(freeDepthInput, 10);
    const parsedDepthInput = parseInt(depthInputValue, 10);
    const parsedLowerDepthInput = parseInt(lowerDepthInput, 10);
    const currentBodyDepth = (!Number.isNaN(parsedFreeDepthInput) && parsedFreeDepthInput > 0
      ? parsedFreeDepthInput
      : (!Number.isNaN(parsedDepthInput) && parsedDepthInput > 0
          ? parsedDepthInput
          : (!Number.isNaN(parsedLowerDepthInput) && parsedLowerDepthInput > 0
              ? parsedLowerDepthInput
              : (latestPlacedModule?.freeDepth
                  ?? latestPlacedModule?.customDepth
                  ?? latestPlacedModule?.lowerSectionDepth
                  ?? currentPlacedModule.freeDepth
                  ?? currentPlacedModule.customDepth
                  ?? currentPlacedModule.lowerSectionDepth
                  ?? customDepth))));
    const updates: Record<string, any> = {
      customDepth: currentBodyDepth,
      lowerSectionDepth: currentBodyDepth,
      upperSectionDepth: currentBodyDepth,
      endPanelDepth: currentBodyDepth,
      lowerSectionDepthDirection: direction,
      upperSectionDepthDirection: direction,
    };
    if (currentPlacedModule.isFreePlacement || currentPlacedModule.freeDepth !== undefined) {
      updates.freeDepth = currentBodyDepth;
    }

    const directionReference = direction === 'back'
      ? getDepthFrontReference(latestPlacedModule ?? currentPlacedModule, currentBodyDepth)
      : currentBodyDepth;
    updates.depthFrontReferenceMm = Math.max(currentBodyDepth, Math.round(directionReference));
    updates.backWallGap = computeLowerBackWallGap(direction, currentBodyDepth, updates.depthFrontReferenceMm);
    if (Array.isArray((currentPlacedModule as any).sectionDepthDirections)) {
      updates.sectionDepthDirections = (currentPlacedModule as any).sectionDepthDirections.map(() => direction);
    }

    updatePlacedModule(currentPlacedModule.id, updates);
    // 이 가구의 앞/뒤고정 전환이 다른 앞고정 하부 가구의 기준 깊이를 바꿀 수 있으므로 일괄 갱신
    refreshLowerFrontFixedGaps(currentPlacedModule.id, currentBodyDepth, updates);
    setLowerDepthDirection(direction);
    setUpperDepthDirection(direction);
  };

  // 깊이 입력 필드 처리
  const handleDepthInputChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setDepthInputValue(value);
      setDepthError('');
    }
  };

  const handleDepthInputBlur = () => {
    const value = depthInputValue;
    if (value === '') {
      // 빈 값인 경우 기존 값으로 되돌림
      setDepthInputValue(customDepth.toString());
      return;
    }

    const numValue = parseInt(value);
    const minDepth = FURNITURE_LIMITS.DEPTH.MIN;
    const maxDepth = Math.min(spaceInfo.depth, FURNITURE_LIMITS.DEPTH.MAX);

    // 범위 검증
    if (numValue < minDepth) {
      setDepthError(t('furniture.minValue', { value: minDepth }));
    } else if (numValue > maxDepth) {
      setDepthError(t('furniture.maxValue', { value: maxDepth }));
    } else {
      setDepthError('');
      handleCustomDepthChange(numValue);
    }
  };

  const handleDepthKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDepthInputBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseInt(depthInputValue, 10) || customDepth;
      const minD = FURNITURE_LIMITS.DEPTH.MIN;
      const maxD = Math.min(spaceInfo.depth, FURNITURE_LIMITS.DEPTH.MAX);
      const next = Math.max(minD, Math.min(maxD, cur + (e.key === 'ArrowUp' ? 1 : -1)));
      setDepthInputValue(next.toString());
      setDepthError('');
      handleCustomDepthChange(next);
    }
  };

  // 도어 갭 입력 핸들러
  const getBasicLowerDoorTopGapUpdates = (nextDoorTopGap: number) => {
    if (!currentPlacedModule) return {};
    const isBasicLowerDoorGap = isBasicLowerDoorGapModuleId(currentPlacedModule.moduleId);
    if (!isBasicLowerDoorGap || currentPlacedModule.hasTopEndPanel !== true) {
      return {};
    }
    return { topEndPanelOffset: nextDoorTopGap > 0 ? 0 : TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM };
  };

  const getDoorLiftTopEndPanelOffsetUpdates = (nextTopEndPanelOffset: number) => {
    if (!currentPlacedModule) return {};
    if (!isDoorLiftTopEndPanelModuleId(currentPlacedModule.moduleId)) return {};
    return {
      doorTopGap: nextTopEndPanelOffset > 0
        ? DOOR_LIFT_TOP_EP_COLLISION_GAP
        : (spaceInfo.doorTopGapLowerDoorLift ?? DOOR_LIFT_DOOR_TOP_GAP_DEFAULT),
    };
  };

  const getDoorLiftTouchCustomMaidaBaseUpdates = (): Record<string, any> => {
    if (!currentPlacedModule?.moduleId?.includes('lower-door-lift-touch-')) return {};
    if ((currentPlacedModule as any).customMaidaHeightsMode === 'gapBase') return {};
    const custom = (currentPlacedModule as any).customMaidaHeights;
    if (!Array.isArray(custom) || custom.length < 2 || !custom.every((v: any) => typeof v === 'number' && v > 0)) return {};
    const defaultTopExt = 30;
    const defaultBottomExt = 5;
    const topDelta = (currentPlacedModule.doorTopGap ?? defaultTopExt) - defaultTopExt;
    const bottomDelta = (currentPlacedModule.doorBottomGap ?? defaultBottomExt) - defaultBottomExt;
    const next = [...custom];
    next[0] -= bottomDelta;
    next[next.length - 1] -= topDelta;
    if (!next.every(v => Number.isFinite(v) && v > 0)) return {};
    return {
      customMaidaHeights: next.map(v => Math.round(v)),
      customMaidaHeightsMode: 'gapBase',
    };
  };

  const handleDoorTopGapChange = (value: string) => {
    // 백스페이스 포함 모든 입력 허용
    setDoorTopGapInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
    if (!isNaN(numValue) && currentPlacedModule) {
      setDoorTopGap(numValue);
      updatePlacedModule(currentPlacedModule.id, {
        ...getDoorLiftTouchCustomMaidaBaseUpdates(),
        doorTopGap: numValue,
        ...getBasicLowerDoorTopGapUpdates(numValue),
      });
    }
  };

  const handleDoorBottomGapChange = (value: string) => {
    // 백스페이스 포함 모든 입력 허용
    setDoorBottomGapInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
    if (!isNaN(numValue) && currentPlacedModule) {
      setDoorBottomGap(numValue);
      updatePlacedModule(currentPlacedModule.id, {
        ...getDoorLiftTouchCustomMaidaBaseUpdates(),
        doorBottomGap: numValue
      });
    }
  };

  const handleDoorTopGapBlur = () => {
    const value = parseInt(doorTopGapInput);
    if (!isNaN(value) && currentPlacedModule) {
      setDoorTopGap(value);
      updatePlacedModule(currentPlacedModule.id, {
        ...getDoorLiftTouchCustomMaidaBaseUpdates(),
        doorTopGap: value,
        ...getBasicLowerDoorTopGapUpdates(value),
      });
    } else {
      // 유효하지 않은 값이면 이전 값으로 복원
      setDoorTopGapInput(doorTopGap.toString());
    }
  };

  const handleDoorBottomGapBlur = () => {
    const value = parseInt(doorBottomGapInput);
    if (!isNaN(value) && currentPlacedModule) {
      setDoorBottomGap(value);
      updatePlacedModule(currentPlacedModule.id, {
        ...getDoorLiftTouchCustomMaidaBaseUpdates(),
        doorBottomGap: value
      });
    } else {
      // 유효하지 않은 값이면 이전 값으로 복원
      setDoorBottomGapInput(doorBottomGap.toString());
    }
  };

  const handleDoorTopGapKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const value = parseInt(doorTopGapInput);
      if (!isNaN(value) && currentPlacedModule) {
        setDoorTopGap(value);
        updatePlacedModule(currentPlacedModule.id, {
          ...getDoorLiftTouchCustomMaidaBaseUpdates(),
          doorTopGap: value,
          ...getBasicLowerDoorTopGapUpdates(value),
        });
      }
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentValue = parseInt(doorTopGapInput) || 0;
      const newValue = currentValue + 1;
      setDoorTopGapInput(newValue.toString());
      setDoorTopGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, {
          ...getDoorLiftTouchCustomMaidaBaseUpdates(),
          doorTopGap: newValue,
          ...getBasicLowerDoorTopGapUpdates(newValue),
        });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseInt(doorTopGapInput) || 0;
      const newValue = currentValue - 1;
      setDoorTopGapInput(newValue.toString());
      setDoorTopGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, {
          ...getDoorLiftTouchCustomMaidaBaseUpdates(),
          doorTopGap: newValue,
          ...getBasicLowerDoorTopGapUpdates(newValue),
        });
      }
    }
  };

  const handleDoorBottomGapKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const value = parseInt(doorBottomGapInput);
      if (!isNaN(value) && currentPlacedModule) {
        setDoorBottomGap(value);
        updatePlacedModule(currentPlacedModule.id, {
          ...getDoorLiftTouchCustomMaidaBaseUpdates(),
          doorBottomGap: value
        });
      }
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentValue = parseInt(doorBottomGapInput) || 0;
      const newValue = currentValue + 1;
      setDoorBottomGapInput(newValue.toString());
      setDoorBottomGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, {
          ...getDoorLiftTouchCustomMaidaBaseUpdates(),
          doorBottomGap: newValue
        });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseInt(doorBottomGapInput) || 0;
      const newValue = currentValue - 1;
      setDoorBottomGapInput(newValue.toString());
      setDoorBottomGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, {
          ...getDoorLiftTouchCustomMaidaBaseUpdates(),
          doorBottomGap: newValue
        });
      }
    }
  };

  // 도어 셋팅 모드 변경 핸들러
  const handleDoorSettingModeChange = (mode: 'auto' | 'manual') => {
    setDoorSettingMode(mode);
    if (currentPlacedModule) {
      if (mode === 'auto') {
        // 자동 모드로 전환 시 오버레이 값 초기화
        setDoorOverlayLeft(0);
        setDoorOverlayRight(0);
        setDoorOverlayTop(0);
        setDoorOverlayBottom(0);
        setDoorOverlayLeftInput('0');
        setDoorOverlayRightInput('0');
        setDoorOverlayTopInput('0');
        setDoorOverlayBottomInput('0');
        updatePlacedModule(currentPlacedModule.id, {
          doorSettingMode: 'auto',
          doorOverlayLeft: 0,
          doorOverlayRight: 0,
          doorOverlayTop: 0,
          doorOverlayBottom: 0
        });
      } else {
        updatePlacedModule(currentPlacedModule.id, { doorSettingMode: 'manual' });
      }
    }
  };

  // 도어 오버레이 값 변경 핸들러
  const handleDoorOverlayChange = (direction: 'left' | 'right' | 'top' | 'bottom', inputValue: string) => {
    const setInput = { left: setDoorOverlayLeftInput, right: setDoorOverlayRightInput, top: setDoorOverlayTopInput, bottom: setDoorOverlayBottomInput }[direction];
    setInput(inputValue);

    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && currentPlacedModule) {
      const setValue = { left: setDoorOverlayLeft, right: setDoorOverlayRight, top: setDoorOverlayTop, bottom: setDoorOverlayBottom }[direction];
      const propKey = { left: 'doorOverlayLeft', right: 'doorOverlayRight', top: 'doorOverlayTop', bottom: 'doorOverlayBottom' }[direction];
      setValue(numValue);
      updatePlacedModule(currentPlacedModule.id, { [propKey]: numValue });
    }
  };

  const handleDoorOverlayBlur = (direction: 'left' | 'right' | 'top' | 'bottom') => {
    const inputMap = { left: doorOverlayLeftInput, right: doorOverlayRightInput, top: doorOverlayTopInput, bottom: doorOverlayBottomInput };
    const valueMap = { left: doorOverlayLeft, right: doorOverlayRight, top: doorOverlayTop, bottom: doorOverlayBottom };
    const setInputMap = { left: setDoorOverlayLeftInput, right: setDoorOverlayRightInput, top: setDoorOverlayTopInput, bottom: setDoorOverlayBottomInput };
    const numValue = parseFloat(inputMap[direction]);
    if (isNaN(numValue)) {
      setInputMap[direction](valueMap[direction].toString());
    }
  };

  // 섹션 깊이 입력 핸들러
  const handleLowerDepthChange = (value: string) => {
// console.log('⬇️⬇️⬇️ [하부 섹션 깊이 변경 시작] value=', value, 'currentPlacedModule.id=', currentPlacedModule?.id);
    setLowerDepthInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
// console.log('🔢 [숫자 파싱] numValue=', numValue, 'isValid=', !isNaN(numValue) && numValue > 0);

    if (!isNaN(numValue) && numValue > 0 && currentPlacedModule) {
// console.log('✅✅✅ [하부 섹션 깊이 적용 시작] numValue=', numValue, 'moduleId=', currentPlacedModule.id);
      if (moduleData?.category === 'lower' && !isTwoSectionFurniture) {
        applyLowerCabinetDepth(numValue);
        return;
      }
      setLowerSectionDepth(numValue);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionDepth: numValue });
// console.log('💾 [updatePlacedModule 호출 완료]');
    }
  };

  const handleUpperDepthChange = (value: string) => {
// console.log('⬆️⬆️⬆️ [상부 섹션 깊이 변경 시작] value=', value, 'currentPlacedModule.id=', currentPlacedModule?.id);
    setUpperDepthInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
// console.log('🔢 [숫자 파싱] numValue=', numValue, 'isValid=', !isNaN(numValue) && numValue > 0);

    if (!isNaN(numValue) && numValue > 0 && currentPlacedModule) {
// console.log('✅✅✅ [상부 섹션 깊이 적용 시작] numValue=', numValue, 'moduleId=', currentPlacedModule.id);
      setUpperSectionDepth(numValue);
      updatePlacedModule(currentPlacedModule.id, { upperSectionDepth: numValue });
// console.log('💾 [updatePlacedModule 호출 완료]');
    }
  };

  // ─── 섹션별 치수 핸들러 (자유배치 + customConfig) ───

  // 섹션 높이 변경 (onBlur) — 다른 섹션 높이를 재분배
  const handleSectionHeightBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const pt = cc.panelThickness || 18;
    const sections = [...cc.sections];
    const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
    if (isNaN(inputVal) || inputVal < 100) {
      // 유효하지 않으면 원래값 복원
      const orig = sections[sIdx].height + 2 * pt;
      setSectionHeightInputs(prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    const newInnerH = inputVal - 2 * pt;
    if (newInnerH < 50) return;

    const totalH = placedBodyHeight || 2000;
    const sectionCount = sections.length;
    const oldInnerH = sections[sIdx].height;
    const diff = newInnerH - oldInnerH;

    // 다른 섹션에서 diff만큼 빼기 (비율로 분배)
    const otherIndices = sections.map((_, i) => i).filter(i => i !== sIdx);
    const otherTotal = otherIndices.reduce((sum, i) => sum + sections[i].height, 0);
    if (otherTotal - diff < otherIndices.length * 50) return; // 다른 섹션 최소 50mm

    sections[sIdx] = { ...sections[sIdx], height: newInnerH };
    otherIndices.forEach(i => {
      const ratio = otherTotal > 0 ? sections[i].height / otherTotal : 1 / otherIndices.length;
      sections[i] = { ...sections[i], height: Math.round(sections[i].height - diff * ratio) };
    });
    // 반올림 오차 보정
    const allocated = sections.reduce((sum, s) => sum + s.height, 0);
    const totalInner = totalH - sectionCount * 2 * pt - (cc.sectionGap || 0) * (sectionCount - 1);
    const remainder = totalInner - allocated;
    if (Math.abs(remainder) > 0) {
      const lastOther = otherIndices[otherIndices.length - 1];
      sections[lastOther] = { ...sections[lastOther], height: sections[lastOther].height + remainder };
    }

    const newConfig = { ...cc, sections };
    updatePlacedModule(currentPlacedModule.id, { customConfig: newConfig });
    // 모든 입력 갱신
    const hInputs: Record<number, string> = {};
    sections.forEach((s, i) => { hInputs[i] = Math.round(s.height + 2 * pt).toString(); });
    setSectionHeightInputs(hInputs);
  };

  // 섹션 깊이 변경 (onBlur)
  const handleSectionDepthBlur = (sIdx: number) => {
    if (!currentPlacedModule) return;
    const val = parseInt(sectionDepthInputs[sIdx] || '0', 10);
    if (isNaN(val) || val < 100 || val > 800) {
      const orig = sIdx === 0
        ? (currentPlacedModule.lowerSectionDepth || currentPlacedModule.freeDepth || 580)
        : (currentPlacedModule.upperSectionDepth || currentPlacedModule.freeDepth || 580);
      setSectionDepthInputs(prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    if (sIdx === 0) {
      if (moduleData?.category === 'lower' && !isTwoSectionFurniture) {
        applyLowerCabinetDepth(val);
        setLowerDepthInput(val.toString());
        return;
      }
      setLowerSectionDepth(val);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionDepth: val });
      setLowerDepthInput(val.toString());
    } else if (sIdx === 1) {
      setUpperSectionDepth(val);
      updatePlacedModule(currentPlacedModule.id, { upperSectionDepth: val });
      setUpperDepthInput(val.toString());
    }
  };

  // 섹션 너비 변경 (onBlur) — 전체 가구 너비 변경
  const handleSectionWidthBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const val = parseInt(sectionWidthInputs[sIdx] || '0', 10);
    if (isNaN(val) || val < 100 || val > 2400) {
      const cc = currentPlacedModule.customConfig;
      const orig = cc.sections[sIdx]?.width || currentPlacedModule.freeWidth || 600;
      setSectionWidthInputs(prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    const cc = currentPlacedModule.customConfig;
    const sections = cc.sections.map((s: any, i: number) => {
      if (i === sIdx) return { ...s, width: val };
      return { ...s, width: val }; // 모든 섹션 너비 연동
    });
    const newConfig = { ...cc, sections };
    // store에서 최신 모듈 가져오기 (stale state 방지)
    const fm = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
    const fa = useFurnitureStore.getState().placedModules;
    const freshSpaceInfo = useSpaceConfigStore.getState().spaceInfo;
    // 키큰장찬넬(insert-frame)은 채움재 → 한쪽 면 고정 리사이즈 (뷰어 상단 입력창과 동일)
    const isInsertFrameSecBlur = typeof fm.moduleId === 'string' && fm.moduleId.includes('insert-frame');
    const newX = isInsertFrameSecBlur
      ? calcInsertFrameResizedPositionX(fm, val, fa, freshSpaceInfo, fm.insertFrameWidthAnchor ?? 'left')
      : calcResizedPositionX(fm, val, fa, freshSpaceInfo);
    updatePlacedModule(currentPlacedModule.id, {
      customConfig: newConfig,
      freeWidth: val,
      moduleWidth: val,
      position: { ...fm.position, x: newX },
      ...(isInsertFrameSecBlur ? { userResizedWidth: true } : {}),
    });
    setFreeWidthInput(val.toString());
    // 모든 섹션 너비 입력 동기화
    const wInputs: Record<number, string> = {};
    sections.forEach((_: any, i: number) => { wInputs[i] = val.toString(); });
    setSectionWidthInputs(wInputs);
  };

  // horizontalSplit 좌측 너비 변경 (onBlur) — 우측이 자동 조정
  const handleHsLeftWidthBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const sec = cc.sections[sIdx];
    if (!sec?.horizontalSplit) return;
    const pt = cc.panelThickness || 18;
    const sectionW = sec.width || currentPlacedModule.freeWidth || 600;
    const innerW = sectionW - 2 * pt;
    const val = parseInt(hsLeftWidthInput[sIdx] || '0', 10);
    if (isNaN(val) || val < 50) {
      setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: Math.round(sec.horizontalSplit!.position || innerW / 2).toString() }));
      return;
    }
    const has3Split = !!sec.horizontalSplit.secondPosition;
    const maxLeft = has3Split
      ? innerW - (sec.horizontalSplit.secondPosition || 0) - 2 * pt - 50
      : innerW - pt - 50;
    const clamped = Math.min(val, maxLeft);
    const hs = { ...sec.horizontalSplit, position: clamped };
    const newSections = cc.sections.map((s: any, i: number) =>
      i === sIdx ? { ...s, horizontalSplit: hs } : s
    );
    updatePlacedModule(currentPlacedModule.id, { customConfig: { ...cc, sections: newSections } });
    setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: clamped.toString() }));
    // 우측 자동 업데이트
    const rightW = has3Split
      ? innerW - clamped - (hs.secondPosition || 0) - 2 * pt
      : innerW - clamped - pt;
    setHsRightWidthInput(prev => ({ ...prev, [sIdx]: Math.round(rightW).toString() }));
  };

  // horizontalSplit 우측 너비 변경 (onBlur) — 좌측이 자동 조정
  const handleHsRightWidthBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const sec = cc.sections[sIdx];
    if (!sec?.horizontalSplit) return;
    const pt = cc.panelThickness || 18;
    const sectionW = sec.width || currentPlacedModule.freeWidth || 600;
    const innerW = sectionW - 2 * pt;
    const val = parseInt(hsRightWidthInput[sIdx] || '0', 10);
    if (isNaN(val) || val < 50) {
      const origRight = sec.horizontalSplit.secondPosition
        ? innerW - (sec.horizontalSplit.position || 0) - (sec.horizontalSplit.secondPosition || 0) - 2 * pt
        : innerW - (sec.horizontalSplit.position || innerW / 2) - pt;
      setHsRightWidthInput(prev => ({ ...prev, [sIdx]: Math.round(origRight).toString() }));
      return;
    }
    const has3Split = !!sec.horizontalSplit.secondPosition;
    const maxRight = has3Split
      ? innerW - (sec.horizontalSplit.secondPosition || 0) - 2 * pt - 50
      : innerW - pt - 50;
    const clamped = Math.min(val, maxRight);
    const newLeftW = has3Split
      ? innerW - clamped - (sec.horizontalSplit.secondPosition || 0) - 2 * pt
      : innerW - clamped - pt;
    const hs = { ...sec.horizontalSplit, position: Math.max(50, newLeftW) };
    const newSections = cc.sections.map((s: any, i: number) =>
      i === sIdx ? { ...s, horizontalSplit: hs } : s
    );
    updatePlacedModule(currentPlacedModule.id, { customConfig: { ...cc, sections: newSections } });
    setHsRightWidthInput(prev => ({ ...prev, [sIdx]: clamped.toString() }));
    setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: Math.max(50, newLeftW).toString() }));
  };

  // horizontalSplit 서브박스 깊이 변경 (onBlur)
  const handleHsDepthBlur = (sIdx: number, side: 'left' | 'right' | 'center') => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const sec = cc.sections[sIdx];
    if (!sec?.horizontalSplit) return;
    const inputMap = { left: hsLeftDepthInput, right: hsRightDepthInput, center: hsCenterDepthInput };
    const val = parseInt(inputMap[side][sIdx] || '0', 10);
    const totalDepth = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || 580;
    if (isNaN(val) || val < 100 || val > 800) {
      const orig = (sec.horizontalSplit as any)[`${side}Depth`] || totalDepth;
      const setMap = { left: setHsLeftDepthInput, right: setHsRightDepthInput, center: setHsCenterDepthInput };
      setMap[side](prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    const hs = { ...sec.horizontalSplit, [`${side}Depth`]: val };
    const newSections = cc.sections.map((s: any, i: number) =>
      i === sIdx ? { ...s, horizontalSplit: hs } : s
    );
    updatePlacedModule(currentPlacedModule.id, { customConfig: { ...cc, sections: newSections } });
  };

  const handleLowerTopOffsetChange = (value: string) => {
    if (value === '' || /^-?\d+$/.test(value)) {
      setLowerTopOffsetInput(value);

      const numValue = parseInt(value, 10);
      if (!isNaN(numValue) && currentPlacedModule) {
        setLowerTopOffset(numValue);
        updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: numValue });
      }
    }
  };

  const handleLowerTopOffsetBlur = () => {
    if (lowerTopOffsetInput === '') {
      setLowerTopOffsetInput(lowerTopOffset.toString());
      return;
    }

    const numValue = parseInt(lowerTopOffsetInput, 10);
    if (isNaN(numValue)) {
      setLowerTopOffsetInput(lowerTopOffset.toString());
    } else if (currentPlacedModule) {
      setLowerTopOffset(numValue);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: numValue });
    }
  };

  const handleLowerTopOffsetKeyDown = (e: React.KeyboardEvent) => {
    if (!currentPlacedModule) return;

    if (e.key === 'Enter') {
      handleLowerTopOffsetBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseInt(lowerTopOffsetInput, 10) || 0;
      const nextValue = currentValue + (e.key === 'ArrowUp' ? 1 : -1);
      setLowerTopOffsetInput(nextValue.toString());
      setLowerTopOffset(nextValue);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: nextValue });
    }
  };

  // 너비 입력 필드 처리
  const handleWidthInputChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setWidthInputValue(value);
      setWidthError('');
    }
  };

  const handleWidthInputBlur = () => {
    const value = widthInputValue;
    if (value === '') {
      // 빈 값인 경우 기존 값으로 되돌림
      setWidthInputValue(customWidth.toString());
      return;
    }
    
    const numValue = parseInt(value);
    const minWidth = 150; // 최소 너비
    const maxWidth = moduleData.dimensions.width; // 최대 너비는 원래 크기
    
    // 범위 검증
    if (numValue < minWidth) {
      setWidthError(t('furniture.minValue', { value: minWidth }));
    } else if (numValue > maxWidth) {
      setWidthError(t('furniture.maxValue', { value: maxWidth }));
    } else {
      setWidthError('');
      handleCustomWidthChange(numValue);
    }
  };

  const handleWidthKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleWidthInputBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseInt(widthInputValue, 10) || customWidth;
      const minW = 150;
      const maxW = moduleData?.dimensions?.width || 2400;
      const next = Math.max(minW, Math.min(maxW, cur + (e.key === 'ArrowUp' ? 1 : -1)));
      setWidthInputValue(next.toString());
      handleCustomWidthChange(next);
    }
  };

  const handleHingePositionChange = (position: 'left' | 'right') => {
    setHingePosition(position);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hingePosition: position });
    }
  };

  const handleCornerHingePositionChange = (
    field: 'cornerFrontHingePosition' | 'cornerSideHingePosition',
    position: 'left' | 'right'
  ) => {
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { [field]: position });
    }
  };

  const handleHingeTypeChange = (type: 'A' | 'B') => {
    setHingeType(type);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hingeType: type });
    }
  };

  type HingePositionsField = 'hingePositionsMm' | 'upperDoorHingePositionsMm' | 'lowerDoorHingePositionsMm';

  const clampHingePositionMm = (value: number, doorHeightMm: number) => {
    const max = Math.max(1, Math.round(doorHeightMm) - 1);
    return Math.max(1, Math.min(max, Math.round(value)));
  };

  const bottomToTopHingePositionMm = (positionMm: number, doorHeightMm: number) =>
    clampHingePositionMm(Math.round(doorHeightMm) - positionMm, doorHeightMm);

  const topToBottomHingePositionMm = (positionMm: number, doorHeightMm: number) =>
    clampHingePositionMm(Math.round(doorHeightMm) - positionMm, doorHeightMm);

  const getHingePositionDraftKey = (field: HingePositionsField, index: number) =>
    `${currentPlacedModule?.id ?? 'module'}:${field}:${index}`;

  const getHingeGapDraftKey = (field: HingePositionsField, index: number) =>
    `${currentPlacedModule?.id ?? 'module'}:${field}:gap:${index}`;

  const clearHingePositionDraft = (draftKey: string) => {
    setHingePositionDrafts((prev) => {
      if (!(draftKey in prev)) return prev;
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const clearHingeGapDraft = (draftKey: string) => {
    setHingeGapDrafts((prev) => {
      if (!(draftKey in prev)) return prev;
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
    setHingeGapEditBases((prev) => {
      if (!(draftKey in prev)) return prev;
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const getHingeTopDistancesMm = (positions: number[], doorHeightMm: number) =>
    normalizeDoorHingePositionsMm(positions, doorHeightMm)
      .map(positionMm => bottomToTopHingePositionMm(positionMm, doorHeightMm))
      .sort((a, b) => a - b);

  const getHingeGapSegments = (positions: number[], doorHeightMm: number) => {
    const topDistances = getHingeTopDistancesMm(positions, doorHeightMm);
    const boundaries = [0, ...topDistances, Math.round(doorHeightMm)];
    return boundaries.slice(0, -1).map((startMm, index) => {
      const endMm = boundaries[index + 1];
      const isFirst = index === 0;
      const isLast = index === boundaries.length - 2;
      const label = isFirst
        ? '상단-1번'
        : isLast
          ? `${topDistances.length}번-하단`
          : `${index}번-${index + 1}번`;
      return {
        label,
        valueMm: Math.max(0, Math.round(endMm - startMm)),
        segmentIndex: index
      };
    });
  };

  const applyHingeGapSegmentChange = (
    field: HingePositionsField,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number,
    segmentIndex: number,
    valueMm: number,
    editBasis?: { topDistancesMm: number[]; doorHeightMm: number }
  ) => {
    const topDistances = editBasis?.topDistancesMm ?? getHingeTopDistancesMm(currentPositions, doorHeightMm);
    if (topDistances.length === 0) return;

    const doorHeight = Math.round(editBasis?.doorHeightMm ?? doorHeightMm);
    const boundaries = [0, ...topDistances, doorHeight];
    const editPlan = resolveHingeGapEditPlan({
      boundariesMm: boundaries,
      segmentIndex,
      requestedGapMm: valueMm,
      lockedSegmentIndices: lockedHingeGaps[`${currentPlacedModule?.id}:${field}`] || []
    });
    if (!editPlan) return; // 흡수 가능한 간격 없음(모두 잠김) → 편집 불가

    const nextTopDistances = editPlan.nextTopDistancesMm;
    const nextBottomPositions = nextTopDistances.map(topDistanceMm =>
      topToBottomHingePositionMm(topDistanceMm, doorHeight)
    );
    updateHingePositions(field, nextBottomPositions, doorHeight, doorBottomOnSideMm);
  };

  const updateHingePositions = (
    field: HingePositionsField,
    positions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number
  ) => {
    if (!currentPlacedModule?.id) return;
    const normalized = normalizeDoorHingePositionsMm(positions, doorHeightMm);
    const sidePositions = normalized.map(positionMm =>
      Math.round((doorBottomOnSideMm + positionMm) * 1000) / 1000
    );
    updatePlacedModule(currentPlacedModule.id, { [field]: sidePositions } as any);
  };

  const handleHingePositionEditModeChange = (checked: boolean) => {
    if (!currentPlacedModule?.id) return;
    setHingePositionEditModeModuleId(checked ? currentPlacedModule.id : null);
    if (checked) {
      setViewMode('2D');
      setView2DDirection('front');
      setShowDimensions(true);
    }
  };

  const handleHingePositionValueChange = (
    field: HingePositionsField,
    index: number,
    value: string,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number,
    draftKey: string
  ) => {
    if (value === '' || value === '-' || !/^-?\d+$/.test(value)) {
      setHingePositionDrafts((prev) => ({ ...prev, [draftKey]: value }));
      return;
    }
    const topDistanceMm = clampHingePositionMm(parseInt(value, 10), doorHeightMm);
    setHingePositionDrafts((prev) => ({ ...prev, [draftKey]: String(topDistanceMm) }));
    const next = [...currentPositions];
    next[index] = topToBottomHingePositionMm(topDistanceMm, doorHeightMm);
    updateHingePositions(field, next, doorHeightMm, doorBottomOnSideMm);
  };

  const handleHingeGapValueChange = (
    field: HingePositionsField,
    segmentIndex: number,
    value: string,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number,
    draftKey: string
  ) => {
    setHingeGapDrafts((prev) => ({ ...prev, [draftKey]: value }));
    if (value === '' || value === '-' || !/^-?\d+$/.test(value)) {
      return;
    }
    const gapMm = clampHingePositionMm(parseInt(value, 10), doorHeightMm);
    applyHingeGapSegmentChange(field, currentPositions, doorHeightMm, doorBottomOnSideMm, segmentIndex, gapMm, hingeGapEditBases[draftKey]);
  };

  const handleHingeGapKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    field: HingePositionsField,
    segmentIndex: number,
    inputValue: string,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number,
    draftKey: string
  ) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      clearHingeGapDraft(draftKey);
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      clearHingeGapDraft(draftKey);
      event.currentTarget.blur();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const segments = getHingeGapSegments(currentPositions, doorHeightMm);
    const fallback = segments[segmentIndex]?.valueMm ?? 1;
    const liveValue = event.currentTarget.value;
    const parsed = /^-?\d+$/.test(liveValue) ? parseInt(liveValue, 10) : (/^-?\d+$/.test(inputValue) ? parseInt(inputValue, 10) : fallback);
    const delta = event.key === 'ArrowUp' ? step : -step;
    const nextGap = clampHingePositionMm((Number.isFinite(parsed) ? parsed : fallback) + delta, doorHeightMm);
    setHingeGapDrafts((prev) => ({ ...prev, [draftKey]: String(nextGap) }));
    applyHingeGapSegmentChange(field, currentPositions, doorHeightMm, doorBottomOnSideMm, segmentIndex, nextGap, hingeGapEditBases[draftKey]);
  };

  const handleHingePositionKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    field: HingePositionsField,
    index: number,
    inputValue: string,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number,
    draftKey: string
  ) => {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const parsed = /^-?\d+$/.test(inputValue)
      ? parseInt(inputValue, 10)
      : bottomToTopHingePositionMm(currentPositions[index], doorHeightMm);
    const delta = event.key === 'ArrowUp' ? step : -step;
    const nextTopDistanceMm = clampHingePositionMm((Number.isFinite(parsed) ? parsed : 1) + delta, doorHeightMm);
    const next = [...currentPositions];
    next[index] = topToBottomHingePositionMm(nextTopDistanceMm, doorHeightMm);
    clearHingePositionDraft(draftKey);
    updateHingePositions(field, next, doorHeightMm, doorBottomOnSideMm);
  };

  // 잠긴 간격은 유지하고 나머지 간격을 균등 분배 (위아래 잠그고 가운데 등분 워크플로)
  const handleEqualizeHingeGaps = (
    field: HingePositionsField,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number
  ) => {
    const doorHeight = Math.round(doorHeightMm);
    const topDistances = getHingeTopDistancesMm(currentPositions, doorHeight);
    if (topDistances.length === 0) return;
    const equalizePlan = resolveHingeGapEqualizePlan({
      boundariesMm: [0, ...topDistances, doorHeight],
      lockedSegmentIndices: lockedHingeGaps[`${currentPlacedModule?.id}:${field}`] || []
    });
    if (!equalizePlan) return;
    const nextBottomPositions = equalizePlan.nextTopDistancesMm.map(topDistanceMm =>
      topToBottomHingePositionMm(topDistanceMm, doorHeight)
    );
    updateHingePositions(field, nextBottomPositions, doorHeight, doorBottomOnSideMm);
  };

  const handleAddHingePosition = (
    field: HingePositionsField,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number
  ) => {
    const sortedPositions = normalizeDoorHingePositionsMm(currentPositions, doorHeightMm);
    let nextPosition = Math.round(doorHeightMm / 2);

    if (sortedPositions.length === 1) {
      const current = sortedPositions[0];
      nextPosition = current > doorHeightMm / 2
        ? current - 100
        : current + 100;
    } else if (sortedPositions.length > 1) {
      let largestGapIndex = 0;
      let largestGap = sortedPositions[1] - sortedPositions[0];
      for (let i = 1; i < sortedPositions.length - 1; i++) {
        const gap = sortedPositions[i + 1] - sortedPositions[i];
        if (gap > largestGap) {
          largestGap = gap;
          largestGapIndex = i;
        }
      }
      nextPosition = Math.round((sortedPositions[largestGapIndex] + sortedPositions[largestGapIndex + 1]) / 2);
    }

    // 경첩 개수 변경 시 간격 인덱스가 어긋나므로 잠금 초기화
    clearHingeGapLocks(`${currentPlacedModule?.id}:${field}`);
    updateHingePositions(field, [...currentPositions, nextPosition], doorHeightMm, doorBottomOnSideMm);
  };

  const handleRemoveHingePosition = (
    field: HingePositionsField,
    index: number,
    currentPositions: number[],
    doorHeightMm: number,
    doorBottomOnSideMm: number
  ) => {
    if (currentPositions.length <= 1) return;
    // 경첩 개수 변경 시 간격 인덱스가 어긋나므로 잠금 초기화
    clearHingeGapLocks(`${currentPlacedModule?.id}:${field}`);
    updateHingePositions(field, currentPositions.filter((_, itemIndex) => itemIndex !== index), doorHeightMm, doorBottomOnSideMm);
  };

  const handleDoorChange = (doorEnabled: boolean) => {
    setHasDoor(doorEnabled);
    if (activePopup.id) {
      // 현재 showDimensions 상태 저장
      const currentShowDimensions = useUIStore.getState().showDimensions;
      
      // hasDoor 켤 때 doorTopGap/doorBottomGap 기본값 (몸통 기준, EP와 동일)
      // 기본값 0 = 도어와 몸통이 동일한 위치
      // 도어올림(상단 +30) / 상판내림(하단 +5) 같은 특수 모듈만 기본값 보존
      const mod = useFurnitureStore.getState().placedModules.find(m => m.id === activePopup.id);
      const updates: Record<string, unknown> = { hasDoor: doorEnabled };
      if (doorEnabled && mod) {
        const mId = mod.moduleId || '';
        const isDL = isDoorLiftTopEndPanelModuleId(mId);
        const isTD = mId.includes('lower-top-down-');
        const isBasicLowerDoorGap = isBasicLowerDoorGapModuleId(mId);
        const isLowerModule = mId.startsWith('lower-') || mId.includes('dual-lower-');
        const isUpperModule = moduleData?.category === 'upper'
          || mId.startsWith('upper-')
          || mId.includes('-upper-')
          || mId.includes('upper-cabinet');
        const isFullSurroundForDoorDefaults = spaceInfo.surroundType === 'surround'
          && spaceInfo.frameConfig?.top !== false;
        if (isUpperModule) {
          if (mod.doorTopGap === undefined) {
            updates.doorTopGap = spaceInfo.doorTopGapUpper ?? (isFullSurroundForDoorDefaults ? -3 : 5);
          }
          if (mod.doorBottomGap === undefined) {
            updates.doorBottomGap = spaceInfo.doorBottomGapUpper ?? 28;
          }
        } else if (mod.doorTopGap === undefined) {
          updates.doorTopGap = isUpperModule
            ? (spaceInfo.doorTopGapUpper ?? (isFullSurroundForDoorDefaults ? -3 : 5))
            : isDL
            ? (spaceInfo.doorTopGapLowerDoorLift ?? DOOR_LIFT_DOOR_TOP_GAP_DEFAULT)
            : isTD
              ? (spaceInfo.doorTopGapLowerTopDown ?? getTopDownDoorTopGap(mod.stoneTopThickness, mod.hasTopEndPanel === true))
              : isBasicLowerDoorGap
                ? (spaceInfo.doorTopGapLower ?? BASIC_LOWER_DOOR_TOP_GAP_DEFAULT)
                : isLowerModule
                  ? (spaceInfo.doorTopGapLower ?? 20)
                  : (isFullSurroundForDoorDefaults ? -3 : 5);
        } else if (isBasicLowerDoorGap && mod.doorTopGap === 20) {
          updates.doorTopGap = BASIC_LOWER_DOOR_TOP_GAP_DEFAULT;
        } else if (isFullSurroundForDoorDefaults && mod.hasTopFrame !== false && mod.doorTopGap === 5 && !isDL && !isTD && !isLowerModule) {
          updates.doorTopGap = -3;
        }
        if (!isUpperModule && mod.doorBottomGap === undefined) {
          updates.doorBottomGap = isUpperModule
            ? (spaceInfo.doorBottomGapUpper ?? 28)
            : isTD
              ? (spaceInfo.doorBottomGapLowerTopDown ?? 5)
            : isDL
              ? (spaceInfo.doorBottomGapLowerDoorLift ?? 5)
            : isBasicLowerDoorGap
              ? (spaceInfo.doorBottomGapLower ?? 5)
            : isLowerModule
              ? (spaceInfo.doorBottomGapLower ?? 2)
              : 25;
        }
      }
      updatePlacedModule(activePopup.id, updates);

      // showDimensions 상태 복원 (도어 변경이 슬롯 가이드를 끄지 않도록)
      useUIStore.getState().setShowDimensions(currentShowDimensions);
    }
  };

  const handleGapBackPanelChange = (gapBackPanelEnabled: boolean) => {
    setHasGapBackPanel(gapBackPanelEnabled);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hasGapBackPanel: gapBackPanelEnabled });
    }
  };

  const handleBackPanelThicknessChange = (thickness: number) => {
    setBackPanelThicknessValue(thickness);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { backPanelThickness: thickness });
    }
  };

  // 기둥 C 배치 모드 변경 핸들러
  const handleColumnPlacementModeChange = (mode: 'beside' | 'front') => {
    setColumnPlacementMode(mode);
    if (activePopup.id && slotInfo && currentPlacedModule) {
      const indexing = calculateSpaceIndexing(spaceInfo);
      const slotWidth = indexing.columnWidth; // 슬롯 전체 너비 (586mm)
      const columnDepth = slotInfo.column?.depth || 300; // 기둥 깊이
      // 가구 기본 깊이(moduleData 기준) - 기둥 깊이 = 기둥 앞에 배치할 수 있는 남은 깊이
      const baseFurnitureDepth = moduleData?.dimensions?.depth || moduleData?.defaultDepth || 600;
      const remainingDepth = Math.max(50, baseFurnitureDepth - columnDepth); // 최소 50mm 보장

      // 슬롯 중심 위치 계산 (치수가이드 동기화용)
      const slotIndex = currentPlacedModule.slotIndex;
      const slotCenterX = slotIndex !== undefined && indexing.threeUnitPositions[slotIndex] !== undefined
        ? indexing.threeUnitPositions[slotIndex]
        : currentPlacedModule.position.x;

      if (mode === 'front') {
        // 기둥 앞에 배치: 화살표 버튼과 동일한 로직
        // customDepth 축소 + sectionDepthDirection='back'으로 뒷면 고정 (가구 앞쪽으로 이동)
        updatePlacedModule(activePopup.id, {
          columnPlacementMode: mode,
          customWidth: slotWidth,
          customDepth: remainingDepth,
          lowerSectionDepth: remainingDepth,
          upperSectionDepth: remainingDepth,
          lowerSectionDepthDirection: 'back',
          upperSectionDepthDirection: 'back',
          adjustedWidth: undefined,
          columnSlotInfo: undefined,
          position: {
            ...currentPlacedModule.position,
            x: slotCenterX
          }
        } as any);
        // UI 입력 필드도 업데이트
        setCustomWidth(slotWidth.toString());
        setLowerSectionDepth(remainingDepth.toString());
        setUpperSectionDepth(remainingDepth.toString());
      } else {
        // 기둥 측면 배치: 폭은 줄임, 깊이는 원래대로
        const availableWidth = slotInfo.availableWidth || (slotWidth - 200); // 기둥 침범 후 가용 폭
        const originalDepth = moduleData?.dimensions.depth || 600;

        // 위치 계산 (FurnitureItem.tsx와 동일한 로직)
        const widthReduction = slotWidth - availableWidth;
        const halfReductionUnits = (widthReduction / 2) * 0.01; // mm를 Three.js 단위로 변환

        let besidePositionX = slotCenterX;
        if (slotInfo.intrusionDirection === 'from-left') {
          // 기둥이 왼쪽에서 침범 - 가구를 오른쪽으로 이동
          besidePositionX = slotCenterX + halfReductionUnits;
        } else if (slotInfo.intrusionDirection === 'from-right') {
          // 기둥이 오른쪽에서 침범 - 가구를 왼쪽으로 이동
          besidePositionX = slotCenterX - halfReductionUnits;
        }

        updatePlacedModule(activePopup.id, {
          columnPlacementMode: mode,
          customWidth: availableWidth, // 줄어든 폭
          customDepth: undefined, // 깊이 원래대로
          lowerSectionDepth: undefined, // 섹션 깊이 원래대로
          upperSectionDepth: undefined, // 섹션 깊이 원래대로
          adjustedWidth: availableWidth, // beside 모드에서 폭 조정
          position: {
            ...currentPlacedModule.position,
            x: besidePositionX // 기둥 침범 방향에 따른 위치
          }
        });
        // UI 입력 필드도 업데이트
        setCustomWidth(availableWidth.toString());
        setLowerSectionDepth(originalDepth.toString());
        setUpperSectionDepth(originalDepth.toString());
      }
    }
  };


  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerTabs}>
            <button
              className={`${styles.tabButton} ${!showDetails ? styles.activeTab : ''}`}
              onClick={() => {
                setShowDetails(false);
                if (activePopup?.type === 'furnitureEdit' && activePopup.id) {
                  setSelectedFurnitureId(activePopup.id);
                }
              }}
            >
              {t('furniture.editFurniture')}
            </button>
            <button
              className={`${styles.tabButton} ${showDetails ? styles.activeTab : ''}`}
              onClick={() => {
                setShowDetails(true);
                if (activePopup?.type === 'furnitureEdit' && activePopup.id) {
                  setSelectedFurnitureId(activePopup.id);
                }
              }}
            >
              {t('furniture.viewDetails')}
            </button>
          </div>
          <button className={styles.closeButton} onClick={handleClose} aria-label="닫기"></button>
        </div>

        {currentPlacedModule && !showDetails && (
          <FurniturePresetButtons
            placedModule={currentPlacedModule}
            moduleCategory={moduleData?.category}
          />
        )}

        <div className={styles.content}>
          <div className={styles.moduleInfo}>
            <div className={styles.modulePreview}>
              {(() => {
                const imgPath = getFurnitureImagePath(moduleData.id);
                if (imgPath) {
                  return (
                    <img
                      src={imgPath}
                      alt={moduleData.name}
                      className={styles.moduleImage}
                      onError={(e) => {
                        // 이미지 로드 실패 시 텍스트 썸네일로 대체
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        const container = img.parentElement;
                        if (container) {
                          const name = moduleData.name.replace(/\s*\d+(\.\d+)?mm$/, '');
                          container.innerHTML = `<div style="
                            display: flex; align-items: center; justify-content: center;
                            width: 100%; height: 100%; background: #f5f5f5; border-radius: 6px;
                            font-size: 12px; color: #666; text-align: center; padding: 4px;
                          ">${name}</div>`;
                        }
                      }}
                    />
                  );
                }
                // 이미지 없으면 텍스트 썸네일
                const name = moduleData.name.replace(/\s*\d+(\.\d+)?mm$/, '');
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', height: '100%', background: '#f5f5f5', borderRadius: '6px',
                    fontSize: '12px', color: '#666', textAlign: 'center', padding: '4px',
                  }}>{name}</div>
                );
              })()}
            </div>
            
            <div className={styles.moduleDetails}>
              <h4 className={styles.moduleName}>
                {(() => {
                  // currentPlacedModule에서 직접 너비를 계산 (state 의존 제거로 갱신 지연 방지)
                  const directW = currentPlacedModule
                    ? Math.round((currentPlacedModule.adjustedWidth ?? currentPlacedModule.customWidth ?? moduleData.dimensions.width) * 10) / 10
                    : customWidth;
                  return directW && directW !== moduleData.dimensions.width
                    ? moduleData.name.replace(/[\d.]+mm/, `${directW}mm`)
                    : moduleData.name;
                })()}
              </h4>

              <div className={styles.property}>
                <div className={styles.propertyValue}>
                  {(() => {
                    const directW = currentPlacedModule
                      ? Math.round((currentPlacedModule.adjustedWidth ?? currentPlacedModule.customWidth ?? moduleData.dimensions.width) * 10) / 10
                      : customWidth;
                    const directD = currentPlacedModule
                      ? (currentPlacedModule.customDepth ?? getDefaultDepth(moduleData))
                      : customDepth;
                    const is2Tier = currentPlacedModule?.moduleId.includes('lower-drawer-2tier') || currentPlacedModule?.moduleId.includes('dual-lower-drawer-2tier');
                    const displayH = is2Tier && currentPlacedModule?.cabinetBodyHeight
                      ? currentPlacedModule.cabinetBodyHeight
                      : Math.round(placedBodyHeight || moduleData.dimensions.height);
                    if (!isCornerCabinet) {
                      return `${directW} × ${displayH} × ${directD}mm`;
                    }

                    const cornerSlotWidths = ((currentPlacedModule as any)?.slotWidths ?? (moduleData as any).slotWidths) as number[] | undefined;
                    const frontSlotWidthMm = (isLeftCornerCabinet
                      ? cornerSlotWidths?.[0]
                      : cornerSlotWidths?.[cornerSlotWidths.length - 1])
                      ?? directW / 2;
                    const sideDepthMm = Math.max(1, frontSlotWidthMm - 23);
                    const totalSideDepthMm = Math.max(directD, spaceInfo.depth || directD);
                    const remainingSideDepthMm = Math.max(0, totalSideDepthMm - directD);
                    const sideSlotCount = remainingSideDepthMm > 0.5
                      ? Math.max(1, Math.ceil(remainingSideDepthMm / 600))
                      : 0;
                    const sideWidthMm = sideSlotCount > 0 ? remainingSideDepthMm / sideSlotCount : 0;
                    const sideBodyWidthMm = sideWidthMm > 0 ? Math.max(1, sideWidthMm - 18) : 0;
                    const formatMm = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

                    return (
                      <div style={{ display: 'grid', gap: '2px' }}>
                        <span>정면: {formatMm(directW)} × {formatMm(displayH)} × {formatMm(directD)}mm</span>
                        <span>측면: {formatMm(sideBodyWidthMm)} × {formatMm(displayH)} × {formatMm(sideDepthMm)}mm</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* 뒷벽과 이격 / 키큰장찬넬은 전면 옵셋 (전면 프레임이 EP 라인에서 뒤로 들어가는 mm) */}
              {currentPlacedModule && (() => {
                const isInsertFrameRow = typeof currentPlacedModule.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame');
                // 키큰장찬넬: 표시값 = insertFrontInsetMm (기본 18)
                const displayValue = isInsertFrameRow
                  ? String(currentPlacedModule.insertFrontInsetMm ?? 18)
                  : String(currentPlacedModule.backWallGap ?? 0);
                return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>{isInsertFrameRow ? '전면 옵셋' : '뒷벽 이격'}</span>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={displayValue}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const parsed = parseBackWallGapInput(raw);
                        if (parsed !== null) {
                          if (isInsertFrameRow) {
                            // 키큰장찬넬: insertFrontInsetMm로 저장 (0 이상)
                            const next = Math.max(0, parsed);
                            updatePlacedModule(currentPlacedModule.id, { insertFrontInsetMm: next });
                          } else {
                            updatePlacedModule(currentPlacedModule.id, { backWallGap: parsed });
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          if (isInsertFrameRow) {
                            const cur = currentPlacedModule.insertFrontInsetMm ?? 18;
                            const next = Math.max(0, cur + (e.key === 'ArrowUp' ? 1 : -1));
                            updatePlacedModule(currentPlacedModule.id, { insertFrontInsetMm: next });
                          } else {
                            const next = stepBackWallGapMm(
                              currentPlacedModule.backWallGap,
                              e.key === 'ArrowUp' ? 1 : -1
                            );
                            updatePlacedModule(currentPlacedModule.id, { backWallGap: next });
                          }
                        }
                      }}
                      className={styles.depthInput}
                      style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, width: '70px', textAlign: 'center' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
          
          {/* 상세보기 패널 */}
          {showDetails && (() => {
            // 실제 패널 개수 계산 (섹션 구분자와 정보성 항목 제외)
            const actualPanelCount = allPanelDetails.filter(panel =>
              !panel.name?.startsWith('===') && !panel.isInfo
            ).length;

            // 옵티마이저 제외 목록 (체크 해제된 패널)
            const exclusions = currentPlacedModule?.panelExclusions ?? [];
            const realPanelNames = allPanelDetails
              .filter(p => p.name && !p.name.startsWith('===') && !p.isInfo)
              .map(p => p.name as string);
            const isPanelChecked = (name?: string) => {
              if (!name) return true;
              return !exclusions.includes(name);
            };
            const togglePanel = (name: string, checked: boolean) => {
              if (!currentPlacedModule) return;
              const cur = currentPlacedModule.panelExclusions ?? [];
              const next = checked
                ? cur.filter((n: string) => n !== name)
                : [...cur, name];
              updatePlacedModule(currentPlacedModule.id, {
                panelExclusions: next.length > 0 ? next : undefined,
              });
            };
            const allChecked = realPanelNames.every(n => isPanelChecked(n));
            const someChecked = realPanelNames.some(n => isPanelChecked(n));
            const toggleAll = (checked: boolean) => {
              if (!currentPlacedModule) return;
              updatePlacedModule(currentPlacedModule.id, {
                panelExclusions: checked ? undefined : [...realPanelNames],
              });
            };

            return (
              <div className={styles.detailsSection}>
                <h5 className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span>{t('furniture.panelDetails')} (총 {actualPanelCount}장)</span>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 400, cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allChecked && someChecked;
                      }}
                      onChange={(e) => toggleAll(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                    />
                    <span>전체</span>
                  </label>
                </h5>
                <div className={styles.panelList}>
                  {allPanelDetails.map((panel, index) => {
                  // 섹션 구분자인 경우
                  if (panel.name && panel.name.startsWith('===')) {
                    // 현재 섹션부터 다음 섹션 구분자 전까지의 실제 패널 개수 계산
                    let sectionPanelCount = 0;
                    for (let i = index + 1; i < allPanelDetails.length; i++) {
                      if (allPanelDetails[i].name?.startsWith('===')) break;
                      if (!allPanelDetails[i].isInfo) sectionPanelCount++;
                    }

                    return (
                      <div key={index} className={styles.panelSectionHeader}>
                        <strong>{panel.name.replace(/=/g, '').trim()} (총 {sectionPanelCount}장)</strong>
                      </div>
                    );
                  }
                  
                  // 정보성 항목인 경우 (오픈 공간 등)
                  if (panel.isInfo) {
                    return (
                      <div
                        key={index}
                        className={`${styles.panelItem} ${selectedPanelIndex === index ? styles.panelItemSelected : selectedPanelIndex !== null ? styles.panelItemDimmed : ''}`}
                        onClick={() => {
                          const newIndex = selectedPanelIndex === index ? null : index;
                          setSelectedPanelIndex(newIndex);

                          // 3D 뷰어 강조용: 패널 정보를 uiStore에 저장
                          if (newIndex !== null && currentPlacedModule && panel.name) {
                            const panelId = `${currentPlacedModule.id}-${panel.name}`;
// console.log('🎯 패널 강조 설정 (정보성):', panelId);
                            setHighlightedPanel(panelId);
                          } else {
// console.log('🎯 패널 강조 해제');
                            setHighlightedPanel(null);
                          }
                        }}
                      >
                        <span className={styles.panelName}>{panel.name}:</span>
                        <span className={styles.panelSize}>
                          {panel.description && panel.height ? `${panel.description} ${panel.height}mm` : panel.description || ''}
                        </span>
                      </div>
                    );
                  }

                  // 일반 패널
                  const defaultDirection = getDefaultGrainDirection(panel.name);
                  const currentDirection = currentPlacedModule?.panelGrainDirections?.[panel.name] || defaultDirection;

                  // 디버그: 마이다 패널 정보 출력
                  if (panel.name.includes('마이다')) {
// console.log('🎯 마이다 패널:', {
                      // name: panel.name,
                      // width: panel.width,
                      // height: panel.height,
                      // defaultDirection,
                      // currentDirection,
                      // storedDirection: currentPlacedModule?.panelGrainDirections?.[panel.name]
                    // });
                  }

                  void currentDirection;

                  // W/L 표시 로직
                  // - 패널목록은 제작 치수 확인용이므로 렌더/계산된 panel 치수 순서 그대로 표시한다.
                  // - 결방향은 재단 방향 속성일 뿐, 여기서 치수 순서를 뒤집지 않는다.
                  let dimensionDisplay = '';

                  if (panel.diameter) {
                    dimensionDisplay = `Φ ${formatMmInputValue(panel.diameter)} × L ${formatMmInputValue(panel.width)}`;
                  } else if (panel.width && panel.height) {
                    dimensionDisplay = `W ${formatMmInputValue(panel.width)} × L ${formatMmInputValue(panel.height)}`;
                  } else if (panel.width && panel.depth) {
                    dimensionDisplay = `W ${formatMmInputValue(panel.width)} × L ${formatMmInputValue(panel.depth)}`;
                  } else if (panel.height && panel.depth) {
                    dimensionDisplay = `W ${formatMmInputValue(panel.height)} × L ${formatMmInputValue(panel.depth)}`;
                  } else if (panel.description) {
                    dimensionDisplay = panel.description;
                  } else {
                    dimensionDisplay = formatMmInputValue(panel.width || panel.height || panel.depth);
                  }

                  const panelChecked = isPanelChecked(panel.name);
                  const isDoorPanelForBoring = !!panel.isDoor;
                  const hingeBoringExcluded = isDoorPanelForBoring
                    && (currentPlacedModule?.hingeBoringExclusions ?? []).includes(panel.name);
                  const toggleHingeBoring = () => {
                    if (!currentPlacedModule || !panel.name) return;
                    const cur = currentPlacedModule.hingeBoringExclusions ?? [];
                    const next = cur.includes(panel.name)
                      ? cur.filter((n: string) => n !== panel.name)
                      : [...cur, panel.name];
                    updatePlacedModule(currentPlacedModule.id, {
                      hingeBoringExclusions: next.length > 0 ? next : undefined,
                    } as any);
                  };
                  return (
                    <div
                      key={index}
                      className={`${styles.panelItem} ${selectedPanelIndex === index ? styles.panelItemSelected : selectedPanelIndex !== null ? styles.panelItemDimmed : ''}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: panelChecked ? 1 : 0.5 }}
                      onClick={() => {
                        const newIndex = selectedPanelIndex === index ? null : index;
                        setSelectedPanelIndex(newIndex);

                        // 3D 뷰어 강조용: 패널 정보를 uiStore에 저장
                        if (newIndex !== null && currentPlacedModule && panel.name) {
                          const panelId = `${currentPlacedModule.id}-${panel.name}`;
// console.log('🎯 패널 강조 설정 (일반):', panelId);
                          setHighlightedPanel(panelId);
                        } else {
// console.log('🎯 패널 강조 해제');
                          setHighlightedPanel(null);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={panelChecked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (panel.name) togglePanel(panel.name, e.target.checked);
                        }}
                        style={{ cursor: 'pointer', flexShrink: 0, accentColor: 'var(--theme-primary, #4a90d9)' }}
                      />
                      <div style={{ flex: 1 }}>
                        <span className={styles.panelName}>{panel.name}:</span>
                        <span className={styles.panelSize}>
                          {dimensionDisplay}
                          {panel.thickness && panel.showThickness !== false && !panel.diameter && ` (T: ${panel.thickness})`}
                          {panel.material && ` [${panel.material}]`}
                        </span>
                      </div>
                      {isDoorPanelForBoring && (
                        <button
                          style={{
                            padding: '4px 6px',
                            background: hingeBoringExcluded ? '#f59e0b' : 'var(--theme-surface, #fff)',
                            color: hingeBoringExcluded ? 'white' : 'var(--theme-text-secondary, #555)',
                            border: `1px solid ${hingeBoringExcluded ? '#f59e0b' : 'var(--theme-border, #ccc)'}`,
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHingeBoring();
                          }}
                          title={hingeBoringExcluded
                            ? `${panel.name} 힌지보링 복원 (옵티마이저·2D 힌지 표시)`
                            : `${panel.name} 힌지보링 숨김 (옵티마이저 보링·2D 힌지 숨김)`}
                        >
                          보링숨김
                        </button>
                      )}
                      <button
                        style={{
                          padding: '4px 8px',
                          background: '#757575',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          minWidth: '36px',
                          height: '26px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onClick={(e) => {
                          e.stopPropagation(); // 패널 선택 방지
                          if (!currentPlacedModule) return;
                          const newDirection = currentDirection === 'horizontal' ? 'vertical' : 'horizontal';
                          const newDirections = {
                            ...(currentPlacedModule.panelGrainDirections || {}),
                            [panel.name]: newDirection
                          };
                          updatePlacedModule(currentPlacedModule.id, { panelGrainDirections: newDirections });
                        }}
                        title={`${panel.name} 나무결 방향 전환 (W ↔ L)`}
                      >
                        <FaExchangeAlt size={12} />
                      </button>
                    </div>
                  );
                  })}
                </div>
              </div>
            );
          })()}
          
          {/* 너비 설정 (기둥 C인 경우만 표시) */}
          {isColumnC && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>{t('furniture.widthSettings')}</h5>
              <div className={styles.depthInputWrapper}>
                <div className={styles.inputWithUnit}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={widthInputValue}
                    onChange={(e) => handleWidthInputChange(e.target.value)}
                    onBlur={handleWidthInputBlur}
                    onKeyDown={handleWidthKeyDown}
                    className={`${styles.depthInput} furniture-depth-input ${widthError ? styles.inputError : ''}`}
                    placeholder={`150-${moduleData.dimensions.width}`}
                    style={{
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      WebkitTextFillColor: '#000000',
                      opacity: 1
                    }}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
                {widthError && <div className={styles.errorMessage}>{widthError}</div>}
                <div className={styles.depthRange}>
                  {t('furniture.range')}: 150mm ~ {moduleData.dimensions.width}mm
                </div>
              </div>
            </div>
          )}

          {/* 가구 치수 편집 — 한 줄 가로 배치 (편집 탭 전용) */}
          {!showDetails && currentPlacedModule && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>{(typeof currentPlacedModule.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame')) ? '프레임 사이즈' : '몸통치수'}</h5>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start', marginTop: '2px' }}>
                {/* 너비 — 슬롯배치/자유배치 모두 편집 가능 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>W</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeWidthInput}
                      onChange={(e) => setFreeWidthInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeWidthInput, 10);
                        const isSlotMode = spaceInfo.layoutMode !== 'free-placement';
                        // 키큰장찬넬: 슬롯 배치여도 자유배치처럼 좌측 고정 / 우측으로만 확장
                        const isInsertFrameWidth = typeof currentPlacedModule?.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame');
                        const isDummyWidth = typeof currentPlacedModule?.moduleId === 'string' && currentPlacedModule.moduleId.includes('dummy');

                        if (isSlotMode && !isInsertFrameWidth && currentPlacedModule) {
                          // 슬롯 모드: adjustSlotWidth 사용
                          const minWidth = isDummyWidth ? 100 : 200;
                          if (!isNaN(val) && val >= minWidth && currentPlacedModule.slotIndex !== undefined) {
                            // max 검증: internalWidth - 다른 고정합 - 남은슬롯×200
                            const { adjustSlotWidth } = useFurnitureStore.getState();
                            adjustSlotWidth(currentPlacedModule.id, val);
                            setFreeWidthInput(val.toString());
                          }
                        } else {
                          const minWidth = isInsertFrameWidth ? 30 : 100;
                          if (isNaN(val) || val < minWidth || val > 3000 || !currentPlacedModule) return;
                          // 자유배치 모드: 기존 로직
                          // 키큰장찬넬은 슬롯배치여도 좌측 고정 적용
                          const freshModule = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
                          const freshAll = useFurnitureStore.getState().placedModules;
                          const freshSI = useSpaceConfigStore.getState().spaceInfo;
                          let appliedWidth = val;
                          let newX: number;
                          let insertFrameHingePosition: 'left' | 'right' | undefined;
                          if (isInsertFrameWidth) {
                            // 사용자가 선택한 좌고정/우고정(기본 좌고정)을 우선 적용
                            const anchor = freshModule.insertFrameWidthAnchor ?? 'left';
                            const resizeHingePosition = resolveInsertFrameResizeHingePosition(freshModule, freshAll, freshSI);
                            insertFrameHingePosition = resizeHingePosition;
                            newX = calcInsertFrameResizedPositionX(
                              freshModule,
                              appliedWidth,
                              freshAll,
                              freshSI,
                              anchor
                            );
                          } else {
                            newX = freshModule.isFreePlacement
                              ? calcResizedPositionX(freshModule, val, freshAll, freshSI)
                              : freshModule.position.x;
                          }
                          updatePlacedModule(currentPlacedModule.id, {
                            freeWidth: appliedWidth,
                            moduleWidth: appliedWidth,
                            customWidth: appliedWidth,
                            ...(isInsertFrameWidth && insertFrameHingePosition ? { hingePosition: insertFrameHingePosition } : {}),
                            position: { ...freshModule.position, x: newX },
                            userResizedWidth: true, // 사용자가 직접 폭 변경 → 이동 시 자동 리사이즈 차단
                          } as any);
                          setFreeWidthInput(appliedWidth.toString());
                          const store = useFurnitureStore.getState();
                          const dims = {
                            width: appliedWidth,
                            height: placedBodyHeight,
                            depth: currentPlacedModule.freeDepth || moduleData.dimensions.depth,
                          };
                          if (isCustomizableModuleId(currentPlacedModule.moduleId)) {
                            const key = getCustomDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(key, dims);
                            if (key === 'full-dual') {
                              store.setLastCustomDimensions('full-single', { ...dims, width: Math.round(appliedWidth / 2) });
                            } else if (key === 'full-single') {
                              store.setLastCustomDimensions('full-dual', { ...dims, width: appliedWidth * 2 });
                            }
                          } else {
                            const stdKey = getStandardDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(stdKey, dims);
                            if (stdKey === 'std-dual-full') {
                              store.setLastCustomDimensions('std-single-full', { ...dims, width: Math.round(appliedWidth / 2) });
                            } else if (stdKey === 'std-single-full') {
                              store.setLastCustomDimensions('std-dual-full', { ...dims, width: appliedWidth * 2 });
                            } else if (stdKey === 'std-dual-upper') {
                              store.setLastCustomDimensions('std-single-upper', { ...dims, width: Math.round(appliedWidth / 2) });
                            } else if (stdKey === 'std-single-upper') {
                              store.setLastCustomDimensions('std-dual-upper', { ...dims, width: appliedWidth * 2 });
                            } else if (stdKey === 'std-dual-lower') {
                              store.setLastCustomDimensions('std-single-lower', { ...dims, width: Math.round(appliedWidth / 2) });
                            } else if (stdKey === 'std-single-lower') {
                              store.setLastCustomDimensions('std-dual-lower', { ...dims, width: appliedWidth * 2 });
                            }
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const isSlotMode = spaceInfo.layoutMode !== 'free-placement';
                          const isInsertFrameKey = typeof currentPlacedModule?.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame');
                          const isDummyWidth = typeof currentPlacedModule?.moduleId === 'string' && currentPlacedModule.moduleId.includes('dummy');
                          const freshMod = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule?.id);

                          if (isSlotMode && !isInsertFrameKey && currentPlacedModule && freshMod) {
                            // 슬롯 모드: adjustSlotWidth 사용
                            const curW = freshMod.slotCustomWidth ?? freshMod.customWidth ?? moduleData.dimensions.width;
                            const minWidth = isDummyWidth ? 100 : 200;
                            const next = Math.max(minWidth, curW + (e.key === 'ArrowUp' ? 1 : -1));
                            setFreeWidthInput(next.toString());
                            const { adjustSlotWidth } = useFurnitureStore.getState();
                            adjustSlotWidth(currentPlacedModule.id, next);
                          } else {
                            // 자유배치 모드 (또는 키큰장찬넬): 좌측 고정 / 우측으로만 확장
                            const curW = freshMod?.freeWidth || freshMod?.customWidth || parseInt(freeWidthInput, 10) || (currentPlacedModule?.freeWidth || moduleData.dimensions.width);
                            const minWidth = isInsertFrameKey ? 30 : 100;
                            const next = Math.max(minWidth, Math.min(3000, curW + (e.key === 'ArrowUp' ? 1 : -1)));
                            if (currentPlacedModule && freshMod) {
                              const freshAll = useFurnitureStore.getState().placedModules;
                              const freshSI = useSpaceConfigStore.getState().spaceInfo;
                              let appliedWidth = next;
                              let newX: number;
                              let insertFrameHingePosition: 'left' | 'right' | undefined;
                              if (isInsertFrameKey) {
                                // 사용자가 선택한 좌고정/우고정(기본 좌고정)을 우선 적용
                                const anchor = freshMod.insertFrameWidthAnchor ?? 'left';
                                const resizeHingePosition = resolveInsertFrameResizeHingePosition(freshMod, freshAll, freshSI);
                                insertFrameHingePosition = resizeHingePosition;
                                newX = calcInsertFrameResizedPositionX(
                                  freshMod,
                                  appliedWidth,
                                  freshAll,
                                  freshSI,
                                  anchor
                                );
                              } else {
                                newX = freshMod.isFreePlacement
                                  ? calcResizedPositionX(freshMod, next, freshAll, freshSI)
                                  : freshMod.position.x;
                              }
                              setFreeWidthInput(appliedWidth.toString());
                              updatePlacedModule(currentPlacedModule.id, {
                                freeWidth: appliedWidth,
                                moduleWidth: appliedWidth,
                                customWidth: appliedWidth,
                                ...(isInsertFrameKey && insertFrameHingePosition ? { hingePosition: insertFrameHingePosition } : {}),
                                position: { ...freshMod.position, x: newX },
                                userResizedWidth: true,
                              });
                            } else {
                              setFreeWidthInput(next.toString());
                            }
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="너비"
                      style={{ fontSize: '12px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                  {/* 키큰장찬넬(insert-frame): 폭 변경 시 좌고정/우고정 (기본 좌고정) */}
                  {(typeof currentPlacedModule.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame')) && (() => {
                    const anchor = currentPlacedModule.insertFrameWidthAnchor ?? 'left';
                    const setAnchor = (a: 'left' | 'right') => updatePlacedModule(currentPlacedModule.id, { insertFrameWidthAnchor: a } as any);
                    return (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <button
                          type="button"
                          style={{
                            flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                            background: anchor === 'left' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                            color: anchor === 'left' ? '#fff' : 'var(--theme-text-secondary)',
                            fontSize: '10px', cursor: 'pointer',
                          }}
                          onClick={() => setAnchor('left')}
                        >좌고정</button>
                        <button
                          type="button"
                          style={{
                            flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                            background: anchor === 'right' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                            color: anchor === 'right' ? '#fff' : 'var(--theme-text-secondary)',
                            fontSize: '10px', cursor: 'pointer',
                          }}
                          onClick={() => setAnchor('right')}
                        >우고정</button>
                      </div>
                    );
                  })()}
                </div>
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                {/* 높이 — 2단서랍장은 '몸통 높이'로만 조절, H는 읽기전용 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>
	                    H
                  </label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bodyHeightInputValue}
                      readOnly={isAutoBodyHeightInput}
                      onFocus={() => { freeHeightFocusedRef.current = true; }}
                      onChange={(e) => {
                        if (isAutoBodyHeightInput) return;
                        setFreeHeightInput(e.target.value);
                      }}
                      onBlur={() => {
                        if (isAutoBodyHeightInput) {
                          freeHeightFocusedRef.current = false;
                          setFreeHeightInput(bodyHeightInputValue);
                          return;
                        }
                        freeHeightFocusedRef.current = false;
                        const displayVal = parseInt(freeHeightInput, 10);
	                        const lowerBaseForInput = moduleData.category === 'lower' && currentPlacedModule?.hasBase !== false && spaceInfo.baseConfig?.type !== 'stand'
	                          ? (currentPlacedModule?.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 105))
	                          : 0;
	                        const maxHeightInput = (() => {
	                          if (moduleData.category === 'upper') return Math.round(spaceInfo.height);
	                          return 3000 + lowerBaseForInput;
	                        })();
	                        // 멍장(dummy)은 최소 300mm까지만 축소 가능
	                        const isDummyForMin = currentPlacedModule?.moduleId?.includes('dummy');
	                        const minHeightInput = (isDummyForMin ? 300 : 100) + lowerBaseForInput;
                        if (!isNaN(displayVal) && displayVal >= minHeightInput && displayVal <= maxHeightInput && currentPlacedModule) {
	                          // H 입력값은 실제 가구 몸통 높이다. 상단갭/상단몰딩 흡수분을 여기서 빼면
	                          // 2000 입력이 1735로 저장되어 상단몰딩이 560처럼 이중 확장된다.
	                          const absT = 0;
                          const absB = 0;
	                          let val = displayVal - absT - absB - lowerBaseForInput;
                          const bodySectionUpdate = buildFreePlacementBodyHeightSectionUpdate(val);
                          val = bodySectionUpdate.bodyHeight;
                          const updates: any = moduleData.category === 'upper'
                            ? { customHeight: val, freeHeight: undefined }
                            : { freeHeight: val };
                          if (bodySectionUpdate.sections) {
                            updates.customSections = bodySectionUpdate.sections;
                          }
                          updates.userResizedHeight = true;
                          // 2단서랍장: cabinetBodyHeight도 함께 저장 (렌더링이 우선 사용)
                          if (currentPlacedModule.moduleId?.includes('lower-drawer-2tier') || currentPlacedModule.moduleId?.includes('dual-lower-drawer-2tier')) {
                            updates.cabinetBodyHeight = val;
                          }
	                          // 키큰장 H 변경 시 남는 상부 공간은 토글 상태에 따라 몰딩 또는 갭으로 흡수한다.
	                          if (moduleData.category === 'full' && !isPlainShoeShelfModuleId(currentPlacedModule.moduleId)
	                              ) {
	                            const iSpace = calculateInternalSpace(spaceInfo);
	                            const originalH = iSpace.height; // 원래 내경 높이
	                            const globalTopFrame = spaceInfo.frameSize?.top || 30;
	                            if (currentPlacedModule.isFreePlacement) {
	                              updates.topFrameThickness = globalTopFrame;
	                            } else {
	                              const heightDiff = originalH - val; // 줄어든 만큼
	                              if (heightDiff > 0) {
	                                updates.topFrameThickness = globalTopFrame + heightDiff;
                              } else {
                                // 원래보다 크거나 같으면 상단몰딩 기본값
                                updates.topFrameThickness = Math.max(0, globalTopFrame + heightDiff);
	                              }
	                            }
	                          }
                          applyFullTopClearanceForBodyHeight(updates, currentPlacedModule, spaceInfo, moduleData.category, val);
	                          updatePlacedModule(currentPlacedModule.id, updates);
                          setFreeHeightInput((val + absT + absB + lowerBaseForInput).toString());
                          setSectionHeightInputs({}); // 섹션 높이 캐시 초기화 → 재계산
                          const store = useFurnitureStore.getState();
                          const dims = {
                            width: currentPlacedModule.freeWidth || moduleData.dimensions.width,
                            height: val,
                            depth: currentPlacedModule.freeDepth || moduleData.dimensions.depth,
                          };
                          if (isCustomizableModuleId(currentPlacedModule.moduleId)) {
                            const key = getCustomDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(key, dims);
                            if (key === 'full-dual') {
                              store.setLastCustomDimensions('full-single', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (key === 'full-single') {
                              store.setLastCustomDimensions('full-dual', { ...dims, width: dims.width * 2 });
                            }
                          } else {
                            const stdKey = getStandardDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(stdKey, dims);
                            if (stdKey === 'std-dual-full') {
                              store.setLastCustomDimensions('std-single-full', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-full') {
                              store.setLastCustomDimensions('std-dual-full', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-upper') {
                              store.setLastCustomDimensions('std-single-upper', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-upper') {
                              store.setLastCustomDimensions('std-dual-upper', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-lower') {
                              store.setLastCustomDimensions('std-single-lower', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-lower') {
                              store.setLastCustomDimensions('std-dual-lower', { ...dims, width: dims.width * 2 });
                            }
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (isAutoBodyHeightInput) return;
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          // Enter 시 직접 저장 처리 (blur 시점에 팝업이 닫히면 onBlur가 실행 안 될 수 있음)
                          const displayVal = parseInt(freeHeightInput, 10);
	                          const lowerBaseForInput = moduleData.category === 'lower' && currentPlacedModule?.hasBase !== false && spaceInfo.baseConfig?.type !== 'stand'
	                            ? (currentPlacedModule?.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 105))
	                            : 0;
	                          const maxHeightInput = (() => {
	                          if (moduleData.category === 'upper') return Math.round(spaceInfo.height);
	                          return 3000 + lowerBaseForInput;
	                        })();
	                          const isDummyForMinEnter = currentPlacedModule?.moduleId?.includes('dummy');
	                          const minHeightInputEnter = (isDummyForMinEnter ? 300 : 100) + lowerBaseForInput;
                          if (!isNaN(displayVal) && displayVal >= minHeightInputEnter && displayVal <= maxHeightInput && currentPlacedModule) {
	                            const absT = 0;
                            const absB = 0;
	                            let val = displayVal - absT - absB - lowerBaseForInput;
                            const bodySectionUpdate = buildFreePlacementBodyHeightSectionUpdate(val);
                            val = bodySectionUpdate.bodyHeight;
                            const updates: any = moduleData.category === 'upper'
                              ? { customHeight: val, freeHeight: undefined }
                              : { freeHeight: val };
                            if (bodySectionUpdate.sections) {
                              updates.customSections = bodySectionUpdate.sections;
                            }
                            updates.userResizedHeight = true;
                            if (moduleData.category === 'full' && !isPlainShoeShelfModuleId(currentPlacedModule.moduleId)
                                ) {
                              const iSpace = calculateInternalSpace(spaceInfo);
                              const globalTopFrame = spaceInfo.frameSize?.top || 30;
                              updates.topFrameThickness = currentPlacedModule.isFreePlacement
                                ? globalTopFrame
                                : Math.max(0, globalTopFrame + (iSpace.height - val));
                            }
                            applyFullTopClearanceForBodyHeight(updates, currentPlacedModule, spaceInfo, moduleData.category, val);
                            // 2단서랍장: cabinetBodyHeight도 함께 저장
                            if (currentPlacedModule.moduleId?.includes('lower-drawer-2tier') || currentPlacedModule.moduleId?.includes('dual-lower-drawer-2tier')) {
                              updates.cabinetBodyHeight = val;
                            }
                            // 동기화 useEffect가 store stale 값으로 덮어쓰지 않도록 focused 유지 후 store 업데이트
                            freeHeightFocusedRef.current = true;
                            updatePlacedModule(currentPlacedModule.id, updates);
                            setFreeHeightInput((val + absT + absB + lowerBaseForInput).toString());
                            setSectionHeightInputs({});
                            // 다음 tick에 focused 해제 (store 업데이트 반영 후)
                            setTimeout(() => { freeHeightFocusedRef.current = false; }, 50);
                          }
                          // blur() 호출 제거: input focus 유지 → useEffect 동기화 skip
                        }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
	                          const lowerBaseForInput = moduleData.category === 'lower' && currentPlacedModule?.hasBase !== false && spaceInfo.baseConfig?.type !== 'stand'
	                            ? (currentPlacedModule?.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 105))
	                            : 0;
	                          const cur = parseInt(freeHeightInput, 10) || (placedBodyHeight + lowerBaseForInput) || (moduleData.dimensions.height + lowerBaseForInput);
	                          const maxHeightInput = (() => {
	                          if (moduleData.category === 'upper') return Math.round(spaceInfo.height);
	                          return 3000 + lowerBaseForInput;
	                        })();
	                          const isDummyForMinArrow = currentPlacedModule?.moduleId?.includes('dummy');
	                          const minHeightInputArrow = (isDummyForMinArrow ? 300 : 100) + lowerBaseForInput;
                          const nextDisplay = Math.max(minHeightInputArrow, Math.min(maxHeightInput, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          setFreeHeightInput(nextDisplay.toString());
                          if (currentPlacedModule) {
	                            const absT = 0;
                            const absB = 0;
	                            let next = nextDisplay - absT - absB - lowerBaseForInput;
                            const bodySectionUpdate = buildFreePlacementBodyHeightSectionUpdate(next);
                            next = bodySectionUpdate.bodyHeight;
                            const arrowUpdates: any = moduleData.category === 'upper'
                              ? { customHeight: next, freeHeight: undefined }
                              : { freeHeight: next };
                            if (bodySectionUpdate.sections) {
                              arrowUpdates.customSections = bodySectionUpdate.sections;
                            }
                            arrowUpdates.userResizedHeight = true;
                            if (moduleData.category === 'full' && !isPlainShoeShelfModuleId(currentPlacedModule.moduleId)
                                ) {
                              const iSpace = calculateInternalSpace(spaceInfo);
                              const globalTopFrame = spaceInfo.frameSize?.top || 30;
                              arrowUpdates.topFrameThickness = currentPlacedModule.isFreePlacement
                                ? globalTopFrame
                                : Math.max(0, globalTopFrame + (iSpace.height - next));
                            }
                            applyFullTopClearanceForBodyHeight(arrowUpdates, currentPlacedModule, spaceInfo, moduleData.category, next);
                            if (currentPlacedModule.moduleId?.includes('lower-drawer-2tier') || currentPlacedModule.moduleId?.includes('dual-lower-drawer-2tier')) {
                              arrowUpdates.cabinetBodyHeight = next;
                            }
                            updatePlacedModule(currentPlacedModule.id, arrowUpdates);
                            setFreeHeightInput((next + absT + absB + lowerBaseForInput).toString());
                            setSectionHeightInputs({}); // 섹션 높이 캐시 초기화
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="높이"
                      style={{ fontSize: '12px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                {/* 깊이 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>D</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeDepthInput}
                      onChange={(e) => setFreeDepthInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeDepthInput, 10);
                        const isLowerDrawer = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                        const minDepth = isLowerDrawer ? 400 : 100;
                        if (!isNaN(val) && val >= minDepth && val <= 1200 && currentPlacedModule) {
                          applyBodyDepthChange(val, true);
                          const store = useFurnitureStore.getState();
                          const dims = {
                            width: currentPlacedModule.freeWidth || moduleData.dimensions.width,
                            height: placedBodyHeight,
                            depth: val,
                          };
                          if (isCustomizableModuleId(currentPlacedModule.moduleId)) {
                            const key = getCustomDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(key, dims);
                            if (key === 'full-dual') {
                              store.setLastCustomDimensions('full-single', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (key === 'full-single') {
                              store.setLastCustomDimensions('full-dual', { ...dims, width: dims.width * 2 });
                            }
                          } else {
                            const stdKey = getStandardDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(stdKey, dims);
                            // 모듈ID별 키도 함께 저장 (도어분절 팬트리장 등 카테고리 공유 가구 분리)
                            const moduleSpecificKey = currentPlacedModule.moduleId.replace(/-[\d.]+$/, '');
                            store.setLastCustomDimensions(moduleSpecificKey, dims);
                            if (stdKey === 'std-dual-full') {
                              store.setLastCustomDimensions('std-single-full', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-full') {
                              store.setLastCustomDimensions('std-dual-full', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-upper') {
                              store.setLastCustomDimensions('std-single-upper', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-upper') {
                              store.setLastCustomDimensions('std-dual-upper', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-lower') {
                              store.setLastCustomDimensions('std-single-lower', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-lower') {
                              store.setLastCustomDimensions('std-dual-lower', { ...dims, width: dims.width * 2 });
                            }
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = parseInt(freeDepthInput, 10) || (currentPlacedModule?.freeDepth || moduleData.dimensions.depth);
                          const isLowerDrawerArrow = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                          const minDepthArrow = isLowerDrawerArrow ? 400 : 100;
                          const next = Math.max(minDepthArrow, Math.min(1200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          setFreeDepthInput(next.toString());
                          if (currentPlacedModule) {
                            applyBodyDepthChange(next, true);
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="깊이"
                      style={{ fontSize: '12px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                  {/* 뒤고정/앞고정 토글 — 깊이 변경 시 상/하부 섹션 direction 동기화 */}
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button
                      type="button"
                      style={{
                        flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: lowerDepthDirection === 'front' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                        color: lowerDepthDirection === 'front' ? '#fff' : 'var(--theme-text-secondary)',
                        fontSize: '10px', cursor: 'pointer',
                      }}
                      onClick={() => applyLowerCabinetDepthDirection('front')}
                    >뒤고정</button>
                    <button
                      type="button"
                      style={{
                        flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: lowerDepthDirection === 'back' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                        color: lowerDepthDirection === 'back' ? '#fff' : 'var(--theme-text-secondary)',
                        fontSize: '10px', cursor: 'pointer',
                      }}
                      onClick={() => applyLowerCabinetDepthDirection('back')}
                    >앞고정</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 섹션별 치수 설정 (2섹션 이상 가구: customConfig 또는 modelConfig) — 편집 탭 전용 */}
          {!showDetails && currentPlacedModule && (() => {
            const cc = currentPlacedModule.customConfig;
            const ccSections = cc?.sections;
            // 사용자가 customSections로 직접 갱신한 경우 우선 (팬트리장 하부 섹션 변경 등)
            const userCustomSections = (currentPlacedModule as any).customSections;
            const mcSections = (Array.isArray(userCustomSections) && userCustomSections.length >= 2)
              ? userCustomSections
              : moduleData?.modelConfig?.sections;
            const hasSections = (ccSections && ccSections.length >= 2) || (mcSections && mcSections.length >= 2);
            if (!hasSections) return null;

            // 섹션 소스 결정: customConfig 우선, 없으면 modelConfig
            const isCustom = !!(ccSections && ccSections.length >= 2);
            const sectionCount = isCustom ? ccSections!.length : mcSections!.length;
            const pt = isCustom ? (cc!.panelThickness || 18) : (moduleData?.modelConfig?.basicThickness || 18);
            const totalH = placedBodyHeight || moduleData?.dimensions?.height || 2200;
            // 몸통치수 W와 동일한 우선순위 사용 — slotCustomWidth(슬롯 실폭) 누락 시
            // 섹션 너비가 모듈 기본폭(600)으로 표시되어 몸통(599.5)과 어긋난다.
            const totalW = currentPlacedModule.freeWidth
              ?? currentPlacedModule.adjustedWidth
              ?? currentPlacedModule.slotCustomWidth
              ?? currentPlacedModule.customWidth
              ?? moduleData?.dimensions?.width
              ?? 600;
            const totalD = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || moduleData?.dimensions?.depth || 580;

            // 표준 가구의 섹션 높이: 마지막(상부) 섹션이 프레임 토글 흡수분을 먹되,
            // 상/하부 섹션 합은 팝업의 몸통치수 H와 같아야 한다.
            // 상부장은 천장/바닥과 무관 → 흡수 적용 안 함 (full/lower만)
            const shouldAbsorbTopForSections = moduleData?.category === 'full';
            const absorbedTopForSections = shouldAbsorbTopForSections && currentPlacedModule.hasTopFrame === false
              ? Math.max(0, (currentPlacedModule.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30) - (currentPlacedModule.topFrameGap ?? 0))
              : 0;
            const isPlainShoeShelfForSections = !isCustom
              && !!mcSections
              && usesStableShelfSectionBoundary(currentPlacedModule.moduleId);
            const rawSectionBasisH = Math.max(0, totalH + absorbedTopForSections);
            const sectionBasisH = isPlainShoeShelfForSections
              ? getRenderedSectionBasisHeight(currentPlacedModule, spaceInfo, rawSectionBasisH)
              : rawSectionBasisH;
            const plainShoeShelfSectionHeights = isPlainShoeShelfForSections && mcSections
              ? getPlainShoeShelfSectionHeights(currentPlacedModule, spaceInfo, mcSections, sectionBasisH)
              : null;

            const getStdSectionHeightMM = (sIdx: number): number => {
              if (!mcSections || mcSections.length < 2) return totalH;
              const sec = mcSections[sIdx];
              const ht = sec.heightType || 'percentage';
              const isLast = sIdx === mcSections.length - 1;
              if (isLast) {
                // 마지막(상부) 섹션 = sectionBasisH - 이전 섹션 합
                const fixedSum = mcSections.slice(0, -1).reduce((acc, s) => {
                  if (s.heightType === 'absolute') return acc + (s.height || 0);
                  const r = (s.height || s.heightRatio || 50) / 100;
                  return acc + Math.round(sectionBasisH * r);
                }, 0);
                return Math.max(0, sectionBasisH - fixedSum);
              }
              if (ht === 'absolute') return sec.height || 0;
              const ratio = (sec.height || sec.heightRatio || 50) / 100;
              return Math.round(sectionBasisH * ratio);
            };

            return (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>섹션별 치수</h5>
              {Array.from({ length: sectionCount }).map((_, i) => sectionCount - 1 - i).map((sIdx) => {
                const sec = isCustom ? ccSections![sIdx] : mcSections![sIdx];
                const sectionLabel = sectionCount === 2
                  ? (sIdx === 0 ? '하부' : '상부')
                  : `섹션 ${sIdx + 1}`;
                const hasHS = isCustom && !!(sec as any).horizontalSplit;

                // 높이 표시값 — 마지막(상부) 섹션은 항상 동적 재계산 (토글 흡수분 반영)
                // isCustom이어도 마지막 섹션은 sectionBasisH - 이전합으로 계산해야
                // 상부몰딩/걸레받이 토글 변경 시 흡수된 높이가 즉시 반영됨
                const isLastSection = sIdx === sectionCount - 1;
                const isPantryOrPullOutSection = isPullOutOrPantry && !isCustom;
                const dynamicH = plainShoeShelfSectionHeights
                  ? (plainShoeShelfSectionHeights[sIdx] ?? 0)
                  : isPantryOrPullOutSection
                  ? ((sec as any).height || getStdSectionHeightMM(sIdx))
                  : isLastSection
                  ? (() => {
                      const fixedSum = (isCustom ? ccSections! : mcSections!)
                        .slice(0, -1)
                        .reduce((acc: number, s: any) => {
                          if (s.heightType === 'absolute') return acc + (s.height || 0);
                          const r = (s.height || s.heightRatio || 50) / 100;
                          return acc + Math.round(sectionBasisH * r);
                        }, 0);
                      return Math.max(0, sectionBasisH - fixedSum);
                    })()
                  : (isCustom
                      ? ((sec as any).height + 2 * pt)
                      : getStdSectionHeightMM(sIdx));
                const renderedDisplayH = Math.round(dynamicH).toString();
                const displayH = sectionHeightFocusedIndex === sIdx
                  ? (sectionHeightInputs[sIdx] ?? renderedDisplayH)
                  : renderedDisplayH;
                // 깊이 표시값: 섹션별 저장값 우선, 없으면 customDepth(신발장 380 등), 최후 totalD
                // 옛 데이터의 stale 값(moduleDim과 일치) 무시
                const cDepth = currentPlacedModule.customDepth;
                const _isShoeCat3 =
                  currentPlacedModule.moduleId.includes('-entryway-') ||
                  currentPlacedModule.moduleId.includes('-shelf-') ||
                  currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
                  currentPlacedModule.moduleId.includes('-2drawer-shelf-');
                const _modDimD = moduleData.dimensions.depth;
                const _hasCustomD = typeof cDepth === 'number' && cDepth > 0;
                const _validSec = (v: number | undefined) =>
                  (_isShoeCat3 && _hasCustomD && v === _modDimD) ? undefined : v;
                const secStored = sIdx === 0
                  ? _validSec(currentPlacedModule.lowerSectionDepth)
                  : _validSec(currentPlacedModule.upperSectionDepth);
                const displayD = sectionDepthInputs[sIdx]
                  || (secStored !== undefined
                    ? Math.round(secStored).toString()
                    : (cDepth !== undefined
                      ? Math.round(cDepth).toString()
                      : Math.round(totalD).toString()));
                // 너비 표시값
                const displayW = sectionWidthInputs[sIdx]
                  || (() => { const v = Math.round(((sec as any).width || totalW) * 10) / 10; return v % 1 === 0 ? v.toString() : v.toFixed(1); })();

                return (
                  <div
                    key={sIdx}
                    onMouseEnter={() => currentPlacedModule && setHighlightedSection(`${currentPlacedModule.id}-${sIdx}`)}
                    onMouseLeave={() => setHighlightedSection(null)}
                    style={{
                      background: 'var(--theme-background)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: '5px',
                      padding: '6px 8px',
                      marginBottom: sIdx < sectionCount - 1 ? '6px' : 0,
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--theme-text)', marginBottom: '4px' }}>
                      {sectionLabel}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {/* 섹션 너비 — 기둥 침범이 있는 슬롯 모드에서는 섹션별 너비 편집 + 좌/우고정 방향 */}
                      {(() => {
                        const hasColumnIntrusion =
                          spaceInfo.layoutMode !== 'free-placement' &&
                          (currentPlacedModule.adjustedWidth !== undefined && currentPlacedModule.adjustedWidth !== null);
                        const isLowerSec = sIdx === 0;
                        const isUpperSec = sIdx === 1;
                        const sectionWidthVal = isLowerSec
                          ? lowerWidthInput
                          : isUpperSec
                            ? upperWidthInput
                            : displayW;
                        const setSectionWidthVal = isLowerSec
                          ? setLowerWidthInput
                          : setUpperWidthInput;
                        const widthDir = isLowerSec ? lowerWidthDirection : upperWidthDirection;
                        const setWidthDir = isLowerSec ? setLowerWidthDirection : setUpperWidthDirection;
                        const widthField = isLowerSec ? 'lowerSectionWidth' : 'upperSectionWidth';
                        const widthDirField = isLowerSec ? 'lowerSectionWidthDirection' : 'upperSectionWidthDirection';
                        const baseAdjW = currentPlacedModule.adjustedWidth || currentPlacedModule.customWidth || totalW;

                        const commitWidth = (raw: string) => {
                          const v = parseInt(raw, 10);
                          if (isNaN(v) || v < 100 || v > 2400) {
                            setSectionWidthVal(Math.round(baseAdjW).toString());
                            return;
                          }
                          updatePlacedModule(currentPlacedModule.id, { [widthField]: v } as any);
                        };

                        return (
                      <div style={{ flex: 1, minWidth: '70px' }}>
                        <label style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', display: 'block', lineHeight: 1 }}>너비</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text" inputMode="numeric"
                            value={hasColumnIntrusion ? sectionWidthVal : displayW}
                            disabled={spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion}
                            onChange={(e) => {
                              if (hasColumnIntrusion) setSectionWidthVal(e.target.value);
                              else setSectionWidthInputs(prev => ({ ...prev, [sIdx]: e.target.value }));
                            }}
                            onBlur={() => {
                              if (hasColumnIntrusion) {
                                commitWidth(sectionWidthVal);
                                return;
                              }
                              // 너비 변경 → 전체 가구 너비 변경 (모든 섹션 연동)
                              const val = parseInt(sectionWidthInputs[sIdx] || displayW, 10);
                              if (!isNaN(val) && val >= 100 && val <= 2400) {
                                const fm = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
                                const fa = useFurnitureStore.getState().placedModules;
                                const freshSI = useSpaceConfigStore.getState().spaceInfo;
                                // 키큰장찬넬(insert-frame)은 채움재 → 좌고정/우고정(기본 좌고정) 면 고정 리사이즈
                                const isInsertFrameSec = typeof fm.moduleId === 'string' && fm.moduleId.includes('insert-frame');
                                const newX = isInsertFrameSec
                                  ? calcInsertFrameResizedPositionX(fm, val, fa, freshSI, fm.insertFrameWidthAnchor ?? 'left')
                                  : calcResizedPositionX(fm, val, fa, freshSI);
                                const updates: any = {
                                  freeWidth: val,
                                  moduleWidth: val,
                                  position: { ...fm.position, x: newX },
                                  userResizedWidth: true,
                                };
                                if (isCustom) {
                                  const newSecs = cc!.sections.map((s: any) => ({ ...s, width: val }));
                                  updates.customConfig = { ...cc!, sections: newSecs };
                                }
                                updatePlacedModule(currentPlacedModule.id, updates);
                          setFreeWidthInput(val.toString());
                                const wInputs: Record<number, string> = {};
                                for (let i = 0; i < sectionCount; i++) wInputs[i] = val.toString();
                                setSectionWidthInputs(wInputs);
                              } else {
                                setSectionWidthInputs(prev => ({ ...prev, [sIdx]: Math.round(totalW).toString() }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (hasColumnIntrusion) {
                                  const cur = parseInt(sectionWidthVal, 10) || Math.round(baseAdjW);
                                  const next = Math.max(100, Math.min(2400, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                  setSectionWidthVal(next.toString());
                                  updatePlacedModule(currentPlacedModule.id, { [widthField]: next } as any);
                                  return;
                                }
                                const fm2 = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
                                const curW2 = fm2.freeWidth || parseInt(displayW, 10) || Math.round(totalW);
                                const next = Math.max(100, Math.min(2400, curW2 + (e.key === 'ArrowUp' ? 1 : -1)));
                                setSectionWidthInputs(prev => ({ ...prev, [sIdx]: next.toString() }));
                                const fa2 = useFurnitureStore.getState().placedModules;
                                const freshSI2 = useSpaceConfigStore.getState().spaceInfo;
                                // 키큰장찬넬(insert-frame)은 채움재 → 좌고정/우고정(기본 좌고정) 면 고정 리사이즈
                                const isInsertFrameSec2 = typeof fm2.moduleId === 'string' && fm2.moduleId.includes('insert-frame');
                                const newX = isInsertFrameSec2
                                  ? calcInsertFrameResizedPositionX(fm2, next, fa2, freshSI2, fm2.insertFrameWidthAnchor ?? 'left')
                                  : calcResizedPositionX(fm2, next, fa2, freshSI2);
                                const updates: any = { freeWidth: next, moduleWidth: next, position: { ...fm2.position, x: newX }, userResizedWidth: true };
                                if (isCustom) {
                                  const newSecs = cc!.sections.map((s: any) => ({ ...s, width: next }));
                                  updates.customConfig = { ...cc!, sections: newSecs };
                                }
                                updatePlacedModule(currentPlacedModule.id, updates);
                                setFreeWidthInput(next.toString());
                              }
                            }}
                            className={styles.depthInput}
                            style={{
                              color: (spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion) ? '#999' : '#000',
                              backgroundColor: (spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion) ? '#f0f0f0' : '#fff',
                              WebkitTextFillColor: (spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion) ? '#999' : '#000',
                              opacity: 1,
                            }}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                        {/* 좌고정/우고정 (기둥 침범 시에만 표시) */}
                        {hasColumnIntrusion && sectionCount === 2 && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: widthDir === 'left' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: widthDir === 'left' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setWidthDir('left');
                                updatePlacedModule(currentPlacedModule.id, { [widthDirField]: 'left' } as any);
                              }}
                            >좌고정</button>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: widthDir === 'right' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: widthDir === 'right' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setWidthDir('right');
                                updatePlacedModule(currentPlacedModule.id, { [widthDirField]: 'right' } as any);
                              }}
                            >우고정</button>
                          </div>
                        )}
                      </div>
                        );
                      })()}
                      {/* 섹션 높이 — 표준 가구: 마지막(상부) 섹션만 편집 가능 (전체 높이 역계산), 커스텀: 모두 편집 가능
                          단, 팬트리장/인출장은 모든 섹션 편집 가능 (하부 변경 시 상부 자동 동기화) */}
                      {(() => {
                        // 표준 가구에서 마지막 섹션(상부=가변)만 편집 가능
                        const isLastSection = sIdx === sectionCount - 1;
                        const isFreePlacementStandard = !isCustom && !!currentPlacedModule.isFreePlacement && sectionCount >= 2;
                        const isStdEditable = !isCustom && isLastSection && sectionCount >= 2;
                        const isPantryOrPullOut = isPullOutOrPantry;
                        const canEdit = isPlainShoeShelfForSections
                          ? sectionCount === 2
                          : (isCustom || isFreePlacementStandard || isStdEditable || (isPantryOrPullOut && sectionCount >= 2));
                        return (
                      <div style={{ flex: 1, minWidth: '70px' }}>
                        <label style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', display: 'block', lineHeight: 1 }}>높이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text" inputMode="numeric"
                            value={displayH}
                            onFocus={() => {
                              setSectionHeightFocusedIndex(sIdx);
                              setSectionHeightInputs(prev => ({ ...prev, [sIdx]: prev[sIdx] ?? renderedDisplayH }));
                            }}
                            onChange={(e) => setSectionHeightInputs(prev => ({ ...prev, [sIdx]: e.target.value }))}
                            onBlur={() => {
                              setSectionHeightFocusedIndex(null);
                              if (isPlainShoeShelfForSections && mcSections && plainShoeShelfSectionHeights) {
                                const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
                                if (isNaN(inputVal) || inputVal < 100) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                const fixedSectionBasisH = plainShoeShelfSectionHeights.reduce((sum, h) => sum + h, 0);
                                const isLowerSectionInput = sIdx === 0;
                                const minUpperSectionH = 100;
                                const currentLowerEffectiveH = plainShoeShelfSectionHeights[0] ?? 0;
                                const maxInputVal = isLowerSectionInput
                                  ? Math.max(100, fixedSectionBasisH - minUpperSectionH)
                                  : Math.max(100, fixedSectionBasisH - currentLowerEffectiveH);
                                const nextInputVal = Math.min(inputVal, maxInputVal);
                                const wasClamped = nextInputVal !== inputVal;
                                const nextEffectiveHeights = [...plainShoeShelfSectionHeights];
                                if (isLowerSectionInput) {
                                  nextEffectiveHeights[0] = nextInputVal;
                                  nextEffectiveHeights[1] = Math.max(minUpperSectionH, fixedSectionBasisH - nextInputVal);
                                } else {
                                  nextEffectiveHeights[0] = currentLowerEffectiveH;
                                  nextEffectiveHeights[1] = nextInputVal;
                                }
                                const isShelfSplitSectionInput = isShelfSplitModuleId(currentPlacedModule.moduleId);
                                const { baseAbsorbedMm, floatAbsorbedMm, baseFrameDeltaMm } = getStableShelfSectionOffsets(currentPlacedModule, spaceInfo);
                                const canonicalLowerH = isShelfSplitSectionInput
                                  ? Math.max(0, Math.round(nextEffectiveHeights[0]))
                                  : Math.max(0, Math.round(nextEffectiveHeights[0] - baseAbsorbedMm + floatAbsorbedMm + baseFrameDeltaMm));
                                const canonicalUpperH = Math.max(0, Math.round(nextEffectiveHeights[1]));
                                const effectiveHeightsForShelves = [nextEffectiveHeights[0], nextEffectiveHeights[1]];
                                const newSections = mcSections.map((s: any, idx: number) => {
                                  const nextH = idx === 0 ? canonicalLowerH : canonicalUpperH;
                                  const updated: any = { ...s, height: nextH };
                                  if ((s.type === 'shelf' || s.type === 'open') && (s.count > 0 || (Array.isArray(s.shelfPositions) && s.shelfPositions.length > 0))) {
                                    const shelfCount = s.count || (s.shelfPositions?.length ?? 0);
                                    const innerH = Math.max(0, effectiveHeightsForShelves[idx] - 2 * pt);
                                    updated.shelfPositions = calculateEvenShelfPositions(innerH, shelfCount, pt);
                                  }
                                  return updated;
                                });
                                const sectionUpdates: any = { customSections: newSections };
                                if (isShelfSplitSectionInput) {
                                  if (isLowerSectionInput) {
                                    sectionUpdates.lowerDoorHingePositionsMm = undefined;
                                    sectionUpdates.upperDoorHingePositionsMm = undefined;
                                  } else {
                                    sectionUpdates.upperDoorHingePositionsMm = undefined;
                                  }
                                }
                                updatePlacedModule(currentPlacedModule.id, sectionUpdates);
                                if (wasClamped) {
                                  showAlert(
                                    `상하부섹션과 상단몰딩, 걸레받이의 합은 공간높이를 초과할 수 없습니다. 가능한 최대값 ${maxInputVal}으로 변경했습니다.`,
                                    { title: '치수 변경 불가' }
                                  );
                                }
                                setSectionHeightInputs({});
                              } else if (isCustom) {
                                handleSectionHeightBlur(sIdx);
                              } else if (isFreePlacementStandard && mcSections) {
                                // 자유배치 표준 가구: 몸통 H는 고정하고, 변경한 섹션의 반대쪽 섹션이 흡수한다.
                                const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
                                if (isNaN(inputVal) || inputVal < 100) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                const basicThickness = moduleData?.modelConfig?.basicThickness || 18;
                                const nextSections = buildOppositeAbsorbedStandardSections(
                                  mcSections,
                                  sectionBasisH,
                                  sIdx,
                                  inputVal,
                                  basicThickness
                                );
                                if (!nextSections) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                updatePlacedModule(currentPlacedModule.id, { customSections: nextSections } as any);
                                setSectionHeightInputs({});
                              } else if (isPantryOrPullOut && mcSections) {
                                // 팬트리장/인출장: 전체 몸통 H 고정, 변경한 섹션의 반대쪽 섹션이 흡수한다.
                                const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
                                if (isNaN(inputVal) || inputVal < 100) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                const totalH = placedBodyHeight || moduleData.dimensions.height;
                                const basicThickness = (spaceInfo as any).panelThickness || 18;
                                // 변경된 섹션 height 적용 + 변경된 섹션이 shelf면 shelfPositions 재배치
                                const tentative = mcSections.map((s: any, idx: number) => {
                                  if (idx !== sIdx) return s;
                                  const updated: any = { ...s, height: inputVal };
                                  if ((s.type === 'shelf' || s.type === 'open') && (s.count > 0 || (Array.isArray(s.shelfPositions) && s.shelfPositions.length > 0))) {
                                    const shelfCount = s.count || (s.shelfPositions?.length ?? 0);
                                    const innerH = Math.max(0, inputVal - 2 * basicThickness);
                                    updated.shelfPositions = calculateEvenShelfPositions(innerH, shelfCount, basicThickness);
                                  }
                                  return updated;
                                });
                                const absorbTarget = sIdx === 0 ? mcSections.length - 1 : 0;
                                const otherSum = tentative
                                  .filter((_: any, idx: number) => idx !== absorbTarget)
                                  .reduce((sum: number, s: any) => sum + (s.height || 0), 0);
                                const newAbsorbH = totalH - otherSum;
                                if (newAbsorbH < 100) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                const newSections = tentative.map((s: any, idx: number) => {
                                  if (idx !== absorbTarget) return s;
                                  const updated: any = { ...s, height: newAbsorbH };
                                  if ((s.type === 'shelf' || s.type === 'open') && (s.count > 0 || (Array.isArray(s.shelfPositions) && s.shelfPositions.length > 0))) {
                                    const shelfCount = s.count || (s.shelfPositions?.length ?? 0);
                                    const innerH = Math.max(0, newAbsorbH - 2 * basicThickness);
                                    updated.shelfPositions = calculateEvenShelfPositions(innerH, shelfCount, basicThickness);
                                  }
                                  return updated;
                                });
                                updatePlacedModule(currentPlacedModule.id, { customSections: newSections } as any);
                                setSectionHeightInputs({});
                              } else if (isStdEditable && mcSections) {
                                // 표준 가구 마지막(상부) 섹션 높이 변경 → 전체 높이 역계산
                                const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
                                if (isNaN(inputVal) || inputVal < 100) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                // 하부 고정 섹션 합 + 패널 두께 → 전체 높이 역계산
                                const prevFixed = mcSections
                                  .filter((_: any, idx: number) => idx < sIdx)
                                  .reduce((sum: number, s: any) => sum + ((s.heightType === 'absolute' ? s.height : 0) || 0), 0);
                                // 역계산: 상부 = sec.height + (totalH - dimH)
                                // → totalH = inputVal - sec.height + dimH  (단, sec.height는 원래 모듈의 상부 높이)
                                // 더 단순하게: newTotalH = prevFixed + inputVal (하부+상부 = 전체)
                                const newTotalH = prevFixed + inputVal;
                                const clampedH = Math.max(300, Math.min(3000, newTotalH));
                                const secUpdates: any = { freeHeight: clampedH, userResizedHeight: true };
                                // 키큰장: 상단몰딩도 연동
                                if (moduleData.category === 'full' && !isPlainShoeShelfModuleId(currentPlacedModule.moduleId)) {
                                  const iSpace = calculateInternalSpace(spaceInfo);
                                  const globalTopFrame = spaceInfo.frameSize?.top || 30;
                                  secUpdates.topFrameThickness = currentPlacedModule.isFreePlacement
                                    ? globalTopFrame
                                    : Math.max(0, globalTopFrame + (iSpace.height - clampedH));
                                }
                                applyFullTopClearanceForBodyHeight(secUpdates, currentPlacedModule, spaceInfo, moduleData.category, clampedH);
                                updatePlacedModule(currentPlacedModule.id, secUpdates);
                                setFreeHeightInput(clampedH.toString());
                                setSectionHeightInputs({});
                              } else {
                                setSectionHeightInputs(prev => ({ ...prev, [sIdx]: displayH }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                              else if (canEdit && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                e.preventDefault();
                                const cur = parseInt(displayH, 10) || 0;
                                const next = Math.max(100, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                setSectionHeightInputs(prev => ({ ...prev, [sIdx]: next.toString() }));
                              }
                            }}
                            className={styles.depthInput}
                            readOnly={!canEdit}
                            style={{
                              color: '#000', backgroundColor: canEdit ? '#fff' : '#f5f5f5',
                              WebkitTextFillColor: '#000', opacity: canEdit ? 1 : 0.7,
                              cursor: canEdit ? 'text' : 'default',
                            }}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                        );
                      })()}
                      {/* 섹션 깊이 (2섹션 가구 + 인출장/팬트리장 N섹션 한정) */}
                      {(sectionCount === 2 || isPullOutOrPantry) && (() => {
                        // 인출장/팬트리장: sectionDepths 배열 사용 (각 섹션 독립)
                        const sectionDepths = (currentPlacedModule as any)?.sectionDepths as number[] | undefined;
                        const sectionDirs = (currentPlacedModule as any)?.sectionDepthDirections as ('front'|'back')[] | undefined;
                        const moduleDefaultDepth = moduleData?.dimensions.depth || 600;
                        const sectionDepthVal = isPullOutOrPantry
                          ? (sectionDepths?.[sIdx] ?? currentPlacedModule?.customDepth ?? moduleDefaultDepth).toString()
                          : '';
                        const sectionDirVal = isPullOutOrPantry
                          ? (sectionDirs?.[sIdx] ?? 'front')
                          : 'front';
                        // 2섹션 가구: 기존 매핑 사용
                        // N섹션 가구: 마지막 섹션을 "상부"로 매핑, 그 외 모든 섹션은 "하부" 사용
                        const isLowerSec = sIdx < sectionCount - 1;
                        const onSectionDepthChange = (val: string) => {
                          if (isPullOutOrPantry && currentPlacedModule) {
                            const numV = parseInt(val);
                            if (!isNaN(numV) && numV > 0) {
                              const arr = [...(sectionDepths ?? new Array(sectionCount).fill(moduleDefaultDepth))];
                              arr[sIdx] = numV;
                              const maxSectionDepth = Math.max(...arr);
                              // 마지막 섹션 변경 시 upperSectionDepth도 동기화 (Room/CleanCAD2D 등 다른 가구 인터페이스와 호환)
                              const updates: any = {
                                sectionDepths: arr,
                                customDepth: maxSectionDepth,
                                endPanelDepth: maxSectionDepth,
                              };
                              if (sIdx === sectionCount - 1) {
                                updates.upperSectionDepth = numV;
                              } else if (sIdx === 0) {
                                updates.lowerSectionDepth = numV;
                              }
                              updatePlacedModule(currentPlacedModule.id, updates);
                              refreshLowerFrontFixedGaps(currentPlacedModule.id, maxSectionDepth, updates);
                            }
                          } else {
                            (isLowerSec ? handleLowerDepthChange : handleUpperDepthChange)(val);
                          }
                        };
                        const depthVal = isPullOutOrPantry ? sectionDepthVal : (isLowerSec ? lowerDepthInput : upperDepthInput);
                        const onDepthChange = onSectionDepthChange;
                        const dir = isPullOutOrPantry ? sectionDirVal : (isLowerSec ? lowerDepthDirection : upperDepthDirection);
                        const setDir = isPullOutOrPantry
                          ? (newDir: 'front' | 'back') => {
                              if (currentPlacedModule) {
                                const arr = [...(sectionDirs ?? new Array(sectionCount).fill('front'))];
                                arr[sIdx] = newDir;
                                updatePlacedModule(currentPlacedModule.id, { sectionDepthDirections: arr } as any);
                              }
                            }
                          : (isLowerSec ? setLowerDepthDirection : setUpperDepthDirection);
                        const dirField = isLowerSec ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                        return (
                        <div style={{ flex: 1, minWidth: '70px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', display: 'block', lineHeight: 1 }}>깊이</label>
                          <div className={styles.inputWithUnit}>
                            <input
                              type="text" inputMode="numeric"
                              value={depthVal}
                              onChange={(e) => onDepthChange(e.target.value)}
                              onFocus={() => currentPlacedModule && setHighlightedSection(`${currentPlacedModule.id}-${sIdx}`)}
                              onBlur={() => setHighlightedSection(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = parseInt(depthVal, 10) || 0;
                                  const next = Math.max(100, Math.min(1200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                  onDepthChange(next.toString());
                                }
                              }}
                              className={styles.depthInput}
                              style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1 }}
                            />
                            <span className={styles.unit}>mm</span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: dir === 'front' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: dir === 'front' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setDir('front');
                                if (isPullOutOrPantry) {
                                  applyLowerCabinetDepthDirection('front');
                                } else if (currentPlacedModule) {
                                  updatePlacedModule(currentPlacedModule.id, { [dirField]: 'front' } as any);
                                }
                              }}
                            >뒤고정</button>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: dir === 'back' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: dir === 'back' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setDir('back');
                                if (isPullOutOrPantry) {
                                  applyLowerCabinetDepthDirection('back');
                                } else if (currentPlacedModule) {
                                  updatePlacedModule(currentPlacedModule.id, { [dirField]: 'back' } as any);
                                }
                              }}
                            >앞고정</button>
                          </div>
                        </div>
                        );
                      })()}
                    </div>

                    {/* 좌우 분할 서브박스 치수 (커스텀 가구 전용) */}
                    {hasHS && (() => {
                      const hs = (sec as any).horizontalSplit;
                      return (
                      <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed var(--theme-border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', marginBottom: '4px' }}>좌우 분할</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {/* 좌측 */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>좌측</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>너비</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsLeftWidthInput[sIdx] || ''}
                                    onChange={(e) => setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsLeftWidthBlur(sIdx)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsLeftWidthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                        setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>깊이</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsLeftDepthInput[sIdx] || ''}
                                    onChange={(e) => setHsLeftDepthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsDepthBlur(sIdx, 'left')}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsLeftDepthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, Math.min(1200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                        setHsLeftDepthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* 중앙 (3분할 시) */}
                          {hs.secondPosition && (
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>중앙</div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>너비</label>
                                  <div className={styles.inputWithUnit}>
                                    <input type="text" inputMode="numeric"
                                      value={hsCenterWidthInput[sIdx] || ''} readOnly
                                      className={styles.depthInput}
                                      style={{ color: '#000', backgroundColor: '#f5f5f5', WebkitTextFillColor: '#000', opacity: 0.7, fontSize: '12px' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>깊이</label>
                                  <div className={styles.inputWithUnit}>
                                    <input type="text" inputMode="numeric"
                                      value={hsCenterDepthInput[sIdx] || ''}
                                      onChange={(e) => setHsCenterDepthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                      onBlur={() => handleHsDepthBlur(sIdx, 'center')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                          e.preventDefault();
                                          const cur = parseInt(hsCenterDepthInput[sIdx] || '0', 10);
                                          const next = Math.max(100, Math.min(1200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                          setHsCenterDepthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                        }
                                      }}
                                      className={styles.depthInput}
                                      style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {/* 우측 */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>우측</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>너비</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsRightWidthInput[sIdx] || ''}
                                    onChange={(e) => setHsRightWidthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsRightWidthBlur(sIdx)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsRightWidthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                        setHsRightWidthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>깊이</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsRightDepthInput[sIdx] || ''}
                                    onChange={(e) => setHsRightDepthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsDepthBlur(sIdx, 'right')}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsRightDepthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, Math.min(1200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                        setHsRightDepthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* 도어 치수 (읽기 전용) — 몸통치수 바로 아래, 편집 탭 전용 */}
          {/* 키큰장 찬넬(insert-frame) 및 서랍 전용 모듈 제외 */}
          {!showDetails && currentPlacedModule && currentPlacedModule.hasDoor
            && !(typeof currentPlacedModule.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame'))
            && !(typeof currentPlacedModule.moduleId === 'string' && (
              // 서랍 모듈만 매칭 (반통 half / 2tier / 3tier 는 도어 모듈 → 제외)
              // 상판내림은 터치형(touch)만 서랍 → 그 외(half/2tier/3tier)는 도어 모듈
              /^(dual-)?lower-drawer-/.test(currentPlacedModule.moduleId)
              || /(^|-)lower-induction-cabinet-/.test(currentPlacedModule.moduleId)
              || (/(^|-)lower-door-lift-/.test(currentPlacedModule.moduleId) && !currentPlacedModule.moduleId.includes('-half-'))
              || /(^|-)lower-top-down-touch-/.test(currentPlacedModule.moduleId)
            ))
            && (() => {
            const bodyWidth = (() => {
              const v = parseInt(freeWidthInput, 10);
              if (!isNaN(v) && v > 0) return v;
              return currentPlacedModule.freeWidth || currentPlacedModule.adjustedWidth || currentPlacedModule.customWidth || moduleData.dimensions.width;
            })();
            // 실제 3D 렌더링과 동일한 공식 (DoorModule.tsx 의 doorGap=3)
            // 슬롯(도어 1장이 차지하는 너비) - 3mm = 좌우 1.5mm씩 안쪽 갭
            const isDualSlot = currentPlacedModule.isDualSlot || currentPlacedModule.moduleId?.startsWith('dual-');
            // 키큰장 찬넬(insert-frame) 인접 시 도어 47mm 확장 (DoorModule.tsx INSERT_FRAME_DOOR_EXTENSION_MM)
            const INSERT_FRAME_DOOR_EXTENSION_MM = 47;
            const isInsertMod = (m: any) => typeof m?.moduleId === 'string' && m.moduleId.includes('insert-frame');
            const isCurrentInsert = isInsertMod(currentPlacedModule);
            let insertExtensionMm = 0;
            if (!isCurrentInsert) {
              let hasLeftInsertFrame = false;
              let hasRightInsertFrame = false;
              if (currentPlacedModule.isFreePlacement) {
                // 자유배치: 위치 기반 인접성 (DoorModule.tsx insertFrameAdjacency 동일 식)
                const myX = currentPlacedModule.position?.x ?? 0;
                const myWidthThree = (currentPlacedModule.freeWidth ?? currentPlacedModule.customWidth ?? currentPlacedModule.moduleWidth ?? 0) * 0.01;
                const myLeft = myX - myWidthThree / 2;
                const myRight = myX + myWidthThree / 2;
                const TOL = 0.5;
                placedModules.forEach((m: any) => {
                  if (!m.isFreePlacement || !isInsertMod(m) || m.id === currentPlacedModule.id) return;
                  const mx = m.position?.x ?? 0;
                  const mw = (m.freeWidth ?? m.customWidth ?? m.moduleWidth ?? 0) * 0.01;
                  // 좌측 인접
                  if (mx < myX && Math.abs((mx + mw / 2) - myLeft) <= TOL) {
                    hasLeftInsertFrame = true;
                  }
                  // 우측 인접
                  if (mx > myX && Math.abs((mx - mw / 2) - myRight) <= TOL) {
                    hasRightInsertFrame = true;
                  }
                });
              } else {
                // 슬롯배치: slotIndex 기반 인접성
                const myZone = currentPlacedModule.zone || 'normal';
                const mySlot = currentPlacedModule.slotIndex;
                if (mySlot !== undefined) {
                  const isDualSelf = !!currentPlacedModule.isDualSlot;
                  const rightEdge = isDualSelf ? mySlot + 1 : mySlot;
                  placedModules.forEach((m: any) => {
                    if (m.id === currentPlacedModule.id) return;
                    if ((m.zone || 'normal') !== myZone || m.isFreePlacement) return;
                    if (!isInsertMod(m)) return;
                    if (m.slotIndex === mySlot - 1 || (m.isDualSlot && m.slotIndex === mySlot - 2)) {
                      hasLeftInsertFrame = true;
                    }
                    if (m.slotIndex === rightEdge + 1) {
                      hasRightInsertFrame = true;
                    }
                  });
                }
              }
              if (hasLeftInsertFrame || hasRightInsertFrame) {
                const hingeSide = ((currentPlacedModule as any).hingePosition ?? 'right') as 'left' | 'right';
                const oppositeSide = resolveHingeOppositeDoorWidthAdjustment(1, hingeSide);
                const canExtendLeft = hasLeftInsertFrame && (!hasRightInsertFrame || oppositeSide.leftMm > 0);
                const canExtendRight = hasRightInsertFrame && (!hasLeftInsertFrame || oppositeSide.rightMm > 0);
                if (canExtendLeft || canExtendRight) {
                  insertExtensionMm = INSERT_FRAME_DOOR_EXTENSION_MM;
                }
              }
            }
            // 도어 확장/축소 토글: 입력값 v(mm)는 경첩 반대쪽(손잡이쪽) 확장량이다.
            //   경첩쪽은 기본 1.5mm 갭 고정 → 도어 폭 = bodyWidth - 1.5 + v
            //   - v=0  → 손잡이쪽이 몸통 끝과 일치 (돌출 없음)
            //   - v=40 → 손잡이쪽으로 40mm 확장 (EP 커버 등)
            //   OFF 시는 기존 도어(몸통-3) 유지.
            const NOSURROUND_DEFAULT_OFFSET_MM = -1.5;
            const doorWidthAdjustEnabled = !!(currentPlacedModule as any).doorWidthAdjustEnabled;
            const userExtensionRaw = (currentPlacedModule as any).doorWidthAdjustMm;
            const isExplicitZeroDoorWidthAdjust = userExtensionRaw === 0;
            const effectiveDoorWidthAdjustEnabled = doorWidthAdjustEnabled || (autoCoverDoorWidthAdjustMm > 0 && !isExplicitZeroDoorWidthAdjust);
            const effectiveUserExtension = userExtensionRaw
              ?? (autoCoverDoorWidthAdjustMm > 0 ? autoCoverDoorWidthAdjustMm : insertExtensionMm > 0 ? insertExtensionMm : NOSURROUND_DEFAULT_OFFSET_MM);
            // 듀얼: 도어 2장 → 슬롯 1개 너비 = 몸통/2 → 도어 1장 너비 = (몸통/2) - 3
            // 싱글: 도어 1장 → 도어 너비 = 몸통 - 1.5(경첩쪽 갭 고정) + v(손잡이쪽 확장)
            const rawDoorW = isDualSlot
              ? Math.max(0, bodyWidth / 2 - 3)
              : (effectiveDoorWidthAdjustEnabled
                ? Math.max(0, bodyWidth - 1.5 + effectiveUserExtension)
                : Math.max(0, bodyWidth - 3));
            const doorW = Math.max(0, roundMmToTenth(rawDoorW));
            // 도어 높이: 실제 적용된 몸통 높이 기준 (EP와 동일)
            // 상부몰딩/걸레받이 토글 OFF 시 가구가 흡수해서 몸통이 늘어남 → 도어 H도 늘어난 몸통 + 갭
            // 상부장은 천장/바닥과 무관 → 흡수 적용 안 함 (full/lower만)
            // 상판내림: 도어 H는 모듈 기본 H(785) 고정 (stoneThk 무관)
            const isTopDownForDoorH = currentPlacedModule.moduleId?.includes('lower-top-down-');
            const baseBodyH = isTopDownForDoorH
              ? (moduleData.dimensions.height || 0)
              : (adjustedFreeHeight || placedBodyHeight || moduleData.dimensions.height || 0);
            const shouldAbsorbTopForDoorH = moduleData.category === 'full';
            const shouldAbsorbBaseForDoorH = moduleData.category === 'full' || moduleData.category === 'lower';
            const absorbedTopH = shouldAbsorbTopForDoorH && currentPlacedModule.hasTopFrame === false
              ? Math.max(0, (currentPlacedModule.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30) - (currentPlacedModule.topFrameGap ?? 0))
              : 0;
            const absorbedBaseH = shouldAbsorbBaseForDoorH && currentPlacedModule.hasBase === false
              ? (((currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0)))
                - (currentPlacedModule.individualFloatHeight ?? 0))
              : 0;
            const bodyH = baseBodyH + absorbedTopH + absorbedBaseH;
            // 상판내림: 도어 H = cabH + topGap + bottomGap (가구 상단~도어 상단 갭 일정)
            const doorH = Math.max(0, bodyH + (doorTopGap || 0) + (doorBottomGap || 0));
            const doorPanelsForDimensions = panelDetails.filter((panel: any) => panel?.isDoor && typeof panel?.height === 'number');
            const primaryDoorPanelForDimensions = doorPanelsForDimensions[0];
            const doorThickness = Math.round(primaryDoorPanelForDimensions?.thickness ?? 20);
            const splitDoorPanelsForDimensions = isDoorSplitModuleId(currentPlacedModule.moduleId)
              ? doorPanelsForDimensions
              : [];
            const lowerDoorPanelForDimensions = splitDoorPanelsForDimensions.find((panel: any) => String(panel.name || '').includes('하부 도어'));
            const upperDoorPanelForDimensions = splitDoorPanelsForDimensions.find((panel: any) => String(panel.name || '').includes('상부 도어'));
            const isSplitDoorDimension = !!lowerDoorPanelForDimensions && !!upperDoorPanelForDimensions;
            const primaryDoorDimensionH = primaryDoorPanelForDimensions
              ? roundMmToTenth(primaryDoorPanelForDimensions.height)
              : roundMmToTenth(doorH);
            const primaryDoorDimensionW = primaryDoorPanelForDimensions
              ? roundMmToTenth(primaryDoorPanelForDimensions.width ?? doorW)
              : doorW;
            const upperDoorDimensionH = isSplitDoorDimension
              ? roundMmToTenth(upperDoorPanelForDimensions.height)
              : roundMmToTenth(doorH);
            const lowerDoorDimensionH = isSplitDoorDimension
              ? roundMmToTenth(lowerDoorPanelForDimensions.height)
              : roundMmToTenth(doorH);
            const upperDoorDimensionW = isSplitDoorDimension
              ? roundMmToTenth(upperDoorPanelForDimensions.width ?? doorW)
              : doorW;
            const lowerDoorDimensionW = isSplitDoorDimension
              ? roundMmToTenth(lowerDoorPanelForDimensions.width ?? doorW)
              : doorW;
            const middleDoorGapMm = isSplitDoorDimension
              ? Math.round(-((upperDoorBottomGap || 0) + (lowerDoorTopGap || 0)))
              : 0;
            const renderDoorDimensionRow = (
              label: string | null,
              widthMm: number,
              heightMm: number
            ) => (
              <div style={{ marginTop: label ? '6px' : '2px' }}>
                {label && (
                  <div style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', lineHeight: 1.2, marginBottom: '2px' }}>
                    {label}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>W</label>
                    <div className={styles.inputWithUnit}>
                      <input type="text" value={formatMmInputValue(widthMm)} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                  <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>H</label>
                    <div className={styles.inputWithUnit}>
                      <input type="text" value={formatMmInputValue(heightMm)} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                  <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>t</label>
                    <div className={styles.inputWithUnit}>
                      <input type="text" value={doorThickness} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                </div>
              </div>
            );
            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>
                  도어치수
                  {isSplitDoorDimension
                    ? <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', fontWeight: 'normal', marginLeft: '6px' }}>(상부/하부 도어)</span>
                    : isDualSlot && <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', fontWeight: 'normal', marginLeft: '6px' }}>(도어 1장 / 총 2장)</span>}
                </h5>
                {isSplitDoorDimension ? (
                  <>
                    {renderDoorDimensionRow('상부 도어', upperDoorDimensionW, upperDoorDimensionH)}
                    <div style={{ margin: '6px 0 0', fontSize: '10px', color: 'var(--theme-text-tertiary)', textAlign: 'center' }}>
                      도어 간격 {middleDoorGapMm}mm
                    </div>
                    {renderDoorDimensionRow('하부 도어', lowerDoorDimensionW, lowerDoorDimensionH)}
                  </>
                ) : renderDoorDimensionRow(null, primaryDoorDimensionW, primaryDoorDimensionH)}
                {/* 도어 확장/축소 토글: 사용자가 도어 폭을 좌/우 방향으로 +/- 조정 */}
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--theme-text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={effectiveDoorWidthAdjustEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        // 토글 ON 시 초기값: 키큰장 찬넬 인접 시 자동값(insertExtensionMm), 그 외엔 노서라운드 기본 -1.5
                        // 토글 OFF 시 0을 명시 저장해 기둥 커버도어 자동 확장을 끈다.
                        if (enabled) {
                          const autoInitial = autoCoverDoorWidthAdjustMm > 0
                            ? autoCoverDoorWidthAdjustMm
                            : insertExtensionMm > 0
                              ? insertExtensionMm
                              : -1.5;
                          const savedAdjust = (currentPlacedModule as any).doorWidthAdjustMm;
                          if (savedAdjust === 0 && autoCoverDoorWidthAdjustMm > 0) {
                            updatePlacedModule(currentPlacedModule.id, {
                              doorWidthAdjustEnabled: false,
                              doorWidthAdjustMm: undefined,
                            } as any);
                            return;
                          }
                          const initial = savedAdjust === 0 && autoInitial > 0
                            ? autoInitial
                            : savedAdjust ?? autoInitial;
                          updatePlacedModule(currentPlacedModule.id, {
                            doorWidthAdjustEnabled: true,
                            doorWidthAdjustMm: initial,
                          } as any);
                        } else {
                          updatePlacedModule(currentPlacedModule.id, {
                            doorWidthAdjustEnabled: false,
                            doorWidthAdjustMm: 0,
                          } as any);
                        }
                      }}
                      style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                    />
                    <span>도어 확장/축소</span>
                  </label>
                  {effectiveDoorWidthAdjustEnabled && (
                    <>
                      {/* 도어 확장량 mm 입력 (현재 적용 절대값, +확장 / -축소). 경첩 반대 방향으로 적용 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={doorWidthAdjustInputFocused ? doorWidthAdjustInput : String(effectiveUserExtension)}
                          onFocus={() => {
                            setDoorWidthAdjustInputFocused(true);
                            setDoorWidthAdjustInput(String(effectiveUserExtension));
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            // 정수/소수/음수 모두 허용 (직접입력 ex. -1.5, 50, 0.3)
                            if (v === '' || v === '-' || /^-?\d*(\.\d*)?$/.test(v)) {
                              setDoorWidthAdjustInput(v);
                              const num = v === '' || v === '-' || v === '.' || v === '-.' ? NaN : parseFloat(v);
                              if (!isNaN(num)) {
                                // 0.1mm 단위로 반올림
                                const rounded = Math.round(num * 10) / 10;
                                updatePlacedModule(currentPlacedModule.id, {
                                  doorWidthAdjustEnabled: true,
                                  doorWidthAdjustMm: Math.max(-500, Math.min(500, rounded))
                                } as any);
                              }
                            }
                          }}
                          onBlur={() => {
                            const num = parseFloat(doorWidthAdjustInput);
                            const next = Number.isFinite(num)
                              ? Math.max(-500, Math.min(500, Math.round(num * 10) / 10))
                              : effectiveUserExtension;
                            setDoorWidthAdjustInput(String(next));
                            setDoorWidthAdjustInputFocused(false);
                            updatePlacedModule(currentPlacedModule.id, {
                              doorWidthAdjustEnabled: true,
                              doorWidthAdjustMm: next
                            } as any);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const inputNumber = parseFloat(doorWidthAdjustInput);
                              const cur = Number.isFinite(inputNumber) ? inputNumber : effectiveUserExtension;
                              // 0.1mm 단위 증감 (Shift 누르면 1.0mm 단위)
                              const step = e.shiftKey ? 1 : 0.1;
                              const next = Math.round((cur + (e.key === 'ArrowUp' ? step : -step)) * 10) / 10;
                              const clamped = Math.max(-500, Math.min(500, next));
                              setDoorWidthAdjustInput(String(clamped));
                              updatePlacedModule(currentPlacedModule.id, {
                                doorWidthAdjustEnabled: true,
                                doorWidthAdjustMm: clamped
                              } as any);
                            }
                          }}
                          style={{ width: '70px', padding: '2px 4px', border: '1px solid var(--theme-border)', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)' }}>mm</span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>(+ 확장 / − 축소, 경첩 반대 방향)</span>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 마이다 치수 (읽기 전용) — 서랍 모듈 전용, 몸통치수 바로 아래 */}
          {!showDetails && currentPlacedModule && currentPlacedModule.hasDoor
            && isLowerDrawerMaidaModuleId(currentPlacedModule.moduleId)
            && (() => {
              const bodyWidth = (() => {
                const v = parseInt(freeWidthInput, 10);
                if (!isNaN(v) && v > 0) return v;
                return currentPlacedModule.freeWidth
                  || currentPlacedModule.slotCustomWidth
                  || currentPlacedModule.customWidth
                  || currentPlacedModule.adjustedWidth
                  || moduleData.dimensions.width;
              })();
              const bodyHeight = Math.round(adjustedFreeHeight || placedBodyHeight || moduleData.dimensions.height || 0);
              const stoneThickness = (currentPlacedModule as any).stoneTopThickness ?? 20;
              const maidaOuterOpenSides = resolveDoorOuterOpenSides({
                spaceInfo,
                placedModule: currentPlacedModule,
                moduleWidthMm: bodyWidth,
                slotCenterX: currentPlacedModule.position?.x
              });
              const maidaWidth = resolveMaidaDisplayWidthMm(currentPlacedModule, moduleData, bodyWidth, maidaOuterOpenSides);
              const maidaThickness = moduleData?.modelConfig?.basicThickness || 18;
              const moduleId = currentPlacedModule.moduleId ?? '';
              const parsedDoorTopGapInput = parseInt(doorTopGapInput, 10);
              const parsedDoorBottomGapInput = parseInt(doorBottomGapInput, 10);
              const effectiveDoorTopGapForMaida = Number.isFinite(parsedDoorTopGapInput)
                ? parsedDoorTopGapInput
                : (currentPlacedModule.doorTopGap ?? doorTopGap);
              const effectiveDoorBottomGapForMaida = Number.isFinite(parsedDoorBottomGapInput)
                ? parsedDoorBottomGapInput
                : (currentPlacedModule.doorBottomGap ?? doorBottomGap);
              const fallbackHeights = computeLowerCabinetExternalMaidaRanges({
                moduleId,
                moduleHeightMm: bodyHeight,
                sourceModuleHeightMm: moduleData.dimensions.height,
                stoneTopThicknessMm: stoneThickness,
                doorTopGap: effectiveDoorTopGapForMaida,
                doorBottomGap: effectiveDoorBottomGapForMaida,
                hasTopEndPanel: currentPlacedModule.hasTopEndPanel === true,
                basicThicknessMm: maidaThickness,
                customMaidaHeights: Array.isArray((currentPlacedModule as any).customMaidaHeights)
                  ? (currentPlacedModule as any).customMaidaHeights
                  : undefined,
                customMaidaHeightsMode: (currentPlacedModule as any).customMaidaHeightsMode
              }).map(range => range.maidaHeightMm);
              const renderedHeights = findRenderedMaidaHeightsBottomToTop(
                  currentPlacedModule.id,
                  moduleId,
                  fallbackHeights.length
                );
              // 팝업 H는 실제 렌더/치수가이드 값을 우선 표시하고, 렌더 등록 전만 fallback을 쓴다.
              const heights = renderedHeights
                ?? fallbackHeights;
              const displayHeights = heights.slice().reverse();
              if (displayHeights.length === 0) return null;

              // "마이다치수" H 칸 직접 편집 → customMaidaHeights([아래,위] 순)에 저장.
              // 한 칸을 바꾸면 인접 칸이 반대로 흡수해 합·갭(영역)을 유지한다.
              //  displayHeights는 위→아래(reverse), 저장은 di(아래=0) 기준 → 인덱스를 뒤집어 매핑.
              const maidaTierCount = displayHeights.length;
              // 레그라 서랍(인덕션·도어올림터치·상판내림터치)만 마이다 H 직접 입력 가능.
              //  일반 서랍(lower-drawer-* 등)은 마이다치수 읽기전용.
              const maidaMid = currentPlacedModule.moduleId ?? '';
              const isLegraMaidaModule = maidaMid.includes('lower-induction-cabinet')
                || maidaMid.includes('dual-lower-induction-cabinet')
                || maidaMid.includes('lower-door-lift-touch-')
                || maidaMid.includes('lower-top-down-touch-');
              const toStoredMaidaHeights = (displayedBottomToTop: number[]): number[] | null => {
                const stored = [...displayedBottomToTop];
                const lastIdx = stored.length - 1;
                if (lastIdx < 0) return null;
                const isDoorLiftTouch = maidaMid.includes('lower-door-lift-touch-');
                const isTopDownTouch = maidaMid.includes('lower-top-down-touch-');
                if (isDoorLiftTouch || isTopDownTouch) {
                  const tdStretcherH = stoneThickness === 10 ? 65 : stoneThickness === 30 ? 45 : 55;
                  const defaultTopExt = isTopDownTouch ? -(tdStretcherH + 25) : 30;
                  const defaultBottomExt = 5;
                  const gapTopExt = (effectiveDoorTopGapForMaida ?? defaultTopExt) - defaultTopExt;
                  const gapBottomExt = (effectiveDoorBottomGapForMaida ?? defaultBottomExt) - defaultBottomExt;
                  stored[0] -= gapBottomExt;
                  stored[lastIdx] -= gapTopExt;
                }
                const rounded = stored.map(v => Math.round(v));
                return rounded.every(v => Number.isFinite(v) && v > 0) ? rounded : null;
              };
              const MAIDA_MIN_MM = 153; // 가장 작은 레그라 서랍(소 117 + 오프셋 21 + 갭 15)이 들어가는 최소 마이다
              const applyMaidaH = (displayIdx: number, num: number) => {
                if (!Number.isFinite(num) || num <= 0) return;
                if (num < MAIDA_MIN_MM) { alert(`마이다 최소 ${MAIDA_MIN_MM}mm 이상이어야 합니다.`); return; }
                const di = (maidaTierCount - 1) - displayIdx; // di: 아래=0, 위=N-1
                const base = heights.slice(); // bottom-to-top 실제값
                const prev = base[di];
                const delta = num - prev;
                if (delta === 0) return;
                // 경계선만 이동하고 인접 한 칸이 흡수한다(나머지 칸 고정):
                //  - 맨 위 칸(di=N-1): 그 아래(di-1) 칸이 흡수  (1단↔2단 경계)
                //  - 그 외 칸: 그 위(di+1) 칸이 흡수            (2단↔1단, 3단↔2단 경계)
                const absorbIdx = (di === maidaTierCount - 1) ? di - 1 : di + 1;
                if (absorbIdx < 0 || absorbIdx >= maidaTierCount) {
                  alert('이 마이다는 직접 조정할 수 없습니다. 인접 칸을 조정하세요.'); return;
                }
                const absorbH = base[absorbIdx] - delta;
                if (absorbH < MAIDA_MIN_MM) { alert(`인접 마이다가 최소 ${MAIDA_MIN_MM}mm보다 작아집니다. 더 작은 값을 입력하세요.`); return; }
                base[di] = num;
                base[absorbIdx] = absorbH;
                const storedHeights = toStoredMaidaHeights(base);
                if (!storedHeights) { alert('마이다 치수를 저장할 수 없습니다. 상하단 갭과 입력값을 확인하세요.'); return; }
                // 마이다를 바꾸면 수동 레그라 선택을 리셋해 자동축소가 다시 작동하게 한다.
                //  (수동 선택은 마이다를 다시 만지기 전까지만 우선)
                updatePlacedModule(currentPlacedModule.id, {
                  customMaidaHeights: storedHeights,
                  customMaidaHeightsMode: 'gapBase',
                  legraDrawerTypes: undefined,
                } as any);
              };

              return (
                <div className={styles.propertySection}>
                  <h5 className={styles.sectionTitle}>
                    마이다치수
                    {displayHeights.length > 1 && <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', fontWeight: 'normal', marginLeft: '6px' }}>(위→아래)</span>}
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                    {displayHeights.map((heightMm, idx) => (
                      <div key={`maida-size-${idx}`}>
                        {displayHeights.length > 1 && (
                          <div style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', lineHeight: 1.2, marginBottom: '2px' }}>
                            {formatMaidaTierLabel(idx, displayHeights.length)}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>W</label>
                            <div className={styles.inputWithUnit}>
                              <input type="text" value={maidaWidth} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                              <span className={styles.unit}>mm</span>
                            </div>
                          </div>
                          <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>H</label>
                            <div className={styles.inputWithUnit}>
                              <MaidaHeightInput
                                value={heightMm}
                                className={styles.depthInput}
                                onApply={(v) => applyMaidaH(idx, v)}
                                readOnly={!isLegraMaidaModule}
                              />
                              <span className={styles.unit}>mm</span>
                            </div>
                          </div>
                          <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>t</label>
                            <div className={styles.inputWithUnit}>
                              <input type="text" value={maidaThickness} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                              <span className={styles.unit}>mm</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--theme-text-primary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!(currentPlacedModule as any).maidaWidthAdjustEnabled}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          if (enabled) {
                            const initial = (currentPlacedModule as any).maidaWidthAdjustMm ?? -1.5;
                            updatePlacedModule(currentPlacedModule.id, {
                              maidaWidthAdjustEnabled: true,
                              maidaWidthAdjustMm: initial,
                            } as any);
                          } else {
                            updatePlacedModule(currentPlacedModule.id, {
                              maidaWidthAdjustEnabled: false,
                            } as any);
                          }
                        }}
                        style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                      />
                      <span>마이다 확장/축소</span>
                    </label>
                    {!!(currentPlacedModule as any).maidaWidthAdjustEnabled && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={(currentPlacedModule as any).maidaWidthAdjustMm ?? -1.5}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d*(\.\d*)?$/.test(v)) {
                                const num = v === '' || v === '-' || v === '.' || v === '-.' ? 0 : parseFloat(v);
                                if (!isNaN(num)) {
                                  const rounded = Math.round(num * 10) / 10;
                                  updatePlacedModule(currentPlacedModule.id, { maidaWidthAdjustMm: Math.max(-500, Math.min(500, rounded)) } as any);
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = (currentPlacedModule as any).maidaWidthAdjustMm ?? -1.5;
                                const step = e.shiftKey ? 1 : 0.1;
                                const next = Math.round((cur + (e.key === 'ArrowUp' ? step : -step)) * 10) / 10;
                                updatePlacedModule(currentPlacedModule.id, { maidaWidthAdjustMm: Math.max(-500, Math.min(500, next)) } as any);
                              }
                            }}
                            style={{ width: '70px', padding: '2px 4px', border: '1px solid var(--theme-border)', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }}
                          />
                          <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)' }}>mm</span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>(+ 확장 / − 축소, 전체 마이다 공통)</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* 도어 셋팅 (상단갭/하단갭) — 도어 장착 시 표시, insert-frame 및 서랍 전용 모듈 제외 */}
          {/* 단, 도어올림장(lower-door-lift-*)은 서랍이어도 도어 갭 설정 표시 (사용자 예외 요청) */}
          {!showDetails && currentPlacedModule && currentPlacedModule.hasDoor
            && !(typeof currentPlacedModule.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame'))
            && (() => {
            const isDualSlot = currentPlacedModule.isDualSlot || currentPlacedModule.moduleId?.startsWith('dual-');
            const doorCount = isDualSlot ? 2 : 1;
            const isShelfSplitDoorModule = isDoorSplitModuleId(currentPlacedModule.moduleId);
            const isPantrySplitDoorModule = currentPlacedModule.moduleId?.includes('pantry-cabinet-split');
            // 천장 ~ 가구 상단 거리 = 상단몰딩 두께, 가구 하단 ~ 마감 바닥 거리 = 걸레받이 높이
            //   (가구는 공간 - 상단몰딩 - 걸레받이로 자동 산정되므로 이렇게 정확히 일치함)
            const topFrameMm = currentPlacedModule.hasTopFrame === false
              ? 0
              : (currentPlacedModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));
            const baseFrameMm = currentPlacedModule.hasBase === false
              ? (currentPlacedModule.individualFloatHeight ?? 0)
              : (currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
            const ceilingToBodyTopMm = Math.max(0, topFrameMm);
            const bodyBottomToFloorMm = Math.max(0, baseFrameMm);

            // 천장/바닥 기준 표시값: 도어와 천장/바닥 사이의 실제 거리 (양수)
            //   - 천장 기준 = 천장~가구상단 - 몸통 기준 상단갭
            //   - 바닥 기준 = 가구하단~바닥 - 몸통 기준 하단갭
            const topBodyGapInput = isShelfSplitDoorModule ? upperDoorTopGapInput : doorTopGapInput;
            const bottomBodyGapInput = isShelfSplitDoorModule ? lowerDoorBottomGapInput : doorBottomGapInput;
            const cfTopValue = String(Math.round(ceilingToBodyTopMm - (parseFloat(topBodyGapInput) || 0)));
            const cfBotValue = String(Math.round(bodyBottomToFloorMm - (parseFloat(bottomBodyGapInput) || 0)));
            const isLowerDoorGapModule = moduleData?.category === 'lower';
            const isUpperDoorGapModule = moduleData?.category === 'upper';
            const hideCeilingFloorTopGap = isLowerDoorGapModule;
            const hideCeilingFloorBottomGap = isUpperDoorGapModule;
            const handleDisplayedTopGapChange = (value: string) => {
              if (!isShelfSplitDoorModule) {
                handleDoorTopGapChange(value);
                return;
              }
              setUpperDoorTopGapInput(value);
              const numValue = parseInt(value);
              if (!isNaN(numValue) && currentPlacedModule) {
                setUpperDoorTopGap(numValue);
                updatePlacedModule(currentPlacedModule.id, {
                  upperDoorTopGap: numValue,
                  doorTopGap: numValue,
                });
              }
            };
            const handleDisplayedTopGapBlur = () => {
              if (!isShelfSplitDoorModule) {
                handleDoorTopGapBlur();
                return;
              }
              const value = parseInt(upperDoorTopGapInput);
              if (!isNaN(value) && currentPlacedModule) {
                setUpperDoorTopGap(value);
                updatePlacedModule(currentPlacedModule.id, {
                  upperDoorTopGap: value,
                  doorTopGap: value,
                });
              } else {
                setUpperDoorTopGapInput(upperDoorTopGap.toString());
              }
            };
            const handleDisplayedTopGapKeyDown = (e: React.KeyboardEvent) => {
              if (!isShelfSplitDoorModule) {
                handleDoorTopGapKeyDown(e);
                return;
              }
              if (e.key === 'Enter') {
                handleDisplayedTopGapBlur();
                (e.target as HTMLInputElement).blur();
                return;
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const currentValue = parseInt(upperDoorTopGapInput) || 0;
                handleDisplayedTopGapChange(String(currentValue + (e.key === 'ArrowUp' ? 1 : -1)));
              }
            };
            const handleDisplayedBottomGapChange = (value: string) => {
              if (!isShelfSplitDoorModule) {
                handleDoorBottomGapChange(value);
                return;
              }
              setLowerDoorBottomGapInput(value);
              const numValue = parseInt(value);
              if (!isNaN(numValue) && currentPlacedModule) {
                setLowerDoorBottomGap(numValue);
                updatePlacedModule(currentPlacedModule.id, {
                  lowerDoorBottomGap: numValue,
                  doorBottomGap: numValue,
                });
              }
            };
            const handleDisplayedBottomGapBlur = () => {
              if (!isShelfSplitDoorModule) {
                handleDoorBottomGapBlur();
                return;
              }
              const value = parseInt(lowerDoorBottomGapInput);
              if (!isNaN(value) && currentPlacedModule) {
                setLowerDoorBottomGap(value);
                updatePlacedModule(currentPlacedModule.id, {
                  lowerDoorBottomGap: value,
                  doorBottomGap: value,
                });
              } else {
                setLowerDoorBottomGapInput(lowerDoorBottomGap.toString());
              }
            };
            const handleDisplayedBottomGapKeyDown = (e: React.KeyboardEvent) => {
              if (!isShelfSplitDoorModule) {
                handleDoorBottomGapKeyDown(e);
                return;
              }
              if (e.key === 'Enter') {
                handleDisplayedBottomGapBlur();
                (e.target as HTMLInputElement).blur();
                return;
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const currentValue = parseInt(lowerDoorBottomGapInput) || 0;
                handleDisplayedBottomGapChange(String(currentValue + (e.key === 'ArrowUp' ? 1 : -1)));
              }
            };

            // 천장/바닥 기준 입력 → 몸통 기준으로 변환.
            // 기준 거리보다 큰 값은 몸통 기준 음수로 저장되어 도어가 안쪽으로 줄어든다.
            const onTopCfChange = (v: string) => {
              const raw = parseFloat(v);
              if (isNaN(raw)) return;
              const num = Math.max(0, raw);
              handleDisplayedTopGapChange(String(Math.round(ceilingToBodyTopMm - num)));
            };
            const onBotCfChange = (v: string) => {
              const raw = parseFloat(v);
              if (isNaN(raw)) return;
              const num = Math.max(0, raw);
              handleDisplayedBottomGapChange(String(Math.round(bodyBottomToFloorMm - num)));
            };

            const handleSplitDoorGapChange = (
              field: 'upperDoorTopGap' | 'upperDoorBottomGap' | 'lowerDoorTopGap' | 'lowerDoorBottomGap',
              value: string
            ) => {
              const numValue = parseInt(value);
              const updates: Record<string, number> = {};
              if (isPantrySplitDoorModule && (field === 'upperDoorBottomGap' || field === 'lowerDoorTopGap')) {
                return;
              }
              if (field === 'upperDoorTopGap') {
                setUpperDoorTopGapInput(value);
                if (!isNaN(numValue)) {
                  setUpperDoorTopGap(numValue);
                  updates.upperDoorTopGap = numValue;
                  updates.doorTopGap = numValue;
                }
              } else if (field === 'upperDoorBottomGap') {
                setUpperDoorBottomGapInput(value);
                if (!isNaN(numValue)) {
                  setUpperDoorBottomGap(numValue);
                  updates.upperDoorBottomGap = numValue;
                }
              } else if (field === 'lowerDoorTopGap') {
                setLowerDoorTopGapInput(value);
                if (!isNaN(numValue)) {
                  setLowerDoorTopGap(numValue);
                  updates.lowerDoorTopGap = numValue;
                }
              } else {
                setLowerDoorBottomGapInput(value);
                if (!isNaN(numValue)) {
                  setLowerDoorBottomGap(numValue);
                  updates.lowerDoorBottomGap = numValue;
                  updates.doorBottomGap = numValue;
                }
              }
              if (currentPlacedModule && Object.keys(updates).length > 0) {
                updatePlacedModule(currentPlacedModule.id, updates);
              }
            };

            const handleSplitDoorGapBlur = (
              field: 'upperDoorTopGap' | 'upperDoorBottomGap' | 'lowerDoorTopGap' | 'lowerDoorBottomGap',
              value: string,
              fallback: number
            ) => {
              const parsed = parseInt(value);
              if (!isNaN(parsed)) {
                handleSplitDoorGapChange(field, parsed.toString());
              } else {
                handleSplitDoorGapChange(field, fallback.toString());
              }
            };

            const handleSplitDoorGapKeyDown = (
              e: React.KeyboardEvent,
              field: 'upperDoorTopGap' | 'upperDoorBottomGap' | 'lowerDoorTopGap' | 'lowerDoorBottomGap',
              value: string,
              fallback: number
            ) => {
              if (e.key === 'Enter') {
                handleSplitDoorGapBlur(field, value, fallback);
                (e.target as HTMLInputElement).blur();
                return;
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const currentValue = parseInt(value) || 0;
                handleSplitDoorGapChange(field, String(currentValue + (e.key === 'ArrowUp' ? 1 : -1)));
              }
            };

            const renderSplitDoorGapRow = (
              label: string,
              field: 'upperDoorTopGap' | 'upperDoorBottomGap' | 'lowerDoorTopGap' | 'lowerDoorBottomGap',
              value: string,
              fallback: number,
              cfValue?: string,
              onCfChange?: (value: string) => void
            ) => {
              const hasCfInput = !!onCfChange;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ width: '76px', fontSize: '12px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>{label}</label>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) => handleSplitDoorGapChange(field, e.target.value)}
                      onBlur={() => handleSplitDoorGapBlur(field, value, fallback)}
                      onKeyDown={(e) => handleSplitDoorGapKeyDown(e, field, value, fallback)}
                      className={styles.depthInput}
                      style={{ textAlign: 'center', fontSize: '13px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={hasCfInput ? (cfValue || '0') : ''}
                      disabled={!hasCfInput}
                      readOnly={!hasCfInput}
                      onChange={(e) => {
                        if (onCfChange) onCfChange(e.target.value);
                      }}
                      className={styles.depthInput}
                      style={{
                        textAlign: 'center',
                        fontSize: '13px',
                        background: !hasCfInput ? 'var(--theme-background-tertiary)' : undefined,
                        cursor: !hasCfInput ? 'not-allowed' : undefined,
                      }}
                    />
                    <span className={styles.unit} style={{ visibility: hasCfInput ? 'visible' : 'hidden' }}>mm</span>
                  </div>
                </div>
              );
            };

            if (isShelfSplitDoorModule) {
              return (
                <div className={styles.propertySection}>
                  <h5 className={styles.sectionTitle}>
                    <span style={{ color: 'var(--theme-primary, #10b981)', marginRight: '4px' }}>●</span>
                    도어 셋팅
                    <span style={{ marginLeft: '4px', color: 'var(--theme-text-tertiary)', fontSize: '11px', cursor: 'help' }} title="좌측: 몸통/중간판 기준 / 우측: 천장·바닥 기준">ⓘ</span>
                  </h5>
                  <div style={{ display: 'flex', gap: '6px', fontSize: '10px', color: 'var(--theme-text-tertiary)', marginBottom: '6px', paddingLeft: '84px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>몸통 기준</div>
                    <div style={{ flex: 1, textAlign: 'center' }}>천장·바닥 기준</div>
                  </div>

                  {renderSplitDoorGapRow(
                    '상단갭',
                    'upperDoorTopGap',
                    upperDoorTopGapInput,
                    upperDoorTopGap,
                    cfTopValue,
                    onTopCfChange
                  )}
                  {renderSplitDoorGapRow(
                    '하단갭',
                    'lowerDoorBottomGap',
                    lowerDoorBottomGapInput,
                    lowerDoorBottomGap,
                    cfBotValue,
                    onBotCfChange
                  )}
                </div>
              );
            }

            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>
                  <span style={{ color: 'var(--theme-primary, #10b981)', marginRight: '4px' }}>●</span>
                  도어 셋팅
                  <span style={{ marginLeft: '4px', color: 'var(--theme-text-tertiary)', fontSize: '11px', cursor: 'help' }} title="좌측: 몸통 기준 / 우측: 천장·바닥 기준 (양쪽 동기화)">ⓘ</span>
                </h5>
                {/* 도어 헤더 행: 도어 N */}
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--theme-text-secondary)', marginBottom: '6px' }}>
                  {Array.from({ length: doorCount }, (_, i) => `도어 ${i + 1}`).join(' / ')}
                </div>
                {/* 기준 헤더 (몸통 / 천장·바닥) */}
                <div style={{ display: 'flex', gap: '6px', fontSize: '10px', color: 'var(--theme-text-tertiary)', marginBottom: '4px', paddingLeft: '60px' }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>몸통 기준</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>천장·바닥 기준</div>
                </div>
                {/* 상단갭 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ width: '52px', fontSize: '12px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>상단갭</label>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={topBodyGapInput}
                      onChange={(e) => handleDisplayedTopGapChange(e.target.value)}
                      onBlur={handleDisplayedTopGapBlur}
                      onKeyDown={handleDisplayedTopGapKeyDown}
                      className={styles.depthInput}
                      style={{ textAlign: 'center', fontSize: '13px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={hideCeilingFloorTopGap ? '' : cfTopValue}
                      disabled={hideCeilingFloorTopGap}
                      readOnly={hideCeilingFloorTopGap}
                      onChange={(e) => {
                        if (!hideCeilingFloorTopGap) onTopCfChange(e.target.value);
                      }}
                      className={styles.depthInput}
                      style={{
                        textAlign: 'center',
                        fontSize: '13px',
                        background: hideCeilingFloorTopGap ? 'var(--theme-background-tertiary)' : undefined,
                        cursor: hideCeilingFloorTopGap ? 'not-allowed' : undefined,
                      }}
                    />
                    <span className={styles.unit} style={{ visibility: hideCeilingFloorTopGap ? 'hidden' : 'visible' }}>mm</span>
                  </div>
                </div>
                {/* 하단갭 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ width: '52px', fontSize: '12px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>하단갭</label>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bottomBodyGapInput}
                      onChange={(e) => handleDisplayedBottomGapChange(e.target.value)}
                      onBlur={handleDisplayedBottomGapBlur}
                      onKeyDown={handleDisplayedBottomGapKeyDown}
                      className={styles.depthInput}
                      style={{ textAlign: 'center', fontSize: '13px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={hideCeilingFloorBottomGap ? '' : cfBotValue}
                      disabled={hideCeilingFloorBottomGap}
                      readOnly={hideCeilingFloorBottomGap}
                      onChange={(e) => {
                        if (!hideCeilingFloorBottomGap) onBotCfChange(e.target.value);
                      }}
                      className={styles.depthInput}
                      style={{
                        textAlign: 'center',
                        fontSize: '13px',
                        background: hideCeilingFloorBottomGap ? 'var(--theme-background-tertiary)' : undefined,
                        cursor: hideCeilingFloorBottomGap ? 'not-allowed' : undefined,
                      }}
                    />
                    <span className={styles.unit} style={{ visibility: hideCeilingFloorBottomGap ? 'hidden' : 'visible' }}>mm</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 경첩 방향 선택 (도어치수 바로 아래로 이동) — 도어 + 싱글 가구 + 상세보기 아닐 때 */}
          {/* 키큰장 찬넬(insert-frame)은 도어 없는 채움재 → 경첩 방향도 숨김 */}
          {/* 서랍 전용 모듈만 경첩 숨김:
             - lower-drawer-* (순수 서랍 2tier/3tier)
             - lower-door-lift-touch-* (터치 서랍)
             - lower-top-down-touch-* (터치 상판내림 서랍)
             상판내림(top-down-half/2tier/3tier)·도어올림(door-lift-half/2tier/3tier)·기본장은 도어이므로 경첩 표시 */}
          {!showDetails && currentPlacedModule?.hasDoor
            && !isGlassCabinetModule
            && !isDummyModule
            && !(typeof currentPlacedModule?.moduleId === 'string' && currentPlacedModule.moduleId.startsWith('dual-') && !currentPlacedModule.moduleId.includes('right-corner') && !currentPlacedModule.moduleId.includes('left-corner'))
            && !(typeof currentPlacedModule?.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame'))
            && !(typeof currentPlacedModule?.moduleId === 'string' && (
              // 서랍 모듈만 매칭 (반통 half / 2tier / 3tier 는 도어 모듈 → 제외)
              // 상판내림은 터치형(touch)만 서랍 → 그 외(half/2tier/3tier)는 도어 모듈
              /^(dual-)?lower-drawer-/.test(currentPlacedModule.moduleId)
              || /(^|-)lower-induction-cabinet-/.test(currentPlacedModule.moduleId)
              || (/(^|-)lower-door-lift-/.test(currentPlacedModule.moduleId) && !currentPlacedModule.moduleId.includes('-half-'))
              || /(^|-)lower-top-down-touch-/.test(currentPlacedModule.moduleId)
            ))
            && (
            <div className={styles.propertySection}>
              {isCornerCabinet ? (() => {
                const frontDefault = (isRightCornerCabinet ? 'left' : 'right') as const;
                const sideDefault = (isRightCornerCabinet ? 'right' : 'left') as const;
                const frontHinge = ((currentPlacedModule as any).cornerFrontHingePosition || frontDefault) as 'left' | 'right';
                const sideHinge = ((currentPlacedModule as any).cornerSideHingePosition || sideDefault) as 'left' | 'right';
                const renderCornerHingeTabs = (
                  label: string,
                  value: 'left' | 'right',
                  field: 'cornerFrontHingePosition' | 'cornerSideHingePosition'
                ) => (
                  <div className={styles.hingeSubSection}>
                    <h6 className={styles.subSectionTitle}>{label}</h6>
                    <div className={styles.hingeTabSelector}>
                      <button
                        className={`${styles.hingeTab} ${value === 'left' ? styles.activeHingeTab : ''}`}
                        onClick={() => handleCornerHingePositionChange(field, 'left')}
                      >
                        {t('furniture.left')}
                        <span className={styles.hingeTabSubtitle}>{t('furniture.openToRight')}</span>
                      </button>
                      <button
                        className={`${styles.hingeTab} ${value === 'right' ? styles.activeHingeTab : ''}`}
                        onClick={() => handleCornerHingePositionChange(field, 'right')}
                      >
                        {t('furniture.right')}
                        <span className={styles.hingeTabSubtitle}>{t('furniture.openToLeft')}</span>
                      </button>
                    </div>
                  </div>
                );
                return (
                  <>
                    {renderCornerHingeTabs('정면 도어 경첩 방향', frontHinge, 'cornerFrontHingePosition')}
                    {renderCornerHingeTabs('측면 도어 경첩 방향', sideHinge, 'cornerSideHingePosition')}
                  </>
                );
              })() : (
                <div className={styles.hingeSubSection}>
                  <h6 className={styles.subSectionTitle}>{t('furniture.hingeDirection')}</h6>
                  <div className={styles.hingeTabSelector}>
                    <button
                      className={`${styles.hingeTab} ${hingePosition === 'left' ? styles.activeHingeTab : ''}`}
                      onClick={() => handleHingePositionChange('left')}
                    >
                      {t('furniture.left')}
                      <span className={styles.hingeTabSubtitle}>{t('furniture.openToRight')}</span>
                    </button>
                    <button
                      className={`${styles.hingeTab} ${hingePosition === 'right' ? styles.activeHingeTab : ''}`}
                      onClick={() => handleHingePositionChange('right')}
                    >
                      {t('furniture.right')}
                      <span className={styles.hingeTabSubtitle}>{t('furniture.openToLeft')}</span>
                    </button>
                  </div>
                  {isCoverDoor && (
                    <div className={styles.coverDoorNote}>
                      {t('furniture.coverDoorNote')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!showDetails && currentPlacedModule?.hasDoor
            && !isGlassCabinetModule
            && !isDummyModule
            && !(typeof currentPlacedModule?.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame'))
            && !(typeof currentPlacedModule?.moduleId === 'string' && (
              /^(dual-)?lower-drawer-/.test(currentPlacedModule.moduleId)
              || /(^|-)lower-induction-cabinet-/.test(currentPlacedModule.moduleId)
            ))
            && (() => {
              const doorPanels = panelDetails.filter((panel: any) => panel?.isDoor && typeof panel?.height === 'number');
              const lowerDoorPanel = doorPanels.find((panel: any) => String(panel.name || '').includes('하부 도어'));
              const upperDoorPanel = doorPanels.find((panel: any) => String(panel.name || '').includes('상부 도어'));
              const defaultDoorPanel = doorPanels[0];
              const isSplitDoor = !!lowerDoorPanel && !!upperDoorPanel;
              const isUpperModule = moduleData?.category === 'upper' || moduleData?.id?.includes('upper-cabinet');
              const isLowerModule = moduleData?.category === 'lower' || moduleData?.id?.includes('lower-cabinet');
              const isPantrySplit = currentPlacedModule.moduleId?.includes('pantry-cabinet-split');
              const isSinkCabinetHingeModule = currentPlacedModule.moduleId?.includes('lower-sink-cabinet')
                || currentPlacedModule.moduleId?.includes('dual-lower-sink-cabinet');
              const isTopDownDoorCabinetHingeModule = currentPlacedModule.moduleId?.includes('lower-top-down-half')
                || currentPlacedModule.moduleId?.includes('dual-lower-top-down-half');
              const lowerTopHingeInsetMm = currentPlacedModule.moduleId?.includes('shelf-split') ? 140 : 120;
              const moduleBodyHeightMm = Math.round(adjustedFreeHeight ?? placedBodyHeight ?? moduleData?.dimensions.height ?? 0);
              const doorWidthMm = Math.round(doorOriginalWidth ?? customWidth ?? moduleData?.dimensions.width ?? 0);
              const defaultDoorBottomOnSideMm = !isSplitDoor && moduleData
                ? resolveDoorVerticalGeometry({
                  moduleId: moduleData.id,
                  cabinetCategory: (moduleData.category || 'generic') as DoorCabinetCategory,
                  doorWidthMm,
                  cabinetHeightMm: moduleBodyHeightMm,
                  doorTopGapMm: currentPlacedModule.doorTopGap,
                  doorBottomGapMm: currentPlacedModule.doorBottomGap,
                  isDualSlot: currentPlacedModule.isDualSlot,
                  hingeSide: currentPlacedModule.hingePosition ?? 'right',
                  cabinetBottomMm: 0
                }).bottomMm
                : 0;
              const splitDoorBottomsMm = (() => {
                if (!isSplitDoor) {
                  return {
                    lower: 0,
                    upper: 0,
                    lowerFirst: 120,
                    lowerLast: moduleBodyHeightMm - 120,
                    upperFirst: 120,
                    upperLast: moduleBodyHeightMm - 120
                  };
                }

                const sections = Array.isArray(currentPlacedModule.customSections)
                  ? currentPlacedModule.customSections
                  : ((moduleData?.modelConfig as any)?.sections || []);
                const lowerSection = sections[0];
                const lowerSectionTopMm = lowerSection?.heightType === 'absolute'
                  ? Number(lowerSection.height || 0)
                  : Number.isFinite(Number(lowerSection?.height || lowerSection?.heightRatio))
                    ? moduleBodyHeightMm * (Number(lowerSection.height || lowerSection.heightRatio) / 100)
                    : isPantrySplit
                      ? 1825
                      : 860;
                const defaultUpperDoorBottomGapMm = isPantrySplit ? -1 : 20;
                const rawUpperDoorBottomGapMm = currentPlacedModule.upperDoorBottomGap;
                const upperDoorBottomGapMm = typeof rawUpperDoorBottomGapMm === 'number'
                  ? (
                    (!isPantrySplit && rawUpperDoorBottomGapMm === -20)
                      ? defaultUpperDoorBottomGapMm
                      : (isPantrySplit && rawUpperDoorBottomGapMm === 1 ? defaultUpperDoorBottomGapMm : rawUpperDoorBottomGapMm)
                  )
                  : defaultUpperDoorBottomGapMm;
                return {
                  lower: -(currentPlacedModule.lowerDoorBottomGap ?? 0),
                  upper: lowerSectionTopMm - upperDoorBottomGapMm,
                  lowerFirst: 120,
                  lowerLast: lowerSectionTopMm - lowerTopHingeInsetMm,
                  upperFirst: lowerSectionTopMm + 120,
                  upperLast: moduleBodyHeightMm - 120
                };
              })();
              const buildPositions = (
                field: HingePositionsField,
                doorHeightMm: number,
                hingeMode: DoorHingeMode,
                doorBottomOnSideMm: number
              ) => {
                const savedSidePositions = ((currentPlacedModule as any)[field] || [])
                  .filter((position: number) => Number.isFinite(position))
                  .map((position: number) => Math.round(position * 1000) / 1000)
                  .sort((a: number, b: number) => a - b);
                const saved = normalizeDoorHingePositionsMm(
                  savedSidePositions.map((position: number) => position - doorBottomOnSideMm),
                  doorHeightMm
                );
                if (saved.length > 0) {
                  return saved;
                }

                const firstSidePositionMm = field === 'lowerDoorHingePositionsMm'
                  ? splitDoorBottomsMm.lowerFirst
                  : field === 'upperDoorHingePositionsMm'
                    ? splitDoorBottomsMm.upperFirst
                    : 120;
                const lastSidePositionMm = field === 'lowerDoorHingePositionsMm'
                  ? splitDoorBottomsMm.lowerLast
                  : field === 'upperDoorHingePositionsMm'
                    ? splitDoorBottomsMm.upperLast
                    : moduleBodyHeightMm - (isSinkCabinetHingeModule ? 300 : isTopDownDoorCabinetHingeModule ? 180 : 120);
                return resolveSideAnchoredDoorHingePositionsMm({
                    doorHeightMm,
                    doorBottomOnSideMm,
                    defaultDoorPositionsMm: resolveDefaultDoorHingePositionsMm({
                      doorHeightMm,
                      isUpperCabinet: !isSplitDoor && isUpperModule,
                      isLowerCabinet: !isSplitDoor && isLowerModule,
                      hingeMode
                    }),
                    firstSidePositionMm,
                    lastSidePositionMm
                  });
              };
              const groups = isSplitDoor
                ? [
                  {
                    label: '하부 도어 경첩',
                    field: 'lowerDoorHingePositionsMm' as HingePositionsField,
                    doorHeightMm: Math.round(lowerDoorPanel.height),
                    doorBottomOnSideMm: splitDoorBottomsMm.lower,
                    hingeMode: (isPantrySplit ? 'lower4' : 'auto') as DoorHingeMode
                  },
                  {
                    label: '상부 도어 경첩',
                    field: 'upperDoorHingePositionsMm' as HingePositionsField,
                    doorHeightMm: Math.round(upperDoorPanel.height),
                    doorBottomOnSideMm: splitDoorBottomsMm.upper,
                    hingeMode: (isPantrySplit ? 'upper2' : 'auto') as DoorHingeMode
                  }
                ]
                : defaultDoorPanel
                  ? [{
                    label: '도어 경첩',
                    field: 'hingePositionsMm' as HingePositionsField,
                    doorHeightMm: Math.round(defaultDoorPanel.height),
                    doorBottomOnSideMm: defaultDoorBottomOnSideMm,
                    hingeMode: 'auto' as DoorHingeMode
                  }]
                  : [];

              if (groups.length === 0) return null;

              return (
                <div className={styles.propertySection}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h5 className={styles.sectionTitle} style={{ margin: 0 }}>경첩 위치</h5>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--theme-text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isHingePositionEditMode}
                        onChange={(e) => handleHingePositionEditModeChange(e.target.checked)}
                      />
                      경첩 위치 변경
                    </label>
                  </div>
                  {isHingePositionEditMode && groups.map((group) => {
                    // 뷰어(DoorModule)가 실제 표시 중인 경첩 지오메트리를 우선 사용 — 뷰어/우측바 간격 숫자 불일치 방지.
                    // 뷰어가 publish한 값이 없을 때(도어 미렌더 등)만 자체 계산으로 폴백.
                    const renderedGeometry = findDoorHingeGeometry(currentPlacedModule.id, group.field);
                    const doorHeightMm = renderedGeometry
                      ? Math.max(1, Math.round(renderedGeometry.doorHeightMm))
                      : group.doorHeightMm;
                    const doorBottomOnSideMm = renderedGeometry
                      ? renderedGeometry.doorBottomOnSideMm
                      : group.doorBottomOnSideMm;
                    const positions = renderedGeometry && renderedGeometry.doorPositionsMm.length > 0
                      ? normalizeDoorHingePositionsMm(renderedGeometry.doorPositionsMm, doorHeightMm)
                      : buildPositions(group.field, doorHeightMm, group.hingeMode, doorBottomOnSideMm);
                    const displayPositions = positions
                      .map((positionMm, sourceIndex) => ({
                        positionMm,
                        topDistanceMm: bottomToTopHingePositionMm(positionMm, doorHeightMm),
                        sourceIndex
                      }))
                      .sort((a, b) => a.topDistanceMm - b.topDistanceMm);
                    const gapSegments = getHingeGapSegments(positions, doorHeightMm);
                    return (
                      <div key={group.field} style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--theme-text-secondary)', fontWeight: 600 }}>{group.label}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              title="잠긴 간격은 유지하고 나머지 간격을 균등 분배"
                              onClick={() => handleEqualizeHingeGaps(group.field, positions, doorHeightMm, doorBottomOnSideMm)}
                              style={{ border: '1px solid var(--theme-border)', background: 'var(--theme-surface)', color: 'var(--theme-text-primary)', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              등분
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddHingePosition(group.field, positions, doorHeightMm, doorBottomOnSideMm)}
                              style={{ border: '1px solid var(--theme-border)', background: 'var(--theme-surface)', color: 'var(--theme-text-primary)', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              추가
                            </button>
                          </div>
                        </div>
                        {displayPositions.length > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 6px', marginBottom: '8px' }}>
                            {displayPositions.map(({ sourceIndex, topDistanceMm }, displayIndex) => {
                              const draftKey = getHingePositionDraftKey(group.field, sourceIndex);
                              const inputValue = hingePositionDrafts[draftKey] ?? String(topDistanceMm);
                              return (
                                <div key={`${group.field}-position-${sourceIndex}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <label style={{ width: '42px', fontSize: '11px', color: 'var(--theme-text-tertiary)' }}>
                                    {displayIndex + 1}번
                                  </label>
                                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      step={1}
                                      min={1}
                                      max={Math.max(1, doorHeightMm - 1)}
                                      value={inputValue}
                                      onChange={(e) => handleHingePositionValueChange(group.field, sourceIndex, e.target.value, positions, doorHeightMm, doorBottomOnSideMm, draftKey)}
                                      onKeyDownCapture={(e) => handleHingePositionKeyDown(e, group.field, sourceIndex, inputValue, positions, doorHeightMm, doorBottomOnSideMm, draftKey)}
                                      onBlur={() => clearHingePositionDraft(draftKey)}
                                      onFocus={(e) => e.currentTarget.select()}
                                      className={styles.depthInput}
                                      style={{ textAlign: 'center', fontSize: '13px', height: '28px' }}
                                    />
                                    <span className={styles.unit}>mm</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {gapSegments.map(({ label, valueMm, segmentIndex }) => {
                          const draftKey = getHingeGapDraftKey(group.field, segmentIndex);
                          const inputValue = hingeGapDrafts[draftKey] ?? String(valueMm);
                          const hingeLockKey = `${currentPlacedModule.id}:${group.field}`;
                          const isGapLocked = (lockedHingeGaps[hingeLockKey] || []).includes(segmentIndex);
                          return (
                            <div key={`${group.field}-gap-${segmentIndex}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <label style={{ width: '72px', fontSize: '11px', color: 'var(--theme-text-tertiary)' }}>{label}</label>
                              <button
                                type="button"
                                title={isGapLocked ? '간격 잠금 해제' : '간격 잠금 (다른 간격 편집 시 고정)'}
                                onClick={() => toggleHingeGapLock(hingeLockKey, segmentIndex)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '24px',
                                  height: '28px',
                                  padding: 0,
                                  border: `1px solid ${isGapLocked ? '#f59e0b' : 'var(--theme-border)'}`,
                                  borderRadius: '4px',
                                  background: 'var(--theme-surface)',
                                  color: isGapLocked ? '#f59e0b' : 'var(--theme-text-tertiary)',
                                  cursor: 'pointer',
                                  flexShrink: 0
                                }}
                              >
                                {isGapLocked ? <Lock size={13} /> : <Unlock size={13} />}
                              </button>
                              <div className={styles.inputWithUnit} style={{ flex: 1, opacity: isGapLocked ? 0.6 : 1 }}>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  step={1}
                                  min={1}
                                  max={Math.max(1, doorHeightMm - 1)}
                                  value={inputValue}
                                  disabled={isGapLocked}
                                  onChange={(e) => handleHingeGapValueChange(group.field, segmentIndex, e.target.value, positions, doorHeightMm, doorBottomOnSideMm, draftKey)}
                                  onKeyDownCapture={(e) => handleHingeGapKeyDown(e, group.field, segmentIndex, inputValue, positions, doorHeightMm, doorBottomOnSideMm, draftKey)}
                                  onBlur={() => clearHingeGapDraft(draftKey)}
                                  onFocus={(e) => {
                                    setHingeGapEditBases((prev) => ({
                                      ...prev,
                                      [draftKey]: {
                                        topDistancesMm: getHingeTopDistancesMm(positions, doorHeightMm),
                                        doorHeightMm
                                      }
                                    }));
                                    e.currentTarget.select();
                                  }}
                                  className={styles.depthInput}
                                  style={{ textAlign: 'center', fontSize: '13px', height: '28px' }}
                                />
                                <span className={styles.unit}>mm</span>
                              </div>
                            </div>
                          );
                        })}
                        {displayPositions.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                            {displayPositions.map(({ sourceIndex }, displayIndex) => (
                              <button
                                key={`${group.field}-delete-${sourceIndex}`}
                                type="button"
                                disabled={positions.length <= 1}
                                onClick={() => handleRemoveHingePosition(group.field, sourceIndex, positions, doorHeightMm, doorBottomOnSideMm)}
                                style={{ border: '1px solid var(--theme-border)', background: 'var(--theme-surface)', color: positions.length <= 1 ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: positions.length <= 1 ? 'not-allowed' : 'pointer' }}
                              >
                                {displayIndex + 1}번 삭제
                              </button>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', marginTop: '2px' }}>
                          뷰어와 같은 상단/경첩 사이/하단 간격입니다. 체크 시 팝업과 2D 정면뷰에서 직접 수정됩니다.
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

          {/* 레그라박스 마이다 사이즈 설정 — 편집 탭 전용
             대상: 인덕션장(1개), 도어올림 터치 2A/2B/3, 상판내림 터치 2/3
             사용자가 마이다 사이즈를 변경하면 그에 맞는 LEGRABOX 등급(K/C/F) 측판 GLB 자동 매칭 */}
          {!showDetails && currentPlacedModule && (() => {
            const mid = currentPlacedModule.moduleId ?? '';
            // 레그라 모듈 판별
            const isInduction = /(^|-)lower-induction-cabinet-/.test(mid);
            const isDoorLiftTouch2A = mid.includes('lower-door-lift-touch-2tier-a');
            const isDoorLiftTouch2B = mid.includes('lower-door-lift-touch-2tier-b');
            const isDoorLiftTouch3 = mid.includes('lower-door-lift-touch-3tier');
            const isTopDownTouch2 = mid.includes('lower-top-down-touch-2tier');
            const isTopDownTouch3 = mid.includes('lower-top-down-touch-3tier');
            const isLegraModule = isInduction || isDoorLiftTouch2A || isDoorLiftTouch2B
              || isDoorLiftTouch3 || isTopDownTouch2 || isTopDownTouch3;
            if (!isLegraModule) return null;

            // 마이다 개수
            // 인덕션장은 서랍/마이다가 2단(아래 서랍 + 위 가림 마이다)이다.
            // computeLowerCabinetExternalMaidaRanges도 인덕션장에 2개 range를 반환하므로 2로 맞춘다.
            const maidaCount = isInduction ? 2
              : (isDoorLiftTouch2A || isDoorLiftTouch2B || isTopDownTouch2) ? 2
              : 3;

            // 입력칸 표시값은 렌더 등록 치수를 최우선으로 사용한다.
            // 렌더가 아직 등록되기 전 초기 렌더링에만 fallback 값을 만든다.
            const moduleH = Math.round(adjustedFreeHeight || placedBodyHeight || currentPlacedModule.freeHeight || moduleData?.dimensions?.height || 780);
            const stoneThk = (currentPlacedModule as any).stoneTopThickness ?? 20;
            const isTopDownAny = isTopDownTouch2 || isTopDownTouch3;
            const tdStretcherH = stoneThk === 10 ? 65 : stoneThk === 30 ? 45 : 55;
            const defTopExt = isTopDownAny ? -(tdStretcherH + 25) : 30;
            const defBottomExt = 5;
            const topExt = (currentPlacedModule as any).doorTopGap ?? defTopExt;
            const bottomExt = (currentPlacedModule as any).doorBottomGap ?? defBottomExt;
            const maidaTotalFront = moduleH + topExt + bottomExt;
            const gapM = 3;
            const current = (currentPlacedModule.customMaidaHeights ?? []) as number[];
            const fallbackDefaultMaida = computeLowerCabinetExternalMaidaRanges({
              moduleId: mid,
              moduleHeightMm: moduleH,
              sourceModuleHeightMm: moduleData?.dimensions?.height || moduleH,
              stoneTopThicknessMm: stoneThk,
              doorTopGap: (currentPlacedModule as any).doorTopGap,
              doorBottomGap: (currentPlacedModule as any).doorBottomGap,
              hasTopEndPanel: currentPlacedModule.hasTopEndPanel === true,
              basicThicknessMm: moduleData?.modelConfig?.basicThickness || 18
            }).map(range => range.maidaHeightMm);
            const fallbackActiveMaida = computeLowerCabinetExternalMaidaRanges({
              moduleId: mid,
              moduleHeightMm: moduleH,
              sourceModuleHeightMm: moduleData?.dimensions?.height || moduleH,
              stoneTopThicknessMm: stoneThk,
              doorTopGap: (currentPlacedModule as any).doorTopGap,
              doorBottomGap: (currentPlacedModule as any).doorBottomGap,
              hasTopEndPanel: currentPlacedModule.hasTopEndPanel === true,
              basicThicknessMm: moduleData?.modelConfig?.basicThickness || 18,
              customMaidaHeights: current.length === maidaCount ? current : undefined,
              customMaidaHeightsMode: (currentPlacedModule as any).customMaidaHeightsMode
            }).map(range => range.maidaHeightMm);
            const renderedMaida = findRenderedMaidaHeightsBottomToTop(currentPlacedModule.id, mid, maidaCount);
            const defaultMaida = renderedMaida ?? fallbackDefaultMaida;
            const activeMaida = renderedMaida ?? fallbackActiveMaida;
            const totalLimit = maidaTotalFront + 100;
            const gapBetween = 3;

            const applyValue = (idx: number, num: number) => {
              if (!Number.isFinite(num) || num <= 0) return;
              const next = [...(current.length === maidaCount ? current : defaultMaida.slice(0, maidaCount))];
              // 변경 전 base값
              const prevBase = next[idx];
              const newBase = num;
              const delta = newBase - prevBase;
              next[idx] = newBase;
              // 변경된 마이다 윗변이 이동하면 그 위 마이다(idx+1)의 하단이 따라 이동 → 위 마이다 높이 -delta
              // 맨 위(idx === maidaCount-1)는 위에 마이다 없음 → 보정 없음 (가구 천장 넘으면 sum 체크로 alert)
              if (maidaCount > 1 && idx < maidaCount - 1) {
                const aboveIdx = idx + 1;
                const newAboveH = next[aboveIdx] - delta;
                if (newAboveH <= 0) {
                  alert(`위 마이다가 0 이하로 줄어듭니다. 더 작은 값을 입력하세요.`);
                  return;
                }
                next[aboveIdx] = newAboveH;
              }
              const sum = next.reduce((a, b) => a + b, 0) + (maidaCount - 1) * gapBetween;
              if (sum > totalLimit) {
                alert(`마이다 합(${sum}mm)이 가구 영역(${totalLimit}mm)을 초과합니다.`);
                return;
              }
              updatePlacedModule(currentPlacedModule.id, { customMaidaHeights: next });
            };
            const handleChange = (idx: number, raw: string) => {
              const num = parseFloat(raw);
              applyValue(idx, num);
            };
            const handleArrow = (idx: number, dir: 1 | -1) => {
              const baseCur = current[idx] ?? defaultMaida[idx] ?? 0;
              applyValue(idx, baseCur + dir * 0.5);
            };
            const handleReset = () => {
              updatePlacedModule(currentPlacedModule.id, { customMaidaHeights: undefined });
            };

            // di 0=아래, di N-1=위. UI는 위→아래 순서로 표시 (사용자 직관)
            const labels = maidaCount === 1
              ? ['1단']
              : maidaCount === 2
                ? ['1단(위)', '2단(아래)']
                : ['1단(위)', '2단(중간)', '3단(아래)'];
            // UI 인덱스 i → 내부 인덱스 di: 위가 di=N-1, 아래가 di=0
            const toInternalIdx = (uiIdx: number) => (maidaCount - 1) - uiIdx;

            const editEnabled = current.length === maidaCount;
            const initMaida = defaultMaida.slice(0, maidaCount);
            const toggleEdit = () => {
              if (editEnabled) {
                updatePlacedModule(currentPlacedModule.id, { customMaidaHeights: undefined });
              } else {
                updatePlacedModule(currentPlacedModule.id, {
                  customMaidaHeights: initMaida.slice(0, maidaCount),
                });
              }
            };
            // 마이다 크기 변경 입력은 위 "마이다치수" 칸으로 일원화(제거됨). 여기선 레그라 종류만 표시.
            void editEnabled; void toggleEdit; void handleChange; void handleArrow; void handleReset;
            void labels; void toInternalIdx; void activeMaida; void defaultMaida; void current;
            return (
              <div className={styles.propertySection}>
                {/* 레그라 서랍 종류 선택 드롭다운 (tier별) */}
                {(() => {
                  const legraTypes = ((currentPlacedModule as any).legraDrawerTypes ?? []) as ('M' | 'L' | 'F' | undefined)[];
                  const setLegraType = (di: number, type: 'M' | 'L' | 'F' | '') => {
                    const next: (('M' | 'L' | 'F') | undefined)[] = Array.from({ length: maidaCount }, (_, i) => legraTypes[i]);
                    next[di] = type === '' ? undefined : (type as 'M' | 'L' | 'F');
                    const allEmpty = next.every(v => v === undefined);
                    updatePlacedModule(currentPlacedModule.id, {
                      legraDrawerTypes: allEmpty ? undefined : (next as any),
                    } as any);
                  };
                  // 모듈별 기본 서랍 본체 높이 (drawerHeights, di=0(아래)→di=N(위) 순서)
                  const drawerHeightsByModule: number[] =
                    isDoorLiftTouch2A ? [228, 228]
                    : isDoorLiftTouch2B ? [228, 228]
                    : isDoorLiftTouch3 ? [228, 117, 117]
                    : isTopDownTouch2 ? [228, 228]
                    : isTopDownTouch3 ? [164, 164, 164]
                    : isInduction ? [228, 164]  // di=0(아래 1단)=228(대), di=1(위 2단)=164(중)
                    : [228, 228];
                  // drawerHeight → 자동 매칭된 레그라 종류
                  const autoLegraType = (dh: number): 'M' | 'L' | 'F' =>
                    dh >= 200 ? 'F' : dh <= 120 ? 'M' : 'L';
                  // 인덕션장: 아래 서랍(di=0)은 Y좌표 기준 자동 등급(수동·마이다 크기 무시).
                  //  렌더(LowerCabinet)와 동일: 서랍 측판 상단 Y ≤ 아래 마이다 상단 Y 인 가장 큰 등급.
                  //   서랍 측판 바닥(mm) = basicThickness(18) + bottomGap(28) = 46
                  //   아래 마이다 상단 Y(mm) = 마이다1 바닥(-5 - bottomExt) + 마이다1 높이(activeMaida[0])
                  const indBottomExt = ((currentPlacedModule as any).doorBottomGap ?? 5) - 5;
                  const indDrawer1BaseBottom = 18 + 28;
                  const indMaida1TopY = (-5 - indBottomExt) + (activeMaida[0] ?? 0);
                  const maidaAutoLegraType = (): 'M' | 'L' | 'F' =>
                    (indDrawer1BaseBottom + 228 <= indMaida1TopY) ? 'F'
                    : (indDrawer1BaseBottom + 164 <= indMaida1TopY) ? 'L' : 'M';
                  return (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', marginBottom: '6px' }}>
                        레그라 서랍 종류
                      </div>
                      <div className={styles.epRow} style={{ gap: '8px' }}>
                        {labels.map((label, uiIdx) => {
                          const di = toInternalIdx(uiIdx);
                          const autoType = autoLegraType(drawerHeightsByModule[di] ?? 164);
                          // 터치서랍: 렌더가 저장한 자동등급(legraDrawerTypesAuto)을 표시 → 렌더와 실시간 일치.
                          //  수동 선택(legraTypes)이 있으면 그게 우선(측판 렌더도 동일 우선순위).
                          const renderAuto = ((currentPlacedModule as any).legraDrawerTypesAuto?.[di]) as ('M'|'L'|'F') | undefined;
                          // 인덕션 아래 서랍은 마이다 기준 자동(읽기전용)
                          const inductionAutoLower = isInduction && di === 0
                            ? maidaAutoLegraType()
                            : undefined;
                          const cur = inductionAutoLower ?? legraTypes[di] ?? renderAuto ?? autoType;
                          const isReadOnlyLegra = inductionAutoLower !== undefined;
                          return (
                            <div key={uiIdx} className={styles.epField} style={{ flex: '1 1 0' }}>
                              <label className={styles.epFieldLabel}>{label}</label>
                              <select
                                value={cur}
                                disabled={isReadOnlyLegra}
                                onChange={(e) => { if (!isReadOnlyLegra) setLegraType(di, e.target.value as any); }}
                                style={{
                                  width: '100%',
                                  padding: '4px',
                                  fontSize: '12px',
                                  border: '1px solid var(--theme-border)',
                                  borderRadius: '4px',
                                  background: 'var(--theme-surface)',
                                  color: isReadOnlyLegra ? 'var(--theme-text-secondary)' : 'var(--theme-text-primary)',
                                  cursor: isReadOnlyLegra ? 'default' : 'pointer',
                                }}
                              >
                                <option value="M">소</option>
                                <option value="L">중</option>
                                <option value="F">대</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}


          {/* 상,걸래받이 — 우측바와 동일 형태 (해당 가구 단일) — 편집 탭 전용 */}
          {!showDetails && currentPlacedModule && !currentPlacedModule.isSurroundPanel && (() => {
            const mod = currentPlacedModule;
            const globalTop = spaceInfo.frameSize?.top ?? 30;
            const globalBase = spaceInfo.baseConfig?.height ?? 65;
            const isStandType = spaceInfo.baseConfig?.type === 'stand';
            const isLowerMod = mod.moduleId?.startsWith('lower-') || mod.moduleId?.includes('-lower-');
            const bfMin = isLowerMod ? 60 : 40;
            const bfMax = isLowerMod ? 150 : 100;
            const bfDefault = isLowerMod ? 105 : 60;

            const topEnabled = mod.hasTopFrame !== false;
            const baseEnabled = mod.hasBase !== false;
            const rawTopSize = mod.topFrameThickness ?? globalTop;
            const fullBodyHeightForTop = mod.freeHeight
              ?? mod.customHeight
              ?? mod.cabinetBodyHeight
              ?? moduleData?.dimensions.height
              ?? 0;
            const computedFullTopSize = moduleData?.category === 'full' && fullBodyHeightForTop > 0
              ? computeTopOffGapForBodyHeight(mod, spaceInfo, fullBodyHeightForTop)
              : null;
            const computeShelfSplitTopDistance = (targetMod: typeof mod) => {
              const sections = Array.isArray((targetMod as any).customSections) ? (targetMod as any).customSections : [];
              if (!isShelfSplitModuleId(targetMod?.moduleId) || sections.length < 2) return null;
              const baseDistance = targetMod.hasBase === false
                ? (targetMod.individualFloatHeight ?? 0)
                : (targetMod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
              const sectionTop = baseDistance + sections
                .slice(0, 2)
                .reduce((sum: number, section: any) => sum + (Number(section?.height) || 0), 0);
              return Math.max(0, Math.round((spaceInfo.height ?? 0) - sectionTop));
            };
            const actualShelfSplitTopSize = computeShelfSplitTopDistance(mod);
            const topSize = topEnabled
              ? (computedFullTopSize ?? rawTopSize)
              : (actualShelfSplitTopSize ?? computedFullTopSize ?? Math.max(0, mod.topFrameGap ?? rawTopSize));
            // 서라운드(전체/양쪽 포함) + 상부장일 때 기본 옵셋 23mm
            const isUpperCat = mod.moduleId?.includes('upper-cabinet') || mod.moduleId?.startsWith('upper-');
            const isSurroundForOffset = spaceInfo.surroundType === 'surround';
            const isFullSurroundForDoorGap = spaceInfo.surroundType === 'surround'
              && spaceInfo.frameConfig?.top !== false;
            const topDoorGapOn = isFullSurroundForDoorGap ? -3 : 5;
            const topOffsetDefault = (isUpperCat && isSurroundForOffset) ? 23 : 0;
            const globalTopOffset = (spaceInfo.frameSize as any)?.topOffset;
            const topOffset = mod.topFrameOffset ?? globalTopOffset ?? topOffsetDefault;
            const topGap = topEnabled ? (mod.topFrameGap ?? 0) : (mod.topFrameGap ?? topSize);
            const guideBaseSlotForModule = (() => {
              const guideSlots = spaceInfo.freePlacementGuides || [];
              if (guideSlots.length === 0) return undefined;
              const category = getModuleCategory(mod as any);
              if (category === 'upper') return undefined;
              const isGuideModule = mod.guideSlotPlacement === true
                || mod.guideDepthPlacement === true
                || (spaceInfo.customGuideMode === true && mod.isFreePlacement === true);
              if (!isGuideModule) return undefined;
              if (spaceInfo.guideBaseFrameAllMode !== false) {
                return guideSlots.find((slot: any) => (slot.guideZone || 'full') === 'lower')
                  ?? guideSlots.find((slot: any) => (slot.guideZone || 'full') === 'full');
              }
              const moduleBounds = getModuleBoundsX(mod as any);
              const targetZone = mod.guideSlotZone || category;
              return guideSlots.find((slot: any) => {
                const zone = slot.guideZone || 'full';
                if (zone === 'upper') return false;
                if (targetZone !== 'full' && zone !== targetZone) return false;
                const slotLeft = slot.x - spaceInfo.width / 2;
                const slotRight = slot.x + slot.width - spaceInfo.width / 2;
                return moduleBounds.left < slotRight - 0.5 && moduleBounds.right > slotLeft + 0.5;
              }) ?? guideSlots.find((slot: any) => (slot.guideZone || 'full') === 'lower')
                ?? guideSlots.find((slot: any) => (slot.guideZone || 'full') === 'full');
            })();
            const syncGuideBaseSlotForModule = (updates: Record<string, any>) => {
              if (!guideBaseSlotForModule) return;
              const guideSlots = spaceInfo.freePlacementGuides || [];
              const syncAllBaseSlots = spaceInfo.guideBaseFrameAllMode !== false;
              setSpaceInfo({
                freePlacementGuides: guideSlots.map((slot: any) => {
                  const zone = slot.guideZone || 'full';
                  if (zone === 'upper') return slot;
                  if (syncAllBaseSlots || slot.id === guideBaseSlotForModule.id) {
                    return { ...slot, ...updates };
                  }
                  return slot;
                })
              });
            };
            const commitTopOffset = (nextOffset: number) => {
              if (spaceInfo.guideTopFrameAllMode !== false) {
                setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, topOffset: nextOffset } as any });
              }
              updatePlacedModule(mod.id, { topFrameOffset: nextOffset });
            };
            const commitBaseOffset = (nextOffset: number) => {
              if (spaceInfo.guideBaseFrameAllMode !== false) {
                setSpaceInfo(isLowerMod
                  ? { baseboardLowerOffset: nextOffset }
                  : { baseConfig: { ...spaceInfo.baseConfig, offset: nextOffset } as any }
                );
              }
              syncGuideBaseSlotForModule({ baseFrameOffset: nextOffset });
              updatePlacedModule(mod.id, { baseFrameOffset: nextOffset });
            };
            const commitBaseGap = (nextGap: number) => {
              if (spaceInfo.guideBaseFrameAllMode !== false) {
                setSpaceInfo(isLowerMod
                  ? { baseboardLowerGap: nextGap }
                  : { baseConfig: { ...spaceInfo.baseConfig, gap: nextGap } as any }
                );
              }
              syncGuideBaseSlotForModule({ baseFrameGap: nextGap });
              updatePlacedModule(mod.id, { baseFrameGap: nextGap });
            };
            const baseSize = isLowerMod
              ? (mod.baseFrameHeight ?? guideBaseSlotForModule?.baseFrameHeight ?? spaceInfo.baseboardLowerSize ?? bfDefault)
              : (spaceInfo.guideBaseFrameAllMode !== false
                ? (spaceInfo.baseConfig?.height ?? mod.baseFrameHeight ?? bfDefault)
                : (guideBaseSlotForModule?.baseFrameHeight ?? mod.baseFrameHeight ?? bfDefault));
            const baseOffset = spaceInfo.guideBaseFrameAllMode !== false
              ? (isLowerMod
                ? (mod.baseFrameOffset ?? spaceInfo.baseboardLowerOffset ?? (spaceInfo.baseConfig as any)?.offset ?? 0)
                : (mod.baseFrameOffset ?? (spaceInfo.baseConfig as any)?.offset ?? 0))
              : (guideBaseSlotForModule?.baseFrameOffset ?? mod.baseFrameOffset ?? 0);
            const baseGap = spaceInfo.guideBaseFrameAllMode !== false
              ? (isLowerMod
                ? (spaceInfo.baseboardLowerGap ?? mod.baseFrameGap ?? 0)
                : ((spaceInfo.baseConfig as any)?.gap ?? mod.baseFrameGap ?? 0))
              : (guideBaseSlotForModule?.baseFrameGap ?? mod.baseFrameGap ?? 0);
            const getEndPanelGapSyncUpdates = (nextFrameState: Partial<typeof mod>) => {
              if (!mod.hasLeftEndPanel && !mod.hasRightEndPanel) return {};
              const updates: Record<string, number> = {};
              if ('hasTopFrame' in nextFrameState || 'topFrameThickness' in nextFrameState) {
                const nextTopEnabled = nextFrameState.hasTopFrame ?? topEnabled;
                const nextTopSize = nextFrameState.topFrameThickness ?? rawTopSize;
                updates.endPanelTopOffset = nextTopEnabled === false ? 0 : nextTopSize;
              }
              if ('hasBase' in nextFrameState || 'baseFrameHeight' in nextFrameState) {
                const nextBaseEnabled = nextFrameState.hasBase ?? baseEnabled;
                const nextBaseSize = nextFrameState.baseFrameHeight ?? baseSize;
                updates.endPanelBottomOffset = nextBaseEnabled === false ? 0 : nextBaseSize;
              }
              return updates;
            };

            const toggleStyle = (on: boolean): React.CSSProperties => ({
              width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              backgroundColor: on ? 'var(--theme-primary, #4a90d9)' : '#ccc',
              position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
            });
            const knobStyle = (on: boolean): React.CSSProperties => ({
              position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%',
              backgroundColor: '#fff', transition: 'left 0.2s', left: on ? '18px' : '2px',
            });
            const cellStyle: React.CSSProperties = {
              flex: 1, display: 'flex', alignItems: 'center', gap: '2px',
              border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px',
            };
            const cellLabelStyle: React.CSSProperties = { fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 };
            const inputStyle: React.CSSProperties = {
              width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center',
              background: 'transparent', color: 'var(--theme-text-primary)',
            };
            const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' };
            const labelStyle: React.CSSProperties = { minWidth: '50px', fontSize: '11px', color: 'var(--theme-text-secondary)', fontWeight: 500 };
            const renderFrameWidthAdjustControls = (
              frameType: 'top' | 'base',
              title: string
            ) => {
              const enabledField = frameType === 'top' ? 'topFrameWidthAdjustEnabled' : 'baseFrameWidthAdjustEnabled';
              const leftField = frameType === 'top' ? 'topFrameLeftAdjustMm' : 'baseFrameLeftAdjustMm';
              const rightField = frameType === 'top' ? 'topFrameRightAdjustMm' : 'baseFrameRightAdjustMm';
              const enabled = !!(mod as any)[enabledField];
              const leftValue = (mod as any)[leftField] ?? 0;
              const rightValue = (mod as any)[rightField] ?? 0;
              const clampAdjust = (value: number) => Math.max(-500, Math.min(500, value));
              const commitAdjust = (field: string, value: number) => {
                updatePlacedModule(mod.id, {
                  [enabledField]: true,
                  [field]: clampAdjust(value),
                } as any);
              };
              const renderAdjustInput = (field: string, value: number, label: string) => (
                <div style={cellStyle}>
                  <span style={cellLabelStyle}>{label}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={value !== 0 ? value : ''}
                    placeholder="0"
                    onFocus={() => setHighlightedFrame(`${frameType}-${mod.id}` as any)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        commitAdjust(field, value + (e.key === 'ArrowUp' ? 1 : -1));
                      } else if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                        commitAdjust(field, v === '' || v === '-' ? 0 : parseInt(v, 10));
                      }
                    }}
                    onBlur={(e) => {
                      setHighlightedFrame(null);
                      commitAdjust(field, parseInt(e.target.value, 10) || 0);
                    }}
                    style={inputStyle}
                  />
                </div>
              );

              return (
                <div style={{ marginTop: '4px', paddingLeft: '56px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => updatePlacedModule(mod.id, { [enabledField]: e.target.checked } as any)}
                        style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                      />
                      <span>{title}</span>
                    </label>
                    {enabled && (
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        {renderAdjustInput(leftField, leftValue, '좌')}
                        {renderAdjustInput(rightField, rightValue, '우')}
                      </div>
                    )}
                  </div>
                </div>
              );
            };
            const getUpperShelfGapSyncUpdates = (nextFrameState: Partial<typeof mod>) => {
              const nextMod = { ...mod, ...nextFrameState } as typeof mod;
              const basicThicknessMm = (spaceInfo as any).panelThickness || 18;
              const sections = (nextFrameState as any).customSections
                ?? (mod as any).customSections
                ?? (mod as any).customConfig?.sections
                ?? moduleData?.modelConfig?.sections;
              const hasExplicitCustomSections = Array.isArray((mod as any).customSections);
              const sectionList = Array.isArray(sections) ? sections : [];
              const upperHangingIndex = (() => {
                for (let i = sectionList.length - 1; i >= 0; i--) {
                  const section = sectionList[i] as any;
                  if (
                    section.type === 'hanging' &&
                    Array.isArray(section.shelfPositions) &&
                    section.shelfPositions.some((pos: number) => pos > 0)
                  ) {
                    return i;
                  }
                }
                for (let i = sectionList.length - 1; i >= 0; i--) {
                  if ((sectionList[i] as any).type === 'hanging') return i;
                }
                return -1;
              })();
              if (upperHangingIndex < 0) return {};

              const getEffectiveTotalHeight = (targetMod: typeof mod) => {
                const baseTotalHeight = targetMod.freeHeight
                  || targetMod.customHeight
                  || moduleData?.dimensions?.height
                  || 0;
                const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
                const topFrameMm = targetMod.topFrameThickness ?? globalTopFrame;
                const topFrameDelta = targetMod.topFrameThickness !== undefined
                  ? topFrameMm - globalTopFrame
                  : 0;
                const shouldAbsorbTopForHeight = moduleData?.category === 'full';
                const absorbedTopHeight = shouldAbsorbTopForHeight && targetMod.hasTopFrame === false
                  ? Math.max(0, topFrameMm - (targetMod.topFrameGap ?? 0))
                  : 0;
                const absorbedBaseHeight = targetMod.hasBase === false
                  ? ((targetMod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0))
                    - (targetMod.individualFloatHeight ?? 0))
                  : 0;
                const isStandTypeForHeight = spaceInfo.baseConfig?.type === 'stand';
                const baseFrameDelta = targetMod.baseFrameHeight !== undefined && !isStandTypeForHeight
                  ? targetMod.baseFrameHeight - (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0)
                  : 0;
                return Math.max(0, baseTotalHeight - topFrameDelta - baseFrameDelta + absorbedTopHeight + absorbedBaseHeight);
              };
              const getSectionHeight = (sectionIndex: number, targetMod: typeof mod) => {
                const section = sectionList[sectionIndex] as any;
                if (!section) return 0;
                if (sectionList.length >= 2 && sectionIndex === sectionList.length - 1) {
                  const previousSectionsHeight = sectionList
                    .slice(0, sectionIndex)
                    .reduce((sum: number, prevSection: any) => sum + (prevSection.height || 0), 0);
                  return Math.max(0, getEffectiveTotalHeight(targetMod) - previousSectionsHeight);
                }
                return section.height || 0;
              };

              const upperSection = sectionList[upperHangingIndex] as any;
              const shelfPositions = Array.isArray(upperSection.shelfPositions)
                ? upperSection.shelfPositions
                : [];
              const safetyIndex = shelfPositions.findIndex((pos: number) => pos > 0);
              if (safetyIndex < 0) return {};
              const getRenderedShelfPosition = (section: any, sectionHeight: number) => {
                const rawPos = shelfPositions[safetyIndex];
                if (hasExplicitCustomSections || upperHangingIndex !== sectionList.length - 1) {
                  return rawPos;
                }
                const originalInnerH = Math.max(0, (section.height || 0) - 2 * basicThicknessMm);
                const renderedInnerH = Math.max(0, sectionHeight - 2 * basicThicknessMm);
                const originalGap = Math.max(0, Math.round(
                  originalInnerH -
                  rawPos -
                  basicThicknessMm / 2
                ));
                return Math.max(0, Math.round(renderedInnerH - originalGap - basicThicknessMm / 2));
              };
              const currentSectionHeight = getSectionHeight(upperHangingIndex, mod);
              const currentShelfPos = getRenderedShelfPosition(upperSection, currentSectionHeight);
              const currentGap = Math.max(0, Math.round(
                Math.max(0, currentSectionHeight - 2 * basicThicknessMm) -
                currentShelfPos -
                basicThicknessMm / 2
              ));
              const nextInnerH = Math.max(0, getSectionHeight(upperHangingIndex, nextMod) - 2 * basicThicknessMm);
              const nextShelfPos = Math.max(0, Math.round(nextInnerH - currentGap - basicThicknessMm / 2));
              const nextSections = sectionList.map((section: any, index: number) => {
                if (index !== upperHangingIndex) return section;
                const nextShelfPositions = Array.isArray(section.shelfPositions)
                  ? [...section.shelfPositions]
                  : [];
                nextShelfPositions[safetyIndex] = nextShelfPos;
                return { ...section, shelfPositions: nextShelfPositions };
              });
              return {
                upperShelfTopGap: currentGap,
                customSections: nextSections,
              };
            };
            const getTopSizeSyncUpdates = (nextSize: number) => {
              const sections = Array.isArray((mod as any).customSections) ? (mod as any).customSections : [];
              if (!isShelfSplitModuleId(mod?.moduleId) || sections.length < 2) {
                return { topFrameThickness: nextSize };
              }
              const baseDistance = mod.hasBase === false
                ? (mod.individualFloatHeight ?? 0)
                : (mod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
              const lowerH = Number(sections[0]?.height) || 0;
              const nextUpperH = Math.max(100, (spaceInfo.height ?? 0) - baseDistance - nextSize - lowerH);
              const nextSections = sections.map((section: any, index: number) => (
                index === 1 ? { ...section, height: nextUpperH, heightType: 'absolute' } : section
              ));
              return {
                topFrameThickness: nextSize,
                customSections: nextSections,
                upperDoorHingePositionsMm: undefined,
              };
            };
            const getShelfSplitTopClearanceUpdates = (nextState: Record<string, any>) => {
              const sections = Array.isArray((mod as any).customSections) ? (mod as any).customSections : [];
              if (!isShelfSplitModuleId(mod?.moduleId) || sections.length < 2) {
                return nextState;
              }
              const nextHasTopFrame = nextState.hasTopFrame ?? mod.hasTopFrame;
              const nextTopFrameThickness = nextState.topFrameThickness ?? mod.topFrameThickness ?? rawTopSize;
              const nextTopGap = nextState.topFrameGap ?? mod.topFrameGap ?? actualShelfSplitTopSize ?? rawTopSize;
              const topClearance = nextHasTopFrame === false
                ? Math.max(0, nextTopGap)
                : Math.max(0, nextTopFrameThickness);
              const nextHasBase = nextState.hasBase ?? mod.hasBase;
              const nextIndividualFloatHeight = nextState.individualFloatHeight ?? mod.individualFloatHeight;
              const nextBaseFrameHeight = nextState.baseFrameHeight ?? mod.baseFrameHeight;
              const baseDistance = nextHasBase === false
                ? (nextIndividualFloatHeight ?? 0)
                : (nextBaseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
              const lowerH = Number(sections[0]?.height) || 0;
              const nextUpperH = Math.max(100, (spaceInfo.height ?? 0) - baseDistance - topClearance - lowerH);
              const nextSections = sections.map((section: any, index: number) => (
                index === 1 ? { ...section, height: nextUpperH, heightType: 'absolute' } : section
              ));
              return {
                ...nextState,
                customSections: nextSections,
                upperDoorHingePositionsMm: undefined,
              };
            };
            const getBaseSizeSyncUpdates = (nextSize: number) => {
              const clampedSize = Math.max(0, nextSize);
              const currentBase = baseSize ?? (spaceInfo.baseConfig?.height ?? 65);
              const baseDelta = currentBase - clampedSize;
              const sections = Array.isArray((mod as any).customSections) ? (mod as any).customSections : [];

              if (isShelfSplitModuleId(mod?.moduleId) && sections.length >= 2) {
                const lowerH = Number(sections[0]?.height) || 0;
                const currentUpperH = Number(sections[1]?.height) || 0;
                const availableAfterBaseAndLower = Math.max(0, (spaceInfo.height ?? 0) - clampedSize - lowerH);
                const nextUpperH = Math.min(
                  availableAfterBaseAndLower,
                  Math.max(100, currentUpperH + baseDelta)
                );
                const nextTopFrameH = Math.max(0, Math.round(availableAfterBaseAndLower - nextUpperH));
                const nextSections = sections.map((section: any, index: number) => (
                  index === 1
                    ? { ...section, height: nextUpperH, heightType: 'absolute' }
                    : section
                ));
                return {
                  baseFrameHeight: clampedSize,
                  topFrameThickness: nextTopFrameH,
                  customSections: nextSections,
                  upperDoorHingePositionsMm: undefined,
                };
              }

              return { baseFrameHeight: clampedSize };
            };

            return (
              <>
              {/* 상단몰딩 — 하부장은 천장과 무관하므로 숨김 */}
              {!isLowerMod && (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>상단몰딩</h5>

                {/* 상단 몰딩 */}
                <div style={rowStyle}>
                  <span style={labelStyle}>전체</span>
	                  <button
	                    onClick={() => {
	                      const nextHasTopFrame = !topEnabled;
	                      const storedBodyHeight = mod.freeHeight
	                        ?? mod.customHeight
	                        ?? mod.cabinetBodyHeight
	                        ?? moduleData?.dimensions.height
	                        ?? 0;
	                      const legacySubtractedTop = mod.hasTopFrame === false
	                        ? Math.max(0, (mod.topFrameThickness ?? globalTop) - (mod.topFrameGap ?? 0))
	                        : 0;
	                      const restoredBodyHeight = nextHasTopFrame
	                        && moduleData?.category === 'full'
	                        && legacySubtractedTop > 0
	                        ? storedBodyHeight + legacySubtractedTop
	                        : storedBodyHeight;
	                      const bodySectionUpdate = moduleData?.category === 'full'
	                        ? buildFreePlacementBodyHeightSectionUpdate(restoredBodyHeight)
	                        : { bodyHeight: restoredBodyHeight };
	                      const bodyHeightForClearance = bodySectionUpdate.bodyHeight;
	                      const nextTopClearance = moduleData?.category === 'full' && bodyHeightForClearance > 0
	                        ? computeTopOffGapForBodyHeight(mod, spaceInfo, bodyHeightForClearance)
	                        : topSize;
	                      const nextState: any = {
	                        hasTopFrame: nextHasTopFrame,
	                        topFrameThickness: nextTopClearance,
	                        topFrameGap: nextHasTopFrame ? 0 : nextTopClearance,
	                        doorTopGap: nextHasTopFrame ? topDoorGapOn : -5,
	                        ...getEndPanelGapSyncUpdates({ hasTopFrame: nextHasTopFrame }),
	                        ...getUpperShelfGapSyncUpdates({ hasTopFrame: nextHasTopFrame }),
	                      };
	                      if (nextHasTopFrame && moduleData?.category === 'full' && bodyHeightForClearance > 0) {
	                        nextState.freeHeight = bodyHeightForClearance;
	                        nextState.userResizedHeight = true;
	                      }
	                      if (bodySectionUpdate.sections) {
	                        nextState.customSections = bodySectionUpdate.sections;
	                      }
	                      updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(nextState));
	                      setSectionHeightInputs({}); // 흡수된 높이 재계산 위해 섹션 캐시 초기화
	                    }}
                    style={toggleStyle(topEnabled)}
                  >
                    <span style={knobStyle(topEnabled)} />
                  </button>
	                  <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
	                    {topEnabled && (
	                      <>
	                        <div style={cellStyle}>
	                          <span style={cellLabelStyle}>높이</span>
	                          <input type="text" inputMode="numeric"
	                            value={topSize || ''} placeholder="0"
	                            onFocus={() => setHighlightedFrame(`top-${mod.id}` as any)}
	                            onKeyDown={(e) => {
	                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
	                                e.preventDefault();
	                                const next = Math.max(0, Math.min(9999, (topSize || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                                  const topSizeUpdates = getTopSizeSyncUpdates(next);
	                                updatePlacedModule(mod.id, {
	                                  ...topSizeUpdates,
	                                  ...getEndPanelGapSyncUpdates({ topFrameThickness: next }),
	                                  ...getUpperShelfGapSyncUpdates(topSizeUpdates),
	                                });
	                              } else if (e.key === 'Enter') {
	                                (e.target as HTMLInputElement).blur();
	                              }
	                            }}
	                            onChange={(e) => {
	                              const v = e.target.value;
	                              if (v === '' || /^\d+$/.test(v)) {
	                                const num = v === '' ? 0 : parseInt(v, 10);
	                                const next = Math.max(0, Math.min(9999, num));
                                  const topSizeUpdates = getTopSizeSyncUpdates(next);
	                                updatePlacedModule(mod.id, {
	                                  ...topSizeUpdates,
	                                  ...getEndPanelGapSyncUpdates({ topFrameThickness: next }),
	                                  ...getUpperShelfGapSyncUpdates(topSizeUpdates),
	                                });
	                              }
	                            }}
	                            onBlur={(e) => {
	                              setHighlightedFrame(null);
	                              const clamped = Math.max(0, Math.min(9999, parseInt(e.target.value) || 0));
                                const topSizeUpdates = getTopSizeSyncUpdates(clamped);
	                              updatePlacedModule(mod.id, {
	                                ...topSizeUpdates,
	                                ...getEndPanelGapSyncUpdates({ topFrameThickness: clamped }),
	                                ...getUpperShelfGapSyncUpdates(topSizeUpdates),
	                              });
	                            }}
	                            style={inputStyle}
	                          />
	                        </div>
	                        <div style={cellStyle}>
	                          <span style={cellLabelStyle}>옵셋</span>
	                          <input type="text" inputMode="numeric"
	                            value={topOffset !== 0 ? topOffset : ''} placeholder="0"
	                            onFocus={() => setHighlightedFrame(`top-${mod.id}` as any)}
	                            onKeyDown={(e) => {
	                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
	                                e.preventDefault();
	                                const next = Math.max(-200, Math.min(200, (topOffset || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
	                                commitTopOffset(next);
	                              } else if (e.key === 'Enter') {
	                                (e.target as HTMLInputElement).blur();
	                              }
	                            }}
	                            onChange={(e) => {
	                              const v = e.target.value;
	                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
	                                commitTopOffset(v === '' || v === '-' ? 0 : parseInt(v, 10));
	                              }
	                            }}
	                            onBlur={(e) => {
	                              setHighlightedFrame(null);
	                              const clamped = Math.max(-200, Math.min(200, parseInt(e.target.value) || 0));
	                              commitTopOffset(clamped);
	                            }}
	                            style={inputStyle}
	                          />
	                        </div>
	                      </>
	                    )}
	                    <div style={cellStyle}>
	                      <span style={cellLabelStyle}>{topEnabled ? '갭' : '상단갭'}</span>
	                      <input type="text" inputMode="numeric"
	                        value={topGap !== 0 ? topGap : ''} placeholder="0"
	                        onFocus={() => setHighlightedFrame(`top-${mod.id}` as any)}
	                        onKeyDown={(e) => {
	                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
	                            e.preventDefault();
	                            const next = Math.max(0, Math.min(2000, (topGap || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
		                            updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates({
		                              topFrameGap: next,
		                              ...getUpperShelfGapSyncUpdates({ topFrameGap: next }),
		                            }));
	                          } else if (e.key === 'Enter') {
	                            (e.target as HTMLInputElement).blur();
	                          }
	                        }}
	                        onChange={(e) => {
	                          const v = e.target.value;
	                          if (v === '' || /^\d+$/.test(v)) {
	                            const num = v === '' ? 0 : parseInt(v, 10);
	                            const next = Math.max(0, Math.min(2000, num));
		                            updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates({
		                              topFrameGap: next,
		                              ...getUpperShelfGapSyncUpdates({ topFrameGap: next }),
		                            }));
	                          }
	                        }}
	                        onBlur={(e) => {
	                          setHighlightedFrame(null);
	                          const clamped = Math.max(0, Math.min(2000, parseInt(e.target.value) || 0));
		                          updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates({
		                            topFrameGap: clamped,
		                            ...getUpperShelfGapSyncUpdates({ topFrameGap: clamped }),
		                          }));
	                        }}
	                        style={inputStyle}
	                      />
	                    </div>
	                  </div>
                </div>

                {topEnabled && renderFrameWidthAdjustControls('top', '폭확장')}

              </div>
              )}

              {/* 걸레받이 — stand 타입/상부장이면 숨김. 별도 섹션으로 분리 */}
              {!isStandType && !isUpperCat && (
                <div className={styles.propertySection}>
                  <h5 className={styles.sectionTitle}>걸레받이</h5>
                  <div style={rowStyle}>
                    <span style={labelStyle}>전체</span>
	                    <button
	                      onClick={() => {
	                        const nextHasBase = !baseEnabled;
	                        const nextFrameState = {
	                          hasBase: nextHasBase,
	                          ...(baseEnabled ? { individualFloatHeight: 0 } : {}),
	                        };
	                        syncGuideBaseSlotForModule(nextFrameState);
	                        updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates({
	                          ...nextFrameState,
	                          doorBottomGap: nextHasBase ? 25 : -5,
                          ...getEndPanelGapSyncUpdates(nextFrameState),
                          ...getUpperShelfGapSyncUpdates(nextFrameState),
                        }));
                        setSectionHeightInputs({}); // 흡수된 높이 재계산 위해 섹션 캐시 초기화
                      }}
                      style={toggleStyle(baseEnabled)}
                    >
                      <span style={knobStyle(baseEnabled)} />
                    </button>
                    {baseEnabled ? (
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>높이</span>
                          <input type="text" inputMode="numeric"
                            value={baseSize || ''} placeholder="0"
                            onFocus={() => setHighlightedFrame(`base-${mod.id}` as any)}
                            onKeyDown={(e) => {
		                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
		                              e.preventDefault();
		                                const next = Math.max(bfMin, Math.min(bfMax, baseSize + (e.key === 'ArrowUp' ? 1 : -1)));
		                                syncGuideBaseSlotForModule({ baseFrameHeight: next });
		                                updatePlacedModule(mod.id, {
	                                  ...getEndPanelGapSyncUpdates({ baseFrameHeight: next }),
	                                  ...getUpperShelfGapSyncUpdates({ baseFrameHeight: next }),
                                  ...getBaseSizeSyncUpdates(next),
                                });
                              } else if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
	                              if (v === '' || /^\d+$/.test(v)) {
		                                const num = v === '' ? 0 : parseInt(v, 10);
		                                const next = num > bfMax ? bfMax : num;
		                                syncGuideBaseSlotForModule({ baseFrameHeight: next });
		                                updatePlacedModule(mod.id, {
	                                  ...getEndPanelGapSyncUpdates({ baseFrameHeight: next }),
	                                  ...getUpperShelfGapSyncUpdates({ baseFrameHeight: next }),
                                  ...getBaseSizeSyncUpdates(next),
                                });
                              }
                            }}
                            onBlur={(e) => {
		                              setHighlightedFrame(null);
		                              const next = Math.max(bfMin, Math.min(bfMax, parseInt(e.target.value) || bfDefault));
		                              syncGuideBaseSlotForModule({ baseFrameHeight: next });
	                              updatePlacedModule(mod.id, {
	                                ...getEndPanelGapSyncUpdates({ baseFrameHeight: next }),
	                                ...getUpperShelfGapSyncUpdates({ baseFrameHeight: next }),
                                ...getBaseSizeSyncUpdates(next),
                              });
                            }}
                            style={inputStyle}
                          />
                        </div>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>옵셋</span>
                          <input type="text" inputMode="numeric"
                            value={baseOffset !== 0 ? baseOffset : ''} placeholder="0"
                            onFocus={() => setHighlightedFrame(`base-${mod.id}` as any)}
                            onKeyDown={(e) => {
	                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
	                                e.preventDefault();
	                                const nextOffset = Math.max(-200, Math.min(200, (baseOffset || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
	                                commitBaseOffset(nextOffset);
	                              } else if (e.key === 'Enter') {
	                                (e.target as HTMLInputElement).blur();
	                              }
                            }}
                            onChange={(e) => {
	                              const v = e.target.value;
	                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
	                                const nextOffset = v === '' || v === '-' ? 0 : parseInt(v, 10);
	                                commitBaseOffset(nextOffset);
	                              }
	                            }}
	                            onBlur={(e) => {
	                              setHighlightedFrame(null);
	                              const nextOffset = Math.max(-200, Math.min(200, parseInt(e.target.value) || 0));
	                              commitBaseOffset(nextOffset);
	                            }}
                            style={inputStyle}
                          />
                        </div>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>갭</span>
                          <input type="text" inputMode="numeric"
                            value={baseGap !== 0 ? baseGap : ''} placeholder="0"
                            onFocus={() => setHighlightedFrame(`base-${mod.id}` as any)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
	                                e.preventDefault();
	                                const maxGap = Math.max(0, baseSize - 1);
	                                const next = Math.max(0, Math.min(maxGap, (baseGap || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
	                                commitBaseGap(next);
	                              } else if (e.key === 'Enter') {
	                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
	                                const num = v === '' ? 0 : parseInt(v, 10);
	                                const maxGap = Math.max(0, baseSize - 1);
	                                const nextGap = Math.max(0, Math.min(maxGap, num));
	                                commitBaseGap(nextGap);
	                              }
	                            }}
	                            onBlur={(e) => {
	                              setHighlightedFrame(null);
	                              const maxGap = Math.max(0, baseSize - 1);
	                              const clamped = Math.max(0, Math.min(maxGap, parseInt(e.target.value) || 0));
	                              commitBaseGap(clamped);
	                            }}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>띄움</span>
                          <input type="text" inputMode="numeric"
                            value={(mod.individualFloatHeight ?? 0) || ''} placeholder="0"
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
	                                const cur = mod.individualFloatHeight ?? 0;
	                                const nv = Math.max(0, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1)));
	                                syncGuideBaseSlotForModule({ individualFloatHeight: nv });
	                                updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates({
	                                  individualFloatHeight: nv,
	                                  ...getUpperShelfGapSyncUpdates({ individualFloatHeight: nv }),
                                }));
                              } else if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
	                              if (v === '' || /^\d+$/.test(v)) {
	                                const nv = v === '' ? 0 : parseInt(v, 10);
	                                syncGuideBaseSlotForModule({ individualFloatHeight: nv });
	                                updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates({
	                                  individualFloatHeight: nv,
	                                  ...getUpperShelfGapSyncUpdates({ individualFloatHeight: nv }),
                                }));
                              }
                            }}
                            onBlur={() => { /* blur 시 doorBottomGap 덮어쓰기 방지 */ }}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {baseEnabled && renderFrameWidthAdjustControls('base', '폭확장')}
                </div>
                )}
              </>
            );
          })()}

          {/* 하부장(1섹션) 깊이 + 뒤고정/앞고정 */}
          {!showDetails && currentPlacedModule && moduleData?.category === 'lower' && !isTwoSectionFurniture && (() => {
            const depthDir = currentPlacedModule.lowerSectionDepthDirection || 'front';
            const curDepth = currentPlacedModule.freeDepth || currentPlacedModule.customDepth || moduleData.dimensions.depth;
            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>가구 깊이</h5>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ minWidth: '34px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>깊이</span>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeDepthInput}
                      onChange={(e) => setFreeDepthInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeDepthInput, 10);
                        const isLowerDrawer = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                        const minDepth = isLowerDrawer ? 400 : 100;
                        if (!isNaN(val) && val >= minDepth && val <= 1200 && currentPlacedModule) {
                          applyLowerCabinetDepth(val);
                        } else {
                          setFreeDepthInput(Math.round(curDepth).toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = parseInt(freeDepthInput, 10) || curDepth;
                          const isLowerDrawerArrow = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                          const minDepthArrow = isLowerDrawerArrow ? 400 : 100;
                          const next = Math.max(minDepthArrow, Math.min(1200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          applyLowerCabinetDepth(next);
                        }
                      }}
                      className={styles.depthInput}
                      style={{ fontSize: '14px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span style={{ minWidth: '34px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>기준</span>
                  <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                  <button
                    style={{
                      flex: 1, padding: '6px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                      background: depthDir === 'front' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                      color: depthDir === 'front' ? '#fff' : 'var(--theme-text-secondary)',
                      fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: depthDir === 'front' ? 600 : 400
                    }}
                    onClick={() => {
                      applyLowerCabinetDepthDirection('front');
                    }}
                  >
                    뒤고정
                  </button>
                  <button
                    style={{
                      flex: 1, padding: '6px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                      background: depthDir === 'back' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                      color: depthDir === 'back' ? '#fff' : 'var(--theme-text-secondary)',
                      fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: depthDir === 'back' ? 600 : 400
                    }}
                    onClick={() => {
                      applyLowerCabinetDepthDirection('back');
                    }}
                  >
                    앞고정
                  </button>
                  </div>
                </div>
              </div>
            );
          })()}


          {/* 엔드패널(EP) 설정 — 편집 탭 전용 */}
          {/* 키큰장 찬넬(insert-frame)은 자체가 채움재 → 엔드패널 부착 의미 없음 */}
          {!showDetails && currentPlacedModule && moduleData && !(typeof currentPlacedModule.moduleId === 'string' && currentPlacedModule.moduleId.includes('insert-frame')) && (() => {
            const epTopEnabled = currentPlacedModule.hasTopFrame !== false;
            const epBaseEnabled = currentPlacedModule.hasBase !== false;
            const epTopDefault = epTopEnabled ? (currentPlacedModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30)) : 0;
            const epBaseDefault = epBaseEnabled
              ? (spaceInfo.baseConfig?.type === 'stand' ? 0 : (currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 65)))
              : 0;
            // 사용자가 명시한 값(undefined가 아니면 0 포함)을 우선 사용. undefined일 때만 default.
            const epTopOffsetValue = currentPlacedModule.endPanelTopOffset !== undefined
              ? currentPlacedModule.endPanelTopOffset
              : (epTopEnabled ? epTopDefault : 0);
            const epBottomOffsetValue = currentPlacedModule.endPanelBottomOffset !== undefined
              ? currentPlacedModule.endPanelBottomOffset
              : (epBaseEnabled ? epBaseDefault : 0);
            return (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>엔드패널</h5>
              {/* EP 내치/외치 토글 — EP 장착보다 먼저 선택 (내치: EP만큼 본체 줄임=전체폭 유지 / 외치: 본체 유지+EP 추가) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 0 8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>내/외치</span>
                {(['inside', 'outside'] as const).map((mode) => {
                  const active = (currentPlacedModule.endPanelMode ?? 'inside') === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updatePlacedModule(currentPlacedModule.id, { endPanelMode: mode } as any)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: '12px',
                        fontWeight: active ? 700 : 400,
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: `1px solid ${active ? 'var(--theme-primary)' : 'var(--theme-border, #d0d0d0)'}`,
                        background: active ? 'var(--theme-primary)' : 'transparent',
                        color: active ? '#fff' : 'var(--theme-text)',
                      }}
                    >
                      {mode === 'inside' ? '내치' : '외치'}
                    </button>
                  );
                })}
              </div>
              {/* 좌/우 EP 체크박스 */}
              <div className={styles.epCheckboxRow}>
                <label className={styles.epCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={currentPlacedModule.hasLeftEndPanel === true}
                    onChange={() => {
                      const turning = !currentPlacedModule.hasLeftEndPanel;
                      const isNotFull = moduleData.category === 'upper' || moduleData.category === 'lower';
                      const update: Record<string, unknown> = { hasLeftEndPanel: turning };
                      if (turning) update.leftEndPanelOffset = 0;
                      if (turning) {
                        update.endPanelTopOffset = epTopDefault;
                        update.endPanelBottomOffset = epBaseDefault;
                      }
                      // 하부장/상부장은 EP 높이를 가구에 맞춤으로 자동 설정
                      if (turning && isNotFull && !currentPlacedModule.endPanelHeightMode) {
                        update.endPanelHeightMode = 'furniture';
                      }
                      updatePlacedModule(currentPlacedModule.id, update);
                    }}
                  />
                  좌측 EP
                </label>
                <label className={styles.epCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={currentPlacedModule.hasRightEndPanel === true}
                    onChange={() => {
                      const turning = !currentPlacedModule.hasRightEndPanel;
                      const isNotFull = moduleData.category === 'upper' || moduleData.category === 'lower';
                      const update: Record<string, unknown> = { hasRightEndPanel: turning };
                      if (turning) update.rightEndPanelOffset = 0;
                      if (turning) {
                        update.endPanelTopOffset = epTopDefault;
                        update.endPanelBottomOffset = epBaseDefault;
                      }
                      // 하부장/상부장은 EP 높이를 가구에 맞춤으로 자동 설정
                      if (turning && isNotFull && !currentPlacedModule.endPanelHeightMode) {
                        update.endPanelHeightMode = 'furniture';
                      }
                      updatePlacedModule(currentPlacedModule.id, update);
                    }}
                  />
                  우측 EP
                </label>
                {/* 하부 EP — 상부장 전용 (가구 아래쪽 마감판) */}
                {moduleData.category === 'upper' && (
                  <label className={styles.epCheckboxLabel}>
                    <input
                      type="checkbox"
                      checked={currentPlacedModule.hasBottomEndPanel !== false}
                      onChange={() => {
                        const turning = !(currentPlacedModule.hasBottomEndPanel !== false);
                        updatePlacedModule(currentPlacedModule.id, { hasBottomEndPanel: turning } as any);
                      }}
                    />
                    하부 EP
                  </label>
                )}
                {/* 상부 EP — 하부장 전용 (가구 위쪽 마감판) */}
                {moduleData.category === 'lower' && (
                  <label className={styles.epCheckboxLabel}>
                    <input
                      type="checkbox"
                      checked={currentPlacedModule.hasTopEndPanel === true}
                      onChange={() => {
                        const turning = currentPlacedModule.hasTopEndPanel !== true;
                        const applyTopEndPanelToggle = () => {
                          const initialTopEndPanelOffset = resolveTopEndPanelFrontOffsetMm(
                            currentPlacedModule.moduleId,
                            currentPlacedModule.doorTopGap,
                            (currentPlacedModule as any).topEndPanelOffset
                          );
                          const isTopDown = (currentPlacedModule.moduleId || '').includes('lower-top-down-');
                          const currentTopDownDefaultGap = getTopDownDoorTopGap(
                            currentPlacedModule.stoneTopThickness,
                            currentPlacedModule.hasTopEndPanel === true
                          );
                          const nextTopDownDefaultGap = getTopDownDoorTopGap(
                            currentPlacedModule.stoneTopThickness,
                            turning
                          );
                          updatePlacedModule(currentPlacedModule.id, {
                            hasTopEndPanel: turning,
                            ...(turning ? {
                              stoneTopThickness: 0,
                              stoneTopFrontOffset: 0,
                              stoneTopBackOffset: 0,
                              stoneTopLeftOffset: 0,
                              stoneTopRightOffset: 0,
                              stoneTopBackLip: 0,
                              stoneTopBackLipThickness: 0,
                              topEndPanelOffset: initialTopEndPanelOffset,
                              topEndPanelBackOffset: (currentPlacedModule as any).topEndPanelBackOffset ?? 0,
                              ...getDoorLiftTopEndPanelOffsetUpdates(initialTopEndPanelOffset),
                            } : {}),
                            ...(isTopDown && (
                              currentPlacedModule.doorTopGap === undefined
                              || currentPlacedModule.doorTopGap === currentTopDownDefaultGap
                            ) ? { doorTopGap: nextTopDownDefaultGap } : {})
                          } as any);
                        };
                        if (turning && (currentPlacedModule.stoneTopThickness || 0) > 0) {
                          showAlert('상판을 상부 EP로 교체하시겠습니까?', {
                            title: '상판 교체',
                            showCancel: true,
                            onConfirm: applyTopEndPanelToggle,
                          });
                        } else {
                          applyTopEndPanelToggle();
                        }
                      }}
                    />
                    상부 EP
                  </label>
                )}
              </div>
              {(currentPlacedModule.hasLeftEndPanel || currentPlacedModule.hasRightEndPanel || (moduleData.category === 'upper' && currentPlacedModule.hasBottomEndPanel !== false) || (moduleData.category === 'lower' && currentPlacedModule.hasTopEndPanel === true)) && (
                <>
                  {/* EP 높이 모드 — 키큰장(full)만 표시 (하부장/상부장은 카테고리별 자동 결정) */}
                  {/* 상단/하단 갭 — 좌/우 EP 전용 (하부 EP는 전면갭/후면갭 사용) */}
                  {(currentPlacedModule.hasLeftEndPanel || currentPlacedModule.hasRightEndPanel) && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>
                          상단 갭 (몸통↑)
                        </label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={epInputs.topGap ?? String(epTopOffsetValue)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, topGap: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-500, Math.min(500, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { endPanelTopOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.topGap;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { endPanelTopOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, topGap: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = epTopOffsetValue;
                                const next = Math.max(-500, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { endPanelTopOffset: next });
                                setEpInputs(s => ({ ...s, topGap: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>
                          하단 갭 (몸통↓)
                        </label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={epInputs.bottomGap ?? String(epBottomOffsetValue)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, bottomGap: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-500, Math.min(500, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { endPanelBottomOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.bottomGap;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { endPanelBottomOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, bottomGap: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = epBottomOffsetValue;
                                const next = Math.max(-500, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { endPanelBottomOffset: next });
                                setEpInputs(s => ({ ...s, bottomGap: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* EP 두께 / EP 깊이 — 한 줄에 나란히 */}
                  {(() => {
                    const furnitureDepth = currentPlacedModule.freeDepth ?? (moduleData ? moduleData.dimensions.depth : 580);
                    return (
                      <div className={styles.epRow}>
                        <div className={styles.epField}>
                          <label className={styles.epFieldLabel}>EP 두께</label>
                          <div className={styles.inputWithUnit}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={epThicknessInput}
                              onFocus={() => { epThicknessFocusedRef.current = true; }}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || /^\d*\.?\d*$/.test(v)) {
                                  setEpThicknessInput(v);
                                }
                              }}
                              onBlur={() => {
                                epThicknessFocusedRef.current = false;
                                const val = parseFloat(epThicknessInput);
                                if (!isNaN(val) && val >= 10) {
                                  const normalized = resolvePetPanelThicknessMm(val);
                                  setEpThicknessInput(normalized.toString());
                                  updatePlacedModule(currentPlacedModule.id, { endPanelThickness: normalized });
                                } else {
                                  const fallback = currentPlacedModule.endPanelThickness ?? 18;
                                  setEpThicknessInput(fallback.toString());
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = parseFloat(epThicknessInput) || (currentPlacedModule.endPanelThickness ?? 18);
                                  const next = resolvePetPanelThicknessMm(Math.max(10, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                  setEpThicknessInput(next.toString());
                                  updatePlacedModule(currentPlacedModule.id, { endPanelThickness: next });
                                }
                              }}
                              className={styles.epInput}
                            />
                            <span className={styles.unit}>mm</span>
                          </div>
                        </div>
                        {currentPlacedModule.hasLeftEndPanel && (
                          <div className={styles.epField}>
                            <label className={styles.epFieldLabel}>좌EP깊이</label>
                            <div className={styles.inputWithUnit}>
                              <input
                                type="text"
                                readOnly
                                value={Math.round(
                                  (currentPlacedModule.endPanelDepth ?? furnitureDepth)
                                  + (currentPlacedModule.leftEndPanelOffset ?? 0)
                                  + (currentPlacedModule.leftEndPanelBackOffset ?? 0)
                                )}
                                className={styles.epInput}
                                style={{ background: 'var(--theme-background-tertiary)', cursor: 'default' }}
                              />
                              <span className={styles.unit}>mm</span>
                            </div>
                          </div>
                        )}
                        {currentPlacedModule.hasRightEndPanel && (
                          <div className={styles.epField}>
                            <label className={styles.epFieldLabel}>우EP깊이</label>
                            <div className={styles.inputWithUnit}>
                              <input
                                type="text"
                                readOnly
                                value={Math.round(
                                  (currentPlacedModule.endPanelDepth ?? furnitureDepth)
                                  + (currentPlacedModule.rightEndPanelOffset ?? 0)
                                  + (currentPlacedModule.rightEndPanelBackOffset ?? 0)
                                )}
                                className={styles.epInput}
                                style={{ background: 'var(--theme-background-tertiary)', cursor: 'default' }}
                              />
                              <span className={styles.unit}>mm</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* 좌/우 EP 옵셋 — 한 줄에 나란히 */}
                  {/* 좌측 EP 앞/뒤 옵셋 */}
                  {currentPlacedModule.hasLeftEndPanel && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>좌EP 옵셋 (앞 →)</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.leftFront ?? String(currentPlacedModule.leftEndPanelOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, leftFront: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-580, Math.min(1180, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              // 사용자가 진짜 빈/부호만 남긴 경우에만 0으로 리셋
                              // v === undefined는 사용자가 편집 안 한 상태이므로 store 값 그대로 유지
                              const v = epInputs.leftFront;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, leftFront: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.leftEndPanelOffset ?? 0;
                                const next = Math.max(-580, Math.min(1180, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: next });
                                setEpInputs(s => ({ ...s, leftFront: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>좌EP 옵셋 (뒤 ←)</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.leftBack ?? String(currentPlacedModule.leftEndPanelBackOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, leftBack: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-580, Math.min(1180, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { leftEndPanelBackOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.leftBack;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelBackOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, leftBack: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.leftEndPanelBackOffset ?? 0;
                                const next = Math.max(-580, Math.min(1180, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelBackOffset: next });
                                setEpInputs(s => ({ ...s, leftBack: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 우측 EP 앞/뒤 옵셋 */}
                  {currentPlacedModule.hasRightEndPanel && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>우EP 옵셋 (앞 →)</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.rightFront ?? String(currentPlacedModule.rightEndPanelOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, rightFront: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-580, Math.min(1180, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.rightFront;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, rightFront: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.rightEndPanelOffset ?? 0;
                                const next = Math.max(-580, Math.min(1180, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: next });
                                setEpInputs(s => ({ ...s, rightFront: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>우EP 옵셋 (뒤 ←)</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.rightBack ?? String(currentPlacedModule.rightEndPanelBackOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, rightBack: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-580, Math.min(1180, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { rightEndPanelBackOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.rightBack;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelBackOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, rightBack: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.rightEndPanelBackOffset ?? 0;
                                const next = Math.max(-580, Math.min(1180, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelBackOffset: next });
                                setEpInputs(s => ({ ...s, rightBack: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 하부 EP(상부장 하부 마감판) 전면갭/후면갭 — 상부장 전용. 기본 전면 0 / 후면 -35mm */}
                  {moduleData.category === 'upper' && currentPlacedModule.hasBottomEndPanel !== false && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>전면갭</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={(epInputs as any).bottomFront ?? String((currentPlacedModule as any).bottomEndPanelOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, bottomFront: v } as any));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-580, Math.min(200, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { bottomEndPanelOffset: num } as any);
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = (epInputs as any).bottomFront;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelOffset: 0 } as any);
                              }
                              setEpInputs(s => ({ ...s, bottomFront: undefined } as any));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = (currentPlacedModule as any).bottomEndPanelOffset ?? 0;
                                const next = Math.max(-580, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelOffset: next } as any);
                                setEpInputs(s => ({ ...s, bottomFront: undefined } as any));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>후면갭</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={(epInputs as any).bottomBack ?? String(-Math.abs((currentPlacedModule as any).bottomEndPanelBackOffset ?? -35))}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, bottomBack: v } as any));
                                if (v !== '' && v !== '-') {
                                  const num = -Math.abs(Math.max(-580, Math.min(200, parseInt(v, 10))));
                                  updatePlacedModule(currentPlacedModule.id, { bottomEndPanelBackOffset: num } as any);
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = (epInputs as any).bottomBack;
                              if (v === '' || v === '-') {
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelBackOffset: -35 } as any);
                              }
                              setEpInputs(s => ({ ...s, bottomBack: undefined } as any));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = -Math.abs((currentPlacedModule as any).bottomEndPanelBackOffset ?? -35);
                                const next = Math.max(-580, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelBackOffset: next } as any);
                                setEpInputs(s => ({ ...s, bottomBack: undefined } as any));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 상부 EP(하부장 상부 마감판) 전면/후면 옵셋 — 하부장 전용. +확장 / -축소, 후면 기본 0mm */}
                  {moduleData.category === 'lower' && currentPlacedModule.hasTopEndPanel === true && (
                    <>
                      <div className={styles.epRow}>
                        <div className={styles.epField}>
                          <label className={styles.epFieldLabel}>전면옵셋</label>
                          <div className={styles.inputWithUnit}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={(epInputs as any).topFront ?? String(resolveTopEndPanelFrontOffsetMm(
                                currentPlacedModule.moduleId,
                                currentPlacedModule.doorTopGap,
                                (currentPlacedModule as any).topEndPanelOffset
                              ))}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                  setEpInputs(s => ({ ...s, topFront: v } as any));
                                  if (v !== '' && v !== '-') {
                                    const num = Math.max(-580, Math.min(200, parseInt(v, 10)));
                                    updatePlacedModule(currentPlacedModule.id, {
                                      topEndPanelOffset: num,
                                      ...getDoorLiftTopEndPanelOffsetUpdates(num),
                                    } as any);
                                  }
                                }
                              }}
                              onBlur={() => {
                                const v = (epInputs as any).topFront;
                                if (v === '' || v === '-') {
                                  updatePlacedModule(currentPlacedModule.id, {
                                    topEndPanelOffset: 0,
                                    ...getDoorLiftTopEndPanelOffsetUpdates(0),
                                  } as any);
                                }
                                setEpInputs(s => ({ ...s, topFront: undefined } as any));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = resolveTopEndPanelFrontOffsetMm(
                                    currentPlacedModule.moduleId,
                                    currentPlacedModule.doorTopGap,
                                    (currentPlacedModule as any).topEndPanelOffset
                                  );
                                  const next = Math.max(-580, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                  updatePlacedModule(currentPlacedModule.id, {
                                    topEndPanelOffset: next,
                                    ...getDoorLiftTopEndPanelOffsetUpdates(next),
                                  } as any);
                                  setEpInputs(s => ({ ...s, topFront: undefined } as any));
                                }
                              }}
                              className={styles.epInput}
                            />
                            <span className={styles.unit}>mm</span>
                          </div>
                        </div>
                        <div className={styles.epField}>
                          <label className={styles.epFieldLabel}>후면옵셋</label>
                          <div className={styles.inputWithUnit}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={(epInputs as any).topBack ?? String((currentPlacedModule as any).topEndPanelBackOffset ?? 0)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                  setEpInputs(s => ({ ...s, topBack: v } as any));
                                  if (v !== '' && v !== '-') {
                                    const num = Math.max(-580, Math.min(200, parseInt(v, 10)));
                                    updatePlacedModule(currentPlacedModule.id, { topEndPanelBackOffset: num } as any);
                                  }
                                }
                              }}
                              onBlur={() => {
                                const v = (epInputs as any).topBack;
                                if (v === '' || v === '-') {
                                  updatePlacedModule(currentPlacedModule.id, { topEndPanelBackOffset: 0 } as any);
                                }
                                setEpInputs(s => ({ ...s, topBack: undefined } as any));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = (currentPlacedModule as any).topEndPanelBackOffset ?? 0;
                                  const next = Math.max(-580, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                  updatePlacedModule(currentPlacedModule.id, { topEndPanelBackOffset: next } as any);
                                  setEpInputs(s => ({ ...s, topBack: undefined } as any));
                                }
                              }}
                              className={styles.epInput}
                            />
                            <span className={styles.unit}>mm</span>
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const defaultBackLipThickness = resolvePetPanelThicknessMm(currentPlacedModule.endPanelThickness);
                        const backLipEnabled = ((currentPlacedModule as any).topEndPanelBackLip || 0) > 0;
                        const currentBackLipThickness = (currentPlacedModule as any).topEndPanelBackLipThickness || defaultBackLipThickness;

                        return (
                          <>
                            <div style={{ marginTop: '8px' }}>
                              <label className={styles.epFieldLabel}>뒷턱</label>
                              <div className={styles.doorTabSelector} style={{ marginTop: '4px' }}>
                                <button
                                  className={`${styles.doorTab} ${!backLipEnabled ? styles.activeDoorTab : ''}`}
                                  onClick={() => {
                                    updatePlacedModule(currentPlacedModule.id, {
                                      topEndPanelBackLip: 0,
                                      topEndPanelBackLipThickness: 0,
                                    } as any);
                                  }}
                                >
                                  없음
                                </button>
                                <button
                                  className={`${styles.doorTab} ${backLipEnabled ? styles.activeDoorTab : ''}`}
                                  onClick={() => {
                                    updatePlacedModule(currentPlacedModule.id, {
                                      topEndPanelBackLip: (currentPlacedModule as any).topEndPanelBackLip || 100,
                                      topEndPanelBackLipThickness: currentBackLipThickness,
                                    } as any);
                                  }}
                                >
                                  사용
                                </button>
                              </div>
                            </div>
                            {backLipEnabled && (
                              <div className={styles.epRow} style={{ marginTop: '6px' }}>
                                <div className={styles.epField}>
                                  <label className={styles.epFieldLabel}>뒷턱 높이</label>
                                  <div className={styles.inputWithUnit}>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={(epInputs as any).topBackLip ?? String((currentPlacedModule as any).topEndPanelBackLip ?? 100)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === '' || /^\d+$/.test(v)) {
                                          setEpInputs(s => ({ ...s, topBackLip: v } as any));
                                          if (v !== '') {
                                            const num = Math.max(1, Math.min(2000, parseInt(v, 10)));
                                            updatePlacedModule(currentPlacedModule.id, { topEndPanelBackLip: num } as any);
                                          }
                                        }
                                      }}
                                      onBlur={() => {
                                        const v = (epInputs as any).topBackLip;
                                        if (v === '') {
                                          updatePlacedModule(currentPlacedModule.id, { topEndPanelBackLip: 1 } as any);
                                        }
                                        setEpInputs(s => ({ ...s, topBackLip: undefined } as any));
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                          e.preventDefault();
                                          const cur = (currentPlacedModule as any).topEndPanelBackLip ?? 100;
                                          const next = Math.max(1, Math.min(2000, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                          updatePlacedModule(currentPlacedModule.id, { topEndPanelBackLip: next } as any);
                                          setEpInputs(s => ({ ...s, topBackLip: undefined } as any));
                                        }
                                      }}
                                      className={styles.epInput}
                                    />
                                    <span className={styles.unit}>mm</span>
                                  </div>
                                </div>
                                <div className={styles.epField}>
                                  <label className={styles.epFieldLabel}>뒷턱 두께</label>
                                  <div className={styles.inputWithUnit}>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={(epInputs as any).topBackLipThickness ?? String(currentBackLipThickness)}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === '' || /^\d+$/.test(v)) {
                                          setEpInputs(s => ({ ...s, topBackLipThickness: v } as any));
                                          if (v !== '') {
                                            const num = resolvePetPanelThicknessMm(Math.max(1, Math.min(100, parseInt(v, 10))));
                                            updatePlacedModule(currentPlacedModule.id, { topEndPanelBackLipThickness: num } as any);
                                          }
                                        }
                                      }}
                                      onBlur={() => {
                                        const v = (epInputs as any).topBackLipThickness;
                                        if (v === '') {
                                          updatePlacedModule(currentPlacedModule.id, { topEndPanelBackLipThickness: defaultBackLipThickness } as any);
                                        }
                                        setEpInputs(s => ({ ...s, topBackLipThickness: undefined } as any));
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                          e.preventDefault();
                                          const next = resolvePetPanelThicknessMm(Math.max(1, Math.min(100, currentBackLipThickness + (e.key === 'ArrowUp' ? 1 : -1))));
                                          updatePlacedModule(currentPlacedModule.id, { topEndPanelBackLipThickness: next } as any);
                                          setEpInputs(s => ({ ...s, topBackLipThickness: undefined } as any));
                                        }
                                      }}
                                      className={styles.epInput}
                                    />
                                    <span className={styles.unit}>mm</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </>
              )}
            </div>
            );
          })()}

          {/* 좌우 이격거리 섹션 제거됨 */}

          {/* 기둥 C 배치 모드 선택 (기둥 C인 경우만 표시) */}
          {isColumnC && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>배치 모드</h5>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleColumnPlacementModeChange('beside')}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: columnPlacementMode === 'beside' ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                    borderRadius: '8px',
                    backgroundColor: columnPlacementMode === 'beside' ? 'var(--theme-primary-light, #e8f5e9)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: columnPlacementMode === 'beside' ? 600 : 400,
                    color: columnPlacementMode === 'beside' ? 'var(--theme-primary)' : '#333',
                    transition: 'all 0.2s ease'
                  }}
                >
                  기둥 측면 배치
                </button>
                <button
                  onClick={() => handleColumnPlacementModeChange('front')}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: columnPlacementMode === 'front' ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                    borderRadius: '8px',
                    backgroundColor: columnPlacementMode === 'front' ? 'var(--theme-primary-light, #e8f5e9)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: columnPlacementMode === 'front' ? 600 : 400,
                    color: columnPlacementMode === 'front' ? 'var(--theme-primary)' : '#333',
                    transition: 'all 0.2s ease'
                  }}
                >
                  기둥 앞에 배치
                </button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--theme-text-secondary)' }}>
                {columnPlacementMode === 'beside'
                  ? '가구가 기둥 옆에 배치됩니다 (기본)'
                  : '가구가 기둥 앞에 배치되어 기둥을 가립니다'}
              </div>
            </div>
          )}

          {/* 하부장 몸통 높이 설정 (2단서랍장 반통/한통만) */}
          {!showDetails && currentPlacedModule && (
            currentPlacedModule.moduleId.includes('lower-drawer-2tier') ||
            currentPlacedModule.moduleId.includes('dual-lower-drawer-2tier')
          ) && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>몸통 높이</h5>
              <div className={styles.inputWithUnit}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cabinetBodyHeightInput}
                  onChange={(e) => setCabinetBodyHeightInput(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(cabinetBodyHeightInput, 10);
                    if (!isNaN(val) && val >= 760 && val <= 800 && currentPlacedModule) {
                      updatePlacedModule(currentPlacedModule.id, { cabinetBodyHeight: val });
                      setCabinetBodyHeightInput(val.toString());
                      setFreeHeightInput(val.toString());
                    } else {
                      // 범위 밖이면 이전 값 복원
                      setCabinetBodyHeightInput((currentPlacedModule?.cabinetBodyHeight ?? 785).toString());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const cur = parseInt(cabinetBodyHeightInput, 10) || 785;
                      const next = Math.max(760, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                      setCabinetBodyHeightInput(next.toString());
                      setFreeHeightInput(next.toString());
                      if (currentPlacedModule) {
                        updatePlacedModule(currentPlacedModule.id, { cabinetBodyHeight: next });
                      }
                    }
                  }}
                  className={styles.depthInput}
                  placeholder="785"
                  style={{
                    color: '#000000',
                    backgroundColor: '#ffffff',
                    WebkitTextFillColor: '#000000',
                    opacity: 1
                  }}
                />
                <span className={styles.unit}>mm</span>
              </div>
              <div className={styles.depthRange}>
                범위: 760mm ~ 800mm (기본 785mm)
              </div>
            </div>
          )}

          {/* 인조대리석 상판설치 (하부장 전용) */}
          {!showDetails && currentPlacedModule && moduleData && (moduleData.id?.includes('lower-') || moduleData.id?.includes('dual-lower-') || moduleData.category === 'lower') && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>상판설치</h5>
              <div className={`${styles.doorTabSelector} ${styles.countertopThicknessTabs}`}>
                {([0, 10, 20, 30] as const).map(thickness => (
                  <button
                    key={thickness}
                    className={`${styles.doorTab} ${(currentPlacedModule.stoneTopThickness || 0) === thickness ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      if (currentPlacedModule) {
                        const applyCountertopThickness = () => {
                        const updates: Record<string, unknown> = {
                          stoneTopMaterial: 'stone',
                          stoneTopThickness: thickness,
                          ...getCountertopThicknessHeightUpdates(currentPlacedModule, thickness),
                        };
                        const mid = currentPlacedModule.moduleId || '';
                        const isDoorLift = mid.includes('lower-door-lift');
                        const isTopDown = mid.includes('lower-top-down');
                        const isBasicLowerDoorGap = isBasicLowerDoorGapModuleId(mid);
                        if (thickness === 0) {
                          updates.stoneTopFrontOffset = 0;
                          updates.stoneTopBackOffset = 0;
                          updates.stoneTopLeftOffset = 0;
                          updates.stoneTopRightOffset = 0;
                          updates.stoneTopBackLip = 0;
                          updates.stoneTopBackLipThickness = 0;
                          // 도어올림 상단갭은 사용자가 입력한 절대값이므로 상판 변경에서 덮어쓰지 않는다.
                        } else {
                          updates.hasTopEndPanel = false;
                          // 두께 선택/변경 시 기본 앞 오프셋 적용
                          if (isTopDown) {
                            // 상판내림: 두께 무관 앞 오프셋 23mm (인조대리석 상판 깊이 623 고정)
                            updates.stoneTopFrontOffset = 23;
                          } else if ((currentPlacedModule.stoneTopThickness || 0) === 0 && !isDoorLift) {
                            updates.stoneTopFrontOffset = 23;
                          }
                          // 상판 최초 설치 시 (0→두께): 상판 재질이 미설정이면 루나쉐도우를 기본값으로 적용
                          if ((currentPlacedModule.stoneTopThickness || 0) === 0) {
                            const mc = spaceInfo.materialConfig;
                            if (!mc?.countertopTexture && !mc?.countertopColor) {
                              setSpaceInfo({
                                materialConfig: {
                                  ...mc,
                                  countertopColor: '#FFFFFF',
                                  countertopTexture: '/materials/countertop/luna_shadow_hanwha.png',
                                } as any
                              });
                            }
                          }
                          // 도어올림 상단갭은 측판 상단 기준 절대값이므로 상판 두께 변경과 분리한다.
                          if (isDoorLift) {
                            updates.stoneTopFrontOffset = 0;
                          }
                          if (isBasicLowerDoorGap && !isDoorLift && !isTopDown) {
                            const defaultGap = -20;
                            updates.doorTopGap = defaultGap;
                            setDoorTopGap(defaultGap);
                            setDoorTopGapInput(String(defaultGap));
                          }
                          // 상판내림: 상부 EP 기본 -82, 일반 stoneThk별 10→-90, 20→-80, 30→-70
                          // cabH 변화량(±10) + 도어 상단갭 변화량(±10)으로 도어 H/위치 일정 유지
                          if (isTopDown) {
                            const currentDefaultGap = getTopDownDoorTopGap(
                              currentPlacedModule.stoneTopThickness,
                              currentPlacedModule.hasTopEndPanel === true
                            );
                            const newGap = getTopDownDoorTopGap(thickness, false);
                            if (
                              currentPlacedModule.doorTopGap === undefined
                              || currentPlacedModule.doorTopGap === currentDefaultGap
                            ) {
                              updates.doorTopGap = newGap;
                              setDoorTopGap(newGap);
                              setDoorTopGapInput(String(newGap));
                            }
                          }
                          // 뒷턱 다채움 상태이면 새 두께 기준으로 재계산
                          const prevThickness = currentPlacedModule.stoneTopThickness || 0;
                          const curBackLip = currentPlacedModule.stoneTopBackLip || 0;
                          if (curBackLip > 0 && prevThickness > 0) {
                            const prevFillH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                            if (curBackLip === prevFillH) {
                              // 다채움 상태 → 새 두께로 재계산
                              const tempMod = { ...currentPlacedModule, stoneTopThickness: thickness };
                              const newFillH = calcBackLipFillHeight(tempMod, moduleData, spaceInfo, placedModules);
                              if (newFillH > 0) {
                                updates.stoneTopBackLip = newFillH;
                              }
                            }
                          }
                        }
                        // 현재 가구 적용
                        updatePlacedModule(currentPlacedModule.id, updates);
                        // 배치된 모든 하부장에 동일하게 일괄 적용
                        placedModules.forEach(m => {
                          if (m.id === currentPlacedModule.id) return;
                          const mid = m.moduleId || '';
                          const isLower = mid.startsWith('lower-') || mid.includes('-lower-') ||
                                          mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                                          mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                                          mid.includes('lower-induction');
                          const isBulkDoorLift = mid.includes('lower-door-lift');
                          const isBulkTopDown = mid.includes('lower-top-down');
                          const isBulkBasicLowerDoorGap = isBasicLowerDoorGapModuleId(mid);
                          if (!isLower) return;
                          const bulk: Record<string, unknown> = {
                            stoneTopMaterial: 'stone',
                            stoneTopThickness: thickness,
                            ...getCountertopThicknessHeightUpdates(m, thickness),
                          };
                          if (thickness === 0) {
                            bulk.stoneTopFrontOffset = 0;
                            bulk.stoneTopBackOffset = 0;
                            bulk.stoneTopLeftOffset = 0;
                            bulk.stoneTopRightOffset = 0;
                            bulk.stoneTopBackLip = 0;
                            bulk.stoneTopBackLipThickness = 0;
                          } else {
                            bulk.hasTopEndPanel = false;
                            // 처음 설치되는 하부장은 기본 앞 오프셋 23 적용
                            if (isBulkDoorLift) {
                              bulk.stoneTopFrontOffset = 0;
                            } else if ((m.stoneTopThickness || 0) === 0) {
                              bulk.stoneTopFrontOffset = 23;
                            }
                            if (isBulkBasicLowerDoorGap && !isBulkDoorLift && !isBulkTopDown) {
                              bulk.doorTopGap = -20;
                            }
                            if (isBulkTopDown) {
                              const currentDefaultGap = getTopDownDoorTopGap(m.stoneTopThickness, m.hasTopEndPanel === true);
                              if (m.doorTopGap === undefined || m.doorTopGap === currentDefaultGap) {
                                bulk.doorTopGap = getTopDownDoorTopGap(thickness, false);
                              }
                            }
                          }
                          updatePlacedModule(m.id, bulk);
                        });
                        };
                        const hasTopEndPanelConflict = thickness > 0 && (
                          currentPlacedModule.hasTopEndPanel === true
                          || placedModules.some(m => {
                            if (m.id === currentPlacedModule.id || m.hasTopEndPanel !== true) return false;
                            const mid = m.moduleId || '';
                            return mid.startsWith('lower-') || mid.includes('-lower-') ||
                              mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                              mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                              mid.includes('lower-induction');
                          })
                        );
                        if (hasTopEndPanelConflict) {
                          showAlert('상판을 인조대리석으로 교체하시겠습니까?', {
                            title: '상판 교체',
                            showCancel: true,
                            onConfirm: applyCountertopThickness,
                          });
                        } else {
                          applyCountertopThickness();
                        }
                      }
                    }}
                  >
                    {thickness === 0 ? '없음' : `${thickness}mm`}
                  </button>
                ))}
              </div>
              {/* 높이 제한 경고 — 800mm 초과 시에만 표시 */}
              {(currentPlacedModule.stoneTopThickness || 0) > 0 && (() => {
                const bodyH = currentPlacedModule.cabinetBodyHeight ?? placedBodyHeight;
                const totalH = bodyH + (currentPlacedModule.stoneTopThickness || 0);
                return totalH > 800 ? (
                  <div style={{ color: '#e53e3e', fontSize: '11px', marginTop: '4px' }}>
                    ⚠ 총 높이 {totalH}mm (본체 {bodyH} + 상판 {currentPlacedModule.stoneTopThickness}) — 800mm 초과
                  </div>
                ) : null;
              })()}
              {/* 오프셋 입력 (상판이 있을 때만) */}
              {(currentPlacedModule.stoneTopThickness || 0) > 0 && (
                <>
                  <div className={styles.epRow} style={{ marginTop: '8px' }}>
                    <div className={styles.epField}>
                      <label className={styles.epFieldLabel}>앞</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={currentPlacedModule.stoneTopFrontOffset ?? 0}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                              const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopFrontOffset: num });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const cur = currentPlacedModule.stoneTopFrontOffset ?? 0;
                              const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopFrontOffset: next });
                            }
                          }}
                          className={styles.epInput}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                    <div className={styles.epField}>
                      <label className={styles.epFieldLabel}>뒤</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={currentPlacedModule.stoneTopBackOffset ?? 0}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                              const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopBackOffset: num });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const cur = currentPlacedModule.stoneTopBackOffset ?? 0;
                              const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopBackOffset: next });
                            }
                          }}
                          className={styles.epInput}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>

                  {/* 뒷턱 옵션 — 상판 설정과 동일 패턴 */}
                  <div style={{ marginTop: '8px' }}>
                    <label className={styles.epFieldLabel}>뒷턱</label>
                    <div className={styles.doorTabSelector} style={{ marginTop: '4px' }}>
                      {([0, 10, 20, 30] as const).map(thickness => (
                        <button
                          key={thickness}
                          className={`${styles.doorTab} ${
                            thickness === 0
                              ? !(currentPlacedModule.stoneTopBackLip) ? styles.activeDoorTab : ''
                              : (currentPlacedModule.stoneTopBackLip || 0) > 0 && (currentPlacedModule.stoneTopBackLipThickness || currentPlacedModule.stoneTopThickness || 20) === thickness ? styles.activeDoorTab : ''
                          }`}
                          onClick={() => {
                            // 일괄 적용: 배치된 모든 하부장에 동일 적용
                            const applyToLowers = (updates: Record<string, unknown>, fillHeightFor: (m: any) => number) => {
                              // 현재 가구
                              updatePlacedModule(currentPlacedModule.id, updates);
                              // 다른 하부장들
                              placedModules.forEach(m => {
                                if (m.id === currentPlacedModule.id) return;
                                const mid = m.moduleId || '';
                                const isLower = mid.startsWith('lower-') || mid.includes('-lower-') ||
                                                mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                                                mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                                                mid.includes('lower-induction');
                                if (!isLower) return;
                                // 상판이 없는 하부장은 뒷턱도 의미 없음 — 상판 있는 것만
                                if (!(m.stoneTopThickness || 0)) return;
                                const bulk: Record<string, unknown> = { ...updates };
                                // stoneTopBackLip 값이 포함되어 있고 100이면, 다채움이었던 가구는 재계산
                                if (bulk.stoneTopBackLip === 100 && m.stoneTopBackLipFullFill) {
                                  const h = fillHeightFor(m);
                                  if (h > 0) bulk.stoneTopBackLip = h;
                                }
                                updatePlacedModule(m.id, bulk);
                              });
                            };
                            if (thickness === 0) {
                              applyToLowers({ stoneTopBackLip: 0, stoneTopBackLipThickness: 0 }, () => 0);
                            } else {
                              const updates: Record<string, unknown> = { stoneTopBackLipThickness: thickness };
                              if (!(currentPlacedModule.stoneTopBackLip)) {
                                updates.stoneTopBackLip = 100;
                              }
                              applyToLowers(updates, (m) => calcBackLipFillHeight(m, moduleData, spaceInfo, placedModules));
                            }
                          }}
                        >
                          {thickness === 0 ? '없음' : `${thickness}mm`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(currentPlacedModule.stoneTopBackLip || 0) > 0 && (
                    <div className={styles.epRow} style={{ marginTop: '6px', alignItems: 'center' }}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>뒷턱 높이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={(() => {
                              const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                              return currentPlacedModule.stoneTopBackLipFullFill || (fullH > 0 && (currentPlacedModule.stoneTopBackLip || 0) === fullH);
                            })()}
                            value={currentPlacedModule.stoneTopBackLip ?? 100}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                const num = v === '' ? 0 : Math.max(1, parseInt(v, 10));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLip: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLip ?? 100;
                                const next = Math.max(1, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLip: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        <input
                          type="checkbox"
                          checked={currentPlacedModule.stoneTopBackLipFullFill || (() => {
                            const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                            return fullH > 0 && (currentPlacedModule.stoneTopBackLip || 0) === fullH;
                          })()}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const applyFullFill = (m: any) => {
                              const mid = m.moduleId || '';
                              const isLower = mid.startsWith('lower-') || mid.includes('-lower-') ||
                                              mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                                              mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                                              mid.includes('lower-induction');
                              if (!isLower) return;
                              // 상판과 뒷턱이 있는 하부장만 다채움 적용
                              if (!(m.stoneTopThickness || 0)) return;
                              if (!(m.stoneTopBackLip || 0)) return;

                              if (checked) {
                                const fullH = calcBackLipFillHeight(m, moduleData, spaceInfo, placedModules);
                                if (fullH > 0) {
                                  updatePlacedModule(m.id, {
                                    stoneTopBackLipFillHeight: fullH,
                                    stoneTopBackLipFullFill: true,
                                  });
                                }
                              } else {
                                updatePlacedModule(m.id, {
                                  stoneTopBackLipFillHeight: 0,
                                  stoneTopBackLipFullFill: false,
                                });
                              }
                            };
                            // 현재 가구 (뒷턱 없어도 체크 동작 보장)
                            if (checked) {
                              const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                              if (fullH > 0) {
                                updatePlacedModule(currentPlacedModule.id, {
                                  stoneTopBackLipFillHeight: fullH,
                                  stoneTopBackLipFullFill: true,
                                });
                              }
                            } else {
                              updatePlacedModule(currentPlacedModule.id, {
                                stoneTopBackLipFillHeight: 0,
                                stoneTopBackLipFullFill: false,
                              });
                            }
                            // 나머지 모든 하부장에 일괄 적용
                            placedModules.forEach(m => {
                              if (m.id === currentPlacedModule.id) return;
                              applyFullFill(m);
                            });
                          }}
                        />
                        다채움
                      </label>
                    </div>
                  )}
                  {(currentPlacedModule.stoneTopBackLip || 0) > 0 && (
                    <div className={styles.epRow} style={{ marginTop: '6px' }}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>뒷턱 앞옵셋</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={(() => {
                              const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                              return fullH > 0 && (currentPlacedModule.stoneTopBackLip || 0) === fullH;
                            })()}
                            value={currentPlacedModule.stoneTopBackLipDepthOffset ?? 0}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipDepthOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLipDepthOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipDepthOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>상판 앞돌출</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={currentPlacedModule.stoneTopBackLipTopOffset ?? 20}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLipTopOffset ?? 20;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>상판 뒤돌출</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={currentPlacedModule.stoneTopBackLipTopBackOffset ?? 0}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopBackOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLipTopBackOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopBackOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 선반장 선반 설정 (2섹션: 하단/상단 각각 편집) */}
          {/* 기본하부장(lower-half-cabinet, dual-lower-half-cabinet)도 선반 갯수 편집 가능
              + 도어올림 반통/한통(lower-door-lift-half)
              + 상판내림 반통/한통(lower-top-down-half) */}
          {!showDetails && currentPlacedModule && (
            currentPlacedModule.moduleId.includes('-shelf-') ||
            currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
            currentPlacedModule.moduleId.includes('-2drawer-shelf-') ||
            currentPlacedModule.moduleId.includes('-entryway-') ||
            (currentPlacedModule.moduleId.includes('upper-cabinet') && (
              moduleData.modelConfig?.sections?.some((section: SectionConfig) => section.type === 'shelf') ||
              moduleData.modelConfig?.leftSections?.some((section: SectionConfig) => section.type === 'shelf')
            )) ||
            currentPlacedModule.moduleId.includes('lower-half-cabinet') ||
            currentPlacedModule.moduleId.includes('lower-door-lift-half') ||
            currentPlacedModule.moduleId.includes('lower-top-down-half')
          ) && (() => {
            // dual-upper-cabinet-shelf 등은 modelConfig.sections가 없고 leftSections만 있음 → fallback
            const effectiveSections: SectionConfig[] = currentPlacedModule.customSections
              || moduleData.modelConfig?.sections
              || moduleData.modelConfig?.leftSections
              || [];
            const basicThickness = moduleData.modelConfig?.basicThickness || 18;

            // 1섹션 가구(상부장 3단형 등): 가구 자체 높이 사용 (전체 공간 높이 X)
            const isSingleSecForHeight = effectiveSections.length < 2;
            const moduleOwnHeight = currentPlacedModule?.customHeight
              ?? currentPlacedModule?.freeHeight
              ?? moduleData?.dimensions?.height
              ?? 0;
            const shouldAbsorbTopForShelfSections = moduleData?.category === 'full';
            const shouldAbsorbBaseForShelfSections = moduleData?.category === 'full' || moduleData?.category === 'lower';
            const absorbedTopForShelfSections = shouldAbsorbTopForShelfSections && currentPlacedModule.hasTopFrame === false
              ? Math.max(0, (currentPlacedModule.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30) - (currentPlacedModule.topFrameGap ?? 0))
              : 0;
            const absorbedBaseForShelfSections = shouldAbsorbBaseForShelfSections && currentPlacedModule.hasBase === false
              ? (((currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0)))
                - (currentPlacedModule.individualFloatHeight ?? 0))
              : 0;
            const shelfSectionBasisH = Math.max(0, moduleOwnHeight + absorbedTopForShelfSections + absorbedBaseForShelfSections);
            const plainShoeShelfHeightsForShelfEditor = getPlainShoeShelfSectionHeights(
              currentPlacedModule,
              spaceInfo,
              effectiveSections,
              shelfSectionBasisH
            );

            // 각 섹션별 shelf 편집 블록 렌더링 헬퍼
            const renderShelfEditor = (
              sectionIdx: number,
              label: string,
              count: number,
              setCount: (n: number) => void,
              posInputs: string[],
              setPosInputs: (arr: string[]) => void
            ) => {
              const section = effectiveSections[sectionIdx];
              if (!section || section.type !== 'shelf') return null;
              const currentShelfCount = count || section.count || section.shelfPositions?.length || 0;
              // 섹션 외경 계산
              // 1섹션 가구(상부장 3단형 등): 가구 자체 높이를 그대로 섹션 외경으로 사용
              // 2섹션 가구(옷장 등): 마지막 섹션은 가구외경 - 고정섹션합, 첫 섹션은 section.height 그대로
              const topFrameR = spaceInfo.frameSize?.top ?? 30;
              // 띄움 모드: 받침대 대신 띄움 높이를 차감
              const isFloatModeR = spaceInfo.baseConfig?.placementType === 'float';
              const baseFrameR = isFloatModeR
                ? (currentPlacedModule?.individualFloatHeight ?? spaceInfo.baseConfig?.floatHeight ?? 0)
                : (currentPlacedModule?.baseFrameHeight !== undefined
                  ? currentPlacedModule.baseFrameHeight
                  : (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0));
              // freeHeight/customHeight가 있으면 그것을 외경으로 사용 (공중배치 등 사용자가 직접 H 변경한 경우)
              const userHeightR = currentPlacedModule?.freeHeight ?? currentPlacedModule?.customHeight;
              const furnitureOuterR = userHeightR
                ?? ((spaceInfo.height || 0) - topFrameR - baseFrameR);
              const fixedSumR = effectiveSections.slice(0, -1).reduce((s: number, sec: any) => s + (sec.height || 0), 0);
              const isLastR = sectionIdx === effectiveSections.length - 1;
              const sectionHeight = isSingleSecForHeight
                ? Math.max(0, moduleOwnHeight)
                : (plainShoeShelfHeightsForShelfEditor
                  ? (plainShoeShelfHeightsForShelfEditor[sectionIdx] ?? 0)
                  : isLastR
                  ? Math.max(0, furnitureOuterR - fixedSumR)
                  : ((section.height as number) || 0));
              const getResolvedShelfPositions = () => {
                const storedPositions = Array.isArray(section.shelfPositions)
                  ? [...section.shelfPositions]
                  : [];
                if (storedPositions.length === currentShelfCount) return storedPositions;
                if (currentShelfCount <= 0) return [];
                const innerH = Math.max(0, sectionHeight - 2 * basicThickness);
                return calculateEvenShelfPositions(innerH, currentShelfCount, basicThickness);
              };

              const handleCountChange = (delta: number) => {
                const newCount = Math.max(0, Math.min(10, currentShelfCount + delta));
                setCount(newCount);
                // 내경 기반(섹션 외경 - 2t)으로 균등 선반 위치 계산
                const innerH = sectionHeight - 2 * basicThickness;
                const newPositions = calculateEvenShelfPositions(innerH, newCount, basicThickness);
                setPosInputs(newPositions.map(p => Math.round(p).toString()));
                const newSections = [...effectiveSections];
                newSections[sectionIdx] = { ...section, count: newCount, shelfPositions: newPositions };
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              };

              const handlePosChange = (i: number, value: string) => {
                const newInputs = [...posInputs];
                newInputs[i] = value;
                setPosInputs(newInputs);
              };

              const handlePosBlur = (i: number) => {
                const val = parseInt(posInputs[i], 10);
                if (isNaN(val) || val < 0 || val > sectionHeight) {
                  const positions = getResolvedShelfPositions();
                  const newInputs = [...posInputs];
                  newInputs[i] = Math.round(positions[i] || 0).toString();
                  setPosInputs(newInputs);
                  return;
                }
                const currentPositions = getResolvedShelfPositions();
                currentPositions[i] = val;
                const newSections = [...effectiveSections];
                newSections[sectionIdx] = { ...section, shelfPositions: currentPositions };
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              };

              const handlePosArrow = (i: number, direction: 'up' | 'down') => {
                const cur = parseInt(posInputs[i], 10) || 0;
                const next = Math.max(0, Math.min(Math.round(sectionHeight), cur + (direction === 'up' ? 1 : -1)));
                handlePosChange(i, next.toString());
                const currentPositions = getResolvedShelfPositions();
                currentPositions[i] = next;
                const newSections = [...effectiveSections];
                newSections[sectionIdx] = { ...section, shelfPositions: currentPositions };
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              };

              return (
                <div key={sectionIdx} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: '6px' }}>{label} (높이 {Math.round(sectionHeight)}mm)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--theme-text-secondary)' }}>선반 갯수</span>
                    <button
                      onClick={() => handleCountChange(-1)}
                      disabled={currentShelfCount <= 0}
                      style={{
                        width: '28px', height: '28px', border: '1px solid var(--theme-border)',
                        borderRadius: '4px', background: 'var(--theme-surface)', cursor: currentShelfCount <= 0 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                        color: currentShelfCount <= 0 ? 'var(--theme-text-disabled)' : 'var(--theme-text-primary)'
                      }}
                    >−</button>
                    <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{currentShelfCount}</span>
                    <button
                      onClick={() => handleCountChange(1)}
                      disabled={currentShelfCount >= 10}
                      style={{
                        width: '28px', height: '28px', border: '1px solid var(--theme-border)',
                        borderRadius: '4px', background: 'var(--theme-surface)', cursor: currentShelfCount >= 10 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                        color: currentShelfCount >= 10 ? 'var(--theme-text-disabled)' : 'var(--theme-text-primary)'
                      }}
                    >+</button>
                    <button
                      onClick={() => {
                        if (currentShelfCount <= 0) return;
                        const halfT = basicThickness / 2;
                        const innerH = Math.max(0, sectionHeight - 2 * basicThickness);
                        const totalInner = innerH - currentShelfCount * basicThickness;
                        const baseGap = Math.floor(totalInner / (currentShelfCount + 1));
                        const remainder = totalInner - baseGap * (currentShelfCount + 1);
                        const evenGaps: number[] = Array(currentShelfCount + 1).fill(baseGap);
                        evenGaps[0] += remainder;
                        const newPositions: number[] = [];
                        let acc = 0;
                        for (let k = 0; k < currentShelfCount; k++) {
                          acc += evenGaps[k];
                          newPositions.push(Math.round(acc + k * basicThickness + halfT));
                        }
                        setPosInputs(newPositions.map(p => Math.round(p).toString()));
                        const newSections = [...effectiveSections];
                        newSections[sectionIdx] = { ...section, shelfPositions: newPositions };
                        updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
                      }}
                      disabled={currentShelfCount <= 0}
                      style={{
                        marginLeft: '8px', height: '28px', padding: '0 10px',
                        border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: 'var(--theme-surface)',
                        cursor: currentShelfCount <= 0 ? 'not-allowed' : 'pointer',
                        fontSize: '11px',
                        color: currentShelfCount <= 0 ? 'var(--theme-text-disabled)' : 'var(--theme-text-primary)',
                      }}
                    >초기화</button>
                  </div>
                  {(() => {
                    const shelfPos: number[] = getResolvedShelfPositions().sort((a, b) => a - b);
                    if (shelfPos.length === 0) return null;
                    const n = shelfPos.length;
                    const halfT = basicThickness / 2;
                    // 섹션 내경: sectionHeight(외경) - 2t
                    const innerH = Math.max(0, sectionHeight - 2 * basicThickness);
                    // gaps를 실제 저장된 shelfPositions에서 파생 (뷰어 스피너로 선반 이동 시 즉시 반영)
                    const gaps: number[] = [];
                    for (let k = 0; k <= n; k++) {
                      if (k === 0) {
                        gaps.push(Math.max(0, Math.round(shelfPos[0] - halfT)));
                      } else if (k === n) {
                        gaps.push(Math.max(0, Math.round(innerH - shelfPos[n - 1] - halfT)));
                      } else {
                        gaps.push(Math.max(0, Math.round(shelfPos[k] - shelfPos[k - 1] - basicThickness)));
                      }
                    }
                    return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ padding: '6px 8px', background: 'var(--theme-background)', border: '1px solid var(--theme-border)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', marginBottom: '4px' }}>칸 내경</div>
                        {gaps.map((_ignored, dispIdx) => {
                          const i = gaps.length - 1 - dispIdx; // 위(높은 칸) → 아래(낮은 칸) 순서로 표시
                          const g = gaps[i];
                          const applyGap = (newGap: number) => {
                            const safeGap = Math.max(0, Math.round(newGap));
                            const updatedGaps = [...gaps];
                            updatedGaps[i] = safeGap;
                            // 변경된 칸 제외 나머지를 내경 내에서 균등 재분배
                            const otherCount = updatedGaps.length - 1;
                            if (otherCount > 0) {
                              const remaining = innerH - safeGap - n * basicThickness;
                              const eachOther = Math.max(0, Math.round(remaining / otherCount));
                              for (let k = 0; k < updatedGaps.length; k++) {
                                if (k !== i) updatedGaps[k] = eachOther;
                              }
                              // 반올림 오차 흡수
                              const lastIdx = i === updatedGaps.length - 1 ? updatedGaps.length - 2 : updatedGaps.length - 1;
                              const sumAll = updatedGaps.reduce((s, v) => s + v, 0);
                              updatedGaps[lastIdx] += Math.round(innerH - sumAll - n * basicThickness);
                              updatedGaps[lastIdx] = Math.max(0, updatedGaps[lastIdx]);
                            }
                            // pos[k] = 누적(gaps[0..k]) + k*t + t/2 (선반 중심)
                            const resultPositions: number[] = [];
                            let acc = 0;
                            for (let k = 0; k < n; k++) {
                              acc += updatedGaps[k];
                              resultPositions.push(Math.round(acc + k * basicThickness + halfT));
                            }
                            setPosInputs(resultPositions.map(p => Math.round(p).toString()));
                            const newSections = [...effectiveSections];
                            newSections[sectionIdx] = { ...section, shelfPositions: resultPositions };
                            updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
                          };
                          const gapLabel = sectionIdx === 1 ? `상부 칸 ${dispIdx + 1}` : `하부 칸 ${dispIdx + 1}`;
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--theme-text-primary)', marginBottom: '3px', gap: '6px' }}>
                              <span style={{ flexShrink: 0 }}>{gapLabel}</span>
                              <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={g}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '' || raw === '-') return;
                                    const v = parseInt(raw, 10);
                                    if (!isNaN(v)) applyGap(v);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      const cur = parseInt((e.target as HTMLInputElement).value, 10) || 0;
                                      applyGap(cur + (e.key === 'ArrowUp' ? 1 : -1));
                                    }
                                  }}
                                  style={{
                                    color: 'var(--theme-text-primary)',
                                    backgroundColor: 'var(--theme-surface)',
                                    width: '60px', height: '28px', textAlign: 'center', boxSizing: 'border-box',
                                    border: '1px solid var(--theme-border)', borderRadius: '4px',
                                    fontSize: '12px', padding: '0 4px', flexShrink: 0,
                                  }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyGap((typeof g === 'number' ? g : parseFloat(String(g))) + 1)}
                                    style={{
                                      width: '20px', height: '14px', padding: 0, fontSize: '10px',
                                      border: '1px solid var(--theme-border)', background: 'var(--theme-surface)',
                                      color: 'var(--theme-text-primary)',
                                      cursor: 'pointer', borderRadius: '3px 3px 0 0', lineHeight: '1',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >▲</button>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyGap((typeof g === 'number' ? g : parseFloat(String(g))) - 1)}
                                    style={{
                                      width: '20px', height: '14px', padding: 0, fontSize: '10px',
                                      border: '1px solid var(--theme-border)', background: 'var(--theme-surface)',
                                      color: 'var(--theme-text-primary)',
                                      cursor: 'pointer', borderRadius: '0 0 3px 3px', lineHeight: '1', borderTop: 'none',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >▼</button>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', flexShrink: 0, minWidth: '18px' }}>mm</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              );
            };

            // 1섹션 가구(상부장 3단형 등): 상단 섹션 에디터만 노출, 라벨은 "선반"으로 단순화
            const isSingleSection = effectiveSections.length < 2;
            // 기본하부장(lower-half-cabinet) + 도어올림/상판내림 반통/한통: 선반 있음/없음 토글 추가
            const isLowerHalfCabinet = !!(
              currentPlacedModule?.moduleId?.includes('lower-half-cabinet')
              || currentPlacedModule?.moduleId?.includes('lower-door-lift-half')
              || currentPlacedModule?.moduleId?.includes('lower-top-down-half')
            );
            const shelfPresent = isSingleSection
              ? upperShelfCount > 0
              : (upperShelfCount > 0 || lowerShelfCount > 0);
            const toggleStyle: React.CSSProperties = {
              width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              backgroundColor: shelfPresent ? 'var(--theme-primary, #4a90d9)' : '#ccc',
              position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
            };
            const knobStyle: React.CSSProperties = {
              position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%',
              backgroundColor: '#fff', transition: 'left 0.2s',
              left: shelfPresent ? '18px' : '2px',
            };
            const handleShelfToggle = () => {
              if (shelfPresent) {
                // 있음 → 없음: 모든 섹션의 count=0, shelfPositions=[]
                const newSections = effectiveSections.map((sec: any) =>
                  sec.type === 'shelf' ? { ...sec, count: 0, shelfPositions: [] } : sec
                );
                if (isSingleSection) {
                  setUpperShelfCount(0);
                  setUpperShelfPositionInputs([]);
                } else {
                  setUpperShelfCount(0);
                  setLowerShelfCount(0);
                  setUpperShelfPositionInputs([]);
                  setLowerShelfPositionInputs([]);
                }
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              } else {
                // 없음 → 있음: 기본 2개로 복원
                const DEFAULT_COUNT = 2;
                const topFrameR = spaceInfo.frameSize?.top ?? 30;
                const baseFrameR = currentPlacedModule?.baseFrameHeight !== undefined
                  ? currentPlacedModule.baseFrameHeight
                  : (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0);
                const furnitureOuterR = (spaceInfo.height || 0) - topFrameR - baseFrameR;
                const fixedSumR = effectiveSections.slice(0, -1).reduce((s: number, sec: any) => s + (sec.height || 0), 0);
                const newSections = effectiveSections.map((sec: any, idx: number) => {
                  if (sec.type !== 'shelf') return sec;
                  const isLast = idx === effectiveSections.length - 1;
                  const sectionH = isSingleSection
                    ? Math.max(0, currentPlacedModule.customHeight ?? currentPlacedModule.freeHeight ?? moduleData?.dimensions?.height ?? 0)
                    : (plainShoeShelfHeightsForShelfEditor
                      ? (plainShoeShelfHeightsForShelfEditor[idx] ?? 0)
                      : (isLast ? Math.max(0, furnitureOuterR - fixedSumR) : (sec.height || 0)));
                  const innerH = sectionH - 2 * basicThickness;
                  return {
                    ...sec,
                    count: DEFAULT_COUNT,
                    shelfPositions: calculateEvenShelfPositions(innerH, DEFAULT_COUNT, basicThickness),
                  };
                });
                if (isSingleSection) {
                  const newSec = newSections[0];
                  setUpperShelfCount(DEFAULT_COUNT);
                  setUpperShelfPositionInputs((newSec.shelfPositions || []).map((p: number) => Math.round(p).toString()));
                } else {
                  const newUpperSec = newSections[1];
                  const newLowerSec = newSections[0];
                  setUpperShelfCount(DEFAULT_COUNT);
                  setLowerShelfCount(DEFAULT_COUNT);
                  setUpperShelfPositionInputs((newUpperSec.shelfPositions || []).map((p: number) => Math.round(p).toString()));
                  setLowerShelfPositionInputs((newLowerSec.shelfPositions || []).map((p: number) => Math.round(p).toString()));
                }
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              }
            };
            const additionalDowelEnabled = !!(currentPlacedModule as any).additionalDowelBoringsEnabled;
            const additionalDowelCount = Math.max(1, Math.min(20, Math.round((currentPlacedModule as any).additionalDowelBoringCount ?? 1)));
            const updateAdditionalDowelCount = (nextCount: number) => {
              updatePlacedModule(currentPlacedModule.id, {
                additionalDowelBoringsEnabled: true,
                additionalDowelBoringCount: Math.max(1, Math.min(20, Math.round(nextCount || 1))),
              } as any);
            };
            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>선반 설정</h5>
                {isLowerHalfCabinet && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--theme-text-secondary)' }}>선반</span>
                    <button onClick={handleShelfToggle} style={toggleStyle}>
                      <span style={knobStyle} />
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--theme-text-secondary)' }}>{shelfPresent ? '있음' : '없음'}</span>
                  </div>
                )}
                {shelfPresent && (
                  <div style={{ padding: '8px', background: 'var(--theme-background)', border: '1px solid var(--theme-border)', borderRadius: '4px', marginBottom: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: 'var(--theme-text-primary)', cursor: 'pointer' }}>
                      <span>다보보링 추가</span>
                      <input
                        type="checkbox"
                        checked={additionalDowelEnabled}
                        onChange={(e) => {
                          updatePlacedModule(currentPlacedModule.id, {
                            additionalDowelBoringsEnabled: e.target.checked,
                            additionalDowelBoringCount: (currentPlacedModule as any).additionalDowelBoringCount ?? 1,
                          } as any);
                        }}
                      />
                    </label>
                    {additionalDowelEnabled && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)' }}>상하 각각 32mm 간격</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => updateAdditionalDowelCount(additionalDowelCount - 1)}
                            disabled={additionalDowelCount <= 1}
                            style={{ width: '24px', height: '24px', border: '1px solid var(--theme-border)', borderRadius: '4px', background: 'var(--theme-surface)', color: 'var(--theme-text-primary)', cursor: additionalDowelCount <= 1 ? 'not-allowed' : 'pointer' }}
                          >−</button>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={additionalDowelCount}
                            onChange={(e) => updateAdditionalDowelCount(parseInt(e.target.value, 10) || 1)}
                            style={{ width: '48px', height: '24px', textAlign: 'center', boxSizing: 'border-box', border: '1px solid var(--theme-border)', borderRadius: '4px', background: 'var(--theme-surface)', color: 'var(--theme-text-primary)', fontSize: '12px' }}
                          />
                          <button
                            type="button"
                            onClick={() => updateAdditionalDowelCount(additionalDowelCount + 1)}
                            disabled={additionalDowelCount >= 20}
                            style={{ width: '24px', height: '24px', border: '1px solid var(--theme-border)', borderRadius: '4px', background: 'var(--theme-surface)', color: 'var(--theme-text-primary)', cursor: additionalDowelCount >= 20 ? 'not-allowed' : 'pointer' }}
                          >+</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {(!isLowerHalfCabinet || shelfPresent) && (isSingleSection
                  ? renderShelfEditor(0, '선반', upperShelfCount, setUpperShelfCount, upperShelfPositionInputs, setUpperShelfPositionInputs)
                  : (
                    <>
                      {renderShelfEditor(1, '상단 섹션', upperShelfCount, setUpperShelfCount, upperShelfPositionInputs, setUpperShelfPositionInputs)}
                      {renderShelfEditor(0, '하단 섹션', lowerShelfCount, setLowerShelfCount, lowerShelfPositionInputs, setLowerShelfPositionInputs)}
                    </>
                  ))
                }
              </div>
            );
          })()}

          {/* 상부 선반 제거 토글: 코트장/붙박이장B/붙박이장D 전용 */}
          {!showDetails && currentPlacedModule && isUpperSafetyShelfModule(currentPlacedModule.moduleId) && (() => {
            const removed = !!currentPlacedModule.removeUpperSafetyShelf;
            const toggleStyle: React.CSSProperties = {
              width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              backgroundColor: removed ? 'var(--theme-primary, #4a90d9)' : '#ccc',
              position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
            };
            const knobStyle: React.CSSProperties = {
              position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%',
              backgroundColor: '#fff', transition: 'left 0.2s', left: removed ? '18px' : '2px',
            };
            // 상부섹션 안전선반 윗면 ~ 천판 바닥 사이 간격 계산
            // 2D 표시 공식과 동일: innerH - shelfPos - halfT
            // = (sectionOuterH - 2*basicThickness) - shelfPos - (basicThickness / 2)
            const basicThicknessMm = (spaceInfo as any).panelThickness || 18;
            const sections = (currentPlacedModule as any).customSections
              ?? (currentPlacedModule.customConfig as any)?.sections
              ?? moduleData?.modelConfig?.sections;
            const hasExplicitCustomSections = Array.isArray((currentPlacedModule as any).customSections);
            const sectionList = Array.isArray(sections) ? sections : [];
            const upperHangingIndex = (() => {
              for (let i = sectionList.length - 1; i >= 0; i--) {
                const section = sectionList[i] as any;
                if (
                  section.type === 'hanging' &&
                  Array.isArray(section.shelfPositions) &&
                  section.shelfPositions.some((pos: number) => pos > 0)
                ) {
                  return i;
                }
              }
              for (let i = sectionList.length - 1; i >= 0; i--) {
                if ((sectionList[i] as any).type === 'hanging') return i;
              }
              return -1;
            })();
            const hangingSection = upperHangingIndex >= 0 ? sectionList[upperHangingIndex] : null;
            const baseTotalHeight = currentPlacedModule.freeHeight
              || currentPlacedModule.customHeight
              || moduleData?.dimensions?.height
              || 0;
            const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
            const topFrameMm = currentPlacedModule.topFrameThickness ?? globalTopFrame;
            const topFrameDelta = currentPlacedModule.topFrameThickness !== undefined
              ? topFrameMm - globalTopFrame
              : 0;
            const shouldAbsorbTopForHeight = moduleData?.category === 'full';
            const absorbedTopHeight = shouldAbsorbTopForHeight && currentPlacedModule.hasTopFrame === false
              ? Math.max(0, topFrameMm - (currentPlacedModule.topFrameGap ?? 0))
              : 0;
            const absorbedBaseHeight = currentPlacedModule.hasBase === false
              ? ((currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0))
                - (currentPlacedModule.individualFloatHeight ?? 0))
              : 0;
            const isStandTypeForHeight = spaceInfo.baseConfig?.type === 'stand';
            const baseFrameDelta = currentPlacedModule.baseFrameHeight !== undefined && !isStandTypeForHeight
              ? currentPlacedModule.baseFrameHeight - (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0)
              : 0;
            const effectiveTotalHeight = Math.max(0, baseTotalHeight - topFrameDelta - baseFrameDelta + absorbedTopHeight + absorbedBaseHeight);
            const getEffectiveSectionHeight = (sectionIndex: number) => {
              const section = sectionList[sectionIndex] as any;
              if (!section) return 0;
              if (sectionList.length >= 2 && sectionIndex === sectionList.length - 1) {
                const previousSectionsHeight = sectionList
                  .slice(0, sectionIndex)
                  .reduce((sum: number, prevSection: any) => sum + (prevSection.height || 0), 0);
                return Math.max(0, effectiveTotalHeight - previousSectionsHeight);
              }
              return section.height || 0;
            };
            let topGap: number | null = null;
            if (hangingSection && !removed) {
              const hangingH = getEffectiveSectionHeight(upperHangingIndex);
              const posArr = (hangingSection.shelfPositions || []) as number[];
              const shelfPos = posArr.length > 0 ? posArr[posArr.length - 1] : null;
              if (shelfPos !== null) {
                const innerH = Math.max(0, hangingH - 2 * basicThicknessMm);
                let renderedShelfPos = shelfPos;
                if (!hasExplicitCustomSections && upperHangingIndex === sectionList.length - 1) {
                  const originalInnerH = Math.max(0, ((hangingSection as any).height || 0) - 2 * basicThicknessMm);
                  const originalGap = Math.max(0, Math.round(
                    originalInnerH -
                    shelfPos -
                    basicThicknessMm / 2
                  ));
                  renderedShelfPos = Math.max(0, Math.round(innerH - originalGap - basicThicknessMm / 2));
                }
                topGap = Math.max(0, Math.round(innerH - renderedShelfPos - basicThicknessMm / 2));
              }
            }
            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>상부 선반</h5>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
                  <button
                    onClick={() => updatePlacedModule(currentPlacedModule.id, { removeUpperSafetyShelf: !removed })}
                    style={toggleStyle}
                    aria-label="상부 선반 제거"
                  >
                    <span style={knobStyle} />
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--theme-text-primary)' }}>
                    선반 제거 (옷봉을 상판에 부착)
                  </span>
                </div>
                {topGap !== null && (() => {
                  // 사용자가 입력한 값이 있으면 그 값을 우선 표시 (실시간 ↑↓ 반응 위해)
                  const currentGap = (typeof (currentPlacedModule as any).upperShelfTopGap === 'number')
                    ? (currentPlacedModule as any).upperShelfTopGap
                    : topGap;
                  const updateGap = (v: number) => {
                    const clamped = Math.max(0, Math.min(2000, v));
                    // upperShelfTopGap만 저장. shelfPositions은 FurnitureItem이 매 렌더링 시 자동 재계산.
                    updatePlacedModule(currentPlacedModule.id, { upperShelfTopGap: clamped } as any);
                  };
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' }}>
                      <span style={{ color: 'var(--theme-text-secondary)' }}>옷봉선반 간격</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={currentGap}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d+$/.test(v)) {
                              updateGap(v === '' ? 0 : parseInt(v, 10));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              e.stopPropagation();
                              updateGap(currentGap + (e.key === 'ArrowUp' ? 1 : -1));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              const v = (e.target as HTMLInputElement).value;
                              updateGap(parseInt(v) || 0);
                            }
                          }}
                          onBlur={(e) => updateGap(parseInt(e.target.value) || 0)}
                          style={{ width: '60px', padding: '2px 4px', border: '1px solid var(--theme-border)', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }}
                        />
                        <span style={{ color: 'var(--theme-text-secondary)' }}>mm</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}


          {/* 하부섹션 상판 옵셋 (2섹션 가구만, 상세보기 아닐 때만) */}
          {!showDetails && isTwoSectionFurniture && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>하부섹션 상판 옵셋</h5>
              <div className={styles.inputWithUnit}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={lowerTopOffsetInput}
                  onChange={(e) => handleLowerTopOffsetChange(e.target.value)}
                  onFocus={() => {
                    if (currentPlacedModule) {
                      const panelId = `${currentPlacedModule.id}-(하)상판`;
// console.log('🎯 하부장 상부패널 강조:', panelId);
                      setHighlightedPanel(panelId);
                    }
                  }}
                  onBlur={() => {
// console.log('🎯 패널 강조 해제');
                    setHighlightedPanel(null);
                  }}
                  onKeyDown={handleLowerTopOffsetKeyDown}
                  className={styles.depthInput}
                  placeholder="0"
                  style={{
                    color: '#000000',
                    backgroundColor: '#ffffff',
                    WebkitTextFillColor: '#000000',
                    opacity: 1
                  }}
                />
                <span className={styles.unit}>mm</span>
              </div>
              <div className={styles.depthRange}>
                범위: -50mm ~ 50mm
              </div>
            </div>
          )}

          {/* 도어 병합/분할 (2섹션 가구만, 도어가 있을 때만, 상세보기 아닐 때만) */}
          {/* 주석 처리: 도어 병합/분할 기능 숨김
          {!showDetails && moduleData.hasDoor && hasDoor && isTwoSectionFurniture && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>도어 병합/분할</h5>
              <div className={styles.doorTabSelector}>
                <button
                  className={`${styles.doorTab} ${!doorSplit ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    setDoorSplit(false);
                    if (currentPlacedModule) {
                      updatePlacedModule(currentPlacedModule.id, { doorSplit: false });
                    }
                  }}
                >
                  병합
                </button>
                <button
                  className={`${styles.doorTab} ${doorSplit ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    setDoorSplit(true);
                    if (currentPlacedModule) {
                      updatePlacedModule(currentPlacedModule.id, { doorSplit: true });
                    }
                  }}
                >
                  분할
                </button>
              </div>
            </div>
          )}
          */}

          {/* 도어 상하 이격거리 — 도어 셋팅 섹션으로 통합됨 */}

          {/* 분할 모드: 섹션별 도어 이격거리 */}
          {/* 주석 처리: 도어 분할 모드 이격거리 설정 숨김
          {!showDetails && moduleData.hasDoor && hasDoor && doorSplit && isTwoSectionFurniture && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>도어 상하 이격거리 (분할)</h5>

              <h6 className={styles.subSectionTitle}>상부 도어</h6>
              <div className={styles.doorGapContainer}>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>천장에서 ↓</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={upperDoorTopGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setUpperDoorTopGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setUpperDoorTopGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { upperDoorTopGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>중간판에서 ↑</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={upperDoorBottomGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setUpperDoorBottomGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setUpperDoorBottomGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { upperDoorBottomGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              </div>

              <h6 className={styles.subSectionTitle} style={{marginTop: '12px'}}>하부 도어</h6>
              <div className={styles.doorGapContainer}>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>중간판에서 ↓</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lowerDoorTopGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLowerDoorTopGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setLowerDoorTopGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { lowerDoorTopGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>바닥에서 ↑</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lowerDoorBottomGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLowerDoorBottomGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setLowerDoorBottomGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { lowerDoorBottomGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          */}

          {/* 도어 셋팅 — 우측바로 이동됨 */}

          {/* 상판 따내기 설정 (상부장만) */}
          {moduleData.category === 'upper' && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>상판 따내기</h5>
              <div className={styles.doorTabSelector}>
                <button
                  className={`${styles.doorTab} ${!currentPlacedModule?.topPanelNotchSize ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    updatePlacedModule(activePopup.id, { topPanelNotchSize: undefined, topPanelNotchSide: undefined });
                  }}
                >
                  없음
                </button>
                {currentPlacedModule?.isDualSlot && (
                  <button
                    className={`${styles.doorTab} ${currentPlacedModule?.topPanelNotchSize === '680x140' ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      updatePlacedModule(activePopup.id, {
                        topPanelNotchSize: '680x140',
                        topPanelNotchSide: currentPlacedModule?.topPanelNotchSide || 'right'
                      });
                    }}
                  >
                    680×140
                  </button>
                )}
                <button
                  className={`${styles.doorTab} ${currentPlacedModule?.topPanelNotchSize === '340x140' ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    updatePlacedModule(activePopup.id, {
                      topPanelNotchSize: '340x140',
                      topPanelNotchSide: currentPlacedModule?.topPanelNotchSide || 'right'
                    });
                  }}
                >
                  340×140
                </button>
              </div>
              {currentPlacedModule?.topPanelNotchSize && (
                <div className={styles.doorTabSelector} style={{ marginTop: '4px' }}>
                  <button
                    className={`${styles.doorTab} ${currentPlacedModule?.topPanelNotchSide === 'left' ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      updatePlacedModule(activePopup.id, { topPanelNotchSide: 'left' });
                    }}
                  >
                    좌
                  </button>
                  <button
                    className={`${styles.doorTab} ${(currentPlacedModule?.topPanelNotchSide || 'right') === 'right' ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      updatePlacedModule(activePopup.id, { topPanelNotchSide: 'right' });
                    }}
                  >
                    우
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 상하부장 사이 갭 백패널 설정 — 숨김 처리 */}


          {/* 삭제 버튼 */}
          <button 
            className={styles.deleteButton}
            onClick={handleDeleteClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            {t('common.delete')}
          </button>

          {/* 확인/취소 버튼 */}
          <div className={styles.confirmButtons}>
            <button
              className={styles.cancelButton}
              onClick={handleCancel}
            >
              {t('common.cancel')}
            </button>
            <button
              className={styles.confirmButton}
              onClick={handleClose}
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default PlacedModulePropertiesPanel; 
