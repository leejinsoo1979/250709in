import { describe, it, expect } from 'vitest';
import { SpaceCalculator, ColumnIndexer } from '../indexing';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';

describe('Builtin No-Surround Position Calculation', () => {
  const createBuiltinNoSurroundSpaceInfo = (width: number = 3000): SpaceInfo => ({
    width,
    height: 2400,
    depth: 600,
    installType: 'builtin',
    wallConfig: {
      left: true,
      right: true
    },
    hasFloorFinish: false,
    surroundType: 'no-surround',
    gapConfig: {
      left: 2,
      right: 2
    }
  });

  describe('SpaceCalculator', () => {
    it('should apply gap spacing for builtin+no-surround mode', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
      
      // Builtin + no-surround honours the configured gap on both sides (default 2mm)
      expect(internalWidth).toBe(2996);
    });

    it('should apply gap spacing for builtin+surround mode', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      spaceInfo.surroundType = 'surround';
      spaceInfo.frameSize = { left: 50, right: 50, top: 10 };
      
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
      
      // In surround mode with frames, internal width should be reduced by frame sizes
      expect(internalWidth).toBe(2900); // 3000 - 50 - 50
    });
  });

  describe('ColumnIndexer', () => {
    it('should calculate correct positions for builtin+no-surround mode', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      const indexing = ColumnIndexer.calculateSpaceIndexing(spaceInfo);
      
      // Check that internal width is correct
      expect(indexing.internalWidth).toBe(2996);
      
      // Check that the first slot position is correct (should start from left edge)
      const expectedFirstSlotX = indexing.internalStartX + (indexing.columnWidth / 2);
      expect(indexing.columnPositions[0]).toBeCloseTo(expectedFirstSlotX, 1);
      
      // Check that internal start X is correct (should be at left edge)
      expect(indexing.internalStartX).toBe(-1498);
    });

    it('should handle dual furniture positions correctly in builtin+no-surround', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      spaceInfo.customColumnCount = 5; // Force 5 columns for predictable testing
      
      const indexing = ColumnIndexer.calculateSpaceIndexing(spaceInfo);
      
      // Verify we have 5 columns
      expect(indexing.columnCount).toBe(5);
      
      // Check dual positions are calculated
      expect(indexing.dualColumnPositions.length).toBe(4); // 5 columns = 4 dual positions
      
      // First dual position should be between first and second slot
      const expectedFirstDualX = (indexing.columnPositions[0] + indexing.columnPositions[1]) / 2;
      expect(indexing.dualColumnPositions[0]).toBeCloseTo(expectedFirstDualX, 1);
    });
  });

  describe('geometry.ts calculateInternalSpace', () => {
    it('should apply gap spacing for builtin+no-surround mode', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      const internalSpace = calculateInternalSpace(spaceInfo);
      
      // Internal width and start X reflect the configured 2mm gaps on both sides
      expect(internalSpace.width).toBe(2996);
      
      // Start X should respect the left gap
      expect(internalSpace.startX).toBe(2);
    });

    it('should apply correct spacing for semistanding+no-surround mode', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      spaceInfo.installType = 'semistanding';
      spaceInfo.wallConfig = { left: true, right: false }; // Left wall only
      spaceInfo.gapConfig = { left: 2, right: 20 };
      
      const internalSpace = calculateInternalSpace(spaceInfo);
      
      // Internal width should subtract both the wall clearance and end panel thickness
      expect(internalSpace.width).toBe(2978); // 3000 - 2 - 20
      
      // Start X should follow the wall-side clearance
      expect(internalSpace.startX).toBe(2);
    });

    it('should apply correct spacing for freestanding+no-surround mode', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      spaceInfo.installType = 'freestanding';
      spaceInfo.wallConfig = { left: false, right: false }; // No walls
      spaceInfo.gapConfig = { left: 20, right: 20 };
      
      const internalSpace = calculateInternalSpace(spaceInfo);
      
      // Internal width should be reduced by end panels on both sides
      expect(internalSpace.width).toBe(2960); // 3000 - 20 - 20
      
      // Start X should account for left end panel thickness
      expect(internalSpace.startX).toBe(20);
    });
  });

  describe('Integration: Full position calculation', () => {
    it('should place furniture at correct position in builtin+no-surround', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      spaceInfo.customColumnCount = 5;
      
      const indexing = ColumnIndexer.calculateSpaceIndexing(spaceInfo);
      
      // First slot should start at the left edge
      const firstSlotPosition = indexing.threeUnitPositions[0];
      const expectedFirstSlotX = SpaceCalculator.mmToThreeUnits(indexing.internalStartX + indexing.columnWidth / 2);
      
      expect(firstSlotPosition).toBeCloseTo(expectedFirstSlotX, 3);
      
      // Last slot should end at the right edge
      const lastSlotPosition = indexing.threeUnitPositions[4];
      const expectedLastSlotX = SpaceCalculator.mmToThreeUnits(
        indexing.internalStartX + indexing.internalWidth - indexing.columnWidth / 2,
      );

      expect(lastSlotPosition).toBeCloseTo(expectedLastSlotX, 3);
    });

    it('should maintain consistent positions after updates', () => {
      const spaceInfo = createBuiltinNoSurroundSpaceInfo(3000);
      spaceInfo.customColumnCount = 5;
      
      // Calculate initial positions
      const indexing1 = ColumnIndexer.calculateSpaceIndexing(spaceInfo);
      const firstPosition1 = indexing1.threeUnitPositions[0];
      
      // Simulate an update (e.g., toggling tabs)
      const updatedSpaceInfo = { ...spaceInfo };
      const indexing2 = ColumnIndexer.calculateSpaceIndexing(updatedSpaceInfo);
      const firstPosition2 = indexing2.threeUnitPositions[0];
      
      // Positions should remain the same
      expect(firstPosition2).toBe(firstPosition1);
    });
  });
});
