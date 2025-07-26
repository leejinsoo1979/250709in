import React from 'react';
import { useThree } from '@react-three/fiber';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store';
import { useSlotOccupancy } from './useSlotOccupancy';
import { useDropPositioning } from './useDropPositioning';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { isSlotAvailable } from '../../utils/slotAvailability';
import { useAlert } from '@/hooks/useAlert';

export const useFurnitureDragHandlers = (spaceInfo: SpaceInfo) => {
  const addModule = useFurnitureStore(state => state.addModule);
  const placedModules = useFurnitureStore(state => state.placedModules);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { checkSlotOccupancy } = useSlotOccupancy(spaceInfo);
  const { calculateDropPosition, findAvailableSlot } = useDropPositioning(spaceInfo);
  const { showAlert, AlertComponent } = useAlert();
  
  // Three.js 컨텍스트 접근 (그림자 업데이트용)
  const { gl, invalidate } = useThree();

  // 기본 가구 깊이 계산 (가구별 defaultDepth 우선, 없으면 fallback)
  const getDefaultDepth = (moduleData?: ModuleData) => {
    if (moduleData?.defaultDepth) {
      return Math.min(moduleData.defaultDepth, spaceInfo.depth);
    }
    
    // 기존 fallback 로직
    const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
    return Math.min(spaceBasedDepth, 580);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = () => {
    // 드래그 리브 처리
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      const dragDataString = e.dataTransfer.getData('application/json');
      if (!dragDataString) return;
      
      const currentDragData = JSON.parse(dragDataString);
      
      if (currentDragData && currentDragData.type === 'furniture') {
        // 특수 듀얼 가구 체크 (바지걸이장, 스타일러장)
        const isSpecialDualFurniture = currentDragData.moduleData.id.includes('dual-2drawer-styler-') || 
                                     currentDragData.moduleData.id.includes('dual-4drawer-pantshanger-');
        
        const indexing = calculateSpaceIndexing(spaceInfo);
        
        // 특수 듀얼 가구이고 슬롯폭이 550mm 미만인 경우
        if (isSpecialDualFurniture && indexing.columnWidth < 550) {
          showAlert('슬롯갯수를 줄여주세요', { title: '배치 불가' });
          setFurniturePlacementMode(false);
          return;
        }
        
        // 드롭 위치 계산
        const dropPosition = calculateDropPosition(e, currentDragData);
        if (!dropPosition) return;

        let finalX = dropPosition.x;
        
        // 슬롯 사용 가능 여부 확인 - 기둥이 있어도 150mm 이상 공간이 있으면 배치 가능
        const isAvailable = isSlotAvailable(
          dropPosition.column,
          dropPosition.isDualFurniture,
          placedModules,
          spaceInfo,
          currentDragData.moduleData.id
        );
        
        // 사용 불가능하면 다음 사용 가능한 슬롯 찾기
        if (!isAvailable) {
          // isSlotAvailable을 사용하는 래퍼 함수
          const checkSlotWithColumn = (column: number, isDual: boolean) => {
            return !isSlotAvailable(column, isDual, placedModules, spaceInfo, currentDragData.moduleData.id);
          };
          
          const availableSlot = findAvailableSlot(
            dropPosition.column,
            dropPosition.isDualFurniture,
            indexing,
            checkSlotWithColumn,
            placedModules
          );
          
          if (!availableSlot) {
            return;
          }
          
          finalX = availableSlot.x;
        }
        
        // 고유 ID 생성
        const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // 가구 데이터 조회하여 기본 깊이 계산
        const internalSpace = calculateInternalSpace(spaceInfo);
        const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
        const customDepth = getDefaultDepth(moduleData);
        
        // 새 모듈 배치
        const newModule = {
          id: placedId,
          moduleId: currentDragData.moduleData.id,
          position: {
            x: finalX,
            y: 0,
            z: 0
          },
          rotation: 0,
          slotIndex: dropPosition.column, // 슬롯 인덱스 저장
          isDualSlot: dropPosition.isDualFurniture, // 듀얼 슬롯 여부 저장
          hasDoor: false, // 배치 시 항상 도어 없음 (오픈형)
          customDepth: customDepth // 가구별 기본 깊이 설정
        };
        
        addModule(newModule);
        
        // 가구 배치 후 그림자 업데이트 (강화된 접근)
        invalidate();
        
        // 3D 모드에서 그림자 강제 업데이트
        if (gl && gl.shadowMap) {
          gl.shadowMap.needsUpdate = true;
          
          // 여러 프레임에 걸쳐 강제 업데이트 (React 렌더링 완료 보장)
          requestAnimationFrame(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
              
              requestAnimationFrame(() => {
                if (gl && gl.shadowMap) {
                  gl.shadowMap.needsUpdate = true;
                  invalidate();
                  
                  // 추가 3번째 프레임에서도 업데이트 (완전한 렌더링 보장)
                  requestAnimationFrame(() => {
                    if (gl && gl.shadowMap) {
                      gl.shadowMap.needsUpdate = true;
                      invalidate();
                    }
                  });
                }
              });
            }
          });
          
          // 추가 타이머 기반 업데이트 (완전한 렌더링 보장)
          setTimeout(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          }, 100);
          
          setTimeout(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          }, 300);
          
          // 추가 지연 업데이트 (완전한 보장)
          setTimeout(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
    
    setFurniturePlacementMode(false);
  };

  return {
    handleDragOver,
    handleDragLeave,
    handleDrop,
    AlertComponent
  };
}; 