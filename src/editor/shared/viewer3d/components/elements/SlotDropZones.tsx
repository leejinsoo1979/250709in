import React, { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getModuleById, ModuleData } from '@/data/modules';
import BoxModule from '../modules/BoxModule';
import { 
  getSlotIndexFromMousePosition as getSlotIndexFromRaycast,
  isDualFurniture,
  calculateSlotDimensions,
  calculateSlotStartY,
  calculateFurniturePosition
} from '../../utils/slotRaycast';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';

interface SlotDropZonesProps {
  spaceInfo: SpaceInfo;
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZones: React.FC<SlotDropZonesProps> = ({ spaceInfo }) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  
  // Three.js 컨텍스트 접근
  const { camera, scene } = useThree();
  
  // 마우스가 hover 중인 슬롯 인덱스 상태
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  
  // 내경 공간 및 인덱싱 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  

  
  // 드롭 처리 함수
  const handleSlotDrop = React.useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
    if (!currentDragData) return false;
    
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
    
    // 듀얼/싱글 가구 판별
    const isDual = isDualFurniture(dragData.moduleData.id, spaceInfo);
       
    // 슬롯 가용성 검사 - 충돌 시 배치 실패
    if (!isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo)) {
      return false; // 충돌하는 슬롯에는 배치 불가
    }
    
    // 최종 위치 계산
    const finalX = calculateFurniturePosition(slotIndex, dragData.moduleData.id, spaceInfo);
    if (finalX === null) {
      return false;
    }
    
    // 고유 ID 생성
    const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 가구 데이터 조회하여 기본 깊이 계산
    const moduleData = getModuleById(dragData.moduleData.id, internalSpace, spaceInfo);
    
    // 기본 가구 깊이 계산 (가구별 defaultDepth 우선, 없으면 fallback)
    const getDefaultDepth = (moduleData: ModuleData | undefined) => {
      console.log('⚙️ [SlotDropZones] getDefaultDepth 계산:', {
        moduleId: moduleData?.id,
        moduleName: moduleData?.name,
        moduleDefaultDepth: moduleData?.defaultDepth,
        spaceDepth: spaceInfo.depth
      });
      
      if (moduleData?.defaultDepth) {
        const result = Math.min(moduleData.defaultDepth, spaceInfo.depth);
        console.log('✅ [SlotDropZones] defaultDepth 사용:', {
          moduleDefaultDepth: moduleData.defaultDepth,
          spaceDepth: spaceInfo.depth,
          finalResult: result
        });
        return result;
      }
      
      // 기존 fallback 로직
      const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
      const result = Math.min(spaceBasedDepth, 580);
      console.log('⚠️ [SlotDropZones] fallback 사용:', {
        spaceBasedDepth: spaceBasedDepth,
        fallbackLimit: 580,
        finalResult: result,
        reason: 'moduleData?.defaultDepth가 없음'
      });
      return result;
    };
    
    const customDepth = getDefaultDepth(moduleData);
    
    // 새 모듈 배치
    const newModule = {
      id: placedId,
      moduleId: dragData.moduleData.id,
      position: {
        x: finalX,
        y: 0,
        z: 0
      },
      rotation: 0,
      hasDoor: false, // 배치 시 항상 도어 없음 (오픈형)
      customDepth: customDepth, // 가구별 기본 깊이 설정
      slotIndex: slotIndex,
      isDualSlot: isDual,
      isValidInCurrentSpace: true
    };
    
    addModule(newModule);
    
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
    setCurrentDragData
  ]);
  
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
        const isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
        
        // 슬롯 가용성 검사 - 사용 불가능한 슬롯은 하이라이트하지 않음
        if (isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo)) {
          setHoveredSlotIndex(slotIndex);
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
  }, [currentDragData, camera, scene, spaceInfo, placedModules]);
  
  // 슬롯 크기 및 위치 계산
  const slotDimensions = calculateSlotDimensions(spaceInfo);
  const slotStartY = calculateSlotStartY(spaceInfo);
  
  return (
    <group>
      {/* 레이캐스팅용 투명 콜라이더들 */}
      {indexing.threeUnitPositions.map((slotX, slotIndex) => (
        <mesh
          key={`slot-collider-${slotIndex}`}
          position={[slotX, slotStartY + slotDimensions.height / 2, 0]}
          userData={{ 
            slotIndex, 
            isSlotCollider: true,
            type: 'slot-collider'
          }}
          visible={false}
        >
          <boxGeometry args={[slotDimensions.width, slotDimensions.height, slotDimensions.depth]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      ))}
      
      {/* 가구 미리보기 */}
      {indexing.threeUnitPositions.map((slotX, slotIndex) => {
        
        // 현재 드래그 중인 가구가 듀얼인지 확인
        let isDual = false;
        if (currentDragData) {
          isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
        }
        
        // 하이라이트 여부 결정
        let shouldHighlight = false;
        if (hoveredSlotIndex !== null && currentDragData) {
          if (isDual) {
            // 듀얼 가구: 현재 슬롯과 다음 슬롯 모두 하이라이트
            shouldHighlight = slotIndex === hoveredSlotIndex || slotIndex === hoveredSlotIndex + 1;
          } else {
            // 싱글 가구: 현재 슬롯만 하이라이트
            shouldHighlight = slotIndex === hoveredSlotIndex;
          }
        }
        
        if (!shouldHighlight || !currentDragData) return null;
        
        // 드래그 중인 가구의 모듈 데이터 가져오기
        const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
        if (!moduleData) return null;
        
        // 미리보기용 기본 깊이 계산 (배치 로직과 동일)
        const getPreviewDepth = (moduleData: ModuleData) => {
          if (moduleData?.defaultDepth) {
            return Math.min(moduleData.defaultDepth, spaceInfo.depth);
          }
          // 기존 fallback 로직
          const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
          return Math.min(spaceBasedDepth, 580);
        };
        
        const previewCustomDepth = getPreviewDepth(moduleData);
        
        // 가구 Y 위치 계산 (바닥에서 가구 높이의 절반만큼 위로)
        const furnitureHeight = moduleData.dimensions.height * 0.01; // mm to Three.js units
        const furnitureY = slotStartY + furnitureHeight / 2;
        
        // 듀얼 가구의 경우 중앙 위치 계산
        let furnitureX = slotX;
        if (isDual && hoveredSlotIndex !== null && slotIndex === hoveredSlotIndex) {
          // 첫 번째 슬롯에서만 렌더링하고, 두 슬롯의 중앙에 위치
          const nextSlotX = indexing.threeUnitPositions[slotIndex + 1];
          if (nextSlotX !== undefined) {
            furnitureX = (slotX + nextSlotX) / 2;
          }
        } else if (isDual && hoveredSlotIndex !== null && slotIndex === hoveredSlotIndex + 1) {
          // 두 번째 슬롯에서는 렌더링하지 않음 (중복 방지)
          return null;
        }
        
        // Z축 위치 계산 (FurnitureItem과 동일한 로직)
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        
        // 도어 두께 (20mm)
        const doorThicknessMm = 20;
        const doorThickness = mmToThreeUnits(doorThicknessMm);
        
        // Room.tsx와 동일한 Z축 위치 계산
        const panelDepthMm = 1500; // 전체 공간 깊이
        const furnitureDepthMm = 600; // 가구 공간 깊이
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        
        // Room.tsx와 동일한 계산: 뒷벽에서 600mm만 나오도록
        const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 뒷벽에서 600mm
        
        // 가구를 가구 공간의 뒷쪽에 배치 (프레임 앞면에서 도어 두께만큼 뒤)
        const previewDepth = mmToThreeUnits(previewCustomDepth);
        const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - previewDepth/2;
        
                  return (
            <group key={`furniture-preview-${slotIndex}`} position={[furnitureX, furnitureY, furnitureZ]}>
            <BoxModule 
              moduleData={moduleData}
              color="#88ff88" // 연한 파스텔 그린색
              isDragging={true} // 반투명 처리 (opacity: 0.4)
              internalHeight={moduleData.dimensions.height} // 모듈 자체 높이 사용
              hasDoor={false} // 고스트에는 도어 숨김
              customDepth={previewCustomDepth} // 기본 깊이 반영
              spaceInfo={spaceInfo}
            />
          </group>
        );
      })}
    </group>
  );
};

export default SlotDropZones;