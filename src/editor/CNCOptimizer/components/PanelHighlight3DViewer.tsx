import React, { Suspense, useEffect, useMemo, useRef } from 'react';
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

/** 카메라 자동 위치 조정 컴포넌트 */
const CameraFitter: React.FC<{ targetSize: THREE.Vector3 }> = ({ targetSize }) => {
  const { camera } = useThree();
  const hasAdjusted = useRef(false);

  useEffect(() => {
    if (hasAdjusted.current) return;
    hasAdjusted.current = true;

    const maxDim = Math.max(targetSize.x, targetSize.y, targetSize.z);
    const distance = maxDim * 2.2;
    camera.position.set(distance * 0.6, distance * 0.7, distance * 0.8);
    camera.lookAt(0, targetSize.y / 2, 0);
    camera.updateProjectionMatrix();
  }, [targetSize, camera]);

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

  // customSections 반영
  const finalModuleData = useMemo(() => {
    if (placedModule.customSections && moduleData.modelConfig) {
      return {
        ...moduleData,
        modelConfig: {
          ...moduleData.modelConfig,
          sections: placedModule.customSections,
        },
      };
    }
    return moduleData;
  }, [moduleData, placedModule.customSections]);

  const width = placedModule.width || finalModuleData.dimensions.width;
  const depth = placedModule.depth || finalModuleData.dimensions.depth;

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
      backPanelThickness={placedModule.backPanelThickness}
      isCustomizable={placedModule.isCustomizable}
      customConfig={placedModule.customConfig}
      customSections={placedModule.customSections}
      lowerSectionDepth={placedModule.lowerSectionDepth}
      upperSectionDepth={placedModule.upperSectionDepth}
      lowerSectionDepthDirection={placedModule.lowerSectionDepthDirection}
      upperSectionDepthDirection={placedModule.upperSectionDepthDirection}
    />
  );
};

const PanelHighlight3DViewer: React.FC<PanelHighlight3DViewerProps> = ({
  highlightedPanelName,
  highlightedFurnitureId,
}) => {
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const setHighlightedPanel = useUIStore((state) => state.setHighlightedPanel);

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

  // 가구 전체 크기 추산 (카메라 위치용)
  const targetSize = useMemo(() => {
    if (!placedModules.length || !spaceInfo) return new THREE.Vector3(1, 2, 0.6);
    const first = placedModules[0];
    const w = (first.width || 600) / 1000;
    const h = (first.customHeight || spaceInfo.height || 2400) / 1000;
    const d = (first.depth || spaceInfo.depth || 600) / 1000;
    return new THREE.Vector3(w, h, d);
  }, [placedModules, spaceInfo]);

  if (!spaceInfo || placedModules.length === 0) {
    return (
      <div className={styles.empty}>
        <span>배치된 가구가 없습니다</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <ViewerThemeProvider viewMode="3D">
            <Space3DViewProvider
              spaceInfo={spaceInfo}
              svgSize={{ width: 400, height: 280 }}
              renderMode="solid"
              viewMode="3D"
            >
              {/* 조명 */}
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 10, 8]} intensity={1.8} />
              <directionalLight position={[-3, 5, -5]} intensity={0.4} />

              {/* 카메라 자동 맞춤 */}
              <CameraFitter targetSize={targetSize} />

              {/* 궤도 컨트롤 */}
              <OrbitControls
                enablePan={false}
                enableZoom={true}
                enableRotate={true}
                minDistance={0.5}
                maxDistance={8}
                target={[0, targetSize.y / 2, 0]}
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
      </Canvas>

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
