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
 * 엔드 패널 두께 (20mm)
 */
export const END_PANEL_THICKNESS = 20;

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
export const calculateInternalSpace = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo) {
    return { width: 0, height: 0, depth: 0, startX: 0, startY: 0, startZ: 0 };
  }
  const frameThickness = calculateFrameThickness(spaceInfo);
  const floorFinishHeight = calculateFloorFinishHeight(spaceInfo);
  const topFrameHeight = calculateTopBottomFrameHeight(spaceInfo);
  const baseFrameHeight = calculateBaseFrameHeight(spaceInfo);
  
  // 내경 너비 계산
  let internalWidth;
  
  if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig) {
    // 노서라운드: 내경 너비 = 전체 너비 - (좌우 이격거리)
    internalWidth = spaceInfo.width - (spaceInfo.gapConfig.left + spaceInfo.gapConfig.right);
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
  
  // 내경 깊이 = 설정된 공간 깊이 그대로 (백패널은 별도 구조물)
  const internalDepth = spaceInfo.depth || 1500; // 기본값 1500mm
  
  // 시작 위치 계산 (X 좌표)
  let startX;
  if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig) {
    // 노서라운드: 시작 위치 = 좌측 이격거리
    startX = spaceInfo.gapConfig.left;
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
export const calculateFurnitureDepth = (placedModules?: any[]) => {
  if (!placedModules || placedModules.length === 0) {
    return 600; // 기본 가구 깊이
  }
  
  // 동적 import를 피하기 위해 직접 깊이 확인
  let maxDepth = 600;
  
  placedModules.forEach(module => {
    // customDepth가 있으면 우선 사용
    if (module.customDepth && module.customDepth > maxDepth) {
      maxDepth = module.customDepth;
    }
    // 스타일러는 660mm 깊이
    else if (module.moduleId && module.moduleId.includes('styler')) {
      maxDepth = Math.max(maxDepth, 660);
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
export const calculateFrameThickness = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo) {
    return { left: 0, right: 0, leftMm: 0, rightMm: 0 };
  }
  const { installType, wallConfig, frameSize, surroundType } = spaceInfo;
  
  // 노서라운드 타입인 경우 벽 유무에 따라 처리
  if (surroundType === 'no-surround') {
    let leftThickness = 0;
    let rightThickness = 0;
    
    // frameSize가 명시적으로 설정된 경우 사용 (프레임 크기 조정 시)
    if (frameSize && (frameSize.left !== undefined || frameSize.right !== undefined)) {
      leftThickness = frameSize.left ?? 0;
      rightThickness = frameSize.right ?? 0;
    } else {
      // frameSize가 없으면 설치 타입과 벽 구성에 따라 자동 계산
      if (installType === 'builtin' || installType === 'built-in') {
        // 양쪽벽: 모두 0mm (프레임 없음)
        leftThickness = 0;
        rightThickness = 0;
      } else if (installType === 'semistanding' || installType === 'semi-standing') {
        // 한쪽벽: 벽이 있는 쪽은 0mm, 없는 쪽은 20mm 엔드패널
        if (wallConfig?.left) {
          leftThickness = 0;   // 좌측벽 있음: 프레임 없음
          rightThickness = 20; // 우측벽 없음: 20mm 엔드패널
        } else {
          leftThickness = 20;  // 좌측벽 없음: 20mm 엔드패널
          rightThickness = 0;  // 우측벽 있음: 프레임 없음
        }
      } else if (installType === 'freestanding') {
        // 벽없음(freestanding): 양쪽 모두 20mm 엔드패널
        leftThickness = 20;
        rightThickness = 20;
      }
    }
    
    console.log('🔍 노서라운드 프레임 계산 결과:', { 
      frameSize, 
      leftThickness, 
      rightThickness,
      installType,
      surroundType,
      wallConfig
    });
    
    return {
      left: leftThickness, // mm 단위 그대로 반환 (Room.tsx에서 필요에 따라 변환)
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
      if (wallConfig.left && !wallConfig.right) {
        leftThickness = leftFrameSize;
        rightThickness = END_PANEL_THICKNESS;
      } else if (!wallConfig.left && wallConfig.right) {
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
  
  if (spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig) {
    // 노서라운드: 이격거리를 고려한 너비 계산
    baseWidthMm = spaceInfo.width - (spaceInfo.gapConfig.left + spaceInfo.gapConfig.right);
    
    // 디버깅 로그 추가 (개발 모드에서만 출력)
    // if (import.meta.env.DEV) {
    //   console.log(`🔧 [프레임폭] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 프레임폭=${baseWidthMm}mm`);
    // }
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