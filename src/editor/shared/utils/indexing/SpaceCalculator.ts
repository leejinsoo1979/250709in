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
      // 소수점 1자리까지 정확히 계산
      columnWidthWillBe: (columns: number) => Math.round((internalWidth / columns) * 10) / 10
    };
  }

  /**
   * 현재 컬럼 수가 유효한지 검증
   */
  static validateColumnCount(columnCount: number, internalWidth: number) {
    const limits = SpaceCalculator.getColumnCountLimits(internalWidth);
    // 소수점 1자리까지 정확히 계산
    const columnWidth = Math.round((internalWidth / columnCount) * 10) / 10;
    
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
   * - 기본값은 최소 컬럼 수 (슬롯폭이 최대 600mm에 가까운 값)
   */
  static getDefaultColumnCount(internalWidth: number): number {
    const SLOT_MIN_WIDTH = 400; // 한 슬롯의 최소 너비 (mm)
    const SLOT_MAX_WIDTH = 600; // 한 슬롯의 최대 너비 (mm)
    
    console.log('🔍 getDefaultColumnCount - internalWidth:', internalWidth);
    
    // 600mm 이하면 무조건 1개 슬롯
    if (internalWidth <= SLOT_MAX_WIDTH) {
      console.log(`→ 내경 ${internalWidth}mm ≤ 600mm → 1개 슬롯`);
      return 1;
    }
    
    // 슬롯폭이 600mm 이하가 되도록 하는 최소 컬럼 수 계산
    const minColumnCount = Math.ceil(internalWidth / SLOT_MAX_WIDTH);
    
    // 슬롯폭이 400mm 이상이 되도록 하는 최대 컬럼 수 계산
    const maxColumnCount = Math.floor(internalWidth / SLOT_MIN_WIDTH);
    
    // 기본값은 최소 컬럼 수 (슬롯폭이 최대한 크게)
    let bestSlotCount = minColumnCount;
    let bestSlotWidth = Math.floor(internalWidth / bestSlotCount);
    
    console.log(`📏 컬럼 수 범위: ${minColumnCount} ~ ${maxColumnCount}`);
    console.log(`→ 기본 컬럼 개수 (최소값): ${bestSlotCount}개 (슬롯폭: ${bestSlotWidth}mm)`);
    
    // 슬롯폭이 범위를 벗어나면 경고
    if (bestSlotWidth < SLOT_MIN_WIDTH) {
      console.warn(`⚠️ 슬롯폭이 최소값(400mm) 미만: ${bestSlotWidth}mm`);
    } else if (bestSlotWidth > SLOT_MAX_WIDTH) {
      console.warn(`⚠️ 슬롯폭이 최대값(600mm) 초과: ${bestSlotWidth}mm`);
      // 600mm를 초과하면 컬럼 수를 늘려서 조정
      bestSlotCount = Math.ceil(internalWidth / SLOT_MAX_WIDTH);
      bestSlotWidth = Math.floor(internalWidth / bestSlotCount);
      console.log(`→ 조정된 컬럼 개수: ${bestSlotCount}개 (슬롯폭: ${bestSlotWidth}mm)`);
    }
    
    return bestSlotCount;
  }

  /**
   * Three.js 단위를 mm로 변환
   */
  static threeUnitsToMm(threeUnits: number): number {
    return threeUnits * 100; // 1 Three.js unit = 100mm
  }

  /**
   * 균등분할을 위한 이격거리 자동 선택 (노서라운드 빌트인)
   * 정수 슬롯폭을 우선으로, 없으면 0.5 단위 슬롯폭 선택
   */
  static selectOptimalGapSum(totalWidth: number, slotCount: number): number[] {
    const validGapSums: number[] = [];
    
    console.log('🔍 selectOptimalGapSum 시작:', { totalWidth, slotCount });
    
    // 먼저 정수 슬롯폭을 만드는 이격거리 찾기
    for (let gapSum = 0; gapSum <= 20; gapSum++) {
      const internalWidth = totalWidth - gapSum;
      const slotWidth = internalWidth / slotCount;
      
      // 정수인지 체크
      const isInteger = Math.abs(slotWidth - Math.round(slotWidth)) < 0.001;
      
      if (isInteger && slotWidth >= 400 && slotWidth <= 600) {
        console.log(`  ✅ 정수 슬롯폭 발견! gapSum=${gapSum}, 슬롯폭=${Math.round(slotWidth)}mm`);
        return [gapSum]; // 정수를 찾으면 바로 반환
      }
    }
    
    // 정수가 없으면 0.5 단위 찾기
    for (let gapSum = 0; gapSum <= 20; gapSum++) {
      const internalWidth = totalWidth - gapSum;
      const slotWidth = internalWidth / slotCount;
      
      // 0.5 단위로 반올림
      const roundedSlotWidth = Math.round(slotWidth * 2) / 2;
      const remainder = Math.abs(slotWidth - roundedSlotWidth);
      
      if (remainder < 0.01 && roundedSlotWidth >= 400 && roundedSlotWidth <= 600) {
        validGapSums.push(gapSum);
        console.log(`  ✅ 0.5 단위 슬롯폭: gapSum=${gapSum}, 슬롯폭=${roundedSlotWidth}mm`);
      }
    }
    
    console.log('🔍 selectOptimalGapSum 결과:', validGapSums);
    return validGapSums;
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
        // 빌트인: 좌우 이격거리를 독립적으로 조정하여 균등분할
        const baseWidth = spaceInfo.width;
        let bestConfig = null;
        let bestSlotWidth = null;
        
        // 좌우 이격거리를 독립적으로 조정 (0~15mm 범위)
        for (let leftGap = 0; leftGap <= 15; leftGap++) {
          for (let rightGap = 0; rightGap <= 15; rightGap++) {
            const internalWidth = baseWidth - leftGap - rightGap;
            const slotWidth = internalWidth / columnCount;
            
            // 정수로 완벽하게 떨어지는지 체크
            const isInteger = Math.abs(slotWidth - Math.round(slotWidth)) < 0.001;
            
            if (isInteger && slotWidth >= 400 && slotWidth <= 600) {
              console.log(`✅ 정수 슬롯폭 발견! leftGap=${leftGap}, rightGap=${rightGap}, 슬롯폭=${Math.round(slotWidth)}mm`);
              return {
                adjustedSpaceInfo: {
                  ...spaceInfo,
                  gapConfig: { left: leftGap, right: rightGap }
                },
                slotWidth: Math.round(slotWidth),
                adjustmentMade: true
              };
            }
            
            // 0.5 단위로 떨어지는 경우도 기록
            const roundedSlotWidth = Math.round(slotWidth * 2) / 2;
            const remainder = Math.abs(slotWidth - roundedSlotWidth);
            
            if (!bestSlotWidth && remainder < 0.01 && roundedSlotWidth >= 400 && roundedSlotWidth <= 600) {
              bestSlotWidth = roundedSlotWidth;
              bestConfig = { left: leftGap, right: rightGap };
            }
          }
        }
        
        // 정수가 없으면 0.5 단위 사용
        if (bestConfig && bestSlotWidth) {
          
          console.log('🎯 adjustForIntegerSlotWidth - 최적 이격거리 찾음:', {
            totalWidth: baseWidth,
            slotCount: columnCount,
            validGapSums,
            selectedGapSum: optimalGapSum,
            leftGap,
            rightGap,
            slotWidth
          });
          
          return {
            adjustedSpaceInfo: {
              ...spaceInfo,
              gapConfig: { left: leftGap, right: rightGap }
            },
            slotWidth,
            adjustmentMade: true
          };
        }
        
        // 정수로 안 떨어지면 기본 2mm 사용
        const gap = 2;
        const internalWidth = baseWidth - (gap * 2);
        const slotWidth = internalWidth / columnCount;
        
        console.log('⚠️ adjustForIntegerSlotWidth - 정수 슬롯 불가, 기본값 사용:', {
          totalWidth: baseWidth,
          slotCount: columnCount,
          gap,
          slotWidth
        });
        
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
          // 소수점 1자리까지 정확히 계산
          const slotWidth = Math.round((internalWidth / columnCount) * 10) / 10;
          
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
        // 소수점 1자리까지 정확히 계산  
        const slotWidth = Math.round((internalWidth / columnCount) * 10) / 10;
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
        // 소수점 1자리까지 정확히 계산  
        const slotWidth = Math.round((internalWidth / columnCount) * 10) / 10;
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
        // 소수점 1자리까지 정확히 계산  
        const slotWidth = Math.round((internalWidth / columnCount) * 10) / 10;
        return {
          adjustedSpaceInfo: spaceInfo,
          slotWidth,
          adjustmentMade: false
        };
      }
      
      // 프레임 크기 조정 시도 (40~60mm 범위)
      const baseLeft = canAdjustLeft ? currentFrameSize.left : END_PANEL_THICKNESS;
      const baseRight = canAdjustRight ? currentFrameSize.right : END_PANEL_THICKNESS;
      
      // 먼저 대칭 조정으로 시도 (프레임 합이 짝수인 경우)
      if (canAdjustLeft && canAdjustRight) {
        for (let adjust = -10; adjust <= 10; adjust++) {
          const leftFrame = Math.max(40, Math.min(60, baseLeft + adjust));
          const rightFrame = Math.max(40, Math.min(60, baseRight + adjust));
          
          const internalWidth = spaceInfo.width - leftFrame - rightFrame;
          const slotWidth = internalWidth / columnCount;
          
          // 정수로 완벽하게 떨어지는지 체크
          const isInteger = Math.abs(slotWidth - Math.round(slotWidth)) < 0.001;
          if (isInteger) {
            console.log(`✅ 대칭 프레임으로 정수 슬롯폭! leftFrame=${leftFrame}, rightFrame=${rightFrame}, 슬롯폭=${Math.round(slotWidth)}mm`);
            return {
              adjustedSpaceInfo: {
                ...spaceInfo,
                frameSize: {
                  ...currentFrameSize,
                  left: leftFrame,
                  right: rightFrame
                }
              },
              slotWidth: Math.round(slotWidth),
              adjustmentMade: true
            };
          }
        }
      }
      
      // 대칭으로 안되면 비대칭 조정 시도 (프레임 합이 홀수인 경우)
      let bestConfig = null;
      let bestSlotWidth = null;
      let smallestRemainder = Number.MAX_VALUE;
      
      // 왼쪽 프레임 40~60mm, 오른쪽 프레임 40~60mm 범위에서 모든 조합 시도
      for (let leftAdjust = -10; leftAdjust <= 10; leftAdjust++) {
        for (let rightAdjust = -10; rightAdjust <= 10; rightAdjust++) {
          const leftFrame = canAdjustLeft ? Math.max(40, Math.min(60, baseLeft + leftAdjust)) : baseLeft;
          const rightFrame = canAdjustRight ? Math.max(40, Math.min(60, baseRight + rightAdjust)) : baseRight;
          
          const internalWidth = spaceInfo.width - leftFrame - rightFrame;
          const slotWidth = internalWidth / columnCount;
          
          // 정수로 완벽하게 떨어지는지 먼저 체크
          const isInteger = Math.abs(slotWidth - Math.round(slotWidth)) < 0.001;
          if (isInteger) {
            console.log(`✅ 비대칭 프레임으로 정수 슬롯폭! leftFrame=${leftFrame}, rightFrame=${rightFrame}, 슬롯폭=${Math.round(slotWidth)}mm`);
            return {
              adjustedSpaceInfo: {
                ...spaceInfo,
                frameSize: {
                  ...currentFrameSize,
                  left: leftFrame,
                  right: rightFrame
                }
              },
              slotWidth: Math.round(slotWidth),
              adjustmentMade: true
            };
          }
          
          // 0.5 단위로 떨어지는지 체크
          const roundedSlotWidth = Math.round(slotWidth * 2) / 2;
          const remainder = Math.abs(slotWidth - roundedSlotWidth);
          
          if (remainder < smallestRemainder) {
            smallestRemainder = remainder;
            bestSlotWidth = roundedSlotWidth;
            bestConfig = { left: leftFrame, right: rightFrame };
          }
        }
      }
      
      // 가장 좋은 설정 적용
      if (bestConfig && smallestRemainder < 0.1) {
        return {
          adjustedSpaceInfo: {
            ...spaceInfo,
            frameSize: {
              ...currentFrameSize,
              left: bestConfig.left,
              right: bestConfig.right
            }
          },
          slotWidth: bestSlotWidth,
          adjustmentMade: true
        };
      }
      
      // 조정이 어려우면 원래 값 유지
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
      // 소수점 1자리까지 정확히 계산
      const slotWidth = Math.round((internalWidth / columnCount) * 10) / 10;
      return {
        adjustedSpaceInfo: spaceInfo,
        slotWidth,
        adjustmentMade: false
      };
    }
  }
} 