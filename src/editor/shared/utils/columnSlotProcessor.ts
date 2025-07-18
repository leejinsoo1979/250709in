import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { Column } from '@/types/space';
import { calculateSpaceIndexing } from './indexing';
import { getModuleById } from '@/data/modules';

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
}

// 기둥 커버 도어 타입
export interface PillarCoverDoor {
  type: 'pillarCover';
  isStorage: false;
  linkedTo: string; // 연결된 기둥 ID
  width: number;
  height: number;
}

/**
 * 기둥이 포함된 슬롯들을 분석하여 가구 배치 정보를 생성
 */
export const analyzeColumnSlots = (spaceInfo: SpaceInfo): ColumnSlotInfo[] => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const columns = spaceInfo.columns || [];
  const slotInfos: ColumnSlotInfo[] = [];
  
  // 각 슬롯에 대해 기둥 포함 여부 확인
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
      const margin = 2; // 최소 이격거리 2mm
      
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
        const rightSpace = Math.max(0, rightGap - margin);
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
        const leftSpace = Math.max(0, leftGap - margin);
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
        adjustedWidth: intrusionAnalysis.adjustedWidth
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
    
    console.log('🏛️ 슬롯 분석 완료:', {
      slotIndex,
      hasColumn: true,
      columnPosition,
      availableWidth: intrusionAnalysis.availableWidth,
      actualRenderWidth,
      배치가능여부: actualRenderWidth >= 150 ? '✅ 배치 가능' : '❌ 배치 불가',
      intrusionDirection: intrusionAnalysis.intrusionDirection,
      furniturePosition: intrusionAnalysis.furniturePosition,
      adjustedWidth: intrusionAnalysis.adjustedWidth,
      doorWidth: indexing.columnWidth - 3
    });
    
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
      adjustedWidth: actualRenderWidth // 실제 렌더링 가능한 크기로 업데이트
    });
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
  const margin = 0.002; // 2mm 이격거리
  
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
} => {
  if (!slotInfo.hasColumn || !slotInfo.column) {
    // 기둥이 없으면 원래 슬롯 경계 그대로
    const width = originalSlotBounds.right - originalSlotBounds.left;
    return {
      left: originalSlotBounds.left,
      right: originalSlotBounds.right,
      center: originalSlotBounds.center,
      width: width * 100, // mm 단위
      renderWidth: width * 100
    };
  }
  
  const column = slotInfo.column;
  const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
  const columnRightX = column.position[0] + (column.width * 0.01) / 2;
  const margin = 0.002; // 2mm 이격거리
  
  let furnitureLeft = originalSlotBounds.left;
  let furnitureRight = originalSlotBounds.right;
  let renderWidth: number;
  
  // 최소 가구 크기 (150mm)
  const minFurnitureWidth = 0.15; // Three.js 단위 (150mm)
  
  // 기둥 충돌 방지를 위한 안전 마진 (5mm)
  const safetyMargin = 0.005;
  
  switch (slotInfo.intrusionDirection) {
    case 'from-left':
      // 기둥이 왼쪽에서 침범: 가구의 왼쪽 경계가 기둥에 의해 밀려남
      furnitureLeft = Math.max(columnRightX + margin, originalSlotBounds.left);
      furnitureRight = originalSlotBounds.right; // 오른쪽 경계는 슬롯 경계 그대로
      
      // 기둥과 절대 겹치지 않도록 추가 안전 마진
      if (furnitureLeft <= columnRightX + safetyMargin) {
        furnitureLeft = columnRightX + safetyMargin;
        console.log('⚠️ 기둥 침범 방지를 위한 추가 마진 적용:', {
          columnRightX: columnRightX.toFixed(3),
          safetyMargin: safetyMargin.toFixed(3),
          adjustedLeft: furnitureLeft.toFixed(3)
        });
      }
      
      // 슬롯 경계 내에서 최소 크기 보장 체크
      if (furnitureRight - furnitureLeft < minFurnitureWidth) {
        console.log('⚠️ 최소 크기 미달, 가구 크기 조정:', {
          currentWidth: ((furnitureRight - furnitureLeft) * 100).toFixed(1) + 'mm',
          minRequired: (minFurnitureWidth * 100).toFixed(1) + 'mm'
        });
        
        // 최소 크기를 만족할 수 없으면 슬롯 경계에 맞춰 조정
        furnitureLeft = furnitureRight - minFurnitureWidth;
        if (furnitureLeft < originalSlotBounds.left) {
          // 그래도 슬롯을 벗어나면 배치 불가 -> 최소 크기로 고정
          furnitureLeft = originalSlotBounds.left;
          furnitureRight = originalSlotBounds.left + minFurnitureWidth;
          console.log('🚨 슬롯 경계 초과로 최소 크기 강제 적용');
        }
      }
      
      // 최종 기둥 충돌 재검사
      if (furnitureLeft < columnRightX + margin) {
        console.log('🚨 최종 기둥 충돌 감지! 강제 조정');
        furnitureLeft = columnRightX + margin;
        // 가구가 너무 작아지면 배치 불가능으로 처리
        if (furnitureRight - furnitureLeft < 0.05) { // 50mm 미만
          console.log('🚨 가구 크기가 너무 작아 배치 불가능');
          furnitureLeft = originalSlotBounds.left;
          furnitureRight = originalSlotBounds.left + 0.05; // 50mm 강제 설정
        }
      }
      
      renderWidth = (furnitureRight - furnitureLeft) * 100;
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
      // 기둥이 오른쪽에서 침범: 가구의 오른쪽 경계가 기둥에 의해 밀려남
      furnitureLeft = originalSlotBounds.left; // 왼쪽 경계는 슬롯 경계 그대로
      furnitureRight = Math.min(columnLeftX - margin, originalSlotBounds.right);
      
      // 기둥과 절대 겹치지 않도록 추가 안전 마진
      if (furnitureRight >= columnLeftX - safetyMargin) {
        furnitureRight = columnLeftX - safetyMargin;
        console.log('⚠️ 기둥 침범 방지를 위한 추가 마진 적용:', {
          columnLeftX: columnLeftX.toFixed(3),
          safetyMargin: safetyMargin.toFixed(3),
          adjustedRight: furnitureRight.toFixed(3)
        });
      }
      
      // 슬롯 경계 내에서 최소 크기 보장 체크
      if (furnitureRight - furnitureLeft < minFurnitureWidth) {
        console.log('⚠️ 최소 크기 미달, 가구 크기 조정:', {
          currentWidth: ((furnitureRight - furnitureLeft) * 100).toFixed(1) + 'mm',
          minRequired: (minFurnitureWidth * 100).toFixed(1) + 'mm'
        });
        
        // 최소 크기를 만족할 수 없으면 슬롯 경계에 맞춰 조정
        furnitureRight = furnitureLeft + minFurnitureWidth;
        if (furnitureRight > originalSlotBounds.right) {
          // 그래도 슬롯을 벗어나면 배치 불가 -> 최소 크기로 고정
          furnitureRight = originalSlotBounds.right;
          furnitureLeft = originalSlotBounds.right - minFurnitureWidth;
          console.log('🚨 슬롯 경계 초과로 최소 크기 강제 적용');
        }
      }
      
      // 최종 기둥 충돌 재검사
      if (furnitureRight > columnLeftX - margin) {
        console.log('🚨 최종 기둥 충돌 감지! 강제 조정');
        furnitureRight = columnLeftX - margin;
        // 가구가 너무 작아지면 배치 불가능으로 처리
        if (furnitureRight - furnitureLeft < 0.05) { // 50mm 미만
          console.log('🚨 가구 크기가 너무 작아 배치 불가능');
          furnitureRight = originalSlotBounds.right;
          furnitureLeft = originalSlotBounds.right - 0.05; // 50mm 강제 설정
        }
      }
      
      renderWidth = (furnitureRight - furnitureLeft) * 100;
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
        
        // 최소 크기 보장
        if (furnitureRight - furnitureLeft < minFurnitureWidth) {
          furnitureRight = Math.min(furnitureLeft + minFurnitureWidth, originalSlotBounds.right);
        }
      } else if (slotInfo.furniturePosition === 'right-aligned') {
        furnitureLeft = Math.max(columnRightX + margin, originalSlotBounds.left);
        furnitureRight = originalSlotBounds.right;
        
        // 최소 크기 보장
        if (furnitureRight - furnitureLeft < minFurnitureWidth) {
          furnitureLeft = Math.max(furnitureRight - minFurnitureWidth, originalSlotBounds.left);
        }
      } else {
        // 기본값: 원래 슬롯 사용
        furnitureLeft = originalSlotBounds.left;
        furnitureRight = originalSlotBounds.right;
      }
      
      renderWidth = (furnitureRight - furnitureLeft) * 100;
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
      renderWidth = (originalSlotBounds.right - originalSlotBounds.left) * 100;
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
  
  // 가구 중심 계산 (침범 방향에 따라 자연스럽게 한쪽으로 치우쳐짐)
  const newCenter = (furnitureLeft + furnitureRight) / 2;
  
  const totalWidth = (furnitureRight - furnitureLeft) * 100; // mm 단위
  const finalRenderWidth = Math.max(totalWidth, 150); // 최소 150mm 보장
  
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
    logic: slotInfo.intrusionDirection === 'from-left' ? '왼쪽 침범 → 오른쪽 경계 고정, 왼쪽만 조정' :
           slotInfo.intrusionDirection === 'from-right' ? '오른쪽 침범 → 왼쪽 경계 고정, 오른쪽만 조정' :
           '일반 케이스 → 양쪽 조정'
  });
  
  return {
    left: furnitureLeft,
    right: furnitureRight,
    center: newCenter,
    width: totalWidth,
    renderWidth: finalRenderWidth
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
    // 모듈 데이터 가져오기
    const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
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
        adjustedWidth: leftFurnitureWidth,
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
        adjustedWidth: rightFurnitureWidth,
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