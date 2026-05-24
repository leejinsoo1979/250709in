import { describe, expect, it } from 'vitest';
import { generateSinglePanelMPR } from '@/domain/boring/exporters/mprExporter';
import type { PlacedPanel } from '../types';
import { convertPlacedPanelToMprBoringData } from './mprPanelConversion';

describe('convertPlacedPanelToMprBoringData', () => {
  it('restores horizontal panel coordinates so side bores are on left/right edges', () => {
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
    expect(mpr).toContain('_BSX=764.0000');
    expect(mpr).toContain('_BSY=580.0000');
    expect(mpr).toContain('XA="764.0000"');
    expect(mpr).not.toContain('XA="580.0000"');
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
    expect(mpr).toContain('XA="250.0"');
    expect(mpr).toContain('YA="17.0"');
    expect(mpr).toContain('LA="500"');
    expect(mpr).toContain('BR="10"');
    expect(mpr).toContain('TI="7.5"');
  });
});
