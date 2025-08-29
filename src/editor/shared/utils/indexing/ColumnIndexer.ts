import { SpaceInfo, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
import { SpaceCalculator } from './SpaceCalculator';
import { calculateFrameThickness, SURROUND_FRAME_THICKNESS, END_PANEL_THICKNESS } from '../../viewer3d/utils/geometry';

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
  slotWidths?: number[];          // 각 슬롯의 실제 너비 배열 (mm)
  internalWidth: number;          // 내경 너비 (mm)
  internalStartX: number;         // 내경 시작 X좌표 (mm)
  threeUnitColumnWidth: number;   // Three.js 단위 슬롯 너비
  zones?: {                       // 영역별 슬롯 정보 (단내림 활성화 시)
    normal: {
      startX: number;
      width: number;
      columnCount: number;
      columnWidth: number;
      slotWidths?: number[];
      threeUnitPositions?: number[];
      threeUnitDualPositions?: number[];
    };
    dropped: {
      startX: number;
      width: number;
      columnCount: number;
      columnWidth: number;
      slotWidths?: number[];
      threeUnitPositions?: number[];
      threeUnitDualPositions?: number[];
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
        
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          // 빌트인: 양쪽 벽이 있으므로 이격거리만 고려
          leftReduction = spaceInfo.gapConfig?.left || 2;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          // 세미스탠딩: 한쪽 벽만 있음, 이격거리 무시
          if (spaceInfo.wallConfig?.left) {
            // 왼쪽 벽이 있으면: 이격거리 무시
            leftReduction = 0;
          } else {
            // 왼쪽 벽이 없으면: 엔드패널(18mm)만
            leftReduction = END_PANEL_THICKNESS;
          }
        } else {
          // 프리스탠딩: 양쪽 벽이 없으므로 엔드패널만
          leftReduction = END_PANEL_THICKNESS;
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
      
      // 단내림이 있어도 전체 영역의 slotWidths 생성 (호환성을 위해)
      // 이 부분을 듀얼 가구 위치 계산 전으로 이동
      const baseWidth = Math.floor(internalWidth / columnCount);
      const remainder = internalWidth % columnCount;
      const slotWidths: number[] = [];
      for (let i = 0; i < columnCount; i++) {
        slotWidths.push(i < remainder ? baseWidth + 1 : baseWidth);
      }
      
      // 듀얼 가구용 위치 계산
      const dualColumnPositions = [];
      const threeUnitDualPositions = [];
      
      // 듀얼 가구는 두 슬롯의 경계에 위치 (슬롯 경계가 듀얼 가구의 중심)
      for (let i = 0; i < columnCount - 1; i++) {
        let dualCenterPosition;
        
        if (slotWidths && slotWidths[i] !== undefined) {
          // 슬롯 경계 위치 계산 (i번째 슬롯의 끝 = i+1번째 슬롯의 시작)
          let slotBoundaryX = 0;
          for (let j = 0; j <= i; j++) {
            slotBoundaryX += slotWidths[j];
          }
          dualCenterPosition = slotBoundaryX;
        } else {
          // 기본 계산: 슬롯 경계 위치
          dualCenterPosition = columnBoundaries[i];
        }
        
        dualColumnPositions.push(dualCenterPosition);
        threeUnitDualPositions.push(SpaceCalculator.mmToThreeUnits(dualCenterPosition));
      }
      
      // 영역별 정보 추가
      const zones = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      
      // zones에 threeUnitPositions 추가
      if (zones.normal) {
        // 메인 영역 슬롯 위치 계산 - 실제 슬롯 너비 사용
        zones.normal.threeUnitPositions = [];
        zones.normal.threeUnitDualPositions = [];
        
        let currentX = zones.normal.startX;
        for (let i = 0; i < zones.normal.columnCount; i++) {
          const slotWidth = zones.normal.slotWidths?.[i] || zones.normal.columnWidth;
          const slotCenterX = currentX + (slotWidth / 2);
          zones.normal.threeUnitPositions.push(SpaceCalculator.mmToThreeUnits(slotCenterX));
          
          console.log(`🎯 Normal Zone Slot ${i}:`, {
            startX: currentX,
            width: slotWidth,
            centerX: slotCenterX,
            threeUnits: SpaceCalculator.mmToThreeUnits(slotCenterX)
          });
          
          currentX += slotWidth;
        }
        
        // 듀얼 위치 계산 - 실제 슬롯 위치 사용
        for (let i = 0; i < zones.normal.columnCount - 1; i++) {
          const leftSlotThreeUnits = zones.normal.threeUnitPositions[i];
          const rightSlotThreeUnits = zones.normal.threeUnitPositions[i + 1];
          const dualCenterThreeUnits = (leftSlotThreeUnits + rightSlotThreeUnits) / 2;
          zones.normal.threeUnitDualPositions.push(dualCenterThreeUnits);
        }
      }
      
      if (zones.dropped) {
        // 단내림 영역 슬롯 위치 계산 - 실제 슬롯 너비 사용
        zones.dropped.threeUnitPositions = [];
        zones.dropped.threeUnitDualPositions = [];
        
        let currentX = zones.dropped.startX;
        for (let i = 0; i < zones.dropped.columnCount; i++) {
          const slotWidth = zones.dropped.slotWidths?.[i] || zones.dropped.columnWidth;
          const slotCenterX = currentX + (slotWidth / 2);
          zones.dropped.threeUnitPositions.push(SpaceCalculator.mmToThreeUnits(slotCenterX));
          currentX += slotWidth;
        }
        
        // 듀얼 위치 계산 - 실제 슬롯 위치 사용
        for (let i = 0; i < zones.dropped.columnCount - 1; i++) {
          const leftSlotThreeUnits = zones.dropped.threeUnitPositions[i];
          const rightSlotThreeUnits = zones.dropped.threeUnitPositions[i + 1];
          const dualCenterThreeUnits = (leftSlotThreeUnits + rightSlotThreeUnits) / 2;
          zones.dropped.threeUnitDualPositions.push(dualCenterThreeUnits);
        }
      }
      
      return {
        columnCount,
        columnPositions,
        threeUnitPositions,
        columnBoundaries,
        threeUnitBoundaries,
        dualColumnPositions,
        threeUnitDualPositions,
        columnWidth,
        slotWidths,  // 전체 영역의 slotWidths 추가
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
    
    // mainDoorCount가 설정되어 있으면 최우선 사용 (4분할 창 등)
    if (spaceInfo.mainDoorCount !== undefined && spaceInfo.mainDoorCount > 0) {
      columnCount = spaceInfo.mainDoorCount;
    } else if (spaceInfo.customColumnCount) {
      // 사용자 지정 컬럼 수가 있으면 사용
      columnCount = spaceInfo.customColumnCount;
    } else {
      // 기존 자동 계산 로직
      columnCount = SpaceCalculator.getDefaultColumnCount(internalWidth);
    }
    
    // 노서라운드 모드인지 확인
    const isNoSurround = spaceInfo.surroundType === 'no-surround';
    
    // 슬롯별 실제 너비 배열 생성
    const slotWidths: number[] = [];
    
    if (isNoSurround && spaceInfo.installType === 'freestanding') {
      // 노서라운드 벽없음: 커버도어 방식 - 전체너비를 균등 분할 후, 양쪽 끝 슬롯에서 18mm씩 빼기
      const baseSlotWidth = Math.floor(totalWidth / columnCount);
      const remainder = totalWidth % columnCount;
      
      for (let i = 0; i < columnCount; i++) {
        let slotWidth = i < remainder ? baseSlotWidth + 1 : baseSlotWidth;
        
        // 첫 번째 슬롯은 왼쪽 엔드패널 두께를 뺌
        if (i === 0) {
          slotWidth = slotWidth - END_PANEL_THICKNESS;
        }
        // 마지막 슬롯은 오른쪽 엔드패널 두께를 뺌
        else if (i === columnCount - 1) {
          slotWidth = slotWidth - END_PANEL_THICKNESS;
        }
        // 중간 슬롯들은 그대로
        
        slotWidths.push(slotWidth);
      }
      
      // 디버깅 로그
      console.log('🔧 노서라운드 벽없음 슬롯 계산:', {
        '전체 공간 너비': totalWidth,
        '컬럼 수': columnCount,
        '기본 슬롯 너비': baseSlotWidth,
        '슬롯 너비 배열': slotWidths,
        '예시': `${slotWidths[0]} / ${slotWidths[1] || '...'} / ... / ${slotWidths[slotWidths.length - 1]}`
      });
    } else if (isNoSurround && (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing')) {
      // 노서라운드 한쪽벽: 커버도어 방식 - 전체너비를 균등 분할 후, 엔드패널 쪽 슬롯만 18mm 빼기
      const baseSlotWidth = Math.floor(totalWidth / columnCount);
      const remainder = totalWidth % columnCount;
      
      for (let i = 0; i < columnCount; i++) {
        let slotWidth = baseSlotWidth;
        
        // remainder 분배 (앞쪽부터)
        if (i < remainder) {
          slotWidth += 1;
        }
        
        // 엔드패널이 있는 쪽 슬롯에서만 18mm 빼기 (커버도어는 엔드패널이 슬롯 밖에 있음)
        if (!spaceInfo.wallConfig?.left && i === 0) {
          // 왼쪽 벽이 없으면 첫 번째 슬롯에서 18mm 빼기
          slotWidth -= END_PANEL_THICKNESS;
        } else if (!spaceInfo.wallConfig?.right && i === columnCount - 1) {
          // 오른쪽 벽이 없으면 마지막 슬롯에서 18mm 빼기
          slotWidth -= END_PANEL_THICKNESS;
        }
        
        slotWidths.push(slotWidth);
      }
      
      // 디버깅 로그
      console.log('🔧 노서라운드 한쪽벽 슬롯 계산 (커버도어 방식):', {
        '전체 공간 너비': totalWidth,
        '컬럼 수': columnCount,
        '기본 슬롯 너비': baseSlotWidth,
        '슬롯 너비 배열': slotWidths,
        '벽 위치': spaceInfo.wallConfig?.left ? '좌측' : '우측',
        '첫 슬롯': slotWidths[0],
        '마지막 슬롯': slotWidths[slotWidths.length - 1],
        '엔드패널 위치': !spaceInfo.wallConfig?.left ? '좌측' : (!spaceInfo.wallConfig?.right ? '우측' : '없음')
      });
    } else {
      // 서라운드 모드 또는 노서라운드 빌트인: 기존 로직 (내경 기준)
      const baseWidth = Math.floor(internalWidth / columnCount);
      const remainder = internalWidth % columnCount;
      
      for (let i = 0; i < columnCount; i++) {
        // 앞쪽 remainder개 슬롯은 1mm씩 더 크게
        slotWidths.push(i < remainder ? baseWidth + 1 : baseWidth);
      }
    }
    
    // 호환성을 위한 평균 너비
    const columnWidth = Math.floor(internalWidth / columnCount);
    
    // 좌우 패딩은 0 (모든 공간을 슬롯에 할당)
    const leftPadding = 0;
    
    // 내경의 시작 X좌표 (Three.js 좌표계, 중앙이 0)
    // 전체 공간이 중앙 정렬되므로 (-전체폭/2 + 좌측여백)가 내경 시작점
    // 슬롯 가이드용 시작점 계산 - 엔드패널 바로 안쪽에서 시작
    let internalStartX;
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드: 이격거리만 고려 (엔드패널 내부에서 시작)
      let leftReduction = 0;
      
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 양쪽 벽이 있으므로 이격거리만 고려
        leftReduction = spaceInfo.gapConfig?.left || 2;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 세미스탠딩: 한쪽 벽만 있음
        if (spaceInfo.wallConfig?.left) {
          // 왼쪽 벽이 있으면: 벽에 바로 붙음 (이격거리 무시)
          leftReduction = 0;
        } else {
          // 왼쪽 벽이 없으면: 엔드패널 두께만
          leftReduction = END_PANEL_THICKNESS;
        }
      } else {
        // 프리스탠딩: 양쪽 벽이 없으므로 엔드패널 두께만
        leftReduction = END_PANEL_THICKNESS;
      }
      
      internalStartX = -(totalWidth / 2) + leftReduction + leftPadding;
    } else {
      // 서라운드: 좌측 프레임 두께 + 좌측 패딩 고려
      internalStartX = -(totalWidth / 2) + frameThickness.left + leftPadding;
    }
    
    // 각 컬럼 경계의 위치 계산 (실제 슬롯 너비 사용)
    const columnBoundaries = [];
    let currentX: number;
    
    if (isNoSurround && (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing')) {
      // 노서라운드: 항상 전체 공간을 균등 분할하여 일관된 위치 유지
      // 프리스탠딩: 전체 너비를 균등 분할 (양쪽 엔드패널 포함)
      // 세미스탠딩: 전체 너비를 균등 분할 (한쪽 엔드패널 포함)
      // 벽 설정이 변경되어도 슬롯 위치는 동일하게 유지
      currentX = -(totalWidth / 2);
      
      // 첫 슬롯 시작 위치 계산 (균등 분할 기준)
      const baseSlotWidth = Math.floor(totalWidth / columnCount);
      const remainder = totalWidth % columnCount;
      
      // 프리스탠딩은 양쪽, 세미스탠딩은 한쪽에 엔드패널 공간 확보
      if (spaceInfo.installType === 'freestanding') {
        // 양쪽 엔드패널 공간 확보 (18mm씩)
        currentX = -(totalWidth / 2) + END_PANEL_THICKNESS;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 세미스탠딩: 벽 위치에 따라 엔드패널 공간 확보
        if (spaceInfo.wallConfig?.left) {
          // 왼쪽 벽이 있으면: 벽에 바로 붙음
          currentX = -(totalWidth / 2);
        } else {
          // 왼쪽 벽이 없으면: 왼쪽에 엔드패널 공간 확보 (18mm)
          currentX = -(totalWidth / 2) + END_PANEL_THICKNESS;
        }
      }
    } else {
      // 서라운드 또는 빌트인: 내경 시작점
      currentX = internalStartX;
    }
    
    columnBoundaries.push(currentX);
    
    for (let i = 0; i < columnCount; i++) {
      currentX += slotWidths[i];
      columnBoundaries.push(currentX);
    }
    
    // 각 슬롯(컬럼)의 중심 위치 계산 - 실제 너비 기반
    const columnPositions = [];
    for (let i = 0; i < columnCount; i++) {
      // 각 컬럼의 시작 위치
      const columnStart = columnBoundaries[i];
      // 각 컬럼의 끝 위치
      const columnEnd = columnBoundaries[i + 1];
      // 각 컬럼의 중심 위치
      const columnCenter = (columnStart + columnEnd) / 2;
      columnPositions.push(columnCenter);
    }
    
    // Three.js 단위로 변환된 값들도 함께 제공
    const threeUnitPositions = columnPositions.map(pos => SpaceCalculator.mmToThreeUnits(pos));
    const threeUnitBoundaries = columnBoundaries.map(pos => SpaceCalculator.mmToThreeUnits(pos));
    
    // 노서라운드 모드에서 디버깅 로그
    if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig) {
      console.log(`🎯 [가구위치] 노서라운드 모드 - 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm:`, {
        totalWidth,
        internalWidth,
        internalStartX,
        '첫번째슬롯위치': threeUnitPositions[0]?.toFixed(3),
        '마지막슬롯위치': threeUnitPositions[threeUnitPositions.length - 1]?.toFixed(3)
      });
    }
    
    // 듀얼가구용 두 컬럼 경계 중심 위치 계산 추가
    const dualColumnPositions = [];
    const threeUnitDualPositions = [];
    
    // 듀얼 가구는 두 슬롯의 정확한 중심에 배치
    // 슬롯 경계가 아니라 두 슬롯이 차지하는 전체 영역의 중심
    for (let i = 0; i < columnCount - 1; i++) {
      // i번째 슬롯의 시작과 i+1번째 슬롯의 끝을 구해서 그 중심을 계산
      const leftSlotStart = columnBoundaries[i];
      const rightSlotEnd = columnBoundaries[i + 2];
      const dualCenterPosition = (leftSlotStart + rightSlotEnd) / 2;
      
      dualColumnPositions.push(dualCenterPosition);
      threeUnitDualPositions.push(SpaceCalculator.mmToThreeUnits(dualCenterPosition));
      
      // 노서라운드 디버깅
      if (isNoSurround && (i === 0 || i === columnCount - 2)) {
        console.log(`🎯 듀얼 가구 위치 계산 [슬롯 ${i}-${i+1}]:`, {
          leftSlotWidth: slotWidths[i],
          rightSlotWidth: slotWidths[i + 1],
          leftSlotStart,
          rightSlotEnd,
          totalWidth: rightSlotEnd - leftSlotStart,
          dualCenterPosition,
          설명: '두 슬롯 전체 영역의 중심'
        });
      }
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
      slotWidths,             // 각 슬롯의 실제 너비 배열 (mm)
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
    console.log('🔍🔍 [calculateZoneSlotInfo] 함수 시작:', {
      surroundType: spaceInfo.surroundType,
      installType: spaceInfo.installType,
      droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
      droppedCeilingPosition: spaceInfo.droppedCeiling?.position,
      droppedCeilingWidth: spaceInfo.droppedCeiling?.width,
      customColumnCount
    });
    
    const frameThickness = calculateFrameThickness(spaceInfo);
    const MAX_SLOT_WIDTH = 600; // 슬롯 최대 너비 제한
    
    if (!spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 비활성화된 경우 전체 영역을 일반 영역으로 반환
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
      let columnCount: number;
      
      // mainDoorCount가 설정되어 있으면 최우선 사용
      if (spaceInfo.mainDoorCount !== undefined && spaceInfo.mainDoorCount > 0) {
        columnCount = spaceInfo.mainDoorCount;
      } else if (customColumnCount) {
        columnCount = customColumnCount;
      } else {
        columnCount = SpaceCalculator.getDefaultColumnCount(internalWidth);
      }
      
      // 슬롯 너비가 600mm를 초과하지 않도록 최소 슬롯 개수 보장
      const minRequiredSlots = Math.ceil(internalWidth / MAX_SLOT_WIDTH);
      if (columnCount < minRequiredSlots) {
        columnCount = minRequiredSlots;
        console.warn(`슬롯 너비 제한: ${minRequiredSlots}개 이상의 슬롯이 필요합니다.`);
      }
      
      const columnWidth = Math.floor(internalWidth / columnCount);
      
      // 노서라운드의 경우 사용 가능 너비 재계산
      let actualInternalWidth = internalWidth;
      if (spaceInfo.surroundType === 'no-surround') {
        if (spaceInfo.installType === 'freestanding') {
          // 벽없음: 양쪽 엔드패널을 제외한 너비 (프레임이 엔드패널 안쪽에만 위치)
          actualInternalWidth = spaceInfo.width - (END_PANEL_THICKNESS * 2);
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          actualInternalWidth = spaceInfo.width;
          
          // 이격거리는 무시하고 엔드패널만 고려
          if (!spaceInfo.wallConfig?.left) {
            // 왼쪽 벽이 없으면 엔드패널 두께 빼기
            actualInternalWidth -= END_PANEL_THICKNESS;
          }
          
          if (!spaceInfo.wallConfig?.right) {
            // 오른쪽 벽이 없으면 엔드패널 두께 빼기
            actualInternalWidth -= END_PANEL_THICKNESS;
          }
        } else if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          // 빌트인: 노서라운드 모드에서는 벽에 바로 붙음 (이격거리, 엔드패널 모두 없음)
          actualInternalWidth = spaceInfo.width;
        }
      }
      
      // 프레임을 고려한 내부 시작점 (노서라운드의 경우 엔드패널과 gapConfig 고려)
      // 슬롯 가이드용 시작점 계산 - 엔드패널 바로 안쪽에서 시작
      let internalStartX: number;
      let leftReduction = 0; // 변수를 if 블록 밖에 선언
      
      if (spaceInfo.surroundType === 'no-surround') {
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          // 빌트인: 노서라운드 모드에서는 이격거리 무시 (벽에 바로 붙음)
          leftReduction = 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          // 세미스탠딩: 한쪽 벽만 있음
          if (spaceInfo.wallConfig?.left) {
            // 왼쪽 벽이 있으면: 벽에 바로 붙음 (이격거리 무시)
            leftReduction = 0;
          } else {
            // 왼쪽 벽이 없으면: 엔드패널 두께만
            leftReduction = END_PANEL_THICKNESS;
          }
        } else {
          // 프리스탠딩: 양쪽 벽이 없으므로 엔드패널 두께만
          leftReduction = END_PANEL_THICKNESS;
        }
        
        internalStartX = -(spaceInfo.width / 2) + leftReduction;
      } else {
        internalStartX = -(spaceInfo.width / 2) + frameThickness.left;
      }
      
      console.log('🔍 calculateZoneSlotInfo 시작점 계산:', {
        surroundType: spaceInfo.surroundType,
        installType: spaceInfo.installType,
        wallConfig: spaceInfo.wallConfig,
        gapConfig: spaceInfo.gapConfig,
        leftReduction,
        internalStartX,
        actualInternalWidth,
        전체너비: spaceInfo.width
      });
      
      // 슬롯별 실제 너비 배열 생성
      const slotWidths: number[] = [];
      
      if (spaceInfo.surroundType === 'no-surround' && spaceInfo.installType === 'freestanding') {
        // 노서라운드 벽없음: 커버도어 방식 - 전체너비를 균등 분할 후, 양쪽 끝 슬롯에서 18mm씩 빼기
        const baseSlotWidth = Math.floor(spaceInfo.width / columnCount);
        const remainder = spaceInfo.width % columnCount;
        
        for (let i = 0; i < columnCount; i++) {
          let slotWidth = i < remainder ? baseSlotWidth + 1 : baseSlotWidth;
          
          // 첫 번째 슬롯은 왼쪽 엔드패널 두께를 뺌
          if (i === 0) {
            slotWidth = slotWidth - END_PANEL_THICKNESS;
          }
          // 마지막 슬롯은 오른쪽 엔드패널 두께를 뺌
          else if (i === columnCount - 1) {
            slotWidth = slotWidth - END_PANEL_THICKNESS;
          }
          // 중간 슬롯들은 그대로
          
          slotWidths.push(slotWidth);
        }
      } else if (spaceInfo.surroundType === 'no-surround' && (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing')) {
        // 노서라운드 한쪽벽: 커버도어 방식 - 전체너비를 균등 분할 후, 엔드패널 쪽 슬롯만 18mm 빼기
        const baseSlotWidth = Math.floor(spaceInfo.width / columnCount);
        const remainder = spaceInfo.width % columnCount;
        
        for (let i = 0; i < columnCount; i++) {
          let slotWidth = baseSlotWidth;
          
          // remainder 분배 (앞쪽부터)
          if (i < remainder) {
            slotWidth += 1;
          }
          
          // 엔드패널이 있는 쪽 슬롯에서만 18mm 빼기 (커버도어는 엔드패널이 슬롯 밖에 있음)
          if (!spaceInfo.wallConfig?.left && i === 0) {
            // 왼쪽 벽이 없으면 첫 번째 슬롯에서 18mm 빼기
            slotWidth -= END_PANEL_THICKNESS;
          } else if (!spaceInfo.wallConfig?.right && i === columnCount - 1) {
            // 오른쪽 벽이 없으면 마지막 슬롯에서 18mm 빼기
            slotWidth -= END_PANEL_THICKNESS;
          }
          
          slotWidths.push(slotWidth);
        }
      } else {
        // 서라운드 모드 또는 빌트인: 기존 로직
        const baseWidth = Math.floor(internalWidth / columnCount);
        const remainder = internalWidth % columnCount;
        for (let i = 0; i < columnCount; i++) {
          slotWidths.push(i < remainder ? baseWidth + 1 : baseWidth);
        }
      }
      
      console.log('🔍 calculateZoneSlotInfo (단내림 없음):', {
        surroundType: spaceInfo.surroundType,
        installType: spaceInfo.installType,
        totalWidth: spaceInfo.width,
        internalWidth,
        actualInternalWidth,
        internalStartX,
        columnCount,
        columnWidth,
        slotWidths,
        '첫 슬롯 너비': slotWidths[0],
        '마지막 슬롯 너비': slotWidths[slotWidths.length - 1],
        '슬롯 너비 합계': slotWidths.reduce((sum, w) => sum + w, 0)
      });
      
      return {
        normal: {
          startX: internalStartX,
          width: actualInternalWidth,  // 노서라운드의 경우 조정된 너비 사용
          columnCount,
          columnWidth,
          slotWidths
        },
        dropped: null
      };
    }
    
    // 단내림이 활성화된 경우
    const totalWidth = spaceInfo.width;
    const droppedWidth = spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
    const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
    
    // 전체 내부 너비 (프레임 제외)
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
    
    // 시작 위치 계산 (노서라운드의 경우 엔드패널과 gapConfig 고려)
    // 슬롯 가이드용 시작점 계산 - 엔드패널 바로 안쪽에서 시작
    let internalStartX: number;
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 노서라운드 모드에서는 이격거리 무시
        leftReduction = 0;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 세미스탠딩: 한쪽 벽만 있음
        if (spaceInfo.wallConfig?.left) {
          // 왼쪽 벽이 있으면: 벽에 바로 붙음 (이격거리 무시)
          leftReduction = 0;
        } else {
          // 왼쪽 벽이 없으면: 엔드패널 두께만
          leftReduction = END_PANEL_THICKNESS;
        }
      } else {
        // 프리스탠딩: 양쪽 벽이 없으므로 엔드패널 두께만
        leftReduction = END_PANEL_THICKNESS;
      }
      
      internalStartX = -(totalWidth / 2) + leftReduction;
    } else {
      internalStartX = -(totalWidth / 2) + frameThickness.left;
    }
    
    // 각 구간의 외부 너비 (프레임 제외 전)
    const normalAreaOuterWidth = totalWidth - droppedWidth;
    const droppedAreaOuterWidth = droppedWidth;
    
    // 각 구간의 내부 너비 계산
    let normalAreaInternalWidth: number;
    let droppedAreaInternalWidth: number;
    let normalStartX: number;
    let droppedStartX: number;
    
    if (droppedPosition === 'left') {
      // 왼쪽 단내림
      if (spaceInfo.surroundType === 'surround') {
        // 서라운드: 구간 사이에 프레임 없음, 바로 연결
        droppedAreaInternalWidth = droppedAreaOuterWidth - frameThickness.left;
        droppedStartX = internalStartX; // 수정된 internalStartX 사용
        normalAreaInternalWidth = normalAreaOuterWidth - frameThickness.right;
        normalStartX = droppedStartX + droppedAreaInternalWidth; // 갭 없이 바로 연결
        
        console.log('🔍 서라운드 왼쪽 단내림 경계 계산:', {
          '단내림 끝': droppedStartX + droppedAreaInternalWidth,
          '메인 시작': normalStartX,
          '갭': normalStartX - (droppedStartX + droppedAreaInternalWidth),
          '프레임 두께': frameThickness,
          'spaceInfo.gapConfig': spaceInfo.gapConfig,
          'spaceInfo.wallConfig': spaceInfo.wallConfig,
          'spaceInfo.installType': spaceInfo.installType
        });
      } else {
        // 노서라운드: 엔드패널 고려
        let leftReduction = 0;
        let rightReduction = 0;
        
        // 빌트인인 경우: 양쪽 벽이 있으므로 엔드패널 불필요
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          leftReduction = 0;
          rightReduction = 0;
        } else {
          // 왼쪽 처리 (이격거리 무시)
          if (spaceInfo.wallConfig?.left) {
            leftReduction = 0;  // 벽이 있으면 이격거리 무시
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }
          
          // 오른쪽 처리 (이격거리 무시)
          if (spaceInfo.wallConfig?.right) {
            rightReduction = 0;  // 벽이 있으면 이격거리 무시
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        }
        
        droppedAreaInternalWidth = droppedAreaOuterWidth - leftReduction;
        droppedStartX = internalStartX; // 수정된 internalStartX 사용
        normalAreaInternalWidth = normalAreaOuterWidth - rightReduction;
        normalStartX = droppedStartX + droppedAreaInternalWidth; // 갭 없이 바로 연결
        
        console.log('🔍 노서라운드 왼쪽 단내림 경계 계산:', {
          '단내림 끝': droppedStartX + droppedAreaInternalWidth,
          '메인 시작': normalStartX,
          '갭': normalStartX - (droppedStartX + droppedAreaInternalWidth),
          '프레임 두께': frameThickness,
          'SURROUND_FRAME_THICKNESS 제거됨': true
        });
      }
    } else {
      // 오른쪽 단내림
      if (spaceInfo.surroundType === 'surround') {
        // 서라운드: 구간 사이에 프레임 없음, 바로 연결
        normalAreaInternalWidth = normalAreaOuterWidth - frameThickness.left;
        normalStartX = internalStartX; // 수정된 internalStartX 사용
        droppedAreaInternalWidth = droppedAreaOuterWidth - frameThickness.right;
        droppedStartX = normalStartX + normalAreaInternalWidth; // 갭 없이 바로 연결
        
        console.log('🔍 서라운드 오른쪽 단내림 경계 계산:', {
          '메인 끝': normalStartX + normalAreaInternalWidth,
          '단내림 시작': droppedStartX,
          '갭': droppedStartX - (normalStartX + normalAreaInternalWidth),
          '프레임 두께': frameThickness,
          'spaceInfo.gapConfig': spaceInfo.gapConfig,
          'spaceInfo.wallConfig': spaceInfo.wallConfig,
          'spaceInfo.installType': spaceInfo.installType
        });
      } else {
        // 노서라운드: 엔드패널 고려하여 계산
        let leftReduction = 0;
        let rightReduction = 0;
        
        // 빌트인인 경우: 양쪽 벽이 있으므로 엔드패널 불필요
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          leftReduction = 0;
          rightReduction = 0;
        } else {
          // 왼쪽 처리
          if (spaceInfo.wallConfig?.left) {
            leftReduction = 0;  // 벽이 있으면 이격거리 무시, 벽에 바로 붙음
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }
          
          // 오른쪽 처리
          if (spaceInfo.wallConfig?.right) {
            rightReduction = 0;  // 벽에 바로 붙음 (이격거리 무시)
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        }
        
        normalAreaInternalWidth = normalAreaOuterWidth - leftReduction;
        normalStartX = internalStartX; // 수정된 internalStartX 사용
        droppedAreaInternalWidth = droppedAreaOuterWidth - rightReduction;
        droppedStartX = normalStartX + normalAreaInternalWidth; // 갭 없이 바로 연결
        
        console.log('🔍 노서라운드 오른쪽 단내림 경계 계산:', {
          '메인 끝': normalStartX + normalAreaInternalWidth,
          '단내림 시작': droppedStartX,
          '갭': droppedStartX - (normalStartX + normalAreaInternalWidth),
          '프레임 두께': frameThickness,
          'SURROUND_FRAME_THICKNESS 제거됨': true
        });
      }
    }
    
    // 각 영역의 컬럼 수 계산
    let normalColumnCount: number;
    let droppedColumnCount: number;
    
    // 메인 영역 컬럼 수
    if (spaceInfo.mainDoorCount !== undefined && spaceInfo.mainDoorCount > 0) {
      normalColumnCount = spaceInfo.mainDoorCount;
    } else if (customColumnCount) {
      // customColumnCount가 있으면 사용
      normalColumnCount = customColumnCount;
    } else {
      // 자동 계산
      normalColumnCount = SpaceCalculator.getDefaultColumnCount(normalAreaInternalWidth);
    }
    
    // 메인 영역 슬롯 너비가 600mm를 초과하지 않도록 검증
    const minRequiredNormalSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);
    if (normalColumnCount < minRequiredNormalSlots) {
      normalColumnCount = minRequiredNormalSlots;
      console.warn(`메인 영역 슬롯 너비 제한: ${minRequiredNormalSlots}개 이상의 슬롯이 필요합니다.`);
    }
    
    // 단내림 영역 컬럼 수
    if (spaceInfo.droppedCeilingDoorCount !== undefined && spaceInfo.droppedCeilingDoorCount > 0) {
      droppedColumnCount = spaceInfo.droppedCeilingDoorCount;
    } else {
      droppedColumnCount = SpaceCalculator.getDefaultColumnCount(droppedAreaInternalWidth);
      console.log('🎯 단내림 컬럼 수 (자동계산):', droppedColumnCount, 'from width:', droppedAreaInternalWidth);
    }
    
    // 단내림 영역 슬롯 너비가 600mm를 초과하지 않도록 검증
    const minRequiredDroppedSlots = Math.ceil(droppedAreaInternalWidth / MAX_SLOT_WIDTH);
    if (droppedColumnCount < minRequiredDroppedSlots) {
      droppedColumnCount = minRequiredDroppedSlots;
      console.warn(`단내림 영역 슬롯 너비 제한: ${minRequiredDroppedSlots}개 이상의 슬롯이 필요합니다.`);
    }
    
    // 각 영역의 컬럼 너비 계산 - 나머지를 앞쪽 슬롯에 분배
    const normalBaseWidth = Math.floor(normalAreaInternalWidth / normalColumnCount);
    const normalRemainder = normalAreaInternalWidth % normalColumnCount;
    
    const droppedBaseWidth = Math.floor(droppedAreaInternalWidth / droppedColumnCount);
    const droppedRemainder = droppedAreaInternalWidth % droppedColumnCount;
    
    // 슬롯별 실제 너비 배열 생성
    const normalSlotWidths: number[] = [];
    const droppedSlotWidths: number[] = [];
    
    // 세미스탠딩 노서라운드인 경우 특별 처리
    if (spaceInfo.surroundType === 'no-surround' && 
        (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing')) {
      
      // 메인 영역 슬롯 너비 계산
      for (let i = 0; i < normalColumnCount; i++) {
        let slotWidth = i < normalRemainder ? normalBaseWidth + 1 : normalBaseWidth;
        
        // 왼쪽 단내림인 경우, 메인 영역의 마지막 슬롯에 엔드패널이 있을 수 있음
        if (droppedPosition === 'left' && !spaceInfo.wallConfig?.right && i === normalColumnCount - 1) {
          slotWidth -= END_PANEL_THICKNESS;
        }
        // 오른쪽 단내림인 경우, 메인 영역의 첫 슬롯에 엔드패널이 있을 수 있음
        else if (droppedPosition === 'right' && !spaceInfo.wallConfig?.left && i === 0) {
          slotWidth -= END_PANEL_THICKNESS;
        }
        
        normalSlotWidths.push(slotWidth);
      }
      
      // 단내림 영역 슬롯 너비 계산
      for (let i = 0; i < droppedColumnCount; i++) {
        let slotWidth = i < droppedRemainder ? droppedBaseWidth + 1 : droppedBaseWidth;
        
        // 왼쪽 단내림이고 왼쪽 벽이 없는 경우, 첫 슬롯에 엔드패널
        if (droppedPosition === 'left' && !spaceInfo.wallConfig?.left && i === 0) {
          slotWidth -= END_PANEL_THICKNESS;
        }
        // 오른쪽 단내림이고 오른쪽 벽이 없는 경우, 마지막 슬롯에 엔드패널
        else if (droppedPosition === 'right' && !spaceInfo.wallConfig?.right && i === droppedColumnCount - 1) {
          slotWidth -= END_PANEL_THICKNESS;
        }
        
        droppedSlotWidths.push(slotWidth);
      }
    } else {
      // 기존 로직: 서라운드 또는 빌트인
      for (let i = 0; i < normalColumnCount; i++) {
        normalSlotWidths.push(i < normalRemainder ? normalBaseWidth + 1 : normalBaseWidth);
      }
      
      for (let i = 0; i < droppedColumnCount; i++) {
        droppedSlotWidths.push(i < droppedRemainder ? droppedBaseWidth + 1 : droppedBaseWidth);
      }
    }
    
    // 호환성을 위한 평균 너비 (기존 코드용)
    const normalColumnWidth = normalBaseWidth;
    const droppedColumnWidth = droppedBaseWidth;
    
    // 실제 사용되는 너비 (반올림 오차 포함)
    const normalUsedWidth = normalColumnWidth * normalColumnCount;
    const droppedUsedWidth = droppedColumnWidth * droppedColumnCount;
    
    // 반올림으로 인한 손실된 공간
    const normalLostSpace = normalAreaInternalWidth - normalUsedWidth;
    const droppedLostSpace = droppedAreaInternalWidth - droppedUsedWidth;
    
    // 실제 경계 계산 확인
    const normalEndX = normalStartX + normalAreaInternalWidth;
    const droppedEndX = droppedStartX + droppedAreaInternalWidth;
    
    console.log('🎯 단내림 경계 상세 분석:', {
      서라운드타입: spaceInfo.surroundType,
      단내림위치: droppedPosition,
      메인구간: {
        시작X: normalStartX,
        끝X: normalEndX,
        내부너비: normalAreaInternalWidth,
        슬롯너비: normalColumnWidth,
        슬롯개수: normalColumnCount
      },
      단내림구간: {
        시작X: droppedStartX,
        끝X: droppedEndX,
        내부너비: droppedAreaInternalWidth,
        슬롯너비: droppedColumnWidth,
        슬롯개수: droppedColumnCount
      },
      경계갭: droppedPosition === 'right' 
        ? droppedStartX - normalEndX
        : normalStartX - droppedEndX,
      '예상갭': 0
    });
    
    // 최종 검증 (디버깅용)
    if (normalColumnWidth > MAX_SLOT_WIDTH) {
      console.error(`⚠️ 메인 영역 슬롯 너비가 600mm를 초과합니다: ${normalColumnWidth}mm`);
    }
    if (droppedColumnWidth > MAX_SLOT_WIDTH) {
      console.error(`⚠️ 단내림 영역 슬롯 너비가 600mm를 초과합니다: ${droppedColumnWidth}mm`);
    }
    
    
    console.log('🎯 [calculateZoneSlotInfo] 최종 계산 결과:', {
      메인구간: {
        외부너비: normalAreaOuterWidth,
        내부너비: normalAreaInternalWidth,
        슬롯개수: normalColumnCount,
        슬롯너비: normalColumnWidth,
        시작위치: normalStartX,
        끝위치: normalStartX + normalAreaInternalWidth
      },
      단내림구간: {
        외부너비: droppedAreaOuterWidth,
        내부너비: droppedAreaInternalWidth,
        슬롯개수: droppedColumnCount,
        슬롯너비: droppedColumnWidth,
        시작위치: droppedStartX,
        끝위치: droppedStartX + droppedAreaInternalWidth
      },
      프레임정보: {
        왼쪽프레임: frameThickness.left,
        오른쪽프레임: frameThickness.right,
        서라운드타입: spaceInfo.surroundType,
        단내림위치: droppedPosition
      },
      갭확인: {
        '메인끝-단내림시작': (droppedPosition === 'right') 
          ? (droppedStartX - (normalStartX + normalAreaInternalWidth))
          : (normalStartX - (droppedStartX + droppedAreaInternalWidth)),
        '예상값': 0
      },
      설정값: {
        mainDoorCount: spaceInfo.mainDoorCount,
        droppedCeilingDoorCount: spaceInfo.droppedCeilingDoorCount,
        customColumnCount: customColumnCount
      }
    });
    
    const result = {
      normal: {
        startX: normalStartX,
        width: normalAreaInternalWidth,
        columnCount: normalColumnCount,
        columnWidth: normalColumnWidth,
        slotWidths: normalSlotWidths
      },
      dropped: {
        startX: droppedStartX,
        width: droppedAreaInternalWidth,
        columnCount: droppedColumnCount,
        columnWidth: droppedColumnWidth,
        slotWidths: droppedSlotWidths
      }
    };
    
    console.log('🔍🔍 [calculateZoneSlotInfo] 최종 반환값:', {
      hasNormal: !!result.normal,
      hasDropped: !!result.dropped,
      normal: result.normal,
      dropped: result.dropped
    });
    
    return result;
  }

  /**
   * 내경 너비에 따른 컬럼 수 제한 계산
   */
  static getColumnLimits(internalWidth: number): { minColumns: number; maxColumns: number } {
    // 슬롯 크기 제약 조건 (400mm ~ 600mm)
    const MIN_SLOT_WIDTH = 400;
    const MAX_SLOT_WIDTH = 600;
    
    // 최소 컬럼 수: 슬롯이 600mm를 초과하지 않도록
    const minColumns = Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH));
    
    // 최대 컬럼 수: 슬롯이 400mm 미만이 되지 않도록
    const maxColumns = Math.max(1, Math.floor(internalWidth / MIN_SLOT_WIDTH));
    
    // 최소값이 최대값보다 큰 경우 (너무 좁은 공간) 처리
    if (minColumns > maxColumns) {
      return { minColumns: 1, maxColumns: 1 };
    }
    
    console.log('🔧 getColumnLimits 계산:', {
      internalWidth,
      minColumns,
      maxColumns,
      '최소 슬롯 크기 (최대 컬럼수일 때)': Math.floor(internalWidth / maxColumns),
      '최대 슬롯 크기 (최소 컬럼수일 때)': Math.floor(internalWidth / minColumns)
    });
    
    return { minColumns, maxColumns };
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