import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Room from '@/editor/shared/viewer3d/components/elements/Room';
import ThreeCanvas from '@/editor/shared/viewer3d/components/base/ThreeCanvas';
import { Space3DViewProvider } from '@/editor/shared/viewer3d/context/Space3DViewContext';
import { useExcludedPanelsStore } from '@/editor/shared/viewer3d/context/ExcludedPanelsContext';
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
 * panelName 접두사 제거 — mesh/edge 이름에서 패널명만 추출.
 * mesh: "furniture-mesh-좌측판" → "좌측판"
 * edge: "furniture-edge-좌측판-0" → "좌측판" (라인 인덱스 제거)
 * lineSegments: "furniture-edge-좌측판" → "좌측판"
 */
const MESH_PREFIX_RE = /^(furniture-mesh-|back-panel-mesh-)/;
const EDGE_PREFIX_RE = /^(furniture-edge-|back-panel-edge-)/;
function extractPanelName(objName: string): string | null {
  // mesh 이름 처리
  const meshStripped = objName.replace(MESH_PREFIX_RE, '');
  if (meshStripped !== objName) return meshStripped || null;
  // edge 이름 처리 — 끝의 "-숫자" (라인 인덱스) 제거
  const edgeStripped = objName.replace(EDGE_PREFIX_RE, '');
  if (edgeStripped !== objName) {
    // "좌측판-0" → "좌측판", "좌측판" → "좌측판"
    return edgeStripped.replace(/-\d+$/, '') || null;
  }
  return null;
}

/**
 * 제외 패널 숨김 — useFrame으로 매 프레임 obj.visible = false 설정.
 * BoxWithEdges/DoorModule의 <mesh>에 visible prop이 없으므로 R3F가 복원하지 않음.
 */
const PanelHider: React.FC = () => {
  const { scene } = useThree();
  const excludedRef = useRef<Set<string>>(new Set());
  const dumpedRef = useRef(false);

  // Zustand store 구독 (R3F reconciler와 무관하게 동작)
  useEffect(() => {
    const unsub = useExcludedPanelsStore.subscribe((state) => {
      excludedRef.current = state.excludedKeys;
      dumpedRef.current = false; // re-dump on change
    });
    excludedRef.current = useExcludedPanelsStore.getState().excludedKeys;
    return unsub;
  }, []);

  useFrame(() => {
    const excluded = excludedRef.current;
    if (!excluded || excluded.size === 0) {
      // 모두 복원
      scene.traverse((obj) => {
        if (obj.userData.__hiddenByOptimizer) {
          obj.visible = true;
          obj.userData.__hiddenByOptimizer = false;
        }
      });
      return;
    }

    // 디버그: 한 번만 씬 전체 오브젝트 이름 덤프
    if (!dumpedRef.current) {
      dumpedRef.current = true;
      const allNames: string[] = [];
      const matchedNames: string[] = [];
      const unmatchedExcluded: string[] = [];
      scene.traverse((obj) => {
        if (obj.name) allNames.push(obj.name);
      });
      const extractedSet = new Set<string>();
      allNames.forEach(n => {
        const pn = extractPanelName(n);
        if (pn) extractedSet.add(pn);
      });
      excluded.forEach(key => {
        if (extractedSet.has(key)) {
          matchedNames.push(key);
        } else {
          unmatchedExcluded.push(key);
        }
      });
      console.log('[PanelHider] 씬 오브젝트 중 furniture-mesh/back-panel-mesh 이름들:',
        allNames.filter(n => n.startsWith('furniture-mesh') || n.startsWith('back-panel-mesh')).slice(0, 30));
      console.log('[PanelHider] excluded 키:', [...excluded]);
      console.log('[PanelHider] 매칭 성공:', matchedNames);
      console.log('[PanelHider] 매칭 실패:', unmatchedExcluded);
    }

    scene.traverse((obj) => {
      if (!obj.name) return;
      const pn = extractPanelName(obj.name);
      if (pn === null) return;

      const shouldHide = excluded.has(pn);
      if (shouldHide) {
        obj.visible = false;
        obj.userData.__hiddenByOptimizer = true;
      } else if (obj.userData.__hiddenByOptimizer) {
        obj.visible = true;
        obj.userData.__hiddenByOptimizer = false;
      }
    });
  });

  return null;
};

/** 비하이라이트 패널 반투명 처리 (scene traverse) — wireframe + solid 모드 모두 지원 */
const PanelDimmer: React.FC<{
  highlightedFurnitureId: string | null;
  highlightedPanelName: string | null;
}> = ({ highlightedFurnitureId, highlightedPanelName }) => {
  const { scene, invalidate } = useThree();
  const originals = useRef<Map<string, { color: THREE.Color; emissiveColor: THREE.Color; opacity: number; transparent: boolean; visible: boolean }>>(new Map());

  useEffect(() => {
    // ── 원본 속성 저장 (최초 1회) ──
    scene.traverse((obj) => {
      if (originals.current.has(obj.uuid)) return;
      if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
        originals.current.set(obj.uuid, {
          color: obj.material.color.clone(),
          emissiveColor: new THREE.Color(0, 0, 0),
          opacity: obj.material.opacity,
          transparent: obj.material.transparent,
          visible: obj.visible,
        });
      } else if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.Material;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshLambertMaterial) {
          originals.current.set(obj.uuid, {
            color: mat.color.clone(),
            emissiveColor: (mat as any).emissive?.clone() || new THREE.Color(0, 0, 0),
            opacity: mat.opacity,
            transparent: mat.transparent,
            visible: obj.visible,
          });
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          originals.current.set(obj.uuid, {
            color: mat.color.clone(),
            emissiveColor: new THREE.Color(0, 0, 0),
            opacity: mat.opacity,
            transparent: mat.transparent,
            visible: mat.visible,
          });
        }
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
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshLambertMaterial) {
            mat.color.copy(orig.color);
            mat.opacity = orig.opacity;
            mat.transparent = orig.transparent;
            if ((mat as any).emissive) {
              (mat as any).emissive.copy(orig.emissiveColor);
              (mat as any).emissiveIntensity = 0;
            }
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

    // 패널 이름 매칭 헬퍼
    const matchesPanelName = (obj: THREE.Object3D): boolean => {
      if (!highlightedPanelName || !obj.name) return false;
      const pn = extractPanelName(obj.name);
      if (pn && pn === highlightedPanelName) return true;
      if (obj.name === highlightedPanelName) return true;
      if (obj.name.includes(highlightedPanelName) || (pn && pn.includes(highlightedPanelName))) return true;
      return false;
    };

    if (targetGroup) {
      targetGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          furnitureObjUuids.add(obj.uuid);
          if (matchesPanelName(obj)) {
            targetPanelUuids.add(obj.uuid);
          }
        }
      });
    }

    // 가구 그룹에서 못 찾았으면 씬 전체에서 이름 매칭 (프레임/서라운드 등 공간 요소)
    if (highlightedPanelName && targetPanelUuids.size === 0) {
      scene.traverse((obj) => {
        if ((obj instanceof THREE.Mesh || obj instanceof THREE.Line) && matchesPanelName(obj)) {
          targetPanelUuids.add(obj.uuid);
          furnitureObjUuids.add(obj.uuid);
        }
      });
    }

    // highlightedPanelName이 있으면 항상 개별 패널 모드 (매칭 실패해도 전체 파란색 X)
    const isPanelMode = !!highlightedPanelName;

    // 디버그: 매칭 실패 시 원인 추적
    if (highlightedPanelName && targetPanelUuids.size === 0) {
      const meshNames: string[] = [];
      scene.traverse((obj) => {
        if ((obj instanceof THREE.Mesh || obj instanceof THREE.Line) && obj.name) {
          meshNames.push(obj.name);
        }
      });
      console.warn(`[PanelDimmer] 패널 매칭 실패! 찾는 이름: "${highlightedPanelName}", 씬 내 메시 이름들:`, meshNames.slice(0, 30).map(n => `"${n}" → "${extractPanelName(n)}"`));
    }

    // ── 하이라이트 적용 ──
    scene.traverse((obj) => {
      let orig = originals.current.get(obj.uuid);
      // originals에 아직 없으면 즉시 저장 (비동기 씬 로딩 대응)
      if (!orig) {
        if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
          orig = { color: obj.material.color.clone(), emissiveColor: new THREE.Color(0,0,0), opacity: obj.material.opacity, transparent: obj.material.transparent, visible: obj.visible };
          originals.current.set(obj.uuid, orig);
        } else if (obj instanceof THREE.Mesh) {
          const m = obj.material as THREE.Material;
          if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial) {
            orig = { color: m.color.clone(), emissiveColor: (m as any).emissive?.clone() || new THREE.Color(0,0,0), opacity: m.opacity, transparent: m.transparent, visible: obj.visible };
            originals.current.set(obj.uuid, orig);
          } else if (m instanceof THREE.MeshBasicMaterial) {
            orig = { color: m.color.clone(), emissiveColor: new THREE.Color(0,0,0), opacity: m.opacity, transparent: m.transparent, visible: m.visible };
            originals.current.set(obj.uuid, orig);
          }
        }
        if (!orig) return;
      }

      const isTarget = targetPanelUuids.has(obj.uuid);
      const isSameFurniture = furnitureObjUuids.has(obj.uuid);

      if (obj instanceof THREE.Line && obj.material instanceof THREE.LineBasicMaterial) {
        const mat = obj.material;
        if (isTarget) {
          mat.color.set(0x0033ee);
          mat.opacity = 1;
          mat.transparent = false;
        } else {
          // 타겟이 아닌 모든 라인 → 투명
          mat.color.copy(orig.color);
          mat.opacity = isSameFurniture ? 0.15 : 0.08;
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

      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshLambertMaterial) {
        if (isTarget) {
          // 선택된 패널만 강조
          mat.color.set(0x3366ff);
          mat.opacity = 1;
          mat.transparent = false;
          if ((mat as any).emissive) {
            (mat as any).emissive.set(0x0033ee);
            (mat as any).emissiveIntensity = 1.0;
          }
        } else {
          // 나머지 전체 투명
          mat.color.copy(orig.color);
          mat.opacity = isSameFurniture ? 0.08 : 0.06;
          mat.transparent = true;
          if ((mat as any).emissive) {
            (mat as any).emissive.copy(orig.emissiveColor);
            (mat as any).emissiveIntensity = 0;
          }
        }
        mat.needsUpdate = true;
      }
    });

    invalidate();

    return () => {
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
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshLambertMaterial) {
            mat.color.copy(orig.color);
            mat.opacity = orig.opacity;
            mat.transparent = orig.transparent;
            if ((mat as any).emissive) {
              (mat as any).emissive.copy(orig.emissiveColor);
              (mat as any).emissiveIntensity = 0;
            }
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
  }, [highlightedFurnitureId, highlightedPanelName, scene, invalidate]);

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
  const setExcludedKeys = useExcludedPanelsStore((s) => s.setExcludedKeys);

  // excludedMeshNames → Zustand store 동기화 (R3F Canvas 안에서 접근 가능하게)
  useEffect(() => {
    setExcludedKeys(excludedMeshNames ?? new Set());
    return () => setExcludedKeys(new Set());
  }, [excludedMeshNames, setExcludedKeys]);

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

              {/* 제외 패널 숨김 (scale=0) */}
              <PanelHider />

              {/* 패널 하이라이트 */}
              <PanelDimmer
                highlightedFurnitureId={highlightedFurnitureId}
                highlightedPanelName={highlightedPanelName}
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
