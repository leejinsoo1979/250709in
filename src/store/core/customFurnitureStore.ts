import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as THREE from 'three';

/**
 * 커스텀 가구 패널 정보
 */
export interface CustomPanel {
  name: string;                    // 패널 이름 (LeftPanel, TopPanel 등)
  originalSize: {
    width: number;                 // mm
    height: number;                // mm
    depth: number;                 // mm
  };
  originalPosition: {
    x: number;
    y: number;
    z: number;
  };
  geometry?: THREE.BufferGeometry; // 런타임에만 존재
}

/**
 * 커스텀 가구 데이터
 */
export interface CustomFurnitureData {
  id: string;                      // 고유 ID
  name: string;                    // 사용자 지정 이름
  fileName: string;                // 원본 파일명
  fileType: 'dae' | 'glb' | 'gltf' | 'obj';
  category: 'full' | 'upper' | 'lower';

  // 원본 크기
  originalDimensions: {
    width: number;                 // mm
    height: number;                // mm
    depth: number;                 // mm
  };

  // 패널 정보
  panels: CustomPanel[];

  // 스케일 모드
  scaleMode: 'uniform' | 'non-uniform' | 'fixed';

  // 썸네일 (base64)
  thumbnail?: string;

  // 3D 데이터 URL (blob URL 또는 Firebase URL)
  modelUrl?: string;

  // 원본 3D 데이터 (런타임용)
  modelData?: ArrayBuffer | string;

  // 생성일
  createdAt: number;

  // 메타데이터
  metadata?: {
    author?: string;
    description?: string;
    version?: string;
  };
}

/**
 * 커스텀 가구 스토어 상태
 */
interface CustomFurnitureState {
  // 커스텀 가구 라이브러리
  customFurnitures: CustomFurnitureData[];

  // 선택된 커스텀 가구 ID
  selectedCustomFurnitureId: string | null;

  // 로딩 상태
  isLoading: boolean;
  loadingProgress: number;

  // 에러 상태
  error: string | null;

  // 액션
  addCustomFurniture: (furniture: CustomFurnitureData) => void;
  removeCustomFurniture: (id: string) => void;
  updateCustomFurniture: (id: string, updates: Partial<CustomFurnitureData>) => void;
  setSelectedCustomFurniture: (id: string | null) => void;
  setLoading: (isLoading: boolean, progress?: number) => void;
  setError: (error: string | null) => void;
  getCustomFurnitureById: (id: string) => CustomFurnitureData | undefined;
  clearAllCustomFurnitures: () => void;
}

/**
 * 커스텀 가구 스토어
 */
export const useCustomFurnitureStore = create<CustomFurnitureState>()(
  persist(
    (set, get) => ({
      // 초기 상태
      customFurnitures: [],
      selectedCustomFurnitureId: null,
      isLoading: false,
      loadingProgress: 0,
      error: null,

      // 커스텀 가구 추가
      addCustomFurniture: (furniture) => {
        set((state) => ({
          customFurnitures: [...state.customFurnitures, furniture],
          error: null,
        }));
// console.log('✅ 커스텀 가구 추가:', furniture.name);
      },

      // 커스텀 가구 제거
      removeCustomFurniture: (id) => {
        set((state) => ({
          customFurnitures: state.customFurnitures.filter((f) => f.id !== id),
          selectedCustomFurnitureId:
            state.selectedCustomFurnitureId === id ? null : state.selectedCustomFurnitureId,
        }));
// console.log('🗑️ 커스텀 가구 제거:', id);
      },

      // 커스텀 가구 업데이트
      updateCustomFurniture: (id, updates) => {
        set((state) => ({
          customFurnitures: state.customFurnitures.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        }));
      },

      // 선택된 커스텀 가구 설정
      setSelectedCustomFurniture: (id) => {
        set({ selectedCustomFurnitureId: id });
      },

      // 로딩 상태 설정
      setLoading: (isLoading, progress = 0) => {
        set({ isLoading, loadingProgress: progress });
      },

      // 에러 설정
      setError: (error) => {
        set({ error, isLoading: false });
      },

      // ID로 커스텀 가구 조회
      getCustomFurnitureById: (id) => {
        return get().customFurnitures.find((f) => f.id === id);
      },

      // 모든 커스텀 가구 삭제
      clearAllCustomFurnitures: () => {
        set({
          customFurnitures: [],
          selectedCustomFurnitureId: null,
          error: null,
        });
// console.log('🗑️ 모든 커스텀 가구 삭제');
      },
    }),
    {
      name: 'custom-furniture-storage',
      // geometry와 modelData는 저장하지 않음
      partialize: (state) => ({
        customFurnitures: state.customFurnitures.map((f) => ({
          ...f,
          panels: f.panels.map((p) => ({
            ...p,
            geometry: undefined,
          })),
          modelData: undefined,
        })),
      }),
    }
  )
);
