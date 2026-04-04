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
 */

interface ExternalDrawerRendererProps {
  drawerCount: number;        // 서랍 수 (2단=2, 3단=3)
  moduleWidth: number;        // 모듈 전체 폭 (mm)
  innerWidth: number;         // 내경 폭 (Three.js units)
  innerHeight: number;        // 서랍 영역 내경 높이 (Three.js units)
  depth: number;              // 가구 깊이 (Three.js units)
  basicThickness: number;     // 기본 판 두께 (Three.js units, 보통 18mm=0.18)
  moduleDepthMm: number;      // 모듈 깊이 (mm, 도어 Z 계산용)
  yOffset?: number;           // Y축 오프셋
  zOffset?: number;           // Z축 오프셋
  drawerHeights: number[];    // 각 서랍 높이 (mm) - 바닥에서 위로 순서
  material: THREE.Material;
  doorMaterial?: THREE.Material; // 도어 재질 (마이다용)
  renderMode: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  textureUrl?: string;
  doorTextureUrl?: string;    // 도어 텍스처 (마이다용)
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  furnitureId?: string;
  sectionName?: string;
  backPanelThicknessOverride?: number;
}

export const ExternalDrawerRenderer: React.FC<ExternalDrawerRendererProps> = ({
  drawerCount,
  moduleWidth,
  innerWidth,
  innerHeight,
  depth,
  basicThickness,
  moduleDepthMm,
  yOffset = 0,
  zOffset = 0,
  drawerHeights,
  material,
  doorMaterial,
  renderMode,
  isHighlighted = false,
  textureUrl,
  doorTextureUrl,
  panelGrainDirections,
  furnitureId,
  sectionName = '',
  backPanelThicknessOverride,
}) => {
  const { viewMode } = useSpace3DView();
  const highlightedPanel = useUIStore(state => state.highlightedPanel);

  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // 서랍 패널 두께
  const DRAWER_SIDE_THICKNESS = mmToThreeUnits(15); // 서랍 측판 15mm
  const HANDLE_PLATE_THICKNESS = mmToThreeUnits(15.5); // 마이다 15.5mm
  const backPanelThickness = backPanelThicknessOverride != null
    ? mmToThreeUnits(backPanelThicknessOverride)
    : mmToThreeUnits(9);

  // 마이다 폭 = 모듈 전체 폭 - 3mm (양쪽 1.5mm 갭)
  const maidaWidth = mmToThreeUnits(moduleWidth - 3);

  // 마이다 Z 위치 = 도어와 동일 (가구 앞면 + 14mm)
  // doorDepth/2 = (moduleDepth + 28) / 2 → 실제 14mm
  const maidaZ = (mmToThreeUnits(moduleDepthMm) + mmToThreeUnits(28)) / 2;

  // 패널 material 결정
  const getPanelMaterial = React.useCallback((panelName: string) => {
    return material;
  }, [material]);

  if (drawerCount <= 0 || drawerHeights.length === 0) {
    return null;
  }

  // 서랍 폭 = 내경 (날개벽 없으므로 측판 안쪽면이 곧 서랍 영역)
  const drawerWidth = innerWidth;

  // 각 서랍 렌더링 (아래에서 위로)
  let currentY = -innerHeight / 2;
  const gap = mmToThreeUnits(3); // 서랍 간 갭 3mm

  return (
    <group position={[0, yOffset, zOffset]}>
      {drawerHeights.map((heightMm, i) => {
        const drawerHeight = mmToThreeUnits(heightMm);
        const drawerCenterY = currentY + drawerHeight / 2;

        // 서랍 본체 깊이: 가구 깊이 - 백패널 두께 - 앞쪽 여유(85mm) - 뒤쪽 여유
        const drawerBodyDepth = depth - basicThickness - backPanelThickness - mmToThreeUnits(85);
        // 서랍 본체 Z 중심: 백패널 앞에서 시작
        const drawerBodyCenterZ = -depth / 2 + basicThickness + backPanelThickness + drawerBodyDepth / 2;

        const drawerKey = `ext-drawer-${i}`;

        // 다음 서랍을 위해 Y 업데이트
        currentY += drawerHeight + gap;

        return (
          <group key={drawerKey}>
            {/* 서랍 바닥판 */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 바닥` : `서랍${i + 1} 바닥`;
              const mat = getPanelMaterial(panelName);
              const bottomDepth = drawerBodyDepth - mmToThreeUnits(10); // 앞쪽 10mm 홈 끼움 여유
              const bottomZ = drawerBodyCenterZ - mmToThreeUnits(5);
              return (
                <BoxWithEdges
                  args={[drawerWidth - mmToThreeUnits(70), backPanelThickness, bottomDepth]}
                  position={[0, drawerCenterY - drawerHeight / 2 + basicThickness + mmToThreeUnits(10) + backPanelThickness / 2, bottomZ]}
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
              const bottomTopY = drawerCenterY - drawerHeight / 2 + basicThickness + mmToThreeUnits(10) + backPanelThickness;
              const backTopY = drawerCenterY + (drawerHeight - mmToThreeUnits(30)) / 2;
              const backHeight = backTopY - bottomTopY;
              const backY = (backTopY + bottomTopY) / 2;
              return (
                <BoxWithEdges
                  args={[drawerWidth - mmToThreeUnits(70), backHeight, DRAWER_SIDE_THICKNESS]}
                  position={[0, backY, drawerBodyCenterZ - drawerBodyDepth / 2 + DRAWER_SIDE_THICKNESS / 2]}
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

            {/* 서랍 좌측판 - 측판에 직접 (날개벽 없음) */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 좌측판` : `서랍${i + 1} 좌측판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[DRAWER_SIDE_THICKNESS, drawerHeight - mmToThreeUnits(30), drawerBodyDepth]}
                  position={[-drawerWidth / 2 + DRAWER_SIDE_THICKNESS / 2 + mmToThreeUnits(5), drawerCenterY, drawerBodyCenterZ]}
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

            {/* 서랍 우측판 - 측판에 직접 (날개벽 없음) */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1} 우측판` : `서랍${i + 1} 우측판`;
              const mat = getPanelMaterial(panelName);
              return (
                <BoxWithEdges
                  args={[DRAWER_SIDE_THICKNESS, drawerHeight - mmToThreeUnits(30), drawerBodyDepth]}
                  position={[drawerWidth / 2 - DRAWER_SIDE_THICKNESS / 2 - mmToThreeUnits(5), drawerCenterY, drawerBodyCenterZ]}
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

            {/* 마이다 (도어 재질, 도어 Z 위치) - 앞판 없이 마이다가 곧 도어면 */}
            {(() => {
              const panelName = sectionName ? `${sectionName}서랍${i + 1}(마이다)` : `서랍${i + 1}(마이다)`;
              const mat = doorMaterial || getPanelMaterial(panelName);
              const maidaHeight = drawerHeight - mmToThreeUnits(3); // 상하 갭
              return (
                <BoxWithEdges
                  args={[maidaWidth, maidaHeight, HANDLE_PLATE_THICKNESS]}
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
