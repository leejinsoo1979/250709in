/**
 * DXF 데이터를 PDF로 변환
 *
 * DXF 내보내기(dxfFromScene.ts)와 완전히 동일한 방식 사용:
 * - generateDxfFromData를 호출하여 씬에서 라인/텍스트 추출
 * - 추출된 DXF 데이터를 파싱하여 PDF로 변환
 *
 * 주의: 이 함수는 현재 씬 상태에서 추출하므로,
 * 호출 전에 씬이 적절한 2D 모드로 설정되어 있어야 함
 */

import { jsPDF } from 'jspdf';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import {
  generateDxfDrawingData,
  type ViewDirection,
  type SideViewFilter
} from './dxfDataRenderer';
import { ColumnIndexer } from './indexing/ColumnIndexer';
import { useUIStore } from '@/store/uiStore';
import { captureExportUiState, createExportViewUiPatch, shouldApplyExportUiPatch } from './exportStateSnapshot';
import { getSideViewSlotGroups } from './sideViewModuleFilter';
import { getCategoryDefaultFurnitureDepth } from './furnitureDepthDefaults';
import { buildModuleDataFromPlacedModule, getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';
import { calculateHingePositions } from '@/domain/boring/calculators/hingeCalculator';
import { DEFAULT_HINGE_SETTINGS } from '@/domain/boring/constants';
import { findDoorHingeGeometry } from './doorHingeGeometryRegistry';
import { resolvePdfDoorDrawingItem, type PdfDoorDrawingModuleData } from './pdfDoorDrawingGeometry';

/**
 * PDF 생성 전 씬을 올바른 뷰 모드로 전환하는 헬퍼
 * DXF 추출은 현재 씬 상태에서 Line/Text 객체를 가져오므로,
 * 올바른 뷰 모드가 설정되어야 도어/대각선 등 조건부 렌더링 요소가 포함됨
 */
const switchSceneViewMode = async (
  viewMode: '2D' | '3D',
  view2DDirection: 'front' | 'left' | 'right' | 'top',
  renderMode: 'solid' | 'wireframe' = 'wireframe'
): Promise<void> => {
  const store = useUIStore.getState();
  const needsChange = store.viewMode !== viewMode ||
    store.view2DDirection !== view2DDirection ||
    store.renderMode !== renderMode ||
    !store.showDimensions ||
    !store.showDimensionsText ||
    !store.showFurniture ||
    store.showGuides ||
    store.showAxis;

  if (!needsChange) {
    console.log(`[PDF] 씬 뷰 모드 변경 불필요: ${viewMode}/${view2DDirection}/${renderMode}`);
    return;
  }

  console.log(`[PDF] 씬 뷰 모드 전환: ${store.viewMode}/${store.view2DDirection} → ${viewMode}/${view2DDirection}/${renderMode}`);
  useUIStore.setState({
    ...createExportViewUiPatch(view2DDirection === 'right' ? 'left' : view2DDirection),
    viewMode,
    renderMode
  });

  // React 렌더링 사이클 대기 (씬 갱신 필요 - 도어 대각선 등 조건부 렌더링 요소 포함)
  // ConvertModal의 캡처 코드에서 1500ms 대기하므로 동일한 시간 사용
  await new Promise(resolve => setTimeout(resolve, 1000));
};

const applyExportUiPatchIfChanged = (patch: ReturnType<typeof createExportViewUiPatch>): void => {
  if (shouldApplyExportUiPatch(useUIStore.getState(), patch)) {
    useUIStore.setState(patch);
  }
};

// PDF 뷰 타입
// - front: 입면도 (도어 있음) - 도어가 장착된 정면도
// - front-no-door: 입면도 (도어 없음) - 도어 없이 내부가 보이는 정면도
// - door-only: 도어 입면도 - 가구 없이 도어/서랍만 표시
// - left: 측면도
// - top: 평면도
export type PdfViewDirection = 'front' | 'front-no-door' | 'left' | 'top' | 'door-only';
export type PdfLineStyle = 'color' | 'monochrome';

export interface PdfExportOptions {
  lineStyle?: PdfLineStyle;
}

// DXF에서 추출한 라인 정보
export interface ParsedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  color?: number;
  sourceName?: string;
  sourcePath?: string;
}

// DXF에서 추출한 텍스트 정보
export interface ParsedText {
  x: number;
  y: number;
  text: string;
  height: number;
  layer: string;
  color?: number;
}

const PDF_LAYER_COLORS = {
  body: [245, 124, 0] as [number, number, number],
  door: [132, 204, 22] as [number, number, number],
  channel: [37, 99, 235] as [number, number, number],
  dimension: [0, 0, 0] as [number, number, number],
  accessory: [96, 96, 96] as [number, number, number],
  hinge: [220, 38, 38] as [number, number, number],
};

const HINGE_MATCH_BODY_LAYER = 'HINGE_MATCH_BODY';
const HINGE_MATCH_DOOR_LAYER = 'HINGE_MATCH_DOOR';
const HINGE_MATCH_DIMENSIONS_LAYER = 'HINGE_MATCH_DIMENSIONS';

const resolvePdfLineColor = (
  line: ParsedLine,
  lineStyle: PdfLineStyle
): [number, number, number] => {
  if (lineStyle === 'monochrome') {
    return [0, 0, 0];
  }

  const layer = line.layer;
  const dx = Math.abs(line.x2 - line.x1);
  const dy = Math.abs(line.y2 - line.y1);
  const isDiagonalDoorGuide = layer === 'DOOR' && dx > 5 && dy > 5;

  if (layer === 'DIMENSIONS' || layer === 'DOOR_DIMENSIONS') {
    return PDF_LAYER_COLORS.dimension;
  }

  if (
    layer === HINGE_MATCH_BODY_LAYER ||
    layer === HINGE_MATCH_DOOR_LAYER ||
    layer === HINGE_MATCH_DIMENSIONS_LAYER
  ) {
    return PDF_LAYER_COLORS.hinge;
  }

  if (isDiagonalDoorGuide) {
    return PDF_LAYER_COLORS.body;
  }

  if (layer === 'DOOR') {
    return PDF_LAYER_COLORS.door;
  }

  if (layer === 'WOOD_CHANNEL') {
    return PDF_LAYER_COLORS.channel;
  }

  if (
    (layer === 'FURNITURE_PANEL' || layer === 'BACK_PANEL' || layer === 'DRAWER') &&
    (line.color === 4 || line.color === 5)
  ) {
    return PDF_LAYER_COLORS.channel;
  }

  if (layer === 'FURNITURE_PANEL' || layer === 'BACK_PANEL' || layer === 'DRAWER' || layer === 'END_PANEL') {
    return PDF_LAYER_COLORS.body;
  }

  if (layer === 'ACCESSORIES' || layer === 'CLOTHING_ROD' || layer === 'VENTILATION') {
    return PDF_LAYER_COLORS.accessory;
  }

  return PDF_LAYER_COLORS.dimension;
};

const resolvePdfTextColor = (
  text: ParsedText,
  lineStyle: PdfLineStyle
): [number, number, number] => {
  if (lineStyle === 'monochrome') {
    return [0, 0, 0];
  }

  if (text.layer === 'DOOR') {
    return PDF_LAYER_COLORS.door;
  }

  if (
    text.layer === HINGE_MATCH_BODY_LAYER ||
    text.layer === HINGE_MATCH_DOOR_LAYER ||
    text.layer === HINGE_MATCH_DIMENSIONS_LAYER
  ) {
    return PDF_LAYER_COLORS.hinge;
  }

  return PDF_LAYER_COLORS.dimension;
};

export const isDoorDrawingLayer = (layer: string): boolean =>
  layer === 'DOOR' || layer === 'DOOR_DIMENSIONS';

export const filterDoorOnlyDrawingData = <
  TLine extends { layer: string },
  TText extends { layer: string }
>(lines: TLine[], texts: TText[]): { lines: TLine[]; texts: TText[] } => ({
  lines: lines.filter(line => isDoorDrawingLayer(line.layer)),
  texts: texts.filter(text => isDoorDrawingLayer(text.layer))
});

export const hasPdfDrawingData = (
  lines: readonly unknown[],
  texts: readonly unknown[]
): boolean => lines.length > 0 || texts.length > 0;

export const filterVisiblePdfDrawingItems = <
  TItem extends { lines: readonly unknown[]; texts: readonly unknown[] }
>(items: readonly TItem[]): TItem[] => items.filter(item => hasPdfDrawingData(item.lines, item.texts));

type HingeCoordinateDrawingTarget = 'door' | 'body-front' | 'body-side';

const isHingedDoorModule = (module: PlacedModule): boolean => {
  if (!module.hasDoor) return false;

  const moduleId = module.moduleId || '';
  return !(
    moduleId.includes('lower-drawer-') ||
    moduleId.includes('lower-door-lift-1tier') ||
    moduleId.includes('lower-door-lift-2tier') ||
    moduleId.includes('lower-door-lift-3tier') ||
    moduleId.includes('lower-door-lift-touch-') ||
    moduleId.includes('lower-top-down-1tier') ||
    moduleId.includes('lower-top-down-2tier') ||
    moduleId.includes('lower-top-down-3tier') ||
    moduleId.includes('lower-top-down-touch-') ||
    moduleId.includes('lower-induction-cabinet') ||
    moduleId.includes('dual-lower-induction-cabinet') ||
    moduleId.includes('lower-touch-drawer-') ||
    moduleId.includes('dishwasher')
  );
};

const resolveModuleDataForHingeCoordinates = (
  spaceInfo: SpaceInfo,
  module: PlacedModule
) => {
  const internalSpace = calculateInternalSpace(spaceInfo);

  return getModuleById(
    module.moduleId,
    { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
    spaceInfo
  ) || buildModuleDataFromPlacedModule(module, spaceInfo.panelThickness);
};

const addCross = (
  lines: ParsedLine[],
  x: number,
  y: number,
  size: number,
  layer: string
) => {
  lines.push(
    { x1: x - size, y1: y, x2: x + size, y2: y, layer, color: 1 },
    { x1: x, y1: y - size, x2: x, y2: y + size, layer, color: 1 }
  );
};

const roundMm = (value: number): number => Math.round(value * 10) / 10;
const formatMm = (value: number): string => String(roundMm(value));

const addGuideLine = (
  lines: ParsedLine[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layer = HINGE_MATCH_DIMENSIONS_LAYER
) => {
  lines.push({ x1, y1, x2, y2, layer, color: 1 });
};

const addVerticalDimensionGuide = (
  lines: ParsedLine[],
  texts: ParsedText[],
  options: {
    referenceX: number;
    dimensionX: number;
    fromY: number;
    toY: number;
    label: string;
    textSide: 'left' | 'right';
  }
) => {
  const { referenceX, dimensionX, fromY, toY, label, textSide } = options;
  addGuideLine(lines, referenceX, fromY, dimensionX, fromY);
  addGuideLine(lines, referenceX, toY, dimensionX, toY);
  addGuideLine(lines, dimensionX, fromY, dimensionX, toY);
  texts.push({
    x: dimensionX + (textSide === 'right' ? 14 : -14),
    y: (fromY + toY) / 2,
    text: label,
    height: 18,
    layer: HINGE_MATCH_DIMENSIONS_LAYER,
    color: 1
  });
};

const addHorizontalDimensionGuide = (
  lines: ParsedLine[],
  texts: ParsedText[],
  options: {
    fromX: number;
    toX: number;
    referenceY: number;
    dimensionY: number;
    label: string;
  }
) => {
  const { fromX, toX, referenceY, dimensionY, label } = options;
  addGuideLine(lines, fromX, referenceY, fromX, dimensionY);
  addGuideLine(lines, toX, referenceY, toX, dimensionY);
  addGuideLine(lines, fromX, dimensionY, toX, dimensionY);
  texts.push({
    x: (fromX + toX) / 2,
    y: dimensionY + 12,
    text: label,
    height: 18,
    layer: HINGE_MATCH_DIMENSIONS_LAYER,
    color: 1
  });
};

const addVerticalChainDimensionGuide = (
  lines: ParsedLine[],
  texts: ParsedText[],
  options: {
    referenceX: number;
    dimensionX: number;
    anchorsY: number[];
    labels?: string[];
    textSide: 'left' | 'right';
  }
) => {
  const anchorsY = Array.from(new Set(
    options.anchorsY
      .filter(value => Number.isFinite(value))
      .map(value => Math.round(value * 10) / 10)
  )).sort((a, b) => b - a);

  if (anchorsY.length < 2) return;

  const tickSize = 10;
  const topY = anchorsY[0];
  const bottomY = anchorsY[anchorsY.length - 1];
  addGuideLine(lines, options.dimensionX, topY, options.dimensionX, bottomY);

  anchorsY.forEach(y => {
    addGuideLine(lines, options.referenceX, y, options.dimensionX, y);
    addGuideLine(lines, options.dimensionX - tickSize / 2, y, options.dimensionX + tickSize / 2, y);
  });

  for (let index = 0; index < anchorsY.length - 1; index += 1) {
    const fromY = anchorsY[index];
    const toY = anchorsY[index + 1];
    const segmentMm = Math.round(Math.abs(fromY - toY));
    const label = options.labels?.[index] ?? String(segmentMm);
    if (segmentMm <= 0 || label.trim().length === 0) continue;

    texts.push({
      x: options.dimensionX + (options.textSide === 'right' ? 14 : -14),
      y: (fromY + toY) / 2,
      text: label,
      height: 18,
      layer: HINGE_MATCH_DIMENSIONS_LAYER,
      color: 1
    });
  }
};

const resolveDoorHingePositionsForPdf = (
  module: PlacedModule,
  doorBottomOnBodyMm: number,
  doorHeightMm: number
): { doorPositionsMm: number[]; sidePositionsMm: number[] } => {
  const registryGeometry = findDoorHingeGeometry(module.id, 'hingePositionsMm');

  if (registryGeometry && registryGeometry.doorPositionsMm.length > 0) {
    return {
      doorPositionsMm: registryGeometry.doorPositionsMm,
      sidePositionsMm: registryGeometry.doorPositionsMm.map(position => registryGeometry.doorBottomOnSideMm + position)
    };
  }

  if (Array.isArray(module.hingePositionsMm) && module.hingePositionsMm.length > 0) {
    const sidePositionsMm = module.hingePositionsMm
      .filter(position => Number.isFinite(position))
      .sort((a, b) => a - b);

    return {
      doorPositionsMm: sidePositionsMm
        .map(position => position - doorBottomOnBodyMm)
        .filter(position => position >= 0 && position <= doorHeightMm),
      sidePositionsMm
    };
  }

  const doorPositionsMm = calculateHingePositions(doorHeightMm);
  return {
    doorPositionsMm,
    sidePositionsMm: doorPositionsMm.map(position => doorBottomOnBodyMm + position)
  };
};

const buildTopToBottomChainLabels = (
  heightMm: number,
  positionsFromBottomMm: number[]
): string[] => {
  const roundedHeightMm = Math.max(0, Math.round(heightMm));
  if (roundedHeightMm <= 0) return [];

  const topDistancesMm = Array.from(new Set(
    positionsFromBottomMm
      .filter(position => Number.isFinite(position))
      .map(position => Math.max(0, Math.min(roundedHeightMm, Math.round(roundedHeightMm - position))))
  )).sort((a, b) => a - b);
  const anchorsMm = [0, ...topDistancesMm, roundedHeightMm];

  return anchorsMm
    .slice(0, -1)
    .map((distanceMm, index) => Math.max(0, anchorsMm[index + 1] - distanceMm))
    .filter(segmentMm => segmentMm > 0)
    .map(segmentMm => String(segmentMm));
};

export const buildPdfHingeCoordinateDrawingData = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  target: HingeCoordinateDrawingTarget
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const lines: ParsedLine[] = [];
  const texts: ParsedText[] = [];
  const basicThickness = spaceInfo.panelThickness || 18;
  const sideDepthOffsetsMm = [20, 52];

  placedModules
    .filter(isHingedDoorModule)
    .forEach((module, moduleIndex) => {
      const moduleData = resolveModuleDataForHingeCoordinates(spaceInfo, module);
      const doorDrawingItem = resolvePdfDoorDrawingItem(module, moduleData as PdfDoorDrawingModuleData);
      if (!doorDrawingItem) return;

      doorDrawingItem.items
        .filter(item => item.type === 'door')
        .forEach(item => {
          const hingeSide = item.hingeSide ?? module.hingePosition ?? 'right';
          const doorLeftX = doorDrawingItem.furnitureX + item.x;
          const doorRightX = doorLeftX + item.width;
          const doorBottomY = item.y;
          const { doorPositionsMm, sidePositionsMm } = resolveDoorHingePositionsForPdf(
            module,
            item.y,
            item.height
          );

          doorPositionsMm.forEach((doorPositionMm, hingeIndex) => {
            const sidePositionMm = sidePositionsMm[hingeIndex] ?? item.y + doorPositionMm;
            const hingeLabel = `H${hingeIndex + 1}`;

            if (target === 'door') {
              const cupX = doorLeftX + (
                hingeSide === 'left'
                  ? DEFAULT_HINGE_SETTINGS.cupEdgeDistance
                  : item.width - DEFAULT_HINGE_SETTINGS.cupEdgeDistance
              );
              const cupY = item.y + doorPositionMm;
              const layer = HINGE_MATCH_DOOR_LAYER;
              const dimensionX = hingeSide === 'left' ? doorLeftX - 38 : doorRightX + 38;
              const textSide = hingeSide === 'left' ? 'left' : 'right';

              addCross(lines, cupX, cupY, 10, layer);
              lines.push(
                { x1: cupX - 17.5, y1: cupY - 17.5, x2: cupX + 17.5, y2: cupY - 17.5, layer, color: 1 },
                { x1: cupX + 17.5, y1: cupY - 17.5, x2: cupX + 17.5, y2: cupY + 17.5, layer, color: 1 },
                { x1: cupX + 17.5, y1: cupY + 17.5, x2: cupX - 17.5, y2: cupY + 17.5, layer, color: 1 },
                { x1: cupX - 17.5, y1: cupY + 17.5, x2: cupX - 17.5, y2: cupY - 17.5, layer, color: 1 }
              );
              addVerticalDimensionGuide(lines, texts, {
                referenceX: cupX,
                dimensionX,
                fromY: doorBottomY,
                toY: cupY,
                label: `DOOR ${hingeLabel} ${formatMm(doorPositionMm)}`,
                textSide
              });
              if (hingeIndex === 0) {
                const hingeEdgeX = hingeSide === 'left' ? doorLeftX : doorRightX;
                const edgeGuideY = cupY + 34;
                addHorizontalDimensionGuide(lines, texts, {
                  fromX: hingeEdgeX,
                  toX: cupX,
                  referenceY: cupY,
                  dimensionY: edgeGuideY,
                  label: `EDGE ${formatMm(DEFAULT_HINGE_SETTINGS.cupEdgeDistance)}`
                });
                texts.push({
                  x: cupX + (hingeSide === 'left' ? 36 : -36),
                  y: cupY - 22,
                  text: 'CUP D35',
                  height: 18,
                  layer: HINGE_MATCH_DIMENSIONS_LAYER,
                  color: 1
                });
              }
              return;
            }

            if (target === 'body-front') {
              const sideX = hingeSide === 'left'
                ? doorDrawingItem.furnitureX + basicThickness / 2
                : doorDrawingItem.furnitureX + doorDrawingItem.furnitureWidth - basicThickness / 2;
              const sideY = sidePositionMm;
              const layer = HINGE_MATCH_BODY_LAYER;
              const dimensionX = hingeSide === 'left'
                ? doorDrawingItem.furnitureX - 38
                : doorDrawingItem.furnitureX + doorDrawingItem.furnitureWidth + 38;

              lines.push({
                x1: sideX - basicThickness / 2,
                y1: sideY,
                x2: sideX + basicThickness / 2,
                y2: sideY,
                layer,
                color: 1
              });
              addCross(lines, sideX, sideY, 7, layer);
              addVerticalDimensionGuide(lines, texts, {
                referenceX: sideX,
                dimensionX,
                fromY: 0,
                toY: sideY,
                label: `BODY ${hingeLabel} ${formatMm(sidePositionMm)}`,
                textSide: hingeSide === 'left' ? 'left' : 'right'
              });
              return;
            }

            const moduleDepthMm = resolvePlacedModuleExportDepth(spaceInfo, module);
            const sideY = sidePositionMm;
            const layer = HINGE_MATCH_BODY_LAYER;
            const dimensionX = moduleDepthMm + 32;

            sideDepthOffsetsMm.forEach(offsetFromFrontMm => {
              const x = moduleDepthMm - offsetFromFrontMm;
              addCross(lines, x, sideY, 7, layer);
            });
            lines.push({
              x1: moduleDepthMm - sideDepthOffsetsMm[sideDepthOffsetsMm.length - 1],
              y1: sideY,
              x2: moduleDepthMm - sideDepthOffsetsMm[0],
              y2: sideY,
              layer,
              color: 1
            });
            addVerticalDimensionGuide(lines, texts, {
              referenceX: moduleDepthMm - sideDepthOffsetsMm[0],
              dimensionX,
              fromY: 0,
              toY: sideY,
              label: `BODY ${hingeLabel} ${formatMm(sidePositionMm)}`,
              textSide: 'right'
            });
            if (hingeIndex === 0) {
              const depthGuideY = sideY + 32 + moduleIndex * 16;
              sideDepthOffsetsMm.forEach(offsetFromFrontMm => {
                addHorizontalDimensionGuide(lines, texts, {
                  fromX: moduleDepthMm,
                  toX: moduleDepthMm - offsetFromFrontMm,
                  referenceY: sideY,
                  dimensionY: depthGuideY + offsetFromFrontMm / 4,
                  label: `F${formatMm(offsetFromFrontMm)}`
                });
              });
            }
          });
        });
    });

  return { lines, texts };
};

const appendHingeCoordinateDrawingData = (
  base: { lines: ParsedLine[]; texts: ParsedText[] },
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  target: HingeCoordinateDrawingTarget
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const hingeData = buildActualHingeDimensionData(base, spaceInfo, placedModules, target);
  return {
    lines: [...base.lines, ...hingeData.lines],
    texts: [...base.texts, ...hingeData.texts]
  };
};

const isActualHingeLine = (line: ParsedLine): boolean => (
  `${line.sourceName ?? ''} ${line.sourcePath ?? ''}`.toLowerCase().includes('door-hinge')
);

const getParsedLineBounds = (lines: ParsedLine[]) => {
  if (lines.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  lines.forEach(line => {
    minX = Math.min(minX, line.x1, line.x2);
    maxX = Math.max(maxX, line.x1, line.x2);
    minY = Math.min(minY, line.y1, line.y2);
    maxY = Math.max(maxY, line.y1, line.y2);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};

const clusterActualHingeCenters = (hingeLines: ParsedLine[]): Array<{ x: number; y: number }> => {
  const sourceBounds = new Map<string, ParsedLine[]>();
  hingeLines.forEach(line => {
    const key = `${line.sourcePath ?? line.sourceName ?? 'door-hinge'}:${Math.round((line.y1 + line.y2) / 2 / 80)}`;
    sourceBounds.set(key, [...(sourceBounds.get(key) ?? []), line]);
  });

  const centers = Array.from(sourceBounds.values())
    .map(lines => getParsedLineBounds(lines))
    .filter((bounds): bounds is NonNullable<ReturnType<typeof getParsedLineBounds>> => Boolean(bounds))
    .map(bounds => ({
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    }))
    .sort((a, b) => a.y - b.y);

  return centers.filter((center, index) => (
    index === 0 || Math.abs(center.y - centers[index - 1].y) > 40
  ));
};

const buildActualDoorHingeDimensionData = (
  base: { lines: ParsedLine[]; texts: ParsedText[] },
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[]
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const hingeLines = base.lines.filter(line => line.layer === 'DOOR' && isActualHingeLine(line));
  if (hingeLines.length === 0) return { lines: [], texts: [] };

  const doorBounds = getParsedLineBounds(base.lines.filter(line => line.layer === 'DOOR' && !isActualHingeLine(line)));
  if (!doorBounds) return { lines: [], texts: [] };

  const centers = clusterActualHingeCenters(hingeLines);
  const lines: ParsedLine[] = [];
  const texts: ParsedText[] = [];
  const guideX = doorBounds.minX - Math.max(36, doorBounds.width * 0.04);
  const textSide: 'left' | 'right' = 'left';
  const hingeYs = centers
    .map(center => center.y)
    .filter(y => y > doorBounds.minY && y < doorBounds.maxY);
  const labelCandidates = placedModules
    .filter(isHingedDoorModule)
    .flatMap(module => {
      const moduleData = resolveModuleDataForHingeCoordinates(spaceInfo, module);
      const doorDrawingItem = resolvePdfDoorDrawingItem(module, moduleData as PdfDoorDrawingModuleData);
      if (!doorDrawingItem) return [];

      return doorDrawingItem.items
        .filter(item => item.type === 'door')
        .map(item => {
          const { doorPositionsMm } = resolveDoorHingePositionsForPdf(module, item.y, item.height);
          return buildTopToBottomChainLabels(item.height, doorPositionsMm);
        })
        .filter(labels => labels.length > 0);
    });
  const labels = labelCandidates.find(candidate => candidate.length === hingeYs.length + 1);

  addVerticalChainDimensionGuide(lines, texts, {
    referenceX: doorBounds.minX,
    dimensionX: guideX,
    anchorsY: [doorBounds.maxY, ...hingeYs, doorBounds.minY],
    labels,
    textSide
  });

  return { lines, texts };
};

const buildActualBodyFrontHingeDimensionData = (
  base: { lines: ParsedLine[]; texts: ParsedText[] },
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[]
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const bodyLayers = new Set(['FURNITURE_PANEL', 'BACK_PANEL', 'DRAWER', 'WOOD_CHANNEL', 'END_PANEL']);
  const bodyBounds = getParsedLineBounds(base.lines.filter(line => bodyLayers.has(line.layer)));
  if (!bodyBounds) return { lines: [], texts: [] };

  const lines: ParsedLine[] = [];
  const texts: ParsedText[] = [];
  const baseGuideOffset = Math.max(36, bodyBounds.width * 0.04);
  const hingedModules = placedModules.filter(isHingedDoorModule);

  hingedModules.forEach(module => {
    const moduleData = resolveModuleDataForHingeCoordinates(spaceInfo, module);
    const doorDrawingItem = resolvePdfDoorDrawingItem(module, moduleData as PdfDoorDrawingModuleData);
    if (!doorDrawingItem) return;

    const doorItems = doorDrawingItem.items.filter(item => item.type === 'door');
    if (doorItems.length === 0) return;

    const itemPositions = doorItems.flatMap(item => {
      const { sidePositionsMm } = resolveDoorHingePositionsForPdf(module, item.y, item.height);
      return sidePositionsMm;
    });
    const uniqueSidePositionsMm = Array.from(new Set(
      itemPositions
        .filter(position => Number.isFinite(position))
        .map(position => Math.round(position))
    )).sort((a, b) => a - b);
    if (uniqueSidePositionsMm.length === 0) return;

    const moduleHeightMm = Math.max(doorDrawingItem.furnitureHeight, 1);
    const moduleLeftX = doorDrawingItem.furnitureX;
    const moduleRightX = doorDrawingItem.furnitureX + doorDrawingItem.furnitureWidth;
    const hingeSide = doorItems[0]?.hingeSide ?? module.hingePosition ?? 'right';
    const referenceX = hingeSide === 'left' ? moduleLeftX : moduleRightX;
    const dimensionX = hingeSide === 'left'
      ? moduleLeftX - baseGuideOffset
      : moduleRightX + baseGuideOffset;
    const textSide: 'left' | 'right' = hingeSide === 'left' ? 'left' : 'right';
    const labels = buildTopToBottomChainLabels(moduleHeightMm, uniqueSidePositionsMm);
    const hingeYs = uniqueSidePositionsMm.map(positionMm => {
      const ratio = Math.max(0, Math.min(1, positionMm / moduleHeightMm));
      return bodyBounds.minY + moduleHeightMm * ratio;
    });

    addVerticalChainDimensionGuide(lines, texts, {
      referenceX,
      dimensionX,
      anchorsY: [bodyBounds.minY + moduleHeightMm, ...hingeYs, bodyBounds.minY],
      labels,
      textSide
    });
  });

  return { lines, texts };
};

const buildActualBodyHingeDimensionData = (
  base: { lines: ParsedLine[]; texts: ParsedText[] },
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  target: HingeCoordinateDrawingTarget
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const bodyLayers = new Set(['FURNITURE_PANEL', 'BACK_PANEL', 'DRAWER', 'WOOD_CHANNEL', 'END_PANEL']);
  const bodyBounds = getParsedLineBounds(base.lines.filter(line => bodyLayers.has(line.layer)));
  if (!bodyBounds) return { lines: [], texts: [] };

  const lines: ParsedLine[] = [];
  const texts: ParsedText[] = [];
  const textSide: 'left' | 'right' = target === 'body-side' ? 'right' : 'left';
  const baseGuideOffset = target === 'body-side'
    ? Math.max(24, bodyBounds.width * 0.08)
    : Math.max(36, bodyBounds.width * 0.04);
  const guideStep = Math.max(22, bodyBounds.width * 0.045);
  const hingedModules = placedModules.filter(isHingedDoorModule);

  hingedModules.forEach((module, moduleIndex) => {
    const moduleData = resolveModuleDataForHingeCoordinates(spaceInfo, module);
    const doorDrawingItem = resolvePdfDoorDrawingItem(module, moduleData as PdfDoorDrawingModuleData);
    if (!doorDrawingItem) return;

    const doorItems = doorDrawingItem.items.filter(item => item.type === 'door');
    if (doorItems.length === 0) return;

    const itemPositions = doorItems.flatMap(item => {
      const { sidePositionsMm } = resolveDoorHingePositionsForPdf(module, item.y, item.height);
      return sidePositionsMm;
    });
    const uniqueSidePositionsMm = Array.from(new Set(
      itemPositions
        .filter(position => Number.isFinite(position))
        .map(position => Math.round(position))
    )).sort((a, b) => a - b);
    if (uniqueSidePositionsMm.length === 0) return;

    const moduleHeightMm = Math.max(doorDrawingItem.furnitureHeight, 1);
    const labels = buildTopToBottomChainLabels(moduleHeightMm, uniqueSidePositionsMm);
    const hingeYs = uniqueSidePositionsMm.map(positionMm => {
      const ratio = Math.max(0, Math.min(1, positionMm / moduleHeightMm));
      return bodyBounds.minY + bodyBounds.height * ratio;
    });
    const dimensionX = target === 'body-side'
      ? bodyBounds.maxX + baseGuideOffset + guideStep * moduleIndex
      : bodyBounds.minX - baseGuideOffset - guideStep * moduleIndex;

    addVerticalChainDimensionGuide(lines, texts, {
      referenceX: target === 'body-side' ? bodyBounds.maxX : bodyBounds.minX,
      dimensionX,
      anchorsY: [bodyBounds.maxY, ...hingeYs, bodyBounds.minY],
      labels,
      textSide
    });
  });

  return { lines, texts };
};

const buildActualHingeDimensionData = (
  base: { lines: ParsedLine[]; texts: ParsedText[] },
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  target: HingeCoordinateDrawingTarget
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  if (target === 'door') {
    return buildActualDoorHingeDimensionData(base, spaceInfo, placedModules);
  }

  if (target === 'body-front') {
    return buildActualBodyFrontHingeDimensionData(base, spaceInfo, placedModules);
  }

  return buildActualBodyHingeDimensionData(base, spaceInfo, placedModules, target);
};

export const resolvePlacedModuleExportDepth = (
  spaceInfo: SpaceInfo,
  module: PlacedModule
): number => {
  const explicitDepths = [
    module.upperSectionDepth,
    module.lowerSectionDepth,
    module.customDepth,
    module.freeDepth,
    module.lowerLeftSectionDepth,
    module.lowerRightSectionDepth,
    ...(module.sectionDepths ?? [])
  ].filter((depth): depth is number => typeof depth === 'number' && Number.isFinite(depth) && depth > 0);

  const categoryDefaultDepth = getCategoryDefaultFurnitureDepth(
    spaceInfo.depth,
    module.moduleId,
    spaceInfo.furnitureDepthDefaults
  );

  if (explicitDepths.length === 0) {
    return categoryDefaultDepth ?? Math.min(spaceInfo.depth || 600, 600);
  }

  const explicitDepth = Math.max(...explicitDepths);

  if ((module.moduleId || '').includes('-entryway-') && Math.abs(explicitDepth - 400) < 0.5) {
    return categoryDefaultDepth ?? 380;
  }

  return explicitDepth;
};

export const resolveMaxPlacedModuleExportDepth = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[]
): number => {
  if (placedModules.length === 0) {
    return Math.min(spaceInfo.depth || 600, 600);
  }

  return Math.max(...placedModules.map(module => resolvePlacedModuleExportDepth(spaceInfo, module)));
};

// 뷰 제목 (jsPDF는 한글 미지원, 영문만 사용)
const getViewTitle = (v: PdfViewDirection): string => {
  const titles: Record<string, string> = {
    'front': 'Front View (With Doors)',
    'front-no-door': 'Front View (Without Doors)',
    'left': 'Side View',
    'top': 'Top View (Plan)',
    'door-only': 'Door Drawing (Doors Only)'
  };
  return titles[v] || 'Drawing';
};

// 측면뷰 필터
const getSideViewFilter = (v: PdfViewDirection): SideViewFilter => {
  if (v === 'left') return 'leftmost';
  return 'all';
};

// PDF 뷰 방향을 DXF 뷰 방향으로 변환 (door-only는 front로 처리 후 별도 필터링)
const pdfViewToViewDirection = (v: PdfViewDirection): 'front' | 'left' | 'top' => {
  if (v === 'front' || v === 'front-no-door') return 'front';
  if (v === 'left') return 'left';
  if (v === 'top') return 'top';
  return 'front'; // door-only는 front로 처리 (별도 렌더링)
};

/**
 * DXF 데이터를 PDF 페이지에 렌더링
 */
const renderToPdf = (
  pdf: jsPDF,
  lines: ParsedLine[],
  texts: ParsedText[],
  spaceInfo: SpaceInfo,
  viewDirection: PdfViewDirection,
  pageWidth: number,
  pageHeight: number,
  placedModules?: PlacedModule[],
  lineStyle: PdfLineStyle = 'monochrome'
) => {
  const margin = 20;
  const titleHeight = 15;
  const drawableWidth = pageWidth - margin * 2;
  const drawableHeight = pageHeight - margin * 2 - titleHeight;
  const centerX = margin + drawableWidth / 2;
  const centerY = margin + titleHeight + drawableHeight / 2;

  // 바운딩 박스 계산
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  lines.forEach(l => {
    minX = Math.min(minX, l.x1, l.x2);
    minY = Math.min(minY, l.y1, l.y2);
    maxX = Math.max(maxX, l.x1, l.x2);
    maxY = Math.max(maxY, l.y1, l.y2);
  });
  texts.forEach(t => {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  });

  if (minX === Infinity) {
    console.warn(`⚠️ ${viewDirection}: 렌더링할 데이터가 없습니다`);
    return;
  }

  const dxfWidth = maxX - minX;
  const dxfHeight = maxY - minY;
  const scale = Math.min(drawableWidth / dxfWidth, drawableHeight / dxfHeight) * 0.85;

  const toX = (x: number) => centerX + (x - (minX + maxX) / 2) * scale;
  const toY = (y: number) => centerY - (y - (minY + maxY) / 2) * scale;

  // 제목
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text(getViewTitle(viewDirection), pageWidth / 2, margin + 8, { align: 'center' });

  // 라인
  lines.forEach(line => {
    let lw = 0.1;
    if (line.layer === 'DIMENSIONS') lw = 0.08;
    else if (
      line.layer === HINGE_MATCH_BODY_LAYER ||
      line.layer === HINGE_MATCH_DOOR_LAYER ||
      line.layer === HINGE_MATCH_DIMENSIONS_LAYER
    ) lw = 0.09;
    else if (line.layer === 'SPACE_FRAME') lw = 0.15;
    else if (line.layer === 'FURNITURE_PANEL' || line.layer === 'WOOD_CHANNEL') lw = 0.12;
    else if (line.layer === 'BACK_PANEL') lw = 0.05;

    const color = resolvePdfLineColor(line, lineStyle);
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(lw);
    pdf.line(toX(line.x1), toY(line.y1), toX(line.x2), toY(line.y2));
  });

  // 텍스트
  texts.forEach(text => {
    const color = resolvePdfTextColor(text, lineStyle);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.setFontSize(Math.max(text.height * scale * 0.5, 6));
    pdf.text(text.text, toX(text.x), toY(text.y), { align: 'center' });
  });

  const furnitureDepth = resolveMaxPlacedModuleExportDepth(spaceInfo, placedModules ?? []);

  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(`${spaceInfo.width}mm × ${spaceInfo.height}mm × ${furnitureDepth}mm`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
};

/**
 * 단일 뷰에 대한 DXF 생성 및 파싱
 * generateDxfDrawingData를 직접 호출하여 씬에서 추출한 라인/텍스트를 사용
 * @param excludeDoor 도어 관련 객체 제외 여부 (front-no-door용)
 */
export const generateViewDataFromDxf = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: PdfViewDirection,
  excludeDoor: boolean = false
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const sideViewFilter = getSideViewFilter(viewDirection);

  console.log('[DXF] ' + viewDirection + ': calling generateDxfDrawingData... (excludeDoor=' + excludeDoor + ')');

  try {
    const drawingData = generateDxfDrawingData(
      spaceInfo,
      placedModules,
      viewDirection as ViewDirection,
      sideViewFilter,
      excludeDoor
    );

    const lines = drawingData.lines;
    const texts = drawingData.texts;

    console.log('[DXF] ' + viewDirection + ': extracted ' + lines.length + ' lines, ' + texts.length + ' texts from scene data');

    return { lines, texts };
  } catch (error) {
    console.error(`❌ ${viewDirection}: DXF 생성 실패`, error);
    return { lines: [], texts: [] };
  }
};

/**
 * DXF 데이터를 PDF로 내보내기
 *
 * DXF 내보내기(useDXFExport)와 완전히 동일한 방식:
 * - 각 뷰마다 generateDxfFromData 호출
 * - 생성된 DXF 문자열을 파싱하여 PDF에 렌더링
 *
 * 주의: 이 함수는 현재 씬 상태에서 추출하므로,
 * 호출 전에 씬이 적절한 2D 모드로 설정되어 있어야 함
 */
export const downloadDxfAsPdf = async (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  views: PdfViewDirection[] = ['front', 'top', 'left', 'door-only'],
  appendSheetPage: boolean = false,
  sheetMetadata: SheetMetadata = {},
  options: PdfExportOptions = {},
): Promise<void> => {
  console.log('[PDF] DXF to PDF conversion starting...');
  console.log('[PDF] Views to convert: ' + views.join(', '));
  const lineStyle = options.lineStyle ?? 'monochrome';

  // 현재 뷰 상태 저장 (나중에 복원)
  const originalUI = captureExportUiState(useUIStore.getState());
  console.log(`[PDF] 원래 뷰 모드: ${originalUI.viewMode}/${originalUI.view2DDirection}/${originalUI.renderMode}`);

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // 슬롯 정보 계산 (측면도 슬롯별 페이지 생성용)
  // ColumnIndexer를 사용하여 정확한 슬롯 개수 계산
  const indexing = ColumnIndexer.calculateSpaceIndexing(spaceInfo);
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;

  // indexing.zones가 있으면 해당 정보 사용, 없으면 columnCount 사용
  const normalSlotCount = indexing.zones?.normal.columnCount || indexing.columnCount;
  const droppedSlotCount = hasDroppedCeiling && indexing.zones?.dropped
    ? indexing.zones.dropped.columnCount
    : 0;

  // 가구가 있는 슬롯만 추출 (측면도는 가구가 있는 슬롯만 페이지 생성)
  // slotIndex가 없는 가구는 X 위치로 슬롯 계산
  const occupiedSlotIndices = new Set<number>();
  const slotWidth = spaceInfo.width / normalSlotCount;

  console.log('📐 슬롯 계산 시작:', { slotWidth, normalSlotCount, moduleCount: placedModules.length });

  placedModules.forEach((m, idx) => {
    let globalSlotIndex: number;

    if (m.slotIndex !== undefined) {
      // slotIndex가 있는 경우
      globalSlotIndex = m.slotIndex;
      if (hasDroppedCeiling && m.zone === 'dropped') {
        globalSlotIndex = normalSlotCount + m.slotIndex;
      }
      console.log(`  가구 ${idx}: slotIndex=${m.slotIndex} → globalSlot=${globalSlotIndex}`);
    } else {
      // slotIndex가 없는 경우 X 위치로 슬롯 계산
      const moduleX = m.position?.x ?? 0;
      globalSlotIndex = Math.floor(moduleX / slotWidth);
      globalSlotIndex = Math.max(0, Math.min(globalSlotIndex, normalSlotCount - 1));
      console.log(`  가구 ${idx}: position.x=${moduleX} → globalSlot=${globalSlotIndex}`);
    }

    occupiedSlotIndices.add(globalSlotIndex);
  });

  // 가구가 있는데 슬롯이 비어있으면 기본 슬롯 0 추가
  if (placedModules.length > 0 && occupiedSlotIndices.size === 0) {
    console.log('⚠️ 가구가 있지만 슬롯 계산 실패 - 기본 슬롯 0 사용');
    occupiedSlotIndices.add(0);
  }

  const sortedOccupiedSlots = Array.from(occupiedSlotIndices).sort((a, b) => a - b);

  console.log('📊 슬롯 정보:', {
    indexingColumnCount: indexing.columnCount,
    zonesNormal: indexing.zones?.normal.columnCount,
    zonesDropped: indexing.zones?.dropped?.columnCount,
    normalSlotCount,
    droppedSlotCount,
    occupiedSlotIndices: sortedOccupiedSlots,
    hasDroppedCeiling
  });

  let isFirstPage = true;

  try {
  for (const viewDirection of views) {
    // 각 뷰에 맞는 씬 상태로 전환
    if (viewDirection === 'left') {
      await switchSceneViewMode('2D', 'left', 'wireframe');
    } else if (viewDirection === 'top') {
      await switchSceneViewMode('2D', 'top', 'wireframe');
    } else {
      // front, front-no-door, door-only 모두 front 방향 필요
      await switchSceneViewMode('2D', 'front', 'wireframe');
    }

    // 측면도(left)는 슬롯별 그룹 기준으로 페이지 생성
    if (viewDirection === 'left' && placedModules.length > 0) {
      const sideSlotGroups = getSideViewSlotGroups(placedModules);

      try {
        for (const group of sideSlotGroups) {
          console.log(`[DXF] left (슬롯 ${group.titleIndex}): modules=${group.modules.length}`);

          applyExportUiPatchIfChanged(createExportViewUiPatch('left', group.selectedSlotIndex));
          // 씬 갱신 대기 (React 렌더 + R3F 반영)
          await new Promise(resolve => setTimeout(resolve, 600));

          const dxfViewDirection = pdfViewToViewDirection(viewDirection);
          const baseData = generateViewDataFromDxf(spaceInfo, group.modules, dxfViewDirection);
          const { lines, texts } = appendHingeCoordinateDrawingData(baseData, spaceInfo, group.modules, 'body-side');
          console.log(`[DXF] left (슬롯 ${group.titleIndex}): ${lines.length} lines, ${texts.length} texts`);

          if (!hasPdfDrawingData(lines, texts)) {
            console.warn(`[DXF] left (슬롯 ${group.titleIndex}): 빈 측면도 페이지를 건너뜁니다.`);
            continue;
          }

          if (!isFirstPage) pdf.addPage();
          isFirstPage = false;

          renderToPdfWithSlotInfo(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight, group.titleIndex, group.modules, lineStyle);
        }
      } finally {
        useUIStore.setState(originalUI);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    // 도어 입면도 (DOOR 레이어만 표시 - 2D 뷰어에서 가구 필터 끈 것과 동일)
    else if (viewDirection === 'door-only') {
      console.log('[DXF] door-only: rendering door elevation...');

      // front 뷰 DXF 데이터 생성 후 DOOR 레이어만 필터링
      const dxfViewDirection = pdfViewToViewDirection(viewDirection);
      const { lines, texts } = generateViewDataFromDxf(spaceInfo, placedModules, dxfViewDirection);

      // 디버깅: 모든 텍스트의 레이어 정보 출력
      console.log('[DXF] door-only: total texts ' + texts.length, texts.map(t => ({ text: t.text, layer: t.layer })));
      console.log('[DXF] door-only: line layers:', [...new Set(lines.map(l => l.layer))]);

      // DOOR + DOOR_DIMENSIONS 레이어 필터링 (도어 형상 + 도어 높이/너비 치수선)
      const filteredDoorData = filterDoorOnlyDrawingData(lines, texts);
      const { lines: doorOnlyLines, texts: doorTexts } = appendHingeCoordinateDrawingData(filteredDoorData, spaceInfo, placedModules, 'door');

      console.log('[DXF] door-only: original ' + lines.length + ' lines -> DOOR layer ' + doorOnlyLines.length + ' lines, ' + doorTexts.length + ' texts');

      if (!hasPdfDrawingData(doorOnlyLines, doorTexts)) {
        console.warn('[DXF] door-only: 빈 도어도면 페이지를 건너뜁니다.');
        continue;
      }

      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;

      renderToPdf(pdf, doorOnlyLines, doorTexts, spaceInfo, viewDirection, pageWidth, pageHeight, placedModules, lineStyle);
    }
    // 입면도 (도어 없음) - DXF 생성 시 도어 제외
    else if (viewDirection === 'front-no-door') {
      console.log('[DXF] front-no-door: rendering elevation without doors (excludeDoor=true)...');

      // excludeDoor=true로 DXF 생성 시 도어 관련 객체 모두 제외
      // 'front'를 직접 전달하고 excludeDoor=true로 도어 필터링
      const frontNoDoorData = generateViewDataFromDxf(spaceInfo, placedModules, 'front', true);
      const { lines, texts } = appendHingeCoordinateDrawingData(frontNoDoorData, spaceInfo, placedModules, 'body-front');

      // 디버깅: 라인 레이어 확인 (DOOR가 있으면 안됨)
      const doorLines = lines.filter(l => l.layer === 'DOOR');
      const doorTexts = texts.filter(t => t.layer === 'DOOR');
      console.log('[DXF] front-no-door: DOOR layer lines ' + doorLines.length + ', texts ' + doorTexts.length + ' (should all be 0)');
      console.log('[DXF] front-no-door: ' + lines.length + ' lines, ' + texts.length + ' texts (doors excluded)');

      if (!hasPdfDrawingData(lines, texts)) {
        console.warn('[DXF] front-no-door: 빈 입면도 페이지를 건너뜁니다.');
        continue;
      }

      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;

      renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight, placedModules, lineStyle);
    }
    else {
      // 일반 뷰 (front, top)
      const dxfViewDirection = pdfViewToViewDirection(viewDirection);
      const baseData = generateViewDataFromDxf(spaceInfo, placedModules, dxfViewDirection);
      const { lines, texts } = baseData;
      console.log('[DXF] ' + viewDirection + ': final ' + lines.length + ' lines, ' + texts.length + ' texts');

      if (!hasPdfDrawingData(lines, texts)) {
        console.warn(`[DXF] ${viewDirection}: 빈 PDF 페이지를 건너뜁니다.`);
        continue;
      }

      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;

      renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight, placedModules, lineStyle);
    }
  }

  // "한 장 레이아웃" 요청 시 마지막에 장표 페이지 추가
  // (views가 비어서 첫 페이지가 아직 렌더되지 않았다면 기본 A4 페이지를 제거하고 A3로 대체)
  if (appendSheetPage) {
    if (isFirstPage) {
      // 초기 빈 A4 페이지를 A3 landscape로 교체 (첫 페이지이자 유일한 페이지가 장표)
      pdf.deletePage(1);
      pdf.addPage('a3', 'landscape');
      await renderSheetContent(pdf, spaceInfo, placedModules, sheetMetadata, lineStyle);
    } else {
      await appendSheetPageToPdf(pdf, spaceInfo, placedModules, sheetMetadata, lineStyle);
    }
  }

  if (isFirstPage) {
    pdf.setFontSize(14);
    pdf.setTextColor(150, 150, 150);
    pdf.text('No drawing data', pageWidth / 2, pageHeight / 2, { align: 'center' });
  }

  pdf.save(`drawing_${new Date().toISOString().slice(0, 10)}.pdf`);
  console.log('✅ PDF 다운로드 완료');

  } finally {
    // 원래 뷰 상태로 복원
    console.log(`[PDF] 뷰 모드 복원: ${originalUI.viewMode}/${originalUI.view2DDirection}/${originalUI.renderMode}`);
    useUIStore.setState(originalUI);
  }
};

/**
 * 슬롯 정보를 포함한 PDF 렌더링 (측면도용)
 */
const renderToPdfWithSlotInfo = (
  pdf: jsPDF,
  lines: ParsedLine[],
  texts: ParsedText[],
  spaceInfo: SpaceInfo,
  viewDirection: PdfViewDirection,
  pageWidth: number,
  pageHeight: number,
  slotNumber: number,
  slotModules?: PlacedModule[],
  lineStyle: PdfLineStyle = 'monochrome'
) => {
  const margin = 20;
  const titleHeight = 15;
  const drawableWidth = pageWidth - margin * 2;
  const drawableHeight = pageHeight - margin * 2 - titleHeight;
  const centerX = margin + drawableWidth / 2;
  const centerY = margin + titleHeight + drawableHeight / 2;

  const filteredLines = lines;
  const filteredTexts = texts;

  // 바운딩 박스 계산
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  filteredLines.forEach(l => {
    minX = Math.min(minX, l.x1, l.x2);
    minY = Math.min(minY, l.y1, l.y2);
    maxX = Math.max(maxX, l.x1, l.x2);
    maxY = Math.max(maxY, l.y1, l.y2);
  });
  filteredTexts.forEach(t => {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  });

  if (minX === Infinity) {
    // 데이터가 없으면 메시지 표시
    pdf.setFontSize(14);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Side View (Slot ${slotNumber}) - No data`, pageWidth / 2, pageHeight / 2, { align: 'center' });
    return;
  }

  const dxfWidth = maxX - minX;
  const dxfHeight = maxY - minY;
  const scale = Math.min(drawableWidth / dxfWidth, drawableHeight / dxfHeight) * 0.85;

  const toX = (x: number) => centerX + (x - (minX + maxX) / 2) * scale;
  const toY = (y: number) => centerY - (y - (minY + maxY) / 2) * scale;

  // 제목 (슬롯 번호 포함)
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Side View (Slot ${slotNumber})`, pageWidth / 2, margin + 8, { align: 'center' });

  // 라인
  filteredLines.forEach(line => {
    let lw = 0.1;
    if (line.layer === 'DIMENSIONS') lw = 0.08;
    else if (
      line.layer === HINGE_MATCH_BODY_LAYER ||
      line.layer === HINGE_MATCH_DOOR_LAYER ||
      line.layer === HINGE_MATCH_DIMENSIONS_LAYER
    ) lw = 0.09;
    else if (line.layer === 'SPACE_FRAME') lw = 0.15;
    else if (line.layer === 'FURNITURE_PANEL' || line.layer === 'WOOD_CHANNEL') lw = 0.12;
    else if (line.layer === 'BACK_PANEL') lw = 0.05;

    const color = resolvePdfLineColor(line, lineStyle);
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(lw);
    pdf.line(toX(line.x1), toY(line.y1), toX(line.x2), toY(line.y2));
  });

  // 텍스트
  filteredTexts.forEach(text => {
    const color = resolvePdfTextColor(text, lineStyle);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.setFontSize(Math.max(text.height * scale * 0.5, 6));
    pdf.text(text.text, toX(text.x), toY(text.y), { align: 'center' });
  });

  const furnitureDepth = resolveMaxPlacedModuleExportDepth(spaceInfo, slotModules ?? []);

  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(`${spaceInfo.width}mm × ${spaceInfo.height}mm × ${furnitureDepth}mm`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
};

// ========================================================================
// 🆕 한 장 레이아웃 장표 (Multi-view Drawing Sheet) — A3 가로 한 페이지에 조합
// ========================================================================

interface SheetRect { x: number; y: number; w: number; h: number; }

const renderViewToRect = (
  pdf: jsPDF,
  rect: SheetRect,
  title: string,
  lines: ParsedLine[],
  texts: ParsedText[],
  padding = 6,
  lineStyle: PdfLineStyle = 'monochrome',
) => {
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text(title, rect.x + 3, rect.y + 4);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  lines.forEach(l => {
    minX = Math.min(minX, l.x1, l.x2);
    minY = Math.min(minY, l.y1, l.y2);
    maxX = Math.max(maxX, l.x1, l.x2);
    maxY = Math.max(maxY, l.y1, l.y2);
  });
  texts.forEach(t => {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  });
  if (minX === Infinity) {
    pdf.setFontSize(7);
    pdf.setTextColor(160, 160, 160);
    pdf.text('no data', rect.x + rect.w / 2, rect.y + rect.h / 2, { align: 'center' });
    return;
  }
  const dxfW = maxX - minX;
  const dxfH = maxY - minY;
  const titleBar = 7;
  const drawW = rect.w - padding * 2;
  const drawH = rect.h - padding * 2 - titleBar;
  const scale = Math.min(drawW / dxfW, drawH / dxfH) * 0.92;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + titleBar + (rect.h - titleBar) / 2;
  const toX = (x: number) => cx + (x - (minX + maxX) / 2) * scale;
  const toY = (y: number) => cy - (y - (minY + maxY) / 2) * scale;

  lines.forEach(line => {
    let lw = 0.08;
    if (line.layer === 'DIMENSIONS') lw = 0.06;
    else if (
      line.layer === HINGE_MATCH_BODY_LAYER ||
      line.layer === HINGE_MATCH_DOOR_LAYER ||
      line.layer === HINGE_MATCH_DIMENSIONS_LAYER
    ) lw = 0.07;
    else if (line.layer === 'SPACE_FRAME') lw = 0.12;
    else if (line.layer === 'FURNITURE_PANEL' || line.layer === 'WOOD_CHANNEL') lw = 0.1;
    else if (line.layer === 'BACK_PANEL') lw = 0.04;
    const color = resolvePdfLineColor(line, lineStyle);
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(lw);
    pdf.line(toX(line.x1), toY(line.y1), toX(line.x2), toY(line.y2));
  });

  texts.forEach(t => {
    const color = resolvePdfTextColor(t, lineStyle);
    pdf.setTextColor(color[0], color[1], color[2]);
    const fs = Math.max(Math.min(t.height * scale * 0.45, 7), 4);
    pdf.setFontSize(fs);
    pdf.text(t.text, toX(t.x), toY(t.y), { align: 'center' });
  });
};

export interface SheetMetadata {
  projectName?: string;
  designName?: string;
  materialName?: string;
}

/**
 * 한글 포함 텍스트를 Canvas로 렌더 후 PNG dataURL 반환
 * jsPDF 기본 폰트가 한글을 지원하지 않아 PDF에서 깨지는 문제 회피용
 */
const renderKoreanTextToImage = (
  text: string,
  fontSize: number = 18,
  color: string = '#000000',
  fontWeight: string = 'normal',
): { dataUrl: string; widthPx: number; heightPx: number } | null => {
  if (!text) return null;
  try {
    // 고해상도 렌더를 위해 scale 2x
    const scale = 2;
    const padding = 4;
    const fontStack = `${fontWeight} ${fontSize * scale}px "Pretendard", "Noto Sans KR", "Malgun Gothic", "AppleSDGothicNeo", sans-serif`;

    // 측정용 canvas
    const measure = document.createElement('canvas');
    const mCtx = measure.getContext('2d');
    if (!mCtx) return null;
    mCtx.font = fontStack;
    const metrics = mCtx.measureText(text);
    const textW = Math.ceil(metrics.width);
    const textH = Math.ceil(fontSize * scale * 1.3);

    const canvas = document.createElement('canvas');
    canvas.width = textW + padding * 2;
    canvas.height = textH + padding * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = 'rgba(255,255,255,0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = fontStack;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(text, padding, padding);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthPx: canvas.width,
      heightPx: canvas.height,
    };
  } catch (err) {
    console.warn('[PDF] 한글 텍스트 이미지 변환 실패:', text, err);
    return null;
  }
};

/**
 * PDF에 한글 포함 텍스트를 렌더 — 한글이 포함되면 이미지로, 순수 ASCII면 기본 text()
 */
const drawTextSafe = (
  pdf: jsPDF,
  text: string,
  xMm: number,
  yMm: number,
  fontSizePt: number = 8,
  color: [number, number, number] = [0, 0, 0],
) => {
  // eslint-disable-next-line no-control-regex
  const hasNonAscii = /[^\x00-\x7F]/.test(text);
  if (!hasNonAscii) {
    pdf.setFontSize(fontSizePt);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(text, xMm, yMm);
    return;
  }
  // 한글 포함 → Canvas 이미지로
  const colorHex = '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');
  // fontSizePt(PDF pt) → Canvas px: 대략 pt*2.5px 크기로 렌더 후 동일 mm 치수 유지
  const img = renderKoreanTextToImage(text, Math.round(fontSizePt * 2.5), colorHex);
  if (!img) return;
  // 1pt ≈ 0.353mm → 실제 폰트 크기 = fontSizePt * 0.353mm 높이
  const targetHmm = fontSizePt * 0.45;
  const aspect = img.widthPx / img.heightPx;
  const targetWmm = targetHmm * aspect;
  // baseline 보정: pdf.text는 y가 baseline, Canvas는 top → y - targetHmm*0.75
  const yAdjustedMm = yMm - targetHmm * 0.75;
  try {
    pdf.addImage(img.dataUrl, 'PNG', xMm, yAdjustedMm, targetWmm, targetHmm);
  } catch (err) {
    console.warn('[PDF] 한글 텍스트 이미지 삽입 실패:', text, err);
  }
};

/**
 * 텍스처 이미지 URL을 PNG dataURL로 변환 (jsPDF addImage용)
 * 실패 시 null 반환
 */
const loadTextureAsDataUrl = async (
  url: string,
  maxSize: number = 256,
): Promise<{ dataUrl: string; w: number; h: number } | null> => {
  if (!url) {
    console.log('[PDF] 텍스처 URL 없음');
    return null;
  }
  console.log('[PDF] 텍스처 로드 시작:', url);
  return new Promise((resolve) => {
    try {
      const img = new Image();
      // CORS: 같은 origin이면 무관, 외부면 필요 — 둘 다 시도
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.warn('[PDF] Canvas 2D context 없음');
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/png');
          console.log('[PDF] 텍스처 변환 성공:', url, `${w}x${h}`);
          resolve({ dataUrl, w, h });
        } catch (err) {
          console.warn('[PDF] 텍스처 Canvas 변환 실패 (tainted?):', url, err);
          resolve(null);
        }
      };
      img.onerror = (err) => {
        console.warn('[PDF] 텍스처 로드 실패 (404 또는 네트워크):', url, err);
        // crossOrigin 없이 재시도
        const img2 = new Image();
        img2.onload = () => {
          try {
            const ratio = Math.min(maxSize / img2.width, maxSize / img2.height, 1);
            const w = Math.round(img2.width * ratio);
            const h = Math.round(img2.height * ratio);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img2, 0, 0, w, h);
            resolve({ dataUrl: canvas.toDataURL('image/png'), w, h });
          } catch {
            resolve(null);
          }
        };
        img2.onerror = () => resolve(null);
        img2.src = url;
      };
      img.src = url;
    } catch (err) {
      console.warn('[PDF] 텍스처 로드 예외:', err);
      resolve(null);
    }
  });
};

/**
 * 기존 PDF 인스턴스에 "한 장 레이아웃" 페이지 추가
 * (downloadDxfAsPdf 내부에서 호출)
 */
export const appendSheetPageToPdf = async (
  pdf: jsPDF,
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  metadata: SheetMetadata = {},
  lineStyle: PdfLineStyle = 'monochrome',
): Promise<void> => {
  // 현재 포맷과 다르면 A3 landscape 페이지 추가
  pdf.addPage('a3', 'landscape');
  await renderSheetContent(pdf, spaceInfo, placedModules, metadata, lineStyle);
};

/** 현재 페이지에 "한 장 장표" 렌더링 — 기존 PDF에 append 가능 */
const renderSheetContent = async (
  pdf: jsPDF,
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  metadata: SheetMetadata = {},
  lineStyle: PdfLineStyle = 'monochrome',
): Promise<void> => {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const titleBlockW = 55;

  const areaX = margin;
  const areaY = margin;
  const areaW = pageW - margin * 2 - titleBlockW;
  const areaH = pageH - margin * 2;
  const topH = areaH * 0.5;
  const botH = areaH - topH;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.4);
  pdf.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
  pdf.setLineWidth(0.2);
  pdf.line(areaX, areaY + topH, areaX + areaW, areaY + topH);
  pdf.line(pageW - margin - titleBlockW, margin, pageW - margin - titleBlockW, pageH - margin);

  // ═══════════════════════════════════════════════════════════
  // 각 뷰 추출 — 원본 downloadDxfAsPdf와 동일한 순서로 씬 전환
  // ═══════════════════════════════════════════════════════════

  // ─ 1) Front (with/without doors + door-only)
  await switchSceneViewMode('2D', 'front', 'wireframe');
  const frontWith = generateViewDataFromDxf(spaceInfo, placedModules, 'front', false);
  const frontNo = appendHingeCoordinateDrawingData(
    generateViewDataFromDxf(spaceInfo, placedModules, 'front', true),
    spaceInfo,
    placedModules,
    'body-front'
  );
  const doorAll   = generateViewDataFromDxf(spaceInfo, placedModules, 'front');
  const { lines: doorOnlyLines, texts: doorOnlyTexts } = appendHingeCoordinateDrawingData(
    filterDoorOnlyDrawingData(doorAll.lines, doorAll.texts),
    spaceInfo,
    placedModules,
    'door'
  );

  // ─ 2) Top view
  await switchSceneViewMode('2D', 'top', 'wireframe');
  const topView = generateViewDataFromDxf(spaceInfo, placedModules, 'top');

  // ─ 3) Side views (슬롯별) — selectedSlotIndex 필터로 슬롯별 측면 렌더
  await switchSceneViewMode('2D', 'left', 'wireframe');
  const sideSlotGroups = getSideViewSlotGroups(placedModules);
  const sideDataListRaw: Array<{ slotTitle: number; modules: PlacedModule[]; lines: ParsedLine[]; texts: ParsedText[] }> = [];
  const uiStoreForSheet = useUIStore.getState();
  const originalSelectedSlotForSheet = uiStoreForSheet.selectedSlotIndex;
  try {
    for (const group of sideSlotGroups) {
      applyExportUiPatchIfChanged(createExportViewUiPatch('left', group.selectedSlotIndex));
      await new Promise(resolve => setTimeout(resolve, 600));
      const data = appendHingeCoordinateDrawingData(
        generateViewDataFromDxf(spaceInfo, group.modules, 'left'),
        spaceInfo,
        group.modules,
        'body-side'
      );
      sideDataListRaw.push({ slotTitle: group.titleIndex, modules: group.modules, lines: data.lines, texts: data.texts });
    }
  } finally {
    applyExportUiPatchIfChanged({ selectedSlotIndex: originalSelectedSlotForSheet });
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const sideDataList = filterVisiblePdfDrawingItems(sideDataListRaw);

  const topColW = areaW / 3;
  const frontWithRect: SheetRect = { x: areaX, y: areaY, w: topColW, h: topH };
  const frontNoRect:   SheetRect = { x: areaX + topColW, y: areaY, w: topColW, h: topH };
  const topViewRect:   SheetRect = { x: areaX + topColW * 2, y: areaY, w: topColW, h: topH };

  renderViewToRect(pdf, frontWithRect, 'Front View (With Doors)', frontWith.lines, frontWith.texts, 6, lineStyle);
  renderViewToRect(pdf, frontNoRect,   'Front View (Without Doors)', frontNo.lines, frontNo.texts, 6, lineStyle);
  renderViewToRect(pdf, topViewRect,   'Top View (Plan)', topView.lines, topView.texts, 6, lineStyle);

  pdf.setLineWidth(0.15);
  pdf.setDrawColor(200, 200, 200);
  pdf.line(frontNoRect.x, areaY, frontNoRect.x, areaY + topH);
  pdf.line(topViewRect.x, areaY, topViewRect.x, areaY + topH);
  pdf.setDrawColor(0, 0, 0);

  const sideN = sideDataList.length;
  const botY = areaY + topH;

  // 최대 5개 가구까지 한 페이지, 초과 시 첫 페이지는 5개 + Door, 나머지는 다음 페이지로
  const MAX_SIDE_PER_PAGE = 5;
  const sidesInFirstPage = Math.min(sideN, MAX_SIDE_PER_PAGE);

  const sideAreaW = areaW * 0.65;
  const doorAreaW = areaW - sideAreaW;
  const sideColW = sideN > 0 ? sideAreaW / sidesInFirstPage : sideAreaW;

  if (sideN > 0) {
    for (let idx = 0; idx < sidesInFirstPage; idx++) {
      const sd = sideDataList[idx];
      const rect: SheetRect = { x: areaX + sideColW * idx, y: botY, w: sideColW, h: botH };
      renderViewToRect(pdf, rect, `Side View (Slot ${sd.slotTitle})`, sd.lines, sd.texts, 6, lineStyle);
      if (idx > 0) {
        pdf.setLineWidth(0.15);
        pdf.setDrawColor(200, 200, 200);
        pdf.line(rect.x, botY, rect.x, botY + botH);
        pdf.setDrawColor(0, 0, 0);
      }
    }
  } else {
    renderViewToRect(pdf, { x: areaX, y: botY, w: sideAreaW, h: botH }, 'Side View (Left)', [], [], 6, lineStyle);
  }
  const doorRect: SheetRect = { x: areaX + sideAreaW, y: botY, w: doorAreaW, h: botH };
  pdf.setLineWidth(0.15);
  pdf.setDrawColor(200, 200, 200);
  pdf.line(doorRect.x, botY, doorRect.x, botY + botH);
  pdf.setDrawColor(0, 0, 0);
  renderViewToRect(pdf, doorRect, 'Door Drawing (Doors Only)', doorOnlyLines, doorOnlyTexts, 6, lineStyle);

  // ─ 추가 페이지: 5개 초과 측면도
  if (sideN > MAX_SIDE_PER_PAGE) {
    for (let start = MAX_SIDE_PER_PAGE; start < sideN; start += MAX_SIDE_PER_PAGE * 2) {
      pdf.addPage('a3', 'landscape');
      const pageCount = Math.min(MAX_SIDE_PER_PAGE * 2, sideN - start);
      const pageColW = areaW / pageCount;
      // 외곽선
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.4);
      pdf.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
      pdf.setLineWidth(0.2);
      pdf.line(pageW - margin - titleBlockW, margin, pageW - margin - titleBlockW, pageH - margin);

      for (let k = 0; k < pageCount; k++) {
        const idx = start + k;
        const sd = sideDataList[idx];
        const rect: SheetRect = { x: areaX + pageColW * k, y: areaY, w: pageColW, h: areaH };
        renderViewToRect(pdf, rect, `Side View (Slot ${sd.slotTitle})`, sd.lines, sd.texts, 6, lineStyle);
        if (k > 0) {
          pdf.setLineWidth(0.15);
          pdf.setDrawColor(200, 200, 200);
          pdf.line(rect.x, areaY, rect.x, areaY + areaH);
          pdf.setDrawColor(0, 0, 0);
        }
      }
    }
  }

  const tbX = pageW - margin - titleBlockW;
  const tbY = margin;
  const tbHeight = pageH - margin * 2;
  const maxDepth = resolveMaxPlacedModuleExportDepth(spaceInfo, placedModules);
  const today = new Date().toISOString().slice(0, 10);

  // 도어 짝 수 계산: 듀얼 가구(isDualSlot 또는 moduleId에 'dual-' 포함)는 2짝, 싱글은 1짝
  const doorCount = placedModules.reduce((sum, m) => {
    if (!m.hasDoor) return sum;
    const isDual = m.isDualSlot === true ||
                   (typeof m.moduleId === 'string' && m.moduleId.includes('dual-'));
    return sum + (isDual ? 2 : 1);
  }, 0);

  const rows = [
    { label: 'PROJECT', value: metadata.projectName || '-' },
    { label: 'DESIGN', value: metadata.designName || '-' },
    { label: 'DRAWING', value: 'WARDROBE\nDESIGN DRAWING' },
    { label: 'SIZE', value: `${spaceInfo.width} × ${spaceInfo.height}\n× ${maxDepth} mm` },
    { label: 'DATE', value: today },
    { label: 'SCALE', value: 'FIT TO A3' },
    { label: 'MODULES', value: String(placedModules.length) },
    { label: 'DOORS', value: String(doorCount) },
    { label: 'SHEET', value: '1 / 1' },
  ];

  // 재질 섬네일 영역을 타이틀 블록 하단 40mm로 확보, 나머지 위쪽을 텍스트 행 분할
  const materialAreaH = 60; // 재질 섹션 총 높이(mm) — 2개 섬네일 각 약 22mm
  const textAreaH = tbHeight - materialAreaH;
  const rowH = textAreaH / rows.length;
  rows.forEach((r, idx) => {
    const y = tbY + rowH * idx;
    if (idx > 0) {
      pdf.setLineWidth(0.2);
      pdf.line(tbX, y, tbX + titleBlockW, y);
    }
    // label (영문만) — 기본 text
    pdf.setFontSize(6);
    pdf.setTextColor(100, 100, 100);
    pdf.text(r.label, tbX + 2, y + 4);
    // value (한글 가능) — drawTextSafe
    r.value.split('\n').forEach((line, i) => {
      drawTextSafe(pdf, line, tbX + 2, y + 10 + i * 3.5, 8, [0, 0, 0]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 재질 섬네일 섹션 (INTERIOR / DOOR)
  // ═══════════════════════════════════════════════════════════
  const materialsY = tbY + textAreaH;
  // 섹션 헤더 구분선
  pdf.setLineWidth(0.3);
  pdf.line(tbX, materialsY, tbX + titleBlockW, materialsY);

  // 재질 경로 (spaceInfo.materialConfig)
  const materialCfg = spaceInfo.materialConfig;
  const interiorTex = materialCfg?.interiorTexture;
  const doorTex = materialCfg?.doorTexture;

  // 각 재질 행: label 4mm + 섬네일 18mm × 18mm + 텍스트
  const materialRowH = materialAreaH / 2;
  const thumbSize = 18;

  // 텍스처 경로에서 재질명 파싱: '/materials/solid/MELATONE_4319.png' → { brand: 'MELATONE', name: '4319' }
  const parseMaterialName = (texPath?: string): { brand: string; name: string } => {
    if (!texPath) return { brand: '', name: '' };
    const fileName = texPath.split('/').pop() || '';
    const nameOnly = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    // 언더스코어 첫 번째를 기준으로 브랜드/이름 분리
    const idx = nameOnly.indexOf('_');
    if (idx > 0) {
      return { brand: nameOnly.substring(0, idx), name: nameOnly.substring(idx + 1).replace(/_/g, ' ') };
    }
    return { brand: '', name: nameOnly };
  };

  const materials: Array<{ label: string; texture?: string; fallbackColor?: string }> = [
    { label: 'INTERIOR', texture: interiorTex, fallbackColor: materialCfg?.interiorColor },
    { label: 'DOOR', texture: doorTex, fallbackColor: materialCfg?.doorColor },
  ];

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const rowY = materialsY + materialRowH * i;
    // 상단 구분선 (두 번째 행만)
    if (i > 0) {
      pdf.setLineWidth(0.2);
      pdf.line(tbX, rowY, tbX + titleBlockW, rowY);
    }
    // 라벨 (INTERIOR / DOOR)
    pdf.setFontSize(6);
    pdf.setTextColor(100, 100, 100);
    pdf.text(m.label, tbX + 2, rowY + 4);

    // 섬네일 위치 (라벨 아래, 좌측 정렬)
    const thumbX = tbX + 3;
    const thumbY = rowY + 6;

    // 테두리
    pdf.setLineWidth(0.15);
    pdf.setDrawColor(150, 150, 150);
    pdf.rect(thumbX, thumbY, thumbSize, thumbSize);
    pdf.setDrawColor(0, 0, 0);

    let imgLoaded = false;
    if (m.texture) {
      const img = await loadTextureAsDataUrl(m.texture, 256);
      if (img) {
        try {
          pdf.addImage(img.dataUrl, 'PNG', thumbX, thumbY, thumbSize, thumbSize);
          imgLoaded = true;
        } catch (err) {
          console.warn('[PDF] 재질 섬네일 삽입 실패:', m.label, err);
        }
      }
    }
    if (!imgLoaded && m.fallbackColor) {
      // 텍스처 없거나 실패 시 색상 스와치
      const hex = m.fallbackColor.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        pdf.setFillColor(r, g, b);
        pdf.rect(thumbX, thumbY, thumbSize, thumbSize, 'F');
      }
    }

    // 재질명/브랜드 텍스트 (섬네일 우측) — 한글 가능
    const parsed = parseMaterialName(m.texture);
    const textX = thumbX + thumbSize + 2;
    const textY = thumbY + 4;
    if (parsed.brand) {
      drawTextSafe(pdf, parsed.brand, textX, textY, 7, [0, 0, 0]);
      drawTextSafe(pdf, parsed.name, textX, textY + 4, 6, [80, 80, 80]);
    } else if (parsed.name) {
      drawTextSafe(pdf, parsed.name, textX, textY, 7, [0, 0, 0]);
    } else {
      pdf.setFontSize(6);
      pdf.setTextColor(150, 150, 150);
      pdf.text('-', textX, textY);
    }
  }
};
