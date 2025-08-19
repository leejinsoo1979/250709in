import React, { useEffect, useRef } from 'react';
import { OptimizedResult } from '../types';
import styles from '../CNCOptimizerPro.module.css';

interface SheetThumbnailProps {
  result: OptimizedResult;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

export default function SheetThumbnail({ 
  result, 
  index, 
  isActive, 
  onClick
}: SheetThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 원본 시트 크기
    const originalWidth = result.stockPanel.width;
    const originalHeight = result.stockPanel.height;
    
    // 세로형이면 회전시켜서 가로로 표시
    const isPortrait = originalHeight > originalWidth;
    const stockWidth = isPortrait ? originalHeight : originalWidth;
    const stockHeight = isPortrait ? originalWidth : originalHeight;
    
    // 고정 캔버스 크기 (항상 가로 비율)
    const canvasWidth = 120;
    const canvasHeight = 60;
    const scale = Math.min(canvasWidth / stockWidth, canvasHeight / stockHeight);
    
    // 고화질을 위한 DPR 적용
    const dpr = window.devicePixelRatio || 1;
    
    // 캔버스 크기 설정
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    
    // DPR 스케일 적용
    ctx.scale(dpr, dpr);
    
    // 안티앨리어싱 활성화
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 배경 그라데이션
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    bgGradient.addColorStop(0, '#ffffff');
    bgGradient.addColorStop(1, '#fafbfc');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 원장 크기 계산 (중앙 정렬)
    const sheetWidth = stockWidth * scale;
    const sheetHeight = stockHeight * scale;
    const offsetX = (canvasWidth - sheetWidth) / 2;
    const offsetY = (canvasHeight - sheetHeight) / 2;

    // 원장 그림자
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(offsetX, offsetY, sheetWidth, sheetHeight);
    ctx.restore();
    
    // 원장 테두리
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, sheetWidth, sheetHeight);
    
    // 테마 색상 가져오기
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme')
      .trim() || '220 90% 56%';
    
    // 패널 그리기
    result.panels.forEach(panel => {
      let x, y, width, height;
      
      if (isPortrait) {
        // 세로형 시트를 가로로 회전
        x = offsetX + panel.y * scale;
        y = offsetY + (originalWidth - panel.x - panel.width) * scale;
        width = (panel.rotated ? panel.width : panel.height) * scale;
        height = (panel.rotated ? panel.height : panel.width) * scale;
      } else {
        // 가로형 시트는 그대로
        x = offsetX + panel.x * scale;
        y = offsetY + panel.y * scale;
        width = (panel.rotated ? panel.height : panel.width) * scale;
        height = (panel.rotated ? panel.width : panel.height) * scale;
      }
      
      // 패널 배경 (재질별 색상 - MDF는 고유 갈색)
      const materialColors: { [key: string]: { fill: string; stroke: string } } = {
        'PB': { 
          fill: `hsl(${themeColor} / 0.06)`,
          stroke: `hsl(${themeColor} / 0.3)`
        },
        'MDF': { 
          fill: 'rgba(212, 165, 116, 0.3)', // MDF 고유 갈색 (투명도 적용)
          stroke: 'rgba(139, 98, 57, 0.5)'   // MDF 테두리 색상
        },
        'PET': { 
          fill: 'rgba(209, 213, 219, 0.6)',  // 그레이색 (투명도 적용)
          stroke: 'rgba(107, 114, 128, 0.6)'  // 그레이 테두리
        },
        'PLY': { 
          fill: 'rgba(232, 212, 176, 0.3)', // 합판 밝은 나무색 (투명도 적용)
          stroke: 'rgba(166, 137, 102, 0.5)' // 합판 테두리
        },
        'HPL': { 
          fill: `hsl(${themeColor} / 0.12)`,
          stroke: `hsl(${themeColor} / 0.35)`
        },
        'LPM': { 
          fill: `hsl(${themeColor} / 0.14)`,
          stroke: `hsl(${themeColor} / 0.35)`
        }
      };
      
      const colors = materialColors[panel.material] || materialColors['PB'];
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, width, height);
      
      // 패널 테두리
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, width, height);
    });
    
    // 재질 표시 (좌측 상단)
    ctx.save();
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(result.stockPanel.material || 'PB', 6, 6);
    ctx.restore();
    
    // 효율성 뱃지
    if (result.efficiency > 0) {
      ctx.save();
      const efficiency = result.efficiency.toFixed(0);
      const badgeSize = 24;
      const badgeX = canvasWidth - badgeSize - 6;
      const badgeY = 6;
      
      // 뱃지 배경
      const effColor = result.efficiency > 80 ? '#10b981' : 
                       result.efficiency > 60 ? '#f59e0b' : '#ef4444';
      ctx.fillStyle = effColor;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeSize, 16, 8);
      ctx.fill();
      
      // 뱃지 텍스트
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${efficiency}%`, badgeX + badgeSize/2, badgeY + 8);
      ctx.restore();
    }

  }, [result]);

  // Get panel thickness (assuming all panels have same thickness)
  const thickness = result.panels.length > 0 ? result.panels[0].thickness : 18;
  // Get material from stockPanel
  const material = result.stockPanel.material || 'PB';
  
  return (
    <div className={styles.thumbnailWrapper}>
      <div className={styles.thumbnailTitle}>시트 {index + 1} - {material} ({thickness}T)</div>
      <div
        className={`${styles.thumbnail} ${isActive ? styles.activeThumbnail : ''}`}
        onClick={onClick}
      >
        <canvas
          ref={canvasRef}
          className={styles.thumbnailCanvas}
        />
      </div>
    </div>
  );
}