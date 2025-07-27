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
  zones?: {                       // 영역별 슬롯 정보 (단내림 활성화 시)
    normal: {
      startX: number;
      width: number;
      columnCount: number;
      columnWidth: number;
    };
    dropped: {
      startX: number;
      width: number;
      columnCount: number;
      columnWidth: number;
    } | null;
  };
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
    if (!spaceInfo) {
      return {
        columnCount: 0,
        columnPositions: [],
        threeUnitPositions: [],
        columnBoundaries: [],
        threeUnitBoundaries: [],
        dualColumnPositions: [],
        threeUnitDualPositions: [],
        columnWidth: 0,
        internalWidth: 0,
        internalStartX: 0,
        threeUnitColumnWidth: 0
      };
    }
    
    // 단내림이 활성화된 경우에도 전체 영역 정보는 유지하되, zones에 영역별 정보 추가
    if (spaceInfo.droppedCeiling?.enabled) {
      // 전체 영역에 대한 기본 계산 수행
      const totalWidth = spaceInfo.width;
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
      const frameThickness = calculateFrameThickness(spaceInfo);
      
      // 전체 영역의 시작점
      let internalStartX;
      if (spaceInfo.surroundType === 'no-surround') {
        let leftReduction = 0;
        
        if (spaceInfo.installType === 'builtin') {
          leftReduction = 2;
        } else if (spaceInfo.installType === 'semistanding') {
          if (spaceInfo.wallConfig?.left) {
            leftReduction = 2;
          } else {
            leftReduction = 20;
          }
        } else {
          leftReduction = 20;
        }
        
        internalStartX = -(totalWidth / 2) + leftReduction;
      } else {
        internalStartX = -(totalWidth / 2) + frameThickness.left;
      }
      
      // 전체 영역의 컬럼 수 (호환성을 위해 유지)
      let columnCount;
      if (spaceInfo.customColumnCount) {
        columnCount = spaceInfo.customColumnCount;
      } else {
        columnCount = SpaceCalculator.getDefaultColumnCount(internalWidth);
      }
      
      // 전체 영역 기준 컬럼 너비
      const columnWidth = Math.floor(internalWidth / columnCount);
      
      // 전체 영역의 경계와 위치 (호환성을 위해 유지)
      const columnBoundaries = [];
      const columnPositions = [];
      for (let i = 0; i <= columnCount; i++) {
        columnBoundaries.push(internalStartX + (i * columnWidth));
      }
      for (let i = 0; i < columnCount; i++) {
        columnPositions.push(internalStartX + (i * columnWidth) + (columnWidth / 2));
      }
      
      // Three.js 단위 변환
      const threeUnitPositions = columnPositions.map(pos => SpaceCalculator.mmToThreeUnits(pos));
      const threeUnitBoundaries = columnBoundaries.map(pos => SpaceCalculator.mmToThreeUnits(pos));
      
      // 듀얼 가구용 위치
      const dualColumnPositions = [];
      const threeUnitDualPositions = [];
      
      // 영역별 정보 추가
      const zones = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      
      return {
        columnCount,
        columnPositions,
        threeUnitPositions,
        columnBoundaries,
        threeUnitBoundaries,
        dualColumnPositions,
        threeUnitDualPositions,
        columnWidth,
        internalWidth,
        internalStartX,
        threeUnitColumnWidth: SpaceCalculator.mmToThreeUnits(columnWidth),
        zones
      };
    }
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
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      
      // 노서라운드: 프레임 없음, 벽 유무에 따라 이격거리 또는 엔드패널
      if (spaceInfo.installType === 'builtin') {
        // 양쪽벽: 2mm 이격거리
        leftReduction = 2;
      } else if (spaceInfo.installType === 'semistanding') {
        // 한쪽벽: 벽 있는 쪽 2mm, 벽 없는 쪽 20mm
        if (spaceInfo.wallConfig?.left) {
          leftReduction = 2;  // 좌측벽 있음: 2mm 이격거리
        } else {
          leftReduction = 20; // 좌측벽 없음: 20mm 엔드패널
        }
      } else {
        // 벽없음(freestanding): 20mm 엔드패널
        leftReduction = 20;
      }
      
      internalStartX = -(totalWidth / 2) + leftReduction + leftPadding;
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
    
    // 노서라운드 모드에서 디버깅 로그 (개발 모드에서만 출력)
    // if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && import.meta.env.DEV) {
    //   console.log(`🎯 [가구위치] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 내경시작X=${internalStartX}, 첫번째컬럼=${threeUnitPositions[0]?.toFixed(3)}`);
    // }
    
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
      if (import.meta.env.DEV) {
        console.log(`위치 (${position.x.toFixed(2)})가 왼쪽 경계 (${leftmostBoundary.toFixed(2)}) 밖에 있습니다. 첫 번째 컬럼 선택.`);
      }
      return 0;
    }
    
    if (position.x > rightmostBoundary) {
      if (import.meta.env.DEV) {
        console.log(`위치 (${position.x.toFixed(2)})가 오른쪽 경계 (${rightmostBoundary.toFixed(2)}) 밖에 있습니다. 마지막 컬럼 선택.`);
      }
      return columnCount - 1;
    }
    
    // 각 컬럼 내부 위치 확인 (경계 사이에 있는지)
    for (let i = 0; i < columnCount; i++) {
      const leftBoundary = threeUnitBoundaries[i];
      const rightBoundary = threeUnitBoundaries[i + 1];
      
      if (position.x >= leftBoundary && position.x <= rightBoundary) {
        if (import.meta.env.DEV) {
          console.log(`위치 (${position.x.toFixed(2)})가 컬럼 ${i + 1} 내부에 있습니다. 경계: [${leftBoundary.toFixed(2)}, ${rightBoundary.toFixed(2)}]`);
        }
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
    
    // 거리 정보 로깅 (개발 모드에서만)
    if (import.meta.env.DEV) {
      console.log('컬럼 거리 계산:', 
        distances.map(d => `컬럼 ${d.index + 1}: ${d.distance.toFixed(4)} (위치: ${d.columnX.toFixed(2)})`).join(', ')
      );
    }
    
    // 가장 가까운 컬럼 찾기
    distances.forEach(({ index, distance }) => {
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });
    
    if (import.meta.env.DEV) {
      console.log(`가장 가까운 컬럼: ${closestIndex + 1} (거리: ${minDistance.toFixed(4)})`);
    }
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

  /**
   * 단내림 영역별 슬롯 정보 계산
   */
  static calculateZoneSlotInfo(spaceInfo: SpaceInfo, customColumnCount?: number) {
    const frameThickness = calculateFrameThickness(spaceInfo);
    
    if (!spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 비활성화된 경우 전체 영역을 일반 영역으로 반환
      const indexing = this.calculateSpaceIndexing(spaceInfo);
      return {
        normal: {
          startX: indexing.internalStartX,
          width: indexing.internalWidth,
          columnCount: indexing.columnCount,
          columnWidth: indexing.columnWidth
        },
        dropped: null
      };
    }
    
    // 단내림이 활성화된 경우 영역 분리
    const totalWidth = spaceInfo.width;
    const droppedWidth = spaceInfo.droppedCeiling.width || 900;
    const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
    
    // PDF 공식에 따른 영역 너비 계산
    let normalAreaWidth: number; // 메인구간 너비
    let droppedAreaWidth: number; // 단내림구간 너비
    let normalStartX: number; // 메인구간 시작점
    let droppedStartX: number; // 단내림구간 시작점
    
    // 전체 공간 중심점 (원점 기준)
    const xOffset = -totalWidth / 2;
    
    if (spaceInfo.surroundType === 'surround') {
      // 서라운드: 프레임 안쪽에서 시작
      if (spaceInfo.installType === 'builtin') {
        // 빌트인: 양쪽 프레임 50mm씩, 메인구간은 빨간선까지 확장
        normalAreaWidth = totalWidth - droppedWidth - 50; // 메인구간은 단내림 경계까지
        droppedAreaWidth = droppedWidth - 50; // 단내림구간은 오른쪽 프레임까지
        
        if (droppedPosition === 'left') {
          droppedStartX = xOffset + 50; // 왼쪽 프레임 안쪽
          normalStartX = xOffset + droppedWidth; // 천장 분절라인 (빨간선 위치)
        } else {
          normalStartX = xOffset + 50; // 왼쪽 프레임 안쪽
          droppedStartX = xOffset + (totalWidth - droppedWidth); // 천장 분절라인 (빨간선 위치)
        }
      } else if (spaceInfo.installType === 'semistanding') {
        // 세미스탠딩: 벽쪽 프레임 50mm, 엔드패널쪽 20mm
        if (spaceInfo.wallConfig?.left) {
          // 왼쪽 벽: 50 + ... + 20, 메인구간은 빨간선까지 확장
          normalAreaWidth = totalWidth - droppedWidth - 50; // 메인구간은 단내림 경계까지
          droppedAreaWidth = droppedWidth - 20; // 단내림구간은 오른쪽 엔드패널까지
          
          if (droppedPosition === 'left') {
            droppedStartX = xOffset + 50; // 왼쪽 프레임 안쪽
            normalStartX = xOffset + droppedWidth; // 천장 분절라인 (빨간선 위치)
          } else {
            normalStartX = xOffset + 50; // 왼쪽 프레임 안쪽
            droppedStartX = xOffset + (totalWidth - droppedWidth); // 천장 분절라인 (빨간선 위치)
          }
        } else {
          // 오른쪽 벽: 20 + ... + 50, 메인구간은 빨간선까지 확장
          normalAreaWidth = totalWidth - droppedWidth - 20; // 메인구간은 단내림 경계까지
          droppedAreaWidth = droppedWidth - 50; // 단내림구간은 오른쪽 프레임까지
          
          if (droppedPosition === 'left') {
            droppedStartX = xOffset + 20; // 왼쪽 엔드패널
            normalStartX = xOffset + droppedWidth; // 천장 분절라인 (빨간선 위치)
          } else {
            normalStartX = xOffset + 20; // 왼쪽 엔드패널
            droppedStartX = xOffset + (totalWidth - droppedWidth); // 천장 분절라인 (빨간선 위치)
          }
        }
      } else {
        // 프리스탠딩: 20 + ... + 20
        normalAreaWidth = totalWidth - droppedWidth - 20; // 메인구간은 단내림 경계까지
        droppedAreaWidth = droppedWidth - 20; // 단내림구간은 오른쪽 엔드패널까지
        
        if (droppedPosition === 'left') {
          droppedStartX = xOffset + 20; // 왼쪽 엔드패널
          normalStartX = xOffset + droppedWidth; // 천장 분절라인 (빨간선 위치)
        } else {
          normalStartX = xOffset + 20; // 왼쪽 엔드패널
          droppedStartX = xOffset + (totalWidth - droppedWidth); // 천장 분절라인 (빨간선 위치)
        }
      }
    } else {
      // 노서라운드: PDF 1,4,5페이지 참조
      if (spaceInfo.installType === 'builtin') {
        // 빌트인: 전체 너비에서 이격거리만 제외
        normalAreaWidth = totalWidth - droppedWidth - 4;
        droppedAreaWidth = droppedWidth - 4;
        
        if (droppedPosition === 'left') {
          droppedStartX = xOffset + 2;
          normalStartX = xOffset + droppedWidth; // 천장 분절라인
        } else {
          normalStartX = xOffset + 2;
          droppedStartX = xOffset + (totalWidth - droppedWidth); // 천장 분절라인
        }
      } else if (spaceInfo.installType === 'semistanding') {
        // 세미스탠딩: 벽쪽 2mm, 엔드패널쪽 20mm
        if (spaceInfo.wallConfig?.left) {
          // 왼쪽 벽: 2 + ... + 20
          normalAreaWidth = totalWidth - droppedWidth - 22;
          droppedAreaWidth = droppedWidth - 22;
          
          if (droppedPosition === 'left') {
            droppedStartX = xOffset + 2;
            normalStartX = xOffset + droppedWidth;
          } else {
            normalStartX = xOffset + 2;
            droppedStartX = xOffset + (totalWidth - droppedWidth);
          }
        } else {
          // 오른쪽 벽: 20 + ... + 2
          normalAreaWidth = totalWidth - droppedWidth - 22;
          droppedAreaWidth = droppedWidth - 22;
          
          if (droppedPosition === 'left') {
            droppedStartX = xOffset + 20;
            normalStartX = xOffset + droppedWidth;
          } else {
            normalStartX = xOffset + 20;
            droppedStartX = xOffset + (totalWidth - droppedWidth);
          }
        }
      } else {
        // 프리스탠딩: 20 + ... + 20
        normalAreaWidth = totalWidth - droppedWidth - 40;
        droppedAreaWidth = droppedWidth - 40;
        
        if (droppedPosition === 'left') {
          droppedStartX = xOffset + 20;
          normalStartX = xOffset + droppedWidth;
        } else {
          normalStartX = xOffset + 20;
          droppedStartX = xOffset + (totalWidth - droppedWidth);
        }
      }
    }
    
    console.log('🔍 [calculateZoneSlotInfo] PDF 공식 적용 결과:', {
      totalWidth,
      droppedWidth,
      normalAreaWidth,
      droppedAreaWidth,
      normalStartX,
      droppedStartX,
      customColumnCount
    });
    
    // 각 영역의 컬럼 수 계산
    let normalColumnCount: number;
    let droppedColumnCount: number;
    
    // customColumnCount가 제공되면 메인 영역에 사용
    if (customColumnCount !== undefined && customColumnCount > 0) {
      normalColumnCount = customColumnCount;
      // 단내림 영역은 너비에 맞게 자동 계산
      droppedColumnCount = SpaceCalculator.getDefaultColumnCount(droppedAreaWidth);
    } else {
      // customColumnCount가 없으면 각 영역의 너비에 맞는 독립적인 계산
      normalColumnCount = SpaceCalculator.getDefaultColumnCount(normalAreaWidth);
      droppedColumnCount = SpaceCalculator.getDefaultColumnCount(droppedAreaWidth);
    }
    
    console.log('🔍 [calculateZoneSlotInfo] 영역별 컬럼 수:', {
      normalColumnCount,
      droppedColumnCount,
      customColumnCount,
      'customColumnCount 적용': customColumnCount !== undefined && customColumnCount > 0 ? '예' : '아니오',
      '메인구간 계산': `${normalAreaWidth}mm / 600mm = ${normalAreaWidth/600}`,
      '단내림구간 계산': `${droppedAreaWidth}mm / 600mm = ${droppedAreaWidth/600}`
    });
    
    // 각 영역의 컬럼 너비 계산
    const normalColumnWidth = Math.floor(normalAreaWidth / normalColumnCount);
    const droppedColumnWidth = Math.floor(droppedAreaWidth / droppedColumnCount);
    
    const result = {
      normal: {
        startX: normalStartX,
        width: normalAreaWidth,
        columnCount: normalColumnCount,
        columnWidth: normalColumnWidth
      },
      dropped: {
        startX: droppedStartX,
        width: droppedAreaWidth,
        columnCount: droppedColumnCount,
        columnWidth: droppedColumnWidth
      }
    };
    
    console.log('🎯 [calculateZoneSlotInfo] 최종 영역 정보:', {
      normal: {
        startX: normalStartX,
        endX: normalStartX + normalAreaWidth,
        width: normalAreaWidth,
        columnCount: normalColumnCount,
        columnWidth: normalColumnWidth,
        '슬롯 경계': Array.from({ length: normalColumnCount + 1 }, (_, i) => 
          normalStartX + (i * normalColumnWidth)
        )
      },
      dropped: {
        startX: droppedStartX,
        endX: droppedStartX + droppedAreaWidth,
        width: droppedAreaWidth,
        columnCount: droppedColumnCount,
        columnWidth: droppedColumnWidth,
        '슬롯 경계': Array.from({ length: droppedColumnCount + 1 }, (_, i) => 
          droppedStartX + (i * droppedColumnWidth)
        )
      }
    });
    
    return result;
  }

  /**
   * 주어진 위치가 어떤 영역에 속하는지와 해당 영역의 슬롯 인덱스 찾기
   */
  static findZoneAndSlotFromPosition(
    position: { x: number }, // mm 단위
    spaceInfo: SpaceInfo,
    indexing: SpaceIndexingResult
  ): { zone: 'normal' | 'dropped', slotIndex: number } | null {
    if (!spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 없는 경우 전체 영역이 normal
      const slotIndex = this.findClosestColumnIndex(
        { x: SpaceCalculator.mmToThreeUnits(position.x) },
        indexing
      );
      return { zone: 'normal', slotIndex };
    }
    
    const zoneInfo = this.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    if (!zoneInfo.dropped) return null;
    
    // 위치가 어느 영역에 속하는지 확인
    const droppedEndX = zoneInfo.dropped.startX + zoneInfo.dropped.width;
    const normalEndX = zoneInfo.normal.startX + zoneInfo.normal.width;
    
    // 단내림 영역 확인
    if (position.x >= zoneInfo.dropped.startX && position.x <= droppedEndX) {
      // 단내림 영역 내 슬롯 인덱스 계산
      const relativeX = position.x - zoneInfo.dropped.startX;
      const slotIndex = Math.floor(relativeX / zoneInfo.dropped.columnWidth);
      return {
        zone: 'dropped',
        slotIndex: Math.min(slotIndex, zoneInfo.dropped.columnCount - 1)
      };
    }
    
    // 일반 영역 확인
    if (position.x >= zoneInfo.normal.startX && position.x <= normalEndX) {
      // 일반 영역 내 슬롯 인덱스 계산
      const relativeX = position.x - zoneInfo.normal.startX;
      const slotIndex = Math.floor(relativeX / zoneInfo.normal.columnWidth);
      return {
        zone: 'normal',
        slotIndex: Math.min(slotIndex, zoneInfo.normal.columnCount - 1)
      };
    }
    
    // 범위 밖인 경우
    return null;
  }
} 