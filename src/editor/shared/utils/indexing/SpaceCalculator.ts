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
  static calculateInternalWidth(spaceInfo: SpaceInfo): number {
    // 프레임 두께 계산 (surroundType, frameSize 등 고려)
    const frameThickness = calculateFrameThickness(spaceInfo);
    
    // 전체 폭
    const totalWidth = spaceInfo.width;
    
    // 내경 계산: 노서라운드인 경우 엔드패널과 gapConfig 고려, 서라운드인 경우 프레임 두께 고려
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드: 이격거리와 엔드패널 고려
      let leftReduction = 0;
      let rightReduction = 0;
      const leftGap = spaceInfo.gapConfig?.left || 0;
      const rightGap = spaceInfo.gapConfig?.right || 0;
      
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 양쪽 벽 이격거리 고려
        leftReduction = leftGap;
        rightReduction = rightGap;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 세미스탠딩: 벽 있는 쪽 이격거리 + 벽 없는 쪽 엔드패널
        if (spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right) {
          // 왼쪽 벽, 오른쪽 엔드패널
          leftReduction = leftGap;
          rightReduction = END_PANEL_THICKNESS;
        } else if (!spaceInfo.wallConfig?.left && spaceInfo.wallConfig?.right) {
          // 오른쪽 벽, 왼쪽 엔드패널
          leftReduction = END_PANEL_THICKNESS;
          rightReduction = rightGap;
        } else {
          // fallback (일반적으로 오른쪽 엔드패널)
          leftReduction = leftGap;
          rightReduction = END_PANEL_THICKNESS;
        }
      } else {
        // 프리스탠딩: 양쪽 벽이 없으므로 양쪽 모두 엔드패널(18mm)만
        leftReduction = END_PANEL_THICKNESS;
        rightReduction = END_PANEL_THICKNESS;
      }
      
      const internalWidth = totalWidth - (leftReduction + rightReduction);
      
      // 디버깅 로그
      console.log('🔬 [SpaceCalculator] 내경 계산 (no-surround):', {
        installType: spaceInfo.installType,
        totalWidth,
        leftReduction,
        rightReduction,
        internalWidth,
        calculation: `${totalWidth} - ${leftReduction} - ${rightReduction} = ${internalWidth}`
      });
      
      return internalWidth;
    } else {
      // 서라운드: 내경 = 전체 폭 - 좌측 프레임 - 우측 프레임
      const internalWidth = totalWidth - frameThickness.left - frameThickness.right;
      
      // 디버깅 로그
      console.log('🔬 [SpaceCalculator] 내경 계산 (surround):', {
        totalWidth,
        frameLeft: frameThickness.left,
        frameRight: frameThickness.right,
        internalWidth,
        calculation: `${totalWidth} - ${frameThickness.left} - ${frameThickness.right} = ${internalWidth}`
      });
      
      return internalWidth;
    }
  }

  /**
   * 내경 폭에 따른 최소/최대 컬럼 수 계산
   */
  static getColumnCountLimits(internalWidth: number) {
    const MIN_COLUMN_WIDTH = 400;    // 컬럼 최소 폭 400mm
    const MAX_COLUMN_WIDTH = 600;    // 컬럼 최대 폭 600mm
    const SINGLE_MAX_WIDTH = 600;    // 싱글장 제한
    const DUAL_MAX_WIDTH = 1200;     // 듀얼장 제한
    
    // 최소 컬럼 수: 각 컬럼이 600mm를 넘지 않도록 보장
    const minColumns = Math.ceil(internalWidth / MAX_COLUMN_WIDTH);
    
    // 최대 컬럼 수: 각 컬럼이 400mm 이상이 되도록 보장
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
               columnWidth >= 400 && 
               columnWidth <= 600,
      columnWidth,
      limits
    };
  }

  /**
   * 내경폭에 맞는 기본 컬럼 수 계산 (자동 모드)
   */
  static getDefaultColumnCount(internalWidth: number): number {
    const SLOT_MAX_WIDTH = 600; // 한 슬롯의 최대 너비 (mm)
    
    // 내경이 600mm 이하면 1개 컬럼
    if (internalWidth <= SLOT_MAX_WIDTH) {
      return 1;
    } 
    // 그 외의 경우 - 슬롯이 600mm를 초과하지 않도록 올림 처리
    else {
      return Math.ceil(internalWidth / SLOT_MAX_WIDTH);
    }
  }

  /**
   * 단내림 영역의 내경 계산 (단내림이 있는 경우)
   * 단내림 영역에서 벽/엔드패널을 고려한 실제 사용 가능 폭
   */
  static calculateDroppedZoneInternalWidth(spaceInfo: SpaceInfo): number | null {
    if (!spaceInfo.droppedCeiling?.enabled) return null;
    
    const droppedWidth = spaceInfo.droppedCeiling.width || 900; // 기본값 900mm
    const isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
    
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      let rightReduction = 0;
      const { wallConfig, gapConfig, installType } = spaceInfo;
      
      if (isLeftDropped) {
        // 왼쪽 단내림: 왼쪽 끝과 단내림 경계 사이
        if (installType === 'builtin' || installType === 'built-in') {
          leftReduction = gapConfig?.left || 0;
        } else if (installType === 'semistanding' || installType === 'semi-standing') {
          if (wallConfig?.left) {
            leftReduction = gapConfig?.left || 0;
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }
        } else {
          leftReduction = END_PANEL_THICKNESS;
        }
        // 오른쪽은 단내림 경계이므로 reduction 없음
        rightReduction = 0;
      } else {
        // 오른쪽 단내림: 일반 영역 끝과 오른쪽 끝 사이
        // 왼쪽은 일반 영역 경계이므로 reduction 없음
        leftReduction = 0;
        if (installType === 'builtin' || installType === 'built-in') {
          rightReduction = gapConfig?.right || 0;
        } else if (installType === 'semistanding' || installType === 'semi-standing') {
          if (wallConfig?.right) {
            rightReduction = gapConfig?.right || 0;
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        } else {
          rightReduction = END_PANEL_THICKNESS;
        }
      }
      
      return droppedWidth - leftReduction - rightReduction;
    } else {
      // 서라운드 모드: 프레임 두께 고려
      const frameThickness = calculateFrameThickness(spaceInfo);
      if (isLeftDropped) {
        return droppedWidth - frameThickness.left;
      } else {
        return droppedWidth - frameThickness.right;
      }
    }
  }

  /**
   * 일반 영역의 내경 계산 (단내림이 있는 경우)
   * 일반 영역에서 벽/엔드패널을 고려한 실제 사용 가능 폭
   */
  static calculateNormalZoneInternalWidth(spaceInfo: SpaceInfo): number {
    if (!spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 없으면 전체 내경 반환
      return SpaceCalculator.calculateInternalWidth(spaceInfo);
    }
    
    const droppedWidth = spaceInfo.droppedCeiling.width || 900;
    const normalWidth = spaceInfo.width - droppedWidth;
    const isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
    
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      let rightReduction = 0;
      const { wallConfig, gapConfig, installType } = spaceInfo;
      
      if (isLeftDropped) {
        // 왼쪽 단내림: 일반 영역은 오른쪽에 위치
        // 왼쪽은 단내림 경계이므로 reduction 없음
        leftReduction = 0;
        if (installType === 'builtin' || installType === 'built-in') {
          rightReduction = gapConfig?.right || 0;
        } else if (installType === 'semistanding' || installType === 'semi-standing') {
          if (wallConfig?.right) {
            rightReduction = gapConfig?.right || 0;
          } else {
            rightReduction = END_PANEL_THICKNESS;
          }
        } else {
          rightReduction = END_PANEL_THICKNESS;
        }
      } else {
        // 오른쪽 단내림: 일반 영역은 왼쪽에 위치
        if (installType === 'builtin' || installType === 'built-in') {
          leftReduction = gapConfig?.left || 0;
        } else if (installType === 'semistanding' || installType === 'semi-standing') {
          if (wallConfig?.left) {
            leftReduction = gapConfig?.left || 0;
          } else {
            leftReduction = END_PANEL_THICKNESS;
          }
        } else {
          leftReduction = END_PANEL_THICKNESS;
        }
        // 오른쪽은 단내림 경계이므로 reduction 없음
        rightReduction = 0;
      }
      
      return normalWidth - leftReduction - rightReduction;
    } else {
      // 서라운드 모드: 프레임 두께 고려
      const frameThickness = calculateFrameThickness(spaceInfo);
      if (isLeftDropped) {
        return normalWidth - frameThickness.right;
      } else {
        return normalWidth - frameThickness.left;
      }
    }
  }

  /**
   * Three.js 단위를 mm로 변환
   */
  static threeUnitsToMm(threeUnits: number): number {
    return threeUnits * 100; // 1 Three.js unit = 100mm
  }
} 