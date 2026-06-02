import { describe, expect, it } from 'vitest';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calcInsertFrameResizedPositionX, getModuleBoundsX } from '../freePlacementUtils';

const spaceInfo: SpaceInfo = {
  width: 3000,
  height: 2400,
  depth: 600,
  installType: 'builtin',
  wallConfig: { left: true, right: true },
  hasFloorFinish: false,
  surroundType: 'no-surround',
  layoutMode: 'free-placement',
  gapConfig: { left: 0, right: 0 }
};

const createInsertFrame = (hingePosition: 'left' | 'right'): PlacedModule => ({
  id: `insert-${hingePosition}`,
  moduleId: 'insert-frame-136',
  moduleWidth: 136,
  freeWidth: 136,
  customWidth: 136,
  position: { x: 0, y: 0, z: 0 },
  rotation: 0,
  isFreePlacement: true,
  freePlacementCategory: 'full',
  hingePosition
});

describe('calcInsertFrameResizedPositionX', () => {
  it('좌측 힌지 찬넬은 오른쪽 열림방향으로만 확장한다', () => {
    const module = createInsertFrame('left');
    const oldBounds = getModuleBoundsX(module);
    const nextX = calcInsertFrameResizedPositionX(module, 236, [module], spaceInfo);
    const nextBounds = getModuleBoundsX({
      ...module,
      position: { ...module.position, x: nextX },
      freeWidth: 236,
      moduleWidth: 236,
      customWidth: 236
    });

    expect(nextBounds.left).toBeCloseTo(oldBounds.left, 5);
    expect(nextBounds.right).toBeCloseTo(oldBounds.right + 100, 5);
  });

  it('우측 힌지 찬넬은 왼쪽 열림방향으로만 확장한다', () => {
    const module = createInsertFrame('right');
    const oldBounds = getModuleBoundsX(module);
    const nextX = calcInsertFrameResizedPositionX(module, 236, [module], spaceInfo);
    const nextBounds = getModuleBoundsX({
      ...module,
      position: { ...module.position, x: nextX },
      freeWidth: 236,
      moduleWidth: 236,
      customWidth: 236
    });

    expect(nextBounds.right).toBeCloseTo(oldBounds.right, 5);
    expect(nextBounds.left).toBeCloseTo(oldBounds.left - 100, 5);
  });
});
