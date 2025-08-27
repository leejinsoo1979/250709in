const fs = require('fs');

// DXF Parser (same as in verify scripts)
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
    this.index--;
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
    this.index--;
  }
}

// Debug sample file
const content = fs.readFileSync('test-dxf-samples/sample_A_single.dxf', 'utf-8');
const parser = new DXFParser(content);
parser.parse();

console.log('TEXT Entities found:');
parser.entities
  .filter(e => e.type === 'TEXT' || e.type === 'MTEXT')
  .forEach(e => {
    console.log(`  Layer: ${e.layer}, Text: "${e.text}"`);
  });

console.log('\nDIMENSION Entities found:');
parser.entities
  .filter(e => e.type === 'DIMENSION')
  .forEach(e => {
    console.log(`  Layer: ${e.layer}, Text: "${e.text}"`);
  });

console.log('\nTesting regex on texts:');
const dimensionPattern = /\d+\s*[xX×]\s*\d+\s*[xX×]\s*\d+/;
parser.entities
  .filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && e.text)
  .forEach(e => {
    const matches = dimensionPattern.test(e.text);
    console.log(`  "${e.text}" - Matches: ${matches}`);
  });