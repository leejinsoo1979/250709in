import React from 'react';
import { SpaceInfo, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
import { SpaceCalculator, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import ColumnCountControls from '../customization/components/ColumnCountControls';

interface ColumnCountControlsWrapperProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  zone?: 'main' | 'dropped';
}

const ColumnCountControlsWrapper: React.FC<ColumnCountControlsWrapperProps> = ({
  spaceInfo,
  onUpdate,
  zone = 'main'
}) => {
  // 뷰어와 동일한 계산 방식 사용
  const calculatedInternalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
  
  // zone에 따라 다른 도어 개수와 너비 계산
  let columnCount: number;
  let internalWidth: number;
  let isAutoMode = false;
  
  if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
    // 단내림 구간
    const frameThickness = 50;
    internalWidth = spaceInfo.droppedCeiling.width - frameThickness;
    // 단내림 구간도 getDefaultColumnCount 사용
    columnCount = spaceInfo.droppedCeilingDoorCount || SpaceCalculator.getDefaultColumnCount(internalWidth);
  } else {
    // 메인 구간 - ColumnIndexer와 동일한 우선순위 적용
    internalWidth = calculatedInternalWidth;
    
    // mainDoorCount가 설정되어 있으면 최우선 사용 (4분할 창 등)
    if (spaceInfo.mainDoorCount !== undefined && spaceInfo.mainDoorCount > 0) {
      columnCount = spaceInfo.mainDoorCount;
    } else if (spaceInfo.customColumnCount) {
      // 사용자 지정 컬럼 수가 있으면 사용
      columnCount = spaceInfo.customColumnCount;
    } else {
      // 기본 자동 계산 로직
      columnCount = SpaceCalculator.getDefaultColumnCount(internalWidth);
    }
    
    // 자동 모드 체크 - mainDoorCount와 customColumnCount 모두 없을 때만 자동
    isAutoMode = spaceInfo.mainDoorCount === undefined && spaceInfo.customColumnCount === undefined;
  }
  
  // 컬럼 제한 계산
  const columnLimits = SpaceCalculator.getColumnCountLimits(internalWidth);
  // 소수점 1자리까지 정확히 계산
  const currentColumnWidth = Math.round((internalWidth / columnCount) * 10) / 10;
  
  const { placedModules, clearAllModules } = useFurnitureStore();

  // 슬롯 배치 가구(비자유배치)가 있는지 확인
  const hasSlotPlacedFurniture = placedModules.some(m => !m.isFreePlacement);

  const handleColumnCountChange = (newCount: number) => {
    if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      // 단내림 구간 도어 개수 변경
      onUpdate({ droppedCeilingDoorCount: newCount });
    } else {
      // 슬롯 배치 가구가 있으면 확인 팝업
      if (hasSlotPlacedFurniture) {
        if (!window.confirm('슬롯 수를 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) {
          return;
        }
        clearAllModules();
      }

      const updates: Partial<SpaceInfo> = {
        customColumnCount: newCount,
        mainDoorCount: undefined,
      };
      onUpdate(updates);
    }
  };
  
  const handleResetColumnCount = () => {
    if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      // 단내림 구간은 리셋 시 최소값(1)으로
      onUpdate({ droppedCeilingDoorCount: 1 });
    } else {
      if (hasSlotPlacedFurniture) {
        if (!window.confirm('슬롯 수를 초기화하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) {
          return;
        }
        clearAllModules();
      }
      onUpdate({
        mainDoorCount: undefined,
        customColumnCount: undefined
      });
    }
  };
  
  return (
    <ColumnCountControls
      columnCount={columnCount}
      internalWidth={internalWidth}
      columnLimits={columnLimits}
      currentColumnWidth={currentColumnWidth}
      isAutoMode={isAutoMode}
      onColumnCountChange={handleColumnCountChange}
      onResetColumnCount={handleResetColumnCount}
      disabled={false}
    />
  );
};

export default ColumnCountControlsWrapper;