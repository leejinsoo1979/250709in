/**
 * 벡터 기반 PDF 내보내기
 * DXF와 동일한 벡터 데이터를 사용하여 깔끔한 PDF 생성
 */

import { jsPDF } from 'jspdf';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { sceneHolder } from '../viewer3d/sceneHolder';
import * as THREE from 'three';

// 뷰 방향 타입
export type ViewDirection = 'front' | 'left' | 'right' | 'top';
export type SideViewFilter = 'all' | 'leftmost' | 'rightmost';

// 벡터 라인 인터페이스
interface VectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  color: string; // hex color
  lineWidth: number;
}

// 벡터 텍스트 인터페이스
interface VectorText {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  align?: 'left' | 'center' | 'right';
}

// 추출된 벡터 데이터
interface VectorData {
  lines: VectorLine[];
  texts: VectorText[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

// 뷰 방향 전역 변수
let currentViewDirection: ViewDirection = 'front';
let currentSpaceDepthMm = 600;

/**
 * 3D 좌표를 2D로 투영
 */
const projectTo2D = (p: THREE.Vector3, scale: number): { x: number; y: number } => {
  switch (currentViewDirection) {
    case 'front':
      return { x: p.x * scale, y: p.y * scale };
    case 'top':
      return { x: p.x * scale, y: -p.z * scale };
    case 'left':
      return { x: (currentSpaceDepthMm / 200 - p.z) * scale, y: p.y * scale };
    case 'right':
      return { x: (p.z + currentSpaceDepthMm / 200) * scale, y: p.y * scale };
    default:
      return { x: p.x * scale, y: p.y * scale };
  }
};

/**
 * Three.js 색상을 hex로 변환
 */
const colorToHex = (color: THREE.Color): string => {
  return '#' + color.getHexString();
};

/**
 * Material에서 색상 추출
 */
const getColorFromMaterial = (material: THREE.Material | THREE.Material[] | undefined): string => {
  if (!material) return '#000000';

  const mat = Array.isArray(material) ? material[0] : material;
  if (!mat) return '#000000';

  // LineMaterial (drei)
  if ((mat as any).isLineMaterial && (mat as any).color) {
    return colorToHex((mat as any).color);
  }

  // ShaderMaterial
  if ((mat as THREE.ShaderMaterial).uniforms) {
    const uniforms = (mat as THREE.ShaderMaterial).uniforms;
    if (uniforms.diffuse?.value) return colorToHex(uniforms.diffuse.value);
    if (uniforms.color?.value) return colorToHex(uniforms.color.value);
  }

  // Standard materials
  if ('color' in mat && (mat as any).color) {
    return colorToHex((mat as any).color);
  }

  return '#000000';
};

/**
 * 객체 이름으로 제외 여부 판단
 */
const shouldExclude = (name: string): boolean => {
  const lowerName = name.toLowerCase();

  // 그리드, 헬퍼, 라이트 제외
  if (lowerName.includes('grid') ||
      lowerName.includes('helper') ||
      lowerName.includes('light') ||
      lowerName.includes('camera') ||
      lowerName.includes('axis') ||
      lowerName.includes('guide')) {
    return true;
  }

  return false;
};

/**
 * 레이어 결정
 */
const determineLayer = (name: string): string => {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('dimension')) return 'DIMENSIONS';
  if (lowerName.includes('frame') || lowerName.includes('furniture')) return 'FURNITURE';
  if (lowerName.includes('space') || lowerName.includes('wall')) return 'SPACE';
  if (lowerName.includes('door')) return 'DOORS';
  if (lowerName.includes('drawer')) return 'DRAWERS';

  return 'DEFAULT';
};

/**
 * 라인이 해당 뷰에서 보이는지 확인
 */
const isLineVisibleInView = (p1: THREE.Vector3, p2: THREE.Vector3): boolean => {
  const threshold = 0.001;

  switch (currentViewDirection) {
    case 'front':
      if (Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.y - p2.y) < threshold) return false;
      break;
    case 'top':
      if (Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.z - p2.z) < threshold) return false;
      break;
    case 'left':
    case 'right':
      if (Math.abs(p1.z - p2.z) < threshold && Math.abs(p1.y - p2.y) < threshold) return false;
      break;
  }

  return true;
};

/**
 * 씬에서 벡터 데이터 추출
 */
const extractVectorData = (
  scene: THREE.Scene,
  viewDirection: ViewDirection,
  spaceDepthMm: number
): VectorData => {
  const lines: VectorLine[] = [];
  const texts: VectorText[] = [];
  const scale = 100; // 1 Three.js unit = 100mm

  currentViewDirection = viewDirection;
  currentSpaceDepthMm = spaceDepthMm;

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  scene.traverse((object) => {
    if (!object.visible) return;

    const name = object.name || '';
    if (shouldExclude(name)) return;

    object.updateMatrixWorld(true);
    const matrix = object.matrixWorld;
    const layer = determineLayer(name);

    // LineSegments 처리
    if (object instanceof THREE.LineSegments) {
      const geometry = object.geometry;
      const positions = geometry.getAttribute('position');

      if (positions) {
        const color = getColorFromMaterial(object.material);

        for (let i = 0; i < positions.count; i += 2) {
          const p1 = new THREE.Vector3(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
          ).applyMatrix4(matrix);

          const p2 = new THREE.Vector3(
            positions.getX(i + 1),
            positions.getY(i + 1),
            positions.getZ(i + 1)
          ).applyMatrix4(matrix);

          if (!isLineVisibleInView(p1, p2)) continue;

          const proj1 = projectTo2D(p1, scale);
          const proj2 = projectTo2D(p2, scale);

          lines.push({
            x1: proj1.x,
            y1: proj1.y,
            x2: proj2.x,
            y2: proj2.y,
            layer,
            color,
            lineWidth: layer === 'DIMENSIONS' ? 0.3 : 0.5
          });

          // 바운드 업데이트
          minX = Math.min(minX, proj1.x, proj2.x);
          minY = Math.min(minY, proj1.y, proj2.y);
          maxX = Math.max(maxX, proj1.x, proj2.x);
          maxY = Math.max(maxY, proj1.y, proj2.y);
        }
      }
    }

    // Line 처리
    if (object instanceof THREE.Line && !(object instanceof THREE.LineSegments)) {
      const geometry = object.geometry;
      const positions = geometry.getAttribute('position');

      if (positions && positions.count >= 2) {
        const color = getColorFromMaterial(object.material);

        for (let i = 0; i < positions.count - 1; i++) {
          const p1 = new THREE.Vector3(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
          ).applyMatrix4(matrix);

          const p2 = new THREE.Vector3(
            positions.getX(i + 1),
            positions.getY(i + 1),
            positions.getZ(i + 1)
          ).applyMatrix4(matrix);

          if (!isLineVisibleInView(p1, p2)) continue;

          const proj1 = projectTo2D(p1, scale);
          const proj2 = projectTo2D(p2, scale);

          lines.push({
            x1: proj1.x,
            y1: proj1.y,
            x2: proj2.x,
            y2: proj2.y,
            layer,
            color,
            lineWidth: 0.5
          });

          minX = Math.min(minX, proj1.x, proj2.x);
          minY = Math.min(minY, proj1.y, proj2.y);
          maxX = Math.max(maxX, proj1.x, proj2.x);
          maxY = Math.max(maxY, proj1.y, proj2.y);
        }
      }
    }
  });

  return {
    lines,
    texts,
    bounds: { minX, minY, maxX, maxY }
  };
};

/**
 * 도면 타입 한글 이름
 */
const getDrawingTypeName = (viewDirection: ViewDirection): string => {
  switch (viewDirection) {
    case 'front': return '정면도';
    case 'top': return '평면도';
    case 'left': return '좌측면도';
    case 'right': return '우측면도';
    default: return '도면';
  }
};

/**
 * 벡터 PDF 생성
 */
export const generateVectorPDF = async (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirections: ViewDirection[] = ['front']
): Promise<Blob> => {
  const scene = sceneHolder.getScene();

  if (!scene) {
    throw new Error('씬을 찾을 수 없습니다');
  }

  // A4 가로 (297 x 210 mm)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 15;
  const drawingAreaWidth = pageWidth - margin * 2;
  const drawingAreaHeight = pageHeight - margin * 2 - 20; // 타이틀 영역 제외

  for (let i = 0; i < viewDirections.length; i++) {
    const viewDirection = viewDirections[i];

    if (i > 0) {
      pdf.addPage();
    }

    // 벡터 데이터 추출
    const vectorData = extractVectorData(scene, viewDirection, spaceInfo.depth);

    console.log(`📐 ${viewDirection} 뷰 벡터 데이터 추출: ${vectorData.lines.length}개 라인`);

    // 스케일 계산
    const dataWidth = vectorData.bounds.maxX - vectorData.bounds.minX;
    const dataHeight = vectorData.bounds.maxY - vectorData.bounds.minY;

    if (dataWidth <= 0 || dataHeight <= 0) {
      console.warn(`⚠️ ${viewDirection} 뷰에 표시할 데이터가 없습니다`);
      continue;
    }

    const scaleX = drawingAreaWidth / dataWidth;
    const scaleY = drawingAreaHeight / dataHeight;
    const drawScale = Math.min(scaleX, scaleY) * 0.9; // 90%로 여유 확보

    // 센터링 오프셋
    const scaledWidth = dataWidth * drawScale;
    const scaledHeight = dataHeight * drawScale;
    const offsetX = margin + (drawingAreaWidth - scaledWidth) / 2;
    const offsetY = margin + 15 + (drawingAreaHeight - scaledHeight) / 2; // 타이틀 아래

    // 타이틀
    pdf.setFontSize(14);
    pdf.setTextColor(0, 0, 0);
    pdf.text(getDrawingTypeName(viewDirection), pageWidth / 2, margin + 5, { align: 'center' });

    // 치수 정보
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(
      `${spaceInfo.width}W x ${spaceInfo.height}H x ${spaceInfo.depth}D mm`,
      pageWidth / 2,
      margin + 10,
      { align: 'center' }
    );

    // 라인 그리기
    for (const line of vectorData.lines) {
      // 좌표 변환 (Y축 뒤집기 + 스케일 + 오프셋)
      const x1 = offsetX + (line.x1 - vectorData.bounds.minX) * drawScale;
      const y1 = offsetY + scaledHeight - (line.y1 - vectorData.bounds.minY) * drawScale;
      const x2 = offsetX + (line.x2 - vectorData.bounds.minX) * drawScale;
      const y2 = offsetY + scaledHeight - (line.y2 - vectorData.bounds.minY) * drawScale;

      // 색상 설정
      const hex = line.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      // 너무 밝은 색은 어둡게 조정 (흰색 배경에서 보이도록)
      const brightness = (r + g + b) / 3;
      if (brightness > 200) {
        pdf.setDrawColor(50, 50, 50);
      } else {
        pdf.setDrawColor(r, g, b);
      }

      pdf.setLineWidth(line.lineWidth * 0.3);
      pdf.line(x1, y1, x2, y2);
    }

    // 테두리 (옵션)
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.rect(margin, margin + 15, drawingAreaWidth, drawingAreaHeight);

    // 스케일 표시
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    const scaleRatio = (1 / drawScale).toFixed(1);
    pdf.text(`Scale 1:${scaleRatio}`, pageWidth - margin - 5, pageHeight - margin + 5, { align: 'right' });
  }

  return pdf.output('blob');
};

/**
 * 벡터 PDF 다운로드
 */
export const downloadVectorPDF = async (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirections: ViewDirection[] = ['front'],
  filename?: string
): Promise<void> => {
  const blob = await generateVectorPDF(spaceInfo, placedModules, viewDirections);

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const dimensions = `${spaceInfo.width}W-${spaceInfo.height}H-${spaceInfo.depth}D`;
  const defaultFilename = `furniture-vector-${dimensions}-${timestamp}.pdf`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || defaultFilename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};
