import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { CNCProvider, useCNCStore } from './store';
import { useLivePanelData } from './hooks/useLivePanelData';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowLeftRight, Zap, Play, Pause, ChevronDown, ChevronRight, ChevronUp, Layout, Package, Grid3x3, Cpu, LogOut, Settings2 } from 'lucide-react';
import { GiCircularSawblade } from 'react-icons/gi';
import Logo from '@/components/common/Logo';
import { initializeTheme } from '@/theme';
import { useTranslation } from '@/i18n/useTranslation';
import { useTheme } from '@/contexts/ThemeContext';
import { useFurnitureBoring, calculateShelfBoringPositions, calculateSectionBoringPositions } from '@/domain/boring';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';

// Components
import PanelsTable from './components/SidebarLeft/PanelsTable';
import ExportBar from './components/ExportBar';
import SettingsModal from './components/SettingsModal';
import CuttingLayoutPreview2 from './components/CuttingLayoutPreview2';
import SheetThumbnail from './components/SheetThumbnail';
import ModeTabs from './components/ModeTabs';
import AILoadingModal from './components/AILoadingModal';
import ExitConfirmModal from './components/ExitConfirmModal';
import SimulationStatsModal from './components/SimulationStatsModal';
import PanelHighlight3DViewer from './components/PanelHighlight3DViewer';

// Utils
import { optimizePanelsMultiple } from './utils/optimizer';
import { showToast } from '@/utils/cutlist/csv';
import { buildSequenceForPanel, generateGuillotineCuts } from '@/utils/cut/simulate';
import { formatSize } from '@/utils/cut/format';
import { computeSawStats } from '@/utils/cut/stats';
import type { Panel, StockSheet, Placement } from '../../types/cutlist';
import { OptimizedResult, PlacedPanel } from './types';

// Styles
import styles from './CNCOptimizerPro.module.css';

function PageInner(){
  const navigate = useNavigate();
  const location = useLocation();
  const { basicInfo } = useProjectStore();
  const { placedModules } = useFurnitureStore();
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const { panels: livePanels } = useLivePanelData();
  const { t, currentLanguage } = useTranslation();
  const { theme } = useTheme();

  // Configurator에서 왔는지 확인
  const fromConfigurator = location.state?.fromConfigurator;

  // Configurator에서 온 경우 localStorage 초기화 ref
  const hasResetForConfigurator = useRef(false);

  // 디버그: 데이터 소스 확인
  useEffect(() => {
    console.log('🏠 CNCOptimizer 데이터 소스 확인:');
    console.log('  - fromConfigurator:', fromConfigurator);
    console.log('  - placedModules (furnitureStore):', placedModules.length, '개');
    console.log('  - placedModules 상세:', placedModules.map(m => ({
      id: m.id,
      moduleId: m.moduleId,
      moduleType: m.moduleType,
      width: m.width,
      depth: m.depth
    })));
    console.log('  - livePanels (useLivePanelData):', livePanels.length, '개');
    console.log('  - livePanels 상세:', livePanels.map(p => ({
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      material: p.material
    })));
  }, [fromConfigurator, placedModules, livePanels]);

  // 가구별 커스텀 선반 보링 위치 계산
  // 키는 moduleIndex 기반 (useLivePanelData의 패널 ID "m{moduleIndex}_p{panelIndex}"와 매칭)
  const customShelfPositionsByFurniture = useMemo(() => {
    const positionsMap: Record<string, number[]> = {};
    const internalSpace = calculateInternalSpace(spaceInfo);

    placedModules.forEach((placedModule, moduleIndex) => {
      // customSections가 있으면 사용, 없으면 원본 moduleData에서 가져옴
      let moduleData = (placedModule as any).moduleData
        || getModuleById(placedModule.moduleId, internalSpace, spaceInfo)
        || buildModuleDataFromPlacedModule(placedModule);
      if (!moduleData?.modelConfig?.sections) return;

      // customSections 적용
      if (placedModule.customSections) {
        moduleData = {
          ...moduleData,
          modelConfig: {
            ...moduleData.modelConfig,
            sections: placedModule.customSections
          }
        };
      }

      // 가구 높이 계산 (mm)
      const height = placedModule.customHeight || moduleData.dimensions.height;
      const basicThicknessMm = 18; // 기본 패널 두께

      // 실제 선반/패널 위치 계산
      const result = calculateShelfBoringPositions({
        sections: moduleData.modelConfig.sections,
        totalHeightMm: height,
        basicThicknessMm,
      });

      if (result.positions.length > 0) {
        // 키: "m{moduleIndex}" - useLivePanelData의 패널 ID와 매칭
        positionsMap[`m${moduleIndex}`] = result.positions;
      }
    });

    return positionsMap;
  }, [placedModules, spaceInfo]);

  // 보링 데이터 가져오기 - 커스텀 위치 사용
  const { panels: boringPanels } = useFurnitureBoring({
    useCustomPositions: true,
    customShelfPositionsByFurniture,
  });

  // URL에서 디자인파일 정보 가져오기
  const [designFileName, setDesignFileName] = useState<string>('');

  useEffect(() => {
    const loadDesignFileName = async () => {
      const searchParams = new URLSearchParams(location.search);
      const designFileId = searchParams.get('designFileId');
      const fileName = searchParams.get('designFileName') || searchParams.get('fileName');

      console.log('🔍 CNC Optimizer URL 파라미터 체크:', {
        designFileId,
        fileName,
        fullSearch: location.search,
        allParams: Object.fromEntries(searchParams.entries())
      });

      // 1순위: URL 파라미터에 designFileName이 있으면 바로 사용
      if (fileName) {
        const decodedName = decodeURIComponent(fileName);
        console.log('✅ URL 파라미터에서 디자인파일명 설정 (우선순위 1):', decodedName);
        setDesignFileName(decodedName);
        return;
      }

      // 2순위: designFileId로 Firebase에서 로드
      if (designFileId) {
        console.log('📂 designFileId로 디자인파일 로드 시작 (우선순위 2):', designFileId);
        try {
          const { getDesignFileById } = await import('@/firebase/projects');
          const { designFile, error } = await getDesignFileById(designFileId);

          console.log('📂 디자인파일 로드 결과:', {
            designFile,
            error,
            hasName: !!designFile?.name,
            name: designFile?.name
          });

          if (error) {
            console.error('❌ Firebase 에러:', error);
          }

          if (designFile?.name) {
            console.log('✅ 디자인파일명 설정:', designFile.name);
            setDesignFileName(designFile.name);

            // URL에 디자인파일명이 없으면 추가 (새로고침 시 유지하기 위해)
            const currentParams = new URLSearchParams(window.location.search);
            if (!currentParams.get('designFileName')) {
              currentParams.set('designFileName', encodeURIComponent(designFile.name));
              const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
              window.history.replaceState({}, '', newUrl);
              console.log('🔗 CNC Optimizer URL에 디자인파일명 추가:', newUrl);
            }
          } else {
            console.error('❌ 디자인파일에 name이 없음. designFile:', designFile);
          }
        } catch (err) {
          console.error('❌ 디자인파일 로드 중 에러:', err);
        }
      } else {
        console.log('⚠️ URL에 디자인파일 정보 없음');
      }
    };

    loadDesignFileName();
  }, [location.search]);
  
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
    sawStats, setSawStats,
    fullSimulating, setFullSimulating, fullSimCurrentSheet, setFullSimCurrentSheet,
    fullSimTotalSheets, setFullSimTotalSheets,
    hoveredPanelName, hoveredFurnitureId, setHoveredPanel,
    excludedPanelIds
  } = useCNCStore();

  // Configurator에서 온 경우 localStorage 초기화하여 새로운 패널 데이터 로드
  useEffect(() => {
    if (fromConfigurator && placedModules.length > 0 && !hasResetForConfigurator.current) {
      console.log('🔄 Configurator에서 진입 - localStorage 초기화');
      localStorage.removeItem('cnc_panels');
      localStorage.removeItem('cnc_user_modified');
      setUserHasModifiedPanels(false);
      hasResetForConfigurator.current = true;
    }
  }, [fromConfigurator, placedModules.length, setUserHasModifiedPanels]);

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
  const [viewSwapped, setViewSwapped] = useState(false); // 패널뷰어 ↔ 3D뷰어 위치 스왑
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

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);

  // Simulation complete stats popup state
  const [showSimulationStats, setShowSimulationStats] = useState(false);
  const [simulationStatsData, setSimulationStatsData] = useState<{
    sheetCount: number;
    totalCutLength: number;
    avgEfficiency: number;
    totalPanels: number;
  } | null>(null);


  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPanelId(null);
        setHoveredPanel(null, null);
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
        setHoveredPanel(null, null);
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

  // Configurator에서 온 경우 hasInitializedFromLive 리셋
  useEffect(() => {
    if (fromConfigurator && livePanels.length > 0) {
      console.log('🔄 Configurator에서 진입 - hasInitializedFromLive 리셋');
      hasInitializedFromLive.current = false;
    }
  }, [fromConfigurator, livePanels.length]);

  // Initialize with live data - only run once on mount
  useEffect(() => {
    console.log('=== CNCOptimizerPro Initialization ===');
    console.log('fromConfigurator:', fromConfigurator);
    console.log('livePanels from hook:', livePanels);
    console.log('livePanels.length:', livePanels.length);
    console.log('current panels in store:', panels);
    console.log('current stock in store:', stock);

    // Configurator에서 왔거나 livePanels가 있으면 user modified flag 리셋
    if (fromConfigurator || livePanels.length > 0) {
      // Reset user modified flag since we're getting fresh data from configurator
      setUserHasModifiedPanels(false);
      localStorage.removeItem('cnc_user_modified');
    }

    // Skip initialization if user has already modified panels AFTER checking livePanels
    if (userHasModifiedPanels && livePanels.length === 0 && !fromConfigurator) {
      console.log('User has modified panels and no live panels, keeping user panels');
      return;
    }
    
    // Clear panels if no furniture is placed
    // Always clear panels when there are no live panels (no furniture placed)
    if (livePanels.length === 0) {
      // Check if user has manually added panels
      const hasUserAddedPanels = userHasModifiedPanels && panels.some(p => 
        p.width > 0 && p.length > 0 && p.label !== ''
      );
      
      if (!hasUserAddedPanels) {
        // Clear all panels since no furniture is placed and no user panels
        console.log('No furniture placed, clearing all panels');
        setPanels([]);
        localStorage.removeItem('cnc_panels');
        localStorage.removeItem('cnc_user_modified');
        setUserHasModifiedPanels(false);
      }
    }
    
    // Convert live panels to CutList format - always update when we have live panels
    if (livePanels.length > 0) {
      // Always use live panels when they exist (even after refresh)
      // 항상 livePanels로 업데이트 (boringDepthPositions, groovePositions 포함)
      if (true) { // 항상 업데이트
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
          
          // 결방향: useLivePanelData의 실제 grain 값 사용 (VERTICAL→V, HORIZONTAL→H)
          const grain = p.grain === 'HORIZONTAL' ? 'H' : 'V';
          
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
            canRotate: true, // CNC 최적화에서는 기본적으로 회전 가능 (나중에 설정에 따라 조정됨)
            boringPositions: p.boringPositions, // 보링 Y위치 유지
            boringDepthPositions: p.boringDepthPositions, // 보링 X위치 유지 (서랍 측판)
            groovePositions: p.groovePositions, // 홈 위치 유지 (서랍 앞판/뒷판)
            // 도어 힌지 보링 필드
            screwPositions: p.screwPositions,
            screwDepthPositions: p.screwDepthPositions,
            isDoor: p.isDoor,
            isLeftHinge: p.isLeftHinge,
            screwHoleSpacing: p.screwHoleSpacing,
            // 측판 힌지 브라켓 타공 필드
            bracketBoringPositions: p.bracketBoringPositions,
            bracketBoringDepthPositions: p.bracketBoringDepthPositions,
            isBracketSide: p.isBracketSide,
            // 3D 패널 하이라이트용
            meshName: p.meshName,
            furnitureId: p.furnitureId,
          };
        });

        console.log('[CNCOptimizerPro] Setting panels from livePanels:');
        cutlistPanels.forEach(p => {
          if (p.label.includes('서랍') && (p.label.includes('좌측판') || p.label.includes('우측판'))) {
            console.log(`[CNCOptimizerPro] ${p.label}: boringDepthPositions=`, p.boringDepthPositions);
          }
        });
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
    
    console.log('🔄 패널 초기화 체크:', {
      livePanelsCount: livePanels.length,
      hasInitializedFromLive: hasInitializedFromLive.current,
      userHasModifiedPanels
    });

    if (livePanels.length > 0 && !hasInitializedFromLive.current) {
      console.log('✅ livePanels에서 패널 초기화 시작:', livePanels.length, '개');
      const cutlistPanels: Panel[] = livePanels.map(p => {
        let width = p.width;
        let length = p.height;
        
        if (width > length) {
          width = p.height;
          length = p.width;
        }
        
        // 결방향: useLivePanelData의 실제 grain 값 사용 (VERTICAL→V, HORIZONTAL→H)
        const grain = p.grain === 'HORIZONTAL' ? 'H' : 'V';
        let material = p.material || 'PB';
        const panelName = (p.name || '').toLowerCase();
        if (panelName.includes('도어') || panelName.includes('door') ||
            panelName.includes('엔드') || panelName.includes('end')) {
          material = 'PET';
        }

        console.log('[CNCOptimizerPro] 패널 초기화:', p.name, {
          boringPositions: p.boringPositions,
          boringDepthPositions: p.boringDepthPositions,
          groovePositions: p.groovePositions
        });

        return {
          id: p.id,
          label: p.name || `Panel_${p.id}`,
          width: width,
          length: length,
          thickness: p.thickness || 18,
          quantity: p.quantity || 1,
          material: material,
          grain: grain,
          canRotate: true,
          boringPositions: p.boringPositions,
          boringDepthPositions: p.boringDepthPositions,
          groovePositions: p.groovePositions,
          // 도어 힌지 보링 필드
          screwPositions: p.screwPositions,
          screwDepthPositions: p.screwDepthPositions,
          isDoor: p.isDoor,
          isLeftHinge: p.isLeftHinge,
          screwHoleSpacing: p.screwHoleSpacing,
          // 측판 힌지 브라켓 타공 필드
          bracketBoringPositions: p.bracketBoringPositions,
          bracketBoringDepthPositions: p.bracketBoringDepthPositions,
          isBracketSide: p.isBracketSide,
          // 3D 패널 하이라이트용
          meshName: p.meshName,
          furnitureId: p.furnitureId,
        };
      });

      setPanels(cutlistPanels);
      hasInitializedFromLive.current = true;
    }
  }, [livePanels, userHasModifiedPanels, setPanels]);

  // 제외 패널 ID → meshName 변환 (3D 뷰어에서 사용)
  const excludedMeshNames = useMemo(() => {
    const names = new Set<string>();
    excludedPanelIds.forEach(panelId => {
      const panel = panels.find(p => p.id === panelId);
      if (panel?.meshName) {
        names.add(panel.meshName);
      }
    });
    return names;
  }, [excludedPanelIds, panels]);

  const handleOptimize = useCallback(async (overrideOptimizationType?: 'OPTIMAL_L' | 'OPTIMAL_W' | 'OPTIMAL_CNC', silent?: boolean) => {
    // overrideOptimizationType이 주어지면 그 값을 사용, 아니면 settings에서 가져옴
    const effectiveOptimizationType = overrideOptimizationType || settings.optimizationType;
    console.log('⚡ handleOptimize called with optimizationType:', effectiveOptimizationType, silent ? '(silent)' : '');

    if (panels.length === 0) {
      if (!silent) showToast(t('cnc.noPanelsError'), 'error', t('common.confirm'));
      return;
    }

    if (stock.length === 0) {
      if (!silent) showToast(t('cnc.noStockError'), 'error', t('common.confirm'));
      return;
    }

    setIsOptimizing(true);
    setMethodChanged(false); // Calculate 시 강조 제거

    // Clear previous results immediately for cleaner experience
    setOptimizationResults([]);
    pendingResultsRef.current = []; // Clear any pending results

    // 설정값을 전역 변수로 저장 (뷰어에서 접근 가능하도록)
    (window as any).cncSettings = { ...settings, optimizationType: effectiveOptimizationType };

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    const animationStartTime = Date.now();

    if (!silent) {
      // AI 로딩 모달 표시 (수동 계산하기 버튼 클릭 시에만)
      setShowAILoading(true);
      setAILoadingProgress(0);

      const totalPanels = panels.reduce((sum, p) => sum + (p.quantity || 1), 0);
      const estimatedSheets = Math.ceil(totalPanels / 10);
      let loadingDuration = 3000;

      if (estimatedSheets >= 30) {
        loadingDuration = 8000;
      } else if (estimatedSheets >= 20) {
        loadingDuration = 6000;
      } else if (estimatedSheets >= 10) {
        loadingDuration = 4000;
      } else if (estimatedSheets >= 5) {
        loadingDuration = 3500;
      }

      setAILoadingDuration(loadingDuration);

      progressInterval = setInterval(() => {
        const elapsed = Date.now() - animationStartTime;
        const progress = Math.min((elapsed / loadingDuration) * 100, 95);
        setAILoadingProgress(progress);

        if (elapsed >= loadingDuration) {
          clearInterval(progressInterval!);
        }
      }, 50);

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    try {

      // ★★★ 디버그: panels store의 boringDepthPositions 확인 ★★★
      console.log('[handleOptimize] panels store 확인:');
      panels.forEach(p => {
        if (p.label.includes('서랍') && (p.label.includes('좌측판') || p.label.includes('우측판'))) {
          console.log(`[handleOptimize] ${p.label}: boringDepthPositions=`, p.boringDepthPositions);
        }
      });

      // Group panels by material AND thickness
      const panelGroups = new Map<string, Panel[]>();

      panels.forEach(panel => {
        // 제외된 패널 스킵
        if (excludedPanelIds.has(panel.id)) return;

        // Apply grain and rotation settings
        const processedPanel = { ...panel };
        
        // 패널 치수를 그대로 사용 (width와 length를 변경하지 않음)
        // console.log(`Panel ${panel.label}: ${panel.width}x${panel.length} (grain: ${panel.grain}, thickness: ${panel.thickness}mm)`);
        
        // CNC 최적화 모드에서는 결방향 무시하고 무조건 회전 가능 (효율 극대화)
        // BY_LENGTH, BY_WIDTH 모드에서만 결방향 고려
        if (effectiveOptimizationType === 'OPTIMAL_CNC') {
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

      // 디버그: 그룹화 결과 출력
      console.log('[handleOptimize] 패널 그룹화 결과:');
      let totalGroupedPanels = 0;
      panelGroups.forEach((groupPanels, key) => {
        const totalQty = groupPanels.reduce((sum, p) => sum + (p.quantity || 1), 0);
        totalGroupedPanels += totalQty;
        console.log(`  - ${key}: ${groupPanels.length}개 패널 (총 수량: ${totalQty})`);
      });
      console.log(`[handleOptimize] 총 패널 수: ${panels.length}, 그룹화된 패널 수: ${totalGroupedPanels}`);

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
          // stockPanel: width=W방향(1220), height=L방향(2440)
          // 캔버스는 rotation=-90으로 가로로 표시됨
          const stockPanel = {
            id: matchingStock.label || 'stock',
            width: matchingStock.width,   // 1220 (W방향)
            height: matchingStock.length, // 2440 (L방향)
            material: matchingStock.material || 'PB',
            color: 'MW',
            price: 50000,
            stock: matchingStock.quantity,
            thickness: thickness,
          };

          // 패널: width=W방향, height=L방향 (시트와 동일한 좌표계)
          const optimizerPanels = groupPanels.map(p => {
            // 디버그: 서랍 측판 데이터 확인
            if (p.label.includes('서랍') && (p.label.includes('좌측판') || p.label.includes('우측판'))) {
              console.log(`[optimizerPanels] ${p.label}: boringDepthPositions=`, p.boringDepthPositions, 'groovePositions=', p.groovePositions);
            }
            return {
              id: p.id,
              name: p.label,
              width: p.width,    // W방향
              height: p.length,  // L방향
              thickness: p.thickness,
              quantity: p.quantity,
              material: p.material || 'PB',
              color: 'MW',
              grain: p.grain === 'H' ? 'HORIZONTAL' :
                     p.grain === 'V' ? 'VERTICAL' :
                     'VERTICAL', // 기본값은 VERTICAL (세로)
              canRotate: p.canRotate,
              boringPositions: p.boringPositions, // 보링 위치 유지
              boringDepthPositions: p.boringDepthPositions, // 보링 X 위치
              groovePositions: p.groovePositions, // 홈 위치
              // 도어 힌지 보링 필드
              screwPositions: p.screwPositions,
              screwDepthPositions: p.screwDepthPositions,
              isDoor: p.isDoor,
              isLeftHinge: p.isLeftHinge,
              screwHoleSpacing: p.screwHoleSpacing,
              // 측판 힌지 브라켓 타공 필드
              bracketBoringPositions: p.bracketBoringPositions,
              bracketBoringDepthPositions: p.bracketBoringDepthPositions,
              isBracketSide: p.isBracketSide,
              // 3D 패널 하이라이트용
              meshName: p.meshName,
              furnitureId: p.furnitureId,
            };
          });

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
            effectiveOptimizationType // 최적화 타입 전달 (override 지원)
          );
          
          // 패널 위치를 여백만큼 오프셋
          results.forEach(result => {
            result.panels.forEach(panel => {
              panel.x += (settings.trimLeft || 10);
              panel.y += (settings.trimBottom || 10);
              // 디버그: optimizer 결과 확인
              if (panel.name?.includes('서랍') && (panel.name?.includes('좌측판') || panel.name?.includes('우측판'))) {
                console.log(`[optimizer result] ${panel.name}: boringDepthPositions=`, panel.boringDepthPositions, 'groovePositions=', panel.groovePositions);
              }
            });
            // 원본 크기 정보 복원
            result.stockPanel = stockPanel;
          });
          
          // console.log(`Optimization for ${material}: ${results.length} sheets generated`);
          // console.log(`Panels to optimize: ${optimizerPanels.length}`);
          allResults.push(...results);
        }
      }

      console.log('=== Initial Optimization Complete ===');
      console.log('Total sheets generated:', allResults.length);
      console.log('panelGroups count:', panelGroups.size);
      if (allResults.length === 0) {
        console.error('❌ allResults is empty! panelGroups:', [...panelGroups.entries()].map(([k, v]) => `${k}: ${v.length} panels`));
      }

      // 재최적화 비활성화 - 시트 낭비 방지
      const finalResults = [...allResults];
      
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
      
      if (silent) {
        // silent 모드: 로딩 UI 없이 즉시 결과 적용
        if (allResults.length > 0) {
          setOptimizationResults(pendingResultsRef.current);
          if (currentSheetIndex >= pendingResultsRef.current.length && pendingResultsRef.current.length > 0) {
            setCurrentSheetIndex(pendingResultsRef.current.length - 1);
          } else if (currentSheetIndex < 0 && pendingResultsRef.current.length > 0) {
            setCurrentSheetIndex(0);
          }
          pendingResultsRef.current = [];
        }
        setIsOptimizing(false);
      } else {
        // Ensure minimum loading duration based on sheet count
        const elapsedTime = Date.now() - animationStartTime;
        const remainingTime = Math.max(0, actualLoadingDuration - elapsedTime);

        // Complete to 100% after minimum time
        setTimeout(() => {
          // Clear any remaining interval
          if (progressInterval) clearInterval(progressInterval);

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
              await showToast(t('cnc.optimizationComplete', { panels: totalPanels, sheets: allResults.length, efficiency: avgEfficiency.toFixed(1) }), 'success', t('common.confirm'));

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
              await showToast(t('cnc.optimizationFailed'), 'error', t('common.confirm'));
            }
          }, 300); // Show 100% for 300ms
        }, remainingTime);
      }
    } catch (error) {
      console.error('❌ Optimization error:', error);
      console.error('❌ Stack:', error instanceof Error ? error.stack : '');
      if (progressInterval) clearInterval(progressInterval);
      if (!silent) {
        setShowAILoading(false);
        setAILoadingProgress(0);
        const errMsg = error instanceof Error ? error.message : String(error);
        showToast(`최적화 실패: ${errMsg}`, 'error', t('common.confirm'));
      }
    } finally {
      setIsOptimizing(false);
    }
  }, [panels, stock, settings, excludedPanelIds, setPlacements, setCurrentSheetIndex, setSawStats]);

  // 시뮬레이션 완료 콜백 - 전체 시뮬레이션 모드일 때 다음 시트로 진행
  const handleSimulationComplete = useCallback(() => {
    console.log('=== Simulation Complete ===', {
      fullSimulating,
      fullSimCurrentSheet,
      fullSimTotalSheets,
      currentSheetIndex
    });

    if (fullSimulating) {
      const nextSheet = fullSimCurrentSheet + 1;
      if (nextSheet < fullSimTotalSheets) {
        // 다음 시트로 진행
        console.log(`Moving to next sheet: ${nextSheet + 1}/${fullSimTotalSheets}`);
        setFullSimCurrentSheet(nextSheet);
        setCurrentSheetIndex(nextSheet);
        setSelectedSheetId(String(nextSheet + 1));
        // 잠시 후 시뮬레이션 재시작
        setTimeout(() => {
          setSimulating(true);
        }, 500);
      } else {
        // 모든 시트 시뮬레이션 완료 - 통계 팝업 표시
        console.log('All sheets simulation completed');
        setFullSimulating(false);
        setFullSimCurrentSheet(0);

        // 통계 데이터 계산
        const totalPanels = optimizationResults.reduce((sum, r) => sum + r.panels.length, 0);
        const avgEfficiency = optimizationResults.length > 0
          ? optimizationResults.reduce((sum, r) => sum + r.efficiency, 0) / optimizationResults.length
          : 0;

        setSimulationStatsData({
          sheetCount: fullSimTotalSheets,
          totalCutLength: sawStats.total,
          avgEfficiency,
          totalPanels
        });
        setShowSimulationStats(true);
      }
    } else {
      // 단일 시트 시뮬레이션 완료 - 해당 시트 통계 팝업 표시
      const currentResult = optimizationResults[currentSheetIndex];
      if (currentResult) {
        const sheetCutLength = sawStats.bySheet[String(currentSheetIndex + 1)] || 0;
        setSimulationStatsData({
          sheetCount: 1,
          totalCutLength: sheetCutLength,
          avgEfficiency: currentResult.efficiency,
          totalPanels: currentResult.panels.length
        });
        setShowSimulationStats(true);
      }
    }
  }, [fullSimulating, fullSimCurrentSheet, fullSimTotalSheets, currentSheetIndex, setFullSimCurrentSheet, setCurrentSheetIndex, setSelectedSheetId, setSimulating, setFullSimulating, optimizationResults, sawStats]);

  // Auto-optimize effect - must be after handleOptimize definition
  useEffect(() => {
    // Only auto-optimize when we have actual furniture panels from livePanels
    // Don't auto-optimize for empty or manually added panels
    if (!hasAutoOptimized.current && livePanels.length > 0 && panels.length > 0 && stock.length > 0) {
      hasAutoOptimized.current = true;

      // 더 긴 딜레이로 settings가 완전히 로드된 후 실행
      setTimeout(() => {
        console.log('🚀 Auto-optimize with settings:', settings.optimizationType);
        handleOptimize();
      }, 300);
    }
  }, [livePanels, panels, stock, settings.optimizationType, handleOptimize]);

  // 패널 수정(결방향 변경 등) 시 자동 재최적화
  const prevPanelsRef = useRef<string>('');
  useEffect(() => {
    if (!hasAutoOptimized.current || panels.length === 0 || stock.length === 0) return;
    // panels의 grain/width/length 변경 + excludedPanelIds 변경 감지
    const excludedSig = [...excludedPanelIds].sort().join(',');
    const panelsSig = panels.map(p => `${p.id}:${p.grain}:${p.width}:${p.length}`).join('|') + '||' + excludedSig;
    if (prevPanelsRef.current && prevPanelsRef.current !== panelsSig) {
      console.log('🔄 패널 변경 감지 → 자동 재최적화 (silent)');
      handleOptimize(undefined, true);
    }
    prevPanelsRef.current = panelsSig;
  }, [panels, stock, excludedPanelIds, handleOptimize]);

  // URL 파라미터에서 프로젝트명 읽기 (fallback용)
  const urlProjectName = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const name = searchParams.get('projectName');
    return name ? decodeURIComponent(name) : null;
  }, [location.search]);

  const projectName = urlProjectName || basicInfo?.title || 'New Project';
  
  // 컷팅 메소드 드롭다운 컴포넌트
  const CuttingMethodDropdown = () => {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const methodLabels = {
      'OPTIMAL_L': t('cnc.optimalL'),
      'OPTIMAL_W': t('cnc.optimalW'), 
      'OPTIMAL_CNC': t('cnc.optimalCNC')
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
      console.log('🔄 handleMethodChange called with:', method);
      setSettings({ optimizationType: method });
      setShowDropdown(false);
      // handleOptimize에 직접 method를 전달하여 클로저 문제 방지
      handleOptimize(method);
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
    console.log('🔄 allCutSteps useMemo 재계산:', {
      optimizationType: settings.optimizationType,
      resultsCount: optimizationResults.length
    });

    if (optimizationResults.length === 0) {
      return [];
    }

    const steps: any[] = [];
    let globalOrder = 0;

    // 각 시트별로 전체 기요틴 재단 순서 생성
    optimizationResults.forEach((result, sheetIdx) => {
      const sheetId = String(sheetIdx + 1);

      // OPTIMAL_CNC (Nesting)는 free cut 모드 사용 - 패널별 재단
      if (settings.optimizationType === 'OPTIMAL_CNC') {
        result.panels.forEach((panel) => {
          const panelCuts = buildSequenceForPanel({
            mode: 'free',
            sheetW: result.stockPanel.width,
            sheetH: result.stockPanel.height,
            kerf: settings.kerf || 5,
            placement: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
            sheetId,
            panelId: panel.id
          });

          panelCuts.forEach((cut, cutIdx) => {
            steps.push({
              ...cut,
              id: `s${sheetIdx}_p${panel.id}_c${cutIdx}`,
              globalOrder: ++globalOrder,
              sheetNumber: sheetIdx + 1,
              panelInfo: panel
            });
          });
        });
      } else {
        // BY_LENGTH / BY_WIDTH: 전체 시트에 대한 기요틴 재단 생성
        // 톱날이 끝까지 직선으로 가는 실제 기계 방식
        const panelPlacements = result.panels.map(panel => ({
          id: panel.id,
          x: panel.x,
          y: panel.y,
          width: panel.width,
          height: panel.height,
          rotated: panel.rotated
        }));

        // OPTIMAL_L → BY_LENGTH, OPTIMAL_W/BY_WIDTH → BY_WIDTH 변환
        let cutOptimizationType: 'BY_LENGTH' | 'BY_WIDTH';
        if (settings.optimizationType === 'OPTIMAL_W' || settings.optimizationType === 'BY_WIDTH') {
          cutOptimizationType = 'BY_WIDTH';
        } else {
          cutOptimizationType = 'BY_LENGTH';
        }
        console.log(`📐 allCutSteps: ${settings.optimizationType} -> ${cutOptimizationType}`);

        const sheetCuts = generateGuillotineCuts(
          result.stockPanel.width,
          result.stockPanel.height,
          panelPlacements,
          settings.kerf || 5,
          cutOptimizationType
        );

        sheetCuts.forEach((cut, cutIdx) => {
          steps.push({
            ...cut,
            id: `s${sheetIdx}_c${cutIdx}`,
            sheetId,
            globalOrder: ++globalOrder,
            sheetNumber: sheetIdx + 1
          });
        });
      }
    });

    console.log('🔄 allCutSteps 생성 완료:', {
      totalCuts: steps.length,
      firstCut: steps[0] ? { axis: steps[0].axis, label: steps[0].label } : null
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
          <Logo size="small" onClick={() => navigate('/')} />
          <h1>{t('cnc.title')}</h1>
          <span className={styles.projectName}>
            {(() => {
              console.log('🎯 CNC Optimizer 헤더 렌더링:', {
                projectName,
                designFileName,
                hasProjectName: !!projectName,
                hasDesignFileName: !!designFileName,
                projectNameValue: projectName,
                designFileNameValue: designFileName,
                basicInfo
              });

              if (projectName && designFileName) {
                console.log('✅ 프로젝트명과 디자인파일명 둘 다 있음');
                return (
                  <>
                    {projectName} <span style={{ margin: '0 8px', opacity: 0.5 }}>›</span> <span style={{ color: 'var(--theme-primary)' }}>{designFileName}</span>
                  </>
                );
              } else if (projectName) {
                console.log('⚠️ 프로젝트명만 있음 (디자인파일명 없음)');
                return projectName;
              } else if (designFileName) {
                console.log('⚠️ 디자인파일명만 있음 (프로젝트명 없음)');
                return <span style={{ color: 'var(--theme-primary)' }}>{designFileName}</span>;
              } else {
                console.log('❌ 둘 다 없음');
                return 'New Project';
              }
            })()}
          </span>
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
            <span>{t('cnc.calculate')}</span>
          </button>
          <button
            className={`${styles.simulationButton} ${fullSimulating ? styles.simulating : ''}`}
            onClick={() => {
              console.log('=== Full Simulation Button Clicked ===', {
                currentFullSimulating: fullSimulating,
                currentSimulating: simulating,
                optimizationResultsLength: optimizationResults.length,
                allCutStepsLength: allCutSteps.length,
                currentSheetIndex
              });
              if (fullSimulating || simulating) {
                // 시뮬레이션 정지
                setFullSimulating(false);
                setSimulating(false);
              } else if (optimizationResults.length > 0) {
                // 전체 시뮬레이션 시작 (시트 1번부터)
                setFullSimulating(true);
                setFullSimTotalSheets(optimizationResults.length);
                setFullSimCurrentSheet(0);
                setCurrentSheetIndex(0);
                setSelectedPanelId(null);
                setSelectedSheetId('1');
                console.log('Starting full simulation from sheet 1');
                setSimulating(true);
              }
            }}
            disabled={optimizationResults.length === 0}
            title={fullSimulating ? "전체 시뮬레이션 정지" : "전체 시트 시뮬레이션"}
          >
            {fullSimulating ? <Pause size={18} /> : <GiCircularSawblade size={18} />}
            <span>{fullSimulating ? '정지' : '전체 시뮬레이션'}</span>
          </button>
          <div className={styles.exportGroup}>
            <ExportBar
              optimizationResults={optimizationResults}
              shelfBoringPositions={customShelfPositionsByFurniture}
            />
          </div>
          <div className={styles.divider} />
          <button
            className={styles.settingsButton}
            onClick={() => setShowSettings(true)}
            title={t('cnc.settings')}
            type="button"
          >
            <Settings2 size={16} />
          </button>
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
            {t('cnc.exit')}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Left Sidebar */}
        <div className={styles.leftSidebar}>
          <PanelsTable />
        </div>

        {/* Center - Preview */}
        <div className={styles.centerPanel}>
          {viewSwapped ? (
            /* 스왑 모드: 3D 뷰어가 메인 중앙에 표시 */
            <div className={styles.viewerContainer}>
              <button className={styles.swapButton} onClick={() => setViewSwapped(v => !v)} title="뷰어 위치 변경">
                <ArrowLeftRight size={14} />
              </button>
              <div className={styles.mainViewer}>
                <PanelHighlight3DViewer
                  highlightedPanelName={hoveredPanelName}
                  highlightedFurnitureId={hoveredFurnitureId}
                  excludedMeshNames={excludedMeshNames}
                />
              </div>
            </div>
          ) : optimizationResults.length > 0 ? (
            <div className={`${styles.viewerContainer} ${optimizationResults[currentSheetIndex]?.stockPanel.height > optimizationResults[currentSheetIndex]?.stockPanel.width ? styles.viewerContainerPortrait : ''}`}>
              <div className={styles.mainViewer}>
                <CuttingLayoutPreview2
                  result={optimizationResults[currentSheetIndex]}
                  highlightedPanelId={selectedPanelId}
                  showLabels={settings.labelsOnPanels}
                  onPanelClick={(id) => {
                    setSelectedPanelId(id);
                    // 현재 시트의 배치된 패널에서 meshName/furnitureId 찾기
                    const currentResult = optimizationResults[currentSheetIndex];
                    const placedPanel = currentResult?.panels.find(p => p.id === id);
                    if (placedPanel?.meshName && placedPanel?.furnitureId) {
                      setHoveredPanel(placedPanel.meshName, placedPanel.furnitureId);
                    } else {
                      // 원본 패널에서 찾기 (id가 suffix 포함된 경우)
                      const baseId = id?.replace(/-\d+$/, '');
                      const origPanel = panels.find(p => p.id === baseId || p.id === id);
                      if (origPanel?.meshName && origPanel?.furnitureId) {
                        setHoveredPanel(origPanel.meshName, origPanel.furnitureId);
                      } else {
                        setHoveredPanel(null, null);
                      }
                    }
                  }}
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
                  boringData={boringPanels}
                  shelfBoringPositions={customShelfPositionsByFurniture}
                  onSimulationComplete={handleSimulationComplete}
                />
              </div>

              <div className={optimizationResults[currentSheetIndex]?.stockPanel.height > optimizationResults[currentSheetIndex]?.stockPanel.width ? styles.thumbnailBarVertical : styles.thumbnailBar}>
                <div className={optimizationResults[currentSheetIndex]?.stockPanel.height > optimizationResults[currentSheetIndex]?.stockPanel.width ? styles.thumbnailScrollVertical : styles.thumbnailScroll}>
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
              <h3>{t('cnc.noResults')}</h3>
              <p>{t('cnc.setupHint')}</p>
              <button
                className={`${styles.optimizeButtonLarge} ${styles.primary}`}
                onClick={handleOptimize}
                disabled={isOptimizing}
              >
                {isOptimizing ? t('cnc.optimizing') : t('cnc.generatePanels')}
              </button>
            </div>
          )}
        </div>

        {/* Right Sidebar - 3D Viewer + Stats */}
        <div className={styles.rightSidebar}>
          <div className={styles.rightSidebarContent}>
            {/* 3D 패널 하이라이트 뷰어 / 스왑 시 커팅 레이아웃 축소 */}
            <div className={styles.viewer3dContainer}>
              <button className={styles.swapButton} onClick={() => setViewSwapped(v => !v)} title="뷰어 위치 변경">
                <ArrowLeftRight size={14} />
              </button>
              {viewSwapped ? (
                optimizationResults.length > 0 ? (
                  <CuttingLayoutPreview2
                    result={optimizationResults[currentSheetIndex]}
                    highlightedPanelId={selectedPanelId}
                    showLabels={settings.labelsOnPanels}
                    onPanelClick={(id) => {
                      setSelectedPanelId(id);
                      const currentResult = optimizationResults[currentSheetIndex];
                      const placedPanel = currentResult?.panels.find(p => p.id === id);
                      if (placedPanel?.meshName && placedPanel?.furnitureId) {
                        setHoveredPanel(placedPanel.meshName, placedPanel.furnitureId);
                      } else {
                        const baseId = id?.replace(/-\d+$/, '');
                        const origPanel = panels.find(p => p.id === baseId || p.id === id);
                        if (origPanel?.meshName && origPanel?.furnitureId) {
                          setHoveredPanel(origPanel.meshName, origPanel.furnitureId);
                        } else {
                          setHoveredPanel(null, null);
                        }
                      }
                    }}
                    allowRotation={!settings.considerGrain}
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
                    boringData={boringPanels}
                    shelfBoringPositions={customShelfPositionsByFurniture}
                    onSimulationComplete={handleSimulationComplete}
                  />
                ) : null
              ) : (
                <PanelHighlight3DViewer
                  highlightedPanelName={hoveredPanelName}
                  highlightedFurnitureId={hoveredFurnitureId}
                  excludedMeshNames={excludedMeshNames}
                />
              )}
            </div>

            <div className={styles.statsCard}>
              <div className={styles.statsCardTitle}>
                <h3>{t('cnc.totalStats')}</h3>
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
                  <span>{t('cnc.sheets')}</span>
                  <div className={styles.statValue}>
                    <strong>{optimizationResults.length}</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>{t('cnc.usedArea')}</span>
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
                  <span>{t('cnc.wasteArea')}</span>
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
                  <span>{t('cnc.totalPanels')}</span>
                  <div className={styles.statValue}>
                    <strong>{optimizationResults.reduce((sum, r) => sum + r.panels.length, 0)}</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>{t('cnc.cutCount')}</span>
                  <div className={styles.statValue}>
                    <strong>{allCutSteps.length}</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>{t('cnc.cutLength')}</span>
                  <div className={styles.statValue}>
                    <strong>{sawStats.total.toFixed(2)}m</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>{t('cnc.bladeThickness')}</span>
                  <div className={styles.statValue}>
                    <strong>{settings.kerf || 5}mm</strong>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>{t('cnc.stock')}</span>
                  <div className={styles.statValue}>
                    {stock.length > 0 ? `${stock[0].width}×${stock[0].length}` : '-'}
                  </div>
                </div>
                <div className={styles.statRow}>
                  <span>{t('cnc.optimization')}</span>
                  <div className={styles.statValue}>
                    {settings.optimizationType === 'OPTIMAL_CNC' ? t('cnc.minWaste') : 
                     settings.optimizationType === 'BY_LENGTH' ? t('cnc.verticalCut') : t('cnc.horizontalCut')}
                  </div>
                </div>
              </div>
              )}
            </div>

            {optimizationResults[currentSheetIndex] && (
              <div className={styles.statsCard}>
                <div className={styles.statsCardTitle}>
                  <h3>{t('cnc.sheetStats')}</h3>
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
                  <h3>{t('cnc.sheet')} {currentSheetIndex + 1} / {optimizationResults.length}</h3>
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
                    <span>{t('cnc.panelCount')}</span>
                    <div className={styles.statValue}>
                      <strong>{optimizationResults[currentSheetIndex].panels.length}</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>{t('cnc.efficiency')}</span>
                    <div className={styles.statValue}>
                      <strong>{optimizationResults[currentSheetIndex].efficiency.toFixed(1)}%</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>{t('cnc.usedArea')}</span>
                    <div className={styles.statValue}>
                      <strong>{(optimizationResults[currentSheetIndex].usedArea / 1000000).toFixed(2)}㎡</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>{t('cnc.wasteArea')}</span>
                    <div className={styles.statValue}>
                      <strong>{(optimizationResults[currentSheetIndex].wasteArea / 1000000).toFixed(2)}㎡</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>{t('cnc.cutCount')}</span>
                    <div className={styles.statValue}>
                      <strong>{
                        allCutSteps.filter(step => step.sheetNumber === currentSheetIndex + 1).length
                      }</strong>
                    </div>
                  </div>
                  <div className={styles.statRow}>
                    <span>{t('cnc.cutLength')}</span>
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
                      {t('cnc.sheetList')}
                    </button>
                    <button 
                      className={`${styles.tabButton} ${showCuttingList ? styles.active : ''}`}
                      onClick={() => setShowCuttingList(true)}
                    >
                      {t('cnc.cuttingList')}
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
                            <button
                              className={`${styles.sheetPlayButton} ${simulating && currentSheetIndex === index && !fullSimulating ? styles.playing : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                // 해당 시트만 시뮬레이션
                                if (simulating && currentSheetIndex === index) {
                                  setSimulating(false);
                                } else {
                                  setFullSimulating(false); // 전체 시뮬레이션 아님
                                  setCurrentSheetIndex(index);
                                  setSelectedPanelId(null);
                                  setSelectedSheetId(String(index + 1));
                                  setSimulating(true);
                                }
                              }}
                              title={simulating && currentSheetIndex === index ? "시뮬레이션 정지" : `시트 ${index + 1} 시뮬레이션`}
                            >
                              {simulating && currentSheetIndex === index && !fullSimulating ? <Pause size={12} /> : <Play size={12} />}
                            </button>
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
                                    // 3D 뷰어 하이라이트
                                    if (panel.meshName && panel.furnitureId) {
                                      setHoveredPanel(panel.meshName, panel.furnitureId);
                                    } else {
                                      setHoveredPanel(null, null);
                                    }
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
        message={t('cnc.aiOptimizing')}
        duration={aiLoadingDuration}
      />
      
      {/* Simulation Stats Modal */}
      <SimulationStatsModal
        isOpen={showSimulationStats && simulationStatsData !== null}
        onClose={() => setShowSimulationStats(false)}
        stats={simulationStatsData || { sheetCount: 0, totalPanels: 0, totalCutLength: 0, avgEfficiency: 0 }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsChange={handleOptimize}
      />

      {/* Exit Confirmation Modal */}
      <ExitConfirmModal
        isOpen={showExitConfirm}
        onConfirm={() => {
          console.log('Exit confirmed! Navigating to configurator...');
          // 현재 URL의 search params를 유지하면서 configurator로 이동
          // skipLoad=true로 기존 스토어 데이터(배치 가구 등) 유지
          const params = new URLSearchParams(location.search);
          params.set('skipLoad', 'true');
          navigate(`/configurator?${params.toString()}`);
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