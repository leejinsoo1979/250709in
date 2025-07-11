import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Three.js 재질에 공통적으로 있는 텍스처 속성들의 타입 정의
interface MaterialWithTextures extends THREE.Material {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  bumpMap?: THREE.Texture;
  displacementMap?: THREE.Texture;
  specularMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  envMap?: THREE.Texture;
}

/**
 * 재질 해제 헬퍼 함수
 * @param material 해제할 THREE.js 재질
 */
const disposeMaterial = (material: THREE.Material) => {
  // 텍스처 해제
  const textureProps = [
    'map', 'normalMap', 'bumpMap', 'displacementMap', 
    'specularMap', 'emissiveMap', 'metalnessMap', 
    'roughnessMap', 'aoMap', 'envMap'
  ] as const;
  
  const materialWithTextures = material as MaterialWithTextures;
  
  textureProps.forEach(prop => {
    const texture = materialWithTextures[prop];
    if (texture instanceof THREE.Texture) {
      texture.dispose();
    }
  });
  
  // 재질 자체 해제
  material.dispose();
};

/**
 * Three.js 씬의 자원을 정리하는 컴포넌트
 * 컴포넌트 언마운트 시 모든 메쉬, 재질, 텍스처를 해제합니다.
 */
const SceneCleanup: React.FC = () => {
  const { gl, scene } = useThree();
  
  // 컴포넌트 언마운트 시 자원 정리
  useEffect(() => {
    return () => {
      // 씬 내의 모든 메쉬와 재질 해제
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) {
            object.geometry.dispose();
          }
          
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => {
                disposeMaterial(material);
              });
            } else {
              disposeMaterial(object.material);
            }
          }
        }
      });
      
      // 더 안전한 방식으로 Three.js 객체 정리
      try {
        // WebGL 렌더러의 내부 자원만 정리 (컨텍스트 손실은 하지 않음)
        const renderer = gl as THREE.WebGLRenderer;
        renderer.dispose();
        
        console.log('Three.js resources cleaned up');
      } catch (e) {
        console.warn('Failed to clean up Three.js resources:', e);
      }
      
      console.log('Scene cleanup completed');
    };
  }, [scene, gl]);
  
  return null;
};

export default SceneCleanup; 