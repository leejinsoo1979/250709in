import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';
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
import { getNormalZoneBounds, getDroppedZoneBounds } from '@/editor/shared/utils/space/droppedCeilingUtils';
import { MaterialFactory } from '../../utils/materials/MaterialFactory';
import { useSpace3DView } from '../../context/useSpace3DView';
import PlacedFurnitureContainer from './furniture/PlacedFurnitureContainer';
import { useFurnitureStore } from '@/store/core/furnitureStore';

interface RoomProps {
  spaceInfo: SpaceInfo;
  floorColor?: string;
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
  renderMode?: 'solid' | 'wireframe';
  materialConfig?: {
    doorColor: string;
    doorTexture?: string;
  };
  showAll?: boolean;
  showFurniture?: boolean; // 가구 표시 여부
  placedModules?: any[]; // 뷰어 모드용 가구 데이터
  showFrame?: boolean; // 프레임 표시 여부
  showDimensions?: boolean; // 치수 표시 여부
  isStep2?: boolean; // Step2 여부
  activeZone?: 'normal' | 'dropped'; // 활성 영역
  isReadOnly?: boolean; // 읽기 전용 모드 (미리보기용)
}

// mm를 Three.js 단위로 변환 (1mm = 0.01 Three.js units)
const mmToThreeUnits = (mm: number): number => mm * 0.01;

const END_PANEL_THICKNESS = 18; // 18mm로 통일

// 노서라운드 모드에서 엔드패널과 이격거리를 계산하는 헬퍼 함수
const calculateNoSurroundOffset = (spaceInfo: SpaceInfo, side: 'left' | 'right'): number => {
  if (spaceInfo.surroundType !== 'no-surround') return 0;
  
  const gapConfig = spaceInfo.gapConfig || { left: 20, right: 20 };
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
}> = ({ args, position, material, renderMode, onBeforeRender, viewMode: viewModeProp, view2DTheme, isEndPanel = false }) => {
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args[0], args[1], args[2]]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const { viewMode: contextViewMode } = useSpace3DView();
  const viewMode = viewModeProp || contextViewMode;
  const { theme } = useViewerTheme();
  const { view2DTheme: storeView2DTheme } = useUIStore();
  const actualView2DTheme = view2DTheme || storeView2DTheme || 'light';
  
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
        <mesh geometry={geometry} receiveShadow={viewMode === '3D'} castShadow={viewMode === '3D'} onBeforeRender={onBeforeRender}>
          <primitive object={material} />
        </mesh>
      )}
      {/* 모서리 라인 렌더링 - 항상 표시 */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial 
          color={
            // 3D 모드에서는 가구와 동일한 회색
            viewMode === '3D'
              ? "#505050"
              // 2D 모드에서 엔드패널인 경우 도어와 같은 연두색 사용
              : viewMode === '2D' && isEndPanel 
                ? "#00FF00" // 연두색 (도어 색상)
                : renderMode === 'wireframe' 
                  ? (actualView2DTheme === 'dark' ? "#FFFFFF" : "#000000") // 2D wireframe에서 다크모드는 흰색, 라이트모드는 검정색
                  : (actualView2DTheme === 'dark' ? "#FFFFFF" : "#666666")
          } 
          linewidth={viewMode === '2D' && actualView2DTheme === 'dark' ? 1.5 : 0.5}
          opacity={viewMode === '3D' ? 0.9 : 1.0}
          transparent={viewMode === '3D'}
        />
      </lineSegments>
    </group>
  );
};

const Room: React.FC<RoomProps> = ({
  spaceInfo,
  floorColor = '#B89B87',  // 옐로우를 뺀 그레이시 브라운 톤
  viewMode = '3D',
  view2DDirection,
  materialConfig,
  showAll = true,
  showFurniture = true,
  showFrame = true,
  placedModules,
  showDimensions,
  isStep2,
  renderMode: renderModeProp,
  activeZone,
  isReadOnly = false
}) => {
  // 고유 ID로 어떤 Room 인스턴스인지 구분
  const roomId = React.useRef(`room-${Date.now()}-${Math.random()}`).current;
  if (!spaceInfo || typeof spaceInfo.width !== 'number' || typeof spaceInfo.height !== 'number') {
    return null;
  }
  const { theme } = useViewerTheme();
  
  // furnitureStore에서 배치된 가구 정보 가져오기
  const placedModulesFromStore = useFurnitureStore((state) => state.placedModules);
  const actualPlacedModules = placedModules || placedModulesFromStore;
  
  console.log('🔵 Room Component - Placed Modules:', {
    placedModules,
    placedModulesFromStore,
    actualPlacedModules
  });
  const { colors } = useThemeColors();
  const { renderMode: contextRenderMode } = useSpace3DView(); // context에서 renderMode 가져오기
  const renderMode = renderModeProp || contextRenderMode; // props로 전달된 값을 우선 사용
  const { highlightedFrame, activeDroppedCeilingTab, view2DTheme } = useUIStore(); // 강조된 프레임 상태 및 활성 탭 가져오기
  
  // 바닥 마감재 material을 useMemo로 캐싱하여 재생성 방지
  const floorFinishMaterial = useMemo(() => {
    return new THREE.MeshLambertMaterial({
      color: floorColor,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }, [floorColor]);
  
  // spaceInfo 변경 시 재계산되도록 메모이제이션
  const dimensions = useMemo(() => {
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
    const furnitureDepthMm = calculateFurnitureDepth(placedModules); // 가구/프레임용 (동적 계산)
    const frameThicknessMm = calculateFrameThickness(spaceInfo);
    console.log('🔥 calculateDimensionsAndFrames 내부 - frameThicknessMm 계산 직후:', {
      frameThicknessMm,
      wallConfig: spaceInfo.wallConfig,
      installType: spaceInfo.installType,
      surroundType: spaceInfo.surroundType
    });
    const baseFrameMm = calculateBaseFrameWidth(spaceInfo);
    const topBottomFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
    const baseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);
    
    // 하부프레임 높이 체크
    console.log('🔴🔴🔴 baseFrameHeightMm 계산 결과:', {
      baseFrameHeightMm,
      'spaceInfo.baseConfig': spaceInfo.baseConfig,
      '단내림': spaceInfo.droppedCeiling?.enabled,
      '기둥 개수': spaceInfo.columns?.length || 0
    });
    
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
  }, [spaceInfo.width, spaceInfo.height, spaceInfo.depth, spaceInfo.installType, spaceInfo.surroundType, spaceInfo.baseConfig, spaceInfo.floorFinish, spaceInfo.frameSize, spaceInfo.wallConfig, placedModules]);
  
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
    const columns = spaceInfo.columns || [];
    const hasDeepColumns = columns.some(column => column.depth >= 730);
    
    if (columns.length === 0 || !hasDeepColumns) {
      return null; // 분절 없음
    }
    
    // 노서라운드일 때는 엔드패널 안쪽 범위 사용
    let frameWidth, frameX;
    if (spaceInfo.surroundType === 'no-surround') {
      const indexing = calculateSpaceIndexing(spaceInfo);
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
  }, [spaceInfo.columns, spaceInfo.surroundType, spaceInfo.width, spaceInfo.gapConfig?.left, spaceInfo.gapConfig?.right, baseFrame.width, frameThickness.left, width]);

  
  // 공통 프레임 재질 생성 함수 (도어와 동일한 재질로 통일)
  const createFrameMaterial = useCallback((frameType?: 'left' | 'right' | 'top' | 'base') => {
    // 2D 다크모드에서는 더 밝은 색상 사용
    const defaultColor = (viewMode === '2D' && view2DTheme === 'dark') ? '#F0F0F0' : '#E0E0E0';
    
    // 2D에서 베이스프레임은 투명하게 표시
    const frameColor = materialConfig?.doorColor || defaultColor;
    let baseFrameTransparent = false;
    if (viewMode === '2D' && frameType === 'base') {
      baseFrameTransparent = true;
    }
    
    const isHighlighted = frameType && highlightedFrame === frameType;
    
    console.log(`🎨 Creating frame material for ${frameType}:`, {
      frameType,
      frameColor,
      doorTexture: materialConfig?.doorTexture,
      isHighlighted,
      viewMode,
      view2DTheme
    });
    
    // 와이어프레임 모드에서 강조 효과를 더 명확하게
    const highlightColor = renderMode === 'wireframe' ? '#FFFF00' : '#FF0000'; // 와이어프레임에서는 노란색
    const highlightEmissive = renderMode === 'wireframe' ? 0x444400 : 0x220000; // 와이어프레임에서는 노란 자체발광
    const highlightOpacity = renderMode === 'wireframe' ? 0.6 : 0.6; // 와이어프레임에서 더 불투명하게
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isHighlighted ? highlightColor : frameColor), // 강조 시 색상 변경
      metalness: 0.0,        // 완전 비금속 (도어와 동일)
      roughness: 0.6,        // 도어와 동일한 거칠기
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(isHighlighted ? highlightEmissive : 0x000000),  // 강조 시 자체발광 추가
      emissiveIntensity: isHighlighted ? 1.0 : 0.0, // 강조 시 발광 강도
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isHighlighted || baseFrameTransparent,  // 강조 시에도 투명하게
      opacity: baseFrameTransparent ? 0 : renderMode === 'wireframe' ? (isHighlighted ? highlightOpacity : 0) : (viewMode === '2D' && renderMode === 'solid') ? 0.8 : isHighlighted ? 0.6 : 1.0,  // 와이어프레임에서는 완전 투명
    });

    // 프레임 텍스처 적용 (강조되지 않은 경우에만)
    if (!isHighlighted && materialConfig?.doorTexture) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isCabinetTexture1(materialConfig.doorTexture)) {
        console.log('🔧 프레임 Cabinet Texture1 즉시 어둡게 적용 중...');
        applyCabinetTexture1Settings(material);
        console.log('✅ 프레임 Cabinet Texture1 즉시 색상 적용 완료 (공통 설정 사용)');
      }
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        materialConfig.doorTexture,
        (texture) => {
          console.log('🔧 프레임 텍스처 로딩 성공:', materialConfig.doorTexture);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);
          material.map = texture;
          
          // Cabinet Texture1이 아닌 경우에만 기본 설정 적용
          if (!isCabinetTexture1(materialConfig.doorTexture)) {
            material.color.setHex(0xffffff); // 다른 텍스처는 기본 흰색
            material.toneMapped = true; // 기본 톤 매핑 활성화
            material.roughness = 0.6; // 기본 거칠기
          }
          
          material.needsUpdate = true;
        },
        undefined,
        (error) => {
          console.error('❌ 프레임 텍스처 로딩 실패:', materialConfig.doorTexture, error);
        }
      );
    }
    
    return material;
  }, [materialConfig?.doorColor, materialConfig?.doorTexture, renderMode, viewMode, view2DTheme, highlightedFrame, spaceInfo.frameSize, spaceInfo.baseConfig]);

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
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('left');
    setLeftFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('left');
    setLeftSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('right');
    setRightFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('right');
    setRightSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('top');
    setTopFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, highlightedFrame]);
  useEffect(() => {
    const mat = createFrameMaterial('top');
    setTopSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture, highlightedFrame]);
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
  

  
  // 3D 룸 중앙 정렬을 위한 오프셋 계산
  const xOffset = -width / 2; // 가로 중앙 (전체 폭의 절반을 왼쪽으로)
  const yOffset = 0; // 바닥 기준
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙 (앞뒤 대칭)
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 가구/프레임용 깊이: 뒷벽에서 600mm만 나오도록
  
  // 전체 그룹을 z축 방향으로 약간 조정 (앞으로 당겨서 중앙에 오도록)
  const groupZOffset = 0; // 필요에 따라 조정 가능 (양수: 앞으로, 음수: 뒤로)
  
  // 공간 메쉬 확장 깊이 (1200mm = 12 Three.js units)
  const extensionDepth = mmToThreeUnits(1200);
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
  const backZ = -mmToThreeUnits(internalSpace.depth / 2); // 세로 가이드 선 위치
  
  // 바닥 슬롯 메쉬와 동일한 깊이 계산
  const frameEndZ = furnitureZOffset + furnitureDepth/2; // 좌우 프레임의 앞쪽 끝
  const slotFloorDepth = frameEndZ - backZ; // 바닥 슬롯 메쉬 깊이
  
  // 디버그용 - 엔드패널 깊이 차이 확인
  if (spaceInfo.installType === 'freestanding' || 
      (spaceInfo.installType === 'semistanding' && (!wallConfig?.left || !wallConfig?.right))) {
    console.log('🔍 엔드패널 깊이 비교:', {
      서라운드_깊이mm: slotFloorDepth / 0.01,
      노서라운드_깊이mm: (slotFloorDepth - mmToThreeUnits(END_PANEL_THICKNESS)) / 0.01,
      차이mm: END_PANEL_THICKNESS,
      slotFloorDepth,
      노서라운드깊이: slotFloorDepth - mmToThreeUnits(20)
    });
  }

  return (
    <group position={[0, 0, groupZOffset]}>
      {/* 주변 벽면들 - ShaderMaterial 기반 그라데이션 (3D 모드에서만 표시) */}
      {console.log('🔍 Room viewMode 체크:', viewMode, typeof viewMode)}
      {viewMode !== '2D' && (
        <>
          {/* 왼쪽 외부 벽면 - 단내림 고려 */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 왼쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {console.log('🔍 왼쪽 벽 installType 체크:', {
            installType: spaceInfo.installType,
            wallConfig,
            wallConfigLeft: wallConfig?.left,
            condition: (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
              (spaceInfo.installType === 'semistanding' && wallConfig?.left))
          })}
          {(spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
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
              // 단내림 벽 높이 = 전체 높이 - 단내림 높이차
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
                  position={[-width/2 - 0.001, droppedCenterY, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <planeGeometry args={[extendedPanelDepth, droppedWallHeight]} />
                  <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal')} />
                </mesh>
              );
            }
            
            // 단내림이 없거나 오른쪽 단내림인 경우 기존 렌더링
            if (!hasDroppedCeiling || !isLeftDropped) {
              return (
              <mesh
                position={[-width/2 - 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <planeGeometry args={[extendedPanelDepth, height]} />
                <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal')} />
              </mesh>
              );
            }
            
            return null;
          })()}
          
          {/* 오른쪽 외부 벽면 - 단내림 고려 */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 오른쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {(spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
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
              // 단내림 벽 높이 = 전체 높이 - 단내림 높이차
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
                  position={[width/2 + 0.001, droppedCenterY, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <planeGeometry args={[extendedPanelDepth, droppedWallHeight]} />
                  <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse')} />
                </mesh>
              );
            }
            
            // 단내림이 없거나 왼쪽에 있는 경우 전체 높이로 렌더링
            if (!hasDroppedCeiling || !isRightDropped) {
              return (
              <mesh
                position={[width/2 + 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
                rotation={[0, -Math.PI / 2, 0]}
              >
                <planeGeometry args={[extendedPanelDepth, height]} />
                <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse')} />
              </mesh>
              );
            }
            
            return null;
          })()}
          
          {/* 상단 외부 벽면 (천장) - 단내림이 있는 경우 분할 - 탑뷰에서는 숨김 */}
          {viewMode !== '2D' && (() => {
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
            const droppedWidth = hasDroppedCeiling && spaceInfo.droppedCeiling 
              ? mmToThreeUnits(spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH)
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
                  <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical-reverse')} />
                </mesh>
              );
            }
            
            // 천장은 프레임 영역을 포함한 전체 너비로 렌더링
            // 단내림이 있는 경우 천장을 두 영역으로 분할
            
            // 좌우 공간 축소값 계산 (프레임 또는 이격거리/엔드패널)
            let leftReduction = 0;
            let rightReduction = 0;
            
            if (spaceInfo.surroundType === 'surround') {
              const frameThickness = calculateFrameThickness(spaceInfo);
              leftReduction = frameThickness.left;
              rightReduction = frameThickness.right;
            } else {
              // 노서라운드: 이격거리 또는 엔드패널
              if (spaceInfo.installType === 'builtin') {
                leftReduction = 2;
                rightReduction = 2;
              } else if (spaceInfo.installType === 'semistanding') {
                if (spaceInfo.wallConfig?.left) {
                  leftReduction = 2;
                  rightReduction = END_PANEL_THICKNESS;
                } else {
                  leftReduction = END_PANEL_THICKNESS;
                  rightReduction = 2;
                }
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
              calculatedTotal: (droppedAreaWidth + normalAreaWidth + mmToThreeUnits(leftReduction) + mmToThreeUnits(rightReduction)) / 0.01
            });
            
            return (
              <>
                {/* 단내림 영역 천장 (낮은 높이) */}
                <mesh
                  position={[droppedAreaX, panelStartY + height - droppedCeilingHeight + 0.001, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[droppedAreaWidth, extendedPanelDepth]} />
                  <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical-reverse')} />
                </mesh>
                
                {/* 일반 영역 천장 (원래 높이) */}
                <mesh
                  position={[normalAreaX, panelStartY + height + 0.001, extendedZOffset + extendedPanelDepth/2]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[normalAreaWidth, extendedPanelDepth]} />
                  <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical-reverse')} />
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
              <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical')} />
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
              position={[xOffset + width/2, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
            >
              <planeGeometry args={[width, extendedPanelDepth]} />
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
          >
            <planeGeometry args={[0.02, height]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 오른쪽 세로 모서리 (우측벽과 뒷벽 사이) */}
          <mesh
            position={[width/2, panelStartY + height/2, zOffset + panelDepth/2]}
            rotation={[0, 0, 0]}
          >
            <planeGeometry args={[0.02, height]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 상단 가로 모서리 (천장과 뒷벽 사이) */}
          <mesh
            position={[xOffset + width/2, panelStartY + height, zOffset + panelDepth/2]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <planeGeometry args={[0.02, width]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 하단 가로 모서리 (바닥과 뒷벽 사이) */}
          <mesh
            position={[xOffset + width/2, panelStartY, zOffset + panelDepth/2]}
            rotation={[0, 0, Math.PI / 2]}
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
          
          {/* 뒷벽 - 단내림이 있으면 높이만 분할, 없으면 전체 렌더링 */}
          {/* 뒷벽 숨김 처리 - 주석 처리 */}
          {/* {(() => {
            if (spaceInfo.droppedCeiling?.enabled) {
              // 단내림이 있는 경우 - 뒷벽을 두 부분으로 분할 (높이만)
              const isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
              const droppedCeilingHeight = mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight || 200);
              const droppedWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH);
              const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
              
              // 단내림 경계 X 위치 계산
              const boundaryX = isLeftDropped 
                ? mmToThreeUnits(zoneInfo.normal.startX)
                : mmToThreeUnits(zoneInfo.dropped.startX);
              
              // 각 영역의 높이 계산
              const normalHeight = height; // 일반 영역은 전체 높이
              const droppedHeight = height - droppedCeilingHeight; // 단내림 영역은 낮은 높이
              
              // 뒷벽 영역별 너비와 위치 계산
              let normalSectionWidth, droppedSectionWidth;
              let normalSectionX, droppedSectionX;
              
              if (isLeftDropped) {
                // 왼쪽 단내림
                droppedSectionWidth = droppedWidth;
                normalSectionWidth = width - droppedWidth;
                droppedSectionX = xOffset + droppedSectionWidth/2;
                normalSectionX = xOffset + droppedWidth + normalSectionWidth/2;
              } else {
                // 오른쪽 단내림
                normalSectionWidth = width - droppedWidth;
                droppedSectionWidth = droppedWidth;
                normalSectionX = xOffset + normalSectionWidth/2;
                droppedSectionX = xOffset + normalSectionWidth + droppedSectionWidth/2;
              }
              
              return (
                <>
                  {/* 일반 영역 뒷벽 */}
                  {/* <mesh
                    position={[normalSectionX, panelStartY + normalHeight/2, extendedZOffset]}
                    rotation={[0, 0, 0]}
                  >
                    <planeGeometry args={[normalSectionWidth, normalHeight]} />
                    <meshStandardMaterial 
                      color="#e8e8e8" 
                      roughness={0.8}
                      metalness={0.0}
                      side={THREE.DoubleSide}
                    />
                  </mesh> */}
                  
                  {/* 단내림 영역 뒷벽 (높이가 낮음) */}
                  {/* <mesh
                    position={[droppedSectionX, panelStartY + droppedHeight/2, extendedZOffset]}
                    rotation={[0, 0, 0]}
                  >
                    <planeGeometry args={[droppedSectionWidth, droppedHeight]} />
                    <meshStandardMaterial 
                      color="#e8e8e8" 
                      roughness={0.8}
                      metalness={0.0}
                      side={THREE.DoubleSide}
                    />
                  </mesh> */}
                {/* </> 
              );
            } else {
              // 단내림이 없는 경우 - 기존처럼 전체 뒷벽 렌더링
              return (
                <mesh
                  position={[xOffset + width/2, panelStartY + height/2, extendedZOffset]}
                  rotation={[0, 0, 0]}
                >
                  <planeGeometry args={[width, height]} />
                  <meshStandardMaterial 
                    color="#e8e8e8" 
                    roughness={0.8}
                    metalness={0.0}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              );
            }
          })()} */}
          
          {/* 단내림 경계 수직 벽 - 뒷벽 다음에 렌더링 */}
          {spaceInfo.droppedCeiling?.enabled && (() => {
            const isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
            const droppedCeilingHeight = mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight || 200);
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            
            return (
              <mesh
                position={[
                  isLeftDropped 
                    ? mmToThreeUnits(zoneInfo.normal.startX)
                    : mmToThreeUnits(zoneInfo.dropped.startX),
                  panelStartY + height - droppedCeilingHeight/2, 
                  extendedZOffset + extendedPanelDepth/2
                ]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <planeGeometry args={[extendedPanelDepth, droppedCeilingHeight]} />
                <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal')} />
              </mesh>
            );
          })()}
        </>
      )}
      
      {/* 바닥 마감재 - 공간 메쉬 안쪽 경계선에 맞춰 배치 */}
      {spaceInfo.hasFloorFinish && floorFinishHeight > 0 && !(viewMode === '2D' && view2DDirection === 'top') && (
        <BoxWithEdges
          args={[width, floorFinishHeight, panelDepth]}
          position={[xOffset + width/2, floorFinishHeight/2, 0]}
          material={(() => {
            const mat = new THREE.MeshStandardMaterial({
              color: floorColor,
              transparent: false,  // 투명도 완전 비활성화
              side: THREE.DoubleSide,
              roughness: 0.8,
              metalness: 0.1,
              depthWrite: true,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1
            });
            return mat;
          })()}
          renderMode={renderMode}
        />
      )}
      
      {/* 슬롯 바닥면 - 그린색으로 표시 - showAll이 true이고 2D 측면뷰가 아닐 때만 */}
      {showAll && !(viewMode === '2D' && view2DDirection === 'front') && (() => {
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
        
        // 슬롯 깊이 계산
        const slotDepth = furnitureDepth;
        const slotCenterZ = furnitureZOffset;
        
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
        
        // 바닥 슬롯 메쉬는 항상 렌더링 - 기둥이 없어도 보이도록
        if (columns.length === 0 || !hasDeepColumns) {
          // 기둥이 없거나 얕은 경우 전체 바닥면 렌더링
          return (
            <mesh
              position={[slotCenterX, floorY + 0.001, slotCenterZ]}
              rotation={[0, 0, 0]}
              renderOrder={100}
              frustumCulled={false}
            >
              <boxGeometry args={[slotWidth, 0.01, slotDepth]} />
              <meshBasicMaterial 
                color="#10b981"
                transparent
                opacity={0.10}
                side={THREE.DoubleSide}
                depthWrite={false}
                depthTest={true}
              />
            </mesh>
          );
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
              castShadow={false}
              receiveShadow={false}
              frustumCulled={false}
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
      {console.log('🔍 왼쪽 프레임/엔드패널 렌더링 체크:', {
        showFrame,
        frameThicknessLeft: frameThickness.left,
        frameThicknessLeftMm: frameThicknessMm.left,
        condition: showFrame && frameThickness.left > 0,
        surroundType: spaceInfo.surroundType,
        installType: spaceInfo.installType,
        wallConfigLeft: wallConfig?.left,
        wallConfigRight: wallConfig?.right,
        '예상': !wallConfig?.left ? '왼쪽에 엔드패널 있어야 함' : '왼쪽에 프레임 없음'
      })}
      {console.log('🚨 왼쪽 엔드패널 렌더링 직전 체크:', {
        frameThicknessLeft: frameThickness.left,
        frameThicknessLeftMm: frameThicknessMm.left,
        'frameThickness.left > 0': frameThickness.left > 0,
        showFrame,
        'showFrame && frameThickness.left > 0': showFrame && frameThickness.left > 0
      })}
      {showFrame && frameThickness.left > 0 && view2DDirection !== 'left' && view2DDirection !== 'right' && (() => {
        // 단내림 관련 변수
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
        const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
        const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
          ? spaceInfo.droppedCeiling.dropHeight || 200
          : 0;
        const droppedCeilingHeight = mmToThreeUnits(dropHeight);
        
        // 왼쪽이 단내림 영역인 경우 두 부분으로 나누어 렌더링
        if (hasDroppedCeiling && isLeftDropped) {
          // 바닥 마감재와 띄움 높이를 반영한 높이 계산
          const droppedHeight = adjustedPanelHeight - mmToThreeUnits(dropHeight);
          const droppedCenterY = panelStartY + floatHeight + droppedHeight/2;
          const upperPartHeight = mmToThreeUnits(dropHeight);
          const upperPartCenterY = panelStartY + floatHeight + droppedHeight + upperPartHeight/2;
          
          return (
            <>
              {/* 단내림 영역 프레임 (단내림 높이에 맞춤) */}
              <BoxWithEdges
                isEndPanel={!wallConfig?.left} // 왼쪽 벽이 없으면 엔드패널
                args={[
                  frameThickness.left, 
                  droppedHeight, // 단내림 구간 높이
                  // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.left 
                        ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                        : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)  // 벽이 없는 경우: 뒷벽부터 받침대 앞선까지
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) || 
                       (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? slotFloorDepth  // 서라운드 엔드패널: 전체 깊이
                        : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
                ]}
                position={[
                  xOffset + frameThickness.left/2, 
                  droppedCenterY, // 단내림 구간 중심
                  // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.left 
                        ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2  // 벽이 있는 경우: 프레임 위치
                        : backZ + (furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)/2)  // 벽이 없는 경우: 엔드패널 중심
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) || 
                       (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? backZ + slotFloorDepth/2  // 서라운드 엔드패널
                        : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2)  // 서라운드 프레임
                ]}
                material={leftFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                renderMode={renderMode}
                view2DTheme={view2DTheme}
              />
            </>
          );
        }
        
        // 단내림이 없거나 우측 단내림인 경우 기존 렌더링
        console.log('🔍 왼쪽 엔드패널 렌더링 디버그:', {
          frameThicknessLeft: frameThickness.left,
          wallConfigLeft: wallConfig?.left,
          surroundType: spaceInfo.surroundType,
          installType: spaceInfo.installType,
          깊이: wallConfig?.left ? '프레임(18mm)' : '엔드패널(전체깊이-18mm)',
          위치: wallConfig?.left ? '프레임위치' : '엔드패널위치'
        });
        return (
          <BoxWithEdges
            isEndPanel={!wallConfig?.left} // 왼쪽 벽이 없으면 엔드패널
            args={[
              frameThickness.left, 
              adjustedPanelHeight, 
              // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
              spaceInfo.surroundType === 'no-surround'
                ? (wallConfig?.left 
                    ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                    : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)  // 벽이 없는 경우: 뒷벽부터 받침대 앞선까지
                : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) || 
                   (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                    ? slotFloorDepth  // 서라운드 엔드패널: 전체 깊이
                    : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
            ]}
            position={[
              xOffset + frameThickness.left/2, 
              sideFrameCenterY, 
              // 노서라운드 모드에서 엔드패널/프레임 위치 결정
              spaceInfo.surroundType === 'no-surround'
                ? (wallConfig?.left 
                    ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2  // 벽이 있는 경우: 프레임 위치
                    : backZ + (furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)/2)  // 벽이 없는 경우: 엔드패널 중심
                : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.left) || 
                   (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                    ? backZ + slotFloorDepth/2  // 서라운드 엔드패널
                    : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2)  // 서라운드 프레임
            ]}
            material={leftFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
            renderMode={renderMode}
            view2DTheme={view2DTheme}
            onClick={(e) => {
              e.stopPropagation();
              // 프레임 클릭 시 강조만 처리 (크기 변경 없음)
              console.log('🎯 좌측 프레임 클릭', {
                showFrame,
                frameThicknessLeft: frameThickness.left,
                view2DDirection,
                wallConfigLeft: wallConfig?.left
              });
            }}
          />
        );
      })()}
      
      
      {/* 오른쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {/* 측면뷰에서는 우측 프레임 숨김 */}
      {showFrame && frameThickness.right > 0 && view2DDirection !== 'left' && view2DDirection !== 'right' && (() => {
        // 단내림 여부 확인
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
        const isRightDropped = hasDroppedCeiling && spaceInfo.droppedCeiling?.position === 'right';
        const dropHeight = hasDroppedCeiling && spaceInfo.droppedCeiling
          ? spaceInfo.droppedCeiling.dropHeight || 200
          : 0;
        const droppedCeilingHeight = mmToThreeUnits(dropHeight);
        
        // 오른쪽이 단내림 영역인 경우
        if (hasDroppedCeiling && isRightDropped) {
          // 바닥 마감재와 띄움 높이를 반영한 높이 계산
          const droppedHeight = adjustedPanelHeight - mmToThreeUnits(dropHeight);
          const droppedCenterY = panelStartY + floatHeight + droppedHeight/2;
          const upperPartHeight = mmToThreeUnits(dropHeight);
          const upperPartCenterY = panelStartY + floatHeight + droppedHeight + upperPartHeight/2;
          
          return (
            <>
              {/* 단내림 영역 프레임 (단내림 높이에 맞춤) */}
              <BoxWithEdges
                isEndPanel={!wallConfig?.right} // 오른쪽 벽이 없으면 엔드패널
                args={[
                  frameThickness.right, 
                  droppedHeight, // 단내림 구간 높이
                  // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.right 
                        ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                        : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)  // 벽이 없는 경우: 뒷벽부터 받침대 앞선까지
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) || 
                       (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? slotFloorDepth  // 서라운드 엔드패널: 전체 깊이
                        : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
                ]}
                position={[
                  xOffset + width - frameThickness.right/2, 
                  droppedCenterY, // 단내림 구간 중심
                  // 노서라운드 모드에서 엔드패널/프레임 위치 결정
                  spaceInfo.surroundType === 'no-surround'
                    ? (wallConfig?.right 
                        ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2  // 벽이 있는 경우: 프레임 위치
                        : backZ + (furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)/2)  // 벽이 없는 경우: 엔드패널 중심
                    : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) || 
                       (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                        ? backZ + slotFloorDepth/2  // 서라운드 엔드패널
                        : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2)  // 서라운드 프레임
                ]}
                material={rightFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                renderMode={renderMode}
              />
            </>
          );
        }
        
        // 단내림이 없거나 좌측 단내림인 경우 기존 렌더링
        return (
          <BoxWithEdges
            isEndPanel={!wallConfig?.right} // 오른쪽 벽이 없으면 엔드패널
            args={[
              frameThickness.right, 
              adjustedPanelHeight, 
              // 노서라운드 모드에서 엔드패널/프레임 깊이 결정
              spaceInfo.surroundType === 'no-surround'
                ? (wallConfig?.right 
                    ? mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우: 얇은 프레임 (18mm)
                    : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)  // 벽이 없는 경우: 뒷벽부터 받침대 앞선까지
                : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) || 
                   (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                    ? slotFloorDepth  // 서라운드 엔드패널: 전체 깊이
                    : mmToThreeUnits(END_PANEL_THICKNESS))  // 서라운드 프레임 (18mm)
            ]}
            position={[
              xOffset + width - frameThickness.right/2, 
              sideFrameCenterY, 
              // 노서라운드 모드에서 엔드패널/프레임 위치 결정
              spaceInfo.surroundType === 'no-surround'
                ? (wallConfig?.right 
                    ? furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2  // 벽이 있는 경우: 프레임 위치
                    : backZ + (furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(20) - backZ)/2)  // 벽이 없는 경우: 엔드패널 중심
                : (((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !wallConfig?.right) || 
                   (spaceInfo.installType === 'freestanding' || spaceInfo.installType === 'free-standing')
                    ? backZ + slotFloorDepth/2  // 서라운드 엔드패널
                    : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2)  // 서라운드 프레임
            ]}
            material={rightFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
            renderMode={renderMode}
            onClick={(e) => {
              e.stopPropagation();
              // 프레임 클릭 시 강조만 처리 (크기 변경 없음)
              console.log('🎯 우측 프레임 클릭', {
                showFrame,
                frameThicknessRight: frameThickness.right,
                view2DDirection,
                wallConfigRight: wallConfig?.right
              });
            }}
          />
        );
      })()}
      
      
      {/* 상단 패널 - ㄱ자 모양으로 구성 */}
      {/* 수평 상단 프레임 - 좌우 프레임 사이에만 배치 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 서라운드/노서라운드 모두 표시 */}
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
              droppedWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH);
              const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
              droppedHeight = mmToThreeUnits(spaceInfo.height - dropHeight);
              isLeftDropped = spaceInfo.droppedCeiling.position === 'left';
            }
            
            // 단내림이 있을 때는 일반 구간의 고정된 범위 사용 (기둥 위치와 무관하게)
            // 단내림이 없을 때는 기존 로직 사용
            let frameStartX, frameEndX;
            
            if (hasDroppedCeiling) {
              // 단내림이 있으면 getNormalZoneBounds로 고정된 위치 계산
              const normalBounds = getNormalZoneBounds(spaceInfo);
              frameStartX = mmToThreeUnits(normalBounds.startX);
              frameEndX = mmToThreeUnits(normalBounds.endX);
            } else {
              // 단내림이 없으면 기존 로직 사용
              const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
              const normalZone = zoneInfo.normal;
              frameStartX = mmToThreeUnits(normalZone.startX);
              frameEndX = mmToThreeUnits(normalZone.startX + normalZone.width);
            }
            
            const frameWidth = frameEndX - frameStartX;
            const frameX = (frameStartX + frameEndX) / 2;
            
            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 + 단내림이 없는 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            if ((columns.length === 0 || !hasDeepColumns) && !hasDroppedCeiling) {
              // 기둥도 없고 단내림도 없으면 기존처럼 하나의 프레임으로 렌더링
              return (
                <BoxWithEdges
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
                  material={topFrameMaterial || undefined}
                  renderMode={renderMode}
                />
              );
            }
            
            // 단내림이 있고 기둥이 있는 경우 - 각 구간별로 별도 처리
            if (hasDroppedCeiling && hasDeepColumns) {
              const normalSegments = [];
              const droppedSegments = [];
              
              // 각 구간의 경계 계산
              const normalBounds = getNormalZoneBounds(spaceInfo);
              const droppedBounds = getDroppedZoneBounds(spaceInfo);
              
              const normalSegmentStartX = mmToThreeUnits(normalBounds.startX);
              const normalSegmentEndX = mmToThreeUnits(normalBounds.endX);
              const droppedSegmentStartX = mmToThreeUnits(droppedBounds.startX);
              const droppedSegmentEndX = mmToThreeUnits(droppedBounds.endX);
              
              // 일반 구간 기둥들만 필터링
              const normalColumns = columns.filter(column => {
                const columnCenterX = column.position[0];
                const boundary = isLeftDropped ? droppedSegmentEndX : droppedSegmentStartX;
                const isInNormal = isLeftDropped ? columnCenterX >= boundary : columnCenterX < boundary;
                return isInNormal && column.depth >= 730;
              }).sort((a, b) => a.position[0] - b.position[0]);
              
              // 단내림 구간 기둥들만 필터링
              const droppedColumns = columns.filter(column => {
                const columnCenterX = column.position[0];
                const boundary = isLeftDropped ? droppedSegmentEndX : droppedSegmentStartX;
                const isInDropped = isLeftDropped ? columnCenterX < boundary : columnCenterX > boundary;
                return isInDropped && column.depth >= 730;
              }).sort((a, b) => a.position[0] - b.position[0]);
              
              // 일반 구간 프레임 분절
              let currentX = normalSegmentStartX;
              normalColumns.forEach(column => {
                const columnWidthM = column.width * 0.01;
                const columnLeftX = column.position[0] - columnWidthM / 2;
                const columnRightX = column.position[0] + columnWidthM / 2;
                
                if (columnLeftX < normalSegmentEndX && columnRightX > normalSegmentStartX) {
                  const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                  if (leftSegmentWidth > 0) {
                    normalSegments.push({
                      width: leftSegmentWidth,
                      x: currentX + leftSegmentWidth / 2,
                      zone: 'normal'
                    });
                  }
                  currentX = columnRightX;
                }
              });
              
              // 일반 구간 마지막 세그먼트
              const normalLastWidth = Math.max(0, normalSegmentEndX - currentX);
              if (normalLastWidth > 0) {
                normalSegments.push({
                  width: normalLastWidth,
                  x: currentX + normalLastWidth / 2,
                  zone: 'normal'
                });
              }
              
              // 단내림 구간 프레임 분절
              currentX = droppedSegmentStartX;
              droppedColumns.forEach(column => {
                const columnWidthM = column.width * 0.01;
                const columnLeftX = column.position[0] - columnWidthM / 2;
                const columnRightX = column.position[0] + columnWidthM / 2;
                
                if (columnLeftX < droppedSegmentEndX && columnRightX > droppedSegmentStartX) {
                  const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                  if (leftSegmentWidth > 0) {
                    droppedSegments.push({
                      width: leftSegmentWidth,
                      x: currentX + leftSegmentWidth / 2,
                      zone: 'dropped'
                    });
                  }
                  currentX = columnRightX;
                }
              });
              
              // 단내림 구간 마지막 세그먼트
              const droppedLastWidth = Math.max(0, droppedSegmentEndX - currentX);
              if (droppedLastWidth > 0) {
                droppedSegments.push({
                  width: droppedLastWidth,
                  x: currentX + droppedLastWidth / 2,
                  zone: 'dropped'
                });
              }
              
              // 모든 세그먼트 렌더링
              const allSegments = [...normalSegments, ...droppedSegments];
              
              console.log('🔥 단내림+기둥 프레임 세그먼트:', {
                normalSegments: normalSegments.map(s => ({
                  x: s.x / 0.01,
                  width: s.width / 0.01,
                  zone: s.zone
                })),
                droppedSegments: droppedSegments.map(s => ({
                  x: s.x / 0.01,
                  width: s.width / 0.01,
                  zone: s.zone
                }))
              });
              
              return allSegments.map((segment, index) => {
                let segmentY = topElementsY;
                if (segment.zone === 'dropped') {
                  segmentY = topElementsY - mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight);
                }
                
                return (
                  <BoxWithEdges
                    key={`top-frame-segment-${index}`}
                    args={[
                      segment.width,
                      topBottomFrameHeight,
                      mmToThreeUnits(END_PANEL_THICKNESS)
                    ]}
                    position={[
                      segment.x,
                      segmentY,
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                      mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                    ]}
                    material={topFrameMaterial || undefined}
                    renderMode={renderMode}
                  />
                );
              });
            }
            
            // 기존 로직: 단내림만 있고 기둥이 없는 경우
            if (hasDroppedCeiling && !hasDeepColumns) {
              // 고정된 bounds 사용
              const normalBounds = getNormalZoneBounds(spaceInfo);
              const droppedBounds = getDroppedZoneBounds(spaceInfo);
              
              const frameStartX = mmToThreeUnits(Math.min(normalBounds.startX, droppedBounds.startX));
              const frameEndX = mmToThreeUnits(Math.max(normalBounds.endX, droppedBounds.endX));
              const droppedBoundaryX = isLeftDropped 
                ? mmToThreeUnits(droppedBounds.endX)
                : mmToThreeUnits(droppedBounds.startX);
              
              // 프레임 너비 계산 - 동적 계산
              let droppedFrameWidth, normalFrameWidth;
              
              // 좌우 공간 축소값 계산 (프레임 또는 이격거리/엔드패널)
              let leftReduction = 0;
              let rightReduction = 0;
              
              if (spaceInfo.surroundType === 'surround') {
                const frameThickness = calculateFrameThickness(spaceInfo);
                leftReduction = frameThickness.left;
                rightReduction = frameThickness.right;
              } else {
                // 노서라운드: 이격거리 또는 엔드패널
                if (spaceInfo.installType === 'builtin') {
                  // calculateNoSurroundOffset 함수 사용하여 정확한 이격거리 계산
                  leftReduction = calculateNoSurroundOffset(spaceInfo, 'left');
                  rightReduction = calculateNoSurroundOffset(spaceInfo, 'right');
                } else if (spaceInfo.installType === 'semistanding') {
                  // 세미스탠딩: 한쪽 벽만 있음
                  // 벽이 있는 쪽은 이격거리 무시(0), 없는 쪽은 엔드패널
                  if (spaceInfo.wallConfig?.left) {
                    leftReduction = 0;  // 이격거리 무시
                    rightReduction = END_PANEL_THICKNESS;
                  } else if (spaceInfo.wallConfig?.right) {
                    leftReduction = END_PANEL_THICKNESS;
                    rightReduction = 0;  // 이격거리 무시
                  } else {
                    // 벽 설정이 없으면 기본값 (오른쪽 벽 있다고 가정)
                    leftReduction = END_PANEL_THICKNESS;
                    rightReduction = 0;  // 이격거리 무시
                  }
                } else {
                  leftReduction = END_PANEL_THICKNESS;
                  rightReduction = END_PANEL_THICKNESS;
                }
              }
              
              // 고정된 너비 사용 (bounds에서 직접 가져옴)
              const droppedAreaWidth = mmToThreeUnits(droppedBounds.width);
              const normalAreaWidth = mmToThreeUnits(normalBounds.width);
              
              if (isLeftDropped) {
                // 왼쪽 단내림: 단내림구간은 왼쪽 프레임만, 메인구간은 오른쪽 프레임만 제외
                droppedFrameWidth = droppedAreaWidth - mmToThreeUnits(leftReduction);
                normalFrameWidth = normalAreaWidth - mmToThreeUnits(rightReduction);
              } else {
                // 오른쪽 단내림: 메인구간은 왼쪽 프레임만, 단내림구간은 오른쪽 프레임만 제외
                normalFrameWidth = normalAreaWidth - mmToThreeUnits(leftReduction);
                droppedFrameWidth = droppedAreaWidth - mmToThreeUnits(rightReduction);
              }
              
              // Three.js 단위로 변환된 시작점
              const normalStartX = mmToThreeUnits(normalBounds.startX);
              const droppedStartX = mmToThreeUnits(droppedBounds.startX);
              
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
                    args={[
                      droppedFrameWidth,
                      topBottomFrameHeight,
                      mmToThreeUnits(END_PANEL_THICKNESS)
                    ]}
                    position={[
                      droppedX,
                      // 단내림 구간의 상부 프레임 Y 위치
                      // 전체 높이에서 dropHeight를 뺀 위치에 프레임 설치
                      topElementsY - mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight),
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                      mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                    ]}
                    material={topFrameMaterial || undefined}
                    renderMode={renderMode}
                  />
                  {/* 일반 영역 상부 프레임 */}
                  <BoxWithEdges
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
                    material={topFrameMaterial || undefined}
                    renderMode={renderMode}
                  />
                </>
              );
            }
            const frameSegments: Array<{
              width: number;
              x: number;
              zone?: 'normal' | 'dropped';
            }> = [];
            
            // 프레임 범위 계산
            let segmentFrameStartX, segmentFrameEndX;
            let normalSegmentStartX, normalSegmentEndX;
            let droppedSegmentStartX, droppedSegmentEndX;
            
            if (hasDroppedCeiling) {
              // 단내림이 있으면 각 구간의 고정된 범위 사용
              const normalBounds = getNormalZoneBounds(spaceInfo);
              const droppedBounds = getDroppedZoneBounds(spaceInfo);
              
              normalSegmentStartX = mmToThreeUnits(normalBounds.startX);
              normalSegmentEndX = mmToThreeUnits(normalBounds.endX);
              droppedSegmentStartX = mmToThreeUnits(droppedBounds.startX);
              droppedSegmentEndX = mmToThreeUnits(droppedBounds.endX);
              
              // 전체 범위 (분절 계산용)
              segmentFrameStartX = Math.min(normalSegmentStartX, droppedSegmentStartX);
              segmentFrameEndX = Math.max(normalSegmentEndX, droppedSegmentEndX);
            } else {
              // 단내림이 없으면 기존 로직 사용
              segmentFrameStartX = frameX - frameWidth / 2;
              segmentFrameEndX = frameX + frameWidth / 2;
            }
            
            // 기둥들을 X 위치 기준으로 정렬
            const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);
            
            let currentX = segmentFrameStartX;
            
            // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
            sortedColumns.forEach((column, index) => {
              const columnWidthM = column.width * 0.01; // mm to Three.js units
              const columnLeftX = column.position[0] - columnWidthM / 2;
              const columnRightX = column.position[0] + columnWidthM / 2;
              
              // 단내림이 있을 때는 기둥이 어느 구간에 있는지 확인
              if (hasDroppedCeiling) {
                const columnCenterX = column.position[0];
                const boundary = isLeftDropped ? droppedSegmentEndX : droppedSegmentStartX;
                
                // 기둥이 어느 구간에 있는지 확인
                const isColumnInDropped = isLeftDropped 
                  ? columnCenterX < boundary 
                  : columnCenterX > boundary;
                
                // 기둥이 있는 구간과 현재 세그먼트가 처리중인 구간이 다르면 스킵
                // (예: 일반 구간의 기둥은 단내림 구간 프레임을 분절하지 않음)
                if ((isColumnInDropped && currentX >= normalSegmentStartX && currentX < normalSegmentEndX) ||
                    (!isColumnInDropped && currentX >= droppedSegmentStartX && currentX < droppedSegmentEndX)) {
                  return; // 이 기둥은 현재 세그먼트 구간에 영향을 주지 않음
                }
              }
              
              // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
              if (columnLeftX < segmentFrameEndX && columnRightX > segmentFrameStartX && column.depth >= 730) {
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
            const lastSegmentWidth = Math.max(0, frameEndX - currentX);
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
                  material={topFrameMaterial || undefined}
                  renderMode={renderMode}
                />
              );
            }
            
            // 단내림이 있을 때 세그먼트를 구간별로 분리
            let finalSegments = frameSegments;
            if (hasDroppedCeiling) {
              console.log('🔥 프레임 세그먼트 분리 전:', {
                frameSegments: frameSegments.map(s => ({
                  x: s.x / 0.01,
                  width: s.width / 0.01,
                  left: (s.x - s.width/2) / 0.01,
                  right: (s.x + s.width/2) / 0.01
                })),
                normalBounds: {
                  start: normalSegmentStartX / 0.01,
                  end: normalSegmentEndX / 0.01
                },
                droppedBounds: {
                  start: droppedSegmentStartX / 0.01,
                  end: droppedSegmentEndX / 0.01
                },
                boundary: (isLeftDropped ? droppedSegmentEndX : droppedSegmentStartX) / 0.01
              });
              
              finalSegments = [];
              frameSegments.forEach(segment => {
                const segmentLeftX = segment.x - segment.width / 2;
                const segmentRightX = segment.x + segment.width / 2;
                
                // 일반 구간과 단내림 구간의 경계
                const boundary = isLeftDropped ? droppedSegmentEndX : droppedSegmentStartX;
                
                if (isLeftDropped) {
                  // 왼쪽 단내림
                  if (segmentRightX <= boundary) {
                    // 완전히 단내림 구간에 있음
                    finalSegments.push({...segment, zone: 'dropped'});
                  } else if (segmentLeftX >= boundary) {
                    // 완전히 일반 구간에 있음
                    finalSegments.push({...segment, zone: 'normal'});
                  } else {
                    // 경계에 걸쳐있음 - 두 개로 분리
                    const droppedWidth = boundary - segmentLeftX;
                    const normalWidth = segmentRightX - boundary;
                    
                    if (droppedWidth > 0) {
                      finalSegments.push({
                        width: droppedWidth,
                        x: segmentLeftX + droppedWidth / 2,
                        zone: 'dropped'
                      });
                    }
                    if (normalWidth > 0) {
                      finalSegments.push({
                        width: normalWidth,
                        x: boundary + normalWidth / 2,
                        zone: 'normal'
                      });
                    }
                  }
                } else {
                  // 오른쪽 단내림
                  if (segmentRightX <= boundary) {
                    // 완전히 일반 구간에 있음
                    finalSegments.push({...segment, zone: 'normal'});
                  } else if (segmentLeftX >= boundary) {
                    // 완전히 단내림 구간에 있음
                    finalSegments.push({...segment, zone: 'dropped'});
                  } else {
                    // 경계에 걸쳐있음 - 두 개로 분리
                    const normalWidth = boundary - segmentLeftX;
                    const droppedWidth = segmentRightX - boundary;
                    
                    if (normalWidth > 0) {
                      finalSegments.push({
                        width: normalWidth,
                        x: segmentLeftX + normalWidth / 2,
                        zone: 'normal'
                      });
                    }
                    if (droppedWidth > 0) {
                      finalSegments.push({
                        width: droppedWidth,
                        x: boundary + droppedWidth / 2,
                        zone: 'dropped'
                      });
                    }
                  }
                }
              });
              
              console.log('🔥 프레임 세그먼트 분리 후:', {
                finalSegments: finalSegments.map(s => ({
                  x: s.x / 0.01,
                  width: s.width / 0.01,
                  left: (s.x - s.width/2) / 0.01,
                  right: (s.x + s.width/2) / 0.01,
                  zone: s.zone
                }))
              });
            }
            
            return finalSegments.map((segment, index) => {
              console.log(`🎨 Top frame segment ${index} - 분절된 상부 프레임 재질:`, {
                hasTopFrameMaterial: !!topFrameMaterial,
                materialReady: topFrameMaterial !== undefined,
                materialType: topFrameMaterial?.type,
                materialColor: topFrameMaterial && 'color' in topFrameMaterial ? (topFrameMaterial as any).color.getHexString() : 'none',
                materialTexture: topFrameMaterial && 'map' in topFrameMaterial ? !!(topFrameMaterial as any).map : false,
                doorColor: materialConfig?.doorColor,
                doorTexture: materialConfig?.doorTexture,
                segmentWidth: segment.width,
                segmentX: segment.x,
                segmentZone: segment.zone
              });
              
              // 단내림이 있는 경우, 세그먼트의 zone에 따라 높이 조정
              let segmentY = topElementsY;
              
              if (hasDroppedCeiling && spaceInfo.droppedCeiling && segment.zone) {
                if (segment.zone === 'dropped') {
                  // 단내림 구간의 프레임은 낮은 위치에
                  segmentY = topElementsY - mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight);
                }
                // normal zone은 기본 높이 유지
              }
              
              return (
                <BoxWithEdges
                  key={`top-frame-segment-${index}`}
                  args={[
                    segment.width,
                    topBottomFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[
                    segment.x, // 분절된 위치
                    segmentY, // 단내림 구간에 따라 조정된 Y 위치
                    // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                  ]}
                  material={topFrameMaterial || undefined}
                  renderMode={renderMode}
                />
              );
            });
          })()}
        </>
      )}
      
      {/* 상단 서브프레임 - 완전히 제거 */}
      {false && (
        <>
          {/* 기둥이 있는 경우 상단 서브프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            
            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            if (columns.length === 0 || !hasDeepColumns) {
              // 기둥이 없거나 모든 기둥이 729mm 이하면 기존처럼 하나의 서브프레임으로 렌더링
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
                    args={[
                      finalPanelWidth, 
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={topFrameMaterial || undefined}
                    renderMode={renderMode}
                  />
                </group>
              );
            }
            
            // 기둥이 있는 경우 분절된 서브프레임들 렌더링
            const frameSegments: Array<{
              width: number;
              x: number;
              zone?: 'normal' | 'dropped';
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
              if (columnLeftX < frameEndX && columnRightX > frameStartX && column.depth >= 730) {
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
            const lastSegmentWidth = Math.max(0, frameEndX - currentX);
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
                    args={[
                      finalPanelWidth, 
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={topFrameMaterial || undefined}
                    renderMode={renderMode}
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
                  args={[
                    segment.width,
                    mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                    mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                  ]}
                  position={[0, 0, 0]} // group 내에서 원점에 배치
                  material={topSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                />
              </group>
            ));
          })()}
        </>
      )}
      
      {/* 왼쪽 서브프레임 - 왼쪽 프레임에서 오른쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {/* 노서라운드 모드에서는 서브프레임도 숨김 */}
      {/* 좌측 프레임 크기가 20 미만이면 서브프레임 숨김 */}
      {/* 좌측뷰에서는 좌측 서브프레임 숨김 */}
      {showFrame && spaceInfo.surroundType !== 'no-surround' &&
        spaceInfo.frameSize?.left >= 20 && view2DDirection !== 'left' && view2DDirection !== 'right' &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
        (spaceInfo.installType === 'semistanding' && wallConfig?.left)) && (() => {
        
        // 왼쪽 서브프레임과 맞닿는 위치에 상하부장이 있는지 확인
        // 가장 왼쪽에 있는 상하부장을 찾기 (위치 기준)
        const leftmostCabinet = actualPlacedModules?.filter(m => 
          m.moduleId?.toLowerCase().includes('upper-cabinet') || 
          m.moduleId?.toLowerCase().includes('lower-cabinet') ||
          m.moduleId?.toLowerCase().includes('upper_cabinet') || 
          m.moduleId?.toLowerCase().includes('lower_cabinet') ||
          m.moduleId?.toLowerCase().includes('uppercabinet') || 
          m.moduleId?.toLowerCase().includes('lowercabinet')
        ).sort((a, b) => (a.position?.x || 0) - (b.position?.x || 0))[0];
        
        // 왼쪽 프레임과 실제로 맞닿는지 확인 (위치 기준)
        // 왼쪽 프레임의 오른쪽 경계와 캐비닛의 왼쪽 경계가 맞닿는지 확인
        const leftFrameRightEdge = xOffset + frameThickness.left;
        
        // 듀얼 가구인지 확인
        const isLeftDual = leftmostCabinet?.isDualSlot || leftmostCabinet?.moduleId?.includes('dual-');
        
        // 가구 너비 계산 (듀얼인 경우 2배)
        let cabinetWidth = 0;
        if (leftmostCabinet) {
          if (leftmostCabinet.adjustedWidth) {
            cabinetWidth = mmToThreeUnits(leftmostCabinet.adjustedWidth);
          } else if (leftmostCabinet.moduleWidth) {
            cabinetWidth = mmToThreeUnits(leftmostCabinet.moduleWidth);
          } else {
            // moduleId에서 너비 추출 (예: upper-cabinet-600 -> 600)
            const widthMatch = leftmostCabinet.moduleId?.match(/(\d+)$/);
            const baseWidth = widthMatch ? parseInt(widthMatch[1]) : 600;
            cabinetWidth = mmToThreeUnits(baseWidth);
          }
        }
        
        const cabinetLeftEdge = leftmostCabinet ? (leftmostCabinet.position?.x || 0) - cabinetWidth/2 : 0;
        const hasLeftCabinet = !!(leftmostCabinet && 
          Math.abs(cabinetLeftEdge - leftFrameRightEdge) < 0.2); // 0.2m(200mm) 이내면 맞닿은 것으로 판단
        
        console.log('🔍🔍🔍 LEFT Subframe Debug:', {
          actualPlacedModules: actualPlacedModules?.length,
          leftmostCabinet,
          isLeftDual,
          cabinetWidth,
          leftFrameRightEdge,
          cabinetLeftEdge,
          distance: leftmostCabinet ? Math.abs(cabinetLeftEdge - leftFrameRightEdge) : null,
          hasLeftCabinet,
          moduleId: leftmostCabinet?.moduleId
        });
        
        // 상하부장의 깊이는 600mm, 일반 서브프레임은 40mm
        const leftFrameDepth = hasLeftCabinet ? 602 : 40;  // 602mm로 2mm 더 확장
        
        console.log('🔥🔥🔥 LEFT Subframe Final Depth:', {
          hasLeftCabinet,
          leftFrameDepth,
          leftFrameDepthMm: hasLeftCabinet ? 602 : 40,
          leftFrameDepthInThreeUnits: mmToThreeUnits(leftFrameDepth),
          actualDepthBeingUsed: leftFrameDepth
        });
        
        // 단내림 설정 확인 (좌측 서브프레임용)
        const leftDroppedCeilingEnabled = spaceInfo.droppedCeiling?.enabled ?? false;
        const leftDroppedCeilingPosition = spaceInfo.droppedCeiling?.position ?? 'right';
        const leftDropHeight = spaceInfo.droppedCeiling?.dropHeight ?? 200;
        
        // 왼쪽이 단내림 영역인 경우
        if (leftDroppedCeilingEnabled && leftDroppedCeilingPosition === 'left') {
          // 바닥 마감재와 띄움 높이를 반영한 높이 계산
          const leftDroppedHeight = adjustedPanelHeight - mmToThreeUnits(leftDropHeight);
          const leftDroppedCenterY = panelStartY + floatHeight + leftDroppedHeight/2;
          
          // 상하부장이 있을 때 Z 위치 조정 (상하부장의 뒷면 끝과 맞추기)
          const leftSubFrameZ = hasLeftCabinet 
            ? furnitureZOffset - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29) + mmToThreeUnits(19)  // 1mm 더 뒤로
            : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29);
          
          return (
            <group 
              position={[
                xOffset + frameThickness.left - mmToThreeUnits(10) + mmToThreeUnits(1), // 우측으로 1mm 이동
                leftDroppedCenterY, 
                leftSubFrameZ // 상하부장 깊이에 맞춰 조정
              ]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <BoxWithEdges
                args={[
                  mmToThreeUnits(leftFrameDepth),
                  leftDroppedHeight, // 단내림 영역 높이
                  mmToThreeUnits(END_PANEL_THICKNESS)
                ]}
                position={[0, 0, 0]}
                material={leftSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                renderMode={renderMode}
              />
            </group>
          );
        }
        
        // 단내림이 없거나 오른쪽에 있는 경우
        // 상하부장이 있을 때 Z 위치 조정 (상하부장의 뒷면 끝과 맞추기)
        // 기본 위치에서 상하부장 깊이의 절반만큼 뒤로 이동
        const leftSubFrameZ = hasLeftCabinet 
          ? furnitureZOffset - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29) + mmToThreeUnits(19)  // 1mm 더 뒤로
          : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29);
        
        return (
          <group 
            position={[
              xOffset + frameThickness.left - mmToThreeUnits(10) + mmToThreeUnits(1), // 우측으로 1mm 이동
              sideFrameCenterY, 
              leftSubFrameZ // 상하부장 깊이에 맞춰 조정
            ]}
            rotation={[0, Math.PI / 2, 0]}
          >
            {console.log('🔴🔴 LEFT BoxWithEdges rendering with depth:', {
              leftFrameDepth,
              hasLeftCabinet,
              depthInThreeUnits: mmToThreeUnits(leftFrameDepth),
              depthInMm: leftFrameDepth
            })}
            <BoxWithEdges
              args={[
                mmToThreeUnits(leftFrameDepth),
                adjustedPanelHeight,
                mmToThreeUnits(END_PANEL_THICKNESS)
              ]}
              position={[0, 0, 0]}
              material={leftSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
              renderMode={renderMode}
            />
          </group>
        );
      })()}
      
      {/* 오른쪽 서브프레임 - 오른쪽 프레임에서 왼쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {/* 노서라운드 모드에서는 서브프레임도 숨김 */}
      {/* 우측 프레임 크기가 20 미만이면 서브프레임 숨김 */}
      {/* 측면뷰에서는 우측 서브프레임 숨김 */}
      {showFrame && spaceInfo.surroundType !== 'no-surround' &&
        spaceInfo.frameSize?.right >= 20 && view2DDirection !== 'left' && view2DDirection !== 'right' &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
        (spaceInfo.installType === 'semistanding' && wallConfig?.right)) && (() => {
        
        // 오른쪽 서브프레임과 맞닿는 위치에 상하부장이 있는지 확인
        // 가장 오른쪽에 있는 상하부장을 찾기 (위치 기준)
        const rightmostCabinet = actualPlacedModules?.filter(m => 
          m.moduleId?.toLowerCase().includes('upper-cabinet') || 
          m.moduleId?.toLowerCase().includes('lower-cabinet') ||
          m.moduleId?.toLowerCase().includes('upper_cabinet') || 
          m.moduleId?.toLowerCase().includes('lower_cabinet') ||
          m.moduleId?.toLowerCase().includes('uppercabinet') || 
          m.moduleId?.toLowerCase().includes('lowercabinet')
        ).sort((a, b) => (b.position?.x || 0) - (a.position?.x || 0))[0]; // 내림차순 정렬로 가장 오른쪽 찾기
        
        // 오른쪽 프레임과 실제로 맞닿는지 확인 (위치 기준)
        // 오른쪽 프레임의 왼쪽 경계와 캐비닛의 오른쪽 경계가 맞닿는지 확인
        const rightFrameLeftEdge = xOffset + width - frameThickness.right;
        
        // 듀얼 가구인지 확인
        const isRightDual = rightmostCabinet?.isDualSlot || rightmostCabinet?.moduleId?.includes('dual-');
        
        // 가구 너비 계산 (듀얼인 경우 2배)
        let rightCabinetWidth = 0;
        if (rightmostCabinet) {
          if (rightmostCabinet.adjustedWidth) {
            rightCabinetWidth = mmToThreeUnits(rightmostCabinet.adjustedWidth);
          } else if (rightmostCabinet.moduleWidth) {
            rightCabinetWidth = mmToThreeUnits(rightmostCabinet.moduleWidth);
          } else {
            // moduleId에서 너비 추출 (예: dual-upper-cabinet-1200 -> 1200)
            const widthMatch = rightmostCabinet.moduleId?.match(/(\d+)$/);
            const baseWidth = widthMatch ? parseInt(widthMatch[1]) : 600;
            rightCabinetWidth = mmToThreeUnits(baseWidth);
          }
        }
        
        const cabinetRightEdge = rightmostCabinet ? (rightmostCabinet.position?.x || 0) + rightCabinetWidth/2 : 0;
        const hasRightCabinet = !!(rightmostCabinet && 
          Math.abs(cabinetRightEdge - rightFrameLeftEdge) < 0.2); // 0.2m(200mm) 이내면 맞닿은 것으로 판단
        
        console.log('🔍🔍🔍 RIGHT Subframe Debug:', {
          actualPlacedModules: actualPlacedModules?.length,
          rightmostCabinet,
          isRightDual,
          rightCabinetWidth,
          rightFrameLeftEdge,
          cabinetRightEdge,
          distance: rightmostCabinet ? Math.abs(cabinetRightEdge - rightFrameLeftEdge) : null,
          hasRightCabinet,
          moduleId: rightmostCabinet?.moduleId
        });
        
        // 상하부장의 깊이는 600mm, 일반 서브프레임은 40mm
        const rightFrameDepth = hasRightCabinet ? 602 : 40;  // 602mm로 2mm 더 확장
        
        console.log('🔥🔥🔥 RIGHT Subframe Final Depth:', {
          hasRightCabinet,
          rightFrameDepth,
          rightFrameDepthMm: hasRightCabinet ? 602 : 40,
          rightFrameDepthInThreeUnits: mmToThreeUnits(rightFrameDepth),
          actualDepthBeingUsed: rightFrameDepth
        });
        
        // 단내림 설정 확인 (우측 서브프레임용)
        const rightDroppedCeilingEnabled = spaceInfo.droppedCeiling?.enabled ?? false;
        const rightDroppedCeilingPosition = spaceInfo.droppedCeiling?.position ?? 'right';
        const rightDropHeight = spaceInfo.droppedCeiling?.dropHeight ?? 200;
        
        // 오른쪽이 단내림 영역인 경우
        if (rightDroppedCeilingEnabled && rightDroppedCeilingPosition === 'right') {
          // 바닥 마감재와 띄움 높이를 반영한 높이 계산
          const rightDroppedHeight = adjustedPanelHeight - mmToThreeUnits(rightDropHeight);
          const rightDroppedCenterY = panelStartY + floatHeight + rightDroppedHeight/2;
          
          // 상하부장이 있을 때 Z 위치 조정 (상하부장의 뒷면 끝과 맞추기)
          const rightSubFrameZ = hasRightCabinet 
            ? furnitureZOffset - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29) + mmToThreeUnits(19)  // 1mm 더 뒤로
            : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29);
          
          return (
            <group 
              position={[
                xOffset + width - frameThickness.right + mmToThreeUnits(10) - mmToThreeUnits(1), // 왼쪽으로 1mm 이동
                rightDroppedCenterY, 
                rightSubFrameZ // 상하부장 깊이에 맞춰 조정
              ]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <BoxWithEdges
                args={[
                  mmToThreeUnits(rightFrameDepth),
                  rightDroppedHeight, // 단내림 영역 높이
                  mmToThreeUnits(END_PANEL_THICKNESS)
                ]}
                position={[0, 0, 0]}
                material={rightSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                renderMode={renderMode}
              />
            </group>
          );
        }
        
        // 단내림이 없거나 왼쪽에 있는 경우
        // 상하부장이 있을 때 Z 위치 조정 (상하부장의 뒷면 끝과 맞추기)
        const rightSubFrameZ = hasRightCabinet 
          ? furnitureZOffset - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29) + mmToThreeUnits(19)  // 1mm 더 뒤로
          : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(29);
        
        return (
          <group 
            position={[
              xOffset + width - frameThickness.right + mmToThreeUnits(10) - mmToThreeUnits(1), // 왼쪽으로 1mm 이동
              sideFrameCenterY, 
              rightSubFrameZ // 상하부장 깊이에 맞춰 조정
            ]}
            rotation={[0, Math.PI / 2, 0]}
          >
            {console.log('🔴🔴 RIGHT BoxWithEdges rendering with depth:', {
              rightFrameDepth,
              hasRightCabinet,
              depthInThreeUnits: mmToThreeUnits(rightFrameDepth),
              depthInMm: rightFrameDepth
            })}
            <BoxWithEdges
              args={[
                mmToThreeUnits(rightFrameDepth),
                adjustedPanelHeight,
                mmToThreeUnits(END_PANEL_THICKNESS)
              ]}
              position={[0, 0, 0]}
              material={rightSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
              renderMode={renderMode}
            />
          </group>
        );
      })()}
      
      {/* 하단 프레임 - 받침대 역할 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 받침대가 있는 경우에만 렌더링 */}
      {/* 하부프레임은 baseFrameHeightMm이 0보다 크면 무조건 렌더링 */}
      {(() => {
        // 받침대 타입이 'stand'이고 띄워서 배치인 경우 렌더링하지 않음
        const isFloatingStand = spaceInfo.baseConfig?.type === 'stand' && 
                                spaceInfo.baseConfig?.placementType === 'float';
        
        // 받침대를 렌더링할지 결정
        const shouldRenderBaseFrame = showFrame && baseFrameHeightMm > 0 && !isFloatingStand;
        
        console.log('🚨🚨🚨 하부프레임 렌더링 조건 확인:', {
          showFrame,
          baseFrameHeightMm,
          isFloatingStand,
          'baseConfig.type': spaceInfo.baseConfig?.type,
          'baseConfig.placementType': spaceInfo.baseConfig?.placementType,
          'shouldRenderBaseFrame': shouldRenderBaseFrame,
          '단내림': spaceInfo.droppedCeiling?.enabled,
          '기둥 개수': spaceInfo.columns?.length || 0,
          'baseFrame': baseFrame,
          'spaceInfo.baseConfig': spaceInfo.baseConfig
        });
        
        // 높이가 0이면 기본값 65 사용
        const actualBaseFrameHeight = baseFrameHeightMm > 0 ? baseFrameHeight : mmToThreeUnits(65);
        
        // 렌더링 조건 확인
        if (!shouldRenderBaseFrame) {
          console.log('❌❌❌ 하부프레임 렌더링 스킵됨 (띄워서 배치 또는 받침대 없음)');
          return null;
        }
        
        return (
        <>
          {/* 기둥이 있는 경우 하부 프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            
            // 하부프레임은 항상 baseFrame.width 사용 (단내림과 무관)
            let frameWidth = baseFrame.width;
            let frameX = 0;
            
            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            console.log('🔧 [하부프레임 윗면] 기둥 분절 확인:', {
              columnsCount: columns.length,
              hasDeepColumns,
              columnDepths: columns.map(c => c.depth),
              hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled,
              frameWidth,
              frameX,
              surroundType: spaceInfo.surroundType
            });
            
            if (columns.length === 0 || !hasDeepColumns) {
              // 기둥이 없거나 모든 기둥이 729mm 이하면 기존처럼 하나의 프레임으로 렌더링
              console.log('✅✅✅ 하부프레임 실제 렌더링 중!', {
                frameWidth,
                actualBaseFrameHeight,
                panelStartY,
                '위치Y': panelStartY + actualBaseFrameHeight/2,
                '단내림': spaceInfo.droppedCeiling?.enabled,
                '기둥개수': columns.length
              });
              return (
                <BoxWithEdges
                  args={[
                    frameWidth, 
                    actualBaseFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                  ]}
                  position={[
                    frameX, // 조정된 X 위치
                    panelStartY + actualBaseFrameHeight/2, 
                    // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                  ]}
                  material={baseFrameMaterial || undefined}
                  renderMode={renderMode}
                />
              );
            }
            
            // hasDroppedCeiling 변수 정의
            const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
            const isLeftDropped = spaceInfo.droppedCeiling?.position === 'left';
            
            // 단내림이 있고 기둥도 있는 경우 - 각 구간별로 별도 처리
            if (hasDroppedCeiling && hasDeepColumns) {
              const allSegments = [];
              
              // 각 구간의 경계 계산
              const normalBounds = getNormalZoneBounds(spaceInfo);
              const droppedBounds = getDroppedZoneBounds(spaceInfo);
              
              const normalSegmentStartX = mmToThreeUnits(normalBounds.startX);
              const normalSegmentEndX = mmToThreeUnits(normalBounds.endX);
              const droppedSegmentStartX = mmToThreeUnits(droppedBounds.startX);
              const droppedSegmentEndX = mmToThreeUnits(droppedBounds.endX);
              
              // 모든 기둥들을 X 위치 기준으로 정렬
              const sortedColumns = [...columns].filter(col => col.depth >= 730).sort((a, b) => a.position[0] - b.position[0]);
              
              // 전체 프레임 범위에서 분절 계산
              let currentX = frameX - frameWidth / 2;
              const frameEndX = frameX + frameWidth / 2;
              
              sortedColumns.forEach(column => {
                const columnWidthM = column.width * 0.01;
                const columnLeftX = column.position[0] - columnWidthM / 2;
                const columnRightX = column.position[0] + columnWidthM / 2;
                
                if (columnLeftX < frameEndX && columnRightX > currentX) {
                  const leftSegmentWidth = Math.max(0, columnLeftX - currentX);
                  if (leftSegmentWidth > 0) {
                    // 세그먼트가 어느 구간에 속하는지 판단
                    const segmentCenterX = currentX + leftSegmentWidth / 2;
                    const boundary = isLeftDropped ? droppedSegmentEndX : droppedSegmentStartX;
                    const zone = isLeftDropped 
                      ? (segmentCenterX < boundary ? 'dropped' : 'normal')
                      : (segmentCenterX < boundary ? 'normal' : 'dropped');
                    
                    allSegments.push({
                      width: leftSegmentWidth,
                      x: currentX + leftSegmentWidth / 2,
                      zone
                    });
                  }
                  currentX = columnRightX;
                }
              });
              
              // 마지막 세그먼트
              const lastSegmentWidth = Math.max(0, frameEndX - currentX);
              if (lastSegmentWidth > 0) {
                const segmentCenterX = currentX + lastSegmentWidth / 2;
                const boundary = isLeftDropped ? droppedSegmentEndX : droppedSegmentStartX;
                const zone = isLeftDropped 
                  ? (segmentCenterX < boundary ? 'dropped' : 'normal')
                  : (segmentCenterX < boundary ? 'normal' : 'dropped');
                
                allSegments.push({
                  width: lastSegmentWidth,
                  x: currentX + lastSegmentWidth / 2,
                  zone
                });
              }
              
              console.log('🔥 [하부프레임] 단내림 구간 세그먼트 생성:', {
                allSegments: allSegments.map(s => ({
                  x: s.x / 0.01,
                  width: s.width / 0.01,
                  zone: s.zone
                })),
                columnsCount: sortedColumns.length
              });
              
              // 모든 세그먼트 렌더링
              return allSegments.map((segment, index) => (
                <BoxWithEdges
                  key={`base-frame-segment-${index}`}
                  args={[
                    segment.width,
                    actualBaseFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  position={[
                    segment.x,
                    panelStartY + actualBaseFrameHeight/2,
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(END_PANEL_THICKNESS)
                  ]}
                  material={baseFrameMaterial || undefined}
                  renderMode={renderMode}
                />
              ));
            }
            
            // 단내림 없고 기둥만 있는 경우
            if (!hasDroppedCeiling && hasDeepColumns) {
              const frameSegments: Array<{
                width: number;
                x: number;
                zone?: 'normal' | 'dropped';
              }> = [];
              
              // 전체 프레임 범위 계산 - frameStartX와 frameEndX를 재계산
              const frameStartXCalc = frameX - frameWidth / 2;
              const frameEndXCalc = frameX + frameWidth / 2;
              
              // 기둥들을 X 위치 기준으로 정렬
              const sortedColumns = [...columns].sort((a, b) => a.position[0] - b.position[0]);
              
              let currentX = frameStartXCalc;
              
              // 각 기둥에 대해 분절 계산 (730mm 이상 기둥만 분절)
              sortedColumns.forEach((column, index) => {
                const columnWidthM = column.width * 0.01; // mm to Three.js units
                const columnLeftX = column.position[0] - columnWidthM / 2;
                const columnRightX = column.position[0] + columnWidthM / 2;
                
                // 기둥이 프레임 범위 내에 있고, 깊이가 730mm 이상인 경우만 분절
                if (columnLeftX < frameEndXCalc && columnRightX > frameStartXCalc && column.depth >= 730) {
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
              const lastSegmentWidth = Math.max(0, frameEndXCalc - currentX);
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
                    args={[
                      finalPanelWidth, 
                      actualBaseFrameHeight, 
                      mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                    ]}
                    position={[
                      topBottomPanelX, // 중앙 정렬
                      panelStartY + actualBaseFrameHeight/2, 
                      // 노서라운드: 엔드패널이 있으면 18mm+이격거리 뒤로, 서라운드: 18mm 뒤로
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                      mmToThreeUnits(calculateMaxNoSurroundOffset(spaceInfo))
                    ]}
                    material={baseFrameMaterial || undefined}
                    renderMode={renderMode}
                  />
                );
              }
              
              return frameSegments.map((segment, index) => {
                console.log(`🎨 Base frame segment ${index} - 분절된 하부 프레임 재질:`, {
                  hasBaseFrameMaterial: !!baseFrameMaterial,
                  materialReady: baseFrameMaterial !== undefined,
                  materialType: baseFrameMaterial?.type,
                  materialColor: baseFrameMaterial && 'color' in baseFrameMaterial ? (baseFrameMaterial as any).color.getHexString() : 'none',
                  materialTexture: baseFrameMaterial && 'map' in baseFrameMaterial ? !!(baseFrameMaterial as any).map : false,
                  doorColor: materialConfig?.doorColor,
                  doorTexture: materialConfig?.doorTexture,
                  segmentWidth: segment.width,
                  segmentX: segment.x
                });
                
                return (
                  <BoxWithEdges
                    key={`base-frame-segment-${index}`}
                    args={[
                      segment.width,
                      actualBaseFrameHeight, 
                      mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                    ]}
                    position={[
                      segment.x, // 분절된 위치
                      panelStartY + actualBaseFrameHeight/2, 
                      // 상단 프레임과 같은 z축 위치에서 END_PANEL_THICKNESS 뒤로 이동
                      furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(END_PANEL_THICKNESS)
                    ]}
                    material={baseFrameMaterial || undefined}
                    renderMode={renderMode}
                  />
                );
              });
            }
            
            // 어떤 조건에도 해당하지 않으면 빈 배열 반환
            return null;
          })()}
        </>
        );
      })()}
      
      {/* 하단 서브프레임 제거됨 */}
      
      {/* 배치된 가구들 - showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        placedModules && placedModules.length > 0 ? (
          // 뷰어 모드에서만 props로 전달
          <>
            {(() => {
              // activeZone이 있고 단내림이 활성화된 경우 필터링
              const filteredModules = activeZone && spaceInfo.droppedCeiling?.enabled
                ? placedModules.filter(module => module.zone === activeZone)
                : placedModules;
              
              console.log('🔥 Room - PlacedFurnitureContainer 렌더링 (뷰어 모드):', {
                viewMode,
                renderMode,
                activeZone,
                originalCount: placedModules?.length || 0,
                filteredCount: filteredModules?.length || 0,
                placedModules: filteredModules,
                showFurniture
              });
              
              return <PlacedFurnitureContainer viewMode={viewMode} view2DDirection={view2DDirection} renderMode={renderMode} placedModules={filteredModules} showFurniture={viewMode === '3D' ? true : showFurniture} isReadOnly={isReadOnly} />;
            })()}
          </>
        ) : (
          // 일반 에디터 모드에서는 props 없이
          <>
            {console.log('🔥 Room - PlacedFurnitureContainer 렌더링 (에디터 모드):', {
              viewMode,
              renderMode,
              view2DDirection,
              activeZone,
              showFurniture
            })}
            <PlacedFurnitureContainer viewMode={viewMode} view2DDirection={view2DDirection} renderMode={renderMode} activeZone={activeZone} showFurniture={viewMode === '3D' ? true : showFurniture} isReadOnly={isReadOnly} />
          </>
        )
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
  if (prevProps.showFurniture !== nextProps.showFurniture) return false;
  if (prevProps.floorColor !== nextProps.floorColor) return false;
  if (prevProps.showFrame !== nextProps.showFrame) return false;
  if (prevProps.showDimensions !== nextProps.showDimensions) return false;
  if (prevProps.isStep2 !== nextProps.isStep2) return false;
  if (prevProps.activeZone !== nextProps.activeZone) return false;
  
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