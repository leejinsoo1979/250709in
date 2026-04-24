import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useViewerTheme } from '../../../context/ViewerThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import { getDefaultGrainDirection, resolvePanelGrainDirection } from '@/editor/shared/utils/materialConstants';
import { useTexture } from '@react-three/drei';
import { useExcludedPanelsStore } from '../../../context/ExcludedPanelsContext';
import { useFurnitureGhostContext } from '../../../context/FurnitureGhostContext';
import { NativeLine } from '../../elements/NativeLine';

interface BoxWithEdgesProps {
  args: [number, number, number];
  position: [number, number, number];
  material?: THREE.Material; // material을 optional로 변경
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean; // 편집 모드 여부 추가
  hideEdges?: boolean; // 엣지 숨김 옵션 추가
  hideTopEdge?: boolean; // 상단 엣지만 숨김
  hideBottomEdge?: boolean; // 하단 엣지만 숨김
  isBackPanel?: boolean; // 백패널 여부 추가
  isEndPanel?: boolean; // 엔드패널 여부 추가
  isHighlighted?: boolean; // 강조 상태 추가
  isClothingRod?: boolean; // 옷걸이 봉 여부 추가
  edgeOpacity?: number; // 엣지 투명도 (0.0 ~ 1.0)
  onClick?: (e: any) => void;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
  panelName?: string; // 패널 이름 (예: "좌측판", "선반1")
  panelGrainDirections?: { [key: string]: 'horizontal' | 'vertical' }; // 패널별 결 방향 (fallback)
  textureUrl?: string; // 텍스처 URL
  furnitureId?: string; // 가구 ID - 스토어에서 직접 panelGrainDirections 가져오기 위함
  renderOrder?: number; // 렌더링 순서 (천장 뒤로 보낼 때 사용)
  notch?: { y: number; z: number }; // 앞쪽 상단 모서리 따내기 (Y방향 높이, Z방향 깊이) — L자형 단일 메시
  notches?: Array<{ y: number; z: number; fromBottom: number }>; // 다중 따내기 (fromBottom: 바닥에서 시작점, Three.js 단위)
  bottomRebate?: { width: number; height: number }; // 하단 양쪽 반턱 따내기 (width: 양쪽 폭, height: 따내기 높이, Three.js 단위)
  cornerNotch?: { width: number; depth: number; side: 'left' | 'right' }; // 상판 코너 따내기 (XZ평면, 위에서 본 ㄴ자형)
}

/**
 * 공통 BoxWithEdges 컴포넌트
 * 모든 가구 타입에서 재사용되는 엣지 표시 박스
 */
const BoxWithEdges: React.FC<BoxWithEdgesProps> = ({
  args,
  position,
  material,
  renderMode = 'solid',
  isDragging = false,
  isEditMode = false,
  hideEdges = false,
  hideTopEdge = false,
  hideBottomEdge = false,
  isBackPanel = false,
  isEndPanel = false,
  isHighlighted = false,
  furnitureId,
  isClothingRod = false,
  edgeOpacity,
  onClick,
  onPointerOver,
  onPointerOut,
  panelName,
  panelGrainDirections,
  textureUrl,
  renderOrder,
  notch,
  notches,
  bottomRebate,
  cornerNotch
}) => {

  // CNC 옵티마이저에서 체크 해제된 패널이면 렌더링 생략 (furnitureId::panelName 복합키)
  // NOTE: React hook (useExcludedPanelsStore) 대신 useFrame으로 폴링 — R3F Canvas는 별도 React reconciler를 사용하므로
  // DOM 쪽 Zustand 구독이 R3F 내부 컴포넌트 리렌더를 트리거하지 못함
  const groupRef = useRef<THREE.Group>(null);
  const compositeKey = furnitureId && panelName ? `${furnitureId}::${panelName}` : null;
  useFrame(() => {
    if (!groupRef.current || !compositeKey) return;
    const { excludedKeys } = useExcludedPanelsStore.getState();
    const shouldHide = excludedKeys.size > 0 && excludedKeys.has(compositeKey);
    if (groupRef.current.visible === shouldHide) {
      groupRef.current.visible = !shouldHide;
    }
  });


  const { viewMode, plainMaterial: isPlainMaterial } = useSpace3DView();
  const { view2DDirection, shadowEnabled, edgeOutlineEnabled } = useUIStore(); // view2DDirection, shadowEnabled, edgeOutlineEnabled 추가
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
  const interiorColorHex = useSpaceConfigStore(state => state.spaceInfo?.materialConfig?.interiorColor);
  const { theme: appTheme } = useTheme();

  // 전역 스토어에서 직접 편집 상태 감지 (Context bridge 문제 회피)
  const activePopup = useUIStore(state => state.activePopup);
  const selectedFurnitureId = useUIStore(state => state.selectedFurnitureId);
  const storeEditMode = furnitureId ? (activePopup.type === 'furnitureEdit' && activePopup.id === furnitureId) : false;
  const storeSelected = furnitureId ? (selectedFurnitureId === furnitureId) : false;
  const parentEditMode = useFurnitureGhostContext();
  const effectiveEditMode = isEditMode || parentEditMode || storeEditMode;
  const effectiveSelected = storeSelected;
  // 3D 편집/드래그 중에는 wireframe 대신 solid로 강제 (2D에서는 원래 renderMode 유지)
  const effectiveRenderMode = (viewMode === '3D' && (effectiveEditMode || isDragging)) ? 'solid' as const : renderMode;

  // 스토어에서 직접 panelGrainDirections 가져오기 (실시간 업데이트 보장)
  // Zustand는 selector 함수의 참조가 바뀌면 재구독하므로, furnitureId별로 안정적인 selector 필요
  const storePanelGrainDirections = useFurnitureStore((state) => {
    if (!furnitureId) {
      return undefined;
    }
    const furniture = state.placedModules.find(m => m.id === furnitureId);
    return furniture?.panelGrainDirections;
  }, (a, b) => {
    // 커스텀 equality 함수: panelGrainDirections 객체의 내용이 같으면 리렌더링 방지
    if (a === b) return true;
    if (!a || !b) return a === b;
    return JSON.stringify(a) === JSON.stringify(b);
  });

  // 스토어에서 가져온 값 우선, 없으면 props 사용
  const activePanelGrainDirections = storePanelGrainDirections || panelGrainDirections;
  
  // 기본 material 생성 (material prop이 없을 때 사용)
  const defaultMaterial = React.useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ 
      color: '#E0E0E0',
      roughness: 0.8,
      metalness: 0.1
    });
    return mat;
  }, []);
  
  // cleanup: defaultMaterial 정리
  React.useEffect(() => {
    return () => {
      if (!material) {
        defaultMaterial.dispose();
      }
    };
  }, [material, defaultMaterial]);
  
  // 실제 사용할 material (plainMaterial 모드면 항상 기본 색상, 아니면 prop 우선)
  const baseMaterial = isPlainMaterial ? defaultMaterial : (material || defaultMaterial);

  // 드래그/편집 고스트 효과 + 2D 솔리드 모드 투명 처리
  const processedMaterial = React.useMemo(() => {
    // MeshBasicMaterial인 경우
    // - 패널 하이라이팅용 highlightMaterial은 그대로 사용 (투명 처리 안 함)
    // - 프레임 형광색 등도 그대로 사용
    if (baseMaterial instanceof THREE.MeshBasicMaterial) {
      return baseMaterial;
    }

    // 옷봉 전용: 항상 원본 재질 유지 (밝기 보존)
    if (isClothingRod) {
      return baseMaterial;
    }

    // 테마 색상 가져오기 (드래그/편집 공용)
    const getThemeColor = () => {
      if (typeof window !== "undefined") {
        const computedStyle = getComputedStyle(document.documentElement);
        const primaryColor = computedStyle.getPropertyValue("--theme-primary").trim();
        if (primaryColor) {
          return primaryColor;
        }
      }
      return "#10b981"; // 기본값 (green)
    };

    // 3D에서만 고스트 적용 (2D에서는 치수 확인을 위해 원래 재질 유지)
    // MeshBasicMaterial 사용: 조명/카메라 각도에 무관하게 일관된 고스트 색상
    if (viewMode === '3D' && (isDragging || effectiveEditMode) && baseMaterial instanceof THREE.MeshStandardMaterial) {
      const themeColor = getThemeColor();
      const ghostMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeColor),
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      return ghostMaterial;
    }

    // 2D 솔리드 모드에서 캐비넷을 투명하게 처리 (편집/드래그 중에도 항상 적용)
    // 2D에서는 고스트 색상 없이 원래 재질 그대로 투명화 → 와이어프레임 라인으로 치수 확인
    if (viewMode === '2D' && effectiveRenderMode === 'solid' && baseMaterial instanceof THREE.MeshStandardMaterial) {
      // 도어: DoorModule에서 이미 material 설정 완료 → 그대로 사용
      const isDoor = panelName && (panelName.includes('도어') || panelName.includes('door'));
      if (isDoor) {
        return baseMaterial;
      }

      // 인조대리석 상판/뒷턱: 2D에서도 면 채움 유지 (상판 재질 색상 표시)
      const isCountertop2D = panelName && (panelName.includes('인조대리석') || panelName.includes('countertop'));
      if (isCountertop2D) {
        return baseMaterial;
      }

      // 목찬넬프레임: 연한 파란색 반투명 면
      const isWoodChannel = panelName && panelName.includes('목찬넬프레임');
      if (isWoodChannel) {
        return new THREE.MeshBasicMaterial({
          color: '#00cfff',
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      }

      const transparentMaterial = baseMaterial.clone();
      transparentMaterial.transparent = true;
      transparentMaterial.depthWrite = false;
      transparentMaterial.opacity = 0.1;
      transparentMaterial.needsUpdate = true;
      return transparentMaterial;
    }

    // wireframe 모드에서는 메시를 완전히 투명하게 (클릭 가능하도록 visible은 유지)
    if (effectiveRenderMode === 'wireframe' && baseMaterial instanceof THREE.MeshStandardMaterial) {
      // 인조대리석 상판/뒷턱: 2D wireframe에서도 면 채움 유지 (상판 재질 색상 표시)
      const isCountertop = panelName && (panelName.includes('인조대리석') || panelName.includes('countertop'));
      if (isCountertop) {
        return baseMaterial;
      }
      const invisibleMaterial = baseMaterial.clone();
      invisibleMaterial.transparent = true;
      invisibleMaterial.opacity = 0;
      invisibleMaterial.depthWrite = false;
      invisibleMaterial.needsUpdate = true;
      return invisibleMaterial;
    }

    // 기본 상태: baseMaterial 투명도를 정상 복원 (useEffect 타이밍 이슈 방지)
    // isEditMode/isDragging false인데 baseMaterial이 아직 투명 상태면 즉시 복원
    // plainMaterial 모드(CNC 옵티마이저)에서는 PanelDimmer가 재질을 직접 제어하므로 건너뜀
    if (!isPlainMaterial && baseMaterial instanceof THREE.MeshStandardMaterial) {
      if (baseMaterial.transparent || baseMaterial.opacity < 1.0) {
        baseMaterial.transparent = false;
        baseMaterial.opacity = 1.0;
        baseMaterial.depthWrite = true;
        baseMaterial.needsUpdate = true;
      }
    }
    return baseMaterial;
  }, [baseMaterial, isDragging, effectiveEditMode, effectiveSelected, viewMode, effectiveRenderMode, isClothingRod, panelName, view2DDirection, view2DTheme]);

  // activePanelGrainDirections를 JSON 문자열로 변환하여 값 변경 감지
  const activePanelGrainDirectionsStr = activePanelGrainDirections ? JSON.stringify(activePanelGrainDirections) : '';

  // 이전 activePanelGrainDirectionsStr 값 저장
  const prevGrainDirectionsRef = React.useRef<string>(activePanelGrainDirectionsStr);
  const panelMaterialRef = React.useRef<THREE.Material | null>(null);
  const textureSignature = React.useMemo(() => {
    if (processedMaterial instanceof THREE.MeshStandardMaterial && processedMaterial.map) {
      return processedMaterial.map.uuid;
    }
    return null;
  }, [processedMaterial]);
  const prevTextureSignatureRef = React.useRef<string | null>(textureSignature);

  // processedMaterial 타입이 변경되면 ref 초기화
  React.useEffect(() => {
    if (!(processedMaterial instanceof THREE.MeshStandardMaterial)) {
      panelMaterialRef.current = null;
    }
  }, [processedMaterial]);

  // 편집/드래그 모드 해제 시 panelMaterialRef 캐시된 clone의 투명도 즉시 복원
  React.useEffect(() => {
    if (!effectiveEditMode && !effectiveSelected && !isDragging && panelMaterialRef.current instanceof THREE.MeshStandardMaterial) {
      if (panelMaterialRef.current.transparent || panelMaterialRef.current.opacity < 1.0) {
        panelMaterialRef.current.transparent = processedMaterial instanceof THREE.MeshStandardMaterial ? processedMaterial.transparent : false;
        panelMaterialRef.current.opacity = processedMaterial instanceof THREE.MeshStandardMaterial ? processedMaterial.opacity : 1.0;
        panelMaterialRef.current.depthWrite = processedMaterial instanceof THREE.MeshStandardMaterial ? processedMaterial.depthWrite : true;
        panelMaterialRef.current.needsUpdate = true;
      }
    }
  }, [effectiveEditMode, effectiveSelected, isDragging, processedMaterial]);

  // 패널별 개별 material 생성 (텍스처 회전 적용)
  const panelSpecificMaterial = React.useMemo(() => {
    // plainMaterial 모드에서는 텍스처/결 방향 처리 건너뜀
    if (isPlainMaterial) return processedMaterial;

    if (!panelName || !(processedMaterial instanceof THREE.MeshStandardMaterial)) {
      return processedMaterial;
    }

    // 고스트 모드: 텍스처 처리 건너뛰고 processedMaterial 그대로 사용
    if (isDragging || effectiveEditMode || effectiveSelected) {
      panelMaterialRef.current = null;
      return processedMaterial;
    }

    const sourceMap = processedMaterial.map;
    if (!sourceMap) {
      panelMaterialRef.current = null;
      prevGrainDirectionsRef.current = activePanelGrainDirectionsStr;
      prevTextureSignatureRef.current = textureSignature;
      return processedMaterial;
    }

    const grainDirection = resolvePanelGrainDirection(panelName, activePanelGrainDirections) || getDefaultGrainDirection(panelName);

    const isFurnitureSidePanel = panelName && !panelName.includes('서랍') &&
      (panelName.includes('측판') || panelName.includes('좌측') || panelName.includes('우측'));
    const isBackPanel = panelName && panelName.includes('백패널');

    const targetRotation = (() => {
      if (isFurnitureSidePanel || isBackPanel) {
        return grainDirection === 'vertical' ? 0 : Math.PI / 2;
      }
      return grainDirection === 'vertical' ? Math.PI / 2 : 0;
    })();

    const grainDirectionsChanged = prevGrainDirectionsRef.current !== activePanelGrainDirectionsStr;
    const textureChanged = prevTextureSignatureRef.current !== textureSignature;

    // 투명도 변경 여부 체크 (2D/3D 모드 전환 시 중요)
    const transparencyChanged = panelMaterialRef.current instanceof THREE.MeshStandardMaterial &&
      (panelMaterialRef.current.transparent !== processedMaterial.transparent ||
       panelMaterialRef.current.opacity !== processedMaterial.opacity);

    if (!grainDirectionsChanged && !textureChanged && !transparencyChanged && panelMaterialRef.current instanceof THREE.MeshStandardMaterial && panelMaterialRef.current.map) {
      const existingTexture = panelMaterialRef.current.map;
      if (existingTexture.rotation !== targetRotation) {
        existingTexture.rotation = targetRotation;
        existingTexture.center.set(0.5, 0.5);
        existingTexture.needsUpdate = true;
        panelMaterialRef.current.needsUpdate = true;
      }

      panelMaterialRef.current.transparent = processedMaterial.transparent;
      panelMaterialRef.current.opacity = processedMaterial.opacity;
      panelMaterialRef.current.depthWrite = processedMaterial.depthWrite;
      panelMaterialRef.current.needsUpdate = true;

      return panelMaterialRef.current;
    }

    prevGrainDirectionsRef.current = activePanelGrainDirectionsStr;
    prevTextureSignatureRef.current = textureSignature;

    const panelMaterial = processedMaterial.clone();
    const texture = sourceMap.clone();

    texture.rotation = targetRotation;
    texture.center.set(0.5, 0.5);

    panelMaterial.map = texture;
    panelMaterial.transparent = processedMaterial.transparent;
    panelMaterial.opacity = processedMaterial.opacity;
    panelMaterial.depthWrite = processedMaterial.depthWrite;

    panelMaterial.needsUpdate = true;
    texture.needsUpdate = true;

    panelMaterialRef.current = panelMaterial;

    return panelMaterial;
  }, [processedMaterial, panelName, activePanelGrainDirectionsStr, isDragging, effectiveEditMode, textureSignature, viewMode, effectiveRenderMode, isPlainMaterial]);

  // cornerNotch ExtrudeGeometry는 축 스왑으로 일부 면 winding이 뒤집힘 → DoubleSide로 양면 렌더링
  const finalMaterial = React.useMemo(() => {
    if (cornerNotch && panelSpecificMaterial instanceof THREE.MeshStandardMaterial) {
      const mat = panelSpecificMaterial.clone();
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
      return mat;
    }
    return panelSpecificMaterial;
  }, [panelSpecificMaterial, cornerNotch]);

  // useEffect 제거: useMemo에서 이미 모든 회전 로직을 처리하므로 중복 실행 방지

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

  const highlightColor = themeColorMap[appTheme.color] || '#3b82f6';

  // 엣지 색상 결정
  const edgeColor = React.useMemo(() => {
    // 인조대리석 상판은 연한 그레이 윤곽선
    if (panelName && panelName.includes('인조대리석')) {
      return '#b0b0b0';
    }
    // 2D 모드에서 목찬넬프레임은 파란색 윤곽선
    if (viewMode === '2D' && panelName && panelName.includes('목찬넬프레임')) {
      return '#00cfff';
    }
    // 2D 모드에서 도어/마이다/마감판 패널은 초록색 윤곽선
    if (viewMode === '2D' && panelName && (panelName.includes('도어') || panelName.includes('마이다') || panelName.includes('마감판'))) {
      return view2DTheme === 'dark' ? '#00ff00' : '#228B22'; // 다크→초록, 라이트→진한 녹색
    }

    // 옷걸이 봉인 경우: 2D 모드에서 view2DTheme에 따라 색상 변경
    if (isClothingRod && viewMode === '2D') {
      return view2DTheme === 'light' ? '#808080' : '#FFFFFF';
    }

    // MeshBasicMaterial인 경우 (프레임 형광색 등)
    if (baseMaterial instanceof THREE.MeshBasicMaterial) {
      const color = "#" + baseMaterial.color.getHexString();

      // 2D 라이트 모드에서는 주황색을 검정색으로 변경
      if (viewMode === '2D' && view2DTheme === 'light' && color.toLowerCase() === '#ff4500') {
        return '#000000';
      }

      return color;
    }

    // 엔드패널이거나 강조 상태일 때는 2D/3D 모드에 따라 다른 색상 사용
    if (isEndPanel || isHighlighted) {
      if (viewMode === '2D') {
        // 2D 모드에서는 형광색 (neon green)
        return "#18CF23";
      } else {
        // 3D 모드에서는 테마 색상 (엔드패널은 3D에서 일반 색상)
        return isEndPanel ? (effectiveRenderMode === 'wireframe' ? (view2DTheme === 'dark' ? "#FF4500" : "#000000") : "#505050") : highlightColor;
      }
    }

    // Cabinet Texture1이 적용된 경우: 2D 모드에서는 theme-aware 색상 사용
    if (baseMaterial instanceof THREE.MeshStandardMaterial) {
      const materialColor = baseMaterial.color;
      // RGB 값이 정확히 0.12면 Cabinet Texture1 (오차 허용)
      if (Math.abs(materialColor.r - 0.12) < 0.01 &&
          Math.abs(materialColor.g - 0.12) < 0.01 &&
          Math.abs(materialColor.b - 0.12) < 0.01) {
        // 2D 모드: 테마에 맞는 대비 색상 사용 (라이트→검정, 다크→주황)
        if (viewMode === '2D') {
          if (effectiveRenderMode === 'wireframe') {
            return view2DTheme === 'dark' ? "#FFFFFF" : "#000000";
          }
          return view2DTheme === 'dark' ? "#FF4500" : "#444444";
        }
        // 3D 모드: 원래 색상 유지
        return "#" + new THREE.Color(0.12, 0.12, 0.12).getHexString();
      }
    }

    // 어두운 속장 재질 판별: 텍스처가 있는 MeshStandardMaterial은 color가 흰색이라 부족하므로
    // spaceInfo.materialConfig.interiorColor(설정 색상)를 기준으로 Rec.709 luminance 계산
    // (HP4319, 8832 같은 어두운 무늬재 대응)
    const isDarkInteriorMaterial = (() => {
      if (!interiorColorHex || typeof interiorColorHex !== 'string') return false;
      try {
        const col = new THREE.Color(interiorColorHex);
        const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
        return lum < 0.35;
      } catch {
        return false;
      }
    })();
    // 또는 baseMaterial이 텍스처 없이 어두운 RGB인 경우도 포함
    const isDarkBaseMaterial = isDarkInteriorMaterial || (() => {
      if (!(baseMaterial instanceof THREE.MeshStandardMaterial)) return false;
      if (baseMaterial.map) return false; // 텍스처 있으면 color 값은 신뢰하지 않음 (interiorColor로만 판정)
      const c = baseMaterial.color;
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      return lum < 0.35;
    })();

    if (viewMode === '3D') {
      if (effectiveRenderMode === 'wireframe') {
        return view2DTheme === 'dark' ? "#ffffff" : "#000000"; // 3D 은선모드에서는 최대 대비 색상
      }
      // 3D 솔리드 모드: 어두운 재질이면 연한 회색으로 대비 확보
      if (isDarkBaseMaterial) return "#b0b0b0";
      return "#5a5a5a"; // 진한 회색이 Windows 저DPR에서 뭉개져 보여 살짝 밝게
    } else if (effectiveRenderMode === 'wireframe') {
      return view2DTheme === 'dark' ? "#FFFFFF" : "#000000"; // 2D 와이어프레임 다크모드는 흰색(최대 대비), 라이트모드는 검정색
    } else {
      // 2D 솔리드 모드
      // 어두운 재질이면서 라이트 테마일 때는 연한 회색 (어두운 재질 위 윤곽선 대비)
      if (isDarkBaseMaterial && view2DTheme !== 'dark') return "#b0b0b0";
      if (view2DDirection === 'front') {
        // 정면 뷰에서는 선반과 동일한 색상
        return view2DTheme === 'dark' ? "#FF4500" : "#444444"; // 다크모드는 붉은 주황색
      } else {
        // 다른 뷰에서는 기본 색상
        return view2DTheme === 'dark' ? "#FF4500" : "#444444"; // 다크모드는 붉은 주황색
      }
    }
  }, [viewMode, effectiveRenderMode, view2DTheme, view2DDirection, baseMaterial, isHighlighted, highlightColor, panelName, interiorColorHex]);

  // Debug log for position

  // 2D 모드: panelName 기반 깊이 등급 → opacity 매핑
  // 가장 앞(마이다, 측판 등) = 1.0, 서랍 내부 = 0.4, 백패널 = 0.1
  const panelDepthOpacity = React.useMemo((): number => {
    if (viewMode !== '2D') return 1;
    if (isHighlighted) return 1;
    if (isClothingRod) {
      if (view2DDirection === 'left' || view2DDirection === 'right') return 0.35;
      return 1;
    }
    if (edgeOpacity !== undefined) return edgeOpacity;
    if (isBackPanel && view2DDirection === 'front') return 0.1;
    if (!panelName) return 1;

    // 서랍 관련 패널 판별 (서랍속장 > 서랍 내부 > 마이다 순서로 체크)
    const isDrawerFrame = panelName.includes('서랍속장');  // 서랍속장 프레임
    const isDrawerPanel = !isDrawerFrame && panelName.includes('서랍'); // 서랍 내부 패널 (마이다 포함)
    const isMaida = panelName.includes('마이다'); // 마이다 (서랍 앞면 손잡이판)

    // 정면 뷰 기준 깊이 등급
    const isInductionDrawer = panelName.includes('인덕션') && panelName.includes('서랍');
    if (view2DDirection === 'front') {
      if (isMaida) return 1.0;
      if (isInductionDrawer) return view2DTheme === 'dark' ? 0.7 : 0.6; // 인덕션 서랍: 전대 뒤로 보이므로 진하게
      if (isDrawerFrame) return view2DTheme === 'dark' ? 0.45 : 0.6;
      if (isDrawerPanel) return view2DTheme === 'dark' ? 0.45 : 0.6;
      // 하부섹션 상판: 옵셋으로 뒤에 있으므로 약간 흐리게
      if (panelName.includes('(하)상판')) return 0.5;
      return 1.0;
    }

    // 측면 뷰 기준 깊이 등급
    // 측판이 가장 앞 → 진하게, 나머지는 뒤에 있으므로 흐리게
    if (view2DDirection === 'left' || view2DDirection === 'right') {
      // 가구 측판 (가장 앞)
      if (!isDrawerPanel && !isDrawerFrame && (panelName.includes('측판') || panelName.includes('좌측') || panelName.includes('우측'))) return 1.0;
      // 가로전대 / 목찬넬 프레임 (측판 안쪽에 있어 측면뷰에서 가려짐)
      if (panelName.includes('가로전대') || panelName.includes('목찬넬')) return 0.3;
      // 인덕션 서랍 (전대 뒤로 직접 보임)
      if (isInductionDrawer) return 0.6;
      // 마이다, 상판, 바닥, 선반
      if (isMaida) return 0.4;
      if (panelName.includes('상판') || panelName.includes('바닥') || panelName.includes('선반')) return 0.4;
      // 서랍 측판
      if (isDrawerPanel && (panelName.includes('좌측') || panelName.includes('우측') || panelName.includes('측판'))) return 0.35;
      // 보강대
      if (panelName.includes('보강대')) return 0.3;
      // 서랍속장 프레임
      if (isDrawerFrame) return 0.25;
      // 서랍 내부 (앞판, 뒷판, 바닥)
      if (isDrawerPanel) return 0.2;
      return 0.5;
    }

    // 탑뷰 기준 깊이 등급
    // 상판이 가장 앞, 서랍 바닥판은 아래에 있으므로 흐리게
    if (view2DDirection === 'top') {
      if (isMaida) return 0.35;
      if (isDrawerFrame) return 0.35;
      if (isDrawerPanel && panelName.includes('바닥')) return 0.15;
      if (isDrawerPanel) return 0.25;
      return 1.0;
    }

    return 1;
  }, [viewMode, view2DDirection, view2DTheme, panelName, isHighlighted, isClothingRod, isBackPanel, edgeOpacity]);


  // 다중 노치 여부 판별 (notches가 있으면 우선 사용)
  const hasAnyNotch = !!(notch || (notches && notches.length > 0) || bottomRebate || cornerNotch);

  // L자형 노치 엣지 라인 생성 (2D/3D 공용) — 단일 및 다중 노치 지원
  const getNotchEdgeLines = React.useCallback((): [number, number, number][][] => {
    if (!hasAnyNotch) return [];
    const [width, height, depth] = args;
    const halfW = width / 2, halfH = height / 2, halfD = depth / 2;
    const lines: [number, number, number][][] = [];

    // 프로필 꼭짓점 계산 (YZ 평면) — 앞면 윤곽선 경로
    const profileVertices: [number, number][] = []; // [Y, Z] 쌍

    if (bottomRebate) {
      // 반턱: 정면(XY)에서 양쪽 하단 모서리 깎기 — 엣지 라인
      // 양쪽 바깥 수직선(측판에 묻히는 부분)은 제외
      const rw = bottomRebate.width, rh = bottomRebate.height;
      // 반턱 안쪽 단면만 (바깥 수직선 제외)
      const rebateInner: [number, number][] = [
        [-halfW + rw, -halfH],      // 중앙 좌측 하단
        [-halfW + rw, -halfH + rh], // 좌반턱 안쪽
        [-halfW, -halfH + rh],      // 좌반턱 상단 (좌측판 안쪽면)
      ];
      const rebateInnerR: [number, number][] = [
        [halfW, -halfH + rh],       // 우반턱 상단 (우측판 안쪽면)
        [halfW - rw, -halfH + rh],  // 우반턱 안쪽
        [halfW - rw, -halfH],       // 중앙 우측 하단
      ];
      // 하단 중앙 + 상단 사각형
      const boxEdges: [number, number][][] = [
        [[-halfW + rw, -halfH], [halfW - rw, -halfH]], // 하단 중앙
        [[-halfW, halfH], [halfW, halfH]],               // 상단
        [[-halfW, -halfH + rh], [-halfW, halfH]],        // 좌측 (반턱 상단~상단)
        [[halfW, -halfH + rh], [halfW, halfH]],          // 우측 (반턱 상단~상단)
      ];
      for (const zVal of [halfD, -halfD]) {
        // 좌측 반턱 안쪽 꺾임
        for (let i = 0; i < rebateInner.length - 1; i++) {
          lines.push([
            [rebateInner[i][0], rebateInner[i][1], zVal],
            [rebateInner[i+1][0], rebateInner[i+1][1], zVal],
          ]);
        }
        // 우측 반턱 안쪽 꺾임
        for (let i = 0; i < rebateInnerR.length - 1; i++) {
          lines.push([
            [rebateInnerR[i][0], rebateInnerR[i][1], zVal],
            [rebateInnerR[i+1][0], rebateInnerR[i+1][1], zVal],
          ]);
        }
        // 하단 중앙 + 상단 + 좌우 세로
        for (const edge of boxEdges) {
          lines.push([
            [edge[0][0], edge[0][1], zVal],
            [edge[1][0], edge[1][1], zVal],
          ]);
        }
      }
      // 앞뒤 연결 엣지 (바깥 수직선 꼭지점 제외)
      const connectPts: [number, number][] = [
        [-halfW + rw, -halfH], [-halfW + rw, -halfH + rh], [-halfW, -halfH + rh],
        [halfW, -halfH + rh], [halfW - rw, -halfH + rh], [halfW - rw, -halfH],
        [-halfW, halfH], [halfW, halfH],
      ];
      for (const v of connectPts) {
        lines.push([[v[0], v[1], -halfD], [v[0], v[1], halfD]]);
      }
      return lines;
    } else if (notches && notches.length > 0) {
      // 다중 노치: bottom-back → bottom-front → 각 노치 → top-back
      profileVertices.push([-halfH, -halfD]); // bottom-back
      profileVertices.push([-halfH, halfD]);  // bottom-front

      // 노치들 (fromBottom 순으로 정렬)
      const sortedNotches = [...notches].sort((a, b) => a.fromBottom - b.fromBottom);
      for (let ni = 0; ni < sortedNotches.length; ni++) {
        const n = sortedNotches[ni];
        const notchBottom = -halfH + n.fromBottom;
        const notchTop = notchBottom + n.y;
        const isUppermostNotch = Math.abs(notchTop - halfH) < 0.01;
        // 다음 노치와 맞닿아 있는지 (있으면 "다시 앞면으로" 스킵)
        const next = ni < sortedNotches.length - 1 ? sortedNotches[ni + 1] : null;
        const nextBottom = next ? -halfH + next.fromBottom : null;
        const adjacentToNext = next && nextBottom !== null && Math.abs(notchTop - nextBottom) < 0.01;
        // 이전 노치와 맞닿아 있는지 (있으면 "노치 하단 앞면" 스킵)
        const prev = ni > 0 ? sortedNotches[ni - 1] : null;
        const prevTop = prev ? -halfH + prev.fromBottom + prev.y : null;
        const adjacentToPrev = prev && prevTop !== null && Math.abs(prevTop - notchBottom) < 0.01;

        if (!adjacentToPrev) {
          profileVertices.push([notchBottom, halfD]);           // 노치 하단 시작점 (앞면)
        }
        profileVertices.push([notchBottom, halfD - n.z]);       // 안쪽으로 꺾임
        profileVertices.push([notchTop, halfD - n.z]);          // 위로 올라감

        if (isUppermostNotch) {
          // 최상단 노치: 앞면으로 돌아가지 않고 바로 뒤쪽으로
          profileVertices.push([halfH, -halfD]); // top-back
        } else if (!adjacentToNext) {
          profileVertices.push([notchTop, halfD]); // 다시 앞면으로 (다음 노치와 인접하지 않을 때만)
        }
      }

      // 최상단 노치가 halfH에 도달하지 않은 경우 상단 마무리
      const lastNotch = sortedNotches[sortedNotches.length - 1];
      const lastNotchTop = -halfH + lastNotch.fromBottom + lastNotch.y;
      if (Math.abs(lastNotchTop - halfH) >= 0.001) {
        profileVertices.push([halfH, halfD]);    // top-front
        profileVertices.push([halfH, -halfD]);   // top-back
      }
    } else if (notch) {
      // 단일 상단 노치 (기존 로직)
      const ny = notch.y, nz = notch.z;
      profileVertices.push([-halfH, -halfD]);           // bottom-back
      profileVertices.push([-halfH, halfD]);             // bottom-front
      profileVertices.push([halfH - ny, halfD]);         // notch start (front)
      profileVertices.push([halfH - ny, halfD - nz]);    // notch corner
      profileVertices.push([halfH, halfD - nz]);         // above notch
      profileVertices.push([halfH, -halfD]);             // top-back
    }

    // 프로필에서 중복 연속 꼭짓점 제거
    const verts = profileVertices.filter((v, i) =>
      i === 0 || v[0] !== profileVertices[i-1][0] || v[1] !== profileVertices[i-1][1]
    );

    // 양쪽 면(x = ±halfW) 윤곽선
    for (const xSign of [-1, 1]) {
      const x = xSign * halfW;
      for (let i = 0; i < verts.length; i++) {
        const next = (i + 1) % verts.length;
        lines.push([
          [x, verts[i][0], verts[i][1]],
          [x, verts[next][0], verts[next][1]]
        ]);
      }
    }

    // 연결 엣지 (앞면↔뒷면, 각 꼭짓점)
    for (const v of verts) {
      lines.push([[-halfW, v[0], v[1]], [halfW, v[0], v[1]]]);
    }

    // cornerNotch: XZ평면 코너 따내기 (상판용 — 위에서 본 ㄴ자형)
    if (cornerNotch && profileVertices.length === 0) {
      const nw = cornerNotch.width;  // 따내기 X방향 폭 (Three.js 단위)
      const nd = cornerNotch.depth;  // 따내기 Z방향 깊이 (Three.js 단위)
      const isRight = cornerNotch.side === 'right';

      // XZ 평면 꼭짓점 (위에서 본 윤곽) — right: 오른쪽 뒤 모서리 따내기
      const xzVerts: [number, number][] = isRight ? [
        [-halfW, -halfD],           // 좌측 뒤
        [-halfW, halfD],            // 좌측 앞
        [halfW, halfD],             // 우측 앞
        [halfW, -halfD + nd],       // 우측 따내기 시작점
        [halfW - nw, -halfD + nd],  // 따내기 안쪽
        [halfW - nw, -halfD],       // 따내기 끝 → 뒤로
      ] : [
        [-halfW, -halfD + nd],      // 좌측 따내기 시작점
        [-halfW, halfD],            // 좌측 앞
        [halfW, halfD],             // 우측 앞
        [halfW, -halfD],            // 우측 뒤
        [-halfW + nw, -halfD],      // 따내기 끝
        [-halfW + nw, -halfD + nd], // 따내기 안쪽
      ];

      // 상면·하면 윤곽선 (Y = ±halfH)
      for (const yVal of [halfH, -halfH]) {
        for (let i = 0; i < xzVerts.length; i++) {
          const next = (i + 1) % xzVerts.length;
          lines.push([
            [xzVerts[i][0], yVal, xzVerts[i][1]],
            [xzVerts[next][0], yVal, xzVerts[next][1]]
          ]);
        }
      }

      // 수직 연결 엣지 (상면↔하면)
      for (const v of xzVerts) {
        lines.push([[v[0], -halfH, v[1]], [v[0], halfH, v[1]]]);
      }
    }

    return lines;
  }, [notch, notches, bottomRebate, cornerNotch, hasAnyNotch, args]);

  // 2D 모드에서 엣지 렌더링 (panelName 기반 opacity 적용)
  const render2DEdgesWithDepth = React.useCallback(() => {
    const [width, height, depth] = args;
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    // notch가 있으면 L자형 엣지 사용
    const lines: [number, number, number][][] = hasAnyNotch ? getNotchEdgeLines() : [];

    if (!hasAnyNotch) {
    // 입면도(front)에서는 앞면 사각형만 표시 (뒷면·연결 엣지 제거 → 불필요한 중앙선 방지)
    const isFrontView = view2DDirection === 'front';

    // 앞면 사각형
    if (!hideTopEdge) lines.push([[-halfW, halfH, halfD], [halfW, halfH, halfD]]);
    if (!hideBottomEdge) lines.push([[-halfW, -halfH, halfD], [halfW, -halfH, halfD]]);
    lines.push([[-halfW, -halfH, halfD], [-halfW, halfH, halfD]]);
    lines.push([[halfW, -halfH, halfD], [halfW, halfH, halfD]]);

    if (!isFrontView) {
      // 뒷면 사각형
      if (!hideTopEdge) lines.push([[-halfW, halfH, -halfD], [halfW, halfH, -halfD]]);
      if (!hideBottomEdge) lines.push([[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]]);
      lines.push([[-halfW, -halfH, -halfD], [-halfW, halfH, -halfD]]);
      lines.push([[halfW, -halfH, -halfD], [halfW, halfH, -halfD]]);

      // 연결 엣지
      if (!hideTopEdge) {
        lines.push([[-halfW, halfH, halfD], [-halfW, halfH, -halfD]]);
        lines.push([[halfW, halfH, halfD], [halfW, halfH, -halfD]]);
      }
      if (!hideBottomEdge) {
        lines.push([[-halfW, -halfH, halfD], [-halfW, -halfH, -halfD]]);
        lines.push([[halfW, -halfH, halfD], [halfW, -halfH, -halfD]]);
      }
    }
    } // end if (!hasAnyNotch)

    const edgeName = isClothingRod
      ? 'clothing-rod-edge'
      : isBackPanel
        ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
        : `furniture-edge${panelName ? `-${panelName}` : ''}`;

    const baseLineWidth = isHighlighted ? 2 : 1;

    // 깊이감 표현: 다크모드는 배경색과 color 블렌딩, 라이트모드는 opacity만으로 깊이감
    const blendedColor = (view2DTheme === 'light' || panelDepthOpacity >= 1.0) ? edgeColor : (() => {
      const base = new THREE.Color(edgeColor);
      const bg = new THREE.Color('#1a1a2e');
      bg.lerp(base, panelDepthOpacity);
      return '#' + bg.getHexString();
    })();

    // 측면뷰에서 전대/보강대 단면 대각선 표시 (한쪽만)
    const isCrossSection = panelName && (panelName.includes('전대') || panelName.includes('보강대'));
    const isSideView = view2DDirection === 'left' || view2DDirection === 'right';
    const crossLines: [number, number, number][][] = [];
    if (isCrossSection && isSideView) {
      crossLines.push(
        [[0, -halfH, -halfD], [0, halfH, halfD]]   // ↗ 대각선 1개
      );
    }

    return (
      <>
        {lines.map((line, i) => (
          <NativeLine
            key={`${i}-${args[0]}-${args[1]}-${args[2]}`}
            name={`${edgeName}-${i}`}
            points={line}
            color={blendedColor}
            lineWidth={baseLineWidth}
            opacity={panelDepthOpacity}
            transparent={true}
            depthTest={false}
            depthWrite={false}
          />
        ))}
        {crossLines.map((line, i) => (
          <NativeLine
            key={`cross-${i}-${args[0]}-${args[1]}-${args[2]}`}
            name={`${edgeName}-cross-${i}`}
            points={line}
            color={edgeColor}
            lineWidth={1}
            opacity={1.0}
            transparent={true}
            depthTest={false}
            depthWrite={false}
          />
        ))}
      </>
    );
  }, [args, edgeColor, hideTopEdge, hideBottomEdge, isHighlighted, isBackPanel, isClothingRod, panelName, panelDepthOpacity, view2DTheme, view2DDirection, hasAnyNotch, getNotchEdgeLines]);

  // 노치 지오메트리 (단일 notch 또는 다중 notches 지원)
  const notchGeometry = React.useMemo(() => {
    if (!hasAnyNotch) return null;
    const [w, h, d] = args;
    const halfW = w / 2, halfH = h / 2, halfD = d / 2;

    // YZ 평면 Shape 생성 (shapeX=Y축, shapeY=Z축)
    const shape = new THREE.Shape();

    if (bottomRebate) {
      // 반턱: XY 평면 Shape → Z축 extrude
      const rw = bottomRebate.width, rh = bottomRebate.height;
      // 정면 단면 (반시계 방향 — Three.js Shape 기본)
      shape.moveTo(-halfW, -halfH);            // 좌하단 바깥
      shape.lineTo(-halfW, halfH);             // 좌상단
      shape.lineTo(halfW, halfH);              // 우상단
      shape.lineTo(halfW, -halfH);             // 우하단 바깥
      shape.lineTo(halfW, -halfH + rh);        // 우반턱 상단
      shape.lineTo(halfW - rw, -halfH + rh);   // 우반턱 안쪽
      shape.lineTo(halfW - rw, -halfH);        // 중앙 우측 하단
      shape.lineTo(-halfW + rw, -halfH);       // 중앙 좌측 하단
      shape.lineTo(-halfW + rw, -halfH + rh);  // 좌반턱 안쪽
      shape.lineTo(-halfW, -halfH + rh);       // 좌반턱 상단
      shape.closePath();

      const extrudeSettings = { depth: d, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // 좌표 변환: Shape XY 그대로, extrude Z → Z축, 중심 맞추기
      const pos = geom.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        arr[i * 3 + 2] = arr[i * 3 + 2] - halfD; // Z 중심 맞춤
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
      return geom;
    } else if (notches && notches.length > 0) {
      // 다중 노치 프로필
      shape.moveTo(-halfH, -halfD); // bottom-back
      shape.lineTo(-halfH, halfD);  // bottom-front

      const sortedNotches = [...notches].sort((a, b) => a.fromBottom - b.fromBottom);
      for (let ni = 0; ni < sortedNotches.length; ni++) {
        const n = sortedNotches[ni];
        const notchBottom = -halfH + n.fromBottom;
        const notchTop = notchBottom + n.y;
        const isUppermostNotch = Math.abs(notchTop - halfH) < 0.01;
        const next = ni < sortedNotches.length - 1 ? sortedNotches[ni + 1] : null;
        const nextBottom = next ? -halfH + next.fromBottom : null;
        const adjacentToNext = next && nextBottom !== null && Math.abs(notchTop - nextBottom) < 0.01;
        const prev = ni > 0 ? sortedNotches[ni - 1] : null;
        const prevTop = prev ? -halfH + prev.fromBottom + prev.y : null;
        const adjacentToPrev = prev && prevTop !== null && Math.abs(prevTop - notchBottom) < 0.01;

        if (!adjacentToPrev) {
          shape.lineTo(notchBottom, halfD);         // 노치 하단 (앞면)
        }
        shape.lineTo(notchBottom, halfD - n.z);     // 안쪽으로 꺾임
        shape.lineTo(notchTop, halfD - n.z);        // 위로 올라감

        if (isUppermostNotch) {
          shape.lineTo(halfH, -halfD);
        } else if (!adjacentToNext) {
          shape.lineTo(notchTop, halfD);             // 다시 앞면으로
        }
      }

      // 최상단 노치가 halfH에 도달하지 않은 경우 상단 마무리
      const lastNotch = sortedNotches[sortedNotches.length - 1];
      const lastNotchTop = -halfH + lastNotch.fromBottom + lastNotch.y;
      if (Math.abs(lastNotchTop - halfH) >= 0.001) {
        shape.lineTo(halfH, halfD);   // top-front
        shape.lineTo(halfH, -halfD);  // top-back
      }
    } else if (notch) {
      // 단일 상단 노치 (기존 로직)
      const ny = notch.y, nz = notch.z;
      shape.moveTo(-halfH, -halfD);
      shape.lineTo(-halfH, halfD);
      shape.lineTo(halfH - ny, halfD);
      shape.lineTo(halfH - ny, halfD - nz);
      shape.lineTo(halfH, halfD - nz);
      shape.lineTo(halfH, -halfD);
    } else if (cornerNotch) {
      // 코너 따내기: XZ 평면 Shape → Y축 extrude
      const nw = cornerNotch.width;
      const nd = cornerNotch.depth;
      const isRight = cornerNotch.side === 'right';

      // XZ 평면 (shapeX=X축, shapeY=Z축)
      // 시계방향(CW)으로 정의 — 좌표 변환 후 법선이 올바르게 바깥을 향하도록
      if (isRight) {
        shape.moveTo(-halfW, -halfD);           // 좌측 뒤
        shape.lineTo(halfW - nw, -halfD);       // 따내기 끝
        shape.lineTo(halfW - nw, -halfD + nd);  // 따내기 안쪽
        shape.lineTo(halfW, -halfD + nd);       // 우측 따내기 시작
        shape.lineTo(halfW, halfD);             // 우측 앞
        shape.lineTo(-halfW, halfD);            // 좌측 앞
      } else {
        shape.moveTo(-halfW, -halfD + nd);      // 좌측 따내기 시작
        shape.lineTo(-halfW + nw, -halfD + nd); // 따내기 안쪽
        shape.lineTo(-halfW + nw, -halfD);      // 따내기 끝
        shape.lineTo(halfW, -halfD);            // 우측 뒤
        shape.lineTo(halfW, halfD);             // 우측 앞
        shape.lineTo(-halfW, halfD);            // 좌측 앞
      }
      shape.closePath();

      const extrudeSettings = { depth: h, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // 좌표 변환: (shapeX→X, shapeY→Z, extrudeZ→Y) 중심 맞추기
      const pos = geom.attributes.position;
      const arr = pos.array as Float32Array;
      const temp = new Float32Array(arr.length);
      for (let i = 0; i < pos.count; i++) {
        const sx = arr[i * 3];     // shape X → X
        const sy = arr[i * 3 + 1]; // shape Y → Z
        const sz = arr[i * 3 + 2]; // extrude Z → Y
        temp[i * 3]     = sx;          // X
        temp[i * 3 + 1] = sz - halfH;  // Y: 중심 맞춤
        temp[i * 3 + 2] = sy;          // Z
      }
      pos.array.set(temp);
      pos.needsUpdate = true;

      // face winding 뒤집기 — 축 스왑(Y↔Z)으로 인해 면 방향이 반전됨
      const index = geom.index;
      if (index) {
        const idxArr = index.array as Uint16Array | Uint32Array;
        for (let i = 0; i < idxArr.length; i += 3) {
          const tmp = idxArr[i];
          idxArr[i] = idxArr[i + 2];
          idxArr[i + 2] = tmp;
        }
        index.needsUpdate = true;
      }

      geom.computeVertexNormals();
      return geom;
    }

    if (!notch && !(notches && notches.length > 0) && !bottomRebate) {
      // cornerNotch만 있는 경우는 위에서 이미 반환했으므로 여기 도달하면 notch 없음
      return null;
    }

    shape.closePath();

    const extrudeSettings = { depth: w, bevelEnabled: false };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // 좌표 변환: (shapeX→Y, shapeY→Z, extrudeZ→X) 그리고 중심 맞추기
    const pos = geom.attributes.position;
    const arr = pos.array as Float32Array;
    const temp = new Float32Array(arr.length);
    for (let i = 0; i < pos.count; i++) {
      const sx = arr[i * 3];     // shape X → 우리의 Y
      const sy = arr[i * 3 + 1]; // shape Y → 우리의 Z
      const sz = arr[i * 3 + 2]; // extrude Z → 우리의 X
      temp[i * 3]     = sz - halfW; // X: 돌출 방향, 중심 맞춤
      temp[i * 3 + 1] = sx;         // Y: 높이
      temp[i * 3 + 2] = sy;         // Z: 깊이
    }
    pos.array.set(temp);
    pos.needsUpdate = true;

    // 법선 재계산
    geom.computeVertexNormals();

    return geom;
  }, [notch, notches, bottomRebate, cornerNotch, hasAnyNotch, args]);

  // 옵티마이저에서 제외된 패널이면 렌더링하지 않음
  // useFrame 폴링으로 visible 제어 — R3F reconciler/DOM reconciler 간 Zustand 구독 호환 문제 회피
  return (
    <group ref={groupRef} position={position} userData={furnitureId ? { furnitureId } : undefined}
      visible={!(viewMode === '2D' && view2DDirection === 'top' && panelName && (panelName.includes('(하)상판') || panelName.includes('(상)바닥')))}
    >
      {/* 면 렌더링 - 와이어프레임에서는 투명하게 */}
      {/* DXF 내보내기를 위해 mesh에도 이름 추가 */}
      <mesh
        name={isClothingRod ? 'clothing-rod-mesh' : isBackPanel ? `back-panel-mesh${panelName ? `-${panelName}` : ''}` : `furniture-mesh${panelName ? `-${panelName}` : ''}`}
        userData={furnitureId ? { furnitureId } : undefined}
        receiveShadow={viewMode === '3D' && effectiveRenderMode === 'solid' && shadowEnabled}
        castShadow={viewMode === '3D' && effectiveRenderMode === 'solid' && shadowEnabled}
        renderOrder={renderOrder ?? 10}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        material={finalMaterial}
      >
        {notchGeometry ? (
          <primitive key={`notch-${args[0]}-${args[1]}-${args[2]}-${JSON.stringify(notch || notches || cornerNotch)}`} object={notchGeometry} attach="geometry" />
        ) : (
          <boxGeometry key={`${args[0]}-${args[1]}-${args[2]}`} args={args} />
        )}
      </mesh>
      {/* 윤곽선 렌더링 - hideEdges prop 또는 edgeOutlineEnabled 스토어 설정으로 제어 */}
      {!hideEdges && edgeOutlineEnabled && (() => {
        // 2D 모드: 깊이 기반 개별 라인 opacity 적용
        if (viewMode === '2D') {
          return render2DEdgesWithDepth();
        }

        // 3D 모드: notch가 있으면 L자형 엣지
        if (hasAnyNotch) {
          const notchLines = getNotchEdgeLines();
          const notchEdgeName = isClothingRod
            ? 'clothing-rod-edge'
            : isBackPanel
              ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
              : `furniture-edge${panelName ? `-${panelName}` : ''}`;
          return (
            <>
              {notchLines.map((line, i) => (
                <line key={`${notchEdgeName}-${i}-${line[0].join(',')}-${line[1].join(',')}`} name={`${notchEdgeName}-${i}`}>
                  <bufferGeometry>
                    <bufferAttribute
                      attach="attributes-position"
                      count={2}
                      array={new Float32Array([...line[0], ...line[1]])}
                      itemSize={3}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial
                    color={edgeColor}
                    transparent={effectiveRenderMode !== 'wireframe'}
                    opacity={isHighlighted ? 1.0 : (effectiveRenderMode === 'wireframe' ? 1.0 : 0.65)}
                    depthTest={effectiveRenderMode !== 'wireframe'}
                    depthWrite={false}
                    linewidth={isHighlighted ? 3 : 1}
                  />
                </line>
              ))}
            </>
          );
        }

        if (hideTopEdge || hideBottomEdge) {
          const [width, height, depth] = args;
          const halfW = width / 2;
          const halfH = height / 2;
          const halfD = depth / 2;

          const lines: [number, number, number][][] = [];

          // 앞면 사각형 (4개 엣지)
          if (!hideTopEdge) lines.push([[-halfW, halfH, halfD], [halfW, halfH, halfD]]);
          if (!hideBottomEdge) lines.push([[-halfW, -halfH, halfD], [halfW, -halfH, halfD]]);
          lines.push([[-halfW, -halfH, halfD], [-halfW, halfH, halfD]]);
          lines.push([[halfW, -halfH, halfD], [halfW, halfH, halfD]]);

          // 뒷면 사각형
          if (!hideTopEdge) lines.push([[-halfW, halfH, -halfD], [halfW, halfH, -halfD]]);
          if (!hideBottomEdge) lines.push([[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]]);
          lines.push([[-halfW, -halfH, -halfD], [-halfW, halfH, -halfD]]);
          lines.push([[halfW, -halfH, -halfD], [halfW, halfH, -halfD]]);

          // 연결 엣지
          if (!hideTopEdge) {
            lines.push([[-halfW, halfH, halfD], [-halfW, halfH, -halfD]]);
            lines.push([[halfW, halfH, halfD], [halfW, halfH, -halfD]]);
          }
          if (!hideBottomEdge) {
            lines.push([[-halfW, -halfH, halfD], [-halfW, -halfH, -halfD]]);
            lines.push([[halfW, -halfH, halfD], [halfW, -halfH, -halfD]]);
          }

          const partialEdgeName = isClothingRod
            ? 'clothing-rod-edge'
            : isBackPanel
              ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
              : `furniture-edge${panelName ? `-${panelName}` : ''}`;
          return (
            <>
              {lines.map((line, i) => (
                <line key={i} name={`${partialEdgeName}-${i}`}>
                  <bufferGeometry>
                    <bufferAttribute
                      attach="attributes-position"
                      count={2}
                      array={new Float32Array([...line[0], ...line[1]])}
                      itemSize={3}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial
                    color={edgeColor}
                    transparent={effectiveRenderMode !== 'wireframe'}
                    opacity={isHighlighted ? 1.0 : (effectiveRenderMode === 'wireframe' ? 1.0 : 0.65)}
                    depthTest={effectiveRenderMode !== 'wireframe'}
                    depthWrite={false}
                    linewidth={isHighlighted ? 3 : 1}
                  />
                </line>
              ))}
            </>
          );
        } else {
          // 전체 엣지 표시
          const edgeName = isClothingRod
            ? 'clothing-rod-edge'
            : isBackPanel
              ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
              : `furniture-edge${panelName ? `-${panelName}` : ''}`;
          return (
            <>
              <lineSegments name={edgeName}>
                <edgesGeometry key={`${args[0]}-${args[1]}-${args[2]}`} args={[new THREE.BoxGeometry(...args)]} />
                <lineBasicMaterial
                  color={edgeColor}
                  transparent={effectiveRenderMode !== 'wireframe'}
                  opacity={isHighlighted ? 1.0 : (effectiveRenderMode === 'wireframe' ? 1.0 : 0.65)}
                  depthTest={effectiveRenderMode !== 'wireframe'}
                  depthWrite={false}
                  polygonOffset={true}
                  polygonOffsetFactor={-10}
                  polygonOffsetUnits={-10}
                  linewidth={isHighlighted ? 3 : 1}
                />
              </lineSegments>
            </>
          );
        }
      })()}
    </group>
  );
};

export default BoxWithEdges;
