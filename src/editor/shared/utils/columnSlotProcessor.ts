import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { Column } from '@/types/space';
import { calculateSpaceIndexing, ColumnIndexer } from './indexing';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';

// 기둥 포함 슬롯 정보 타입
export interface ColumnSlotInfo {
  slotIndex: number;
  hasColumn: boolean;
  column?: Column;
  columnPosition: 'edge' | 'middle'; // 기둥이 슬롯 끝선에 있는지, 중간에 있는지
  availableWidth: number; // 캐비닛 배치 가능한 너비 (mm)
  doorWidth: number; // 도어 너비 (mm)
  needsMullion: boolean; // 멍장 패널 필요 여부
  mullionSide?: 'left' | 'right'; // 멍장 패널이 필요한 쪽
  // 기둥 침범 방향 정보 추가
  intrusionDirection?: 'from-left' | 'from-right' | 'center'; // 기둥이 어느 방향에서 침범하는지
  furniturePosition?: 'left-aligned' | 'right-aligned' | 'center'; // 가구가 배치될 위치
  adjustedWidth?: number; // 침범 후 조정된 가구 너비
  // 기둥 깊이 기반 처리 정보 추가
  columnType?: 'deep' | 'shallow' | 'medium'; // 깊은 기둥(>=500mm) vs 얕은 기둥(<500mm) vs 중간 기둥(300mm)
  columnProcessingMethod?: 'width-adjustment' | 'depth-adjustment'; // 기둥 C는 폭 조정 방식으로 변경
  depthAdjustment?: {
    canPlaceSingle: boolean;
    canPlaceDual: boolean;
    adjustedDepth: number; // 깊이 조정된 캐비넷 깊이 (730 - 기둥깊이)
    minDepthMet: boolean; // 최소 깊이 조건 충족 여부
  };
  splitPlacement?: {
    canSplit: boolean; // 분할 배치 가능 여부
    leftWidth: number; // 좌측 공간 폭
    rightWidth: number; // 우측 공간 폭
    recommendedLayout: 'single' | 'split-weighted' | 'split-equal'; // 권장 배치 방식
  };
  // 기둥 C 전용: 1개 슬롯에 2개 가구 배치 가능
  allowMultipleFurniture?: boolean; // 기둥 C일 때 true
  subSlots?: { // Column C의 경우 두 개의 서브슬롯 정보
    left: { availableWidth: number; center: number };
    right: { availableWidth: number; center: number };
  };
  // 기둥 앞 공간 정보 (기둥 측면 배치 시 기둥 앞쪽 여유 공간에 추가 가구 배치용)
  frontSpace?: {
    available: boolean;      // 기둥 앞 공간 배치 가능 여부
    width: number;           // 기둥 앞 공간의 폭 (mm)
    depth: number;           // 기둥 앞 공간의 깊이 (730 - 기둥깊이 = 430mm)
    centerX: number;         // 기둥 앞 공간의 X 중심 위치 (Three.js 단위)
    centerZ: number;         // 기둥 앞 공간의 Z 중심 위치 (Three.js 단위)
  };
}

// 기둥 커버 도어 타입
export interface PillarCoverDoor {
  type: 'pillarCover';
  isStorage: false;
  linkedTo: string; // 연결된 기둥 ID
  width: number;
  height: number;
}

// 캐비넷 배치 옵션 타입
export interface CabinetPlacementOption {
  type: 'single' | 'split-weighted' | 'split-equal';
  label: string;
  description: string;
  cabinets: {
    id: string;
    width: number;
    depth: number;
    position: [number, number, number];
    moduleId: string;
  }[];
}

/**
 * 기둥 깊이 기반 캐비넷 배치 가능성 분석
 */
export const analyzeColumnDepthPlacement = (column: Column, slotWidthMm: number, slotStartX: number, slotEndX: number): {
  columnType: 'deep' | 'shallow';
  depthAdjustment: {
    canPlaceSingle: boolean;
    canPlaceDual: boolean;
    adjustedDepth: number;
    minDepthMet: boolean;
  };
  splitPlacement: {
    canSplit: boolean;
    leftWidth: number;
    rightWidth: number;
    recommendedLayout: 'single' | 'split-weighted' | 'split-equal';
  };
} => {
  const DEPTH_THRESHOLD = 500; // 500mm 기준으로 깊은/얕은 기둥 구분
  const STANDARD_CABINET_DEPTH = 730; // 표준 캐비넷 깊이
  const MIN_SINGLE_DEPTH = 200; // 싱글캐비넷 최소 깊이
  const MIN_DUAL_DEPTH = 580; // 듀얼캐비넷 최소 깊이
  const MIN_DUAL_COLUMN_DEPTH = 150; // 듀얼 배치 가능한 최대 기둥 깊이
  const MIN_SLOT_WIDTH = 150; // 캐비넷 배치 최소 폭
  
  const columnDepth = column.depth;
  let columnType: 'deep' | 'shallow' | 'medium';
  if (columnDepth >= DEPTH_THRESHOLD) {
    columnType = 'deep';
  } else if (columnDepth === 300) {
    columnType = 'medium'; // 기둥 C
  } else {
    columnType = 'shallow';
  }
  
  console.log('🔍 analyzeColumnDepthPlacement 상세:', {
    columnId: column.id,
    columnDepth,
    DEPTH_THRESHOLD,
    columnType,
    isShallow: columnDepth < DEPTH_THRESHOLD,
    isColumnC: columnDepth === 300
  });
  
  // 기둥 위치 계산
  const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
  const columnRightX = column.position[0] + (column.width * 0.01) / 2;
  const leftWidth = Math.max(0, (columnLeftX - slotStartX) * 100); // mm
  const rightWidth = Math.max(0, (slotEndX - columnRightX) * 100); // mm
  
  // 깊이 조정 분석
  const adjustedDepth = STANDARD_CABINET_DEPTH - columnDepth;
  const canPlaceSingle = columnDepth < DEPTH_THRESHOLD && adjustedDepth >= MIN_SINGLE_DEPTH && (leftWidth >= MIN_SLOT_WIDTH || rightWidth >= MIN_SLOT_WIDTH);
  const canPlaceDual = columnDepth < MIN_DUAL_COLUMN_DEPTH && adjustedDepth >= MIN_DUAL_DEPTH && (leftWidth >= MIN_SLOT_WIDTH || rightWidth >= MIN_SLOT_WIDTH);
  
  // 분할 배치 분석
  const canSplit = leftWidth >= MIN_SLOT_WIDTH && rightWidth >= MIN_SLOT_WIDTH;
  let recommendedLayout: 'single' | 'split-weighted' | 'split-equal' = 'single';
  
  if (canSplit) {
    recommendedLayout = 'split-weighted'; // 기본적으로 가중치 분할 권장
  }
  
  console.log('🏛️ 기둥 깊이 기반 배치 분석:', {
    columnId: column.id,
    columnDepth,
    columnType,
    adjustedDepth,
    canPlaceSingle,
    canPlaceDual,
    canSplit,
    leftWidth: leftWidth.toFixed(1) + 'mm',
    rightWidth: rightWidth.toFixed(1) + 'mm',
    recommendedLayout
  });
  
  return {
    columnType,
    depthAdjustment: {
      canPlaceSingle,
      canPlaceDual,
      adjustedDepth,
      minDepthMet: adjustedDepth >= MIN_SINGLE_DEPTH
    },
    splitPlacement: {
      canSplit,
      leftWidth,
      rightWidth,
      recommendedLayout
    }
  };
};

/**
 * 기둥이 포함된 슬롯들을 분석하여 가구 배치 정보를 생성
 */
export const analyzeColumnSlots = (spaceInfo: SpaceInfo): ColumnSlotInfo[] => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const columns = spaceInfo.columns || [];
  const slotInfos: ColumnSlotInfo[] = [];

  console.log('🔍🔍🔍 [analyzeColumnSlots] 함수 시작:', {
    surroundType: spaceInfo.surroundType,
    hasDroppedCeiling: !!spaceInfo.droppedCeiling?.enabled,
    totalColumns: columns.length,
    columns: columns.map(c => ({
      position: c.position,
      width: c.width,
      depth: c.depth
    })),
    columnCount: indexing.columnCount,
    columnWidth: indexing.columnWidth
  });

  // 노서라운드 모드에서도 기둥 처리 (기둥은 있을 수 있음)
  if (spaceInfo.surroundType === 'no-surround') {
    console.log('🔍🔍🔍 [analyzeColumnSlots] NO-SURROUND 경로 진입');
    // 노서라운드에서도 기둥 확인 필요
    for (let i = 0; i < indexing.columnCount; i++) {
      const slotCenterX = indexing.threeUnitPositions[i];
      const slotWidthM = indexing.columnWidth * 0.01;
      const slotStartX = slotCenterX - slotWidthM / 2;
      const slotEndX = slotCenterX + slotWidthM / 2;

      console.log(`🔍🔍🔍 [analyzeColumnSlots] 슬롯 ${i} 기둥 검색 시작 (NO-SURROUND):`, {
        slotCenterX: slotCenterX.toFixed(3),
        slotStartX: slotStartX.toFixed(3),
        slotEndX: slotEndX.toFixed(3),
        slotWidthM: slotWidthM.toFixed(3),
        columnsToCheck: columns.length
      });

      // 이 슬롯에 포함된 기둥 찾기
      const columnInSlot = columns.find((column, colIdx) => {
        const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
        const columnRightX = column.position[0] + (column.width * 0.01) / 2;

        const overlaps = (columnLeftX < slotEndX && columnRightX > slotStartX);

        console.log(`  🔍 기둥 ${colIdx} 체크 (NO-SURROUND):`, {
          columnPosition: column.position,
          columnWidth: column.width,
          columnDepth: column.depth,
          columnLeftX: columnLeftX.toFixed(3),
          columnRightX: columnRightX.toFixed(3),
          overlaps,
          condition1_leftLessThanSlotEnd: columnLeftX < slotEndX,
          condition2_rightGreaterThanSlotStart: columnRightX > slotStartX
        });

        // 기둥이 슬롯 영역과 겹치는지 확인
        return overlaps;
      });
      
      if (!columnInSlot) {
        // 기둥이 없는 일반 슬롯
        slotInfos.push({
          slotIndex: i,
          hasColumn: false,
          columnPosition: 'edge',
          availableWidth: indexing.slotWidths?.[i] || indexing.columnWidth,
          doorWidth: indexing.slotWidths?.[i] || indexing.columnWidth,
          needsMullion: false
        });
      } else {
        // 기둥이 있는 슬롯 처리 - 서라운드 모드와 동일한 로직 사용
        const columnLeftX = columnInSlot.position[0] - (columnInSlot.width * 0.01) / 2;
        const columnRightX = columnInSlot.position[0] + (columnInSlot.width * 0.01) / 2;
        
        // 기둥과 슬롯 경계 간의 실제 거리 계산
        const leftGap = (columnLeftX - slotStartX) * 100; // mm 단위로 변환
        const rightGap = (slotEndX - columnRightX) * 100; // mm 단위로 변환
        
        // 기둥 침범 방향 분석 (서라운드 모드와 동일한 로직)
        const analyzeIntrusionDirection = () => {
          const columnWidthMm = columnInSlot.width;
          const slotWidthMm = indexing.columnWidth;
          const margin = 0; // 이격거리 제거 (가구가 기둥에 딱 붙도록)
          
          // 기둥이 슬롯을 완전히 차지하는 경우
          if (columnWidthMm >= slotWidthMm - margin) {
            return {
              availableWidth: 0,
              intrusionDirection: 'center' as const,
              furniturePosition: 'center' as const,
              adjustedWidth: 0
            };
          }
          
          // 왼쪽 공간이 더 작으면 왼쪽에서 침범
          if (leftGap <= rightGap) {
            // 가구는 오른쪽 슬롯 경계까지 확장 (기둥 오른쪽부터 슬롯 끝까지)
            const rightSpace = Math.max(0, rightGap);
            return {
              availableWidth: Math.round(rightSpace * 100) / 100,
              intrusionDirection: 'from-left' as const,
              furniturePosition: 'right-aligned' as const,
              adjustedWidth: Math.round(rightSpace * 100) / 100
            };
          } 
          // 오른쪽 공간이 더 작으면 오른쪽에서 침범
          else {
            // 가구는 왼쪽 슬롯 경계까지 확장 (슬롯 시작부터 기둥 왼쪽까지)
            const leftSpace = Math.max(0, leftGap);
            return {
              availableWidth: Math.round(leftSpace * 100) / 100,
              intrusionDirection: 'from-right' as const,
              furniturePosition: 'left-aligned' as const,
              adjustedWidth: Math.round(leftSpace * 100) / 100
            };
          }
        };
        
        const intrusionAnalysis = analyzeIntrusionDirection();

        // 기둥 타입 결정 (노서라운드 모드)
        const DEPTH_THRESHOLD = 500;
        let columnType: 'deep' | 'shallow' | 'medium' | undefined;
        if (columnInSlot.depth >= DEPTH_THRESHOLD) {
          columnType = 'deep';
        } else if (columnInSlot.depth === 300) {
          columnType = 'medium'; // 기둥 C
        } else {
          columnType = 'shallow';
        }

        // 기둥 앞 공간 계산 (기둥 C일 때만) - 노서라운드 모드
        let frontSpace: ColumnSlotInfo['frontSpace'];
        if (columnType === 'medium' && columnInSlot.depth === 300) {
          const STANDARD_CABINET_DEPTH = 730;
          const frontSpaceDepth = STANDARD_CABINET_DEPTH - columnInSlot.depth; // 430mm
          const frontSpaceWidth = indexing.columnWidth;
          // 슬롯의 X 위치 사용 (기둥 position이 0인 경우가 있으므로)
          const slotCenterX = indexing.threeUnitPositions[i];
          const columnCenterZ = (frontSpaceDepth / 2) * 0.01;

          frontSpace = {
            available: true,
            width: frontSpaceWidth,
            depth: frontSpaceDepth,
            centerX: slotCenterX,
            centerZ: columnCenterZ
          };

          console.log('🟢 기둥 앞 공간 계산 (노서라운드):', {
            slotIndex: i,
            frontSpaceWidth,
            frontSpaceDepth,
            centerX: slotCenterX,
            centerZ: columnCenterZ
          });
        }

        slotInfos.push({
          slotIndex: i,
          hasColumn: true,
          column: columnInSlot,
          columnPosition: 'edge',
          columnType, // 기둥 타입 추가
          intrusionDirection: intrusionAnalysis.intrusionDirection,
          furniturePosition: intrusionAnalysis.furniturePosition,
          availableWidth: Math.round((intrusionAnalysis.availableWidth || 0) * 100) / 100,
          adjustedWidth: Math.round((intrusionAnalysis.adjustedWidth || 0) * 100) / 100,
          doorWidth: indexing.columnWidth - 3, // 커버도어는 원래 슬롯 너비 사용
          needsMullion: false,
          frontSpace // 기둥 앞 공간 정보 추가
        });

        console.log('🏗️ 노서라운드 기둥 슬롯 정보:', {
          slotIndex: i,
          columnWidth: columnInSlot.width,
          columnDepth: columnInSlot.depth,
          columnType,
          intrusionDirection: intrusionAnalysis.intrusionDirection,
          availableWidth: Math.round((intrusionAnalysis.availableWidth || 0) * 100) / 100,
          originalSlotWidth: indexing.columnWidth,
          frontSpace
        });
      }
    }
    return slotInfos;
  }
  
    // 단내림이 있는 경우 zone별로 처리
  if (spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    
    // 전체 슬롯 수 = normal zone + dropped zone
    const totalSlotCount = (zoneInfo.normal?.columnCount || 0) + (zoneInfo.dropped?.columnCount || 0);
    
    // 각 슬롯에 대해 기둥 포함 여부 확인 (전체 슬롯 인덱스 기준)
    for (let globalSlotIndex = 0; globalSlotIndex < totalSlotCount; globalSlotIndex++) {
      // 어느 zone에 속하는지 확인
      let zone: 'normal' | 'dropped';
      let localSlotIndex: number;
      let targetZone: any;
      
      if (globalSlotIndex < (zoneInfo.normal?.columnCount || 0)) {
        zone = 'normal';
        localSlotIndex = globalSlotIndex;
        targetZone = zoneInfo.normal;
      } else {
        zone = 'dropped';
        localSlotIndex = globalSlotIndex - (zoneInfo.normal?.columnCount || 0);
        targetZone = zoneInfo.dropped;
      }
      
      if (!targetZone || !targetZone.threeUnitPositions || localSlotIndex >= targetZone.columnCount) {
        // zone 정보가 없으면 기본 슬롯 정보 추가
        slotInfos.push({
          slotIndex: globalSlotIndex,
          hasColumn: false,
          columnPosition: 'edge',
          availableWidth: indexing.columnWidth,
          doorWidth: targetZone.columnWidth - 3,
          needsMullion: false
        });
        continue;
      }
      
      const slotCenterX = targetZone.threeUnitPositions[localSlotIndex];
      const slotWidthM = targetZone.columnWidth * 0.01;
      const slotStartX = slotCenterX - slotWidthM / 2;
      const slotEndX = slotCenterX + slotWidthM / 2;
    
    // 이 슬롯에 포함된 기둥 찾기
    console.log(`🔍🔍🔍 [analyzeColumnSlots] 슬롯 ${globalSlotIndex} (zone: ${zone}, local: ${localSlotIndex}) 기둥 검색 시작:`, {
      slotCenterX: slotCenterX.toFixed(3),
      slotStartX: slotStartX.toFixed(3),
      slotEndX: slotEndX.toFixed(3),
      slotWidthM: slotWidthM.toFixed(3),
      columnsToCheck: columns.length
    });

    const columnInSlot = columns.find((column, colIdx) => {
      const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
      const columnRightX = column.position[0] + (column.width * 0.01) / 2;

      const overlaps = (columnLeftX < slotEndX && columnRightX > slotStartX);

      console.log(`  🔍 기둥 ${colIdx} 체크:`, {
        columnPosition: column.position,
        columnWidth: column.width,
        columnDepth: column.depth,
        columnLeftX: columnLeftX.toFixed(3),
        columnRightX: columnRightX.toFixed(3),
        overlaps,
        condition1_leftLessThanSlotEnd: columnLeftX < slotEndX,
        condition2_rightGreaterThanSlotStart: columnRightX > slotStartX
      });

      // 기둥이 슬롯 영역과 겹치는지 확인
      return overlaps;
    });
    
    if (!columnInSlot) {
      // 기둥이 없는 일반 슬롯
      slotInfos.push({
        slotIndex: globalSlotIndex,
        hasColumn: false,
        columnPosition: 'edge',
        availableWidth: targetZone.columnWidth,
        doorWidth: targetZone.columnWidth - 3, // 기본 3mm 갭
        needsMullion: false
      });
      continue;
    }
    
    // 기둥이 있는 슬롯 처리
    const columnLeftX = columnInSlot.position[0] - (columnInSlot.width * 0.01) / 2;
    const columnRightX = columnInSlot.position[0] + (columnInSlot.width * 0.01) / 2;
    
    // 기둥이 슬롯 끝선에 정확히 일치하는지 확인 (허용 오차 5mm)
    const tolerance = 0.05; // 5mm를 Three.js 단위로 변환
    const isAtLeftEdge = Math.abs(columnLeftX - slotStartX) < tolerance;
    const isAtRightEdge = Math.abs(columnRightX - slotEndX) < tolerance;
    
    // 기둥과 슬롯 경계 간의 실제 거리 계산
    const leftGap = (columnLeftX - slotStartX) * 100; // mm 단위로 변환
    const rightGap = (slotEndX - columnRightX) * 100; // mm 단위로 변환
    
    // 기둥 침범 방향 분석
    const analyzeIntrusionDirection = () => {
      const columnWidthMm = columnInSlot.width;
      const slotWidthMm = targetZone.columnWidth;
      const margin = 0; // 이격거리 제거 (가구가 기둥에 딱 붙도록)
      
      console.log('🏛️ 기둥 침범 방향 분석:', {
        slotIndex: globalSlotIndex,
        zone,
        columnLeftX: columnLeftX.toFixed(3),
        columnRightX: columnRightX.toFixed(3),
        slotStartX: slotStartX.toFixed(3),
        slotEndX: slotEndX.toFixed(3),
        leftGap: leftGap.toFixed(1) + 'mm',
        rightGap: rightGap.toFixed(1) + 'mm',
        columnWidthMm,
        slotWidthMm
      });
      
      // 기둥이 슬롯을 완전히 차지하는 경우
      if (columnWidthMm >= slotWidthMm - margin) {
        console.log('🏛️ 기둥이 슬롯을 완전히 차지함');
        return {
          availableWidth: 0,
          intrusionDirection: 'center' as const,
          furniturePosition: 'center' as const,
          adjustedWidth: 0
        };
      }
      
      // 기둥이 슬롯과 겹치면 무조건 침범으로 처리
      // 왼쪽 공간이 더 작으면 왼쪽에서 침범
      if (leftGap <= rightGap) {
        const rightSpace = Math.max(0, rightGap);
        console.log('🏛️ 기둥이 왼쪽 영역 침범 → 오른쪽 공간 사용:', {
          leftGap: leftGap.toFixed(1) + 'mm',
          rightGap: rightGap.toFixed(1) + 'mm',
          rightSpace: rightSpace.toFixed(1) + 'mm'
        });
        return {
          availableWidth: rightSpace,
          intrusionDirection: 'from-left' as const,
          furniturePosition: 'right-aligned' as const,
          adjustedWidth: rightSpace
        };
      } 
      // 오른쪽 공간이 더 작으면 오른쪽에서 침범
      else {
        const leftSpace = Math.max(0, leftGap);
        console.log('🏛️ 기둥이 오른쪽 영역 침범 → 왼쪽 공간 사용:', {
          leftGap: leftGap.toFixed(1) + 'mm',
          rightGap: rightGap.toFixed(1) + 'mm',
          leftSpace: leftSpace.toFixed(1) + 'mm'
        });
        return {
          availableWidth: leftSpace,
          intrusionDirection: 'from-right' as const,
          furniturePosition: 'left-aligned' as const,
          adjustedWidth: leftSpace
        };
      }
    };
    
    const intrusionAnalysis = analyzeIntrusionDirection();
    const availableWidth = intrusionAnalysis.availableWidth;
    const needsMullion = leftGap > 10 && rightGap > 10 && availableWidth > 0;
    
    let mullionSide: 'left' | 'right' | undefined;
    if (needsMullion) {
      mullionSide = leftGap > rightGap ? 'right' : 'left';
    }
    
    // 기둥 위치 분류 (기둥이 슬롯과 겹치면 무조건 침범으로 간주)
    let columnPosition: 'edge' | 'middle';
    // 기둥이 슬롯과 겹치는 순간 edge로 분류 (침범 상황)
    columnPosition = 'edge';
    
    // 실제 배치 가능한 크기를 calculateFurnitureBounds로 정확히 계산
    let actualRenderWidth = intrusionAnalysis.adjustedWidth;
    try {
      const slotWidthM = targetZone.columnWidth * 0.01;
      const slotCenterX = targetZone.threeUnitPositions[localSlotIndex];
      
      const originalSlotBounds = {
        left: slotCenterX - slotWidthM / 2,
        right: slotCenterX + slotWidthM / 2,
        center: slotCenterX
      };
      
      const tempSlotInfo = {
        slotIndex: globalSlotIndex,
        hasColumn: true,
        column: columnInSlot,
        columnPosition,
        availableWidth,
        intrusionDirection: intrusionAnalysis.intrusionDirection,
        furniturePosition: intrusionAnalysis.furniturePosition,
        adjustedWidth: Math.round((intrusionAnalysis.adjustedWidth || 0) * 100) / 100
      } as ColumnSlotInfo;
      
      const furnitureBounds = calculateFurnitureBounds(tempSlotInfo, originalSlotBounds, spaceInfo);
      actualRenderWidth = furnitureBounds.renderWidth;
      
      console.log('🔍 실제 배치 크기 미리 계산:', {
        slotIndex: globalSlotIndex,
        zone,
        originalAdjustedWidth: intrusionAnalysis.adjustedWidth,
        actualRenderWidth,
        improvement: actualRenderWidth > intrusionAnalysis.adjustedWidth ? '개선됨' : '동일/악화'
      });
    } catch (error) {
      console.warn('⚠️ 실제 배치 크기 미리 계산 실패:', error);
    }
    
    // 기둥 타입에 따른 처리 방식 결정
    let columnType: 'deep' | 'shallow' | 'medium' | undefined;
    let columnProcessingMethod: 'width-adjustment' | 'depth-adjustment' | undefined;
    let depthAdjustment: ColumnSlotInfo['depthAdjustment'];
    let splitPlacement: ColumnSlotInfo['splitPlacement'];
    let allowMultipleFurniture = false;
    let subSlots: ColumnSlotInfo['subSlots'];
    
    const DEPTH_THRESHOLD = 500; // 500mm 기준
    const depthAnalysis = analyzeColumnDepthPlacement(columnInSlot, targetZone.columnWidth, slotStartX, slotEndX);
    columnType = depthAnalysis.columnType;
    
    // 기둥 C(300mm)는 깊이 조정 방식 사용 (사용자 요구사항 변경)
    if (columnType === 'medium') {
      columnProcessingMethod = 'depth-adjustment';
      depthAdjustment = depthAnalysis.depthAdjustment;
      splitPlacement = depthAnalysis.splitPlacement;
      allowMultipleFurniture = false; // 기둥 C는 깊이 조정 방식이므로 1개 가구만 배치
      
      console.log('🔵 기둥 C 감지 - 깊이 조정 방식:', {
        slotIndex: globalSlotIndex,
        zone,
        columnDepth: columnInSlot.depth,
        columnType: 'C (300mm)',
        columnProcessingMethod: 'depth-adjustment',
        availableWidth: Math.round((intrusionAnalysis.availableWidth || 0) * 100) / 100,
        adjustedDepth: depthAnalysis.depthAdjustment.adjustedDepth,
        canPlaceSingle: depthAnalysis.depthAdjustment.canPlaceSingle,
        canPlaceDual: depthAnalysis.depthAdjustment.canPlaceDual
      });
    } else if (columnType === 'shallow') {
      columnProcessingMethod = 'depth-adjustment';
      depthAdjustment = depthAnalysis.depthAdjustment;
      splitPlacement = depthAnalysis.splitPlacement;
    } else {
      columnProcessingMethod = 'width-adjustment';
    }
    
    console.log('🔍 기둥 처리 방식 결정:', {
      slotIndex: globalSlotIndex,
      zone,
      columnDepth: columnInSlot.depth,
      columnType,
      columnProcessingMethod,
      allowMultipleFurniture
    });

    console.log('🏛️ 슬롯 분석 완료:', {
      slotIndex: globalSlotIndex,
      zone,
      hasColumn: true,
      columnPosition,
      availableWidth: intrusionAnalysis.availableWidth,
      actualRenderWidth,
      배치가능여부: actualRenderWidth >= 150 ? '✅ 배치 가능' : '❌ 배치 불가',
      intrusionDirection: intrusionAnalysis.intrusionDirection,
      furniturePosition: intrusionAnalysis.furniturePosition,
      adjustedWidth: intrusionAnalysis.adjustedWidth,
      doorWidth: targetZone.columnWidth - 3,
      columnType,
      hasDepthAnalysis: columnType !== undefined
    });
    
    // 기둥 앞 공간 계산 (기둥 C일 때만)
    let frontSpace: ColumnSlotInfo['frontSpace'];
    if (columnType === 'medium' && columnInSlot.depth === 300) {
      const STANDARD_CABINET_DEPTH = 730;
      const frontSpaceDepth = STANDARD_CABINET_DEPTH - columnInSlot.depth; // 430mm
      // 기둥 앞 공간의 폭 = 슬롯 전체 폭 (기둥이 차지하는 영역)
      const frontSpaceWidth = targetZone.columnWidth;
      // 슬롯의 X 위치 사용 (기둥 position이 0인 경우가 있으므로)
      const slotCenterX = targetZone.threeUnitPositions[localSlotIndex];
      // 기둥 앞쪽 Z 위치 (기둥 깊이의 절반 + 앞 공간 깊이의 절반)
      // Z축: 벽쪽이 음수, 앞쪽이 양수라고 가정
      const columnCenterZ = (frontSpaceDepth / 2) * 0.01; // 앞 공간의 중심

      frontSpace = {
        available: true,
        width: frontSpaceWidth,
        depth: frontSpaceDepth,
        centerX: slotCenterX,
        centerZ: columnCenterZ
      };

      console.log('🟢 기둥 앞 공간 계산 (단내림):', {
        slotIndex: globalSlotIndex,
        zone,
        frontSpaceWidth,
        frontSpaceDepth,
        centerX: slotCenterX,
        centerZ: columnCenterZ
      });
    }

    slotInfos.push({
      slotIndex: globalSlotIndex,
      hasColumn: true,
      column: columnInSlot,
      columnPosition,
      availableWidth,
      doorWidth: targetZone.columnWidth - 3, // 도어는 항상 원래 슬롯 크기 유지
      needsMullion,
      mullionSide,
      intrusionDirection: intrusionAnalysis.intrusionDirection,
      furniturePosition: intrusionAnalysis.furniturePosition,
      adjustedWidth: actualRenderWidth, // 실제 렌더링 가능한 크기로 업데이트
      columnType,
      columnProcessingMethod,
      depthAdjustment,
      splitPlacement,
      allowMultipleFurniture,
      subSlots, // Column C의 서브슬롯 정보 추가
      frontSpace // 기둥 앞 공간 정보 추가
    });
    }
    return slotInfos;
  } else {
    // 단내림이 없는 경우 - 기존 로직 유지
    for (let slotIndex = 0; slotIndex < indexing.columnCount; slotIndex++) {
      const slotStartX = indexing.threeUnitPositions[slotIndex] - (indexing.columnWidth * 0.01) / 2;
      const slotEndX = indexing.threeUnitPositions[slotIndex] + (indexing.columnWidth * 0.01) / 2;
      
      // 이 슬롯에 포함된 기둥 찾기
      const columnInSlot = columns.find(column => {
        const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
        const columnRightX = column.position[0] + (column.width * 0.01) / 2;
        
        // 기둥이 슬롯 영역과 겹치는지 확인
        return (columnLeftX < slotEndX && columnRightX > slotStartX);
      });
      
      if (!columnInSlot) {
        // 기둥이 없는 일반 슬롯
        slotInfos.push({
          slotIndex,
          hasColumn: false,
          columnPosition: 'edge',
          availableWidth: indexing.columnWidth,
          doorWidth: indexing.columnWidth - 3, // 기본 3mm 갭
          needsMullion: false
        });
        continue;
      }
      
      // 기둥이 있는 슬롯 처리
      const columnLeftX = columnInSlot.position[0] - (columnInSlot.width * 0.01) / 2;
      const columnRightX = columnInSlot.position[0] + (columnInSlot.width * 0.01) / 2;
      
      // 기둥이 슬롯 끝선에 정확히 일치하는지 확인 (허용 오차 5mm)
      const tolerance = 0.05; // 5mm를 Three.js 단위로 변환
      const isAtLeftEdge = Math.abs(columnLeftX - slotStartX) < tolerance;
      const isAtRightEdge = Math.abs(columnRightX - slotEndX) < tolerance;
      
      // 기둥과 슬롯 경계 간의 실제 거리 계산
      const leftGap = (columnLeftX - slotStartX) * 100; // mm 단위로 변환
      const rightGap = (slotEndX - columnRightX) * 100; // mm 단위로 변환
      
      // 기둥 침범 방향 분석
      const analyzeIntrusionDirection = () => {
        const columnWidthMm = columnInSlot.width;
        const slotWidthMm = indexing.columnWidth;
        const margin = 0; // 이격거리 제거 (가구가 기둥에 딱 붙도록)
        
        console.log('🏛️ 기둥 침범 방향 분석:', {
          slotIndex,
          columnLeftX: columnLeftX.toFixed(3),
          columnRightX: columnRightX.toFixed(3),
          slotStartX: slotStartX.toFixed(3),
          slotEndX: slotEndX.toFixed(3),
          leftGap: leftGap.toFixed(1) + 'mm',
          rightGap: rightGap.toFixed(1) + 'mm',
          columnWidthMm,
          slotWidthMm
        });
        
        // 기둥이 슬롯을 완전히 차지하는 경우
        if (columnWidthMm >= slotWidthMm - margin) {
          console.log('🏛️ 기둥이 슬롯을 완전히 차지함');
          return {
            availableWidth: 0,
            intrusionDirection: 'center' as const,
            furniturePosition: 'center' as const,
            adjustedWidth: 0
          };
        }
        
        // 기둥이 슬롯과 겹치면 무조건 침범으로 처리
        // 왼쪽 공간이 더 작으면 왼쪽에서 침범
        if (leftGap <= rightGap) {
          const rightSpace = Math.max(0, rightGap);
          console.log('🏛️ 기둥이 왼쪽 영역 침범 → 오른쪽 공간 사용:', {
            leftGap: leftGap.toFixed(1) + 'mm',
            rightGap: rightGap.toFixed(1) + 'mm',
            rightSpace: rightSpace.toFixed(1) + 'mm'
          });
          return {
            availableWidth: rightSpace,
            intrusionDirection: 'from-left' as const,
            furniturePosition: 'right-aligned' as const,
            adjustedWidth: rightSpace
          };
        } 
        // 오른쪽 공간이 더 작으면 오른쪽에서 침범
        else {
          const leftSpace = Math.max(0, leftGap);
          console.log('🏛️ 기둥이 오른쪽 영역 침범 → 왼쪽 공간 사용:', {
            leftGap: leftGap.toFixed(1) + 'mm',
            rightGap: rightGap.toFixed(1) + 'mm',
            leftSpace: leftSpace.toFixed(1) + 'mm'
          });
          return {
            availableWidth: leftSpace,
            intrusionDirection: 'from-right' as const,
            furniturePosition: 'left-aligned' as const,
            adjustedWidth: leftSpace
          };
        }
      };
      
      const intrusionAnalysis = analyzeIntrusionDirection();
      const availableWidth = intrusionAnalysis.availableWidth;
      const needsMullion = leftGap > 10 && rightGap > 10 && availableWidth > 0;
      
      let mullionSide: 'left' | 'right' | undefined;
      if (needsMullion) {
        mullionSide = leftGap > rightGap ? 'right' : 'left';
      }
      
      // 기둥 위치 분류 (기둥이 슬롯과 겹치면 무조건 침범으로 간주)
      let columnPosition: 'edge' | 'middle';
      // 기둥이 슬롯과 겹치는 순간 edge로 분류 (침범 상황)
      columnPosition = 'edge';
      
      // 실제 배치 가능한 크기를 calculateFurnitureBounds로 정확히 계산
      let actualRenderWidth = intrusionAnalysis.adjustedWidth;
      try {
        const slotWidthM = indexing.columnWidth * 0.01;
        const slotCenterX = indexing.threeUnitPositions[slotIndex];
        
        const originalSlotBounds = {
          left: slotCenterX - slotWidthM / 2,
          right: slotCenterX + slotWidthM / 2,
          center: slotCenterX
        };
        
        const tempSlotInfo = {
          slotIndex,
          hasColumn: true,
          column: columnInSlot,
          columnPosition,
          availableWidth,
          intrusionDirection: intrusionAnalysis.intrusionDirection,
          furniturePosition: intrusionAnalysis.furniturePosition,
          adjustedWidth: Math.round((intrusionAnalysis.adjustedWidth || 0) * 100) / 100
        } as ColumnSlotInfo;
        
        const furnitureBounds = calculateFurnitureBounds(tempSlotInfo, originalSlotBounds, spaceInfo);
        actualRenderWidth = furnitureBounds.renderWidth;
        
        console.log('🔍 실제 배치 크기 미리 계산:', {
          slotIndex,
          originalAdjustedWidth: intrusionAnalysis.adjustedWidth,
          actualRenderWidth,
          improvement: actualRenderWidth > intrusionAnalysis.adjustedWidth ? '개선됨' : '동일/악화'
        });
      } catch (error) {
        console.warn('⚠️ 실제 배치 크기 미리 계산 실패:', error);
      }
      
      // 기둥 타입에 따른 처리 방식 결정
      let columnType: 'deep' | 'shallow' | 'medium' | undefined;
      let columnProcessingMethod: 'width-adjustment' | 'depth-adjustment' | undefined;
      let depthAdjustment: ColumnSlotInfo['depthAdjustment'];
      let splitPlacement: ColumnSlotInfo['splitPlacement'];
      let allowMultipleFurniture = false;
      let subSlots: ColumnSlotInfo['subSlots'];
      
      const DEPTH_THRESHOLD = 500; // 500mm 기준
      const depthAnalysis = analyzeColumnDepthPlacement(columnInSlot, indexing.columnWidth, slotStartX, slotEndX);
      columnType = depthAnalysis.columnType;
      
      // 기둥 C(300mm)는 깊이 조정 방식 사용 (사용자 요구사항 변경)
      if (columnType === 'medium') {
        columnProcessingMethod = 'depth-adjustment';
        depthAdjustment = depthAnalysis.depthAdjustment;
        splitPlacement = depthAnalysis.splitPlacement;
        allowMultipleFurniture = false; // 기둥 C는 깊이 조정 방식이므로 1개 가구만 배치
        
        console.log('🔵 기둥 C 감지 - 깊이 조정 방식:', {
          slotIndex,
          columnDepth: columnInSlot.depth,
          columnType: 'C (300mm)',
          columnProcessingMethod: 'depth-adjustment',
          availableWidth: Math.round((intrusionAnalysis.availableWidth || 0) * 100) / 100,
          adjustedDepth: depthAnalysis.depthAdjustment.adjustedDepth,
          canPlaceSingle: depthAnalysis.depthAdjustment.canPlaceSingle,
          canPlaceDual: depthAnalysis.depthAdjustment.canPlaceDual
        });
      } else if (columnType === 'shallow') {
        columnProcessingMethod = 'depth-adjustment';
        depthAdjustment = depthAnalysis.depthAdjustment;
        splitPlacement = depthAnalysis.splitPlacement;
      } else {
        columnProcessingMethod = 'width-adjustment';
      }
      
      console.log('🔍 기둥 처리 방식 결정:', {
        slotIndex,
        columnDepth: columnInSlot.depth,
        columnType,
        columnProcessingMethod,
        allowMultipleFurniture
      });

      console.log('🏛️ 슬롯 분석 완료:', {
        slotIndex,
        hasColumn: true,
        columnPosition,
        availableWidth: Math.round((intrusionAnalysis.availableWidth || 0) * 100) / 100,
        actualRenderWidth,
        배치가능여부: actualRenderWidth >= 150 ? '✅ 배치 가능' : '❌ 배치 불가',
        intrusionDirection: intrusionAnalysis.intrusionDirection,
        furniturePosition: intrusionAnalysis.furniturePosition,
        adjustedWidth: Math.round((intrusionAnalysis.adjustedWidth || 0) * 100) / 100,
        doorWidth: indexing.columnWidth - 3,
        columnType,
        hasDepthAnalysis: columnType !== undefined
      });

      // 기둥 앞 공간 계산 (기둥 C일 때만)
      let frontSpace: ColumnSlotInfo['frontSpace'];
      if (columnType === 'medium' && columnInSlot.depth === 300) {
        const STANDARD_CABINET_DEPTH = 730;
        const frontSpaceDepth = STANDARD_CABINET_DEPTH - columnInSlot.depth; // 430mm
        // 기둥 앞 공간의 폭 = 슬롯 전체 폭 (기둥이 차지하는 영역)
        const frontSpaceWidth = indexing.columnWidth;
        // 슬롯의 X 위치 사용 (기둥 position이 0인 경우가 있으므로)
        const slotCenterX = indexing.threeUnitPositions[slotIndex];
        // 기둥 앞쪽 Z 위치 (기둥 깊이의 절반 + 앞 공간 깊이의 절반)
        const columnCenterZ = (frontSpaceDepth / 2) * 0.01; // 앞 공간의 중심

        frontSpace = {
          available: true,
          width: frontSpaceWidth,
          depth: frontSpaceDepth,
          centerX: slotCenterX,
          centerZ: columnCenterZ
        };

        console.log('🟢 기둥 앞 공간 계산:', {
          slotIndex,
          frontSpaceWidth,
          frontSpaceDepth,
          centerX: slotCenterX,
          centerZ: columnCenterZ
        });
      }

      slotInfos.push({
        slotIndex,
        hasColumn: true,
        column: columnInSlot,
        columnPosition,
        availableWidth,
        doorWidth: indexing.columnWidth - 3, // 도어는 항상 원래 슬롯 크기 유지
        needsMullion,
        mullionSide,
        intrusionDirection: intrusionAnalysis.intrusionDirection,
        furniturePosition: intrusionAnalysis.furniturePosition,
        adjustedWidth: Math.round(actualRenderWidth * 100) / 100, // 실제 렌더링 가능한 크기로 업데이트 (소수점 2자리)
        columnType,
        columnProcessingMethod,
        depthAdjustment,
        splitPlacement,
        allowMultipleFurniture,
        subSlots, // Column C의 서브슬롯 정보 추가
        frontSpace // 기둥 앞 공간 정보 추가
      });
    }
  }

  return slotInfos;
};

/**
 * 기둥 커버 도어 생성
 */
export const createPillarCoverDoor = (column: Column, slotWidth: number): PillarCoverDoor => {
  return {
    type: 'pillarCover',
    isStorage: false,
    linkedTo: column.id,
    width: slotWidth - 3, // 도어 갭 3mm 적용
    height: column.height
  };
};

/**
 * 슬롯에 가구 배치 시 기둥을 고려한 너비 계산
 */
export const calculateFurnitureWidthWithColumn = (
  slotInfo: ColumnSlotInfo,
  originalWidth: number
): number => {
  if (!slotInfo.hasColumn) {
    return originalWidth; // 기둥이 없으면 원래 너비 그대로
  }
  
  // 기둥이 있는 경우 사용 가능한 너비로 제한
  return Math.min(originalWidth, slotInfo.availableWidth);
};

/**
 * 듀얼 가구 여부 판별 (표준 듀얼 너비 기준)
 */
export const isDualFurniture = (furnitureWidth: number, spaceInfo: SpaceInfo): boolean => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const dualWidth = indexing.columnWidth * 2;
  return Math.abs(furnitureWidth - dualWidth) < 50; // 50mm 허용 오차
};

/**
 * 기둥 침범 시 듀얼 가구를 싱글 가구로 변환
 */
export const convertDualToSingleIfNeeded = (
  moduleData: any,
  slotInfo: ColumnSlotInfo,
  spaceInfo: SpaceInfo
): { shouldConvert: boolean; convertedModuleData?: any; occupiedSlots?: number[] } => {
  // 기둥이 없으면 변환 불필요
  if (!slotInfo.hasColumn) {
    return { shouldConvert: false };
  }
  
  // 듀얼 가구인지 확인
  const isDual = isDualFurniture(moduleData.dimensions.width, spaceInfo);
  if (!isDual) {
    return { shouldConvert: false };
  }
  
  // 최소 필요 너비 확인 (300mm로 완화)
  const minRequiredWidth = 300;
  if (slotInfo.availableWidth < minRequiredWidth) {
    console.log('⚠️ 듀얼 → 싱글 변환 불가: 공간 부족', {
      availableWidth: slotInfo.availableWidth,
      minRequiredWidth,
      slotIndex: slotInfo.slotIndex
    });
    return { shouldConvert: false };
  }
  
  // 듀얼 가구를 싱글로 변환
  const convertedModuleData = {
    ...moduleData,
    id: moduleData.id.replace('dual-', 'single-'), // ID 변경
    name: moduleData.name.replace('듀얼', '싱글'), // 이름 변경
    dimensions: {
      ...moduleData.dimensions,
      width: slotInfo.availableWidth // 사용 가능한 너비로 조정
    }
  };
  
  // 원래 듀얼 가구가 차지했던 슬롯 정보 (현재 슬롯만 점유, 다음 슬롯은 비워둠)
  const occupiedSlots = [slotInfo.slotIndex]; // 변환 후 점유 슬롯
  
  console.log('🔄 듀얼 → 싱글 변환:', {
    originalId: moduleData.id,
    convertedId: convertedModuleData.id,
    originalWidth: moduleData.dimensions.width,
    convertedWidth: convertedModuleData.dimensions.width,
    availableWidth: slotInfo.availableWidth,
    slotIndex: slotInfo.slotIndex,
    occupiedSlots,
    remainingSlotEmpty: slotInfo.slotIndex + 1 // 다음 슬롯은 비워둠
  });
  
  return { 
    shouldConvert: true, 
    convertedModuleData,
    occupiedSlots
  };
};

/**
 * 기둥 침범 시 듀얼 가구를 2개의 독립적인 싱글 가구로 분할
 */
export const splitDualToSinglesIfNeeded = (
  moduleData: any,
  startSlotIndex: number,
  spaceInfo: SpaceInfo
): { 
  shouldSplit: boolean; 
  leftSingleData?: any; 
  rightSingleData?: any;
  leftSlotIndex?: number;
  rightSlotIndex?: number;
  columnAffectedSlot?: number;
} => {
  // 듀얼 가구인지 확인
  const isDual = isDualFurniture(moduleData.dimensions.width, spaceInfo);
  if (!isDual) {
    return { shouldSplit: false };
  }
  
  // 기둥 슬롯 분석
  const columnSlots = analyzeColumnSlots(spaceInfo);
  const leftSlotInfo = columnSlots[startSlotIndex];
  const rightSlotInfo = columnSlots[startSlotIndex + 1];
  
  if (!leftSlotInfo || !rightSlotInfo) {
    return { shouldSplit: false };
  }
  
  // 기둥이 있는 슬롯 확인
  const hasColumnInLeft = leftSlotInfo.hasColumn;
  const hasColumnInRight = rightSlotInfo.hasColumn;
  
  // 기둥이 하나 이상의 슬롯에 있어야 분할 필요
  if (!hasColumnInLeft && !hasColumnInRight) {
    return { shouldSplit: false };
  }
  
  const indexing = calculateSpaceIndexing(spaceInfo);
  const standardSingleWidth = indexing.columnWidth;
  const minRequiredWidth = 150; // 기둥 침범 시 싱글 캐비넷 최소 너비
  
  // 왼쪽 싱글 가구 생성 (침범 방향 고려)
  const leftWidth = hasColumnInLeft ? leftSlotInfo.adjustedWidth || leftSlotInfo.availableWidth : standardSingleWidth;
  const leftSingleData = leftWidth >= minRequiredWidth ? {
    ...moduleData,
    id: moduleData.id.replace('dual-', 'single-left-'),
    name: moduleData.name.replace('듀얼', '싱글(좌)'),
    dimensions: {
      ...moduleData.dimensions,
      width: leftWidth
    }
  } : null;
  
  // 오른쪽 싱글 가구 생성 (침범 방향 고려)
  const rightWidth = hasColumnInRight ? rightSlotInfo.adjustedWidth || rightSlotInfo.availableWidth : standardSingleWidth;
  const rightSingleData = rightWidth >= minRequiredWidth ? {
    ...moduleData,
    id: moduleData.id.replace('dual-', 'single-right-'),
    name: moduleData.name.replace('듀얼', '싱글(우)'),
    dimensions: {
      ...moduleData.dimensions,
      width: rightWidth
    }
  } : null;
  
  console.log('🔄 듀얼 → 싱글 2개 분할 (침범 방향 고려):', {
    originalId: moduleData.id,
    originalWidth: moduleData.dimensions.width,
    leftSlot: startSlotIndex,
    rightSlot: startSlotIndex + 1,
    hasColumnInLeft,
    hasColumnInRight,
    leftWidth,
    rightWidth,
    leftCreated: !!leftSingleData,
    rightCreated: !!rightSingleData,
    leftIntrusionDirection: hasColumnInLeft ? leftSlotInfo.intrusionDirection : 'none',
    rightIntrusionDirection: hasColumnInRight ? rightSlotInfo.intrusionDirection : 'none',
    leftFurniturePosition: hasColumnInLeft ? leftSlotInfo.furniturePosition : 'center',
    rightFurniturePosition: hasColumnInRight ? rightSlotInfo.furniturePosition : 'center',
    columnAffectedSlot: hasColumnInLeft ? startSlotIndex : (hasColumnInRight ? startSlotIndex + 1 : undefined)
  });
  
  return {
    shouldSplit: true,
    leftSingleData,
    rightSingleData,
    leftSlotIndex: startSlotIndex,
    rightSlotIndex: startSlotIndex + 1,
    columnAffectedSlot: hasColumnInLeft ? startSlotIndex : (hasColumnInRight ? startSlotIndex + 1 : undefined)
  };
};

/**
 * 기둥이 포함된 슬롯에서 가구 배치 가능 여부 확인 (실제 배치 크기 기준)
 */
export const canPlaceFurnitureInColumnSlot = (
  slotInfo: ColumnSlotInfo,
  furnitureWidth: number,
  isDualFurniture: boolean = false
): boolean => {
  if (!slotInfo.hasColumn) {
    return true; // 기둥이 없으면 배치 가능
  }
  
  // 기둥 침범 슬롯에는 듀얼 캐비넷 배치 금지
  if (isDualFurniture) {
    console.log('🚫 기둥 침범 슬롯에는 듀얼 캐비넷 배치 불가:', {
      slotIndex: slotInfo.slotIndex,
      reason: '기둥 침범 시 싱글 캐비넷만 배치 가능'
    });
    return false;
  }
  
  // 싱글 캐비넷 최소 필요 너비 150mm
  const minRequiredWidth = 150;
  
  // adjustedWidth는 이미 analyzeColumnSlots에서 실제 렌더링 가능한 크기로 계산됨
  const actualRenderWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
  
  // 실제 렌더링 가능한 크기가 최소 크기 이상이면 배치 가능
  const canPlace = actualRenderWidth >= minRequiredWidth;
  
  console.log('🏛️ 기둥 슬롯 배치 가능 여부 확인 (실제 크기 기준):', {
    slotIndex: slotInfo.slotIndex,
    hasColumn: slotInfo.hasColumn,
    availableWidth: slotInfo.availableWidth,
    adjustedWidth: slotInfo.adjustedWidth,
    actualRenderWidth,
    minRequiredWidth,
    originalFurnitureWidth: furnitureWidth,
    isDualFurniture,
    intrusionDirection: slotInfo.intrusionDirection,
    furniturePosition: slotInfo.furniturePosition,
    canPlace,
    reason: canPlace ? '✅ 배치 가능 (싱글 캐비넷만, 실제 크기 기준)' : 
            isDualFurniture ? '🚫 듀얼 캐비넷 배치 금지' :
            `❌ 실제 배치 크기(${actualRenderWidth}mm)가 최소 필요 너비(${minRequiredWidth}mm)보다 작음`
  });
  
  return canPlace;
};

/**
 * 기둥 포함 슬롯 정보를 기반으로 배치 위치 조정 (침범 방향 고려)
 */
export const adjustFurniturePositionForColumn = (
  slotInfo: ColumnSlotInfo,
  originalPosition: { x: number; y: number; z: number }
): { x: number; y: number; z: number } => {
  if (!slotInfo.hasColumn || !slotInfo.column || !slotInfo.furniturePosition) {
    return originalPosition; // 기둥이 없거나 위치 정보가 없으면 원래 위치 그대로
  }
  
  const column = slotInfo.column;
  const columnCenterX = column.position[0];
  const columnWidthM = column.width * 0.01; // mm to meters
  const columnLeftX = columnCenterX - columnWidthM / 2;
  const columnRightX = columnCenterX + columnWidthM / 2;
  
  // 슬롯 정보
  const indexing = calculateSpaceIndexing({ columns: [column] } as SpaceInfo);
  const slotWidthM = indexing.columnWidth * 0.01; // mm to meters
  const slotCenterX = originalPosition.x;
  const slotLeftX = slotCenterX - slotWidthM / 2;
  const slotRightX = slotCenterX + slotWidthM / 2;
  
  const adjustedWidthM = slotInfo.adjustedWidth! * 0.01; // mm to meters
  const margin = 0; // 이격거리 제거 (가구가 기둥에 딱 붙도록)
  
  // 침범 방향에 따른 가구 위치 조정
  switch (slotInfo.intrusionDirection) {
    case 'from-left':
      // 기둥이 왼쪽에서 침범: 가구를 오른쪽에 정렬
      const rightAlignedX = columnRightX + adjustedWidthM / 2 + margin;
      console.log('🏛️ 왼쪽 침범 - 가구 오른쪽 정렬:', {
        columnRightX,
        adjustedWidthM,
        finalX: rightAlignedX,
        slotIndex: slotInfo.slotIndex
      });
      return { ...originalPosition, x: rightAlignedX };
      
    case 'from-right':
      // 기둥이 오른쪽에서 침범: 가구를 왼쪽에 정렬
      const leftAlignedX = columnLeftX - adjustedWidthM / 2 - margin;
      console.log('🏛️ 오른쪽 침범 - 가구 왼쪽 정렬:', {
        columnLeftX,
        adjustedWidthM,
        finalX: leftAlignedX,
        slotIndex: slotInfo.slotIndex
      });
      return { ...originalPosition, x: leftAlignedX };
      
    case 'center':
      // 기둥이 중앙에 있는 경우: furniturePosition에 따라 배치
      if (slotInfo.furniturePosition === 'left-aligned') {
        const centerLeftX = slotLeftX + adjustedWidthM / 2 + margin;
        console.log('🏛️ 중앙 침범 - 가구 왼쪽 배치:', {
          slotLeftX,
          adjustedWidthM,
          finalX: centerLeftX,
          slotIndex: slotInfo.slotIndex
        });
        return { ...originalPosition, x: centerLeftX };
      } else if (slotInfo.furniturePosition === 'right-aligned') {
        const centerRightX = slotRightX - adjustedWidthM / 2 - margin;
        console.log('🏛️ 중앙 침범 - 가구 오른쪽 배치:', {
          slotRightX,
          adjustedWidthM,
          finalX: centerRightX,
          slotIndex: slotInfo.slotIndex
        });
        return { ...originalPosition, x: centerRightX };
      }
      break;
  }
  
  return originalPosition;
}; 

/**
 * 기둥 침범 방향에 따른 최적 힌지 방향 계산
 */
export const calculateOptimalHingePosition = (
  slotInfo: ColumnSlotInfo
): 'left' | 'right' => {
  // 기둥이 없으면 기본값 (오른쪽)
  if (!slotInfo.hasColumn) {
    return 'right';
  }
  
  let hingePosition: 'left' | 'right' = 'right';
  
  // 기둥 침범 방향에 따른 힌지 방향 결정 (캐비넷 위치에 따라 고정)
  switch (slotInfo.intrusionDirection) {
    case 'from-left':
      // 기둥이 왼쪽에서 침범: 캐비넷이 오른쪽에 위치 → 힌지 오른쪽 고정
      hingePosition = 'right';
      break;
      
    case 'from-right':
      // 기둥이 오른쪽에서 침범: 캐비넷이 왼쪽에 위치 → 힌지 왼쪽 고정
      hingePosition = 'left';
      break;
      
    case 'center':
      // 기둥이 중앙에 있는 경우: 캐비넷 위치에 따라 힌지 방향 고정
      if (slotInfo.furniturePosition === 'left-aligned') {
        // 캐비넷이 왼쪽에 배치: 힌지 왼쪽 고정
        hingePosition = 'left';
      } else if (slotInfo.furniturePosition === 'right-aligned') {
        // 캐비넷이 오른쪽에 배치: 힌지 오른쪽 고정
        hingePosition = 'right';
      }
      break;
      
    default:
      hingePosition = 'right';
  }
  
  console.log('🚪 힌지 방향 계산:', {
    slotIndex: slotInfo.slotIndex,
    hasColumn: slotInfo.hasColumn,
    intrusionDirection: slotInfo.intrusionDirection,
    furniturePosition: slotInfo.furniturePosition,
    calculatedHinge: hingePosition,
    logic: slotInfo.intrusionDirection === 'from-left' ? '기둥이 왼쪽 침범 → 오른쪽 캐비넷 → 힌지 오른쪽 고정' :
           slotInfo.intrusionDirection === 'from-right' ? '기둥이 오른쪽 침범 → 왼쪽 캐비넷 → 힌지 왼쪽 고정' :
           slotInfo.intrusionDirection === 'center' ? `중앙 침범 → ${slotInfo.furniturePosition} → ${hingePosition} 힌지 (캐비넷 위치에 따라 고정)` :
           '기본값'
  });
  
  return hingePosition;
};

/**
 * 기둥 침범 시 캐비넷의 실제 경계 계산 (밀어내는 효과)
 */
export const calculateFurnitureBounds = (
  slotInfo: ColumnSlotInfo,
  originalSlotBounds: { left: number; right: number; center: number },
  spaceInfo: SpaceInfo
): {
  left: number;
  right: number;
  center: number;
  width: number;
  renderWidth: number; // 실제 렌더링될 가구 너비
  depthAdjustmentNeeded?: boolean; // Column C 150mm 이상 침범 시 깊이 조정 필요
} => {
  // 모든 영역(단내림 포함)에서 기둥 처리 로직 적용
  console.log('🔧 [calculateFurnitureBounds] 기둥 처리 로직 적용 (모든 구간)');

  if (!slotInfo.hasColumn || !slotInfo.column) {
    // 기둥이 없으면 원래 슬롯 경계 그대로
    const width = originalSlotBounds.right - originalSlotBounds.left;
    return {
      left: originalSlotBounds.left,
      right: originalSlotBounds.right,
      center: originalSlotBounds.center,
      width: parseFloat((width * 100).toFixed(2)), // mm 단위
      renderWidth: parseFloat((width * 100).toFixed(2))
    };
  }
  
  const column = slotInfo.column;
  const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
  const columnRightX = column.position[0] + (column.width * 0.01) / 2;
  const margin = 0; // 이격거리 제거 (가구가 기둥에 딱 붙도록)
  
  let furnitureLeft = originalSlotBounds.left;
  let furnitureRight = originalSlotBounds.right;
  let renderWidth: number;
  
  // 최소 가구 크기 (150mm)
  const minFurnitureWidth = 0.15; // Three.js 단위 (150mm)
  
  // 기둥 충돌 방지를 위한 안전 마진 (1mm로 최소화)
  const safetyMargin = 0.001;
  
  switch (slotInfo.intrusionDirection) {
    case 'from-left':
      // 기둥이 왼쪽에서 침범: 가구는 기둥 오른쪽 경계부터 시작
      // 가구의 왼쪽 엣지가 기둥 오른쪽 경계에 정확히 위치
      furnitureLeft = columnRightX; // 가구 왼쪽 = 기둥 오른쪽 (margin 0)
      furnitureRight = originalSlotBounds.right; // 오른쪽 경계는 슬롯 경계 그대로
      
      // 슬롯 경계를 절대 벗어나지 않도록 제한
      furnitureLeft = Math.max(furnitureLeft, originalSlotBounds.left);
      furnitureRight = Math.min(furnitureRight, originalSlotBounds.right);
      
      // 기둥 침범 시에는 가구가 줄어들어야 하므로 최소 크기 보장을 적용하지 않음
      const leftCurrentWidth = furnitureRight - furnitureLeft;
      if (leftCurrentWidth < 0.05) { // 50mm 미만이면 배치 불가
        console.log('🚨 기둥 침범으로 인해 가구 크기가 너무 작아 배치 불가:', {
          currentWidth: (leftCurrentWidth * 100).toFixed(1) + 'mm',
          columnPosition: columnRightX.toFixed(3)
        });
        furnitureLeft = originalSlotBounds.left;
        furnitureRight = originalSlotBounds.left + 0.05; // 50mm 강제 설정
      }

      renderWidth = parseFloat(((furnitureRight - furnitureLeft) * 100).toFixed(2));
      console.log('🏗️ 왼쪽 침범 - 기둥 충돌 방지 적용:', {
        columnPosition: columnRightX.toFixed(3),
        finalLeft: furnitureLeft.toFixed(3),
        finalRight: furnitureRight.toFixed(3),
        gap: ((furnitureLeft - columnRightX) * 100).toFixed(1) + 'mm',
        기둥충돌방지: furnitureLeft > columnRightX ? '✅ 안전' : '❌ 위험',
        newWidth: renderWidth.toFixed(1) + 'mm',
        slotIndex: slotInfo.slotIndex
      });
      break;
      
    case 'from-right':
      // 기둥이 오른쪽에서 침범: 가구는 기둥 왼쪽 경계까지
      furnitureLeft = originalSlotBounds.left; // 왼쪽 경계는 슬롯 경계 그대로
      furnitureRight = columnLeftX; // margin 제거 - 기둥에 딱 붙음
      
      // 슬롯 경계를 절대 벗어나지 않도록 제한
      furnitureLeft = Math.max(furnitureLeft, originalSlotBounds.left);
      furnitureRight = Math.min(furnitureRight, originalSlotBounds.right);
      
      // 기둥 침범 시에는 가구가 줄어들어야 하므로 최소 크기 보장을 적용하지 않음
      const rightCurrentWidth = furnitureRight - furnitureLeft;
      if (rightCurrentWidth < 0.05) { // 50mm 미만이면 배치 불가
        console.log('🚨 기둥 침범으로 인해 가구 크기가 너무 작아 배치 불가:', {
          currentWidth: (rightCurrentWidth * 100).toFixed(1) + 'mm',
          columnPosition: columnLeftX.toFixed(3)
        });
        furnitureRight = originalSlotBounds.right;
        furnitureLeft = originalSlotBounds.right - 0.05; // 50mm 강제 설정
      }

      renderWidth = parseFloat(((furnitureRight - furnitureLeft) * 100).toFixed(2));
      console.log('🏗️ 오른쪽 침범 - 기둥 충돌 방지 적용:', {
        columnPosition: columnLeftX.toFixed(3),
        finalLeft: furnitureLeft.toFixed(3),
        finalRight: furnitureRight.toFixed(3),
        gap: ((columnLeftX - furnitureRight) * 100).toFixed(1) + 'mm',
        기둥충돌방지: furnitureRight < columnLeftX ? '✅ 안전' : '❌ 위험',
        newWidth: renderWidth.toFixed(1) + 'mm',
        slotIndex: slotInfo.slotIndex
      });
      break;
      
    case 'center':
      // 기둥이 중앙에 있는 경우: furniturePosition에 따라 한쪽에 배치
      if (slotInfo.furniturePosition === 'left-aligned') {
        furnitureLeft = originalSlotBounds.left;
        furnitureRight = Math.min(columnLeftX - margin, originalSlotBounds.right);
        
        // 슬롯 경계 제한
        furnitureRight = Math.min(furnitureRight, originalSlotBounds.right);
        
        // 기둥 침범 시에는 가구가 줄어들어야 하므로 최소 크기 보장을 적용하지 않음
        // 대신 기둥과의 충돌만 방지
        const centerLeftCurrentWidth = furnitureRight - furnitureLeft;
        if (centerLeftCurrentWidth < 0.05) { // 50mm 미만이면 배치 불가
          console.log('🚨 중앙 침범으로 인해 가구 크기가 너무 작아 배치 불가:', {
            currentWidth: (centerLeftCurrentWidth * 100).toFixed(1) + 'mm'
          });
          furnitureLeft = originalSlotBounds.left;
          furnitureRight = originalSlotBounds.left + 0.05; // 50mm 강제 설정
        }
      } else if (slotInfo.furniturePosition === 'right-aligned') {
        furnitureLeft = Math.max(columnRightX + margin, originalSlotBounds.left);
        furnitureRight = originalSlotBounds.right;
        
        // 슬롯 경계 제한
        furnitureLeft = Math.max(furnitureLeft, originalSlotBounds.left);
        
        // 기둥 침범 시에는 가구가 줄어들어야 하므로 최소 크기 보장을 적용하지 않음
        // 대신 기둥과의 충돌만 방지
        const centerRightCurrentWidth = furnitureRight - furnitureLeft;
        if (centerRightCurrentWidth < 0.05) { // 50mm 미만이면 배치 불가
          console.log('🚨 중앙 침범으로 인해 가구 크기가 너무 작아 배치 불가:', {
            currentWidth: (centerRightCurrentWidth * 100).toFixed(1) + 'mm'
          });
          furnitureRight = originalSlotBounds.right;
          furnitureLeft = originalSlotBounds.right - 0.05; // 50mm 강제 설정
        }
      } else {
        // 기본값: 원래 슬롯 사용
        furnitureLeft = originalSlotBounds.left;
        furnitureRight = originalSlotBounds.right;
      }

      renderWidth = parseFloat(((furnitureRight - furnitureLeft) * 100).toFixed(2));
      console.log('🏗️ 중앙 침범 - 슬롯 경계 제한 적용:', {
        position: slotInfo.furniturePosition,
        finalLeft: furnitureLeft,
        finalRight: furnitureRight,
        slotBoundaryRespected: furnitureLeft >= originalSlotBounds.left && furnitureRight <= originalSlotBounds.right,
        newWidth: renderWidth,
        slotIndex: slotInfo.slotIndex
      });
      break;
      
    default:
      renderWidth = parseFloat(((originalSlotBounds.right - originalSlotBounds.left) * 100).toFixed(2));
  }
  
  // 침범 방향에 따른 선택적 슬롯 경계 검사 (한쪽 방향만 조정)
  switch (slotInfo.intrusionDirection) {
    case 'from-left':
      // 왼쪽 침범: 오른쪽 경계는 원래 슬롯 경계 그대로, 왼쪽만 제한
      furnitureRight = originalSlotBounds.right; // 오른쪽은 절대 변경하지 않음
      furnitureLeft = Math.max(furnitureLeft, originalSlotBounds.left); // 왼쪽만 슬롯 내로 제한
      break;
      
    case 'from-right':
      // 오른쪽 침범: 왼쪽 경계는 원래 슬롯 경계 그대로, 오른쪽만 제한
      furnitureLeft = originalSlotBounds.left; // 왼쪽은 절대 변경하지 않음
      furnitureRight = Math.min(furnitureRight, originalSlotBounds.right); // 오른쪽만 슬롯 내로 제한
      break;
      
    default:
      // 일반적인 경우에만 양쪽 제한
      furnitureLeft = Math.max(furnitureLeft, originalSlotBounds.left);
      furnitureRight = Math.min(furnitureRight, originalSlotBounds.right);
  }
  
  // 가구 중심 계산 - 기둥 침범 시 가구를 기둥에 밀착시키기 위한 정확한 중심 계산
  let newCenter = (furnitureLeft + furnitureRight) / 2;
  
  // 기둥이 없는 경우에만 슬롯 경계 제한 적용
  if (!slotInfo.hasColumn) {
    // 기둥이 없는 경우에만 슬롯 경계 제한 적용
    const halfWidth = (furnitureRight - furnitureLeft) / 2;
    const slotCenterMin = originalSlotBounds.left + halfWidth;
    const slotCenterMax = originalSlotBounds.right - halfWidth;
    
    newCenter = Math.max(slotCenterMin, Math.min(slotCenterMax, newCenter));
    
    // 중심 조정에 따라 가구 경계 재계산
    furnitureLeft = newCenter - halfWidth;
    furnitureRight = newCenter + halfWidth;
  } else {
    // 기둥이 있는 경우: 가구의 실제 중심은 left와 right의 중간점
    // 이미 계산된 furnitureLeft와 furnitureRight를 그대로 사용
    newCenter = (furnitureLeft + furnitureRight) / 2;
    
    // 가구 메시가 중심에서 렌더링되므로, 가구를 기둥에 밀착시키려면
    // 가구 중심을 정확히 계산해야 함
    const furnitureHalfWidth = (furnitureRight - furnitureLeft) / 2;
    
    console.log('🎯 기둥 침범 시 가구 중심 계산:', {
      intrusionDirection: slotInfo.intrusionDirection,
      columnPos: slotInfo.column.position[0].toFixed(3),
      columnWidth: slotInfo.column.width,
      columnLeftX: (slotInfo.column.position[0] - slotInfo.column.width * 0.01 / 2).toFixed(3),
      columnRightX: (slotInfo.column.position[0] + slotInfo.column.width * 0.01 / 2).toFixed(3),
      furnitureLeft: furnitureLeft.toFixed(3),
      furnitureRight: furnitureRight.toFixed(3),
      furnitureWidth: ((furnitureRight - furnitureLeft) * 100).toFixed(1) + 'mm',
      calculatedCenter: newCenter.toFixed(3),
      originalSlotCenter: originalSlotBounds.center.toFixed(3),
      centerOffset: ((newCenter - originalSlotBounds.center) * 100).toFixed(1) + 'mm',
      '검증': {
        '가구왼쪽엣지': (newCenter - furnitureHalfWidth).toFixed(3),
        '가구오른쪽엣지': (newCenter + furnitureHalfWidth).toFixed(3),
        '기둥과의거리': slotInfo.intrusionDirection === 'from-left' 
          ? ((newCenter - furnitureHalfWidth - (slotInfo.column.position[0] + slotInfo.column.width * 0.01 / 2)) * 100).toFixed(1) + 'mm'
          : ((slotInfo.column.position[0] - slotInfo.column.width * 0.01 / 2 - (newCenter + furnitureHalfWidth)) * 100).toFixed(1) + 'mm'
      }
    });
  }
  
  const totalWidth = parseFloat(((furnitureRight - furnitureLeft) * 100).toFixed(2)); // mm 단위

  // 기둥 침범 시에는 가구가 줄어들어야 하므로 최소 크기 보장을 제한적으로 적용
  let finalRenderWidth = totalWidth;

  // 기둥이 없는 경우에만 최소 크기 보장
  if (!slotInfo.hasColumn) {
    finalRenderWidth = parseFloat(Math.max(totalWidth, 150).toFixed(2)); // 최소 150mm 보장
  } else {
    // 기둥 침범 시에는 실제 계산된 크기 사용 (최소 크기 제한 없음)
    finalRenderWidth = totalWidth;
    console.log('🔧 기둥 침범 시 가구 크기 조정:', {
      originalWidth: (originalSlotBounds.right - originalSlotBounds.left) * 100,
      adjustedWidth: finalRenderWidth,
      intrusionDirection: slotInfo.intrusionDirection,
      columnType: slotInfo.columnType
    });
  }
  
  // Column C (300mm) 특별 처리 - 150mm 이상 침범 시 깊이 조정 필요
  let depthAdjustmentNeeded = false;
  if (slotInfo.columnType === 'medium' && slotInfo.column && slotInfo.column.depth === 300) {
    const slotWidthMm = (originalSlotBounds.right - originalSlotBounds.left) * 100;
    const intrusionAmount = slotWidthMm - totalWidth;
    
    if (intrusionAmount >= 150) {
      depthAdjustmentNeeded = true;
      console.log('🟣 Column C 150mm 이상 침범 감지:', {
        slotWidth: slotWidthMm.toFixed(1) + 'mm',
        availableWidth: totalWidth.toFixed(1) + 'mm',
        intrusionAmount: intrusionAmount.toFixed(1) + 'mm',
        depthAdjustmentNeeded: true
      });
    }
  }
  
  console.log('🏗️ 최종 가구 경계 (방향성 유지):', {
    intrusionDirection: slotInfo.intrusionDirection,
    slotBounds: {
      left: originalSlotBounds.left.toFixed(3),
      right: originalSlotBounds.right.toFixed(3),
      center: originalSlotBounds.center.toFixed(3)
    },
    furnitureBounds: {
      left: furnitureLeft.toFixed(3),
      right: furnitureRight.toFixed(3),
      center: newCenter.toFixed(3)
    },
    width: finalRenderWidth,
    columnType: slotInfo.columnType,
    depthAdjustmentNeeded,
    logic: slotInfo.intrusionDirection === 'from-left' ? '왼쪽 침범 → 오른쪽 경계 고정, 왼쪽만 조정' :
           slotInfo.intrusionDirection === 'from-right' ? '오른쪽 침범 → 왼쪽 경계 고정, 오른쪽만 조정' :
           '일반 케이스 → 양쪽 조정'
  });
  
  return {
    left: furnitureLeft,
    right: furnitureRight,
    center: newCenter,
    width: totalWidth,
    renderWidth: finalRenderWidth,
    depthAdjustmentNeeded
  };
}; 

/**
 * 기존 배치된 듀얼 가구 중 기둥 침범을 받는 가구들을 2개의 싱글로 분할
 */
export const autoSplitDualFurnitureByColumns = (
  placedModules: any[],
  spaceInfo: SpaceInfo,
  addModule: (module: any) => void,
  removeModule: (moduleId: string) => void
): void => {
  const columnSlots = analyzeColumnSlots(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  const internalSpace = { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth };
  
  // 분할 대상 가구들 수집
  const furnitureToSplit: any[] = [];
  
  placedModules.forEach(placedModule => {
    // 모듈 데이터 가져오기 (커스텀 가구는 PlacedModule에서 빌드)
    const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo)
      || buildModuleDataFromPlacedModule(placedModule);
    if (!moduleData) return;
    
    // 듀얼 가구인지 확인
    const isDual = isDualFurniture(moduleData.dimensions.width, spaceInfo);
    if (!isDual) return;
    
    // 슬롯 인덱스 찾기
    let slotIndex = placedModule.slotIndex;
    if (slotIndex === undefined) {
      // 위치에서 슬롯 인덱스 추정
      if (indexing.threeUnitDualPositions) {
        slotIndex = indexing.threeUnitDualPositions.findIndex(pos => 
          Math.abs(pos - placedModule.position.x) < 0.2
        );
      }
    }
    
    if (slotIndex === undefined || slotIndex < 0) return;
    
    // 듀얼 가구가 차지하는 두 슬롯 확인
    const leftSlotInfo = columnSlots[slotIndex];
    const rightSlotInfo = columnSlots[slotIndex + 1];
    
    if (!leftSlotInfo || !rightSlotInfo) return;
    
    // 기둥이 하나 이상의 슬롯에 있으면 분할 대상
    if (leftSlotInfo.hasColumn || rightSlotInfo.hasColumn) {
      furnitureToSplit.push({
        placedModule,
        moduleData,
        slotIndex,
        leftSlotInfo,
        rightSlotInfo
      });
    }
  });
  
  // 실제 분할 수행
  furnitureToSplit.forEach(({ placedModule, moduleData, slotIndex, leftSlotInfo, rightSlotInfo }) => {
    console.log('🔄 기존 듀얼 가구 자동 분할 시작:', {
      moduleId: placedModule.id,
      originalModuleId: moduleData.id,
      slotIndex,
      leftHasColumn: leftSlotInfo.hasColumn,
      rightHasColumn: rightSlotInfo.hasColumn
    });
    
    const splitResult = splitDualToSinglesIfNeeded(moduleData, slotIndex, spaceInfo);
    if (!splitResult.shouldSplit) {
      console.log('❌ 분할 조건 불충족:', placedModule.id);
      return;
    }
    
    // 원래 듀얼 가구 제거
    removeModule(placedModule.id);
    
    // 왼쪽 싱글 가구 생성
    if (splitResult.leftSingleData && splitResult.leftSlotIndex !== undefined) {
      const leftX = indexing.threeUnitPositions[splitResult.leftSlotIndex];
      let leftPosition = { x: leftX, y: 0, z: 0 };
      let leftFurnitureWidth = splitResult.leftSingleData.dimensions.width;
      
      // 기둥이 있는 슬롯의 경우 위치 조정
      if (leftSlotInfo.hasColumn) {
        const slotWidthM = indexing.columnWidth * 0.01;
        const originalBounds = {
          left: leftX - slotWidthM / 2,
          right: leftX + slotWidthM / 2,
          center: leftX
        };
        const furnitureBounds = calculateFurnitureBounds(leftSlotInfo, originalBounds, spaceInfo);
        leftPosition = { x: furnitureBounds.center, y: 0, z: 0 };
        leftFurnitureWidth = furnitureBounds.renderWidth;
      }
      
      const leftModule = {
        id: `split-left-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        moduleId: splitResult.leftSingleData.id,
        position: leftPosition,
        rotation: placedModule.rotation || 0,
        hasDoor: placedModule.hasDoor ?? false,
        customDepth: placedModule.customDepth || getDefaultDepth(splitResult.leftSingleData),
        slotIndex: splitResult.leftSlotIndex,
        isDualSlot: false,
        isValidInCurrentSpace: true,
        adjustedWidth: Math.round(leftFurnitureWidth * 100) / 100,
        hingePosition: leftSlotInfo ? calculateOptimalHingePosition(leftSlotInfo) : 'right'
      };
      
      addModule(leftModule);
      console.log('✅ 왼쪽 싱글 가구 생성:', leftModule.id);
    }
    
    // 오른쪽 싱글 가구 생성
    if (splitResult.rightSingleData && splitResult.rightSlotIndex !== undefined) {
      const rightX = indexing.threeUnitPositions[splitResult.rightSlotIndex];
      let rightPosition = { x: rightX, y: 0, z: 0 };
      let rightFurnitureWidth = splitResult.rightSingleData.dimensions.width;
      
      // 기둥이 있는 슬롯의 경우 위치 조정
      if (rightSlotInfo.hasColumn) {
        const slotWidthM = indexing.columnWidth * 0.01;
        const originalBounds = {
          left: rightX - slotWidthM / 2,
          right: rightX + slotWidthM / 2,
          center: rightX
        };
        const furnitureBounds = calculateFurnitureBounds(rightSlotInfo, originalBounds, spaceInfo);
        rightPosition = { x: furnitureBounds.center, y: 0, z: 0 };
        rightFurnitureWidth = furnitureBounds.renderWidth;
      }
      
      const rightModule = {
        id: `split-right-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        moduleId: splitResult.rightSingleData.id,
        position: rightPosition,
        rotation: placedModule.rotation || 0,
        hasDoor: placedModule.hasDoor ?? false,
        customDepth: placedModule.customDepth || getDefaultDepth(splitResult.rightSingleData),
        slotIndex: splitResult.rightSlotIndex,
        isDualSlot: false,
        isValidInCurrentSpace: true,
        adjustedWidth: Math.round(rightFurnitureWidth * 100) / 100,
        hingePosition: rightSlotInfo ? calculateOptimalHingePosition(rightSlotInfo) : 'right'
      };
      
      addModule(rightModule);
      console.log('✅ 오른쪽 싱글 가구 생성:', rightModule.id);
    }
    
    console.log('🎉 듀얼 가구 자동 분할 완료:', {
      originalId: placedModule.id,
      createdLeft: !!splitResult.leftSingleData,
      createdRight: !!splitResult.rightSingleData
    });
  });
  
  if (furnitureToSplit.length > 0) {
    console.log(`🔄 총 ${furnitureToSplit.length}개의 듀얼 가구가 자동 분할되었습니다.`);
  }
};

// getDefaultDepth 함수 정의
const getDefaultDepth = (moduleData: any): number => {
  return moduleData.dimensions.depth || 600; // 기본값 600mm
};

/**
 * 얕은 기둥에 대한 캐비넷 배치 옵션 생성
 */
export const generateCabinetPlacementOptions = (
  slotInfo: ColumnSlotInfo,
  moduleData: any,
  spaceInfo: SpaceInfo,
  slotIndex: number
): CabinetPlacementOption[] => {
  const options: CabinetPlacementOption[] = [];
  
  console.log('🏗️ generateCabinetPlacementOptions 호출:', {
    hasColumn: slotInfo.hasColumn,
    columnType: slotInfo.columnType,
    columnDepth: slotInfo.column?.depth,
    slotIndex,
    moduleId: moduleData.id
  });
  
  if (!slotInfo.hasColumn || !slotInfo.column || slotInfo.columnType !== 'shallow') {
    console.log('❌ 얕은 기둥 조건 불충족:', {
      hasColumn: slotInfo.hasColumn,
      hasColumnObject: !!slotInfo.column,
      columnType: slotInfo.columnType,
      reason: !slotInfo.hasColumn ? '기둥 없음' :
              !slotInfo.column ? '기둥 객체 없음' :
              slotInfo.columnType !== 'shallow' ? '깊은 기둥' : '알 수 없음'
    });
    return options; // 얕은 기둥이 아니면 옵션 없음
  }

  const column = slotInfo.column;
  const indexing = calculateSpaceIndexing(spaceInfo);
  const slotWidthMm = indexing.columnWidth;
  const slotCenterX = indexing.threeUnitPositions[slotIndex];

  // 1. 단일 배치 옵션 (깊이 조정) - 얕은 기둥은 항상 단일 배치 가능
  const adjustedDepth = 730 - column.depth; // 730 - 기둥깊이
  const canPlaceSingle = adjustedDepth >= 200; // 최소 200mm 깊이 필요
  
  console.log('📐 단일 배치 옵션 검토:', {
    columnDepth: column.depth,
    adjustedDepth,
    canPlaceSingle,
    availableWidth: slotInfo.availableWidth
  });
  
  if (canPlaceSingle) {
    const cabinetWidth = Math.max(slotInfo.availableWidth || slotWidthMm, 150); // 최소 150mm
    
    options.push({
      type: 'single',
      label: '단일 배치',
      description: `깊이 조정된 캐비넷 (깊이: ${adjustedDepth}mm)`,
      cabinets: [{
        id: `single-${Date.now()}`,
        width: cabinetWidth,
        depth: adjustedDepth,
        position: [slotCenterX, 0, 0],
        moduleId: moduleData.id.replace('dual-', 'single-')
      }]
    });
    
    console.log('✅ 단일 배치 옵션 추가됨');
  } else {
    console.log('❌ 단일 배치 불가 - 깊이 부족:', adjustedDepth);
  }

  // 2. 분할 배치 옵션들 - 기둥 위치 기반 직접 계산
  const columnCenterX = column.position[0]; // Three.js units (meters)
  const columnLeftX = columnCenterX - (column.width * 0.01) / 2;
  const columnRightX = columnCenterX + (column.width * 0.01) / 2;
  
  const slotLeftX = slotCenterX - (slotWidthMm * 0.01) / 2;
  const slotRightX = slotCenterX + (slotWidthMm * 0.01) / 2;
  
  const leftSpaceMm = Math.max(0, (columnLeftX - slotLeftX) * 100);
  const rightSpaceMm = Math.max(0, (slotRightX - columnRightX) * 100);
  
  console.log('📏 분할 공간 계산:', {
    slotCenterX: slotCenterX.toFixed(3),
    columnCenterX: columnCenterX.toFixed(3),
    slotLeftX: slotLeftX.toFixed(3),
    slotRightX: slotRightX.toFixed(3),
    columnLeftX: columnLeftX.toFixed(3),
    columnRightX: columnRightX.toFixed(3),
    leftSpaceMm: leftSpaceMm.toFixed(1) + 'mm',
    rightSpaceMm: rightSpaceMm.toFixed(1) + 'mm'
  });

  const canSplitDirect = leftSpaceMm >= 150 && rightSpaceMm >= 150;
  
  // 분할 배치 옵션들
  if (canSplitDirect) {
    const adjustedDepth = 730 - column.depth;

    // 가중치 분할 (실제 공간에 맞춰서)
    const leftCabinetWidth = Math.max(150, leftSpaceMm - 10); // 10mm 마진
    const rightCabinetWidth = Math.max(150, rightSpaceMm - 10); // 10mm 마진
    
    // 캐비넷 중심 위치 계산 (각 공간의 중앙)
    const leftCabinetCenterX = slotLeftX + (leftSpaceMm * 0.01) / 2;
    const rightCabinetCenterX = columnRightX + (rightSpaceMm * 0.01) / 2;
    
    options.push({
      type: 'split-weighted',
      label: '가중치 분할',
      description: `좌측 ${leftCabinetWidth.toFixed(0)}mm, 우측 ${rightCabinetWidth.toFixed(0)}mm`,
      cabinets: [
        {
          id: `split-left-${Date.now()}`,
          width: leftCabinetWidth,
          depth: adjustedDepth,
          position: [leftCabinetCenterX, 0, 0],
          moduleId: moduleData.id.replace('dual-', 'single-left-')
        },
        {
          id: `split-right-${Date.now()}`,
          width: rightCabinetWidth,
          depth: adjustedDepth,
          position: [rightCabinetCenterX, 0, 0],
          moduleId: moduleData.id.replace('dual-', 'single-right-')
        }
      ]
    });
    
    console.log('✅ 가중치 분할 옵션 추가:', {
      leftCabinet: { width: leftCabinetWidth, centerX: leftCabinetCenterX },
      rightCabinet: { width: rightCabinetWidth, centerX: rightCabinetCenterX }
    });

    // 균등 분할
    if (Math.min(leftSpaceMm, rightSpaceMm) >= 200) { // 양쪽 모두 최소 200mm 이상일 때만
      const equalWidth = Math.min(leftSpaceMm, rightSpaceMm) - 10; // 10mm 마진
      
      options.push({
        type: 'split-equal',
        label: '균등 분할',
        description: `양쪽 ${equalWidth.toFixed(0)}mm씩 균등 배치`,
        cabinets: [
          {
            id: `equal-left-${Date.now()}`,
            width: equalWidth,
            depth: adjustedDepth,
            position: [leftCabinetCenterX, 0, 0],
            moduleId: moduleData.id.replace('dual-', 'single-left-')
          },
          {
            id: `equal-right-${Date.now()}`,
            width: equalWidth,
            depth: adjustedDepth,
            position: [rightCabinetCenterX, 0, 0],
            moduleId: moduleData.id.replace('dual-', 'single-right-')
          }
        ]
      });
      
      console.log('✅ 균등 분할 옵션 추가:', {
        equalWidth,
        leftPosition: leftCabinetCenterX,
        rightPosition: rightCabinetCenterX
      });
    }
  } else {
    console.log('❌ 분할 배치 불가:', {
      canSplitDirect,
      leftSpaceMm,
      rightSpaceMm,
      minRequired: 150
    });
  }

  // 기둥이 슬롯 중앙에 있고 분할 가능한 경우, 분할을 우선 추천
  if (canSplitDirect && options.length > 1) {
    // 가중치 분할을 첫 번째로 정렬 (기본 선택)
    const weightedSplitIndex = options.findIndex(opt => opt.type === 'split-weighted');
    if (weightedSplitIndex > 0) {
      const weightedSplit = options.splice(weightedSplitIndex, 1)[0];
      options.unshift(weightedSplit);
    }
  }

  console.log('🏗️ 캐비넷 배치 옵션 생성:', {
    slotIndex,
    columnDepth: column.depth,
    optionsCount: options.length,
    options: options.map(opt => ({
      type: opt.type,
      label: opt.label,
      cabinetCount: opt.cabinets.length
    }))
  });

  return options;
};

/**
 * 분할 배치를 위한 캐비넷 위치 계산 (가중치 기반)
 */
export const calculateSplitCabinetPositions = (
  slotInfo: ColumnSlotInfo,
  spaceInfo: SpaceInfo,
  slotIndex: number,
  splitType: 'weighted' | 'equal' = 'weighted'
): {
  leftCabinet: { width: number; position: [number, number, number] };
  rightCabinet: { width: number; position: [number, number, number] };
} | null => {
  if (!slotInfo.splitPlacement?.canSplit || !slotInfo.column) {
    return null;
  }

  const indexing = calculateSpaceIndexing(spaceInfo);
  const slotWidthMm = indexing.columnWidth;
  const slotCenterX = indexing.threeUnitPositions[slotIndex];
  const column = slotInfo.column;

  // 기둥 위치 기반 좌우 공간 계산
  const columnCenterX = column.position[0];
  const columnLeftX = columnCenterX - (column.width * 0.01) / 2;
  const columnRightX = columnCenterX + (column.width * 0.01) / 2;
  
  const slotLeftX = slotCenterX - (slotWidthMm * 0.01) / 2;
  const slotRightX = slotCenterX + (slotWidthMm * 0.01) / 2;

  let leftWidth: number, rightWidth: number;
  let leftCenterX: number, rightCenterX: number;

  if (splitType === 'weighted') {
    // 가중치 분할: 실제 공간 비율에 따라
    const leftSpace = Math.max(0, (columnLeftX - slotLeftX) * 100);
    const rightSpace = Math.max(0, (slotRightX - columnRightX) * 100);
    
    leftWidth = Math.max(150, leftSpace - 10); // 최소 150mm, 10mm 마진
    rightWidth = Math.max(150, rightSpace - 10);
    
    // 위치는 각 공간의 중앙
    leftCenterX = slotLeftX + (leftSpace * 0.01) / 2;
    rightCenterX = columnRightX + (rightSpace * 0.01) / 2;
  } else {
    // 균등 분할: 양쪽 동일한 크기
    const availableSpace = Math.min(slotInfo.splitPlacement.leftWidth, slotInfo.splitPlacement.rightWidth);
    leftWidth = rightWidth = Math.max(150, availableSpace - 10);
    
    // 기둥을 중심으로 대칭 배치
    const cabinetOffset = (leftWidth * 0.01) / 2 + 0.005; // 5mm 추가 간격
    leftCenterX = columnLeftX - cabinetOffset;
    rightCenterX = columnRightX + cabinetOffset;
  }

  console.log('📐 분할 캐비넷 위치 계산:', {
    splitType,
    slotIndex,
    columnPosition: columnCenterX.toFixed(3),
    leftCabinet: {
      width: leftWidth,
      centerX: leftCenterX.toFixed(3)
    },
    rightCabinet: {
      width: rightWidth,
      centerX: rightCenterX.toFixed(3)
    }
  });

  return {
    leftCabinet: {
      width: leftWidth,
      position: [leftCenterX, 0, 0]
    },
    rightCabinet: {
      width: rightWidth,
      position: [rightCenterX, 0, 0]
    }
  };
};

/**
 * 기둥이 있는 슬롯에서 사용 가능한 공간들을 찾는 함수
 * Column C의 경우 좌우 분할 배치를 지원
 */
export const findAvailableSpacesInColumnSlot = (
  slotInfo: ColumnSlotInfo,
  slotIndex: number,
  spaceInfo: SpaceInfo,
  placedModules: any[],
  originalDepth: number = 600
): Array<{
  type: 'full' | 'left' | 'right' | 'front';
  center: number;
  maxWidth: number;
  isOccupied: boolean;
  position: { x: number; y: number; z: number };
  customDepth?: number;
}> => {
  const spaces: Array<{
    type: 'full' | 'left' | 'right' | 'front';
    center: number;
    maxWidth: number;
    isOccupied: boolean;
    position: { x: number; y: number; z: number };
    customDepth?: number;
  }> = [];
  
  if (!slotInfo.hasColumn) {
    // 기둥이 없는 경우 전체 슬롯 사용 가능
    const indexing = calculateSpaceIndexing(spaceInfo);
    spaces.push({
      type: 'full',
      center: indexing.threeUnitPositions[slotIndex],
      maxWidth: indexing.columnWidth,
      isOccupied: false,
      position: { x: indexing.threeUnitPositions[slotIndex], y: 0, z: 0 }
    });
    return spaces;
  }
  
  // Column C (300mm) 특별 처리 - 깊이 기반 분할 배치
  if (slotInfo.columnType === 'medium' && slotInfo.allowMultipleFurniture && slotInfo.column) {
    // 이미 배치된 가구 확인
    const furnitureInSlot = placedModules.filter(m => m.slotIndex === slotIndex);
    
    console.log('🔍 Column C 기존 가구 상세 분석:', {
      slotIndex,
      전체가구수: placedModules.length,
      해당슬롯가구수: furnitureInSlot.length,
      가구상세: furnitureInSlot.map(m => ({
        id: m.id,
        slotIndex: m.slotIndex,
        position: {
          x: m.position.x.toFixed(3),
          y: m.position.y.toFixed(3),
          z: m.position.z.toFixed(3)
        },
        moduleId: m.moduleId
      }))
    });
    
    console.log('🔵 Column C 공간 분석:', {
      slotIndex,
      기존가구수: furnitureInSlot.length,
      기존가구위치: furnitureInSlot.map(m => ({
        id: m.id,
        x: m.position.x.toFixed(3)
      })),
      subSlots: {
        left: {
          center: slotInfo.subSlots.left.center.toFixed(3),
          width: slotInfo.subSlots.left.availableWidth
        },
        right: {
          center: slotInfo.subSlots.right.center.toFixed(3),
          width: slotInfo.subSlots.right.availableWidth
        }
      }
    });
    
    const indexing = calculateSpaceIndexing(spaceInfo);
    const column = slotInfo.column;
    const columnCenterX = column.position[0];
    const columnDepth = column.depth * 0.01; // mm to meters
    
    // 기둥 침범 방향 확인
    const slotCenterX = indexing.threeUnitPositions[slotIndex];
    const slotWidthM = indexing.columnWidth * 0.01;
    const slotLeftX = slotCenterX - slotWidthM / 2;
    const slotRightX = slotCenterX + slotWidthM / 2;
    
    const columnLeftX = columnCenterX - (column.width * 0.01) / 2;
    const columnRightX = columnCenterX + (column.width * 0.01) / 2;
    
    // 기둥이 어느 쪽에서 침범하는지 확인
    const leftGap = (columnLeftX - slotLeftX) * 100; // mm
    const rightGap = (slotRightX - columnRightX) * 100; // mm
    const isLeftIntrusion = leftGap < rightGap; // 왼쪽 공간이 더 작으면 왼쪽에서 침범
    
    console.log('🔵 Column C 깊이 기반 분할 분석:', {
      slotIndex,
      기둥침범방향: isLeftIntrusion ? '왼쪽' : '오른쪽',
      leftGap: leftGap.toFixed(1) + 'mm',
      rightGap: rightGap.toFixed(1) + 'mm',
      기둥깊이: column.depth + 'mm'
    });
    
    // 첫 번째 가구: 기둥이 침범하지 않은 쪽 (정상 깊이)
    const firstFurnitureOccupied = furnitureInSlot.some(m => {
      // 첫 번째 가구는 정상 깊이로 배치되므로 Z값이 0
      return Math.abs(m.position.z) < 0.01;
    });
    
    if (!firstFurnitureOccupied) {
      // 첫 번째 가구 배치 공간 (기둥 반대편, 정상 깊이)
      // 가구의 폭을 고려하여 중심 위치 계산
      const furnitureWidth = isLeftIntrusion ? rightGap : leftGap; // mm
      const furnitureWidthM = furnitureWidth * 0.001; // Three.js 단위로 변환
      
      // 첫 번째 가구는 기둥 반대편에 배치
      const firstFurnitureX = isLeftIntrusion ? 
        slotCenterX + (slotWidthM / 2) - (furnitureWidthM / 2) : // 오른쪽 끝에 배치
        slotCenterX - (slotWidthM / 2) + (furnitureWidthM / 2);  // 왼쪽 끝에 배치
      
      console.log('🟢 첫 번째 가구 위치 계산:', {
        slotCenterX,
        slotWidthM,
        furnitureWidth: furnitureWidth + 'mm',
        isLeftIntrusion,
        firstFurnitureX,
        배치위치: isLeftIntrusion ? '오른쪽 끝' : '왼쪽 끝'
      });
      
      spaces.push({
        type: 'full',
        center: firstFurnitureX,
        maxWidth: furnitureWidth,
        isOccupied: false,
        position: { x: firstFurnitureX, y: 0, z: 0 },
        customDepth: originalDepth // 첫 번째 가구는 원래 깊이 유지
      });
    }
    
    // 두 번째 가구들: 기둥 앞에 배치 (깊이 조정)
    // 첫 번째 가구가 배치된 후에만 기둥 앞 공간 제공
    if (firstFurnitureOccupied) {
      // 기둥 앞에 배치된 가구들 확인
      const frontFurniture = furnitureInSlot.filter(m => Math.abs(m.position.z) > 0.01);
      const frontFurnitureCount = frontFurniture.length;
      
      // 기둥 너비를 여러 가구로 분할 가능
      const maxFrontFurniture = 2; // 최대 2개까지 기둥 앞에 배치 가능
      
      if (frontFurnitureCount < maxFrontFurniture) {
        // Z축 뒤로 장애물 확인 (벽까지의 거리)
        const wallDistance = spaceInfo.depth / 2; // 벽까지의 거리 (mm -> Three.js units)
        const columnBackZ = column.position[2] - (column.depth * 0.01) / 2; // 기둥 뒷면 Z 위치
        const spaceToWall = (wallDistance * 0.001 - columnBackZ) * 1000; // 기둥 뒤 공간 (mm)
        
        // 깊이 결정: Z축 뒤에 충분한 공간이 있으면 원래 깊이 유지
        const minSpaceRequired = 50; // 최소 여유 공간
        const hasSpaceBehind = spaceToWall >= originalDepth + minSpaceRequired;
        
        let finalDepth: number;
        let secondFurnitureZ: number;
        
        if (hasSpaceBehind) {
          // 뒤에 공간이 있으면 원래 깊이 유지
          finalDepth = originalDepth;
          secondFurnitureZ = 0; // 기존 위치와 동일하게 배치
        } else {
          // 뒤에 공간이 없으면 깊이 조정
          finalDepth = originalDepth - column.depth;
          secondFurnitureZ = columnDepth / 2 + (finalDepth * 0.001) / 2; // 기둥 앞면에 맞닿게
        }
        
        // 기둥이 X축으로 침범한 크기 계산
        const intrusionWidth = column.width; // 기둥의 너비 = 침범한 크기
        
        // 기둥 앞 공간을 여러 가구로 분할
        const availableSlots = maxFrontFurniture - frontFurnitureCount;
        const slotWidth = intrusionWidth / maxFrontFurniture; // 각 가구의 폭
        
        // 사용 가능한 슬롯 추가
        for (let i = 0; i < availableSlots; i++) {
          const slotIndex = frontFurnitureCount + i;
          const slotCenterX = columnCenterX - (intrusionWidth * 0.001) / 2 + (slotWidth * 0.001) * (slotIndex + 0.5);
          
          // 이미 배치된 가구와 겹치는지 확인
          const isOccupied = frontFurniture.some(f => 
            Math.abs(f.position.x - slotCenterX) < (slotWidth * 0.001) / 2
          );
          
          if (!isOccupied) {
            console.log('🟢 기둥 앞 배치 슬롯:', {
              슬롯번호: slotIndex,
              슬롯폭: slotWidth + 'mm',
              X위치: slotCenterX.toFixed(3),
              Z위치: secondFurnitureZ.toFixed(3),
              깊이: finalDepth + 'mm'
            });
            
            spaces.push({
              type: 'front', // 기둥 앞 배치
              center: slotCenterX,
              maxWidth: slotWidth,
              isOccupied: false,
              position: { x: slotCenterX, y: 0, z: secondFurnitureZ },
              customDepth: finalDepth // 최종 깊이 정보
            });
          }
        }
      }
    }
    
    console.log('🔵 Column C 깊이 기반 분할 공간 최종:', {
      slotIndex,
      첫번째가구배치됨: firstFurnitureOccupied,
      기둥앞가구수: frontFurniture.length,
      두번째가구배치됨: secondFurnitureOccupied,
      사용가능한공간: spaces.length,
      공간상세: spaces.map(s => ({
        type: s.type,
        position: {
          x: s.position.x.toFixed(3),
          z: s.position.z.toFixed(3)
        },
        maxWidth: s.maxWidth,
        customDepth: s.customDepth
      }))
    });
    
  } else {
    // 일반 기둥 - 전체 슬롯의 남은 공간만 사용
    const indexing = calculateSpaceIndexing(spaceInfo);
    const adjustedWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
    
    // 이미 가구가 있는지 확인
    const isOccupied = placedModules.some(m => m.slotIndex === slotIndex);
    
    if (!isOccupied && adjustedWidth >= 150) {
      // 침범 방향에 따른 위치 계산
      const slotCenterX = indexing.threeUnitPositions[slotIndex];
      const slotWidthM = indexing.columnWidth * 0.01;
      const originalBounds = {
        left: slotCenterX - slotWidthM / 2,
        right: slotCenterX + slotWidthM / 2,
        center: slotCenterX
      };
      
      const furnitureBounds = calculateFurnitureBounds(slotInfo, originalBounds, spaceInfo);
      
      spaces.push({
        type: 'full',
        center: furnitureBounds.center,
        maxWidth: furnitureBounds.renderWidth,
        isOccupied: false,
        position: { x: furnitureBounds.center, y: 0, z: 0 }
      });
    }
  }
  
  return spaces;
}; 