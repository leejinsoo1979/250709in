import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { SpaceCalculator } from './SpaceCalculator';
import { calculateFrameThickness, SURROUND_FRAME_THICKNESS } from '../../viewer3d/utils/geometry';

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
      
      // 듀얼 가구용 위치 계산
      const dualColumnPositions = [];
      const threeUnitDualPositions = [];
      
      // 인접한 두 컬럼의 중심점들 사이의 중점을 계산
      for (let i = 0; i < columnCount - 1; i++) {
        const leftColumnCenter = columnPositions[i];
        const rightColumnCenter = columnPositions[i + 1];
        const dualCenterPosition = (leftColumnCenter + rightColumnCenter) / 2;
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
          const dualCenter = (SpaceCalculator.threeUnitsToMm(leftSlotThreeUnits) + SpaceCalculator.threeUnitsToMm(rightSlotThreeUnits)) / 2;
          zones.normal.threeUnitDualPositions.push(SpaceCalculator.mmToThreeUnits(dualCenter));
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
          const dualCenter = (SpaceCalculator.threeUnitsToMm(leftSlotThreeUnits) + SpaceCalculator.threeUnitsToMm(rightSlotThreeUnits)) / 2;
          zones.dropped.threeUnitDualPositions.push(SpaceCalculator.mmToThreeUnits(dualCenter));
        }
      }
      
      // 단내림이 있어도 전체 영역의 slotWidths 생성 (호환성을 위해)
      const baseWidth = Math.floor(internalWidth / columnCount);
      const remainder = internalWidth % columnCount;
      const slotWidths: number[] = [];
      for (let i = 0; i < columnCount; i++) {
        slotWidths.push(i < remainder ? baseWidth + 1 : baseWidth);
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
    
    // 각 컬럼의 너비 계산 - 나머지를 앞쪽 슬롯에 분배
    const baseWidth = Math.floor(internalWidth / columnCount);
    const remainder = internalWidth % columnCount;
    
    // 슬롯별 실제 너비 배열 생성
    const slotWidths: number[] = [];
    for (let i = 0; i < columnCount; i++) {
      // 앞쪽 remainder개 슬롯은 1mm씩 더 크게
      slotWidths.push(i < remainder ? baseWidth + 1 : baseWidth);
    }
    
    // 호환성을 위한 평균 너비
    const columnWidth = baseWidth;
    
    // 좌우 패딩은 0 (모든 공간을 슬롯에 할당)
    const leftPadding = 0;
    
    // 내경의 시작 X좌표 (Three.js 좌표계, 중앙이 0)
    // 전체 공간이 중앙 정렬되므로 (-전체폭/2 + 좌측여백)가 내경 시작점
    let internalStartX;
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드: 전체 너비의 중앙에서 왼쪽 갭만큼 이동한 위치가 시작점
      const leftGap = spaceInfo.gapConfig?.left || 0;
      internalStartX = -(totalWidth / 2) + leftGap + leftPadding;
    } else {
      // 서라운드: 좌측 프레임 두께 + 좌측 패딩 고려
      internalStartX = -(totalWidth / 2) + frameThickness.left + leftPadding;
    }
    
    // 각 컬럼 경계의 위치 계산 (실제 슬롯 너비 사용)
    const columnBoundaries = [];
    let currentX = internalStartX;
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
    
    // 인접한 두 슬롯의 중심점들 사이의 중점을 계산
    for (let i = 0; i < columnCount - 1; i++) {
      const leftSlotCenter = columnPositions[i];
      const rightSlotCenter = columnPositions[i + 1];
      const dualCenterPosition = (leftSlotCenter + rightSlotCenter) / 2;
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
      
      // 프레임을 고려한 내부 시작점 (노서라운드의 경우 gapConfig 사용)
      let internalStartX: number;
      if (spaceInfo.surroundType === 'no-surround') {
        const leftGap = spaceInfo.gapConfig?.left || 0;
        internalStartX = -(spaceInfo.width / 2) + leftGap;
      } else {
        internalStartX = -(spaceInfo.width / 2) + frameThickness.left;
      }
      
      // 슬롯별 실제 너비 배열 생성
      const baseWidth = Math.floor(internalWidth / columnCount);
      const remainder = internalWidth % columnCount;
      const slotWidths: number[] = [];
      for (let i = 0; i < columnCount; i++) {
        slotWidths.push(i < remainder ? baseWidth + 1 : baseWidth);
      }
      
      return {
        normal: {
          startX: internalStartX,
          width: internalWidth,
          columnCount,
          columnWidth,
          slotWidths
        },
        dropped: null
      };
    }
    
    // 단내림이 활성화된 경우
    const totalWidth = spaceInfo.width;
    const droppedWidth = spaceInfo.droppedCeiling.width || 900;
    const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
    
    // 전체 내부 너비 (프레임 제외)
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
    
    // 시작 위치 계산 (노서라운드의 경우 gapConfig 사용)
    let internalStartX: number;
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드: 전체 너비의 중앙에서 왼쪽 갭만큼 이동한 위치가 시작점
      const leftGap = spaceInfo.gapConfig?.left || 0;
      internalStartX = -(totalWidth / 2) + leftGap;
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
        // 노서라운드: 단내림 경계에서는 갭 없이 바로 연결
        droppedAreaInternalWidth = droppedAreaOuterWidth - (spaceInfo.gapConfig?.left || 0);
        droppedStartX = internalStartX; // 수정된 internalStartX 사용
        normalAreaInternalWidth = normalAreaOuterWidth - (spaceInfo.gapConfig?.right || 0);
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
        // 노서라운드: 단내림 경계에서는 갭 없이 바로 연결
        normalAreaInternalWidth = normalAreaOuterWidth - (spaceInfo.gapConfig?.left || 0);
        normalStartX = internalStartX; // 수정된 internalStartX 사용
        droppedAreaInternalWidth = droppedAreaOuterWidth - (spaceInfo.gapConfig?.right || 0);
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
    } else {
      // 단내림이 있는 경우 customColumnCount를 사용하지 않고 자동 계산
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
    
    // 단내림 영역은 최소 2개 슬롯 보장
    if (droppedColumnCount < 2) {
      droppedColumnCount = 2;
      console.log('🔧 단내림 영역 최소 슬롯 수 보장: 2개로 설정');
    }
    
    // 각 영역의 컬럼 너비 계산 - 나머지를 앞쪽 슬롯에 분배
    const normalBaseWidth = Math.floor(normalAreaInternalWidth / normalColumnCount);
    const normalRemainder = normalAreaInternalWidth % normalColumnCount;
    
    const droppedBaseWidth = Math.floor(droppedAreaInternalWidth / droppedColumnCount);
    const droppedRemainder = droppedAreaInternalWidth % droppedColumnCount;
    
    // 슬롯별 실제 너비 배열 생성
    const normalSlotWidths: number[] = [];
    for (let i = 0; i < normalColumnCount; i++) {
      // 앞쪽 remainder개 슬롯은 1mm씩 더 크게
      normalSlotWidths.push(i < normalRemainder ? normalBaseWidth + 1 : normalBaseWidth);
    }
    
    const droppedSlotWidths: number[] = [];
    for (let i = 0; i < droppedColumnCount; i++) {
      droppedSlotWidths.push(i < droppedRemainder ? droppedBaseWidth + 1 : droppedBaseWidth);
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
    
    return {
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
  }

  /**
   * 내경 너비에 따른 컬럼 제한 계산
   * @param internalWidth 내경 너비 (mm)
   * @returns 컬럼 제한 정보
   */
  static getColumnLimits(internalWidth: number): { minColumns: number; maxColumns: number } {
    // 최소 컬럼 수는 1개
    const minColumns = 1;
    
    // 내경 너비에 따른 최대 컬럼 수 계산
    let maxColumns = 1;
    
    if (internalWidth >= 600) {
      maxColumns = 2;
    }
    if (internalWidth >= 900) {
      maxColumns = 3;
    }
    if (internalWidth >= 1200) {
      maxColumns = 4;
    }
    if (internalWidth >= 1500) {
      maxColumns = 5;
    }
    if (internalWidth >= 1800) {
      maxColumns = 6;
    }
    if (internalWidth >= 2100) {
      maxColumns = 7;
    }
    if (internalWidth >= 2400) {
      maxColumns = 8;
    }
    
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