import { SpaceIndexingResult } from './ColumnIndexer';

/**
 * 가구 위치 계산 및 검증 관련 유틸리티 클래스
 * 가구 배치 유효성 검사, 위치 조정 등을 담당
 */
export class FurniturePositioner {
  /**
   * 가구가 새로운 공간 설정에서 유효한지 검증하는 함수
   */
  static validateFurniturePosition(
    slotIndex: number,
    isDualFurniture: boolean,
    newIndexing: SpaceIndexingResult
  ): boolean {
    if (slotIndex < 0) return false;
    
    if (isDualFurniture) {
      // 듀얼 가구: 현재 슬롯과 다음 슬롯이 모두 존재해야 함
      return slotIndex < (newIndexing.columnCount - 1);
    } else {
      // 싱글 가구: 현재 슬롯만 존재하면 됨
      return slotIndex < newIndexing.columnCount;
    }
  }

  /**
   * 새로운 공간 설정에 맞게 가구 위치를 조정하는 함수
   */
  static adjustFurniturePosition(
    slotIndex: number,
    isDualFurniture: boolean,
    newIndexing: SpaceIndexingResult
  ): { x: number; y: number; z: number } | null {
    if (!this.validateFurniturePosition(slotIndex, isDualFurniture, newIndexing)) {
      return null;
    }
    
    let newX: number;
    
    if (isDualFurniture && newIndexing.threeUnitDualPositions) {
      // 듀얼 가구: threeUnitDualPositions에서 위치 가져오기
      newX = newIndexing.threeUnitDualPositions[slotIndex];
    } else {
      // 싱글 가구: threeUnitPositions에서 위치 가져오기
      newX = newIndexing.threeUnitPositions[slotIndex];
    }
    
    return {
      x: newX,
      y: 0, // Y 좌표는 변경하지 않음
      z: 0  // Z 좌표는 변경하지 않음
    };
  }
} 