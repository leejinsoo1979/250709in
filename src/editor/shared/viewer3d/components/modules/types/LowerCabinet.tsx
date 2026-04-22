import React, { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import { useFrame, useThree } from '@react-three/fiber';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import IndirectLight from '../IndirectLight';
import DimensionText from '../components/DimensionText';
import MaidaWidthDimension from '../components/MaidaWidthDimension';
import { useDimensionColor } from '../hooks/useDimensionColor';

import DoorModule from '../DoorModule';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { ExternalDrawerRenderer } from '../ExternalDrawerRenderer';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';
import LegraSideRail from '../components/LegraSideRail';
import { Line } from '@react-three/drei';
import { useFurnitureStore } from '@/store/core/furnitureStore';

/**
 * 졸리컷 수평 상판 — 앞면 하단 모서리가 45도로 가공된 판
 * 측면(YZ) 단면:
 *
 *   상면: ──────────────────
 *          \               |
 *   45도→   \              | 뒷면
 *            \             |
 *   하면:     ─────────────
 */
const JollyCutHorizontalPlate: React.FC<{
  width: number; thickness: number; depth: number;
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
}> = React.memo(({ width, thickness: t, depth: d, position, material, renderMode }) => {
  const geom = useMemo(() => {
    const hw = width / 2, ht = t / 2, hd = d / 2;
    // 0=좌상앞, 1=좌상뒤, 2=좌하뒤, 3=좌하앞(후퇴t)
    // 4=우상앞, 5=우상뒤, 6=우하뒤, 7=우하앞(후퇴t)
    const V: [number,number,number][] = [
      [-hw, +ht, +hd],   [-hw, +ht, -hd],   [-hw, -ht, -hd],   [-hw, -ht, +hd-t],
      [+hw, +ht, +hd],   [+hw, +ht, -hd],   [+hw, -ht, -hd],   [+hw, -ht, +hd-t],
    ];
    // non-indexed: 면별 독립 정점 + UV
    const pos: number[] = [];
    const uvs: number[] = [];
    // quad 헬퍼: 4정점 + 4 UV → 2 triangles (v0,v1,v2 + v0,v2,v3)
    const quad = (a:number,b:number,c:number,d_:number, u0:[number,number],u1:[number,number],u2:[number,number],u3:[number,number]) => {
      pos.push(...V[a],...V[b],...V[c], ...V[a],...V[c],...V[d_]);
      uvs.push(...u0,...u1,...u2, ...u0,...u2,...u3);
    };
    // 상면 ↑: 0,4,5,1 (좌앞→우앞→우뒤→좌뒤)
    quad(0,4,5,1, [0,1],[1,1],[1,0],[0,0]);
    // 하면 ↓: 3,2,6,7 (좌앞→좌뒤→우뒤→우앞) — 아래서 봄
    quad(3,2,6,7, [0,1],[0,0],[1,0],[1,1]);
    // 뒷면 -Z: 1,5,6,2 (좌상→우상→우하→좌하)
    quad(1,5,6,2, [0,1],[1,1],[1,0],[0,0]);
    // 45도 경사면: 0,3,7,4 (좌상→좌하→우하→우상) — 앞+아래서 봄
    quad(0,3,7,4, [0,1],[0,0],[1,0],[1,1]);
    // 좌측면 -X: 0,1,2,3 (상앞→상뒤→하뒤→하앞)
    quad(0,1,2,3, [1,1],[0,1],[0,0],[1,0]);
    // 우측면 +X: 4,7,6,5 (상앞→하앞→하뒤→상뒤)
    quad(4,7,6,5, [0,1],[0,0],[1,0],[1,1]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [width, t, d]);

  // 엣지 라인
  const edgeLines = useMemo(() => {
    const hw = width / 2, ht = t / 2, hd = d / 2;
    const V: [number,number,number][] = [
      [-hw, +ht, +hd], [-hw, +ht, -hd], [-hw, -ht, -hd], [-hw, -ht, +hd-t],
      [+hw, +ht, +hd], [+hw, +ht, -hd], [+hw, -ht, -hd], [+hw, -ht, +hd-t],
    ];
    return [
      [0,4],[4,5],[5,1],[1,0], // 상면
      [3,7],[7,6],[6,2],[2,3], // 하면
      [1,2],[5,6],             // 뒷면 수직
      [0,3],[4,7],             // 45도 경사
    ].map(([a,b]) => [V[a], V[b]] as [[number,number,number],[number,number,number]]);
  }, [width, t, d]);

  const lineColor = renderMode === 'wireframe' ? '#ffffff' : '#555555';

  return (
    <group position={position}>
      <mesh material={material}>
        <primitive key={`hplate-${width}-${t}-${d}`} object={geom} attach="geometry" />
      </mesh>
      {edgeLines.map(([s,e], i) => (
        <line key={`h-edge-${i}-${width}-${t}-${d}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array([...s,...e])} count={2} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={lineColor} />
        </line>
      ))}
    </group>
  );
});

/**
 * 졸리컷 수직 앞판 — 뒷면 상단 모서리가 45도로 가공된 판
 * 측면(YZ) 단면:
 *
 *         뒤    앞
 *      3───────0   상면 (앞 전체, 뒤 후퇴)
 *       \      |
 * 45도→  \     | 앞면
 *         \    |
 *      2───────1   하면
 *         뒷면
 */
const JollyCutVerticalPlate: React.FC<{
  width: number; height: number; thickness: number;
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
}> = React.memo(({ width, height: h, thickness: t, position, material, renderMode }) => {
  const geom = useMemo(() => {
    const hw = width / 2, hh = h / 2, ht = t / 2;
    // 0=좌상앞, 1=좌하앞, 2=좌하뒤, 3=좌상후퇴뒤
    // 4=우상앞, 5=우하앞, 6=우하뒤, 7=우상후퇴뒤
    const V: [number,number,number][] = [
      [-hw, +hh, +ht],   [-hw, -hh, +ht],   [-hw, -hh, -ht],   [-hw, +hh-t, -ht],
      [+hw, +hh, +ht],   [+hw, -hh, +ht],   [+hw, -hh, -ht],   [+hw, +hh-t, -ht],
    ];
    const pos: number[] = [];
    const uvs: number[] = [];
    const quad = (a:number,b:number,c:number,d_:number, u0:[number,number],u1:[number,number],u2:[number,number],u3:[number,number]) => {
      pos.push(...V[a],...V[b],...V[c], ...V[a],...V[c],...V[d_]);
      uvs.push(...u0,...u1,...u2, ...u0,...u2,...u3);
    };
    // 앞면 +Z: 0,1,5,4 (좌상→좌하→우하→우상)
    quad(0,1,5,4, [0,1],[0,0],[1,0],[1,1]);
    // 뒷면 -Z: 3,7,6,2 (좌상후퇴→우상후퇴→우하→좌하) — 뒤에서 봄
    quad(3,7,6,2, [0,1],[1,1],[1,0],[0,0]);
    // 하면 ↓: 1,2,6,5 (좌앞→좌뒤→우뒤→우앞)
    quad(1,2,6,5, [0,1],[0,0],[1,0],[1,1]);
    // 45도 경사면 (상): 0,4,7,3 (좌앞상→우앞상→우뒤후퇴→좌뒤후퇴) — 위+뒤에서 봄
    quad(0,4,7,3, [0,1],[1,1],[1,0],[0,0]);
    // 좌측면 -X: 0,3,2,1 (상앞→상뒤후퇴→하뒤→하앞)
    quad(0,3,2,1, [1,1],[0,1],[0,0],[1,0]);
    // 우측면 +X: 4,5,6,7 (상앞→하앞→하뒤→상뒤후퇴)
    quad(4,5,6,7, [0,1],[0,0],[1,0],[1,1]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [width, h, t]);

  const edgeLines = useMemo(() => {
    const hw = width / 2, hh = h / 2, ht = t / 2;
    const V: [number,number,number][] = [
      [-hw, +hh, +ht], [-hw, -hh, +ht], [-hw, -hh, -ht], [-hw, +hh-t, -ht],
      [+hw, +hh, +ht], [+hw, -hh, +ht], [+hw, -hh, -ht], [+hw, +hh-t, -ht],
    ];
    return [
      [0,4],[4,5],[5,1],[1,0], // 앞면
      [3,7],[7,6],[6,2],[2,3], // 뒷면+하면
      [1,2],[5,6],             // 앞뒤 수직
      [0,3],[4,7],             // 45도 경사
    ].map(([a,b]) => [V[a], V[b]] as [[number,number,number],[number,number,number]]);
  }, [width, h, t]);

  const lineColor = renderMode === 'wireframe' ? '#ffffff' : '#555555';

  return (
    <group position={position}>
      <mesh material={material}>
        <primitive key={`vplate-${width}-${h}-${t}`} object={geom} attach="geometry" />
      </mesh>
      {edgeLines.map(([s,e], i) => (
        <line key={`v-edge-${i}-${width}-${h}-${t}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array([...s,...e])} count={2} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={lineColor} />
        </line>
      ))}
    </group>
  );
});

/**
 * 인덕션장 레그라박스 서랍 + 마이다 (인출 애니메이션 포함)
 * - 바닥판 + 뒷판 + 레그라 측판(GLB) + 마이다 2장
 * - 도어 오픈 시 서랍 본체 + 마이다가 Z축으로 300mm 슬라이드
 * - 2D 모드에서 마이다 오버레이 + V자 점선 인출 표시
 */
interface InductionDrawerAnimatedProps {
  moduleId: string;
  moduleHeightMm: number;
  adjustedHeight: number;
  adjustedWidth: number;
  basicThickness: number;   // Three.js units
  furnitureDepth: number;   // Three.js units
  furnitureMaterial: THREE.Material;
  doorMaterial: THREE.Material;
  backPanelThicknessProp?: number;
  renderMode: 'solid' | 'wireframe';
  cabinetYPosition: number;
  placedFurnitureId?: string;
  showFurniture: boolean;
  hasDoor: boolean;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
  doorTopGap?: number;
  doorBottomGap?: number;
}

const InductionDrawerAnimated: React.FC<InductionDrawerAnimatedProps> = ({
  adjustedHeight,
  adjustedWidth,
  basicThickness,
  furnitureDepth,
  furnitureMaterial,
  doorMaterial,
  renderMode,
  cabinetYPosition,
  placedFurnitureId,
  showFurniture,
  hasDoor,
  panelGrainDirections,
  doorTopGap,
  doorBottomGap,
}) => {
  const { doorsOpen, isIndividualDoorOpen, isInteriorMaterialMode } = useUIStore();
  const { gl } = useThree();
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(s => s.view2DDirection);
  const view2DTheme = useUIStore(s => s.view2DTheme);
  const showDimensions = useUIStore(s => s.showDimensions);
  const { dimensionColor } = useDimensionColor();

  // 도어 오픈 상태 (ExternalDrawerRenderer와 동일 로직)
  const isDoorOpen = (doorsOpen !== null && !isInteriorMaterialMode)
    ? doorsOpen
    : placedFurnitureId ? isIndividualDoorOpen(placedFurnitureId, 0) : false;

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
  const DRAWER_OPEN_DISTANCE = mmToThreeUnits(300);

  const spring = useSpring({
    z: isDoorOpen ? DRAWER_OPEN_DISTANCE : 0,
    config: { tension: 90, friction: 16, clamp: true },
  });

  const cabinetHeight = adjustedHeight;
  const cabinetBottomY = -cabinetHeight / 2;
  const basicThicknessMm = basicThickness / 0.01;
  const drawerThicknessMm = 15;
  const bottomSideGapMm = 17;
  const backSideGapMm = 18.5;
  const widthMm = adjustedWidth;
  const drawerBottomWidthMm = widthMm - basicThicknessMm * 2 - bottomSideGapMm * 2;
  const drawerBackWidthMm = widthMm - basicThicknessMm * 2 - backSideGapMm * 2;
  const drawerDepthMm = 490;
  const bottomGapMm = 28;
  const drawer1BottomY = cabinetBottomY + mmToThreeUnits(basicThicknessMm + bottomGapMm);
  const drawer1TotalH = 228;
  const drawer1BackH = drawer1TotalH - drawerThicknessMm;
  const drawer2FromBottomPanelTopMm = 338;
  const drawer2BottomY = cabinetBottomY + mmToThreeUnits(drawer2FromBottomPanelTopMm + basicThicknessMm);
  const drawer2TotalH = 164;
  const drawer2BackH = drawer2TotalH - drawerThicknessMm;

  const drawerBottomWidth = mmToThreeUnits(drawerBottomWidthMm);
  const drawerBackWidth = mmToThreeUnits(drawerBackWidthMm);
  const drawerDepth = mmToThreeUnits(drawerDepthMm);
  const drawerThickness = mmToThreeUnits(drawerThicknessMm);
  const drawerFrontZ = furnitureDepth / 2;
  const drawerZ = drawerFrontZ - drawerDepth / 2;
  const drawerBackZ = drawerFrontZ - drawerDepth + drawerThickness / 2;
  const rebateWidth = mmToThreeUnits(38);
  const rebateHeight = mmToThreeUnits(7.5);

  // 마이다 관련 계산
  const moduleDepthMm = furnitureDepth / 0.01;
  const maidaWidthMm = widthMm - 3;
  const maidaWidth = mmToThreeUnits(maidaWidthMm);
  const maidaThickness = basicThickness;
  const maidaZ = mmToThreeUnits((moduleDepthMm + 28) / 2);

  const defaultDTG = -20;
  const defaultDBG = 5;
  const gapTopExt = (doorTopGap ?? defaultDTG) - defaultDTG;
  const gapBottomExt = (doorBottomGap ?? defaultDBG) - defaultDBG;

  const maida1HeightMm = 340 + gapBottomExt;
  const maida1BottomMm = -5 - gapBottomExt;
  const maida1CenterY = cabinetBottomY + mmToThreeUnits(maida1BottomMm) + mmToThreeUnits(maida1HeightMm) / 2;

  const maida2HeightMm = 427 + gapTopExt;
  const gapMm = 3;
  const maida2BottomMm = -5 + 340 + gapMm;
  const maida2CenterY = cabinetBottomY + mmToThreeUnits(maida2BottomMm) + mmToThreeUnits(maida2HeightMm) / 2;

  // 2D 오버레이 표시 조건
  const showMaidaOverlay = viewMode === '2D' && view2DDirection === 'front';
  const maidaOverlayColor = view2DTheme === 'dark' ? '#3a5a7a' : '#a0b8d0';

  // V자 점선 생성 함수
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
          key={`${keyPrefix}-${pos}`}
          points={[
            [s[0] + dx * t1, s[1] + dy * t1, s[2]],
            [s[0] + dx * t2, s[1] + dy * t2, s[2]]
          ]}
          color="#FF8800"
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

  // V자 렌더링 헬퍼
  const renderMaidaVLines = (maidaCY: number, maidaH: number, idx: number) => {
    const hw = maidaWidth / 2;
    const hh = mmToThreeUnits(maidaH) / 2;
    const frontZPos = maidaZ + maidaThickness / 2 + 0.002;
    const leftTop: [number, number, number] = [0 - hw, maidaCY + hh, frontZPos];
    const centerBottom: [number, number, number] = [0, maidaCY - hh, frontZPos];
    const rightTop: [number, number, number] = [0 + hw, maidaCY + hh, frontZPos];
    return (
      <>
        {makeDashedLine(leftTop, centerBottom, `ind-maida-v1-${idx}`)}
        {makeDashedLine(centerBottom, rightTop, `ind-maida-v2-${idx}`)}
      </>
    );
  };

  return (
    <group position={[0, cabinetYPosition, 0]}>
      {/* 서랍 본체 (바닥판 + 뒷판 + 레그라 측판) — 인출 애니메이션 */}
      {showFurniture && (
        <animated.group position-z={spring.z}>
          {/* 1단 서랍 바닥판 */}
          <BoxWithEdges
            args={[drawerBottomWidth, drawerThickness, drawerDepth]}
            position={[0, drawer1BottomY + drawerThickness / 2, drawerZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 1단서랍 바닥판"
            furnitureId={placedFurnitureId}
            bottomRebate={{ width: rebateWidth, height: rebateHeight }}
          />
          {/* 1단 서랍 뒷판 */}
          <BoxWithEdges
            args={[drawerBackWidth, mmToThreeUnits(drawer1BackH), drawerThickness]}
            position={[0, drawer1BottomY + drawerThickness + mmToThreeUnits(drawer1BackH) / 2, drawerBackZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 1단서랍 뒷판"
            furnitureId={placedFurnitureId}
          />
          {/* 2단 서랍 바닥판 */}
          <BoxWithEdges
            args={[drawerBottomWidth, drawerThickness, drawerDepth]}
            position={[0, drawer2BottomY + drawerThickness / 2, drawerZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 2단서랍 바닥판"
            furnitureId={placedFurnitureId}
            bottomRebate={{ width: rebateWidth, height: rebateHeight }}
          />
          {/* 2단 서랍 뒷판 */}
          <BoxWithEdges
            args={[drawerBackWidth, mmToThreeUnits(drawer2BackH), drawerThickness]}
            position={[0, drawer2BottomY + drawerThickness + mmToThreeUnits(drawer2BackH) / 2, drawerBackZ]}
            material={furnitureMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 2단서랍 뒷판"
            furnitureId={placedFurnitureId}
          />
          {/* 1단 서랍 레그라 측판 (GLB 모델) */}
          <LegraSideRail
            drawerTier={1}
            drawerBottomY={drawer1BottomY}
            drawerBottomThickness={drawerThickness}
            backPanelHeight={mmToThreeUnits(drawer1BackH)}
            drawerFrontZ={drawerFrontZ}
            sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
            renderMode={renderMode}
          />
          {/* 2단 서랍 레그라 측판 (GLB 모델) */}
          <LegraSideRail
            drawerTier={2}
            drawerBottomY={drawer2BottomY}
            drawerBottomThickness={drawerThickness}
            backPanelHeight={mmToThreeUnits(drawer2BackH)}
            drawerFrontZ={drawerFrontZ}
            sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
            renderMode={renderMode}
          />
        </animated.group>
      )}

      {/* 마이다 (도어면) — 인출 애니메이션 + 2D 오버레이/V자 */}
      {hasDoor && (
        <animated.group position-z={spring.z}>
          {/* 1단 서랍 마이다 */}
          <BoxWithEdges
            args={[maidaWidth, mmToThreeUnits(maida1HeightMm), maidaThickness]}
            position={[0, maida1CenterY, maidaZ]}
            material={doorMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 1단서랍(마이다)"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
          {/* 1단 마이다 2D 오버레이 */}
          {showMaidaOverlay && (
            <mesh position={[0, maida1CenterY, maidaZ + maidaThickness / 2 + 0.001]} renderOrder={9999}>
              <planeGeometry args={[maidaWidth, mmToThreeUnits(maida1HeightMm)]} />
              <meshBasicMaterial color={maidaOverlayColor} transparent opacity={0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
            </mesh>
          )}
          {/* 1단 마이다 V자 인출 표시 */}
          {showMaidaOverlay && renderMaidaVLines(maida1CenterY, maida1HeightMm, 0)}

          {/* 2단 서랍 마이다 */}
          <BoxWithEdges
            args={[maidaWidth, mmToThreeUnits(maida2HeightMm), maidaThickness]}
            position={[0, maida2CenterY, maidaZ]}
            material={doorMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName="인덕션 2단서랍(마이다)"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
          {/* 2단 마이다 2D 오버레이 */}
          {showMaidaOverlay && (
            <mesh position={[0, maida2CenterY, maidaZ + maidaThickness / 2 + 0.001]} renderOrder={9999}>
              <planeGeometry args={[maidaWidth, mmToThreeUnits(maida2HeightMm)]} />
              <meshBasicMaterial color={maidaOverlayColor} transparent opacity={0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
            </mesh>
          )}
          {/* 2단 마이다 V자 인출 표시 */}
          {showMaidaOverlay && renderMaidaVLines(maida2CenterY, maida2HeightMm, 1)}
        </animated.group>
      )}

      {/* 마이다 하단 폭 치수 (1단 마이다 기준) — 서랍 애니메이션 밖에서 고정, 공통 컴포넌트 사용 */}
      {hasDoor && showDimensions && (
        <group position={[0, maida1CenterY - mmToThreeUnits(maida1HeightMm) / 2, 0]}>
          <MaidaWidthDimension
            maidaWidthMm={maidaWidthMm}
            maidaWidth={maidaWidth}
            moduleDepthMm={moduleDepthMm}
            maidaZ={maidaZ}
            viewMode={viewMode as '3D' | '2D'}
            view2DDirection={view2DDirection as any}
            dimensionColor={dimensionColor}
            mmToThreeUnits={mmToThreeUnits}
          />
        </group>
      )}
    </group>
  );
};

/**
 * 터치 레그라박스 서랍 + 마이다 (인출 애니메이션 포함)
 * - 도어올림 터치 / 상판내림 터치 전용
 * - 도어 오픈 시 서랍 본체 + 마이다 + 레그라 측판이 함께 Z축으로 슬라이드
 */
interface TouchDrawerAnimatedProps {
  moduleId: string;
  moduleHeightMm: number;
  adjustedHeight: number;
  adjustedWidth?: number;
  basicThickness: number;
  furnitureDepth: number;
  furnitureMaterial: THREE.Material;
  doorMaterial: THREE.Material;
  backPanelThicknessProp?: number;
  renderMode: 'solid' | 'wireframe';
  cabinetYPosition: number;
  placedFurnitureId?: string;
  showFurniture: boolean;
  hasDoor: boolean;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
}

const TouchDrawerAnimated: React.FC<TouchDrawerAnimatedProps> = ({
  moduleId,
  moduleHeightMm,
  adjustedHeight,
  adjustedWidth,
  basicThickness,
  furnitureDepth,
  furnitureMaterial,
  doorMaterial,
  renderMode,
  cabinetYPosition,
  placedFurnitureId,
  showFurniture,
  hasDoor,
  panelGrainDirections,
}) => {
  const { doorsOpen, isIndividualDoorOpen, isInteriorMaterialMode } = useUIStore();
  const { gl } = useThree();
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(s => s.view2DDirection);
  const view2DTheme = useUIStore(s => s.view2DTheme);
  const showDimensions = useUIStore(s => s.showDimensions);
  const { dimensionColor } = useDimensionColor();

  // 도어 오픈 상태 (ExternalDrawerRenderer와 동일 로직)
  const isDoorOpen = (doorsOpen !== null && !isInteriorMaterialMode)
    ? doorsOpen
    : placedFurnitureId ? isIndividualDoorOpen(placedFurnitureId, 0) : false;

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
  const DRAWER_OPEN_DISTANCE = mmToThreeUnits(300);

  const spring = useSpring({
    z: isDoorOpen ? DRAWER_OPEN_DISTANCE : 0,
    config: { tension: 90, friction: 16, clamp: true },
  });

  const cabinetHeight = adjustedHeight;
  const cabinetBottomY = -cabinetHeight / 2;
  const basicThicknessMm = basicThickness / 0.01;
  const widthMm = adjustedWidth || 0;

  // === 서랍 본체 기하 ===
  const drawerThicknessMm = 15;
  const bottomSideGapMm = 17;
  const backSideGapMm = 18.5;
  const drawerBottomWidthMm = widthMm - basicThicknessMm * 2 - bottomSideGapMm * 2;
  const drawerBackWidthMm = widthMm - basicThicknessMm * 2 - backSideGapMm * 2;
  const drawerDepthMm = 490;
  const drawerBottomWidth = mmToThreeUnits(drawerBottomWidthMm);
  const drawerBackWidth = mmToThreeUnits(drawerBackWidthMm);
  const drawerDepth = mmToThreeUnits(drawerDepthMm);
  const drawerThickness = mmToThreeUnits(drawerThicknessMm);
  const drawerFrontZ = furnitureDepth / 2;
  const drawerZ = drawerFrontZ - drawerDepth / 2;
  const drawerBackZ = drawerFrontZ - drawerDepth + drawerThickness / 2;
  const rebateWidth = mmToThreeUnits(38);
  const rebateHeight = mmToThreeUnits(7.5);

  // 모듈 판별
  const isTouch2A = moduleId.includes('lower-door-lift-touch-2tier-a');
  const isTouch2B = moduleId.includes('lower-door-lift-touch-2tier-b');
  const isTouch3 = moduleId.includes('lower-door-lift-touch-3tier');
  const isTDTouch2 = moduleId.includes('lower-top-down-touch-2tier');
  const isTDTouch3 = moduleId.includes('lower-top-down-touch-3tier');

  // 서랍 스펙
  const drawerSpecs: [number, number][] = isTouch2A ? [[228, 28], [228, 406]]
    : isTouch2B ? [[228, 28], [164, 406]]
    : isTouch3 ? [[228, 28], [117, 357], [117, 587]]
    : isTDTouch2 ? [[228, 28], [228, 356]]
    : isTDTouch3 ? [[164, 28], [117, 280], [117, 493]]
    : [[228, 28], [228, 406]];

  const bottomPanelTopY = cabinetBottomY + mmToThreeUnits(basicThicknessMm);
  const drawers = drawerSpecs.map(([dh, offsetFromBottomPanel], idx) => ({
    height: dh,
    backH: dh - drawerThicknessMm,
    bottomY: bottomPanelTopY + mmToThreeUnits(offsetFromBottomPanel),
    tier: idx + 1
  }));

  // === 마이다 기하 ===
  const moduleWidthMm = adjustedWidth || 0;
  const maidaWidthMm = moduleWidthMm - 3;
  const maidaWidth = mmToThreeUnits(maidaWidthMm);
  const maidaThickness = basicThickness;
  const moduleDepthMm = furnitureDepth / 0.01;
  const maidaZ = mmToThreeUnits((moduleDepthMm + 28) / 2);

  // 마이다 비례: 2B는 2A와 동일하게 [228, 228] 사용 (서랍 본체 높이만 다름)
  const drawerHeights = isTouch2A ? [228, 228]
    : isTouch2B ? [228, 228]
    : isTouch3 ? [228, 117, 117]
    : isTDTouch2 ? [228, 228]
    : isTDTouch3 ? [164, 117, 117]
    : [228, 228];

  const topExtMm = 30;
  const bottomExtMm = 5;
  const totalFrontMm = moduleHeightMm + topExtMm + bottomExtMm;
  const gapMm = 3;
  const drawerCount = drawerHeights.length;
  const totalGaps = (drawerCount - 1) * gapMm;
  const totalMaidaMm = totalFrontMm - totalGaps;
  const totalDrawerH = drawerHeights.reduce((a, b) => a + b, 0);
  // 도어올림 터치 2단(2A/2B): 하→상 [408, 409]
  // 도어올림 터치 3단: 하→상 [360, 227, 227]
  // 상판내림 터치 2단: 하→상 [353, 354]
  // 상판내림 터치 3단: 하→상 [284, 210, 210]
  const isDoorLift2Fixed = drawerCount === 2 && (isTouch2A || isTouch2B);
  const isDoorLift3Fixed = drawerCount === 3 && isTouch3;
  const isTopDown2Fixed = drawerCount === 2 && isTDTouch2;
  const isTopDown3Fixed = drawerCount === 3 && isTDTouch3;
  const maidaHeightsMm = isDoorLift2Fixed
    ? [408, 409]
    : isDoorLift3Fixed
      ? [360, 227, 227]
      : isTopDown2Fixed
        ? [353, 354]
        : isTopDown3Fixed
          ? [284, 210, 210]
          : drawerHeights.map(h => (h / totalDrawerH) * totalMaidaMm);

  let currentBottomMm = -bottomExtMm;
  const maidas = maidaHeightsMm.map((h, idx) => {
    const centerY = cabinetBottomY + mmToThreeUnits(currentBottomMm + h / 2);
    currentBottomMm += h + gapMm;
    return { height: h, centerY, tier: idx + 1 };
  });

  return (
    <group position={[0, cabinetYPosition, 0]}>
    <animated.group position-z={spring.z}>
      <group>
        {/* 서랍 본체 + 레그라 레일 (showFurniture true일 때만) */}
        {showFurniture && drawers.map((d, i) => (
          <React.Fragment key={`touch-drawer-${i}`}>
            {/* 바닥판 (반턱) */}
            <BoxWithEdges
              args={[drawerBottomWidth, drawerThickness, drawerDepth]}
              position={[0, d.bottomY + drawerThickness / 2, drawerZ]}
              material={furnitureMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName={`터치${d.tier}단서랍 바닥판`}
              furnitureId={placedFurnitureId}
              bottomRebate={{ width: rebateWidth, height: rebateHeight }}
            />
            {/* 뒷판 */}
            <BoxWithEdges
              args={[drawerBackWidth, mmToThreeUnits(d.backH), drawerThickness]}
              position={[0, d.bottomY + drawerThickness + mmToThreeUnits(d.backH) / 2, drawerBackZ]}
              material={furnitureMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName={`터치${d.tier}단서랍 뒷판`}
              furnitureId={placedFurnitureId}
            />
            {/* 레그라 측판 (GLB 모델) */}
            <LegraSideRail
              drawerTier={d.tier}
              drawerBottomY={d.bottomY}
              drawerBottomThickness={drawerThickness}
              backPanelHeight={mmToThreeUnits(d.backH)}
              drawerFrontZ={drawerFrontZ}
              sidePanelInnerX={mmToThreeUnits(widthMm / 2 - basicThicknessMm)}
              drawerHeightMm={d.height}
              renderMode={renderMode}
            />
          </React.Fragment>
        ))}

        {/* 마이다 (hasDoor true일 때만) */}
        {hasDoor && maidas.map((m, i) => (
          <BoxWithEdges
            key={`touch-maida-${i}`}
            args={[maidaWidth, mmToThreeUnits(m.height), maidaThickness]}
            position={[0, m.centerY, maidaZ]}
            material={doorMaterial}
            renderMode={renderMode}
            isHighlighted={false}
            panelName={`터치${m.tier}단서랍(마이다)`}
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
        ))}
      </group>
    </animated.group>

    {/* 마이다 하단 폭 치수 (맨 아래 마이다 기준) — 서랍 애니메이션 밖에서 고정, 공통 컴포넌트 사용 */}
    {hasDoor && maidas.length > 0 && showDimensions && (() => {
      const m = maidas[0]; // 1단 서랍
      return (
        <group position={[0, m.centerY - mmToThreeUnits(m.height) / 2, 0]}>
          <MaidaWidthDimension
            maidaWidthMm={maidaWidthMm}
            maidaWidth={maidaWidth}
            moduleDepthMm={moduleDepthMm}
            maidaZ={maidaZ}
            viewMode={viewMode as '3D' | '2D'}
            view2DDirection={view2DDirection as any}
            dimensionColor={dimensionColor}
            mmToThreeUnits={mmToThreeUnits}
          />
        </group>
      );
    })()}
    </group>
  );
};

/**
 * 하부장 컴포넌트
 * - 하부장 선반형, 오픈형, 혼합형을 모두 처리
 * - 공통 렌더링 로직 사용
 * - 상부장과 동일한 구조이지만 하부장 높이(1000mm)로 렌더링
 */
const LowerCabinet: React.FC<FurnitureTypeProps> = ({
  moduleData,
  color,
  isDragging = false,
  isEditMode = false,
  internalHeight,
  hasDoor = false,
  hasBackPanel = true, // 기본값은 true (백패널 있음)
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  doorWidth,
  doorXOffset = 0,
  originalSlotWidth,
  slotIndex,
  slotCenterX,
  adjustedWidth,
  slotWidths, // 듀얼 가구의 개별 슬롯 너비들
  showFurniture = true,
  lowerSectionTopOffset,
  placedFurnitureId,
  panelGrainDirections,
  backPanelThickness,
  renderMode: renderModeProp,
  zone, // 단내림 영역 정보
  hasBase,
  individualFloatHeight,
  parentGroupY,
  doorTopGap,
  doorBottomGap
}) => {
  console.log('🏠 [LowerCabinet] Props 확인:', {
    moduleId: moduleData.id,
    lowerSectionTopOffset,
    placementType: spaceInfo?.baseConfig?.placementType,
    floatHeight: spaceInfo?.baseConfig?.floatHeight,
    hideTopPanel: !moduleData.id.includes('lower-door-lift-') && !moduleData.id.includes('lower-top-down-'),
    hasSideNotches: (moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-top-down-')) && !moduleData.id.includes('lower-door-lift-touch-'),
  });
  const { renderMode: contextRenderMode, viewMode } = useSpace3DView();
  const renderMode = renderModeProp || contextRenderMode;
  
  // 공통 가구 로직 사용
  const { indirectLightEnabled, indirectLightIntensity, view2DDirection } = useUIStore();
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    backPanelThicknessMm: backPanelThickness
  });

  // 띄워서 배치 여부 확인 (간접조명용)
  const placementType = spaceInfo?.baseConfig?.placementType;
  const isFloating = placementType === 'float';
  const floatHeight = isFloating ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
  
  // 2D 모드 체크 - 2D 모드면 간접조명 안 보이게
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  const showIndirectLight = false;
  
  // 띄움 배치 시에도 캐비넷 높이는 변경하지 않음
  const adjustedHeight = baseFurniture.height;
  
  // 띄움 배치 시 Y 위치는 FurnitureItem에서 처리하므로 여기서는 0
  const cabinetYPosition = 0;
  
  // 간접조명 Y 위치 계산 (가구 바닥 바로 아래)
  const furnitureBottomY = cabinetYPosition - adjustedHeight/2;
  const lightY = furnitureBottomY - 0.5; // 가구 바닥에서 50cm 아래

  // 인조대리석 상판 데이터 — 개별 프리미티브 구독으로 무한루프 방지
  const stoneThickness = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopThickness || 0;
  });
  const stoneFrontOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    // 상판내림은 두께 무관 23으로 고정 (인조대리석 상판 623)
    const isTopDownFO = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');
    if (isTopDownFO && (pm?.stoneTopThickness || 0) > 0) return 23;
    return pm?.stoneTopFrontOffset || 0;
  });
  const stoneBackOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackOffset || 0;
  });
  const stoneLeftOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopLeftOffset || 0;
  });
  const stoneRightOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopRightOffset || 0;
  });
  const stoneBackLip = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLip || 0;
  });
  const stoneBackLipThickness = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipThickness || 0; // 0이면 상판 두께 사용
  });
  const stoneBackLipDepthOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipDepthOffset || 0;
  });
  const stoneBackLipTopOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 20; // 기본 20mm
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipTopOffset ?? 20;
  });
  const stoneBackLipTopBackOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipTopBackOffset ?? 0;
  });
  const stoneBackLipFullFill = useFurnitureStore(state => {
    if (!placedFurnitureId) return false;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipFullFill || false;
  });
  const stoneBackLipFillHeightOff = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const pm = state.placedModules.find(m => m.id === placedFurnitureId);
    return pm?.stoneTopBackLipFillHeight ?? 0;
  });

  // 상판내림 모듈 여부
  const isTopDown = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');

  // 좌/우 최외곽 하부장 자동 판별 — 분절 서라운드 프레임 옆이면 상판을 프레임 위로 확장
  // 원시값만 selector에서 반환하여 zustand 무한루프 방지
  const placedModulesForOuter = useFurnitureStore(state => state.placedModules);
  const outerExtendLeft = useMemo(() => {
    if (!placedFurnitureId || !spaceInfo) return 0;
    const self = placedModulesForOuter.find(mm => mm.id === placedFurnitureId);
    if (!self) return 0;
    const selfId = self.moduleId || '';
    const isLowerCat = selfId.startsWith('lower-') || selfId.includes('-lower-');
    if (!isLowerCat) return 0;
    const selfW = (self.isFreePlacement && self.freeWidth) ? self.freeWidth : (self.customWidth || self.adjustedWidth || self.moduleWidth || 0);
    const selfCx = Math.round(self.position.x * 100);
    const selfLeft = selfCx - selfW / 2;
    // 자기 좌측 edge가 공간 내경 좌측 경계에 1mm 이내 인접한 경우에만 확장
    const halfSpaceMm = (spaceInfo.width || 0) / 2;
    const leftFrameMM = spaceInfo.frameSize?.left || 0;
    const leftBoundaryMm = -halfSpaceMm + leftFrameMM;
    const isAdjLeft = Math.abs(selfLeft - leftBoundaryMm) <= 1;
    return isAdjLeft ? leftFrameMM : 0;
  }, [placedModulesForOuter, placedFurnitureId, spaceInfo?.frameSize?.left, spaceInfo?.width]);
  const outerExtendRight = useMemo(() => {
    if (!placedFurnitureId || !spaceInfo) return 0;
    const self = placedModulesForOuter.find(mm => mm.id === placedFurnitureId);
    if (!self) return 0;
    const selfId = self.moduleId || '';
    const isLowerCat = selfId.startsWith('lower-') || selfId.includes('-lower-');
    if (!isLowerCat) return 0;
    const selfW = (self.isFreePlacement && self.freeWidth) ? self.freeWidth : (self.customWidth || self.adjustedWidth || self.moduleWidth || 0);
    const selfCx = Math.round(self.position.x * 100);
    const selfRight = selfCx + selfW / 2;
    const halfSpaceMm = (spaceInfo.width || 0) / 2;
    const rightFrameMM = spaceInfo.frameSize?.right || 0;
    const rightBoundaryMm = halfSpaceMm - rightFrameMM;
    const isAdjRight = Math.abs(selfRight - rightBoundaryMm) <= 1;
    return isAdjRight ? rightFrameMM : 0;
  }, [placedModulesForOuter, placedFurnitureId, spaceInfo?.frameSize?.right, spaceInfo?.width]);

  const stoneTopData = useMemo(() => {
    if (stoneThickness <= 0) return null;
    const furW = adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width;
    const furD = baseFurniture.depth;
    const fo = stoneFrontOff * 0.01;
    const bo = stoneBackOff * 0.01;
    const lo = (stoneLeftOff + outerExtendLeft) * 0.01;
    const ro = (stoneRightOff + outerExtendRight) * 0.01;
    const lipThicknessMm = stoneBackLipThickness || stoneThickness; // 미설정 시 상판 두께 사용
    return {
      thickness: stoneThickness * 0.01,
      width: furW + lo + ro,
      depth: furD + fo + bo,
      xOffset: (ro - lo) / 2,
      zOffset: (fo - bo) / 2,
      backLipHeight: stoneBackLip * 0.01, // mm → m
      backLipThickness: lipThicknessMm * 0.01, // mm → m
      backLipDepthOffset: stoneBackLipDepthOff * 0.01, // mm → m
      backLipTopOffset: stoneBackLipTopOff * 0.01,    // mm → m
      backLipTopBackOffset: stoneBackLipTopBackOff * 0.01, // mm → m
      backLipFullFill: stoneBackLipFullFill,
      backLipFillHeight: stoneBackLipFillHeightOff * 0.01, // mm → m
    };
  }, [stoneThickness, stoneFrontOff, stoneBackOff, stoneLeftOff, stoneRightOff, outerExtendLeft, outerExtendRight, stoneBackLip, stoneBackLipThickness, stoneBackLipDepthOff, stoneBackLipTopOff, stoneBackLipTopBackOff, stoneBackLipFullFill, stoneBackLipFillHeightOff, adjustedWidth, baseFurniture.width, baseFurniture.depth]);

  // 인조대리석 상판 재질 — 전체 6면 동일 텍스처 (기본: 루나쉐도우)
  const LUNA_SHADOW_TEXTURE = '/materials/countertop/luna_shadow_hanwha.png';
  const countertopTextureUrl = spaceInfo?.materialConfig?.countertopTexture ?? LUNA_SHADOW_TEXTURE;
  const countertopColorVal = spaceInfo?.materialConfig?.countertopColor || '#FFFFFF';
  const stoneTopMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const stoneTopMaterial = useMemo(() => {
    if (!stoneTopData) return null;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(countertopColorVal),
      metalness: 0.0, roughness: 0.6, envMapIntensity: 0.0,
    });
    stoneTopMatRef.current = mat;
    return mat;
  }, [!!stoneTopData]);

  // countertop 색상 변경 반영
  useEffect(() => {
    if (stoneTopMatRef.current && !stoneTopMatRef.current.map) {
      stoneTopMatRef.current.color.set(countertopColorVal);
      stoneTopMatRef.current.needsUpdate = true;
    }
  }, [countertopColorVal, stoneTopMaterial]);

  // countertop 텍스처 로딩
  useEffect(() => {
    const mat = stoneTopMatRef.current;
    if (!mat) return;
    if (countertopTextureUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(countertopTextureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.colorSpace = THREE.SRGBColorSpace;
        mat.map = texture;
        mat.color.set('#ffffff');
        mat.toneMapped = false;
        mat.envMapIntensity = 0.0;
        mat.roughness = 0.8;
        mat.metalness = 0.0;
        mat.needsUpdate = true;
      });
    } else {
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.color.set(countertopColorVal);
      mat.needsUpdate = true;
    }
  }, [countertopTextureUrl, countertopColorVal, stoneTopMaterial]);

  // 상판내림 반통/한통 L프레임용 도어 재질 (텍스처 로드 포함)
  const doorTextureUrl = spaceInfo?.materialConfig?.doorTexture;
  const doorColorVal = baseFurniture.doorColor || '#E0E0E0';
  const doorMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lFrameDoorMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(doorColorVal),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
    });
    doorMaterialRef.current = mat;
    return mat;
  }, []);

  useEffect(() => {
    if (doorMaterialRef.current) {
      if (!doorMaterialRef.current.map) {
        doorMaterialRef.current.color.set(doorColorVal);
      }
      doorMaterialRef.current.needsUpdate = true;
    }
  }, [doorColorVal]);

  useEffect(() => {
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
      mat.color.set(doorColorVal);
      mat.toneMapped = true;
      mat.roughness = 0.6;
      mat.needsUpdate = true;
    }
  }, [doorTextureUrl, doorColorVal]);

  return (
    <>
      {/* 간접조명 렌더링 (띄워서 배치 시) */}
      {showIndirectLight && (
        <IndirectLight
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width} // 조정된 너비 우선 사용 (mm를 Three.js 단위로 변환)
          depth={baseFurniture.depth}
          intensity={indirectLightIntensity || 0.8}
          position={[0, lightY, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          <group position={[0, cabinetYPosition, 0]}>
            <BaseFurnitureShell
              {...baseFurniture}
              height={adjustedHeight}
              isDragging={isDragging}
              isEditMode={isEditMode}
              hasBackPanel={hasBackPanel}
              spaceInfo={spaceInfo}
              moduleData={moduleData}
              lowerSectionTopOffsetMm={lowerSectionTopOffset}
              renderMode={renderMode}
              isFloating={isFloating}
              hideVentilationCap={true}
              hideTopPanel={!moduleData.id.includes('lower-door-lift-') && !moduleData.id.includes('lower-top-down-')}
              topPanelFrontReduction={moduleData.id.includes('lower-top-down-') ? (stoneThickness === 30 ? 28.5 : stoneThickness === 10 ? 8.5 : 18.5) : 0}
              topStretcher={moduleData.id.includes('lower-top-down-') ? { heightMm: 55, depthMm: 40 } : undefined}
              stoneTopThickness={stoneThickness}
              {...(moduleData.id.includes('lower-door-lift-touch-') ? {
                // 도어올림 터치: 따내기 없음
              } : moduleData.id.includes('lower-top-down-touch-') ? {
                // 상판내림 터치: 상판내림 반통과 동일한 상단 따내기
                sideNotches: [{ y: 65, z: 40, fromBottom: 665 }]
              } : moduleData.id.includes('lower-drawer-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 295 }, { y: 65, z: 40, fromBottom: 510 }]
              } : moduleData.id.includes('lower-drawer-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: (moduleData.dimensions.height - 125) / 2 }]
              } : moduleData.id.includes('lower-door-lift-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 315 }, { y: 65, z: 40, fromBottom: 545 }]
              } : moduleData.id.includes('lower-door-lift-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 355 }]
              } : moduleData.id.includes('lower-top-down-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 225 }, { y: 65, z: 40, fromBottom: 445 }, { y: 65, z: 40, fromBottom: 665 }]
              } : moduleData.id.includes('lower-top-down-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 300 }, { y: 65, z: 40, fromBottom: 665 }]
              } : (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half')) ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 665 }]
              } : {})}>
            {/* 내부 구조는 항상 렌더링 (서랍/선반) */}
            <>
                {/* 듀얼 가구인 경우 좌우 섹션 별도 렌더링 */}
                {baseFurniture.modelConfig.leftSections && baseFurniture.modelConfig.rightSections ? (
                  <>
                    {/* 왼쪽 섹션 - 왼쪽 구획의 중앙에서 왼쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[-(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 - baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.leftSections }}
                        height={adjustedHeight}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                    
                    {/* 중앙 분리대 - BoxWithEdges 사용 */}
                    <BoxWithEdges
                      args={[baseFurniture.basicThickness, adjustedHeight - baseFurniture.basicThickness * 2, baseFurniture.adjustedDepthForShelves]}
                      position={[0, 0, baseFurniture.shelfZOffset]}
                      material={baseFurniture.material}
                      renderMode={renderMode}
                      furnitureId={placedFurnitureId}
                    />
                    
                    {/* 오른쪽 섹션 - 오른쪽 구획의 중앙에서 오른쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 + baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.rightSections }}
                        height={adjustedHeight}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                  </>
                ) : (
                  /* 싱글 가구인 경우 기존 방식 */
                  <SectionsRenderer
                    modelConfig={baseFurniture.modelConfig}
                    height={adjustedHeight}
                    innerWidth={baseFurniture.innerWidth}
                    depth={baseFurniture.depth}
                    adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                    basicThickness={baseFurniture.basicThickness}
                    shelfZOffset={baseFurniture.shelfZOffset}
                    material={baseFurniture.material}
                    furnitureId={moduleData.id}
                    calculateSectionHeight={baseFurniture.calculateSectionHeight}
                    mmToThreeUnits={baseFurniture.mmToThreeUnits}
                    renderMode={renderMode}
                    lowerSectionTopOffsetMm={lowerSectionTopOffset}
                    isFloatingPlacement={isFloating}
                  />
                )}
              </>

          {/* 다보 선반 렌더링 (하부장 반통·한통, 도어올림/상판내림 반통·한통) — 탑뷰에서는 숨김 */}
          {(() => {
            if (viewMode === '2D' && view2DDirection === 'top') return null;
            const moduleId = moduleData.id;
            const isLowerHalf = moduleId.includes('lower-half-cabinet') || moduleId.includes('dual-lower-half-cabinet');
            const isDoorLiftHalf = moduleId.includes('lower-door-lift-half') || moduleId.includes('dual-lower-door-lift-half');
            const isTopDownHalf = moduleId.includes('lower-top-down-half') || moduleId.includes('dual-lower-top-down-half');
            if (!isLowerHalf && !isDoorLiftHalf && !isTopDownHalf) return null;

            const mmToUnits = (mm: number) => mm * 0.01;
            const basicThicknessMm = baseFurniture.basicThickness / 0.01;
            const cabinetHeightMm = adjustedHeight / 0.01;
            const depthMm = baseFurniture.depth / 0.01;
            const backPanelMm = (backPanelThickness || 9);

            let referenceHeightMm: number;
            const hasTopPanel = isDoorLiftHalf || isTopDownHalf;

            if (isTopDownHalf) {
              referenceHeightMm = 665;
            } else if (hasTopPanel) {
              referenceHeightMm = cabinetHeightMm - basicThicknessMm * 2;
            } else {
              referenceHeightMm = cabinetHeightMm - basicThicknessMm;
            }

            const shelfInterval = referenceHeightMm / 3;
            const shelfPositions = [shelfInterval, shelfInterval * 2];

            const shelfThicknessMm = 18;
            const shelfFrontInsetMm = 30; // 앞에서 30mm 들여보냄
            const backReductionMm = backPanelMm + basicThicknessMm - 1; // 26mm (바닥판과 동일)
            const shelfDepthMm = depthMm - backReductionMm - shelfFrontInsetMm;
            const shelfWidth = baseFurniture.innerWidth;
            const shelfDepth = mmToUnits(shelfDepthMm);
            const shelfThickness = mmToUnits(shelfThicknessMm);

            const shelfZ = (mmToUnits(backReductionMm) - mmToUnits(shelfFrontInsetMm)) / 2; // 뒤에서 26mm 줄이고 앞에서 30mm 들여보냄

            const cabinetBottomY = -adjustedHeight / 2;
            const bottomPanelTopY = cabinetBottomY + baseFurniture.basicThickness;

            return shelfPositions.map((posFromBottom, idx) => (
              <BoxWithEdges
                key={`dowel-shelf-${idx}`}
                args={[shelfWidth, shelfThickness, shelfDepth]}
                position={[0, bottomPanelTopY + mmToUnits(posFromBottom), shelfZ]}
                material={baseFurniture.material}
                renderMode={renderMode}
                isHighlighted={false}
                panelName={`다보선반(${idx + 1})`}
                furnitureId={placedFurnitureId}
              />
            ));
          })()}

          </BaseFurnitureShell>

          {/* 하부장 상판 마감재 제거 - 하부모듈에는 상판 없음 */}
          </group>
        </>
      )}
      
      {/* 외부서랍 렌더링 (하부 서랍장 전용) */}
      {showFurniture && !moduleData.id.includes('lower-door-lift-touch-') && !moduleData.id.includes('lower-top-down-touch-') && (moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-top-down-2tier') || moduleData.id.includes('lower-top-down-3tier')) && (() => {
        const is3Tier = moduleData.id.includes('lower-drawer-3tier');
        const isDoorLift3Tier = moduleData.id.includes('lower-door-lift-3tier');
        const isDoorLift2Tier = moduleData.id.includes('lower-door-lift-2tier');
        const isTopDown3Tier = moduleData.id.includes('lower-top-down-3tier');
        const isTopDown2Tier = moduleData.id.includes('lower-top-down-2tier');
        // 기존 서랍장: 상단 따내기 60mm 있음. 2단 fromBottom=330(균등), 3단 fromBottom=295+510
        // 도어올림 3단: fromBottom=315, 545 (1단=315, 따내기65, 2단=165, 따내기65, 3단=175)
        // 도어올림 2단: fromBottom=355
        // 상판내림 3단: fromBottom=225, 445, 665 (1단=225, 따내기65, 2단=155, 따내기65, 3단=155, 따내기65, 상단55)
        // 상판내림 2단: fromBottom=300, 665 (1단=300, 따내기65, 2단=300, 따내기65, 상단55)
        const drawer2TierFromBottom = (moduleData.dimensions.height - 125) / 2;
        const notchFromBottoms = is3Tier ? [295, 510] : isDoorLift3Tier ? [315, 545] : isDoorLift2Tier ? [355] : isTopDown3Tier ? [225, 445, 665] : isTopDown2Tier ? [300, 665] : [drawer2TierFromBottom];
        const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : isTopDown3Tier ? [65, 65, 65] : isTopDown2Tier ? [65, 65] : [65];
        const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <ExternalDrawerRenderer
              drawerCount={drawerCount}
              moduleWidth={adjustedWidth || moduleData.dimensions.width}
              innerWidth={baseFurniture.innerWidth}
              height={adjustedHeight}
              depth={baseFurniture.depth}
              basicThickness={baseFurniture.basicThickness}
              moduleDepthMm={baseFurniture.actualDepthMm}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              textureUrl={spaceInfo?.materialConfig?.texture}
              doorTextureUrl={spaceInfo?.materialConfig?.doorTexture}
              doorColor={baseFurniture.doorColor}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              showMaida={hasDoor}
              notchFromBottoms={notchFromBottoms}
              notchHeights={notchHeights}
              isEditMode={isEditMode}
              hideTopNotch={isDoorLift2Tier || isDoorLift3Tier || isTopDown2Tier || isTopDown3Tier}
              maidaHeightsMm={isDoorLift2Tier ? [400, 400] : isDoorLift3Tier ? [360, 210, 210] : undefined}
              sideHeightOverrides={isTopDown2Tier ? { all: 240 } : isTopDown3Tier ? { first: 180, rest: 130 } : undefined}
              doorTopGap={doorTopGap}
              doorBottomGap={doorBottomGap}
              defaultDoorTopGap={isTopDown2Tier || isTopDown3Tier ? -80 : isDoorLift2Tier || isDoorLift3Tier ? 30 : -20}
              defaultDoorBottomGap={5}
            />
          </group>
        );
      })()}

      {/* 상판내림 반통/한통: L자 프레임만 렌더링 (서랍 없음, 도어는 별도) — 하부프레임 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half') || moduleData.id.includes('lower-top-down-touch-') || moduleData.id.includes('dual-lower-top-down-touch-')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const notch = { fromBottom: 665, height: 65 };
        const basicThicknessMm = baseFurniture.basicThickness / 0.01;
        const frameWidth = mmToThreeUnits(adjustedWidth || moduleData.dimensions.width);
        const verticalHMm = notch.height - basicThicknessMm;
        const cabinetBottomY = -adjustedHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + baseFurniture.basicThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + baseFurniture.basicThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + baseFurniture.basicThickness / 2;

        return (
          <group position={[0, 0, 0]}>
            <BoxWithEdges
              args={[frameWidth, baseFurniture.basicThickness, mmToThreeUnits(40)]}
              position={[0, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[frameWidth, mmToThreeUnits(verticalHMm), baseFurniture.basicThickness]}
              position={[0, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 기본하부장/싱크장/인덕션장 반통/한통: 상단 따내기 L자 프레임 렌더링 — 하부프레임 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet') || moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const notchHeightMm = 60;
        const notchFromBottomMm = (moduleData.dimensions.height || 785) - notchHeightMm;
        const basicThicknessMm = baseFurniture.basicThickness / 0.01;
        const frameWidth = mmToThreeUnits(adjustedWidth || moduleData.dimensions.width);
        const verticalHMm = notchHeightMm - basicThicknessMm;
        const cabinetBottomY = -cabinetHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + baseFurniture.basicThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + baseFurniture.basicThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + baseFurniture.basicThickness / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <BoxWithEdges
              args={[frameWidth, baseFurniture.basicThickness, mmToThreeUnits(40)]}
              position={[0, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[frameWidth, mmToThreeUnits(verticalHMm), baseFurniture.basicThickness]}
              position={[0, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 싱크장/인덕션장 전대 렌더링 — 상단 따내기 아래 높이 150mm — 하부프레임 OFF 시 숨김 */}
      {showFurniture && hasBase !== false && (moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const cabinetBottomY = -cabinetHeight / 2;
        const apronHeightMm = 150;
        const notchHeightMm = 60;
        const notchFromBottomMm = (moduleData.dimensions.height || 785) - notchHeightMm;
        // 전대 상단 = 따내기 시작점(notchFromBottomMm), 전대 하단 = notchFromBottomMm - apronHeightMm
        const apronCenterY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm - apronHeightMm / 2);
        const apronWidth = baseFurniture.innerWidth; // 내경 (전체폭 - 측판두께×2)
        const apronHeight = mmToThreeUnits(apronHeightMm);
        const apronThickness = baseFurniture.basicThickness; // 18mm
        // 전대는 캐비넷 앞면에 위치
        const apronZ = baseFurniture.depth / 2 - apronThickness / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <BoxWithEdges
              args={[apronWidth, apronHeight, apronThickness]}
              position={[0, apronCenterY, apronZ]}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="전대"
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 인덕션장 블럼 레그라박스 서랍 + 마이다 (인출 애니메이션 + 2D V자 점선 포함) */}
      {(moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) && (showFurniture || hasDoor) && (
        <InductionDrawerAnimated
          moduleId={moduleData.id}
          moduleHeightMm={moduleData.dimensions.height || 785}
          adjustedHeight={adjustedHeight}
          adjustedWidth={adjustedWidth || moduleData.dimensions.width}
          basicThickness={baseFurniture.basicThickness}
          furnitureDepth={baseFurniture.depth}
          furnitureMaterial={baseFurniture.material}
          doorMaterial={lFrameDoorMaterial}
          backPanelThicknessProp={backPanelThickness}
          renderMode={renderMode}
          cabinetYPosition={cabinetYPosition}
          placedFurnitureId={placedFurnitureId}
          showFurniture={showFurniture}
          hasDoor={hasDoor}
          panelGrainDirections={panelGrainDirections}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
        />
      )}

      {/* 터치 레그라박스 서랍 + 마이다 (도어올림 터치 + 상판내림 터치) — 인출 애니메이션 포함 */}
      {(moduleData.id.includes('lower-door-lift-touch-') || moduleData.id.includes('lower-top-down-touch-')) && (showFurniture || hasDoor) && (
        <TouchDrawerAnimated
          moduleId={moduleData.id}
          moduleHeightMm={moduleData.dimensions.height || 785}
          adjustedHeight={adjustedHeight}
          adjustedWidth={adjustedWidth || moduleData.dimensions.width}
          basicThickness={baseFurniture.basicThickness}
          furnitureDepth={baseFurniture.depth}
          furnitureMaterial={baseFurniture.material}
          doorMaterial={lFrameDoorMaterial}
          backPanelThicknessProp={backPanelThickness}
          renderMode={renderMode}
          cabinetYPosition={cabinetYPosition}
          placedFurnitureId={placedFurnitureId}
          showFurniture={showFurniture}
          hasDoor={hasDoor}
          panelGrainDirections={panelGrainDirections}
        />
      )}

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {/* 단, 서랍장(lower-drawer-*)은 도어가 아닌 서랍이 달리므로 도어 렌더링 차단 */}
      {hasDoor && spaceInfo && !moduleData.id.includes('lower-drawer-') && !moduleData.id.includes('lower-door-lift-2tier') && !moduleData.id.includes('lower-door-lift-3tier') && !moduleData.id.includes('lower-door-lift-touch-') && !moduleData.id.includes('lower-top-down-2tier') && !moduleData.id.includes('lower-top-down-3tier') && !moduleData.id.includes('lower-top-down-touch-') && !moduleData.id.includes('lower-induction-cabinet') && !moduleData.id.includes('dual-lower-induction-cabinet') && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          moduleData={moduleData}
          isDragging={isDragging}
          isEditMode={isEditMode}
          slotWidths={slotWidths}
          slotIndex={slotIndex}
          floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? floatHeight : 0}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          zone={zone}
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
          parentGroupY={parentGroupY}
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
        />
      )}

      {/* 인조대리석 상판 — 상판내림은 졸리컷 L자, 그 외는 단순 박스 (탑뷰에서는 숨김) */}
      {showFurniture && stoneTopData && stoneTopMaterial && !isTopDown && !(viewMode === '2D' && view2DDirection === 'top') && (
        <BoxWithEdges
          args={[stoneTopData.width, stoneTopData.thickness, stoneTopData.depth]}
          position={[
            stoneTopData.xOffset,
            cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness / 2,
            stoneTopData.zOffset
          ]}
          material={stoneTopMaterial}
          renderMode={renderMode}
          panelName="인조대리석 상판"
        />
      )}

      {/* 인조대리석 뒷턱 (back lip) — 상판 뒤쪽 수직판 */}
      {/* 2D 정면뷰에서는 상판과 같은 Z(중심)에 배치하여 정면에서 보이게 함 */}
      {showFurniture && stoneTopData && stoneTopData.backLipHeight > 0 && stoneTopMaterial && !(viewMode === '2D' && view2DDirection === 'top') && (
        stoneTopData.backLipDepthOffset > 0 ? (
          <>
            {/* 수직 측판 (현재 사용자가 설정한 뒷턱 높이 적용) */}
            <BoxWithEdges
              args={[stoneTopData.width, stoneTopData.backLipHeight - stoneTopData.backLipThickness, stoneTopData.backLipThickness]}
              position={[
                stoneTopData.xOffset,
                cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + (stoneTopData.backLipHeight - stoneTopData.backLipThickness) / 2,
                (is2DMode && view2DDirection === 'front')
                  ? stoneTopData.zOffset
                  : stoneTopData.zOffset - stoneTopData.depth / 2 + stoneTopData.backLipThickness / 2 + stoneTopData.backLipDepthOffset
              ]}
              material={stoneTopMaterial}
              renderMode={renderMode}
              panelName="인조대리석 뒷턱 전면부"
            />
            {/* 수평 덮개판 (뒷벽까지 채움 + 상판 앞뒤 돌출 반영, 높이는 젠다이 상단 기준) */}
            <BoxWithEdges
              args={[stoneTopData.width, stoneTopData.backLipThickness, stoneTopData.backLipDepthOffset + stoneTopData.backLipThickness + stoneTopData.backLipTopOffset + stoneTopData.backLipTopBackOffset]}
              position={[
                stoneTopData.xOffset,
                cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + stoneTopData.backLipHeight - stoneTopData.backLipThickness / 2,
                (is2DMode && view2DDirection === 'front')
                  ? stoneTopData.zOffset
                  : stoneTopData.zOffset - stoneTopData.depth / 2 + (stoneTopData.backLipDepthOffset + stoneTopData.backLipThickness + stoneTopData.backLipTopOffset - stoneTopData.backLipTopBackOffset) / 2
              ]}
              material={stoneTopMaterial}
              renderMode={renderMode}
              panelName="인조대리석 뒷턱 상단부"
            />
            {/* 다채움인 경우, Main Stone Top에서부터 올라가는 뒷벽 추가 대리석 패널 (후면 미드웨이 전체) */}
            {stoneTopData.backLipFullFill && stoneTopData.backLipFillHeight > 0 && (
              <BoxWithEdges
                args={[stoneTopData.width, stoneTopData.backLipFillHeight, stoneTopData.backLipThickness]}
                position={[
                  stoneTopData.xOffset,
                  cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + stoneTopData.backLipFillHeight / 2,
                  (is2DMode && view2DDirection === 'front')
                    ? stoneTopData.zOffset
                    : stoneTopData.zOffset - stoneTopData.depth / 2 + stoneTopData.backLipThickness / 2 // 가장 뒷벽에 밀착
                ]}
                material={stoneTopMaterial}
                renderMode={renderMode}
                panelName="인조대리석 벽체 미드웨이"
              />
            )}
          </>
        ) : (
          /* 기존 (단일 뒷턱) - 다채움인 경우 전체 높이(backLipFillHeight)로 렌더링 */
          <BoxWithEdges
            args={[
              stoneTopData.width, 
              (stoneTopData.backLipFullFill && stoneTopData.backLipFillHeight > 0) ? stoneTopData.backLipFillHeight : stoneTopData.backLipHeight, 
              stoneTopData.backLipThickness
            ]}
            position={[
              stoneTopData.xOffset,
              cabinetYPosition + adjustedHeight / 2 + stoneTopData.thickness + ((stoneTopData.backLipFullFill && stoneTopData.backLipFillHeight > 0) ? stoneTopData.backLipFillHeight : stoneTopData.backLipHeight) / 2,
              (is2DMode && view2DDirection === 'front')
                ? stoneTopData.zOffset
                : stoneTopData.zOffset - stoneTopData.depth / 2 + stoneTopData.backLipThickness / 2 + stoneTopData.backLipDepthOffset
            ]}
            material={stoneTopMaterial}
            renderMode={renderMode}
            panelName="인조대리석 뒷턱"
          />
        )
      )}

      {/* 상판내림: 졸리컷 L자 (수평판 + 수직 앞판) — 탑뷰에서는 숨김 */}
      {showFurniture && stoneTopData && stoneTopMaterial && isTopDown && !(viewMode === '2D' && view2DDirection === 'top') && (() => {
        const t = stoneTopData.thickness;
        const absDoorTopGap = Math.abs(doorTopGap ?? -80);
        const doorGapMm = 20;
        const frontPlateH = (absDoorTopGap - doorGapMm) * 0.01;
        const cabinetTopY = cabinetYPosition + adjustedHeight / 2;
        // 수평판: 중심Y = 캐비넷 상단 + 두께/2
        const hPosY = cabinetTopY + t / 2;
        // 수직 앞판: 높이 = frontPlateH + t (45도면 겹침 포함)
        // 상단 = cabinetTopY + t (수평판 상면과 동일)
        const vTotalH = frontPlateH + t;
        const vPosY = cabinetTopY + t - vTotalH / 2;
        // 수직 앞판 Z: 앞면 = 수평판 앞면
        const frontZ = stoneTopData.zOffset + stoneTopData.depth / 2;
        const vPosZ = frontZ - t / 2;
        return (
          <>
            <JollyCutHorizontalPlate
              width={stoneTopData.width}
              thickness={t}
              depth={stoneTopData.depth}
              position={[stoneTopData.xOffset, hPosY, stoneTopData.zOffset]}
              material={stoneTopMaterial}
              renderMode={renderMode}
            />
            <JollyCutVerticalPlate
              width={stoneTopData.width}
              height={vTotalH}
              thickness={t}
              position={[stoneTopData.xOffset, vPosY, vPosZ]}
              material={stoneTopMaterial}
              renderMode={renderMode}
            />
          </>
        );
      })()}

      {/* 조절발통 (네 모서리) - 키큰장과 동일하게 처리 */}
      {showFurniture && !(lowerSectionTopOffset && lowerSectionTopOffset > 0) && (
        <AdjustableFootsRenderer
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width}
          depth={baseFurniture.depth}
          yOffset={-adjustedHeight / 2}
          placedFurnitureId={placedFurnitureId}
          renderMode={renderMode}
          isHighlighted={false}
          isFloating={isFloating}
          baseHeight={spaceInfo?.baseConfig?.height || 65}
          baseDepth={spaceInfo?.baseConfig?.depth || 0}
          frontZInset={65}
          viewMode={viewMode}
          view2DDirection={useUIStore.getState().view2DDirection}
        />
      )}
    </>
  );
};

export default LowerCabinet;
