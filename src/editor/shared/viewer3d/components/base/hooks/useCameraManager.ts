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
  cameraPosition: [number, number, number] = [0, 5, 10]
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

    return {
      position,
      target,
      fov,
      is2DMode,
      spaceWidth: spaceInfo.width,
      spaceHeight: spaceInfo.height,
    };
  }, [viewMode, spaceInfo.height, spaceInfo.width, spaceInfo.depth, cameraPosition, placedModules.length]);

  return cameraConfig;
}; 