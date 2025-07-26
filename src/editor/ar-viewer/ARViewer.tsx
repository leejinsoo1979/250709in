import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, ARButton, useHitTest, Interactive } from '@react-three/xr';
import { useSearchParams } from 'react-router-dom';
import { getModuleById } from '@/data/modules';
import BoxModule from '@/editor/shared/viewer3d/components/modules/BoxModule';
import SimpleARViewer from './SimpleARViewer';
import * as THREE from 'three';
import styles from './ARViewer.module.css';

interface ARData {
  projectId: string;
  spaceInfo: any;
  placedModules: any[];
  timestamp: number;
}

// AR 공간에 배치된 가구
const PlacedFurniture: React.FC<{ 
  data: ARData; 
  position: THREE.Vector3;
  scale: number;
}> = ({ data, position, scale }) => {
  const { spaceInfo, placedModules } = data;

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* 바닥 표시 (옵션) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[
          mmToThreeUnits(spaceInfo.width) * scale, 
          mmToThreeUnits(spaceInfo.depth) * scale
        ]} />
        <meshBasicMaterial color="#f0f0f0" opacity={0.3} transparent />
      </mesh>

      {/* 배치된 가구들 */}
      {placedModules.map((placedModule) => {
        const moduleData = getModuleById(
          placedModule.moduleId,
          { width: spaceInfo.width, height: spaceInfo.height },
          spaceInfo
        );

        if (!moduleData) return null;

        return (
          <group
            key={placedModule.id}
            position={[
              placedModule.position.x * scale,
              placedModule.position.y * scale,
              placedModule.position.z * scale
            ]}
            rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
          >
            <BoxModule
              moduleData={moduleData}
              spaceInfo={spaceInfo}
              color={spaceInfo.materialConfig?.interiorColor}
              hasDoor={placedModule.hasDoor}
              customDepth={placedModule.customDepth}
              hingePosition={placedModule.hingePosition}
              originalSlotWidth={placedModule.adjustedWidth}
              viewMode="3D"
              renderMode="solid"
            />
          </group>
        );
      })}
    </group>
  );
};

// AR Hit Test 컴포넌트
const ARHitTest: React.FC<{ data: ARData }> = ({ data }) => {
  const [placed, setPlaced] = useState(false);
  const [position, setPosition] = useState<THREE.Vector3>(new THREE.Vector3());
  const [scale, setScale] = useState(0.5); // 기본 스케일

  useHitTest((hitMatrix) => {
    if (!placed) {
      // Hit test 결과를 위치로 변환
      const position = new THREE.Vector3();
      position.setFromMatrixPosition(hitMatrix);
      setPosition(position);
    }
  });

  const handlePlace = () => {
    setPlaced(true);
  };

  const handleScaleChange = (delta: number) => {
    setScale(prev => Math.max(0.1, Math.min(2, prev + delta)));
  };

  const handleReset = () => {
    setPlaced(false);
  };

  return (
    <>
      {/* 가구 배치 */}
      <PlacedFurniture 
        data={data} 
        position={position} 
        scale={scale}
      />

      {/* 터치 인터렉션 */}
      {!placed && (
        <mesh position={position} onPointerDown={handlePlace}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshBasicMaterial color="green" opacity={0.5} transparent />
        </mesh>
      )}

      {/* UI 오버레이는 Canvas 밖에서 처리 */}
    </>
  );
};

const ARViewer: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [arData, setArData] = useState<ARData | null>(null);
  const [error, setError] = useState<string>('');
  const [isARSupported, setIsARSupported] = useState(false);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    // HTTPS 및 WebXR 지원 확인
    const isHTTPS = window.location.protocol === 'https:';
    
    if (isHTTPS && 'xr' in navigator) {
      (navigator as any).xr.isSessionSupported('immersive-ar').then((supported: boolean) => {
        setIsARSupported(supported);
      });
    } else {
      setIsARSupported(false);
    }

    // AR 데이터 로드
    const arId = searchParams.get('id');
    if (arId) {
      try {
        // 로컬 스토리지에서 데이터 가져오기 (실제로는 서버에서)
        const dataStr = localStorage.getItem(`ar_data_${arId}`);
        if (dataStr) {
          const data = JSON.parse(dataStr);
          setArData(data);
        } else {
          setError('AR 데이터를 찾을 수 없습니다.');
        }
      } catch (err) {
        setError('AR 데이터 로드 중 오류가 발생했습니다.');
      }
    } else {
      setError('유효하지 않은 AR 링크입니다.');
    }
  }, [searchParams]);

  if (error) {
    return (
      <div className={styles.error}>
        <h2>오류</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!isARSupported) {
    // HTTPS가 아니거나 AR이 지원되지 않으면 Simple 3D Viewer 사용
    const isHTTPS = window.location.protocol === 'https:';
    if (!isHTTPS) {
      return <SimpleARViewer />;
    }
    
    return (
      <div className={styles.notSupported}>
        <h2>AR이 지원되지 않습니다</h2>
        <p>이 기기 또는 브라우저는 WebXR AR을 지원하지 않습니다.</p>
        <ul>
          <li>iOS: Safari 사용</li>
          <li>Android: Chrome 사용</li>
          <li>HTTPS 연결 필요</li>
        </ul>
      </div>
    );
  }

  if (!arData) {
    return (
      <div className={styles.loading}>
        <p>AR 데이터 로드 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ARButton 
        className={styles.arButton}
        sessionInit={{
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay', 'dom-overlay-for-handheld-ar'],
          domOverlay: { root: document.body }
        }}
      />

      <Canvas>
        <XR referenceSpace="local">
          <Suspense fallback={null}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <ARHitTest data={arData} />
          </Suspense>
        </XR>
      </Canvas>

      <div className={styles.controls}>
        <h3>가구 배치 도구</h3>
        <div className={styles.scaleControl}>
          <label>크기 조절</label>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
          />
          <span>{(scale * 100).toFixed(0)}%</span>
        </div>
        <div className={styles.instructions}>
          <p>평평한 바닥을 찾아 탭하여 가구를 배치하세요</p>
        </div>
      </div>
    </div>
  );
};

export default ARViewer;