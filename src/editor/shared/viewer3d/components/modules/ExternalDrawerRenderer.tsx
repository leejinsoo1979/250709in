import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import { useFrame, useThree } from '@react-three/fiber';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { Line } from '@react-three/drei';
import BoxWithEdges from './components/BoxWithEdges';
import DimensionText from './components/DimensionText';
import MaidaWidthDimension from './components/MaidaWidthDimension';
import MaidaHeightDimension, { MaidaHeightDimensionSegment } from './components/MaidaHeightDimension';
import { useDimensionColor } from './hooks/useDimensionColor';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';
import { PET_PANEL_THICKNESS_MM } from '@/editor/shared/utils/panelThickness';

/**
 * 외부서랍 렌더러 (하부 서랍장 전용)
 *
 * 기존 DrawerRenderer(속서랍)의 renderDrawer 구조를 기반으로:
 * 1. 날개벽(서랍속장 프레임) 없음 — 레일이 가구 측판에 직접 장착
 * 2. 서랍 앞판 없음
 * 3. 마이다가 도어 재질로 도어 위치(Z축)에 노출 — 마이다 = 도어면
 * 4. 마이다 폭 = 모듈 전체 폭 - 3mm (양쪽 1.5mm 갭)
 * 5. 서랍 좌우측판: 캐비넷 측판에서 6mm 갭, H=240mm, D=453mm, T=basicThickness
 * 6. 서랍 좌우측판 Z: 캐비넷 측판과 동일 (앞면 정렬)
 * 7. 1단 서랍 좌우측판 하단: 캐비넷 바닥판에서 15mm 위
 * 8. 바닥판·뒷판: 기존 renderDrawer 로직 그대로 (변경된 좌우측판 기준 폭만 재계산)
 * 9. 도어 오픈 시 서랍+마이다가 Z축 300mm 앞으로 슬라이드 애니메이션
 */

interface DrawerZone {
  bottomMm: number;
  topMm: number;
  notchAboveBottom: number;
  notchBelowTop: number | null;
}

/** 서랍 한 칸 (useSpring 사용을 위해 별도 컴포넌트) */
interface SingleDrawerProps {
  zone: DrawerZone;
  index: number;
  drawerCount: number;
  shouldOpen: boolean;
  openDistance: number;
  // 공통 geometry
  cabinetBottomY: number;
  basicThickness: number;
  bottomGap: number;
  extSideH: number;
  extSideD: number;
  extSideT: number;
  leftSideX: number;
  rightSideX: number;
  sideCenterZ: number;
  drawerBodyDepth: number;
  drawerBodyCenterZ: number;
  drawerInnerWidth: number;
  drawerSideThickness: number;
  handlePlateThickness: number;
  backPanelThickness: number;
  maidaWidth: number;
  maidaZ: number;
  // rendering
  material: THREE.Material;
  doorMaterial: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  isHighlighted: boolean;
  textureUrl?: string;
  doorTextureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
  sectionName: string;
  showMaida: boolean;
  mmToThreeUnits: (mm: number) => number;
  uniformDrawerHeight?: boolean;
  fixedMaidaHeightMm?: number;
  sideHeightOverrides?: { all?: number; first?: number; rest?: number };
  doorTopGap?: number;
  doorBottomGap?: number;
  defaultDoorTopGap?: number;
  defaultDoorBottomGap?: number;
  isTopDrawer?: boolean;
  isBottomDrawer?: boolean;
  maidaXOffset?: number;
  showDrawerFrontPanel?: boolean;
}

const SingleDrawer: React.FC<SingleDrawerProps> = ({
  zone, index, drawerCount, shouldOpen, openDistance,
  cabinetBottomY, basicThickness, bottomGap,
  extSideH, extSideD, extSideT,
  leftSideX, rightSideX, sideCenterZ,
  drawerBodyDepth, drawerBodyCenterZ, drawerInnerWidth,
  drawerSideThickness, handlePlateThickness, backPanelThickness: bpThk,
  maidaWidth, maidaZ,
  material, doorMaterial, renderMode, isHighlighted,
  textureUrl, doorTextureUrl, panelGrainDirections, furnitureId, sectionName,
  showMaida, mmToThreeUnits,
  uniformDrawerHeight = false,
  fixedMaidaHeightMm,
  sideHeightOverrides,
  doorTopGap,
  doorBottomGap,
  defaultDoorTopGap = -20,
  defaultDoorBottomGap = 5,
  isTopDrawer = false,
  isBottomDrawer = false,
  maidaXOffset = 0,
  showDrawerFrontPanel = false,
}) => {
  // Z축 슬라이드 애니메이션
  const spring = useSpring({
    z: shouldOpen ? openDistance : 0,
    config: { tension: 90, friction: 16, clamp: true },
  });

  const zoneHeightMm = zone.topMm - zone.bottomMm;
  const drawerHeight = mmToThreeUnits(zoneHeightMm);

  const drawerBottomY = cabinetBottomY + mmToThreeUnits(zone.bottomMm);

  // 측판 높이: sideHeightOverrides가 있으면 우선, 없으면 기본값
  // 기본: 3단서랍장=1단 250mm/2단이상 130mm, 2단서랍장=모든 단 250mm
  const requestedSideHeightMm = sideHeightOverrides
    ? (sideHeightOverrides.all != null
      ? sideHeightOverrides.all
      : (index === 0 ? (sideHeightOverrides.first ?? 250) : (sideHeightOverrides.rest ?? 130)))
    : (drawerCount >= 3 ? (index === 0 ? 250 : 130) : 250);
  const basicThicknessMm = basicThickness / 0.01;
  const bottomGapMm = bottomGap / 0.01;
  const topClearanceMm = 5;
  const sideBottomReferenceMm = index === 0
    ? basicThicknessMm
    : (zone.notchBelowTop ?? zone.bottomMm);
  const maxSideHeightMm = Math.max(
    0,
    zone.notchAboveBottom - sideBottomReferenceMm - bottomGapMm - topClearanceMm
  );
  const sideHeightMm = Math.max(0, Math.min(requestedSideHeightMm, maxSideHeightMm));
  const sideHeight = mmToThreeUnits(sideHeightMm);

  const bottomPanelTopY = cabinetBottomY + basicThickness;
  // 측판 하단: 1단=바닥판에서 15mm 위, 2단이상=따내기 상단에서 15mm 위
  const sideBottomY = index === 0
    ? bottomPanelTopY + bottomGap
    : drawerBottomY + bottomGap;
  const sideCenterY = sideBottomY + sideHeight / 2;

  const cX = 0;
  const maidaCenterX = cX + maidaXOffset;

  const bottomThk = bpThk;
  const bottomThkMm = bottomThk / 0.01;
  const bottomDepth = Math.max(0, drawerBodyDepth - mmToThreeUnits(1));
  const bottomZPos = drawerBodyCenterZ - mmToThreeUnits(0.5);
  const bottomY = sideBottomY + mmToThreeUnits(13) + bottomThk / 2;
  const bottomWidth = drawerInnerWidth + mmToThreeUnits(14);

  // 뒷판 높이: 측판높이 - 13mm(홈 하단 12mm + 끼움 여유 1mm) - 바닥판두께
  const backHeightMm = Math.max(0, sideHeightMm - 13 - bottomThkMm);
  const backHeight = mmToThreeUnits(backHeightMm);
  const bottomTopYPos = bottomY + bottomThk / 2;
  const backY = bottomTopYPos + backHeight / 2;
  const backWidth = drawerInnerWidth;

  // 마이다 높이·Y — 상단갭/하단갭 확장 포함
  // 기본 마이다: 노치 위 +40mm, 하단 -5mm (기본하부장 doorTopGap=-20, doorBottomGap=5에 해당)
  // doorTopGap/doorBottomGap 변경분만 적용 (모듈별 기본값 대비 델타)
  const effectiveDoorTopGap = doorTopGap ?? defaultDoorTopGap;
  const effectiveDoorBottomGap = doorBottomGap ?? defaultDoorBottomGap;
  const maidaTopMm = zone.notchAboveBottom + 40;
  const maidaBottomMm = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
  const gapTopExt = isTopDrawer ? (effectiveDoorTopGap - defaultDoorTopGap) : 0;
  const gapBottomExt = isBottomDrawer ? (effectiveDoorBottomGap - defaultDoorBottomGap) : 0;
  const defaultMaidaHeightMm = maidaTopMm - maidaBottomMm + gapTopExt + gapBottomExt;
  // fixedMaidaHeightMm이 있어도 상단/하단 갭 delta를 추가 적용
  const maidaHeightMm = fixedMaidaHeightMm != null ? (fixedMaidaHeightMm + gapTopExt + gapBottomExt) : defaultMaidaHeightMm;
  const maidaHeight = mmToThreeUnits(maidaHeightMm);
  const maidaCenterY = cabinetBottomY + mmToThreeUnits(maidaBottomMm - gapBottomExt) + maidaHeight / 2;

  // 2D 마이다 overlay/대각선용
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const showDimensions = useUIStore(state => state.showDimensions);

  const i = index;
  const getPanelMaterial = (_: string) => material;

  return (
    <animated.group position-z={spring.z}>
      {/* 서랍 좌측판 */}
      {(() => {
        const panelName = sectionName ? `${sectionName}서랍${i + 1} 좌측판` : `서랍${i + 1} 좌측판`;
        return (
          <BoxWithEdges
            args={[extSideT, sideHeight, extSideD]}
            position={[leftSideX, sideCenterY, sideCenterZ]}
            material={getPanelMaterial(panelName)}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
            panelName={panelName}
            textureUrl={textureUrl}
            panelGrainDirections={panelGrainDirections}
            furnitureId={furnitureId}
          />
        );
      })()}

      {/* 서랍 우측판 */}
      {(() => {
        const panelName = sectionName ? `${sectionName}서랍${i + 1} 우측판` : `서랍${i + 1} 우측판`;
        return (
          <BoxWithEdges
            args={[extSideT, sideHeight, extSideD]}
            position={[rightSideX, sideCenterY, sideCenterZ]}
            material={getPanelMaterial(panelName)}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
            panelName={panelName}
            textureUrl={textureUrl}
            panelGrainDirections={panelGrainDirections}
            furnitureId={furnitureId}
          />
        );
      })()}

      {/* 서랍 바닥판 */}
      {(() => {
        const panelName = sectionName ? `${sectionName}서랍${i + 1} 바닥` : `서랍${i + 1} 바닥`;
        return (
          <BoxWithEdges
            args={[bottomWidth, bottomThk, bottomDepth]}
            position={[cX, bottomY, bottomZPos]}
            material={getPanelMaterial(panelName)}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
            panelName={panelName}
            textureUrl={textureUrl}
            panelGrainDirections={panelGrainDirections}
            furnitureId={furnitureId}
          />
        );
      })()}

      {/* 서랍 뒷판 */}
      {(() => {
        const panelName = sectionName ? `${sectionName}서랍${i + 1} 뒷판` : `서랍${i + 1} 뒷판`;
        return (
          <BoxWithEdges
            args={[backWidth, backHeight, drawerSideThickness]}
            position={[cX, backY, drawerBodyCenterZ - drawerBodyDepth / 2 + drawerSideThickness / 2]}
            material={getPanelMaterial(panelName)}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
            panelName={panelName}
            textureUrl={textureUrl}
            panelGrainDirections={panelGrainDirections}
            furnitureId={furnitureId}
          />
        );
      })()}

      {/* 서랍 앞판: TV장처럼 서랍 본체 전면판이 필요한 경우에만 렌더링 */}
      {showDrawerFrontPanel && (() => {
        const panelName = sectionName ? `${sectionName}서랍${i + 1} 앞판` : `서랍${i + 1} 앞판`;
        return (
          <BoxWithEdges
            args={[backWidth, backHeight, drawerSideThickness]}
            position={[cX, backY, drawerBodyCenterZ + drawerBodyDepth / 2 - drawerSideThickness / 2]}
            material={getPanelMaterial(panelName)}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
            panelName={panelName}
            textureUrl={textureUrl}
            panelGrainDirections={panelGrainDirections}
            furnitureId={furnitureId}
          />
        );
      })()}

      {/* 마이다 (도어면) + 2D overlay/대각선 */}
      {showMaida && (() => {
        const panelName = sectionName ? `${sectionName}서랍${i + 1}(마이다)` : `서랍${i + 1}(마이다)`;
        const showMaidaOverlay = viewMode === '2D' && view2DDirection === 'front';
        const maidaOverlayColor = view2DTheme === 'dark' ? '#3a5a7a' : '#a0b8d0';
        return (
          <group>
            <BoxWithEdges
              args={[maidaWidth, maidaHeight, handlePlateThickness]}
              position={[maidaCenterX, maidaCenterY, maidaZ]}
              material={doorMaterial}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={doorTextureUrl || textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
            {/* 2D: 마이다 반투명 overlay */}
            {showMaidaOverlay && (
              <mesh position={[maidaCenterX, maidaCenterY, maidaZ + handlePlateThickness / 2 + 0.001]} renderOrder={9999}>
                <planeGeometry args={[maidaWidth, maidaHeight]} />
                <meshBasicMaterial color={maidaOverlayColor} transparent opacity={0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
              </mesh>
            )}
            {/* 2D: 마이다 V자 인출 표시 (좌상→중앙하, 중앙하→우상) */}
            {showMaidaOverlay && (() => {
              const hw = maidaWidth / 2;
              const hh = maidaHeight / 2;
              const frontZ = maidaZ + handlePlateThickness / 2 + 0.002;
              const lineColor = '#FF8800';
              const makeDashedLine = (s: [number, number, number], e: [number, number, number], keyPrefix: string) => {
                const dx = e[0] - s[0], dy = e[1] - s[1];
                const totalLen = Math.sqrt(dx * dx + dy * dy);
                const longDash = 2.4, shortDash = 0.9, gap = 0.9;
                const segments: React.ReactElement[] = [];
                let pos = 0;
                let isLong = true;
                while (pos < totalLen) {
                  const dashLen = isLong ? longDash : shortDash;
                  const actual = Math.min(dashLen, totalLen - pos);
                  const t1 = pos / totalLen;
                  const t2 = (pos + actual) / totalLen;
                  segments.push(
                    <Line
                      name="maida-v-guide"
                      key={`${keyPrefix}-${pos}`}
                      points={[
                        [s[0] + dx * t1, s[1] + dy * t1, s[2]],
                        [s[0] + dx * t2, s[1] + dy * t2, s[2]]
                      ]}
                      color={lineColor}
                      lineWidth={1}
                      transparent
                      opacity={1.0}
                    />
                  );
                  if (pos + actual >= totalLen) break;
                  pos += actual + gap;
                  isLong = !isLong;
                }
                return segments;
              };
              // V자: 좌상 → 중앙하, 중앙하 → 우상
              const leftTop: [number, number, number] = [maidaCenterX - hw, maidaCenterY + hh, frontZ];
              const centerBottom: [number, number, number] = [maidaCenterX, maidaCenterY - hh, frontZ];
              const rightTop: [number, number, number] = [maidaCenterX + hw, maidaCenterY + hh, frontZ];
              return (
                <>
                  {makeDashedLine(leftTop, centerBottom, `ext-maida-v1-${i}`)}
                  {makeDashedLine(centerBottom, rightTop, `ext-maida-v2-${i}`)}
                </>
              );
            })()}
          </group>
        );
      })()}
    </animated.group>
  );
};

interface ExternalDrawerRendererProps {
  drawerCount: number;
  moduleWidth: number;
  innerWidth: number;
  height: number;
  depth: number;
  basicThickness: number;
  moduleDepthMm: number;
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  textureUrl?: string;
  doorTextureUrl?: string;
  doorColor?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
  sectionName?: string;
  backPanelThicknessOverride?: number;
  showMaida?: boolean;
  notchFromBottoms: number[];
  notchHeights: number[];
  isEditMode?: boolean;
  hideTopNotch?: boolean;
  maidaHeightsMm?: number[];
  sideHeightOverrides?: { all?: number; first?: number; rest?: number };
  doorTopGap?: number; // 상단갭 (mm) — 맨위 서랍 마이다 상단 확장
  doorBottomGap?: number; // 하단갭 (mm) — 맨아래 서랍 마이다 하단 확장
  defaultDoorTopGap?: number; // 모듈 타입별 기본 doorTopGap (delta 계산 기준)
  defaultDoorBottomGap?: number; // 모듈 타입별 기본 doorBottomGap (delta 계산 기준)
  floorY?: number; // 현재 그룹 좌표계에서 실제 바닥 Y
  maidaDimensionSide?: 'left' | 'right' | null;
  maidaFrontWidthMm?: number;
  maidaXOffset?: number;
  showDrawerFrontPanel?: boolean;
  showMaidaGapDimensions?: boolean;
}

export const ExternalDrawerRenderer: React.FC<ExternalDrawerRendererProps> = ({
  drawerCount,
  moduleWidth,
  innerWidth,
  height,
  depth,
  basicThickness,
  moduleDepthMm,
  material,
  renderMode,
  isHighlighted = false,
  textureUrl,
  doorTextureUrl,
  doorColor,
  panelGrainDirections,
  furnitureId,
  sectionName = '',
  backPanelThicknessOverride,
  showMaida = true,
  notchFromBottoms,
  notchHeights,
  isEditMode = false,
  hideTopNotch = false,
  maidaHeightsMm,
  sideHeightOverrides,
  doorTopGap,
  doorBottomGap,
  defaultDoorTopGap = -20,
  defaultDoorBottomGap = 5,
  floorY,
  maidaDimensionSide = null,
  maidaFrontWidthMm,
  maidaXOffset = 0,
  showDrawerFrontPanel = false,
  showMaidaGapDimensions = true,
}) => {
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(s => s.view2DDirection);
  const showDimensions = useUIStore(s => s.showDimensions);
  const { doorsOpen, isIndividualDoorOpen } = useUIStore();
  const { doorDimensionColor } = useDimensionColor();
  const { gl } = useThree();

  // === 서랍 오픈 상태 (도어 오픈과 연동, 재질 속장탭 제외) ===
  const isInteriorMaterialMode = useUIStore(s => s.isInteriorMaterialMode);
  // 도어가 없는 가구는 서랍 인출 무시 (최초 배치 시 닫힘 + 도어 제거 시 자동 닫힘)
  const hasDoorOnModule = useFurnitureStore(state => {
    if (!furnitureId) return true;
    const m = state.placedModules.find(p => p.id === furnitureId);
    return m?.hasDoor === true;
  });
  const isDoorOpenRaw = (doorsOpen !== null && !isInteriorMaterialMode)
    ? doorsOpen
    : furnitureId ? isIndividualDoorOpen(furnitureId, 0) : false;
  const isDoorOpen = isDoorOpenRaw && hasDoorOnModule;
  const shouldOpenDrawers = useMemo(
    () => isDoorOpen,
    [isDoorOpen]
  );

  // 애니메이션 중 렌더링 갱신
  const [isAnimating, setIsAnimating] = useState(false);
  useEffect(() => {
    if (isDoorOpen !== undefined) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isDoorOpen]);
  useFrame(() => {
    if (isAnimating && gl && 'invalidate' in gl) {
      (gl as any).invalidate();
    }
  });

  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // === 도어 재질 (L자 프레임 + 마이다용) ===
  console.log('🎨 [ExtDrawer] doorColor:', doorColor, 'doorTextureUrl:', doorTextureUrl);
  const doorMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const doorMaterial = useMemo(() => {
    const effectiveColor = doorColor || '#E0E0E0';
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(effectiveColor),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
    });
    doorMaterialRef.current = mat;
    return mat;
  }, []);

  // doorColor 변경 시 material 색상 업데이트
  useEffect(() => {
    if (doorMaterialRef.current) {
      const effectiveColor = doorColor || '#E0E0E0';
      if (!doorMaterialRef.current.map) {
        doorMaterialRef.current.color.set(effectiveColor);
      }
      doorMaterialRef.current.needsUpdate = true;
    }
  }, [doorColor]);

  // doorTextureUrl 변경 시 텍스처 적용 (DoorModule과 동일 방식)
  useEffect(() => {
    console.log('🎨 [ExtDrawer] useEffect doorTextureUrl:', doorTextureUrl, 'doorColor:', doorColor);
    const mat = doorMaterialRef.current;
    if (!mat) return;

    if (doorTextureUrl) {
      if (isOakTexture(doorTextureUrl)) {
        applyOakTextureSettings(mat);
      } else if (isCabinetTexture1(doorTextureUrl)) {
        applyCabinetTexture1Settings(mat);
      }
      const loader = new THREE.TextureLoader();
      loader.load(doorTextureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        mat.map = texture;
        if (isOakTexture(doorTextureUrl)) {
          applyOakTextureSettings(mat);
        } else if (isCabinetTexture1(doorTextureUrl)) {
          applyCabinetTexture1Settings(mat);
        } else {
          applyDefaultImageTextureSettings(mat);
        }
        mat.needsUpdate = true;
        requestAnimationFrame(() => { mat.needsUpdate = true; });
      });
    } else {
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      const effectiveColor = doorColor || '#E0E0E0';
      mat.color.set(effectiveColor);
      mat.toneMapped = true;
      mat.roughness = 0.6;
      mat.needsUpdate = true;
    }
  }, [doorTextureUrl, doorColor]);

  // === 두께 상수 ===
  const basicThicknessMm = basicThickness / 0.01;
  const drawerPanelThicknessMm = (basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15;
  const DRAWER_SIDE_THICKNESS = mmToThreeUnits(drawerPanelThicknessMm);
  const HANDLE_PLATE_THICKNESS = basicThickness; // 마이다는 외부 노출 패널이므로 도어와 동일한 basicThickness
  const normalizedBackPanelThicknessOverride = backPanelThicknessOverride === 9.5
    ? 9
    : backPanelThicknessOverride === 5 || backPanelThicknessOverride === 5.5
      ? 6
      : backPanelThicknessOverride === 3.5
        ? 3
        : backPanelThicknessOverride;
  const backPanelThickness = normalizedBackPanelThicknessOverride != null
    ? mmToThreeUnits(normalizedBackPanelThicknessOverride)
    : mmToThreeUnits(9);

  // === 외부서랍 전용 좌우측판 스펙 ===
  const EXT_SIDE_H = mmToThreeUnits(240);
  // 서랍 깊이 = 캐비넷 깊이 - 50mm(뒷판갭), 최대 453mm
  const drawerDepthMm = Math.min(moduleDepthMm - 50, 453);
  const EXT_SIDE_D = mmToThreeUnits(drawerDepthMm);
  const EXT_SIDE_T = DRAWER_SIDE_THICKNESS; // 서랍재 두께 (15mm, PET 시 15.5mm)
  const SIDE_GAP = mmToThreeUnits(6);
  const BOTTOM_GAP = mmToThreeUnits(15);

  const maidaWidthMm = Math.max(0, (maidaFrontWidthMm ?? moduleWidth) - 3);
  const maidaWidth = mmToThreeUnits(maidaWidthMm);
  const MAIDA_BACK_GAP_MM = 2;
  const maidaZ = depth / 2 + mmToThreeUnits(MAIDA_BACK_GAP_MM) + HANDLE_PLATE_THICKNESS / 2;

  const leftSideX = -innerWidth / 2 + SIDE_GAP + EXT_SIDE_T / 2;
  const rightSideX = innerWidth / 2 - SIDE_GAP - EXT_SIDE_T / 2;

  const sideFrontEdge = depth / 2;
  const sideCenterZ = sideFrontEdge - EXT_SIDE_D / 2;

  const drawerBodyDepth = EXT_SIDE_D;
  const drawerBodyCenterZ = sideCenterZ;

  const drawerInnerWidth = (rightSideX - EXT_SIDE_T / 2) - (leftSideX + EXT_SIDE_T / 2);

  if (drawerCount <= 0) {
    return null;
  }

  // === 서랍 영역 계산 (측판 바닥 기준 mm) ===
  const sidePanelHeightMm = height / 0.01;
  const upperNotchH = 60;
  const upperNotchFromBottom = sidePanelHeightMm - upperNotchH;

  const zones: DrawerZone[] = [];
  let cursor = 0;

  const sortedNotches = notchFromBottoms
    .map((fb, idx) => ({ fromBottom: fb, height: notchHeights[idx] || 65 }))
    .sort((a, b) => a.fromBottom - b.fromBottom);

  const allNotches = hideTopNotch
    ? [...sortedNotches]
    : [...sortedNotches, { fromBottom: upperNotchFromBottom, height: upperNotchH }];

  for (let ni = 0; ni < allNotches.length; ni++) {
    const notch = allNotches[ni];
    if (notch.fromBottom > cursor) {
      const notchAboveBottom = notch.fromBottom;
      const notchBelowTop = ni > 0 ? (allNotches[ni - 1].fromBottom + allNotches[ni - 1].height) : null;
      zones.push({ bottomMm: cursor, topMm: notch.fromBottom, notchAboveBottom, notchBelowTop });
    }
    cursor = notch.fromBottom + notch.height;
  }

  // hideTopNotch: 마지막 노치 ~ 상판 안쪽까지 남은 영역도 서랍 zone으로 추가
  // 상판 두께(basicThicknessMm)를 빼서 서랍이 상판 안쪽까지만 차지하도록
  // 단, zone이 이미 drawerCount만큼 있으면 추가하지 않음 (상판내림: 665 위는 전대+상판)
  if (hideTopNotch && cursor < sidePanelHeightMm && zones.length < drawerCount) {
    const lastNotch = allNotches[allNotches.length - 1];
    const topLimit = sidePanelHeightMm - basicThicknessMm;
    zones.push({
      bottomMm: cursor,
      topMm: topLimit,
      notchAboveBottom: topLimit,
      notchBelowTop: lastNotch ? (lastNotch.fromBottom + lastNotch.height) : null,
    });
  }

  const cabinetBottomY = -height / 2;
  const floorLineY = floorY ?? cabinetBottomY;
  const DRAWER_OPEN_DISTANCE = mmToThreeUnits(300);
  const maidaRanges = zones.map((zone, i) => {
    const isTopDrawer = i === zones.length - 1;
    const isBottomDrawer = i === 0;
    const effectiveDoorTopGap = doorTopGap ?? defaultDoorTopGap;
    const effectiveDoorBottomGap = doorBottomGap ?? defaultDoorBottomGap;
    const maidaTopMm = zone.notchAboveBottom + 40;
    const maidaBottomMm = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
    const gapTopExt = isTopDrawer ? (effectiveDoorTopGap - defaultDoorTopGap) : 0;
    const gapBottomExt = isBottomDrawer ? (effectiveDoorBottomGap - defaultDoorBottomGap) : 0;
    const defaultMaidaHeightMm = maidaTopMm - maidaBottomMm + gapTopExt + gapBottomExt;
    const heightMm = maidaHeightsMm?.[i] != null
      ? maidaHeightsMm[i] + gapTopExt + gapBottomExt
      : defaultMaidaHeightMm;
    const bottomMm = maidaBottomMm - gapBottomExt;
    const bottomY = cabinetBottomY + mmToThreeUnits(bottomMm);
    const topY = bottomY + mmToThreeUnits(heightMm);
    return {
      bottomMm,
      topMm: bottomMm + heightMm,
      bottomY,
      topY,
      valueMm: Math.round(heightMm * 10) / 10,
      key: `maida-height-${i}`,
    };
  });
  const maidaHeightSegments: MaidaHeightDimensionSegment[] = maidaRanges.flatMap((range, i) => {
    const current = [{
      bottomY: range.bottomY,
      topY: range.topY,
      valueMm: range.valueMm,
      key: range.key,
    }];
    if (!showMaidaGapDimensions || i >= maidaRanges.length - 1) return current;

    const gapMm = maidaRanges[i + 1].bottomMm - range.topMm;
    if (gapMm <= 0) return current;

    const gapBottomY = range.topY;
    const gapTopY = gapBottomY + mmToThreeUnits(gapMm);
    return [
      ...current,
      {
        bottomY: gapBottomY,
        topY: gapTopY,
        valueMm: Math.round(gapMm * 10) / 10,
        key: `maida-gap-${i}`,
      },
    ];
  });
  if (showMaidaGapDimensions && maidaRanges.length > 0) {
    const firstMaida = maidaRanges[0];
    const bottomGapMm = Math.abs((firstMaida.bottomY - floorLineY) / 0.01);
    if (bottomGapMm > 0) {
      maidaHeightSegments.unshift({
        bottomY: Math.min(floorLineY, firstMaida.bottomY),
        topY: Math.max(floorLineY, firstMaida.bottomY),
        valueMm: Math.round(bottomGapMm * 10) / 10,
        key: 'maida-bottom-gap',
      });
    }

    const lastMaida = maidaRanges[maidaRanges.length - 1];
    const topGapMm = sidePanelHeightMm - lastMaida.topMm;
    if (topGapMm > 0) {
      maidaHeightSegments.push({
        bottomY: lastMaida.topY,
        topY: lastMaida.topY + mmToThreeUnits(topGapMm),
        valueMm: Math.round(topGapMm * 10) / 10,
        key: 'maida-top-gap',
      });
    }
  }

  return (
    <group>
      {zones.map((zone, i) => (
        <SingleDrawer
          key={`ext-drawer-${i}`}
          zone={zone}
          index={i}
          drawerCount={drawerCount}
          shouldOpen={shouldOpenDrawers}
          openDistance={DRAWER_OPEN_DISTANCE}
          cabinetBottomY={cabinetBottomY}
          basicThickness={basicThickness}
          bottomGap={BOTTOM_GAP}
          extSideH={EXT_SIDE_H}
          extSideD={EXT_SIDE_D}
          extSideT={EXT_SIDE_T}
          leftSideX={leftSideX}
          rightSideX={rightSideX}
          sideCenterZ={sideCenterZ}
          drawerBodyDepth={drawerBodyDepth}
          drawerBodyCenterZ={drawerBodyCenterZ}
          drawerInnerWidth={drawerInnerWidth}
          drawerSideThickness={DRAWER_SIDE_THICKNESS}
          handlePlateThickness={HANDLE_PLATE_THICKNESS}
          backPanelThickness={backPanelThickness}
          maidaWidth={maidaWidth}
          maidaZ={maidaZ}
          maidaXOffset={maidaXOffset}
          material={material}
          doorMaterial={doorMaterial}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
          textureUrl={textureUrl}
          doorTextureUrl={doorTextureUrl}
          panelGrainDirections={panelGrainDirections}
          furnitureId={furnitureId}
          sectionName={sectionName}
          showMaida={showMaida}
          mmToThreeUnits={mmToThreeUnits}
          fixedMaidaHeightMm={maidaHeightsMm ? maidaHeightsMm[i] : undefined}
          sideHeightOverrides={sideHeightOverrides}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
          defaultDoorTopGap={defaultDoorTopGap}
          defaultDoorBottomGap={defaultDoorBottomGap}
          isTopDrawer={i === drawerCount - 1}
          isBottomDrawer={i === 0}
          showDrawerFrontPanel={showDrawerFrontPanel}
        />
      ))}

      {showDimensions && showMaida && maidaDimensionSide && maidaHeightSegments.length > 0 && (
        <MaidaHeightDimension
          segments={maidaHeightSegments}
          maidaWidth={maidaWidth}
          maidaXOffset={maidaXOffset}
          moduleDepthMm={moduleDepthMm}
          maidaZ={maidaZ}
          viewMode={viewMode as '3D' | '2D'}
          view2DDirection={view2DDirection as any}
          dimensionColor={doorDimensionColor}
          mmToThreeUnits={mmToThreeUnits}
          side={maidaDimensionSide}
        />
      )}

      {/* L자 PET 프레임 — 따내기 위치에 고정 (서랍 오픈과 무관) */}
      {allNotches.map((notch, ni) => {
        if (notch.height <= 0) return null;
        const frameWidth = mmToThreeUnits(moduleWidth); // 캐비넷 전체 폭
        const notchHMm = notch.height;
        const petThickness = mmToThreeUnits(PET_PANEL_THICKNESS_MM);
        const verticalHMm = notchHMm - PET_PANEL_THICKNESS_MM; // 수직판 높이 = 따내기높이 - 수평판두께

        // 수평판: 따내기 바닥에 위치, 깊이 40mm
        const horzY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + petThickness / 2;
        const horzZ = depth / 2 - mmToThreeUnits(40) / 2;
        const horzArgs: [number, number, number] = [frameWidth, petThickness, mmToThreeUnits(40)];

        // 수직판: 수평판 위에 올라감, 안쪽(따내기 뒤쪽 면)에 붙음
        const vertY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + petThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = depth / 2 - mmToThreeUnits(40) + petThickness / 2;
        const vertArgs: [number, number, number] = [frameWidth, mmToThreeUnits(verticalHMm), petThickness];

        const horzName = sectionName ? `${sectionName}목찬넬프레임수평(${ni + 1})` : `목찬넬프레임수평(${ni + 1})`;
        const vertName = sectionName ? `${sectionName}목찬넬프레임수직(${ni + 1})` : `목찬넬프레임수직(${ni + 1})`;

        return (
          <group key={`l-frame-${ni}`}>
            <BoxWithEdges
              args={horzArgs}
              position={[0, horzY, horzZ]}
              material={doorMaterial}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={horzName}
              textureUrl={doorTextureUrl || textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
            <BoxWithEdges
              args={vertArgs}
              position={[0, vertY, vertZ]}
              material={doorMaterial}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={vertName}
              textureUrl={doorTextureUrl || textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          </group>
        );
      })}

      {/* 마이다 하단 폭 치수 (1단 마이다 기준) — 공통 컴포넌트 */}
      {showDimensions && showMaida && zones.length > 0 && (() => {
        const zone0 = zones[0];
        const maidaBottomMm0 = zone0.notchBelowTop != null ? (zone0.notchBelowTop - 5) : -5;
        const maidaBottomY = cabinetBottomY + mmToThreeUnits(maidaBottomMm0);
        return (
        <group position={[maidaXOffset, maidaBottomY, 0]}>
            <MaidaWidthDimension
              maidaWidthMm={maidaWidthMm}
              maidaWidth={maidaWidth}
              moduleDepthMm={moduleDepthMm}
              maidaZ={maidaZ}
              viewMode={viewMode as '3D' | '2D'}
              view2DDirection={view2DDirection as any}
              dimensionColor={doorDimensionColor}
              mmToThreeUnits={mmToThreeUnits}
            />
          </group>
        );
      })()}
    </group>
  );
};

export default ExternalDrawerRenderer;
