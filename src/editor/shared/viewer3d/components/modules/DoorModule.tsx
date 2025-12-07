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
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, getDefaultGrainDirection, resolvePanelGrainDirection } from '@/editor/shared/utils/materialConstants';
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
  panelName?: string;
  textureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
}> = ({ args, position, material, renderMode, isDragging = false, isEditMode = false, onClick, onPointerOver, onPointerOut, panelName, textureUrl, panelGrainDirections, furnitureId }) => {
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

  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh
          geometry={geometry}
          material={material}
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
          <lineSegments name="door-edge" geometry={edgesGeometry} renderOrder={1001}>
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
  doorTopGap?: number; // 천장에서 아래로의 갭 (mm, 기본값: 5)
  doorBottomGap?: number; // 바닥에서 위로의 갭 (mm, 기본값: 25)
  sectionHeightsMm?: number[]; // 섹션별 실제 측판 높이 (mm)
  sectionIndex?: number; // 섹션 인덱스 (분할 모드용, 0: 하부, 1: 상부)
  totalSections?: number; // 전체 섹션 수 (분할 모드용, 기본값: 1)
  furnitureId?: string; // 가구 ID (개별 도어 제어용)
  textureUrl?: string; // 텍스처 URL
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' }; // 패널별 결 방향
  zone?: 'normal' | 'dropped'; // 단내림 영역 정보
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
  floatHeight: floatHeightProp,
  doorTopGap = 5, // 천장에서 아래로 갭 (기본값 5mm)
  doorBottomGap = 25, // 바닥에서 위로 갭 (기본값 25mm)
  sectionHeightsMm,
  sectionIndex, // 섹션 인덱스 (분할 모드용)
  totalSections = 1, // 전체 섹션 수 (분할 모드용)
  furnitureId, // 가구 ID
  textureUrl, // 텍스처 URL
  panelGrainDirections, // 패널별 결 방향
  zone // 단내림 영역 정보
}) => {
  const storeSpaceInfo = useSpaceConfigStore(state => state.spaceInfo);
  const placementType = (storeSpaceInfo?.baseConfig?.placementType) ?? (spaceInfo?.baseConfig?.placementType);
  const storeFloatHeight = storeSpaceInfo?.baseConfig?.floatHeight;
  const propFloatHeight = floatHeightProp ?? spaceInfo?.baseConfig?.floatHeight;
  const floatHeightSource = storeFloatHeight !== undefined ? storeFloatHeight : (propFloatHeight ?? 0);
  const floatHeight = placementType === 'float' ? floatHeightSource : 0;
  // Store에서 재질 설정과 도어 상태 가져오기
  const { doorsOpen, view2DDirection, isIndividualDoorOpen, toggleIndividualDoor, selectedSlotIndex } = useUIStore();
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { dimensionColor } = useDimensionColor(); // 치수 색상

  const isSide2DView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');

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

  console.log('🎨🎨🎨 DoorModule materialConfig:', {
    doorTexture: materialConfig.doorTexture,
    doorColor: materialConfig.doorColor,
    propTextureUrl: textureUrl
  });

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

  // material ref 저장
  const doorMaterialRef = React.useRef(doorMaterial);
  const leftDoorMaterialRef = React.useRef(leftDoorMaterial);
  const rightDoorMaterialRef = React.useRef(rightDoorMaterial);

  React.useEffect(() => {
    doorMaterialRef.current = doorMaterial;
    leftDoorMaterialRef.current = leftDoorMaterial;
    rightDoorMaterialRef.current = rightDoorMaterial;
  }, [doorMaterial, leftDoorMaterial, rightDoorMaterial]);

  // 재질 속성 업데이트 (재생성 없이) - 성능 최적화
  // 중요: mat.map은 절대 건드리지 않음! 텍스처는 별도 useEffect에서만 관리
  useEffect(() => {
    const materials = [doorMaterialRef.current, leftDoorMaterialRef.current, rightDoorMaterialRef.current];
    materials.forEach((mat) => {
      if (mat) {
        // 편집 모드일 때 설정
        if (isEditMode) {
          mat.transparent = true;
          mat.opacity = 0.15;
          mat.color.set(getThemeColor());
          mat.depthWrite = false;
          mat.depthTest = true;
          mat.side = THREE.DoubleSide;
          mat.emissive = new THREE.Color(getThemeColor());
          mat.emissiveIntensity = 0.1;
        } else if (isDragging) {
          mat.transparent = true;
          mat.opacity = 0.3;
          mat.color.set(getThemeColor());
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
        } else if (viewMode === '2D') {
          mat.color.set('#18CF23');
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.depthWrite = true;
        } else if (renderMode === 'wireframe') {
          mat.transparent = true;
          mat.opacity = 0.3;
          mat.depthWrite = true;
          if (!mat.map) {
            mat.color.set(isSelected ? getThemeColor() : doorColor);
          }
        } else if (isSelected) {
          mat.transparent = true;
          mat.opacity = 0.5;
          mat.depthWrite = true;
          if (!mat.map) {
            mat.color.set(getThemeColor());
          }
        } else {
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.depthWrite = true;
          if (!mat.map) {
            mat.color.set(doorColor);
          }
        }

        mat.needsUpdate = true;
      }
    });
  }, [doorColor, isSelected, isDragging, isEditMode, viewMode, renderMode]);

  // 편집/드래그/2D 모드일 때 텍스처 제거
  useEffect(() => {
    if (isEditMode || isDragging || viewMode === '2D') {
      [doorMaterialRef.current, leftDoorMaterialRef.current, rightDoorMaterialRef.current].forEach(mat => {
        if (mat && mat.map) {
          mat.map = null;
          mat.needsUpdate = true;
        }
      });
    }
  }, [isEditMode, isDragging, viewMode]);

  // Shadow auto-update enabled - manual shadow updates removed

  // 스토어에서 직접 panelGrainDirections 가져오기 (실시간 업데이트 보장)
  const storePanelGrainDirections = useFurnitureStore(state => {
    if (!furnitureId) return undefined;
    const furniture = state.placedModules.find(m => m.id === furnitureId);
    return furniture?.panelGrainDirections;
  });

  // 스토어에서 가져온 값 우선, 없으면 props 사용
  const activePanelGrainDirections = storePanelGrainDirections || panelGrainDirections;

  console.log('🔥 DoorModule - panelGrainDirections 소스:', {
    furnitureId,
    fromStore: !!storePanelGrainDirections,
    fromProps: !!panelGrainDirections,
    final: activePanelGrainDirections,
    storePanelGrainDirections,
    propsPanelGrainDirections: panelGrainDirections
  });

  // 텍스처 적용 함수 (성능 최적화)
  const getDoorPanelName = useCallback((doorSide: 'single' | 'left' | 'right') => {
    const sectionLabel = sectionIndex === 1 ? '(상)' : sectionIndex === 0 ? '(하)' : '';
    if (doorSide === 'single') {
      return sectionLabel ? `${sectionLabel}도어` : '도어';
    }
    const sideLabel = doorSide === 'left' ? '(좌)' : '(우)';
    return sectionLabel ? `${sectionLabel}도어${sideLabel}` : `도어${sideLabel}`;
  }, [sectionIndex]);

  const applyTextureToMaterial = useCallback((material: THREE.MeshStandardMaterial, textureUrl: string | undefined, doorSide: string, panelNameHint?: string) => {
    if (textureUrl && material) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isOakTexture(textureUrl)) {
        applyOakTextureSettings(material);
      } else if (isCabinetTexture1(textureUrl)) {
        applyCabinetTexture1Settings(material);
      }

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);

          // 도어 나무결 방향 결정 (activePanelGrainDirections 우선)
          const defaultPanelName = doorSide === '왼쪽'
            ? getDoorPanelName('left')
            : doorSide === '오른쪽'
              ? getDoorPanelName('right')
              : getDoorPanelName('single');
          const resolvedPanelName = panelNameHint || defaultPanelName;
          const grainDirection = resolvePanelGrainDirection(resolvedPanelName, activePanelGrainDirections) || 'vertical';

          texture.rotation = grainDirection === 'vertical' ? Math.PI / 2 : 0;
          texture.center.set(0.5, 0.5); // 중심점 기준 회전

          material.map = texture;

          // Oak 또는 Cabinet Texture1인 경우 전용 설정 적용
          if (isOakTexture(textureUrl)) {
            applyOakTextureSettings(material);
          } else if (isCabinetTexture1(textureUrl)) {
            applyCabinetTexture1Settings(material);
          } else {
            // 다른 텍스처는 기본 설정
            material.color.setHex(0xffffff); // 기본 흰색
            material.toneMapped = true; // 기본 톤 매핑 활성화
            material.roughness = 0.6; // 기본 거칠기
          }

          material.needsUpdate = true;

          console.log(`🚪 ${doorSide} 텍스처 로드 완료:`, {
            hasMap: !!material.map,
            mapImage: material.map?.image?.src,
            color: material.color.getHexString(),
            toneMapped: material.toneMapped,
            roughness: material.roughness,
            isOakTexture: isOakTexture(textureUrl),
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
  }, [doorColor, activePanelGrainDirections, getDoorPanelName]);

  // activePanelGrainDirections 변경 시 기존 텍스처 회전 업데이트
  // JSON.stringify를 사용하여 객체 내부 값 변경을 감지
  const activePanelGrainDirectionsStr = activePanelGrainDirections ? JSON.stringify(activePanelGrainDirections) : '';

  useEffect(() => {
    const panelNames = {
      single: getDoorPanelName('single'),
      left: getDoorPanelName('left'),
      right: getDoorPanelName('right')
    };

    const resolveRotation = (panelNameHint: string) => {
      const direction = resolvePanelGrainDirection(panelNameHint, activePanelGrainDirections) || 'vertical';
      return direction === 'vertical' ? Math.PI / 2 : 0;
    };

    if (doorMaterial && doorMaterial.map) {
      doorMaterial.map.rotation = resolveRotation(panelNames.single);
      doorMaterial.map.center.set(0.5, 0.5);
      doorMaterial.map.needsUpdate = true;
      doorMaterial.needsUpdate = true;
    }

    if (leftDoorMaterial && leftDoorMaterial.map) {
      leftDoorMaterial.map.rotation = resolveRotation(panelNames.left);
      leftDoorMaterial.map.center.set(0.5, 0.5);
      leftDoorMaterial.map.needsUpdate = true;
      leftDoorMaterial.needsUpdate = true;
    }

    if (rightDoorMaterial && rightDoorMaterial.map) {
      rightDoorMaterial.map.rotation = resolveRotation(panelNames.right);
      rightDoorMaterial.map.center.set(0.5, 0.5);
      rightDoorMaterial.map.needsUpdate = true;
      rightDoorMaterial.needsUpdate = true;
    }
  }, [activePanelGrainDirectionsStr, doorMaterial, leftDoorMaterial, rightDoorMaterial, getDoorPanelName]);

  // 도어 텍스처 적용 (텍스처 URL 변경 시에만)
  useEffect(() => {
    // materialConfig.doorTexture 또는 textureUrl 사용
    const effectiveTextureUrl = materialConfig.doorTexture || textureUrl;

    console.log('🚪🚪🚪 DoorModule 텍스처 적용 useEffect 실행:', {
      propTextureUrl: textureUrl,
      configTextureUrl: materialConfig.doorTexture,
      effectiveTextureUrl,
      hasDoorMaterial: !!doorMaterial,
      hasLeftDoorMaterial: !!leftDoorMaterial,
      hasRightDoorMaterial: !!rightDoorMaterial,
      doorColor,
      isDragging,
      isEditMode,
      willApplyTexture: !isDragging && !isEditMode && !!effectiveTextureUrl,
      fullMaterialConfig: materialConfig
    });

    const panelNames = {
      single: getDoorPanelName('single'),
      left: getDoorPanelName('left'),
      right: getDoorPanelName('right')
    };

    // 드래그 중이거나 편집 모드가 아닐 때 텍스처 처리
    if (!isDragging && !isEditMode) {
      if (effectiveTextureUrl) {
        // 텍스처가 있으면 적용
        console.log('🎨 도어 텍스처 적용 시작:', effectiveTextureUrl);

        if (doorMaterialRef.current) {
          console.log('🎨 싱글 도어에 텍스처 적용');
          applyTextureToMaterial(doorMaterialRef.current, effectiveTextureUrl, '싱글', panelNames.single);
        }
        if (leftDoorMaterialRef.current) {
          console.log('🎨 왼쪽 도어에 텍스처 적용');
          applyTextureToMaterial(leftDoorMaterialRef.current, effectiveTextureUrl, '왼쪽', panelNames.left);
        }
        if (rightDoorMaterialRef.current) {
          console.log('🎨 오른쪽 도어에 텍스처 적용');
          applyTextureToMaterial(rightDoorMaterialRef.current, effectiveTextureUrl, '오른쪽', panelNames.right);
        }
      } else {
        // 텍스처가 없으면 제거 (색상 재질로 변경)
        console.log('🗑️ 도어 텍스처 제거 (색상 재질로 변경)');
        [doorMaterialRef.current, leftDoorMaterialRef.current, rightDoorMaterialRef.current].forEach(mat => {
          if (mat && mat.map) {
            mat.map = null;
            mat.color.set(doorColor);
            mat.needsUpdate = true;
          }
        });
      }
    } else {
      console.log('⏭️ 도어 텍스처 적용 스킵:', {
        reason: isDragging ? '드래그 중' : isEditMode ? '편집 모드' : '알 수 없음'
      });
    }
  }, [materialConfig.doorTexture, textureUrl, doorColor, applyTextureToMaterial, isDragging, isEditMode, getDoorPanelName]);
  
  // 투명도 설정: renderMode에 따라 조정 (2D solid 모드에서도 투명하게)
  const opacity = renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid' ? 0.2 : 1.0);

  // 원본 spaceInfo 가져오기 (zone별로 분리되지 않은 전체 공간 정보)
  const { spaceInfo: originalSpaceInfo } = useSpaceConfigStore();

  // 인덱싱 정보 계산 - 원본 spaceInfo 사용
  const indexing = calculateSpaceIndexing(originalSpaceInfo);

  // 단내림 구간인 경우 영역별 슬롯 정보 계산 - 원본 spaceInfo로 계산
  let effectiveColumnWidth = indexing.columnWidth;
  if (originalSpaceInfo.droppedCeiling?.enabled && zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(originalSpaceInfo, originalSpaceInfo.customColumnCount);

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
  if (originalSpaceInfo.surroundType === 'no-surround') {
    // 노서라운드에서는 항상 원래 슬롯 크기를 사용해야 함
    // originalSlotWidth가 없으면 fallback으로 계산
    if (!originalSlotWidth) {
      // 노서라운드에서는 슬롯 너비를 그대로 사용 (엔드패널이 슬롯에 포함됨)
      // 듀얼 가구면 슬롯 너비 * 2
      actualDoorWidth = isDualFurniture ? effectiveColumnWidth * 2 : effectiveColumnWidth;
      console.log(`🚪 노서라운드 도어 너비 계산:`, {
        전체너비: originalSpaceInfo.width,
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

  // 단내림 구간인 경우 해당 구간의 높이 사용
  let fullSpaceHeight = originalSpaceInfo.height;

  console.log('🚪🔴 DoorModule zone 정보:', {
    zone,
    droppedCeilingEnabled: originalSpaceInfo.droppedCeiling?.enabled,
    dropHeight: originalSpaceInfo.droppedCeiling?.dropHeight,
    normalHeight: originalSpaceInfo.height,
    willUseDroppedHeight: originalSpaceInfo.droppedCeiling?.enabled && zone === 'dropped'
  });

  if (originalSpaceInfo.droppedCeiling?.enabled && zone === 'dropped') {
    // 단내림 구간 높이 = 전체 높이 - 내려온 높이
    const dropHeight = originalSpaceInfo.droppedCeiling.dropHeight || 0;
    fullSpaceHeight = originalSpaceInfo.height - dropHeight;
    console.log('🚪📏 단내림 구간 높이 사용:', {
      zone,
      normalHeight: originalSpaceInfo.height,
      dropHeight,
      droppedHeight: fullSpaceHeight,
      계산식: `${originalSpaceInfo.height} - ${dropHeight} = ${fullSpaceHeight}`
    });
  }

  let doorBottomLocal = 0; // 키큰장 기준 로컬 좌표에서의 도어 하단 (mm)
  let doorTopLocal = 0; // 키큰장 기준 로컬 좌표에서의 도어 상단 (mm)

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
    const LOWER_CABINET_BOTTOM_EXTENSION = 40; // 하부장 도어 아래쪽 확장 (mm) - 바닥배치 시만
    const LOWER_CABINET_TOP_EXTENSION = 18; // 하부장 상부 마감재 두께 (도어 상단이 하부장 상단과 일치)

    // 띄움배치 시 하단 확장 제거 (키큰장 도어 하단과 맞추기 위해)
    const bottomExtension = floatHeight > 0 ? 0 : LOWER_CABINET_BOTTOM_EXTENSION;

    // 하부장 도어 높이 = 캐비넷 높이 + 아래 확장 + 위 확장(상부 마감재)
    actualDoorHeight = lowerCabinetHeight + bottomExtension + LOWER_CABINET_TOP_EXTENSION;

    if (floatHeight > 0) {
      console.log('🚪📐 하부장 플로팅 도어 높이 조정:', {
        원래높이: lowerCabinetHeight + LOWER_CABINET_TOP_EXTENSION,
        하단확장제거: LOWER_CABINET_BOTTOM_EXTENSION,
        조정된높이: actualDoorHeight,
        설명: '띄움배치 시 하단 확장 제거하여 키큰장 도어 하단과 일치'
      });
    }

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
    // 키큰장의 경우: 천장/바닥 기준으로 갭 적용
    // fullSpaceHeight는 zone prop에 따라 단내림 구간 높이 또는 일반 구간 높이 사용

    const floorHeightValue = originalSpaceInfo.hasFloorFinish ? (originalSpaceInfo.floorFinish?.height || 0) : 0;
    const topFrameHeightValue = originalSpaceInfo.frameSize?.top || 10;
    const baseHeightValue = placementType === 'float' ? floatHeight : (originalSpaceInfo.baseConfig?.height || 65);

    // 가구 높이 계산 (천장 높이 - 상부프레임 - 바닥재 - 받침대/띄움높이)
    tallCabinetFurnitureHeight = fullSpaceHeight - topFrameHeightValue - floorHeightValue - baseHeightValue;

    // 로컬 좌표계에서 도어 기준 위치 계산
    const cabinetBottomLocal = -tallCabinetFurnitureHeight / 2;
    const cabinetTopLocal = tallCabinetFurnitureHeight / 2;
    const actualBaseHeight = placementType === 'float' ? floatHeight : (originalSpaceInfo.baseConfig?.height || 65);
    const baselineBottomGap = floorHeightValue + actualBaseHeight;
    const inputBottomGap = doorBottomGap ?? baselineBottomGap;
    const effectiveBottomGap = inputBottomGap;
    const extraBottomGap = effectiveBottomGap - baselineBottomGap;

    // doorTopGap은 천장에서 도어 상단까지의 절대 거리
    // 가구 상단은 천장에서 topFrameHeight만큼 아래에 있음
    // 따라서 가구 상단에서 도어 상단까지의 거리는 (doorTopGap - topFrameHeight)
    const absoluteTopGap = doorTopGap !== undefined ? doorTopGap : (topFrameHeightValue + 5);
    const extraTopGap = absoluteTopGap - topFrameHeightValue;

    doorBottomLocal = cabinetBottomLocal + extraBottomGap;
    doorTopLocal = cabinetTopLocal - extraTopGap;

    console.log('🚪⚙️ 키큰장 도어 갭 변환:', {
      doorBottomGapInput: doorBottomGap,
      baselineBottomGap,
      effectiveBottomGap,
      extraBottomGap,
      doorTopGapInput: doorTopGap,
      extraTopGap,
      cabinetBottomLocal,
      cabinetTopLocal,
      doorBottomLocal,
      doorTopLocal,
      placementType,
      floatHeight,
      설명: '띄움배치 시 baselineBottomGap에 이미 floatHeight 반영됨'
    });

    // 띄움배치 시 floatHeight는 이미 baselineBottomGap에 반영되어 있음
    // 별도의 doorBottomLocal 조정 불필요

    actualDoorHeight = Math.max(doorTopLocal - doorBottomLocal, 0);

    console.log('🚪📏 키큰장 actualDoorHeight:', {
      doorTopLocal,
      doorBottomLocal,
      actualDoorHeight,
      floatHeight,
      설명: '상단 - 하단 = 도어 높이'
    });

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

      // 도어 분할 시 섹션 사이 3mm 갭: 각 도어 높이를 1.5mm씩 줄임
      const SECTION_GAP_HALF = 1.5; // mm

      // 실제 계산된 도어 높이를 섹션 비율로 분배
      const totalDoorHeight = actualDoorHeight;
      const totalSectionHeight = resolvedSectionHeightsMm.reduce((sum, h) => sum + h, 0);
      const sectionRatio = resolvedSectionHeightsMm[sectionIndex] / totalSectionHeight;

      actualDoorHeight = totalDoorHeight * sectionRatio - SECTION_GAP_HALF;

      console.log('🚪📏 분할 모드 도어 높이 (천장/바닥 기준):', {
        sectionIndex,
        totalSections,
        fullSpaceHeight,
        tallCabinetFurnitureHeight,
        sectionHeightsMm: resolvedSectionHeightsMm,
        totalSectionHeight,
        sectionRatio,
        doorTopGap,
        doorBottomGap,
        totalDoorHeight,
        sectionGapReduction: SECTION_GAP_HALF,
        actualDoorHeight,
        설명: `계산된 도어 높이(${totalDoorHeight}) × 섹션 비율(${sectionRatio.toFixed(2)}) - 갭 감소(${SECTION_GAP_HALF}) = ${actualDoorHeight}mm`
      });
    } else {
      console.log('🚪📏 병합 모드 도어 높이 (천장/바닥 기준):', {
        fullSpaceHeight,
        topFrameHeight: topFrameHeightValue,
        floorHeight: floorHeightValue,
        baseHeight: baseHeightValue,
        furnitureHeight: tallCabinetFurnitureHeight,
        doorTopGap,
        doorBottomGap,
        effectiveBottomGap,
        actualDoorHeight,
        설명: `도어 상단/하단 로컬 좌표 차이 = ${actualDoorHeight}mm`
      });
    }
  }
  
  // 도어 높이에 추가 조정 없음 (사용자 입력 갭이 완전히 제어)
  const doorHeight = mmToThreeUnits(actualDoorHeight);
  
  // === 문 Y 위치 계산 ===
  let doorYPosition: number;
  
  if (isUpperCabinet) {
    // 상부장 도어는 캐비넷보다 아래로 확장
    const upperCabinetHeight = moduleData?.dimensions?.height || 600;

    // 캐비넷 하단 = -캐비넷높이/2
    // 도어 하단 = 캐비넷 하단 - 확장값 (더 아래로)
    // 도어 높이 = 캐비넷높이 - 위쪽 간격 + 아래 확장
    // 도어 중심 = 도어 하단 + 도어높이/2
    const doorHeightMm = upperCabinetHeight - UPPER_CABINET_TOP_GAP + UPPER_CABINET_BOTTOM_EXTENSION;
    const cabinetBottom = -upperCabinetHeight / 2;
    const doorBottom = cabinetBottom - UPPER_CABINET_BOTTOM_EXTENSION;
    const doorCenter = doorBottom + doorHeightMm / 2 + 10; // 10mm 위로 조정

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
    const DOOR_POSITION_ADJUSTMENT = 0; // 위치 조정값 (10mm 위로 올림)
    const lowerCabinetHeight = moduleData?.dimensions?.height || 1000;

    // 하부장 캐비넷은 Y=0에 위치 (cabinetYPosition = 0)
    // 하부장 캐비넷 중심 Y = 0
    // 하부장 캐비넷 상단 = 캐비넷높이/2 + 상부 마감재(18mm)
    // 하부장 캐비넷 하단 = -캐비넷높이/2

    // 도어는 캐비넷 상단(마감재 포함)에서 아래로 확장
    // 도어 상단 = 캐비넷 상단 + 상부 마감재 (고정)
    // 도어 하단 = 캐비넷 하단 - 아래 확장값 (플로팅 시 올라감)
    // 도어 높이 = actualDoorHeight (이미 플로팅 높이가 반영됨)
    const cabinetTop = mmToThreeUnits(lowerCabinetHeight) / 2 + mmToThreeUnits(LOWER_CABINET_TOP_EXTENSION);
    const cabinetBottom = -mmToThreeUnits(lowerCabinetHeight) / 2;

    // 도어 상단은 고정 (cabinetTop에서 DOOR_POSITION_ADJUSTMENT만큼 아래)
    const doorTop = cabinetTop - mmToThreeUnits(DOOR_POSITION_ADJUSTMENT);

    // 도어 중심 = 도어 상단 - (도어 높이 / 2)
    // 플로팅 시 actualDoorHeight가 이미 줄어들었으므로, 도어 상단에서 절반 내려온 위치
    doorYPosition = doorTop - mmToThreeUnits(actualDoorHeight) / 2;

    console.log('🚪📍 하부장 도어 Y 위치 (상단 고정, 하단만 조정):', {
      moduleId: moduleData?.id,
      캐비넷높이: lowerCabinetHeight,
      캐비넷상단_mm: (cabinetTop / 0.01).toFixed(1),
      캐비넷하단_mm: (cabinetBottom / 0.01).toFixed(1),
      도어상단_mm: (doorTop / 0.01).toFixed(1),
      도어높이_mm: actualDoorHeight,
      플로팅높이_mm: floatHeight,
      도어중심Y_mm: (doorYPosition / 0.01).toFixed(1),
      위확장: LOWER_CABINET_TOP_EXTENSION,
      위치조정: DOOR_POSITION_ADJUSTMENT,
      type: '하부장',
      설명: '도어 상단 고정(' + (doorTop / 0.01).toFixed(1) + 'mm), 하단은 플로팅만큼 올라감'
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

      // 도어 분할 시 섹션 사이 3mm 갭: 각 도어 높이를 1.5mm씩 줄임
      const SECTION_GAP_HALF = 1.5; // mm

      // 천장/바닥 기준으로 섹션 도어 Y 위치 계산
      const totalDoorHeight = Math.max(actualDoorHeight, 0);
      const totalSectionHeight = resolvedSectionHeightsMm.reduce((sum, h) => sum + h, 0);

      if (sectionIndex === 0) {
        // 하부 섹션 도어: 바닥에서부터 계산
        const sectionRatio = resolvedSectionHeightsMm[0] / totalSectionHeight;
        const sectionDoorHeight = Math.max(totalDoorHeight * sectionRatio - SECTION_GAP_HALF, 0);

        // 하부 섹션: 하단 고정 (플로팅 시 상단이 내려감)
        const sectionDoorBottom = doorBottomLocal;
        const sectionDoorTop = sectionDoorBottom + sectionDoorHeight;
        const doorCenter = (sectionDoorBottom + sectionDoorTop) / 2;

        // 도어 중심 = 하단에서 도어 높이의 절반만큼 위
        doorYPosition = mmToThreeUnits(sectionDoorBottom + sectionDoorHeight / 2);

        console.log('🚪📍 하부 섹션 도어 Y 위치 (가구 기준):', {
          fullSpaceHeight,
          totalDoorHeight,
          totalSectionHeight,
          sectionRatio,
          sectionDoorHeight,
          doorBottomLocal: sectionDoorBottom,
          doorTopLocal: sectionDoorTop,
          doorCenter,
          doorTopGap,
          doorBottomGap,
          doorYPosition,
          doorYPosition_mm: doorYPosition / 0.01,
          설명: `가구 하단(${doorBottomLocal.toFixed(2)}mm) ~ ${sectionDoorTop.toFixed(2)}mm, 중심 = ${doorCenter.toFixed(2)}mm`
        });
      } else {
        // 상부 섹션 도어: 가구 상단 기준으로 계산
        const sectionRatio = resolvedSectionHeightsMm[1] / totalSectionHeight;
        const sectionDoorHeight = Math.max(totalDoorHeight * sectionRatio - SECTION_GAP_HALF, 0);

        const sectionDoorTop = doorTopLocal;
        const sectionDoorBottom = sectionDoorTop - sectionDoorHeight;
        const doorCenter = (sectionDoorBottom + sectionDoorTop) / 2;

        doorYPosition = mmToThreeUnits(doorCenter);

        console.log('🚪📍 상부 섹션 도어 Y 위치 (가구 기준):', {
          fullSpaceHeight,
          totalDoorHeight,
          totalSectionHeight,
          sectionRatio,
          sectionDoorHeight,
          doorTopLocal: sectionDoorTop,
          doorBottomLocal: sectionDoorBottom,
          doorCenter,
          doorTopGap,
          doorBottomGap,
          doorYPosition,
          doorYPosition_mm: doorYPosition / 0.01,
          설명: `가구 상단(${doorTopLocal.toFixed(2)}mm) ~ ${sectionDoorBottom.toFixed(2)}mm, 중심 = ${doorCenter.toFixed(2)}mm`
        });
      }
    } else {
      // 병합 모드: 천장/바닥 기준
      // Three.js 좌표계: Y=0은 공간 중심, 바닥=-fullSpaceHeight/2, 천장=+fullSpaceHeight/2
      // 플로팅 시: 도어 상단 고정, 하단만 올라감 (doorBottomLocal이 이미 올라감)
      // 도어 중심 = 도어 하단 + (도어 높이 / 2)

      const doorBottom = doorBottomLocal;
      const doorTop = doorTopLocal;

      // 도어 중심 = 하단에서 도어 높이의 절반만큼 위 (플로팅 시 하단이 올라가므로 중심도 올라감)
      doorYPosition = mmToThreeUnits(doorBottom + actualDoorHeight / 2);

      console.log('🚪📍 키큰장 도어 Y 위치 (하단 기준 계산):', {
        fullSpaceHeight,
        cabinetHeight: tallCabinetFurnitureHeight,
        doorTopGap,
        doorBottomGap,
        floatHeight,
        도어하단_mm: doorBottom.toFixed(1),
        도어상단_mm: doorTop.toFixed(1),
        도어높이_mm: actualDoorHeight.toFixed(1),
        도어중심Y_mm: (doorYPosition / 0.01).toFixed(1),
        설명: `도어 하단 ${doorBottom.toFixed(1)}mm에서 도어 높이 절반(${(actualDoorHeight / 2).toFixed(1)}mm) 만큼 위`
      });
    }
  }

  // 노서라운드 + 벽없음 상태 체크
  const isNoSurroundNoWallLeft = originalSpaceInfo.surroundType === 'no-surround' && !originalSpaceInfo.wallConfig?.left;
  const isNoSurroundNoWallRight = originalSpaceInfo.surroundType === 'no-surround' && !originalSpaceInfo.wallConfig?.right;
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
    const columns = originalSpaceInfo.columns || [];
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
      const columnX = mmToThreeUnits(column.position[0] - originalSpaceInfo.width / 2);
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
    
    console.log('[DoorDebug] dual-door slot widths', {
      slotWidths,
      moduleWidth,
      effectiveColumnWidth,
      originalSlotWidth,
      zone: (spaceInfo as any).zone,
      slotIndex
    });

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

    // 측면뷰에서 선택된 슬롯 확인
    // 듀얼 도어는 전체가 하나의 컴포넌트이므로 slotIndex로 현재 슬롯 판단
    const isSideView = view2DDirection === 'left' || view2DDirection === 'right';

    // 측면뷰가 아니면 항상 표시, 측면뷰면 항상 표시 (듀얼 도어는 하나의 유닛)
    const showLeftDoor = true;
    const showRightDoor = true;

    return (
      <group position={[doorGroupX, 0, 0]}> {/* 듀얼 캐비넷도 원래 슬롯 중심에 배치 */}
        {/* 왼쪽 도어 - 왼쪽 힌지 (왼쪽 가장자리에서 회전) */}
        {showLeftDoor && (
        <group position={[leftHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualLeftDoorSpring.rotation}>
            <group position={[leftDoorWidthUnits / 2 - hingeOffsetUnits, 0, 0]}>
              {/* BoxWithEdges 사용하여 도어 렌더링 */}
              <BoxWithEdges
                key={`left-door-${leftDoorMaterial.uuid}`}
                args={[leftDoorWidthUnits, doorHeight, doorThicknessUnits]}
                position={[0, 0, 0]}
                material={leftDoorMaterial}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                onClick={handleDoorClick}
                onPointerOver={handleDoorPointerOver}
                onPointerOut={handleDoorPointerOut}
                furnitureId={furnitureId}
                panelName="좌측 도어"
                textureUrl={textureUrl}
                panelGrainDirections={panelGrainDirections}
              />
              
              {/* Hinges for left door - 분할 모드, 상부장, 하부장, 키큰장 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {sectionIndex !== undefined ? (
                    // 분할 모드: 섹션별로 다른 경첩 배치
                    <>
                      {sectionIndex === 1 ? (
                        // 상부 섹션 도어: 3개 경첩 (상단 100mm, 중간, 하단 149mm)
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
                            position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), 0, doorThicknessUnits / 2 + 0.001]}
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
                        // 하부 섹션 도어: 3개 경첩 (상단 100mm, 중간, 하단 149mm)
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
                            position={[-leftDoorWidthUnits / 2 + mmToThreeUnits(24), 0, doorThicknessUnits / 2 + 0.001]}
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
                      )}
                    </>
                  ) : isUpperCabinet ? (
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


              {/* Door opening direction for left door - 정면뷰는 항상, 측면뷰는 열렸을 때만 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (view2DDirection === 'front' || isDoorOpen) && (() => {
                const segments = (() => {
                  const isFrontView = view2DDirection === 'front';
                  const segmentList: React.ReactNode[] = [];
                  const longDash = 2.4;
                  const shortDash = 0.9;
                  const gap = 0.9;

                  if (isFrontView) {
                    const start1 = [leftDoorWidthUnits / 2, -doorHeight / 2, 0] as const;
                    const end1 = [-leftDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`left-door-front-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    const start2 = [-leftDoorWidthUnits / 2, 0, 0] as const;
                    const end2 = [leftDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2 - currentPos);
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + actualLength) / totalLength2;
                      segmentList.push(
                        <Line
                          key={`left-door-front-2-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  } else {
                    const start1 = [-leftDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const end1 = [leftDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`left-door-side-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  }

                  return segmentList;
                })();

                const indicatorRotation = dualLeftDoorSpring.rotation.to(value => {
                  if (!isSide2DView) {
                    return 0;
                  }
                  const orientationSign = 1; // 측면뷰에서는 항상 동일한 방향 유지
                  const targetWorldRotation = orientationSign * Math.abs(value);
                  return targetWorldRotation - value;
                });

                return (
                  <animated.group
                    position={[0, 0, doorThicknessUnits / 2 + 0.001]}
                    rotation-y={indicatorRotation}
                  >
                    {segments}
                  </animated.group>
                );
              })()}

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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
        )}

        {/* 오른쪽 도어 - 오른쪽 힌지 (오른쪽 가장자리에서 회전) */}
        {showRightDoor && (
        <group position={[rightHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualRightDoorSpring.rotation}>
            <group position={[-rightDoorWidthUnits / 2 + hingeOffsetUnits, 0, 0]}>
              {/* BoxWithEdges 사용하여 도어 렌더링 */}
              <BoxWithEdges
                key={`right-door-${rightDoorMaterial.uuid}`}
                args={[rightDoorWidthUnits, doorHeight, doorThicknessUnits]}
                position={[0, 0, 0]}
                material={rightDoorMaterial}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                onClick={handleDoorClick}
                onPointerOver={handleDoorPointerOver}
                onPointerOut={handleDoorPointerOut}
                furnitureId={furnitureId}
                panelName="우측 도어"
                textureUrl={textureUrl}
                panelGrainDirections={panelGrainDirections}
              />
              
              {/* Hinges for right door - 분할 모드, 상부장, 하부장, 키큰장 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {sectionIndex !== undefined ? (
                    // 분할 모드: 섹션별로 다른 경첩 배치
                    <>
                      {sectionIndex === 1 ? (
                        // 상부 섹션 도어: 3개 경첩 (상단 100mm, 중간, 하단 149mm)
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
                            position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), 0, doorThicknessUnits / 2 + 0.001]}
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
                        // 하부 섹션 도어: 3개 경첩 (상단 100mm, 중간, 하단 149mm)
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
                            position={[rightDoorWidthUnits / 2 - mmToThreeUnits(24), 0, doorThicknessUnits / 2 + 0.001]}
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
                      )}
                    </>
                  ) : isUpperCabinet ? (
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


              {/* Door opening direction for right door - 정면뷰는 항상, 측면뷰는 열렸을 때만 */}
              {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (view2DDirection === 'front' || isDoorOpen) && (() => {
                const segments = (() => {
                  const isFrontView = view2DDirection === 'front';
                  const segmentList: React.ReactNode[] = [];
                  const longDash = 2.4;
                  const shortDash = 0.9;
                  const gap = 0.9;

                  if (isFrontView) {
                    const start1 = [-rightDoorWidthUnits / 2, -doorHeight / 2, 0] as const;
                    const end1 = [rightDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`right-door-front-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    const start2 = [rightDoorWidthUnits / 2, 0, 0] as const;
                    const end2 = [-rightDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2 - currentPos);
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + actualLength) / totalLength2;
                      segmentList.push(
                        <Line
                          key={`right-door-front-2-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  } else {
                    const start1 = [-rightDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const end1 = [rightDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`right-door-side-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color="#FF8800"
                          lineWidth={1}
                          transparent
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  }

                  return segmentList;
                })();

                const indicatorRotation = dualRightDoorSpring.rotation.to(value => {
                  if (!isSide2DView) {
                    return 0;
                  }
                  const orientationSign = 1; // 측면뷰에서는 항상 동일한 방향 유지
                  const targetWorldRotation = orientationSign * Math.abs(value);
                  return targetWorldRotation - value;
                });

                return (
                  <animated.group
                    position={[0, 0, doorThicknessUnits / 2 + 0.001]}
                    rotation-y={indicatorRotation}
                  >
                    {segments}
                  </animated.group>
                );
              })()}

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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
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
        )}
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
              key={`single-door-${doorMaterial.uuid}`}
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              position={[0, 0, 0]}
              material={doorMaterial}
              renderMode={renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
              onClick={handleDoorClick}
              onPointerOver={handleDoorPointerOver}
              onPointerOut={handleDoorPointerOut}
              furnitureId={furnitureId}
              panelName="도어"
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
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
                      // 상부 섹션 도어: 3개 경첩 (상단 100mm, 중간, 하단 149mm)
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


            {/* 도어 열리는 방향 표시 (2D 정면뷰/측면뷰) - 정면은 항상, 측면은 열렸을 때만 */}
            {viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (view2DDirection === 'front' || isDoorOpen) && (() => {
              const indicatorRotation = (adjustedHingePosition === 'left'
                ? leftHingeDoorSpring.rotation
                : rightHingeDoorSpring.rotation).to(value => {
                  if (!isSide2DView) {
                    return 0;
                  }
                  const orientationSign = 1; // 측면뷰에서는 항상 동일한 방향 유지
                  const targetWorldRotation = orientationSign * Math.abs(value);
                  return targetWorldRotation - value;
                });

              return (
                <animated.group
                  position={[0, 0, doorThicknessUnits / 2 + 0.001]}
                  rotation-y={indicatorRotation}
                >
                {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                {(() => {
                  const isFrontView = view2DDirection === 'front';

                  // 패턴 정의: [긴 대시, 공백, 짧은 대시, 공백]의 반복
                  const longDash = 2.4;
                  const shortDash = 0.9;
                  const gap = 0.9;
                  const segments1 = [];

                  if (!isFrontView) {
                    // 측면뷰: 항상 동일한 기준으로 표시 (좌/우측 뷰 모두 동일)
                    // 첫 번째 선: 왼쪽 상단 → 오른쪽 중간
                    const line1Start = [-doorWidthUnits / 2, doorHeight / 2, 0];
                    const line1End = [doorWidthUnits / 2, 0, 0];
                    const dx1 = line1End[0] - line1Start[0];
                    const dy1 = line1End[1] - line1Start[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segments1.push(
                        <Line
                          key={`line1-${isLongDash ? 'long' : 'short'}-${currentPos}`}
                          points={[
                            [line1Start[0] + dx1 * t1, line1Start[1] + dy1 * t1, 0],
                            [line1Start[0] + dx1 * t2, line1Start[1] + dy1 * t2, 0]
                          ]}
                          name="door-diagonal"
                          color="#FF8800"
                          lineWidth={1}
                          transparent={true}
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    // 두 번째 선: 오른쪽 중간 → 왼쪽 하단
                    const line2Start = [doorWidthUnits / 2, 0, 0];
                    const line2End = [-doorWidthUnits / 2, -doorHeight / 2, 0];
                    const dx2 = line2End[0] - line2Start[0];
                    const dy2 = line2End[1] - line2Start[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2 - currentPos);
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + actualLength) / totalLength2;
                      segments1.push(
                        <Line
                          key={`line2-${isLongDash ? 'long' : 'short'}-${currentPos}`}
                          points={[
                            [line2Start[0] + dx2 * t1, line2Start[1] + dy2 * t1, 0],
                            [line2Start[0] + dx2 * t2, line2Start[1] + dy2 * t2, 0]
                          ]}
                          name="door-diagonal"
                          color="#FF8800"
                          lineWidth={1}
                          transparent={true}
                          opacity={1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    return segments1;
                  }

                  // 정면뷰: X 패턴
                  const start1 = [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, -doorHeight / 2, 0];
                  const end1 = [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0];

                  const dx1 = end1[0] - start1[0];
                  const dy1 = end1[1] - start1[1];
                  const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                  let currentPos = 0;
                  let isLongDash = true;

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
                          name="door-diagonal"
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
                          name="door-diagonal"
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
                  
                  // 두 번째 대각선: 정면뷰에만 렌더링
                  if (isFrontView) {
                    const start2 = [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0];
                    const end2 = [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, doorHeight / 2, 0];
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
                  }

                  return segments1;
                })()}
                </animated.group>
              );
            })()}

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
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
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

// React.memo로 최적화: spaceInfo의 materialConfig 중 doorColor/doorTexture만 변경되었을 때만 리렌더링
export default React.memo(DoorModule, (prevProps, nextProps) => {
  // spaceInfo의 materialConfig.doorColor와 doorTexture만 비교
  const prevMaterialConfig = prevProps.spaceInfo?.materialConfig;
  const nextMaterialConfig = nextProps.spaceInfo?.materialConfig;

  // 도어 관련 속성만 비교
  const doorPropsEqual =
    prevProps.color === nextProps.color &&
    prevProps.textureUrl === nextProps.textureUrl &&
    prevMaterialConfig?.doorColor === nextMaterialConfig?.doorColor &&
    prevMaterialConfig?.doorTexture === nextMaterialConfig?.doorTexture;

  console.log('🔍 DoorModule React.memo 비교:', {
    prevDoorTexture: prevMaterialConfig?.doorTexture,
    nextDoorTexture: nextMaterialConfig?.doorTexture,
    doorTextureChanged: prevMaterialConfig?.doorTexture !== nextMaterialConfig?.doorTexture,
    doorPropsEqual,
    willRerender: !doorPropsEqual
  });

  // 기타 중요한 props 비교
  const otherPropsEqual =
    prevProps.moduleWidth === nextProps.moduleWidth &&
    prevProps.moduleDepth === nextProps.moduleDepth &&
    prevProps.hingePosition === nextProps.hingePosition &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isEditMode === nextProps.isEditMode &&
    prevProps.hasDoor === nextProps.hasDoor &&
    prevProps.doorWidth === nextProps.doorWidth &&
    prevProps.originalSlotWidth === nextProps.originalSlotWidth &&
    prevProps.slotCenterX === nextProps.slotCenterX &&
    prevProps.slotIndex === nextProps.slotIndex &&
    prevProps.doorTopGap === nextProps.doorTopGap &&
    prevProps.doorBottomGap === nextProps.doorBottomGap &&
    prevProps.doorSplit === nextProps.doorSplit &&
    prevProps.sectionHeightsMm === nextProps.sectionHeightsMm &&
    prevProps.sectionIndex === nextProps.sectionIndex &&
    prevProps.totalSections === nextProps.totalSections &&
    prevProps.upperDoorTopGap === nextProps.upperDoorTopGap &&
    prevProps.upperDoorBottomGap === nextProps.upperDoorBottomGap &&
    prevProps.lowerDoorTopGap === nextProps.lowerDoorTopGap &&
    prevProps.lowerDoorBottomGap === nextProps.lowerDoorBottomGap &&
    prevProps.furnitureId === nextProps.furnitureId;

  // panelGrainDirections 객체 비교
  const panelGrainDirectionsEqual = JSON.stringify(prevProps.panelGrainDirections) === JSON.stringify(nextProps.panelGrainDirections);

  // 모든 중요 props가 같으면 true 반환 (리렌더링 방지)
  return doorPropsEqual && otherPropsEqual && panelGrainDirectionsEqual;
}); 
