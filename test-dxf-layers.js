/**
 * DXF 레이어 분리 테스트 스크립트
 * DXF 파일의 레이어별 엔티티 분포를 검증합니다.
 */

const fs = require('fs');

// DXF 파일에서 레이어별 엔티티 카운트를 분석하는 함수
function analyzeDXFLayers(dxfContent) {
  const lines = dxfContent.split('\n');
  let currentLayer = '0'; // 기본 레이어
  const layerCounts = {
    '0': 0,
    'FURNITURE': 0,
    'DIMENSIONS': 0,
    'TEXT': 0
  };
  
  // 각 엔티티 타입별 카운트
  const entityTypes = {
    'LINE': { '0': 0, 'FURNITURE': 0, 'DIMENSIONS': 0, 'TEXT': 0 },
    'TEXT': { '0': 0, 'FURNITURE': 0, 'DIMENSIONS': 0, 'TEXT': 0 },
    'CIRCLE': { '0': 0, 'FURNITURE': 0, 'DIMENSIONS': 0, 'TEXT': 0 },
    'ARC': { '0': 0, 'FURNITURE': 0, 'DIMENSIONS': 0, 'TEXT': 0 }
  };
  
  let currentEntity = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    
    // 엔티티 섹션 찾기
    if (line === '0' && ['LINE', 'TEXT', 'CIRCLE', 'ARC'].includes(nextLine)) {
      currentEntity = nextLine;
    }
    
    // 레이어 정보 찾기 (코드 8)
    if (line === '8' && currentEntity) {
      const layerName = nextLine;
      if (layerCounts.hasOwnProperty(layerName)) {
        layerCounts[layerName]++;
        if (entityTypes[currentEntity]) {
          entityTypes[currentEntity][layerName]++;
        }
      }
      currentEntity = null;
    }
  }
  
  return { layerCounts, entityTypes };
}

// 테스트 실행
function runTest() {
  console.log('\n===== DXF 레이어 분리 검증 테스트 =====\n');
  
  // 샘플 DXF 내용 (실제 생성된 DXF로 대체 필요)
  const sampleDXF = `
0
SECTION
2
ENTITIES
0
LINE
8
FURNITURE
10
0
20
0
30
0
11
100
21
0
31
0
0
LINE
8
DIMENSIONS
10
-100
20
0
30
0
11
-100
21
100
31
0
0
TEXT
8
TEXT
10
50
20
50
30
0
40
20
1
Test Text
0
ENDSEC
0
EOF
`;
  
  const result = analyzeDXFLayers(sampleDXF);
  
  console.log('📊 레이어별 엔티티 분포:');
  console.log('--------------------------------');
  Object.entries(result.layerCounts).forEach(([layer, count]) => {
    console.log(`${layer.padEnd(15)}: ${count} 엔티티`);
  });
  
  console.log('\n📈 엔티티 타입별 레이어 분포:');
  console.log('--------------------------------');
  Object.entries(result.entityTypes).forEach(([entityType, layers]) => {
    console.log(`${entityType}:`);
    Object.entries(layers).forEach(([layer, count]) => {
      if (count > 0) {
        console.log(`  - ${layer}: ${count}`);
      }
    });
  });
  
  // 검증 결과
  console.log('\n✅ 검증 결과:');
  console.log('--------------------------------');
  
  const layer0Count = result.layerCounts['0'];
  const furnitureCount = result.layerCounts['FURNITURE'];
  const dimensionsCount = result.layerCounts['DIMENSIONS'];
  const textCount = result.layerCounts['TEXT'];
  
  const tests = [
    {
      name: 'FURNITURE 레이어 사용',
      passed: furnitureCount > 0,
      message: furnitureCount > 0 ? '✓ FURNITURE 레이어에 엔티티 존재' : '✗ FURNITURE 레이어가 비어있음'
    },
    {
      name: 'DIMENSIONS 레이어 사용',
      passed: dimensionsCount > 0,
      message: dimensionsCount > 0 ? '✓ DIMENSIONS 레이어에 엔티티 존재' : '✗ DIMENSIONS 레이어가 비어있음'
    },
    {
      name: 'TEXT 레이어 사용',
      passed: textCount > 0,
      message: textCount > 0 ? '✓ TEXT 레이어에 엔티티 존재' : '✗ TEXT 레이어가 비어있음'
    },
    {
      name: '기본 레이어 최소 사용',
      passed: layer0Count === 0 || layer0Count < (furnitureCount + dimensionsCount + textCount) / 3,
      message: layer0Count === 0 ? '✓ 기본 레이어(0)에 엔티티 없음' : 
               layer0Count < (furnitureCount + dimensionsCount + textCount) / 3 ? 
               '✓ 기본 레이어(0) 사용 최소화됨' : '✗ 기본 레이어(0)에 너무 많은 엔티티'
    }
  ];
  
  tests.forEach(test => {
    console.log(`${test.passed ? '✅' : '❌'} ${test.message}`);
  });
  
  const allPassed = tests.every(t => t.passed);
  
  console.log('\n================================');
  console.log(allPassed ? '🎉 모든 테스트 통과!' : '⚠️  일부 테스트 실패');
  console.log('================================\n');
  
  return allPassed;
}

// 명령줄에서 DXF 파일 경로를 받을 수 있도록
if (process.argv[2]) {
  const dxfPath = process.argv[2];
  if (fs.existsSync(dxfPath)) {
    const dxfContent = fs.readFileSync(dxfPath, 'utf8');
    const result = analyzeDXFLayers(dxfContent);
    // 결과 출력 로직...
  } else {
    console.error(`파일을 찾을 수 없습니다: ${dxfPath}`);
  }
} else {
  // 샘플 테스트 실행
  runTest();
}

module.exports = { analyzeDXFLayers };