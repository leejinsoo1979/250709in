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
  generateDxfFromData,
  type ViewDirection,
  type SideViewFilter
} from './dxfDataRenderer';

// PDF 뷰 타입
export type PdfViewDirection = 'front' | 'left' | 'right' | 'top';

// DXF에서 추출한 라인 정보
interface ParsedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
}

// DXF에서 추출한 텍스트 정보
interface ParsedText {
  x: number;
  y: number;
  text: string;
  height: number;
  layer: string;
}

/**
 * DXF 문자열에서 LINE 엔티티 파싱
 */
const parseDxfLines = (dxfString: string): ParsedLine[] => {
  const lines: ParsedLine[] = [];
  const entitySection = dxfString.split('ENTITIES')[1]?.split('ENDSEC')[0];
  if (!entitySection) return lines;

  // LINE 엔티티 찾기
  const lineRegex = /\s+0\nLINE\n([\s\S]*?)(?=\s+0\n(?:LINE|TEXT|MTEXT|ENDSEC))/g;
  let match;

  while ((match = lineRegex.exec(entitySection)) !== null) {
    const lineData = match[1];

    // 레이어 추출
    const layerMatch = lineData.match(/\s+8\n([^\n]+)/);
    const layer = layerMatch ? layerMatch[1].trim() : 'DEFAULT';

    // 좌표 추출
    const x1Match = lineData.match(/\s+10\n([-\d.]+)/);
    const y1Match = lineData.match(/\s+20\n([-\d.]+)/);
    const x2Match = lineData.match(/\s+11\n([-\d.]+)/);
    const y2Match = lineData.match(/\s+21\n([-\d.]+)/);

    if (x1Match && y1Match && x2Match && y2Match) {
      lines.push({
        x1: parseFloat(x1Match[1]),
        y1: parseFloat(y1Match[1]),
        x2: parseFloat(x2Match[1]),
        y2: parseFloat(y2Match[1]),
        layer
      });
    }
  }

  return lines;
};

/**
 * DXF 문자열에서 TEXT/MTEXT 엔티티 파싱
 */
const parseDxfTexts = (dxfString: string): ParsedText[] => {
  const texts: ParsedText[] = [];
  const entitySection = dxfString.split('ENTITIES')[1]?.split('ENDSEC')[0];
  if (!entitySection) return texts;

  // TEXT 엔티티 찾기
  const textRegex = /\s+0\nTEXT\n([\s\S]*?)(?=\s+0\n(?:LINE|TEXT|MTEXT|ENDSEC))/g;
  let match;

  while ((match = textRegex.exec(entitySection)) !== null) {
    const textData = match[1];

    // 레이어 추출
    const layerMatch = textData.match(/\s+8\n([^\n]+)/);
    const layer = layerMatch ? layerMatch[1].trim() : 'DEFAULT';

    // 좌표 추출
    const xMatch = textData.match(/\s+10\n([-\d.]+)/);
    const yMatch = textData.match(/\s+20\n([-\d.]+)/);
    const heightMatch = textData.match(/\s+40\n([-\d.]+)/);
    const contentMatch = textData.match(/\s+1\n([^\n]+)/);

    if (xMatch && yMatch && contentMatch) {
      texts.push({
        x: parseFloat(xMatch[1]),
        y: parseFloat(yMatch[1]),
        text: contentMatch[1].trim(),
        height: heightMatch ? parseFloat(heightMatch[1]) : 25,
        layer
      });
    }
  }

  // MTEXT 엔티티도 찾기
  const mtextRegex = /\s+0\nMTEXT\n([\s\S]*?)(?=\s+0\n(?:LINE|TEXT|MTEXT|ENDSEC))/g;
  while ((match = mtextRegex.exec(entitySection)) !== null) {
    const textData = match[1];

    const layerMatch = textData.match(/\s+8\n([^\n]+)/);
    const layer = layerMatch ? layerMatch[1].trim() : 'DEFAULT';

    const xMatch = textData.match(/\s+10\n([-\d.]+)/);
    const yMatch = textData.match(/\s+20\n([-\d.]+)/);
    const heightMatch = textData.match(/\s+40\n([-\d.]+)/);
    const contentMatch = textData.match(/\s+1\n([^\n]+)/);

    if (xMatch && yMatch && contentMatch) {
      texts.push({
        x: parseFloat(xMatch[1]),
        y: parseFloat(yMatch[1]),
        text: contentMatch[1].trim(),
        height: heightMatch ? parseFloat(heightMatch[1]) : 25,
        layer
      });
    }
  }

  return texts;
};

// 뷰 제목 (jsPDF는 기본적으로 한글 미지원, 영문 사용)
const getViewTitle = (v: PdfViewDirection): string => {
  const titles: Record<string, string> = { front: 'Front View', left: 'Left Side View', right: 'Right Side View', top: 'Top View' };
  return titles[v] || 'Drawing';
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
  lines: ParsedLine[],
  texts: ParsedText[],
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
 * 단일 뷰에 대한 DXF 생성 및 파싱
 * generateDxfFromData를 직접 호출하여 DXF 문자열 생성 후 파싱
 */
export const generateViewDataFromDxf = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: PdfViewDirection
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const sideViewFilter = getSideViewFilter(viewDirection);

  console.log(`📐 ${viewDirection}: generateDxfFromData 호출...`);

  try {
    // DXF 문자열 생성 (generateDXFFromScene과 동일한 방식)
    const dxfString = generateDxfFromData(
      spaceInfo,
      placedModules,
      viewDirection as ViewDirection,
      sideViewFilter
    );

    // DXF 파싱
    const lines = parseDxfLines(dxfString);
    const texts = parseDxfTexts(dxfString);

    console.log(`📐 ${viewDirection}: DXF에서 ${lines.length}개 라인, ${texts.length}개 텍스트 파싱됨`);

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
  views: PdfViewDirection[] = ['front', 'top', 'left', 'right']
): Promise<void> => {
  console.log('📄 DXF→PDF 변환 시작...');
  console.log(`📊 변환할 뷰: ${views.join(', ')}`);

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  views.forEach((viewDirection, index) => {
    if (index > 0) pdf.addPage();

    // DXF 생성 및 파싱
    const { lines, texts } = generateViewDataFromDxf(spaceInfo, placedModules, viewDirection);

    console.log(`📐 ${viewDirection}: 최종 ${lines.length}개 라인, ${texts.length}개 텍스트`);
    renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight);
  });

  pdf.save(`도면_${new Date().toISOString().slice(0, 10)}.pdf`);
  console.log('✅ PDF 다운로드 완료');
};
