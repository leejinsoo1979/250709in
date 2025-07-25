import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useFurnitureDrag } from './hooks/useFurnitureDrag';
import { useFurnitureSelection } from './hooks/useFurnitureSelection';
import { useFurnitureKeyboard } from './hooks/useFurnitureKeyboard';
import { useColumnDualSplitter } from '../../../hooks/useColumnDualSplitter';
import FurnitureItem from './FurnitureItem';

interface PlacedFurnitureContainerProps {
  viewMode: '2D' | '3D';
  renderMode: 'solid' | 'wireframe';
  placedModules?: any[]; // 뷰어 모드에서 사용할 가구 데이터
}

const PlacedFurnitureContainer: React.FC<PlacedFurnitureContainerProps> = ({
  viewMode,
  renderMode,
  placedModules: propsPlacedModules
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  const storePlacedModules = useFurnitureStore(state => state.placedModules);
  
  // props로 전달된 데이터가 있으면 사용하고, 없으면 스토어 데이터 사용
  const placedModules = propsPlacedModules || storePlacedModules;
  
  // 기둥 변화 감지하여 듀얼 가구 자동 분할
  useColumnDualSplitter();
  
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

  // 커스텀 훅들 사용
  const selectionState = useFurnitureSelection();
  const dragHandlers = useFurnitureDrag({ 
    spaceInfo
  });

  // 드래그 상태가 변경될 때마다 컴포넌트 리렌더링
  const forceRenderKey = dragHandlers.forceRender;

  // 키보드 이벤트 훅 (스마트 건너뛰기 로직 사용)
  useFurnitureKeyboard({
    spaceInfo
  });

  console.log('🔧 PlacedFurnitureContainer 렌더링:', {
    placedModulesCount: placedModules.length,
    placedModules: placedModules.map(m => ({ id: m.id, moduleId: m.moduleId, position: m.position }))
  });

  return (
    <group key={forceRenderKey}>
      {placedModules.map((placedModule) => {
        const isDragMode = selectionState.dragMode;
        const isEditMode = selectionState.editMode && selectionState.editingModuleId === placedModule.id;
        const isDraggingThis = dragHandlers.draggingModuleId === placedModule.id;

        console.log('🔧 가구 아이템 렌더링:', {
          id: placedModule.id,
          moduleId: placedModule.moduleId,
          position: placedModule.position
        });

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