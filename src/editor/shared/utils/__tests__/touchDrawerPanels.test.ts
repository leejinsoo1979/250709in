import { describe, it, expect } from 'vitest';
import { calculatePanelDetails } from '../calculatePanelDetails';
import { ModuleData, getModuleById } from '@/data/modules';

describe('Touch Drawer Panel Generation', () => {
  const createTouchModule = (id: string): ModuleData => ({
    id,
    name: `Test ${id}`,
    category: 'lower' as const,
    dimensions: { width: 500, height: 785, depth: 650 },
    isDynamic: true,
    defaultDepth: 650,
    thumbnail: '',
    description: '',
    color: '#e8f5e9',
    modelConfig: {
      basicThickness: 18,
      hasOpenFront: false,
      sections: [{ type: 'shelf', heightType: 'percentage', height: 100, count: 0 }]
    }
  } as ModuleData);

  it('should generate 터치서랍 뒷판 and 바닥판 for 도어올림 터치 2단A', () => {
    const moduleData = createTouchModule('lower-door-lift-touch-2tier-a-500');
    const result = calculatePanelDetails(moduleData, 500, 650, false, (k: string) => k);

    const panelNames = result.map((p: any) => p.name).filter(Boolean);
    console.log('All panels:', panelNames);

    // Check 터치서랍 뒷판 exists
    const backPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
    expect(backPanels.length).toBeGreaterThan(0);
    
    // Check 터치서랍 바닥판 exists
    const bottomPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));
    expect(bottomPanels.length).toBeGreaterThan(0);

    // Should have 2 drawers for 2-tier
    expect(backPanels.length).toBe(2);
    expect(bottomPanels.length).toBe(2);

    // Verify dimensions are valid (non-zero)
    backPanels.forEach((p: any) => {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.thickness).toBe(15);
      expect(p.material).toBe('PB'); // 뒷판은 PB
    });
    bottomPanels.forEach((p: any) => {
      expect(p.width).toBeGreaterThan(0);
      expect(p.depth).toBeGreaterThan(0);
      expect(p.thickness).toBe(15);
      expect(p.material).toBe('PB'); // 레그라 서랍 바닥판은 PB
    });
  });

  it('should generate 터치서랍 뒷판 and 바닥판 for 상판내림 터치 2단', () => {
    const moduleData = createTouchModule('lower-top-down-touch-2tier-500');
    const result = calculatePanelDetails(moduleData, 500, 650, false, (k: string) => k);

    const backPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
    const bottomPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

    expect(backPanels.length).toBe(2);
    expect(bottomPanels.length).toBe(2);
  });

  it('should generate 터치서랍 뒷판 and 바닥판 for 도어올림 터치 3단', () => {
    const moduleData = createTouchModule('lower-door-lift-touch-3tier-500');
    const result = calculatePanelDetails(moduleData, 500, 650, false, (k: string) => k);

    const backPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
    const bottomPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

    expect(backPanels.length).toBe(3);
    expect(bottomPanels.length).toBe(3);
  });

  it('should also generate cabinet body panels (백패널, 바닥) for touch drawer modules', () => {
    const moduleData = createTouchModule('lower-door-lift-touch-2tier-a-500');
    const result = calculatePanelDetails(moduleData, 500, 650, false, (k: string) => k);

    // Cabinet back panel
    const cabinetBackPanels = result.filter((p: any) => p.name && p.name.includes('백패널'));
    expect(cabinetBackPanels.length).toBe(1);

    // Cabinet bottom panel
    const cabinetBottomPanels = result.filter((p: any) => p.name === '바닥');
    expect(cabinetBottomPanels.length).toBe(1);

    // Cabinet top panel
    const cabinetTopPanels = result.filter((p: any) => p.name === '상판');
    expect(cabinetTopPanels.length).toBe(1);
  });

  it('should generate 터치서랍 panels for dual modules too', () => {
    const moduleData = createTouchModule('dual-lower-door-lift-touch-2tier-a-1000');
    moduleData.dimensions.width = 1000;
    const result = calculatePanelDetails(moduleData, 1000, 650, false, (k: string) => k);

    const backPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
    const bottomPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

    expect(backPanels.length).toBe(2);
    expect(bottomPanels.length).toBe(2);
  });

  it('should generate 터치서랍 panels using REAL module from getModuleById', () => {
    // Simulate what useLivePanelData does: get module via getModuleById
    const internalSpace = { width: 500 - 36, height: 785, depth: 650 };
    const spaceInfo = { width: 500, height: 2400, depth: 650 } as any;

    const moduleData = getModuleById('lower-door-lift-touch-2tier-a-500', internalSpace, spaceInfo);
    console.log('getModuleById result:', moduleData ? { id: moduleData.id, category: moduleData.category, sections: moduleData.modelConfig?.sections } : 'NULL');

    expect(moduleData).not.toBeNull();
    expect(moduleData).toBeDefined();

    if (moduleData) {
      // Verify the module ID contains the touch pattern
      expect(moduleData.id).toContain('lower-door-lift-touch-');

      const result = calculatePanelDetails(moduleData, moduleData.dimensions.width, 650, false, (k: string) => k);
      const panelNames = result.map((p: any) => p.name).filter(Boolean);
      console.log('Real module panels:', panelNames);

      const backPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
      const bottomPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

      expect(backPanels.length).toBe(2);
      expect(bottomPanels.length).toBe(2);
    }
  });

  it('should generate 터치서랍 panels using REAL dual module from getModuleById', () => {
    // Dual module: internal space must be wider than dual width for the guard check to pass
    // In real usage, space width is much larger than any single furniture piece
    const internalSpace = { width: 2700 - 36, height: 785, depth: 650 };
    const spaceInfo = {
      width: 2700, height: 2400, depth: 650,
      _tempSlotWidths: [500, 500]
    } as any;

    const moduleData = getModuleById('dual-lower-door-lift-touch-2tier-a-1000', internalSpace, spaceInfo);
    console.log('getModuleById dual result:', moduleData ? { id: moduleData.id, category: moduleData.category } : 'NULL');

    expect(moduleData).not.toBeNull();
    expect(moduleData).toBeDefined();

    if (moduleData) {
      expect(moduleData.id).toContain('lower-door-lift-touch-');

      const result = calculatePanelDetails(moduleData, moduleData.dimensions.width, 650, false, (k: string) => k);
      const panelNames = result.map((p: any) => p.name).filter(Boolean);
      console.log('Real dual module panels:', panelNames);

      const backPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
      const bottomPanels = result.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

      expect(backPanels.length).toBe(2);
      expect(bottomPanels.length).toBe(2);
    }
  });
});
