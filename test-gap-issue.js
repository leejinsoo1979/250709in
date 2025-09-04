// 테스트: 단내림 + 한쪽벽 + 이격거리 문제 확인

const SpaceCalculator = {
  calculateDroppedZoneInternalWidth: function(spaceInfo) {
    if (!spaceInfo.droppedCeiling?.enabled) return null;
    
    const droppedWidth = spaceInfo.droppedCeiling.width || 900;
    const isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
    
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      let rightReduction = 0;
      const { wallConfig, gapConfig, installType } = spaceInfo;
      
      if (isLeftDropped) {
        // 왼쪽 단내림: 단내림 영역은 왼쪽에 위치
        if (installType === 'builtin') {
          leftReduction = gapConfig?.left || 0;
        } else if (installType === 'semistanding') {
          if (wallConfig?.left) {
            leftReduction = gapConfig?.left || 0;
          } else {
            leftReduction = 18; // END_PANEL_THICKNESS
          }
        } else {
          leftReduction = 18;
        }
        rightReduction = 0; // 단내림 경계이므로 reduction 없음
      } else {
        // 오른쪽 단내림: 일반 영역 끝과 오른쪽 끝 사이
        leftReduction = 0; // 일반 영역 경계이므로 reduction 없음
        if (installType === 'builtin') {
          rightReduction = gapConfig?.right || 0;
        } else if (installType === 'semistanding') {
          if (wallConfig?.right) {
            rightReduction = gapConfig?.right || 0;
          } else {
            rightReduction = 18;
          }
        } else {
          rightReduction = 18;
        }
      }
      
      return droppedWidth - leftReduction - rightReduction;
    }
    return droppedWidth; // 서라운드 모드는 생략
  },
  
  calculateNormalZoneInternalWidth: function(spaceInfo) {
    const droppedWidth = spaceInfo.droppedCeiling.width || 900;
    const normalWidth = spaceInfo.width - droppedWidth;
    const isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
    
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      let rightReduction = 0;
      const { wallConfig, gapConfig, installType } = spaceInfo;
      
      if (isLeftDropped) {
        // 왼쪽 단내림: 일반 영역은 오른쪽에 위치
        leftReduction = 0; // 단내림 경계이므로 reduction 없음
        if (installType === 'builtin') {
          rightReduction = gapConfig?.right || 0;
        } else if (installType === 'semistanding') {
          if (wallConfig?.right) {
            rightReduction = gapConfig?.right || 0;
          } else {
            rightReduction = 18;
          }
        } else {
          rightReduction = 18;
        }
      } else {
        // 오른쪽 단내림: 일반 영역은 왼쪽에 위치
        if (installType === 'builtin') {
          leftReduction = gapConfig?.left || 0;
        } else if (installType === 'semistanding') {
          if (wallConfig?.left) {
            leftReduction = gapConfig?.left || 0;
          } else {
            leftReduction = 18;
          }
        } else {
          leftReduction = 18;
        }
        rightReduction = 0; // 단내림 경계이므로 reduction 없음
      }
      
      return normalWidth - leftReduction - rightReduction;
    }
    return normalWidth; // 서라운드 모드는 생략
  }
};

// 테스트 케이스
const testCase = {
  width: 3000,
  surroundType: 'no-surround',
  installType: 'semistanding',
  wallConfig: { left: true, right: false }, // 왼쪽만 벽
  gapConfig: { left: 50, right: 0 },
  droppedCeiling: {
    enabled: true,
    width: 900,
    position: 'left'
  }
};

console.log('=== 테스트 케이스 ===');
console.log('전체 너비:', testCase.width);
console.log('설치 타입:', testCase.installType);
console.log('벽 설정:', testCase.wallConfig);
console.log('이격거리:', testCase.gapConfig);
console.log('단내림:', testCase.droppedCeiling);

const droppedInternalWidth = SpaceCalculator.calculateDroppedZoneInternalWidth(testCase);
const normalInternalWidth = SpaceCalculator.calculateNormalZoneInternalWidth(testCase);

console.log('\n=== 계산 결과 ===');
console.log('단내림 영역 외부 너비:', testCase.droppedCeiling.width);
console.log('단내림 영역 내부 너비:', droppedInternalWidth);
console.log('일반 영역 외부 너비:', testCase.width - testCase.droppedCeiling.width);
console.log('일반 영역 내부 너비:', normalInternalWidth);

console.log('\n=== 슬롯 계산 (2개씩) ===');
console.log('단내림 영역 슬롯 너비:', Math.floor(droppedInternalWidth / 2));
console.log('일반 영역 슬롯 너비:', Math.floor(normalInternalWidth / 2));

console.log('\n=== 예상 동작 ===');
console.log('단내림 영역(왼쪽): 왼쪽 벽이 있으므로 50mm 이격거리 적용');
console.log('  900mm - 50mm(이격) - 0mm = 850mm');
console.log('일반 영역(오른쪽): 오른쪽 벽이 없으므로 엔드패널 18mm 적용');
console.log('  2100mm - 0mm - 18mm(엔드패널) = 2082mm');