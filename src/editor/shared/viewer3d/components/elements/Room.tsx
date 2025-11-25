import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/contexts/ThemeContext';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings } from '@/editor/shared/utils/materialConstants';
import { 
  calculateRoomDimensions, 
  calculateFloorFinishHeight,
  calculatePanelDepth,
  calculateFurnitureDepth,
  calculateFrameThickness,
  calculateBaseFrameWidth,
  calculateTopBottomFrameHeight,
  calculateBaseFrameHeight,
  calculateInternalSpace
} from '../../utils/geometry';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { MaterialFactory } from '../../utils/materials/MaterialFactory';
import { useSpace3DView } from '../../context/useSpace3DView';
import PlacedFurnitureContainer from './furniture/PlacedFurnitureContainer';
import { useThree, useFrame } from '@react-three/fiber';

interface RoomProps {
  spaceInfo: SpaceInfo;
  floorColor?: string;
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
  renderMode?: 'solid' | 'wireframe';
  materialConfig?: {
    doorColor: string;
    doorTexture?: string;
    frameColor: string;
    frameTexture?: string;
  };
  showAll?: boolean;
  placedModules?: any[]; // 뷰어 모드용 가구 데이터
  showFrame?: boolean; // 프레임 표시 여부
  showDimensions?: boolean; // 치수 표시 여부
  isStep2?: boolean; // Step2 여부
  activeZone?: 'normal' | 'dropped'; // 활성 영역
  showFurniture?: boolean; // 가구 본체 표시 여부
  hideEdges?: boolean; // 외곽선 숨김 (PDF 캡처용)
  cameraModeOverride?: 'perspective' | 'orthographic'; // 카메라 모드 오버라이드
  readOnly?: boolean; // 읽기 전용 모드 (viewer 권한)
  onFurnitureClick?: (furnitureId: string, slotIndex: number) => void; // 가구 클릭 콜백 (미리보기용)
  ghostHighlightSlotIndex?: number | null; // 미리보기용 슬롯 강조
}

// mm를 Three.js 단위로 변환 (1mm = 0.01 Three.js units)
const mmToThreeUnits = (mm: number): number => mm * 0.01;

const END_PANEL_THICKNESS = 18; // 18mm로 통일

// 전역 렌더링 카운터 (컴포넌트 마운트/언마운트에 영향받지 않음)
if (typeof window !== 'undefined') {
  if (!window.renderCounter) {
    window.renderCounter = {
      leftFrame: 0,
      rightFrame: 0,
      leftEndPanel: 0,
      rightEndPanel: 0
    };
  }
}

// 노서라운드 모드에서 엔드패널과 이격거리를 계산하는 헬퍼 함수
const calculateNoSurroundOffset = (spaceInfo: SpaceInfo, side: 'left' | 'right'): number => {
  if (spaceInfo.surroundType !== 'no-surround') return 0;
  
  const gapConfig = spaceInfo.gapConfig || { left: 18, right: 18 };
  const wallConfig = spaceInfo.wallConfig || { left: true, right: true };
  
  if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
    // 빌트인: 이격거리만
    return side === 'left' ? (gapConfig.left || 2) : (gapConfig.right || 2);
  } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
    // 세미스탠딩: 벽이 있어도 이격거리 무시, 없으면 엔드패널만
    if (side === 'left') {
      return wallConfig.left ? 0 : END_PANEL_THICKNESS;
    } else {
      return wallConfig.right ? 0 : END_PANEL_THICKNESS;
    }
  } else {
    // 프리스탠딩: 엔드패널만 (이격거리 무시)
    return END_PANEL_THICKNESS;
  }
};

// 노서라운드 모드에서 최대 오프셋을 계산 (상단/하단 프레임용)
const calculateMaxNoSurroundOffset = (spaceInfo: SpaceInfo): number => {
  // 모든 경우에 빌트인(양쪽벽) 기준으로 통일 - 항상 20 반환
  return 20;
};

// 점선 라인 컴포넌트
const DashedLine: React.FC<{
  points: [number, number, number][];
  color: string;
  dashSize: number;
  gapSize: number;
}> = ({ points, color, dashSize, gapSize }) => {
  const lineRef = useRef<THREE.Line>(null);
  
  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [points]);
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(points.flat());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [points]);
  
  return (
    <line ref={lineRef} geometry={geometry}>
      <lineDashedMaterial
        color={color}
        dashSize={dashSize}
        gapSize={gapSize}
        opacity={0.6}
        transparent={true}
      />
    </line>
  );
};

// 2D 모드용 Box with Edges 컴포넌트 - EdgesGeometry 사용으로 일관성 확보
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  onBeforeRender?: () => void;
  viewMode?: '2D' | '3D';
  view2DTheme?: 'dark' | 'light';
  isEndPanel?: boolean; // 엔드패널 여부
  shadowEnabled?: boolean; // 그림자 활성화 여부
  hideEdges?: boolean; // 외곽선 숨김
}> = ({ args, position, material, renderMode, onBeforeRender, viewMode: viewModeProp, view2DTheme, isEndPanel = false, shadowEnabled = true, hideEdges = false }) => {
  // Debug: 측면 프레임 확인
  if (args[0] < 1 && args[1] > 15) {
    const bottom = position[1] - args[1]/2;
    const top = position[1] + args[1]/2;
    console.log('📍 Room BoxWithEdges 측면 프레임 - Y:', position[1], 'H:', args[1], '하단:', bottom, '상단:', top, 'position:', position, 'args:', args);

    // Y=0인 프레임 추적
    if (position[1] === 0) {
      console.error('🚨🚨🚨 [Y=0 프레임 발견!] 바닥에서 시작하는 프레임!', {
        position,
        args,
        isEndPanel,
        material,
        stackTrace: new Error().stack
      });
    }
  }

  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args[0], args[1], args[2]]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const { viewMode: contextViewMode } = useSpace3DView();
  const viewMode = viewModeProp || contextViewMode;
  const { theme } = useViewerTheme();
  
  // 메모리 누수 방지: 컴포넌트 언마운트 시 geometry 정리
  useEffect(() => {
    return () => {
      geometry.dispose();
      edgesGeometry.dispose();
    };
  }, [geometry, edgesGeometry]);
  
  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh geometry={geometry} receiveShadow={viewMode === '3D' && shadowEnabled} castShadow={viewMode === '3D' && shadowEnabled} onBeforeRender={onBeforeRender}>
          <primitive object={material} />
        </mesh>
      )}
      {/* 모서리 라인 렌더링 - hideEdges가 false일 때만 표시 */}
      {!hideEdges && (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial
            color={
              // MeshBasicMaterial인 경우 (프레임 형광색) material의 색상 사용
              material instanceof THREE.MeshBasicMaterial
                ? "#" + material.color.getHexString()
                : // 2D 모드에서 엔드패널인 경우 도어와 같은 연두색 사용
                  viewMode === '2D' && isEndPanel
                    ? "#00FF00" // 연두색 (도어 색상)
                    : renderMode === 'wireframe'
                      ? (theme?.mode === 'dark' ? "#ffffff" : "#333333")
                      : (viewMode === '2D' && view2DTheme === 'dark' ? "#FFFFFF" : "#666666")
            }
            linewidth={viewMode === '2D' && view2DTheme === 'dark' ? 1.5 : 0.5}
            opacity={1.0}
            transparent={false}
          />
        </lineSegments>
      )}
    </group>
  );
};

const Room: React.FC<RoomProps> = ({
  spaceInfo,
  floorColor = '#FF9966',
  viewMode = '3D',
  view2DDirection,
  materialConfig,
  showAll = true,
  showFrame = true,
  placedModules,
  showDimensions,
  isStep2,
  renderMode: renderModeProp,
  activeZone,
  showFurniture,
  hideEdges = false,
  cameraModeOverride,
  readOnly = false,
  onFurnitureClick,
  ghostHighlightSlotIndex
}) => {
  // 고유 ID로 어떤 Room 인스턴스인지 구분
  const roomId = React.useRef(`room-${Date.now()}-${Math.random()}`).current;

  // 모든 훅들을 early return 전에 호출 (Rules of Hooks 준수)
  const { theme } = useViewerTheme();
  const { colors } = useThemeColors();
  const { theme: appTheme } = useTheme(); // 앱 테마 가져오기
  const { renderMode: contextRenderMode } = useSpace3DView(); // context에서 renderMode 가져오기
  const renderMode = renderModeProp || contextRenderMode; // props로 전달된 값을 우선 사용
  const { highlightedFrame, activeDroppedCeilingTab, view2DTheme, shadowEnabled, cameraMode: cameraModeFromStore, selectedSlotIndex } = useUIStore(); // 강조된 프레임 상태 및 활성 탭 가져오기
  const placedModulesFromStore = useFurnitureStore((state) => state.placedModules); // 가구 정보 가져오기

  // props로 전달된 cameraMode가 있으면 우선 사용, 없으면 UIStore 값 사용
  const cameraMode = cameraModeOverride || cameraModeFromStore;

  // Three.js hooks for camera tracking
  const { camera } = useThree();

  // 벽 재질 refs - ShaderMaterial로 타입 변경
  const leftWallMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const rightWallMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const topWallMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const droppedWallMaterialRef = useRef<THREE.ShaderMaterial>(null);

  // 카메라 각도에 따라 벽 투명도 업데이트 - orthographic 모드에서만
  useFrame(() => {
    // perspective 모드에서는 항상 불투명하게
    if (viewMode === '3D' && cameraMode === 'perspective') {
      if (leftWallMaterialRef.current && leftWallMaterialRef.current.uniforms) {
        leftWallMaterialRef.current.uniforms.opacity.value = 1;
      }
      if (rightWallMaterialRef.current && rightWallMaterialRef.current.uniforms) {
        rightWallMaterialRef.current.uniforms.opacity.value = 1;
      }
      if (topWallMaterialRef.current && topWallMaterialRef.current.uniforms) {
        topWallMaterialRef.current.uniforms.opacity.value = 1;
      }
      if (droppedWallMaterialRef.current && droppedWallMaterialRef.current.uniforms) {
        droppedWallMaterialRef.current.uniforms.opacity.value = 1;
      }
    } else if (viewMode === '3D' && cameraMode === 'orthographic') {
      // orthographic 모드에서는 모든 그라데이션 메쉬 숨김
      if (leftWallMaterialRef.current && leftWallMaterialRef.current.uniforms) {
        leftWallMaterialRef.current.uniforms.opacity.value = 0;
      }
      if (rightWallMaterialRef.current && rightWallMaterialRef.current.uniforms) {
        rightWallMaterialRef.current.uniforms.opacity.value = 0;
      }
      if (topWallMaterialRef.current && topWallMaterialRef.current.uniforms) {
        topWallMaterialRef.current.uniforms.opacity.value = 0;
      }
      if (droppedWallMaterialRef.current && droppedWallMaterialRef.current.uniforms) {
        droppedWallMaterialRef.current.uniforms.opacity.value = 0;
      }
    }
  });

  // spaceInfo 유효성 체크 (early return 대신 플래그 사용 - Rules of Hooks 준수)
  const isSpaceInfoValid = spaceInfo && typeof spaceInfo.width === 'number' && typeof spaceInfo.height === 'number';

  // Room 컴포넌트 렌더링 추적
  React.useEffect(() => {
    if (!isSpaceInfoValid) return;
    console.log('🏠🏠🏠 Room 컴포넌트 렌더링:', {
      roomId: roomId.substring(0, 20),
      viewMode,
      placedModulesProp: !!placedModules,
      placedModulesCount: placedModules?.length,
      activeZone,
      droppedCeiling: spaceInfo?.droppedCeiling,
      timestamp: Date.now()
    });
  });
  
  // 노서라운드 모드에서 엔드패널이 생성되는 위치 확인
  const getEndPanelPositions = () => {
    if (!isSpaceInfoValid || spaceInfo.surroundType !== 'no-surround') return { left: false, right: false, slots: [] };
    
    const modules = placedModules || placedModulesFromStore;
    if (!modules || modules.length === 0) return { left: false, right: false, slots: [] };
    
    // 각 슬롯에서 엔드패널 생성 여부 확인
    const endPanelSlots = [];
    let hasLeftEndPanel = false;
    let hasRightEndPanel = false;
    
    const columnCount = spaceInfo.mainDoorCount || 3;
    
    // 모든 슬롯 확인
    for (let slotIndex = 0; slotIndex < columnCount; slotIndex++) {
      const slotModules = modules.filter(m => m.slotIndex === slotIndex);
      const hasTall = slotModules.some(m => m.category === 'tall-cabinet');
      const hasUpperLower = slotModules.some(m => m.category === 'upper-cabinet' || m.category === 'lower-cabinet');
      
      // 키큰장과 상하부장이 함께 있으면 엔드패널 생성
      if (hasTall && hasUpperLower) {
        endPanelSlots.push(slotIndex);
        
        // 첫 번째 슬롯
        if (slotIndex === 0) {
          hasLeftEndPanel = true;
        }
        // 마지막 슬롯
        if (slotIndex === columnCount - 1) {
          hasRightEndPanel = true;
        }
      }
    }
    
    console.log('🔍 엔드패널 생성 위치:', {
      노서라운드모드: spaceInfo.surroundType === 'no-surround',
      설치타입: spaceInfo.installType,
      엔드패널슬롯: endPanelSlots,
      왼쪽엔드패널: hasLeftEndPanel,
      오른쪽엔드패널: hasRightEndPanel,
      전체슬롯수: columnCount
    });
    
    return { 
      left: hasLeftEndPanel, 
      right: hasRightEndPanel,
      slots: endPanelSlots
    };
  };
  
  const endPanelPositions = getEndPanelPositions();
  
  // 노서라운드 모드에서 각 끝에 가구가 있는지 확인
  const indexingForCheck = calculateSpaceIndexing(spaceInfo);
  const lastSlotIndex = indexingForCheck.columnCount - 1;
  
  // Zone별 왼쪽/오른쪽 가구 감지 (단내림 대응)
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
  const droppedPosition = spaceInfo.droppedCeiling?.position;

  // 공간의 왼쪽 끝(X축 음수 방향)에 가구가 있는지 체크
  const hasLeftFurniture = spaceInfo.surroundType === 'no-surround' &&
    placedModulesFromStore.some(module => {
      const isDual = module.isDualSlot || module.moduleId.includes('dual-');
      let isAtLeftEdge = false;

      if (hasDroppedCeiling) {
        const droppedZone = indexingForCheck.zones?.dropped;
        const normalZone = indexingForCheck.zones?.normal;

        if (droppedPosition === 'left') {
          // 단내림이 왼쪽에 있음 → 공간 왼쪽 끝 = dropped zone의 왼쪽 끝
          if (module.zone === 'dropped' && droppedZone) {
            const droppedFirstSlot = droppedZone.startSlotIndex ?? 0;
            isAtLeftEdge = module.slotIndex === droppedFirstSlot || (isDual && module.slotIndex === droppedFirstSlot + 1);
          }
        } else {
          // 단내림이 오른쪽에 있음 → 공간 왼쪽 끝 = normal zone의 왼쪽 끝
          if (module.zone === 'normal' || !module.zone) {
            isAtLeftEdge = module.slotIndex === 0 || (isDual && module.slotIndex === 1);
          }
        }
      } else {
        // 단내림 없음 → 공간 왼쪽 끝 = 슬롯 0
        isAtLeftEdge = module.slotIndex === 0 || (isDual && module.slotIndex === 1);
      }

      if (isAtLeftEdge) {
        console.log('🟢 공간 왼쪽 끝 가구 감지:', {
          slotIndex: module.slotIndex,
          zone: module.zone,
          isDualSlot: module.isDualSlot,
          isDual,
          moduleId: module.moduleId,
          droppedPosition
        });
      }
      return isAtLeftEdge;
    });

  // 공간의 오른쪽 끝(X축 양수 방향)에 가구가 있는지 체크
  const hasRightFurniture = spaceInfo.surroundType === 'no-surround' &&
    placedModulesFromStore.some(module => {
      const isDual = module.isDualSlot || module.moduleId.includes('dual-');
      let isAtRightEdge = false;

      if (hasDroppedCeiling) {
        const droppedZone = indexingForCheck.zones?.dropped;
        const normalZone = indexingForCheck.zones?.normal;

        if (droppedPosition === 'right') {
          // 단내림이 오른쪽에 있음 → 공간 오른쪽 끝 = dropped zone의 오른쪽 끝
          if (module.zone === 'dropped' && droppedZone) {
            const droppedLastSlot = (droppedZone.startSlotIndex ?? 0) + droppedZone.columnCount - 1;
            isAtRightEdge = module.slotIndex === droppedLastSlot || (isDual && module.slotIndex === droppedLastSlot - 1);
          }
        } else {
          // 단내림이 왼쪽에 있음 → 공간 오른쪽 끝 = normal zone의 오른쪽 끝
          if ((module.zone === 'normal' || !module.zone) && normalZone) {
            const normalLastSlot = normalZone.columnCount - 1;
            isAtRightEdge = module.slotIndex === normalLastSlot || (isDual && module.slotIndex === normalLastSlot - 1);
          }
        }
      } else {
        // 단내림 없음 → 공간 오른쪽 끝 = 마지막 슬롯
        isAtRightEdge = module.slotIndex === lastSlotIndex || (isDual && module.slotIndex === indexingForCheck.columnCount - 2);
      }

      if (isAtRightEdge) {
        console.log('🔴 공간 오른쪽 끝 가구 감지:', {
          slotIndex: module.slotIndex,
          zone: module.zone,
          isDualSlot: module.isDualSlot,
          isDual,
          moduleId: module.moduleId,
          lastSlotIndex,
          columnCount: indexingForCheck.columnCount,
          droppedPosition
        });
      }
      return isAtRightEdge;
    });

  // 단내림 구간의 가구 배치 여부 체크
  const hasDroppedZoneFurniture = spaceInfo.droppedCeiling?.enabled && spaceInfo.surroundType === 'no-surround' &&
    placedModulesFromStore.some(module => module.zone === 'dropped');
  
  const indexingDebug = calculateSpaceIndexing(spaceInfo);
  
  // 모든 가구에 대해 디버깅
  placedModulesFromStore.forEach(module => {
    const isDual = module.isDualSlot || module.moduleId.includes('dual-');
    console.log('📦 가구 정보:', {
      moduleId: module.moduleId,
      slotIndex: module.slotIndex,
      isDualSlot: module.isDualSlot,
      isDual,
      '듀얼판단근거': module.isDualSlot ? 'isDualSlot속성' : (module.moduleId.includes('dual-') ? 'moduleId에dual포함' : '싱글'),
      '차지하는슬롯': isDual ? [module.slotIndex, module.slotIndex + 1] : [module.slotIndex],
      '왼쪽끝인가': module.slotIndex === 0 || (isDual && module.slotIndex === 1),
      '오른쪽끝인가': module.slotIndex === lastSlotIndex || (isDual && module.slotIndex === indexingDebug.columnCount - 2),
      lastSlotIndex,
      columnCount: indexingDebug.columnCount
    });
  });
  
  console.log('🔍 Room - 엔드패널 렌더링 최종 결과:', {
    surroundType: spaceInfo.surroundType,
    placedModulesCount: placedModulesFromStore.length,
    hasLeftFurniture,
    hasRightFurniture,
    columnCount: indexingDebug.columnCount,
    lastSlotIndex,
    installType: spaceInfo.installType,
    wallConfig: spaceInfo.wallConfig,
    '오른쪽듀얼체크': placedModulesFromStore.filter(m => {
      const isDual = m.isDualSlot || m.moduleId?.includes('dual-');
      return isDual && m.slotIndex === indexingDebug.columnCount - 2;
    }).map(m => ({
      moduleId: m.moduleId,
      slotIndex: m.slotIndex,
      isDualSlot: m.isDualSlot
    }))
  });
  
  // spaceInfo 변경 시 재계산되도록 메모이제이션
  const dimensions = useMemo(() => {
    // spaceInfo가 유효하지 않으면 기본값 반환
    if (!isSpaceInfoValid) {
      return {
        width: 0, height: 0, panelDepth: 0, furnitureDepth: 0,
        floorFinishHeight: 0, frameThickness: { left: 0, right: 0 },
        baseFrame: 0, topBottomFrameHeight: 0, baseFrameHeight: 0
      };
    }
    console.log('🔍 Room Component - spaceInfo:', {
      roomId,
      surroundType: spaceInfo.surroundType,
      installType: spaceInfo.installType,
      frameSize: spaceInfo.frameSize,
      showFrame,
      'showFrame prop value': showFrame,
      timestamp: new Date().toISOString()
    });
    const { width: widthMm, height: heightMm } = calculateRoomDimensions(spaceInfo);
    const floorFinishHeightMm = calculateFloorFinishHeight(spaceInfo);
    const panelDepthMm = calculatePanelDepth(spaceInfo); // 사용자 설정 깊이 사용
    const furnitureDepthMm = calculateFurnitureDepth(placedModules, spaceInfo); // 가구/프레임용 (동적 계산, 노서라운드 고려)

    console.log('🎯 frameThickness 계산 전 체크:', {
      hasLeftFurniture,
      hasRightFurniture,
      surroundType: spaceInfo.surroundType
    });

    // hasLeftFurniture와 hasRightFurniture는 이미 단내림을 고려하여 계산됨 (line 360, 400)
    const frameThicknessMm = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
    console.log('🔥 calculateDimensionsAndFrames 내부 - frameThicknessMm 계산 직후:', {
      frameThicknessMm,
      wallConfig: spaceInfo.wallConfig,
      installType: spaceInfo.installType,
      surroundType: spaceInfo.surroundType
    });
    const baseFrameMm = calculateBaseFrameWidth(spaceInfo);
    const topBottomFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
    const baseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);
    
    // 노서라운드 프레임 디버그
    console.log('🔍 Room - 프레임 계산 결과:', {
      surroundType: spaceInfo.surroundType,
      installType: spaceInfo.installType,
      wallConfig: spaceInfo.wallConfig,
      frameThicknessMm,
      topBottomFrameHeightMm,
      baseFrameHeightMm,
      baseFrameMm,
      isNoSurround: spaceInfo.surroundType === 'no-surround',
      isBuiltin: spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in',
      isSemistanding: spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing',
      shouldHideAllFrames: spaceInfo.surroundType === 'no-surround',
      '예상 프레임': spaceInfo.surroundType === 'no-surround' && (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing')
        ? (spaceInfo.wallConfig?.left 
            ? '좌측: 0mm (벽있음), 우측: 18mm (엔드패널)' 
            : '좌측: 18mm (엔드패널), 우측: 0mm (벽있음)')
        : '서라운드 또는 다른 타입'
    });
    
    // mm를 Three.js 단위로 변환
    console.log('🔥 calculateDimensionsAndFrames - 변환 직전:', {
      'frameThicknessMm.left': frameThicknessMm.left,
      'frameThicknessMm.right': frameThicknessMm.right,
      'mmToThreeUnits(frameThicknessMm.left)': mmToThreeUnits(frameThicknessMm.left),
      'mmToThreeUnits(frameThicknessMm.right)': mmToThreeUnits(frameThicknessMm.right)
    });
    return {
      width: mmToThreeUnits(widthMm),
      height: mmToThreeUnits(heightMm),
      panelDepth: mmToThreeUnits(panelDepthMm), // 공간 메쉬용 (1500mm)
      furnitureDepth: mmToThreeUnits(furnitureDepthMm), // 가구/프레임용 (600mm)
      floorFinishHeight: mmToThreeUnits(floorFinishHeightMm),
      frameThickness: {
        left: mmToThreeUnits(frameThicknessMm.left),
        right: mmToThreeUnits(frameThicknessMm.right)
      },
      baseFrame: {
        width: mmToThreeUnits(baseFrameMm.width)
      },
      topBottomFrameHeight: mmToThreeUnits(topBottomFrameHeightMm),
      baseFrameHeight: mmToThreeUnits(baseFrameHeightMm),
      // 원본 mm 값들도 포함 (기존 코드에서 사용하기 위해)
      widthMm,
      heightMm,
      panelDepthMm,
      furnitureDepthMm,
      floorFinishHeightMm,
      frameThicknessMm,
      baseFrameMm,
      topBottomFrameHeightMm,
      baseFrameHeightMm
    };
  }, [isSpaceInfoValid, spaceInfo?.width, spaceInfo?.height, spaceInfo?.depth, spaceInfo?.installType, spaceInfo?.surroundType, spaceInfo?.baseConfig, spaceInfo?.floorFinish, spaceInfo?.frameSize, spaceInfo?.wallConfig, placedModules, placedModulesFromStore]);
  
  const { 
    width, height, panelDepth, furnitureDepth, floorFinishHeight, frameThickness, baseFrame, topBottomFrameHeight, baseFrameHeight,
    // 원본 mm 값들
    widthMm, heightMm, panelDepthMm, furnitureDepthMm, floorFinishHeightMm, frameThicknessMm, baseFrameMm, topBottomFrameHeightMm, baseFrameHeightMm
  } = dimensions;
  
  // 디버깅을 위한 로그
  console.log('🎯 Room - dimensions 디버깅:', {
    frameThicknessMm,
    frameThickness,
    wallConfig: spaceInfo.wallConfig,
    installType: spaceInfo.installType,
    surroundType: spaceInfo.surroundType,
    '계산된_엔드패널': {
      좌측mm: frameThicknessMm.left,
      우측mm: frameThicknessMm.right,
      좌측Three: frameThickness.left,
      우측Three: frameThickness.right
    }
  });
  
  // 기둥 분절 계산을 메모이제이션 (dimensions 정의 이후로 이동)
  const frameSegments = useMemo(() => {
    if (!isSpaceInfoValid) return null;
    const columns = spaceInfo.columns || [];
    const hasDeepColumns = columns.some(column => column.depth >= 730);
    
    if (columns.length === 0 || !hasDeepColumns) {
      return null; // 분절 없음
    }
    
    // 노서라운드일 때는 엔드패널 안쪽 범위 사용
    let frameWidth, frameX;
    if (spaceInfo.surroundType === 'no-surround') {
      const indexing = calculateSpaceIndexing(spaceInfo, placedModulesFromStore?.length > 0);
      const { threeUnitBoundaries } = indexing;
      const slotStartX = threeUnitBoundaries[0];
      const slotEndX = threeUnitBoundaries[threeUnitBoundaries.length - 1];
      
      // 엔드패널 안쪽으로 조정
      const endPanelThickness = mmToThreeUnits(END_PANEL_THICKNESS); // 18mm
      let adjustedStartX = slotStartX;
      let adjustedEndX = slotEndX;
      
      if (spaceInfo.installType === 'freestanding') {
        // 벽없음: 양쪽 엔드패널 안쪽으로
        adjustedStartX = slotStartX + endPanelThickness;
        adjustedEndX = slotEndX - endPanelThickness;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        // 벽1개: 벽이 없는 쪽만 조정
        if (spaceInfo.wallConfig?.left) {
          // 왼쪽 벽이 있으면 오른쪽만 조정
          adjustedEndX = slotEndX - endPanelThickness;
        } else if (spaceInfo.wallConfig?.right) {
          // 오른쪽 벽이 있으면 왼쪽만 조정
          adjustedStartX = slotStartX + endPanelThickness;
        }
      }
      // builtin은 양쪽 벽이 있으므로 조정 불필요
      
      frameWidth = adjustedEndX - adjustedStartX;
      frameX = (adjustedStartX + adjustedEndX) / 2;
    } else {
      frameWidth = baseFrame.width;
      // xOffset 직접 계산 (-width / 2)
      frameX = (-width / 2) + frameThickness.left + frameWidth / 2;
    }
    
    const segments: Array<{ width: number; x: number }> = [];
    const frameStartX = frameX - frameWidth / 2;
    const frameEndX = frameX + frameWidth / 2;
    
    // 기둥들을 X 위치 기준으로 정렬
    const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);
    
    let currentX = frameStartX;
    
    // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
    sortedColumns.forEach((column) => {
      const columnWidthM = column.width * 0.01;
      const columnLeftX = column.position[0] - columnWidthM / 2;
      const columnRightX = column.position[0] + columnWidthM / 2;
      
      if (columnLeftX < frameEndX && columnRightX > frameStartX && column.depth >= 730) {
        const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
        if (leftSegmentWidth > 0) {
          segments.push({
            width: leftSegmentWidth,
            x: currentX + leftSegmentWidth / 2
          });
        }
        currentX = columnRightX;
      }
    });
    
    // 마지막 세그먼트
    const lastSegmentWidth = Math.max(0, frameEndX - currentX);
    if (lastSegmentWidth > 0) {
      segments.push({
        width: lastSegmentWidth,
        x: currentX + lastSegmentWidth / 2
      });
    }
    
    return segments.length > 0 ? segments : null;
  }, [isSpaceInfoValid, spaceInfo?.columns, spaceInfo?.surroundType, spaceInfo?.width, spaceInfo?.gapConfig?.left, spaceInfo?.gapConfig?.right, baseFrame.width, frameThickness.left, width]);

  
  // 공통 프레임 재질 생성 함수 (도어와 동일한 재질로 통일)
  const createFrameMaterial = useCallback((frameType?: 'left' | 'right' | 'top' | 'base') => {
    // 2D 모드에서 모든 프레임(상부/하부/좌우)을 형광 녹색으로 직접 반환
    const isNeonFrame = viewMode === '2D' && (frameType === 'top' || frameType === 'base' || frameType === 'left' || frameType === 'right');
    if (isNeonFrame) {
      console.log(`✅ 2D 모드 프레임에 형광 녹색 MeshBasicMaterial 적용:`, frameType);
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color('#18CF23'),
        transparent: true,
        opacity: 1.0,
        depthTest: true,
        depthWrite: true
      });
    }

    // 2D 다크모드에서는 더 밝은 색상 사용
    const defaultColor = (viewMode === '2D' && view2DTheme === 'dark') ? '#F0F0F0' : '#E0E0E0';

    let frameColor = materialConfig?.frameColor || defaultColor;
    let baseFrameTransparent = false;

    const isHighlighted = frameType && highlightedFrame === frameType;

    console.log(`🎨 Creating frame material for ${frameType}:`, {
      frameType,
      frameColor,
      doorTexture: materialConfig?.doorTexture,
      isHighlighted,
      viewMode,
      view2DTheme
    });
    
    // 테마 색상 매핑
    const themeColorMap: Record<string, string> = {
      green: '#10b981',
      blue: '#3b82f6',
      purple: '#8b5cf6',
      vivid: '#a25378',
      red: '#D2042D',
      pink: '#ec4899',
      indigo: '#6366f1',
      teal: '#14b8a6',
      yellow: '#eab308',
      gray: '#6b7280',
      cyan: '#06b6d4',
      lime: '#84cc16',
      black: '#1a1a1a',
      wine: '#845EC2',
      gold: '#d97706',
      navy: '#1e3a8a',
      emerald: '#059669',
      violet: '#C128D7',
      mint: '#0CBA80',
      neon: '#18CF23',
      rust: '#FF7438',
      white: '#D65DB1',
      plum: '#790963',
      brown: '#5A2B1D',
      darkgray: '#2C3844',
      maroon: '#3F0D0D',
      turquoise: '#003A7A',
      slate: '#2E3A47',
      copper: '#AD4F34',
      forest: '#1B3924',
      olive: '#4C462C'
    };

    // 프레임 강조 색상은 붉은색으로 고정
    const highlightColor = '#ff3333';
    const highlightEmissive = 0xff3333 >> 1; // 붉은색의 절반 밝기로 자체발광
    const highlightOpacity = renderMode === 'wireframe' ? 0.6 : 0.6;
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isHighlighted ? highlightColor : frameColor), // 강조 시 색상 변경
      metalness: 0.0,        // 완전 비금속 (도어와 동일)
      roughness: 0.6,        // 도어와 동일한 거칠기
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(isHighlighted ? highlightEmissive : 0x000000),  // 강조 시 자체발광 추가
      emissiveIntensity: isHighlighted ? 1.0 : 0.0, // 강조 시 발광 강도
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isHighlighted || baseFrameTransparent,  // 강조 시에도 투명하게
      opacity: baseFrameTransparent ? 0 : renderMode === 'wireframe' ? (isHighlighted ? highlightOpacity : 0.3) : (viewMode === '2D' && renderMode === 'solid') ? 0.8 : isHighlighted ? 0.6 : 1.0,  // 2D 탑뷰에서 바닥프레임은 완전 투명
    });

    // 프레임 텍스처 적용 (frameTexture만 사용)
    const frameTextureUrl = materialConfig?.frameTexture;
    const shouldApplyTexture = !isHighlighted &&
                                frameTextureUrl &&
                                !(viewMode === '2D' && (frameType === 'top' || frameType === 'base'));

    if (shouldApplyTexture) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isOakTexture(frameTextureUrl)) {
        applyOakTextureSettings(material);
      } else if (isCabinetTexture1(frameTextureUrl)) {
        console.log('🔧 프레임 Cabinet Texture1 즉시 어둡게 적용 중...');
        applyCabinetTexture1Settings(material);
        console.log('✅ 프레임 Cabinet Texture1 즉시 색상 적용 완료 (공통 설정 사용)');
      }

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        frameTextureUrl,
        (texture) => {
          console.log('🔧 프레임 텍스처 로딩 성공:', frameTextureUrl);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);

          // Oak 텍스처인 경우: 좌우 프레임은 세로 결, 상하 프레임은 가로 결 (90도 회전)
          if (isOakTexture(frameTextureUrl)) {
            const isVerticalFrame = frameType === 'left' || frameType === 'right';
            if (!isVerticalFrame) {
              // 상하 프레임(top/base)만 90도 회전
              texture.rotation = Math.PI / 2;
              texture.center.set(0.5, 0.5);
            }
            applyOakTextureSettings(material);
          }
          // Cabinet Texture1인 경우 설정 적용
          else if (isCabinetTexture1(frameTextureUrl)) {
            applyCabinetTexture1Settings(material);
          }
          // 그 외 텍스처는 기본 설정
          else {
            material.color.setHex(0xffffff); // 기본 흰색
            material.toneMapped = true; // 기본 톤 매핑 활성화
            material.roughness = 0.6; // 기본 거칠기
          }

          material.map = texture;
          material.needsUpdate = true;
        },
        undefined,
        (error) => {
          console.error('❌ 프레임 텍스처 로딩 실패:', frameTextureUrl, error);
        }
      );
    }
    
    return material;
  }, [materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, renderMode, viewMode, view2DTheme, highlightedFrame, spaceInfo.frameSize, spaceInfo.baseConfig, appTheme.color]);

  const columnsDeps = JSON.stringify(spaceInfo.columns ?? []);

  // useEffect+useState로 material을 관리
  const [baseFrameMaterial, setBaseFrameMaterial] = useState<THREE.Material>();
  const [leftFrameMaterial, setLeftFrameMaterial] = useState<THREE.Material>();
  const [leftSubFrameMaterial, setLeftSubFrameMaterial] = useState<THREE.Material>();
  const [rightFrameMaterial, setRightFrameMaterial] = useState<THREE.Material>();
  const [rightSubFrameMaterial, setRightSubFrameMaterial] = useState<THREE.Material>();
  const [topFrameMaterial, setTopFrameMaterial] = useState<THREE.Material>();
  const [topSubFrameMaterial, setTopSubFrameMaterial] = useState<THREE.Material>();
  // const [baseSubFrameMaterial, setBaseSubFrameMaterial] = useState<THREE.Material>(); // 하단 서브프레임 제거됨

  useEffect(() => {
    const mat = createFrameMaterial('base');
    setBaseFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('left');
    setLeftFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('left');
    setLeftSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('right');
    setRightFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('right');
    setRightSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('top');
    setTopFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('top');
    setTopSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, materialConfig?.frameColor, materialConfig?.frameTexture, highlightedFrame]);
  // 하단 서브프레임 제거됨
  // useEffect(() => {
  //   const mat = createFrameMaterial('base');
  //   setBaseSubFrameMaterial(mat);
  //   return () => mat.dispose();
  // }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  
  // MaterialFactory를 사용한 재질 생성 (자동 캐싱으로 성능 최적화)
  const frontToBackGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  const horizontalGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  const leftHorizontalGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  
  // 3D orthographic 모드용 벽 재질 생성 (refs와 함께 사용)
  const leftWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('horizontal', viewMode), [viewMode]);
  const rightWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse', viewMode), [viewMode]);
  const topWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('vertical-reverse', viewMode), [viewMode]);
  const droppedWallMaterial = useMemo(() => MaterialFactory.createShaderGradientWallMaterial('horizontal', viewMode), [viewMode]);
  
  // 단내림 벽을 위한 불투명 material
  const opaqueLeftWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
  }, []);

  const opaqueRightWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
  }, []);

  // 단내림 천장을 위한 불투명 material (그라데이션 유지, 투명도 제거)
  const opaqueTopWallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('vertical-reverse', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
  }, []);
  

  
  // 3D 룸 중앙 정렬을 위한 오프셋 계산
  const xOffset = -width / 2; // 가로 중앙 (전체 폭의 절반을 왼쪽으로)
  const yOffset = 0; // 바닥 기준
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙 (앞뒤 대칭)
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 가구/프레임용 깊이: 뒷벽에서 600mm만 나오도록
  
  // 전체 그룹을 z축 방향으로 약간 조정 (앞으로 당겨서 중앙에 오도록)
  const groupZOffset = 0; // 필요에 따라 조정 가능 (양수: 앞으로, 음수: 뒤로)
  
  // 공간 메쉬 확장 깊이 (300mm = 3 Three.js units)
  const extensionDepth = mmToThreeUnits(300);
  const extendedPanelDepth = panelDepth + extensionDepth;
  // 뒷쪽은 고정하고 앞쪽으로만 확장 (기존 zOffset 사용)
  const extendedZOffset = zOffset;
  
  // 상단/하단 패널의 너비 (좌우 프레임 사이의 공간)
  const topBottomPanelWidth = baseFrame.width;
  
  // 최종적으로 사용할 패널 너비 (baseFrame.width가 이미 이격거리를 고려하여 계산됨)
  const finalPanelWidth = baseFrame.width;
  
  // 패널 X 좌표 계산 (노서라운드일 때는 이격거리를 고려한 정확한 중앙 정렬)
  const topBottomPanelX = spaceInfo.surroundType === 'no-surround' 
    ? 0 // 노서라운드 모드에서는 정확히 중앙(원점)에 배치
    : xOffset + frameThickness.left + topBottomPanelWidth / 2;

  // 바닥재료가 있을 때 좌우 패널의 시작 Y 위치와 높이 조정
  const panelStartY = spaceInfo.hasFloorFinish && floorFinishHeight > 0 ? floorFinishHeight : 0;
  
  // 띄워서 배치일 때 높이 조정
  const floatHeight = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float' 
    ? mmToThreeUnits(spaceInfo.baseConfig.floatHeight || 0) 
    : 0;
  
  // 좌우 프레임 높이 (띄워서 배치일 때 줄어듦)
  const adjustedPanelHeight = height - floatHeight;
  console.log('🔍 adjustedPanelHeight 계산:', { height, floatHeight, adjustedPanelHeight, baseConfig: spaceInfo.baseConfig });
  
  // 상단 요소들의 Y 위치 (띄워서 배치일 때 위로 이동)
  const topElementsY = panelStartY + height - topBottomFrameHeight/2;
  
  // 좌우 프레임의 시작 Y 위치 (띄워서 배치일 때 위로 이동)
  const sideFrameStartY = panelStartY + floatHeight;
  const sideFrameCenterY = sideFrameStartY + adjustedPanelHeight/2;

  // 벽 여부 확인
  const { wallConfig = { left: true, right: true } } = spaceInfo;
  console.log('🏠 Room - 노서라운드 프레임 체크:', {
    installType: spaceInfo.installType,
    surroundType: spaceInfo.surroundType,
    isNoSurround: spaceInfo.surroundType === 'no-surround',
    isBuiltin: spaceInfo.installType === 'builtin',
    isSemistanding: spaceInfo.installType === 'semistanding',
    wallConfig,
    frameThicknessMm,
    frameThickness,
    leftPanel: frameThickness.left > 0 ? `${frameThicknessMm.left}mm` : 'none',
    rightPanel: frameThickness.right > 0 ? `${frameThicknessMm.right}mm` : 'none',
    shouldHaveEndPanelLeft: spaceInfo.surroundType === 'no-surround' && spaceInfo.installType === 'semistanding' && !wallConfig?.left,
    shouldHaveEndPanelRight: spaceInfo.surroundType === 'no-surround' && spaceInfo.installType === 'semistanding' && !wallConfig?.right
  });
  
  // 내부 공간 계산 (세로 가이드 선 위치 확인용)
  const internalSpace = calculateInternalSpace(spaceInfo);
  // backZ는 가구가 배치되는 공간의 뒷면 (가구 뒷면이 닿는 위치)
  const backZ = furnitureZOffset - furnitureDepth/2; // 가구 뒷면 위치
  // 공간의 실제 뒷벽 위치 (노서라운드 엔드패널이 시작하는 위치)
  const spaceBackWallZ = zOffset - panelDepth/2; // 공간 뒷벽 Z 위치 (가장 뒤)
  
  // SlotDropZonesSimple과 동일한 방식으로 계산
  const roomBackZ = -panelDepth / 2; // 공간 중심 기준 뒷면
  const frameEndZ = furnitureZOffset + furnitureDepth/2; // 좌우 프레임의 앞쪽 끝
  const slotFloorDepth = frameEndZ - roomBackZ - mmToThreeUnits(20); // 슬롯 깊이 (730mm)
  
  // 서라운드 엔드패널: 슬롯 깊이 + 20mm (슬롯은 20mm 줄어들어 있으므로)
  const surroundEndPanelDepth = slotFloorDepth + mmToThreeUnits(20);
  // 서라운드 엔드패널 중심 Z 위치
  const surroundEndPanelZ = roomBackZ + surroundEndPanelDepth/2 + mmToThreeUnits(2); // 서브프레임과 맞닿도록 2mm 앞으로
  
  // 노서라운드 엔드패널: 슬롯 깊이와 동일 (730mm)
  const noSurroundEndPanelDepth = slotFloorDepth;
  // 노서라운드 엔드패널 중심 Z 위치
  const noSurroundEndPanelZ = roomBackZ + noSurroundEndPanelDepth/2;
  
  // 디버그용 - 엔드패널 깊이 차이 확인
  if (spaceInfo.installType === 'freestanding' || 
      (spaceInfo.installType === 'semistanding' && (!wallConfig?.left || !wallConfig?.right))) {
    console.log('🔍 노서라운드 엔드패널 계산:', {
      가구깊이mm: furnitureDepthMm,
      공간깊이mm: panelDepthMm,
      roomBackZ,
      frameEndZ,
      slotFloorDepth,
      slotFloorDepth_mm: slotFloorDepth / 0.01,
      surroundEndPanelDepth_mm: surroundEndPanelDepth / 0.01,
      noSurroundEndPanelDepth_mm: noSurroundEndPanelDepth / 0.01,
      surroundEndPanelZ,
      noSurroundEndPanelZ,
      끝점: frameEndZ - mmToThreeUnits(20),
      가구와공간뒷벽차이: (spaceBackWallZ - backZ) / 0.01
    });
  }

  // 한쪽벽모드 엔드패널/프레임 개수 카운팅
  const endPanelCount = {
    left: frameThickness.left > 0 && !wallConfig?.left ? 1 : 0,
    right: frameThickness.right > 0 && !wallConfig?.right ? 1 : 0,
    leftFrame: frameThickness.left > 0 && wallConfig?.left ? 1 : 0,
    rightFrame: frameThickness.right > 0 && wallConfig?.right ? 1 : 0
  };
  
  // 실제 렌더링 카운터 초기화 (매 렌더링마다 리셋)
  if (typeof window !== 'undefined') {
    if (!window.renderCounter) {
      window.renderCounter = { leftEndPanel: 0, rightEndPanel: 0, leftFrame: 0, rightFrame: 0 };
    }
    // 매 렌더링 시작 시 카운터 리셋
    window.renderCounter = { leftEndPanel: 0, rightEndPanel: 0, leftFrame: 0, rightFrame: 0 };
  }
  
  const logData = {
    installType: spaceInfo.installType,
    surroundType: spaceInfo.surroundType,
    wallConfig,
    frameThicknessMm,
    '엔드패널개수': {
      왼쪽: endPanelCount.left,
      오른쪽: endPanelCount.right,
      총개수: endPanelCount.left + endPanelCount.right
    },
    '프레임개수': {
      왼쪽: endPanelCount.leftFrame,
      오른쪽: endPanelCount.rightFrame,
      총개수: endPanelCount.leftFrame + endPanelCount.rightFrame
    },
    '총합': endPanelCount.left + endPanelCount.right + endPanelCount.leftFrame + endPanelCount.rightFrame
  };
  
  console.log('🎯🎯🎯 [한쪽벽모드 총괄] 엔드패널/프레임 생성 개수:', logData);
  
  // 창 제목에도 표시 (디버그용) - useEffect로 렌더링 후 업데이트
  React.useEffect(() => {
    if (typeof window !== 'undefined' && spaceInfo.installType === 'semistanding') {
      setTimeout(() => {
        const actual = window.renderCounter || { leftEndPanel: 0, rightEndPanel: 0, leftFrame: 0, rightFrame: 0 };
        const title = `예상: 엔드L${endPanelCount.left}R${endPanelCount.right} 프레임L${endPanelCount.leftFrame}R${endPanelCount.rightFrame} | 실제: 엔드L${actual.leftEndPanel}R${actual.rightEndPanel} 프레임L${actual.leftFrame}R${actual.rightFrame}`;
        document.title = title;
        
        if (actual.leftEndPanel > 1 || actual.rightEndPanel > 1) {
          console.error('🚨🚨🚨 중복 렌더링 감지!', {
            왼쪽엔드패널: actual.leftEndPanel,
            오른쪽엔드패널: actual.rightEndPanel,
            왼쪽프레임: actual.leftFrame, 
            오른쪽프레임: actual.rightFrame
          });
        }
      }, 100);
    }
  }, [spaceInfo?.installType, endPanelCount.left, endPanelCount.right, endPanelCount.leftFrame, endPanelCount.rightFrame]);

  // spaceInfo가 유효하지 않으면 null 반환 (모든 훅 호출 후)
  if (!isSpaceInfoValid) {
    return null;
  }

  return (
    <group position={[0, 0, groupZOffset]}>
      {/* 주변 벽면들 - ShaderMaterial 기반 그라데이션 (3D perspective 모드에서만 표시) */}
      {console.log('🔍 Room viewMode 체크:', viewMode, typeof viewMode)}
      {viewMode !== '2D' && cameraMode === 'perspective' && (
        <>
          {/* 왼쪽 외부 벽면 - 단내림 고려 */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 왼쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {/* 3D orthographic 모드에서 카메라 각도에 따라 숨김 */}
          {console.log('🔍 왼쪽 벽 installType 체크:', {
            installType: spaceInfo.installType,
            wallConfig,
            wallConfigLeft: wallConfig?.left,
            condition: (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
              (spaceInfo.installType === 'semistanding' && wallConfig?.left))
          })}
          {/* 2D 측면뷰(좌/우)에서는 좌우벽 숨김 */}
          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
            (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
            (spaceInfo.installType === 'semistanding' && wallConfig?.left)) && (() => {
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
            const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
            const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
              ? spaceInfo.droppedCeiling.dropHeight || 200
              : 0;
            const droppedCeilingHeight = mmToThreeUnits(dropHeight);
            
            console.log('🔍 왼쪽 벽 단내림 조건 체크:', {
              'spaceInfo.droppedCeiling': spaceInfo.droppedCeiling,
              hasDroppedCeiling,
              isLeftDropped,
              dropHeight,
              condition: hasDroppedCeiling && isLeftDropped,
              'spaceInfo.height': spaceInfo.height,
              'droppedHeight(mm)': spaceInfo.height - dropHeight,
              'height(Three.js)': height / 0.01,
              'droppedHeight(Three.js)': (spaceInfo.height - dropHeight) * 0.01
            });
            
            // 왼쪽이 단내림 영역인 경우 하나의 벽으로 렌더링
            if (hasDroppedCeiling && isLeftDropped) {
              // 단내림 벽 높이 = 전체 높이 - 단내림 높이차 (바닥부터 시작)
              const droppedWallHeight = height - droppedCeilingHeight;
              const droppedCenterY = panelStartY + droppedWallHeight/2;
              
              console.log('🔴 왼쪽 단내림 벽 렌더링:', {
                '전체 높이': height / 0.01,
                '단내림 높이차': droppedCeilingHeight / 0.01,
                '단내림 벽 높이': droppedWallHeight / 0.01,
                'panelStartY': panelStartY,
                'droppedCenterY': droppedCenterY
              });
              
              return (
                <mesh
                  position={[-width/2 - 0.01, droppedCenterY, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[0, Math.PI / 2, 0]}
                  renderOrder={1}
                >
                  <planeGeometry args={[extendedPanelDepth, droppedWallHeight]} />
                  <primitive object={opaqueLeftWallMaterial} />
                </mesh>
              );
            }
            
            // 단내림이 없거나 오른쪽 단내림인 경우 기존 렌더링
            if (!hasDroppedCeiling || !isLeftDropped) {
              return (
              <mesh
                position={[-width/2 - 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
                rotation={[0, Math.PI / 2, 0]}
                renderOrder={-1}
              >
                <planeGeometry args={[extendedPanelDepth, height]} />
                <primitive 
                  ref={leftWallMaterialRef}
                  object={leftWallMaterial} />
              </mesh>
              );
            }
            
            return null;
          })()}
          
          {/* 오른쪽 외부 벽면 - 단내림 고려 */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 오른쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {/* 3D orthographic 모드에서 카메라 각도에 따라 숨김 */}
          {/* 2D 측면뷰(좌/우)에서는 좌우벽 숨김 */}
          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
            (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
            (spaceInfo.installType === 'semistanding' && wallConfig?.right)) && (() => {
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
            const isRightDropped = spaceInfo.droppedCeiling?.position === 'right';
            const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
              ? spaceInfo.droppedCeiling.dropHeight || 200
              : 0;
            const droppedCeilingHeight = mmToThreeUnits(dropHeight);
            
            console.log('🔍 오른쪽 벽 단내림 조건 체크:', {
              'spaceInfo.droppedCeiling': spaceInfo.droppedCeiling,
              hasDroppedCeiling,
              isRightDropped,
              dropHeight,
              condition: hasDroppedCeiling && isRightDropped,
              viewMode,
              '벽 렌더링 조건': (viewMode === '3D' || viewMode === '3d')
            });
            
            // 오른쪽이 단내림 영역인 경우 하나의 벽으로 렌더링
            if (hasDroppedCeiling && isRightDropped) {
              // 단내림 벽 높이 = 전체 높이 - 단내림 높이차 (바닥부터 시작)
              const droppedWallHeight = height - droppedCeilingHeight;
              const droppedCenterY = panelStartY + droppedWallHeight/2;
              
              console.log('🔵 오른쪽 단내림 벽 렌더링:', {
                '전체 높이': height / 0.01,
                '단내림 높이차': droppedCeilingHeight / 0.01,
                '단내림 벽 높이': droppedWallHeight / 0.01,
                'panelStartY': panelStartY,
                'droppedCenterY': droppedCenterY
              });
              
              return (
                <mesh
                  position={[width/2 + 0.01, droppedCenterY, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[0, -Math.PI / 2, 0]}
                  renderOrder={1}
                >
                  <planeGeometry args={[extendedPanelDepth, droppedWallHeight]} />
                  <primitive object={opaqueRightWallMaterial} />
                </mesh>
              );
            }
            
            // 단내림이 없거나 왼쪽에 있는 경우 전체 높이로 렌더링
            if (!hasDroppedCeiling || !isRightDropped) {
              return (
              <mesh
                position={[width/2 + 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
                rotation={[0, -Math.PI / 2, 0]}
                renderOrder={-1}
              >
                <planeGeometry args={[extendedPanelDepth, height]} />
                <primitive 
                  ref={rightWallMaterialRef}
                  object={rightWallMaterial} />
              </mesh>
              );
            }
            
            return null;
          })()}
          
          {/* 상단 외부 벽면 (천장) - 단내림이 있는 경우 분할 - 탑뷰에서는 숨김 */}
          {/* 3D orthographic 모드에서 카메라 각도에 따라 숨김 */}
          {viewMode !== '2D' && (() => {
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
            const droppedWidth = hasDroppedCeiling && spaceInfo.droppedCeiling 
              ? mmToThreeUnits(spaceInfo.droppedCeiling.width || 900)
              : 0;
            const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
            const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
              ? spaceInfo.droppedCeiling.dropHeight || 200
              : 0;
            const droppedCeilingHeight = mmToThreeUnits(dropHeight);
            
            if (!hasDroppedCeiling) {
              // 단내림이 없는 경우 기존처럼 전체 천장 렌더링
              return (
                <mesh
                  position={[xOffset + width/2, panelStartY + height + 0.001, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[width, extendedPanelDepth]} />
                  <primitive 
                    ref={topWallMaterialRef}
                    object={topWallMaterial} />
                </mesh>
              );
            }
            
            // 천장은 프레임 영역을 포함한 전체 너비로 렌더링
            // 단내림이 있는 경우 천장을 두 영역으로 분할
            
            // 좌우 공간 축소값 계산 (프레임 또는 이격거리/엔드패널)
            let leftReduction = 0;
            let rightReduction = 0;
            
            if (spaceInfo.surroundType === 'surround') {
              const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
              leftReduction = frameThickness.left;
              rightReduction = frameThickness.right;
            } else {
              // 노서라운드: 이격거리 또는 엔드패널
              if (spaceInfo.installType === 'builtin') {
                leftReduction = 2;
                rightReduction = 2;
              } else if (spaceInfo.installType === 'semistanding') {
                // 한쪽벽 모드: gapConfig의 값을 사용
                leftReduction = spaceInfo.gapConfig?.left || 0;
                rightReduction = spaceInfo.gapConfig?.right || 0;
              } else {
                leftReduction = 20;
                rightReduction = 20;
              }
            }
            
            let droppedAreaWidth: number;
            let normalAreaWidth: number;
            
            if (isLeftDropped) {
              // 왼쪽 단내림: 천장은 전체 너비 사용
              droppedAreaWidth = droppedWidth;
              normalAreaWidth = width - droppedWidth;
            } else {
              // 오른쪽 단내림: 천장은 전체 너비 사용
              normalAreaWidth = width - droppedWidth;
              droppedAreaWidth = droppedWidth;
            }
            
            // 단내림 영역의 X 위치 계산
            const droppedAreaX = isLeftDropped
              ? xOffset + droppedAreaWidth/2
              : xOffset + normalAreaWidth + droppedAreaWidth/2;
            
            // 일반 영역의 X 위치 계산
            const normalAreaX = isLeftDropped
              ? xOffset + droppedAreaWidth + normalAreaWidth/2
              : xOffset + normalAreaWidth/2;
            
            console.log('🔥 천장 분할 계산:', {
              hasDroppedCeiling,
              surroundType: spaceInfo.surroundType,
              installType: spaceInfo.installType,
              wallConfig: spaceInfo.wallConfig,
              leftReduction,
              rightReduction,
              droppedWidth: droppedWidth / 0.01,
              droppedAreaWidth: droppedAreaWidth / 0.01,
              normalAreaWidth: normalAreaWidth / 0.01,
              droppedAreaX,
              normalAreaX,
              droppedCeilingHeight: droppedCeilingHeight / 0.01,
              totalWidth: width / 0.01,
              calculatedTotal: (droppedAreaWidth + normalAreaWidth + mmToThreeUnits(leftReduction) + mmToThreeUnits(rightReduction)) / 0.01,
              '일반 천장 Y좌표(mm)': (panelStartY + height) / 0.01,
              '단내림 천장 Y좌표(mm)': (panelStartY + height - droppedCeilingHeight) / 0.01,
              '천장 높이 차이(mm)': droppedCeilingHeight / 0.01,
              '200mm 분절 확인': droppedCeilingHeight / 0.01 === 200 ? '✅' : '❌'
            });
            
            return (
              <>
                {/* 단내림 영역 천장 (낮은 높이) - 불투명 그라데이션 */}
                <mesh
                  position={[droppedAreaX, panelStartY + height - droppedCeilingHeight + 0.001, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[Math.PI / 2, 0, 0]}
                  renderOrder={-1}
                >
                  <planeGeometry args={[droppedAreaWidth, extendedPanelDepth]} />
                  <primitive
                    object={opaqueTopWallMaterial} />
                </mesh>
                
                {/* 일반 영역 천장 (원래 높이) */}
                <mesh
                  position={[normalAreaX, panelStartY + height + 0.001, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[Math.PI / 2, 0, 0]}
                  renderOrder={-1}
                >
                  <planeGeometry args={[normalAreaWidth, extendedPanelDepth]} />
                  <primitive 
                    ref={topWallMaterialRef}
                    object={topWallMaterial} />
                </mesh>
                
                {/* 단내림 경계 수직 벽 - 정확한 X 위치 계산 */}
                <mesh
                  renderOrder={-1}
                  position={[
                    (() => {
                      // ColumnIndexer의 계산과 동일하게 처리
                      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

                      const boundaryX = isLeftDropped
                        ? mmToThreeUnits(zoneInfo.normal.startX)
                        : mmToThreeUnits(zoneInfo.dropped.startX);

                      // 단내림 안쪽 내벽을 단내림 바깥쪽으로 3mm 이동
                      const BOUNDARY_OFFSET = 3; // mm

                      console.log('🔥 단내림 경계벽 위치:', {
                        isLeftDropped,
                        '기준 경계 X 위치(mm)': isLeftDropped ? zoneInfo.normal.startX : zoneInfo.dropped.startX,
                        '오프셋(mm)': BOUNDARY_OFFSET,
                        '최종 경계 X 위치(mm)': isLeftDropped
                          ? zoneInfo.normal.startX - BOUNDARY_OFFSET
                          : zoneInfo.dropped.startX + BOUNDARY_OFFSET,
                        '단내림 폭(mm)': spaceInfo.droppedCeiling?.width || 900,
                        droppedCeilingHeight: droppedCeilingHeight / 0.01,
                        '벽 상단 Y': (panelStartY + height) / 0.01,
                        '벽 하단 Y': (panelStartY + height - droppedCeilingHeight) / 0.01,
                        '천장에서 거리(mm)': droppedCeilingHeight / 0.01
                      });

                      if (isLeftDropped) {
                        // 왼쪽 단내림: 단내림 끝 = 메인 시작, 단내림 바깥쪽(왼쪽)으로 3mm 이동
                        return mmToThreeUnits(zoneInfo.normal.startX - BOUNDARY_OFFSET);
                      } else {
                        // 오른쪽 단내림: 메인 끝 = 단내림 시작, 단내림 바깥쪽(오른쪽)으로 3mm 이동
                        return mmToThreeUnits(zoneInfo.dropped.startX + BOUNDARY_OFFSET);
                      }
                    })(),
                    panelStartY + height - droppedCeilingHeight/2,
                    extendedZOffset + extendedPanelDepth/2  // 천장면과 동일한 Z 위치 사용
                  ]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <planeGeometry args={[extendedPanelDepth, droppedCeilingHeight]} />
                  <primitive
                    ref={droppedWallMaterialRef}
                    object={droppedWallMaterial} />
                </mesh>
              </>
            );
          })()}
          
          {/* 바닥면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) - 탑뷰에서는 숨김 */}
          {viewMode !== '2D' && (
            <mesh
              position={[xOffset + width/2, panelStartY - 0.001, extendedZOffset + extendedPanelDepth/2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[width, extendedPanelDepth]} />
              <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical', viewMode)} />
            </mesh>
          )}
          
          {/* 벽장 공간의 3면에서 나오는 그라데이션 오버레이들 - 입체감 효과 */}
          
          {(() => {
            const showGradients = false; // 그라디언트 면 비활성화 (기존 메쉬와 겹침 방지)
            return showGradients && (
              <>
                {/* 좌측 벽면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[-width/2 - 0.001, panelStartY + adjustedPanelHeight/2, zOffset + panelDepth/2 + 10.81]}
                  rotation={[0, -Math.PI / 2, 0]} // 우측과 반대 방향
                >
                  <planeGeometry args={[panelDepth + 10, adjustedPanelHeight]} />
                  <primitive object={leftHorizontalGradientMaterial} />
                </mesh>
                
                {/* 우측 벽면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[width/2 + 0.001, panelStartY + adjustedPanelHeight/2, zOffset + panelDepth/2 + 10.81]}
                  rotation={[0, Math.PI / 2, 0]} // Y축 기준 시계반대방향 90도 회전
                >
                  <planeGeometry args={[panelDepth + 10, adjustedPanelHeight]} />
                  <primitive object={horizontalGradientMaterial} />
                </mesh>
                
                {/* 윗면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[0, panelStartY + height + 0.001, zOffset + panelDepth/2 + 10.81]}
                  rotation={[Math.PI / 2, 0, 0]} // 윗면을 향하도록 90도 회전
                >
                  <planeGeometry args={[width, panelDepth + 10]} />
                  <primitive object={frontToBackGradientMaterial} />
                </mesh>
              </>
            );
          }, [])}
          
          {/* 뒤쪽 외부 벽면 */}
          {console.log('🔍 백패널 렌더링 조건:', {
            viewMode,
            view2DDirection,
            is2DFront: viewMode === '2D' && view2DDirection === 'front',
            position: [xOffset + width/2, panelStartY + height/2, zOffset - 0.01]
          })}
          {false ? (
            // 사용하지 않음
            (() => {
              // 점선을 위한 짧은 선분들 생성
              const dashLength = 0.3; // 점선 길이
              const gapLength = 0.15; // 간격 길이
              const segments = [];
              
              // 상단 가로선
              let currentX = -width/2;
              while (currentX < width/2) {
                const endX = Math.min(currentX + dashLength, width/2);
                segments.push(
                  <line key={`top-${currentX}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          currentX, height/2, 0,
                          endX, height/2, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentX += dashLength + gapLength;
              }
              
              // 하단 가로선
              currentX = -width/2;
              while (currentX < width/2) {
                const endX = Math.min(currentX + dashLength, width/2);
                segments.push(
                  <line key={`bottom-${currentX}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          currentX, -height/2, 0,
                          endX, -height/2, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentX += dashLength + gapLength;
              }
              
              // 좌측 세로선
              let currentY = -height/2;
              while (currentY < height/2) {
                const endY = Math.min(currentY + dashLength, height/2);
                segments.push(
                  <line key={`left-${currentY}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          -width/2, currentY, 0,
                          -width/2, endY, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentY += dashLength + gapLength;
              }
              
              // 우측 세로선
              currentY = -height/2;
              while (currentY < height/2) {
                const endY = Math.min(currentY + dashLength, height/2);
                segments.push(
                  <line key={`right-${currentY}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([
                          width/2, currentY, 0,
                          width/2, endY, 0
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color={theme?.mode === 'dark' ? "#666666" : "#999999"} opacity={0.6} transparent />
                  </line>
                );
                currentY += dashLength + gapLength;
              }
              
              return (
                <group position={[xOffset + width/2, panelStartY + height/2, zOffset - 0.01]}>
                  {segments}
                </group>
              );
            })()
          ) : (
            // 3D 모드나 다른 2D 뷰에서는 투명 처리
            <mesh
              position={[xOffset + width/2, panelStartY + height/2, zOffset - 0.01]}
              renderOrder={-1}
            >
              <planeGeometry args={[width, height]} />
              <meshStandardMaterial 
                color="#ffffff" 
                transparent={true}
                opacity={0.0}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
          
          {/* 모서리 음영 라인들 - 벽면이 만나는 모서리에 어두운 선 */}
          
          {/* 왼쪽 세로 모서리 (좌측벽과 뒷벽 사이) */}
          <mesh
            position={[-width/2, panelStartY + height/2, zOffset + panelDepth/2]}
            rotation={[0, 0, 0]}
            renderOrder={-1}
          >
            <planeGeometry args={[0.02, height]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 오른쪽 세로 모서리 (우측벽과 뒷벽 사이) */}
          <mesh
            position={[width/2, panelStartY + height/2, zOffset + panelDepth/2]}
            rotation={[0, 0, 0]}
            renderOrder={-1}
          >
            <planeGeometry args={[0.02, height]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 상단 가로 모서리 (천장과 뒷벽 사이) */}
          <mesh
            position={[xOffset + width/2, panelStartY + height, zOffset + panelDepth/2]}
            rotation={[0, 0, Math.PI / 2]}
            renderOrder={-1}
          >
            <planeGeometry args={[0.02, width]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 하단 가로 모서리 (바닥과 뒷벽 사이) */}
          <mesh
            position={[xOffset + width/2, panelStartY, zOffset + panelDepth/2]}
            rotation={[0, 0, Math.PI / 2]}
            renderOrder={-1}
          >
            <planeGeometry args={[0.02, width]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 왼쪽 위 세로 모서리 (좌측벽과 천장 사이) */}
          <mesh
            position={[-width/2, panelStartY + height, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 오른쪽 위 세로 모서리 (우측벽과 천장 사이) */}
          <mesh
            position={[width/2, panelStartY + height, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 왼쪽 아래 세로 모서리 (좌측벽과 바닥 사이) */}
          <mesh
            position={[-width/2, panelStartY, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 오른쪽 아래 세로 모서리 (우측벽과 바닥 사이) */}
          <mesh
            position={[width/2, panelStartY, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
        </>
      )}
      
      {/* 바닥 마감재가 있는 경우 - 전체 가구 폭으로 설치 */}
      {spaceInfo.hasFloorFinish && floorFinishHeight > 0 && (
        <BoxWithEdges
          hideEdges={hideEdges}
          args={[width, floorFinishHeight, extendedPanelDepth]}
          position={[xOffset + width/2, yOffset + floorFinishHeight/2, extendedZOffset + extendedPanelDepth/2]}
          material={new THREE.MeshLambertMaterial({ color: floorColor, transparent: true, opacity: 0.3 })}
          renderMode={renderMode}
          viewMode={viewMode}
          shadowEnabled={shadowEnabled}
          view2DTheme={view2DTheme}
        />
      )}
      
      {/* 슬롯 바닥면 - 그린색으로 표시 - showAll이 true일 때만 */}
      {showAll && (() => {
        // 내경 공간 계산 (ColumnGuides와 동일한 방식)
        const internalSpace = calculateInternalSpace(spaceInfo);
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const frontZ = mmToThreeUnits(internalSpace.depth / 2);
        const backZ = -frontZ;
        
        // ColumnIndexer와 동일한 방식으로 슬롯 경계 계산
        const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
        // 슬롯 시작과 끝 위치 계산 - zoneSlotInfo의 normal 영역 사용
        const slotStartX = mmToThreeUnits(zoneSlotInfo.normal.startX);
        const slotEndX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);
        
        const slotWidth = slotEndX - slotStartX;
        const slotCenterX = (slotStartX + slotEndX) / 2;
        
        // 좌우 프레임의 앞쪽 끝 위치 계산
        const frameEndZ = furnitureZOffset + furnitureDepth/2;
        
        // 바닥면의 시작점(뒤쪽)과 끝점(프레임 앞쪽) 사이의 거리
        // 앞쪽에서 END_PANEL_THICKNESS 줄이기
        const floorDepth = frameEndZ - backZ - mmToThreeUnits(END_PANEL_THICKNESS);
        
        const columns = spaceInfo.columns || [];
        
        // 슬롯 가이드와 동일한 Y 위치 계산 (ColumnGuides와 일치시킴)
        // internalSpace.startY는 이미 받침대 높이를 포함하고 있음
        const floorY = mmToThreeUnits(internalSpace.startY) + (
          spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
            ? floatHeight
            : 0
        );
        
        console.log('🎯 Floor mesh Y calculation:', {
          internalSpace_startY: internalSpace.startY,
          baseFrameHeightMm,
          floorFinishHeightMm,
          floatHeight,
          floorY,
          baseConfig: spaceInfo.baseConfig,
          panelStartY
        });
        
        // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
        const hasDeepColumns = columns.some(column => column.depth >= 730);
        
        if (columns.length === 0 || !hasDeepColumns) {
          // 기둥이 없거나 모든 기둥이 729mm 이하면 바닥면 렌더링 안함 (SlotDropZonesSimple에서 처리)
          return null;
        }
        
        // 기둥이 있는 경우 분절된 바닥면들 렌더링
        const floorSegments: Array<{
          width: number;
          x: number;
        }> = [];
        
        // 전체 바닥면 범위 계산 - 슬롯 가이드 범위로 변경
        const floorStartX = slotStartX;
        const floorEndX = slotEndX;
        const floorCenterX = slotCenterX;
        
        // 기둥들을 X 위치 기준으로 정렬
        const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);
        
        let currentX = floorStartX;
        
        // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
        sortedColumns.forEach((column, index) => {
          const columnWidthM = column.width * 0.01; // mm to Three.js units
          const columnLeftX = column.position[0] - columnWidthM / 2;
          const columnRightX = column.position[0] + columnWidthM / 2;
          
          // 기둥이 바닥면 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
          if (columnLeftX < floorEndX && columnRightX > floorStartX && column.depth >= 730) {
            // 기둥 왼쪽 바닥면 세그먼트
            const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
            if (leftSegmentWidth > 0) {
              floorSegments.push({
                width: leftSegmentWidth,
                x: currentX + leftSegmentWidth / 2
              });
            }
            
            // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
            currentX = columnRightX;
          }
        });
        
        // 마지막 세그먼트 (마지막 기둥 오른쪽)
        const lastSegmentWidth = Math.max(0, floorEndX - currentX);
        if (lastSegmentWidth > 0) {
          floorSegments.push({
            width: lastSegmentWidth,
            x: currentX + lastSegmentWidth / 2
          });
        }
        
        // 분절된 바닥면들 렌더링 (분절이 없으면 기본 바닥면 렌더링)
        if (floorSegments.length === 0) {
          return (
            <mesh
              position={[
                floorCenterX, 
                floorY, 
                backZ + floorDepth/2  // 바닥면의 중심점을 backZ에서 프레임 앞쪽까지의 중앙에 배치
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow={shadowEnabled}
              renderOrder={-1}
            >
              <planeGeometry args={[slotWidth, floorDepth]} />
              <meshStandardMaterial 
                color={colors.primary}
                transparent={true} 
                opacity={0.4}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        }
        
        // 분절된 바닥면도 렌더링 안함 (SlotDropZonesSimple에서 처리)
        return null;
      })()}
      
      {/* 프레임 렌더링 디버그 */}
      {spaceInfo.surroundType === 'no-surround' && (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') && console.log('🔍 프레임 렌더링 체크:', {
        showFrame,
        frameThicknessLeft: frameThickness.left,
        frameThicknessRight: frameThickness.right,
        leftCondition: showFrame && frameThickness.left > 0,
        rightCondition: showFrame && frameThickness.right > 0
      })}
      
      {/* 왼쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {(() => {
        const willRender = showFrame && frameThickness.left > 0;
        const elementType = !wallConfig?.left ? '엔드패널' : '프레임';
        
        if (willRender && spaceInfo.installType === 'semistanding') {
          console.log('🔴🔴🔴 [렌더링됨] 왼쪽 ' + elementType);
        }
        
        console.log('🔴🔴🔴 [한쪽벽모드] 왼쪽 프레임/엔드패널 렌더링 체크:', {
          showFrame,
          frameThicknessLeft: frameThickness.left,
          frameThicknessLeftMm: frameThicknessMm.left,
          condition: showFrame && frameThickness.left > 0,
          surroundType: spaceInfo.surroundType,
          installType: spaceInfo.installType,
          wallConfigLeft: wallConfig?.left,
          wallConfigRight: wallConfig?.right,
          '렌더링여부': willRender,
          '예상타입': elementType,
          hasLeftFurniture
        });
        
        return null;
      })()}
      {console.log('🚨 왼쪽 엔드패널 렌더링 직전 체크:', {
        frameThicknessLeft: frameThickness.left,
        frameThicknessLeftMm: frameThicknessMm.left,
        'frameThickness.left > 0': frameThickness.left > 0,
        showFrame,
        'showFrame && frameThickness.left > 0': showFrame && frameThickness.left > 0
      })}
      {showFrame && frameThickness.left > 0 && (spaceInfo.surroundType !== 'no-surround' || spaceInfo.installType === 'freestanding' || hasLeftFurniture) && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (() => {
        console.log('🔥🔥🔥 [좌측 프레임/엔드패널 메인 렌더링 블록]', {
          surroundType: spaceInfo.surroundType,
          wallConfigLeft: wallConfig?.left,
          isEndPanel: !wallConfig?.left
        });
        // 단내림 관련 변수
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
        const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
        const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
          ? spaceInfo.droppedCeiling.dropHeight || 200
          : 0;
        const droppedCeilingHeight = mmToThreeUnits(dropHeight);

        console.log('🔍 [좌측 프레임] 단내림 체크:', { hasDroppedCeiling, isLeftDropped, position: spaceInfo.droppedCeiling?.position, wallLeft: wallConfig?.left });

        // 왼쪽이 단내림 영역인 경우 두 부분으로 나누어 렌더링
        if (hasDroppedCeiling && isLeftDropped) {
          // 서라운드 모드에서도 단내림 프레임 렌더링 (띄움높이 반영)

          // 노서라운드 모드에서만 가구 여부로 엔드패널 렌더링 결정
          if (spaceInfo.surroundType === 'no-surround') {
            // 단내림 구간에 가구가 없으면 엔드패널 렌더링 생략
            if (!hasDroppedZoneFurniture) {
              console.log('🚫 [노서라운드] 왼쪽 단내림 엔드패널 렌더링 생략 (단내림 구간에 가구 없음)');
              return null;
            }

            // 단내림 구간은 독립적으로 엔드패널 필요
            // 단내림 구간에 가구가 있으면 무조건 바깥쪽 끝에 엔드패널 렌더링
            // (메인 구간 가구 여부와 무관)
          }

          const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
          const droppedFrameHeight = droppedHeight - floatHeight;
          const droppedCenterY = panelStartY + floatHeight + droppedFrameHeight/2;
          const upperPartHeight = height - droppedHeight;
          const upperPartCenterY = panelStartY + droppedHeight + upperPartHeight/2;

          console.log('🔥 [단내림 왼쪽 프레임] panelStartY:', panelStartY, 'floatHeight:', floatHeight, 'droppedHeight:', droppedHeight, 'droppedFrameHeight:', droppedFrameHeight, 'droppedCenterY:', droppedCenterY);
          console.log('✅✅✅ [단내림 왼쪽] 프레임 렌더링 시작');

          // 단내림 영역 렌더링 카운터
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.left) {
              window.renderCounter.leftEndPanel++;
              console.log('🚨🚨🚨 [단내림] 왼쪽 엔드패널 렌더링!', window.renderCounter.leftEndPanel, '번째');
            } else {
              window.renderCounter.leftFrame++;
              console.log('🚨🚨🚨 [단내림] 왼쪽 프레임 렌더링!', window.renderCounter.leftFrame, '번째');
            }
          }


          return (
           <>
             {/* 단내림 영역 프레임/엔드패널 */}
             <BoxWithEdges
          hideEdges={hideEdges}
               key={`left-dropped-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
               isEndPanel={!wallConfig?.left} // 왼쪽 벽이 없으면 엔드패널
               args={[
                 frameThickness.left,
                 // 단내림 구간 프레임 높이 (띄움배치 시 floatHeight 제외)
                 droppedFrameHeight,
                 // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                 spaceInfo.surroundType === 'no-surround'
                   ? (wallConfig?.left
                       ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                       : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                   : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                       ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 깊이
                       : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
               ]}
               position={[
                 // 서라운드 모드에서는 가구 배치 여부와 관계없이 엔드패널 위치 고정
                 // 노서라운드 모드에서만 가구가 있을 때 가구 옆에 붙여서 렌더링
                 (spaceInfo.surroundType !== 'surround' && hasLeftFurniture && indexingForCheck.threeUnitBoundaries.length > 0)
                   ? indexingForCheck.threeUnitBoundaries[0] - frameThickness.left
                   : xOffset + frameThickness.left/2,
                 // 단내림 구간 중심 (띄움높이와 단내림높이 반영)
                 droppedCenterY,
                 // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                 spaceInfo.surroundType === 'no-surround'
                   ? (wallConfig?.left
                       ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(7)  // 단내림 구간: 가구 앞면에서 7mm 앞
                       : noSurroundEndPanelZ)  // 벽이 없는 경우: 공간 뒷벽과 가구 앞면-20mm의 중심
                   : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                       ? surroundEndPanelZ  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                       : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(7))  // 단내림 구간: 가구 앞면에서 7mm 앞
               ]}
               material={createFrameMaterial('left')}
               renderMode={renderMode}
               shadowEnabled={shadowEnabled}
             />
             {/* 상부 영역 프레임 (천장까지) - 서라운드는 이미 전체 높이이므로 생략 */}
             {spaceInfo.surroundType !== 'surround' && (
             <BoxWithEdges
          hideEdges={hideEdges}
               isEndPanel={!wallConfig?.left} // 왼쪽 벽이 없으면 엔드패널
               args={[
                 frameThickness.left,
                 upperPartHeight, // 상부 구간 높이
                 // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                 spaceInfo.surroundType === 'no-surround'
                   ? (wallConfig?.left
                       ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                       : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                   : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                       ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                       : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
               ]}
               position={[
                 // 서라운드 모드에서는 가구 배치 여부와 관계없이 엔드패널 위치 고정
                 // 노서라운드 모드에서만 가구가 있을 때 가구 옆에 붙여서 렌더링
                 (spaceInfo.surroundType !== 'surround' && hasLeftFurniture && indexingForCheck.threeUnitBoundaries.length > 0)
                   ? indexingForCheck.threeUnitBoundaries[0] - frameThickness.left
                   : xOffset + frameThickness.left/2,
                 upperPartCenterY, // 상부 구간 중심
                 // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                 spaceInfo.surroundType === 'no-surround'
                   ? (wallConfig?.left
                       ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(5)  // 단내림 상부: 가구 앞면에서 5mm 앞
                       : noSurroundEndPanelZ)  // 벽이 없는 경우: 공간 뒷벽과 가구 앞면-20mm의 중심
                   : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                       ? surroundEndPanelZ  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                       : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(5))  // 단내림 상부: 가구 앞면에서 5mm 앞
               ]}
               material={leftFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
               renderMode={renderMode}
               shadowEnabled={shadowEnabled}
             />
             )}
           </>
          );
        }

        // 일반 구간 (단내림이 아닌 경우에만 렌더링)
        // 단내림 구간에서는 이미 위에서 return했으므로 여기 도달하지 않음
        // 하지만 명시적으로 체크하여 중복 방지
        if (!(hasDroppedCeiling && isLeftDropped)) {
          console.log('🔍 왼쪽 엔드패널 렌더링 디버그:', {
            frameThicknessLeft: frameThickness.left,
            wallConfigLeft: wallConfig?.left,
            surroundType: spaceInfo.surroundType,
            installType: spaceInfo.installType,
            hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled,
            깊이: wallConfig?.left ? '프레임(18mm)' : '엔드패널(전체깊이-18mm)',
            위치: wallConfig?.left ? '프레임위치' : '엔드패널위치'
          });

          // 렌더링 카운터 증가
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.left) {
              window.renderCounter.leftEndPanel++;
              console.log('🚨🚨🚨 [일반] 왼쪽 엔드패널 렌더링!', window.renderCounter.leftEndPanel, '번째');
            } else {
              window.renderCounter.leftFrame++;
              console.log('🚨🚨🚨 [일반] 왼쪽 프레임 렌더링!', window.renderCounter.leftFrame, '번째');
            }
          }
        }

        console.log('❓❓❓ [왼쪽 일반 구간] 렌더링 여부:', !(hasDroppedCeiling && isLeftDropped), 'hasDroppedCeiling:', hasDroppedCeiling, 'isLeftDropped:', isLeftDropped);
        const leftPosition: [number, number, number] = [
          // X 위치
          spaceInfo.surroundType === 'no-surround'
            ? (indexingForCheck.threeUnitBoundaries.length > 0
                ? indexingForCheck.threeUnitBoundaries[0] + frameThickness.left/2
                : xOffset + frameThickness.left/2)
            : xOffset + frameThickness.left/2,
          // Y 위치
          sideFrameCenterY,
          // Z 위치
          spaceInfo.surroundType === 'no-surround'
            ? (wallConfig?.left
                ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(3)
                : noSurroundEndPanelZ)
            : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
               (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                ? surroundEndPanelZ
                : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(3))
        ];
        console.log('🎯🎯🎯 [왼쪽 일반 구간 프레임 position]', leftPosition, 'sideFrameCenterY:', sideFrameCenterY, 'adjustedPanelHeight:', adjustedPanelHeight);
        return (!(hasDroppedCeiling && isLeftDropped) ? (
          <BoxWithEdges
          hideEdges={hideEdges}
            key={`left-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
            isEndPanel={!wallConfig?.left} // 왼쪽 벽이 없으면 엔드패널
            args={[
              frameThickness.left,
              adjustedPanelHeight,
              // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
              spaceInfo.surroundType === 'no-surround'
                ? (wallConfig?.left
                    ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                    : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) ||
                   (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                    ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 깊이
                    : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
            ]}
            position={leftPosition}
            material={createFrameMaterial('left')}
            renderMode={renderMode}
            shadowEnabled={shadowEnabled}
          />
        ) : null);
      })()}
      
      
      {/* 오른쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {(() => {
        const willRender = showFrame && frameThickness.right > 0;
        const elementType = !wallConfig?.right ? '엔드패널' : '프레임';
        
        if (willRender && spaceInfo.installType === 'semistanding') {
          console.log('🔵🔵🔵 [렌더링됨] 오른쪽 ' + elementType);
        }
        
        console.log('🔵🔵🔵 [한쪽벽모드] 오른쪽 프레임/엔드패널 렌더링 체크:', {
          showFrame,
          frameThicknessRight: frameThickness.right,
          frameThicknessRightMm: frameThicknessMm.right,
          condition: showFrame && frameThickness.right > 0,
          surroundType: spaceInfo.surroundType,
          installType: spaceInfo.installType,
          wallConfigLeft: wallConfig?.left,
          wallConfigRight: wallConfig?.right,
          '렌더링여부': willRender,
          '예상타입': elementType,
          hasRightFurniture
        });
        
        return null;
      })()}
      {(() => {
        const condition1 = showFrame && frameThickness.right > 0;
        const condition2 = (spaceInfo.surroundType !== 'no-surround' || spaceInfo.installType === 'freestanding' || hasRightFurniture);
        const condition3 = !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right'));
        const finalCondition = condition1 && condition2 && condition3;
        console.log('🔵🔵🔵 [오른쪽 프레임 렌더링 조건 체크]', {
          condition1_showFrame_thickness: condition1,
          condition2_surroundOrFreestandingOrFurniture: condition2,
          condition3_not2DSide: condition3,
          finalCondition,
          showFrame,
          frameThicknessRight: frameThickness.right,
          surroundType: spaceInfo.surroundType,
          installType: spaceInfo.installType,
          hasRightFurniture,
          viewMode,
          view2DDirection
        });
        return null;
      })()}
      {showFrame && frameThickness.right > 0 && (spaceInfo.surroundType !== 'no-surround' || spaceInfo.installType === 'freestanding' || hasRightFurniture) && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (() => {
        // 단내림 여부 확인
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
        const isRightDropped = hasDroppedCeiling && spaceInfo.droppedCeiling?.position === 'right';
        const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
          ? spaceInfo.droppedCeiling.dropHeight || 200
          : 0;
        const droppedCeilingHeight = mmToThreeUnits(dropHeight);

        console.log('🔍 [우측 프레임] 단내림 체크:', { hasDroppedCeiling, isRightDropped, position: spaceInfo.droppedCeiling?.position, wallRight: wallConfig?.right });

        // 오른쪽이 단내림 영역인 경우
        if (hasDroppedCeiling && isRightDropped) {
          // 서라운드 모드에서도 단내림 프레임 렌더링 (띄움높이 반영)

          // 노서라운드 모드에서만 가구 여부로 엔드패널 렌더링 결정
          if (spaceInfo.surroundType === 'no-surround') {
            // 단내림 구간에 가구가 없으면 엔드패널 렌더링 생략
            if (!hasDroppedZoneFurniture) {
              console.log('🚫 [노서라운드] 오른쪽 단내림 엔드패널 렌더링 생략 (단내림 구간에 가구 없음)');
              return null;
            }

            // 단내림 구간은 독립적으로 엔드패널 필요
            // 단내림 구간에 가구가 있으면 무조건 바깥쪽 끝에 엔드패널 렌더링
            // (메인 구간 가구 여부와 무관)
          }

          const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
          const droppedFrameHeight = droppedHeight - floatHeight;
          const droppedCenterY = panelStartY + floatHeight + droppedFrameHeight/2;
          const upperPartHeight = droppedCeilingHeight;
          const upperPartCenterY = panelStartY + height - upperPartHeight/2;

          console.log('🔥 [단내림 오른쪽 프레임] panelStartY:', panelStartY, 'floatHeight:', floatHeight, 'droppedHeight:', droppedHeight, 'droppedFrameHeight:', droppedFrameHeight, 'droppedCenterY:', droppedCenterY);
          console.log('🎯 [단내림 오른쪽 프레임 args] frameThickness.right:', frameThickness.right, 'droppedFrameHeight:', droppedFrameHeight);
          console.log('✅✅✅ [단내림 오른쪽] 프레임 렌더링 시작 - 이 다음에는 일반 구간이 렌더링되면 안됨!');

          // 단내림 구간의 경계 위치 계산
          const droppedZone = indexingForCheck.zones?.dropped;
          const droppedBoundaries = droppedZone?.threeUnitPositions || [];
          const droppedStartSlot = droppedZone?.startSlotIndex ?? 0;
          const droppedLastSlot = droppedStartSlot + (droppedZone?.columnCount ?? 1) - 1;

          // 단내림 구간 오른쪽 끝 가구 위치 찾기
          const droppedRightFurniture = placedModulesFromStore.find(m => {
            const isDual = m.isDualSlot || m.moduleId?.includes('dual-');
            if (m.zone !== 'dropped') return false;
            // 오른쪽 끝 = dropped zone의 마지막 슬롯 또는 마지막-1 슬롯(듀얼)
            return m.slotIndex === droppedLastSlot || (isDual && m.slotIndex === droppedLastSlot - 1);
          });

          // 엔드패널 X 위치: 가구가 있으면 가구 오른쪽 끝에 붙임
          let endPanelX = xOffset + width - frameThickness.right/2; // 기본값: 공간 끝

          // 서라운드 모드에서는 가구 배치 여부와 관계없이 엔드패널 위치 고정
          if (droppedRightFurniture && spaceInfo.surroundType !== 'surround') {
            const furnitureX = droppedRightFurniture.position.x;
            // customWidth는 placement 시 설정된 값, FurnitureItem에서 18mm 더 줄어듬
            const customWidthMm = droppedRightFurniture.customWidth ?? (droppedZone?.columnWidth ?? 0);
            const actualFurnitureWidth = (customWidthMm - END_PANEL_THICKNESS) * 0.01; // 실제 렌더링 너비

            // 엔드패널 왼쪽 끝 = 가구 오른쪽 끝
            const furnitureRightEdge = furnitureX + actualFurnitureWidth / 2;

            // 엔드패널 중심 = 가구 오른쪽 끝 (엔드패널은 가구 바로 옆에 붙음, 두께/2 더하지 않음)
            endPanelX = furnitureRightEdge;

            console.log('🔍 엔드패널 X 계산:', {
              customWidthMm,
              actualFurnitureWidth,
              furnitureX,
              furnitureRightEdge,
              endPanelX
            });
          }

          console.log('🔍 단내림 오른쪽 엔드패널 위치 계산:', {
            droppedZone,
            droppedBoundaries,
            droppedStartSlot,
            droppedLastSlot,
            droppedRightFurniture: droppedRightFurniture ? {
              slotIndex: droppedRightFurniture.slotIndex,
              positionX: droppedRightFurniture.position.x,
              customWidth: droppedRightFurniture.customWidth
            } : null,
            endPanelX,
            hasRightFurniture
          });

          // 단내림 영역 렌더링 카운터
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.right) {
              window.renderCounter.rightEndPanel++;
              console.log('🚨🚨🚨 [단내림] 오른쪽 엔드패널 렌더링!', window.renderCounter.rightEndPanel, '번째');
            } else {
              window.renderCounter.rightFrame++;
              console.log('🚨🚨🚨 [단내림] 오른쪽 프레임 렌더링!', window.renderCounter.rightFrame, '번째');
            }
          }

          return (
           <>
             {/* 단내림 영역 프레임/엔드패널 */}
             <BoxWithEdges
          hideEdges={hideEdges}
               key={`right-dropped-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
               isEndPanel={!wallConfig?.right} // 오른쪽 벽이 없으면 엔드패널
               args={[
                 frameThickness.right,
                 // 단내림 구간 프레임 높이 (띄움배치 시 floatHeight 제외)
                 droppedFrameHeight,
                 // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                 spaceInfo.surroundType === 'no-surround'
                   ? (wallConfig?.right
                       ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                       : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                   : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                       ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 깊이
                       : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
               ]}
               position={(() => {
                 const pos: [number, number, number] = [
                   // 가구 오른쪽 끝에 붙임
                   endPanelX,
                   // 단내림 구간 중심 Y
                   droppedCenterY,
                 // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                 spaceInfo.surroundType === 'no-surround'
                   ? (wallConfig?.right
                       ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(9)  // 단내림 구간: 메인프레임과 맞닿도록 9mm 앞
                       : noSurroundEndPanelZ)  // 벽이 없는 경우: 공간 뒷벽과 가구 앞면-20mm의 중심
                   : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                      (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                       ? surroundEndPanelZ  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                       : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(11))  // 단내림 구간: 메인프레임과 맞닿도록 11mm 앞 (추가 2mm)
                 ];
                 console.log('🎯 [단내림 오른쪽 프레임 position]', pos);
                 return pos;
               })()}
               material={createFrameMaterial('right')}
               renderMode={renderMode}
               shadowEnabled={shadowEnabled}
             />
           </>
          );
        }

        // 일반 구간 (단내림이 아닌 경우에만 렌더링)
        // 단내림 구간에서는 이미 위에서 return했으므로 여기 도달하지 않음
        // 하지만 명시적으로 체크하여 중복 방지
        console.log('❓❓❓ [일반 구간 체크] hasDroppedCeiling:', hasDroppedCeiling, 'isRightDropped:', isRightDropped, '렌더링여부:', !(hasDroppedCeiling && isRightDropped));
        if (!(hasDroppedCeiling && isRightDropped)) {
          // 렌더링 카운터 증가
          if (typeof window !== 'undefined' && window.renderCounter) {
            if (!wallConfig?.right) {
              window.renderCounter.rightEndPanel++;
              console.log('🚨🚨🚨 [일반] 오른쪽 엔드패널 렌더링!', window.renderCounter.rightEndPanel, '번째');
            } else {
              window.renderCounter.rightFrame++;
              console.log('🚨🚨🚨 [일반] 오른쪽 프레임 렌더링!', window.renderCounter.rightFrame, '번째');
            }
          }
        } else {
          console.log('🛑🛑🛑 [일반 구간 스킵] 단내림이 오른쪽이므로 일반 구간 렌더링 건너뜀');
        }

        return (!(hasDroppedCeiling && isRightDropped) ? (
          <BoxWithEdges
          hideEdges={hideEdges}
            key={`right-frame-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
            isEndPanel={!wallConfig?.right} // 오른쪽 벽이 없으면 엔드패널
            args={[
              frameThickness.right,
              adjustedPanelHeight,
              // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
              spaceInfo.surroundType === 'no-surround'
                ? (wallConfig?.right
                    ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                    : noSurroundEndPanelDepth)  // 벽이 없는 경우: 공간 뒷벽부터 가구 앞면-20mm까지
                : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                   (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                    ? surroundEndPanelDepth  // 서라운드 엔드패널: 뒷벽까지 보정된 깊이
                    : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
            ]}
            position={[
              // 노서라운드 모드: 마지막 슬롯 경계에서 엔드패널 반만큼 안쪽
              // 일반 모드: 끝 슬롯에 가구가 있을 때는 가구 옆에 붙여서 렌더링
              spaceInfo.surroundType === 'no-surround'
                ? (indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
                    ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] - frameThickness.right/2
                    : xOffset + width - frameThickness.right/2)
                : (hasRightFurniture && indexingForCheck.threeUnitBoundaries.length > lastSlotIndex + 1
                    ? indexingForCheck.threeUnitBoundaries[lastSlotIndex + 1] + frameThickness.right
                    : xOffset + width - frameThickness.right/2),
              sideFrameCenterY,
              // 노서라운드 모드에서 엔드패널/프레임 위치 결정
              spaceInfo.surroundType === 'no-surround'
                ? (wallConfig?.right
                    ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(3)  // 일반 구간: 가구 앞면에서 3mm 앞
                    : noSurroundEndPanelZ)  // 벽이 없는 경우: 공간 뒷벽과 가구 앞면-20mm의 중심
                : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) ||
                   (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                    ? surroundEndPanelZ  // 서라운드 엔드패널: 뒷벽까지 보정된 위치
                    : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(3))  // 일반 구간: 가구 앞면에서 3mm 앞
            ]}
            material={createFrameMaterial('right')}
            renderMode={renderMode}
            shadowEnabled={shadowEnabled}
          />
        ) : null);
      })()}
      
      
      {/* 상단 패널 - ㄱ자 모양으로 구성 */}
      {/* 수평 상단 프레임 - 좌우 프레임 사이에만 배치 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 노서라운드 모드에서는 전체 너비로 확장하지만 좌우 프레임이 없을 때만 표시 */}
      {/* 상부 프레임 - 측면 뷰에서도 표시 */}
      {showFrame && topBottomFrameHeightMm > 0 && (
        <>
          {/* 노서라운드 모드에서 상단프레임 폭 디버깅 */}
          {/* spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [상단프레임] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${baseFrame.width.toFixed(2)}`) */}
          
          {/* 기둥이 있거나 단내림이 있는 경우 상단 프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
            
            // 단내림 관련 변수들
            let droppedWidth = 0;
            let droppedHeight = 0;
            let isLeftDropped = false;
            if (hasDroppedCeiling && spaceInfo.droppedCeiling) {
              droppedWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || 900);
              const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
              droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
              isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
            }
            
            // 슬롯 가이드와 동일한 범위 사용 - 모든 모드에서 calculateZoneSlotInfo 사용
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const normalZone = zoneInfo.normal;
            
            // mm 단위를 Three.js 단위로 변환 - 노서라운드에서 엔드패널 제외
            let frameStartX = mmToThreeUnits(normalZone.startX);
            let frameEndX = mmToThreeUnits(normalZone.startX + normalZone.width);
            
            // 노서라운드 모드에서 세미스탠딩/프리스탠딩은 엔드패널을 제외한 프레임 범위 계산
            if (spaceInfo.surroundType === 'no-surround' && 
                (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing' || 
                 spaceInfo.installType === 'freestanding')) {
              // 엔드패널이 있는 쪽은 프레임 범위에서 제외
              if (endPanelPositions.left) {
                frameStartX += mmToThreeUnits(END_PANEL_THICKNESS);
              }
              if (endPanelPositions.right) {
                frameEndX -= mmToThreeUnits(END_PANEL_THICKNESS);
              }
            }
            
            const frameWidth = frameEndX - frameStartX;
            const frameX = (frameStartX + frameEndX) / 2;
            
            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 + 단내림이 없는 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            if ((columns.length === 0 || !hasDeepColumns) && !hasDroppedCeiling) {
              // 기둥도 없고 단내림도 없으면 기존처럼 하나의 프레임으로 렌더링
              console.log('🔧 상부프레임 엔드패널 조정:', {
                원래너비: normalZone.width,
                조정된너비: frameWidth,
                왼쪽엔드패널: endPanelPositions.left,
                오른쪽엔드패널: endPanelPositions.right,
                frameStartX,
                frameEndX,
                frameX
              });
              
              return (
                <BoxWithEdges
          hideEdges={hideEdges}
                  args={[
                    frameWidth, // 이미 엔드패널이 조정된 너비
                    topBottomFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[
                    frameX, // 이미 엔드패널이 조정된 위치
                    topElementsY, 
                    // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                  ]}
                  material={createFrameMaterial('top')}
                  renderMode={renderMode}
                
          shadowEnabled={shadowEnabled}
        />
              );
            }
            
            // 기둥이 있는 경우 분절된 프레임들 렌더링
            // 단내림만 있고 기둥이 없는 경우 처리
            if (hasDroppedCeiling && !hasDeepColumns) {
              const frameStartX = frameX - frameWidth / 2;
              const frameEndX = frameX + frameWidth / 2;
              const droppedBoundaryX = isLeftDropped 
                ? frameStartX + droppedWidth
                : frameEndX - droppedWidth;
              
              // 프레임 너비 계산 - 동적 계산
              let droppedFrameWidth, normalFrameWidth;
              
              // 좌우 공간 축소값 계산 (프레임 또는 이격거리/엔드패널)
              let leftReduction = 0;
              let rightReduction = 0;
              
              if (spaceInfo.surroundType === 'surround') {
                const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
                leftReduction = frameThickness.left;
                rightReduction = frameThickness.right;
              } else {
                // 노서라운드: 엔드패널이 있는 쪽만 조정
                if (spaceInfo.installType === 'builtin') {
                  leftReduction = 2;
                  rightReduction = 2;
                } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
                  // 세미스탠딩: 엔드패널이 생성된 위치만 조정
                  leftReduction = endPanelPositions.left ? END_PANEL_THICKNESS : 0;
                  rightReduction = endPanelPositions.right ? END_PANEL_THICKNESS : 0;
                } else if (spaceInfo.installType === 'freestanding') {
                  // 프리스탠딩: 엔드패널이 생성된 위치만 조정
                  leftReduction = endPanelPositions.left ? END_PANEL_THICKNESS : 0;
                  rightReduction = endPanelPositions.right ? END_PANEL_THICKNESS : 0;
                } else {
                  leftReduction = endPanelPositions.left ? END_PANEL_THICKNESS : 0;
                  rightReduction = endPanelPositions.right ? END_PANEL_THICKNESS : 0;
                }
              }
              
              // 경계면 이격거리 계산 (ColumnIndexer와 동일)
              const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

              // zoneSlotInfo에서 실제 계산된 너비 사용
              const droppedAreaInternalWidthMm = zoneSlotInfo.dropped
                ? (zoneSlotInfo.dropped.width + (zoneSlotInfo.dropped.startX - (-(spaceInfo.width / 2))))
                : (spaceInfo.droppedCeiling.width || 900);
              const normalAreaInternalWidthMm = zoneSlotInfo.normal.width +
                (zoneSlotInfo.normal.startX - (isLeftDropped
                  ? (-(spaceInfo.width / 2) + droppedAreaInternalWidthMm)
                  : -(spaceInfo.width / 2)));

              if (isLeftDropped) {
                // 왼쪽 단내림
                const droppedAreaWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || 900);
                const normalAreaWidth = mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling.width || 900));

                // 단내림: 왼쪽만 reduction, 오른쪽(경계면)은 확장
                droppedFrameWidth = droppedAreaWidth - mmToThreeUnits(leftReduction);

                // 일반구간: 오른쪽 reduction + 경계면 갭
                // zoneSlotInfo의 실제 계산된 너비 사용
                normalFrameWidth = mmToThreeUnits(zoneSlotInfo.normal.width);
              } else {
                // 오른쪽 단내림
                const normalAreaWidth = mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling.width || 900));
                const droppedAreaWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || 900);

                // 일반구간: 왼쪽 reduction + 경계면 갭
                normalFrameWidth = mmToThreeUnits(zoneSlotInfo.normal.width);

                // 단내림: 오른쪽만 reduction, 왼쪽(경계면)은 확장
                droppedFrameWidth = droppedAreaWidth - mmToThreeUnits(rightReduction);
              }

              // 각 영역의 시작점 계산 (ColumnIndexer와 동일하게)
              const normalStartXMm = zoneSlotInfo.normal.startX;
              const droppedStartXMm = zoneSlotInfo.dropped?.startX ||
                (isLeftDropped ? -(spaceInfo.width / 2) : normalStartXMm + zoneSlotInfo.normal.width);

              const normalStartX = mmToThreeUnits(normalStartXMm);
              const droppedStartX = mmToThreeUnits(droppedStartXMm);
              
              // 프레임 중심 위치 계산
              const droppedX = droppedStartX + droppedFrameWidth/2;
              const normalX = normalStartX + normalFrameWidth/2;
              
              console.log('🔥 상부 프레임 너비 상세 계산:', {
                전체너비mm: width / 0.01,
                frameWidth_mm: frameWidth / 0.01,
                droppedWidth_mm: droppedWidth / 0.01,
                leftReduction,
                rightReduction,
                메인구간프레임너비_mm: normalFrameWidth / 0.01,
                단내림구간프레임너비_mm: droppedFrameWidth / 0.01,
                단내림위치: isLeftDropped ? '왼쪽' : '오른쪽',
                위치정보: {
                  normalStartX_mm: normalStartX / 0.01,
                  droppedStartX_mm: droppedStartX / 0.01,
                  경계점_mm: (isLeftDropped ? normalStartX : droppedStartX) / 0.01
                },
                계산검증: {
                  '단내림+메인': (droppedFrameWidth + normalFrameWidth) / 0.01,
                  '전체내부너비': (mmToThreeUnits(spaceInfo.width) - mmToThreeUnits(leftReduction + rightReduction)) / 0.01
                }
              });
              
              // 단내림 영역과 일반 영역 프레임 렌더링
              return (
                <>
                  {/* 단내림 영역 상부 프레임 */}
                  <BoxWithEdges
          hideEdges={hideEdges}
                    args={[
                      droppedFrameWidth,
                      topBottomFrameHeight,
                      mmToThreeUnits(END_PANEL_THICKNESS)
                    ]}
                    position={[
                      droppedX,
                      panelStartY + (height - mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight)) - topBottomFrameHeight/2, // 단내림 천장 위치에서 프레임 높이의 절반만큼 아래
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 -
                      mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                    ]}
                    material={createFrameMaterial('top')}
                    renderMode={renderMode}
                    shadowEnabled={shadowEnabled}
                  />
                  {/* 일반 영역 상부 프레임 */}
                  <BoxWithEdges
          hideEdges={hideEdges}
                    args={[
                      normalFrameWidth,
                      topBottomFrameHeight,
                      mmToThreeUnits(END_PANEL_THICKNESS)
                    ]}
                    position={[
                      normalX,
                      topElementsY,
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 -
                      mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                    ]}
                    material={createFrameMaterial('top')}
                    renderMode={renderMode}

          shadowEnabled={shadowEnabled}
        />
                </>
              );
            }
            const frameSegments: Array<{
              width: number;
              x: number;
            }> = [];
            
            // 프레임 범위는 이미 엔드패널이 조정되어 있음
            const adjustedFrameStartX = frameStartX;
            const adjustedFrameEndX = frameEndX;
            
            console.log('🔧 상부프레임 분절 엔드패널 조정:', {
              조정된시작: adjustedFrameStartX,
              조정된끝: adjustedFrameEndX,
              왼쪽엔드패널: endPanelPositions.left,
              오른쪽엔드패널: endPanelPositions.right
            });
            
            // 기둥들을 X 위치 기준으로 정렬
            const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);
            
            let currentX = adjustedFrameStartX;
            
            // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
            sortedColumns.forEach((column, index) => {
              const columnWidthM = column.width * 0.01; // mm to Three.js units
              const columnLeftX = column.position[0] - columnWidthM / 2;
              const columnRightX = column.position[0] + columnWidthM / 2;
              
              // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
              if (columnLeftX < adjustedFrameEndX && columnRightX > adjustedFrameStartX && column.depth >= 730) {
                // 기둥 왼쪽 프레임 세그먼트
                const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                if (leftSegmentWidth > 0) {
                  frameSegments.push({
                    width: leftSegmentWidth,
                    x: currentX + leftSegmentWidth / 2
                  });
                }
                
                // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
                currentX = columnRightX;
              }
            });
            
            // 마지막 세그먼트 (마지막 기둥 오른쪽)
            const lastSegmentWidth = Math.max(0, adjustedFrameEndX - currentX);
            if (lastSegmentWidth > 0) {
              frameSegments.push({
                width: lastSegmentWidth,
                x: currentX + lastSegmentWidth / 2
              });
            }
            
            // 분절된 프레임들 렌더링 (분절이 없으면 기본 프레임 렌더링)
            if (frameSegments.length === 0) {
              return (
                <BoxWithEdges
          hideEdges={hideEdges}
                  args={[
                    frameWidth, // 노서라운드 모드에서는 전체 너비 사용
                    topBottomFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[
                    frameX, // 노서라운드 모드에서는 전체 너비 중앙 정렬
                    topElementsY, 
                    // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                  ]}
                  material={createFrameMaterial('top')}
                  renderMode={renderMode}
                
          shadowEnabled={shadowEnabled}
        />
              );
            }
            
            return frameSegments.map((segment, index) => {
              if (!topFrameMaterial) {
                console.warn(`⚠️ Top frame segment ${index} - material not ready, using default`);
              } else {
                console.log(`🎨 Top frame segment ${index} material:`, {
                  hasTopFrameMaterial: !!topFrameMaterial,
                  materialType: topFrameMaterial?.type,
                  materialColor: topFrameMaterial && 'color' in topFrameMaterial ? (topFrameMaterial as any).color.getHexString() : 'unknown',
                  materialTexture: topFrameMaterial && 'map' in topFrameMaterial ? !!(topFrameMaterial as any).map : false,
                  segmentWidth: segment.width
                });
              }
              
              return (
                <BoxWithEdges
          hideEdges={hideEdges}
                  key={`top-frame-segment-${index}`}
                  args={[
                    segment.width,
                    topBottomFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[
                    segment.x, // 분절된 위치
                    topElementsY, 
                    // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                  ]}
                  material={createFrameMaterial('top')}
                  renderMode={renderMode}
                
          shadowEnabled={shadowEnabled}
        />
              );
            });
          })()}
        </>
      )}
      
      {/* 상단 서브프레임 - 상단 프레임에서 앞쪽으로 내려오는 판 (ㄱ자의 세로 부분, X축 기준 90도 회전) */}
      {/* 노서라운드 모드에서는 상부 서브프레임도 숨김 */}
      {/* 상부 서브프레임 - 측면 뷰에서도 표시 */}
      {showFrame && false && topBottomFrameHeightMm > 18 && (
        <>
          {/* 기둥이 있는 경우 상단 서브프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            
            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            if (columns.length === 0 || !hasDeepColumns) {
              // 기둥이 없거나 모든 기둥이 729mm 이하면 기존처럼 하나의 서브프레임으로 렌더링
              // 엔드패널이 있는 경우 해당 부분만큼 서브프레임 너비 조정
              let adjustedSubFrameWidth = finalPanelWidth;
              let adjustedSubFrameX = topBottomPanelX;
              
              if (spaceInfo.surroundType === 'no-surround') {
                // 엔드패널이 있는 쪽의 서브프레임을 18mm씩 안쪽으로 조정
                const leftAdjustment = endPanelPositions.left ? mmToThreeUnits(END_PANEL_THICKNESS) : 0;
                const rightAdjustment = endPanelPositions.right ? mmToThreeUnits(END_PANEL_THICKNESS) : 0;
                
                adjustedSubFrameWidth = finalPanelWidth - leftAdjustment - rightAdjustment;
                adjustedSubFrameX = topBottomPanelX + (leftAdjustment - rightAdjustment) / 2;
              }
              
              return (
                <group 
                  position={[
                    adjustedSubFrameX, // 엔드패널이 있으면 조정된 위치 사용
                    topElementsY - topBottomFrameHeight/2 + mmToThreeUnits(END_PANEL_THICKNESS)/2, // 상단 프레임 하단에 정확히 맞물림 (패널 두께의 절반만큼 위로)
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 // 캐비넷 앞면 위치로 통일
                  ]}
                  rotation={[Math.PI / 2, 0, 0]} // X축 기준 90도 회전
                >
                  <BoxWithEdges
          hideEdges={hideEdges}
                    args={[
                      adjustedSubFrameWidth, // 엔드패널이 있으면 조정된 너비 사용
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={createFrameMaterial('top')}
                    renderMode={renderMode}
                  
          shadowEnabled={shadowEnabled}
        />
                </group>
              );
            }
            
            // 기둥이 있는 경우 분절된 서브프레임들 렌더링
            const frameSegments: Array<{
              width: number;
              x: number;
            }> = [];
            
            // 전체 프레임 범위 계산
            const frameStartX = topBottomPanelX - finalPanelWidth / 2;
            const frameEndX = topBottomPanelX + finalPanelWidth / 2;
            
            // 기둥들을 X 위치 기준으로 정렬
            const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);
            
            let currentX = frameStartX;
            
            // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
            sortedColumns.forEach((column, index) => {
              const columnWidthM = column.width * 0.01; // mm to Three.js units
              const columnLeftX = column.position[0] - columnWidthM / 2;
              const columnRightX = column.position[0] + columnWidthM / 2;
              
              // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
              if (columnLeftX < adjustedFrameEndX && columnRightX > adjustedFrameStartX && column.depth >= 730) {
                // 기둥 왼쪽 프레임 세그먼트
                const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                if (leftSegmentWidth > 0) {
                  frameSegments.push({
                    width: leftSegmentWidth,
                    x: currentX + leftSegmentWidth / 2
                  });
                }
                
                // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
                currentX = columnRightX;
              }
            });
            
            // 마지막 세그먼트 (마지막 기둥 오른쪽)
            const lastSegmentWidth = Math.max(0, adjustedFrameEndX - currentX);
            if (lastSegmentWidth > 0) {
              frameSegments.push({
                width: lastSegmentWidth,
                x: currentX + lastSegmentWidth / 2
              });
            }
            
            // 분절된 서브프레임들 렌더링 (분절이 없으면 기본 서브프레임 렌더링)
            if (frameSegments.length === 0) {
              return (
                <group 
                  position={[
                    topBottomPanelX, 
                    topElementsY - topBottomFrameHeight/2 + mmToThreeUnits(END_PANEL_THICKNESS)/2, // 상단 프레임 하단에 정확히 맞물림 (패널 두께의 절반만큼 위로)
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 // 캐비넷 앞면 위치로 통일
                  ]}
                  rotation={[Math.PI / 2, 0, 0]} // X축 기준 90도 회전
                >
                  <BoxWithEdges
          hideEdges={hideEdges}
                    args={[
                      finalPanelWidth, 
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={createFrameMaterial('top')}
                    renderMode={renderMode}
                  
          shadowEnabled={shadowEnabled}
        />
                </group>
              );
            }
            
            return frameSegments.map((segment, index) => (
              <group 
                key={`top-subframe-segment-${index}`}
                position={[
                  segment.x, // 분절된 위치
                  topElementsY - topBottomFrameHeight/2 + mmToThreeUnits(END_PANEL_THICKNESS)/2, // 상단 프레임 하단에 정확히 맞물림 (패널 두께의 절반만큼 위로)
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 // 캐비넷 앞면 위치로 통일
                ]}
                rotation={[Math.PI / 2, 0, 0]} // X축 기준 90도 회전
              >
                <BoxWithEdges
          hideEdges={hideEdges}
                  args={[
                    segment.width,
                    mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                    mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                  ]}
                  position={[0, 0, 0]} // group 내에서 원점에 배치
                  material={topSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                
          shadowEnabled={shadowEnabled}
        />
              </group>
            ));
          })()}
        </>
      )}
      
      {/* 왼쪽 서브프레임 - 왼쪽 프레임에서 오른쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {/* 노서라운드 모드에서는 서브프레임도 숨김 */}
      {/* 좌우측 뷰에서는 숨김 */}
      {showFrame && spaceInfo.surroundType !== 'no-surround' && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
        (spaceInfo.installType === 'semistanding' && wallConfig?.left)) && (() => {
        
        // 단내림 설정 확인
        const droppedCeilingEnabled = spaceInfo.droppedCeiling?.enabled ?? false;
        const droppedCeilingPosition = spaceInfo.droppedCeiling?.position ?? 'right';
        const dropHeight = spaceInfo.droppedCeiling?.dropHeight ?? 200;
        
        // 왼쫝이 단내림 영역인 경우
        if (droppedCeilingEnabled && droppedCeilingPosition === 'left') {
          const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
          const droppedFrameHeight = droppedHeight - floatHeight;
          const droppedCenterY = panelStartY + floatHeight + droppedFrameHeight/2;
          const droppedCeilingWidth = mmToThreeUnits(spaceInfo.droppedCeiling?.width || 900);

          console.log('🔥🔥🔥 [왼쪽 서브프레임 - 단내림] floatHeight:', floatHeight, 'droppedHeight:', droppedHeight, 'droppedFrameHeight:', droppedFrameHeight, 'droppedCenterY:', droppedCenterY);

          return (
            <>
              {/* 좌측 벽 안쪽 세로 서브프레임 (단내림 구간: 슬롯 가이드 정렬, 단내림 높이) */}
              <group
                position={[
                  xOffset + frameThickness.left - mmToThreeUnits(9),
                  droppedCenterY,
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(28)
                ]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <BoxWithEdges
          hideEdges={hideEdges}
                  key={`left-dropped-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                  args={[
                    mmToThreeUnits(44),
                    droppedFrameHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[0, 0, 0]}
                  material={createFrameMaterial('left')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                />
              </group>
              {/* 좌측 벽 안쪽 정면 프레임 (벽과 가구 사이 공간 메우기) */}
              <group
                position={[
                  xOffset + frameThickness.left / 2,
                  droppedCenterY,
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(3)
                ]}
              >
                <BoxWithEdges
          hideEdges={hideEdges}
                  key={`left-dropped-front-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                  args={[
                    frameThickness.left,
                    droppedFrameHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[0, 0, 0]}
                  material={createFrameMaterial('left')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                />
              </group>
            </>
          );
        }

        // 단내림이 없거나 오른쪽에 있는 경우 (일반구간)
        // 왼쪽이 단내림이면 이미 위에서 렌더링했으므로 여기서는 스킵
        if (!droppedCeilingEnabled || droppedCeilingPosition !== 'left') {
          return (
            <>
              {/* 세로 서브프레임 (슬롯 가이드 끝선에 맞춤: x축 +1mm 이동) */}
              <group
                position={[
                  xOffset + frameThickness.left - mmToThreeUnits(9),
                  sideFrameCenterY,
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(28)
                ]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <BoxWithEdges
            hideEdges={hideEdges}
                  key={`left-normal-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                  args={[
                    mmToThreeUnits(44),
                    adjustedPanelHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[0, 0, 0]}
                  material={createFrameMaterial('left')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                />
              </group>
            </>
          );
        }
        return null;
      })()}
      
      {/* 오른쪽 서브프레임 - 오른쪽 프레임에서 왼쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {/* 노서라운드 모드에서는 서브프레임도 숨김 */}
      {/* 좌우측 뷰에서는 숨김 */}
      {showFrame && spaceInfo.surroundType !== 'no-surround' && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
        (spaceInfo.installType === 'semistanding' && wallConfig?.right)) && (() => {
        
        // 단내림 설정 확인
        const droppedCeilingEnabled = spaceInfo.droppedCeiling?.enabled ?? false;
        const droppedCeilingPosition = spaceInfo.droppedCeiling?.position ?? 'right';
        const dropHeight = spaceInfo.droppedCeiling?.dropHeight ?? 200;
        
        // 오른쪽이 단내림 영역인 경우
        if (droppedCeilingEnabled && droppedCeilingPosition === 'right') {
          const droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
          const droppedFrameHeight = droppedHeight - floatHeight;
          const droppedCenterY = panelStartY + floatHeight + droppedFrameHeight/2;
          const droppedCeilingWidth = mmToThreeUnits(spaceInfo.droppedCeiling?.width || 900);

          console.log('🔥🔥🔥 [오른쪽 서브프레임 - 단내림] floatHeight:', floatHeight, 'droppedHeight:', droppedHeight, 'droppedFrameHeight:', droppedFrameHeight, 'droppedCenterY:', droppedCenterY);

          return (
            <>
              {/* 우측 벽 안쪽 정면 프레임 (벽과 가구 사이 공간 메우기) */}
              <group
                position={[
                  xOffset + width - frameThickness.right / 2,
                  droppedCenterY,
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 + mmToThreeUnits(3)
                ]}
              >
                <BoxWithEdges
          hideEdges={hideEdges}
                  key={`right-dropped-front-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                  args={[
                    frameThickness.right,
                    droppedFrameHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[0, 0, 0]}
                  material={createFrameMaterial('right')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                />
              </group>

              {/* 우측 벽 안쪽 세로 서브프레임 (단내림 구간: 슬롯 가이드 정렬, 단내림 높이) */}
              <group
                position={[
                  xOffset + width - frameThickness.right + mmToThreeUnits(9),
                  droppedCenterY,
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(28)
                ]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <BoxWithEdges
          hideEdges={hideEdges}
                  key={`right-dropped-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                  args={[
                    mmToThreeUnits(44),
                    droppedFrameHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[0, 0, 0]}
                  material={createFrameMaterial('right')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                />
              </group>
            </>
          );
        }

        // 단내림이 없거나 왼쪽에 있는 경우 (일반구간)
        // 오른쪽이 단내림이면 이미 위에서 렌더링했으므로 여기서는 스킵
        if (!droppedCeilingEnabled || droppedCeilingPosition !== 'right') {
          return (
            <>
              {/* 세로 서브프레임 (슬롯 가이드 끝선에 맞춤: x축 -1mm 이동) */}
              <group
                position={[
                  xOffset + width - frameThickness.right + mmToThreeUnits(9),
                  sideFrameCenterY,
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(28)
                ]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <BoxWithEdges
            hideEdges={hideEdges}
                  key={`right-normal-vertical-${materialConfig?.doorColor}-${materialConfig?.doorTexture}`}
                  args={[
                    mmToThreeUnits(44),
                    adjustedPanelHeight,
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[0, 0, 0]}
                  material={createFrameMaterial('right')}
                  renderMode={renderMode}
                  shadowEnabled={shadowEnabled}
                />
              </group>
            </>
          );
        }
        return null;
      })()}
      
      {/* 하단 프레임 - 받침대 역할 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 받침대가 있는 경우에만 렌더링 */}
      {/* 하부 베이스프레임 - 측면 뷰에서도 표시 */}
      {showFrame && baseFrameHeightMm > 0 && spaceInfo.baseConfig?.type === 'floor' && (() => {
        console.log('🎯 베이스프레임 높이 확인:', {
          '최종_높이': baseFrameHeightMm,
          baseFrameHeight_ThreeUnits: baseFrameHeight,
          spaceInfo_baseConfig: spaceInfo.baseConfig,
          END_PANEL_THICKNESS
        });
        return (
        <>
          {/* 노서라운드 모드에서 하부프레임 폭 디버깅 */}
          {/* spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [하부프레임] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${baseFrame.width.toFixed(2)}`) */}
          
          {/* 기둥이 있는 경우 하부 프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            
            // 슬롯 가이드와 동일한 범위 사용 - 모든 모드에서 calculateZoneSlotInfo 사용
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            
            // 단내림이 활성화된 경우 두 영역 모두에 하부프레임 렌더링
            const renderZones = [];
            
            if (spaceInfo.droppedCeiling?.enabled && zoneInfo.dropped) {
              // 단내림 구간 추가
              renderZones.push({
                zone: 'dropped',
                startX: zoneInfo.dropped.startX,
                width: zoneInfo.dropped.width,
                endX: zoneInfo.dropped.startX + zoneInfo.dropped.width
              });
              // 메인 구간 추가
              renderZones.push({
                zone: 'normal',
                startX: zoneInfo.normal.startX,
                width: zoneInfo.normal.width,
                endX: zoneInfo.normal.startX + zoneInfo.normal.width
              });
            } else {
              // 단내림이 없는 경우 메인 구간만
              renderZones.push({
                zone: 'normal',
                startX: zoneInfo.normal.startX,
                width: zoneInfo.normal.width,
                endX: zoneInfo.normal.startX + zoneInfo.normal.width
              });
            }
            
            // 각 영역에 대해 하부프레임 렌더링
            return renderZones.map((renderZone, zoneIndex) => {
              // mm 단위를 Three.js 단위로 변환 - 노서라운드에서 엔드패널 제외
              let frameStartX = mmToThreeUnits(renderZone.startX);
              let frameEndX = mmToThreeUnits(renderZone.endX);
              
              // 노서라운드 모드에서 세미스탠딩/프리스탠딩은 엔드패널을 제외한 프레임 범위 계산
              if (spaceInfo.surroundType === 'no-surround' && 
                  (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing' || 
                   spaceInfo.installType === 'freestanding')) {
                // 엔드패널이 있는 쪽은 프레임 범위에서 제외
                if (endPanelPositions.left) {
                  frameStartX += mmToThreeUnits(END_PANEL_THICKNESS);
                }
                if (endPanelPositions.right) {
                  frameEndX -= mmToThreeUnits(END_PANEL_THICKNESS);
                }
              }
              
              const frameWidth = frameEndX - frameStartX;
              const frameX = (frameStartX + frameEndX) / 2;
            
              // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
              const hasDeepColumns = columns.some(column => column.depth >= 730);
              
              // console.log('🔧 [하부프레임 윗면] 기둥 분절 확인:', {
              //   columnsCount: columns.length,
              //   hasDeepColumns,
              //   columnDepths: columns.map(c => c.depth)
              // });
              
              if (columns.length === 0 || !hasDeepColumns) {
                // 기둥이 없거나 모든 기둥이 729mm 이하면 기존처럼 하나의 프레임으로 렌더링
                console.log('🔧 하부프레임 엔드패널 조정:', {
                  원래너비: renderZone.width,
                  조정된너비: frameWidth,
                  왼쪽엔드패널: endPanelPositions.left,
                  오른쪽엔드패널: endPanelPositions.right,
                  frameStartX,
                  frameEndX,
                  frameX
                });
                
                return (
                  <BoxWithEdges
          hideEdges={hideEdges}
                    key={`base-frame-zone-${zoneIndex}`}
                    args={[
                      frameWidth, // 이미 엔드패널이 조정된 너비
                      baseFrameHeight, 
                      mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                    ]}
                    position={[
                      frameX, // 이미 엔드패널이 조정된 위치
                      panelStartY + floatHeight + baseFrameHeight/2, // 띄움배치 시 floatHeight 추가
                      // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                      // 받침대 깊이만큼 뒤로 이동
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 -
                      mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo)) -
                      mmToThreeUnits(spaceInfo.baseConfig?.depth ?? 0)
                    ]}
                    material={createFrameMaterial('base')}
                    renderMode={renderMode}
                  
          shadowEnabled={shadowEnabled}
        />
                );
              }
            
              // 기둥이 있는 경우 분절된 프레임들 렌더링
              const frameSegments: Array<{
                width: number;
                x: number;
              }> = [];
              
              // 프레임 범위는 이미 엔드패널이 조정되어 있음
              const adjustedFrameStartXCalc = frameStartX;
              const adjustedFrameEndXCalc = frameEndX;
              
              console.log('🔧 하부프레임 분절 엔드패널 조정:', {
                조정된시작: adjustedFrameStartXCalc,
                조정된끝: adjustedFrameEndXCalc,
                왼쪽엔드패널: endPanelPositions.left,
                오른쪽엔드패널: endPanelPositions.right
              });
              
              // 기둥들을 X 위치 기준으로 정렬
              const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);
              
              let currentX = adjustedFrameStartXCalc;
              
              // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
              sortedColumns.forEach((column, index) => {
                const columnWidthM = column.width * 0.01; // mm to Three.js units
                const columnLeftX = column.position[0] - columnWidthM / 2;
                const columnRightX = column.position[0] + columnWidthM / 2;
                
                // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
                if (columnLeftX < adjustedFrameEndXCalc && columnRightX > adjustedFrameStartXCalc && column.depth >= 730) {
                  // 기둥 왼쪽 프레임 세그먼트
                  const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                  if (leftSegmentWidth > 0) {
                    frameSegments.push({
                      width: leftSegmentWidth,
                      x: currentX + leftSegmentWidth / 2
                    });
                  }
                  
                  // 다음 세그먼트 시작점을 기둥 오른쪽으로 설정
                  currentX = columnRightX;
                }
              });
              
              // 마지막 세그먼트 (마지막 기둥 오른쪽)
              const lastSegmentWidth = Math.max(0, adjustedFrameEndXCalc - currentX);
              if (lastSegmentWidth > 0) {
                frameSegments.push({
                  width: lastSegmentWidth,
                  x: currentX + lastSegmentWidth / 2
                });
              }
            
              // 분절된 프레임들 렌더링 (분절이 없으면 기본 프레임 렌더링)
              if (frameSegments.length === 0) {
                return (
                  <BoxWithEdges
          hideEdges={hideEdges}
                    key={`base-frame-zone-${zoneIndex}`}
                    args={[
                      frameWidth, 
                      baseFrameHeight, 
                      mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                    ]}
                    position={[
                      frameX, // 중앙 정렬
                      panelStartY + floatHeight + baseFrameHeight/2, // 띄움배치 시 floatHeight 추가
                      // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                      // 받침대 깊이만큼 뒤로 이동
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 -
                      mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo)) -
                      mmToThreeUnits(spaceInfo.baseConfig?.depth ?? 0)
                    ]}
                    material={createFrameMaterial('base')}
                    renderMode={renderMode}
                  
          shadowEnabled={shadowEnabled}
        />
                );
              }
              
              return frameSegments.map((segment, segmentIndex) => {
                if (!baseFrameMaterial) {
                  console.warn(`⚠️ Base frame segment ${segmentIndex} - material not ready, using default`);
                } else {
                  console.log(`🎨 Base frame segment ${segmentIndex} material:`, {
                    hasBaseFrameMaterial: !!baseFrameMaterial,
                    materialType: baseFrameMaterial?.type,
                    materialColor: baseFrameMaterial && 'color' in baseFrameMaterial ? (baseFrameMaterial as any).color.getHexString() : 'unknown',
                    materialTexture: baseFrameMaterial && 'map' in baseFrameMaterial ? !!(baseFrameMaterial as any).map : false,
                    doorColor: materialConfig?.doorColor,
                    doorTexture: materialConfig?.doorTexture,
                    segmentWidth: segment.width
                  });
                }
                
                return (
                  <BoxWithEdges
          hideEdges={hideEdges}
                    key={`base-frame-zone-${zoneIndex}-segment-${segmentIndex}`}
                    args={[
                      segment.width,
                      baseFrameHeight, 
                      mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                    ]}
                    position={[
                      segment.x, // 분절된 위치
                      panelStartY + floatHeight + baseFrameHeight/2, // 띄움배치 시 floatHeight 추가
                      // 상단 프레임과 같은 z축 위치에서 END_PANEL_THICKNESS 뒤로 이동
                      // 받침대 깊이만큼 뒤로 이동
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(END_PANEL_THICKNESS) -
                      mmToThreeUnits(spaceInfo.baseConfig?.depth ?? 0)
                    ]}
                    material={createFrameMaterial('base')}
                    renderMode={renderMode}
                  
          shadowEnabled={shadowEnabled}
        />
                );
              });
            });
          })()}
        </>
      );
      })()}
      
      {/* 하단 서브프레임 제거됨 */}
      
      {/* 배치된 가구들 */}
      {placedModules ? (
        // placedModules prop이 전달된 경우 (뷰어 모드)
        <>
          {(() => {
            // 1. activeZone이 있고 단내림이 활성화된 경우 zone 기준 필터링
            let filteredModules = activeZone && spaceInfo.droppedCeiling?.enabled && placedModules.length > 0
              ? placedModules.filter(module => module.zone === activeZone)
              : placedModules;

            // 2. 측면뷰이고 selectedSlotIndex가 있는 경우 slotIndex 기준 필터링
            if (
              viewMode === '2D' &&
              (view2DDirection === 'left' || view2DDirection === 'right') &&
              selectedSlotIndex !== null
            ) {
              filteredModules = filteredModules.filter(module => {
                if (module.slotIndex === undefined) return false;

                // 듀얼 가구인 경우: 시작 슬롯 또는 다음 슬롯 확인
                if (module.isDualSlot) {
                  return module.slotIndex === selectedSlotIndex || module.slotIndex + 1 === selectedSlotIndex;
                }

                // 싱글 가구인 경우: 정확히 일치하는 슬롯만
                return module.slotIndex === selectedSlotIndex;
              });
            }

            console.log('🔥 Room - PlacedFurnitureContainer 렌더링 (뷰어 모드):', {
              roomId: roomId.substring(0, 20),
              viewMode,
              renderMode,
              activeZone,
              selectedSlotIndex,
              view2DDirection,
              originalCount: placedModules?.length || 0,
              filteredCount: filteredModules?.length || 0,
              placedModules: filteredModules
            });

            return (
              <PlacedFurnitureContainer
                viewMode={viewMode}
                view2DDirection={view2DDirection}
                renderMode={renderMode}
                placedModules={filteredModules}
                showFurniture={showFurniture}
                readOnly={readOnly}
                onFurnitureClick={onFurnitureClick}
                ghostHighlightSlotIndex={ghostHighlightSlotIndex}
              />
            );
          })()}
        </>
      ) : (
        // placedModules prop이 없는 경우 (에디터 모드)
        <>
          {console.log('🔥 Room - PlacedFurnitureContainer 렌더링 (에디터 모드):', {
            roomId: roomId.substring(0, 20),
            viewMode,
            renderMode,
            view2DDirection,
            activeZone,
            selectedSlotIndex,
            timestamp: Date.now()
          })}
          <PlacedFurnitureContainer
            viewMode={viewMode}
            view2DDirection={view2DDirection}
            renderMode={renderMode}
            activeZone={activeZone}
            showFurniture={showFurniture}
            readOnly={readOnly}
            onFurnitureClick={onFurnitureClick}
            ghostHighlightSlotIndex={ghostHighlightSlotIndex}
          />
        </>
      )}
    </group>
  );
};

// Room 컴포넌트를 메모이제이션하여 불필요한 리렌더링 방지
export default React.memo(Room, (prevProps, nextProps) => {
  // 기본 props 비교
  if (prevProps.viewMode !== nextProps.viewMode) return false;
  if (prevProps.view2DDirection !== nextProps.view2DDirection) return false;
  if (prevProps.renderMode !== nextProps.renderMode) return false;
  if (prevProps.showAll !== nextProps.showAll) return false;
  if (prevProps.floorColor !== nextProps.floorColor) return false;
  if (prevProps.showFrame !== nextProps.showFrame) return false;
  if (prevProps.showDimensions !== nextProps.showDimensions) return false;
  if (prevProps.showFurniture !== nextProps.showFurniture) return false;
  if (prevProps.isStep2 !== nextProps.isStep2) return false;
  if (prevProps.activeZone !== nextProps.activeZone) return false;
  if (prevProps.ghostHighlightSlotIndex !== nextProps.ghostHighlightSlotIndex) return false;

  // spaceInfo 비교 (크기와 재질만 비교, 기둥 제외)
  const prevSpace = prevProps.spaceInfo;
  const nextSpace = nextProps.spaceInfo;
  
  if (prevSpace.width !== nextSpace.width) return false;
  if (prevSpace.height !== nextSpace.height) return false;
  if (prevSpace.depth !== nextSpace.depth) return false;
  if (prevSpace.leftSurround !== nextSpace.leftSurround) return false;
  if (prevSpace.rightSurround !== nextSpace.rightSurround) return false;
  if (prevSpace.hasWallFinish !== nextSpace.hasWallFinish) return false;
  if (prevSpace.wallFinishThickness !== nextSpace.wallFinishThickness) return false;
  if (prevSpace.hasFloorFinish !== nextSpace.hasFloorFinish) return false;
  if (prevSpace.floorFinishThickness !== nextSpace.floorFinishThickness) return false;
  
  // surroundType 비교 (노서라운드 설정 변경 시 프레임 업데이트)
  if (prevSpace.surroundType !== nextSpace.surroundType) return false;
  
  // frameSize 비교 (프레임 크기 변경 시 업데이트)
  if (JSON.stringify(prevSpace.frameSize) !== JSON.stringify(nextSpace.frameSize)) return false;
  
  // 재질 설정 비교
  if (JSON.stringify(prevSpace.materialConfig) !== JSON.stringify(nextSpace.materialConfig)) return false;
  if (JSON.stringify(prevProps.materialConfig) !== JSON.stringify(nextProps.materialConfig)) return false;
  
  // baseConfig 비교 (설치 타입 변경 시 벽 높이 업데이트를 위해)
  if (JSON.stringify(prevSpace.baseConfig) !== JSON.stringify(nextSpace.baseConfig)) return false;
  
  // installType과 wallConfig 비교 (벽 렌더링에 영향)
  if (prevSpace.installType !== nextSpace.installType) return false;
  if (JSON.stringify(prevSpace.wallConfig) !== JSON.stringify(nextSpace.wallConfig)) return false;
  
  // gapConfig 비교 (노서라운드 모드에서 엔드패널 위치에 영향)
  if (JSON.stringify(prevSpace.gapConfig) !== JSON.stringify(nextSpace.gapConfig)) return false;
  
  // 가구 배치 비교 (빠른 비교를 위해 길이만 우선 확인)
  const prevModules = prevProps.placedModules || [];
  const nextModules = nextProps.placedModules || [];
  if (prevModules.length !== nextModules.length) return false;
  
  // 기둥 배열이 변경되었는지 확인 (프레임 분절에 영향)
  const prevColumns = prevSpace.columns || [];
  const nextColumns = nextSpace.columns || [];
  
  // 기둥 개수가 다르면 리렌더
  if (prevColumns.length !== nextColumns.length) return false;
  
  // 기둥의 위치가 크게 변경되었는지 확인 (아주 작은 변화는 무시)
  for (let i = 0; i < prevColumns.length; i++) {
    const prevCol = prevColumns[i];
    const nextCol = nextColumns.find(c => c.id === prevCol.id);
    if (!nextCol) return false;
    
    // 위치 차이가 0.01 이상이면 리렌더 (약 1mm)
    if (Math.abs(prevCol.position[0] - nextCol.position[0]) > 0.01) return false;
    if (Math.abs(prevCol.position[2] - nextCol.position[2]) > 0.01) return false;
    
    // 크기가 변경되면 리렌더
    if (prevCol.width !== nextCol.width) return false;
    if (prevCol.depth !== nextCol.depth) return false;
    if (prevCol.height !== nextCol.height) return false;
  }
  
  // 모든 비교를 통과하면 리렌더링하지 않음
  return true;
}); 
