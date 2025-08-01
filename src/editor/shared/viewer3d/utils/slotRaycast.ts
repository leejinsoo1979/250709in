import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from './geometry';
import { getModuleById } from '@/data/modules';

/**
 * 3D 레이캐스팅을 사용하여 마우스 위치에서 슬롯 인덱스를 감지하는 공통 유틸리티
 */
export const getSlotIndexFromMousePosition = (
  clientX: number,
  clientY: number,
  canvasElement: HTMLCanvasElement,
  camera: THREE.Camera,
  scene: THREE.Scene,
  spaceInfo: SpaceInfo
): number | null => {
  try {
    // 캔버스 경계 정보
    const rect = canvasElement.getBoundingClientRect();
    
    // 마우스 좌표를 정규화된 좌표(-1 to 1)로 변환
    const mouse = new THREE.Vector2();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    // 레이캐스터 생성
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // 씬에서 슬롯 콜라이더들 찾기
    const slotColliders: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.userData?.type === 'slot-collider') {
        slotColliders.push(child);
      }
    });
    
    // 슬롯 콜라이더들과 교차점 검사
    const intersects = raycaster.intersectObjects(slotColliders);
    
    if (intersects.length > 0) {
      // 가장 가까운 교차점의 슬롯 인덱스 반환
      const intersectedObject = intersects[0].object;
      
      // globalSlotIndex가 있으면 우선 사용 (단내림 영역 지원)
      const slotIndex = intersectedObject.userData?.globalSlotIndex ?? intersectedObject.userData?.slotIndex;
      
      // 유효한 슬롯 인덱스인지 확인
      const indexing = calculateSpaceIndexing(spaceInfo);
      if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < indexing.columnCount) {
        return slotIndex;
      }
    }
    
    return null;
    
  } catch (error) {
    console.error('Slot raycast detection error:', error);
    return null;
  }
};

/**
 * 가구가 듀얼 가구인지 판별하는 유틸리티
 */
export const isDualFurniture = (moduleId: string, spaceInfo: SpaceInfo): boolean => {
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  const moduleData = getModuleById(moduleId, internalSpace, spaceInfo);
  
  if (!moduleData) return false;
  
  return Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
};

/**
 * 슬롯 크기를 계산하는 유틸리티
 */
export const calculateSlotDimensions = (spaceInfo: SpaceInfo) => {
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  return {
    width: mmToThreeUnits(indexing.columnWidth) - 1,
    height: mmToThreeUnits(internalSpace.height),
    depth: mmToThreeUnits(internalSpace.depth) + 1
  };
};

/**
 * 슬롯 시작 Y 위치를 계산하는 유틸리티
 */
export const calculateSlotStartY = (spaceInfo: SpaceInfo): number => {
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
  
  if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
    return mmToThreeUnits(floorFinishHeightMm + baseFrameHeightMm);
  } else if (spaceInfo.baseConfig.type === 'stand') {
    if (spaceInfo.baseConfig.placementType === 'float') {
      const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
      return mmToThreeUnits(floorFinishHeightMm + floatHeightMm);
    } else {
      return mmToThreeUnits(floorFinishHeightMm);
    }
  } else {
    return mmToThreeUnits(floorFinishHeightMm);
  }
};

/**
 * 가구 배치를 위한 최종 X 위치를 계산하는 유틸리티
 */
export const calculateFurniturePosition = (
  slotIndex: number,
  moduleId: string,
  spaceInfo: SpaceInfo,
  zone?: 'normal' | 'dropped'
): number | null => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const isDual = isDualFurniture(moduleId, spaceInfo);
  
  // 단내림이 활성화되고 영역이 지정된 경우
  if (spaceInfo.droppedCeiling?.enabled && zone && indexing.zones) {
    const zoneInfo = zone === 'normal' ? indexing.zones.normal : indexing.zones.dropped;
    if (!zoneInfo) return null;
    
    const mmToThreeUnits = (mm: number) => mm * 0.01;
    
    if (isDual && slotIndex < zoneInfo.columnCount - 1) {
      // 듀얼 가구: 두 슬롯의 중앙
      const leftSlotCenterMm = zoneInfo.startX + (slotIndex * zoneInfo.columnWidth) + (zoneInfo.columnWidth / 2);
      const rightSlotCenterMm = zoneInfo.startX + ((slotIndex + 1) * zoneInfo.columnWidth) + (zoneInfo.columnWidth / 2);
      const dualCenterMm = (leftSlotCenterMm + rightSlotCenterMm) / 2;
      return mmToThreeUnits(dualCenterMm);
    } else {
      // 싱글 가구: 해당 슬롯의 중앙
      const slotCenterMm = zoneInfo.startX + (slotIndex * zoneInfo.columnWidth) + (zoneInfo.columnWidth / 2);
      return mmToThreeUnits(slotCenterMm);
    }
  }
  
  // 단내림이 없는 경우 기존 로직 사용
  if (isDual) {
    // 듀얼 가구: 듀얼 위치 배열 사용
    if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
      return indexing.threeUnitDualPositions[slotIndex];
    } else {
      console.error('Dual position not available for slot:', slotIndex);
      return null;
    }
  } else {
    // 싱글 가구: 일반 위치 배열 사용
    return indexing.threeUnitPositions[slotIndex];
  }
}; 