/**
 * 프로젝트 썸네일 생성 유틸리티
 * HTML5 Canvas를 사용하여 2D 썸네일 이미지 생성
 */

import { ProjectSummary } from '../firebase/types';

/**
 * CSS 변수에서 테마 색상 읽기
 */
const getThemeColor = (): string => {
  const root = document.documentElement;
  const color = getComputedStyle(root).getPropertyValue('--theme-primary').trim();
  return color || '#10b981';
};

/**
 * 테마 색상 그라데이션 배경 + 흰색 텍스트로 빈 디자인 썸네일 그리기
 */
const drawEmptyDesignThumbnail = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sizeText?: string,
): void => {
  const themeColor = getThemeColor();

  // 테마 색상 그라데이션 배경
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, themeColor);
  gradient.addColorStop(1, adjustBrightness(themeColor, -30));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const fontMain = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.textAlign = 'center';

  if (sizeText) {
    // 공간 크기 (흰색 볼드)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = `700 ${Math.round(width * 0.045)}px ${fontMain}`;
    ctx.fillText(sizeText, width / 2, height / 2 - Math.round(height * 0.04));

    // 안내 텍스트 (흰색 라이트)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = `400 ${Math.round(width * 0.033)}px ${fontMain}`;
    ctx.fillText('현재 배치된 가구가 없습니다.', width / 2, height / 2 + Math.round(height * 0.05));
  } else {
    // 공간 정보 없을 때
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = `700 ${Math.round(width * 0.06)}px ${fontMain}`;
    ctx.fillText('디자인', width / 2, height / 2 + Math.round(height * 0.02));
  }
};

/**
 * 색상 밝기 조절 헬퍼 (hex → 어둡게/밝게)
 */
const adjustBrightness = (hex: string, amount: number): string => {
  let color = hex.replace('#', '');
  if (color.length === 3) {
    color = color.split('').map(c => c + c).join('');
  }
  const num = parseInt(color, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

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

    // 배경 그리기 (세련된 그라데이션)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, thumbnailSize);
    bgGradient.addColorStop(0, '#ffffff');
    bgGradient.addColorStop(1, '#f8fafc');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, thumbnailSize, thumbnailSize);

    // 공간 정보가 있는 경우
    if (project.spaceInfo || project.spaceSize) {
      const spaceWidth = project.spaceInfo?.width || project.spaceSize?.width || 4000;
      const spaceDepth = project.spaceInfo?.depth || project.spaceSize?.depth || 3000;
      const spaceHeight = project.spaceInfo?.height || project.spaceSize?.height || 2400;

      // 스케일 계산 (패딩 포함)
      const padding = 60;
      const availableSize = thumbnailSize - (padding * 2);
      const scale = Math.min(availableSize / spaceWidth, availableSize / spaceDepth);

      // 공간 바닥 그리기
      const floorWidth = spaceWidth * scale;
      const floorDepth = spaceDepth * scale;
      const floorX = (thumbnailSize - floorWidth) / 2;
      const floorY = (thumbnailSize - floorDepth) / 2;

      // 바닥 그리기 (연한 그림자 효과와 함께)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.03)';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(floorX, floorY, floorWidth, floorDepth);
      ctx.shadowBlur = 0;

      // 외곽선
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(floorX, floorY, floorWidth, floorDepth);

      // 그리드 라인 (더 은은하게)
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 0.5;

      const gridSpacing = 500 * scale;
      for (let y = floorY + gridSpacing; y < floorY + floorDepth; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(floorX, y);
        ctx.lineTo(floorX + floorWidth, y);
        ctx.stroke();
      }
      for (let x = floorX + gridSpacing; x < floorX + floorWidth; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, floorY);
        ctx.lineTo(x, floorY + floorDepth);
        ctx.stroke();
      }

      // 텍스트 스타일링 (Inter 또는 시스템 폰트)
      const fontMain = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

      // 상단 치수 정보
      ctx.fillStyle = '#1e293b';
      ctx.font = `600 16px ${fontMain}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(spaceWidth)} × ${Math.round(spaceHeight)} × ${Math.round(spaceDepth)}mm`, thumbnailSize / 2, floorY - 25);

      // 가구가 없으면 썸네일 생성하지 않음 (ThumbnailImage에서 아이콘 표시)
      if (!project.placedModules || project.placedModules.length === 0) {
        return null;
      }

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
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(moduleX + 1, moduleZ + 1, moduleWidth, moduleDepth);

            // 가구 본체
            const furnitureColor = getFurnitureColor(module.type || module.moduleType);
            ctx.fillStyle = furnitureColor;
            ctx.fillRect(moduleX, moduleZ, moduleWidth, moduleDepth);

            // 가구 테두리
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(moduleX, moduleZ, moduleWidth, moduleDepth);
          } catch (error) {
            console.error('가구 렌더링 오류:', error, module);
          }
        });
      }
    } else {
      // 공간 정보도 없으면 썸네일 생성하지 않음
      return null;
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
  CanvasRenderingContext2D.prototype.roundRect = function (x: number, y: number, width: number, height: number, radius: number) {
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