import React, { useEffect, useRef, useState, useCallback } from 'react';
import { OptimizedResult } from '../types';
import { ZoomIn, ZoomOut, RotateCw, Home, Maximize, Ruler, Type, ALargeSmall, ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward, Circle } from 'lucide-react';
import { useCNCStore } from '../store';
import { buildSequenceForPanel, generateGuillotineCuts, runSmoothSimulation } from '@/utils/cut/simulate';
import type { CutStep } from '@/types/cutlist';
import type { PanelBoringData, BoringType } from '@/domain/boring/types';
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
  // 보링 데이터
  boringData?: PanelBoringData[];
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
  allCutSteps = [],
  boringData = []
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

  // Toggle boring display
  const [showBorings, setShowBorings] = useState(false);
  
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
  const [cutProgress, setCutProgress] = useState(0); // 0-1: progress of current cut
  const [completedCuts, setCompletedCuts] = useState<number[]>([]); // indices of completed cuts
  const cancelSimRef = useRef({ current: false });
  const simulationStartedRef = useRef(false);
  const prevSimulatingRef = useRef(false);

  // Props refs for latest values in useEffect
  const resultRef = useRef(result);
  const allCutStepsRef = useRef(allCutSteps);
  const sheetInfoRef = useRef(sheetInfo);
  const selectedPanelIdRef = useRef(selectedPanelId);
  const settingsRef = useRef(settings);
  const simSpeedRef = useRef(simSpeed);

  // Update refs when props change
  useEffect(() => {
    resultRef.current = result;
    allCutStepsRef.current = allCutSteps;
    sheetInfoRef.current = sheetInfo;
    selectedPanelIdRef.current = selectedPanelId;
    settingsRef.current = settings;
    simSpeedRef.current = simSpeed;
  });

  // 시뮬레이션 시작/중지를 simulating 상태 변화에만 반응하도록 처리
  useEffect(() => {
    const wasSimulating = prevSimulatingRef.current;
    prevSimulatingRef.current = simulating;

    // simulating이 false로 변경되면 중지
    if (!simulating) {
      if (simulationStartedRef.current) {
        console.log('Stopping simulation');
        cancelSimRef.current.current = true;
        simulationStartedRef.current = false;
        setCutSequence([]);
        setCurrentCutIndex(0);
        setCutProgress(0);
        setCompletedCuts([]);
      }
      return;
    }

    // simulating이 true로 변경되었고, 아직 시작하지 않았으면 시작
    if (simulating && !wasSimulating && !simulationStartedRef.current) {
      // Use refs for latest values
      const currentResult = resultRef.current;
      const currentAllCutSteps = allCutStepsRef.current;
      const currentSheetInfo = sheetInfoRef.current;
      const currentSelectedPanelId = selectedPanelIdRef.current;
      const currentSettings = settingsRef.current;
      const currentSimSpeed = simSpeedRef.current;

      if (!currentResult || currentSelectedPanelId) {
        console.log('Cannot start simulation: no result or panel selected', {
          hasResult: !!currentResult,
          selectedPanelId: currentSelectedPanelId
        });
        setSimulating(false);
        return;
      }

      let cuts: CutStep[] = [];

      if (currentAllCutSteps && currentAllCutSteps.length > 0) {
        const currentSheetNumber = (currentSheetInfo?.currentIndex ?? 0) + 1;
        cuts = currentAllCutSteps.filter(cut => cut.sheetNumber === currentSheetNumber);
        console.log('Using allCutSteps:', cuts.length, 'cuts for sheet', currentSheetNumber, {
          optimizationType: currentSettings.optimizationType,
          firstCut: cuts[0] ? { axis: cuts[0].axis, label: cuts[0].label } : null
        });
      }

      if (cuts.length === 0 && currentResult.panels.length > 0) {
        console.log('Generating cuts from result panels:', currentResult.panels.length);

        if (currentSettings.optimizationType === 'OPTIMAL_CNC') {
          // Nesting/Free cut: 패널별로 따내기 방식
          let order = 0;
          currentResult.panels.forEach((panel) => {
            const panelCuts = buildSequenceForPanel({
              mode: 'free',
              sheetW: currentResult.stockPanel.width,
              sheetH: currentResult.stockPanel.height,
              kerf: currentSettings.kerf || 5,
              placement: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
              sheetId: '1',
              panelId: panel.id
            });
            panelCuts.forEach((cut, idx) => {
              cuts.push({ ...cut, id: `gen_${panel.id}_${idx}`, globalOrder: ++order });
            });
          });
        } else {
          // BY_LENGTH / BY_WIDTH: 기요틴 재단 방식
          // 전체 시트에서 고유한 재단 위치만 사용 (중복 없음)
          const panelPlacements = currentResult.panels.map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            rotated: p.rotated
          }));

          const guillotineCuts = generateGuillotineCuts(
            currentResult.stockPanel.width,
            currentResult.stockPanel.height,
            panelPlacements,
            currentSettings.kerf || 5,
            currentSettings.optimizationType
          );

          guillotineCuts.forEach((cut, idx) => {
            cuts.push({ ...cut, id: `guillotine_${idx}`, globalOrder: idx + 1, sheetId: '1' });
          });
        }
      }

      if (cuts.length === 0) {
        console.log('No cuts to simulate');
        setSimulating(false);
        return;
      }

      // 시뮬레이션 시작
      simulationStartedRef.current = true;
      setCutSequence(cuts);
      setCurrentCutIndex(0);
      setCutProgress(0);
      setCompletedCuts([]);

      // 기존 취소 ref 취소 및 새로 생성
      cancelSimRef.current.current = true;
      const newCancelRef = { current: false };
      cancelSimRef.current = newCancelRef;

      console.log('Starting smooth simulation with', cuts.length, 'cuts');

      // 톱날 속도: mm/s (속도 조절 가능)
      const sawSpeed = (currentSimSpeed || 1) * 2000; // 기본 2000mm/s, 속도 배율 적용

      runSmoothSimulation(cuts, {
        onProgress: (cutIndex, progress) => {
          if (newCancelRef.current) return;
          setCurrentCutIndex(cutIndex);
          setCutProgress(progress);
        },
        onCutComplete: (cutIndex) => {
          if (newCancelRef.current) return;
          setCompletedCuts(prev => [...prev, cutIndex]);
          selectCutIndex(cutIndex);
        },
        onDone: () => {
          console.log('Simulation completed');
          simulationStartedRef.current = false;
          // 재단선 유지 - 모든 재단을 완료 상태로 설정
          setCompletedCuts(cuts.map((_, idx) => idx));
          setCutProgress(1);
          setSimulating(false);
        },
        speed: sawSpeed,
        cancelRef: newCancelRef
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating]);
  
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

  // Ref for the latest draw function (to avoid stale closure in animation loop)
  const drawRef = useRef<() => void>(() => {});

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
      'PET': { fill: '#d1d5db', stroke: '#6b7280' }, // PET 그레이색으로 변경
      'PLY': { fill: '#f5e6d3', stroke: '#a68966' }, // 합판 더 밝은 나무색
      'HPL': { fill: `hsl(${themeColor} / 0.14)`, stroke: `hsl(${themeColor} / 0.8)` },
      'LPM': { fill: `hsl(${themeColor} / 0.16)`, stroke: `hsl(${themeColor} / 0.9)` }
    };

    // 보링 타입별 색상
    const boringColors: { [key: string]: { fill: string; stroke: string } } = {
      'hinge-cup': { fill: 'rgba(239, 68, 68, 0.3)', stroke: '#ef4444' },      // 빨강 - 힌지컵 Ø35
      'hinge-screw': { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#f87171' },    // 연빨강 - 힌지나사
      'cam-housing': { fill: 'rgba(59, 130, 246, 0.3)', stroke: '#3b82f6' },   // 파랑 - 캠하우징 Ø15
      'cam-bolt': { fill: 'rgba(59, 130, 246, 0.2)', stroke: '#60a5fa' },      // 연파랑 - 캠볼트
      'shelf-pin': { fill: 'rgba(34, 197, 94, 0.3)', stroke: '#22c55e' },      // 초록 - 선반핀 Ø5
      'adjustable-foot': { fill: 'rgba(168, 85, 247, 0.3)', stroke: '#a855f7' }, // 보라 - 조절발
      'drawer-rail': { fill: 'rgba(249, 115, 22, 0.3)', stroke: '#f97316' },   // 주황 - 서랍레일
      'drawer-rail-slot': { fill: 'rgba(249, 115, 22, 0.2)', stroke: '#fb923c' }, // 연주황 - 레일장공
      'custom': { fill: 'rgba(107, 114, 128, 0.3)', stroke: '#6b7280' }        // 회색 - 사용자정의
    };

    // Count visible panels during simulation
    let visiblePanelCount = 0;

    // 디버그: 패널 및 재단 정보 로그
    if (simulating && cutSequence.length > 0) {
      console.log('📦 패널 정보:', result.panels.map(p => ({
        id: p.id,
        name: p.name,
        x: p.x, y: p.y, w: p.width, h: p.height
      })));
      console.log('✂️ 재단 정보:', cutSequence.map((c, i) => ({
        idx: i,
        axis: c.axis,
        pos: c.pos,
        span: `${c.spanStart ?? 0}-${c.spanEnd ?? '?'}`,
        completed: completedCuts.includes(i)
      })));
    }

    // Draw panels (show progressively during simulation)
    result.panels.forEach((panel, panelIndex) => {
      // During simulation, show panels after all surrounding cuts are completed
      let isPanelSeparated = false;
      let justSeparated = false;

      // 시뮬레이션 중이거나 재단이 진행된 경우 패널 분리 체크
      if (simulating || completedCuts.length > 0) {
        if (cutSequence.length === 0) {
          return; // Hide all panels if no cuts
        }

        const kerf = settings.kerf || 5;
        const sheetW = result.stockPanel.width;
        const sheetH = result.stockPanel.height;

        // 패널이 분리되려면 4개 경계가 모두 재단되어야 함 (시트 가장자리는 제외)
        // 각 경계에 해당하는 재단이 completedCuts에 있는지 확인
        const tolerance = kerf * 3; // 위치 비교 허용 오차

        // 필요한 재단 체크
        const needsTopCut = panel.y > tolerance;
        const needsBottomCut = panel.y + panel.height < sheetH - tolerance;
        const needsLeftCut = panel.x > tolerance;
        const needsRightCut = panel.x + panel.width < sheetW - tolerance;

        // 각 경계를 만족시키는 가장 빠른 재단 인덱스 찾기
        // 패널이 분리되는 시점 = 4개 경계 중 가장 늦게 완료되는 재단
        const findCutIndex = (axis: 'x' | 'y', pos: number, isXSpan: boolean): number => {
          for (let i = 0; i < cutSequence.length; i++) {
            const cut = cutSequence[i];
            if (!cut || cut.axis !== axis || Math.abs(cut.pos - pos) >= tolerance) continue;
            const spanStart = cut.spanStart ?? 0;
            const spanEnd = cut.spanEnd ?? (isXSpan ? sheetW : sheetH);
            if (isXSpan) {
              if (spanStart <= panel.x + tolerance && spanEnd >= panel.x + panel.width - tolerance) return i;
            } else {
              if (spanStart <= panel.y + tolerance && spanEnd >= panel.y + panel.height - tolerance) return i;
            }
          }
          return -1;
        };

        // 각 경계에 필요한 재단 인덱스 (-1: 필요없음 또는 아직 없음)
        const topCutIdx = needsTopCut ? findCutIndex('y', panel.y, true) : -1;
        const bottomCutIdx = needsBottomCut ? findCutIndex('y', panel.y + panel.height, true) : -1;
        const leftCutIdx = needsLeftCut ? findCutIndex('x', panel.x, false) : -1;
        const rightCutIdx = needsRightCut ? findCutIndex('x', panel.x + panel.width, false) : -1;

        // 필요한 재단 중 가장 늦은 인덱스 = 패널이 분리되는 시점
        const requiredCuts = [
          needsTopCut ? topCutIdx : -2,
          needsBottomCut ? bottomCutIdx : -2,
          needsLeftCut ? leftCutIdx : -2,
          needsRightCut ? rightCutIdx : -2
        ].filter(idx => idx !== -2); // -2는 필요없는 경계

        // 모든 필요한 재단이 존재하고, 완료되었는지 확인
        const allCutsExist = requiredCuts.every(idx => idx >= 0);
        const lastRequiredCutIdx = allCutsExist ? Math.max(...requiredCuts) : -1;

        // 패널이 분리되려면 마지막 필요 재단까지 완료되어야 함
        isPanelSeparated = allCutsExist && completedCuts.includes(lastRequiredCutIdx);

        // 디버그: 각 패널의 분리 상태
        console.log(`🔍 패널 ${panel.name || panel.id}:`, {
          pos: { x: panel.x, y: panel.y, w: panel.width, h: panel.height },
          needs: { top: needsTopCut, bottom: needsBottomCut, left: needsLeftCut, right: needsRightCut },
          cutIdx: { top: topCutIdx, bottom: bottomCutIdx, left: leftCutIdx, right: rightCutIdx },
          requiredCuts,
          lastRequiredCutIdx,
          allCutsExist,
          completedCutsIncludes: lastRequiredCutIdx >= 0 ? completedCuts.includes(lastRequiredCutIdx) : false,
          isPanelSeparated
        });

        // 방금 분리되었는지 확인 (마지막 완료된 재단이 이 패널의 마지막 필요 재단인지)
        if (isPanelSeparated && completedCuts.length > 0) {
          const lastCompletedIdx = completedCuts[completedCuts.length - 1];
          // 마지막 완료된 재단이 이 패널의 마지막 필요 재단이면 방금 분리된 것
          justSeparated = lastCompletedIdx === lastRequiredCutIdx;
        }

        if (!isPanelSeparated) {
          return; // 패널이 아직 분리되지 않음 - 숨김
        }

        visiblePanelCount++;

        if (justSeparated) {
          // 방금 분리된 패널 - 강조 효과
          ctx.globalAlpha = 0.95;
          ctx.shadowColor = `hsl(${themeColor})`;
          ctx.shadowBlur = 30;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
      } else {
        visiblePanelCount++;
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
        // Simple, clean highlight with theme color for border only
        ctx.strokeStyle = `hsl(${themeColor})`;
        ctx.lineWidth = 3 / (baseScale * scale);
        ctx.strokeRect(x, y, width, height);
        
        // Subtle inner glow - skip for MDF to preserve its color
        if (panel.material !== 'MDF') {
          ctx.save();
          ctx.fillStyle = `hsl(${themeColor} / 0.08)`;
          ctx.fillRect(x, y, width, height);
          ctx.restore();
        }
      } else if (isHovered) {
        ctx.strokeStyle = panel.material === 'MDF' ? '#8b6239' : `hsl(${themeColor} / 0.5)`;
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
          const baseFontSize = 24; // 기본 폰트 크기
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

        ctx.restore(); // Restore labels save (line 583)
      } // End of showLabels check

      // 보링 표시 (showLabels와 독립적으로 표시)
      if (showBorings && boringData && boringData.length > 0) {
        // 패널 이름 정규화 함수 - 다양한 형식을 통일된 키로 변환
        const normalizePanelName = (name: string): string => {
          if (!name) return '';
          // (상), (하) 접두사 제거
          let normalized = name.replace(/^\([상하]\)/, '');
          // 패널 타입 추출 및 정규화
          if (normalized.includes('좌측') || normalized === '좌측판') return 'side-left';
          if (normalized.includes('우측') || normalized === '우측판') return 'side-right';
          if (normalized.includes('바닥') || normalized === '하판') return 'bottom';
          if (normalized.includes('상판')) return 'top';
          if (normalized.includes('도어')) return 'door';
          if (normalized.includes('백패널') || normalized.includes('뒷판')) return 'back';
          if (normalized.includes('서랍전판')) return 'drawer-front';
          return normalized.toLowerCase();
        };

        // 정규화된 이름으로 매칭 (크기도 함께 확인)
        const normalizedCncName = normalizePanelName(panel.name);

        // 이름이 같은 후보들 먼저 필터
        const candidates = boringData.filter(b => {
          const normalizedBoringName = normalizePanelName(b.panelName);
          return normalizedCncName === normalizedBoringName ||
            b.panelName === panel.name ||
            b.panelId === panel.id;
        });

        // 후보 중 크기가 가장 가까운 것 선택
        let panelBorings = candidates[0];
        if (candidates.length > 1) {
          // 크기 차이로 정렬하여 가장 가까운 것 선택
          const tolerance = 5; // 5mm 허용 오차
          panelBorings = candidates.find(b =>
            Math.abs(b.width - panel.width) <= tolerance &&
            Math.abs(b.height - panel.height) <= tolerance
          ) || candidates.reduce((best, current) => {
            const bestDiff = Math.abs(best.width - panel.width) + Math.abs(best.height - panel.height);
            const currDiff = Math.abs(current.width - panel.width) + Math.abs(current.height - panel.height);
            return currDiff < bestDiff ? current : best;
          });
        }

        if (panelBorings && panelBorings.borings && panelBorings.borings.length > 0) {
          ctx.save();

          panelBorings.borings.forEach(boring => {
            const boringColor = boringColors[boring.type] || boringColors['custom'];

            // 보링 위치 계산 (패널 좌표 기준)
            // 패널이 회전되었는지 확인하고 좌표 변환
            let boringX = x + boring.x;
            let boringY = y + boring.y;

            // 패널이 회전된 경우 보링 좌표도 회전
            if (panel.rotated) {
              // 90도 회전: (x, y) -> (height - y, x)
              boringX = x + (panel.height - boring.y);
              boringY = y + boring.x;
            }

            // 장공(슬롯) 처리
            if (boring.type === 'drawer-rail-slot' && boring.slotWidth && boring.slotHeight) {
              // 장공은 둥근 사각형으로 그리기
              const slotW = boring.slotWidth;
              const slotH = boring.slotHeight;
              const radius = Math.min(slotW, slotH) / 2;

              ctx.fillStyle = boringColor.fill;
              ctx.strokeStyle = boringColor.stroke;
              ctx.lineWidth = 1 / (baseScale * scale);

              // 둥근 사각형 그리기
              ctx.beginPath();
              ctx.roundRect(
                boringX - slotW / 2,
                boringY - slotH / 2,
                slotW,
                slotH,
                radius
              );
              ctx.fill();
              ctx.stroke();
            } else {
              // 원형 보링
              const radius = boring.diameter / 2;

              ctx.fillStyle = boringColor.fill;
              ctx.strokeStyle = boringColor.stroke;
              ctx.lineWidth = 1 / (baseScale * scale);

              ctx.beginPath();
              ctx.arc(boringX, boringY, radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              // 큰 보링(힌지컵 등)에는 십자선 추가
              if (boring.diameter >= 15) {
                ctx.beginPath();
                ctx.moveTo(boringX - radius * 0.7, boringY);
                ctx.lineTo(boringX + radius * 0.7, boringY);
                ctx.moveTo(boringX, boringY - radius * 0.7);
                ctx.lineTo(boringX, boringY + radius * 0.7);
                ctx.stroke();
              }
            }
          });

          ctx.restore();
        }
      }

      // Reset shadow and transparency effects
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1; // Reset transparency after drawing panel
    });
    
    // Log visible panel count during simulation
    if (simulating && currentCutIndex % 4 === 0) { // Log every 4 cuts
      console.log(`Cut ${currentCutIndex}: ${visiblePanelCount}/${result.panels.length} panels visible`);
    }

    // Draw cutting lines - 시뮬레이션 중이거나 완료 후에도 표시
    if (cutSequence.length > 0) {
      // kerf는 실제 mm 단위 - 줌에 따라 스케일 적용됨 (좌표계가 이미 mm 단위)
      const kerfWidth = settings.kerf || 5;

      // Draw all completed cuts (full line, faded) with cut number at end
      // L방향 (axis 'x', 세로선) = 빨간색, W방향 (axis 'y', 가로선) = 파란색
      completedCuts.forEach(cutIdx => {
        const cut = cutSequence[cutIdx];
        if (!cut) return;

        const isLDirection = cut.axis === 'x'; // L방향 = 세로 재단
        const cutColor = isLDirection ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 100, 255, 0.5)';
        const badgeColor = isLDirection ? 'rgba(255, 50, 0, 0.85)' : 'rgba(0, 100, 255, 0.85)';

        ctx.save();
        ctx.strokeStyle = cutColor;
        ctx.lineWidth = kerfWidth;
        ctx.setLineDash([]);

        let endX, endY;
        ctx.beginPath();
        if (cut.axis === 'x') {
          ctx.moveTo(offsetX + cut.pos, offsetY + cut.spanStart);
          ctx.lineTo(offsetX + cut.pos, offsetY + cut.spanEnd);
          endX = offsetX + cut.pos;
          endY = offsetY + cut.spanEnd;
        } else {
          ctx.moveTo(offsetX + cut.spanStart, offsetY + cut.pos);
          ctx.lineTo(offsetX + cut.spanEnd, offsetY + cut.pos);
          endX = offsetX + cut.spanEnd;
          endY = offsetY + cut.pos;
        }
        ctx.stroke();

        // Draw cut number at the end of the cut line
        const numberRadius = Math.max(kerfWidth * 2, 20);
        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        ctx.arc(endX, endY, numberRadius, 0, Math.PI * 2);
        ctx.fill();

        // Cut number text
        ctx.fillStyle = '#ffffff';
        const fontSize = Math.max(numberRadius * 0.8, 14);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${cutIdx + 1}`, endX, endY);

        ctx.restore();
      });

      // Draw current cut with progress animation (saw blade moving) - 시뮬레이션 중에만
      if (simulating && currentCutIndex < cutSequence.length && cutProgress < 1) {
        const currentCut = cutSequence[currentCutIndex];
        const progress = cutProgress; // 0 to 1

        // Calculate current blade position based on progress
        let startX, startY, currentX, currentY, endX, endY;

        if (currentCut.axis === 'x') {
          // Vertical cut (top to bottom)
          startX = offsetX + currentCut.pos;
          startY = offsetY + currentCut.spanStart;
          endY = offsetY + currentCut.spanEnd;
          currentX = startX;
          currentY = startY + (endY - startY) * progress;
          endX = startX;
        } else {
          // Horizontal cut (left to right)
          startX = offsetX + currentCut.spanStart;
          startY = offsetY + currentCut.pos;
          endX = offsetX + currentCut.spanEnd;
          currentX = startX + (endX - startX) * progress;
          currentY = startY;
          endY = startY;
        }

        // L방향 (axis 'x') = 빨간색, W방향 (axis 'y') = 파란색
        const isLDirection = currentCut.axis === 'x';
        const currentCutColor = isLDirection ? '#ff0000' : '#0064ff';
        const currentCutColorFaded = isLDirection ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 100, 255, 0.2)';

        // Draw the cut line up to current position (already cut part)
        ctx.save();
        ctx.strokeStyle = currentCutColor;
        ctx.lineWidth = kerfWidth;
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        ctx.restore();

        // Draw remaining cut line (not yet cut, dashed and lighter)
        ctx.save();
        ctx.strokeStyle = currentCutColorFaded;
        ctx.lineWidth = kerfWidth * 0.5;
        ctx.setLineDash([20, 10]); // 20mm dash, 10mm gap (mm units)

        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        if (currentCut.axis === 'x') {
          ctx.lineTo(endX, endY);
        } else {
          ctx.lineTo(endX, endY);
        }
        ctx.stroke();
        ctx.restore();

        // Draw saw blade indicator at current position
        ctx.save();
        // 톱날 반지름 = kerf의 3배 정도로 시각적으로 표현 (실제 톱날은 더 크지만 kerf만큼만 자름)
        const bladeRadius = Math.max(kerfWidth * 3, 30); // 최소 30mm

        // L방향 = 빨간색, W방향 = 파란색
        const bladeGlowColor = isLDirection ? 'rgba(255, 50, 0, 0.8)' : 'rgba(0, 100, 255, 0.8)';
        const bladeRingColor = isLDirection ? 'rgba(255, 80, 0, 0.9)' : 'rgba(0, 120, 255, 0.9)';
        const bladeTeethColor = isLDirection ? '#ff3300' : '#0064ff';

        // Blade glow effect
        ctx.shadowColor = bladeGlowColor;
        ctx.shadowBlur = 15 / (baseScale * scale); // 글로우는 화면 픽셀 기준

        // Rotating blade animation
        const rotationAngle = (Date.now() / 30) % (Math.PI * 2);

        // Draw blade circle (outer ring)
        ctx.strokeStyle = bladeRingColor;
        ctx.lineWidth = kerfWidth;
        ctx.beginPath();
        ctx.arc(currentX, currentY, bladeRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw blade teeth (rotating)
        ctx.strokeStyle = bladeTeethColor;
        ctx.lineWidth = kerfWidth * 0.8;
        const teethCount = 12;
        for (let i = 0; i < teethCount; i++) {
          const angle = rotationAngle + (i * Math.PI * 2) / teethCount;
          ctx.beginPath();
          ctx.moveTo(
            currentX + Math.cos(angle) * bladeRadius * 0.5,
            currentY + Math.sin(angle) * bladeRadius * 0.5
          );
          ctx.lineTo(
            currentX + Math.cos(angle) * bladeRadius,
            currentY + Math.sin(angle) * bladeRadius
          );
          ctx.stroke();
        }

        // Draw center hole
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(currentX, currentY, bladeRadius * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Draw progress info (outside of transformation for consistent text size)
        ctx.save();
        ctx.fillStyle = isLDirection ? '#ff3300' : '#0064ff';
        const fontSize = 14 / (baseScale * scale);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          `${currentCutIndex + 1}/${cutSequence.length} (${Math.round(progress * 100)}%)`,
          currentX,
          currentY - bladeRadius - 10
        );
        ctx.restore();
      }
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

  // 시트가 변경될 때 항상 가로보기로 설정하고 시뮬레이션 상태 초기화
  useEffect(() => {
    if (result && !externalRotation) { // 외부에서 rotation을 제어하지 않을 때만
      // 항상 가로보기(-90도)로 설정
      setInternalRotation(-90);
    }

    // 시트 변경 시 시뮬레이션 상태 초기화
    cancelSimRef.current.current = true; // 진행 중인 시뮬레이션 취소
    simulationStartedRef.current = false;
    setCutSequence([]);
    setCurrentCutIndex(0);
    setCutProgress(0);
    setCompletedCuts([]);
    setSimulating(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.stockPanel.id, sheetInfo?.currentIndex]); // result의 id 또는 시트 인덱스가 변경될 때 실행

  // Update drawRef to latest draw function
  useEffect(() => {
    drawRef.current = draw;
  });

  // Call draw function when dependencies change
  useEffect(() => {
    draw();
  }, [result, highlightedPanelId, hoveredPanelId, showLabels, scale, offset, rotation, fontScale, showDimensions, showBorings, boringData, simulating, currentCutIndex]);

  // Animation loop for simulation - uses drawRef to always call latest draw
  useEffect(() => {
    let animationId: number;
    let isRunning = true;

    const animate = () => {
      if (!isRunning) return;
      if (simulating) {
        drawRef.current(); // Call latest draw function via ref
        animationId = requestAnimationFrame(animate);
      }
    };

    if (simulating) {
      console.log('Animation loop started');
      animate();
    }

    return () => {
      isRunning = false;
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

  // 고정된 줌 레벨 단계
  const zoomLevels = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];
  
  // Handle zoom in - 다음 줌 레벨로 이동
  const handleZoomIn = () => {
    const currentIndex = zoomLevels.findIndex(level => level >= scale);
    const nextIndex = Math.min(currentIndex + 1, zoomLevels.length - 1);
    setScale(zoomLevels[nextIndex]);
  };

  // Handle zoom out - 이전 줌 레벨로 이동
  const handleZoomOut = () => {
    const currentIndex = zoomLevels.findIndex(level => level >= scale);
    const prevIndex = Math.max(currentIndex - 1, 0);
    setScale(zoomLevels[prevIndex]);
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
            <button
              className={`${styles.headerToolButton} ${showBorings ? styles.active : ''}`}
              onClick={() => setShowBorings(!showBorings)}
              title="보링 표시"
              disabled={!boringData || boringData.length === 0}
            >
              <Circle size={16} />
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