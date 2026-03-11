import {
  FrameConfig,
  SurroundType,
  FrameSize,
  BaseConfig,
  SpaceInfo,
  DEFAULT_FRAME_VALUES,
  DEFAULT_BASE_VALUES
} from '@/store/core/spaceConfigStore';

/**
 * FrameConfig(4개 boolean) → 기존 surroundType/frameSize/baseConfig 도출
 * 기존 ~20개 파일의 surroundType 참조를 수정하지 않고 호환성 유지
 */
export function deriveFromFrameConfig(
  frameConfig: FrameConfig,
  currentSpaceInfo: SpaceInfo
): {
  surroundType: SurroundType;
  frameSize: FrameSize;
  baseConfig: BaseConfig;
} {
  const currentFrameSize = currentSpaceInfo.frameSize || {
    left: DEFAULT_FRAME_VALUES.LEFT,
    right: DEFAULT_FRAME_VALUES.RIGHT,
    top: DEFAULT_FRAME_VALUES.TOP,
  };
  const currentBaseConfig = currentSpaceInfo.baseConfig || {
    type: 'floor' as const,
    height: DEFAULT_BASE_VALUES.HEIGHT,
  };

  // surroundType 결정: 좌 또는 우가 하나라도 있으면 surround
  const surroundType: SurroundType = (frameConfig.left || frameConfig.right)
    ? 'surround'
    : 'no-surround';

  // frameSize: 각 boolean에 따라 기존값 유지 또는 0
  const frameSize: FrameSize = {
    left: frameConfig.left ? (currentFrameSize.left || DEFAULT_FRAME_VALUES.LEFT) : 0,
    right: frameConfig.right ? (currentFrameSize.right || DEFAULT_FRAME_VALUES.RIGHT) : 0,
    top: frameConfig.top ? (currentFrameSize.top || DEFAULT_FRAME_VALUES.TOP) : 0,
  };

  // baseConfig: bottom이 true면 floor, false면 stand
  const baseConfig: BaseConfig = {
    ...currentBaseConfig,
    type: frameConfig.bottom ? 'floor' : 'stand',
  };

  // bottom이 false로 전환될 때 stand 기본 설정
  if (!frameConfig.bottom && currentBaseConfig.type === 'floor') {
    baseConfig.placementType = baseConfig.placementType || 'ground';
  }

  return { surroundType, frameSize, baseConfig };
}

/**
 * 기존 spaceInfo → FrameConfig 추론 (마이그레이션/초기화용)
 * frameConfig가 없는 기존 데이터를 새 시스템으로 변환
 */
export function inferFrameConfig(spaceInfo: SpaceInfo): FrameConfig {
  // 이미 frameConfig가 있으면 그대로 반환
  if (spaceInfo.frameConfig) {
    return spaceInfo.frameConfig;
  }

  const surroundType = spaceInfo.surroundType || 'surround';
  const frameSize = spaceInfo.frameSize;
  const baseConfig = spaceInfo.baseConfig;

  // 좌/우: surroundType 기반 + frameSize 값 확인
  let left = false;
  let right = false;

  if (surroundType === 'surround') {
    left = (frameSize?.left ?? DEFAULT_FRAME_VALUES.LEFT) > 0;
    right = (frameSize?.right ?? DEFAULT_FRAME_VALUES.RIGHT) > 0;
  }

  // 상: frameSize.top 값 확인
  const top = (frameSize?.top ?? DEFAULT_FRAME_VALUES.TOP) > 0;

  // 하: baseConfig.type이 floor이면 true
  const bottom = !baseConfig || baseConfig.type === 'floor';

  return { left, right, top, bottom };
}
