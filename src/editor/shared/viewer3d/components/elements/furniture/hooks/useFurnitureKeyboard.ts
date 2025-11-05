import { useEffect } from 'react';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';

interface UseFurnitureKeyboardProps {
  spaceInfo: SpaceInfo;
}

export const useFurnitureKeyboard = ({
  spaceInfo
}: UseFurnitureKeyboardProps) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const moveModule = useFurnitureStore(state => state.moveModule);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
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
      const activeElement = document.activeElement as HTMLElement | null;
      const isEditingInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);

      if (isEditingInput) {
        return;
      }

      // 편집 모드이거나 가구 편집 팝업이 열린 상태일 때 처리
      const targetModuleId = editingModuleId || (activePopup.type === 'furnitureEdit' ? activePopup.id : null);

      if ((editMode && editingModuleId) || (activePopup.type === 'furnitureEdit' && activePopup.id)) {
        const editingModule = placedModules.find(m => m.id === targetModuleId);
        if (!editingModule) return;
        
        // 편집 중인 가구의 데이터 가져오기
        const moduleData = getModuleById(editingModule.moduleId, internalSpace, spaceInfo);
        if (!moduleData) return;
        
        // 단내림 모드일 때는 zone별 position 배열 사용
        const moduleZone = editingModule.zone || 'normal';
        let positionsToSearch: number[] | undefined;
        let dualPositionsToSearch: number[] | undefined;
        let columnWidth: number;

        if (indexing.zones && spaceInfo.droppedCeiling?.enabled) {
          const zoneInfo = moduleZone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
          if (zoneInfo) {
            positionsToSearch = zoneInfo.threeUnitPositions;
            dualPositionsToSearch = zoneInfo.threeUnitDualPositions;
            columnWidth = zoneInfo.columnWidth;
          } else {
            columnWidth = indexing.columnWidth;
          }
        } else {
          positionsToSearch = indexing.threeUnitPositions;
          dualPositionsToSearch = indexing.threeUnitDualPositions;
          columnWidth = indexing.columnWidth;
        }

        // 듀얼/싱글 가구 판별 - moduleId로 직접 확인 (width는 변경될 수 있음)
        const isDualFurniture = editingModule.moduleId.includes('dual-');

        console.log('🔍 [useFurnitureKeyboard] 가구 타입 판별:', {
          moduleZone,
          columnWidth,
          furnitureWidth: moduleData.dimensions.width,
          isDualFurniture,
          hasZones: !!indexing.zones
        });

        let currentSlotIndex = -1;

        if (isDualFurniture) {
          // 듀얼 가구: threeUnitDualPositions에서 슬롯 찾기
          if (dualPositionsToSearch) {
            currentSlotIndex = dualPositionsToSearch.findIndex(pos =>
              Math.abs(pos - editingModule.position.x) < 0.1
            );
          }
        } else {
          // 싱글 가구: threeUnitPositions에서 슬롯 찾기
          if (positionsToSearch) {
            currentSlotIndex = positionsToSearch.findIndex(pos =>
              Math.abs(pos - editingModule.position.x) < 0.1
            );
          }
        }

        console.log('🔍 [useFurnitureKeyboard] 슬롯 인덱스 찾기:', {
          moduleZone,
          hasZones: !!indexing.zones,
          currentSlotIndex,
          positionX: editingModule.position.x,
          positionsCount: positionsToSearch?.length,
          dualPositionsCount: dualPositionsToSearch?.length
        });

        if (currentSlotIndex === -1) {
          // 슬롯 인덱스를 못 찾은 경우 placedModule의 slotIndex 사용 (fallback)
          currentSlotIndex = editingModule.slotIndex || 0;
          console.log('⚠️ [useFurnitureKeyboard] 슬롯 위치를 못 찾아 저장된 slotIndex 사용:', currentSlotIndex);
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
            console.log('⌨️ ArrowLeft 키 입력:', {
              currentSlot: currentSlotIndex,
              editingModuleZone: editingModule.zone,
              hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled
            });
            const nextSlot = findNextAvailableSlot(
              currentSlotIndex,
              'left',
              isDualFurniture,
              placedModules,
              spaceInfo,
              editingModule.moduleId,
              targetModuleId, // excludeModuleId로 전달
              editingModule.zone // 현재 zone 유지
            );
            console.log('⌨️ ArrowLeft 결과:', { nextSlot });

            if (nextSlot !== null) {
              let newX: number;
              if (isDualFurniture && dualPositionsToSearch) {
                newX = dualPositionsToSearch[nextSlot];
              } else if (positionsToSearch) {
                newX = positionsToSearch[nextSlot];
              } else {
                console.error('⚠️ 위치 배열을 찾을 수 없음');
                break;
              }

              // newX가 undefined인 경우 (zone 경계를 넘어가는 경우)
              if (newX === undefined) {
                console.error('⚠️ 슬롯 위치를 찾을 수 없음 (zone 경계 초과):', {
                  nextSlot,
                  currentZone: editingModule.zone,
                  positionsLength: positionsToSearch?.length,
                  dualPositionsLength: dualPositionsToSearch?.length
                });
                break;
              }

              // 기둥 슬롯 분석
              const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
              const targetSlotInfo = columnSlots[nextSlot];
              
              let adjustedWidth: number | undefined = undefined;
              let adjustedPosition = { x: newX, y: editingModule.position.y, z: editingModule.position.z };
              let customDepth = editingModule.customDepth;
              
              // 기둥이 있는 슬롯인 경우 크기와 위치 조정
              if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
                const columnDepth = targetSlotInfo.column.depth;
                
                // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
                const slotWidthM = indexing.columnWidth * 0.01;
                const originalSlotBounds = {
                  left: newX - slotWidthM / 2,
                  right: newX + slotWidthM / 2,
                  center: newX
                };
                
                const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
                
                // 크기와 위치 조정
                adjustedWidth = furnitureBounds.renderWidth;
                adjustedPosition.x = furnitureBounds.center;
                
                // Column C (300mm) 특별 처리 - 깊이 조정
                if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
                  customDepth = 730 - columnDepth; // 430mm
                  console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                }
                
                console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                  slotIndex: nextSlot,
                  columnDepth,
                  originalWidth: moduleData.dimensions.width,
                  adjustedWidth,
                  adjustedPosition
                });
              }

              // customWidth 계산 - zone별 slotWidths 사용
              const customWidth = (() => {
                // zone별 slotWidths와 columnWidth 가져오기
                let zoneSlotWidths: number[] | undefined;
                let zoneColumnWidth: number;

                if (indexing.zones && spaceInfo.droppedCeiling?.enabled) {
                  const zoneInfo = moduleZone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
                  if (zoneInfo) {
                    zoneSlotWidths = zoneInfo.slotWidths;
                    zoneColumnWidth = zoneInfo.columnWidth;
                  } else {
                    zoneColumnWidth = indexing.columnWidth;
                  }
                } else {
                  zoneSlotWidths = indexing.slotWidths;
                  zoneColumnWidth = indexing.columnWidth;
                }

                if (zoneSlotWidths && zoneSlotWidths[nextSlot] !== undefined) {
                  if (isDualFurniture && nextSlot < zoneSlotWidths.length - 1) {
                    return zoneSlotWidths[nextSlot] + zoneSlotWidths[nextSlot + 1];
                  } else {
                    return zoneSlotWidths[nextSlot];
                  }
                }
                return zoneColumnWidth;
              })();

              // 업데이트 (zone 정보 유지)
              updatePlacedModule(targetModuleId, {
                position: adjustedPosition,
                slotIndex: nextSlot,
                customDepth: customDepth,
                adjustedWidth: adjustedWidth,
                customWidth: customWidth,
                zone: editingModule.zone, // 현재 zone 유지
                isDualSlot: editingModule.moduleId.includes('dual-') ? true : (editingModule.isDualSlot ?? isDualFurniture) // 원본이 듀얼이면 유지
              });
            }
            // 이동할 수 없는 경우 현재 위치 유지 (아무 작업 안함)
            e.preventDefault();
            break;
          }

          case 'ArrowRight': {
            // 스마트 건너뛰기: 오른쪽으로 다음 사용 가능한 슬롯 찾기
            console.log('⌨️ ArrowRight 키 입력:', {
              currentSlot: currentSlotIndex,
              editingModuleZone: editingModule.zone,
              hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled
            });
            const nextSlot = findNextAvailableSlot(
              currentSlotIndex,
              'right',
              isDualFurniture,
              placedModules,
              spaceInfo,
              editingModule.moduleId,
              targetModuleId, // excludeModuleId로 전달
              editingModule.zone // 현재 zone 유지
            );
            console.log('⌨️ ArrowRight 결과:', { nextSlot });

            if (nextSlot !== null) {
              let newX: number;
              if (isDualFurniture && dualPositionsToSearch) {
                newX = dualPositionsToSearch[nextSlot];
              } else if (positionsToSearch) {
                newX = positionsToSearch[nextSlot];
              } else {
                console.error('⚠️ 위치 배열을 찾을 수 없음');
                break;
              }

              // newX가 undefined인 경우 (zone 경계를 넘어가는 경우)
              if (newX === undefined) {
                console.error('⚠️ 슬롯 위치를 찾을 수 없음 (zone 경계 초과):', {
                  nextSlot,
                  currentZone: editingModule.zone,
                  positionsLength: positionsToSearch?.length,
                  dualPositionsLength: dualPositionsToSearch?.length
                });
                break;
              }

              // 기둥 슬롯 분석
              const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
              const targetSlotInfo = columnSlots[nextSlot];
              
              let adjustedWidth: number | undefined = undefined;
              let adjustedPosition = { x: newX, y: editingModule.position.y, z: editingModule.position.z };
              let customDepth = editingModule.customDepth;
              
              // 기둥이 있는 슬롯인 경우 크기와 위치 조정
              if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
                const columnDepth = targetSlotInfo.column.depth;
                
                // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
                const slotWidthM = indexing.columnWidth * 0.01;
                const originalSlotBounds = {
                  left: newX - slotWidthM / 2,
                  right: newX + slotWidthM / 2,
                  center: newX
                };
                
                const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
                
                // 크기와 위치 조정
                adjustedWidth = furnitureBounds.renderWidth;
                adjustedPosition.x = furnitureBounds.center;
                
                // Column C (300mm) 특별 처리 - 깊이 조정
                if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
                  customDepth = 730 - columnDepth; // 430mm
                  console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                }
                
                console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                  slotIndex: nextSlot,
                  columnDepth,
                  originalWidth: moduleData.dimensions.width,
                  adjustedWidth,
                  adjustedPosition
                });
              }

              // customWidth 계산 - zone별 slotWidths 사용
              const customWidth = (() => {
                // zone별 slotWidths와 columnWidth 가져오기
                let zoneSlotWidths: number[] | undefined;
                let zoneColumnWidth: number;

                if (indexing.zones && spaceInfo.droppedCeiling?.enabled) {
                  const zoneInfo = moduleZone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
                  if (zoneInfo) {
                    zoneSlotWidths = zoneInfo.slotWidths;
                    zoneColumnWidth = zoneInfo.columnWidth;
                  } else {
                    zoneColumnWidth = indexing.columnWidth;
                  }
                } else {
                  zoneSlotWidths = indexing.slotWidths;
                  zoneColumnWidth = indexing.columnWidth;
                }

                if (zoneSlotWidths && zoneSlotWidths[nextSlot] !== undefined) {
                  if (isDualFurniture && nextSlot < zoneSlotWidths.length - 1) {
                    return zoneSlotWidths[nextSlot] + zoneSlotWidths[nextSlot + 1];
                  } else {
                    return zoneSlotWidths[nextSlot];
                  }
                }
                return zoneColumnWidth;
              })();

              // 업데이트 (zone 정보 유지)
              updatePlacedModule(targetModuleId, {
                position: adjustedPosition,
                slotIndex: nextSlot,
                customDepth: customDepth,
                adjustedWidth: adjustedWidth,
                customWidth: customWidth,
                zone: editingModule.zone, // 현재 zone 유지
                isDualSlot: editingModule.moduleId.includes('dual-') ? true : (editingModule.isDualSlot ?? isDualFurniture) // 원본이 듀얼이면 유지
              });
            }
            // 이동할 수 없는 경우 현재 위치 유지 (아무 작업 안함)
            e.preventDefault();
            break;
          }
            
          case 'Escape':
            setEditMode(false);
            setEditingModuleId(null);
            // selectedFurnitureId도 함께 해제 (섬네일 체크 해제)
            const { setSelectedFurnitureId } = useUIStore.getState();
            setSelectedFurnitureId(null);
            e.preventDefault();
            break;
            
          case 'Enter':
            setEditMode(false);
            setEditingModuleId(null);
            e.preventDefault();
            break;
        }
      } else {
        // 편집 모드가 아닐 때의 처리
        if (selectedPlacedModuleId) {
          const selectedModule = placedModules.find(m => m.id === selectedPlacedModuleId);
          if (!selectedModule) return;
          
          // 선택된 가구의 데이터 가져오기
          const moduleData = getModuleById(selectedModule.moduleId, internalSpace, spaceInfo);
          if (!moduleData) return;
          
          // 듀얼/싱글 가구 판별 - moduleId로 직접 확인 (width는 변경될 수 있음)
          const isDualFurniture = selectedModule.moduleId.includes('dual-');
          
          let currentSlotIndex = -1;
          
          if (isDualFurniture) {
            // 듀얼 가구: threeUnitDualPositions에서 슬롯 찾기
            if (indexing.threeUnitDualPositions) {
              currentSlotIndex = indexing.threeUnitDualPositions.findIndex(pos => 
                Math.abs(pos - selectedModule.position.x) < 0.1
              );
            }
          } else {
            // 싱글 가구: threeUnitPositions에서 슬롯 찾기
            currentSlotIndex = indexing.threeUnitPositions.findIndex(pos => 
              Math.abs(pos - selectedModule.position.x) < 0.1
            );
          }
          
          if (currentSlotIndex === -1) {
            // 슬롯 인덱스를 못찾은 경우 placedModule의 slotIndex 사용
            currentSlotIndex = selectedModule.slotIndex || 0;
          }
          
          switch (e.key) {
            case 'Delete':
            case 'Backspace':
              // 선택된 가구가 있으면 삭제
              removeModule(selectedPlacedModuleId);
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
                selectedModule.moduleId,
                selectedPlacedModuleId // excludeModuleId로 전달
              );

              if (nextSlot !== null) {
                let newX: number;
                if (isDualFurniture && indexing.threeUnitDualPositions) {
                  newX = indexing.threeUnitDualPositions[nextSlot];
                } else {
                  newX = indexing.threeUnitPositions[nextSlot];
                }

                // newX가 undefined인 경우 (zone 경계를 넘어가는 경우)
                if (newX === undefined) {
                  console.error('⚠️ [선택모드] 슬롯 위치를 찾을 수 없음 (zone 경계 초과):', {
                    nextSlot,
                    positionsLength: indexing.threeUnitPositions?.length,
                    dualPositionsLength: indexing.threeUnitDualPositions?.length
                  });
                  break;
                }

                // 기둥 슬롯 분석
                const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
                const targetSlotInfo = columnSlots[nextSlot];
                
                let adjustedWidth: number | undefined = undefined;
                let adjustedPosition = { x: newX, y: selectedModule.position.y, z: selectedModule.position.z };
                let customDepth = selectedModule.customDepth;
                
                // 기둥이 있는 슬롯인 경우 크기와 위치 조정
                if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
                  const columnDepth = targetSlotInfo.column.depth;
                  
                  // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
                  const slotWidthM = indexing.columnWidth * 0.01;
                  const originalSlotBounds = {
                    left: newX - slotWidthM / 2,
                    right: newX + slotWidthM / 2,
                    center: newX
                  };
                  
                  const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
                  
                  // 크기와 위치 조정
                  adjustedWidth = furnitureBounds.renderWidth;
                  adjustedPosition.x = furnitureBounds.center;
                  
                  // Column C (300mm) 특별 처리 - 깊이 조정
                  if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
                    customDepth = 730 - columnDepth; // 430mm
                    console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                  }
                  
                  console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                    slotIndex: nextSlot,
                    columnDepth,
                    originalWidth: moduleData.dimensions.width,
                    adjustedWidth,
                    adjustedPosition
                  });
                }
                
                // customWidth 계산
                const customWidth = (() => {
                  if (indexing.slotWidths && indexing.slotWidths[nextSlot] !== undefined) {
                    if (isDualFurniture && nextSlot < indexing.slotWidths.length - 1) {
                      return indexing.slotWidths[nextSlot] + indexing.slotWidths[nextSlot + 1];
                    } else {
                      return indexing.slotWidths[nextSlot];
                    }
                  }
                  return indexing.columnWidth;
                })();
                
                // 업데이트
                updatePlacedModule(selectedPlacedModuleId, {
                  position: adjustedPosition,
                  slotIndex: nextSlot,
                  customDepth: customDepth,
                  adjustedWidth: adjustedWidth,
                  customWidth: customWidth,
                  isDualSlot: selectedModule.moduleId.includes('dual-') ? true : (selectedModule.isDualSlot ?? isDualFurniture) // 원본이 듀얼이면 유지
                });
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
                selectedModule.moduleId,
                selectedPlacedModuleId // excludeModuleId로 전달
              );

              if (nextSlot !== null) {
                let newX: number;
                if (isDualFurniture && indexing.threeUnitDualPositions) {
                  newX = indexing.threeUnitDualPositions[nextSlot];
                } else {
                  newX = indexing.threeUnitPositions[nextSlot];
                }

                // newX가 undefined인 경우 (zone 경계를 넘어가는 경우)
                if (newX === undefined) {
                  console.error('⚠️ [선택모드] 슬롯 위치를 찾을 수 없음 (zone 경계 초과):', {
                    nextSlot,
                    positionsLength: indexing.threeUnitPositions?.length,
                    dualPositionsLength: indexing.threeUnitDualPositions?.length
                  });
                  break;
                }

                // 기둥 슬롯 분석
                const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
                const targetSlotInfo = columnSlots[nextSlot];
                
                let adjustedWidth: number | undefined = undefined;
                let adjustedPosition = { x: newX, y: selectedModule.position.y, z: selectedModule.position.z };
                let customDepth = selectedModule.customDepth;
                
                // 기둥이 있는 슬롯인 경우 크기와 위치 조정
                if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
                  const columnDepth = targetSlotInfo.column.depth;
                  
                  // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
                  const slotWidthM = indexing.columnWidth * 0.01;
                  const originalSlotBounds = {
                    left: newX - slotWidthM / 2,
                    right: newX + slotWidthM / 2,
                    center: newX
                  };
                  
                  const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
                  
                  // 크기와 위치 조정
                  adjustedWidth = furnitureBounds.renderWidth;
                  adjustedPosition.x = furnitureBounds.center;
                  
                  // Column C (300mm) 특별 처리 - 깊이 조정
                  if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
                    customDepth = 730 - columnDepth; // 430mm
                    console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                  }
                  
                  console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                    slotIndex: nextSlot,
                    columnDepth,
                    originalWidth: moduleData.dimensions.width,
                    adjustedWidth,
                    adjustedPosition
                  });
                }
                
                // customWidth 계산
                const customWidth = (() => {
                  if (indexing.slotWidths && indexing.slotWidths[nextSlot] !== undefined) {
                    if (isDualFurniture && nextSlot < indexing.slotWidths.length - 1) {
                      return indexing.slotWidths[nextSlot] + indexing.slotWidths[nextSlot + 1];
                    } else {
                      return indexing.slotWidths[nextSlot];
                    }
                  }
                  return indexing.columnWidth;
                })();
                
                // 업데이트
                updatePlacedModule(selectedPlacedModuleId, {
                  position: adjustedPosition,
                  slotIndex: nextSlot,
                  customDepth: customDepth,
                  adjustedWidth: adjustedWidth,
                  customWidth: customWidth,
                  isDualSlot: selectedModule.moduleId.includes('dual-') ? true : (selectedModule.isDualSlot ?? isDualFurniture) // 원본이 듀얼이면 유지
                });
              }
              // 이동할 수 없는 경우 현재 위치 유지 (아무 작업 안함)
              e.preventDefault();
              break;
            }
          }
        }

        // selectedFurnitureId가 설정된 경우 (섬네일 클릭 모드) ESC 처리
        if (e.key === 'Escape') {
          const { selectedFurnitureId, setSelectedFurnitureId } = useUIStore.getState();
          if (selectedFurnitureId) {
            console.log('🔵 [useFurnitureKeyboard] ESC 키로 selectedFurnitureId 해제:', selectedFurnitureId);
            setSelectedFurnitureId(null);
            e.preventDefault();
          }
        }
      }
    };
    
    // 편집 모드가 아니어도 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editMode, editingModuleId, selectedPlacedModuleId, placedModules, indexing, removeModule, moveModule, updatePlacedModule, internalSpace, spaceInfo, setEditMode, setEditingModuleId]);
}; 
