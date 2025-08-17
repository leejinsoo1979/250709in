import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { CNCProvider, useCNCStore } from './store';
import { useLivePanelData } from './hooks/useLivePanelData';
import { useProjectStore } from '@/store/core/projectStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Zap, Play, Pause, ChevronDown, ChevronRight } from 'lucide-react';
import Logo from '@/components/common/Logo';
import { setThemeColor } from '@/theme';

// Components
import PanelsTable from './components/SidebarLeft/PanelsTable';
import StockTable from './components/SidebarLeft/StockTable';
import OptionsCard from './components/SidebarLeft/OptionsCard';
import ExportBar from './components/ExportBar';
import CuttingLayoutPreview2 from './components/CuttingLayoutPreview2';
import SheetThumbnail from './components/SheetThumbnail';

// Utils
import { optimizePanelsMultiple } from './utils/optimizer';
import { showToast } from '@/utils/cutlist/csv';
import { buildSequenceForPanel } from '@/utils/cut/simulate';
import { formatSize } from '@/utils/cut/format';
import { computeSawStats } from '@/utils/cut/stats';
import type { Panel, StockSheet, Placement } from '../../types/cutlist';
import { OptimizedResult, PlacedPanel } from './types';

// Styles
import styles from './CNCOptimizerPro.module.css';

function PageInner(){
  const navigate = useNavigate();
  const { basicInfo } = useProjectStore();
  const { panels: livePanels } = useLivePanelData();
  
  const { 
    panels, setPanels, 
    stock, setStock, 
    settings,
    selectedPanelId, setSelectedPanelId,
    currentSheetIndex, setCurrentSheetIndex,
    setPlacements, selectPanel,
    simulating, setSimulating, simSpeed, setSimSpeed,
    selectedCutIndex, selectCutIndex,
    selectedCutId, selectCutId, setSelectedSheetId,
    sawStats, setSawStats
  } = useCNCStore();
  
  const [optimizationResults, setOptimizationResults] = useState<OptimizedResult[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const optimizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 뷰어 상태 (미리보기와 동기화)
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerRotation, setViewerRotation] = useState(-90); // 기본값 -90 (가로뷰)
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 });
  const [showCuttingList, setShowCuttingList] = useState(true); // 컷팅 리스트 탭 기본 선택
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set()); // 펼쳐진 시트 인덱스들


  // Handle ESC key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPanelId(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      // Clear selection when clicking outside of panels
      const target = e.target as HTMLElement;
      if (!target.closest('.panel-clickable')) {
        setSelectedPanelId(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [setSelectedPanelId]);

  // Initialize with live data - only run once on mount or when livePanels changes
  useEffect(() => {
    // Convert live panels to CutList format
    if (livePanels.length > 0) {
      
      const cutlistPanels: Panel[] = livePanels.map(p => {
        // 패널의 긴 방향을 L(세로) 방향으로 배치
        // 긴 쪽이 length가 되도록 설정
        let width = p.width;
        let length = p.height;
        
        // 가로가 더 길면 회전시켜서 세로가 더 길게 만들기
        if (width > length) {
          width = p.height;
          length = p.width;
        }
        
        // 결방향은 항상 세로(V)로 설정 - 긴 방향이 결방향
        let grain = 'V'; // 세로 결방향 (긴 방향)
        
        // 도어와 엔드패널은 자동으로 PET 재질로 설정
        let material = p.material || 'PB';
        const panelName = (p.name || '').toLowerCase();
        if (panelName.includes('도어') || panelName.includes('door') || 
            panelName.includes('엔드') || panelName.includes('end')) {
          material = 'PET';
        }
        
        return {
          id: p.id,
          label: p.name || `Panel_${p.id}`,
          width: width,   // 짧은 쪽
          length: length, // 긴 쪽
          thickness: p.thickness || 18,
          quantity: p.quantity || 1,
          material: material,
          grain: grain,
          canRotate: false // 결방향이 있으므로 회전 불가
        };
      });
      
      setPanels(cutlistPanels);
    } else if (livePanels.length === 0 && panels.length === 0) {
      // 테스트용 패널 추가 (live panels가 없고 panels도 비어있을 때만)
      const testPanels: Panel[] = [
        { id: '1', label: 'Panel_1', width: 600, length: 800, thickness: 18, quantity: 2, material: 'PB', grain: 'V' },
        { id: '2', label: 'Panel_2', width: 450, length: 600, thickness: 18, quantity: 3, material: 'PB', grain: 'V' },
        { id: '3', label: 'Panel_3', width: 300, length: 400, thickness: 18, quantity: 4, material: 'MDF', grain: 'V' },
        { id: '4', label: 'Panel_4', width: 800, length: 1000, thickness: 18, quantity: 1, material: 'MDF', grain: 'V' },
        { id: '5', label: 'Panel_5', width: 550, length: 750, thickness: 18, quantity: 2, material: 'PB', grain: 'V' },
      ];
      setPanels(testPanels);
    }

    // Initialize default stock if empty
    if (stock.length === 0) {
      const defaultStock: StockSheet[] = [
        // 18mm PB (파티클보드) - 가구 본체용
        {
          label: 'PB_18T_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 18,
          quantity: 999,
          material: 'PB'
        },
        // 18mm PET - 도어 및 엔드패널용
        {
          label: 'PET_18T_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 18,
          quantity: 999,
          material: 'PET'
        },
        // 18mm MDF - 일반용
        {
          label: 'MDF_18T_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 18,
          quantity: 999,
          material: 'MDF'
        },
        // 15mm PB - 서랍용
        {
          label: 'PB_15T_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 15,
          quantity: 999,
          material: 'PB'
        },
        // 9mm MDF - 뒷판용
        {
          label: 'MDF_9T_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 9,
          quantity: 999,
          material: 'MDF'
        },
        // 5mm MDF - 서랍 바닥용
        {
          label: 'MDF_5T_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 5,
          quantity: 999,
          material: 'MDF'
        }
      ];
      setStock(defaultStock);
    }

    // Set theme color and CSS variables for Logo
    const theme = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme')
      .trim();
    if (theme) {
      setThemeColor(`hsl(${theme})`);
      // Set CSS variable for Logo component
      document.documentElement.style.setProperty('--theme-primary', `hsl(${theme})`);
    }
  }, [livePanels, setPanels, setStock]); // setPanels and setStock are stable from store

  // Auto-optimize when data changes with debouncing - DISABLED to prevent infinite loop
  // Uncomment below to enable auto-optimization (but fix the infinite loop first)
  /*
  useEffect(() => {
    if (panels.length > 0 && stock.length > 0) {
      // Clear previous timeout
      if (optimizeTimeoutRef.current) {
        clearTimeout(optimizeTimeoutRef.current);
      }
      
      // Set new timeout for optimization (debounce 500ms)
      optimizeTimeoutRef.current = setTimeout(() => {
        handleOptimize();
      }, 500);
    }
    
    // Cleanup
    return () => {
      if (optimizeTimeoutRef.current) {
        clearTimeout(optimizeTimeoutRef.current);
      }
    };
  }, [panels, stock, settings]);
  */


  const handleOptimize = async () => {
    if (panels.length === 0) {
      showToast('No panels to optimize', 'error');
      return;
    }

    if (stock.length === 0) {
      showToast('No stock sheets defined', 'error');
      return;
    }

    setIsOptimizing(true);
    
    // 설정값을 전역 변수로 저장 (뷰어에서 접근 가능하도록)
    (window as any).cncSettings = settings;
    
    try {
      // Group panels by material AND thickness
      const panelGroups = new Map<string, Panel[]>();
      
      panels.forEach(panel => {
        // Apply grain and rotation settings
        let processedPanel = { ...panel };
        
        // 패널 치수를 그대로 사용 (width와 length를 변경하지 않음)
        // console.log(`Panel ${panel.label}: ${panel.width}x${panel.length} (grain: ${panel.grain}, thickness: ${panel.thickness}mm)`);
        
        // 결방향 고려 설정이 켜져있고 결방향이 설정되어 있으면 회전 불가
        // 결방향이 V(세로) 또는 H(가로)이면 회전 불가
        if (settings.considerGrain && panel.grain && (panel.grain === 'V' || panel.grain === 'H')) {
          processedPanel.canRotate = false;
        } else if (!settings.considerGrain) {
          // 결방향 고려하지 않으면 회전 가능
          processedPanel.canRotate = true;
        } else {
          // 그 외의 경우 (grain이 NONE이거나 없는 경우)
          processedPanel.canRotate = true;
        }
        
        // 재질과 두께를 모두 고려하여 그룹화
        const key = settings.considerMaterial 
          ? `${processedPanel.material || 'PB'}_${processedPanel.thickness || 18}` 
          : `THICKNESS_${processedPanel.thickness || 18}`;
        if (!panelGroups.has(key)) {
          panelGroups.set(key, []);
        }
        panelGroups.get(key)!.push(processedPanel);
      });

      const allResults: OptimizedResult[] = [];

      // Optimize each material/thickness group
      for (const [key, groupPanels] of panelGroups) {
        // Parse material and thickness from key
        let material: string | undefined;
        let thickness: number;
        
        if (key.startsWith('THICKNESS_')) {
          // 재질 구분 없이 두께만 고려
          thickness = parseInt(key.split('_')[1]) || 18;
        } else {
          // 재질과 두께 모두 고려
          const parts = key.split('_');
          material = parts[0];
          thickness = parseInt(parts[1]) || 18;
        }
        
        // Find matching stock by material and thickness
        let matchingStock;
        if (material) {
          // 재질과 두께가 모두 일치하는 원자재 찾기
          matchingStock = stock.find(s => 
            s.material === material && s.thickness === thickness
          );
        }
        
        // 재질이 일치하는 게 없으면 두께만 일치하는 것 찾기
        if (!matchingStock) {
          matchingStock = stock.find(s => s.thickness === thickness);
        }
        
        // Last resort: use first stock (but warn)
        if (!matchingStock && stock.length > 0) {
          // console.warn(`No matching stock for ${thickness}mm thickness, using default stock`);
          matchingStock = stock[0];
        }

        if (matchingStock) {
          // Convert to optimizer format
          const stockPanel = {
            id: matchingStock.label || 'stock',
            width: matchingStock.width,
            height: matchingStock.length,
            material: matchingStock.material || 'PB',
            color: 'MW',
            price: 50000,
            stock: matchingStock.quantity
          };

          const optimizerPanels = groupPanels.map(p => ({
            id: p.id,
            name: p.label,
            width: p.width,
            height: p.length,
            thickness: p.thickness,
            quantity: p.quantity,
            material: p.material || 'PB',
            color: 'MW',
            grain: p.grain === 'H' ? 'HORIZONTAL' : 
                   p.grain === 'V' ? 'VERTICAL' : 
                   'VERTICAL', // 기본값은 VERTICAL (세로)
            canRotate: p.canRotate
          }));

          // 여백을 고려한 사용 가능한 공간 계산
          const adjustedStockPanel = {
            ...stockPanel,
            width: stockPanel.width - (settings.trimLeft || 10) - (settings.trimRight || 10),
            height: stockPanel.height - (settings.trimTop || 10) - (settings.trimBottom || 10)
          };
          
          // Run optimization with adjusted stock size
          const results = await optimizePanelsMultiple(
            optimizerPanels,
            adjustedStockPanel, // 여백을 제외한 크기 사용
            settings.singleSheetOnly ? 1 : 999, // 제한 없음
            settings.alignVerticalCuts !== false, // Use aligned packing by default
            settings.kerf || 5, // 톱날 두께 전달
            settings.optimizationType || 'cnc' // 최적화 타입 전달
          );
          
          // 패널 위치를 여백만큼 오프셋
          results.forEach(result => {
            result.panels.forEach(panel => {
              panel.x += (settings.trimLeft || 10);
              panel.y += (settings.trimBottom || 10);
            });
            // 원본 크기 정보 복원
            result.stockPanel = stockPanel;
          });
          
          // console.log(`Optimization for ${material}: ${results.length} sheets generated`);
          // console.log(`Panels to optimize: ${optimizerPanels.length}`);
          allResults.push(...results);
        }
      }

      // console.log('=== Initial Optimization Complete ===');
      // console.log('Total sheets generated:', allResults.length);
      
      // 재최적화 비활성화 - 시트 낭비 방지
      let finalResults = [...allResults];
      
      // console.log('=== Final Optimization Complete ===');
      // console.log('Total sheets:', finalResults.length);
      
      // 각 시트의 패널 수 출력
      // finalResults.forEach((result, index) => {
      //   console.log(`Sheet ${index + 1}: ${result.panels.length} panels, efficiency: ${result.efficiency.toFixed(1)}%`);
      // });
      
      setOptimizationResults(finalResults);
      setCurrentSheetIndex(0);
      
      // Generate placements for simulation
      const placements: Placement[] = [];
      finalResults.forEach((result, sheetIndex) => {
        result.panels.forEach(panel => {
          placements.push({
            sheetId: String(sheetIndex + 1),
            panelId: panel.id,
            x: panel.x,
            y: panel.y,
            width: panel.width,
            height: panel.height,
            rotated: panel.rotated
          });
        });
      });
      setPlacements(placements);
      
      if (allResults.length > 0) {
        const totalPanels = allResults.reduce((sum, r) => sum + r.panels.length, 0);
        showToast(`Optimized ${totalPanels} panels across ${allResults.length} sheets`, 'success');
      }
    } catch (error) {
      // console.error('Optimization error:', error);
      showToast('Optimization failed', 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  const projectName = basicInfo?.title || 'New Project';

  // Memoize cut steps to avoid recalculation during render
  const allCutSteps = useMemo(() => {
    if (optimizationResults.length === 0) {
      return [];
    }

    const steps = [];
    let globalOrder = 0;
    
    // 모든 시트의 모든 패널에 대한 재단 순서 생성
    optimizationResults.forEach((result, sheetIdx) => {
      const sheetId = String(sheetIdx + 1);
      
      // 이 시트의 모든 패널에 대한 재단 순서 생성
      result.panels.forEach((panel) => {
        const placement = {
          x: panel.x,
          y: panel.y,
          width: panel.width,
          height: panel.height
        };
        
        // 각 패널의 재단 단계 생성
        const panelCuts = buildSequenceForPanel({
          mode: settings.optimizationType === 'cnc' ? 'free' : 'guillotine',
          sheetW: result.stockPanel.width,
          sheetH: result.stockPanel.height,
          kerf: settings.kerf || 5,
          placement,
          sheetId,
          panelId: panel.id
        });
        
        // 전역 순서 번호 할당 및 고유 ID 생성
        panelCuts.forEach((cut, cutIdx) => {
          steps.push({
            ...cut,
            id: `s${sheetIdx}_p${panel.id}_c${cutIdx}`, // 고유 ID 생성
            globalOrder: ++globalOrder,
            sheetNumber: sheetIdx + 1,
            panelInfo: panel
          });
        });
      });
    });
    
    return steps;
  }, [optimizationResults, showCuttingList, settings.optimizationType, settings.kerf]);

  // Update saw stats when cut steps change
  useEffect(() => {
    if (allCutSteps.length > 0) {
      const stats = computeSawStats(allCutSteps, 'm');
      setSawStats(stats);
    }
  }, [allCutSteps, setSawStats]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Logo size="small" />
          <h1>CNC Optimizer Pro</h1>
          <span className={styles.projectName}>{projectName}</span>
        </div>
        
        <div className={styles.headerRight}>
          <button 
            className={styles.calculateButton}
            onClick={handleOptimize}
            disabled={isOptimizing || panels.length === 0}
          >
            <Play size={18} />
            Calculate
          </button>
          <div className={styles.exportGroup}>
            <ExportBar optimizationResults={optimizationResults} />
          </div>
          <button 
            className={styles.exitButton}
            onClick={() => navigate('/configurator')}
          >
            나가기
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Left Sidebar */}
        <div className={styles.leftSidebar}>
          <PanelsTable />
          <StockTable />
          <OptionsCard onSettingsChange={handleOptimize} />
        </div>

        {/* Center - Preview */}
        <div className={styles.centerPanel}>
          {optimizationResults.length > 0 ? (
            <div className={styles.viewerContainer}>
              <div className={styles.mainViewer}>
                <CuttingLayoutPreview2
                  result={optimizationResults[currentSheetIndex]}
                  highlightedPanelId={selectedPanelId}
                  showLabels={settings.labelsOnPanels}
                  onPanelClick={(id) => setSelectedPanelId(id)}
                  allowRotation={!settings.considerGrain}
                  // 뷰어 상태 동기화
                  scale={viewerScale}
                  rotation={viewerRotation}
                  offset={viewerOffset}
                  onScaleChange={setViewerScale}
                  onRotationChange={setViewerRotation}
                  onOffsetChange={setViewerOffset}
                  sheetInfo={{
                    currentIndex: currentSheetIndex,
                    totalSheets: optimizationResults.length,
                    onOptimize: handleOptimize,
                    isOptimizing: isOptimizing,
                    stock: stock
                  }}
                  onCurrentSheetIndexChange={setCurrentSheetIndex}
                  showCuttingListTab={showCuttingList}
                  allCutSteps={allCutSteps}
                />
              </div>
              
              <div className={styles.thumbnailBar}>
                <div className={styles.thumbnailScroll}>
                  {optimizationResults.map((result, index) => (
                    <SheetThumbnail
                      key={index}
                      result={result}
                      index={index}
                      isActive={index === currentSheetIndex}
                      onClick={() => setCurrentSheetIndex(index)}
                      // 뷰어 상태 전달 (활성 시트만)
                      viewerScale={index === currentSheetIndex ? viewerScale : 1}
                      viewerRotation={index === currentSheetIndex ? viewerRotation : 0}
                      viewerOffset={index === currentSheetIndex ? viewerOffset : { x: 0, y: 0 }}
                      highlightedPanelId={index === currentSheetIndex ? selectedPanelId : null}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyPreview}>
              <Zap size={48} />
              <h3>최적화 결과가 없습니다</h3>
              <p>패널과 원자재를 설정한 후 "최적화" 버튼을 클릭하세요</p>
              <button 
                className={`${styles.optimizeButtonLarge} ${styles.primary}`}
                onClick={handleOptimize}
                disabled={isOptimizing}
              >
                <Zap size={20} />
                {isOptimizing ? '최적화 중...' : '패널생성'}
              </button>
            </div>
          )}
        </div>

        {/* Right Sidebar - Stats */}
        <div className={styles.rightSidebar}>
          <div className={styles.rightSidebarContent}>
            <div className={styles.statsCard}>
              <h3>전체 통계</h3>
              <div className={styles.stats}>
                <div className={styles.statItem}>
                  <span>총 시트 수</span>
                  <strong>{optimizationResults.length}</strong>
                </div>
                <div className={styles.statItem}>
                  <span>총 패널 수</span>
                  <strong>{panels.reduce((sum, p) => sum + p.quantity, 0)}</strong>
                </div>
                <div className={styles.statItem}>
                  <span>평균 효율</span>
                  <strong>
                    {optimizationResults.length > 0
                      ? (optimizationResults.reduce((sum, r) => sum + r.efficiency, 0) / optimizationResults.length).toFixed(1)
                      : 0}%
                  </strong>
                </div>
                <div className={styles.statItem}>
                  <span>총 폐기량</span>
                  <strong>
                    {(optimizationResults.reduce((sum, r) => sum + r.wasteArea, 0) / 1000000).toFixed(2)} m²
                  </strong>
                </div>
                {showCuttingList && (
                  <div className={styles.statItem}>
                    <span>톱날 이동</span>
                    <strong>
                      {sawStats.total.toFixed(2)} {sawStats.unit}
                    </strong>
                  </div>
                )}
              </div>
            </div>

            {optimizationResults[currentSheetIndex] && (
              <div className={styles.statsCard}>
                <h3>시트 통계</h3>
                <div className={styles.statsCardHeader}>
                  <button 
                    className={styles.statsNavButton}
                    onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
                    disabled={currentSheetIndex === 0}
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <h3>시트 {currentSheetIndex + 1} / {optimizationResults.length}</h3>
                  <button 
                    className={styles.statsNavButton}
                    onClick={() => setCurrentSheetIndex(Math.min(optimizationResults.length - 1, currentSheetIndex + 1))}
                    disabled={currentSheetIndex === optimizationResults.length - 1}
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button 
                    className={`${styles.playButton} ${simulating ? styles.playing : ''}`}
                    onClick={() => {
                      console.log('Play button clicked', { 
                        simulating, 
                        currentSheetIndex,
                        hasOptimizationResults: optimizationResults.length > 0,
                        allCutStepsLength: allCutSteps.length
                      });
                      
                      if (simulating) {
                        // 시뮬레이션 정지
                        setSimulating(false);
                      } else {
                        // 현재 시트의 컷팅 시뮬레이션 시작
                        setSelectedPanelId(null); // Clear selected panel for full sheet simulation
                        setSelectedSheetId(String(currentSheetIndex + 1));
                        setSimulating(true);
                        console.log('Simulation started');
                      }
                    }}
                    title={simulating ? "시뮬레이션 정지" : "컷팅 시뮬레이션"}
                  >
                    {simulating ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <span>패널 수</span>
                    <strong>{optimizationResults[currentSheetIndex].panels.length}</strong>
                  </div>
                  <div className={styles.statItem}>
                    <span>효율</span>
                    <strong>{optimizationResults[currentSheetIndex].efficiency.toFixed(1)}%</strong>
                  </div>
                  <div className={styles.statItem}>
                    <span>사용 면적</span>
                    <strong>{(optimizationResults[currentSheetIndex].usedArea / 1000000).toFixed(2)} m²</strong>
                  </div>
                  <div className={styles.statItem}>
                    <span>폐기 면적</span>
                    <strong>{(optimizationResults[currentSheetIndex].wasteArea / 1000000).toFixed(2)} m²</strong>
                  </div>
                  {showCuttingList && sawStats.bySheet[String(currentSheetIndex + 1)] && (
                    <div className={styles.statItem}>
                      <span>톱날 이동</span>
                      <strong>{sawStats.bySheet[String(currentSheetIndex + 1)].toFixed(2)} {sawStats.unit}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sheet List with Tabs */}
            {optimizationResults.length > 0 && (
              <div className={`${styles.statsCard} ${styles.sheetListCard}`}>
                <div className={styles.sheetListHeader}>
                  <div className={styles.tabButtons}>
                    <button 
                      className={`${styles.tabButton} ${!showCuttingList ? styles.active : ''}`}
                      onClick={() => setShowCuttingList(false)}
                    >
                      시트 목록
                    </button>
                    <button 
                      className={`${styles.tabButton} ${showCuttingList ? styles.active : ''}`}
                      onClick={() => setShowCuttingList(true)}
                    >
                      컷팅 리스트
                    </button>
                  </div>
                </div>
                
                {!showCuttingList ? (
                  <div className={styles.sheetList}>
                    {optimizationResults.map((result, index) => {
                      // 시트의 원자재 정보 찾기
                      const stockLabel = result.stockPanel.id || `${result.stockPanel.material}_${result.stockPanel.width}x${result.stockPanel.height}`;
                      const isExpanded = expandedSheets.has(index);
                      
                      return (
                        <div key={index} className={styles.sheetItemContainer}>
                          <div 
                            className={`${styles.sheetItem} ${index === currentSheetIndex ? styles.active : ''}`}
                            onClick={() => {
                              setCurrentSheetIndex(index);
                              // 시트 클릭 시 자동으로 펼치기
                              setExpandedSheets(prev => {
                                const newSet = new Set(prev);
                                if (!newSet.has(index)) {
                                  newSet.add(index);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <button
                              className={styles.expandButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSheets(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(index)) {
                                    newSet.delete(index);
                                  } else {
                                    newSet.add(index);
                                  }
                                  return newSet;
                                });
                              }}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <span className={styles.sheetNumber}>
                              {index + 1}
                            </span>
                            <span className={styles.sheetInfo}>
                              {stockLabel}
                            </span>
                            <span className={styles.sheetPanels}>
                              {result.panels.length}개
                            </span>
                            <span className={styles.sheetEfficiency}>
                              {result.efficiency.toFixed(0)}%
                            </span>
                          </div>
                          
                          {isExpanded && (
                            <div className={styles.panelListContainer}>
                              {result.panels.map((panel, panelIndex) => (
                                <div 
                                  key={`panel-${index}-${panelIndex}`}
                                  className={`${styles.panelItem} ${selectedPanelId === panel.id ? styles.selectedPanel : ''} panel-clickable`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const panelId = panel.id;
                                    setSelectedPanelId(panelId);
                                    setCurrentSheetIndex(index);
                                  }}
                                >
                                  <span className={styles.panelName}>{panel.name || `Panel ${panel.id}`}</span>
                                  <span className={styles.panelSize}>
                                    {Math.round(panel.width)} × {Math.round(panel.height)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.cutsList}>
                    <div className={styles.cutsTableHeader}>
                      <span className={styles.cutsCol1}>#</span>
                      <span className={styles.cutsCol2}>Panel</span>
                      <span className={styles.cutsCol3}>Cut</span>
                      <span className={styles.cutsCol4}>Result</span>
                    </div>
                    <div className={styles.cutsTableBody}>
                      {(() => {
                        // Group cuts by sheet for per-sheet numbering
                        const cutsBySheet = new Map<number, typeof allCutSteps>();
                        allCutSteps.forEach(cut => {
                          if (!cutsBySheet.has(cut.sheetNumber)) {
                            cutsBySheet.set(cut.sheetNumber, []);
                          }
                          cutsBySheet.get(cut.sheetNumber)!.push(cut);
                        });
                        
                        let globalIdx = 0;
                        const rows = [];
                        
                        // Render cuts grouped by sheet with restart numbering
                        for (const [sheetNum, sheetCuts] of cutsBySheet) {
                          sheetCuts.forEach((cut, localIdx) => {
                            const currentGlobalIdx = globalIdx++;
                            rows.push(
                              <div 
                                key={`cut-${sheetNum}-${localIdx}`}
                                className={`${styles.cutsRow} ${selectedCutId === cut.id ? styles.selected : ''}`}
                                onClick={() => {
                                  // 해당 패널과 시트 선택
                                  setSelectedSheetId(cut.sheetId);
                                  selectCutId(cut.id);
                                  if (cut.yieldsPanelId) {
                                    selectPanel(cut.yieldsPanelId, cut.sheetId);
                                    setCurrentSheetIndex(cut.sheetNumber - 1);
                                  }
                                  selectCutIndex(currentGlobalIdx);
                                }}
                                onDoubleClick={() => {
                                  if (cut.yieldsPanelId) {
                                    selectPanel(cut.yieldsPanelId, cut.sheetId);
                                    setCurrentSheetIndex(cut.sheetNumber - 1);
                                    setSimulating(true);
                                  }
                                }}
                              >
                                <span className={styles.cutsCol1}>{localIdx + 1}</span>
                                <span className={styles.cutsCol2}>
                                  {formatSize(cut.before.width, cut.before.length)}
                                </span>
                                <span className={styles.cutsCol3}>
                                  {`${cut.axis}=${Math.round(cut.pos)}`}
                                </span>
                                <span className={styles.cutsCol4}>
                                  {cut.yieldsPanelId ? 
                                    `${formatSize(cut.after?.width || 0, cut.after?.length || 0)} \\ -` : 
                                    `- \\ surplus`}
                                </span>
                              </div>
                            );
                          });
                        }
                        
                        return rows;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CNCOptimizerPro(){
  return (
    <CNCProvider>
      <PageInner />
    </CNCProvider>
  );
}