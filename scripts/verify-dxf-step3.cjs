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
      const code = this.lines[this.index];
      if (code === '2' && this.lines[this.index - 1] === '0') {
        const sectionName = this.lines[this.index + 1];
        if (sectionName === 'ENTITIES') {
          this.parseEntities();
        } else if (sectionName === 'TABLES') {
          this.parseTables();
        }
      }
      this.index++;
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
        } else if (entityType === 'LINE') {
          this.parseLineEntity();
        }
      }
      this.index++;
    }
  }

  parseTextEntity(type) {
    const entity = { type, layer: '0', text: '', x: 0, y: 0 };
    const startIndex = this.index;
    while (this.index < this.lines.length && this.index - startIndex < 50) {
      if (this.lines[this.index] === '0') {
        break;
      }
      if (this.lines[this.index] === '8') {
        entity.layer = this.lines[this.index + 1];
      } else if (this.lines[this.index] === '1') {
        entity.text = this.lines[this.index + 1];
      } else if (this.lines[this.index] === '10') {
        entity.x = parseFloat(this.lines[this.index + 1]);
      } else if (this.lines[this.index] === '20') {
        entity.y = parseFloat(this.lines[this.index + 1]);
      }
      this.index++;
    }
    this.entities.push(entity);
  }

  parseLineEntity() {
    const entity = { 
      type: 'LINE', 
      layer: '0', 
      x1: 0, y1: 0, 
      x2: 0, y2: 0 
    };
    const startIndex = this.index;
    while (this.index < this.lines.length && this.index - startIndex < 50) {
      if (this.lines[this.index] === '0') {
        break;
      }
      if (this.lines[this.index] === '8') {
        entity.layer = this.lines[this.index + 1];
      } else if (this.lines[this.index] === '10') {
        entity.x1 = parseFloat(this.lines[this.index + 1]);
      } else if (this.lines[this.index] === '20') {
        entity.y1 = parseFloat(this.lines[this.index + 1]);
      } else if (this.lines[this.index] === '11') {
        entity.x2 = parseFloat(this.lines[this.index + 1]);
      } else if (this.lines[this.index] === '21') {
        entity.y2 = parseFloat(this.lines[this.index + 1]);
      }
      this.index++;
    }
    this.entities.push(entity);
  }
}

// STEP 3 Verification
function verifyStep3(parser, fileName) {
  const results = {
    hasUnits: false,
    hasFurnitureLayer: false,
    baseFrameCheck: false,
    details: {}
  };

  // 1. Check for unit notation (mm)
  const textEntities = parser.entities.filter(e => 
    (e.type === 'TEXT' || e.type === 'MTEXT') && e.text
  );
  
  results.hasUnits = textEntities.some(e => 
    e.text.toLowerCase().includes('mm') || 
    e.text.toLowerCase().includes('units')
  );
  results.details.unitTexts = textEntities
    .filter(e => e.text.toLowerCase().includes('mm'))
    .map(e => e.text);

  // 2. Check for FURNITURE layer
  const furnitureEntities = parser.entities.filter(e => e.layer === 'FURNITURE');
  results.hasFurnitureLayer = furnitureEntities.length > 0;
  results.details.furnitureCount = furnitureEntities.length;

  // 3. Check for base frame (heuristic: look for base frame text or elevated furniture)
  const isBaseFrameFile = fileName.toLowerCase().includes('c') || 
                          fileName.toLowerCase().includes('base') ||
                          fileName.toLowerCase().includes('cabinet');
  
  if (isBaseFrameFile) {
    // Look for base frame indication
    const hasBaseFrameText = textEntities.some(e => 
      e.text.toLowerCase().includes('base') || 
      e.text.toLowerCase().includes('100')  // Looking for 100mm base height
    );
    
    // Check if furniture lines are elevated (y > 400 indicates elevation)
    const lineEntities = parser.entities.filter(e => e.type === 'LINE' && e.layer === 'FURNITURE');
    const hasElevatedFurniture = lineEntities.some(e => e.y1 >= 400 || e.y2 >= 400);
    
    results.baseFrameCheck = hasBaseFrameText || hasElevatedFurniture;
    results.details.baseFrameIndication = hasBaseFrameText ? 'Text found' : 
                                         hasElevatedFurniture ? 'Elevated geometry' : 'Not detected';
  } else {
    results.baseFrameCheck = true; // Not applicable for non-base frame samples
    results.details.baseFrameIndication = 'N/A';
  }

  return results;
}

// Main verification
function verifyDXF(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parser = new DXFParser(content);
    parser.parse();

    const step3 = verifyStep3(parser, path.basename(filePath));
    
    return {
      file: path.basename(filePath),
      step3,
      overall: step3.hasUnits && step3.hasFurnitureLayer && step3.baseFrameCheck
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
  console.log('Usage: node verify-dxf-step3.cjs <dxf-file> ...');
  process.exit(1);
}

console.log('STEP 3 Verification Results');
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
    const s3 = result.step3;
    console.log(`  Unit Notation (mm): ${s3.hasUnits ? 'PASS' : 'FAIL'}`);
    if (s3.details.unitTexts && s3.details.unitTexts.length > 0) {
      console.log(`    - Found: ${s3.details.unitTexts.join(', ')}`);
    }
    
    console.log(`  FURNITURE Layer: ${s3.hasFurnitureLayer ? 'PASS' : 'FAIL'}`);
    console.log(`    - Entities: ${s3.details.furnitureCount}`);
    
    console.log(`  Base Frame Check: ${s3.baseFrameCheck ? 'PASS' : 'FAIL'}`);
    console.log(`    - ${s3.details.baseFrameIndication}`);
    
    console.log(`  OVERALL: ${result.overall ? 'PASS' : 'FAIL'}`);
  }
  
  console.log('');
});

// Summary
const passed = results.filter(r => r.overall).length;
const total = results.length;
console.log('================================');
console.log(`Summary: ${passed}/${total} files passed STEP 3 verification`);
process.exit(passed === total ? 0 : 1);