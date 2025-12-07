/**
 * 데이터 기반 DXF 렌더러
 * placedModules.position을 그대로 사용하여 DXF 생성
 */

import { DxfWriter, point3d } from '@tarikjabiri/dxf';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from './indexing';

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

/**
 * 정면뷰 DXF 라인 생성
 * placedModule.position을 그대로 사용
 */
const generateFrontViewLines = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[]
): DxfLine[] => {
  const lines: DxfLine[] = [];

  // 공간 크기 (mm)
  const spaceWidth = spaceInfo.width;
  const spaceHeight = spaceInfo.height;

  console.log('📐 DXF 정면뷰 생성:', { spaceWidth, spaceHeight, moduleCount: placedModules.length });

  // === 공간 외곽선 (DXF 좌표: 왼쪽 하단이 원점) ===
  lines.push({ x1: 0, y1: 0, x2: spaceWidth, y2: 0, layer: 'SPACE' });
  lines.push({ x1: 0, y1: spaceHeight, x2: spaceWidth, y2: spaceHeight, layer: 'SPACE' });
  lines.push({ x1: 0, y1: 0, x2: 0, y2: spaceHeight, layer: 'SPACE' });
  lines.push({ x1: spaceWidth, y1: 0, x2: spaceWidth, y2: spaceHeight, layer: 'SPACE' });

  // 내부 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // === 가구 렌더링 ===
  placedModules.forEach((module, idx) => {
    const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
    if (!moduleData) {
      console.warn(`⚠️ 모듈 데이터 없음: ${module.moduleId}`);
      return;
    }

    // placedModule.position은 Three.js 단위 (1 unit = 100mm)
    // Three.js 좌표계: 중심이 원점, X는 좌우, Y는 상하
    const posX = module.position.x; // Three.js 단위
    const posY = module.position.y; // Three.js 단위

    // 가구 크기 (mm)
    const moduleWidth = module.adjustedWidth || module.customWidth || moduleData.dimensions.width;
    const moduleHeight = module.customHeight || moduleData.dimensions.height;

    // Three.js → DXF 좌표 변환
    // Three.js: 중심 원점, 단위 = 100mm
    // DXF: 왼쪽 하단 원점, 단위 = mm
    // 변환: dxfX = (threeX * 100) + (spaceWidth / 2)
    //       dxfY = threeY * 100

    const centerX = posX * 100 + spaceWidth / 2;
    const centerY = posY * 100;

    const left = centerX - moduleWidth / 2;
    const right = centerX + moduleWidth / 2;
    const bottom = centerY - moduleHeight / 2;
    const top = centerY + moduleHeight / 2;

    console.log(`📦 가구 ${idx}:`, {
      moduleId: module.moduleId,
      threePos: { x: posX.toFixed(3), y: posY.toFixed(3) },
      dxfCenter: { x: centerX.toFixed(1), y: centerY.toFixed(1) },
      size: { w: moduleWidth, h: moduleHeight },
      bounds: { left: left.toFixed(1), right: right.toFixed(1), bottom: bottom.toFixed(1), top: top.toFixed(1) }
    });

    // 가구 외곽선
    lines.push({ x1: left, y1: bottom, x2: right, y2: bottom, layer: 'FURNITURE' });
    lines.push({ x1: left, y1: top, x2: right, y2: top, layer: 'FURNITURE' });
    lines.push({ x1: left, y1: bottom, x2: left, y2: top, layer: 'FURNITURE' });
    lines.push({ x1: right, y1: bottom, x2: right, y2: top, layer: 'FURNITURE' });
  });

  console.log(`📐 총 라인 수: ${lines.length}`);
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
  console.log(`📐 DXF 생성 시작 (${viewDirection})`);
  console.log('📐 placedModules:', placedModules.map(m => ({
    id: m.id,
    moduleId: m.moduleId,
    position: m.position,
    slotIndex: m.slotIndex
  })));

  let lines: DxfLine[] = [];

  if (viewDirection === 'front') {
    lines = generateFrontViewLines(spaceInfo, placedModules);
  } else {
    // 다른 뷰는 일단 front와 동일하게
    lines = generateFrontViewLines(spaceInfo, placedModules);
  }

  // DXF 생성
  const dxf = new DxfWriter();

  dxf.addLayer('SPACE', 8, 'CONTINUOUS');
  dxf.addLayer('FURNITURE', 7, 'CONTINUOUS');
  dxf.addLayer('DIMENSIONS', 1, 'CONTINUOUS');

  lines.forEach(line => {
    try {
      dxf.setCurrentLayerName(line.layer);
    } catch {
      dxf.setCurrentLayerName('FURNITURE');
    }
    dxf.addLine(point3d(line.x1, line.y1), point3d(line.x2, line.y2));
  });

  console.log(`✅ DXF 생성 완료`);
  return dxf.stringify();
};

/**
 * DXF 파일 다운로드
 */
export const downloadDxf = (dxfContent: string, filename: string): void => {
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
