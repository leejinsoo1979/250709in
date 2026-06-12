import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Space3DViewProvider } from '@/editor/shared/viewer3d/context/Space3DViewContext';
import BoxModule from '@/editor/shared/viewer3d/components/modules/BoxModule';
import { DEFAULT_SPACE_CONFIG, type SpaceInfo } from '@/store/core/spaceConfigStore';
import type { ModuleData } from '@/data/modules';

const mmToThreeUnits = (mm: number) => mm * 0.01;

/**
 * 모듈빌더 실시간 미리보기 — 실제 뷰어 렌더 파이프라인(BoxModule)을 그대로 사용한다.
 * 간이 모델이 아닌 실배치와 동일한 메시(측판/선반/서랍/백패널/도어)가 표시되므로
 * "프리뷰 = 배치 결과"가 보장된다.
 */
const AdminModulePreview = ({ moduleData }: { moduleData: ModuleData }) => {
  const { width, height, depth } = moduleData.dimensions;

  // BoxModule이 참조할 가상 공간 — 모듈 치수를 감싸는 크기로 구성
  const previewSpaceInfo = useMemo<SpaceInfo>(() => ({
    ...DEFAULT_SPACE_CONFIG,
    width: Math.max(width + 200, 1200),
    height: Math.max(height + 100, 1500),
    depth: Math.max(depth + 100, 700)
  }), [width, height, depth]);

  const maxDim = Math.max(width, height, depth);
  const cameraDistance = Math.max(mmToThreeUnits(maxDim) * 1.6, 18);
  const centerY = mmToThreeUnits(height) / 2;

  return (
    <Space3DViewProvider
      spaceInfo={previewSpaceInfo}
      svgSize={{ width: 800, height: 600 }}
      renderMode="solid"
      viewMode="3D"
    >
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#f8fafc']} />
        <PerspectiveCamera
          makeDefault
          position={[cameraDistance * 0.7, centerY + cameraDistance * 0.3, cameraDistance]}
          fov={34}
        />
        <OrbitControls
          target={[0, centerY, 0]}
          enableDamping
          dampingFactor={0.08}
          minDistance={cameraDistance * 0.3}
          maxDistance={cameraDistance * 3}
        />
        <ambientLight intensity={0.65} />
        <directionalLight position={[5, 12, 8]} intensity={1.4} castShadow />
        <directionalLight position={[-6, 6, -4]} intensity={0.4} />
        <gridHelper args={[40, 40, '#cbd5e1', '#e2e8f0']} />
        <Suspense fallback={null}>
          <group position={[0, centerY, 0]}>
            <BoxModule
              key={moduleData.id}
              moduleData={moduleData}
              color={moduleData.color}
              spaceInfo={previewSpaceInfo}
              hasDoor={moduleData.hasDoor === true}
              viewMode="3D"
              renderMode="solid"
              showFurniture
            />
          </group>
        </Suspense>
      </Canvas>
    </Space3DViewProvider>
  );
};

export default AdminModulePreview;
