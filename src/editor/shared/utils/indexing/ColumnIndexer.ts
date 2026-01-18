import { SpaceInfo } from '@/store/core/spaceConfigStore';
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
  optimizedGapConfig?: {          // 자동 최적화된 이격거리 (노서라운드 모드)
    left: number;
    right: number;
  };
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
  static calculateSpaceIndexing(spaceInfo: SpaceInfo, hasLeftFurniture: boolean = false, hasRightFurniture: boolean = false): SpaceIndexingResult {
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
      console.log('🟣🟣🟣 [ColumnIndexer] 단내림 블록 진입:', {
        enabled: spaceInfo.droppedCeiling?.enabled,
        droppedCeiling: spaceInfo.droppedCeiling
      });
      // 전체 영역에 대한 기본 계산 수행
      const totalWidth = spaceInfo.width;
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo, hasLeftFurniture, hasRightFurniture);
      const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
      
      // 전체 영역의 시작점
      let internalStartX;
      if (spaceInfo.surroundType === 'no-surround') {
        let leftReduction = 0;
        
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          // 빌트인: 양쪽 벽이 있으므로 이격거리만 고려
          leftReduction = spaceInfo.gapConfig?.left || 2;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          // 세미스탠딩: gapConfig의 left 값을 그대로 사용
          leftReduction = spaceInfo.gapConfig?.left || 0;
          console.log('🚨 [ColumnIndexer] 세미스탠딩 좌측 reduction 계산:', {
            wallConfig: spaceInfo.wallConfig,
            gapConfig: spaceInfo.gapConfig,
            leftReduction,
            totalWidth
          });
        } else {
          // 프리스탠딩: 엔드패널도 슬롯에 포함되므로 0
          leftReduction = 0;
        }
        
        internalStartX = -(totalWidth / 2) + leftReduction;
        console.log('🚨 [ColumnIndexer] internalStartX 계산:', {
          totalWidth,
          leftReduction,
          internalStartX,
          '가구 시작 위치': internalStartX
        });
      } else {
        internalStartX = -(totalWidth / 2) + frameThickness.left;
      }
      
      // 전체 영역의 컬럼 수 (호환성을 위해 유지)
      // mainDoorCount > customColumnCount > 자동 계산 우선순위
      let columnCount;
      if (spaceInfo.mainDoorCount !== undefined && spaceInfo.mainDoorCount > 0) {
        console.log('📐 Using mainDoorCount:', spaceInfo.mainDoorCount);
        columnCount = spaceInfo.mainDoorCount;
      } else if (spaceInfo.customColumnCount) {
        console.log('📐 Using customColumnCount:', spaceInfo.customColumnCount);
        columnCount = spaceInfo.customColumnCount;
      } else {
        columnCount = SpaceCalculator.getDefaultColumnCount(internalWidth);
        console.log('📐 Using auto calculation:', columnCount);
      }
      
      // 전체 영역 기준 컬럼 너비 (소수점 유지)
      const columnWidth = internalWidth / columnCount;
      
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
      // columnPositions는 이미 Room 좌표계 (internalStartX가 이미 변환됨)
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
        // 이미 Room 좌표계이므로 그대로 변환
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
          // 이미 Room 좌표계이므로 그대로 변환
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
          // 이미 Room 좌표계이므로 그대로 변환
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
      
      // 단내림이 있어도 전체 영역의 slotWidths 생성 (호환성을 위해) - 0.5 단위 균등 분할
      // 소수점 2자리까지 정확한 균등분할
      const exactSlotWidth = parseFloat((internalWidth / columnCount).toFixed(2));
      const slotWidths: number[] = [];

      // 모든 슬롯을 동일한 너비로 설정 (소수점 2자리)
      for (let i = 0; i < columnCount; i++) {
        slotWidths.push(exactSlotWidth);
      }

      console.log('🟣🟣🟣 [ColumnIndexer] 단내림 있음 - zones 포함 반환:', {
        hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled,
        zonesIncluded: !!zones,
        normalZone: zones.normal,
        droppedZone: zones.dropped
      });

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
    const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
    
    // 전체 폭과 내경 계산
    const totalWidth = spaceInfo.width;
    
    // 내경 계산: 노서라운드인 경우 이격거리 고려, 서라운드인 경우 프레임 두께 고려
    // 빌트인 노서라운드의 경우 최적화된 이격거리 사용
    // 노서라운드 모드인지 확인
    const isNoSurround = spaceInfo.surroundType === 'no-surround';
    
    // 일단 기본 내경 계산
    let internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo, hasLeftFurniture, hasRightFurniture);
    
    // 컬럼 수 결정 로직
    let columnCount: number;
    
    // mainDoorCount가 설정되어 있으면 최우선 사용 (4분할 창 등)
    if (spaceInfo.mainDoorCount !== undefined && spaceInfo.mainDoorCount > 0) {
      columnCount = spaceInfo.mainDoorCount;
      console.log('📐 Using mainDoorCount:', columnCount);
    } else if (spaceInfo.customColumnCount) {
      // 사용자 지정 컬럼 수가 있으면 사용
      columnCount = spaceInfo.customColumnCount;
      console.log('📐 Using customColumnCount:', columnCount);
    } else {
      // 기존 자동 계산 로직
      columnCount = SpaceCalculator.getDefaultColumnCount(internalWidth);
      console.log('📐 Using auto-calculated columnCount:', columnCount);
    }
    
    // 노서라운드 모드에서 최적 이격거리 자동 선택 (벽이 있는 경우만 적용)
    let optimizedGapConfig = spaceInfo.gapConfig;
    console.log('🔍 이격거리 자동 조정 체크:', {
      isNoSurround,
      wallConfig: spaceInfo.wallConfig,
      'wallConfig.left': spaceInfo.wallConfig?.left,
      'wallConfig.right': spaceInfo.wallConfig?.right,
      '조건1_노서라운드': isNoSurround,
      '조건2_wallConfig존재': !!spaceInfo.wallConfig,
      '조건3_벽있음': !!(spaceInfo.wallConfig?.left || spaceInfo.wallConfig?.right),
      '전체조건': isNoSurround && spaceInfo.wallConfig && (spaceInfo.wallConfig.left || spaceInfo.wallConfig.right),
      gapConfig: spaceInfo.gapConfig,
      총너비: totalWidth,
      컬럼수: columnCount
    });
    
    // 빌트인은 기본적으로 양쪽벽, 세미스탠딩은 한쪽벽
    const hasWalls = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
                     (spaceInfo.wallConfig && (spaceInfo.wallConfig.left || spaceInfo.wallConfig.right));
    
    // 노서라운드 최적 이격거리 자동 선택 비활성화
    // 슬롯 너비와 가구 너비를 정확히 일치시키기 위해 자동 최적화 제거
    // 사용자가 지정한 이격거리를 그대로 사용
    if (false && isNoSurround && hasWalls) { // 비활성화됨
      const validGapSums = SpaceCalculator.selectOptimalGapSum(totalWidth, columnCount);
      if (validGapSums.length > 0) {
        // 첫 번째 유효한 이격거리 합 사용 (보통 가장 작은 값)
        const optimalGapSum = validGapSums[0];
        
        // 양쪽벽인 경우 정수로 분배, 한쪽벽인 경우 해당 쪽만 설정
        const isBuiltin = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in';
        if (isBuiltin || (spaceInfo.wallConfig?.left && spaceInfo.wallConfig?.right)) {
          // 양쪽벽: 정수로 분배 (홀수면 좌측을 적게)
          const leftGap = Math.floor(optimalGapSum / 2);
          const rightGap = optimalGapSum - leftGap;
          optimizedGapConfig = {
            left: leftGap,
            right: rightGap
          };
        } else if (spaceInfo.wallConfig?.left) {
          // 왼쪽벽만: 왼쪽에만 이격
          optimizedGapConfig = {
            left: optimalGapSum,
            right: 0
          };
        } else if (spaceInfo.wallConfig?.right) {
          // 오른쪽벽만: 오른쪽에만 이격
          optimizedGapConfig = {
            left: 0,
            right: optimalGapSum
          };
        }
        
        console.log('🎯 노서라운드 최적 이격거리 자동 선택:', {
          전체너비: totalWidth,
          슬롯수: columnCount,
          유효한_이격합: validGapSums,
          선택된_이격합: optimalGapSum,
          좌이격: optimizedGapConfig.left,
          우이격: optimizedGapConfig.right,
          내경: totalWidth - optimizedGapConfig.left - optimizedGapConfig.right,
          슬롯폭: (totalWidth - optimizedGapConfig.left - optimizedGapConfig.right) / columnCount
        });
        
        // 최적화된 이격거리로 내경 재계산
        internalWidth = totalWidth - optimizedGapConfig.left - optimizedGapConfig.right;
      }
    }
    
    // 슬롯별 실제 너비 배열 생성
    const slotWidths: number[] = [];
    
    if (isNoSurround && spaceInfo.installType === 'freestanding') {
      // 노서라운드 프리스탠딩: 전체너비를 균등 분할 (소수점 2자리)
      const exactSlotWidth = parseFloat((totalWidth / columnCount).toFixed(2));

      // 모든 슬롯을 동일한 너비로 설정
      for (let i = 0; i < columnCount; i++) {
        slotWidths.push(exactSlotWidth);
      }
      
      // 디버깅 로그
      console.log('🔧 노서라운드 벽없음 슬롯 계산:', {
        '전체 공간 너비': totalWidth,
        '컬럼 수': columnCount,
        '평균 슬롯 너비': totalWidth / columnCount,
        '슬롯 너비 배열': slotWidths,
        '예시': `${slotWidths[0]} / ${slotWidths[1] || '...'} / ... / ${slotWidths[slotWidths.length - 1]}`
      });
    } else {
      // 서라운드 모드 또는 노서라운드 빌트인: 균등 분할
      // 빌트인의 경우 최적화된 이격거리 사용
      let actualInternalWidth = internalWidth;
      if (isNoSurround && (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') && optimizedGapConfig) {
        actualInternalWidth = totalWidth - optimizedGapConfig.left - optimizedGapConfig.right;
      }
      const exactSlotWidth = parseFloat((actualInternalWidth / columnCount).toFixed(2));

      // 슬롯 너비를 소수점 2자리로 반올림하여 사용
      for (let i = 0; i < columnCount; i++) {
        slotWidths.push(exactSlotWidth);
      }
      
      console.log('🎯 빌트인/서라운드 슬롯 너비 계산:', {
        actualInternalWidth,
        columnCount,
        exactSlotWidth,
        optimizedGapConfig,
        '계산식': `${actualInternalWidth} / ${columnCount} = ${exactSlotWidth}`
      });
    }
    
    // 호환성을 위한 평균 너비 (소수점 유지)
    const columnWidth = internalWidth / columnCount;
    
    // 좌우 패딩은 0 (모든 공간을 슬롯에 할당)
    const leftPadding = 0;
    
    // 내경의 시작 X좌표 (Three.js 좌표계, 중앙이 0)
    // 전체 공간이 중앙 정렬되므로 (-전체폭/2 + 좌측여백)가 내경 시작점
    // 슬롯 가이드용 시작점 계산 - 엔드패널 바로 안쪽에서 시작
    let internalStartX;
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드: 설치 형태에 따라 좌측 감산값을 결정
      let leftReduction = 0;

      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인은 양쪽 벽을 기준으로 하므로 gapConfig 기반으로 계산
        leftReduction = optimizedGapConfig?.left || spaceInfo.gapConfig?.left || 2;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 한쪽 벽 모드: 벽이 있는 쪽만 이격거리 적용
        // 좌측 벽이면 좌측 이격거리, 우측 벽이면 우측은 이격거리가 있지만 좌측 시작점은 0
        if (spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right) {
          // 좌측 벽: 좌측 이격거리 적용
          leftReduction = optimizedGapConfig?.left || spaceInfo.gapConfig?.left || 2;
        } else if (!spaceInfo.wallConfig?.left && spaceInfo.wallConfig?.right) {
          // 우측 벽: 좌측은 엔드패널이므로 이격거리 없음
          leftReduction = 0;
        } else {
          // fallback (wallConfig가 없는 경우 wallPosition 사용)
          if (spaceInfo.wallPosition === 'left') {
            leftReduction = optimizedGapConfig?.left || spaceInfo.gapConfig?.left || 2;
          } else {
            leftReduction = 0;
          }
        }
        
        console.log('🚨 [ColumnIndexer] 한쪽벽 노서라운드 이격거리 계산:', {
          installType: spaceInfo.installType,
          wallConfig: spaceInfo.wallConfig,
          wallPosition: spaceInfo.wallPosition,
          gapConfig: spaceInfo.gapConfig,
          optimizedGapConfig,
          leftReduction,
          '벽위치': spaceInfo.wallConfig?.left ? '좌측' : '우측'
        });
      } else {
        // 프리스탠딩: 엔드패널 두께를 gapConfig로 전달받으므로 그대로 반영
        leftReduction = optimizedGapConfig?.left || spaceInfo.gapConfig?.left || 0;
      }

      internalStartX = -(totalWidth / 2) + leftReduction + leftPadding;
      
      console.log('🚨🚨 [ColumnIndexer] 노서라운드 시작 위치 계산:', {
        totalWidth,
        leftReduction,
        leftPadding,
        internalStartX,
        '좌측벽경계': -(totalWidth / 2),
        '이격거리적용후': -(totalWidth / 2) + leftReduction
      });
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
        '첫번째슬롯위치mm': columnPositions[0]?.toFixed(2),
        '첫번째슬롯위치3D': threeUnitPositions[0]?.toFixed(3),
        '마지막슬롯위치3D': threeUnitPositions[threeUnitPositions.length - 1]?.toFixed(3),
        '좌측벽경계': (-(totalWidth / 2)).toFixed(2),
        '첫슬롯좌측경계': columnBoundaries[0]?.toFixed(2),
        '첫슬롯중심': columnPositions[0]?.toFixed(2),
        '실제이격거리': (columnBoundaries[0] + (totalWidth / 2)).toFixed(2)
      });
    }
    
    // 듀얼가구용 두 컬럼 경계 중심 위치 계산 추가
    const dualColumnPositions = [];
    const threeUnitDualPositions = [];
    
    // 인접한 두 컬럼의 경계 위치를 사용 (컬럼 경계가 듀얼 가구의 중심)
    for (let i = 1; i < columnCount; i++) {
      const dualCenterPosition = columnBoundaries[i]; // 컬럼 경계가 듀얼 가구의 중심
      dualColumnPositions.push(dualCenterPosition);
      threeUnitDualPositions.push(SpaceCalculator.mmToThreeUnits(dualCenterPosition));
    }

    console.log('🟡🟡🟡 [ColumnIndexer] 단내림 없음 - zones 없이 반환:', {
      hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled,
      columnCount,
      columnWidth,
      internalWidth
    });

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
      threeUnitColumnWidth: SpaceCalculator.mmToThreeUnits(columnWidth), // Three.js 단위 슬롯 너비
      ...(optimizedGapConfig && { optimizedGapConfig }) // 자동 최적화된 이격거리 (있으면 포함)
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
  static calculateZoneSlotInfo(spaceInfo: SpaceInfo, customColumnCount?: number, hasLeftFurniture: boolean = false, hasRightFurniture: boolean = false) {
    const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
    const MAX_SLOT_WIDTH = 600; // 슬롯 최대 너비 제한
    
    if (!spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 비활성화된 경우 전체 영역을 일반 영역으로 반환
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo, hasLeftFurniture, hasRightFurniture);
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
      
      const columnWidth = internalWidth / columnCount;
      
      // 노서라운드의 경우 사용 가능 너비 재계산
      let actualInternalWidth = internalWidth;
      let adjustedLeftGap = 0;
      let adjustedRightGap = 0;
      
      if (spaceInfo.surroundType === 'no-surround') {
        // 기본 gap 값 가져오기
        let leftGap = spaceInfo.gapConfig?.left || 0;
        let rightGap = spaceInfo.gapConfig?.right || 0;
        
        // 빌트인: 사용자가 설정한 gapConfig 값을 그대로 사용 (자동 조정 비활성화)
        // calculateSpaceIndexing과 일관성 유지
        if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          // 사용자 설정값 또는 기본값 2mm 사용
          leftGap = spaceInfo.gapConfig?.left ?? 2;
          rightGap = spaceInfo.gapConfig?.right ?? 2;

          console.log('📐 빌트인 이격거리 (gapConfig 사용):', {
            좌측이격거리: leftGap,
            우측이격거리: rightGap,
            전체너비: spaceInfo.width,
            사용가능너비: spaceInfo.width - leftGap - rightGap
          });

        } else if (spaceInfo.installType === 'freestanding') {
          // 프리스탠딩: 엔드패널 포함, 전체 너비를 슬롯에 분할
          leftGap = 0;
          rightGap = 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          const baseWidth = spaceInfo.width;

          // 벽이 있는 쪽 확인하고 2-5mm 범위에서 조정
          if (spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right) {
            // 좌측 벽: 좌측 이격거리만 조정 (2-5mm), 우측은 엔드패널이므로 0
            let adjusted = false;
            for (let gap = 2; gap <= 5; gap++) {
              const availableWidth = baseWidth - gap;  // 좌측 이격거리만 뺌
              const slotWidth = availableWidth / columnCount;

              if (Number.isInteger(slotWidth)) {
                leftGap = gap;
                rightGap = 0;  // 우측은 엔드패널
                console.log('✅ 좌측벽 정수 슬롯 너비 조정:', {
                  조정된좌측이격거리: gap,
                  우측엔드패널: '포함됨 (gap=0)',
                  슬롯너비: slotWidth,
                  사용가능너비: availableWidth
                });
                adjusted = true;
                break;
              }
            }

            if (!adjusted) {
              leftGap = spaceInfo.gapConfig?.left || 2;
              rightGap = 0;  // 우측은 엔드패널
            }

          } else if (!spaceInfo.wallConfig?.left && spaceInfo.wallConfig?.right) {
            // 우측 벽: 우측 이격거리만 조정 (2-5mm), 좌측은 엔드패널이므로 0
            let adjusted = false;
            for (let gap = 2; gap <= 5; gap++) {
              const availableWidth = baseWidth - gap;  // 우측 이격거리만 뺌
              const slotWidth = availableWidth / columnCount;

              if (Number.isInteger(slotWidth)) {
                leftGap = 0;  // 좌측은 엔드패널
                rightGap = gap;
                console.log('✅ 우측벽 정수 슬롯 너비 조정:', {
                  좌측엔드패널: '포함됨 (gap=0)',
                  조정된우측이격거리: gap,
                  슬롯너비: slotWidth,
                  사용가능너비: availableWidth
                });
                adjusted = true;
                break;
              }
            }

            if (!adjusted) {
              leftGap = 0;  // 좌측은 엔드패널
              rightGap = spaceInfo.gapConfig?.right || 2;
            }
          }
        }
        
        adjustedLeftGap = leftGap;
        adjustedRightGap = rightGap;
        
        // 전체 너비에서 gap을 뺀 실제 사용 가능 너비
        // 세미스탠딩의 경우 벽이 있는 쪽만 빼야 함
        if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          if (spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right) {
            // 좌측 벽: 좌측 이격거리만 뺌
            actualInternalWidth = spaceInfo.width - leftGap;
          } else if (!spaceInfo.wallConfig?.left && spaceInfo.wallConfig?.right) {
            // 우측 벽: 우측 이격거리만 뺌
            actualInternalWidth = spaceInfo.width - rightGap;
          } else {
            // 기본값 (양쪽 모두 뺌)
            actualInternalWidth = spaceInfo.width - leftGap - rightGap;
          }
        } else {
          // 빌트인, 프리스탠딩 등: 양쪽 모두 뺌
          actualInternalWidth = spaceInfo.width - leftGap - rightGap;
        }
        
        console.log('🔍 노서라운드 너비 계산:', {
          installType: spaceInfo.installType,
          totalWidth: spaceInfo.width,
          '원래leftGap': spaceInfo.gapConfig?.left,
          '원래rightGap': spaceInfo.gapConfig?.right,
          '조정leftGap': leftGap,
          '조정rightGap': rightGap,
          actualInternalWidth,
          '계산식': `${spaceInfo.width} - ${leftGap} - ${rightGap} = ${actualInternalWidth}`,
          '슬롯너비': actualInternalWidth / columnCount
        });
      }
      
      // 프레임을 고려한 내부 시작점 (노서라운드의 경우 엔드패널과 gapConfig 고려)
      // 슬롯 가이드용 시작점 계산 - 엔드패널도 슬롯에 포함
      let internalStartX: number;
      let leftReduction = 0; // 변수를 if 블록 밖에 선언
      
      if (spaceInfo.surroundType === 'no-surround') {
        // 노서라운드에서는 조정된 gap 값 사용
        leftReduction = adjustedLeftGap;
        
        // mm 단위로 계산: 중심이 0이므로 좌측 끝은 -width/2
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
        '시작점(mm)': internalStartX * 100, // Three.js 단위를 mm로 변환
        actualInternalWidth,
        '끝점(mm)': (internalStartX * 100) + actualInternalWidth,
        전체너비: spaceInfo.width
      });
      
      // 슬롯별 실제 너비 배열 생성
      const slotWidths: number[] = [];
      
      if (spaceInfo.surroundType === 'no-surround') {
        // 노서라운드: actualInternalWidth를 균등 분할
        const exactSlotWidth = parseFloat((actualInternalWidth / columnCount).toFixed(2));

        for (let i = 0; i < columnCount; i++) {
          slotWidths.push(exactSlotWidth);
        }
      } else {
        // 서라운드 모드: 소수점 2자리 균등분할
        const exactSlotWidth = parseFloat((internalWidth / columnCount).toFixed(2));

        for (let i = 0; i < columnCount; i++) {
          slotWidths.push(exactSlotWidth);
        }
      }
      
      // 한쪽벽모드 체크
      const isSemistanding = spaceInfo.surroundType === 'no-surround' && 
        (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing');
      const isLeftWall = spaceInfo.wallConfig?.left === true && spaceInfo.wallConfig?.right === false;
      
      console.log('🚨🚨🚨 calculateZoneSlotInfo - 한쪽벽모드 최종 경계:', {
        surroundType: spaceInfo.surroundType,
        installType: spaceInfo.installType,
        wallConfig: spaceInfo.wallConfig,
        '원래gapConfig': spaceInfo.gapConfig,
        '조정된Gap': { left: adjustedLeftGap, right: adjustedRightGap },
        '한쪽벽모드': isSemistanding,
        '좌측벽': isLeftWall,
        totalWidth: spaceInfo.width,
        internalWidth,
        actualInternalWidth,
        leftReduction,
        internalStartX,
        '시작X(mm)': internalStartX,
        '너비(mm)': actualInternalWidth,
        '끝X(mm)': internalStartX + actualInternalWidth,
        '슬롯너비': actualInternalWidth / columnCount,
        '정수체크': Number.isInteger(actualInternalWidth / columnCount),
        columnCount,
        columnWidth,
        slotWidths,
        '첫 슬롯 너비': slotWidths[0],
        '마지막 슬롯 너비': slotWidths[slotWidths.length - 1],
        '슬롯 너비 합계': slotWidths.reduce((sum, w) => sum + w, 0)
      });
      
      return {
        normal: {
          startX: internalStartX,  // 이미 mm 단위
          width: actualInternalWidth,  // mm 단위
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

    console.log('🔍 단내림 구간 너비 설정:', {
      'spaceInfo.droppedCeiling.width': spaceInfo.droppedCeiling.width,
      'droppedWidth (최종)': droppedWidth,
      'droppedPosition': droppedPosition,
      'totalWidth': totalWidth
    });
    
    // 전체 내부 너비 (프레임 제외)
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo, hasLeftFurniture, hasRightFurniture);
    
    // 시작 위치 계산 (노서라운드의 경우 엔드패널과 gapConfig 고려)
    // 슬롯 가이드용 시작점 계산 - 엔드패널도 슬롯에 포함
    let internalStartX: number;
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 양쪽 벽이 있으므로 이격거리만 고려
        leftReduction = spaceInfo.gapConfig?.left || 2;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 세미스탠딩: 벽이 있는 쪽은 이격거리 적용, 없는 쪽은 0
        if (spaceInfo.wallConfig?.left) {
          leftReduction = spaceInfo.gapConfig?.left || 2;
        } else {
          leftReduction = 0;
        }
      } else {
        // 프리스탠딩: 엔드패널도 슬롯에 포함되므로 0
        leftReduction = 0;
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
        // 서라운드: 중간 경계면 이격거리 3mm 적용
        const BOUNDARY_GAP = 3;

        // 단내림구간(좌): 좌측 프레임 빼고, 중간 경계 이격거리는 더하기
        droppedAreaInternalWidth = droppedAreaOuterWidth - frameThickness.left + BOUNDARY_GAP;
        droppedStartX = internalStartX; // 수정된 internalStartX 사용

        // 일반구간(우): 우측 프레임 + 중간 경계 이격거리 빼기
        normalAreaInternalWidth = normalAreaOuterWidth - frameThickness.right - BOUNDARY_GAP;
        normalStartX = droppedStartX + droppedAreaInternalWidth; // 갭 없이 바로 연결 (단내림 내경에 이미 +3mm 포함)

        console.log('🔍 서라운드 왼쪽 단내림 경계 계산:', {
          '단내림 끝': droppedStartX + droppedAreaInternalWidth,
          '메인 시작': normalStartX,
          '갭': normalStartX - (droppedStartX + droppedAreaInternalWidth),
          '중간경계이격거리': BOUNDARY_GAP,
          '프레임 두께': frameThickness,
          '단내림 내경': droppedAreaInternalWidth,
          '메인 내경': normalAreaInternalWidth,
          'spaceInfo.gapConfig': spaceInfo.gapConfig,
          'spaceInfo.wallConfig': spaceInfo.wallConfig,
          'spaceInfo.installType': spaceInfo.installType
        });
      } else {
        // 노서라운드: 엔드패널 고려하여 계산 (단내림 우측과 동일한 로직)
        let leftReduction = 0;
        let rightReduction = 0;
        const BOUNDARY_GAP = 3; // 중간 경계면 이격거리

        // freestanding인 경우 슬롯은 엔드패널을 포함한 사이즈
        // reduction 없이 전체 공간 사용 (가구 배치 시 18mm 빼기는 SlotDropZonesSimple에서 처리)
        if (spaceInfo.installType === 'freestanding') {
          // 벽없음: 슬롯은 엔드패널 포함 크기
          leftReduction = 0;
          rightReduction = 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          // 세미스탠딩: gapConfig의 left 값을 그대로 사용
          if (spaceInfo.wallConfig?.left) {
            leftReduction = spaceInfo.gapConfig?.left || 2;
          } else {
            leftReduction = 0;
          }

          if (spaceInfo.wallConfig?.right) {
            rightReduction = spaceInfo.gapConfig?.right || 2;
          } else {
            rightReduction = 0;
          }
        } else if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          // 양쪽벽: 설정된 이격거리 사용
          leftReduction = spaceInfo.gapConfig?.left || 2;
          rightReduction = spaceInfo.gapConfig?.right || 2;
        } else {
          // 기타 케이스 (엔드패널)
          if (spaceInfo.wallConfig?.left) {
            leftReduction = 0;
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }

          if (spaceInfo.wallConfig?.right) {
            rightReduction = 0;
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        }

        // 단내림구간(좌): 좌측 이격거리 빼고, 중간 경계 이격거리는 더하기 (단내림 우측과 대칭)
        droppedAreaInternalWidth = droppedAreaOuterWidth - leftReduction + BOUNDARY_GAP;
        droppedStartX = internalStartX; // 수정된 internalStartX 사용

        console.log('🔴🔴 단내림 좌측 + 노서라운드 단내림구간 계산:', {
          droppedAreaOuterWidth,
          leftReduction,
          BOUNDARY_GAP,
          droppedAreaInternalWidth,
          internalStartX,
          droppedStartX,
          '좌측벽유무': spaceInfo.wallConfig?.left,
          '엔드패널있음': !spaceInfo.wallConfig?.left,
          totalWidth: spaceInfo.width
        });

        // 일반구간(우): 우측 이격거리 + 중간 경계 이격거리 빼기 (단내림 우측과 대칭)
        normalAreaInternalWidth = normalAreaOuterWidth - rightReduction - BOUNDARY_GAP;
        normalStartX = droppedStartX + droppedAreaInternalWidth; // 갭 없이 바로 연결 (단내림 내경에 이미 +3mm 포함)

        console.log('🔍 노서라운드 왼쪽 단내림 경계 계산:', {
          '단내림구간 외부너비': droppedAreaOuterWidth,
          '좌측이격거리': leftReduction,
          '중간경계이격거리': BOUNDARY_GAP,
          '단내림구간 내경': droppedAreaInternalWidth,
          '일반구간 외부너비': normalAreaOuterWidth,
          '우측이격거리': rightReduction,
          '일반구간 내경': normalAreaInternalWidth,
          '단내림 시작X': droppedStartX,
          '단내림 끝X': droppedStartX + droppedAreaInternalWidth,
          '메인 시작X': normalStartX,
          '경계 갭': normalStartX - (droppedStartX + droppedAreaInternalWidth),
          '검증 총합': droppedAreaInternalWidth + normalAreaInternalWidth + leftReduction + rightReduction + BOUNDARY_GAP,
          '전체너비': totalWidth
        });
      }
    } else {
      // 오른쪽 단내림
      if (spaceInfo.surroundType === 'surround') {
        // 서라운드: 중간 경계면 이격거리 3mm 적용
        const BOUNDARY_GAP = 3;

        // 일반구간: 좌측 프레임 + 중간 경계 이격거리 빼기
        normalAreaInternalWidth = normalAreaOuterWidth - frameThickness.left - BOUNDARY_GAP;
        normalStartX = internalStartX; // 수정된 internalStartX 사용

        // 단내림구간: 우측 프레임 빼고, 중간 경계 이격거리는 더하기 (일반구간에서 뺀 만큼 확보)
        droppedAreaInternalWidth = droppedAreaOuterWidth - frameThickness.right + BOUNDARY_GAP;
        droppedStartX = normalStartX + normalAreaInternalWidth; // 갭 없이 바로 연결 (단내림 내경에 이미 +3mm 포함)

        console.log('🔍 서라운드 오른쪽 단내림 경계 계산:', {
          '메인 끝': normalStartX + normalAreaInternalWidth,
          '단내림 시작': droppedStartX,
          '갭': droppedStartX - (normalStartX + normalAreaInternalWidth),
          '중간경계이격거리': BOUNDARY_GAP,
          '프레임 두께': frameThickness,
          '메인 내경': normalAreaInternalWidth,
          '단내림 내경': droppedAreaInternalWidth,
          'spaceInfo.gapConfig': spaceInfo.gapConfig,
          'spaceInfo.wallConfig': spaceInfo.wallConfig,
          'spaceInfo.installType': spaceInfo.installType
        });
      } else {
        // 노서라운드: 엔드패널 고려하여 계산
        let leftReduction = 0;
        let rightReduction = 0;
        const BOUNDARY_GAP = 3; // 중간 경계면 이격거리

        // freestanding인 경우 슬롯은 엔드패널을 포함한 사이즈
        // reduction 없이 전체 공간 사용 (가구 배치 시 18mm 빼기는 SlotDropZonesSimple에서 처리)
        if (spaceInfo.installType === 'freestanding') {
          // 벽없음: 슬롯은 엔드패널 포함 크기
          leftReduction = 0;
          rightReduction = 0;
        } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
          // 세미스탠딩: gapConfig의 left 값을 그대로 사용
          if (spaceInfo.wallConfig?.left) {
            leftReduction = spaceInfo.gapConfig?.left || 2;
          } else {
            leftReduction = 0;
          }

          if (spaceInfo.wallConfig?.right) {
            rightReduction = spaceInfo.gapConfig?.right || 2;
          } else {
            rightReduction = 0;
          }
        } else if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
          // 양쪽벽: 설정된 이격거리 사용
          leftReduction = spaceInfo.gapConfig?.left || 2;
          rightReduction = spaceInfo.gapConfig?.right || 2;
        } else {
          // 기타 케이스 (엔드패널)
          if (spaceInfo.wallConfig?.left) {
            leftReduction = 0;
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }

          if (spaceInfo.wallConfig?.right) {
            rightReduction = 0;
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        }

        // 일반구간: 좌측 이격거리 + 중간 경계 이격거리 빼기
        normalAreaInternalWidth = normalAreaOuterWidth - leftReduction - BOUNDARY_GAP;
        normalStartX = internalStartX; // 수정된 internalStartX 사용

        console.log('🔴🔴 단내림 우측 + 노서라운드 메인구간 계산:', {
          normalAreaOuterWidth,
          leftReduction,
          BOUNDARY_GAP,
          normalAreaInternalWidth,
          internalStartX,
          normalStartX,
          '좌측벽유무': spaceInfo.wallConfig?.left,
          '엔드패널있음': !spaceInfo.wallConfig?.left,
          totalWidth: spaceInfo.width
        });

        // 단내림구간: 우측 이격거리 빼고, 중간 경계 이격거리는 더하기 (일반구간에서 뺀 만큼 확보)
        droppedAreaInternalWidth = droppedAreaOuterWidth - rightReduction + BOUNDARY_GAP;
        droppedStartX = normalStartX + normalAreaInternalWidth; // 갭 없이 바로 연결 (단내림 내경에 이미 +3mm 포함)

        console.log('🔍 노서라운드 오른쪽 단내림 경계 계산:', {
          '일반구간 외부너비': normalAreaOuterWidth,
          '좌측이격거리': leftReduction,
          '중간경계이격거리': BOUNDARY_GAP,
          '일반구간 내경': normalAreaInternalWidth,
          '단내림구간 외부너비': droppedAreaOuterWidth,
          '우측이격거리': rightReduction,
          '단내림구간 내경': droppedAreaInternalWidth,
          '메인 시작X': normalStartX,
          '메인 끝X': normalStartX + normalAreaInternalWidth,
          '단내림 시작X': droppedStartX,
          '경계 갭': droppedStartX - (normalStartX + normalAreaInternalWidth),
          '검증 총합': normalAreaInternalWidth + droppedAreaInternalWidth + leftReduction + rightReduction + BOUNDARY_GAP,
          '전체너비': totalWidth
        });
      }
    }
    
    // 경계면 이격거리 (BOUNDARY_GAP과 동일한 값 사용)
    let boundaryGap = 3; // 고정값

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

    // 경계면 이격거리는 이미 위에서 적용됨 (BOUNDARY_GAP 3mm)
    // 추가 최적화 로직 제거 (중복 적용 방지)

    console.log('🎯 경계면 이격거리 (이미 적용됨):', {
      단내림위치: droppedPosition,
      메인구간내경: normalAreaInternalWidth,
      단내림구간내경: droppedAreaInternalWidth,
      메인슬롯너비: normalAreaInternalWidth / normalColumnCount,
      단내림슬롯너비: droppedAreaInternalWidth / droppedColumnCount,
      설명: 'BOUNDARY_GAP 3mm 이미 적용됨'
    });
    
    // 각 영역의 컬럼 너비 계산 - 0.5 단위 균등 분할
    const normalExactWidth = normalAreaInternalWidth / normalColumnCount;
    const normalSlotWidth = Math.round(normalExactWidth * 100) / 100;
    
    const droppedExactWidth = droppedAreaInternalWidth / droppedColumnCount;
    const droppedSlotWidth = Math.round(droppedExactWidth * 100) / 100;
    
    // 슬롯별 실제 너비 배열 생성
    const normalSlotWidths: number[] = [];
    const droppedSlotWidths: number[] = [];
    
    // 메인 영역 슬롯 너비 설정
    for (let i = 0; i < normalColumnCount; i++) {
      normalSlotWidths.push(normalSlotWidth);
    }
    
    // 단내림 영역 슬롯 너비 설정
    for (let i = 0; i < droppedColumnCount; i++) {
      droppedSlotWidths.push(droppedSlotWidth);
    }
    
    // 메인 영역 차이 조정
    const normalTotalCalculated = normalSlotWidth * normalColumnCount;
    const normalDifference = normalAreaInternalWidth - normalTotalCalculated;
    const normalAdjustmentCount = Math.abs(Math.round(normalDifference * 2));
    
    if (normalDifference > 0) {
      for (let i = 0; i < Math.min(normalAdjustmentCount, normalColumnCount); i++) {
        normalSlotWidths[i] += 0.5;
      }
    } else if (normalDifference < 0) {
      for (let i = 0; i < Math.min(normalAdjustmentCount, normalColumnCount); i++) {
        normalSlotWidths[i] -= 0.5;
      }
    }
    
    // 단내림 영역 차이 조정
    const droppedTotalCalculated = droppedSlotWidth * droppedColumnCount;
    const droppedDifference = droppedAreaInternalWidth - droppedTotalCalculated;
    const droppedAdjustmentCount = Math.abs(Math.round(droppedDifference * 2));
    
    if (droppedDifference > 0) {
      for (let i = 0; i < Math.min(droppedAdjustmentCount, droppedColumnCount); i++) {
        droppedSlotWidths[i] += 0.5;
      }
    } else if (droppedDifference < 0) {
      for (let i = 0; i < Math.min(droppedAdjustmentCount, droppedColumnCount); i++) {
        droppedSlotWidths[i] -= 0.5;
      }
    }
    
    // 호환성을 위한 평균 너비 (소수점 유지)
    const normalColumnWidth = normalAreaInternalWidth / normalColumnCount;
    const droppedColumnWidth = droppedAreaInternalWidth / droppedColumnCount;
    
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
      },
      boundaryGap // 경계면 이격거리 추가
    };
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
      // 단내림 영역의 zone 정보 가져오기
      if (indexing.zones?.dropped?.threeUnitPositions) {
        const droppedPositions = indexing.zones.dropped.threeUnitPositions;
        const droppedBoundaries = indexing.zones.dropped.threeUnitBoundaries;

        // zone 내에서 가장 가까운 슬롯 찾기 (Three.js 좌표 사용)
        const positionThreeUnits = SpaceCalculator.mmToThreeUnits(position.x);
        let closestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < droppedPositions.length; i++) {
          const distance = Math.abs(positionThreeUnits - droppedPositions[i]);
          if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
          }
        }

        return {
          zone: 'dropped',
          slotIndex: closestIndex
        };
      }

      // fallback: 기존 계산 방식
      const relativeX = position.x - zoneInfo.dropped.startX;
      const slotIndex = Math.floor(relativeX / zoneInfo.dropped.columnWidth);
      return {
        zone: 'dropped',
        slotIndex: Math.min(slotIndex, zoneInfo.dropped.columnCount - 1)
      };
    }
    
    // 일반 영역 확인
    if (position.x >= zoneInfo.normal.startX && position.x <= normalEndX) {
      // 일반 영역의 zone 정보 가져오기
      if (indexing.zones?.normal?.threeUnitPositions) {
        const normalPositions = indexing.zones.normal.threeUnitPositions;
        const normalBoundaries = indexing.zones.normal.threeUnitBoundaries;

        // zone 내에서 가장 가까운 슬롯 찾기 (Three.js 좌표 사용)
        const positionThreeUnits = SpaceCalculator.mmToThreeUnits(position.x);
        let closestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < normalPositions.length; i++) {
          const distance = Math.abs(positionThreeUnits - normalPositions[i]);
          if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
          }
        }

        return {
          zone: 'normal',
          slotIndex: closestIndex
        };
      }

      // fallback: 기존 계산 방식
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
