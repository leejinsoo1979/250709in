import { useEffect } from 'react';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';
import { calculateSpaceIndexing, recalculateWithCustomWidths, ColumnIndexer } from '@/editor/shared/utils/indexing';
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
  const baseIndexing = calculateSpaceIndexing(spaceInfo);
  const hasCustomWidths = placedModules.some(m => m.slotCustomWidth !== undefined);
  const indexing = hasCustomWidths ? recalculateWithCustomWidths(baseIndexing, placedModules) : baseIndexing;

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

        // 자유배치 가구는 FreePlacementDropZone의 키보드 핸들러에서 처리
        if (editingModule.isFreePlacement) return;

        // 편집 중인 가구의 데이터 가져오기 (커스텀 가구는 PlacedModule에서 빌드)
        const moduleData = getModuleById(editingModule.moduleId, internalSpace, spaceInfo)
          || buildModuleDataFromPlacedModule(editingModule);
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

        // 듀얼/싱글 가구 판별 - isDualSlot 속성 우선, moduleId 폴백
        const isDualFurniture = editingModule.isDualSlot !== undefined
          ? editingModule.isDualSlot
          : editingModule.moduleId.includes('dual-');

// console.log('🔍 [useFurnitureKeyboard] 가구 타입 판별:', {
          // moduleZone,
          // columnWidth,
          // furnitureWidth: moduleData.dimensions.width,
          // isDualFurniture,
          // isDualSlot: editingModule.isDualSlot,
          // hasZones: !!indexing.zones
        // });

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

// console.log('🔍 [useFurnitureKeyboard] 슬롯 인덱스 찾기:', {
          // moduleZone,
          // hasZones: !!indexing.zones,
          // currentSlotIndex,
          // positionX: editingModule.position.x,
          // positionsCount: positionsToSearch?.length,
          // dualPositionsCount: dualPositionsToSearch?.length
        // });

        if (currentSlotIndex === -1) {
          // 슬롯 인덱스를 못 찾은 경우 placedModule의 slotIndex 사용 (fallback)
          currentSlotIndex = editingModule.slotIndex || 0;
// console.log('⚠️ [useFurnitureKeyboard] 슬롯 위치를 못 찾아 저장된 slotIndex 사용:', currentSlotIndex);
        }
        
        // slotCustomWidth가 설정된 가구는 좌우 이동 차단
        const hasSlotCustomWidth = editingModule.slotCustomWidth !== undefined;
        const excludedMovingModuleIds = editingModule.groupId
          ? placedModules
            .filter(module => module.groupId === editingModule.groupId)
            .map(module => module.id)
          : editingModule.id;

        switch (e.key) {
          case 'Delete':
          case 'Backspace':
            // 편집 모드 또는 팝업 모드에서 삭제 허용
            if (targetModuleId) {
              // 선택된 가구만 삭제 (상부장/하부장 개별 삭제)
              removeModule(editingModule.id);
              setEditMode(false);
              setEditingModuleId(null);
              // 팝업도 닫기
              if (activePopup.type === 'furnitureEdit') {
                useUIStore.getState().closeAllPopups();
              }
            }
            e.preventDefault();
            break;

          case 'ArrowLeft': {
            if (hasSlotCustomWidth) { e.preventDefault(); break; }
            // 스마트 건너뛰기: 왼쪽으로 다음 사용 가능한 슬롯 찾기
// console.log('⌨️ ArrowLeft 키 입력:', {
              // currentSlot: currentSlotIndex,
              // editingModuleZone: editingModule.zone,
              // hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled
            // });
            const nextSlot = findNextAvailableSlot(
              currentSlotIndex,
              'left',
              isDualFurniture,
              placedModules,
              spaceInfo,
              editingModule.moduleId,
              excludedMovingModuleIds, // 같은 그룹은 이동 중 빈 슬롯처럼 취급
              editingModule.zone // 현재 zone 유지
            );
// console.log('⌨️ ArrowLeft 결과:', { nextSlot });

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
// console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                }
                
// console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                  // slotIndex: nextSlot,
                  // columnDepth,
                  // originalWidth: moduleData.dimensions.width,
                  // adjustedWidth,
                  // adjustedPosition
                // });
              }

              // customWidth 계산 - 듀얼은 internalWidth 기준 (slotWidths 합산 시 floor 손실 방지)
              const customWidth = (() => {
                let zoneSlotWidths: number[] | undefined;
                let zoneColumnWidth: number;
                let zoneInternalWidth: number;
                let zoneColumnCount: number;

                if (indexing.zones && spaceInfo.droppedCeiling?.enabled) {
                  const zoneInfo = moduleZone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
                  if (zoneInfo) {
                    zoneSlotWidths = zoneInfo.slotWidths;
                    zoneColumnWidth = zoneInfo.columnWidth;
                    zoneInternalWidth = zoneInfo.width;
                    zoneColumnCount = zoneInfo.columnCount;
                  } else {
                    zoneColumnWidth = indexing.columnWidth;
                    zoneInternalWidth = indexing.internalWidth;
                    zoneColumnCount = indexing.columnCount;
                  }
                } else {
                  zoneSlotWidths = indexing.slotWidths;
                  zoneColumnWidth = indexing.columnWidth;
                  zoneInternalWidth = indexing.internalWidth;
                  zoneColumnCount = indexing.columnCount;
                }

                if (isDualFurniture && zoneInternalWidth > 0 && zoneColumnCount >= 2) {
                  return zoneColumnCount === 2
                    ? Math.floor(zoneInternalWidth)
                    : Math.floor((zoneInternalWidth * 2) / zoneColumnCount);
                }
                if (zoneSlotWidths && zoneSlotWidths[nextSlot] !== undefined) {
                  return zoneSlotWidths[nextSlot];
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
                isDualSlot: isDualFurniture // 원본 듀얼 상태 유지
              });
            }
            // 이동할 수 없는 경우 현재 위치 유지 (아무 작업 안함)
            e.preventDefault();
            break;
          }

          case 'ArrowRight': {
            if (hasSlotCustomWidth) { e.preventDefault(); break; }
            // 스마트 건너뛰기: 오른쪽으로 다음 사용 가능한 슬롯 찾기
// console.log('⌨️ ArrowRight 키 입력:', {
              // currentSlot: currentSlotIndex,
              // editingModuleZone: editingModule.zone,
              // hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled
            // });
            const nextSlot = findNextAvailableSlot(
              currentSlotIndex,
              'right',
              isDualFurniture,
              placedModules,
              spaceInfo,
              editingModule.moduleId,
              excludedMovingModuleIds, // 같은 그룹은 이동 중 빈 슬롯처럼 취급
              editingModule.zone // 현재 zone 유지
            );
// console.log('⌨️ ArrowRight 결과:', { nextSlot });

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
// console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                }
                
// console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                  // slotIndex: nextSlot,
                  // columnDepth,
                  // originalWidth: moduleData.dimensions.width,
                  // adjustedWidth,
                  // adjustedPosition
                // });
              }

              // customWidth 계산 - 듀얼은 internalWidth 기준 (slotWidths 합산 시 floor 손실 방지)
              const customWidth = (() => {
                let zoneSlotWidths: number[] | undefined;
                let zoneColumnWidth: number;
                let zoneInternalWidth: number;
                let zoneColumnCount: number;

                if (indexing.zones && spaceInfo.droppedCeiling?.enabled) {
                  const zoneInfo = moduleZone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
                  if (zoneInfo) {
                    zoneSlotWidths = zoneInfo.slotWidths;
                    zoneColumnWidth = zoneInfo.columnWidth;
                    zoneInternalWidth = zoneInfo.width;
                    zoneColumnCount = zoneInfo.columnCount;
                  } else {
                    zoneColumnWidth = indexing.columnWidth;
                    zoneInternalWidth = indexing.internalWidth;
                    zoneColumnCount = indexing.columnCount;
                  }
                } else {
                  zoneSlotWidths = indexing.slotWidths;
                  zoneColumnWidth = indexing.columnWidth;
                  zoneInternalWidth = indexing.internalWidth;
                  zoneColumnCount = indexing.columnCount;
                }

                if (isDualFurniture && zoneInternalWidth > 0 && zoneColumnCount >= 2) {
                  return zoneColumnCount === 2
                    ? Math.floor(zoneInternalWidth)
                    : Math.floor((zoneInternalWidth * 2) / zoneColumnCount);
                }
                if (zoneSlotWidths && zoneSlotWidths[nextSlot] !== undefined) {
                  return zoneSlotWidths[nextSlot];
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
                isDualSlot: isDualFurniture // 원본 듀얼 상태 유지
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

          // 그룹 묶인 가구 다중선택 시: 그룹 전체를 한 슬롯씩 같은 방향으로 동시 이동.
          //   - 그룹 멤버끼리는 충돌 검사 대상에서 제외
          //   - 끝 가구가 막혔으면 그룹 전체 이동 안 함 (한 슬롯만 이동)
          if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !selectedModule.isFreePlacement) {
            const uiSelectedIds = useUIStore.getState().selectedFurnitureIds || [];
            const groupIds = selectedModule.groupId
              ? placedModules.filter(m => m.groupId === selectedModule.groupId).map(m => m.id)
              : (uiSelectedIds.length >= 2 ? uiSelectedIds : []);
            if (groupIds.length >= 2) {
              const groupMembers = placedModules.filter(m => groupIds.includes(m.id) && !m.isFreePlacement);
              if (groupMembers.length >= 2) {
                const dir: 'left' | 'right' = e.key === 'ArrowLeft' ? 'left' : 'right';
                // 그룹 내에서 진행 방향 끝 가구 (left면 가장 작은 slotIndex, right면 가장 큰)
                const edgeMod = groupMembers.reduce((acc, m) => {
                  const ai = acc.slotIndex ?? 0;
                  const mi = m.slotIndex ?? 0;
                  if (dir === 'left') return mi < ai ? m : acc;
                  return mi > ai ? m : acc;
                }, groupMembers[0]);
                const edgeIdx = edgeMod.slotIndex ?? 0;
                const targetIdx = edgeIdx + (dir === 'left' ? -1 : 1);
                // 슬롯 범위 체크
                const slotCount = indexing.threeUnitPositions.length;
                if (targetIdx < 0 || targetIdx >= slotCount) { e.preventDefault(); return; }
                // 그룹 외부 가구 중 targetIdx 점유 여부 확인
                const occupiedByOther = placedModules.some(m => {
                  if (groupIds.includes(m.id)) return false;
                  if (m.isFreePlacement) return false;
                  const mi = m.slotIndex ?? -1;
                  const isDualM = m.isDualSlot ?? m.moduleId?.includes('dual-');
                  if (isDualM) return mi === targetIdx || mi + 1 === targetIdx;
                  return mi === targetIdx;
                });
                if (occupiedByOther) { e.preventDefault(); return; }
                // 그룹 전체를 한 슬롯씩 이동 (각 가구 slotIndex ± 1, position.x도 그에 맞게)
                const deltaSlot = dir === 'left' ? -1 : 1;
                groupMembers.forEach(m => {
                  if ((m as any).isLocked) return;
                  const newSlot = (m.slotIndex ?? 0) + deltaSlot;
                  const isDualM = m.isDualSlot ?? m.moduleId?.includes('dual-');
                  const newX = isDualM && indexing.threeUnitDualPositions
                    ? indexing.threeUnitDualPositions[newSlot]
                    : indexing.threeUnitPositions[newSlot];
                  if (newX === undefined) return;
                  updatePlacedModule(m.id, {
                    position: { x: newX, y: m.position.y, z: m.position.z },
                    slotIndex: newSlot,
                  });
                });
                e.preventDefault();
                return;
              }
            }
          }

          // 자유배치 가구는 FreePlacementDropZone에서 실제 좌표 기준으로 이동 처리한다.
          // 슬롯 이동 훅이 이전 selectedPlacedModuleId를 잡고 있으면 엉뚱한 가구가 움직일 수 있다.
          if (selectedModule.isFreePlacement) {
            return;
          }
          
          // 선택된 가구의 데이터 가져오기 (커스텀 가구는 PlacedModule에서 빌드)
          const moduleData = getModuleById(selectedModule.moduleId, internalSpace, spaceInfo)
            || buildModuleDataFromPlacedModule(selectedModule);
          if (!moduleData) return;
          
          // 듀얼/싱글 가구 판별 - isDualSlot 속성 우선, moduleId 폴백
          const isDualFurniture = selectedModule.isDualSlot !== undefined
            ? selectedModule.isDualSlot
            : selectedModule.moduleId.includes('dual-');
          
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
          
          // slotCustomWidth가 설정된 가구는 좌우 이동 차단
          const hasSlotCustomWidth2 = selectedModule.slotCustomWidth !== undefined;
          const excludedMovingModuleIds = selectedModule.groupId
            ? placedModules
              .filter(module => module.groupId === selectedModule.groupId)
              .map(module => module.id)
            : selectedModule.id;

          switch (e.key) {
            case 'Delete':
            case 'Backspace': {
              // 같은 슬롯의 upper+lower 한번에 삭제
              const sameSlotModules = placedModules.filter(m =>
                m.slotIndex === selectedModule.slotIndex &&
                m.zone === selectedModule.zone &&
                !m.isFreePlacement
              );
              sameSlotModules.forEach(m => removeModule(m.id));
              e.preventDefault();
              break;
            }

            case 'ArrowLeft': {
              if (hasSlotCustomWidth2) { e.preventDefault(); break; }
              // 스마트 건너뛰기: 왼쪽으로 다음 사용 가능한 슬롯 찾기
              const nextSlot = findNextAvailableSlot(
                currentSlotIndex,
                'left',
                isDualFurniture,
                placedModules,
                spaceInfo,
                selectedModule.moduleId,
                excludedMovingModuleIds // 같은 그룹은 이동 중 빈 슬롯처럼 취급
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
// console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                  }
                  
// console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                    // slotIndex: nextSlot,
                    // columnDepth,
                    // originalWidth: moduleData.dimensions.width,
                    // adjustedWidth,
                    // adjustedPosition
                  // });
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
                  isDualSlot: isDualFurniture // 원본 듀얼 상태 유지
                });
              }
              // 이동할 수 없는 경우 현재 위치 유지 (아무 작업 안함)
              e.preventDefault();
              break;
            }
              
            case 'ArrowRight': {
              if (hasSlotCustomWidth2) { e.preventDefault(); break; }
              // 스마트 건너뛰기: 오른쪽으로 다음 사용 가능한 슬롯 찾기
              const nextSlot = findNextAvailableSlot(
                currentSlotIndex,
                'right',
                isDualFurniture,
                placedModules,
                spaceInfo,
                selectedModule.moduleId,
                excludedMovingModuleIds // 같은 그룹은 이동 중 빈 슬롯처럼 취급
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
// console.log('🟣 Column C 깊이 조정:', customDepth, 'mm');
                  }
                  
// console.log('⌨️ 키보드 이동 - 기둥 슬롯 크기 조정:', {
                    // slotIndex: nextSlot,
                    // columnDepth,
                    // originalWidth: moduleData.dimensions.width,
                    // adjustedWidth,
                    // adjustedPosition
                  // });
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
                  isDualSlot: isDualFurniture // 원본 듀얼 상태 유지
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
// console.log('🔵 [useFurnitureKeyboard] ESC 키로 selectedFurnitureId 해제:', selectedFurnitureId);
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
