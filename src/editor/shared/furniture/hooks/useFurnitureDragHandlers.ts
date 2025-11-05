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
import { analyzeColumnSlots, calculateFurnitureBounds } from '../../utils/columnSlotProcessor';

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
        
        if (!moduleData) {
          console.error('❌ 모듈을 찾을 수 없음:', currentDragData.moduleData.id);
          return;
        }
        
        const customDepth = getDefaultDepth(moduleData);
        
        // 기둥 슬롯 정보 확인
        const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
        const targetSlotInfo = columnSlots[dropPosition.column];
        
        let adjustedWidth: number | undefined = undefined;
        let adjustedPosition = { x: finalX, y: 0, z: 0 };
        let adjustedDepth = customDepth;

        // 기둥이 있는 슬롯에 배치하는 경우
        if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
          const columnDepth = targetSlotInfo.column.depth;
          
          // Column C (300mm) 특별 처리
          if (targetSlotInfo.columnType === 'medium' && targetSlotInfo.allowMultipleFurniture && targetSlotInfo.subSlots) {
            // 듀얼 가구를 Column C 슬롯에 배치하는 경우 두 개의 싱글로 분할
            if (dropPosition.isDualFurniture) {
              // 왼쪽 싱글 캐비넷
              const leftModule = {
                id: `placed-left-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                moduleId: currentDragData.moduleData.id.replace('dual-', 'single-'),
                position: {
                  x: targetSlotInfo.subSlots.left.center,
                  y: 0,
                  z: 0
                },
                rotation: 0,
                slotIndex: dropPosition.column,
                subSlotPosition: 'left', // Column C 서브슬롯 위치
                isDualSlot: false,
                hasDoor: false,
                customDepth: getDefaultDepth(moduleData),
                adjustedWidth: targetSlotInfo.subSlots.left.availableWidth,
                zone: dropPosition.zone || 'normal' // 단내림 구역 정보 저장 (기본값: normal)
              };

              // 오른쪽 싱글 캐비넷
              const rightModule = {
                id: `placed-right-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                moduleId: currentDragData.moduleData.id.replace('dual-', 'single-'),
                position: {
                  x: targetSlotInfo.subSlots.right.center,
                  y: 0,
                  z: 0
                },
                rotation: 0,
                slotIndex: dropPosition.column,
                subSlotPosition: 'right', // Column C 서브슬롯 위치
                isDualSlot: false,
                hasDoor: false,
                customDepth: getDefaultDepth(moduleData),
                adjustedWidth: targetSlotInfo.subSlots.right.availableWidth,
                zone: dropPosition.zone || 'normal' // 단내림 구역 정보 저장 (기본값: normal)
              };
              
              // 두 개의 싱글 캐비넷 추가
              addModule(leftModule);
              addModule(rightModule);

              // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
              window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
              
              // 그림자 업데이트
              invalidate();
              if (gl && gl.shadowMap) {
                gl.shadowMap.needsUpdate = true;
              }
              
              setFurniturePlacementMode(false);
              return; // 추가 처리 방지
            }
            
            // 싱글 가구를 Column C 슬롯에 배치하는 경우
            // 빈 서브슬롯 찾기
            const existingModulesInSlot = placedModules.filter(m => 
              m.slotIndex === dropPosition.column
            );
            
            let targetSubSlot: 'left' | 'right' = 'left';
            if (existingModulesInSlot.some(m => m.subSlotPosition === 'left')) {
              targetSubSlot = 'right';
            }
            
            adjustedWidth = targetSlotInfo.subSlots[targetSubSlot].availableWidth;
            adjustedPosition.x = targetSlotInfo.subSlots[targetSubSlot].center;

            // 새 모듈 배치 (아래에서 처리됨)
          } else {
            // 일반 기둥 처리 (기존 로직)
            // 듀얼 가구는 기둥 슬롯에 배치 불가
            if (dropPosition.isDualFurniture) {
              return;
            }
            
            // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
            const slotWidthM = indexing.columnWidth * 0.01;
            const originalSlotBounds = {
              left: finalX - slotWidthM / 2,
              right: finalX + slotWidthM / 2,
              center: finalX
            };
            
            const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
            
            // 크기와 위치 조정
            adjustedWidth = furnitureBounds.renderWidth;
            adjustedPosition.x = furnitureBounds.center;

            // 공간이 부족한 경우 배치 취소
            if (adjustedWidth < 150) {
              return;
            }
            
            // Column C (300mm) 특별 처리 - 깊이 조정
            if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
              adjustedDepth = 730 - columnDepth; // 430mm
            }
          }
        }
        
        // 새 모듈 배치
        let newModuleData: any = {
          id: placedId,
          moduleId: currentDragData.moduleData.id,
          position: adjustedPosition,
          rotation: 0,
          slotIndex: dropPosition.column, // 슬롯 인덱스 저장
          isDualSlot: dropPosition.isDualFurniture, // 듀얼 슬롯 여부 저장
          hasDoor: false, // 배치 시 항상 도어 없음 (오픈형)
          customDepth: adjustedDepth, // 기둥에 따른 깊이 조정
          adjustedWidth: adjustedWidth, // 기둥에 따른 폭 조정
          zone: dropPosition.zone || 'normal' // 단내림 구역 정보 저장 (기본값: normal)
        };
        
        // Column C의 경우 서브슬롯 위치 추가
        if (targetSlotInfo && targetSlotInfo.columnType === 'medium' && targetSlotInfo.allowMultipleFurniture) {
          // 이미 Column C 처리 로직에서 서브슬롯이 설정된 경우
          const existingModulesInSlot = placedModules.filter(m => 
            m.slotIndex === dropPosition.column
          );
          
          if (existingModulesInSlot.some(m => m.subSlotPosition === 'left')) {
            newModuleData.subSlotPosition = 'right';
          } else {
            newModuleData.subSlotPosition = 'left';
          }
        }
        
        const newModule = newModuleData;

        // 엔드패널 + 가구 = 슬롯 너비 검증 (노서라운드 모드, 끝 슬롯)
        if (spaceInfo.surroundType === 'no-surround') {
          const lastSlotIndex = indexing.columnCount - 1;
          const isEndSlot = dropPosition.column === 0 || dropPosition.column === lastSlotIndex;
          const END_PANEL_THICKNESS = 18; // mm

          if (isEndSlot) {
            const wallConfig = spaceInfo.wallConfig || { left: true, right: true };
            const needsEndPanel = (dropPosition.column === 0 && !wallConfig.left) ||
                                  (dropPosition.column === lastSlotIndex && !wallConfig.right);

            if (needsEndPanel) {
              // 가구 너비 계산
              const furnitureWidth = adjustedWidth || indexing.columnWidth;
              const totalWidth = END_PANEL_THICKNESS + furnitureWidth;
              const expectedSlotWidth = indexing.columnWidth;

              // 1mm 허용 오차로 검증
              if (Math.abs(totalWidth - expectedSlotWidth) >= 1) {
                showAlert(
                  `엔드패널(${END_PANEL_THICKNESS}mm) + 가구(${furnitureWidth}mm) = ${totalWidth}mm\n슬롯 너비: ${expectedSlotWidth}mm\n차이: ${(totalWidth - expectedSlotWidth).toFixed(1)}mm`,
                  { title: '너비 불일치 경고' }
                );
              }
            }
          }
        }

        addModule(newModule);
        
        // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
        window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
        
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