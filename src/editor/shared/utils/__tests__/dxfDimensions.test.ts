import { describe, it, expect } from 'vitest';
import { generateDXF } from '../dxfGenerator';
import { SpaceInfo } from '@/store/core/spaceConfigStore';

describe('[VALIDATOR] DXF Dimensions Format Test - WxHxD Pattern Verification', () => {
  // Test space configuration
  const testSpaceInfo: SpaceInfo = {
    width: 4000,
    height: 2400,
    depth: 600,
    baseConfig: {
      type: 'base_frame',
      height: 100,
    },
    backConfig: {
      type: 'back_panel',
      thickness: 18,
    },
    topConfig: {
      type: 'none',
    }
  };

  describe('Dimension Pattern Validation', () => {
    it('✅ SINGLE furniture: Should generate DXF with correct WxHxD pattern', () => {
      // Single furniture sample (오픈박스)
      const singleModule = {
        id: 'single-1',
        moduleId: 'open-box',
        position: { x: 0, y: 0, z: 0 },
        moduleData: {
          name: 'Open Box',
          dimensions: {
            width: 800,
            height: 400,
            depth: 580
          }
        }
      };

      const dxfString = generateDXF({
        spaceInfo: testSpaceInfo,
        placedModules: [singleModule],
        drawingType: 'front'
      });

      // Verify WxHxD pattern (800W x 400H x 580D)
      const expectedPattern = '800W x 400H x 580D';
      const containsCorrectPattern = dxfString.includes(expectedPattern);
      
      // Check for incorrect HxD swap patterns
      const incorrectPattern1 = '800W x 580H x 400D'; // H and D swapped
      const incorrectPattern2 = '800 x 400 x 580'; // Missing W, H, D labels
      const hasIncorrectPattern = dxfString.includes(incorrectPattern1) || dxfString.includes(incorrectPattern2);

      expect(containsCorrectPattern).toBe(true);
      expect(hasIncorrectPattern).toBe(false);

      // Snapshot test for regression
      expect(dxfString).toMatchSnapshot('single-furniture-dxf');
      
      console.log('[VALIDATOR] ✅ SINGLE furniture test passed - WxHxD pattern correct');
    });

    it('✅ DUAL furniture: Should generate DXF with correct WxHxD pattern', () => {
      // Dual furniture sample (듀얼 2단)
      const dualModule = {
        id: 'dual-1',
        moduleId: 'dual-2-shelf',
        position: { x: 0, y: 0, z: 0 },
        moduleData: {
          name: 'Dual 2-Shelf',
          dimensions: {
            width: 1600,
            height: 800,
            depth: 580
          }
        },
        isDualSlot: true
      };

      const dxfString = generateDXF({
        spaceInfo: testSpaceInfo,
        placedModules: [dualModule],
        drawingType: 'front'
      });

      // Verify WxHxD pattern (1600W x 800H x 580D)
      const expectedPattern = '1600W x 800H x 580D';
      const containsCorrectPattern = dxfString.includes(expectedPattern);
      
      // Check for incorrect HxD swap patterns
      const incorrectPattern1 = '1600W x 580H x 800D'; // H and D swapped
      const incorrectPattern2 = '1600 x 800 x 580'; // Missing W, H, D labels
      const hasIncorrectPattern = dxfString.includes(incorrectPattern1) || dxfString.includes(incorrectPattern2);

      expect(containsCorrectPattern).toBe(true);
      expect(hasIncorrectPattern).toBe(false);

      // Snapshot test for regression
      expect(dxfString).toMatchSnapshot('dual-furniture-dxf');
      
      console.log('[VALIDATOR] ✅ DUAL furniture test passed - WxHxD pattern correct');
    });

    it('✅ ASYMMETRIC furniture: Should generate DXF with correct WxHxD pattern', () => {
      // Asymmetric furniture sample (7단 - tall and narrow)
      const asymmetricModule = {
        id: 'asymmetric-1',
        moduleId: '7-shelf',
        position: { x: 0, y: 0, z: 0 },
        moduleData: {
          name: '7-Shelf',
          dimensions: {
            width: 800,
            height: 2100,  // Much taller than it is deep
            depth: 580
          }
        }
      };

      const dxfString = generateDXF({
        spaceInfo: testSpaceInfo,
        placedModules: [asymmetricModule],
        drawingType: 'front'
      });

      // Verify WxHxD pattern (800W x 2100H x 580D)
      const expectedPattern = '800W x 2100H x 580D';
      const containsCorrectPattern = dxfString.includes(expectedPattern);
      
      // Check for incorrect HxD swap patterns
      const incorrectPattern1 = '800W x 580H x 2100D'; // H and D swapped - CRITICAL ERROR
      const incorrectPattern2 = '800W x 2100D x 580H'; // D and H positions swapped
      const incorrectPattern3 = '800 x 2100 x 580'; // Missing W, H, D labels
      const hasIncorrectPattern = 
        dxfString.includes(incorrectPattern1) || 
        dxfString.includes(incorrectPattern2) || 
        dxfString.includes(incorrectPattern3);

      expect(containsCorrectPattern).toBe(true);
      expect(hasIncorrectPattern).toBe(false);

      // Additional validation: Height should be much larger than Depth
      const heightMatch = dxfString.match(/(\d+)H/);
      const depthMatch = dxfString.match(/(\d+)D/);
      
      if (heightMatch && depthMatch) {
        const height = parseInt(heightMatch[1]);
        const depth = parseInt(depthMatch[1]);
        expect(height).toBeGreaterThan(depth); // Height (2100) should be > Depth (580)
      }

      // Snapshot test for regression
      expect(dxfString).toMatchSnapshot('asymmetric-furniture-dxf');
      
      console.log('[VALIDATOR] ✅ ASYMMETRIC furniture test passed - WxHxD pattern correct');
    });

    it('🔍 VALIDATION SUMMARY: All dimension patterns should follow WxHxD format', () => {
      const modules = [
        {
          id: 'test-1',
          moduleId: 'test-module',
          position: { x: -800, y: 0, z: 0 },
          moduleData: {
            name: 'Test Module 1',
            dimensions: { width: 800, height: 1200, depth: 400 }
          }
        },
        {
          id: 'test-2',
          moduleId: 'test-module-2',
          position: { x: 800, y: 0, z: 0 },
          moduleData: {
            name: 'Test Module 2',
            dimensions: { width: 1600, height: 600, depth: 500 }
          }
        }
      ];

      const dxfString = generateDXF({
        spaceInfo: testSpaceInfo,
        placedModules: modules,
        drawingType: 'front'
      });

      // Extract all dimension patterns
      const dimensionPattern = /(\d+)W x (\d+)H x (\d+)D/g;
      const matches = [...dxfString.matchAll(dimensionPattern)];

      // Validate each match
      expect(matches.length).toBeGreaterThan(0);
      
      matches.forEach((match, index) => {
        const [full, width, height, depth] = match;
        const module = modules[index];
        
        if (module) {
          expect(parseInt(width)).toBe(module.moduleData.dimensions.width);
          expect(parseInt(height)).toBe(module.moduleData.dimensions.height);
          expect(parseInt(depth)).toBe(module.moduleData.dimensions.depth);
          
          console.log(`[VALIDATOR] ✅ Module ${index + 1}: ${full} - Pattern verified`);
        }
      });

      // Check for any incorrect patterns
      const incorrectPatterns = [
        /(\d+)W x (\d+)D x (\d+)H/g,  // D and H swapped
        /(\d+) x (\d+) x (\d+)/g,      // Missing labels
        /(\d+)H x (\d+)W x (\d+)D/g,  // Wrong order
      ];

      incorrectPatterns.forEach((pattern, index) => {
        const incorrectMatches = [...dxfString.matchAll(pattern)];
        // Allow matches only if they're part of the correct pattern
        incorrectMatches.forEach(match => {
          const matchStr = match[0];
          // Check if this is actually part of a correct WxHxD pattern
          if (!matchStr.includes('W x') || !matchStr.includes('H x') || !matchStr.includes('D')) {
            expect(incorrectMatches.length).toBe(0);
          }
        });
      });

      console.log('[VALIDATOR] ✅ All dimension patterns validated successfully');
    });
  });

  describe('Pattern Failure Detection', () => {
    it('❌ Should FAIL if HxD values are swapped', () => {
      // This test validates that we can detect when H and D are incorrectly swapped
      const testModule = {
        id: 'fail-test',
        moduleId: 'test-module',
        position: { x: 0, y: 0, z: 0 },
        moduleData: {
          name: 'Test Module',
          dimensions: {
            width: 1000,
            height: 1500, // Height is 1500
            depth: 400    // Depth is 400
          }
        }
      };

      const dxfString = generateDXF({
        spaceInfo: testSpaceInfo,
        placedModules: [testModule],
        drawingType: 'front'
      });

      // The correct pattern should be 1000W x 1500H x 400D
      const correctPattern = '1000W x 1500H x 400D';
      const swappedPattern = '1000W x 400H x 1500D'; // WRONG - H and D values swapped

      // Verify correct pattern exists
      expect(dxfString.includes(correctPattern)).toBe(true);
      // Verify swapped pattern does NOT exist
      expect(dxfString.includes(swappedPattern)).toBe(false);

      if (dxfString.includes(swappedPattern)) {
        console.error('[VALIDATOR] ❌ CRITICAL ERROR: H and D values are swapped!');
        throw new Error('Dimension format validation failed: H and D values are swapped');
      } else {
        console.log('[VALIDATOR] ✅ H and D swap detection test passed');
      }
    });
  });
});