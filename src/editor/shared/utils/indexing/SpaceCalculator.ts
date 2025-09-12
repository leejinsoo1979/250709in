import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateFrameThickness, END_PANEL_THICKNESS } from '../../viewer3d/utils/geometry';

/**
 * 공간 계산 관련 유틸리티 클래스
 * 단위 변환, 내경 계산, 컬럼 수 제한 등을 담당
 */
export class SpaceCalculator {
  /**
   * mm 단위를 Three.js 단위로 변환 (1mm = 0.01 three.js 단위)
   */
  static mmToThreeUnits(mm: number): number {
    return mm * 0.01;
  }

  /**
   * 내경 폭 계산 유틸리티 함수
   */
  static calculateInternalWidth(spaceInfo: SpaceInfo, hasLeftFurniture: boolean = false, hasRightFurniture: boolean = false): number {
    // 프레임 두께 계산 (surroundType, frameSize 등 고려)
    const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
    
    // 전체 폭
    const totalWidth = spaceInfo.width;
    
    // 내경 계산: 노서라운드인 경우 전체 너비 사용, 서라운드인 경우 프레임 두께 고려
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드: 전체 너비를 내경으로 사용 (엔드패널이 슬롯에 포함됨)
      let leftReduction = 0;
      let rightReduction = 0;
      
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 양쪽 벽이 있으므로 이격거리 반영
        leftReduction = spaceInfo.gapConfig?.left || 2;
        rightReduction = spaceInfo.gapConfig?.right || 2;
      }
      // 세미스탠딩, 프리스탠딩: 전체 너비 사용 (엔드패널이 슬롯에 포함)
      
      return totalWidth - (leftReduction + rightReduction);
    } else {
      // 서라운드: 내경 = 전체 폭 - 좌측 프레임 - 우측 프레임
      return totalWidth - frameThickness.left - frameThickness.right;
    }
  }

  /**
   * 내경 폭에 따른 최소/최대 컬럼 수 계산
   */
  static getColumnCountLimits(internalWidth: number) {
    const MIN_COLUMN_WIDTH = 300.01; // 300mm 초과 조건
    const MAX_COLUMN_WIDTH = 600;    // 1개 컬럼 최대 폭
    const SINGLE_MAX_WIDTH = 600;    // 싱글장 제한
    const DUAL_MAX_WIDTH = 1200;     // 듀얼장 제한
    
    // 최소 컬럼 수: 각 컬럼이 600mm를 넘지 않도록 보장
    const minColumns = Math.ceil(internalWidth / MAX_COLUMN_WIDTH);
    
    // 최대 컬럼 수: 각 컬럼이 300mm를 초과하도록 보장
    const maxColumns = Math.floor(internalWidth / MIN_COLUMN_WIDTH);
    
    // 가구 타입별 제한 확인
    const canUseSingle = internalWidth <= SINGLE_MAX_WIDTH;
    const canUseDual = internalWidth <= DUAL_MAX_WIDTH;
    
    return {
      minColumns,
      maxColumns,
      canUseSingle,
      canUseDual,
      columnWidthWillBe: (columns: number) => Math.floor(internalWidth / columns)
    };
  }

  /**
   * 현재 컬럼 수가 유효한지 검증
   */
  static validateColumnCount(columnCount: number, internalWidth: number) {
    const limits = SpaceCalculator.getColumnCountLimits(internalWidth);
    const columnWidth = Math.floor(internalWidth / columnCount);
    
    return {
      isValid: columnCount >= limits.minColumns && 
               columnCount <= limits.maxColumns && 
               columnWidth > 300,
      columnWidth,
      limits
    };
  }

  /**
   * 내경폭에 맞는 기본 컬럼 수 계산 (자동 모드)
   * wardrobe_slot_rules_v4.md 규칙에 따라:
   * - 슬롯폭은 400~600mm 범위
   * - 2 × 슬롯폭은 정수여야 함
   */
  static getDefaultColumnCount(internalWidth: number): number {
    const SLOT_MIN_WIDTH = 400; // 한 슬롯의 최소 너비 (mm)
    const SLOT_MAX_WIDTH = 600; // 한 슬롯의 최대 너비 (mm)
    
    console.log('🔍 getDefaultColumnCount - internalWidth:', internalWidth);
    
    // 최적의 슬롯 개수 찾기
    // 슬롯폭이 400~600mm 범위에 들어가도록 슬롯 개수 결정
    let bestSlotCount = 1;
    let bestSlotWidth = internalWidth;
    let bestDifference = Math.abs(500 - bestSlotWidth); // 500mm를 이상적인 슬롯폭으로 설정
    
    // 가능한 슬롯 개수를 탐색 (최대 20개까지 검토)
    for (let slotCount = 1; slotCount <= 20; slotCount++) {
      const slotWidth = Math.floor(internalWidth / slotCount);
      
      // 슬롯폭이 400~600mm 범위에 있는지 확인
      if (slotWidth >= SLOT_MIN_WIDTH && slotWidth <= SLOT_MAX_WIDTH) {
        // 2 × 슬롯폭이 정수인지 확인 (슬롯폭이 정수이거나 0.5 단위)
        const isValidWidth = Number.isInteger(slotWidth) || Number.isInteger(slotWidth * 2);
        
        // 500mm에 가장 가까운 슬롯폭을 선택
        const difference = Math.abs(500 - slotWidth);
        
        if (isValidWidth && difference < bestDifference) {
          bestSlotCount = slotCount;
          bestSlotWidth = slotWidth;
          bestDifference = difference;
          console.log(`→ 더 나은 슬롯 개수 찾음: ${slotCount}개 (슬롯폭: ${slotWidth}mm, 500mm와의 차이: ${difference}mm)`);
        }
      }
    }
    
    // 만약 유효한 슬롯 개수를 못 찾았다면, 400-600mm 범위를 보장하도록 계산
    if (bestSlotWidth < SLOT_MIN_WIDTH || bestSlotWidth > SLOT_MAX_WIDTH) {
      // 슬롯폭이 400mm 이상이 되도록 최대 개수 계산
      const maxCount = Math.floor(internalWidth / SLOT_MIN_WIDTH);
      // 슬롯폭이 600mm 이하가 되도록 최소 개수 계산
      const minCount = Math.ceil(internalWidth / SLOT_MAX_WIDTH);
      
      // 500mm에 가장 가까운 슬롯폭을 만드는 개수 선택
      let optimalCount = Math.round(internalWidth / 500);
      
      // 범위 내로 조정
      if (optimalCount < minCount) optimalCount = minCount;
      if (optimalCount > maxCount) optimalCount = maxCount;
      
      bestSlotCount = optimalCount;
      bestSlotWidth = Math.floor(internalWidth / bestSlotCount);
      
      console.log(`⚠️ 조정된 슬롯 개수: ${bestSlotCount}개 (슬롯폭: ${bestSlotWidth}mm)`);
      
      // 여전히 범위를 벗어나면 경고
      if (bestSlotWidth < SLOT_MIN_WIDTH) {
        console.warn(`⚠️ 슬롯폭이 최소값(400mm) 미만: ${bestSlotWidth}mm`);
      } else if (bestSlotWidth > SLOT_MAX_WIDTH) {
        console.warn(`⚠️ 슬롯폭이 최대값(600mm) 초과: ${bestSlotWidth}mm`);
      }
    }
    
    console.log(`→ 최종 컬럼 개수: ${bestSlotCount}, 슬롯폭: ${bestSlotWidth}mm`);
    return bestSlotCount;
  }

  /**
   * Three.js 단위를 mm로 변환
   */
  static threeUnitsToMm(threeUnits: number): number {
    return threeUnits * 100; // 1 Three.js unit = 100mm
  }

  /**
   * 정수 슬롯 너비를 위한 프레임/이격거리 자동 조정
   * @returns 조정된 spaceInfo와 슬롯 너비
   */
  static adjustForIntegerSlotWidth(spaceInfo: SpaceInfo): { 
    adjustedSpaceInfo: SpaceInfo; 
    slotWidth: number;
    adjustmentMade: boolean;
  } {
    const columnCount = spaceInfo.customColumnCount || SpaceCalculator.getDefaultColumnCount(SpaceCalculator.calculateInternalWidth(spaceInfo));
    
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드 모드
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 이격거리 2~5mm 범위에서 조정
        const baseWidth = spaceInfo.width;
        
        // 2~5mm 범위에서 정수로 떨어지는 이격거리 찾기
        for (let gap = 2; gap <= 5; gap++) {
          const internalWidth = baseWidth - (gap * 2); // 양쪽 이격거리
          const slotWidth = Math.floor(internalWidth / columnCount);
          
          // 정수로 나누어떨어지는지 확인
          if (internalWidth % columnCount === 0) {
            return {
              adjustedSpaceInfo: {
                ...spaceInfo,
                gapConfig: { left: gap, right: gap }
              },
              slotWidth,
              adjustmentMade: true
            };
          }
        }
        
        // 정수로 안 떨어지면 가장 가까운 값 선택 (기본 2mm)
        const gap = 2;
        const internalWidth = baseWidth - (gap * 2);
        const slotWidth = Math.floor(internalWidth / columnCount);
        return {
          adjustedSpaceInfo: {
            ...spaceInfo,
            gapConfig: { left: gap, right: gap }
          },
          slotWidth,
          adjustmentMade: false
        };
        
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 세미스탠딩: 벽 있는 쪽만 이격거리 조정 (2~5mm)
        const hasLeftWall = spaceInfo.wallConfig?.left;
        const baseWidth = spaceInfo.width - END_PANEL_THICKNESS; // 엔드패널 18mm는 고정
        
        for (let gap = 2; gap <= 5; gap++) {
          const internalWidth = hasLeftWall 
            ? baseWidth - gap  // 왼쪽 벽: 왼쪽만 이격거리
            : baseWidth - gap; // 오른쪽 벽: 오른쪽만 이격거리
          const slotWidth = Math.floor(internalWidth / columnCount);
          
          if (internalWidth % columnCount === 0) {
            return {
              adjustedSpaceInfo: {
                ...spaceInfo,
                gapConfig: {
                  left: hasLeftWall ? gap : 0,
                  right: hasLeftWall ? 0 : gap
                }
              },
              slotWidth,
              adjustmentMade: true
            };
          }
        }
        
        // 기본값 사용
        const gap = 2;
        const internalWidth = hasLeftWall 
          ? baseWidth - gap
          : baseWidth - gap;
        const slotWidth = Math.floor(internalWidth / columnCount);
        return {
          adjustedSpaceInfo: {
            ...spaceInfo,
            gapConfig: {
              left: hasLeftWall ? gap : 0,
              right: hasLeftWall ? 0 : gap
            }
          },
          slotWidth,
          adjustmentMade: false
        };
        
      } else {
        // 프리스탠딩: 양쪽 엔드패널 18mm 고정, 조정 불가
        const internalWidth = spaceInfo.width - (END_PANEL_THICKNESS * 2);
        const slotWidth = Math.floor(internalWidth / columnCount);
        return {
          adjustedSpaceInfo: spaceInfo,
          slotWidth,
          adjustmentMade: false
        };
      }
      
    } else {
      // 서라운드 모드: 프레임 크기 조정 (엔드패널 제외)
      const hasLeftWall = spaceInfo.wallConfig?.left;
      const hasRightWall = spaceInfo.wallConfig?.right;
      const currentFrameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 10 };
      
      // 엔드패널이 아닌 경우만 조정 가능
      const canAdjustLeft = hasLeftWall && currentFrameSize.left !== END_PANEL_THICKNESS;
      const canAdjustRight = hasRightWall && currentFrameSize.right !== END_PANEL_THICKNESS;
      
      if (!canAdjustLeft && !canAdjustRight) {
        // 조정 불가능 (양쪽 모두 엔드패널)
        const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
        const slotWidth = Math.floor(internalWidth / columnCount);
        return {
          adjustedSpaceInfo: spaceInfo,
          slotWidth,
          adjustmentMade: false
        };
      }
      
      // 프레임 크기 조정 시도 (40~60mm 범위)
      const baseLeft = canAdjustLeft ? currentFrameSize.left : END_PANEL_THICKNESS;
      const baseRight = canAdjustRight ? currentFrameSize.right : END_PANEL_THICKNESS;
      
      // 조정 가능한 범위 내에서 정수 슬롯 너비 찾기
      for (let adjustment = -10; adjustment <= 10; adjustment++) {
        const leftFrame = canAdjustLeft ? Math.max(40, Math.min(60, baseLeft + adjustment)) : baseLeft;
        const rightFrame = canAdjustRight ? Math.max(40, Math.min(60, baseRight + adjustment)) : baseRight;
        
        const internalWidth = spaceInfo.width - leftFrame - rightFrame;
        const slotWidth = Math.floor(internalWidth / columnCount);
        
        if (internalWidth % columnCount === 0) {
          return {
            adjustedSpaceInfo: {
              ...spaceInfo,
              frameSize: {
                ...currentFrameSize,
                left: leftFrame,
                right: rightFrame
              }
            },
            slotWidth,
            adjustmentMade: true
          };
        }
      }
      
      // 정수로 안 떨어지면 원래 값 유지
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
      const slotWidth = Math.floor(internalWidth / columnCount);
      return {
        adjustedSpaceInfo: spaceInfo,
        slotWidth,
        adjustmentMade: false
      };
    }
  }
} 