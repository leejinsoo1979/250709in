const fs = require('fs');
const path = require('path');

// DXF Parser
class DXFParser {
  constructor(content) {
    this.lines = content.split('\n').map(l => l.trim());
    this.index = 0;
    this.layers = {};
    this.entities = [];
  }

  parse() {
    while (this.index < this.lines.length) {
      if (this.lines[this.index] === '0' && this.lines[this.index + 1] === 'SECTION') {
        this.index += 2;
        if (this.lines[this.index] === '2') {
          const sectionName = this.lines[this.index + 1];
          this.index += 2;
          if (sectionName === 'ENTITIES') {
            this.parseEntities();
          } else if (sectionName === 'TABLES') {
            this.parseTables();
          }
        }
      } else {
        this.index++;
      }
    }
  }

  parseTables() {
    while (this.index < this.lines.length) {
      if (this.lines[this.index] === '0' && this.lines[this.index + 1] === 'ENDSEC') {
        break;
      }
      if (this.lines[this.index] === '0' && this.lines[this.index + 1] === 'LAYER') {
        const layer = this.parseLayer();
        if (layer) {
          this.layers[layer.name] = layer;
        }
      }
      this.index++;
    }
  }

  parseLayer() {
    const layer = { name: '' };
    while (this.index < this.lines.length) {
      if (this.lines[this.index] === '0') {
        break;
      }
      if (this.lines[this.index] === '2') {
        layer.name = this.lines[this.index + 1];
        this.index++;
      }
      this.index++;
    }
    return layer.name ? layer : null;
  }

  parseEntities() {
    while (this.index < this.lines.length) {
      if (this.lines[this.index] === '0' && this.lines[this.index + 1] === 'ENDSEC') {
        break;
      }
      if (this.lines[this.index] === '0') {
        const entityType = this.lines[this.index + 1];
        if (entityType === 'TEXT' || entityType === 'MTEXT') {
          this.parseTextEntity(entityType);
        } else if (entityType === 'LINE' || entityType === 'LWPOLYLINE') {
          this.parseGeometryEntity(entityType);
        } else if (entityType === 'DIMENSION') {
          this.parseDimensionEntity();
        }
      }
      this.index++;
    }
  }

  parseTextEntity(type) {
    const entity = { type, layer: '0', text: '' };
    this.index++; // Skip entity type
    while (this.index < this.lines.length) {
      if (this.lines[this.index] === '0') {
        break;
      }
      if (this.lines[this.index] === '8') {
        entity.layer = this.lines[this.index + 1];
        this.index++;
      } else if (this.lines[this.index] === '1') {
        entity.text = this.lines[this.index + 1];
        this.index++;
      }
      this.index++;
    }
    this.entities.push(entity);
    this.index--; // Back up one so the main loop can find the next '0'
  }

  parseGeometryEntity(type) {
    const entity = { type, layer: '0' };
    this.index++; // Skip entity type
    while (this.index < this.lines.length) {
      if (this.lines[this.index] === '0') {
        break;
      }
      if (this.lines[this.index] === '8') {
        entity.layer = this.lines[this.index + 1];
        this.index++;
      }
      this.index++;
    }
    this.entities.push(entity);
    this.index--; // Back up one so the main loop can find the next '0'
  }

  parseDimensionEntity() {
    const entity = { type: 'DIMENSION', layer: '0', text: '' };
    this.index++; // Skip entity type
    while (this.index < this.lines.length) {
      if (this.lines[this.index] === '0') {
        break;
      }
      if (this.lines[this.index] === '8') {
        entity.layer = this.lines[this.index + 1];
        this.index++;
      } else if (this.lines[this.index] === '1') {
        entity.text = this.lines[this.index + 1];
        this.index++;
      }
      this.index++;
    }
    this.entities.push(entity);
    this.index--; // Back up one so the main loop can find the next '0'
  }
}

// STEP 1 Verification: W x H x D label
function verifyStep1(parser) {
  const textEntities = parser.entities.filter(e => 
    (e.type === 'TEXT' || e.type === 'MTEXT') && e.text
  );
  
  // Look for dimension pattern (number x number x number)
  const dimensionPattern = /\d+\s*[xX×]\s*\d+\s*[xX×]\s*\d+/;
  const hasWxHxD = textEntities.some(e => dimensionPattern.test(e.text));
  
  return {
    passed: hasWxHxD,
    count: textEntities.filter(e => dimensionPattern.test(e.text)).length,
    reason: hasWxHxD ? 'Found W x H x D label' : 'No W x H x D label found'
  };
}

// STEP 2 Verification: Layer structure
function verifyStep2(parser) {
  const layerCounts = {};
  parser.entities.forEach(e => {
    layerCounts[e.layer] = (layerCounts[e.layer] || 0) + 1;
  });

  const furnitureCount = layerCounts['FURNITURE'] || 0;
  const dimensionsCount = layerCounts['DIMENSIONS'] || 0;
  const layer0Count = layerCounts['0'] || 0;

  const passed = furnitureCount > 0 && dimensionsCount > 0 && layer0Count <= 5;

  return {
    passed,
    furnitureCount,
    dimensionsCount,
    layer0Count,
    reason: passed 
      ? 'Layer structure valid' 
      : `Issues: FURNITURE(${furnitureCount}), DIMENSIONS(${dimensionsCount}), Layer0(${layer0Count})`
  };
}

// Main verification
function verifyDXF(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parser = new DXFParser(content);
    parser.parse();

    const step1 = verifyStep1(parser);
    const step2 = verifyStep2(parser);

    return {
      file: path.basename(filePath),
      step1,
      step2,
      overall: step1.passed && step2.passed
    };
  } catch (err) {
    return {
      file: path.basename(filePath),
      error: err.message
    };
  }
}

// Process all files
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log('Usage: node verify-dxf-step1-2.cjs <dxf-file> ...');
  process.exit(1);
}

console.log('STEP 1-2 Verification Results');
console.log('================================');
console.log('');

const results = files.map(verifyDXF);

// Print results
results.forEach(result => {
  console.log(`File: ${result.file}`);
  console.log('-------------------');
  
  if (result.error) {
    console.log(`  ERROR: ${result.error}`);
  } else {
    console.log(`  STEP 1: ${result.step1.passed ? 'PASS' : 'FAIL'}`);
    console.log(`    - ${result.step1.reason}`);
    console.log(`    - Count: ${result.step1.count || 0} W x H x D labels`);
    
    console.log(`  STEP 2: ${result.step2.passed ? 'PASS' : 'FAIL'}`);
    console.log(`    - ${result.step2.reason}`);
    console.log(`    - FURNITURE entities: ${result.step2.furnitureCount}`);
    console.log(`    - DIMENSIONS entities: ${result.step2.dimensionsCount}`);
    console.log(`    - Layer 0 entities: ${result.step2.layer0Count}`);
    
    console.log(`  OVERALL: ${result.overall ? 'PASS' : 'FAIL'}`);
  }
  
  console.log('');
});

// Summary
const passed = results.filter(r => r.overall).length;
const total = results.length;
console.log('================================');
console.log(`Summary: ${passed}/${total} files passed STEP 1-2 verification`);
process.exit(passed === total ? 0 : 1);