import { resolvePetPanelThicknessMm } from './panelThickness';

export const getFramePanelKind = (panelName?: string): 'top' | 'base' | null => {
  if (!panelName) return null;
  const name = panelName.toLowerCase();
  if (name.includes('상단몰딩') || name.includes('top-frame')) return 'top';
  if (name.includes('걸레받이') || name.includes('걸래받이') || name.includes('base-frame')) return 'base';
  return null;
};

export const applyFramePanelListWidthFallback = (
  panel: any,
  module: any,
  moduleWidthMm: number | undefined,
  spaceInfo: any
) => {
  const kind = getFramePanelKind(panel?.name);
  if (!kind || !module || !Number.isFinite(moduleWidthMm) || panel?.width === undefined) return panel;

  const epThicknessMm = resolvePetPanelThicknessMm(module.endPanelThickness);
  const hasLeftEndPanel = module.hasLeftEndPanel === true;
  const hasRightEndPanel = module.hasRightEndPanel === true;
  const isFullSurround = spaceInfo?.surroundType === 'surround'
    && spaceInfo?.frameConfig?.top === true
    && spaceInfo?.frameConfig?.bottom === true;
  let widthMm = Number(moduleWidthMm);

  if (kind === 'top') {
    const epTopGapMm = module.endPanelTopOffset;
    const shouldInsetForEpCollision = module.endPanelMode !== 'outside'
      && (epTopGapMm === undefined || epTopGapMm > 0);
    const leftEpOffset = module.leftEndPanelOffset ?? module.endPanelOffset ?? 0;
    const rightEpOffset = module.rightEndPanelOffset ?? module.endPanelOffset ?? 0;
    const topFrameOffset = typeof module.topFrameOffset === 'number'
      ? module.topFrameOffset
      : (spaceInfo?.guideTopFrameAllMode ?? true)
        ? ((spaceInfo?.frameSize as any)?.topOffset ?? 0)
        : 0;
    const hasTopFrameOffset = Math.abs(topFrameOffset) > 0.001;

    if (shouldInsetForEpCollision) {
      if (isFullSurround) {
        if (hasLeftEndPanel && (leftEpOffset > 0 || hasTopFrameOffset)) widthMm -= epThicknessMm;
        if (hasRightEndPanel && (rightEpOffset > 0 || hasTopFrameOffset)) widthMm -= epThicknessMm;
      } else {
        if (hasLeftEndPanel) widthMm -= epThicknessMm;
        if (hasRightEndPanel) widthMm -= epThicknessMm;
      }
    }

    if (module.topFrameWidthAdjustEnabled === true) {
      widthMm += (module.topFrameLeftAdjustMm ?? 0) + (module.topFrameRightAdjustMm ?? 0);
    }
  } else {
    const epBottomGapMm = module.endPanelBottomOffset;
    const shouldInsetForBottomEpCollision = module.endPanelMode !== 'outside'
      && (epBottomGapMm === undefined || epBottomGapMm > 0);

    if (shouldInsetForBottomEpCollision) {
      if (hasLeftEndPanel) widthMm -= epThicknessMm;
      if (hasRightEndPanel) widthMm -= epThicknessMm;
    }

    if (module.baseFrameWidthAdjustEnabled === true) {
      widthMm += (module.baseFrameLeftAdjustMm ?? 0) + (module.baseFrameRightAdjustMm ?? 0);
    }
  }

  return {
    ...panel,
    width: Math.max(1, Math.round(widthMm * 10) / 10),
    __preferFrameWidthFallback: true,
  };
};

export const stripFramePanelListFallbackMarker = (panel: any) => {
  if (!panel || panel.__preferFrameWidthFallback === undefined) return panel;
  const { __preferFrameWidthFallback, ...rest } = panel;
  return rest;
};
