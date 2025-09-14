import React from 'react';
import { SpaceInfo, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
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
  const currentColumnWidth = Math.floor(internalWidth / columnCount);
  
  const handleColumnCountChange = (newCount: number) => {
    if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      // 단내림 구간 도어 개수 변경
      onUpdate({ droppedCeilingDoorCount: newCount });
    } else {
      // 메인 구간 - mainDoorCount가 있으면 mainDoorCount, 없으면 customColumnCount 업데이트
      if (spaceInfo.mainDoorCount !== undefined) {
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
      // 메인 구간은 자동 모드로 - mainDoorCount와 customColumnCount 모두 undefined로
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