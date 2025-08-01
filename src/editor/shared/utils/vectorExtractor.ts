import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/store/core/furnitureStore';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';
import { calculateSpaceIndexing } from './indexing';

interface ViewConfig {
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'top' | 'left' | 'right';
  renderMode: 'solid' | 'wireframe';
  showDimensions: boolean;
  showGuides: boolean;
  showAxis: boolean;
  showAll: boolean;
  spaceInfo: SpaceInfo;
  placedModules: PlacedModule[];
}

interface ExtractedLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
  color: string;
  width: number;
  isDashed?: boolean;
  dashArray?: string;
}

interface ExtractedText {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation?: number;
  anchor?: 'start' | 'middle' | 'end';
}

interface ExtractedGeometry {
  lines: ExtractedLine[];
  texts: ExtractedText[];
  viewBox: { x: number; y: number; width: number; height: number };
}

/**
 * Three.js 씬에서 벡터 데이터 추출
 */
export const extractVectorFromThreeScene = (
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number
): ExtractedGeometry => {
  const lines: ExtractedLine[] = [];
  const texts: ExtractedText[] = [];
  
  // 프로젝션 매트릭스 계산
  const projectionMatrix = new THREE.Matrix4();
  projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  
  // 3D 좌표를 2D 스크린 좌표로 변환하는 함수
  const projectToScreen = (point: THREE.Vector3): { x: number; y: number } => {
    const vector = point.clone();
    vector.applyMatrix4(projectionMatrix);
    
    // NDC to screen coordinates
    const x = (vector.x * 0.5 + 0.5) * width;
    const y = (1 - (vector.y * 0.5 + 0.5)) * height;
    
    return { x, y };
  };
  
  // 씬을 순회하며 기하 정보 추출
  scene.traverse((object) => {
    if (object instanceof THREE.Line) {
      // Line 객체 처리
      const geometry = object.geometry;
      const material = object.material as THREE.LineBasicMaterial;
      
      if (geometry instanceof THREE.BufferGeometry) {
        const positions = geometry.getAttribute('position');
        if (positions) {
          const points: THREE.Vector3[] = [];
          for (let i = 0; i < positions.count; i++) {
            const point = new THREE.Vector3();
            point.fromBufferAttribute(positions, i);
            point.applyMatrix4(object.matrixWorld);
            points.push(point);
          }
          
          // 연속된 점들을 선분으로 변환
          for (let i = 0; i < points.length - 1; i++) {
            const start = projectToScreen(points[i]);
            const end = projectToScreen(points[i + 1]);
            
            lines.push({
              start,
              end,
              color: `#${material.color.getHexString()}`,
              width: material.linewidth || 1,
              isDashed: material.dashed || false,
              dashArray: material.dashed ? '5,5' : undefined
            });
          }
        }
      }
    } else if (object instanceof THREE.Mesh) {
      // Mesh 객체의 엣지 추출
      const geometry = object.geometry;
      
      if (geometry instanceof THREE.BoxGeometry) {
        // 박스 지오메트리의 엣지 추출
        const edges = new THREE.EdgesGeometry(geometry);
        const positions = edges.getAttribute('position');
        
        if (positions) {
          for (let i = 0; i < positions.count; i += 2) {
            const start = new THREE.Vector3();
            const end = new THREE.Vector3();
            
            start.fromBufferAttribute(positions, i);
            end.fromBufferAttribute(positions, i + 1);
            
            start.applyMatrix4(object.matrixWorld);
            end.applyMatrix4(object.matrixWorld);
            
            const screenStart = projectToScreen(start);
            const screenEnd = projectToScreen(end);
            
            lines.push({
              start: screenStart,
              end: screenEnd,
              color: '#000000',
              width: 1
            });
          }
        }
      }
    }
  });
  
  return {
    lines,
    texts,
    viewBox: { x: 0, y: 0, width, height }
  };
};

/**
 * 뷰 설정에 따른 2D 벡터 데이터 생성
 */
export const generateVectorDataFromConfig = (config: ViewConfig, width: number, height: number): ExtractedGeometry => {
  const { spaceInfo, placedModules, view2DDirection, showDimensions, renderMode } = config;
  const lines: ExtractedLine[] = [];
  const texts: ExtractedText[] = [];
  
  // 스케일 계산
  const padding = 100;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  
  let scaleX: number, scaleY: number;
  let spaceWidth: number, spaceHeight: number;
  
  switch (view2DDirection) {
    case 'top':
      spaceWidth = spaceInfo.width;
      spaceHeight = spaceInfo.depth;
      break;
    case 'left':
    case 'right':
      spaceWidth = spaceInfo.depth;
      spaceHeight = spaceInfo.height;
      break;
    default: // front
      spaceWidth = spaceInfo.width;
      spaceHeight = spaceInfo.height;
      break;
  }
  
  scaleX = availableWidth / spaceWidth;
  scaleY = availableHeight / spaceHeight;
  const scale = Math.min(scaleX, scaleY);
  
  const offsetX = (width - spaceWidth * scale) / 2;
  const offsetY = (height - spaceHeight * scale) / 2;
  
  // 좌표 변환 함수
  const transform = (x: number, y: number): { x: number; y: number } => ({
    x: offsetX + x * scale,
    y: offsetY + y * scale
  });
  
  // 공간 외곽선
  const spaceOutline = [
    { start: transform(0, 0), end: transform(spaceWidth, 0) },
    { start: transform(spaceWidth, 0), end: transform(spaceWidth, spaceHeight) },
    { start: transform(spaceWidth, spaceHeight), end: transform(0, spaceHeight) },
    { start: transform(0, spaceHeight), end: transform(0, 0) }
  ];
  
  spaceOutline.forEach(line => {
    lines.push({
      ...line,
      color: '#000000',
      width: 2
    });
  });
  
  // 가구 렌더링
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  
  placedModules.forEach((module) => {
    const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
    if (!moduleData) return;
    
    // 가구 위치와 크기 계산
    let furnitureX: number, furnitureY: number, furnitureWidth: number, furnitureHeight: number;
    
    switch (view2DDirection) {
      case 'top':
        furnitureX = (spaceInfo.width / 2) + (module.position.x * 10) - (moduleData.dimensions.width / 2);
        furnitureY = 20; // 앞면에서 20mm
        furnitureWidth = module.adjustedWidth || moduleData.dimensions.width;
        furnitureHeight = module.customDepth || moduleData.dimensions.depth;
        break;
      case 'left':
      case 'right':
        furnitureX = 20; // 앞면에서 20mm
        furnitureY = spaceInfo.height - moduleData.dimensions.height - 
                    (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0);
        furnitureWidth = module.customDepth || moduleData.dimensions.depth;
        furnitureHeight = moduleData.dimensions.height;
        break;
      default: // front
        furnitureX = (spaceInfo.width / 2) + (module.position.x * 10) - ((module.adjustedWidth || moduleData.dimensions.width) / 2);
        furnitureY = spaceInfo.height - moduleData.dimensions.height - 
                    (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0);
        furnitureWidth = module.adjustedWidth || moduleData.dimensions.width;
        furnitureHeight = moduleData.dimensions.height;
        break;
    }
    
    // 가구 외곽선
    const furnitureOutline = [
      { start: transform(furnitureX, furnitureY), end: transform(furnitureX + furnitureWidth, furnitureY) },
      { start: transform(furnitureX + furnitureWidth, furnitureY), end: transform(furnitureX + furnitureWidth, furnitureY + furnitureHeight) },
      { start: transform(furnitureX + furnitureWidth, furnitureY + furnitureHeight), end: transform(furnitureX, furnitureY + furnitureHeight) },
      { start: transform(furnitureX, furnitureY + furnitureHeight), end: transform(furnitureX, furnitureY) }
    ];
    
    furnitureOutline.forEach(line => {
      lines.push({
        ...line,
        color: renderMode === 'wireframe' ? '#ff5500' : '#000000',
        width: renderMode === 'wireframe' ? 2 : 1
      });
    });
    
    // 가구 내부 구조
    if (view2DDirection === 'front') {
      renderFurnitureInternals(
        lines,
        transform,
        furnitureX,
        furnitureY,
        furnitureWidth,
        furnitureHeight,
        moduleData,
        renderMode
      );
    }
    
    // 가구 이름
    const centerX = furnitureX + furnitureWidth / 2;
    const centerY = furnitureY + furnitureHeight / 2;
    const transformed = transform(centerX, centerY);
    
    texts.push({
      x: transformed.x,
      y: transformed.y,
      text: moduleData.name,
      fontSize: Math.min(14, furnitureHeight * scale / 10),
      color: '#666666',
      anchor: 'middle'
    });
  });
  
  // 치수선 추가
  if (showDimensions) {
    addDimensionLines(lines, texts, transform, spaceWidth, spaceHeight, spaceInfo, view2DDirection, scale);
  }
  
  return {
    lines,
    texts,
    viewBox: { x: 0, y: 0, width, height }
  };
};

/**
 * 가구 내부 구조 렌더링
 */
function renderFurnitureInternals(
  lines: ExtractedLine[],
  transform: (x: number, y: number) => { x: number; y: number },
  x: number,
  y: number,
  width: number,
  height: number,
  moduleData: any,
  renderMode: string
): void {
  const modelConfig = moduleData.modelConfig;
  if (!modelConfig) return;
  
  const isDual = moduleData.id.includes('dual-');
  const shelfCount = modelConfig.shelfCount || 0;
  const strokeColor = renderMode === 'wireframe' ? '#ff5500' : '#000000';
  
  // 듀얼 가구인 경우 중앙 칸막이
  if (isDual) {
    const centerX = x + width / 2;
    const start = transform(centerX, y);
    const end = transform(centerX, y + height);
    
    lines.push({
      start,
      end,
      color: strokeColor,
      width: 1
    });
  }
  
  // 선반 렌더링
  if (shelfCount > 0 && modelConfig.sections) {
    let currentY = y;
    
    modelConfig.sections.forEach((section: any) => {
      const sectionHeight = (section.height / moduleData.dimensions.height) * height;
      
      if (section.type === 'shelf') {
        const shelfY = currentY + sectionHeight;
        
        if (isDual) {
          // 듀얼: 좌우 분리된 선반
          const centerX = x + width / 2;
          
          // 왼쪽 선반
          lines.push({
            start: transform(x, shelfY),
            end: transform(centerX, shelfY),
            color: strokeColor,
            width: 0.5
          });
          
          // 오른쪽 선반
          lines.push({
            start: transform(centerX, shelfY),
            end: transform(x + width, shelfY),
            color: strokeColor,
            width: 0.5
          });
        } else {
          // 싱글: 전체 너비 선반
          lines.push({
            start: transform(x, shelfY),
            end: transform(x + width, shelfY),
            color: strokeColor,
            width: 0.5
          });
        }
      } else if (section.type === 'drawer' && section.drawerCount) {
        // 서랍 렌더링
        const drawerCount = section.drawerCount;
        const drawerHeight = sectionHeight / drawerCount;
        
        for (let i = 0; i < drawerCount; i++) {
          const drawerY = currentY + i * drawerHeight;
          
          // 서랍 구분선
          if (i > 0) {
            lines.push({
              start: transform(x, drawerY),
              end: transform(x + width, drawerY),
              color: strokeColor,
              width: 0.5
            });
          }
          
          // 서랍 손잡이
          const handleY = drawerY + drawerHeight / 2;
          const handleWidth = width * 0.3;
          const handleX1 = x + (width - handleWidth) / 2;
          const handleX2 = handleX1 + handleWidth;
          
          lines.push({
            start: transform(handleX1, handleY),
            end: transform(handleX2, handleY),
            color: '#666666',
            width: 2
          });
        }
      }
      
      currentY += sectionHeight;
    });
  }
}

/**
 * 치수선 추가
 */
function addDimensionLines(
  lines: ExtractedLine[],
  texts: ExtractedText[],
  transform: (x: number, y: number) => { x: number; y: number },
  spaceWidth: number,
  spaceHeight: number,
  spaceInfo: SpaceInfo,
  view2DDirection: string | undefined,
  scale: number
): void {
  const dimColor = '#ff0000';
  const dimLineWidth = 1;
  const dimTextSize = 12;
  
  // 수평 치수선 (너비 또는 깊이)
  const hDimY = spaceHeight + 50;
  const hDimStart = transform(0, hDimY);
  const hDimEnd = transform(spaceWidth, hDimY);
  
  lines.push({
    start: hDimStart,
    end: hDimEnd,
    color: dimColor,
    width: dimLineWidth
  });
  
  // 화살표
  const arrowSize = 10;
  lines.push(
    // 왼쪽 화살표
    {
      start: hDimStart,
      end: { x: hDimStart.x + arrowSize, y: hDimStart.y - arrowSize/2 },
      color: dimColor,
      width: dimLineWidth
    },
    {
      start: hDimStart,
      end: { x: hDimStart.x + arrowSize, y: hDimStart.y + arrowSize/2 },
      color: dimColor,
      width: dimLineWidth
    },
    // 오른쪽 화살표
    {
      start: hDimEnd,
      end: { x: hDimEnd.x - arrowSize, y: hDimEnd.y - arrowSize/2 },
      color: dimColor,
      width: dimLineWidth
    },
    {
      start: hDimEnd,
      end: { x: hDimEnd.x - arrowSize, y: hDimEnd.y + arrowSize/2 },
      color: dimColor,
      width: dimLineWidth
    }
  );
  
  // 치수 텍스트
  const hDimValue = view2DDirection === 'top' ? spaceInfo.width : 
                    (view2DDirection === 'left' || view2DDirection === 'right') ? spaceInfo.depth : 
                    spaceInfo.width;
  
  texts.push({
    x: (hDimStart.x + hDimEnd.x) / 2,
    y: hDimStart.y + 20,
    text: `${hDimValue}mm`,
    fontSize: dimTextSize,
    color: dimColor,
    anchor: 'middle'
  });
  
  // 수직 치수선 (높이 또는 깊이)
  const vDimX = -50;
  const vDimStart = transform(vDimX, 0);
  const vDimEnd = transform(vDimX, spaceHeight);
  
  lines.push({
    start: vDimStart,
    end: vDimEnd,
    color: dimColor,
    width: dimLineWidth
  });
  
  // 화살표
  lines.push(
    // 상단 화살표
    {
      start: vDimStart,
      end: { x: vDimStart.x - arrowSize/2, y: vDimStart.y + arrowSize },
      color: dimColor,
      width: dimLineWidth
    },
    {
      start: vDimStart,
      end: { x: vDimStart.x + arrowSize/2, y: vDimStart.y + arrowSize },
      color: dimColor,
      width: dimLineWidth
    },
    // 하단 화살표
    {
      start: vDimEnd,
      end: { x: vDimEnd.x - arrowSize/2, y: vDimEnd.y - arrowSize },
      color: dimColor,
      width: dimLineWidth
    },
    {
      start: vDimEnd,
      end: { x: vDimEnd.x + arrowSize/2, y: vDimEnd.y - arrowSize },
      color: dimColor,
      width: dimLineWidth
    }
  );
  
  // 치수 텍스트 (90도 회전)
  const vDimValue = view2DDirection === 'top' ? spaceInfo.depth : 
                    (view2DDirection === 'left' || view2DDirection === 'right') ? spaceInfo.height : 
                    spaceInfo.height;
  
  texts.push({
    x: vDimStart.x - 20,
    y: (vDimStart.y + vDimEnd.y) / 2,
    text: `${vDimValue}mm`,
    fontSize: dimTextSize,
    color: dimColor,
    anchor: 'middle',
    rotation: -90
  });
}

/**
 * 추출된 벡터 데이터를 SVG로 변환
 */
export const convertToSVG = (geometry: ExtractedGeometry): string => {
  const { lines, texts, viewBox } = geometry;
  
  let svg = `<svg width="${viewBox.width}" height="${viewBox.height}" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // 배경
  svg += `<rect width="${viewBox.width}" height="${viewBox.height}" fill="white"/>`;
  
  // 선 그리기
  lines.forEach(line => {
    svg += `<line x1="${line.start.x}" y1="${line.start.y}" x2="${line.end.x}" y2="${line.end.y}" 
            stroke="${line.color}" stroke-width="${line.width}"`;
    
    if (line.isDashed && line.dashArray) {
      svg += ` stroke-dasharray="${line.dashArray}"`;
    }
    
    svg += '/>';
  });
  
  // 텍스트 그리기
  texts.forEach(text => {
    let transform = '';
    if (text.rotation) {
      transform = ` transform="rotate(${text.rotation} ${text.x} ${text.y})"`;
    }
    
    svg += `<text x="${text.x}" y="${text.y}" 
            text-anchor="${text.anchor || 'start'}" 
            font-size="${text.fontSize}" 
            fill="${text.color}"
            font-family="Arial, sans-serif"${transform}>${text.text}</text>`;
  });
  
  svg += '</svg>';
  
  return svg;
};