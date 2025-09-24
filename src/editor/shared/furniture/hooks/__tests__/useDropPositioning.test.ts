import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDropPositioning } from '../useDropPositioning';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModulesByCategory } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';

const mockGetModuleById = vi.fn(() => ({
  id: 'mock-module',
  dimensions: { width: 600, height: 2200, depth: 580 },
}));

vi.mock('@/data/modules', () => ({
  getModuleById: mockGetModuleById,
}));

const createSpaceInfo = (): SpaceInfo => ({
  width: 3000,
  height: 2400,
  depth: 600,
  installType: 'semistanding',
  surroundType: 'no-surround',
  wallConfig: { left: true, right: false },
  gapConfig: { left: 2, right: 18 },
  hasFloorFinish: false,
  baseConfig: { type: 'floor', height: 65 },
  frameSize: { left: 50, right: 50, top: 50 },
});

const appendCanvas = () => {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, right: 1000, width: 1000, height: 600, top: 0, bottom: 600 }),
  });
  document.body.appendChild(canvas);
  return canvas;
};

describe('useDropPositioning', () => {
  beforeEach(() => {
    mockGetModuleById.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('places first slot respecting left gap in semistanding no-surround', () => {
    const spaceInfo = createSpaceInfo();
    const canvas = appendCanvas();

    const { calculateDropPosition } = useDropPositioning(spaceInfo);
    const indexing = calculateSpaceIndexing(spaceInfo);
    const expectedX = indexing.threeUnitPositions[0];

    const dropEvent = { clientX: 0 } as any;
    const result = calculateDropPosition(dropEvent, {
      type: 'furniture',
      moduleData: {
        id: 'mock-module',
        name: 'Mock Module',
        dimensions: { width: 600, height: 2200, depth: 580 },
        type: 'box',
      },
    });

    expect(result).not.toBeNull();
    expect(result?.column).toBe(0);
    expect(result?.x).toBeCloseTo(expectedX, 5);

    canvas.remove();
  });

  it('generates gallery modules that keep fractional slot width for semistanding no-surround', () => {
    const spaceInfo = createSpaceInfo();
    const indexing = calculateSpaceIndexing(spaceInfo);
    const internalSpace = calculateInternalSpace(spaceInfo);

    const modules = getModulesByCategory('full', internalSpace, {
      ...spaceInfo,
      _tempSlotWidths: indexing.slotWidths,
    } as any);

    expect(modules.length).toBeGreaterThan(0);
    expect(modules[0].dimensions.width).toBeCloseTo(indexing.slotWidths?.[0] ?? 0, 2);
  });
});
