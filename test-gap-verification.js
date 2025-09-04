// 이격거리 적용 검증 테스트

const SpaceCalculator = {
  calculateDroppedZoneInternalWidth: function(spaceInfo) {
    if (!spaceInfo.droppedCeiling?.enabled) return null;
    
    const droppedWidth = spaceInfo.droppedCeiling.width || 900;
    const END_PANEL_THICKNESS = 18;
    let leftReduction = 0;
    let rightReduction = 0;
    
    if (spaceInfo.surroundType === 'no-surround') {
      // 단내림 영역의 위치 확인
      const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
      
      if (droppedPosition === 'left') {
        // 단내림이 왼쪽에 있을 때
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          leftReduction = spaceInfo.gapConfig?.left || 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          if (spaceInfo.wallConfig?.left) {
            leftReduction = spaceInfo.gapConfig?.left || 0;
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }
        } else {
          leftReduction = END_PANEL_THICKNESS;
        }
        // 오른쪽은 항상 단내림-일반 경계이므로 reduction 없음
        rightReduction = 0;
      } else {
        // 단내림이 오른쪽에 있을 때
        leftReduction = 0; // 왼쪽은 항상 일반-단내림 경계
        
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          rightReduction = spaceInfo.gapConfig?.right || 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          if (spaceInfo.wallConfig?.right) {
            rightReduction = spaceInfo.gapConfig?.right || 0;
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        } else {
          rightReduction = END_PANEL_THICKNESS;
        }
      }
    }
    
    return {
      외부너비: droppedWidth,
      내부너비: droppedWidth - leftReduction - rightReduction,
      leftReduction,
      rightReduction,
      설명: `왼쪽: ${leftReduction}mm 감소, 오른쪽: ${rightReduction}mm 감소`
    };
  },
  
  calculateNormalZoneInternalWidth: function(spaceInfo) {
    const totalWidth = spaceInfo.width || 3000;
    const droppedWidth = spaceInfo.droppedCeiling?.enabled ? (spaceInfo.droppedCeiling.width || 900) : 0;
    const normalWidth = totalWidth - droppedWidth;
    const END_PANEL_THICKNESS = 18;
    
    let leftReduction = 0;
    let rightReduction = 0;
    
    if (spaceInfo.surroundType === 'no-surround') {
      const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
      
      if (droppedPosition === 'left') {
        // 일반 영역이 오른쪽에 있을 때
        leftReduction = 0; // 왼쪽은 단내림과의 경계
        
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          rightReduction = spaceInfo.gapConfig?.right || 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          if (spaceInfo.wallConfig?.right) {
            rightReduction = spaceInfo.gapConfig?.right || 0;
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        } else {
          rightReduction = END_PANEL_THICKNESS;
        }
      } else {
        // 일반 영역이 왼쪽에 있을 때
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          leftReduction = spaceInfo.gapConfig?.left || 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          if (spaceInfo.wallConfig?.left) {
            leftReduction = spaceInfo.gapConfig?.left || 0;
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }
        } else {
          leftReduction = END_PANEL_THICKNESS;
        }
        
        rightReduction = 0; // 오른쪽은 단내림과의 경계
      }
    }
    
    return {
      외부너비: normalWidth,
      내부너비: normalWidth - leftReduction - rightReduction,
      leftReduction,
      rightReduction,
      설명: `왼쪽: ${leftReduction}mm 감소, 오른쪽: ${rightReduction}mm 감소`
    };
  }
};

// 테스트 케이스
const testCase = {
  width: 3000,
  surroundType: 'no-surround',
  installType: 'semistanding',
  wallConfig: { left: true, right: false },
  gapConfig: { left: 100, right: 0 },  // 왼쪽 벽에 100mm 이격거리
  droppedCeiling: {
    enabled: true,
    width: 900,
    position: 'left'
  }
};

console.log('\n=== 노서라운드 세미스탠딩 이격거리 테스트 ===');
console.log('설정:', {
  '전체 너비': testCase.width,
  '설치 타입': testCase.installType,
  '벽 설정': testCase.wallConfig,
  '이격거리': testCase.gapConfig,
  '단내림': testCase.droppedCeiling
});

const droppedResult = SpaceCalculator.calculateDroppedZoneInternalWidth(testCase);
const normalResult = SpaceCalculator.calculateNormalZoneInternalWidth(testCase);

console.log('\n=== 계산 결과 ===');
console.log('단내림 영역 (왼쪽):', droppedResult);
console.log('일반 영역 (오른쪽):', normalResult);

console.log('\n=== 검증 ===');
console.log('단내림 영역이 왼쪽 벽의 이격거리 100mm를 적용했는가?', droppedResult.leftReduction === 100 ? '✅ 성공' : '❌ 실패');
console.log('일반 영역이 오른쪽 엔드패널 18mm를 적용했는가?', normalResult.rightReduction === 18 ? '✅ 성공' : '❌ 실패');