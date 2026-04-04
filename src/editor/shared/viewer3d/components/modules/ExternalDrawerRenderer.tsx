import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import BoxWithEdges from './components/BoxWithEdges';

/**
 * 외부서랍 렌더러 (하부 서랍장 전용)
 *
 * 기존 DrawerRenderer(속서랍)와 차이점:
 * 1. 날개벽(서랍속장 프레임) 없음 — 레일이 가구 측판에 직접 장착
 * 2. 서랍 앞판 없음
 * 3. 마이다가 도어 재질로 도어 위치(Z축)에 노출 — 마이다 = 도어면
 * 4. 마이다 폭 = 모듈 전체 폭 - 3mm (양쪽 1.5mm 갭)
 * 5. 서랍 좌우측판: 캐비넷 측판에서 6mm 갭, H=240mm, D=453mm, T=basicThickness
 * 6. 서랍 좌우측판 Z: 캐비넷 측판과 동일 (뒷면 정렬)
 * 7. 1단 서랍 좌우측판 하단: 캐비넷 바닥판에서 15mm 위
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
  // 2단: notchFromBottoms=[330], 3단: notchFromBottoms=[295, 510]
  notchFromBottoms: number[]; // 보강대 위치 (바닥에서 mm)
  notchHeights: number[];     // 보강대 높이 (mm) — 예: [65] or [65, 65]
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
  const highlightedPanel = useUIStore(state => state.highlightedPanel);

  const mm = (v: number) => v * 0.01; // mm → Three.js units

  // 서랍 좌우측판 스펙
  const DRAWER_SIDE_H = mm(240);       // 높이 240mm
  const DRAWER_SIDE_D = mm(453);       // 깊이 453mm
  const DRAWER_SIDE_T = basicThickness; // 두께 = 캐비넷 basicThickness
  const SIDE_GAP = mm(6);              // 캐비넷 측판 안쪽에서 6mm 갭
  const BOTTOM_GAP = mm(15);           // 캐비넷 바닥판에서 15mm 위

  // 기존 서랍 부재 두께
  const basicThicknessMm = basicThickness / 0.01;
  const drawerPanelThicknessMm = (basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15;
  const DRAWER_PANEL_T = mm(drawerPanelThicknessMm); // 서랍 앞/뒷판 두께
  const HANDLE_PLATE_T = mm(drawerPanelThicknessMm); // 마이다 두께

  // 백패널(=바닥판) 두께
  const backPanelT = backPanelThicknessOverride != null
    ? mm(backPanelThicknessOverride)
    : mm(9);

  // 마이다 폭 = 모듈 전체 폭 - 3mm (양쪽 1.5mm 갭)
  const maidaWidth = mm(moduleWidth - 3);

  // 마이다 Z 위치 = 도어와 동일 (가구 앞면 + 14mm)
  const maidaZ = (mm(moduleDepthMm) + mm(28)) / 2;

  // 서랍 좌우측판 Z 위치: 캐비넷 측판과 동일 (뒷면 정렬)
  // 캐비넷 측판 뒷면 = -depth/2 + basicThickness (백패널 앞)
  // 서랍 측판 뒷면도 같은 위치 → 서랍측판 Z중심 = 뒷면 + DRAWER_SIDE_D/2
  const sideBackEdge = -depth / 2 + basicThickness;
  const sideCenterZ = sideBackEdge + DRAWER_SIDE_D / 2;

  // 서랍 좌우측판 X 위치: 캐비넷 내경 안쪽에서 6mm 갭
  const leftSideX = -innerWidth / 2 + SIDE_GAP + DRAWER_SIDE_T / 2;
  const rightSideX = innerWidth / 2 - SIDE_GAP - DRAWER_SIDE_T / 2;

  // 서랍 내부 폭 (좌우 측판 안쪽면 사이)
  const drawerInnerWidth = (rightSideX - DRAWER_SIDE_T / 2) - (leftSideX + DRAWER_SIDE_T / 2);

  // 패널 material
  const getPanelMaterial = React.useCallback((_panelName: string) => {
    return material;
  }, [material]);

  if (drawerCount <= 0) {
    return null;
  }

  // 서랍 구간 계산 (보강대로 분리된 영역)
  // 2단: 바닥~330mm, (330+65)~785-18(상판)-60(상단notch)
  // 보강대 위치와 높이로 서랍 영역 계산
  const cabinetInnerBottom = 0; // 바닥판 윗면 기준 (0mm)
  const cabinetInnerTop = (height / 0.01) - basicThicknessMm * 2; // 내경 높이 (mm)
  const upperNotchH = 60; // 상단 따내기 높이 (mm)

  // 서랍 영역들 계산 (바닥에서 위로)
  interface DrawerZone {
    bottomMm: number; // 영역 시작 (바닥판 윗면 기준, mm)
    topMm: number;    // 영역 끝 (mm)
  }

  const zones: DrawerZone[] = [];
  let cursor = cabinetInnerBottom;

  // 정렬된 보강대 (바닥에서 위로)
  const sortedNotches = notchFromBottoms
    .map((fb, idx) => ({ fromBottom: fb, height: notchHeights[idx] || 65 }))
    .sort((a, b) => a.fromBottom - b.fromBottom);

  for (let n = 0; n < sortedNotches.length; n++) {
    const notch = sortedNotches[n];
    // 서랍 영역: cursor ~ notch.fromBottom
    if (notch.fromBottom > cursor) {
      zones.push({ bottomMm: cursor, topMm: notch.fromBottom });
    }
    cursor = notch.fromBottom + notch.height;
  }
  // 마지막 보강대 위 ~ 상단 따내기 아래
  const lastTop = cabinetInnerTop - upperNotchH;
  if (lastTop > cursor) {
    zones.push({ bottomMm: cursor, topMm: lastTop });
  }

  return (
    <group>
      {zones.map((zone, i) => {
        const zoneHeightMm = zone.topMm - zone.bottomMm;
        const drawerHeight = mm(zoneHeightMm);

        // 서랍 중심 Y: 가구 중심 기준으로 계산
        // 가구 중심 = 0, 바닥판 윗면 = -height/2 + basicThickness
        const bottomPanelTop = -height / 2 + basicThickness;
        const drawerBottomY = bottomPanelTop + mm(zone.bottomMm);
        const drawerCenterY = drawerBottomY + drawerHeight / 2;

        // 서랍 좌우측판 Y 위치
        // 1단(i=0): 바닥판에서 15mm 위에 하단
        // 2단 이상: 보강대 윗면에서 시작
        const sideBottomY = i === 0
          ? bottomPanelTop + BOTTOM_GAP
          : drawerBottomY;
        const sideCenterY = sideBottomY + DRAWER_SIDE_H / 2;

        // 서랍 바닥판/뒷판의 깊이·위치 — 기존 서랍과 동일 로직
        // 서랍 본체 깊이 = DRAWER_SIDE_D (453mm) 기준
        const drawerBodyDepth = DRAWER_SIDE_D;
        const drawerBodyCenterZ = sideCenterZ; // 측판과 동일

        // 바닥판: 앞쪽 10mm 여유 유지
        const bottomDepth = drawerBodyDepth - mm(10);
        const bottomZ = drawerBodyCenterZ - mm(5);

        // 바닥판 W: 기존과 동일 — 좌우측판 안쪽 사이에서 약간 줄임
        const bottomWidth = drawerInnerWidth - mm(26);

        // 바닥판 Y: 측판 하단에서 basicThickness 위 + 10mm
        const bottomY = sideBottomY + basicThickness + mm(10) + backPanelT / 2;

        // 뒷판: 기존과 동일
        const bottomTopY = sideBottomY + basicThickness + mm(10) + backPanelT;
        const backTopY = sideCenterY + (DRAWER_SIDE_H - mm(30)) / 2;
        const backHeight = backTopY - bottomTopY;
        const backY = (backTopY + bottomTopY) / 2;
        const backWidth = drawerInnerWidth - mm(26);

        // 마이다 높이: 서랍 영역 높이 - 3mm 갭
        const maidaHeight = drawerHeight - mm(3);

        return (
          <group key={`ext-drawer-${i}`}>
            {/* 서랍 좌측판 */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 좌측판` : `서랍${i + 1} 좌측판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[DRAWER_SIDE_T, DRAWER_SIDE_H, DRAWER_SIDE_D]}
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

            {/* 서랍 우측판 */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 우측판` : `서랍${i + 1} 우측판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[DRAWER_SIDE_T, DRAWER_SIDE_H, DRAWER_SIDE_D]}
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

            {/* 서랍 바닥판 */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 바닥` : `서랍${i + 1} 바닥`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[bottomWidth, backPanelT, bottomDepth]}
                  position={[0, bottomY, bottomZ]}
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

            {/* 서랍 뒷판 */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 뒷판` : `서랍${i + 1} 뒷판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[backWidth, backHeight, DRAWER_PANEL_T]}
                  position={[0, backY, drawerBodyCenterZ - drawerBodyDepth / 2 + DRAWER_PANEL_T / 2]}
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

            {/* 마이다 (도어면) — hasDoor 시에만 */}
            {showMaida && (() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1}(마이다)` : `서랍${i + 1}(마이다)`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[maidaWidth, maidaHeight, HANDLE_PLATE_T]}
                  position={[0, drawerCenterY, maidaZ]}
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
