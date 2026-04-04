import React from 'react';
import * as THREE from 'three';
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
 * 6. 서랍 좌우측판 Z: 캐비넷 측판과 동일 (뒷면 정렬)
 * 7. 1단 서랍 좌우측판 하단: 캐비넷 바닥판에서 15mm 위
 * 8. 바닥판·뒷판: 기존 renderDrawer 로직 그대로 (변경된 좌우측판 기준 폭만 재계산)
 */

interface ExternalDrawerRendererProps {
  drawerCount: number;        // 서랍 수 (2단=2, 3단=3)
  moduleWidth: number;        // 모듈 전체 폭 (mm)
  innerWidth: number;         // 내경 폭 (Three.js units)
  height: number;             // 가구 전체 높이 (Three.js units)
  depth: number;              // 가구 깊이 (Three.js units)
  basicThickness: number;     // 기본 판 두께 (Three.js units, 보통 18mm=0.18)
  moduleDepthMm: number;      // 모듈 깊이 (mm, 도어 Z 계산용)
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  textureUrl?: string;
  doorTextureUrl?: string;    // 도어 텍스처 (마이다용)
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
  sectionName?: string;
  backPanelThicknessOverride?: number;
  showMaida?: boolean;        // 마이다(도어면) 표시 여부 (hasDoor 연동)
  notchFromBottoms: number[]; // 보강대 위치 (바닥에서 mm)
  notchHeights: number[];     // 보강대 높이 (mm)
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
}) => {
  const { viewMode } = useSpace3DView();

  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // === 두께 상수 (기존 DrawerRenderer와 동일) ===
  const basicThicknessMm = basicThickness / 0.01;
  const drawerPanelThicknessMm = (basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15;
  const DRAWER_SIDE_THICKNESS = mmToThreeUnits(drawerPanelThicknessMm); // 서랍 앞/뒷판 두께
  const HANDLE_PLATE_THICKNESS = mmToThreeUnits(drawerPanelThicknessMm); // 마이다 두께
  const backPanelThickness = backPanelThicknessOverride != null
    ? mmToThreeUnits(backPanelThicknessOverride)
    : mmToThreeUnits(9);

  // === 외부서랍 전용 좌우측판 스펙 ===
  const EXT_SIDE_H = mmToThreeUnits(240);   // 높이 240mm
  const EXT_SIDE_D = mmToThreeUnits(453);   // 깊이 453mm
  const EXT_SIDE_T = basicThickness;         // 두께 = 캐비넷 basicThickness
  const SIDE_GAP = mmToThreeUnits(6);        // 캐비넷 측판 안쪽에서 6mm 갭
  const BOTTOM_GAP = mmToThreeUnits(15);     // 1단 서랍: 캐비넷 바닥판에서 15mm 위

  // 마이다 폭 = 모듈 전체 폭 - 3mm (양쪽 1.5mm 갭)
  const maidaWidth = mmToThreeUnits(moduleWidth - 3);

  // 마이다 Z 위치 = 도어와 동일 (가구 앞면 + 14mm)
  const maidaZ = (mmToThreeUnits(moduleDepthMm) + mmToThreeUnits(28)) / 2;

  // 좌우측판 X 위치: 캐비넷 내경 안쪽에서 6mm 갭
  const leftSideX = -innerWidth / 2 + SIDE_GAP + EXT_SIDE_T / 2;
  const rightSideX = innerWidth / 2 - SIDE_GAP - EXT_SIDE_T / 2;

  // 좌우측판 Z 위치: 캐비넷 측판과 동일 (앞면 정렬)
  // 캐비넷 측판 앞면 = depth/2
  // 외부서랍 측판 앞면도 동일 → Z중심 = 앞면 - EXT_SIDE_D/2
  const sideFrontEdge = depth / 2;
  const sideCenterZ = sideFrontEdge - EXT_SIDE_D / 2;

  // 서랍 본체 깊이 = 측판 깊이 (453mm)와 동일
  const drawerBodyDepth = EXT_SIDE_D;
  // 서랍 본체 Z 중심 = 측판 Z 중심과 동일
  const drawerBodyCenterZ = sideCenterZ;

  // 서랍 바닥판·뒷판 폭: 좌우측판 안쪽면 사이
  // 기존: drawerWidth - 96mm (바닥판), drawerWidth - 107mm (뒷판)
  // 외부서랍: 좌우측판 안쪽면 사이 폭 기준으로 계산
  // 좌측판 안쪽면 = leftSideX + EXT_SIDE_T/2
  // 우측판 안쪽면 = rightSideX - EXT_SIDE_T/2
  const drawerInnerWidth = (rightSideX - EXT_SIDE_T / 2) - (leftSideX + EXT_SIDE_T / 2);

  const getPanelMaterial = React.useCallback((_panelName: string) => {
    return material;
  }, [material]);

  if (drawerCount <= 0) {
    return null;
  }

  // === 서랍 영역 계산 (보강대로 분리) ===
  const cabinetInnerTop = (height / 0.01) - basicThicknessMm * 2; // 내경 높이 (mm)
  const upperNotchH = 60; // 상단 따내기 높이

  interface DrawerZone {
    bottomMm: number;
    topMm: number;
  }

  const zones: DrawerZone[] = [];
  let cursor = 0;

  const sortedNotches = notchFromBottoms
    .map((fb, idx) => ({ fromBottom: fb, height: notchHeights[idx] || 65 }))
    .sort((a, b) => a.fromBottom - b.fromBottom);

  for (const notch of sortedNotches) {
    if (notch.fromBottom > cursor) {
      zones.push({ bottomMm: cursor, topMm: notch.fromBottom });
    }
    cursor = notch.fromBottom + notch.height;
  }
  const lastTop = cabinetInnerTop - upperNotchH;
  if (lastTop > cursor) {
    zones.push({ bottomMm: cursor, topMm: lastTop });
  }

  // 바닥판 윗면 기준 Y
  const bottomPanelTop = -height / 2 + basicThickness;

  return (
    <group>
      {zones.map((zone, i) => {
        const zoneHeightMm = zone.topMm - zone.bottomMm;
        const drawerHeight = mmToThreeUnits(zoneHeightMm);

        // 서랍 중심 Y
        const drawerBottomY = bottomPanelTop + mmToThreeUnits(zone.bottomMm);
        const drawerCenterY = drawerBottomY + drawerHeight / 2;

        // === 좌우측판 Y 위치 ===
        // 1단(i=0): 바닥판에서 15mm 위에 하단
        // 2단 이상: 보강대 윗면에서 시작 (= 영역 시작점)
        const sideBottomY = i === 0
          ? bottomPanelTop + BOTTOM_GAP
          : drawerBottomY;
        const sideCenterY = sideBottomY + EXT_SIDE_H / 2;

        // === 바닥판·뒷판 (기존 renderDrawer 기반, 깊이=측판과 동일) ===
        const cX = 0;
        const cY = drawerCenterY;

        // 바닥판: 측판 하단에서 15mm 위, 깊이·Z = 측판과 동일(453mm)
        const bottomThk = backPanelThickness;
        const bottomDepth = drawerBodyDepth; // 측판과 동일 453mm
        const bottomZPos = drawerBodyCenterZ; // 측판과 동일 Z
        const bottomY = sideBottomY + mmToThreeUnits(15) + bottomThk / 2;
        const bottomWidth = drawerInnerWidth + mmToThreeUnits(10); // 좌우측판 홈 끼움 (양쪽 5mm씩)

        // 뒷판: 높이 = 216mm (측판240 - 15mm - 바닥판9mm), 바닥판 윗면에 올라탐
        const backHeightMm = 216;
        const backHeight = mmToThreeUnits(backHeightMm);
        const bottomTopYPos = bottomY + bottomThk / 2;
        const backY = bottomTopYPos + backHeight / 2;
        const backWidth = drawerInnerWidth;

        // 마이다 높이
        const maidaHeight = drawerHeight - mmToThreeUnits(3);

        return (
          <group key={`ext-drawer-${i}`}>

            {/* === 서랍 좌측판 === */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 좌측판` : `서랍${i + 1} 좌측판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[EXT_SIDE_T, EXT_SIDE_H, EXT_SIDE_D]}
                  position={[leftSideX, sideCenterY, sideCenterZ]}
                  material={mat}
                  renderMode={renderMode}
                  isHighlighted={isHighlighted}
                  panelName={panelName}
                  textureUrl={textureUrl}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={furnitureId}
                />
              );
            })()}

            {/* === 서랍 우측판 === */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 우측판` : `서랍${i + 1} 우측판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[EXT_SIDE_T, EXT_SIDE_H, EXT_SIDE_D]}
                  position={[rightSideX, sideCenterY, sideCenterZ]}
                  material={mat}
                  renderMode={renderMode}
                  isHighlighted={isHighlighted}
                  panelName={panelName}
                  textureUrl={textureUrl}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={furnitureId}
                />
              );
            })()}

            {/* === 서랍 바닥판 (기존 renderDrawer 동일 — 폭만 재계산) === */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 바닥` : `서랍${i + 1} 바닥`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[bottomWidth, bottomThk, bottomDepth]}
                  position={[cX, bottomY, bottomZPos]}
                  material={mat}
                  renderMode={renderMode}
                  isHighlighted={isHighlighted}
                  panelName={panelName}
                  textureUrl={textureUrl}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={furnitureId}
                />
              );
            })()}

            {/* === 서랍 뒷판 (기존 renderDrawer 동일 — 폭만 재계산) === */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 뒷판` : `서랍${i + 1} 뒷판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[backWidth, backHeight, DRAWER_SIDE_THICKNESS]}
                  position={[cX, backY, drawerBodyCenterZ - drawerBodyDepth / 2 + DRAWER_SIDE_THICKNESS / 2]}
                  material={mat}
                  renderMode={renderMode}
                  isHighlighted={isHighlighted}
                  panelName={panelName}
                  textureUrl={textureUrl}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={furnitureId}
                />
              );
            })()}

            {/* === 앞판 없음 (외부서랍) === */}

            {/* === 마이다 (도어면) — hasDoor 시에만 === */}
            {showMaida && (() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1}(마이다)` : `서랍${i + 1}(마이다)`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[maidaWidth, maidaHeight, HANDLE_PLATE_THICKNESS]}
                  position={[cX, drawerCenterY, maidaZ]}
                  material={mat}
                  renderMode={renderMode}
                  isHighlighted={isHighlighted}
                  panelName={panelName}
                  textureUrl={doorTextureUrl || textureUrl}
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={furnitureId}
                />
              );
            })()}
          </group>
        );
      })}
    </group>
  );
};

export default ExternalDrawerRenderer;
