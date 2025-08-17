import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CNCProvider, useCNCStore } from './store';
import { useLivePanelData } from './hooks/useLivePanelData';
import { useProjectStore } from '@/store/core/projectStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Zap, Play } from 'lucide-react';
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
import type { Panel, StockSheet } from '../../types/cutlist';
import { OptimizedResult } from './types';

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
    currentSheetIndex, setCurrentSheetIndex
  } = useCNCStore();
  
  const [optimizationResults, setOptimizationResults] = useState<OptimizedResult[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const optimizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 뷰어 상태 (미리보기와 동기화)
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerRotation, setViewerRotation] = useState(-90); // 기본값 -90 (가로뷰)
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 });
  const [showCuttingList, setShowCuttingList] = useState(false); // 시트 목록 탭 상태

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

  // Initialize with live data
  useEffect(() => {
    // Convert live panels to CutList format
    if (livePanels.length > 0) {
      // console.log('🔄 Converting live panels to CutList format');
      // console.log('Live panels count:', livePanels.length);
      // console.log('Live panels:', livePanels);
      
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
      
      // console.log('Converted panels count:', cutlistPanels.length);
      // console.log('Converted panels:', cutlistPanels);
      setPanels(cutlistPanels);
    } else if (panels.length === 0) {
      // 테스트용 패널 추가 (live panels가 없을 때만)
      // console.log('⚠️ No live panels found, adding test panels');
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

    // Set theme color
    const theme = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme')
      .trim();
    if (theme) {
      setThemeColor(`hsl(${theme})`);
    }
  }, [livePanels]);

  // Auto-optimize when data changes with debouncing
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
          ? `${processedPanel.material || 'DEFAULT'}_${processedPanel.thickness || 18}` 
          : 'ALL';
        if (!panelGroups.has(key)) {
          panelGroups.set(key, []);
        }
        panelGroups.get(key)!.push(processedPanel);
      });

      const allResults: OptimizedResult[] = [];

      // Optimize each material and thickness group
      for (const [key, groupPanels] of panelGroups) {
        // Parse material and thickness from key
        const [material, thicknessStr] = key.split('_');
        const thickness = parseInt(thicknessStr) || 18;
        
        // Find matching stock by material AND thickness
        let matchingStock = stock.find(s => 
          s.material === material && s.thickness === thickness
        );
        
        // If no exact match, try to find stock with same thickness
        if (!matchingStock) {
          matchingStock = stock.find(s => s.thickness === thickness);
        }
        
        // Last resort: use first stock (but warn)
        if (!matchingStock && stock.length > 0) {
          // console.warn(`No matching stock for ${material} ${thickness}mm, using default stock`);
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
      
      // 재최적화: 낮은 효율 시트 감지 및 재배치
      let finalResults = [...allResults];
      const lowEfficiencySheets = allResults.filter(r => r.efficiency < 20);
      
      if (lowEfficiencySheets.length > 0) {
        // console.log(`Found ${lowEfficiencySheets.length} low efficiency sheets, attempting redistribution...`);
        
        // 모든 패널을 수집
        const allPanelsToRedistribute: PlacedPanel[] = [];
        allResults.forEach(result => {
          allPanelsToRedistribute.push(...result.panels);
        });
        
        // console.log(`Total panels to redistribute: ${allPanelsToRedistribute.length}`);
        
        // 패널을 다시 최적화용 형식으로 변환
        const panelsForRepack: Panel[] = allPanelsToRedistribute.map(p => ({
          ...p,
          quantity: 1
        }));
        
        // 첫 번째 원자재 사용 (일반적으로 가장 많이 사용되는 원자재)
        const mainStock = stock[0];
        if (mainStock) {
          const stockPanel = {
            id: mainStock.label || 'stock',
            width: mainStock.width - (settings.trimLeft || 10) - (settings.trimRight || 10),
            height: mainStock.length - (settings.trimTop || 10) - (settings.trimBottom || 10),
            material: mainStock.material || 'PB',
            color: 'MW',
            price: 50000,
            stock: mainStock.quantity
          };
          
          // 재최적화 실행
          const reoptimizedResults = await optimizePanelsMultiple(
            panelsForRepack,
            stockPanel,
            999,
            settings.alignVerticalCuts !== false,
            settings.kerf || 5,
            settings.optimizationType || 'cnc'
          );
          
          // 패널 위치 오프셋 조정
          reoptimizedResults.forEach(result => {
            result.panels.forEach(panel => {
              panel.x += (settings.trimLeft || 10);
              panel.y += (settings.trimBottom || 10);
            });
            // 원본 크기 정보 복원
            result.stockPanel = {
              ...stockPanel,
              width: mainStock.width,
              height: mainStock.length
            };
          });
          
          // 개선되었는지 확인
          const oldAvgEfficiency = allResults.reduce((sum, r) => sum + r.efficiency, 0) / allResults.length;
          const newAvgEfficiency = reoptimizedResults.reduce((sum, r) => sum + r.efficiency, 0) / reoptimizedResults.length;
          
          // console.log(`Redistribution result: ${allResults.length} sheets → ${reoptimizedResults.length} sheets`);
          // console.log(`Average efficiency: ${oldAvgEfficiency.toFixed(1)}% → ${newAvgEfficiency.toFixed(1)}%`);
          
          // 개선되었거나 시트 수가 줄었으면 사용
          if (reoptimizedResults.length < allResults.length || newAvgEfficiency > oldAvgEfficiency + 10) {
            // console.log('Using redistributed layout');
            finalResults = reoptimizedResults;
          } else {
            // console.log('Keeping original layout');
          }
        }
      }
      
      // console.log('=== Final Optimization Complete ===');
      // console.log('Total sheets:', finalResults.length);
      
      // 각 시트의 패널 수 출력
      // finalResults.forEach((result, index) => {
      //   console.log(`Sheet ${index + 1}: ${result.panels.length} panels, efficiency: ${result.efficiency.toFixed(1)}%`);
      // });
      
      setOptimizationResults(finalResults);
      setCurrentSheetIndex(0);
      
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
                {isOptimizing ? '최적화 중...' : '최적화 시작'}
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
              </div>
            </div>

            {optimizationResults[currentSheetIndex] && (
              <div className={styles.statsCard}>
                <h3>시트 {currentSheetIndex + 1} 통계</h3>
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
                      
                      return (
                        <div 
                          key={index}
                          className={`${styles.sheetItem} ${index === currentSheetIndex ? styles.active : ''}`}
                          onClick={() => setCurrentSheetIndex(index)}
                        >
                          <span className={styles.sheetNumber}>{index + 1}</span>
                          <span className={styles.sheetInfo}>
                            {stockLabel}
                          </span>
                          <span className={styles.sheetPanels}>{result.panels.length}개</span>
                          <span className={styles.sheetEfficiency}>{result.efficiency.toFixed(0)}%</span>
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
                      <span className={styles.cutsCol4}>Sheet</span>
                    </div>
                    <div className={styles.cutsTableBody}>
                      {(() => {
                        let cutNumber = 0;
                        const allCuts = [];
                        
                        // 모든 시트의 패널을 순서대로 수집
                        optimizationResults.forEach((result, sheetIdx) => {
                          result.panels.forEach((panel) => {
                            cutNumber++;
                            const originalPanel = panels.find(p => p.id === panel.id);
                            allCuts.push({
                              cutNumber,
                              sheetNumber: sheetIdx + 1,
                              panel,
                              panelId: panel.id,
                              originalSize: originalPanel ? `${originalPanel.width}×${originalPanel.length}` : `${panel.width}×${panel.height}`
                            });
                          });
                        });
                        
                        return allCuts.map(cut => (
                          <div 
                            key={`${cut.sheetNumber}-${cut.panel.id}`}
                            className={`${styles.cutsRow} ${selectedPanelId === cut.panelId ? styles.selected : ''}`}
                            onClick={() => {
                              setSelectedPanelId(cut.panelId);
                              setCurrentSheetIndex(cut.sheetNumber - 1);
                            }}
                          >
                            <span className={styles.cutsCol1}>{cut.cutNumber}</span>
                            <span className={styles.cutsCol2}>
                              {cut.originalSize}
                            </span>
                            <span className={styles.cutsCol3}>
                              {Math.round(cut.panel.x)}×{Math.round(cut.panel.y)}
                            </span>
                            <span className={styles.cutsCol4}>
                              #{cut.sheetNumber}
                            </span>
                          </div>
                        ));
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