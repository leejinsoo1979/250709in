import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';

// 떠다니는 3D 도형 컴포넌트
function FloatingShape({ position, color, scale = 1 }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { mouse } = useThree();
  
  useFrame((state) => {
    if (!meshRef.current) return;
    
    // 마우스 위치에 따른 반응
    const x = (mouse.x * state.viewport.width) / 2;
    const y = (mouse.y * state.viewport.height) / 2;
    
    meshRef.current.position.x = position[0] + x * 0.1;
    meshRef.current.position.y = position[1] + y * 0.1;
    
    // 부드러운 회전
    meshRef.current.rotation.x += 0.01;
    meshRef.current.rotation.y += 0.01;
  });

  return (
    <Float
      speed={2}
      rotationIntensity={0.5}
      floatIntensity={0.5}
      floatingRange={[-0.1, 0.1]}
    >
      <mesh ref={meshRef} position={position} scale={scale}>
        <icosahedronGeometry args={[1, 4]} />
        <MeshDistortMaterial
          color={color}
          speed={5}
          distort={0.3}
          radius={1}
          opacity={0.8}
          transparent
        />
      </mesh>
    </Float>
  );
}

// 파티클 시스템
function ParticleField() {
  const points = useRef<THREE.Points>(null);
  const particlesCount = 100;
  
  const positions = React.useMemo(() => {
    const positions = new Float32Array(particlesCount * 3);
    
    for (let i = 0; i < particlesCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    
    return positions;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    
    points.current.rotation.x = state.clock.elapsedTime * 0.05;
    points.current.rotation.y = state.clock.elapsedTime * 0.05;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particlesCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#ffffff"
        opacity={0.6}
        transparent
        sizeAttenuation
      />
    </points>
  );
}

// 메인 3D 씬
function Scene() {
  return (
    <>
      {/* 조명 설정 */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#764ba2" />
      
      {/* 떠다니는 도형들 */}
      <FloatingShape position={[-2, 2, 0]} color="#764ba2" scale={1.5} />
      <FloatingShape position={[3, -1, -2]} color="#667eea" scale={1} />
      <FloatingShape position={[-3, -2, 1]} color="#8b5cf6" scale={0.8} />
      <FloatingShape position={[2, 1, -1]} color="#a78bfa" scale={1.2} />
      
      {/* 파티클 필드 */}
      <ParticleField />
      
      {/* 배경 안개 효과 */}
      <fog attach="fog" args={['#6B5EFF', 5, 15]} />
    </>
  );
}

// 인터랙티브 3D 배경 컴포넌트
export const Interactive3DBackground: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
};