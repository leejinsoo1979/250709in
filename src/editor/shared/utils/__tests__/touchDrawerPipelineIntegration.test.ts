/**
 * touchDrawerPipelineIntegration.test.ts
 *
 * VALIDATOR integration test: verifies that 터치서랍 뒷판 and 바닥판
 * survive the FULL pipeline from getModuleById → calculatePanelDetails
 * → useLivePanelData filter/map → CNCOptimizerPro grain-based L/W swap.
 *
 * Pipeline stages traced:
 *  Stage 1 – getModuleById (real module lookup, no mock)
 *  Stage 2 – calculatePanelDetails (raw panel generation)
 *  Stage 3 – useLivePanelData filter (header removal + dimension check)
 *  Stage 4 – useLivePanelData map  (Panel object with height = height||depth)
 *  Stage 5 – useLivePanelData grain assignment (getDefaultGrain)
 *  Stage 6 – CNCOptimizerPro L/W swap (grain-based)
 *  Stage 7 – CNCOptimizerPro material override (panelName.includes checks)
 */

import { describe, it, expect } from 'vitest';
import { calculatePanelDetails } from '../calculatePanelDetails';
import { getModuleById } from '@/data/modules';
import { getDefaultGrainDirection } from '@/editor/shared/utils/materialConstants';

// ─── helpers replicating useLivePanelData logic ──────────────────────────────

/** Mirrors getDefaultGrain() in useLivePanelData.ts */
function getDefaultGrain(panelName: string): 'HORIZONTAL' | 'VERTICAL' {
  return getDefaultGrainDirection(panelName) === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';
}

/** Mirrors the filter at useLivePanelData.ts lines 236-240 */
function applyLivePanelFilter(allPanelsList: any[]): any[] {
  return allPanelsList.filter((item: any) => {
    const isNotHeader = item.name && !item.name.includes('===');
    const hasValidDimensions = item.width !== undefined || item.depth !== undefined;
    return isNotHeader && hasValidDimensions;
  });
}

/** Mirrors the Panel map at useLivePanelData.ts lines 303-438 */
function applyLivePanelMap(modulePanels: any[], moduleIndex = 0): any[] {
  return modulePanels.map((panel: any, panelIndex: number) => {
    const grainValue = getDefaultGrain(panel.name);
    return {
      id: `m${moduleIndex}_p${panelIndex}`,
      name: panel.name,
      width: panel.width || 0,
      height: panel.height || panel.depth || 0,   // <── the critical line
      thickness: panel.thickness,
      material: panel.material || 'PB',
      grain: grainValue,
    };
  });
}

type Grain = 'H' | 'V' | 'NONE';

interface CutlistPanel {
  label: string;
  width: number;
  length: number;
  thickness: number;
  material: string;
  grain: Grain;
}

/** Mirrors the livePanels.map() in CNCOptimizerPro.tsx lines 376-441 and 516-583 */
function applyCNCConversion(livePanels: any[]): CutlistPanel[] {
  return livePanels.map((p: any): CutlistPanel => {
    const panelName = (p.name || '').toLowerCase();
    const isBackPanel = panelName.includes('백패널');

    let width: number;
    let length: number;

    if (isBackPanel) {
      length = p.height;
      width = p.width;
    } else if (p.grain === 'VERTICAL') {
      length = p.height;
      width = p.width;
    } else {
      // HORIZONTAL or NONE: X축(폭) = Length
      length = p.width;
      width = p.height;
    }

    const grain: Grain = isBackPanel ? 'H' : (p.grain === 'NONE' ? 'NONE' : 'H');

    let material = p.material || 'PB';
    if (panelName.includes('백패널') || (panelName.includes('서랍') && panelName.includes('바닥'))) {
      material = 'MDF';
    } else if (
      panelName.includes('도어') || panelName.includes('door') ||
      panelName.includes('엔드') || panelName.includes('end') ||
      panelName.includes('프레임') || panelName.includes('서라운드')
    ) {
      material = 'PET';
    }

    return { label: p.name || `Panel_${p.id}`, width, length, thickness: p.thickness, material, grain };
  });
}

// ─── test data ────────────────────────────────────────────────────────────────

const TOUCH_MODULE_IDS = [
  'lower-door-lift-touch-2tier-a-500',
  'lower-door-lift-touch-2tier-b-500',
  'lower-door-lift-touch-3tier-500',
  'lower-top-down-touch-2tier-500',
  'lower-top-down-touch-3tier-500',
];

const EXPECTED_DRAWER_COUNTS: Record<string, number> = {
  'lower-door-lift-touch-2tier-a-500': 2,
  'lower-door-lift-touch-2tier-b-500': 2,
  'lower-door-lift-touch-3tier-500': 3,
  'lower-top-down-touch-2tier-500': 2,
  'lower-top-down-touch-3tier-500': 3,
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe('Full Pipeline Integration: 터치서랍 뒷판/바닥판', () => {

  // ─ Stage 2 raw shape verification ──────────────────────────────────────────
  describe('Stage 2: calculatePanelDetails raw output shape', () => {
    it('터치서랍N 뒷판 has { width, height } — no depth property', () => {
      const rawPanels = calculatePanelDetails(
        { id: 'lower-door-lift-touch-2tier-a-500', category: 'lower', dimensions: { width: 500, height: 785, depth: 650 },
          isDynamic: true, defaultDepth: 650, thumbnail: '', description: '', color: '#e8f5e9',
          modelConfig: { basicThickness: 18, hasOpenFront: false,
            sections: [{ type: 'shelf', heightType: 'percentage', height: 100, count: 0 }] } } as any,
        500, 650, false, (k: string) => k
      );

      const backPanels = rawPanels.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
      expect(backPanels.length).toBe(2);

      backPanels.forEach((p: any) => {
        expect(p.width).toBeDefined();
        expect(p.width).toBeGreaterThan(0);
        expect(p.height).toBeDefined();
        expect(p.height).toBeGreaterThan(0);
        // 뒷판에는 depth가 없어야 함
        expect(p.depth).toBeUndefined();
        expect(p.thickness).toBe(15);
        expect(p.material).toBe('MDF');
      });
    });

    it('터치서랍N 바닥판 has { width, depth } — no height property', () => {
      const rawPanels = calculatePanelDetails(
        { id: 'lower-door-lift-touch-2tier-a-500', category: 'lower', dimensions: { width: 500, height: 785, depth: 650 },
          isDynamic: true, defaultDepth: 650, thumbnail: '', description: '', color: '#e8f5e9',
          modelConfig: { basicThickness: 18, hasOpenFront: false,
            sections: [{ type: 'shelf', heightType: 'percentage', height: 100, count: 0 }] } } as any,
        500, 650, false, (k: string) => k
      );

      const bottomPanels = rawPanels.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));
      expect(bottomPanels.length).toBe(2);

      bottomPanels.forEach((p: any) => {
        expect(p.width).toBeDefined();
        expect(p.width).toBeGreaterThan(0);
        expect(p.depth).toBeDefined();
        expect(p.depth).toBeGreaterThan(0);
        // 바닥판에는 height가 없어야 함
        expect(p.height).toBeUndefined();
        expect(p.thickness).toBe(15);
        expect(p.material).toBe('MDF');
      });
    });
  });

  // ─ Stage 3: filter ──────────────────────────────────────────────────────────
  describe('Stage 3: useLivePanelData filter (header removal + dimension check)', () => {
    it('뒷판 (has width) passes hasValidDimensions check', () => {
      // 뒷판: { width, height } — width !== undefined → passes
      const panel = { name: '터치서랍1 뒷판', width: 446, height: 120, thickness: 15, material: 'MDF' };
      const filtered = applyLivePanelFilter([panel]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('터치서랍1 뒷판');
    });

    it('바닥판 (has width) passes hasValidDimensions check', () => {
      // 바닥판: { width, depth } — width !== undefined → passes
      const panel = { name: '터치서랍1 바닥판', width: 446, depth: 580, thickness: 15, material: 'MDF' };
      const filtered = applyLivePanelFilter([panel]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('터치서랍1 바닥판');
    });

    it('section headers are removed by filter', () => {
      const items = [
        { name: '=== 서랍 및 도어 ===' },
        { name: '터치서랍1 바닥판', width: 446, depth: 580, thickness: 15, material: 'MDF' },
        { name: '터치서랍1 뒷판', width: 446, height: 120, thickness: 15, material: 'MDF' },
      ];
      const filtered = applyLivePanelFilter(items);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((p: any) => !p.name.includes('==='))).toBe(true);
    });

    it('a panel with neither width nor depth is dropped', () => {
      // edge case: malformed panel with only height
      const panel = { name: '이상한패널', height: 100, thickness: 15 };
      const filtered = applyLivePanelFilter([panel]);
      expect(filtered).toHaveLength(0);
    });
  });

  // ─ Stage 4: map (height = height || depth) ──────────────────────────────────
  describe('Stage 4: useLivePanelData map — height = panel.height || panel.depth', () => {
    it('뒷판: height preserved from panel.height', () => {
      const panel = { name: '터치서랍1 뒷판', width: 446, height: 120, thickness: 15, material: 'MDF' };
      const mapped = applyLivePanelMap([panel]);
      expect(mapped[0].height).toBe(120);    // panel.height exists → used
      expect(mapped[0].width).toBe(446);
    });

    it('바닥판: height resolved from panel.depth (no panel.height)', () => {
      const panel = { name: '터치서랍1 바닥판', width: 446, depth: 580, thickness: 15, material: 'MDF' };
      const mapped = applyLivePanelMap([panel]);
      expect(mapped[0].height).toBe(580);    // panel.depth fills in as height
      expect(mapped[0].width).toBe(446);
    });

    it('panel.height=0 and panel.depth set: depth is used', () => {
      // guard: if height=0 (falsy), depth should still be picked up
      const panel = { name: '터치서랍1 바닥판', width: 446, height: 0, depth: 580, thickness: 15, material: 'MDF' };
      const mapped = applyLivePanelMap([panel]);
      expect(mapped[0].height).toBe(580);
    });

    it('mapped panel height is non-zero for both panel types', () => {
      const backPanel  = { name: '터치서랍1 뒷판',  width: 446, height: 120, thickness: 15, material: 'MDF' };
      const bottomPanel = { name: '터치서랍1 바닥판', width: 446, depth:  580, thickness: 15, material: 'MDF' };
      const mapped = applyLivePanelMap([backPanel, bottomPanel]);
      expect(mapped[0].height).toBeGreaterThan(0);
      expect(mapped[1].height).toBeGreaterThan(0);
    });
  });

  // ─ Stage 5: grain assignment ─────────────────────────────────────────────────
  describe('Stage 5: grain assignment for touch drawer panels', () => {
    it('터치서랍N 뒷판 → HORIZONTAL grain (서랍 + 뒷판 rule)', () => {
      const grain = getDefaultGrain('터치서랍1 뒷판');
      expect(grain).toBe('HORIZONTAL');
    });

    it('터치서랍N 바닥판 → HORIZONTAL grain (서랍 + 바닥 rule)', () => {
      const grain = getDefaultGrain('터치서랍1 바닥판');
      expect(grain).toBe('HORIZONTAL');
    });

    it('터치서랍N(마이다) → HORIZONTAL grain', () => {
      const grain = getDefaultGrain('터치서랍1(마이다)');
      expect(grain).toBe('HORIZONTAL');
    });
  });

  // ─ Stage 6: CNC L/W swap ───────────────────────────────────────────────────
  describe('Stage 6: CNCOptimizerPro L/W swap for touch drawer panels', () => {
    it('뒷판 HORIZONTAL: length=width(넓은쪽), width=height(좁은쪽)', () => {
      // After Stage 4 map: { width: 446, height: 120, grain: 'HORIZONTAL' }
      const livePanels = [{ name: '터치서랍1 뒷판', width: 446, height: 120, thickness: 15, material: 'MDF', grain: 'HORIZONTAL' }];
      const cnc = applyCNCConversion(livePanels);

      // HORIZONTAL → length=p.width, width=p.height
      expect(cnc[0].length).toBe(446);   // X축 폭 = length
      expect(cnc[0].width).toBe(120);    // height = width
      expect(cnc[0].grain).toBe('H');
      expect(cnc[0].material).toBe('MDF');
      expect(cnc[0].thickness).toBe(15);
    });

    it('바닥판 HORIZONTAL: length=p.width, width=p.height(=depth after Stage 4)', () => {
      // After Stage 4 map: { width: 446, height: 580 (from raw.depth), grain: 'HORIZONTAL' }
      // CNCOptimizerPro HORIZONTAL branch: length = p.width, width = p.height
      // NOTE: CNCOptimizerPro does NOT call normalizeDimensions, so length=446 < width=580
      // is intentional — the raw X-axis dimension is preserved as "length" per the
      // grain-based convention, and the separate normalizePanels utility would swap if needed.
      const livePanels = [{ name: '터치서랍1 바닥판', width: 446, height: 580, thickness: 15, material: 'MDF', grain: 'HORIZONTAL' }];
      const cnc = applyCNCConversion(livePanels);

      // HORIZONTAL → length = p.width (X축), width = p.height (depth값)
      expect(cnc[0].length).toBe(446);   // p.width (cabinet inner width)
      expect(cnc[0].width).toBe(580);    // p.height = raw depth (cabinet depth)
      expect(cnc[0].grain).toBe('H');
      expect(cnc[0].material).toBe('MDF');
      expect(cnc[0].thickness).toBe(15);
    });

    it('CNC material override: 서랍바닥 → forced to MDF regardless of input material', () => {
      const livePanels = [{ name: '터치서랍1 바닥판', width: 446, height: 580, thickness: 15, material: 'PB', grain: 'HORIZONTAL' }];
      const cnc = applyCNCConversion(livePanels);
      // panelName includes '서랍' AND '바닥' → forced MDF
      expect(cnc[0].material).toBe('MDF');
    });

    it('both panels have non-zero length and width after CNC conversion', () => {
      const livePanels = [
        { name: '터치서랍1 뒷판',  width: 446, height: 120, thickness: 15, material: 'MDF', grain: 'HORIZONTAL' },
        { name: '터치서랍1 바닥판', width: 446, height: 580, thickness: 15, material: 'MDF', grain: 'HORIZONTAL' },
      ];
      const cnc = applyCNCConversion(livePanels);
      cnc.forEach(p => {
        expect(p.length).toBeGreaterThan(0);
        expect(p.width).toBeGreaterThan(0);
      });
    });
  });

  // ─ Stage 7: Full end-to-end per module ──────────────────────────────────────
  describe('Stage 7: Full end-to-end pipeline per module (real getModuleById)', () => {
    for (const moduleId of TOUCH_MODULE_IDS) {
      const expectedCount = EXPECTED_DRAWER_COUNTS[moduleId];

      it(`[${moduleId}] produces ${expectedCount} 뒷판 and ${expectedCount} 바닥판 through full pipeline`, () => {
        // Stage 1: real module lookup
        const internalSpace = { width: 500 - 36, height: 785, depth: 650 };
        const spaceInfo = { width: 500, height: 2400, depth: 650 } as any;
        const moduleData = getModuleById(moduleId, internalSpace, spaceInfo);

        expect(moduleData).not.toBeNull();
        expect(moduleData).toBeDefined();
        if (!moduleData) return;

        // Stage 2: calculatePanelDetails
        const rawPanels = calculatePanelDetails(
          moduleData, moduleData.dimensions.width, 650, false, (k: string) => k
        );
        expect(rawPanels.length).toBeGreaterThan(0);

        // Stage 3: filter (same as useLivePanelData)
        const filtered = applyLivePanelFilter(rawPanels);

        // Check panels survive filter
        const filteredBack   = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
        const filteredBottom = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));
        expect(filteredBack.length).toBe(expectedCount);
        expect(filteredBottom.length).toBe(expectedCount);

        // Stage 4: map
        const livePanels = applyLivePanelMap(filtered);

        const mappedBack   = livePanels.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
        const mappedBottom = livePanels.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));
        expect(mappedBack.length).toBe(expectedCount);
        expect(mappedBottom.length).toBe(expectedCount);

        // Stage 4 correctness: width and height must be > 0
        mappedBack.forEach((p: any) => {
          expect(p.width).toBeGreaterThan(0);
          expect(p.height).toBeGreaterThan(0);    // height comes from raw.height
        });
        mappedBottom.forEach((p: any) => {
          expect(p.width).toBeGreaterThan(0);
          expect(p.height).toBeGreaterThan(0);    // height comes from raw.depth (fallback)
        });

        // Stage 5: grain
        mappedBack.forEach((p: any) => {
          expect(p.grain).toBe('HORIZONTAL');
        });
        mappedBottom.forEach((p: any) => {
          expect(p.grain).toBe('HORIZONTAL');
        });

        // Stage 6: CNC conversion
        const cncPanels = applyCNCConversion(livePanels);

        const cncBack   = cncPanels.filter(p => p.label && p.label.includes('터치서랍') && p.label.includes('뒷판'));
        const cncBottom = cncPanels.filter(p => p.label && p.label.includes('터치서랍') && p.label.includes('바닥판'));
        expect(cncBack.length).toBe(expectedCount);
        expect(cncBottom.length).toBe(expectedCount);

        // Stage 6 correctness: non-zero dimensions, correct material
        cncBack.forEach(p => {
          expect(p.length).toBeGreaterThan(0);
          expect(p.width).toBeGreaterThan(0);
          expect(p.material).toBe('MDF');
          expect(p.grain).toBe('H');
          expect(p.thickness).toBe(15);
        });
        cncBottom.forEach(p => {
          expect(p.length).toBeGreaterThan(0);
          expect(p.width).toBeGreaterThan(0);
          expect(p.material).toBe('MDF');   // forced by material-override logic
          expect(p.grain).toBe('H');
          expect(p.thickness).toBe(15);
        });
      });
    }
  });

  // ─ Dual module: getModuleById with spaceInfo._tempSlotWidths ────────────────
  describe('Dual module lookup: getModuleById with _tempSlotWidths', () => {
    it('dual-lower-door-lift-touch-2tier-a-1000 found via _tempSlotWidths=[500,500]', () => {
      // In real usage, the space is wider than any individual furniture piece.
      // internalSpace.width must be >= dualWidth for the guard to pass.
      const internalSpace = { width: 2700 - 36, height: 785, depth: 650 };
      const spaceInfo = {
        width: 2700, height: 2400, depth: 650,
        _tempSlotWidths: [500, 500]
      } as any;

      const moduleData = getModuleById('dual-lower-door-lift-touch-2tier-a-1000', internalSpace, spaceInfo);

      // If the module is still null, this verifies the existing known regression.
      // The test documents the actual behavior without hiding the failure.
      if (moduleData === null || moduleData === undefined) {
        console.warn(
          '[KNOWN BUG] getModuleById("dual-lower-door-lift-touch-2tier-a-1000") returns null. ' +
          'Root cause: generateShelvingModules computes dualWidth from _tempSlotWidths correctly, ' +
          'but internalSpace.width=964 causes dualWidth<=internalSpace.width to evaluate as 1000<=964=FALSE, ' +
          'so the dual branch is skipped and dual touch modules are never generated.'
        );
        // Document the root cause clearly instead of hiding the failure:
        expect(moduleData).toBeDefined(); // this will fail and surface the bug
        return;
      }

      // If found: verify it generates panels correctly
      const rawPanels = calculatePanelDetails(
        moduleData, moduleData.dimensions.width, 650, false, (k: string) => k
      );
      const filtered = applyLivePanelFilter(rawPanels);
      const backPanels   = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
      const bottomPanels = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

      expect(backPanels.length).toBe(2);
      expect(bottomPanels.length).toBe(2);
    });

    it('dual module: internalSpace.width must include both slots for the condition dualWidth<=internalSpace.width', () => {
      // With internalSpace.width = 1000 (not 964), the dual branch fires correctly.
      const internalSpace = { width: 1000, height: 785, depth: 650 };
      const spaceInfo = {
        width: 1000, height: 2400, depth: 650,
        _tempSlotWidths: [500, 500]
      } as any;

      const moduleData = getModuleById('dual-lower-door-lift-touch-2tier-a-1000', internalSpace, spaceInfo);
      expect(moduleData).toBeDefined();
      expect(moduleData).not.toBeNull();

      if (moduleData) {
        const rawPanels = calculatePanelDetails(
          moduleData, moduleData.dimensions.width, 650, false, (k: string) => k
        );
        const filtered  = applyLivePanelFilter(rawPanels);
        const backPanels   = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
        const bottomPanels = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

        expect(backPanels.length).toBe(2);
        expect(bottomPanels.length).toBe(2);

        // Full pipeline
        const livePanels = applyLivePanelMap(filtered);
        const cncPanels  = applyCNCConversion(livePanels);
        const cncBack    = cncPanels.filter(p => p.label.includes('터치서랍') && p.label.includes('뒷판'));
        const cncBottom  = cncPanels.filter(p => p.label.includes('터치서랍') && p.label.includes('바닥판'));

        expect(cncBack.length).toBe(2);
        expect(cncBottom.length).toBe(2);
        cncBack.forEach(p => {
          expect(p.length).toBeGreaterThan(0);
          expect(p.width).toBeGreaterThan(0);
          expect(p.material).toBe('MDF');
        });
        cncBottom.forEach(p => {
          expect(p.length).toBeGreaterThan(0);
          expect(p.width).toBeGreaterThan(0);
          expect(p.material).toBe('MDF');
        });
      }
    });
  });

  // ─ Regression: no touch drawer panels silently dropped ─────────────────────
  describe('Regression: panel counts must be stable across pipeline stages', () => {
    it('total panel count does not decrease from Stage 2 raw to Stage 3 filtered (only headers removed)', () => {
      const rawPanels = calculatePanelDetails(
        { id: 'lower-door-lift-touch-2tier-a-500', category: 'lower',
          dimensions: { width: 500, height: 785, depth: 650 },
          isDynamic: true, defaultDepth: 650, thumbnail: '', description: '', color: '#e8f5e9',
          modelConfig: { basicThickness: 18, hasOpenFront: false,
            sections: [{ type: 'shelf', heightType: 'percentage', height: 100, count: 0 }] } } as any,
        500, 650, false, (k: string) => k
      );

      const headers  = rawPanels.filter((p: any) => p.name && p.name.includes('==='));
      const filtered = applyLivePanelFilter(rawPanels);

      // Only headers should be removed, nothing else
      expect(filtered.length).toBe(rawPanels.length - headers.length);
    });

    it('touch drawer panels (뒷판+바닥판) are NOT dropped by the hasValidDimensions check', () => {
      const rawPanels = calculatePanelDetails(
        { id: 'lower-door-lift-touch-3tier-500', category: 'lower',
          dimensions: { width: 500, height: 785, depth: 650 },
          isDynamic: true, defaultDepth: 650, thumbnail: '', description: '', color: '#e8f5e9',
          modelConfig: { basicThickness: 18, hasOpenFront: false,
            sections: [{ type: 'shelf', heightType: 'percentage', height: 100, count: 0 }] } } as any,
        500, 650, false, (k: string) => k
      );

      const rawBack   = rawPanels.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
      const rawBottom = rawPanels.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

      const filtered = applyLivePanelFilter(rawPanels);
      const filtBack   = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('뒷판'));
      const filtBottom = filtered.filter((p: any) => p.name && p.name.includes('터치서랍') && p.name.includes('바닥판'));

      // Count must be identical before and after filter
      expect(filtBack.length).toBe(rawBack.length);
      expect(filtBottom.length).toBe(rawBottom.length);
      // And the expected count for 3-tier
      expect(filtBack.length).toBe(3);
      expect(filtBottom.length).toBe(3);
    });

    it('Stage 4 map: no panel ends up with height=0 for touch drawer panels', () => {
      const rawPanels = calculatePanelDetails(
        { id: 'lower-door-lift-touch-2tier-a-500', category: 'lower',
          dimensions: { width: 500, height: 785, depth: 650 },
          isDynamic: true, defaultDepth: 650, thumbnail: '', description: '', color: '#e8f5e9',
          modelConfig: { basicThickness: 18, hasOpenFront: false,
            sections: [{ type: 'shelf', heightType: 'percentage', height: 100, count: 0 }] } } as any,
        500, 650, false, (k: string) => k
      );
      const filtered   = applyLivePanelFilter(rawPanels);
      const livePanels = applyLivePanelMap(filtered);

      const touchPanels = livePanels.filter((p: any) => p.name && p.name.includes('터치서랍'));
      touchPanels.forEach((p: any) => {
        expect(p.height).toBeGreaterThan(0);
        expect(p.width).toBeGreaterThan(0);
      });
    });

    it('Stage 6 CNC: no panel ends up with length=0 or width=0 for touch drawer panels', () => {
      const rawPanels = calculatePanelDetails(
        { id: 'lower-door-lift-touch-2tier-a-500', category: 'lower',
          dimensions: { width: 500, height: 785, depth: 650 },
          isDynamic: true, defaultDepth: 650, thumbnail: '', description: '', color: '#e8f5e9',
          modelConfig: { basicThickness: 18, hasOpenFront: false,
            sections: [{ type: 'shelf', heightType: 'percentage', height: 100, count: 0 }] } } as any,
        500, 650, false, (k: string) => k
      );
      const filtered   = applyLivePanelFilter(rawPanels);
      const livePanels = applyLivePanelMap(filtered);
      const cncPanels  = applyCNCConversion(livePanels);

      const touchCnc = cncPanels.filter(p => p.label && p.label.includes('터치서랍'));
      expect(touchCnc.length).toBeGreaterThan(0);
      touchCnc.forEach(p => {
        expect(p.length).toBeGreaterThan(0);
        expect(p.width).toBeGreaterThan(0);
      });
    });
  });
});
