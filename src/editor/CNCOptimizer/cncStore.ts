import { create } from 'zustand';
import type { CutMode, Sheet, PanelReq, Placement, CutStep, SawStats, CNCStats } from '../../types/cut';

interface CNCOptimizerStore {
  // STATE
  mode: CutMode;
  kerfMm: number;
  sheets: Sheet[];
  panels: PanelReq[];
  placements: Placement[];
  cuts: CutStep[];
  selectedCutId: string | undefined;
  selectedSheetId: string | undefined;
  sawStats: SawStats;
  cncStats: CNCStats;
  
  // ACTIONS
  setMode: (m: CutMode) => void;
  setSelectedSheetId: (id?: string) => void;
  selectCutId: (id?: string) => void;
  setKerf: (v: number) => void;
  setSheets: (s: Sheet[]) => void;
  setPanels: (p: PanelReq[]) => void;
  setPlacements: (p: Placement[]) => void;
  setCuts: (c: CutStep[]) => void;
  setSawStats: (s: SawStats) => void;
  setCNCStats: (s: CNCStats) => void;
}

export const useCNCOptimizerStore = create<CNCOptimizerStore>((set) => ({
  // STATE
  mode: 'BY_LENGTH',
  kerfMm: 3,
  sheets: [],
  panels: [],
  placements: [],
  cuts: [],
  selectedCutId: undefined,
  selectedSheetId: undefined,
  sawStats: { bySheet:{}, total:0, unit:'m' },
  cncStats: { cycleTimeSec:0, cutLenMm:0, airLenMm:0, toolChanges:0 },
  
  // ACTIONS
  setMode: (m) => set(()=>({mode:m, selectedCutId:undefined})),
  setSelectedSheetId: (id)=> set(()=>({selectedSheetId:id})),
  selectCutId: (id)=> set(()=>({selectedCutId:id})),
  setKerf: (v)=> set(()=>({kerfMm:v})),
  setSheets: (s)=> set(()=>({sheets:s})),
  setPanels: (p)=> set(()=>({panels:p})),
  setPlacements: (p)=> set(()=>({placements:p})),
  setCuts: (c)=> set(()=>({cuts:c})),
  setSawStats: (s)=> set(()=>({sawStats:s})),
  setCNCStats: (s)=> set(()=>({cncStats:s}))
}));