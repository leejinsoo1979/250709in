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
import { getModuleById, ModuleData } from '@/data/modules';

// 도어/서랍 정보 인터페이스
interface DoorDrawingItem {
  moduleId: string;
  moduleName: string;
  furnitureX: number; // 가구 X 위치 (mm)
  furnitureWidth: number; // 가구 전체 너비 (mm)
  furnitureHeight: number; // 가구 전체 높이 (mm)
  items: {
    type: 'door' | 'drawer';
    x: number; // 도어/서랍 X 위치 (가구 기준, mm)
    y: number; // 도어/서랍 Y 위치 (가구 바닥 기준, mm)
    width: number; // 도어/서랍 너비 (mm)
    height: number; // 도어/서랍 높이 (mm)
    label?: string; // 라벨 (서랍1, 서랍2 등)
  }[];
}

// PDF 뷰 타입
export type PdfViewDirection = 'front' | 'left' | 'top' | 'door';

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

/**
 * 가구에서 도어/서랍 정보 추출
 *
 * 도어 판별 로직:
 * 1. placedModule.hasDoor가 명시적으로 설정되어 있으면 그 값 사용
 * 2. 아니면 moduleData.hasDoor 사용 (기본값: false)
 * 3. 서랍은 sections에서 type='drawer'인 섹션 확인
 */
const extractDoorInfo = (
  placedModule: PlacedModule,
  moduleData: ModuleData | undefined,
  spaceInfo: SpaceInfo
): DoorDrawingItem | null => {
  if (!moduleData) {
    console.log(`  ❌ 모듈 데이터 없음: ${placedModule.moduleId}`);
    return null;
  }

  // hasDoor 판별: placedModule에 명시적으로 설정되어 있으면 그 값, 아니면 moduleData 값
  const hasDoor = placedModule.hasDoor !== undefined
    ? placedModule.hasDoor
    : (moduleData.hasDoor ?? false);

  const sections = moduleData.modelConfig?.sections || [];
  const leftSections = moduleData.modelConfig?.leftSections || [];
  const rightSections = moduleData.modelConfig?.rightSections || [];
  const allSections = [...sections, ...leftSections, ...rightSections];

  // 서랍이 있는 섹션 확인
  const hasDrawer = allSections.some(s => s.type === 'drawer');

  console.log(`  🚪 도어 정보 추출: ${moduleData.name}`, {
    placedHasDoor: placedModule.hasDoor,
    moduleHasDoor: moduleData.hasDoor,
    finalHasDoor: hasDoor,
    hasDrawer,
    sectionsCount: allSections.length
  });

  // 도어도 서랍도 없으면 스킵
  if (!hasDoor && !hasDrawer) {
    console.log(`  ⏭️ 도어/서랍 없음 - 스킵`);
    return null;
  }

  const furnitureWidth = placedModule.customWidth || moduleData.dimensions.width;
  const furnitureHeight = placedModule.customHeight || moduleData.dimensions.height;
  const furnitureX = placedModule.position.x * 1000; // Three.js 좌표(m)를 mm로 변환

  const items: DoorDrawingItem['items'] = [];

  // 기본 두께 (측판, 하판 등)
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;

  // 도어 갭 설정
  const doorTopGap = placedModule.doorTopGap ?? 10;
  const doorBottomGap = placedModule.doorBottomGap ?? 65;

  // 서랍 처리 - 모든 섹션 순회
  let currentY = basicThickness; // 하판 위부터 시작

  for (const section of allSections) {
    if (section.type === 'drawer') {
      const drawerHeights = section.drawerHeights || [];
      const gapHeight = section.gapHeight || 24;

      for (let i = 0; i < drawerHeights.length; i++) {
        const drawerHeight = drawerHeights[i];

        items.push({
          type: 'drawer',
          x: basicThickness, // 좌측판 두께
          y: currentY,
          width: furnitureWidth - basicThickness * 2, // 양쪽 측판 두께 제외
          height: drawerHeight,
          label: `Drawer ${i + 1}`
        });

        currentY += drawerHeight + gapHeight;
      }
    } else if (section.type === 'hanging' || section.type === 'shelf' || section.type === 'open') {
      // 서랍이 아닌 섹션의 높이를 계산
      if (section.heightType === 'absolute') {
        currentY += section.height;
      } else {
        // 퍼센트 기반 높이 계산
        currentY += (section.height / 100) * furnitureHeight;
      }
    }
  }

  // 도어 처리 (hasDoor가 true인 경우)
  if (hasDoor) {
    const doorX = basicThickness;
    const doorY = doorBottomGap;
    const doorWidth = furnitureWidth - basicThickness * 2;
    const doorHeight = furnitureHeight - doorTopGap - doorBottomGap;

    // 도어 높이가 유효한 경우에만 도어 추가
    if (doorHeight > 0) {
      items.push({
        type: 'door',
        x: doorX,
        y: doorY,
        width: doorWidth,
        height: doorHeight,
        label: 'Door'
      });
      console.log(`  ✅ 도어 추가: ${doorWidth}x${doorHeight}mm`);
    }
  }

  if (items.length === 0) {
    console.log(`  ⏭️ 추출된 아이템 없음`);
    return null;
  }

  console.log(`  ✅ 도어/서랍 ${items.length}개 추출됨`);

  return {
    moduleId: placedModule.moduleId,
    moduleName: moduleData.name,
    furnitureX,
    furnitureWidth,
    furnitureHeight,
    items
  };
};

/**
 * 도어도면 전용 렌더링 함수
 * 가구 본체 없이 도어/서랍만 치수와 함께 표시
 */
const renderDoorDrawingToPdf = (
  pdf: jsPDF,
  doorItems: DoorDrawingItem[],
  spaceInfo: SpaceInfo,
  pageWidth: number,
  pageHeight: number
): void => {
  const margin = 20;
  const titleHeight = 15;

  // 타이틀
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Door Drawing', margin, margin + 10);
  pdf.setFont('helvetica', 'normal');

  if (doorItems.length === 0) {
    pdf.setFontSize(12);
    pdf.text('No doors or drawers found', pageWidth / 2, pageHeight / 2, { align: 'center' });
    return;
  }

  // 도면 영역
  const drawableWidth = pageWidth - margin * 2;
  const drawableHeight = pageHeight - margin * 2 - titleHeight;

  // 전체 범위 계산
  let minX = Infinity, maxX = -Infinity;
  let minY = 0, maxY = -Infinity;

  for (const doorItem of doorItems) {
    for (const item of doorItem.items) {
      const absX = doorItem.furnitureX + item.x;
      minX = Math.min(minX, absX);
      maxX = Math.max(maxX, absX + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }
  }

  // 여유 마진
  const marginMm = 150;
  minX -= marginMm;
  maxX += marginMm;
  maxY += marginMm;

  const totalWidthMm = maxX - minX;
  const totalHeightMm = maxY - minY;

  // 스케일 계산
  const scaleX = drawableWidth / totalWidthMm;
  const scaleY = drawableHeight / totalHeightMm;
  const scale = Math.min(scaleX, scaleY) * 0.8;

  // 좌표 변환 함수
  const toPageX = (mmX: number): number => {
    return margin + (mmX - minX) * scale + (drawableWidth - totalWidthMm * scale) / 2;
  };
  const toPageY = (mmY: number): number => {
    // Y축 반전
    return margin + titleHeight + drawableHeight - (mmY - minY) * scale - (drawableHeight - totalHeightMm * scale) / 2;
  };

  // 스케일 표시
  pdf.setFontSize(8);
  pdf.text(`Scale: 1:${Math.round(1 / scale)}`, pageWidth - margin - 30, margin + 10);

  // 각 도어/서랍 그리기
  for (const doorItem of doorItems) {
    for (const item of doorItem.items) {
      const absX = doorItem.furnitureX + item.x;
      const pdfX = toPageX(absX);
      const pdfY = toPageY(item.y + item.height);
      const pdfWidth = item.width * scale;
      const pdfHeight = item.height * scale;

      // 사각형 그리기
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);

      if (item.type === 'door') {
        pdf.setFillColor(240, 240, 240);
        pdf.rect(pdfX, pdfY, pdfWidth, pdfHeight, 'FD');

        // 힌지 표시
        pdf.setFillColor(0, 0, 0);
        pdf.circle(pdfX + 2, pdfY + 8, 1.5, 'F');
        pdf.circle(pdfX + 2, pdfY + pdfHeight - 8, 1.5, 'F');
      } else {
        // 서랍
        pdf.setFillColor(250, 250, 250);
        pdf.rect(pdfX, pdfY, pdfWidth, pdfHeight, 'FD');

        // 손잡이
        const handleY = pdfY + pdfHeight / 2;
        const handleWidth = Math.min(pdfWidth * 0.25, 20);
        pdf.setLineWidth(0.8);
        pdf.line(
          pdfX + pdfWidth / 2 - handleWidth / 2,
          handleY,
          pdfX + pdfWidth / 2 + handleWidth / 2,
          handleY
        );
      }

      // 너비 치수선 (상단)
      const dimOffset = 6;
      pdf.setLineWidth(0.2);
      pdf.setDrawColor(100, 100, 100);

      // 상단 치수선
      pdf.line(pdfX, pdfY - dimOffset, pdfX + pdfWidth, pdfY - dimOffset);
      pdf.line(pdfX, pdfY - dimOffset - 2, pdfX, pdfY - dimOffset + 2);
      pdf.line(pdfX + pdfWidth, pdfY - dimOffset - 2, pdfX + pdfWidth, pdfY - dimOffset + 2);

      // 너비 텍스트
      pdf.setFontSize(7);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${Math.round(item.width)}`, pdfX + pdfWidth / 2, pdfY - dimOffset - 2, { align: 'center' });

      // 우측 치수선 (높이)
      const dimX = pdfX + pdfWidth + dimOffset;
      pdf.setDrawColor(100, 100, 100);
      pdf.line(dimX, pdfY, dimX, pdfY + pdfHeight);
      pdf.line(dimX - 2, pdfY, dimX + 2, pdfY);
      pdf.line(dimX - 2, pdfY + pdfHeight, dimX + 2, pdfY + pdfHeight);

      // 높이 텍스트 (가로로 표시)
      pdf.text(`${Math.round(item.height)}`, dimX + 3, pdfY + pdfHeight / 2 + 2);

      // 라벨 (도어/서랍 내부)
      if (item.label) {
        pdf.setFontSize(6);
        pdf.setTextColor(80, 80, 80);
        pdf.text(item.label, pdfX + pdfWidth / 2, pdfY + pdfHeight - 3, { align: 'center' });
      }
    }
  }

  // 범례
  const legendY = pageHeight - margin - 15;
  pdf.setFontSize(7);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Legend:', margin, legendY);

  // 도어 범례
  pdf.setFillColor(240, 240, 240);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.3);
  pdf.rect(margin + 20, legendY - 5, 10, 6, 'FD');
  pdf.text('Door', margin + 35, legendY);

  // 서랍 범례
  pdf.setFillColor(250, 250, 250);
  pdf.rect(margin + 60, legendY - 5, 10, 6, 'FD');
  pdf.line(margin + 63, legendY - 2, margin + 67, legendY - 2);
  pdf.text('Drawer', margin + 75, legendY);

  // 단위
  pdf.text('All dimensions in mm', margin, legendY + 5);
};

// 뷰 제목 (jsPDF는 한글 미지원, 영문만 사용)
const getViewTitle = (v: PdfViewDirection): string => {
  const titles: Record<string, string> = {
    front: 'Front View (Elevation)',
    left: 'Side View (Left)',
    top: 'Top View (Plan)',
    door: 'Door Drawing'
  };
  return titles[v] || 'Drawing';
};

// 측면뷰 필터
const getSideViewFilter = (v: PdfViewDirection): SideViewFilter => {
  if (v === 'left') return 'leftmost';
  if (v === 'door') return 'all'; // 도어도면은 모든 가구 표시
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
  views: PdfViewDirection[] = ['front', 'top', 'left', 'door']
): Promise<void> => {
  console.log('📄 DXF→PDF 변환 시작...');
  console.log(`📊 변환할 뷰: ${views.join(', ')}`);

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  views.forEach((viewDirection, index) => {
    if (index > 0) pdf.addPage();

    // 도어도면은 별도 렌더링 함수 사용
    if (viewDirection === 'door') {
      console.log(`📐 door: 도어도면 전용 렌더링 시작...`);

      // 가구에서 도어/서랍 정보 추출
      const doorItems: DoorDrawingItem[] = [];
      for (const placedModule of placedModules) {
        const moduleData = getModuleById(placedModule.moduleId);
        const doorInfo = extractDoorInfo(placedModule, moduleData, spaceInfo);
        if (doorInfo) {
          doorItems.push(doorInfo);
        }
      }

      console.log(`📐 door: ${doorItems.length}개 가구에서 도어/서랍 추출됨`);
      renderDoorDrawingToPdf(pdf, doorItems, spaceInfo, pageWidth, pageHeight);
    } else {
      // 일반 뷰는 DXF 파싱 방식 사용
      const { lines, texts } = generateViewDataFromDxf(spaceInfo, placedModules, viewDirection);
      console.log(`📐 ${viewDirection}: 최종 ${lines.length}개 라인, ${texts.length}개 텍스트`);
      renderToPdf(pdf, lines, texts, spaceInfo, viewDirection, pageWidth, pageHeight);
    }
  });

  pdf.save(`drawing_${new Date().toISOString().slice(0, 10)}.pdf`);
  console.log('✅ PDF 다운로드 완료');
};
