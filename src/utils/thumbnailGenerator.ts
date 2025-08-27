/**
 * 프로젝트 썸네일 생성 유틸리티
 * HTML5 Canvas를 사용하여 2D 썸네일 이미지 생성
 */

import { ProjectSummary } from '../firebase/types';

/**
 * 프로젝트의 가구 배치를 기반으로 썸네일 생성
 */
export async function generateProjectThumbnail(project: ProjectSummary): Promise<string | null> {
  try {
    // Canvas 요소 생성
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Canvas 컨텍스트를 생성할 수 없습니다');
      return null;
    }

    // 썸네일 크기 설정
    const thumbnailSize = 400;
    canvas.width = thumbnailSize;
    canvas.height = thumbnailSize;

    // 배경 그리기
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, thumbnailSize, thumbnailSize);

    // 공간 정보가 있는 경우
    if (project.spaceInfo || project.spaceSize) {
      const spaceWidth = project.spaceInfo?.width || project.spaceSize?.width || 4000;
      const spaceDepth = project.spaceInfo?.depth || project.spaceSize?.depth || 3000;
      const spaceHeight = project.spaceInfo?.height || project.spaceSize?.height || 2400;

      // 스케일 계산 (패딩 포함)
      const padding = 40;
      const availableSize = thumbnailSize - (padding * 2);
      const scale = Math.min(availableSize / spaceWidth, availableSize / spaceDepth);

      // 공간 바닥 그리기
      const floorWidth = spaceWidth * scale;
      const floorDepth = spaceDepth * scale;
      const floorX = (thumbnailSize - floorWidth) / 2;
      const floorY = (thumbnailSize - floorDepth) / 2;

      // 바닥 그리기
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(floorX, floorY, floorWidth, floorDepth);

      // 그리드 라인 그리기
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 0.5;
      
      // 가로 라인
      const gridSpacing = 500 * scale;
      for (let y = floorY; y <= floorY + floorDepth; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(floorX, y);
        ctx.lineTo(floorX + floorWidth, y);
        ctx.stroke();
      }
      
      // 세로 라인
      for (let x = floorX; x <= floorX + floorWidth; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, floorY);
        ctx.lineTo(x, floorY + floorDepth);
        ctx.stroke();
      }

      // 벽 그리기 (선택적)
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 2;
      ctx.strokeRect(floorX, floorY, floorWidth, floorDepth);

      // 가구 그리기
      if (project.placedModules && project.placedModules.length > 0) {
        console.log(`🪑 ${project.placedModules.length}개의 가구를 썸네일에 렌더링합니다`);

        project.placedModules.forEach((module: any) => {
          try {
            const moduleX = (module.position?.x || 0) * scale + floorX;
            const moduleZ = (module.position?.z || 0) * scale + floorY;
            const moduleWidth = (module.width || 600) * scale;
            const moduleDepth = (module.depth || 600) * scale;

            // 가구 그림자
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(moduleX + 2, moduleZ + 2, moduleWidth, moduleDepth);

            // 가구 본체
            const furnitureColor = getFurnitureColor(module.type || module.moduleType);
            ctx.fillStyle = furnitureColor;
            ctx.fillRect(moduleX, moduleZ, moduleWidth, moduleDepth);

            // 가구 테두리
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(moduleX, moduleZ, moduleWidth, moduleDepth);

            // 가구 하이라이트 (3D 효과)
            const gradient = ctx.createLinearGradient(moduleX, moduleZ, moduleX, moduleZ + moduleDepth);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(moduleX, moduleZ, moduleWidth, moduleDepth * 0.3);
          } catch (error) {
            console.error('가구 렌더링 오류:', error, module);
          }
        });
      } else {
        // 가구가 없는 경우 빈 공간 표시
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('빈 공간', thumbnailSize / 2, thumbnailSize / 2);
      }

      // 프로젝트 정보 표시 (선택적)
      if (project.furnitureCount && project.furnitureCount > 0) {
        // 배지 배경
        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        const badgeWidth = 60;
        const badgeHeight = 24;
        const badgeX = thumbnailSize - badgeWidth - 10;
        const badgeY = 10;
        
        // 둥근 모서리 배지
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 12);
        ctx.fill();

        // 배지 텍스트
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${project.furnitureCount}개`, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
      }
    } else {
      // 공간 정보가 없는 경우 기본 썸네일
      ctx.fillStyle = '#10b981';
      ctx.fillRect(0, 0, thumbnailSize, thumbnailSize);
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('디자인', thumbnailSize / 2, thumbnailSize / 2);
    }

    // Canvas를 Data URL로 변환
    const dataUrl = canvas.toDataURL('image/png', 0.8);
    console.log('✅ 썸네일 생성 완료:', { 
      width: canvas.width, 
      height: canvas.height, 
      furnitureCount: project.placedModules?.length || 0 
    });
    
    return dataUrl;
  } catch (error) {
    console.error('썸네일 생성 오류:', error);
    return null;
  }
}

/**
 * 가구 타입에 따른 색상 반환
 */
function getFurnitureColor(type: string): string {
  const colorMap: Record<string, string> = {
    'wardrobe': '#8b5cf6',      // 보라색 - 옷장
    'shelf': '#3b82f6',          // 파란색 - 선반
    'drawer': '#f59e0b',         // 주황색 - 서랍
    'desk': '#84cc16',           // 연두색 - 책상
    'chair': '#ec4899',          // 분홍색 - 의자
    'bed': '#06b6d4',            // 청록색 - 침대
    'sofa': '#f97316',           // 오렌지색 - 소파
    'table': '#6366f1',          // 남색 - 테이블
    'cabinet': '#10b981',        // 초록색 - 캐비닛
    'bookshelf': '#0891b2',      // 하늘색 - 책장
    'storage': '#7c3aed',        // 진보라 - 수납장
    'closet': '#dc2626',         // 빨간색 - 옷장
    'dresser': '#ca8a04',        // 갈색 - 화장대
    'mirror': '#0284c7',         // 진한 하늘색 - 거울
    'default': '#6b7280'         // 회색 - 기본
  };

  const typeKey = type?.toLowerCase() || 'default';
  
  // 타입에서 키워드 찾기
  for (const [key, color] of Object.entries(colorMap)) {
    if (typeKey.includes(key)) {
      return color;
    }
  }

  return colorMap.default;
}

/**
 * Canvas의 roundRect polyfill (일부 브라우저에서 지원하지 않을 수 있음)
 */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x: number, y: number, width: number, height: number, radius: number) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    this.beginPath();
    this.moveTo(x + radius, y);
    this.arcTo(x + width, y, x + width, y + height, radius);
    this.arcTo(x + width, y + height, x, y + height, radius);
    this.arcTo(x, y + height, x, y, radius);
    this.arcTo(x, y, x + width, y, radius);
    this.closePath();
  };
}