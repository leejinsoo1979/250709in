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
});
