import React from 'react';
import { useThree } from '@react-three/fiber';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { useDropPositioning } from './useDropPositioning';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { isSlotAvailable } from '../../utils/slotAvailability';
import { useAlert } from '@/hooks/useAlert';
import { placeFurnitureAtSlot, getDefaultFurnitureDepth } from './usePlaceFurnitureAtSlot';
import { analyzeColumnSlots } from '../../utils/columnSlotProcessor';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { v4 as uuidv4 } from 'uuid';

export const useFurnitureDragHandlers = (spaceInfo: SpaceInfo) => {
  const addModule = useFurnitureStore(state => state.addModule);
  const placedModules = useFurnitureStore(state => state.placedModules);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { calculateDropPosition, findAvailableSlot } = useDropPositioning(spaceInfo);
  const { showAlert, AlertComponent } = useAlert();
  const pendingPlacement = useMyCabinetStore(state => state.pendingPlacement);

  // Three.js 컨텍스트 접근 (그림자 업데이트용)
  const { gl, invalidate } = useThree();

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

        // 드롭 위치 계산 (존 정보 필요)
        const dropPosition = calculateDropPosition(e, currentDragData);
        if (!dropPosition) return;

        // 특수 듀얼 가구 검증 — 해당 존의 실제 슬롯 폭 기준
        if (isSpecialDualFurniture) {
          let checkSlotWidth = indexing.columnWidth;
          if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            if (dropPosition.zone === 'dropped' && zoneInfo.dropped) {
              checkSlotWidth = zoneInfo.dropped.columnWidth;
            } else {
              checkSlotWidth = zoneInfo.normal.columnWidth;
            }
          }

          // 싱글 슬롯 525mm 미만이면 배치 불가
          if (checkSlotWidth < 525) {
            showAlert('본 가구는 슬롯 폭이 525mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
            setFurniturePlacementMode(false);
            return;
          }

          // 2슬롯 합 1050mm 미만이면 배치 불가
          if (checkSlotWidth * 2 < 1050) {
            showAlert('본 가구는 슬롯 2개의 합이 1050mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
            setFurniturePlacementMode(false);
            return;
          }
        }

        console.log('🟢🟢🟢 dropPosition 확인:', {
          column: dropPosition.column,
          zone: dropPosition.zone,
          isDualFurniture: dropPosition.isDualFurniture,
          x: dropPosition.x,
          단내림활성화: spaceInfo.droppedCeiling?.enabled,
          단내림높이: spaceInfo.droppedCeiling?.height,
          전체높이: spaceInfo.height
        });

        // 슬롯 사용 가능 여부 확인 (zone 전달 — 단내림 시 필수)
        const isAvailable = isSlotAvailable(
          dropPosition.column,
          dropPosition.isDualFurniture,
          placedModules,
          spaceInfo,
          currentDragData.moduleData.id,
          undefined,
          dropPosition.zone
        );

        let targetSlotIndex = dropPosition.column;

        // 사용 불가능하면 다음 사용 가능한 슬롯 찾기
        if (!isAvailable) {
          const checkSlotWithColumn = (column: number, isDual: boolean) => {
            return !isSlotAvailable(column, isDual, placedModules, spaceInfo, currentDragData.moduleData.id, undefined, dropPosition.zone);
          };

          const availableSlot = findAvailableSlot(
            dropPosition.column,
            dropPosition.isDualFurniture,
            indexing,
            checkSlotWithColumn,
            placedModules
          );

          if (!availableSlot) {
            setFurniturePlacementMode(false);
            return;
          }

          targetSlotIndex = availableSlot.column;
        }

        // 기둥 슬롯 정보 확인 (Column C 특별 처리용)
        const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
        const targetSlotInfo = columnSlots[targetSlotIndex];

        // Column C (300mm) 특별 처리 - 듀얼 가구를 두 개의 싱글로 분할
        if (targetSlotInfo && targetSlotInfo.columnType === 'medium' &&
            targetSlotInfo.allowMultipleFurniture && targetSlotInfo.subSlots &&
            dropPosition.isDualFurniture) {

          const internalSpace = calculateInternalSpace(spaceInfo);
          const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);

          if (moduleData) {
            const singleModuleId = currentDragData.moduleData.id.replace('dual-', 'single-');
            const singleBaseType = singleModuleId.replace(/-[\d.]+$/, '');
            const customDepth = getDefaultFurnitureDepth(spaceInfo, moduleData);

            // 왼쪽 싱글 캐비넷
            const leftModule = {
              id: uuidv4(),
              moduleId: singleModuleId,
              baseModuleType: singleBaseType,
              position: {
                x: targetSlotInfo.subSlots.left.center,
                y: 0,
                z: 0
              },
              rotation: 0,
              slotIndex: targetSlotIndex,
              subSlotPosition: 'left' as const,
              isDualSlot: false,
              hasDoor: useUIStore.getState().doorInstallIntent,
              customDepth: customDepth,
              adjustedWidth: targetSlotInfo.subSlots.left.availableWidth,
              zone: dropPosition.zone || 'normal'
            };

            // 오른쪽 싱글 캐비넷
            const rightModule = {
              id: uuidv4(),
              moduleId: singleModuleId,
              baseModuleType: singleBaseType,
              position: {
                x: targetSlotInfo.subSlots.right.center,
                y: 0,
                z: 0
              },
              rotation: 0,
              slotIndex: targetSlotIndex,
              subSlotPosition: 'right' as const,
              isDualSlot: false,
              hasDoor: useUIStore.getState().doorInstallIntent,
              customDepth: customDepth,
              adjustedWidth: targetSlotInfo.subSlots.right.availableWidth,
              zone: dropPosition.zone || 'normal'
            };

            addModule(leftModule);
            addModule(rightModule);

            // 가구 배치 완료 이벤트 발생
            window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
            updateShadows();
            setFurniturePlacementMode(false);
            return;
          }
        }

        // ★★★ 공통 배치 함수 사용 (클릭+고스트 방식과 동일) ★★★
        const result = placeFurnitureAtSlot({
          moduleId: currentDragData.moduleData.id,
          slotIndex: targetSlotIndex,
          zone: dropPosition.zone,
          spaceInfo,
          pendingPlacement
        });

        if (!result.success) {
          console.error('❌ 가구 배치 실패:', result.error);
          setFurniturePlacementMode(false);
          return;
        }

        if (result.module) {
          // Column C 싱글 가구 처리 - 서브슬롯 위치 추가
          if (targetSlotInfo && targetSlotInfo.columnType === 'medium' &&
              targetSlotInfo.allowMultipleFurniture && !dropPosition.isDualFurniture) {
            const existingModulesInSlot = placedModules.filter(m =>
              m.slotIndex === targetSlotIndex
            );

            if (existingModulesInSlot.some(m => m.subSlotPosition === 'left')) {
              result.module.subSlotPosition = 'right';
            } else {
              result.module.subSlotPosition = 'left';
            }
          }

          addModule(result.module);
        }

        // 가구 배치 완료 이벤트 발생
        window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
        updateShadows();
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }

    setFurniturePlacementMode(false);
  };

  // 그림자 업데이트 헬퍼 함수
  const updateShadows = () => {
    invalidate();

    if (gl && gl.shadowMap) {
      gl.shadowMap.needsUpdate = true;

      requestAnimationFrame(() => {
        if (gl && gl.shadowMap) {
          gl.shadowMap.needsUpdate = true;
          invalidate();

          requestAnimationFrame(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          });
        }
      });

      setTimeout(() => {
        if (gl && gl.shadowMap) {
          gl.shadowMap.needsUpdate = true;
          invalidate();
        }
      }, 100);
    }
  };

  return {
    handleDragOver,
    handleDragLeave,
    handleDrop,
    AlertComponent
  };
};
