import React from 'react';
import { SpaceInfo, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { SpaceCalculator, ColumnIndexer } from '@/editor/shared/utils/indexing';
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
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // zone에 따라 다른 도어 개수와 너비 계산
  let columnCount: number;
  let internalWidth: number;
  let isAutoMode = false;
  
  if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
    // 단내림 구간
    const frameThickness = 50;
    internalWidth = spaceInfo.droppedCeiling.width - frameThickness;
    const droppedLimits = SpaceCalculator.getColumnCountLimits(internalWidth);
    columnCount = spaceInfo.droppedCeilingDoorCount || droppedLimits.minColumns;
  } else {
    // 메인 구간
    if (spaceInfo.droppedCeiling?.enabled) {
      // 메인 구간의 내경폭 계산 (먼저 계산)
      const droppedCeilingWidth = spaceInfo.droppedCeiling.width || 900;
      internalWidth = internalSpace.width - droppedCeilingWidth;
      // 단내림이 활성화되면 mainDoorCount 사용, 없으면 메인 구간의 최소값 사용
      const mainLimits = SpaceCalculator.getColumnCountLimits(internalWidth);
      columnCount = spaceInfo.mainDoorCount || mainLimits.minColumns;
    } else {
      // 단내림이 비활성화되면 customColumnCount 사용
      columnCount = spaceInfo.customColumnCount || SpaceCalculator.getDefaultColumnCount(internalSpace.width);
      internalWidth = internalSpace.width;
    }
    
    // 자동 모드 체크
    isAutoMode = spaceInfo.droppedCeiling?.enabled 
      ? spaceInfo.mainDoorCount === undefined
      : spaceInfo.customColumnCount === undefined;
  }
  
  // 컬럼 제한 계산
  const columnLimits = SpaceCalculator.getColumnCountLimits(internalWidth);
  const currentColumnWidth = Math.floor(internalWidth / columnCount);
  
  const handleColumnCountChange = (newCount: number) => {
    if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      // 단내림 구간 도어 개수 변경
      onUpdate({ droppedCeilingDoorCount: newCount });
    } else {
      // 메인 구간 도어 개수 변경
      if (spaceInfo.droppedCeiling?.enabled) {
        onUpdate({ mainDoorCount: newCount });
      } else {
        onUpdate({ customColumnCount: newCount });
      }
    }
  };
  
  const handleResetColumnCount = () => {
    if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      // 단내림 구간은 리셋 시 최소값(1)으로
      onUpdate({ droppedCeilingDoorCount: 1 });
    } else {
      // 메인 구간은 자동 모드로
      if (spaceInfo.droppedCeiling?.enabled) {
        onUpdate({ mainDoorCount: undefined });
      } else {
        onUpdate({ customColumnCount: undefined });
      }
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