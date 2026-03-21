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
  excludedMeshNames?: Set<string>;
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
    const distance = maxDim * 3.0;
    camera.position.set(
      center.x + distance * 0.6,
      center.y + distance * 0.4,
      center.z + distance * 0.8
    );
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix();
  }, [targetSize, center, camera]);

  return null;
};

/**
 * panelName 접두사 제거 — mesh/edge 이름에서 패널명만 추출
 */
const NAME_PREFIX_RE = /^(furniture-mesh-|back-panel-mesh-|furniture-edge-|back-panel-edge-)/;
function extractPanelName(objName: string): string | null {
  const stripped = objName.replace(NAME_PREFIX_RE, '');
  return stripped !== objName ? stripped : null;
}

/** 비하이라이트 패널 반투명 처리 (scene traverse) — wireframe + solid 모드 모두 지원 */
const PanelDimmer: React.FC<{
  highlightedFurnitureId: string | null;
  highlightedPanelName: string | null;
  excludedMeshNames?: Set<string>;
}> = ({ highlightedFurnitureId, highlightedPanelName, excludedMeshNames }) => {
  const { scene, invalidate } = useThree();
  // 원본 색상/opacity 저장 (line + mesh 모두)
  const originals = useRef<Map<string, { color: THREE.Color; opacity: number; transparent: boolean; visible: boolean }>>(new Map());

  useEffect(() => {
    // ── 원본 속성 저장 (최초 1회) ──
    scene.traverse((obj) => {
      if (originals.current.has(obj.uuid)) return;
      if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
        originals.current.set(obj.uuid, {
          color: obj.material.color.clone(),
          opacity: obj.material.opacity,
          transparent: obj.material.transparent,
          visible: obj.visible,
        });
      } else if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.Material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          originals.current.set(obj.uuid, {
            color: mat.emissive.clone(),
            opacity: mat.opacity,
            transparent: mat.transparent,
            visible: obj.visible,
          });
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          originals.current.set(obj.uuid, {
            color: mat.color.clone(),
            opacity: mat.opacity,
            transparent: mat.transparent,
            visible: mat.visible, // wireframe mesh는 visible=false
          });
        }
      }
    });

    // ── 제외 패널 visible 처리 ──
    scene.traverse((obj) => {
      if (!obj.name) return;
      const pn = extractPanelName(obj.name);
      if (pn === null) return;
      if (excludedMeshNames && excludedMeshNames.size > 0) {
        obj.visible = !excludedMeshNames.has(pn);
      } else {
        obj.visible = true;
      }
    });

    if (!highlightedFurnitureId) {
      // ── 하이라이트 없음 → 원래 상태 복원 ──
      scene.traverse((obj) => {
        const orig = originals.current.get(obj.uuid);
        if (!orig) return;
        if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
          obj.material.color.copy(orig.color);
          obj.material.opacity = orig.opacity;
          obj.material.transparent = orig.transparent;
          obj.material.needsUpdate = true;
        } else if (obj instanceof THREE.Mesh) {
          const mat = obj.material;
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.opacity = orig.opacity;
            mat.transparent = orig.transparent;
            mat.emissive.copy(orig.color);
            mat.emissiveIntensity = 0;
            mat.needsUpdate = true;
          } else if (mat instanceof THREE.MeshBasicMaterial) {
            mat.visible = orig.visible;
            mat.color.copy(orig.color);
            mat.opacity = orig.opacity;
            mat.transparent = orig.transparent;
            mat.needsUpdate = true;
          }
        }
      });
      invalidate();
      return;
    }

    // ── 대상 가구 그룹 탐색 ──
    const targetGroup = scene.getObjectByName(highlightedFurnitureId);
    const furnitureObjUuids = new Set<string>();
    const targetPanelUuids = new Set<string>();

    if (targetGroup) {
      targetGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          furnitureObjUuids.add(obj.uuid);
          if (highlightedPanelName && obj.name) {
            const pn = extractPanelName(obj.name);
            if (pn === highlightedPanelName) {
              targetPanelUuids.add(obj.uuid);
            }
          }
        }
      });
    }

    const hasSpecificPanel = highlightedPanelName && targetPanelUuids.size > 0;

    // ── 하이라이트 적용 ──
    scene.traverse((obj) => {
      const orig = originals.current.get(obj.uuid);
      if (!orig) return;

      const isTarget = hasSpecificPanel && targetPanelUuids.has(obj.uuid);
      const isSameFurniture = furnitureObjUuids.has(obj.uuid);

      // ─ Line (wireframe edges) ─
      if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
        const mat = obj.material;
        if (isTarget) {
          mat.color.set(0x2266cc);
          mat.opacity = 1;
          mat.transparent = false;
        } else if (isSameFurniture) {
          if (hasSpecificPanel) {
            mat.color.copy(orig.color);
            mat.opacity = 0.15;
            mat.transparent = true;
          } else {
            mat.color.set(0x2266cc);
            mat.opacity = 1;
            mat.transparent = false;
          }
        } else {
          mat.color.copy(orig.color);
          mat.opacity = 0.08;
          mat.transparent = true;
        }
        mat.needsUpdate = true;
        return;
      }

      // ─ Mesh ─
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;

      // wireframe 모드: MeshBasicMaterial (보통 visible=false)
      if (mat instanceof THREE.MeshBasicMaterial) {
        if (isTarget) {
          // 대상 패널: visible로 만들어 반투명 하이라이트 면 표시
          mat.visible = true;
          mat.color.set(0x2266cc);
          mat.opacity = 0.25;
          mat.transparent = true;
        } else {
          // 비대상: 숨김 유지
          mat.visible = false;
        }
        mat.needsUpdate = true;
        return;
      }

      // solid 모드: MeshStandardMaterial
      if (mat instanceof THREE.MeshStandardMaterial) {
        if (isTarget) {
          mat.opacity = 1;
          mat.transparent = false;
          mat.emissive.set(0x2266cc);
          mat.emissiveIntensity = 0.5;
        } else if (isSameFurniture) {
          if (hasSpecificPanel) {
            mat.opacity = 0.35;
            mat.transparent = true;
            mat.emissive.copy(orig.color);
            mat.emissiveIntensity = 0;
          } else {
            mat.opacity = 1;
            mat.transparent = false;
            mat.emissive.set(0x2266cc);
            mat.emissiveIntensity = 0.4;
          }
        } else {
          mat.opacity = 0.12;
          mat.transparent = true;
          mat.emissive.copy(orig.color);
          mat.emissiveIntensity = 0;
        }
        mat.needsUpdate = true;
      }
    });

    invalidate();

    return () => {
      // cleanup: 원래 상태 복원
      scene.traverse((obj) => {
        obj.visible = true;
        const orig = originals.current.get(obj.uuid);
        if (!orig) return;
        if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
          obj.material.color.copy(orig.color);
          obj.material.opacity = orig.opacity;
          obj.material.transparent = orig.transparent;
          obj.material.needsUpdate = true;
        } else if (obj instanceof THREE.Mesh) {
          const mat = obj.material;
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.opacity = orig.opacity;
            mat.transparent = orig.transparent;
            mat.emissive.copy(orig.color);
            mat.emissiveIntensity = 0;
            mat.needsUpdate = true;
          } else if (mat instanceof THREE.MeshBasicMaterial) {
            mat.visible = orig.visible;
            mat.color.copy(orig.color);
            mat.opacity = orig.opacity;
            mat.transparent = orig.transparent;
            mat.needsUpdate = true;
          }
        }
      });
    };
  }, [highlightedFurnitureId, highlightedPanelName, excludedMeshNames, scene, invalidate]);

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
      renderMode="wireframe"
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
  highlightedFurnitureId: string | null;
  highlightedPanelName: string | null;
  excludedMeshNames?: Set<string>;
}> = ({ spaceInfo, placedModules, targetSize, targetCenter, highlightedFurnitureId, highlightedPanelName, excludedMeshNames }) => {
  return (
    <Suspense fallback={null}>
      <ViewerThemeProvider viewMode="3D">
        <Space3DViewProvider
          spaceInfo={spaceInfo}
          svgSize={{ width: 400, height: 225 }}
          renderMode="wireframe"
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
              maxDistance: 50,
              target: [targetCenter.x, targetCenter.y, targetCenter.z],
            } as any}
          />

          {/* 가구 렌더링 - name에 furniture ID 설정 (PanelDimmer 매칭용) */}
          {placedModules.map((pm) => (
            <group
              key={pm.id}
              name={pm.id}
              position={[
                pm.position?.x || 0,
                pm.position?.y || 0,
                pm.position?.z || 0,
              ]}
            >
              <FurnitureRenderer
                placedModule={pm}
                spaceInfo={spaceInfo}
              />
            </group>
          ))}

          {/* 반투명 처리 (furnitureId + panelName 기반 개별 패널 매칭) */}
          <PanelDimmer highlightedFurnitureId={highlightedFurnitureId} highlightedPanelName={highlightedPanelName} excludedMeshNames={excludedMeshNames} />
        </Space3DViewProvider>
      </ViewerThemeProvider>
    </Suspense>
  );
};

const PanelHighlight3DViewer: React.FC<PanelHighlight3DViewerProps> = ({
  highlightedPanelName,
  highlightedFurnitureId,
  excludedMeshNames,
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

    const internalSpace = calculateInternalSpace(spaceInfo);

    placedModules.forEach((pm: any) => {
      // width/height/depth는 mm → Three.js 단위로 변환 (* 0.01)
      const moduleData = getModuleById(pm.moduleId, internalSpace, spaceInfo) || buildModuleDataFromPlacedModule(pm);
      const wMm = pm.freeWidth || pm.moduleWidth || moduleData?.dimensions?.width || 600;
      const hMm = pm.freeHeight || moduleData?.dimensions?.height || spaceInfo.height || 2400;
      const dMm = pm.freeDepth || moduleData?.dimensions?.depth || spaceInfo.depth || 600;

      const w = wMm * 0.01;
      const h = hMm * 0.01;
      const d = dMm * 0.01;

      // position은 이미 Three.js 단위 (mm * 0.01)
      const posX = pm.position?.x || 0;
      const posZ = pm.position?.z || 0;

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
            highlightedFurnitureId={highlightedFurnitureId}
            highlightedPanelName={highlightedPanelName}
            excludedMeshNames={excludedMeshNames}
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
