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
  intrusionDirection?: 'from-left' | 'from-right' | 'center' | 'none'; // 기둥이 어느 방향에서 침범하는지
  furniturePosition?: 'left-aligned' | 'right-aligned' | 'center'; // 가구가 배치될 위치
  adjustedWidth?: number; // 침범 후 조정된 가구 너비
  // 기둥 깊이 기반 처리 정보 추가
  columnType?: 'deep' | 'shallow' | 'medium'; // 깊은 기둥(>=500mm) vs 얕은 기둥(<500mm) vs 중간 기둥(300mm)
  columnProcessingMethod?: 'width-adjustment' | 'depth-adjustment'; // 기둥 처리 방식
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
  // 기둥 타입별 임계값
  const SHALLOW_THRESHOLD = 200; // 200mm 이하는 기둥A (얕은 기둥)
  const MEDIUM_THRESHOLD = 400; // 400mm 이하는 기둥C (중간 기둥)
  const STANDARD_CABINET_DEPTH = 730; // 표준 캐비넷 깊이
  const MIN_SINGLE_DEPTH = 200; // 싱글캐비넷 최소 깊이
  const MIN_DUAL_DEPTH = 580; // 듀얼캐비넷 최소 깊이
  const MIN_DUAL_COLUMN_DEPTH = 150; // 듀얼 배치 가능한 최대 기둥 깊이
  const MIN_SLOT_WIDTH = 150; // 캐비넷 배치 최소 폭
  
  const columnDepth = column.depth;
  // 기둥 타입 분류
  let columnType: 'deep' | 'shallow';
  if (columnDepth <= SHALLOW_THRESHOLD) {
    columnType = 'shallow'; // 기둥A (150mm)
  } else if (columnDepth <= MEDIUM_THRESHOLD) {
    columnType = 'shallow'; // 기둥C (300mm) - 여전히 얕은 기둥으로 분류하지만 처리 방식은 다름
  } else {
    columnType = 'deep'; // 기둥B (730mm) 등
  }
  
  console.log('🔍 analyzeColumnDepthPlacement 상세:', {
    columnId: column.id,
    columnDepth,
    columnType,
    isColumnA: columnDepth <= SHALLOW_THRESHOLD,
    isColumnC: columnDepth > SHALLOW_THRESHOLD && columnDepth <= MEDIUM_THRESHOLD,
    isDeepColumn: columnDepth > MEDIUM_THRESHOLD
  });
  
  // 기둥 위치 계산
  const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
  const columnRightX = column.position[0] + (column.width * 0.01) / 2;
  const leftWidth = Math.max(0, (columnLeftX - slotStartX) * 100); // mm
  const rightWidth = Math.max(0, (slotEndX - columnRightX) * 100); // mm
  
  // 깊이 조정 분석 - 깊은 기둥은 깊이 조정하지 않음
  let adjustedDepth: number;
  let canPlaceSingle: boolean;
  let canPlaceDual: boolean;
  
  if (columnType === 'deep') {
    // 깊은 기둥(기둥B 등): 깊이 조정 안함, 폭만 조정
    adjustedDepth = STANDARD_CABINET_DEPTH; // 원래 깊이 유지
    canPlaceSingle = (leftWidth >= MIN_SLOT_WIDTH || rightWidth >= MIN_SLOT_WIDTH);
    canPlaceDual = false; // 깊은 기둥에서는 듀얼 배치 불가
    console.log('🏛️ 깊은 기둥 처리 (B타입):', { columnDepth, adjustedDepth: '변경없음', canPlaceSingle });
  } else {
    // 얕은 기둥 처리
    if (columnDepth <= SHALLOW_THRESHOLD) {
      // 기둥A (150mm): 폭만 조정 (깊이는 그대로)
      adjustedDepth = STANDARD_CABINET_DEPTH; // 원래 깊이 유지
      canPlaceSingle = (leftWidth >= MIN_SLOT_WIDTH || rightWidth >= MIN_SLOT_WIDTH);
      canPlaceDual = false; // 기둥A에서는 듀얼 배치 불가
      console.log('🏛️ 기둥A 처리 (150mm):', { columnDepth, adjustedDepth: '변경없음', canPlaceSingle });
    } else {
      // 기둥C (300mm): 깊이 조정 (침범량 150mm 이상일 때)
      adjustedDepth = STANDARD_CABINET_DEPTH - columnDepth; // 730 - 300 = 430mm
      canPlaceSingle = adjustedDepth >= MIN_SINGLE_DEPTH && (leftWidth >= MIN_SLOT_WIDTH || rightWidth >= MIN_SLOT_WIDTH);
      canPlaceDual = false; // 중간 깊이 기둥에서는 듀얼 배치 불가
      console.log('🏛️ 기둥C 처리 (300mm):', { columnDepth, adjustedDepth, canPlaceSingle });
    }
  }
  
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
        adjustedWidth: indexing.columnWidth, // 기둥이 없으면 조정 없음
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
      const columnCenterX = columnInSlot.position[0];
      const slotCenterX = indexing.threeUnitPositions[slotIndex];
      
      console.log('🔍 침범 방향 분석 시작:', {
        slotIndex,
        columnId: columnInSlot.id,
        columnDepth: columnInSlot.depth,
        columnWidthMm,
        slotWidthMm,
        columnCenterX: columnCenterX.toFixed(3),
        slotCenterX: slotCenterX.toFixed(3),
        centerDistance: Math.abs(columnCenterX - slotCenterX).toFixed(3),
        leftGap: leftGap.toFixed(1) + 'mm',
        rightGap: rightGap.toFixed(1) + 'mm'
      });
      
      // 중심 침범(3mm 이내) 우선 분기
      if (Math.abs(columnCenterX - slotCenterX) < 0.003) {
        // 중심 침범
        return {
          availableWidth: slotWidthMm,
          intrusionDirection: 'center' as const,
          furniturePosition: 'center' as const,
          adjustedWidth: slotWidthMm
        };
      }
      
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
      
      // 기둥이 슬롯과 겹치는지 확인
      const isColumnOverlapping = (columnLeftX < slotEndX && columnRightX > slotStartX);
      
      if (!isColumnOverlapping) {
        // 기둥이 슬롯과 겹치지 않음
        console.log('🏛️ 기둥이 슬롯과 겹치지 않음');
        return {
          availableWidth: slotWidthMm,
          intrusionDirection: 'none' as const,
          furniturePosition: 'center' as const,
          adjustedWidth: slotWidthMm
        };
      }
      
      // 기둥이 왼쪽에서 침범하는 경우 (기둥이 슬롯 왼쪽 경계를 넘음)
      if (columnRightX > slotStartX && columnLeftX < slotStartX) {
        const rightSpace = Math.max(0, (slotEndX - columnRightX) * 100 - margin);
        console.log('🏛️ 기둥이 왼쪽에서 침범 → 오른쪽 공간 사용:', {
          columnRight: (columnRightX * 100).toFixed(1) + 'mm',
          slotEnd: (slotEndX * 100).toFixed(1) + 'mm',
          rightSpace: rightSpace.toFixed(1) + 'mm'
        });
        return {
          availableWidth: rightSpace,
          intrusionDirection: 'from-left' as const,
          furniturePosition: 'right-aligned' as const,
          adjustedWidth: rightSpace
        };
      }
      // 기둥이 오른쪽에서 침범하는 경우 (기둥이 슬롯 오른쪽 경계를 넘음)
      else if (columnLeftX < slotEndX && columnRightX > slotEndX) {
        const leftSpace = Math.max(0, (columnLeftX - slotStartX) * 100 - margin);
        console.log('🏛️ 기둥이 오른쪽에서 침범 → 왼쪽 공간 사용:', {
          slotStart: (slotStartX * 100).toFixed(1) + 'mm',
          columnLeft: (columnLeftX * 100).toFixed(1) + 'mm',
          leftSpace: leftSpace.toFixed(1) + 'mm'
        });
        return {
          availableWidth: leftSpace,
          intrusionDirection: 'from-right' as const,
          furniturePosition: 'left-aligned' as const,
          adjustedWidth: leftSpace
        };
      }
      // 기둥이 슬롯 안에 완전히 들어있는 경우
      else if (columnLeftX >= slotStartX && columnRightX <= slotEndX) {
        const leftSpace = Math.max(0, (columnLeftX - slotStartX) * 100 - margin);
        const rightSpace = Math.max(0, (slotEndX - columnRightX) * 100 - margin);
        
        // 더 큰 공간을 선택
        if (leftSpace >= rightSpace) {
          console.log('🏛️ 기둥이 슬롯 내부 → 왼쪽 공간이 더 큼:', {
            leftSpace: leftSpace.toFixed(1) + 'mm',
            rightSpace: rightSpace.toFixed(1) + 'mm'
          });
          return {
            availableWidth: leftSpace,
            intrusionDirection: 'from-right' as const,
            furniturePosition: 'left-aligned' as const,
            adjustedWidth: leftSpace
          };
        } else {
          console.log('🏛️ 기둥이 슬롯 내부 → 오른쪽 공간이 더 큼:', {
            leftSpace: leftSpace.toFixed(1) + 'mm',
            rightSpace: rightSpace.toFixed(1) + 'mm'
          });
          return {
            availableWidth: rightSpace,
            intrusionDirection: 'from-left' as const,
            furniturePosition: 'right-aligned' as const,
            adjustedWidth: rightSpace
          };
        }
      }
      // 기타 경우 (안전장치)
      else {
        console.log('🏛️ 예외 상황 - 기본값 반환');
        return {
          availableWidth: 0,
          intrusionDirection: 'center' as const,
          furniturePosition: 'center' as const,
          adjustedWidth: 0
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
    
    // 얕은 기둥인 경우 깊이 기반 배치 분석 추가
    let columnType: 'deep' | 'shallow' | 'medium' | undefined;
    let depthAdjustment: ColumnSlotInfo['depthAdjustment'];
    let splitPlacement: ColumnSlotInfo['splitPlacement'];
    let columnProcessingMethod: 'width-adjustment' | 'depth-adjustment' | undefined;
    
    // 기둥 타입별 처리
    const SHALLOW_THRESHOLD = 200; // Column A (150mm) 기준
    const MEDIUM_THRESHOLD = 400; // Column C (300mm) 기준
    
    if (columnInSlot.depth <= SHALLOW_THRESHOLD) {
      // Column A (150mm) - 폭 조정 방식
      const depthAnalysis = analyzeColumnDepthPlacement(columnInSlot, indexing.columnWidth, slotStartX, slotEndX);
      columnType = depthAnalysis.columnType;
      depthAdjustment = depthAnalysis.depthAdjustment;
      splitPlacement = depthAnalysis.splitPlacement;
      columnProcessingMethod = 'width-adjustment';
      
      console.log('🔍 Column A(150mm) 깊이 분석 결과:', {
        slotIndex,
        columnDepth: columnInSlot.depth,
        columnType,
        depthAdjustment,
        splitPlacement,
        processingMethod: columnProcessingMethod
      });
    } else if (columnInSlot.depth <= MEDIUM_THRESHOLD) {
      // Column C (300mm) - 깊이 조정 방식
      columnType = 'medium';
      columnProcessingMethod = 'depth-adjustment';
      
      console.log('🔍 Column C(300mm) 분석 결과:', {
        slotIndex,
        columnDepth: columnInSlot.depth,
        columnType,
        processingMethod: columnProcessingMethod
      });
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
      doorWidth: indexing.columnWidth - 3,
      columnType,
      hasDepthAnalysis: columnType !== undefined
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
      adjustedWidth: actualRenderWidth, // 실제 렌더링 가능한 크기로 업데이트
      columnType,
      columnProcessingMethod,
      depthAdjustment,
      splitPlacement
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
  
  // 최소 필요 너비 확인 (150mm로 완화)
  const minRequiredWidth = 150;
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
  depthAdjustmentNeeded?: boolean; // Column C 깊이 조정 필요 여부
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
  
  // FurnitureItem.tsx와 동일한 침범량 계산 방식 사용
  const slotCenterX = originalSlotBounds.center;
  const columnCenterX = column.position[0];
  
  // X축 침범량 계산 - 기둥과 슬롯의 실제 겹침 계산
  const columnLeftMm = columnCenterX * 1000 - (column.width / 2);
  const columnRightMm = columnCenterX * 1000 + (column.width / 2);
  const slotLeftMm = slotCenterX * 1000 - ((originalSlotBounds.right - originalSlotBounds.left) * 1000 / 2);
  const slotRightMm = slotCenterX * 1000 + ((originalSlotBounds.right - originalSlotBounds.left) * 1000 / 2);
  
  // 겹치는 영역 계산
  let xAxisIntrusion = 0;
  if (columnLeftMm < slotRightMm && columnRightMm > slotLeftMm) {
    const overlapStart = Math.max(columnLeftMm, slotLeftMm);
    const overlapEnd = Math.min(columnRightMm, slotRightMm);
    xAxisIntrusion = overlapEnd - overlapStart;
  }
  
  // Z축 침범량 계산 (FurnitureItem.tsx와 동일)
  const columnCenterZ = column.position[2] || 0;
  const columnDepth = column.depth || 0;
  const slotBackWallZ = -(730 * 0.001 / 2); // 슬롯 뒷벽 위치 (Three.js 좌표)
  const columnFrontZ = columnCenterZ + (columnDepth * 0.001 / 2); // 기둥 앞면
  const zAxisIntrusion = Math.max(0, (slotBackWallZ - columnFrontZ) * -1000); // Z축 침범량 (mm)

  console.log('🔍 columnSlotProcessor 침범 계산:', {
    columnType: slotInfo.columnType,
    columnProcessingMethod: slotInfo.columnProcessingMethod,
    columnDepth: column.depth,
    columnBounds: { left: columnLeftMm.toFixed(1), right: columnRightMm.toFixed(1) },
    slotBounds: { left: slotLeftMm.toFixed(1), right: slotRightMm.toFixed(1) },
    xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
    zAxisIntrusion: zAxisIntrusion.toFixed(1) + 'mm',
    isOver150mm: xAxisIntrusion > 150,
    isColumnC: slotInfo.columnType === 'medium'
  });

  // 개선된 침범 방향에 따른 처리 - X축과 Z축 동시 침범 고려
  // Column C (300mm) 특별 처리
  const isColumnC = slotInfo.columnProcessingMethod === 'depth-adjustment' && slotInfo.columnType === 'medium';
  
  if (xAxisIntrusion > 0) {
    // Column C의 경우 150mm 이상 침범 시 특별 처리
    if (isColumnC && xAxisIntrusion > 150) {
      // Column C가 150mm 이상 침범: 폭은 원래대로, 깊이만 조정
      furnitureLeft = originalSlotBounds.left;
      furnitureRight = originalSlotBounds.right;
      renderWidth = (furnitureRight - furnitureLeft) * 100;
      const newCenter = (furnitureLeft + furnitureRight) / 2;
      
      console.log('🟣 Column C 150mm 이상 침범: 폭 원래대로, 깊이 조정 모드', {
        xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
        originalWidth: ((originalSlotBounds.right - originalSlotBounds.left) * 100).toFixed(1) + 'mm',
        renderWidth: renderWidth.toFixed(1) + 'mm',
        logic: 'Column C 150mm 이상 침범 -> 폭 원래대로, 깊이 조정 필요'
      });
      
      return {
        left: originalSlotBounds.left,
        right: originalSlotBounds.right,
        center: originalSlotBounds.center,
        width: (originalSlotBounds.right - originalSlotBounds.left) * 100,
        renderWidth: (originalSlotBounds.right - originalSlotBounds.left) * 100,
        depthAdjustmentNeeded: true // 깊이 조정 필요 플래그
      };
    }
    
    // Column A 또는 Column C의 150mm 미만 침범: 폭 조정
      if (slotInfo.intrusionDirection === 'from-left') {
        // 기둥이 왼쪽에서 침범: 가구는 오른쪽으로 밀림, 왼쪽 경계가 기둥 오른쪽으로 이동
        const columnRightEdge = columnRightX + margin;
        furnitureLeft = Math.max(columnRightEdge, originalSlotBounds.left);
        furnitureRight = originalSlotBounds.right;
        renderWidth = (furnitureRight - furnitureLeft) * 100;
        // 가구 폭이 150mm 미만이면 0으로 설정 (가구를 숨김)
        if (renderWidth < minFurnitureWidth * 100) {
          renderWidth = 0;
        }
        const newCenter = (furnitureLeft + furnitureRight) / 2;
        console.log('🟢 왼쪽 X축 침범: 가구를 오른쪽으로 밀고 폭 조정', {
          xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
          zAxisIntrusion: zAxisIntrusion.toFixed(1) + 'mm',
          columnRightX: columnRightX.toFixed(3),
          newFurnitureLeft: furnitureLeft.toFixed(3),
          originalFurnitureLeft: originalSlotBounds.left.toFixed(3),
          renderWidth,
          logic: '기둥이 왼쪽에서 침범 -> 가구 왼쪽 경계를 기둥 오른쪽으로'
        });
        return {
          left: furnitureLeft,
          right: furnitureRight,
          center: newCenter,
          width: renderWidth,
          renderWidth: renderWidth
        };
      } else if (slotInfo.intrusionDirection === 'from-right') {
        // 기둥이 오른쪽에서 침범: 가구는 왼쪽으로 밀림, 오른쪽 경계가 기둥 왼쪽으로 이동
        const columnLeftEdge = columnLeftX - margin;
        furnitureLeft = originalSlotBounds.left;
        furnitureRight = Math.min(columnLeftEdge, originalSlotBounds.right);
        renderWidth = (furnitureRight - furnitureLeft) * 100;
        // 가구 폭이 150mm 미만이면 0으로 설정 (가구를 숨김)
        if (renderWidth < minFurnitureWidth * 100) {
          renderWidth = 0;
        }
        const newCenter = (furnitureLeft + furnitureRight) / 2;
        console.log('🟢 오른쪽 X축 침범: 가구를 왼쪽으로 밀고 폭 조정', {
          xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
          zAxisIntrusion: zAxisIntrusion.toFixed(1) + 'mm',
          columnLeftX: columnLeftX.toFixed(3),
          newFurnitureRight: furnitureRight.toFixed(3),
          originalFurnitureRight: originalSlotBounds.right.toFixed(3),
          renderWidth,
          logic: '기둥이 오른쪽에서 침범 -> 가구 오른쪽 경계를 기둥 왼쪽으로'
        });
        return {
          left: furnitureLeft,
          right: furnitureRight,
          center: newCenter,
          width: renderWidth,
          renderWidth: renderWidth
        };
      } else if (slotInfo.intrusionDirection === 'center') {
        // 기둥이 중앙에서 침범: 양쪽 모두 줄임
        const halfIntrusion = xAxisIntrusion / 2000; // 절반씩 나눔, mm -> m
        furnitureLeft = originalSlotBounds.left + halfIntrusion;
        furnitureRight = originalSlotBounds.right - halfIntrusion;
        renderWidth = (furnitureRight - furnitureLeft) * 100;
        // 가구 폭이 150mm 미만이면 0으로 설정 (가구를 숨김)
        if (renderWidth < minFurnitureWidth * 100) {
          renderWidth = 0;
        }
        const newCenter = (furnitureLeft + furnitureRight) / 2;
        console.log('🟢 중앙 X축 침범: 양쪽 모두 조정', {
          xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
          zAxisIntrusion: zAxisIntrusion.toFixed(1) + 'mm',
          halfIntrusion: (halfIntrusion * 1000).toFixed(1) + 'mm',
          renderWidth,
          logic: '기둥이 중앙에서 침범 -> 양쪽 경계 모두 조정'
        });
        return {
          left: furnitureLeft,
          right: furnitureRight,
          center: newCenter,
          width: renderWidth,
          renderWidth: renderWidth
        };
      }
  } else if (zAxisIntrusion > 10) {
    // X축 침범이 없고 Z축 침범만 있는 경우: 폭 원래대로, 깊이 조정
    furnitureLeft = originalSlotBounds.left;
    furnitureRight = originalSlotBounds.right;
    renderWidth = (furnitureRight - furnitureLeft) * 100;
    const newCenter = (furnitureLeft + furnitureRight) / 2;
    console.log('🔴 순수 Z축 침범: 폭 원래대로, 중심 고정', {
      xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
      zAxisIntrusion: zAxisIntrusion.toFixed(1) + 'mm',
      renderWidth,
      logic: 'Z축 침범만 있음, 깊이 조정, 폭 유지'
    });
    return {
      left: furnitureLeft,
      right: furnitureRight,
      center: newCenter,
      width: renderWidth,
      renderWidth: renderWidth
    };
  }
  
  // 침범 없음: 원래대로
  furnitureLeft = originalSlotBounds.left;
  furnitureRight = originalSlotBounds.right;
  renderWidth = (furnitureRight - furnitureLeft) * 100;
  const newCenter = (furnitureLeft + furnitureRight) / 2;
  console.log('⚪️ 침범 없음: 폭 원래대로, 중심 고정', {
    xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
    renderWidth
  });
  return {
    left: furnitureLeft,
    right: furnitureRight,
    center: newCenter,
    width: renderWidth,
    renderWidth: renderWidth
  };
}; 

/**
 * 기둥이 듀얼 가구를 침범하면 듀얼 가구를 삭제
 */
export const removeDualFurnitureInColumnSlots = (
  placedModules: any[],
  spaceInfo: SpaceInfo,
  removeModule: (moduleId: string) => void
): string[] => {
  const columnSlots = analyzeColumnSlots(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  const internalSpace = { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth };
  
  // 삭제 대상 듀얼 가구들 수집
  const modulesToRemove: string[] = [];
  
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
    
    // 기둥이 하나 이상의 슬롯에 있으면 삭제 대상
    if (leftSlotInfo.hasColumn || rightSlotInfo.hasColumn) {
      modulesToRemove.push(placedModule.id);
      console.log('🗑️ 기둥 침범으로 듀얼 가구 삭제 예정:', {
        moduleId: placedModule.id,
        slotIndex,
        leftHasColumn: leftSlotInfo.hasColumn,
        rightHasColumn: rightSlotInfo.hasColumn
      });
    }
  });
  
  // 듀얼 가구 삭제 반환
  return modulesToRemove;
};

/**
 * 기둥이 있는 슬롯에서 가구를 배치할 수 있는 빈 공간 찾기
 */
export const findAvailableSpacesInColumnSlot = (
  slotInfo: ColumnSlotInfo,
  slotIndex: number,
  spaceInfo: SpaceInfo,
  existingModules: any[]
): { position: { x: number, z: number }, maxWidth: number, type: 'left' | 'right' | 'front' }[] => {
  if (!slotInfo.hasColumn || !slotInfo.column) {
    return [];
  }

  const indexing = calculateSpaceIndexing(spaceInfo);
  const slotWidthM = indexing.columnWidth * 0.01;
  const slotCenterX = indexing.threeUnitPositions[slotIndex];
  const slotLeftX = slotCenterX - slotWidthM / 2;
  const slotRightX = slotCenterX + slotWidthM / 2;
  
  const column = slotInfo.column;
  const columnLeftX = column.position[0] - (column.width * 0.01) / 2;
  const columnRightX = column.position[0] + (column.width * 0.01) / 2;
  const columnDepth = column.depth * 0.001; // mm to m
  const columnZ = column.position[2];
  
  const availableSpaces = [];
  const minWidth = 150; // 최소 150mm
  
  // 같은 슬롯에 있는 기존 가구들 확인
  const modulesInSlot = existingModules.filter(m => m.slotIndex === slotIndex);
  console.log(`🔍 슬롯 ${slotIndex}의 기존 가구:`, modulesInSlot.length);
  
  // 기존 가구들의 위치와 크기 확인
  const occupiedSpaces = modulesInSlot.map(m => {
    const width = (m.adjustedWidth || 600) * 0.001; // mm to m
    const halfWidth = width / 2;
    return {
      left: m.position.x - halfWidth,
      right: m.position.x + halfWidth,
      z: m.position.z || 0,
      id: m.id
    };
  });
  
  // 공간이 점유되었는지 확인하는 함수
  const isSpaceOccupied = (centerX: number, width: number, z: number = 0) => {
    const halfWidth = width * 0.001 / 2; // mm to m
    const left = centerX - halfWidth;
    const right = centerX + halfWidth;
    
    return occupiedSpaces.some(occupied => {
      // Z축이 다르면 겹치지 않음 (앞뒤로 배치된 경우)
      if (Math.abs(occupied.z - z) > 0.05) return false;
      
      // X축 겹침 확인
      return !(right <= occupied.left || left >= occupied.right);
    });
  };
  
  // 1. 왼쪽 공간 확인
  const leftSpace = (columnLeftX - slotLeftX) * 1000; // mm
  if (leftSpace >= minWidth) {
    // 가구가 기둥과 겹치지 않도록 안전 마진 추가
    const safetyMargin = 0.005; // 5mm
    const furnitureHalfWidth = Math.min(leftSpace, 600) * 0.0005; // 가구 최대 폭의 절반 (m)
    const centerX = slotLeftX + furnitureHalfWidth + safetyMargin;
    
    // 가구가 기둥과 겹치지 않는지 확인
    const furnitureRightEdge = centerX + furnitureHalfWidth;
    if (furnitureRightEdge < columnLeftX - safetyMargin && !isSpaceOccupied(centerX, leftSpace)) {
      availableSpaces.push({
        position: { x: centerX, z: 0 },
        maxWidth: leftSpace,
        type: 'left' as const
      });
    }
  }
  
  // 2. 오른쪽 공간 확인
  const rightSpace = (slotRightX - columnRightX) * 1000; // mm
  if (rightSpace >= minWidth) {
    // 가구가 기둥과 겹치지 않도록 안전 마진 추가
    const safetyMargin = 0.005; // 5mm
    const furnitureHalfWidth = Math.min(rightSpace, 600) * 0.0005; // 가구 최대 폭의 절반 (m)
    const centerX = slotRightX - furnitureHalfWidth - safetyMargin;
    
    // 가구가 기둥과 겹치지 않는지 확인
    const furnitureLeftEdge = centerX - furnitureHalfWidth;
    if (furnitureLeftEdge > columnRightX + safetyMargin && !isSpaceOccupied(centerX, rightSpace)) {
      availableSpaces.push({
        position: { x: centerX, z: 0 },
        maxWidth: rightSpace,
        type: 'right' as const
      });
    }
  }
  
  // 3. 기둥 앞 공간 확인 (얕은 기둥인 경우)
  if (column.depth < 500) { // 얕은 기둥
    const frontSpace = 730 - column.depth; // 슬롯 깊이 - 기둥 깊이
    if (frontSpace >= 200) { // 최소 200mm
      const frontZ = columnZ + columnDepth / 2 + (frontSpace * 0.001) / 2;
      const frontWidth = Math.min(column.width, 300); // 기둥 너비 또는 최대 300mm
      if (!isSpaceOccupied(column.position[0], frontWidth, frontZ)) {
        availableSpaces.push({
          position: { x: column.position[0], z: frontZ },
          maxWidth: frontWidth,
          type: 'front' as const
        });
      }
    }
  }
  
  console.log(`📍 슬롯 ${slotIndex}의 사용 가능한 공간:`, {
    count: availableSpaces.length,
    spaces: availableSpaces.map(s => ({
      type: s.type,
      width: s.maxWidth,
      position: `(${s.position.x.toFixed(2)}, ${s.position.z.toFixed(2)})`
    }))
  });
  
  return availableSpaces;
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