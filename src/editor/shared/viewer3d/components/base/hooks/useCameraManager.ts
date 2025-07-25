import { useMemo } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore'; // 상위 의존성 - 절대 경로
import { useFurnitureStore } from '@/store/core/furnitureStore'; // 배치된 가구 정보
import { calculateDynamicFOV, calculateCameraTarget, calculateOptimalDistance, mmToThreeUnits } from '../utils/threeUtils'; // 하위 의존성 - 상대 경로

export interface CameraConfig {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  is2DMode: boolean;
  spaceWidth: number;
  spaceHeight: number;
  viewportLeft: number;
  viewportRight: number;
  viewportTop: number;
  viewportBottom: number;
  canvasAspectRatio: number;
  zoom: number;
}

/**
 * 카메라 설정을 관리하는 훅
 * step0 이후로는 모든 step이 configurator로 통일되어 동일하게 처리
 * @param viewMode 뷰 모드 ('2D' | '3D')
 * @param defaultPosition 기본 카메라 위치 (3D 모드용)
 * @returns 카메라 설정 객체
 */
export const useCameraManager = (
  viewMode: '2D' | '3D' = '3D',
  cameraPosition: [number, number, number] = [0, 5, 10],
  view2DDirection?: 'front' | 'left' | 'right' | 'top'
): CameraConfig => {
  // 스토어에서 공간 정보 가져오기 (상위 의존성)
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();

  // 카메라 설정 계산 (메모이제이션으로 성능 최적화)
  const cameraConfig = useMemo(() => {
    const is2DMode = viewMode === '2D';
    
    // 2D/3D 모두 Space3DView에서 계산한 cameraPosition을 그대로 사용
    const position: [number, number, number] = cameraPosition;

    // 모든 뷰에서 공간 중앙을 바라보도록 통일
    const target = calculateCameraTarget(spaceInfo.height);
    
    const fov = calculateDynamicFOV(spaceInfo.width);

    // 3D와 완전히 동일한 방식: calculateOptimalDistance로 자동 거리 계산
    const distance = calculateOptimalDistance(spaceInfo.width, spaceInfo.height, spaceInfo.depth || 600, placedModules.length);
    
    // 거리를 적절한 zoom으로 변환 (거리가 클수록 zoom이 작아져야 함)
    // 2D 모드에서는 더 작은 zoom 값을 사용하여 3D와 동일한 뷰를 보여줌
    const zoom = is2DMode ? 400 / distance : 1200 / distance; // 2D 모드에서는 더 작은 zoom 사용하여 3D와 일치
    
    const canvasAspectRatio = window.innerWidth / window.innerHeight;
    
    // 기본 뷰포트 (Three.js 기본값과 동일)
    const viewportLeft = -1;
    const viewportRight = 1;
    const viewportTop = 1;
    const viewportBottom = -1;

    return {
      position,
      target,
      fov,
      is2DMode,
      spaceWidth: spaceInfo.width,
      spaceHeight: spaceInfo.height,
      viewportLeft,
      viewportRight,
      viewportTop,
      viewportBottom,
      canvasAspectRatio,
      zoom,
    };
  }, [viewMode, view2DDirection, spaceInfo.height, spaceInfo.width, spaceInfo.depth, cameraPosition, placedModules.length]);

  return cameraConfig;
}; 