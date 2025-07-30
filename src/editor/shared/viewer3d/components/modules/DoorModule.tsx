import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '../../../utils/indexing';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useThree, useFrame } from '@react-three/fiber';
import { useTheme } from '@/contexts/ThemeContext';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';
import { useFurnitureStore } from '@/store/core/furnitureStore';

// BoxWithEdges 컴포넌트 정의 (독립적인 그림자 업데이트 포함)
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
}> = ({ args, position, material, renderMode, isDragging = false, isEditMode = false, onClick, onPointerOver, onPointerOut }) => {
  const { theme } = useTheme();
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  
  const { viewMode } = useSpace3DView();
  const { gl } = useThree();
  
  // BoxWithEdges 컴포넌트 내부에 getThemeColor 함수 정의
  const getThemeColor = () => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  };
  
  // Shadow auto-update enabled - manual shadow updates removed

  // 재질을 그대로 사용 (복제하지 않음)
  const processedMaterial = material;
  
  // 재질 텍스처 확인 (성능 최적화로 로그 제거)
  useEffect(() => {
    if (material && 'map' in material) {
      const mat = material as THREE.MeshStandardMaterial;
      // 로그 제거로 성능 향상
    }
  }, [material]);
  
  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh 
          geometry={geometry} 
          material={processedMaterial}
          receiveShadow={viewMode === '3D' && !isEditMode} 
          castShadow={viewMode === '3D' && !isEditMode}
          renderOrder={isEditMode ? 999 : 0} // 편집 모드에서는 맨 위에 렌더링
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        />
      )}
      {/* 윤곽선 렌더링 - 3D에서 더 강력한 렌더링 */}
      {viewMode === '3D' ? (
        <lineSegments geometry={edgesGeometry} renderOrder={isEditMode ? 1000 : 0}>
          <lineBasicMaterial 
            color={isEditMode ? getThemeColor() : "#505050"}
            transparent={true}
            opacity={isEditMode ? 0.3 : 0.9}
            depthTest={true}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        </lineSegments>
      ) : (
        ((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
          <lineSegments geometry={edgesGeometry}>
            <lineBasicMaterial 
              color={renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : (theme?.mode === 'dark' ? "#cccccc" : "#666666")} 
              linewidth={0.5} 
            />
          </lineSegments>
        )
      )}
    </group>
  );
};

interface DoorModuleProps {
  moduleWidth: number; // 가구 폭 (mm) - 무시됨, 도어는 항상 원래 슬롯 크기
  moduleDepth: number; // 가구 깊이 (mm)
  hingePosition?: 'left' | 'right'; // 힌지 위치 (기본값: right)
  spaceInfo: SpaceInfo;
  color?: string;
  doorXOffset?: number; // 도어 위치 보정값 (사용하지 않음)
  originalSlotWidth?: number; // 원래 슬롯 너비 (mm) - 도어 크기는 이 값 사용
  slotCenterX?: number; // 원래 슬롯 중심 X 좌표 (Three.js 단위) - 도어 위치는 이 값 사용
  moduleData?: any; // 실제 듀얼캐비넷 분할 정보를 위한 모듈 데이터
  isDragging?: boolean; // 드래그 상태
  isEditMode?: boolean; // 편집 모드 여부
}

const DoorModule: React.FC<DoorModuleProps> = ({
  moduleWidth,
  moduleDepth,
  hingePosition = 'right',
  spaceInfo,
  color,
  doorXOffset = 0, // 사용하지 않음
  originalSlotWidth,
  slotCenterX,
  moduleData,
  isDragging = false,
  isEditMode = false
}) => {
  // Store에서 재질 설정과 도어 상태 가져오기
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const { doorsOpen } = useUIStore();
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  
  // props로 받은 spaceInfo를 우선 사용, 없으면 store에서 가져오기
  const currentSpaceInfo = spaceInfo || storeSpaceInfo;
  const materialConfig = currentSpaceInfo.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#E0E0E0'  // 기본값 변경
  };

  // 색상 설정: color prop이 있으면 사용, 없으면 현재 spaceInfo의 도어 색상 사용
  let doorColor = color || materialConfig.doorColor;
  // 혹시라도 rgba/hex8 등 알파값이 포함된 경우 알파값 무시 (불투명 hex로 변환)
  if (typeof doorColor === 'string') {
    // hex8 (#RRGGBBAA) → hex6 (#RRGGBB)
    if (/^#([0-9a-fA-F]{8})$/.test(doorColor)) {
      doorColor = '#' + doorColor.slice(1, 7);
    }
    // rgba() → rgb()로 변환
    if (/^rgba\(/.test(doorColor)) {
      const rgb = doorColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) {
        doorColor = `#${(+rgb[1]).toString(16).padStart(2, '0')}${(+rgb[2]).toString(16).padStart(2, '0')}${(+rgb[3]).toString(16).padStart(2, '0')}`;
      }
    }
  }
  
  // 선택된 도어인지 확인
  const selectedPlacedModuleId = useFurnitureStore(state => state.selectedPlacedModuleId);
  const isSelected = selectedPlacedModuleId === moduleData?.id;

  // 기본 도어 재질 생성 (BoxWithEdges에서 재처리됨)
  const { theme } = useTheme();
  // BoxWithEdges와 동일한 강조색 함수
  const getThemeColor = () => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  };
  // 도어 재질 생성 함수 (듀얼 가구용 개별 재질 생성) - 초기 생성용
  const createDoorMaterial = useCallback(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#E0E0E0'), // 기본 회색으로 생성
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(0x000000),
    });
  }, []); // 의존성 배열 비움 - 한 번만 생성

  // 싱글 가구용 도어 재질 - 한 번만 생성 (성능 최적화)
  const doorMaterial = useMemo(() => {
    return createDoorMaterial();
  }, [createDoorMaterial]);

  // 듀얼 가구용 왼쪽 도어 재질 (별도 인스턴스) - 한 번만 생성 (성능 최적화)
  const leftDoorMaterial = useMemo(() => {
    return createDoorMaterial();
  }, [createDoorMaterial]);

  // 듀얼 가구용 오른쪽 도어 재질 (별도 인스턴스) - 한 번만 생성 (성능 최적화)
  const rightDoorMaterial = useMemo(() => {
    return createDoorMaterial();
  }, [createDoorMaterial]);

  // 재질 속성 업데이트 (재생성 없이) - 성능 최적화
  useEffect(() => {
    const materials = [doorMaterial, leftDoorMaterial, rightDoorMaterial];
    materials.forEach(mat => {
      if (mat) {
        // 색상 설정
        if (isDragging || isEditMode) {
          // 드래그 중이거나 편집 모드일 때는 항상 테마 색상
          mat.color.set(getThemeColor());
        } else if (!mat.map) {
          // 텍스처가 없을 때만 기본 색상 사용
          mat.color.set(isSelected ? getThemeColor() : doorColor);
        }
        
        // 편집 모드일 때 설정 (드래그와 분리)
        if (isEditMode) {
          mat.transparent = true;
          mat.opacity = 0.15; // 매우 투명하게 (고스트 효과)
          mat.color.set(getThemeColor());
          mat.map = null; // 편집 모드에는 텍스처 제거
          mat.depthWrite = false; // 깊이 버퍼 쓰기 비활성화
          mat.depthTest = true; // 깊이 테스트는 활성화
          mat.side = THREE.DoubleSide; // 양면 렌더링
          mat.emissive = new THREE.Color(getThemeColor()); // 발광 효과
          mat.emissiveIntensity = 0.1; // 약한 발광
        } else if (isDragging) {
          mat.transparent = true;
          mat.opacity = 0.3;
          mat.color.set(getThemeColor());
          mat.map = null;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
        } else if (viewMode === '2D' && renderMode === 'solid') {
          mat.transparent = true;
          mat.opacity = 0.2;
          mat.depthWrite = true;
        } else if (renderMode === 'wireframe') {
          mat.transparent = true;
          mat.opacity = 0.3;
          mat.depthWrite = true;
        } else if (isSelected) {
          mat.transparent = true;
          mat.opacity = 0.5;
          mat.depthWrite = true;
        } else {
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.depthWrite = true;
        }
        
        mat.needsUpdate = true;
      }
    });
  }, [doorColor, isSelected, isDragging, isEditMode, viewMode, renderMode, doorMaterial, leftDoorMaterial, rightDoorMaterial]);

  // Shadow auto-update enabled - manual shadow updates removed

  // 텍스처 적용 함수 (성능 최적화)
  const applyTextureToMaterial = useCallback((material: THREE.MeshStandardMaterial, textureUrl: string | undefined, doorSide: string) => {
    if (textureUrl && material) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isCabinetTexture1(textureUrl)) {
        applyCabinetTexture1Settings(material);
      }
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl, 
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);
          material.map = texture;
          
          // Cabinet Texture1이 아닌 경우에만 기본 설정 적용
          if (!isCabinetTexture1(textureUrl)) {
            material.color.setHex(0xffffff); // 다른 텍스처는 기본 흰색
            material.toneMapped = true; // 기본 톤 매핑 활성화
            material.roughness = 0.6; // 기본 거칠기
          } else {
            // Cabinet Texture 1인 경우 다시 한번 설정 적용 (텍스처 로드 후)
            applyCabinetTexture1Settings(material);
          }
          
          material.needsUpdate = true;
          
          console.log(`🚪 ${doorSide} 텍스처 로드 완료:`, {
            hasMap: !!material.map,
            mapImage: material.map?.image?.src,
            color: material.color.getHexString(),
            toneMapped: material.toneMapped,
            roughness: material.roughness,
            isCabinetTexture1: isCabinetTexture1(textureUrl)
          });
          
          // 강제 리렌더링을 위해 다음 프레임에서 한번 더 업데이트
          requestAnimationFrame(() => {
            material.needsUpdate = true;
          });
        },
        undefined,
        (error) => {
          console.error(`❌ ${doorSide} 도어 텍스처 로딩 실패:`, textureUrl, error);
        }
      );
    } else if (material) {
      // 텍스처가 없으면 맵 제거하고 기본 색상으로 복원
      if (material.map) {
        material.map.dispose(); // 기존 텍스처 메모리 해제
        material.map = null;
      }
      material.color.set(doorColor);
      material.toneMapped = true; // 기본 톤 매핑 복원
      material.roughness = 0.6; // 기본 거칠기 복원
      material.needsUpdate = true;
    }
  }, [doorColor]);

  // 도어 텍스처 적용 (텍스처 URL 변경 시에만)
  useEffect(() => {
    const textureUrl = materialConfig.doorTexture;
    
    console.log('🚪 DoorModule 텍스처 적용 시작:', {
      textureUrl,
      hasDoorMaterial: !!doorMaterial,
      hasLeftDoorMaterial: !!leftDoorMaterial,
      hasRightDoorMaterial: !!rightDoorMaterial,
      doorColor,
      isDragging,
      materialConfig
    });
    
    // 드래그 중이거나 편집 모드가 아닐 때만 텍스처 적용 (성능 최적화)
    if (!isDragging && !isEditMode) {
      // 텍스처 변경 시에만 실행 (material 참조 변경은 무시)
      if (doorMaterial) {
        applyTextureToMaterial(doorMaterial, textureUrl, '싱글');
      }
      if (leftDoorMaterial) {
        applyTextureToMaterial(leftDoorMaterial, textureUrl, '왼쪽');
      }
      if (rightDoorMaterial) {
        applyTextureToMaterial(rightDoorMaterial, textureUrl, '오른쪽');
      }
    }
    
    // Three.js가 자동으로 업데이트하도록 함
  }, [materialConfig.doorTexture, materialConfig, applyTextureToMaterial, doorMaterial, leftDoorMaterial, rightDoorMaterial, isDragging, isEditMode]); // 필요한 의존성 추가
  
  // 투명도 설정: renderMode에 따라 조정 (2D solid 모드에서도 투명하게)
  const opacity = renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid' ? 0.2 : 1.0);
  // 인덱싱 정보 계산
  const indexing = calculateSpaceIndexing(spaceInfo);
  const columnWidth = indexing.columnWidth;
  
  // 도어 크기는 항상 원래 슬롯 크기 사용 (기둥 침범과 무관)
  // moduleWidth는 기둥 침범 시 줄어든 캐비넷 너비이므로 절대 사용하면 안됨
  const actualDoorWidth = originalSlotWidth || indexing.columnWidth; // 원래 슬롯 너비만 사용
  
  // 듀얼 가구인지 확인 (원래 슬롯 크기 기준)
  const isDualFurniture = Math.abs(actualDoorWidth - (columnWidth * 2)) < 50;
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 도어 두께 (요구사항: 20mm)
  const doorThickness = 20;
  const doorThicknessUnits = mmToThreeUnits(doorThickness);
  
  // === 문 높이 계산 ===
  // 문 높이 = 전체 공간 높이 - 바닥재 높이 (내경 공간 높이)
  const fullSpaceHeight = spaceInfo.height;
  const floorHeight = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 0) : 0;
  const actualDoorHeight = fullSpaceHeight - floorHeight;
  const doorHeight = mmToThreeUnits(actualDoorHeight - 30); // 30mm 줄임 (기존 20mm에서 10mm 추가)
  
  // === 문 Y 위치 계산 (기존 작동하던 로직으로 복원) ===
  // 
  // 핵심 원리: Three.js 좌표계에서 Y=0은 바닥 기준
  // 문의 기본 위치는 Y=0 (바닥)에서 시작하여 위로 올라감
  // 
  // 조정 로직:
  // 1. 바닥재가 있으면 바닥재 높이의 절반만큼 위로 (바닥재 중심에서 시작)
  // 2. 상단 프레임과의 간격을 위해 상단 프레임 높이의 절반만큼 위로
  // 3. 받침대가 있으면 받침대 높이의 절반만큼 아래로 (받침대 공간 확보)
  //
  let doorYPosition: number;
  
  if (spaceInfo.baseConfig?.type === 'floor') {
    // 받침대 있음: 상단 프레임 높이의 절반만큼 위로 + 받침대 높이의 절반만큼 아래로 조정
    const topFrameHeight = spaceInfo.frameSize?.top || 50;
    const baseFrameHeight = spaceInfo.baseConfig.height || 65;
    doorYPosition = floorHeight > 0 
      ? mmToThreeUnits(topFrameHeight) / 2 - mmToThreeUnits(baseFrameHeight) / 2
      : mmToThreeUnits(topFrameHeight) / 2 - mmToThreeUnits(baseFrameHeight) / 2;
  } else {
    // 받침대 없음: 상단 프레임 높이의 절반만큼 위로 조정
    const topFrameHeight = spaceInfo.frameSize?.top || 50;
    doorYPosition = floorHeight > 0 ? mmToThreeUnits(topFrameHeight) / 2 : mmToThreeUnits(topFrameHeight) / 2;
  }
  
  // 도어 깊이는 가구 깊이에서 10mm 바깥쪽으로 나오게 (가구 몸체와 겹침 방지)
  const doorDepth = mmToThreeUnits(moduleDepth) + mmToThreeUnits(20); // 10mm 바깥쪽으로
  
  // 패널 두께 (18mm)와 힌지 위치 오프셋(9mm) 상수 정의
  const panelThickness = 18;
  const hingeOffset = panelThickness / 2; // 9mm
  const hingeOffsetUnits = mmToThreeUnits(hingeOffset);
  
  // 편집 모드 체크 로그
  useEffect(() => {
    if (isEditMode) {
      console.log('🚪🔓 도어 편집 모드 활성화:', {
        isEditMode,
        doorsOpen,
        shouldOpen: doorsOpen || isEditMode,
        moduleId: moduleData?.id
      });
    }
  }, [isEditMode, doorsOpen, moduleData?.id]);

  // 도어 열림 상태 계산 - 성능 최적화
  const shouldOpenDoors = useMemo(() => doorsOpen || isEditMode, [doorsOpen, isEditMode]);
  
  // 도어 애니메이션 상태 추적
  const [isAnimating, setIsAnimating] = useState(false);
  
  // 도어 상태 변경 시 애니메이션 시작
  useEffect(() => {
    if (doorsOpen !== undefined) {
      setIsAnimating(true);
      // 애니메이션이 끝나면 (약 1초 후) 상태 업데이트
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [doorsOpen]);
  
  // 애니메이션 중일 때 프레임마다 렌더링
  useFrame(() => {
    if (isAnimating && gl) {
      // 애니메이션 중일 때만 강제 렌더링
      if ('invalidate' in gl) {
        (gl as any).invalidate();
      }
    }
  });
  
  // 도어 클릭 핸들러
  const handleDoorClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    
    console.log('🚪 도어 클릭 이벤트 발생:', {
      moduleId: moduleData?.id,
      doorsOpen,
      isEditMode,
      eventType: event.type,
      target: event.target,
      currentDoorsOpen: doorsOpen,
      willBeOpen: !doorsOpen
    });
    
    // 도어 상태 토글
    const { toggleDoors } = useUIStore.getState();
    toggleDoors();
    
    // Three.js 렌더러에 다시 그리기 요청 (react-three-fiber의 invalidate 사용)
    if (gl) {
      // invalidate 함수가 있으면 사용, 없으면 직접 렌더
      if ('invalidate' in gl) {
        (gl as any).invalidate();
      }
    }
    
    // 토글 후 상태 확인
    setTimeout(() => {
      const newState = useUIStore.getState().doorsOpen;
      console.log('🚪 도어 상태 토글 완료, 새로운 상태:', newState);
    }, 100);
  };

  // 도어 호버 핸들러
  const handleDoorPointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
  };

  const handleDoorPointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'auto';
  };
  
  // 애니메이션 설정 - 성능 최적화 (80도 열림)
  // 빠르고 부드러운 애니메이션을 위해 tension/friction 조정
  const leftHingeDoorSpring = useSpring({
    // 왼쪽 힌지: 반시계방향으로 열림 (오른쪽으로 열림) - 80도
    rotation: shouldOpenDoors ? -4 * Math.PI / 9 : 0,
    config: { 
      tension: 120,  // 빠른 반응
      friction: 14,  // 적절한 감속
      clamp: true    // 오버슈팅 방지
    },
  });
  
  const rightHingeDoorSpring = useSpring({
    // 오른쪽 힌지: 시계방향으로 열림 (왼쪽으로 열림) - 80도
    rotation: shouldOpenDoors ? 4 * Math.PI / 9 : 0,
    config: { 
      tension: 120,  // 빠른 반응
      friction: 14,  // 적절한 감속
      clamp: true    // 오버슈팅 방지
    },
  });
  
  // 듀얼 가구용 애니메이션 설정 (80도 열림) - 성능 최적화
  const dualLeftDoorSpring = useSpring({
    rotation: shouldOpenDoors ? -4 * Math.PI / 9 : 0, // 왼쪽 문: 반시계방향 (바깥쪽으로) - 80도
    config: { 
      tension: 120,  // 빠른 반응
      friction: 14,  // 적절한 감속
      clamp: true    // 오버슈팅 방지
    },
  });
  
  const dualRightDoorSpring = useSpring({
    rotation: shouldOpenDoors ? 4 * Math.PI / 9 : 0, // 오른쪽 문: 시계방향 (바깥쪽으로) - 80도
    config: { 
      tension: 120,  // 빠른 반응
      friction: 14,  // 적절한 감속
      clamp: true    // 오버슈팅 방지
    },
  });

  // 도어 위치 계산: 원래 슬롯 중심 사용 (기존 방식)
  const doorGroupX = slotCenterX || 0; // 원래 슬롯 중심 X 좌표 (Three.js 단위)

  if (isDualFurniture) {
    // 듀얼 가구: 도어 크기는 기존 방식 (슬롯사이즈 - 3mm), 위치만 실제 캐비넷과 맞춤
    const totalWidth = actualDoorWidth; // 원래 슬롯 크기 사용
    const doorWidth = (totalWidth - 3) / 2; // 기존 방식: (슬롯사이즈 - 3mm) / 2
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    // 도어는 항상 균등분할 (캐비넷이 비대칭이어도 도어는 대칭)
    const innerWidth = mmToThreeUnits(totalWidth); // 전체 내경 너비
    const leftXOffset = -innerWidth / 4;  // 전체 너비의 1/4 왼쪽
    const rightXOffset = innerWidth / 4;  // 전체 너비의 1/4 오른쪽
    
    // 힌지 축 위치 (각 도어의 바깥쪽 가장자리에서 9mm 안쪽)
    const leftHingeX = leftXOffset + (-doorWidthUnits / 2 + hingeOffsetUnits);  // 왼쪽 도어: 왼쪽 가장자리 + 9mm
    const rightHingeX = rightXOffset + (doorWidthUnits / 2 - hingeOffsetUnits); // 오른쪽 도어: 오른쪽 가장자리 - 9mm

    console.log('🚪 듀얼 도어 위치 (균등분할):', {
      totalWidth,
      doorWidth,
      mode: '균등분할 (도어는 항상 대칭)',
      leftXOffset: leftXOffset.toFixed(3),
      rightXOffset: rightXOffset.toFixed(3),
      leftHingeX: leftHingeX.toFixed(3),
      rightHingeX: rightHingeX.toFixed(3),
      doorGroupX: doorGroupX
    });

    return (
      <group position={[doorGroupX, 0, 0]}> {/* 듀얼 캐비넷도 원래 슬롯 중심에 배치 */}
        {/* 왼쪽 도어 - 왼쪽 힌지 (왼쪽 가장자리에서 회전) */}
        <group position={[leftHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualLeftDoorSpring.rotation}>
            <group position={[doorWidthUnits / 2 - hingeOffsetUnits, 0.1, 0]}>
              {/* BoxWithEdges 사용하여 도어 렌더링 */}
              <BoxWithEdges
                args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
                position={[0, 0, 0]}
                material={leftDoorMaterial}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                onClick={handleDoorClick}
                onPointerOver={handleDoorPointerOver}
                onPointerOut={handleDoorPointerOut}
              />
            </group>
          </animated.group>
        </group>
        
        {/* 오른쪽 도어 - 오른쪽 힌지 (오른쪽 가장자리에서 회전) */}
        <group position={[rightHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualRightDoorSpring.rotation}>
            <group position={[-doorWidthUnits / 2 + hingeOffsetUnits, 0.1, 0]}>
              {/* BoxWithEdges 사용하여 도어 렌더링 */}
              <BoxWithEdges
                args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
                position={[0, 0, 0]}
                material={rightDoorMaterial}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                onClick={handleDoorClick}
                onPointerOver={handleDoorPointerOver}
                onPointerOut={handleDoorPointerOut}
              />
            </group>
          </animated.group>
        </group>
      </group>
    );
  } else {
    // 싱글 가구: 하나의 문 - 힌지 위치에 따라 회전축을 문의 가장자리에서 10mm 안쪽으로 이동
    // 문의 폭 = 원래 슬롯 전체 폭 - 3mm (갭)
    const doorWidth = actualDoorWidth - 3; // 슬롯사이즈 - 3mm
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    // 힌지 위치에 따른 회전축 오프셋 계산
    const hingeAxisOffset = hingePosition === 'left' 
      ? -doorWidthUnits / 2 + hingeOffsetUnits  // 왼쪽 힌지: 왼쪽 가장자리에서 9mm 안쪽
      : doorWidthUnits / 2 - hingeOffsetUnits;  // 오른쪽 힌지: 오른쪽 가장자리에서 9mm 안쪽
    
    // 도어 위치: 회전축이 힌지 위치에 맞게 조정
    const doorPositionX = -hingeAxisOffset; // 회전축 보정을 위한 도어 위치 조정

    return (
      <group position={[doorGroupX + hingeAxisOffset, doorYPosition, doorDepth / 2]}>
        <animated.group rotation-y={hingePosition === 'left' ? leftHingeDoorSpring.rotation : rightHingeDoorSpring.rotation}>
          <group position={[doorPositionX, 0.1, 0]}>
            {/* BoxWithEdges 사용하여 도어 렌더링 */}
            <BoxWithEdges
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              position={[0, 0, 0]}
              material={doorMaterial}
              renderMode={renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
              onClick={handleDoorClick}
              onPointerOver={handleDoorPointerOver}
              onPointerOut={handleDoorPointerOut}
            />
            {/* 윤곽선 */}
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(doorWidthUnits, doorHeight, doorThicknessUnits)]} />
              <lineBasicMaterial 
                color={
                  viewMode === '2D' && renderMode === 'wireframe'
                    ? getThemeColor()
                    : (viewMode === '3D' ? "#505050" : "#666666")
                } 
                transparent={viewMode === '3D'}
                opacity={viewMode === '3D' ? 0.9 : 1}
              />
            </lineSegments>
          </group>
        </animated.group>
      </group>
    );
  }
};

export default DoorModule; 