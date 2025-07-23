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
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';

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

  // 간단한 렌더링 업데이트
  const triggerRender = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('🔄 렌더링 업데이트');
    }
    invalidate();
    setForceRender(prev => prev + 1);
  }, [invalidate, setForceRender]);

  // 가구 충돌 감지 함수
  const detectFurnitureCollisions = useCallback((movingModuleId: string, newSlotIndex: number) => {
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
        if (import.meta.env.DEV) {
          console.log('🚨 충돌 감지:', {
            movingModule: movingModuleId,
            collidingModule: module.id,
            movingSlots: occupiedSlots,
            existingSlots: moduleSlots
          });
        }
      }
    });

    return collidingModules;
  }, [placedModules, internalSpace, spaceInfo]);

  // 충돌한 가구들 제거
  const removeCollidingFurniture = useCallback((collidingModuleIds: string[]) => {
    collidingModuleIds.forEach(moduleId => {
      if (import.meta.env.DEV) {
        console.log('🗑️ 충돌한 가구 제거:', moduleId);
      }
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
    
    if (import.meta.env.DEV) {
      console.log('✅ 드래그 상태 설정 완료:', { draggingModuleId: placedModuleId, isDragging: isDragging.current });
    }
    
    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);
    
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
    
    if (import.meta.env.DEV) {
      console.log('🎯 드래그 중 레이캐스팅:', { 
        mouseX: event.nativeEvent.clientX, 
        mouseY: event.nativeEvent.clientY, 
        detectedSlot: slotIndex 
      });
    }
    
    if (slotIndex !== null) {
      if (import.meta.env.DEV) {
        console.log('✅ 슬롯 감지됨:', slotIndex);
      }
      
      // 현재 드래그 중인 모듈 정보 가져오기
      const currentModule = placedModules.find(m => m.id === draggingModuleId);
      if (!currentModule) return;

      const moduleData = getModuleById(currentModule.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;

      // 듀얼/싱글 가구 판별
      const indexing = calculateSpaceIndexing(spaceInfo);
      const columnWidth = indexing.columnWidth;
      const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;

      // 슬롯 가용성 검사 (자기 자신 제외)

      // 최종 위치 계산
      let finalX: number;
      if (isDualFurniture) {
        if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
          finalX = indexing.threeUnitDualPositions[slotIndex];
        } else {
          return; // 듀얼 위치가 없으면 이동하지 않음
        }
      } else {
        finalX = indexing.threeUnitPositions[slotIndex];
      }

      if (import.meta.env.DEV) {
        console.log('📍 가구 이동:', { 
          slotIndex, 
          finalX, 
          currentX: currentModule.position.x,
          isDualFurniture 
        });
      }

      // 충돌 감지 및 충돌한 가구 제거
      const collidingModules = detectFurnitureCollisions(draggingModuleId, slotIndex);
      if (collidingModules.length > 0) {
        removeCollidingFurniture(collidingModules);
        if (import.meta.env.DEV) {
          console.log('🗑️ 총 ' + collidingModules.length + '개 가구 제거됨');
        }
      }

      // 새로운 슬롯의 기둥 정보 확인하여 customDepth 계산
      const columnSlots = analyzeColumnSlots(spaceInfo);
      const targetSlotInfo = columnSlots[slotIndex];
      
      let newCustomDepth: number | undefined = undefined;
      let newAdjustedWidth: number | undefined = undefined;
      let intrusionFromEdge = 0;
      if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
        const columnDepth = targetSlotInfo.column.depth;
        const isShallowColumn = columnDepth < 400;
        if (isShallowColumn) {
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotWidthM = indexing.columnWidth * 0.01;
          const slotCenterX = indexing.threeUnitPositions[slotIndex];
          const columnCenterX = targetSlotInfo.column.position[0];
          const slotHalfWidth = slotWidthM / 2;
          const columnHalfWidth = (targetSlotInfo.column.width ?? 0) / 2000; // mm->m->half
          const maxAllowedDistance = slotHalfWidth - columnHalfWidth;
          const distanceFromCenter = Math.abs(columnCenterX - slotCenterX);
          intrusionFromEdge = Math.max(0, distanceFromCenter * 1000 - maxAllowedDistance * 1000); // mm

          if (intrusionFromEdge <= 150) {
            // 한쪽 침범: 폭만 줄임, 깊이는 원래대로
            newCustomDepth = undefined;
            updatePlacedModule(draggingModuleId, {
              position: { x: finalX, y: currentModule.position.y, z: currentModule.position.z },
              customDepth: newCustomDepth,
              slotIndex: slotIndex
            });
          } else {
            // 중심 침범: 깊이만 줄임, 폭은 원래대로
            const slotDepth = 730;
            const adjustedDepth = slotDepth - columnDepth;
            if (adjustedDepth >= 200) {
              newCustomDepth = adjustedDepth;
              updatePlacedModule(draggingModuleId, {
                position: { x: finalX, y: currentModule.position.y, z: currentModule.position.z },
                customDepth: newCustomDepth,
                slotIndex: slotIndex
              });
            }
          }
        }
      } else {
        // 기둥 없는 슬롯: 원래대로
        updatePlacedModule(draggingModuleId, {
          position: { x: finalX, y: currentModule.position.y, z: currentModule.position.z },
          customDepth: undefined,
          slotIndex: slotIndex
        });
      }
      invalidate();
      if (gl && gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
    } else {
      if (import.meta.env.DEV) {
        console.log('❌ 슬롯 감지 실패');
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
      
      // 드래그 종료 후 짧은 지연 후에 드래그 상태 해제 (자석 효과 방지)
      setTimeout(() => {
        setFurnitureDragging(false); // 드래그 상태 해제
      }, 100); // 100ms 지연
      
      // 드래그 종료 시 그림자 업데이트
      invalidate();
      
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