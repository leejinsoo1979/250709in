import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useViewerTheme } from '../../../context/ViewerThemeContext';
import { useUIStore } from '@/store/uiStore';

interface BoxWithEdgesProps {
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean; // 편집 모드 여부 추가
  hideEdges?: boolean; // 엣지 숨김 옵션 추가
  isBackPanel?: boolean; // 백패널 여부 추가
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
  onClick,
  onPointerOver,
  onPointerOut
}) => {
  const { viewMode } = useSpace3DView();
  const { view2DDirection } = useUIStore(); // view2DDirection 추가
  const { gl } = useThree();
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
  
  // 드래그 중이거나 편집 모드일 때 고스트 효과 적용
  const processedMaterial = React.useMemo(() => {
    if ((isDragging || isEditMode) && material instanceof THREE.MeshStandardMaterial) {
      const ghostMaterial = material.clone();
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = isEditMode ? 0.2 : 0.6;
      
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
      if (isEditMode) {
        ghostMaterial.emissive = new THREE.Color(getThemeColor());
        ghostMaterial.emissiveIntensity = 0.1;
        ghostMaterial.depthWrite = false;
      }
      ghostMaterial.needsUpdate = true;
      return ghostMaterial;
    }
    return material;
  }, [material, isDragging, isEditMode]);

  // 엣지 색상 결정
  const edgeColor = React.useMemo(() => {
    if (viewMode === '3D') {
      return "#505050"; // 3D 모드에서는 회색 엣지
    } else if (renderMode === 'wireframe') {
      return "#ff5500"; // 2D 와이어프레임에서는 주황색
    } else {
      // 2D 솔리드 모드
      if (view2DDirection === 'front') {
        // 정면 뷰에서는 선반과 동일한 색상
        return view2DTheme === 'dark' ? "#999999" : "#444444";
      } else {
        // 다른 뷰에서는 기본 색상
        return view2DTheme === 'dark' ? "#999999" : "#444444";
      }
    }
  }, [viewMode, renderMode, view2DTheme, view2DDirection]);

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
        receiveShadow={viewMode === '3D' && renderMode === 'solid'} 
        castShadow={viewMode === '3D' && renderMode === 'solid'}
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
          <primitive object={processedMaterial} attach="material" />
        )}
      </mesh>
      {/* 윤곽선 렌더링 */}
      {!hideEdges && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color={
              viewMode === '3D' 
                ? "#505050"  // 3D에서는 항상 회색
                : renderMode === 'wireframe' 
                  ? "#ff5500"  // 2D wireframe 모드에서는 테마 색상
                  : (view2DTheme === 'dark' ? "#999999" : "#444444")
            }
            transparent={viewMode === '3D' || (isBackPanel && viewMode === '2D' && view2DDirection === 'front')}
            opacity={
              isBackPanel && viewMode === '2D' && view2DDirection === 'front' 
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
            linewidth={viewMode === '2D' ? 2 : 1} 
          />
        </lineSegments>
      )}
    </group>
  );
};

export default BoxWithEdges;