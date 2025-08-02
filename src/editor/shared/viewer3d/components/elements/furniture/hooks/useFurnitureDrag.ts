import { useState, useRef, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { getSlotIndexFromMousePosition as getSlotIndexFromRaycast } from '../../../../utils/slotRaycast';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer } from '@/editor/shared/utils/indexing';

interface UseFurnitureDragProps {
  spaceInfo: SpaceInfo;
}

export const useFurnitureDrag = ({ spaceInfo }: UseFurnitureDragProps) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const moveModule = useFurnitureStore(state => state.moveModule);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { setFurnitureDragging } = useUIStore();
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [forceRender, setForceRender] = useState(0);
  const isDragging = useRef(false);
  
  // Three.js 컨텍스트 접근
  const { camera, scene, gl, invalidate } = useThree();
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 간단한 렌더링 업데이트 - 디바운스 적용
  const triggerRender = useCallback(() => {
    invalidate();
    // forceRender 상태 업데이트 제거 (불필요한 리렌더링 방지)
  }, [invalidate]);

  // 가구 충돌 감지 함수
  const detectFurnitureCollisions = useCallback((movingModuleId: string, newSlotIndex: number, targetSlotInfo: any) => {
    const movingModule = placedModules.find(m => m.id === movingModuleId);
    if (!movingModule) return [];

    const moduleData = getModuleById(movingModule.moduleId, internalSpace, spaceInfo);
    if (!moduleData) return [];

    const indexing = calculateSpaceIndexing(spaceInfo);
    const columnWidth = indexing.columnWidth;
    const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;

    // 이동하는 가구가 차지할 슬롯들 계산
    let occupiedSlots: number[] = [];
    if (isDualFurniture) {
      // 듀얼 가구는 2개 슬롯 차지
      occupiedSlots = [newSlotIndex, newSlotIndex + 1];
    } else {
      // 싱글 가구는 1개 슬롯 차지
      occupiedSlots = [newSlotIndex];
    }

    // 기둥이 있는 슬롯의 경우 기존 가구와 공존 가능하므로 충돌 감지 제외
    if (targetSlotInfo && targetSlotInfo.hasColumn) {
      console.log('🎯 기둥 슬롯 - 충돌 감지 제외');
      return [];
    }

    // 충돌하는 다른 가구들 찾기
    const collidingModules: string[] = [];
    placedModules.forEach(module => {
      if (module.id === movingModuleId) return; // 자기 자신 제외

      const moduleInfo = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleInfo) return;

      const isModuleDual = Math.abs(moduleInfo.dimensions.width - (columnWidth * 2)) < 50;
      
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
      }
    });

    return collidingModules;
  }, [placedModules, internalSpace, spaceInfo]);

  // 충돌한 가구들 제거
  const removeCollidingFurniture = useCallback((collidingModuleIds: string[]) => {
    collidingModuleIds.forEach(moduleId => {
      removeModule(moduleId);
    });
  }, [removeModule]);



  // 드래그 시작
  const handlePointerDown = (e: ThreeEvent<PointerEvent>, placedModuleId: string) => {
    if (import.meta.env.DEV) {
      console.log('🖱️ 드래그 시작:', placedModuleId, 'button:', e.button);
    }
    
    // 왼쪽 버튼이 아니면 드래그 시작하지 않음 (오른쪽 버튼은 OrbitControls 회전용)
    if (e.button !== 0) {
      if (import.meta.env.DEV) {
        console.log('❌ 왼쪽 버튼이 아님, 드래그 취소');
      }
      return;
    }
    
    e.stopPropagation();
    
    setDraggingModuleId(placedModuleId);
    isDragging.current = true;
    setFurnitureDragging(true); // 드래그 상태 설정
    
    // 가구 드래그 시작 이벤트 발생
    window.dispatchEvent(new CustomEvent('furniture-drag-start'));
    
    if (import.meta.env.DEV) {
      console.log('✅ 드래그 상태 설정 완료:', { draggingModuleId: placedModuleId, isDragging: isDragging.current });
    }
    
    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);
    
    // 드래그 시작 시 즉시 렌더링 업데이트
    triggerRender();
    
    // 포인터 캡처
    const target = e.target as Element & { setPointerCapture?: (pointerId: number) => void };
    if (target && target.setPointerCapture) {
      target.setPointerCapture(e.pointerId);
      if (import.meta.env.DEV) {
        console.log('📌 포인터 캡처 설정');
      }
    }
    
    document.body.style.cursor = 'grabbing';
  };

  // 드래그 중 처리
  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!isDragging.current || !draggingModuleId) return;

    // 공통 레이캐스팅 유틸리티 사용
    const canvas = event.nativeEvent.target as HTMLCanvasElement;
    let slotIndex = getSlotIndexFromRaycast(
      event.nativeEvent.clientX, 
      event.nativeEvent.clientY, 
      canvas,
      camera,
      scene,
      spaceInfo
    );
    
    if (slotIndex !== null) {
      // 현재 드래그 중인 모듈 정보 가져오기
      const currentModule = placedModules.find(m => m.id === draggingModuleId);
      if (!currentModule) return;
      
      // 단내림이 활성화된 경우 영역 체크
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        const indexing = calculateSpaceIndexing(spaceInfo);
        const targetX = indexing.threeUnitPositions[slotIndex];
        const targetXMm = targetX * 100; // Three.js to mm
        
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        if (zoneInfo.dropped) {
          const normalEndX = zoneInfo.normal.startX + zoneInfo.normal.width;
          const droppedEndX = zoneInfo.dropped.startX + zoneInfo.dropped.width;
          
          // 메인구간 가구가 단내림 구간으로 이동 차단
          if (currentModule.zone === 'normal' && targetXMm >= zoneInfo.dropped.startX && targetXMm <= droppedEndX) {
            console.log('❌ 메인구간 가구는 단내림 구간으로 이동 불가');
            return;
          }
          // 단내림구간 가구가 메인 구간으로 이동 차단
          else if (currentModule.zone === 'dropped' && targetXMm >= zoneInfo.normal.startX && targetXMm <= normalEndX) {
            console.log('❌ 단내림구간 가구는 메인 구간으로 이동 불가');
            return;
          }
        }
      }

      // 단내림이 활성화되고 zone 정보가 있는 경우 영역별 처리
      let moduleData;
      let indexing;
      let isDualFurniture;
      
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const targetZone = currentModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
        
        // 영역별 spaceInfo와 internalSpace 생성
        const zoneSpaceInfo = {
          ...spaceInfo,
          width: targetZone.width,
          customColumnCount: targetZone.columnCount,
          columnMode: 'custom' as const
        };
        const zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);
        
        moduleData = getModuleById(currentModule.moduleId, zoneInternalSpace, zoneSpaceInfo);
        if (!moduleData) return;
        
        indexing = calculateSpaceIndexing(zoneSpaceInfo);
        isDualFurniture = Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
      } else {
        // 단내림이 없는 경우 기존 로직
        moduleData = getModuleById(currentModule.moduleId, internalSpace, spaceInfo);
        if (!moduleData) return;
        
        indexing = calculateSpaceIndexing(spaceInfo);
        const columnWidth = indexing.columnWidth;
        isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
      }

      // 슬롯 가용성 검사 (자기 자신 제외)

      // 최종 위치 계산 - 영역별 처리
      let finalX: number;
      
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const targetZone = currentModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
        
        // 영역 내 슬롯 인덱스로 변환
        const globalIndexing = calculateSpaceIndexing(spaceInfo);
        const targetXMm = globalIndexing.threeUnitPositions[slotIndex] * 100; // Three.js to mm
        
        // 영역 내 로컬 슬롯 인덱스 계산
        let zoneSlotIndex;
        if (currentModule.zone === 'dropped' && zoneInfo.dropped) {
          zoneSlotIndex = Math.floor((targetXMm - zoneInfo.dropped.startX) / zoneInfo.dropped.columnWidth);
          
          if (isDualFurniture && zoneSlotIndex < targetZone.columnCount - 1) {
            // 듀얼 가구: 두 슬롯의 중간점
            const leftSlotX = targetZone.startX + (zoneSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2);
            const rightSlotX = targetZone.startX + ((zoneSlotIndex + 1) * targetZone.columnWidth) + (targetZone.columnWidth / 2);
            finalX = ((leftSlotX + rightSlotX) / 2) * 0.01; // mm to Three.js units
          } else {
            // 싱글 가구
            finalX = (targetZone.startX + (zoneSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2)) * 0.01;
          }
        } else {
          zoneSlotIndex = Math.floor((targetXMm - zoneInfo.normal.startX) / zoneInfo.normal.columnWidth);
          
          if (isDualFurniture && zoneSlotIndex < targetZone.columnCount - 1) {
            // 듀얼 가구: 두 슬롯의 중간점
            const leftSlotX = targetZone.startX + (zoneSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2);
            const rightSlotX = targetZone.startX + ((zoneSlotIndex + 1) * targetZone.columnWidth) + (targetZone.columnWidth / 2);
            finalX = ((leftSlotX + rightSlotX) / 2) * 0.01; // mm to Three.js units
          } else {
            // 싱글 가구
            finalX = (targetZone.startX + (zoneSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2)) * 0.01;
          }
        }
      } else {
        // 단내림이 없는 경우 기존 로직
        if (isDualFurniture) {
          if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
            finalX = indexing.threeUnitDualPositions[slotIndex];
          } else {
            return; // 듀얼 위치가 없으면 이동하지 않음
          }
        } else {
          finalX = indexing.threeUnitPositions[slotIndex];
        }
      }
      
      // 기둥 슬롯으로 이동 시 자동 크기 조정
      const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
      const targetSlotInfo = columnSlots[slotIndex];
      
      if (targetSlotInfo && targetSlotInfo.hasColumn) {
        // 기둥이 있는 슬롯으로 이동하는 경우
        if (isDualFurniture) {
          // 듀얼 가구는 기둥 슬롯에 배치 불가 - 이동 취소
          console.log('❌ 듀얼 가구는 기둥 슬롯에 배치 불가');
          return;
        }
        
        // 싱글 가구인 경우 사용 가능한 공간 확인
        const availableWidth = targetSlotInfo.adjustedWidth || targetSlotInfo.availableWidth;
        if (availableWidth < 150) {
          console.log('❌ 기둥 슬롯에 공간 부족:', availableWidth, 'mm');
          return;
        }
      }


      // 충돌 감지 및 충돌한 가구 제거 (기둥 슬롯 제외)
      const collidingModules = detectFurnitureCollisions(draggingModuleId, slotIndex, targetSlotInfo);
      if (collidingModules.length > 0) {
        removeCollidingFurniture(collidingModules);
      }

      // 새로운 슬롯의 기둥 정보 확인하여 customDepth와 adjustedWidth 계산
      let newCustomDepth: number | undefined = undefined;
      let newAdjustedWidth: number | undefined = undefined;
      let adjustedPosition = { x: finalX, y: currentModule.position.y, z: currentModule.position.z };
      
      if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
        const columnDepth = targetSlotInfo.column.depth;
        const isShallowColumn = columnDepth < 400;
        
        // 기둥 침범 방향에 따른 위치 조정
        if (targetSlotInfo.intrusionDirection) {
          // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
          const slotWidthM = indexing.columnWidth * 0.01;
          const originalSlotBounds = {
            left: finalX - slotWidthM / 2,
            right: finalX + slotWidthM / 2,
            center: finalX
          };
          
          const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
          
          // 위치 조정 (기둥을 피해서 배치)
          if (targetSlotInfo.intrusionDirection === 'from-left') {
            // 기둥이 왼쪽에서 침범: 가구를 오른쪽으로 밀어냄
            adjustedPosition.x = furnitureBounds.center;
            console.log('🔀 왼쪽 침범 - 위치 조정:', {
              originalX: finalX,
              adjustedX: adjustedPosition.x,
              bounds: furnitureBounds
            });
          } else if (targetSlotInfo.intrusionDirection === 'from-right') {
            // 기둥이 오른쪽에서 침범: 가구를 왼쪽으로 밀어냄
            adjustedPosition.x = furnitureBounds.center;
            console.log('🔁 오른쪽 침범 - 위치 조정:', {
              originalX: finalX,
              adjustedX: adjustedPosition.x,
              bounds: furnitureBounds
            });
          } else if (targetSlotInfo.intrusionDirection === 'center') {
            // 중앙 침범
            adjustedPosition.x = furnitureBounds.center;
            console.log('🟡 중앙 침범 - 위치 조정:', {
              originalX: finalX,
              adjustedX: adjustedPosition.x,
              bounds: furnitureBounds
            });
          }
          
          // 크기 조정
          newAdjustedWidth = furnitureBounds.renderWidth;
          
          // Column C (300mm) 특별 처리 - 깊이 조정
          if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
            newCustomDepth = 730 - columnDepth; // 430mm
            console.log('🟣 Column C 깊이 조정:', newCustomDepth, 'mm');
          }
        }
        
        // 기둥 A (150mm) 처리
        if (columnDepth <= 150 && !newAdjustedWidth) {
          // intrusionDirection이 없는 경우에도 크기 조정
          const slotWidthM = indexing.columnWidth * 0.01;
          const originalSlotBounds = {
            left: finalX - slotWidthM / 2,
            right: finalX + slotWidthM / 2,
            center: finalX
          };
          
          const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
          newAdjustedWidth = furnitureBounds.renderWidth;
          adjustedPosition.x = furnitureBounds.center;
          newCustomDepth = undefined;
          console.log('🟢 Column A 처리: 폭 조정만', {
            adjustedWidth: newAdjustedWidth,
            adjustedX: adjustedPosition.x
          });
        }
      }
      
      // 모듈 업데이트 - zone 정보 유지 및 moduleId 업데이트
      let updatedModuleId = currentModule.moduleId;
      
      // zone이 있고 moduleData가 dynamic인 경우 moduleId 재생성
      if (currentModule.zone && moduleData.isDynamic && indexing) {
        const moduleType = currentModule.moduleId.split('-').slice(0, -1).join('-');
        const targetWidth = isDualFurniture ? indexing.columnWidth * 2 : indexing.columnWidth;
        updatedModuleId = `${moduleType}-${targetWidth}`;
      }
      
      // zone이 있는 경우 zone 로컬 슬롯 인덱스 사용
      let finalSlotIndex = slotIndex;
      if (currentModule.zone && spaceInfo.droppedCeiling?.enabled) {
        const globalIndexing = calculateSpaceIndexing(spaceInfo);
        const targetXMm = globalIndexing.threeUnitPositions[slotIndex] * 100; // Three.js to mm
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
        if (currentModule.zone === 'dropped' && zoneInfo.dropped) {
          finalSlotIndex = Math.floor((targetXMm - zoneInfo.dropped.startX) / zoneInfo.dropped.columnWidth);
        } else if (currentModule.zone === 'normal') {
          finalSlotIndex = Math.floor((targetXMm - zoneInfo.normal.startX) / zoneInfo.normal.columnWidth);
        }
      }
      
      updatePlacedModule(draggingModuleId, {
        moduleId: updatedModuleId,
        position: adjustedPosition,
        customDepth: newCustomDepth,
        adjustedWidth: currentModule.zone && indexing ? (isDualFurniture ? indexing.columnWidth * 2 : indexing.columnWidth) : newAdjustedWidth,
        slotIndex: finalSlotIndex,
        zone: currentModule.zone, // zone 정보 유지
        customWidth: indexing ? indexing.columnWidth : currentModule.customWidth // zone의 columnWidth로 업데이트
      });
      invalidate();
      if (gl && gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
    }
  };

  // 드래그 종료
  const handlePointerUp = () => {
    if (isDragging.current) {
      if (import.meta.env.DEV) {
        console.log('🏁 드래그 종료');
      }
      
      isDragging.current = false;
      setDraggingModuleId(null);
      setFurniturePlacementMode(false);
      
      // 가구 드래그 종료 이벤트 발생
      window.dispatchEvent(new CustomEvent('furniture-drag-end'));
      
      // 드래그 종료 시 즉시 렌더링 업데이트
      triggerRender();
      
      // 드래그 종료 후 짧은 지연 후에 드래그 상태 해제 (자석 효과 방지)
      setTimeout(() => {
        setFurnitureDragging(false); // 드래그 상태 해제
        triggerRender(); // 드래그 상태 해제 후에도 렌더링 업데이트
      }, 100); // 100ms 지연
      
      // 3D 모드에서 그림자 강제 업데이트
      if (gl && gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
      
      document.body.style.cursor = 'default';
    }
  };

  return {
    draggingModuleId,
    isDragging: isDragging.current,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    forceRender // React 리렌더링 강제를 위한 state
  };
}; 