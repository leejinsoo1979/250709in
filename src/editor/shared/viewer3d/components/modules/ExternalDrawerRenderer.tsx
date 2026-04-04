import React, { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import { useFrame, useThree } from '@react-three/fiber';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import BoxWithEdges from './components/BoxWithEdges';

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
  renderMode: 'solid' | 'wireframe';
  isHighlighted: boolean;
  textureUrl?: string;
  doorTextureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
  sectionName: string;
  showMaida: boolean;
  mmToThreeUnits: (mm: number) => number;
}

const SingleDrawer: React.FC<SingleDrawerProps> = ({
  zone, index, drawerCount, shouldOpen, openDistance,
  cabinetBottomY, basicThickness, bottomGap,
  extSideH, extSideD, extSideT,
  leftSideX, rightSideX, sideCenterZ,
  drawerBodyDepth, drawerBodyCenterZ, drawerInnerWidth,
  drawerSideThickness, handlePlateThickness, backPanelThickness: bpThk,
  maidaWidth, maidaZ,
  material, renderMode, isHighlighted,
  textureUrl, doorTextureUrl, panelGrainDirections, furnitureId, sectionName,
  showMaida, mmToThreeUnits,
}) => {
  // Z축 슬라이드 애니메이션
  const spring = useSpring({
    z: shouldOpen ? openDistance : 0,
    config: { tension: 90, friction: 16, clamp: true },
  });

  const zoneHeightMm = zone.topMm - zone.bottomMm;
  const drawerHeight = mmToThreeUnits(zoneHeightMm);

  const drawerBottomY = cabinetBottomY + mmToThreeUnits(zone.bottomMm);

  // 측판 높이: 1단=240mm(2단서랍장) or 250mm(3단서랍장), 2단이상=130mm
  const sideHeightMm = index === 0 ? (drawerCount >= 3 ? 250 : 240) : 130;
  const sideHeight = mmToThreeUnits(sideHeightMm);

  const bottomPanelTopY = cabinetBottomY + basicThickness;
  // 측판 하단: 1단=바닥판에서 15mm 위, 2단이상=따내기 상단에서 15mm 위
  const sideBottomY = index === 0
    ? bottomPanelTopY + bottomGap
    : drawerBottomY + bottomGap;
  const sideCenterY = sideBottomY + sideHeight / 2;

  const cX = 0;

  const bottomThk = bpThk;
  const bottomDepth = drawerBodyDepth;
  const bottomZPos = drawerBodyCenterZ;
  const bottomY = sideBottomY + mmToThreeUnits(15) + bottomThk / 2;
  const bottomWidth = drawerInnerWidth + mmToThreeUnits(10);

  // 뒷판 높이: 측판높이 - 15mm(바닥갭) - 9mm(바닥판두께)
  const backHeightMm = sideHeightMm - 15 - 9;
  const backHeight = mmToThreeUnits(backHeightMm);
  const bottomTopYPos = bottomY + bottomThk / 2;
  const backY = bottomTopYPos + backHeight / 2;
  const backWidth = drawerInnerWidth;

  // 마이다 높이·Y
  const maidaTopMm = zone.notchAboveBottom + 40;
  const maidaBottomMm = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
  const maidaHeightMm = maidaTopMm - maidaBottomMm;
  const maidaHeight = mmToThreeUnits(maidaHeightMm);
  const maidaCenterY = cabinetBottomY + mmToThreeUnits(maidaBottomMm) + maidaHeight / 2;

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

      {/* 마이다 (도어면) */}
      {showMaida && (() => {
        const panelName = sectionName ? `${sectionName}서랍${i + 1}(마이다)` : `서랍${i + 1}(마이다)`;
        return (
          <BoxWithEdges
            args={[maidaWidth, maidaHeight, handlePlateThickness]}
            position={[cX, maidaCenterY, maidaZ]}
            material={getPanelMaterial(panelName)}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
            panelName={panelName}
            textureUrl={doorTextureUrl || textureUrl}
            panelGrainDirections={panelGrainDirections}
            furnitureId={furnitureId}
          />
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
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
  sectionName?: string;
  backPanelThicknessOverride?: number;
  showMaida?: boolean;
  notchFromBottoms: number[];
  notchHeights: number[];
  isEditMode?: boolean;
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
  panelGrainDirections,
  furnitureId,
  sectionName = '',
  backPanelThicknessOverride,
  showMaida = true,
  notchFromBottoms,
  notchHeights,
  isEditMode = false,
}) => {
  const { viewMode } = useSpace3DView();
  const { doorsOpen, isIndividualDoorOpen } = useUIStore();
  const { gl } = useThree();

  // === 서랍 오픈 상태 (도어 오픈과 연동) ===
  const isDoorOpen = doorsOpen !== null
    ? doorsOpen
    : furnitureId ? isIndividualDoorOpen(furnitureId, 0) : false;
  const shouldOpenDrawers = useMemo(
    () => isDoorOpen || (isEditMode && viewMode !== '2D'),
    [isDoorOpen, isEditMode, viewMode]
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

  // === 두께 상수 ===
  const basicThicknessMm = basicThickness / 0.01;
  const drawerPanelThicknessMm = (basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15;
  const DRAWER_SIDE_THICKNESS = mmToThreeUnits(drawerPanelThicknessMm);
  const HANDLE_PLATE_THICKNESS = mmToThreeUnits(drawerPanelThicknessMm);
  const backPanelThickness = backPanelThicknessOverride != null
    ? mmToThreeUnits(backPanelThicknessOverride)
    : mmToThreeUnits(9);

  // === 외부서랍 전용 좌우측판 스펙 ===
  const EXT_SIDE_H = mmToThreeUnits(240);
  // 서랍 깊이 = 캐비넷 깊이 - 50mm(뒷판갭), 최대 453mm
  const drawerDepthMm = Math.min(moduleDepthMm - 50, 453);
  const EXT_SIDE_D = mmToThreeUnits(drawerDepthMm);
  const EXT_SIDE_T = basicThickness;
  const SIDE_GAP = mmToThreeUnits(6);
  const BOTTOM_GAP = mmToThreeUnits(15);

  const maidaWidth = mmToThreeUnits(moduleWidth - 3);
  const maidaZ = (mmToThreeUnits(moduleDepthMm) + mmToThreeUnits(28)) / 2;

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

  const allNotches = [...sortedNotches, { fromBottom: upperNotchFromBottom, height: upperNotchH }];

  for (let ni = 0; ni < allNotches.length; ni++) {
    const notch = allNotches[ni];
    if (notch.fromBottom > cursor) {
      const notchAboveBottom = notch.fromBottom;
      const notchBelowTop = ni > 0 ? (allNotches[ni - 1].fromBottom + allNotches[ni - 1].height) : null;
      zones.push({ bottomMm: cursor, topMm: notch.fromBottom, notchAboveBottom, notchBelowTop });
    }
    cursor = notch.fromBottom + notch.height;
  }

  const cabinetBottomY = -height / 2;
  const DRAWER_OPEN_DISTANCE = mmToThreeUnits(300);

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
          material={material}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
          textureUrl={textureUrl}
          doorTextureUrl={doorTextureUrl}
          panelGrainDirections={panelGrainDirections}
          furnitureId={furnitureId}
          sectionName={sectionName}
          showMaida={showMaida}
          mmToThreeUnits={mmToThreeUnits}
        />
      ))}
    </group>
  );
};

export default ExternalDrawerRenderer;
