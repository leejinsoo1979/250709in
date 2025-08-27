const fs = require('fs');
const path = require('path');

// Helper to create DXF header
function createDXFHeader() {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1024
9
$MEASUREMENT
70
1
9
$INSUNITS
70
4
0
ENDSEC`;
}

// Helper to create layer table
function createLayerTable() {
  return `0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
5
10
2
0
70
0
62
7
6
CONTINUOUS
0
LAYER
5
20
2
FURNITURE
70
0
62
5
6
CONTINUOUS
0
LAYER
5
21
2
DIMENSIONS
70
0
62
1
6
CONTINUOUS
0
ENDTAB
0
ENDSEC`;
}

// Helper to create entities section start
function startEntities() {
  return `0
SECTION
2
ENTITIES`;
}

// Helper to create entities section end
function endEntities() {
  return `0
ENDSEC
0
EOF`;
}

// Helper to create line entity
function createLine(x1, y1, x2, y2, layer = 'FURNITURE') {
  return `0
LINE
8
${layer}
10
${x1}
20
${y1}
30
0
11
${x2}
21
${y2}
31
0`;
}

// Helper to create text entity
function createText(x, y, text, layer = 'DIMENSIONS', height = 20) {
  return `0
TEXT
8
${layer}
10
${x}
20
${y}
30
0
40
${height}
1
${text}
50
0`;
}

// Helper to create dimension entity
function createDimension(x1, y1, x2, y2, text, layer = 'DIMENSIONS') {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - 50;
  
  return `0
DIMENSION
8
${layer}
2
ISO-25
10
${midX}
20
${midY}
30
0
11
${midX}
21
${midY + 30}
31
0
70
1
1
${text}
13
${x1}
23
${y1}
33
0
14
${x2}
24
${y2}
34
0`;
}

// Generate Single Module DXF (800x400x600)
function generateSingleModule() {
  let dxf = '';
  
  dxf += createDXFHeader() + '\n';
  dxf += createLayerTable() + '\n';
  dxf += startEntities() + '\n';
  
  // Add dimension label (W x H x D)
  dxf += createText(400, 1050, '800 x 400 x 600', 'DIMENSIONS', 30) + '\n';
  
  // Add unit notation
  dxf += createText(50, 50, 'All dimensions in mm', 'DIMENSIONS', 15) + '\n';
  
  // Draw furniture rectangle (single module)
  dxf += createLine(100, 200, 900, 200, 'FURNITURE') + '\n'; // bottom
  dxf += createLine(900, 200, 900, 600, 'FURNITURE') + '\n'; // right
  dxf += createLine(900, 600, 100, 600, 'FURNITURE') + '\n'; // top
  dxf += createLine(100, 600, 100, 200, 'FURNITURE') + '\n'; // left
  
  // Add dimensions
  dxf += createDimension(100, 150, 900, 150, '800', 'DIMENSIONS') + '\n';
  dxf += createDimension(50, 200, 50, 600, '400', 'DIMENSIONS') + '\n';
  
  // Add depth notation
  dxf += createText(950, 400, '600 (depth)', 'DIMENSIONS', 20) + '\n';
  
  dxf += endEntities();
  
  return dxf;
}

// Generate Dual Module DXF (1600x400x600)
function generateDualModule() {
  let dxf = '';
  
  dxf += createDXFHeader() + '\n';
  dxf += createLayerTable() + '\n';
  dxf += startEntities() + '\n';
  
  // Add dimension label (W x H x D)
  dxf += createText(800, 1050, '1600 x 400 x 600', 'DIMENSIONS', 30) + '\n';
  
  // Add unit notation
  dxf += createText(50, 50, 'Units: mm', 'DIMENSIONS', 15) + '\n';
  
  // Draw furniture rectangle (dual modules)
  // First module
  dxf += createLine(100, 200, 900, 200, 'FURNITURE') + '\n';
  dxf += createLine(900, 200, 900, 600, 'FURNITURE') + '\n';
  dxf += createLine(900, 600, 100, 600, 'FURNITURE') + '\n';
  dxf += createLine(100, 600, 100, 200, 'FURNITURE') + '\n';
  
  // Second module
  dxf += createLine(900, 200, 1700, 200, 'FURNITURE') + '\n';
  dxf += createLine(1700, 200, 1700, 600, 'FURNITURE') + '\n';
  dxf += createLine(1700, 600, 900, 600, 'FURNITURE') + '\n';
  
  // Add dimensions
  dxf += createDimension(100, 150, 1700, 150, '1600', 'DIMENSIONS') + '\n';
  dxf += createDimension(50, 200, 50, 600, '400', 'DIMENSIONS') + '\n';
  
  // Add depth notation
  dxf += createText(1750, 400, 'Depth: 600mm', 'DIMENSIONS', 20) + '\n';
  
  dxf += endEntities();
  
  return dxf;
}

// Generate Cabinet with Base Frame DXF (800x500x600 with 100mm base)
function generateCabinetWithBase() {
  let dxf = '';
  
  dxf += createDXFHeader() + '\n';
  dxf += createLayerTable() + '\n';
  dxf += startEntities() + '\n';
  
  // Add dimension label (W x H x D)
  dxf += createText(400, 1150, '800 x 500 x 600', 'DIMENSIONS', 30) + '\n';
  
  // Add unit notation
  dxf += createText(50, 50, 'Dimensions in mm', 'DIMENSIONS', 15) + '\n';
  
  // Draw base frame (100mm height)
  dxf += createLine(100, 200, 900, 200, 'FURNITURE') + '\n'; // base bottom
  dxf += createLine(900, 200, 900, 300, 'FURNITURE') + '\n'; // base right
  dxf += createLine(900, 300, 100, 300, 'FURNITURE') + '\n'; // base top
  dxf += createLine(100, 300, 100, 200, 'FURNITURE') + '\n'; // base left
  
  // Add base frame label
  dxf += createText(500, 250, 'Base 100mm', 'DIMENSIONS', 15) + '\n';
  
  // Draw main cabinet (elevated)
  dxf += createLine(100, 300, 900, 300, 'FURNITURE') + '\n'; // bottom
  dxf += createLine(900, 300, 900, 700, 'FURNITURE') + '\n'; // right
  dxf += createLine(900, 700, 100, 700, 'FURNITURE') + '\n'; // top
  dxf += createLine(100, 700, 100, 300, 'FURNITURE') + '\n'; // left
  
  // Add dimensions
  dxf += createDimension(100, 150, 900, 150, '800', 'DIMENSIONS') + '\n';
  dxf += createDimension(50, 200, 50, 700, '500', 'DIMENSIONS') + '\n';
  dxf += createDimension(950, 200, 950, 300, '100', 'DIMENSIONS') + '\n';
  
  // Add depth notation
  dxf += createText(950, 500, '600mm (depth)', 'DIMENSIONS', 20) + '\n';
  
  dxf += endEntities();
  
  return dxf;
}

// Main execution
function main() {
  const outputDir = path.join(process.cwd(), 'test-dxf-samples');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  
  // Generate samples
  const samples = [
    { name: 'sample_A_single.dxf', content: generateSingleModule(), description: 'Single Module (800x400x600)' },
    { name: 'sample_B_dual.dxf', content: generateDualModule(), description: 'Dual Module (1600x400x600)' },
    { name: 'sample_C_cabinet.dxf', content: generateCabinetWithBase(), description: 'Cabinet with Base Frame (800x500x600)' }
  ];
  
  console.log('Generating DXF samples...');
  console.log('========================\n');
  
  samples.forEach(sample => {
    const filePath = path.join(outputDir, sample.name);
    fs.writeFileSync(filePath, sample.content);
    console.log(`✅ Generated: ${sample.name}`);
    console.log(`   ${sample.description}`);
  });
  
  console.log('\n========================');
  console.log(`All samples generated in: ${outputDir}`);
  console.log('\nTo verify, run:');
  console.log(`  node scripts/verify-dxf-step1-2.cjs test-dxf-samples/*.dxf`);
  console.log(`  node scripts/verify-dxf-step3.cjs test-dxf-samples/*.dxf`);
}

main();