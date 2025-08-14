import React, { useEffect, useRef } from 'react';
import { OptimizedResult } from '../types';
import styles from '../style.module.css';

interface OptimizationResultProps {
  result: OptimizedResult;
  getColorHex: (color: string) => string;
  getMaterialName: (material: string) => string;
}

const OptimizationResult: React.FC<OptimizationResultProps> = ({
  result,
  getColorHex,
  getMaterialName
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 원장 크기
    const stockWidth = result.stockPanel.width || 2440;
    const stockHeight = result.stockPanel.height || 1220;
    
    // 캔버스 크기 설정 - 2:1 비율 정확히 유지
    const padding = 40;
    const targetWidth = 360;
    const scale = targetWidth / stockWidth;
    
    canvas.width = targetWidth + padding * 2;
    canvas.height = (stockHeight * scale) + padding * 2;

    // 배경 클리어
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sheetWidth = targetWidth;
    const sheetHeight = targetWidth / 2; // 정확한 2:1 비율
    const startX = padding;
    const startY = padding;

    // 원장 배경 - 흰색
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX, startY, sheetWidth, sheetHeight);
    
    // 원장 테두리 - 검정색
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX, startY, sheetWidth, sheetHeight);

    // 배치된 패널 그리기
    result.panels.forEach((panel, index) => {
      const x = startX + panel.x * scale;
      const y = startY + panel.y * scale;
      const width = (panel.rotated ? panel.height : panel.width) * scale;
      const height = (panel.rotated ? panel.width : panel.height) * scale;

      // 패널 배경 - 색상별로 구분
      const colors = ['#e3f2fd', '#e8f5e9', '#fff3e0', '#fce4ec', '#f3e5f5', '#ede7f6'];
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(x, y, width, height);

      // 패널 테두리 - 절단선
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
      
      // 내부 테두리 (선명하게)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      
      // 패널 크기 표시 (중앙에)
      if (width > 20 && height > 15) {
        const actualWidth = panel.rotated ? panel.height : panel.width;
        const actualHeight = panel.rotated ? panel.width : panel.height;
        
        // 배경 박스
        const text = `${actualWidth}×${actualHeight}`;
        ctx.font = 'bold 9px Arial';
        const textWidth = ctx.measureText(text).width + 6;
        const textHeight = 14;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(
          x + width / 2 - textWidth / 2,
          y + height / 2 - textHeight / 2,
          textWidth,
          textHeight
        );
        
        // 텍스트
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          text,
          x + width / 2,
          y + height / 2
        );
        
        // 회전 표시
        if (panel.rotated) {
          ctx.fillStyle = '#ff5722';
          ctx.font = 'bold 7px Arial';
          ctx.fillText('R', x + width - 8, y + 8);
        }
      }
    });

    // 치수선 그리기
    ctx.strokeStyle = '#666666';
    ctx.fillStyle = '#666666';
    ctx.lineWidth = 0.5;
    ctx.font = '9px Arial';
    
    // 하단 가로 치수
    const dimY = startY + sheetHeight + 8;
    ctx.beginPath();
    ctx.moveTo(startX, dimY);
    ctx.lineTo(startX + sheetWidth, dimY);
    ctx.stroke();
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${stockWidth}`, startX + sheetWidth / 2, dimY + 2);
    
    // 우측 세로 치수
    const dimX = startX + sheetWidth + 8;
    ctx.beginPath();
    ctx.moveTo(dimX, startY);
    ctx.lineTo(dimX, startY + sheetHeight);
    ctx.stroke();
    
    ctx.save();
    ctx.translate(dimX + 10, startY + sheetHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${stockHeight}`, 0, 0);
    ctx.restore();

  }, [result]);

  const getEfficiencyClass = (efficiency: number) => {
    if (efficiency >= 90) return 'high';
    if (efficiency >= 75) return 'medium';
    return 'low';
  };

  return (
    <div className={styles.resultItem}>
      <div className={styles.resultHeader}>
        <div className={styles.resultStock}>
          <div 
            className={styles.stockColor}
            style={{ 
              backgroundColor: getColorHex(result.stockPanel.color),
              width: '16px',
              height: '16px'
            }}
          />
          <span>
            {getMaterialName(result.stockPanel.material)} - 
            {result.stockPanel.width} × {result.stockPanel.height}mm
          </span>
        </div>
        <div className={styles.resultEfficiency}>
          <div className={styles.efficiencyBar}>
            <div 
              className={`${styles.efficiencyFill} ${styles[getEfficiencyClass(result.efficiency)]}`}
              style={{ width: `${result.efficiency}%` }}
            />
          </div>
          <span className={styles.efficiencyValue}>
            {result.efficiency.toFixed(1)}%
          </span>
        </div>
      </div>
      
      <canvas 
        ref={canvasRef}
        className={styles.resultCanvas}
        style={{ maxWidth: '100%' }}
      />
      
      <div className={styles.resultStats}>
        <div className={styles.resultStat}>
          <span className={styles.resultStatLabel}>패널 수</span>
          <span className={styles.resultStatValue}>{result.panels.length}개</span>
        </div>
        <div className={styles.resultStat}>
          <span className={styles.resultStatLabel}>사용 면적</span>
          <span className={styles.resultStatValue}>
            {((result.stockPanel.width * result.stockPanel.height - result.wasteArea) / 1000000).toFixed(2)}m²
          </span>
        </div>
        <div className={styles.resultStat}>
          <span className={styles.resultStatLabel}>낭비 면적</span>
          <span className={styles.resultStatValue}>
            {(result.wasteArea / 1000000).toFixed(2)}m²
          </span>
        </div>
      </div>
    </div>
  );
};

export default OptimizationResult;