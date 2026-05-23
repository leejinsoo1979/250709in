import { describe, expect, it } from 'vitest';
import { calculateShelfPinBorings } from './shelfPinCalculator';

describe('calculateShelfPinBorings', () => {
  it('uses two depth positions at 30mm from shelf front and back for movable shelf custom positions', () => {
    const result = calculateShelfPinBorings({
      panelHeight: 800,
      panelDepth: 560,
      isLeftPanel: true,
      customYPositions: [300]
    });

    expect(result.xPositions).toEqual([30, 530]);
    expect(result.yPositions).toEqual([300]);
    expect(result.holeCount).toBe(2);
  });
});
