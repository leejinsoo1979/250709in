import { describe, expect, it } from 'vitest';
import type { PanelBoringData } from '@/domain/boring/types';
import type { PlacedPanel } from '../types';
import { buildMprAssemblyMetadata } from './mprAssemblyMetadata';

describe('buildMprAssemblyMetadata', () => {
  it('adds assembly metadata with mirrored side panel directions and groove operations', () => {
    const panels = [
      {
        id: 'right-side-1',
        name: '(하)우측',
        width: 380,
        height: 860,
        x: 0,
        y: 0,
        rotated: false,
        quantity: 1,
        material: 'PB',
        color: 'MW',
        grain: 'VERTICAL',
        sideNotches: [{ y: 80, z: 40, fromBottom: 780 }],
        furnitureId: 'module-1',
      } as PlacedPanel,
    ];
    const mprPanels: PanelBoringData[] = [
      {
        panelId: 'right-side-1',
        furnitureId: 'module-1',
        furnitureName: '',
        panelType: 'side-right',
        panelName: '(하)우측',
        width: 380,
        height: 860,
        thickness: 18,
        material: 'PB',
        grain: 'V',
        borings: [
          {
            id: 'fixed-side-1',
            type: 'shelf-pin',
            face: 'right',
            x: 380,
            y: 30,
            diameter: 5,
            depth: 30,
            note: 'fixed-panel-side-bore',
          },
        ],
        sideNotches: [{ y: 80, z: 40, fromBottom: 780 }],
      },
    ];

    const metadata = buildMprAssemblyMetadata({
      projectName: 'project',
      panels,
      mprPanels,
      files: [{ filename: '(하)우측.mpr' }],
      placedModules: [
        {
          id: 'module-1',
          moduleId: 'lower-test',
          position: { x: 3, y: 4.3, z: 1.9 },
          rotation: 0,
          customWidth: 1162,
          customDepth: 380,
          customHeight: 860,
        } as any,
      ],
      spaceInfo: { width: 1200, height: 860, depth: 380 },
    });

    const panel = metadata.panels[0];
    expect(panel.mprFileName).toBe('(하)우측.mpr');
    expect(panel.panelRole).toBe('right_side');
    expect(panel.moduleName).toBe('lower');
    expect(panel.mirror).toBe(true);
    expect(panel.frontDirection).toEqual([0, -1, 0]);
    expect(panel.innerFaceDirection).toEqual([-1, 0, 0]);
    expect(panel.localAxes.mprX).toEqual([0, 1, 0]);
    expect(panel.localAxes.mprY).toEqual([0, 0, 1]);
    expect(panel.localAxes.mprZ).toEqual([-1, 0, 0]);
    expect(panel.position).toEqual({ x: 1144, y: 0, z: 0 });
    expect(panel.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'back-panel-groove',
        operationType: 'groove',
        through: false,
        depth: 7.5,
        mpr: expect.objectContaining({ XA: 16, YA: 0, LA: 10, BR: 860, TI: 7.5 }),
      }),
      expect.objectContaining({
        id: 'side-notch-1',
        operationType: 'through_cut',
        through: true,
        depth: 18,
        mpr: expect.objectContaining({ XA: 340, YA: 780, LA: 40, BR: 80, TI: 'T' }),
      }),
      expect.objectContaining({
        id: 'fixed-side-1',
        operationType: 'boring',
        bmMeaning: 'drill progresses in negative MPR local X direction',
        drillDirectionVector: [0, -1, 0],
      }),
    ]));
  });
});
