import React, { useEffect, useState, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { ColumnIndexer } from '@/editor/shared/utils/indexing/ColumnIndexer';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useCustomFurnitureStore } from '@/store/core/customFurnitureStore';
import { getModuleById, ModuleData } from '@/data/modules';
import BoxModule from '../modules/BoxModule';
import { useUIStore } from '@/store/uiStore';
import { CurrentDragData } from '@/editor/shared/furniture/types';
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

// currentDragData에서 모듈 ID 추출 헬퍼 함수
const getDragModuleId = (dragData: CurrentDragData | null): string | null => {
  if (!dragData) return null;
  // 커스텀 가구인 경우 moduleId 사용
  if (dragData.moduleId) return dragData.moduleId;
  // 일반 가구인 경우 moduleData.id 사용
  if (dragData.moduleData?.id) return dragData.moduleData.id;
  return null;
};

// 커스텀 가구인지 확인하는 헬퍼 함수
const isCustomFurniture = (moduleId: string | null): boolean => {
  return moduleId?.startsWith('custom-') || false;
};

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
  const { getCustomFurnitureById } = useCustomFurnitureStore();

  // 현재 드래그 중인 모듈 ID 추출
  const dragModuleId = getDragModuleId(currentDragData);
  const isDraggingCustomFurniture = isCustomFurniture(dragModuleId);

  // 드래그 중인 가구의 ModuleData 가져오기 (일반 또는 커스텀 가구)
  const getModuleDataForDrag = useMemo(() => {
    return (moduleId: string | null, internalSpace: any, spaceInfoWithZone: any): ModuleData | null => {
      if (!moduleId) return null;

      if (isCustomFurniture(moduleId)) {
        // 커스텀 가구인 경우 customFurnitureStore에서 데이터 변환
        const actualId = moduleId.replace(/^custom-/, '');
        const customFurniture = getCustomFurnitureById(actualId);

        if (!customFurniture) return null;

        return {
          id: moduleId,
          name: customFurniture.name,
          category: customFurniture.category as 'full' | 'upper' | 'lower',
          dimensions: {
            width: customFurniture.originalDimensions.width,
            height: customFurniture.originalDimensions.height,
            depth: customFurniture.originalDimensions.depth,
          },
          color: '#8B7355',
          description: `커스텀 가구: ${customFurniture.name}`,
          hasDoor: false,
          isDynamic: false,
          type: 'box',
          defaultDepth: customFurniture.originalDimensions.depth,
        };
      }

      // 일반 가구인 경우 getModuleById 사용
      return getModuleById(moduleId, internalSpace, spaceInfoWithZone);
    };
  }, [getCustomFurnitureById]);
  
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
  
  // 영역별 슬롯 정보 계산 - mainDoorCount와 droppedCeilingDoorCount도 고려
  const zoneSlotInfo = React.useMemo(() => {
    return ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
  }, [spaceInfo, spaceInfo.customColumnCount, spaceInfo.mainDoorCount, spaceInfo.droppedCeilingDoorCount]);
  
  // 기둥 슬롯 분석 (기둥 변경사항에 반응하도록 개선)
  const columnSlots = React.useMemo(() => {
    console.log('🔄 SlotDropZones - 기둥 슬롯 분석 업데이트:', {
      columnsCount: columns.length || 0,
      spaceWidth: spaceInfo.width,
      spaceHeight: spaceInfo.height,
      spaceDepth: spaceInfo.depth
    });
    return analyzeColumnSlots(spaceInfo, placedModules);
  }, [spaceInfo, columns, placedModules]);

  // 가구 충돌 감지 함수 (새 가구 배치용)
  const detectNewFurnitureCollisions = React.useCallback((newSlotIndex: number, isDualFurniture: boolean, zone: 'normal' | 'dropped' = 'normal', skipColumnC: boolean = false, newModuleId?: string) => {
    // Column C 슬롯인 경우 충돌 검사 건너뛰기
    if (skipColumnC) {
      const slotInfo = columnSlots[newSlotIndex];
      if (slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture) {
        console.log('🔵 Column C 슬롯 - 충돌 검사 건너뛰기');
        return []; // Column C는 2개 가구 배치 가능
      }
    }
    
    // 새 가구의 카테고리 확인
    let newCategory: string | undefined;
    if (newModuleId) {
      const newModuleData = getModuleById(newModuleId, internalSpace, spaceInfo);
      newCategory = newModuleData?.category;
      console.log('🔍 detectNewFurnitureCollisions - 새 가구 카테고리:', {
        newModuleId,
        newCategory,
        newModuleData: newModuleData ? '있음' : '없음'
      });
    } else {
      console.warn('⚠️ detectNewFurnitureCollisions - newModuleId가 없음');
    }
    
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
      const existingCategory = moduleData.category;

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
        // 상부장-하부장 조합인지 확인
        if (newCategory && existingCategory &&
            ((newCategory === 'upper' && existingCategory === 'lower') ||
             (newCategory === 'lower' && existingCategory === 'upper'))) {
          // 상부장과 하부장은 공존 가능 - 충돌로 간주하지 않음
          console.log('✅ 상부장과 하부장 공존 가능 (SlotDropZones):', {
            새가구: newCategory,
            기존가구: existingCategory,
            슬롯: newSlotIndex
          });
          return; // 충돌 목록에 추가하지 않음
        }
        
        collidingModules.push(module.id);
        if (import.meta.env.DEV) {
          console.log('🚨 새 가구 배치로 인한 충돌 감지:', {
            newSlots: occupiedSlots,
            collidingModule: module.id,
            existingSlots: moduleSlots,
            zone,
            newCategory,
            existingCategory
          });
        }
      }
    });

    return collidingModules;
  }, [placedModules, internalSpace, spaceInfo, columnSlots]);

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
    // 서라운드 모드일 때는 모든 영역 검색, 노서라운드 모드일 때는 현재 활성 탭의 영역만 검색
    const isSurround = spaceInfo.surroundType === 'surround';
    const activeZone = !isSurround && spaceInfo.droppedCeiling?.enabled && activeDroppedCeilingTab === 'dropped' ? 'dropped' :
                      !isSurround && spaceInfo.droppedCeiling?.enabled && activeDroppedCeilingTab === 'main' ? 'normal' :
                      undefined;

    const slotIndex = getSlotIndexFromRaycast(
      dragEvent.clientX,
      dragEvent.clientY,
      canvasElement,
      camera,
      scene,
      spaceInfo,
      activeZone
    );

    if (slotIndex === null) {
      return false;
    }

    // 단내림 활성화 시 영역 확인
    let zone: 'normal' | 'dropped' = 'normal';
    let zoneSlotIndex = slotIndex;

    if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
      // 서라운드 모드: 레이캐스팅된 콜라이더의 zone 확인
      // 노서라운드 모드: activeDroppedCeilingTab으로 zone 결정
      if (isSurround) {
        // 레이캐스팅으로 실제 교차된 콜라이더의 zone 찾기
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const rect = canvasElement.getBoundingClientRect();
        mouse.x = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((dragEvent.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // 슬롯 콜라이더 찾기
        const slotColliders: THREE.Object3D[] = [];
        scene.traverse((child) => {
          if (child.userData?.type === 'slot-collider' || child.userData?.isSlotCollider) {
            slotColliders.push(child);
          }
        });

        const intersects = raycaster.intersectObjects(slotColliders, false);
        if (intersects.length > 0) {
          zone = intersects[0].object.userData?.zone || 'normal';
        }
      } else {
        // 노서라운드 모드: activeDroppedCeilingTab으로 zone 결정
        zone = activeDroppedCeilingTab === 'dropped' ? 'dropped' : 'normal';
      }

      zoneSlotIndex = slotIndex;

      console.log('🎯 드롭 영역 확인:', {
        zone,
        zoneSlotIndex,
        activeTab: activeDroppedCeilingTab,
        isSurround
      });
    }
    
    // 듀얼/싱글 가구 판별
    const isDual = isDualFurniture(dragData.moduleData.id, spaceInfo);
    
    // 기둥 슬롯 정보 확인 - 각 영역의 columnSlots 사용
    const targetSlotInfo = columnSlots[zoneSlotIndex];
    
    console.log('🎯 드롭 시도:', {
      slotIndex,
      zoneSlotIndex,
      zone,
      hasColumn: targetSlotInfo?.hasColumn,
      columnId: targetSlotInfo?.column?.id,
      isDual,
      moduleId: dragData.moduleData.id,
      columnSlots_length: columnSlots.length,
      targetSlotInfo
    });
    
    // 이동 중인 가구의 ID 찾기 (기존 가구를 이동하는 경우)
    const excludeModuleId = currentDragData?.placedModuleId || undefined;
    
    // 모든 슬롯에 대해 기본 가용성 검사 수행 (기둥 유무 관계없이)
    if (!isSlotAvailable(zoneSlotIndex, isDual, placedModules, spaceInfo, dragData.moduleData.id, excludeModuleId)) {
      console.log('❌ 슬롯 가용성 검사 실패:', {
        슬롯: zoneSlotIndex,
        이동중인가구ID: excludeModuleId,
        모듈ID: dragData.moduleData.id
      });
      return false; // 충돌하는 슬롯에는 배치 불가
    }
    
    // 기둥이 있는 슬롯의 경우 추가 검사 수행
    if (targetSlotInfo?.hasColumn) {
      console.log('✅ 기둥 슬롯 추가 검사 - findAvailableSpacesInColumnSlot에서 상세 검사 예정');
    }
    
    // 가구 데이터 조회 - 기본 타입만 있는 경우 실제 너비 계산
    let moduleId = dragData.moduleData.id;
    
    // ID에 너비가 없는 경우 (기본 타입만 있는 경우) 실제 슬롯 너비 추가
    if (!moduleId.match(/-[\d.]+$/)) {
      const originalId = moduleId;  // 원래 ID 저장
      const isDual = moduleId.includes('dual-');
      
      // 실제 슬롯 너비 사용 (평균이 아닌 정확한 슬롯 너비)
      let targetWidth: number;
      if (indexing.slotWidths && indexing.slotWidths[zoneSlotIndex] !== undefined) {
        if (isDual && zoneSlotIndex < indexing.slotWidths.length - 1) {
          // 듀얼 가구: 두 슬롯 너비의 합
          targetWidth = indexing.slotWidths[zoneSlotIndex] + indexing.slotWidths[zoneSlotIndex + 1];
        } else {
          // 싱글 가구: 해당 슬롯 너비
          targetWidth = indexing.slotWidths[zoneSlotIndex];
        }
      } else {
        // fallback: 평균 너비 사용
        targetWidth = isDual ? indexing.columnWidth * 2 : indexing.columnWidth;
      }
      
      // 너비를 소수점 2자리까지 유지 (599.67mm 같은 값 보존)
      const widthForId = Math.round(targetWidth * 100) / 100;
      moduleId = `${moduleId}-${widthForId}`;
      
      // dragData도 업데이트
      dragData.moduleData.id = moduleId;
      
      console.log('🔥 [SlotDropZones] 너비 추가:', {
        originalId: originalId,
        calculatedId: moduleId,
        targetWidth: targetWidth,
        columnWidth: indexing.columnWidth
      });
    }
    
    // zone 정보를 포함한 spaceInfo 생성
    const spaceInfoWithZone = {
      ...spaceInfo,
      zone: zone
    } as any;
    
    console.log('🔥🔥🔥 [SlotDropZones] getModuleById 호출:', {
      moduleId: moduleId,
      internalSpace: internalSpace,
      spaceInfo: {
        width: spaceInfo.width,
        surroundType: spaceInfo.surroundType,
        customColumnCount: spaceInfo.customColumnCount,
        zone: zone
      }
    });
    
    const moduleData = getModuleById(moduleId, internalSpace, spaceInfoWithZone);
    
    console.log('🔥🔥🔥 [SlotDropZones] getModuleById 결과:', {
      found: !!moduleData,
      moduleData: moduleData ? {
        id: moduleData.id,
        name: moduleData.name,
        width: moduleData.dimensions.width
      } : null
    });
    
    if (!moduleData) {
      console.error('❌❌❌ [SlotDropZones] 모듈을 찾을 수 없음:', moduleId);
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
    // Column C 첫 번째 가구인 경우 특별 처리
    const isColumnCSlot = targetSlotInfo?.columnType === 'medium' && targetSlotInfo?.allowMultipleFurniture;
    const isFirstFurnitureInColumnC = isColumnCSlot && placedModules.filter(m => m.slotIndex === zoneSlotIndex).length === 0;
    
    let customDepth;
    if (isFirstFurnitureInColumnC) {
      // Column C 첫 번째 가구는 원래 깊이 사용
      customDepth = currentCustomDepth || actualModuleData.defaultDepth || actualModuleData.dimensions.depth || 600;
      console.log('🔵 Column C 첫 번째 가구 깊이 설정:', {
        currentCustomDepth,
        defaultDepth: actualModuleData.defaultDepth,
        dimensionsDepth: actualModuleData.dimensions.depth,
        finalCustomDepth: customDepth
      });
    } else {
      customDepth = currentCustomDepth || getDefaultDepth(actualModuleData);
    }
    
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
    
    // 슬롯 너비 계산 - 슬롯에 정확히 맞는 너비 설정
    let customWidth: number | undefined;
    
    // 슬롯 너비 배열이 있으면 우선 사용
    if (indexing.slotWidths && zoneSlotIndex !== undefined) {
      if (actualIsDual && zoneSlotIndex < indexing.slotWidths.length - 1) {
        // 듀얼 가구: 두 슬롯의 너비 합
        customWidth = indexing.slotWidths[zoneSlotIndex] + indexing.slotWidths[zoneSlotIndex + 1];
        console.log('📏 듀얼 가구 슬롯 너비 설정:', {
          slotIndex: zoneSlotIndex,
          slot1Width: indexing.slotWidths[zoneSlotIndex],
          slot2Width: indexing.slotWidths[zoneSlotIndex + 1],
          totalWidth: customWidth
        });
      } else if (indexing.slotWidths[zoneSlotIndex] !== undefined) {
        // 싱글 가구: 해당 슬롯의 너비
        customWidth = indexing.slotWidths[zoneSlotIndex];
        console.log('📏 싱글 가구 슬롯 너비 설정:', {
          slotIndex: zoneSlotIndex,
          slotWidth: customWidth
        });
      }
    }
    
    // zone별 슬롯 너비가 있으면 사용
    else if (zone === 'dropped' && indexing.zones?.dropped?.slotWidths) {
      const droppedSlotWidths = indexing.zones.dropped.slotWidths;
      if (actualIsDual && zoneSlotIndex < droppedSlotWidths.length - 1) {
        customWidth = droppedSlotWidths[zoneSlotIndex] + droppedSlotWidths[zoneSlotIndex + 1];
      } else if (droppedSlotWidths[zoneSlotIndex] !== undefined) {
        customWidth = droppedSlotWidths[zoneSlotIndex];
      }
      console.log('📏 단내림 영역 슬롯 너비 설정:', customWidth);
    }
    else if (zone === 'normal' && indexing.zones?.normal?.slotWidths) {
      const normalSlotWidths = indexing.zones.normal.slotWidths;
      if (actualIsDual && zoneSlotIndex < normalSlotWidths.length - 1) {
        customWidth = normalSlotWidths[zoneSlotIndex] + normalSlotWidths[zoneSlotIndex + 1];
      } else if (normalSlotWidths[zoneSlotIndex] !== undefined) {
        customWidth = normalSlotWidths[zoneSlotIndex];
      }
      console.log('📏 일반 영역 슬롯 너비 설정:', customWidth);
    }
    
    // fallback: 평균 슬롯 너비 사용
    if (!customWidth) {
      if (zone === 'dropped' && indexing.zones?.dropped) {
        customWidth = indexing.zones.dropped.columnWidth;
      } else if (zone === 'normal' && indexing.zones?.normal) {
        customWidth = indexing.zones.normal.columnWidth;
      } else {
        customWidth = indexing.columnWidth;
      }
      console.log('📏 평균 슬롯 너비 사용 (fallback):', customWidth);
    }
    let adjustedDepth = customDepth; // Column C의 경우 조정될 수 있음
    
    // 기둥이 있는 슬롯인 경우 중복 배치 가능성 검토
    if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
      // 기둥 슬롯에서 사용 가능한 공간들 찾기
      const availableSpaces = findAvailableSpacesInColumnSlot(
        targetSlotInfo,
        zoneSlotIndex,
        spaceInfo,
        placedModules,
        customDepth // 원래 깊이 전달
      );
      
      console.log('🏗️ 기둥 슬롯의 사용 가능한 공간:', {
        zoneSlotIndex,
        spacesCount: availableSpaces.length,
        spaces: availableSpaces.map(s => ({
          type: s.type,
          position: s.position,
          maxWidth: s.maxWidth,
          customDepth: s.customDepth
        }))
      });
      
      // 비어있는 공간만 필터링
      const emptySpaces = availableSpaces.filter(s => !s.isOccupied);
      
      console.log('🎯 빈 공간 필터링:', {
        전체공간: availableSpaces.length,
        빈공간: emptySpaces.length,
        공간상태: availableSpaces.map(s => ({
          type: s.type,
          isOccupied: s.isOccupied,
          position: s.position.x.toFixed(3)
        }))
      });
      
      // 빈 공간이 있으면 배치
      if (emptySpaces.length > 0) {
        // 가장 적합한 공간 선택
        // Column C의 경우: 비어있는 첫 번째 서브슬롯 선택 (left -> right 순서)
        // 일반 기둥의 경우: 가장 넓은 공간 선택
        let bestSpace;
        
        if (targetSlotInfo.columnType === 'medium' && targetSlotInfo.allowMultipleFurniture) {
          // Column C: 깊이 기반 배치 - full 타입을 우선 선택 (첫 번째 가구)
          if (emptySpaces.length > 0) {
            // full 타입(첫 번째 가구)을 우선 선택, 없으면 front 타입(기둥 앞) 선택
            bestSpace = emptySpaces.find(s => s.type === 'full') || emptySpaces[0];
            console.log('🔵 Column C 빈 공간 선택:', {
              선택된타입: bestSpace.type,
              위치: bestSpace.position,
              maxWidth: bestSpace.maxWidth,
              customDepth: bestSpace.customDepth,
              빈공간수: emptySpaces.length,
              빈공간타입들: emptySpaces.map(s => s.type)
            });
          } else {
            // 모든 공간이 차있으면 배치 불가
            console.warn('⚠️ Column C 모든 공간이 차있음');
            showAlert('이 슬롯에는 더 이상 가구를 배치할 공간이 없습니다.', { title: '배치 불가' });
            return false;
          }
        } else {
          // 일반 기둥: 가장 넓은 공간 선택
          bestSpace = emptySpaces.reduce((prev, curr) => 
            curr.maxWidth > prev.maxWidth ? curr : prev
          );
        }
        
        // 첫 번째 모듈이면 도어 있게, 이후 모듈은 도어 없게
        // Column C의 경우 깊이 기반 배치로 도어 여부 결정
        let existingModulesInSlot: typeof placedModules;
        let shouldHaveDoor: boolean;
        
        if (targetSlotInfo.columnType === 'medium') {
          // Column C 깊이 기반 배치
          existingModulesInSlot = placedModules.filter(m => m.slotIndex === slotIndex);
          
          if (bestSpace.type === 'front') {
            // 기둥 앞 배치 가구는 도어 없음
            shouldHaveDoor = false;
          } else {
            // 첫 번째 가구는 도어 있음
            shouldHaveDoor = existingModulesInSlot.length === 0;
          }
          
          console.log('🔵 Column C 깊이 기반 배치:', {
            slotIndex,
            bestSpaceType: bestSpace.type,
            위치: {
              x: bestSpace.position.x.toFixed(3),
              z: bestSpace.position.z.toFixed(3)
            },
            existingModulesCount: existingModulesInSlot.length,
            shouldHaveDoor,
            customDepth: bestSpace.customDepth
          });
        } else {
          // 일반 슬롯의 경우 - 기존 로직
          existingModulesInSlot = placedModules.filter(m => m.slotIndex === slotIndex);
          shouldHaveDoor = existingModulesInSlot.length === 0;
        }
        
        console.log('✅ 선택된 배치 공간:', {
          type: bestSpace.type,
          position: bestSpace.position,
          maxWidth: bestSpace.maxWidth,
          shouldHaveDoor,
          existingModulesCount: existingModulesInSlot.length
        });
        
        // 위치와 크기 조정
        let finalPosition = { 
          x: bestSpace.position.x, 
          y: 0, 
          z: bestSpace.position.z 
        };
        let adjustedFurnitureWidth: number;
        // Column C의 경우 깊이 기반 배치
        if (targetSlotInfo.columnType === 'medium') {
          if (bestSpace.type === 'front') {
            // 기둥 앞 배치 - 전체 슬롯 너비 사용
            adjustedFurnitureWidth = bestSpace.maxWidth;
            console.log('🔵 Column C 기둥 앞 배치:', {
              originalWidth: actualModuleData.dimensions.width,
              adjustedWidth: adjustedFurnitureWidth,
              customDepth: bestSpace.customDepth,
              position: {
                x: bestSpace.position.x.toFixed(3),
                z: bestSpace.position.z.toFixed(3)
              }
            });
          } else {
            // 첫 번째 가구 - 기둥 반대편 배치
            adjustedFurnitureWidth = bestSpace.maxWidth;
            console.log('🔵 Column C 첫 번째 가구 배치:', {
              originalWidth: actualModuleData.dimensions.width,
              adjustedWidth: adjustedFurnitureWidth,
              position: `x=${bestSpace.position.x.toFixed(3)}`
            });
          }
        } else if (bestSpace.maxWidth >= 150) {
          // 일반 기둥의 경우 공간에 맞게 조정
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
          if (bestSpace.type === 'front') {
            // 기둥 앞 배치 - 깊이 조정
            finalCustomDepth = bestSpace.customDepth || Math.max(200, 730 - targetSlotInfo.column.depth);
            customWidthForSplit = adjustedFurnitureWidth;
          } else if (bestSpace.type === 'full') {
            // 첫 번째 가구 - 정상 깊이 유지
            finalCustomDepth = bestSpace.customDepth || customDepth;
            customWidthForSplit = adjustedFurnitureWidth;
          } else {
            // 기타 경우 - 정상 깊이 (또는 bestSpace에서 제공한 깊이)
            finalCustomDepth = bestSpace.customDepth || customDepth;
            customWidthForSplit = adjustedFurnitureWidth;
          }
          
          console.log('🟣 Column C 깊이 처리:', {
            columnDepth: targetSlotInfo.column.depth,
            spaceType: bestSpace.type,
            originalDepth: customDepth,
            bestSpaceCustomDepth: bestSpace.customDepth,
            finalDepth: finalCustomDepth,
            isDepthAdjusted: finalCustomDepth !== customDepth,
            customWidth: customWidthForSplit,
            existingFurnitureCount: existingModulesInSlot.length
          });
        }
        
        // 새 모듈 설정 업데이트
        // 소수점 포함 숫자만 정확히 제거하는 패턴
        const baseModuleType = actualModuleId.replace(/-[\d.]+$/, ''); // 너비를 제외한 기본 타입
        const newModule = {
          id: placedId,
          moduleId: actualModuleId,
          baseModuleType: baseModuleType, // 기본 모듈 타입 저장
          position: finalPosition,
          rotation: 0,
          hasDoor: shouldHaveDoor, // 첫 번째 모듈만 도어
          customDepth: finalCustomDepth,
          customWidth: customWidthForSplit || customWidth, // 분할 배치 시 너비
          slotIndex: zoneSlotIndex,
          isDualSlot: actualIsDual,
          isValidInCurrentSpace: true,
          zone: zone,
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
            originalDualSlots: isDual ? [zoneSlotIndex, zoneSlotIndex + 1] : [zoneSlotIndex],
            actualSlots: actualIsDual ? [zoneSlotIndex, zoneSlotIndex + 1] : [zoneSlotIndex],
            doorWidth: actualModuleData.dimensions.width - 3, // 기본값: 가구 너비 - 3mm
            spaceType: bestSpace.type, // 'left', 'right', 'front'
            moduleOrder: existingModulesInSlot.length // 이 슬롯에서 몇 번째 모듈인지
          }
        };
        
        // 모듈 추가
        console.log('🎯 Column C 가구 추가:', {
          slotIndex,
          서브슬롯타입: bestSpace.type,
          위치: {
            x: newModule.position.x.toFixed(3),
            y: newModule.position.y.toFixed(3),
            z: newModule.position.z.toFixed(3)
          },
          너비: newModule.adjustedWidth,
          customWidth: newModule.customWidth,
          moduleId: newModule.moduleId,
          도어: newModule.hasDoor,
          isSplit: newModule.isSplit
        });
        
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
      // 소수점 포함 숫자만 정확히 제거하는 패턴
      const baseModuleType = actualModuleId.replace(/-[\d.]+$/, ''); // 너비를 제외한 기본 타입
      const newModule = {
        id: placedId,
        moduleId: actualModuleId,
        baseModuleType: baseModuleType, // 기본 모듈 타입 저장
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
      const collidingModules = detectNewFurnitureCollisions(zoneSlotIndex, actualIsDual, zone, false, actualModuleId);
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
          zoneSlotIndex,
          columnDepth: columnDepth + 'mm',
          method: '깊이 조정 (가구가 얕아짐)'
        });
      } else if (columnDepth <= MEDIUM_THRESHOLD) {
        // 기둥C (300mm): 폭 조정만
        columnProcessingMethod = 'width-adjustment';
        console.log('🏛️ 기둥C 처리 모드:', {
          zoneSlotIndex,
          columnDepth: columnDepth + 'mm',
          method: '폭 조정 (가구가 좁아짐)'
        });
      } else {
        // 기둥B (730mm): 폭 조정만
        columnProcessingMethod = 'width-adjustment';
        console.log('🏛️ 기둥B 처리 모드:', {
          zoneSlotIndex,
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
      
      console.log('🔍 calculateFurnitureBounds 호출 전 targetSlotInfo:', {
        hasColumn: targetSlotInfo.hasColumn,
        columnDepth: targetSlotInfo.column?.depth,
        columnWidth: targetSlotInfo.column?.width,
        columnPosition: targetSlotInfo.column?.position,
        intrusionDirection: targetSlotInfo.intrusionDirection,
        availableWidth: targetSlotInfo.availableWidth,
        zoneSlotIndex,
        zone,
        originalSlotBounds
      });
      
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
    const collidingModules = detectNewFurnitureCollisions(zoneSlotIndex, actualIsDual, zone, false, actualModuleId);
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
      const collidingModules = detectNewFurnitureCollisions(cabinet.slotIndex, false, 'normal', false, cabinet.moduleId); // 캐비넷은 단일 슬롯
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
        
        // 커스텀 가구는 싱글로 취급
        const isDual = isDraggingCustomFurniture ? false : (dragModuleId ? isDualFurniture(dragModuleId, spaceInfo) : false);

        // 슬롯 가용성 검사 - zone별 슬롯 인덱스 사용
        if (dragModuleId && isSlotAvailable(zoneSlotIndex, isDual, placedModules.filter(m => m.zone === zone), spaceInfo, dragModuleId)) {
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

  // Click & Place 모드를 위한 클릭 핸들러
  useEffect(() => {
    // furniturePlacementMode가 true이고 currentDragData가 있을 때만 클릭 핸들러 활성화
    const furniturePlacementMode = useFurnitureStore.getState().furniturePlacementMode;
    if (!furniturePlacementMode || !currentDragData) {
      return;
    }

    const handleClick = (e: MouseEvent) => {
      // 캔버스가 아닌 다른 요소를 클릭한 경우 무시
      const target = e.target as HTMLElement;
      if (target.tagName !== 'CANVAS') {
        return;
      }

      console.log('🎯 [SlotDropZones] Click & Place 클릭 감지:', {
        furniturePlacementMode,
        currentDragData: currentDragData?.moduleData?.id,
        clientX: e.clientX,
        clientY: e.clientY
      });

      const canvas = target as HTMLCanvasElement;
      
      // 클릭 이벤트를 드래그 이벤트처럼 처리
      // DragEvent를 시뮬레이션하기 위한 객체 생성
      const simulatedDragEvent = new DragEvent('drop', {
        clientX: e.clientX,
        clientY: e.clientY,
        bubbles: true,
        cancelable: true
      });

      // DataTransfer를 시뮬레이션
      Object.defineProperty(simulatedDragEvent, 'dataTransfer', {
        value: {
          getData: (format: string) => {
            if (format === 'application/json') {
              return JSON.stringify(currentDragData);
            }
            return '';
          },
          types: ['application/json']
        },
        writable: false
      });

      // handleSlotDrop 호출
      const result = handleSlotDrop(simulatedDragEvent as any, canvas);
      
      console.log('🎯 [SlotDropZones] Click & Place 결과:', result);
      
      // 성공적으로 배치되면 placement mode 종료
      if (result) {
        useFurnitureStore.getState().setFurniturePlacementMode(false);
      }
    };

    // 캔버스에 클릭 이벤트 리스너 추가
    const canvasElement = document.querySelector('canvas');
    if (canvasElement) {
      canvasElement.addEventListener('click', handleClick);
      console.log('✅ [SlotDropZones] Click & Place 핸들러 등록됨');
    }

    return () => {
      if (canvasElement) {
        canvasElement.removeEventListener('click', handleClick);
      }
    };
  }, [currentDragData, handleSlotDrop]);
  
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
          // zoneSlotInfo는 이미 위에서 계산됨
          
          if (hasDroppedCeiling && zoneSlotInfo.dropped) {
            // 단내림 활성화된 경우
            const colliders = [];
            const isSurround = spaceInfo.surroundType === 'surround';

            // 서라운드 모드에서는 양쪽 영역 모두 콜라이더 생성
            // 노서라운드 모드에서는 현재 활성 탭의 영역만 콜라이더 생성
            if (isSurround || activeDroppedCeilingTab === 'main') {
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
            }

            if (isSurround || activeDroppedCeilingTab === 'dropped') {
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
          // zoneSlotInfo는 이미 위에서 계산됨
          
          // ColumnGuides와 완전히 동일한 계산 사용
          const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
          
          // ColumnGuides와 동일한 Y 좌표 계산
          const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
          
          // Room.tsx의 바닥 계산과 동일하게 수정 - 실제 공간 깊이 사용
          const doorThicknessMm = 20;
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이 사용
          const furnitureDepthMm = Math.min(panelDepthMm, 600); // 가구 깊이는 공간 깊이와 600mm 중 작은 값
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          
          const roomBackZ = -mmToThreeUnits(internalSpace.depth / 2);
          const frameEndZ = furnitureZOffset + furnitureDepth/2; // 좌우 프레임의 앞쪽 끝
          const slotFloorDepth = frameEndZ - roomBackZ; // 바닥 슬롯 메쉬 깊이
          const slotFloorZ = (frameEndZ + roomBackZ) / 2; // 바닥 중심 Z 좌표
          
          if (hasDroppedCeiling && zoneSlotInfo.dropped) {
            // 단내림 활성화된 경우
            const isSurround = spaceInfo.surroundType === 'surround';
            const floors = [];

            // 서라운드 모드: 양쪽 영역 모두 표시
            // 노서라운드 모드: 현재 활성 탭의 영역만 표시
            if (isSurround || activeDroppedCeilingTab === 'main') {
              // 메인구간 바닥
              const leftX = mmToThreeUnits(zoneSlotInfo.normal.startX);
              const rightX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);
              const centerX = (leftX + rightX) / 2;
              const width = rightX - leftX;

              floors.push(
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
            }

            if (isSurround || activeDroppedCeilingTab === 'dropped') {
              // 단내림구간 바닥
              const leftX = mmToThreeUnits(zoneSlotInfo.dropped.startX);
              const rightX = mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width);
              const centerX = (leftX + rightX) / 2;
              const width = rightX - leftX;

              floors.push(
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

            return floors;
          } else {
            // 단내림이 없는 경우 전체 영역 표시 - zoneSlotInfo 사용
            const leftX = mmToThreeUnits(zoneSlotInfo.normal.startX);
            const rightX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);
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
          // zoneSlotInfo는 이미 위에서 계산됨
          
          // 마우스 위치에 따라 동적으로 영역 결정
          let zoneInfo = null;
          let activeZone: 'normal' | 'dropped' = 'normal';
          
          if (hasDroppedCeiling && zoneSlotInfo.dropped && hoveredSlotIndex !== null) {
            // hoveredSlotIndex가 어느 영역에 속하는지 확인
            const droppedSlotCount = zoneSlotInfo.dropped.columnCount;
            const normalSlotCount = zoneSlotInfo.normal.columnCount;
            
            // 전체 슬롯에서 단내림 영역 슬롯인지 확인
            if (hoveredSlotIndex < droppedSlotCount) {
              // 단내림 영역
              zoneInfo = zoneSlotInfo.dropped;
              activeZone = 'dropped';
            } else if (hoveredSlotIndex < droppedSlotCount + normalSlotCount) {
              // 메인 영역 (인덱스 조정 필요)
              zoneInfo = zoneSlotInfo.normal;
              activeZone = 'normal';
            }
          } else if (hasDroppedCeiling && zoneSlotInfo.dropped) {
            // hoveredSlotIndex가 없을 때는 activeDroppedCeilingTab 기준으로
            if (activeDroppedCeilingTab === 'main') {
              zoneInfo = zoneSlotInfo.normal;
              activeZone = 'normal';
            } else if (activeDroppedCeilingTab === 'dropped') {
              zoneInfo = zoneSlotInfo.dropped;
              activeZone = 'dropped';
            }
          }
          
          // 영역별 슬롯 위치 배열 생성 - 모든 영역의 슬롯 포함
          const slotPositions = [];
          if (hasDroppedCeiling && zoneSlotInfo.dropped && zoneSlotInfo.normal) {
            // 단내림 영역 슬롯 추가
            for (let i = 0; i < zoneSlotInfo.dropped.columnCount; i++) {
              const slotCenterMm = zoneSlotInfo.dropped.startX + (i * zoneSlotInfo.dropped.columnWidth) + (zoneSlotInfo.dropped.columnWidth / 2);
              slotPositions.push({
                index: i,
                x: mmToThreeUnits(slotCenterMm),
                width: zoneSlotInfo.dropped.columnWidth,
                zone: 'dropped'
              });
            }
            // 메인 영역 슬롯 추가
            for (let i = 0; i < zoneSlotInfo.normal.columnCount; i++) {
              const slotCenterMm = zoneSlotInfo.normal.startX + (i * zoneSlotInfo.normal.columnWidth) + (zoneSlotInfo.normal.columnWidth / 2);
              slotPositions.push({
                index: i + zoneSlotInfo.dropped.columnCount, // 전체 인덱스
                x: mmToThreeUnits(slotCenterMm),
                width: zoneSlotInfo.normal.columnWidth,
                zone: 'normal'
              });
            }
          } else {
            // 단내림이 없는 경우 기존 위치 사용
            indexing.threeUnitPositions.forEach((x, i) => {
              slotPositions.push({
                index: i,
                x: x,
                width: indexing.columnWidth,
                zone: 'normal'
              });
            });
          }
          
          return slotPositions.map((slot) => {
            const slotIndex = slot.index;
            const slotX = slot.x;
          
          // 현재 드래그 중인 가구가 듀얼인지 확인
          // 커스텀 가구는 싱글로 취급
          let isDual = false;
          if (currentDragData && dragModuleId && !isDraggingCustomFurniture) {
            isDual = isDualFurniture(dragModuleId, spaceInfo);
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
          let moduleData = getModuleDataForDrag(dragModuleId, internalSpace, spaceInfo);
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

        // Z축 위치 계산 상수 - 실제 공간 깊이 사용
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const doorThicknessMm = 20;
        const doorThickness = mmToThreeUnits(doorThicknessMm);
        const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이 사용
        const furnitureDepthMm = Math.min(panelDepthMm, 600); // 가구 깊이는 공간 깊이와 600mm 중 작은 값
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