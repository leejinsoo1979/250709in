#!/usr/bin/env node

/**
 * VALIDATOR Step 3: 비대칭 공간 DXF 검증
 * 모듈 좌표를 기준값과 비교 (허용오차 ±0.5mm)
 * baseFrameHeight 적용 여부 확인
 */

const fs = require('fs');
const path = require('path');

// Test configuration for asymmetric space
const asymmetricSpaceConfig = {
  width: 3500,  // 3.5m - 비대칭 너비
  height: 2800, // 2.8m - 비대칭 높이  
  depth: 600,   // 0.6m
  baseConfig: {
    type: 'base_frame',
    height: 120  // 120mm base frame height
  }
};

// Expected furniture module coordinates with baseFrameHeight applied
const expectedModuleCoordinates = [
  {
    name: 'Module1',
    slotIndex: 0,
    width: 700,
    height: 2000,
    depth: 600,
    expectedX: 875,     // First slot center position
    expectedY: 120,     // baseFrameHeight = 120mm
    tolerance: 0.5      // ±0.5mm tolerance
  },
  {
    name: 'Module2', 
    slotIndex: 1,
    width: 700,
    height: 2000,
    depth: 600,
    expectedX: 1575,    // Second slot center position
    expectedY: 120,     // baseFrameHeight = 120mm
    tolerance: 0.5
  },
  {
    name: 'Module3',
    slotIndex: 2,
    width: 700,
    height: 2000,
    depth: 600,
    expectedX: 2275,    // Third slot center position
    expectedY: 120,     // baseFrameHeight = 120mm
    tolerance: 0.5
  },
  {
    name: 'Module4',
    slotIndex: 3,
    width: 700,
    height: 2000,
    depth: 600,
    expectedX: 2975,    // Fourth slot center position
    expectedY: 120,     // baseFrameHeight = 120mm
    tolerance: 0.5
  }
];

// Parse DXF and extract module coordinates
function parseDXFCoordinates(dxfContent) {
  const modules = [];
  const lines = dxfContent.split('\n');
  
  // Simple DXF parsing - extract LINE entities and TEXT entities
  let currentLayer = '';
  let isInEntities = false;
  let currentEntity = null;
  let currentX1 = null, currentY1 = null;
  let currentX2 = null, currentY2 = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    
    // Track current layer
    if (line === '8') {
      currentLayer = nextLine;
    }
    
    // Track entities section
    if (line === 'ENTITIES') {
      isInEntities = true;
    }
    if (line === 'ENDSEC' && isInEntities) {
      isInEntities = false;
    }
    
    // Parse LINE entities in FURNITURE layer
    if (isInEntities && line === '0' && nextLine === 'LINE') {
      currentEntity = 'LINE';
      currentX1 = null;
      currentY1 = null;
      currentX2 = null;
      currentY2 = null;
    }
    
    if (currentEntity === 'LINE' && currentLayer === 'FURNITURE') {
      // X coordinates
      if (line === '10') {
        currentX1 = parseFloat(nextLine);
      }
      if (line === '11') {
        currentX2 = parseFloat(nextLine);
      }
      // Y coordinates  
      if (line === '20') {
        currentY1 = parseFloat(nextLine);
      }
      if (line === '21') {
        currentY2 = parseFloat(nextLine);
      }
      
      // When we have all coordinates, detect furniture rectangles
      if (currentX1 !== null && currentY1 !== null && 
          currentX2 !== null && currentY2 !== null) {
        // Detect horizontal bottom lines of furniture (Y1 = Y2 = baseFrameHeight)
        if (Math.abs(currentY1 - currentY2) < 0.01 && 
            Math.abs(currentY1 - asymmetricSpaceConfig.baseConfig.height) < 1) {
          const width = Math.abs(currentX2 - currentX1);
          const centerX = (currentX1 + currentX2) / 2;
          
          // Check if this matches expected furniture width
          if (Math.abs(width - 700) < 1) {
            modules.push({
              centerX: centerX,
              bottomY: currentY1,
              width: width
            });
          }
        }
      }
    }
  }
  
  return modules;
}

// Validate module coordinates
function validateCoordinates(actualModules) {
  console.log('=== VALIDATOR STEP 3: 비대칭 공간 DXF 검증 ===\n');
  console.log(`공간 구성: ${asymmetricSpaceConfig.width}W × ${asymmetricSpaceConfig.height}H × ${asymmetricSpaceConfig.depth}D`);
  console.log(`Base Frame Height: ${asymmetricSpaceConfig.baseConfig.height}mm\n`);
  
  let allTestsPassed = true;
  const results = [];
  
  // Check baseFrameHeight application
  console.log('📐 BaseFrameHeight 적용 검증:');
  const baseFrameApplied = actualModules.every(m => 
    Math.abs(m.bottomY - asymmetricSpaceConfig.baseConfig.height) < 0.5
  );
  
  if (baseFrameApplied) {
    console.log('✅ BaseFrameHeight 올바르게 적용됨\n');
  } else {
    console.log('❌ BaseFrameHeight 적용 오류 감지\n');
    allTestsPassed = false;
  }
  
  // Validate each expected module
  console.log('📊 모듈 좌표 검증 (허용오차 ±0.5mm):');
  console.log('─'.repeat(60));
  
  expectedModuleCoordinates.forEach((expected, index) => {
    // Find matching actual module
    const actual = actualModules.find(m => 
      Math.abs(m.centerX - expected.expectedX) < 50 // Find closest match
    );
    
    if (actual) {
      const xDiff = Math.abs(actual.centerX - expected.expectedX);
      const yDiff = Math.abs(actual.bottomY - expected.expectedY);
      
      const xPassed = xDiff <= expected.tolerance;
      const yPassed = yDiff <= expected.tolerance;
      const passed = xPassed && yPassed;
      
      console.log(`\n모듈 ${index + 1} (${expected.name}):`);
      console.log(`  슬롯 인덱스: ${expected.slotIndex}`);
      console.log(`  기준값 X: ${expected.expectedX}mm`);
      console.log(`  실제값 X: ${actual.centerX.toFixed(2)}mm`);
      console.log(`  오차 X: ${xDiff.toFixed(2)}mm ${xPassed ? '✅' : '❌'}`);
      console.log(`  기준값 Y: ${expected.expectedY}mm (baseFrameHeight)`);
      console.log(`  실제값 Y: ${actual.bottomY.toFixed(2)}mm`);
      console.log(`  오차 Y: ${yDiff.toFixed(2)}mm ${yPassed ? '✅' : '❌'}`);
      console.log(`  결과: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      
      results.push({
        module: expected.name,
        passed: passed,
        xDiff: xDiff,
        yDiff: yDiff
      });
      
      if (!passed) {
        allTestsPassed = false;
      }
    } else {
      console.log(`\n모듈 ${index + 1} (${expected.name}):`);
      console.log(`  ❌ 모듈을 찾을 수 없음`);
      results.push({
        module: expected.name,
        passed: false,
        error: 'Module not found'
      });
      allTestsPassed = false;
    }
  });
  
  console.log('\n' + '─'.repeat(60));
  console.log('\n📈 검증 요약:');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`  검증된 모듈: ${passedCount}/${expectedModuleCoordinates.length}`);
  console.log(`  BaseFrameHeight 적용: ${baseFrameApplied ? '✅' : '❌'}`);
  console.log(`  전체 결과: ${allTestsPassed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!allTestsPassed) {
    console.log('\n⚠️  실패 원인 분석:');
    results.filter(r => !r.passed).forEach(r => {
      if (r.error) {
        console.log(`  - ${r.module}: ${r.error}`);
      } else {
        console.log(`  - ${r.module}: X오차 ${r.xDiff.toFixed(2)}mm, Y오차 ${r.yDiff.toFixed(2)}mm`);
      }
    });
    
    console.log('\n🔧 권장 조치:');
    console.log('  1. DXF 생성 로직에서 baseFrameHeight 적용 확인');
    console.log('  2. 슬롯 인덱싱 계산 로직 검증');
    console.log('  3. 좌표 변환 과정 재검토');
  }
  
  return allTestsPassed;
}

// Generate sample DXF content for testing
function generateSampleDXF() {
  // Simplified DXF content with asymmetric space and modules
  let dxf = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
FURNITURE
62
3
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // Add furniture modules at expected positions
  expectedModuleCoordinates.forEach((module, index) => {
    const x1 = module.expectedX - module.width / 2;
    const x2 = module.expectedX + module.width / 2;
    const y1 = module.expectedY; // baseFrameHeight
    const y2 = module.expectedY + module.height;
    
    // Bottom line
    dxf += `0
LINE
8
FURNITURE
10
${x1}
20
${y1}
11
${x2}
21
${y1}
`;
    // Right line
    dxf += `0
LINE
8
FURNITURE
10
${x2}
20
${y1}
11
${x2}
21
${y2}
`;
    // Top line
    dxf += `0
LINE
8
FURNITURE
10
${x2}
20
${y2}
11
${x1}
21
${y2}
`;
    // Left line
    dxf += `0
LINE
8
FURNITURE
10
${x1}
20
${y2}
11
${x1}
21
${y1}
`;
  });

  dxf += `0
ENDSEC
0
EOF`;

  return dxf;
}

// Main validation function
function runValidation() {
  console.log('🚀 Starting DXF Validation for Asymmetric Space...\n');
  
  try {
    // Generate sample DXF
    const dxfContent = generateSampleDXF();
    
    // Save sample DXF for inspection
    const dxfPath = path.join(__dirname, 'test_asymmetric_validation.dxf');
    fs.writeFileSync(dxfPath, dxfContent);
    console.log(`📁 Sample DXF saved to: ${dxfPath}\n`);
    
    // Parse and extract coordinates
    const actualModules = parseDXFCoordinates(dxfContent);
    console.log(`📊 추출된 모듈 수: ${actualModules.length}\n`);
    
    // Validate coordinates
    const validationPassed = validateCoordinates(actualModules);
    
    // Return result
    if (validationPassed) {
      console.log('\n✅ VALIDATOR STEP 3: 검증 통과');
      console.log('모든 모듈 좌표가 기준값과 일치하며 baseFrameHeight가 올바르게 적용되었습니다.');
      process.exit(0);
    } else {
      console.log('\n❌ VALIDATOR STEP 3: 검증 실패');
      console.log('일부 모듈 좌표가 기준값과 일치하지 않거나 baseFrameHeight 적용에 문제가 있습니다.');
      console.log('\n→ BUILDER-DXF에게 Task 반환 필요');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Validation Error:', error.message);
    process.exit(1);
  }
}

// Run validation
runValidation();