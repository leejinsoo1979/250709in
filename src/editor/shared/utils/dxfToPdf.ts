/**
 * DXF 데이터를 PDF로 변환
 * 기존 DXF 생성 로직(dxfDataRenderer.ts)을 그대로 활용
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

  // 라인
  lines.forEach(line => {
    const rgb = hexToRgb(aciToHex(line.color));
    pdf.setDrawColor(rgb.r, rgb.g, rgb.b);

    let lw = 0.3;
    if (line.layer === 'DIMENSIONS') lw = 0.2;
    else if (line.layer === 'SPACE_FRAME') lw = 0.4;
    else if (line.layer === 'FURNITURE_PANEL') lw = 0.35;
    else if (line.layer === 'BACK_PANEL') lw = 0.15;

    pdf.setLineWidth(lw);
    pdf.line(toX(line.x1), toY(line.y1), toX(line.x2), toY(line.y2));
  });

  // 텍스트
  texts.forEach(text => {
    const rgb = hexToRgb(aciToHex(text.color));
    pdf.setTextColor(rgb.r, rgb.g, rgb.b);
    pdf.setFontSize(Math.max(text.height * scale * 0.5, 6));
    pdf.text(text.text, toX(text.x), toY(text.y), { align: 'center' });
  });

  // 하단 정보
  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(`${spaceInfo.width}mm × ${spaceInfo.height}mm × ${spaceInfo.depth}mm`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
};

/**
 * DXF 데이터를 PDF로 내보내기
 * dxfDataRenderer.ts의 extractFromScene + generateExternalDimensions 사용
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

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  views.forEach((viewDirection, index) => {
    if (index > 0) pdf.addPage();

    const sideViewFilter = getSideViewFilter(viewDirection);

    // dxfDataRenderer.ts의 함수들 직접 사용 (DXF 내보내기와 동일한 로직)
    const extracted = extractFromScene(scene, viewDirection as ViewDirection, null);
    const dimensions = generateExternalDimensions(spaceInfo, placedModules, viewDirection as ViewDirection, sideViewFilter);

    const lines = [...extracted.lines, ...dimensions.lines];
    const texts = [...extracted.texts, ...dimensions.texts];

    console.log(`📐 ${viewDirection}: ${lines.length}개 라인, ${texts.length}개 텍스트`);

    renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight);
  });

  pdf.save(`도면_${new Date().toISOString().slice(0, 10)}.pdf`);
  console.log('✅ PDF 다운로드 완료');
};
