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
}

const PlacedFurnitureContainer: React.FC<PlacedFurnitureContainerProps> = ({
  viewMode,
  view2DDirection,
  renderMode,
  placedModules: propPlacedModules,
  activeZone
}) => {
  const { spaceInfo } = useSpaceConfigStore();
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
    console.log('📦 PlacedFurnitureContainer - placedModules 변경:', {
      count: placedModules.length,
      modules: placedModules.map(m => ({
        id: m.id,
        slotIndex: m.slotIndex,
        position: m.position.x.toFixed(3)
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

  console.log('🔥🔥 PlacedFurnitureContainer 렌더링 시작:', {
    가구개수: placedModules.length,
    가구IDs: placedModules.map(m => m.id),
    가구상세: placedModules.map(m => ({
      id: m.id,
      slotIndex: m.slotIndex,
      position: m.position.x.toFixed(3)
    }))
  });

  return (
    <group>
      {placedModules.map((placedModule, index) => {
        const isDragMode = selectionState.dragMode;
        const isEditMode = activePopup.type === 'furnitureEdit' && activePopup.id === placedModule.id;
        const isDraggingThis = dragHandlers.draggingModuleId === placedModule.id;

        console.log(`🎯 FurnitureItem ${index} 생성:`, {
          id: placedModule.id,
          key: placedModule.id,
          slotIndex: placedModule.slotIndex
        });

        return (
          <FurnitureItem
            key={placedModule.id}
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
          />
        );
      })}
    </group>
  );
};

export default React.memo(PlacedFurnitureContainer, (prevProps, nextProps) => {
  // props가 실제로 변경되었을 때만 리렌더링
  return (
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.view2DDirection === nextProps.view2DDirection &&
    prevProps.renderMode === nextProps.renderMode &&
    prevProps.activeZone === nextProps.activeZone &&
    prevProps.placedModules === nextProps.placedModules
  );
}); 