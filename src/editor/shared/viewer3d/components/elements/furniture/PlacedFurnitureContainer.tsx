import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
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
  showFurniture?: boolean;
  readOnly?: boolean; // 읽기 전용 모드 (viewer 권한)
  onFurnitureClick?: (furnitureId: string, slotIndex: number) => void; // 가구 클릭 콜백 (미리보기용)
  ghostHighlightSlotIndex?: number | null;
}

const PlacedFurnitureContainer: React.FC<PlacedFurnitureContainerProps> = ({
  viewMode,
  view2DDirection,
  renderMode,
  placedModules: propPlacedModules,
  activeZone: _activeZone, // eslint-disable-line @typescript-eslint/no-unused-vars
  showFurniture,
  readOnly = false,
  onFurnitureClick,
  ghostHighlightSlotIndex
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  const storePlacedModules = useFurnitureStore(state => state.placedModules);
  const { activePopup, view2DDirection: contextView2DDirection, selectedSlotIndex } = useUIStore();
  const { zones } = useDerivedSpaceStore();

  // 슬롯 필터링 적용
  let basePlacedModules = propPlacedModules || storePlacedModules;

  // 측면뷰이고 selectedSlotIndex가 있는 경우 필터링
  const finalView2DDirection = view2DDirection || contextView2DDirection;

  if (
    viewMode === '2D' &&
    (finalView2DDirection === 'left' || finalView2DDirection === 'right') &&
    selectedSlotIndex !== null
  ) {
    // 단내림 구간 정보 - derivedSpaceStore에서 가져옴
    const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
    const normalSlotCount = zones?.normal?.columnCount || (spaceInfo.customColumnCount || 4);

    basePlacedModules = basePlacedModules.filter(module => {
      if (module.slotIndex === undefined) return false;

      // module.slotIndex는 zone 내 로컬 인덱스
      // selectedSlotIndex는 글로벌 인덱스
      // 글로벌 인덱스로 변환하여 비교해야 함
      let moduleGlobalSlotIndex = module.slotIndex;

      // zone이 명시적으로 'dropped'이거나, zone이 없지만 X 위치로 단내림 구간으로 판별
      let isInDroppedZone = module.zone === 'dropped';

      // zone이 설정되지 않은 경우 X 위치로 판별
      if (hasDroppedCeiling && !isInDroppedZone && zones?.dropped && zones?.normal) {
        const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
        const moduleXMm = module.position.x * 100; // Three.js 좌표를 mm로 변환

        // 내경 너비에서 단내림/일반 영역 경계 계산
        const normalWidth = zones.normal.width;
        const droppedWidth = zones.dropped.width;

        if (droppedPosition === 'left') {
          // 단내림이 왼쪽: 0 ~ droppedWidth가 단내림 영역
          isInDroppedZone = moduleXMm < droppedWidth;
        } else {
          // 단내림이 오른쪽: normalWidth ~ (normalWidth + droppedWidth)가 단내림 영역
          isInDroppedZone = moduleXMm >= normalWidth;
        }

      }

      if (hasDroppedCeiling && isInDroppedZone) {
        // 단내림 구간 가구: 로컬 인덱스 + normalSlotCount = 글로벌 인덱스
        moduleGlobalSlotIndex = normalSlotCount + module.slotIndex;
      }

      const isMatch = module.isDualSlot
        ? (moduleGlobalSlotIndex === selectedSlotIndex || moduleGlobalSlotIndex + 1 === selectedSlotIndex)
        : (moduleGlobalSlotIndex === selectedSlotIndex);

      return isMatch;
    });

  }

  const placedModules = basePlacedModules;

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 내경 공간의 시작 높이 계산
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
  
  // 받침대 설정에 따른 가구 시작 높이 계산
  let furnitureStartY: number;
  
  if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
    // 받침대 있음: baseConfig.height가 이미 바닥마감재 높이를 포함하므로
    // floorFinishHeight를 별도로 더하면 이중 가산됨
    furnitureStartY = mmToThreeUnits(baseFrameHeightMm);
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
  const selectionStateFromHook = useFurnitureSelection({ readOnly });
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

  // 좌/우측 뷰에서는 해당 측면에 가장 가까운 슬롯의 모든 가구 필터링
  // 단, selectedSlotIndex가 이미 설정되어 있으면 그 필터링을 우선함
  const filteredModules = React.useMemo(() => {
    // selectedSlotIndex로 이미 필터링된 경우, X좌표 필터링 건너뜀
    if (selectedSlotIndex !== null) {
      return placedModules;
    }

    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      if (placedModules.length === 0) return [];

      if (view2DDirection === 'left') {
        // 가장 왼쪽 X 좌표 찾기
        const leftmostX = placedModules.reduce((min, module) =>
          Math.min(min, module.position.x), Infinity
        );
        // 같은 X 좌표의 모든 가구 반환 (상부장, 하부장 등)
        return placedModules.filter(module =>
          Math.abs(module.position.x - leftmostX) < 0.01 // 부동소수점 오차 허용
        );
      } else {
        // 가장 오른쪽 X 좌표 찾기
        const rightmostX = placedModules.reduce((max, module) =>
          Math.max(max, module.position.x), -Infinity
        );
        // 같은 X 좌표의 모든 가구 반환 (상부장, 하부장 등)
        return placedModules.filter(module =>
          Math.abs(module.position.x - rightmostX) < 0.01 // 부동소수점 오차 허용
        );
      }
    }
    return placedModules;
  }, [placedModules, viewMode, view2DDirection, selectedSlotIndex]);
  
  return (
    <group name="FurnitureContainer">
      {filteredModules.map((placedModule) => {
        const isDragMode = selectionState.dragMode;
        const isEditMode = activePopup.type === 'furnitureEdit' && activePopup.id === placedModule.id;
        const isDraggingThis = dragHandlers.draggingModuleId === placedModule.id;

        // 좌측뷰/우측뷰에서는 선택된 가구를 X=0에 렌더링
        const adjustedModule = (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right'))
          ? { ...placedModule, position: { ...placedModule.position, x: 0 } }
          : placedModule;

        return (
          <FurnitureItem
            key={placedModule.id}
            placedModule={adjustedModule}
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
            showFurniture={showFurniture}
            readOnly={readOnly}
            onFurnitureClick={onFurnitureClick}
            ghostHighlightSlotIndex={ghostHighlightSlotIndex}
          />
        );
      })}
    </group>
  );
};

export default PlacedFurnitureContainer; 
