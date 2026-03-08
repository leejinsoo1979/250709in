import { create } from 'zustand';
import { SavedCabinet } from '@/firebase/types';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { saveMyCabinet, getMyCabinets, deleteMyCabinet, updateMyCabinet } from '@/firebase/myCabinets';

export interface PendingPlacement {
  customConfig: CustomFurnitureConfig;
  width: number;
  height: number;
  depth: number;
  category: 'full' | 'upper' | 'lower';
}

interface MyCabinetState {
  savedCabinets: SavedCabinet[];
  isLoading: boolean;
  pendingPlacement: PendingPlacement | null;
  editingCabinetId: string | null; // 현재 수정 중인 My캐비닛 ID

  fetchCabinets: () => Promise<void>;
  saveCabinet: (data: {
    name: string;
    category: 'full' | 'upper' | 'lower';
    width: number;
    height: number;
    depth: number;
    customConfig: CustomFurnitureConfig;
  }) => Promise<{ id: string | null; error: string | null }>;
  updateCabinet: (id: string, data: {
    name?: string;
    category?: 'full' | 'upper' | 'lower';
    width?: number;
    height?: number;
    depth?: number;
    customConfig?: CustomFurnitureConfig;
  }) => Promise<{ error: string | null }>;
  deleteCabinet: (id: string) => Promise<void>;
  setPendingPlacement: (placement: PendingPlacement | null) => void;
  setEditingCabinetId: (id: string | null) => void;
}

export const useMyCabinetStore = create<MyCabinetState>((set, get) => ({
  savedCabinets: [],
  isLoading: false,
  pendingPlacement: null,
  editingCabinetId: null,

  fetchCabinets: async () => {
    set({ isLoading: true });
    const { cabinets, error } = await getMyCabinets();
    if (error) {
      console.error('My캐비닛 목록 로드 실패:', error);
    }
    set({ savedCabinets: cabinets, isLoading: false });
  },

  saveCabinet: async (data) => {
    const result = await saveMyCabinet(data);
    if (!result.error) {
      // 저장 후 목록 갱신
      await get().fetchCabinets();
    }
    return result;
  },

  updateCabinet: async (id, data) => {
    const result = await updateMyCabinet(id, data);
    if (!result.error) {
      // 수정 후 목록 갱신
      await get().fetchCabinets();
    }
    return result;
  },

  deleteCabinet: async (id: string) => {
    const { error } = await deleteMyCabinet(id);
    if (error) {
      console.error('My캐비닛 삭제 실패:', error);
      return;
    }
    // 삭제 후 로컬 상태에서 즉시 제거
    set((state) => ({
      savedCabinets: state.savedCabinets.filter((c) => c.id !== id),
    }));
  },

  setPendingPlacement: (placement) => {
    set({ pendingPlacement: placement });
  },

  setEditingCabinetId: (id) => {
    set({ editingCabinetId: id });
  },
}));
