import { useEffect } from 'react';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';
import { calculateSpaceIndexing, recalculateWithCustomWidths, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { findNextAvailableSlot, isSlotAvailable } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { getDefaultFurnitureDepth } from '@/editor/shared/utils/furnitureDepthDefaults';
import {
  buildSideWallSlotSizesMm,
  calculateSideWallPlacementRangeMm,
  getSideWallSlotCenterZMm,
  resolveSideWallCabinetDepthMm
} from '@/editor/shared/viewer3d/utils/sideWallPlacement';

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

      // 기둥이 선택/편집 중이면 방향키는 기둥 이동 전용 → 가구 키보드 이동 무시
      // (기둥을 방향키로 옮길 때 가구가 같이 움직이는 문제 방지)
      {
        const uiState = useUIStore.getState();
        const isColumnActive = !!uiState.selectedColumnId
          || (uiState.activePopup?.type === 'columnEdit' && !!uiState.activePopup?.id);
        if (isColumnActive && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          return;
        }
      }

      const getNextAvailableSlot = (
        currentSlot: number,
        direction: 'left' | 'right',
        isDualFurniture: boolean,
        moduleId: string,
        excludeModuleId?: string | string[],
        targetZone?: 'normal' | 'dropped'
      ): number | null => {
        return findNextAvailableSlot(
          currentSlot,
          direction,
          isDualFurniture,
          placedModules,
          spaceInfo,
          moduleId,
          excludeModuleId,
          targetZone
        )
          ? nextSlot
          : null;
      };

      const canMoveGroupedModulesToSlot = (
        module: typeof placedModules[number],
        nextSlot: number
      ): boolean => {
        if (!module.groupId) {
          return true;
        }

        if (typeof module.slotIndex !== 'number') {
          return false;
        }

        const groupMembers = placedModules.filter(item =>
          item.groupId === module.groupId &&
          !item.isFreePlacement &&
          !(item as any).isLocked
        );
        if (groupMembers.length < 2) {
          return true;
        }

        const groupIds = groupMembers.map(item => item.id);
        const delta = nextSlot - module.slotIndex;

        return groupMembers.every(member => {
          if (typeof member.slotIndex !== 'number') {
            return false;
          }
          const memberNextSlot = member.slotIndex + delta;
          const isDualMember = member.isDualSlot !== undefined
            ? member.isDualSlot
            : member.moduleId.includes('dual-');
          return isSlotAvailable(
            memberNextSlot,
            isDualMember,
            placedModules,
            spaceInfo,
            member.moduleId,
            groupIds,
            member.zone as 'normal' | 'dropped' | undefined
          );
        });
      };

      const isSideWallModule = (module: typeof placedModules[number]) =>
        module.placementWall === 'left' || module.placementWall === 'right';

      const getPlacementDefaultDepth = (moduleId: string): number => {
        const moduleData = getModuleById(moduleId, internalSpace, spaceInfo);
        return getDefaultFurnitureDepth(spaceInfo, moduleData);
      };

      const getSideSlotSizes = (wall: 'left' | 'right') => {
        const totalDepthMm = Math.max(1, spaceInfo.depth || internalSpace.depth || 600);
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const cornerSlotIndex = wall === 'left' ? 0 : zoneInfo.normal.columnCount - 1;
        const frontCornerModule = placedModules.find(mod => {
          const placementWall = mod.placementWall || 'front';
          const moduleId = mod.moduleId || '';
          const span = mod.isDualSlot ? 2 : 1;
          const startSlot = mod.slotIndex ?? -1;
          const isMatchingCorner = wall === 'left'
            ? moduleId.includes('left-corner')
            : moduleId.includes('right-corner');
          return placementWall === 'front'
            && isMatchingCorner
            && startSlot <= cornerSlotIndex
            && cornerSlotIndex < startSlot + span;
        });
        const frontCornerData = frontCornerModule
          ? getModuleById(frontCornerModule.moduleId, internalSpace, spaceInfo)
          : undefined;
        return buildSideWallSlotSizesMm(wall, totalDepthMm, frontCornerModule, frontCornerData);
      };

      const getSideWallRange = () => {
        const panelDepthMm = Math.max(1, spaceInfo.depth || internalSpace.depth || 600);
        return calculateSideWallPlacementRangeMm(panelDepthMm);
      };

      const getSideCabinetDepthMm = (
        wall: 'left' | 'right',
        module: typeof placedModules[number]
      ) => {
        if (module.customDepth !== undefined && module.customDepth !== null) {
          return Math.min(
            Math.max(1, spaceInfo.width || internalSpace.width || 600),
            Math.max(1, module.customDepth)
          );
        }

        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const cornerSlotIndex = wall === 'left' ? 0 : zoneInfo.normal.columnCount - 1;
        const frontCornerModule = placedModules.find(mod => {
          const placementWall = mod.placementWall || 'front';
          const moduleId = mod.moduleId || '';
          const span = mod.isDualSlot ? 2 : 1;
          const startSlot = mod.slotIndex ?? -1;
          const isMatchingCorner = wall === 'left'
            ? moduleId.includes('left-corner')
            : moduleId.includes('right-corner');
          return placementWall === 'front'
            && isMatchingCorner
            && startSlot <= cornerSlotIndex
            && cornerSlotIndex < startSlot + span;
        });
        const frontCornerData = frontCornerModule
          ? getModuleById(frontCornerModule.moduleId, internalSpace, spaceInfo)
          : undefined;
        const maxDepthMm = Math.max(1, spaceInfo.width || internalSpace.width || 600);

        return resolveSideWallCabinetDepthMm(
          frontCornerModule,
          frontCornerData,
          maxDepthMm,
          getPlacementDefaultDepth(module.moduleId)
        );
      };

      const buildSideWallMoveUpdate = (
        module: typeof placedModules[number],
        nextSlot: number
      ) => {
        const wall = module.placementWall as 'left' | 'right';
        const sideSlotSizes = getSideSlotSizes(wall);
        const span = module.isDualSlot ? 2 : 1;
        const spanSlots = sideSlotSizes.slice(nextSlot, nextSlot + span);
        if (nextSlot < 0 || spanSlots.length < span) {
          return null;
        }

        const totalSideDepthMm = Math.max(1, spaceInfo.depth || internalSpace.depth || 600);
        const sideWallRange = getSideWallRange();
        const logicalWidthMm = spanSlots.reduce((sum, size) => sum + size, 0);
        const visualWidthMm = sideWallRange.depthMm * (logicalWidthMm / totalSideDepthMm);
        const startDepthFromFrontMm = sideSlotSizes
          .slice(0, nextSlot)
          .reduce((sum, size) => sum + size, 0);
        const centerZMm = getSideWallSlotCenterZMm(
          wall,
          sideWallRange,
          totalSideDepthMm,
          startDepthFromFrontMm,
          logicalWidthMm
        );
        const sideWallXmm = wall === 'left' ? -spaceInfo.width / 2 : spaceInfo.width / 2;
        const sideDepthMm = getSideCabinetDepthMm(wall, module);
        const sideCenterXmm = wall === 'left'
          ? sideWallXmm + sideDepthMm / 2
          : sideWallXmm - sideDepthMm / 2;

        return {
          position: {
            x: sideCenterXmm * 0.01,
            y: module.position.y,
            z: centerZMm * 0.01
          },
          slotIndex: nextSlot,
          customDepth: sideDepthMm,
          customWidth: visualWidthMm,
          sideLogicalWidth: logicalWidthMm,
          rotation: wall === 'left' ? 90 : -90,
          placementWall: wall,
          zone: 'normal' as const,
          __skipGroupPropagation: true
        };
      };

      const canMoveSideWallModules = (
        movingModules: typeof placedModules,
        direction: 'left' | 'right'
      ) => {
        const movingIds = new Set(movingModules.map(module => module.id));
        const delta = direction === 'left' ? -1 : 1;
        const plannedRanges = movingModules.map(module => {
          if (!isSideWallModule(module) || module.isLocked || typeof module.slotIndex !== 'number') {
            return null;
          }
          const wall = module.placementWall as 'left' | 'right';
          const sideSlotSizes = getSideSlotSizes(wall);
          const span = module.isDualSlot ? 2 : 1;
          const nextSlot = module.slotIndex + delta;
          if (nextSlot < 0 || nextSlot + span > sideSlotSizes.length) {
            return null;
          }
          return {
            module,
            wall,
            start: nextSlot,
            end: nextSlot + span
          };
        });

        if (plannedRanges.some(range => range === null)) {
          return false;
        }

        return plannedRanges.every(range => {
          if (!range) return false;
          return !placedModules.some(other => {
            if (movingIds.has(other.id)) return false;
            if ((other.placementWall || 'front') !== range.wall) return false;
            if (typeof other.slotIndex !== 'number') return false;
            const otherSpan = other.isDualSlot ? 2 : 1;
            const otherStart = other.slotIndex;
            const otherEnd = otherStart + otherSpan;
            return range.start < otherEnd && range.end > otherStart;
          });
        });
      };

      const moveSideWallModuleOneSlot = (
        module: typeof placedModules[number],
        direction: 'left' | 'right'
      ) => {
        if (!isSideWallModule(module) || module.isLocked) {
          return false;
        }

        const movingModules = module.groupId
          ? placedModules.filter(item =>
            item.groupId === module.groupId &&
            isSideWallModule(item) &&
            !item.isLocked
          )
          : [module];

        if (movingModules.length === 0 || !canMoveSideWallModules(movingModules, direction)) {
          return true;
        }

        const delta = direction === 'left' ? -1 : 1;
        movingModules.forEach(item => {
          const nextSlot = (item.slotIndex ?? 0) + delta;
          const updates = buildSideWallMoveUpdate(item, nextSlot);
          if (updates) {
            updatePlacedModule(item.id, updates as any);
          }
        });
        return true;
      };

      // 편집 모드이거나 가구 편집 팝업이 열린 상태일 때 처리
      const targetModuleId = editingModuleId || (activePopup.type === 'furnitureEdit' ? activePopup.id : null);

      if ((editMode && editingModuleId) || (activePopup.type === 'furnitureEdit' && activePopup.id)) {
        const editingModule = placedModules.find(m => m.id === targetModuleId);
        if (!editingModule) return;

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && isSideWallModule(editingModule)) {
          moveSideWallModuleOneSlot(editingModule, e.key === 'ArrowLeft' ? 'left' : 'right');
          e.preventDefault();
          return;
        }

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
            // 인접 슬롯이 막혀 있으면 같은 방향의 다음 빈 슬롯로 점프한다.
// console.log('⌨️ ArrowLeft 키 입력:', {
              // currentSlot: currentSlotIndex,
              // editingModuleZone: editingModule.zone,
              // hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled
            // });
            const nextSlot = getNextAvailableSlot(
              currentSlotIndex,
              'left',
              isDualFurniture,
              editingModule.moduleId,
              excludedMovingModuleIds, // 같은 그룹은 이동 중 빈 슬롯처럼 취급
              editingModule.zone // 현재 zone 유지
            );
// console.log('⌨️ ArrowLeft 결과:', { nextSlot });

            if (nextSlot !== null) {
              if (!canMoveGroupedModulesToSlot(editingModule, nextSlot)) {
                e.preventDefault();
                break;
              }
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
            // 인접 슬롯이 막혀 있으면 같은 방향의 다음 빈 슬롯로 점프한다.
// console.log('⌨️ ArrowRight 키 입력:', {
              // currentSlot: currentSlotIndex,
              // editingModuleZone: editingModule.zone,
              // hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled
            // });
            const nextSlot = getNextAvailableSlot(
              currentSlotIndex,
              'right',
              isDualFurniture,
              editingModule.moduleId,
              excludedMovingModuleIds, // 같은 그룹은 이동 중 빈 슬롯처럼 취급
              editingModule.zone // 현재 zone 유지
            );
// console.log('⌨️ ArrowRight 결과:', { nextSlot });

            if (nextSlot !== null) {
              if (!canMoveGroupedModulesToSlot(editingModule, nextSlot)) {
                e.preventDefault();
                break;
              }
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

          if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && isSideWallModule(selectedModule)) {
            moveSideWallModuleOneSlot(selectedModule, e.key === 'ArrowLeft' ? 'left' : 'right');
            e.preventDefault();
            return;
          }

          // 그룹 묶인 가구 선택 시: 그룹 전체를 한 슬롯씩만 이동.
          // 그룹 멤버를 순회 업데이트하면 store의 그룹 전파와 중복되어 여러 칸 이동하므로 대표 가구만 업데이트한다.
          if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !selectedModule.isFreePlacement) {
            if (selectedModule.groupId) {
              const groupMembers = placedModules.filter(m => m.groupId === selectedModule.groupId && !m.isFreePlacement);
              if (groupMembers.length >= 2) {
                const dir: 'left' | 'right' = e.key === 'ArrowLeft' ? 'left' : 'right';
                const isDualSelected = selectedModule.isDualSlot !== undefined
                  ? selectedModule.isDualSlot
                  : selectedModule.moduleId.includes('dual-');
                const nextSlot = getNextAvailableSlot(
                  selectedModule.slotIndex ?? 0,
                  dir,
                  isDualSelected,
                  selectedModule.moduleId,
                  groupMembers.map(member => member.id),
                  selectedModule.zone as 'normal' | 'dropped' | undefined
                );
                if (nextSlot === null || !canMoveGroupedModulesToSlot(selectedModule, nextSlot)) { e.preventDefault(); return; }
                const newX = isDualSelected && indexing.threeUnitDualPositions
                  ? indexing.threeUnitDualPositions[nextSlot]
                  : indexing.threeUnitPositions[nextSlot];
                if (newX === undefined) { e.preventDefault(); return; }
                updatePlacedModule(selectedModule.id, {
                  position: { x: newX, y: selectedModule.position.y, z: selectedModule.position.z },
                  slotIndex: nextSlot,
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
              // 인접 슬롯이 막혀 있으면 같은 방향의 다음 빈 슬롯로 점프한다.
              const nextSlot = getNextAvailableSlot(
                currentSlotIndex,
                'left',
                isDualFurniture,
                selectedModule.moduleId,
                excludedMovingModuleIds, // 같은 그룹은 이동 중 빈 슬롯처럼 취급
                selectedModule.zone as 'normal' | 'dropped' | undefined
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
              // 인접 슬롯이 막혀 있으면 같은 방향의 다음 빈 슬롯로 점프한다.
              const nextSlot = getNextAvailableSlot(
                currentSlotIndex,
                'right',
                isDualFurniture,
                selectedModule.moduleId,
                excludedMovingModuleIds, // 같은 그룹은 이동 중 빈 슬롯처럼 취급
                selectedModule.zone as 'normal' | 'dropped' | undefined
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
