import { describe, expect, it } from 'vitest';
import { generateSinglePanelMPR } from '@/domain/boring/exporters/mprExporter';
import type { Panel, PlacedPanel } from '../types';
import { convertPlacedPanelToMprBoringData } from './mprPanelConversion';
import { optimizePanelsMultiple } from './optimizer';

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

  it('exports the same side-bore format for single and dual horizontal panels', () => {
    const createPanel = (id: string, width: number) => ({
      id,
      name: '(상)상판',
      width,
      height: 574,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'HORIZONTAL',
      sideBoringPositions: [30, 287, 544],
      sideBoringDiameter: 5,
      sideBoringDepth: 30,
    } as PlacedPanel);

    const single = convertPlacedPanelToMprBoringData(createPanel('single-top', 543));
    const dual = convertPlacedPanelToMprBoringData(createPanel('dual-top', 1123));
    const singleSideBorings = single.borings.filter(boring => boring.note === 'fixed-panel-side-bore');
    const dualSideBorings = dual.borings.filter(boring => boring.note === 'fixed-panel-side-bore');

    expect(singleSideBorings).toHaveLength(6);
    expect(dualSideBorings).toHaveLength(6);
    expect(singleSideBorings.map(boring => ({ face: boring.face, y: boring.y, diameter: boring.diameter, depth: boring.depth }))).toEqual(
      dualSideBorings.map(boring => ({ face: boring.face, y: boring.y, diameter: boring.diameter, depth: boring.depth }))
    );
    expect(singleSideBorings.map(boring => boring.y)).toEqual([30, 30, 287, 287, 544, 544]);
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

  it('exports side notch using optimizer preview coordinates', () => {
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
    expect(mpr).toContain('Y=340.0000');
    expect(mpr).toContain('X=80.0000');
    expect(mpr).toContain('Y=0.0000');
    expect(mpr).toContain('Y=380.0000');
    expect(mpr).toContain('<105 \\Konturfraesen\\');
    expect(mpr).toContain('EA="3:0"');
    expect(mpr).toContain('EE="3:2"');
    expect(mpr).toContain('ZA="-2.0000"');
    expect(mpr).not.toContain('측판 따내기');
  });

  it('exports furniture side back-panel groove using optimizer preview coordinates', () => {
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
    expect(mpr).toContain('X=860.0000');
    expect(mpr).toContain('Y=0.0000');
    expect(mpr).toContain('Y=359.0000');
    expect(mpr).toContain('<109 \\Nuten\\');
    expect(mpr).toContain('XA="-1.0000"');
    expect(mpr).toContain('YA="359.0000"');
    expect(mpr).toContain('XE="861.0000"');
    expect(mpr).toContain('YE="359.0000"');
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

  it('exports furniture right-side panel borings using optimizer preview coordinates', () => {
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
      { x: 850.7, y: 350 },
      { x: 850.7, y: 200 },
      { x: 850.7, y: 50 },
      { x: 9.2, y: 291.5 },
      { x: 9.2, y: 171 },
      { x: 9.2, y: 50.5 },
    ]);
  });

  it('exports split entryway side bracket borings using optimizer preview coordinates', () => {
    const panel = {
      id: 'upper-left-split-side-1',
      name: '(상)좌측',
      width: 380,
      height: 1540,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'VERTICAL',
      bracketBoringPositions: [120, 770, 1420],
      bracketBoringDepthPositions: [20, 52],
      isBracketSide: true,
    } as PlacedPanel;

    const converted = convertPlacedPanelToMprBoringData(panel);
    const bracketBorings = converted.borings.filter(boring => boring.note === 'door-fixing-screw');

    expect(bracketBorings.map(boring => ({ x: boring.x, y: boring.y }))).toEqual([
      { x: 1420, y: 20 },
      { x: 1420, y: 52 },
      { x: 770, y: 20 },
      { x: 770, y: 52 },
      { x: 120, y: 20 },
      { x: 120, y: 52 },
    ]);
  });

  it('exports split side panel grooves/notches with the same left-right rule as optimizer preview', () => {
    const upperLeft = convertPlacedPanelToMprBoringData({
      id: 'upper-left-side',
      name: '(상)좌측',
      width: 380,
      height: 1445,
      x: 0,
      y: 0,
      rotated: false,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'VERTICAL',
    } as PlacedPanel);
    const upperLeftMpr = generateSinglePanelMPR(upperLeft);

    expect(upperLeftMpr).toContain('Y=359.0000');
    expect(upperLeftMpr).toContain('YA="359.0000"');

    const lowerRight = convertPlacedPanelToMprBoringData({
      id: 'lower-right-side',
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
    } as PlacedPanel);
    const lowerRightMpr = generateSinglePanelMPR(lowerRight);

    expect(lowerRightMpr).toContain('Y=21.0000');
    expect(lowerRightMpr).toContain('YA="21.0000"');
    expect(lowerRightMpr).toContain('Y=340.0000');
    expect(lowerRightMpr).toContain('Y=0.0000');
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

  it('preserves side notches through optimizer placement before MPR export', async () => {
    const panels: Panel[] = [{
      id: 'lower-right-side',
      name: '(하)우측',
      width: 380,
      height: 860,
      thickness: 18,
      quantity: 1,
      material: 'PB',
      color: 'MW',
      grain: 'VERTICAL',
      sideNotches: [{ y: 80, z: 40, fromBottom: 780 }],
    }];

    const [result] = await optimizePanelsMultiple(
      panels,
      {
        id: 'PB',
        width: 1220,
        height: 2440,
        material: 'PB',
        color: 'MW',
        price: 0,
        stock: 1,
        thickness: 18,
      },
      1,
      true,
      5,
      'BY_LENGTH'
    );

    expect(result.panels[0].sideNotches).toEqual([{ y: 80, z: 40, fromBottom: 780 }]);

    const mpr = generateSinglePanelMPR(convertPlacedPanelToMprBoringData(result.panels[0]));
    expect(mpr).toContain('EA="3:0"');
    expect(mpr).toContain('EE="3:2"');
  });
});
