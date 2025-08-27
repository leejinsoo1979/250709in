const fs = require('fs');

// DXF Builder class
class DXFBuilder {
  constructor() {
    this.content = [];
    this.entities = [];
  }

  addHeader() {
    this.content.push(
      '0',
      'SECTION',
      '2',
      'HEADER',
      '9',
      '$MEASUREMENT',
      '70',
      '1',
      '9',
      '$INSUNITS',
      '70',
      '4',
      '0',
      'ENDSEC'
    );
  }

  addTables() {
    this.content.push(
      '0',
      'SECTION',
      '2',
      'TABLES',
      '0',
      'TABLE',
      '2',
      'LTYPE',
      '0',
      'LTYPE',
      '2',
      'CONTINUOUS',
      '70',
      '0',
      '3',
      'Solid line',
      '72',
      '65',
      '73',
      '0',
      '40',
      '0.0',
      '0',
      'ENDTAB',
      '0',
      'TABLE',
      '2',
      'LAYER',
      '0',
      'LAYER',
      '2',
      '0',
      '70',
      '0',
      '62',
      '7',
      '6',
      'CONTINUOUS',
      '0',
      'LAYER',
      '2',
      'FURNITURE',
      '70',
      '0',
      '62',
      '1',
      '6',
      'CONTINUOUS',
      '0',
      'LAYER',
      '2',
      'DIMENSIONS',
      '70',
      '0',
      '62',
      '3',
      '6',
      'CONTINUOUS',
      '0',
      'LAYER',
      '2',
      'LABELS',
      '70',
      '0',
      '62',
      '5',
      '6',
      'CONTINUOUS',
      '0',
      'ENDTAB',
      '0',
      'ENDSEC'
    );
  }

  addLine(x1, y1, x2, y2, layer = 'FURNITURE') {
    this.entities.push(
      '0',
      'LINE',
      '8',
      layer,
      '10',
      x1.toFixed(2),
      '20',
      y1.toFixed(2),
      '11',
      x2.toFixed(2),
      '21',
      y2.toFixed(2)
    );
  }

  addText(text, x, y, height = 50, layer = 'LABELS') {
    this.entities.push(
      '0',
      'TEXT',
      '8',
      layer,
      '10',
      x.toFixed(2),
      '20',
      y.toFixed(2),
      '40',
      height.toFixed(2),
      '1',
      text
    );
  }

  addDimension(x1, y1, x2, y2, textX, textY, dimValue) {
    this.entities.push(
      '0',
      'DIMENSION',
      '8',
      'DIMENSIONS',
      '10',
      textX.toFixed(2),
      '20',
      textY.toFixed(2),
      '13',
      x1.toFixed(2),
      '23',
      y1.toFixed(2),
      '14',
      x2.toFixed(2),
      '24',
      y2.toFixed(2),
      '1',
      dimValue + ' mm',
      '70',
      '0'
    );
  }

  addRectangle(x, y, width, height, layer = 'FURNITURE') {
    this.addLine(x, y, x + width, y, layer);
    this.addLine(x + width, y, x + width, y + height, layer);
    this.addLine(x + width, y + height, x, y + height, layer);
    this.addLine(x, y + height, x, y, layer);
  }

  build() {
    this.addHeader();
    this.addTables();
    
    this.content.push(
      '0',
      'SECTION',
      '2',
      'ENTITIES'
    );
    
    this.content = this.content.concat(this.entities);
    
    this.content.push(
      '0',
      'ENDSEC',
      '0',
      'EOF'
    );
    
    return this.content.join('\n');
  }
}

// Generate Sample A: single-2drawer-hanging
function generateSampleA() {
  const dxf = new DXFBuilder();
  
  // Space outline
  dxf.addRectangle(0, 0, 3000, 2500, 'FURNITURE');
  
  // Furniture (2drawer-hanging at position 1000, 1000)
  const furnitureX = 1000;
  const furnitureY = 1000;
  const furnitureWidth = 400;
  const furnitureHeight = 500;
  
  dxf.addRectangle(furnitureX, furnitureY, furnitureWidth, furnitureHeight, 'FURNITURE');
  
  // Add drawers
  dxf.addLine(furnitureX, furnitureY + 250, furnitureX + furnitureWidth, furnitureY + 250, 'FURNITURE');
  
  // Add dimensions
  dxf.addDimension(furnitureX, furnitureY, furnitureX + furnitureWidth, furnitureY, 
                   furnitureX + furnitureWidth/2, furnitureY - 100, '400');
  dxf.addDimension(furnitureX, furnitureY, furnitureX, furnitureY + furnitureHeight, 
                   furnitureX - 100, furnitureY + furnitureHeight/2, '500');
  
  // Add label with "W x H x D" format
  dxf.addText('2drawer-hanging', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 50, 40, 'LABELS');
  dxf.addText('400 x 500 x 300 mm', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 100, 30, 'LABELS');
  
  // Add units label
  dxf.addText('Units: mm', 100, 2400, 50, 'LABELS');
  
  return dxf.build();
}

// Generate Sample B: dual-2hanging
function generateSampleB() {
  const dxf = new DXFBuilder();
  
  // Space outline
  dxf.addRectangle(0, 0, 3000, 2500, 'FURNITURE');
  
  // First hanging unit
  const furniture1X = 500;
  const furniture1Y = 1000;
  const furnitureWidth = 400;
  const furnitureHeight = 700;
  
  dxf.addRectangle(furniture1X, furniture1Y, furnitureWidth, furnitureHeight, 'FURNITURE');
  
  // Second hanging unit
  const furniture2X = 1000;
  const furniture2Y = 1000;
  
  dxf.addRectangle(furniture2X, furniture2Y, furnitureWidth, furnitureHeight, 'FURNITURE');
  
  // Add dimensions for both
  dxf.addDimension(furniture1X, furniture1Y, furniture1X + furnitureWidth, furniture1Y, 
                   furniture1X + furnitureWidth/2, furniture1Y - 100, '400');
  dxf.addDimension(furniture2X, furniture2Y, furniture2X + furnitureWidth, furniture2Y, 
                   furniture2X + furnitureWidth/2, furniture2Y - 100, '400');
  
  // Add labels
  dxf.addText('Hanging Unit 1', furniture1X + furnitureWidth/2, furniture1Y + furnitureHeight + 50, 40, 'LABELS');
  dxf.addText('400 x 700 x 300 mm', furniture1X + furnitureWidth/2, furniture1Y + furnitureHeight + 100, 30, 'LABELS');
  
  dxf.addText('Hanging Unit 2', furniture2X + furnitureWidth/2, furniture2Y + furnitureHeight + 50, 40, 'LABELS');
  dxf.addText('400 x 700 x 300 mm', furniture2X + furnitureWidth/2, furniture2Y + furnitureHeight + 100, 30, 'LABELS');
  
  // Add units label
  dxf.addText('Units: mm', 100, 2400, 50, 'LABELS');
  
  return dxf.build();
}

// Generate Sample C: upper-cabinet-shelf with baseFrameHeight=100mm
function generateSampleC() {
  const dxf = new DXFBuilder();
  
  // Space outline
  dxf.addRectangle(0, 0, 3000, 2500, 'FURNITURE');
  
  // Cabinet with base frame
  const furnitureX = 1200;
  const furnitureY = 500;  // Elevated by baseFrameHeight
  const furnitureWidth = 600;
  const furnitureHeight = 800;
  const baseFrameHeight = 100;
  
  // Base frame
  dxf.addRectangle(furnitureX, furnitureY - baseFrameHeight, furnitureWidth, baseFrameHeight, 'FURNITURE');
  
  // Cabinet body (elevated)
  dxf.addRectangle(furnitureX, furnitureY, furnitureWidth, furnitureHeight, 'FURNITURE');
  
  // Add shelf lines
  dxf.addLine(furnitureX, furnitureY + 200, furnitureX + furnitureWidth, furnitureY + 200, 'FURNITURE');
  dxf.addLine(furnitureX, furnitureY + 400, furnitureX + furnitureWidth, furnitureY + 400, 'FURNITURE');
  dxf.addLine(furnitureX, furnitureY + 600, furnitureX + furnitureWidth, furnitureY + 600, 'FURNITURE');
  
  // Add dimensions
  dxf.addDimension(furnitureX, furnitureY, furnitureX + furnitureWidth, furnitureY, 
                   furnitureX + furnitureWidth/2, furnitureY - 150, '600');
  dxf.addDimension(furnitureX, furnitureY, furnitureX, furnitureY + furnitureHeight, 
                   furnitureX - 100, furnitureY + furnitureHeight/2, '800');
  
  // Base frame dimension
  dxf.addDimension(furnitureX, furnitureY - baseFrameHeight, furnitureX, furnitureY, 
                   furnitureX - 200, furnitureY - baseFrameHeight/2, '100');
  
  // Add labels
  dxf.addText('Upper Cabinet with Base', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 50, 40, 'LABELS');
  dxf.addText('600 x 800 x 400 mm', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 100, 30, 'LABELS');
  dxf.addText('Base Frame: 100 mm', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 150, 30, 'LABELS');
  
  // Add units label
  dxf.addText('Units: mm', 100, 2400, 50, 'LABELS');
  
  return dxf.build();
}

// Generate all samples
fs.writeFileSync('exports/step3-A.dxf', generateSampleA());
console.log('Sample A generated: exports/step3-A.dxf');

fs.writeFileSync('exports/step3-B.dxf', generateSampleB());
console.log('Sample B generated: exports/step3-B.dxf');

fs.writeFileSync('exports/step3-C.dxf', generateSampleC());
console.log('Sample C generated: exports/step3-C.dxf');