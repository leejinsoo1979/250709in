import { describe, expect, it } from 'vitest';
import {
  avoidHingePositionsForShelves,
  calculateHingeCount,
  calculateHingePositions,
} from './hingeCalculator';

describe('hingeCalculator', () => {
  it.each([
    [899, 2],
    [900, 3],
    [1599, 3],
    [1600, 4],
    [2399, 4],
    [2400, 5],
    [2699, 5],
    [2700, 5],
  ])('uses door height %smm to resolve %s hinge positions', (doorHeight, expectedCount) => {
    expect(calculateHingeCount(doorHeight)).toBe(expectedCount);
    expect(calculateHingePositions(doorHeight)).toHaveLength(expectedCount);
  });

  it('uses 120mm top and bottom margins and evenly divides middle hinges', () => {
    expect(calculateHingePositions(1500)).toEqual([120, 750, 1380]);
    expect(calculateHingePositions(2100)).toEqual([120, 740, 1360, 1980]);
  });

  it('moves hinge positions 50mm away from shelf positions when they collide', () => {
    expect(avoidHingePositionsForShelves(
      [120, 750, 1380],
      [750],
      1500
    )).toEqual([120, 700, 1380]);

    expect(avoidHingePositionsForShelves(
      [120, 740, 1360, 1980],
      [1360],
      2100
    )).toEqual([120, 740, 1410, 1980]);
  });

  it('uses shelf top and bottom faces when avoiding shelf collisions', () => {
    expect(avoidHingePositionsForShelves(
      [120, 750, 1380],
      [{ bottomMm: 741, topMm: 759 }],
      1500
    )).toEqual([120, 691, 1380]);

    expect(avoidHingePositionsForShelves(
      [120, 740, 1360, 1980],
      [{ bottomMm: 1351, topMm: 1369 }],
      2100
    )).toEqual([120, 740, 1419, 1980]);
  });
});
