import { create } from 'zustand';
import { SpaceInfo } from './core/spaceConfigStore';
import { PlacedModule } from './core/furnitureStore';
import { BasicInfo } from './core/projectStore';

interface HistoryState {
  spaceInfo: SpaceInfo;
  placedModules: PlacedModule[];
  basicInfo: BasicInfo;
  scopeId: string;
}

type HistorySnapshot = Omit<HistoryState, 'scopeId'>;

interface HistoryStore {
  history: HistoryState[];
  currentIndex: number;
  maxHistorySize: number;
  activeScopeId: string | null;
  
  // 현재 편집 대상 범위
  setScope: (scopeId: string, initialState?: HistorySnapshot) => void;
  
  // 상태 저장
  saveState: (state: HistorySnapshot, scopeId?: string) => void;
  
  // Undo/Redo
  undo: (scopeId?: string) => HistoryState | null;
  redo: (scopeId?: string) => HistoryState | null;
  
  // 히스토리 관리
  canUndo: (scopeId?: string) => boolean;
  canRedo: (scopeId?: string) => boolean;
  clearHistory: (scopeId?: string) => void;
}

const DEFAULT_SCOPE_ID = 'default';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const resolveScopeId = (scopeId: string | undefined, activeScopeId: string | null) =>
  scopeId || activeScopeId || DEFAULT_SCOPE_ID;

const toHistoryState = (state: HistorySnapshot, scopeId: string): HistoryState => ({
  ...clone(state),
  scopeId
});

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  history: [],
  currentIndex: -1,
  maxHistorySize: 50,
  activeScopeId: null,
  
  setScope: (scopeId, initialState) => {
    const nextScopeId = scopeId || DEFAULT_SCOPE_ID;
    const { activeScopeId, history } = get();
    
    if (activeScopeId === nextScopeId && history.every(item => item.scopeId === nextScopeId)) {
      if (initialState && history.length === 0) {
        set({
          history: [toHistoryState(initialState, nextScopeId)],
          currentIndex: 0,
          activeScopeId: nextScopeId
        });
      }
      return;
    }
    
    const nextHistory = initialState ? [toHistoryState(initialState, nextScopeId)] : [];
    set({
      history: nextHistory,
      currentIndex: nextHistory.length - 1,
      activeScopeId: nextScopeId
    });
  },
  
  saveState: (state, scopeIdArg) => {
    const { history, currentIndex, maxHistorySize, activeScopeId } = get();
    const scopeId = resolveScopeId(scopeIdArg, activeScopeId);
    const isSameScope = activeScopeId === scopeId && history.every(item => item.scopeId === scopeId);
    
    // 현재 인덱스 이후의 히스토리 제거 (새로운 분기 생성)
    const scopedHistory = isSameScope ? history : [];
    const scopedIndex = isSameScope ? currentIndex : -1;
    const newHistory = scopedHistory.slice(0, scopedIndex + 1);
    
    // 새 상태 추가
    newHistory.push(toHistoryState(state, scopeId));
    
    // 최대 크기 제한
    if (newHistory.length > maxHistorySize) {
      newHistory.shift();
    }
    
    set({
      history: newHistory,
      currentIndex: newHistory.length - 1,
      activeScopeId: scopeId
    });
  },
  
  undo: (scopeId) => {
    const { history, currentIndex, activeScopeId } = get();
    const targetScopeId = resolveScopeId(scopeId, activeScopeId);
    
    if (
      activeScopeId === targetScopeId &&
      currentIndex > 0 &&
      history[currentIndex - 1]?.scopeId === targetScopeId
    ) {
      const newIndex = currentIndex - 1;
      set({ currentIndex: newIndex });
      return clone(history[newIndex]);
    }
    
    return null;
  },
  
  redo: (scopeId) => {
    const { history, currentIndex, activeScopeId } = get();
    const targetScopeId = resolveScopeId(scopeId, activeScopeId);
    
    if (
      activeScopeId === targetScopeId &&
      currentIndex < history.length - 1 &&
      history[currentIndex + 1]?.scopeId === targetScopeId
    ) {
      const newIndex = currentIndex + 1;
      set({ currentIndex: newIndex });
      return clone(history[newIndex]);
    }
    
    return null;
  },
  
  canUndo: (scopeId) => {
    const { history, currentIndex, activeScopeId } = get();
    const targetScopeId = resolveScopeId(scopeId, activeScopeId);
    return activeScopeId === targetScopeId &&
      currentIndex > 0 &&
      history[currentIndex - 1]?.scopeId === targetScopeId;
  },
  
  canRedo: (scopeId) => {
    const { history, currentIndex, activeScopeId } = get();
    const targetScopeId = resolveScopeId(scopeId, activeScopeId);
    return activeScopeId === targetScopeId &&
      currentIndex < history.length - 1 &&
      history[currentIndex + 1]?.scopeId === targetScopeId;
  },
  
  clearHistory: (scopeId) => {
    const activeScopeId = get().activeScopeId;
    const nextScopeId = scopeId === undefined ? activeScopeId : scopeId;
    set({
      history: [],
      currentIndex: -1,
      activeScopeId: nextScopeId || null
    });
  }
}));
