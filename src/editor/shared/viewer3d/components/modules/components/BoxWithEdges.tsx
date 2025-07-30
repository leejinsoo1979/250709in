import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';

interface BoxWithEdgesProps {
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
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
  isDragging = false 
}) => {
  const { viewMode } = useSpace3DView();
  const { gl } = useThree();
  const { theme } = useTheme();
  const { view2DTheme } = useUIStore();
  
  // 드래그 중일 때는 이미 처리된 재질 그대로 사용
  const processedMaterial = React.useMemo(() => {
    return material;
  }, [material]);

  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh receiveShadow={viewMode === '3D'} castShadow={viewMode === '3D'}>
          <boxGeometry args={args} />
          <primitive object={processedMaterial} attach="material" />
        </mesh>
      )}
      {/* 윤곽선 렌더링 */}
      {viewMode === '3D' ? (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color="#505050"
            transparent={true}
            opacity={0.9}
            depthTest={true}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        </lineSegments>
      ) : (
        ((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
            <lineBasicMaterial 
              color={
                renderMode === 'wireframe' 
                  ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") 
                  : (view2DTheme === 'dark' ? "#666666" : "#444444")
              } 
              linewidth={2} 
            />
          </lineSegments>
        )
      )}
    </group>
  );
};

export default BoxWithEdges;