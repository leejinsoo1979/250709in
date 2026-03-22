import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore, SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Room from '@/editor/shared/viewer3d/components/elements/Room';
import { Space3DViewProvider } from '@/editor/shared/viewer3d/context/Space3DViewContext';
import { ViewerThemeProvider } from '@/editor/shared/viewer3d/context/ViewerThemeContext';
import { calculateOptimalDistance, mmToThreeUnits } from '@/editor/shared/viewer3d/components/base/utils/threeUtils';
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

/** Canvas 내부 3D Scene — Room 컴포넌트 기반으로 에디터와 동일하게 렌더링 */
const Scene3D: React.FC<{
  spaceInfo: SpaceInfo;
  cameraPosition: [number, number, number];
  highlightedFurnitureId: string | null;
  highlightedPanelName: string | null;
  excludedMeshNames?: Set<string>;
}> = ({ spaceInfo, cameraPosition, highlightedFurnitureId, highlightedPanelName, excludedMeshNames }) => {
  return (
    <Suspense fallback={null}>
      <ViewerThemeProvider viewMode="3D">
        <Space3DViewProvider
          spaceInfo={spaceInfo}
          svgSize={{ width: 400, height: 225 }}
          renderMode="wireframe"
          viewMode="3D"
        >
          {/* 조명 — Space3DViewerReadOnly와 동일 */}
          <directionalLight
            position={[5, 15, 20]}
            intensity={2.5}
            color="#ffffff"
            castShadow
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-far={50}
            shadow-camera-left={-25}
            shadow-camera-right={25}
            shadow-camera-top={25}
            shadow-camera-bottom={-25}
            shadow-bias={-0.0005}
            shadow-radius={12}
            shadow-normalBias={0.02}
          />
          <directionalLight position={[-8, 10, 15]} intensity={0.6} color="#ffffff" />
          <ambientLight intensity={0.5} color="#ffffff" />

          {/* 궤도 컨트롤 */}
          <OrbitControls
            {...{
              enablePan: true,
              enableZoom: true,
              enableRotate: true,
              minDistance: 0.3,
              maxDistance: 50,
              target: [0, mmToThreeUnits(spaceInfo.height * 0.5), 0],
            } as any}
          />

          {/* Room 컴포넌트 — 에디터와 동일한 공간 구조 + 가구 렌더링 */}
          <Room
            spaceInfo={spaceInfo}
            viewMode="3D"
            renderMode="wireframe"
            showAll={false}
            showFrame={true}
            showDimensions={false}
            isReadOnly={true}
          />

          {/* 반투명 처리 (furnitureId + panelName 기반 개별 패널 매칭) */}
          <PanelDimmer
            highlightedFurnitureId={highlightedFurnitureId}
            highlightedPanelName={highlightedPanelName}
            excludedMeshNames={excludedMeshNames}
          />
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

  // 미리보기 모드에서는 치수 표시 끄기
  useEffect(() => {
    const uiStore = useUIStore.getState();
    const prevShowDimensions = uiStore.showDimensions;
    const prevShowDimensionsText = uiStore.showDimensionsText;
    uiStore.setShowDimensions(false);
    uiStore.setShowDimensionsText(false);
    return () => {
      uiStore.setShowDimensions(prevShowDimensions);
      uiStore.setShowDimensionsText(prevShowDimensionsText);
    };
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

  // 카메라 위치 계산 — Space3DViewerReadOnly와 동일
  const cameraPosition = useMemo<[number, number, number]>(() => {
    if (!spaceInfo) return [0, 10, 30];
    const { width, height, depth = 1500 } = spaceInfo;
    const baseDistance = calculateOptimalDistance(width, height, depth, placedModules.length);
    const centerX = 0;
    const centerY = mmToThreeUnits(height * 0.5);
    return [centerX, centerY, baseDistance];
  }, [spaceInfo, placedModules.length]);

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
            console.log('[PanelHighlight3DViewer] WebGL context created');
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              console.warn('[PanelHighlight3DViewer] WebGL context lost');
            });
          }}
        >
          <Scene3D
            spaceInfo={spaceInfo}
            cameraPosition={cameraPosition}
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
