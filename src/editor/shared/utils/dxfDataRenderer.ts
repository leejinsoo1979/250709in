/**
 * 데이터 기반 DXF 렌더러
 *
 * CleanCAD2D, CADDimensions2D와 완전히 동일한 좌표 계산 로직을 사용하여
 * 2D 뷰와 100% 동일한 DXF를 생성합니다.
 *
 * 중요: 3D 메쉬에서 추출하는 방식이 아닌, 데이터에서 직접 계산합니다.
 */

import { DxfWriter, point3d } from '@tarikjabiri/dxf';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { calculateSpaceIndexing, calculateInternalSpace } from './indexing';
import { getModuleById } from '@/data/modules';
import { calculateBaseFrameHeight, calculateFrameThickness, END_PANEL_THICKNESS } from '@/editor/shared/viewer3d/utils/geometry';
import { SectionConfig } from '@/data/modules/shelving';

// 뷰 방향 타입
export type ViewDirection = 'front' | 'left' | 'right' | 'top';

// DXF 라인 타입
interface DxfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
}

// mm를 DXF 단위(mm)로 변환 - 그대로 유지
const mmToDxf = (mm: number): number => mm;

// Three.js 단위를 DXF 단위(mm)로 변환 - 100배
const threeToDxf = (units: number): number => units * 100;

/**
 * 정면뷰 DXF 라인 생성
 * CleanCAD2D의 정면뷰 렌더링 로직과 동일
 */
const generateFrontViewLines = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[]
): DxfLine[] => {
  const lines: DxfLine[] = [];

  // 공간 크기 (mm)
  const spaceWidth = spaceInfo.width;
  const spaceHeight = spaceInfo.height;
  const spaceDepth = spaceInfo.depth || 1500;

  // 좌측 오프셋 (공간의 왼쪽 끝)
  const leftOffset = -spaceWidth / 2;

  // 인덱싱 정보
  const indexing = calculateSpaceIndexing(spaceInfo);
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 프레임 두께
  const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };

  // 받침대/바닥레일 높이
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeightMm = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const railOrBaseHeightMm = spaceInfo.baseConfig?.type === 'stand'
    ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))
    : calculateBaseFrameHeight(spaceInfo);

  // 가구 시작 Y 위치
  const furnitureBaseY = isFloating ? floatHeightMm : railOrBaseHeightMm;

  // 내부 높이
  const adjustedInternalHeightMm = internalSpace.height - railOrBaseHeightMm - (isFloating ? floatHeightMm : 0);

  // === 공간 외곽선 ===
  // 하단
  lines.push({
    x1: 0, y1: 0,
    x2: spaceWidth, y2: 0,
    layer: 'SPACE'
  });
  // 상단
  lines.push({
    x1: 0, y1: spaceHeight,
    x2: spaceWidth, y2: spaceHeight,
    layer: 'SPACE'
  });
  // 좌측
  lines.push({
    x1: 0, y1: 0,
    x2: 0, y2: spaceHeight,
    layer: 'SPACE'
  });
  // 우측
  lines.push({
    x1: spaceWidth, y1: 0,
    x2: spaceWidth, y2: spaceHeight,
    layer: 'SPACE'
  });

  // === 가구 렌더링 ===
  placedModules.forEach(module => {
    const moduleData = getModuleById(
      module.moduleId,
      { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
      spaceInfo
    );

    if (!moduleData) return;

    // 슬롯 X 위치 계산 (Three.js 단위 → mm)
    // 공식: -spaceWidth/2 + columnWidth * slotIndex + columnWidth/2
    const columnWidthMm = threeToDxf(indexing.columnWidth);
    const slotCenterX = columnWidthMm * module.slotIndex + columnWidthMm / 2;

    // 가구 너비
    const isDualSlot = module.isDualSlot || module.moduleId.includes('dual-');
    const moduleWidthMm = isDualSlot ? columnWidthMm * 2 : columnWidthMm;

    // 가구 높이
    const moduleHeightMm = module.customHeight || moduleData.dimensions.height;

    // 가구 박스 좌표 (DXF 좌표계 - 왼쪽 하단이 원점)
    // X: 슬롯 중심 - 가구 너비/2 + spaceWidth/2 (원점 이동)
    const furnitureLeft = slotCenterX - moduleWidthMm / 2 + spaceWidth / 2;
    const furnitureRight = furnitureLeft + moduleWidthMm;
    const furnitureBottom = furnitureBaseY;
    const furnitureTop = furnitureBaseY + moduleHeightMm;

    // 가구 외곽선
    // 하단
    lines.push({
      x1: furnitureLeft, y1: furnitureBottom,
      x2: furnitureRight, y2: furnitureBottom,
      layer: 'FURNITURE'
    });
    // 상단
    lines.push({
      x1: furnitureLeft, y1: furnitureTop,
      x2: furnitureRight, y2: furnitureTop,
      layer: 'FURNITURE'
    });
    // 좌측
    lines.push({
      x1: furnitureLeft, y1: furnitureBottom,
      x2: furnitureLeft, y2: furnitureTop,
      layer: 'FURNITURE'
    });
    // 우측
    lines.push({
      x1: furnitureRight, y1: furnitureBottom,
      x2: furnitureRight, y2: furnitureTop,
      layer: 'FURNITURE'
    });

    // === 섹션 렌더링 ===
    const sectionConfigs = (module.customSections && module.customSections.length > 0)
      ? module.customSections
      : moduleData.modelConfig?.sections;

    if (sectionConfigs && sectionConfigs.length > 0) {
      const basicThicknessMm = moduleData.modelConfig?.basicThickness || 18;

      // 섹션 높이 계산
      let currentY = furnitureBottom + basicThicknessMm; // 하판 위부터 시작

      sectionConfigs.forEach((section: SectionConfig, sectionIndex: number) => {
        const sectionHeightMm = (section as any).calculatedHeight ||
          (adjustedInternalHeightMm - basicThicknessMm * 2) / sectionConfigs.length;

        // 섹션 상단 선 (마지막 섹션 제외 - 가구 상단과 중복)
        if (sectionIndex < sectionConfigs.length - 1) {
          const sectionTopY = currentY + sectionHeightMm;
          lines.push({
            x1: furnitureLeft, y1: sectionTopY,
            x2: furnitureRight, y2: sectionTopY,
            layer: 'FURNITURE'
          });
        }

        // 서랍 섹션
        if (section.type === 'drawer' && section.drawerHeights) {
          let drawerY = currentY + (section.gapHeight || 0);
          section.drawerHeights.forEach((drawerHeight, drawerIndex) => {
            const drawerTopY = drawerY + drawerHeight;

            // 서랍 칸막이선
            if (drawerIndex < section.drawerHeights!.length - 1) {
              lines.push({
                x1: furnitureLeft, y1: drawerTopY,
                x2: furnitureRight, y2: drawerTopY,
                layer: 'FURNITURE'
              });
            }

            drawerY = drawerTopY + (section.gapHeight || 0);
          });
        }

        // 선반 섹션
        if ((section.type === 'shelf' || section.type === 'hanging') && section.shelfPositions) {
          section.shelfPositions.forEach(shelfPosMm => {
            const shelfY = currentY + shelfPosMm;
            lines.push({
              x1: furnitureLeft + basicThicknessMm, y1: shelfY,
              x2: furnitureRight - basicThicknessMm, y2: shelfY,
              layer: 'FURNITURE'
            });
          });
        }

        currentY += sectionHeightMm;
      });
    }
  });

  return lines;
};

/**
 * 측면뷰 DXF 라인 생성
 * CADDimensions2D의 측면뷰 렌더링 로직과 동일
 */
const generateSideViewLines = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: 'left' | 'right'
): DxfLine[] => {
  const lines: DxfLine[] = [];

  const spaceHeight = spaceInfo.height;
  const spaceDepth = spaceInfo.depth || 1500;

  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);

  // 받침대/바닥레일 높이
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeightMm = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const railOrBaseHeightMm = spaceInfo.baseConfig?.type === 'stand'
    ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))
    : calculateBaseFrameHeight(spaceInfo);

  const furnitureBaseY = isFloating ? floatHeightMm : railOrBaseHeightMm;
  const adjustedInternalHeightMm = internalSpace.height - railOrBaseHeightMm - (isFloating ? floatHeightMm : 0);

  // === 공간 외곽선 (측면) ===
  // 하단
  lines.push({
    x1: 0, y1: 0,
    x2: spaceDepth, y2: 0,
    layer: 'SPACE'
  });
  // 상단
  lines.push({
    x1: 0, y1: spaceHeight,
    x2: spaceDepth, y2: spaceHeight,
    layer: 'SPACE'
  });
  // 좌측 (앞쪽)
  lines.push({
    x1: 0, y1: 0,
    x2: 0, y2: spaceHeight,
    layer: 'SPACE'
  });
  // 우측 (뒤쪽)
  lines.push({
    x1: spaceDepth, y1: 0,
    x2: spaceDepth, y2: spaceHeight,
    layer: 'SPACE'
  });

  // 측면뷰에서 표시할 가구 선택
  const visibleFurniture = placedModules.length > 0 ? (() => {
    if (viewDirection === 'left') {
      return [placedModules.reduce((min, m) => m.position.x < min.position.x ? m : min)];
    } else {
      return [placedModules.reduce((max, m) => m.position.x > max.position.x ? m : max)];
    }
  })() : [];

  visibleFurniture.forEach(module => {
    const moduleData = getModuleById(
      module.moduleId,
      { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
      spaceInfo
    );

    if (!moduleData) return;

    const moduleDepthMm = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
    const moduleHeightMm = module.customHeight || moduleData.dimensions.height;

    // 가구 Z 위치 계산 (측면뷰에서의 X 위치)
    const panelDepthMm = spaceDepth;
    const furnitureDepthMm = 600; // 가구 깊이 고정값
    const doorThickness = 20;

    const furnitureZOffset = (panelDepthMm - furnitureDepthMm) / 2;
    const furnitureFront = furnitureZOffset + furnitureDepthMm / 2 - doorThickness - moduleDepthMm / 2;

    // 가구 박스 좌표
    const furnitureLeft = furnitureFront - moduleDepthMm / 2;
    const furnitureRight = furnitureFront + moduleDepthMm / 2;
    const furnitureBottom = furnitureBaseY;
    const furnitureTop = furnitureBaseY + moduleHeightMm;

    // 가구 외곽선
    lines.push({
      x1: furnitureLeft, y1: furnitureBottom,
      x2: furnitureRight, y2: furnitureBottom,
      layer: 'FURNITURE'
    });
    lines.push({
      x1: furnitureLeft, y1: furnitureTop,
      x2: furnitureRight, y2: furnitureTop,
      layer: 'FURNITURE'
    });
    lines.push({
      x1: furnitureLeft, y1: furnitureBottom,
      x2: furnitureLeft, y2: furnitureTop,
      layer: 'FURNITURE'
    });
    lines.push({
      x1: furnitureRight, y1: furnitureBottom,
      x2: furnitureRight, y2: furnitureTop,
      layer: 'FURNITURE'
    });
  });

  return lines;
};

/**
 * 평면뷰 DXF 라인 생성
 */
const generateTopViewLines = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[]
): DxfLine[] => {
  const lines: DxfLine[] = [];

  const spaceWidth = spaceInfo.width;
  const spaceDepth = spaceInfo.depth || 1500;

  const indexing = calculateSpaceIndexing(spaceInfo);

  // === 공간 외곽선 (평면) ===
  lines.push({
    x1: 0, y1: 0,
    x2: spaceWidth, y2: 0,
    layer: 'SPACE'
  });
  lines.push({
    x1: 0, y1: spaceDepth,
    x2: spaceWidth, y2: spaceDepth,
    layer: 'SPACE'
  });
  lines.push({
    x1: 0, y1: 0,
    x2: 0, y2: spaceDepth,
    layer: 'SPACE'
  });
  lines.push({
    x1: spaceWidth, y1: 0,
    x2: spaceWidth, y2: spaceDepth,
    layer: 'SPACE'
  });

  // 가구 렌더링
  placedModules.forEach(module => {
    const moduleData = getModuleById(
      module.moduleId,
      { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
      spaceInfo
    );

    if (!moduleData) return;

    const columnWidthMm = threeToDxf(indexing.columnWidth);
    const slotCenterX = columnWidthMm * module.slotIndex + columnWidthMm / 2;

    const isDualSlot = module.isDualSlot || module.moduleId.includes('dual-');
    const moduleWidthMm = isDualSlot ? columnWidthMm * 2 : columnWidthMm;
    const moduleDepthMm = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;

    // 가구 Z 위치 계산
    const panelDepthMm = spaceDepth;
    const furnitureDepthMm = 600;
    const doorThickness = 20;

    const furnitureZOffset = (panelDepthMm - furnitureDepthMm) / 2;
    const furnitureCenterZ = furnitureZOffset + furnitureDepthMm / 2 - doorThickness - moduleDepthMm / 2;

    const furnitureLeft = slotCenterX - moduleWidthMm / 2 + spaceWidth / 2;
    const furnitureRight = furnitureLeft + moduleWidthMm;
    const furnitureFront = furnitureCenterZ - moduleDepthMm / 2;
    const furnitureBack = furnitureCenterZ + moduleDepthMm / 2;

    // 가구 외곽선 (평면)
    lines.push({
      x1: furnitureLeft, y1: furnitureFront,
      x2: furnitureRight, y2: furnitureFront,
      layer: 'FURNITURE'
    });
    lines.push({
      x1: furnitureLeft, y1: furnitureBack,
      x2: furnitureRight, y2: furnitureBack,
      layer: 'FURNITURE'
    });
    lines.push({
      x1: furnitureLeft, y1: furnitureFront,
      x2: furnitureLeft, y2: furnitureBack,
      layer: 'FURNITURE'
    });
    lines.push({
      x1: furnitureRight, y1: furnitureFront,
      x2: furnitureRight, y2: furnitureBack,
      layer: 'FURNITURE'
    });
  });

  return lines;
};

/**
 * 치수선 생성
 */
const generateDimensionLines = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: ViewDirection
): DxfLine[] => {
  const lines: DxfLine[] = [];
  const margin = 150; // 치수선 마진 (mm)

  if (viewDirection === 'front') {
    const spaceWidth = spaceInfo.width;
    const spaceHeight = spaceInfo.height;

    // 가로 치수선 (상단)
    const dimY = spaceHeight + margin;
    lines.push({
      x1: 0, y1: dimY,
      x2: spaceWidth, y2: dimY,
      layer: 'DIMENSIONS'
    });
    // 시작점 수직선
    lines.push({
      x1: 0, y1: spaceHeight,
      x2: 0, y2: dimY + 20,
      layer: 'DIMENSIONS'
    });
    // 끝점 수직선
    lines.push({
      x1: spaceWidth, y1: spaceHeight,
      x2: spaceWidth, y2: dimY + 20,
      layer: 'DIMENSIONS'
    });

    // 세로 치수선 (좌측)
    const dimX = -margin;
    lines.push({
      x1: dimX, y1: 0,
      x2: dimX, y2: spaceHeight,
      layer: 'DIMENSIONS'
    });
    // 시작점 수평선
    lines.push({
      x1: dimX - 20, y1: 0,
      x2: 0, y2: 0,
      layer: 'DIMENSIONS'
    });
    // 끝점 수평선
    lines.push({
      x1: dimX - 20, y1: spaceHeight,
      x2: 0, y2: spaceHeight,
      layer: 'DIMENSIONS'
    });
  }

  return lines;
};

/**
 * DXF 생성 메인 함수
 */
export const generateDxfFromData = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: ViewDirection
): string => {
  console.log(`📐 데이터 기반 DXF 생성 시작 (${viewDirection})...`);
  console.log('📐 spaceInfo:', spaceInfo);
  console.log('📐 placedModules:', placedModules.length, '개');

  // 라인 생성
  let lines: DxfLine[] = [];

  switch (viewDirection) {
    case 'front':
      lines = generateFrontViewLines(spaceInfo, placedModules);
      break;
    case 'left':
    case 'right':
      lines = generateSideViewLines(spaceInfo, placedModules, viewDirection);
      break;
    case 'top':
      lines = generateTopViewLines(spaceInfo, placedModules);
      break;
  }

  // 치수선 추가
  lines = lines.concat(generateDimensionLines(spaceInfo, placedModules, viewDirection));

  console.log(`📐 생성된 라인 수: ${lines.length}`);

  // DXF 생성
  const dxf = new DxfWriter();

  // 레이어 설정
  dxf.addLayer('SPACE', 8, 'CONTINUOUS');
  dxf.addLayer('FURNITURE', 7, 'CONTINUOUS');
  dxf.addLayer('DIMENSIONS', 1, 'CONTINUOUS');
  dxf.addLayer('TEXT', 2, 'CONTINUOUS');

  // 라인 추가
  lines.forEach(line => {
    try {
      dxf.setCurrentLayerName(line.layer);
    } catch {
      dxf.setCurrentLayerName('FURNITURE');
    }

    dxf.addLine(
      point3d(line.x1, line.y1),
      point3d(line.x2, line.y2)
    );
  });

  console.log(`✅ DXF 생성 완료 (${viewDirection})`);

  return dxf.stringify();
};

/**
 * DXF 파일 다운로드
 */
export const downloadDxf = (
  dxfContent: string,
  filename: string
): void => {
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};
