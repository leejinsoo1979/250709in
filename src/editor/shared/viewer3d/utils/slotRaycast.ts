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
  spaceInfo: SpaceInfo,
  activeZone?: 'normal' | 'dropped'
): number | null => {
  try {
    // 캔버스 경계 정보
    const rect = canvasElement.getBoundingClientRect();
    
    // 마우스 좌표를 정규화된 좌표(-1 to 1)로 변환
    const mouse = new THREE.Vector2();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    console.log('🎯 [slotRaycast] Starting raycast detection:', {
      clientX,
      clientY,
      normalizedMouse: { x: mouse.x, y: mouse.y },
      activeZone,
      droppedCeilingEnabled: spaceInfo?.droppedCeiling?.enabled
    });
    
    // 레이캐스터 생성
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // 씬에서 슬롯 콜라이더들 찾기 - activeZone이 있으면 해당 zone의 콜라이더만 선택
    const slotColliders: THREE.Object3D[] = [];
    let totalSceneObjects = 0;
    let objectsWithUserData = 0;
    let droppedZoneColliders = 0;
    let normalZoneColliders = 0;
    
    scene.traverse((child) => {
      totalSceneObjects++;
      if (child.userData) {
        objectsWithUserData++;
        // 디버깅: userData 내용 확인
        if (child.userData.isSlotCollider || child.userData.type === 'slot-collider') {
          console.log('🔍 Found slot collider candidate:', {
            name: child.name,
            userData: child.userData,
            type: child.type,
            visible: child.visible,
            position: child.position,
            parent: child.parent?.name
          });
        }
      }
      
      if (child.userData?.type === 'slot-collider' || child.userData?.isSlotCollider) {
        // Count colliders by zone
        if (child.userData?.zone === 'dropped') {
          droppedZoneColliders++;
        } else if (child.userData?.zone === 'normal') {
          normalZoneColliders++;
        }
        
        // activeZone이 지정된 경우 해당 zone의 콜라이더만 선택
        if (activeZone && child.userData?.zone !== activeZone) {
          console.log('⏭️ Skipping collider due to zone mismatch:', {
            colliderZone: child.userData?.zone,
            activeZone,
            name: child.name,
            slotIndex: child.userData?.slotIndex
          });
          return;
        }
        slotColliders.push(child);
        console.log('✅ Added collider to list:', {
          name: child.name,
          zone: child.userData?.zone,
          slotIndex: child.userData?.slotIndex,
          position: child.position
        });
      }
    });
    
    console.log('🎯 Slot collider search result:', {
      totalSceneObjects,
      objectsWithUserData,
      slotCollidersFound: slotColliders.length,
      droppedZoneColliders,
      normalZoneColliders,
      activeZone,
      selectedColliders: slotColliders.map(c => ({
        name: c.name,
        zone: c.userData?.zone,
        slotIndex: c.userData?.slotIndex
      }))
    });
    
    // 슬롯 콜라이더들과 교차점 검사
    console.log('🔍 Attempting raycast with:', {
      numColliders: slotColliders.length,
      mouse,
      cameraPosition: camera.position
    });
    
    // Calculate ray and world position for debugging
    const ray = raycaster.ray;
    const rayOrigin = ray.origin;
    const rayDirection = ray.direction;
    
    console.log('🎯 Ray details:', {
      origin: { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z },
      direction: { x: rayDirection.x, y: rayDirection.y, z: rayDirection.z },
      cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    });
    
    const intersects = raycaster.intersectObjects(slotColliders, false); // false = don't check children
    
    console.log('📊 Raycast results:', {
      numIntersections: intersects.length,
      intersections: intersects.map(i => ({
        object: i.object.name,
        distance: i.distance,
        point: i.point,
        userData: i.object.userData,
        zone: i.object.userData?.zone,
        slotIndex: i.object.userData?.slotIndex
      }))
    });
    
    if (intersects.length > 0) {
      // 가장 가까운 교차점의 슬롯 인덱스 반환
      const intersectedObject = intersects[0].object;
      
      // 단내림 구간의 경우 zone 내부의 로컬 인덱스를 반환
      const slotIndex = intersectedObject.userData?.slotIndex;
      
      // 유효한 슬롯 인덱스인지 확인
      if (typeof slotIndex === 'number' && slotIndex >= 0) {
        console.log('🎯 Raycast found slot:', {
          slotIndex,
          zone: intersectedObject.userData?.zone,
          activeZone,
          objectName: intersectedObject.name
        });
        return slotIndex;
      } else {
        console.log('⚠️ Invalid slot index:', {
          slotIndex,
          userData: intersectedObject.userData
        });
      }
    } else {
      console.log('❌ No intersections found with colliders');
    }
    
    return null;
    
  } catch (error) {
    console.error('Slot raycast detection error:', error);
    return null;
  }
};

/**
 * 마우스 위치에서 슬롯 인덱스와 소속 영역(zone)을 함께 감지
 * - activeZone을 지정하지 않으면 모든 영역의 콜라이더를 대상으로 탐색
 */
export const getSlotIndexAndZoneFromMousePosition = (
  clientX: number,
  clientY: number,
  canvasElement: HTMLCanvasElement,
  camera: THREE.Camera,
  scene: THREE.Scene,
  spaceInfo: SpaceInfo,
  activeZone?: 'normal' | 'dropped'
): { slotIndex: number | null; zone: 'normal' | 'dropped' | null } => {
  try {
    const rect = canvasElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const slotColliders: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.userData?.type === 'slot-collider' || child.userData?.isSlotCollider) {
        if (activeZone && child.userData?.zone !== activeZone) return;
        slotColliders.push(child);
      }
    });

    const intersects = raycaster.intersectObjects(slotColliders, true); // true = check children
    if (intersects.length > 0) {
      const intersectedObject: any = intersects[0].object;
      const slotIndex = intersectedObject.userData?.slotIndex;
      const zone = (intersectedObject.userData?.zone as 'normal' | 'dropped' | undefined) || 'normal';
      if (typeof slotIndex === 'number' && slotIndex >= 0) {
        return { slotIndex, zone };
      }
    }

    return { slotIndex: null, zone: null };
  } catch (error) {
    console.error('Slot raycast detection (with zone) error:', error);
    return { slotIndex: null, zone: null };
  }
};

/**
 * 가구가 듀얼 가구인지 판별하는 유틸리티
 */
export const isDualFurniture = (moduleId: string, spaceInfo: SpaceInfo): boolean => {
  // 동적 크기 조정 시스템에서는 ID로 듀얼 여부를 판단
  return moduleId.includes('dual-');
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
    // baseConfig.height는 바닥마감재 높이를 이미 포함하므로 별도 가산하면 이중 계산됨
    return mmToThreeUnits(baseFrameHeightMm);
  } else if (spaceInfo.baseConfig.type === 'stand') {
    if (spaceInfo.baseConfig.placementType === 'float') {
      const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
      // 띄워서 배치일 때는 바닥마감재 높이 + 띄움 높이
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
  console.log('🎯 [calculateFurniturePosition] 시작:', {
    slotIndex,
    moduleId,
    surroundType: spaceInfo.surroundType,
    installType: spaceInfo.installType,
    gapConfig: spaceInfo.gapConfig,
    zone,
    timestamp: new Date().toISOString()
  });
  
  const indexing = calculateSpaceIndexing(spaceInfo);
  const isDual = isDualFurniture(moduleId, spaceInfo);
  
  // 노서라운드 모드 디버깅
  if (spaceInfo.surroundType === 'no-surround') {
    console.log('🎯 [calculateFurniturePosition] 노서라운드 위치 상세:', {
      slotIndex,
      moduleId,
      isDual,
      installType: spaceInfo.installType,
      wallPosition: spaceInfo.wallPosition,
      gapConfig: spaceInfo.gapConfig,
      indexingType: indexing.threeUnitPositions ? 'getThreeUnitPositions' : 'calculateSpaceIndexing',
      threeUnitPositions: indexing.threeUnitPositions,
      slotWidths: indexing.slotWidths,
      selectedPosition: indexing.threeUnitPositions?.[slotIndex],
      '첫번째슬롯위치': indexing.threeUnitPositions?.[0],
      '마지막슬롯위치': indexing.threeUnitPositions?.[indexing.threeUnitPositions.length - 1]
    });
  }
  
  // 단내림이 활성화되고 영역이 지정된 경우
  if (spaceInfo.droppedCeiling?.enabled && zone && indexing.zones) {
    const zoneIndexing = zone === 'normal' ? indexing.zones.normal : indexing.zones.dropped;
    if (!zoneIndexing || !zoneIndexing.threeUnitPositions) return null;
    
    if (isDual && slotIndex < zoneIndexing.threeUnitPositions.length - 1) {
      // 듀얼 가구: threeUnitDualPositions 사용
      if (zoneIndexing.threeUnitDualPositions && 
          zoneIndexing.threeUnitDualPositions[slotIndex] !== undefined) {
        return zoneIndexing.threeUnitDualPositions[slotIndex];
      } else {
        // fallback: 두 슬롯의 중간점 계산
        const leftSlotX = zoneIndexing.threeUnitPositions[slotIndex];
        const rightSlotX = zoneIndexing.threeUnitPositions[slotIndex + 1];
        return (leftSlotX + rightSlotX) / 2;
      }
    } else {
      // 싱글 가구: 해당 슬롯 위치
      return zoneIndexing.threeUnitPositions[slotIndex];
    }
  }
  
  // 단내림이 없는 경우 기존 로직 사용
  if (isDual) {
    // 듀얼 가구: 듀얼 위치 배열 사용
    if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
      return indexing.threeUnitDualPositions[slotIndex];
    } else if (slotIndex < indexing.threeUnitPositions.length - 1) {
      // fallback: 두 슬롯의 중간점 계산
      const leftSlotX = indexing.threeUnitPositions[slotIndex];
      const rightSlotX = indexing.threeUnitPositions[slotIndex + 1];
      return (leftSlotX + rightSlotX) / 2;
    } else {
      console.error('Dual position not available for slot:', slotIndex);
      return null;
    }
  } else {
    // 싱글 가구: 일반 위치 배열 사용
    return indexing.threeUnitPositions[slotIndex];
  }
}; 