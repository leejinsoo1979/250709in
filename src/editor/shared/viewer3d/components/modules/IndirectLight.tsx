import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';

interface IndirectLightProps {
  width: number;
  depth: number;
  intensity: number;
  position: [number, number, number];
}

const IndirectLight: React.FC<IndirectLightProps> = ({ width, depth, intensity, position }) => {
  const { viewMode, renderMode } = useSpace3DView();
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loadError, setLoadError] = useState(false);

  // 2D 모드 또는 wireframe 모드에서는 렌더링하지 않음
  if (viewMode === '2D' || renderMode === 'wireframe') {
    return null;
  }
  
  useEffect(() => {
    console.log('🔍 IndirectLight 컴포넌트 마운트됨', { width, depth, intensity, position });
    
    // 먼저 이미지가 실제로 로드 가능한지 확인
    const img = new Image();
    img.onload = () => {
      console.log('✅ 이미지 로드 성공 (HTML Image):', img.width, 'x', img.height);
      
      // 이미지 로드 성공 시 Three.js 텍스처로 변환
      const loader = new THREE.TextureLoader();
      const imagePath = '/images/lighting/light3000k.png';
      
      loader.load(
        imagePath,
        (loadedTexture) => {
          console.log('✅ Three.js 텍스처 로드 성공');
          loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
          loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
          loadedTexture.repeat.set(1, 1);
          loadedTexture.needsUpdate = true;
          setTexture(loadedTexture);
        },
        (progress) => {
          console.log('⏳ 텍스처 로딩 중...', progress);
        },
        (error) => {
          console.error('❌ Three.js 텍스처 로드 실패:', error);
          setLoadError(true);
        }
      );
    };
    
    img.onerror = (error) => {
      console.error('❌ HTML 이미지 로드 실패:', error);
      setLoadError(true);
    };
    
    img.src = '/images/lighting/light3000k.png';
    
    return () => {
      if (texture) {
        texture.dispose();
      }
    };
  }, []);

  // 렌더링
  console.log('🎨 IndirectLight 렌더링 위치:', { 
    hasTexture: !!texture, 
    loadError,
    width, 
    depth, 
    intensity,
    position,
    y위치: position[1]
  });

  // 텍스처가 로드되지 않았으면 렌더링하지 않음
  if (!texture) {
    return null;
  }

  // 실제 간접조명 렌더링
  return (
    <group position={position}>
      {/* 간접조명 효과 - X축으로 180도 회전하여 아래로 향하게 */}
      <mesh rotation={[Math.PI, 0, 0]} renderOrder={-1} frustumCulled={false}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial 
          map={texture}
          color={new THREE.Color(1, 0.6, 0.2)} // 더 진한 오렌지색
          transparent={true}
          opacity={intensity * 0.5} // 투명도를 0.6에서 0.5로 낮춤
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={true}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
};

export default IndirectLight;