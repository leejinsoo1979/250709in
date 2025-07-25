import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateFrameThickness } from '../../viewer3d/utils/geometry';

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
    
    // 내경 계산: 노서라운드인 경우 이격거리/엔드패널 고려, 서라운드인 경우 프레임 두께 고려
    if (spaceInfo.surroundType === 'no-surround') {
      let leftReduction = 0;
      let rightReduction = 0;
      
      // 노서라운드: 프레임 없음, 벽 유무에 따라 이격거리 또는 엔드패널
      if (spaceInfo.installType === 'builtin') {
        // 양쪽벽: 양쪽 모두 2mm 이격거리
        leftReduction = 2;
        rightReduction = 2;
      } else if (spaceInfo.installType === 'semistanding') {
        // 한쪽벽: 벽 있는 쪽 2mm, 벽 없는 쪽 20mm 엔드패널
        if (spaceInfo.wallConfig?.left) {
          leftReduction = 2;  // 좌측벽 있음: 2mm 이격거리
          rightReduction = 20; // 우측벽 없음: 20mm 엔드패널
        } else {
          leftReduction = 20; // 좌측벽 없음: 20mm 엔드패널
          rightReduction = 2;  // 우측벽 있음: 2mm 이격거리
        }
      } else {
        // 벽없음(freestanding): 양쪽 모두 20mm 엔드패널
        leftReduction = 20;
        rightReduction = 20;
      }
      
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
   */
  static getDefaultColumnCount(internalWidth: number): number {
    const SLOT_MAX_WIDTH = 600; // 한 슬롯의 최대 너비 (mm)
    
    // 내경이 600mm 이하면 1개 컬럼
    if (internalWidth <= SLOT_MAX_WIDTH) {
      return 1;
    } 
    // 그 외의 경우 기존 로직 적용 - 정확한 분할을 위해 반올림 사용
    else {
      return Math.round(internalWidth / SLOT_MAX_WIDTH);
    }
  }
} 