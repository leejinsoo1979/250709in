import { SpaceInfo } from '@/store/core/spaceConfigStore';

// 노서라운드 빌트인 여부 확인 함수
const isNoSurroundBuiltin = (spaceInfo: SpaceInfo): boolean => {
  return spaceInfo.surroundType === 'no-surround' && (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in');
};

/**
 * 백패널 두께 (9mm) - 얇은 백패널
 */
export const BACK_PANEL_THICKNESS = 9;

/**
 * 벽 두께 (30mm)
 */
export const WALL_THICKNESS = 30;

/**
 * 패널 깊이 (580mm)
 * 모든 패널은 동일한 깊이를 가집니다.
 */
export const PANEL_DEPTH = 580;

/**
 * 공간 전체 깊이 (598mm)
 * 내경(580mm) + 백패널 두께(18mm) = 598mm
 */
export const TOTAL_DEPTH = 598; 

/**
 * 내경 깊이 (580mm, 백패널 두께 제외)
 * 이는 내부 공간의 깊이로, 백패널이 설치되기 전의 공간입니다.
 */
export const INNER_DEPTH = 580;

/**
 * 서라운드 프레임 두께 (10mm)
 */
export const SURROUND_FRAME_THICKNESS = 10;

/**
 * 엔드 패널 두께 (18mm)
 */
export const END_PANEL_THICKNESS = 18;

/**
 * 실제 치수를 기반으로 3D 공간의 방 치수 계산 (mm 단위)
 * 바닥재가 있는 경우 실제 공간 높이는 전체 높이에서 바닥재 두께를 뺀 값
 */
export const calculateRoomDimensions = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo || typeof spaceInfo.width !== 'number' || typeof spaceInfo.height !== 'number' || typeof spaceInfo.depth !== 'number') {
    return { width: 3600, height: 2400, depth: 1500 };
  }
  const width = spaceInfo.width || 3600; // 기본값 3600mm
  // 바닥재가 있는 경우 실제 공간 높이 = 전체 높이 - 바닥재 두께
  const height = spaceInfo.hasFloorFinish 
    ? (spaceInfo.height || 2400) - (spaceInfo.floorFinish?.height || 0)
    : (spaceInfo.height || 2400);
  const depth = spaceInfo.depth || 1500; // 기본값 1500mm
  
  return {
    width,
    height,
    depth
  };
};

/**
 * 내부장 배치 가능한 내경 공간 치수 계산 (mm 단위)
 * 좌우 프레임 사이의 공간에서 모듈이 배치될 수 있는 실제 공간
 */
export const calculateInternalSpace = (spaceInfo: SpaceInfo, hasLeftFurniture: boolean = false, hasRightFurniture: boolean = false) => {
  if (!spaceInfo) {
    return { width: 0, height: 0, depth: 0, startX: 0, startY: 0, startZ: 0 };
  }
  const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
  const floorFinishHeight = calculateFloorFinishHeight(spaceInfo);
  const topFrameHeight = calculateTopBottomFrameHeight(spaceInfo);
  const baseFrameHeight = calculateBaseFrameHeight(spaceInfo);
  
  // 내경 너비 계산 - SpaceCalculator.calculateInternalWidth와 동일한 로직 사용
  let internalWidth;
  
  if (spaceInfo.surroundType === 'no-surround') {
    // 노서라운드: 설치 타입에 따라 다르게 처리
    if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
      // 빌트인: 양쪽 벽 이격거리 적용
      const leftGap = spaceInfo.gapConfig?.left || 2;
      const rightGap = spaceInfo.gapConfig?.right || 2;
      internalWidth = spaceInfo.width - leftGap - rightGap;
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽이 있는 쪽만 이격거리 적용
      if (spaceInfo.wallConfig?.left) {
        // 좌측 벽: 좌측만 이격거리
        const leftGap = spaceInfo.gapConfig?.left || 2;
        internalWidth = spaceInfo.width - leftGap;
      } else {
        // 우측 벽: 우측만 이격거리
        const rightGap = spaceInfo.gapConfig?.right || 2;
        internalWidth = spaceInfo.width - rightGap;
      }
    } else {
      // 프리스탠딩: 이격거리 적용하지 않음 (엔드패널이 외부에 있음)
      internalWidth = spaceInfo.width;
    }
  } else {
    // 서라운드: 내경 너비 = 전체 너비 - 좌측 프레임 - 우측 프레임
    internalWidth = spaceInfo.width - frameThickness.left - frameThickness.right;
  }
  
  // 내경 높이 = 전체 높이 - 바닥재 - 상단 프레임 - 받침대
  let internalHeight = spaceInfo.height;
  if (spaceInfo.hasFloorFinish) {
    internalHeight -= floorFinishHeight;
  }
  internalHeight -= topFrameHeight;
  internalHeight -= baseFrameHeight;
  
  // 단내림 구간의 경우 높이 조정
  if (spaceInfo.zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
    // 단내림 구간: 내경 높이에서 단내림 높이 차이를 추가로 빼기
    const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
    const beforeHeight = internalHeight;
    internalHeight -= dropHeight;
    console.log('🔴 calculateInternalSpace 단내림 높이 조정');
    console.log('  zone:', spaceInfo.zone);
    console.log('  dropHeight:', dropHeight);
    console.log('  beforeHeight:', beforeHeight);
    console.log('  afterHeight:', internalHeight);
    console.log('  reduction:', beforeHeight - internalHeight);
  }
  
  // 내경 깊이 = 설정된 공간 깊이 그대로 (백패널은 별도 구조물)
  const internalDepth = spaceInfo.depth || 1500; // 기본값 1500mm
  
  // 시작 위치 계산 (X 좌표)
  let startX;
  if (spaceInfo.surroundType === 'no-surround') {
    if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽이 있는 쪽에만 이격거리 적용
      if (spaceInfo.wallConfig?.left) {
        // 좌측 벽: 좌측 이격거리에서 시작
        startX = spaceInfo.gapConfig?.left || 2;
      } else {
        // 우측 벽: 좌측은 0에서 시작 (엔드패널 바로 안쪽)
        startX = 0;
      }
    } else if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
      // 빌트인: 좌측 이격거리에서 시작
      startX = spaceInfo.gapConfig?.left || 2;
    } else {
      // 프리스탠딩: 0에서 시작 (엔드패널 바로 안쪽)
      startX = 0;
    }
  } else {
    // 서라운드: 시작 위치 = 좌측 프레임 두께
    startX = frameThickness.left;
  }
  
  // 노서라운드 모드에서 디버깅 로그 (개발 모드에서만 출력)
  // if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && import.meta.env.DEV) {
  //   console.log(`📐 [내경계산] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 내경너비=${internalWidth}, 시작위치X=${startX}`);
  // }
  
  return {
    width: internalWidth,
    height: internalHeight,
    depth: internalDepth,
    // 배치 시작 위치
    startX: startX,
    startY: baseFrameHeight + floorFinishHeight,
    startZ: 0
  };
};

/**
 * 벽 두께 계산 (30mm)
 * 실제 벽은 백패널 뒤에 위치하며, 구조적 지지를 제공합니다.
 */
export const calculateWallThickness = () => {
  return WALL_THICKNESS;
};

/**
 * 패널 깊이 계산 (spaceInfo.depth 기반)
 * 사용자가 설정한 공간 깊이를 그대로 사용 (공간 메쉬용)
 */
export const calculatePanelDepth = (spaceInfo?: SpaceInfo) => {
  // spaceInfo가 없으면 기존 고정값 사용 (하위 호환성)
  if (!spaceInfo) {
    return PANEL_DEPTH;
  }
  
  // 사용자 설정 깊이를 사용하되, undefined인 경우 기본값 1500 사용
  return spaceInfo.depth || 1500;
};

/**
 * 가구/프레임 배치용 깊이 계산
 * 배치된 가구 중 가장 깊은 가구의 깊이를 반환
 * 가구가 없으면 기본값 600mm 반환
 */
export const calculateFurnitureDepth = (placedModules?: any[], spaceInfo?: any) => {
  // 노서라운드 모드에서는 도어가 없으므로 580mm
  const baseDepth = spaceInfo?.surroundType === 'no-surround' ? 580 : 600;
  
  if (!placedModules || placedModules.length === 0) {
    return baseDepth; // 기본 가구 깊이
  }
  
  // 동적 import를 피하기 위해 직접 깊이 확인
  let maxDepth = baseDepth;
  
  placedModules.forEach(module => {
    // customDepth가 있으면 우선 사용
    if (module.customDepth && module.customDepth > maxDepth) {
      maxDepth = module.customDepth;
    }
    // 스타일러는 660mm 깊이 (노서라운드에서는 640mm)
    else if (module.moduleId && module.moduleId.includes('styler')) {
      const stylerDepth = spaceInfo?.surroundType === 'no-surround' ? 640 : 660;
      maxDepth = Math.max(maxDepth, stylerDepth);
    }
    // 기타 특수 가구 깊이 처리 가능
  });
  
  return maxDepth;
};

/**
 * 백패널 두께 계산 (18mm)
 * 백패널은 내부 공간의 뒤쪽 끝에 위치합니다.
 */
export const calculateBackPanelThickness = () => {
  return BACK_PANEL_THICKNESS;
};

/**
 * 바닥 마감재 높이 계산 (mm 단위)
 */
export const calculateFloorFinishHeight = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo.hasFloorFinish || !spaceInfo.floorFinish) {
    return 0;
  }
  
  return spaceInfo.floorFinish.height;
};

// 에어컨 드롭 관련 함수 제거됨 (사용하지 않음)

/**
 * 설치 타입에 따른 좌우 프레임 두께 계산 (mm 단위)
 * frameSize 설정값을 우선 사용하고, 벽이 없는 쪽은 18mm 엔드패널 고정
 */
export const calculateFrameThickness = (spaceInfo: SpaceInfo, hasLeftFurniture: boolean = false, hasRightFurniture: boolean = false) => {
  if (!spaceInfo) {
    return { left: 0, right: 0, leftMm: 0, rightMm: 0 };
  }
  const { installType, wallConfig, frameSize, surroundType } = spaceInfo;
  
  // 노서라운드 타입인 경우
  if (surroundType === 'no-surround') {
    let leftThickness = 0;
    let rightThickness = 0;
    
    // 설치 타입에 따라 엔드패널 위치 결정
    if (installType === 'builtin' || installType === 'built-in') {
      // 빌트인: 양쪽 벽이 있으므로 엔드패널 없음
      leftThickness = 0;
      rightThickness = 0;
    } else if (installType === 'semistanding' || installType === 'semi-standing') {
      // 세미스탠딩: 벽이 없는 쪽에만 엔드패널 (가구가 있는 경우에만)
      if (wallConfig?.left) {
        // 왼쪽 벽이 있으면 오른쪽에만 엔드패널 가능
        leftThickness = 0;
        rightThickness = hasRightFurniture ? END_PANEL_THICKNESS : 0;
      } else {
        // 오른쪽 벽이 있으면 왼쪽에만 엔드패널 가능
        leftThickness = hasLeftFurniture ? END_PANEL_THICKNESS : 0;
        rightThickness = 0;
      }
    } else if (installType === 'freestanding') {
      // 프리스탠딩: 각 쪽에 가구가 있으면 엔드패널
      leftThickness = hasLeftFurniture ? END_PANEL_THICKNESS : 0;
      rightThickness = hasRightFurniture ? END_PANEL_THICKNESS : 0;
    }
    
    console.log('🎯 노서라운드 엔드패널 계산:', {
      hasLeftFurniture,
      hasRightFurniture,
      leftThickness,
      rightThickness,
      installType,
      wallConfig
    });
    
    return {
      left: leftThickness,
      right: rightThickness,
      leftMm: leftThickness,
      rightMm: rightThickness
    };
  }
  
  let leftThickness = 0;
  let rightThickness = 0;
  
  // frameSize가 설정되어 있으면 그 값을 사용, 없으면 기본값 50mm (서라운드 기본값)
  const defaultFrameSize = 50;
  const leftFrameSize = frameSize?.left !== undefined ? frameSize.left : defaultFrameSize;
  const rightFrameSize = frameSize?.right !== undefined ? frameSize.right : defaultFrameSize;
  
  switch (installType) {
    case 'builtin':
    case 'built-in':
      // 빌트인: 양쪽 모두 벽이 있으므로 frameSize 값 사용
      leftThickness = leftFrameSize;
      rightThickness = rightFrameSize;
      break;
    case 'semistanding':
    case 'semi-standing':
      // 세미스탠딩: 벽이 있는 쪽은 frameSize, 벽이 없는 쪽은 20mm 엔드패널
      if (wallConfig?.left && !wallConfig?.right) {
        leftThickness = leftFrameSize;
        rightThickness = END_PANEL_THICKNESS;
      } else if (!wallConfig?.left && wallConfig?.right) {
        leftThickness = END_PANEL_THICKNESS;
        rightThickness = rightFrameSize;
      } else {
        // 기본값 (좌측벽)
        leftThickness = leftFrameSize;
        rightThickness = END_PANEL_THICKNESS;
      }
      break;
    case 'freestanding':
    case 'free-standing':
      // 프리스탠딩: 양쪽 모두 벽이 없으므로 20mm 엔드패널
      leftThickness = END_PANEL_THICKNESS;
      rightThickness = END_PANEL_THICKNESS;
      break;
    default:
      leftThickness = leftFrameSize;
      rightThickness = rightFrameSize;
  }
  
  return {
    left: leftThickness,
    right: rightThickness,
    leftMm: leftThickness,
    rightMm: rightThickness
  };
};

/**
 * 베이스 프레임(받침대) 너비 계산 (mm 단위)
 */
export const calculateBaseFrameWidth = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo) {
    return { width: 0, widthMm: 0 };
  }
  
  let baseWidthMm;
  
  if (spaceInfo.surroundType === 'no-surround') {
    // 노서라운드 모드
    if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
      // 빌트인: 이격거리를 고려한 너비 계산
      const leftGap = spaceInfo.gapConfig?.left || 2;
      const rightGap = spaceInfo.gapConfig?.right || 2;
      baseWidthMm = spaceInfo.width - (leftGap + rightGap);
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 전체 너비 사용 (엔드패널이 슬롯에 포함됨)
      baseWidthMm = spaceInfo.width;
    } else {
      // 프리스탠딩: 전체 너비 사용 (엔드패널이 슬롯에 포함됨)
      baseWidthMm = spaceInfo.width;
    }
  } else {
    // 서라운드: 프레임 두께를 고려한 너비 계산
    const frameThickness = calculateFrameThickness(spaceInfo);
    baseWidthMm = spaceInfo.width - frameThickness.leftMm - frameThickness.rightMm;
  }
  
  return {
    width: baseWidthMm,
    widthMm: baseWidthMm
  };
};

/**
 * 받침대 높이 계산 (mm 단위)
 * 기본값은 65mm이고, baseConfig.height 설정이 있으면 그 값을 사용
 */
export const calculateBaseFrameHeight = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo) {
    return 0;
  }
  
  // 받침대가 있는 경우에만 높이 반환
  if (spaceInfo.baseConfig?.type === 'floor') {
    const height = spaceInfo.baseConfig.height || 65;
    return height;
  }
  return 0;
};

/**
 * 상단/하단 프레임 높이 계산 (mm 단위)
 * 기본값은 10mm이고, frameSize 설정이 있으면 그 값을 사용
 */
export const calculateTopBottomFrameHeight = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo) {
    return SURROUND_FRAME_THICKNESS;
  }
  
  // frameSize.top이 설정되어 있으면 그 값을 사용, 없으면 기본값 10mm
  return spaceInfo.frameSize?.top || SURROUND_FRAME_THICKNESS;
}; 
