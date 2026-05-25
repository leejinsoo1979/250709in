import { describe, expect, it } from 'vitest';
import { generateSinglePanelMPR } from '@/domain/boring/exporters/mprExporter';
import type { PlacedPanel } from '../types';
import { convertPlacedPanelToMprBoringData } from './mprPanelConversion';

describe('convertPlacedPanelToMprBoringData', () => {
  it('converts optimizer horizontal panel coordinates so side bores are on product left/right edges', () => {
    const panel = {
      id: 'top-1',
      name: '상판',
      width: 580,
      height: 764,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'HORIZONTAL',
      sideBoringPositions: [30, 290, 550],
      sideBoringDiameter: 5,
      sideBoringDepth: 30,
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);

    expect(converted.width).toBe(764);
    expect(converted.height).toBe(580);
    expect(converted.borings.filter(boring => boring.note === 'fixed-panel-side-bore')).toEqual([
      expect.objectContaining({ face: 'left', x: 0, y: 30 }),
      expect.objectContaining({ face: 'right', x: 764, y: 30 }),
      expect.objectContaining({ face: 'left', x: 0, y: 290 }),
      expect.objectContaining({ face: 'right', x: 764, y: 290 }),
      expect.objectContaining({ face: 'left', x: 0, y: 550 }),
      expect.objectContaining({ face: 'right', x: 764, y: 550 }),
    ]);

    const mpr = generateSinglePanelMPR(converted);
    expect(mpr).toContain('l="764.0000"');
    expect(mpr).toContain('w="580.0000"');
    expect(mpr).toContain('BM="XP"');
    expect(mpr).toContain('BM="XM"');
    expect(mpr).toContain('WI="0.0000"');
    expect(mpr).toContain('WI="180.0000"');
    expect(mpr).toContain('XA="0.0000"');
    expect(mpr).toContain('XA="764.0000"');
  });

  it('uses product coordinates when explicit side-bore positions exist even if the name is not recognized', () => {
    const panel = {
      id: 'unknown-fixed-1',
      name: '패널A',
      width: 410,
      height: 800,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'HORIZONTAL',
      sideBoringPositions: [30, 205, 380],
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);

    expect(converted.width).toBe(800);
    expect(converted.height).toBe(410);
    expect(converted.borings[1]).toEqual(expect.objectContaining({
      face: 'right',
      x: 800,
      y: 30,
      note: 'fixed-panel-side-bore',
    }));
  });

  it('exports drawer side bottom grooves as MPR pocket machining', () => {
    const panel = {
      id: 'drawer-side-left-1',
      name: '서랍1 좌측판',
      width: 500,
      height: 155,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'VERTICAL',
      groovePositions: [{ y: 12, height: 10, depth: 7.5 }],
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);

    expect(converted.groovePositions).toEqual([{ y: 12, height: 10, depth: 7.5 }]);

    const mpr = generateSinglePanelMPR(converted);
    expect(mpr).toContain('<105 \\Ktasche\\');
    expect(mpr).toContain('KM="서랍 바닥홈 1: L 500 x W 10, 바닥기준 12, 깊이 7.5"');
    expect(mpr).toContain('XA="0.0"');
    expect(mpr).toContain('YA="12.0"');
    expect(mpr).toContain('LA="500"');
    expect(mpr).toContain('BR="10"');
    expect(mpr).toContain('TI="7.5"');
  });

  it('exports side notch as sample-style contour milling', () => {
    const panel = {
      id: 'right-side-with-notch-1',
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
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);
    const mpr = generateSinglePanelMPR(converted);

    expect(converted.width).toBe(860);
    expect(converted.height).toBe(380);
    expect(mpr).toContain(']3');
    expect(mpr).toContain('X=860.0000');
    expect(mpr).toContain('Y=40.0000');
    expect(mpr).toContain('X=780.0000');
    expect(mpr).toContain('Y=0.0000');
    expect(mpr).toContain('<105 \\Konturfraesen\\');
    expect(mpr).toContain('EA="3:0"');
    expect(mpr).toContain('EE="3:2"');
    expect(mpr).toContain('ZA="-2.0000"');
    expect(mpr).not.toContain('측판 따내기');
  });

  it('exports furniture side back-panel groove as sample-style Nuten machining', () => {
    const panel = {
      id: 'left-side-with-back-groove-1',
      name: '(하)좌측',
      width: 380,
      height: 860,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'VERTICAL',
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);
    const mpr = generateSinglePanelMPR(converted);

    expect(converted.width).toBe(860);
    expect(converted.height).toBe(380);
    expect(mpr).toContain(']2');
    expect(mpr).toContain('X=0.0000');
    expect(mpr).toContain('Y=360.0000');
    expect(mpr).toContain('X=860.0000');
    expect(mpr).toContain('<109 \\Nuten\\');
    expect(mpr).toContain('XA="-1.0000"');
    expect(mpr).toContain('YA="361.5000"');
    expect(mpr).toContain('XE="861.0000"');
    expect(mpr).toContain('YE="361.5000"');
    expect(mpr).toContain('NB="3.0000"');
    expect(mpr).toContain('TI="7.5000"');
    expect(mpr).not.toContain('백패널 홈');
  });

  it('does not export back-panel grooves on bottom panels', () => {
    const panel = {
      id: 'lower-bottom-1',
      name: '(하)바닥',
      width: 354,
      height: 1162,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'HORIZONTAL',
      sideBoringPositions: [30, 177, 324],
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);
    const mpr = generateSinglePanelMPR(converted);

    expect(converted.panelType).toBe('bottom');
    expect(mpr).not.toContain('<109 \\Nuten\\');
    expect(mpr).not.toContain('백패널 홈');
    expect(mpr).not.toContain('<105 \\Ktasche\\');
  });

  it('mirrors furniture right-side panel top borings only in MPR coordinates', () => {
    const panel = {
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
      boringPositions: [9.3, 850.8],
      boringDepthGroups: [
        { y: 9.3, depthPositions: [30, 180, 330], boringType: 'fixed-panel' },
        { y: 850.8, depthPositions: [88.5, 209, 329.5], boringType: 'fixed-panel' },
      ],
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);
    const fixedBorings = converted.borings.filter(boring => boring.note === 'fixed-panel-through');

    expect(converted.width).toBe(860);
    expect(converted.height).toBe(380);
    expect(fixedBorings.map(boring => ({ x: boring.x, y: boring.y }))).toEqual([
      { x: 9.3, y: 350 },
      { x: 9.3, y: 200 },
      { x: 9.3, y: 50 },
      { x: 850.8, y: 291.5 },
      { x: 850.8, y: 171 },
      { x: 850.8, y: 50.5 },
    ]);
  });

  it('does not export stale boring data on drawer front panels', () => {
    const panel = {
      id: 'drawer-front-1',
      name: '서랍1 앞판',
      width: 420,
      height: 130,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'VERTICAL',
      boringPositions: [50, 80],
      boringDepthPositions: [50, 210, 370],
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);

    expect(converted.panelType).toBe('drawer-front');
    expect(converted.borings).toEqual([]);
  });
});
