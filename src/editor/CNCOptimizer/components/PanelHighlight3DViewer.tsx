import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Room from '@/editor/shared/viewer3d/components/elements/Room';
import ThreeCanvas from '@/editor/shared/viewer3d/components/base/ThreeCanvas';
import { Space3DViewProvider } from '@/editor/shared/viewer3d/context/Space3DViewContext';
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

/**
 * obj의 조상을 거슬러 올라가서 furnitureId를 가진 그룹을 찾는다.
 */
function findFurnitureId(obj: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData?.furnitureId) return cur.userData.furnitureId;
    cur = cur.parent;
  }
  return null;
}

/** 비하이라이트 패널 반투명 처리 (scene traverse) — wireframe + solid 모드 모두 지원 */
const PanelDimmer: React.FC<{
  highlightedFurnitureId: string | null;
  highlightedPanelName: string | null;
  excludedMeshNames?: Set<string>;
}> = ({ highlightedFurnitureId, highlightedPanelName, excludedMeshNames }) => {
  const { scene, invalidate } = useThree();
  const originals = useRef<Map<string, { color: THREE.Color; opacity: number; transparent: boolean; visible: boolean }>>(new Map());
  // ref로 최신 props 유지 (useFrame에서 사용)
  const excludedRef = useRef(excludedMeshNames);
  excludedRef.current = excludedMeshNames;

  // ── useFrame: 매 프레임 exclude 패널 visible 강제 적용 ──
  // Scene이 지연 로드되어도 확실히 적용됨
  useFrame(() => {
    const excluded = excludedRef.current;
    if (!excluded || excluded.size === 0) return;
    scene.traverse((obj) => {
      if (!obj.name) return;
      const pn = extractPanelName(obj.name);
      if (pn === null) return;
      const fid = findFurnitureId(obj);
      const compositeKey = fid ? `${fid}::${pn}` : pn;
      const shouldBeVisible = !excluded.has(compositeKey);
      if (obj.visible !== shouldBeVisible) {
        obj.visible = shouldBeVisible;
      }
    });
  });

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
            visible: mat.visible,
          });
        }
      }
    });

    // ── 제외 패널 visible 처리 (useEffect에서도 1회 적용) ──
    scene.traverse((obj) => {
      if (!obj.name) return;
      const pn = extractPanelName(obj.name);
      if (pn === null) return;
      if (excludedMeshNames && excludedMeshNames.size > 0) {
        const fid = findFurnitureId(obj);
        const compositeKey = fid ? `${fid}::${pn}` : pn;
        obj.visible = !excludedMeshNames.has(compositeKey);
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

    // ── 대상 가구 그룹 탐색 (userData.furnitureId 또는 name으로 검색) ──
    let targetGroup: THREE.Object3D | undefined;
    scene.traverse((obj) => {
      if (!targetGroup && obj.userData?.furnitureId === highlightedFurnitureId) {
        targetGroup = obj;
      }
    });
    if (!targetGroup) {
      targetGroup = scene.getObjectByName(highlightedFurnitureId) ?? undefined;
    }
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

      if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
        const mat = obj.material;
        if (isTarget) {
          mat.color.set(0x0033ee);
          mat.opacity = 1;
          mat.transparent = false;
        } else if (isSameFurniture) {
          if (hasSpecificPanel) {
            mat.color.copy(orig.color);
            mat.opacity = 0.15;
            mat.transparent = true;
          } else {
            mat.color.set(0x0033ee);
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

      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;

      if (mat instanceof THREE.MeshBasicMaterial) {
        if (isTarget) {
          mat.visible = true;
          mat.color.set(0x0033ee);
          mat.opacity = 0.7;
          mat.transparent = true;
        } else {
          mat.visible = false;
        }
        mat.needsUpdate = true;
        return;
      }

      if (mat instanceof THREE.MeshStandardMaterial) {
        if (isTarget) {
          mat.color.set(0x3366ff);
          mat.opacity = 1;
          mat.transparent = false;
          mat.emissive.set(0x0033ee);
          mat.emissiveIntensity = 1.0;
        } else if (isSameFurniture) {
          if (hasSpecificPanel) {
            mat.opacity = 0.08;
            mat.transparent = true;
            mat.emissive.copy(orig.color);
            mat.emissiveIntensity = 0;
          } else {
            mat.opacity = 1;
            mat.transparent = false;
            mat.emissive.set(0x0033ee);
            mat.emissiveIntensity = 0.6;
          }
        } else {
          mat.opacity = 0.06;
          mat.transparent = true;
          mat.emissive.copy(orig.color);
          mat.emissiveIntensity = 0;
        }
        mat.needsUpdate = true;
      }
    });

    invalidate();

    return () => {
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

  // 재질 설정
  const materialConfig = useMemo(() => {
    return (spaceInfo as any)?.materialConfig || {
      interiorColor: '#FFFFFF',
      doorColor: '#E0E0E0',
    };
  }, [spaceInfo]);

  if (!spaceInfo || placedModules.length === 0) {
    return (
      <div className={styles.empty}>
        <span>배치된 가구가 없습니다</span>
      </div>
    );
  }

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
        {/* Space3DViewerReadOnly와 동일한 구조: Provider → ThreeCanvas → Room */}
        <Space3DViewProvider
          spaceInfo={spaceInfo}
          svgSize={{ width: 800, height: 600 }}
          renderMode="solid"
          viewMode="3D"
        >
          <ThreeCanvas
            cameraPosition={cameraPosition}
            viewMode="3D"
            view2DDirection="front"
            renderMode="solid"
            cameraMode="perspective"
          >
            <React.Suspense fallback={null}>
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

              {/* Room — 에디터와 동일한 공간 구조 + 가구 렌더링 */}
              <Room
                spaceInfo={spaceInfo}
                viewMode="3D"
                materialConfig={materialConfig}
                showAll={false}
                showFrame={true}
                showDimensions={false}
                isReadOnly={true}
                cameraModeOverride="perspective"
              />

              {/* 패널 하이라이트 */}
              <PanelDimmer
                highlightedFurnitureId={highlightedFurnitureId}
                highlightedPanelName={highlightedPanelName}
                excludedMeshNames={excludedMeshNames}
              />
            </React.Suspense>
          </ThreeCanvas>
        </Space3DViewProvider>
      </WebGLErrorBoundary>

      {highlightedPanelName && (
        <div className={styles.panelLabel}>
          {highlightedPanelName}
        </div>
      )}
    </div>
  );
};

export default PanelHighlight3DViewer;
