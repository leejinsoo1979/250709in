// 노서라운드 + 단내림 + 한쪽벽 테스트

import { SpaceCalculator } from './src/editor/shared/utils/indexing/SpaceCalculator.ts';
import { ColumnIndexer } from './src/editor/shared/utils/indexing/ColumnIndexer.ts';

// 테스트 케이스: 노서라운드 + 세미스탠딩 + 왼쪽벽 + 단내림
const testCase = {
  width: 3000,
  surroundType: 'no-surround',
  installType: 'semistanding',
  wallConfig: { left: true, right: false },
  gapConfig: { left: 50, right: 0 },
  droppedCeiling: {
    enabled: true,
    width: 900,
    position: 'left'
  },
  mainDoorCount: 6,  // 일반 영역 슬롯 수
  droppedCeilingDoorCount: 2  // 단내림 영역 슬롯 수
};

console.log('\n=== 노서라운드 + 단내림 + 한쪽벽 테스트 ===');
console.log('설정:', testCase);

// SpaceCalculator로 영역별 내경 계산
const droppedInternalWidth = SpaceCalculator.calculateDroppedZoneInternalWidth(testCase);
const normalInternalWidth = SpaceCalculator.calculateNormalZoneInternalWidth(testCase);

console.log('\n=== SpaceCalculator 계산 결과 ===');
console.log('단내림 영역 내경:', droppedInternalWidth);
console.log('일반 영역 내경:', normalInternalWidth);

// ColumnIndexer로 영역별 정보 계산
const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(testCase);

console.log('\n=== ColumnIndexer 계산 결과 ===');
console.log('단내림 영역:', zoneInfo.dropped);
console.log('일반 영역:', zoneInfo.normal);

// 검증
if (zoneInfo.dropped) {
  const droppedSlotWidth = zoneInfo.dropped.slotWidths[0];
  const expectedDroppedSlotWidth = Math.floor(850 / 2); // 850mm(이격거리 50mm 반영) / 2개
  console.log('\n=== 단내림 영역 검증 ===');
  console.log('실제 슬롯 너비:', droppedSlotWidth);
  console.log('예상 슬롯 너비:', expectedDroppedSlotWidth);
  console.log('일치 여부:', droppedSlotWidth === expectedDroppedSlotWidth ? '✅' : '❌');
}

if (zoneInfo.normal) {
  const normalSlotWidth = zoneInfo.normal.slotWidths[0];
  const expectedNormalSlotWidth = Math.floor(2082 / 6); // 2082mm(엔드패널 18mm 반영) / 6개
  console.log('\n=== 일반 영역 검증 ===');
  console.log('실제 슬롯 너비:', normalSlotWidth);
  console.log('예상 슬롯 너비:', expectedNormalSlotWidth);
  console.log('일치 여부:', normalSlotWidth === expectedNormalSlotWidth ? '✅' : '❌');
}