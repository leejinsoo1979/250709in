import { describe, expect, it } from 'vitest';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calcInsertFrameResizedPositionX, getModuleBoundsX, resolveInsertFrameResizeHingePosition } from '../freePlacementUtils';

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

const createInsertFrame = (hingePosition?: 'left' | 'right'): PlacedModule => ({
  id: `insert-${hingePosition ?? 'none'}`,
  moduleId: 'insert-frame-136',
  moduleWidth: 136,
  freeWidth: 136,
  customWidth: 136,
  position: { x: 0, y: 0, z: 0 },
  rotation: 0,
  isFreePlacement: true,
  freePlacementCategory: 'full',
  ...(hingePosition ? { hingePosition } : {})
});

const createNeighbor = (id: string, centerX: number, width: number): PlacedModule => ({
  id,
  moduleId: `single-shelf-${width}`,
  moduleWidth: width,
  freeWidth: width,
  customWidth: width,
  position: { x: centerX / 100, y: 0, z: 0 },
  rotation: 0,
  isFreePlacement: true,
  freePlacementCategory: 'full'
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

  it('붙어 있는 가구 면은 힌지보다 우선해서 유지한다', () => {
    const module = createInsertFrame('right');
    const oldBounds = getModuleBoundsX(module);
    const leftNeighbor = createNeighbor('left-neighbor', -318, 500);
    const nextX = calcInsertFrameResizedPositionX(module, 100, [leftNeighbor, module], spaceInfo);
    const nextBounds = getModuleBoundsX({
      ...module,
      position: { ...module.position, x: nextX },
      freeWidth: 100,
      moduleWidth: 100,
      customWidth: 100
    });

    expect(getModuleBoundsX(leftNeighbor).right).toBeCloseTo(oldBounds.left, 5);
    expect(nextBounds.left).toBeCloseTo(oldBounds.left, 5);
    expect(nextBounds.right).toBeCloseTo(oldBounds.right - 36, 5);
  });

  it('방향값이 없는 기존 찬넬도 붙어 있는 좌측 가구 면을 유지한다', () => {
    const module = createInsertFrame();
    const oldBounds = getModuleBoundsX(module);
    const leftNeighbor = createNeighbor('left-neighbor', -318, 500);
    const nextX = calcInsertFrameResizedPositionX(module, 236, [leftNeighbor, module], spaceInfo);
    const nextBounds = getModuleBoundsX({
      ...module,
      position: { ...module.position, x: nextX },
      freeWidth: 236,
      moduleWidth: 236,
      customWidth: 236
    });

    expect(resolveInsertFrameResizeHingePosition(module, [leftNeighbor, module], spaceInfo)).toBe('left');
    expect(nextBounds.left).toBeCloseTo(oldBounds.left, 5);
    expect(nextBounds.right).toBeCloseTo(oldBounds.right + 100, 5);
  });

  it('방향값이 없는 중앙 단독 찬넬도 양쪽이 아니라 한쪽 기준으로만 확장한다', () => {
    const module = createInsertFrame();
    const oldBounds = getModuleBoundsX(module);
    const nextX = calcInsertFrameResizedPositionX(module, 236, [module], spaceInfo);
    const nextBounds = getModuleBoundsX({
      ...module,
      position: { ...module.position, x: nextX },
      freeWidth: 236,
      moduleWidth: 236,
      customWidth: 236
    });

    expect(resolveInsertFrameResizeHingePosition(module, [module], spaceInfo)).toBe('left');
    expect(nextBounds.left).toBeCloseTo(oldBounds.left, 5);
    expect(nextBounds.right).toBeCloseTo(oldBounds.right + 100, 5);
  });
});
