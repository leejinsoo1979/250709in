import React, { useEffect, useRef } from 'react';
import { Panel } from '../types';
import styles from '../style.module.css';

interface PanelCanvasProps {
  panels: Panel[];
}

const PanelCanvas: React.FC<PanelCanvasProps> = ({ panels }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 설정
    canvas.width = 600;
    canvas.height = 400;

    // 배경 클리어
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 그리드 그리기
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 패널 그리기
    const padding = 20;
    const maxWidth = canvas.width - padding * 2;
    const maxHeight = canvas.height - padding * 2;
    
    // 패널들의 최대 크기 찾기
    let maxPanelWidth = 0;
    let maxPanelHeight = 0;
    
    panels.forEach(panel => {
      maxPanelWidth = Math.max(maxPanelWidth, panel.width);
      maxPanelHeight = Math.max(maxPanelHeight, panel.height);
    });
    
    // 스케일 계산
    const scale = Math.min(
      maxWidth / maxPanelWidth,
      maxHeight / maxPanelHeight,
      0.2
    );
    
    // 패널 그리기
    let xOffset = padding;
    let yOffset = padding;
    let rowHeight = 0;
    
    panels.forEach((panel, index) => {
      const width = panel.width * scale;
      const height = panel.height * scale;
      
      // 다음 줄로 이동이 필요한지 확인
      if (xOffset + width > canvas.width - padding) {
        xOffset = padding;
        yOffset += rowHeight + 10;
        rowHeight = 0;
      }
      
      // 패널 그리기
      for (let i = 0; i < panel.quantity; i++) {
        const x = xOffset + i * 5; // 중첩 효과
        const y = yOffset + i * 5;
        
        // 그림자
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(x + 2, y + 2, width, height);
        
        // 패널
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(x, y, width, height);
        
        // 테두리
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
        
        // 크기 표시
        if (i === panel.quantity - 1) { // 마지막 패널에만 표시
          ctx.fillStyle = '#666';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            `${panel.width}×${panel.height}`,
            x + width / 2,
            y + height / 2
          );
        }
      }
      
      xOffset += width + 20;
      rowHeight = Math.max(rowHeight, height);
    });

  }, [panels]);

  return (
    <div className={styles.canvasContainer}>
      <canvas 
        ref={canvasRef}
        className={styles.canvas}
      />
    </div>
  );
};

export default PanelCanvas;