import { useEffect } from 'react';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';

interface UseFurnitureKeyboardProps {
  spaceInfo: SpaceInfo;
}

export const useFurnitureKeyboard = ({
  spaceInfo
}: UseFurnitureKeyboardProps) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const moveModule = useFurnitureStore(state => state.moveModule);
  const editMode = useFurnitureStore(state => state.editMode);
  const editingModuleId = useFurnitureStore(state => state.editingModuleId);
  const selectedPlacedModuleId = useFurnitureStore(state => state.selectedPlacedModuleId);
  const setEditMode = useFurnitureStore(state => state.setEditMode);
  const setEditingModuleId = useFurnitureStore(state => state.setEditingModuleId);
  
  // UI Store에서 활성 팝업 정보 가져오기
  const { activePopup } = useUIStore();
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);

  // 키보드 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 편집 모드이거나 가구 편집 팝업이 열린 상태일 때 처리
      const targetModuleId = editingModuleId || (activePopup.type === 'furnitureEdit' ? activePopup.id : null);
      
      if ((editMode && editingModuleId) || (activePopup.type === 'furnitureEdit' && activePopup.id)) {
        const editingModule = placedModules.find(m => m.id === targetModuleId);
        if (!editingModule) return;
        
        // 편집 중인 가구의 데이터 가져오기
        const moduleData = getModuleById(editingModule.moduleId, internalSpace, spaceInfo);
        if (!moduleData) return;
        
        // 듀얼/싱글 가구 판별
        const columnWidth = indexing.columnWidth;
        const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
        
        let currentSlotIndex = -1;
        
        if (isDualFurniture) {
          // 듀얼 가구: threeUnitDualPositions에서 슬롯 찾기
          if (indexing.threeUnitDualPositions) {
            currentSlotIndex = indexing.threeUnitDualPositions.findIndex(pos => 
              Math.abs(pos - editingModule.position.x) < 0.1
            );
          }
        } else {
          // 싱글 가구: threeUnitPositions에서 슬롯 찾기
          currentSlotIndex = indexing.threeUnitPositions.findIndex(pos => 
            Math.abs(pos - editingModule.position.x) < 0.1
          );
        }
        
        if (currentSlotIndex === -1) {
          return;
        }
        
        switch (e.key) {
          case 'Delete':
          case 'Backspace':
            // 팝업 모드에서는 삭제 비활성화 (편집 모드에서만 허용)
            if (editMode && editingModuleId) {
              removeModule(targetModuleId);
              setEditMode(false);
              setEditingModuleId(null);
            }
            e.preventDefault();
            break;
            
          case 'ArrowLeft': {
            // 스마트 건너뛰기: 왼쪽으로 다음 사용 가능한 슬롯 찾기
            const nextSlot = findNextAvailableSlot(
              currentSlotIndex, 
              'left', 
              isDualFurniture, 
              placedModules, 
              spaceInfo, 
              targetModuleId
            );
            
            if (nextSlot !== null) {
              let newX: number;
              if (isDualFurniture && indexing.threeUnitDualPositions) {
                newX = indexing.threeUnitDualPositions[nextSlot];
              } else {
                newX = indexing.threeUnitPositions[nextSlot];
              }
              console.log('⌨️ 키보드로 가구 이동:', { 
                moduleId: targetModuleId, 
                direction: 'left', 
                oldX: editingModule.position.x, 
                newX,
                slotIndex: currentSlotIndex,
                nextSlot
              });
              moveModule(targetModuleId, { ...editingModule.position, x: newX });
            }
            // 이동할 수 없는 경우 현재 위치 유지 (아무 작업 안함)
            e.preventDefault();
            break;
          }
            
          case 'ArrowRight': {
            // 스마트 건너뛰기: 오른쪽으로 다음 사용 가능한 슬롯 찾기
            const nextSlot = findNextAvailableSlot(
              currentSlotIndex, 
              'right', 
              isDualFurniture, 
              placedModules, 
              spaceInfo, 
              targetModuleId
            );
            
            if (nextSlot !== null) {
              let newX: number;
              if (isDualFurniture && indexing.threeUnitDualPositions) {
                newX = indexing.threeUnitDualPositions[nextSlot];
              } else {
                newX = indexing.threeUnitPositions[nextSlot];
              }
              moveModule(targetModuleId, { ...editingModule.position, x: newX });
            }
            // 이동할 수 없는 경우 현재 위치 유지 (아무 작업 안함)
            e.preventDefault();
            break;
          }
            
          case 'Escape':
            setEditMode(false);
            setEditingModuleId(null);
            e.preventDefault();
            break;
            
          case 'Enter':
            setEditMode(false);
            setEditingModuleId(null);
            e.preventDefault();
            break;
        }
      } else {
        // 편집 모드가 아닐 때의 처리 (선택된 가구 삭제)
        switch (e.key) {
          case 'Delete':
          case 'Backspace':
            // 선택된 가구가 있으면 삭제
            if (selectedPlacedModuleId) {
              removeModule(selectedPlacedModuleId);
              e.preventDefault();
            }
            break;
        }
      }
    };
    
    // 편집 모드가 아니어도 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editMode, editingModuleId, selectedPlacedModuleId, placedModules, indexing, removeModule, moveModule, internalSpace, spaceInfo, setEditMode, setEditingModuleId]);
}; 