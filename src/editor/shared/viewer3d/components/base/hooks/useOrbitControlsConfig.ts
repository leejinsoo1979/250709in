import { useMemo } from 'react';
import * as THREE from 'three';
import { CAMERA_SETTINGS } from '../utils/constants';

export interface OrbitControlsConfig {
  enabled: boolean;
  target: [number, number, number];
  minPolarAngle?: number; // 선택적 속성으로 변경
  maxPolarAngle?: number; // 선택적 속성으로 변경
  minAzimuthAngle?: number; // 좌우 회전 최소 각도
  maxAzimuthAngle?: number; // 좌우 회전 최대 각도
  enablePan: boolean;
  enableZoom: boolean;
  enableRotate: boolean;
  minDistance: number;
  maxDistance: number;
  rotateSpeed?: number; // 회전 속도 조절
  dampingFactor?: number; // 관성 효과
  enableDamping?: boolean; // 관성 효과 활성화
  mouseButtons: {
    LEFT: number | undefined;
    MIDDLE: number;
    RIGHT: number | undefined;
  };
  touches: {
    ONE: number | undefined;
    TWO: number;
  };
}

/**
 * OrbitControls 설정을 관리하는 훅
 * 
 * 맥북 트랙패드 제스처:
 * - 한 손가락 클릭 후 드래그: 카메라 회전 (3D 모드) / 팬 (2D 모드)
 * - 두 손가락 스크롤: 줌 인/아웃
 * - 두 손가락 클릭 후 드래그: 화면 팬 이동
 * 
 * 마우스 컨트롤:
 * - 왼쪽 버튼: 비활성화
 * - 중간 버튼(휠 클릭/드래그): 카메라 회전 (3D 모드) / 팬 (2D 모드)
 * - 휠 스크롤: 줌 인/아웃
 * - 오른쪽 버튼: 팬
 * 
 * @param cameraTarget 카메라 타겟 위치
 * @param viewMode 뷰 모드 (2D 또는 3D)
 * @param spaceWidth 공간 폭 (mm) - 동적 거리 계산용
 * @param spaceHeight 공간 높이 (mm) - 동적 거리 계산용
 * @returns OrbitControls 설정 객체
 */
export const useOrbitControlsConfig = (
  cameraTarget: [number, number, number],
  viewMode: '2D' | '3D' = '3D',
  spaceWidth?: number,
  spaceHeight?: number,
  isMobile: boolean = false
): OrbitControlsConfig => {

  // 공간 크기에 따른 동적 거리 계산
  const calculateDynamicDistances = useMemo(() => {
    if (!spaceWidth || !spaceHeight) {
      return {
        minDistance: CAMERA_SETTINGS.MIN_DISTANCE,
        maxDistance: CAMERA_SETTINGS.MAX_DISTANCE
      };
    }

    // 공간의 최대 차원을 기준으로 거리 범위 계산
    const maxDimension = Math.max(spaceWidth, spaceHeight);
    const mmToThreeUnits = (mm: number) => mm * 0.01;

    // 2D 모드에서는 줌 범위를 더 제한
    const is2D = viewMode === '2D';

    // 최소 거리: 2D 모드에서는 더 가까이 허용
    const minDistance = is2D ? CAMERA_SETTINGS.MIN_DISTANCE * 0.5 : CAMERA_SETTINGS.MIN_DISTANCE;

    // 최대 거리: 2D 모드에서는 더 제한적으로
    const zoomMultiplier = is2D ? 3 : 8; // 2D에서는 3배, 3D에서는 8배
    const dynamicMaxDistance = mmToThreeUnits(maxDimension * zoomMultiplier);
    const maxDistance = Math.max(
      is2D ? CAMERA_SETTINGS.MAX_DISTANCE * 0.6 : CAMERA_SETTINGS.MAX_DISTANCE,
      dynamicMaxDistance
    );

    return { minDistance, maxDistance };
  }, [spaceWidth, spaceHeight, viewMode]);

  const config = useMemo(() => {
    // 2D 모드에서는 회전 비활성화
    const is2DMode = viewMode === '2D';

    return {
      enabled: true,
      target: cameraTarget,
      minPolarAngle: is2DMode ? undefined : CAMERA_SETTINGS.POLAR_ANGLE_MIN,
      maxPolarAngle: is2DMode ? undefined : CAMERA_SETTINGS.POLAR_ANGLE_MAX,
      minAzimuthAngle: is2DMode ? undefined : CAMERA_SETTINGS.AZIMUTH_ANGLE_MIN,
      maxAzimuthAngle: is2DMode ? undefined : CAMERA_SETTINGS.AZIMUTH_ANGLE_MAX,
      enablePan: true, // 팬 기능 활성화 (중간 버튼으로 사용)
      enableZoom: true, // 줌은 항상 허용
      enableRotate: !is2DMode, // 2D 모드에서는 회전 비활성화, 3D 모드에서만 허용
      minDistance: calculateDynamicDistances.minDistance,
      maxDistance: calculateDynamicDistances.maxDistance,
      rotateSpeed: 0.5, // 회전 속도를 0.5로 낮춤 (기본값 1.0보다 느리게, 더 묵직하게)
      zoomSpeed: isMobile && is2DMode ? -1.0 : 1.0, // 모바일 2D 모드에서 줌 제스처 반전
      enableDamping: true, // 관성 효과 활성화로 더 부드럽고 묵직한 움직임
      dampingFactor: 0.05, // 관성 정도 (작을수록 더 묵직함)
      mouseButtons: {
        LEFT: is2DMode ? undefined : THREE.MOUSE.ROTATE, // 왼쪽 버튼: 3D에서는 회전 (트랙패드 기본 동작)
        MIDDLE: is2DMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, // 중간 버튼(휠 클릭): 2D에서는 팬, 3D에서는 회전
        RIGHT: THREE.MOUSE.PAN, // 오른쪽 버튼: 팬
      },
      touches: {
        // 터치 디바이스 설정
        ONE: is2DMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, // 한 손가락: 3D에서는 회전, 2D에서는 팬
        TWO: THREE.TOUCH.DOLLY_PAN, // 두 손가락: 줌+팬 (핀치 줌)
      },
    };
  }, [cameraTarget, viewMode, calculateDynamicDistances, isMobile]);

  return config;
}; 