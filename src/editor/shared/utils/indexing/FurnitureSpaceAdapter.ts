import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { ColumnIndexer } from './ColumnIndexer';
import { FurniturePositioner } from './FurniturePositioner';
import { SpaceCalculator } from './SpaceCalculator';

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
  zone?: 'normal' | 'dropped'; // 가구가 속한 영역
}

/**
 * 가구 필터링 및 조정 결과 타입
 */
interface FurnitureFilterResult {
  validFurniture: Array<PlacedModule & {
    slotIndex: number;
    isDualSlot: boolean;
    isValidInCurrentSpace: boolean;
    zone: 'normal' | 'dropped';
    adjustedWidth?: number; // 영역에 맞게 조정된 너비
  }>;
  removedFurniture: Array<string>;
  splitFurniture?: Array<{ // 경계에 걸쳐 분할된 가구
    originalId: string;
    normalPart: PlacedModule;
    droppedPart: PlacedModule;
  }>;
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
    
    const validFurniture: Array<PlacedModule & {
      slotIndex: number;
      isDualSlot: boolean;
      isValidInCurrentSpace: boolean;
      zone: 'normal' | 'dropped';
      adjustedWidth?: number;
    }> = [];
    const removedFurniture: Array<string> = [];
    const splitFurniture: Array<{
      originalId: string;
      normalPart: PlacedModule;
      droppedPart: PlacedModule;
    }> = [];
    
    // 단내림 활성화 여부 확인
    const hasDroppedCeiling = newSpaceInfo.droppedCeiling?.enabled;
    const droppedPosition = newSpaceInfo.droppedCeiling?.position || 'right';
    
    placedModules.forEach(module => {
      // 가구가 이미 zone 정보를 가지고 있고 단내림이 활성화된 경우
      if (module.zone && hasDroppedCeiling && newIndexing.zones) {
        const targetZone = module.zone === 'dropped' && newIndexing.zones.dropped 
          ? newIndexing.zones.dropped 
          : newIndexing.zones.normal;
        
        // zone이 없어진 경우 (예: 단내림 제거)
        if (module.zone === 'dropped' && !newIndexing.zones.dropped) {
          removedFurniture.push(module.id);
          return;
        }
        
        // 영역별 spaceInfo 생성
        const zoneSpaceInfo = {
          ...newSpaceInfo,
          width: targetZone.width,
          customColumnCount: targetZone.columnCount
        };
        
        const zoneInternalSpace = {
          ...calculateInternalSpace(newSpaceInfo),
          width: targetZone.width,
          startX: targetZone.startX
        };
        
        // 영역별 모듈 데이터
        const moduleData = getModuleById(module.moduleId, zoneInternalSpace, zoneSpaceInfo);
        if (!moduleData) {
          removedFurniture.push(module.id);
          return;
        }
        
        // 영역 내 슬롯 인덱스 유효성 검증
        const slotIndex = module.slotIndex || 0;
        const isDual = module.moduleId.startsWith('dual-');
        
        if (slotIndex >= targetZone.columnCount || (isDual && slotIndex >= targetZone.columnCount - 1)) {
          removedFurniture.push(module.id);
          return;
        }
        
        // 위치 재계산
        const newX = targetZone.startX + (slotIndex * targetZone.columnWidth) +
                    (isDual ? targetZone.columnWidth : targetZone.columnWidth / 2);

        // 영역에 맞는 새로운 moduleId 생성 - 이제 ID는 너비 정보를 포함하지 않음
        const newModuleId = module.moduleId;

        // 가구 너비 계산: 슬롯 너비 그대로 사용 (이격거리는 이미 슬롯 계산에 반영됨)
        let furnitureWidth = targetZone.columnWidth;

        validFurniture.push({
          ...module,
          moduleId: newModuleId,
          position: {
            x: SpaceCalculator.mmToThreeUnits(newX),
            y: module.position.y,
            z: module.position.z
          },
          slotIndex,
          isDualSlot: isDual,
          isValidInCurrentSpace: true,
          zone: module.zone,
          adjustedWidth: parseFloat(furnitureWidth.toFixed(2)),
          customWidth: parseFloat(furnitureWidth.toFixed(2))
        });
        
        return;
      }
      
      // zone 정보가 없는 기존 가구들을 위한 폴백 로직
      const oldInternalSpace = calculateInternalSpace(oldSpaceInfo);
      const moduleData = getModuleById(module.moduleId, oldInternalSpace, oldSpaceInfo);
      
      if (!moduleData) {
        removedFurniture.push(module.id);
        return;
      }
      
      // 기존 위치 정보 (mm 단위로 변환)
      const positionMm = {
        x: module.position.x / 0.01, // Three.js 단위를 mm로 변환
        y: module.position.y / 0.01,
        z: module.position.z / 0.01
      };
      
      // 단내림이 있는 경우 영역별 처리
      if (hasDroppedCeiling && newIndexing.zones && !module.zone) {
        const zoneInfo = ColumnIndexer.findZoneAndSlotFromPosition(positionMm, newSpaceInfo, newIndexing);
        
        if (!zoneInfo) {
          removedFurniture.push(module.id);
          return;
        }
        
        const { zone, slotIndex } = zoneInfo;
        const zoneData = newIndexing.zones[zone];
        
        if (!zoneData || (zone === 'dropped' && !newIndexing.zones.dropped)) {
          removedFurniture.push(module.id);
          return;
        }
        
        // 영역별 슬롯 너비
        const zoneColumnWidth = zone === 'normal' 
          ? newIndexing.zones.normal.columnWidth 
          : newIndexing.zones.dropped!.columnWidth;
        
        // 가구 타입 판별 (영역별 슬롯 너비 기준)
        const moduleFitWidth = moduleData.dimensions.width;
        const isDualFurniture = moduleFitWidth > zoneColumnWidth * 1.5; // 1.5배 이상이면 듀얼
        
        // 영역 내 유효성 검증
        const maxSlots = zone === 'normal' 
          ? newIndexing.zones.normal.columnCount 
          : newIndexing.zones.dropped!.columnCount;
        
        const isValidInZone = isDualFurniture 
          ? slotIndex < (maxSlots - 1) 
          : slotIndex < maxSlots;
        
        if (!isValidInZone) {
          // 가구가 영역 경계를 벗어나는 경우
          if (isDualFurniture && slotIndex === maxSlots - 1) {
            // 듀얼 가구가 마지막 슬롯에 걸친 경우, 싱글로 변환 시도
            const singleModuleId = module.moduleId.replace(/^dual-/, 'single-');
            const singleWidth = zoneColumnWidth;
            
            // 새 위치 계산
            const newX = zone === 'normal'
              ? newIndexing.zones.normal.startX + slotIndex * zoneColumnWidth + zoneColumnWidth / 2
              : newIndexing.zones.dropped!.startX + slotIndex * zoneColumnWidth + zoneColumnWidth / 2;
            
            // 가구 너비 계산: 단내림 경계면 근처는 이격거리 3mm만 빼기
            const BOUNDARY_GAP_SINGLE = 3;
            let furnitureWidthSingle = singleWidth;

            // 단내림 경계면 근처 슬롯인지 확인
            const isAtBoundarySingle = (zone === 'normal' && droppedPosition === 'left' && slotIndex === 0) ||
                                      (zone === 'normal' && droppedPosition === 'right' && slotIndex === maxSlots - 1) ||
                                      (zone === 'dropped' && droppedPosition === 'left' && slotIndex === maxSlots - 1) ||
                                      (zone === 'dropped' && droppedPosition === 'right' && slotIndex === 0);

            if (isAtBoundarySingle) {
              furnitureWidthSingle = singleWidth - BOUNDARY_GAP_SINGLE;
            }

            validFurniture.push({
              ...module,
              moduleId: singleModuleId,
              position: {
                x: SpaceCalculator.mmToThreeUnits(newX),
                y: module.position.y,
                z: module.position.z
              },
              slotIndex,
              isDualSlot: false,
              isValidInCurrentSpace: true,
              zone,
              adjustedWidth: parseFloat(furnitureWidthSingle.toFixed(2))
            });
          } else {
            removedFurniture.push(module.id);
          }
          return;
        }
        
        // 영역별 크기 조정된 moduleId 생성 - 이제 ID는 너비 정보를 포함하지 않음
        const adjustedModuleId = module.moduleId;
        let adjustedWidth = isDualFurniture ? zoneColumnWidth * 2 : zoneColumnWidth;

        // 가구 너비 계산: 단내림 경계면 근처는 이격거리 3mm만 빼기
        const BOUNDARY_GAP_ADJ = 3;
        const isAtBoundaryAdj = (zone === 'normal' && droppedPosition === 'left' && slotIndex === 0) ||
                               (zone === 'normal' && droppedPosition === 'right' && slotIndex === maxSlots - 1) ||
                               (zone === 'dropped' && droppedPosition === 'left' && slotIndex === maxSlots - 1) ||
                               (zone === 'dropped' && droppedPosition === 'right' && slotIndex === 0);

        if (isAtBoundaryAdj && !isDualFurniture) {
          // 단내림 경계면의 싱글 가구: 이격거리만 빼기
          adjustedWidth = zoneColumnWidth - BOUNDARY_GAP_ADJ;
        } else if (isAtBoundaryAdj && isDualFurniture) {
          // 단내림 경계면의 듀얼 가구: 한쪽만 이격거리 빼기
          adjustedWidth = zoneColumnWidth * 2 - BOUNDARY_GAP_ADJ;
        }

        // 새 위치 계산 (영역별)
        const baseX = zone === 'normal'
          ? newIndexing.zones.normal.startX
          : newIndexing.zones.dropped!.startX;

        const newX = isDualFurniture
          ? baseX + slotIndex * zoneColumnWidth + zoneColumnWidth // 듀얼은 두 슬롯의 중간
          : baseX + slotIndex * zoneColumnWidth + zoneColumnWidth / 2; // 싱글은 슬롯 중앙

        validFurniture.push({
          ...module,
          moduleId: adjustedModuleId,
          position: {
            x: SpaceCalculator.mmToThreeUnits(newX),
            y: module.position.y,
            z: module.position.z
          },
          slotIndex,
          isDualSlot: isDualFurniture,
          isValidInCurrentSpace: true,
          zone,
          adjustedWidth
        });
        
      } else {
        // 단내림이 없는 경우 기존 로직 사용
        const isDualFurniture = Math.abs(moduleData.dimensions.width - (oldIndexing.columnWidth * 2)) < 50;
        
        let slotIndex = module.slotIndex;
        if (slotIndex === undefined) {
          slotIndex = ColumnIndexer.findSlotIndexFromPosition(module.position, oldIndexing, isDualFurniture);
        }
        
        const isValid = FurniturePositioner.validateFurniturePosition(slotIndex, isDualFurniture, newIndexing);
        const columnCountChanged = oldIndexing.columnCount !== newIndexing.columnCount;
        
        if (isValid && !columnCountChanged) {
          const newPosition = FurniturePositioner.adjustFurniturePosition(slotIndex, isDualFurniture, newIndexing);
          
          if (newPosition) {
            let newModuleId = module.moduleId;
            if (moduleData.isDynamic) {
              // ID의 폭 접미사만 새 슬롯 폭으로 교체 — base 타입 유지
              // (moduleData.type은 'box' 같은 렌더 타입이라 ID 재조합에 쓰면 잘못된 ID가 됨)
              const actualNewColumnWidth = newIndexing.columnWidth;
              const baseModuleType = module.moduleId.replace(/-[\d.]+$/, '');
              newModuleId = `${baseModuleType}-${isDualFurniture ? actualNewColumnWidth * 2 : actualNewColumnWidth}`;
            }
            
            validFurniture.push({
              ...module,
              moduleId: newModuleId,
              position: {
                ...module.position,
                x: newPosition.x
              },
              slotIndex,
              isDualSlot: isDualFurniture,
              isValidInCurrentSpace: true,
              zone: 'normal'
            });
          } else {
            removedFurniture.push(module.id);
          }
        } else {
          removedFurniture.push(module.id);
        }
      }
    });
    
    // 결과 로깅
    if (removedFurniture.length > 0 || splitFurniture.length > 0) {
      console.log(`🔄 가구 적응 완료: ${validFurniture.length}개 보존, ${removedFurniture.length}개 제거, ${splitFurniture.length}개 분할`);
    }
    
    return {
      validFurniture,
      removedFurniture,
      splitFurniture: splitFurniture.length > 0 ? splitFurniture : undefined
    };
  }
} 