// ThreeCanvas에서 사용하는 상수들 정의
export const CAMERA_SETTINGS = {
  DEFAULT_FOV: 50, // 75에서 50으로 줄여서 왜곡 감소
  ORTHOGRAPHIC_ZOOM: 1, // 20에서 1로 변경 - 더 가까이서 보기
  NEAR_PLANE: 0.1,
  FAR_PLANE: 1000,
  MIN_DISTANCE: 5, // 8→5로 더 가까이
  MAX_DISTANCE: 200, // 60→200으로 큰 공간 지원
  POLAR_ANGLE_MIN: 0, // 0도 (정수직 위에서 내려다보기까지 허용)
  POLAR_ANGLE_MAX: Math.PI, // 180도 (정수직 아래에서 올려다보기까지 허용)
  AZIMUTH_ANGLE_MIN: -Math.PI / 2, // -90도 (좌우 90도 제한)
  AZIMUTH_ANGLE_MAX: Math.PI / 2, // +90도 (좌우 90도 제한)
} as const;

export const CANVAS_SETTINGS = {
  BACKGROUND_COLOR: '#ffffff',
  ANTIALIAS: true,
  ALPHA: false,
  SHADOW_MAP_ENABLED: true,
  SHADOW_MAP_TYPE: 'PCFSoftShadowMap',
  TONE_MAPPING: 'ACESFilmicToneMapping',
  OUTPUT_ENCODING: 'sRGBEncoding',
  DPR_RANGE: [1, 2],
} as const;

export const LIGHTING_SETTINGS = {
  AMBIENT_INTENSITY: 0.2, // 환경광 최소화로 그림자 대비 강화
  DIRECTIONAL_INTENSITY: 3.0, // 강력한 방향광
  DIRECTIONAL_COLOR: '#ffffff',
  SHADOW_CAMERA_SIZE: 50,
  DIRECTIONAL_POSITION: [15, 20, 10], // 강한 방향성
  
  // 그림자 극대화 조명 설정들
  FILL_LIGHT_INTENSITY: 1.5,
  BACK_LIGHT_INTENSITY: 2.0,
  POINT_LIGHT_INTENSITY: 4.0,
  ENVIRONMENT_INTENSITY: 0.8,
  SHADOW_RADIUS: 2, // 선명한 그림자
  SHADOW_BIAS: -0.0001
} as const; 