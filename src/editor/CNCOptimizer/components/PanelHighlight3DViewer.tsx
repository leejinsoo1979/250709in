import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore, SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/utils/indexing';
import BoxModule from '@/editor/shared/viewer3d/components/modules/BoxModule';
import { Space3DViewProvider } from '@/editor/shared/viewer3d/context/Space3DViewContext';
import { ViewerThemeProvider } from '@/editor/shared/viewer3d/context/ViewerThemeContext';
import { PlacedModule } from '@/editor/shared/furniture/types';
import styles from './PanelHighlight3DViewer.module.css';

interface PanelHighlight3DViewerProps {
  highlightedPanelName: string | null;
  highlightedFurnitureId: string | null;
}

/** WebGL ErrorBoundary — Canvas 생성 실패 시 fallback UI */
class WebGLErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[PanelHighlight3DViewer] WebGL error caught:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/** 카메라 자동 위치 조정 컴포넌트 — 전체 가구가 화면에 들어오도록 */
const CameraFitter: React.FC<{ targetSize: THREE.Vector3; center: THREE.Vector3 }> = ({ targetSize, center }) => {
  const { camera } = useThree();

  useEffect(() => {
    const maxDim = Math.max(targetSize.x, targetSize.y, targetSize.z);
    const distance = maxDim * 2.0;
    camera.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.45,
      center.z + distance * 0.9
    );
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix();
  }, [targetSize, center, camera]);

  return null;
};

/** 비하이라이트 패널 반투명 처리 (scene traverse) */
const PanelDimmer: React.FC<{
  highlightedPanelId: string | null;
}> = ({ highlightedPanelId }) => {
  const { scene } = useThree();
  const originalMaterials = useRef<Map<string, { opacity: number; transparent: boolean; emissive: THREE.Color; emissiveIntensity: number }>>(new Map());

  useEffect(() => {
    // 원본 머티리얼 속성 저장 (최초 1회)
    if (originalMaterials.current.size === 0) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          originalMaterials.current.set(obj.uuid, {
            opacity: obj.material.opacity,
            transparent: obj.material.transparent,
            emissive: obj.material.emissive.clone(),
            emissiveIntensity: obj.material.emissiveIntensity,
          });
        }
      });
    }

    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;

      const original = originalMaterials.current.get(obj.uuid);
      if (!original) return;

      if (!highlightedPanelId) {
        // 하이라이트 없음 → 원래 상태 복원
        mat.opacity = original.opacity;
        mat.transparent = original.transparent;
        mat.emissive.copy(original.emissive);
        mat.emissiveIntensity = original.emissiveIntensity;
        mat.needsUpdate = true;
        return;
      }

      // highlightedPanel이 설정되면 UIStore 시스템이 하이라이트 처리함
      // 여기서는 나머지 패널만 반투명 처리
      const meshName = obj.name || '';
      const isHighlighted = meshName.includes(highlightedPanelId.split('-').slice(1).join('-'));

      if (isHighlighted) {
        // 하이라이트된 패널: 강조
        mat.opacity = 1;
        mat.transparent = false;
        mat.emissive.set(0x2266cc);
        mat.emissiveIntensity = 0.4;
      } else {
        // 나머지: 반투명
        mat.opacity = 0.12;
        mat.transparent = true;
        mat.emissive.copy(original.emissive);
        mat.emissiveIntensity = 0;
      }
      mat.needsUpdate = true;
    });

    return () => {
      // cleanup: 원래 상태로 복원
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        const original = originalMaterials.current.get(obj.uuid);
        if (!original) return;
        mat.opacity = original.opacity;
        mat.transparent = original.transparent;
        mat.emissive.copy(original.emissive);
        mat.emissiveIntensity = original.emissiveIntensity;
        mat.needsUpdate = true;
      });
    };
  }, [highlightedPanelId, scene]);

  return null;
};

/** 단일 가구 렌더러 */
const FurnitureRenderer: React.FC<{
  placedModule: PlacedModule;
  spaceInfo: SpaceInfo;
}> = ({ placedModule, spaceInfo }) => {
  const internalSpace = useMemo(
    () => calculateInternalSpace(spaceInfo),
    [spaceInfo]
  );

  const moduleData = useMemo(() => {
    return (
      (placedModule as any).moduleData ||
      getModuleById(placedModule.moduleId, internalSpace, spaceInfo) ||
      buildModuleDataFromPlacedModule(placedModule)
    );
  }, [placedModule, internalSpace, spaceInfo]);

  if (!moduleData) return null;

  const pm = placedModule as any;

  // customSections 반영
  const finalModuleData = useMemo(() => {
    if (pm.customSections && moduleData.modelConfig) {
      return {
        ...moduleData,
        modelConfig: {
          ...moduleData.modelConfig,
          sections: pm.customSections,
        },
      };
    }
    return moduleData;
  }, [moduleData, pm.customSections]);

  const width = pm.width || finalModuleData.dimensions.width;
  const depth = pm.depth || finalModuleData.dimensions.depth;

  return (
    <BoxModule
      moduleData={finalModuleData}
      viewMode="3D"
      renderMode="solid"
      placedFurnitureId={placedModule.id}
      spaceInfo={spaceInfo}
      hasDoor={placedModule.hasDoor ?? false}
      customDepth={depth}
      adjustedWidth={width}
      panelGrainDirections={placedModule.panelGrainDirections}
      backPanelThickness={pm.backPanelThickness}
      isCustomizable={pm.isCustomizable}
      customConfig={pm.customConfig}
      customSections={pm.customSections}
      lowerSectionDepth={pm.lowerSectionDepth}
      upperSectionDepth={pm.upperSectionDepth}
      lowerSectionDepthDirection={pm.lowerSectionDepthDirection}
      upperSectionDepthDirection={pm.upperSectionDepthDirection}
    />
  );
};

/** Canvas 내부 3D Scene */
const Scene3D: React.FC<{
  spaceInfo: SpaceInfo;
  placedModules: PlacedModule[];
  targetSize: THREE.Vector3;
  targetCenter: THREE.Vector3;
  highlightedPanelId: string | null;
}> = ({ spaceInfo, placedModules, targetSize, targetCenter, highlightedPanelId }) => {
  return (
    <Suspense fallback={null}>
      <ViewerThemeProvider viewMode="3D">
        <Space3DViewProvider
          spaceInfo={spaceInfo}
          svgSize={{ width: 400, height: 225 }}
          renderMode="solid"
          viewMode="3D"
        >
          {/* 조명 */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 8]} intensity={1.8} />
          <directionalLight position={[-3, 5, -5]} intensity={0.4} />

          {/* 카메라 자동 맞춤 */}
          <CameraFitter targetSize={targetSize} center={targetCenter} />

          {/* 궤도 컨트롤 */}
          <OrbitControls
            {...{
              enablePan: true,
              enableZoom: true,
              enableRotate: true,
              minDistance: 0.3,
              maxDistance: 15,
              target: [targetCenter.x, targetCenter.y, targetCenter.z],
            } as any}
          />

          {/* 가구 렌더링 */}
          {placedModules.map((pm) => (
            <FurnitureRenderer
              key={pm.id}
              placedModule={pm}
              spaceInfo={spaceInfo}
            />
          ))}

          {/* 반투명 처리 (UIStore 하이라이트 보완) */}
          <PanelDimmer highlightedPanelId={highlightedPanelId} />
        </Space3DViewProvider>
      </ViewerThemeProvider>
    </Suspense>
  );
};

const PanelHighlight3DViewer: React.FC<PanelHighlight3DViewerProps> = ({
  highlightedPanelName,
  highlightedFurnitureId,
}) => {
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const setHighlightedPanel = useUIStore((state) => state.setHighlightedPanel);

  // 지연 마운트: 이전 WebGL 컨텍스트 정리 대기
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // UIStore 하이라이트 동기화
  useEffect(() => {
    if (highlightedPanelName && highlightedFurnitureId) {
      setHighlightedPanel(`${highlightedFurnitureId}-${highlightedPanelName}`);
    } else {
      setHighlightedPanel(null);
    }
    return () => setHighlightedPanel(null);
  }, [highlightedPanelName, highlightedFurnitureId, setHighlightedPanel]);

  // highlightedPanel ID (scene traverse 보조용)
  const highlightedPanelId = useMemo(() => {
    if (!highlightedPanelName || !highlightedFurnitureId) return null;
    return `${highlightedFurnitureId}-${highlightedPanelName}`;
  }, [highlightedPanelName, highlightedFurnitureId]);

  // 전체 가구 바운딩 박스 계산 (카메라 위치용)
  const { targetSize, targetCenter } = useMemo(() => {
    if (!placedModules.length || !spaceInfo) {
      return {
        targetSize: new THREE.Vector3(1, 2, 0.6),
        targetCenter: new THREE.Vector3(0, 1, 0),
      };
    }

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let maxH = 0;

    placedModules.forEach((pm: any) => {
      const w = ((pm.width || 600) as number) / 1000;
      const h = ((pm.customHeight || spaceInfo.height || 2400) as number) / 1000;
      const d = ((pm.depth || spaceInfo.depth || 600) as number) / 1000;
      const posX = ((pm.position?.x || 0) as number) / 1000;
      const posZ = ((pm.position?.z || 0) as number) / 1000;

      minX = Math.min(minX, posX);
      maxX = Math.max(maxX, posX + w);
      minZ = Math.min(minZ, posZ);
      maxZ = Math.max(maxZ, posZ + d);
      maxH = Math.max(maxH, h);
    });

    const totalW = maxX - minX;
    const totalD = maxZ - minZ;
    return {
      targetSize: new THREE.Vector3(totalW, maxH, totalD),
      targetCenter: new THREE.Vector3((minX + maxX) / 2, maxH / 2, (minZ + maxZ) / 2),
    };
  }, [placedModules, spaceInfo]);

  if (!spaceInfo || placedModules.length === 0) {
    return (
      <div className={styles.empty}>
        <span>배치된 가구가 없습니다</span>
      </div>
    );
  }

  // 지연 마운트 대기 중
  if (!ready) {
    return (
      <div className={styles.empty}>
        <span>3D 뷰어 로딩중...</span>
      </div>
    );
  }

  const fallbackUI = (
    <div className={styles.empty}>
      <span>3D 뷰어를 사용할 수 없습니다</span>
    </div>
  );

  return (
    <div className={styles.container}>
      <WebGLErrorBoundary fallback={fallbackUI}>
        <Canvas
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'low-power',
            failIfMajorPerformanceCaveat: false,
          }}
          dpr={[1, 1.5]}
          frameloop="demand"
          style={{ background: 'transparent' }}
          onCreated={({ gl }) => {
            // Canvas 생성 성공 로그
            console.log('[PanelHighlight3DViewer] WebGL context created');
            // unmount 시 컨텍스트 정리
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              console.warn('[PanelHighlight3DViewer] WebGL context lost');
            });
          }}
        >
          <Scene3D
            spaceInfo={spaceInfo}
            placedModules={placedModules}
            targetSize={targetSize}
            targetCenter={targetCenter}
            highlightedPanelId={highlightedPanelId}
          />
        </Canvas>
      </WebGLErrorBoundary>

      {/* 하이라이트 안내 */}
      {highlightedPanelName && (
        <div className={styles.panelLabel}>
          {highlightedPanelName}
        </div>
      )}
    </div>
  );
};

export default PanelHighlight3DViewer;
