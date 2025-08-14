import React, { useEffect, useState } from 'react';
import { CNCProvider, useCNCStore } from './store';
import { useLivePanelData } from './hooks/useLivePanelData';
import { useProjectStore } from '@/store/core/projectStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap } from 'lucide-react';
import { setThemeColor } from '@/theme';

// Components
import PanelsTable from './components/SidebarLeft/PanelsTable';
import StockTable from './components/SidebarLeft/StockTable';
import OptionsCard from './components/SidebarLeft/OptionsCard';
import ExportBar from './components/ExportBar';
import CuttingLayoutPreview2 from './components/CuttingLayoutPreview2';

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
    selectedPanelId,
    currentSheetIndex, setCurrentSheetIndex
  } = useCNCStore();
  
  const [optimizationResults, setOptimizationResults] = useState<OptimizedResult[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Initialize with live data
  useEffect(() => {
    // Convert live panels to CutList format
    if (livePanels.length > 0 && panels.length === 0) {
      const cutlistPanels: Panel[] = livePanels.map(p => ({
        id: p.id,
        label: p.name || `Panel_${p.id}`,
        width: Math.min(p.width, p.height),
        length: Math.max(p.width, p.height),
        thickness: p.thickness || 18,
        quantity: p.quantity || 1,
        material: p.material || 'PB',
        grain: p.grain === 'HORIZONTAL' || p.grain === 'LENGTH' ? 'H' : 
               p.grain === 'VERTICAL' || p.grain === 'WIDTH' ? 'V' : 'NONE',
        canRotate: p.canRotate !== false
      }));
      setPanels(cutlistPanels);
    }

    // Initialize default stock if empty
    if (stock.length === 0) {
      const defaultStock: StockSheet[] = [
        {
          label: 'PB_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 18,
          quantity: 999,
          material: 'PB'
        },
        {
          label: 'MDF_2440x1220',
          width: 1220,
          length: 2440,
          thickness: 18,
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

  // Auto-optimize when data changes
  useEffect(() => {
    if (panels.length > 0 && stock.length > 0) {
      handleOptimize();
    }
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
    
    try {
      // Group panels by material if needed
      const panelGroups = new Map<string, Panel[]>();
      
      panels.forEach(panel => {
        // Apply grain and rotation settings
        let processedPanel = { ...panel };
        if (settings.considerGrain && panel.grain && panel.grain !== 'NONE') {
          processedPanel.canRotate = false;
        } else {
          processedPanel.canRotate = true; // Allow rotation if no grain or grain not considered
        }
        
        const key = settings.considerMaterial ? processedPanel.material || 'DEFAULT' : 'ALL';
        if (!panelGroups.has(key)) {
          panelGroups.set(key, []);
        }
        panelGroups.get(key)!.push(processedPanel);
      });

      const allResults: OptimizedResult[] = [];

      // Optimize each material group
      for (const [material, groupPanels] of panelGroups) {
        // Find matching stock
        let matchingStock = stock.find(s => s.material === material);
        if (!matchingStock && stock.length > 0) {
          matchingStock = stock[0]; // Use first stock as default
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
                   p.grain === 'V' ? 'VERTICAL' : 'NONE',
            canRotate: p.canRotate
          }));

          // Run optimization with alignment setting
          const results = await optimizePanelsMultiple(
            optimizerPanels,
            stockPanel,
            settings.singleSheetOnly ? 1 : 10,
            settings.alignVerticalCuts !== false // Use aligned packing by default
          );
          
          allResults.push(...results);
        }
      }

      setOptimizationResults(allResults);
      setCurrentSheetIndex(0);
      
      if (allResults.length > 0) {
        const totalPanels = allResults.reduce((sum, r) => sum + r.panels.length, 0);
        showToast(`Optimized ${totalPanels} panels across ${allResults.length} sheets`, 'success');
      }
    } catch (error) {
      console.error('Optimization error:', error);
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
          <button 
            className={styles.backButton}
            onClick={() => navigate('/configurator')}
          >
            <ArrowLeft size={18} />
            뒤로
          </button>
          <h1>CNC Optimizer Pro</h1>
          <span className={styles.projectName}>{projectName}</span>
        </div>
        
        <div className={styles.headerRight}>
          <div className={styles.exportGroup}>
            <ExportBar optimizationResults={optimizationResults} />
          </div>
          <div className={styles.divider} />
          <button 
            className={`${styles.button} ${styles.primary}`}
            onClick={handleOptimize}
            disabled={isOptimizing}
          >
            <Zap size={16} />
            {isOptimizing ? '최적화 중...' : '최적화'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Left Sidebar */}
        <div className={styles.leftSidebar}>
          <PanelsTable />
          <StockTable />
          <OptionsCard />
        </div>

        {/* Center - Preview */}
        <div className={styles.centerPanel}>
          {optimizationResults.length > 0 ? (
            <>
              <div className={styles.sheetNav}>
                <button 
                  onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
                  disabled={currentSheetIndex === 0}
                >
                  이전
                </button>
                <span>
                  시트 {currentSheetIndex + 1} / {optimizationResults.length}
                </span>
                <button 
                  onClick={() => setCurrentSheetIndex(Math.min(optimizationResults.length - 1, currentSheetIndex + 1))}
                  disabled={currentSheetIndex === optimizationResults.length - 1}
                >
                  다음
                </button>
              </div>
              
              <CuttingLayoutPreview2
                result={optimizationResults[currentSheetIndex]}
                highlightedPanelId={selectedPanelId}
                showLabels={settings.labelsOnPanels}
                onPanelClick={(id) => setSelectedPanelId(id)}
                allowRotation={!settings.considerGrain}
              />
            </>
          ) : (
            <div className={styles.emptyPreview}>
              <Zap size={48} />
              <h3>최적화 결과가 없습니다</h3>
              <p>패널과 원자재를 설정한 후 "최적화" 버튼을 클릭하세요</p>
            </div>
          )}
        </div>

        {/* Right Sidebar - Stats */}
        <div className={styles.rightSidebar}>
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

          {/* Sheet List */}
          <div className={styles.statsCard}>
            <h3>시트 목록</h3>
            <div className={styles.sheetList}>
              {optimizationResults.map((result, index) => (
                <div 
                  key={index}
                  className={`${styles.sheetItem} ${index === currentSheetIndex ? styles.active : ''}`}
                  onClick={() => setCurrentSheetIndex(index)}
                >
                  <span>시트 {index + 1}</span>
                  <span>{result.panels.length}개 패널</span>
                  <span>{result.efficiency.toFixed(1)}%</span>
                </div>
              ))}
            </div>
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