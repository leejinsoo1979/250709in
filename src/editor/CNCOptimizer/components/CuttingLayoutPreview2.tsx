import React, { useEffect, useRef, useState } from 'react';
import { OptimizedResult } from '../types';
import styles from './CuttingLayoutPreview2.module.css';

interface CuttingLayoutPreview2Props {
  result?: OptimizedResult;
  highlightedPanelId?: string | null;
  showLabels?: boolean;
  onPanelClick?: (panelId: string) => void;
  allowRotation?: boolean;
}

const CuttingLayoutPreview2: React.FC<CuttingLayoutPreview2Props> = ({ 
  result,
  highlightedPanelId,
  showLabels = true,
  onPanelClick,
  allowRotation = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.2); // Start more zoomed in for better visibility
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270 degrees

  // Drawing function
  const draw = () => {
    if (!result || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get container dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Calculate base scale to fit container nicely
    const padding = 60; // Reduced padding for larger view
    const maxWidth = containerWidth - padding * 2;
    const maxHeight = containerHeight - padding * 2;
    
    // Consider rotation when calculating scale
    const rotatedWidth = rotation % 180 === 0 ? result.stockPanel.width : result.stockPanel.height;
    const rotatedHeight = rotation % 180 === 0 ? result.stockPanel.height : result.stockPanel.width;
    
    const scaleX = maxWidth / rotatedWidth;
    const scaleY = maxHeight / rotatedHeight;
    const baseScale = Math.min(scaleX, scaleY, 1.2); // Increased max scale for larger view
    
    // Set canvas size
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    // Apply transformations - rotation around panel center
    ctx.save();
    // Move to center of canvas (with offset for panning)
    ctx.translate(containerWidth / 2 + offset.x, containerHeight / 2 + offset.y);
    // Rotate around center
    ctx.rotate((rotation * Math.PI) / 180);
    // Scale from center
    ctx.scale(baseScale * scale, baseScale * scale);
    
    // Calculate panel offset to center it
    const offsetX = -result.stockPanel.width / 2;
    const offsetY = -result.stockPanel.height / 2;

    // Clear background first (before transformations)
    ctx.restore();
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#fafbfc');
    gradient.addColorStop(1, '#f3f4f6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Reapply transformations
    ctx.save();
    ctx.translate(containerWidth / 2 + offset.x, containerHeight / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(baseScale * scale, baseScale * scale);

    // Draw shadow for stock panel
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#fff';
    ctx.fillRect(offsetX, offsetY, result.stockPanel.width, result.stockPanel.height);
    ctx.restore();

    // Draw stock panel border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2 / (baseScale * scale);
    ctx.strokeRect(offsetX, offsetY, result.stockPanel.width, result.stockPanel.height);
    
    // Draw dimensions while still in panel coordinate system (without guide lines)
    ctx.save();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold 32px sans-serif`;
    ctx.textAlign = 'center';
    
    const dimOffset = 50;
    
    // Top dimension text
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `${result.stockPanel.width} mm`,
      offsetX + result.stockPanel.width / 2,
      offsetY - dimOffset
    );
    
    // Left dimension text (rotated)
    ctx.save();
    ctx.translate(offsetX - dimOffset, offsetY + result.stockPanel.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${result.stockPanel.height} mm`,
      0, 0
    );
    ctx.restore();
    
    ctx.restore();

    // Draw grid
    ctx.save();
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 0.5 / (baseScale * scale);
    ctx.setLineDash([5 / (baseScale * scale), 5 / (baseScale * scale)]);
    
    // Vertical grid lines (every 100mm)
    for (let x = 100; x < result.stockPanel.width; x += 100) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x, offsetY);
      ctx.lineTo(offsetX + x, offsetY + result.stockPanel.height);
      ctx.stroke();
    }
    
    // Horizontal grid lines (every 100mm)
    for (let y = 100; y < result.stockPanel.height; y += 100) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y);
      ctx.lineTo(offsetX + result.stockPanel.width, offsetY + y);
      ctx.stroke();
    }
    ctx.restore();

    // Material colors - 더 부드러운 색상
    const materialColors: { [key: string]: { fill: string; stroke: string } } = {
      'PB': { fill: '#e8f5e9', stroke: '#66bb6a' },  // 연한 초록
      'MDF': { fill: '#fff3e0', stroke: '#ffb74d' }, // 연한 오렌지
      'PLY': { fill: '#e3f2fd', stroke: '#42a5f5' }, // 연한 파랑
      'HPL': { fill: '#f3e5f5', stroke: '#ba68c8' }, // 연한 보라
      'LPM': { fill: '#fce4ec', stroke: '#f06292' }  // 연한 분홍
    };

    // Draw panels
    result.panels.forEach((panel) => {
      const x = offsetX + panel.x;
      const y = offsetY + panel.y;
      const width = panel.width;
      const height = panel.height;

      const isHighlighted = highlightedPanelId && panel.id === highlightedPanelId;
      const isHovered = hoveredPanelId === panel.id;
      const colors = materialColors[panel.material] || { fill: '#f3f4f6', stroke: '#9ca3af' };

      // Panel shadow for highlighted/hovered
      if (isHighlighted || isHovered) {
        ctx.save();
        ctx.shadowColor = isHighlighted ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = isHighlighted ? 15 : 8;
        ctx.fillStyle = colors.fill;
        ctx.fillRect(x, y, width, height);
        ctx.restore();
      } else {
        // Normal panel fill
        ctx.fillStyle = colors.fill;
        ctx.fillRect(x, y, width, height);
      }

      // Panel border
      ctx.strokeStyle = isHighlighted ? '#3b82f6' : isHovered ? '#6b7280' : colors.stroke;
      ctx.lineWidth = (isHighlighted ? 3 : isHovered ? 2 : 1) / (baseScale * scale);
      ctx.strokeRect(x, y, width, height);

      // Grain direction
      if (panel.grain && panel.grain !== 'NONE') {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 0.5;
        
        if (panel.grain === 'HORIZONTAL' || panel.grain === 'LENGTH') {
          // Horizontal grain lines
          for (let i = 1; i <= 3; i++) {
            const lineY = y + height * i / 4;
            ctx.beginPath();
            ctx.moveTo(x + 10, lineY);
            ctx.lineTo(x + width - 10, lineY);
            ctx.stroke();
          }
          // Arrow
          drawArrow(ctx, x + width - 25, y + height / 2, x + width - 10, y + height / 2);
        } else {
          // Vertical grain lines
          for (let i = 1; i <= 3; i++) {
            const lineX = x + width * i / 4;
            ctx.beginPath();
            ctx.moveTo(lineX, y + 10);
            ctx.lineTo(lineX, y + height - 10);
            ctx.stroke();
          }
          // Arrow
          drawArrow(ctx, x + width / 2, y + height - 25, x + width / 2, y + height - 10);
        }
        ctx.restore();
      }

      // Rotation indicator
      if (panel.rotated) {
        ctx.save();
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Rotation icon in corner
        const iconSize = 16;
        const iconX = x + width - iconSize - 4;
        const iconY = y + 4;
        
        ctx.translate(iconX + iconSize/2, iconY + iconSize/2);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-1, -iconSize/2, 2, iconSize);
        ctx.fillRect(-iconSize/2, -1, iconSize, 2);
        ctx.restore();
      }

      // Labels - 치수만 표시 (줌에 따라 크기 조절)
      if (showLabels && width > 20 && height > 20) {
        ctx.save();
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const dimensionText = `${Math.round(panel.width)} × ${Math.round(panel.height)}`;
        
        // 텍스트가 패널에 맞는지 확인
        ctx.font = `bold 20px sans-serif`;
        const textWidth = ctx.measureText(dimensionText).width;
        
        // 패널이 좁으면 텍스트를 회전시킴
        if (textWidth > width * 0.9 && height > width) {
          // 세로로 긴 패널 - 텍스트를 90도 회전
          ctx.save();
          ctx.translate(x + width / 2, y + height / 2);
          ctx.rotate(-Math.PI / 2);
          
          // 회전 후 텍스트가 맞는지 다시 확인하고 크기 조정
          let fontSize = 20;
          ctx.font = `bold ${fontSize}px sans-serif`;
          let rotatedTextWidth = ctx.measureText(dimensionText).width;
          
          while (rotatedTextWidth > height * 0.9 && fontSize > 10) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px sans-serif`;
            rotatedTextWidth = ctx.measureText(dimensionText).width;
          }
          
          ctx.fillText(dimensionText, 0, 0);
          ctx.restore();
        } else {
          // 일반적인 경우 - 텍스트 크기를 패널 너비에 맞춤
          let fontSize = 20;
          ctx.font = `bold ${fontSize}px sans-serif`;
          let normalTextWidth = ctx.measureText(dimensionText).width;
          
          while (normalTextWidth > width * 0.9 && fontSize > 10) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px sans-serif`;
            normalTextWidth = ctx.measureText(dimensionText).width;
          }
          
          ctx.fillText(
            dimensionText,
            x + width / 2,
            y + height / 2
          );
        }
        
        ctx.restore();
      }
    });

    ctx.restore(); // Restore main transformation

    // Statistics badge
    const efficiency = result.efficiency.toFixed(1);
    const wasteArea = (result.wasteArea / 1000000).toFixed(2);
    
    // Efficiency badge
    ctx.save();
    const badgeX = containerWidth - 100;
    const badgeY = 20;
    
    // Badge background
    const effColor = result.efficiency > 80 ? '#10b981' : 
                     result.efficiency > 60 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = effColor;
    ctx.roundRect(badgeX, badgeY, 70, 24, 12);
    ctx.fill();
    
    // Badge text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${efficiency}%`, badgeX + 35, badgeY + 12);
    ctx.restore();

    // Info text
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Panels: ${result.panels.length}`, 20, containerHeight - 40);
    ctx.fillText(`Waste: ${wasteArea} m²`, 20, containerHeight - 25);
  };

  // Call draw function when dependencies change
  useEffect(() => {
    draw();
  }, [result, highlightedPanelId, hoveredPanelId, showLabels, scale, offset, rotation]);

  // Handle wheel zoom with mouse position as center
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !containerRef.current) return;
    
    // Get mouse position relative to canvas center
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const mouseX = e.clientX - rect.left - containerWidth / 2;
    const mouseY = e.clientY - rect.top - containerHeight / 2;
    
    // Calculate zoom (reversed direction)
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(0.1, scale * delta), 5);
    
    // Calculate new offset to keep mouse position fixed
    const scaleRatio = newScale / scale;
    const newOffsetX = offset.x + mouseX - mouseX * scaleRatio;
    const newOffsetY = offset.y + mouseY - mouseY * scaleRatio;
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // Handle mouse drag for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle rotation with reset to center
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
    setOffset({ x: 0, y: 0 }); // Always reset to center on rotation
    setScale(1.2); // Reset scale for better view
  };

  // Handle reset view
  const handleReset = () => {
    setScale(1.2);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  };

  // Helper function to draw arrow
  function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
    const headLength = 6;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  // Handle canvas click - Updated for transformations
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!result || !canvasRef.current || !containerRef.current || !onPanelClick || isDragging) return;

    // Complex click detection with transformations would be needed here
    // For now, disable click during drag
  };

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas 
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {result && (
        <>
          <button
            className={styles.rotateButton}
            onClick={handleRotate}
            title="Rotate 90°"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            className={styles.resetButton}
            onClick={handleReset}
            title="Reset View"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </>
      )}
      {!result && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📐</div>
          <p>No optimization result to display</p>
        </div>
      )}
    </div>
  );
};

export default CuttingLayoutPreview2;