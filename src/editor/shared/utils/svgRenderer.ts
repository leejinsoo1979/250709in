import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/store/core/furnitureStore';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';

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

interface ViewportBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 뷰 설정에 따라 SVG 렌더링
 */
export const renderViewToSVG = (config: ViewConfig, viewport: ViewportBox): string => {
  const { viewMode, view2DDirection, spaceInfo, placedModules } = config;
  
  if (viewMode === '3D') {
    // 3D 뷰는 SVG로 직접 렌더링이 어려우므로 2D 프로젝션 사용
    return render3DProjectionToSVG(config, viewport);
  }
  
  // 2D 뷰 렌더링
  switch (view2DDirection) {
    case 'front':
      return renderFrontViewToSVG(config, viewport);
    case 'top':
      return renderTopViewToSVG(config, viewport);
    case 'left':
      return renderLeftViewToSVG(config, viewport);
    case 'right':
      return renderRightViewToSVG(config, viewport);
    default:
      return renderFrontViewToSVG(config, viewport);
  }
};

/**
 * 정면도 SVG 렌더링
 */
const renderFrontViewToSVG = (config: ViewConfig, viewport: ViewportBox): string => {
  const { spaceInfo, placedModules, showDimensions, showGuides, renderMode } = config;
  
  // SVG 캔버스 설정
  let svg = `<svg width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // 배경
  svg += `<rect width="${viewport.width}" height="${viewport.height}" fill="white"/>`;
  
  // 스케일 계산
  const padding = 50;
  const availableWidth = viewport.width - (padding * 2);
  const availableHeight = viewport.height - (padding * 2);
  const scaleX = availableWidth / spaceInfo.width;
  const scaleY = availableHeight / spaceInfo.height;
  const scale = Math.min(scaleX, scaleY);
  
  // 중앙 정렬을 위한 오프셋
  const offsetX = (viewport.width - (spaceInfo.width * scale)) / 2;
  const offsetY = (viewport.height - (spaceInfo.height * scale)) / 2;
  
  // 그룹으로 변환 적용
  svg += `<g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">`;
  
  // 공간 외곽선
  svg += `<rect x="0" y="0" width="${spaceInfo.width}" height="${spaceInfo.height}" 
          fill="none" stroke="black" stroke-width="${2/scale}"/>`;
  
  // 가구 렌더링
  placedModules.forEach((module, index) => {
    const moduleData = getModuleById(module.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    if (!moduleData) return;
    
    // 가구 위치 계산 (mm 단위)
    const furnitureX = (spaceInfo.width / 2) + (module.position.x * 10) - (moduleData.dimensions.width / 2);
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'base_frame' ? (spaceInfo.baseConfig?.height || 100) : 0;
    const furnitureY = spaceInfo.height - moduleData.dimensions.height - baseFrameHeight;
    
    // 가구 외곽선
    const strokeColor = renderMode === 'wireframe' ? '#ff5500' : '#333333';
    const fillColor = renderMode === 'wireframe' ? 'none' : '#f8f8f8';
    const strokeWidth = renderMode === 'wireframe' ? 2/scale : 1.5/scale;
    const opacity = renderMode === 'wireframe' ? 0.8 : 1.0;
    
    svg += `<g opacity="${opacity}">`;
    
    // 가구 배경
    svg += `<rect x="${furnitureX}" y="${furnitureY}" 
            width="${moduleData.dimensions.width}" height="${moduleData.dimensions.height}"
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
    
    // 가구 내부 구조 그리기
    const modelConfig = moduleData.modelConfig;
    const shelfCount = modelConfig?.shelfCount || 0;
    const isDualFurniture = Math.abs(moduleData.dimensions.width - 800) < 50 || 
                           Math.abs(moduleData.dimensions.width - 1000) < 50;
    
    // 가구 내부 구조 표현
    if (shelfCount > 0) {
      // 선반이 있는 가구
      if (isDualFurniture) {
        // 듀얼 가구: 중앙 칸막이
        const centerX = furnitureX + (moduleData.dimensions.width / 2);
        svg += `<line x1="${centerX}" y1="${furnitureY}" x2="${centerX}" y2="${furnitureY + moduleData.dimensions.height}"
                stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
        
        // 양쪽 선반
        const shelvesPerSide = Math.floor(shelfCount / 2);
        for (let i = 1; i <= shelvesPerSide; i++) {
          const shelfY = furnitureY + (moduleData.dimensions.height / (shelvesPerSide + 1)) * i;
          // 왼쪽 선반
          svg += `<line x1="${furnitureX}" y1="${shelfY}" x2="${centerX}" y2="${shelfY}"
                  stroke="${strokeColor}" stroke-width="${strokeWidth * 0.7}"/>`;
          // 오른쪽 선반
          svg += `<line x1="${centerX}" y1="${shelfY}" x2="${furnitureX + moduleData.dimensions.width}" y2="${shelfY}"
                  stroke="${strokeColor}" stroke-width="${strokeWidth * 0.7}"/>`;
        }
      } else {
        // 싱글 가구: 선반
        for (let i = 1; i <= shelfCount; i++) {
          const shelfY = furnitureY + (moduleData.dimensions.height / (shelfCount + 1)) * i;
          svg += `<line x1="${furnitureX}" y1="${shelfY}" x2="${furnitureX + moduleData.dimensions.width}" y2="${shelfY}"
                  stroke="${strokeColor}" stroke-width="${strokeWidth * 0.7}"/>`;
        }
      }
    }
    
    // 도어가 있는 경우 도어 표현
    if (modelConfig?.furnitureType?.includes('door')) {
      const doorThickness = 18.5; // 도어 두께
      const doorGap = 3; // 도어 간격
      
      if (isDualFurniture) {
        // 듀얼 도어
        const doorWidth = (moduleData.dimensions.width - doorGap) / 2;
        // 왼쪽 도어
        svg += `<rect x="${furnitureX}" y="${furnitureY}" 
                width="${doorWidth}" height="${moduleData.dimensions.height}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
        // 오른쪽 도어
        svg += `<rect x="${furnitureX + doorWidth + doorGap}" y="${furnitureY}" 
                width="${doorWidth}" height="${moduleData.dimensions.height}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
        
        // 도어 핸들
        const handleY = furnitureY + moduleData.dimensions.height * 0.5;
        svg += `<circle cx="${furnitureX + doorWidth - 30}" cy="${handleY}" r="${10/scale}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}"/>`;
        svg += `<circle cx="${furnitureX + doorWidth + doorGap + 30}" cy="${handleY}" r="${10/scale}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}"/>`;
      } else {
        // 싱글 도어
        svg += `<rect x="${furnitureX}" y="${furnitureY}" 
                width="${moduleData.dimensions.width}" height="${moduleData.dimensions.height}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
        // 도어 핸들
        const handleY = furnitureY + moduleData.dimensions.height * 0.5;
        svg += `<circle cx="${furnitureX + 30}" cy="${handleY}" r="${10/scale}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}"/>`;
      }
    }
    
    // 서랍이 있는 경우
    if (modelConfig?.furnitureType?.includes('drawer')) {
      const drawerCount = modelConfig.drawerCount || 1;
      const drawerHeight = moduleData.dimensions.height / drawerCount;
      
      for (let i = 0; i < drawerCount; i++) {
        const drawerY = furnitureY + (drawerHeight * i);
        // 서랍 구분선
        if (i > 0) {
          svg += `<line x1="${furnitureX}" y1="${drawerY}" x2="${furnitureX + moduleData.dimensions.width}" y2="${drawerY}"
                  stroke="${strokeColor}" stroke-width="${strokeWidth * 0.7}"/>`;
        }
        // 서랍 손잡이
        const handleY = drawerY + drawerHeight / 2;
        const handleX1 = furnitureX + moduleData.dimensions.width * 0.3;
        const handleX2 = furnitureX + moduleData.dimensions.width * 0.7;
        svg += `<line x1="${handleX1}" y1="${handleY}" x2="${handleX2}" y2="${handleY}"
                stroke="${strokeColor}" stroke-width="${strokeWidth * 1.5}"/>`;
      }
    }
    
    svg += '</g>';
    
    // 가구 이름
    const textX = furnitureX + moduleData.dimensions.width / 2;
    const textY = furnitureY + moduleData.dimensions.height / 2;
    svg += `<text x="${textX}" y="${textY}" 
            text-anchor="middle" dominant-baseline="middle" 
            font-size="${Math.min(20/scale, moduleData.dimensions.height/10)}" 
            fill="#666" opacity="0.7">${moduleData.name}</text>`;
    
    // 치수 표시
    if (showDimensions) {
      // 너비 치수
      const dimY = furnitureY + moduleData.dimensions.height + 30/scale;
      svg += `<line x1="${furnitureX}" y1="${dimY}" x2="${furnitureX + moduleData.dimensions.width}" y2="${dimY}"
              stroke="#666" stroke-width="${0.5/scale}"/>`;
      svg += `<text x="${textX}" y="${dimY + 15/scale}" 
              text-anchor="middle" font-size="${12/scale}" fill="#666">
              ${moduleData.dimensions.width}mm</text>`;
    }
  });
  
  svg += '</g>';
  
  // 전체 치수 표시
  if (showDimensions) {
    // 좌측 높이 치수
    svg += `<line x1="${offsetX - 30}" y1="${offsetY}" x2="${offsetX - 30}" y2="${offsetY + spaceInfo.height * scale}"
            stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${offsetX - 40}" y="${offsetY + (spaceInfo.height * scale / 2)}" 
            text-anchor="middle" font-size="14" fill="#666" transform="rotate(-90, ${offsetX - 40}, ${offsetY + (spaceInfo.height * scale / 2)})">
            ${spaceInfo.height}mm</text>`;
    
    // 하단 너비 치수
    svg += `<line x1="${offsetX}" y1="${offsetY + spaceInfo.height * scale + 30}" 
            x2="${offsetX + spaceInfo.width * scale}" y2="${offsetY + spaceInfo.height * scale + 30}"
            stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${offsetX + (spaceInfo.width * scale / 2)}" y="${offsetY + spaceInfo.height * scale + 45}" 
            text-anchor="middle" font-size="14" fill="#666">
            ${spaceInfo.width}mm</text>`;
  }
  
  svg += '</svg>';
  return svg;
};

/**
 * 평면도 SVG 렌더링
 */
const renderTopViewToSVG = (config: ViewConfig, viewport: ViewportBox): string => {
  const { spaceInfo, placedModules, showDimensions, renderMode } = config;
  
  // SVG 캔버스 설정
  let svg = `<svg width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // 배경
  svg += `<rect width="${viewport.width}" height="${viewport.height}" fill="white"/>`;
  
  // 스케일 계산
  const padding = 50;
  const availableWidth = viewport.width - (padding * 2);
  const availableHeight = viewport.height - (padding * 2);
  const scaleX = availableWidth / spaceInfo.width;
  const scaleY = availableHeight / spaceInfo.depth;
  const scale = Math.min(scaleX, scaleY);
  
  // 중앙 정렬을 위한 오프셋
  const offsetX = (viewport.width - (spaceInfo.width * scale)) / 2;
  const offsetY = (viewport.height - (spaceInfo.depth * scale)) / 2;
  
  // 그룹으로 변환 적용
  svg += `<g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">`;
  
  // 공간 외곽선
  svg += `<rect x="0" y="0" width="${spaceInfo.width}" height="${spaceInfo.depth}" 
          fill="none" stroke="black" stroke-width="${2/scale}"/>`;
  
  // 가구 렌더링
  placedModules.forEach((module, index) => {
    const moduleData = getModuleById(module.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    if (!moduleData) return;
    
    // 가구 위치 계산 (mm 단위)
    const furnitureX = (spaceInfo.width / 2) + (module.position.x * 10) - (moduleData.dimensions.width / 2);
    const furnitureY = 20; // 앞면에서 20mm 떨어진 위치
    
    // 색상 설정
    const strokeColor = renderMode === 'wireframe' ? '#ff5500' : '#333333';
    const fillColor = renderMode === 'wireframe' ? 'none' : '#f8f8f8';
    const strokeWidth = renderMode === 'wireframe' ? 2/scale : 1.5/scale;
    const opacity = renderMode === 'wireframe' ? 0.8 : 1.0;
    
    svg += `<g opacity="${opacity}">`;
    
    // 가구 외곽선 (평면도에서는 width x depth)
    svg += `<rect x="${furnitureX}" y="${furnitureY}" 
            width="${moduleData.dimensions.width}" height="${moduleData.dimensions.depth}"
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
    
    // 가구 내부 구조 (평면도)
    const modelConfig = moduleData.modelConfig;
    const isDualFurniture = Math.abs(moduleData.dimensions.width - 800) < 50 || 
                           Math.abs(moduleData.dimensions.width - 1000) < 50;
    
    if (isDualFurniture) {
      // 듀얼 가구: 중앙 칸막이
      const centerX = furnitureX + (moduleData.dimensions.width / 2);
      svg += `<line x1="${centerX}" y1="${furnitureY}" x2="${centerX}" y2="${furnitureY + moduleData.dimensions.depth}"
              stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
    }
    
    // 도어가 있는 경우 도어 열림 방향 표시
    if (modelConfig?.furnitureType?.includes('door')) {
      const doorOpenRadius = Math.min(moduleData.dimensions.depth * 0.8, 200);
      
      if (isDualFurniture) {
        // 듀얼 도어 열림 표시
        const doorWidth = moduleData.dimensions.width / 2;
        const leftDoorX = furnitureX;
        const rightDoorX = furnitureX + doorWidth;
        
        // 왼쪽 도어 열림 호
        svg += `<path d="M ${leftDoorX} ${furnitureY + moduleData.dimensions.depth} 
                A ${doorOpenRadius} ${doorOpenRadius} 0 0 1 ${leftDoorX + doorOpenRadius} ${furnitureY + moduleData.dimensions.depth - doorOpenRadius}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-dasharray="5,5"/>`;
        
        // 오른쪽 도어 열림 호
        svg += `<path d="M ${rightDoorX + doorWidth} ${furnitureY + moduleData.dimensions.depth} 
                A ${doorOpenRadius} ${doorOpenRadius} 0 0 0 ${rightDoorX + doorWidth - doorOpenRadius} ${furnitureY + moduleData.dimensions.depth - doorOpenRadius}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-dasharray="5,5"/>`;
      } else {
        // 싱글 도어 열림 표시
        svg += `<path d="M ${furnitureX} ${furnitureY + moduleData.dimensions.depth} 
                A ${doorOpenRadius} ${doorOpenRadius} 0 0 1 ${furnitureX + doorOpenRadius} ${furnitureY + moduleData.dimensions.depth - doorOpenRadius}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-dasharray="5,5"/>`;
      }
    }
    
    svg += '</g>';
    
    // 가구 이름
    const textX = furnitureX + moduleData.dimensions.width / 2;
    const textY = furnitureY + moduleData.dimensions.depth / 2;
    svg += `<text x="${textX}" y="${textY}" 
            text-anchor="middle" dominant-baseline="middle" 
            font-size="${Math.min(16/scale, moduleData.dimensions.depth/5)}" 
            fill="#666" opacity="0.7">${moduleData.name}</text>`;
  });
  
  svg += '</g>';
  
  // 전체 치수 표시
  if (showDimensions) {
    // 좌측 깊이 치수
    svg += `<line x1="${offsetX - 30}" y1="${offsetY}" x2="${offsetX - 30}" y2="${offsetY + spaceInfo.depth * scale}"
            stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${offsetX - 40}" y="${offsetY + (spaceInfo.depth * scale / 2)}" 
            text-anchor="middle" font-size="14" fill="#666" transform="rotate(-90, ${offsetX - 40}, ${offsetY + (spaceInfo.depth * scale / 2)})">
            ${spaceInfo.depth}mm</text>`;
    
    // 하단 너비 치수
    svg += `<line x1="${offsetX}" y1="${offsetY + spaceInfo.depth * scale + 30}" 
            x2="${offsetX + spaceInfo.width * scale}" y2="${offsetY + spaceInfo.depth * scale + 30}"
            stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${offsetX + (spaceInfo.width * scale / 2)}" y="${offsetY + spaceInfo.depth * scale + 45}" 
            text-anchor="middle" font-size="14" fill="#666">
            ${spaceInfo.width}mm</text>`;
  }
  
  svg += '</svg>';
  return svg;
};

/**
 * 좌측면도 SVG 렌더링
 */
const renderLeftViewToSVG = (config: ViewConfig, viewport: ViewportBox): string => {
  const { spaceInfo, placedModules, showDimensions, renderMode } = config;
  
  // SVG 캔버스 설정
  let svg = `<svg width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // 배경
  svg += `<rect width="${viewport.width}" height="${viewport.height}" fill="white"/>`;
  
  // 스케일 계산
  const padding = 50;
  const availableWidth = viewport.width - (padding * 2);
  const availableHeight = viewport.height - (padding * 2);
  const scaleX = availableWidth / spaceInfo.depth;
  const scaleY = availableHeight / spaceInfo.height;
  const scale = Math.min(scaleX, scaleY);
  
  // 중앙 정렬을 위한 오프셋
  const offsetX = (viewport.width - (spaceInfo.depth * scale)) / 2;
  const offsetY = (viewport.height - (spaceInfo.height * scale)) / 2;
  
  // 그룹으로 변환 적용
  svg += `<g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">`;
  
  // 공간 외곽선
  svg += `<rect x="0" y="0" width="${spaceInfo.depth}" height="${spaceInfo.height}" 
          fill="none" stroke="black" stroke-width="${2/scale}"/>`;
  
  // 색상 설정
  const strokeColor = renderMode === 'wireframe' ? '#ff5500' : '#333333';
  const fillColor = renderMode === 'wireframe' ? 'none' : '#f8f8f8';
  const strokeWidth = renderMode === 'wireframe' ? 2/scale : 1.5/scale;
  const opacity = renderMode === 'wireframe' ? 0.8 : 1.0;
  
  // 좌측면에서 보이는 가구들을 그룹화 (좌측 끝 가구만 표시)
  if (placedModules.length > 0) {
    // 가장 왼쪽 가구 찾기
    const leftmostModule = placedModules.reduce((leftmost, current) => {
      if (!leftmost) return current;
      return current.position.x < leftmost.position.x ? current : leftmost;
    });
    
    const moduleData = getModuleById(leftmostModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    if (moduleData) {
      const baseFrameHeight = spaceInfo.baseConfig?.type === 'base_frame' ? (spaceInfo.baseConfig?.height || 100) : 0;
      const furnitureX = 20; // 앞면에서 20mm
      const furnitureY = spaceInfo.height - moduleData.dimensions.height - baseFrameHeight;
      const furnitureDepth = moduleData.dimensions.depth;
      const furnitureHeight = moduleData.dimensions.height;
      
      svg += `<g opacity="${opacity}">`;
      
      // 가구 외곽선
      svg += `<rect x="${furnitureX}" y="${furnitureY}" 
              width="${furnitureDepth}" height="${furnitureHeight}"
              fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
      
      // 가구 내부 구조 (측면)
      const modelConfig = moduleData.modelConfig;
      const shelfCount = modelConfig?.shelfCount || 0;
      
      if (shelfCount > 0) {
        // 선반 표시
        const actualShelfCount = Math.min(shelfCount, 7); // 최대 7개까지만 표시
        for (let i = 1; i <= actualShelfCount; i++) {
          const shelfY = furnitureY + (furnitureHeight / (actualShelfCount + 1)) * i;
          svg += `<line x1="${furnitureX}" y1="${shelfY}" x2="${furnitureX + furnitureDepth}" y2="${shelfY}"
                  stroke="${strokeColor}" stroke-width="${strokeWidth * 0.7}"/>`;
        }
      }
      
      svg += '</g>';
      
      // 가구 라벨
      const textX = furnitureX + furnitureDepth / 2;
      const textY = furnitureY + furnitureHeight / 2;
      svg += `<text x="${textX}" y="${textY}" 
              text-anchor="middle" dominant-baseline="middle" 
              font-size="${Math.min(16/scale, furnitureHeight/10)}" 
              fill="#666" opacity="0.7">Left Side View</text>`;
    }
  }
  
  svg += '</g>';
  
  // 전체 치수 표시
  if (showDimensions) {
    // 좌측 높이 치수
    svg += `<line x1="${offsetX - 30}" y1="${offsetY}" x2="${offsetX - 30}" y2="${offsetY + spaceInfo.height * scale}"
            stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${offsetX - 40}" y="${offsetY + (spaceInfo.height * scale / 2)}" 
            text-anchor="middle" font-size="14" fill="#666" transform="rotate(-90, ${offsetX - 40}, ${offsetY + (spaceInfo.height * scale / 2)})">
            ${spaceInfo.height}mm</text>`;
    
    // 하단 깊이 치수
    svg += `<line x1="${offsetX}" y1="${offsetY + spaceInfo.height * scale + 30}" 
            x2="${offsetX + spaceInfo.depth * scale}" y2="${offsetY + spaceInfo.height * scale + 30}"
            stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${offsetX + (spaceInfo.depth * scale / 2)}" y="${offsetY + spaceInfo.height * scale + 45}" 
            text-anchor="middle" font-size="14" fill="#666">
            ${spaceInfo.depth}mm</text>`;
  }
  
  svg += '</svg>';
  return svg;
};

/**
 * 우측면도 SVG 렌더링
 */
const renderRightViewToSVG = (config: ViewConfig, viewport: ViewportBox): string => {
  // 좌측면도와 유사하게 구현
  return renderLeftViewToSVG(config, viewport);
};

/**
 * 3D 프로젝션 SVG 렌더링 (아이소메트릭 뷰)
 */
const render3DProjectionToSVG = (config: ViewConfig, viewport: ViewportBox): string => {
  const { spaceInfo, placedModules, renderMode } = config;
  
  // 아이소메트릭 변환 각도
  const angleX = 30 * Math.PI / 180;
  const angleY = 45 * Math.PI / 180;
  
  // SVG 캔버스 설정
  let svg = `<svg width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // 배경
  svg += `<rect width="${viewport.width}" height="${viewport.height}" fill="white"/>`;
  
  // 아이소메트릭 변환 함수
  const transform3D = (x: number, y: number, z: number) => {
    const screenX = (x - z) * Math.cos(angleY);
    const screenY = y + (x + z) * Math.sin(angleY) * Math.sin(angleX);
    return { x: screenX, y: screenY };
  };
  
  // 스케일 계산
  const scale = Math.min(viewport.width, viewport.height) / (Math.max(spaceInfo.width, spaceInfo.height, spaceInfo.depth) * 2);
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  
  // 색상 설정
  const strokeColor = renderMode === 'wireframe' ? '#ff5500' : '#333333';
  const strokeWidth = renderMode === 'wireframe' ? 2 : 1;
  
  // 공간 박스 그리기
  const drawBox = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, isSpace: boolean = false) => {
    // 8개의 꼭짓점
    const vertices = [
      transform3D(x, y, z),
      transform3D(x + w, y, z),
      transform3D(x + w, y, z + d),
      transform3D(x, y, z + d),
      transform3D(x, y + h, z),
      transform3D(x + w, y + h, z),
      transform3D(x + w, y + h, z + d),
      transform3D(x, y + h, z + d),
    ];
    
    // 면 그리기 (뒤쪽 면부터 그려서 깊이감 표현)
    const faces = [
      { indices: [0, 3, 7, 4], brightness: 0.6 }, // 좌측면
      { indices: [0, 1, 2, 3], brightness: 0.8 }, // 하단면
      { indices: [2, 3, 7, 6], brightness: 0.5 }, // 후면
      { indices: [4, 5, 6, 7], brightness: 0.9 }, // 상단면
      { indices: [1, 2, 6, 5], brightness: 0.7 }, // 우측면
      { indices: [0, 1, 5, 4], brightness: 1.0 }, // 정면
    ];
    
    faces.forEach((face) => {
      const points = face.indices.map(i => 
        `${centerX + vertices[i].x * scale},${centerY - vertices[i].y * scale}`
      ).join(' ');
      
      let fillColor = 'none';
      let fillOpacity = 0;
      
      if (renderMode !== 'wireframe') {
        if (isSpace) {
          // 공간은 더 투명하게
          fillColor = '#f8f8f8';
          fillOpacity = 0.3 * face.brightness;
        } else {
          // 가구는 색상 적용
          const rgb = parseInt(color.slice(1), 16);
          const r = Math.floor(((rgb >> 16) & 255) * face.brightness);
          const g = Math.floor(((rgb >> 8) & 255) * face.brightness);
          const b = Math.floor((rgb & 255) * face.brightness);
          fillColor = `rgb(${r},${g},${b})`;
          fillOpacity = 0.9;
        }
      }
      
      svg += `<polygon points="${points}" 
              fill="${fillColor}" fill-opacity="${fillOpacity}"
              stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
    });
  };
  
  // 공간 박스 (더 투명하게)
  drawBox(0, 0, 0, spaceInfo.width, spaceInfo.height, spaceInfo.depth, '#f0f0f0', true);
  
  // 가구 박스들
  placedModules.forEach((module, index) => {
    const moduleData = getModuleById(module.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    if (!moduleData) return;
    
    const x = (spaceInfo.width / 2) + (module.position.x * 10) - (moduleData.dimensions.width / 2);
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'base_frame' ? (spaceInfo.baseConfig?.height || 100) : 0;
    const y = baseFrameHeight;
    const z = 20;
    
    // 가구별로 다른 색상 적용
    const colors = ['#4A90E2', '#7ED321', '#F5A623', '#D0021B', '#9013FE', '#50E3C2'];
    const furnitureColor = colors[index % colors.length];
    
    drawBox(x, y, z, moduleData.dimensions.width, moduleData.dimensions.height, moduleData.dimensions.depth, furnitureColor);
    
    // 가구 라벨 (3D 위치에)
    const labelPos = transform3D(
      x + moduleData.dimensions.width / 2,
      y + moduleData.dimensions.height,
      z + moduleData.dimensions.depth / 2
    );
    
    svg += `<text x="${centerX + labelPos.x * scale}" y="${centerY - labelPos.y * scale - 10}" 
            text-anchor="middle" font-size="12" fill="#333" font-weight="bold">
            ${moduleData.name}</text>`;
  });
  
  svg += '</svg>';
  return svg;
};

/**
 * SVG를 이미지 데이터 URL로 변환
 */
export const svgToDataURL = (svg: string): string => {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  return url;
};

/**
 * SVG를 Canvas에 렌더링하여 래스터 이미지로 변환
 */
export const svgToCanvas = async (svg: string, width: number, height: number): Promise<HTMLCanvasElement> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load SVG image'));
    };
    
    img.src = svgToDataURL(svg);
  });
};