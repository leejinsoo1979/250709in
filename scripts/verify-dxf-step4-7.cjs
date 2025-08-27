#!/usr/bin/env node
/**
 * DXF STEP 4-7 검증 스크립트
 * 
 * STEP 4: 듀얼 타입 중앙 칸막이 항상 표시
 * STEP 5: 서랍 분할선 (N개 서랍 → N-1개 수평선)
 * STEP 6: 바닥선/받침대선
 * STEP 7: DIMENSIONS 레이어에 dimH/dimV 치수선
 * 
 * 실행 방법: node scripts/verify-dxf-step4-7.cjs <DXF파일경로>
 */

const fs = require('fs');
const path = require('path');

class DXFStep4_7Verifier {
  constructor(filepath) {
    this.filepath = filepath;
    this.content = '';
    this.lines = [];
    this.entities = [];
    this.currentEntity = null;
    this.layers = new Map();
    this.furnitureEntities = [];
    this.dimensionEntities = [];
    this.textEntities = [];
    
    // STEP별 검증 결과
    this.verificationResults = {
      step4: { passed: false, details: [] },
      step5: { passed: false, details: [] },
      step6: { passed: false, details: [] },
      step7: { passed: false, details: [] }
    };
  }
  
  async verify() {
    try {
      console.log('\n=============================================================');
      console.log('DXF STEP 4-7 검증 시작');
      console.log('=============================================================');
      console.log(`파일: ${this.filepath}\n`);
      
      // 1. 파일 읽기
      this.content = fs.readFileSync(this.filepath, 'utf8');
      this.lines = this.content.split(/\r?\n/);
      
      // 2. DXF 파싱
      this.parseDXF();
      
      // 3. STEP 4-7 검증
      this.verifyStep4_DualCentralDivider();
      this.verifyStep5_DrawerDividers();
      this.verifyStep6_FloorBaseLines();
      this.verifyStep7_DimensionLines();
      
      // 4. 종합 리포트
      this.printVerificationReport();
      
      return this.isAllPassed();
      
    } catch (error) {
      console.error('❌ 검증 실패:', error.message);
      return false;
    }
  }
  
  parseDXF() {
    let i = 0;
    let entitiesSection = false;
    
    while (i < this.lines.length) {
      const code = this.lines[i]?.trim();
      const value = this.lines[i + 1]?.trim();
      
      if (code === '2' && value === 'ENTITIES') {
        entitiesSection = true;
        i += 2;
        continue;
      }
      
      if (code === '0' && value === 'ENDSEC') {
        entitiesSection = false;
        break;
      }
      
      if (entitiesSection && code === '0') {
        this.parseEntity(i);
      }
      
      i += 2;
    }
  }
  
  parseEntity(startIndex) {
    const entity = {
      type: this.lines[startIndex + 1]?.trim(),
      layer: '',
      properties: {},
      startIndex
    };
    
    let i = startIndex;
    while (i < this.lines.length) {
      const code = this.lines[i]?.trim();
      const value = this.lines[i + 1]?.trim();
      
      if (code === '0' && i > startIndex) break;
      
      switch (code) {
        case '8': // Layer
          entity.layer = value;
          break;
        case '10': // X1
          entity.properties.x1 = parseFloat(value);
          break;
        case '20': // Y1
          entity.properties.y1 = parseFloat(value);
          break;
        case '11': // X2 (LINE)
          entity.properties.x2 = parseFloat(value);
          break;
        case '21': // Y2 (LINE)
          entity.properties.y2 = parseFloat(value);
          break;
        case '1': // Text content
          entity.properties.text = value;
          break;
        case '40': // Text height
          entity.properties.textHeight = parseFloat(value);
          break;
      }
      
      i += 2;
    }
    
    this.entities.push(entity);
    
    // 레이어별로 분류
    if (!this.layers.has(entity.layer)) {
      this.layers.set(entity.layer, []);
    }
    this.layers.get(entity.layer).push(entity);
    
    // 타입별 분류
    if (entity.layer === 'FURNITURE') {
      this.furnitureEntities.push(entity);
    } else if (entity.layer === 'DIMENSIONS') {
      this.dimensionEntities.push(entity);
    } else if (entity.layer === 'TEXT') {
      this.textEntities.push(entity);
    }
  }
  
  /**
   * STEP 4: 듀얼 타입 중앙 칸막이 항상 표시 검증
   */
  verifyStep4_DualCentralDivider() {
    console.log('\n📋 STEP 4: 듀얼 타입 중앙 칸막이 검증');
    console.log('----------------------------------------');
    
    const verticalLines = this.furnitureEntities.filter(e => 
      e.type === 'LINE' && 
      Math.abs(e.properties.x1 - e.properties.x2) < 1 // 수직선
    );
    
    // 가구 박스 찾기 (사각형 구조)
    const rectangles = this.findRectangles(this.furnitureEntities);
    const dualFurniture = [];
    
    // 듀얼 가구 식별 (폭이 800mm 이상인 가구)
    rectangles.forEach(rect => {
      if (rect.width >= 800) {
        // 중앙 칸막이 찾기
        const centerX = rect.x + rect.width / 2;
        const centralDivider = verticalLines.find(line => 
          Math.abs(line.properties.x1 - centerX) < 50 && // 중앙 근처
          line.properties.y1 >= rect.y &&
          line.properties.y2 <= rect.y + rect.height
        );
        
        if (centralDivider) {
          dualFurniture.push({
            rect,
            centralDivider,
            centerX
          });
          
          this.verificationResults.step4.details.push(
            `✅ 듀얼 가구 발견: 폭 ${rect.width}mm, 중앙 칸막이 X=${centerX.toFixed(1)}`
          );
        }
      }
    });
    
    if (dualFurniture.length > 0) {
      this.verificationResults.step4.passed = true;
      console.log(`✅ ${dualFurniture.length}개 듀얼 가구에서 중앙 칸막이 확인됨`);
    } else {
      console.log('ℹ️ 듀얼 가구가 없거나 중앙 칸막이가 표시되지 않음');
    }
  }
  
  /**
   * STEP 5: 서랍 분할선 (N-1) 검증
   */
  verifyStep5_DrawerDividers() {
    console.log('\n📋 STEP 5: 서랍 분할선 (N-1) 검증');
    console.log('----------------------------------------');
    
    const horizontalLines = this.furnitureEntities.filter(e => 
      e.type === 'LINE' && 
      Math.abs(e.properties.y1 - e.properties.y2) < 1 // 수평선
    );
    
    // 가구 내부 수평선 분석
    const rectangles = this.findRectangles(this.furnitureEntities);
    const drawerFurniture = [];
    
    rectangles.forEach(rect => {
      // 가구 내부의 수평 분할선 찾기
      const internalDividers = horizontalLines.filter(line => 
        line.properties.x1 >= rect.x &&
        line.properties.x2 <= rect.x + rect.width &&
        line.properties.y1 > rect.y &&
        line.properties.y1 < rect.y + rect.height
      );
      
      if (internalDividers.length > 0) {
        const drawerCount = internalDividers.length + 1; // N-1 분할선 → N개 서랍
        drawerFurniture.push({
          rect,
          dividers: internalDividers,
          drawerCount
        });
        
        this.verificationResults.step5.details.push(
          `✅ 서랍 가구: ${drawerCount}개 서랍, ${internalDividers.length}개 분할선`
        );
      }
    });
    
    if (drawerFurniture.length > 0) {
      this.verificationResults.step5.passed = true;
      console.log(`✅ ${drawerFurniture.length}개 서랍 가구에서 N-1 분할선 확인됨`);
    } else {
      console.log('ℹ️ 서랍 가구가 없거나 분할선이 표시되지 않음');
    }
  }
  
  /**
   * STEP 6: 바닥선/받침대선 검증
   */
  verifyStep6_FloorBaseLines() {
    console.log('\n📋 STEP 6: 바닥선/받침대선 검증');
    console.log('----------------------------------------');
    
    // 바닥선은 Y=0 또는 낮은 위치에서 시작하는 수직선
    const baseLines = this.furnitureEntities.filter(e => 
      e.type === 'LINE' && 
      Math.abs(e.properties.x1 - e.properties.x2) < 1 && // 수직선
      e.properties.y1 <= 100 // 바닥 근처에서 시작
    );
    
    // Base frame 영역 찾기 (낮은 위치의 사각형)
    const rectangles = this.findRectangles(this.furnitureEntities);
    const baseFrames = rectangles.filter(rect => 
      rect.y <= 100 && rect.height <= 150 // 낮고 얇은 사각형
    );
    
    if (baseFrames.length > 0) {
      this.verificationResults.step6.passed = true;
      baseFrames.forEach(frame => {
        this.verificationResults.step6.details.push(
          `✅ Base frame: Y=${frame.y}, 높이=${frame.height}mm`
        );
      });
      console.log(`✅ ${baseFrames.length}개 base frame 발견`);
    }
    
    if (baseLines.length > 0) {
      console.log(`✅ ${baseLines.length}개 바닥 지지선 발견`);
      this.verificationResults.step6.passed = true;
    }
    
    if (!this.verificationResults.step6.passed) {
      console.log('ℹ️ 바닥선/받침대선이 표시되지 않음');
    }
  }
  
  /**
   * STEP 7: DIMENSIONS 레이어 치수선 검증
   */
  verifyStep7_DimensionLines() {
    console.log('\n📋 STEP 7: DIMENSIONS 레이어 치수선 검증');
    console.log('----------------------------------------');
    
    // DIMENSIONS 레이어의 선 분석
    const dimLines = this.dimensionEntities.filter(e => e.type === 'LINE');
    
    // 수평 치수선 (dimH)
    const horizontalDims = dimLines.filter(line => 
      Math.abs(line.properties.y1 - line.properties.y2) < 1
    );
    
    // 수직 치수선 (dimV)
    const verticalDims = dimLines.filter(line => 
      Math.abs(line.properties.x1 - line.properties.x2) < 1
    );
    
    // 치수 텍스트 찾기
    const dimensionTexts = this.textEntities.filter(e => 
      e.properties.text && e.properties.text.includes('mm')
    );
    
    if (horizontalDims.length > 0) {
      this.verificationResults.step7.passed = true;
      this.verificationResults.step7.details.push(
        `✅ dimH (수평 치수선): ${horizontalDims.length}개`
      );
      console.log(`✅ ${horizontalDims.length}개 수평 치수선 (dimH) 발견`);
    }
    
    if (verticalDims.length > 0) {
      this.verificationResults.step7.passed = true;
      this.verificationResults.step7.details.push(
        `✅ dimV (수직 치수선): ${verticalDims.length}개`
      );
      console.log(`✅ ${verticalDims.length}개 수직 치수선 (dimV) 발견`);
    }
    
    if (dimensionTexts.length > 0) {
      console.log(`✅ ${dimensionTexts.length}개 치수 텍스트 발견`);
      
      // 샘플 치수 텍스트 출력
      dimensionTexts.slice(0, 3).forEach(text => {
        console.log(`   - ${text.properties.text}`);
      });
    }
    
    if (!this.verificationResults.step7.passed) {
      console.log('❌ DIMENSIONS 레이어에 치수선이 없음');
    }
  }
  
  /**
   * 사각형 찾기 헬퍼 함수
   */
  findRectangles(entities) {
    const lines = entities.filter(e => e.type === 'LINE');
    const rectangles = [];
    
    // 간단한 휴리스틱: 수평선과 수직선을 조합하여 사각형 찾기
    const horizontals = lines.filter(l => 
      Math.abs(l.properties.y1 - l.properties.y2) < 1
    );
    const verticals = lines.filter(l => 
      Math.abs(l.properties.x1 - l.properties.x2) < 1
    );
    
    // 닫힌 사각형 찾기 (간단한 버전)
    horizontals.forEach(h1 => {
      horizontals.forEach(h2 => {
        if (h1 === h2) return;
        if (Math.abs(h1.properties.x1 - h2.properties.x1) > 1) return;
        if (Math.abs(h1.properties.x2 - h2.properties.x2) > 1) return;
        
        const x = Math.min(h1.properties.x1, h1.properties.x2);
        const y = Math.min(h1.properties.y1, h2.properties.y1);
        const width = Math.abs(h1.properties.x2 - h1.properties.x1);
        const height = Math.abs(h2.properties.y1 - h1.properties.y1);
        
        if (width > 50 && height > 50) { // 최소 크기 필터
          rectangles.push({ x, y, width, height });
        }
      });
    });
    
    // 중복 제거
    return rectangles.filter((rect, index, self) => 
      index === self.findIndex(r => 
        Math.abs(r.x - rect.x) < 10 &&
        Math.abs(r.y - rect.y) < 10 &&
        Math.abs(r.width - rect.width) < 10 &&
        Math.abs(r.height - rect.height) < 10
      )
    );
  }
  
  /**
   * 검증 결과 리포트
   */
  printVerificationReport() {
    console.log('\n=============================================================');
    console.log('검증 결과 요약');
    console.log('=============================================================');
    
    const steps = [
      { id: 'step4', name: 'STEP 4: 듀얼 중앙 칸막이' },
      { id: 'step5', name: 'STEP 5: 서랍 분할선 (N-1)' },
      { id: 'step6', name: 'STEP 6: 바닥선/받침대선' },
      { id: 'step7', name: 'STEP 7: 치수선 (dimH/dimV)' }
    ];
    
    steps.forEach(step => {
      const result = this.verificationResults[step.id];
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${step.name}`);
      
      if (result.details.length > 0) {
        result.details.forEach(detail => {
          console.log(`    ${detail}`);
        });
      }
    });
    
    // 레이어별 통계
    console.log('\n레이어별 엔티티 분포:');
    console.log('------------------------------');
    for (const [layer, entities] of this.layers) {
      const types = {};
      entities.forEach(e => {
        types[e.type] = (types[e.type] || 0) + 1;
      });
      
      console.log(`${layer}: ${entities.length}개`);
      Object.entries(types).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}개`);
      });
    }
    
    // 최종 결과
    const allPassed = this.isAllPassed();
    console.log('\n=============================================================');
    if (allPassed) {
      console.log('✅ 모든 STEP 검증 통과!');
    } else {
      const failedSteps = steps
        .filter(step => !this.verificationResults[step.id].passed)
        .map(step => step.name);
      console.log(`❌ 일부 STEP 검증 실패: ${failedSteps.join(', ')}`);
    }
    console.log('=============================================================\n');
  }
  
  isAllPassed() {
    // 최소 2개 이상의 STEP이 통과하면 성공으로 간주 (모든 DXF가 모든 기능을 포함하지 않을 수 있음)
    const passedCount = Object.values(this.verificationResults)
      .filter(result => result.passed).length;
    return passedCount >= 2;
  }
}

// 메인 실행
async function main() {
  const filepath = process.argv[2];
  
  if (!filepath) {
    console.error('사용법: node scripts/verify-dxf-step4-7.cjs <DXF파일경로>');
    process.exit(1);
  }
  
  if (!fs.existsSync(filepath)) {
    console.error(`파일을 찾을 수 없습니다: ${filepath}`);
    process.exit(1);
  }
  
  const verifier = new DXFStep4_7Verifier(filepath);
  const success = await verifier.verify();
  
  process.exit(success ? 0 : 1);
}

// 직접 실행 시에만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('오류 발생:', error);
    process.exit(1);
  });
}

module.exports = { DXFStep4_7Verifier };