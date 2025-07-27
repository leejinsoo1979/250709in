import React, { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { ColumnIndexer } from '@/editor/shared/utils/indexing/ColumnIndexer';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getModuleById, ModuleData } from '@/data/modules';
import BoxModule from '../modules/BoxModule';
import { useUIStore } from '@/store/uiStore';
import { 
  getSlotIndexFromMousePosition as getSlotIndexFromRaycast,
  isDualFurniture,
  calculateSlotDimensions,
  calculateSlotStartY,
  calculateFurniturePosition
} from '../../utils/slotRaycast';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots, adjustFurniturePositionForColumn, calculateFurnitureWidthWithColumn, convertDualToSingleIfNeeded, calculateFurnitureBounds, calculateOptimalHingePosition, generateCabinetPlacementOptions, CabinetPlacementOption, findAvailableSpacesInColumnSlot } from '@/editor/shared/utils/columnSlotProcessor';
import { useSpace3DView } from '../../context/useSpace3DView';
import CabinetPlacementPopup from '@/editor/shared/controls/CabinetPlacementPopup';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlert } from '@/contexts/AlertContext';

interface SlotDropZonesProps {
  spaceInfo: SpaceInfo;
  showAll?: boolean;
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZones: React.FC<SlotDropZonesProps> = ({ spaceInfo, showAll = true }) => {
  if (!spaceInfo) return null;
  const columns = spaceInfo.columns ?? [];
  if (!columns) {
    return null;
  }
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const { showAlert } = useAlert();
  
  // Three.js 컨텍스트 접근
  const { camera, scene, gl, invalidate } = useThree();
  const { viewMode, showDimensions } = useSpace3DView();
  
  // 테마 컨텍스트에서 색상 가져오기
  const { theme } = useTheme();
  
  // 마우스가 hover 중인 슬롯 인덱스 상태
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  
  // UIStore에서 activeDroppedCeilingTab 가져오기
  const { activeDroppedCeilingTab } = useUIStore();
  
  // 캐비넷 배치 선택 팝업 상태
  const [showPlacementPopup, setShowPlacementPopup] = useState(false);
  const [placementOptions, setPlacementOptions] = useState<CabinetPlacementOption[]>([]);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [pendingPlacementData, setPendingPlacementData] = useState<{
    dragEvent: DragEvent;
    dragData: any;
    slotIndex: number;
    moduleData: any;
  } | null>(null);
  
  // 내경 공간 및 인덱싱 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  
  // 기둥 슬롯 분석 (기둥 변경사항에 반응하도록 개선)
  const columnSlots = React.useMemo(() => {
    console.log('🔄 SlotDropZones - 기둥 슬롯 분석 업데이트:', {
      columnsCount: columns.length || 0,
      spaceWidth: spaceInfo.width,
      spaceHeight: spaceInfo.height,
      spaceDepth: spaceInfo.depth
    });
    return analyzeColumnSlots(spaceInfo);
  }, [spaceInfo, columns]);

  // 가구 충돌 감지 함수 (새 가구 배치용)
  const detectNewFurnitureCollisions = React.useCallback((newSlotIndex: number, isDualFurniture: boolean, zone: 'normal' | 'dropped' = 'normal') => {
    // 새 가구가 차지할 슬롯들 계산
    let occupiedSlots: number[] = [];
    if (isDualFurniture) {
      occupiedSlots = [newSlotIndex, newSlotIndex + 1];
    } else {
      occupiedSlots = [newSlotIndex];
    }

    // 충돌하는 기존 가구들 찾기
    const collidingModules: string[] = [];
    placedModules.forEach(module => {
      // 같은 zone의 가구만 충돌 체크
      if (module.zone !== zone) return;
      
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;

      const indexing = calculateSpaceIndexing(spaceInfo);
      const columnWidth = indexing.columnWidth;
      const isModuleDual = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
      
      // 기존 가구가 차지하는 슬롯들
      let moduleSlots: number[] = [];
      if (isModuleDual && module.slotIndex !== undefined) {
        moduleSlots = [module.slotIndex, module.slotIndex + 1];
      } else if (module.slotIndex !== undefined) {
        moduleSlots = [module.slotIndex];
      }

      // 슬롯 겹침 확인
      const hasOverlap = occupiedSlots.some(slot => moduleSlots.includes(slot));
      if (hasOverlap) {
        collidingModules.push(module.id);
        if (import.meta.env.DEV) {
          console.log('🚨 새 가구 배치로 인한 충돌 감지:', {
            newSlots: occupiedSlots,
            collidingModule: module.id,
            existingSlots: moduleSlots,
            zone
          });
        }
      }
    });

    return collidingModules;
  }, [placedModules, internalSpace, spaceInfo]);

  // 충돌한 가구들 제거
  const removeCollidingFurniture = React.useCallback((collidingModuleIds: string[]) => {
    collidingModuleIds.forEach(moduleId => {
      if (import.meta.env.DEV) {
        console.log('🗑️ 새 가구 배치로 인한 기존 가구 제거:', moduleId);
      }
      removeModule(moduleId);
    });
  }, [removeModule]);
  
  // 드롭 처리 함수
  const handleSlotDrop = React.useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
    if (!currentDragData) {
      return false;
    }
    
    // HTML5 드래그 데이터 가져오기
    let dragData;
    try {
      const dragDataString = dragEvent.dataTransfer?.getData('application/json');
      if (!dragDataString) {
        return false;
      }
      dragData = JSON.parse(dragDataString);
    } catch (error) {
      console.error('Error parsing drag data:', error);
      return false;
    }
    
    if (!dragData || dragData.type !== 'furniture') {
      return false;
    }
    
    // needsWarning 확인 - 경고가 필요한 경우 즉시 경고 메시지 표시 후 중단
    if (dragData.moduleData?.needsWarning) {
      showAlert('배치슬롯의 사이즈를 늘려주세요', { title: '배치 불가' });
      return false;
    }
    
    // 특수 듀얼 가구 체크 (바지걸이장, 스타일러장)
    const isSpecialDualFurniture = dragData.moduleData.id.includes('dual-2drawer-styler-') || 
                                 dragData.moduleData.id.includes('dual-4drawer-pantshanger-');
    
    const indexing = calculateSpaceIndexing(spaceInfo);
    
    // 특수 듀얼 가구이고 슬롯폭이 550mm 미만인 경우
    if (isSpecialDualFurniture && indexing.columnWidth < 550) {
      showAlert('슬롯갯수를 줄여주세요', { title: '배치 불가' });
      return false;
    }
    
    // 레이캐스팅으로 슬롯 인덱스 찾기
    const slotIndex = getSlotIndexFromRaycast(
      dragEvent.clientX, 
      dragEvent.clientY, 
      canvasElement,
      camera,
      scene,
      spaceInfo
    );
    
    if (slotIndex === null) {
      return false;
    }
    
    // 단내림 활성화 시 영역 확인
    let zone: 'normal' | 'dropped' = 'normal';
    let zoneSlotIndex = slotIndex;
    
    if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
      // 레이캐스트된 콜라이더에서 zone 정보 가져오기
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const rect = canvasElement.getBoundingClientRect();
      mouse.x = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((dragEvent.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      
      const slotColliders: THREE.Object3D[] = [];
      scene.traverse((child) => {
        if (child.userData?.type === 'slot-collider') {
          slotColliders.push(child);
        }
      });
      
      const intersects = raycaster.intersectObjects(slotColliders);
      
      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        zone = intersectedObject.userData?.zone || 'normal';
        zoneSlotIndex = intersectedObject.userData?.slotIndex || slotIndex;
        
        console.log('🎯 드롭 영역 확인 (레이캐스트):', {
          zone,
          zoneSlotIndex,
          activeTab: activeDroppedCeilingTab
        });
      } else {
        console.warn('⚠️ 영역을 찾을 수 없음');
        return false;
      }
    }
    
    // 듀얼/싱글 가구 판별
    const isDual = isDualFurniture(dragData.moduleData.id, spaceInfo);
    
    // 기둥 슬롯 정보 먼저 확인 - 영역별 슬롯 인덱스 사용
    // 단내림 영역의 경우 실제 전체 슬롯 인덱스로 변환 필요
    let globalSlotIndex = slotIndex;
    if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      if (zoneInfo.dropped) {
        // 단내림 영역의 슬롯은 normal 영역 뒤에 오므로 전체 인덱스 조정
        globalSlotIndex = zoneInfo.normal.columnCount + zoneSlotIndex;
      }
    }
    const targetSlotInfo = columnSlots[globalSlotIndex];
    
    console.log('🎯 드롭 시도:', {
      slotIndex,
      zoneSlotIndex,
      globalSlotIndex,
      zone,
      hasColumn: targetSlotInfo?.hasColumn,
      columnId: targetSlotInfo?.column?.id,
      isDual,
      moduleId: dragData.moduleData.id
    });
    
    // 기둥이 없는 슬롯인 경우에만 일반 가용성 검사
    // 기둥이 있는 슬롯은 나중에 findAvailableSpacesInColumnSlot에서 상세 검사
    if (!targetSlotInfo?.hasColumn) {
      // 슬롯 가용성 검사 - 충돌 시 배치 실패 (영역별 슬롯 인덱스 사용)
      if (!isSlotAvailable(zoneSlotIndex, isDual, placedModules, spaceInfo, dragData.moduleData.id)) {
        console.log('❌ 슬롯 가용성 검사 실패');
        return false; // 충돌하는 슬롯에는 배치 불가
      }
    } else {
      console.log('✅ 기둥 슬롯이므로 가용성 검사 건너뜀 - findAvailableSpacesInColumnSlot에서 검사 예정');
    }
    
    // 가구 데이터 조회
    const moduleData = getModuleById(dragData.moduleData.id, internalSpace, spaceInfo);
    if (!moduleData) {
      return false;
    }
    
    // 기본 가구 깊이 계산 함수 (미리 정의)
    const getDefaultDepth = (moduleData: ModuleData | undefined) => {
      
      if (moduleData?.defaultDepth) {
        const result = Math.min(moduleData.defaultDepth, spaceInfo.depth);
        return result;
      }
      
      // 기존 fallback 로직
      const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
      const result = Math.min(spaceBasedDepth, 580);
      return result;
    };
    
    // 듀얼 가구가 기둥에 침범당하면 배치 불가
    if (isDual && targetSlotInfo && targetSlotInfo.hasColumn) {
      console.log('🚫 듀얼 가구가 기둥 슬롯에 배치 시도됨 - 배치 불가:', {
        slotIndex,
        columnId: targetSlotInfo.column?.id,
        reason: '듀얼 가구는 기둥이 있는 슬롯에 배치할 수 없음'
      });
      showAlert('듀얼 가구는 기둥이 있는 슬롯에 배치할 수 없습니다.', { title: '배치 불가' });
      return false;
    }
    
    // 기존 단일 가구 배치 로직 (분할이 필요하지 않은 경우)
    let actualModuleData = moduleData;
    let actualModuleId = dragData.moduleData.id;
    let actualIsDual = isDual;
    
    if (targetSlotInfo && targetSlotInfo.hasColumn && !isDual) {
      // 싱글 가구인 경우에만 기존 변환 로직 적용
      const conversionResult = convertDualToSingleIfNeeded(moduleData, targetSlotInfo, spaceInfo);
      if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
        actualModuleData = conversionResult.convertedModuleData;
        actualModuleId = conversionResult.convertedModuleData.id;
        actualIsDual = false;
      }
    }
    
    // 최종 위치 계산 - zone 정보 전달
    let finalX = calculateFurniturePosition(zoneSlotIndex, actualModuleId, spaceInfo, zone);
    if (finalX === null) {
      return false;
    }
    
    // 고유 ID 생성
    const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 현재 가구의 사용자 설정 깊이 확인
    const currentPlacedModule = placedModules.find(m => m.moduleId === actualModuleId);
    const currentCustomDepth = currentPlacedModule?.customDepth;
    
    // 기본 깊이 설정 - 사용자 설정이 있으면 우선 사용
    let customDepth = currentCustomDepth || getDefaultDepth(actualModuleData);
    
    // 단내림 영역의 경우 높이 제한
    let effectiveHeight = actualModuleData.dimensions.height;
    if (zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      const maxHeight = spaceInfo.height - spaceInfo.droppedCeiling.dropHeight;
      effectiveHeight = Math.min(effectiveHeight, maxHeight);
      console.log('📏 단내림 영역 높이 제한:', {
        originalHeight: actualModuleData.dimensions.height,
        maxHeight,
        effectiveHeight
      });
    }
    
    // 단내림 영역의 경우 너비 조정
    let customWidth: number | undefined;
    if (zone === 'dropped' && indexing.zones?.dropped) {
      customWidth = indexing.zones.dropped.columnWidth;
      console.log('📏 단내림 영역 너비 조정:', {
        originalWidth: actualModuleData.dimensions.width,
        customWidth
      });
    }
    let adjustedDepth = customDepth; // Column C의 경우 조정될 수 있음
    
    // 기둥이 있는 슬롯인 경우 중복 배치 가능성 검토
    if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
      // 기둥 슬롯에서 사용 가능한 공간들 찾기
      const availableSpaces = findAvailableSpacesInColumnSlot(
        targetSlotInfo,
        slotIndex,
        spaceInfo,
        placedModules
      );
      
      console.log('🏗️ 기둥 슬롯의 사용 가능한 공간:', {
        slotIndex,
        spacesCount: availableSpaces.length,
        spaces: availableSpaces.map(s => ({
          type: s.type,
          position: s.position,
          maxWidth: s.maxWidth
        }))
      });
      
      // 여러 공간이 있으면 첫 번째 빈 공간에 배치 (추후 사용자 선택 UI 추가 가능)
      if (availableSpaces.length > 0) {
        // 가장 적합한 공간 선택 (가장 넓은 공간 우선)
        const bestSpace = availableSpaces.reduce((prev, curr) => 
          curr.maxWidth > prev.maxWidth ? curr : prev
        );
        
        // 첫 번째 모듈이면 도어 있게, 이후 모듈은 도어 없게
        const existingModulesInSlot = placedModules.filter(m => m.slotIndex === slotIndex);
        const shouldHaveDoor = existingModulesInSlot.length === 0;
        
        console.log('✅ 선택된 배치 공간:', {
          type: bestSpace.type,
          position: bestSpace.position,
          maxWidth: bestSpace.maxWidth,
          shouldHaveDoor,
          existingModulesCount: existingModulesInSlot.length
        });
        
        // 위치와 크기 조정
        finalPosition = { 
          x: bestSpace.position.x, 
          y: 0, 
          z: bestSpace.position.z 
        };
        // 150mm 공간에도 배치 가능하도록 자동 크기 조정
        // 사용 가능한 공간이 150mm 이상이면 그 공간에 맞게 가구 크기 조정
        if (bestSpace.maxWidth >= 150) {
          adjustedFurnitureWidth = Math.min(bestSpace.maxWidth, actualModuleData.dimensions.width);
          console.log('✅ 가구 크기 자동 조정:', {
            originalWidth: actualModuleData.dimensions.width,
            availableSpace: bestSpace.maxWidth,
            adjustedWidth: adjustedFurnitureWidth,
            type: bestSpace.type
          });
        } else {
          console.warn('⚠️ 공간이 너무 좁음:', bestSpace.maxWidth);
          adjustedFurnitureWidth = 150; // 최소 크기로 설정
        }
        
        // Column C의 경우 깊이 조정
        let finalCustomDepth = customDepth;
        let customWidthForSplit: number | undefined;
        
        if (targetSlotInfo.columnType === 'medium' && targetSlotInfo.column) {
          // 분할 배치에서도 깊이 조정 적용
          if (bestSpace.type === 'left' || bestSpace.type === 'right') {
            // 시나리오 D: 좌우 분할 배치 - 정상 깊이, 커스텀 너비 사용
            finalCustomDepth = customDepth;
            // customWidth 유효성 검증 추가
            customWidthForSplit = bestSpace.maxWidth && bestSpace.maxWidth > 0 
              ? bestSpace.maxWidth 
              : adjustedFurnitureWidth; // fallback으로 조정된 가구 너비 사용
          } else {
            // 시나리오 C: 단일 배치 - 깊이 조정
            finalCustomDepth = Math.max(200, 730 - targetSlotInfo.column.depth);
          }
          
          console.log('🟣 Column C 깊이 처리:', {
            columnDepth: targetSlotInfo.column.depth,
            spaceType: bestSpace.type,
            originalDepth: customDepth,
            finalDepth: finalCustomDepth,
            isDepthAdjusted: finalCustomDepth !== customDepth,
            customWidth: customWidthForSplit
          });
        }
        
        // 새 모듈 설정 업데이트
        const newModule = {
          id: placedId,
          moduleId: actualModuleId,
          position: finalPosition,
          rotation: 0,
          hasDoor: shouldHaveDoor, // 첫 번째 모듈만 도어
          customDepth: finalCustomDepth,
          customWidth: customWidthForSplit, // 분할 배치 시 너비
          slotIndex: zoneSlotIndex,
          isDualSlot: actualIsDual,
          isValidInCurrentSpace: true,
          zone: zone,
          customWidth: customWidth,
          adjustedWidth: adjustedFurnitureWidth,
          hingePosition: targetSlotInfo ? calculateOptimalHingePosition(targetSlotInfo) : 'right',
          isSplit: (bestSpace.type === 'left' || bestSpace.type === 'right') && targetSlotInfo.columnType === 'medium', // Column C 분할 여부
          columnSlotInfo: {
            hasColumn: true,
            columnId: targetSlotInfo.column?.id,
            columnPosition: targetSlotInfo.columnPosition,
            availableWidth: targetSlotInfo.availableWidth,
            needsMullion: targetSlotInfo.needsMullion,
            mullionSide: targetSlotInfo.mullionSide,
            wasConvertedFromDual: actualModuleId !== dragData.moduleData.id,
            originalDualSlots: isDual ? [slotIndex, slotIndex + 1] : [slotIndex],
            actualSlots: actualIsDual ? [slotIndex, slotIndex + 1] : [slotIndex],
            doorWidth: doorWidthForColumn,
            spaceType: bestSpace.type, // 'left', 'right', 'front'
            moduleOrder: existingModulesInSlot.length // 이 슬롯에서 몇 번째 모듈인지
          }
        };
        
        // 모듈 추가
        addModule(newModule);
        setCurrentDragData(null);
        
        return true;
      } else {
        // 사용 가능한 공간이 없으면 알림
        console.log('❌ 기둥 슬롯에 사용 가능한 공간이 없음');
        showAlert('이 슬롯에는 더 이상 가구를 배치할 공간이 없습니다.', { title: '배치 불가' });
        return false;
      }
    }
    
    // 기존 로직 - 단일 배치인 경우만 실행
    if (!targetSlotInfo || !targetSlotInfo.hasColumn || !targetSlotInfo.column) {
      // 기둥이 없는 일반 슬롯인 경우
      let finalPosition = { x: finalX, y: 0, z: 0 };
      let adjustedFurnitureWidth = actualModuleData.dimensions.width;
      
      // 새 모듈 배치
      const newModule = {
        id: placedId,
        moduleId: actualModuleId,
        position: finalPosition,
        rotation: 0,
        hasDoor: false,
        customDepth: customDepth,
        slotIndex: zoneSlotIndex,
        zone: zone,
        customWidth: customWidth,
        isDualSlot: actualIsDual,
        isValidInCurrentSpace: true,
        adjustedWidth: adjustedFurnitureWidth,
        hingePosition: 'right',
        columnSlotInfo: { hasColumn: false }
      };
      
      // 충돌 감지 및 충돌한 가구 제거
      const collidingModules = detectNewFurnitureCollisions(zoneSlotIndex, actualIsDual, zone);
      if (collidingModules.length > 0) {
        removeCollidingFurniture(collidingModules);
      }
      
      addModule(newModule);
      setCurrentDragData(null);
      
      return true;
    }
    
    // 기둥이 있지만 중복 배치가 불가능한 경우의 기존 로직
    let finalPosition = { x: finalX, y: 0, z: 0 };
    let adjustedFurnitureWidth = actualModuleData.dimensions.width;
    let doorWidthForColumn = actualModuleData.dimensions.width - 3; // 기본값: 가구 너비 - 3mm
    
    if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
      const columnDepth = targetSlotInfo.column.depth;
      
      console.log('🔍 기둥 정보 확인:', {
        slotIndex,
        columnDepth,
        columnWidth: targetSlotInfo.column.width,
        columnId: targetSlotInfo.column.id
      });
      
      // 기둥 타입별 처리 로직
      const SHALLOW_THRESHOLD = 200; // 기둥A (150mm)
      const MEDIUM_THRESHOLD = 400; // 기둥C (300mm)
      
      let columnProcessingMethod = 'width-adjustment'; // 기본값: 폭 조정
      
      if (columnDepth <= SHALLOW_THRESHOLD) {
        // 기둥A (150mm): 깊이 조정 가능
        columnProcessingMethod = 'depth-adjustment';
        console.log('🏛️ 기둥A 처리 모드:', {
          slotIndex,
          columnDepth: columnDepth + 'mm',
          method: '깊이 조정 (가구가 얕아짐)'
        });
      } else if (columnDepth <= MEDIUM_THRESHOLD) {
        // 기둥C (300mm): 폭 조정만
        columnProcessingMethod = 'width-adjustment';
        console.log('🏛️ 기둥C 처리 모드:', {
          slotIndex,
          columnDepth: columnDepth + 'mm',
          method: '폭 조정 (가구가 좁아짐)'
        });
      } else {
        // 기둥B (730mm): 폭 조정만
        columnProcessingMethod = 'width-adjustment';
        console.log('🏛️ 기둥B 처리 모드:', {
          slotIndex,
          columnDepth: columnDepth + 'mm',
          method: '폭 조정 (가구가 좁아짐)'
        });
      }
      
      // Column C의 깊이 조정을 위한 변수
      let adjustedDepth = customDepth;
      
      // Column C (300mm) 특별 처리
      const isColumnC = targetSlotInfo.columnType === 'medium' && targetSlotInfo.columnProcessingMethod === 'depth-adjustment';
      
      // 모든 기둥에 대해 위치와 크기 조정 적용
      console.log('🏛️ 기둥 침범 시 위치와 폭 조정');
      const slotWidthM = indexing.columnWidth * 0.01;
      const originalSlotBounds = {
        left: finalX - slotWidthM / 2,
        right: finalX + slotWidthM / 2,
        center: finalX
      };
      
      const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
      
      // Column C의 경우 150mm 이상 침범 시 특별 처리
      if (isColumnC && furnitureBounds.depthAdjustmentNeeded) {
        // calculateFurnitureBounds에서 이미 150mm 이상 침범 판단됨
        // 150mm 이상 침범: 폭은 원래대로, 깊이 조정
        adjustedFurnitureWidth = actualModuleData.dimensions.width; // 폭 원래대로
        adjustedDepth = Math.max(200, 730 - targetSlotInfo.column.depth); // 깊이 조정 (730 - 300 = 430mm)
        
        console.log('🟣 Column C 150mm 이상 침범 - 깊이 조정 모드:', {
          originalWidth: actualModuleData.dimensions.width,
          adjustedWidth: adjustedFurnitureWidth,
          originalDepth: customDepth,
          adjustedDepth: adjustedDepth,
          columnDepth: targetSlotInfo.column.depth,
          depthAdjustmentNeeded: furnitureBounds.depthAdjustmentNeeded
        });
      } else if (isColumnC) {
        // Column C 150mm 미만 침범: 폭 조정
        if (furnitureBounds.renderWidth >= 150) {
          adjustedFurnitureWidth = furnitureBounds.renderWidth;
          console.log('🟣 Column C 150mm 미만 침범 - 폭 조정 모드:', {
            originalWidth: actualModuleData.dimensions.width,
            adjustedWidth: adjustedFurnitureWidth,
            availableSpace: furnitureBounds.renderWidth
          });
        } else {
          console.warn('⚠️ 공간이 150mm 미만:', furnitureBounds.renderWidth);
          showAlert(`이 슬롯의 사용 가능한 공간(${Math.floor(furnitureBounds.renderWidth)}mm)이 너무 좁습니다. 최소 150mm가 필요합니다.`, { title: '배치 불가' });
          return false;
        }
      } else {
        // Column A 또는 다른 기둥: 기존 로직
        // 기둥 침범으로 인한 가구 크기 조정
        // 150mm 이상의 공간이면 배치 가능
        if (furnitureBounds.renderWidth >= 150) {
          adjustedFurnitureWidth = furnitureBounds.renderWidth;
          console.log('✅ 기둥 침범 시 가구 크기 조정:', {
            originalWidth: actualModuleData.dimensions.width,
            adjustedWidth: adjustedFurnitureWidth,
            availableSpace: furnitureBounds.renderWidth
          });
        } else {
          console.warn('⚠️ 공간이 150mm 미만:', furnitureBounds.renderWidth);
          // 150mm 미만이면 배치 불가
          showAlert(`이 슬롯의 사용 가능한 공간(${Math.floor(furnitureBounds.renderWidth)}mm)이 너무 좁습니다. 최소 150mm가 필요합니다.`, { title: '배치 불가' });
          return false;
        }
      }
      
      finalPosition = { x: furnitureBounds.center, y: 0, z: 0 };
    }
    
    // 새 모듈 배치
    const newModule = {
      id: placedId,
      moduleId: actualModuleId, // 변환된 모듈 ID 사용
      position: finalPosition,
      rotation: 0,
      hasDoor: false, // 배치 시 항상 도어 없음 (오픈형)
      customDepth: adjustedDepth, // 가구별 기본 깊이 설정 (Column C의 경우 조정됨)
      slotIndex: zoneSlotIndex,
      isDualSlot: actualIsDual, // 변환 후 실제 상태 반영
      zone: zone,
      customWidth: customWidth,
      dimensions: {
        ...actualModuleData.dimensions,
        height: effectiveHeight
      },
      isValidInCurrentSpace: true,
      // 기둥 침범에 따른 조정된 가구 너비 저장
      adjustedWidth: adjustedFurnitureWidth,
      // 기둥 침범에 따른 최적 힌지 방향
      hingePosition: targetSlotInfo ? calculateOptimalHingePosition(targetSlotInfo) : 'right',
      // 기둥 관련 메타데이터 추가
      columnSlotInfo: targetSlotInfo?.hasColumn ? {
        hasColumn: true,
        columnId: targetSlotInfo.column?.id,
        columnPosition: targetSlotInfo.columnPosition,
        availableWidth: targetSlotInfo.availableWidth,
        needsMullion: targetSlotInfo.needsMullion,
        mullionSide: targetSlotInfo.mullionSide,
        wasConvertedFromDual: actualModuleId !== dragData.moduleData.id, // 변환 여부 표시
        originalDualSlots: isDual ? [slotIndex, slotIndex + 1] : [slotIndex], // 원래 점유 슬롯
        actualSlots: actualIsDual ? [slotIndex, slotIndex + 1] : [slotIndex], // 실제 점유 슬롯
        doorWidth: doorWidthForColumn // 기둥 커버용 도어 너비
      } : { hasColumn: false }
    };
    
    // 충돌 감지 및 충돌한 가구 제거
    const collidingModules = detectNewFurnitureCollisions(zoneSlotIndex, actualIsDual, zone);
    if (collidingModules.length > 0) {
      removeCollidingFurniture(collidingModules);
      if (import.meta.env.DEV) {
        console.log('🗑️ 새 가구 배치로 인해 ' + collidingModules.length + '개 기존 가구 제거됨');
      }
    }
    
    addModule(newModule);
    
    // Shadow auto-update enabled - manual shadow updates removed
    
    // 드래그 상태 초기화
    setCurrentDragData(null);
    
    return true;
  }, [
    currentDragData, 
    camera,
    scene,
    spaceInfo,
    internalSpace,
    placedModules,
    addModule, 
    setCurrentDragData,
    columnSlots
  ]);

  // 직접 분할 배치 함수 (간단한 버전)
  const attemptDirectSplitPlacement = (column: any, slotIndex: number, moduleData: any, spaceInfo: SpaceInfo) => {
    try {
      const indexing = calculateSpaceIndexing(spaceInfo);
      const slotWidthMm = indexing.columnWidth;
      const slotCenterX = indexing.threeUnitPositions[slotIndex];
      
      // 기둥 정보
      const columnCenterX = column.position[0]; // meters
      const columnLeftX = columnCenterX - (column.width * 0.01) / 2;
      const columnRightX = columnCenterX + (column.width * 0.01) / 2;
      
      // 슬롯 경계
      const slotLeftX = slotCenterX - (slotWidthMm * 0.01) / 2;
      const slotRightX = slotCenterX + (slotWidthMm * 0.01) / 2;
      
      // 기둥의 슬롯 침범 폭 계산 (mm)
      const columnSlotOverlapWidth = Math.max(0, 
        Math.min(columnRightX, slotRightX) - Math.max(columnLeftX, slotLeftX)
      ) * 100; // meters to mm
      
      // 좌우 여유 공간 계산 (mm)
      const leftSpaceMm = Math.max(0, (columnLeftX - slotLeftX) * 100);
      const rightSpaceMm = Math.max(0, (slotRightX - columnRightX) * 100);
      
      console.log('📐 기둥 침범 분석:', {
        columnWidth: column.width,
        columnSlotOverlapWidth: columnSlotOverlapWidth.toFixed(1),
        leftSpaceMm: leftSpaceMm.toFixed(1),
        rightSpaceMm: rightSpaceMm.toFixed(1),
        shouldSplit: columnSlotOverlapWidth >= 150,
        minRequired: 150
      });
      
      // 분할배치 조건: 기둥이 슬롯에 충분히 침범하고 기둥이 충분히 깊어야 함
      // 기둥C(300mm)는 침범폭이 300mm이지만 깊이가 작아서 분할배치 안함
      const shouldSplit = columnSlotOverlapWidth >= 400 && column.depth >= 500; // 더 엄격한 조건
      
      if (!shouldSplit) {
        return { 
          success: false, 
          reason: `분할배치 조건 불충족 - 침범폭: ${columnSlotOverlapWidth.toFixed(0)}mm, 기둥깊이: ${column.depth}mm (침범폭≥400mm, 기둥깊이≥500mm 필요)` 
        };
      }
      
      // 분할 가능성 확인 - 최소 공간 요구사항 완화 (50mm)
      if (leftSpaceMm < 50 && rightSpaceMm < 50) {
        return { 
          success: false, 
          reason: `양쪽 모두 공간 부족 - 좌측: ${leftSpaceMm.toFixed(0)}mm, 우측: ${rightSpaceMm.toFixed(0)}mm` 
        };
      }
      
      // 깊이 조정 - 깊은 기둥은 깊이 조정 안함
      const DEPTH_THRESHOLD = 500;
      const isDeepColumn = column.depth >= DEPTH_THRESHOLD;
      let adjustedDepth: number;
      
      if (isDeepColumn) {
        // 깊은 기둥: 원래 깊이 유지
        adjustedDepth = 730;
      } else {
        // 얕은 기둥: 깊이 조정
        adjustedDepth = 730 - column.depth;
        if (adjustedDepth < 200) {
          return { 
            success: false, 
            reason: `깊이 부족 - 조정된 깊이: ${adjustedDepth}mm` 
          };
        }
      }
      
      // 캐비넷 크기와 위치 계산 (한쪽만 있어도 배치 가능)
      const leftCabinetWidth = leftSpaceMm > 50 ? Math.max(50, leftSpaceMm - 5) : 0;
      const rightCabinetWidth = rightSpaceMm > 50 ? Math.max(50, rightSpaceMm - 5) : 0;
      
      const leftCabinetCenterX = slotLeftX + (leftSpaceMm * 0.01) / 2;
      const rightCabinetCenterX = columnRightX + (rightSpaceMm * 0.01) / 2;
      
      // 기둥 앞면에 배치할 캐비넷의 여유공간 계산
      const frontSpaceMm = adjustedDepth; // 조정된 깊이가 기둥 앞쪽 여유공간
      const canAddFrontCabinet = frontSpaceMm >= 150;
      
      console.log('🏗️ 기둥 앞면 캐비넷 배치 검토:', {
        frontSpaceMm,
        canAddFrontCabinet,
        columnDepth: column.depth,
        adjustedDepth
      });
      
      // 모듈 생성
      const modules = [];
      const timestamp = Date.now();
      
      // 기본 싱글 모듈 ID 생성 (기존 모듈이 어떤 타입이든 싱글로 변환)
      let baseModuleId = moduleData.id;
      if (baseModuleId.includes('dual-')) {
        baseModuleId = baseModuleId.replace('dual-', 'single-');
      } else if (!baseModuleId.includes('single-')) {
        // 기본 모듈이면 single- 접두사 추가
        baseModuleId = `single-${baseModuleId}`;
      }

      // 왼쪽 캐비넷 (공간이 있을 때만)
      if (leftCabinetWidth > 0) {
        modules.push({
          id: `split-left-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          moduleId: baseModuleId,
          position: { x: leftCabinetCenterX, y: 0, z: 0 },
          rotation: 0,
          hasDoor: false,
          customDepth: adjustedDepth,
          slotIndex: slotIndex,
          isDualSlot: false,
          isValidInCurrentSpace: true,
          adjustedWidth: leftCabinetWidth,
          hingePosition: 'right' as 'left' | 'right'
        });
      }
      
      // 오른쪽 캐비넷 (공간이 있을 때만)
      if (rightCabinetWidth > 0) {
        modules.push({
          id: `split-right-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          moduleId: baseModuleId,
          position: { x: rightCabinetCenterX, y: 0, z: 0 },
          rotation: 0,
          hasDoor: false,
          customDepth: adjustedDepth,
          slotIndex: slotIndex,
          isDualSlot: false,
          isValidInCurrentSpace: true,
          adjustedWidth: rightCabinetWidth,
          hingePosition: 'left' as 'left' | 'right'
        });
      }
      
      // 기둥 앞면에 맞닿는 좁은 캐비넷 추가 (여유공간 150mm 이상일 때)
      if (canAddFrontCabinet) {
        const frontCabinetWidth = Math.min(column.width - 20, 200); // 기둥 너비보다 작게, 최대 200mm
        const frontCabinetDepth = Math.min(frontSpaceMm - 10, 150); // 여유공간보다 작게, 최대 150mm
        const frontCabinetCenterX = columnCenterX; // 기둥 중심에 배치
        const frontCabinetZ = (column.depth * 0.01) / 2 + (frontCabinetDepth * 0.01) / 2; // 기둥 앞면에 맞닿게
        
        modules.push({
          id: `split-front-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          moduleId: baseModuleId,
          position: { x: frontCabinetCenterX, y: 0, z: frontCabinetZ },
          rotation: 0,
          hasDoor: false,
          customDepth: frontCabinetDepth,
          slotIndex: slotIndex,
          isDualSlot: false,
          isValidInCurrentSpace: true,
          adjustedWidth: frontCabinetWidth,
          hingePosition: 'right' as 'left' | 'right',
          isFrontColumn: true // 기둥 앞면 캐비넷 표시
        });
        
        console.log('✨ 기둥 앞면 캐비넷 추가:', {
          width: frontCabinetWidth,
          depth: frontCabinetDepth,
          centerX: frontCabinetCenterX,
          centerZ: frontCabinetZ
        });
      }
      
      // 최소 하나 이상의 모듈이 생성되었는지 확인
      if (modules.length === 0) {
        return { 
          success: false, 
          reason: '배치 가능한 캐비넷이 없음 - 모든 공간이 부족함' 
        };
      }

      console.log('✨ 분할 배치 모듈 생성 완료:', {
        leftModule: leftCabinetWidth > 0 ? { width: leftCabinetWidth, centerX: leftCabinetCenterX } : null,
        rightModule: rightCabinetWidth > 0 ? { width: rightCabinetWidth, centerX: rightCabinetCenterX } : null,
        frontModule: canAddFrontCabinet ? { 
          width: Math.min(column.width - 20, 200), 
          depth: Math.min(frontSpaceMm - 10, 150),
          centerX: columnCenterX 
        } : null,
        totalModules: modules.length,
        columnSlotOverlapWidth: columnSlotOverlapWidth.toFixed(1),
        depth: adjustedDepth
      });
      
      return { success: true, modules };
      
    } catch (error) {
      console.error('❌ 직접 분할 배치 에러:', error);
      return { success: false, reason: `에러 발생: ${error}` };
    }
  };

  // 선택된 배치 옵션 처리
  const handleSelectedPlacement = (
    option: CabinetPlacementOption, 
    placementData: { dragEvent: DragEvent; dragData: any; slotIndex: number; moduleData: any }
  ): boolean => {
    const { dragData, slotIndex, moduleData } = placementData;
    
    console.log('🏗️ 선택된 배치 옵션 처리:', {
      optionType: option.type,
      cabinetCount: option.cabinets.length,
      slotIndex
    });

    // 각 캐비넷을 배치
    option.cabinets.forEach((cabinet, index) => {
      const placedId = `placed-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
      
      const newModule = {
        id: placedId,
        moduleId: cabinet.moduleId,
        position: { x: cabinet.position[0], y: cabinet.position[1], z: cabinet.position[2] },
        rotation: 0,
        hasDoor: false,
        customDepth: cabinet.depth,
        slotIndex: slotIndex, // 분할 배치도 같은 슬롯에 배치 (위치는 다름)
        isDualSlot: false,
        isValidInCurrentSpace: true,
        adjustedWidth: cabinet.width,
        hingePosition: 'right' as 'left' | 'right',
        columnSlotInfo: {
          hasColumn: true,
          columnType: 'shallow',
          placementType: option.type,
          originalOption: option,
          splitIndex: index // 분할에서의 순서 (0: 왼쪽, 1: 오른쪽)
        }
      };

      // 캐비넷 배치 시 충돌 감지 및 제거 - zone은 기본값 'normal' 사용
      const collidingModules = detectNewFurnitureCollisions(cabinet.slotIndex, false, 'normal'); // 캐비넷은 단일 슬롯
      if (collidingModules.length > 0) {
        removeCollidingFurniture(collidingModules);
        if (import.meta.env.DEV) {
          console.log('🗑️ 캐비넷 배치로 인해 ' + collidingModules.length + '개 기존 가구 제거됨');
        }
      }

      addModule(newModule);
      console.log('✅ 캐비넷 배치 완료:', {
        id: placedId,
        moduleId: cabinet.moduleId,
        width: cabinet.width,
        depth: cabinet.depth,
        position: cabinet.position
      });
    });

    // Shadow auto-update enabled - manual shadow updates removed

    // 드래그 상태 초기화
    setCurrentDragData(null);
    
    return true;
  };

  // 팝업에서 옵션 선택 시
  const handlePopupSelect = (option: CabinetPlacementOption) => {
    if (pendingPlacementData) {
      handleSelectedPlacement(option, pendingPlacementData);
    }
    setShowPlacementPopup(false);
    setPendingPlacementData(null);
    setPlacementOptions([]);
  };

  // 팝업 취소 시
  const handlePopupCancel = () => {
    setShowPlacementPopup(false);
    setPendingPlacementData(null);
    setPlacementOptions([]);
    setCurrentDragData(null);
  };
  
  // window 객체에 함수 노출
  useEffect(() => {
    window.handleSlotDrop = handleSlotDrop;
    
    return () => {
      delete window.handleSlotDrop;
    };
  }, [handleSlotDrop]);
  
  // 간단한 드래그오버 이벤트 핸들러 - 바닥 하이라이트용
  useEffect(() => {
    if (!currentDragData) {
      return;
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault(); // 드롭 허용
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      const slotIndex = getSlotIndexFromRaycast(
        e.clientX, 
        e.clientY, 
        canvas,
        camera,
        scene,
        spaceInfo
      );
      
      // 슬롯이 감지되었을 때 충돌 검사
      if (slotIndex !== null && currentDragData) {
        // 단내림 활성화 시 zone 확인
        let zone: 'normal' | 'dropped' = 'normal';
        let zoneSlotIndex = slotIndex;
        
        if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
          // 레이캐스트를 통해 zone 정보 확인
          const raycaster = new THREE.Raycaster();
          const mouse = new THREE.Vector2();
          const rect = canvas.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          
          raycaster.setFromCamera(mouse, camera);
          
          const slotColliders: THREE.Object3D[] = [];
          scene.traverse((child) => {
            if (child.userData?.type === 'slot-collider') {
              slotColliders.push(child);
            }
          });
          
          const intersects = raycaster.intersectObjects(slotColliders);
          
          if (intersects.length > 0) {
            const intersectedObject = intersects[0].object;
            zone = intersectedObject.userData?.zone || 'normal';
            zoneSlotIndex = intersectedObject.userData?.slotIndex || slotIndex;
          }
        }
        
        const isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
        
        // 슬롯 가용성 검사 - zone별 슬롯 인덱스 사용
        if (isSlotAvailable(zoneSlotIndex, isDual, placedModules.filter(m => m.zone === zone), spaceInfo, currentDragData.moduleData.id)) {
          setHoveredSlotIndex(zoneSlotIndex);
        } else {
          setHoveredSlotIndex(null); // 충돌하는 슬롯은 하이라이트 안함
        }
      } else {
        setHoveredSlotIndex(slotIndex);
      }
    };

    const handleDragLeave = () => {
      setHoveredSlotIndex(null);
    };

    // 캔버스 컨테이너에 이벤트 리스너 추가
    const canvasContainer = document.querySelector('canvas')?.parentElement;
    if (canvasContainer) {
      canvasContainer.addEventListener('dragover', handleDragOver);
      canvasContainer.addEventListener('dragleave', handleDragLeave);
    }

    return () => {
      if (canvasContainer) {
        canvasContainer.removeEventListener('dragover', handleDragOver);
        canvasContainer.removeEventListener('dragleave', handleDragLeave);
      }
    };
  }, [currentDragData, camera, scene, spaceInfo, placedModules, columnSlots]);
  
  // 슬롯 크기 및 위치 계산
  const slotDimensions = calculateSlotDimensions(spaceInfo);
  const slotStartY = calculateSlotStartY(spaceInfo);
  
  // mm를 Three.js 단위로 변환하는 함수
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  return (
    <group>
        {/* 레이캐스팅용 투명 콜라이더들 - 단내림 영역별로 생성 */}
        {(() => {
          const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
          const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          
          if (hasDroppedCeiling && zoneSlotInfo.dropped) {
            // 단내림 활성화된 경우 - 현재 활성 탭의 영역만 콜라이더 생성
            const colliders = [];
            
            if (activeDroppedCeilingTab === 'main') {
              // 메인구간 콜라이더
              const { startX, columnCount, columnWidth } = zoneSlotInfo.normal;
              for (let i = 0; i < columnCount; i++) {
                const slotCenterMm = startX + (i * columnWidth) + (columnWidth / 2);
                const slotCenterX = mmToThreeUnits(slotCenterMm);
                const slotWidthThree = mmToThreeUnits(columnWidth);
                
                colliders.push(
                  <mesh
                    key={`main-slot-collider-${i}`}
                    position={[slotCenterX, slotStartY + slotDimensions.height / 2, 0]}
                    userData={{ 
                      slotIndex: i, 
                      isSlotCollider: true,
                      type: 'slot-collider',
                      zone: 'normal'
                    }}
                    visible={false}
                  >
                    <boxGeometry args={[slotWidthThree, slotDimensions.height, slotDimensions.depth]} />
                    <meshBasicMaterial transparent opacity={0} />
                  </mesh>
                );
              }
            } else if (activeDroppedCeilingTab === 'dropped') {
              // 단내림구간 콜라이더
              const { startX, columnCount, columnWidth } = zoneSlotInfo.dropped;
              for (let i = 0; i < columnCount; i++) {
                const slotCenterMm = startX + (i * columnWidth) + (columnWidth / 2);
                const slotCenterX = mmToThreeUnits(slotCenterMm);
                const slotWidthThree = mmToThreeUnits(columnWidth);
                
                colliders.push(
                  <mesh
                    key={`dropped-slot-collider-${i}`}
                    position={[slotCenterX, slotStartY + slotDimensions.height / 2, 0]}
                    userData={{ 
                      slotIndex: i, 
                      isSlotCollider: true,
                      type: 'slot-collider',
                      zone: 'dropped'
                    }}
                    visible={false}
                  >
                    <boxGeometry args={[slotWidthThree, slotDimensions.height, slotDimensions.depth]} />
                    <meshBasicMaterial transparent opacity={0} />
                  </mesh>
                );
              }
            }
            
            return colliders;
          } else {
            // 단내림이 없는 경우 - 기존 방식
            return indexing.threeUnitPositions.map((slotX, slotIndex) => {
              const reducedDepth = slotDimensions.depth;
              const zOffset = 0;
              
              return (
                <mesh
                  key={`slot-collider-${slotIndex}`}
                  position={[slotX, slotStartY + slotDimensions.height / 2, zOffset]}
                  userData={{ 
                    slotIndex, 
                    isSlotCollider: true,
                    type: 'slot-collider'
                  }}
                  visible={false}
                >
                  <boxGeometry args={[slotDimensions.width, slotDimensions.height, reducedDepth]} />
                  <meshBasicMaterial transparent opacity={0} />
                </mesh>
              );
            });
          }
        })()}
        
        {/* 바닥 슬롯 시각화 - 탭에 따라 분리 */}
        {showAll && showDimensions && (() => {
          // 단내림 활성화 여부 확인
          const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
          const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          
          // ColumnGuides와 완전히 동일한 계산 사용
          const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
          
          // ColumnGuides와 동일한 Y 좌표 계산
          const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
          
          // Room.tsx의 바닥 계산과 동일하게 수정
          const doorThicknessMm = 20;
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          const panelDepthMm = 1500;
          const furnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          
          const roomBackZ = -mmToThreeUnits(internalSpace.depth / 2);
          const frameEndZ = furnitureZOffset + furnitureDepth/2; // 좌우 프레임의 앞쪽 끝
          const slotFloorDepth = frameEndZ - roomBackZ; // 바닥 슬롯 메쉬 깊이
          const slotFloorZ = (frameEndZ + roomBackZ) / 2; // 바닥 중심 Z 좌표
          
          if (hasDroppedCeiling && zoneSlotInfo.dropped) {
            // 단내림 활성화된 경우 탭에 따라 분리
            if (activeDroppedCeilingTab === 'main') {
              // 메인구간 탭: 메인 영역만 표시
              const leftX = mmToThreeUnits(zoneSlotInfo.normal.startX);
              const rightX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);
              const centerX = (leftX + rightX) / 2;
              const width = rightX - leftX;
              
              return (
                <mesh
                  key="main-zone-floor"
                  position={[centerX, floorY, slotFloorZ]}
                >
                  <boxGeometry args={[width, 0.001, slotFloorDepth]} />
                  <meshBasicMaterial 
                    color={theme?.color || '#10b981'} 
                    transparent 
                    opacity={0.1} 
                  />
                </mesh>
              );
            } else if (activeDroppedCeilingTab === 'dropped') {
              // 단내림 구간 탭: 단내림 영역만 표시
              const leftX = mmToThreeUnits(zoneSlotInfo.dropped.startX);
              const rightX = mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width);
              const centerX = (leftX + rightX) / 2;
              const width = rightX - leftX;
              
              return (
                <mesh
                  key="dropped-zone-floor"
                  position={[centerX, floorY, slotFloorZ]}
                >
                  <boxGeometry args={[width, 0.001, slotFloorDepth]} />
                  <meshBasicMaterial 
                    color={theme?.color || '#10b981'} 
                    transparent 
                    opacity={0.1} 
                  />
                </mesh>
              );
            }
            // 탭이 선택되지 않은 경우 아무것도 표시하지 않음
            return null;
          } else {
            // 단내림이 없는 경우 전체 영역 표시
            const leftX = indexing.threeUnitBoundaries[0];
            const rightX = indexing.threeUnitBoundaries[indexing.threeUnitBoundaries.length - 1];
            const centerX = (leftX + rightX) / 2;
            const width = rightX - leftX;
            
            return (
              <mesh
                key="full-zone-floor"
                position={[centerX, floorY, slotFloorZ]}
              >
                <boxGeometry args={[width, 0.001, slotFloorDepth]} />
                <meshBasicMaterial 
                  color={theme?.color || '#10b981'} 
                  transparent 
                  opacity={0.1} 
                />
              </mesh>
            );
          }
          
          return null;
        })()}
        
        {/* 가구 미리보기 - 영역별 처리 */}
        {(() => {
          if (!currentDragData || hoveredSlotIndex === null) return null;
          
          const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
          const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          
          // 현재 활성 영역의 슬롯 정보 가져오기
          let zoneInfo = null;
          let activeZone: 'normal' | 'dropped' = 'normal';
          
          if (hasDroppedCeiling && zoneSlotInfo.dropped) {
            if (activeDroppedCeilingTab === 'main') {
              zoneInfo = zoneSlotInfo.normal;
              activeZone = 'normal';
            } else if (activeDroppedCeilingTab === 'dropped') {
              zoneInfo = zoneSlotInfo.dropped;
              activeZone = 'dropped';
            }
          }
          
          // 영역별 슬롯 위치 배열 생성
          const slotPositions = [];
          if (zoneInfo) {
            for (let i = 0; i < zoneInfo.columnCount; i++) {
              const slotCenterMm = zoneInfo.startX + (i * zoneInfo.columnWidth) + (zoneInfo.columnWidth / 2);
              slotPositions.push({
                index: i,
                x: mmToThreeUnits(slotCenterMm),
                width: zoneInfo.columnWidth
              });
            }
          } else {
            // 단내림이 없는 경우 기존 위치 사용
            indexing.threeUnitPositions.forEach((x, i) => {
              slotPositions.push({
                index: i,
                x: x,
                width: indexing.columnWidth
              });
            });
          }
          
          return slotPositions.map((slot) => {
            const slotIndex = slot.index;
            const slotX = slot.x;
          
          // 현재 드래그 중인 가구가 듀얼인지 확인
          let isDual = false;
          if (currentDragData) {
            isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
          }
          
          // 듀얼 가구의 경우 첫 번째 슬롯에서만 렌더링
          if (isDual && hoveredSlotIndex !== null) {
            // 듀얼 가구는 hoveredSlotIndex에서만 렌더링, 다른 슬롯에서는 렌더링 안함
            if (slotIndex !== hoveredSlotIndex) {
              return null;
            }
          } else if (!isDual) {
            // 싱글 가구의 경우 hoveredSlotIndex와 일치하는 슬롯에서만 렌더링
            if (hoveredSlotIndex === null || slotIndex !== hoveredSlotIndex || !currentDragData) {
              return null;
            }
          } else {
            // 기타 경우 렌더링 안함
            return null;
          }
          
          // 드래그 중인 가구의 모듈 데이터 가져오기
          let moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
          if (!moduleData) return null;
        
        // 듀얼 가구인 경우 기둥 체크
        if (isDual) {
          // 듀얼 가구는 기둥이 있는 슬롯에 미리보기 표시 안함
          const leftSlotInfo = columnSlots[hoveredSlotIndex];
          const rightSlotInfo = columnSlots[hoveredSlotIndex + 1];
          if (leftSlotInfo?.hasColumn || rightSlotInfo?.hasColumn) {
            return null; // 기둥이 있으면 미리보기 표시 안함
          }
        }

        // 싱글 가구의 경우 기둥 체크 및 변환
        let previewModuleData = moduleData;
        if (!isDual) {
          const previewSlotInfo = columnSlots[hoveredSlotIndex];
          if (previewSlotInfo && previewSlotInfo.hasColumn) {
            const conversionResult = convertDualToSingleIfNeeded(moduleData, previewSlotInfo, spaceInfo);
            if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
              previewModuleData = conversionResult.convertedModuleData;
            }
          }
        }

        // 미리보기용 기본 깊이 계산 함수
        const getPreviewDepth = (moduleData: ModuleData) => {
          if (moduleData?.defaultDepth) {
            return Math.min(moduleData.defaultDepth, spaceInfo.depth);
          }
          const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
          return Math.min(spaceBasedDepth, 580);
        };

        // Z축 위치 계산 상수
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const doorThicknessMm = 20;
        const doorThickness = mmToThreeUnits(doorThicknessMm);
        const panelDepthMm = 1500;
        const furnitureDepthMm = 600;
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const zOffset = -panelDepth / 2;
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;

        // 미리보기 데이터 준비
        const previewCustomDepth = getPreviewDepth(previewModuleData);
        const furnitureHeight = previewModuleData.dimensions.height * 0.01;
        const furnitureY = slotStartY + furnitureHeight / 2;
        
        // 위치 계산 - 영역별 슬롯 위치 사용
        let furnitureX;
        if (isDual && hoveredSlotIndex < slotPositions.length - 1) {
          // 듀얼 가구는 두 슬롯의 중앙에 배치
          const currentSlot = slotPositions.find(s => s.index === hoveredSlotIndex);
          const nextSlot = slotPositions.find(s => s.index === hoveredSlotIndex + 1);
          if (currentSlot && nextSlot) {
            furnitureX = (currentSlot.x + nextSlot.x) / 2;
          } else {
            return null;
          }
        } else {
          // 싱글 가구는 해당 슬롯 중앙에 배치
          const currentSlot = slotPositions.find(s => s.index === hoveredSlotIndex);
          if (currentSlot) {
            furnitureX = currentSlot.x;
          } else {
            return null;
          }
        }

        const previewDepth = mmToThreeUnits(previewCustomDepth);
        const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - previewDepth/2;

        return (
          <group key={`furniture-preview-${slotIndex}`} position={[furnitureX, furnitureY, furnitureZ]}>
            <BoxModule 
              moduleData={previewModuleData}
              color={theme.color}
              isDragging={true}
              internalHeight={previewModuleData.dimensions.height}
              hasDoor={false}
              customDepth={previewCustomDepth}
              spaceInfo={spaceInfo}
            />
          </group>
        );
          });
        })()}
    </group>
  );
};

export default SlotDropZones;