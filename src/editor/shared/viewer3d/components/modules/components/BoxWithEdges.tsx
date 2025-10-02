import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useViewerTheme } from '../../../context/ViewerThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Edges } from '@react-three/drei';

interface BoxWithEdgesProps {
  args: [number, number, number];
  position: [number, number, number];
  material?: THREE.Material; // material을 optional로 변경
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean; // 편집 모드 여부 추가
  hideEdges?: boolean; // 엣지 숨김 옵션 추가
  isBackPanel?: boolean; // 백패널 여부 추가
  isEndPanel?: boolean; // 엔드패널 여부 추가
  isHighlighted?: boolean; // 강조 상태 추가
  onClick?: (e: any) => void;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
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
  isBackPanel = false,
  isEndPanel = false,
  isHighlighted = false,
  onClick,
  onPointerOver,
  onPointerOut
}) => {
  const { viewMode } = useSpace3DView();
  const { view2DDirection, shadowEnabled } = useUIStore(); // view2DDirection, shadowEnabled 추가
  const { gl } = useThree();
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
  const { theme: appTheme } = useTheme();
  
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
    // 2D 솔리드 모드에서 캐비넷을 투명하게 처리
    if (viewMode === '2D' && renderMode === 'solid' && baseMaterial instanceof THREE.MeshStandardMaterial) {
      const transparentMaterial = baseMaterial.clone();
      transparentMaterial.transparent = true;
      transparentMaterial.opacity = 0.1;  // 매우 투명하게 (10% 불투명도)
      transparentMaterial.depthWrite = false;
      transparentMaterial.needsUpdate = true;
      return transparentMaterial;
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
  }, [baseMaterial, isDragging, isEditMode, viewMode, renderMode]);

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
    // 강조 상태일 때는 테마 색상 사용
    if (isHighlighted) {
      return highlightColor;
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
          <primitive key={processedMaterial.uuid} object={processedMaterial} attach="material" />
        )}
      </mesh>
      {/* 윤곽선 렌더링 */}
      {!hideEdges && (
        <>
          {isHighlighted && (
            // 강조 상태일 때 추가 발광 효과
            <Edges
              color={highlightColor}
              scale={1.001}
              threshold={15}
              linewidth={3}
            />
          )}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
            <lineBasicMaterial 
              color={edgeColor}
              transparent={viewMode === '3D' || (isBackPanel && viewMode === '2D' && view2DDirection === 'front')}
              opacity={
                isHighlighted
                  ? 1.0  // 강조 상태일 때는 불투명
                  : isBackPanel && viewMode === '2D' && view2DDirection === 'front' 
                    ? 0.1  // 2D 정면 뷰에서 백패널은 매우 투명하게
                    : viewMode === '3D' 
                      ? 0.9
                      : 1
              }
              depthTest={viewMode === '3D'}
              depthWrite={false}
              polygonOffset={viewMode === '3D'}
              polygonOffsetFactor={viewMode === '3D' ? -10 : 0}
              polygonOffsetUnits={viewMode === '3D' ? -10 : 0}
              linewidth={isHighlighted ? 3 : (viewMode === '2D' ? 2 : 1)} 
            />
          </lineSegments>
        </>
      )}
    </group>
  );
};

export default BoxWithEdges;