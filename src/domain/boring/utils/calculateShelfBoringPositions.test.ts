import { describe, expect, it } from 'vitest';
import { calculateShelfBoringPositions } from './calculateShelfBoringPositions';
import type { SectionConfig } from '@/data/modules/shelving';

const buildSingleShelfSection = (shelfCenterFromSectionBottomMm: number): SectionConfig[] => [
  {
    type: 'shelf',
    heightType: 'absolute',
    height: 200,
    count: 1,
    shelfPositions: [shelfCenterFromSectionBottomMm]
  }
];

describe('calculateShelfBoringPositions', () => {
  it.each([
    [18.5, 9.25],
    [18, 9],
    [15.5, 7.75],
    [15, 7.5]
  ])('uses movable shelf bottom line as boring center for %smm shelf thickness', (thicknessMm, halfThicknessMm) => {
    const result = calculateShelfBoringPositions({
      sections: buildSingleShelfSection(100),
      totalHeightMm: 200 + thicknessMm,
      basicThicknessMm: thicknessMm
    });

    expect(result.shelves).toEqual([thicknessMm + 100 - halfThicknessMm]);
    expect(result.details).toContainEqual({
      y: thicknessMm + 100 - halfThicknessMm,
      type: 'movable-shelf',
      role: 'movable-shelf',
      roleIndex: 0
    });
  });

  it('keeps fixed top and bottom panels separate from movable shelf boring', () => {
    const result = calculateShelfBoringPositions({
      sections: buildSingleShelfSection(100),
      totalHeightMm: 218,
      basicThicknessMm: 18
    });

    expect(result.details).toEqual([
      { y: 9, type: 'fixed-panel', role: 'bottom-panel' },
      { y: 109, type: 'movable-shelf', role: 'movable-shelf', roleIndex: 0 },
      { y: 209, type: 'fixed-panel', role: 'top-panel' }
    ]);
  });

  it('adds upper and lower dowel borings at 32mm pitch from movable shelves', () => {
    const result = calculateShelfBoringPositions({
      sections: buildSingleShelfSection(100),
      totalHeightMm: 218,
      basicThicknessMm: 18,
      additionalDowelBorings: {
        enabled: true,
        count: 2,
        spacingMm: 32
      }
    });

    expect(result.shelves).toEqual([109]);
    expect(result.details).toEqual([
      { y: 9, type: 'fixed-panel', role: 'bottom-panel' },
      { y: 45, type: 'additional-dowel', role: 'additional-dowel', sourceRoleIndex: 0 },
      { y: 77, type: 'additional-dowel', role: 'additional-dowel', sourceRoleIndex: 0 },
      { y: 109, type: 'movable-shelf', role: 'movable-shelf', roleIndex: 0 },
      { y: 141, type: 'additional-dowel', role: 'additional-dowel', sourceRoleIndex: 0 },
      { y: 173, type: 'additional-dowel', role: 'additional-dowel', sourceRoleIndex: 0 },
      { y: 209, type: 'fixed-panel', role: 'top-panel' }
    ]);
  });

  it('uses even shelf positions when a shelf section only has count', () => {
    const result = calculateShelfBoringPositions({
      sections: [{
        type: 'shelf',
        heightType: 'absolute',
        height: 300,
        count: 2
      }],
      totalHeightMm: 336,
      basicThicknessMm: 18
    });

    expect(result.shelves).toEqual([109, 209]);
    expect(result.details).toEqual([
      { y: 9, type: 'fixed-panel', role: 'bottom-panel' },
      { y: 109, type: 'movable-shelf', role: 'movable-shelf', roleIndex: 0 },
      { y: 209, type: 'movable-shelf', role: 'movable-shelf', roleIndex: 1 },
      { y: 327, type: 'fixed-panel', role: 'top-panel' }
    ]);
  });

  it('does not create a count fallback for zero sentinel shelf positions', () => {
    const result = calculateShelfBoringPositions({
      sections: [{
        type: 'shelf',
        heightType: 'absolute',
        height: 300,
        count: 1,
        shelfPositions: [0]
      }],
      totalHeightMm: 336,
      basicThicknessMm: 18
    });

    expect(result.shelves).toEqual([]);
    expect(result.details).toEqual([
      { y: 9, type: 'fixed-panel', role: 'bottom-panel' },
      { y: 327, type: 'fixed-panel', role: 'top-panel' }
    ]);
  });
});
