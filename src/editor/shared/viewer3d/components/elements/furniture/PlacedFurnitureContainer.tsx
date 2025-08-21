import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureDrag } from './hooks/useFurnitureDrag';
import { useFurnitureSelection } from './hooks/useFurnitureSelection';
import { useFurnitureKeyboard } from './hooks/useFurnitureKeyboard';
import FurnitureItem from './FurnitureItem';
import BackPanelBetweenCabinets from './BackPanelBetweenCabinets';
import UpperCabinetIndirectLight from './UpperCabinetIndirectLight';

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
  // 바닥마감재는 받침대 높이에 영향을 주지만, 가구 위치는 변하지 않음
  let furnitureStartY: number;
  
  if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
    // 받침대 있음: 받침대의 원래 높이 사용 (바닥마감재 높이는 포함하지 않음)
    // 가구는 항상 받침대 위에 위치
    furnitureStartY = mmToThreeUnits(baseFrameHeightMm);
  } else if (spaceInfo.baseConfig.type === 'stand') {
    // 받침대 없음
    if (spaceInfo.baseConfig.placementType === 'float') {
      // 띄워서 배치: 띄움 높이만 사용
      const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
      furnitureStartY = mmToThreeUnits(floatHeightMm);
      console.log('🔥 띄워서 배치 Y 위치 계산:', {
        placementType: spaceInfo.baseConfig.placementType,
        floatHeightMm,
        furnitureStartY
      });
    } else {
      // 바닥에 배치: 0
      furnitureStartY = 0;
    }
  } else {
    // 기본값: 0
    furnitureStartY = 0;
  }
  
  // furnitureStartY 디버깅
  console.log('📍📍📍 PlacedFurnitureContainer - furnitureStartY 계산:', {
    baseConfig: spaceInfo.baseConfig,
    floorFinishHeightMm,
    baseFrameHeightMm,
    furnitureStartY,
    furnitureStartY_mm: furnitureStartY / 0.01,
    설명: '하부장 시작 Y 위치'
  });

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
      {/* 상부장 간접조명 렌더링 (연속된 하나의 조명) */}
      {spaceInfo && (
        <UpperCabinetIndirectLight 
          placedModules={placedModules}
          spaceInfo={spaceInfo}
        />
      )}
      
      {/* 상하부장 사이의 백패널 렌더링 */}
      {spaceInfo && (
        <BackPanelBetweenCabinets 
          placedModules={placedModules}
          spaceInfo={spaceInfo}
        />
      )}
      
      {/* 간접조명 - 상부장과 띄워서 배치 모두 통합 렌더링 */}
      {viewMode === '3D' && spaceInfo && (
        <UpperCabinetIndirectLight 
          placedModules={placedModules}
          spaceInfo={spaceInfo}
        />
      )}
      
      {/* 개별 가구 렌더링 */}
      {placedModules.map((placedModule) => {
        const isDragMode = selectionState.dragMode;
        const isEditMode = activePopup.type === 'furnitureEdit' && activePopup.id === placedModule.id;
        const isDraggingThis = dragHandlers.draggingModuleId === placedModule.id;

        return (
          <FurnitureItem
            key={`${placedModule.id}-${spaceInfo.columns?.map(c => `${c.id}-${c.position[0]}`).join('-') || 'no-columns'}-${spaceInfo.baseConfig?.placementType || 'ground'}-${spaceInfo.baseConfig?.floatHeight || 0}-${(placedModule as any)._lastYUpdate || 0}`}
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