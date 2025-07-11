import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { SpaceCalculator } from './SpaceCalculator';
import { calculateFrameThickness } from '../../viewer3d/utils/geometry';

/**
 * 컬럼 인덱싱 계산 결과 타입
 */
export interface SpaceIndexingResult {
  columnCount: number;            // 슬롯(컬럼) 개수
  columnPositions: number[];      // 각 슬롯 중심의 mm 단위 X좌표 배열
  threeUnitPositions: number[];   // 각 슬롯 중심의 Three.js 단위 X좌표 배열
  columnBoundaries: number[];     // 각 슬롯 경계의 mm 단위 X좌표 배열
  threeUnitBoundaries: number[];  // 각 슬롯 경계의 Three.js 단위 X좌표 배열
  dualColumnPositions: number[];  // 듀얼가구용 두 컬럼 경계 중심의 mm 단위 X좌표 배열
  threeUnitDualPositions: number[]; // 듀얼가구용 두 컬럼 경계 중심의 Three.js 단위 X좌표 배열
  columnWidth: number;            // 각 슬롯의 너비 (mm)
  internalWidth: number;          // 내경 너비 (mm)
  internalStartX: number;         // 내경 시작 X좌표 (mm)
  threeUnitColumnWidth: number;   // Three.js 단위 슬롯 너비
}

/**
 * 컬럼 인덱싱 계산 관련 유틸리티 클래스
 * 공간 내 슬롯 위치 계산, 가장 가까운 컬럼 찾기 등을 담당
 */
export class ColumnIndexer {
  /**
   * 공간 내경에 따른 슬롯(컬럼) 인덱싱 계산
   * - 내경 600mm 이하: 1개 슬롯
   * - 내경 600mm 초과: 균등 분할된 N개 슬롯
   * - customColumnCount가 설정된 경우 해당 값 우선 사용
   */
  static calculateSpaceIndexing(spaceInfo: SpaceInfo): SpaceIndexingResult {
    // 프레임 두께 계산 (surroundType, frameSize 등 고려)
    const frameThickness = calculateFrameThickness(spaceInfo);
    
    // 전체 폭과 내경 계산
    const totalWidth = spaceInfo.width;
    
    // 내경 계산: 노서라운드인 경우 이격거리 고려, 서라운드인 경우 프레임 두께 고려
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
    
    // 컬럼 수 결정 로직
    let columnCount: number;
    
    if (spaceInfo.customColumnCount) {
      // 사용자 지정 컬럼 수가 있으면 우선 사용
      columnCount = spaceInfo.customColumnCount;
    } else {
      // 기존 자동 계산 로직
      columnCount = SpaceCalculator.getDefaultColumnCount(internalWidth);
    }
    
    // 각 컬럼의 너비 (균등 분할) - Math.floor 사용하여 내경 초과 방지
    const columnWidth = Math.floor(internalWidth / columnCount);
    
    // 여유 공간 계산 (내경 너비 - 실제 사용 너비)
    const remainingSpace = internalWidth - (columnWidth * columnCount);
    
    // 여유 공간을 좌우에 균등 배분
    const leftPadding = Math.floor(remainingSpace / 2);
    
    // 내경의 시작 X좌표 (Three.js 좌표계, 중앙이 0)
    // 전체 공간이 중앙 정렬되므로 (-전체폭/2 + 좌측여백)가 내경 시작점
    let internalStartX;
    if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig) {
      // 노서라운드: 이격거리 + 좌측 패딩 고려
      internalStartX = -(totalWidth / 2) + spaceInfo.gapConfig.size + leftPadding;
    } else {
      // 서라운드: 좌측 프레임 두께 + 좌측 패딩 고려
      internalStartX = -(totalWidth / 2) + frameThickness.left + leftPadding;
    }
    
    // 각 컬럼 경계의 위치 계산 (시작부터 끝까지)
    const columnBoundaries = [];
    for (let i = 0; i <= columnCount; i++) {
      const boundary = internalStartX + (i * columnWidth);
      columnBoundaries.push(boundary);
    }
    
    // 각 슬롯(컬럼)의 중심 위치 계산
    const columnPositions = [];
    for (let i = 0; i < columnCount; i++) {
      // 각 컬럼의 시작 위치
      const columnStart = columnBoundaries[i];
      // 각 컬럼의 중심 위치
      const columnCenter = columnStart + (columnWidth / 2);
      columnPositions.push(columnCenter);
    }
    
    // Three.js 단위로 변환된 값들도 함께 제공
    const threeUnitPositions = columnPositions.map(pos => SpaceCalculator.mmToThreeUnits(pos));
    const threeUnitBoundaries = columnBoundaries.map(pos => SpaceCalculator.mmToThreeUnits(pos));
    
    // 노서라운드 모드에서 디버깅 로그
    if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig) {
      console.log(`🎯 [가구위치] 이격거리${spaceInfo.gapConfig.size}mm: 내경시작X=${internalStartX}, 첫번째컬럼=${threeUnitPositions[0]?.toFixed(3)}`);
    }
    
    // 듀얼가구용 두 컬럼 경계 중심 위치 계산 추가
    const dualColumnPositions = [];
    const threeUnitDualPositions = [];
    
    // 인접한 두 컬럼의 중심점들 사이의 중점을 계산 (첫 번째 컬럼 중심과 두 번째 컬럼 중심 사이, 두 번째와 세 번째 사이, ...)
    for (let i = 0; i < columnCount - 1; i++) {
      const leftColumnCenter = columnPositions[i];     // 왼쪽 컬럼의 중심
      const rightColumnCenter = columnPositions[i + 1]; // 오른쪽 컬럼의 중심
      const dualCenterPosition = (leftColumnCenter + rightColumnCenter) / 2; // 두 컬럼 중심의 중점
      dualColumnPositions.push(dualCenterPosition);
      threeUnitDualPositions.push(SpaceCalculator.mmToThreeUnits(dualCenterPosition));
    }
    
    return {
      columnCount,            // 슬롯(컬럼) 개수
      columnPositions,        // 각 슬롯 중심의 mm 단위 X좌표 배열
      threeUnitPositions,     // 각 슬롯 중심의 Three.js 단위 X좌표 배열
      columnBoundaries,       // 각 슬롯 경계의 mm 단위 X좌표 배열
      threeUnitBoundaries,    // 각 슬롯 경계의 Three.js 단위 X좌표 배열
      dualColumnPositions,    // 듀얼가구용 두 컬럼 경계 중심의 mm 단위 X좌표 배열
      threeUnitDualPositions, // 듀얼가구용 두 컬럼 경계 중심의 Three.js 단위 X좌표 배열
      columnWidth,            // 각 슬롯의 너비 (mm)
      internalWidth,          // 내경 너비 (mm)
      internalStartX,         // 내경 시작 X좌표 (mm)
      threeUnitColumnWidth: SpaceCalculator.mmToThreeUnits(columnWidth) // Three.js 단위 슬롯 너비
    };
  }

  /**
   * 주어진 위치(Three.js 좌표)에 가장 가까운 컬럼 인덱스 찾기
   */
  static findClosestColumnIndex(position: { x: number }, indexing: SpaceIndexingResult): number {
    const { threeUnitPositions, threeUnitBoundaries, columnCount } = indexing;
    
    // 위치가 범위를 벗어났는지 확인
    const leftmostBoundary = threeUnitBoundaries[0];
    const rightmostBoundary = threeUnitBoundaries[columnCount];
    
    if (position.x < leftmostBoundary) {
      console.log(`위치 (${position.x.toFixed(2)})가 왼쪽 경계 (${leftmostBoundary.toFixed(2)}) 밖에 있습니다. 첫 번째 컬럼 선택.`);
      return 0;
    }
    
    if (position.x > rightmostBoundary) {
      console.log(`위치 (${position.x.toFixed(2)})가 오른쪽 경계 (${rightmostBoundary.toFixed(2)}) 밖에 있습니다. 마지막 컬럼 선택.`);
      return columnCount - 1;
    }
    
    // 각 컬럼 내부 위치 확인 (경계 사이에 있는지)
    for (let i = 0; i < columnCount; i++) {
      const leftBoundary = threeUnitBoundaries[i];
      const rightBoundary = threeUnitBoundaries[i + 1];
      
      if (position.x >= leftBoundary && position.x <= rightBoundary) {
        console.log(`위치 (${position.x.toFixed(2)})가 컬럼 ${i + 1} 내부에 있습니다. 경계: [${leftBoundary.toFixed(2)}, ${rightBoundary.toFixed(2)}]`);
        return i;
      }
    }
    
    // 위의 경계 체크에서 결정되지 않은 경우, 거리 기준으로 선택
    let closestIndex = 0;
    let minDistance = Number.MAX_VALUE;
    
    // 디버깅을 위한 거리 배열
    const distances = threeUnitPositions.map((columnX, index) => {
      const distance = Math.abs(position.x - columnX);
      return { index, columnX, distance };
    });
    
    // 거리 정보 로깅
    console.log('컬럼 거리 계산:', 
      distances.map(d => `컬럼 ${d.index + 1}: ${d.distance.toFixed(4)} (위치: ${d.columnX.toFixed(2)})`).join(', ')
    );
    
    // 가장 가까운 컬럼 찾기
    distances.forEach(({ index, distance }) => {
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });
    
    console.log(`가장 가까운 컬럼: ${closestIndex + 1} (거리: ${minDistance.toFixed(4)})`);
    return closestIndex;
  }

  /**
   * 배치된 가구의 슬롯 인덱스를 찾는 함수
   */
  static findSlotIndexFromPosition(
    position: { x: number; y: number; z: number }, 
    indexing: SpaceIndexingResult,
    isDualFurniture: boolean = false
  ): number {
    // Three.js 좌표 (position.x)를 기준으로 슬롯 찾기
    // Math.floor 기반 계산에서 허용 오차를 0.1로 설정
    const tolerance = 0.1;
    
    if (isDualFurniture && indexing.threeUnitDualPositions) {
      // 듀얼 가구: threeUnitDualPositions에서 찾기
      return indexing.threeUnitDualPositions.findIndex(pos => 
        Math.abs(pos - position.x) < tolerance
      );
    } else {
      // 싱글 가구: threeUnitPositions에서 찾기
      return indexing.threeUnitPositions.findIndex(pos => 
        Math.abs(pos - position.x) < tolerance
      );
    }
  }
} 