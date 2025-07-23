import { useMemo, useState, useEffect } from 'react';
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
 * 2D 모드에서는 회전 비활성화, 줌만 허용
 * 3D 모드에서는 드래그 컨트롤과의 충돌을 피하기 위해 왼쪽 버튼은 비활성화, 오른쪽 버튼으로 회전, 중간 버튼으로 팬
 * Option + 왼쪽 드래그로도 팬 기능 제공 (맥북 트랙패드 사용자용)
 * 
 * 트랙패드 제스처:
 * - 한 손가락: 객체 선택/드래그
 * - 두 손가락 드래그: 화면 팬 이동
 * - 두 손가락 핀치: 줌 인/아웃
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
  spaceHeight?: number
): OrbitControlsConfig => {
  // Option/Shift 키 상태 추적 (맥북 트랙패드 사용자를 위한 팬 기능)
  const [isOptionPressed, setIsOptionPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // 키보드 이벤트 리스너 등록
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) { // 맥에서 Option 키는 altKey로 감지됨
        setIsOptionPressed(true);
      }
      if (event.shiftKey) { // Shift 키로도 팬 가능
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.altKey) { // Option 키가 해제되면
        setIsOptionPressed(false);
      }
      if (!event.shiftKey) { // Shift 키가 해제되면
        setIsShiftPressed(false);
      }
    };

    // 전역 키보드 이벤트 리스너 등록
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // 포커스 잃을 때도 상태 리셋
    const handleBlur = () => {
      setIsOptionPressed(false);
      setIsShiftPressed(false);
    };
    window.addEventListener('blur', handleBlur);

    // 정리 함수
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  
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
      mouseButtons: {
        LEFT: (isOptionPressed || isShiftPressed) ? THREE.MOUSE.PAN : undefined, // Option/Shift 누르면 팬, 아니면 가구/라벨 클릭용으로 비활성화
        MIDDLE: THREE.MOUSE.PAN, // 중간 버튼(휠 클릭)으로 팬 기능
        RIGHT: is2DMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, // 2D 모드에서는 우클릭도 팬, 3D 모드에서만 회전
      },
      touches: {
        ONE: undefined, // 단일 터치는 객체 선택/드래그용으로 남겨둠
        TWO: is2DMode ? THREE.TOUCH.PAN : THREE.TOUCH.DOLLY_PAN, // 2D: 팬만, 3D: 줌+팬
      },
    };
  }, [cameraTarget, viewMode, isOptionPressed, isShiftPressed, calculateDynamicDistances]);

  return config;
}; 