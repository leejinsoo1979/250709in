import React, { useEffect, useState, useCallback } from 'react';
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
import { useSpace3DView } from '../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlert } from '@/contexts/AlertContext';

interface SlotDropZonesSimpleProps {
  spaceInfo: SpaceInfo;
  showAll?: boolean;
  showDimensions?: boolean;
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZonesSimple: React.FC<SlotDropZonesSimpleProps> = ({ spaceInfo, showAll = true, showDimensions = true }) => {
  if (!spaceInfo) return null;
  
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const { showAlert } = useAlert();
  
  // Three.js 컨텍스트 접근
  const { camera, scene } = useThree();
  const { viewMode } = useSpace3DView();
  
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
  const handleSlotDrop = useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
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
    
    // needsWarning 확인
    if (dragData.moduleData?.needsWarning) {
      showAlert('배치슬롯의 사이즈를 늘려주세요', { title: '배치 불가' });
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
       
    // 슬롯 가용성 검사
    if (!isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, dragData.moduleData.id)) {
      return false;
    }
    
    // 가구 데이터 조회
    const moduleData = getModuleById(dragData.moduleData.id, internalSpace, spaceInfo);
    if (!moduleData) {
      return false;
    }
    
    // 최종 위치 계산
    let finalX = calculateFurniturePosition(slotIndex, dragData.moduleData.id, spaceInfo);
    if (finalX === null) {
      return false;
    }
    
    // 고유 ID 생성
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
      hingePosition: 'right' as 'left' | 'right'
    };
    
    addModule(newModule);
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
    showAlert
  ]);
  
  // window 객체에 함수 노출
  useEffect(() => {
    window.handleSlotDrop = handleSlotDrop;
    
    return () => {
      delete window.handleSlotDrop;
    };
  }, [handleSlotDrop]);
  
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
      
      if (slotIndex !== null && currentDragData) {
        const isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
        
        if (isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, currentDragData.moduleData.id)) {
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
  
  return (
    <group>
      {/* 레이캐스팅용 투명 콜라이더들 */}
      {indexing.threeUnitPositions.map((slotX, slotIndex) => {
        // 앞쪽에서 20mm 줄이기
        const reducedDepth = slotDimensions.depth - mmToThreeUnits(20);
        const zOffset = -mmToThreeUnits(10); // 뒤쪽으로 10mm 이동 (앞쪽에서만 20mm 줄이기 위해)
        
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
      })}
      
      {/* 바닥 슬롯 시각화 - 가이드라인과 정확히 일치 */}
      {showAll && showDimensions && indexing.threeUnitBoundaries.length > 1 && (() => {
        // ColumnGuides와 완전히 동일한 계산 사용
        const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
        const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
        
        // ColumnGuides와 동일한 Y 좌표 계산
        const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
        
        // ColumnGuides와 동일한 Z 좌표 계산
        const frontZ = mmToThreeUnits(internalSpace.depth / 2);
        const backZ = -frontZ;
        
        // 가이드라인과 동일한 X 좌표
        const leftX = indexing.threeUnitBoundaries[0];
        const rightX = indexing.threeUnitBoundaries[indexing.threeUnitBoundaries.length - 1];
        const centerX = (leftX + rightX) / 2;
        const width = rightX - leftX;
        
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
        
        return (
          <mesh
            position={[centerX, floorY, backZ + mmToThreeUnits(350)]} // 중심을 backZ + 350mm로 이동
          >
            <boxGeometry args={[width, 0.001, mmToThreeUnits(700)]} />
            <meshBasicMaterial 
              color={primaryColor} 
              transparent 
              opacity={0.2} 
            />
          </mesh>
        );
      })()}
      
      {/* 가구 미리보기 */}
      {hoveredSlotIndex !== null && currentDragData && indexing.threeUnitPositions.map((slotX, slotIndex) => {
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
        let moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
        if (!moduleData) return null;
        
        // 미리보기 위치 계산
        const previewX = isDual && slotIndex === hoveredSlotIndex 
          ? (indexing.threeUnitPositions[hoveredSlotIndex] + indexing.threeUnitPositions[hoveredSlotIndex + 1]) / 2
          : slotX;
        
        const customDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);
        const furnitureHeight = moduleData.dimensions.height * 0.01;
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
              internalHeight={moduleData.dimensions.height}
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