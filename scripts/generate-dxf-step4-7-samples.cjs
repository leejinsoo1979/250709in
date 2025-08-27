#!/usr/bin/env node
/**
 * DXF STEP 4-7 샘플 생성 스크립트
 * 
 * STEP 4-7 기능이 포함된 3종류 샘플 DXF 파일 생성:
 * - Sample A: 듀얼 가구 with 중앙 칸막이 (STEP 4)
 * - Sample B: 4단 서랍장 with N-1 분할선 (STEP 5)
 * - Sample C: Base frame 포함 가구 with 치수선 (STEP 6, 7)
 */

const fs = require('fs');
const path = require('path');

// 실제 프로젝트 import 시뮬레이션
const mockSpaceInfo = {
  width: 3000,
  height: 2500,
  depth: 600,
  wallThickness: { left: 50, right: 50, top: 50, bottom: 50 },
  baseConfig: { type: 'base_frame', height: 100 }
};

// 샘플 A: 듀얼 가구 with 중앙 칸막이 (STEP 4)
const sampleA_DualCabinet = {
  spaceInfo: mockSpaceInfo,
  placedModules: [
    {
      id: 'module1',
      moduleId: 'dual_cabinet',
      position: { x: 150, y: 50, z: 30 },
      moduleData: {
        name: 'Dual Cabinet',
        dimensions: { width: 800, height: 1200, depth: 500 }
      }
    }
  ],
  drawingType: 'front'
};

// 샘플 B: 4단 서랍장 (STEP 5)
const sampleB_DrawerUnit = {
  spaceInfo: mockSpaceInfo,
  placedModules: [
    {
      id: 'module2',
      moduleId: '4drawer_unit',
      position: { x: 100, y: 50, z: 30 },
      moduleData: {
        name: '4-Drawer Unit',
        dimensions: { width: 600, height: 1000, depth: 450 }
      }
    }
  ],
  drawingType: 'front'
};

// 샘플 C: Base frame 포함 종합 (STEP 6, 7)
const sampleC_CompleteSet = {
  spaceInfo: {
    ...mockSpaceInfo,
    baseConfig: { type: 'base_frame', height: 150 }
  },
  placedModules: [
    {
      id: 'module3',
      moduleId: 'dual_shelves',
      position: { x: 75, y: 75, z: 30 },
      moduleData: {
        name: 'Dual Shelves',
        dimensions: { width: 900, height: 1500, depth: 500 }
      }
    },
    {
      id: 'module4',
      moduleId: 'single_cabinet',
      position: { x: 200, y: 75, z: 30 },
      moduleData: {
        name: 'Single Cabinet',
        dimensions: { width: 450, height: 800, depth: 400 }
      }
    }
  ],
  drawingType: 'front'
};

// DXF Builder for actual generation
class EnhancedDXFBuilder {
  constructor() {
    this.content = [];
    this.entities = [];
  }

  addHeader() {
    this.content.push(
      '0', 'SECTION', '2', 'HEADER',
      '9', '$MEASUREMENT', '70', '1',
      '9', '$INSUNITS', '70', '4',
      '0', 'ENDSEC'
    );
  }

  addTables() {
    this.content.push(
      '0', 'SECTION', '2', 'TABLES',
      '0', 'TABLE', '2', 'LTYPE',
      '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0',
      '3', 'Solid line', '72', '65', '73', '0', '40', '0.0',
      '0', 'ENDTAB'
    );
    
    // 레이어 추가
    this.content.push(
      '0', 'TABLE', '2', 'LAYER',
      '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'FURNITURE', '70', '0', '62', '3', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'DIMENSIONS', '70', '0', '62', '1', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'TEXT', '70', '0', '62', '5', '6', 'CONTINUOUS',
      '0', 'ENDTAB',
      '0', 'ENDSEC'
    );
  }

  addLine(x1, y1, x2, y2, layer = 'FURNITURE') {
    this.entities.push(
      '0', 'LINE', '8', layer,
      '10', x1.toFixed(2), '20', y1.toFixed(2),
      '11', x2.toFixed(2), '21', y2.toFixed(2)
    );
  }

  addText(text, x, y, height = 50, layer = 'TEXT') {
    this.entities.push(
      '0', 'TEXT', '8', layer,
      '10', x.toFixed(2), '20', y.toFixed(2),
      '40', height.toFixed(2), '1', text
    );
  }

  addRectangle(x, y, width, height, layer = 'FURNITURE') {
    this.addLine(x, y, x + width, y, layer);
    this.addLine(x + width, y, x + width, y + height, layer);
    this.addLine(x + width, y + height, x, y + height, layer);
    this.addLine(x, y + height, x, y, layer);
  }

  // STEP 4: 듀얼 가구 중앙 칸막이
  addDualCentralDivider(x, y, width, height) {
    const centerX = x + width / 2;
    console.log(`🎯 [STEP 4] Adding dual central divider at X=${centerX}`);
    this.addLine(centerX, y, centerX, y + height, 'FURNITURE');
  }

  // STEP 5: 서랍 분할선 (N-1)
  addDrawerDividers(x, y, width, height, drawerCount) {
    if (drawerCount <= 1) return;
    
    const dividerCount = drawerCount - 1;
    console.log(`📐 [STEP 5] Adding ${dividerCount} drawer dividers for ${drawerCount} drawers`);
    
    for (let i = 1; i <= dividerCount; i++) {
      const dividerY = y + (height / drawerCount) * i;
      this.addLine(x, dividerY, x + width, dividerY, 'FURNITURE');
    }
  }

  // STEP 6: 바닥선/받침대선
  addBaseFrame(x, y, width, baseHeight) {
    console.log(`📏 [STEP 6] Adding base frame: height=${baseHeight}mm`);
    this.addRectangle(x, y - baseHeight, width, baseHeight, 'FURNITURE');
    
    // 지지대 선
    this.addLine(x, y - baseHeight, x, y, 'FURNITURE');
    this.addLine(x + width, y - baseHeight, x + width, y, 'FURNITURE');
  }

  // STEP 7: 치수선 (dimH, dimV)
  addDimensionLines(x, y, width, height) {
    console.log(`📐 [STEP 7] Adding dimension lines (dimH, dimV)`);
    
    // dimH (수평 치수선)
    const dimY = y - 150;
    this.addLine(x, dimY, x + width, dimY, 'DIMENSIONS');
    // 화살표
    this.addLine(x, dimY - 10, x, dimY + 10, 'DIMENSIONS');
    this.addLine(x + width, dimY - 10, x + width, dimY + 10, 'DIMENSIONS');
    // 연장선
    this.addLine(x, y, x, dimY + 10, 'DIMENSIONS');
    this.addLine(x + width, y, x + width, dimY + 10, 'DIMENSIONS');
    // 텍스트
    this.addText(`${width}mm`, x + width/2, dimY - 30, 30, 'TEXT');
    
    // dimV (수직 치수선)
    const dimX = x + width + 100;
    this.addLine(dimX, y, dimX, y + height, 'DIMENSIONS');
    // 화살표
    this.addLine(dimX - 10, y, dimX + 10, y, 'DIMENSIONS');
    this.addLine(dimX - 10, y + height, dimX + 10, y + height, 'DIMENSIONS');
    // 연장선
    this.addLine(x + width, y, dimX + 10, y, 'DIMENSIONS');
    this.addLine(x + width, y + height, dimX + 10, y + height, 'DIMENSIONS');
    // 텍스트
    this.addText(`${height}mm`, dimX + 30, y + height/2, 30, 'TEXT');
  }

  build() {
    this.addHeader();
    this.addTables();
    
    this.content.push('0', 'SECTION', '2', 'ENTITIES');
    this.content = this.content.concat(this.entities);
    this.content.push('0', 'ENDSEC', '0', 'EOF');
    
    return this.content.join('\n');
  }
}

// 샘플 A 생성: 듀얼 가구 (STEP 4)
function generateSampleA() {
  console.log('\n🔨 Generating Sample A: Dual Cabinet with Central Divider (STEP 4)');
  
  const dxf = new EnhancedDXFBuilder();
  
  // 공간 외곽선
  dxf.addRectangle(0, 0, 3000, 2500, 'FURNITURE');
  
  // 듀얼 가구
  const furnitureX = 1100;
  const furnitureY = 500;
  const furnitureWidth = 800;
  const furnitureHeight = 1200;
  
  // 가구 외곽선
  dxf.addRectangle(furnitureX, furnitureY, furnitureWidth, furnitureHeight, 'FURNITURE');
  
  // STEP 4: 중앙 칸막이 (듀얼은 항상 표시)
  dxf.addDualCentralDivider(furnitureX, furnitureY, furnitureWidth, furnitureHeight);
  
  // 양쪽에 선반 추가
  const shelfY1 = furnitureY + 400;
  const shelfY2 = furnitureY + 800;
  const centerX = furnitureX + furnitureWidth / 2;
  
  // 왼쪽 선반
  dxf.addLine(furnitureX, shelfY1, centerX, shelfY1, 'FURNITURE');
  dxf.addLine(furnitureX, shelfY2, centerX, shelfY2, 'FURNITURE');
  
  // 오른쪽 선반
  dxf.addLine(centerX, shelfY1, furnitureX + furnitureWidth, shelfY1, 'FURNITURE');
  dxf.addLine(centerX, shelfY2, furnitureX + furnitureWidth, shelfY2, 'FURNITURE');
  
  // STEP 7: 치수선
  dxf.addDimensionLines(furnitureX, furnitureY, furnitureWidth, furnitureHeight);
  
  // 라벨
  dxf.addText('Dual Cabinet', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 100, 60, 'TEXT');
  dxf.addText('800 × 1200 × 500mm', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 150, 40, 'TEXT');
  dxf.addText('STEP 4: Central Divider Always Shown', furnitureX + furnitureWidth/2, furnitureY - 200, 40, 'TEXT');
  
  return dxf.build();
}

// 샘플 B 생성: 4단 서랍장 (STEP 5)
function generateSampleB() {
  console.log('\n🔨 Generating Sample B: 4-Drawer Unit (STEP 5)');
  
  const dxf = new EnhancedDXFBuilder();
  
  // 공간 외곽선
  dxf.addRectangle(0, 0, 3000, 2500, 'FURNITURE');
  
  // 서랍장
  const furnitureX = 1200;
  const furnitureY = 600;
  const furnitureWidth = 600;
  const furnitureHeight = 1000;
  const drawerCount = 4;
  
  // 가구 외곽선
  dxf.addRectangle(furnitureX, furnitureY, furnitureWidth, furnitureHeight, 'FURNITURE');
  
  // STEP 5: N-1 서랍 분할선
  dxf.addDrawerDividers(furnitureX, furnitureY, furnitureWidth, furnitureHeight, drawerCount);
  
  // STEP 7: 치수선
  dxf.addDimensionLines(furnitureX, furnitureY, furnitureWidth, furnitureHeight);
  
  // 라벨
  dxf.addText('4-Drawer Unit', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 100, 60, 'TEXT');
  dxf.addText('600 × 1000 × 450mm', furnitureX + furnitureWidth/2, furnitureY + furnitureHeight + 150, 40, 'TEXT');
  dxf.addText(`STEP 5: ${drawerCount} drawers, ${drawerCount-1} dividers`, furnitureX + furnitureWidth/2, furnitureY - 200, 40, 'TEXT');
  
  return dxf.build();
}

// 샘플 C 생성: Base frame 포함 종합 (STEP 6, 7)
function generateSampleC() {
  console.log('\n🔨 Generating Sample C: Complete Set with Base Frame (STEP 6, 7)');
  
  const dxf = new EnhancedDXFBuilder();
  
  // 공간 외곽선
  dxf.addRectangle(0, 0, 3000, 2500, 'FURNITURE');
  
  const baseFrameHeight = 150;
  
  // 첫 번째 가구: 듀얼 선반 (base frame 포함)
  const furniture1X = 600;
  const furniture1Y = 300 + baseFrameHeight; // Base frame 위에 배치
  const furniture1Width = 900;
  const furniture1Height = 1500;
  
  // STEP 6: Base frame
  dxf.addBaseFrame(furniture1X, furniture1Y, furniture1Width, baseFrameHeight);
  
  // 가구 외곽선
  dxf.addRectangle(furniture1X, furniture1Y, furniture1Width, furniture1Height, 'FURNITURE');
  
  // STEP 4: 듀얼 중앙 칸막이
  dxf.addDualCentralDivider(furniture1X, furniture1Y, furniture1Width, furniture1Height);
  
  // STEP 7: 치수선
  dxf.addDimensionLines(furniture1X, furniture1Y, furniture1Width, furniture1Height);
  
  // 두 번째 가구: 싱글 캐비닛
  const furniture2X = 1600;
  const furniture2Y = 300 + baseFrameHeight;
  const furniture2Width = 450;
  const furniture2Height = 800;
  
  // STEP 6: Base frame
  dxf.addBaseFrame(furniture2X, furniture2Y, furniture2Width, baseFrameHeight);
  
  // 가구 외곽선
  dxf.addRectangle(furniture2X, furniture2Y, furniture2Width, furniture2Height, 'FURNITURE');
  
  // 2단 선반
  dxf.addLine(furniture2X, furniture2Y + 400, furniture2X + furniture2Width, furniture2Y + 400, 'FURNITURE');
  
  // STEP 7: 치수선
  dxf.addDimensionLines(furniture2X, furniture2Y, furniture2Width, furniture2Height);
  
  // 라벨
  dxf.addText('Complete Set with Base Frame', 1500, 2200, 80, 'TEXT');
  dxf.addText(`Base Frame Height: ${baseFrameHeight}mm`, 1500, 2100, 50, 'TEXT');
  dxf.addText('STEP 6: Floor/Base Lines', 1500, 2000, 40, 'TEXT');
  dxf.addText('STEP 7: Dimension Lines (dimH/dimV)', 1500, 1950, 40, 'TEXT');
  
  return dxf.build();
}

// 메인 실행
async function main() {
  console.log('=============================================================');
  console.log('DXF STEP 4-7 샘플 생성');
  console.log('=============================================================');
  
  // exports 디렉토리 생성
  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  
  // 샘플 A 생성
  const sampleAContent = generateSampleA();
  const sampleAPath = path.join(exportDir, 'step4-7-sample-A.dxf');
  fs.writeFileSync(sampleAPath, sampleAContent);
  console.log(`✅ Sample A generated: ${sampleAPath}`);
  
  // 샘플 B 생성
  const sampleBContent = generateSampleB();
  const sampleBPath = path.join(exportDir, 'step4-7-sample-B.dxf');
  fs.writeFileSync(sampleBPath, sampleBContent);
  console.log(`✅ Sample B generated: ${sampleBPath}`);
  
  // 샘플 C 생성
  const sampleCContent = generateSampleC();
  const sampleCPath = path.join(exportDir, 'step4-7-sample-C.dxf');
  fs.writeFileSync(sampleCPath, sampleCContent);
  console.log(`✅ Sample C generated: ${sampleCPath}`);
  
  console.log('\n=============================================================');
  console.log('모든 샘플 생성 완료!');
  console.log('검증 실행: node scripts/verify-dxf-step4-7.cjs exports/step4-7-sample-*.dxf');
  console.log('=============================================================\n');
}

// 직접 실행 시에만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('오류 발생:', error);
    process.exit(1);
  });
}

module.exports = { EnhancedDXFBuilder };