import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../utils/geometry';

interface SlotCollider {
  mesh: THREE.Mesh;
  slotIndex: number;
  position: THREE.Vector3;
  size: THREE.Vector3;
}

/**
 * 3D 레이캐스팅 기반 슬롯 감지 훅
 * 기존 2D 화면 분할 방식을 3D 공간 기반으로 개선
 */
export const useRaycastSlotDetection = (spaceInfo: SpaceInfo) => {
  const { camera } = useThree();
  
  // 내경 공간 및 인덱싱 계산
  const internalSpace = useMemo(() => calculateInternalSpace(spaceInfo), [spaceInfo]);
  const indexing = useMemo(() => calculateSpaceIndexing(spaceInfo), [spaceInfo]);
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = useCallback((mm: number) => mm * 0.01, []);
  
  // 슬롯 콜라이더 정보 생성 (메모이제이션)
  const slotColliders = useMemo((): SlotCollider[] => {
    const colliders: SlotCollider[] = [];
    
    // 슬롯 크기 계산
    const slotWidth = mmToThreeUnits(indexing.columnWidth);
    const slotHeight = mmToThreeUnits(internalSpace.height);
    const slotDepth = mmToThreeUnits(internalSpace.depth);
    
    // 슬롯 시작 높이 계산 (기존 로직과 동일)
    const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
    let slotStartY: number;
    
    if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
      slotStartY = mmToThreeUnits(floorFinishHeightMm + baseFrameHeightMm);
    } else if (spaceInfo.baseConfig.type === 'stand') {
      if (spaceInfo.baseConfig.placementType === 'float') {
        const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
        slotStartY = mmToThreeUnits(floorFinishHeightMm + floatHeightMm);
      } else {
        slotStartY = mmToThreeUnits(floorFinishHeightMm);
      }
    } else {
      slotStartY = mmToThreeUnits(floorFinishHeightMm);
    }
    
    // 각 슬롯에 대한 콜라이더 정보 생성
    indexing.threeUnitPositions.forEach((slotX, slotIndex) => {
      const position = new THREE.Vector3(slotX, slotStartY + slotHeight / 2, 0);
      const size = new THREE.Vector3(slotWidth, slotHeight, slotDepth);
      
      // 가상의 메시 생성 (실제로는 렌더링되지 않음)
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.userData = { slotIndex, isSlotCollider: true };
      mesh.visible = false; // 시각적으로 보이지 않음
      
      colliders.push({
        mesh,
        slotIndex,
        position: position.clone(),
        size: size.clone()
      });
    });
    
    return colliders;
  }, [spaceInfo, indexing, internalSpace, mmToThreeUnits]);
  
  // 3D 레이캐스팅 기반 슬롯 감지
  const getSlotIndexFromMousePosition = useCallback((
    clientX: number, 
    clientY: number, 
    canvasElement: HTMLCanvasElement
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
      
      // 슬롯 콜라이더들과 교차점 검사
      const meshes = slotColliders.map(collider => collider.mesh);
      const intersects = raycaster.intersectObjects(meshes);
      
      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        const slotIndex = intersectedObject.userData.slotIndex;
        
        // 유효한 슬롯 인덱스인지 확인
        if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < indexing.columnCount) {
          return slotIndex;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Raycast slot detection error:', error);
      // 에러 발생 시 기존 방식으로 폴백
      const rect = canvasElement.getBoundingClientRect();
      const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const columnIndex = Math.floor((normalizedX + 1) * indexing.columnCount / 2);
      return Math.max(0, Math.min(columnIndex, indexing.columnCount - 1));
    }
  }, [camera, slotColliders, indexing.columnCount]);
  
  // 디버깅용 슬롯 콜라이더 시각화 (개발 모드에서만)
  const getDebugCollidersData = useCallback(() => {
    if (process.env.NODE_ENV !== 'development') return [];
    
    return slotColliders.map((collider, index) => ({
      key: `debug-collider-${index}`,
      position: collider.position,
      size: collider.size,
      userData: collider.mesh.userData
    }));
  }, [slotColliders]);
  
  return {
    getSlotIndexFromMousePosition,
    slotColliders,
    getDebugCollidersData
  };
}; 