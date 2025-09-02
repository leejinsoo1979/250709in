import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { calculateSpaceIndexing, ColumnIndexer } from '../../../utils/indexing';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useThree, useFrame } from '@react-three/fiber';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { NativeLine } from '@/editor/shared/viewer3d/components/elements/NativeLine';

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
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
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
      {/* 면 렌더링 */}
      <mesh 
        geometry={geometry} 
        material={processedMaterial}
        receiveShadow={viewMode === '3D' && renderMode === 'solid' && !isEditMode} 
        castShadow={viewMode === '3D' && renderMode === 'solid' && !isEditMode}
        renderOrder={isEditMode ? 999 : 0} // 편집 모드에서는 맨 위에 렌더링
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      />
      {/* 윤곽선 렌더링 */}
      <lineSegments geometry={edgesGeometry} renderOrder={isEditMode ? 1000 : 900}>
        <lineBasicMaterial 
          color={
            viewMode === '2D'
              ? "#00FF00"  // 2D는 항상 초록색
              : renderMode === 'wireframe'
                ? "#808080"  // 3D 와이어프레임: 회색
                : "#505050"  // 3D solid: 진한 회색
          }
          linewidth={viewMode === '2D' ? 3 : 1}
        />
      </lineSegments>
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
  slotWidths?: number[]; // 듀얼 가구의 경우 개별 슬롯 너비 배열 [left, right]
  slotIndex?: number; // 슬롯 인덱스 (노서라운드 모드에서 엔드패널 확장 판단용)
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
  isEditMode = false,
  slotWidths,
  slotIndex
}) => {
  // Store에서 재질 설정과 도어 상태 가져오기
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const { doorsOpen, view2DDirection } = useUIStore();
  const { columnCount } = useDerivedSpaceStore();
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
  const { theme } = useViewerTheme();
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
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.depthWrite = true;
        } else if (renderMode === 'wireframe') {
          // 와이어프레임 모드에서는 도어를 투명하게 처리 (와이어프레임 X자 방지)
          mat.wireframe = false;  // 와이어프레임 비활성화
          mat.transparent = true;
          mat.opacity = 0;  // 완전히 투명하게
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
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
    
    // 드래그 중이거나 편집 모드, 와이어프레임 모드가 아닐 때만 텍스처 적용 (성능 최적화)
    if (!isDragging && !isEditMode && renderMode !== 'wireframe') {
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
  }, [materialConfig.doorTexture, materialConfig, applyTextureToMaterial, doorMaterial, leftDoorMaterial, rightDoorMaterial, isDragging, isEditMode, renderMode]); // 필요한 의존성 추가
  
  // 투명도 설정: renderMode에 따라 조정 (2D solid 모드에서도 투명하게)
  const opacity = renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid' ? 0.2 : 1.0);
  // zone별 인덱싱 정보 계산
  const zone = (spaceInfo as any).zone;
  const isDroppedZone = zone === 'dropped' && spaceInfo.droppedCeiling?.enabled;
  
  let indexing = calculateSpaceIndexing(spaceInfo);
  
  // 단내림 구간에서는 zone별 columnWidth 사용
  if (isDroppedZone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    if (zoneInfo && zoneInfo.dropped) {
      // 단내림 구간의 columnWidth로 indexing 수정
      indexing = {
        ...indexing,
        columnWidth: zoneInfo.dropped.columnWidth || indexing.columnWidth,
        columnCount: zoneInfo.dropped.columnCount || indexing.columnCount
      };
      console.log('🚨 단내림 구간 indexing 수정:', {
        zone,
        originalColumnWidth: calculateSpaceIndexing(spaceInfo).columnWidth,
        droppedColumnWidth: zoneInfo.dropped.columnWidth,
        droppedColumnCount: zoneInfo.dropped.columnCount
      });
    }
  }
  
  // 도어 크기 계산 - originalSlotWidth가 있으면 무조건 사용 (커버도어)
  let actualDoorWidth = originalSlotWidth || moduleWidth || indexing.columnWidth;
  
  console.log('🚪📏 도어 너비 계산:', {
    originalSlotWidth,
    moduleWidth,
    indexingColumnWidth: indexing.columnWidth,
    actualDoorWidth,
    설명: originalSlotWidth ? '커버도어 (원래 슬롯 너비)' : '일반 도어'
  });
  
  // 노서라운드 모드에서 도어 크기 처리
  if (spaceInfo.surroundType === 'no-surround') {
    // 노서라운드에서는 항상 원래 슬롯 크기를 사용해야 함
    // originalSlotWidth가 없으면 indexing의 columnWidth 사용
    if (!originalSlotWidth) {
      // 단내림 구간에서는 zone별 columnWidth 사용 (이미 위에서 수정됨)
      // indexing.columnWidth가 이미 엔드패널을 고려해서 계산됨
      actualDoorWidth = indexing.columnWidth;
      console.log(`🚪 노서라운드 도어 너비 계산 (fallback):`, {
        전체너비: spaceInfo.width,
        columnCount: indexing.columnCount,
        columnWidth: indexing.columnWidth,
        actualDoorWidth,
        zone: (spaceInfo as any).zone,
        isDroppedZone
      });
    }
  }
  
  // 듀얼 가구인지 확인 - moduleData가 있으면 그것으로 판단, 없으면 너비로 추정
  const isDualFurniture = moduleData?.isDynamic && moduleData?.id?.includes('dual') ? true :
    Math.abs(moduleWidth - (indexing.columnWidth * 2)) < 50;
  
  // 도어 모듈 디버깅
  console.log('🚪 DoorModule 렌더링:', {
    moduleWidth,
    originalSlotWidth,
    actualDoorWidth,
    isDualFurniture,
    indexingColumnWidth: indexing.columnWidth,
    slotCenterX,
    moduleDataId: moduleData?.id,
    isDynamic: moduleData?.isDynamic,
    spaceInfoZone: (spaceInfo as any).zone,
    droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
    baseConfig: spaceInfo.baseConfig,
    placementType: spaceInfo.baseConfig?.placementType,
    floatHeight: spaceInfo.baseConfig?.floatHeight
  });
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 도어 두께 (요구사항: 20mm)
  const doorThickness = 20;
  const doorThicknessUnits = mmToThreeUnits(doorThickness);
  
  // === 문 높이 계산 ===
  // 상부장/하부장은 가구 자체 높이에 맞춤, 일반 가구는 전체 공간 높이 사용
  // 주의: spaceInfo.height는 외부 공간 높이, 실제 내부 공간은 상단 프레임 10mm를 뺀 값
  let fullSpaceHeight = spaceInfo.height;
  let floatHeight = 0;
  let actualDoorHeight: number;
  let doorHeightAdjusted: number;
  
  // 상단 프레임 두께 (10mm) - geometry.ts의 SURROUND_FRAME_THICKNESS와 동일
  const topFrameThickness = 10;
  
  // 띄워서 배치인 경우 floatHeight 먼저 가져오기 (모든 가구 타입에 적용)
  // 듀얼 하부장도 포함하여 체크
  if (spaceInfo.baseConfig?.placementType === 'float') {
    floatHeight = spaceInfo.baseConfig.floatHeight || 0;
    console.log('🔴🔴🔴 floatHeight 설정:', {
      baseConfig_type: spaceInfo.baseConfig?.type,
      placementType: spaceInfo.baseConfig?.placementType,
      floatHeight,
      moduleId: moduleData?.id,
      isDualLowerCabinet: moduleData?.id?.includes('dual-lower-cabinet')
    });
  }
  
  // 상부장/하부장 체크
  const isUpperCabinet = moduleData?.category === 'upper' || moduleData?.id?.includes('upper-cabinet');
  const isLowerCabinet = moduleData?.category === 'lower' || moduleData?.id?.includes('lower-cabinet') || moduleData?.id?.includes('dual-lower-cabinet');
  
  // 키큰장 여부 확인 (전역 스코프에서 미리 정의)
  // dual-tall, dual-pantry, 2drawer-hanging 등도 포함
  const isTallCabinet = moduleData?.id?.includes('tall') || 
                        moduleData?.id?.includes('pantry') || 
                        moduleData?.id?.includes('wardrobe') ||
                        moduleData?.id?.includes('2drawer-hanging') || // 2단서랍+옷장 추가
                        moduleData?.category === 'tall' ||
                        (moduleData?.category === 'full' && moduleData?.dimensions?.height >= 2000); // 2000mm 이상 full 가구도 키큰장으로 처리
  
  // 2단서랍+옷장 특별 체크
  const is2DrawerHanging = moduleData?.id?.includes('2drawer-hanging');
  
  console.log('🔍 키큰장 체크:', {
    moduleId: moduleData?.id,
    category: moduleData?.category,
    height: moduleData?.dimensions?.height,
    isTallCabinet,
    is2DrawerHanging,
    includes_tall: moduleData?.id?.includes('tall'),
    includes_pantry: moduleData?.id?.includes('pantry'),
    includes_wardrobe: moduleData?.id?.includes('wardrobe'),
    category_tall: moduleData?.category === 'tall',
    is_full_and_tall: moduleData?.category === 'full' && moduleData?.dimensions?.height >= 2000
  });
  
  if (is2DrawerHanging) {
    console.log('🚨🚨🚨 2단서랍+옷장 감지!!!', {
      moduleId: moduleData?.id,
      category: moduleData?.category,
      dimensions: moduleData?.dimensions,
      isTallCabinet,
      floatHeight,
      spaceInfo: {
        height: spaceInfo.height,
        baseConfig: spaceInfo.baseConfig
      },
      doorHeightAdjusted,
      actualDoorHeight,
      furnitureHeight: moduleData?.dimensions?.height
    });
  }
  
  if (isUpperCabinet || isLowerCabinet) {
    // 상부장/하부장은 가구 높이에 맞춤
    actualDoorHeight = moduleData?.dimensions?.height || (isUpperCabinet ? 600 : 1000);
    
    // 상부장이고 단내림 구간인 경우 - 높이 조정 불필요
    // 가구 자체의 높이는 변하지 않음, Y 위치만 낮아짐
    if (isUpperCabinet && (spaceInfo as any).zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      // 단내림 구간에서도 상부장 자체의 높이는 변하지 않음
      // actualDoorHeight는 그대로 유지
      console.log('🚪📏 단내림 상부장 도어 높이:', {
        originalHeight: moduleData?.dimensions?.height || 600,
        actualDoorHeight,
        zone: (spaceInfo as any).zone,
        설명: '단내림 구간에서도 상부장 자체 높이는 동일, Y 위치만 낮아짐'
      });
    }
    
    doorHeightAdjusted = actualDoorHeight;
    console.log('🚪📏 상하부장 도어 높이:', {
      category: moduleData?.category,
      furnitureHeight: actualDoorHeight,
      doorHeight: actualDoorHeight,
      type: isUpperCabinet ? '상부장' : '하부장'
    });
  } else {
    // 일반 가구(키큰장 등)는 전체 공간 높이 사용
    // floatHeight는 이미 위에서 설정됨
    
    // 단내림 + 서라운드 구간인 경우 키큰장도 단내림 천장 높이 적용
    if ((spaceInfo as any).zone === 'dropped' && spaceInfo.droppedCeiling?.enabled && spaceInfo.surround?.use) {
      const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
      fullSpaceHeight = spaceInfo.height - dropHeight;
      console.log('🚪📏 단내림+서라운드 키큰장 도어 높이 조정:', {
        originalHeight: spaceInfo.height,
        dropHeight,
        adjustedHeight: fullSpaceHeight,
        zone: (spaceInfo as any).zone,
        isTallCabinet,
        surroundUse: spaceInfo.surround?.use
      });
    }
    // 단내림만 있는 경우 (서라운드 없음)
    else if ((spaceInfo as any).zone === 'dropped' && spaceInfo.droppedCeiling?.enabled && !spaceInfo.surround?.use) {
      const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
      fullSpaceHeight = spaceInfo.height - dropHeight;
      console.log('🚪📏 단내림 도어 높이 조정:', {
        originalHeight: spaceInfo.height,
        dropHeight,
        adjustedHeight: fullSpaceHeight,
        zone: (spaceInfo as any).zone
      });
    }
    
    const floorHeight = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 0) : 0;
    actualDoorHeight = fullSpaceHeight - floorHeight;
    
    // 띄워서 배치해도 도어 높이는 변하지 않음 (공간 전체 높이 유지)
    // 단지 Y 위치만 올라감
    doorHeightAdjusted = actualDoorHeight;
  }
  
  // === 문 Y 위치 계산 (높이 계산 전에 위치 먼저 계산) ===
  let doorYPosition: number;
  let finalDoorHeight = doorHeightAdjusted; // 최종 도어 높이 변수
  
  if (isTallCabinet) {
    // 단내림 구간인지 확인
    const zone = (spaceInfo as any).zone;
    const isDroppedZone = zone === 'dropped' && spaceInfo.droppedCeiling?.enabled;
    const dropHeight = isDroppedZone ? (spaceInfo.droppedCeiling?.dropHeight || 200) : 0;
    
    console.log('✅ 키큰장 블록 진입!', {
      moduleId: moduleData?.id,
      floatHeight,
      actualDoorHeight,
      doorHeightAdjusted,
      moduleHeight: moduleData?.dimensions?.height,
      spaceHeight: spaceInfo.height,
      hasTopFrame: topFrameThickness,
      zone,
      isDroppedZone,
      dropHeight,
      surroundUse: spaceInfo.surround?.use
    });
    
    // 단내림+서라운드에서는 키큰장이 상부프레임 하단에 맞닿음 (프레임 두께만큼 갭)
    // 일반 구간에서는 천장-5mm 갭 유지
    const isDroppedWithSurround = isDroppedZone && spaceInfo.surround?.use;
    const upperGap = isDroppedWithSurround ? topFrameThickness : 5;  // 단내림+서라운드: 10mm(프레임 두께), 일반: 5mm
    const lowerGap = 0;      // 바닥까지 (갭 없음)
    
    // 키큰장 가구 높이는 단내림 구간에서도 동일하게 유지
    const furnitureHeight = moduleData?.dimensions?.height || 2400;
    
    const baseHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0;
    
    console.log('🔴 키큰장 가구 높이 확인:', {
      moduleDataHeight: moduleData?.dimensions?.height,
      furnitureHeight,
      actualDoorHeight,
      spaceInfoHeight: spaceInfo.height,
      zone,
      isDroppedZone,
      dropHeight,
      설명: '키큰장은 단내림 구간에서도 높이 동일'
    });
    
    // 단내림 구간에서 키큰장 도어 처리
    if (isDroppedZone) {
      // 단내림 구간: 가구는 dropHeight만큼 내려와 있음
      // 도어 높이는 단내림 천장 높이에 맞춤
      const droppedCeilingHeight = spaceInfo.height - dropHeight;
      
      if (floatHeight > 0) {
        // 띄워서 배치 + 단내림
        // 도어 상단: 단내림 천장 - 5mm
        // 도어 하단: 바닥 + floatHeight + 25mm
        
        // 가구 절대 위치 (단내림 구간 + 띄움 배치)
        // 가구는 단내림 천장에서 아래로 floatHeight만큼 떨어져 있음
        const furnitureTopAbsolute = droppedCeilingHeight - floatHeight;  // 단내림 천장 - 띄움높이
        const furnitureBottomAbsolute = furnitureTopAbsolute - furnitureHeight;  // 가구 하단
        const furnitureCenterAbsolute = (furnitureTopAbsolute + furnitureBottomAbsolute) / 2;
        
        // 도어 높이는 원래 키큰장 높이에서 띄움높이와 단내림높이를 둘 다 빼야 함
        // 일반구간 키큰장 도어 높이: actualDoorHeight - upperGap - 25
        const normalZoneDoorHeight = actualDoorHeight - upperGap - 25;
        // 단내림구간 도어 높이: 일반구간 도어 높이 - 띄움높이 - 단내림높이
        finalDoorHeight = normalZoneDoorHeight - floatHeight - dropHeight;
        
        // 도어 절대 위치 - 단내림 구간에서는 10mm 더 내려야 함
        const droppedZoneOffset = 10;  // 10mm 직접 지정
        const doorTopAbsolute = furnitureTopAbsolute - droppedZoneOffset;  // 가구 상단 - 10mm
        const doorBottomAbsolute = doorTopAbsolute - finalDoorHeight;  // 도어 상단 - 도어 높이
        
        // 도어 중심 절대 위치
        const doorCenterAbsolute = (doorTopAbsolute + doorBottomAbsolute) / 2;
        
        // 가구 중심 기준 상대 좌표로 변환
        // 단내림 구간에서 추가로 10mm 더 내려야 함
        const additionalDropOffset = -10;
        doorYPosition = mmToThreeUnits(doorCenterAbsolute - furnitureCenterAbsolute + additionalDropOffset);
        
        console.log('🔍 단내림 + 띄움 배치 키큰장 도어 계산:', {
          zone: 'dropped',
          dropHeight,
          droppedCeilingHeight,
          띄움높이: floatHeight,
          가구높이: furnitureHeight,
          공간높이: spaceInfo.height,
          normalZoneDoorHeight,
          도어높이: finalDoorHeight,
          높이계산: `${normalZoneDoorHeight} - ${floatHeight} - ${dropHeight} = ${finalDoorHeight}`,
          droppedZoneOffset,
          furnitureTopAbsolute,
          furnitureBottomAbsolute,
          furnitureCenterAbsolute,
          doorTopAbsolute,
          doorBottomAbsolute,
          doorCenterAbsolute,
          doorYPosition_units: doorYPosition,
          doorYPosition_mm: doorYPosition / 0.01,
          설명: '도어가 10mm 내려오고 높이 = 일반구간 도어높이 - 띄움높이 - 단내림높이'
        });
      } else {
        // 받침대 배치 + 단내림
        // 도어 절대 위치 - 단내림 구간에서는 10mm 더 내려야 함
        const droppedZoneOffset = 10;  // 10mm 직접 지정
        const doorTopAbsolute = droppedCeilingHeight - droppedZoneOffset;  // 단내림 천장-10mm
        const doorBottomAbsolute = 25;                                     // 바닥+25mm (일반구간과 동일)
        
        // 도어 높이 (단내림 천장부터 바닥+25mm까지)
        finalDoorHeight = doorTopAbsolute - doorBottomAbsolute;
        
        // 가구 절대 위치 (단내림 구간)
        // 키큰장은 단내림 구간에서도 바닥부터 단내림 천장까지
        const furnitureTopAbsolute = droppedCeilingHeight - 10;     // 단내림 천장 - 10mm (상부 갭)
        const furnitureBottomAbsolute = baseHeight;                 // 바닥 + 받침대 높이
        const actualFurnitureHeight = furnitureTopAbsolute - furnitureBottomAbsolute;  // 실제 가구 높이
        const furnitureCenterAbsolute = (furnitureTopAbsolute + furnitureBottomAbsolute) / 2;
        
        // 도어 중심 절대 위치
        const doorCenterAbsolute = (doorTopAbsolute + doorBottomAbsolute) / 2;
        
        // 가구 중심 기준 상대 좌표로 변환
        // 단내림 구간에서 추가로 10mm 더 내려야 함
        const additionalDropOffset = -10;
        doorYPosition = (doorCenterAbsolute - furnitureCenterAbsolute + additionalDropOffset) * 0.01; // mm to Three.js units
        
        console.log('🔍 단내림 + 받침대 배치 키큰장 도어 계산:', {
          zone: 'dropped',
          dropHeight,
          droppedCeilingHeight,
          받침대높이: baseHeight,
          원래가구높이: furnitureHeight,
          실제가구높이: actualFurnitureHeight,
          도어높이: finalDoorHeight,
          doorTopAbsolute,
          doorBottomAbsolute,
          furnitureTopAbsolute,
          furnitureBottomAbsolute,
          furnitureCenterAbsolute,
          doorCenterAbsolute,
          doorYPosition_units: doorYPosition,
          doorYPosition_mm: doorYPosition / 0.01,
          설명: '단내림 구간: 도어 높이는 단내림 천장 높이에 맞춤'
        });
      }
    } else {
      // 일반 구간 (기존 로직)
      if (floatHeight > 0) {
        console.log('✅ 키큰장 + 띄움 배치 모드!', { floatHeight, furnitureHeight });
        
        // 도어 절대 위치
        const doorTopAbsolute = actualDoorHeight - upperGap;  // 상부프레임 하단 또는 천장-5mm
        const doorBottomAbsolute = floatHeight + 25;          // 띄움높이 + 25mm (바닥에서 floatHeight + 25mm 위치)
        
        // 도어 높이
        finalDoorHeight = doorTopAbsolute - doorBottomAbsolute;
        
        // 가구 절대 위치  
        const furnitureTopAbsolute = actualDoorHeight;  // 가구 상단은 천장 위치
        const furnitureBottomAbsolute = floatHeight;    // 바닥+띄움높이
        const furnitureCenterAbsolute = (furnitureTopAbsolute + furnitureBottomAbsolute) / 2;
        
        // 도어 중심 절대 위치
        const doorCenterAbsolute = (doorTopAbsolute + doorBottomAbsolute) / 2;
        
        // 가구 중심 기준 상대 좌표로 변환 (Three.js Y=0이 가구 중심)
        // 5mm 더 내림 (2단서랍+옷장도 동일하게 적용)
        doorYPosition = (doorCenterAbsolute - furnitureCenterAbsolute - 5) * 0.01; // mm to Three.js units
        
        console.log('🔍 띄움 배치 키큰장 도어 계산:', {
          띄움높이: floatHeight,
          가구높이: furnitureHeight,
          actualDoorHeight,
          도어높이: finalDoorHeight,
          doorYPosition_units: doorYPosition,
          doorYPosition_mm: doorYPosition / 0.01,
          is2DrawerHanging,
          설명: '가구는 천장-10mm, 도어는 천장-5mm 위치해야 함'
        });
        
        if (is2DrawerHanging) {
          console.log('🚨🚨🚨 2단서랍+옷장 도어 계산 상세:', {
            doorTopAbsolute,
            doorBottomAbsolute,
            finalDoorHeight,
            furnitureCenterAbsolute,
            doorCenterAbsolute,
            doorYPosition,
            doorYPosition_mm: doorYPosition / 0.01,
            계산과정: {
              '도어중심-가구중심': doorCenterAbsolute - furnitureCenterAbsolute,
              '5mm조정': -5,
              '최종': (doorCenterAbsolute - furnitureCenterAbsolute - 5)
            }
          });
        }
      } else {
        // 받침대 배치: 도어는 천장-5mm부터 바닥+25mm까지
        const baseHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0;
        
        // 도어 절대 위치
        const doorTopAbsolute = actualDoorHeight - upperGap;  // 상부프레임 하단 또는 천장-5mm
        const doorBottomAbsolute = 25;                        // 바닥+25mm (바닥에서 25mm 띄움)
        
        // 도어 높이
        finalDoorHeight = doorTopAbsolute - doorBottomAbsolute;
        
        // 가구 절대 위치
        const furnitureTopAbsolute = actualDoorHeight;    // 가구 상단은 천장 위치
        const furnitureBottomAbsolute = baseHeight;       // 바닥+받침대높이
        const furnitureCenterAbsolute = (furnitureTopAbsolute + furnitureBottomAbsolute) / 2;
        
        // 도어 중심 절대 위치
        const doorCenterAbsolute = (doorTopAbsolute + doorBottomAbsolute) / 2;
        
        // 가구 중심 기준 상대 좌표로 변환 (Three.js Y=0이 가구 중심)
        // 5mm 더 내림
        doorYPosition = (doorCenterAbsolute - furnitureCenterAbsolute - 5) * 0.01; // mm to Three.js units
        
        console.log('🔍 받침대 배치 키큰장 도어 계산:', {
          받침대높이: baseHeight,
          가구높이: furnitureHeight,
          actualDoorHeight,
          도어높이: finalDoorHeight,
          doorYPosition_units: doorYPosition,
          설명: '가구는 천장-10mm, 도어는 천장-5mm 위치해야 함'
        });
      }
    }
    
    console.log('🚪📏 키큰장 도어 최종 계산:', {
      type: '키큰장',
      zone,
      isDroppedZone,
      dropHeight,
      가구높이_mm: furnitureHeight,
      전체공간높이_mm: actualDoorHeight,
      띄움높이_mm: floatHeight,
      최종도어높이_mm: finalDoorHeight,
      doorYPosition_units: doorYPosition,
      doorYPosition_mm: doorYPosition / 0.01,
      설명: isDroppedZone ? '단내림: 도어 높이는 단내림 천장에 맞춤' : '일반: 전체 높이 사용',
      note: floatHeight > 0 ? '띄움 배치: 가구 기준 상대 위치' : '일반 배치: 가구 기준 상대 위치'
    });
  } else if (isUpperCabinet) {
    // 상부장 도어: 가구 상단에서 위로 5mm, 하단에서 아래로 18mm 확장
    const upperExtension = 5;   // 가구 상단에서 위로 5mm
    const lowerExtension = 18;  // 가구 하단에서 아래로 18mm (하단 마감재 덮기)
    // 상부장은 항상 원래 높이 유지 (단내림에서도 가구 높이는 변하지 않음)
    const furnitureHeight = moduleData?.dimensions?.height || 600;
    
    // 도어 높이 = 가구 높이 + 위 확장 + 아래 확장
    finalDoorHeight = furnitureHeight + upperExtension + lowerExtension;
    
    // 상부장 도어 Y 위치 계산
    // 단내림 구간인지 확인
    const zone = (spaceInfo as any).zone; // zone 정보 가져오기
    const isDroppedZone = zone === 'dropped' && spaceInfo.droppedCeiling?.enabled;
    
    // 띄워서 배치인 경우
    const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
    const floatHeightForUpper = isFloatPlacement ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
    
    if (isDroppedZone && floatHeightForUpper > 0) {
      // 단내림 구간 + 띄워서 배치: 상부장이 단내림 천장에서 floatHeight만큼 떨어진 위치
      // 도어는 가구 기준 상대 위치 사용
      
      // 기본 오프셋 계산 (일반 구간과 동일)
      const baseOffset = (upperExtension - lowerExtension) / 2;  // -6.5mm
      const additionalOffset = -10;  // 10mm 더 아래로
      
      // Three.js 단위로 변환
      doorYPosition = mmToThreeUnits(baseOffset + additionalOffset);
      
      console.log('🚪📍 단내림 + 띄워서 배치 상부장 도어 위치:', {
        type: '단내림 + 띄워서 배치 상부장',
        zone,
        floatHeight: floatHeightForUpper,
        가구높이: furnitureHeight,
        도어높이: finalDoorHeight,
        기본오프셋: baseOffset,
        추가오프셋: additionalOffset,
        총오프셋: baseOffset + additionalOffset,
        doorYPosition_units: doorYPosition,
        doorYPosition_mm: doorYPosition / 0.01,
        설명: '도어는 가구 기준 상대 위치 사용 (가구 Y 위치는 FurnitureItem에서 처리)'
      });
    } else if (isDroppedZone) {
      // 단내림 구간 (띄워서 배치 아님): 가구가 이미 dropHeight만큼 내려왔으므로
      // 도어는 가구 기준 상대 위치만 사용 (추가 이동 불필요)
      
      // 기본 오프셋 계산 (일반 구간과 동일)
      const baseOffset = (upperExtension - lowerExtension) / 2;  // -6.5mm
      const additionalOffset = -10;  // 10mm 더 아래로
      
      // Three.js 단위로 변환
      doorYPosition = mmToThreeUnits(baseOffset + additionalOffset);
      
      console.log('🚪📍 단내림 상부장 도어 위치 계산:', {
        type: '단내림 상부장',
        zone,
        가구높이: furnitureHeight,
        도어높이: finalDoorHeight,
        기본오프셋: baseOffset,
        추가오프셋: additionalOffset,
        총오프셋: baseOffset + additionalOffset,
        doorYPosition_units: doorYPosition,
        doorYPosition_mm: doorYPosition / 0.01,
        설명: '도어는 가구 기준 상대 위치 사용 (가구가 이미 내려왔으므로 추가 이동 불필요)'
      });
    } else {
      // 일반 구간: 기존 로직 유지
      // 도어 크기는 그대로 유지 (위 5mm, 아래 18mm 확장)
      // 기본 도어 중심 위치 = (5 - 18) / 2 = -6.5mm
      // 추가로 10mm 더 아래로 이동
      const baseOffset = (upperExtension - lowerExtension) / 2;  // -6.5mm
      const additionalOffset = -10;  // 10mm 더 아래로
      
      // Three.js 단위로 변환
      doorYPosition = mmToThreeUnits(baseOffset + additionalOffset);
      
      console.log('🚪📍 상부장 도어 위치 계산:', {
        type: '상부장',
        가구높이: furnitureHeight,
        위확장: upperExtension,
        아래확장: lowerExtension,
        도어높이: finalDoorHeight,
        가구상단_mm: furnitureHeight/2,
        가구하단_mm: -furnitureHeight/2,
        기본오프셋_mm: baseOffset,
        추가오프셋_mm: additionalOffset,
        최종오프셋_mm: baseOffset + additionalOffset,
        doorYPosition_units: doorYPosition,
        doorYPosition_mm: doorYPosition / 0.01,
        계산식: `${baseOffset} + ${additionalOffset} = ${baseOffset + additionalOffset}`,
        note: `도어 중심이 가구 중심보다 ${-(baseOffset + additionalOffset)}mm 아래로 이동`
      });
    }
  } else if (isLowerCabinet) {
    console.log('🔴🔴🔴 하부장 조건 진입!!!', {
      floatHeight,
      isLowerCabinet,
      moduleId: moduleData?.id,
      isDualLowerCabinet: moduleData?.id?.includes('dual-lower-cabinet'),
      moduleCategory: moduleData?.category,
      baseConfig: spaceInfo.baseConfig,
      placementType: spaceInfo.baseConfig?.placementType,
      baseConfigType: spaceInfo.baseConfig?.type,
      slotWidths
    });
    
    const furnitureHeight = moduleData?.dimensions?.height || 1000;
    const upperExtension = 18;  // 위로 18mm
    let lowerExtension = 0;  // 아래 확장값 (else 블록에서 설정)
    
    console.log('🔴🔴🔴 floatHeight 체크:', {
      floatHeight,
      floatHeight_greaterThanZero: floatHeight > 0,
      typeOfFloatHeight: typeof floatHeight,
      baseConfig: spaceInfo.baseConfig,
      moduleId: moduleData?.id
    });
    
    if (floatHeight > 0) {
      console.log('🔴🔴🔴 IF 블록 진입 - 띄움 배치 (듀얼 하부장 포함)');
      // 띄워서 배치: 도어 높이는 변경하지 않음
      
      // 도어 높이: 가구 원래 높이 유지 + 위 확장(18mm)
      finalDoorHeight = furnitureHeight + upperExtension;
      
      // 도어 Y 위치: FurnitureItem에서 처리하므로 0
      doorYPosition = 0;
      
      console.log('🔴🔴🔴 하부장 띄움 배치:', {
        floatHeight,
        furnitureHeight,
        finalDoorHeight,
        doorYPosition,
        doorYPosition_mm: doorYPosition / 0.01,
        위확장: upperExtension,
        도어높이계산: `${furnitureHeight} + ${upperExtension} = ${finalDoorHeight}`,
        가구상단: furnitureHeight / 2,
        가구하단: -furnitureHeight / 2,
        도어상단: (doorYPosition / 0.01) + finalDoorHeight / 2,
        도어하단: (doorYPosition / 0.01) - finalDoorHeight / 2,
        도어하단_vs_가구하단: ((doorYPosition / 0.01) - finalDoorHeight / 2) - (-furnitureHeight / 2),
        설명: '띄움 배치시 도어 위 18mm만 확장, 하단은 가구와 일치해야 함'
      });
    } else {
      console.log('🔴🔴🔴 ELSE 블록 진입 - 일반 배치');
      // 일반 배치: 위 18mm, 아래 40mm 확장
      lowerExtension = 40;
      finalDoorHeight = furnitureHeight + upperExtension + lowerExtension;
      doorYPosition = mmToThreeUnits((lowerExtension - upperExtension) / 2 - 32);
      console.log('🔴🔴🔴 일반 배치 doorYPosition 계산:', {
        lowerExtension,
        upperExtension,
        계산: (lowerExtension - upperExtension) / 2 - 32,
        doorYPosition,
        doorYPosition_mm: doorYPosition / 0.01
      });
    }
    
    console.log('🚪📍 하부장 도어 위치:', {
      type: '하부장',
      floatHeight,
      띄움배치여부: floatHeight > 0,
      가구높이: furnitureHeight,
      위확장: upperExtension,
      아래확장: lowerExtension,
      도어높이: finalDoorHeight,
      doorYPosition,
      doorYPosition_mm: doorYPosition / 0.01,
      가구하단_mm: -furnitureHeight / 2,
      도어하단_mm: (doorYPosition / 0.01) - finalDoorHeight / 2,
      차이: ((doorYPosition / 0.01) - finalDoorHeight / 2) - (-furnitureHeight / 2),
      note: floatHeight > 0 ? '띄워서 배치: 위 18mm만 확장' : '일반 배치: 위 18mm, 아래 40mm 확장'
    });
    
    console.log('🚪📍 하부장 도어 최종:', {
      type: '하부장',
      doorYPosition,
      doorYPosition_mm: doorYPosition / 0.01,
      adjustedHeight: doorHeightAdjusted,
      받침대: spaceInfo.baseConfig?.type === 'floor',
      note: '키큰장 도어와 동일한 Y 위치 사용'
    });
  } else {
    // 일반 가구는 기존 로직 사용
    // 
    // 핵심 원리: Three.js 좌표계에서 Y=0은 바닥 기준
    // 문의 기본 위치는 Y=0 (바닥)에서 시작하여 위로 올라감
    // 
    // 조정 로직:
    // 1. 바닥재가 있으면 바닥재 높이의 절반만큼 위로 (바닥재 중심에서 시작)
    // 2. 상단 프레임과의 간격을 위해 상단 프레임 높이의 절반만큼 위로
    // 3. 받침대가 있으면 받침대 높이의 절반만큼 아래로 (받침대 공간 확보)
    //
    // 하부장, 상부장, 키큰장은 이미 위에서 처리했으므로 제외
    if (!isLowerCabinet && !isUpperCabinet && !isTallCabinet) {
      if (spaceInfo.baseConfig?.type === 'floor') {
        // 받침대 있음: 상단 프레임 높이의 절반만큼 위로 + 받침대 높이의 절반만큼 아래로 조정
        const topFrameHeight = spaceInfo.frameSize?.top || 50;
        const baseFrameHeight = spaceInfo.baseConfig.height || 65;
        const floorHeight = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 0) : 0;
        doorYPosition = floorHeight > 0 
          ? mmToThreeUnits(topFrameHeight) / 2 - mmToThreeUnits(baseFrameHeight) / 2
          : mmToThreeUnits(topFrameHeight) / 2 - mmToThreeUnits(baseFrameHeight) / 2;
      } else {
        // 받침대 없음: 상단 프레임 높이 조정 없음 (0으로 설정)
        const topFrameHeight = spaceInfo.frameSize?.top || 50;
        doorYPosition = 0;
        
        // 띄워서 배치인 경우 Y 위치를 아래로 조정 (15mm 아래로 확장)
        if (floatHeight > 0) {
          // 도어를 7.5mm 아래로 이동 (15mm 확장의 절반)
          doorYPosition = mmToThreeUnits(-7.5);
          console.log('🚪📍 띄워서 배치 도어 위치 조정:', {
            floatHeight,
            doorYPosition,
            doorYPosition_mm: -7.5,
            note: '도어 아래로 15mm 확장을 위해 7.5mm 아래로 이동'
          });
        }
      }
    }
  }
  
  // 단내림 구간인 경우 Y 위치는 조정하지 않음 (하단이 메인구간과 맞아야 함)
  // 단내림 구간에서는 높이만 줄어들고, 하단 위치는 메인 구간과 동일하게 유지
  if ((spaceInfo as any).zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
    console.log('🚪📍 단내림 도어 위치:', {
      doorYPosition,
      doorHeight: actualDoorHeight - 30,
      zone: 'dropped',
      note: '하단이 메인구간과 정렬됨'
    });
  }
  
  // 노서라운드 + 벽없음 상태 체크
  const isNoSurroundNoWallLeft = spaceInfo.surroundType === 'no-surround' && !spaceInfo.wallConfig?.left;
  const isNoSurroundNoWallRight = spaceInfo.surroundType === 'no-surround' && !spaceInfo.wallConfig?.right;
  const endPanelThickness = 18; // 엔드패널 두께 18mm
  
  // 도어 깊이는 가구 깊이에서 10mm 바깥쪽으로 나오게 (가구 몸체와 겹침 방지)
  // 추가로 2mm 더 띄워서 캐비닛과 분리
  // 도어 높이 최종 계산 - 상부장은 여백 없이, 하부장은 확장된 높이, 키큰장은 위에서 계산됨, 일반 가구는 30mm 줄임
  const doorHeight = isUpperCabinet 
    ? mmToThreeUnits(finalDoorHeight) // 상부장은 가구 크기 그대로
    : isLowerCabinet
    ? mmToThreeUnits(finalDoorHeight) // 하부장은 확장된 높이 (위에서 계산됨)
    : isTallCabinet
    ? mmToThreeUnits(finalDoorHeight) // 키큰장은 위 5mm, 아래 40mm 확장 (위에서 계산됨)
    : mmToThreeUnits(finalDoorHeight - 30); // 일반 가구는 30mm 줄임 (원래 로직)
  
  console.log('🚪📐 도어 높이 최종 적용:', {
    moduleId: moduleData?.id,
    category: moduleData?.category,
    isUpperCabinet,
    isLowerCabinet,
    isTallCabinet,
    is2DrawerHanging,
    floatHeight_mm: floatHeight,
    finalDoorHeight_mm: finalDoorHeight,
    doorHeight_mm: isLowerCabinet || isTallCabinet ? finalDoorHeight : (finalDoorHeight - 30),
    doorHeight_three_units: doorHeight,
    doorHeight_three_to_mm: doorHeight / 0.01,
    doorYPosition_units: doorYPosition,
    doorYPosition_mm: doorYPosition / 0.01,
    적용타입: isTallCabinet ? '키큰장' : isUpperCabinet ? '상부장' : isLowerCabinet ? '하부장' : '일반'
  });
  
  if (is2DrawerHanging) {
    console.log('🚨🚨🚨 2단서랍+옷장 최종 도어 값:', {
      moduleId: moduleData?.id,
      doorHeight_mm: doorHeight / 0.01,
      doorYPosition_mm: doorYPosition / 0.01,
      floatHeight,
      finalDoorHeight,
      도어상단_절대위치_mm: (doorYPosition / 0.01) + (doorHeight / 0.01 / 2),
      도어하단_절대위치_mm: (doorYPosition / 0.01) - (doorHeight / 0.01 / 2),
      설명: '이 값들이 다른 키큰장과 동일해야 함'
    });
  }

  // 노서라운드와 서라운드 모드에서 동일한 Z축 위치 유지
  const baseDepthOffset = mmToThreeUnits(20) + mmToThreeUnits(2);
  const doorDepth = mmToThreeUnits(moduleDepth) + baseDepthOffset; // 서라운드와 노서라운드 동일하게 처리
  
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
      // 애니메이션이 끝나면 (약 1.2초 후) 상태 업데이트 (기존 1.5초에서 1.2초로 감소)
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 1200);
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
  
  // 애니메이션 설정 - 적당한 속도 (80도 열림)
  // 부드럽고 자연스러운 애니메이션을 위해 tension/friction 조정
  const leftHingeDoorSpring = useSpring({
    // 왼쪽 힌지: 반시계방향으로 열림 (오른쪽으로 열림) - 80도
    rotation: shouldOpenDoors ? -4 * Math.PI / 9 : 0,
    config: { 
      tension: 90,   // 적당한 반응 (기존 60에서 90으로 증가)
      friction: 16,  // 적당한 감속 (기존 20에서 16으로 감소)
      clamp: true    // 오버슈팅 방지
    },
  });
  
  const rightHingeDoorSpring = useSpring({
    // 오른쪽 힌지: 시계방향으로 열림 (왼쪽으로 열림) - 80도
    rotation: shouldOpenDoors ? 4 * Math.PI / 9 : 0,
    config: { 
      tension: 90,   // 적당한 반응 (기존 60에서 90으로 증가)
      friction: 16,  // 적당한 감속 (기존 20에서 16으로 감소)
      clamp: true    // 오버슈팅 방지
    },
  });
  
  // 듀얼 가구용 애니메이션 설정 (80도 열림) - 적당한 속도
  const dualLeftDoorSpring = useSpring({
    rotation: shouldOpenDoors ? -4 * Math.PI / 9 : 0, // 왼쪽 문: 반시계방향 (바깥쪽으로) - 80도
    config: { 
      tension: 90,   // 적당한 반응 (기존 60에서 90으로 증가)
      friction: 16,  // 적당한 감속 (기존 20에서 16으로 감소)
      clamp: true    // 오버슈팅 방지
    },
  });
  
  const dualRightDoorSpring = useSpring({
    rotation: shouldOpenDoors ? 4 * Math.PI / 9 : 0, // 오른쪽 문: 시계방향 (바깥쪽으로) - 80도
    config: { 
      tension: 90,   // 적당한 반응 (기존 60에서 90으로 증가)
      friction: 16,  // 적당한 감속 (기존 20에서 16으로 감소)
      clamp: true    // 오버슈팅 방지
    },
  });

  // 도어 위치 계산: slotCenterX는 실제로 오프셋 값임
  // 도어는 기본적으로 가구 중심(0,0,0)에 위치하고, slotCenterX 오프셋만큼 이동
  let doorGroupX = slotCenterX !== undefined ? slotCenterX : 0; // 도어 X축 오프셋 (Three.js 단위)
  let doorAdjustment = 0; // 도어 위치 보정값 (듀얼 가구에서 사용)
  
  console.log('🚪 도어 초기 위치:', {
    slotCenterX,
    doorGroupX,
    isDualFurniture,
    slotIndex,
    columnCount,
    surroundType: spaceInfo.surroundType,
    moduleId: moduleData?.id
  });
  
  // slotCenterX가 제공되었는지 확인
  if (slotCenterX !== undefined && slotCenterX !== null && slotCenterX !== 0) {
    // slotCenterX는 오프셋 값으로 처리
    console.log(`🚪 도어 오프셋 적용:`, {
      slotIndex,
      slotCenterX_오프셋: slotCenterX,
      doorGroupX,
      설명: '도어를 가구 중심에서 오프셋만큼 이동'
    });
  } else {
    // slotCenterX가 제공되지 않은 경우 기본값 0 사용 (가구 중심)
    console.log(`🚪 도어 위치 기본값 사용 (가구 중심):`, {
      slotIndex,
      doorGroupX: 0
    });
  }

  // 기둥 옆에 있는지 확인하여 힌지 위치 자동 조정
  const checkColumnAdjacent = () => {
    const columns = spaceInfo.columns || [];
    if (columns.length === 0) {
      console.log('🚪 기둥이 없음');
      return { isNearColumn: false, columnSide: null };
    }
    
    // 노서라운드 모드에서 엔드패널 보정값 계산
    let positionAdjustment = 0;
    if (spaceInfo.surroundType === 'no-surround' && slotIndex !== undefined) {
      const endPanelThickness = 18;
      const hasLeftEndPanel = slotIndex === 0 && actualDoorWidth < indexing.columnWidth;
      const hasRightEndPanel = slotIndex === (columnCount - 1) && actualDoorWidth < indexing.columnWidth;
      
      if (hasLeftEndPanel) {
        positionAdjustment = -endPanelThickness / 2; // 왼쪽으로 9mm
      } else if (hasRightEndPanel) {
        positionAdjustment = endPanelThickness / 2; // 오른쪽으로 9mm
      }
    }
    
    // 도어의 실제 위치 계산 (Three.js 좌표) - 노서라운드 보정값 포함
    const doorCenterX = (slotCenterX || 0) + mmToThreeUnits(positionAdjustment);
    const doorLeftEdge = doorCenterX - mmToThreeUnits(actualDoorWidth / 2);
    const doorRightEdge = doorCenterX + mmToThreeUnits(actualDoorWidth / 2);
    
    console.log('🚪 도어 위치 체크:', {
      doorCenterX,
      doorLeftEdge,
      doorRightEdge,
      actualDoorWidth,
      slotCenterX,
      positionAdjustment,
      surroundType: spaceInfo.surroundType,
      note: positionAdjustment !== 0 ? '노서라운드 보정 적용됨' : '보정 없음'
    });
    
    // 각 기둥과의 거리 체크
    for (const column of columns) {
      const columnX = mmToThreeUnits(column.position[0] - spaceInfo.width / 2);
      const columnWidth = mmToThreeUnits(column.width);
      const columnLeftEdge = columnX - columnWidth / 2;
      const columnRightEdge = columnX + columnWidth / 2;
      
      // 기둥과의 거리 체크 (100mm 이내를 인접으로 판단 - 임계값 증가)
      const threshold = mmToThreeUnits(100);
      
      const leftDistance = Math.abs(doorLeftEdge - columnRightEdge);
      const rightDistance = Math.abs(doorRightEdge - columnLeftEdge);
      
      console.log('🚪 기둥 거리 체크:', {
        columnPosition: column.position,
        columnX,
        columnWidth: column.width,
        columnLeftEdge,
        columnRightEdge,
        leftDistance: leftDistance / 0.01, // mm로 변환
        rightDistance: rightDistance / 0.01, // mm로 변환
        threshold: threshold / 0.01 // mm로 변환
      });
      
      // 왼쪽에 기둥이 있는 경우
      if (leftDistance < threshold) {
        console.log('🚪 왼쪽에 기둥 감지');
        return { isNearColumn: true, columnSide: 'left' };
      }
      
      // 오른쪽에 기둥이 있는 경우
      if (rightDistance < threshold) {
        console.log('🚪 오른쪽에 기둥 감지');
        return { isNearColumn: true, columnSide: 'right' };
      }
    }
    
    console.log('🚪 기둥 인접하지 않음');
    return { isNearColumn: false, columnSide: null };
  };
  
  const columnCheck = checkColumnAdjacent();
  
  // 커버도어인 경우 힌지 위치 자동 조정
  let adjustedHingePosition = hingePosition;
  
  // 모든 도어 타입에서 기둥 체크 (type이 'door' 또는 moduleId에 'door'가 포함된 경우)
  const isDoorModule = moduleData?.type === 'door' || 
                       moduleData?.id?.toLowerCase().includes('door') ||
                       moduleData?.moduleId?.toLowerCase().includes('door');
  
  if (columnCheck.isNearColumn && isDoorModule) {
    // 커버도어의 경우 기둥 반대쪽에 힌지를 둬야 기둥 반대 방향으로 열림
    // 기둥이 왼쪽에 있으면 오른쪽 힌지 (도어가 왼쪽으로 열림 - 기둥 반대 방향)
    // 기둥이 오른쪽에 있으면 왼쪽 힌지 (도어가 오른쪽으로 열림 - 기둥 반대 방향)
    
    // 단내림 + 노서라운드 조합에서는 힌지 로직을 반대로 적용
    const isDroppedNoSurround = (spaceInfo as any).zone === 'dropped' && 
                                spaceInfo.droppedCeiling?.enabled && 
                                spaceInfo.surroundType === 'no-surround';
    
    if (isDroppedNoSurround) {
      // 단내림 + 노서라운드: 기둥과 같은 쪽에 힌지
      adjustedHingePosition = columnCheck.columnSide === 'left' ? 'left' : 'right';
    } else {
      // 일반 경우: 기둥 반대쪽에 힌지
      adjustedHingePosition = columnCheck.columnSide === 'left' ? 'right' : 'left';
    }
    
    console.log('🚪 기둥 인접 도어 힌지 자동 조정:', {
      originalHinge: hingePosition,
      adjustedHinge: adjustedHingePosition,
      columnSide: columnCheck.columnSide,
      doorCenterX: slotCenterX,
      moduleData,
      isDoorModule,
      isDroppedNoSurround,
      zone: (spaceInfo as any).zone,
      surroundType: spaceInfo.surroundType,
      note: isDroppedNoSurround ? 
        '단내림+노서라운드: 힌지는 기둥 쪽에 위치' : 
        '일반: 힌지는 기둥 반대쪽에 위치'
    });
  } else {
    console.log('🚪 힌지 조정 안함:', {
      isNearColumn: columnCheck.isNearColumn,
      columnSide: columnCheck.columnSide,
      isDoorModule,
      moduleData
    });
  }

  if (isDualFurniture) {
    // 듀얼 가구 도어 처리
    let totalWidth = actualDoorWidth; // 기본값
    let leftDoorWidth, rightDoorWidth;
    // 엔드패널 위치 플래그 (console.log에서 사용하기 위해 외부 스코프에 선언)
    let isFirstSlotWithEndPanel = false;
    let isLastSlotWithEndPanel = false;
    // 슬롯 너비 변수들 (console.log에서 사용하기 위해 외부 스코프에 선언)
    let slot1Width = 0;
    let slot2Width = 0;
    
    // 단내림 구간에서 슬롯 너비가 없는 경우 처리 (zone 변수는 이미 위에서 선언됨)
    
    if (isDroppedZone && (!slotWidths || slotWidths.length < 2)) {
      console.log('🚨 단내림 구간 듀얼장 도어 너비 계산 - slotWidths 없음, 기본값 사용', {
        zone,
        slotWidths,
        indexingColumnWidth: indexing.columnWidth,
        actualDoorWidth,
        moduleWidth
      });
      // 단내림 구간에서 slotWidths가 없으면 columnWidth 사용
      slot1Width = indexing.columnWidth;
      slot2Width = indexing.columnWidth;
      totalWidth = slot1Width + slot2Width;
      
      // 서라운드 모드인 경우
      if (spaceInfo.surroundType !== 'no-surround') {
        const surroundDoorGap = 6; // 서라운드 도어 사이 간격 (각 3mm씩)
        leftDoorWidth = (totalWidth - surroundDoorGap) / 2;
        rightDoorWidth = (totalWidth - surroundDoorGap) / 2;
      } else {
        // 노서라운드 모드
        const noSurroundDoorGap = 3; // 노서라운드 도어 사이 간격
        const noSurroundEdgeGap = 1.5; // 노서라운드 양쪽 끝 간격
        leftDoorWidth = (totalWidth - noSurroundDoorGap - 2 * noSurroundEdgeGap) / 2;
        rightDoorWidth = (totalWidth - noSurroundDoorGap - 2 * noSurroundEdgeGap) / 2;
      }
    } else {
    
    // 노서라운드 모드: 커버도어 (엔드패널을 가림)
    if (spaceInfo.surroundType === 'no-surround') {
      // 노서라운드에서는 도어가 엔드패널을 덮으므로, 
      // 엔드패널이 제거된 슬롯 너비를 복원해야 함
      // slotWidths가 없으면 indexing.columnWidth 사용
      slot1Width = slotWidths?.[0] || indexing.columnWidth;
      slot2Width = slotWidths?.[1] || indexing.columnWidth;
      
      if (slotWidths && slotWidths.length >= 2) {
        // 벽없음(freestanding) 모드: 양쪽 끝에 엔드패널
        if (spaceInfo.installType === 'freestanding') {
          // 첫 번째 슬롯인 경우: 엔드패널 두께를 더해서 원래 슬롯 크기 복원
          if (slotIndex === 0) {
            slot1Width = slotWidths[0] + endPanelThickness; // 582 + 18 = 600
            slot2Width = slotWidths[1];
          }
          // 마지막 슬롯인 경우: 엔드패널 두께를 더해서 원래 슬롯 크기 복원
          // 듀얼 가구는 2개 슬롯을 차지하므로 slotIndex + 2가 columnCount 이상일 때
          else if (slotIndex + 2 >= indexing.columnCount) {
            slot1Width = slotWidths[0];
            slot2Width = slotWidths[1] + endPanelThickness; // 582 + 18 = 600
          }
          // 중간 슬롯인 경우: 실제 값 사용
          else {
            slot1Width = slotWidths[0];
            slot2Width = slotWidths[1];
          }
        } 
        // 한쪽벽(semistanding) 모드: 벽이 없는 쪽에만 엔드패널
        else if (spaceInfo.installType === 'semistanding') {
          // 왼쪽벽 모드: 오른쪽 끝에만 엔드패널
          if (spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right) {
            if (slotIndex + 2 >= indexing.columnCount) {
              // 마지막 슬롯: 오른쪽에 엔드패널
              slot1Width = slotWidths[0];
              slot2Width = slotWidths[1] + endPanelThickness; // 582 + 18 = 600
            } else {
              // 나머지: 실제 슬롯 너비 사용
              slot1Width = slotWidths[0];
              slot2Width = slotWidths[1];
            }
          }
          // 오른쪽벽 모드: 왼쪽 끝에만 엔드패널
          else if (spaceInfo.wallConfig?.right && !spaceInfo.wallConfig?.left) {
            if (slotIndex === 0) {
              // 첫 번째 슬롯: 왼쪽에 엔드패널
              slot1Width = slotWidths[0] + endPanelThickness; // 582 + 18 = 600
              slot2Width = slotWidths[1];
            } else {
              // 나머지: 실제 슬롯 너비 사용
              slot1Width = slotWidths[0];
              slot2Width = slotWidths[1];
            }
          } else {
            // 예외 케이스: 실제 슬롯 너비 사용
            slot1Width = slotWidths[0];
            slot2Width = slotWidths[1];
          }
        }
        // 양쪽벽(standing) 모드: 엔드패널 없음
        else {
          slot1Width = slotWidths[0];
          slot2Width = slotWidths[1];
        }
      }
      
      // 도어 전체 너비 계산
      totalWidth = slot1Width + slot2Width;
      
      // 엔드패널 위치 판단
      if (spaceInfo.installType === 'freestanding') {
        // 벽없음 모드: 양쪽 끝에 엔드패널
        isFirstSlotWithEndPanel = slotIndex === 0 && slotWidths?.[0] < indexing.columnWidth;
        isLastSlotWithEndPanel = slotWidths && slotWidths.length >= 2 && 
                                       slotWidths[1] < indexing.columnWidth && 
                                       slotIndex + 2 >= indexing.columnCount; // 듀얼이 2슬롯 차지
        
        // 듀얼 도어 위치 보정
        if (isFirstSlotWithEndPanel) {
          doorAdjustment = -endPanelThickness / 2; // 왼쪽으로 9mm
        } else if (isLastSlotWithEndPanel) {
          doorAdjustment = endPanelThickness / 2; // 오른쪽으로 9mm
        }
      } else if (spaceInfo.installType === 'semistanding') {
        // 한쪽벽 모드: 벽이 없는 쪽에만 엔드패널
        if (spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right) {
          // 왼쪽벽 모드: 오른쪽 끝에만 엔드패널
          isFirstSlotWithEndPanel = false;
          isLastSlotWithEndPanel = slotIndex + 2 >= indexing.columnCount && 
                                   slotWidths && slotWidths.length >= 2 && 
                                   slotWidths[1] < indexing.columnWidth;
          
          if (isLastSlotWithEndPanel) {
            doorAdjustment = endPanelThickness / 2; // 오른쪽으로 9mm
          }
        } else if (spaceInfo.wallConfig?.right && !spaceInfo.wallConfig?.left) {
          // 오른쪽벽 모드: 왼쪽 끝에만 엔드패널
          isFirstSlotWithEndPanel = slotIndex === 0 && slotWidths?.[0] < indexing.columnWidth;
          isLastSlotWithEndPanel = false;
          
          if (isFirstSlotWithEndPanel) {
            doorAdjustment = -endPanelThickness / 2; // 왼쪽으로 9mm
          }
        } else {
          // 예외 케이스
          isFirstSlotWithEndPanel = false;
          isLastSlotWithEndPanel = false;
          doorAdjustment = 0;
        }
      } else {
        // 양쪽벽 모드: 엔드패널 없음
        isFirstSlotWithEndPanel = false;
        isLastSlotWithEndPanel = false;
        doorAdjustment = 0;
      }
      
      console.log('🚪 듀얼 엔드패널 상태:', {
        isFirstSlotWithEndPanel,
        isLastSlotWithEndPanel,
        doorAdjustment,
        note: '엔드패널 위치로 보정'
      });
      
      // 노서라운드 도어 크기: 1200mm 기준 균등분할
      const noSurroundDoorGap = 3; // 노서라운드 도어 사이 간격
      const noSurroundEdgeGap = 1.5; // 노서라운드 양쪽 끝 간격
      leftDoorWidth = (totalWidth - noSurroundDoorGap - 2 * noSurroundEdgeGap) / 2;  // 597mm
      rightDoorWidth = (totalWidth - noSurroundDoorGap - 2 * noSurroundEdgeGap) / 2; // 597mm
    } else {
      // 서라운드 모드: 일반 도어
      // slotWidths가 있으면 사용, 없으면 totalWidth 사용
      if (slotWidths && slotWidths.length >= 2) {
        slot1Width = slotWidths[0];
        slot2Width = slotWidths[1];
        totalWidth = slot1Width + slot2Width;
      }
      const surroundDoorGap = 6; // 서라운드 도어 사이 간격 (각 3mm씩)
      leftDoorWidth = (totalWidth - surroundDoorGap) / 2;
      rightDoorWidth = (totalWidth - surroundDoorGap) / 2;
    }
    }
    
    // 모드별 갭 값 설정
    const doorGap = spaceInfo.surroundType === 'no-surround' ? 3 : 6;
    const edgeGap = spaceInfo.surroundType === 'no-surround' ? 1.5 : 1.5; // 서라운드에서도 1.5mm 갭 적용
    
    console.log('🚪 듀얼 도어:', {
      totalWidth,
      leftDoorWidth,
      rightDoorWidth,
      doorGap,
      edgeGap,
      doorAdjustment,
      slotIndex,
      columnCount,
      isFirstSlotWithEndPanel,
      isLastSlotWithEndPanel,
      slotWidths,
      slot1Width,
      slot2Width,
      surroundType: spaceInfo.surroundType
    });
    
    const leftDoorWidthUnits = mmToThreeUnits(leftDoorWidth);
    const rightDoorWidthUnits = mmToThreeUnits(rightDoorWidth);
    
    // 도어 위치 계산
    let leftDoorCenter, rightDoorCenter;
    
    // 도어 위치는 전체 너비 기준으로 계산
    // 왼쪽 도어: 왼쪽 끝에서 edgeGap 떨어진 위치
    leftDoorCenter = -totalWidth / 2 + edgeGap + leftDoorWidth / 2;
    // 오른쪽 도어: 오른쪽 끝에서 edgeGap 떨어진 위치
    rightDoorCenter = totalWidth / 2 - edgeGap - rightDoorWidth / 2;
    
    // 노서라운드에서 엔드패널 위치 보정 (개별 도어 위치는 그대로 유지)
    
    const leftXOffset = mmToThreeUnits(leftDoorCenter);
    const rightXOffset = mmToThreeUnits(rightDoorCenter);
    
    // 힌지 축 위치 (각 도어의 바깥쪽 가장자리에서 9mm 안쪽)
    const leftHingeX = leftXOffset + (-leftDoorWidthUnits / 2 + hingeOffsetUnits);  // 왼쪽 도어: 왼쪽 가장자리 + 9mm
    const rightHingeX = rightXOffset + (rightDoorWidthUnits / 2 - hingeOffsetUnits); // 오른쪽 도어: 오른쪽 가장자리 - 9mm

    // 노서라운드 모드에서 도어 위치 보정
    // slotCenterX가 이미 보정된 값이 아닌 경우에만 적용
    if (spaceInfo.surroundType === 'no-surround' && doorAdjustment !== 0) {
      // slotCenterX가 0이 아닌 값이면 이미 FurnitureItem에서 보정됨
      const needsAdjustment = slotCenterX === 0 || slotCenterX === undefined;
      if (needsAdjustment) {
        doorGroupX += mmToThreeUnits(doorAdjustment);
        console.log('🚪 듀얼 도어 위치 보정 적용:', {
          slotIndex,
          slotCenterX,
          doorAdjustment,
          doorGroupX,
          isFirstSlot: slotIndex === 0,
          isLastSlot: slotIndex + 2 >= indexing.columnCount,
          note: 'DoorModule에서 보정'
        });
      } else {
        console.log('🚪 듀얼 도어 위치 보정 건너뜀:', {
          slotIndex,
          slotCenterX,
          doorAdjustment,
          isFirstSlot: slotIndex === 0,
          isLastSlot: slotIndex + 2 >= indexing.columnCount,
          note: 'FurnitureItem에서 이미 보정됨'
        });
      }
    }

    console.log('🚪 듀얼 도어 위치:', {
      totalWidth,
      slotWidths,
      slotIndex,
      columnCount,
      isLastSlot: slotIndex + 2 >= columnCount,
      leftDoorWidth,
      rightDoorWidth,
      doorAdjustment,
      doorGroupX,
      doorGroupX_mm: doorGroupX / 0.01,
      mode: slotWidths ? '개별 슬롯 너비' : '균등분할 (fallback)',
      leftXOffset: leftXOffset.toFixed(3),
      rightXOffset: rightXOffset.toFixed(3),
      leftHingeX: leftHingeX.toFixed(3),
      rightHingeX: rightHingeX.toFixed(3)
    });

    return (
      <group position={[doorGroupX, 0, 0]}> {/* 듀얼 캐비넷도 원래 슬롯 중심에 배치 */}
        {/* 왼쪽 도어 - 왼쪽 힌지 (왼쪽 가장자리에서 회전) */}
        <group position={[leftHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualLeftDoorSpring.rotation}>
            <group position={[leftDoorWidthUnits / 2 - hingeOffsetUnits, 0.1, 0]}>
              {/* BoxWithEdges 사용하여 도어 렌더링 */}
              <BoxWithEdges
                args={[leftDoorWidthUnits, doorHeight, doorThicknessUnits]}
                position={[0, 0, 0]}
                material={leftDoorMaterial}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                onClick={handleDoorClick}
                onPointerOver={handleDoorPointerOver}
                onPointerOut={handleDoorPointerOut}
              />
              
              {/* Door opening direction for left door (front view) */}
              {viewMode === '2D' && view2DDirection === 'front' && (
                <group position={[0, 0, doorThicknessUnits / 2 + 0.001]}>
                  {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                  {(() => {
                    // 첫 번째 대각선 (위에서 아래로)
                    const start1 = [leftDoorWidthUnits / 2, -doorHeight / 2, 0];
                    const end1 = [-leftDoorWidthUnits / 2, 0, 0];
                    const segments1 = [];
                    
                    // 선분의 총 길이 계산
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                    
                    // 패턴 정의: [긴 대시, 공백, 짧은 대시, 공백]의 반복
                    const longDash = 2.4;   // 긴 대시 (6배)
                    const shortDash = 0.9;  // 짧은 대시 (6배)
                    const gap = 0.9;        // 공백 (6배)
                    const patternLength = longDash + gap + shortDash + gap;
                    
                    let currentPos = 0;
                    let isLongDash = true;
                    
                    // 첫 번째 대시는 무조건 그리기 (모서리에서 시작)
                    while (currentPos < totalLength1) {
                      if (isLongDash) {
                        // 긴 대시
                        let dashLength = longDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + longDash + gap >= totalLength1) {
                          dashLength = totalLength1 - currentPos;
                        }
                        const t1 = currentPos / totalLength1;
                        const t2 = (currentPos + dashLength) / totalLength1;
                        segments1.push(
                          <NativeLine
                            key={`seg1-long-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength1) break;
                        currentPos += dashLength + gap;
                      } else {
                        // 짧은 대시
                        let dashLength = shortDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + shortDash + gap >= totalLength1) {
                          dashLength = totalLength1 - currentPos;
                        }
                        const t1 = currentPos / totalLength1;
                        const t2 = (currentPos + dashLength) / totalLength1;
                        segments1.push(
                          <NativeLine
                            key={`seg1-short-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength1) break;
                        currentPos += dashLength + gap;
                      }
                      isLongDash = !isLongDash;
                    }
                    
                    // 두 번째 대각선 (아래에서 위로)
                    const start2 = [-leftDoorWidthUnits / 2, 0, 0];
                    const end2 = [leftDoorWidthUnits / 2, doorHeight / 2, 0];
                    const segments2 = [];
                    
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    
                    currentPos = 0;
                    isLongDash = true;
                    
                    // 첫 번째 대시는 무조건 그리기 (모서리에서 시작)
                    while (currentPos < totalLength2) {
                      if (isLongDash) {
                        // 긴 대시
                        let dashLength = longDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + longDash + gap >= totalLength2) {
                          dashLength = totalLength2 - currentPos;
                        }
                        const t1 = currentPos / totalLength2;
                        const t2 = (currentPos + dashLength) / totalLength2;
                        segments2.push(
                          <NativeLine
                            key={`seg2-long-${currentPos}`}
                            points={[
                              [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                              [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength2) break;
                        currentPos += dashLength + gap;
                      } else {
                        // 짧은 대시
                        let dashLength = shortDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + shortDash + gap >= totalLength2) {
                          dashLength = totalLength2 - currentPos;
                        }
                        const t1 = currentPos / totalLength2;
                        const t2 = (currentPos + dashLength) / totalLength2;
                        segments2.push(
                          <NativeLine
                            key={`seg2-short-${currentPos}`}
                            points={[
                              [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                              [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength2) break;
                        currentPos += dashLength + gap;
                      }
                      isLongDash = !isLongDash;
                    }
                    
                    return [...segments1, ...segments2];
                  })()}
                </group>
              )}
            </group>
          </animated.group>
        </group>
        
        {/* 오른쪽 도어 - 오른쪽 힌지 (오른쪽 가장자리에서 회전) */}
        <group position={[rightHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualRightDoorSpring.rotation}>
            <group position={[-rightDoorWidthUnits / 2 + hingeOffsetUnits, 0.1, 0]}>
              {/* BoxWithEdges 사용하여 도어 렌더링 */}
              <BoxWithEdges
                args={[rightDoorWidthUnits, doorHeight, doorThicknessUnits]}
                position={[0, 0, 0]}
                material={rightDoorMaterial}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                onClick={handleDoorClick}
                onPointerOver={handleDoorPointerOver}
                onPointerOut={handleDoorPointerOut}
              />
              
              {/* Door opening direction for right door (front view) */}
              {viewMode === '2D' && view2DDirection === 'front' && (
                <group position={[0, 0, doorThicknessUnits / 2 + 0.001]}>
                  {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                  {(() => {
                    // 첫 번째 대각선 (위에서 아래로)
                    const start1 = [-rightDoorWidthUnits / 2, -doorHeight / 2, 0];
                    const end1 = [rightDoorWidthUnits / 2, 0, 0];
                    const segments1 = [];
                    
                    // 선분의 총 길이 계산
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                    
                    // 패턴 정의: [긴 대시, 공백, 짧은 대시, 공백]의 반복
                    const longDash = 2.4;   // 긴 대시 (6배)
                    const shortDash = 0.9;  // 짧은 대시 (6배)
                    const gap = 0.9;        // 공백 (6배)
                    const patternLength = longDash + gap + shortDash + gap;
                    
                    let currentPos = 0;
                    let isLongDash = true;
                    
                    // 첫 번째 대시는 무조건 그리기 (모서리에서 시작)
                    while (currentPos < totalLength1) {
                      if (isLongDash) {
                        // 긴 대시
                        let dashLength = longDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + longDash + gap >= totalLength1) {
                          dashLength = totalLength1 - currentPos;
                        }
                        const t1 = currentPos / totalLength1;
                        const t2 = (currentPos + dashLength) / totalLength1;
                        segments1.push(
                          <NativeLine
                            key={`seg1-long-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength1) break;
                        currentPos += dashLength + gap;
                      } else {
                        // 짧은 대시
                        let dashLength = shortDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + shortDash + gap >= totalLength1) {
                          dashLength = totalLength1 - currentPos;
                        }
                        const t1 = currentPos / totalLength1;
                        const t2 = (currentPos + dashLength) / totalLength1;
                        segments1.push(
                          <NativeLine
                            key={`seg1-short-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength1) break;
                        currentPos += dashLength + gap;
                      }
                      isLongDash = !isLongDash;
                    }
                    
                    // 두 번째 대각선 (아래에서 위로)
                    const start2 = [rightDoorWidthUnits / 2, 0, 0];
                    const end2 = [-rightDoorWidthUnits / 2, doorHeight / 2, 0];
                    const segments2 = [];
                    
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    
                    currentPos = 0;
                    isLongDash = true;
                    
                    // 첫 번째 대시는 무조건 그리기 (모서리에서 시작)
                    while (currentPos < totalLength2) {
                      if (isLongDash) {
                        // 긴 대시
                        let dashLength = longDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + longDash + gap >= totalLength2) {
                          dashLength = totalLength2 - currentPos;
                        }
                        const t1 = currentPos / totalLength2;
                        const t2 = (currentPos + dashLength) / totalLength2;
                        segments2.push(
                          <NativeLine
                            key={`seg2-long-${currentPos}`}
                            points={[
                              [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                              [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength2) break;
                        currentPos += dashLength + gap;
                      } else {
                        // 짧은 대시
                        let dashLength = shortDash;
                        // 마지막 대시인 경우 끝까지 연장
                        if (currentPos + shortDash + gap >= totalLength2) {
                          dashLength = totalLength2 - currentPos;
                        }
                        const t1 = currentPos / totalLength2;
                        const t2 = (currentPos + dashLength) / totalLength2;
                        segments2.push(
                          <NativeLine
                            key={`seg2-short-${currentPos}`}
                            points={[
                              [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                              [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                            ]}
                            color="#00FF00"
                            lineWidth={0.5}
                            transparent={true}
                            opacity={0.6}
                            renderOrder={1002}
                            depthTest={false}
                          />
                        );
                        if (currentPos + dashLength >= totalLength2) break;
                        currentPos += dashLength + gap;
                      }
                      isLongDash = !isLongDash;
                    }
                    
                    return [...segments1, ...segments2];
                  })()}
                </group>
              )}
            </group>
          </animated.group>
        </group>
      </group>
    );
  } else {
    // 싱글 가구: 하나의 문 - 힌지 위치에 따라 회전축을 문의 가장자리에서 10mm 안쪽으로 이동
    // 노서라운드 모드에서는 엔드패널을 고려
    let doorWidth = actualDoorWidth - 3; // 기본: 슬롯사이즈 - 3mm
    
    // 노서라운드 모드에서 첫번째/마지막 슬롯 처리
    if (spaceInfo.surroundType === 'no-surround' && slotIndex !== undefined) {
      // 실제 슬롯 너비로 엔드패널 여부 판단
      const hasEndPanel = actualDoorWidth < indexing.columnWidth;
      
      // 노서라운드 모드에서 엔드패널 위치 판단
      let isLeftEndPanel = false;
      let isRightEndPanel = false;
      
      if (spaceInfo.installType === 'freestanding') {
        // 벽없음: 양쪽 끝에 엔드패널
        isLeftEndPanel = slotIndex === 0 && hasEndPanel;
        isRightEndPanel = slotIndex === indexing.columnCount - 1 && hasEndPanel;
      } else if (spaceInfo.installType === 'semistanding') {
        // 한쪽벽: 벽 반대쪽에만 엔드패널
        if (spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right) {
          // 왼쪽벽: 오른쪽 끝에만 엔드패널
          isRightEndPanel = slotIndex === indexing.columnCount - 1 && hasEndPanel;
        } else if (spaceInfo.wallConfig?.right && !spaceInfo.wallConfig?.left) {
          // 오른쪽벽: 왼쪽 끝에만 엔드패널
          isLeftEndPanel = slotIndex === 0 && hasEndPanel;
        }
      }
      // 양쪽벽(standing) 모드는 엔드패널 없음
      
      console.log('🔍 싱글 도어 엔드패널 판단:', {
        slotIndex,
        columnCount: indexing.columnCount,
        hasEndPanel,
        isLeftEndPanel,
        isRightEndPanel,
        installType: spaceInfo.installType,
        wallConfig: spaceInfo.wallConfig,
        actualDoorWidth,
        columnWidth: indexing.columnWidth
      });
      
      // 엔드패널이 있는 경우 도어 크기 복원 및 위치 조정
      if (isLeftEndPanel || isRightEndPanel) {
        // 노서라운드 커버도어: 엔드패널을 덮는 원래 슬롯 크기로 복원
        doorWidth = actualDoorWidth + endPanelThickness - 3; // 582 + 18 - 3 = 597mm
        
        // 도어 위치 보정
        if (isLeftEndPanel) {
          doorAdjustment = -endPanelThickness / 2; // 왼쪽으로 9mm
          console.log('왼쪽 엔드패널: 도어 크기 복원 및 위치 조정', { doorWidth, doorAdjustment });
        } else if (isRightEndPanel) {
          doorAdjustment = endPanelThickness / 2; // 오른쪽으로 9mm
          console.log('오른쪽 엔드패널: 도어 크기 복원 및 위치 조정', { doorWidth, doorAdjustment });
        }
      } else {
        // 중간 슬롯 또는 엔드패널 없는 경우
        doorWidth = actualDoorWidth - 3; // 일반 슬롯 크기 - 3mm
        console.log('중간 슬롯 또는 엔드패널 없음');
      }
    } else if (spaceInfo.surroundType === 'no-surround') {
      // slotIndex가 undefined인 경우
      doorWidth = actualDoorWidth - 3;
      console.log('슬롯 인덱스 없음');
    }
    
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    // 노서라운드 모드에서 도어 위치 보정
    // slotCenterX가 이미 보정된 값이 아닌 경우에만 적용
    if (spaceInfo.surroundType === 'no-surround' && doorAdjustment !== 0) {
      // slotCenterX가 0이 아닌 값이면 이미 FurnitureItem에서 보정됨
      const needsAdjustment = slotCenterX === 0 || slotCenterX === undefined;
      if (needsAdjustment) {
        doorGroupX += mmToThreeUnits(doorAdjustment);
        console.log('🚪 싱글 도어 위치 보정 적용:', {
          slotIndex,
          slotCenterX,
          doorAdjustment,
          doorGroupX,
          note: 'DoorModule에서 보정'
        });
      } else {
        console.log('🚪 싱글 도어 위치 보정 건너뜀:', {
          slotIndex,
          slotCenterX,
          doorAdjustment,
          note: 'FurnitureItem에서 이미 보정됨'
        });
      }
    }
    
    console.log('🚪 싱글 도어 크기:', {
      actualDoorWidth,
      doorWidth,
      originalSlotWidth,
      slotIndex,
      columnCount,
      isFirstSlot: slotIndex === 0,
      isLastSlot: slotIndex === columnCount - 1,
      doorAdjustment,
      doorGroupX,
      surroundType: spaceInfo.surroundType,
      fallbackColumnWidth: indexing.columnWidth,
      moduleDataId: moduleData?.id
    });
    
    // 조정된 힌지 위치 사용
    const hingeAxisOffset = adjustedHingePosition === 'left' 
      ? -doorWidthUnits / 2 + hingeOffsetUnits  // 왼쪽 힌지: 왼쪽 가장자리에서 9mm 안쪽
      : doorWidthUnits / 2 - hingeOffsetUnits;  // 오른쪽 힌지: 오른쪽 가장자리에서 9mm 안쪽
    
    // 도어 위치: 회전축이 힌지 위치에 맞게 조정
    const doorPositionX = -hingeAxisOffset; // 회전축 보정을 위한 도어 위치 조정

    return (
      <group position={[doorGroupX + hingeAxisOffset, doorYPosition, doorDepth / 2]}>
        <animated.group rotation-y={adjustedHingePosition === 'left' ? leftHingeDoorSpring.rotation : rightHingeDoorSpring.rotation}>
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
            {/* 윤곽선 - 제거 (BoxWithEdges에서 이미 처리됨) */}
            
            {/* 도어 열리는 방향 표시 (2D 정면뷰에서만) */}
            {viewMode === '2D' && view2DDirection === 'front' && (
              <group position={[0, 0, doorThicknessUnits / 2 + 0.001]}>
                {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                {(() => {
                  // 첫 번째 대각선 (위에서 아래로) - 조정된 힌지 위치 사용
                  const start1 = [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, -doorHeight / 2, 0];
                  const end1 = [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0];
                  const segments1 = [];
                  
                  // 선분의 총 길이 계산
                  const dx1 = end1[0] - start1[0];
                  const dy1 = end1[1] - start1[1];
                  const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                  
                  // 패턴 정의: [긴 대시, 공백, 짧은 대시, 공백]의 반복
                  const longDash = 2.4;   // 긴 대시 (6배)
                  const shortDash = 0.9;  // 짧은 대시 (6배)
                  const gap = 0.9;        // 공백 (6배)
                  const patternLength = longDash + gap + shortDash + gap;
                  
                  let currentPos = 0;
                  let isLongDash = true;
                  
                  // 첫 번째 대시는 무조건 그리기 (모서리에서 시작)
                  while (currentPos < totalLength1) {
                    if (isLongDash) {
                      // 긴 대시
                      let dashLength = longDash;
                      // 마지막 대시인 경우 끝까지 연장
                      if (currentPos + longDash + gap >= totalLength1) {
                        dashLength = totalLength1 - currentPos;
                      }
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + dashLength) / totalLength1;
                      segments1.push(
                        <NativeLine
                          key={`seg1-long-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#00FF00"
                          lineWidth={0.5}
                          transparent={true}
                          opacity={0.6}
                          renderOrder={1002}
                          depthTest={false}
                        />
                      );
                      if (currentPos + dashLength >= totalLength1) break;
                      currentPos += dashLength + gap;
                    } else {
                      // 짧은 대시
                      let dashLength = shortDash;
                      // 마지막 대시인 경우 끝까지 연장
                      if (currentPos + shortDash + gap >= totalLength1) {
                        dashLength = totalLength1 - currentPos;
                      }
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + dashLength) / totalLength1;
                      segments1.push(
                        <NativeLine
                          key={`seg1-short-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#00FF00"
                          lineWidth={0.5}
                          transparent={true}
                          opacity={0.6}
                          renderOrder={1002}
                          depthTest={false}
                        />
                      );
                      if (currentPos + dashLength >= totalLength1) break;
                      currentPos += dashLength + gap;
                    }
                    isLongDash = !isLongDash;
                  }
                  
                  // 두 번째 대각선 (아래에서 위로) - 조정된 힌지 위치 사용
                  const start2 = [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0];
                  const end2 = [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, doorHeight / 2, 0];
                  const segments2 = [];
                  
                  const dx2 = end2[0] - start2[0];
                  const dy2 = end2[1] - start2[1];
                  const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                  
                  currentPos = 0;
                  isLongDash = true;
                  
                  // 첫 번째 대시는 무조건 그리기 (모서리에서 시작)
                  while (currentPos < totalLength2) {
                    if (isLongDash) {
                      // 긴 대시
                      let dashLength = longDash;
                      // 마지막 대시인 경우 끝까지 연장
                      if (currentPos + longDash + gap >= totalLength2) {
                        dashLength = totalLength2 - currentPos;
                      }
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + dashLength) / totalLength2;
                      segments2.push(
                        <NativeLine
                          key={`seg2-long-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color="#00FF00"
                          lineWidth={0.5}
                          transparent={true}
                          opacity={0.6}
                          renderOrder={1002}
                          depthTest={false}
                        />
                      );
                      if (currentPos + dashLength >= totalLength2) break;
                      currentPos += dashLength + gap;
                    } else {
                      // 짧은 대시
                      let dashLength = shortDash;
                      // 마지막 대시인 경우 끝까지 연장
                      if (currentPos + shortDash + gap >= totalLength2) {
                        dashLength = totalLength2 - currentPos;
                      }
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + dashLength) / totalLength2;
                      segments2.push(
                        <NativeLine
                          key={`seg2-short-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color="#00FF00"
                          lineWidth={0.5}
                          transparent={true}
                          opacity={0.6}
                          renderOrder={1002}
                          depthTest={false}
                        />
                      );
                      if (currentPos + dashLength >= totalLength2) break;
                      currentPos += dashLength + gap;
                    }
                    isLongDash = !isLongDash;
                  }
                  
                  return [...segments1, ...segments2];
                })()}
              </group>
            )}
          </group>
        </animated.group>
      </group>
    );
  }
};

export default DoorModule; 