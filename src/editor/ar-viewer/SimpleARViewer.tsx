import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import { useSearchParams } from 'react-router-dom';
import { getModuleById } from '@/data/modules';
import BoxModule from '@/editor/shared/viewer3d/components/modules/BoxModule';
import styles from './ARViewer.module.css';

interface ARData {
  projectId: string;
  spaceInfo: any;
  placedModules: any[];
  timestamp: number;
}

const SimpleARViewer: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [arData, setArData] = useState<ARData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(0.1);

  useEffect(() => {
    const arId = searchParams.get('id');
    if (arId) {
      try {
        const savedData = localStorage.getItem(`ar_data_${arId}`);
        if (savedData) {
          setArData(JSON.parse(savedData));
        } else {
          setError('AR 데이터를 찾을 수 없습니다.');
        }
      } catch (e) {
        setError('AR 데이터를 불러오는 중 오류가 발생했습니다.');
      }
    } else {
      setError('AR ID가 제공되지 않았습니다.');
    }
  }, [searchParams]);

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>오류</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!arData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p>AR 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  const { spaceInfo, placedModules } = arData;
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>3D 뷰어 (AR 미리보기)</h1>
        <p>HTTPS가 필요한 AR 대신 3D 뷰어로 가구 배치를 확인하세요</p>
      </div>

      <Canvas style={{ background: '#f0f0f0' }}>
        <PerspectiveCamera makeDefault position={[20, 20, 20]} />
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
        />
        
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
        
        <Grid 
          args={[30, 30]} 
          cellSize={1} 
          cellThickness={0.5} 
          cellColor="#6f6f6f" 
          sectionSize={5} 
          sectionThickness={1.5} 
          sectionColor="#9d9d9d" 
          fadeDistance={50} 
          fadeStrength={1} 
          followCamera={false} 
        />

        <group scale={[scale, scale, scale]}>
          {/* 바닥 표시 */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
            <planeGeometry args={[
              mmToThreeUnits(spaceInfo.width), 
              mmToThreeUnits(spaceInfo.depth || 1500)
            ]} />
            <meshStandardMaterial color="#ffffff" opacity={0.8} transparent />
          </mesh>

          {/* 배치된 가구들 */}
          {placedModules.map((placedModule) => {
            const moduleData = getModuleById(
              placedModule.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth || 1500 },
              spaceInfo
            );

            if (!moduleData) return null;

            return (
              <BoxModule
                key={placedModule.id}
                moduleData={moduleData}
                position={placedModule.position}
                rotation={placedModule.rotation}
                isSelected={false}
                isHovered={false}
                isDragging={false}
                hasDoor={placedModule.hasDoor}
                hingePosition={placedModule.hingePosition}
              />
            );
          })}
        </group>
      </Canvas>

      <div className={styles.controls}>
        <h3>뷰어 컨트롤</h3>
        <div className={styles.scaleControl}>
          <label>
            크기 조절: {(scale * 100).toFixed(0)}%
            <input
              type="range"
              min="1"
              max="100"
              value={scale * 100}
              onChange={(e) => setScale(Number(e.target.value) / 100)}
            />
          </label>
        </div>
        <div className={styles.info}>
          <p>마우스로 회전, 스크롤로 확대/축소</p>
          <p>공간: {spaceInfo.width} x {spaceInfo.height} x {spaceInfo.depth || 1500} mm</p>
          <p>가구: {placedModules.length}개</p>
        </div>
      </div>
    </div>
  );
};

export default SimpleARViewer;