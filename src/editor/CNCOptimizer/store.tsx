import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Panel, StockSheet, CutSettings, Unit, Placement, CutStep, SawStats } from '../../types/cutlist';

type Store = {
  panels: Panel[];
  stock: StockSheet[];
  settings: CutSettings;
  selectedPanelId: string | null;
  currentSheetIndex: number;
  userHasModifiedPanels: boolean;
  // Simulation state
  placements: Placement[];
  cuts: CutStep[];
  selectedSheetId?: string;
  selectedCutIndex?: number;
  selectedCutId?: string;
  simulating: boolean;
  simSpeed: number;
  simProgress: number;
  sawStats: SawStats;
  // Actions
  setPanels: (p: Panel[], isUserModified?: boolean) => void;
  setStock: (s: StockSheet[]) => void;
  setSettings: (k: Partial<CutSettings>) => void;
  setSelectedPanelId: (id: string | null) => void;
  setCurrentSheetIndex: (index: number) => void;
  setSelectedSheetId: (id?: string) => void;
  setUserHasModifiedPanels: (v: boolean) => void;
  // Simulation actions
  setPlacements: (p: Placement[]) => void;
  setCuts: (c: CutStep[]) => void;
  selectPanel: (panelId?: string, sheetId?: string) => void;
  selectCutIndex: (i?: number) => void;
  selectCutId: (id?: string) => void;
  setSimulating: (v: boolean) => void;
  setSimSpeed: (v: number) => void;
  setSimProgress: (v: number) => void;
  setSawStats: (stats: SawStats) => void;
  metrics: () => { partsCount: number; partsArea: number; stockArea: number };
};

const Ctx = createContext<Store | null>(null);

export function CNCProvider({ children }: { children: React.ReactNode }){
  // Load from localStorage on mount
  const [panels, setPanelsState] = useState<Panel[]>(() => {
    const saved = localStorage.getItem('cnc_panels');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Only use saved panels if they exist and are not empty
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    return [];
  });
  const [stock, setStockState] = useState<StockSheet[]>(() => {
    const saved = localStorage.getItem('cnc_stock');
    return saved ? JSON.parse(saved) : [];
  });
  const [userHasModifiedPanels, setUserHasModifiedPanelsState] = useState(() => {
    const saved = localStorage.getItem('cnc_user_modified');
    return saved === 'true';
  });
  
  const setUserHasModifiedPanels = (value: boolean) => {
    setUserHasModifiedPanelsState(value);
    localStorage.setItem('cnc_user_modified', value.toString());
  };
  
  // Wrapper functions to save to localStorage
  const setPanels = (newPanels: Panel[], isUserModified: boolean = false) => {
    setPanelsState(newPanels);
    localStorage.setItem('cnc_panels', JSON.stringify(newPanels));
    if (isUserModified) {
      setUserHasModifiedPanels(true);
    }
  };
  
  const setStock = (newStock: StockSheet[]) => {
    setStockState(newStock);
    localStorage.setItem('cnc_stock', JSON.stringify(newStock));
  };
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [settings, setSettingsState] = useState<CutSettings>(() => {
    const saved = localStorage.getItem('cnc_settings');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      unit: 'mm' as Unit, 
      kerf: 5, 
      trimTop: 5,     // 상단 여백 기본값 5mm
      trimBottom: 5,  // 하단 여백 기본값 5mm
      trimLeft: 5,    // 좌측 여백 기본값 5mm
      trimRight: 5,   // 우측 여백 기본값 5mm
      labelsOnPanels: true, 
      singleSheetOnly: false,
      considerMaterial: true, 
      edgeBanding: false, 
      considerGrain: true,
      alignVerticalCuts: true, // 세로 컷팅 라인 정렬 기본값
      optimizationType: 'OPTIMAL_CNC' // 기본값: CNC 최적화
    };
  });

  // Simulation state
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [cuts, setCuts] = useState<CutStep[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string | undefined>();
  const [selectedCutIndex, setSelectedCutIndex] = useState<number | undefined>();
  const [selectedCutId, setSelectedCutId] = useState<string | undefined>();
  const [simulating, setSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1.0);
  const [simProgress, setSimProgress] = useState(0);
  const [sawStats, setSawStats] = useState<SawStats>({ bySheet: {}, total: 0, unit: 'm' });

  const setSettings = (k: Partial<CutSettings>) => {
    setSettingsState(s => {
      const newSettings = { ...s, ...k };
      localStorage.setItem('cnc_settings', JSON.stringify(newSettings));
      return newSettings;
    });
  };
  
  const selectPanel = (panelId?: string, sheetId?: string) => {
    setSelectedPanelId(panelId || null);
    setSelectedSheetId(sheetId);
    if (sheetId) {
      // Find sheet index by ID
      const sheetIndex = parseInt(sheetId) - 1;
      if (!isNaN(sheetIndex)) {
        setCurrentSheetIndex(sheetIndex);
      }
    }
  };
  
  const selectCutIndex = (i?: number) => {
    setSelectedCutIndex(i);
  };
  
  const selectCutId = (id?: string) => {
    setSelectedCutId(id);
  };

  const metrics = () => {
    const partsArea = panels.reduce((acc, p) => acc + p.width*p.length*p.quantity, 0);
    const sheetArea1 = stock.length ? stock[0].width*stock[0].length : 0;
    const stockArea = stock.reduce((acc, s) => acc + (s.width*s.length*s.quantity), 0);
    const partsCount = panels.reduce((acc, p) => acc + p.quantity, 0);
    return { partsCount, partsArea, stockArea: stockArea || sheetArea1 };
  };

  const value: Store = useMemo(()=>({ 
    panels, 
    stock, 
    settings, 
    selectedPanelId,
    currentSheetIndex,
    userHasModifiedPanels,
    // Simulation state
    placements,
    cuts,
    selectedSheetId,
    selectedCutIndex,
    selectedCutId,
    simulating,
    simSpeed,
    simProgress,
    sawStats,
    // Actions
    setPanels, 
    setStock, 
    setSettings,
    setSelectedPanelId,
    setCurrentSheetIndex,
    setSelectedSheetId,
    setUserHasModifiedPanels,
    // Simulation actions
    setPlacements,
    setCuts,
    selectPanel,
    selectCutIndex,
    selectCutId,
    setSimulating,
    setSimSpeed,
    setSimProgress,
    setSawStats,
    metrics 
  }), [panels, stock, settings, selectedPanelId, currentSheetIndex, userHasModifiedPanels,
      placements, cuts, selectedSheetId, selectedCutIndex, selectedCutId, simulating, simSpeed, simProgress, sawStats]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCNCStore(){
  const ctx = useContext(Ctx);
  if(!ctx) throw new Error('useCNCStore must be used within CNCProvider');
  return ctx;
}