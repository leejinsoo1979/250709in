import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, recalculateWithCustomWidths } from '../../../utils/indexing';
import { ColumnIndexer } from '@/editor/shared/utils/indexing/ColumnIndexer';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useThree, useFrame } from '@react-three/fiber';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings, getDefaultGrainDirection, resolvePanelGrainDirection } from '@/editor/shared/utils/materialConstants';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { Line, Html } from '@react-three/drei';
import NativeLine from '../elements/NativeLine';
import { Hinge } from '../Hinge';
import DimensionText from './components/DimensionText';
import { useDimensionColor } from './hooks/useDimensionColor';
import { isPanelKeyExcluded, useExcludedPanelsStore } from '../../context/ExcludedPanelsContext';
import {
  calculateDualDoorOpenGeometry,
  calculateSingleDoorOpenGeometry,
  normalizeDoorHingePositionsMm,
  resolveDefaultDoorHingePositionsMm,
  resolveHingeOppositeDoorWidthAdjustment,
  resolveSideAnchoredDoorHingePositionsMm,
  resolveSidePanelMatchedHingePositions
} from '@/editor/shared/utils/doorGeometryCalculator';
import { resolveDoorOuterOpenSides } from '@/editor/shared/utils/doorOuterGap';
import { resolveDoorHeightDimensionSides, shouldRenderDoorDimensionGuides } from '@/editor/shared/utils/doorDimensionGuides';
import { resolveCountertopThicknessMm } from '@/editor/shared/utils/countertopHeightCompensation';
import { isDummyModuleId } from '@/editor/shared/utils/dummyModule';
import {
  getPanelAssemblySequence,
  getPanelSimulationPlaybackElapsed,
  getPanelSimulationStyleProgress,
  getPanelSimulationStyleTiming,
  getPanelSimulationLayoutKey,
  resolvePanelSimulationTarget
} from '../../utils/panelSimulationMotion';
import { getPanelSimulationSourceRegistryVersion, removePanelSimulationSource, updatePanelSimulationSource } from '../../utils/panelSimulationRegistry';

const MIN_DOOR_BOX_GEOMETRY_SIZE = 0.001;
const panelSimulationSlots = new Map<string, number>();

const sanitizeDoorBoxGeometrySize = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return MIN_DOOR_BOX_GEOMETRY_SIZE;
  }
  return value;
};

const getPanelSimulationSlot = (key: string) => {
  const existing = panelSimulationSlots.get(key);
  if (existing !== undefined) return existing;
  const next = panelSimulationSlots.size;
  panelSimulationSlots.set(key, next);
  return next;
};

const getFlatPanelAxes = (dims: [number, number, number]) => {
  const axes = [
    { name: 'x' as const, size: dims[0], index: 0 },
    { name: 'y' as const, size: dims[1], index: 1 },
    { name: 'z' as const, size: dims[2], index: 2 },
  ].sort((a, b) => a.size - b.size);
  const thicknessAxis = axes[0];
  const faceAxes = axes.slice(1).sort((a, b) => a.size - b.size);
  return {
    thicknessAxis,
    widthAxis: faceAxes[0],
    lengthAxis: faceAxes[1],
  };
};

const buildFlatPanelQuaternion = (dims: [number, number, number], rotationZ: number) => {
  const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(dims);
  const localBasis = {
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3(),
  };
  const widthVector = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationZ);
  const lengthVector = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationZ);

  localBasis[thicknessAxis.name].set(0, 1, 0);
  localBasis[widthAxis.name].copy(widthVector);
  localBasis[lengthAxis.name].copy(lengthVector);

  const matrix = new THREE.Matrix4().makeBasis(localBasis.x, localBasis.y, localBasis.z);
  if (matrix.determinant() < 0) {
    localBasis[lengthAxis.name].multiplyScalar(-1);
    matrix.makeBasis(localBasis.x, localBasis.y, localBasis.z);
  }

  return new THREE.Quaternion().setFromRotationMatrix(matrix);
};

// BoxWithEdges 컴포넌트 정의 (독립적인 그림자 업데이트 포함)
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  panelName?: string;
  textureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
  isLocked?: boolean; // EP ㄷ자 프레임 잠금 도어
}> = ({ args, position, material, renderMode, isDragging = false, isEditMode = false, onClick, onPointerOver, onPointerOut, panelName, textureUrl, panelGrainDirections, furnitureId, isLocked = false }) => {
  const groupRef = React.useRef<THREE.Group>(null);
  const isExcludedByOptimizer = useExcludedPanelsStore((s) => {
    return isPanelKeyExcluded(s.excludedKeys, furnitureId, panelName);
  });

  const { theme } = useViewerTheme();
  const { view2DTheme, view2DDirection, shadowEnabled, isTransparentMode, panelSimulationPhase, panelSimulationRevision, panelSimulationLayouts } = useUIStore();
  const simulationRevisionRef = React.useRef(panelSimulationRevision);
  const simulationStartTimeRef = React.useRef(0);
  const simulationFrameStateRef = React.useRef<{
    signature: string;
    sequenceIndex: number;
    startPosition: THREE.Vector3;
    startQuaternion: THREE.Quaternion;
    startScale: THREE.Vector3;
    targetPosition: THREE.Vector3;
    targetQuaternion: THREE.Quaternion;
    targetScale: THREE.Vector3;
    hasLayout: boolean;
    hasSimulationLayouts: boolean;
  } | null>(null);
  const compositeKeyForCleanup = furnitureId && panelName ? `${furnitureId}::${panelName}` : undefined;
  React.useEffect(() => {
    return () => {
      if (compositeKeyForCleanup) removePanelSimulationSource(compositeKeyForCleanup);
    };
  }, [compositeKeyForCleanup]);
  const safeArgs = useMemo<[number, number, number]>(() => [
    sanitizeDoorBoxGeometrySize(args[0]),
    sanitizeDoorBoxGeometrySize(args[1]),
    sanitizeDoorBoxGeometrySize(args[2]),
  ], [args[0], args[1], args[2]]);
  const panelSimulationLayoutCount = useMemo(
    () => Object.keys(panelSimulationLayouts).length,
    [panelSimulationLayouts]
  );
  const geometry = useMemo(() => new THREE.BoxGeometry(...safeArgs), [safeArgs]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  const { viewMode } = useSpace3DView();
  const { gl } = useThree();

  // BoxWithEdges 컴포넌트 내부에 getThemeColor 함수 정의
  const getThemeColor = () => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  };

  const displayMaterial = useMemo(() => {
    if (
      viewMode === '3D' &&
      isTransparentMode &&
      (
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshBasicMaterial ||
        material instanceof THREE.MeshLambertMaterial ||
        material instanceof THREE.MeshPhongMaterial
      )
    ) {
      material.transparent = true;
      material.opacity = 0.28;
      material.depthWrite = false;
      material.depthTest = true;
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
      return material;
    }
    return material;
  }, [material, viewMode, isTransparentMode]);

  const doorEdgeBandingColor = useSpaceConfigStore(state => {
    if (viewMode !== '3D' && !(viewMode === '2D' && view2DDirection === 'front')) return undefined;
    return state.spaceInfo.materialConfig?.doorEdgeColor || undefined;
  });
  const doorEdgeBandingWidthMm = useSpaceConfigStore(state => {
    const width = state.spaceInfo.materialConfig?.doorEdgeBandingWidthMm;
    return typeof width === 'number' && [1, 2, 3, 4].includes(width) ? width : 2;
  });

  const doorEdgeBandingMaterial = useMemo(() => {
    if (!doorEdgeBandingColor) return null;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(doorEdgeBandingColor),
      roughness: 0.18,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
  }, [doorEdgeBandingColor]);

  useEffect(() => {
    return () => {
      doorEdgeBandingMaterial?.dispose();
    };
  }, [doorEdgeBandingMaterial]);

  const meshMaterial = useMemo<THREE.Material | THREE.Material[]>(() => {
    if (viewMode !== '3D' || renderMode !== 'solid' || !doorEdgeBandingMaterial) {
      return displayMaterial;
    }

    const [w, h, d] = safeArgs;
    const minDim = Math.min(w, h, d);
    const isThinX = w === minDim;
    const isThinY = h === minDim && !isThinX;
    const isThinZ = d === minDim && !isThinX && !isThinY;
    // BoxGeometry face order: [+X, -X, +Y, -Y, +Z, -Z]
    // 도어는 전후 메인 면을 제외한 4면에 엣지밴딩 색을 적용한다.
    const mats: THREE.Material[] = [
      displayMaterial,
      displayMaterial,
      displayMaterial,
      displayMaterial,
      displayMaterial,
      displayMaterial,
    ];

    if (isThinX) {
      mats[2] = doorEdgeBandingMaterial;
      mats[3] = doorEdgeBandingMaterial;
      mats[4] = doorEdgeBandingMaterial;
      mats[5] = doorEdgeBandingMaterial;
    } else if (isThinY) {
      mats[0] = doorEdgeBandingMaterial;
      mats[1] = doorEdgeBandingMaterial;
      mats[4] = doorEdgeBandingMaterial;
      mats[5] = doorEdgeBandingMaterial;
    } else if (isThinZ) {
      mats[0] = doorEdgeBandingMaterial;
      mats[1] = doorEdgeBandingMaterial;
      mats[2] = doorEdgeBandingMaterial;
      mats[3] = doorEdgeBandingMaterial;
    } else {
      mats[0] = doorEdgeBandingMaterial;
      mats[1] = doorEdgeBandingMaterial;
      mats[2] = doorEdgeBandingMaterial;
      mats[3] = doorEdgeBandingMaterial;
    }

    return mats;
  }, [displayMaterial, doorEdgeBandingMaterial, renderMode, safeArgs, viewMode]);
  const doorEdgeBandingStrip = useMemo(() => {
    if (!((viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front')) && renderMode === 'solid' && doorEdgeBandingColor)) return null;
    const strip = Math.min(doorEdgeBandingWidthMm * 0.01, safeArgs[0] / 3, safeArgs[1] / 3);
    if (strip <= 0) return null;
    return {
      strip,
      frontZ: safeArgs[2] / 2 + 0.004,
      backZ: -safeArgs[2] / 2 - 0.004,
      stripDepth: 0.003,
      horizontalWidth: safeArgs[0],
      verticalHeight: Math.max(0.001, safeArgs[1] - strip * 2),
    };
  }, [doorEdgeBandingColor, doorEdgeBandingWidthMm, renderMode, safeArgs, view2DDirection, viewMode]);

  useFrame(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    const compositeKey = furnitureId && panelName ? `${furnitureId}::${panelName}` : undefined;

    if (viewMode !== '3D' || isExcludedByOptimizer || !compositeKey || !furnitureId || !panelName) {
      group.position.set(position[0], position[1], position[2]);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);
      group.visible = !isExcludedByOptimizer;
      return;
    }

    if (simulationRevisionRef.current !== panelSimulationRevision) {
      simulationRevisionRef.current = panelSimulationRevision;
      simulationStartTimeRef.current = performance.now() / 1000;
      simulationFrameStateRef.current = null;
    }

    if (panelSimulationRevision <= 0) return;

    const signature = `${panelSimulationRevision}:${panelSimulationPhase}:${compositeKey}:${safeArgs.join(',')}:${panelSimulationLayoutCount}`;
    let frameState = simulationFrameStateRef.current;
    if (!frameState || frameState.signature !== signature) {
      const simulationTarget = resolvePanelSimulationTarget(panelSimulationLayouts, furnitureId, panelName, safeArgs);
      const simulationLayout = simulationTarget?.layout;
      const hasSimulationLayouts = panelSimulationLayoutCount > 0;
      const parent = group.parent;
      const layoutKey = simulationTarget?.key || getPanelSimulationLayoutKey(panelSimulationLayouts, furnitureId, panelName) || compositeKey;
      const slot = getPanelSimulationSlot(layoutKey);
      const originalPosition = new THREE.Vector3(position[0], position[1], position[2]);
      const originalQuaternion = new THREE.Quaternion();
      const originalScale = new THREE.Vector3(1, 1, 1);
      const layoutScaleVector = new THREE.Vector3(1, 1, 1);
      let layoutPosition = originalPosition.clone();
      let layoutQuaternion = new THREE.Quaternion();

      if (simulationLayout) {
        removePanelSimulationSource(layoutKey);
      }

      if (simulationLayout) {
        const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(safeArgs);
        layoutScaleVector.setComponent(thicknessAxis.index, simulationLayout.scale);
        layoutScaleVector.setComponent(widthAxis.index, simulationLayout.widthWorld / Math.max(safeArgs[widthAxis.index], MIN_DOOR_BOX_GEOMETRY_SIZE));
        layoutScaleVector.setComponent(lengthAxis.index, simulationLayout.heightWorld / Math.max(safeArgs[lengthAxis.index], MIN_DOOR_BOX_GEOMETRY_SIZE));

        const thickness = Math.min(safeArgs[0], safeArgs[1], safeArgs[2]);
        layoutPosition = new THREE.Vector3(
          simulationLayout.worldX,
          simulationLayout.worldY + thickness * simulationLayout.scale * 0.5 + 0.03,
          simulationLayout.worldZ
        );
        layoutQuaternion = buildFlatPanelQuaternion(safeArgs, simulationLayout.rotationZ);

        if (parent) {
          parent.updateWorldMatrix(true, false);
          parent.worldToLocal(layoutPosition);
          const parentWorldQuaternion = new THREE.Quaternion();
          parent.getWorldQuaternion(parentWorldQuaternion);
          layoutQuaternion.premultiply(parentWorldQuaternion.invert());
        }
      }

      const targetPosition = panelSimulationPhase === 'layout' ? layoutPosition : originalPosition;
      const targetQuaternion = panelSimulationPhase === 'layout' ? layoutQuaternion : originalQuaternion;
      const targetScaleVector = panelSimulationPhase === 'layout' ? layoutScaleVector : originalScale;
      const startPosition = panelSimulationPhase === 'layout' ? group.position.clone() : layoutPosition.clone();
      const startQuaternion = panelSimulationPhase === 'layout' ? group.quaternion.clone() : layoutQuaternion.clone();
      const startScale = panelSimulationPhase === 'layout' ? group.scale.clone() : layoutScaleVector.clone();

      const sequenceIndex = panelSimulationPhase === 'layout'
        ? (simulationLayout?.order ?? slot)
        : getPanelAssemblySequence(furnitureId, panelName, position, parent, false);

      frameState = {
        signature,
        sequenceIndex,
        startPosition,
        startQuaternion,
        startScale,
        targetPosition,
        targetQuaternion,
        targetScale: targetScaleVector,
        hasLayout: !!simulationLayout,
        hasSimulationLayouts,
      };
      simulationFrameStateRef.current = frameState;
    }

    if (panelSimulationPhase === 'assembled' && frameState.hasSimulationLayouts && !frameState.hasLayout) {
      group.visible = false;
      if (import.meta.env.DEV) {
        console.warn('[PanelSimulation] door assembly target missing, hiding original pop-in:', `${furnitureId}::${panelName}`);
      }
      return;
    }
    if (panelSimulationPhase === 'layout' && !frameState.hasLayout) {
      group.visible = false;
      group.position.set(position[0], position[1], position[2]);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);
      if (frameState.hasSimulationLayouts && import.meta.env.DEV) {
        console.warn('[PanelSimulation] door layout target missing:', `${furnitureId}::${panelName}`);
      }
      return;
    }

    if (group.visible === false) {
      group.visible = true;
    }
    const playback = useUIStore.getState();
    const timing = getPanelSimulationStyleTiming(playback.panelSimulationAnimationStyle);
    const cameraSettleDelay = panelSimulationPhase === 'layout' ? timing.cameraSettleLayout : timing.cameraSettleAssembly;
    const elapsed = getPanelSimulationPlaybackElapsed(playback) - cameraSettleDelay - frameState.sequenceIndex * (panelSimulationPhase === 'layout' ? timing.layoutDelayStep : timing.assemblyDelayStep);
    if (elapsed < 0) {
      group.visible = true;
      group.position.copy(frameState.startPosition);
      group.quaternion.copy(frameState.startQuaternion);
      group.scale.copy(frameState.startScale);
      return;
    }
    if (group.visible === false) {
      group.visible = true;
    }

    const progress = getPanelSimulationStyleProgress(playback.panelSimulationAnimationStyle, elapsed / (panelSimulationPhase === 'layout' ? timing.layoutDuration : timing.duration));
    group.position.copy(frameState.startPosition).lerp(frameState.targetPosition, progress);
    group.quaternion.copy(frameState.startQuaternion).slerp(frameState.targetQuaternion, progress);
    group.scale.copy(frameState.startScale).lerp(frameState.targetScale, progress);
  });

  // Shadow auto-update enabled - manual shadow updates removed

  return (
    <group ref={groupRef} position={position} visible={!isExcludedByOptimizer}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh
          name={`furniture-mesh${panelName ? `-${panelName}` : ''}`}
          geometry={geometry}
          material={meshMaterial as any}
          userData={{
            ...(furnitureId ? { furnitureId } : {}),
            ...(panelName ? { panelName } : {}),
            ...(compositeKeyForCleanup ? { liveDimensionKey: compositeKeyForCleanup } : {}),
            liveDimension: {
              widthMm: Math.round(safeArgs[0] / 0.01),
              heightMm: Math.round(safeArgs[1] / 0.01),
              depthMm: Math.round(safeArgs[2] / 0.01),
              useObjectBounds: true,
            },
          }}
          receiveShadow={viewMode === '3D' && !isEditMode && shadowEnabled}
          castShadow={viewMode === '3D' && !isEditMode && shadowEnabled}
          renderOrder={isEditMode ? 999 : 10}
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        />
      )}
      {(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front')) && doorEdgeBandingStrip && doorEdgeBandingColor && renderMode === 'solid' && (
        <group
          name={`door-edge-banding${panelName ? `-${panelName}` : ''}`}
          userData={{ decoration: true, edgeBandingOverlay: true }}
        >
          {(viewMode === '2D' ? [doorEdgeBandingStrip.frontZ] : [doorEdgeBandingStrip.frontZ, doorEdgeBandingStrip.backZ]).map((z, faceIndex) => (
            <React.Fragment key={`door-edge-face-${faceIndex}`}>
              <mesh position={[0, safeArgs[1] / 2 - doorEdgeBandingStrip.strip / 2, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.horizontalWidth, doorEdgeBandingStrip.strip, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={doorEdgeBandingColor} toneMapped={false} depthTest={true} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, -safeArgs[1] / 2 + doorEdgeBandingStrip.strip / 2, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.horizontalWidth, doorEdgeBandingStrip.strip, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={doorEdgeBandingColor} toneMapped={false} depthTest={true} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[-safeArgs[0] / 2 + doorEdgeBandingStrip.strip / 2, 0, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.strip, doorEdgeBandingStrip.verticalHeight, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={doorEdgeBandingColor} toneMapped={false} depthTest={true} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[safeArgs[0] / 2 - doorEdgeBandingStrip.strip / 2, 0, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.strip, doorEdgeBandingStrip.verticalHeight, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={doorEdgeBandingColor} toneMapped={false} depthTest={true} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            </React.Fragment>
          ))}
        </group>
      )}
      {/* 윤곽선 렌더링 - 3D에서 더 강력한 렌더링
          ※ 가구 선택(고스트) 상태에서 도어 외곽선은 흰색으로 (3D 전용) */}
      {viewMode === '3D' ? (
        <lineSegments name={`furniture-edge${panelName ? `-${panelName}` : ''}`} geometry={edgesGeometry} renderOrder={isEditMode ? 1000 : 10}>
          <lineBasicMaterial
            color={isEditMode ? '#ffffff' : (renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : "#505050")}
            transparent={renderMode !== 'wireframe'}
            opacity={isEditMode ? 0.9 : (renderMode === 'wireframe' ? 1.0 : 0.9)}
            depthTest={true}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        </lineSegments>
      ) : (
        ((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
          <lineSegments name="door-edge" geometry={edgesGeometry} renderOrder={1001}>
            <lineBasicMaterial
              color={viewMode === '2D' ? (isLocked ? "#FF0000" : "#18CF23") : (renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : (view2DTheme === 'dark' ? "#999999" : "#444444"))}
              linewidth={viewMode === '2D' ? 3 : 0.5}
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
        )
      )}
    </group>
  );
};

const GlassDoorAssemblySource: React.FC<{
  sourceKey: string;
  furnitureId?: string;
  panelName: string;
  args: [number, number, number];
  material?: THREE.Material;
  children: React.ReactNode;
}> = ({ sourceKey, furnitureId, panelName, args, material, children }) => {
  const groupRef = React.useRef<THREE.Group>(null);
  const assemblySourceSignatureRef = React.useRef<string | null>(null);
  const { viewMode } = useSpace3DView();
  const panelSimulationRevision = useUIStore(state => state.panelSimulationRevision);
  const panelSimulationPhase = useUIStore(state => state.panelSimulationPhase);
  const panelSimulationViewBackup = useUIStore(state => state.panelSimulationViewBackup);
  const registryKey = furnitureId ? `accessory::${furnitureId}::${sourceKey}` : null;

  useEffect(() => {
    return () => {
      if (registryKey) removePanelSimulationSource(registryKey);
      assemblySourceSignatureRef.current = null;
    };
  }, [registryKey]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const isPanelSimulationPresentation = viewMode === '3D' && panelSimulationRevision > 0 && (panelSimulationPhase === 'layout' || !!panelSimulationViewBackup);
    if (isPanelSimulationPresentation && furnitureId && registryKey) {
      const signature = `${getPanelSimulationSourceRegistryVersion()}:${panelSimulationRevision}:${panelSimulationPhase}:${registryKey}:${args.join(',')}`;
      if (assemblySourceSignatureRef.current !== signature) {
        updatePanelSimulationSource({
          key: registryKey,
          furnitureId,
          panelName,
          args,
          object: group,
          material,
          assemblyOnly: true,
          shape: 'glassDoor',
        });
        assemblySourceSignatureRef.current = signature;
      }
      group.visible = false;
      return;
    }
    group.visible = true;
  });

  return (
    <group ref={groupRef}>
      {children}
    </group>
  );
};

interface DoorModuleProps {
  moduleWidth: number; // 가구 폭 (mm) - 무시됨, 도어는 항상 원래 슬롯 크기
  moduleDepth: number; // 가구 깊이 (mm)
  hingePosition?: 'left' | 'right'; // 힌지 위치 (기본값: right)
  spaceInfo: SpaceInfo;
  color?: string;
  doorXOffset?: number; // 도어 위치 보정값 (사용하지 않음)
  originalSlotWidth?: number; // 원래 슬롯 너비 (mm) - 도어 크기는 이 값 사용
  slotCenterX?: number; // 원래 슬롯 중심 X 좌표 (Three.js 단위) - 도어 위치는 이 값 사용
  moduleData?: any; // 실제 듀얼캐비넷 분할 정보를 위한 모듈 데이터
  isDragging?: boolean; // 드래그 상태
  isEditMode?: boolean; // 편집 모드 여부
  slotWidths?: number[]; // 듀얼 가구의 경우 개별 슬롯 너비 배열 [left, right]
  slotIndex?: number; // 슬롯 인덱스 (노서라운드 모드에서 엔드패널 확장 판단용)
  floatHeight?: number; // 플로팅 높이 (mm) - 띄워서 배치 시 도어 높이 조정용
  doorTopGap?: number; // 천장에서 아래로의 갭 (mm, 기본값: 5)
  doorBottomGap?: number; // 바닥에서 위로의 갭 (mm, 기본값: 25)
  furnitureId?: string; // 가구 ID (개별 도어 제어용)
  textureUrl?: string; // 텍스처 URL
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' }; // 패널별 결 방향
  zone?: 'normal' | 'dropped'; // 단내림 영역 정보
  internalHeight?: number; // 자유배치 시 실제 가구 높이 (mm) - freeHeight
  isFreePlacement?: boolean; // 자유배치 모드 여부
  topFrameThickness?: number; // 개별 가구 상단몰딩 두께 (mm) — 도어 상단 갭 계산용
  hasBase?: boolean; // 걸래받이 존재 여부 (false면 받침대 없음)
  individualFloatHeight?: number; // 개별 띄움 높이 (mm) - hasBase=false일 때 가구 Y오프셋 보정용
  individualBaseFrameHeight?: number; // 개별 받침대 높이 (mm) - 슬롯별 걸래받이 높이 조정용
  parentGroupY?: number; // 부모 그룹(가구)의 Y 위치 (Three.js 단위) — 도어 Y 보정용
  forcedDoorHeightMm?: number; // 도어 높이 강제 지정 (mm) — 도어 분절용
  forcedDoorYMm?: number; // 도어 중심 Y 위치 강제 지정 (mm, 가구 중심 기준) — 도어 분절용
  hideWidthDimension?: boolean; // 도어 가로 폭 치수 숨김 (분절 상부 도어용)
  hingeMode?: 'auto' | 'upper2' | 'lower4' | 'lower5'; // 경첩 개수 강제 — 도어분절 가구용
  splitDoorPanelName?: '하부 도어' | '상부 도어'; // 도어분절 가구의 패널 목록 이름
  splitDoorTopGapMm?: number; // 하부 분절 도어 상단의 도어 간격
  splitDoorBottomGapMm?: number; // 상부 분절 도어 하단의 도어 간격
  hingePositionsMm?: number[];
  upperDoorHingePositionsMm?: number[];
  lowerDoorHingePositionsMm?: number[];
}

const DoorModule: React.FC<DoorModuleProps> = ({
  moduleWidth,
  moduleDepth,
  hingePosition = 'right',
  spaceInfo,
  color,
  doorXOffset = 0, // 사용하지 않음
  originalSlotWidth,
  slotCenterX,
  moduleData,
  isDragging = false,
  isEditMode = false,
  slotWidths,
  slotIndex,
  floatHeight: floatHeightProp,
  doorTopGap: doorTopGapProp, // 개별 가구 doorTopGap (undefined면 글로벌 → 기본값 순서로 fallback)
  doorBottomGap: doorBottomGapProp, // 개별 가구 doorBottomGap
  furnitureId, // 가구 ID
  textureUrl, // 텍스처 URL
  panelGrainDirections, // 패널별 결 방향
  zone, // 단내림 영역 정보
  internalHeight, // 자유배치 시 실제 가구 높이 (mm)
  isFreePlacement = false, // 자유배치 모드 여부
  topFrameThickness: perFurnitureTopFrame, // 개별 가구 상단몰딩 두께
  hasBase: hasBaseProp, // 걸래받이 존재 여부
  individualFloatHeight: individualFloatHeightProp, // 개별 띄움 높이
  individualBaseFrameHeight: individualBaseFrameHeightProp, // 개별 받침대 높이
  parentGroupY: parentGroupYProp, // 부모 그룹 Y 위치
  forcedDoorHeightMm, // 도어 높이 강제 (도어 분절)
  forcedDoorYMm, // 도어 Y 강제 (도어 분절)
  hideWidthDimension = false, // 도어 가로 폭 치수 숨김
  hingeMode = 'auto', // 경첩 개수 모드
  splitDoorPanelName,
  splitDoorTopGapMm,
  splitDoorBottomGapMm,
  hingePositionsMm,
  upperDoorHingePositionsMm,
  lowerDoorHingePositionsMm,
}) => {
  const storeSpaceInfo = useSpaceConfigStore(state => state.spaceInfo);
  const placementType = (storeSpaceInfo?.baseConfig?.placementType) ?? (spaceInfo?.baseConfig?.placementType);
  const storeFloatHeight = storeSpaceInfo?.baseConfig?.floatHeight;
  const propFloatHeight = floatHeightProp ?? spaceInfo?.baseConfig?.floatHeight;
  const floatHeightSource = storeFloatHeight !== undefined ? storeFloatHeight : (propFloatHeight ?? 0);
  const floatHeight = placementType === 'float' ? floatHeightSource : 0;
  // Store에서 재질 설정과 도어 상태 가져오기
  const { doorsOpen, view2DDirection, view2DTheme, isIndividualDoorOpen, toggleIndividualDoor, selectedSlotIndex, showDimensions, highlightedDoorGap, hingePositionEditModeModuleId, isTransparentMode, panelSimulationPhase, panelSimulationViewBackup, activePlacementWall } = useUIStore() as any;
  const { renderMode, viewMode, plainMaterial: isPlainMaterial } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { doorDimensionColor } = useDimensionColor(); // 도어 치수 색상

  const isPanelSimulationPresentation = viewMode === '3D' && (panelSimulationPhase === 'layout' || !!panelSimulationViewBackup);
  const effectiveShowDimensions = isPanelSimulationPresentation ? false : showDimensions;
  const isDummyDoorModule = isDummyModuleId(moduleData?.id);
  const isSide2DView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');
  const isHingePositionEditMode = !!furnitureId && hingePositionEditModeModuleId === furnitureId;
  const [hingeGapDrafts, setHingeGapDrafts] = useState<Record<string, string>>({});
  const [hingeGapEditBases, setHingeGapEditBases] = useState<Record<string, { topDistancesMm: number[]; doorHeightMm: number }>>({});
  const [isDoorDimensionHovered, setIsDoorDimensionHovered] = useState(false);
  const doorDimensionHoverColor = '#0b3d91';
  const activeDoorDimensionColor = isDoorDimensionHovered ? doorDimensionHoverColor : doorDimensionColor;
  const doorDimensionHoverHandlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setIsDoorDimensionHovered(true);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setIsDoorDimensionHovered(false);
    },
  };

  // doorsOpen: true=전체열기, false=전체닫기, null=개별상태 사용
  const useIndividualState = furnitureId !== undefined;
  const requestedDoorOpen = doorsOpen !== null
    ? doorsOpen
    : (useIndividualState ? isIndividualDoorOpen(furnitureId, 0) : false);
  const isDoorOpen = isDummyDoorModule ? false : requestedDoorOpen;

  // props로 받은 spaceInfo를 우선 사용, 없으면 store에서 가져오기
  const currentSpaceInfo = spaceInfo || storeSpaceInfo;
  const materialConfig = isPlainMaterial
    ? { interiorColor: '#FFFFFF', doorColor: '#E0E0E0' }
    : (currentSpaceInfo.materialConfig || { interiorColor: '#FFFFFF', doorColor: '#E0E0E0' });

// console.log('🎨🎨🎨 DoorModule materialConfig:', {
    // doorTexture: materialConfig.doorTexture,
    // interiorTexture: materialConfig.interiorTexture,
    // doorColor: materialConfig.doorColor,
    // propTextureUrl: textureUrl,
    // doorTexture_equals_interiorTexture: materialConfig.doorTexture === materialConfig.interiorTexture
  // });

  // 색상 설정: color prop이 있으면 사용, 없으면 현재 spaceInfo의 도어 색상 사용
  let doorColor = color || materialConfig.doorColor;
  // 혹시라도 rgba/hex8 등 알파값이 포함된 경우 알파값 무시 (불투명 hex로 변환)
  if (typeof doorColor === 'string') {
    // hex8 (#RRGGBBAA) → hex6 (#RRGGBB)
    if (/^#([0-9a-fA-F]{8})$/.test(doorColor)) {
      doorColor = '#' + doorColor.slice(1, 7);
    }
    // rgba() → rgb()로 변환
    if (/^rgba\(/.test(doorColor)) {
      const rgb = doorColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) {
        doorColor = `#${(+rgb[1]).toString(16).padStart(2, '0')}${(+rgb[2]).toString(16).padStart(2, '0')}${(+rgb[3]).toString(16).padStart(2, '0')}`;
      }
    }
  }
  
  // 도어 색상/텍스처 밝기 기반 대각선 점선 색상 결정
  // 어두운 도어 → 흰색 점선, 밝은 도어 → 테마색 점선
  const doorTextureUrl = materialConfig.doorTexture || undefined;

  // hex 색상 기반 밝기 (텍스처 없을 때 사용)
  const colorLuminance = React.useMemo(() => {
    const hex = typeof doorColor === 'string' ? doorColor : '#E0E0E0';
    const match = hex.match(/^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
    if (!match) return 0.8;
    const r = parseInt(match[1], 16) / 255;
    const g = parseInt(match[2], 16) / 255;
    const b = parseInt(match[3], 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }, [doorColor]);

  // 텍스처 이미지 평균 밝기 계산
  const [textureLuminance, setTextureLuminance] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!doorTextureUrl) {
      setTextureLuminance(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 32; // 작은 크기로 샘플링 (성능)
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let totalLum = 0;
      const pixelCount = size * size;
      for (let i = 0; i < data.length; i += 4) {
        totalLum += 0.2126 * (data[i] / 255) + 0.7152 * (data[i + 1] / 255) + 0.0722 * (data[i + 2] / 255);
      }
      setTextureLuminance(totalLum / pixelCount);
    };
    img.src = doorTextureUrl;
  }, [doorTextureUrl]);

  const isDoorDark = (textureLuminance !== null ? textureLuminance : colorLuminance) < 0.5;

  // 기본 도어 재질 생성 (BoxWithEdges에서 재처리됨)
  const { theme } = useViewerTheme();
  // BoxWithEdges와 동일한 강조색 함수
  const getThemeColor = () => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  };

  // 3D 뷰 대각선 점선 색상: 도어 밝기에 따라 결정 (가구 고스트 상태에선 흰색 강제)
  const diagonalLineColor3D = isEditMode ? '#FFFFFF' : (isDoorDark ? '#FFFFFF' : getThemeColor());
  // 도어 재질 생성 함수 (듀얼 가구용 개별 재질 생성) - 초기 생성용
  const createDoorMaterial = useCallback(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#E0E0E0'), // 기본 회색으로 생성
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(0x000000),
    });
  }, []); // 의존성 배열 비움 - 한 번만 생성

  // 싱글 가구용 도어 재질 - 한 번만 생성 (성능 최적화)
  const doorMaterial = useMemo(() => {
    return createDoorMaterial();
  }, [createDoorMaterial]);

  // 듀얼 가구용 왼쪽 도어 재질 (별도 인스턴스) - 한 번만 생성 (성능 최적화)
  const leftDoorMaterial = useMemo(() => {
    return createDoorMaterial();
  }, [createDoorMaterial]);

  // 듀얼 가구용 오른쪽 도어 재질 (별도 인스턴스) - 한 번만 생성 (성능 최적화)
  const rightDoorMaterial = useMemo(() => {
    return createDoorMaterial();
  }, [createDoorMaterial]);

  // material ref 저장
  const doorMaterialRef = React.useRef(doorMaterial);
  const leftDoorMaterialRef = React.useRef(leftDoorMaterial);
  const rightDoorMaterialRef = React.useRef(rightDoorMaterial);

  React.useEffect(() => {
    doorMaterialRef.current = doorMaterial;
    leftDoorMaterialRef.current = leftDoorMaterial;
    rightDoorMaterialRef.current = rightDoorMaterial;
  }, [doorMaterial, leftDoorMaterial, rightDoorMaterial]);

  // 재질 속성 업데이트 (재생성 없이) - 성능 최적화
  // 중요: mat.map은 절대 건드리지 않음! 텍스처는 별도 useEffect에서만 관리
  // plainMaterial 모드(CNC 옵티마이저)에서는 PanelDimmer가 재질을 직접 제어하므로 건너뜀
  useEffect(() => {
    if (isPlainMaterial) return;
    const materials = [doorMaterialRef.current, leftDoorMaterialRef.current, rightDoorMaterialRef.current];
    materials.forEach((mat) => {
      if (mat) {
        // 편집 모드일 때 설정
        if (isEditMode || isDragging) {
          mat.transparent = true;
          mat.opacity = 0.3;
          mat.color.set(getThemeColor());
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
        } else if (viewMode === '2D') {
          if (view2DDirection === 'front') {
            // 정면뷰: early return으로 처리되므로 여기는 도달하지 않음
            // (2D 정면뷰에서는 분기 전 planeGeometry overlay로 대체됨)
            mat.transparent = true;
            mat.opacity = 0;
            mat.depthWrite = false;
          } else {
            mat.color.set('#18CF23');
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.depthWrite = true;
            mat.side = THREE.FrontSide;
          }
        } else if (renderMode === 'wireframe') {
          mat.transparent = true;
          mat.opacity = 0.3;
          mat.depthWrite = true;
          if (!mat.map) {
            mat.color.set(doorColor);
          }
        } else {
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.depthWrite = true;
          mat.depthTest = true;
          mat.side = THREE.FrontSide;
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0.0;
          if (!mat.map) {
            mat.color.set(doorColor);
          }
        }

        mat.needsUpdate = true;
      }
    });
  }, [doorColor, isDragging, isEditMode, viewMode, renderMode, view2DDirection, view2DTheme, isPlainMaterial, isTransparentMode]);

  // 편집/드래그/2D 모드일 때 텍스처 제거
  useEffect(() => {
    if (isEditMode || isDragging || viewMode === '2D') {
      [doorMaterialRef.current, leftDoorMaterialRef.current, rightDoorMaterialRef.current].forEach(mat => {
        if (mat && mat.map) {
          mat.map = null;
          mat.needsUpdate = true;
        }
      });
    }
  }, [isEditMode, isDragging, viewMode]);

  // Shadow auto-update enabled - manual shadow updates removed

  // 스토어에서 직접 placedModule 정보 가져오기 (자유배치 감지 + panelGrainDirections)
  const storePlacedModule = useFurnitureStore(state => {
    if (!furnitureId) return undefined;
    return state.placedModules.find(m => m.id === furnitureId);
  });
  // 자유배치 감지: 3단 fallback (가장 확실한 것부터)
  // 1. spaceConfigStore의 layoutMode (전역 설정, 가장 확실)
  // 2. store의 placedModule.isFreePlacement (개별 모듈)
  // 3. props isFreePlacement (부모에서 전달)
  const isLayoutModeFree = storeSpaceInfo?.layoutMode === 'free-placement';
  const isFree = isLayoutModeFree || isFreePlacement || (storePlacedModule?.isFreePlacement ?? false);
  const storeFreeWidth = storePlacedModule?.freeWidth;
  const storeFreeHeight = storePlacedModule?.freeHeight;
  const storeCustomHeight = storePlacedModule?.customHeight;
  const storeHeightFallback = moduleData?.category === 'upper'
    ? (storeCustomHeight ?? storeFreeHeight)
    : (storeFreeHeight ?? storeCustomHeight);
  // 실제 사용할 높이: 부모 렌더 높이 > 스토어 수동 높이 > 모듈 기본값
  const effectiveInternalHeight = internalHeight ?? storeHeightFallback;

  // 자유배치 EP 역보정: 부모 group이 freeEpOffsetX만큼 밀렸으므로 도어는 반대로 되돌림
  // (도어는 원래 freeWidth 크기 그대로, 가구 중심에 위치해야 함)
  let freeEpReverseX = 0;
  if (isFree && storePlacedModule && !storePlacedModule.customConfig) {
    const epThk = (storePlacedModule.endPanelThickness || 18.5) * 0.01; // mm → Three.js
    const leftEp = storePlacedModule.hasLeftEndPanel ? epThk : 0;
    const rightEp = storePlacedModule.hasRightEndPanel ? epThk : 0;
    freeEpReverseX = -(leftEp - rightEp) / 2; // 부모 offset의 반대
  }

// console.log('🚪🔵🔵🔵 DoorModule 자유배치 감지:', {
    // furnitureId,
    // isLayoutModeFree,
    // isFreePlacement_prop: isFreePlacement,
    // storePlacedModule_exists: !!storePlacedModule,
    // storePlacedModule_isFreePlacement: storePlacedModule?.isFreePlacement,
    // isFree,
    // storeFreeWidth,
    // storeFreeHeight,
    // internalHeight,
    // effectiveInternalHeight,
    // moduleWidth,
    // originalSlotWidth,
    // moduleDataId: moduleData?.id
  // });

  const storePanelGrainDirections = storePlacedModule?.panelGrainDirections;

  // 스토어에서 가져온 값 우선, 없으면 props 사용
  const activePanelGrainDirections = storePanelGrainDirections || panelGrainDirections;

// console.log('🔥 DoorModule - panelGrainDirections 소스:', {
    // furnitureId,
    // fromStore: !!storePanelGrainDirections,
    // fromProps: !!panelGrainDirections,
    // final: activePanelGrainDirections,
    // storePanelGrainDirections,
    // propsPanelGrainDirections: panelGrainDirections
  // });

  // 텍스처 적용 함수 (성능 최적화)
  const getDoorPanelName = useCallback((doorSide: 'single' | 'left' | 'right') => {
    if (doorSide === 'single') {
      return '도어';
    }
    const sideLabel = doorSide === 'left' ? '(좌)' : '(우)';
    return `도어${sideLabel}`;
  }, []);

  const applyTextureToMaterial = useCallback((material: THREE.MeshStandardMaterial, textureUrl: string | undefined, doorSide: string, panelNameHint?: string) => {
    if (textureUrl && material) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isOakTexture(textureUrl)) {
        applyOakTextureSettings(material);
      } else if (isCabinetTexture1(textureUrl)) {
        applyCabinetTexture1Settings(material);
      }

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);

          // 도어 나무결 방향 결정 (activePanelGrainDirections 우선)
          const defaultPanelName = doorSide === '왼쪽'
            ? getDoorPanelName('left')
            : doorSide === '오른쪽'
              ? getDoorPanelName('right')
              : getDoorPanelName('single');
          const resolvedPanelName = panelNameHint || defaultPanelName;
          const grainDirection = resolvePanelGrainDirection(resolvedPanelName, activePanelGrainDirections) || 'vertical';

          texture.rotation = grainDirection === 'vertical' ? Math.PI / 2 : 0;
          texture.center.set(0.5, 0.5); // 중심점 기준 회전

          material.map = texture;

          // Oak 또는 Cabinet Texture1인 경우 전용 설정 적용
          if (isOakTexture(textureUrl)) {
            applyOakTextureSettings(material);
          } else if (isCabinetTexture1(textureUrl)) {
            applyCabinetTexture1Settings(material);
          } else {
            applyDefaultImageTextureSettings(material);
          }

          material.needsUpdate = true;

// console.log(`🚪 ${doorSide} 텍스처 로드 완료:`, {
            // hasMap: !!material.map,
            // mapImage: material.map?.image?.src,
            // color: material.color.getHexString(),
            // toneMapped: material.toneMapped,
            // roughness: material.roughness,
            // isOakTexture: isOakTexture(textureUrl),
            // isCabinetTexture1: isCabinetTexture1(textureUrl)
          // });
          
          // 강제 리렌더링을 위해 다음 프레임에서 한번 더 업데이트
          requestAnimationFrame(() => {
            material.needsUpdate = true;
          });
        },
        undefined,
        (error) => {
          console.error(`❌ ${doorSide} 도어 텍스처 로딩 실패:`, textureUrl, error);
        }
      );
    } else if (material) {
      // 텍스처가 없으면 맵 제거하고 기본 색상으로 복원
      if (material.map) {
        material.map.dispose(); // 기존 텍스처 메모리 해제
        material.map = null;
      }
      material.color.set(doorColor);
      material.toneMapped = true; // 기본 톤 매핑 복원
      material.roughness = 0.6; // 기본 거칠기 복원
      material.needsUpdate = true;
    }
  }, [doorColor, activePanelGrainDirections, getDoorPanelName]);

  // activePanelGrainDirections 변경 시 기존 텍스처 회전 업데이트
  // JSON.stringify를 사용하여 객체 내부 값 변경을 감지
  const activePanelGrainDirectionsStr = activePanelGrainDirections ? JSON.stringify(activePanelGrainDirections) : '';

  useEffect(() => {
    const panelNames = {
      single: getDoorPanelName('single'),
      left: getDoorPanelName('left'),
      right: getDoorPanelName('right')
    };

    const resolveRotation = (panelNameHint: string) => {
      const direction = resolvePanelGrainDirection(panelNameHint, activePanelGrainDirections) || 'vertical';
      return direction === 'vertical' ? Math.PI / 2 : 0;
    };

    if (doorMaterial && doorMaterial.map) {
      doorMaterial.map.rotation = resolveRotation(panelNames.single);
      doorMaterial.map.center.set(0.5, 0.5);
      doorMaterial.map.needsUpdate = true;
      doorMaterial.needsUpdate = true;
    }

    if (leftDoorMaterial && leftDoorMaterial.map) {
      leftDoorMaterial.map.rotation = resolveRotation(panelNames.left);
      leftDoorMaterial.map.center.set(0.5, 0.5);
      leftDoorMaterial.map.needsUpdate = true;
      leftDoorMaterial.needsUpdate = true;
    }

    if (rightDoorMaterial && rightDoorMaterial.map) {
      rightDoorMaterial.map.rotation = resolveRotation(panelNames.right);
      rightDoorMaterial.map.center.set(0.5, 0.5);
      rightDoorMaterial.map.needsUpdate = true;
      rightDoorMaterial.needsUpdate = true;
    }
  }, [activePanelGrainDirectionsStr, doorMaterial, leftDoorMaterial, rightDoorMaterial, getDoorPanelName]);

  // 도어 텍스처 적용 (텍스처 URL 변경 시에만)
  // plainMaterial 모드(CNC 옵티마이저)에서는 PanelDimmer가 재질을 직접 제어하므로 건너뜀
  useEffect(() => {
    if (isPlainMaterial) return;
    // 도어 전용 텍스처만 사용 (내부재질 텍스처로 fallback하지 않음)
    // doorTexture가 명시적으로 설정된 경우에만 텍스처 적용, 그렇지 않으면 doorColor(단색) 사용
    const doorTextureUrl = materialConfig.doorTexture || undefined;
    const effectiveTextureUrl = doorTextureUrl;

// console.log('🚪🚪🚪 DoorModule 텍스처 적용 useEffect 실행:', {
      // doorTextureUrl,
      // effectiveTextureUrl,
      // doorColor,
      // isDragging,
      // isEditMode,
      // willApplyTexture: !isDragging && !isEditMode && !!effectiveTextureUrl
    // });

    const panelNames = {
      single: getDoorPanelName('single'),
      left: getDoorPanelName('left'),
      right: getDoorPanelName('right')
    };

    // 드래그 중이거나 편집 모드가 아닐 때 텍스처 처리
    if (!isDragging && !isEditMode) {
      if (effectiveTextureUrl) {
        // 텍스처가 있으면 적용
// console.log('🎨 도어 텍스처 적용 시작:', effectiveTextureUrl);

        if (doorMaterialRef.current) {
          applyTextureToMaterial(doorMaterialRef.current, effectiveTextureUrl, '싱글', panelNames.single);
        }
        if (leftDoorMaterialRef.current) {
          applyTextureToMaterial(leftDoorMaterialRef.current, effectiveTextureUrl, '왼쪽', panelNames.left);
        }
        if (rightDoorMaterialRef.current) {
          applyTextureToMaterial(rightDoorMaterialRef.current, effectiveTextureUrl, '오른쪽', panelNames.right);
        }
      } else {
        // 텍스처가 없으면 제거 (색상 재질로 변경)
// console.log('🗑️ 도어 텍스처 제거 (색상 재질로 변경)');
        [doorMaterialRef.current, leftDoorMaterialRef.current, rightDoorMaterialRef.current].forEach(mat => {
          if (mat && mat.map) {
            mat.map = null;
            mat.color.set(doorColor);
            mat.needsUpdate = true;
          }
        });
      }
    } else {
// console.log('⏭️ 도어 텍스처 적용 스킵:', {
        // reason: isDragging ? '드래그 중' : isEditMode ? '편집 모드' : '알 수 없음'
      // });
    }
  }, [materialConfig.doorTexture, materialConfig.interiorTexture, doorColor, applyTextureToMaterial, isDragging, isEditMode, getDoorPanelName, isPlainMaterial]);
  
  // 투명도 설정: renderMode에 따라 조정 (2D solid 모드에서도 투명하게)
  const opacity = renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid' ? 0.2 : 1.0);

  // 원본 spaceInfo 가져오기 (zone별로 분리되지 않은 전체 공간 정보)
  const { spaceInfo: originalSpaceInfo } = useSpaceConfigStore();

  // doorTopGap/doorBottomGap: 몸통(cabinet) 기준 (EP와 동일)
  // 상단갭 = 몸통 상단에서 위로 확장, 하단갭 = 몸통 하단에서 아래로 확장 (0이면 도어=몸통)
  const doorTopGap = doorTopGapProp ?? originalSpaceInfo.doorTopGap ?? 0;
  const doorBottomGap = doorBottomGapProp ?? originalSpaceInfo.doorBottomGap ?? 0;

  // 인덱싱 정보 계산 - 원본 spaceInfo 사용 + slotCustomWidth 재분할 반영
  const allPlacedModules = useFurnitureStore(state => state.placedModules);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const doorHeightDimensionSides = useMemo(() => {
    const totalSlotCount = (() => {
      if (originalSpaceInfo.droppedCeiling?.enabled) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(originalSpaceInfo, originalSpaceInfo.customColumnCount);
        return (zoneInfo.normal?.columnCount ?? 0) + (zoneInfo.dropped?.columnCount ?? 0);
      }
      return originalSpaceInfo.customColumnCount || calculateSpaceIndexing(originalSpaceInfo).slotWidths?.length || 0;
    })();
    const visibleModules = allPlacedModules
      .filter(module => !module.isSurroundPanel && module.hasDoor === true)
      .map((module, index) => {
        const moduleSlotIndex = module.slotIndex;
        const moduleRightSlotIndex = moduleSlotIndex !== undefined
          ? moduleSlotIndex + (module.isDualSlot ? 1 : 0)
          : undefined;
        return {
          id: module.id,
          x: module.position?.x ?? 0,
          index,
          slotIndex: moduleSlotIndex,
          isRightmostSlot: moduleRightSlotIndex !== undefined
            && totalSlotCount > 0
            && moduleRightSlotIndex >= totalSlotCount - 1
        };
      });

    return resolveDoorHeightDimensionSides(visibleModules, furnitureId);
  }, [allPlacedModules, furnitureId, originalSpaceInfo]);
  const baseDoorHeightDimensionSides = storePlacedModule?.placementWall === 'right'
    ? {
      left: doorHeightDimensionSides.right,
      right: doorHeightDimensionSides.left
    }
    : doorHeightDimensionSides;
  const hasOuterDoorDimensionSide = baseDoorHeightDimensionSides.left || baseDoorHeightDimensionSides.right;
  const effectiveDoorHeightDimensionSides = hasOuterDoorDimensionSide
    ? baseDoorHeightDimensionSides
    : isEditMode
      ? ((storePlacedModule?.position?.x ?? slotCenterX ?? 0) >= 0
        ? { left: false, right: true }
        : { left: true, right: false })
      : { left: false, right: false };
  const sideDoorDimensionVisible = storePlacedModule?.placementWall === 'left' || storePlacedModule?.placementWall === 'right'
    ? viewMode === '3D' && activePlacementWall === storePlacedModule.placementWall
    : true;
  const showDoorDimensionGuides = shouldRenderDoorDimensionGuides(
    effectiveShowDimensions,
    isPlainMaterial,
    viewMode,
    view2DDirection
  ) && !isHingePositionEditMode && sideDoorDimensionVisible;

  const indexing = useMemo(() => {
    const base = calculateSpaceIndexing(originalSpaceInfo);
    const hasCustomWidths = allPlacedModules.some(m => m.slotCustomWidth !== undefined);
    return hasCustomWidths ? recalculateWithCustomWidths(base, allPlacedModules) : base;
  }, [originalSpaceInfo, allPlacedModules]);

  // 단내림 구간인 경우 영역별 슬롯 정보 계산 - 원본 spaceInfo로 계산
  let effectiveColumnWidth = indexing.columnWidth;
  if (originalSpaceInfo.droppedCeiling?.enabled && zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(originalSpaceInfo, originalSpaceInfo.customColumnCount);

    if (zone === 'dropped' && zoneInfo.dropped) {
      effectiveColumnWidth = zoneInfo.dropped.columnWidth;
// console.log('🚪📏 단내림 구간 슬롯 너비 사용:', {
        // zone,
        // droppedColumnWidth: zoneInfo.dropped.columnWidth,
        // normalColumnWidth: indexing.columnWidth
      // });
    } else if (zone === 'normal' && zoneInfo.normal) {
      effectiveColumnWidth = zoneInfo.normal.columnWidth;
// console.log('🚪📏 메인 구간 슬롯 너비 사용:', {
        // zone,
        // normalColumnWidth: zoneInfo.normal.columnWidth
      // });
    }
  }

  const moduleIdentifier = moduleData?.id || storePlacedModule?.moduleId || '';
  const isRightCornerCabinet = moduleIdentifier.includes('right-corner');
  const isLeftCornerCabinet = moduleIdentifier.includes('left-corner');
  const isCornerCabinet = isRightCornerCabinet || isLeftCornerCabinet;
  const isRightCornerSideDoor = moduleData?.id?.includes('side-corner-door') || false;
  const isRightCornerMainDoor = isCornerCabinet && !isRightCornerSideDoor;

  // 듀얼 가구인지 판단: moduleData ID 또는 PlacedModule.isDualSlot (커스텀 가구 지원)
  const isDualByModuleId = !isRightCornerSideDoor && (moduleData?.id?.startsWith('dual-') || storePlacedModule?.isDualSlot || false);

  // 도어 크기 계산 — 가구 본체와 동일한 slotWidths(Math.floor) 기준 사용
  // columnWidth는 소수점이 유지되지만, 가구 본체는 slotWidths(정수 내림)를 사용하므로
  // 도어도 slotWidths 기준을 사용해야 doorGap이 정확히 3mm가 됨
  let actualDoorWidth: number;

  if (isFree) {
    // 자유배치: store에서 가져온 freeWidth 또는 props moduleWidth 사용
    actualDoorWidth = isRightCornerSideDoor ? moduleWidth : (storeFreeWidth || moduleWidth);
  } else if (
    (storePlacedModule?.placementWall === 'left' || storePlacedModule?.placementWall === 'right') &&
    typeof (storePlacedModule as any)?.sideLogicalWidth === 'number'
  ) {
    actualDoorWidth = (storePlacedModule as any).sideLogicalWidth;
  } else if (storePlacedModule?.slotCustomWidth !== undefined) {
    // slotCustomWidth가 있으면 최우선 사용 (사용자가 슬롯 너비를 조정한 경우)
    actualDoorWidth = storePlacedModule.slotCustomWidth;
  } else {
    // 슬롯 배치: slotWidths(가구 본체와 동일 기준) 우선, 없으면 effectiveColumnWidth fallback
    const storeSlotIndex = storePlacedModule?.slotIndex;
    let slotBasedWidth: number | undefined;

    if (originalSpaceInfo.droppedCeiling?.enabled && zone) {
      // 단내림 구간: zoneInfo의 slotWidths 사용
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(originalSpaceInfo, originalSpaceInfo.customColumnCount);
      const targetZone = zone === 'dropped' ? zoneInfo.dropped : zoneInfo.normal;
      if (targetZone?.slotWidths && storeSlotIndex !== undefined) {
        // zone 내 로컬 인덱스 계산
        const localIndex = zone === 'dropped'
          ? storeSlotIndex - (zoneInfo.normal?.columnCount ?? 0)
          : storeSlotIndex;
        if (localIndex >= 0 && localIndex < targetZone.slotWidths.length) {
          slotBasedWidth = targetZone.slotWidths[localIndex];
        }
      }
    } else {
      // 단내림 없는 일반 구간: indexing.slotWidths 사용
      if (indexing.slotWidths && storeSlotIndex !== undefined && indexing.slotWidths[storeSlotIndex] !== undefined) {
        slotBasedWidth = indexing.slotWidths[storeSlotIndex];
      }
    }

    if (isDualByModuleId) {
      actualDoorWidth = slotBasedWidth !== undefined ? slotBasedWidth * 2 : effectiveColumnWidth * 2;
    } else {
      actualDoorWidth = slotBasedWidth !== undefined ? slotBasedWidth : effectiveColumnWidth;
    }
  }

  // === Insert 프레임 인접 시 도어 24.5mm 확장 ===
  // Insert 프레임(외경 136) 인접 도어 확장량
  // 도어는 doorGap=3 (가구 슬롯 너비에서 3mm 차감, 양쪽 1.5mm씩 안쪽 갭)
  // 좌측 가구 우측 도어 가장자리 = 가구 우측 끝 - 1.5 + 47 = 가구 우측 끝 + 45.5 (인서트 안쪽 45.5mm)
  // 양쪽 합 = 91 → 인서트 136 - 91 = 두 도어 사이 45mm
  const INSERT_FRAME_DOOR_EXTENSION_MM = 47;
  const insertFrameAdjacency = useMemo(() => {
    if (!storePlacedModule) return { left: false, right: false };

    const isInsert = (m: any) => typeof m?.moduleId === 'string' && m.moduleId.includes('insert-frame');

    // 자유배치 모드: x좌표 기반 인접성 판단
    if (storePlacedModule.isFreePlacement) {
      // groupId가 같으면 무조건 인접 (듀얼 빌트인 냉장고장 그룹: 좌힌지+인서트+우힌지)
      const myGroupId = (storePlacedModule as any).groupId;
      if (myGroupId) {
        const groupInsertFrames = allPlacedModules.filter(m =>
          (m as any).groupId === myGroupId && isInsert(m) && m.id !== storePlacedModule.id
        );
        if (groupInsertFrames.length > 0) {
          // 같은 그룹의 인서트 프레임이 있으면 위치 비교로 좌/우 판단
          const myX = storePlacedModule.position?.x ?? 0;
          let leftAdj = false, rightAdj = false;
          groupInsertFrames.forEach(m => {
            const mx = m.position?.x ?? 0;
            if (mx < myX) leftAdj = true;
            else rightAdj = true;
          });
          return { left: leftAdj, right: rightAdj };
        }
      }

      const myX = storePlacedModule.position?.x ?? 0;
      // 자유배치 가구는 freeWidth, 그 외에는 customWidth 사용
      const getWidthThree = (m: any) => {
        const w = m.freeWidth ?? m.customWidth ?? m.moduleWidth ?? 0;
        return w * 0.01;
      };
      const myWidth = getWidthThree(storePlacedModule);
      const myLeft = myX - myWidth / 2;
      const myRight = myX + myWidth / 2;
      const TOL = 0.5; // 50mm 허용 오차 (three units) — 자유배치 가구 사이 여유분/도어 두께 대응

      const isAdjFree = (m: any) =>
        m.isFreePlacement && isInsert(m) && m.id !== storePlacedModule.id;

      // 빌트인 냉장고장 자체에서 호출되는 경우만 적용 (인서트 프레임 자기 자신은 제외)
      const isInsertSelf = isInsert(storePlacedModule);
      if (isInsertSelf) {
        return { left: false, right: false };
      }

      const left = allPlacedModules.some(m => {
        if (!isAdjFree(m)) return false;
        const mx = m.position?.x ?? 0;
        const mw = getWidthThree(m);
        // 인서트 프레임이 내 왼쪽에 있으면 도어 좌측 확장
        return mx < myX && Math.abs((mx + mw / 2) - myLeft) <= TOL;
      });
      const right = allPlacedModules.some(m => {
        if (!isAdjFree(m)) return false;
        const mx = m.position?.x ?? 0;
        const mw = getWidthThree(m);
        // 인서트 프레임이 내 오른쪽에 있으면 도어 우측 확장
        return mx > myX && Math.abs((mx - mw / 2) - myRight) <= TOL;
      });
      return { left, right };
    }

    const myZone = storePlacedModule.zone || 'normal';
    const mySlot = storePlacedModule.slotIndex;
    if (mySlot === undefined) return { left: false, right: false };

    const inSameZone = (m: any) => (m.zone || 'normal') === myZone && !m.isFreePlacement;
    const isDualSelf = !!storePlacedModule.isDualSlot;
    const rightEdge = isDualSelf ? mySlot + 1 : mySlot;

    const left = allPlacedModules.some(m =>
      m.id !== storePlacedModule.id && inSameZone(m) && isInsert(m) &&
      (m.slotIndex === mySlot - 1 || (m.isDualSlot && m.slotIndex === mySlot - 2))
    );
    const right = allPlacedModules.some(m =>
      m.id !== storePlacedModule.id && inSameZone(m) && isInsert(m) &&
      m.slotIndex === rightEdge + 1
    );
    return { left, right };
  }, [allPlacedModules, storePlacedModule]);

  const effectiveFurnitureWidth = actualDoorWidth;
  const openOuterDoorSides = useMemo(() => resolveDoorOuterOpenSides({
    spaceInfo: originalSpaceInfo,
    placedModule: storePlacedModule,
    moduleWidthMm: actualDoorWidth,
    slotCenterX
  }), [originalSpaceInfo, storePlacedModule, actualDoorWidth, slotCenterX]);

  // 팬트리장/인출장/냉장고장(빌트인 포함)은 600mm 초과해도 도어 1짝 유지 (단일 도어 전용 키큰장)
  const isSingleDoorOnlyCabinet = !!(
    moduleData?.id?.includes('pantry-cabinet') ||
    moduleData?.id?.includes('pull-out-cabinet') ||
    moduleData?.id?.includes('fridge-cabinet') ||
    moduleData?.id?.includes('built-in-fridge') ||
    // 도어분절 가구도 단일 도어로 처리 (분절은 상/하만, 좌/우는 1장)
    moduleData?.id?.includes('shelf-split')
  );
  // 상부장: 모듈 ID로 단일/듀얼 확정 (싱글 상부장은 너비가 600 넘어도 도어 1짝 유지)
  const isSingleUpperCabinet = !!(
    moduleData?.id?.includes('upper-cabinet') &&
    !moduleData?.id?.startsWith('dual-')
  );
  const isExplicitSingleByModuleId = !!(
    moduleIdentifier.startsWith('single-') ||
    (
      moduleIdentifier.includes('lower-cabinet') &&
      !moduleIdentifier.startsWith('dual-')
    )
  );
  const isDualFurniture = isDualByModuleId;
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 도어 두께 = 가구재 두께 (spaceInfo.panelThickness, 기본 18mm)
  const doorThickness = currentSpaceInfo?.panelThickness || 18;
  const doorThicknessUnits = mmToThreeUnits(doorThickness);
  
  // === 도어 확장 설정 (변수화) ===
  const UPPER_CABINET_TOP_GAP = 5; // 상부장 도어 천장 간격 (mm)
  const UPPER_CABINET_BOTTOM_EXTENSION = 28; // 상부장 도어 아래 확장 (mm)
  
  // === 문 높이 계산 ===
  // 상부장/하부장인지 확인
  const isUpperCabinet = moduleData?.id?.includes('upper-cabinet') || moduleData?.id?.includes('dual-upper-cabinet');
  const isLowerCabinet = moduleData?.id?.includes('lower-cabinet') || moduleData?.id?.includes('dual-lower-cabinet') || moduleData?.category === 'lower';
  const floorFinishDoorBottomReferenceMm = !isUpperCabinet
    && originalSpaceInfo.baseConfig?.type === 'floor'
    && originalSpaceInfo.hasFloorFinish
    ? (originalSpaceInfo.floorFinish?.height || 0)
    : 0;
  const doorBottomGapForGeometry = doorBottomGap;

  // 패널 두께 - spaceInfo에서 동적으로 가져오기
  const panelThickness = originalSpaceInfo.panelThickness ?? 18;

  let actualDoorHeight: number;
  let tallCabinetFurnitureHeight = 0; // 키큰장 가구 높이 (Y 위치 계산에서 사용)
  let useFurnitureFitDoorHeight = false;

  // 단내림 구간인 경우 해당 구간의 높이 사용
  let fullSpaceHeight = originalSpaceInfo.height;

  // zone prop이 없으면 spaceInfo.zone을 fallback으로 사용
  const effectiveZone = zone ?? (spaceInfo as any)?.zone;

  // 단내림 높이 조정 (싱글/듀얼 모두 동일하게 처리)
  // 키큰장(싱글/듀얼)이면서 단내림 구간에 배치된 경우
  const isFreePlacementMode = originalSpaceInfo.layoutMode === 'free-placement';
  if (isFreePlacementMode && originalSpaceInfo.stepCeiling?.enabled && effectiveZone === 'dropped') {
    // 자유배치: stepCeiling이 단내림 (droppedCeiling은 커튼박스)
    const dropHeight = originalSpaceInfo.stepCeiling.dropHeight || 0;
    fullSpaceHeight = originalSpaceInfo.height - dropHeight;
  } else if (!isFreePlacementMode && originalSpaceInfo.droppedCeiling?.enabled && effectiveZone === 'dropped') {
    // 슬롯배치: droppedCeiling이 단내림
    const dropHeight = originalSpaceInfo.droppedCeiling.dropHeight || 0;
    fullSpaceHeight = originalSpaceInfo.height - dropHeight;
  }

  let doorBottomLocal = 0; // 키큰장 기준 로컬 좌표에서의 도어 하단 (mm)
  let doorTopLocal = 0; // 키큰장 기준 로컬 좌표에서의 도어 상단 (mm)

  if (isUpperCabinet) {
    // 상부장 도어 (몸통 기준, EP와 동일)
    // 상단갭/하단갭 양수 = 몸통 밖으로 확장. 0이면 도어 == 몸통
    const upperCabinetHeight = effectiveInternalHeight || moduleData?.dimensions?.height || 600;
    actualDoorHeight = upperCabinetHeight + doorTopGap + doorBottomGap;
  } else if (isLowerCabinet) {
    const lowerCabinetHeight = effectiveInternalHeight || moduleData?.dimensions?.height || 1000;
    const isDoorLift = moduleData?.id?.includes('lower-door-lift-');
    const isTopDown = moduleData?.id?.includes('lower-top-down-');

    if (isTopDown) {
      // 상판내림: 도어 상단 = cabH + topGap(-80 기본), 도어 하단 = -bottomGap(5)
      // cabH가 stoneThk별로 변해도 도어 상단~가구 상단 갭은 항상 80mm 일정
      const effectiveTopDownTopGap = doorTopGapProp ?? storePlacedModule?.doorTopGap ?? -80;
      const effectiveTopDownBottomGap = doorBottomGapProp ?? storePlacedModule?.doorBottomGap ?? 5;
      actualDoorHeight = lowerCabinetHeight + effectiveTopDownTopGap + effectiveTopDownBottomGap;
    } else if (isDoorLift) {
      // 도어올림: 몸통 기준 상단/하단 갭을 그대로 반영
      actualDoorHeight = lowerCabinetHeight + doorTopGap + doorBottomGapForGeometry;
    } else {
      // 기본 하부장: 상단갭/하단갭 양수 = 확장
      // 상단갭 0 + 하단갭 0 = 도어 == 캐비넷
      // 상단갭 양수 = 캐비넷 상단 위로 확장, 하단갭 양수 = 캐비넷 하단 아래로 확장
      actualDoorHeight = lowerCabinetHeight + doorTopGap + doorBottomGapForGeometry;
    }
  } else {
    // 키큰장의 경우: 천장/바닥 기준으로 갭 적용
    // fullSpaceHeight는 zone prop에 따라 단내림 구간 높이 또는 일반 구간 높이 사용

    const floorHeightValue = originalSpaceInfo.hasFloorFinish ? (originalSpaceInfo.floorFinish?.height || 0) : 0;
    // 개별 가구 상단몰딩 두께가 설정된 경우 해당 값 사용 (FurnitureItem의 furnitureHeightMm과 일치시키기 위해)
    const topFrameHeightValue = perFurnitureTopFrame ?? (originalSpaceInfo.frameSize?.top || 30);
    // 도어 높이 계산용 받침대: hasBase 토글에 관계없이 항상 기본 받침대 높이 사용
    // (hasBase=false 시 가구 본체가 받침대를 흡수하지만, 도어는 공간 기준이므로 불변)
    // 개별 받침대 높이가 설정된 경우 해당 값 사용 (FurnitureItem의 furnitureHeightMm과 일치시키기 위해)
    const globalBaseHeight = originalSpaceInfo.baseConfig?.height || (isLowerCabinet ? 105 : 60);
    const rawBaseHeight = placementType === 'float' ? floatHeight : (individualBaseFrameHeightProp ?? globalBaseHeight);
    const baseHeightValue = rawBaseHeight;

    // baseConfig.type === 'floor'일 때 baseConfig.height에는 이미 바닥마감재 높이가 포함됨
    // 따라서 가구 높이 계산 시 floorHeightValue를 별도로 빼면 이중 차감됨
    const isFloorType = !originalSpaceInfo.baseConfig || originalSpaceInfo.baseConfig.type === 'floor';
    const floorHeightForCalc = isFloorType ? 0 : floorHeightValue;

    // 몸통(cabinet) 실측 높이 우선 사용 — 상부몰딩/걸레받이 토글 OFF 시 가구가 흡수해서 늘어난 높이 반영
    // effectiveInternalHeight는 FurnitureItem.furnitureHeightMm (토글 흡수분 포함)
    const spaceBasedHeight = fullSpaceHeight - topFrameHeightValue - floorHeightForCalc - baseHeightValue;
    useFurnitureFitDoorHeight = isFree && (originalSpaceInfo.doorSetupMode || 'default') !== 'frame-cover' && !!effectiveInternalHeight;
    tallCabinetFurnitureHeight = effectiveInternalHeight ?? spaceBasedHeight;

    // 로컬 좌표계에서 도어 기준 위치 계산
    const cabinetBottomLocal = -tallCabinetFurnitureHeight / 2;
    const cabinetTopLocal = tallCabinetFurnitureHeight / 2;

    // ── 모든 배치 모드: 도어 갭은 몸통(cabinet) 기준 (EP와 동일) ──
    // 상단갭 = 몸통 상단에서 위로 확장, 하단갭 = 몸통 하단에서 아래로 확장
    // gap=0이면 도어 == 몸통
    doorTopLocal = cabinetTopLocal + doorTopGap;
    doorBottomLocal = cabinetBottomLocal - doorBottomGapForGeometry;
    actualDoorHeight = Math.max(doorTopLocal - doorBottomLocal, 0);

// console.log('🚪📏 병합 모드 도어 높이 (천장/바닥 기준):', {
        // fullSpaceHeight,
        // topFrameHeight: topFrameHeightValue,
        // floorHeight: floorHeightValue,
        // baseHeight: baseHeightValue,
        // furnitureHeight: tallCabinetFurnitureHeight,
        // doorTopGap,
        // doorBottomGap,
        // effectiveBottomGap,
        // actualDoorHeight,
        // 설명: `도어 상단/하단 로컬 좌표 차이 = ${actualDoorHeight}mm`
      // });
  }
  
  // 도어 분절: 외부에서 forcedDoorHeightMm가 들어오면 강제 적용
  if (forcedDoorHeightMm !== undefined && forcedDoorHeightMm > 0) {
    actualDoorHeight = forcedDoorHeightMm;
  }
  // 도어 높이에 추가 조정 없음 (사용자 입력 갭이 완전히 제어)
  const doorCenterLocalForDimensionMm = (() => {
    if (forcedDoorYMm !== undefined) {
      return forcedDoorYMm;
    }

    if (isUpperCabinet) {
      return (doorTopGap - doorBottomGap) / 2;
    }

    if (isLowerCabinet) {
      const lowerCabinetHeight = effectiveInternalHeight || moduleData?.dimensions?.height || 1000;
      const isTopDown = moduleData?.id?.includes('lower-top-down-');
      if (isTopDown) {
        const effectiveTopDownTopGap = doorTopGapProp ?? storePlacedModule?.doorTopGap ?? -80;
        const doorTopMm = lowerCabinetHeight / 2 + effectiveTopDownTopGap;
        return doorTopMm - actualDoorHeight / 2;
      }
      return (doorTopGap - doorBottomGapForGeometry) / 2;
    }

    return (doorBottomLocal + doorTopLocal) / 2;
  })();
  const parentGroupYMm = parentGroupYProp !== undefined ? parentGroupYProp / 0.01 : 0;
  const doorTopWorldMm = parentGroupYMm + doorCenterLocalForDimensionMm + actualDoorHeight / 2;
  const doorBottomWorldMm = parentGroupYMm + doorCenterLocalForDimensionMm - actualDoorHeight / 2;
  const dimensionDoorTopGapMm = Math.max(0, Math.round(fullSpaceHeight - doorTopWorldMm));
  const bottomDimensionReferenceOffsetMm = floorFinishDoorBottomReferenceMm;
  const dimensionDoorBottomGapMm = Math.max(0, Math.round(doorBottomWorldMm - bottomDimensionReferenceOffsetMm));
  const splitDoorTopGapDimensionMm = splitDoorPanelName === '하부 도어'
    ? Math.max(0, Math.round(splitDoorTopGapMm ?? 0))
    : 0;
  const splitDoorBottomGapDimensionMm = splitDoorPanelName === '상부 도어'
    ? Math.max(0, Math.round(splitDoorBottomGapMm ?? 0))
    : 0;
  const doorHeight = mmToThreeUnits(actualDoorHeight);
  const lowerCountertopThicknessMm = resolveCountertopThicknessMm(storePlacedModule, originalSpaceInfo);
  const isSplitDoorDimensionPanel = splitDoorPanelName !== undefined || forcedDoorHeightMm !== undefined || forcedDoorYMm !== undefined;
  const shouldUseLowerCountertopTopGapDimension = isLowerCabinet
    && lowerCountertopThicknessMm > 0
    && (!isSplitDoorDimensionPanel || splitDoorPanelName === '상부 도어');
  const lowerCabinetHeightForTopReference = effectiveInternalHeight || moduleData?.dimensions?.height || 1000;
  const lowerCabinetTopWorldMm = parentGroupYMm + lowerCabinetHeightForTopReference / 2;
  const lowerCountertopBottomGapMm = moduleIdentifier.includes('lower-top-down-')
    ? 20
    : Math.max(0, Math.round(lowerCabinetTopWorldMm - doorTopWorldMm));
  const effectiveDoorTopGapDimensionMm = shouldUseLowerCountertopTopGapDimension
    ? lowerCountertopBottomGapMm
    : dimensionDoorTopGapMm;
  const showDoorTopGapDimension = splitDoorPanelName === '하부 도어'
    ? splitDoorTopGapDimensionMm > 0
    : isLowerCabinet
      ? (shouldUseLowerCountertopTopGapDimension && lowerCountertopBottomGapMm > 0)
      : dimensionDoorTopGapMm > 0;
  const showDoorBottomGapDimension = splitDoorPanelName === '상부 도어'
    ? splitDoorBottomGapDimensionMm > 0
    : !isUpperCabinet && dimensionDoorBottomGapMm > 0;
  const doorTopGapDimensionMm = showDoorTopGapDimension
    ? (splitDoorPanelName === '하부 도어' ? splitDoorTopGapDimensionMm : effectiveDoorTopGapDimensionMm)
    : 0;
  const doorBottomGapDimensionMm = showDoorBottomGapDimension
    ? (splitDoorPanelName === '상부 도어' ? splitDoorBottomGapDimensionMm : dimensionDoorBottomGapMm)
    : 0;
  const doorTopGapDimensionUnits = mmToThreeUnits(doorTopGapDimensionMm);
  const doorBottomGapDimensionUnits = mmToThreeUnits(doorBottomGapDimensionMm);
  const doorDimensionTopY = doorHeight / 2 + doorTopGapDimensionUnits;
  const doorDimensionBottomY = -doorHeight / 2 - doorBottomGapDimensionUnits;
  const doorDimensionSideLineOffset = mmToThreeUnits(160);
  const doorDimensionSideTextOffset = doorDimensionSideLineOffset + mmToThreeUnits(60);
  const doorDimensionWidthLineStart = mmToThreeUnits(60);
  const doorDimensionWidthLineLength = mmToThreeUnits(100);
  const doorDimensionForwardOffset = 0.01;
  const renderDoorGapDimensionMarkers = ({
    lineX,
    textX,
    zPos,
    dimColor,
    tickSize,
    keyPrefix,
  }: {
    lineX: number;
    textX: number;
    zPos: number;
    dimColor: string;
    tickSize: number;
    keyPrefix: string;
  }) => {
    return (
      <>
        {showDoorTopGapDimension && (
          <>
            <NativeLine
              key={`${keyPrefix}-top-gap-line`}
              name="door-dimension-height-gap"
              points={[[lineX, doorHeight / 2, zPos], [lineX, doorDimensionTopY, zPos]]}
              color={dimColor}
              lineWidth={1}
              renderOrder={100001}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine
              key={`${keyPrefix}-ceiling-tick`}
              name="door-dimension-height-gap"
              points={[[lineX - tickSize, doorDimensionTopY, zPos], [lineX + tickSize, doorDimensionTopY, zPos]]}
              color={dimColor}
              lineWidth={1}
              renderOrder={100001}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine
              key={`${keyPrefix}-door-top-tick`}
              name="door-dimension-height-gap"
              points={[[lineX - tickSize, doorHeight / 2, zPos], [lineX + tickSize, doorHeight / 2, zPos]]}
              color={dimColor}
              lineWidth={1}
              renderOrder={100001}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <DimensionText
              name="door-dimension-top-gap-text"
              value={doorTopGapDimensionMm}
              position={[textX, (doorHeight / 2 + doorDimensionTopY) / 2, zPos]}
              color={dimColor}
              hoverColor={doorDimensionHoverColor}
              onHoverChange={setIsDoorDimensionHovered}
              anchorX="center"
              anchorY="middle"
              forceShow={true}
            />
          </>
        )}
        {showDoorBottomGapDimension && (
          <>
            <NativeLine
              key={`${keyPrefix}-bottom-gap-line`}
              name="door-dimension-height-gap"
              points={[[lineX, doorDimensionBottomY, zPos], [lineX, -doorHeight / 2, zPos]]}
              color={dimColor}
              lineWidth={1}
              renderOrder={100001}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine
              key={`${keyPrefix}-door-bottom-tick`}
              name="door-dimension-height-gap"
              points={[[lineX - tickSize, -doorHeight / 2, zPos], [lineX + tickSize, -doorHeight / 2, zPos]]}
              color={dimColor}
              lineWidth={1}
              renderOrder={100001}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine
              key={`${keyPrefix}-floor-tick`}
              name="door-dimension-height-gap"
              points={[[lineX - tickSize, doorDimensionBottomY, zPos], [lineX + tickSize, doorDimensionBottomY, zPos]]}
              color={dimColor}
              lineWidth={1}
              renderOrder={100001}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <DimensionText
              name="door-dimension-bottom-gap-text"
              value={doorBottomGapDimensionMm}
              position={[textX, (doorDimensionBottomY - doorHeight / 2) / 2, zPos]}
              color={dimColor}
              hoverColor={doorDimensionHoverColor}
              onHoverChange={setIsDoorDimensionHovered}
              anchorX="center"
              anchorY="middle"
              forceShow={true}
            />
          </>
        )}
      </>
    );
  };
  const renderDoorDimensionHoverPlane = ({
    keyName,
    position,
    args,
  }: {
    keyName: string;
    position: [number, number, number];
    args: [number, number];
  }) => (
    <mesh key={keyName} name="door-dimension-hover-area" position={position} renderOrder={100002} {...doorDimensionHoverHandlers}>
      <planeGeometry args={args} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
  const customHingePositionSource = splitDoorPanelName === '상부 도어'
    ? (upperDoorHingePositionsMm ?? storePlacedModule?.upperDoorHingePositionsMm)
    : splitDoorPanelName === '하부 도어'
      ? (lowerDoorHingePositionsMm ?? storePlacedModule?.lowerDoorHingePositionsMm)
      : (hingePositionsMm ?? storePlacedModule?.hingePositionsMm);
  const customHingePositionsMm = normalizeDoorHingePositionsMm(
    customHingePositionSource,
    actualDoorHeight
  );
  const hasCustomHingePositions = customHingePositionsMm.length > 0;
  const shelfCollisionRangesMm = useMemo(() => {
    const cabinetHeightMm = effectiveInternalHeight || moduleData?.dimensions?.height || 0;
    if (!cabinetHeightMm || !moduleData) return [];

    const sections = (
      storePlacedModule?.customSections ||
      (moduleData.modelConfig as any)?.sections ||
      (moduleData.modelConfig as any)?.leftSections ||
      []
    ) as any[];
    if (!Array.isArray(sections) || sections.length === 0) return [];

    const thicknessMm = panelThickness || 18;
    const availableHeightMm = cabinetHeightMm - thicknessMm * 2;
    let currentYFromBottom = thicknessMm;
    const ranges: Array<{ bottomMm: number; topMm: number }> = [];

    sections.forEach(section => {
      const sectionHeightMm = section.heightType === 'absolute'
        ? section.height
        : availableHeightMm * ((section.height || section.heightRatio || 100) / 100);
      const shelfPositions = Array.isArray(section.shelfPositions) && section.shelfPositions.length > 0
        ? section.shelfPositions.filter((position: number) => position > 0)
        : (section.type === 'shelf' && section.count && section.count > 0)
          ? Array.from({ length: section.count }, (_, index) => (
            sectionHeightMm / (section.count + 1) * (index + 1)
          ))
          : [];

      shelfPositions.forEach((position: number) => {
        const shelfCenterFromCabinetBottom = currentYFromBottom + position;
        const shelfBottomFromCabinetBottom = shelfCenterFromCabinetBottom - thicknessMm / 2;
        const shelfTopFromCabinetBottom = shelfCenterFromCabinetBottom + thicknessMm / 2;
        ranges.push({
          bottomMm: shelfBottomFromCabinetBottom,
          topMm: shelfTopFromCabinetBottom,
        });
      });
      currentYFromBottom += sectionHeightMm;
    });

    return ranges;
  }, [
    effectiveInternalHeight,
    moduleData,
    panelThickness,
    storePlacedModule?.customSections
  ]);
  const doorBottomOnSideMm = doorCenterLocalForDimensionMm +
    (effectiveInternalHeight || moduleData?.dimensions?.height || 0) / 2 -
    actualDoorHeight / 2;
  const defaultHingePositionsMm = (() => {
    const defaultPositions = resolveDefaultDoorHingePositionsMm({
      doorHeightMm: actualDoorHeight,
      isUpperCabinet,
      isLowerCabinet,
      hingeMode
    });
    if (splitDoorPanelName !== '상부 도어' && splitDoorPanelName !== '하부 도어') {
      return defaultPositions;
    }

    const cabinetHeightMm = effectiveInternalHeight || moduleData?.dimensions?.height || 0;
    const sections = (
      storePlacedModule?.customSections ||
      (moduleData?.modelConfig as any)?.sections ||
      []
    ) as any[];
    const lowerSection = sections[0];
    const lowerSectionTopMm = lowerSection?.heightType === 'absolute'
      ? Number(lowerSection.height || 0)
      : Number.isFinite(Number(lowerSection?.height || lowerSection?.heightRatio))
        ? cabinetHeightMm * (Number(lowerSection.height || lowerSection.heightRatio) / 100)
        : moduleIdentifier.includes('pantry-cabinet-split')
          ? 1825
          : 860;
    const upperSection = sections[1];
    const upperSectionHeightMm = upperSection?.heightType === 'absolute'
      ? Number(upperSection.height || 0)
      : Number.isFinite(Number(upperSection?.height || upperSection?.heightRatio))
        ? cabinetHeightMm * (Number(upperSection.height || upperSection.heightRatio) / 100)
        : Math.max(0, cabinetHeightMm - lowerSectionTopMm);
    const upperSectionTopMm = upperSectionHeightMm > 0
      ? Math.min(cabinetHeightMm, lowerSectionTopMm + upperSectionHeightMm)
      : cabinetHeightMm;

    if (splitDoorPanelName === '하부 도어') {
      return resolveSideAnchoredDoorHingePositionsMm({
        doorHeightMm: actualDoorHeight,
        doorBottomOnSideMm,
        defaultDoorPositionsMm: defaultPositions,
        firstSidePositionMm: 120,
        lastSidePositionMm: lowerSectionTopMm - 120,
      });
    }

    return resolveSideAnchoredDoorHingePositionsMm({
      doorHeightMm: actualDoorHeight,
      doorBottomOnSideMm,
      defaultDoorPositionsMm: defaultPositions,
      firstSidePositionMm: lowerSectionTopMm + 120,
      lastSidePositionMm: upperSectionTopMm - 120,
    });
  })();
  const effectiveHingePositionsMm = resolveSidePanelMatchedHingePositions({
    doorHeightMm: actualDoorHeight,
    doorBottomOnSideMm,
    shelfCollisionRangesOnSideMm: shelfCollisionRangesMm,
    customDoorPositionsMm: hasCustomHingePositions ? customHingePositionsMm : undefined,
    defaultDoorPositionsMm: defaultHingePositionsMm,
    preserveEdgePositionsMm: true
  }).doorPositionsMm;
  const hingePositionsField = splitDoorPanelName === '상부 도어'
    ? 'upperDoorHingePositionsMm'
    : splitDoorPanelName === '하부 도어'
      ? 'lowerDoorHingePositionsMm'
      : 'hingePositionsMm';

  useEffect(() => {
    setHingeGapDrafts({});
  }, [
    furnitureId,
    actualDoorHeight
  ]);

  const renderHingeMarkers = (
    hingeX: number,
    smallCircleXOffset: number,
    positionsMm: number[],
    keyPrefix: string
  ) => {
    if (isSide2DView) return null;

    return positionsMm.map((positionMm, index) => (
      <Hinge
        key={`${keyPrefix}-${positionMm}-${index}`}
        position={[
          hingeX,
          -doorHeight / 2 + mmToThreeUnits(positionMm),
          doorThicknessUnits / 2 + 0.001
        ]}
        mainDiameter={17.5}
        smallCircleDiameter={4}
        smallCircleXOffset={smallCircleXOffset}
        viewDirection="front"
        view2DDirection={view2DDirection}
      />
    ));
  };

  const renderSidePanelAnchoredHingeMarkers = (keyPrefix: string) => {
    return null;
  };

  const clearHingeGapDraft = (draftKey: string) => {
    setHingeGapDrafts((prev) => {
      if (!(draftKey in prev)) return prev;
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
    setHingeGapEditBases((prev) => {
      if (!(draftKey in prev)) return prev;
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const updateHingeGapSegment = (
    segmentIndex: number,
    requestedGapMm: number,
    positionsMm: number[],
    editBasis?: { topDistancesMm: number[]; doorHeightMm: number }
  ) => {
    if (!furnitureId) return;

    const doorHeightMm = Math.max(1, Math.round(editBasis?.doorHeightMm ?? actualDoorHeight));
    const topDistancesMm = editBasis?.topDistancesMm ?? normalizeDoorHingePositionsMm(positionsMm, doorHeightMm)
      .map(positionMm => Math.max(1, Math.min(doorHeightMm - 1, Math.round(doorHeightMm - positionMm))))
      .sort((a, b) => a - b);
    if (topDistancesMm.length === 0) return;

    const boundariesMm = [0, ...topDistancesMm, doorHeightMm];
    const lastSegmentIndex = boundariesMm.length - 2;
    const targetBoundaryIndex = segmentIndex === 0
      ? 1
      : segmentIndex === lastSegmentIndex
        ? boundariesMm.length - 2
        : segmentIndex;
    const previousBoundary = boundariesMm[targetBoundaryIndex - 1] ?? 0;
    const nextBoundary = boundariesMm[targetBoundaryIndex + 1] ?? doorHeightMm;
    const requestedBoundary = segmentIndex === 0
      ? requestedGapMm
      : segmentIndex === lastSegmentIndex
        ? doorHeightMm - requestedGapMm
        : boundariesMm[segmentIndex + 1] - requestedGapMm;
    const nextBoundaryValue = Math.max(
      previousBoundary + 1,
      Math.min(nextBoundary - 1, Math.round(requestedBoundary))
    );

    const nextTopDistances = [...topDistancesMm];
    nextTopDistances[targetBoundaryIndex - 1] = nextBoundaryValue;
    const nextBottomPositions = nextTopDistances.map(topDistanceMm =>
      Math.max(1, Math.min(doorHeightMm - 1, Math.round(doorHeightMm - topDistanceMm)))
    );

    updatePlacedModule(furnitureId, {
      [hingePositionsField]: normalizeDoorHingePositionsMm(nextBottomPositions, doorHeightMm)
    } as any);
  };

  const renderHingePositionGuides = (
    hingeX: number,
    side: 'left' | 'right',
    positionsMm: number[],
    keyPrefix: string
  ) => {
    if (!isHingePositionEditMode || viewMode !== '2D' || view2DDirection !== 'front' || positionsMm.length === 0) {
      return null;
    }

    const topDistancesMm = positionsMm
      .map(positionMm => Math.max(0, Math.min(actualDoorHeight, Math.round(actualDoorHeight - positionMm))))
      .sort((a, b) => a - b);
    const anchorsMm = [0, ...topDistancesMm, Math.round(actualDoorHeight)];
    const direction = side === 'left' ? -1 : 1;
    const dimX = hingeX + direction * mmToThreeUnits(145);
    const extensionEndX = hingeX + direction * mmToThreeUnits(12);
    const tickSize = mmToThreeUnits(18);
    const zPos = doorThicknessUnits / 2 + 0.006;
    const guideColor = '#38bdf8';
    const textColor = view2DTheme === 'dark' ? '#E0F2FE' : '#075985';
    const yFromTop = (distanceMm: number) => doorHeight / 2 - mmToThreeUnits(distanceMm);
    const textX = dimX + direction * mmToThreeUnits(96);

    return (
      <group name={`${keyPrefix}-hinge-position-guides`} renderOrder={100010}>
        {anchorsMm.map((distanceMm, index) => {
          const y = yFromTop(distanceMm);
          return (
            <React.Fragment key={`${keyPrefix}-anchor-${distanceMm}-${index}`}>
              <NativeLine
                name="hinge-position-extension"
                points={[[extensionEndX, y, zPos], [dimX, y, zPos]]}
                color={guideColor}
                lineWidth={1}
                renderOrder={100010}
                depthTest={false}
                depthWrite={false}
                transparent={true}
              />
              <NativeLine
                name="hinge-position-tick"
                points={[[dimX - tickSize / 2, y, zPos], [dimX + tickSize / 2, y, zPos]]}
                color={guideColor}
                lineWidth={1}
                renderOrder={100010}
                depthTest={false}
                depthWrite={false}
                transparent={true}
              />
            </React.Fragment>
          );
        })}
        {anchorsMm.slice(0, -1).map((distanceMm, index) => {
          const nextDistanceMm = anchorsMm[index + 1];
          const topY = yFromTop(distanceMm);
          const bottomY = yFromTop(nextDistanceMm);
          const segmentMm = Math.max(0, nextDistanceMm - distanceMm);
          if (segmentMm <= 0) return null;
          const draftKey = `${keyPrefix}-gap-${index}`;
          const inputValue = hingeGapDrafts[draftKey] ?? String(segmentMm);

          return (
            <React.Fragment key={`${keyPrefix}-segment-${index}`}>
              <NativeLine
                name="hinge-position-dimension"
                points={[[dimX, topY, zPos], [dimX, bottomY, zPos]]}
                color={guideColor}
                lineWidth={1}
                renderOrder={100010}
                depthTest={false}
                depthWrite={false}
                transparent={true}
              />
              <Html
                position={[textX, (topY + bottomY) / 2, zPos]}
                center
                occlude={false}
                transform={false}
                zIndexRange={[10000, 10]}
                style={{ pointerEvents: 'auto' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1px',
                    padding: '2px 4px',
                    border: `1px solid ${guideColor}`,
                    borderRadius: '3px',
                    background: view2DTheme === 'dark' ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)',
                    color: textColor,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)'
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={1}
                    max={Math.max(1, Math.round(actualDoorHeight) - 1)}
                    value={inputValue}
                    onChange={(event) => {
                      event.stopPropagation();
                      const value = event.target.value;
                      if (value === '' || value === '-' || !/^-?\d+$/.test(value)) {
                        setHingeGapDrafts(prev => ({ ...prev, [draftKey]: value }));
                        return;
                      }
                      const nextValue = Math.max(1, Math.min(Math.round(actualDoorHeight) - 1, parseInt(value, 10)));
                      setHingeGapDrafts(prev => ({ ...prev, [draftKey]: String(nextValue) }));
                      updateHingeGapSegment(index, nextValue, positionsMm, hingeGapEditBases[draftKey]);
                    }}
                    onKeyDownCapture={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        clearHingeGapDraft(draftKey);
                        event.currentTarget.blur();
                        return;
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        clearHingeGapDraft(draftKey);
                        event.currentTarget.blur();
                        return;
                      }
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      const step = event.shiftKey ? 10 : 1;
                      const liveValue = event.currentTarget.value;
                      const parsed = /^-?\d+$/.test(liveValue) ? parseInt(liveValue, 10) : (/^-?\d+$/.test(inputValue) ? parseInt(inputValue, 10) : segmentMm);
                      const delta = event.key === 'ArrowUp' ? step : -step;
                      const nextValue = Math.max(1, Math.min(Math.round(actualDoorHeight) - 1, (Number.isFinite(parsed) ? parsed : segmentMm) + delta));
                      setHingeGapDrafts(prev => ({ ...prev, [draftKey]: String(nextValue) }));
                      updateHingeGapSegment(index, nextValue, positionsMm, hingeGapEditBases[draftKey]);
                    }}
                    onBlur={() => clearHingeGapDraft(draftKey)}
                    onFocus={(event) => {
                      const doorHeightMm = Math.max(1, Math.round(actualDoorHeight));
                      setHingeGapEditBases(prev => ({
                        ...prev,
                        [draftKey]: {
                          topDistancesMm: normalizeDoorHingePositionsMm(positionsMm, doorHeightMm)
                            .map(positionMm => Math.max(1, Math.min(doorHeightMm - 1, Math.round(doorHeightMm - positionMm))))
                            .sort((a, b) => a - b),
                          doorHeightMm
                        }
                      }));
                      event.currentTarget.select();
                    }}
                    style={{
                      width: '44px',
                      height: '18px',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: textColor,
                      fontSize: '11px',
                      fontWeight: 700,
                      textAlign: 'center'
                    }}
                  />
                </div>
              </Html>
            </React.Fragment>
          );
        })}
      </group>
    );
  };
  
  // === 문 Y 위치 계산 ===
  let doorYPosition: number;
  
  if (isUpperCabinet) {
    // 상부장 도어 Y 위치 (몸통 기준, EP와 동일)
    // 도어 중심 = (몸통 상단 + 상단갭 + 몸통 하단 - 하단갭) / 2 = (상단갭 - 하단갭) / 2
    const doorCenter = (doorTopGap - doorBottomGap) / 2;
    doorYPosition = mmToThreeUnits(doorCenter);
  } else if (isLowerCabinet) {
    const lowerCabinetHeight = effectiveInternalHeight || moduleData?.dimensions?.height || 1000;
    const isDoorLiftForY = moduleData?.id?.includes('lower-door-lift-');
    const isTopDownForY = moduleData?.id?.includes('lower-top-down-');

    if (isTopDownForY) {
      // 상판내림: 도어 상단 = cabH + topGap(-80) → 가구 상단보다 80mm 아래로 고정
      const effectiveTopDownTopGap = doorTopGapProp ?? storePlacedModule?.doorTopGap ?? -80;
      const doorTopY = mmToThreeUnits(lowerCabinetHeight) / 2 + mmToThreeUnits(effectiveTopDownTopGap);
      doorYPosition = doorTopY - mmToThreeUnits(actualDoorHeight) / 2;
    } else if (isDoorLiftForY) {
      // 도어올림: 도어 상단 = 캐비넷 상단 + doorTopGap
      const doorTopY = mmToThreeUnits(lowerCabinetHeight) / 2 + mmToThreeUnits(doorTopGap);
      doorYPosition = doorTopY - mmToThreeUnits(actualDoorHeight) / 2;
    } else {
      // 기본 하부장: 도어 상단 = 캐비넷 상단 + doorTopGap
      const doorTopY = mmToThreeUnits(lowerCabinetHeight) / 2 + mmToThreeUnits(doorTopGap);
      doorYPosition = doorTopY - mmToThreeUnits(actualDoorHeight) / 2;
    }
  } else {
    // 키큰장 도어 Y 위치: 항상 몸통(cabinet) 기준 (EP와 동일)
    // doorTopLocal/doorBottomLocal은 위에서 cabinetTopLocal±doorGap으로 계산됨
    const doorCenterLocal = (doorBottomLocal + doorTopLocal) / 2;
    doorYPosition = mmToThreeUnits(doorCenterLocal);
  }

  // 도어 분절: 외부에서 forcedDoorYMm가 들어오면 강제 적용
  if (forcedDoorYMm !== undefined) {
    doorYPosition = mmToThreeUnits(forcedDoorYMm);
  }

  // 노서라운드 + 벽없음 상태 체크
  const isNoSurroundNoWallLeft = originalSpaceInfo.surroundType === 'no-surround' && !originalSpaceInfo.wallConfig?.left;
  const isNoSurroundNoWallRight = originalSpaceInfo.surroundType === 'no-surround' && !originalSpaceInfo.wallConfig?.right;
  const endPanelThickness = currentSpaceInfo?.panelThickness || 18; // 엔드패널 두께 = 가구재 두께

  // 도어 Z 위치: doorDepth/2로 사용되므로 offset을 2배로 설정해야 함
  // 목표: 가구 앞면에서 5mm 떨어지고 + 도어 두께 절반(9mm) = 14mm
  // 계산: doorDepth/2 = (moduleDepth + offset)/2, offset=28 → 실제 14mm
  const baseDepthOffset = mmToThreeUnits(28);
  const doorDepth = mmToThreeUnits(moduleDepth) + baseDepthOffset;

  // 힌지 위치 오프셋(9mm) 상수 정의
  const hingeOffset = panelThickness / 2; // 9mm
  const hingeOffsetUnits = mmToThreeUnits(hingeOffset);
  
  // 편집 모드 체크 로그
  useEffect(() => {
    if (isEditMode) {
// console.log('🚪🔓 도어 편집 모드 활성화:', {
        // isEditMode,
        // doorsOpen,
        // shouldOpen: doorsOpen || isEditMode,
        // moduleId: moduleData?.id
      // });
    }
  }, [isEditMode, doorsOpen, moduleData?.id]);

  // 도어 열림 상태 계산 - 성능 최적화
  // 편집 모드(가구 클릭 팝업)에서도 도어는 사용자의 명시적 Open/Close 토글만 따름
  const shouldOpenDoors = useMemo(() => isDoorOpen, [isDoorOpen]);
  
  // 도어 애니메이션 상태 추적
  const [isAnimating, setIsAnimating] = useState(false);
  
  // 도어 상태 변경 시 애니메이션 시작
  useEffect(() => {
    if (isDoorOpen !== undefined) {
      setIsAnimating(true);
      // 애니메이션이 끝나면 (약 1.2초 후) 상태 업데이트 (기존 1.5초에서 1.2초로 감소)
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isDoorOpen]);
  
  // 애니메이션 중일 때 프레임마다 렌더링
  useFrame(() => {
    if (isAnimating && gl) {
      // 애니메이션 중일 때만 강제 렌더링
      if ('invalidate' in gl) {
        (gl as any).invalidate();
      }
    }
  });
  
  // 도어 클릭 핸들러 제거됨 - Close/Open 버튼으로만 도어 열고닫기
  
  // 애니메이션 설정 - 적당한 속도 (90도 열림)
  // 순차 애니메이션 (속서랍 있는 가구가 있을 때만 적용):
  //   - 열릴 때: 도어가 먼저 회전(즉시) → 그 후 서랍이 인출(500ms 지연)
  //   - 닫힐 때: 서랍이 먼저 들어감(즉시) → 그 후 도어 회전(500ms 지연)
  // 속서랍 가구 = 인출장 + 의류장 서랍 가구(2drawer-hanging, 4drawer-hanging)
  const hasInnerDrawerModule = useMemo(() =>
    allPlacedModules.some(m => typeof m.moduleId === 'string' && (
      m.moduleId.includes('pull-out-cabinet') ||
      m.moduleId.includes('2drawer-hanging') ||
      m.moduleId.includes('4drawer-hanging')
    )),
    [allPlacedModules]
  );
  const innerDrawerDoorDelay = (hasInnerDrawerModule && !shouldOpenDoors) ? 500 : 0;
  const rightCornerSequenceDelay = isRightCornerSideDoor
    ? (shouldOpenDoors ? 450 : 0)
    : (isRightCornerMainDoor ? (shouldOpenDoors ? 0 : 450) : 0);
  const doorDelay = Math.max(innerDrawerDoorDelay, rightCornerSequenceDelay);

  const leftHingeDoorSpring = useSpring({
    rotation: shouldOpenDoors ? -Math.PI / 2 : 0,
    config: { tension: 90, friction: 16, clamp: true },
    delay: doorDelay,
  });

  const rightHingeDoorSpring = useSpring({
    rotation: shouldOpenDoors ? Math.PI / 2 : 0,
    config: { tension: 90, friction: 16, clamp: true },
    delay: doorDelay,
  });

  const dualLeftDoorSpring = useSpring({
    rotation: shouldOpenDoors ? -Math.PI / 2 : 0,
    config: { tension: 90, friction: 16, clamp: true },
    delay: doorDelay,
  });

  const dualRightDoorSpring = useSpring({
    rotation: shouldOpenDoors ? Math.PI / 2 : 0,
    config: { tension: 90, friction: 16, clamp: true },
    delay: doorDelay,
  });

  // 도어 위치 계산: slotCenterX가 제공되면 사용, 아니면 기본값 0
  // 자유배치 EP: 부모 group이 밀린 만큼 도어를 역방향으로 되돌림
  let doorGroupX = (slotCenterX || 0) + freeEpReverseX;
  
  // slotCenterX가 제공되었는지 확인
  if (slotCenterX !== undefined && slotCenterX !== null) {
    // slotCenterX가 제공된 경우 그대로 사용
// console.log(`🚪 도어 위치 사용 (제공된 slotCenterX):`, {
      // slotIndex,
      // slotCenterX,
      // doorGroupX
    // });
  } else {
    // slotCenterX가 제공되지 않은 경우 기본값 0 사용
// console.log(`🚪 도어 위치 기본값 사용:`, {
      // slotIndex,
      // doorGroupX: 0
    // });
  }

  // 기둥 옆에 있는지 확인하여 힌지 위치 자동 조정
  const checkColumnAdjacent = () => {
    const columns = originalSpaceInfo.columns || [];
    if (columns.length === 0) {
// console.log('🚪 기둥이 없음');
      return { isNearColumn: false, columnSide: null };
    }
    
    // 도어의 실제 위치 계산 (Three.js 좌표)
    const doorCenterX = slotCenterX || 0;
    const doorLeftEdge = doorCenterX - mmToThreeUnits(actualDoorWidth / 2);
    const doorRightEdge = doorCenterX + mmToThreeUnits(actualDoorWidth / 2);
    
// console.log('🚪 도어 위치 체크:', {
      // doorCenterX,
      // doorLeftEdge,
      // doorRightEdge,
      // actualDoorWidth,
      // slotCenterX
    // });
    
    // 각 기둥과의 거리 체크
    for (const column of columns) {
      const columnX = mmToThreeUnits(column.position[0] - originalSpaceInfo.width / 2);
      const columnWidth = mmToThreeUnits(column.width);
      const columnLeftEdge = columnX - columnWidth / 2;
      const columnRightEdge = columnX + columnWidth / 2;
      
      // 기둥과의 거리 체크 (100mm 이내를 인접으로 판단 - 임계값 증가)
      const threshold = mmToThreeUnits(100);
      
      const leftDistance = Math.abs(doorLeftEdge - columnRightEdge);
      const rightDistance = Math.abs(doorRightEdge - columnLeftEdge);
      
// console.log('🚪 기둥 거리 체크:', {
        // columnPosition: column.position,
        // columnX,
        // columnWidth: column.width,
        // columnLeftEdge,
        // columnRightEdge,
        // leftDistance: leftDistance / 0.01, // mm로 변환
        // rightDistance: rightDistance / 0.01, // mm로 변환
        // threshold: threshold / 0.01 // mm로 변환
      // });
      
      // 왼쪽에 기둥이 있는 경우
      if (leftDistance < threshold) {
// console.log('🚪 왼쪽에 기둥 감지');
        return { isNearColumn: true, columnSide: 'left' };
      }
      
      // 오른쪽에 기둥이 있는 경우
      if (rightDistance < threshold) {
// console.log('🚪 오른쪽에 기둥 감지');
        return { isNearColumn: true, columnSide: 'right' };
      }
    }
    
// console.log('🚪 기둥 인접하지 않음');
    return { isNearColumn: false, columnSide: null };
  };
  
  const columnCheck = checkColumnAdjacent();

  // 커버도어인 경우 힌지 위치 자동 조정
  let adjustedHingePosition = hingePosition;

  // 모든 도어 타입에서 기둥 체크 (type이 'door' 또는 moduleId에 'door'가 포함된 경우)
  const isDoorModule = moduleData?.type === 'door' ||
                       moduleData?.id?.toLowerCase().includes('door') ||
                       moduleData?.moduleId?.toLowerCase().includes('door');

  // Insert 프레임 인접 시: 힌지를 인서트 반대쪽으로 자동 설정 (사용자 요구)
  // 좌측 인서트 → 우측 힌지, 우측 인서트 → 좌측 힌지
  // 기둥 로직보다 우선 적용 (싱글 도어 한정 — 듀얼은 좌/우 도어가 각각 별도 힌지)
  if (insertFrameAdjacency.left && !insertFrameAdjacency.right) {
    adjustedHingePosition = 'right';
  } else if (insertFrameAdjacency.right && !insertFrameAdjacency.left) {
    adjustedHingePosition = 'left';
  } else if (columnCheck.isNearColumn && isDoorModule) {
    // 기둥이 왼쪽에 있으면 왼쪽 힌지 (도어가 오른쪽으로 열림 - 기둥 반대 방향으로 열림)
    // 기둥이 오른쪽에 있으면 오른쪽 힌지 (도어가 왼쪽으로 열림 - 기둥 반대 방향으로 열림)
    adjustedHingePosition = columnCheck.columnSide as 'left' | 'right';

// console.log('🚪 기둥 인접 도어 힌지 자동 조정:', {
      // originalHinge: hingePosition,
      // adjustedHinge: adjustedHingePosition,
      // columnSide: columnCheck.columnSide,
      // doorCenterX: slotCenterX,
      // moduleData,
      // isDoorModule,
      // note: '힌지는 기둥 쪽에 위치하여 도어가 기둥 반대방향으로 열림'
    // });
  } else {
// console.log('🚪 힌지 조정 안함:', {
      // isNearColumn: columnCheck.isNearColumn,
      // columnSide: columnCheck.columnSide,
      // isDoorModule,
      // moduleData
    // });
  }

  // 2D 뷰: 도어 반투명 면 overlay 정보 (정면 + 측면)
  const showDoorOverlay = viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right');
  const doorOverlayColor = view2DTheme === 'dark' ? '#3a5a7a' : '#a0b8d0';

  if (isDualFurniture) {
    // 듀얼 가구: 두 슬롯의 전체 너비 계산
    let totalWidth: number;
    let leftDoorWidth: number;
    let rightDoorWidth: number;

    // 도어는 항상 3mm 갭 적용 (가구보다 3mm 작게)
    const doorGap = 3;

// console.log('[DoorDebug] dual-door slot widths', {
      // slotWidths,
      // moduleWidth,
      // effectiveColumnWidth,
      // originalSlotWidth,
      // zone: (spaceInfo as any).zone,
      // slotIndex,
      // isFree,
      // actualDoorWidth
    // });

    const outerLeftGapCompensationMm = openOuterDoorSides.left ? 1.5 : 0;
    const outerRightGapCompensationMm = openOuterDoorSides.right ? 1.5 : 0;

    if (isFree) {
      // 자유배치: actualDoorWidth(= storeFreeWidth)를 그대로 사용, 좌우 균등 분할
      totalWidth = actualDoorWidth;
      leftDoorWidth = actualDoorWidth / 2 - doorGap;
      rightDoorWidth = actualDoorWidth / 2 - doorGap;
    } else {
      // 슬롯 배치: 가구 본체와 동일한 slotWidths 기준 사용
      // actualDoorWidth는 이미 slotWidths 기반으로 계산됨 (듀얼: slotWidth * 2)
      const halfWidth = actualDoorWidth / 2;
      totalWidth = actualDoorWidth;
      leftDoorWidth = halfWidth - doorGap;
      rightDoorWidth = halfWidth - doorGap;
    }
    leftDoorWidth += outerLeftGapCompensationMm;
    rightDoorWidth += outerRightGapCompensationMm;

    // EP ㄷ자 프레임 잠금: 힌지가 EP 쪽이면 도어 회전 시 ㄷ자 EP에 부딪힘 → 잠금.
    // 힌지가 반대쪽이면 도어가 EP 반대 방향으로 열리므로 충돌 없음 → 통과.
    // 듀얼 도어는 좌측 도어는 좌측 EP·왼손 힌지, 우측 도어는 우측 EP·오른손 힌지 조합에서만 잠금.
    const epIsCFrame = !!(storePlacedModule && (storePlacedModule.endPanelThickness || 18) > 20);
    // 듀얼 도어는 보통 좌측 도어 힌지=left, 우측 도어 힌지=right (외측 힌지)
    const leftDoorLocked = !!(epIsCFrame && storePlacedModule?.hasLeftEndPanel);
    const rightDoorLocked = !!(epIsCFrame && storePlacedModule?.hasRightEndPanel);

    // EP 앞으로 돌출 시 도어 너비 축소: 깊이 확장 front 또는 옵셋 양수(앞 확장)
    let leftEpTrimShift = 0;
    let rightEpTrimShift = 0;
    if (storePlacedModule) {
      const epThickMm = storePlacedModule.endPanelThickness || 18;
      // 앞 옵셋 > 0 이면 EP가 앞으로 돌출 → 도어 트림 필요
      const leftFrontOffset = storePlacedModule.leftEndPanelOffset ?? 0;
      const rightFrontOffset = storePlacedModule.rightEndPanelOffset ?? 0;

      if (storePlacedModule.hasLeftEndPanel && leftFrontOffset > 0) {
        leftDoorWidth -= epThickMm;
        leftEpTrimShift = mmToThreeUnits(epThickMm) / 2;
      }
      if (storePlacedModule.hasRightEndPanel && rightFrontOffset > 0) {
        rightDoorWidth -= epThickMm;
        rightEpTrimShift = -mmToThreeUnits(epThickMm) / 2;
      }
    }

    // Insert 프레임 인접 시 도어 확장 (해당 쪽으로)
    // 도어 확장/축소 토글: ON 시 입력값 v(mm)는 몸통 대비 도어 전체 폭 증감값이다.
    // 기본 도어 폭이 몸통-3mm에서 시작하므로 v=0이 몸통과 같아지도록 +3mm를 보정한다.
    const doorAdjEnabledDual = !!(storePlacedModule as any)?.doorWidthAdjustEnabled;
    const userDoorExtendMmDual = (storePlacedModule as any)?.doorWidthAdjustMm;
    const autoExtendLeftMm = insertFrameAdjacency.left ? INSERT_FRAME_DOOR_EXTENSION_MM : 0;
    const autoExtendRightMm = insertFrameAdjacency.right ? INSERT_FRAME_DOOR_EXTENSION_MM : 0;
    let leftExtendMm = 0;
    let rightExtendMm = 0;
    if (doorAdjEnabledDual) {
      const totalRaw = (userDoorExtendMmDual ?? (autoExtendLeftMm + autoExtendRightMm));
      const totalAdjusted = totalRaw + 3;
      // 자동 인접 방향이 있으면 그쪽으로 우선 배분, 양쪽 모두면 균등
      if (autoExtendLeftMm > 0 && autoExtendRightMm > 0) {
        leftExtendMm = totalAdjusted / 2;
        rightExtendMm = totalAdjusted / 2;
      } else if (autoExtendLeftMm > 0) {
        leftExtendMm = totalAdjusted;
      } else if (autoExtendRightMm > 0) {
        rightExtendMm = totalAdjusted;
      } else {
        // 수동 확장: v + 3 을 경첩 반대쪽(관례: 우측)에 적용
        rightExtendMm = totalAdjusted;
      }
    }
    let leftInsertExtendShift = 0;
    let rightInsertExtendShift = 0;
    if (leftExtendMm !== 0) {
      leftDoorWidth += leftExtendMm;
      leftInsertExtendShift = -mmToThreeUnits(leftExtendMm) / 2;
    }
    if (rightExtendMm !== 0) {
      rightDoorWidth += rightExtendMm;
      rightInsertExtendShift = mmToThreeUnits(rightExtendMm) / 2;
    }

    const leftDoorWidthUnits = mmToThreeUnits(leftDoorWidth);
    const rightDoorWidthUnits = mmToThreeUnits(rightDoorWidth);
    
    // 도어 위치 계산 — actualDoorWidth 기반 (slotWidths 기준, 본체와 일치)
    const halfActualDoor = actualDoorWidth / 2;
    const leftSlotWidth = isFree ? totalWidth / 2 : halfActualDoor;
    const rightSlotWidth = isFree ? totalWidth / 2 : halfActualDoor;
    
    const leftSlotCenter = -totalWidth / 2 + leftSlotWidth / 2;  // 왼쪽 슬롯 중심
    const rightSlotCenter = -totalWidth / 2 + leftSlotWidth + rightSlotWidth / 2;  // 오른쪽 슬롯 중심
    
    const leftXOffset = mmToThreeUnits(leftSlotCenter - outerLeftGapCompensationMm / 2);
    const rightXOffset = mmToThreeUnits(rightSlotCenter + outerRightGapCompensationMm / 2);
    
    // 힌지 축 위치 (각 도어의 바깥쪽 가장자리에서 9mm 안쪽)
    const leftHingeX = leftXOffset + (-leftDoorWidthUnits / 2 + hingeOffsetUnits);  // 왼쪽 도어: 왼쪽 가장자리 + 9mm
    const rightHingeX = rightXOffset + (rightDoorWidthUnits / 2 - hingeOffsetUnits); // 오른쪽 도어: 오른쪽 가장자리 - 9mm
    const cornerMainDoorHinge = isCornerCabinet ? adjustedHingePosition : 'left';
    const leftCornerMainDoorHingeX = cornerMainDoorHinge === 'right'
      ? leftXOffset + (leftDoorWidthUnits / 2 - hingeOffsetUnits)
      : leftHingeX;
    const rightCornerMainDoorHingeX = cornerMainDoorHinge === 'left'
      ? rightXOffset + (-rightDoorWidthUnits / 2 + hingeOffsetUnits)
      : rightHingeX;
    const leftDoorOpenGeometry = calculateDualDoorOpenGeometry({
      doorSide: isRightCornerCabinet ? cornerMainDoorHinge : 'left',
      doorYPosition,
      doorDepth,
      hingeX: isRightCornerCabinet ? leftCornerMainDoorHingeX : leftHingeX,
      doorWidthUnits: leftDoorWidthUnits,
      epTrimShift: leftEpTrimShift,
      insertExtendShift: leftInsertExtendShift,
      panelThicknessMm: panelThickness
    });
    const rightDoorOpenGeometry = calculateDualDoorOpenGeometry({
      doorSide: isLeftCornerCabinet ? cornerMainDoorHinge : 'right',
      doorYPosition,
      doorDepth,
      hingeX: isLeftCornerCabinet ? rightCornerMainDoorHingeX : rightHingeX,
      doorWidthUnits: rightDoorWidthUnits,
      epTrimShift: rightEpTrimShift,
      insertExtendShift: rightInsertExtendShift,
      panelThicknessMm: panelThickness
    });

// console.log('🚪 듀얼 도어 위치:', {
      // totalWidth,
      // slotWidths,
      // leftDoorWidth,
      // rightDoorWidth,
      // mode: slotWidths ? '개별 슬롯 너비' : '균등분할 (fallback)',
      // leftXOffset: leftXOffset.toFixed(3),
      // rightXOffset: rightXOffset.toFixed(3),
      // leftHingeX: leftHingeX.toFixed(3),
      // rightHingeX: rightHingeX.toFixed(3),
      // doorGroupX: doorGroupX
    // });

    // 측면뷰에서 선택된 슬롯 확인
    // 듀얼 도어는 전체가 하나의 컴포넌트이므로 slotIndex로 현재 슬롯 판단
    const isSideView = view2DDirection === 'left' || view2DDirection === 'right';

    // 측면뷰가 아니면 항상 표시, 측면뷰면 항상 표시 (듀얼 도어는 하나의 유닛)
    const showLeftDoor = !isLeftCornerCabinet;
    const showRightDoor = !isRightCornerCabinet;
    const leftDoorRotation = isRightCornerCabinet && cornerMainDoorHinge === 'right'
      ? dualRightDoorSpring.rotation
      : dualLeftDoorSpring.rotation;
    const rightDoorRotation = isLeftCornerCabinet && cornerMainDoorHinge === 'left'
      ? dualLeftDoorSpring.rotation
      : dualRightDoorSpring.rotation;

    return (
      <group position={[doorGroupX, 0, 0]}> {/* 듀얼 캐비넷도 원래 슬롯 중심에 배치 */}
        {!isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && renderSidePanelAnchoredHingeMarkers('dual-side-panel-hinge')}
        {/* 왼쪽 도어 - 왼쪽 힌지 (왼쪽 가장자리에서 회전) */}
        {showLeftDoor && (
        <group position={leftDoorOpenGeometry.parentPosition}>
          <animated.group rotation-y={leftDoorLocked ? 0 : leftDoorRotation}>
            <group position={leftDoorOpenGeometry.childPosition}>
              {/* 2D 정면뷰: 좌측 도어 반투명 overlay (잠금 시 붉은색) */}
              {showDoorOverlay && (
                <mesh position={[0, 0, doorThicknessUnits / 2 + 0.001]} renderOrder={9999}>
                  <planeGeometry args={[leftDoorWidthUnits, doorHeight]} />
                  <meshBasicMaterial color={leftDoorLocked ? '#FF0000' : doorOverlayColor} transparent opacity={leftDoorLocked ? 0.12 : 0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
              )}
              {/* BoxWithEdges 사용하여 도어 렌더링 (유리장은 금속프레임+유리) */}
              {moduleData?.id?.includes('glass-cabinet') ? (() => {
                const fW = mmToThreeUnits(22);
                const gT = mmToThreeUnits(5);
                const innerWL = leftDoorWidthUnits - 2 * fW;
                const innerHL = doorHeight - 2 * fW;
                const frameMat = new THREE.MeshStandardMaterial({ color: 0x918878, metalness: 0.85, roughness: 0.4 });
                const glassMat = new THREE.MeshPhysicalMaterial({
                  color: 0x4a2e1c, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.0,
                  transmission: 0.4, thickness: 0.5, ior: 1.45, side: THREE.DoubleSide,
                });
                return (
                  <GlassDoorAssemblySource
                    key={`glass-left-door-${leftDoorMaterial.uuid}`}
                    sourceKey="유리장-금속도어-좌"
                    furnitureId={furnitureId}
                    panelName="유리장 금속도어 좌"
                    args={[leftDoorWidthUnits, doorHeight, doorThicknessUnits]}
                    material={frameMat}
                  >
                    <mesh position={[0, doorHeight / 2 - fW / 2, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[leftDoorWidthUnits, fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[0, -doorHeight / 2 + fW / 2, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[leftDoorWidthUnits, fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[-leftDoorWidthUnits / 2 + fW / 2, 0, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[fW, doorHeight - 2 * fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[leftDoorWidthUnits / 2 - fW / 2, 0, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[fW, doorHeight - 2 * fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[0, 0, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[innerWL, innerHL, gT]} />
                      <primitive object={glassMat} attach="material" />
                    </mesh>
                  </GlassDoorAssemblySource>
                );
              })() : (
                <BoxWithEdges
                  key={`left-door-${leftDoorMaterial.uuid}`}
                  args={[leftDoorWidthUnits, doorHeight, doorThicknessUnits]}
                  position={[0, 0, 0]}
                  material={leftDoorMaterial}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  furnitureId={furnitureId}
                  panelName={splitDoorPanelName ? `좌측 ${splitDoorPanelName}` : '좌측 도어'}
                  textureUrl={textureUrl}
                  panelGrainDirections={panelGrainDirections}
                  isLocked={leftDoorLocked}
                />
              )}
              

              {/* Hinges for left door - 상부장, 하부장, 키큰장 (잠금 시 숨김, 유리장 제외) */}
              {viewMode === '2D' && hasCustomHingePositions && !leftDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {renderHingeMarkers(
                    -leftDoorWidthUnits / 2 + mmToThreeUnits(24),
                    9.5,
                    customHingePositionsMm,
                    'left-custom-hinge'
                  )}
                </>
              )}
              {viewMode === '2D' && !hasCustomHingePositions && !leftDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {renderHingeMarkers(
                    -leftDoorWidthUnits / 2 + mmToThreeUnits(24),
                    9.5,
                    effectiveHingePositionsMm,
                    'left-auto-hinge'
                  )}
                </>
              )}
              {!leftDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && renderHingePositionGuides(
                -leftDoorWidthUnits / 2 + mmToThreeUnits(24),
                'left',
                effectiveHingePositionsMm,
                'left-door-hinge'
              )}


              {/* Door opening direction for left door - 잠금 시 숨김, 치수 OFF 시 숨김 */}
              {effectiveShowDimensions && !isHingePositionEditMode && !isPlainMaterial && !leftDoorLocked && (viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front')) && (() => {
                const segments = (() => {
                  const isFrontView = viewMode === '3D' || view2DDirection === 'front';
                  const segmentList: React.ReactNode[] = [];
                  const longDash = 2.4;
                  const shortDash = 0.9;
                  const gap = 0.9;

                  if (isDummyDoorModule && isFrontView) {
                    return [
                      <Line
                        key="left-dummy-x-1"
                        points={[
                          [-leftDoorWidthUnits / 2, -doorHeight / 2, 0],
                          [leftDoorWidthUnits / 2, doorHeight / 2, 0]
                        ]}
                        color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                        lineWidth={1}
                        transparent
                        opacity={viewMode === '3D' ? 0.5 : 1.0}
                      />,
                      <Line
                        key="left-dummy-x-2"
                        points={[
                          [-leftDoorWidthUnits / 2, doorHeight / 2, 0],
                          [leftDoorWidthUnits / 2, -doorHeight / 2, 0]
                        ]}
                        color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                        lineWidth={1}
                        transparent
                        opacity={viewMode === '3D' ? 0.5 : 1.0}
                      />
                    ];
                  }

                  if (isFrontView) {
                    const start1 = [leftDoorWidthUnits / 2, -doorHeight / 2, 0] as const;
                    const end1 = [-leftDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`left-door-front-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    const start2 = [-leftDoorWidthUnits / 2, 0, 0] as const;
                    const end2 = [leftDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2 - currentPos);
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + actualLength) / totalLength2;
                      segmentList.push(
                        <Line
                          key={`left-door-front-2-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  } else {
                    // 첫 번째 선: 왼쪽 상단 → 오른쪽 중간
                    const start1 = [-leftDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const end1 = [leftDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`left-door-side-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    // 두 번째 선: 오른쪽 중간 → 왼쪽 하단
                    const start2 = [leftDoorWidthUnits / 2, 0, 0] as const;
                    const end2 = [-leftDoorWidthUnits / 2, -doorHeight / 2, 0] as const;
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2s = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2s) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2s - currentPos);
                      const t1 = currentPos / totalLength2s;
                      const t2 = (currentPos + actualLength) / totalLength2s;
                      segmentList.push(
                        <Line
                          key={`left-door-side-2-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2s) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  }

                  return segmentList;
                })();

                const indicatorRotation = dualLeftDoorSpring.rotation.to(value => {
                  if (viewMode === '3D' || !isSide2DView) {
                    return 0;
                  }
                  const orientationSign = 1; // 측면뷰에서는 항상 동일한 방향 유지
                  const targetWorldRotation = orientationSign * Math.abs(value);
                  return targetWorldRotation - value;
                });

                return (
                  <animated.group
                    name="door-diagonal-group"
                    position={[0, 0, doorThicknessUnits / 2 + 0.001]}
                    rotation-y={indicatorRotation}
                  >
                    {segments}
                  </animated.group>
                );
              })()}

              {/* 왼쪽 도어 가로 폭 치수 (2D 정면뷰 + 3D) */}
              {showDoorDimensionGuides && (() => {
                const is3D = viewMode === '3D';
                const extensionLineStart = doorDimensionWidthLineStart;
                const extensionLineLength = doorDimensionWidthLineLength;
                const tickSize = 0.008;
                const zPos = is3D ? doorThicknessUnits / 2 + doorDimensionForwardOffset : doorThicknessUnits / 2 + 0.001;
                const dimColor = activeDoorDimensionColor;

                const dimensionLinePos = -doorHeight / 2 - extensionLineStart - extensionLineLength;
                const extensionStart = -doorHeight / 2 - extensionLineStart;

                return (
                  <>
                    {effectiveDoorHeightDimensionSides.left && (
                    <>
                    {renderDoorDimensionHoverPlane({
                      keyName: 'left-door-height-hover',
                      position: [
                        -leftDoorWidthUnits / 2 - doorDimensionSideLineOffset,
                        (doorDimensionTopY + doorDimensionBottomY) / 2,
                        zPos + 0.002
                      ],
                      args: [mmToThreeUnits(80), Math.max(mmToThreeUnits(120), Math.abs(doorDimensionTopY - doorDimensionBottomY))]
                    })}
                    <NativeLine name="door-dimension-height" points={[
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset, -doorHeight / 2, zPos],
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset, doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset - tickSize, -doorHeight / 2, zPos],
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset + tickSize, -doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset - tickSize, doorHeight / 2, zPos],
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset + tickSize, doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [-leftDoorWidthUnits / 2, -doorHeight / 2, zPos],
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset, -doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [-leftDoorWidthUnits / 2, doorHeight / 2, zPos],
                      [-leftDoorWidthUnits / 2 - doorDimensionSideLineOffset, doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <DimensionText
                      name="door-dimension-height-text"
                      value={actualDoorHeight}
                      position={[-leftDoorWidthUnits / 2 - doorDimensionSideTextOffset, 0, zPos]}
                      color={dimColor}
                      hoverColor={doorDimensionHoverColor}
                      onHoverChange={setIsDoorDimensionHovered}
                      anchorX="center"
                      anchorY="middle"
                      forceShow={true}
                    />
                    {renderDoorGapDimensionMarkers({
                      lineX: -leftDoorWidthUnits / 2 - doorDimensionSideLineOffset,
                      textX: -leftDoorWidthUnits / 2 - doorDimensionSideTextOffset,
                      zPos,
                      dimColor,
                      tickSize,
                      keyPrefix: 'left-door',
                    })}
                    </>
                    )}

                    {!hideWidthDimension && (
                      <>
                        {renderDoorDimensionHoverPlane({
                          keyName: 'left-door-width-hover',
                          position: [0, dimensionLinePos, zPos + 0.002],
                          args: [leftDoorWidthUnits + mmToThreeUnits(260), mmToThreeUnits(80)]
                        })}
                        <NativeLine name="door-dimension" points={[
                          [-leftDoorWidthUnits / 2, extensionStart, zPos],
                          [-leftDoorWidthUnits / 2, dimensionLinePos, zPos]
                        ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                        <NativeLine name="door-dimension" points={[
                          [leftDoorWidthUnits / 2, extensionStart, zPos],
                          [leftDoorWidthUnits / 2, dimensionLinePos, zPos]
                        ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                        <NativeLine name="door-dimension" points={[
                          [-leftDoorWidthUnits / 2, dimensionLinePos, zPos],
                          [leftDoorWidthUnits / 2, dimensionLinePos, zPos]
                        ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                        <NativeLine name="door-dimension" points={[
                          [-leftDoorWidthUnits / 2 - tickSize, dimensionLinePos, zPos],
                          [-leftDoorWidthUnits / 2 + tickSize, dimensionLinePos, zPos]
                        ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                        <NativeLine name="door-dimension" points={[
                          [leftDoorWidthUnits / 2 - tickSize, dimensionLinePos, zPos],
                          [leftDoorWidthUnits / 2 + tickSize, dimensionLinePos, zPos]
                        ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                        <DimensionText
                          name="door-dimension-text"
                          value={leftDoorWidth}
                          position={[0, dimensionLinePos + mmToThreeUnits(15), zPos]}
                          color={dimColor}
                          hoverColor={doorDimensionHoverColor}
                          onHoverChange={setIsDoorDimensionHovered}
                          anchorX="center"
                          anchorY="bottom"
                          forceShow={true}
                        />
                      </>
                    )}
                  </>
                );
              })()}
            </group>
          </animated.group>
        </group>
        )}

        {/* 오른쪽 도어 - 오른쪽 힌지 (오른쪽 가장자리에서 회전) */}
        {showRightDoor && (
        <group position={rightDoorOpenGeometry.parentPosition}>
          <animated.group rotation-y={rightDoorLocked ? 0 : rightDoorRotation}>
            <group position={rightDoorOpenGeometry.childPosition}>
              {/* 2D 정면뷰: 우측 도어 반투명 overlay (잠금 시 붉은색) */}
              {showDoorOverlay && (
                <mesh position={[0, 0, doorThicknessUnits / 2 + 0.001]} renderOrder={9999}>
                  <planeGeometry args={[rightDoorWidthUnits, doorHeight]} />
                  <meshBasicMaterial color={rightDoorLocked ? '#FF0000' : doorOverlayColor} transparent opacity={rightDoorLocked ? 0.12 : 0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
              )}
              {/* BoxWithEdges 사용하여 도어 렌더링 (유리장은 금속프레임+유리) */}
              {moduleData?.id?.includes('glass-cabinet') ? (() => {
                const fW = mmToThreeUnits(22);
                const gT = mmToThreeUnits(5);
                const innerWR = rightDoorWidthUnits - 2 * fW;
                const innerHR = doorHeight - 2 * fW;
                const frameMat = new THREE.MeshStandardMaterial({ color: 0x918878, metalness: 0.85, roughness: 0.4 });
                const glassMat = new THREE.MeshPhysicalMaterial({
                  color: 0x4a2e1c, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.0,
                  transmission: 0.4, thickness: 0.5, ior: 1.45, side: THREE.DoubleSide,
                });
                return (
                  <GlassDoorAssemblySource
                    key={`glass-right-door-${rightDoorMaterial.uuid}`}
                    sourceKey="유리장-금속도어-우"
                    furnitureId={furnitureId}
                    panelName="유리장 금속도어 우"
                    args={[rightDoorWidthUnits, doorHeight, doorThicknessUnits]}
                    material={frameMat}
                  >
                    <mesh position={[0, doorHeight / 2 - fW / 2, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[rightDoorWidthUnits, fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[0, -doorHeight / 2 + fW / 2, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[rightDoorWidthUnits, fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[-rightDoorWidthUnits / 2 + fW / 2, 0, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[fW, doorHeight - 2 * fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[rightDoorWidthUnits / 2 - fW / 2, 0, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[fW, doorHeight - 2 * fW, doorThicknessUnits]} />
                      <primitive object={frameMat} attach="material" />
                    </mesh>
                    <mesh position={[0, 0, 0]} userData={{ skipCNC: true }}>
                      <boxGeometry args={[innerWR, innerHR, gT]} />
                      <primitive object={glassMat} attach="material" />
                    </mesh>
                  </GlassDoorAssemblySource>
                );
              })() : (
                <BoxWithEdges
                  key={`right-door-${rightDoorMaterial.uuid}`}
                  args={[rightDoorWidthUnits, doorHeight, doorThicknessUnits]}
                  position={[0, 0, 0]}
                  material={rightDoorMaterial}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  furnitureId={furnitureId}
                  panelName={splitDoorPanelName ? `우측 ${splitDoorPanelName}` : '우측 도어'}
                  textureUrl={textureUrl}
                  panelGrainDirections={panelGrainDirections}
                  isLocked={rightDoorLocked}
                />
              )}

              {/* Hinges for right door - 상부장, 하부장, 키큰장 (잠금 시 숨김, 유리장 제외) */}
              {viewMode === '2D' && hasCustomHingePositions && !rightDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {renderHingeMarkers(
                    rightDoorWidthUnits / 2 - mmToThreeUnits(24),
                    -9.5,
                    customHingePositionsMm,
                    'right-custom-hinge'
                  )}
                </>
              )}
              {viewMode === '2D' && !hasCustomHingePositions && !rightDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
                <>
                  {renderHingeMarkers(
                    rightDoorWidthUnits / 2 - mmToThreeUnits(24),
                    -9.5,
                    effectiveHingePositionsMm,
                    'right-auto-hinge'
                  )}
                </>
              )}
              {!rightDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && renderHingePositionGuides(
                rightDoorWidthUnits / 2 - mmToThreeUnits(24),
                'right',
                effectiveHingePositionsMm,
                'right-door-hinge'
              )}


              {/* Door opening direction for right door - 잠금 시 숨김, 치수 OFF 시 숨김 */}
              {effectiveShowDimensions && !isHingePositionEditMode && !isPlainMaterial && !rightDoorLocked && (viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front')) && (() => {
                const segments = (() => {
                  const isFrontView = viewMode === '3D' || view2DDirection === 'front';
                  const segmentList: React.ReactNode[] = [];
                  const longDash = 2.4;
                  const shortDash = 0.9;
                  const gap = 0.9;

                  if (isDummyDoorModule && isFrontView) {
                    return [
                      <Line
                        key="right-dummy-x-1"
                        points={[
                          [-rightDoorWidthUnits / 2, -doorHeight / 2, 0],
                          [rightDoorWidthUnits / 2, doorHeight / 2, 0]
                        ]}
                        color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                        lineWidth={1}
                        transparent
                        opacity={viewMode === '3D' ? 0.5 : 1.0}
                      />,
                      <Line
                        key="right-dummy-x-2"
                        points={[
                          [-rightDoorWidthUnits / 2, doorHeight / 2, 0],
                          [rightDoorWidthUnits / 2, -doorHeight / 2, 0]
                        ]}
                        color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                        lineWidth={1}
                        transparent
                        opacity={viewMode === '3D' ? 0.5 : 1.0}
                      />
                    ];
                  }

                  if (isFrontView) {
                    const start1 = [-rightDoorWidthUnits / 2, -doorHeight / 2, 0] as const;
                    const end1 = [rightDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`right-door-front-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    const start2 = [rightDoorWidthUnits / 2, 0, 0] as const;
                    const end2 = [-rightDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2 - currentPos);
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + actualLength) / totalLength2;
                      segmentList.push(
                        <Line
                          key={`right-door-front-2-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  } else {
                    // 첫 번째 선: 왼쪽 상단 → 오른쪽 중간
                    const start1 = [-rightDoorWidthUnits / 2, doorHeight / 2, 0] as const;
                    const end1 = [rightDoorWidthUnits / 2, 0, 0] as const;
                    const dx1 = end1[0] - start1[0];
                    const dy1 = end1[1] - start1[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segmentList.push(
                        <Line
                          key={`right-door-side-1-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    // 두 번째 선: 오른쪽 중간 → 왼쪽 하단
                    const start2 = [rightDoorWidthUnits / 2, 0, 0] as const;
                    const end2 = [-rightDoorWidthUnits / 2, -doorHeight / 2, 0] as const;
                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2s = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2s) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2s - currentPos);
                      const t1 = currentPos / totalLength2s;
                      const t2 = (currentPos + actualLength) / totalLength2s;
                      segmentList.push(
                        <Line
                          key={`right-door-side-2-${currentPos}`}
                          points={[
                            [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                            [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                          ]}
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2s) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }
                  }

                  return segmentList;
                })();

                const indicatorRotation = dualRightDoorSpring.rotation.to(value => {
                  if (viewMode === '3D' || !isSide2DView) {
                    return 0;
                  }
                  const orientationSign = 1; // 측면뷰에서는 항상 동일한 방향 유지
                  const targetWorldRotation = orientationSign * Math.abs(value);
                  return targetWorldRotation - value;
                });

                return (
                  <animated.group
                    name="door-diagonal-group"
                    position={[0, 0, doorThicknessUnits / 2 + 0.001]}
                    rotation-y={indicatorRotation}
                  >
                    {segments}
                  </animated.group>
                );
              })()}

              {/* 오른쪽 도어 가로 폭 치수 (2D 정면뷰 + 3D) */}
              {showDoorDimensionGuides && (() => {
                const is3D = viewMode === '3D';
                const extensionLineStart = doorDimensionWidthLineStart;
                const extensionLineLength = doorDimensionWidthLineLength;
                const tickSize = 0.008;
                const zPos = is3D ? doorThicknessUnits / 2 + doorDimensionForwardOffset : doorThicknessUnits / 2 + 0.001;
                const dimColor = activeDoorDimensionColor;

                const dimensionLinePos = -doorHeight / 2 - extensionLineStart - extensionLineLength;
                const extensionStart = -doorHeight / 2 - extensionLineStart;

                return (
                  <>
                    {effectiveDoorHeightDimensionSides.right && (
                    <>
                    {renderDoorDimensionHoverPlane({
                      keyName: 'right-door-height-hover',
                      position: [
                        rightDoorWidthUnits / 2 + doorDimensionSideLineOffset,
                        (doorDimensionTopY + doorDimensionBottomY) / 2,
                        zPos + 0.002
                      ],
                      args: [mmToThreeUnits(80), Math.max(mmToThreeUnits(120), Math.abs(doorDimensionTopY - doorDimensionBottomY))]
                    })}
                    <NativeLine name="door-dimension-height" points={[
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset, -doorHeight / 2, zPos],
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset, doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset - tickSize, -doorHeight / 2, zPos],
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset + tickSize, -doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset - tickSize, doorHeight / 2, zPos],
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset + tickSize, doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [rightDoorWidthUnits / 2, -doorHeight / 2, zPos],
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset, -doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <NativeLine name="door-dimension-height" points={[
                      [rightDoorWidthUnits / 2, doorHeight / 2, zPos],
                      [rightDoorWidthUnits / 2 + doorDimensionSideLineOffset, doorHeight / 2, zPos]
                    ]} color={dimColor} lineWidth={1} renderOrder={100001} depthTest={false} depthWrite={false} transparent={true} />

                    <DimensionText
                      name="door-dimension-height-text"
                      value={actualDoorHeight}
                      position={[rightDoorWidthUnits / 2 + doorDimensionSideTextOffset, 0, zPos]}
                      color={dimColor}
                      hoverColor={doorDimensionHoverColor}
                      onHoverChange={setIsDoorDimensionHovered}
                      anchorX="center"
                      anchorY="middle"
                      forceShow={true}
                    />
                    {renderDoorGapDimensionMarkers({
                      lineX: rightDoorWidthUnits / 2 + doorDimensionSideLineOffset,
                      textX: rightDoorWidthUnits / 2 + doorDimensionSideTextOffset,
                      zPos,
                      dimColor,
                      tickSize,
                      keyPrefix: 'right-door',
                    })}
                    </>
                    )}

                    {!hideWidthDimension && (
                      <>
                        {renderDoorDimensionHoverPlane({
                          keyName: 'right-door-width-hover',
                          position: [0, dimensionLinePos, zPos + 0.002],
                          args: [rightDoorWidthUnits + mmToThreeUnits(260), mmToThreeUnits(80)]
                        })}
                        <NativeLine
                          name="door-dimension"
                          points={[
                            [-rightDoorWidthUnits / 2, extensionStart, zPos],
                            [-rightDoorWidthUnits / 2, dimensionLinePos, zPos]
                          ]}
                          color={dimColor}
                          lineWidth={1}
                          renderOrder={100001}
                          depthTest={false}
                          depthWrite={false}
                          transparent={true}
                        />

                        <NativeLine
                          name="door-dimension"
                          points={[
                            [rightDoorWidthUnits / 2, extensionStart, zPos],
                            [rightDoorWidthUnits / 2, dimensionLinePos, zPos]
                          ]}
                          color={dimColor}
                          lineWidth={1}
                          renderOrder={100001}
                          depthTest={false}
                          depthWrite={false}
                          transparent={true}
                        />

                        <NativeLine
                          name="door-dimension"
                          points={[
                            [-rightDoorWidthUnits / 2, dimensionLinePos, zPos],
                            [rightDoorWidthUnits / 2, dimensionLinePos, zPos]
                          ]}
                          color={dimColor}
                          lineWidth={1}
                          renderOrder={100001}
                          depthTest={false}
                          depthWrite={false}
                          transparent={true}
                        />

                        <NativeLine
                          name="door-dimension"
                          points={[
                            [-rightDoorWidthUnits / 2 - tickSize, dimensionLinePos, zPos],
                            [-rightDoorWidthUnits / 2 + tickSize, dimensionLinePos, zPos]
                          ]}
                          color={dimColor}
                          lineWidth={1}
                          renderOrder={100001}
                          depthTest={false}
                          depthWrite={false}
                          transparent={true}
                        />

                        <NativeLine
                          name="door-dimension"
                          points={[
                            [rightDoorWidthUnits / 2 - tickSize, dimensionLinePos, zPos],
                            [rightDoorWidthUnits / 2 + tickSize, dimensionLinePos, zPos]
                          ]}
                          color={dimColor}
                          lineWidth={1}
                          renderOrder={100001}
                          depthTest={false}
                          depthWrite={false}
                          transparent={true}
                        />

                        <DimensionText
                          name="door-dimension-text"
                          value={rightDoorWidth}
                          position={[0, dimensionLinePos + mmToThreeUnits(15), zPos]}
                          color={dimColor}
                          hoverColor={doorDimensionHoverColor}
                          onHoverChange={setIsDoorDimensionHovered}
                          anchorX="center"
                          anchorY="bottom"
                          forceShow={true}
                        />
                      </>
                    )}
                  </>
                );
              })()}
            </group>
          </animated.group>
        </group>
        )}

        {/* 측면뷰 하부장/걸래받이 치수는 CADDimensions2D 왼쪽 2단에서 처리 */}
      </group>
    );
  } else {
    // 싱글 가구: 하나의 문 - 힌지 위치에 따라 회전축을 문의 가장자리에서 10mm 안쪽으로 이동
    // 도어는 항상 3mm 갭 적용 (가구보다 3mm 작게)
    const doorGap = 3;
    const outerLeftGapCompensationMm = openOuterDoorSides.left ? 1.5 : 0;
    const outerRightGapCompensationMm = openOuterDoorSides.right ? 1.5 : 0;
    let doorWidth = actualDoorWidth - doorGap + outerLeftGapCompensationMm + outerRightGapCompensationMm; // 슬롯사이즈 - 적용 갭
    const openOuterShiftX = mmToThreeUnits(outerRightGapCompensationMm - outerLeftGapCompensationMm) / 2;

    // EP ㄷ자 프레임 잠금: 힌지가 EP 쪽이면 도어 회전 시 ㄷ자 EP에 부딪힘 → 잠금
    // 힌지가 반대쪽이면 도어가 EP 반대 방향으로 열리므로 충돌 없음 → 통과
    const singleEpIsCFrame = !!(storePlacedModule && (storePlacedModule.endPanelThickness || 18) > 20);
    const singleHinge = (storePlacedModule?.hingePosition ?? hingePosition ?? 'right') as 'left' | 'right';
    const singleDoorLocked = !!(singleEpIsCFrame && (
      (storePlacedModule?.hasLeftEndPanel && singleHinge === 'left')
      || (storePlacedModule?.hasRightEndPanel && singleHinge === 'right')
    ));

    // EP 앞으로 돌출 시 도어 너비 축소: 깊이 확장 front 또는 옵셋 양수(앞 확장)
    let epTrimLeft = 0;
    let epTrimRight = 0;
    if (storePlacedModule) {
      const epThickMm = storePlacedModule.endPanelThickness || 18;
      // 앞 옵셋 > 0 이면 EP가 앞으로 돌출 → 도어 트림 필요
      const leftFrontOffset = storePlacedModule.leftEndPanelOffset ?? 0;
      const rightFrontOffset = storePlacedModule.rightEndPanelOffset ?? 0;

      if (storePlacedModule.hasLeftEndPanel && leftFrontOffset > 0) {
        doorWidth -= epThickMm;
        epTrimLeft = epThickMm;
      }
      if (storePlacedModule.hasRightEndPanel && rightFrontOffset > 0) {
        doorWidth -= epThickMm;
        epTrimRight = epThickMm;
      }
    }
    // X 위치 보정: 좌측 trim은 오른쪽으로, 우측 trim은 왼쪽으로 밀기
    const epTrimShiftX = mmToThreeUnits(epTrimLeft - epTrimRight) / 2;

    // Insert 프레임 인접 시 도어 확장 (해당 쪽으로)
    // 도어 확장/축소 토글: ON 시 입력값 v(mm)는 몸통 대비 도어 전체 폭 증감값이다.
    // 기본 도어 폭이 몸통-3mm에서 시작하므로 v=0이 몸통과 같아지도록 +3mm를 보정한다.
    const doorAdjEnabled = !!(storePlacedModule as any)?.doorWidthAdjustEnabled;
    const userDoorExtendMm = (storePlacedModule as any)?.doorWidthAdjustMm;
    const autoLeftMm = insertFrameAdjacency.left ? INSERT_FRAME_DOOR_EXTENSION_MM : 0;
    const autoRightMm = insertFrameAdjacency.right ? INSERT_FRAME_DOOR_EXTENSION_MM : 0;
    let insertExtendLeft = 0;
    let insertExtendRight = 0;
    if (doorAdjEnabled) {
      // 입력값 의미: 도어 전체 폭 = 몸통폭 + v.
      //   기준 doorWidth는 (몸통-3)에서 시작이므로 (v + 3)만큼 적용한다.
      //   v=-1.5→몸통-1.5, v=0→몸통, v=40→몸통+40.
      const totalRaw = (userDoorExtendMm ?? (autoLeftMm + autoRightMm));
      const totalAdjusted = totalRaw + 3;
      if (autoLeftMm > 0 && autoRightMm > 0) {
        const total = totalAdjusted;
        insertExtendLeft = total / 2;
        insertExtendRight = total / 2;
      } else if (autoLeftMm > 0) {
        insertExtendLeft = totalAdjusted;
      } else if (autoRightMm > 0) {
        insertExtendRight = totalAdjusted;
      } else {
        // 수동 확장: v + 3 을 경첩 반대쪽에 적용
        const totalAdj = totalAdjusted;
        const manualAdjustment = resolveHingeOppositeDoorWidthAdjustment(totalAdj, adjustedHingePosition);
        insertExtendLeft = manualAdjustment.leftMm;
        insertExtendRight = manualAdjustment.rightMm;
      }
      doorWidth += insertExtendLeft + insertExtendRight;
    }
    // 좌측 확장은 도어를 좌측으로(-X), 우측 확장은 우측으로(+X) 시프트
    const insertExtendShiftX = mmToThreeUnits(insertExtendRight - insertExtendLeft) / 2;

    const doorWidthUnits = mmToThreeUnits(doorWidth);

// console.log('🚪 싱글 도어 크기:', {
      // actualDoorWidth,
      // doorWidth,
      // originalSlotWidth,
      // fallbackColumnWidth: indexing.columnWidth,
      // moduleDataId: moduleData?.id
    // });

    const singleDoorOpenGeometry = calculateSingleDoorOpenGeometry({
      hingeSide: adjustedHingePosition,
      doorGroupX: doorGroupX + openOuterShiftX,
      doorYPosition,
      doorDepth,
      doorWidthUnits,
      epTrimShiftX,
      insertExtendShiftX,
      panelThicknessMm: panelThickness
    });

    return (
      <group>
        {!isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && renderSidePanelAnchoredHingeMarkers('single-side-panel-hinge')}
        <group position={singleDoorOpenGeometry.parentPosition}>
        <animated.group rotation-y={singleDoorLocked ? 0 : (adjustedHingePosition === 'left' ? leftHingeDoorSpring.rotation : rightHingeDoorSpring.rotation)}>
          <group position={singleDoorOpenGeometry.childPosition}>
            {/* 2D 정면뷰: 싱글 도어 반투명 overlay (잠금 시 붉은색) */}
            {showDoorOverlay && (
              <mesh position={[0, 0, doorThicknessUnits / 2 + 0.001]} renderOrder={9999}>
                <planeGeometry args={[doorWidthUnits, doorHeight]} />
                <meshBasicMaterial color={singleDoorLocked ? '#FF0000' : doorOverlayColor} transparent opacity={singleDoorLocked ? 0.12 : 0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
              </mesh>
            )}
            {/* 도어 갭 하이라이트 (상단갭/하단갭 입력 포커스 시) */}
            {highlightedDoorGap && furnitureId && highlightedDoorGap.moduleIds?.includes(furnitureId) && (() => {
              const gapMm = highlightedDoorGap.side === 'top'
                ? ((doorTopGapProp ?? 5))
                : ((doorBottomGapProp ?? 25));
              const gapUnits = mmToThreeUnits(Math.abs(gapMm));
              if (gapUnits <= 0.001) return null;
              const yOffset = highlightedDoorGap.side === 'top'
                ? (doorHeight / 2 + gapUnits / 2)
                : -(doorHeight / 2 + gapUnits / 2);
              return (
                <mesh position={[0, yOffset, doorThicknessUnits / 2 + 0.002]} renderOrder={10000}>
                  <planeGeometry args={[doorWidthUnits, gapUnits]} />
                  <meshBasicMaterial color="#FF0000" transparent opacity={0.35} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
              );
            })()}
            {/* BoxWithEdges 사용하여 도어 렌더링 — 유리장은 금속 프레임 + 브라운 유리 */}
            {moduleData?.id?.includes('glass-cabinet') ? (() => {
              // 금속 프레임 폭 25mm (정면 기준), 두께 18mm (도어 두께)
              const frameWidthMm = 22;
              const glassThicknessMm = 5;
              const fW = mmToThreeUnits(frameWidthMm);
              const gT = mmToThreeUnits(glassThicknessMm);
              // 유리: 프레임 안쪽 영역 (사방 25mm 안쪽)
              const innerW = doorWidthUnits - 2 * fW;
              const innerH = doorHeight - 2 * fW;
              // 금속 프레임 재질 (사용자 지정 브론즈 #918878)
              const frameMaterial = new THREE.MeshStandardMaterial({
                color: 0x918878,
                metalness: 0.85,
                roughness: 0.4,
              });
              // 브라운경(짙은 갈색 반투명 유리) 재질 — 브라운 톤 강화
              const glassMaterial = new THREE.MeshPhysicalMaterial({
                color: 0x4a2e1c,
                transparent: true,
                opacity: 0.38,
                roughness: 0.08,
                metalness: 0.0,
                transmission: 0.4,
                thickness: 0.5,
                ior: 1.45,
                side: THREE.DoubleSide,
              });
              return (
                <GlassDoorAssemblySource
                  key={`glass-door-${doorMaterial.uuid}`}
                  sourceKey="유리장-금속도어"
                  furnitureId={furnitureId}
                  panelName="유리장 금속도어"
                  args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
                  material={frameMaterial}
                >
                  {/* 상단 프레임 */}
                  <mesh position={[0, doorHeight / 2 - fW / 2, 0]} userData={{ skipCNC: true }}>
                    <boxGeometry args={[doorWidthUnits, fW, doorThicknessUnits]} />
                    <primitive object={frameMaterial} attach="material" />
                  </mesh>
                  {/* 하단 프레임 */}
                  <mesh position={[0, -doorHeight / 2 + fW / 2, 0]} userData={{ skipCNC: true }}>
                    <boxGeometry args={[doorWidthUnits, fW, doorThicknessUnits]} />
                    <primitive object={frameMaterial} attach="material" />
                  </mesh>
                  {/* 좌측 프레임 */}
                  <mesh position={[-doorWidthUnits / 2 + fW / 2, 0, 0]} userData={{ skipCNC: true }}>
                    <boxGeometry args={[fW, doorHeight - 2 * fW, doorThicknessUnits]} />
                    <primitive object={frameMaterial} attach="material" />
                  </mesh>
                  {/* 우측 프레임 */}
                  <mesh position={[doorWidthUnits / 2 - fW / 2, 0, 0]} userData={{ skipCNC: true }}>
                    <boxGeometry args={[fW, doorHeight - 2 * fW, doorThicknessUnits]} />
                    <primitive object={frameMaterial} attach="material" />
                  </mesh>
                  {/* 브라운 유리 (도어 두께 가운데, 5mm) */}
                  <mesh position={[0, 0, 0]} userData={{ skipCNC: true }}>
                    <boxGeometry args={[innerW, innerH, gT]} />
                    <primitive object={glassMaterial} attach="material" />
                  </mesh>
                </GlassDoorAssemblySource>
              );
            })() : (
              <BoxWithEdges
                key={`single-door-${doorMaterial.uuid}`}
                args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
                position={[0, 0, 0]}
                material={doorMaterial}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                furnitureId={furnitureId}
                panelName={splitDoorPanelName ?? '도어'}
                textureUrl={textureUrl}
                panelGrainDirections={panelGrainDirections}
                isLocked={singleDoorLocked}
              />
            )}

            {/* Hinges for single door - 상부장 2개, 하부장 2개, 키큰장 4개 (잠금 시 숨김, 유리장 제외) */}
            {viewMode === '2D' && hasCustomHingePositions && !singleDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
              <>
                {renderHingeMarkers(
                  adjustedHingePosition === 'left'
                    ? -doorWidthUnits / 2 + mmToThreeUnits(24)
                    : doorWidthUnits / 2 - mmToThreeUnits(24),
                  adjustedHingePosition === 'left' ? 9.5 : -9.5,
                  customHingePositionsMm,
                  'single-custom-hinge'
                )}
              </>
            )}
            {viewMode === '2D' && !hasCustomHingePositions && !singleDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
              <>
                {renderHingeMarkers(
                  adjustedHingePosition === 'left'
                    ? -doorWidthUnits / 2 + mmToThreeUnits(24)
                    : doorWidthUnits / 2 - mmToThreeUnits(24),
                  adjustedHingePosition === 'left' ? 9.5 : -9.5,
                  effectiveHingePositionsMm,
                  'single-auto-hinge'
                )}
              </>
            )}
            {!singleDoorLocked && !isDummyDoorModule && !moduleData?.id?.includes('glass-cabinet') && renderHingePositionGuides(
              adjustedHingePosition === 'left'
                ? -doorWidthUnits / 2 + mmToThreeUnits(24)
                : doorWidthUnits / 2 - mmToThreeUnits(24),
              adjustedHingePosition === 'left' ? 'left' : 'right',
              effectiveHingePositionsMm,
              'single-door-hinge'
            )}


            {/* 도어 열리는 방향 표시 (2D 정면뷰/측면뷰 + 3D) - 잠금 시 숨김, 치수 OFF 시 숨김 */}
            {effectiveShowDimensions && !isHingePositionEditMode && !isPlainMaterial && !singleDoorLocked && (viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front')) && (() => {
              const indicatorRotation = (adjustedHingePosition === 'left'
                ? leftHingeDoorSpring.rotation
                : rightHingeDoorSpring.rotation).to(value => {
                  if (viewMode === '3D' || !isSide2DView) {
                    return 0;
                  }
                  const orientationSign = 1; // 측면뷰에서는 항상 동일한 방향 유지
                  const targetWorldRotation = orientationSign * Math.abs(value);
                  return targetWorldRotation - value;
                });

              return (
                <animated.group
                  name="door-diagonal-group"
                  position={[0, 0, doorThicknessUnits / 2 + 0.001]}
                  rotation-y={indicatorRotation}
                >
                {/* 대각선 - 도어 열림 방향 표시 (긴선-짧은선 교차 패턴) */}
                {(() => {
                  const isFrontView = viewMode === '3D' || view2DDirection === 'front';

                  // 패턴 정의: [긴 대시, 공백, 짧은 대시, 공백]의 반복
                  const longDash = 2.4;
                  const shortDash = 0.9;
                  const gap = 0.9;
                  const segments1 = [];

                  if (isDummyDoorModule && isFrontView) {
                    return [
                      <Line
                        key="dummy-x-1"
                        points={[
                          [-doorWidthUnits / 2, -doorHeight / 2, 0],
                          [doorWidthUnits / 2, doorHeight / 2, 0]
                        ]}
                        name="door-diagonal"
                        color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                        lineWidth={1}
                        transparent={true}
                        opacity={viewMode === '3D' ? 0.5 : 1.0}
                      />,
                      <Line
                        key="dummy-x-2"
                        points={[
                          [-doorWidthUnits / 2, doorHeight / 2, 0],
                          [doorWidthUnits / 2, -doorHeight / 2, 0]
                        ]}
                        name="door-diagonal"
                        color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                        lineWidth={1}
                        transparent={true}
                        opacity={viewMode === '3D' ? 0.5 : 1.0}
                      />
                    ];
                  }

                  if (!isFrontView) {
                    // 측면뷰: 항상 동일한 기준으로 표시 (좌/우측 뷰 모두 동일)
                    // 첫 번째 선: 왼쪽 상단 → 오른쪽 중간
                    const line1Start = [-doorWidthUnits / 2, doorHeight / 2, 0];
                    const line1End = [doorWidthUnits / 2, 0, 0];
                    const dx1 = line1End[0] - line1Start[0];
                    const dy1 = line1End[1] - line1Start[1];
                    const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    let currentPos = 0;
                    let isLongDash = true;

                    while (currentPos < totalLength1) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength1 - currentPos);
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + actualLength) / totalLength1;
                      segments1.push(
                        <Line
                          key={`line1-${isLongDash ? 'long' : 'short'}-${currentPos}`}
                          points={[
                            [line1Start[0] + dx1 * t1, line1Start[1] + dy1 * t1, 0],
                            [line1Start[0] + dx1 * t2, line1Start[1] + dy1 * t2, 0]
                          ]}
                          name="door-diagonal"
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent={true}
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength1) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    // 두 번째 선: 오른쪽 중간 → 왼쪽 하단
                    const line2Start = [doorWidthUnits / 2, 0, 0];
                    const line2End = [-doorWidthUnits / 2, -doorHeight / 2, 0];
                    const dx2 = line2End[0] - line2Start[0];
                    const dy2 = line2End[1] - line2Start[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    while (currentPos < totalLength2) {
                      const dashLength = isLongDash ? longDash : shortDash;
                      const actualLength = Math.min(dashLength, totalLength2 - currentPos);
                      const t1 = currentPos / totalLength2;
                      const t2 = (currentPos + actualLength) / totalLength2;
                      segments1.push(
                        <Line
                          key={`line2-${isLongDash ? 'long' : 'short'}-${currentPos}`}
                          points={[
                            [line2Start[0] + dx2 * t1, line2Start[1] + dy2 * t1, 0],
                            [line2Start[0] + dx2 * t2, line2Start[1] + dy2 * t2, 0]
                          ]}
                          name="door-diagonal"
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent={true}
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + actualLength >= totalLength2) break;
                      currentPos += actualLength + gap;
                      isLongDash = !isLongDash;
                    }

                    return segments1;
                  }

                  // 정면뷰: X 패턴
                  const start1 = [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, -doorHeight / 2, 0];
                  const end1 = [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0];

                  const dx1 = end1[0] - start1[0];
                  const dy1 = end1[1] - start1[1];
                  const totalLength1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                  let currentPos = 0;
                  let isLongDash = true;

                  while (currentPos < totalLength1) {
                    if (isLongDash) {
                      let dashLength = longDash;
                      if (currentPos + longDash + gap >= totalLength1) {
                        dashLength = totalLength1 - currentPos;
                      }
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + dashLength) / totalLength1;
                      segments1.push(
                        <Line
                          key={`seg1-long-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          name="door-diagonal"
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent={true}
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + dashLength >= totalLength1) break;
                      currentPos += dashLength + gap;
                    } else {
                      let dashLength = shortDash;
                      if (currentPos + shortDash + gap >= totalLength1) {
                        dashLength = totalLength1 - currentPos;
                      }
                      const t1 = currentPos / totalLength1;
                      const t2 = (currentPos + dashLength) / totalLength1;
                      segments1.push(
                        <Line
                          key={`seg1-short-${currentPos}`}
                          points={[
                            [start1[0] + dx1 * t1, start1[1] + dy1 * t1, 0],
                            [start1[0] + dx1 * t2, start1[1] + dy1 * t2, 0]
                          ]}
                          name="door-diagonal"
                          color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                          lineWidth={1}
                          transparent={true}
                          opacity={viewMode === '3D' ? 0.5 : 1.0}
                        />
                      );
                      if (currentPos + dashLength >= totalLength1) break;
                      currentPos += dashLength + gap;
                    }
                    isLongDash = !isLongDash;
                  }
                  
                  // 두 번째 대각선: 정면뷰에만 렌더링
                  if (isFrontView) {
                    const start2 = [adjustedHingePosition === 'left' ? -doorWidthUnits / 2 : doorWidthUnits / 2, 0, 0];
                    const end2 = [adjustedHingePosition === 'left' ? doorWidthUnits / 2 : -doorWidthUnits / 2, doorHeight / 2, 0];
                    const segments2 = [];

                    const dx2 = end2[0] - start2[0];
                    const dy2 = end2[1] - start2[1];
                    const totalLength2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    currentPos = 0;
                    isLongDash = true;

                    // 두 번째 대각선 렌더링
                    while (currentPos < totalLength2) {
                      if (isLongDash) {
                        let dashLength = longDash;
                        if (currentPos + longDash + gap >= totalLength2) {
                          dashLength = totalLength2 - currentPos;
                        }
                        const t1 = currentPos / totalLength2;
                        const t2 = (currentPos + dashLength) / totalLength2;
                        segments2.push(
                          <Line
                            key={`seg2-long-${currentPos}`}
                            points={[
                              [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                              [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                            ]}
                            name="door-diagonal"
                            color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                            lineWidth={1}
                            transparent={true}
                            opacity={viewMode === '3D' ? 0.5 : 1.0}
                          />
                        );
                        if (currentPos + dashLength >= totalLength2) break;
                        currentPos += dashLength + gap;
                      } else {
                        let dashLength = shortDash;
                        if (currentPos + shortDash + gap >= totalLength2) {
                          dashLength = totalLength2 - currentPos;
                        }
                        const t1 = currentPos / totalLength2;
                        const t2 = (currentPos + dashLength) / totalLength2;
                        segments2.push(
                          <Line
                            key={`seg2-short-${currentPos}`}
                            points={[
                              [start2[0] + dx2 * t1, start2[1] + dy2 * t1, 0],
                              [start2[0] + dx2 * t2, start2[1] + dy2 * t2, 0]
                            ]}
                            name="door-diagonal"
                            color={viewMode === '3D' ? diagonalLineColor3D : '#FF8800'}
                            lineWidth={1}
                            transparent={true}
                            opacity={viewMode === '3D' ? 0.5 : 1.0}
                          />
                        );
                        if (currentPos + dashLength >= totalLength2) break;
                        currentPos += dashLength + gap;
                      }
                      isLongDash = !isLongDash;
                    }

                    return [...segments1, ...segments2];
                  }

                  return segments1;
                })()}
                </animated.group>
              );
            })()}

            {/* 도어 가로 폭 치수 (2D 정면뷰 + 3D) */}
            {showDoorDimensionGuides && (() => {
              const is3D = viewMode === '3D';
              const extensionLineStart = doorDimensionWidthLineStart;
              const extensionLineLength = doorDimensionWidthLineLength;
              const tickSize = 0.008;
              const zPos = is3D ? doorThicknessUnits / 2 + doorDimensionForwardOffset : doorThicknessUnits / 2 + 0.001;
              const dimColor = activeDoorDimensionColor;

              const dimensionLinePos = -doorHeight / 2 - extensionLineStart - extensionLineLength;
              const extensionStart = -doorHeight / 2 - extensionLineStart;

              return (
                <>
                  {(effectiveDoorHeightDimensionSides.left || effectiveDoorHeightDimensionSides.right) && (
                  <>
                  {effectiveDoorHeightDimensionSides.left && (
                    <>
                      {renderDoorDimensionHoverPlane({
                        keyName: 'single-door-left-height-hover',
                        position: [
                          -doorWidthUnits / 2 - doorDimensionSideLineOffset,
                          (doorDimensionTopY + doorDimensionBottomY) / 2,
                          zPos + 0.002
                        ],
                        args: [mmToThreeUnits(80), Math.max(mmToThreeUnits(120), Math.abs(doorDimensionTopY - doorDimensionBottomY))]
                      })}
                      <NativeLine
                        name="door-dimension-height"
                        points={[
                          [-doorWidthUnits / 2 - doorDimensionSideLineOffset, -doorHeight / 2, zPos],
                          [-doorWidthUnits / 2 - doorDimensionSideLineOffset, doorHeight / 2, zPos]
                        ]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />
                    </>
                  )}

                  {effectiveDoorHeightDimensionSides.right && (
                    <>
                      {renderDoorDimensionHoverPlane({
                        keyName: 'single-door-right-height-hover',
                        position: [
                          doorWidthUnits / 2 + doorDimensionSideLineOffset,
                          (doorDimensionTopY + doorDimensionBottomY) / 2,
                          zPos + 0.002
                        ],
                        args: [mmToThreeUnits(80), Math.max(mmToThreeUnits(120), Math.abs(doorDimensionTopY - doorDimensionBottomY))]
                      })}
                      <NativeLine
                        name="door-dimension-height"
                        points={[
                          [doorWidthUnits / 2 + doorDimensionSideLineOffset, -doorHeight / 2, zPos],
                          [doorWidthUnits / 2 + doorDimensionSideLineOffset, doorHeight / 2, zPos]
                        ]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />
                    </>
                  )}

                  {[
                    ...(effectiveDoorHeightDimensionSides.left ? [
                      [-doorWidthUnits / 2 - doorDimensionSideLineOffset, -doorHeight / 2],
                      [-doorWidthUnits / 2 - doorDimensionSideLineOffset, doorHeight / 2]
                    ] : []),
                    ...(effectiveDoorHeightDimensionSides.right ? [
                      [doorWidthUnits / 2 + doorDimensionSideLineOffset, -doorHeight / 2],
                      [doorWidthUnits / 2 + doorDimensionSideLineOffset, doorHeight / 2]
                    ] : [])
                  ].map(([x, y], index) => (
                    <NativeLine
                      key={`single-door-height-tick-${index}`}
                      name="door-dimension-height"
                      points={[[x - tickSize, y, zPos], [x + tickSize, y, zPos]]}
                      color={dimColor}
                      lineWidth={1}
                      renderOrder={100001}
                      depthTest={false}
                      depthWrite={false}
                      transparent={true}
                    />
                  ))}

                  {effectiveDoorHeightDimensionSides.left && (
                    <>
                      <NativeLine
                        name="door-dimension-height"
                        points={[[-doorWidthUnits / 2, -doorHeight / 2, zPos], [-doorWidthUnits / 2 - doorDimensionSideLineOffset, -doorHeight / 2, zPos]]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <NativeLine
                        name="door-dimension-height"
                        points={[[-doorWidthUnits / 2, doorHeight / 2, zPos], [-doorWidthUnits / 2 - doorDimensionSideLineOffset, doorHeight / 2, zPos]]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <DimensionText
                        name="door-dimension-height-text"
                        value={actualDoorHeight}
                        position={[-doorWidthUnits / 2 - doorDimensionSideTextOffset, 0, zPos]}
                        color={dimColor}
                        hoverColor={doorDimensionHoverColor}
                        onHoverChange={setIsDoorDimensionHovered}
                        anchorX="center"
                        anchorY="middle"
                        forceShow={true}
                      />
                      {renderDoorGapDimensionMarkers({
                        lineX: -doorWidthUnits / 2 - doorDimensionSideLineOffset,
                        textX: -doorWidthUnits / 2 - doorDimensionSideTextOffset,
                        zPos,
                        dimColor,
                        tickSize,
                        keyPrefix: 'single-door-left',
                      })}
                    </>
                  )}

                  {effectiveDoorHeightDimensionSides.right && (
                    <>
                      <NativeLine
                        name="door-dimension-height"
                        points={[[doorWidthUnits / 2, -doorHeight / 2, zPos], [doorWidthUnits / 2 + doorDimensionSideLineOffset, -doorHeight / 2, zPos]]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <NativeLine
                        name="door-dimension-height"
                        points={[[doorWidthUnits / 2, doorHeight / 2, zPos], [doorWidthUnits / 2 + doorDimensionSideLineOffset, doorHeight / 2, zPos]]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <DimensionText
                        name="door-dimension-height-text"
                        value={actualDoorHeight}
                        position={[doorWidthUnits / 2 + doorDimensionSideTextOffset, 0, zPos]}
                        color={dimColor}
                        hoverColor={doorDimensionHoverColor}
                        onHoverChange={setIsDoorDimensionHovered}
                        anchorX="center"
                        anchorY="middle"
                        forceShow={true}
                      />
                      {renderDoorGapDimensionMarkers({
                        lineX: doorWidthUnits / 2 + doorDimensionSideLineOffset,
                        textX: doorWidthUnits / 2 + doorDimensionSideTextOffset,
                        zPos,
                        dimColor,
                        tickSize,
                        keyPrefix: 'single-door-right',
                      })}
                    </>
                  )}
                  </>
                  )}

                  {!hideWidthDimension && (
                    <>
                      {renderDoorDimensionHoverPlane({
                        keyName: 'single-door-width-hover',
                        position: [0, dimensionLinePos, zPos + 0.002],
                        args: [doorWidthUnits + mmToThreeUnits(260), mmToThreeUnits(80)]
                      })}
                      <NativeLine
                        name="door-dimension"
                        points={[
                          [-doorWidthUnits / 2, extensionStart, zPos],
                          [-doorWidthUnits / 2, dimensionLinePos, zPos]
                        ]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <NativeLine
                        name="door-dimension"
                        points={[
                          [doorWidthUnits / 2, extensionStart, zPos],
                          [doorWidthUnits / 2, dimensionLinePos, zPos]
                        ]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <NativeLine
                        name="door-dimension"
                        points={[
                          [-doorWidthUnits / 2, dimensionLinePos, zPos],
                          [doorWidthUnits / 2, dimensionLinePos, zPos]
                        ]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <NativeLine
                        name="door-dimension"
                        points={[
                          [-doorWidthUnits / 2 - tickSize, dimensionLinePos, zPos],
                          [-doorWidthUnits / 2 + tickSize, dimensionLinePos, zPos]
                        ]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <NativeLine
                        name="door-dimension"
                        points={[
                          [doorWidthUnits / 2 - tickSize, dimensionLinePos, zPos],
                          [doorWidthUnits / 2 + tickSize, dimensionLinePos, zPos]
                        ]}
                        color={dimColor}
                        lineWidth={1}
                        renderOrder={100001}
                        depthTest={false}
                        depthWrite={false}
                        transparent={true}
                      />

                      <DimensionText
                        name="door-dimension-text"
                        value={doorWidth}
                        position={[0, dimensionLinePos + mmToThreeUnits(15), zPos]}
                        color={dimColor}
                        hoverColor={doorDimensionHoverColor}
                        onHoverChange={setIsDoorDimensionHovered}
                        anchorX="center"
                        anchorY="bottom"
                        forceShow={true}
                      />
                    </>
                  )}
                </>
              );
            })()}
          </group>
        </animated.group>

        {/* 측면뷰 하부장/걸래받이 치수는 CADDimensions2D 왼쪽 2단에서 처리 */}
        </group>
      </group>
    );
  }
};

// React.memo 제거 — doorTopGap/doorBottomGap 변경 시 확실한 리렌더 보장
export default DoorModule;
