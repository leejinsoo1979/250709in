import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useUIStore } from '@/store/uiStore';

interface OrthographicWallsProps {
  width: number;
  height: number;
  depth: number;
  viewMode: '2D' | '3D';
}

/**
 * 3D Orthographic 모드에서 카메라 각도에 따라 투명도가 변하는 벽/천장/바닥 컴포넌트
 */
const OrthographicWalls: React.FC<OrthographicWallsProps> = ({ width, height, depth, viewMode }) => {
  const { camera } = useThree();
  const { cameraMode } = useUIStore();
  
  // 각 면의 재질 참조
  const leftWallRef = useRef<THREE.MeshStandardMaterial>(null);
  const rightWallRef = useRef<THREE.MeshStandardMaterial>(null);
  const frontWallRef = useRef<THREE.MeshStandardMaterial>(null);
  const backWallRef = useRef<THREE.MeshStandardMaterial>(null);
  const ceilingRef = useRef<THREE.MeshStandardMaterial>(null);
  const floorRef = useRef<THREE.MeshStandardMaterial>(null);
  
  // 3D orthographic 모드에서만 동작
  const isOrthographic = viewMode === '3D' && cameraMode === 'orthographic';
  
  useFrame(() => {
    if (!isOrthographic) return;
    
    // 카메라 방향 벡터 계산
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // 카메라 위치
    const cameraPosition = camera.position;
    
    // 각 축에 대한 각도 계산
    const angleX = Math.atan2(cameraDirection.z, cameraDirection.y); // 상하 각도
    const angleY = Math.atan2(cameraDirection.x, cameraDirection.z); // 좌우 각도
    
    // 좌우 벽 투명도 조절
    if (leftWallRef.current && rightWallRef.current) {
      // 카메라가 왼쪽을 보면 왼쪽 벽 투명, 오른쪽을 보면 오른쪽 벽 투명
      const leftOpacity = Math.max(0.1, Math.min(1, 1 - Math.abs(angleY + Math.PI/2) / (Math.PI/2)));
      const rightOpacity = Math.max(0.1, Math.min(1, 1 - Math.abs(angleY - Math.PI/2) / (Math.PI/2)));
      
      leftWallRef.current.opacity = leftOpacity;
      rightWallRef.current.opacity = rightOpacity;
    }
    
    // 앞뒤 벽 투명도 조절
    if (frontWallRef.current && backWallRef.current) {
      // 카메라가 앞을 보면 앞 벽 투명, 뒤를 보면 뒤 벽 투명
      const frontOpacity = Math.max(0.1, Math.min(1, 1 - Math.abs(angleY) / (Math.PI/2)));
      const backOpacity = Math.max(0.1, Math.min(1, 1 - Math.abs(angleY - Math.PI) / (Math.PI/2)));
      
      frontWallRef.current.opacity = frontOpacity;
      backWallRef.current.opacity = backOpacity;
    }
    
    // 천장/바닥 투명도 조절
    if (ceilingRef.current && floorRef.current) {
      // 카메라가 위를 보면 천장 투명, 아래를 보면 바닥 투명
      const ceilingOpacity = Math.max(0.1, Math.min(1, 1 - Math.max(0, -angleX) / (Math.PI/4)));
      const floorOpacity = Math.max(0.1, Math.min(1, 1 - Math.max(0, angleX) / (Math.PI/4)));
      
      ceilingRef.current.opacity = ceilingOpacity;
      floorRef.current.opacity = floorOpacity;
    }
  });
  
  // 3D orthographic 모드가 아니면 렌더링하지 않음
  if (!isOrthographic) {
    return null;
  }
  
  // 그라데이션 텍스처 생성
  const createGradientTexture = (startColor: string, endColor: string, direction: 'horizontal' | 'vertical') => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    
    const gradient = direction === 'horizontal' 
      ? context.createLinearGradient(0, 0, 256, 0)
      : context.createLinearGradient(0, 0, 0, 256);
      
    gradient.addColorStop(0, startColor);
    gradient.addColorStop(0.5, `${startColor}88`);
    gradient.addColorStop(1, endColor);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  };
  
  return (
    <group>
      {/* 왼쪽 벽 */}
      <mesh position={[-width/2, height/2, 0]}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial
          ref={leftWallRef}
          map={createGradientTexture('#d8d8d8', '#ffffff00', 'vertical')}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 오른쪽 벽 */}
      <mesh position={[width/2, height/2, 0]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial
          ref={rightWallRef}
          map={createGradientTexture('#d8d8d8', '#ffffff00', 'vertical')}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 앞 벽 */}
      <mesh position={[0, height/2, depth/2]} rotation={[0, Math.PI/2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          ref={frontWallRef}
          map={createGradientTexture('#d8d8d8', '#ffffff00', 'vertical')}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 뒤 벽 */}
      <mesh position={[0, height/2, -depth/2]} rotation={[0, -Math.PI/2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          ref={backWallRef}
          map={createGradientTexture('#d8d8d8', '#ffffff00', 'vertical')}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 천장 */}
      <mesh position={[0, height, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          ref={ceilingRef}
          map={createGradientTexture('#e0e0e0', '#ffffff00', 'horizontal')}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 바닥 */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          ref={floorRef}
          map={createGradientTexture('#d0d0d0', '#ffffff00', 'horizontal')}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export default OrthographicWalls;