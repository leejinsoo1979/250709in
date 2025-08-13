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
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
  renderMode: 'solid' | 'wireframe';
  placedModules?: any[];
  activeZone?: 'normal' | 'dropped';
  showFurniture?: boolean; // 가구 표시 여부 추가
}

const PlacedFurnitureContainer: React.FC<PlacedFurnitureContainerProps> = ({
  viewMode,
  view2DDirection,
  renderMode,
  placedModules: propPlacedModules,
  activeZone,
  showFurniture = true // 기본값 true
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  
  // spaceInfo 변경 감지 디버그
  React.useEffect(() => {
    console.log('🎯 PlacedFurnitureContainer - spaceInfo 변경:', {
      baseConfig: spaceInfo?.baseConfig,
      placementType: spaceInfo?.baseConfig?.placementType,
      floatHeight: spaceInfo?.baseConfig?.floatHeight
    });
  }, [spaceInfo?.baseConfig?.placementType, spaceInfo?.baseConfig?.floatHeight]);
  const storePlacedModules = useFurnitureStore(state => state.placedModules);
  // activeZone 필터링 제거 - 모든 가구 표시
  const placedModules = propPlacedModules || storePlacedModules;
  const { activePopup } = useUIStore();
  
  // activeZone 변경 감지
  React.useEffect(() => {
    console.log('🎯 PlacedFurnitureContainer - activeZone 변경:', {
      activeZone,
      placedModulesCount: placedModules.length,
      placedModules: placedModules.map(m => ({
        id: m.id,
        moduleId: m.moduleId,
        zone: m.zone,
        customWidth: m.customWidth,
        isDualSlot: m.isDualSlot
      }))
    });
  }, [activeZone]);
  
  // placedModules 변경 감지
  React.useEffect(() => {
    console.log('📦📦📦 PlacedFurnitureContainer - placedModules 변경:', {
      count: placedModules.length,
      modules: placedModules.map(m => ({
        id: m.id,
        moduleId: m.moduleId,
        position: m.position,
        slotIndex: m.slotIndex,
        zone: m.zone
      }))
    });
  }, [placedModules]);
  
  
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
      console.log('🔥 띄워서 배치 Y 위치 계산:', {
        placementType: spaceInfo.baseConfig.placementType,
        floatHeightMm,
        floorFinishHeightMm,
        furnitureStartY
      });
    } else {
      // 바닥에 배치: 바닥재만
      furnitureStartY = mmToThreeUnits(floorFinishHeightMm);
    }
  } else {
    // 기본값: 바닥재만
    furnitureStartY = mmToThreeUnits(floorFinishHeightMm);
  }

  // 커스텀 훅들 사용 - 조건부 호출 제거
  const isViewerOnly = !!propPlacedModules;
  
  console.log('🎮 PlacedFurnitureContainer 모드:', {
    isViewerOnly,
    propPlacedModules: !!propPlacedModules,
    propPlacedModulesLength: propPlacedModules?.length
  });
  
  // 항상 훅을 호출하되, 결과를 조건부로 사용
  const selectionStateFromHook = useFurnitureSelection();
  const dragHandlersFromHook = useFurnitureDrag({ spaceInfo });
  
  // 키보드 이벤트 훅 - 항상 호출
  useFurnitureKeyboard({ spaceInfo });
  
  // viewer 모드에 따라 실제 사용할 값 결정
  const selectionState = !isViewerOnly 
    ? selectionStateFromHook 
    : { dragMode: false, handleFurnitureClick: () => {} };
    
  const dragHandlers = !isViewerOnly 
    ? dragHandlersFromHook 
    : {
        handlePointerDown: () => {},
        handlePointerMove: () => {},
        handlePointerUp: () => {},
        draggingModuleId: null
      };

  return (
    <group>
      {placedModules.map((placedModule) => {
        const isDragMode = selectionState.dragMode;
        const isEditMode = activePopup.type === 'furnitureEdit' && activePopup.id === placedModule.id;
        const isDraggingThis = dragHandlers.draggingModuleId === placedModule.id;

        return (
          <FurnitureItem
            key={`${placedModule.id}-${spaceInfo.columns?.map(c => `${c.id}-${c.position[0]}`).join('-') || 'no-columns'}-${spaceInfo.baseConfig?.placementType || 'ground'}-${spaceInfo.baseConfig?.floatHeight || 0}`}
            placedModule={placedModule}
            placedModules={placedModules}
            spaceInfo={spaceInfo}
            furnitureStartY={furnitureStartY}
            isDragMode={isDragMode}
            isEditMode={isEditMode}
            isDraggingThis={isDraggingThis}
            viewMode={viewMode}
            view2DDirection={view2DDirection}
            renderMode={renderMode}
            onPointerDown={dragHandlers.handlePointerDown}
            onPointerMove={dragHandlers.handlePointerMove}
            onPointerUp={dragHandlers.handlePointerUp}
            onDoubleClick={selectionState.handleFurnitureClick}
            showFurniture={showFurniture} // 가구 표시 여부 전달
          />
        );
      })}
    </group>
  );
};

export default PlacedFurnitureContainer; 