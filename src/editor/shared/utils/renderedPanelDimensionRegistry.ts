import { getCanonicalPanelNameMatchScore, normalizeCanonicalPanelName } from './panelNameCanonical';

export interface RenderedPanelDimension {
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

const keyOf = (furnitureId: string, panelName: string) =>
  `${furnitureId}::${normalizeCanonicalPanelName(panelName)}`;

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
  furnitureId,
  panelName,
  widthMm,
  heightMm,
  depthMm,
}: {
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
    furnitureId,
    panelName,
    canonicalName,
    widthMm: roundMm(widthMm),
    heightMm: roundMm(heightMm),
    depthMm: roundMm(depthMm),
  };
  const key = keyOf(furnitureId, panelName);
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

export const removeRenderedPanelDimension = (furnitureId?: string, panelName?: string) => {
  if (!furnitureId || !panelName) return;
  if (dimensions.delete(keyOf(furnitureId, panelName))) notify();
};

export const findRenderedPanelDimension = (
  furnitureId: string | undefined,
  panelName: string | undefined
): RenderedPanelDimension | undefined => {
  if (!furnitureId || !panelName) return undefined;

  const exact = dimensions.get(keyOf(furnitureId, panelName));
  if (exact) return exact;

  let best: { score: number; item: RenderedPanelDimension } | null = null;
  dimensions.forEach(item => {
    if (item.furnitureId !== furnitureId) return;
    const score = getCanonicalPanelNameMatchScore(panelName, item.panelName);
    if (score >= 1) return;
    if (!best || score < best.score) {
      best = { score, item };
    }
  });

  return best?.item;
};
