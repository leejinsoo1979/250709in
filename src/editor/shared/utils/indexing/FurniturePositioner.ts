import { SpaceIndexingResult, ColumnIndexer } from './ColumnIndexer';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { SpaceCalculator } from './SpaceCalculator';

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
    newIndexing: SpaceIndexingResult,
    zone?: 'normal' | 'dropped'
  ): boolean {
    if (slotIndex < 0) return false;
    
    // 단내림이 있는 경우 영역별 검증
    if (zone && newIndexing.zones) {
      const zoneData = newIndexing.zones[zone];
      if (!zoneData || (zone === 'dropped' && !newIndexing.zones.dropped)) {
        return false;
      }
      
      const maxSlots = zone === 'normal' 
        ? newIndexing.zones.normal.columnCount 
        : newIndexing.zones.dropped!.columnCount;
      
      if (isDualFurniture) {
        // 듀얼 가구: 현재 슬롯과 다음 슬롯이 모두 존재해야 함
        return slotIndex < (maxSlots - 1);
      } else {
        // 싱글 가구: 현재 슬롯만 존재하면 됨
        return slotIndex < maxSlots;
      }
    }
    
    // 단내림이 없는 경우 기존 로직
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
    newIndexing: SpaceIndexingResult,
    zone?: 'normal' | 'dropped'
  ): { x: number; y: number; z: number } | null {
    if (!this.validateFurniturePosition(slotIndex, isDualFurniture, newIndexing, zone)) {
      return null;
    }
    
    let newX: number;
    
    // 단내림이 있는 경우 영역별 위치 계산
    if (zone && newIndexing.zones) {
      const zoneData = zone === 'normal' 
        ? newIndexing.zones.normal 
        : newIndexing.zones.dropped!;
      
      const baseX = zoneData.startX;
      const slotWidths = zoneData.slotWidths || [];
      
      // 실제 슬롯 너비를 사용하여 정확한 위치 계산
      let currentX = 0;
      for (let i = 0; i < slotIndex; i++) {
        currentX += slotWidths[i] || zoneData.columnWidth;
      }
      
      if (isDualFurniture) {
        // 듀얼 가구: 두 슬롯의 중간 위치
        const slot1Width = slotWidths[slotIndex] || zoneData.columnWidth;
        const slot2Width = slotWidths[slotIndex + 1] || zoneData.columnWidth;
        newX = baseX + currentX + (slot1Width + slot2Width) / 2;
      } else {
        // 싱글 가구: 슬롯 중앙 위치
        const slotWidth = slotWidths[slotIndex] || zoneData.columnWidth;
        newX = baseX + currentX + slotWidth / 2;
      }
      
      // mm를 Three.js 단위로 변환
      return {
        x: SpaceCalculator.mmToThreeUnits(newX),
        y: 0, // Y 좌표는 변경하지 않음
        z: 0  // Z 좌표는 변경하지 않음
      };
    }
    
    // 단내림이 없는 경우 기존 로직
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
  
  /**
   * 가장 가까운 슬롯으로 스냅하는 함수 (단내림 지원)
   */
  static snapToNearestSlot(
    position: { x: number; y: number; z: number },
    spaceInfo: SpaceInfo,
    indexing: SpaceIndexingResult,
    isDualFurniture: boolean
  ): { position: { x: number; y: number; z: number }, slotIndex: number, zone: 'normal' | 'dropped' } | null {
    // Three.js 좌표를 mm로 변환
    const positionMm = {
      x: position.x / 0.01,
      y: position.y / 0.01,
      z: position.z / 0.01
    };
    
    // 단내림이 있는 경우
    if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
      const zoneInfo = ColumnIndexer.findZoneAndSlotFromPosition(positionMm, spaceInfo, indexing);
      
      if (!zoneInfo) return null;
      
      const { zone, slotIndex } = zoneInfo;
      
      // 영역별 유효성 검증
      if (!this.validateFurniturePosition(slotIndex, isDualFurniture, indexing, zone)) {
        // 유효하지 않은 경우 가장 가까운 유효한 슬롯 찾기
        const zoneData = indexing.zones[zone];
        if (!zoneData || (zone === 'dropped' && !indexing.zones.dropped)) {
          return null;
        }
        
        const maxSlots = zone === 'normal' 
          ? indexing.zones.normal.columnCount 
          : indexing.zones.dropped!.columnCount;
        
        let adjustedSlotIndex = slotIndex;
        if (isDualFurniture && slotIndex >= maxSlots - 1) {
          adjustedSlotIndex = maxSlots - 2;
        } else if (slotIndex >= maxSlots) {
          adjustedSlotIndex = maxSlots - 1;
        }
        
        if (adjustedSlotIndex < 0) return null;
        
        const newPosition = this.adjustFurniturePosition(adjustedSlotIndex, isDualFurniture, indexing, zone);
        if (!newPosition) return null;
        
        return {
          position: newPosition,
          slotIndex: adjustedSlotIndex,
          zone
        };
      }
      
      // 유효한 경우 해당 슬롯 위치로 스냅
      const newPosition = this.adjustFurniturePosition(slotIndex, isDualFurniture, indexing, zone);
      if (!newPosition) return null;
      
      return {
        position: newPosition,
        slotIndex,
        zone
      };
    }
    
    // 단내림이 없는 경우 기존 로직
    const closestIndex = ColumnIndexer.findClosestColumnIndex(position, indexing);
    
    if (!this.validateFurniturePosition(closestIndex, isDualFurniture, indexing)) {
      // 듀얼 가구가 마지막 슬롯에 걸치는 경우 조정
      let adjustedIndex = closestIndex;
      if (isDualFurniture && closestIndex >= indexing.columnCount - 1) {
        adjustedIndex = indexing.columnCount - 2;
      }
      
      if (adjustedIndex < 0) return null;
      
      const newPosition = this.adjustFurniturePosition(adjustedIndex, isDualFurniture, indexing);
      if (!newPosition) return null;
      
      return {
        position: newPosition,
        slotIndex: adjustedIndex,
        zone: 'normal'
      };
    }
    
    const newPosition = this.adjustFurniturePosition(closestIndex, isDualFurniture, indexing);
    if (!newPosition) return null;
    
    return {
      position: newPosition,
      slotIndex: closestIndex,
      zone: 'normal'
    };
  }
} 