import React, { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { CustomFurnitureConfig, CustomElement, CustomSection } from '@/editor/shared/furniture/types';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { SettingsIcon } from '@/components/common/Icons';

interface CustomizableBoxModuleProps {
  width: number;   // mm
  height: number;  // mm
  depth: number;   // mm
  customConfig: CustomFurnitureConfig;
  color?: string;
  isDragging?: boolean;
  isEditMode?: boolean;
  showFurniture?: boolean;
  isHighlighted?: boolean;
  placedFurnitureId?: string;
  category?: 'full' | 'upper' | 'lower';
  panelGrainDirections?: { [key: string]: 'horizontal' | 'vertical' };
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onDoubleClick?: (e: any) => void;
}

// mm → Three.js units
const mm = (val: number) => val * 0.01;

/**
 * 커스터마이징 가구 3D 렌더링 컴포넌트
 *
 * 기존 BaseFurnitureShell과 동일한 체결 구조:
 * - 측판(좌/우): 전체 높이, 전체 깊이 (구조체)
 * - 상판/하판: 측판 사이에 끼워넣기, 깊이 26mm 줄임, 좌우 0.5mm씩 줄임
 * - 백패널: 9mm 두께, 측판보다 넓게 (innerW + 10mm), 뒤쪽 배치
 *
 * 1단(분할 없음): 하나의 박스 프레임 + 내부 요소
 * 2단 분할: 독립된 하부장 박스 + 독립된 상부장 박스 (각각 동일 체결 구조)
 */
const CustomizableBoxModule: React.FC<CustomizableBoxModuleProps> = ({
  width,
  height,
  depth,
  customConfig,
  color,
  category = 'full',
  isDragging = false,
  isEditMode = false,
  showFurniture = true,
  isHighlighted = false,
  placedFurnitureId,
  panelGrainDirections,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerOver,
  onPointerOut,
  onDoubleClick,
}) => {
  const { renderMode } = useSpace3DView();
  const { spaceInfo } = useSpaceConfigStore();
  const { theme } = useTheme();
  const viewMode = useUIStore(state => state.viewMode);
  const view2DDirection = useUIStore(state => state.view2DDirection);

  const panelThickness = customConfig.panelThickness || 18; // mm
  const t = mm(panelThickness); // Three.js 단위
  const backPanelThicknessMm = 9; // 백패널 9mm
  const backPanelT = mm(backPanelThicknessMm);
  const backReductionMm = 26; // 상/하판 깊이 줄임 (백패널 영역)
  const backReduction = mm(backReductionMm);
  const widthReductionMm = 1; // 좌우 0.5mm씩 줄임
  const widthReduction = mm(widthReductionMm);
  const backPanelWidthExtMm = 10; // 백패널 너비 확장 (좌우 5mm씩)
  const backPanelHeightExtMm = 26; // 백패널 높이 확장 (상하 13mm씩)
  const backPanelDepthOffsetMm = 17; // 백패널 뒤쪽에서의 오프셋

  // Three.js 단위 치수
  const W = mm(width);
  const H = mm(height);
  const D = mm(depth);

  // 내부 너비 (측판 두께 제외) - 기존 BaseFurnitureShell과 동일
  const innerW = W - 2 * t;
  const innerWidthMm = width - 2 * panelThickness;

  // 재질 설정
  const materialConfig = spaceInfo.materialConfig || {
    interiorColor: '#FFFFFF',
    doorColor: '#E0E0E0',
  };

  const getThemeColor = () => {
    const themeColorMap: Record<string, string> = {
      blue: '#3b82f6', purple: '#8b5cf6', green: '#10b981', orange: '#f59e0b',
      red: '#ef4444', pink: '#ec4899', teal: '#14b8a6', indigo: '#6366f1',
      amber: '#d97706', emerald: '#059669', rose: '#f43f5e', cyan: '#06b6d4',
      copper: '#AD4F34', forest: '#1B3924', olive: '#4C462C',
    };
    return themeColorMap[theme.color] || '#3b82f6';
  };

  const furnitureColor = (isDragging || isEditMode) ? getThemeColor() : (
    color || materialConfig.interiorColor || '#D4C5A9'
  );

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(furnitureColor),
      roughness: 0.7,
      metalness: 0.1,
    });
  }, [furnitureColor]);

  // 메탈 재질 (옷봉 등)
  const metalMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#C0C0C0'),
      roughness: 0.3,
      metalness: 0.8,
    });
  }, []);

  const sections = customConfig.sections;
  const isSplit = sections.length >= 2;

  // 섹션 옵션 아이콘 상태
  const showDimensions = useUIStore(state => state.showDimensions);
  const showFurnitureEditHandles = useUIStore(state => state.showFurnitureEditHandles);
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);

  const showSectionIcons = showFurnitureEditHandles && showDimensions
    && viewMode === '3D' && !isDragging && showFurniture;

  // 섹션 아이콘 렌더링 함수
  const renderSectionIcon = (
    key: string,
    posX: number,    // Three.js
    posY: number,    // Three.js (박스 중심 Y)
    posZ: number,    // Three.js
  ) => {
    const isHov = hoveredIcon === key;
    const themeColor = getThemeColor();
    return (
      <Html
        key={`icon-${key}`}
        position={[posX, posY, posZ]}
        center
        style={{
          userSelect: 'none',
          pointerEvents: 'auto',
          zIndex: 100,
          background: 'transparent',
        }}
      >
        <div
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            border: `2px solid ${themeColor}`,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.92)',
            transition: 'all 0.2s ease',
            opacity: isHov ? 1 : 0.7,
            transform: isHov ? 'scale(1.15)' : 'scale(1)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isEditMode) {
              useUIStore.getState().closeAllPopups();
            } else if (onDoubleClick) {
              onDoubleClick(e as any);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredIcon(key)}
          onMouseLeave={() => setHoveredIcon(null)}
          title="섹션 편집"
        >
          <SettingsIcon color={themeColor} size={14} />
        </div>
      </Html>
    );
  };

  // 섹션별 아이콘 목록 생성
  const renderSectionIcons = () => {
    if (!showSectionIcons) return null;

    const icons: React.ReactNode[] = [];
    const frontZ = D / 2 + 0.1; // 가구 앞면 바로 앞

    if (isSplit) {
      // 2단 분할: 각 섹션마다 아이콘
      const lowerH = mm(sections[0].height + 2 * panelThickness);
      const upperH = mm(sections[1].height + 2 * panelThickness);
      const lowerCenterY = -H / 2 + lowerH / 2;
      const upperCenterY = -H / 2 + lowerH + upperH / 2;

      // 하부 섹션 아이콘
      const lowerInnerW = W - 2 * t;
      if (sections[0].hasPartition && sections[0].partitionPosition) {
        const partX = -lowerInnerW / 2 + mm(sections[0].partitionPosition);
        const leftCenterX = (-lowerInnerW / 2 + partX - t / 2) / 2;
        const rightCenterX = (partX + t / 2 + lowerInnerW / 2) / 2;
        icons.push(renderSectionIcon('lower-left', leftCenterX, lowerCenterY, frontZ));
        icons.push(renderSectionIcon('lower-right', rightCenterX, lowerCenterY, frontZ));
      } else {
        icons.push(renderSectionIcon('lower', 0, lowerCenterY, frontZ));
      }

      // 상부 섹션 아이콘
      if (sections[1].hasPartition && sections[1].partitionPosition) {
        const partX = -lowerInnerW / 2 + mm(sections[1].partitionPosition);
        const leftCenterX = (-lowerInnerW / 2 + partX - t / 2) / 2;
        const rightCenterX = (partX + t / 2 + lowerInnerW / 2) / 2;
        icons.push(renderSectionIcon('upper-left', leftCenterX, upperCenterY, frontZ));
        icons.push(renderSectionIcon('upper-right', rightCenterX, upperCenterY, frontZ));
      } else {
        icons.push(renderSectionIcon('upper', 0, upperCenterY, frontZ));
      }
    } else {
      // 1단(분할 없음): 단일 아이콘 또는 칸막이 좌/우
      if (sections[0]?.hasPartition && sections[0]?.partitionPosition) {
        const partX = -innerW / 2 + mm(sections[0].partitionPosition);
        const leftCenterX = (-innerW / 2 + partX - t / 2) / 2;
        const rightCenterX = (partX + t / 2 + innerW / 2) / 2;
        icons.push(renderSectionIcon('single-left', leftCenterX, 0, frontZ));
        icons.push(renderSectionIcon('single-right', rightCenterX, 0, frontZ));
      } else {
        icons.push(renderSectionIcon('single', 0, 0, frontZ));
      }
    }

    return icons;
  };

  if (!showFurniture) return null;

  // 내부 요소 렌더링 함수 (선반/서랍/옷봉)
  const renderElements = (
    elements: CustomElement[],
    areaWidthMm: number,  // mm (요소가 차지할 너비)
    _areaHeightMm: number, // mm
    offsetX: number,       // Three.js 단위 (요소 중심 X)
    baseY: number,         // Three.js 단위 (요소 시작 Y = 하판 윗면)
    boxD: number,          // Three.js 단위 (박스 깊이)
    boxInnerD: number,     // Three.js 단위 (내부 깊이 = 깊이 - 백패널영역)
    keyPrefix: string,
  ) => {
    const meshes: React.ReactNode[] = [];
    const aW = mm(areaWidthMm);

    elements.forEach((el, elIdx) => {
      const key = `${keyPrefix}-el-${elIdx}`;

      if (el.type === 'shelf') {
        el.heights.forEach((shelfH, si) => {
          const shelfY = baseY + mm(shelfH);
          meshes.push(
            <BoxWithEdges
              key={`${key}-shelf-${si}`}
              args={[aW, t, boxInnerD]}
              position={[offsetX, shelfY, backReduction / 2]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
              isHighlighted={isHighlighted}
              panelName={`선반${si + 1}`}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          );
        });
      } else if (el.type === 'drawer') {
        let currentY = baseY;
        const drawerGap = mm(3);
        const drawerFrontThickness = t;

        el.heights.forEach((drawerH, di) => {
          const dH = mm(drawerH);
          const frontY = currentY + dH / 2;
          meshes.push(
            <BoxWithEdges
              key={`${key}-drawer-${di}`}
              args={[aW - mm(4), dH - drawerGap, drawerFrontThickness]}
              position={[offsetX, frontY, boxD / 2 - drawerFrontThickness / 2]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
              isHighlighted={isHighlighted}
              panelName={`서랍${di + 1}`}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          );
          currentY += dH;
        });
      } else if (el.type === 'rod') {
        const rodY = baseY + mm(el.height);
        const rodRadius = mm(12);
        meshes.push(
          <mesh
            key={`${key}-rod`}
            position={[offsetX, rodY, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[rodRadius, rodRadius, aW, 16]} />
            <primitive object={metalMaterial} attach="material" />
          </mesh>
        );
        const bracketSize = mm(20);
        [-1, 1].forEach((side, bi) => {
          meshes.push(
            <BoxWithEdges
              key={`${key}-rod-bracket-${bi}`}
              args={[bracketSize, bracketSize, mm(4)]}
              position={[offsetX + side * (aW / 2 - bracketSize / 2), rodY, boxInnerD / 2 - mm(2)]}
              material={metalMaterial}
              renderMode={renderMode}
              isDragging={isDragging}
              panelName={`봉브라켓${bi + 1}`}
              furnitureId={placedFurnitureId}
            />
          );
        });
      }
    });

    return meshes;
  };

  /**
   * 독립 박스 렌더링 (기존 BaseFurnitureShell 체결 구조)
   *
   * 체결 순서:
   * 1. 측판(좌/우) - 전체 높이, 전체 깊이 (구조체 역할)
   * 2. 상판/하판 - 측판 사이에 끼워넣기 (innerW - 1mm, 깊이 -26mm)
   * 3. 백패널 - 9mm, 뒤쪽에서 측판 홈에 끼움 (innerW + 10mm)
   *
   * centerY: 박스 중심 Y 위치 (Three.js 단위)
   * boxH: 박스 외곽 높이 (Three.js 단위)
   */
  const renderBox = (
    section: CustomSection,
    sIdx: number,
    boxW: number,     // Three.js (= W, 측판 포함 전체 너비)
    boxH: number,     // Three.js (외곽 높이)
    boxD: number,     // Three.js (= D, 전체 깊이)
    centerY: number,  // Three.js (박스 중심 Y)
  ) => {
    const meshes: React.ReactNode[] = [];
    const bInnerW = boxW - 2 * t; // 측판 사이 내부 너비
    const bInnerH = boxH - 2 * t; // 상/하판 사이 내부 높이
    const prefix = `box-${sIdx}`;
    const sectionLabel = sIdx === 0 ? '하부' : '상부';

    // ═══════════════════════════════════════
    // 1. 측판 (좌/우) - 전체 높이, 전체 깊이
    // ═══════════════════════════════════════
    // 좌측판: 측판은 innerW 바깥에 위치
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-left`}
        args={[t, boxH, boxD]}
        position={[-bInnerW / 2 - t / 2, centerY, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}좌측판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );
    // 우측판
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-right`}
        args={[t, boxH, boxD]}
        position={[bInnerW / 2 + t / 2, centerY, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}우측판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );

    // ═══════════════════════════════════════
    // 2. 상판/하판 - 측판 사이에 끼워넣기
    //    너비: innerW - 1mm (좌우 0.5mm 유격)
    //    깊이: D - 26mm (뒤쪽 백패널 영역 확보)
    //    Z: 앞쪽 고정, 뒤쪽 줄임 → +backReduction/2
    // ═══════════════════════════════════════
    // 상판
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-top`}
        args={[bInnerW - widthReduction, t, boxD - backReduction]}
        position={[0, centerY + boxH / 2 - t / 2, backReduction / 2]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}상판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );
    // 하판(바닥판)
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-bottom`}
        args={[bInnerW - widthReduction, t, boxD - backReduction]}
        position={[0, centerY - boxH / 2 + t / 2, backReduction / 2]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}바닥판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );

    // ═══════════════════════════════════════
    // 3. 백패널 - 9mm, 측판보다 넓게 (innerW + 10mm)
    //    높이: innerH + 26mm (상하 13mm씩 확장)
    //    Z: 뒤쪽에서 17mm 오프셋
    // ═══════════════════════════════════════
    const backPanelH = bInnerH + mm(backPanelHeightExtMm);
    const backPanelW = bInnerW + mm(backPanelWidthExtMm);
    const backPanelZ = -boxD / 2 + backPanelT / 2 + mm(backPanelDepthOffsetMm);

    meshes.push(
      <BoxWithEdges
        key={`${prefix}-back`}
        args={[backPanelW, backPanelH, backPanelT]}
        position={[0, centerY, backPanelZ]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        isBackPanel
        panelName={`${sectionLabel}백패널`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );

    // ═══════════════════════════════════════
    // 4. 내부 요소 (칸막이, 선반, 서랍, 옷봉)
    // ═══════════════════════════════════════
    if (!isDragging || isEditMode) {
      const baseY = centerY - boxH / 2 + t; // 하판 윗면
      const innerD = boxD - backReduction; // 내부 유효 깊이

      if (section.hasPartition && section.partitionPosition) {
        const partPos = mm(section.partitionPosition);
        const partitionX = -bInnerW / 2 + partPos;

        // 칸막이 수직 패널
        const sectionH = mm(section.height);
        meshes.push(
          <BoxWithEdges
            key={`${prefix}-partition`}
            args={[t, sectionH, innerD]}
            position={[partitionX, centerY, backReduction / 2]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isHighlighted={isHighlighted}
            panelName={`칸막이${sIdx}`}
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
        );

        // 좌측 영역
        const leftWidthMm = section.partitionPosition - panelThickness;
        const leftCenterX = -bInnerW / 2 + mm(leftWidthMm) / 2;
        if (section.leftElements && section.leftElements.length > 0) {
          meshes.push(
            ...renderElements(section.leftElements, leftWidthMm, section.height, leftCenterX, baseY, boxD, innerD, `${prefix}-left-el`)
          );
        }

        // 우측 영역
        const rightWidthMm = innerWidthMm - section.partitionPosition - panelThickness;
        const rightCenterX = partitionX + t / 2 + mm(rightWidthMm) / 2;
        if (section.rightElements && section.rightElements.length > 0) {
          meshes.push(
            ...renderElements(section.rightElements, rightWidthMm, section.height, rightCenterX, baseY, boxD, innerD, `${prefix}-right-el`)
          );
        }
      } else {
        // 칸막이 없는 경우
        if (section.elements && section.elements.length > 0) {
          meshes.push(
            ...renderElements(section.elements, innerWidthMm, section.height, 0, baseY, boxD, innerD, prefix)
          );
        }
      }
    }

    return meshes;
  };

  return (
    <group
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onDoubleClick={onDoubleClick}
    >
      {isSplit ? (
        <>
          {/* 2단 분할: 하부장(section[0]) + 상부장(section[1]) 각각 독립 박스 */}
          {(() => {
            // 각 박스의 외곽 높이 = 섹션 내부 높이 + 상/하판 두께 (2 * panelThickness)
            const lowerH = mm(sections[0].height + 2 * panelThickness);
            const upperH = mm(sections[1].height + 2 * panelThickness);

            // 하부장: 전체 높이의 하단부터
            const lowerCenterY = -H / 2 + lowerH / 2;
            // 상부장: 하부장 위에 얹힘
            const upperCenterY = -H / 2 + lowerH + upperH / 2;

            return (
              <>
                {renderBox(sections[0], 0, W, lowerH, D, lowerCenterY)}
                {renderBox(sections[1], 1, W, upperH, D, upperCenterY)}
              </>
            );
          })()}
        </>
      ) : (
        <>
          {/* 1단(분할 없음): 단일 박스 프레임 */}
          {/* ═══ 측판 (좌/우) - 전체 높이, 전체 깊이 ═══ */}
          <BoxWithEdges
            args={[t, H, D]}
            position={[-innerW / 2 - t / 2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isHighlighted={isHighlighted}
            panelName="좌측판"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
          <BoxWithEdges
            args={[t, H, D]}
            position={[innerW / 2 + t / 2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isHighlighted={isHighlighted}
            panelName="우측판"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />

          {/* ═══ 상판 - 측판 사이에 끼워넣기 ═══ */}
          <BoxWithEdges
            args={[innerW - widthReduction, t, D - backReduction]}
            position={[0, H / 2 - t / 2, backReduction / 2]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isHighlighted={isHighlighted}
            panelName="상판"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />

          {/* ═══ 하판(바닥판) - 측판 사이에 끼워넣기 ═══ */}
          <BoxWithEdges
            args={[innerW - widthReduction, t, D - backReduction]}
            position={[0, -H / 2 + t / 2, backReduction / 2]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isHighlighted={isHighlighted}
            panelName="바닥판"
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />

          {/* ═══ 백패널 - 9mm, 측판보다 넓게, 뒤쪽 배치 ═══ */}
          {(() => {
            const innerH = H - 2 * t;
            const bpH = innerH + mm(backPanelHeightExtMm);
            const bpW = innerW + mm(backPanelWidthExtMm);
            const bpZ = -D / 2 + backPanelT / 2 + mm(backPanelDepthOffsetMm);
            return (
              <BoxWithEdges
                args={[bpW, bpH, backPanelT]}
                position={[0, 0, bpZ]}
                material={material}
                renderMode={renderMode}
                isDragging={isDragging}
                isHighlighted={isHighlighted}
                isBackPanel
                panelName="백패널"
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId}
              />
            );
          })()}

          {/* ═══ 내부 요소 ═══ */}
          {(!isDragging || isEditMode) && sections[0] && (() => {
            const baseY = -H / 2 + t;
            const innerD = D - backReduction;
            const section = sections[0];

            if (section.hasPartition && section.partitionPosition) {
              const partPos = mm(section.partitionPosition);
              const partitionX = -innerW / 2 + partPos;
              const sectionH = mm(section.height);

              return (
                <>
                  {/* 칸막이 */}
                  <BoxWithEdges
                    args={[t, sectionH, innerD]}
                    position={[partitionX, 0, backReduction / 2]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isHighlighted}
                    panelName="칸막이"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                  />
                  {section.leftElements && section.leftElements.length > 0 &&
                    renderElements(
                      section.leftElements,
                      section.partitionPosition - panelThickness,
                      section.height,
                      -innerW / 2 + mm(section.partitionPosition - panelThickness) / 2,
                      baseY, D, innerD, 'single-left'
                    )
                  }
                  {section.rightElements && section.rightElements.length > 0 &&
                    renderElements(
                      section.rightElements,
                      innerWidthMm - section.partitionPosition - panelThickness,
                      section.height,
                      partitionX + t / 2 + mm(innerWidthMm - section.partitionPosition - panelThickness) / 2,
                      baseY, D, innerD, 'single-right'
                    )
                  }
                </>
              );
            } else if (section.elements && section.elements.length > 0) {
              return renderElements(section.elements, innerWidthMm, section.height, 0, baseY, D, innerD, 'single');
            }
            return null;
          })()}
        </>
      )}

      {/* 섹션별 옵션 아이콘 */}
      {renderSectionIcons()}

      {/* 조절발 (upper가 아닌 경우) */}
      {showFurniture && category !== 'upper' && (
        <AdjustableFootsRenderer
          width={W}
          depth={D}
          yOffset={-H / 2}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
          isFloating={spaceInfo.baseConfig?.placementType === 'float'}
          baseHeight={spaceInfo.baseConfig?.height || 65}
          baseDepth={spaceInfo.baseConfig?.depth || 0}
          viewMode={viewMode}
          view2DDirection={view2DDirection}
        />
      )}
    </group>
  );
};

export default CustomizableBoxModule;
