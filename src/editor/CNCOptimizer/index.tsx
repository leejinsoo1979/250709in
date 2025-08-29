import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Layers, Zap, Eye, Download, Plus, Edit2, Trash2, Grid3x3, Filter, Settings, FileDown, FileSpreadsheet, Wifi, WifiOff } from 'lucide-react';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useTheme } from '@/contexts/ThemeContext';
import { getModuleById } from '@/data/modules';
import styles from './style.module.css';
import { Panel, StockPanel, OptimizedResult, PlacedPanel, PanelGroup } from './types';
import PanelListItem from './components/PanelListItem';
import StockItem from './components/StockItem';
import OptimizationResult from './components/OptimizationResult';
import CuttingLayoutPreview from './components/CuttingLayoutPreview';
import CutlistExportPanel from './components/CutlistExportPanel';
import { optimizePanelsMultiple } from './utils/optimizer';
import { generateDXF } from './utils/dxfGenerator';
import { calculatePanelDetails } from './utils/panelExtractor';
import { normalizePanels, NormalizedPanel } from '@/utils/cutlist/normalize';
import { exportPanelsCsv, exportStockCsv, exportCutList } from '@/utils/cutlist/export';
import { showToast } from '@/utils/cutlist/csv';
import { useLivePanelData } from './hooks/useLivePanelData';

// 색상 코드를 hex로 변환하는 헬퍼 함수
const getColorHex = (colorCode: string): string => {
  const colorMap: { [key: string]: string } = {
    'MW': '#FFFFFF',  // 백색
    'LG': '#E5E5E5',  // 연회색
    'DG': '#808080',  // 진회색
    'BK': '#000000',  // 블랙
    'DB': '#6B4423',  // 다크브라운
    'LB': '#A0826D',  // 연브라운
    'WN': '#8B6F47',  // 월넛
    'OK': '#D2691E',  // 오크
    'PN': '#FFF5E6',  // 파인
    'RD': '#FF0000',  // 빨강
    'BL': '#0000FF',  // 파랑
    'GR': '#00FF00',  // 초록
    'YL': '#FFFF00',  // 노랑
    'OR': '#FFA500',  // 주황
    'PP': '#800080',  // 보라
  };
  return colorMap[colorCode] || '#CCCCCC';
};

// 재질 이름 매핑
const getMaterialName = (material: string): string => {
  const materialMap: { [key: string]: string } = {
    'PB': 'PB (파티클보드)',
    'MDF': 'MDF',
    'PLY': '합판',
    'HPL': 'HPL (고압라미네이트)',
    'LPM': 'LPM (저압멜라민)',
  };
  return materialMap[material] || material;
};

const CNCOptimizer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { basicInfo } = useProjectStore();
  const { theme } = useTheme();
  
  // URL 파라미터에서 프로젝트 ID와 디자인 파일 ID 가져오기
  const projectId = searchParams.get('projectId');
  const designFileId = searchParams.get('designFileId');
  
  // Use live panel data hook for real-time synchronization
  const { panels: livePanels, normalizedPanels: liveNormalizedPanels, stats: panelStats, isLoading } = useLivePanelData();
  
  const [activeTab, setActiveTab] = useState<'panels' | 'stock' | 'optimization'>('panels');
  const [selectedPanels, setSelectedPanels] = useState<Set<string>>(new Set());
  const [stockPanels, setStockPanels] = useState<StockPanel[]>([]);
  const [optimizationResult, setOptimizationResult] = useState<OptimizedResult[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  
  // Use live panels instead of local state
  const panelsList = livePanels;
  
  // 프로젝트 정보 가져오기
  const projectInfo = useMemo(() => {
    return {
      name: basicInfo?.title || '새 프로젝트',
      location: basicInfo?.location || '',
      customer: basicInfo?.customerName || '',
    };
  }, [basicInfo]);

  // Live panel data is now handled by useLivePanelData hook
  // Panel updates are automatic when furniture changes in Configurator

  // 기본 재고 패널 설정
  useEffect(() => {
    const defaultStock: StockPanel[] = [
      {
        id: 'stock-1',
        width: 2440,
        height: 1220,
        material: 'PB',
        color: 'MW',
        price: 50000,
        stock: 10
      },
      {
        id: 'stock-2',
        width: 2440,
        height: 1220,
        material: 'PB',
        color: 'LG',
        price: 52000,
        stock: 8
      },
      {
        id: 'stock-3',
        width: 2440,
        height: 1220,
        material: 'MDF',
        color: 'MW',
        price: 45000,
        stock: 15
      },
      {
        id: 'stock-4',
        width: 2440,
        height: 1220,
        material: 'PLY',
        color: 'WN',
        price: 75000,
        stock: 5
      }
    ];
    setStockPanels(defaultStock);
  }, []);

  // 선택된 패널 목록
  const selectedPanelsList = useMemo(() => {
    return panelsList.filter(panel => selectedPanels.has(panel.id));
  }, [panelsList, selectedPanels]);

  // 재질별 그룹화
  const panelGroups = useMemo(() => {
    const groups: { [key: string]: PanelGroup } = {};
    
    selectedPanelsList.forEach(panel => {
      const key = `${panel.material}-${panel.color}`;
      if (!groups[key]) {
        groups[key] = {
          material: panel.material,
          color: panel.color,
          panels: [],
          totalArea: 0,
          totalQuantity: 0
        };
      }
      groups[key].panels.push(panel);
      const area = (panel.width * panel.height * panel.quantity) / 1000000; // m²로 변환
      groups[key].totalArea += area;
      groups[key].totalQuantity += panel.quantity;
    });

    return Object.values(groups);
  }, [selectedPanelsList]);

  // 필터링된 패널 목록
  const filteredPanels = useMemo(() => {
    return panelsList.filter(panel => {
      if (selectedMaterial !== 'all' && panel.material !== selectedMaterial) return false;
      if (selectedColor !== 'all' && panel.color !== selectedColor) return false;
      return true;
    });
  }, [panelsList, selectedMaterial, selectedColor]);

  // 사용 가능한 재질과 색상
  const availableMaterials = useMemo(() => {
    const materials = new Set(panelsList.map(p => p.material));
    return Array.from(materials);
  }, [panelsList]);

  const availableColors = useMemo(() => {
    const colors = new Set(panelsList.map(p => p.color));
    return Array.from(colors);
  }, [panelsList]);

  // 패널 선택 토글
  const handlePanelToggle = (panelId: string) => {
    setSelectedPanels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(panelId)) {
        newSet.delete(panelId);
      } else {
        newSet.add(panelId);
      }
      return newSet;
    });
  };

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedPanels.size === filteredPanels.length) {
      setSelectedPanels(new Set());
    } else {
      setSelectedPanels(new Set(filteredPanels.map(p => p.id)));
    }
  };

  // 패널 수량 변경 - Live data mode에서는 Configurator에서 변경해야 함
  const handleQuantityChange = (panelId: string, delta: number) => {
    // In live mode, quantity changes should be made in the Configurator
    showToast('패널 수량은 Configurator에서 변경해주세요', 'info');
  };

  // 최적화 실행 - 멀티 빈 패킹 사용
  const handleOptimize = async () => {
    if (selectedPanelsList.length === 0) return;

    setIsOptimizing(true);
    setActiveTab('optimization');

    // 재질별로 그룹화하여 최적화
    const allResults: OptimizedResult[] = [];

    for (const group of panelGroups) {
      // 해당 재질/색상의 재고 패널 찾기
      const matchingStock = stockPanels.find(
        stock => stock.material === group.material && stock.color === group.color
      );

      if (matchingStock) {
        // 멀티 빈 패킹으로 여러 원장에 최적화
        const results = await optimizePanelsMultiple(group.panels, matchingStock);
        allResults.push(...results);
      }
    }

    setOptimizationResult(allResults);
    setIsOptimizing(false);
  };

  // DXF 내보내기
  const handleExportDXF = () => {
    if (optimizationResult.length === 0) return;
    
    const dxfContent = generateDXF(optimizationResult);
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectInfo.name}_cutting_plan.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV 내보내기 - Live normalized panels 사용
  const handleExportCSV = () => {
    // 선택된 패널만 필터링하거나 전체 사용
    const panelsToExport = selectedPanelsList.length > 0 
      ? liveNormalizedPanels.filter(p => selectedPanels.has(p.id))
      : liveNormalizedPanels;
    
    if (panelsToExport.length === 0) {
      showToast('내보낼 패널이 없습니다', 'error');
      return;
    }
    
    // 재고 패널 변환
    const stockSheets = stockPanels.map(stock => ({
      id: stock.id,
      label: `${stock.material}_${stock.color}`,
      width: stock.width,
      length: stock.height,
      thickness: 18,
      quantity: stock.stock || 999,
      material: stock.material
    }));
    
    // CSV 내보내기
    exportCutList(panelsToExport, stockSheets, projectInfo.name);
  };


  return (
    <div className={styles.container}>
      {/* 헤더 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button 
            className={styles.backButton}
            onClick={() => {
              // URL 파라미터를 포함하여 Configurator로 돌아가기
              const params = new URLSearchParams();
              if (projectId) params.set('projectId', projectId);
              if (designFileId) params.set('designFileId', designFileId);
              params.set('from', 'cnc'); // CNC에서 돌아왔음을 표시
              const queryString = params.toString();
              navigate(`/configurator${queryString ? `?${queryString}` : ''}`);
            }}
          >
            <ArrowLeft size={18} />
            <span>돌아가기</span>
          </button>
          <div>
            <h1 className={styles.title}>CNC 옵티마이저</h1>
            <p className={styles.subtitle}>
              패널 재단 최적화 도구
              {/* Live sync indicator */}
              <span style={{ 
                marginLeft: '12px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '4px',
                fontSize: '12px',
                color: isLoading ? 'var(--theme-warning)' : 'var(--theme-success)'
              }}>
                {isLoading ? <WifiOff size={14} /> : <Wifi size={14} />}
                {isLoading ? '동기화 중...' : 'Live 연결됨'}
              </span>
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.headerStat}>
            <span className={styles.statLabel}>전체 패널</span>
            <span className={styles.statValue}>{panelStats.totalPanels}</span>
          </div>
          <div className={styles.headerStat}>
            <span className={styles.statLabel}>총 수량</span>
            <span className={styles.statValue}>{panelStats.totalQuantity}</span>
          </div>
          <div className={styles.headerStat}>
            <span className={styles.statLabel}>재질 그룹</span>
            <span className={styles.statSmall}>{panelStats.materialGroups.length}개</span>
          </div>
          <button
            className={styles.csvExportButton}
            onClick={handleExportCSV}
            disabled={panelsList.length === 0}
            title="CutList CSV 내보내기"
          >
            <FileSpreadsheet size={18} />
            <span>CSV 내보내기</span>
          </button>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tabButton} ${activeTab === 'panels' ? styles.active : ''}`}
          onClick={() => setActiveTab('panels')}
        >
          <Package size={18} />
          <span>패널 목록</span>
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'stock' ? styles.active : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          <Layers size={18} />
          <span>원장 재고</span>
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'optimization' ? styles.active : ''}`}
          onClick={() => setActiveTab('optimization')}
        >
          <Zap size={18} />
          <span>최적화 결과</span>
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      <div className={styles.content}>
        <div className={styles.tabContent}>
          {activeTab === 'panels' && (
            <div className={styles.panelsTab}>
              {/* 좌측: 패널 목록 */}
              <div className={styles.leftPanel}>
                <div className={styles.panelList}>
                  <div className={styles.panelListHeader}>
                    <div className={styles.panelListTitle}>
                      <Package size={20} />
                      <span>패널 목록</span>
                      <button 
                        className={styles.filterButton}
                        onClick={handleSelectAll}
                      >
                        {selectedPanels.size === filteredPanels.length ? '전체 해제' : '전체 선택'}
                      </button>
                    </div>
                    <div className={styles.filterButtons}>
                      <select
                        className={styles.filterButton}
                        value={selectedMaterial}
                        onChange={(e) => setSelectedMaterial(e.target.value)}
                      >
                        <option value="all">모든 재질</option>
                        {availableMaterials.map(mat => (
                          <option key={mat} value={mat}>{getMaterialName(mat)}</option>
                        ))}
                      </select>
                      <select
                        className={styles.filterButton}
                        value={selectedColor}
                        onChange={(e) => setSelectedColor(e.target.value)}
                      >
                        <option value="all">모든 색상</option>
                        {availableColors.map(color => (
                          <option key={color} value={color}>{color}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className={styles.panelListContent}>
                    {filteredPanels.map(panel => (
                      <PanelListItem
                        key={panel.id}
                        panel={panel}
                        isSelected={selectedPanels.has(panel.id)}
                        onToggle={() => handlePanelToggle(panel.id)}
                        onQuantityChange={(delta) => handleQuantityChange(panel.id, delta)}
                        getColorHex={getColorHex}
                        getMaterialName={getMaterialName}
                      />
                    ))}
                  </div>
                </div>

                {/* 재질별 통계 */}
                <div className={styles.materialStats}>
                  {panelGroups.map((group, index) => (
                    <React.Fragment key={`${group.material}-${group.color}`}>
                      {index > 0 && <div className={styles.statDivider}>•</div>}
                      <div className={styles.statItem}>
                        <div 
                          className={styles.statDot} 
                          style={{ backgroundColor: getColorHex(group.color) }}
                        />
                        <span className={styles.statMiniValue}>{group.totalQuantity}장</span>
                        <span className={styles.statMiniLabel}>{group.material}</span>
                        <span className={styles.statMiniSubtext}>({group.totalArea.toFixed(2)}m²)</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              
              {/* 우측: 2D 패널 뷰어 */}
              <div className={styles.rightPanel}>
                <div className={styles.previewViewer}>
                  <div className={styles.previewHeader}>
                    <div>
                      <h3 className={styles.previewTitle}>
                        <Eye size={18} />
                        패널 미리보기
                      </h3>
                    </div>
                    <div className={styles.exportSection}>
                      <span className={styles.exportLabel}>CutList 내보내기:</span>
                      <button 
                        className={styles.quickExportButton}
                        onClick={() => {
                          const panelsToExport = selectedPanelsList.length > 0 
                            ? liveNormalizedPanels.filter(p => selectedPanels.has(p.id))
                            : liveNormalizedPanels;
                          if (panelsToExport.length === 0) {
                            showToast('내보낼 패널이 없습니다', 'error');
                            return;
                          }
                          exportPanelsCsv(panelsToExport, `${projectInfo.name}_panels.csv`);
                        }}
                        disabled={panelsList.length === 0}
                        title="패널만 내보내기"
                      >
                        <FileSpreadsheet size={16} />
                        빠른 내보내기
                      </button>
                      <button 
                        className={styles.fullExportButton}
                        onClick={handleExportCSV}
                        disabled={panelsList.length === 0}
                        title="패널과 재고 모두 내보내기"
                      >
                        <Download size={16} />
                        전체 내보내기
                      </button>
                    </div>
                  </div>
                  <div className={styles.previewContent}>
                    {selectedPanelsList.length > 0 ? (
                      <CuttingLayoutPreview 
                        panels={selectedPanelsList} 
                        stockPanels={stockPanels}
                      />
                    ) : (
                      <div className={styles.emptyPreview}>
                        <Package size={48} />
                        <p className={styles.emptyText}>
                          미리보기할 패널을 선택하세요
                        </p>
                      </div>
                    )}
                  </div>
                  {selectedPanelsList.length > 0 && (
                    <div className={styles.previewStats}>
                      <div className={styles.previewStatItem}>
                        <span className={styles.previewStatLabel}>선택된 패널:</span>
                        <span className={styles.previewStatValue}>
                          {selectedPanelsList.length}개
                        </span>
                      </div>
                      <div className={styles.previewStatItem}>
                        <span className={styles.previewStatLabel}>총 수량:</span>
                        <span className={styles.previewStatValue}>
                          {selectedPanelsList.reduce((sum, p) => sum + p.quantity, 0)}장
                        </span>
                      </div>
                      <div className={styles.previewStatItem}>
                        <span className={styles.previewStatLabel}>총 면적:</span>
                        <span className={styles.previewStatValue}>
                          {selectedPanelsList.reduce((sum, p) => 
                            sum + (p.width * p.height * p.quantity / 1000000), 0
                          ).toFixed(2)}m²
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stock' && (
            <div className={styles.stockTab}>
              <div className={styles.stockHeader}>
                <h2 className={styles.stockTitle}>
                  <Layers size={20} />
                  원장 재고 관리
                </h2>
                <button className={styles.addStockButton}>
                  <Plus size={18} />
                  <span>원장 추가</span>
                </button>
              </div>
              <div className={styles.stockGrid}>
                {stockPanels.map(stock => (
                  <StockItem
                    key={stock.id}
                    stock={stock}
                    getColorHex={getColorHex}
                    getMaterialName={getMaterialName}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'optimization' && (
            <div className={styles.optimizationTab}>
              <div className={styles.optimizationLeft}>
                <div className={styles.optimizationSettings}>
                  <h3 className={styles.settingsTitle}>
                    <Settings size={18} />
                    최적화 설정
                  </h3>
                  <div className={styles.settingItem}>
                    <span className={styles.settingLabel}>재단 여유</span>
                    <div className={styles.settingControl}>
                      <input 
                        type="number" 
                        className={styles.settingInput}
                        defaultValue="3"
                        min="0"
                        max="10"
                      />
                      <span className={styles.settingUnit}>mm</span>
                    </div>
                  </div>
                  <div className={styles.settingItem}>
                    <span className={styles.settingLabel}>회전 허용</span>
                    <div className={styles.settingControl}>
                      <div className={`${styles.toggleSwitch} ${styles.active}`} />
                    </div>
                  </div>
                  <div className={styles.settingItem}>
                    <span className={styles.settingLabel}>최소 효율</span>
                    <div className={styles.settingControl}>
                      <input 
                        type="number" 
                        className={styles.settingInput}
                        defaultValue="85"
                        min="50"
                        max="100"
                      />
                      <span className={styles.settingUnit}>%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.optimizationRight}>
                <div className={styles.optimizationResults}>
                  <div className={styles.resultsHeader}>
                    <h3 className={styles.resultsTitle}>
                      <Zap size={18} />
                      최적화 결과
                    </h3>
                    {optimizationResult.length > 0 && (
                      <button 
                        className={styles.exportButton}
                        onClick={handleExportDXF}
                      >
                        <Download size={16} />
                        <span>DXF 내보내기</span>
                      </button>
                    )}
                  </div>
                  <div className={styles.resultsContent}>
                    {optimizationResult.length > 0 ? (
                      optimizationResult.map((result, index) => (
                        <OptimizationResult
                          key={index}
                          result={result}
                          getColorHex={getColorHex}
                          getMaterialName={getMaterialName}
                        />
                      ))
                    ) : (
                      <div className={styles.emptyPreview}>
                        <Zap size={48} />
                        <p className={styles.emptyText}>
                          패널을 선택하고 최적화를 실행하세요
                        </p>
                      </div>
                    )}
                  </div>
                  {optimizationResult.length > 0 && (
                    <div className={styles.previewStats}>
                      <div className={styles.previewStatItem}>
                        <span className={styles.previewStatLabel}>총 원장:</span>
                        <span className={styles.previewStatValue}>
                          {optimizationResult.length}장
                        </span>
                      </div>
                      <div className={styles.previewStatItem}>
                        <span className={styles.previewStatLabel}>전체 패널:</span>
                        <span className={styles.previewStatValue}>
                          {optimizationResult.reduce((sum, sheet) => sum + sheet.panels.length, 0)}개
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 푸터 */}
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <div className={styles.footerStat}>
            <span className={styles.footerStatLabel}>선택된 패널</span>
            <span className={styles.footerStatValue}>
              {selectedPanelsList.length}개
            </span>
            <span className={styles.footerStatDivider}>•</span>
            <span className={styles.footerStatItem}>
              총 {selectedPanelsList.reduce((sum, p) => sum + p.quantity, 0)}장
            </span>
          </div>
        </div>
        <div className={styles.footerRight}>
          <button 
            className={styles.optimizeButton}
            disabled={selectedPanelsList.length === 0 || isOptimizing}
            onClick={handleOptimize}
          >
            <Zap size={18} />
            <span>{isOptimizing ? '최적화 중...' : '최적화 실행'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CNCOptimizer;