#!/usr/bin/env node

/**
 * DXF 좌표계 검증 스크립트
 * STEP-3: internalStartX 기준 및 baseFrameHeight 검증
 */

const fs = require('fs');
const path = require('path');

// 테스트용 비대칭 공간 샘플 데이터
const asymmetricSpaceSample = {
  spaceInfo: {
    width: 3000,
    height: 2400,
    depth: 600,
    surroundType: 'no-surround',
    installType: 'semistanding',
    wallConfig: {
      left: true,
      right: false
    },
    gapConfig: {
      left: 10,
      right: 50
    },
    baseConfig: {
      type: 'base_frame',
      height: 150
    },
    customColumnCount: 4
  },
  placedModules: [
    {
      id: 'mod1',
      moduleId: 'WARDROBE_450',
      position: {
        x: 45.9,  // Three.js 좌표
        y: 0,
        z: 0
      },
      slotIndex: 0,
      moduleData: {
        name: 'Wardrobe 450',
        dimensions: {
          width: 450,
          height: 1800,
          depth: 500
        }
      }
    },
    {
      id: 'mod2',
      moduleId: 'SHELF_900',
      position: {
        x: 137.7,  // Three.js 좌표
        y: 0,
        z: 0
      },
      slotIndex: 1,
      isDualSlot: true,
      moduleData: {
        name: 'Shelf 900',
        dimensions: {
          width: 900,
          height: 1200,
          depth: 450
        }
      }
    }
  ]
};

/**
 * DXF 파일에서 좌표 정보 추출
 */
function extractCoordinatesFromDXF(dxfContent) {
  const lines = dxfContent.split('\n');
  const coordinates = {
    furniture: [],
    dimensions: [],
    baseFrame: []
  };
  
  let currentLayer = '0';
  let readingEntity = false;
  let entityType = '';
  let points = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 레이어 변경 감지
    if (line === '8' && i + 1 < lines.length) {
      currentLayer = lines[i + 1].trim();
    }
    
    // LINE 엔티티 시작
    if (line === 'LINE') {
      readingEntity = true;
      entityType = 'LINE';
      points = [];
    }
    
    // 좌표 읽기
    if (readingEntity) {
      if (line === '10' && i + 1 < lines.length) {
        points.push({ x: parseFloat(lines[i + 1]) });
      }
      if (line === '20' && i + 1 < lines.length && points.length > 0) {
        points[points.length - 1].y = parseFloat(lines[i + 1]);
      }
      if (line === '11' && i + 1 < lines.length) {
        points.push({ x: parseFloat(lines[i + 1]) });
      }
      if (line === '21' && i + 1 < lines.length && points.length > 1) {
        points[points.length - 1].y = parseFloat(lines[i + 1]);
        
        // 완성된 LINE 저장
        if (currentLayer === 'FURNITURE') {
          // Base Frame 식별 (Y=0에서 시작하는 큰 사각형)
          if (points[0].y === 0 && points[1].y > 0 && points[1].y <= 200) {
            coordinates.baseFrame.push({
              type: 'LINE',
              layer: currentLayer,
              start: { ...points[0] },
              end: { ...points[1] }
            });
          } else {
            coordinates.furniture.push({
              type: 'LINE',
              layer: currentLayer,
              start: { ...points[0] },
              end: { ...points[1] }
            });
          }
        } else if (currentLayer === 'DIMENSIONS') {
          coordinates.dimensions.push({
            type: 'LINE',
            layer: currentLayer,
            start: { ...points[0] },
            end: { ...points[1] }
          });
        }
        
        readingEntity = false;
      }
    }
  }
  
  return coordinates;
}

/**
 * 좌표 검증
 */
function validateCoordinates(coordinates, testData) {
  console.log('\n🔍 DXF 좌표계 검증 결과:\n');
  console.log('=' .repeat(60));
  
  const { spaceInfo } = testData;
  const internalStartX = spaceInfo.installType === 'semistanding' ? 18 : 
                         spaceInfo.installType === 'builtin' ? spaceInfo.gapConfig.left : 
                         18;
  
  console.log('📏 공간 정보:');
  console.log(`  - 전체 폭: ${spaceInfo.width}mm`);
  console.log(`  - 내부 시작점 (internalStartX): ${internalStartX}mm`);
  console.log(`  - 설치 타입: ${spaceInfo.installType}`);
  console.log(`  - 왼쪽 벽: ${spaceInfo.wallConfig?.left ? 'Yes' : 'No'}`);
  console.log(`  - 오른쪽 벽: ${spaceInfo.wallConfig?.right ? 'Yes' : 'No'}`);
  console.log(`  - Base Frame 높이: ${spaceInfo.baseConfig?.height || 0}mm`);
  
  console.log('\n📐 Base Frame 검증:');
  if (coordinates.baseFrame.length > 0) {
    const baseHeight = spaceInfo.baseConfig?.height || 0;
    const baseFrameValid = coordinates.baseFrame.some(line => 
      (line.start.y === 0 && line.end.y === baseHeight) ||
      (line.start.y === baseHeight && line.end.y === 0)
    );
    
    console.log(`  ✅ Base Frame 감지됨`);
    console.log(`  - 높이: ${baseHeight}mm`);
    console.log(`  - 검증: ${baseFrameValid ? '✅ PASS' : '❌ FAIL'}`);
  } else if (spaceInfo.baseConfig?.type === 'base_frame') {
    console.log(`  ❌ Base Frame이 그려지지 않음`);
  } else {
    console.log(`  ⚪ Base Frame 없음 (정상)`);
  }
  
  console.log('\n🎯 가구 좌표 검증:');
  
  // 가구별 경계 박스 계산
  const furnitureBounds = [];
  coordinates.furniture.forEach(line => {
    // 수평선인 경우 (가구 상/하단)
    if (Math.abs(line.start.y - line.end.y) < 1) {
      const minX = Math.min(line.start.x, line.end.x);
      const maxX = Math.max(line.start.x, line.end.x);
      const y = line.start.y;
      
      // 기존 경계에 추가하거나 새로 생성
      let found = false;
      furnitureBounds.forEach(bound => {
        if (Math.abs(bound.minX - minX) < 10 && Math.abs(bound.maxX - maxX) < 10) {
          if (y < bound.minY) bound.minY = y;
          if (y > bound.maxY) bound.maxY = y;
          found = true;
        }
      });
      
      if (!found) {
        furnitureBounds.push({
          minX, maxX, minY: y, maxY: y
        });
      }
    }
  });
  
  // 경계 박스 병합
  furnitureBounds.forEach(bound => {
    coordinates.furniture.forEach(line => {
      if (Math.abs(line.start.x - line.end.x) < 1) { // 수직선
        const x = line.start.x;
        const minY = Math.min(line.start.y, line.end.y);
        const maxY = Math.max(line.start.y, line.end.y);
        
        if (Math.abs(x - bound.minX) < 10 || Math.abs(x - bound.maxX) < 10) {
          if (minY < bound.minY) bound.minY = minY;
          if (maxY > bound.maxY) bound.maxY = maxY;
        }
      }
    });
  });
  
  furnitureBounds.forEach((bound, i) => {
    const width = bound.maxX - bound.minX;
    const height = bound.maxY - bound.minY;
    const centerX = (bound.minX + bound.maxX) / 2;
    const bottomY = bound.minY;
    
    console.log(`\n  가구 ${i + 1}:`);
    console.log(`    - 중심 X: ${centerX}mm`);
    console.log(`    - 왼쪽 끝: ${bound.minX}mm`);
    console.log(`    - 오른쪽 끝: ${bound.maxX}mm`);
    console.log(`    - 너비: ${width}mm`);
    console.log(`    - 바닥 Y: ${bottomY}mm`);
    console.log(`    - 높이: ${height}mm`);
    
    // Base Frame 위에 있는지 검증
    const expectedBottomY = spaceInfo.baseConfig?.height || 0;
    const onBaseFrame = Math.abs(bottomY - expectedBottomY) < 5;
    console.log(`    - Base Frame 위: ${onBaseFrame ? '✅ PASS' : '❌ FAIL'} (예상: ${expectedBottomY}mm)`);
    
    // 왼쪽 벽과의 거리
    const leftDistance = bound.minX;
    console.log(`    - 왼쪽 벽과의 거리: ${leftDistance}mm`);
    
    // 오른쪽 벽과의 거리
    const rightDistance = spaceInfo.width - bound.maxX;
    console.log(`    - 오른쪽 벽과의 거리: ${rightDistance}mm`);
  });
  
  console.log('\n=' .repeat(60));
  console.log('\n✅ AC (Acceptance Criteria) 검증:');
  console.log('1. 비대칭 공간에서 좌우 벽과의 상대 위치가 3D와 일치: 수동 확인 필요');
  console.log('2. 받침대가 있을 때 가구 하부가 base 높이만큼 상승: ' + 
    (furnitureBounds.every(b => Math.abs(b.minY - (spaceInfo.baseConfig?.height || 0)) < 5) ? '✅ PASS' : '❌ FAIL'));
}

/**
 * 메인 실행
 */
function main() {
  console.log('🔴 [DXF-SPECIALIST] STEP-3 좌표계 검증 시작\n');
  
  const dxfPath = process.argv[2];
  
  if (!dxfPath) {
    console.log('📋 테스트용 비대칭 공간 샘플 생성 중...\n');
    
    // 여기서는 실제 DXF 생성 대신 검증 로직만 테스트
    console.log('DXF 파일 경로를 제공하세요:');
    console.log('사용법: node test-dxf-coordinates.js <dxf-file-path>');
    console.log('\n예시 테스트 데이터:');
    console.log(JSON.stringify(asymmetricSpaceSample, null, 2));
    return;
  }
  
  if (!fs.existsSync(dxfPath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${dxfPath}`);
    return;
  }
  
  const dxfContent = fs.readFileSync(dxfPath, 'utf8');
  const coordinates = extractCoordinatesFromDXF(dxfContent);
  
  console.log(`📄 DXF 파일 분석: ${path.basename(dxfPath)}`);
  console.log(`  - 가구 엔티티: ${coordinates.furniture.length}개`);
  console.log(`  - 치수 엔티티: ${coordinates.dimensions.length}개`);
  console.log(`  - Base Frame 엔티티: ${coordinates.baseFrame.length}개`);
  
  validateCoordinates(coordinates, asymmetricSpaceSample);
}

main();