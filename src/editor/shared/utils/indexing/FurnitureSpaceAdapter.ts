import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { ColumnIndexer } from './ColumnIndexer';
import { FurniturePositioner } from './FurniturePositioner';

/**
 * 배치된 가구 모듈 타입
 */
interface PlacedModule {
  id: string;
  moduleId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  hasDoor?: boolean;
  slotIndex?: number;
  isDualSlot?: boolean;
}

/**
 * 가구 필터링 및 조정 결과 타입
 */
interface FurnitureFilterResult {
  validFurniture: Array<PlacedModule & {
    slotIndex: number;
    isDualSlot: boolean;
    isValidInCurrentSpace: boolean;
  }>;
  removedFurniture: Array<string>;
}

/**
 * 공간 변경 시 가구 적응 관련 유틸리티 클래스
 * 공간 크기 변경 시 기존 가구들의 유효성 검사 및 위치 조정을 담당
 */
export class FurnitureSpaceAdapter {
  /**
   * 공간 변경 시 가구 목록을 필터링하고 위치를 조정하는 함수
   */
  static filterAndAdjustFurniture(
    placedModules: Array<PlacedModule>,
    oldSpaceInfo: SpaceInfo,
    newSpaceInfo: SpaceInfo,
    getModuleById: (moduleId: string, internalSpace: { width: number; height: number; depth: number }, spaceInfo: SpaceInfo) => ModuleData | null
  ): FurnitureFilterResult {
    const oldIndexing = ColumnIndexer.calculateSpaceIndexing(oldSpaceInfo);
    const newIndexing = ColumnIndexer.calculateSpaceIndexing(newSpaceInfo);
    
    // 로그 간소화 - 필요시에만 출력
    
    const validFurniture: Array<PlacedModule & {
      slotIndex: number;
      isDualSlot: boolean;
      isValidInCurrentSpace: boolean;
    }> = [];
    const removedFurniture: Array<string> = [];
    
    placedModules.forEach(module => {
      // 내경 공간 계산 (getModuleById를 위해 필요)
      const oldInternalSpace = calculateInternalSpace(oldSpaceInfo);
      const moduleData = getModuleById(module.moduleId, oldInternalSpace, oldSpaceInfo);
      
      if (!moduleData) {
        removedFurniture.push(module.id);
        return;
      }
      
      // 듀얼 가구 여부 판별
      const isDualFurniture = Math.abs(moduleData.dimensions.width - (oldIndexing.columnWidth * 2)) < 50;
      
      // 현재 슬롯 인덱스 계산 (기존 데이터에 없다면 위치로부터 계산)
      let slotIndex = module.slotIndex;
      if (slotIndex === undefined) {
        slotIndex = ColumnIndexer.findSlotIndexFromPosition(module.position, oldIndexing, isDualFurniture);
      }
      
      // 새 공간에서 유효성 검증
      const isValid = FurniturePositioner.validateFurniturePosition(slotIndex, isDualFurniture, newIndexing);
      
      // 컬럼 수가 변경된 경우 추가 검증
      const columnCountChanged = oldIndexing.columnCount !== newIndexing.columnCount;
      
      if (isValid && !columnCountChanged) {
        // 새 위치 계산
        const newPosition = FurniturePositioner.adjustFurniturePosition(slotIndex, isDualFurniture, newIndexing);
        
        if (newPosition) {
          // 새로운 공간에 맞는 moduleId 계산
          let newModuleId = module.moduleId;
          if (moduleData.isDynamic) {
            // 새로운 공간의 실제 컬럼 폭 사용
            const actualNewColumnWidth = newIndexing.columnWidth;
            if (isDualFurniture) {
              // 기존 moduleId 패턴을 분석하여 새로운 폭으로 교체
              newModuleId = module.moduleId.replace(/^dual-(\w+)-(\d+)$/, `dual-$1-${actualNewColumnWidth * 2}`);
            } else {
              // 기존 moduleId 패턴을 분석하여 새로운 폭으로 교체
              newModuleId = module.moduleId.replace(/^single-(\w+)-(\d+)$/, `single-$1-${actualNewColumnWidth}`);
            }
          }
          
          validFurniture.push({
            ...module,
            moduleId: newModuleId, // 새로운 moduleId 사용
            position: {
              ...module.position,
              x: newPosition.x
            },
            slotIndex,
            isDualSlot: isDualFurniture,
            isValidInCurrentSpace: true
          });
          // 가구 보존 성공 (로그 제거)
        } else {
          removedFurniture.push(module.id);
          // 위치 조정 실패 (로그 제거)
        }
      } else {
        removedFurniture.push(module.id);
        // 가구 제거 (로그 제거)
      }
    });
    
    // 최종 결과만 간단히 출력
    if (removedFurniture.length > 0) {
      console.log(`🔄 가구 적응 완료: ${validFurniture.length}개 보존, ${removedFurniture.length}개 제거`);
    }
    
    return {
      validFurniture,
      removedFurniture
    };
  }
} 