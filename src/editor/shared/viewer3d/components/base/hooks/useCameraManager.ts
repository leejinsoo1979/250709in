import { useMemo } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore'; // 상위 의존성 - 절대 경로
import { useFurnitureStore } from '@/store/core/furnitureStore'; // 배치된 가구 정보
import { useUIStore } from '@/store/uiStore'; // UI 상태 (카메라 모드)
import { calculateDynamicFOV, calculateCameraTarget, calculateOptimalDistance, mmToThreeUnits } from '../utils/threeUtils'; // 하위 의존성 - 상대 경로

export interface CameraConfig {
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
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
  view2DDirection?: 'front' | 'left' | 'right' | 'top',
  cameraTarget?: [number, number, number],
  cameraUp?: [number, number, number],
  isSplitView?: boolean,
  zoomMultiplierOverride?: number
): CameraConfig => {
  // 스토어에서 공간 정보 가져오기 (상위 의존성)
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { cameraMode } = useUIStore();

  // 카메라 설정 계산 (메모이제이션으로 성능 최적화)
  const cameraConfig = useMemo(() => {
    const is2DMode = viewMode === '2D';
    
    // 2D/3D 모두 Space3DView에서 계산한 cameraPosition을 그대로 사용
    const position: [number, number, number] = cameraPosition;

    // cameraTarget이 제공되면 사용, 아니면 공간 중앙 계산
    const target = cameraTarget || calculateCameraTarget(spaceInfo.height);
    
    const fov = calculateDynamicFOV(spaceInfo.width);

    // 3D와 완전히 동일한 방식: calculateOptimalDistance로 자동 거리 계산
    const distance = calculateOptimalDistance(spaceInfo.width, spaceInfo.height, spaceInfo.depth || 600, placedModules.length);

    // 거리를 적절한 zoom으로 변환 (거리가 클수록 zoom이 작아져야 함)
    // 2D 모드에서는 거리가 2배이므로 zoom을 0.7배로 조정
    // 3D Orthographic 모드는 perspective와 동일한 크기로 보이도록 zoom을 0.7배로 조정
    // 4분할 뷰에서는 화면이 1/4 크기이므로 zoom을 0.35배로 조정
    // zoomMultiplierOverride가 있으면 우선 적용 (미리보기 모드 등)
    const is3DOrthographic = viewMode === '3D' && cameraMode === 'orthographic';
    const zoomMultiplier = zoomMultiplierOverride ?? (isSplitView ? 0.35 : (is2DMode ? 0.7 : (is3DOrthographic ? 0.7 : 1.0)));
    const zoom = (1200 / distance) * zoomMultiplier;

    // 실제 뷰어 영역의 aspect ratio 계산 (window 크기 대신)
    // Canvas 요소의 실제 크기를 기준으로 계산
    const getViewerAspectRatio = () => {
      const canvas = document.querySelector('canvas');
      if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        return canvas.clientWidth / canvas.clientHeight;
      }
      // fallback: window 크기 기준
      return window.innerWidth / window.innerHeight;
    };
    const canvasAspectRatio = getViewerAspectRatio();
    
    // 기본 뷰포트 (Three.js 기본값과 동일)
    const viewportLeft = -1;
    const viewportRight = 1;
    const viewportTop = 1;
    const viewportBottom = -1;

    return {
      position,
      target,
      up: cameraUp || [0, 1, 0],
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
  }, [viewMode, view2DDirection, spaceInfo.height, spaceInfo.width, spaceInfo.depth, cameraPosition, cameraTarget, cameraUp, placedModules.length, isSplitView, cameraMode, zoomMultiplierOverride]);

  return cameraConfig;
}; 