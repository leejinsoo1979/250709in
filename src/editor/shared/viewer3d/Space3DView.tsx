import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { RxDimensions } from 'react-icons/rx';
import { LuEraser } from 'react-icons/lu';
import { Space3DViewProps } from './types';
import { Space3DViewProvider } from './context/Space3DViewContext';
import { ViewerThemeProvider } from './context/ViewerThemeContext';
import ThreeCanvas from './components/base/ThreeCanvas';
import Room from './components/elements/Room';
import ColumnAsset from './components/elements/space/ColumnAsset';
import WallAsset from './components/elements/space/WallAsset';
import ColumnDistanceLabels from './components/elements/space/ColumnDistanceLabels';
import ColumnGhostPreview from './components/elements/space/ColumnGhostPreview';
import ColumnCreationMarkers from './components/elements/space/ColumnCreationMarkers';
import PanelBAsset from './components/elements/space/PanelBAsset';
import PanelBCreationMarkers from './components/elements/space/PanelBCreationMarkers';

import ColumnGuides from './components/elements/ColumnGuides';
import CleanCAD2D from './components/elements/CleanCAD2D';
import CADDimensions2D from './components/elements/CADDimensions2D';
import CADGrid from './components/elements/CADGrid';
import DroppedCeilingSpace from './components/elements/DroppedCeilingSpace';
import { MeasurementTool } from './components/elements/MeasurementTool';

import SlotDropZonesSimple from './components/elements/SlotDropZonesSimple';
import SlotPlacementIndicators from './components/elements/SlotPlacementIndicators';
import FurniturePlacementPlane from './components/elements/FurniturePlacementPlane';
import FurnitureItem from './components/elements/furniture/FurnitureItem';
import BackPanelBetweenCabinets from './components/elements/furniture/BackPanelBetweenCabinets';
import UpperCabinetIndirectLight from './components/elements/furniture/UpperCabinetIndirectLight';
import InternalDimensionDisplay from './components/elements/InternalDimensionDisplay';
import ViewerToolbar from './components/ViewerToolbar';
import SlotSelector from '@/editor/Configurator/components/SlotSelector';
import { useFurniturePlacement } from './components/elements/furniture/hooks/useFurniturePlacement';


import { useLocation } from 'react-router-dom';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { Environment } from '@react-three/drei';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateOptimalDistance, mmToThreeUnits, calculateCameraTarget, threeUnitsToMm } from './components/base/utils/threeUtils';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/contexts/ThemeContext';
import { getModuleById } from '@/data/modules';
import { useThrottle } from '@/editor/shared/hooks/useThrottle';

/**
 * Space3DView 컴포넌트
 * 공간 정보를 3D로 표시하는 Three.js 뷰어
 * 2D 모드에서는 orthographic 카메라로 정면 뷰 제공
 */
const Space3DView: React.FC<Space3DViewProps> = (props) => {
  const { spaceInfo, svgSize, viewMode = '3D', setViewMode, renderMode = 'solid', showAll = true, showFrame = true, showDimensions: showDimensionsProp, isEmbedded, isStep2, activeZone, hideEdges = false, readOnly = false, sceneRef, showFurniture: showFurnitureProp } = props;
  console.log('🌐 Space3DView - viewMode:', viewMode);
  console.log('🌐 Space3DView - props:', props);
  const location = useLocation();
  const { spaceInfo: storeSpaceInfo, updateColumn, removeColumn, updateWall, removeWall, addWall, removePanelB, updatePanelB } = useSpaceConfigStore();
  const { placedModules, updateFurnitureForColumns } = useFurnitureStore();
  const { view2DDirection, showDimensions: storeShowDimensions, showDimensionsText, showGuides, showAxis, activePopup, setView2DDirection, setViewMode: setUIViewMode, isColumnCreationMode, isWallCreationMode, isPanelBCreationMode, view2DTheme, showFurniture: storeShowFurniture, isMeasureMode, toggleMeasureMode, isEraserMode } = useUIStore();

  // props로 전달된 showFurniture가 있으면 사용, 없으면 store 값 사용
  const showFurniture = showFurnitureProp !== undefined ? showFurnitureProp : storeShowFurniture;
  const { colors } = useThemeColors(); // Move this to top level to follow rules of hooks
  const { theme } = useTheme();
  const { placeFurniture: originalPlaceFurniture } = useFurniturePlacement();

  // 읽기 전용 모드 체크를 포함한 placeFurniture wrapper
  const placeFurniture = useCallback((slotIndex: number, zone?: 'normal' | 'dropped') => {
    if (readOnly) {
      console.log('🚫 읽기 전용 모드 - 가구 배치 차단');
      alert('읽기 전용 모드에서는 가구를 배치할 수 없습니다.');
      return;
    }
    originalPlaceFurniture(slotIndex, zone);
  }, [readOnly, originalPlaceFurniture]);

  // 기둥 위치 업데이트를 8ms(120fps)로 제한하여 부드러운 움직임
  const throttledUpdateColumn = useThrottle((id: string, updates: any) => {
    updateColumn(id, updates);
  }, 8);
  
  // 컴포넌트 마운트시 재질 설정 초기화 제거 (Firebase 로드 색상 유지)
  
  // 재질 설정 가져오기
  const materialConfig = storeSpaceInfo.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#FFFFFF'  // 기본값도 흰색으로 변경 (테스트용)
  };
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : storeShowDimensions;
  const dimensionDisplayEnabled = showDimensions && showDimensionsText;
  
  // ESC 키 이벤트 리스너 - selectedFurnitureId 해제
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      console.log('🔵 [Space3DView] 키 눌림:', e.key);
      if (e.key === 'Escape') {
        const { selectedFurnitureId, setSelectedFurnitureId } = useUIStore.getState();
        console.log('🔵 [Space3DView] ESC 키 감지 - selectedFurnitureId:', selectedFurnitureId);
        if (selectedFurnitureId) {
          console.log('🔵 [Space3DView] selectedFurnitureId 해제 실행');
          setSelectedFurnitureId(null);
        }
      }
    };

    console.log('🔵 [Space3DView] ESC 키 이벤트 리스너 등록');
    document.addEventListener('keydown', handleEscKey);
    return () => {
      console.log('🔵 [Space3DView] ESC 키 이벤트 리스너 해제');
      document.removeEventListener('keydown', handleEscKey);
    };
  }, []);

  // 가구 복제 이벤트 리스너
  useEffect(() => {
    console.log('복제 이벤트 리스너 등록됨');
    const handleDuplicateFurniture = (e: Event) => {
      console.log('복제 이벤트 수신됨');
      const customEvent = e as CustomEvent<{ furnitureId: string }>;
      const { furnitureId } = customEvent.detail;

      const { placedModules: latestPlacedModules, addModule: addModuleFn, setSelectedPlacedModuleId } = useFurnitureStore.getState();
      const { spaceInfo: latestSpaceInfo } = useSpaceConfigStore.getState();
      const setSelectedFurnitureId = useUIStore.getState().setSelectedFurnitureId;

      const activeSpaceInfo = latestSpaceInfo || spaceInfo;

      const furniture = latestPlacedModules.find(m => m.id === furnitureId);
      if (!furniture) {
        console.log('복제 실패: 가구를 찾을 수 없습니다', furnitureId);
        console.log('현재 배치된 가구들:', latestPlacedModules.map(m => m.id));
        return;
      }

      if (!activeSpaceInfo) {
        console.log('복제 실패: 공간 정보가 없습니다');
        return;
      }

      // 잠긴 가구는 복제 불가
      if (furniture.isLocked) {
        console.log('복제 실패: 잠긴 가구는 복제할 수 없습니다');
        return;
      }

      // 듀얼 가구인지 확인
      console.log('🔍 복제 - 가구 정보:', {
        id: furniture.id,
        moduleId: furniture.moduleId,
        baseModuleType: furniture.baseModuleType,
        isDualSlot: furniture.isDualSlot
      });

      const isDual = furniture.baseModuleType?.includes('dual-') || furniture.isDualSlot;

      // 빈 슬롯 찾기 (듀얼 가구는 2개 슬롯 차지)
      const indexing = calculateSpaceIndexing(activeSpaceInfo, []);
      const totalSlotsRaw = indexing.columnCount
        || activeSpaceInfo?.mainDoorCount
        || activeSpaceInfo?.customColumnCount
        || indexing.threeUnitPositions.length
        || 2;
      const totalSlots = Math.max(1, Math.floor(totalSlotsRaw));

      const getSlotCenterPosition = (slotIndex: number, dual: boolean) => {
        const zoneType = furniture.zone ?? 'normal';

        if (dual) {
          const zoneDualPositions = zoneType === 'dropped'
            ? indexing.zones?.dropped?.threeUnitDualPositions
            : indexing.zones?.normal?.threeUnitDualPositions;

          if (zoneDualPositions && zoneDualPositions[slotIndex] !== undefined) {
            return zoneDualPositions[slotIndex];
          }

          if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
            return indexing.threeUnitDualPositions[slotIndex];
          }
        } else {
          const zonePositions = zoneType === 'dropped'
            ? indexing.zones?.dropped?.threeUnitPositions
            : indexing.zones?.normal?.threeUnitPositions;

          if (zonePositions && zonePositions[slotIndex] !== undefined) {
            return zonePositions[slotIndex];
          }

          if (indexing.threeUnitPositions && indexing.threeUnitPositions[slotIndex] !== undefined) {
            return indexing.threeUnitPositions[slotIndex];
          }
        }

        // fall back to 기본 threeUnitPositions (듀얼/싱글 공용) 또는 0
        if (indexing.threeUnitPositions && indexing.threeUnitPositions[slotIndex] !== undefined) {
          return indexing.threeUnitPositions[slotIndex];
        }

        return 0;
      };

      const occupiedSlots = new Set<number>();
      const targetZone = furniture.zone ?? 'normal';
      latestPlacedModules.forEach(m => {
        if (m.slotIndex === undefined) return;

        const moduleZone = m.zone ?? 'normal';
        if (moduleZone !== targetZone) {
          return;
        }

        occupiedSlots.add(m.slotIndex);
        // 듀얼 가구는 다음 슬롯도 차지
        if (m.baseModuleType?.includes('dual-') || m.isDualSlot) {
          occupiedSlots.add(m.slotIndex + 1);
        }
      });

      const availableSlots: number[] = [];
      for (let i = 0; i < totalSlots; i++) {
        if (!occupiedSlots.has(i)) {
          availableSlots.push(i);
        }
      }

      // 현재 가구의 슬롯 인덱스
      const currentSlotIndex = furniture.slotIndex ?? 0;

      console.log('복제 시도:', {
        furnitureId: furniture.id,
        isDual,
        currentSlotIndex,
        totalSlots,
        occupiedSlots: Array.from(occupiedSlots),
        availableSlots
      });

      // 듀얼 가구의 경우 연속된 빈 슬롯 2개 필요
      if (isDual) {
        // 현재 슬롯 옆 슬롯 우선 확인 (우측 → 좌측 순서)
        let targetSlot: number | undefined;

        // 사용 가능한 연속 슬롯(2칸) 목록 계산
        const consecutivePairs: number[] = [];
        for (let i = 0; i < availableSlots.length - 1; i++) {
          const slot = availableSlots[i];
          if (availableSlots[i + 1] === slot + 1) {
            consecutivePairs.push(slot);
          }
        }

        // 우측으로 배치 가능한 연속 슬롯 중 가장 가까운 슬롯을 우선 사용
        const rightCandidate = consecutivePairs.find(slot => slot >= currentSlotIndex + 2);

        if (rightCandidate !== undefined) {
          targetSlot = rightCandidate;
        } else {
          // 좌측으로 배치 가능한 연속 슬롯을 탐색 (가장 가까운 슬롯 우선)
          const leftCandidate = [...consecutivePairs]
            .reverse()
            .find(slot => slot <= currentSlotIndex - 2);

          if (leftCandidate !== undefined) {
            targetSlot = leftCandidate;
          } else {
            // 어느 방향도 없으면 첫 번째 연속 슬롯 사용
            targetSlot = consecutivePairs[0];
          }
        }

        if (targetSlot === undefined) {
          console.log('복제 실패: 듀얼 가구를 위한 연속된 빈 슬롯이 없습니다');
          return;
        }

        // 복제 실행 - 슬롯에 맞는 정확한 위치 계산
        const slotCenterX = getSlotCenterPosition(targetSlot, true);

        const newId = `${furniture.baseModuleType}-${Date.now()}`;
        const { adjustedPosition, adjustedWidth, columnSlotInfo, ...furnitureData } = furniture;
        const newFurniture = {
          ...furnitureData,
          id: newId,
          slotIndex: targetSlot,
          position: {
            x: slotCenterX,
            y: furniture.position.y,
            z: furniture.position.z
          }
        };

        console.log('복제 성공: 듀얼 가구', newId, '슬롯:', targetSlot);
        // 먼저 기존 선택 해제
        setSelectedPlacedModuleId(null);
        setSelectedFurnitureId(null);
        // 가구 추가
        addModuleFn(newFurniture);
        // 복제된 가구 선택
        setTimeout(() => {
          setSelectedPlacedModuleId(newId);
          setSelectedFurnitureId(newId);
          console.log('복제된 가구 선택:', newId);
        }, 100);
      } else {
      // 싱글 가구
      if (availableSlots.length === 0) {
        console.log('복제 실패: 빈 슬롯이 없습니다');
        return;
      }

      const leftSlot = currentSlotIndex - 1;
      const rightSlot = currentSlotIndex + 1;
      const leftAvailable = leftSlot >= 0 && availableSlots.includes(leftSlot);
      const rightAvailable = rightSlot < totalSlots && availableSlots.includes(rightSlot);

      console.log('[Single Duplicate] 슬롯 확인', {
        currentSlotIndex,
        leftSlot,
        rightSlot,
        leftAvailable,
        rightAvailable,
        availableSlots,
        totalSlots
      });

      let targetSlot: number | undefined;
      if (leftAvailable && !rightAvailable) {
        targetSlot = leftSlot;
      } else if (!leftAvailable && rightAvailable) {
        targetSlot = rightSlot;
      } else if (leftAvailable && rightAvailable) {
        targetSlot = leftSlot; // 양쪽 모두 가능하면 좌측을 우선 사용
      }

      if (targetSlot === undefined) {
        console.log('복제 실패: 인접한 빈 슬롯이 없습니다 (싱글 가구)');
          return;
        }

        // 슬롯에 맞는 정확한 위치 계산
        const slotCenterX = getSlotCenterPosition(targetSlot, false);

        const newId = `${furniture.baseModuleType}-${Date.now()}`;
        const { adjustedPosition, adjustedWidth, columnSlotInfo, ...furnitureData } = furniture;
        const newFurniture = {
          ...furnitureData,
          id: newId,
          slotIndex: targetSlot,
          position: {
            x: slotCenterX,
            y: furniture.position.y,
            z: furniture.position.z
          }
        };

        console.log('복제 성공: 싱글 가구', newId, '슬롯:', targetSlot);
        // 먼저 기존 선택 해제
        setSelectedPlacedModuleId(null);
        setSelectedFurnitureId(null);
        // 가구 추가
        addModuleFn(newFurniture);
        // 복제된 가구 선택
        setTimeout(() => {
          setSelectedPlacedModuleId(newId);
          setSelectedFurnitureId(newId);
          console.log('복제된 가구 선택:', newId);
        }, 100);
      }
    };

    window.addEventListener('duplicate-furniture', handleDuplicateFurniture);
    return () => {
      window.removeEventListener('duplicate-furniture', handleDuplicateFurniture);
    };
  }, [spaceInfo]);

  // 기둥 변경 감지하여 즉시 리렌더링 및 가구 업데이트
  useEffect(() => {
    if (spaceInfo) {
      console.log('🔄 Space3DView - 기둥 상태 변경 감지:', {
        columnsCount: spaceInfo.columns?.length || 0,
        columnsData: spaceInfo.columns?.map(col => ({ id: col.id, position: col.position, depth: col.depth }))
      });

      // 기둥 변경 시 가구의 adjustedWidth 업데이트
      updateFurnitureForColumns(spaceInfo);
    }
    // Three.js 씬 강제 업데이트는 ThreeCanvas에서 자동으로 처리됨
  }, [spaceInfo?.columns]); // updateFurnitureForColumns는 dependency에서 제외 (무한 루프 방지)

  // 가구 배치 시에도 adjustedWidth 업데이트
  useEffect(() => {
    console.log('🔄 [Space3DView] placedModules 변경 감지:', {
      count: placedModules.length,
      spaceInfo: !!spaceInfo,
      columns: spaceInfo?.columns?.length || 0
    });
    if (spaceInfo) {
      console.log('🔄 [Space3DView] updateFurnitureForColumns 호출');
      updateFurnitureForColumns(spaceInfo);
    }
  }, [placedModules.length, spaceInfo, updateFurnitureForColumns]); // 가구 개수 변경 시에만 호출


  // 2D 뷰 방향별 카메라 위치 계산 - threeUtils의 최적화된 거리 사용
  const cameraPosition = useMemo(() => {
    if (!spaceInfo) {
      return [0, 10, 20] as [number, number, number]; // 기본 카메라 위치
    }
    const { width, height, depth = 600 } = spaceInfo; // 기본 깊이 600mm

    // threeUtils의 calculateOptimalDistance 사용 (3D와 동일한 계산)
    const distance = calculateOptimalDistance(width, height, depth, placedModules.length);
    const centerX = 0;
    const centerY = mmToThreeUnits(height * 0.5);
    const centerZ = 0;

    // 2D front 위치 계산 - 3D와 동일한 거리 사용
    const frontPosition = [centerX, centerY, distance] as [number, number, number];

    // 3D 모드에서는 2D front와 완전히 동일한 위치 사용
    if (viewMode === '3D') {
      return frontPosition;
    }

    // 2D 모드에서는 방향별 카메라 위치 - 각 방향에 최적화된 거리 사용
    const distanceMultiplier = 2.0;
    switch (view2DDirection) {
      case 'front':
        // 정면: Z축에서 깊이를 고려한 최적 거리
        return [centerX, centerY, distance * distanceMultiplier] as [number, number, number];
      case 'left':
        // 좌측: X축에서 너비를 고려한 최적 거리
        const leftDistance = calculateOptimalDistance(depth, height, width, placedModules.length);
        return [-leftDistance * distanceMultiplier, centerY, centerZ] as [number, number, number];
      case 'right':
        // 우측: X축에서 너비를 고려한 최적 거리
        const rightDistance = calculateOptimalDistance(depth, height, width, placedModules.length);
        return [rightDistance * distanceMultiplier, centerY, centerZ] as [number, number, number];
      case 'top':
        // 상단: Y축에서 너비와 깊이를 고려한 최적 거리
        const topDistance = calculateOptimalDistance(width, depth, height, placedModules.length);
        // 상부뷰는 위에서 아래를 내려다보므로 centerY에 거리를 더함
        return [centerX, centerY + topDistance * distanceMultiplier, centerZ] as [number, number, number];
      case 'all':
        // 전체 뷰에서는 정면 카메라 위치 사용 (4분할은 별도 처리)
        return frontPosition;
      default:
        return frontPosition;
    }
  }, [spaceInfo?.width, spaceInfo?.height, spaceInfo?.depth, viewMode, view2DDirection, placedModules.length, isEmbedded]);
  
  // Canvas key를 완전히 제거하여 재생성 방지
  // viewMode나 view2DDirection 변경 시에도 Canvas를 재생성하지 않음
  
  // 드롭 이벤트 핸들러
  const handleDrop = (e: React.DragEvent) => {
    console.log('🎯 [Space3DView] handleDrop 호출됨!');
    e.preventDefault();
    e.stopPropagation();
    
    // Canvas 요소 찾기
    const canvas = e.currentTarget.querySelector('canvas');
    if (!canvas) {
      console.log('❌ [Space3DView] Canvas 요소를 찾을 수 없음');
      return;
    }

    // 드래그 데이터 확인
    const dragData = e.dataTransfer.getData('application/json');
    console.log('🎯 [Space3DView] Drag data:', dragData);
    if (!dragData) {
      console.log('❌ [Space3DView] Drag data가 없음');
      return;
    }

    try {
      const parsedData = JSON.parse(dragData);
      console.log('🎯 [Space3DView] Parsed drag data:', parsedData);
      
      // 기둥 드롭 처리
      if (parsedData.type === 'column') {
        handleColumnDrop(e, parsedData);
        return;
      }
      
      // 가벽 드롭 처리
      if (parsedData.type === 'wall') {
        handleWallDrop(e, parsedData);
        return;
      }
      
      // 패널B 드롭 처리
      if (parsedData.type === 'panelB') {
        handlePanelBDrop(e, parsedData);
        return;
      }
      
      // 기존 가구 드롭 처리
      const handleSlotDrop = window.handleSlotDrop;
      console.log('🎯 Space3DView - window.handleSlotDrop 확인:', {
        hasHandleSlotDrop: !!handleSlotDrop,
        typeofHandleSlotDrop: typeof handleSlotDrop,
        activeZone
      });
      
      if (typeof handleSlotDrop === 'function') {
        console.log('🎯 Space3DView handleDrop - activeZone:', activeZone);
        try {
          // activeZone은 항상 전달 (undefined일 수도 있음)
          const result = handleSlotDrop(e.nativeEvent, canvas, activeZone);
          console.log('🎯 Space3DView handleDrop - result:', result);
        } catch (error) {
          console.error('❌ handleSlotDrop 실행 중 에러:', error);
          console.error('에러 스택:', error.stack);
        }
      } else {
        console.error('❌ window.handleSlotDrop이 없습니다! 기본 가구 배치 처리를 시도합니다.');
        
        // 간단한 폴백 처리
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        console.log('🎯 간단한 가구 배치 시도:', {
          mouseX: x,
          mouseY: y,
          moduleData: parsedData.moduleData
        });
        
        // 첫 번째 빈 슬롯에 배치
        const placedModules = useFurnitureStore.getState().placedModules;
        const addModule = useFurnitureStore.getState().addModule;
        const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
        const hasFurniture = placedModules.length > 0 || true; // 가구를 추가하려고 하므로 true
        const indexing = calculateSpaceIndexing(spaceInfo, hasFurniture);
        
        // 첫 번째 빈 슬롯 찾기
        let availableSlot = -1;
        for (let i = 0; i < indexing.columnCount; i++) {
          const isOccupied = placedModules.some(m => m.slotIndex === i);
          if (!isOccupied) {
            availableSlot = i;
            break;
          }
        }
        
        if (availableSlot >= 0) {
          const customWidth = indexing.slotWidths?.[availableSlot] || indexing.columnWidth;
          const newModule = {
            id: `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            moduleId: parsedData.moduleData.id,
            position: { 
              x: indexing.threeUnitPositions[availableSlot], 
              y: 0, 
              z: 0 
            },
            rotation: 0,
            hasDoor: false,
            customDepth: Math.min(580, spaceInfo.depth * 0.9),
            slotIndex: availableSlot,
            isDualSlot: parsedData.moduleData.id.startsWith('dual-'),
            isValidInCurrentSpace: true,
            adjustedWidth: parsedData.moduleData.dimensions.width,
            hingePosition: 'right' as const,
            customWidth: customWidth
          };
          
          addModule(newModule);
          console.log('✅ 폴백 가구 배치 성공:', newModule);
        }
      }
    } catch (error) {
      console.error('드롭 데이터 파싱 오류:', error);
      console.error('에러 스택:', error.stack);
    }
  };

  // 기둥 드롭 핸들러
  const handleColumnDrop = (e: React.DragEvent, columnData: any) => {
    // 캔버스 중앙에 기둥 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산
    
    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const columnDepthM = (columnData.depth || 730) * 0.01; // columnData에서 깊이 가져오기
    const zPosition = -(spaceDepthM / 2) + (columnDepthM / 2); // 뒷벽에 맞닿도록
    
    // 기둥 생성 (바닥 기준으로 위치 설정)
    const newColumn = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: columnData.width || 300, // columnData에서 폭 가져오기
      height: columnData.height || spaceInfo?.height || 2400, // columnData에서 높이 가져오기
      depth: columnData.depth || 730, // columnData에서 깊이 가져오기
      color: columnData.color || '#888888',
      material: columnData.material || 'concrete'
    };

    console.log('🏗️ 기둥 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      columnDepthM,
      column: newColumn
    });
    
    // 스토어에 기둥 추가
    const { addColumn } = useSpaceConfigStore.getState();
    addColumn(newColumn);
  };

  // 가벽 드롭 핸들러
  const handleWallDrop = (e: React.DragEvent, wallData: any) => {
    // 캔버스 중앙에 가벽 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산
    
    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const wallDepthM = (wallData.depth || 730) * 0.01; // 730mm를 Three.js 단위로 변환
    const zPosition = -(spaceDepthM / 2) + (wallDepthM / 2); // 뒷벽에 맞닿도록
    
    // 가벽 생성 (바닥 기준으로 위치 설정)
    const newWall = {
      id: `wall-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: wallData.width || 120, // 120mm 
      height: wallData.height || spaceInfo?.height || 2400, // 공간 높이와 동일 (2400mm)
      depth: wallData.depth || 730, // 730mm
      color: wallData.color || '#888888',
      material: wallData.material || 'concrete'
    };

    console.log('🧱 가벽 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      wallDepthM,
      wall: newWall
    });
    
    // 스토어에 가벽 추가
    addWall(newWall);
  };
  
  // 패널B 드롭 핸들러
  const handlePanelBDrop = (e: React.DragEvent, panelBData: any) => {
    // 캔버스 중앙에 패널B 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산
    
    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const panelDepthM = (panelBData.depth || 730) * 0.01; // panelBData에서 깊이 가져오기
    const zPosition = -(spaceDepthM / 2) + (panelDepthM / 2); // 뒷벽에 맞닿도록
    
    // 패널B 생성 (바닥 기준으로 위치 설정)
    const newPanelB = {
      id: `panelB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: panelBData.width || 600, // panelBData에서 폭 가져오기
      height: 18, // 18mm 고정
      depth: panelBData.depth || 730, // panelBData에서 깊이 가져오기
      color: panelBData.color || '#8B4513',
      material: panelBData.material || 'wood',
      orientation: 'horizontal' as const
    };

    console.log('🪵 패널B 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      panelDepthM,
      panelB: newPanelB
    });
    
    // 스토어에 패널B 추가
    const { addPanelB } = useSpaceConfigStore.getState();
    addPanelB(newPanelB);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // 드롭 허용
    // 너무 많은 로그를 방지하기 위해 throttle (100ms마다 한 번만 로그)
    const now = Date.now();
    if (!window._lastDragOverLog || now - window._lastDragOverLog > 100) {
      console.log('🔥 [Space3DView] handleDragOver called');
      window._lastDragOverLog = now;
    }
  };
  
  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 캔버스 정리
      const cleanupCanvases = () => {
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
          // 2D 컨텍스트를 사용하여 캔버스 지우기
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // WebGL 컨텍스트 정리
          const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
          if (gl && !gl.isContextLost()) {
            try {
              // 타입 안전하게 WebGL 컨텍스트 손실 처리
              const ext = gl.getExtension('WEBGL_lose_context');
              if (ext) {
                ext.loseContext();
              }
            } catch (e) {
              console.log('WebGL context cleanup error:', e);
            }
          }
        });
      };
      
      cleanupCanvases();
    };
  }, []);
  

  // 가구의 경계 계산 함수
  const calculateFurnitureBounds = useMemo(() => {
    if (!spaceInfo || placedModules.length === 0) {
      return null;
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    placedModules.forEach(module => {
      const moduleData = getModuleById(module.moduleId);
      if (!moduleData) return;
      
      const width = mmToThreeUnits(module.customWidth || moduleData.width);
      const height = mmToThreeUnits(module.customHeight || moduleData.height);
      const depth = mmToThreeUnits(module.customDepth || moduleData.depth);
      
      const x = module.position.x;
      const y = module.position.y;
      const z = module.position.z;
      
      minX = Math.min(minX, x - width / 2);
      maxX = Math.max(maxX, x + width / 2);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);
      minZ = Math.min(minZ, z - depth / 2);
      maxZ = Math.max(maxZ, z + depth / 2);
    });
    
    // 공간의 경계도 포함
    const spaceWidth = mmToThreeUnits(spaceInfo.width);
    const spaceHeight = mmToThreeUnits(spaceInfo.height);
    const spaceDepth = mmToThreeUnits(spaceInfo.depth || 1500);
    
    minX = Math.min(minX, -spaceWidth / 2);
    maxX = Math.max(maxX, spaceWidth / 2);
    minY = 0;
    maxY = Math.max(maxY, spaceHeight);
    minZ = Math.min(minZ, -spaceDepth / 2);
    maxZ = Math.max(maxZ, spaceDepth / 2);
    
    return {
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
      },
      size: {
        width: maxX - minX,
        height: maxY - minY,
        depth: maxZ - minZ
      }
    };
  }, [spaceInfo, placedModules]);

  // 각 뷰에 최적화된 카메라 위치 계산
  const getOptimizedCameraForView = (viewDirection: 'front' | 'left' | 'right' | 'top') => {
    const bounds = calculateFurnitureBounds;
    
    // 가구가 없을 때도 공간 기준으로 계산
    const spaceWidth = spaceInfo?.width || 3000;
    const spaceHeight = spaceInfo?.height || 2400;
    const spaceDepth = spaceInfo?.depth || 1500;
    
    if (!bounds) {
      // 가구가 없을 때는 공간 중심과 크기 사용
      // calculateCameraTarget과 동일한 계산 사용
      const center = { 
        x: 0, 
        y: mmToThreeUnits(spaceHeight * 0.5), // calculateCameraTarget과 동일
        z: 0 
      };
      const size = { 
        width: mmToThreeUnits(spaceWidth), 
        height: mmToThreeUnits(spaceHeight), 
        depth: mmToThreeUnits(spaceDepth) 
      };
      
      let distance;
      let position;
      let up: [number, number, number] = [0, 1, 0];
      const distanceMultiplier = 2.0; // 2D 모드 카메라 거리를 2배로

      switch (viewDirection) {
        case 'front':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceWidth, spaceHeight, spaceDepth, placedModules.length) * distanceMultiplier;
          position = [center.x, center.y, center.z + distance];
          up = [0, 1, 0];
          break;

        case 'top':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceWidth, spaceDepth, spaceHeight, placedModules.length) * distanceMultiplier;
          position = [center.x, center.y + distance, center.z];
          up = [0, 0, -1];
          break;

        case 'left':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceDepth, spaceHeight, spaceWidth, placedModules.length) * distanceMultiplier;
          position = [center.x - distance, center.y, center.z];
          up = [0, 1, 0];
          break;

        case 'right':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceDepth, spaceHeight, spaceWidth, placedModules.length) * distanceMultiplier;
          position = [center.x + distance, center.y, center.z];
          up = [0, 1, 0];
          break;
      }
      
      return {
        position: position as [number, number, number],
        target: [center.x, center.y, center.z] as [number, number, number],
        up: up
      };
    }
    
    // target은 공간 중심 사용
    const center = { x: 0, y: mmToThreeUnits((spaceInfo?.height || 2400) * 0.5), z: 0 };
    const size = bounds.size;
    
    // mm 단위로 역변환 (size는 Three.js 단위이므로)
    const sizeInMm = {
      width: threeUnitsToMm(size.width),
      height: threeUnitsToMm(size.height),
      depth: threeUnitsToMm(size.depth)
    };
    
    let distance;
    let position;
    let up: [number, number, number] = [0, 1, 0]; // 기본 up vector
    const distanceMultiplier = 2.0; // 2D 모드 카메라 거리를 2배로

    switch (viewDirection) {
      case 'front':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.width, sizeInMm.height, sizeInMm.depth, placedModules.length) * distanceMultiplier;
        position = [center.x, center.y, center.z + distance];
        up = [0, 1, 0]; // Y축이 위
        break;

      case 'top':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.width, sizeInMm.depth, sizeInMm.height, placedModules.length) * distanceMultiplier;
        position = [center.x, center.y + distance, center.z];
        up = [0, 0, -1]; // 상부뷰에서는 -Z축이 위 (앞쪽이 위)
        break;

      case 'left':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.depth, sizeInMm.height, sizeInMm.width, placedModules.length) * distanceMultiplier;
        position = [center.x - distance, center.y, center.z];
        up = [0, 1, 0]; // Y축이 위
        break;

      case 'right':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.depth, sizeInMm.height, sizeInMm.width, placedModules.length) * distanceMultiplier;
        position = [center.x + distance, center.y, center.z];
        up = [0, 1, 0]; // Y축이 위
        break;
    }
    
    return {
      position: position as [number, number, number],
      target: [center.x, center.y, center.z] as [number, number, number],
      up: up
    };
  };

  // 현재 활성화된 섬네일 추적
  const [activeQuadrant, setActiveQuadrant] = React.useState<'front' | 'top' | 'left' | 'right' | null>(null);
  
  // 전환 애니메이션 처리 함수 - 전체화면 확장 버튼 클릭 시에만 사용
  const handleQuadrantExpand = (direction: 'front' | 'top' | 'left' | 'right') => {
    // 전체화면으로 전환
    setView2DDirection(direction);
    setUIViewMode('2D');
  };

  // 4분할 뷰 렌더링
  if (viewMode === '2D' && view2DDirection === 'all') {
    return (
      <ViewerThemeProvider viewMode={viewMode}>
        <Space3DViewProvider spaceInfo={spaceInfo} svgSize={svgSize} renderMode={renderMode} viewMode={viewMode} activeZone={activeZone}>
          <div 
          style={{ 
            width: '100%', 
            height: '100%', 
            minHeight: '400px',
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '0',
            backgroundColor: colors.primary || '#4CAF50',
            overflow: 'hidden'
          }}
        >
          {/* 가로 중앙선 */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '1px',
            backgroundColor: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
            zIndex: 10,
            transform: 'translateY(-50%)'
          }} />
          
          {/* 세로 중앙선 */}
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: '1px',
            backgroundColor: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
            zIndex: 10,
            transform: 'translateX(-50%)'
          }} />
          {/* 좌측 상단: 정면 뷰 */}
          <div
            onClick={() => setActiveQuadrant(activeQuadrant === 'front' ? null : 'front')}
            style={{
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              border: activeQuadrant === 'front' ? '3px solid #00ffcc' : '1px solid transparent',
              transition: 'border 0.3s ease',
              boxSizing: 'border-box',
              cursor: 'pointer'
            }}>
            <ThreeCanvas 
              cameraPosition={getOptimizedCameraForView('front').position}
              cameraTarget={getOptimizedCameraForView('front').target}
              cameraUp={getOptimizedCameraForView('front').up}
              viewMode="2D"
              view2DDirection="front"
              renderMode={renderMode}
              isSplitView={true}
            >
              <QuadrantContent
                viewDirection="front"
                spaceInfo={spaceInfo}
                materialConfig={materialConfig}
                showAll={showAll}
                showFrame={showFrame}
                activeZone={activeZone}
                showDimensions={showDimensions}
                showDimensionsText={showDimensionsText}
                showGuides={showGuides}
                showAxis={showAxis}
                isStep2={isStep2}
                showFurniture={showFurniture}
                readOnly={readOnly}
              />
            </ThreeCanvas>
            <div style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor: 'rgba(18,18,18,0.7)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>front</div>
            <button
              onClick={() => handleQuadrantExpand('front')}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              title="전체화면으로 보기"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>

          {/* 우측 상단: 상부 뷰 */}
          <div
            onClick={() => setActiveQuadrant(activeQuadrant === 'top' ? null : 'top')}
            style={{
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              border: activeQuadrant === 'top' ? '3px solid #00ffcc' : '1px solid transparent',
              transition: 'border 0.3s ease',
              boxSizing: 'border-box',
              cursor: 'pointer'
            }}>
            <ThreeCanvas 
              cameraPosition={getOptimizedCameraForView('top').position}
              cameraTarget={getOptimizedCameraForView('top').target}
              cameraUp={getOptimizedCameraForView('top').up}
              viewMode="2D"
              view2DDirection="top"
              renderMode={renderMode}
              isSplitView={true}
            >
              <QuadrantContent
                viewDirection="top"
                spaceInfo={spaceInfo}
                materialConfig={materialConfig}
                showAll={showAll}
                showFrame={showFrame}
                activeZone={activeZone}
                showDimensions={showDimensions}
                showDimensionsText={showDimensionsText}
                showGuides={showGuides}
                showAxis={showAxis}
                isStep2={isStep2}
                showFurniture={showFurniture}
                readOnly={readOnly}
              />
            </ThreeCanvas>
            <div style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor: 'rgba(18,18,18,0.7)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>top</div>
            <button
              onClick={() => handleQuadrantExpand('top')}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              title="전체화면으로 보기"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>

          {/* 좌측 하단: 좌측면 뷰 */}
          <div
            onClick={(e) => {
              // SlotSelector 영역 클릭 시 무시
              if ((e.target as HTMLElement).closest('[data-slot-selector]')) return;
              setActiveQuadrant(activeQuadrant === 'left' ? null : 'left');
            }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              border: activeQuadrant === 'left' ? '3px solid #00ffcc' : '1px solid transparent',
              transition: 'border 0.3s ease',
              boxSizing: 'border-box',
              cursor: 'pointer'
            }}>
            <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
              <ThreeCanvas
                cameraPosition={getOptimizedCameraForView('left').position}
                cameraTarget={getOptimizedCameraForView('left').target}
                cameraUp={getOptimizedCameraForView('left').up}
                viewMode="2D"
                view2DDirection="left"
                renderMode={renderMode}
                isSplitView={true}
              >
                <QuadrantContent
                  viewDirection="left"
                  spaceInfo={spaceInfo}
                  materialConfig={materialConfig}
                  showAll={showAll}
                  showFrame={showFrame}
                  activeZone={activeZone}
                  showDimensions={showDimensions}
                  showDimensionsText={showDimensionsText}
                  showGuides={showGuides}
                  showAxis={showAxis}
                  isStep2={isStep2}
                  showFurniture={showFurniture}
                  readOnly={readOnly}
                />
              </ThreeCanvas>
            </div>
            <div style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor: 'rgba(18,18,18,0.7)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 10
            }}>left</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleQuadrantExpand('left');
              }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s ease',
                zIndex: 10
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              title="전체화면으로 보기"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>

          {/* 우측 하단: 우측면 뷰 */}
          <div
            onClick={(e) => {
              // SlotSelector 영역 클릭 시 무시
              if ((e.target as HTMLElement).closest('[data-slot-selector]')) return;
              setActiveQuadrant(activeQuadrant === 'right' ? null : 'right');
            }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              border: activeQuadrant === 'right' ? '3px solid #00ffcc' : '1px solid transparent',
              transition: 'border 0.3s ease',
              boxSizing: 'border-box',
              cursor: 'pointer'
            }}>
            <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
              <ThreeCanvas
                cameraPosition={getOptimizedCameraForView('right').position}
                cameraTarget={getOptimizedCameraForView('right').target}
                cameraUp={getOptimizedCameraForView('right').up}
                viewMode="2D"
                view2DDirection="right"
                renderMode={renderMode}
                isSplitView={true}
              >
                <QuadrantContent
                  viewDirection="right"
                  spaceInfo={spaceInfo}
                  materialConfig={materialConfig}
                  showAll={showAll}
                  showFrame={showFrame}
                  activeZone={activeZone}
                  showDimensions={showDimensions}
                  showDimensionsText={showDimensionsText}
                  showGuides={showGuides}
                  showAxis={showAxis}
                  isStep2={isStep2}
                  readOnly={readOnly}
                  showFurniture={showFurniture}
                />
              </ThreeCanvas>
            </div>
            <div style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor: 'rgba(18,18,18,0.7)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 10
            }}>right</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleQuadrantExpand('right');
              }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s ease',
                zIndex: 10
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              title="전체화면으로 보기"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>

          {/* 4분할 뷰용 슬롯 선택 버튼 - Canvas 위에 오버레이 */}
          {/* 좌측하단 (left) 패널용 */}
          <div
            data-slot-selector="true"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '25%',
              bottom: '8px',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              pointerEvents: 'auto'
            }}
          >
            <SlotSelector forSplitView={true} splitViewDirection="left" compact={true} />
          </div>
          {/* 우측하단 (right) 패널용 */}
          <div
            data-slot-selector="true"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '75%',
              bottom: '8px',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              pointerEvents: 'auto'
            }}
          >
            <SlotSelector forSplitView={true} splitViewDirection="right" compact={true} />
          </div>
          </div>
        </Space3DViewProvider>
      </ViewerThemeProvider>
    );
  }

  return (
    <ViewerThemeProvider viewMode={viewMode}>
      <Space3DViewProvider spaceInfo={spaceInfo} svgSize={svgSize} renderMode={renderMode} viewMode={viewMode} activeZone={activeZone}>
        <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: readOnly ? 'unset' : '400px',
          position: 'relative'
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        data-viewer-container="true"
      >
        <ThreeCanvas
          cameraPosition={cameraPosition}
          cameraTarget={calculateCameraTarget(spaceInfo?.height || 2400)}
          viewMode={viewMode}
          view2DDirection={view2DDirection}
          renderMode={renderMode}
          sceneRef={sceneRef}
        >
          <React.Suspense fallback={null}>
            {/* 배경 클릭 감지용 평면 - selectedFurnitureId 해제 */}
            <mesh
              position={[0, 0, -100]}
              onClick={(e) => {
                e.stopPropagation();
                const { selectedFurnitureId, setSelectedFurnitureId } = useUIStore.getState();
                if (selectedFurnitureId) {
                  console.log('🔵 [Space3DView] 배경 클릭 - selectedFurnitureId 해제:', selectedFurnitureId);
                  setSelectedFurnitureId(null);
                }
              }}
            >
              <planeGeometry args={[1000, 1000]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
            {/* 확실히 작동하는 CAD 그리드 - 2D와 3D 모두에서 작동 */}
            <CADGrid viewMode={viewMode} view2DDirection={view2DDirection} enabled={showDimensions && showGuides} showAxis={showDimensions && showAxis} />
            
            {/* 조명 시스템 - 2D 모드에서는 그림자 없음 */}
            
            {/* 메인 자연광 - 3D 모드에서만 그림자 생성 */}
            <directionalLight 
              position={[5, 15, 20]} 
              intensity={2.5} 
              color="#ffffff"
              castShadow={viewMode === '3D'}
              shadow-mapSize-width={4096}
              shadow-mapSize-height={4096}
              shadow-camera-far={50}
              shadow-camera-left={-25}
              shadow-camera-right={25}
              shadow-camera-top={25}
              shadow-camera-bottom={-25}
              shadow-bias={-0.0005}
              shadow-radius={12}
              shadow-normalBias={0.02}
            />
            
            {/* 부드러운 필 라이트 - 그림자 대비 조절 */}
            <directionalLight 
              position={[-8, 10, 15]} 
              intensity={0.6} 
              color="#ffffff"
            />
            <directionalLight 
              position={[8, 10, 15]} 
              intensity={0.6} 
              color="#ffffff"
            />
            
            {/* 환경광 - 2D 모드에서는 더 밝게 */}
            <ambientLight intensity={viewMode === '2D' ? 0.8 : 0.5} color="#ffffff" />
            
            {/* HDRI 환경맵 제거 - 순수 조명만 사용 */}
            {/* Environment 컴포넌트가 렌더링을 방해할 수 있으므로 비활성화 */}
            
            {/* 기본 요소들 */}
            {console.log('🔴 Space3DView 메인 Room 렌더링')}
            <Room
              spaceInfo={spaceInfo}
              viewMode={viewMode}
              view2DDirection={view2DDirection}
              renderMode={renderMode}
              materialConfig={materialConfig}
              showAll={showAll}
              showFrame={showFrame}
              showDimensions={showDimensions}
              showGuides={showGuides}
              isStep2={isStep2}
              activeZone={activeZone}
              showFurniture={showFurniture}
              hideEdges={hideEdges}
              readOnly={readOnly}
            />
            
            {/* 단내림 공간 렌더링 */}
            <DroppedCeilingSpace spaceInfo={spaceInfo} />
            
            {/* 상하부장 사이 백패널 렌더링 */}
            <BackPanelBetweenCabinets 
              placedModules={placedModules}
              spaceInfo={spaceInfo}
            />
            
            {/* 상부장 간접조명 및 띄워서 배치 간접조명 렌더링 */}
            <UpperCabinetIndirectLight
              placedModules={placedModules}
              spaceInfo={spaceInfo}
            />
            
            {/* 기둥 에셋 렌더링 */}
            {(spaceInfo?.columns || []).map((column) => {
                // 기둥이 단내림 영역에 있는지 확인
                let columnHeight = column.height || spaceInfo.height || 2400; // 기본값은 공간 높이
              if (spaceInfo.droppedCeiling?.enabled) {
                const totalWidth = spaceInfo.width;
                const droppedWidth = spaceInfo.droppedCeiling.width || 900;
                const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
                const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
                
                // 기둥의 X 좌표 (mm 단위로 변환)
                const columnXMm = column.position[0] * 100; // Three.js 단위를 mm로 변환
                const centerX = 0; // 공간 중심
                const leftBoundary = centerX - totalWidth / 2;
                const rightBoundary = centerX + totalWidth / 2;
                
                // 단내림 영역 경계 계산
                let droppedStartX, droppedEndX;
                if (droppedPosition === 'left') {
                  droppedStartX = leftBoundary;
                  droppedEndX = leftBoundary + droppedWidth;
                } else {
                  droppedStartX = rightBoundary - droppedWidth;
                  droppedEndX = rightBoundary;
                }
                
                // 기둥이 단내림 영역에 있으면 높이 조정
                if (columnXMm >= droppedStartX && columnXMm <= droppedEndX) {
                  columnHeight = column.height - dropHeight;
                }
              }
              
              return (
                <React.Fragment key={column.id}>
                  <ColumnAsset
                    id={column.id}
                    position={column.position}
                    width={column.width} // mm 단위 그대로 전달
                    height={columnHeight}
                    depth={column.depth}
                    color={column.color}
                    hasBackPanelFinish={column.hasBackPanelFinish}
                    spaceInfo={spaceInfo}
                    renderMode={renderMode}
                    onPositionChange={(id, newPosition) => {
                      throttledUpdateColumn(id, { position: newPosition });
                    }}
                    onRemove={(id) => {
                      removeColumn(id);
                    }}
                  />
                {/* 기둥 벽면 간격 라벨 (2D 모드에서 기둥 편집 모달이 열렸을 때만 표시) */}
                {activePopup.type === 'columnEdit' && activePopup.id === column.id && (
                  <ColumnDistanceLabels
                    column={column}
                    spaceInfo={spaceInfo}
                    onPositionChange={(columnId, newPosition) => {
                      throttledUpdateColumn(columnId, { position: newPosition });
                    }}
                    onColumnUpdate={(columnId, updates) => {
                      updateColumn(columnId, updates);
                    }}
                    showLabels={true}
                  />
                )}
              </React.Fragment>
              );
            })}
            
            {/* 가벽 에셋 렌더링 */}
            {(spaceInfo?.walls || []).map((wall) => {
              // 가벽이 단내림 영역에 있는지 확인
              let wallHeight = wall.height;
              if (spaceInfo.droppedCeiling?.enabled) {
                const totalWidth = spaceInfo.width;
                const droppedWidth = spaceInfo.droppedCeiling.width || 900;
                const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
                const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
                
                // 가벽의 X 좌표 (mm 단위로 변환)
                const wallXMm = wall.position[0] * 100; // Three.js 단위를 mm로 변환
                const centerX = 0; // 공간 중심
                const leftBoundary = centerX - totalWidth / 2;
                const rightBoundary = centerX + totalWidth / 2;
                
                // 단내림 영역 경계 계산
                let droppedStartX, droppedEndX;
                if (droppedPosition === 'left') {
                  droppedStartX = leftBoundary;
                  droppedEndX = leftBoundary + droppedWidth;
                } else {
                  droppedStartX = rightBoundary - droppedWidth;
                  droppedEndX = rightBoundary;
                }
                
                console.log('🏗️ 가벽 단내림 체크:', {
                  wallId: wall.id,
                  wallXMm,
                  droppedStartX,
                  droppedEndX,
                  isInDroppedArea: wallXMm >= droppedStartX && wallXMm <= droppedEndX,
                  originalHeight: wall.height,
                  dropHeight,
                  wallHeight
                });
                
                // 가벽이 단내림 영역에 있으면 높이 조정
                if (wallXMm >= droppedStartX && wallXMm <= droppedEndX) {
                  wallHeight = wall.height - dropHeight;
                  console.log('🏗️ 가벽 높이 조정됨:', { wallId: wall.id, originalHeight: wall.height, adjustedHeight: wallHeight });
                }
              }
              
              return (
              <WallAsset
                key={wall.id}
                id={wall.id}
                position={wall.position}
                width={wall.width} // mm 단위 그대로 전달
                height={wallHeight}
                depth={wall.depth}
                color={wall.color}
                spaceInfo={spaceInfo}
                renderMode={renderMode}
                onPositionChange={(id, newPosition) => {
                  updateWall(id, { position: newPosition });
                }}
                onRemove={(id) => {
                  removeWall(id);
                }}
              />
              );
            })}
            
            {/* 패널B 렌더링 */}
            {spaceInfo?.panelBs?.map((panelB) => (
              <PanelBAsset
                key={panelB.id}
                id={panelB.id}
                position={panelB.position}
                width={panelB.width}
                height={panelB.height}
                depth={panelB.depth}
                color={panelB.color}
                renderMode={viewMode === '3D' ? 'solid' : 'wireframe'}
                onPositionChange={(id, newPos) => updatePanelB(id, { position: newPos })}
                onRemove={removePanelB}
                spaceInfo={spaceInfo}
              />
            ))}
            
            {/* 패널B 생성 마커 */}
            {isPanelBCreationMode && viewMode === '3D' && (
              <PanelBCreationMarkers 
                spaceInfo={spaceInfo}
              />
            )}
            
            {/* 기둥 드래그 시 고스트 프리뷰 */}
            <ColumnGhostPreview spaceInfo={spaceInfo} />
            
            
            {/* 기둥 생성 마커는 드래그 앤 드롭 방식으로 대체됨 */}
            
            {/* Configurator에서 표시되는 요소들 */}
            {/* 컬럼 가이드 표시 - 2D와 3D 모두에서 showDimensions와 showAll(가이드)이 모두 true일 때만 */}
            {showDimensions && showAll && <ColumnGuides viewMode={viewMode} />}
            
            {/* CAD 스타일 치수/가이드 표시 - 3D 모드 또는 2D 정면/탑뷰에서 표시 */}
            {showDimensions && showDimensionsText && (viewMode === '3D' || (viewMode === '2D' && view2DDirection !== 'left' && view2DDirection !== 'right')) && (
              <CleanCAD2D
                viewDirection={viewMode === '3D' ? '3D' : view2DDirection}
                showDimensions={dimensionDisplayEnabled}
                isStep2={isStep2}
              />
            )}

            {/* 측면뷰 전용 치수 표시 - 2D 측면뷰에서만 (Configurator 전용) */}
            {showDimensions && showDimensionsText && !isStep2 && viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') && (
              <CADDimensions2D
                viewDirection={view2DDirection}
                showDimensions={dimensionDisplayEnabled}
                isSplitView={true}
              />
            )}

            {/* PlacedFurniture는 Room 내부에서 렌더링되므로 중복 제거 */}

            <SlotDropZonesSimple spaceInfo={spaceInfo} showAll={showAll} showDimensions={showDimensions} viewMode={viewMode} />

            {/* 슬롯 배치 인디케이터 - 가구 선택 시 + 아이콘 표시 */}
            <SlotPlacementIndicators onSlotClick={placeFurniture} />

            {/* 내경 치수 표시 - showDimensions 상태에 따라 표시/숨김 */}
            <InternalDimensionDisplay />

            {/* CAD 측정 도구 - 2D 모드에서만 표시 */}
            {viewMode === '2D' && <MeasurementTool viewDirection={view2DDirection} />}
          </React.Suspense>
        </ThreeCanvas>

        {/* 간접조명 툴바 - 3D 모드에서만 표시 (임베디드 모드에서는 숨김) */}
        {!isEmbedded && <ViewerToolbar viewMode={viewMode} />}

        {/* 분할 모드 버튼 - 2D 모드에서만 표시 (임베디드 모드에서는 숨김) */}
        {!isEmbedded && viewMode === '2D' && view2DDirection !== 'all' && (
          <button
            onClick={() => {
              setView2DDirection('all');
            }}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              width: '36px',
              height: '36px',
              backgroundColor: view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)',
              border: `1px solid ${view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
              borderRadius: '4px',
              color: view2DTheme === 'dark' ? '#ffffff' : '#000000',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              zIndex: 20,
              padding: '0',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.9)' : 'rgba(255,255,255,1)';
              e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)';
              e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="4분할 뷰로 보기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="8" height="8" />
              <rect x="13" y="3" width="8" height="8" />
              <rect x="3" y="13" width="8" height="8" />
              <rect x="13" y="13" width="8" height="8" />
            </svg>
          </button>
        )}

        {/* 측정 도구 버튼 - 2D 모드에서만 표시 (임베디드 모드에서는 숨김) */}
        {!isEmbedded && viewMode === '2D' && view2DDirection !== 'all' && (
          <>
            <button
              onClick={() => {
                const { setEraserMode } = useUIStore.getState();
                console.log('📏 측정 모드 토글:', !isMeasureMode);
                // 측정 모드 활성화 시 지우개 모드 비활성화
                setEraserMode(false);
                toggleMeasureMode();
              }}
              style={{
                position: 'absolute',
                top: '56px', // 분할 버튼(36px) + 간격(10px) + 상단 여백(10px)
                right: '10px',
                width: '36px',
                height: '36px',
                backgroundColor: isMeasureMode
                  ? colors.primary
                  : (view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)'),
                border: `1px solid ${isMeasureMode
                  ? colors.primary
                  : (view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)')}`,
                borderRadius: '4px',
                color: isMeasureMode ? '#ffffff' : (view2DTheme === 'dark' ? '#ffffff' : '#000000'),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 20,
                padding: '0',
                boxShadow: isMeasureMode ? `0 2px 8px ${colors.primary}40` : '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                if (!isMeasureMode) {
                  e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.9)' : 'rgba(255,255,255,1)';
                  e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
                }
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                if (!isMeasureMode) {
                  e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)';
                  e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                }
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="CAD 스타일 치수 측정"
            >
              <RxDimensions size={20} />
            </button>

            {/* 치수 지우개 버튼 - 측정 도구 버튼 바로 아래 */}
            <button
              onClick={() => {
                const { toggleEraserMode, setMeasureMode } = useUIStore.getState();
                console.log('🗑️ 지우개 모드 토글');
                // 지우개 모드 활성화 시 측정 모드 비활성화
                setMeasureMode(false);
                toggleEraserMode();
              }}
              style={{
                position: 'absolute',
                top: '102px', // 측정 버튼(56px + 36px) + 간격(10px)
                right: '10px',
                width: '36px',
                height: '36px',
                backgroundColor: isEraserMode
                  ? colors.primary
                  : (view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)'),
                border: `1px solid ${isEraserMode
                  ? colors.primary
                  : (view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)')}`,
                borderRadius: '4px',
                color: isEraserMode ? '#ffffff' : (view2DTheme === 'dark' ? '#ffffff' : '#000000'),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 20,
                padding: '0',
                boxShadow: isEraserMode ? `0 2px 8px ${colors.primary}40` : '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                if (!isEraserMode) {
                  e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.9)' : 'rgba(255,255,255,1)';
                  e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
                }
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                if (!isEraserMode) {
                  e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)';
                  e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                }
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="치수 지우개 (클릭하여 삭제 모드 활성화)"
            >
              <LuEraser size={20} />
            </button>
          </>
        )}


        </div>
      </Space3DViewProvider>
    </ViewerThemeProvider>
  );
};

// 4분할 뷰를 위한 별도 컴포넌트
const QuadrantContent: React.FC<{
  viewDirection: 'front' | 'left' | 'right' | 'top';
  spaceInfo: any;
  materialConfig: any;
  showAll: boolean;
  showFrame: boolean;
  activeZone?: 'normal' | 'dropped';
  showDimensions: boolean;
  showDimensionsText: boolean;
  showGuides: boolean;
  showAxis: boolean;
  isStep2?: boolean;
  throttledUpdateColumn?: (id: string, updates: any) => void;
  showFurniture?: boolean;
  readOnly?: boolean;
}> = ({ viewDirection, spaceInfo, materialConfig, showAll, showFrame, showDimensions, showDimensionsText, showGuides, showAxis, isStep2, throttledUpdateColumn, activeZone, showFurniture, readOnly = false }) => {
  const { placedModules } = useFurnitureStore();
  const { updateColumn, removeColumn, updateWall, removeWall } = useSpaceConfigStore();
  const { activePopup } = useUIStore();
  const dimensionDisplayEnabled = showDimensions && showDimensionsText;
  
  // throttledUpdateColumn이 전달되지 않으면 기본 updateColumn 사용
  const handleUpdateColumn = throttledUpdateColumn || updateColumn;

  return (
    <React.Suspense fallback={null}>
      {/* CAD 그리드 */}
      <CADGrid viewMode="2D" view2DDirection={viewDirection} enabled={showDimensions && showGuides} showAxis={showDimensions && showAxis} />
      
      {/* 조명 시스템 */}
      <directionalLight 
        position={[5, 15, 20]} 
        intensity={2.5} 
        color="#ffffff"
      />
      <directionalLight 
        position={[-8, 10, 15]} 
        intensity={0.6} 
        color="#ffffff"
      />
      <directionalLight 
        position={[8, 10, 15]} 
        intensity={0.6} 
        color="#ffffff"
      />
      <ambientLight intensity={0.8} color="#ffffff" />

      {/* 컬럼 가이드 표시 */}
      {showDimensions && showAll && <ColumnGuides viewMode="2D" />}
      
      {/* CAD 스타일 치수/가이드 표시 (측면뷰 제외) */}
      {showDimensions && showDimensionsText && viewDirection !== 'left' && viewDirection !== 'right' && (
        <CleanCAD2D
          viewDirection={viewDirection}
          showDimensions={dimensionDisplayEnabled}
          isStep2={isStep2}
        />
      )}

      {/* 측면뷰 전용 치수 표시 (CNCOptimizer/Step2 전용) */}
      {showDimensions && showDimensionsText && isStep2 && (viewDirection === 'left' || viewDirection === 'right') && (
        <CADDimensions2D
          viewDirection={viewDirection}
          showDimensions={dimensionDisplayEnabled}
          isSplitView={false}
        />
      )}
      
      {/* 투명 슬롯매쉬 - 탑뷰에서는 제외 */}
      {viewDirection !== 'top' && <FurniturePlacementPlane spaceInfo={spaceInfo} />}
      
      {/* 슬롯 드롭존 */}
      <SlotDropZonesSimple spaceInfo={spaceInfo} showAll={showAll} showDimensions={showDimensions} viewMode="2D" />
      
      {/* Room 컴포넌트 - 프레임, 도어, 가구를 포함 */}
      {console.log('🔵 QuadrantContent - Room 렌더링:', {
        viewDirection,
        spaceInfo: !!spaceInfo,
        showFrame,
        placedModulesCount: placedModules?.length || 0
      })}
      <Room
        spaceInfo={spaceInfo}
        viewMode="2D"
        view2DDirection={viewDirection}
        renderMode="solid"
        showDimensions={showDimensions}
        showAll={showAll}
        isStep2={isStep2}
        showFrame={showFrame}
        materialConfig={materialConfig}
        activeZone={activeZone}
        showFurniture={showFurniture}
        readOnly={readOnly}
      />
    </React.Suspense>
  );
};

export default React.memo(Space3DView); 
