import React, { useEffect, useRef, useState } from 'react';
import { OptimizedResult } from '../types';
import { ZoomIn, ZoomOut, RotateCw, Home, Maximize, Ruler, Type, ALargeSmall, ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useCNCStore } from '../store';
import { buildSequenceForPanel, runSimulation } from '@/utils/cut/simulate';
import type { CutStep } from '@/types/cutlist';
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
    stock?: any[];
  };
  onCurrentSheetIndexChange?: (index: number) => void;
  showCuttingListTab?: boolean; // 컷팅 리스트 탭이 활성화되어 있는지 여부
  allCutSteps?: any[]; // All cut steps for current sheet
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
  sheetInfo,
  onCurrentSheetIndexChange,
  showCuttingListTab = false,
  allCutSteps = []
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 시트가 세로형인지 확인 (height > width)
  const isPortraitSheet = result && result.stockPanel.height > result.stockPanel.width;
  
  // 외부 상태가 있으면 사용, 없으면 내부 상태 사용
  // 기본적으로 -90도 회전하여 가로로 표시 (모든 시트를 가로보기로)
  const [internalScale, setInternalScale] = useState(1);
  const [internalRotation, setInternalRotation] = useState(-90); // 항상 가로보기를 기본으로
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
  
  // Font size scale
  const [fontScale, setFontScale] = useState(1);
  
  // Toggle ruler display
  const [showRuler, setShowRuler] = useState(false);
  
  // Toggle dimension display
  const [showDimensions, setShowDimensions] = useState(true);
  
  // Get settings and simulation state from store
  const { 
    settings, setSettings,
    selectedPanelId, selectedSheetId,
    placements, cuts, setCuts,
    simulating, setSimulating,
    simSpeed, setSimSpeed,
    selectedCutIndex, selectCutIndex,
    selectedCutId, selectCutId
  } = useCNCStore();
  
  // Simulation state
  const [cutSequence, setCutSequence] = useState<CutStep[]>([]);
  const [currentCutIndex, setCurrentCutIndex] = useState(0);
  const cancelSimRef = useRef({ current: false });
  
  // Generate cut sequence when panel is selected or for entire sheet simulation
  useEffect(() => {
    console.log('Simulation state:', { 
      simulating, 
      selectedPanelId, 
      hasResult: !!result, 
      allCutStepsLength: allCutSteps?.length || 0 
    });
    
    if (simulating && !selectedPanelId && result && allCutSteps && allCutSteps.length > 0) {
      // Full sheet simulation - use all cut steps for current sheet
      const currentSheetNumber = (sheetInfo?.currentIndex ?? 0) + 1;
      const sheetCuts = allCutSteps.filter(cut => 
        cut.sheetNumber === currentSheetNumber
      );
      
      console.log('Sheet cuts:', { currentSheetNumber, sheetCutsLength: sheetCuts.length });
      
      if (sheetCuts.length > 0) {
        setCutSequence(sheetCuts);
        setCurrentCutIndex(0);
      } else {
        // 컷이 없는 경우 시뮬레이션 종료
        console.log('No cuts found, stopping simulation');
        setSimulating(false);
      }
    } else if (selectedPanelId && selectedSheetId && result) {
      // Single panel simulation
      const placement = placements.find(
        p => p.panelId === selectedPanelId && p.sheetId === String(sheetInfo?.currentIndex + 1 || 1)
      );
      
      if (placement) {
        // Generate cut sequence
        const sequence = buildSequenceForPanel({
          mode: settings.optimizationType === 'cnc' ? 'free' : 'guillotine',
          sheetW: result.stockPanel.width,
          sheetH: result.stockPanel.height,
          kerf: settings.kerf || 5,
          placement: {
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height
          },
          sheetId: placement.sheetId,
          panelId: placement.panelId
        });
        setCutSequence(sequence);
        setCurrentCutIndex(0);
      }
    } else {
      setCutSequence([]);
      setCurrentCutIndex(0);
    }
  }, [selectedPanelId, selectedSheetId, result, placements, settings, sheetInfo, simulating, allCutSteps]);
  
  // Run simulation when simulating flag is set
  useEffect(() => {
    console.log('Run simulation check:', { simulating, cutSequenceLength: cutSequence.length });
    
    if (simulating && cutSequence.length > 0) {
      console.log('Starting simulation with', cutSequence.length, 'cuts');
      // Cancel any existing simulation
      if (cancelSimRef.current) {
        cancelSimRef.current.current = true;
      }
      
      // Create new cancel ref for this simulation
      const newCancelRef = { current: false };
      cancelSimRef.current = newCancelRef;
      
      // Start new simulation with faster speed
      runSimulation(cutSequence, {
        onTick: (i) => {
          console.log('Setting cut index:', i);
          setCurrentCutIndex(i);
          selectCutIndex(i);
        },
        onDone: () => {
          console.log('Simulation done');
          setSimulating(false);
        },
        speed: 2.0, // Faster default speed
        cancelRef: newCancelRef
      });
    } else if (!simulating && cancelSimRef.current) {
      cancelSimRef.current.current = true;
    }
    
    return () => {
      cancelSimRef.current.current = true;
    };
  }, [simulating, cutSequence, simSpeed, selectCutIndex, setSimulating]);
  
  // Handle ESC key to stop simulation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSimulating(false);
        cancelSimRef.current.current = true;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSimulating]);

  // Drawing function (not memoized to ensure it rerenders)
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
    const trimTop = settings.trimTop ?? 10;
    const trimBottom = settings.trimBottom ?? 10;
    const trimLeft = settings.trimLeft ?? 10;
    const trimRight = settings.trimRight ?? 10;
    
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
    
    // 패널을 그리기 위해 다시 변환 적용 (치수 표기도 시트와 함께 움직이도록)
    // 이미 변환이 적용된 상태이므로 계속 진행
    
    // Draw dimensions - 시트와 함께 움직이고 크기도 같이 변경 (showDimensions가 true일 때만)
    if (showDimensions) {
      ctx.save();
      ctx.fillStyle = '#1f2937'; // 더 진한 색상으로 변경
      const fontSize = Math.max(32 * fontScale / scale, 24 * fontScale); // fontScale 적용
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      
      const dimOffset = 20 / (baseScale * scale); // 간격 줄임 (45 → 20)
      
      // 가로 모드일 때 (rotation === -90) 텍스트를 180도 회전
      if (rotation === -90) {
        // Top dimension (W 치수 - 1220) - 180도 회전
        ctx.save();
        ctx.translate(offsetX + result.stockPanel.width / 2, offsetY - dimOffset);
        ctx.rotate(Math.PI); // 180도 회전
        ctx.textBaseline = 'top';  // bottom을 top으로 변경하여 텍스트가 정상적으로 보이도록
        ctx.fillText(`${result.stockPanel.width}mm`, 0, 0);
        ctx.restore();
        
        // Left dimension (L 치수) - 90도 회전 (읽기 쉽게)
        ctx.save();
        ctx.translate(offsetX - dimOffset, offsetY + result.stockPanel.height / 2);
        ctx.rotate(Math.PI / 2); // 90도 회전
        ctx.textBaseline = 'middle';
        ctx.fillText(`${result.stockPanel.height}mm`, 0, 0);
        ctx.restore();
      } else {
        // 세로 모드일 때 (기본)
        // Top dimension
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          `${result.stockPanel.width}mm`,
          offsetX + result.stockPanel.width / 2,
          offsetY - dimOffset
        );
        
        // Left dimension (rotated)
        ctx.save();
        ctx.translate(offsetX - dimOffset, offsetY + result.stockPanel.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = 'middle';
        ctx.fillText(
          `${result.stockPanel.height}mm`,
          0, 0
        );
        ctx.restore();
      }
    
      ctx.restore();
    } // End of showDimensions for stock panel

    // Grid removed - no more grid lines

    // Material colors with theme integration
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme')
      .trim();
    
    // Use theme color for highlighted/active panels
    const materialColors: { [key: string]: { fill: string; stroke: string } } = {
      'PB': { fill: `hsl(${themeColor} / 0.08)`, stroke: `hsl(${themeColor} / 0.5)` },
      'MDF': { fill: '#e8d4b0', stroke: '#8b6239' }, // MDF 더 밝은 갈색으로 변경
      'PET': { fill: `hsl(${themeColor} / 0.15)`, stroke: `hsl(${themeColor} / 0.8)` },
      'PLY': { fill: '#f5e6d3', stroke: '#a68966' }, // 합판 더 밝은 나무색
      'HPL': { fill: `hsl(${themeColor} / 0.14)`, stroke: `hsl(${themeColor} / 0.8)` },
      'LPM': { fill: `hsl(${themeColor} / 0.16)`, stroke: `hsl(${themeColor} / 0.9)` }
    };

    // Draw panels (show progressively during simulation)
    result.panels.forEach((panel, panelIndex) => {
      // During simulation, hide panels initially and show them as they are cut
      if (simulating && cutSequence.length > 0) {
        // Check if this panel has been yielded by any completed cut
        let panelYielded = false;
        
        // Debug first panel
        if (panelIndex === 0 && currentCutIndex === 0) {
          console.log('Panel visibility check:', {
            panelId: panel.id,
            simulating,
            currentCutIndex,
            cutSequenceLength: cutSequence.length,
            allYieldIds: cutSequence.map(c => c.yieldsPanelId).filter(id => id)
          });
        }
        
        for (let i = 0; i <= currentCutIndex && i < cutSequence.length; i++) {
          if (cutSequence[i].yieldsPanelId === panel.id) {
            panelYielded = true;
            break;
          }
        }
        
        // If panel hasn't been yielded yet, skip drawing it completely
        if (!panelYielded) {
          return; // Skip this panel entirely
        }
        
        // Check if this panel is currently being cut (next to be yielded)
        const nextCut = currentCutIndex < cutSequence.length - 1 ? cutSequence[currentCutIndex + 1] : null;
        if (nextCut && nextCut.yieldsPanelId === panel.id) {
          ctx.globalAlpha = 0.5; // Show partial transparency for panel being cut
        }
      }
      
      const x = offsetX + panel.x;
      const y = offsetY + panel.y;
      // 회전된 경우에도 실제 차지하는 공간으로 그림
      const width = panel.rotated ? panel.height : panel.width;
      const height = panel.rotated ? panel.width : panel.height;

      const isHighlighted = highlightedPanelId && panel.id === highlightedPanelId;
      const isHovered = hoveredPanelId === panel.id;
      const colors = materialColors[panel.material] || { fill: '#f3f4f6', stroke: '#9ca3af' };

      // Draw panel background
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, width, height);
      
      // Draw panel border - clean and simple highlight
      if (isHighlighted) {
        // Simple, clean highlight with theme color
        ctx.strokeStyle = `hsl(${themeColor})`;
        ctx.lineWidth = 3 / (baseScale * scale);
        ctx.strokeRect(x, y, width, height);
        
        // Subtle inner glow
        ctx.save();
        ctx.fillStyle = `hsl(${themeColor} / 0.08)`;
        ctx.fillRect(x, y, width, height);
        ctx.restore();
      } else if (isHovered) {
        ctx.strokeStyle = `hsl(${themeColor} / 0.5)`;
        ctx.lineWidth = 2 / (baseScale * scale);
        ctx.strokeRect(x, y, width, height);
      } else {
        // Normal border
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1 / (baseScale * scale);
        ctx.strokeRect(x, y, width, height);
      }
      

      // Grain direction removed - no grain lines

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

      // Labels - 패널 이름을 중앙에, 치수는 가장자리에 표시
      if (showLabels && width > 20 && height > 20) {
        ctx.save();
        // Enable text anti-aliasing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 패널 중앙에 이름 표시
        if (panel.name) {
          ctx.save();
          // MDF는 갈색 배경이므로 더 진한 색상 사용
          ctx.fillStyle = panel.material === 'MDF' ? '#4a4a4a' : '#9ca3af';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // 패널 크기에 맞는 폰트 크기 계산
          const maxTextWidth = width * 0.8; // 패널 너비의 80%
          const maxTextHeight = height * 0.4; // 패널 높이의 40%로 증가
          let baseFontSize = 24; // 기본 폰트 크기
          let fontSize = Math.min(baseFontSize, maxTextHeight); // 패널 이름은 fontScale 적용 안 함
          
          // 가로 모드일 때 텍스트를 시계방향 90도 회전
          if (rotation === -90) {
            ctx.save();
            ctx.translate(x + width / 2, y + height / 2);
            ctx.rotate(Math.PI / 2); // 시계방향 90도 회전
            
            // 텍스트가 패널 크기에 맞도록 폰트 크기 조정
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            let textWidth = ctx.measureText(panel.name).width;
            
            // 회전된 상태에서 패널 높이가 텍스트 제한 너비가 됨
            const rotatedMaxWidth = height * 0.8;
            while (textWidth > rotatedMaxWidth && fontSize > 8) {
              fontSize -= 1;
              ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
              textWidth = ctx.measureText(panel.name).width;
            }
            
            ctx.fillText(panel.name, 0, 0);
            ctx.restore();
          } else {
            // 세로 모드
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            let nameWidth = ctx.measureText(panel.name).width;
            
            // 패널이 좁고 길면 텍스트를 회전시킴
            if (nameWidth > maxTextWidth && height > width) {
              // 세로로 긴 패널 - 텍스트를 90도 회전
              ctx.save();
              ctx.translate(x + width / 2, y + height / 2);
              ctx.rotate(-Math.PI / 2);
              
              // 회전된 상태에서 다시 크기 조정
              const rotatedMaxWidth = height * 0.8;
              while (nameWidth > rotatedMaxWidth && fontSize > 8) {
                fontSize -= 1;
                ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                nameWidth = ctx.measureText(panel.name).width;
              }
              
              ctx.fillText(panel.name, 0, 0);
              ctx.restore();
            } else {
              // 가로로 표시 - 텍스트가 패널 너비에 맞도록 조정
              while (nameWidth > maxTextWidth && fontSize > 8) {
                fontSize -= 1;
                ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                nameWidth = ctx.measureText(panel.name).width;
              }
              
              ctx.fillText(panel.name, x + width / 2, y + height / 2);
            }
          }
          ctx.restore();
        }
        
        // 치수 텍스트만 표시 (선 없이) - showDimensions가 true일 때만
        if (showDimensions) {
          ctx.save();
          // MDF는 갈색 배경이므로 치수도 더 진한 색상 사용
          ctx.fillStyle = panel.material === 'MDF' ? '#2c2c2c' : '#111827';
          const baseDimFontSize = 32; // 기본 치수 폰트 크기를 32로 증가
          const dimFontSize = baseDimFontSize * fontScale; // fontScale 적용
          ctx.font = `bold ${dimFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // L방향 치수 (패널 중앙 상단) - 항상 panel.width 표시
          if (width > 50) {
          const widthText = `${Math.round(panel.width)}`;
          const textY = y + 35; // 패널 상단에서 35px 아래
          
          // 치수 텍스트
          if (rotation === -90) {
            // 가로보기일 때 L방향은 180도 회전
            ctx.save();
            ctx.translate(x + width / 2, textY);
            ctx.rotate(Math.PI); // 180도 회전
            ctx.fillText(widthText, 0, 0);
            ctx.restore();
          } else {
            // 세로보기일 때는 그대로
            ctx.fillText(widthText, x + width / 2, textY);
          }
        }
        
        // W방향 치수 (패널 중앙 왼쪽) - 항상 panel.height 표시
        if (height > 50) {
          const heightText = `${Math.round(panel.height)}`;
          const textX = x + 35; // 패널 왼쪽에서 35px 오른쪽
          
          // 치수 텍스트
          ctx.save();
          ctx.translate(textX, y + height / 2);
          
          if (rotation === -90) {
            // 가로보기일 때 W방향은 시계방향 90도
            ctx.rotate(Math.PI / 2); // 시계방향 90도
          } else {
            // 세로보기일 때는 반시계방향 90도
            ctx.rotate(-Math.PI / 2);
          }
          
          ctx.fillText(heightText, 0, 0);
          ctx.restore();
        }
        
          ctx.restore();
        } // End of showDimensions check
        
        ctx.restore();
        ctx.globalAlpha = 1; // Reset transparency after drawing panel
      }
    });

    // Draw cutting line animation during simulation
    if (simulating && cutSequence.length > 0 && currentCutIndex < cutSequence.length) {
      const currentCut = cutSequence[currentCutIndex];
      
      // Draw all previous cuts as completed
      for (let i = 0; i < currentCutIndex; i++) {
        const cut = cutSequence[i];
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.lineWidth = 2 / (baseScale * scale);
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        if (cut.axis === 'x') {
          // Vertical cut
          ctx.moveTo(offsetX + cut.pos, offsetY + cut.spanStart);
          ctx.lineTo(offsetX + cut.pos, offsetY + cut.spanEnd);
        } else {
          // Horizontal cut
          ctx.moveTo(offsetX + cut.spanStart, offsetY + cut.pos);
          ctx.lineTo(offsetX + cut.spanEnd, offsetY + cut.pos);
        }
        ctx.stroke();
        ctx.restore();
      }
      
      // Draw current cut with animation
      ctx.save();
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3 / (baseScale * scale);
      ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
      ctx.shadowBlur = 10;
      
      // Animated dashed line
      const dashOffset = (Date.now() / 50) % 20;
      ctx.setLineDash([10, 10]);
      ctx.lineDashOffset = -dashOffset;
      
      ctx.beginPath();
      if (currentCut.axis === 'x') {
        // Vertical cut
        ctx.moveTo(offsetX + currentCut.pos, offsetY + currentCut.spanStart);
        ctx.lineTo(offsetX + currentCut.pos, offsetY + currentCut.spanEnd);
      } else {
        // Horizontal cut
        ctx.moveTo(offsetX + currentCut.spanStart, offsetY + currentCut.pos);
        ctx.lineTo(offsetX + currentCut.spanEnd, offsetY + currentCut.pos);
      }
      ctx.stroke();
      
      // Draw cutting direction indicator
      ctx.save();
      ctx.fillStyle = '#ff0000';
      ctx.font = `bold ${14 / (baseScale * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const cutMidX = currentCut.axis === 'x' 
        ? offsetX + currentCut.pos
        : offsetX + (currentCut.spanStart + currentCut.spanEnd) / 2;
      const cutMidY = currentCut.axis === 'y'
        ? offsetY + currentCut.pos  
        : offsetY + (currentCut.spanStart + currentCut.spanEnd) / 2;
      
      // Draw cut info
      ctx.fillText(
        `${currentCut.axis === 'x' ? '↕' : '↔'} ${currentCut.axis}=${Math.round(currentCut.pos)}`,
        cutMidX,
        cutMidY
      );
      ctx.restore();
      
      ctx.restore();
    }

    ctx.restore(); // Restore main transformation

    // Statistics badge and info - 회전과 관계없이 항상 정상 위치에
    const efficiency = result.efficiency.toFixed(1);
    const wasteArea = (result.wasteArea / 1000000).toFixed(2);
    
    // Efficiency badge - 우측 상단 모서리에 더 가깝게
    ctx.save();
    const badgeWidth = 70;
    const badgeHeight = 24;
    const badgeX = canvasWidth - badgeWidth - 10; // 우측에서 10px 여백만
    const badgeY = headerHeight + 10; // 헤더 아래 10px만
    
    // Badge background with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    
    const effColor = result.efficiency > 80 ? '#10b981' : 
                     result.efficiency > 60 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = effColor;
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
    ctx.fill();
    
    // Reset shadow for text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Badge text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${efficiency}%`, badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    ctx.restore();

    // Info text - 항상 좌측 하단
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    // Material info (moved from header)
    const materialInfo = `${result.stockPanel.material || 'PB'} ${result.stockPanel.thickness || 18}T`;
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText(materialInfo, 20, canvasHeight - 40);
    
    // Panel and waste info
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`Panels: ${result.panels.length}`, 20, canvasHeight - 25);
    ctx.fillText(`Waste: ${wasteArea} m²`, 20, canvasHeight - 10);
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

  // 시트가 변경될 때 항상 가로보기로 설정
  useEffect(() => {
    if (result && !externalRotation) { // 외부에서 rotation을 제어하지 않을 때만
      // 항상 가로보기(-90도)로 설정
      setInternalRotation(-90);
    }
  }, [result?.stockPanel.id]); // result의 id가 변경될 때만 실행

  // Call draw function when dependencies change
  useEffect(() => {
    draw();
  }, [result, highlightedPanelId, hoveredPanelId, showLabels, scale, offset, rotation, fontScale, showDimensions, simulating, currentCutIndex]);

  // Animation loop for simulation
  useEffect(() => {
    let animationId: number;
    
    const animate = () => {
      if (simulating) {
        draw();
        animationId = requestAnimationFrame(animate);
      }
    };
    
    if (simulating) {
      animate();
    }
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [simulating]);


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

  // Handle rotation - toggle between 0 and -90 degrees (반시계 방향)
  const handleRotate = () => {
    setRotation((prev) => prev === 0 ? -90 : 0); // Toggle between 0° and -90° (반시계)
    setOffset({ x: 0, y: 0 }); // Always reset to center on rotation
    setScale(1); // Reset scale to fit view
  };

  // Handle reset view
  const handleReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setRotation(-90); // 리셋 시에도 가로보기를 기본으로
  };

  // Handle fit to screen
  const handleFitToScreen = () => {
    if (!result || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height - 80; // 헤더바 높이 제외
    
    const padding = 40;
    const maxWidth = containerWidth - padding * 2;
    const maxHeight = containerHeight - padding * 2;
    
    // 현재 회전 상태에 따른 크기
    const rotatedWidth = rotation % 180 === 0 ? result.stockPanel.width : result.stockPanel.height;
    const rotatedHeight = rotation % 180 === 0 ? result.stockPanel.height : result.stockPanel.width;
    
    const scaleX = maxWidth / rotatedWidth;
    const scaleY = maxHeight / rotatedHeight;
    const fitScale = Math.min(scaleX, scaleY, 1);
    
    setScale(fitScale);
    setOffset({ x: 0, y: 0 });
  };

  // Handle zoom in
  const handleZoomIn = () => {
    const newScale = Math.min(scale * 1.2, 10);
    setScale(newScale);
  };

  // Handle zoom out
  const handleZoomOut = () => {
    const newScale = Math.max(scale * 0.8, 0.1);
    setScale(newScale);
  };
  
  // Handle font size increase
  const handleFontIncrease = () => {
    const newScale = Math.min(fontScale * 1.2, 3); // 최대 3배까지 확대 가능
    setFontScale(newScale);
  };
  
  // Handle font size decrease
  const handleFontDecrease = () => {
    const newScale = Math.max(fontScale * 0.8, 0.3); // 최소 0.3배까지 축소 가능
    setFontScale(newScale);
  };
  
  // Handle font size reset
  const handleFontReset = () => {
    setFontScale(1);
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
      {result && (
        <div className={styles.headerBar}>
          {/* 좌측: 시트 제목 및 네비게이션 */}
          <div className={styles.sheetNavSection}>
            <button 
              className={styles.headerNavButton}
              onClick={() => sheetInfo && sheetInfo.currentIndex > 0 && onCurrentSheetIndexChange?.(sheetInfo.currentIndex - 1)}
              disabled={!sheetInfo || sheetInfo.currentIndex === 0}
              title="이전 시트"
            >
              <ChevronLeft size={16} />
            </button>
            <div className={styles.sheetTitle}>
              Sheet {sheetInfo ? sheetInfo.currentIndex + 1 : 1} / {sheetInfo ? sheetInfo.totalSheets : 1}
            </div>
            <button 
              className={styles.headerNavButton}
              onClick={() => sheetInfo && sheetInfo.currentIndex < sheetInfo.totalSheets - 1 && onCurrentSheetIndexChange?.(sheetInfo.currentIndex + 1)}
              disabled={!sheetInfo || sheetInfo.currentIndex >= sheetInfo.totalSheets - 1}
              title="다음 시트"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          
          {/* 우측: 툴바 아이콘들 */}
          <div className={styles.headerToolbar}>
            {/* 줌 컨트롤 */}
            <button 
              className={styles.headerToolButton} 
              onClick={handleZoomOut}
              title="축소"
            >
              <ZoomOut size={16} />
            </button>
            <span className={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
            <button 
              className={styles.headerToolButton} 
              onClick={handleZoomIn}
              title="확대"
            >
              <ZoomIn size={16} />
            </button>
            
            <div className={styles.headerDivider} />
            
            {/* 뷰 컨트롤 */}
            <button 
              className={styles.headerToolButton} 
              onClick={handleReset}
              title="초기화"
            >
              <Home size={16} />
            </button>
            <button 
              className={styles.headerToolButton} 
              onClick={handleRotate}
              title="회전"
            >
              <RotateCw size={16} />
            </button>
            <button 
              className={`${styles.headerToolButton} ${showDimensions ? styles.active : ''}`}
              onClick={() => setShowDimensions(!showDimensions)}
              title="치수 표시"
            >
              <Ruler size={16} />
            </button>
            
            <div className={styles.headerDivider} />
            
            {/* 텍스트 크기 */}
            <div className={styles.textSizeControlSmall}>
              <button 
                className={styles.textSizeBtnSmall} 
                onClick={handleFontDecrease}
                title="글자 크기 줄이기"
              >
                <span className={styles.textLarge}>A</span>
                <span className={styles.textSmall}>A</span>
              </button>
              <button 
                className={styles.textSizeBtnSmall} 
                onClick={handleFontIncrease}
                title="글자 크기 키우기"
              >
                <span className={styles.textSmall}>A</span>
                <span className={styles.textLarge}>A</span>
              </button>
            </div>
            
            <div className={styles.headerDivider} />
            
            {/* 최적화 타입 */}
            <label className={styles.optimizationTypeLabel}>
              <input 
                type="radio" 
                name="optimizationType" 
                value="cnc"
                checked={settings.optimizationType === 'cnc'}
                onChange={() => setSettings({ optimizationType: 'cnc' })}
              />
              <span>Free Cut</span>
            </label>
            <label className={styles.optimizationTypeLabel}>
              <input 
                type="radio" 
                name="optimizationType" 
                value="cutsaw"
                checked={settings.optimizationType === 'cutsaw'}
                onChange={() => setSettings({ optimizationType: 'cutsaw' })}
              />
              <span>Guillotine</span>
            </label>
          </div>
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
      
      {/* Simulation Overlay - 컷팅 리스트 탭이 활성화되어 있을 때만 표시 */}
      {showCuttingListTab && ((selectedPanelId && cutSequence.length > 0) || selectedCutId) && (
        <div 
          className={styles.simulationOverlay}
          style={{
            position: 'absolute',
            top: sheetInfo ? '40px' : '0',
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          <svg 
            style={{ 
              width: '100%', 
              height: '100%',
              position: 'absolute'
            }}
          >
            {/* Render selected cut if not simulating */}
            {!simulating && selectedCutId && (() => {
              // Find the selected cut from allCutSteps  
              const currentSheetCuts = allCutSteps.filter(c => c.sheetNumber === (sheetInfo?.currentIndex || 0) + 1);
              const selectedCut = currentSheetCuts.find(c => c.id === selectedCutId);
              if (!selectedCut || !result || !containerRef.current) return null;
              
              const containerRect = containerRef.current.getBoundingClientRect();
              const containerWidth = containerRect.width;
              const containerHeight = containerRect.height - (sheetInfo ? 40 : 0);
              
              // Calculate scale and center
              const rotatedWidth = Math.abs(Math.cos((rotation * Math.PI) / 180)) * result.stockPanel.width +
                                 Math.abs(Math.sin((rotation * Math.PI) / 180)) * result.stockPanel.height;
              const rotatedHeight = Math.abs(Math.sin((rotation * Math.PI) / 180)) * result.stockPanel.width +
                                  Math.abs(Math.cos((rotation * Math.PI) / 180)) * result.stockPanel.height;
              
              const scaleX = containerWidth * 0.9 / rotatedWidth;
              const scaleY = containerHeight * 0.9 / rotatedHeight;
              const baseScale = Math.min(scaleX, scaleY, 1.2);
              const totalScale = baseScale * scale;
              
              const centerX = containerWidth / 2 + offset.x;
              const centerY = containerHeight / 2 + offset.y;
              
              // Transform cut coordinates with guaranteed span
              const angle = (rotation * Math.PI) / 180;
              
              let x1, y1, x2, y2;
              if (selectedCut.axis === 'x') {
                // Vertical line
                x1 = selectedCut.pos;
                y1 = selectedCut.spanStart != null ? selectedCut.spanStart : 0;
                x2 = selectedCut.pos;
                y2 = selectedCut.spanEnd != null ? selectedCut.spanEnd : result.stockPanel.height;
              } else {
                // Horizontal line
                x1 = selectedCut.spanStart != null ? selectedCut.spanStart : 0;
                y1 = selectedCut.pos;
                x2 = selectedCut.spanEnd != null ? selectedCut.spanEnd : result.stockPanel.width;
                y2 = selectedCut.pos;
              }
              
              // Clamp to sheet bounds
              x1 = Math.max(0, Math.min(result.stockPanel.width, x1));
              x2 = Math.max(0, Math.min(result.stockPanel.width, x2));
              y1 = Math.max(0, Math.min(result.stockPanel.height, y1));
              y2 = Math.max(0, Math.min(result.stockPanel.height, y2));
              
              // Transform to view coordinates
              const transform = (x: number, y: number) => {
                // Center the sheet
                const cx = x - result.stockPanel.width / 2;
                const cy = y - result.stockPanel.height / 2;
                
                // Apply rotation
                const rx = cx * Math.cos(angle) - cy * Math.sin(angle);
                const ry = cx * Math.sin(angle) + cy * Math.cos(angle);
                
                // Apply scale and offset
                return {
                  x: centerX + rx * totalScale,
                  y: centerY + ry * totalScale
                };
              };
              
              const p1 = transform(x1, y1);
              const p2 = transform(x2, y2);
              
              const strokeWidth = Math.max(2, (selectedCut.kerf || settings.kerf || 5) * totalScale);
              
              return (
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#FF4D4F"
                  strokeWidth={strokeWidth}
                  opacity={1.0}
                  strokeDasharray="5,5"
                  className={styles.animatedCut}
                />
              );
            })()}
            {/* Render simulation cuts */}
            {cutSequence.slice(0, currentCutIndex + 1).map((cut, index) => {
              if (!result || !containerRef.current) return null;
              
              const containerRect = containerRef.current.getBoundingClientRect();
              const containerWidth = containerRect.width;
              const containerHeight = containerRect.height - (sheetInfo ? 40 : 0);
              
              // Calculate scale and center
              const rotatedWidth = Math.abs(Math.cos((rotation * Math.PI) / 180)) * result.stockPanel.width +
                                 Math.abs(Math.sin((rotation * Math.PI) / 180)) * result.stockPanel.height;
              const rotatedHeight = Math.abs(Math.sin((rotation * Math.PI) / 180)) * result.stockPanel.width +
                                  Math.abs(Math.cos((rotation * Math.PI) / 180)) * result.stockPanel.height;
              
              const scaleX = containerWidth * 0.9 / rotatedWidth;
              const scaleY = containerHeight * 0.9 / rotatedHeight;
              const baseScale = Math.min(scaleX, scaleY, 1.2);
              const totalScale = baseScale * scale;
              
              const centerX = containerWidth / 2 + offset.x;
              const centerY = containerHeight / 2 + offset.y;
              
              // Transform cut coordinates
              const angle = (rotation * Math.PI) / 180;
              
              let x1, y1, x2, y2;
              if (cut.axis === 'x') {
                // Vertical line
                x1 = cut.pos;
                y1 = cut.spanStart;
                x2 = cut.pos;
                y2 = cut.spanEnd;
              } else {
                // Horizontal line
                x1 = cut.spanStart;
                y1 = cut.pos;
                x2 = cut.spanEnd;
                y2 = cut.pos;
              }
              
              // Transform to view coordinates
              const transform = (x: number, y: number) => {
                // Center the sheet
                const cx = x - result.stockPanel.width / 2;
                const cy = y - result.stockPanel.height / 2;
                
                // Apply rotation
                const rx = cx * Math.cos(angle) - cy * Math.sin(angle);
                const ry = cx * Math.sin(angle) + cy * Math.cos(angle);
                
                // Apply scale and offset
                return {
                  x: centerX + rx * totalScale,
                  y: centerY + ry * totalScale
                };
              };
              
              const p1 = transform(x1, y1);
              const p2 = transform(x2, y2);
              
              const isCurrentCut = index === currentCutIndex;
              const strokeWidth = Math.max(2, (cut.kerf || settings.kerf || 5) * totalScale);
              
              return (
                <line
                  key={cut.id}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#FF4D4F"
                  strokeWidth={strokeWidth}
                  opacity={isCurrentCut ? 1.0 : 0.35}
                  strokeDasharray={isCurrentCut ? "5,5" : "none"}
                  className={isCurrentCut ? styles.animatedCut : ''}
                />
              );
            })}
          </svg>
          
          {/* Highlight selected panel */}
          {(() => {
            const placement = placements.find(
              p => p.panelId === selectedPanelId && p.sheetId === String(sheetInfo?.currentIndex + 1 || 1)
            );
            if (!placement || !result || !containerRef.current) return null;
            
            const containerRect = containerRef.current.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height - (sheetInfo ? 40 : 0);
            
            const rotatedWidth = Math.abs(Math.cos((rotation * Math.PI) / 180)) * result.stockPanel.width +
                               Math.abs(Math.sin((rotation * Math.PI) / 180)) * result.stockPanel.height;
            const rotatedHeight = Math.abs(Math.sin((rotation * Math.PI) / 180)) * result.stockPanel.width +
                                Math.abs(Math.cos((rotation * Math.PI) / 180)) * result.stockPanel.height;
            
            const scaleX = containerWidth * 0.9 / rotatedWidth;
            const scaleY = containerHeight * 0.9 / rotatedHeight;
            const baseScale = Math.min(scaleX, scaleY, 1.2);
            const totalScale = baseScale * scale;
            
            const centerX = containerWidth / 2 + offset.x;
            const centerY = containerHeight / 2 + offset.y;
            const angle = (rotation * Math.PI) / 180;
            
            // Transform panel corners
            const transform = (x: number, y: number) => {
              const cx = x - result.stockPanel.width / 2;
              const cy = y - result.stockPanel.height / 2;
              const rx = cx * Math.cos(angle) - cy * Math.sin(angle);
              const ry = cx * Math.sin(angle) + cy * Math.cos(angle);
              return {
                x: centerX + rx * totalScale,
                y: centerY + ry * totalScale
              };
            };
            
            const tl = transform(placement.x, placement.y);
            const tr = transform(placement.x + placement.width, placement.y);
            const br = transform(placement.x + placement.width, placement.y + placement.height);
            const bl = transform(placement.x, placement.y + placement.height);
            
            return (
              <svg style={{ width: '100%', height: '100%', position: 'absolute' }}>
                <polygon
                  points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
                  fill="hsl(var(--theme))"
                  opacity={0.15}
                />
              </svg>
            );
          })()}
        </div>
      )}
      
      {/* Simulation Controls - 컷팅 리스트 탭이 활성화되어 있을 때만 표시 */}
      {showCuttingListTab && selectedPanelId && cutSequence.length > 0 && (
        <div className={styles.simulationControls}>
          <button 
            onClick={() => {
              setCurrentCutIndex(Math.max(0, currentCutIndex - 1));
              selectCutIndex(Math.max(0, currentCutIndex - 1));
            }}
            disabled={currentCutIndex === 0}
            title="이전 절단"
          >
            <SkipBack size={16} />
          </button>
          <button 
            onClick={() => setSimulating(!simulating)}
            className={styles.playButton}
            title={simulating ? "일시정지" : "재생"}
          >
            {simulating ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button 
            onClick={() => {
              setCurrentCutIndex(Math.min(cutSequence.length - 1, currentCutIndex + 1));
              selectCutIndex(Math.min(cutSequence.length - 1, currentCutIndex + 1));
            }}
            disabled={currentCutIndex >= cutSequence.length - 1}
            title="다음 절단"
          >
            <SkipForward size={16} />
          </button>
          <div className={styles.speedControl}>
            <label>속도: {simSpeed}x</label>
            <input 
              type="range" 
              min="0.25" 
              max="3" 
              step="0.25" 
              value={simSpeed}
              onChange={(e) => setSimSpeed(parseFloat(e.target.value))}
            />
          </div>
          <div className={styles.cutInfo}>
            {currentCutIndex + 1} / {cutSequence.length} 절단
          </div>
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