import { create } from 'zustand';
import { SpaceInfo } from './core/spaceConfigStore';
import { PlacedModule } from './core/furnitureStore';
import { BasicInfo } from './core/projectStore';

interface HistoryState {
  spaceInfo: SpaceInfo;
  placedModules: PlacedModule[];
  basicInfo: BasicInfo;
}

interface HistoryStore {
  history: HistoryState[];
  currentIndex: number;
  maxHistorySize: number;
  
  // 상태 저장
  saveState: (state: HistoryState) => void;
  
  // Undo/Redo
  undo: () => HistoryState | null;
  redo: () => HistoryState | null;
  
  // 히스토리 관리
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  history: [],
  currentIndex: -1,
  maxHistorySize: 50,
  
  saveState: (state) => {
    const { history, currentIndex, maxHistorySize } = get();
    
    // 현재 인덱스 이후의 히스토리 제거 (새로운 분기 생성)
    const newHistory = history.slice(0, currentIndex + 1);
    
    // 새 상태 추가
    newHistory.push(JSON.parse(JSON.stringify(state)));
    
    // 최대 크기 제한
    if (newHistory.length > maxHistorySize) {
      newHistory.shift();
    }
    
    set({
      history: newHistory,
      currentIndex: newHistory.length - 1
    });
  },
  
  undo: () => {
    const { history, currentIndex } = get();
    
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      set({ currentIndex: newIndex });
      return JSON.parse(JSON.stringify(history[newIndex]));
    }
    
    return null;
  },
  
  redo: () => {
    const { history, currentIndex } = get();
    
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      set({ currentIndex: newIndex });
      return JSON.parse(JSON.stringify(history[newIndex]));
    }
    
    return null;
  },
  
  canUndo: () => {
    const { currentIndex } = get();
    return currentIndex > 0;
  },
  
  canRedo: () => {
    const { history, currentIndex } = get();
    return currentIndex < history.length - 1;
  },
  
  clearHistory: () => {
    set({
      history: [],
      currentIndex: -1
    });
  }
}));