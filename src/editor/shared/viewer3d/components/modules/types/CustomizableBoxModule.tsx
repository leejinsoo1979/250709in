import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CustomFurnitureConfig, CustomElement } from '@/editor/shared/furniture/types';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';

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
 * customConfig 데이터를 기반으로 내부 구조를 Three.js mesh로 렌더링
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
  const t = mm(panelThickness);

  // Three.js 단위 치수
  const W = mm(width);
  const H = mm(height);
  const D = mm(depth);

  // 내부 공간 치수 (외곽 패널 두께 제외)
  const innerW = W - 2 * t;
  const innerH = H - 2 * t;
  const innerD = D - t; // 백패널 두께 제외 (앞면 오픈)

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

  if (!showFurniture) return null;

  // 내부 요소 렌더링 함수
  const renderElements = (
    elements: CustomElement[],
    areaWidth: number,    // mm (내부 영역 너비)
    _areaHeight: number,  // mm (내부 영역 높이, 참조용)
    offsetX: number,      // Three.js 단위 (영역 중심 X 오프셋)
    baseY: number,        // Three.js 단위 (영역 바닥 Y 위치)
  ) => {
    const meshes: React.ReactNode[] = [];
    const aW = mm(areaWidth);

    elements.forEach((el, elIdx) => {
      const key = `el-${elIdx}`;

      if (el.type === 'shelf') {
        // 선반: 수평 패널
        el.heights.forEach((shelfH, si) => {
          const shelfY = baseY + mm(shelfH);
          meshes.push(
            <BoxWithEdges
              key={`${key}-shelf-${si}`}
              args={[aW, t, innerD]}
              position={[offsetX, shelfY, t / 2]}
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
        // 서랍: 전면부 패널들
        let currentY = baseY;
        const drawerGap = mm(3); // 서랍 간 간격
        const drawerFrontThickness = t;

        el.heights.forEach((drawerH, di) => {
          const dH = mm(drawerH);
          const frontY = currentY + dH / 2;
          // 서랍 전면부
          meshes.push(
            <BoxWithEdges
              key={`${key}-drawer-${di}`}
              args={[aW - mm(4), dH - drawerGap, drawerFrontThickness]}
              position={[offsetX, frontY, D / 2 - drawerFrontThickness / 2]}
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
        // 옷봉: 원기둥
        const rodY = baseY + mm(el.height);
        const rodRadius = mm(12); // 옷봉 반지름 12mm
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
        // 봉 양쪽 브라켓
        const bracketSize = mm(20);
        [-1, 1].forEach((side, bi) => {
          meshes.push(
            <BoxWithEdges
              key={`${key}-rod-bracket-${bi}`}
              args={[bracketSize, bracketSize, mm(4)]}
              position={[offsetX + side * (aW / 2 - bracketSize / 2), rodY, innerD / 2 - mm(2)]}
              material={metalMaterial}
              renderMode={renderMode}
              isDragging={isDragging}
              panelName={`봉브라켓${bi + 1}`}
              furnitureId={placedFurnitureId}
            />
          );
        });
      }
      // 'open' 타입은 아무것도 렌더링하지 않음
    });

    return meshes;
  };

  // 섹션별 렌더링
  const renderSections = () => {
    const sections = customConfig.sections;
    if (!sections || sections.length === 0) return null;

    const meshes: React.ReactNode[] = [];
    let currentBaseY = -H / 2 + t; // 바닥판 위에서 시작

    sections.forEach((section, sIdx) => {
      const sectionH = mm(section.height);

      // 섹션 사이 수평 분할 패널 (첫 번째 섹션 제외)
      if (sIdx > 0) {
        meshes.push(
          <BoxWithEdges
            key={`section-divider-${sIdx}`}
            args={[innerW, t, innerD]}
            position={[0, currentBaseY, t / 2]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isHighlighted={isHighlighted}
            panelName={`분할판${sIdx}`}
            panelGrainDirections={panelGrainDirections}
            furnitureId={placedFurnitureId}
          />
        );
        currentBaseY += t; // 분할판 높이만큼 위로
      }

      if (section.hasPartition && section.partitionPosition) {
        // 칸막이가 있는 경우: 수직 패널 + 좌/우 영역 분리
        const partPos = mm(section.partitionPosition);
        const partitionX = -innerW / 2 + partPos;

        // 칸막이 패널
        meshes.push(
          <BoxWithEdges
            key={`partition-${sIdx}`}
            args={[t, sectionH, innerD]}
            position={[partitionX, currentBaseY + sectionH / 2, t / 2]}
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
        const leftWidth = section.partitionPosition - panelThickness; // mm
        const leftCenterX = -innerW / 2 + mm(leftWidth) / 2;
        if (section.leftElements && section.leftElements.length > 0) {
          meshes.push(
            ...renderElements(section.leftElements, leftWidth, section.height, leftCenterX, currentBaseY)
          );
        }

        // 우측 영역
        const rightWidth = width - 2 * panelThickness - section.partitionPosition - panelThickness; // mm
        const rightCenterX = partitionX + t / 2 + mm(rightWidth) / 2;
        if (section.rightElements && section.rightElements.length > 0) {
          meshes.push(
            ...renderElements(section.rightElements, rightWidth, section.height, rightCenterX, currentBaseY)
          );
        }
      } else {
        // 칸막이 없는 경우: 전체 영역
        if (section.elements && section.elements.length > 0) {
          meshes.push(
            ...renderElements(section.elements, width - 2 * panelThickness, section.height, 0, currentBaseY)
          );
        }
      }

      currentBaseY += sectionH;
    });

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
      {/* 외곽 프레임: 좌측판 */}
      <BoxWithEdges
        args={[t, H, D]}
        position={[-W / 2 + t / 2, 0, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName="좌측판"
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />

      {/* 외곽 프레임: 우측판 */}
      <BoxWithEdges
        args={[t, H, D]}
        position={[W / 2 - t / 2, 0, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName="우측판"
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />

      {/* 외곽 프레임: 상판 */}
      <BoxWithEdges
        args={[W, t, D]}
        position={[0, H / 2 - t / 2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName="상판"
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />

      {/* 외곽 프레임: 하판 */}
      <BoxWithEdges
        args={[W, t, D]}
        position={[0, -H / 2 + t / 2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName="하판"
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />

      {/* 백패널 */}
      <BoxWithEdges
        args={[innerW, innerH, mm(5)]}
        position={[0, 0, -D / 2 + mm(5) / 2]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        isBackPanel
        panelName="백패널"
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />

      {/* 내부 구조 */}
      {!isDragging && renderSections()}

      {/* 조절발 (upper가 아닌 경우, 띄움배치 아닐 때) */}
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
