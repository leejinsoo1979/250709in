import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';
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
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { MaterialFactory } from '../../utils/materials/MaterialFactory';
import { useSpace3DView } from '../../context/useSpace3DView';
import PlacedFurnitureContainer from './furniture/PlacedFurnitureContainer';

interface RoomProps {
  spaceInfo: SpaceInfo;
  floorColor?: string;
  viewMode?: '2D' | '3D';
  renderMode?: 'solid' | 'wireframe';
  materialConfig?: {
    doorColor: string;
    doorTexture?: string;
  };
  showAll?: boolean;
  placedModules?: any[]; // 뷰어 모드용 가구 데이터
  showFrame?: boolean; // 프레임 표시 여부
}

// mm를 Three.js 단위로 변환 (1mm = 0.01 Three.js units)
const mmToThreeUnits = (mm: number): number => mm * 0.01;

const END_PANEL_THICKNESS = 20; // 20mm로 통일

// 2D 모드용 Box with Edges 컴포넌트 - EdgesGeometry 사용으로 일관성 확보
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  onBeforeRender?: () => void;
}> = ({ args, position, material, renderMode, onBeforeRender }) => {
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args[0], args[1], args[2]]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const { viewMode } = useSpace3DView();
  const { theme } = useTheme();
  
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
        <lineBasicMaterial color={renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : (theme?.mode === 'dark' ? "#888888" : "#666666")} linewidth={0.5} />
      </lineSegments>
    </group>
  );
};

const Room: React.FC<RoomProps> = ({
  spaceInfo,
  floorColor = '#FF9966',
  viewMode = '3D',
  materialConfig,
  showAll = true,
  showFrame = true,
  placedModules
}) => {
  // 고유 ID로 어떤 Room 인스턴스인지 구분
  const roomId = React.useRef(`room-${Date.now()}-${Math.random()}`).current;
  if (!spaceInfo || typeof spaceInfo.width !== 'number' || typeof spaceInfo.height !== 'number') {
    return null;
  }
  const { theme } = useTheme();
  const { colors } = useThemeColors();
  const { renderMode } = useSpace3DView(); // context에서 renderMode 가져오기
  const { highlightedFrame } = useUIStore(); // 강조된 프레임 상태 가져오기
  
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
    const baseFrameMm = calculateBaseFrameWidth(spaceInfo);
    const topBottomFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
    const baseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);
    
    // 노서라운드 빌트인 디버그
    console.log('🔍 Room - 프레임 계산 결과:', {
      surroundType: spaceInfo.surroundType,
      installType: spaceInfo.installType,
      frameThicknessMm,
      topBottomFrameHeightMm,
      baseFrameHeightMm,
      baseFrameMm,
      isNoSurround: spaceInfo.surroundType === 'no-surround',
      isBuiltin: spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in',
      shouldHideAllFrames: spaceInfo.surroundType === 'no-surround'
    });
    
    // mm를 Three.js 단위로 변환
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
  }, [spaceInfo.width, spaceInfo.height, spaceInfo.depth, spaceInfo.installType, spaceInfo.surroundType, spaceInfo.baseConfig, spaceInfo.floorFinish, spaceInfo.frameSize, placedModules]);
  
  const { 
    width, height, panelDepth, furnitureDepth, floorFinishHeight, frameThickness, baseFrame, topBottomFrameHeight, baseFrameHeight,
    // 원본 mm 값들
    widthMm, heightMm, panelDepthMm, furnitureDepthMm, floorFinishHeightMm, frameThicknessMm, baseFrameMm, topBottomFrameHeightMm, baseFrameHeightMm
  } = dimensions;
  
  

  
  // 공통 프레임 재질 생성 함수 (도어와 동일한 재질로 통일)
  const createFrameMaterial = useCallback((frameType?: 'left' | 'right' | 'top' | 'base') => {
    const frameColor = materialConfig?.doorColor || '#E0E0E0'; // Changed default from #FFFFFF to light gray
    const isHighlighted = frameType && highlightedFrame === frameType;
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isHighlighted ? '#FF0000' : frameColor), // 강조 시 레드색으로 변경
      metalness: 0.0,        // 완전 비금속 (도어와 동일)
      roughness: 0.6,        // 도어와 동일한 거칠기
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(isHighlighted ? 0x220000 : 0x000000),  // 강조 시 레드 자체발광 추가
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isHighlighted,  // 강조 시에도 투명하게
      opacity: renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid') ? 0.5 : isHighlighted ? 0.6 : 1.0,  // 강조 시 60% 투명도
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
  }, [materialConfig?.doorColor, materialConfig?.doorTexture, renderMode, viewMode, highlightedFrame, spaceInfo.frameSize, spaceInfo.baseConfig]);

  const columnsDeps = JSON.stringify(spaceInfo.columns ?? []);

  // useEffect+useState로 material을 관리
  const [baseFrameMaterial, setBaseFrameMaterial] = useState<THREE.Material>();
  const [leftFrameMaterial, setLeftFrameMaterial] = useState<THREE.Material>();
  const [leftSubFrameMaterial, setLeftSubFrameMaterial] = useState<THREE.Material>();
  const [rightFrameMaterial, setRightFrameMaterial] = useState<THREE.Material>();
  const [rightSubFrameMaterial, setRightSubFrameMaterial] = useState<THREE.Material>();
  const [topFrameMaterial, setTopFrameMaterial] = useState<THREE.Material>();
  const [topSubFrameMaterial, setTopSubFrameMaterial] = useState<THREE.Material>();
  const [baseSubFrameMaterial, setBaseSubFrameMaterial] = useState<THREE.Material>();

  useEffect(() => {
    const mat = createFrameMaterial('base');
    setBaseFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  useEffect(() => {
    const mat = createFrameMaterial('left');
    setLeftFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  useEffect(() => {
    const mat = createFrameMaterial('left');
    setLeftSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  useEffect(() => {
    const mat = createFrameMaterial('right');
    setRightFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  useEffect(() => {
    const mat = createFrameMaterial('right');
    setRightSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  useEffect(() => {
    const mat = createFrameMaterial('top');
    setTopFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  useEffect(() => {
    const mat = createFrameMaterial('top');
    setTopSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  useEffect(() => {
    const mat = createFrameMaterial('base');
    setBaseSubFrameMaterial(mat);
    return () => mat.dispose();
  }, [createFrameMaterial, columnsDeps, viewMode, materialConfig?.doorColor, materialConfig?.doorTexture]);
  
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
  
  // 상단 요소들의 Y 위치 (띄워서 배치일 때 위로 이동)
  const topElementsY = panelStartY + height - topBottomFrameHeight/2;
  
  // 좌우 프레임의 시작 Y 위치 (띄워서 배치일 때 위로 이동)
  const sideFrameStartY = panelStartY + floatHeight;
  const sideFrameCenterY = sideFrameStartY + adjustedPanelHeight/2;

  // 벽 여부 확인
  const { wallConfig = { left: true, right: true } } = spaceInfo;
  console.log('🏠 Room - 노서라운드 빌트인 프레임 체크:', {
    installType: spaceInfo.installType,
    surroundType: spaceInfo.surroundType,
    isNoSurround: spaceInfo.surroundType === 'no-surround',
    isBuiltin: spaceInfo.installType === 'builtin',
    frameThicknessMm,
    frameThickness,
    leftPanel: frameThickness.left > 0 ? `${frameThicknessMm.left}mm` : 'none',
    rightPanel: frameThickness.right > 0 ? `${frameThicknessMm.right}mm` : 'none',
    shouldHaveNoFrames: spaceInfo.surroundType === 'no-surround' && spaceInfo.installType === 'builtin'
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
      노서라운드_깊이mm: (slotFloorDepth - mmToThreeUnits(20)) / 0.01,
      차이mm: 20,
      slotFloorDepth,
      노서라운드깊이: slotFloorDepth - mmToThreeUnits(20)
    });
  }

  return (
    <group position={[0, 0, groupZOffset]}>
      {/* 주변 벽면들 - ShaderMaterial 기반 그라데이션 (3D 모드에서만 표시) */}
      {(viewMode === '3D' || viewMode === '3d') && (
        <>
          {/* 왼쪽 외부 벽면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 왼쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {(spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
            (spaceInfo.installType === 'semistanding' && wallConfig?.left)) && (
            <mesh
              position={[-width/2 - 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <planeGeometry args={[extendedPanelDepth, height]} />
              <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal')} />
            </mesh>
          )}
          
          {/* 오른쪽 외부 벽면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) - 반대 방향 */}
          {/* 프리스탠딩이 아니고 (세미스탠딩에서 오른쪽 벽이 있거나 빌트인)일 때만 표시 */}
          {(spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
            (spaceInfo.installType === 'semistanding' && wallConfig?.right)) && (
            <mesh
              position={[width/2 + 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <planeGeometry args={[extendedPanelDepth, height]} />
              <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse')} />
            </mesh>
          )}
          
          {/* 상단 외부 벽면 (천장) - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) - 세로 반대 방향 */}
          <mesh
            position={[xOffset + width/2, panelStartY + height + 0.001, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[width, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical-reverse')} />
          </mesh>
          
          {/* 바닥면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) */}
          <mesh
            position={[xOffset + width/2, panelStartY - 0.001, extendedZOffset + extendedPanelDepth/2]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[width, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical')} />
          </mesh>
          
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
          
          {/* 뒤쪽 외부 벽면 - 투명 처리 */}
          <mesh
            position={[xOffset + width/2, panelStartY + height/2, zOffset - 0.01]}
          >
            <planeGeometry args={[width, height]} />
            <meshStandardMaterial 
              color="#ffffff" 
              transparent={true}
              opacity={0.0}
              side={THREE.DoubleSide}
            />
          </mesh>
          
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
        </>
      )}
      
      {/* 바닥 마감재가 있는 경우 - 전체 가구 폭으로 설치 */}
      {spaceInfo.hasFloorFinish && floorFinishHeight > 0 && (
        <BoxWithEdges
          args={[width, floorFinishHeight, extendedPanelDepth]}
          position={[xOffset + width/2, yOffset + floorFinishHeight/2, extendedZOffset + extendedPanelDepth/2]}
          material={new THREE.MeshLambertMaterial({ color: floorColor, transparent: true, opacity: 0.3 })}
          renderMode={renderMode}
        />
      )}
      
      {/* 슬롯 바닥면 - 그린색으로 표시 - showAll이 true일 때만 */}
      {showAll && (() => {
        // 내경 공간 계산 (ColumnGuides와 동일한 방식)
        const internalSpace = calculateInternalSpace(spaceInfo);
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const frontZ = mmToThreeUnits(internalSpace.depth / 2);
        const backZ = -frontZ;
        
        // 슬롯 가이드와 동일한 범위 계산
        const indexing = calculateSpaceIndexing(spaceInfo);
        const { threeUnitBoundaries } = indexing;
        const slotStartX = threeUnitBoundaries[0];
        const slotEndX = threeUnitBoundaries[threeUnitBoundaries.length - 1];
        const slotWidth = slotEndX - slotStartX;
        const slotCenterX = (slotStartX + slotEndX) / 2;
        
        // 좌우 프레임의 앞쪽 끝 위치 계산
        const frameEndZ = furnitureZOffset + furnitureDepth/2;
        
        // 바닥면의 시작점(뒤쪽)과 끝점(프레임 앞쪽) 사이의 거리
        // 앞쪽에서 20mm 줄이기
        const floorDepth = frameEndZ - backZ - mmToThreeUnits(20);
        
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
              receiveShadow
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
      {/* 노서라운드 모드에서는 좌우 프레임 숨김 */}
      {console.log('🔍 Left Frame Check:', {
        showFrame,
        'frameThickness.left': frameThickness.left,
        'frameThickness.left > 0': frameThickness.left > 0,
        surroundType: spaceInfo.surroundType,
        'is no-surround': spaceInfo.surroundType === 'no-surround',
        'surroundType !== no-surround': spaceInfo.surroundType !== 'no-surround',
        installType: spaceInfo.installType,
        'frameThicknessMm.left': frameThicknessMm.left,
        'should render': showFrame && frameThickness.left > 0 && spaceInfo.surroundType !== 'no-surround',
        'FINAL RENDER': showFrame && frameThickness.left > 0 && spaceInfo.surroundType !== 'no-surround'
      })}
      {showFrame && frameThickness.left > 0 && spaceInfo.surroundType !== 'no-surround' && (
        <BoxWithEdges
          args={[
            frameThickness.left, 
            adjustedPanelHeight, 
            // 설치 타입과 벽 여부에 따라 깊이 결정
            (spaceInfo.installType === 'semistanding' && !wallConfig?.left) || 
            spaceInfo.installType === 'freestanding' 
              ? (spaceInfo.surroundType === 'no-surround' 
                  ? slotFloorDepth - mmToThreeUnits(20)  // 노서라운드: 20mm 짧게
                  : slotFloorDepth)
              : mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우 프레임 (20mm)
          ]}
          position={[
            xOffset + frameThickness.left/2, 
            sideFrameCenterY, 
            // 노서라운드 엔드패널은 뒤쪽부터 시작해서 앞쪽 20mm 짧게
            (spaceInfo.installType === 'semistanding' && !wallConfig?.left) || 
            spaceInfo.installType === 'freestanding'
              ? (spaceInfo.surroundType === 'no-surround'
                  ? backZ + (slotFloorDepth - mmToThreeUnits(20))/2  // 20mm 짧은 패널의 중심
                  : backZ + slotFloorDepth/2)  // 서라운드는 기존대로
              : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2  // 프레임: 기존 위치
          ]}
          material={leftFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
          renderMode={renderMode}
        />
      )}
      
      
      {/* 오른쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {/* 노서라운드 모드에서는 좌우 프레임 숨김 */}
      {console.log('🔍 Right Frame Check:', {
        showFrame,
        'frameThickness.right': frameThickness.right,
        'frameThickness.right > 0': frameThickness.right > 0,
        surroundType: spaceInfo.surroundType,
        'is no-surround': spaceInfo.surroundType === 'no-surround',
        'surroundType !== no-surround': spaceInfo.surroundType !== 'no-surround',
        installType: spaceInfo.installType,
        'frameThicknessMm.right': frameThicknessMm.right,
        'should render': showFrame && frameThickness.right > 0 && spaceInfo.surroundType !== 'no-surround',
        'FINAL RENDER': showFrame && frameThickness.right > 0 && spaceInfo.surroundType !== 'no-surround'
      })}
      {showFrame && frameThickness.right > 0 && spaceInfo.surroundType !== 'no-surround' && (
        <BoxWithEdges
          args={[
            frameThickness.right, 
            adjustedPanelHeight, 
            // 설치 타입과 벽 여부에 따라 깊이 결정
            (spaceInfo.installType === 'semistanding' && !wallConfig?.right) || 
            spaceInfo.installType === 'freestanding' 
              ? (spaceInfo.surroundType === 'no-surround' 
                  ? slotFloorDepth - mmToThreeUnits(20)  // 노서라운드 엔드패널: 20mm 짧게
                  : slotFloorDepth)  // 서라운드 엔드패널: 전체 깊이
              : mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우 프레임 (18mm)
          ]}
          position={[
            xOffset + width - frameThickness.right/2, 
            sideFrameCenterY, 
            // 노서라운드 엔드패널은 뒤쪽부터 시작해서 앞쪽 20mm 짧게
            (spaceInfo.installType === 'semistanding' && !wallConfig?.right) || 
            spaceInfo.installType === 'freestanding'
              ? (spaceInfo.surroundType === 'no-surround'
                  ? backZ + (slotFloorDepth - mmToThreeUnits(20))/2  // 20mm 짧은 패널의 중심
                  : backZ + slotFloorDepth/2)  // 서라운드는 기존대로
              : furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2  // 프레임: 기존 위치
          ]}
          material={rightFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
          renderMode={renderMode}
        />
      )}
      
      
      {/* 상단 패널 - ㄱ자 모양으로 구성 */}
      {/* 수평 상단 프레임 - 좌우 프레임 사이에만 배치 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 노서라운드 모드에서는 전체 너비로 확장하지만 좌우 프레임이 없을 때만 표시 */}
      {showFrame && topBottomFrameHeightMm > 0 && (
        <>
          {/* 노서라운드 모드에서 상단프레임 폭 디버깅 */}
          {/* spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [상단프레임] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${finalPanelWidth.toFixed(2)}`) */}
          
          {/* 기둥이 있는 경우 상단 프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            
            // 노서라운드일 때는 슬롯 가이드와 동일한 범위 사용
            let frameWidth, frameX;
            if (spaceInfo.surroundType === 'no-surround') {
              const indexing = calculateSpaceIndexing(spaceInfo);
              const { threeUnitBoundaries } = indexing;
              const slotStartX = threeUnitBoundaries[0];
              const slotEndX = threeUnitBoundaries[threeUnitBoundaries.length - 1];
              frameWidth = slotEndX - slotStartX;
              frameX = (slotStartX + slotEndX) / 2;
            } else {
              frameWidth = finalPanelWidth;
              frameX = topBottomPanelX;
            }
            
            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            if (columns.length === 0 || !hasDeepColumns) {
              // 기둥이 없거나 모든 기둥이 729mm 이하면 기존처럼 하나의 프레임으로 렌더링
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
                    // 노서라운드: 엔드패널이 있으면 40mm 뒤로, 서라운드: 20mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    (spaceInfo.surroundType === 'no-surround' && 
                     (spaceInfo.installType === 'freestanding' || 
                      (spaceInfo.installType === 'semistanding' && (!spaceInfo.wallConfig?.left || !spaceInfo.wallConfig?.right)))
                     ? mmToThreeUnits(40) : mmToThreeUnits(20))
                  ]}
                  material={topFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                />
              );
            }
            
            // 기둥이 있는 경우 분절된 프레임들 렌더링
            const frameSegments: Array<{
              width: number;
              x: number;
            }> = [];
            
            // 전체 프레임 범위 계산
            const frameStartX = frameX - frameWidth / 2;
            const frameEndX = frameX + frameWidth / 2;
            
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
                    // 노서라운드: 엔드패널이 있으면 40mm 뒤로, 서라운드: 20mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    (spaceInfo.surroundType === 'no-surround' && 
                     (spaceInfo.installType === 'freestanding' || 
                      (spaceInfo.installType === 'semistanding' && (!spaceInfo.wallConfig?.left || !spaceInfo.wallConfig?.right)))
                     ? mmToThreeUnits(40) : mmToThreeUnits(20))
                  ]}
                  material={topFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                />
              );
            }
            
            return frameSegments.map((segment, index) => (
              <BoxWithEdges
                key={`top-frame-segment-${index}`}
                args={[
                  segment.width, 
                  topBottomFrameHeight, 
                  mmToThreeUnits(END_PANEL_THICKNESS)
                ]}
                position={[
                  segment.x, // 분절된 위치
                  topElementsY, 
                  // 바닥 프레임 앞면과 같은 z축 위치에서 20mm 뒤로 이동
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(20)
                ]}
                material={topFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                renderMode={renderMode}
              />
            ));
          })()}
        </>
      )}
      
      {/* 상단 서브프레임 - 상단 프레임에서 앞쪽으로 내려오는 판 (ㄱ자의 세로 부분, X축 기준 90도 회전) */}
      {/* 상단 프레임 높이가 18mm보다 클 때만 렌더링 (서브프레임 높이 18mm와 비교) */}
      {/* 노서라운드 모드에서는 상부 서브프레임도 숨김 */}
      {showFrame && topBottomFrameHeightMm > 18 && (
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
                    material={topSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                    renderMode={renderMode}
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
                    material={topSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
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
      {showFrame && spaceInfo.surroundType !== 'no-surround' &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
        (spaceInfo.installType === 'semistanding' && wallConfig?.left)) && (
        <group 
          position={[
            xOffset + frameThickness.left + mmToThreeUnits(40)/2 - mmToThreeUnits(29), // 왼쪽 프레임과 L자 모양으로 맞물림 (38mm 왼쪽으로)
            sideFrameCenterY, 
            // 캐비넷 앞면에서 30mm 뒤로 이동
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30)
          ]}
          rotation={[0, Math.PI / 2, 0]} // Y축 기준 90도 회전
        >
          <BoxWithEdges
            args={[
              mmToThreeUnits(40), // 오른쪽으로 40mm 나오는 깊이
              adjustedPanelHeight, // 왼쪽 프레임과 동일한 높이
              mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
            ]}
            position={[0, 0, 0]} // group 내에서 원점에 배치
            material={leftSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
            renderMode={renderMode}
          />
        </group>
      )}
      
      {/* 오른쪽 서브프레임 - 오른쪽 프레임에서 왼쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {/* 노서라운드 모드에서는 서브프레임도 숨김 */}
      {showFrame && spaceInfo.surroundType !== 'no-surround' &&
        (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' || 
        (spaceInfo.installType === 'semistanding' && wallConfig?.right)) && (
        <group 
          position={[
            xOffset + width - frameThickness.right - mmToThreeUnits(40)/2 + mmToThreeUnits(29), // 오른쪽 프레임과 L자 모양으로 맞물림 (29mm 오른쪽으로)
            sideFrameCenterY, 
            // 캐비넷 앞면에서 30mm 뒤로 이동
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30)
          ]}
          rotation={[0, Math.PI / 2, 0]} // Y축 기준 90도 회전
        >
          <BoxWithEdges
            args={[
              mmToThreeUnits(40), // 왼쪽으로 40mm 나오는 깊이
              adjustedPanelHeight, // 오른쪽 프레임과 동일한 높이
              mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
            ]}
            position={[0, 0, 0]} // group 내에서 원점에 배치
            material={rightSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
            renderMode={renderMode}
          />
        </group>
      )}
      
      {/* 하단 프레임 - 받침대 역할 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {/* 받침대가 있는 경우에만 렌더링 */}
      {showFrame && baseFrameHeightMm > 0 && spaceInfo.baseConfig?.type === 'floor' && (
        <>
          {/* 노서라운드 모드에서 하부프레임 폭 디버깅 */}
          {/* spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [하부프레임] 좌측이격거리${spaceInfo.gapConfig.left}mm, 우측이격거리${spaceInfo.gapConfig.right}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${finalPanelWidth.toFixed(2)}`) */}
          
          {/* 기둥이 있는 경우 하부 프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            
            // 노서라운드일 때는 슬롯 가이드와 동일한 범위 사용
            let frameWidth, frameX;
            if (spaceInfo.surroundType === 'no-surround') {
              const indexing = calculateSpaceIndexing(spaceInfo);
              const { threeUnitBoundaries } = indexing;
              const slotStartX = threeUnitBoundaries[0];
              const slotEndX = threeUnitBoundaries[threeUnitBoundaries.length - 1];
              frameWidth = slotEndX - slotStartX;
              frameX = (slotStartX + slotEndX) / 2;
            } else {
              frameWidth = finalPanelWidth;
              frameX = topBottomPanelX;
            }
            
            // 기둥이 없거나 모든 기둥이 729mm 이하인 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            // console.log('🔧 [하부프레임 윗면] 기둥 분절 확인:', {
            //   columnsCount: columns.length,
            //   hasDeepColumns,
            //   columnDepths: columns.map(c => c.depth)
            // });
            
            if (columns.length === 0 || !hasDeepColumns) {
              // 기둥이 없거나 모든 기둥이 729mm 이하면 기존처럼 하나의 프레임으로 렌더링
              return (
                <BoxWithEdges
                  args={[
                    frameWidth, 
                    baseFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                  ]}
                  position={[
                    frameX, // 조정된 X 위치
                    panelStartY + baseFrameHeight/2, 
                    // 노서라운드: 엔드패널이 있으면 40mm 뒤로, 서라운드: 20mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    (spaceInfo.surroundType === 'no-surround' && 
                     (spaceInfo.installType === 'freestanding' || 
                      (spaceInfo.installType === 'semistanding' && (!spaceInfo.wallConfig?.left || !spaceInfo.wallConfig?.right)))
                     ? mmToThreeUnits(40) : mmToThreeUnits(20))
                  ]}
                  material={baseFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                />
              );
            }
            
            // 기둥이 있는 경우 분절된 프레임들 렌더링
            const frameSegments: Array<{
              width: number;
              x: number;
            }> = [];
            
            // 전체 프레임 범위 계산
            const frameStartX = frameX - frameWidth / 2;
            const frameEndX = frameX + frameWidth / 2;
            
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
            
            // 분절된 프레임들 렌더링 (분절이 없으면 기본 프레임 렌더링)
            if (frameSegments.length === 0) {
              return (
                <BoxWithEdges
                  args={[
                    finalPanelWidth, 
                    baseFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                  ]}
                  position={[
                    topBottomPanelX, // 중앙 정렬
                    panelStartY + baseFrameHeight/2, 
                    // 노서라운드: 엔드패널이 있으면 40mm 뒤로, 서라운드: 20mm 뒤로
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - 
                    (spaceInfo.surroundType === 'no-surround' && 
                     (spaceInfo.installType === 'freestanding' || 
                      (spaceInfo.installType === 'semistanding' && (!spaceInfo.wallConfig?.left || !spaceInfo.wallConfig?.right)))
                     ? mmToThreeUnits(40) : mmToThreeUnits(20))
                  ]}
                  material={baseFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                />
              );
            }
            
            return frameSegments.map((segment, index) => {
              console.log(`🎨 Base frame segment ${index} material:`, {
                hasBaseFrameMaterial: !!baseFrameMaterial,
                materialType: baseFrameMaterial?.type,
                segmentWidth: segment.width
              });
              
              return (
                <BoxWithEdges
                  key={`base-frame-segment-${index}`}
                  args={[
                    segment.width, 
                    baseFrameHeight, 
                    mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
                  ]}
                  position={[
                    segment.x, // 분절된 위치
                    panelStartY + baseFrameHeight/2, 
                    // 상단 프레임과 같은 z축 위치에서 20mm 뒤로 이동
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(20)
                  ]}
                  material={baseFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                />
              );
            });
          })()}
        </>
      )}
      
      {/* 하단 서브프레임 - 하단 프레임에서 앞쪽으로 올라오는 판 (ㄱ자의 세로 부분, X축 기준 -90도 회전) */}
      {/* 받침대가 있는 경우에만 렌더링 */}
      {showFrame && baseFrameHeightMm > 0 && spaceInfo.baseConfig?.type === 'floor' && (
        <>
          {/* 기둥이 있는 경우 하단 서브프레임을 분절하여 렌더링 */}
          {(() => {
            const columns = spaceInfo.columns || [];
            
            // 노서라운드일 때는 슬롯 가이드와 동일한 범위 사용
            let subFrameWidth, subFrameX;
            if (spaceInfo.surroundType === 'no-surround') {
              const indexing = calculateSpaceIndexing(spaceInfo);
              const { threeUnitBoundaries } = indexing;
              const slotStartX = threeUnitBoundaries[0];
              const slotEndX = threeUnitBoundaries[threeUnitBoundaries.length - 1];
              subFrameWidth = slotEndX - slotStartX;
              subFrameX = (slotStartX + slotEndX) / 2;
            } else {
              subFrameWidth = finalPanelWidth;
              subFrameX = topBottomPanelX;
            }
            
            // 기둥이 없거나 모든 기둥이 730mm 이하인 경우 분절하지 않음
            const hasDeepColumns = columns.some(column => column.depth >= 730);
            
            // console.log('🔧 [하부프레임 앞면] 기둥 분절 확인:', {
            //   columnsCount: columns.length,
            //   hasDeepColumns,
            //   columnDepths: columns.map(c => c.depth)
            // });
            
            if (columns.length === 0 || !hasDeepColumns) {
              // 기둥이 없거나 모든 기둥이 730mm 이하면 기존처럼 하나의 서브프레임으로 렌더링
              return (
                <group 
                  position={[
                    subFrameX, // 중앙 정렬 (하단 프레임과 동일)
                    panelStartY + baseFrameHeight - mmToThreeUnits(END_PANEL_THICKNESS)/2, // 하단 프레임 상단에서 ㄱ모양으로 맞물림 (서브프레임 아랫면이 프레임 윗면과 맞춤)
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30) // 상부 서브 프레임과 동일한 Z축 위치 (30mm 뒤로)
                  ]}
                  rotation={[-Math.PI / 2, 0, 0]} // X축 기준 -90도 회전 (상단과 반대 방향)
                >
                  <BoxWithEdges
                    args={[
                      subFrameWidth, 
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={baseSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                    renderMode={renderMode}
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
            const frameStartX = subFrameX - subFrameWidth / 2;
            const frameEndX = subFrameX + subFrameWidth / 2;
            
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
                    topBottomPanelX, // 중앙 정렬 (하단 프레임과 동일)
                    panelStartY + baseFrameHeight - mmToThreeUnits(END_PANEL_THICKNESS)/2, // 하단 프레임 상단에서 ㄱ모양으로 맞물림 (서브프레임 아랫면이 프레임 윗면과 맞춤)
                    furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30) // 상부 서브 프레임과 동일한 Z축 위치 (30mm 뒤로)
                  ]}
                  rotation={[-Math.PI / 2, 0, 0]} // X축 기준 -90도 회전 (상단과 반대 방향)
                >
                  <BoxWithEdges
                    args={[
                      finalPanelWidth, 
                      mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                      mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                    ]}
                    position={[0, 0, 0]} // group 내에서 원점에 배치
                    material={baseSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                    renderMode={renderMode}
                  />
                </group>
              );
            }
            
            return frameSegments.map((segment, index) => (
              <group 
                key={`base-subframe-segment-${index}`}
                position={[
                  segment.x, // 분절된 위치
                  panelStartY + baseFrameHeight - mmToThreeUnits(END_PANEL_THICKNESS)/2, // 하단 프레임 상단에서 ㄱ모양으로 맞물림 (서브프레임 아랫면이 프레임 윗면과 맞춤)
                  furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30) // 상부 서브 프레임과 동일한 Z축 위치 (30mm 뒤로)
                ]}
                rotation={[-Math.PI / 2, 0, 0]} // X축 기준 -90도 회전 (상단과 반대 방향)
              >
                <BoxWithEdges
                  args={[
                    segment.width, 
                    mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
                    mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
                  ]}
                  position={[0, 0, 0]} // group 내에서 원점에 배치
                  material={baseSubFrameMaterial ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })}
                  renderMode={renderMode}
                />
              </group>
            ));
          })()}
        </>
      )}
      
      {/* 배치된 가구들 */}
      <PlacedFurnitureContainer viewMode={viewMode} renderMode={renderMode} placedModules={placedModules} />
    </group>
  );
};

// Room 컴포넌트를 메모이제이션하여 불필요한 리렌더링 방지
export default React.memo(Room, (prevProps, nextProps) => {
  // 기본 props 비교
  if (prevProps.viewMode !== nextProps.viewMode) return false;
  if (prevProps.renderMode !== nextProps.renderMode) return false;
  if (prevProps.showAll !== nextProps.showAll) return false;
  if (prevProps.floorColor !== nextProps.floorColor) return false;
  
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