import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useViewerTheme } from '../../../context/ViewerThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useTheme } from '@/contexts/ThemeContext';
import { getDefaultGrainDirection } from '@/editor/shared/utils/materialConstants';
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
  const { viewMode } = useSpace3DView();
  const { view2DDirection, shadowEnabled } = useUIStore(); // view2DDirection, shadowEnabled 추가
  const { gl } = useThree();
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
  const { theme: appTheme } = useTheme();

  // 스토어에서 직접 panelGrainDirections 가져오기 (실시간 업데이트 보장)
  const storePanelGrainDirections = useFurnitureStore(
    React.useCallback(
      (state) => {
        if (!furnitureId) {
          return undefined;
        }
        const furniture = state.placedModules.find(m => m.id === furnitureId);
        return furniture?.panelGrainDirections;
      },
      [furnitureId]
    )
  );

  // 스토어에서 가져온 값 우선, 없으면 props 사용
  const activePanelGrainDirections = storePanelGrainDirections || panelGrainDirections;

  // 디버그 로그
  if (panelName && (panelName.includes('상판') || panelName.includes('하판') || panelName.includes('선반'))) {
    console.log('🔥 BoxWithEdges - panelGrainDirections 소스:', {
      panelName,
      furnitureId,
      fromStore: !!storePanelGrainDirections,
      fromProps: !!panelGrainDirections,
      final: activePanelGrainDirections,
      storeValue: storePanelGrainDirections,
      propsValue: panelGrainDirections
    });
  }
  
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
  const processedMaterial = React.useMemo(() => {
    // MeshBasicMaterial인 경우 (프레임 형광색 등) 그대로 사용
    if (baseMaterial instanceof THREE.MeshBasicMaterial) {
      return baseMaterial;
    }

    // 2D 솔리드 모드에서 캐비넷을 투명하게 처리 (옷봉 제외)
    if (viewMode === '2D' && renderMode === 'solid' && baseMaterial instanceof THREE.MeshStandardMaterial && !isClothingRod) {
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

  // 패널별 개별 material 생성 (텍스처 회전 적용) - 항상 새로 생성
  const panelSpecificMaterial = React.useMemo(() => {
    console.log('🔍 panelSpecificMaterial useMemo 실행:', {
      panelName,
      textureUrl,
      hasMaterial: !!processedMaterial,
      isStandardMaterial: processedMaterial instanceof THREE.MeshStandardMaterial,
      hasMapTexture: processedMaterial instanceof THREE.MeshStandardMaterial ? !!processedMaterial.map : false,
      activePanelGrainDirectionsStr
    });

    // panelName이 없으면 processedMaterial 그대로 사용
    if (!panelName || !(processedMaterial instanceof THREE.MeshStandardMaterial)) {
      console.log('⚠️ panelName 없음 또는 MeshStandardMaterial 아님 - processedMaterial 반환');
      return processedMaterial;
    }

    // 텍스처가 없으면 processedMaterial 그대로 사용 (textureUrl 체크 대신 map 체크)
    if (!processedMaterial.map) {
      console.log('⚠️ processedMaterial에 텍스처(map) 없음 - processedMaterial 반환');
      return processedMaterial;
    }

    // 패널의 결 방향 결정 (설정값 또는 기본값)
    // activePanelGrainDirections 객체에서 부분 매칭으로 찾기
    let grainDirection: 'horizontal' | 'vertical' | undefined;

    if (activePanelGrainDirections) {
      // 정확히 일치하는 키가 있는지 먼저 확인
      if (activePanelGrainDirections[panelName]) {
        grainDirection = activePanelGrainDirections[panelName];
      } else {
        // 부분 매칭: activePanelGrainDirections의 키가 panelName에 포함되어 있는지 확인
        const matchingKey = Object.keys(activePanelGrainDirections).find(key =>
          panelName.includes(key) || key.includes(panelName)
        );
        if (matchingKey) {
          grainDirection = activePanelGrainDirections[matchingKey];
        }
      }
    }

    // 설정값이 없으면 기본값 사용
    const usedDefault = !grainDirection;
    if (!grainDirection) {
      grainDirection = getDefaultGrainDirection(panelName);
    }

    if (panelName && (panelName.includes('상판') || panelName.includes('하판') || panelName.includes('선반'))) {
      console.log('🎨 BoxWithEdges - 패널별 material 생성:', {
        panelName,
        grainDirection,
        usedDefault,
        textureUrl,
        hasTexture: !!processedMaterial.map,
        activePanelGrainDirectionsKeys: activePanelGrainDirections ? Object.keys(activePanelGrainDirections) : [],
        activePanelGrainDirectionsStr
      });
    }

    // processedMaterial을 복제하여 개별 material 생성 (항상 새로 생성)
    const panelMaterial = processedMaterial.clone();

    // 텍스처가 있는 경우 회전 적용
    if (panelMaterial.map) {
      // 텍스처도 clone하여 각 패널마다 독립적인 텍스처 인스턴스 생성
      const texture = panelMaterial.map.clone();

      // clone된 텍스처의 rotation을 0으로 리셋 (clone은 기존 rotation을 복사함)
      texture.rotation = 0;
      texture.center.set(0.5, 0.5);

      texture.needsUpdate = true;
      panelMaterial.map = texture;

      // 항상 새로운 회전값 계산 (패널별 올바른 회전 적용)
      console.log('🔄 텍스처 회전 적용:', {
        panelName,
        grainDirection
      });

      // 백패널과 캐비넷 측판 (정상 - 유지)
      const isFurnitureSidePanel = panelName && !panelName.includes('서랍') &&
        (panelName.includes('측판') || panelName.includes('좌측') || panelName.includes('우측'));
      const isBackPanel = panelName && panelName.includes('백패널');

      if (isFurnitureSidePanel || isBackPanel) {
        // 좌우측판, 백패널: L(vertical) = 0도, W(horizontal) = 90도 (정상 유지)
        if (grainDirection === 'vertical') {
          texture.rotation = 0;
          texture.center.set(0.5, 0.5);
          console.log('  ✅ 측판/백패널 L: 0도 (정상)');
        } else {
          texture.rotation = Math.PI / 2;
          texture.center.set(0.5, 0.5);
          console.log('  ✅ 측판/백패널 W: 90도 (정상)');
        }
      } else {
        // 나머지 모든 패널: L(vertical) = 90도, W(horizontal) = 0도
        if (grainDirection === 'vertical') {
          texture.rotation = Math.PI / 2; // 90도
          texture.center.set(0.5, 0.5);
          console.log('  ✅ 패널 L: 90도');
        } else {
          texture.rotation = 0;
          texture.center.set(0.5, 0.5);
          console.log('  ✅ 패널 W: 0도');
        }
      }

      texture.needsUpdate = true;
      panelMaterial.needsUpdate = true;

      console.log('✅ 텍스처 회전 적용:', {
        panelName,
        grainDirection,
        rotation: texture.rotation,
        rotationDegrees: (texture.rotation * 180 / Math.PI).toFixed(0) + '°'
      });
    }

    return panelMaterial;
  }, [processedMaterial, textureUrl, panelName, activePanelGrainDirectionsStr]);

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

      console.log('🎨 BoxWithEdges - MeshBasicMaterial 엣지 색상:', {
        color,
        viewMode,
        renderMode,
        position
      });
      return color;
    }

    // 강조 상태일 때는 2D/3D 모드에 따라 다른 색상 사용
    if (isHighlighted) {
      if (viewMode === '2D') {
        // 2D 모드에서는 형광색 (neon green)
        return "#18CF23";
      } else {
        // 3D 모드에서는 테마 색상
        return highlightColor;
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
  }, [viewMode, renderMode, view2DTheme, view2DDirection, baseMaterial, isHighlighted, highlightColor]);

  // 디버깅: 2D 솔리드 모드에서 색상 확인
  React.useEffect(() => {
    if (viewMode === '2D' && renderMode === 'solid') {
      console.log('🎨 BoxWithEdges 2D 솔리드 모드:', {
        edgeColor,
        view2DTheme,
        transparent: viewMode === '3D',
        opacity: viewMode === '3D' ? 0.9 : 1,
        position
      });
    }
  }, [viewMode, renderMode, edgeColor, view2DTheme, position]);

  return (
    <group position={position}>
      {/* 면 렌더링 - 와이어프레임에서는 투명하게 */}
      <mesh 
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
          <primitive key={panelSpecificMaterial.uuid} object={panelSpecificMaterial} attach="material" />
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

          return (
            <>
              {lines.map((line, i) => (
                <line key={i}>
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
                              ? 0.9
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
          return (
            <>
              <lineSegments>
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
                            ? 0.9
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
