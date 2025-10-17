import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '../../../utils/indexing';
import { ColumnIndexer } from '@/editor/shared/utils/indexing/ColumnIndexer';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useThree, useFrame } from '@react-three/fiber';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { Line } from '@react-three/drei';
import { Hinge } from '../Hinge';
import DimensionText from './components/DimensionText';
import { useDimensionColor } from './hooks/useDimensionColor';

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
  const { view2DTheme, shadowEnabled } = useUIStore();
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
          receiveShadow={viewMode === '3D' && !isEditMode && shadowEnabled} 
          castShadow={viewMode === '3D' && !isEditMode && shadowEnabled}
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
          <lineSegments geometry={edgesGeometry} renderOrder={1001}>
            <lineBasicMaterial
              color={viewMode === '2D' ? "#18CF23" : (renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : (view2DTheme === 'dark' ? "#999999" : "#444444"))}
              linewidth={viewMode === '2D' ? 3 : 0.5}
              depthTest={false}
              depthWrite={false}
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
  slotWidths?: number[]; // 듀얼 가구의 경우 개별 슬롯 너비 배열 [left, right]
  slotIndex?: number; // 슬롯 인덱스 (노서라운드 모드에서 엔드패널 확장 판단용)
  floatHeight?: number; // 플로팅 높이 (mm) - 띄워서 배치 시 도어 높이 조정용
  doorTopGap?: number; // 가구 상단에서 위로의 갭 (mm, 기본값: 5)
  doorBottomGap?: number; // 가구 하단에서 아래로의 갭 (mm, 기본값: 45)
  sectionHeightsMm?: number[]; // 섹션별 실제 측판 높이 (mm)
  sectionIndex?: number; // 섹션 인덱스 (분할 모드용, 0: 하부, 1: 상부)
  totalSections?: number; // 전체 섹션 수 (분할 모드용, 기본값: 1)
  furnitureId?: string; // 가구 ID (개별 도어 제어용)
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
  slotIndex,
  floatHeight = 0, // 플로팅 높이 기본값 0
  doorTopGap = 5, // 가구 상단에서 위로 갭 기본값 5mm
  doorBottomGap = 45, // 가구 하단에서 아래로 갭 기본값 45mm
  sectionHeightsMm,
  sectionIndex, // 섹션 인덱스 (분할 모드용)
  totalSections = 1, // 전체 섹션 수 (분할 모드용)
  furnitureId // 가구 ID
}) => {
  console.log('🚪🔧 DoorModule Props:', {
    doorTopGap,
    doorBottomGap,
    moduleId: moduleData?.id
  });
  // Store에서 재질 설정과 도어 상태 가져오기
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const { doorsOpen, view2DDirection, isIndividualDoorOpen, toggleIndividualDoor } = useUIStore();
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { dimensionColor } = useDimensionColor(); // 치수 색상

  // furnitureId가 있으면 개별 도어 상태 사용 (분할 여부와 무관), 아니면 전역 상태 사용
  const useIndividualState = furnitureId !== undefined;
  const effectiveSectionIndex = sectionIndex !== undefined ? sectionIndex : 0; // 병합 모드는 섹션 0
  const isDoorOpen = useIndividualState
    ? isIndividualDoorOpen(furnitureId, effectiveSectionIndex)
    : doorsOpen;

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
        } else if (viewMode === '2D') {
          // 2D 모드에서는 형광 녹색 사용
          mat.color.set('#18CF23');
          mat.map = null; // 2D 모드에서는 텍스처 제거
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

  // 단내림 구간인 경우 영역별 슬롯 정보 계산
  let effectiveColumnWidth = indexing.columnWidth;
  if (spaceInfo.droppedCeiling?.enabled && (spaceInfo as any).zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const zone = (spaceInfo as any).zone;

    if (zone === 'dropped' && zoneInfo.dropped) {
      effectiveColumnWidth = zoneInfo.dropped.columnWidth;
      console.log('🚪📏 단내림 구간 슬롯 너비 사용:', {
        zone,
        droppedColumnWidth: zoneInfo.dropped.columnWidth,
        normalColumnWidth: indexing.columnWidth
      });
    } else if (zone === 'normal' && zoneInfo.normal) {
      effectiveColumnWidth = zoneInfo.normal.columnWidth;
      console.log('🚪📏 메인 구간 슬롯 너비 사용:', {
        zone,
        normalColumnWidth: zoneInfo.normal.columnWidth
      });
    }
  }

  // 듀얼 가구인지 먼저 확인 - moduleData가 있으면 그것으로 판단, 없으면 너비로 추정
  const isDualFurniture = moduleData?.isDynamic && moduleData?.id?.includes('dual') ? true :
    Math.abs(moduleWidth - (effectiveColumnWidth * 2)) < 50;

  // 도어 크기 계산 - originalSlotWidth가 있으면 무조건 사용 (커버도어)
  // 듀얼 가구인 경우 effectiveColumnWidth * 2 사용
  let actualDoorWidth = originalSlotWidth || moduleWidth || (isDualFurniture ? effectiveColumnWidth * 2 : effectiveColumnWidth);

  console.log('🚪📏 도어 너비 계산:', {
    originalSlotWidth,
    moduleWidth,
    indexingColumnWidth: indexing.columnWidth,
    effectiveColumnWidth,
    isDualFurniture,
    계산된도어너비: isDualFurniture ? effectiveColumnWidth * 2 : effectiveColumnWidth,
    actualDoorWidth,
    zone: (spaceInfo as any).zone,
    설명: originalSlotWidth ? '커버도어 (원래 슬롯 너비)' : (isDualFurniture ? '듀얼 도어 (슬롯너비 x 2)' : '싱글 도어')
  });

  // 노서라운드 모드에서 도어 크기 처리
  if (spaceInfo.surroundType === 'no-surround') {
    // 노서라운드에서는 항상 원래 슬롯 크기를 사용해야 함
    // originalSlotWidth가 없으면 fallback으로 계산
    if (!originalSlotWidth) {
      // 노서라운드에서는 슬롯 너비를 그대로 사용 (엔드패널이 슬롯에 포함됨)
      // 듀얼 가구면 슬롯 너비 * 2
      actualDoorWidth = isDualFurniture ? effectiveColumnWidth * 2 : effectiveColumnWidth;
      console.log(`🚪 노서라운드 도어 너비 계산:`, {
        전체너비: spaceInfo.width,
        effectiveColumnWidth,
        isDualFurniture,
        actualDoorWidth,
        설명: isDualFurniture ? '노서라운드 듀얼 도어 (슬롯너비 x 2)' : '노서라운드 싱글 도어'
      });
    }
  }
  
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
    droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled
  });
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 도어 두께 (요구사항: 18mm)
  const doorThickness = 18;
  const doorThicknessUnits = mmToThreeUnits(doorThickness);
  
  // === 도어 확장 설정 (변수화) ===
  const UPPER_CABINET_TOP_GAP = 5; // 상부장 도어 천장 간격 (mm)
  const UPPER_CABINET_BOTTOM_EXTENSION = 28; // 상부장 도어 아래 확장 (mm)
  
  // === 문 높이 계산 ===
  // 상부장/하부장인지 확인
  const isUpperCabinet = moduleData?.id?.includes('upper-cabinet') || moduleData?.id?.includes('dual-upper-cabinet');
  const isLowerCabinet = moduleData?.id?.includes('lower-cabinet') || moduleData?.id?.includes('dual-lower-cabinet');

  let actualDoorHeight: number;
  let tallCabinetFurnitureHeight = 0; // 키큰장 가구 높이 (Y 위치 계산에서 사용)
  let resolvedSectionHeightsMm: number[] | undefined;
  
  if (isUpperCabinet) {
    // 상부장 도어는 캐비넷보다 아래로 확장, 위쪽 간격
    const upperCabinetHeight = moduleData?.dimensions?.height || 600;
    
    // 상부장 도어 높이 = 캐비넷 높이 - 위쪽 간격 + 아래 확장
    actualDoorHeight = upperCabinetHeight - UPPER_CABINET_TOP_GAP + UPPER_CABINET_BOTTOM_EXTENSION;
    
    console.log('🚪🔴 상부장 도어 높이 계산:', {
      moduleId: moduleData?.id,
      캐비넷높이: upperCabinetHeight,
      천장간격: UPPER_CABINET_TOP_GAP,
      아래확장: UPPER_CABINET_BOTTOM_EXTENSION,
      도어높이: actualDoorHeight,
      설명: `위쪽 ${UPPER_CABINET_TOP_GAP}mm 간격, 아래로 ${UPPER_CABINET_BOTTOM_EXTENSION}mm 확장`
    });
  } else if (isLowerCabinet) {
    // 하부장 도어는 하부장 상단과 일치, 아래로 확장
    const lowerCabinetHeight = moduleData?.dimensions?.height || 1000;
    const LOWER_CABINET_BOTTOM_EXTENSION = 40; // 하부장 도어 아래쪽 확장 (mm)
    const LOWER_CABINET_TOP_EXTENSION = 18; // 하부장 상부 마감재 두께 (도어 상단이 하부장 상단과 일치)
    
    // 하부장 도어 높이 = 캐비넷 높이 + 아래 확장 + 위 확장(상부 마감재)
    actualDoorHeight = lowerCabinetHeight + LOWER_CABINET_BOTTOM_EXTENSION + LOWER_CABINET_TOP_EXTENSION;
    
    console.log('🚪📏 하부장 도어 높이:', {
      moduleId: moduleData?.id,
      캐비넷높이: lowerCabinetHeight,
      아래확장: LOWER_CABINET_BOTTOM_EXTENSION,
      위확장: LOWER_CABINET_TOP_EXTENSION,
      actualDoorHeight,
      type: '하부장',
      설명: '하부장 상단과 일치, 아래로 60mm 확장'
    });
  } else {
    // 키큰장의 경우: 가구 높이 기준으로 상단에서 위로, 하단에서 아래로 갭 적용
    let fullSpaceHeight = spaceInfo.height;

    // 단내림 구간인 경우 높이 조정
    if ((spaceInfo as any).zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
      const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
      fullSpaceHeight = spaceInfo.height - dropHeight;
      console.log('🚪📏 단내림 도어 높이 조정:', {
        originalHeight: spaceInfo.height,
        dropHeight,
        adjustedHeight: fullSpaceHeight,
        zone: (spaceInfo as any).zone
      });
    }

    const floorHeightValue = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 0) : 0;
    const topFrameHeightValue = spaceInfo.frameSize?.top || 10;
    const baseHeightValue = spaceInfo.baseConfig?.height || 65;

    // 가구 높이 계산 (천장 높이 - 상부프레임 - 바닥재 - 받침대)
    tallCabinetFurnitureHeight = fullSpaceHeight - topFrameHeightValue - floorHeightValue - baseHeightValue;

    const resolveSectionHeightsForDoor = () => {
      if (sectionHeightsMm?.length === totalSections) {
        return sectionHeightsMm;
      }

      const rawSections = Array.isArray(moduleData?.modelConfig?.sections)
        ? moduleData?.modelConfig?.sections
        : undefined;

      if (!rawSections || rawSections.length === 0) {
        return undefined;
      }

      const basicThicknessMm = moduleData?.modelConfig?.basicThickness ?? 18;
      const availableHeightMm = Math.max(tallCabinetFurnitureHeight - basicThicknessMm * 2, 0);

      const totalAbsoluteHeightMm = rawSections.reduce((sum, section) => {
        const heightType = (section?.heightType as string) ?? 'percentage';
        if (heightType === 'absolute') {
          const value = typeof section?.height === 'number' ? section.height : Number(section?.height) || 0;
          return sum + value;
        }
        return sum;
      }, 0);

      const remainingHeightMm = Math.max(availableHeightMm - totalAbsoluteHeightMm, 0);

      return rawSections.map(section => {
        const heightType = (section?.heightType as string) ?? 'percentage';
        if (heightType === 'absolute') {
          return typeof section?.height === 'number' ? section.height : Number(section?.height) || 0;
        }
        if (heightType === 'fill') {
          return remainingHeightMm;
        }
        const ratio = typeof section?.height === 'number' ? section.height : Number(section?.height) || 0;
        return remainingHeightMm * (ratio / 100);
      });
    };

    // 분할 모드인 경우 섹션 높이 계산
    if (totalSections > 1 && sectionIndex !== undefined) {
      resolvedSectionHeightsMm = resolveSectionHeightsForDoor();

      if (!resolvedSectionHeightsMm || resolvedSectionHeightsMm.length < totalSections) {
        const fallbackLower = 1000;
        const fallbackUpper = Math.max(tallCabinetFurnitureHeight - fallbackLower, 0);
        resolvedSectionHeightsMm = [fallbackLower, fallbackUpper];
      }

      const targetSectionHeightMm = resolvedSectionHeightsMm[sectionIndex] ?? 0;

      // 도어 분할 시 섹션 사이 3mm 갭: 각 도어 높이를 1.5mm씩 줄임
      const SECTION_GAP_HALF = 1.5; // mm
      actualDoorHeight = targetSectionHeightMm + doorTopGap + doorBottomGap - SECTION_GAP_HALF;

      console.log('🚪📏 분할 모드 도어 높이:', {
        sectionIndex,
        totalSections,
        tallCabinetFurnitureHeight,
        sectionHeightsMm: resolvedSectionHeightsMm,
        targetSectionHeightMm,
        doorTopGap,
        doorBottomGap,
        sectionGapReduction: SECTION_GAP_HALF,
        actualDoorHeight,
        설명: `섹션 높이(${targetSectionHeightMm}) + 상단갭(${doorTopGap}) + 하단갭(${doorBottomGap}) - 갭감소(${SECTION_GAP_HALF}) = ${actualDoorHeight}mm`
      });
    } else {
      // 병합 모드: 전체 가구 높이
      // doorTopGap: 가구 상단에서 위로 확장 (mm)
      // doorBottomGap: 가구 하단에서 아래로 확장 (mm)
      // 도어 높이 = 가구 높이 + 상단 확장 + 하단 확장
      actualDoorHeight = tallCabinetFurnitureHeight + doorTopGap + doorBottomGap;

      // 플로팅 배치 시 키큰장 도어 높이 조정
      if (floatHeight > 0) {
        actualDoorHeight = actualDoorHeight - floatHeight;
      }

      console.log('🚪📏 병합 모드 도어 높이:', {
        fullSpaceHeight,
        topFrameHeight: topFrameHeightValue,
        floorHeight: floorHeightValue,
        baseHeight: baseHeightValue,
        furnitureHeight: tallCabinetFurnitureHeight,
        doorTopGap,
        doorBottomGap,
        actualDoorHeight
      });
    }
  }
  
  // 도어 높이에 추가 조정 없음 (사용자 입력 갭이 완전히 제어)
  const doorHeight = mmToThreeUnits(actualDoorHeight);
  
  // === 문 Y 위치 계산 ===
  let doorYPosition: number;
  
  // 키큰장이고 플로팅 배치인 경우 특별 처리
  if (!isUpperCabinet && !isLowerCabinet && floatHeight > 0) {
    // 플로팅 배치 시: 도어 상단은 고정, 하단만 올라감
    // 도어가 줄어든 만큼(floatHeight)의 절반만큼 Y 위치를 아래로 이동
    // 이렇게 하면 도어 상단은 원래 위치 유지, 하단만 올라감
    doorYPosition = mmToThreeUnits(-floatHeight / 2);
    console.log('🚪📍 플로팅 배치 키큰장 도어 Y 위치 조정:', {
      floatHeight,
      doorYPosition_units: doorYPosition,
      doorYPosition_mm: doorYPosition / 0.01,
      설명: '도어 상단 고정, 하단만 올라가도록 Y 위치 조정'
    });
  } else if (isUpperCabinet) {
    // 상부장 도어는 캐비넷보다 아래로 확장
    const upperCabinetHeight = moduleData?.dimensions?.height || 600;
    
    // 캐비넷 하단 = -캐비넷높이/2
    // 도어 하단 = 캐비넷 하단 - 확장값 (더 아래로)
    // 도어 높이 = 캐비넷높이 - 위쪽 간격 + 아래 확장
    // 도어 중심 = 도어 하단 + 도어높이/2
    const doorHeightMm = upperCabinetHeight - UPPER_CABINET_TOP_GAP + UPPER_CABINET_BOTTOM_EXTENSION;
    const cabinetBottom = -upperCabinetHeight / 2;
    const doorBottom = cabinetBottom - UPPER_CABINET_BOTTOM_EXTENSION;
    const doorCenter = doorBottom + doorHeightMm / 2;
    
    doorYPosition = mmToThreeUnits(doorCenter);
    
    console.log('🚪🔴 상부장 도어 Y 위치:', {
      moduleId: moduleData?.id,
      캐비넷높이: upperCabinetHeight,
      캐비넷하단: cabinetBottom,
      도어하단: doorBottom,
      도어높이: doorHeightMm,
      도어중심: doorCenter,
      doorYPosition,
      설명: `도어가 캐비넷보다 ${UPPER_CABINET_BOTTOM_EXTENSION}mm 아래로 확장`
    });
  } else if (isLowerCabinet) {
    // 하부장 도어는 하부장 상단과 일치하고 아래로 확장
    const LOWER_CABINET_BOTTOM_EXTENSION = 40; // 아래쪽 확장
    const LOWER_CABINET_TOP_EXTENSION = 18; // 상부 마감재 두께 (도어 상단 = 하부장 상단)
    const DOOR_POSITION_ADJUSTMENT = 10; // 위치 조정값 (10mm 더 아래로)
    const lowerCabinetHeight = moduleData?.dimensions?.height || 1000;
    
    // 하부장 캐비넷은 Y=0에 위치 (cabinetYPosition = 0)
    // 하부장 캐비넷 중심 Y = 0
    // 하부장 캐비넷 상단 = 캐비넷높이/2 + 상부 마감재(18mm)
    // 하부장 캐비넷 하단 = -캐비넷높이/2
    
    // 도어는 캐비넷 상단(마감재 포함)에서 아래로 확장
    // 도어 상단 = 캐비넷 상단 + 상부 마감재
    // 도어 하단 = 캐비넷 하단 - 아래 확장값
    // 도어 높이 = 캐비넷 높이 + 상부 마감재 + 아래 확장값
    const doorHeight = lowerCabinetHeight + LOWER_CABINET_TOP_EXTENSION + LOWER_CABINET_BOTTOM_EXTENSION;
    const cabinetTop = mmToThreeUnits(lowerCabinetHeight) / 2 + mmToThreeUnits(LOWER_CABINET_TOP_EXTENSION);
    const cabinetBottom = -mmToThreeUnits(lowerCabinetHeight) / 2;
    const doorBottom = cabinetBottom - mmToThreeUnits(LOWER_CABINET_BOTTOM_EXTENSION);
    
    // 도어 중심 = 도어 하단 + 도어 높이/2 - 추가 조정값
    doorYPosition = doorBottom + mmToThreeUnits(doorHeight) / 2 - mmToThreeUnits(DOOR_POSITION_ADJUSTMENT);
    
    console.log('🚪📍 하부장 도어 Y 위치 (상단 일치, 아래 확장):', {
      moduleId: moduleData?.id,
      캐비넷높이: lowerCabinetHeight,
      캐비넷상단: cabinetTop,
      캐비넷하단: cabinetBottom,
      도어하단: doorBottom,
      도어높이: doorHeight,
      doorYPosition,
      위확장: LOWER_CABINET_TOP_EXTENSION,
      아래확장: LOWER_CABINET_BOTTOM_EXTENSION,
      위치조정: DOOR_POSITION_ADJUSTMENT,
      type: '하부장',
      설명: '하부장 상단과 일치, 아래로 40mm 확장, 10mm 아래로 조정'
    });
  } else {
    // 키큰장 도어 Y 위치 계산
    // Y=0은 Three.js 바닥 기준
    //
    // 계산 로직:
    // 1. 가구 하단 = 받침대 + 바닥재
    // 2. 가구 중심 = 가구 하단 + 가구 높이/2
    // 3. 도어 중심 = 가구 중심 (동일) - 도어는 가구 중심 기준으로 위아래 확장
    //
    // Three.js에서 가구는 Y=0 중심으로 렌더링됨
    // 도어도 가구 중심(Y=0) 기준 상대 좌표로 배치해야 함

    // 분할 모드인 경우 섹션별 Y 위치 계산
    if (totalSections > 1 && sectionIndex !== undefined) {
      resolvedSectionHeightsMm = resolvedSectionHeightsMm || resolveSectionHeightsForDoor();

      if (!resolvedSectionHeightsMm || resolvedSectionHeightsMm.length < totalSections) {
        const fallbackLower = 1000;
        const fallbackUpper = Math.max(tallCabinetFurnitureHeight - fallbackLower, 0);
        resolvedSectionHeightsMm = [fallbackLower, fallbackUpper];
      }

      const lowerSectionHeightMm = resolvedSectionHeightsMm[0] ?? 0;
      const upperSectionHeightMm = resolvedSectionHeightsMm[1] ?? Math.max(tallCabinetFurnitureHeight - lowerSectionHeightMm, 0);

      // 도어 분할 시 섹션 사이 3mm 갭: 각 도어 높이를 1.5mm씩 줄임
      const SECTION_GAP_HALF = 1.5; // mm

      if (sectionIndex === 0) {
        // 하부 섹션 도어: 가구 하단에서부터 계산
        // 도어 높이가 1.5mm 줄어들었으므로 상단을 위로 1.5mm 이동
        const furnitureBottom = -tallCabinetFurnitureHeight / 2;

        // 원래 도어 높이로 중심 계산 후 상단을 위로 이동
        const originalDoorHeight = lowerSectionHeightMm + doorTopGap + doorBottomGap;
        const reducedDoorHeight = originalDoorHeight - SECTION_GAP_HALF;

        // 도어 하단 위치 (변경 없음)
        const doorBottom = furnitureBottom - doorBottomGap;
        // 도어 상단 위치 (1.5mm 아래로 = 도어가 짧아짐)
        const doorTop = doorBottom + reducedDoorHeight;
        // 도어 중심
        const doorCenter = (doorBottom + doorTop) / 2;

        doorYPosition = mmToThreeUnits(doorCenter);

        console.log('🚪📍 하부 섹션 도어 Y 위치 (상단 1.5mm 줄임):', {
          tallCabinetFurnitureHeight,
          lowerSectionHeightMm,
          furnitureBottom,
          doorBottom,
          doorTop,
          doorCenter,
          originalDoorHeight,
          reducedDoorHeight,
          doorTopGap,
          doorBottomGap,
          doorYPosition,
          doorYPosition_mm: doorYPosition / 0.01,
          설명: `하단 고정(${doorBottom}mm), 상단을 ${SECTION_GAP_HALF}mm 아래로 이동하여 도어 높이 감소`
        });
      } else {
        // 상부 섹션 도어: 가구 상단에서부터 계산
        // 도어 높이가 1.5mm 줄어들었으므로 하단을 아래로 1.5mm 이동
        const furnitureTop = tallCabinetFurnitureHeight / 2;

        // 원래 도어 높이로 중심 계산 후 하단을 아래로 이동
        const originalDoorHeight = upperSectionHeightMm + doorTopGap + doorBottomGap;
        const reducedDoorHeight = originalDoorHeight - SECTION_GAP_HALF;

        // 도어 상단 위치 (변경 없음)
        const doorTop = furnitureTop + doorTopGap;
        // 도어 하단 위치 (1.5mm 위로 = 도어가 짧아짐)
        const doorBottom = doorTop - reducedDoorHeight;
        // 도어 중심
        const doorCenter = (doorBottom + doorTop) / 2;

        doorYPosition = mmToThreeUnits(doorCenter);

        console.log('🚪📍 상부 섹션 도어 Y 위치 (하단 1.5mm 줄임):', {
          tallCabinetFurnitureHeight,
          upperSectionHeightMm,
          furnitureTop,
          doorTop,
          doorBottom,
          doorCenter,
          originalDoorHeight,
          reducedDoorHeight,
          doorTopGap,
          doorBottomGap,
          doorYPosition,
          doorYPosition_mm: doorYPosition / 0.01,
          설명: `상단 고정(${doorTop}mm), 하단을 ${SECTION_GAP_HALF}mm 위로 이동하여 도어 높이 감소`
        });
      }
    } else {
      // 병합 모드: 기존 로직
      // 도어 중심 오프셋 계산:
      // - 도어가 위로 doorTopGap, 아래로 doorBottomGap 확장
      // - 상단 확장 < 하단 확장이면 도어 중심이 가구 중심보다 아래로 이동
      // - 오프셋 = (doorTopGap - doorBottomGap)/2 (음수면 아래로)
      const centerOffset = (doorTopGap - doorBottomGap) / 2;
      doorYPosition = mmToThreeUnits(centerOffset);

      console.log('🚪📍 도어 Y 위치 (가구 중심 기준 상대 좌표):', {
        tallCabinetFurnitureHeight,
        doorTopGap,
        doorBottomGap,
        centerOffset,
        doorHeight: actualDoorHeight,
        doorYPosition,
        설명: `가구 중심(Y=0) 기준, 도어 중심 오프셋 = (${doorTopGap} - ${doorBottomGap})/2 = ${centerOffset}mm, 도어 상단은 가구보다 ${doorTopGap}mm 위, 하단은 ${doorBottomGap}mm 아래`
      });

      // 플로팅 배치 시 Y 위치 조정 - 상단 고정, 하단만 올라가도록
      // 도어 높이가 줄어든 만큼 중심을 위로 이동
      if (floatHeight > 0) {
        doorYPosition = doorYPosition + mmToThreeUnits(floatHeight / 2);
        console.log('🚪📍 플로팅 배치 도어 Y 조정:', {
          플로팅높이: floatHeight,
          Y이동: floatHeight / 2,
          설명: '도어 높이가 줄어든 만큼 중심 위로 이동 (상단 고정 효과)'
        });
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

  // 패널 두께 (18mm) - 먼저 선언
  const panelThickness = 18;

  // 도어는 가구 몸통 앞면에서 5mm 떨어지고, 도어 두께의 절반만큼 더 앞으로
  // 총 오프셋 = 28mm (도어 두께 18mm로 변경에 따른 2mm 보정)
  const baseDepthOffset = mmToThreeUnits(28);
  const doorDepth = mmToThreeUnits(moduleDepth) + baseDepthOffset;

  // 힌지 위치 오프셋(9mm) 상수 정의
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
  const shouldOpenDoors = useMemo(() => isDoorOpen || isEditMode, [isDoorOpen, isEditMode]);
  
  // 도어 애니메이션 상태 추적
  const [isAnimating, setIsAnimating] = useState(false);
  
  // 도어 상태 변경 시 애니메이션 시작
  useEffect(() => {
    if (isDoorOpen !== undefined) {
      setIsAnimating(true);
      // 애니메이션이 끝나면 (약 1.2초 후) 상태 업데이트 (기존 1.5초에서 1.2초로 감소)
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isDoorOpen]);
  
  // 애니메이션 중일 때 프레임마다 렌더링
  useFrame(() => {
    if (isAnimating && gl) {
      // 애니메이션 중일 때만 강제 렌더링
      if ('invalidate' in gl) {
        (gl as any).invalidate();
      }
    }
  });
  
  // 도어 클릭 핸들러 - 개별 또는 전역 상태 토글
  const handleDoorClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    console.log('🚪 도어 클릭 이벤트 발생:', {
      moduleId: moduleData?.id,
      furnitureId,
      sectionIndex,
      useIndividualState,
      currentDoorOpen: isDoorOpen,
      willBeOpen: !isDoorOpen
    });

    // furnitureId가 있으면 개별 도어 토글, 아니면 전역 토글
    if (useIndividualState) {
      toggleIndividualDoor(furnitureId!, effectiveSectionIndex);
      console.log('🚪 개별 도어 상태 토글:', {
        furnitureId,
        sectionIndex: effectiveSectionIndex,
        key: `${furnitureId}-${effectiveSectionIndex}`
      });
    } else {
      const { toggleDoors } = useUIStore.getState();
      toggleDoors();
      console.log('🚪 전역 도어 상태 토글');
    }

    // Three.js 렌더러에 다시 그리기 요청 (react-three-fiber의 invalidate 사용)
    if (gl) {
      // invalidate 함수가 있으면 사용, 없으면 직접 렌더
      if ('invalidate' in gl) {
        (gl as any).invalidate();
      }
    }

    // 토글 후 상태 확인
    setTimeout(() => {
      if (useIndividualState) {
        const newState = useUIStore.getState().isIndividualDoorOpen(furnitureId!, effectiveSectionIndex);
        console.log('🚪 개별 도어 상태 토글 완료, 새로운 상태:', newState);
      } else {
        const newState = useUIStore.getState().doorsOpen;
        console.log('🚪 전역 도어 상태 토글 완료, 새로운 상태:', newState);
      }
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

  // 도어 위치 계산: slotCenterX가 제공되면 사용, 아니면 기본값 0
  let doorGroupX = slotCenterX || 0; // 원래 슬롯 중심 X 좌표 (Three.js 단위)
  
  // slotCenterX가 제공되었는지 확인
  if (slotCenterX !== undefined && slotCenterX !== null) {
    // slotCenterX가 제공된 경우 그대로 사용
    console.log(`🚪 도어 위치 사용 (제공된 slotCenterX):`, {
      slotIndex,
      slotCenterX,
      doorGroupX
    });
  } else {
    // slotCenterX가 제공되지 않은 경우 기본값 0 사용
    console.log(`🚪 도어 위치 기본값 사용:`, {
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
    
    // 도어의 실제 위치 계산 (Three.js 좌표)
    const doorCenterX = slotCenterX || 0;
    const doorLeftEdge = doorCenterX - mmToThreeUnits(actualDoorWidth / 2);
    const doorRightEdge = doorCenterX + mmToThreeUnits(actualDoorWidth / 2);
    
    console.log('🚪 도어 위치 체크:', {
      doorCenterX,
      doorLeftEdge,
      doorRightEdge,
      actualDoorWidth,
      slotCenterX
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
    // 기둥이 왼쪽에 있으면 오른쪽 힌지 (도어가 왼쪽으로 열림 - 기둥 반대 방향)
    // 기둥이 오른쪽에 있으면 왼쪽 힌지 (도어가 오른쪽으로 열림 - 기둥 반대 방향)
    adjustedHingePosition = columnCheck.columnSide === 'left' ? 'right' : 'left';
    
    console.log('🚪 기둥 인접 도어 힌지 자동 조정:', {
      originalHinge: hingePosition,
      adjustedHinge: adjustedHingePosition,
      columnSide: columnCheck.columnSide,
      doorCenterX: slotCenterX,
      moduleData,
      isDoorModule,
      note: '힌지는 기둥 반대쪽에 위치'
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
    // 듀얼 가구: 두 슬롯의 전체 너비 계산
    let totalWidth: number;
    let leftDoorWidth: number;
    let rightDoorWidth: number;
    
    // 도어는 항상 3mm 갭 적용 (가구보다 3mm 작게)
    const doorGap = 3;
    
    if (slotWidths && slotWidths.length >= 2) {
      // 개별 슬롯 너비가 제공된 경우
      totalWidth = slotWidths[0] + slotWidths[1];
      leftDoorWidth = slotWidths[0] - doorGap;
      rightDoorWidth = slotWidths[1] - doorGap;
    } else {
      // fallback: effectiveColumnWidth 사용 (단내림 구간 고려)
      totalWidth = effectiveColumnWidth * 2;
      leftDoorWidth = effectiveColumnWidth - doorGap;
      rightDoorWidth = effectiveColumnWidth - doorGap;
    }
    
    const leftDoorWidthUnits = mmToThreeUnits(leftDoorWidth);
    const rightDoorWidthUnits = mmToThreeUnits(rightDoorWidth);
    
    // 도어 위치 계산 (개별 슬롯 너비 기반)
    const leftSlotWidth = slotWidths?.[0] || effectiveColumnWidth;
    const rightSlotWidth = slotWidths?.[1] || effectiveColumnWidth;
    
    const leftSlotCenter = -totalWidth / 2 + leftSlotWidth / 2;  // 왼쪽 슬롯 중심
    const rightSlotCenter = -totalWidth / 2 + leftSlotWidth + rightSlotWidth / 2;  // 오른쪽 슬롯 중심
    
    const leftXOffset = mmToThreeUnits(leftSlotCenter);
    const rightXOffset = mmToThreeUnits(rightSlotCenter);
    
    // 힌지 축 위치 (각 도어의 바깥쪽 가장자리에서 9mm 안쪽)
    const leftHingeX = leftXOffset + (-leftDoorWidthUnits / 2 + hingeOffsetUnits);  // 왼쪽 도어: 왼쪽 가장자리 + 9mm
    const rightHingeX = rightXOffset + (rightDoorWidthUnits / 2 - hingeOffsetUnits); // 오른쪽 도어: 오른쪽 가장자리 - 9mm

    console.log('🚪 듀얼 도어 위치:', {
      totalWidth,
      slotWidths,
      leftDoorWidth,
      rightDoorWidth,
      mode: slotWidths ? '개별 슬롯 너비' : '균등분할 (fallback)',
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
            <group position={[leftDoorWidthUnits / 2 - hingeOffsetUnits, 0, 0]}>
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
              
              {/* Hinges for left door - 상부장 2개, 하부장 2개, 키큰장 4개 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {isUpperCabinet ? (
                    // 상부장: 위에서 100mm, 아래에서 100mm
                    <>
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                    </>
                  ) : isLowerCabinet ? (
                    // 하부장: 위에서 100mm, 아래에서 149mm
                    <>
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(149), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                    </>
                  ) : (
                    // 키큰장: 기존 4개 경첩
                    <>
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(700), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(149), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(749), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                    </>
                  )}
                </>
              )}


              {/* Door opening direction for left door (front view and side view) - 도어가 열렸을 때만 표시 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && isDoorOpen && (
                <group position={[0, 0, doorThicknessUnits / 2 + 0.001]}>
                  {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                  {(() => {
                    // 정면뷰와 측면뷰에서 다른 좌표 사용
                    const isFrontView = view2DDirection === 'front';

                    console.log('🔶 Left door diagonal:', {
                      viewMode,
                      view2DDirection,
                      isFrontView,
                      leftDoorWidthUnits,
                      doorHeight,
                      doorThicknessUnits
                    });

                    // 첫 번째 대각선 (위에서 아래로)
                    // 측면뷰에서는 doorDepth 사용
                    const start1 = isFrontView
                      ? [leftDoorWidthUnits / 2, -doorHeight / 2, 0]
                      : [doorDepth / 2, doorHeight / 2, 0];
                    const end1 = isFrontView
                      ? [-leftDoorWidthUnits / 2, 0, 0]
                      : [-doorDepth / 2, -doorHeight / 2, 0];

                    console.log('🔶 Points:', { start1, end1 });
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
                          <Line
                            key={`seg1-long-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#FF8800"
                            lineWidth={1}
                            transparent={true}
                            opacity={1.0}
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
                          <Line
                            key={`seg1-short-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#FF8800"
                            lineWidth={1}
                            transparent={true}
                            opacity={1.0}
                          />
                        );
                        if (currentPos + dashLength >= totalLength1) break;
                        currentPos += dashLength + gap;
                      }
                      isLongDash = !isLongDash;
                    }
                    
                    // 두 번째 대각선 (아래에서 위로) - 정면뷰에서만 표시
                    const segments2 = [];
                    if (isFrontView) {
                      const start2 = [-leftDoorWidthUnits / 2, 0, 0];
                      const end2 = [leftDoorWidthUnits / 2, doorHeight / 2, 0];

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
                            <Line
                              key={`seg2-long-${currentPos}`}
                              points={[
                                [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                                [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                              ]}
                              color="#FF8800"
                              lineWidth={1}
                              transparent={true}
                              opacity={1.0}
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
                            <Line
                              key={`seg2-short-${currentPos}`}
                              points={[
                                [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                                [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                              ]}
                              color="#FF8800"
                              lineWidth={1}
                              transparent={true}
                              opacity={1.0}
                            />
                          );
                          if (currentPos + dashLength >= totalLength2) break;
                          currentPos += dashLength + gap;
                        }
                        isLongDash = !isLongDash;
                      }
                    }
                    
                    return [...segments1, ...segments2];
                  })()}
                </group>
              )}

              {/* 왼쪽 도어 가로 폭 치수 (2D 정면뷰/탑뷰, 상부장 제외) */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'top') && !isUpperCabinet && (() => {
                const isTopView = view2DDirection === 'top';
                const extensionLineStart = mmToThreeUnits(isTopView ? -230 : 70); // 탑뷰: -230mm (도어 쪽으로), 정면뷰: 70mm
                const extensionLineLength = mmToThreeUnits(110); // 연장선 길이 110mm
                const tickSize = 0.03; // 틱 마크 크기 (CAD 표준)
                const xOffset = 0; // X축 오프셋 제거

                // 정면뷰: doorHeight 사용 (음수 방향), 탑뷰: doorDepth 사용 (양수 방향)
                const dimensionLinePos = isTopView
                  ? doorDepth / 2 + extensionLineStart + extensionLineLength
                  : -doorHeight / 2 - extensionLineStart - extensionLineLength;
                const extensionStart = isTopView
                  ? doorDepth / 2 + extensionLineStart
                  : -doorHeight / 2 - extensionLineStart;

                return (
                  <>
                    {/* 왼쪽 연장선 */}
                    <Line
                      points={isTopView ? [
                        [-leftDoorWidthUnits / 2 + xOffset, 0, extensionStart],
                        [-leftDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                      ] : [
                        [-leftDoorWidthUnits / 2, extensionStart, doorThicknessUnits / 2 + 0.001],
                        [-leftDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />

                    {/* 오른쪽 연장선 */}
                    <Line
                      points={isTopView ? [
                        [leftDoorWidthUnits / 2 + xOffset, 0, extensionStart],
                        [leftDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                      ] : [
                        [leftDoorWidthUnits / 2, extensionStart, doorThicknessUnits / 2 + 0.001],
                        [leftDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />

                    {/* 치수선 (가로선) */}
                    <Line
                      points={isTopView ? [
                        [-leftDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos],
                        [leftDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                      ] : [
                        [-leftDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                        [leftDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={2}
                    />

                    {/* 왼쪽 틱 마크 (수평선) */}
                    <Line
                      points={isTopView ? [
                        [-leftDoorWidthUnits / 2 - tickSize + xOffset, 0, dimensionLinePos],
                        [-leftDoorWidthUnits / 2 + tickSize + xOffset, 0, dimensionLinePos]
                      ] : [
                        [-leftDoorWidthUnits / 2 - tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                        [-leftDoorWidthUnits / 2 + tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={2}
                    />

                    {/* 오른쪽 틱 마크 (수평선) */}
                    <Line
                      points={isTopView ? [
                        [leftDoorWidthUnits / 2 - tickSize + xOffset, 0, dimensionLinePos],
                        [leftDoorWidthUnits / 2 + tickSize + xOffset, 0, dimensionLinePos]
                      ] : [
                        [leftDoorWidthUnits / 2 - tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                        [leftDoorWidthUnits / 2 + tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={2}
                    />

                    {/* 치수 텍스트 - 치수선 아래에 배치 */}
                    <DimensionText
                      value={leftDoorWidth}
                      position={isTopView ?
                        [xOffset, 0, dimensionLinePos - mmToThreeUnits(15)] :
                        [0, dimensionLinePos + mmToThreeUnits(15), doorThicknessUnits / 2 + 0.001]
                      }
                      anchorX="center"
                      anchorY="bottom"
                      forceShow={true}
                      rotation={isTopView ? [-Math.PI / 2, 0, 0] : undefined}
                    />
                  </>
                );
              })()}
            </group>
          </animated.group>
        </group>

        {/* 오른쪽 도어 - 오른쪽 힌지 (오른쪽 가장자리에서 회전) */}
        <group position={[rightHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualRightDoorSpring.rotation}>
            <group position={[-rightDoorWidthUnits / 2 + hingeOffsetUnits, 0, 0]}>
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
              
              {/* Hinges for right door - 상부장 2개, 하부장 2개, 키큰장 4개 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {isUpperCabinet ? (
                    // 상부장: 위에서 100mm, 아래에서 100mm
                    <>
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                    </>
                  ) : isLowerCabinet ? (
                    // 하부장: 위에서 100mm, 아래에서 149mm
                    <>
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(149), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                    </>
                  ) : (
                    // 키큰장: 기존 4개 경첩
                    <>
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(100), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), doorHeight / 2 - mmToThreeUnits(700), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(149), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                      <Hinge
                        position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), -doorHeight / 2 + mmToThreeUnits(749), doorThicknessUnits / 2 + 0.001]}
                        mainDiameter={17.5}
                        smallCircleDiameter={4}
                        smallCircleXOffset={-9.5}
                        viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                        view2DDirection={view2DDirection}
                      />
                    </>
                  )}
                </>
              )}


              {/* Door opening direction for right door (front view and side view) - 도어가 열렸을 때만 표시 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && isDoorOpen && (
                <group position={[0, 0, doorThicknessUnits / 2 + 0.001]}>
                  {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                  {(() => {
                    // 정면뷰와 측면뷰에서 다른 좌표 사용
                    const isFrontView = view2DDirection === 'front';

                    // 첫 번째 대각선 (위에서 아래로)
                    // 측면뷰에서는 doorDepth 사용
                    const start1 = isFrontView
                      ? [-rightDoorWidthUnits / 2, -doorHeight / 2, 0]
                      : [-doorDepth / 2, -doorHeight / 2, 0];
                    const end1 = isFrontView
                      ? [rightDoorWidthUnits / 2, 0, 0]
                      : [doorDepth / 2, 0, 0];
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
                          <Line
                            key={`seg1-long-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#FF8800"
                            lineWidth={1}
                            transparent={true}
                            opacity={1.0}
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
                          <Line
                            key={`seg1-short-${currentPos}`}
                            points={[
                              [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                              [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                            ]}
                            color="#FF8800"
                            lineWidth={1}
                            transparent={true}
                            opacity={1.0}
                          />
                        );
                        if (currentPos + dashLength >= totalLength1) break;
                        currentPos += dashLength + gap;
                      }
                      isLongDash = !isLongDash;
                    }
                    
                    // 두 번째 대각선 (아래에서 위로) - 정면뷰에서만 표시
                    const segments2 = [];
                    if (isFrontView) {
                      const start2 = [rightDoorWidthUnits / 2, 0, 0];
                      const end2 = [-rightDoorWidthUnits / 2, doorHeight / 2, 0];

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
                            <Line
                              key={`seg2-long-${currentPos}`}
                              points={[
                                [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                                [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                              ]}
                              color="#FF8800"
                              lineWidth={1}
                              transparent={true}
                              opacity={1.0}
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
                            <Line
                              key={`seg2-short-${currentPos}`}
                              points={[
                                [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                                [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                              ]}
                              color="#FF8800"
                              lineWidth={1}
                              transparent={true}
                            opacity={1.0}
                          />
                        );
                        if (currentPos + dashLength >= totalLength2) break;
                        currentPos += dashLength + gap;
                        }
                        isLongDash = !isLongDash;
                      }
                    }

                    return [...segments1, ...segments2];
                  })()}
                </group>
              )}

              {/* 오른쪽 도어 가로 폭 치수 (2D 정면뷰/탑뷰, 상부장 제외, 분할 모드 상부 섹션 제외) */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'top') && !isUpperCabinet && !(totalSections > 1 && sectionIndex === 1) && (() => {
                const isTopView = view2DDirection === 'top';
                const extensionLineStart = mmToThreeUnits(isTopView ? -230 : 70); // 탑뷰: -230mm (도어 쪽으로), 정면뷰: 70mm
                const extensionLineLength = mmToThreeUnits(110); // 연장선 길이 110mm
                const tickSize = 0.03; // 틱 마크 크기 (CAD 표준)
                const xOffset = 0; // X축 오프셋 제거

                // 정면뷰: doorHeight 사용 (음수 방향), 탑뷰: doorDepth 사용 (양수 방향)
                const dimensionLinePos = isTopView
                  ? doorDepth / 2 + extensionLineStart + extensionLineLength
                  : -doorHeight / 2 - extensionLineStart - extensionLineLength;
                const extensionStart = isTopView
                  ? doorDepth / 2 + extensionLineStart
                  : -doorHeight / 2 - extensionLineStart;

                return (
                  <>
                    {/* 왼쪽 연장선 */}
                    <Line
                      points={isTopView ? [
                        [-rightDoorWidthUnits / 2 + xOffset, 0, extensionStart],
                        [-rightDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                      ] : [
                        [-rightDoorWidthUnits / 2, extensionStart, doorThicknessUnits / 2 + 0.001],
                        [-rightDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />

                    {/* 오른쪽 연장선 */}
                    <Line
                      points={isTopView ? [
                        [rightDoorWidthUnits / 2 + xOffset, 0, extensionStart],
                        [rightDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                      ] : [
                        [rightDoorWidthUnits / 2, extensionStart, doorThicknessUnits / 2 + 0.001],
                        [rightDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                    />

                    {/* 치수선 (가로선) */}
                    <Line
                      points={isTopView ? [
                        [-rightDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos],
                        [rightDoorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                      ] : [
                        [-rightDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                        [rightDoorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={2}
                    />

                    {/* 왼쪽 틱 마크 (수평선) */}
                    <Line
                      points={isTopView ? [
                        [-rightDoorWidthUnits / 2 - tickSize + xOffset, 0, dimensionLinePos],
                        [-rightDoorWidthUnits / 2 + tickSize + xOffset, 0, dimensionLinePos]
                      ] : [
                        [-rightDoorWidthUnits / 2 - tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                        [-rightDoorWidthUnits / 2 + tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={2}
                    />

                    {/* 오른쪽 틱 마크 (수평선) */}
                    <Line
                      points={isTopView ? [
                        [rightDoorWidthUnits / 2 - tickSize + xOffset, 0, dimensionLinePos],
                        [rightDoorWidthUnits / 2 + tickSize + xOffset, 0, dimensionLinePos]
                      ] : [
                        [rightDoorWidthUnits / 2 - tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                        [rightDoorWidthUnits / 2 + tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                      ]}
                      color={dimensionColor}
                      lineWidth={2}
                    />

                    {/* 치수 텍스트 - 치수선 아래에 배치 */}
                    <DimensionText
                      value={rightDoorWidth}
                      position={isTopView ?
                        [xOffset, 0, dimensionLinePos - mmToThreeUnits(15)] :
                        [0, dimensionLinePos + mmToThreeUnits(15), doorThicknessUnits / 2 + 0.001]
                      }
                      anchorX="center"
                      anchorY="bottom"
                      forceShow={true}
                      rotation={isTopView ? [-Math.PI / 2, 0, 0] : undefined}
                    />
                  </>
                );
              })()}
            </group>
          </animated.group>
        </group>
      </group>
    );
  } else {
    // 싱글 가구: 하나의 문 - 힌지 위치에 따라 회전축을 문의 가장자리에서 10mm 안쪽으로 이동
    // 도어는 항상 3mm 갭 적용 (가구보다 3mm 작게)
    const doorGap = 3;
    const doorWidth = actualDoorWidth - doorGap; // 슬롯사이즈 - 갭
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    console.log('🚪 싱글 도어 크기:', {
      actualDoorWidth,
      doorWidth,
      originalSlotWidth,
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
          <group position={[doorPositionX, 0, 0]}>
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

            {/* Hinges for single door - 상부장 2개, 하부장 2개, 키큰장 4개 */}
            {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
              <>
                {isUpperCabinet ? (
                  // 상부장: 위에서 100mm, 아래에서 100mm
                  <>
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        doorHeight / 2 - mmToThreeUnits(100),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        -doorHeight / 2 + mmToThreeUnits(100),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                  </>
                ) : isLowerCabinet ? (
                  // 하부장: 위에서 100mm, 아래에서 149mm
                  <>
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        doorHeight / 2 - mmToThreeUnits(100),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        -doorHeight / 2 + mmToThreeUnits(149),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                  </>
                ) : totalSections > 1 && sectionIndex !== undefined ? (
                  // 분할 모드: 섹션별로 다른 경첩 배치
                  <>
                    {sectionIndex === 1 ? (
                      // 상부 섹션 도어: 위에서 두번째 경첩 제거 (3개 경첩)
                      <>
                        <Hinge
                          position={[
                            adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                            doorHeight / 2 - mmToThreeUnits(100),
                            doorThicknessUnits / 2 + 0.001
                          ]}
                          mainDiameter={17.5}
                          smallCircleDiameter={4}
                          smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                          viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                          view2DDirection={view2DDirection}
                        />
                        <Hinge
                          position={[
                            adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                            -doorHeight / 2 + mmToThreeUnits(149),
                            doorThicknessUnits / 2 + 0.001
                          ]}
                          mainDiameter={17.5}
                          smallCircleDiameter={4}
                          smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                          viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                          view2DDirection={view2DDirection}
                        />
                        <Hinge
                          position={[
                            adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                            -doorHeight / 2 + mmToThreeUnits(749),
                            doorThicknessUnits / 2 + 0.001
                          ]}
                          mainDiameter={17.5}
                          smallCircleDiameter={4}
                          smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                          viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                          view2DDirection={view2DDirection}
                        />
                      </>
                    ) : (
                      // 하부 섹션 도어: 위에서 두번째, 아래서 두번째 제거하고 중간에 추가 (3개 경첩)
                      <>
                        <Hinge
                          position={[
                            adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                            doorHeight / 2 - mmToThreeUnits(100),
                            doorThicknessUnits / 2 + 0.001
                          ]}
                          mainDiameter={17.5}
                          smallCircleDiameter={4}
                          smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                          viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                          view2DDirection={view2DDirection}
                        />
                        <Hinge
                          position={[
                            adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                            0,
                            doorThicknessUnits / 2 + 0.001
                          ]}
                          mainDiameter={17.5}
                          smallCircleDiameter={4}
                          smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                          viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                          view2DDirection={view2DDirection}
                        />
                        <Hinge
                          position={[
                            adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                            -doorHeight / 2 + mmToThreeUnits(149),
                            doorThicknessUnits / 2 + 0.001
                          ]}
                          mainDiameter={17.5}
                          smallCircleDiameter={4}
                          smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                          viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                          view2DDirection={view2DDirection}
                        />
                      </>
                    )}
                  </>
                ) : (
                  // 키큰장 병합 모드: 기존 4개 경첩
                  <>
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        doorHeight / 2 - mmToThreeUnits(100),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        doorHeight / 2 - mmToThreeUnits(700),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        -doorHeight / 2 + mmToThreeUnits(149),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                    <Hinge
                      position={[
                        adjustedHingePosition === 'left' ? -doorWidthUnits / 2 + mmToThreeUnits(24) : doorWidthUnits / 2 - mmToThreeUnits(24),
                        -doorHeight / 2 + mmToThreeUnits(749),
                        doorThicknessUnits / 2 + 0.001
                      ]}
                      mainDiameter={17.5}
                      smallCircleDiameter={4}
                      smallCircleXOffset={adjustedHingePosition === 'left' ? 9.5 : -9.5}
                      viewDirection={view2DDirection === 'left' || view2DDirection === 'right' ? 'side' : 'front'}
                      view2DDirection={view2DDirection}
                    />
                  </>
                )}
              </>
            )}


            {/* 도어 열리는 방향 표시 (2D 정면뷰/측면뷰) */}
            {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
              <group position={[0, 0, doorThicknessUnits / 2 + 0.001]}>
                {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                {(() => {
                  const isFrontView = view2DDirection === 'front';

                  // 첫 번째 대각선 (위에서 아래로) - 조정된 힌지 위치 사용
                  const start1 = isFrontView
                    ? [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, -doorHeight / 2, 0]
                    : [adjustedHingePosition === 'left' ? doorDepth / 2 : -doorDepth / 2, -doorHeight / 2, 0];
                  const end1 = isFrontView
                    ? [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0]
                    : [adjustedHingePosition === 'left' ? -doorDepth / 2 : doorDepth / 2, 0, 0];
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
                      let dashLength = longDash;
                      if (currentPos + longDash + gap >= totalLength1) {
                        dashLength = totalLength1 - currentPos;
                      }
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + dashLength) / totalLength1;
                      segments1.push(
                        <Line
                          key={`seg1-long-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent={true}
                          opacity={1.0}
                        />
                      );
                      if (currentPos + dashLength >= totalLength1) break;
                      currentPos += dashLength + gap;
                    } else {
                      let dashLength = shortDash;
                      if (currentPos + shortDash + gap >= totalLength1) {
                        dashLength = totalLength1 - currentPos;
                      }
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + dashLength) / totalLength1;
                      segments1.push(
                        <Line
                          key={`seg1-short-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent={true}
                          opacity={1.0}
                        />
                      );
                      if (currentPos + dashLength >= totalLength1) break;
                      currentPos += dashLength + gap;
                    }
                    isLongDash = !isLongDash;
                  }
                  
                  // 두 번째 대각선 (아래에서 위로) - 조정된 힌지 위치 사용
                  const start2 = isFrontView
                    ? [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0]
                    : [adjustedHingePosition === 'left' ? -doorDepth / 2 : doorDepth / 2, 0, 0];
                  const end2 = isFrontView
                    ? [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, doorHeight / 2, 0]
                    : [adjustedHingePosition === 'left' ? doorDepth / 2 : -doorDepth / 2, doorHeight / 2, 0];
                  const segments2 = [];

                  const dx2 = end2[0] - start2[0];
                  const dy2 = end2[1] - start2[1];
                  const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                  currentPos = 0;
                  isLongDash = true;

                  // 두 번째 대각선 렌더링
                  while (currentPos < totalLength2) {
                    if (isLongDash) {
                      let dashLength = longDash;
                      if (currentPos + longDash + gap >= totalLength2) {
                        dashLength = totalLength2 - currentPos;
                      }
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + dashLength) / totalLength2;
                      segments2.push(
                        <Line
                          key={`seg2-long-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent={true}
                          opacity={1.0}
                        />
                      );
                      if (currentPos + dashLength >= totalLength2) break;
                      currentPos += dashLength + gap;
                    } else {
                      let dashLength = shortDash;
                      if (currentPos + shortDash + gap >= totalLength2) {
                        dashLength = totalLength2 - currentPos;
                      }
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + dashLength) / totalLength2;
                      segments2.push(
                        <Line
                          key={`seg2-short-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent={true}
                          opacity={1.0}
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

            {/* 도어 가로 폭 치수 (2D 정면뷰/탑뷰, 상부장 제외) */}
            {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'top') && !isUpperCabinet && (() => {
              const isTopView = view2DDirection === 'top';
              const extensionLineStart = mmToThreeUnits(isTopView ? -230 : 70); // 탑뷰: -230mm (도어 쪽으로), 정면뷰: 70mm
              const extensionLineLength = mmToThreeUnits(110); // 연장선 길이 110mm
              const tickSize = 0.03; // 틱 마크 크기 (CAD 표준)
              const xOffset = 0; // X축 오프셋 제거

              // 정면뷰: doorHeight 사용 (음수 방향), 탑뷰: doorDepth 사용 (양수 방향)
              const dimensionLinePos = isTopView
                ? doorDepth / 2 + extensionLineStart + extensionLineLength
                : -doorHeight / 2 - extensionLineStart - extensionLineLength;
              const extensionStart = isTopView
                ? doorDepth / 2 + extensionLineStart
                : -doorHeight / 2 - extensionLineStart;

              return (
                <>
                  {/* 왼쪽 연장선 */}
                  <Line
                    points={isTopView ? [
                      [-doorWidthUnits / 2 + xOffset, 0, extensionStart],
                      [-doorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                    ] : [
                      [-doorWidthUnits / 2, extensionStart, doorThicknessUnits / 2 + 0.001],
                      [-doorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                    ]}
                    color={dimensionColor}
                    lineWidth={1}
                  />

                  {/* 오른쪽 연장선 */}
                  <Line
                    points={isTopView ? [
                      [doorWidthUnits / 2 + xOffset, 0, extensionStart],
                      [doorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                    ] : [
                      [doorWidthUnits / 2, extensionStart, doorThicknessUnits / 2 + 0.001],
                      [doorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                    ]}
                    color={dimensionColor}
                    lineWidth={1}
                  />

                  {/* 치수선 (가로선) */}
                  <Line
                    points={isTopView ? [
                      [-doorWidthUnits / 2 + xOffset, 0, dimensionLinePos],
                      [doorWidthUnits / 2 + xOffset, 0, dimensionLinePos]
                    ] : [
                      [-doorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                      [doorWidthUnits / 2, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                    ]}
                    color={dimensionColor}
                    lineWidth={2}
                  />

                  {/* 왼쪽 틱 마크 (수평선) */}
                  <Line
                    points={isTopView ? [
                      [-doorWidthUnits / 2 - tickSize + xOffset, 0, dimensionLinePos],
                      [-doorWidthUnits / 2 + tickSize + xOffset, 0, dimensionLinePos]
                    ] : [
                      [-doorWidthUnits / 2 - tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                      [-doorWidthUnits / 2 + tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                    ]}
                    color={dimensionColor}
                    lineWidth={2}
                  />

                  {/* 오른쪽 틱 마크 (수평선) */}
                  <Line
                    points={isTopView ? [
                      [doorWidthUnits / 2 - tickSize + xOffset, 0, dimensionLinePos],
                      [doorWidthUnits / 2 + tickSize + xOffset, 0, dimensionLinePos]
                    ] : [
                      [doorWidthUnits / 2 - tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001],
                      [doorWidthUnits / 2 + tickSize, dimensionLinePos, doorThicknessUnits / 2 + 0.001]
                    ]}
                    color={dimensionColor}
                    lineWidth={2}
                  />

                  {/* 치수 텍스트 - 치수선 아래에 배치 */}
                  <DimensionText
                    value={doorWidth}
                    position={isTopView ?
                      [xOffset, 0, dimensionLinePos - mmToThreeUnits(15)] :
                      [0, dimensionLinePos + mmToThreeUnits(15), doorThicknessUnits / 2 + 0.001]
                    }
                    anchorX="center"
                    anchorY="bottom"
                    forceShow={true}
                    rotation={isTopView ? [-Math.PI / 2, 0, 0] : undefined}
                  />
                </>
              );
            })()}
          </group>
        </animated.group>
      </group>
    );
  }
};

export default DoorModule; 
