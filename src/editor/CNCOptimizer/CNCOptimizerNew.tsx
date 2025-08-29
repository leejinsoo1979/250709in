import React, { useState, useEffect, useMemo } from 'react';
import { useLivePanelData } from './hooks/useLivePanelData';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { StockPanel, OptimizedResult } from './types';
import { optimizePanelsMultiple } from './utils/optimizer';
import { showToast } from '@/utils/cutlist/csv';
import { exportCutList } from '@/utils/cutlist/export';
import CuttingLayoutPreview from './components/CuttingLayoutPreview';
import styles from './CNCOptimizerNew.module.css';
import { ArrowLeft, Package, Settings, FileDown, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';

const CNCOptimizerNew: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { basicInfo } = useProjectStore();
  const { placedModules } = useFurnitureStore();
  
  // URL 파라미터에서 프로젝트 ID와 디자인 파일 ID 가져오기
  const projectId = searchParams.get('projectId');
  const designFileId = searchParams.get('designFileId');
  const fromConfigurator = location.state?.fromConfigurator;
  const { panels: livePanels, normalizedPanels: liveNormalizedPanels, stats: panelStats, isLoading } = useLivePanelData();
  
  // CNC 진입 시 가구 데이터를 sessionStorage에 저장
  useEffect(() => {
    if (placedModules && placedModules.length > 0) {
      sessionStorage.setItem('cnc_furniture_backup', JSON.stringify(placedModules));
      console.log('💾 CNC: 가구 데이터 백업 완료', placedModules.length, '개');
    }
  }, []);
  
  // State
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [stockPanels, setStockPanels] = useState<StockPanel[]>([]);
  const [optimizationResults, setOptimizationResults] = useState<OptimizedResult[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [allowRotation, setAllowRotation] = useState(true);
  const [considerGrain, setConsiderGrain] = useState(true);
  
  // Settings
  const [settings, setSettings] = useState({
    kerf: 3,
    considerMaterial: true,
    considerGrain: true,
    allowRotation: true
  });

  // Initialize default stock panels
  useEffect(() => {
    const defaultStock: StockPanel[] = [
      {
        id: 'stock-1',
        width: 2440,
        height: 1220,
        material: 'PB',
        color: 'MW',
        price: 50000,
        stock: 999
      },
      {
        id: 'stock-2',
        width: 2440,
        height: 1220,
        material: 'MDF',
        color: 'MW',
        price: 45000,
        stock: 999
      }
    ];
    setStockPanels(defaultStock);
  }, []);

  // Auto-optimize when panels change
  useEffect(() => {
    if (livePanels.length > 0 && stockPanels.length > 0) {
      handleOptimize();
    }
  }, [livePanels, stockPanels, settings]);

  const projectName = basicInfo?.title || '새 프로젝트';

  const handleOptimize = async () => {
    if (livePanels.length === 0) {
      showToast('패널이 없습니다', 'error');
      return;
    }

    setIsOptimizing(true);
    
    try {
      // 재질별로 패널 그룹화
      const panelGroups = new Map<string, typeof livePanels>();
      
      livePanels.forEach(panel => {
        // 결 방향 고려
        if (settings.considerGrain && panel.grain && panel.grain !== 'NONE') {
          // 결 방향이 있으면 회전 불가능하게 설정
          panel = { ...panel, canRotate: false };
        } else {
          panel = { ...panel, canRotate: settings.allowRotation };
        }
        
        const key = settings.considerMaterial ? `${panel.material}-${panel.color}` : 'all';
        if (!panelGroups.has(key)) {
          panelGroups.set(key, []);
        }
        panelGroups.get(key)!.push(panel);
      });

      const allResults: OptimizedResult[] = [];

      // 각 재질 그룹별로 최적화
      for (const [key, panels] of panelGroups) {
        const [material, color] = key.split('-');
        
        // 매칭되는 재고 패널 찾기
        let matchingStock = stockPanels.find(
          stock => stock.material === material && stock.color === color
        );

        if (!matchingStock && stockPanels.length > 0) {
          matchingStock = stockPanels[0]; // 기본 재고 사용
        }

        if (matchingStock) {
          // 여러 장의 시트에 최적화
          const results = await optimizePanelsMultiple(
            panels, 
            matchingStock,
            10 // 최대 10장까지 사용
          );
          allResults.push(...results);
        }
      }

      setOptimizationResults(allResults);
      setCurrentSheetIndex(0);
      
      if (allResults.length > 0) {
        showToast(`${allResults.length}장의 시트에 최적화 완료`, 'success');
      }
    } catch (error) {
      console.error('Optimization error:', error);
      showToast('최적화 실패', 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleExportCSV = () => {
    if (liveNormalizedPanels.length === 0) {
      showToast('내보낼 패널이 없습니다', 'error');
      return;
    }
    
    const stockSheets = stockPanels.map(stock => ({
      id: stock.id,
      label: `${stock.material}_${stock.color}`,
      width: stock.width,
      length: stock.height,
      thickness: 18,
      quantity: stock.stock || 999,
      material: stock.material
    }));
    
    exportCutList(liveNormalizedPanels, stockSheets, projectName);
  };

  // 현재 시트의 통계
  const currentSheetStats = useMemo(() => {
    if (optimizationResults.length === 0 || !optimizationResults[currentSheetIndex]) {
      return {
        panelCount: 0,
        efficiency: 0,
        wasteArea: 0
      };
    }
    
    const sheet = optimizationResults[currentSheetIndex];
    return {
      panelCount: sheet.panels.length,
      efficiency: sheet.efficiency,
      wasteArea: sheet.wasteArea
    };
  }, [optimizationResults, currentSheetIndex]);

  // 전체 통계
  const totalStats = useMemo(() => {
    if (optimizationResults.length === 0) {
      return {
        sheetCount: 0,
        totalPanels: 0,
        averageEfficiency: 0,
        totalWaste: 0
      };
    }
    
    const totalPanels = optimizationResults.reduce((sum, sheet) => sum + sheet.panels.length, 0);
    const totalEfficiency = optimizationResults.reduce((sum, sheet) => sum + sheet.efficiency, 0);
    const totalWaste = optimizationResults.reduce((sum, sheet) => sum + sheet.wasteArea, 0);
    
    return {
      sheetCount: optimizationResults.length,
      totalPanels,
      averageEfficiency: totalEfficiency / optimizationResults.length,
      totalWaste
    };
  }, [optimizationResults]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button 
            className={styles.backButton}
            onClick={() => {
              // 단순히 이전 페이지로 돌아가기
              navigate(-1);
            }}
          >
            <ArrowLeft size={20} />
            돌아가기
          </button>
          <h1>CNC 최적화</h1>
          <span className={styles.projectName}>{projectName}</span>
        </div>
        
        <div className={styles.headerRight}>
          <button 
            className={styles.button}
            onClick={handleOptimize}
            disabled={isOptimizing}
          >
            {isOptimizing ? '최적화 중...' : '최적화 실행'}
          </button>
          <button 
            className={styles.button}
            onClick={handleExportCSV}
          >
            <FileDown size={16} />
            CSV 내보내기
          </button>
        </div>
      </div>

      <div className={styles.main}>
        {/* Left Panel - Panel List */}
        <div className={styles.leftPanel}>
          <div className={styles.section}>
            <h3>
              <Package size={16} />
              패널 목록 ({livePanels.length}개)
            </h3>
            <div className={styles.panelList}>
              {livePanels.map((panel) => (
                <div 
                  key={panel.id}
                  className={`${styles.panelItem} ${selectedPanelId === panel.id ? styles.selected : ''}`}
                  onClick={() => setSelectedPanelId(panel.id)}
                >
                  <div className={styles.panelInfo}>
                    <span className={styles.panelName}>{panel.name}</span>
                    <span className={styles.panelSize}>
                      {panel.width} × {panel.height} mm
                    </span>
                  </div>
                  <div className={styles.panelMeta}>
                    <span className={styles.material}>{panel.material}</span>
                    <span className={styles.quantity}>× {panel.quantity}</span>
                    {panel.grain && panel.grain !== 'NONE' && (
                      <span className={styles.grain}>결: {panel.grain}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className={styles.section}>
            <h3>
              <Settings size={16} />
              설정
            </h3>
            <div className={styles.settings}>
              <label>
                <span>톱날 두께 (mm)</span>
                <input 
                  type="number" 
                  value={settings.kerf}
                  onChange={(e) => setSettings({...settings, kerf: Number(e.target.value)})}
                />
              </label>
              <label>
                <input 
                  type="checkbox"
                  checked={settings.considerMaterial}
                  onChange={(e) => setSettings({...settings, considerMaterial: e.target.checked})}
                />
                <span>재질별 분류</span>
              </label>
              <label>
                <input 
                  type="checkbox"
                  checked={settings.considerGrain}
                  onChange={(e) => setSettings({...settings, considerGrain: e.target.checked})}
                />
                <span>결 방향 고려</span>
              </label>
              <label>
                <input 
                  type="checkbox"
                  checked={settings.allowRotation}
                  onChange={(e) => setSettings({...settings, allowRotation: e.target.checked})}
                  disabled={settings.considerGrain}
                />
                <span>패널 회전 허용</span>
              </label>
            </div>
          </div>
        </div>

        {/* Center - Preview */}
        <div className={styles.centerPanel}>
          {optimizationResults.length > 0 ? (
            <>
              <div className={styles.sheetControls}>
                <button 
                  onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
                  disabled={currentSheetIndex === 0}
                >
                  <ChevronLeft />
                </button>
                <span>
                  Sheet {currentSheetIndex + 1} / {optimizationResults.length}
                </span>
                <button 
                  onClick={() => setCurrentSheetIndex(Math.min(optimizationResults.length - 1, currentSheetIndex + 1))}
                  disabled={currentSheetIndex === optimizationResults.length - 1}
                >
                  <ChevronRight />
                </button>
              </div>
              
              <CuttingLayoutPreview
                result={optimizationResults[currentSheetIndex]}
                highlightedPanelId={selectedPanelId}
                zoom={100}
                showLabels={true}
              />
              
              <div className={styles.sheetInfo}>
                <div>패널: {currentSheetStats.panelCount}개</div>
                <div>효율: {currentSheetStats.efficiency.toFixed(1)}%</div>
                <div>낭비: {(currentSheetStats.wasteArea / 1000000).toFixed(2)}m²</div>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <p>최적화를 실행하면 결과가 여기에 표시됩니다</p>
            </div>
          )}
        </div>

        {/* Right Panel - Statistics */}
        <div className={styles.rightPanel}>
          <div className={styles.section}>
            <h3>전체 통계</h3>
            <div className={styles.stats}>
              <div className={styles.statItem}>
                <span>Used Sheets</span>
                <strong>{totalStats.sheetCount}장</strong>
              </div>
              <div className={styles.statItem}>
                <span>총 패널</span>
                <strong>{totalStats.totalPanels}개</strong>
              </div>
              <div className={styles.statItem}>
                <span>평균 효율</span>
                <strong>{totalStats.averageEfficiency.toFixed(1)}%</strong>
              </div>
              <div className={styles.statItem}>
                <span>총 낭비</span>
                <strong>{(totalStats.totalWaste / 1000000).toFixed(2)}m²</strong>
              </div>
            </div>
          </div>

          {/* Sheet List */}
          <div className={styles.section}>
            <h3>Sheet List</h3>
            <div className={styles.sheetList}>
              {optimizationResults.map((sheet, index) => (
                <div 
                  key={index}
                  className={`${styles.sheetItem} ${index === currentSheetIndex ? styles.active : ''}`}
                  onClick={() => setCurrentSheetIndex(index)}
                >
                  <span>Sheet {index + 1}</span>
                  <span>{sheet.panels.length} panels</span>
                  <span>{sheet.efficiency.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CNCOptimizerNew;