/**
 * DXF 데이터를 PDF로 변환
 * 기존 DXF 생성 로직(dxfDataRenderer.ts)을 그대로 활용
 *
 * 핵심: 씬을 2D 와이어프레임 모드로 전환한 후 추출해야
 * 옷봉, 서랍레일, 조절발, 환기캡 등의 2D 전용 요소들이 포함됨
 */

import { jsPDF } from 'jspdf';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import {
  extractFromScene,
  generateExternalDimensions,
  type ViewDirection,
  type SideViewFilter,
  type DxfLine,
  type DxfText
} from './dxfDataRenderer';
import { sceneHolder } from '../viewer3d/sceneHolder';
import { useUIStore } from '@/store/uiStore';

// PDF 뷰 타입
export type PdfViewDirection = 'front' | 'left' | 'right' | 'top';

// DXF ACI 색상 → hex
const aciToHex = (aci: number): string => {
  const aciColors: Record<number, string> = {
    1: '#FF0000', 2: '#FFFF00', 3: '#00AA00', 4: '#00FFFF',
    5: '#0000FF', 6: '#FF00FF', 7: '#333333', 8: '#666666',
    9: '#999999', 30: '#FF4500', 250: '#444444', 254: '#CCCCCC',
  };
  return aciColors[aci] || '#333333';
};

// hex → RGB
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

// 뷰 제목
const getViewTitle = (v: PdfViewDirection): string => {
  const titles: Record<string, string> = { front: '정면도', left: '좌측면도', right: '우측면도', top: '평면도' };
  return titles[v] || '도면';
};

// 측면뷰 필터
const getSideViewFilter = (v: PdfViewDirection): SideViewFilter => {
  if (v === 'left') return 'leftmost';
  if (v === 'right') return 'rightmost';
  return 'all';
};

/**
 * DXF 데이터를 PDF 페이지에 렌더링
 */
const renderToPdf = (
  pdf: jsPDF,
  lines: DxfLine[],
  texts: DxfText[],
  spaceInfo: SpaceInfo,
  viewDirection: PdfViewDirection,
  pageWidth: number,
  pageHeight: number
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

  if (minX === Infinity) return;

  const dxfWidth = maxX - minX;
  const dxfHeight = maxY - minY;
  const scale = Math.min(drawableWidth / dxfWidth, drawableHeight / dxfHeight) * 0.85;

  const toX = (x: number) => centerX + (x - (minX + maxX) / 2) * scale;
  const toY = (y: number) => centerY - (y - (minY + maxY) / 2) * scale;

  // 제목
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text(getViewTitle(viewDirection), pageWidth / 2, margin + 8, { align: 'center' });

  // 라인 (모노 색상)
  pdf.setDrawColor(0, 0, 0); // 검정
  lines.forEach(line => {
    let lw = 0.1;
    if (line.layer === 'DIMENSIONS') lw = 0.08;
    else if (line.layer === 'SPACE_FRAME') lw = 0.15;
    else if (line.layer === 'FURNITURE_PANEL') lw = 0.12;
    else if (line.layer === 'BACK_PANEL') lw = 0.05;

    pdf.setLineWidth(lw);
    pdf.line(toX(line.x1), toY(line.y1), toX(line.x2), toY(line.y2));
  });

  // 텍스트 (모노 색상)
  texts.forEach(text => {
    pdf.setTextColor(0, 0, 0); // 검정
    pdf.setFontSize(Math.max(text.height * scale * 0.5, 6));
    pdf.text(text.text, toX(text.x), toY(text.y), { align: 'center' });
  });

  // 하단 정보
  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(`${spaceInfo.width}mm × ${spaceInfo.height}mm × ${spaceInfo.depth}mm`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
};

/**
 * PDF 뷰 방향을 UI의 2D 뷰 방향으로 변환
 */
const pdfViewToUI2DDirection = (v: PdfViewDirection): 'front' | 'top' | 'left' | 'right' => {
  return v; // 동일한 이름 사용
};

/**
 * 씬을 특정 2D 뷰 방향으로 전환하고 렌더링 대기
 */
const switchTo2DView = async (direction: 'front' | 'top' | 'left' | 'right'): Promise<void> => {
  const { setViewMode, setView2DDirection, setRenderMode } = useUIStore.getState();

  setViewMode('2D');
  setView2DDirection(direction);
  setRenderMode('wireframe');

  // 씬이 업데이트될 시간 대기 (2D 요소들이 렌더링되어야 함)
  await new Promise(resolve => setTimeout(resolve, 300));
};

/**
 * DXF 데이터를 PDF로 내보내기
 * dxfDataRenderer.ts의 generateDxfFromData와 동일한 로직 사용
 *
 * 중요: 각 뷰마다 씬을 해당 2D 모드로 전환하여 옷봉, 서랍레일,
 * 조절발, 환기캡 등의 2D 전용 요소들이 씬에 렌더링된 후 추출
 */
export const downloadDxfAsPdf = async (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  views: PdfViewDirection[] = ['front', 'top', 'left', 'right']
): Promise<void> => {
  const scene = sceneHolder.getScene();
  if (!scene) {
    console.error('❌ 씬을 찾을 수 없습니다');
    return;
  }

  console.log('📄 DXF→PDF 변환 시작...');

  // 현재 UI 상태 저장 (나중에 복원용)
  const {
    viewMode: originalViewMode,
    view2DDirection: originalView2DDirection,
    renderMode: originalRenderMode
  } = useUIStore.getState();

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  try {
    for (let index = 0; index < views.length; index++) {
      const viewDirection = views[index];
      if (index > 0) pdf.addPage();

      // 핵심: 해당 뷰 방향으로 씬을 2D 모드로 전환
      // 이렇게 해야 옷봉, 서랍레일, 조절발, 환기캡 등의 2D 요소가 씬에 렌더링됨
      const uiDirection = pdfViewToUI2DDirection(viewDirection);
      await switchTo2DView(uiDirection);

      console.log(`📐 ${viewDirection} 뷰 전환 완료, 씬에서 추출 중...`);

      const sideViewFilter = getSideViewFilter(viewDirection);
      const extracted = extractFromScene(scene, viewDirection as ViewDirection, null);

      console.log(`📐 ${viewDirection}: 씬에서 ${extracted.lines.length}개 라인, ${extracted.texts.length}개 텍스트 추출됨`);

      let lines: DxfLine[];
      let texts: DxfText[];

      // 측면뷰: generateDxfFromData와 동일한 로직 (씬에서 추출 + 좌표 정규화 + 치수선)
      if (viewDirection === 'left' || viewDirection === 'right') {
        // 1. 씬에서 추출한 라인 중 DIMENSIONS 레이어만 제외 (가구 형상 유지)
        let filteredLines = extracted.lines.filter(line => line.layer !== 'DIMENSIONS');

        // 2. X 좌표 정규화 + 좌우 반전 (generateDxfFromData와 동일)
        if (filteredLines.length > 0) {
          let minX = Infinity, maxX = -Infinity;
          filteredLines.forEach(line => {
            minX = Math.min(minX, line.x1, line.x2);
            maxX = Math.max(maxX, line.x1, line.x2);
          });

          const furnitureWidth = maxX - minX;
          filteredLines = filteredLines.map(line => ({
            ...line,
            x1: furnitureWidth - (line.x1 - minX),
            x2: furnitureWidth - (line.x2 - minX)
          }));

          // 3. 정규화 후 실제 가구 X 범위 계산
          let actualMinX = Infinity, actualMaxX = -Infinity;
          filteredLines.forEach(line => {
            actualMinX = Math.min(actualMinX, line.x1, line.x2);
            actualMaxX = Math.max(actualMaxX, line.x1, line.x2);
          });
          const actualFurnitureWidth = actualMaxX - actualMinX;

          // 4. 외부 치수선 생성 (dimensionsOnly=true)
          const dimensions = generateExternalDimensions(
            spaceInfo, placedModules, viewDirection as ViewDirection, sideViewFilter,
            true, actualFurnitureWidth, actualMinX, actualMaxX
          );

          lines = [...filteredLines, ...dimensions.lines];
          texts = [...dimensions.texts];
        } else {
          lines = [];
          texts = [];
        }
      } else {
        // 정면뷰/탑뷰: 기존 방식
        const dimensions = generateExternalDimensions(spaceInfo, placedModules, viewDirection as ViewDirection, sideViewFilter);
        lines = [...extracted.lines, ...dimensions.lines];
        texts = [...extracted.texts, ...dimensions.texts];
      }

      console.log(`📐 ${viewDirection}: 최종 ${lines.length}개 라인, ${texts.length}개 텍스트`);
      renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight);
    }

    pdf.save(`도면_${new Date().toISOString().slice(0, 10)}.pdf`);
    console.log('✅ PDF 다운로드 완료');

  } finally {
    // 원래 UI 상태 복원
    const { setViewMode, setView2DDirection, setRenderMode } = useUIStore.getState();
    setViewMode(originalViewMode);
    setView2DDirection(originalView2DDirection);
    setRenderMode(originalRenderMode);
    console.log('🔄 UI 상태 복원 완료');
  }
};
