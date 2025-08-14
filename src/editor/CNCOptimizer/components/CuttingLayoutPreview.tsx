import React, { useEffect, useRef } from 'react';
import { OptimizedResult } from '../types';
import styles from '../style.module.css';

interface CuttingLayoutPreviewProps {
  result?: OptimizedResult;
  highlightedPanelId?: string | null;
  zoom?: number;
  showLabels?: boolean;
}

const CuttingLayoutPreview: React.FC<CuttingLayoutPreviewProps> = ({ 
  result,
  highlightedPanelId,
  zoom = 100,
  showLabels = true 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!result || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas 크기 설정
    const scale = zoom / 100;
    const padding = 40;
    const displayWidth = result.stockPanel.width * 0.3 * scale;
    const displayHeight = result.stockPanel.height * 0.3 * scale;
    
    canvas.width = displayWidth + padding * 2;
    canvas.height = displayHeight + padding * 2;

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 원장 그리기
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, padding, displayWidth, displayHeight);
    ctx.fillStyle = '#fff';
    ctx.fillRect(padding, padding, displayWidth, displayHeight);

    // 그리드 그리기
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([5, 5]);
    
    // 수직 그리드
    for (let x = 0; x <= result.stockPanel.width; x += 100) {
      const displayX = padding + (x * displayWidth / result.stockPanel.width);
      ctx.beginPath();
      ctx.moveTo(displayX, padding);
      ctx.lineTo(displayX, padding + displayHeight);
      ctx.stroke();
    }
    
    // 수평 그리드
    for (let y = 0; y <= result.stockPanel.height; y += 100) {
      const displayY = padding + (y * displayHeight / result.stockPanel.height);
      ctx.beginPath();
      ctx.moveTo(padding, displayY);
      ctx.lineTo(padding + displayWidth, displayY);
      ctx.stroke();
    }
    
    ctx.setLineDash([]);

    // 재질별 색상 매핑
    const materialColors: { [key: string]: string } = {
      'PB': '#f5f5f5',
      'MDF': '#ffe8d6',
      'PLY': '#d4a574',
      'HPL': '#e8e8e8',
      'LPM': '#f0f0f0'
    };

    // 패널 그리기
    result.panels.forEach((panel) => {
      const x = padding + (panel.x * displayWidth / result.stockPanel.width);
      const y = padding + (panel.y * displayHeight / result.stockPanel.height);
      const width = panel.width * displayWidth / result.stockPanel.width;
      const height = panel.height * displayHeight / result.stockPanel.height;

      // 선택된 패널 확인
      const isHighlighted = highlightedPanelId && panel.id === highlightedPanelId;

      // 패널 채우기
      ctx.fillStyle = materialColors[panel.material] || '#f0f0f0';
      ctx.fillRect(x, y, width, height);

      // 패널 테두리 - 선택된 패널은 강조 표시
      if (isHighlighted) {
        // 선택된 패널 강조 - 외부 광선 효과
        ctx.save();
        ctx.shadowColor = '#007AFF';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#007AFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
        
        // 내부 테두리
        ctx.strokeStyle = '#0051D5';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
      } else {
        // 일반 패널
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
      }

      // 결 방향 표시
      if (panel.grain && panel.grain !== 'NONE') {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 0.5;
        
        if (panel.grain === 'HORIZONTAL' || panel.grain === 'LENGTH') {
          // 가로 결 방향
          for (let i = 0; i < 3; i++) {
            const lineY = y + height * (i + 1) / 4;
            ctx.beginPath();
            ctx.moveTo(x + 10, lineY);
            ctx.lineTo(x + width - 10, lineY);
            ctx.stroke();
          }
          
          // 화살표
          ctx.beginPath();
          ctx.moveTo(x + width - 20, y + height / 2);
          ctx.lineTo(x + width - 10, y + height / 2);
          ctx.lineTo(x + width - 15, y + height / 2 - 5);
          ctx.moveTo(x + width - 10, y + height / 2);
          ctx.lineTo(x + width - 15, y + height / 2 + 5);
          ctx.stroke();
        } else {
          // 세로 결 방향
          for (let i = 0; i < 3; i++) {
            const lineX = x + width * (i + 1) / 4;
            ctx.beginPath();
            ctx.moveTo(lineX, y + 10);
            ctx.lineTo(lineX, y + height - 10);
            ctx.stroke();
          }
          
          // 화살표
          ctx.beginPath();
          ctx.moveTo(x + width / 2, y + height - 20);
          ctx.lineTo(x + width / 2, y + height - 10);
          ctx.lineTo(x + width / 2 - 5, y + height - 15);
          ctx.moveTo(x + width / 2, y + height - 10);
          ctx.lineTo(x + width / 2 + 5, y + height - 15);
          ctx.stroke();
        }
      }

      // 라벨 표시
      if (showLabels) {
        ctx.fillStyle = '#333';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 패널 이름 또는 ID
        const label = panel.name || panel.id || '';
        const labelLines = label.split(' - ');
        
        if (width > 40 && height > 30) {
          labelLines.forEach((line, index) => {
            ctx.fillText(
              line, 
              x + width / 2, 
              y + height / 2 + (index - labelLines.length / 2 + 0.5) * 12
            );
          });
        }
        
        // 치수 표시
        if (width > 60 && height > 40) {
          ctx.font = '9px sans-serif';
          ctx.fillStyle = '#666';
          ctx.fillText(
            `${Math.round(panel.width)} x ${Math.round(panel.height)}`,
            x + width / 2,
            y + height - 10
          );
        }
      }

      // 회전된 패널 표시
      if (panel.rotated) {
        ctx.save();
        ctx.strokeStyle = isHighlighted ? '#0066CC' : '#ff6b00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
      }
    });

    // 치수 표시
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    // 너비 치수
    ctx.fillText(
      `${result.stockPanel.width}mm`,
      padding + displayWidth / 2,
      padding - 10
    );
    
    // 높이 치수
    ctx.save();
    ctx.translate(padding - 10, padding + displayHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${result.stockPanel.height}mm`, 0, 0);
    ctx.restore();

    // 효율성 표시
    ctx.fillStyle = '#333';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `효율: ${result.efficiency.toFixed(1)}%`,
      padding,
      canvas.height - 10
    );
    
    ctx.fillText(
      `낭비: ${(result.wasteArea / 1000000).toFixed(2)}m²`,
      padding + 150,
      canvas.height - 10
    );

  }, [result, highlightedPanelId, zoom, showLabels]);

  return (
    <div className={styles.previewContainer}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default CuttingLayoutPreview;