import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureDrag } from './hooks/useFurnitureDrag';
import { useFurnitureSelection } from './hooks/useFurnitureSelection';
import { useFurnitureKeyboard } from './hooks/useFurnitureKeyboard';
import FurnitureItem from './FurnitureItem';

interface PlacedFurnitureContainerProps {
  viewMode: '2D' | '3D';
  renderMode: 'solid' | 'wireframe';
  placedModules?: any[];
}

const PlacedFurnitureContainer: React.FC<PlacedFurnitureContainerProps> = ({
  viewMode,
  renderMode,
  placedModules: propPlacedModules
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  const storePlacedModules = useFurnitureStore(state => state.placedModules);
  const placedModules = propPlacedModules || storePlacedModules;
  const { activePopup } = useUIStore();
  
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 내경 공간의 시작 높이 계산
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
  
  // 받침대 설정에 따른 가구 시작 높이 계산
  let furnitureStartY: number;
  
  if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
    // 받침대 있음: 바닥재 + 받침대 높이
    furnitureStartY = mmToThreeUnits(floorFinishHeightMm + baseFrameHeightMm);
  } else if (spaceInfo.baseConfig.type === 'stand') {
    // 받침대 없음
    if (spaceInfo.baseConfig.placementType === 'float') {
      // 띄워서 배치: 바닥재 + 띄움 높이
      const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
      furnitureStartY = mmToThreeUnits(floorFinishHeightMm + floatHeightMm);
    } else {
      // 바닥에 배치: 바닥재만
      furnitureStartY = mmToThreeUnits(floorFinishHeightMm);
    }
  } else {
    // 기본값: 바닥재만
    furnitureStartY = mmToThreeUnits(floorFinishHeightMm);
  }

  // 커스텀 훅들 사용 (viewer 모드가 아닐 때만)
  const isViewerOnly = !!propPlacedModules;
  const selectionState = !isViewerOnly ? useFurnitureSelection() : { dragMode: false, handleFurnitureClick: () => {} };
  const dragHandlers = !isViewerOnly ? useFurnitureDrag({ 
    spaceInfo
  }) : {
    handlePointerDown: () => {},
    handlePointerMove: () => {},
    handlePointerUp: () => {},
    draggingModuleId: null
  };

  // 키보드 이벤트 훅 (스마트 건너뛰기 로직 사용)
  if (!isViewerOnly) {
    useFurnitureKeyboard({
      spaceInfo
    });
  }

  return (
    <group>
      {placedModules.map((placedModule) => {
        const isDragMode = selectionState.dragMode;
        const isEditMode = activePopup.type === 'furnitureEdit' && activePopup.id === placedModule.id;
        const isDraggingThis = dragHandlers.draggingModuleId === placedModule.id;

        return (
          <FurnitureItem
            key={placedModule.id}
            placedModule={placedModule}
            spaceInfo={spaceInfo}
            furnitureStartY={furnitureStartY}
            isDragMode={isDragMode}
            isEditMode={isEditMode}
            isDraggingThis={isDraggingThis}
            viewMode={viewMode}
            renderMode={renderMode}
            onPointerDown={dragHandlers.handlePointerDown}
            onPointerMove={dragHandlers.handlePointerMove}
            onPointerUp={dragHandlers.handlePointerUp}
            onDoubleClick={selectionState.handleFurnitureClick}
          />
        );
      })}
    </group>
  );
};

export default PlacedFurnitureContainer; 