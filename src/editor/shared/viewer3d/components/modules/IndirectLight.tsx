import React, { useEffect, useState } from 'react';
import * as THREE from 'three';

interface IndirectLightProps {
  width: number;
  depth: number;
  intensity: number;
  position: [number, number, number];
}

const IndirectLight: React.FC<IndirectLightProps> = ({ width, depth, intensity, position }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  
  useEffect(() => {
    console.log('🔍 IndirectLight 컴포넌트 마운트됨');
    const loader = new THREE.TextureLoader();
    
    // 여러 경로 시도
    const paths = [
      '/images/lighting/light3000k.png',
      './images/lighting/light3000k.png',
      'images/lighting/light3000k.png'
    ];
    
    let loaded = false;
    
    paths.forEach(path => {
      if (!loaded) {
        console.log('🔍 텍스처 로드 시도:', path);
        loader.load(
          path,
          (loadedTexture) => {
            if (!loaded) {
              loaded = true;
              console.log('✅ IndirectLight 텍스처 로드 성공:', path);
              loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
              loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
              setTexture(loadedTexture);
            }
          },
          undefined,
          (error) => {
            console.log('❌ 텍스처 로드 실패:', path, error);
          }
        );
      }
    });
    
    return () => {
      if (texture) {
        texture.dispose();
      }
    };
  }, []);

  // 텍스처가 로드되지 않았을 때 기본 색상 표시
  if (!texture) {
    console.log('⚠️ 텍스처 없음, 기본 색상 사용');
    return (
      <group position={position}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial 
            color={new THREE.Color(1, 0.95, 0.7)}
            transparent={true}
            opacity={intensity * 0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
            emissive={new THREE.Color(1, 0.9, 0.6)}
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial 
          map={texture}
          transparent={true}
          opacity={intensity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export default IndirectLight;