/**
 * DXF 데이터를 PDF로 변환
 * 기존 DXF 생성 로직을 그대로 활용하여 깔끔한 벡터 PDF 생성
 */

import { jsPDF } from 'jspdf';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import {
  generateDxfFromData,
  type ViewDirection,
  type SideViewFilter,
  type DxfLine,
  type DxfText,
  generateExternalDimensions
} from './dxfDataRenderer';
import { sceneHolder } from '../viewer3d/sceneHolder';
import * as THREE from 'three';

// PDF 뷰 타입
export type PdfViewDirection = 'front' | 'left' | 'right' | 'top';

// DXF ACI 색상을 hex로 변환
const aciToHex = (aci: number): string => {
  const aciColors: Record<number, string> = {
    1: '#FF0000',   // 빨강
    2: '#FFFF00',   // 노랑
    3: '#00FF00',   // 초록 (공간 프레임)
    4: '#00FFFF',   // 시안
    5: '#0000FF',   // 파랑
    6: '#FF00FF',   // 마젠타
    7: '#333333',   // 흰색/검정 → PDF에서는 어두운 회색
    8: '#666666',   // 회색
    9: '#999999',   // 밝은 회색
    30: '#FF4500',  // 주황 (가구 프레임)
    250: '#444444', // 어두운 회색
    254: '#CCCCCC', // 매우 밝은 회색 (백패널)
  };
  return aciColors[aci] || '#333333';
};

// 뷰 방향에 따른 한글 제목
const getViewTitle = (viewDirection: PdfViewDirection): string => {
  switch (viewDirection) {
    case 'front': return '정면도';
    case 'left': return '좌측면도';
    case 'right': return '우측면도';
    case 'top': return '평면도';
    default: return '도면';
  }
};

// 측면뷰 필터 결정
const getSideViewFilter = (viewDirection: PdfViewDirection): SideViewFilter => {
  if (viewDirection === 'left') return 'leftmost';
  if (viewDirection === 'right') return 'rightmost';
  return 'all';
};

/**
 * 씬에서 라인과 텍스트 추출 (dxfDataRenderer.ts의 extractFromScene 간소화 버전)
 */
const extractFromScene = (
  scene: THREE.Scene,
  viewDirection: ViewDirection,
  spaceDepthMm: number
): { lines: DxfLine[]; texts: DxfText[] } => {
  const lines: DxfLine[] = [];
  const texts: DxfText[] = [];
  const scale = 100; // mm 단위 변환

  // 3D → 2D 투영
  const projectTo2D = (p: THREE.Vector3): { x: number; y: number } => {
    switch (viewDirection) {
      case 'front':
        return { x: p.x * scale, y: p.y * scale };
      case 'top':
        return { x: p.x * scale, y: -p.z * scale };
      case 'left':
        return { x: (spaceDepthMm / 200 - p.z) * scale, y: p.y * scale };
      case 'right':
        return { x: (p.z + spaceDepthMm / 200) * scale, y: p.y * scale };
      default:
        return { x: p.x * scale, y: p.y * scale };
    }
  };

  // 라인이 보이는지 확인
  const isLineVisible = (p1: THREE.Vector3, p2: THREE.Vector3): boolean => {
    const threshold = 0.001;
    switch (viewDirection) {
      case 'front':
        return !(Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.y - p2.y) < threshold);
      case 'top':
        return !(Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.z - p2.z) < threshold);
      case 'left':
      case 'right':
        return !(Math.abs(p1.z - p2.z) < threshold && Math.abs(p1.y - p2.y) < threshold);
      default:
        return true;
    }
  };

  // 레이어 결정
  const getLayer = (name: string): string => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('dimension')) return 'DIMENSIONS';
    if (lowerName.includes('frame')) return 'SPACE_FRAME';
    if (lowerName.includes('panel')) return 'FURNITURE_PANEL';
    if (lowerName.includes('door')) return 'DOOR';
    if (lowerName.includes('drawer')) return 'FURNITURE_PANEL';
    if (lowerName.includes('back')) return 'BACK_PANEL';
    if (lowerName.includes('rod')) return 'CLOTHING_ROD';
    if (lowerName.includes('adjust') || lowerName.includes('leg')) return 'ACCESSORIES';
    return 'FURNITURE_PANEL';
  };

  // 색상 추출
  const getColor = (material: THREE.Material | THREE.Material[] | undefined): number => {
    if (!material) return 7;
    const mat = Array.isArray(material) ? material[0] : material;
    if (!mat) return 7;

    // LineMaterial
    if ((mat as any).isLineMaterial && (mat as any).color) {
      const color = (mat as any).color as THREE.Color;
      return rgbToAci(Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255));
    }

    // Standard materials
    if ('color' in mat && (mat as any).color) {
      const color = (mat as any).color as THREE.Color;
      return rgbToAci(Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255));
    }

    return 7;
  };

  // RGB → ACI
  const rgbToAci = (r: number, g: number, b: number): number => {
    if (r < 30 && g < 30 && b < 30) return 7;
    if (r > 225 && g > 225 && b > 225) return 7;
    if (r > 240 && g > 50 && g < 90 && b < 20) return 30; // 주황
    if (r > 60 && r < 80 && g > 60 && g < 80 && b > 60 && b < 80) return 8; // 어두운 회색
    if (r < 50 && g > 180 && b < 80) return 3; // 초록
    return 7;
  };

  // 제외할 객체
  const shouldExclude = (name: string): boolean => {
    const lowerName = name.toLowerCase();
    return lowerName.includes('grid') ||
           lowerName.includes('helper') ||
           lowerName.includes('light') ||
           lowerName.includes('camera') ||
           lowerName.includes('axis') ||
           lowerName.includes('guide');
  };

  // 씬 순회
  scene.traverse((object) => {
    if (!object.visible) return;
    if (shouldExclude(object.name)) return;

    // Line 처리
    if (object instanceof THREE.Line) {
      const geometry = object.geometry;
      if (!geometry) return;

      const positions = geometry.getAttribute('position');
      if (!positions) return;

      const worldMatrix = object.matrixWorld;
      const layer = getLayer(object.name);
      const color = getColor(object.material);

      for (let i = 0; i < positions.count - 1; i++) {
        const p1 = new THREE.Vector3(
          positions.getX(i),
          positions.getY(i),
          positions.getZ(i)
        ).applyMatrix4(worldMatrix);

        const p2 = new THREE.Vector3(
          positions.getX(i + 1),
          positions.getY(i + 1),
          positions.getZ(i + 1)
        ).applyMatrix4(worldMatrix);

        if (!isLineVisible(p1, p2)) continue;

        const proj1 = projectTo2D(p1);
        const proj2 = projectTo2D(p2);

        lines.push({
          x1: proj1.x,
          y1: proj1.y,
          x2: proj2.x,
          y2: proj2.y,
          layer,
          color
        });
      }
    }

    // LineSegments 처리
    if (object instanceof THREE.LineSegments) {
      const geometry = object.geometry;
      if (!geometry) return;

      const positions = geometry.getAttribute('position');
      if (!positions) return;

      const worldMatrix = object.matrixWorld;
      const layer = getLayer(object.name);
      const color = getColor(object.material);

      for (let i = 0; i < positions.count; i += 2) {
        const p1 = new THREE.Vector3(
          positions.getX(i),
          positions.getY(i),
          positions.getZ(i)
        ).applyMatrix4(worldMatrix);

        const p2 = new THREE.Vector3(
          positions.getX(i + 1),
          positions.getY(i + 1),
          positions.getZ(i + 1)
        ).applyMatrix4(worldMatrix);

        if (!isLineVisible(p1, p2)) continue;

        const proj1 = projectTo2D(p1);
        const proj2 = projectTo2D(p2);

        lines.push({
          x1: proj1.x,
          y1: proj1.y,
          x2: proj2.x,
          y2: proj2.y,
          layer,
          color
        });
      }
    }
  });

  return { lines, texts };
};

/**
 * 단일 뷰의 DXF 데이터를 추출
 */
const extractDxfData = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: PdfViewDirection
): { lines: DxfLine[]; texts: DxfText[] } => {
  const scene = sceneHolder.getScene();
  if (!scene) {
    console.error('❌ 씬을 찾을 수 없습니다');
    return { lines: [], texts: [] };
  }

  const spaceDepthMm = spaceInfo.depth || 600;
  const sideViewFilter = getSideViewFilter(viewDirection);

  // 씬에서 가구 형상 추출
  const extracted = extractFromScene(scene, viewDirection as ViewDirection, spaceDepthMm);

  // 외부 치수선 생성
  const externalDimensions = generateExternalDimensions(
    spaceInfo,
    placedModules,
    viewDirection as ViewDirection,
    sideViewFilter
  );

  // 합치기
  const lines = [...extracted.lines, ...externalDimensions.lines];
  const texts = [...extracted.texts, ...externalDimensions.texts];

  console.log(`📐 PDF용 DXF 데이터 추출 (${viewDirection}): 라인 ${lines.length}개, 텍스트 ${texts.length}개`);

  return { lines, texts };
};

/**
 * DXF 데이터를 PDF 페이지에 렌더링
 */
const renderDxfToPdf = (
  pdf: jsPDF,
  dxfData: { lines: DxfLine[]; texts: DxfText[] },
  spaceInfo: SpaceInfo,
  viewDirection: PdfViewDirection,
  pageWidth: number,
  pageHeight: number
) => {
  const margin = 20; // mm
  const titleHeight = 15; // 제목 영역
  const drawableWidth = pageWidth - margin * 2;
  const drawableHeight = pageHeight - margin * 2 - titleHeight;

  // 도면 영역 중앙 계산
  const centerX = margin + drawableWidth / 2;
  const centerY = margin + titleHeight + drawableHeight / 2;

  // DXF 데이터의 바운딩 박스 계산
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  dxfData.lines.forEach(line => {
    minX = Math.min(minX, line.x1, line.x2);
    minY = Math.min(minY, line.y1, line.y2);
    maxX = Math.max(maxX, line.x1, line.x2);
    maxY = Math.max(maxY, line.y1, line.y2);
  });
  dxfData.texts.forEach(text => {
    minX = Math.min(minX, text.x);
    minY = Math.min(minY, text.y);
    maxX = Math.max(maxX, text.x);
    maxY = Math.max(maxY, text.y);
  });

  // 도면이 없으면 리턴
  if (minX === Infinity) return;

  const dxfWidth = maxX - minX;
  const dxfHeight = maxY - minY;

  // 스케일 계산 (도면이 영역에 맞도록)
  const scaleX = drawableWidth / dxfWidth;
  const scaleY = drawableHeight / dxfHeight;
  const scale = Math.min(scaleX, scaleY) * 0.85; // 10% 여유

  // DXF 좌표를 PDF 좌표로 변환
  const toPageX = (x: number): number => {
    return centerX + (x - (minX + maxX) / 2) * scale;
  };
  const toPageY = (y: number): number => {
    // Y축 반전 (DXF는 아래가 0, PDF는 위가 0)
    return centerY - (y - (minY + maxY) / 2) * scale;
  };

  // 제목 렌더링
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text(getViewTitle(viewDirection), pageWidth / 2, margin + 8, { align: 'center' });

  // 라인 렌더링
  dxfData.lines.forEach(line => {
    const color = aciToHex(line.color);
    const rgb = hexToRgb(color);
    pdf.setDrawColor(rgb.r, rgb.g, rgb.b);

    // 레이어에 따른 선 굵기
    let lineWidth = 0.3;
    if (line.layer === 'DIMENSIONS') lineWidth = 0.2;
    if (line.layer === 'SPACE_FRAME') lineWidth = 0.4;
    if (line.layer === 'FURNITURE_PANEL') lineWidth = 0.35;
    if (line.layer === 'BACK_PANEL') lineWidth = 0.15;

    pdf.setLineWidth(lineWidth);
    pdf.line(
      toPageX(line.x1),
      toPageY(line.y1),
      toPageX(line.x2),
      toPageY(line.y2)
    );
  });

  // 텍스트 렌더링
  dxfData.texts.forEach(text => {
    const color = aciToHex(text.color);
    const rgb = hexToRgb(color);
    pdf.setTextColor(rgb.r, rgb.g, rgb.b);

    // 폰트 크기 스케일 조정
    const fontSize = Math.max(text.height * scale * 0.5, 6);
    pdf.setFontSize(fontSize);

    pdf.text(
      text.text,
      toPageX(text.x),
      toPageY(text.y),
      { align: 'center' }
    );
  });

  // 도면 정보 (하단)
  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  const infoText = `공간: ${spaceInfo.width}mm × ${spaceInfo.height}mm × ${spaceInfo.depth}mm`;
  pdf.text(infoText, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
};

// hex 색상을 RGB로 변환
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

/**
 * DXF 데이터를 PDF로 내보내기
 */
export const downloadDxfAsPdf = async (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  views: PdfViewDirection[] = ['front', 'top', 'left', 'right']
): Promise<void> => {
  console.log('📄 DXF→PDF 변환 시작...');
  console.log(`📊 선택된 뷰: ${views.join(', ')}`);

  // A4 가로 PDF 생성
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // 각 뷰별로 페이지 생성
  views.forEach((viewDirection, index) => {
    if (index > 0) {
      pdf.addPage();
    }

    console.log(`📐 ${viewDirection} 뷰 렌더링 중...`);

    // DXF 데이터 추출
    const dxfData = extractDxfData(spaceInfo, placedModules, viewDirection);

    // PDF에 렌더링
    renderDxfToPdf(pdf, dxfData, spaceInfo, viewDirection, pageWidth, pageHeight);
  });

  // 파일 저장
  const filename = `도면_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);

  console.log(`✅ PDF 다운로드 완료: ${filename}`);
};

// 기존 downloadVectorPDF 호환 인터페이스
export const downloadVectorPDF = downloadDxfAsPdf;
export type { PdfViewDirection as ViewDirection };
