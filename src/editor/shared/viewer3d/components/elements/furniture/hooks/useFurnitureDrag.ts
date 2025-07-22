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

      if (import.meta.env.DEV) {
        console.log('📍 가구 이동:', { 
          slotIndex, 
          finalX, 
          currentX: currentModule.position.x,
          isDualFurniture 
        });
      }

      // 새로운 슬롯의 기둥 정보 확인하여 customDepth 계산
      const columnSlots = analyzeColumnSlots(spaceInfo);
      const targetSlotInfo = columnSlots[slotIndex];
      
      let newCustomDepth: number | undefined = undefined;
      
      if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
        // 기둥이 있는 슬롯: 깊이 조정
        const columnDepth = targetSlotInfo.column.depth;
        const isShallowColumn = columnDepth < 500;
        
        // 기둥C (300mm 깊이)의 특별 처리: 침범량이 150mm 미만이면 기둥A 방식 적용
        const isColumnC = columnDepth === 300;
        let shouldUseDeepColumnLogic = false;
        
        if (isColumnC) {
          // 기둥C의 슬롯 침범량 계산 (간단히 계산)
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotWidthM = indexing.columnWidth * 0.01;
          const slotCenterX = indexing.threeUnitPositions[slotIndex];
          const slotLeftX = slotCenterX - slotWidthM / 2;
          const slotRightX = slotCenterX + slotWidthM / 2;
          
          const columnWidthM = targetSlotInfo.column.width * 0.01;
          const columnLeftX = targetSlotInfo.column.position[0] - columnWidthM / 2;
          const columnRightX = targetSlotInfo.column.position[0] + columnWidthM / 2;
          
          // 기둥이 슬롯 끝에서 안쪽으로 얼마나 들어왔는지 계산 (mm 단위)
          let intrusionFromEdge = 0;
          
          // 기둥이 왼쪽 끝에서 침범한 경우
          if (columnLeftX < slotLeftX && columnRightX > slotLeftX) {
            intrusionFromEdge = (columnRightX - slotLeftX) * 1000;
          }
          // 기둥이 오른쪽 끝에서 침범한 경우  
          else if (columnLeftX < slotRightX && columnRightX > slotRightX) {
            intrusionFromEdge = (slotRightX - columnLeftX) * 1000;
          }
          // 기둥이 슬롯을 완전히 덮는 경우
          else if (columnLeftX <= slotLeftX && columnRightX >= slotRightX) {
            intrusionFromEdge = (slotRightX - slotLeftX) * 1000; // 전체 슬롯 폭
          }
          
          // 슬롯 끝에서 150mm 미만 침범이면 기둥A 방식 사용
          shouldUseDeepColumnLogic = intrusionFromEdge < 150;
          
          console.log('🔧 드래그: 기둥C 침범량 분석:', {
            slotIndex,
            intrusionFromEdge: intrusionFromEdge.toFixed(1) + 'mm',
            useDeepLogic: shouldUseDeepColumnLogic,
            appliedMethod: shouldUseDeepColumnLogic ? '기둥A 방식 (폭 조정)' : '기둥C 방식 (깊이 조정)'
          });
        }
        
        if (isShallowColumn && !shouldUseDeepColumnLogic) {
          // 얕은 기둥 (기둥C 깊은 침범 포함): 슬롯 깊이에서 기둥 깊이 빼기
          const slotDepth = 730;
          const adjustedDepth = slotDepth - columnDepth;
          
          if (adjustedDepth >= 200) {
            newCustomDepth = adjustedDepth;
            console.log('🔧 드래그 이동: 얕은 기둥 있는 슬롯으로 이동, 깊이 조정:', {
              slotIndex: slotIndex,
              columnDepth: columnDepth,
              adjustedDepth: adjustedDepth
            });
          }
        } else {
          // 깊은 기둥 또는 기둥C 얕은 침범: 기둥A 방식 적용
          const standardCabinetDepth = 600;
          const availableDepth = standardCabinetDepth - columnDepth;
          newCustomDepth = Math.max(200, availableDepth);
          
          const logicType = shouldUseDeepColumnLogic ? '기둥C 얕은 침범 (기둥A 방식)' : '깊은 기둥';
          console.log(`🔧 드래그 이동: ${logicType} 있는 슬롯으로 이동, 깊이 조정:`, {
            slotIndex: slotIndex,
            columnDepth: columnDepth,
            adjustedDepth: newCustomDepth
          });
        }
      } else {
        // 기둥이 없는 슬롯: customDepth 제거 (undefined로 설정)
        newCustomDepth = undefined;
        console.log('🔧 드래그 이동: 기둥 없는 슬롯으로 이동, 깊이 복원:', {
          slotIndex: slotIndex,
          hasColumn: false,
          customDepthCleared: true
        });
      }

      // 모듈 위치 및 깊이 업데이트
      updatePlacedModule(draggingModuleId, {
        position: {
          x: finalX,
          y: currentModule.position.y,
          z: currentModule.position.z
        },
        customDepth: newCustomDepth,
        slotIndex: slotIndex
      });

      // 위치 변경 후 렌더링 업데이트 및 그림자 업데이트
      invalidate();
      
      // 3D 모드에서 그림자 강제 업데이트
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