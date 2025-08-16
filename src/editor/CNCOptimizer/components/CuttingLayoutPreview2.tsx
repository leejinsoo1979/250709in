import React, { useEffect, useRef, useState } from 'react';
import { OptimizedResult } from '../types';
import styles from './CuttingLayoutPreview2.module.css';

interface CuttingLayoutPreview2Props {
  result?: OptimizedResult;
  highlightedPanelId?: string | null;
  showLabels?: boolean;
  onPanelClick?: (panelId: string) => void;
  allowRotation?: boolean;
  // 동기화를 위한 상태
  scale?: number;
  rotation?: number;
  offset?: { x: number; y: number };
  onScaleChange?: (scale: number) => void;
  onRotationChange?: (rotation: number) => void;
  onOffsetChange?: (offset: { x: number; y: number }) => void;
  // 시트 정보
  sheetInfo?: {
    currentIndex: number;
    totalSheets: number;
    onOptimize: () => void;
    isOptimizing: boolean;
  };
}

const CuttingLayoutPreview2: React.FC<CuttingLayoutPreview2Props> = ({ 
  result,
  highlightedPanelId,
  showLabels = true,
  onPanelClick,
  allowRotation = true,
  scale: externalScale,
  rotation: externalRotation,
  offset: externalOffset,
  onScaleChange,
  onRotationChange,
  onOffsetChange,
  sheetInfo
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 외부 상태가 있으면 사용, 없으면 내부 상태 사용
  const [internalScale, setInternalScale] = useState(1);
  const [internalRotation, setInternalRotation] = useState(0);
  const [internalOffset, setInternalOffset] = useState({ x: 0, y: 0 });
  
  const scale = externalScale ?? internalScale;
  const rotation = externalRotation ?? internalRotation;
  const offset = externalOffset ?? internalOffset;
  
  const setScale = onScaleChange || setInternalScale;
  const setRotation = onRotationChange || setInternalRotation;
  const setOffset = onOffsetChange || setInternalOffset;
  
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Drawing function
  const draw = () => {
    if (!result || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get container dimensions
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Account for header bar height if present
    const headerHeight = sheetInfo ? 40 : 0;
    const canvasTop = headerHeight;
    const drawableHeight = containerHeight - headerHeight;

    // High DPI support for sharp rendering
    const dpr = window.devicePixelRatio || 1;

    // Calculate base scale to fit container nicely
    const padding = 40; // 적절한 패딩
    const maxWidth = containerWidth - padding * 2;
    const maxHeight = drawableHeight - padding * 2;
    
    // Consider rotation when calculating scale
    const rotatedWidth = rotation % 180 === 0 ? result.stockPanel.width : result.stockPanel.height;
    const rotatedHeight = rotation % 180 === 0 ? result.stockPanel.height : result.stockPanel.width;
    
    // 원장 크기에 맞춰 스케일 계산
    const scaleX = maxWidth / rotatedWidth;
    const scaleY = maxHeight / rotatedHeight;
    const baseScale = Math.min(scaleX, scaleY); // 제한 없이 자동 계산
    
    // Set canvas size with device pixel ratio for sharp rendering
    // Use drawableHeight to account for header
    const canvasWidth = containerWidth;
    const canvasHeight = drawableHeight;
    
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    
    // Scale context to account for device pixel ratio
    ctx.scale(dpr, dpr);
    
    // Apply transformations - rotation around panel center
    ctx.save();
    // Move to center of canvas (with offset for panning)
    ctx.translate(canvasWidth / 2 + offset.x, canvasHeight / 2 + offset.y);
    // Rotate around center
    ctx.rotate((rotation * Math.PI) / 180);
    // Scale from center
    ctx.scale(baseScale * scale, baseScale * scale);
    
    // Calculate panel offset to center it
    const offsetX = -result.stockPanel.width / 2;
    const offsetY = -result.stockPanel.height / 2;

    // Clear background first (before transformations)
    ctx.restore();
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, '#fafbfc');
    gradient.addColorStop(1, '#f3f4f6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Reapply transformations
    ctx.save();
    ctx.translate(canvasWidth / 2 + offset.x, canvasHeight / 2 + offset.y);
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
    
    // Draw trim margins (if any) - 여백 영역 표시
    const settings = window.cncSettings || {};
    const trimTop = settings.trimTop || 0;
    const trimBottom = settings.trimBottom || 0;
    const trimLeft = settings.trimLeft || 0;
    const trimRight = settings.trimRight || 0;
    
    if (trimTop > 0 || trimBottom > 0 || trimLeft > 0 || trimRight > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 0, 0, 0.05)';
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.lineWidth = 1 / (baseScale * scale);
      ctx.setLineDash([5 / (baseScale * scale), 5 / (baseScale * scale)]);
      
      // Top margin
      if (trimTop > 0) {
        ctx.fillRect(offsetX, offsetY, result.stockPanel.width, trimTop);
        ctx.strokeRect(offsetX, offsetY, result.stockPanel.width, trimTop);
      }
      
      // Bottom margin
      if (trimBottom > 0) {
        ctx.fillRect(offsetX, offsetY + result.stockPanel.height - trimBottom, result.stockPanel.width, trimBottom);
        ctx.strokeRect(offsetX, offsetY + result.stockPanel.height - trimBottom, result.stockPanel.width, trimBottom);
      }
      
      // Left margin
      if (trimLeft > 0) {
        ctx.fillRect(offsetX, offsetY, trimLeft, result.stockPanel.height);
        ctx.strokeRect(offsetX, offsetY, trimLeft, result.stockPanel.height);
      }
      
      // Right margin
      if (trimRight > 0) {
        ctx.fillRect(offsetX + result.stockPanel.width - trimRight, offsetY, trimRight, result.stockPanel.height);
        ctx.strokeRect(offsetX + result.stockPanel.width - trimRight, offsetY, trimRight, result.stockPanel.height);
      }
      
      ctx.restore();
    }
    
    // Draw dimensions while still in panel coordinate system (without guide lines)
    ctx.save();
    // Enable text anti-aliasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
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

    // Material colors with theme integration
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme')
      .trim();
    
    // Use theme color for highlighted/active panels
    const materialColors: { [key: string]: { fill: string; stroke: string } } = {
      'PB': { fill: `hsl(${themeColor} / 0.08)`, stroke: `hsl(${themeColor} / 0.5)` },
      'MDF': { fill: `hsl(${themeColor} / 0.10)`, stroke: `hsl(${themeColor} / 0.6)` },
      'PLY': { fill: `hsl(${themeColor} / 0.12)`, stroke: `hsl(${themeColor} / 0.7)` },
      'HPL': { fill: `hsl(${themeColor} / 0.14)`, stroke: `hsl(${themeColor} / 0.8)` },
      'LPM': { fill: `hsl(${themeColor} / 0.16)`, stroke: `hsl(${themeColor} / 0.9)` }
    };

    // Draw panels
    result.panels.forEach((panel) => {
      const x = offsetX + panel.x;
      const y = offsetY + panel.y;
      // 회전된 경우에도 실제 차지하는 공간으로 그림
      const width = panel.rotated ? panel.height : panel.width;
      const height = panel.rotated ? panel.width : panel.height;

      const isHighlighted = highlightedPanelId && panel.id === highlightedPanelId;
      const isHovered = hoveredPanelId === panel.id;
      const colors = materialColors[panel.material] || { fill: '#f3f4f6', stroke: '#9ca3af' };

      // Panel shadow for highlighted/hovered
      if (isHighlighted || isHovered) {
        ctx.save();
        ctx.shadowColor = isHighlighted ? `hsl(${themeColor} / 0.3)` : 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = isHighlighted ? 15 : 8;
        ctx.fillStyle = isHighlighted ? `hsl(${themeColor} / 0.15)` : colors.fill;
        ctx.fillRect(x, y, width, height);
        ctx.restore();
      } else {
        // Normal panel fill
        ctx.fillStyle = colors.fill;
        ctx.fillRect(x, y, width, height);
      }

      // Panel border
      ctx.strokeStyle = isHighlighted ? `hsl(${themeColor})` : isHovered ? `hsl(${themeColor} / 0.6)` : colors.stroke;
      ctx.lineWidth = (isHighlighted ? 3 : isHovered ? 2 : 1.5) / (baseScale * scale);
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
        ctx.fillStyle = `hsl(${themeColor})`;
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
        // Enable text anti-aliasing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 회전 여부와 관계없이 항상 원래 크기를 표시 (두께 포함)
        const thickness = panel.thickness || 18;
        const dimensionText = `${Math.round(panel.width)} × ${Math.round(panel.height)} × ${thickness}T`;
        
        // 텍스트가 패널에 맞는지 확인 - 기본 크기를 28px로 증가
        ctx.font = `bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const textWidth = ctx.measureText(dimensionText).width;
        
        // 패널이 좁으면 텍스트를 회전시킴
        if (textWidth > width * 0.9 && height > width) {
          // 세로로 긴 패널 - 텍스트를 90도 회전
          ctx.save();
          ctx.translate(x + width / 2, y + height / 2);
          ctx.rotate(-Math.PI / 2);
          
          // 회전 후 텍스트가 맞는지 다시 확인하고 크기 조정
          let fontSize = 28;
          ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          let rotatedTextWidth = ctx.measureText(dimensionText).width;
          
          while (rotatedTextWidth > height * 0.9 && fontSize > 14) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            rotatedTextWidth = ctx.measureText(dimensionText).width;
          }
          
          ctx.textBaseline = 'bottom';
          ctx.fillText(dimensionText, 0, -5);
          
          // 패널명 (더 작은 크기로)
          if (panel.name && fontSize > 10) {
            ctx.font = `${fontSize * 0.6}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.fillStyle = '#666';
            ctx.textBaseline = 'top';
            ctx.fillText(panel.name, 0, 5);
          }
          
          ctx.restore();
        } else {
          // 일반적인 경우 - 텍스트 크기를 패널 너비에 맞춤
          let fontSize = 28;
          ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          let normalTextWidth = ctx.measureText(dimensionText).width;
          
          while (normalTextWidth > width * 0.9 && fontSize > 14) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            normalTextWidth = ctx.measureText(dimensionText).width;
          }
          
          // 치수 텍스트
          ctx.textBaseline = 'bottom';
          ctx.fillText(dimensionText, x + width / 2, y + height / 2 - 5);
          
          // 패널명 (더 작은 크기로)
          if (panel.name && fontSize > 10) {
            ctx.font = `${fontSize * 0.6}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.fillStyle = '#666';
            ctx.textBaseline = 'top';
            
            // 긴 이름은 잘라서 표시
            let displayName = panel.name;
            let nameWidth = ctx.measureText(displayName).width;
            while (nameWidth > width * 0.9 && displayName.length > 10) {
              displayName = displayName.slice(0, -1);
              nameWidth = ctx.measureText(displayName + '...').width;
            }
            if (displayName !== panel.name) {
              displayName += '...';
            }
            
            ctx.fillText(displayName, x + width / 2, y + height / 2 + 5);
          }
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
    const badgeX = canvasWidth - 100;
    const badgeY = 20; // Always same position since canvas is adjusted for header
    
    // Badge background
    const effColor = result.efficiency > 80 ? '#10b981' : 
                     result.efficiency > 60 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = effColor;
    ctx.roundRect(badgeX, badgeY, 70, 24, 12);
    ctx.fill();
    
    // Badge text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${efficiency}%`, badgeX + 35, badgeY + 12);
    ctx.restore();

    // Info text
    ctx.save();
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Panels: ${result.panels.length}`, 20, canvasHeight - 40);
    ctx.fillText(`Waste: ${wasteArea} m²`, 20, canvasHeight - 25);
    ctx.restore();
  };

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      draw();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Call draw function when dependencies change
  useEffect(() => {
    draw();
  }, [result, highlightedPanelId, hoveredPanelId, showLabels, scale, offset, rotation]);

  // Handle wheel zoom with mouse position as center
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Use canvas actual dimensions
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    
    // 마우스 위치 (캔버스 기준)
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 줌 속도 조절 (트랙패드와 마우스 휠 모두 부드럽게)
    const zoomSpeed = 0.001; // Configurator와 동일한 부드러운 줌
    const scaledDelta = e.deltaY * zoomSpeed;
    
    // 지수 함수로 부드러운 줌 계산
    const zoomFactor = Math.exp(-scaledDelta);
    const newScale = Math.min(Math.max(0.05, scale * zoomFactor), 10);
    
    if (Math.abs(newScale - scale) > 0.001) {
      // 마우스 위치를 월드 좌표로 변환
      const worldX = (mouseX - canvasWidth / 2 - offset.x) / scale;
      const worldY = (mouseY - canvasHeight / 2 - offset.y) / scale;
      
      // 새로운 스케일에서 마우스 위치가 동일하게 유지되도록 오프셋 조정
      const newOffsetX = mouseX - canvasWidth / 2 - worldX * newScale;
      const newOffsetY = mouseY - canvasHeight / 2 - worldY * newScale;
      
      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    }
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

  // Handle rotation - toggle between 0 and 90 degrees
  const handleRotate = () => {
    setRotation((prev) => prev === 0 ? 90 : 0); // Toggle between 0° and 90°
    setOffset({ x: 0, y: 0 }); // Always reset to center on rotation
    setScale(1); // Reset scale to fit view
  };

  // Handle reset view
  const handleReset = () => {
    setScale(1);
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
    if (!result || !canvasRef.current || !onPanelClick || isDragging) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Use canvas actual dimensions
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    
    // Calculate base scale
    const padding = 60;
    const maxWidth = canvasWidth - padding * 2;
    const maxHeight = canvasHeight - padding * 2;
    const rotatedWidth = rotation % 180 === 0 ? result.stockPanel.width : result.stockPanel.height;
    const rotatedHeight = rotation % 180 === 0 ? result.stockPanel.height : result.stockPanel.width;
    const scaleX = maxWidth / rotatedWidth;
    const scaleY = maxHeight / rotatedHeight;
    const baseScale = Math.min(scaleX, scaleY, 1.2);
    const totalScale = baseScale * scale;
    
    // Transform mouse position to panel coordinate system
    const centerX = canvasWidth / 2 + offset.x;
    const centerY = canvasHeight / 2 + offset.y;
    
    // Calculate rotation transformation
    const angle = (rotation * Math.PI) / 180;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    
    // Transform mouse coordinates
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;
    
    // Scale to panel space
    const panelX = rotatedX / totalScale + result.stockPanel.width / 2;
    const panelY = rotatedY / totalScale + result.stockPanel.height / 2;
    
    // Check which panel was clicked
    let clickedPanelId = null;
    for (const panel of result.panels) {
      if (panelX >= panel.x && panelX <= panel.x + panel.width &&
          panelY >= panel.y && panelY <= panel.y + panel.height) {
        clickedPanelId = panel.id;
        break;
      }
    }
    
    // Call the click handler with the panel ID or null
    onPanelClick(clickedPanelId);
  };

  return (
    <div ref={containerRef} className={`${styles.container} panel-clickable`}>
      {sheetInfo && (
        <div className={styles.headerBar}>
          <span className={styles.sheetInfo}>
            시트 {sheetInfo.currentIndex + 1} / {sheetInfo.totalSheets}
          </span>
          <button
            className={styles.optimizeButton}
            onClick={sheetInfo.onOptimize}
            disabled={sheetInfo.isOptimizing}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {sheetInfo.isOptimizing ? '최적화 중...' : '최적화'}
          </button>
        </div>
      )}
      <canvas 
        ref={canvasRef}
        className={`${styles.canvas} panel-clickable`}
        style={{ 
          cursor: isDragging ? 'grabbing' : 'grab',
          top: sheetInfo ? '40px' : '0',
          height: sheetInfo ? 'calc(100% - 40px)' : '100%'
        }}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {result && (
        <div className={styles.viewControls}>
          <button
            className={styles.rotateButton}
            onClick={handleRotate}
            title={rotation === 0 ? "90° 회전" : "원래대로"}
            style={{ 
              transform: rotation === 90 ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.3s ease'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            className={styles.resetButton}
            onClick={handleReset}
            title="뷰 초기화"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
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