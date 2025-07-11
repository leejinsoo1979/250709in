import { useEffect } from 'react';
import { useFurnitureStore } from '@/store';
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
  const setEditMode = useFurnitureStore(state => state.setEditMode);
  const setEditingModuleId = useFurnitureStore(state => state.setEditingModuleId);
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);

  // 키보드 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editMode || !editingModuleId) return;
      
      const editingModule = placedModules.find(m => m.id === editingModuleId);
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
          removeModule(editingModuleId);
          setEditMode(false);
          setEditingModuleId(null);
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
            editingModuleId
          );
          
          if (nextSlot !== null) {
            let newX: number;
            if (isDualFurniture && indexing.threeUnitDualPositions) {
              newX = indexing.threeUnitDualPositions[nextSlot];
            } else {
              newX = indexing.threeUnitPositions[nextSlot];
            }
            moveModule(editingModuleId, { ...editingModule.position, x: newX });
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
            editingModuleId
          );
          
          if (nextSlot !== null) {
            let newX: number;
            if (isDualFurniture && indexing.threeUnitDualPositions) {
              newX = indexing.threeUnitDualPositions[nextSlot];
            } else {
              newX = indexing.threeUnitPositions[nextSlot];
            }
            moveModule(editingModuleId, { ...editingModule.position, x: newX });
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
    };
    
    if (editMode) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [editMode, editingModuleId, placedModules, indexing, removeModule, moveModule, internalSpace, spaceInfo, setEditMode, setEditingModuleId]);
}; 