// Test script to verify DXF dimension labeling
import { generateDXF } from './src/editor/shared/utils/dxfGenerator.js';

// Sample test data
const testData = {
  spaceInfo: {
    width: 3000,
    height: 2400, 
    depth: 600,
    baseConfig: { type: 'base_frame', height: 100 }
  },
  placedModules: [
    {
      id: '1',
      moduleId: 'test-module-1',
      position: { x: 0, y: 0, z: 0 },
      moduleData: {
        name: 'Test Cabinet 1',
        dimensions: {
          width: 450,
          height: 1800,
          depth: 500
        }
      }
    },
    {
      id: '2',
      moduleId: 'test-module-2',
      position: { x: 5, y: 0, z: 0 },
      moduleData: {
        name: 'Test Shelf 2',
        dimensions: {
          width: 900,
          height: 2000,
          depth: 400
        }
      }
    },
    {
      id: '3',
      moduleId: 'test-module-3',
      position: { x: -5, y: 0, z: 0 },
      moduleData: {
        name: 'Test Box 3',
        dimensions: {
          width: 450,
          height: 600,
          depth: 350
        }
      }
    }
  ]
};

// Generate DXF for each view type
const views = ['front', 'plan', 'side'];

console.log('Testing DXF dimension labels in W×H×D format:\n');

views.forEach(view => {
  console.log(`\n=== ${view.toUpperCase()} VIEW ===`);
  
  try {
    const dxfContent = generateDXF({
      ...testData,
      drawingType: view
    });
    
    // Search for dimension text patterns in the DXF content
    const dimensionPattern = /(\d+)W x (\d+)H x (\d+)D/g;
    let match;
    let foundDimensions = [];
    
    while ((match = dimensionPattern.exec(dxfContent)) !== null) {
      foundDimensions.push(`${match[1]}W × ${match[2]}H × ${match[3]}D`);
    }
    
    if (foundDimensions.length > 0) {
      console.log('✅ Found dimension labels in correct W×H×D format:');
      foundDimensions.forEach((dim, i) => {
        console.log(`   Module ${i + 1}: ${dim}`);
      });
    } else {
      console.log('⚠️  No dimension labels found in DXF content');
    }
    
    // Verify expected dimensions match
    testData.placedModules.forEach((module, i) => {
      const expected = `${module.moduleData.dimensions.width}W × ${module.moduleData.dimensions.height}H × ${module.moduleData.dimensions.depth}D`;
      const found = foundDimensions[i];
      
      if (found === expected) {
        console.log(`   ✅ Module ${i + 1} dimensions match: ${expected}`);
      } else {
        console.log(`   ❌ Module ${i + 1} mismatch - Expected: ${expected}, Found: ${found || 'none'}`);
      }
    });
    
  } catch (error) {
    console.error(`❌ Error generating ${view} view:`, error.message);
  }
});

console.log('\n✅ DXF dimension label test complete');