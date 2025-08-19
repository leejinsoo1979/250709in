import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Box } from '@react-three/drei';
import * as THREE from 'three';
import { ModuleData } from '@/data/modules';

interface ModuleThumbnail3DProps {
  module: ModuleData;
  width?: number;
  height?: number;
}

// 간단한 3D 박스 컴포넌트
const SimpleBox: React.FC<{ module: ModuleData }> = ({ module }) => {
  // mm to Three.js units (1mm = 0.001 units)
  const width = module.dimensions.width * 0.001;
  const height = module.dimensions.height * 0.001;
  const depth = module.dimensions.depth * 0.001;
  
  // 색상 설정
  const color = module.color || '#8B4513';
  
  // 상부장인 경우 위치 조정
  const yPosition = module.category === 'upper' ? height / 2 : 0;
  
  return (
    <group position={[0, yPosition, 0]}>
      {/* 메인 박스 */}
      <Box args={[width, height, depth]}>
        <meshStandardMaterial color={color} />
      </Box>
      
      {/* 선반 표시 (간단한 라인) */}
      {module.modelConfig?.sections && module.modelConfig.sections.map((section, index) => {
        if (section.type === 'shelf' && section.count) {
          const shelfPositions = [];
          for (let i = 1; i < section.count; i++) {
            const y = -height/2 + (height / section.count) * i;
            shelfPositions.push(y);
          }
          
          return shelfPositions.map((yPos, idx) => (
            <Box 
              key={`shelf-${index}-${idx}`}
              args={[width - 0.036, 0.018, depth - 0.02]}
              position={[0, yPos, 0]}
            >
              <meshStandardMaterial color={color} opacity={0.8} transparent />
            </Box>
          ));
        }
        return null;
      })}
    </group>
  );
};

const ModuleThumbnail3D: React.FC<ModuleThumbnail3DProps> = ({ 
  module, 
  width = 150, 
  height = 150 
}) => {
  // 카메라 위치 계산
  const cameraPosition = useMemo(() => {
    const maxDim = Math.max(
      module.dimensions.width,
      module.dimensions.height,
      module.dimensions.depth
    ) * 0.001; // mm to units
    
    const distance = maxDim * 2.5;
    return [distance, distance * 0.7, distance] as [number, number, number];
  }, [module]);

  return (
    <div style={{ width, height, background: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
      <Canvas
        camera={{ position: cameraPosition, fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
          target={[0, 0, 0]}
        />

        {/* 조명 설정 */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={0.5} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        <Suspense fallback={null}>
          <SimpleBox module={module} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ModuleThumbnail3D;