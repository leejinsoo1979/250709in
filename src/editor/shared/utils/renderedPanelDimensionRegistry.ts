import { getCanonicalPanelNameMatchScore, normalizeCanonicalPanelName } from './panelNameCanonical';

export interface RenderedPanelDimension {
  sourceId: string;
  furnitureId: string;
  panelName: string;
  canonicalName: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

const dimensions = new Map<string, RenderedPanelDimension>();
const listeners = new Set<() => void>();
let version = 0;

const canonicalKeyOf = (furnitureId: string, panelName: string) =>
  `${furnitureId}::${normalizeCanonicalPanelName(panelName)}`;

const sourceKeyOf = (furnitureId: string, panelName: string, sourceId?: string) =>
  `${canonicalKeyOf(furnitureId, panelName)}::${sourceId || 'default'}`;

const roundMm = (value: number) => Math.round(value * 10) / 10;

const notify = () => {
  version += 1;
  listeners.forEach(listener => listener());
};

export const subscribeRenderedPanelDimensions = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getRenderedPanelDimensionsSnapshot = () => version;

export const updateRenderedPanelDimension = ({
  sourceId,
  furnitureId,
  panelName,
  widthMm,
  heightMm,
  depthMm,
}: {
  sourceId?: string;
  furnitureId?: string;
  panelName?: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
}) => {
  if (!furnitureId || !panelName) return;
  if (![widthMm, heightMm, depthMm].every(Number.isFinite)) return;

  const canonicalName = normalizeCanonicalPanelName(panelName);
  const next: RenderedPanelDimension = {
    sourceId: sourceId || 'default',
    furnitureId,
    panelName,
    canonicalName,
    widthMm: roundMm(widthMm),
    heightMm: roundMm(heightMm),
    depthMm: roundMm(depthMm),
  };
  const key = sourceKeyOf(furnitureId, panelName, sourceId);
  const prev = dimensions.get(key);
  if (
    prev &&
    prev.widthMm === next.widthMm &&
    prev.heightMm === next.heightMm &&
    prev.depthMm === next.depthMm &&
    prev.panelName === next.panelName
  ) {
    return;
  }

  dimensions.set(key, next);
  notify();
};

export const removeRenderedPanelDimension = (furnitureId?: string, panelName?: string, sourceId?: string) => {
  if (!furnitureId || !panelName) return;
  if (sourceId) {
    if (dimensions.delete(sourceKeyOf(furnitureId, panelName, sourceId))) notify();
    return;
  }

  const canonicalKey = canonicalKeyOf(furnitureId, panelName);
  let changed = false;
  Array.from(dimensions.keys()).forEach(key => {
    if (key.startsWith(`${canonicalKey}::`)) {
      dimensions.delete(key);
      changed = true;
    }
  });
  if (changed) notify();
};

export const findRenderedPanelDimensions = (
  furnitureId: string | undefined,
  panelName: string | undefined
): RenderedPanelDimension[] => {
  if (!furnitureId || !panelName) return [];

  const canonicalName = normalizeCanonicalPanelName(panelName);
  const exact = Array.from(dimensions.values()).filter(item =>
    item.furnitureId === furnitureId && item.canonicalName === canonicalName
  );
  if (exact.length > 0) return exact;

  let bestScore = Infinity;
  const best: RenderedPanelDimension[] = [];
  dimensions.forEach(item => {
    if (item.furnitureId !== furnitureId) return;
    const score = getCanonicalPanelNameMatchScore(panelName, item.panelName);
    if (score >= 1) return;
    if (score < bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(item);
    } else if (score === bestScore) {
      best.push(item);
    }
  });

  return best;
};

export const findRenderedPanelDimension = (
  furnitureId: string | undefined,
  panelName: string | undefined
): RenderedPanelDimension | undefined => {
  return findRenderedPanelDimensions(furnitureId, panelName)[0];
};
