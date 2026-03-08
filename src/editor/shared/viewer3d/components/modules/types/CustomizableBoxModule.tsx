import React, { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { CustomFurnitureConfig, CustomElement, CustomSection } from '@/editor/shared/furniture/types';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { DrawerRenderer } from '../DrawerRenderer';
import { ShelfRenderer } from '../ShelfRenderer';
import { ClothingRod } from '../components/ClothingRod';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { SettingsIcon, EditIcon } from '@/components/common/Icons';

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
const mmToUnit = (val: number) => val * 0.01;

/**
 * 커스터마이징 가구 3D 렌더링 컴포넌트
 *
 * 기존 BaseFurnitureShell과 동일한 체결 구조:
 * - 측판(좌/우): 전체 높이, 전체 깊이 (구조체)
 * - 상판/하판: 측판 사이에 끼워넣기, 깊이 26mm 줄임, 좌우 0.5mm씩 줄임
 * - 백패널: 9mm 두께, 측판보다 넓게 (innerW + 10mm), 뒤쪽 배치
 *
 * 내부 요소(서랍/옷봉/선반)는 기존 DrawerRenderer, ClothingRod, ShelfRenderer를
 * 그대로 재사용하여 동일한 생성 공식/보링/타공 방식을 유지합니다.
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
  const activePopup = useUIStore(state => state.activePopup);

  const panelThickness = customConfig.panelThickness || 18; // mm
  const t = mmToUnit(panelThickness); // Three.js 단위
  const backPanelThicknessMm = 9; // 백패널 9mm
  const backPanelT = mmToUnit(backPanelThicknessMm);
  const backReductionMm = 26; // 상/하판 깊이 줄임 (백패널 영역)
  const backReduction = mmToUnit(backReductionMm);
  const widthReductionMm = 1; // 좌우 0.5mm씩 줄임
  const widthReduction = mmToUnit(widthReductionMm);
  const backPanelWidthExtMm = 10; // 백패널 너비 확장 (좌우 5mm씩)
  const backPanelHeightExtMm = 26; // 백패널 높이 확장 (상하 13mm씩)
  const backPanelDepthOffsetMm = 17; // 백패널 뒤쪽에서의 오프셋
  const drawerTopInsetMm = 85; // 서랍 섹션 상판 앞쪽 들여쓰기
  const drawerTopInset = mmToUnit(drawerTopInsetMm);

  // Three.js 단위 치수
  const W = mmToUnit(width);
  const H = mmToUnit(height);
  const D = mmToUnit(depth);

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

  const sections = customConfig.sections;
  const isSplit = sections.length >= 2;

  // 섹션 옵션 아이콘 상태
  const showDimensions = useUIStore(state => state.showDimensions);
  const showFurnitureEditHandles = useUIStore(state => state.showFurnitureEditHandles);
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);

  const showSectionIcons = showFurnitureEditHandles && showDimensions
    && viewMode === '3D' && !isDragging && showFurniture;

  // 섹션에 서랍이 포함되어 있는지 확인
  const sectionHasDrawer = (section: CustomSection): boolean => {
    const elems = section.elements || [];
    const leftElems = section.leftElements || [];
    const rightElems = section.rightElements || [];
    return [...elems, ...leftElems, ...rightElems].some(el => el.type === 'drawer');
  };

  // 현재 편집 중인 영역인지 확인
  const isEditingArea = (sectionIndex: number, areaSide?: 'left' | 'right') => {
    return activePopup.type === 'customizableEdit'
      && activePopup.id === placedFurnitureId
      && activePopup.sectionIndex === sectionIndex
      && activePopup.areaSide === areaSide;
  };

  // 섹션 아이콘 렌더링 함수
  const renderSectionIcon = (
    key: string,
    posX: number,
    posY: number,
    posZ: number,
    sectionIndex: number,
    areaSide?: 'left' | 'right',
  ) => {
    // 해당 영역이 편집 중이면 아이콘 숨김
    if (isEditingArea(sectionIndex, areaSide)) return null;

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
            } else if (placedFurnitureId) {
              const el = e.currentTarget as HTMLElement;
              const rect = el.getBoundingClientRect();
              useUIStore.getState().openCustomizableEditPopup(placedFurnitureId, sectionIndex, areaSide, Math.round(rect.right + 8), Math.round(rect.top));
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredIcon(key)}
          onMouseLeave={() => setHoveredIcon(null)}
          title="섹션 세부설정"
        >
          <SettingsIcon color={themeColor} size={14} />
        </div>
      </Html>
    );
  };

  // 섹션 내경 치수 가이드 렌더링 (톱니 아이콘 클릭 시)
  const renderSectionDimensionGuides = () => {
    if (activePopup.type !== 'customizableEdit') return null;
    if (activePopup.id !== placedFurnitureId) return null;
    if (activePopup.sectionIndex === undefined) return null;

    const sIdx = activePopup.sectionIndex;
    const section = sections[sIdx];
    if (!section) return null;

    const themeColor = getThemeColor();
    const frontZ = D / 2 + 0.02;

    // 섹션 내경 (mm)
    const sectionInnerHeightMm = section.height;
    const sectionInnerWidthMm = width - 2 * panelThickness;

    // 섹션 중심 Y 계산
    let sectionCenterY = 0;
    let sectionInnerH = mmToUnit(sectionInnerHeightMm);
    if (isSplit) {
      const lowerH = mmToUnit(sections[0].height + 2 * panelThickness);
      const upperH = mmToUnit(sections[1].height + 2 * panelThickness);
      if (sIdx === 0) {
        sectionCenterY = -H / 2 + lowerH / 2;
      } else {
        sectionCenterY = -H / 2 + lowerH + upperH / 2;
      }
    }

    // 가이드 라인 좌표 (Three.js 단위)
    const left = -innerW / 2;
    const right = innerW / 2;
    const top = sectionCenterY + sectionInnerH / 2;
    const bottom = sectionCenterY - sectionInnerH / 2;

    const lineColor = themeColor;
    const lineOpacity = 0.6;
    const dashSize = 0.04;
    const gapSize = 0.03;

    // 점선 재질
    const dashedLineMat = new THREE.LineDashedMaterial({
      color: lineColor,
      dashSize,
      gapSize,
      transparent: true,
      opacity: lineOpacity,
      depthTest: false,
    });

    // 수평 가이드 라인 (상/하 내경 경계)
    const hTopGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, top, frontZ),
      new THREE.Vector3(right, top, frontZ),
    ]);
    const hBottomGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, bottom, frontZ),
      new THREE.Vector3(right, bottom, frontZ),
    ]);

    // 수직 가이드 라인 (좌/우 내경 경계)
    const vLeftGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, top, frontZ),
      new THREE.Vector3(left, bottom, frontZ),
    ]);
    const vRightGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(right, top, frontZ),
      new THREE.Vector3(right, bottom, frontZ),
    ]);

    return (
      <group key="section-dim-guides">
        {/* 점선 가이드 */}
        <lineSegments geometry={hTopGeo} material={dashedLineMat} computeLineDistances />
        <lineSegments geometry={hBottomGeo} material={dashedLineMat} computeLineDistances />
        <lineSegments geometry={vLeftGeo} material={dashedLineMat} computeLineDistances />
        <lineSegments geometry={vRightGeo} material={dashedLineMat} computeLineDistances />

        {/* 너비 치수 (상단) */}
        <Html
          position={[0, top + 0.15, frontZ]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div style={{
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: `1px solid ${themeColor}`,
          }}>
            내경 {sectionInnerWidthMm}mm
          </div>
        </Html>

        {/* 높이 치수 (좌측) */}
        <Html
          position={[left - 0.15, sectionCenterY, frontZ]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div style={{
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: `1px solid ${themeColor}`,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}>
            내경 {sectionInnerHeightMm}mm
          </div>
        </Html>
      </group>
    );
  };

  // 섹션별 아이콘 목록 생성
  const renderSectionIcons = () => {
    if (!showSectionIcons) return null;

    const icons: React.ReactNode[] = [];
    const frontZ = D / 2 + 0.1;

    if (isSplit) {
      const lowerH = mmToUnit(sections[0].height + 2 * panelThickness);
      const upperH = mmToUnit(sections[1].height + 2 * panelThickness);
      const lowerCenterY = -H / 2 + lowerH / 2;
      const upperCenterY = -H / 2 + lowerH + upperH / 2;

      const addPartitionIcons = (section: CustomSection, centerY: number, prefix: string, sIdx: number) => {
        if (section.hasPartition && section.partitionPosition) {
          const partX = -innerW / 2 + mmToUnit(section.partitionPosition);
          const leftCenterX = (-innerW / 2 + partX - t / 2) / 2;
          const rightCenterX = (partX + t / 2 + innerW / 2) / 2;
          icons.push(renderSectionIcon(`${prefix}-left`, leftCenterX, centerY, frontZ, sIdx, 'left'));
          icons.push(renderSectionIcon(`${prefix}-right`, rightCenterX, centerY, frontZ, sIdx, 'right'));
        } else {
          icons.push(renderSectionIcon(prefix, 0, centerY, frontZ, sIdx));
        }
      };

      addPartitionIcons(sections[0], lowerCenterY, 'lower', 0);
      addPartitionIcons(sections[1], upperCenterY, 'upper', 1);
    } else {
      if (sections[0]?.hasPartition && sections[0]?.partitionPosition) {
        const partX = -innerW / 2 + mmToUnit(sections[0].partitionPosition);
        const leftCenterX = (-innerW / 2 + partX - t / 2) / 2;
        const rightCenterX = (partX + t / 2 + innerW / 2) / 2;
        icons.push(renderSectionIcon('single-left', leftCenterX, 0, frontZ, 0, 'left'));
        icons.push(renderSectionIcon('single-right', rightCenterX, 0, frontZ, 0, 'right'));
      } else {
        icons.push(renderSectionIcon('single', 0, 0, frontZ, 0));
      }
    }

    return icons;
  };

  // 편집 중인 영역 하이라이트 테두리 렌더링
  const renderEditingHighlight = () => {
    if (activePopup.type !== 'customizableEdit') return null;
    if (activePopup.id !== placedFurnitureId) return null;
    if (activePopup.sectionIndex === undefined) return null;

    const sIdx = activePopup.sectionIndex;
    const aSide = activePopup.areaSide;
    const section = sections[sIdx];
    if (!section) return null;

    const themeColor = getThemeColor();

    // Y 위치 계산
    let centerY = 0;
    let areaH: number;
    if (isSplit) {
      const lowerH = mmToUnit(sections[0].height + 2 * panelThickness);
      const upperH = mmToUnit(sections[1].height + 2 * panelThickness);
      centerY = sIdx === 0 ? -H / 2 + lowerH / 2 : -H / 2 + lowerH + upperH / 2;
      areaH = sIdx === 0 ? lowerH - t : upperH - t;
    } else {
      areaH = H - 2 * t;
    }

    // X 위치 및 너비 계산
    let centerX = 0;
    let areaW = innerW;
    if (section.hasPartition && section.partitionPosition && aSide) {
      const partX = -innerW / 2 + mmToUnit(section.partitionPosition);
      if (aSide === 'left') {
        centerX = (-innerW / 2 + partX - t / 2) / 2;
        areaW = partX - t / 2 - (-innerW / 2);
      } else {
        centerX = (partX + t / 2 + innerW / 2) / 2;
        areaW = innerW / 2 - (partX + t / 2);
      }
    }

    const frontZ = D / 2 + 0.002;
    const bw = 0.003; // 테두리 두께 (3mm)

    return (
      <group position={[centerX, centerY, frontZ]}>
        {/* 반투명 배경 */}
        <mesh>
          <planeGeometry args={[areaW, areaH]} />
          <meshBasicMaterial color={themeColor} transparent opacity={0.08} side={2} depthTest={false} />
        </mesh>
        {/* 상 */}
        <mesh position={[0, areaH / 2, 0]}>
          <planeGeometry args={[areaW + bw * 2, bw]} />
          <meshBasicMaterial color={themeColor} depthTest={false} />
        </mesh>
        {/* 하 */}
        <mesh position={[0, -areaH / 2, 0]}>
          <planeGeometry args={[areaW + bw * 2, bw]} />
          <meshBasicMaterial color={themeColor} depthTest={false} />
        </mesh>
        {/* 좌 */}
        <mesh position={[-areaW / 2, 0, 0]}>
          <planeGeometry args={[bw, areaH]} />
          <meshBasicMaterial color={themeColor} depthTest={false} />
        </mesh>
        {/* 우 */}
        <mesh position={[areaW / 2, 0, 0]}>
          <planeGeometry args={[bw, areaH]} />
          <meshBasicMaterial color={themeColor} depthTest={false} />
        </mesh>
      </group>
    );
  };

  if (!showFurniture) return null;

  /**
   * 섹션 내부 요소 렌더링 (기존 DrawerRenderer/ClothingRod/ShelfRenderer 재사용)
   *
   * 기존 모듈과 동일한 방식으로 서랍(ㄷ자 프레임 + 레일 + 보링홀),
   * 옷봉(브라켓 + 봉 + 필라이트), 선반(패널 + 치수)을 렌더링합니다.
   *
   * @param elements - 내부 요소 배열
   * @param areaInnerWidth - 영역 내부 너비 (Three.js 단위, 측판 제외)
   * @param areaInnerHeight - 영역 내부 높이 (Three.js 단위, 상하판 제외)
   * @param sectionCenterY - 섹션 중심 Y (Three.js 단위)
   * @param offsetX - 영역 중심 X 오프셋 (Three.js, 칸막이 영역용)
   * @param sectionDepth - 섹션 깊이 (Three.js 단위)
   * @param sectionLabel - 섹션 이름 ("(상)", "(하)" 등)
   * @param keyPrefix - 키 접두사
   */
  /**
   * 영역 렌더링 (서브분할 처리 포함)
   * 서브분할이 있으면 상/하부로 나누어 각각 renderSectionElements 호출
   */
  const renderAreaWithSubSplit = (
    section: CustomSection,
    areaKey: 'full' | 'left' | 'right',
    elements: CustomElement[] | undefined,
    areaInnerWidth: number,
    areaInnerHeight: number,
    sectionCenterY: number,
    offsetX: number,
    sectionDepth: number,
    sectionLabel: string,
    keyPrefix: string,
    _sIdx: number,
  ): React.ReactNode[] => {
    const subSplit = section.areaSubSplits?.[areaKey];

    if (subSplit?.enabled) {
      const nodes: React.ReactNode[] = [];
      const lowerH = mmToUnit(subSplit.lowerHeight);
      const upperH = areaInnerHeight - lowerH;
      const lowerCenterY = sectionCenterY - areaInnerHeight / 2 + lowerH / 2;
      const upperCenterY = sectionCenterY + areaInnerHeight / 2 - upperH / 2;

      // 서브분할 수평 패널 (구분판)
      const dividerY = sectionCenterY - areaInnerHeight / 2 + lowerH;
      nodes.push(
        <BoxWithEdges
          key={`${keyPrefix}-subsplit-divider`}
          position={[offsetX, dividerY, 0]}
          args={[areaInnerWidth, t, sectionDepth - t]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${sectionLabel}서브분할판`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );

      // 하부 요소
      if (subSplit.lowerElements && subSplit.lowerElements.length > 0) {
        nodes.push(
          ...renderSectionElements(
            subSplit.lowerElements, areaInnerWidth, lowerH - t / 2,
            lowerCenterY - t / 4, offsetX, sectionDepth,
            `${sectionLabel}하`, `${keyPrefix}-lower`
          )
        );
      }

      // 상부 요소
      if (subSplit.upperElements && subSplit.upperElements.length > 0) {
        nodes.push(
          ...renderSectionElements(
            subSplit.upperElements, areaInnerWidth, upperH - t / 2,
            upperCenterY + t / 4, offsetX, sectionDepth,
            `${sectionLabel}상`, `${keyPrefix}-upper`
          )
        );
      }

      return nodes;
    }

    // 서브분할 없음: 기존 방식
    if (elements && elements.length > 0) {
      return renderSectionElements(
        elements, areaInnerWidth, areaInnerHeight,
        sectionCenterY, offsetX, sectionDepth,
        sectionLabel, keyPrefix
      );
    }
    return [];
  };

  const renderSectionElements = (
    elements: CustomElement[],
    areaInnerWidth: number,   // Three.js 단위
    areaInnerHeight: number,  // Three.js 단위
    sectionCenterY: number,   // Three.js 단위
    offsetX: number,          // Three.js 단위
    sectionDepth: number,     // Three.js 단위
    sectionLabel: string,
    keyPrefix: string,
  ) => {
    const nodes: React.ReactNode[] = [];
    // 기존 모듈과 동일한 셸프 깊이 계산
    const adjustedDepth = sectionDepth - t; // depth - basicThickness

    elements.forEach((el, elIdx) => {
      const key = `${keyPrefix}-${elIdx}`;

      if (el.type === 'drawer') {
        // ═══ DrawerRenderer 사용 (ㄷ자 프레임 + 레일 + 보링홀 포함) ═══
        const drawerCount = el.heights.length;
        const gapHeight = 23.6; // 서랍 간 공백 (mm) - 기존 모듈과 동일

        nodes.push(
          <group key={key} position={[offsetX, 0, 0]}>
            <DrawerRenderer
              drawerCount={drawerCount}
              innerWidth={areaInnerWidth}
              innerHeight={areaInnerHeight}
              depth={sectionDepth}
              basicThickness={t}
              yOffset={sectionCenterY}
              drawerHeights={el.heights}
              gapHeight={gapHeight}
              material={material}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              furnitureId={placedFurnitureId}
              sectionName={sectionLabel}
              panelGrainDirections={panelGrainDirections}
            />
          </group>
        );
      } else if (el.type === 'rod') {
        // ═══ ClothingRod 사용 (브라켓 + 봉 + 필라이트 포함) ═══
        // 옷봉은 상판 바로 아래에 자동 배치 (기존 모듈 방식과 동일)
        // 브라켓 높이 75mm, 봉 중심 = 상판 하단 - 75/2
        const rodYPosition = sectionCenterY + areaInnerHeight / 2 - mmToUnit(75 / 2);

        nodes.push(
          <group key={key} position={[offsetX, 0, 0]}>
            <ClothingRod
              innerWidth={areaInnerWidth}
              yPosition={rodYPosition}
              renderMode={renderMode as '2d' | '3d'}
              isDragging={isDragging}
              isEditMode={isEditMode}
              adjustedDepthForShelves={adjustedDepth}
              depth={sectionDepth}
              addFrontFillLight={rodYPosition < 0}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      } else if (el.type === 'shelf') {
        // ═══ ShelfRenderer 사용 (다보 방식 - 앞에서 30mm 들여쓰기) ═══
        // el.heights는 섹션 하단에서 각 선반 위치 (mm)
        nodes.push(
          <group key={key} position={[offsetX, 0, 0]}>
            <ShelfRenderer
              shelfCount={el.heights.length}
              innerWidth={areaInnerWidth}
              innerHeight={areaInnerHeight}
              depth={sectionDepth}
              basicThickness={t}
              material={material}
              yOffset={sectionCenterY}
              shelfPositions={el.heights}
              renderMode={renderMode}
              furnitureId={placedFurnitureId}
              isHighlighted={isHighlighted}
              sectionName={sectionLabel}
              panelGrainDirections={panelGrainDirections}
              shelfFrontInsetMm={30}
            />
          </group>
        );

        // ═══ 선반 + 옷봉 조합: hasRod=true면 최상단 선반 바로 아래에 옷봉 자동 배치 ═══
        if (el.hasRod) {
          const topShelfHeight = Math.max(...el.heights); // 가장 높은 선반 위치 (mm)
          // 봉 위치 = 최상단 선반 하단 - 브라켓 높이/2
          // 선반 하단 = 선반 위치 - 패널 두께/2
          const rodYFromBottom = mmToUnit(topShelfHeight) - t / 2 - mmToUnit(75 / 2);
          const rodYPosition = sectionCenterY - areaInnerHeight / 2 + rodYFromBottom;

          nodes.push(
            <group key={`${key}-rod`} position={[offsetX, 0, 0]}>
              <ClothingRod
                innerWidth={areaInnerWidth}
                yPosition={rodYPosition}
                renderMode={renderMode as '2d' | '3d'}
                isDragging={isDragging}
                isEditMode={isEditMode}
                adjustedDepthForShelves={adjustedDepth}
                depth={sectionDepth}
                addFrontFillLight={rodYPosition < 0}
                furnitureId={placedFurnitureId}
              />
            </group>
          );
        }
      }
      else if (el.type === 'pants') {
        // ═══ 바지걸이 - ClothingRod 재사용 (하부섹션 전용) ═══
        // 상판 바로 아래에 자동 배치 (옷봉과 동일 로직)
        const pantsYPosition = sectionCenterY + areaInnerHeight / 2 - mmToUnit(75 / 2);

        nodes.push(
          <group key={key} position={[offsetX, 0, 0]}>
            <ClothingRod
              innerWidth={areaInnerWidth}
              yPosition={pantsYPosition}
              renderMode={renderMode as '2d' | '3d'}
              isDragging={isDragging}
              isEditMode={isEditMode}
              adjustedDepthForShelves={adjustedDepth}
              depth={sectionDepth}
              addFrontFillLight={pantsYPosition < 0}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      }
      // 'open' 타입은 내부 요소 없음
    });

    return nodes;
  };

  /**
   * 섹션 내부 콘텐츠 렌더링 (칸막이 + 요소)
   */
  const renderSectionContent = (
    section: CustomSection,
    sIdx: number,
    boxW: number,     // Three.js (외곽 너비)
    boxH: number,     // Three.js (외곽 높이)
    boxD: number,     // Three.js (전체 깊이)
    centerY: number,  // Three.js (박스 중심 Y)
  ) => {
    const meshes: React.ReactNode[] = [];
    const bInnerW = boxW - 2 * t;
    const bInnerH = boxH - 2 * t;
    const innerD = boxD - backReduction;
    const sectionLabel = isSplit ? (sIdx === 0 ? '(하)' : '(상)') : '';

    if (section.hasPartition && section.partitionPosition) {
      const partPos = mmToUnit(section.partitionPosition);
      const partitionX = -bInnerW / 2 + partPos;

      // 칸막이 수직 패널
      meshes.push(
        <BoxWithEdges
          key={`partition-${sIdx}`}
          args={[t, bInnerH, innerD]}
          position={[partitionX, centerY, backReduction / 2]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isHighlighted}
          panelName={`${sectionLabel}칸막이`}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      );

      // 좌측 영역
      const leftWidthMm = section.partitionPosition - panelThickness;
      const leftInnerW = mmToUnit(leftWidthMm);
      const leftCenterX = -bInnerW / 2 + leftInnerW / 2;
      meshes.push(
        ...renderAreaWithSubSplit(
          section, 'left', section.leftElements,
          leftInnerW, bInnerH, centerY, leftCenterX, boxD,
          `${sectionLabel}좌`, `s${sIdx}-left`, sIdx
        )
      );

      // 우측 영역
      const rightWidthMm = innerWidthMm - section.partitionPosition - panelThickness;
      const rightInnerW = mmToUnit(rightWidthMm);
      const rightCenterX = partitionX + t / 2 + rightInnerW / 2;
      meshes.push(
        ...renderAreaWithSubSplit(
          section, 'right', section.rightElements,
          rightInnerW, bInnerH, centerY, rightCenterX, boxD,
          `${sectionLabel}우`, `s${sIdx}-right`, sIdx
        )
      );
    } else {
      // 칸막이 없는 경우
      meshes.push(
        ...renderAreaWithSubSplit(
          section, 'full', section.elements,
          bInnerW, bInnerH, centerY, 0, boxD,
          sectionLabel, `s${sIdx}`, sIdx
        )
      );
    }

    return meshes;
  };

  /**
   * 독립 박스 렌더링 (기존 BaseFurnitureShell 체결 구조)
   */
  const renderBox = (
    section: CustomSection,
    sIdx: number,
    boxW: number,
    boxH: number,
    boxD: number,
    centerY: number,
  ) => {
    const meshes: React.ReactNode[] = [];
    const bInnerW = boxW - 2 * t;
    const bInnerH = boxH - 2 * t;
    const prefix = `box-${sIdx}`;
    const sectionLabel = sIdx === 0 ? '하부' : '상부';

    // ═══ 1. 측판 (좌/우) - 전체 높이, 전체 깊이 ═══
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

    // ═══ 2. 상판/하판 - 측판 사이에 끼워넣기 ═══
    // 서랍 섹션 상판은 앞에서 85mm 들여쓰기
    const hasDrawer = sectionHasDrawer(section);
    const topDepthReduction = hasDrawer ? drawerTopInset : 0;
    meshes.push(
      <BoxWithEdges
        key={`${prefix}-top`}
        args={[bInnerW - widthReduction, t, boxD - backReduction - topDepthReduction]}
        position={[0, centerY + boxH / 2 - t / 2, backReduction / 2 - topDepthReduction / 2]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isHighlighted={isHighlighted}
        panelName={`${sectionLabel}상판`}
        panelGrainDirections={panelGrainDirections}
        furnitureId={placedFurnitureId}
      />
    );
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

    // ═══ 3. 백패널 ═══
    const backPanelH = bInnerH + mmToUnit(backPanelHeightExtMm);
    const backPanelW = bInnerW + mmToUnit(backPanelWidthExtMm);
    const backPanelZ = -boxD / 2 + backPanelT / 2 + mmToUnit(backPanelDepthOffsetMm);

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

    // ═══ 4. 내부 요소 (칸막이, 서랍, 옷봉, 선반) ═══
    if (!isDragging || isEditMode) {
      meshes.push(...renderSectionContent(section, sIdx, boxW, boxH, boxD, centerY));
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
            const lowerH = mmToUnit(sections[0].height + 2 * panelThickness);
            const upperH = mmToUnit(sections[1].height + 2 * panelThickness);
            const lowerCenterY = -H / 2 + lowerH / 2;
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
          {/* ═══ 측판 (좌/우) ═══ */}
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

          {/* ═══ 상판 ═══ */}
          {(() => {
            const singleHasDrawer = sectionHasDrawer(sections[0]);
            const singleTopInset = singleHasDrawer ? drawerTopInset : 0;
            return (
              <BoxWithEdges
                args={[innerW - widthReduction, t, D - backReduction - singleTopInset]}
                position={[0, H / 2 - t / 2, backReduction / 2 - singleTopInset / 2]}
                material={material}
                renderMode={renderMode}
                isDragging={isDragging}
                isHighlighted={isHighlighted}
                panelName="상판"
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId}
              />
            );
          })()}

          {/* ═══ 하판(바닥판) ═══ */}
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

          {/* ═══ 백패널 ═══ */}
          {(() => {
            const innerH = H - 2 * t;
            const bpH = innerH + mmToUnit(backPanelHeightExtMm);
            const bpW = innerW + mmToUnit(backPanelWidthExtMm);
            const bpZ = -D / 2 + backPanelT / 2 + mmToUnit(backPanelDepthOffsetMm);
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
          {(!isDragging || isEditMode) && sections[0] &&
            renderSectionContent(sections[0], 0, W, H, D, 0)
          }
        </>
      )}

      {/* 섹션별 옵션 아이콘 */}
      {renderSectionIcons()}

      {/* 편집 중인 영역 하이라이트 테두리 */}
      {renderEditingHighlight()}

      {/* 섹션 내경 치수 가이드 - 제거됨 */}

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
