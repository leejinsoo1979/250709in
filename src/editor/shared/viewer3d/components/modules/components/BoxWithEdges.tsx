import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useViewerTheme } from '../../../context/ViewerThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useTheme } from '@/contexts/ThemeContext';
import { getDefaultGrainDirection, resolvePanelGrainDirection } from '@/editor/shared/utils/materialConstants';
import { useTexture } from '@react-three/drei';

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
  textureUrl
}) => {
  // Debug: 단내림 프레임 확인
  if (args[1] > 19 && args[1] < 21) {
    console.log('📍 BoxWithEdges 렌더 - position:', position, 'args:', args);
  }

  const { viewMode } = useSpace3DView();
  const { view2DDirection, shadowEnabled } = useUIStore(); // view2DDirection, shadowEnabled 추가
  const { gl } = useThree();
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
  const { theme: appTheme } = useTheme();

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
  
  // 실제 사용할 material (prop이 없으면 기본값 사용)
  const baseMaterial = material || defaultMaterial;

  // 드래그 중일 때만 고스트 효과 적용 (편집 모드는 제외)
  // 2D 솔리드 모드에서 캐비넷을 투명하게 처리 (옷봉 제외)
  const processedMaterial = React.useMemo(() => {
    // MeshBasicMaterial인 경우
    // - 패널 하이라이팅용 highlightMaterial은 그대로 사용 (투명 처리 안 함)
    // - 프레임 형광색 등도 그대로 사용
    if (baseMaterial instanceof THREE.MeshBasicMaterial) {
      return baseMaterial;
    }

    // 2D 솔리드 모드에서 캐비넷을 투명하게 처리 (옷봉 제외, highlightMaterial 제외)
    if (viewMode === '2D' && renderMode === 'solid' && baseMaterial instanceof THREE.MeshStandardMaterial && !isClothingRod) {
      // baseMaterial을 직접 수정하지 않고 clone
      const transparentMaterial = baseMaterial.clone();
      transparentMaterial.transparent = true;
      transparentMaterial.opacity = 0.1;  // 매우 투명하게 (10% 불투명도)
      transparentMaterial.depthWrite = false;
      transparentMaterial.needsUpdate = true;
      return transparentMaterial;
    }

    // 옷봉 전용: 항상 원본 재질 유지 (밝기 보존)
    if (isClothingRod) {
      return baseMaterial;
    }

    // 드래그 중일 때 투명 처리
    if (isDragging && baseMaterial instanceof THREE.MeshStandardMaterial) {
      const ghostMaterial = baseMaterial.clone();
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = 0.6;

      // 테마 색상 가져오기
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

      ghostMaterial.color = new THREE.Color(getThemeColor());
      ghostMaterial.needsUpdate = true;
      return ghostMaterial;
    }
    // 편집 모드에서는 원래 재질 그대로 사용
    return baseMaterial;
  }, [baseMaterial, isDragging, viewMode, renderMode, isClothingRod]);

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

  // 패널별 개별 material 생성 (텍스처 회전 적용)
  const panelSpecificMaterial = React.useMemo(() => {
    if (!panelName || !(processedMaterial instanceof THREE.MeshStandardMaterial)) {
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

      if (isDragging) {
        panelMaterialRef.current.color = processedMaterial.color.clone();
      }

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
  }, [processedMaterial, panelName, activePanelGrainDirectionsStr, isDragging, textureSignature, viewMode, renderMode]);

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
    // 2D 모드에서 서랍속장 패널은 초록색 윤곽선
    if (viewMode === '2D' && panelName && panelName.includes('서랍속장')) {
      return '#00ff00'; // 초록색
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
        return isEndPanel ? (renderMode === 'wireframe' ? (view2DTheme === 'dark' ? "#FF4500" : "#000000") : "#505050") : highlightColor;
      }
    }

    // Cabinet Texture1이 적용된 경우 정확한 색상 사용
    if (baseMaterial instanceof THREE.MeshStandardMaterial) {
      const materialColor = baseMaterial.color;
      // RGB 값이 정확히 0.12면 Cabinet Texture1 (오차 허용)
      if (Math.abs(materialColor.r - 0.12) < 0.01 &&
          Math.abs(materialColor.g - 0.12) < 0.01 &&
          Math.abs(materialColor.b - 0.12) < 0.01) {
        // Cabinet Texture1과 완전히 동일한 색상 사용 (RGB 0.12, 0.12, 0.12 = #1e1e1e)
        return "#" + new THREE.Color(0.12, 0.12, 0.12).getHexString();
      }
    }

    if (viewMode === '3D') {
      return "#505050"; // 3D 모드에서는 회색 엣지
    } else if (renderMode === 'wireframe') {
      return view2DTheme === 'dark' ? "#FF4500" : "#000000"; // 2D 와이어프레임 다크모드는 붉은 주황색, 라이트모드는 검정색
    } else {
      // 2D 솔리드 모드
      if (view2DDirection === 'front') {
        // 정면 뷰에서는 선반과 동일한 색상
        return view2DTheme === 'dark' ? "#FF4500" : "#444444"; // 다크모드는 붉은 주황색
      } else {
        // 다른 뷰에서는 기본 색상
        return view2DTheme === 'dark' ? "#FF4500" : "#444444"; // 다크모드는 붉은 주황색
      }
    }
  }, [viewMode, renderMode, view2DTheme, view2DDirection, baseMaterial, isHighlighted, highlightColor, panelName]);

  // Debug log for position
  React.useEffect(() => {
    const height = args[1];
    const yPos = position[1];
    if (height > 19 && height < 21) { // 높이가 약 20 (19~21 범위)
      console.log('📍 BoxWithEdges 단내림 프레임 - position:', position, 'args:', args, 'Y:', yPos, 'H:', height);
    }
  }, [position, args]);

  return (
    <group position={position}>
      {/* 면 렌더링 - 와이어프레임에서는 투명하게 */}
      {/* DXF 내보내기를 위해 mesh에도 이름 추가 */}
      <mesh
        name={isClothingRod ? 'clothing-rod-mesh' : isBackPanel ? `back-panel-mesh${panelName ? `-${panelName}` : ''}` : `furniture-mesh${panelName ? `-${panelName}` : ''}`}
        receiveShadow={viewMode === '3D' && renderMode === 'solid' && shadowEnabled}
        castShadow={viewMode === '3D' && renderMode === 'solid' && shadowEnabled}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <boxGeometry args={args} />
        {renderMode === 'wireframe' ? (
          // 와이어프레임 모드: 완전히 투명한 재질
          <meshBasicMaterial
            transparent={true}
            opacity={0}
          />
        ) : (
          // 솔리드 모드: processedMaterial에서 이미 2D 투명 처리 완료
          <primitive
            key={`${panelSpecificMaterial.uuid}-${viewMode}-${renderMode}`}
            object={panelSpecificMaterial}
            attach="material"
          />
        )}
      </mesh>
      {/* 윤곽선 렌더링 */}
      {!hideEdges && (() => {
        if (hideTopEdge || hideBottomEdge) {
          // 특정 엣지만 숨기기: 수동으로 선 그리기
          const [width, height, depth] = args;
          const halfW = width / 2;
          const halfH = height / 2;
          const halfD = depth / 2;

          const lines: [number, number, number][][] = [];

          // 앞면 사각형 (4개 엣지)
          if (!hideTopEdge) lines.push([[-halfW, halfH, halfD], [halfW, halfH, halfD]]); // 상단
          if (!hideBottomEdge) lines.push([[-halfW, -halfH, halfD], [halfW, -halfH, halfD]]); // 하단
          lines.push([[-halfW, -halfH, halfD], [-halfW, halfH, halfD]]); // 좌측
          lines.push([[halfW, -halfH, halfD], [halfW, halfH, halfD]]); // 우측

          // 뒷면 사각형 (4개 엣지)
          if (!hideTopEdge) lines.push([[-halfW, halfH, -halfD], [halfW, halfH, -halfD]]); // 상단
          if (!hideBottomEdge) lines.push([[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]]); // 하단
          lines.push([[-halfW, -halfH, -halfD], [-halfW, halfH, -halfD]]); // 좌측
          lines.push([[halfW, -halfH, -halfD], [halfW, halfH, -halfD]]); // 우측

          // 연결 엣지 (4개)
          if (!hideTopEdge) {
            lines.push([[-halfW, halfH, halfD], [-halfW, halfH, -halfD]]); // 좌상
            lines.push([[halfW, halfH, halfD], [halfW, halfH, -halfD]]); // 우상
          }
          if (!hideBottomEdge) {
            lines.push([[-halfW, -halfH, halfD], [-halfW, -halfH, -halfD]]); // 좌하
            lines.push([[halfW, -halfH, halfD], [halfW, -halfH, -halfD]]); // 우하
          }

          // DXF 내보내기를 위해 name 속성 추가
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
                    transparent={viewMode === '3D' || (isBackPanel && viewMode === '2D' && view2DDirection === 'front') || edgeOpacity !== undefined}
                    opacity={
                      edgeOpacity !== undefined
                        ? edgeOpacity
                        : isHighlighted
                          ? 1.0
                          : isBackPanel && viewMode === '2D' && view2DDirection === 'front'
                            ? 0.1
                            : viewMode === '3D'
                              ? 0.4
                              : 1
                    }
                    depthTest={viewMode === '3D'}
                    depthWrite={false}
                    linewidth={isHighlighted ? (viewMode === '2D' ? 4 : 3) : (isBackPanel && viewMode === '2D' ? 1 : viewMode === '2D' ? 2 : 1)}
                  />
                </line>
              ))}
            </>
          );
        } else {
          // 전체 엣지 표시
          // DXF 내보내기를 위해 name 속성 추가
          const edgeName = isClothingRod
            ? 'clothing-rod-edge'
            : isBackPanel
              ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
              : `furniture-edge${panelName ? `-${panelName}` : ''}`;
          return (
            <>
              <lineSegments name={edgeName}>
                <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
                <lineBasicMaterial
                  color={edgeColor}
                  transparent={viewMode === '3D' || (isBackPanel && viewMode === '2D' && view2DDirection === 'front') || edgeOpacity !== undefined}
                  opacity={
                    edgeOpacity !== undefined
                      ? edgeOpacity
                      : isHighlighted
                        ? 1.0
                        : isBackPanel && viewMode === '2D' && view2DDirection === 'front'
                          ? 0.1
                          : viewMode === '3D'
                            ? 0.4
                            : 1
                  }
                  depthTest={viewMode === '3D'}
                  depthWrite={false}
                  polygonOffset={viewMode === '3D'}
                  polygonOffsetFactor={viewMode === '3D' ? -10 : 0}
                  polygonOffsetUnits={viewMode === '3D' ? -10 : 0}
                  linewidth={isHighlighted ? (viewMode === '2D' ? 4 : 3) : (isBackPanel && viewMode === '2D' ? 1 : viewMode === '2D' ? 2 : 1)}
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
