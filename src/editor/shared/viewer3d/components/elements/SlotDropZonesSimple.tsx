import React, { useEffect, useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getModuleById, ModuleData, generateDynamicModules } from '@/data/modules';
import BoxModule from '../modules/BoxModule';
import { 
  getSlotIndexFromMousePosition as getSlotIndexFromRaycast,
  isDualFurniture,
  calculateSlotDimensions,
  calculateSlotStartY,
  calculateFurniturePosition
} from '../../utils/slotRaycast';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlert } from '@/contexts/AlertContext';

interface SlotDropZonesSimpleProps {
  spaceInfo: SpaceInfo;
  showAll?: boolean;
  showDimensions?: boolean;
  activeZone?: 'normal' | 'dropped';
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZonesSimple: React.FC<SlotDropZonesSimpleProps> = ({ spaceInfo, showAll = true, showDimensions = true, activeZone: activeZoneProp }) => {
  if (!spaceInfo) return null;
  
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const { showAlert } = useAlert();
  
  // Three.js 컨텍스트 접근
  const { camera, scene } = useThree();
  const { viewMode } = useSpace3DView();
  const activeZone = activeZoneProp;
  console.log('🔥 SlotDropZonesSimple activeZone:', activeZone, 'droppedCeilingEnabled:', spaceInfo.droppedCeiling?.enabled);
  
  // 테마 컨텍스트에서 색상 가져오기
  const { theme } = useTheme();
  
  // 마우스가 hover 중인 슬롯 인덱스 상태
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  
  // 내경 공간 및 인덱싱 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  
  // 슬롯 크기 및 위치 계산
  const slotDimensions = calculateSlotDimensions(spaceInfo);
  const slotStartY = calculateSlotStartY(spaceInfo);
  
  // mm를 Three.js 단위로 변환하는 함수
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 드롭 처리 함수
  const handleSlotDrop = useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement, activeZoneParam?: 'normal' | 'dropped'): boolean => {
    const zoneToUse = activeZoneParam || activeZone;
    console.log('🎯 handleSlotDrop called with activeZoneParam:', activeZoneParam, ', activeZone:', activeZone, ', using:', zoneToUse);
    console.log('🎯 spaceInfo.droppedCeiling:', spaceInfo.droppedCeiling);
    if (!currentDragData) {
      console.log('❌ No currentDragData');
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
    
    // needsWarning 확인
    if (dragData.moduleData?.needsWarning) {
      showAlert('배치슬롯의 사이즈를 늘려주세요', { title: '배치 불가' });
      return false;
    }
    
    console.log('🎯 단내림 체크:', {
      enabled: spaceInfo.droppedCeiling?.enabled,
      zoneToUse: zoneToUse,
      activeZone: activeZone,
      activeZoneParam: activeZoneParam,
      condition: spaceInfo.droppedCeiling?.enabled && zoneToUse
    });
    
    // 단내림이 활성화된 경우 영역별 처리
    if (spaceInfo.droppedCeiling?.enabled && zoneToUse) {
      console.log('🎯 단내림 활성화, zoneToUse:', zoneToUse);
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      console.log('🎯 zoneInfo:', zoneInfo);
      
      // 활성 영역에 맞는 인덱싱 생성
      let zoneIndexing;
      let zoneInternalSpace;
      
      if (zoneToUse === 'dropped' && zoneInfo.dropped) {
        console.log('🎯 Processing dropped zone placement');
        // 단내림 영역용 spaceInfo 생성
        const droppedSpaceInfo = {
          ...spaceInfo,
          width: zoneInfo.dropped.width,
          customColumnCount: zoneInfo.dropped.columnCount,
          columnMode: 'custom' as const
        };
        zoneInternalSpace = {
          ...internalSpace,
          width: zoneInfo.dropped.width,
          startX: zoneInfo.dropped.startX,
          // 단내림 구간은 높이가 낮음
          height: internalSpace.height - (spaceInfo.droppedCeiling?.dropHeight || 200)
        };
        console.log('🎯 Dropped zone config:', {
          width: zoneInfo.dropped.width,
          columnCount: zoneInfo.dropped.columnCount,
          startX: zoneInfo.dropped.startX,
          height: zoneInternalSpace.height
        });
        zoneIndexing = calculateSpaceIndexing(droppedSpaceInfo);
      } else {
        // 메인 영역용 spaceInfo 생성  
        const normalSpaceInfo = {
          ...spaceInfo,
          width: zoneInfo.normal.width,
          customColumnCount: zoneInfo.normal.columnCount,
          columnMode: 'custom' as const
        };
        zoneInternalSpace = {
          ...internalSpace,
          width: zoneInfo.normal.width,
          startX: zoneInfo.normal.startX
        };
        zoneIndexing = calculateSpaceIndexing(normalSpaceInfo);
      }
      
      // 영역별 인덱싱으로 슬롯 인덱스 계산
      const slotIndex = getSlotIndexFromRaycast(
        dragEvent.clientX,
        dragEvent.clientY,
        canvasElement,
        camera,
        scene,
        spaceInfo,  // 원본 spaceInfo 사용
        zoneToUse   // activeZone 전달
      );
      
      if (slotIndex === null) {
        return false;
      }
      
      // 레이캐스트로 받은 슬롯 인덱스는 이미 영역별로 생성된 콜라이더의 로컬 인덱스
      // 즉, 각 영역에서 0부터 시작하는 인덱스
      const zoneSlotIndex = slotIndex;
      
      // 영역 검증 - 활성 영역에 맞는 슬롯인지 확인
      if (zoneToUse === 'dropped' && slotIndex >= zoneInfo.dropped.columnCount) {
        return false;
      } else if (zoneToUse === 'normal' && slotIndex >= zoneInfo.normal.columnCount) {
        return false;
      }
      
      // 영역별 spaceInfo 생성 (가구 크기 계산용) - 이미 위에서 생성했으므로 재사용
      const zoneSpaceInfo = {
        ...spaceInfo,
        width: zoneInternalSpace.width,
        customColumnCount: zoneIndexing.columnCount,
        columnMode: 'custom' as const, // columnMode도 설정
        // 단내림 구간인 경우 높이 조정
        height: zoneToUse === 'dropped' && spaceInfo.droppedCeiling?.dropHeight 
          ? spaceInfo.height - spaceInfo.droppedCeiling.dropHeight 
          : spaceInfo.height
      };
      
      
      // 영역별 모듈 목록 생성
      const zoneModules = generateDynamicModules(zoneInternalSpace, zoneSpaceInfo);
      
      // 드래그하는 모듈과 동일한 타입의 모듈 찾기
      // 원본 모듈의 타입 정보 추출 (예: shelf-single-type2-1 → shelf-single-type2)
      const originalModuleParts = dragData.moduleData.id.split('-');
      const moduleType = originalModuleParts.slice(0, -1).join('-'); // 마지막 숫자 부분만 제거
      
      // 듀얼 가구 여부 판단 - 원본 모듈 ID로 판단
      const isDual = dragData.moduleData.id.startsWith('dual-');
      
      // 영역에 맞는 너비의 동일 타입 모듈 찾기
      const zoneColumnWidth = zoneIndexing.columnWidth;  // mm 단위
      const targetWidth = isDual ? zoneColumnWidth * 2 : zoneColumnWidth;
      
      
      const moduleData = zoneModules.find(m => {
        const moduleParts = m.id.split('-');
        const mType = moduleParts.slice(0, -1).join('-');
        // 타입이 같고, 너비가 목표 너비와 일치하는 모듈 찾기
        return mType === moduleType && Math.abs(m.dimensions.width - targetWidth) < 10;
      });
      
      if (!moduleData) {
        return false;
      }
      
      
      // 듀얼 가구 여부는 이미 위에서 판단했으므로 재사용
      
      // 슬롯 가용성 검사 (영역 내 인덱스 사용)
      const zoneExistingModules = placedModules.filter(m => m.zone === zoneToUse);
      const hasSlotConflict = zoneExistingModules.some(m => {
        if (isDual) {
          // 듀얼 가구는 2개 슬롯 차지
          return m.slotIndex === zoneSlotIndex || m.slotIndex === zoneSlotIndex + 1 ||
                 (m.isDualSlot && (m.slotIndex === zoneSlotIndex - 1));
        } else {
          // 싱글 가구는 1개 슬롯
          return m.slotIndex === zoneSlotIndex;
        }
      });
      
      if (hasSlotConflict) {
        console.log('❌ Slot conflict in zone:', zoneToUse, zoneSlotIndex);
        return false;
      }
      
      // 최종 위치 계산 - 영역별 위치 직접 계산
      let finalX: number;
      
      if (zoneToUse === 'dropped' && zoneInfo.dropped) {
        const droppedStartX = mmToThreeUnits(zoneInfo.dropped.startX);
        const droppedColumnWidth = mmToThreeUnits(zoneInfo.dropped.columnWidth);
        
        if (isDual && zoneSlotIndex < zoneInfo.dropped.columnCount - 1) {
          // 듀얼 가구: 두 슬롯의 중간점
          const leftSlotX = droppedStartX + (zoneSlotIndex * droppedColumnWidth) + (droppedColumnWidth / 2);
          const rightSlotX = droppedStartX + ((zoneSlotIndex + 1) * droppedColumnWidth) + (droppedColumnWidth / 2);
          finalX = (leftSlotX + rightSlotX) / 2;
        } else {
          // 싱글 가구: 해당 슬롯 위치
          finalX = droppedStartX + (zoneSlotIndex * droppedColumnWidth) + (droppedColumnWidth / 2);
        }
      } else {
        // 메인 영역
        const normalStartX = mmToThreeUnits(zoneInfo.normal.startX);
        const normalColumnWidth = mmToThreeUnits(zoneInfo.normal.columnWidth);
        
        if (isDual && zoneSlotIndex < zoneInfo.normal.columnCount - 1) {
          // 듀얼 가구: 두 슬롯의 중간점
          const leftSlotX = normalStartX + (zoneSlotIndex * normalColumnWidth) + (normalColumnWidth / 2);
          const rightSlotX = normalStartX + ((zoneSlotIndex + 1) * normalColumnWidth) + (normalColumnWidth / 2);
          finalX = (leftSlotX + rightSlotX) / 2;
        } else {
          // 싱글 가구: 해당 슬롯 위치
          finalX = normalStartX + (zoneSlotIndex * normalColumnWidth) + (normalColumnWidth / 2);
        }
      }
      
      
      // 고유 ID 생성 - 단내림 구간은 별도 ID 체계
      const placedId = zoneToUse === 'dropped' 
        ? `dropped-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        : `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 기본 깊이 설정
      const defaultDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);
      
      // 새 모듈 배치
      const newModule = {
        id: placedId,
        moduleId: moduleData.id, // 영역별로 조정된 모듈 ID 사용
        position: { x: finalX, y: 0, z: 0 },
        rotation: 0,
        hasDoor: false,
        customDepth: defaultDepth,
        slotIndex: zoneSlotIndex,  // 영역 내 인덱스 사용
        isDualSlot: isDual,
        isValidInCurrentSpace: true,
        adjustedWidth: moduleData.dimensions.width,
        hingePosition: 'right' as 'left' | 'right',
        zone: zoneToUse, // 영역 정보 저장
        customWidth: isDual ? Math.floor(zoneInternalSpace.width / zoneIndexing.columnCount) * 2 : Math.floor(zoneInternalSpace.width / zoneIndexing.columnCount), // 듀얼 가구는 2배 너비
        customHeight: zoneToUse === 'dropped' && zoneInternalSpace ? zoneInternalSpace.height : undefined // 단내림 구간의 줄어든 높이 저장
      };
      
      addModule(newModule);
      setCurrentDragData(null);
      
      // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
      window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
      return true;
    } else {
      console.log('🎯 단내림 비활성화 또는 zoneToUse 없음, 기존 로직 사용', {
        droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
        zoneToUse,
        activeZone,
        activeZoneParam
      });
      
      // 단내림이 활성화되어 있지만 activeZone이 설정되지 않은 경우 배치 차단
      if (spaceInfo.droppedCeiling?.enabled && !zoneToUse) {
        console.log('❌ Dropped ceiling enabled but no zone selected');
        return false;
      }
    }
    
    // 단내림이 없는 경우 기존 로직
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
    
    // 듀얼/싱글 가구 판별
    const isDual = isDualFurniture(dragData.moduleData.id, spaceInfo);
       
    // 슬롯 가용성 검사
    if (!isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, dragData.moduleData.id)) {
      return false;
    }
    
    // 분할창인 경우 spaceInfo 조정 - mainDoorCount 정보도 포함
    let adjustedSpaceInfo = spaceInfo;
    if (spaceInfo.mainDoorCount && spaceInfo.mainDoorCount > 0) {
      const defaultColumnCount = Math.max(1, Math.floor(internalSpace.width / 600));
      adjustedSpaceInfo = {
        ...spaceInfo,
        mainDoorCount: spaceInfo.mainDoorCount,  // mainDoorCount 유지
        customColumnCount: spaceInfo.mainDoorCount,
        columnMode: 'custom' as const
      };
      console.log('🎯 [SlotDropZones] 분할창 모듈 생성:', {
        mainDoorCount: spaceInfo.mainDoorCount,
        defaultColumnCount,
        internalWidth: internalSpace.width,
        adjustedSpaceInfo
      });
    }
    
    // 가구 데이터 조회 (조정된 spaceInfo 사용)
    const moduleData = getModuleById(dragData.moduleData.id, internalSpace, adjustedSpaceInfo);
    if (!moduleData) {
      return false;
    }
    
    // 최종 위치 계산
    let finalX = calculateFurniturePosition(slotIndex, dragData.moduleData.id, spaceInfo);
    if (finalX === null) {
      return false;
    }
    
    // 듀얼 가구 위치 디버깅
    if (isDual) {
      console.log('🎯 Dual furniture position debug:', {
        slotIndex,
        columnCount: indexing.columnCount,
        threeUnitDualPositions: indexing.threeUnitDualPositions,
        finalX,
        expectedPosition: indexing.threeUnitDualPositions?.[slotIndex]
      });
    }
    
    // 고유 ID 생성 - 단내림 구간은 별도 ID 체계
    const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 기본 깊이 설정
    const defaultDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);
    
    // 새 모듈 배치
    const newModule = {
      id: placedId,
      moduleId: dragData.moduleData.id,
      position: { x: finalX, y: 0, z: 0 },
      rotation: 0,
      hasDoor: false,
      customDepth: defaultDepth,
      slotIndex: slotIndex,
      isDualSlot: isDual,
      isValidInCurrentSpace: true,
      adjustedWidth: moduleData.dimensions.width,
      hingePosition: 'right' as 'left' | 'right',
      customWidth: isDual ? Math.floor(internalSpace.width / indexing.columnCount) * 2 : Math.floor(internalSpace.width / indexing.columnCount) // 듀얼 가구는 2배 너비
    };
    
    addModule(newModule);
    setCurrentDragData(null);
    
    // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
    window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
    
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
    showAlert,
    activeZone
  ]);
  
  // window 객체에 함수 노출 - activeZone을 클로저로 포함
  useEffect(() => {
    window.handleSlotDrop = (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => {
      // activeZone을 현재 상태값으로 직접 전달
      return handleSlotDrop(dragEvent, canvasElement, activeZone);
    };
    
    return () => {
      delete window.handleSlotDrop;
    };
  }, [handleSlotDrop, activeZone]);
  
  // 간단한 드래그오버 이벤트 핸들러
  useEffect(() => {
    if (!currentDragData) {
      return;
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
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
      
      if (slotIndex === null) {
        setHoveredSlotIndex(null);
        return;
      }

      // 단내림이 활성화된 경우 영역별 처리
      if (spaceInfo.droppedCeiling?.enabled && activeZone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
        // 레이캐스트로 받은 slotIndex는 이미 영역별 로컬 인덱스
        // 활성 영역과 맞는지만 확인
        const allColliders = scene.children
          .flatMap(child => child.children || [child])
          .filter(obj => obj.userData?.isSlotCollider);
        
        
        const colliderUserData = allColliders
          .find(obj => obj.userData?.slotIndex === slotIndex && obj.userData?.isSlotCollider)
          ?.userData;
        
        
        if (colliderUserData?.zone !== activeZone) {
          setHoveredSlotIndex(null);
          return;
        }
      }
      
      if (currentDragData) {
        const isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
        
        // 단내림 구간일 경우 영역별 가구 확인
        const isAvailable = (() => {
          if (spaceInfo.droppedCeiling?.enabled && activeZone) {
            // 단내림 구간: 동일 영역의 가구만 확인
            const zoneModules = placedModules.filter(m => m.zone === activeZone);
            const hasConflict = zoneModules.some(m => {
              if (isDual) {
                // 듀얼 가구는 2개 슬롯 차지
                return m.slotIndex === slotIndex || m.slotIndex === slotIndex + 1 ||
                       (m.isDualSlot && (m.slotIndex === slotIndex - 1));
              } else {
                // 싱글 가구는 1개 슬롯
                return m.slotIndex === slotIndex;
              }
            });
            return !hasConflict;
          } else {
            // 단내림이 없는 경우 기존 로직 사용
            return isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, currentDragData.moduleData.id);
          }
        })();
        
        if (isAvailable) {
          setHoveredSlotIndex(slotIndex);
        } else {
          setHoveredSlotIndex(null);
        }
      } else {
        setHoveredSlotIndex(slotIndex);
      }
    };

    const handleDragLeave = () => {
      setHoveredSlotIndex(null);
    };

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
  }, [currentDragData, camera, scene, spaceInfo, placedModules]);
  
  // 단내림 정보 가져오기
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
  const zoneSlotInfo = hasDroppedCeiling ? ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount) : null;
  
  // 영역별 슬롯 위치 계산
  const getZoneSlotPositions = () => {
    if (!hasDroppedCeiling || !zoneSlotInfo?.dropped || !activeZone) {
      console.log('🎯 getZoneSlotPositions - returning default positions:', {
        hasDroppedCeiling,
        hasDroppedInfo: !!zoneSlotInfo?.dropped,
        activeZone
      });
      return indexing.threeUnitPositions;
    }
    
    // 활성 영역에 따른 슬롯 위치 계산
    if (activeZone === 'normal') {
      const normalColumnCount = zoneSlotInfo.normal.columnCount;
      const normalStartX = mmToThreeUnits(zoneSlotInfo.normal.startX);
      const normalColumnWidth = mmToThreeUnits(zoneSlotInfo.normal.columnWidth);
      
      return Array.from({ length: normalColumnCount }, (_, i) => 
        normalStartX + (i * normalColumnWidth) + (normalColumnWidth / 2)
      );
    } else if (activeZone === 'dropped') {
      const droppedColumnCount = zoneSlotInfo.dropped.columnCount;
      const droppedStartX = mmToThreeUnits(zoneSlotInfo.dropped.startX);
      const droppedColumnWidth = mmToThreeUnits(zoneSlotInfo.dropped.columnWidth);
      
      console.log('🎯 getZoneSlotPositions - dropped zone:', {
        droppedColumnCount,
        droppedStartX,
        droppedColumnWidth
      });
      
      return Array.from({ length: droppedColumnCount }, (_, i) => 
        droppedStartX + (i * droppedColumnWidth) + (droppedColumnWidth / 2)
      );
    }
    
    return [];
  };
  
  const zoneSlotPositions = getZoneSlotPositions();
  
  return (
    <group>
      {/* 레이캐스팅용 투명 콜라이더들 */}
      {console.log('🎯 Rendering colliders:', {
        zoneSlotPositionsCount: zoneSlotPositions.length,
        activeZone,
        hasDroppedCeiling
      })}
      {zoneSlotPositions.map((slotX, slotIndex) => {
        // 앞쪽에서 20mm 줄이기
        const reducedDepth = slotDimensions.depth - mmToThreeUnits(20);
        const zOffset = -mmToThreeUnits(10); // 뒤쪽으로 10mm 이동 (앞쪽에서만 20mm 줄이기 위해)
        
        // 영역별 슬롯 너비 계산
        let slotWidth = slotDimensions.width;
        if (hasDroppedCeiling && activeZone && zoneSlotInfo) {
          const zoneColumnWidth = activeZone === 'dropped' && zoneSlotInfo.dropped
            ? zoneSlotInfo.dropped.columnWidth
            : zoneSlotInfo.normal.columnWidth;
          slotWidth = mmToThreeUnits(zoneColumnWidth) - 1;
        }
        
        return (
          <mesh
            key={`slot-collider-${slotIndex}`}
            position={[slotX, slotStartY + slotDimensions.height / 2, zOffset]}
            userData={{ 
              slotIndex,  // 영역 내 로컬 인덱스 (항상 0부터 시작)
              isSlotCollider: true,
              type: 'slot-collider',
              zone: activeZone,  // 영역 정보 추가
              globalSlotIndex: activeZone === 'dropped' && zoneSlotInfo?.dropped 
                ? slotIndex + zoneSlotInfo.normal.columnCount  // 단내림 영역은 메인 영역 이후 인덱스
                : slotIndex  // 메인 영역 또는 단내림 없는 경우
            }}
            visible={false}
          >
            <boxGeometry args={[slotWidth, slotDimensions.height, reducedDepth]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        );
      })}
      
      {/* 바닥 슬롯 시각화 - 가이드라인과 정확히 일치 */}
      {showAll && showDimensions && indexing.threeUnitBoundaries.length > 1 && (() => {
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
        
        // CSS 변수에서 실제 테마 색상 가져오기
        const getThemeColorFromCSS = () => {
          if (typeof window !== 'undefined') {
            const computedColor = getComputedStyle(document.documentElement)
              .getPropertyValue('--theme-primary').trim();
            return computedColor || '#10b981';
          }
          return '#10b981';
        };
        
        const primaryColor = getThemeColorFromCSS();
        
        if (hasDroppedCeiling && zoneSlotInfo.dropped) {
          // 단내림 활성화된 경우 activeZone에 따라 분리
          if (activeZone === 'normal') {
            // 메인구간: 메인 영역만 표시
            const leftX = mmToThreeUnits(zoneSlotInfo.normal.startX);
            const rightX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);
            const centerX = (leftX + rightX) / 2;
            const width = rightX - leftX;
            
            return (
              <mesh
                key="main-zone-floor"
                position={[centerX, floorY, slotFloorZ]}
              >
                <boxGeometry args={[width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth]} />
                <meshBasicMaterial 
                  color={primaryColor} 
                  transparent 
                  opacity={0.2} 
                />
              </mesh>
            );
          } else if (activeZone === 'dropped') {
            // 단내림 구간: 단내림 영역만 표시
            const leftX = mmToThreeUnits(zoneSlotInfo.dropped.startX);
            const rightX = mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width);
            const centerX = (leftX + rightX) / 2;
            const width = rightX - leftX;
            
            return (
              <mesh
                key="dropped-zone-floor"
                position={[centerX, floorY, slotFloorZ]}
              >
                <boxGeometry args={[width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth]} />
                <meshBasicMaterial 
                  color={primaryColor} 
                  transparent 
                  opacity={0.2} 
                />
              </mesh>
            );
          }
          // activeZone이 설정되지 않은 경우 아무것도 표시하지 않음
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
              <boxGeometry args={[width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth]} />
              <meshBasicMaterial 
                color={primaryColor} 
                transparent 
                opacity={0.2} 
              />
            </mesh>
          );
        }
        
        return null;
      })()}
      
      {/* 가구 미리보기 */}
      {console.log('🎯 Preview render check:', {
        hoveredSlotIndex,
        hasCurrentDragData: !!currentDragData,
        zoneSlotPositions: zoneSlotPositions.length,
        activeZone
      })}
      {hoveredSlotIndex !== null && currentDragData && zoneSlotPositions.map((slotX, slotIndex) => {
        // 현재 드래그 중인 가구가 듀얼인지 확인
        let isDual = false;
        if (currentDragData) {
          isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
        }
        
        // 고스트 렌더링 여부 결정
        let shouldRenderGhost = false;
        if (hoveredSlotIndex !== null && currentDragData) {
          if (isDual) {
            // 듀얼 가구: 첫 번째 슬롯에서만 고스트 렌더링
            shouldRenderGhost = slotIndex === hoveredSlotIndex;
          } else {
            // 싱글 가구: 현재 슬롯에서만 고스트 렌더링
            shouldRenderGhost = slotIndex === hoveredSlotIndex;
          }
        }
        
        if (!shouldRenderGhost || !currentDragData) return null;
        
        // 드래그 중인 가구의 모듈 데이터 가져오기
        let moduleData;
        
        // 단내림이 활성화되고 activeZone이 설정된 경우 영역별 모듈 생성
        let zoneInternalSpace = null; // 미리보기에서 사용할 변수 선언
        if (hasDroppedCeiling && activeZone && zoneSlotInfo) {
          // 영역별 spaceInfo 생성
          const zoneSpaceInfo = activeZone === 'dropped' && zoneSlotInfo.dropped
            ? {
                ...spaceInfo,
                width: zoneSlotInfo.dropped.width,
                customColumnCount: zoneSlotInfo.dropped.columnCount,
                columnMode: 'custom' as const,
                // 단내림 구간인 경우 높이 조정
                height: spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 200)
              }
            : {
                ...spaceInfo,
                width: zoneSlotInfo.normal.width,
                customColumnCount: zoneSlotInfo.normal.columnCount,
                columnMode: 'custom' as const
              };
              
          zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);
          moduleData = getModuleById(currentDragData.moduleData.id, zoneInternalSpace, zoneSpaceInfo);
        } else {
          moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
        }
        
        if (!moduleData) return null;
        
        // 미리보기 위치 계산 - 실제 배치와 동일한 로직 사용
        let previewX = slotX;
        if (isDual && slotIndex === hoveredSlotIndex) {
          // 듀얼 가구는 실제 배치 로직과 동일하게 계산
          if (hasDroppedCeiling && activeZone && zoneSlotInfo) {
            // 단내림 구간
            const zoneInfo = activeZone === 'dropped' && zoneSlotInfo.dropped 
              ? zoneSlotInfo.dropped 
              : zoneSlotInfo.normal;
            
            if (slotIndex < zoneInfo.columnCount - 1) {
              const leftSlotCenterMm = zoneInfo.startX + (slotIndex * zoneInfo.columnWidth) + (zoneInfo.columnWidth / 2);
              const rightSlotCenterMm = zoneInfo.startX + ((slotIndex + 1) * zoneInfo.columnWidth) + (zoneInfo.columnWidth / 2);
              const dualCenterMm = (leftSlotCenterMm + rightSlotCenterMm) / 2;
              previewX = mmToThreeUnits(dualCenterMm);
            }
          } else {
            // 일반 구간 - indexing의 threeUnitDualPositions 사용
            if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
              previewX = indexing.threeUnitDualPositions[slotIndex];
            }
          }
        }
        
        const customDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);
        // 단내림 구간의 경우 줄어든 높이 사용
        const furnitureHeightMm = activeZone === 'dropped' && zoneInternalSpace ? zoneInternalSpace.height : moduleData.dimensions.height;
        const furnitureHeight = furnitureHeightMm * 0.01;
        const furnitureY = slotStartY + furnitureHeight / 2;
        
        const doorThickness = mmToThreeUnits(20);
        const panelDepth = mmToThreeUnits(1500);
        const furnitureDepth = mmToThreeUnits(600);
        const zOffset = -panelDepth / 2;
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
        const previewDepth = mmToThreeUnits(customDepth);
        const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - previewDepth/2;
        
        return (
          <group key={`furniture-preview-${slotIndex}`} position={[previewX, furnitureY, furnitureZ]}>
            <BoxModule 
              moduleData={moduleData}
              color={theme.color}
              isDragging={true}
              internalHeight={furnitureHeightMm}
              hasDoor={false}
              customDepth={customDepth}
              spaceInfo={spaceInfo}
            />
          </group>
        );
      })}
    </group>
  );
};

export default SlotDropZonesSimple;