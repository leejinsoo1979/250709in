import * as THREE from 'three';

/**
 * 동적 그리드 시스템 설정
 * CAD 스타일 그리드의 모든 파라미터를 관리합니다.
 */

export interface GridConfig {
  enabled: boolean;
  gridType: 'shader' | 'lines';
  opacity: number;
  showAxisLines: boolean;
  enableSnapping: boolean;
  colors: {
    grid: string;
    axis: string;
    centerLine: string;
  };
  zoomLevels: ZoomLevel[];
}

export interface ZoomLevel {
  cameraDistance: {
    min: number;
    max: number;
  };
  majorGridSize: number; // mm 단위
  minorGridSize: number; // mm 단위
  subdivisions: number;
  opacity: {
    major: number;
    minor: number;
  };
}

/**
 * 기본 그리드 설정
 */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  enabled: true,
  gridType: 'shader', // 'shader' | 'lines'
  opacity: 0.5,
  showAxisLines: true,
  enableSnapping: false,
  colors: {
    grid: '#c0c0c0',
    axis: '#ff4444',
    centerLine: '#888888'
  },
  zoomLevels: [
    {
      cameraDistance: { min: 0, max: 2 },
      majorGridSize: 100, // 100mm (10배 크게)
      minorGridSize: 10,  // 10mm (10배 크게)
      subdivisions: 10,
      opacity: { major: 0.8, minor: 0.3 }
    },
    {
      cameraDistance: { min: 2, max: 5 },
      majorGridSize: 200, // 200mm
      minorGridSize: 50, // 50mm
      subdivisions: 5,
      opacity: { major: 0.8, minor: 0.3 }
    },
    {
      cameraDistance: { min: 5, max: 10 },
      majorGridSize: 100, // 100mm
      minorGridSize: 10,  // 10mm
      subdivisions: 10,
      opacity: { major: 0.8, minor: 0.3 }
    },
    {
      cameraDistance: { min: 10, max: 20 },
      majorGridSize: 500, // 500mm
      minorGridSize: 100, // 100mm
      subdivisions: 5,
      opacity: { major: 0.8, minor: 0.3 }
    },
    {
      cameraDistance: { min: 20, max: 50 },
      majorGridSize: 1000, // 1000mm (1m)
      minorGridSize: 100,  // 100mm
      subdivisions: 10,
      opacity: { major: 0.8, minor: 0.3 }
    },
    {
      cameraDistance: { min: 50, max: Infinity },
      majorGridSize: 5000, // 5000mm (5m)
      minorGridSize: 1000, // 1000mm (1m)
      subdivisions: 5,
      opacity: { major: 0.8, minor: 0.3 }
    }
  ]
};

/**
 * 카메라 거리에 따른 적절한 그리드 레벨 찾기
 */
export function getGridLevelForDistance(distance: number, config: GridConfig = DEFAULT_GRID_CONFIG): ZoomLevel {
  for (const level of config.zoomLevels) {
    if (distance >= level.cameraDistance.min && distance < level.cameraDistance.max) {
      return level;
    }
  }
  
  // 기본값 반환 (가장 큰 그리드)
  return config.zoomLevels[config.zoomLevels.length - 1];
}

/**
 * mm 단위를 Three.js 단위로 변환
 */
export function mmToThreeUnits(mm: number): number {
  return mm * 0.001; // mm to meters
}

/**
 * Three.js 단위를 mm 단위로 변환
 */
export function threeUnitsToMm(units: number): number {
  return units * 1000; // meters to mm
}

/**
 * 그리드 스냅 함수
 */
export function snapToGridSize(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * 세계 좌표를 그리드에 스냅
 */
export function snapWorldPositionToGrid(
  worldPosition: THREE.Vector3, 
  cameraDistance: number,
  config: GridConfig = DEFAULT_GRID_CONFIG
): THREE.Vector3 {
  const level = getGridLevelForDistance(cameraDistance, config);
  const snapSize = mmToThreeUnits(level.majorGridSize);
  
  return new THREE.Vector3(
    snapToGridSize(worldPosition.x, snapSize),
    snapToGridSize(worldPosition.y, snapSize),
    worldPosition.z
  );
}

/**
 * 그리드 설정을 로컬 스토리지에 저장
 */
export function saveGridConfig(config: GridConfig): void {
  try {
    localStorage.setItem('gridConfig', JSON.stringify(config));
  } catch (error) {
    console.warn('Failed to save grid config:', error);
  }
}

/**
 * 로컬 스토리지에서 그리드 설정 로드
 */
export function loadGridConfig(): GridConfig {
  try {
    const saved = localStorage.getItem('gridConfig');
    if (saved) {
      const config = JSON.parse(saved);
      return { ...DEFAULT_GRID_CONFIG, ...config };
    }
  } catch (error) {
    console.warn('Failed to load grid config:', error);
  }
  
  return DEFAULT_GRID_CONFIG;
}