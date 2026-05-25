import { describe, expect, it } from 'vitest';
import type { ModuleData } from '@/data/modules/shelving';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import { convertFurnitureToBoring } from './furnitureToBoringConverter';

describe('convertFurnitureToBoring', () => {
  it('uses shelf-split lower top panel depth for top-panel boring positions', () => {
    const placedModule = {
      id: 'shelf-split-1',
      moduleId: 'single-shelf-split-500',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      customDepth: 380,
      hasDoor: true,
      backPanelThickness: 9,
    } as PlacedModule;

    const moduleData = {
      id: 'single-shelf-split-500',
      name: '도어분절 현관장',
      category: 'full',
      dimensions: {
        width: 500,
        height: 2200,
        depth: 380,
      },
      color: '#ffffff',
      modelConfig: {
        sections: [
          { type: 'shelf', height: 860, heightType: 'absolute', count: 2 },
          { type: 'shelf', height: 1340, heightType: 'absolute', count: 4 },
        ],
      },
    } as ModuleData;

    const result = convertFurnitureToBoring({
      placedModule,
      moduleData,
      panelThickness: 18,
    });

    const topPanel = result.panels.find(panel => panel.panelType === 'top');
    expect(topPanel?.height).toBe(296);

    const camHousingY = topPanel?.borings
      .filter(boring => boring.type === 'cam-housing')
      .map(boring => boring.y);
    expect(camHousingY).toEqual([37, 259, 37, 259]);
  });

  it('does not add side hinge borings for lower drawer-front modules', () => {
    const placedModule = {
      id: 'lower-drawer-1',
      moduleId: 'lower-drawer-3tier-600',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      hasDoor: true,
      hingePosition: 'right',
    } as PlacedModule;

    const moduleData = {
      id: 'lower-drawer-3tier-600',
      name: '하부 서랍 3단',
      category: 'lower',
      dimensions: {
        width: 600,
        height: 900,
        depth: 580,
      },
      color: '#ffffff',
      modelConfig: {
        sections: [
          { type: 'drawer', height: 100, heightType: 'percentage', count: 3 },
        ],
      },
    } as ModuleData;

    const result = convertFurnitureToBoring({
      placedModule,
      moduleData,
      panelThickness: 18,
    });

    const sideBorings = result.panels
      .filter(panel => panel.panelType === 'side-left' || panel.panelType === 'side-right')
      .flatMap(panel => panel.borings);

    expect(sideBorings.some(boring => boring.type === 'hinge-screw')).toBe(false);
    expect(sideBorings.some(boring => boring.id.startsWith('cam-bolt-top'))).toBe(false);
  });
});
