import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { CNCProvider, useCNCStore } from './store';
import { useLivePanelData } from './hooks/useLivePanelData';
import { useProjectStore } from '@/store/core/projectStore';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Zap, Play, Pause, ChevronDown, ChevronRight, ChevronUp, Layout, Package, Grid3x3, Cpu, LogOut, Settings2 } from 'lucide-react';
import Logo from '@/components/common/Logo';
import { initializeTheme } from '@/theme';

// Components
import PanelsTable from './components/SidebarLeft/PanelsTable';
import StockTable from './components/SidebarLeft/StockTable';
import OptionsCard from './components/SidebarLeft/OptionsCard';
import ExportBar from './components/ExportBar';
import CuttingLayoutPreview2 from './components/CuttingLayoutPreview2';
import SheetThumbnail from './components/SheetThumbnail';
import ModeTabs from './components/ModeTabs';
import AILoadingModal from './components/AILoadingModal';
import ExitConfirmModal from './components/ExitConfirmModal';

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
    settings, setSettings,
    selectedPanelId, setSelectedPanelId,
    currentSheetIndex, setCurrentSheetIndex,
    userHasModifiedPanels, setUserHasModifiedPanels,
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
  const pendingResultsRef = useRef<OptimizedResult[]>([]); // Store results temporarily in ref
  
  // 뷰어 상태 (미리보기와 동기화)
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerRotation, setViewerRotation] = useState(-90); // 기본값 -90 (가로뷰)
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 });
  const [showCuttingList, setShowCuttingList] = useState(true); // 컷팅 리스트 탭 기본 선택
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set()); // 펼쳐진 시트 인덱스들
  const [showTotalStats, setShowTotalStats] = useState(true); // 전체 통계 표시 여부
  const [showSheetStats, setShowSheetStats] = useState(true); // 시트 통계 표시 여부
  const [methodChanged, setMethodChanged] = useState(false); // 메소드 변경 여부
  
  // AI Loading state
  const [showAILoading, setShowAILoading] = useState(false);
  const [aiLoadingProgress, setAILoadingProgress] = useState(0);
  const [aiLoadingDuration, setAILoadingDuration] = useState(5000);
  
  // Exit confirmation state
  const [showExitConfirm, setShowExitConfirm] = useState(false);


  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPanelId(null);
      }
      
      // Arrow key navigation for sheets
      if (optimizationResults.length > 0) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setCurrentSheetIndex(prev => Math.max(0, prev - 1));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setCurrentSheetIndex(prev => Math.min(optimizationResults.length - 1, prev + 1));
        }
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
  }, [setSelectedPanelId, optimizationResults.length, setCurrentSheetIndex]);

  // Auto-optimization trigger ref to ensure it only runs once
  const hasAutoOptimized = useRef(false);
  // Track if panels have been initialized from livePanels
  const hasInitializedFromLive = useRef(false);

  // Initialize with live data - only run once on mount
  useEffect(() => {
    console.log('=== CNCOptimizerPro Initialization ===');
    console.log('livePanels from hook:', livePanels);
    console.log('livePanels.length:', livePanels.length);
    console.log('current panels in store:', panels);
    console.log('current stock in store:', stock);
    
    // If livePanels changed and we have panels from furniture, reset the user modified flag
    if (livePanels.length > 0) {
      // Reset user modified flag since we're getting fresh data from configurator
      setUserHasModifiedPanels(false);
      localStorage.removeItem('cnc_user_modified');
    }
    
    // Skip initialization if user has already modified panels AFTER checking livePanels
    if (userHasModifiedPanels && livePanels.length === 0) {
      console.log('User has modified panels and no live panels, keeping user panels');
      return;
    }
    
    // Clear panels if no furniture is placed and panels are from old localStorage
    // But don't clear if user manually added panels (empty panels with width/length = 0)
    if (livePanels.length === 0 && panels.length > 0) {
      // Check if panels are user-added empty panels
      const hasEmptyPanels = panels.some(p => p.width === 0 || p.length === 0 || p.label === '');
      
      if (!hasEmptyPanels) {
        // Only clear if there are no user-added empty panels
        const savedPanels = localStorage.getItem('cnc_panels');
        if (savedPanels) {
          // Clear old panels since no furniture is currently placed
          console.log('Clearing old panels from localStorage');
          setPanels([]);
          localStorage.removeItem('cnc_panels');
        }
      }
    }
    
    // Convert live panels to CutList format - always update when we have live panels
    if (livePanels.length > 0) {
      // Always use live panels when they exist (even after refresh)
      if (!hasInitializedFromLive.current || panels.length === 0) {
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
            canRotate: true // CNC 최적화에서는 기본적으로 회전 가능 (나중에 설정에 따라 조정됨)
          };
        });
        
        console.log('Setting panels from livePanels:', cutlistPanels);
        setPanels(cutlistPanels);
        hasInitializedFromLive.current = true;
      }
    } else if (livePanels.length === 0 && !userHasModifiedPanels) {
      // No furniture placed and user hasn't modified - check for old panels
      const hasEmptyPanels = panels.some(p => p.width === 0 || p.length === 0 || p.label === '');
      
      if (!hasEmptyPanels && panels.length > 0) {
        // Only clear if there are no user-added empty panels
        console.log('No furniture placed and no user panels - clearing panels');
        setPanels([]);
      }
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

    // Initialize theme from localStorage
    initializeTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount
  
  // Separate effect for live panels initialization - only when they change and user hasn't modified
  useEffect(() => {
    if (userHasModifiedPanels) {
      console.log('User has modified panels, skipping livePanels sync');
      return;
    }
    
    if (livePanels.length > 0 && !hasInitializedFromLive.current) {
      console.log('Initializing from livePanels');
      const cutlistPanels: Panel[] = livePanels.map(p => {
        let width = p.width;
        let length = p.height;
        
        if (width > length) {
          width = p.height;
          length = p.width;
        }
        
        let grain = 'V';
        let material = p.material || 'PB';
        const panelName = (p.name || '').toLowerCase();
        if (panelName.includes('도어') || panelName.includes('door') || 
            panelName.includes('엔드') || panelName.includes('end')) {
          material = 'PET';
        }
        
        return {
          id: p.id,
          label: p.name || `Panel_${p.id}`,
          width: width,
          length: length,
          thickness: p.thickness || 18,
          quantity: p.quantity || 1,
          material: material,
          grain: grain,
          canRotate: true
        };
      });
      
      setPanels(cutlistPanels);
      hasInitializedFromLive.current = true;
    }
  }, [livePanels, userHasModifiedPanels, setPanels]);

  const handleOptimize = useCallback(async () => {
    
    if (panels.length === 0) {
      showToast('No panels to optimize', 'error');
      return;
    }

    if (stock.length === 0) {
      showToast('No stock sheets defined', 'error');
      return;
    }

    setIsOptimizing(true);
    setMethodChanged(false); // Calculate 시 강조 제거
    
    // Clear previous results immediately for cleaner experience
    setOptimizationResults([]);
    pendingResultsRef.current = []; // Clear any pending results
    
    // AI 로딩 모달 표시
    setShowAILoading(true);
    setAILoadingProgress(0);
    
    // Track animation start time for minimum duration
    const animationStartTime = Date.now();
    
    // 설정값을 전역 변수로 저장 (뷰어에서 접근 가능하도록)
    (window as any).cncSettings = settings;
    
    // Calculate total panels to estimate loading time
    const totalPanels = panels.reduce((sum, p) => sum + (p.quantity || 1), 0);
    
    // Determine loading duration based on estimated sheet count
    // Rough estimate: ~10 panels per sheet
    const estimatedSheets = Math.ceil(totalPanels / 10);
    let loadingDuration = 3000; // Default 3 seconds for <5 sheets
    
    if (estimatedSheets >= 30) {
      loadingDuration = 8000; // 8 seconds for 30+ sheets
    } else if (estimatedSheets >= 20) {
      loadingDuration = 6000; // 6 seconds for 20-30 sheets
    } else if (estimatedSheets >= 10) {
      loadingDuration = 4000; // 4 seconds for 10-20 sheets
    } else if (estimatedSheets >= 5) {
      loadingDuration = 3500; // 3.5 seconds for 5-10 sheets
    }
    
    // Set the loading duration for the modal
    setAILoadingDuration(loadingDuration);
    
    // Smooth progress based on calculated duration
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - animationStartTime;
      const progress = Math.min((elapsed / loadingDuration) * 100, 95); // 0 to 95% over duration
      setAILoadingProgress(progress);
      
      if (elapsed >= loadingDuration) {
        clearInterval(progressInterval);
      }
    }, 50); // Update every 50ms for smooth animation
    
    // Delay the actual optimization to make loading feel more natural
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      
      // Group panels by material AND thickness
      const panelGroups = new Map<string, Panel[]>();
      
      panels.forEach(panel => {
        // Apply grain and rotation settings
        let processedPanel = { ...panel };
        
        // 패널 치수를 그대로 사용 (width와 length를 변경하지 않음)
        // console.log(`Panel ${panel.label}: ${panel.width}x${panel.length} (grain: ${panel.grain}, thickness: ${panel.thickness}mm)`);
        
        // CNC 최적화 모드에서는 결방향 무시하고 무조건 회전 가능 (효율 극대화)
        // BY_LENGTH, BY_WIDTH 모드에서만 결방향 고려
        if (settings.optimizationType === 'OPTIMAL_CNC') {
          // CNC 최적화: 테트리스처럼 최대 효율로 배치 - 결방향 무시
          processedPanel.canRotate = true;
        } else {
          // 세로/가로 절단 모드: 결방향 고려 설정에 따름
          if (settings.considerGrain && panel.grain && (panel.grain === 'V' || panel.grain === 'H')) {
            processedPanel.canRotate = false;
          } else if (!settings.considerGrain) {
            processedPanel.canRotate = true;
          } else {
            processedPanel.canRotate = true;
          }
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
          
          // Add small delay to make process feel more substantial
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Run optimization with adjusted stock size
          const results = await optimizePanelsMultiple(
            optimizerPanels,
            adjustedStockPanel, // 여백을 제외한 크기 사용
            settings.singleSheetOnly ? 1 : 999, // 제한 없음
            settings.alignVerticalCuts !== false, // Use aligned packing by default
            settings.kerf || 5, // 톱날 두께 전달
            settings.optimizationType || 'OPTIMAL_CNC' // 최적화 타입 전달
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
      
      // Store results temporarily instead of showing immediately
      pendingResultsRef.current = finalResults;
      
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
      
      // Calculate actual loading duration based on actual sheet count
      const actualSheetCount = allResults.length;
      let actualLoadingDuration = 3000; // Default 3 seconds for <5 sheets
      
      if (actualSheetCount >= 30) {
        actualLoadingDuration = 8000; // 8 seconds for 30+ sheets
      } else if (actualSheetCount >= 20) {
        actualLoadingDuration = 6000; // 6 seconds for 20-30 sheets
      } else if (actualSheetCount >= 10) {
        actualLoadingDuration = 4000; // 4 seconds for 10-20 sheets
      } else if (actualSheetCount >= 5) {
        actualLoadingDuration = 3500; // 3.5 seconds for 5-10 sheets
      }
      
      // Ensure minimum loading duration based on sheet count
      const elapsedTime = Date.now() - animationStartTime;
      const remainingTime = Math.max(0, actualLoadingDuration - elapsedTime);
      
      // Complete to 100% after minimum time
      setTimeout(() => {
        // Clear any remaining interval
        clearInterval(progressInterval);
        
        // Animate to 100%
        setAILoadingProgress(100);
        
        // Hide AI loading modal after showing 100% briefly
        setTimeout(async () => {
          setShowAILoading(false);
          setAILoadingProgress(0);
          
          if (allResults.length > 0) {
            const totalPanels = allResults.reduce((sum, r) => sum + r.panels.length, 0);
            const avgEfficiency = allResults.reduce((sum, r) => sum + r.efficiency, 0) / allResults.length;
            
            // Show success popup and wait for confirmation
            await showToast(`최적화 완료! ${totalPanels}개 패널, ${allResults.length}개 시트 (평균 효율: ${avgEfficiency.toFixed(1)}%)`, 'success');
            
            // After user clicks confirm, show the results
            setOptimizationResults(pendingResultsRef.current);
            
            // Set appropriate sheet index
            if (currentSheetIndex >= pendingResultsRef.current.length && pendingResultsRef.current.length > 0) {
              setCurrentSheetIndex(pendingResultsRef.current.length - 1);
            } else if (currentSheetIndex < 0 && pendingResultsRef.current.length > 0) {
              setCurrentSheetIndex(0);
            }
            
            // Clear pending results
            pendingResultsRef.current = [];
          } else {
            await showToast('최적화 실패: 패널을 배치할 수 없습니다', 'error');
          }
        }, 300); // Show 100% for 300ms
      }, remainingTime);
    } catch (error) {
      // console.error('Optimization error:', error);
      clearInterval(progressInterval);
      setShowAILoading(false);
      setAILoadingProgress(0);
      showToast('Optimization failed', 'error');
    } finally {
      setIsOptimizing(false);
    }
  }, [panels, stock, settings, setPlacements, setCurrentSheetIndex, setSawStats]);
  
  // Auto-optimize effect - must be after handleOptimize definition
  useEffect(() => {
    // Run auto-optimization when we first get both panels and stock
    // Use ref to ensure it only runs once
    if (!hasAutoOptimized.current && panels.length > 0 && stock.length > 0) {
      hasAutoOptimized.current = true;
      
      // Small delay to ensure UI is ready
      setTimeout(() => {
        handleOptimize();
      }, 100);
    }
  }, [panels, stock, handleOptimize]);

  const projectName = basicInfo?.title || 'New Project';
  
  // 컷팅 메소드 드롭다운 컴포넌트
  const CuttingMethodDropdown = () => {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const methodLabels = {
      'OPTIMAL_L': 'L방향 우선',
      'OPTIMAL_W': 'W방향 우선', 
      'OPTIMAL_CNC': 'CNC 최적화'
    };

    // 드롭다운 외부 클릭 감지
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setShowDropdown(false);
        }
      };

      if (showDropdown) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [showDropdown]);

    const handleMethodChange = (method: 'OPTIMAL_L' | 'OPTIMAL_W' | 'OPTIMAL_CNC') => {
      setSettings({ optimizationType: method });
      setShowDropdown(false);
      setMethodChanged(true); // Calculate 버튼 강조를 위한 플래그
    };

    return (
      <div className={styles.dropdownContainer} ref={dropdownRef}>
        <button 
          className={styles.dropdownButton}
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <span>{methodLabels[settings.optimizationType || 'OPTIMAL_CNC']}</span>
          <ChevronDown size={14} className={showDropdown ? styles.rotated : ''} />
        </button>
        
        {showDropdown && (
          <div className={styles.dropdownMenu}>
            {Object.entries(methodLabels).map(([key, label]) => (
              <button
                key={key}
                className={`${styles.dropdownItem} ${settings.optimizationType === key ? styles.active : ''}`}
                onClick={() => handleMethodChange(key as 'OPTIMAL_L' | 'OPTIMAL_W' | 'OPTIMAL_CNC')}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

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
          mode: settings.optimizationType === 'OPTIMAL_CNC' ? 'free' : 'guillotine',
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
          <CuttingMethodDropdown />
          <div className={styles.divider} />
          <button 
            className={`${styles.calculateButton} ${methodChanged ? styles.highlighted : ''}`}
            onClick={handleOptimize}
            disabled={isOptimizing || panels.length === 0}
          >
            <Play size={18} />
            <span>Calculate</span>
          </button>
          <div className={styles.exportGroup}>
            <ExportBar optimizationResults={optimizationResults} />
          </div>
          <div className={styles.divider} />
          <button 
            className={styles.exitButton}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowExitConfirm(true);
            }}
            type="button"
          >
            <LogOut size={16} />
            나가기
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
              {/* Keyboard navigation hint */}
              {optimizationResults.length > 1 && (
                <div className={styles.keyboardHint}>
                  <span>← → 방향키로 시트 이동</span>
                </div>
              )}
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
              <Cpu size={48} />
              <h3>최적화 결과가 없습니다</h3>
              <p>패널과 원자재를 설정한 후 "최적화" 버튼을 클릭하세요</p>
              <button 
                className={`${styles.optimizeButtonLarge} ${styles.primary}`}
                onClick={handleOptimize}
                disabled={isOptimizing}
              >
                {isOptimizing ? '최적화 중...' : '패널생성'}
              </button>
            </div>
          )}
        </div>

        {/* Right Sidebar - Stats */}
        <div className={styles.rightSidebar}>
          <div className={styles.rightSidebarContent}>
            <div className={styles.statsCard}>
              <div className={styles.statsCardTitle}>
                <h3>전체 통계</h3>
                <button
                  className={styles.foldButton}
                  onClick={() => setShowTotalStats(!showTotalStats)}
                >
                  {showTotalStats ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {showTotalStats && (
              <div className={styles.statsDetail}>
                <div className={styles.statRow}>
                  <span>시트 수</span>
                  <div className={styles.statValue}>
                    <strong>{optimizationResults.length}</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>사용 면적</span>
                  <div className={styles.statValue}>
                    <strong>{(optimizationResults.reduce((sum, r) => sum + r.usedArea, 0) / 1000000).toFixed(1)}</strong>
                    <span className={styles.statPercent}>
                      {optimizationResults.length > 0
                        ? Math.round(optimizationResults.reduce((sum, r) => sum + r.efficiency, 0) / optimizationResults.length)
                        : 0}%
                    </span>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>폐기 면적</span>
                  <div className={styles.statValue}>
                    <strong>{(optimizationResults.reduce((sum, r) => sum + r.wasteArea, 0) / 1000000).toFixed(1)}</strong>
                    <span className={styles.statPercent}>
                      {optimizationResults.length > 0
                        ? Math.round((100 - optimizationResults.reduce((sum, r) => sum + r.efficiency, 0) / optimizationResults.length))
                        : 0}%
                    </span>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>총 패널</span>
                  <div className={styles.statValue}>
                    <strong>{optimizationResults.reduce((sum, r) => sum + r.panels.length, 0)}</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>절단 횟수</span>
                  <div className={styles.statValue}>
                    <strong>{allCutSteps.length}</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>절단 길이</span>
                  <div className={styles.statValue}>
                    <strong>{sawStats.total.toFixed(2)}m</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>톱날 두께</span>
                  <div className={styles.statValue}>
                    <strong>{settings.kerf || 5}mm</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>원자재</span>
                  <div className={styles.statValue}>
                    {stock.length > 0 ? `${stock[0].width}×${stock[0].length}` : '-'}
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>최적화</span>
                  <div className={styles.statValue}>
                    {settings.optimizationType === 'OPTIMAL_CNC' ? '최소폐기' : 
                     settings.optimizationType === 'BY_LENGTH' ? '세로절단' : '가로절단'}
                  </div>
                </div>
              </div>
              )}
            </div>

            {optimizationResults[currentSheetIndex] && (
              <div className={styles.statsCard}>
                <div className={styles.statsCardTitle}>
                  <h3>시트 통계</h3>
                  <button
                    className={styles.foldButton}
                    onClick={() => setShowSheetStats(!showSheetStats)}
                  >
                    {showSheetStats ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
                {showSheetStats && (
                <>
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
                      if (simulating) {
                        // 시뮬레이션 정지
                        setSimulating(false);
                      } else {
                        // 현재 시트의 컷팅 시뮬레이션 시작
                        setSelectedPanelId(null); // Clear selected panel for full sheet simulation
                        setSelectedSheetId(String(currentSheetIndex + 1));
                        setSimulating(true);
                      }
                    }}
                    title={simulating ? "시뮬레이션 정지" : "컷팅 시뮬레이션"}
                  >
                    {simulating ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>
                <div className={styles.statsDetail}>
                  <div className={styles.statRow}>
                    <span>패널 수</span>
                    <div className={styles.statValue}>
                      <strong>{optimizationResults[currentSheetIndex].panels.length}</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>효율</span>
                    <div className={styles.statValue}>
                      <strong>{optimizationResults[currentSheetIndex].efficiency.toFixed(1)}%</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>사용 면적</span>
                    <div className={styles.statValue}>
                      <strong>{(optimizationResults[currentSheetIndex].usedArea / 1000000).toFixed(2)}㎡</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>폐기 면적</span>
                    <div className={styles.statValue}>
                      <strong>{(optimizationResults[currentSheetIndex].wasteArea / 1000000).toFixed(2)}㎡</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>절단 횟수</span>
                    <div className={styles.statValue}>
                      <strong>{
                        allCutSteps.filter(step => step.sheetNumber === currentSheetIndex + 1).length
                      }</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>절단 길이</span>
                    <div className={styles.statValue}>
                      <strong>{sawStats.bySheet[String(currentSheetIndex + 1)] 
                        ? sawStats.bySheet[String(currentSheetIndex + 1)].toFixed(2) + 'm'
                        : '0.00m'}</strong>
                    </div>
                  </div>
                </div>
                </>
                )}
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
      
      {/* AI Loading Modal */}
      <AILoadingModal 
        isOpen={showAILoading}
        progress={aiLoadingProgress}
        message="AI 최적화 계산 중"
        duration={aiLoadingDuration}
      />
      
      {/* Exit Confirmation Modal */}
      <ExitConfirmModal 
        isOpen={showExitConfirm}
        onConfirm={() => {
          console.log('Exit confirmed! Navigating to configurator...');
          window.location.href = '/configurator';
        }}
        onCancel={() => setShowExitConfirm(false)}
      />
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