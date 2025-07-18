import { useState, useRef, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useFurnitureStore } from '@/store';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { getSlotIndexFromMousePosition as getSlotIndexFromRaycast } from '../../../../utils/slotRaycast';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';

interface UseFurnitureDragProps {
  spaceInfo: SpaceInfo;
}

export const useFurnitureDrag = ({ spaceInfo }: UseFurnitureDragProps) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const moveModule = useFurnitureStore(state => state.moveModule);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [forceRender, setForceRender] = useState(0);
  const isDragging = useRef(false);
  
  // Three.js 컨텍스트 접근
  const { camera, scene, gl, invalidate } = useThree();
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 강제 렌더링 함수
  const triggerRender = useCallback(() => {
    console.log('🔄 강제 렌더링 트리거');
    
    // React 리렌더링
    setForceRender(prev => prev + 1);
    
    // Three.js 렌더링
    invalidate();
    
    // 그림자 맵 업데이트
    if (gl && gl.shadowMap) {
      gl.shadowMap.needsUpdate = true;
    }
    
    // 씬 전체 업데이트
    scene.traverse((object) => {
      if (object.type === 'Mesh') {
        object.frustumCulled = false;
      }
    });
    
    // 다음 프레임에서도 렌더링
    requestAnimationFrame(() => {
      invalidate();
      setTimeout(() => {
        invalidate();
        console.log('✅ 강제 렌더링 완료');
      }, 50);
    });
  }, [invalidate, gl, scene, setForceRender]);



  // 드래그 시작
  const handlePointerDown = (e: ThreeEvent<PointerEvent>, placedModuleId: string) => {
    console.log('🖱️ 드래그 시작:', placedModuleId, 'button:', e.button);
    
    // 왼쪽 버튼이 아니면 드래그 시작하지 않음 (오른쪽 버튼은 OrbitControls 회전용)
    if (e.button !== 0) {
      console.log('❌ 왼쪽 버튼이 아님, 드래그 취소');
      return;
    }
    
    e.stopPropagation();
    
    setDraggingModuleId(placedModuleId);
    isDragging.current = true;
    
    console.log('✅ 드래그 상태 설정 완료:', { draggingModuleId: placedModuleId, isDragging: isDragging.current });
    
    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);
    
    // 포인터 캡처
    const target = e.target as Element & { setPointerCapture?: (pointerId: number) => void };
    if (target && target.setPointerCapture) {
      target.setPointerCapture(e.pointerId);
      console.log('📌 포인터 캡처 설정');
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
    
    console.log('🎯 드래그 중 레이캐스팅:', { 
      mouseX: event.nativeEvent.clientX, 
      mouseY: event.nativeEvent.clientY, 
      detectedSlot: slotIndex 
    });
    
    if (slotIndex !== null) {
      console.log('✅ 슬롯 감지됨:', slotIndex);
      
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
      if (!isSlotAvailable(slotIndex, isDualFurniture, placedModules, spaceInfo, currentModule.moduleId, draggingModuleId)) {
        // 오른쪽으로 빈 슬롯 찾기
        let availableSlot = findNextAvailableSlot(slotIndex, 'right', isDualFurniture, placedModules, spaceInfo, currentModule.moduleId, draggingModuleId);
        
        // 오른쪽에 없으면 왼쪽으로 찾기
        if (availableSlot === null) {
          availableSlot = findNextAvailableSlot(slotIndex, 'left', isDualFurniture, placedModules, spaceInfo, currentModule.moduleId, draggingModuleId);
        }
        
        if (availableSlot !== null) {
          slotIndex = availableSlot;
        } else {
          return; // 배치 불가능
        }
      }

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

      console.log('📍 가구 이동:', { 
        slotIndex, 
        finalX, 
        currentX: currentModule.position.x,
        isDualFurniture 
      });

      // 모듈 위치 업데이트
      moveModule(draggingModuleId, {
        x: finalX,
        y: currentModule.position.y,
        z: currentModule.position.z
      });

      // 즉시 렌더링 강제 업데이트
      triggerRender();
    } else {
      console.log('❌ 슬롯 감지 실패');
    }
  };

  // 드래그 종료
  const handlePointerUp = () => {
    if (isDragging.current) {
      console.log('🏁 드래그 종료 - 렌더링 강제 업데이트');
      
      isDragging.current = false;
      setDraggingModuleId(null);
      setFurniturePlacementMode(false);
      
      // 그림자 맵 업데이트
      if (gl && gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
      
      // 즉시 렌더링 강제 업데이트
      triggerRender();
      
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