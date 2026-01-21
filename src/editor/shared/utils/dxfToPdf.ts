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
import { ColumnIndexer } from './indexing/ColumnIndexer';

// PDF 뷰 타입
// - front: 입면도 (도어 있음) - 도어가 장착된 정면도
// - front-no-door: 입면도 (도어 없음) - 도어 없이 내부가 보이는 정면도
// - door-only: 도어 입면도 - 가구 없이 도어/서랍만 표시
// - left: 측면도
// - top: 평면도
export type PdfViewDirection = 'front' | 'front-no-door' | 'left' | 'top' | 'door-only';

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

// PDF 뷰 방향을 DXF 뷰 방향으로 변환
const pdfViewToViewDirection = (v: PdfViewDirection): ViewDirection => {
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
  placedModules?: PlacedModule[]
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

  // 하단 정보 - 가구 깊이 계산 (placedModules에서 최대 깊이 추출)
  let furnitureDepth = 600; // 기본값
  if (placedModules && placedModules.length > 0) {
    const depths = placedModules.map(m => m.upperSectionDepth || m.customDepth || 600);
    furnitureDepth = Math.max(...depths);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(`${spaceInfo.width}mm × ${spaceInfo.height}mm × ${furnitureDepth}mm`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
};

/**
 * 단일 뷰에 대한 DXF 생성 및 파싱
 * generateDxfFromData를 직접 호출하여 DXF 문자열 생성 후 파싱
 * @param excludeDoor 도어 관련 객체 제외 여부 (front-no-door용)
 */
export const generateViewDataFromDxf = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: PdfViewDirection,
  excludeDoor: boolean = false
): { lines: ParsedLine[]; texts: ParsedText[] } => {
  const sideViewFilter = getSideViewFilter(viewDirection);

  console.log(`📐 ${viewDirection}: generateDxfFromData 호출... (excludeDoor=${excludeDoor})`);

  try {
    // DXF 문자열 생성 (generateDXFFromScene과 동일한 방식)
    const dxfString = generateDxfFromData(
      spaceInfo,
      placedModules,
      viewDirection as ViewDirection,
      sideViewFilter,
      excludeDoor
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
  views: PdfViewDirection[] = ['front', 'top', 'left', 'door']
): Promise<void> => {
  console.log('📄 DXF→PDF 변환 시작...');
  console.log(`📊 변환할 뷰: ${views.join(', ')}`);

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
  const occupiedSlotIndices = new Set<number>();
  placedModules.forEach(m => {
    if (m.slotIndex !== undefined) {
      let globalSlotIndex = m.slotIndex;
      if (hasDroppedCeiling && m.zone === 'dropped') {
        globalSlotIndex = normalSlotCount + m.slotIndex;
      }
      occupiedSlotIndices.add(globalSlotIndex);
    }
  });
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

  for (const viewDirection of views) {
    // 측면도(left)는 가구가 있는 슬롯만 페이지 생성
    if (viewDirection === 'left' && sortedOccupiedSlots.length > 0) {
      for (const slotIndex of sortedOccupiedSlots) {

        if (!isFirstPage) pdf.addPage();
        isFirstPage = false;

        // 해당 슬롯의 가구만 필터링
        const slotModules = placedModules.filter(m => {
          if (m.slotIndex === undefined) return false;

          let globalSlotIndex = m.slotIndex;
          if (hasDroppedCeiling && m.zone === 'dropped') {
            globalSlotIndex = normalSlotCount + m.slotIndex;
          }

          return globalSlotIndex === slotIndex;
        });

        console.log(`📐 left (slot ${slotIndex + 1}): ${slotModules.length}개 가구`);

        const dxfViewDirection = pdfViewToViewDirection(viewDirection);
        const { lines, texts } = generateViewDataFromDxf(spaceInfo, slotModules, dxfViewDirection);
        console.log(`📐 left (slot ${slotIndex + 1}): ${lines.length}개 라인, ${texts.length}개 텍스트`);

        // 슬롯 번호를 제목에 포함
        renderToPdfWithSlotInfo(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight, slotIndex + 1, slotModules);
      }
    }
    // 도어 입면도 (DOOR 레이어만 표시 - 2D 뷰어에서 가구 필터 끈 것과 동일)
    else if (viewDirection === 'door-only') {
      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;

      console.log(`📐 door-only: 도어 입면도 렌더링 시작...`);

      // front 뷰 DXF 데이터 생성 후 DOOR 레이어만 필터링
      const dxfViewDirection = pdfViewToViewDirection(viewDirection);
      const { lines, texts } = generateViewDataFromDxf(spaceInfo, placedModules, dxfViewDirection);

      // DOOR 레이어만 필터링 (도어 형상 + 도어 치수선)
      const doorOnlyLines = lines.filter(line => line.layer === 'DOOR');

      // 도어 치수 텍스트도 포함 (DOOR 레이어 또는 door-dimension 관련 텍스트)
      const doorTexts = texts.filter(text => text.layer === 'DOOR' || text.layer === 'DOOR_DIMENSIONS');

      console.log(`📐 door-only: 원본 ${lines.length}개 라인 → DOOR 레이어 ${doorOnlyLines.length}개 라인, ${doorTexts.length}개 텍스트`);
      renderToPdf(pdf, doorOnlyLines, doorTexts, spaceInfo, viewDirection, pageWidth, pageHeight, placedModules);
    }
    // 입면도 (도어 없음) - DXF 생성 시 도어 제외
    else if (viewDirection === 'front-no-door') {
      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;

      console.log(`📐 front-no-door: 도어 없는 입면도 렌더링 (excludeDoor=true)...`);

      const dxfViewDirection = pdfViewToViewDirection(viewDirection);
      // excludeDoor=true로 DXF 생성 시 도어 관련 객체 모두 제외
      const { lines, texts } = generateViewDataFromDxf(spaceInfo, placedModules, dxfViewDirection, true);

      console.log(`📐 front-no-door: ${lines.length}개 라인, ${texts.length}개 텍스트 (도어 제외됨)`);
      renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight, placedModules);
    }
    else {
      // 일반 뷰 (front, top)
      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;

      const dxfViewDirection = pdfViewToViewDirection(viewDirection);
      const { lines, texts } = generateViewDataFromDxf(spaceInfo, placedModules, dxfViewDirection);
      console.log(`📐 ${viewDirection}: 최종 ${lines.length}개 라인, ${texts.length}개 텍스트`);
      renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight, placedModules);
    }
  }

  pdf.save(`drawing_${new Date().toISOString().slice(0, 10)}.pdf`);
  console.log('✅ PDF 다운로드 완료');
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
  slotModules?: PlacedModule[]
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

  // 라인 (모노 색상)
  pdf.setDrawColor(0, 0, 0);
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
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(Math.max(text.height * scale * 0.5, 6));
    pdf.text(text.text, toX(text.x), toY(text.y), { align: 'center' });
  });

  // 하단 정보 - 가구 깊이 계산 (slotModules에서 최대 깊이 추출)
  let furnitureDepth = 600; // 기본값
  if (slotModules && slotModules.length > 0) {
    const depths = slotModules.map(m => m.upperSectionDepth || m.customDepth || 600);
    furnitureDepth = Math.max(...depths);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(`${spaceInfo.width}mm × ${spaceInfo.height}mm × ${furnitureDepth}mm`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
};
