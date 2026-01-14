/**
 * 보링 데이터 스토어
 * Zustand를 사용한 전역 상태 관리
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BoringSettings,
  PanelBoringData,
  ExportFormat,
  ExportSettings,
  DrawerRailType,
  BlumClipTopSettings,
  CamLockSettings,
  ShelfPinSettings,
  AdjustableFootSettings,
  DrawerRailSettings,
} from '@/domain/boring/types';
import {
  DEFAULT_BORING_SETTINGS,
  DEFAULT_CSV_EXPORT_SETTINGS,
  DEFAULT_DXF_EXPORT_SETTINGS,
  DEFAULT_MPR_EXPORT_SETTINGS,
  DEFAULT_CIX_EXPORT_SETTINGS,
  DRAWER_RAIL_SETTINGS,
} from '@/domain/boring/constants';

// ============================================
// 스토어 상태 타입
// ============================================

interface BoringState {
  // 설정
  settings: BoringSettings;

  // 생성된 보링 데이터
  panelBoringData: PanelBoringData[];

  // UI 상태
  isGenerating: boolean;
  isExporting: boolean;
  lastExportFormat: ExportFormat | null;
  lastExportTime: number | null;

  // 설정 액션
  updateHingeSettings: (settings: Partial<BlumClipTopSettings>) => void;
  updateCamLockSettings: (settings: Partial<CamLockSettings>) => void;
  updateShelfPinSettings: (settings: Partial<ShelfPinSettings>) => void;
  updateAdjustableFootSettings: (settings: Partial<AdjustableFootSettings>) => void;
  updateDrawerRailType: (type: DrawerRailType) => void;
  updateDrawerRailSettings: (settings: Partial<DrawerRailSettings>) => void;
  updateExportSettings: (settings: Partial<ExportSettings>) => void;
  setExportFormat: (format: ExportFormat) => void;
  resetSettings: () => void;

  // 보링 데이터 액션
  setPanelBoringData: (data: PanelBoringData[]) => void;
  addPanelBoringData: (data: PanelBoringData) => void;
  updatePanelBoringData: (panelId: string, data: Partial<PanelBoringData>) => void;
  removePanelBoringData: (panelId: string) => void;
  clearPanelBoringData: () => void;

  // UI 상태 액션
  setIsGenerating: (isGenerating: boolean) => void;
  setIsExporting: (isExporting: boolean) => void;
  setLastExport: (format: ExportFormat) => void;

  // 유틸리티
  getBoringCount: () => number;
  getBoringCountByType: () => Record<string, number>;
  getPanelCount: () => number;
}

// ============================================
// 내보내기 설정 헬퍼
// ============================================

const getDefaultExportSettings = (format: ExportFormat): ExportSettings => {
  switch (format) {
    case 'csv':
      return DEFAULT_CSV_EXPORT_SETTINGS;
    case 'dxf':
      return DEFAULT_DXF_EXPORT_SETTINGS;
    case 'mpr':
      return DEFAULT_MPR_EXPORT_SETTINGS;
    case 'cix':
      return DEFAULT_CIX_EXPORT_SETTINGS;
    default:
      return DEFAULT_CSV_EXPORT_SETTINGS;
  }
};

// ============================================
// 스토어 생성
// ============================================

export const useBoringStore = create<BoringState>()(
  persist(
    (set, get) => ({
      // 초기 상태
      settings: DEFAULT_BORING_SETTINGS,
      panelBoringData: [],
      isGenerating: false,
      isExporting: false,
      lastExportFormat: null,
      lastExportTime: null,

      // 힌지 설정 업데이트
      updateHingeSettings: (hingeSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            hinge: {
              ...state.settings.hinge,
              ...hingeSettings,
            },
          },
        })),

      // 캠락 설정 업데이트
      updateCamLockSettings: (camLockSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            camLock: {
              ...state.settings.camLock,
              ...camLockSettings,
            },
          },
        })),

      // 선반핀 설정 업데이트
      updateShelfPinSettings: (shelfPinSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            shelfPin: {
              ...state.settings.shelfPin,
              ...shelfPinSettings,
            },
          },
        })),

      // 조절발 설정 업데이트
      updateAdjustableFootSettings: (adjustableFootSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            adjustableFoot: {
              ...state.settings.adjustableFoot,
              ...adjustableFootSettings,
            },
          },
        })),

      // 서랍 레일 타입 변경
      updateDrawerRailType: (type) =>
        set((state) => ({
          settings: {
            ...state.settings,
            drawerRail: DRAWER_RAIL_SETTINGS[type] || state.settings.drawerRail,
          },
        })),

      // 서랍 레일 설정 업데이트
      updateDrawerRailSettings: (drawerRailSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            drawerRail: {
              ...state.settings.drawerRail,
              ...drawerRailSettings,
            },
          },
        })),

      // 내보내기 설정 업데이트
      updateExportSettings: (exportSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            export: {
              ...state.settings.export,
              ...exportSettings,
            } as ExportSettings,
          },
        })),

      // 내보내기 형식 변경
      setExportFormat: (format) =>
        set((state) => ({
          settings: {
            ...state.settings,
            export: {
              ...getDefaultExportSettings(format),
              filePerPanel: state.settings.export.filePerPanel,
              includeDimensions: state.settings.export.includeDimensions,
              separateMirrored: state.settings.export.separateMirrored,
              compressToZip: state.settings.export.compressToZip,
            } as ExportSettings,
          },
        })),

      // 설정 초기화
      resetSettings: () =>
        set({
          settings: DEFAULT_BORING_SETTINGS,
        }),

      // 패널 보링 데이터 설정
      setPanelBoringData: (data) =>
        set({
          panelBoringData: data,
        }),

      // 패널 보링 데이터 추가
      addPanelBoringData: (data) =>
        set((state) => ({
          panelBoringData: [...state.panelBoringData, data],
        })),

      // 패널 보링 데이터 업데이트
      updatePanelBoringData: (panelId, data) =>
        set((state) => ({
          panelBoringData: state.panelBoringData.map((panel) =>
            panel.panelId === panelId ? { ...panel, ...data } : panel
          ),
        })),

      // 패널 보링 데이터 제거
      removePanelBoringData: (panelId) =>
        set((state) => ({
          panelBoringData: state.panelBoringData.filter(
            (panel) => panel.panelId !== panelId
          ),
        })),

      // 패널 보링 데이터 초기화
      clearPanelBoringData: () =>
        set({
          panelBoringData: [],
        }),

      // 생성 상태 설정
      setIsGenerating: (isGenerating) =>
        set({ isGenerating }),

      // 내보내기 상태 설정
      setIsExporting: (isExporting) =>
        set({ isExporting }),

      // 마지막 내보내기 기록
      setLastExport: (format) =>
        set({
          lastExportFormat: format,
          lastExportTime: Date.now(),
        }),

      // 전체 보링 개수
      getBoringCount: () => {
        const { panelBoringData } = get();
        return panelBoringData.reduce(
          (total, panel) => total + panel.borings.length,
          0
        );
      },

      // 타입별 보링 개수
      getBoringCountByType: () => {
        const { panelBoringData } = get();
        const counts: Record<string, number> = {};

        panelBoringData.forEach((panel) => {
          panel.borings.forEach((boring) => {
            counts[boring.type] = (counts[boring.type] || 0) + 1;
          });
        });

        return counts;
      },

      // 패널 개수
      getPanelCount: () => {
        const { panelBoringData } = get();
        return panelBoringData.length;
      },
    }),
    {
      name: 'boring-settings-storage',
      partialize: (state) => ({
        settings: state.settings,
        lastExportFormat: state.lastExportFormat,
      }),
    }
  )
);

// ============================================
// 셀렉터
// ============================================

export const selectBoringSettings = (state: BoringState) => state.settings;
export const selectHingeSettings = (state: BoringState) => state.settings.hinge;
export const selectCamLockSettings = (state: BoringState) => state.settings.camLock;
export const selectShelfPinSettings = (state: BoringState) => state.settings.shelfPin;
export const selectDrawerRailSettings = (state: BoringState) => state.settings.drawerRail;
export const selectExportSettings = (state: BoringState) => state.settings.export;
export const selectPanelBoringData = (state: BoringState) => state.panelBoringData;
export const selectIsGenerating = (state: BoringState) => state.isGenerating;
export const selectIsExporting = (state: BoringState) => state.isExporting;
