import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TbRulerMeasure, TbZoomScan } from 'react-icons/tb';
import { RulerDimensionLine } from 'lucide-react';
import { GoQuestion } from 'react-icons/go';
import { IoIosArrowDropup } from 'react-icons/io';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSpaceConfigStore, SPACE_LIMITS, DEFAULT_SPACE_VALUES, DEFAULT_DROPPED_CEILING_VALUES, normalizeSpaceInfoFrameSize, type SpaceInfo } from '@/store/core/spaceConfigStore';
import { inferFrameConfig } from '@/editor/shared/utils/frameConfigBridge';
import { generateSurround } from '@/editor/shared/utils/surroundGenerator';
import { useProjectStore, type BasicInfo } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { useUIStore, type EditorTab, type View2DDirection } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useFurnitureSpaceAdapter } from '@/editor/shared/furniture/hooks/useFurnitureSpaceAdapter';
import { getProject, updateProject, createProject, createDesignFile, getDesignFiles, getDesignFilesPublic } from '@/firebase/projects';
import { captureProjectThumbnail, generateDefaultThumbnail } from '@/editor/shared/utils/thumbnailCapture';
import { useAuth } from '@/auth/AuthProvider';
import { useProjectPermission } from '@/hooks/useProjectPermission';
import { getProjectCollaborators, type ProjectCollaborator } from '@/firebase/shareLinks';
import { getSpaceConfigDefaults } from '@/firebase/userProfiles';
import { SpaceCalculator, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace, calculateTopBottomFrameHeight } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import { computeFrameMergeGroups } from '@/editor/shared/utils/frameMergeUtils';
import { getModuleById } from '@/data/modules';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IslandSetupModal, { IslandSetupValues } from '@/components/common/IslandSetupModal';
import { useHistoryStore } from '@/store/historyStore';
import { useHistoryTracking } from './hooks/useHistoryTracking';
import { use3DExport, type ExportFormat } from '@/editor/shared/hooks/use3DExport';
import type { PlacedModule } from '@/editor/shared/furniture/types';

// 새로운 컴포넌트들 import
import Header from './components/Header';
import TallEpContextMenu from './components/TallEpContextMenu';
import TabBar from './components/TabBar';
import Sidebar, { SidebarTab } from './components/Sidebar';
import ViewerControls, { ViewMode, ViewDirection, RenderMode } from './components/ViewerControls';
import RightPanel, { RightPanelTab, DoorCountSlider as DoorSlider } from './components/RightPanel';
import { ModuleContent } from './components/RightPanel';
import NavigationPane from '@/components/dashboard/NavigationPane';
import { getUserProjects, loadFolderData as loadFolderDataFn } from '@/firebase/projects';
import type { ProjectSummary, DesignFileSummary } from '@/firebase/types';
import type { FolderData as FolderDataType } from '@/firebase/projects';
import type { QuickAccessMenu } from '@/hooks/dashboard/types';
import { TouchCompatibleControl } from './components/TouchCompatibleControls';
import SlotSelector from './components/SlotSelector';


// 기존 작동하는 컴포넌트들
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery, { type ModuleType } from '@/editor/shared/controls/furniture/ModuleGallery';
import ModulePropertiesPanel from '@/editor/shared/controls/furniture/ModulePropertiesPanel';
import PlacedModulePropertiesPanel from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel';
import doorSettingStyles from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel.module.css';
import CustomFurnitureLibrary from '@/editor/shared/controls/furniture/CustomFurnitureLibrary';
import CustomFurnitureUpload from '@/editor/shared/controls/furniture/CustomFurnitureUpload';
import CustomizableFurnitureLibrary from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';
import CustomizablePropertiesPanel from '@/editor/shared/controls/furniture/CustomizablePropertiesPanel';
import SurroundEditPanel from '@/editor/shared/controls/furniture/SurroundEditPanel';
import MyCabinetGallery from '@/editor/shared/controls/furniture/MyCabinetGallery';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';
import ExportPanel from './components/controls/ExportPanel';
import ColumnControl from '@/editor/shared/controls/structure/ColumnControl';
import ColumnEditModal from '@/editor/shared/controls/structure/ColumnEditModal';
import ConvertModal from './components/ConvertModal';
import { PDFTemplatePreview } from '@/editor/shared/components/PDFTemplatePreview';
import { ShareLinkModal } from '@/components/ShareLinkModal';
import PreviewViewer from './components/PreviewViewer';
import MobileBottomBar, { MobileTab } from './components/MobileBottomBar';
import MobileBottomSheet from './components/MobileBottomSheet';
import MobilePanel from './components/MobilePanel';
import MobileToolbar from './components/MobileToolbar';

import {
  WidthControl,
  HeightControl,
  DepthControl,
  InstallTypeControls,
  SurroundControls,
  BaseControls,
  FloorFinishControls
} from '@/editor/shared/controls';
import { BoringExportDialog } from '@/editor/shared/controls/boring';
import { useFurnitureBoring } from '@/domain/boring';
import Step2SpaceAndCustomization from '@/editor/Step1/components/Step2SpaceAndCustomization';

import styles from './style.module.css';
import responsiveStyles from './responsive.module.css';
import rightPanelStyles from './components/RightPanel.module.css';

type DoorGapField =
  | 'doorTopGap'
  | 'doorBottomGap'
  | 'upperDoorTopGap'
  | 'upperDoorBottomGap'
  | 'lowerDoorTopGap'
  | 'lowerDoorBottomGap';

const getTopDownDoorTopGap = (stoneTopThickness?: number, hasTopEndPanel?: boolean): number => {
  if (hasTopEndPanel) return -82;
  if (stoneTopThickness === 10) return -90;
  if (stoneTopThickness === 30) return -70;
  return -80;
};

const getActiveFloorFinishHeight = (space: any): number => {
  if (!space?.hasFloorFinish) return 0;
  return Number(space.floorFinish?.height ?? space.floorFinishHeight ?? 0) || 0;
};

/** 도어 갭 개별 입력 — controlled input (store 값 변경 시 즉시 반영) */
const DoorGapInput: React.FC<{
  moduleId: string;
  field: DoorGapField;
  storeValue: number;
  onCommit: (moduleId: string, field: DoorGapField, val: string, syncModuleIds?: string[]) => void;
  highlightModuleIds?: string[]; // 전체 동기화 시 전체 도어 ID들
  // 표시 기준 모드. 'body' = 몸통 기준(저장값 그대로). 'cf' = 천장·바닥 기준 (거리 - 저장값으로 표시)
  referenceMode?: 'body' | 'cf' | 'cfTopInset';
  // 천장/바닥 기준으로 변환할 때 필요한 거리 (mm).
  //   field=doorTopGap → 천장 ~ 가구 상단 거리
  //   field=doorBottomGap → 가구 하단 ~ 바닥 거리
  refDistanceMm?: number;
}> = ({ moduleId, field, storeValue, onCommit, highlightModuleIds, referenceMode = 'body', refDistanceMm = 0 }) => {
  const isCf = referenceMode === 'cf' || referenceMode === 'cfTopInset';
  const isCfTopInset = referenceMode === 'cfTopInset';
  // 표시값 계산
  const displayFromStore = (v: number) => {
    if (!isCf) return String(v);
    return String(Math.round(isCfTopInset ? refDistanceMm + v : refDistanceMm - v));
  };
  const [localVal, setLocalVal] = useState(displayFromStore(storeValue));
  const [isFocused, setIsFocused] = useState(false);

  // store / 모드 / 거리 변경 시 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!isFocused) {
      setLocalVal(displayFromStore(storeValue));
    }
  }, [storeValue, isFocused, isCf, isCfTopInset, refDistanceMm]);

  const commit = () => {
    setIsFocused(false);
    let toCommit = localVal;
    if (isCf) {
      const raw = parseFloat(localVal);
      if (!isNaN(raw)) {
        // 천장/바닥 기준 입력을 몸통 기준 저장값으로 되돌린다.
        const clamped = Math.max(0, raw);
        toCommit = String(Math.round(isCfTopInset ? clamped - refDistanceMm : refDistanceMm - clamped));
      }
    }
    onCommit(moduleId, field, toCommit, highlightModuleIds);
    useUIStore.getState().setHighlightedDoorGap && useUIStore.getState().setHighlightedDoorGap(null);
  };

  const handleFocus = () => {
    setIsFocused(true);
    const ids = highlightModuleIds && highlightModuleIds.length > 0 ? highlightModuleIds : [moduleId];
    const side = field.toLowerCase().includes('top') ? 'top' : 'bottom';
    useUIStore.getState().setHighlightedDoorGap && useUIStore.getState().setHighlightedDoorGap({ moduleIds: ids, side });
  };

  return (
    <td style={{ padding: '2px 3px', textAlign: 'center' }}>
      <input
        type="number"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onFocus={handleFocus}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        style={{
          width: '100%',
          padding: '4px 2px',
          fontSize: '12px',
          textAlign: 'center',
          border: '1px solid var(--theme-border, #ddd)',
          borderRadius: '3px',
          backgroundColor: 'var(--theme-background-secondary, #f9fafb)',
          color: 'var(--theme-text, #333)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
        step="1"
      />
    </td>
  );
};

const getTopDoorGapForFrameState = (spaceInfo: any, hasTopFrame: boolean): number => {
  if (!hasTopFrame) return -5;
  const frameConfig = spaceInfo?.frameConfig;
  const isFullSurround = spaceInfo?.surroundType === 'surround'
    && frameConfig?.top !== false;
  return isFullSurround ? -3 : 5;
};

/** 프레임 size/옵셋 입력 행 — 로컬 상태 기반 (편집 중 store 업데이트로 인한 덮어쓰기 방지) */
const FrameOffsetRow: React.FC<{
  num: number; label: string; enabled: boolean; sizeMM: number; offset: number;
  onToggle: () => void; onSizeChange: (v: number) => void; onOffsetChange: (v: number) => void;
  highlightKey: string; toAlpha: (n: number) => string; styles: any;
  setHighlightedFrame: (key: string | null) => void;
  gap?: number; onGapChange?: (v: number) => void;
  splitGapFromSize?: boolean;
}> = ({ num, label, enabled, sizeMM, offset, onToggle, onSizeChange, onOffsetChange, highlightKey, toAlpha, styles, setHighlightedFrame, gap, onGapChange, splitGapFromSize = false }) => {
  const gapMM = Math.max(0, gap ?? 0);
  const displaySizeMM = splitGapFromSize ? Math.max(0, sizeMM - gapMM) : sizeMM;
  const commitDisplaySize = (nextDisplaySize: number) => {
    onSizeChange(splitGapFromSize ? nextDisplaySize + gapMM : nextDisplaySize);
  };
  const [sizeText, setSizeText] = useState(String(displaySizeMM || ''));
  const [offsetText, setOffsetText] = useState(offset !== 0 ? String(offset) : '');
  const [gapText, setGapText] = useState((gap ?? 0) !== 0 ? String(gap) : '');
  const sizeFocusRef = useRef(false);
  const offsetFocusRef = useRef(false);
  const gapFocusRef = useRef(false);

  useEffect(() => { if (!sizeFocusRef.current) setSizeText(displaySizeMM ? String(displaySizeMM) : ''); }, [displaySizeMM]);
  useEffect(() => { if (!offsetFocusRef.current) setOffsetText(offset !== 0 ? String(offset) : ''); }, [offset]);
  useEffect(() => { if (!gapFocusRef.current) setGapText((gap ?? 0) !== 0 ? String(gap) : ''); }, [gap]);

  const showGap = typeof onGapChange === 'function';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
      <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>{toAlpha(num)}{label}</span>
      <button onClick={onToggle} className={`${styles.miniToggle} ${enabled ? styles.miniToggleActive : ''}`} />
      {enabled ? (
        <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
          <div className={styles.frameItemInput} style={{ flex: 1 }}>
            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>size</span>
            <input type="text" inputMode="numeric" value={sizeText} placeholder="0"
              onFocus={() => { sizeFocusRef.current = true; setHighlightedFrame(highlightKey); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = Math.max(0, Math.min(9999, (displaySizeMM || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                  setSizeText(String(next)); commitDisplaySize(next);
                } else if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
              }}
              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setSizeText(v); }}
              onBlur={(e) => { sizeFocusRef.current = false; setHighlightedFrame(null); const c = Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)); setSizeText(String(c)); commitDisplaySize(c); }}
              className={styles.frameNumberInput}
            />
          </div>
          <div className={styles.frameItemInput} style={{ flex: 1 }}>
            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
            <input type="text" inputMode="numeric" value={offsetText} placeholder="0"
              onFocus={() => { offsetFocusRef.current = true; setHighlightedFrame(highlightKey); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = Math.max(-200, Math.min(200, (offset || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                  setOffsetText(String(next)); onOffsetChange(next);
                } else if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
              }}
              onChange={(e) => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d+$/.test(v)) setOffsetText(v); }}
              onBlur={(e) => { offsetFocusRef.current = false; setHighlightedFrame(null); const c = Math.max(-200, Math.min(200, parseInt(e.target.value) || 0)); setOffsetText(String(c)); onOffsetChange(c); }}
              className={styles.frameNumberInput}
            />
          </div>
          {showGap && (
            <div className={styles.frameItemInput} style={{ flex: 1 }}>
              <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>갭</span>
              <input type="text" inputMode="numeric" value={gapText} placeholder="0"
                onFocus={() => { gapFocusRef.current = true; setHighlightedFrame(highlightKey); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = Math.max(0, Math.min(2000, (gap || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                    setGapText(String(next)); onGapChange?.(next);
                  } else if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                }}
                onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setGapText(v); }}
                onBlur={(e) => { gapFocusRef.current = false; setHighlightedFrame(null); const c = Math.max(0, Math.min(2000, parseInt(e.target.value) || 0)); setGapText(String(c)); onGapChange?.(c); }}
                className={styles.frameNumberInput}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

/** 단내림 구간 사이즈 한 줄 (좌/우 단내림 순서 대응용) */
const ZoneSizeDroppedRow: React.FC<{
  spaceInfo: any; isFreeMode: boolean; handleSpaceInfoUpdate: (u: any) => void; styles: any; marginBottom?: boolean;
}> = ({ spaceInfo, isFreeMode, handleSpaceInfoUpdate, styles, marginBottom }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ width: '52px', flexShrink: 0, fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>{isFreeMode ? '커튼박스' : '단내림'}</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900)}
        key={`dropped-width-${spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900)}`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={(e) => {
          const inputValue = e.target.value;
          const totalWidth = spaceInfo.width || 4800;
          const currentDroppedWidth = spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900);
          if (inputValue === '' || isNaN(parseInt(inputValue))) { e.target.value = currentDroppedWidth.toString(); return; }
          const newDroppedWidth = parseInt(inputValue);
          const maxWidth = isFreeMode ? 200 : totalWidth - 100;
          if (newDroppedWidth < 100) {
            handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, width: 100 } });
          } else if (newDroppedWidth > maxWidth) {
            handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, width: maxWidth } });
          } else {
            handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, width: newDroppedWidth } });
          }
        }}
        className={styles.input}
        style={{ textAlign: 'center', fontSize: '12px' }}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>×</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={isFreeMode ? (spaceInfo.height || 2400) + (spaceInfo.droppedCeiling?.dropHeight || 100) : (spaceInfo.height || 2400) - (spaceInfo.droppedCeiling?.dropHeight || 200)}
        key={`dropped-height-${isFreeMode ? `${spaceInfo.height}-${spaceInfo.droppedCeiling?.dropHeight}` : (spaceInfo.height || 2400) - (spaceInfo.droppedCeiling?.dropHeight || 200)}`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={(e) => {
          const inputValue = e.target.value;
          const totalHeight = spaceInfo.height || 2400;
          if (isFreeMode) {
            const currentCurtainH = totalHeight + (spaceInfo.droppedCeiling?.dropHeight || 100);
            if (inputValue === '' || isNaN(parseInt(inputValue))) { e.target.value = currentCurtainH.toString(); return; }
            const newCurtainH = parseInt(inputValue);
            const newDropHeight = newCurtainH - totalHeight;
            const maxDrop = 2420 - totalHeight;
            const clampedDrop = Math.max(10, Math.min(Math.max(10, maxDrop), newDropHeight));
            e.target.value = (totalHeight + clampedDrop).toString();
            handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, dropHeight: clampedDrop } });
          } else {
            const currentDroppedHeight = totalHeight - (spaceInfo.droppedCeiling?.dropHeight || 200);
            if (inputValue === '' || isNaN(parseInt(inputValue))) { e.target.value = currentDroppedHeight.toString(); return; }
            const droppedHeight = parseInt(inputValue);
            const newDropHeight = totalHeight - droppedHeight;
            if (newDropHeight < 100) { e.target.value = (totalHeight - 100).toString(); handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, dropHeight: 100 } }); }
            else if (newDropHeight > 500) { e.target.value = (totalHeight - 500).toString(); handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, dropHeight: 500 } }); }
            else { handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, dropHeight: newDropHeight } }); }
          }
        }}
        className={styles.input}
        style={{ textAlign: 'center', fontSize: '12px' }}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>mm</span>
  </div>
);

/** 슬롯배치 커튼박스 구간 사이즈 행 (curtainBox 필드 사용) */
const ZoneSizeCurtainBoxRow: React.FC<{
  spaceInfo: any; handleSpaceInfoUpdate: (u: any) => void; styles: any; marginBottom?: boolean;
}> = ({ spaceInfo, handleSpaceInfoUpdate, styles, marginBottom }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ width: '52px', flexShrink: 0, fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>커튼박스</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={spaceInfo.curtainBox?.width || 150}
        key={`cb-width-${spaceInfo.curtainBox?.width || 150}`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={(e) => {
          const inputValue = e.target.value;
          const currentW = spaceInfo.curtainBox?.width || 150;
          if (inputValue === '' || isNaN(parseInt(inputValue))) { e.target.value = currentW.toString(); return; }
          const newW = Math.max(100, Math.min(200, parseInt(inputValue)));
          const delta = newW - currentW;
          handleSpaceInfoUpdate({
            curtainBox: { ...spaceInfo.curtainBox, width: newW },
            ...(delta !== 0 ? { width: (spaceInfo.width || 0) + delta } : {}),
          });
        }}
        className={styles.input}
        style={{ textAlign: 'center', fontSize: '12px' }}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>×</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={(spaceInfo.height || 2400) + (spaceInfo.curtainBox?.dropHeight || 20)}
        key={`cb-height-${spaceInfo.height}-${spaceInfo.curtainBox?.dropHeight}`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={(e) => {
          const inputValue = e.target.value;
          const totalHeight = spaceInfo.height || 2400;
          const currentH = totalHeight + (spaceInfo.curtainBox?.dropHeight || 20);
          if (inputValue === '' || isNaN(parseInt(inputValue))) { e.target.value = currentH.toString(); return; }
          const newTotalH = parseInt(inputValue);
          const newDrop = newTotalH - totalHeight;
          const maxDrop = 2420 - totalHeight;
          const clampedDrop = Math.max(10, Math.min(Math.max(10, maxDrop), newDrop));
          e.target.value = (totalHeight + clampedDrop).toString();
          handleSpaceInfoUpdate({ curtainBox: { ...spaceInfo.curtainBox, dropHeight: clampedDrop } });
        }}
        className={styles.input}
        style={{ textAlign: 'center', fontSize: '12px' }}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>mm</span>
  </div>
);

/** 메인 구간 사이즈 한 줄 */
const ZoneSizeMainRow: React.FC<{
  spaceInfo: any; isFreeMode: boolean; handleSpaceInfoUpdate: (u: any) => void; styles: any;
}> = ({ spaceInfo, isFreeMode, handleSpaceInfoUpdate, styles }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ width: '52px', flexShrink: 0, fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>메인</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={Math.round((spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.enabled ? (spaceInfo.droppedCeiling.width || (isFreeMode ? 150 : 900)) : 0) - (isFreeMode && spaceInfo.stepCeiling?.enabled ? (spaceInfo.stepCeiling.width || 900) : 0) - (spaceInfo.curtainBox?.enabled ? (spaceInfo.curtainBox.width || 150) : 0))}
        key={`main-width-${(spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.enabled ? (spaceInfo.droppedCeiling.width || 0) : 0) - (spaceInfo.stepCeiling?.enabled ? (spaceInfo.stepCeiling.width || 0) : 0) - (spaceInfo.curtainBox?.enabled ? (spaceInfo.curtainBox.width || 0) : 0)}`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={(e) => {
          const inputValue = e.target.value;
          const totalWidth = spaceInfo.width || 4800;
          const cbW = spaceInfo.curtainBox?.enabled ? (spaceInfo.curtainBox.width || 150) : 0;
          const scW = isFreeMode && spaceInfo.stepCeiling?.enabled ? (spaceInfo.stepCeiling.width || 900) : 0;
          const currentDroppedW = spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900);
          const currentMainOuter = totalWidth - currentDroppedW - cbW - scW;
          if (inputValue === '' || isNaN(parseInt(inputValue))) { e.target.value = Math.round(currentMainOuter).toString(); return; }
          const newMainOuter = parseInt(inputValue);
          const newDroppedWidth = totalWidth - newMainOuter - cbW - scW;
          if (newDroppedWidth < 100) {
            handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, width: 100 } });
          } else if (newDroppedWidth > totalWidth - 100 - cbW - scW) {
            handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, width: totalWidth - 100 - cbW - scW } });
          } else {
            handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, width: newDroppedWidth } });
          }
        }}
        className={styles.input}
        style={{ textAlign: 'center', fontSize: '12px' }}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>×</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={spaceInfo.height || 2400}
        key={`main-height-${spaceInfo.height || 2400}`}
        readOnly={isFreeMode}
        style={isFreeMode ? { textAlign: 'center', fontSize: '12px', opacity: 0.6, cursor: 'default' } : { textAlign: 'center', fontSize: '12px' }}
        onKeyDown={(e) => {
          if (isFreeMode) return;
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        }}
        onBlur={(e) => {
          if (isFreeMode) return;
          const value = e.target.value;
          const totalHeight = spaceInfo.height || 2400;
          if (value === '' || isNaN(parseInt(value))) { e.target.value = totalHeight.toString(); return; }
          const numValue = parseInt(value);
          if (numValue < 1800) { e.target.value = '1800'; handleSpaceInfoUpdate({ height: 1800 }); }
          else if (numValue > 3000) { e.target.value = '3000'; handleSpaceInfoUpdate({ height: 3000 }); }
          else { handleSpaceInfoUpdate({ height: numValue }); }
        }}
        className={styles.input}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>mm</span>
  </div>
);

/** stepCeiling(자유배치 전용 단내림) 구간 사이즈 한 줄 */
const ZoneSizeStepCeilingRow: React.FC<{ spaceInfo: any; styles: any; }> = ({ spaceInfo, styles }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ width: '52px', flexShrink: 0, fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>단내림</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={spaceInfo.stepCeiling?.width}
        key={`sc-zone-w-${spaceInfo.stepCeiling?.width}`}
        readOnly
        style={{ textAlign: 'center', fontSize: '12px', opacity: 0.6, cursor: 'default' }}
        className={styles.input}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>×</span>
    <div className={styles.inputWithUnit} style={{ width: '80px' }}>
      <input
        type="text"
        defaultValue={(spaceInfo.height || 2400) - (spaceInfo.stepCeiling?.dropHeight || 200)}
        key={`sc-zone-h-${spaceInfo.height}-${spaceInfo.stepCeiling?.dropHeight}`}
        readOnly
        style={{ textAlign: 'center', fontSize: '12px', opacity: 0.6, cursor: 'default' }}
        className={styles.input}
      />
    </div>
    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>mm</span>
  </div>
);

type WorkingDesignSnapshot = {
  projectId: string;
  designFileId: string;
  designFileName: string;
  folderName: string;
  folderId: string | null;
  basicInfo: BasicInfo;
  spaceInfo: SpaceInfo;
  placedModules: PlacedModule[];
  projectDirty: boolean;
  spaceDirty: boolean;
  furnitureDirty: boolean;
};

const cloneForWorkingSnapshot = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

const makeWorkingDesignKey = (projectId?: string | null, designFileId?: string | null) => {
  if (!projectId) return null;
  return `${projectId}:${designFileId || 'project'}`;
};

const buildSharedViewerUrl = (
  projectId: string,
  designFileId?: string | null,
  designFileName?: string | null,
  scope: 'project' | 'design' = 'project'
) => {
  const params = new URLSearchParams({
    projectId,
    mode: 'readonly',
    scope,
  });
  if (designFileId) {
    params.set('designFileId', designFileId);
  }
  if (designFileName) {
    params.set('designFileName', designFileName);
  }
  return `/shared-viewer?${params.toString()}`;
};

const Configurator: React.FC = () => {
  const { user: authUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // 데모 모드: /demo 경로일 때 로그인/저장/Firebase 없이 빈 에디터
  const isDemoMode = typeof window !== 'undefined' && window.location.pathname.startsWith('/demo');
  // 데모 모드에서는 user를 null로 취급 (계정 정보 표시 차단)
  const user = isDemoMode ? null : authUser;
  const canShowSpaceDepthControl = user?.email?.trim().toLowerCase() === 'sbbc212@gmail.com';

  // URL 파라미터 미리 추출
  const modeParam = searchParams.get('mode');
  const isReadOnlyMode = modeParam === 'readonly';
  const shareScopeParam = searchParams.get('scope') === 'project' ? 'project' : 'design';
  const isNewDesign = isDemoMode ? true : searchParams.get('design') === 'new';
  const projectIdParam = isDemoMode ? null : (searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project'));

  const [loading, setLoading] = useState(!isNewDesign && !isReadOnlyMode && !isDemoMode); // 데모/새 디자인/readonly 모드인 경우 로딩 건너뛰기
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const saveInProgressRef = useRef(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentDesignFileId, setCurrentDesignFileId] = useState<string | null>(null);
  const [currentDesignFileName, setCurrentDesignFileName] = useState<string>('');
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showSpaceConfigPopup, setShowSpaceConfigPopup] = useState(false);
  const localHistoryScopeRef = useRef(`local:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`);

  // 프로젝트 권한 확인 (readonly 모드에서는 권한 체크 건너뛰기)
  // readonly 모드에서는 URL에서 직접 projectId 읽기
  const permissionProjectId = isReadOnlyMode ? projectIdParam : currentProjectId;
  const { permission, canEdit, isOwner } = useProjectPermission(permissionProjectId, isReadOnlyMode);

  // 읽기 전용 모드 계산 (상태 변경 없이 useMemo로 계산)
  const isReadOnly = useMemo(() => {
    // URL mode=readonly가 최우선
    if (isReadOnlyMode) return true;
    // viewer 권한이면 읽기 전용
    if (permission === 'viewer') return true;
    return false;
  }, [isReadOnlyMode, permission]);

  // 협업자 및 소유자 정보
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [projectOwner, setProjectOwner] = useState<{ userId: string; name: string; photoURL?: string } | null>(null);

  // Store hooks
  const { setBasicInfo, basicInfo } = useProjectStore();
  const { setSpaceInfo, spaceInfo, updateColumn, resetSpaceInfo } = useSpaceConfigStore();
  const { setPlacedModules, placedModules, setAllDoors, clearAllModules, updatePlacedModule } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  const { updateFurnitureForNewSpace } = useFurnitureSpaceAdapter({ setPlacedModules });
  const { viewMode, setViewMode, doorsOpen, toggleDoors, setDoorsOpen, view2DDirection, setView2DDirection, showDimensions, toggleDimensions, showDimensionsText, toggleDimensionsText, highlightedFrame, setHighlightedFrame, selectedColumnId, setSelectedColumnId, activePopup, openColumnEditModal, closeAllPopups, showGuides, toggleGuides, showAxis, toggleAxis, activeDroppedCeilingTab, setActiveDroppedCeilingTab, showFurniture, setShowFurniture, setShadowEnabled, toggleIndividualDoor, showBorings, toggleBorings, renderMode, setRenderMode, setLayoutBuilderOpen, selectedFurnitureId, setSelectedFurnitureId, showFrame } = useUIStore();
  const view2DTheme = useUIStore(s => s.view2DTheme);
  const equalDistributionUpper = useUIStore(s => s.equalDistributionUpper);
  const equalDistributionLower = useUIStore(s => s.equalDistributionLower);
  const toggleEqualDistributionUpper = useUIStore(s => s.toggleEqualDistributionUpper);
  const toggleEqualDistributionLower = useUIStore(s => s.toggleEqualDistributionLower);
  const guideDepthEditMode = useUIStore(s => s.guideDepthEditMode);
  const guideDepthZone = useUIStore(s => s.guideDepthZone);
  const setGuideDepthZone = useUIStore(s => s.setGuideDepthZone);
  const isLiveDimensionMode = useUIStore(s => s.isLiveDimensionMode);
  const toggleLiveDimensionMode = useUIStore(s => s.toggleLiveDimensionMode);
  const isTapeMeasureMode = useUIStore(s => s.isTapeMeasureMode);
  const toggleTapeMeasureMode = useUIStore(s => s.toggleTapeMeasureMode);


  // 새로운 UI 상태들
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab | null>(() => {
    // readonly 모드에서는 조회자가 좌측 재질바를 바로 볼 수 있게 연 상태로 시작
    const mode = searchParams.get('mode');
    return mode === 'readonly' ? 'material' : 'module';
  });
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<'placement' | 'module'>('placement');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => {
    // URL 파라미터로 패널 상태 초기화 (미리보기 팝업용)
    const panelClosed = searchParams.get('panelClosed');
    return panelClosed !== 'true';
  });
  const [isFrameSectionCollapsed, setIsFrameSectionCollapsed] = useState(false);
  // 상부/걸래받이 '전체' 통합 모드 (기본 true: 통합 행 표시)
  const [topFrameAllMode, setTopFrameAllMode] = useState<boolean>(true);
  const [baseFrameAllMode, setBaseFrameAllMode] = useState<boolean>(true);

  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const [fileTreeProjects, setFileTreeProjects] = useState<ProjectSummary[]>([]);
  const [fileTreeActiveMenu, setFileTreeActiveMenu] = useState<QuickAccessMenu>('in-progress');
  const [fileTreeFolders, setFileTreeFolders] = useState<{ [projectId: string]: FolderDataType[] }>({});
  // 파일트리 우측 패널: 선택된 프로젝트의 디자인 파일 목록
  const [fileTreeSelectedProjectId, setFileTreeSelectedProjectId] = useState<string | null>(null);
  const [fileTreeSelectedFolderId, setFileTreeSelectedFolderId] = useState<string | null>(null);
  const [fileTreeDesignFiles, setFileTreeDesignFiles] = useState<DesignFileSummary[]>([]);
  const [moduleCategory, setModuleCategory] = useState<'clothing' | 'shoes' | 'kitchen'>('clothing'); // 의류장/신발장/주방 토글
  const [kitchenSub, setKitchenSub] = useState<'basic' | 'door-raise' | 'top-down' | 'upper' | 'tall'>('basic'); // 주방 서브카테고리
  const kitchenTabsRef = useRef<HTMLDivElement>(null);
  const [kitchenTabsScroll, setKitchenTabsScroll] = useState({ canLeft: false, canRight: false });

  const updateKitchenTabsScroll = useCallback(() => {
    const el = kitchenTabsRef.current;
    if (!el) return;
    // 임계값 4px - 부동소수점/zoom/snap 보정 오차 흡수
    const THRESHOLD = 4;
    const canLeft = el.scrollLeft > THRESHOLD;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - THRESHOLD;
    // 스크롤이 필요 없는 경우(콘텐츠가 컨테이너보다 작음)에는 둘 다 false
    const noOverflow = el.scrollWidth <= el.clientWidth + THRESHOLD;
    const next = noOverflow
      ? { canLeft: false, canRight: false }
      : { canLeft, canRight };
    setKitchenTabsScroll(prev =>
      prev.canLeft === next.canLeft && prev.canRight === next.canRight ? prev : next
    );
  }, []);

  const scrollKitchenTabs = useCallback((dir: 'left' | 'right') => {
    const el = kitchenTabsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -100 : 100, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    // 주방 탭이 보일 때만 갱신
    updateKitchenTabsScroll();
    const el = kitchenTabsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateKitchenTabsScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [moduleCategory, kitchenSub, updateKitchenTabsScroll]);
  const [islandSetupOpen, setIslandSetupOpen] = useState(false); // 아일랜드 팝업 열림 여부
  const [islandSetupMode, setIslandSetupMode] = useState<'create' | 'edit'>('create');
  const [moduleType, setModuleType] = useState<ModuleType>('all'); // 전체/싱글/듀얼 탭
  const [customCategory, setCustomCategory] = useState<'full' | 'upper' | 'lower'>('full'); // 커스텀 전체장/상부장/하부장 토글
  const [myCabinetCategory, setMyCabinetCategory] = useState<'full' | 'upper' | 'lower'>('full'); // My캐비닛 카테고리 필터
  const [myCabinetEditMode, setMyCabinetEditMode] = useState(false); // My캐비닛 편집 모드
  const [showCustomUploadModal, setShowCustomUploadModal] = useState(false); // 커스텀 가구 업로드 모달
  const [showBoringExportDialog, setShowBoringExportDialog] = useState(false); // 보링 내보내기 대화상자

  // 새 디자인 모달 상태
  const [isNewDesignModalOpen, setIsNewDesignModalOpen] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [newDesignProjects, setNewDesignProjects] = useState<ProjectSummary[]>([]);
  const [newDesignProjectId, setNewDesignProjectId] = useState<string | null>(null);
  const [isCreatingNewDesign, setIsCreatingNewDesign] = useState(false);
  const [pendingGuideSetupDesignFileId, setPendingGuideSetupDesignFileId] = useState<string | null>(null);

  // 도어 셋팅: 자유배치 모드 + 도어 달린 가구가 실제로 배치되어 있을 때만 표시
  const doorFurnitureList = useMemo(() =>
    placedModules.filter(m => m.hasDoor).sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0)),
    [placedModules]
  );
  // 도어 번호 매핑: 듀얼(양문) 가구는 도어 2개, 싱글 가구는 도어 1개
  const doorNumberMap = useMemo(() => {
    let doorNum = 1;
    return doorFurnitureList.map((mod) => {
      const isDual = mod.isDualSlot || mod.moduleId?.includes('dual-') || mod.baseModuleType?.includes('dual-');
      const isUpper = mod.moduleId?.includes('upper-');
      const isLower = mod.moduleId?.includes('lower-');
      const category: 'full' | 'upper' | 'lower' = isUpper ? 'upper' : isLower ? 'lower' : 'full';
      if (isDual) {
        const nums = [doorNum, doorNum + 1];
        doorNum += 2;
        return { label: nums.join(','), nums, isDual: true, category };
      } else {
        const nums = [doorNum];
        doorNum += 1;
        return { label: String(nums[0]), nums, isDual: false, category };
      }
    });
  }, [doorFurnitureList]);
  const isDoorSplitSettingModule = useCallback((mod: any) => {
    const moduleId = mod?.moduleId || '';
    return moduleId.includes('shelf-split') || moduleId.includes('pantry-cabinet-split');
  }, []);
  const computeShelfSplitTopDistance = useCallback((mod: any, effectiveHeight = spaceInfo.height): number | null => {
    const moduleId = mod?.moduleId || '';
    const sections = Array.isArray(mod?.customSections) ? mod.customSections : [];
    if (!moduleId.includes('shelf-split') || sections.length < 2) return null;

    const baseDistance = mod.hasBase === false
      ? (mod.individualFloatHeight ?? 0)
      : (mod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
    const sectionTop = baseDistance + sections
      .slice(0, 2)
      .reduce((sum: number, section: any) => sum + (Number(section?.height) || 0), 0);
    return Math.max(0, Math.round(effectiveHeight - sectionTop));
  }, [spaceInfo.baseConfig?.height, spaceInfo.baseConfig?.type, spaceInfo.height]);
  const getTopFrameSizeUpdates = useCallback((mod: any, nextSize: number, effectiveHeight = spaceInfo.height) => {
    const clampedSize = Math.max(0, nextSize);
    const moduleId = mod?.moduleId || '';
    const sections = Array.isArray(mod?.customSections) ? mod.customSections : [];
    if (!moduleId.includes('shelf-split') || sections.length < 2) {
      return { topFrameThickness: clampedSize };
    }

    const baseDistance = mod.hasBase === false
      ? (mod.individualFloatHeight ?? 0)
      : (mod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
    const lowerH = Number(sections[0]?.height) || 0;
    const nextUpperH = Math.max(100, effectiveHeight - baseDistance - clampedSize - lowerH);
    const nextSections = sections.map((section: any, index: number) => (
      index === 1 ? { ...section, height: nextUpperH, heightType: 'absolute' } : section
    ));

    return {
      topFrameThickness: clampedSize,
      customSections: nextSections,
      upperDoorHingePositionsMm: undefined,
    };
  }, [spaceInfo.baseConfig?.height, spaceInfo.baseConfig?.type, spaceInfo.height]);
  const getShelfSplitTopClearanceUpdates = useCallback((mod: any, nextState: Record<string, any>, effectiveHeight = spaceInfo.height) => {
    const moduleId = mod?.moduleId || '';
    const sections = Array.isArray(mod?.customSections) ? mod.customSections : [];
    if (!moduleId.includes('shelf-split') || sections.length < 2) {
      return nextState;
    }

    const nextHasTopFrame = nextState.hasTopFrame ?? mod.hasTopFrame;
    const nextTopFrameThickness = nextState.topFrameThickness ?? mod.topFrameThickness ?? computeShelfSplitTopDistance(mod, effectiveHeight) ?? (spaceInfo.frameSize?.top ?? 30);
    const nextTopGap = nextState.topFrameGap ?? mod.topFrameGap ?? computeShelfSplitTopDistance(mod, effectiveHeight) ?? 0;
    const topClearance = nextHasTopFrame === false
      ? Math.max(0, nextTopGap)
      : Math.max(0, nextTopFrameThickness);
    const nextHasBase = nextState.hasBase ?? mod.hasBase;
    const nextIndividualFloatHeight = nextState.individualFloatHeight ?? mod.individualFloatHeight;
    const nextBaseFrameHeight = nextState.baseFrameHeight ?? mod.baseFrameHeight;
    const baseDistance = nextHasBase === false
      ? (nextIndividualFloatHeight ?? 0)
      : (nextBaseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
    const lowerH = Number(sections[0]?.height) || 0;
    const nextUpperH = Math.max(100, effectiveHeight - baseDistance - topClearance - lowerH);
    const nextSections = sections.map((section: any, index: number) => (
      index === 1 ? { ...section, height: nextUpperH, heightType: 'absolute' } : section
    ));

    return {
      ...nextState,
      customSections: nextSections,
      upperDoorHingePositionsMm: undefined,
    };
  }, [
    computeShelfSplitTopDistance,
    spaceInfo.baseConfig?.height,
    spaceInfo.baseConfig?.type,
    spaceInfo.frameSize?.top,
    spaceInfo.height,
  ]);
  const getBaseFrameSizeUpdates = useCallback((mod: any, nextSize: number) => {
    const clampedSize = Math.max(0, nextSize);
    const currentBase = mod?.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 65);
    const baseDelta = currentBase - clampedSize;
    const moduleId = mod?.moduleId || '';
    const sections = Array.isArray(mod?.customSections) ? mod.customSections : [];

    if (moduleId.includes('shelf-split') && sections.length >= 2) {
      const lowerH = Number(sections[0]?.height) || 0;
      const currentUpperH = Number(sections[1]?.height) || 0;
      const availableAfterBaseAndLower = Math.max(0, (spaceInfo.height ?? 0) - clampedSize - lowerH);
      const nextUpperH = Math.min(
        availableAfterBaseAndLower,
        Math.max(100, currentUpperH + baseDelta)
      );
      const nextTopFrameH = Math.max(0, Math.round(availableAfterBaseAndLower - nextUpperH));
      const nextSections = sections.map((section: any, index: number) => (
        index === 1
          ? { ...section, height: nextUpperH, heightType: 'absolute' }
          : section
      ));
      return {
        baseFrameHeight: clampedSize,
        topFrameThickness: nextTopFrameH,
        customSections: nextSections,
        upperDoorHingePositionsMm: undefined,
      };
    }

    return { baseFrameHeight: clampedSize };
  }, [spaceInfo]);
  // 키큰장 / 상하부장 분리
  const fullDoorIndices = useMemo(() => doorNumberMap
    .map((info, i) => ({ info, i }))
    .filter(x => x.info.category === 'full' && !isDoorSplitSettingModule(doorFurnitureList[x.i])), [doorNumberMap, doorFurnitureList, isDoorSplitSettingModule]);
  const partialDoorSettingEntries = useMemo(() => {
    return doorNumberMap.flatMap((info, i) => {
      const mod = doorFurnitureList[i];
      if (!mod) return [];
      if (isDoorSplitSettingModule(mod)) {
        const isPantrySplit = (mod.moduleId || '').includes('pantry-cabinet-split');
        const lowerTopDefault = isPantrySplit ? -2 : -40;
        const upperBottomDefault = isPantrySplit ? -1 : 20;
        const lowerTopValue = typeof mod.lowerDoorTopGap === 'number'
          ? (mod.lowerDoorTopGap === (isPantrySplit ? 2 : 40) ? lowerTopDefault : mod.lowerDoorTopGap)
          : lowerTopDefault;
        const upperBottomValue = typeof mod.upperDoorBottomGap === 'number'
          ? (
            (!isPantrySplit && mod.upperDoorBottomGap === -20)
              ? upperBottomDefault
              : (isPantrySplit && mod.upperDoorBottomGap === 1 ? upperBottomDefault : mod.upperDoorBottomGap)
          )
          : upperBottomDefault;
        return [
          {
            key: `${mod.id}-lower`,
            mod,
            label: `도어 ${info.label}(하)`,
            topField: 'lowerDoorTopGap' as DoorGapField,
            bottomField: 'lowerDoorBottomGap' as DoorGapField,
            topValue: lowerTopValue,
            bottomValue: mod.lowerDoorBottomGap ?? 0,
            category: 'lower' as const,
            splitPart: 'lower' as const
          },
          {
            key: `${mod.id}-upper`,
            mod,
            label: `도어 ${info.label}(상)`,
            topField: 'upperDoorTopGap' as DoorGapField,
            bottomField: 'upperDoorBottomGap' as DoorGapField,
            topValue: mod.upperDoorTopGap ?? (mod.doorTopGap ?? 0),
            bottomValue: upperBottomValue,
            category: 'upper' as const,
            splitPart: 'upper' as const
          }
        ];
      }
      if (info.category === 'full') return [];
      return [{
        key: mod.id,
        mod,
        label: `도어 ${info.label}${info.category === 'upper' ? '(상)' : '(하)'}`,
        topField: 'doorTopGap' as DoorGapField,
        bottomField: 'doorBottomGap' as DoorGapField,
        topValue: mod.doorTopGap ?? -20,
        bottomValue: mod.doorBottomGap ?? 5,
        category: info.category,
        splitPart: null
      }];
    });
  }, [doorNumberMap, doorFurnitureList, isDoorSplitSettingModule]);
  const showDoorSetup = doorFurnitureList.length > 0;
  const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
  const currentFloatHeight = spaceInfo.baseConfig?.floatHeight || 200;
  const [doorGapAllSync, setDoorGapAllSync] = useState(true);
  const visiblePartialDoorSettingEntries = useMemo(() => (
    doorGapAllSync
      ? partialDoorSettingEntries.filter(entry => entry.splitPart)
      : partialDoorSettingEntries
  ), [doorGapAllSync, partialDoorSettingEntries]);
  const visibleUpperDoorSettingEntries = useMemo(() => (
    visiblePartialDoorSettingEntries.filter(entry => entry.category === 'upper')
  ), [visiblePartialDoorSettingEntries]);
  const visibleLowerDoorSettingEntries = useMemo(() => (
    visiblePartialDoorSettingEntries.filter(entry => entry.category === 'lower')
  ), [visiblePartialDoorSettingEntries]);
  const normalUpperDoorSettingEntries = useMemo(() => (
    partialDoorSettingEntries.filter(entry => entry.category === 'upper' && !entry.splitPart)
  ), [partialDoorSettingEntries]);
  const normalLowerDoorSettingEntries = useMemo(() => (
    partialDoorSettingEntries.filter(entry => entry.category === 'lower' && !entry.splitPart)
  ), [partialDoorSettingEntries]);
  const hasDoorGapSyncTargets = fullDoorIndices.length > 0
    || normalUpperDoorSettingEntries.length > 0
    || normalLowerDoorSettingEntries.length > 0;
  // 도어 셋팅 표시 기준 ('body' = 몸통 기준 / 'cf' = 천장·바닥 기준)
  const doorGapRefMode = useUIStore(s => s.doorGapDisplayMode);
  const setDoorGapRefMode = useUIStore(s => s.setDoorGapDisplayMode);

  // 가구별 천장/마감 바닥까지 거리 계산 (천장·바닥 기준 변환용)
  //   - topDistance: 가구 상단 ~ 천장 사이 거리 = 상단몰딩 두께(topFrameThickness)
  //   - bottomDistance: 가구 하단 ~ 마감 바닥 거리 = 걸레받이 높이(baseFrameHeight)
  //   ※ 가구 자체 높이는 공간 - 상단몰딩 - 걸레받이로 자동 계산되므로,
  //     "가구 상단~천장 거리"는 상단몰딩 두께와 정확히 같음.
  const computeRefDistances = useCallback((mod: any): { topDistance: number; bottomDistance: number } => {
    if (!mod) return { topDistance: 0, bottomDistance: 0 };
    const shelfSplitTopDistance = computeShelfSplitTopDistance(mod);
    const topFrameMm = shelfSplitTopDistance !== null
      ? shelfSplitTopDistance
      : mod.hasTopFrame === false
      ? 0
      : (mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));
    const baseFrameMm = mod.hasBase === false
      ? (mod.individualFloatHeight ?? 0)
      : (mod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
    return {
      topDistance: Math.max(0, topFrameMm),
      bottomDistance: Math.max(0, baseFrameMm)
    };
  }, [computeShelfSplitTopDistance, spaceInfo]);

  const computeSplitDoorRefDistances = useCallback((
    mod: any,
    splitPart?: 'lower' | 'upper' | null
  ): { topDistance: number; bottomDistance: number } => {
    const baseDistances = computeRefDistances(mod);
    if (!mod || !splitPart || !isDoorSplitSettingModule(mod)) {
      return baseDistances;
    }

    const customSections = Array.isArray(mod.customSections) ? mod.customSections : [];
    if (splitPart === 'upper' && customSections.length >= 2) {
      const bottomDistance = baseDistances.bottomDistance;
      const sectionTopFromFloor = bottomDistance + customSections
        .slice(0, 2)
        .reduce((sum: number, section: any) => sum + (Number(section?.height) || 0), 0);
      return {
        topDistance: Math.max(0, Math.round((spaceInfo.height || 0) - sectionTopFromFloor)),
        bottomDistance
      };
    }

    return baseDistances;
  }, [computeRefDistances, isDoorSplitSettingModule, spaceInfo.height]);

  // 개별 모드: 개별 가구 도어 갭 변경 (전체선택 시 모든 도어에 동일 적용)
  const handleIndividualDoorGapChange = (moduleId: string, field: DoorGapField, val: string, syncModuleIds?: string[]) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      // 일반 도어 갭만 글로벌 fallback 값으로도 반영한다.
      if ((field === 'doorTopGap' || field === 'doorBottomGap') && (!doorGapAllSync || !syncModuleIds?.length)) {
        setSpaceInfo({ [field]: num });
      }

      if (doorGapAllSync && (field === 'doorTopGap' || field === 'doorBottomGap')) {
        // 전체 동기화: 지정된 그룹이 있으면 해당 그룹 안에서만, 없으면 전체 도어에 동일 값 적용
        const targetIdSet = syncModuleIds?.length ? new Set(syncModuleIds) : null;
        const newModules = useFurnitureStore.getState().placedModules.map(m =>
          m.hasDoor && (!targetIdSet || targetIdSet.has(m.id)) ? { ...m, [field]: num } : m
        );
        useFurnitureStore.setState({ placedModules: newModules });
        // R3F 리렌더 보장
        setTimeout(() => {
          useFurnitureStore.setState({ placedModules: [...newModules] });
        }, 50);
      } else {
        updatePlacedModule(moduleId, { [field]: num });
      }
    }
  };

  // 도어 셋팅 최초 표시 시 undefined 값만 기본값으로 채움 (카테고리별 분기)
  React.useEffect(() => {
    if (!showDoorSetup) return;
    const needsInit = spaceInfo.doorTopGap === undefined || spaceInfo.doorBottomGap === undefined;
    if (!needsInit) return;
    const topGap = spaceInfo.doorTopGap ?? 1.5;
    const isFloat = spaceInfo.baseConfig?.placementType === 'float';
    const floatH = spaceInfo.baseConfig?.floatHeight || 200;
    const botGap = spaceInfo.doorBottomGap ?? (isFloat ? floatH : 25);
    setSpaceInfo({ doorTopGap: topGap, doorBottomGap: botGap });
    // non-callback set으로 R3F 리렌더 보장
    const initMods = useFurnitureStore.getState().placedModules.map(m => {
      if (!m.hasDoor) return m;
      if (m.doorTopGap !== undefined && m.doorBottomGap !== undefined) return m;
      // 모듈별 기본값: 도어올림=30, 상판내림=두께별(10T=-90/20T=-80/30T=-70), 일반하부장=-20, 그 외=spaceInfo
      const mid = m.moduleId || '';
      const isLower = mid.startsWith('lower-') || mid.includes('dual-lower-');
      const isDL = mid.includes('lower-door-lift-') && !mid.includes('-half-');
      const isTD = mid.includes('lower-top-down-') && !mid.includes('-half-');
      const defaultTop = isDL ? 30 : isTD ? getTopDownDoorTopGap(m.stoneTopThickness, m.hasTopEndPanel === true) : isLower ? -20 : topGap;
      const defaultBot = isLower ? 5 : botGap;
      return { ...m, doorTopGap: m.doorTopGap ?? defaultTop, doorBottomGap: m.doorBottomGap ?? defaultBot };
    });
    useFurnitureStore.setState({ placedModules: initMods });
    setTimeout(() => {
      useFurnitureStore.setState({ placedModules: [...initMods] });
    }, 50);
  }, [showDoorSetup]);

  // 하부장 doorTopGap/doorBottomGap 기본값 마이그레이션 (모듈별 기본값)
  // 잘못된 이전 기본값(0, 20, 1.5 등)을 모듈별 올바른 기본값으로 교정
  React.useEffect(() => {
    const mods = useFurnitureStore.getState().placedModules;
    let changed = false;
    const fixed = mods.map(m => {
      if (!m.hasDoor) return m;
      const mid = m.moduleId || '';
      const isLower = mid.startsWith('lower-') || mid.includes('dual-lower-');
      if (!isLower) return m;
      // 모듈별 올바른 기본값
      const isDL = mid.includes('lower-door-lift-') && !mid.includes('-half-');
      const isTD = mid.includes('lower-top-down-') && !mid.includes('-half-');
      const correctTopGap = isDL ? 30 : isTD ? getTopDownDoorTopGap(m.stoneTopThickness, m.hasTopEndPanel === true) : -20;
      // undefined만 기본값으로 보정한다. 0/양수/음수는 사용자가 직접 입력한 유효한 도어 갭이다.
      const badTopValues = [undefined];
      const badBotValues = [undefined];
      const needsTopFix = badTopValues.includes(m.doorTopGap as undefined | number);
      const needsBotFix = badBotValues.includes(m.doorBottomGap as undefined | number);
      if (needsTopFix || needsBotFix) {
        changed = true;
        return {
          ...m,
          doorTopGap: needsTopFix ? correctTopGap : m.doorTopGap,
          doorBottomGap: needsBotFix ? 5 : m.doorBottomGap,
        };
      }
      return m;
    });
    if (changed) {
      useFurnitureStore.setState({ placedModules: fixed });
    }
  }, []);

  // 걸래받이 OFF/ON + 띄움높이 동기화는 RightPanel에서 직접 처리
  // (Configurator watcher 제거 — React 배치 업데이트로 인한 경쟁 조건 방지)

  // Configurator 진입 시 렌더모드 solid로 초기화 (CNC 옵티마이저 등 다른 페이지에서 돌아왔을 때 wireframe 잔상 방지)
  useEffect(() => {
    setRenderMode('solid');
  }, []);

  // 상부장 topFrameOffset 자동 동기화: surroundType 변경 시에만 1회 동기화
  // (placedModules deps 제거 — 사용자가 옵셋 0 등으로 변경 시 자동 23으로 되돌리는 문제 방지)
  useEffect(() => {
    if (isLoadingProjectRef.current) return;
	    const isSurround = spaceInfo.surroundType === 'surround';
	    const isFullSurroundDoorDefault = isSurround && spaceInfo.frameConfig?.top !== false;
	    placedModules.forEach(m => {
	      const isShelfSplit = m.moduleId?.includes('shelf-split');
	      const isUpper = m.moduleId?.includes('upper-cabinet') || m.moduleId?.startsWith('upper-');
	      const isLower = m.moduleId?.startsWith('lower-') || m.moduleId?.includes('dual-lower-');
	      if (isShelfSplit && m.hasDoor) {
	        const targetTopGap = isFullSurroundDoorDefault && m.hasTopFrame !== false ? -3 : 5;
	        const updates: any = {};
	        if (m.doorTopGap === undefined) {
	          updates.doorTopGap = targetTopGap;
	        }
	        if ((m as any).upperDoorTopGap === undefined) {
	          updates.upperDoorTopGap = targetTopGap;
	        }
	        if (Object.keys(updates).length > 0) {
	          updatePlacedModule(m.id, updates);
	        }
	      }
	      if (!isShelfSplit && isFullSurroundDoorDefault && m.hasDoor && !isLower && m.hasTopFrame !== false && (m.doorTopGap === undefined || m.doorTopGap === 5)) {
	        updatePlacedModule(m.id, { doorTopGap: -3 });
	      }
      if (!isUpper) return;
      // 옵셋이 명시적으로 설정 안 된 경우(undefined)에만 기본값 적용
      if (isSurround) {
        if (m.topFrameOffset === undefined) {
          updatePlacedModule(m.id, { topFrameOffset: 23 });
        }
      } else {
        // 노서라운드 전환 시에만 잔재값 0으로 리셋 (이후 사용자 입력은 보존)
        if (m.topFrameOffset !== undefined && m.topFrameOffset !== 0) {
          updatePlacedModule(m.id, { topFrameOffset: 0 });
        }
      }
    });
    // surroundType / frameConfig.top 변경 시에만 실행 (placedModules 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceInfo.surroundType, spaceInfo.frameConfig?.top]);

  // 보링 데이터 생성 훅
  const { panels: boringPanels, totalBorings, furnitureCount: boringFurnitureCount } = useFurnitureBoring();

  // 모바일/태블릿 반응형 상태
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isSlotGuideOpen, setIsSlotGuideOpen] = useState(false);
  const slotGuideRef = useRef<HTMLDivElement>(null);
  const slotGuideBtnRef = useRef<HTMLButtonElement>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 슬롯 가이드 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!isSlotGuideOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        slotGuideRef.current && !slotGuideRef.current.contains(e.target as Node) &&
        slotGuideBtnRef.current && !slotGuideBtnRef.current.contains(e.target as Node)
      ) {
        setIsSlotGuideOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isSlotGuideOpen]);

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // 화면 크기 감지
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // 모바일 탭 변경 핸들러
  const handleMobileTabChange = (tab: MobileTab) => {
    if (activeMobileTab === tab) {
      // 같은 탭 클릭 시 닫기
      setActiveMobileTab(null);
      setMobileSheetOpen(false);
    } else {
      setActiveMobileTab(tab);
      setMobileSheetOpen(true);
    }
  };

  // readonly 모드에서 같은 디자인 재로드만 방지하고, 탭 전환은 허용
  const loadedReadonlyKeyRef = useRef<string | null>(null);

  // 3D 씬 참조 (GLB 내보내기용)
  const sceneRef = useRef<any>(null);

  // 최초 썸네일 생성 여부 추적
  const hasGeneratedInitialThumbnailRef = useRef(false);

  // 3D 모델 내보내기 훅
  const { exportTo3D, canExport } = use3DExport();

  // 권한에 따라 읽기 전용 모드 설정
  // isReadOnly는 이제 useMemo로 계산되므로 이 useEffect 제거

  // 읽기 전용 모드에서 3D 정면 뷰로 초기화 (섬네일과 동일한 뷰)
  // 편집 모드에서는 치수/컬럼 항상 ON 보장
  useEffect(() => {
    const uiStore = useUIStore.getState();
    if (isReadOnly) {
      uiStore.setViewMode('3D');
      uiStore.setView2DDirection('front');
      uiStore.setCameraMode('perspective');
      uiStore.setShowDimensions(true);
      uiStore.setShowDimensionsText(true);
    } else {
      // 편집 모드 진입 시 치수 항상 켜기
      if (!uiStore.showDimensions) {
        uiStore.setShowDimensions(true);
      }
      if (!uiStore.showDimensionsText) {
        uiStore.setShowDimensionsText(true);
      }
    }
  }, [isReadOnly]);

  // 프로젝트 로드 후 자동 썸네일 생성 (최초 1회만)
  useEffect(() => {
    const generateInitialThumbnail = async () => {
      // 이미 생성했거나, 로딩 중이거나, projectId가 없으면 스킵
      if (hasGeneratedInitialThumbnailRef.current || loading || !currentProjectId || isReadOnlyMode) {
        return;
      }

      // 3D 뷰어 렌더링을 기다림 (2초 대기)
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        hasGeneratedInitialThumbnailRef.current = true;

        const thumbnail = await captureProjectThumbnail();
        if (thumbnail) {
          const { dataURLToBlob } = await import('@/editor/shared/utils/thumbnailCapture');
          const thumbnailBlob = dataURLToBlob(thumbnail);

          await updateProject(currentProjectId, {
            thumbnail: thumbnailBlob
          });
        }
      } catch (error) {
        console.error('📸 최초 썸네일 생성 실패:', error);
      }
    };

    generateInitialThumbnail();
  }, [loading, currentProjectId, isReadOnlyMode]);

  // 뷰어 컨트롤 상태들 - view2DDirection과 showDimensions는 UIStore 사용
  const [showAll, setShowAll] = useState(true);
  const [isConvertPanelOpen, setIsConvertPanelOpen] = useState(false); // 컨버팅 패널 상태

  // 슬롯배치 모드 진입 시 컬럼 가이드 자동 켜기
  const isFurniturePlacementMode = useFurnitureStore(state => state.isFurniturePlacementMode);
  useEffect(() => {
    if (isFurniturePlacementMode && viewMode === '3D') {
      setShowAll(true);
    }
  }, [isFurniturePlacementMode, viewMode]);

  // 커스텀 가구 설계→배치→세부설정→저장 동안 UI 자동 전환
  // 사이드바 접기 + orthographic 카메라 + 그림자 끄기 → 저장/닫기 시 복원
  const isLayoutBuilderOpen = useUIStore(s => s.isLayoutBuilderOpen);
  const layoutBuilderRevision = useUIStore(s => s.layoutBuilderRevision);
  const cameraMode = useUIStore(s => s.cameraMode);
  const setCameraMode = useUIStore(s => s.setCameraMode);
  const shadowEnabled = useUIStore(s => s.shadowEnabled);
  // stale closure 방지: 최신 값을 ref로 추적
  const latestSidebarTab = useRef(activeSidebarTab);
  latestSidebarTab.current = activeSidebarTab;
  const latestRightPanel = useRef(isRightPanelOpen);
  latestRightPanel.current = isRightPanelOpen;
  const latestCameraMode = useRef(cameraMode);
  latestCameraMode.current = cameraMode;
  const latestShadow = useRef(shadowEnabled);
  latestShadow.current = shadowEnabled;
  const stateBeforeDesign = useRef<{
    activeSidebarTab: SidebarTab | null;
    isRightPanelOpen: boolean;
    cameraMode: 'perspective' | 'orthographic';
    shadowEnabled: boolean;
  } | null>(null);
  // 설계모드가 아닐 때의 기본 UI 상태로 복원하는 헬퍼
  const restoreNonDesignUI = useCallback(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    const defaultTab: SidebarTab = mode === 'readonly' ? 'material' : 'module';
    if (latestSidebarTab.current === null) setActiveSidebarTab(defaultTab);
    if (!latestRightPanel.current) setIsRightPanelOpen(true);
    if (latestCameraMode.current === 'orthographic') setCameraMode('perspective');
    // 그림자는 복원 시 건드리지 않음 (기본값 false 유지)
  }, [setCameraMode, setShadowEnabled]);

  useEffect(() => {
    if (isLayoutBuilderOpen) {
      // 설계모드 진입: 최초 1회만 백업
      if (!stateBeforeDesign.current) {
        stateBeforeDesign.current = {
          activeSidebarTab: latestSidebarTab.current,
          isRightPanelOpen: latestRightPanel.current,
          cameraMode: latestCameraMode.current,
          shadowEnabled: latestShadow.current,
        };
      }
      // 설계모드 동안 항상 강제: 사이드바 접기, orthographic, 그림자 끄기 (우측패널은 유지 — 커스텀 편집 패널이 덮음)
      setActiveSidebarTab(null);
      setCameraMode('orthographic');
      setShadowEnabled(false);
    } else {
      if (stateBeforeDesign.current) {
        // 백업에서 복원
        setActiveSidebarTab(stateBeforeDesign.current.activeSidebarTab ?? 'module');
        setIsRightPanelOpen(stateBeforeDesign.current.isRightPanelOpen ?? true);
        setCameraMode(stateBeforeDesign.current.cameraMode ?? 'perspective');
        setShadowEnabled(stateBeforeDesign.current.shadowEnabled ?? false);
        stateBeforeDesign.current = null;
      } else {
        // 백업 유실 시 — 기본값으로 복원
        restoreNonDesignUI();
      }
    }
    // 컴포넌트 언마운트(페이지 이탈) 시에도 복원
    return () => {
      if (stateBeforeDesign.current) {
        setCameraMode(stateBeforeDesign.current.cameraMode);
        setShadowEnabled(stateBeforeDesign.current.shadowEnabled);
        stateBeforeDesign.current = null;
      }
    };
  }, [isLayoutBuilderOpen, layoutBuilderRevision, restoreNonDesignUI]);

  // 프레임 입력을 위한 로컬 상태 (문자열로 관리하여 입력 중 백스페이스 허용)
  const [frameInputLeft, setFrameInputLeft] = useState<string>(String(spaceInfo.frameSize?.left || 50));
  const [frameInputRight, setFrameInputRight] = useState<string>(String(spaceInfo.frameSize?.right || 50));
  const [frameInputTop, setFrameInputTop] = useState<string>(String(spaceInfo.frameSize?.top || 30));
  const isEditingFrameRef = useRef<{ left: boolean; right: boolean; top: boolean }>({ left: false, right: false, top: false });

  // 외부 spaceInfo.frameSize가 변경되면 로컬 상태 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!isEditingFrameRef.current.left) {
      setFrameInputLeft(String(spaceInfo.frameSize?.left || 50));
    }
    if (!isEditingFrameRef.current.right) {
      setFrameInputRight(String(spaceInfo.frameSize?.right || 50));
    }
    if (!isEditingFrameRef.current.top) {
      setFrameInputTop(String(spaceInfo.frameSize?.top || 30));
    }
  }, [spaceInfo.frameSize?.left, spaceInfo.frameSize?.right, spaceInfo.frameSize?.top]);

  const [showPDFPreview, setShowPDFPreview] = useState(false); // PDF 미리보기 상태
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false); // 내보내기 모달 상태
  const [isShareModalOpen, setIsShareModalOpen] = useState(false); // 공유 모달 상태
  const [capturedViews, setCapturedViews] = useState<{
    top?: string;
    front?: string;
    side?: string;
    door?: string;
  }>({});

  // 기존 공간 변경 로직 복구
  const [previousSpaceInfo, setPreviousSpaceInfo] = useState(() => {
    // 초기 spaceInfo에서도 installType 변환
    const initialSpaceInfo = { ...spaceInfo };
    if (initialSpaceInfo.installType === 'built-in') {
      initialSpaceInfo.installType = 'builtin';
    }
    return initialSpaceInfo;
  });
  // 프로젝트 로드 중에는 가구 재배치 방지
  const isLoadingProjectRef = useRef(false);
  const workingDesignSnapshotsRef = useRef<Map<string, WorkingDesignSnapshot>>(new Map());
  const activeDesignLoadKeyRef = useRef<string | null>(null);
  const tabNavigationTokenRef = useRef(0);

  const persistCurrentWorkingDesignSnapshot = useCallback(() => {
    if (isDemoMode || isReadOnly) return null;

    const urlProjectId = searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project');
    const urlDesignFileId = searchParams.get('designFileId');
    const projectId = currentProjectId || urlProjectId;
    const designFileId = currentDesignFileId || urlDesignFileId;
    const key = makeWorkingDesignKey(projectId, designFileId);

    if (!projectId || !designFileId || !key) return null;

    const projectState = useProjectStore.getState();
    const spaceState = useSpaceConfigStore.getState();
    const furnitureState = useFurnitureStore.getState();
    const snapshot: WorkingDesignSnapshot = {
      projectId,
      designFileId,
      designFileName: currentDesignFileName,
      folderName: currentFolderName,
      folderId: currentFolderId,
      basicInfo: cloneForWorkingSnapshot(projectState.basicInfo),
      spaceInfo: cloneForWorkingSnapshot(spaceState.spaceInfo),
      placedModules: cloneForWorkingSnapshot(furnitureState.placedModules),
      projectDirty: projectState.isDirty,
      spaceDirty: spaceState.isDirty,
      furnitureDirty: !!furnitureState.hasUnsavedChanges,
    };

    workingDesignSnapshotsRef.current.set(key, snapshot);
    return snapshot;
  }, [
    currentDesignFileId,
    currentDesignFileName,
    currentFolderId,
    currentFolderName,
    currentProjectId,
    isDemoMode,
    isReadOnly,
    searchParams,
  ]);

  const hydrateWorkingDesignSnapshot = useCallback((snapshot: WorkingDesignSnapshot) => {
    isLoadingProjectRef.current = true;
    setBasicInfo(cloneForWorkingSnapshot(snapshot.basicInfo));
    resetSpaceInfo();
    setSpaceInfo(cloneForWorkingSnapshot(snapshot.spaceInfo));
    setPreviousSpaceInfo(cloneForWorkingSnapshot(snapshot.spaceInfo));
    setPlacedModules(cloneForWorkingSnapshot(snapshot.placedModules));
    setCurrentProjectId(snapshot.projectId);
    setCurrentDesignFileId(snapshot.designFileId);
    setCurrentDesignFileName(snapshot.designFileName);
    setCurrentFolderName(snapshot.folderName);
    setCurrentFolderId(snapshot.folderId);
    useProjectStore.setState({ isDirty: snapshot.projectDirty });
    useSpaceConfigStore.setState({ isDirty: snapshot.spaceDirty });
    useFurnitureStore.setState({ hasUnsavedChanges: snapshot.furnitureDirty });
    requestAnimationFrame(() => {
      setPreviousSpaceInfo(useSpaceConfigStore.getState().spaceInfo);
      isLoadingProjectRef.current = false;
    });
  }, [resetSpaceInfo, setBasicInfo, setPlacedModules, setSpaceInfo]);

  const beginDesignLoad = useCallback((projectId?: string | null, designFileId?: string | null) => {
    const key = makeWorkingDesignKey(projectId, designFileId);
    activeDesignLoadKeyRef.current = key;
    return key;
  }, []);

  const isLatestDesignLoad = useCallback((loadKey: string | null) => {
    return activeDesignLoadKeyRef.current === loadKey;
  }, []);

  // History Store
  const { undo: historyUndo, redo: historyRedo } = useHistoryStore();

  // URL 파라미터에서 프로젝트명과 디자인파일명 읽기 (fallback용)
  const urlProjectName = useMemo(() => {
    const name = searchParams.get('projectName');
    return name ? decodeURIComponent(name) : null;
  }, [searchParams]);

  const urlDesignFileName = useMemo(() => {
    const name = searchParams.get('designFileName');
    return name ? decodeURIComponent(name) : null;
  }, [searchParams]);

  const historyDesignFileIdParam = searchParams.get('designFileId');
  const historyScopeId = useMemo(() => {
    const projectScope = currentProjectId || projectIdParam || (isDemoMode ? 'demo' : 'no-project');
    const designScope = currentDesignFileId || historyDesignFileIdParam;

    if (designScope) {
      return `${projectScope}:${designScope}`;
    }

    if (modeParam === 'new-design' || isNewDesign) {
      return `${projectScope}:${localHistoryScopeRef.current}`;
    }

    return `${projectScope}:project`;
  }, [
    currentProjectId,
    currentDesignFileId,
    historyDesignFileIdParam,
    isDemoMode,
    isNewDesign,
    modeParam,
    projectIdParam
  ]);

  // 히스토리 트래킹 활성화 - 현재 프로젝트/디자인 범위 안에서만 Undo/Redo
  useHistoryTracking(historyScopeId);

  // 키보드 단축키 이벤트 리스너
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const code = event.code;
      const isModKey = event.ctrlKey || event.metaKey;
      const isUndoShortcut = isModKey && !event.shiftKey && (key === 'z' || code === 'KeyZ');
      const isRedoShortcut = isModKey && (
        (!event.shiftKey && (key === 'y' || code === 'KeyY')) ||
        (event.shiftKey && (key === 'z' || code === 'KeyZ'))
      );

      // input 필드에 포커스가 있으면 키보드 단축키 무시
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      // Ctrl+Z / Cmd+Z로 Undo
      if (isUndoShortcut) {
        event.preventDefault();
        const previousState = historyUndo();
        if (previousState) {
          setSpaceInfo(previousState.spaceInfo);
          setPlacedModules(previousState.placedModules);
          setBasicInfo(previousState.basicInfo);
        }
        return;
      }

      // Ctrl+Y / Cmd+Y 또는 Ctrl+Shift+Z / Cmd+Shift+Z로 Redo
      if (isRedoShortcut) {
        event.preventDefault();
        const nextState = historyRedo();
        if (nextState) {
          setSpaceInfo(nextState.spaceInfo);
          setPlacedModules(nextState.placedModules);
          setBasicInfo(nextState.basicInfo);
        }
        return;
      }

      // D 키로 도어 열기/닫기 토글
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
// console.log('🚪 D 키로 도어 토글 시도');
        toggleDoors();
        return;
      }

      // Backspace 또는 Delete 키로 선택된 기둥/가구 삭제
      if (event.key === 'Backspace' || event.key === 'Delete') {
        // 가구가 선택되어 있으면 가구 삭제 우선 (기둥 옆 가구 삭제 시 기둥 함께 지워지는 문제 방지)
        const { selectedColumnId, selectedFurnitureId, setSelectedColumnId, setSelectedFurnitureId } = useUIStore.getState();
        if (selectedFurnitureId) {
          event.preventDefault();
          const { removeModule } = useFurnitureStore.getState();
          removeModule(selectedFurnitureId);
          setSelectedFurnitureId(null);
          return;
        }
        if (selectedColumnId) {
          event.preventDefault();
          const { spaceInfo, removeColumn } = useSpaceConfigStore.getState();
          const targetColumn = spaceInfo.columns?.find(col => col.id === selectedColumnId);
          if (targetColumn?.isLocked) return;
          removeColumn(selectedColumnId);
          setSelectedColumnId(null);
          return;
        }
      }

      // Ctrl+E 또는 Cmd+E로 선택된 기둥 편집 모달 열기
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault();
        if (selectedColumnId) {
// console.log('⌨️ 키보드 단축키로 기둥 편집 모달 열기:', selectedColumnId);
          openColumnEditModal(selectedColumnId);
        } else {
// console.log('⚠️ 선택된 기둥이 없습니다.');
        }
        return;
      }

      // E (모디파이어 없음): 2D 모드일 때 지우개 모드 토글
      if ((event.key === 'e' || event.key === 'E') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        const { viewMode, setMeasureMode, toggleEraserMode } = useUIStore.getState();
        if (viewMode === '2D') {
          event.preventDefault();
          setMeasureMode(false);
          toggleEraserMode();
          return;
        }
      }

      // 컬럼 편집 팝업이 열린 상태에서 좌우 화살표로 컬럼 이동
      if (activePopup.type === 'columnEdit' && activePopup.id) {
        const targetColumn = spaceInfo.columns?.find(col => col.id === activePopup.id);
        if (targetColumn && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();

          const currentX = targetColumn.position[0]; // Three.js 단위 (meters)
          const spaceWidthM = spaceInfo.width * 0.01; // mm to meters
          const columnWidthM = targetColumn.width * 0.01; // mm to meters

          // Shift 키가 눌려있으면 빠른 이동 (50mm), 그렇지 않으면 정밀 이동 (5mm)
          const moveStep = event.shiftKey ? 0.05 : 0.005; // Shift: 50mm, 일반: 5mm

          let newX = currentX;
          if (event.key === 'ArrowLeft') {
            newX = Math.max(-(spaceWidthM / 2) + (columnWidthM / 2), currentX - moveStep);
          } else if (event.key === 'ArrowRight') {
            newX = Math.min((spaceWidthM / 2) - (columnWidthM / 2), currentX + moveStep);
          }

          // 컬럼 위치 업데이트
          updateColumn(activePopup.id, { position: [newX, targetColumn.position[1], targetColumn.position[2]] });

// console.log('⌨️ 컬럼 키보드 이동:', {
            // columnId: activePopup.id,
            // direction: event.key,
            // moveStep: moveStep,
            // stepSize: event.shiftKey ? '50mm (빠름)' : '5mm (정밀)',
            // oldX: currentX,
            // newX
          // });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedColumnId, openColumnEditModal, activePopup, spaceInfo.columns, spaceInfo.width, updateColumn]);

  // 파일 시작 시 3D 정면뷰로 초기화 (컴포넌트 마운트 시 1회만)
  useEffect(() => {
    setViewMode('3D');
    setView2DDirection('front');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F5 단축키 제거 — F5는 브라우저 기본 새로고침으로 복귀
  // (카메라 전환/시점 순환은 ThreeCanvas의 스페이스바 더블탭으로 이전됨)

  // 미리보기 창과 BroadcastChannel 동기화
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('preview-sync');

    // 미리보기 창에서 상태 요청이 오면 응답
    channel.onmessage = (event) => {
      if (event.data?.type === 'REQUEST_STATE') {
        channel.postMessage({
          type: 'STATE_RESPONSE',
          payload: {
            spaceInfo,
            placedModules
          }
        });
      }
    };

    return () => channel.close();
  }, [spaceInfo, placedModules]);

  // spaceInfo 또는 placedModules 변경 시 미리보기 창에 업데이트 전송
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('preview-sync');
    channel.postMessage({
      type: 'STATE_UPDATE',
      payload: {
        spaceInfo,
        placedModules
      }
    });
    channel.close();
  }, [spaceInfo, placedModules]);

  // MaterialConfig 변경 모니터링
  useEffect(() => {
    if (spaceInfo.materialConfig) {
// console.log('🔍 Configurator - MaterialConfig 변경 감지:', {
        // interiorColor: spaceInfo.materialConfig.interiorColor,
        // doorColor: spaceInfo.materialConfig.doorColor,
        // interiorTexture: spaceInfo.materialConfig.interiorTexture,
        // doorTexture: spaceInfo.materialConfig.doorTexture,
        // isCabinetTexture1: {
          // interior: spaceInfo.materialConfig.interiorTexture?.includes('cabinet texture1'),
          // door: spaceInfo.materialConfig.doorTexture?.includes('cabinet texture1')
        // }
      // });
    }
  }, [spaceInfo.materialConfig]);


  // 현재 컬럼 수를 안전하게 가져오는 함수
  // FrameSize 업데이트 도우미 함수
  const updateFrameSize = (property: 'left' | 'right' | 'top', value: number) => {
    const currentFrameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    handleSpaceInfoUpdate({
      frameSize: {
        ...currentFrameSize,
        [property]: value
      }
    });

    // doorTopGap 동기화는 FurnitureItem의 useEffect에서 자동 처리
  };

  // 프레임 입력 핸들러 함수들
  const handleFrameInputChange = (dimension: 'left' | 'right' | 'top', value: string) => {
    // 숫자만 허용 (빈 문자열도 허용)
    if (value === '' || /^\d+$/.test(value)) {
      if (dimension === 'left') setFrameInputLeft(value);
      else if (dimension === 'right') setFrameInputRight(value);
      else setFrameInputTop(value);
    }
  };

  const handleFrameInputFocus = (dimension: 'left' | 'right' | 'top') => {
    isEditingFrameRef.current[dimension] = true;
    setHighlightedFrame(dimension);
  };

  const handleFrameInputBlur = (dimension: 'left' | 'right' | 'top', min: number, max: number, defaultValue: number) => {
    isEditingFrameRef.current[dimension] = false;
    setHighlightedFrame(null);

    const inputValue = dimension === 'left' ? frameInputLeft : dimension === 'right' ? frameInputRight : frameInputTop;
    let numValue = parseInt(inputValue, 10);

    // 유효하지 않은 숫자라면 기본값 사용
    if (isNaN(numValue)) {
      numValue = defaultValue;
    }

    // 범위 검증
    numValue = Math.min(max, Math.max(min, numValue));

    // 로컬 상태 업데이트
    if (dimension === 'left') setFrameInputLeft(String(numValue));
    else if (dimension === 'right') setFrameInputRight(String(numValue));
    else setFrameInputTop(String(numValue));

    // Store 업데이트
    updateFrameSize(dimension, numValue);
  };

  const handleFrameInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, dimension: 'left' | 'right' | 'top', min: number, max: number, defaultValue: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const inputValue = dimension === 'left' ? frameInputLeft : dimension === 'right' ? frameInputRight : frameInputTop;
      let currentValue = parseInt(inputValue, 10);
      if (isNaN(currentValue)) currentValue = defaultValue;

      const newValue = e.key === 'ArrowUp'
        ? Math.min(max, currentValue + 1)
        : Math.max(min, currentValue - 1);

      if (dimension === 'left') setFrameInputLeft(String(newValue));
      else if (dimension === 'right') setFrameInputRight(String(newValue));
      else setFrameInputTop(String(newValue));

      updateFrameSize(dimension, newValue);
    }
  };

  // 공간 넓이 기반 최소/최대 도어 개수 계산
  const calculateDoorRange = (spaceWidth: number) => {
    const FRAME_MARGIN = 100; // 양쪽 50mm씩
    const usableWidth = spaceWidth - FRAME_MARGIN;

    // 슬롯 크기 제약 조건 (400mm ~ 600mm) - 이 범위를 절대 벗어날 수 없음
    const MIN_SLOT_WIDTH = 400;
    const MAX_SLOT_WIDTH = 600;

    // 엄격한 제약 조건: 슬롯이 400mm 미만이 되거나 600mm 초과가 되는 것을 방지
    const minPossible = Math.max(1, Math.ceil(usableWidth / MAX_SLOT_WIDTH)); // 슬롯 최대 600mm 엄격히 제한
    const maxPossible = Math.min(20, Math.floor(usableWidth / MIN_SLOT_WIDTH)); // 슬롯 최소 400mm 엄격히 제한

    // 실제 슬롯 크기가 400-600mm 범위 내에 있는지 검증
    const finalMin = Math.max(minPossible, 1);
    const finalMax = Math.min(maxPossible, 20);

    // 불가능한 경우 (공간이 너무 작아서 400mm 슬롯도 만들 수 없음)
    if (finalMin > finalMax) {
      return {
        min: 1,
        max: 1,
        ideal: 1
      };
    }

    return {
      min: finalMin,
      max: finalMax,
      ideal: Math.max(finalMin, Math.min(finalMax, Math.round(usableWidth / 500)))
    };
  };

  const getCurrentColumnCount = () => {
    // DoorSlider와 동일한 SpaceCalculator 기반 범위 사용 (범위 불일치 방지)
    if (!spaceInfo.droppedCeiling?.enabled) {
      const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
      const limits = SpaceCalculator.getColumnCountLimits(internalWidth);

      let count = spaceInfo.customColumnCount || derivedSpaceStore.columnCount || limits.minColumns;
      count = Math.max(limits.minColumns, Math.min(limits.maxColumns, count));
      return count;
    }

    // 단내림 활성화 시: 기존 calculateDoorRange 사용 (DoorSlider도 동일 로직)
    let effectiveWidth = spaceInfo.width || 4800;
    effectiveWidth = effectiveWidth - (spaceInfo.droppedCeiling.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900));

    const range = calculateDoorRange(effectiveWidth);
    let count = range.min;

    if (spaceInfo.mainDoorCount) {
      count = spaceInfo.mainDoorCount;
    } else {
      count = spaceInfo.customColumnCount || derivedSpaceStore.columnCount || range.min;
    }

    count = Math.max(range.min, Math.min(range.max, count));
    return count;
  };



  // 특수 듀얼 가구 배치 여부 확인
  const hasSpecialDualFurniture = placedModules.some(module =>
    module.moduleId.includes('dual-2drawer-styler') ||
    module.moduleId.includes('dual-4drawer-pantshanger')
  );

// console.log('🔧 Configurator - hasSpecialDualFurniture:', hasSpecialDualFurniture);
// console.log('🔧 Configurator - placedModules:', placedModules);

  // 배치된 가구 중 도어가 있는 가구가 있는지 확인
  const hasDoorsInstalled = placedModules.some(module => module.hasDoor);

  // 프로젝트 데이터 로드
  const loadProject = async (projectId: string) => {
    const loadKey = beginDesignLoad(projectId, null);
    setLoading(true);

    try {
// console.log('🔄 프로젝트 로드 시작:', projectId);
      const { project, error } = await getProject(projectId);
// console.log('📦 프로젝트 로드 결과:', { project, error });

      if (!isLatestDesignLoad(loadKey)) {
        return;
      }

      if (error) {
        console.error('❌ 프로젝트 로드 에러:', error);
        // 읽기 전용 모드에서는 alert도 표시하지 않음
        const mode = searchParams.get('mode');
        if (mode !== 'readonly') {
          alert('프로젝트를 불러오는데 실패했습니다: ' + error);
          navigate('/');
        } else {
// console.log('👁️ 읽기 전용 모드 - 에러 무시');
        }
        return;
      }

      if (project) {
        // 프로젝트 데이터를 설정하되, title은 Firebase의 title을 우선 사용
        const projectTitle = project.title || project.projectData?.title || '새 프로젝트';
        setBasicInfo({
          title: projectTitle,
          location: project.projectData?.location || ''
        });
// console.log('🔍 loadProject에서 설정한 title:', projectTitle);
        // installType 하이픈 문제 수정
        const spaceConfig = { ...project.spaceConfig };
        if (spaceConfig.installType === 'built-in') {
          spaceConfig.installType = 'builtin';
        }

        // wallConfig가 없으면 installType에 맞게 기본값 설정
        if (!spaceConfig.wallConfig) {
          switch (spaceConfig.installType) {
            case 'builtin':
              spaceConfig.wallConfig = { left: true, right: true };
              break;
            case 'semistanding':
              spaceConfig.wallConfig = { left: true, right: false };
              break;
            case 'freestanding':
              spaceConfig.wallConfig = { left: false, right: false };
              break;
          }
        }

        // mainDoorCount와 customColumnCount를 undefined로 초기화하여 자동 계산 활성화
        spaceConfig.mainDoorCount = undefined;
        spaceConfig.droppedCeilingDoorCount = undefined;
        spaceConfig.customColumnCount = undefined;
        delete spaceConfig.lockedWallGaps; // 세션 전용
// console.log('🔄 Firebase 프로젝트 로드 시 컬럼 관련 값 초기화');

        // 이격: 저장된 프로젝트 값이 있으면 그대로 유지한다.
        // 기본값은 과거 데이터처럼 gapConfig가 비어 있는 경우에만 보정한다.
        if (spaceConfig.surroundType === 'no-surround') {
          try {
            const defaults = await getSpaceConfigDefaults();
            if (!isLatestDesignLoad(loadKey)) {
              return;
            }
            if (defaults) {
              const defLeft = defaults.gapLeft ?? 1.5;
              const defRight = defaults.gapRight ?? 1.5;
              const savedLeft = spaceConfig.gapConfig?.left;
              const savedRight = spaceConfig.gapConfig?.right;
              spaceConfig.gapConfig = {
                ...spaceConfig.gapConfig,
                left: spaceConfig.wallConfig?.left ? (savedLeft ?? defLeft) : (savedLeft ?? 0),
                right: spaceConfig.wallConfig?.right ? (savedRight ?? defRight) : (savedRight ?? 0),
              };
            }
          } catch { /* noop */ }
        }

        // 이전 프로젝트 상태 완전 초기화 후 새 데이터 로드
        // 로드 중 플래그 설정 — useEffect에서 가구 재배치 방지
        isLoadingProjectRef.current = true;
        const normalizedSpaceConfig = normalizeSpaceInfoFrameSize(spaceConfig);
        resetSpaceInfo();
        setSpaceInfo(normalizedSpaceConfig);
        setPreviousSpaceInfo(normalizedSpaceConfig);
        // 상부장 topFrameOffset 마이그레이션:
        // - 서라운드: 미설정/0 → 23
        // - 노서라운드: 23 등 잔재값이 남아있으면 → 0 (UI/렌더와 데이터 일치)
        const isSurroundLoaded = normalizedSpaceConfig.surroundType === 'surround';
        const migratedModules = (project.furniture?.placedModules || []).map((m: any) => {
          const isUpper = m.moduleId?.includes('upper-cabinet') || m.moduleId?.startsWith('upper-');
          if (!isUpper) return m;
          if (isSurroundLoaded && (m.topFrameOffset === undefined || m.topFrameOffset === 0)) {
            return { ...m, topFrameOffset: 23 };
          }
          if (!isSurroundLoaded && m.topFrameOffset !== undefined && m.topFrameOffset !== 0) {
            return { ...m, topFrameOffset: 0 };
          }
          return m;
        });
        if (!isLatestDesignLoad(loadKey)) {
          return;
        }
        setPlacedModules(migratedModules);
        setCurrentProjectId(projectId);

        if (isReadOnlyMode && shareScopeParam === 'project') {
          const { designFiles } = await getDesignFilesPublic(projectId);
          if (!isLatestDesignLoad(loadKey)) {
            return;
          }
          const visibleDesignFiles = designFiles.filter(file => !file.isDeleted);
          [...visibleDesignFiles].reverse().forEach(file => {
            useUIStore.getState().addTab({
              projectId,
              projectName: projectTitle,
              designFileId: file.id,
              designFileName: file.name,
            });
          });
          const firstDesign = visibleDesignFiles[0];
          if (firstDesign && !searchParams.get('designFileId')) {
            navigate(buildSharedViewerUrl(projectId, firstDesign.id, firstDesign.name, 'project'), { replace: true });
            return;
          }
        }

        // 다음 렌더 사이클 이후 플래그 해제
        requestAnimationFrame(() => {
          // spaceInfo가 완전히 안정화된 후 previousSpaceInfo를 다시 동기화
          setPreviousSpaceInfo(useSpaceConfigStore.getState().spaceInfo);
          isLoadingProjectRef.current = false;
        });

        // 프로젝트 소유자 정보 설정
        if (project.userId) {
// console.log('👤 프로젝트 소유자 정보:', {
            // projectUserId: project.userId,
            // currentUserId: user?.uid,
            // isOwner: user && project.userId === user.uid,
            // userName: project.userName,
            // userEmail: project.userEmail,
            // userPhotoURL: project.userPhotoURL,
            // currentUserPhotoURL: user?.photoURL
          // });

          // 프로젝트 소유자가 현재 로그인한 사용자인 경우, 현재 사용자 정보 사용
          if (user && project.userId === user.uid) {
// console.log('📸 현재 사용자 Auth 정보:', {
              // uid: user.uid,
              // displayName: user.displayName,
              // email: user.email,
              // photoURL: user.photoURL,
              // providerData: user.providerData
            // });

            const ownerData = {
              userId: user.uid,
              name: user.displayName || user.email || '소유자',
              photoURL: user.photoURL || undefined
            };
// console.log('👑 소유자 정보 설정 (현재 사용자):', ownerData);
            setProjectOwner(ownerData);
          } else {
            // 다른 사용자의 프로젝트인 경우 저장된 정보 사용
            const ownerData = {
              userId: project.userId,
              name: project.userName || project.userEmail || '소유자',
              photoURL: project.userPhotoURL
            };
// console.log('👑 소유자 정보 설정 (저장된 정보):', ownerData);
            setProjectOwner(ownerData);
          }
        }

        // 디자인파일명 설정은 별도 useEffect에서 처리됨

// console.log('✅ 프로젝트 로드 성공:', project.title);
// console.log('🪑 배치된 가구 개수:', project.furniture?.placedModules?.length || 0);
// console.log('🎨 로드된 materialConfig:', project.spaceConfig.materialConfig);

        // 프로젝트 로드 후 derivedSpaceStore 명시적 재계산
// console.log('🔄 [프로젝트 로드 후] derivedSpaceStore 강제 재계산');
        derivedSpaceStore.recalculateFromSpaceInfo(project.spaceConfig);

        // 프로젝트 로드 후 isDirty 초기화 (로드 시 설정된 dirty 플래그 리셋)
        useProjectStore.getState().markAsSaved();
        useSpaceConfigStore.getState().markAsSaved();
        useFurnitureStore.getState().markAsSaved();
      }
    } catch (error) {
      if (!isLatestDesignLoad(loadKey)) {
        return;
      }
      console.error('프로젝트 로드 실패:', error);
      // 읽기 전용 모드에서는 alert도 표시하지 않음
      const mode = searchParams.get('mode');
      if (mode !== 'readonly') {
        alert('프로젝트 로드 중 오류가 발생했습니다.');
        navigate('/');
      } else {
// console.log('👁️ 읽기 전용 모드 - 에러 무시');
      }
    } finally {
      if (isLatestDesignLoad(loadKey)) {
        setLoading(false);
      }
    }
  };

  // Firebase 설정 확인
  const isFirebaseConfigured = () => {
    return !!(
      import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID
    );
  };

  // lockedWallGaps는 세션 전용 — Firebase에 저장하지 않음
  const stripSessionOnlyFields = (si: any) => {
    if (!si || typeof si !== 'object') return si;
    const { lockedWallGaps, ...rest } = si;
    return rest;
  };

  // Firebase 호환을 위해 undefined 값 제거하는 헬퍼 함수
  const removeUndefinedValues = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (Array.isArray(obj)) {
      // 배열의 각 요소를 재귀적으로 처리하되, null이 아닌 요소만 유지
      return obj.map(removeUndefinedValues).filter(item => item !== null);
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          const cleanedValue = removeUndefinedValues(value);
          // null이 아닌 값만 포함
          if (cleanedValue !== null) {
            result[key] = cleanedValue;
          }
        }
      }
      return result;
    }

    return obj;
  };

  // 디자인 파일 저장 (프로젝트가 아닌 디자인 파일로 저장)
  const saveProject = async () => {
// console.log('💾 [DEBUG] saveProject 함수 시작');

    // 데모 모드: 저장 완전 차단
    if (isDemoMode) {
      console.log('🎭 데모 모드 - 저장 차단');
      return;
    }

    // 중복 저장 방지
    if (saveInProgressRef.current) {
// console.log('⚠️ 저장이 이미 진행 중 - 중복 호출 무시');
      return;
    }
    saveInProgressRef.current = true;

    // 읽기 전용 모드에서는 저장 불가
    if (isReadOnly) {
// console.log('🚫 읽기 전용 모드 - 저장 차단');
      // alert('읽기 전용 모드에서는 저장할 수 없습니다.');
      saveInProgressRef.current = false;
      return;
    }

    // URL 파라미터에서 직접 읽기 (상태가 아직 업데이트되지 않았을 수 있음)
    const urlProjectId = searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project');
    const urlDesignFileId = searchParams.get('designFileId');

    // currentProjectId가 없으면 URL에서 가져오기
    const effectiveProjectId = currentProjectId || urlProjectId;
    const effectiveDesignFileId = currentDesignFileId || urlDesignFileId;

// console.log('💾 [DEBUG] 현재 프로젝트 ID:', currentProjectId);
// console.log('💾 [DEBUG] URL 프로젝트 ID:', urlProjectId);
// console.log('💾 [DEBUG] 사용할 프로젝트 ID:', effectiveProjectId);
// console.log('💾 [DEBUG] 현재 디자인파일 ID:', currentDesignFileId);
// console.log('💾 [DEBUG] URL 디자인파일 ID:', urlDesignFileId);
// console.log('💾 [DEBUG] 사용할 디자인파일 ID:', effectiveDesignFileId);
// console.log('💾 [DEBUG] Firebase 설정:', isFirebaseConfigured());
// console.log('💾 [DEBUG] 사용자 상태:', !!user);
// console.log('💾 [DEBUG] 사용자 정보:', user ? { email: user.email, uid: user.uid } : 'null');

    // Firebase 연결 및 인증 상태 테스트
    try {
      const { db, auth } = await import('@/firebase/config');
// console.log('💾 [DEBUG] Firestore db 객체:', !!db);
// console.log('💾 [DEBUG] Auth 객체:', !!auth);

      // 현재 인증 상태 확인
      const currentAuthUser = auth.currentUser;
// console.log('💾 [DEBUG] auth.currentUser:', {
        // exists: !!currentAuthUser,
        // uid: currentAuthUser?.uid,
        // email: currentAuthUser?.email
      // });

      // 토큰 확인
      if (currentAuthUser) {
        try {
          const token = await currentAuthUser.getIdToken();
// console.log('💾 [DEBUG] 사용자 토큰 획득 성공');
        } catch (tokenError) {
          console.error('💾 [ERROR] 토큰 획득 실패:', tokenError);
        }
      }
    } catch (dbError) {
      console.error('💾 [ERROR] Firebase 연결 실패:', dbError);
    }

    if (!effectiveProjectId) {
      console.error('💾 [ERROR] 프로젝트 ID가 없습니다');
      alert('저장할 프로젝트가 없습니다. 새 프로젝트를 먼저 생성해주세요.');
      saveInProgressRef.current = false;
      return;
    }

    // 상태 동기화 (URL에서 읽은 값이 있으면 상태 업데이트)
    if (effectiveProjectId && !currentProjectId) {
      setCurrentProjectId(effectiveProjectId);
    }
    if (effectiveDesignFileId && !currentDesignFileId) {
      setCurrentDesignFileId(effectiveDesignFileId);
    }

    setSaving(true);
    setSaveStatus('idle');

    try {
// console.log('💾 [DEBUG] 저장할 basicInfo:', basicInfo);
// console.log('💾 [DEBUG] 저장할 spaceInfo 요약:', {
        // width: spaceInfo.width,
        // height: spaceInfo.height,
        // materialConfig: spaceInfo.materialConfig
      // });

      // furnitureStore의 현재 상태 직접 확인
      const currentFurnitureState = useFurnitureStore.getState().placedModules;
// console.log('💾 [DEBUG] furnitureStore 현재 상태:', {
        // storeCount: currentFurnitureState.length,
        // propCount: placedModules.length,
        // 같은가: currentFurnitureState === placedModules,
        // storeModules: currentFurnitureState.map(m => ({
          // id: m.id,
          // moduleId: m.moduleId,
          // isUpperCabinet: m.moduleId?.includes('upper-cabinet'),
          // isLowerCabinet: m.moduleId?.includes('lower-cabinet')
        // }))
      // });

// console.log('💾 [DEBUG] 저장할 placedModules 개수:', placedModules.length);
// console.log('💾 [DEBUG] 저장할 placedModules 상세:', placedModules.map(m => {
//         const moduleData = m.moduleId ? getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo) : null;
//         return {
//           id: m.id,
//           moduleId: m.moduleId,
//           category: moduleData?.category || 'unknown',
//           slotIndex: m.slotIndex,
//           position: m.position,
//           zone: m.zone,
//           hasDoor: m.hasDoor,
//           customDepth: m.customDepth,
//           customWidth: m.customWidth
//         };
//       }));

      // 썸네일 생성
      let thumbnail;
      try {
        thumbnail = await captureProjectThumbnail();
        if (!thumbnail) {
// console.log('💾 [DEBUG] 3D 캔버스 캡처 실패, 기본 썸네일 생성');
          thumbnail = generateDefaultThumbnail(spaceInfo, placedModules.length);
        }
// console.log('💾 [DEBUG] 썸네일 생성 완료');
      } catch (thumbnailError) {
        console.error('💾 [DEBUG] 썸네일 생성 실패:', thumbnailError);
        thumbnail = null;
      }

      const firebaseConfigured = isFirebaseConfigured();

      if (firebaseConfigured && user) {
// console.log('💾 [DEBUG] Firebase 저장 모드 진입');

        try {
          // 디자인 파일이 있으면 디자인 파일 업데이트, 없으면 새로 생성
          if (effectiveDesignFileId) {
// console.log('💾 [DEBUG] 기존 디자인 파일 업데이트');
            const { updateDesignFile } = await import('@/firebase/projects');

            const updatePayload = {
              name: currentDesignFileName || basicInfo.title,
              projectData: removeUndefinedValues(basicInfo),
              spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
              furniture: {
                placedModules: removeUndefinedValues(placedModules)
              },
              thumbnail: thumbnail
            };

// console.log('💾 [DEBUG] updateDesignFile 호출 전 데이터:', {
              // name: updatePayload.name,
              // spaceConfigKeys: Object.keys(updatePayload.spaceConfig || {}),
              // furnitureCount: updatePayload.furniture.placedModules.length,
              // hasThumbnail: !!updatePayload.thumbnail,
              // furnitureDetails: updatePayload.furniture.placedModules.map(m => {
                // const moduleData = m.moduleId ? getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo) : null;
                // return {
                  // id: m.id,
                  // moduleId: m.moduleId,
                  // category: moduleData?.category || 'unknown',
                  // slotIndex: m.slotIndex,
                  // zone: m.zone,
                  // hasDoor: m.hasDoor,
                  // isUpperCabinet: m.moduleId?.includes('upper-cabinet'),
                  // isLowerCabinet: m.moduleId?.includes('lower-cabinet')
                // };
              // })
            // });

// console.log('💾 [DEBUG] updateDesignFile 호출 직전, ID:', effectiveDesignFileId);

            if (!effectiveDesignFileId) {
              console.error('💾 [ERROR] 디자인 파일 ID가 없습니다!');
              console.error('💾 [ERROR] effectiveDesignFileId:', effectiveDesignFileId);
              setSaveStatus('error');
              alert('디자인 파일 ID가 없습니다. 새 디자인을 생성하거나 기존 디자인을 선택해주세요.');
              return;
            }

            const result = await updateDesignFile(effectiveDesignFileId, updatePayload);
// console.log('💾 [DEBUG] updateDesignFile 결과:', result);

            if (result.error) {
              console.error('💾 [ERROR] 디자인 파일 업데이트 실패:', result.error);
              console.error('💾 [ERROR] 전체 결과 객체:', result);
              setSaveStatus('error');
              alert('디자인 파일 저장에 실패했습니다: ' + result.error);
            } else {
              // 디자인 파일 저장 성공 후 프로젝트도 업데이트 (공유 링크와 미리보기 모달에서 가구가 보이도록)
// console.log('💾 프로젝트에도 가구 데이터 저장 시작');
              try {
                const projectUpdateResult = await updateProject(effectiveProjectId, {
                  furniture: {
                    placedModules: removeUndefinedValues(placedModules)
                  },
                  spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo))
                }, thumbnail);

                if (projectUpdateResult.error) {
                  console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateResult.error);
                } else {
// console.log('✅ 프로젝트에도 가구 데이터 저장 완료');
                }
              } catch (projectUpdateError) {
                console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateError);
              }

              setSaveStatus('success');
              useProjectStore.getState().markAsSaved();
              useSpaceConfigStore.getState().markAsSaved();
              useFurnitureStore.getState().markAsSaved();
// console.log('✅ 디자인 파일 저장 성공');

              // URL에 프로젝트명과 디자인파일명 유지 (새로고침 시에도 유지)
              const currentParams = new URLSearchParams(window.location.search);
              let urlNeedsUpdate = false;

              // 프로젝트명 업데이트
              if (basicInfo.title && currentParams.get('projectName') !== encodeURIComponent(basicInfo.title)) {
                currentParams.set('projectName', encodeURIComponent(basicInfo.title));
                urlNeedsUpdate = true;
              }

              // 디자인파일명 업데이트
              const designFileName = currentDesignFileName || basicInfo.title;
              if (designFileName && currentParams.get('designFileName') !== encodeURIComponent(designFileName)) {
                currentParams.set('designFileName', encodeURIComponent(designFileName));
                urlNeedsUpdate = true;
              }

              if (urlNeedsUpdate) {
                const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                window.history.replaceState({}, '', newUrl);
// console.log('🔗 저장 후 URL 업데이트:', newUrl);
              }

              // BroadcastChannel로 디자인 파일 업데이트 알림 (readonly 모드에서는 전송하지 않음)
// console.log('💾 [DEBUG] BroadcastChannel 전송 체크:', { isReadOnly, mode: searchParams.get('mode') });
              if (!isReadOnly) {
                try {
                  const channel = new BroadcastChannel('project-updates');
                  channel.postMessage({
                    type: 'DESIGN_FILE_UPDATED',
                    projectId: effectiveProjectId,
                    designFileId: effectiveDesignFileId,
                    timestamp: Date.now()
                  });
// console.log('📡 디자인 파일 업데이트 알림 전송');
                  channel.close();
                } catch (broadcastError) {
                  console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
                }
              } else {
// console.log('🚫 readonly 모드 - BroadcastChannel 전송 건너뜀');
              }
            }
          } else {
// console.log('💾 [DEBUG] 새 디자인 파일 생성');
            const { createDesignFile } = await import('@/firebase/projects');
            const { id: designFileId, error } = await createDesignFile({
              name: basicInfo.title || '새 디자인',
              projectId: effectiveProjectId,
              projectData: removeUndefinedValues(basicInfo),
              spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
              furniture: {
                placedModules: removeUndefinedValues(placedModules)
              },
              thumbnail: thumbnail
            });

            if (error) {
              console.error('💾 [ERROR] 디자인 파일 생성 실패:', error);
              setSaveStatus('error');
              alert('디자인 파일 생성에 실패했습니다: ' + error);
            } else if (designFileId) {
              // 디자인 파일 생성 성공 후 프로젝트도 업데이트 (공유 링크와 미리보기 모달에서 가구가 보이도록)
// console.log('💾 프로젝트에도 가구 데이터 저장 시작');
              try {
                const projectUpdateResult = await updateProject(effectiveProjectId, {
                  furniture: {
                    placedModules: removeUndefinedValues(placedModules)
                  },
                  spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo))
                }, thumbnail);

                if (projectUpdateResult.error) {
                  console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateResult.error);
                } else {
// console.log('✅ 프로젝트에도 가구 데이터 저장 완료');
                }
              } catch (projectUpdateError) {
                console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateError);
              }

              setCurrentDesignFileId(designFileId);
              setCurrentDesignFileName('새 디자인');
              setSaveStatus('success');
              useProjectStore.getState().markAsSaved();
              useSpaceConfigStore.getState().markAsSaved();
              useFurnitureStore.getState().markAsSaved();
// console.log('✅ 새 디자인 파일 생성 및 저장 성공');

              // 첫 저장 후 탭에 designFileId 반영
              if (effectiveProjectId) {
                useUIStore.getState().addTab({
                  projectId: effectiveProjectId,
                  projectName: basicInfo.title || '프로젝트',
                  designFileId,
                  designFileName: basicInfo.title || '새 디자인',
                });
              }

              // BroadcastChannel로 디자인 파일 생성 알림 (readonly 모드에서는 전송하지 않음)
              if (!isReadOnly) {
                try {
                  const channel = new BroadcastChannel('project-updates');
                  channel.postMessage({
                    type: 'DESIGN_FILE_UPDATED',
                    projectId: effectiveProjectId,
                    designFileId: designFileId,
                    timestamp: Date.now()
                  });
// console.log('📡 새 디자인 파일 생성 알림 전송');
                  channel.close();
                } catch (broadcastError) {
                  console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
                }
              }

              // URL 업데이트 (프로젝트명과 디자인파일명 포함)
              const params = new URLSearchParams();
              params.set('projectId', effectiveProjectId);
              params.set('designFileId', designFileId);
              if (basicInfo.title) {
                params.set('projectName', encodeURIComponent(basicInfo.title));
                params.set('designFileName', encodeURIComponent(basicInfo.title));
              }
              navigate(`/configurator?${params.toString()}`, { replace: true });
// console.log('🔗 새 디자인 파일 생성 후 URL 업데이트');
            }
          }

          // 다른 창(대시보드)에 프로젝트 업데이트 알림 (readonly 모드에서는 전송하지 않음)
          if (!isReadOnly) {
            try {
              const channel = new BroadcastChannel('project-updates');
              channel.postMessage({
                type: 'PROJECT_SAVED',
                projectId: effectiveProjectId,
                timestamp: Date.now()
              });
// console.log('💾 [DEBUG] BroadcastChannel 알림 전송 완료');
              channel.close();
            } catch (broadcastError) {
              console.warn('💾 [WARN] BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
            }
          }
        } catch (firebaseError) {
          console.error('💾 [ERROR] Firebase 저장 중 예외:', firebaseError);
          setSaveStatus('error');
          alert('디자인 파일 저장 중 오류가 발생했습니다: ' + firebaseError.message);
        }

        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
// console.log('💾 [DEBUG] Firebase 인증 필요');
        setSaveStatus('error');
        alert('저장하려면 로그인이 필요합니다.');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (outerError) {
      console.error('💾 [ERROR] saveProject 최상위 예외:', outerError);
      setSaveStatus('error');
      alert('프로젝트 저장 중 예상치 못한 오류가 발생했습니다: ' + outerError.message);
    } finally {
// console.log('💾 [DEBUG] saveProject 완료, 저장 상태 해제');
      setSaving(false);
      saveInProgressRef.current = false;
    }
  };

  const waitForSaveIdle = async () => {
    let retryCount = 0;
    while (saveInProgressRef.current && retryCount < 200) {
      await new Promise(resolve => setTimeout(resolve, 50));
      retryCount += 1;
    }
  };

  const saveWorkingDesignSnapshotInBackground = async (snapshot: WorkingDesignSnapshot) => {
    if (isDemoMode || isReadOnly || !snapshot.projectId || !snapshot.designFileId) return;
    if (!isFirebaseConfigured() || !user) return;

    await waitForSaveIdle();
    saveInProgressRef.current = true;

    try {
      const { updateDesignFile } = await import('@/firebase/projects');
      const updatePayload = {
        name: snapshot.designFileName || snapshot.basicInfo.title,
        projectData: removeUndefinedValues(snapshot.basicInfo),
        spaceConfig: removeUndefinedValues(stripSessionOnlyFields(snapshot.spaceInfo)),
        furniture: {
          placedModules: removeUndefinedValues(snapshot.placedModules)
        }
      };

      const result = await updateDesignFile(snapshot.designFileId, updatePayload);
      if (result.error) {
        console.warn('탭 전환 백그라운드 저장 실패:', result.error);
        return;
      }

      try {
        await updateProject(snapshot.projectId, {
          furniture: {
            placedModules: removeUndefinedValues(snapshot.placedModules)
          },
          spaceConfig: removeUndefinedValues(stripSessionOnlyFields(snapshot.spaceInfo))
        });
      } catch (projectUpdateError) {
        console.warn('탭 전환 백그라운드 프로젝트 업데이트 실패:', projectUpdateError);
      }

      const key = makeWorkingDesignKey(snapshot.projectId, snapshot.designFileId);
      if (key) {
        const latestSnapshot = workingDesignSnapshotsRef.current.get(key);
        if (latestSnapshot === snapshot) {
          workingDesignSnapshotsRef.current.set(key, {
            ...snapshot,
            projectDirty: false,
            spaceDirty: false,
            furnitureDirty: false,
          });
        }
      }
    } finally {
      saveInProgressRef.current = false;
    }
  };

  const saveCurrentDesignBeforeNavigation = async () => {
    persistCurrentWorkingDesignSnapshot();
    await waitForSaveIdle();
    await saveProject();
    await waitForSaveIdle();
    persistCurrentWorkingDesignSnapshot();
  };

  // 새 디자인 생성 함수 (현재 프로젝트 내에)
  // 새 디자인 모달 열기
  const handleNewDesign = async () => {
    // 현재 작업 자동 저장
    try { await saveProject(); } catch { /* ignore */ }

    // 프로젝트 목록 로드
    if (user) {
      try {
        const result = await getUserProjects(user.uid);
        if (result.projects) {
          setNewDesignProjects(result.projects.filter(p => !p.isDeleted));
        }
      } catch { /* ignore */ }
    }
    setNewDesignProjectId(currentProjectId);
    setNewDesignName('');
    setIsNewDesignModalOpen(true);
  };

  // 새 디자인 생성 실행
  const handleNewDesignSubmit = async () => {
    if (!newDesignName.trim() || !newDesignProjectId || isCreatingNewDesign) return;

    setIsCreatingNewDesign(true);
    try {
      // 기본 spaceConfig
      let defaultSpaceConfig: any = {
        width: DEFAULT_SPACE_VALUES.WIDTH,
        height: DEFAULT_SPACE_VALUES.HEIGHT,
        depth: DEFAULT_SPACE_VALUES.DEPTH,
        installType: 'builtin' as const,
        wallConfig: { left: true, right: true },
        hasFloorFinish: false,
        columns: [],
        walls: [],
        panelBs: []
      };

      // 유저 공간설정 기본값 로드 후 병합
      try {
        const defaults = await getSpaceConfigDefaults();
        if (defaults) {
          if (defaults.doorGapMode) {
            useUIStore.getState().setDoorGapDisplayMode(defaults.doorGapMode);
          }
          const defaultTopFrameSize = defaults.topMoldingEnabled === false
            ? 0
            : (defaults.topMoldingSize ?? defaults.frameTop ?? 30);
          defaultSpaceConfig = {
            ...defaultSpaceConfig,
            ...(defaults.width !== undefined && { width: defaults.width }),
            ...(defaults.height !== undefined && { height: defaults.height }),
            gapConfig: {
              left: defaults.gapLeft ?? 1.5,
              right: defaults.gapRight ?? 1.5,
            },
            frameSize: {
              top: defaultTopFrameSize,
              left: defaults.frameLeft ?? 18,
              right: defaults.frameRight ?? 18,
              ...((defaults.topMoldingOffset !== undefined || defaults.frameTopOffset !== undefined) && {
                topOffset: defaults.topMoldingOffset ?? defaults.frameTopOffset
              }),
              ...(defaults.topMoldingGap !== undefined && { topGap: defaults.topMoldingGap }),
            },
            baseConfig: {
              type: 'floor' as const,
              placementType: 'ground' as const,
              ...defaultSpaceConfig.baseConfig,
              height: defaults.baseboardSize ?? defaults.baseHeight ?? 60,
              ...((defaults.baseboardOffset !== undefined || defaults.baseFrameOffset !== undefined) && {
                offset: defaults.baseboardOffset ?? defaults.baseFrameOffset
              }),
              ...((defaults.baseboardGap !== undefined || defaults.baseFrameGap !== undefined) && {
                gap: defaults.baseboardGap ?? defaults.baseFrameGap
              }),
            },
            ...(defaults.placementType ? {
              layoutMode: defaults.placementType === 'free' ? 'free-placement' as const : 'equal-division' as const,
            } : {}),
            ...(defaults.furnitureSingleWidth !== undefined && { furnitureSingleWidth: defaults.furnitureSingleWidth }),
            ...(defaults.furnitureDualWidth !== undefined && { furnitureDualWidth: defaults.furnitureDualWidth }),
            ...(defaults.furnitureDepthDefaults !== undefined && { furnitureDepthDefaults: defaults.furnitureDepthDefaults }),
            ...(defaults.doorTopGap !== undefined && { doorTopGap: defaults.doorTopGap }),
            ...(defaults.doorBottomGap !== undefined && { doorBottomGap: defaults.doorBottomGap }),
            ...(defaults.surroundMode ? {
              surroundType: defaults.surroundMode === 'no-surround' ? 'no-surround' as const : 'surround' as const,
              frameConfig: defaults.surroundMode === 'full-surround'
                ? { left: true, right: true, top: true, bottom: true }
                : defaults.surroundMode === 'sides-only'
                  ? { left: true, right: true, top: false, bottom: false }
                  : { left: false, right: false, top: true, bottom: false },
            } : {}),
            ...(defaults.installType ? (() => {
              switch (defaults.installType) {
                case 'builtin':
                  return { installType: 'builtin' as const, wallConfig: { left: true, right: true } };
                case 'semistanding-left':
                  return { installType: 'semistanding' as const, wallConfig: { left: true, right: false } };
                case 'semistanding-right':
                  return { installType: 'semistanding' as const, wallConfig: { left: false, right: true } };
                case 'freestanding':
                  return { installType: 'freestanding' as const, wallConfig: { left: false, right: false } };
                default:
                  return {};
              }
            })() : {}),
            ...(defaults.droppedCeilingMode && defaults.droppedCeilingMode !== 'none' ? {
              droppedCeiling: {
                enabled: true,
                position: defaults.droppedCeilingMode,
                width: defaults.droppedCeilingWidth ?? 1300,
                dropHeight: defaults.droppedCeilingDropHeight ?? 200,
              },
            } : {}),
            ...(defaults.curtainBoxMode && defaults.curtainBoxMode !== 'none' ? {
              curtainBox: {
                enabled: true,
                position: defaults.curtainBoxMode,
                width: 100,
                dropHeight: 200,
              },
            } : {}),
            ...(defaults.hasFloorFinish !== undefined ? {
              hasFloorFinish: defaults.hasFloorFinish,
              ...(defaults.hasFloorFinish ? {
                floorFinish: { height: defaults.floorFinishHeight ?? 15 },
              } : { floorFinish: undefined }),
            } : {}),
          };
        }
      } catch (e) {
        console.error('유저 공간설정 기본값 로드 실패:', e);
      }
      defaultSpaceConfig = normalizeSpaceInfoFrameSize(defaultSpaceConfig);

      const createData: any = {
        name: newDesignName.trim(),
        projectId: newDesignProjectId,
        spaceConfig: defaultSpaceConfig,
        furniture: { placedModules: [] }
      };
      // 같은 프로젝트 내에서 생성 시 현재 폴더 유지
      if (currentFolderId && newDesignProjectId === currentProjectId) {
        createData.folderId = currentFolderId;
      }
      const result = await createDesignFile(createData);

      if (result.error) {
        alert('새 디자인 생성에 실패했습니다: ' + result.error);
        return;
      }

      if (result.id) {
        setIsNewDesignModalOpen(false);

        // 탭 추가
        const project = newDesignProjects.find(p => p.id === newDesignProjectId);
        useUIStore.getState().addTab({
          projectId: newDesignProjectId,
          projectName: project?.title || newDesignProjectId,
          designFileId: result.id,
          designFileName: newDesignName.trim(),
        });

        // 새 디자인으로 이동 — Configurator가 Firebase에서 새 spaceConfig를 로드하도록 강제 새로고침
        const targetUrl = `/configurator?projectId=${newDesignProjectId}&designFileId=${result.id}`;
        window.location.href = targetUrl;
      }
    } catch (error) {
      console.error('새 디자인 생성 중 오류:', error);
      alert('새 디자인 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingNewDesign(false);
    }
  };

  const handleStartGuideSetupInNewTab = async () => {
    if (isReadOnly || isCreatingNewDesign) return false;

    const effectiveProjectId = currentProjectId
      || searchParams.get('projectId')
      || searchParams.get('id')
      || searchParams.get('project');

    if (!effectiveProjectId) {
      alert('가이드 생성을 시작할 프로젝트를 찾을 수 없습니다.');
      return false;
    }

    setIsCreatingNewDesign(true);
    try {
      try {
        await saveProject();
      } catch (error) {
        console.warn('가이드 새 탭 생성 전 현재 디자인 저장 실패:', error);
      }

      const guideSpaceConfig = normalizeSpaceInfoFrameSize({
        ...stripSessionOnlyFields(spaceInfo),
        freePlacementGuides: [],
        freePlacementGuideEditing: false,
        customGuideMode: true
      });

      const guideDesignName = '가이드 배치';
      const createData: any = {
        name: guideDesignName,
        projectId: effectiveProjectId,
        spaceConfig: removeUndefinedValues(guideSpaceConfig),
        furniture: { placedModules: [] }
      };

      if (currentFolderId && effectiveProjectId === currentProjectId) {
        createData.folderId = currentFolderId;
      }

      const result = await createDesignFile(createData);
      if (result.error || !result.id) {
        alert('가이드 새 탭 생성에 실패했습니다: ' + (result.error || '디자인 파일 ID 없음'));
        return false;
      }

      const activeTab = useUIStore.getState().openTabs.find(tab => tab.id === useUIStore.getState().activeTabId);
      useUIStore.getState().addTab({
        projectId: effectiveProjectId,
        projectName: activeTab?.projectName || urlProjectName || basicInfo.title || effectiveProjectId,
        designFileId: result.id,
        designFileName: guideDesignName,
      });

      setPendingGuideSetupDesignFileId(result.id);
      navigate(`/configurator?projectId=${effectiveProjectId}&designFileId=${result.id}&guideSetup=1`, { replace: false });
      return true;
    } catch (error) {
      console.error('가이드 새 탭 생성 중 오류:', error);
      alert('가이드 새 탭 생성 중 오류가 발생했습니다.');
      return false;
    } finally {
      setIsCreatingNewDesign(false);
    }
  };

  const handleGuideSetupRequestHandled = () => {
    setPendingGuideSetupDesignFileId(null);

    const params = new URLSearchParams(searchParams);
    if (!params.has('guideSetup')) return;

    params.delete('guideSetup');
    const nextSearch = params.toString();
    navigate(`/configurator${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  };

  // 새 프로젝트 생성 함수
  const handleNewProject = async () => {
// console.log('🆕 [DEBUG] handleNewProject 함수 시작');

    try {
      const confirmed = confirm('현재 작업 내용이 사라집니다. 새 디자인을 시작하시겠습니까?');
// console.log('🆕 [DEBUG] 사용자 확인 응답:', confirmed);

      if (!confirmed) {
// console.log('🆕 [DEBUG] 사용자가 취소함');
        return;
      }

// console.log('🆕 [DEBUG] 새 프로젝트 생성 시작');
      setSaving(true);

      // 기본 공간 설정 (Firebase 호환을 위해 undefined 값 제거)
      const defaultSpaceConfig = {
        width: 3600,
        height: 2400,
        depth: 1500,
        installationType: 'builtin' as const,
        hasFloorFinish: false,
        surroundType: 'three-sided' as const,
        frameSize: { top: 50, bottom: 50, left: 50, right: 50 },
        baseConfig: { type: 'floor' as const, height: 60 },
        materialConfig: { interiorColor: '#FFFFFF', doorColor: '#FFFFFF' },
        columns: []
      };

// console.log('🆕 [DEBUG] 기본 설정 준비됨:', defaultSpaceConfig);

      // 썸네일 생성
      let thumbnail;
      try {
        thumbnail = generateDefaultThumbnail(defaultSpaceConfig, 0);
// console.log('🆕 [DEBUG] 썸네일 생성 성공');
      } catch (thumbnailError) {
        console.error('🆕 [DEBUG] 썸네일 생성 실패:', thumbnailError);
        thumbnail = null;
      }

      const firebaseConfigured = isFirebaseConfigured();
// console.log('🆕 [DEBUG] Firebase 설정 확인:', firebaseConfigured);
// console.log('🆕 [DEBUG] 사용자 로그인 상태:', !!user);
// console.log('🆕 [DEBUG] 사용자 정보:', user ? { email: user.email, uid: user.uid } : 'null');

      if (firebaseConfigured && user) {
// console.log('🆕 [DEBUG] Firebase 모드로 진행');

        try {
          const projectData = {
            title: 'Untitled',
            projectData: { title: 'Untitled', location: '' },
            spaceConfig: removeUndefinedValues(defaultSpaceConfig),
            furniture: {
              placedModules: []
            },
            ...(thumbnail && { thumbnail })
          };

// console.log('🆕 [DEBUG] createProject 호출 시작, 정리된 데이터:', projectData);
          const result = await createProject(projectData);
// console.log('🆕 [DEBUG] createProject 결과:', result);

          if (result.error) {
            console.error('🆕 [ERROR] Firebase 프로젝트 생성 실패:', result.error);
            alert('새 프로젝트 생성에 실패했습니다: ' + result.error);
            return;
          }

          if (result.id) {
// console.log('🆕 [DEBUG] Firebase 프로젝트 생성 성공:', result.id);

            // 상태 업데이트
            setBasicInfo({ title: 'Untitled', location: '' });
            resetSpaceInfo();
            setSpaceInfo(defaultSpaceConfig);
            setPlacedModules([]);
            setCurrentProjectId(result.id);

            // derivedSpaceStore 재계산
            derivedSpaceStore.recalculateFromSpaceInfo(defaultSpaceConfig);

            // URL 업데이트
            navigate(`/configurator?projectId=${result.id}`, { replace: true });

// console.log('✅ 새 Firebase 프로젝트 "Untitled" 생성 완료:', result.id);
            // alert('새 프로젝트가 생성되었습니다!');
          } else {
            console.error('🆕 [ERROR] projectId가 반환되지 않음');
            alert('프로젝트 ID를 받지 못했습니다. 다시 시도해주세요.');
          }
        } catch (firebaseError) {
          console.error('🆕 [ERROR] Firebase 작업 중 예외:', firebaseError);
          alert('Firebase 연결 중 오류가 발생했습니다: ' + firebaseError.message);
        }
      } else {
// console.log('🆕 [ERROR] Firebase 인증 필요');
        // alert('새 프로젝트를 생성하려면 로그인이 필요합니다.');
      }
    } catch (outerError) {
      console.error('🆕 [ERROR] handleNewProject 최상위 예외:', outerError);
      alert('새 프로젝트 생성 중 예상치 못한 오류가 발생했습니다: ' + outerError.message);
    } finally {
// console.log('🆕 [DEBUG] handleNewProject 완료, 저장 상태 해제');
      setSaving(false);
    }
  };

  // 다른이름으로 저장 함수 (디자인 파일로 저장)
  const handleSaveAs = async () => {
    if (isDemoMode) {
      console.log('🎭 데모 모드 - 다른 이름으로 저장 차단');
      return;
    }
    const newTitle = prompt('새 디자인 파일 이름을 입력하세요:', (currentDesignFileName || basicInfo.title) + ' 사본');
    if (newTitle && newTitle.trim()) {
      setSaving(true);
      setSaveStatus('idle');

      try {
        let thumbnail = await captureProjectThumbnail();

        if (!thumbnail) {
// console.log('📸 3D 캔버스 캡처 실패, 기본 썸네일 생성');
          thumbnail = generateDefaultThumbnail(spaceInfo, placedModules.length);
        }

        if (isFirebaseConfigured() && user) {
          // 현재 프로젝트가 없으면 먼저 프로젝트 생성
          let projectIdToUse = currentProjectId;

          if (!projectIdToUse) {
            // 프로젝트가 없으면 새 프로젝트 생성
            const { id: newProjectId, error: projectError } = await createProject({
              title: basicInfo.title || '새 프로젝트'
            });

            if (projectError || !newProjectId) {
              console.error('프로젝트 생성 실패:', projectError);
              setSaveStatus('error');
              alert('프로젝트 생성에 실패했습니다: ' + projectError);
              return;
            }

            projectIdToUse = newProjectId;
            setCurrentProjectId(newProjectId);
          }

          // 새 디자인이므로 사용자 공간설정 기본값 적용 (frameTop, baseHeight 등)
          const userDefaults = await getSpaceConfigDefaults();
          const baseSpaceInfo: any = stripSessionOnlyFields(spaceInfo);
          if (userDefaults) {
            if (typeof userDefaults.baseboardSize === 'number' || typeof userDefaults.baseHeight === 'number') {
              baseSpaceInfo.baseConfig = {
                ...(baseSpaceInfo.baseConfig || { type: 'floor', placementType: 'ground' }),
                height: userDefaults.baseboardSize ?? userDefaults.baseHeight,
              };
            }
            if (typeof userDefaults.baseboardOffset === 'number' || typeof userDefaults.baseFrameOffset === 'number') {
              baseSpaceInfo.baseConfig = {
                ...(baseSpaceInfo.baseConfig || { type: 'floor', placementType: 'ground' }),
                offset: userDefaults.baseboardOffset ?? userDefaults.baseFrameOffset,
              };
            }
            if (typeof userDefaults.baseboardGap === 'number' || typeof userDefaults.baseFrameGap === 'number') {
              baseSpaceInfo.baseConfig = {
                ...(baseSpaceInfo.baseConfig || { type: 'floor', placementType: 'ground' }),
                gap: userDefaults.baseboardGap ?? userDefaults.baseFrameGap,
              };
            }
            if (
              userDefaults.topMoldingEnabled === false ||
              typeof userDefaults.topMoldingSize === 'number' ||
              typeof userDefaults.frameTop === 'number'
            ) {
              baseSpaceInfo.frameSize = {
                ...(baseSpaceInfo.frameSize || { left: 50, right: 50, top: 30 }),
                top: userDefaults.topMoldingEnabled === false
                  ? 0
                  : (userDefaults.topMoldingSize ?? userDefaults.frameTop),
              };
            }
            if (typeof userDefaults.topMoldingOffset === 'number' || typeof userDefaults.frameTopOffset === 'number') {
              baseSpaceInfo.frameSize = {
                ...(baseSpaceInfo.frameSize || { left: 50, right: 50, top: 30 }),
                topOffset: userDefaults.topMoldingOffset ?? userDefaults.frameTopOffset,
              };
            }
            if (typeof userDefaults.topMoldingGap === 'number') {
              baseSpaceInfo.frameSize = {
                ...(baseSpaceInfo.frameSize || { left: 50, right: 50, top: 30 }),
                topGap: userDefaults.topMoldingGap,
              };
            }
            if (typeof userDefaults.doorTopGap === 'number') {
              baseSpaceInfo.doorTopGap = userDefaults.doorTopGap;
            }
            if (typeof userDefaults.doorBottomGap === 'number') {
              baseSpaceInfo.doorBottomGap = userDefaults.doorBottomGap;
            }
            if (userDefaults.furnitureDepthDefaults) {
              baseSpaceInfo.furnitureDepthDefaults = userDefaults.furnitureDepthDefaults;
            }
          }
          // Firebase에 새 디자인 파일로 저장
          const { createDesignFile } = await import('@/firebase/projects');
          const { id: designFileId, error } = await createDesignFile({
            name: newTitle.trim(),
            projectId: projectIdToUse,
            spaceConfig: removeUndefinedValues(baseSpaceInfo),
            furniture: {
              placedModules: removeUndefinedValues(placedModules)
            },
            thumbnail: thumbnail
          });

          if (error) {
            console.error('디자인 파일 복사 저장 실패:', error);
            setSaveStatus('error');
            alert('다른이름으로 저장에 실패했습니다: ' + error);
            return;
          }

          if (designFileId) {
            setCurrentDesignFileId(designFileId);
            setCurrentDesignFileName(newTitle.trim());
            setBasicInfo({ ...basicInfo, title: newTitle.trim() });
            setSaveStatus('success');
            useProjectStore.getState().markAsSaved();
            useSpaceConfigStore.getState().markAsSaved();
            useFurnitureStore.getState().markAsSaved();

            // URL 업데이트 + 강제 새로고침 (새 spaceConfig 적용)
            window.location.href = `/configurator?projectId=${projectIdToUse}&designFileId=${designFileId}`;
            return;

// console.log('✅ 디자인 파일 다른이름으로 저장 성공:', newTitle);
            // alert(`"${newTitle}" 디자인 파일로 저장되었습니다!`);
          }
        } else {
// console.log('💾 [ERROR] Firebase 인증 필요');
          setSaveStatus('error');
          alert('저장하려면 로그인이 필요합니다.');
        }

        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error('다른이름으로 저장 실패:', error);
        setSaveStatus('error');
        alert('다른이름으로 저장 중 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    }
  };

  // 프로젝트 이름 변경 함수
  const handleProjectNameChange = async (newName: string) => {
    const oldName = basicInfo.title;

    // 즉시 UI 업데이트
    setBasicInfo({ ...basicInfo, title: newName });

    // 탭의 프로젝트명도 업데이트
    if (currentProjectId && currentDesignFileId) {
      const tabId = `${currentProjectId}_${currentDesignFileId}`;
      useUIStore.getState().updateTab(tabId, { projectName: newName });
    }

    // 프로젝트가 저장된 상태라면 자동 저장
    if (currentProjectId) {
      setSaving(true);
      try {
        if (isFirebaseConfigured() && user) {
          const { error } = await updateProject(currentProjectId, {
            title: newName,
            projectData: removeUndefinedValues({ ...basicInfo, title: newName }),
            spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
            furniture: {
              placedModules: removeUndefinedValues(placedModules)
            }
          });

          if (error) {
            console.error('프로젝트 이름 변경 저장 실패:', error);
            // 실패 시 이전 이름으로 복원
            setBasicInfo({ ...basicInfo, title: oldName });
            alert('프로젝트 이름 변경에 실패했습니다: ' + error);
            return;
          }

// console.log('✅ 프로젝트 이름 변경 성공:', newName);
        } else {
// console.log('💾 [ERROR] Firebase 인증 필요');
          // 실패 시 이전 이름으로 복원
          setBasicInfo({ ...basicInfo, title: oldName });
          alert('프로젝트 이름을 변경하려면 로그인이 필요합니다.');
        }
      } catch (error) {
        console.error('프로젝트 이름 변경 실패:', error);
        // 실패 시 이전 이름으로 복원
        setBasicInfo({ ...basicInfo, title: oldName });
        alert('프로젝트 이름 변경 중 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    }
  };

  // 디자인 파일명 변경 핸들러
  const handleDesignFileNameChange = async (newName: string) => {
// console.log('📝 디자인파일명 변경 시작:', {
      // oldName: currentDesignFileName,
      // newName,
      // currentDesignFileId
    // });

    const oldName = currentDesignFileName;

    // 즉시 UI 업데이트
    setCurrentDesignFileName(newName);
// console.log('✅ currentDesignFileName 상태 업데이트:', newName);

    // 탭 이름도 업데이트
    if (currentProjectId && currentDesignFileId) {
      const tabId = `${currentProjectId}_${currentDesignFileId}`;
      useUIStore.getState().updateTab(tabId, { designFileName: newName });
    }

    // URL 파라미터도 업데이트
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('designFileName', encodeURIComponent(newName));
    const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
// console.log('🔗 디자인파일명 변경 후 URL 업데이트:', newUrl);

    // 디자인 파일이 저장된 상태라면 자동 저장
    if (currentDesignFileId) {
      setSaving(true);
      try {
        if (isFirebaseConfigured() && user) {
          const { updateDesignFile } = await import('@/firebase/projects');
          const { error } = await updateDesignFile(currentDesignFileId, {
            name: newName,
            projectData: removeUndefinedValues(basicInfo),
            spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
            furniture: {
              placedModules: removeUndefinedValues(placedModules)
            }
          });

          if (error) {
            console.error('디자인 파일명 변경 저장 실패:', error);
            // 실패 시 이전 이름으로 복원
            setCurrentDesignFileName(oldName);
            const prevParams = new URLSearchParams(window.location.search);
            prevParams.set('designFileName', encodeURIComponent(oldName));
            window.history.replaceState({}, '', `${window.location.pathname}?${prevParams.toString()}`);
            alert('디자인 파일명 변경에 실패했습니다: ' + error);
            return;
          }

// console.log('✅ 디자인 파일명 변경 성공:', newName);

          // BroadcastChannel로 대시보드에 알림 (readonly 모드에서는 전송하지 않음)
          if (!isReadOnly) {
            try {
              // URL에서 projectId 가져오기 (currentProjectId가 없을 수 있음)
              const urlProjectId = searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project');
              const effectiveProjectId = currentProjectId || urlProjectId;
              const effectiveDesignFileId = currentDesignFileId || searchParams.get('designFileId');

              const channel = new BroadcastChannel('project-updates');
              channel.postMessage({
                type: 'DESIGN_FILE_UPDATED',
                projectId: effectiveProjectId,
                designFileId: effectiveDesignFileId,
                timestamp: Date.now()
              });
// console.log('📡 디자인 파일명 변경 알림 전송:', {
                // projectId: effectiveProjectId,
                // designFileId: effectiveDesignFileId
              // });
              channel.close();
            } catch (broadcastError) {
              console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
            }
          }
        } else {
// console.log('💾 [ERROR] Firebase 인증 필요');
          // 실패 시 이전 이름으로 복원
          setCurrentDesignFileName(oldName);
          const prevParams = new URLSearchParams(window.location.search);
          prevParams.set('designFileName', encodeURIComponent(oldName));
          window.history.replaceState({}, '', `${window.location.pathname}?${prevParams.toString()}`);
          alert('디자인 파일명을 변경하려면 로그인이 필요합니다.');
        }
      } catch (error) {
        console.error('디자인 파일명 변경 실패:', error);
        // 실패 시 이전 이름으로 복원
        setCurrentDesignFileName(oldName);
        const prevParams = new URLSearchParams(window.location.search);
        prevParams.set('designFileName', encodeURIComponent(oldName));
        window.history.replaceState({}, '', `${window.location.pathname}?${prevParams.toString()}`);
        alert('디자인 파일명 변경 중 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    }
  };

  // URL에서 디자인파일명 읽기 (별도 useEffect로 분리)
  useEffect(() => {
    const designFileName = searchParams.get('designFileName') || searchParams.get('fileName');

// console.log('🔍 URL에서 가져온 designFileName:', designFileName);
// console.log('🔍 현재 currentDesignFileName:', currentDesignFileName);

    // URL에 designFileName이 있으면 설정
    if (designFileName) {
      const decodedFileName = decodeURIComponent(designFileName);
      setCurrentDesignFileName(decodedFileName);
// console.log('📝 URL 파라미터로 디자인파일명 설정:', decodedFileName);
    }
    // currentDesignFileName이 이미 있으면 유지 (덮어쓰지 않음)
    else if (!currentDesignFileName) {
      setCurrentDesignFileName('새 디자인');
// console.log('📝 기본값으로 디자인파일명 설정: 새 디자인');
    }
  }, [searchParams]);

  // 단내림 상태 변경 감지 및 컬럼 수 리셋
  useEffect(() => {
    // 이전 상태를 추적하기 위한 ref가 필요하지만, 여기서는 단순히 비활성화될 때 처리
    if (!spaceInfo.droppedCeiling?.enabled && spaceInfo.customColumnCount) {
      const internalSpace = calculateInternalSpace(spaceInfo);
      const defaultColumnCount = SpaceCalculator.getDefaultColumnCount(internalSpace.width);

// console.log('🔧 [Configurator] Dropped ceiling disabled, checking column count:', {
        // currentColumnCount: spaceInfo.customColumnCount,
        // defaultColumnCount,
        // internalWidth: internalSpace.width
      // });

      // 현재 컬럼 수가 기본값과 다르면 리셋
      if (spaceInfo.customColumnCount !== defaultColumnCount) {
// console.log('🔧 [Configurator] Resetting column count to default:', defaultColumnCount);
        setSpaceInfo({
          customColumnCount: defaultColumnCount,
          mainDoorCount: undefined,
          droppedCeilingDoorCount: undefined
        });
      }
    }
  }, [spaceInfo.droppedCeiling?.enabled]);

  // URL에서 프로젝트 ID 읽기 및 로드
  // searchParams에서 필요한 값들을 미리 추출 (의존성 배열에서 객체 비교 문제 방지)
  // projectIdParam은 이미 위에서 선언됨
  const designFileIdParam = searchParams.get('designFileId');
  const urlDesignFileNameParam = searchParams.get('designFileName') || searchParams.get('fileName');

  // 발주서 '보기' 버튼에서 넘어온 가구 포커스 — placedModules가 로드된 뒤 한 번만 실행
  const focusModuleIdParam = searchParams.get('focusModuleId');
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    if (!focusModuleIdParam) return;
    if (focusAppliedRef.current) return;
    if (placedModules.length === 0) return;
    const target = placedModules.find(m => m.id === focusModuleIdParam);
    if (target) {
      setSelectedFurnitureId(target.id);
      focusAppliedRef.current = true;
    }
  }, [focusModuleIdParam, placedModules, setSelectedFurnitureId]);
  // modeParam은 이미 위에서 선언됨
  const skipLoadParam = searchParams.get('skipLoad') === 'true';
  const isNewDesignParam = searchParams.get('design') === 'new';

  useEffect(() => {
    const projectId = projectIdParam;
    const designFileId = designFileIdParam;
    const urlDesignFileName = urlDesignFileNameParam;
    const mode = modeParam;
    const skipLoad = skipLoadParam;
    const isNewDesign = isNewDesignParam;

    const readonlyLoadKey = `${projectId || 'no-project'}:${designFileId || 'project'}`;

    // readonly 모드에서 같은 대상만 재실행 방지하고, 다른 탭 전환은 허용
    if (mode === 'readonly' && loadedReadonlyKeyRef.current === readonlyLoadKey) {
// console.log('✅ readonly 모드 - 이미 로드 완료, useEffect 재실행 건너뜀 (무한 루프 방지)');
      return;
    }

    // 읽기 전용 모드는 useMemo로 계산됨 (상태 업데이트 제거로 리로드 루프 방지)
    if (mode === 'readonly') {
// console.log('👁️ 읽기 전용 모드 활성화 (useMemo로 처리됨)');
    }

    const requestedLoadKey = projectId ? beginDesignLoad(projectId, designFileId) : null;

// console.log('🔍 useEffect 실행:', {
      // urlProjectId: projectId,
      // urlDesignFileId: designFileId,
      // urlDesignFileName,
      // mode,
      // isReadOnly: mode === 'readonly',
      // currentProjectId,
      // currentDesignFileId,
      // placedModulesCount: placedModules.length
    // });

    // URL에 designFileName이 있으면 즉시 설정 (최우선순위)
    if (urlDesignFileName) {
      const decodedFileName = decodeURIComponent(urlDesignFileName);
// console.log('🔗 URL에서 디자인파일명 바로 설정:', decodedFileName);
      setCurrentDesignFileName(decodedFileName);
    }

    // CNC에서 돌아오는 경우 - 이미 데이터가 로드되어 있으면 재로드하지 않음
    // 상태 업데이트 전에 먼저 체크해야 함!
    const isSameProject = projectId && projectId === currentProjectId;
    const isSameDesignFile = designFileId && designFileId === currentDesignFileId;
    const hasLoadedData = placedModules.length > 0 || spaceInfo.width > 0;

    if (isSameProject && isSameDesignFile && hasLoadedData && !skipLoad && mode !== 'new-design') {
// console.log('✅ 이미 로드된 프로젝트 - 재로드하지 않음 (CNC에서 복귀)');

      // ID만 동기화
      if (projectId !== currentProjectId) setCurrentProjectId(projectId);
      if (designFileId !== currentDesignFileId) setCurrentDesignFileId(designFileId);

      setLoading(false);
      return;
    }

    const cachedSnapshot = requestedLoadKey && designFileId && mode !== 'readonly' && !skipLoad && !isNewDesign
      ? workingDesignSnapshotsRef.current.get(requestedLoadKey)
      : null;
    if (cachedSnapshot) {
      hydrateWorkingDesignSnapshot(cachedSnapshot);
      setLoading(false);
      return;
    }

    // readonly 모드에서는 상태 업데이트를 하지 않음 (리로드 루프 방지)
    if (mode !== 'readonly') {
      // 프로젝트 ID가 변경된 경우에만 상태 업데이트
      if (projectId && projectId !== currentProjectId) {
        setCurrentProjectId(projectId);
// console.log('📝 프로젝트 ID 업데이트:', projectId);
      }

      // designFileId가 변경된 경우에만 상태 업데이트
      if (designFileId && designFileId !== currentDesignFileId) {
        setCurrentDesignFileId(designFileId);
// console.log('📝 디자인파일 ID 업데이트:', designFileId);
      }
    } else {
// console.log('👁️ readonly 모드 - ID 상태 업데이트 건너뜀 (리로드 루프 방지)');
    }

    if (projectId) {
      if (skipLoad || isNewDesign) {
        // Step 1-3에서 넘어온 경우 또는 새 디자인 생성 또는 CNC에서 복귀 - 이미 스토어에 데이터가 설정되어 있음
// console.log('✅ skipLoad=true 또는 design=new - 기존 스토어 데이터 유지');

        // skipLoad 파라미터를 URL에서 제거 (새로고침 시 정상 로드되도록)
        if (skipLoad) {
          const currentParams = new URLSearchParams(window.location.search);
          currentParams.delete('skipLoad');
          const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
          window.history.replaceState({}, '', newUrl);
        }

        // ID 동기화
        if (projectId) setCurrentProjectId(projectId);
        if (designFileId) setCurrentDesignFileId(designFileId);

        // 로딩 완료 처리
        setTimeout(() => {
          setLoading(false);
        }, 500); // 로딩 화면이 보이도록 약간의 지연
      } else if (mode === 'new-design') {
        // 기존 프로젝트에 새 디자인 생성하는 경우 - 프로젝트명만 가져오기
// console.log('🎨 기존 프로젝트에 새 디자인 생성:', projectId);

        // 프로젝트명만 가져와서 헤더에 표시하기 위해
        getProject(projectId).then(({ project, error }) => {
          if (project && !error) {
// console.log('🔍 setBasicInfo 호출 전 basicInfo:', basicInfo);
// console.log('🔍 설정할 프로젝트명:', project.title);

            setBasicInfo({ title: project.title });
// console.log('📝 프로젝트명 설정:', project.title);

            // 읽기 전용 모드에서는 URL 변경 금지
            if (mode !== 'readonly') {
              // URL에 프로젝트명이 없으면 추가 (새로고침 시 유지하기 위해)
              const currentParams = new URLSearchParams(window.location.search);
              if (!currentParams.get('projectName')) {
                currentParams.set('projectName', encodeURIComponent(project.title));
                const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                window.history.replaceState({}, '', newUrl);
// console.log('🔗 URL에 프로젝트명 추가:', newUrl);
              }
            } else {
// console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
            }
          }
          setLoading(false);
        });
      } else if (designFileId && !skipLoad) {
        // readonly 모드에서 이미 로드된 디자인이면 재로드하지 않음 (2중 렌더링 방지)
        const isAlreadyLoaded = designFileId === currentDesignFileId && (placedModules.length > 0 || spaceInfo.width > 0);
        if (isAlreadyLoaded && mode === 'readonly') {
// console.log('✅ readonly 모드 - 이미 로드된 디자인 재사용 (2중 렌더링 방지):', designFileId);
          setLoading(false);
          return;
        }

        // designFileId가 있는 경우 디자인 파일 데이터 로드
        const isReadOnlyMode = mode === 'readonly';
// console.log('📂 디자인파일 데이터 로드 시작:', {
//           designFileId,
//           projectId,
//           isReadOnlyMode,
//           currentDesignFileId,
//           currentProjectId
//         });

        import('@/firebase/projects').then(({ getDesignFileById, getDesignFileByIdPublic, getProjectById, getProjectByIdPublic }) => {
          const loadDesignFile = isReadOnlyMode ? getDesignFileByIdPublic : getDesignFileById;
          const loadProject = isReadOnlyMode ? getProjectByIdPublic : getProjectById;
          loadDesignFile(designFileId).then(async ({ designFile, error }) => {
            if (!isLatestDesignLoad(requestedLoadKey)) {
              return;
            }

            // readonly 모드에서는 데이터 로드 전에 ref 먼저 설정 (setState 리렌더링 차단)
            if (mode === 'readonly') {
              loadedReadonlyKeyRef.current = readonlyLoadKey;
// console.log('✅ readonly 모드 - ref 먼저 설정 (setState 리렌더링 차단)');
            }

            if (designFile && !error) {
// console.log('✅ 디자인파일 로드 성공:', {
                // id: designFile.id,
                // name: designFile.name,
                // projectId: designFile.projectId,
                // furnitureCount: designFile.furniture?.placedModules?.length || 0,
                // spaceConfig: !!designFile.spaceConfig
              // });

              // 프로젝트 기본 정보 설정 - projectId로 프로젝트 정보 가져오기
              if (designFile.projectId) {
                const { project, error: projectError } = await loadProject(designFile.projectId);
                if (!isLatestDesignLoad(requestedLoadKey)) {
                  return;
                }
                if (project && !projectError) {
                  setBasicInfo({ title: project.title });
// console.log('📝 프로젝트 데이터 설정:', project.title);

                  // 프로젝트 소유자 정보 설정
                  if (project.userId) {
// console.log('👤 [디자인파일] 프로젝트 소유자 정보:', {
                      // projectUserId: project.userId,
                      // currentUserId: user?.uid,
                      // isOwner: user && project.userId === user.uid,
                      // userName: project.userName,
                      // userEmail: project.userEmail,
                      // userPhotoURL: project.userPhotoURL,
                      // currentUserPhotoURL: user?.photoURL
                    // });

                    // 프로젝트 소유자가 현재 로그인한 사용자인 경우, 현재 사용자 정보 사용
                    if (user && project.userId === user.uid) {
                      const ownerData = {
                        userId: user.uid,
                        name: user.displayName || user.email || '소유자',
                        photoURL: user.photoURL || undefined
                      };
// console.log('👑 [디자인파일] 소유자 정보 설정 (현재 사용자):', ownerData);
                      setProjectOwner(ownerData);
                    } else {
                      // 다른 사용자의 프로젝트인 경우 저장된 정보 사용
                      const ownerData = {
                        userId: project.userId,
                        name: project.userName || project.userEmail || '소유자',
                        photoURL: project.userPhotoURL
                      };
// console.log('👑 [디자인파일] 소유자 정보 설정 (저장된 정보):', ownerData);
                      setProjectOwner(ownerData);
                    }
                  }

                  if (mode === 'readonly' && shareScopeParam === 'project') {
                    const { designFiles } = await getDesignFilesPublic(designFile.projectId);
                    if (!isLatestDesignLoad(requestedLoadKey)) {
                      return;
                    }
                    [...designFiles].reverse().forEach(file => {
                      useUIStore.getState().addTab({
                        projectId: designFile.projectId,
                        projectName: project.title || '프로젝트',
                        designFileId: file.id,
                        designFileName: file.name,
                      });
                    });
                    useUIStore.getState().setActiveTab(`${designFile.projectId}_${designFileId}`);
                  }

                  // 읽기 전용 모드에서는 URL 변경 금지
                  if (mode !== 'readonly') {
                    // URL에 프로젝트명이 없으면 추가 (새로고침 시 유지하기 위해)
                    const currentParams = new URLSearchParams(window.location.search);
                    if (!currentParams.get('projectName')) {
                      currentParams.set('projectName', encodeURIComponent(project.title));
                      const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                      window.history.replaceState({}, '', newUrl);
// console.log('🔗 URL에 프로젝트명 추가:', newUrl);
                    }
                  } else {
// console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
                  }
                }
              }

              // 공간 설정
              if (designFile.spaceConfig) {
                // 저장된 설정을 유지하되 baseConfig의 기본값만 보장
                const spaceConfig = {
                  ...designFile.spaceConfig,
                  // baseConfig.type 기본값 보장 — Firebase에 type 없이 저장된 경우 대비
                  baseConfig: {
                    type: 'floor' as const,
                    placementType: 'ground' as const,
                    ...designFile.spaceConfig.baseConfig
                  }
                };

                // 이전 디자인 파일 상태 완전 초기화 후 새 데이터 로드
                // 로드 중 플래그 설정 — useEffect에서 가구 재배치 방지
                isLoadingProjectRef.current = true;
                const normalizedSpaceConfig = normalizeSpaceInfoFrameSize(spaceConfig);
                resetSpaceInfo();
                setSpaceInfo(normalizedSpaceConfig);
                setPreviousSpaceInfo(normalizedSpaceConfig);
                // 다음 렌더 사이클 이후 플래그 해제
                requestAnimationFrame(() => {
                  setPreviousSpaceInfo(useSpaceConfigStore.getState().spaceInfo);
                  isLoadingProjectRef.current = false;
                });
// console.log('📐 공간 설정 데이터 설정 (컬럼 관련 값 초기화):', spaceConfig);
              }

              // 가구 배치 데이터 설정
              if (designFile.furniture?.placedModules && designFile.furniture.placedModules.length > 0) {
                // 상하부장 필터링 확인
                const upperCabinets = designFile.furniture.placedModules.filter(m =>
                  m.moduleId?.includes('upper-cabinet')
                );
                const lowerCabinets = designFile.furniture.placedModules.filter(m =>
                  m.moduleId?.includes('lower-cabinet')
                );

// console.log('🗄️ [Configurator] 불러온 상하부장 데이터:', {
                  // totalModules: designFile.furniture.placedModules.length,
                  // upperCabinets: upperCabinets.length,
                  // lowerCabinets: lowerCabinets.length,
                  // upperDetails: upperCabinets.map(m => ({
                    // id: m.id,
                    // moduleId: m.moduleId,
                    // slotIndex: m.slotIndex
                  // })),
                  // lowerDetails: lowerCabinets.map(m => ({
                    // id: m.id,
                    // moduleId: m.moduleId,
                    // slotIndex: m.slotIndex
                  // }))
                // });

                // baseModuleType이 없는 경우 추가
                const modulesWithBaseType = designFile.furniture.placedModules.map(m => ({
                  ...m,
                  baseModuleType: m.baseModuleType || m.moduleId.replace(/-[\d.]+$/, '')
                }));

                setPlacedModules(modulesWithBaseType);
// console.log('🪑 가구 배치 데이터 설정:', {
                  // count: modulesWithBaseType.length,
                  // modules: modulesWithBaseType.map(m => ({
                    // id: m.id,
                    // moduleId: m.moduleId,
                    // baseModuleType: m.baseModuleType,
                    // slotIndex: m.slotIndex,
                    // zone: m.zone,
                    // position: m.position
                  // }))
                // });
              } else {
                // 가구 데이터가 없는 경우 빈 배열로 초기화
                setPlacedModules([]);
// console.log('🪑 가구 배치 데이터 초기화 (빈 디자인)');
              }

              // 디자인파일 이름 설정
// console.log('🔍 디자인파일 이름 체크:', {
                // hasName: !!designFile.name,
                // name: designFile.name,
                // designFileKeys: Object.keys(designFile),
                // fullDesignFile: designFile
              // });

              if (designFile.name) {
                setCurrentDesignFileName(designFile.name);
// console.log('📝 디자인파일명 설정:', designFile.name);

                // 디자인 파일 로드 성공 → 탭 추가 (확정된 이름 사용)
                if (projectId && designFileId) {
                  useUIStore.getState().addTab({
                    projectId,
                    projectName: useProjectStore.getState().basicInfo.title || '프로젝트',
                    designFileId,
                    designFileName: designFile.name,
                  });
                }

                // 읽기 전용 모드에서는 URL 변경 금지 (무한 루프 방지)
                if (mode !== 'readonly') {
                  // URL에 디자인파일명이 없으면 추가 (새로고침 시 유지하기 위해)
                  const currentParams = new URLSearchParams(window.location.search);
                  if (!currentParams.get('designFileName')) {
                    currentParams.set('designFileName', encodeURIComponent(designFile.name));
                    const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                    window.history.replaceState({}, '', newUrl);
// console.log('🔗 URL에 디자인파일명 추가:', newUrl);
                  }
                } else {
// console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
                }
              } else {
                console.error('❌ 디자인파일에 name 필드가 없습니다!');
              }

              // 폴더명 설정 (폴더 데이터에서 이름 조회)
              if (designFile.projectId) {
                try {
                  const folderResult = await loadFolderDataFn(designFile.projectId);
                  if (!isLatestDesignLoad(requestedLoadKey)) {
                    return;
                  }
                  if (folderResult.folders && folderResult.folders.length > 0) {
                    let foundFolder = null;
                    // 1차: folderId로 직접 매칭
                    if (designFile.folderId) {
                      foundFolder = folderResult.folders.find(f => f.id === designFile.folderId);
                    }
                    // 2차: folderId가 없으면 children에서 designFileId로 검색
                    if (!foundFolder && designFileId) {
                      foundFolder = folderResult.folders.find(f =>
                        f.children?.some(c => c.id === designFileId)
                      );
                    }
                    setCurrentFolderName(foundFolder ? foundFolder.name : '');
                    setCurrentFolderId(designFile.folderId || (foundFolder ? foundFolder.id : null));
                  } else {
                    setCurrentFolderName('');
                    setCurrentFolderId(designFile.folderId || null);
                  }
                } catch (e) {
                  console.error('폴더명 조회 실패:', e);
                  setCurrentFolderName('');
                  setCurrentFolderId(designFile.folderId || null);
                }
              } else {
                setCurrentFolderName('');
                setCurrentFolderId(designFile.folderId || null);
              }
              // 공간 설정 미완료 감지 → 팝업 표시
              if ((designFile as any).isSpaceConfigured === false && mode !== 'readonly') {
// console.log('⚠️ 공간 설정 미완료 디자인 감지 → 공간 설정 팝업 표시');
                setShowSpaceConfigPopup(true);
              }
            } else {
              console.error('디자인파일 로드 실패:', error);
            }

            if (isLatestDesignLoad(requestedLoadKey)) {
              setLoading(false);
            }
          });
        });
      } else {
        // 기존 프로젝트 로드
        loadProject(projectId);
      }
    } else {
      // projectId가 없는 경우에도 로딩 해제
      setTimeout(() => {
        setLoading(false);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdParam, designFileIdParam, urlDesignFileNameParam, modeParam, shareScopeParam, skipLoadParam, isNewDesignParam]);

  // 협업자 정보 가져오기 (현재 디자인 파일 기준으로 필터링)
  useEffect(() => {
    // readonly 모드에서는 협업자 정보 조회 건너뛰기
    if (isReadOnly) {
// console.log('👁️ readonly 모드 - 협업자 정보 조회 건너뜀');
      return;
    }

    if (currentProjectId && currentDesignFileId) {
// console.log('🔍 협업자 정보 조회 시작:', { projectId: currentProjectId, designFileId: currentDesignFileId });
      getProjectCollaborators(currentProjectId)
        .then((collabs) => {
          // 현재 디자인 파일에 접근 권한이 있는 협업자만 필터링
          const filteredCollabs = collabs.filter(collab =>
            collab.designFileIds && collab.designFileIds.includes(currentDesignFileId)
          );
// console.log('✅ 협업자 정보 조회 성공:', {
            // 전체: collabs.length,
            // 현재파일: filteredCollabs.length,
            // 협업자: filteredCollabs
          // });
          setCollaborators(filteredCollabs);
        })
        .catch((error) => {
          console.error('❌ 협업자 정보 조회 실패:', error);
        });
    } else if (currentProjectId && !currentDesignFileId) {
      // 디자인 파일이 없는 경우 (Step0 등) 협업자 초기화
      setCollaborators([]);
    }
  }, [currentProjectId, currentDesignFileId, isReadOnly]);

  // 탭 동기화는 useEffect 대신 명시적 호출로만 처리
  // (디자인 파일 로드 성공, 파일트리 클릭, 첫 저장 시에만 addTab 호출)

  // 폴더명 자동 조회 (디자인파일이 폴더에 속한 경우)
  useEffect(() => {
    if (!currentProjectId || !currentDesignFileId || !user) return;
    // 이미 폴더명이 설정되어 있으면 스킵
    if (currentFolderName) return;

    const resolveFolderName = async () => {
      try {
        const folderResult = await loadFolderDataFn(currentProjectId);
        if (folderResult.folders && folderResult.folders.length > 0) {
          const foundFolder = folderResult.folders.find(f =>
            f.children?.some(c => c.id === currentDesignFileId)
          );
          if (foundFolder) {
            setCurrentFolderName(foundFolder.name);
          }
        }
      } catch (e) {
        // 폴더 조회 실패 시 무시
      }
    };
    resolveFolderName();
  }, [currentProjectId, currentDesignFileId, user]);

  // 폴더에서 실제 디자인파일명 찾기 (URL에 designFileId나 designFileName이 없을 때만)
  useEffect(() => {
    const loadActualDesignFileName = async () => {
      // URL 파라미터 확인
      const urlDesignFileName = searchParams.get('designFileName') || searchParams.get('fileName');
      const urlDesignFileId = searchParams.get('designFileId');

      // URL에 디자인파일 정보가 있으면 폴더 lookup 완전히 skip
      if (urlDesignFileName || urlDesignFileId) {
// console.log('⏭️ URL에 디자인파일 정보가 있어서 폴더 lookup skip:', {
//           urlDesignFileName,
//           urlDesignFileId
//         });
        return;
      }

      if (!currentProjectId || !user) return;

      // 이미 디자인파일명이 설정되어 있으면 폴더에서 찾지 않음
      if (currentDesignFileName && currentDesignFileName !== '새로운 디자인') {
// console.log('📝 디자인파일명이 이미 설정되어 있음:', currentDesignFileName);
        return;
      }

      try {
        // 폴더 데이터 로드
        const { loadFolderData } = await import('@/firebase/projects');
        const folderResult = await loadFolderData(currentProjectId);

        if (folderResult.folders && folderResult.folders.length > 0) {
          // 폴더에서 첫 번째 디자인파일 찾기
          for (const folder of folderResult.folders) {
            if (folder.children && folder.children.length > 0) {
              const firstDesignFile = folder.children[0];
              if (firstDesignFile && firstDesignFile.name) {
// console.log('📝 폴더에서 찾은 디자인파일명:', firstDesignFile.name);
                setCurrentDesignFileName(firstDesignFile.name);
                return;
              }
            }
          }
        }

        // 폴더에 디자인파일이 없으면 '새로운 디자인' 유지

      } catch (error) {
        console.error('폴더 데이터 로드 실패:', error);
      }
    };

    loadActualDesignFileName();
  }, [currentProjectId, user, searchParams, currentDesignFileName]);

  // 공간 변경 시 가구 재배치 로직 복구
  useEffect(() => {
    // 프로젝트 로드 중에는 가구 재배치 건너뛰기
    if (isLoadingProjectRef.current) {
      return;
    }
    // spaceInfo가 변경되었을 때만 실행
    if (JSON.stringify(previousSpaceInfo) !== JSON.stringify(spaceInfo)) {
      // materialConfig만 변경된 경우는 가구 재배치를 하지 않음
      const prevWithoutMaterial = { ...previousSpaceInfo };
      const currentWithoutMaterial = { ...spaceInfo };
      delete prevWithoutMaterial.materialConfig;
      delete currentWithoutMaterial.materialConfig;

      // 공간의 실제 구조가 변경된 경우에만 가구 업데이트
      // (너비, 높이, 깊이, 컬럼 수, 단내림 설정 등)
      const hasStructuralChange =
        prevWithoutMaterial.width !== currentWithoutMaterial.width ||
        prevWithoutMaterial.height !== currentWithoutMaterial.height ||
        prevWithoutMaterial.depth !== currentWithoutMaterial.depth ||
        prevWithoutMaterial.customColumnCount !== currentWithoutMaterial.customColumnCount ||
        JSON.stringify(prevWithoutMaterial.droppedCeiling) !== JSON.stringify(currentWithoutMaterial.droppedCeiling) ||
        prevWithoutMaterial.mainDoorCount !== currentWithoutMaterial.mainDoorCount ||
        prevWithoutMaterial.droppedCeilingDoorCount !== currentWithoutMaterial.droppedCeilingDoorCount ||
        JSON.stringify(prevWithoutMaterial.frameSize) !== JSON.stringify(currentWithoutMaterial.frameSize) ||
        JSON.stringify(prevWithoutMaterial.gapConfig) !== JSON.stringify(currentWithoutMaterial.gapConfig) ||
        JSON.stringify(prevWithoutMaterial.baseConfig) !== JSON.stringify(currentWithoutMaterial.baseConfig) ||
        prevWithoutMaterial.surroundType !== currentWithoutMaterial.surroundType ||
        prevWithoutMaterial.installType !== currentWithoutMaterial.installType ||
        JSON.stringify(prevWithoutMaterial.wallConfig) !== JSON.stringify(currentWithoutMaterial.wallConfig) ||
        prevWithoutMaterial.hasFloorFinish !== currentWithoutMaterial.hasFloorFinish ||
        JSON.stringify(prevWithoutMaterial.floorFinish) !== JSON.stringify(currentWithoutMaterial.floorFinish);

      if (hasStructuralChange) {
        console.log('🔄 공간 구조가 변경되었습니다. 가구 재배치 실행 중...', {
          width: prevWithoutMaterial.width !== currentWithoutMaterial.width ? `${prevWithoutMaterial.width} → ${currentWithoutMaterial.width}` : '같음',
          height: prevWithoutMaterial.height !== currentWithoutMaterial.height ? `${prevWithoutMaterial.height} → ${currentWithoutMaterial.height}` : '같음',
          depth: prevWithoutMaterial.depth !== currentWithoutMaterial.depth ? `${prevWithoutMaterial.depth} → ${currentWithoutMaterial.depth}` : '같음',
          customColumnCount: prevWithoutMaterial.customColumnCount !== currentWithoutMaterial.customColumnCount ? `${prevWithoutMaterial.customColumnCount} → ${currentWithoutMaterial.customColumnCount}` : '같음',
          droppedCeiling: JSON.stringify(prevWithoutMaterial.droppedCeiling) !== JSON.stringify(currentWithoutMaterial.droppedCeiling) ? 'CHANGED' : '같음',
          mainDoorCount: prevWithoutMaterial.mainDoorCount !== currentWithoutMaterial.mainDoorCount ? `${prevWithoutMaterial.mainDoorCount} → ${currentWithoutMaterial.mainDoorCount}` : '같음',
          droppedCeilingDoorCount: prevWithoutMaterial.droppedCeilingDoorCount !== currentWithoutMaterial.droppedCeilingDoorCount ? `${prevWithoutMaterial.droppedCeilingDoorCount} → ${currentWithoutMaterial.droppedCeilingDoorCount}` : '같음',
          frameSize: JSON.stringify(prevWithoutMaterial.frameSize) !== JSON.stringify(currentWithoutMaterial.frameSize) ? `${JSON.stringify(prevWithoutMaterial.frameSize)} → ${JSON.stringify(currentWithoutMaterial.frameSize)}` : '같음',
          gapConfig: JSON.stringify(prevWithoutMaterial.gapConfig) !== JSON.stringify(currentWithoutMaterial.gapConfig) ? 'CHANGED' : '같음',
          baseConfig: JSON.stringify(prevWithoutMaterial.baseConfig) !== JSON.stringify(currentWithoutMaterial.baseConfig) ? `${JSON.stringify(prevWithoutMaterial.baseConfig)} → ${JSON.stringify(currentWithoutMaterial.baseConfig)}` : '같음',
          surroundType: prevWithoutMaterial.surroundType !== currentWithoutMaterial.surroundType ? `${prevWithoutMaterial.surroundType} → ${currentWithoutMaterial.surroundType}` : '같음',
          installType: prevWithoutMaterial.installType !== currentWithoutMaterial.installType ? `${prevWithoutMaterial.installType} → ${currentWithoutMaterial.installType}` : '같음',
          wallConfig: JSON.stringify(prevWithoutMaterial.wallConfig) !== JSON.stringify(currentWithoutMaterial.wallConfig) ? 'CHANGED' : '같음',
          hasFloorFinish: prevWithoutMaterial.hasFloorFinish !== currentWithoutMaterial.hasFloorFinish ? `${prevWithoutMaterial.hasFloorFinish} → ${currentWithoutMaterial.hasFloorFinish}` : '같음',
          floorFinish: JSON.stringify(prevWithoutMaterial.floorFinish) !== JSON.stringify(currentWithoutMaterial.floorFinish) ? 'CHANGED' : '같음',
        });
        updateFurnitureForNewSpace(previousSpaceInfo, spaceInfo);
      }

      // 이전 상태 업데이트
      setPreviousSpaceInfo(spaceInfo);
    }
  }, [spaceInfo, previousSpaceInfo, updateFurnitureForNewSpace]);

  // derivedSpaceStore 재계산 (구조적 변경 시만 실행)
  useEffect(() => {
// console.log('🔄 derivedSpaceStore 재계산:', {
      // customColumnCount: spaceInfo.customColumnCount,
      // mainDoorCount: spaceInfo.mainDoorCount,
      // width: spaceInfo.width
    // });
    derivedSpaceStore.recalculateFromSpaceInfo(spaceInfo);
  }, [
    spaceInfo.width,
    spaceInfo.height,
    spaceInfo.depth,
    spaceInfo.customColumnCount,
    spaceInfo.mainDoorCount,
    spaceInfo.droppedCeilingDoorCount,
    spaceInfo.droppedCeiling?.enabled,
    spaceInfo.droppedCeiling?.width,
    spaceInfo.surroundType,
    spaceInfo.installType,
    spaceInfo.frameSize?.left,
    spaceInfo.frameSize?.right,
    spaceInfo.gapConfig?.left,
    spaceInfo.gapConfig?.right
  ]);

  // RightPanel에서 사용할 수 있도록 window 객체에 추가
  useEffect(() => {
    (window as any).handleSpaceInfoUpdate = handleSpaceInfoUpdate;

    return () => {
      delete (window as any).handleSpaceInfoUpdate;
    };
  }, []);



  // 사이드바 탭 클릭 핸들러
  const handleSidebarTabClick = (tab: SidebarTab) => {
    // 가이드 탭: 사이드바 패널을 열지 않고 전용 가이드 생성/확정 동작만 실행
    if (tab === 'guide') {
      window.dispatchEvent(new CustomEvent('free-placement-guide:toggle'));
      return;
    }
    // 아일랜드 탭: 사이드바를 열지 않고 곧바로 아일랜드 설계 팝업을 띄운다
    if (tab === 'island') {
      setIslandSetupMode('create');
      setIslandSetupOpen(true);
      return;
    }
    if (activeSidebarTab === tab) {
      setActiveSidebarTab(null); // 같은 탭 클릭 시 닫기
    } else {
      setActiveSidebarTab(tab);
    }
  };

  // 공간 설정 업데이트 핸들러
  const handleSpaceInfoUpdate = (updates: Partial<typeof spaceInfo>) => {
// console.log('🔧 handleSpaceInfoUpdate called with:', updates);
// console.log('🔧 Current spaceInfo.wallConfig:', spaceInfo.wallConfig);

    // 공간 치수 또는 컬럼 수 변경 시 배치된 가구 전체 초기화
    const isDimensionChange =
      (updates.width !== undefined && updates.width !== spaceInfo.width) ||
      (updates.height !== undefined && updates.height !== spaceInfo.height) ||
      (updates.depth !== undefined && updates.depth !== spaceInfo.depth);
    const isColumnCountChange =
      (updates.customColumnCount !== undefined && updates.customColumnCount !== spaceInfo.customColumnCount) ||
      (updates.mainDoorCount !== undefined && updates.mainDoorCount !== spaceInfo.mainDoorCount) ||
      (updates.droppedCeilingDoorCount !== undefined && updates.droppedCeilingDoorCount !== spaceInfo.droppedCeilingDoorCount);

    if ((isDimensionChange || isColumnCountChange) && placedModules.length > 0) {
      clearAllModules();
    }

    // baseConfig.depth 업데이트 감지
    if (updates.baseConfig?.depth !== undefined) {
// console.log('📏 Configurator - baseConfig.depth 업데이트:', {
        // 이전값: spaceInfo.baseConfig?.depth,
        // 새값: updates.baseConfig.depth,
        // 전체baseConfig: updates.baseConfig
      // });
    }

    // mainDoorCount 업데이트 감지
    if (updates.mainDoorCount !== undefined) {
// console.log('🚪 mainDoorCount 업데이트:', {
        // 이전값: spaceInfo.mainDoorCount,
        // 새값: updates.mainDoorCount,
        // 단내림활성화: spaceInfo.droppedCeiling?.enabled
      // });
    }

    // 단내림 설정 변경 감지
    const isDroppedCeilingUpdate = updates.droppedCeiling !== undefined;
    if (isDroppedCeilingUpdate) {
// console.log('🔄 단내림 설정 변경 감지:', updates.droppedCeiling);
    }

    // surroundType 업데이트 시 디버깅
    if (updates.surroundType) {
// console.log('🔧 Configurator - surroundType update:', {
        // previous: spaceInfo.surroundType,
        // new: updates.surroundType,
        // willUpdateStore: true
      // });
    }

    let finalUpdates = { ...updates };

    // installType 하이픈 문제 수정
    if (finalUpdates.installType === 'built-in') {
      finalUpdates.installType = 'builtin';
    }

    // 서라운드 타입 변경 시 프레임 설정 초기화 (실제로 surroundType이 변경된 경우에만)
    if (updates.surroundType && updates.surroundType !== spaceInfo.surroundType) {
      const currentInstallType = finalUpdates.installType || spaceInfo.installType;
      const currentWallConfig = finalUpdates.wallConfig || spaceInfo.wallConfig;
      const newFrameSize = { ...spaceInfo.frameSize, top: spaceInfo.frameSize?.top || 30 };

      if (updates.surroundType === 'surround') {
        // 서라운드 모드 — 벽없는 쪽에는 EP 자동 생성하지 않음 (0으로 설정)
        switch (currentInstallType) {
          case 'builtin':
            newFrameSize.left = 50;
            newFrameSize.right = 50;
            break;
          case 'semistanding':
            if (currentWallConfig.left && !currentWallConfig.right) {
              newFrameSize.left = 50;
              newFrameSize.right = 0;
            } else if (!currentWallConfig.left && currentWallConfig.right) {
              newFrameSize.left = 0;
              newFrameSize.right = 50;
            }
            break;
          case 'freestanding':
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
        }
      } else if (updates.surroundType === 'no-surround') {
        // 노서라운드 모드 — 벽없는 쪽에는 EP 자동 생성하지 않음
        switch (currentInstallType) {
          case 'builtin':
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
          case 'semistanding':
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
          case 'freestanding':
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
        }

        // 노서라운드일 때 gapConfig 설정 (middle 보존)
        finalUpdates.gapConfig = {
          left: currentWallConfig.left ? 1.5 : 0,
          right: currentWallConfig.right ? 1.5 : 0,
          middle: spaceInfo.gapConfig?.middle ?? 1.5,
        };
      }

      finalUpdates.frameSize = newFrameSize;
// console.log('🔧 서라운드 타입 변경에 따른 프레임 초기화:', {
        // surroundType: updates.surroundType,
        // installType: currentInstallType,
        // frameSize: newFrameSize,
        // gapConfig: finalUpdates.gapConfig
      // });
    }

    // 세미스탠딩에서 벽 위치 변경 시 프레임 설정 자동 업데이트
    if (updates.wallConfig && spaceInfo.installType === 'semistanding' && (spaceInfo.surroundType === 'surround')) {
      const newFrameSize = { ...spaceInfo.frameSize };

      if (updates.wallConfig.left && !updates.wallConfig.right) {
        // 좌측벽만 있음: 좌측 프레임 50mm, 우측 벽없음 0mm
        newFrameSize.left = 50;
        newFrameSize.right = 0;
      } else if (!updates.wallConfig.left && updates.wallConfig.right) {
        // 우측벽만 있음: 좌측 벽없음 0mm, 우측 프레임 50mm
        newFrameSize.left = 0;
        newFrameSize.right = 50;
      }

      finalUpdates.frameSize = newFrameSize;
// console.log('🔧 세미스탠딩 프레임 자동 업데이트:', newFrameSize);
    }

    // 설치 타입 변경 시 wallConfig와 프레임 설정 자동 업데이트
    if (updates.installType) {
      // wallConfig가 함께 전달되었으면 그대로 사용, 아니면 자동 설정
      if (updates.wallConfig) {
// console.log('🔧 InstallTypeControls에서 전달된 wallConfig 사용:', updates.wallConfig);
        finalUpdates.wallConfig = updates.wallConfig;
      } else {
        // wallConfig 자동 설정
        switch (updates.installType) {
          case 'builtin':
            finalUpdates.wallConfig = { left: true, right: true };
            break;
          case 'semistanding':
            // 세미스탠딩은 기본값 좌측벽만 (사용자가 변경 가능)
            finalUpdates.wallConfig = { left: true, right: false };
            break;
          case 'freestanding':
            finalUpdates.wallConfig = { left: false, right: false };
            break;
        }
// console.log('🔧 자동 설정된 wallConfig:', finalUpdates.wallConfig);
      }

      // 프레임 설정
      const newFrameSize = { ...spaceInfo.frameSize };
      const wallConfig = finalUpdates.wallConfig || spaceInfo.wallConfig;

      if (spaceInfo.surroundType === 'surround') {
        // 서라운드 모드
        switch (updates.installType) {
          case 'builtin':
            // 양쪽벽: 양쪽 모두 프레임 50mm
            newFrameSize.left = 50;
            newFrameSize.right = 50;
            break;
          case 'semistanding':
            // 한쪽벽: 벽 있는 쪽만 프레임, 벽없는 쪽은 0
            if (wallConfig.left && !wallConfig.right) {
              newFrameSize.left = 50;   // 좌측벽: 프레임
              newFrameSize.right = 0;   // 우측: 벽없음
            } else if (!wallConfig.left && wallConfig.right) {
              newFrameSize.left = 0;    // 좌측: 벽없음
              newFrameSize.right = 50;  // 우측벽: 프레임
            }
            break;
          case 'freestanding':
            // 벽없음: 양쪽 모두 0
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
        }
      } else if (spaceInfo.surroundType === 'no-surround') {
        // 노서라운드 모드
        switch (updates.installType) {
          case 'builtin':
            // 빌트인: 좌우 프레임 없음
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
          case 'semistanding':
            // 세미스탠딩: 벽 없는 쪽 0
            if (wallConfig.left && !wallConfig.right) {
              newFrameSize.left = 0;
              newFrameSize.right = 0;
            } else if (!wallConfig.left && wallConfig.right) {
              newFrameSize.left = 0;
              newFrameSize.right = 0;
            }
            break;
          case 'freestanding':
            // 프리스탠딩: 양쪽 0
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
        }

        // 노서라운드일 때 gapConfig도 업데이트 (middle 보존)
        finalUpdates.gapConfig = {
          left: wallConfig.left ? 1.5 : 0,
          right: wallConfig.right ? 1.5 : 0,
          middle: spaceInfo.gapConfig?.middle ?? 1.5,
        };
      }

      finalUpdates.frameSize = newFrameSize;

// console.log('🔧 설치타입 변경에 따른 wallConfig 및 프레임 자동 업데이트:', {
        // installType: updates.installType,
        // wallConfig: finalUpdates.wallConfig,
        // frameSize: finalUpdates.frameSize
      // });
    }

    // 폭(width)이 변경되었을 때 도어 개수 자동 조정 (SpaceCalculator 기반)
    if (updates.width && updates.width !== spaceInfo.width) {
      const tempSpaceInfo = { ...spaceInfo, ...finalUpdates, width: updates.width };
      const internalWidth = SpaceCalculator.calculateInternalWidth(tempSpaceInfo);
      const limits = SpaceCalculator.getColumnCountLimits(internalWidth);
      const currentCount = spaceInfo.customColumnCount || getCurrentColumnCount();

      const adjustedCount = Math.max(limits.minColumns, Math.min(limits.maxColumns, currentCount));
      finalUpdates = { ...finalUpdates, customColumnCount: adjustedCount };
    }

    // customColumnCount가 직접 변경되었을 때 - 사용자가 설정한 값 그대로 사용
    if (updates.customColumnCount !== undefined) {
      finalUpdates = { ...finalUpdates, customColumnCount: updates.customColumnCount };
      // mainDoorCount도 동기화 — 슬롯 수 변경 시 도어가 새 슬롯 수에 맞도록
      finalUpdates = { ...finalUpdates, mainDoorCount: updates.customColumnCount };
    }

    // 단내림이 활성화된 경우 메인 구간의 도어 개수 자동 조정
    if (updates.droppedCeiling?.enabled && !spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 새로 활성화된 경우
      const currentWidth = finalUpdates.width || spaceInfo.width || 4800;
      const droppedWidth = updates.droppedCeiling.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
      const mainZoneWidth = currentWidth - droppedWidth;
      const frameThickness = 50;
      const normalAreaInternalWidth = mainZoneWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);

      // 현재 도어 개수를 유지하되, 최소 필요 개수 이상으로 조정
      const currentDoorCount = getCurrentColumnCount();
      const adjustedMainDoorCount = Math.max(minRequiredSlots, currentDoorCount);
// console.log(`🔧 단내림 활성화 시 메인 구간 도어 개수 설정: ${currentDoorCount} → ${adjustedMainDoorCount}`);
      finalUpdates = { ...finalUpdates, mainDoorCount: adjustedMainDoorCount };

      // 단내림 구간 도어개수 기본값 설정
      const droppedFrameThickness = 50;
      const droppedInternalWidth = droppedWidth - droppedFrameThickness;
      const droppedMinSlots = Math.max(1, Math.ceil(droppedInternalWidth / MAX_SLOT_WIDTH));
      const droppedMaxSlots = Math.max(droppedMinSlots, Math.floor(droppedInternalWidth / 400));
      const droppedDefaultCount = droppedMinSlots;

// console.log(`🔧 단내림 활성화 시 단내림 구간 도어개수 기본값 설정: ${droppedDefaultCount}`, {
//         droppedWidth,
//         droppedInternalWidth,
//         droppedMinSlots,
//         droppedMaxSlots
//       });

      finalUpdates = { ...finalUpdates, droppedCeilingDoorCount: droppedDefaultCount };
    }

    // 단내림 폭 변경 시 단내림 도어개수 자동 조정
    if (updates.droppedCeiling?.width && spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50;
      const internalWidth = updates.droppedCeiling.width - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const MIN_SLOT_WIDTH = 400;
      const newDoorRange = {
        min: Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH)),
        max: Math.max(1, Math.floor(internalWidth / MIN_SLOT_WIDTH))
      };

      const currentDoorCount = spaceInfo.droppedCeilingDoorCount || 2;
      if (currentDoorCount < newDoorRange.min || currentDoorCount > newDoorRange.max) {
        const adjustedDoorCount = Math.max(newDoorRange.min, Math.min(newDoorRange.max, currentDoorCount));
// console.log(`🔧 단내림 폭 변경 시 도어개수 자동 조정: ${currentDoorCount} → ${adjustedDoorCount}`);
        finalUpdates = { ...finalUpdates, droppedCeilingDoorCount: adjustedDoorCount };
      }
    }

    // 노서라운드 빌트인 모드에서 컬럼 수 변경 시 자동 이격거리 계산
    // 최적화 로직이 비활성화(if false)되어 있어 optimizedGapConfig가 기존 gapConfig를 그대로 반환하므로
    // gapConfig를 덮어쓰면 middle/top 등 추가 필드가 유실됨 → 비활성화
    // if (spaceInfo.surroundType === 'no-surround' && ...) { ... }

// console.log('🔧 최종 업데이트 적용:', {
      // updates: finalUpdates,
      // hasWallConfig: !!finalUpdates.wallConfig,
      // wallConfig: finalUpdates.wallConfig,
      // customColumnCount: finalUpdates.customColumnCount,
      // gapConfig: finalUpdates.gapConfig
    // });

    // installType 변경 감지
    const isInstallTypeChanged = finalUpdates.installType !== undefined &&
      finalUpdates.installType !== spaceInfo.installType;

// console.log('🚨🚨🚨 setSpaceInfo 호출 직전:', finalUpdates);
// console.log('📏 baseConfig.depth 전달 확인:', {
      // finalUpdates_baseConfig: finalUpdates.baseConfig,
      // depth: finalUpdates.baseConfig?.depth
    // });
    // 도어 상하단갭은 상단몰딩 높이 변경과 무관 — 우측바의 상하갭 컨트롤로만 조정

    setSpaceInfo(finalUpdates);

    // 전체서라운드 전환 시 도어 상단갭을 키큰장/상부장에만 전파 (하부장은 자체 기본값 사용)
    if (finalUpdates.doorTopGap !== undefined) {
      const currentModules = useFurnitureStore.getState().placedModules;
      const modulesWithDoor = currentModules.filter(m => m.hasDoor);
      modulesWithDoor.forEach(m => {
        const isLower = m.moduleId?.includes('lower-');
        if (!isLower) {
          updatePlacedModule(m.id, { doorTopGap: finalUpdates.doorTopGap });
        }
      });
    }

    // Store 업데이트 직후 확인
    setTimeout(() => {
      const currentStore = useSpaceConfigStore.getState();
// console.log('📏 Store 업데이트 후 확인:', {
        // baseConfig: currentStore.baseConfig,
        // depth: currentStore.baseConfig?.depth
      // });
    }, 0);

    // 단내림 설정 변경 시 강제로 3D 뷰 업데이트
    if (isDroppedCeilingUpdate) {
// console.log('🔄 단내림 설정 변경으로 3D 뷰 강제 업데이트');
      // 강제로 뷰 모드를 다시 설정하여 리렌더링 트리거
      setTimeout(() => {
        setViewMode(viewMode);
      }, 0);
    }

    // installType 변경 시 가구 너비 재계산
    if (isInstallTypeChanged && placedModules.length > 0) {
// console.log('🔧 InstallType 변경 - 가구 너비 재계산');
      // 약간의 지연을 두어 SpaceInfo가 먼저 업데이트되도록 함
      setTimeout(() => {
        const newSpaceInfo = { ...spaceInfo, ...finalUpdates };
        updateFurnitureForNewSpace(spaceInfo, newSpaceInfo);
      }, 100);
    }
  };

  // 도어 설치/제거 핸들러
  const handleDoorInstallation = () => {
// console.log('🚪 도어 설치/제거 핸들러 호출:', {
//       hasDoorsInstalled,
//       placedModulesCount: placedModules.length,
//       doorsOpen
//     });

    if (hasDoorsInstalled) {
      // 도어 제거: 모든 가구에서 도어 제거 + 앞으로 배치될 가구도 도어 없이
      setAllDoors(false);
      useUIStore.getState().setDoorInstallIntent(false);
    } else {
      // 도어 설치: 모든 가구에 도어 설치 (닫힌 상태로 설치) + 앞으로 배치될 가구도 도어 포함
      setAllDoors(true);
      useUIStore.getState().setDoorInstallIntent(true);

      // 도어 설치 시 닫힌 상태로 유지
      if (doorsOpen !== null) {
        setDoorsOpen(null); // 개별 상태로 리셋
      }
    }
  };

  // 이전/다음 버튼 핸들러
  const handlePrevious = async () => {
    // 저장하지 않은 빈 디자인 파일인지 확인
    const { placedModules } = useFurnitureStore.getState();
    const hasContent = placedModules && placedModules.length > 0;

    // 가구가 없고, 디자인 파일 ID가 있으면 빈 디자인으로 간주
    if (!hasContent && currentDesignFileId && currentProjectId) {
// console.log('🗑️ 빈 디자인 파일 삭제:', currentDesignFileId);
      try {
        const { deleteDesignFile } = await import('@/firebase/projects');
        await deleteDesignFile(currentDesignFileId, currentProjectId);
// console.log('✅ 빈 디자인 파일 삭제 완료');
      } catch (error) {
        console.error('❌ 빈 디자인 파일 삭제 실패:', error);
      }
    }

    navigate('/dashboard?step=2');
  };

  const handleNext = () => {
    // Configurator가 최종 단계이므로 저장 후 대시보드로 이동
    if (window.confirm('현재 프로젝트를 저장하고 대시보드로 돌아가시겠습니까?')) {
      saveProject().then(() => {
        const params = new URLSearchParams();
        if (currentProjectId) {
          params.set('projectId', currentProjectId);
        }
        if (currentFolderId) {
          params.set('folderId', currentFolderId);
        }
        navigate(params.toString() ? `/dashboard?${params.toString()}` : '/dashboard');
      });
    }
  };

  const handleHelp = () => {
    window.open('/help', '_blank');
  };

  const handleConvert = () => {
// console.log('도면 편집기 열기');
    setShowPDFPreview(true);
  };

  const handleLogout = () => {
    // 읽기 전용 모드에서는 로그아웃 불가
    if (isReadOnly) {
// console.log('👁️ 읽기 전용 모드 - 로그아웃 차단');
      return;
    }
    navigate('/login');
  };

  const handleProfile = () => {
// console.log('프로필');
  };

  // FileTree 토글 핸들러
  const handleFileTreeToggle = async () => {
    const willOpen = !isFileTreeOpen;
    setIsFileTreeOpen(willOpen);
    // 파일트리 열릴 때 프로젝트 목록 로드
    if (willOpen && user) {
      if (fileTreeProjects.length === 0) {
        try {
          const result = await getUserProjects(user.uid);
          setFileTreeProjects(result.projects || []);
        } catch (err) {
          console.error('파일트리 프로젝트 로드 에러:', err);
        }
      }
      // 현재 프로젝트의 디자인 파일 자동 로드
      const currentPid = searchParams.get('projectId');
      if (currentPid && !fileTreeSelectedProjectId) {
        setFileTreeSelectedProjectId(currentPid);
        try {
          const { designFiles } = await getDesignFiles(currentPid);
          setFileTreeDesignFiles(designFiles);
        } catch {
          setFileTreeDesignFiles([]);
        }
      }
    }
  };

  // 탭 전환 핸들러 (현재 디자인 스냅샷 고정 → 즉시 전환 → 원래 파일로 백그라운드 저장)
  const handleTabSwitch = async (tab: EditorTab) => {
    const navigationToken = ++tabNavigationTokenRef.current;
    const snapshotToSave = !isReadOnly ? persistCurrentWorkingDesignSnapshot() : null;

    if (!isReadOnly && snapshotToSave) {
      saveWorkingDesignSnapshotInBackground(snapshotToSave).catch((e) => {
        console.warn('탭 전환 백그라운드 저장 실패:', e);
      });
    }

    useUIStore.getState().setActiveTab(tab.id);

    if (navigationToken !== tabNavigationTokenRef.current) {
      return;
    }

    if (!isReadOnly) {
      navigate(`/configurator?projectId=${tab.projectId}&designFileId=${tab.designFileId}`, { replace: true });
    } else {
      navigate(buildSharedViewerUrl(tab.projectId, tab.designFileId, tab.designFileName, shareScopeParam), { replace: true });
    }
  };

  // 탭 닫기 핸들러 (자동 저장 → 탭 제거 → 인접 탭 또는 대시보드)
  const handleTabClose = async (tab: EditorTab) => {
    if (isReadOnly) {
      return;
    }
    // 닫히는 탭이 활성 탭이면 저장
    if (useUIStore.getState().activeTabId === tab.id) {
      try {
        await saveCurrentDesignBeforeNavigation();
      } catch (e) {
        console.warn('탭 닫기 전 자동 저장 실패:', e);
      }
    }
    const nextTabId = useUIStore.getState().removeTab(tab.id);
    if (nextTabId) {
      const nextTab = useUIStore.getState().openTabs.find(t => t.id === nextTabId);
      if (nextTab) {
        navigate(`/configurator?projectId=${nextTab.projectId}&designFileId=${nextTab.designFileId}`, { replace: true });
      }
    } else {
      // 마지막 탭 → 대시보드로 이동
      const params = new URLSearchParams();
      if (currentProjectId) {
        params.set('projectId', currentProjectId);
      }
      if (currentFolderId) {
        params.set('folderId', currentFolderId);
      }
      navigate(params.toString() ? `/dashboard?${params.toString()}` : '/dashboard');
    }
  };

  // 3D 모델 내보내기 핸들러
  const handleExport3D = async (format: ExportFormat) => {
// console.log(`🔧 ${format.toUpperCase()} 내보내기 시작...`);

    if (!sceneRef.current) {
      alert('3D 씬이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      console.error('❌ scene ref가 없습니다');
      return;
    }

// console.log('✅ Scene ref 확인:', {
      // scene: sceneRef.current,
      // childrenCount: sceneRef.current?.children?.length,
      // children: sceneRef.current?.children
    // });

    if (!canExport(sceneRef.current)) {
      alert('내보낼 3D 모델이 없습니다.');
      console.error('❌ 내보낼 모델이 없습니다, children:', sceneRef.current.children);
      return;
    }

    // 파일명 생성
    const projectName = basicInfo.title || 'furniture-design';
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${projectName}-${timestamp}.${format}`;

// console.log(`📦 ${format.toUpperCase()} 파일 생성:`, filename);

    const result = await exportTo3D(sceneRef.current, format, filename);

    if (result.success) {
      alert(`${format.toUpperCase()} 파일이 다운로드되었습니다: ${filename}`);
// console.log(`✅ ${format.toUpperCase()} 내보내기 성공`);
    } else {
      alert(`${format.toUpperCase()} 내보내기 실패: ${result.error}`);
      console.error(`❌ ${format.toUpperCase()} 내보내기 실패:`, result.error);
    }
  };




  // 사이드바 컨텐츠 렌더링
  const renderSidebarContent = () => {
    if (!activeSidebarTab) return null;

    switch (activeSidebarTab) {
      case 'module':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.modulePanelContent}>
              {/* 의류장/신발장/주방 토글 탭 — 아일랜드 모드에서는 숨김 */}
              {!spaceInfo.isIsland && (
                <div className={styles.moduleCategoryTabs}>
                  <button
                    className={`${styles.moduleCategoryTab} ${moduleCategory === 'clothing' ? styles.active : ''}`}
                    onClick={() => setModuleCategory('clothing')}
                  >
                    의류장
                  </button>
                  <button
                    className={`${styles.moduleCategoryTab} ${moduleCategory === 'shoes' ? styles.active : ''}`}
                    onClick={() => setModuleCategory('shoes')}
                  >
                    신발장
                  </button>
                  <button
                    className={`${styles.moduleCategoryTab} ${moduleCategory === 'kitchen' ? styles.active : ''}`}
                    onClick={() => setModuleCategory('kitchen')}
                  >
                    주방
                  </button>
                </div>
              )}

              {/* 주방 선택 시 서브 탭: 아일랜드 모드에서는 상부장 제외 */}
              {(moduleCategory === 'kitchen' || spaceInfo.isIsland) && (
                <div className={styles.scrollableTabsWrapper}>
                  <div
                    ref={kitchenTabsRef}
                    className={`${styles.moduleCategoryTabs} ${styles.scrollableTabs}`}
                    onScroll={updateKitchenTabsScroll}
                  >
                    <button
                      className={`${styles.moduleCategoryTab} ${kitchenSub === 'basic' ? styles.active : ''}`}
                      onClick={() => setKitchenSub('basic')}
                    >
                      기본장
                    </button>
                    <button
                      className={`${styles.moduleCategoryTab} ${kitchenSub === 'door-raise' ? styles.active : ''}`}
                      onClick={() => setKitchenSub('door-raise')}
                    >
                      도어올림
                    </button>
                    <button
                      className={`${styles.moduleCategoryTab} ${kitchenSub === 'top-down' ? styles.active : ''}`}
                      onClick={() => setKitchenSub('top-down')}
                    >
                      상판내림
                    </button>
                    {!spaceInfo.isIsland && (
                      <button
                        className={`${styles.moduleCategoryTab} ${kitchenSub === 'upper' ? styles.active : ''}`}
                        onClick={() => setKitchenSub('upper')}
                      >
                        상부장
                      </button>
                    )}
                    {!spaceInfo.isIsland && (
                      <button
                        className={`${styles.moduleCategoryTab} ${kitchenSub === 'tall' ? styles.active : ''}`}
                        onClick={() => setKitchenSub('tall')}
                      >
                        키큰장
                      </button>
                    )}
                  </div>
                  {/* 좌측 페이드 + 화살표 */}
                  <div
                    className={`${styles.scrollFadeLeft} ${kitchenTabsScroll.canLeft ? '' : styles.scrollArrowHidden}`}
                  />
                  <button
                    type="button"
                    className={`${styles.scrollArrow} ${styles.scrollArrowLeft} ${kitchenTabsScroll.canLeft ? '' : styles.scrollArrowHidden}`}
                    onClick={() => scrollKitchenTabs('left')}
                    aria-label="이전 탭"
                  >
                    ‹
                  </button>
                  {/* 우측 페이드 + 화살표 */}
                  <div
                    className={`${styles.scrollFadeRight} ${kitchenTabsScroll.canRight ? '' : styles.scrollArrowHidden}`}
                  />
                  <button
                    type="button"
                    className={`${styles.scrollArrow} ${styles.scrollArrowRight} ${kitchenTabsScroll.canRight ? '' : styles.scrollArrowHidden}`}
                    onClick={() => scrollKitchenTabs('right')}
                    aria-label="다음 탭"
                  >
                    ›
                  </button>
                </div>
              )}

              {/* 전체/싱글/듀얼 탭 - 의류장/신발장에서만 표시 */}
              {moduleCategory !== 'kitchen' && (
                <div className={styles.moduleCategoryTabs}>
                  <button
                    className={`${styles.moduleCategoryTab} ${moduleType === 'all' ? styles.active : ''}`}
                    onClick={() => setModuleType('all')}
                  >
                    전체
                  </button>
                  <button
                    className={`${styles.moduleCategoryTab} ${moduleType === 'single' ? styles.active : ''}`}
                    onClick={() => setModuleType('single')}
                  >
                    싱글
                  </button>
                  <button
                    className={`${styles.moduleCategoryTab} ${moduleType === 'dual' ? styles.active : ''}`}
                    onClick={() => setModuleType('dual')}
                  >
                    듀얼
                  </button>
                </div>
              )}

              <div className={styles.moduleSection}>
                <ModuleGallery
                  moduleCategory={spaceInfo.isIsland ? 'kitchen' : moduleCategory}
                  kitchenSubCategory={spaceInfo.isIsland && kitchenSub === 'upper' ? 'basic' : kitchenSub}
                  selectedType={moduleType}
                  onSelectedTypeChange={setModuleType}
                  hideTabMenu
                />
              </div>

              {/* 커스텀 캐비닛 만들기는 My캐비넷 탭으로 이동 */}
            </div>
          </div>
        );

      case 'material':
        return (
          <div className={styles.sidebarPanel}>
            <MaterialPanel />
          </div>
        );
      case 'structure':
        return (
          <div className={styles.sidebarPanel}>
            <ColumnControl
              columns={spaceInfo.columns || []}
              onColumnsChange={(columns) => setSpaceInfo({ columns })}
              onOpenEditModal={openColumnEditModal}
            />
          </div>
        );
      case 'etc':
        return (
          <div className={styles.sidebarPanel}>
            <div style={{ padding: 24, color: 'var(--theme-text-tertiary)', textAlign: 'center' }}>
              준비중입니다
            </div>
          </div>
        );
      case 'upload':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.modulePanelContent}>
              {/* 전체장/상부장/하부장 토글 탭 */}
              <div className={styles.moduleCategoryTabs}>
                <button
                  className={`${styles.moduleCategoryTab} ${customCategory === 'full' ? styles.active : ''}`}
                  onClick={() => setCustomCategory('full')}
                >
                  전체장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${customCategory === 'upper' ? styles.active : ''}`}
                  onClick={() => setCustomCategory('upper')}
                >
                  상부장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${customCategory === 'lower' ? styles.active : ''}`}
                  onClick={() => setCustomCategory('lower')}
                >
                  하부장
                </button>
              </div>

              <div className={styles.moduleSection}>
                <CustomFurnitureLibrary
                  filter={customCategory}
                  showHeader={false}
                />
              </div>
            </div>

            {/* 업로드 모달 */}
            {showCustomUploadModal && (
              <div className={styles.customModalOverlay}>
                <CustomFurnitureUpload
                  onClose={() => setShowCustomUploadModal(false)}
                  onSuccess={() => setShowCustomUploadModal(false)}
                />
              </div>
            )}
          </div>
        );
      case 'myCabinet':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.modulePanelContent}>
              <div className={styles.moduleCategoryTabs}>
                <button
                  className={`${styles.moduleCategoryTab} ${myCabinetCategory === 'full' ? styles.active : ''}`}
                  onClick={() => setMyCabinetCategory('full')}
                >
                  전체장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${myCabinetCategory === 'upper' ? styles.active : ''}`}
                  onClick={() => setMyCabinetCategory('upper')}
                >
                  상부장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${myCabinetCategory === 'lower' ? styles.active : ''}`}
                  onClick={() => setMyCabinetCategory('lower')}
                >
                  하부장
                </button>
              </div>

              <div className={styles.moduleSection}>
                <MyCabinetGallery filter={myCabinetCategory} editMode={myCabinetEditMode} />
              </div>

              {/* 커스텀 캐비넷 만들기 버튼 */}
              {activePopup.type !== 'customizableEdit' && (
                <div style={{ flex: '0 0 auto', padding: '8px 12px', borderTop: '1px solid var(--theme-border)' }}>
                  <CustomizableFurnitureLibrary
                    filter={myCabinetCategory}
                  />
                </div>
              )}

              {/* 하단 고정 편집 모드 토글 */}
              <button
                onClick={() => setMyCabinetEditMode(!myCabinetEditMode)}
                style={{
                  flexShrink: 0,
                  margin: '8px 0 0',
                  padding: '10px 12px',
                  border: myCabinetEditMode ? '1px solid var(--theme-primary, #4a90d9)' : '1px solid var(--theme-border, #e0e0e0)',
                  borderRadius: '8px',
                  background: myCabinetEditMode ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-surface, #fff)',
                  color: myCabinetEditMode ? '#fff' : 'var(--theme-text-secondary, #666)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {myCabinetEditMode ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </>
                  )}
                </svg>
                {myCabinetEditMode ? '편집 완료' : '설정 · 삭제'}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // 섹션 헬프 버튼
  const HelpBtn: React.FC<{ title: string; text: string }> = ({ title, text }) => {
    const [open, setOpen] = useState(false);
    React.useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [open]);
    return (
      <>
        <button className={styles.helpBtn} onClick={(e) => { e.stopPropagation(); setOpen(true); }}><GoQuestion size={16} /></button>
        {open && createPortal(
          <div className={styles.helpModalOverlay} onMouseDown={() => setOpen(false)}>
            <div className={styles.helpModal} onMouseDown={(e) => e.stopPropagation()}>
              <div className={styles.helpModalHeader}>
                <div className={styles.helpModalTitle}>{title}</div>
                <button className={styles.helpModalClose} onClick={() => setOpen(false)} aria-label="닫기">×</button>
              </div>
              <div className={styles.helpModalText}>{text}</div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  };

  const renderDoorCategorySyncTable = () => {
    const fullDoorModules = fullDoorIndices
      .map(({ i }) => doorFurnitureList[i])
      .filter(Boolean);
    const groups = [
      { key: 'full', title: '키큰장 도어', modules: fullDoorModules },
      { key: 'upper', title: '상부장 도어', modules: normalUpperDoorSettingEntries.map(entry => entry.mod) },
      { key: 'lower', title: '하부장 도어', modules: normalLowerDoorSettingEntries.map(entry => entry.mod) },
    ].filter(group => group.modules.length > 0);

    if (groups.length === 0) return null;

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: '52px', padding: '2px 4px', fontSize: '10px', fontWeight: 500, color: 'var(--theme-text-secondary, #999)', textAlign: 'center', whiteSpace: 'nowrap' }}></th>
            {groups.map(group => (
              <th key={group.key} style={{ padding: '2px 2px', fontSize: '10px', fontWeight: 600, color: 'var(--theme-text-secondary, #666)', textAlign: 'center' }}>
                {group.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>상단갭</td>
            {groups.map(group => {
              const firstMod = group.modules[0];
              const groupIds = group.modules.map(mod => mod.id);
              const { topDistance } = computeRefDistances(firstMod);
              return <DoorGapInput key={`top-sync-${group.key}-${doorGapRefMode}`} moduleId={firstMod.id} field="doorTopGap"
                storeValue={firstMod.doorTopGap ?? 5}
                onCommit={handleIndividualDoorGapChange}
                highlightModuleIds={groupIds}
                referenceMode={doorGapRefMode}
                refDistanceMm={topDistance} />;
            })}
          </tr>
          <tr>
            <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>하단갭</td>
            {groups.map(group => {
              const firstMod = group.modules[0];
              const groupIds = group.modules.map(mod => mod.id);
              const { bottomDistance } = computeRefDistances(firstMod);
              return <DoorGapInput key={`bot-sync-${group.key}-${doorGapRefMode}`} moduleId={firstMod.id} field="doorBottomGap"
                storeValue={firstMod.doorBottomGap ?? 25}
                onCommit={handleIndividualDoorGapChange}
                highlightModuleIds={groupIds}
                referenceMode={doorGapRefMode}
                refDistanceMm={bottomDistance} />;
            })}
          </tr>
        </tbody>
      </table>
    );
  };

  const renderDoorGapEntriesTable = (title: string, entries: typeof partialDoorSettingEntries, marginTop: string) => {
    if (entries.length === 0) return null;

    return (
      <div style={{ marginTop, overflowX: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--theme-text-secondary, #666)', marginBottom: '4px' }}>{title}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: '52px', padding: '2px 4px', fontSize: '10px', fontWeight: 500, color: 'var(--theme-text-secondary, #999)', textAlign: 'center', whiteSpace: 'nowrap' }}></th>
              {entries.map((entry) => (
                <th key={entry.key} style={{ padding: '2px 2px', fontSize: '10px', fontWeight: 600, color: 'var(--theme-text-secondary, #666)', textAlign: 'center' }}>
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>상단갭</td>
              {entries.map((entry) => {
                const { topDistance } = computeSplitDoorRefDistances(entry.mod, entry.splitPart);
                const referenceMode = entry.splitPart === 'upper'
                  ? doorGapRefMode
                  : (entry.splitPart ? 'body' : doorGapRefMode);
                return <DoorGapInput key={`top-${entry.key}-${doorGapRefMode}`} moduleId={entry.mod.id} field={entry.topField}
                  storeValue={entry.topValue}
                  onCommit={handleIndividualDoorGapChange}
                  referenceMode={referenceMode}
                  refDistanceMm={topDistance} />;
              })}
            </tr>
            <tr>
              <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>하단갭</td>
              {entries.map((entry) => {
                const { bottomDistance } = computeSplitDoorRefDistances(entry.mod, entry.splitPart);
                const referenceMode = entry.splitPart === 'lower'
                  ? doorGapRefMode
                  : (entry.splitPart ? 'body' : doorGapRefMode);
                return <DoorGapInput key={`bot-${entry.key}-${doorGapRefMode}`} moduleId={entry.mod.id} field={entry.bottomField}
                  storeValue={entry.bottomValue}
                  onCommit={handleIndividualDoorGapChange}
                  referenceMode={referenceMode}
                  refDistanceMm={bottomDistance} />;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // 우측 패널 컨텐츠 렌더링
  const renderRightPanelContent = () => {
    const isFreeMode = (spaceInfo.layoutMode || 'equal-division') === 'free-placement';
    return (
      <div className={`${styles.spaceControls} ${isFreeMode ? styles.spaceControlsRelaxed : ''}`}>
        {/* 공간 설정 / 아일랜드: 가구 사이즈 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>{spaceInfo.isIsland ? '가구 사이즈' : '공간 설정'}</h3>
            {!spaceInfo.isIsland && (
              <HelpBtn title="공간 설정" text={canShowSpaceDepthControl ? '가구가 설치될 공간의 전체 너비(W), 깊이(D), 높이(H)를 mm 단위로 입력합니다. 벽 안쪽 실측 치수를 기준으로 하며, 이 값에 따라 슬롯 너비, 가구 높이, 프레임 사이즈와 3D 공간 깊이가 자동 계산됩니다.' : '가구가 설치될 공간의 전체 너비(W), 높이(H)를 mm 단위로 입력합니다. 벽 안쪽 실측 치수를 기준으로 하며, 이 값에 따라 슬롯 너비, 가구 높이와 프레임 사이즈가 자동 계산됩니다.'} />
            )}
          </div>

          {spaceInfo.isIsland ? (
            // 아일랜드: W / D / H 직접 입력 (mm)
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['width', 'depth', 'height'] as const).filter((dim) => dim !== 'depth' || canShowSpaceDepthControl).map((dim) => {
                const label = dim === 'width' ? 'W' : dim === 'depth' ? 'D' : 'H';
                const min = 300;
                const max = dim === 'width' ? 6000 : dim === 'depth' ? 2000 : 2750;
                return (
                  <div key={dim} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>{label}</span>
                    <input
                      type="number"
                      value={spaceInfo[dim] ?? ''}
                      min={min}
                      max={max}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!v || v < min || v > max) return;
                        handleSpaceInfoUpdate({ [dim]: v } as any);
                      }}
                      style={{ flex: 1, width: '100%', padding: '6px 8px', border: '1px solid var(--theme-border)', borderRadius: 4, background: 'var(--theme-surface)', color: 'var(--theme-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>W</span>
                <div style={{ flex: 1 }}>
                  <WidthControl
                    spaceInfo={spaceInfo}
                    onUpdate={handleSpaceInfoUpdate}
                    disabled={hasSpecialDualFurniture}
                    hideUnit
                  />
                </div>
              </div>

              {canShowSpaceDepthControl && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>D</span>
                  <div style={{ flex: 1 }}>
                    <DepthControl
                      spaceInfo={spaceInfo}
                      onUpdate={handleSpaceInfoUpdate}
                      hideUnit
                    />
                  </div>
                </div>
              )}

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>H</span>
                <div style={{ flex: 1 }}>
                  <HeightControl
                    spaceInfo={spaceInfo}
                    onUpdate={handleSpaceInfoUpdate}
                    hideUnit
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 공간 유형 - 공간 설정과 단내림 사이 (아일랜드 모드에서는 숨김) */}
        {!spaceInfo.isIsland && (
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>공간 유형</h3>
            <HelpBtn title="공간 유형" text="빌트인: 벽면에 완전히 매립되는 방식으로, 좌우 벽과 천장에 프레임이 밀착됩니다. 세미빌트인: 한쪽 벽만 밀착하고 반대쪽은 개방됩니다. 스탠드: 벽과 무관하게 독립적으로 배치합니다. 유형에 따라 프레임 구성과 이격거리가 달라집니다." />
          </div>
          <InstallTypeControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
          />
        </div>
        )}

        {/* 단내림 설정 (자유배치 전용 — 커튼박스 안쪽, 천장이 내려오는 구간) */}
        {!spaceInfo.isIsland && isFreeMode && (<div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>단내림</h3>
            <HelpBtn title="단내림" text="커튼박스 안쪽으로 천장이 내려오는 구간이 있을 때 활성화합니다. 에어컨 배관, 보 등으로 천장 높이가 달라지는 경우에 사용합니다. 커튼박스가 활성화된 경우 같은 쪽에만 설정할 수 있습니다." />
          </div>

          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${!spaceInfo.stepCeiling?.enabled ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                if (spaceInfo.stepCeiling?.enabled) {
                  handleSpaceInfoUpdate({
                    stepCeiling: { ...spaceInfo.stepCeiling, enabled: false }
                  });
                }
              }}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'left' ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                const isAlready = spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'left';
                if (isAlready) return;
                handleSpaceInfoUpdate({
                  stepCeiling: {
                    enabled: true,
                    position: 'left',
                    width: spaceInfo.stepCeiling?.width || 900,
                    dropHeight: spaceInfo.stepCeiling?.dropHeight || 200
                  }
                });
              }}
            >
              좌단내림
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'right' ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                const isAlready = spaceInfo.stepCeiling?.enabled && spaceInfo.stepCeiling?.position === 'right';
                if (isAlready) return;
                handleSpaceInfoUpdate({
                  stepCeiling: {
                    enabled: true,
                    position: 'right',
                    width: spaceInfo.stepCeiling?.width || 900,
                    dropHeight: spaceInfo.stepCeiling?.dropHeight || 200
                  }
                });
              }}
            >
              우단내림
            </button>
          </div>

          {/* 단내림(stepCeiling)이 활성화되어 있으면 메인 + 단내림 구간 사이즈 표시 */}
          {isFreeMode && spaceInfo.stepCeiling?.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              <ZoneSizeMainRow spaceInfo={spaceInfo} isFreeMode={isFreeMode} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
              <ZoneSizeStepCeilingRow spaceInfo={spaceInfo} styles={styles} />
            </div>
          )}

        </div>)}

        {/* 자유배치: 커튼박스 설정 */}
        {!spaceInfo.isIsland && isFreeMode && (<div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>커튼박스</h3>
            <HelpBtn title="커튼박스" text="벽 상단에 커튼레일 박스가 있는 경우 활성화합니다. 커튼박스 구간은 메인구간보다 천장이 높아 가구가 배치되지 않는 영역입니다. 위치(좌/우)와 너비를 설정하여 가구 배치 가능 영역을 정확히 구분합니다." />
          </div>

          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${!spaceInfo.droppedCeiling?.enabled ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                if (spaceInfo.droppedCeiling?.enabled) {
                  clearAllModules();
                  handleSpaceInfoUpdate({
                    droppedCeiling: {
                      ...spaceInfo.droppedCeiling,
                      enabled: false
                    },
                    mainDoorCount: undefined,
                    droppedCeilingDoorCount: undefined
                  });
                  setActiveRightPanelTab('placement');
                }
              }}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'left' ? styles.toggleButtonActive : ''}`}
              disabled={!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right}
              onClick={() => {
                const isAlreadyLeftEnabled = spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'left';
                if (isAlreadyLeftEnabled) return;

                if (!spaceInfo.droppedCeiling?.enabled) {
                  clearAllModules();
                  const totalWidth = spaceInfo.width || 4800;
                  const droppedWidth = 150;
                  const mainWidth = totalWidth - droppedWidth;
                  const mainRange = calculateDoorRange(mainWidth);
                  const currentCount = getCurrentColumnCount();
                  const adjustedMainDoorCount = Math.max(mainRange.min, Math.min(mainRange.max, currentCount));

                  handleSpaceInfoUpdate({
                    droppedCeiling: {
                      enabled: true,
                      width: droppedWidth,
                      dropHeight: Math.max(10, 2400 - (spaceInfo.height || DEFAULT_SPACE_VALUES.HEIGHT)),
                      position: 'left'
                    },
                    mainDoorCount: adjustedMainDoorCount
                  });
                } else {
                  handleSpaceInfoUpdate({
                    droppedCeiling: {
                      ...spaceInfo.droppedCeiling,
                      enabled: true,
                      position: 'left'
                    }
                  });
                }
                setActiveRightPanelTab('placement');
              }}
            >
              좌측
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'right' ? styles.toggleButtonActive : ''}`}
              disabled={!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right}
              onClick={() => {
                const isAlreadyRightEnabled = spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'right';
                if (isAlreadyRightEnabled) return;

                if (!spaceInfo.droppedCeiling?.enabled) {
                  clearAllModules();
                  const totalWidth = spaceInfo.width || 4800;
                  const droppedWidth = 150;
                  const mainWidth = totalWidth - droppedWidth;
                  const mainRange = calculateDoorRange(mainWidth);
                  const currentCount = getCurrentColumnCount();
                  const adjustedMainDoorCount = Math.max(mainRange.min, Math.min(mainRange.max, currentCount));

                  handleSpaceInfoUpdate({
                    droppedCeiling: {
                      enabled: true,
                      width: droppedWidth,
                      dropHeight: Math.max(10, 2400 - (spaceInfo.height || DEFAULT_SPACE_VALUES.HEIGHT)),
                      position: 'right'
                    },
                    mainDoorCount: adjustedMainDoorCount
                  });
                } else {
                  handleSpaceInfoUpdate({
                    droppedCeiling: {
                      ...spaceInfo.droppedCeiling,
                      enabled: true,
                      position: 'right'
                    }
                  });
                }
                setActiveRightPanelTab('placement');
              }}
            >
              우측
            </button>
          </div>

          {/* 자유배치 커튼박스(droppedCeiling) 활성화 시 메인 + 커튼박스(droppedCeiling) 구간 사이즈 표시 */}
          {isFreeMode && spaceInfo.droppedCeiling?.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {spaceInfo.droppedCeiling?.position === 'left' && (
                <ZoneSizeDroppedRow spaceInfo={spaceInfo} isFreeMode={isFreeMode} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
              )}
              <ZoneSizeMainRow spaceInfo={spaceInfo} isFreeMode={isFreeMode} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
              {spaceInfo.droppedCeiling?.position !== 'left' && (
                <ZoneSizeDroppedRow spaceInfo={spaceInfo} isFreeMode={isFreeMode} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
              )}
            </div>
          )}
        </div>)}

        {/* 슬롯배치: 단내림 설정 (독립 섹션) */}
        {!spaceInfo.isIsland && !isFreeMode && (<div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>단내림</h3>
            <HelpBtn title="단내림" text="공간의 한쪽 천장이 낮아지는(단이 내려오는) 구간이 있을 때 활성화합니다. 에어컨 배관, 보 등으로 천장 높이가 달라지는 경우에 사용합니다. 좌측/우측 위치, 구간 너비, 단 높이를 설정하면 해당 영역의 가구 높이가 자동으로 맞춰집니다." />
          </div>

          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${!(spaceInfo.droppedCeiling?.enabled) ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                if (spaceInfo.droppedCeiling?.enabled) {
                  clearAllModules();
                  handleSpaceInfoUpdate({
                    droppedCeiling: {
                      ...spaceInfo.droppedCeiling,
                      enabled: false,
                    },
                    mainDoorCount: undefined,
                    droppedCeilingDoorCount: undefined
                  });
                  setActiveRightPanelTab('placement');
                }
              }}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'left' ? styles.toggleButtonActive : ''}`}
              disabled={!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right}
              onClick={() => {
                const isActive = spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'left';
                if (isActive) return;

                clearAllModules();
                const totalWidth = spaceInfo.width || 4800;
                const droppedWidth = 900;
                const mainWidth = totalWidth - droppedWidth;
                const mainRange = calculateDoorRange(mainWidth);
                const currentCount = getCurrentColumnCount();
                const adjustedMainDoorCount = Math.max(mainRange.min, Math.min(mainRange.max, currentCount));
                const frameThickness = 50;
                const droppedInternalWidth = droppedWidth - frameThickness;
                const droppedDoorCount = SpaceCalculator.getDefaultColumnCount(droppedInternalWidth);

                handleSpaceInfoUpdate({
                  droppedCeiling: {
                    enabled: true,
                    width: droppedWidth,
                    dropHeight: 200,
                    position: 'left',
                  },
                  droppedCeilingDoorCount: droppedDoorCount,
                  mainDoorCount: adjustedMainDoorCount
                });
                setActiveRightPanelTab('placement');
              }}
            >
              좌단내림
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'right' ? styles.toggleButtonActive : ''}`}
              disabled={!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right}
              onClick={() => {
                const isActive = spaceInfo.droppedCeiling?.enabled && (spaceInfo.droppedCeiling?.position || 'right') === 'right';
                if (isActive) return;

                clearAllModules();
                const totalWidth = spaceInfo.width || 4800;
                const droppedWidth = 900;
                const mainWidth = totalWidth - droppedWidth;
                const mainRange = calculateDoorRange(mainWidth);
                const currentCount = getCurrentColumnCount();
                const adjustedMainDoorCount = Math.max(mainRange.min, Math.min(mainRange.max, currentCount));
                const frameThickness = 50;
                const droppedInternalWidth = droppedWidth - frameThickness;
                const droppedDoorCount = SpaceCalculator.getDefaultColumnCount(droppedInternalWidth);

                handleSpaceInfoUpdate({
                  droppedCeiling: {
                    enabled: true,
                    width: droppedWidth,
                    dropHeight: 200,
                    position: 'right',
                  },
                  droppedCeilingDoorCount: droppedDoorCount,
                  mainDoorCount: adjustedMainDoorCount
                });
                setActiveRightPanelTab('placement');
              }}
            >
              우단내림
            </button>
          </div>

          {/* 단내림 활성화 시 메인 + 단내림 구간 사이즈 표시 */}
          {!isFreeMode && spaceInfo.droppedCeiling?.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {spaceInfo.droppedCeiling?.position === 'left' && (
                <ZoneSizeDroppedRow spaceInfo={spaceInfo} isFreeMode={isFreeMode} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
              )}
              <ZoneSizeMainRow spaceInfo={spaceInfo} isFreeMode={isFreeMode} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
              {spaceInfo.droppedCeiling?.position !== 'left' && (
                <ZoneSizeDroppedRow spaceInfo={spaceInfo} isFreeMode={isFreeMode} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
              )}
            </div>
          )}
        </div>)}

        {/* 슬롯배치: 커튼박스 설정 (단내림과 독립된 별도 curtainBox 필드) */}
        {!spaceInfo.isIsland && !isFreeMode && (<div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>커튼박스</h3>
            <HelpBtn title="커튼박스" text="벽 상단에 커튼레일 박스가 있는 경우 활성화합니다. 커튼박스 구간은 메인구간보다 천장이 높아 가구가 배치되지 않는 영역입니다. 위치(좌/우)와 너비를 설정하면 해당 구간이 가구 배치에서 제외됩니다." />
          </div>

          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${!spaceInfo.curtainBox?.enabled ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                if (spaceInfo.curtainBox?.enabled) {
                  clearAllModules();
                  const prevCbW = spaceInfo.curtainBox.width || 150;
                  handleSpaceInfoUpdate({
                    curtainBox: { enabled: false, position: 'right', width: 150, dropHeight: 20 },
                    width: (spaceInfo.width || 0) - prevCbW, // 커튼박스 제거 → 총 너비 감소
                  });
                  setActiveRightPanelTab('placement');
                }
              }}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left' ? styles.toggleButtonActive : ''}`}
              disabled={!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right}
              onClick={() => {
                if (spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left') return;

                clearAllModules();
                const cbDropHeight = Math.max(10, 2420 - (spaceInfo.height || 2400));
                const wasEnabled = !!spaceInfo.curtainBox?.enabled;
                const widthDelta = wasEnabled ? 0 : 150; // 비활성→활성 시 150 추가, 위치 변경만이면 유지
                handleSpaceInfoUpdate({
                  curtainBox: { enabled: true, position: 'left', width: 150, dropHeight: cbDropHeight },
                  ...(widthDelta ? { width: (spaceInfo.width || 0) + widthDelta } : {}),
                  // 좌측 커튼박스: 좌측 이격 0 (가구공간~커튼박스 경계 이격 없음)
                  gapConfig: { ...(spaceInfo.gapConfig || {}), left: 0 },
                });
                setActiveRightPanelTab('placement');
              }}
            >
              좌측
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right' ? styles.toggleButtonActive : ''}`}
              disabled={!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right}
              onClick={() => {
                if (spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right') return;

                clearAllModules();
                const cbDropHeight = Math.max(10, 2420 - (spaceInfo.height || 2400));
                const wasEnabled = !!spaceInfo.curtainBox?.enabled;
                const widthDelta = wasEnabled ? 0 : 150;
                handleSpaceInfoUpdate({
                  curtainBox: { enabled: true, position: 'right', width: 150, dropHeight: cbDropHeight },
                  ...(widthDelta ? { width: (spaceInfo.width || 0) + widthDelta } : {}),
                  // 우측 커튼박스: 우측 이격 0 (가구공간~커튼박스 경계 이격 없음)
                  gapConfig: { ...(spaceInfo.gapConfig || {}), right: 0 },
                });
                setActiveRightPanelTab('placement');
              }}
            >
              우측
            </button>
          </div>

          {/* 슬롯배치 커튼박스 활성화 시 커튼박스 구간 사이즈 표시 */}
          {!isFreeMode && spaceInfo.curtainBox?.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              <ZoneSizeCurtainBoxRow spaceInfo={spaceInfo} handleSpaceInfoUpdate={handleSpaceInfoUpdate} styles={styles} />
            </div>
          )}
        </div>)}

        {/* 컬럼수 표시 - 단내림 아래 */}
        {(spaceInfo.layoutMode || 'equal-division') === 'equal-division' && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>컬럼수</h3>
              <HelpBtn title="컬럼수" text="공간을 균등하게 나눌 칸(슬롯) 수를 설정합니다. 전체 너비에서 프레임과 이격거리를 뺀 내경을 칸 수로 나누어 각 슬롯의 너비가 자동 계산됩니다. 단내림이 있는 경우 메인 구간과 단내림 구간의 칸 수를 각각 설정할 수 있습니다." />
            </div>

            {!spaceInfo.droppedCeiling?.enabled ? (
              // 단내림이 없을 때 - 컬럼 개수만 표시
              <div className={styles.inputGroup}>
                <DoorSlider
                  value={getCurrentColumnCount()}
                  onChange={(value) => {
                    handleSpaceInfoUpdate({ customColumnCount: value });
                  }}
                  width={spaceInfo.width || 4800}
                />
              </div>
            ) : (
              // 단내림이 있을 때
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className={styles.inputGroup}>
                  <DoorSlider
                    value={spaceInfo.mainDoorCount || getCurrentColumnCount()}
                    onChange={(value) => {
                      handleSpaceInfoUpdate({ mainDoorCount: value });
                    }}
                    width={spaceInfo.width || 4800}
                    label="메인"
                  />
                </div>

                {/* 단내림구간 도어 개수 */}
                <div className={styles.inputGroup}>
                  <DoorSlider
                    value={spaceInfo.droppedCeilingDoorCount || 1}
                    onChange={(value) => {
                      handleSpaceInfoUpdate({ droppedCeilingDoorCount: value });
                    }}
                    width={spaceInfo.droppedCeiling?.width || 900}
                    label="단내림"
                  />
                </div>
              </div>
            )}

          </div>
        )}

        {/* 자유배치 모드에서는 이격거리 불필요 — 제거됨 */}

        {/* 배치 방식 - 좌측 사이드바 상단으로 이동됨 */}

        {/* 프레임 설정 (슬롯/자유배치 공통) - 아일랜드 모드 숨김 */}
        {!spaceInfo.isIsland && (
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>프레임 및 이격설정</h3>
            <HelpBtn title="프레임 및 이격설정" text="가구 외곽을 감싸는 프레임 방식을 선택합니다. 전체서라운드: 상하좌우 모두 프레임으로 마감. 양쪽서라운드: 좌우와 상단만 프레임 적용. 노서라운드: 프레임 없이 가구만 배치하며, 빌트인 시 벽면에 직접 밀착됩니다. 프레임 타입에 따라 가구의 실제 사용 가능 공간이 달라집니다." />
          </div>

          {/* 프레임 타입: 전체서라운드 / 양쪽서라운드 / 노서라운드 */}
          {(() => {
            const currentFrameConfig = inferFrameConfig(spaceInfo);
            const st = spaceInfo.surroundType || 'surround';
            const mode = st === 'no-surround' ? 'no-surround'
              : (!currentFrameConfig.top && !currentFrameConfig.bottom) ? 'sides-only'
                : 'full-surround';

            const handleModeChange = (newMode: string) => {
              // 서라운드 타입별 업데이트 데이터 구성
              let updates: Record<string, unknown>;
              if (newMode === 'full-surround') {
                updates = {
                  surroundType: 'surround',
                  frameConfig: { ...currentFrameConfig, top: true, bottom: true },
                  frameSize: {
                    ...(spaceInfo.frameSize || { left: 50, right: 50, top: 30 }),
                  },
                  doorTopGap: -3,
                };
              } else if (newMode === 'sides-only') {
                updates = {
                  surroundType: 'surround',
                  frameConfig: { ...currentFrameConfig, top: false, bottom: false },
                  doorTopGap: 5,
                };
              } else {
                updates = {
                  surroundType: 'no-surround',
                  frameConfig: { left: false, right: false, top: true, bottom: false },
                  doorTopGap: 5,
                };
              }

              // freeSurround 재계산: 변경된 spaceInfo로 gap 재측정
              // handleSpaceInfoUpdate 내부에서 surroundType 변경 시 frameSize/gapConfig을 재설정하므로
              // generateSurround 호출 전에 동일한 로직을 updatedSpaceInfo에 미리 반영해야 정확한 gap 계산 가능
              if (spaceInfo.freeSurround && placedModules.some(m => m.isFreePlacement)) {
                const preUpdates: Record<string, unknown> = { ...updates };
                const currentInstallType = spaceInfo.installType;
                const currentWallConfig = spaceInfo.wallConfig || { left: true, right: true };
                if (preUpdates.surroundType === 'no-surround' && spaceInfo.surroundType !== 'no-surround') {
                  // 서라운드 → 노서라운드: gapConfig + frameSize 미리 반영
                  const newFrameSize = { ...spaceInfo.frameSize, top: spaceInfo.frameSize?.top || 30 };
                  // 벽없는 쪽에는 EP 자동 생성 안함 (모두 0)
                  newFrameSize.left = 0;
                  newFrameSize.right = 0;
                  preUpdates.frameSize = newFrameSize;
                  preUpdates.gapConfig = {
                    left: currentWallConfig.left ? 1.5 : 0,
                    right: currentWallConfig.right ? 1.5 : 0,
                    middle: spaceInfo.gapConfig?.middle ?? 1.5,
                  };
                } else if (preUpdates.surroundType === 'surround' && spaceInfo.surroundType !== 'surround') {
                  // 노서라운드 → 서라운드: frameSize 미리 반영 (벽없는 쪽에는 EP 자동 생성 안함)
                  const newFrameSize = { ...spaceInfo.frameSize, top: spaceInfo.frameSize?.top || 30 };
                  if (currentInstallType === 'builtin' || currentInstallType === 'built-in') {
                    newFrameSize.left = 50; newFrameSize.right = 50;
                  } else if (currentInstallType === 'semistanding' || currentInstallType === 'semi-standing') {
                    newFrameSize.left = currentWallConfig.left ? 50 : 0;
                    newFrameSize.right = currentWallConfig.right ? 50 : 0;
                  } else {
                    newFrameSize.left = 0; newFrameSize.right = 0;
                  }
                  preUpdates.frameSize = newFrameSize;
                }
                const updatedSpaceInfo = { ...spaceInfo, ...preUpdates } as SpaceInfo;
                const result = generateSurround(updatedSpaceInfo, placedModules);
                if (result.success && result.config) {
                  // 기존 사용자 설정(offset, topGap, bottomGap) 보존하면서 gap만 재계산
                  const oldFs = spaceInfo.freeSurround;
                  const newFs = result.config;
                  newFs.left = { ...newFs.left, offset: oldFs.left.offset, topGap: oldFs.left.topGap, bottomGap: oldFs.left.bottomGap };
                  newFs.right = { ...newFs.right, offset: oldFs.right.offset, topGap: oldFs.right.topGap, bottomGap: oldFs.right.bottomGap };
                  // 중간 서라운드: 사용자 설정 보존
                  if (newFs.middle && oldFs.middle) {
                    newFs.middle = newFs.middle.map((m, i) => {
                      const oldM = oldFs.middle?.[i];
                      return oldM ? { ...m, offset: oldM.offset, topGap: oldM.topGap, bottomGap: oldM.bottomGap } : m;
                    });
                  }
                  updates.freeSurround = newFs;
                }
              }

              handleSpaceInfoUpdate(updates);

              // EP 앞 옵셋 기본값은 서라운드 모드에서도 0으로 유지
              if (newMode === 'full-surround') {
                placedModules.forEach(m => {
                  const epUpdate: Partial<typeof m> = {};
                  if (m.hasLeftEndPanel) epUpdate.leftEndPanelOffset = 0;
                  if (m.hasRightEndPanel) epUpdate.rightEndPanelOffset = 0;
                  if (Object.keys(epUpdate).length > 0) updatePlacedModule(m.id, epUpdate);
                });
              } else {
                placedModules.forEach(m => {
                  const epUpdate: Partial<typeof m> = {};
                  if (m.hasLeftEndPanel) epUpdate.leftEndPanelOffset = 0;
                  if (m.hasRightEndPanel) epUpdate.rightEndPanelOffset = 0;
                  if (Object.keys(epUpdate).length > 0) updatePlacedModule(m.id, epUpdate);
                });
              }
            };

            return (
              <div className={styles.toggleButtonGroup}>
                <button
                  className={`${styles.toggleButton} ${mode === 'full-surround' ? styles.toggleButtonActive : ''}`}
                  onClick={() => handleModeChange('full-surround')}
                >
                  전체서라운드
                </button>
                <button
                  className={`${styles.toggleButton} ${mode === 'sides-only' ? styles.toggleButtonActive : ''}`}
                  onClick={() => handleModeChange('sides-only')}
                >
                  양쪽서라운드
                </button>
                <button
                  className={`${styles.toggleButton} ${mode === 'no-surround' ? styles.toggleButtonActive : ''}`}
                  onClick={() => handleModeChange('no-surround')}
                >
                  노서라운드
                </button>
              </div>
            );
          })()}

          {/* 프레임 속성 설정 */}
          {(spaceInfo.surroundType || 'surround') === 'surround' ? (
            <div className={styles.subSetting}>
              <div className={styles.frameGrid}>
                {/* 좌프레임 — 좌커튼박스 시 CB 너비 표시 (읽기전용) */}
                {(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left') ? (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>좌측(커튼박스)</label>
                  <div className={styles.frameItemInput}>
                    <input
                      type="text"
                      value={spaceInfo.curtainBox?.width || 150}
                      className={styles.frameNumberInput}
                      disabled
                      style={{ opacity: 0.6 }}
                    />
                  </div>
                </div>
                ) : (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>
                    {spaceInfo.installType === 'builtin' ? '좌측' :
                      spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left ? '좌측' :
                        spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left ? '좌측(엔드패널)' :
                          spaceInfo.installType === 'freestanding' ? '좌측(엔드패널)' : '좌측'}
                  </label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentLeft = spaceInfo.frameSize?.left || 50;
                        const newLeft = Math.max(10, currentLeft - 1);
                        updateFrameSize('left', newLeft);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={frameInputLeft}
                      onChange={(e) => handleFrameInputChange('left', e.target.value)}
                      onFocus={() => handleFrameInputFocus('left')}
                      onBlur={() => handleFrameInputBlur('left', 10, 100, 50)}
                      onKeyDown={(e) => handleFrameInputKeyDown(e, 'left', 10, 100, 50)}
                      className={styles.frameNumberInput}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentLeft = spaceInfo.frameSize?.left || 50;
                        const newLeft = Math.min(100, currentLeft + 1);
                        updateFrameSize('left', newLeft);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                )}

                {/* 우프레임 — 우커튼박스 시 CB 너비 표시 (읽기전용) */}
                {(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right') ? (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>우측(커튼박스)</label>
                  <div className={styles.frameItemInput}>
                    <input
                      type="text"
                      value={spaceInfo.curtainBox?.width || 150}
                      className={styles.frameNumberInput}
                      disabled
                      style={{ opacity: 0.6 }}
                    />
                  </div>
                </div>
                ) : (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>
                    {spaceInfo.installType === 'builtin' ? '우측' :
                      spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right ? '우측' :
                        spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right ? '우측(엔드패널)' :
                          spaceInfo.installType === 'freestanding' ? '우측(엔드패널)' : '우측'}
                  </label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentRight = spaceInfo.frameSize?.right || 50;
                        const newRight = Math.max(10, currentRight - 1);
                        updateFrameSize('right', newRight);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={frameInputRight}
                      onChange={(e) => handleFrameInputChange('right', e.target.value)}
                      onFocus={() => handleFrameInputFocus('right')}
                      onBlur={() => handleFrameInputBlur('right', 10, 100, 50)}
                      onKeyDown={(e) => handleFrameInputKeyDown(e, 'right', 10, 100, 50)}
                      className={styles.frameNumberInput}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentRight = spaceInfo.frameSize?.right || 50;
                        const newRight = Math.min(100, currentRight + 1);
                        updateFrameSize('right', newRight);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                )}
              </div>

              {/* 서라운드 모드에서 단내림 활성 시 이격 설정 (경계이격) */}

              {spaceInfo.droppedCeiling?.enabled && (
              <div className={styles.frameGrid} style={{ marginTop: '8px' }}>
                {/* 이격1: 좌측 이격 (좌프레임↔가구) */}
                {(() => {
                  const gapKey = 'left' as const;
                  const curVal = spaceInfo.gapConfig?.left ?? 1.5;
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>이격1</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={curVal}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: Math.max(0, Math.min(5, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}

                {/* 이격2: 경계 이격 (메인↔단내림) */}
                {(() => {
                  const gapKey = 'middle' as const;
                  const curVal = spaceInfo.gapConfig?.middle ?? 1.5;
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>이격2</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={curVal}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: Math.max(0, Math.min(5, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}

                {/* 이격3: 우측 이격 (가구↔우프레임) */}
                {(() => {
                  const gapKey = 'right' as const;
                  const curVal = spaceInfo.gapConfig?.right ?? 1.5;
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>이격3</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={curVal}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: Math.max(0, Math.min(5, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}
              </div>
              )}

            </div>
          ) : (spaceInfo.surroundType || 'surround') === 'no-surround' ? (
            <div className={styles.subSetting}>
              <div className={styles.frameGrid}>
                {/* 좌측 이격거리 - 좌단내림 시 경계이격(middle), 그 외 벽이격(left) */}
                {/* 좌측 커튼박스 활성 시 좌이격 숨김 (커튼박스가 벽 경계 차지) */}
                {!(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left') && (() => {
                  const isLeftBoundary = spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.position === 'left';
                  const gapKey = isLeftBoundary ? 'middle' : 'left';
                  const curVal = isLeftBoundary ? (spaceInfo.gapConfig?.middle ?? 1.5) : (spaceInfo.gapConfig?.left ?? 1.5);
                  const isDisabled = !isLeftBoundary && !spaceInfo.wallConfig?.left;
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>{isLeftBoundary ? '좌이격(경계)' : '좌이격'}</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 2) / 2);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={isDisabled}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={isDisabled ? 0 : curVal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // 빈 값/소수점만 입력 중일 때는 저장 안 함 (예: "3." 입력 중)
                        if (raw === '' || raw === '.' || raw.endsWith('.')) return;
                        const val = parseFloat(raw);
                        if (!isNaN(val)) {
                          // 즉시 0.5 단위로 반올림
                          const snapped = Math.max(0, Math.min(5, Math.round(val * 2) / 2));
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: snapped } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      className={styles.frameNumberInput}
                      disabled={isDisabled}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 2) / 2);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={isDisabled}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}

                {/* 우측 이격거리 - 우단내림 시 경계이격(middle), 그 외 벽이격(right) */}
                {/* 우측 커튼박스 활성 시 우이격 숨김 (커튼박스가 벽 경계 차지) */}
                {!(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right') && (() => {
                  const isRightBoundary = spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.position === 'right';
                  const gapKey = isRightBoundary ? 'middle' : 'right';
                  const curVal = isRightBoundary ? (spaceInfo.gapConfig?.middle ?? 1.5) : (spaceInfo.gapConfig?.right ?? 1.5);
                  const isDisabled = !isRightBoundary && !spaceInfo.wallConfig?.right;
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>{isRightBoundary ? '우이격(경계)' : '우이격'}</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 2) / 2);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={isDisabled}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={isDisabled ? 0 : curVal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '' || raw === '.' || raw.endsWith('.')) return;
                        const val = parseFloat(raw);
                        if (!isNaN(val)) {
                          const snapped = Math.max(0, Math.min(5, Math.round(val * 2) / 2));
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: snapped } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      className={styles.frameNumberInput}
                      disabled={isDisabled}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 2) / 2);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={isDisabled}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}

                {/* 단내림 바깥벽 이격 - 좌단내림 시 좌측벽(left), 우단내림 시 우측벽(right) */}
                {spaceInfo.droppedCeiling?.enabled && (() => {
                  const pos = spaceInfo.droppedCeiling?.position;
                  const gapKey = pos === 'left' ? 'left' : 'right';
                  const curVal = gapKey === 'left'
                    ? (spaceInfo.gapConfig?.left ?? 1.5)
                    : (spaceInfo.gapConfig?.right ?? 1.5);
                  const wallSide = gapKey === 'left' ? spaceInfo.wallConfig?.left : spaceInfo.wallConfig?.right;
                  const isDisabled = !wallSide;
                  const label = pos === 'left' ? '단내림 좌이격' : '단내림 우이격';
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>{label}</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={isDisabled}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={isDisabled ? 0 : curVal}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: Math.max(0, Math.min(5, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      className={styles.frameNumberInput}
                      disabled={isDisabled}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={isDisabled}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}

                {/* 단내림↔커튼박스 경계이격 (단내림+커튼박스 동시 활성 시) */}
                {spaceInfo.droppedCeiling?.enabled && spaceInfo.curtainBox?.enabled && (() => {
                  const curVal = spaceInfo.gapConfig?.middle2 ?? 1.5;
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>단내림↔CB</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, middle2: val } });
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={curVal}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, middle2: Math.max(0, Math.min(5, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, middle2: val } });
                      }}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, middle2: val } });
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}

              </div>

            </div>
          ) : null}

          {/* 단내림 프레임 설정 — 숨김 (메인 프레임 설정에서 통합 관리) */}
          {false && spaceInfo.droppedCeiling?.enabled && (
            <div className={styles.subSetting} style={{ marginTop: '12px', borderTop: '1px solid var(--theme-border)', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: 600, marginBottom: '8px' }}>단내림 구간</div>
              <div className={styles.frameGrid}>
                {/* 단내림 구간 벽쪽 이격거리 (우단내림→우이격, 좌단내림→좌이격) */}
                {(() => {
                  const pos = spaceInfo.droppedCeiling?.position;
                  // 노서라운드일 때만 이격 표시 (서라운드는 프레임으로 처리)
                  if ((spaceInfo.surroundType || 'surround') !== 'no-surround') return null;
                  const gapKey = pos === 'right' ? 'right' : 'left';
                  const label = pos === 'right' ? '우이격' : '좌이격';
                  const curVal = spaceInfo.gapConfig?.[gapKey] ?? 1.5;
                  const hasWall = pos === 'right' ? (spaceInfo.wallConfig?.right ?? true) : (spaceInfo.wallConfig?.left ?? true);
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>{label}</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.max(0, Math.round((curVal - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={!hasWall}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={hasWall ? curVal : 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: Math.max(0, Math.min(5, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      className={styles.frameNumberInput}
                      disabled={!hasWall}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const val = Math.min(5, Math.round((curVal + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, [gapKey]: val } });
                      }}
                      disabled={!hasWall}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}
                {/* 서라운드일 때: 벽쪽 프레임 (우단내림→우측프레임, 좌단내림→좌측프레임) */}
                {(spaceInfo.surroundType || 'surround') === 'surround' && (() => {
                  const pos = spaceInfo.droppedCeiling?.position;
                  const sideLabel = pos === 'right' ? '우측프레임' : '좌측프레임';
                  const defaultSide = pos === 'right' ? (spaceInfo.frameSize?.right || 50) : (spaceInfo.frameSize?.left || 50);
                  const curSide = spaceInfo.droppedCeiling?.sideFrame ?? defaultSide;
                  return (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>{sideLabel}</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const newVal = Math.max(10, curSide - 1);
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, sideFrame: newVal } });
                      }}
                      disabled={curSide <= 10}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={curSide}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, sideFrame: Math.max(10, Math.min(100, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value);
                        if (isNaN(val)) return;
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, sideFrame: Math.max(10, Math.min(100, val)) } });
                      }}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const newVal = Math.min(100, curSide + 1);
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, sideFrame: newVal } });
                      }}
                      disabled={curSide >= 100}
                    >
                      +
                    </button>
                  </div>
                </div>
                  );
                })()}

                {/* 단내림 상단몰딩 - 항상 표시 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>상단몰딩</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const current = spaceInfo.droppedCeiling?.topFrame ?? (spaceInfo.frameSize?.top || 30);
                        const newVal = Math.max(0, current - 1);
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, topFrame: newVal } });
                      }}
                      disabled={(spaceInfo.droppedCeiling?.topFrame ?? (spaceInfo.frameSize?.top || 30)) <= 0}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={spaceInfo.droppedCeiling?.topFrame ?? (spaceInfo.frameSize?.top || 30)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, topFrame: Math.max(0, Math.min(200, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value);
                        if (isNaN(val)) return;
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, topFrame: Math.max(0, Math.min(200, val)) } });
                      }}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const current = spaceInfo.droppedCeiling?.topFrame ?? (spaceInfo.frameSize?.top || 30);
                        const newVal = Math.min(200, current + 1);
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, topFrame: newVal } });
                      }}
                      disabled={(spaceInfo.droppedCeiling?.topFrame ?? (spaceInfo.frameSize?.top || 30)) >= 200}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 단내림 걸래받이 - 노서라운드일 때만 표시 */}
                {(spaceInfo.surroundType || 'surround') === 'no-surround' && (
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>걸래받이</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const current = spaceInfo.droppedCeiling?.bottomFrame ?? 0;
                        const newVal = Math.max(0, current - 1);
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, bottomFrame: newVal } });
                      }}
                      disabled={(spaceInfo.droppedCeiling?.bottomFrame ?? 0) <= 0}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={spaceInfo.droppedCeiling?.bottomFrame ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, bottomFrame: Math.max(0, Math.min(200, val)) } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value);
                        if (isNaN(val)) return;
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, bottomFrame: Math.max(0, Math.min(200, val)) } });
                      }}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const current = spaceInfo.droppedCeiling?.bottomFrame ?? 0;
                        const newVal = Math.min(200, current + 1);
                        handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, bottomFrame: newVal } });
                      }}
                      disabled={(spaceInfo.droppedCeiling?.bottomFrame ?? 0) >= 200}
                    >
                      +
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

        </div>
        )}

        {/* 서라운드 섹션 — freeSurround 존재 시 표시 */}
        {isFreeMode && (() => {
          const fs = spaceInfo.freeSurround;
          if (!fs) return null;
          const middleGaps = fs.middle || [];
          const isNoSurround = spaceInfo.surroundType === 'no-surround';

          // 서라운드 목록: 노서라운드면 좌/우/중간 모두, 전체/양쪽이면 중간만
          type SurroundItem =
            | { kind: 'left' }
            | { kind: 'right' }
            | { kind: 'middle'; idx: number };
          const surroundItems: SurroundItem[] = [];
          if (isNoSurround && fs.left.enabled) surroundItems.push({ kind: 'left' });
          middleGaps.forEach((_m, i) => {
            if (_m.enabled) surroundItems.push({ kind: 'middle', idx: i });
          });
          if (isNoSurround && fs.right.enabled) surroundItems.push({ kind: 'right' });

          // 활성된 서라운드 항목이 없으면 섹션 자체를 숨김
          if (surroundItems.length === 0) return null;

          const droppedPos = spaceInfo.droppedCeiling?.enabled ? spaceInfo.droppedCeiling.position : null;
          const getSurroundLabel = (kind: string) => {
            if (kind === 'left') return droppedPos === 'left' ? '커튼박스' : '좌측';
            if (kind === 'right') return droppedPos === 'right' ? '커튼박스' : '우측';
            return '중간';
          };
          const renderOffsetRow = (
            label: string,
            enabled: boolean,
            sizeMM: number,
            offset: number,
            onToggle: () => void,
            onSizeChange: (val: number) => void,
            onOffsetChange: (val: number) => void,
            highlightKey: string,
          ) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
              <span className={styles.frameItemLabel} style={{ minWidth: '44px', textAlign: 'left', margin: 0, fontSize: '11px' }}>{label}</span>
              <button
                onClick={onToggle}
                className={`${styles.miniToggle} ${enabled ? styles.miniToggleActive : ''}`}
              />
              {enabled ? (
                <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>size</span>
                    <input
                      type="text" inputMode="numeric"
                      value={sizeMM || ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(highlightKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onSizeChange(Math.max(0, Math.min(9999, (sizeMM || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d+$/.test(v)) onSizeChange(v === '' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        onSizeChange(Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
                    <input
                      type="text" inputMode="numeric"
                      value={offset !== 0 ? offset : ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(highlightKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onOffsetChange(Math.max(-200, Math.min(200, (offset || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || v === '-' || /^-?\d+$/.test(v)) onOffsetChange(v === '' || v === '-' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        const parsed = parseInt(e.target.value) || 0;
                        onOffsetChange(Math.max(-200, Math.min(200, parsed)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );

          return (
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>서라운드</h3>
                <HelpBtn title="서라운드" text="서라운드 프레임의 상·하·좌·우 각 면의 두께를 개별 설정합니다. 벽면과 가구 사이의 마감재 역할을 하며, 값이 클수록 가구 배치 가능 공간이 줄어듭니다. 옵셋 기준을 '외경'으로 하면 전체 공간 기준, '내경'으로 하면 가구 기준으로 계산됩니다." />
              </div>
              <div className={styles.subSetting}>
                {surroundItems.map((si) => {
                  if (si.kind === 'left') {
                    const d = fs.left;
                    const panelSize = Math.max(0, (d.gap || 0) - 3);
                    return <React.Fragment key="surround-left">{renderOffsetRow(getSurroundLabel('left'), d.enabled, panelSize, d.offset,
                      () => setSpaceInfo({ freeSurround: { ...fs, left: { ...d, enabled: !d.enabled } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, left: { ...d, gap: v + 3 } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, left: { ...d, offset: v } } }),
                      'surround-left',
                    )}</React.Fragment>;
                  }
                  if (si.kind === 'right') {
                    const d = fs.right;
                    const panelSize = Math.max(0, (d.gap || 0) - 3);
                    return <React.Fragment key="surround-right">{renderOffsetRow(getSurroundLabel('right'), d.enabled, panelSize, d.offset,
                      () => setSpaceInfo({ freeSurround: { ...fs, right: { ...d, enabled: !d.enabled } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, right: { ...d, gap: v + 3 } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, right: { ...d, offset: v } } }),
                      'surround-right',
                    )}</React.Fragment>;
                  }
                  if (si.kind === 'middle') {
                    const midCfg = middleGaps[si.idx];
                    const panelSize = Math.max(0, (midCfg.gap || 0) - 3);
                    return <React.Fragment key={`surround-middle-${si.idx}`}>{renderOffsetRow(`중간${middleGaps.length > 1 ? si.idx + 1 : ''}`, midCfg.enabled, panelSize, midCfg.offset || 0,
                      () => {
                        const newMiddle = [...middleGaps];
                        newMiddle[si.idx] = { ...newMiddle[si.idx], enabled: !newMiddle[si.idx].enabled };
                        setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                      },
                      (v) => {
                        const newMiddle = [...middleGaps];
                        newMiddle[si.idx] = { ...newMiddle[si.idx], gap: v + 3 };
                        setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                      },
                      (v) => {
                        const newMiddle = [...middleGaps];
                        newMiddle[si.idx] = { ...newMiddle[si.idx], offset: v };
                        setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                      },
                      `surround-middle-${si.idx}`,
                    )}</React.Fragment>;
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })()}

        {/* 상,걸래받이 섹션 — 가구별 좌→우 순서 (서라운드 무관하게 항상 표시) */}
        {isFreeMode && (() => {
          const freeMods = placedModules.filter(m => m.isFreePlacement);
          if (spaceInfo.isIsland) return null;
          // 자유배치 가구 0개일 때: 슬롯배치와 동일하게 spaceInfo 글로벌 값 기반 섹션 표시
          if (freeMods.length === 0) {
            const globalTopEmpty = spaceInfo.frameSize?.top ?? 30;
            const globalTopOffsetEmpty = (spaceInfo.frameSize as any)?.topOffset ?? 0;
            const globalTopGapEmpty = (spaceInfo.frameSize as any)?.topGap ?? 0;
            const globalBaseEmpty = spaceInfo.baseConfig?.height ?? 65;
            const globalBaseOffsetEmpty = (spaceInfo.baseConfig as any)?.offset ?? 0;
            const globalFloatHeightEmpty = spaceInfo.baseConfig?.floatHeight ?? 0;
            const topEnabledEmpty = globalTopEmpty > 0;
            const baseEnabledEmpty = spaceInfo.baseConfig?.type !== 'stand' && globalBaseEmpty > 0;
            const globalBaseGapEmpty = baseEnabledEmpty ? ((spaceInfo.baseConfig as any)?.gap ?? 0) : 0;
            const numCellStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' };
            const numInputStyle: React.CSSProperties = { width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent' };
            const numLabelStyle: React.CSSProperties = { fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 };
            return (
              <>
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>상단몰딩</h3>
                    <label onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}>
                      <input type="checkbox" checked={topEnabledEmpty} onChange={(e) => {
                        const enabled = e.target.checked;
                        handleSpaceInfoUpdate({
                          frameSize: {
                            ...spaceInfo.frameSize,
                            top: enabled ? (globalTopEmpty || 30) : 0,
                            ...(enabled ? { topGap: 0 } : {})
                          } as any
                        });
                      }} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                      <span>전체</span>
                    </label>
                    <HelpBtn title="상단몰딩" text="가구 위쪽과 천장 사이의 마감 패널 높이입니다." />
                  </div>
                  <div className={styles.subSetting}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                      <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                      <button onClick={() => {
                        const nextEnabled = !topEnabledEmpty;
                        handleSpaceInfoUpdate({
                          frameSize: {
                            ...spaceInfo.frameSize,
                            top: nextEnabled ? (globalTopEmpty || 30) : 0,
                            ...(nextEnabled ? { topGap: 0 } : {})
                          } as any
                        });
                      }} className={`${styles.miniToggle} ${topEnabledEmpty ? styles.miniToggleActive : ''}`} />
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        {topEnabledEmpty ? (
                          <>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>size</span>
                              <input type="text" inputMode="numeric" value={Math.max(0, globalTopEmpty - globalTopGapEmpty) || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || /^\d+$/.test(v)) {
                                    handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, top: (v === '' ? 0 : parseInt(v, 10)) + globalTopGapEmpty } });
                                  }
                                }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>옵셋</span>
                              <input type="text" inputMode="numeric" value={globalTopOffsetEmpty || ''}
                                onChange={(e) => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d+$/.test(v)) handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, topOffset: v === '' || v === '-' ? 0 : parseInt(v, 10) } as any }); }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>갭</span>
                              <input type="text" inputMode="numeric" value={globalTopGapEmpty || ''}
                                onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, topGap: v === '' ? 0 : parseInt(v, 10) } as any }); }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                            </div>
                          </>
                        ) : (
                          <div style={numCellStyle}>
                            <span style={numLabelStyle}>상단갭</span>
                            <input type="text" inputMode="numeric" value={globalTopGapEmpty || ''}
                              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, topGap: v === '' ? 0 : parseInt(v, 10) } as any }); }}
                              style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>걸레받이</h3>
                    <label onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}>
                      <input type="checkbox" checked={baseEnabledEmpty} onChange={(e) => {
                        const enabled = e.target.checked;
                        handleSpaceInfoUpdate({
                          baseConfig: {
                            ...spaceInfo.baseConfig,
                            type: enabled ? 'floor' : 'stand',
                            placementType: enabled ? 'ground' : 'float',
                            height: enabled ? (globalBaseEmpty || 65) : 0,
                            ...(enabled ? { gap: 0 } : { floatHeight: globalFloatHeightEmpty })
                          }
                        });
                      }} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                      <span>전체</span>
                    </label>
                    <HelpBtn title="걸레받이" text="가구 아래쪽 받침대의 높이와 옵셋을 설정합니다." />
                  </div>
                  <div className={styles.subSetting}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                      <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                      <button onClick={() => {
                        const nextEnabled = !baseEnabledEmpty;
                        handleSpaceInfoUpdate({
                          baseConfig: {
                            ...spaceInfo.baseConfig,
                            type: nextEnabled ? 'floor' : 'stand',
                            placementType: nextEnabled ? 'ground' : 'float',
                            height: nextEnabled ? (globalBaseEmpty || 65) : 0,
                            ...(nextEnabled ? { gap: 0 } : { floatHeight: globalFloatHeightEmpty })
                          }
                        });
                      }} className={`${styles.miniToggle} ${baseEnabledEmpty ? styles.miniToggleActive : ''}`} />
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        {baseEnabledEmpty ? (
                          <>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>size</span>
                              <input type="text" inputMode="numeric" value={globalBaseEmpty || ''}
                                onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) handleSpaceInfoUpdate({ baseConfig: { ...spaceInfo.baseConfig, height: v === '' ? 0 : parseInt(v, 10) } }); }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>옵셋</span>
                              <input type="text" inputMode="numeric" value={globalBaseOffsetEmpty || ''}
                                onChange={(e) => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d+$/.test(v)) handleSpaceInfoUpdate({ baseConfig: { ...spaceInfo.baseConfig, offset: v === '' || v === '-' ? 0 : parseInt(v, 10) } as any }); }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>갭</span>
                              <input type="text" inputMode="numeric" value={globalBaseGapEmpty || ''}
                                onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) handleSpaceInfoUpdate({ baseConfig: { ...spaceInfo.baseConfig, gap: v === '' ? 0 : parseInt(v, 10) } as any }); }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                            </div>
                          </>
                        ) : (
                          <div style={numCellStyle}>
                            <span style={numLabelStyle}>띄움높이</span>
                            <input type="text" inputMode="numeric" value={globalFloatHeightEmpty || ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || /^\d+$/.test(v)) {
                                  handleSpaceInfoUpdate({
                                    baseConfig: {
                                      ...spaceInfo.baseConfig,
                                      type: 'stand',
                                      placementType: 'float',
                                      height: 0,
                                      floatHeight: v === '' ? 0 : parseInt(v, 10)
                                    } as any
                                  });
                                }
                              }}
                              style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          }
          const sorted = [...freeMods].sort((a, b) => a.position.x - b.position.x);
          const toAlpha = (n: number) => String.fromCharCode(64 + n);

          let topNum = 0;
          let baseNum = 0;
          // 자유배치 전체 토글 — 슬롯배치와 동일 동작
          // 통합 모드(allOn): 통합 행 1개. 해제 모드(allOff): 가구별 개별 행 (각자 토글/입력 가능)
          // 토글 시 모든 가구를 ON 상태로 복구하여 개별 토글 자유 유지
          // 키큰장찬넬(insert-frame)은 채움재이므로 상단몰딩/걸레받이 전체 토글에서 제외 (전체 OFF 시 바닥 아래로 내려가는 문제 방지)
          const isInsertFrame = (m: any) => typeof m.moduleId === 'string' && m.moduleId.includes('insert-frame');
          const topFreeMods = sorted.filter(m => {
            if (isInsertFrame(m)) return false;
            const cat = getModuleCategory(m);
            return cat === 'upper' || cat === 'full';
          });
          const baseFreeMods = sorted.filter(m => {
            if (isInsertFrame(m)) return false;
            const cat = getModuleCategory(m);
            return cat === 'lower' || cat === 'full';
          });
          const allTopOnFree = topFrameAllMode;
          const allBaseOnFree = baseFrameAllMode;
          const toggleAllTopFree = () => {
            const next = !topFrameAllMode;
            setTopFrameAllMode(next);
            // 통합/해제 모두 개별행 ON 상태로 복구
            topFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
              hasTopFrame: true,
              topFrameGap: 0,
              doorTopGap: getTopDoorGapForFrameState(spaceInfo, true)
            })));
          };
          const toggleAllBaseFree = () => {
            const next = !baseFrameAllMode;
            setBaseFrameAllMode(next);
            // 통합/해제 모두 개별행 ON 상태로 복구
            baseFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
              hasBase: true,
              doorBottomGap: 25,
            })));
          };
          return (
            <>
            {/* 상단몰딩 섹션 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>상단몰딩</h3>
                <label
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}
                >
                  <input type="checkbox" checked={allTopOnFree} onChange={toggleAllTopFree} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                  <span>전체</span>
                </label>
                <HelpBtn title="상단몰딩" text="가구 위쪽과 천장 사이의 마감 패널 높이입니다." />
              </div>
              {true && (
              <div className={styles.subSetting}>
                {/* 상단몰딩 항목들 — 전체 모드 ON: 통합 행 1개 (토글 ON=size+옵셋, OFF=상단갭). 해제: 가구별 개별 행 */}
                {allTopOnFree && topFreeMods.length > 0 ? (
                  (() => {
                    const firstTop = topFreeMods[0];
                    const catFirst = getModuleCategory(firstTop);
                    const globalTop = spaceInfo.frameSize?.top ?? 30;
                    const globalBaseLocal = spaceInfo.baseConfig?.height ?? 65;
                    const topOffsetDefaultU = (catFirst === 'upper' && spaceInfo.surroundType === 'surround') ? 23 : 0;
                    const unifiedEnabled = topFreeMods.every(m => m.hasTopFrame !== false);
                    const firstTopFrameSize = computeShelfSplitTopDistance(firstTop) ?? (firstTop.topFrameThickness ?? globalTop);
                    const getFreeTopOffGap = (target: typeof firstTop) => {
                      const shelfSplitGap = computeShelfSplitTopDistance(target);
                      if (shelfSplitGap !== null) return shelfSplitGap;
                      const floorFinishH = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
                      const bottomPortion = target.hasBase === false
                        ? (target.individualFloatHeight ?? 0)
                        : (target.baseFrameHeight ?? globalBaseLocal);
                      const furnitureActualH = target.freeHeight
                        ?? target.customHeight
                        ?? (() => {
                          const md = getModuleById(target.moduleId, { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth }, spaceInfo);
                          return md?.dimensions.height ?? 0;
                        })();
                      return Math.max(0, spaceInfo.height - furnitureActualH - bottomPortion - floorFinishH);
                    };
                    if (unifiedEnabled) {
                      return <FrameOffsetRow key="top-all-free"
                        num={1} label="전체"
                        enabled={true}
                        sizeMM={firstTopFrameSize}
                        offset={firstTop.topFrameOffset ?? topOffsetDefaultU}
                        gap={firstTop.topFrameGap ?? 0}
                        onToggle={() => topFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
                          hasTopFrame: false,
                          topFrameGap: getFreeTopOffGap(m),
                          doorTopGap: -5
                        })))}
                        onSizeChange={(v) => topFreeMods.forEach(m => updatePlacedModule(m.id, getTopFrameSizeUpdates(m, v)))}
                        onOffsetChange={(v) => topFreeMods.forEach(m => updatePlacedModule(m.id, { topFrameOffset: v }))}
                        onGapChange={(v) => topFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: Math.max(0, v) })))}
                        highlightKey="top-all-free"
                        toAlpha={toAlpha} styles={styles} setHighlightedFrame={setHighlightedFrame}
                        splitGapFromSize
                      />;
                    }
                    // OFF 상태: 상단갭 = 공간높이 - 가구높이 - 걸레받이 - 바닥마감재 - 띄움
                    const floorFinishH = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
                    const bottomPortion = firstTop.hasBase === false
                      ? (firstTop.individualFloatHeight ?? 0)
                      : (firstTop.baseFrameHeight ?? globalBaseLocal);
                    const furnitureActualH = firstTop.freeHeight
                      ?? firstTop.customHeight
                      ?? (() => {
                        const md = getModuleById(firstTop.moduleId, { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth }, spaceInfo);
                        return md?.dimensions.height ?? 0;
                      })();
                    const computedGap = Math.max(0, spaceInfo.height - furnitureActualH - bottomPortion - floorFinishH);
                    const currentGap = firstTop.topFrameGap ?? computeShelfSplitTopDistance(firstTop) ?? computedGap;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                        <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                        <button
                          onClick={() => topFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { hasTopFrame: true, topFrameGap: 0, doorTopGap: getTopDoorGapForFrameState(spaceInfo, true) })))}
                          className={styles.miniToggle}
                        />
                        <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                          <div className={styles.frameItemInput} style={{ flex: 1 }}>
                            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>상단갭</span>
                            <input
                              type="text" inputMode="numeric"
                              value={currentGap || ''} placeholder="0"
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const nextGap = Math.max(0, Math.min(2000, currentGap + (e.key === 'ArrowUp' ? 1 : -1)));
                                  topFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: nextGap })));
                                }
                              }}
                              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) { const nextGap = v === '' ? 0 : parseInt(v, 10); topFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: nextGap }))); } }}
                              onBlur={(e) => { const nextGap = Math.max(0, Math.min(2000, parseInt(e.target.value) || 0)); topFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: nextGap }))); }}
                              className={styles.frameNumberInput}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                sorted.map((mod) => {
                  const cat = getModuleCategory(mod);
                  if (cat !== 'upper' && cat !== 'full') return null;
                  topNum++;
                  const tn = topNum;
                  const globalTop = spaceInfo.frameSize?.top ?? 30;
                  // 상부장(upper)은 상단몰딩 = topFrameThickness (캐비넷 위 작은 띠)
                  // 키큰장(full)은 상단몰딩 = 공간높이 - 받침대 - 가구높이
                  if (cat === 'upper') {
                    const upperTopFrame = mod.topFrameThickness ?? globalTop;
                    const upperOffsetDefault = spaceInfo.surroundType === 'surround' ? 23 : 0;
                    return <FrameOffsetRow key={`top-${mod.id}`}
                      num={tn} label="(상)"
                      enabled={mod.hasTopFrame !== false} sizeMM={upperTopFrame} offset={mod.topFrameOffset ?? upperOffsetDefault}
                      gap={mod.topFrameGap ?? 0}
                      onToggle={() => {
                        const newVal = !(mod.hasTopFrame !== false);
                        updatePlacedModule(mod.id, {
                          hasTopFrame: newVal,
                          topFrameGap: newVal ? 0 : (mod.topFrameGap ?? upperTopFrame),
                          doorTopGap: getTopDoorGapForFrameState(spaceInfo, newVal)
                        });
                      }}
                      onSizeChange={(v) => updatePlacedModule(mod.id, { topFrameThickness: Math.max(0, v) })}
                      onOffsetChange={(v) => updatePlacedModule(mod.id, { topFrameOffset: v })}
                      onGapChange={(v) => updatePlacedModule(mod.id, { topFrameGap: Math.max(0, v) })}
                      highlightKey={`top-${mod.id}`}
                      toAlpha={toAlpha} styles={styles} setHighlightedFrame={setHighlightedFrame}
                      splitGapFromSize={mod.hasTopFrame !== false}
                    />;
                  }
                  // 키큰장(full): 공간높이 - 받침대 - 띄움높이 - 가구높이
                  const baseH = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
                  const isStandFloat = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
                  const floatH = isStandFloat ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
                  const internalH = calculateInternalSpace(spaceInfo).height;
                  // freeHeight가 stale(이전 배치모드 값)일 수 있으므로 최대값 제한
                  const rawFreeH = mod.freeHeight || internalH;
                  const maxFreeH = internalH - floatH;
                  const modHeight = Math.min(rawFreeH, maxFreeH);
                  // 단내림 구간 가구: 공간높이 대신 단내림 천장 높이 사용
                  const isDroppedZone = mod.zone === 'dropped';
                  const stepDrop = (isDroppedZone && spaceInfo.stepCeiling?.enabled)
                    ? (spaceInfo.stepCeiling.dropHeight || 0) : 0;
                  const dcDrop = (isDroppedZone && spaceInfo.droppedCeiling?.enabled && !spaceInfo.stepCeiling?.enabled)
                    ? (spaceInfo.droppedCeiling.dropHeight || 0) : 0;
                  const effectiveSpaceHeight = spaceInfo.height - stepDrop - dcDrop;
                  const actualTopFrameSize = computeShelfSplitTopDistance(mod, effectiveSpaceHeight)
                    ?? Math.max(0, effectiveSpaceHeight - baseH - floatH - modHeight);
                  return <FrameOffsetRow key={`top-${mod.id}`}
                    num={tn} label="(상)"
                    enabled={mod.hasTopFrame !== false} sizeMM={actualTopFrameSize} offset={mod.topFrameOffset ?? 0}
                    gap={mod.hasTopFrame === false ? (mod.topFrameGap ?? actualTopFrameSize) : (mod.topFrameGap ?? 0)}
                    onToggle={() => {
                      const newVal = !(mod.hasTopFrame !== false);
                      updatePlacedModule(mod.id, {
                        hasTopFrame: newVal,
                        topFrameGap: newVal ? 0 : actualTopFrameSize,
                        doorTopGap: getTopDoorGapForFrameState(spaceInfo, newVal)
                      });
                    }}
                    onSizeChange={(v) => {
                      const revFloatH = (spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float')
                        ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
                      if ((mod.moduleId || '').includes('shelf-split')) {
                        updatePlacedModule(mod.id, getTopFrameSizeUpdates(mod, v, effectiveSpaceHeight));
                        return;
                      }
                      const newFreeHeight = Math.max(100, effectiveSpaceHeight - baseH - revFloatH - v);
                      updatePlacedModule(mod.id, { freeHeight: newFreeHeight });
                    }}
                    onOffsetChange={(v) => updatePlacedModule(mod.id, { topFrameOffset: v })}
                    onGapChange={(v) => updatePlacedModule(mod.id, { topFrameGap: Math.max(0, v) })}
                    highlightKey={`top-${mod.id}`}
                    toAlpha={toAlpha} styles={styles} setHighlightedFrame={setHighlightedFrame}
                    splitGapFromSize={mod.hasTopFrame !== false}
                  />;
                })
                )}
              </div>
              )}
            </div>
            {/* 걸레받이 섹션 — 별도 configSection */}
            {spaceInfo.baseConfig?.type !== 'stand' && (
            <div className={styles.configSection}>
              <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>걸레받이</h3>
                <label
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}
                >
                  <input type="checkbox" checked={allBaseOnFree} onChange={toggleAllBaseFree} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                  <span>전체</span>
                </label>
                <HelpBtn title="걸레받이" text="가구 아래쪽 받침대의 높이와 옵셋을 설정합니다." />
              </div>
              {true && (
              <div className={styles.subSetting}>
                {/* 걸레받이 항목들 — 전체 모드 ON: 통합 행 1개 (토글 ON=size+옵셋, OFF=띄움). 해제: 가구별 개별 행 */}
                {allBaseOnFree && baseFreeMods.length > 0 ? (
                  (() => {
                    const firstBase = baseFreeMods[0];
                    const isLowerFirst = firstBase.moduleId?.startsWith('lower-') || firstBase.moduleId?.includes('-lower-');
                    const globalBaseLocal = spaceInfo.baseConfig?.height ?? 65;
                    const unifiedEnabled = baseFreeMods.every(m => m.hasBase !== false);
                    if (unifiedEnabled) {
                      return <FrameOffsetRow key="base-all-free"
                        num={1} label="전체"
                        enabled={true}
                        sizeMM={firstBase.baseFrameHeight ?? globalBaseLocal}
                        offset={firstBase.baseFrameOffset ?? (isLowerFirst ? 65 : 0)}
                        gap={(firstBase as any).baseFrameGap ?? 0}
                        onToggle={() => baseFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { hasBase: false, individualFloatHeight: 0, doorBottomGap: -5 })))}
                        onSizeChange={(v) => baseFreeMods.forEach(m => updatePlacedModule(m.id, getBaseFrameSizeUpdates(m, v)))}
                        onOffsetChange={(v) => baseFreeMods.forEach(m => updatePlacedModule(m.id, { baseFrameOffset: v }))}
                        onGapChange={(v) => baseFreeMods.forEach(m => updatePlacedModule(m.id, { baseFrameGap: Math.max(0, v) } as any))}
                        splitGapFromSize
                        highlightKey="base-all-free"
                        toAlpha={toAlpha} styles={styles} setHighlightedFrame={setHighlightedFrame}
                      />;
                    }
                    // OFF 상태: 띄움 입력
                    const currentFloat = firstBase.individualFloatHeight ?? 0;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                        <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                        <button
                          onClick={() => baseFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { hasBase: true, doorBottomGap: 25 })))}
                          className={styles.miniToggle}
                        />
                        <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                          <div className={styles.frameItemInput} style={{ flex: 1 }}>
                            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>띄움</span>
                            <input
                              type="text" inputMode="numeric"
                              value={currentFloat || ''} placeholder="0"
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const nv = Math.max(0, Math.min(500, currentFloat + (e.key === 'ArrowUp' ? 1 : -1)));
                                  baseFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { individualFloatHeight: nv })));
                                }
                              }}
                              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) { const nv = v === '' ? 0 : parseInt(v, 10); baseFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { individualFloatHeight: nv }))); } }}
                              onBlur={(e) => { const nv = Math.max(0, Math.min(500, parseInt(e.target.value) || 0)); baseFreeMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { individualFloatHeight: nv }))); }}
                              className={styles.frameNumberInput}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                sorted.map((mod) => {
                  const cat = getModuleCategory(mod);
                  if (cat !== 'lower' && cat !== 'full') return null;
                  baseNum++;
                  const bn = baseNum;
                  const freeBaseEnabled = mod.hasBase !== false;
                  const baseGap = Math.max(0, (mod as any).baseFrameGap ?? 0);
                  const rawBaseHeight = mod.baseFrameHeight ?? (spaceInfo.baseConfig?.height || 65);
                  const visibleBaseHeight = Math.max(0, rawBaseHeight - baseGap);
                  return (
                    <div key={`base-${mod.id}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                      <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>{toAlpha(bn)}(하)</span>
                      <button
                        onClick={() => {
                          updatePlacedModule(mod.id, {
                            hasBase: !freeBaseEnabled,
                            doorBottomGap: !freeBaseEnabled ? 25 : -5,
                            ...(freeBaseEnabled ? { individualFloatHeight: 0 } : {}),
                          });
                        }}
                        className={`${styles.miniToggle} ${freeBaseEnabled ? styles.miniToggleActive : ''}`}
                      />
                      {freeBaseEnabled ? (
                        <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                          <div className={styles.frameItemInput} style={{ flex: 1 }}>
                            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>size</span>
                            <input
                              type="text" inputMode="numeric"
                              value={visibleBaseHeight || ''} placeholder="0"
                              onFocus={() => setHighlightedFrame(`base-${mod.id}`)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  updatePlacedModule(mod.id, getBaseFrameSizeUpdates(mod, Math.max(0, Math.min(9999, visibleBaseHeight + (e.key === 'ArrowUp' ? 1 : -1))) + baseGap));
                                }
                              }}
                              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) updatePlacedModule(mod.id, getBaseFrameSizeUpdates(mod, (v === '' ? 0 : parseInt(v, 10)) + baseGap)); }}
                              onBlur={(e) => { setHighlightedFrame(null); updatePlacedModule(mod.id, getBaseFrameSizeUpdates(mod, Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)) + baseGap)); }}
                              className={styles.frameNumberInput}
                            />
                          </div>
                          <div className={styles.frameItemInput} style={{ flex: 1 }}>
                            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
                            <input
                              type="text" inputMode="numeric"
                              value={mod.baseFrameOffset ?? (cat === 'lower' ? 65 : 0)} placeholder={String(cat === 'lower' ? 65 : 0)}
                              onFocus={() => setHighlightedFrame(`base-${mod.id}`)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = mod.baseFrameOffset ?? (cat === 'lower' ? 65 : 0);
                                  updatePlacedModule(mod.id, { baseFrameOffset: Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1))) });
                                }
                              }}
                              onChange={(e) => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d+$/.test(v)) updatePlacedModule(mod.id, { baseFrameOffset: v === '' || v === '-' ? 0 : parseInt(v, 10) }); }}
                              onBlur={(e) => { setHighlightedFrame(null); updatePlacedModule(mod.id, { baseFrameOffset: Math.max(-200, Math.min(200, parseInt(e.target.value) || (cat === 'lower' ? 65 : 0))) }); }}
                              className={styles.frameNumberInput}
                            />
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                          <div className={styles.frameItemInput} style={{ flex: 1 }}>
                            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>띄움</span>
                            <input
                              type="text" inputMode="numeric"
                              value={(mod.individualFloatHeight ?? 0) || ''} placeholder="0"
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = mod.individualFloatHeight ?? 0;
                                  updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, { individualFloatHeight: Math.max(0, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1))) }));
                                }
                              }}
                              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, { individualFloatHeight: v === '' ? 0 : parseInt(v, 10) })); }}
                              onBlur={(e) => { updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, { individualFloatHeight: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })); }}
                              className={styles.frameNumberInput}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
                )}
              </div>
              )}
            </div>
            )}
            </>
          );
        })()}

        {/* 슬롯배치 상,걸래받이 개별 설정은 우측바(RightPanel)에서 처리 */}

        {/* 걸래받이 높이/깊이 (글로벌) — 자유배치에서는 상걸래받이 섹션에서 개별 설정 가능하므로 숨김 */}

        {/* 슬롯배치: 모든 가구의 상,걸래받이 개별 설정 */}
        {!isFreeMode && (() => {
          const slotMods = placedModules.filter(m => !m.isSurroundPanel);
          // 가구 0개일 때: spaceInfo 글로벌 값으로 상단몰딩/걸레받이 섹션만 표시
          if (slotMods.length === 0) {
            const globalTopEmpty = spaceInfo.frameSize?.top ?? 30;
            const globalTopOffsetEmpty = (spaceInfo.frameSize as any)?.topOffset ?? 0;
            const globalTopGapEmpty = (spaceInfo.frameSize as any)?.topGap ?? 0;
            const globalBaseEmpty = spaceInfo.baseConfig?.height ?? 65;
            const globalBaseOffsetEmpty = (spaceInfo.baseConfig as any)?.offset ?? 0;
            const globalFloatHeightEmpty = spaceInfo.baseConfig?.floatHeight ?? 0;
            const topEnabledEmpty = globalTopEmpty > 0;
            const baseEnabledEmpty = spaceInfo.baseConfig?.type !== 'stand' && globalBaseEmpty > 0;
            const globalBaseGapEmpty = baseEnabledEmpty ? ((spaceInfo.baseConfig as any)?.gap ?? 0) : 0;
            const numCellStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' };
            const numInputStyle: React.CSSProperties = { width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent' };
            const numLabelStyle: React.CSSProperties = { fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 };
            return (
              <>
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>상단몰딩</h3>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}
                    >
                      <input
                        type="checkbox"
                        checked={topEnabledEmpty}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          handleSpaceInfoUpdate({
                            frameSize: {
                              ...spaceInfo.frameSize,
                              top: enabled ? (globalTopEmpty || 30) : 0,
                              ...(enabled ? { topGap: 0 } : {})
                            } as any
                          });
                        }}
                        style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                      />
                      <span>전체</span>
                    </label>
                    <HelpBtn title="상단몰딩" text="가구 위쪽과 천장 사이의 마감 패널 높이입니다." />
                  </div>
                  <div className={styles.subSetting}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                      <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                      <button
                        onClick={() => {
                          const nextEnabled = !topEnabledEmpty;
                          handleSpaceInfoUpdate({
                            frameSize: {
                              ...spaceInfo.frameSize,
                              top: nextEnabled ? (globalTopEmpty || 30) : 0,
                              ...(nextEnabled ? { topGap: 0 } : {})
                            } as any
                          });
                        }}
                        className={`${styles.miniToggle} ${topEnabledEmpty ? styles.miniToggleActive : ''}`}
                      />
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        {topEnabledEmpty ? (
                          <>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>size</span>
                              <input
                                type="text" inputMode="numeric"
                                value={Math.max(0, globalTopEmpty - globalTopGapEmpty) || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || /^\d+$/.test(v)) {
                                    handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, top: (v === '' ? 0 : parseInt(v, 10)) + globalTopGapEmpty } });
                                  }
                                }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                              />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>옵셋</span>
                              <input
                                type="text" inputMode="numeric"
                                value={globalTopOffsetEmpty || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                    handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, topOffset: v === '' || v === '-' ? 0 : parseInt(v, 10) } as any });
                                  }
                                }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                              />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>갭</span>
                              <input
                                type="text" inputMode="numeric"
                                value={globalTopGapEmpty || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || /^\d+$/.test(v)) {
                                    handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, topGap: v === '' ? 0 : parseInt(v, 10) } as any });
                                  }
                                }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                              />
                            </div>
                          </>
                        ) : (
                          <div style={numCellStyle}>
                            <span style={numLabelStyle}>상단갭</span>
                            <input
                              type="text" inputMode="numeric"
                              value={globalTopGapEmpty || ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || /^\d+$/.test(v)) {
                                  handleSpaceInfoUpdate({ frameSize: { ...spaceInfo.frameSize, topGap: v === '' ? 0 : parseInt(v, 10) } as any });
                                }
                              }}
                              style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>걸레받이</h3>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}
                    >
                      <input
                        type="checkbox"
                        checked={baseEnabledEmpty}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          handleSpaceInfoUpdate({
                            baseConfig: {
                              ...spaceInfo.baseConfig,
                              type: enabled ? 'floor' : 'stand',
                              placementType: enabled ? 'ground' : 'float',
                              height: enabled ? (globalBaseEmpty || 65) : 0,
                              ...(enabled ? { gap: 0 } : { floatHeight: globalFloatHeightEmpty })
                            } as any
                          });
                        }}
                        style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                      />
                      <span>전체</span>
                    </label>
                    <HelpBtn title="걸레받이" text="가구 아래쪽 받침대의 높이와 옵셋을 설정합니다." />
                  </div>
                  <div className={styles.subSetting}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                      <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                      <button
                        onClick={() => {
                          const nextEnabled = !baseEnabledEmpty;
                          handleSpaceInfoUpdate({
                            baseConfig: {
                              ...spaceInfo.baseConfig,
                              type: nextEnabled ? 'floor' : 'stand',
                              placementType: nextEnabled ? 'ground' : 'float',
                              height: nextEnabled ? (globalBaseEmpty || 65) : 0,
                              ...(nextEnabled ? { gap: 0 } : { floatHeight: globalFloatHeightEmpty })
                            } as any
                          });
                        }}
                        className={`${styles.miniToggle} ${baseEnabledEmpty ? styles.miniToggleActive : ''}`}
                      />
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        {baseEnabledEmpty ? (
                          <>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>size</span>
                              <input
                                type="text" inputMode="numeric"
                                value={Math.max(0, globalBaseEmpty - globalBaseGapEmpty) || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || /^\d+$/.test(v)) {
                                    handleSpaceInfoUpdate({ baseConfig: { ...spaceInfo.baseConfig, height: (v === '' ? 0 : parseInt(v, 10)) + globalBaseGapEmpty } });
                                  }
                                }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                              />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>옵셋</span>
                              <input
                                type="text" inputMode="numeric"
                                value={globalBaseOffsetEmpty || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                    handleSpaceInfoUpdate({ baseConfig: { ...spaceInfo.baseConfig, offset: v === '' || v === '-' ? 0 : parseInt(v, 10) } as any });
                                  }
                                }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                              />
                            </div>
                            <div style={numCellStyle}>
                              <span style={numLabelStyle}>갭</span>
                              <input
                                type="text" inputMode="numeric"
                                value={globalBaseGapEmpty || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || /^\d+$/.test(v)) {
                                    handleSpaceInfoUpdate({ baseConfig: { ...spaceInfo.baseConfig, gap: v === '' ? 0 : parseInt(v, 10) } as any });
                                  }
                                }}
                                style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                              />
                            </div>
                          </>
                        ) : (
                          <div style={numCellStyle}>
                            <span style={numLabelStyle}>띄움높이</span>
                            <input
                              type="text" inputMode="numeric"
                              value={globalFloatHeightEmpty || ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || /^\d+$/.test(v)) {
                                  handleSpaceInfoUpdate({
                                    baseConfig: {
                                      ...spaceInfo.baseConfig,
                                      type: 'stand',
                                      placementType: 'float',
                                      height: 0,
                                      floatHeight: v === '' ? 0 : parseInt(v, 10)
                                    } as any
                                  });
                                }
                              }}
                              style={{ ...numInputStyle, color: 'var(--theme-text-primary)' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          }
          const sorted = [...slotMods].sort((a, b) => a.position.x - b.position.x);
          const toAlpha = (n: number) => String.fromCharCode(64 + n);
          const globalTop = spaceInfo.frameSize?.top ?? 30;
          const globalBase = spaceInfo.baseConfig?.height ?? 65;

          const renderSlotFrameRow = (
            label: string, enabled: boolean, sizeMM: number, offset: number,
            onToggle: () => void, onSizeChange: (v: number) => void, onOffsetChange: (v: number) => void, hlKey: string,
            gap?: number, onGapChange?: (v: number) => void,
            splitGapFromSize = false,
          ) => {
            const gapMM = Math.max(0, gap ?? 0);
            const displaySizeMM = splitGapFromSize ? Math.max(0, sizeMM - gapMM) : sizeMM;
            const commitDisplaySize = (nextDisplaySize: number) => {
              onSizeChange(splitGapFromSize ? nextDisplaySize + gapMM : nextDisplaySize);
            };
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
              <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>{label}</span>
              <button
                onClick={onToggle}
                className={`${styles.miniToggle} ${enabled ? styles.miniToggleActive : ''}`}
              />
              {enabled ? (
                <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>size</span>
                    <input
                      type="text" inputMode="numeric"
                      value={displaySizeMM || ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(hlKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          commitDisplaySize(Math.max(0, Math.min(9999, (displaySizeMM || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d+$/.test(v)) commitDisplaySize(v === '' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        commitDisplaySize(Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
                    <input
                      type="text" inputMode="numeric"
                      value={offset} placeholder="0"
                      onFocus={() => setHighlightedFrame(hlKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onOffsetChange(Math.max(-200, Math.min(200, (offset || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || v === '-' || /^-?\d+$/.test(v)) onOffsetChange(v === '' || v === '-' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        onOffsetChange(Math.max(-200, Math.min(200, parseInt(e.target.value) || 0)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                  {typeof onGapChange === 'function' && (
                    <div className={styles.frameItemInput} style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>갭</span>
                      <input
                        type="text" inputMode="numeric"
                        value={(gap ?? 0) !== 0 ? gap : ''} placeholder="0"
                        onFocus={() => setHighlightedFrame(hlKey)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const delta = e.key === 'ArrowUp' ? 1 : -1;
                            onGapChange(Math.max(0, Math.min(2000, (gap || 0) + delta)));
                          }
                        }}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || /^\d+$/.test(v)) onGapChange(v === '' ? 0 : parseInt(v, 10));
                        }}
                        onBlur={(e) => {
                          setHighlightedFrame(null);
                          onGapChange(Math.max(0, Math.min(2000, parseInt(e.target.value) || 0)));
                        }}
                        className={styles.frameNumberInput}
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            );
          };

          const renderSlotBaseFrameRow = (
            mod: typeof sorted[0],
            label: string,
          ) => {
            const enabled = mod.hasBase !== false;
            const isLower = mod.moduleId?.startsWith('lower-') || mod.moduleId?.includes('-lower-');
            const bfMin = isLower ? 60 : 40;
            const bfMax = isLower ? 150 : 100;
            const bfDefault = isLower ? 105 : 60;
            const baseGap = Math.max(0, (mod as any).baseFrameGap ?? 0);
            const rawBaseHeight = mod.baseFrameHeight ?? bfDefault;
            const visibleBaseHeight = Math.max(0, rawBaseHeight - baseGap);
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>{label}</span>
                <button
                  onClick={() => {
                    updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, {
                      hasBase: !enabled,
                      doorBottomGap: !enabled ? 25 : -5,
                      ...(enabled ? { individualFloatHeight: 0 } : {}),
                    }));
                  }}
                  className={`${styles.miniToggle} ${enabled ? styles.miniToggleActive : ''}`}
                />
                {enabled ? (
                  <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                    <div className={styles.frameItemInput} style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>size</span>
                      <input
                        type="text" inputMode="numeric"
                        value={visibleBaseHeight || ''} placeholder="0"
                        onFocus={() => setHighlightedFrame(`base-${mod.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            updatePlacedModule(mod.id, getBaseFrameSizeUpdates(mod, Math.max(bfMin, Math.min(bfMax, visibleBaseHeight + (e.key === 'ArrowUp' ? 1 : -1))) + baseGap));
                          }
                        }}
                        onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) { const num = v === '' ? 0 : parseInt(v, 10); updatePlacedModule(mod.id, getBaseFrameSizeUpdates(mod, (num > bfMax ? bfMax : num) + baseGap)); } }}
                        onBlur={(e) => { setHighlightedFrame(null); updatePlacedModule(mod.id, getBaseFrameSizeUpdates(mod, Math.max(bfMin, Math.min(bfMax, parseInt(e.target.value) || bfDefault)) + baseGap)); }}
                        className={styles.frameNumberInput}
                      />
                    </div>
                    <div className={styles.frameItemInput} style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
                      <input
                        type="text" inputMode="numeric"
                        value={mod.baseFrameOffset ?? (isLower ? 65 : 0)} placeholder={String(isLower ? 65 : 0)}
                        onFocus={() => setHighlightedFrame(`base-${mod.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const cur = mod.baseFrameOffset ?? (isLower ? 65 : 0);
                            updatePlacedModule(mod.id, { baseFrameOffset: Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1))) });
                          }
                        }}
                        onChange={(e) => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d+$/.test(v)) updatePlacedModule(mod.id, { baseFrameOffset: v === '' || v === '-' ? 0 : parseInt(v, 10) }); }}
                        onBlur={(e) => { setHighlightedFrame(null); updatePlacedModule(mod.id, { baseFrameOffset: Math.max(-200, Math.min(200, parseInt(e.target.value) || (isLower ? 65 : 0))) }); }}
                        className={styles.frameNumberInput}
                      />
                    </div>
                    <div className={styles.frameItemInput} style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>갭</span>
                      <input
                        type="text" inputMode="numeric"
                        value={((mod as any).baseFrameGap ?? 0) || ''} placeholder="0"
                        onFocus={() => setHighlightedFrame(`base-${mod.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const cur = (mod as any).baseFrameGap ?? 0;
                            updatePlacedModule(mod.id, { baseFrameGap: Math.max(0, Math.min(2000, cur + (e.key === 'ArrowUp' ? 1 : -1))) } as any);
                          }
                        }}
                        onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) updatePlacedModule(mod.id, { baseFrameGap: v === '' ? 0 : parseInt(v, 10) } as any); }}
                        onBlur={(e) => { setHighlightedFrame(null); updatePlacedModule(mod.id, { baseFrameGap: Math.max(0, Math.min(2000, parseInt(e.target.value) || 0)) } as any); }}
                        className={styles.frameNumberInput}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                    <div className={styles.frameItemInput} style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>띄움</span>
                      <input
                        type="text" inputMode="numeric"
                        value={(mod.individualFloatHeight ?? 0) || ''} placeholder="0"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const cur = mod.individualFloatHeight ?? 0;
                            updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, { individualFloatHeight: Math.max(0, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1))) }));
                          }
                        }}
                        onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, { individualFloatHeight: v === '' ? 0 : parseInt(v, 10) })); }}
                        onBlur={(e) => { updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, { individualFloatHeight: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })); }}
                        className={styles.frameNumberInput}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          };

          const isMergeMode = false; // 설계 과정에서는 항상 분절 (병합은 CNC 내보내기 시에만)

          // 병합 모드 전용 렌더 함수 (너비 + 높이 + 옵셋)
          const renderMergedFrameRow = (
            label: string, enabled: boolean, widthMM: number, heightMM: number, offset: number,
            onToggle: () => void, onHeightChange: (v: number) => void, onOffsetChange: (v: number) => void, hlKey: string,
            isLowerCategory = false,
          ) => {
            const bfMin = isLowerCategory ? 60 : 40;
            const bfMax = isLowerCategory ? 150 : 100;
            const bfDefault = isLowerCategory ? 105 : 60;
            return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
              <span className={styles.frameItemLabel} style={{ minWidth: '50px', textAlign: 'left', margin: 0 }}>{label}</span>
              <button
                onClick={onToggle}
                className={`${styles.miniToggle} ${enabled ? styles.miniToggleActive : ''}`}
              />
              {enabled ? (
                <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>너비</span>
                    <input
                      type="text" inputMode="numeric"
                      value={widthMM || ''} readOnly
                      onFocus={() => setHighlightedFrame(hlKey)}
                      onBlur={() => setHighlightedFrame(null)}
                      className={styles.frameNumberInput}
                      style={{ color: 'var(--theme-text-secondary)', cursor: 'default' }}
                    />
                  </div>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>높이</span>
                    <input
                      type="text" inputMode="numeric"
                      value={heightMM || ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(hlKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onHeightChange(Math.max(bfMin, Math.min(bfMax, (heightMM || bfDefault) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d+$/.test(v)) {
                          const num = v === '' ? 0 : parseInt(v, 10);
                          onHeightChange(num > bfMax ? bfMax : num);
                        }
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        onHeightChange(Math.max(bfMin, Math.min(bfMax, parseInt(e.target.value) || bfDefault)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
                    <input
                      type="text" inputMode="numeric"
                      value={offset} placeholder={String(isLowerCategory ? 65 : 0)}
                      onFocus={() => setHighlightedFrame(hlKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onOffsetChange(Math.max(-200, Math.min(200, (offset || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || v === '-' || /^-?\d+$/.test(v)) onOffsetChange(v === '' || v === '-' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        onOffsetChange(Math.max(-200, Math.min(200, parseInt(e.target.value) || (isLowerCategory ? 65 : 0))));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
          };

          // 병합 모드: computeFrameMergeGroups 사용
          if (isMergeMode) {
            if (spaceInfo.isIsland) return null;
            const topGroups = computeFrameMergeGroups(slotMods, 'top');
            const baseGroups = computeFrameMergeGroups(slotMods, 'base');

            return (
              <div className={styles.configSection}>
                <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                  <span className={styles.sectionDot}></span>
                  <h3 className={styles.sectionTitle}>상,걸래받이</h3>
                  <HelpBtn title="상,걸래받이" text="프레임 병합 모드: 병합 그룹 단위로 프레임을 설정합니다. 너비는 병합된 총 너비(읽기전용), 높이와 옵셋은 그룹 내 모든 가구에 일괄 적용됩니다." />
                </div>
                {true && (
                  <div className={styles.subSetting}>
                    {/* 상단몰딩 병합 그룹 */}
                    {topGroups.map((group, gIdx) => {
                      const groupMods = group.moduleIds.map(id => slotMods.find(m => m.id === id)!).filter(Boolean);
                      const firstMod = groupMods[0];
                      const allEnabled = groupMods.every(m => m.hasTopFrame !== false);
                      const firstIsUpper = firstMod?.moduleId?.includes('upper-cabinet') || firstMod?.moduleId?.startsWith('upper-');
                      const topOffsetDefault = (firstIsUpper && spaceInfo.surroundType === 'surround') ? 23 : 0;
                      return <React.Fragment key={`merged-top-${gIdx}`}>{renderMergedFrameRow(
                        group.label,
                        allEnabled,
                        group.totalWidthMm,
                        firstMod?.topFrameThickness ?? globalTop,
                        firstMod?.topFrameOffset ?? topOffsetDefault,
                        () => {
                          const newVal = !allEnabled;
                          group.moduleIds.forEach(id => {
                            const target = sorted.find(m => m.id === id);
                            updatePlacedModule(id, target ? getShelfSplitTopClearanceUpdates(target, {
                              hasTopFrame: newVal,
                              topFrameGap: newVal ? 0 : (computeShelfSplitTopDistance(target) ?? target.topFrameGap ?? 0),
                              doorTopGap: getTopDoorGapForFrameState(spaceInfo, newVal),
                            }) : { hasTopFrame: newVal, doorTopGap: getTopDoorGapForFrameState(spaceInfo, newVal) });
                          });
                        },
                        (v) => {
                          group.moduleIds.forEach(id => {
                            const target = sorted.find(m => m.id === id);
                            updatePlacedModule(id, target ? getShelfSplitTopClearanceUpdates(target, { topFrameThickness: v }) : { topFrameThickness: v });
                          });
                        },
                        (v) => { group.moduleIds.forEach(id => updatePlacedModule(id, { topFrameOffset: v })); },
                        `merged-top-${gIdx}`,
                      )}</React.Fragment>;
                    })}
                    {/* 상하부 구분선 */}
                    {spaceInfo.baseConfig?.type !== 'stand' && topGroups.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--theme-border, #e0e0e0)', margin: '6px 0' }} />
                    )}
                    {/* 걸래받이 병합 그룹 — stand 타입이면 숨김 */}
                    {spaceInfo.baseConfig?.type !== 'stand' && baseGroups.map((group, gIdx) => {
                      const groupMods = group.moduleIds.map(id => slotMods.find(m => m.id === id)!).filter(Boolean);
                      const firstMod = groupMods[0];
                      const allEnabled = groupMods.every(m => m.hasBase !== false);
                      const isLowerGroup = firstMod?.moduleId?.startsWith('lower-') || firstMod?.moduleId?.includes('-lower-');
                      return <React.Fragment key={`merged-base-${gIdx}`}>{renderMergedFrameRow(
                        group.label,
                        allEnabled,
                        group.totalWidthMm,
                        firstMod?.baseFrameHeight ?? globalBase,
                        firstMod?.baseFrameOffset ?? (isLowerGroup ? 65 : 0),
                        () => {
                          const newVal = !allEnabled;
                          group.moduleIds.forEach(id => {
                            const target = sorted.find(m => m.id === id);
                            updatePlacedModule(id, target ? getShelfSplitTopClearanceUpdates(target, {
                              hasBase: newVal,
                              doorBottomGap: newVal ? 25 : -5,
                              ...(newVal ? {} : { individualFloatHeight: 0 }),
                            }) : {
                              hasBase: newVal,
                              doorBottomGap: newVal ? 25 : -5,
                              ...(newVal ? {} : { individualFloatHeight: 0 }),
                            });
                          });
                        },
                        (v) => {
                          group.moduleIds.forEach(id => {
                            const target = sorted.find(m => m.id === id);
                            updatePlacedModule(id, target ? getShelfSplitTopClearanceUpdates(target, { baseFrameHeight: v }) : { baseFrameHeight: v });
                          });
                        },
                        (v) => { group.moduleIds.forEach(id => updatePlacedModule(id, { baseFrameOffset: v })); },
                        `merged-base-${gIdx}`,
                        !!isLowerGroup,
                      )}</React.Fragment>;
                    })}
                  </div>
                )}
              </div>
            );
          }

          // 비병합 모드: 상부/걸래받이 섹션 분리
          if (spaceInfo.isIsland) return null;
          let topNum = 0;
          let baseNum = 0;
          // 키큰장찬넬(insert-frame)은 채움재이므로 상단몰딩/걸레받이 전체 토글에서 제외 (전체 OFF 시 바닥 아래로 내려가는 문제 방지)
          const isInsertFrameSlot = (m: any) => typeof m.moduleId === 'string' && m.moduleId.includes('insert-frame');
          const topSortedMods = sorted.filter(m => !isInsertFrameSlot(m) && getModuleCategory(m) !== 'lower');
          const baseSortedMods = sorted.filter(m => !isInsertFrameSlot(m) && getModuleCategory(m) !== 'upper');
          // 통합 모드: '전체' 체크박스로 제어
          const allTopOn = topFrameAllMode;
          const allBaseOn = baseFrameAllMode;
          const toggleAllTop = () => {
            const next = !topFrameAllMode;
            setTopFrameAllMode(next);
            // 통합모드 진입/해제 모두 개별행 ON 상태로 복구
            topSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
              hasTopFrame: true,
              topFrameGap: 0,
              doorTopGap: getTopDoorGapForFrameState(spaceInfo, true)
            })));
          };
          const toggleAllBase = () => {
            const next = !baseFrameAllMode;
            setBaseFrameAllMode(next);
            // 통합모드 진입/해제 모두 개별행 ON 상태로 복구
            baseSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
              hasBase: true,
              doorBottomGap: 25,
            })));
          };
          return (
            <>
              {/* 상단몰딩 섹션 */}
              <div className={styles.configSection}>
                <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                  <span className={styles.sectionDot}></span>
                  <h3 className={styles.sectionTitle}>상단몰딩</h3>
                  <label
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}
                  >
                    <input type="checkbox" checked={allTopOn} onChange={toggleAllTop} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                    <span>전체</span>
                  </label>
                  <HelpBtn title="상단몰딩" text="각 가구별 상단 몰딩을 개별 설정합니다. 토글로 표시/숨김, size로 높이, 옵셋으로 Z축 위치를 조정합니다." />
                </div>
                {true && (
                  <div className={styles.subSetting}>
                    {allTopOn && topSortedMods.length > 0 ? (
                      // 전체 ON: 통합 행 1개만 표시 — OFF 시 상단갭 필드 표시
                      (() => {
                        const firstTop = topSortedMods[0];
                        const catFirst = getModuleCategory(firstTop);
                        const topOffsetDefaultU = (catFirst === 'upper' && spaceInfo.surroundType === 'surround') ? 23 : 0;
                        const unifiedEnabled = topSortedMods.every(m => m.hasTopFrame !== false);
                        if (unifiedEnabled) {
                        return renderSlotFrameRow(
                          '전체',
                          unifiedEnabled,
                          computeShelfSplitTopDistance(firstTop) ?? (firstTop.topFrameThickness ?? globalTop),
                          firstTop.topFrameOffset ?? topOffsetDefaultU,
                          () => {
                            const newVal = !unifiedEnabled;
                            topSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
                              hasTopFrame: newVal,
                              doorTopGap: getTopDoorGapForFrameState(spaceInfo, newVal),
                              topFrameGap: newVal ? 0 : (computeShelfSplitTopDistance(m) ?? m.topFrameGap ?? 0),
                            })));
                          },
                          (v) => {
                            topSortedMods.forEach(m => updatePlacedModule(m.id, getTopFrameSizeUpdates(m, v)));
                          },
                          (v) => {
                            topSortedMods.forEach(m => updatePlacedModule(m.id, { topFrameOffset: v }));
                          },
                          'top-all',
                          firstTop.topFrameGap ?? 0,
                          (v) => {
                            topSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: Math.max(0, v) })));
                          },
                          true,
                        );
                        }
                        // OFF 상태: 상단갭 = 공간높이 - 가구높이 - 걸래받이 - 바닥마감재 - 띄움 (실제 빈 공간)
                        const floorFinishH = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
                        const bottomPortion = firstTop.hasBase === false
                          ? (firstTop.individualFloatHeight ?? 0)
                          : (firstTop.baseFrameHeight ?? globalBase);
                        const furnitureActualH = firstTop.freeHeight
                          ?? firstTop.customHeight
                          ?? (() => {
                            const md = getModuleById(firstTop.moduleId, { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth }, spaceInfo);
                            return md?.dimensions.height ?? 0;
                          })();
                        const computedGap = Math.max(0, spaceInfo.height - furnitureActualH - bottomPortion - floorFinishH);
                        const currentGap = firstTop.topFrameGap ?? computeShelfSplitTopDistance(firstTop) ?? computedGap;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                            <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                            <button
                              onClick={() => {
                                topSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { hasTopFrame: true, topFrameGap: 0, doorTopGap: getTopDoorGapForFrameState(spaceInfo, true) })));
                              }}
                              className={styles.miniToggle}
                            />
                            <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                              <div className={styles.frameItemInput} style={{ flex: 1 }}>
                                <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>상단갭</span>
                                <input
                                  type="text" inputMode="numeric"
                                  value={currentGap || ''} placeholder="0"
                                  onKeyDown={(e) => {
                                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      const nextGap = Math.max(0, Math.min(2000, currentGap + (e.key === 'ArrowUp' ? 1 : -1)));
                                      topSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: nextGap })));
                                    }
                                  }}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '' || /^\d+$/.test(v)) {
                                      const nextGap = v === '' ? 0 : parseInt(v, 10);
                                      topSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: nextGap })));
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const nextGap = Math.max(0, Math.min(2000, parseInt(e.target.value) || 0));
                                    topSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { topFrameGap: nextGap })));
                                  }}
                                  className={styles.frameNumberInput}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      sorted.map((mod) => {
                        const cat = getModuleCategory(mod);
                        if (cat === 'lower') return null;
                        topNum++;
                        const topOffsetDefault = (cat === 'upper' && spaceInfo.surroundType === 'surround') ? 23 : 0;
                        return <React.Fragment key={`top-${mod.id}`}>{renderSlotFrameRow(
                          `${toAlpha(topNum)}(상)`,
                          mod.hasTopFrame !== false,
                          computeShelfSplitTopDistance(mod) ?? (mod.topFrameThickness ?? globalTop),
                          mod.topFrameOffset ?? topOffsetDefault,
                          () => {
                            const newVal = !(mod.hasTopFrame !== false);
                            updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, {
                              hasTopFrame: newVal,
                              topFrameGap: newVal ? 0 : (computeShelfSplitTopDistance(mod) ?? mod.topFrameGap ?? 0),
                              doorTopGap: getTopDoorGapForFrameState(spaceInfo, newVal)
                            }));
                          },
                          (v) => updatePlacedModule(mod.id, getTopFrameSizeUpdates(mod, v)),
                          (v) => updatePlacedModule(mod.id, { topFrameOffset: v }),
                          `top-${mod.id}`,
                          mod.hasTopFrame === false ? (computeShelfSplitTopDistance(mod) ?? mod.topFrameGap ?? 0) : (mod.topFrameGap ?? 0),
                          (v) => updatePlacedModule(mod.id, getShelfSplitTopClearanceUpdates(mod, { topFrameGap: Math.max(0, v) })),
                          mod.hasTopFrame !== false,
                        )}</React.Fragment>;
                      })
                    )}
                  </div>
                )}
              </div>
              {/* 걸래받이 섹션 (stand 타입 제외) */}
              {spaceInfo.baseConfig?.type !== 'stand' && (
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader} style={{ userSelect: 'none' }}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>걸래받이</h3>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}
                    >
                      <input type="checkbox" checked={allBaseOn} onChange={toggleAllBase} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                      <span>전체</span>
                    </label>
                    <HelpBtn title="걸래받이" text="각 가구별 걸래받이(베이스)을 개별 설정합니다. 토글로 표시/숨김, size로 높이, 옵셋으로 Z축 위치를 조정합니다." />
                    <IoIosArrowDropup style={{ marginLeft: 'auto', fontSize: '14px', color: 'var(--theme-text-secondary)', transition: 'transform 0.2s', transform: isFrameSectionCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </div>
                  {!isFrameSectionCollapsed && (
                    <div className={styles.subSetting}>
                      {allBaseOn && baseSortedMods.length > 0 ? (
                        // 전체 ON: 통합 행 1개만 표시 — OFF 시 띄움 높이 필드 표시
                        (() => {
                          const first = baseSortedMods[0];
                          const firstOffsetDefault = ((first.moduleId?.startsWith('lower-') || first.moduleId?.includes('-lower-')) ? 65 : 0);
                          const unifiedEnabled = baseSortedMods.every(m => m.hasBase !== false);
                          if (unifiedEnabled) {
                            return renderSlotFrameRow(
                              '전체',
                              unifiedEnabled,
                              first.baseFrameHeight ?? globalBase,
                              first.baseFrameOffset ?? firstOffsetDefault,
                              () => {
                                // 하부 OFF (상단몰딩 건드리지 않음)
                                baseSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
                                  hasBase: false,
                                  individualFloatHeight: 0,
                                  doorBottomGap: -5,
                                })));
                              },
                              (v) => {
                                baseSortedMods.forEach(m => updatePlacedModule(m.id, getBaseFrameSizeUpdates(m, v)));
                              },
                              (v) => {
                                baseSortedMods.forEach(m => updatePlacedModule(m.id, { baseFrameOffset: v }));
                              },
                              'base-all',
                              (first as any).baseFrameGap ?? 0,
                              (v) => {
                                baseSortedMods.forEach(m => updatePlacedModule(m.id, { baseFrameGap: Math.max(0, v) } as any));
                              },
                              true,
                            );
                          }
                          // OFF 상태: 토글 + 띄움 높이 입력
                          const currentFloat = first.individualFloatHeight ?? 0;
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                              <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>전체</span>
                              <button
                                onClick={() => {
                                  // 하부 ON 복귀 (상단몰딩 건드리지 않음)
                                  baseSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, {
                                    hasBase: true,
                                    doorBottomGap: 25,
                                  })));
                                }}
                                className={styles.miniToggle}
                              />
                              <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                                <div className={styles.frameItemInput} style={{ flex: 1 }}>
                                  <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>띄움</span>
                                  <input
                                    type="text" inputMode="numeric"
                                    value={currentFloat || ''} placeholder="0"
                                    onKeyDown={(e) => {
                                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = first.individualFloatHeight ?? 0;
                                        const next = Math.max(0, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                        baseSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { individualFloatHeight: next })));
                                      }
                                    }}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v === '' || /^\d+$/.test(v)) {
                                        const num = v === '' ? 0 : parseInt(v, 10);
                                        baseSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { individualFloatHeight: num })));
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const num = Math.max(0, Math.min(500, parseInt(e.target.value) || 0));
                                      baseSortedMods.forEach(m => updatePlacedModule(m.id, getShelfSplitTopClearanceUpdates(m, { individualFloatHeight: num })));
                                    }}
                                    className={styles.frameNumberInput}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        sorted.map((mod) => {
                          const cat = getModuleCategory(mod);
                          if (cat === 'upper') return null;
                          baseNum++;
                          return <React.Fragment key={`base-${mod.id}`}>{renderSlotBaseFrameRow(
                            mod,
                            `${toAlpha(baseNum)}(하)`,
                          )}</React.Fragment>;
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {/* 도어 셋팅: 도어 가구 존재 시 */}
        {showDoorSetup && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>도어 셋팅</h3>
              {/* 표시 기준 토글 (몸통 / 천장·바닥) */}
              {hasDoorGapSyncTargets && (
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer', marginLeft: '8px' }}
                >
                  <input
                    type="checkbox"
                    checked={doorGapAllSync}
                    onChange={(e) => setDoorGapAllSync(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                  />
                  <span>전체</span>
                </label>
              )}
              <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
                <button
                  type="button"
                  onClick={() => setDoorGapRefMode('body')}
                  style={{
                    padding: '2px 6px', fontSize: '10px',
                    background: doorGapRefMode === 'body' ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-bg-secondary, #f0f0f0)',
                    color: doorGapRefMode === 'body' ? 'white' : 'var(--theme-text-primary)',
                    border: '1px solid var(--theme-border)', borderRadius: '3px', cursor: 'pointer', fontWeight: 600,
                  }}
                >몸통</button>
                <button
                  type="button"
                  onClick={() => setDoorGapRefMode('cf')}
                  style={{
                    padding: '2px 6px', fontSize: '10px',
                    background: doorGapRefMode === 'cf' ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-bg-secondary, #f0f0f0)',
                    color: doorGapRefMode === 'cf' ? 'white' : 'var(--theme-text-primary)',
                    border: '1px solid var(--theme-border)', borderRadius: '3px', cursor: 'pointer', fontWeight: 600,
                  }}
                >천장·바닥</button>
              </div>
              <HelpBtn title="도어 셋팅" text="상걸래받이 섹션에서 '상하프레임 가림' 또는 '상하프레임 노출'을 선택하면 도어 갭이 자동 계산됩니다." />
            </div>

            {/* Close/Open 토글 → ViewerControls 상단바로 이동됨 */}

            {/* 전체 ON: 통합 상단갭/하단갭 입력 1쌍 */}
            {doorGapAllSync && hasDoorGapSyncTargets && (
              <div style={{ marginTop: '8px' }}>
                {renderDoorCategorySyncTable()}
              </div>
            )}

            {/* 키큰장 도어 테이블 (전체 OFF 시에만) */}
            {!doorGapAllSync && fullDoorIndices.length > 0 && (
              <div style={{ marginTop: '8px', overflowX: 'auto' }}>
                {visiblePartialDoorSettingEntries.length > 0 && <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--theme-text-secondary, #666)', marginBottom: '4px' }}>키큰장</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '52px', padding: '2px 4px', fontSize: '10px', fontWeight: 500, color: 'var(--theme-text-secondary, #999)', textAlign: 'center', whiteSpace: 'nowrap' }}></th>
                      {fullDoorIndices.map(({ info, i }) => (
                        <th key={i} style={{ padding: '2px 2px', fontSize: '10px', fontWeight: 600, color: 'var(--theme-text-secondary, #666)', textAlign: 'center' }}>
                          도어 {info.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>상단갭</td>
                      {fullDoorIndices.map(({ i }) => {
                        const mod = doorFurnitureList[i];
                        const { topDistance } = computeRefDistances(mod);
                        return <DoorGapInput key={`top-${mod.id}-${doorGapRefMode}`} moduleId={mod.id} field="doorTopGap"
                          storeValue={mod.doorTopGap ?? 5}
                          onCommit={handleIndividualDoorGapChange}
                          referenceMode={doorGapRefMode}
                          refDistanceMm={topDistance} />;
                      })}
                    </tr>
                    <tr>
                      <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>하단갭</td>
                      {fullDoorIndices.map(({ i }) => {
                        const mod = doorFurnitureList[i];
                        const { bottomDistance } = computeRefDistances(mod);
                        return <DoorGapInput key={`bot-${mod.id}-${doorGapRefMode}`} moduleId={mod.id} field="doorBottomGap"
                          storeValue={mod.doorBottomGap ?? 25}
                          onCommit={handleIndividualDoorGapChange}
                          referenceMode={doorGapRefMode}
                          refDistanceMm={bottomDistance} />;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 상부장 / 하부장 도어 테이블 */}
            {renderDoorGapEntriesTable('상부장 도어', visibleUpperDoorSettingEntries, fullDoorIndices.length > 0 ? '12px' : '8px')}
            {renderDoorGapEntriesTable('하부장 도어', visibleLowerDoorSettingEntries, (fullDoorIndices.length > 0 || visibleUpperDoorSettingEntries.length > 0) ? '12px' : '8px')}

          </div>
        )}

        {/* 받침대 — 숨김 처리 (상/걸래받이 섹션에서 설정 가능) */}
        {/* <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>받침대</h3>
            <HelpBtn title="받침대" text="가구 하단 받침대의 높이와 깊이를 설정합니다. 개별 가구의 받침대 제거 및 띄움은 가구 선택 후 우측 패널에서 설정할 수 있습니다." />
          </div>
          <BaseControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
            disabled={hasSpecialDualFurniture}
          />
        </div> */}

        {/* 바닥마감재 (아일랜드 모드 숨김) */}
        {!spaceInfo.isIsland && (
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>바닥마감재 상태</h3>
            <HelpBtn title="바닥마감재 상태" text="가구 설치 후 바닥에 마감재(마루, 타일 등)를 시공할 예정인지 설정합니다. '있음'으로 설정하면 가구 하단에 바닥재 두께(약 10~15mm)만큼 여유 공간을 확보하여, 나중에 마감재를 가구 아래로 밀어넣을 수 있도록 합니다." />
          </div>
          <FloorFinishControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
          />
        </div>
        )}

        {/* 가구재 두께 설정 (15 / 15.5 / 18 / 18.5 mm) */}
        {(
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>가구재 두께</h3>
          </div>
          <div className={styles.toggleButtonGroup}>
            {[15, 15.5, 18, 18.5].map((thickness) => (
              <button
                key={thickness}
                className={`${styles.toggleButton} ${(spaceInfo.panelThickness ?? 18) === thickness ? styles.toggleButtonActive : ''}`}
                onClick={() => {
                  handleSpaceInfoUpdate({ panelThickness: thickness });
                  // 백패널/서랍 바닥재는 가구재 18.5T와 무관하게 3/4.5/6/9T 기준을 유지한다.
                  const bpMap: Record<number, number> = { 3.5: 3, 5: 6, 5.5: 6, 9.5: 9 };
                  const allMods = placedModules.filter(m => !m.isSurroundPanel);
                  allMods.forEach(m => {
                    const cur = m.backPanelThickness ?? 9;
                    const mapped = bpMap[cur] ?? cur;
                    if (cur !== mapped) updatePlacedModule(m.id, { backPanelThickness: mapped });
                  });
                }}
              >
                {thickness}mm
              </button>
            ))}
          </div>
        </div>
        )}

        {/* 백패널 두께 설정 — 모든 가구에 일괄 적용 */}
        {(() => {
          const bpMods = placedModules.filter(m => !m.isSurroundPanel);
          if (bpMods.length === 0) return null;
          const rawCurrentBpThickness = bpMods[0]?.backPanelThickness ?? 9;
          const currentBpThickness = rawCurrentBpThickness === 9.5
            ? 9
            : rawCurrentBpThickness === 5 || rawCurrentBpThickness === 5.5
              ? 6
              : rawCurrentBpThickness === 3.5
                ? 3
                : rawCurrentBpThickness;
          return (
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>백패널 두께</h3>
              </div>
              <div className={styles.toggleButtonGroup}>
                {[3, 4.5, 6, 9].map((thickness) => (
                  <button
                    key={thickness}
                    className={`${styles.toggleButton} ${currentBpThickness === thickness ? styles.toggleButtonActive : ''}`}
                    onClick={() => {
                      bpMods.forEach(m => updatePlacedModule(m.id, { backPanelThickness: thickness }));
                    }}
                  >
                    {thickness}mm
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

      </div>
    );
  };

  // readonly 모드가 아닐 때만 로딩 화면 표시
  if (loading && !isReadOnly) {
    return (
      <LoadingSpinner
        fullscreen
        message="에디터를 준비하는 중..."
      />
    );
  }

  // 디버깅용 로그
// console.log('🔍 Configurator basicInfo.title:', basicInfo.title);
// console.log('🔍 currentProjectId:', currentProjectId);
// console.log('🔍 currentDesignFileName:', currentDesignFileName);
// console.log('🔍 basicInfo.title:', basicInfo.title);

  // 전역 함수 노출 (디버깅용) - window 객체에 직접 할당
  if (typeof window !== 'undefined') {
    (window as any).testSaveProject = async () => {
// console.log('💾💾💾 [테스트] 직접 저장 함수 호출');
      await saveProject();
    };

    // 현재 프로젝트의 모든 디자인 파일 목록 확인
    (window as any).listDesignFiles = async () => {
      if (!currentProjectId) {
        console.error('❌ 프로젝트 ID가 없습니다');
        return;
      }

      try {
        const { getDesignFiles } = await import('@/firebase/projects');
        const { designFiles, error } = await getDesignFiles(currentProjectId);

        if (error) {
          console.error('❌ 디자인 파일 목록 조회 실패:', error);
          return;
        }

// console.log('📁 현재 프로젝트의 디자인 파일 목록:');
        console.table(designFiles.map(f => ({
          ID: f.id,
          이름: f.name,
          생성일: new Date(f.createdAt).toLocaleString(),
          수정일: new Date(f.updatedAt).toLocaleString()
        })));

        return designFiles;
      } catch (error) {
        console.error('❌ 디자인 파일 목록 조회 중 오류:', error);
      }
    };

    // 디자인 파일 삭제
    (window as any).deleteDesignFile = async (designFileId: string) => {
      if (!currentProjectId) {
        console.error('❌ 프로젝트 ID가 없습니다');
        return;
      }

      if (!designFileId) {
        console.error('❌ 삭제할 디자인 파일 ID를 입력하세요');
// console.log('💡 사용법: window.deleteDesignFile("파일ID")');
// console.log('💡 파일 목록 확인: window.listDesignFiles()');
        return;
      }

      if (!confirm(`정말로 이 디자인 파일을 삭제하시겠습니까?\nID: ${designFileId}`)) {
// console.log('❌ 삭제 취소됨');
        return;
      }

      try {
        const { deleteDesignFile } = await import('@/firebase/projects');
        const { error } = await deleteDesignFile(designFileId, currentProjectId);

        if (error) {
          console.error('❌ 디자인 파일 삭제 실패:', error);
          return;
        }

// console.log('✅ 디자인 파일 삭제 성공:', designFileId);
// console.log('🔄 페이지를 새로고침하세요');
      } catch (error) {
        console.error('❌ 디자인 파일 삭제 중 오류:', error);
      }
    };

// console.log('💾 테스트: 브라우저 콘솔에서 window.testSaveProject()를 실행해보세요');
// console.log('📁 파일 목록: window.listDesignFiles()');
// console.log('🗑️ 파일 삭제: window.deleteDesignFile("파일ID")');
  }

  return (
    <div className={`${styles.configurator} ${isReadOnly ? responsiveStyles.readOnlyMode : ''}`}>
      {/* 헤더 */}
      <Header
        title={currentDesignFileName || urlDesignFileName || basicInfo.title || "새로운 디자인"}
        projectName={urlProjectName || basicInfo.title || "새로운 프로젝트"}
        folderName={currentFolderName}
        designFileName={currentDesignFileName || urlDesignFileName}
        projectId={currentProjectId}
        folderId={currentFolderId}
        designFileId={currentDesignFileId}
        owner={projectOwner}
        collaborators={collaborators}
        onSave={saveProject}
        onPrevious={handlePrevious}
        onHelp={handleHelp}
        onConvert={handleConvert}
        onLogout={isReadOnly ? undefined : handleLogout}
        onProfile={isReadOnly ? undefined : handleProfile}
        onShare={async () => {
          // 디자인이 저장되지 않았으면 먼저 자동 저장
          if (!currentDesignFileId) {
            const confirmSave = confirm('공유하기 전에 먼저 저장해야 합니다. 지금 저장하시겠습니까?');
            if (!confirmSave) return;

            // 저장 실행
            await handleSaveProject();

            // 저장 후에도 designFileId가 없으면 에러
            if (!currentDesignFileId) {
              alert('저장에 실패했습니다. 다시 시도해주세요.');
              return;
            }
          }

          // furniture 데이터가 있는지 확인
          if (placedModules.length === 0) {
            alert('⚠️ 공유할 가구 데이터가 없습니다. 가구를 배치한 후 공유해주세요.');
            return;
          }

          setIsShareModalOpen(true);
        }}
        saving={saving}
        saveStatus={saveStatus}
        hasDoorsInstalled={hasDoorsInstalled}
        onDoorInstallationToggle={handleDoorInstallation}
        onNewProject={handleNewDesign}
        onSaveAs={handleSaveAs}
        onProjectNameChange={handleProjectNameChange}
        onDesignFileNameChange={handleDesignFileNameChange}
        onFileTreeToggle={handleFileTreeToggle}
        isFileTreeOpen={isFileTreeOpen}
        onExportPDF={() => setIsConvertModalOpen(true)}
        onExport3D={handleExport3D}
        readOnly={isReadOnly}
        onMobileMenuToggle={handleMobileMenuToggle}
        showBorings={showBorings}
        onToggleBorings={toggleBorings}
        onBoringExport={() => setShowBoringExportDialog(true)}
        totalBorings={totalBorings}
        boringFurnitureCount={boringFurnitureCount}
      />

      {/* 에디터 파일 탭 바 */}
      {!isMobile && (
        <TabBar
          onTabSwitch={handleTabSwitch}
          onTabClose={handleTabClose}
          onNewDesign={handleNewDesign}
          onFileTreeToggle={handleFileTreeToggle}
          isFileTreeOpen={isFileTreeOpen}
          readOnly={isReadOnly || isDemoMode}
        />
      )}

      <div className={styles.mainContent}>
        {/* 파일 트리 오버레이 (대시보드 좌측바 스타일) */}
        <div
          className={`${styles.fileTreeOverlay} ${isFileTreeOpen ? styles.open : ''}`}
          onClick={() => setIsFileTreeOpen(false)}
        />
        <div className={`${styles.fileTreePanel} ${isFileTreeOpen ? styles.open : ''}`}>
          {/* 접기 버튼 */}
          <button
            className={styles.fileTreeFoldButton}
            onClick={() => setIsFileTreeOpen(false)}
            title="파일 트리 접기"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* 좌측: 프로젝트/폴더 트리 */}
          <NavigationPane
            projects={fileTreeProjects}
            folders={fileTreeFolders}
            currentProjectId={fileTreeSelectedProjectId || searchParams.get('projectId')}
            currentFolderId={fileTreeSelectedFolderId}
            activeMenu={fileTreeActiveMenu}
            showProjectTree
            autoExpandProjectId={searchParams.get('projectId')}
            onNavigate={async (projectId, folderId, _label) => {
              if (projectId) {
                setFileTreeSelectedProjectId(projectId);
                setFileTreeSelectedFolderId(folderId || null);
                try {
                  const { designFiles } = await getDesignFiles(projectId);
                  // 폴더 선택 시 해당 폴더의 파일만 필터링
                  if (folderId) {
                    setFileTreeDesignFiles(designFiles.filter(f => f.folderId === folderId));
                  } else {
                    setFileTreeDesignFiles(designFiles);
                  }
                } catch {
                  setFileTreeDesignFiles([]);
                }
              }
            }}
            onMenuChange={(menu) => {
              setFileTreeActiveMenu(menu);
            }}
          />
          {/* 우측: 선택 프로젝트의 디자인 파일 타일 목록 */}
          <div className={styles.fileTreeContent}>
            {fileTreeSelectedProjectId ? (
              fileTreeDesignFiles.length > 0 ? (
                <div className={styles.fileTreeFileList}>
                  {fileTreeDesignFiles.map(file => (
                    <button
                      key={file.id}
                      className={`${styles.fileTreeFileCard} ${searchParams.get('designFileId') === file.id ? styles.fileTreeFileCardActive : ''
                        }`}
                      onClick={async () => {
                        const navigationToken = ++tabNavigationTokenRef.current;
                        // 현재 파일 자동 저장
                        try { await saveCurrentDesignBeforeNavigation(); } catch { }
                        if (navigationToken !== tabNavigationTokenRef.current) return;
                        // 탭 추가 (프로젝트명 조회) — 닫힌 탭 기록에서 제거하여 재오픈 허용
                        const proj = fileTreeProjects.find(p => p.id === fileTreeSelectedProjectId);
                        useUIStore.getState().addTab({
                          projectId: fileTreeSelectedProjectId!,
                          projectName: proj?.title || '프로젝트',
                          designFileId: file.id,
                          designFileName: file.name,
                        });
                        navigate(`/configurator?projectId=${fileTreeSelectedProjectId}&designFileId=${file.id}`, { replace: true });
                        setIsFileTreeOpen(false);
                      }}
                    >
                      <div className={styles.fileTreeFileThumbnail}>
                        {file.thumbnail ? (
                          <img src={file.thumbnail} alt={file.name} />
                        ) : (
                          <div className={styles.fileTreeFilePlaceholder}>
                            <span>{file.spaceSize ? `${file.spaceSize.width}x${file.spaceSize.depth}` : ''}</span>
                          </div>
                        )}
                      </div>
                      <div className={styles.fileTreeFileInfo}>
                        <div className={styles.fileTreeFilePath}>
                          {(() => {
                            const proj = fileTreeProjects.find(p => p.id === fileTreeSelectedProjectId);
                            const folder = file.folderId ? fileTreeFolders[fileTreeSelectedProjectId!]?.find(f => f.id === file.folderId) : null;
                            const parts = [proj?.title || '프로젝트', folder?.name, file.name].filter(Boolean);
                            return parts.join(' > ');
                          })()}
                        </div>
                        <div className={styles.fileTreeFileMeta}>
                          {file.spaceSize ? `${file.spaceSize.width}x${file.spaceSize.depth}` : '-'}
                        </div>
                        <div className={styles.fileTreeFileMeta}>
                          {file.updatedAt?.toDate ? file.updatedAt.toDate().toLocaleDateString('ko-KR') : '-'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.fileTreeEmpty}>디자인 파일이 없습니다</div>
              )
            ) : (
              <div className={styles.fileTreeEmpty}>프로젝트를 선택하세요</div>
            )}
          </div>
        </div>

        {/* 좌측 사이드바 - 설계모드에서는 숨김, PC에서는 항상 표시 */}
        <>
          {/* 좌측 사이드바 토글 버튼 — 설계모드에서 숨김 */}
          {!isLayoutBuilderOpen && (
            <button
              className={`${styles.leftPanelToggle} ${activeSidebarTab ? styles.open : ''}`}
              onClick={() => setActiveSidebarTab(activeSidebarTab ? null : (isReadOnly ? 'material' : 'module'))}
              title={activeSidebarTab ? "사이드바 접기" : "사이드바 펼치기"}
            >
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d={activeSidebarTab ? "M6 1L1 6L6 11" : "M1 1L6 6L1 11"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* 사이드바 - 설계모드에서 숨김, 읽기 전용 모드에서는 재질 탭만 보임 */}
          {!isLayoutBuilderOpen && (
            <Sidebar
              activeTab={activeSidebarTab}
              onTabClick={handleSidebarTabClick}
              isOpen={!!activeSidebarTab}
              onToggle={() => setActiveSidebarTab(activeSidebarTab ? null : (isReadOnly ? 'material' : 'module'))}
              onSave={saveProject}
              readOnly={isReadOnly}
              owner={projectOwner}
              collaborators={collaborators}
              onAddCollaborator={() => setIsShareModalOpen(true)}
              onFileTreeToggle={handleFileTreeToggle}
              isFileTreeOpen={isFileTreeOpen}
              isIsland={!!spaceInfo.isIsland}
            />
          )}

          {/* 사이드바 컨텐츠 패널 — 설계모드에서 숨김 */}
          <div
            className={styles.sidebarContent}
            style={{
              transform: (activeSidebarTab && !isLayoutBuilderOpen) ? 'translateX(0) scale(1)' : 'translateX(-100%) scale(0.95)',
              opacity: (activeSidebarTab && !isLayoutBuilderOpen) ? 1 : 0,
              pointerEvents: (activeSidebarTab && !isLayoutBuilderOpen) ? 'auto' : 'none'
            }}
          >
            {/* 배치 모드 토글 */}
            {!isReadOnly && (
              <div className={styles.layoutModeToggle}>
                <button
                  className={`${styles.layoutModeBtn} ${!spaceInfo.customGuideMode && (spaceInfo.layoutMode || 'equal-division') === 'equal-division' ? styles.layoutModeActive : ''}`}
                  onClick={() => {
                    if (!spaceInfo.customGuideMode && (spaceInfo.layoutMode || 'equal-division') === 'equal-division') return;
                    // 가이드 모드/팝업에서 슬롯배치로 전환 시 가이드 팝업 닫기
                    window.dispatchEvent(new CustomEvent('free-placement-guide:close'));
                    if (placedModules.length > 0) {
                      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                      clearAllModules();
                      setSpaceInfo({ freeSurround: undefined });
                    }
                    const updates: Record<string, unknown> = { layoutMode: 'equal-division', customGuideMode: false, freePlacementGuides: [], freePlacementGuideEditing: false };
                    // 자유배치→슬롯 전환 시 이격거리 초기화 (노서라운드, 슬롯 정수화가 재계산)
                    if (spaceInfo.surroundType === 'no-surround') {
                      const wc = spaceInfo.wallConfig || { left: true, right: true };
                      updates.gapConfig = {
                        left: wc.left ? 1.5 : 0,
                        right: wc.right ? 1.5 : 0,
                        middle: 1.5,
                      };
                    }
                    // 자유배치→슬롯 전환 시 커튼박스/단내림 초기화
                    if (spaceInfo.droppedCeiling?.enabled) {
                      updates.droppedCeiling = {
                        enabled: false,
                        position: 'right',
                        width: DEFAULT_DROPPED_CEILING_VALUES.WIDTH,
                        dropHeight: DEFAULT_DROPPED_CEILING_VALUES.DROP_HEIGHT,
                      };
                    }
                    updates.curtainBox = { enabled: false, position: 'right', width: 150, dropHeight: 20 };
                    handleSpaceInfoUpdate(updates);
                  }}
                >
                  오토슬롯
                </button>
                {/* 커스텀슬롯 탭 */}
                <button
                  className={`${styles.layoutModeBtn} ${spaceInfo.customGuideMode ? styles.layoutModeActive : ''}`}
                  onClick={() => {
                    if (spaceInfo.customGuideMode) return;
                    // 가이드 모드 진입 시 기존 배치 가구는 모두 초기화
                    if (placedModules.length > 0) {
                      if (!window.confirm('커스텀슬롯으로 전환하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                      clearAllModules();
                    }
                    // 즉시 가이드 모드 활성화 (탭이 바로 커스텀슬롯으로 바뀜) + 가이드 생성 팝업 표시
                    setSpaceInfo({ customGuideMode: true });
                    window.dispatchEvent(new CustomEvent('free-placement-guide:toggle'));
                  }}
                >
                  커스텀슬롯
                </button>
                <button
                  className={`${styles.layoutModeBtn} ${!spaceInfo.customGuideMode && (spaceInfo.layoutMode || 'equal-division') === 'free-placement' ? styles.layoutModeActive : ''}`}
                  onClick={() => {
                    if (!spaceInfo.customGuideMode && (spaceInfo.layoutMode || 'equal-division') === 'free-placement') return;
                    // 가이드 모드/팝업에서 자유배치로 전환 시 가이드 팝업 닫기
                    window.dispatchEvent(new CustomEvent('free-placement-guide:close'));
                    if (placedModules.length > 0) {
                      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                      clearAllModules();
                      setSpaceInfo({ freeSurround: undefined });
                    }
                    useUIStore.getState().setGuideDepthEditMode(false);
                    const updates: Record<string, unknown> = { layoutMode: 'free-placement', customGuideMode: false, freePlacementGuides: [], freePlacementGuideEditing: false };
                    // 슬롯→자유배치 전환 시 이격거리 초기화 (노서라운드)
                    if (spaceInfo.surroundType === 'no-surround') {
                      const wc = spaceInfo.wallConfig || { left: true, right: true };
                      updates.gapConfig = {
                        left: wc.left ? 1.5 : 0,
                        right: wc.right ? 1.5 : 0,
                        middle: 1.5,
                      };
                    }
                    // 슬롯→자유배치 전환 시 단내림/커튼박스 초기화
                    if (spaceInfo.droppedCeiling?.enabled) {
                      updates.droppedCeiling = {
                        enabled: false,
                        position: 'right',
                        width: 150,
                        dropHeight: 100,
                      };
                    }
                    updates.curtainBox = { enabled: false, position: 'right', width: 150, dropHeight: 20 };
                    handleSpaceInfoUpdate(updates);
                  }}
                >
                  자유배치
                </button>
              </div>
            )}
            {renderSidebarContent()}
          </div>
        </>

        {/* 중앙 뷰어 영역 */}
        <div
          className={styles.viewerArea}
          data-main-viewer="true"
          style={isMobile ? {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: (activeMobileTab === 'modules' || activeMobileTab === 'column') ? '30%' : '54px',
            transition: 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: '0 8px',
          } : {
            position: 'absolute',
            left: isLayoutBuilderOpen ? '0' : (activeSidebarTab ? 'var(--sidebar-total-width, 304px)' : 'var(--sidebar-icon-width, 56px)'),
            right: isLayoutBuilderOpen ? '0' : (isReadOnly ? '0' : (isRightPanelOpen ? 'var(--right-panel-width, 320px)' : '0')),
            top: 0,
            bottom: 0,
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >

          {/* 모바일 툴바 */}
          {isMobile && !isReadOnly && (
            <MobileToolbar
              viewMode={viewMode as ViewMode}
              onViewModeChange={(mode) => {
                setViewMode(mode);
                if (mode === '2D') {
                  setRenderMode('wireframe');
                  setShowAll(false);
                } else if (mode === '3D') {
                  setRenderMode('solid');
                  setShowAll(true);
                }
              }}
              showDimensions={showDimensions}
              onToggleDimensions={toggleDimensions}
              showGuides={showGuides}
              onToggleGuides={toggleGuides}
            />
          )}

          {/* 뷰어 컨트롤 - 데스크탑용 */}
          {!isMobile && (
            <ViewerControls
              viewMode={viewMode as ViewMode}
              onViewModeChange={(mode) => {
                setViewMode(mode);
                if (mode === '2D') {
                  setRenderMode('wireframe');
                  setShowAll(false);
                } else if (mode === '3D') {
                  setRenderMode('solid');
                  setShowAll(true);
                }
              }}
              viewDirection={view2DDirection}
              onViewDirectionChange={setView2DDirection}
              renderMode={renderMode}
              onRenderModeChange={setRenderMode}
              showAll={showAll}
              onShowAllToggle={() => setShowAll(!showAll)}
              showDimensions={showDimensions}
              onShowDimensionsToggle={toggleDimensions}
              showDimensionsText={showDimensionsText}
              onShowDimensionsTextToggle={toggleDimensionsText}
              showGuides={showGuides}
              onShowGuidesToggle={toggleGuides}
              showAxis={showAxis}
              onShowAxisToggle={toggleAxis}
              showFurniture={showFurniture}
              onShowFurnitureToggle={() => {
// console.log('🎯 Configurator toggle - current:', showFurniture, '-> new:', !showFurniture);
                setShowFurniture(!showFurniture);
              }}
              doorsOpen={doorsOpen}
              onDoorsToggle={toggleDoors}
              hasDoorsInstalled={hasDoorsInstalled}
              onDoorInstallationToggle={handleDoorInstallation}
              surroundGenerated={(() => {
                const fs = spaceInfo.freeSurround;
                return fs ? (fs.left.enabled || fs.top.enabled || fs.right.enabled || (fs.middle?.some(m => m.enabled) ?? false)) : false;
              })()}
              onSurroundGenerate={() => {
                const fs = spaceInfo.freeSurround;
                const isActive = fs ? (fs.left.enabled || fs.top.enabled || fs.right.enabled || (fs.middle?.some(m => m.enabled) ?? false)) : false;

                if (isActive) {
                  // 서라운드 비활성화 — 기존 middle 데이터 유지하면서 enabled만 false
                  setSpaceInfo({
                    freeSurround: {
                      left: { ...fs!.left, enabled: false },
                      top: { ...fs!.top, enabled: false },
                      right: { ...fs!.right, enabled: false },
                      middle: fs!.middle?.map(m => ({ ...m, enabled: false })),
                    }
                  });
                  return;
                }

                // 서라운드 생성
                const result = generateSurround(spaceInfo, placedModules);
                if (!result.success) {
                  alert(result.errorMessage);
                  return;
                }
                setSpaceInfo({ freeSurround: result.config });
              }}
              frameMergeEnabled={spaceInfo.frameMergeEnabled ?? false}
              onFrameMergeToggle={() => {
                const isCurrentlyMerged = spaceInfo.frameMergeEnabled ?? false;
                if (isCurrentlyMerged) {
                  // 병합 → 분절: 안내 팝업
                  const confirmed = confirm('프레임을 분절하면 병합된 프레임이 개별 프레임으로 분리됩니다.\n분절하시겠습니까?');
                  if (!confirmed) return;
                }
                setSpaceInfo({ frameMergeEnabled: !isCurrentlyMerged });
              }}
              onStartGuideSetupInNewTab={handleStartGuideSetupInNewTab}
              guideSetupRequest={pendingGuideSetupDesignFileId === currentDesignFileId && searchParams.get('guideSetup') === '1'}
              onGuideSetupRequestHandled={handleGuideSetupRequestHandled}
            />
          )}

          {/* 3D 뷰어 */}
          <div className={`${styles.viewer} ${isMobile ? responsiveStyles.mobileViewer : ''}`} onMouseDown={() => { if (highlightedFrame) setHighlightedFrame(null); }}>
            {/* 상부장/하부장 전용 자유/균등 토글 (자유배치 + 상/하부 가구 배치 시) */}
            {!isMobile && spaceInfo.layoutMode === 'free-placement' && (() => {
              const dark = viewMode === '2D' && view2DTheme === 'dark';
              const hasUpper = placedModules.some(m => !m.isSurroundPanel && (m.moduleId?.startsWith('upper-') || m.moduleId?.includes('-upper-')));
              const hasLower = placedModules.some(m => !m.isSurroundPanel && (m.moduleId?.startsWith('lower-') || m.moduleId?.includes('-lower-')));
              if (!hasUpper && !hasLower) return null;
              const Pill = ({ equalOn, onToggle, topOffset }: { equalOn: boolean; onToggle: () => void; topOffset: string }) => (
                <div
                  style={{ position: 'absolute', top: topOffset, right: '120px', zIndex: 100, width: 90, height: 28, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', padding: 2, boxSizing: 'border-box', userSelect: 'none' }}
                >
                  <div style={{ position: 'absolute', top: 2, left: equalOn ? 46 : 2, width: 42, height: 24, borderRadius: 12, background: 'var(--theme-primary)', transition: 'left 0.2s', pointerEvents: 'none' }} />
                  <span onClick={() => { if (equalOn) onToggle(); }} style={{ position: 'relative', flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, color: !equalOn ? '#fff' : dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)', zIndex: 1, lineHeight: '24px', cursor: 'pointer' }}>자유</span>
                  <span onClick={() => { if (!equalOn) onToggle(); }} style={{ position: 'relative', flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, color: equalOn ? '#fff' : dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)', zIndex: 1, lineHeight: '24px', cursor: 'pointer' }}>균등</span>
                </div>
              );
              return (
                <>
                  {/* 상부장 토글: 상부장 높이 중간쯤 우측 (공간 높이 30% 지점) */}
                  {hasUpper && <Pill equalOn={equalDistributionUpper} onToggle={toggleEqualDistributionUpper} topOffset="30%" />}
                  {/* 하부장 토글: 하부장 높이 중간쯤 우측 (공간 높이 70% 지점) */}
                  {hasLower && <Pill equalOn={equalDistributionLower} onToggle={toggleEqualDistributionLower} topOffset="70%" />}
                </>
              );
            })()}

            {/* 가이드 깊이 상/하부 알약 토글 */}
            {spaceInfo?.customGuideMode && guideDepthEditMode && !isMobile && (() => {
              const dark = viewMode === '2D' && view2DTheme === 'dark';
              const isUpper = guideDepthZone === 'upper';
              return (
                <div
                  style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 116, height: 28, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', padding: 2, boxSizing: 'border-box', userSelect: 'none' }}
                >
                  <div style={{ position: 'absolute', top: 2, left: isUpper ? 2 : 58, width: 56, height: 24, borderRadius: 12, background: 'var(--theme-primary)', transition: 'left 0.2s', pointerEvents: 'none' }} />
                  <span
                    onClick={() => setGuideDepthZone('upper')}
                    style={{ position: 'relative', flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, color: isUpper ? '#fff' : dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)', zIndex: 1, lineHeight: '24px', cursor: 'pointer' }}
                  >상부장</span>
                  <span
                    onClick={() => setGuideDepthZone('lower')}
                    style={{ position: 'relative', flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, color: !isUpper ? '#fff' : dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)', zIndex: 1, lineHeight: '24px', cursor: 'pointer' }}
                  >하부장</span>
                </div>
              );
            })()}

            {/* 도어 Open/Close 알약 토글 */}
            {hasDoorsInstalled && !guideDepthEditMode && !isMobile && (() => {
              const isOpen = doorsOpen === true;
              const dark = viewMode === '2D' && view2DTheme === 'dark';
              return (
                <div
                  style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 90, height: 28, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', padding: 2, boxSizing: 'border-box', userSelect: 'none' }}
                >
                  {/* 슬라이딩 활성 배경 */}
                  <div style={{ position: 'absolute', top: 2, left: isOpen ? 46 : 2, width: 42, height: 24, borderRadius: 12, background: 'var(--theme-primary)', transition: 'left 0.2s', pointerEvents: 'none' }} />
                  {/* Close 라벨 — 닫기 전용 */}
                  <span
                    onClick={() => setDoorsOpen(false)}
                    style={{ position: 'relative', flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, color: !isOpen ? '#fff' : dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)', zIndex: 1, lineHeight: '24px', cursor: 'pointer' }}
                  >Close</span>
                  {/* Open 라벨 — 열기 전용 */}
                  <span
                    onClick={() => setDoorsOpen(true)}
                    style={{ position: 'relative', flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, color: isOpen ? '#fff' : dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)', zIndex: 1, lineHeight: '24px', cursor: 'pointer' }}
                  >Open</span>
                </div>
              );
            })()}
            {spaceInfo.isIsland ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 상단: 앞면 */}
                <div
                  style={{ flex: 1, position: 'relative', borderBottom: '2px solid var(--theme-border-strong, #cccccc)', minHeight: 0 }}
                  onMouseEnter={() => useUIStore.getState().setActiveIslandSide('front')}
                  onDragEnter={() => useUIStore.getState().setActiveIslandSide('front')}
                  onMouseDown={() => useUIStore.getState().setActiveIslandSide('front')}
                  onClick={() => useUIStore.getState().setActiveIslandSide('front')}
                >
                  <div style={{ position: 'absolute', top: 10, left: 12, padding: '4px 10px', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 4, zIndex: 5, pointerEvents: 'none' }}>앞면</div>
                  <Space3DView
                    key="island-front"
                    spaceInfo={spaceInfo}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    renderMode={renderMode}
                    showAll={showAll}
                    showFrame={showFrame}
                    svgSize={{ width: 800, height: 300 }}
                    activeZone={undefined}
                    readOnly={isReadOnly}
                    sceneRef={sceneRef}
                    islandViewSide="front"
                  />
                </div>
                {/* 하단: 반대편 */}
                <div
                  style={{ flex: 1, position: 'relative', minHeight: 0 }}
                  onMouseEnter={() => useUIStore.getState().setActiveIslandSide('back')}
                  onDragEnter={() => useUIStore.getState().setActiveIslandSide('back')}
                  onMouseDown={() => useUIStore.getState().setActiveIslandSide('back')}
                  onClick={() => useUIStore.getState().setActiveIslandSide('back')}
                >
                  <div style={{ position: 'absolute', top: 10, left: 12, padding: '4px 10px', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 4, zIndex: 5, pointerEvents: 'none' }}>반대편</div>
                  <Space3DView
                    key="island-back"
                    spaceInfo={spaceInfo}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    renderMode={renderMode}
                    showAll={showAll}
                    showFrame={showFrame}
                    svgSize={{ width: 800, height: 300 }}
                    activeZone={undefined}
                    readOnly={isReadOnly}
                    islandViewSide="back"
                  />
                </div>
              </div>
            ) : (
              <Space3DView
                key={`space3d-${spaceInfo.droppedCeiling?.enabled}-${spaceInfo.droppedCeiling?.position}-${spaceInfo.droppedCeiling?.width}-${spaceInfo.droppedCeiling?.dropHeight}-${spaceInfo.curtainBoxFinished}-${spaceInfo.stepCeiling?.enabled}-${spaceInfo.stepCeiling?.position}-${spaceInfo.stepCeiling?.width}-${spaceInfo.stepCeiling?.dropHeight}-${spaceInfo.curtainBox?.enabled}-${spaceInfo.curtainBox?.position}-${spaceInfo.curtainBox?.width}-${spaceInfo.curtainBox?.dropHeight}`}
                spaceInfo={spaceInfo}
                viewMode={viewMode}
                setViewMode={setViewMode}
                renderMode={renderMode}
                showAll={showAll}
                showFrame={showFrame}
                svgSize={{ width: 800, height: 600 }}
                activeZone={undefined} // 두 구간 모두 배치 가능하도록 undefined 전달
                readOnly={isReadOnly} // 읽기 전용 모드
                sceneRef={sceneRef} // GLB 내보내기용 씬 참조
              />
            )}

            {/* 커스텀 가구 설계모드 종료 버튼 — 뷰어 중앙 하단 */}
            {isLayoutBuilderOpen && (
              <button
                className={styles.exitDesignModeBtn}
                onClick={() => {
                  const wantSave = window.confirm(
                    '설계모드를 종료합니다.\n\n[확인] → 저장하고 돌아가기\n[취소] → 저장하지 않고 돌아가기'
                  );

                  if (wantSave) {
                    // "저장하고 돌아가기" — CustomizablePropertiesPanel이 감지하여 저장 처리
                    useUIStore.getState().setDesignExitSaveRequest(true);
                    return;
                  }

                  // "그냥 돌아가기" — 저장 없이 종료
                  const furnitureState = useFurnitureStore.getState();
                  const newlyPlacedId = furnitureState.newlyPlacedCustomModuleId;

                  if (newlyPlacedId) {
                    furnitureState.removeModule(newlyPlacedId);
                    furnitureState.setNewlyPlacedCustomModuleId(null);
                  }

                  const myCabinetState = useMyCabinetStore.getState();
                  if (myCabinetState.editingCabinetId && myCabinetState.editBackup) {
                    const { setPlacedModules: setModules } = furnitureState;
                    setModules(myCabinetState.editBackup.modules);
                    setSpaceInfo({ layoutMode: myCabinetState.editBackup.layoutMode });
                    myCabinetState.setEditBackup(null);
                  }
                  myCabinetState.setEditingCabinetId(null);
                  furnitureState.setFurniturePlacementMode(false);
                  furnitureState.setPendingCustomConfig(null);
                  closeAllPopups();
                  setLayoutBuilderOpen(false);
                }}
              >
                설계모드 종료
              </button>
            )}

            {/* 슬롯 분할 가이드 도움말 ? 아이콘 (자유배치 모드, 2D 모드에서는 숨김) */}
            {(spaceInfo.layoutMode || 'equal-division') !== 'free-placement' && viewMode !== '2D' && (
              <button
                ref={slotGuideBtnRef}
                className={`${styles.slotGuideHelpButton} ${isSlotGuideOpen ? styles.active : ''}`}
                onClick={() => setIsSlotGuideOpen(!isSlotGuideOpen)}
                title="슬롯 분할 가이드"
              >
                ?
              </button>
            )}

            {/* 슬롯 가이드 딤 오버레이 */}
            {isSlotGuideOpen && <div className={styles.slotGuideOverlay} />}

            {/* 슬롯 분할 가이드 설명 팝업 */}
            {isSlotGuideOpen && (() => {
              const totalW = spaceInfo.width;
              const isSurround = spaceInfo.surroundType === 'surround';
              const installType = spaceInfo.installType || 'builtin';
              const isBuiltin = installType === 'builtin' || installType === 'built-in';
              const isSemi = installType === 'semistanding' || installType === 'semi-standing';
              const isFree = installType === 'freestanding' || installType === 'free-standing';
              const wallLeft = spaceInfo.wallConfig?.left ?? true;
              const EP = 18; // 엔드패널 frameSize 기준값 (물리적 두께 18.5mm, 슬롯 계산은 18mm)

              // 내경 계산: 서라운드 vs 노서라운드
              let leftReduction = 0;
              let rightReduction = 0;
              let leftLabel = '';
              let rightLabel = '';
              let installLabel = '';

              if (isSurround) {
                const defaultFrame = 50;
                const frameL = spaceInfo.frameSize?.left !== undefined ? spaceInfo.frameSize.left : defaultFrame;
                const frameR = spaceInfo.frameSize?.right !== undefined ? spaceInfo.frameSize.right : defaultFrame;

                if (isBuiltin) {
                  leftReduction = frameL;
                  rightReduction = frameR;
                  leftLabel = `좌측 프레임 ${frameL}mm`;
                  rightLabel = `우측 프레임 ${frameR}mm`;
                  installLabel = '양쪽벽 (빌트인)';
                } else if (isSemi) {
                  if (wallLeft) {
                    leftReduction = frameL;
                    rightReduction = EP;
                    leftLabel = `좌측 프레임 ${frameL}mm (벽)`;
                    rightLabel = `우측 엔드패널 ${EP}mm`;
                  } else {
                    leftReduction = EP;
                    rightReduction = frameR;
                    leftLabel = `좌측 엔드패널 ${EP}mm`;
                    rightLabel = `우측 프레임 ${frameR}mm (벽)`;
                  }
                  installLabel = '한쪽벽 (세미스탠딩)';
                } else {
                  leftReduction = EP;
                  rightReduction = EP;
                  leftLabel = `좌측 엔드패널 ${EP}mm`;
                  rightLabel = `우측 엔드패널 ${EP}mm`;
                  installLabel = '벽없음 (프리스탠딩)';
                }
              } else {
                // 노서라운드
                const gapL = spaceInfo.gapConfig?.left ?? 2;
                const gapR = spaceInfo.gapConfig?.right ?? 2;

                if (isBuiltin) {
                  leftReduction = gapL;
                  rightReduction = gapR;
                  leftLabel = `좌측 이격 ${gapL}mm`;
                  rightLabel = `우측 이격 ${gapR}mm`;
                  installLabel = '양쪽벽 (빌트인)';
                } else if (isSemi) {
                  if (wallLeft) {
                    leftReduction = spaceInfo.gapConfig?.left || 0;
                    rightReduction = 0;
                    leftLabel = `좌측 이격 ${leftReduction}mm (벽)`;
                    rightLabel = '우측 0mm (엔드패널 포함)';
                  } else {
                    leftReduction = 0;
                    rightReduction = spaceInfo.gapConfig?.right || 0;
                    leftLabel = '좌측 0mm (엔드패널 포함)';
                    rightLabel = `우측 이격 ${rightReduction}mm (벽)`;
                  }
                  installLabel = '한쪽벽 (세미스탠딩)';
                } else {
                  leftReduction = 0;
                  rightReduction = 0;
                  leftLabel = '좌측 0mm (엔드패널 포함)';
                  rightLabel = '우측 0mm (엔드패널 포함)';
                  installLabel = '벽없음 (프리스탠딩)';
                }
              }

              const internalW = totalW - leftReduction - rightReduction;
              const hasReduction = leftReduction > 0 || rightReduction > 0;
              const gapM = spaceInfo.gapConfig?.middle ?? 1.5;
              const hasDropped = spaceInfo.droppedCeiling?.enabled === true;
              const droppedW = spaceInfo.droppedCeiling?.width || ((spaceInfo.layoutMode === 'free-placement') ? 150 : 900);
              const droppedPos = spaceInfo.droppedCeiling?.position || 'right';

              // 단내림 구간별 슬롯 영역 계산 (B안)
              // 메인구간: 외벽쪽 이격 + 중간이격 차감
              // 단내림구간: 중간이격 흡수(+) + 외벽쪽 이격 차감(-)
              const mainOuterW = totalW - droppedW; // 메인구간 외부 너비
              let mainSlotW: number;
              let droppedSlotW: number;

              if (hasDropped) {
                if (droppedPos === 'right') {
                  // 메인(좌), 단내림(우)
                  mainSlotW = mainOuterW - leftReduction - gapM;
                  droppedSlotW = droppedW + gapM - rightReduction;
                } else {
                  // 단내림(좌), 메인(우)
                  droppedSlotW = droppedW + gapM - leftReduction;
                  mainSlotW = mainOuterW - rightReduction - gapM;
                }
              } else {
                mainSlotW = internalW;
                droppedSlotW = 0;
              }

              // 일반 구간 계산
              const normalW = hasDropped ? mainSlotW : internalW;
              const normalCols = spaceInfo.mainDoorCount || spaceInfo.customColumnCount || Math.max(1, Math.round(normalW / 600));
              const normalRawSlot = normalW / normalCols;
              const normalSingleW = Math.floor(normalRawSlot);
              const normalDualW = Math.floor(normalRawSlot * 2 * 2) / 2;

              // 단내림 구간 계산
              const droppedCols = spaceInfo.droppedCeilingDoorCount || Math.max(1, Math.round((hasDropped ? droppedSlotW : droppedW) / 600));
              const droppedRawSlot = hasDropped ? droppedSlotW / droppedCols : droppedW / droppedCols;
              const droppedSingleW = Math.floor(droppedRawSlot);
              const droppedDualW = Math.floor(droppedRawSlot * 2 * 2) / 2;

              const fmtSlot = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);
              const fmtDual = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);

              return (
                <div ref={slotGuideRef} className={styles.slotGuidePopup}>
                  <div className={styles.slotGuidePopupTitle}>
                    <TbRulerMeasure size={18} /> 슬롯 분할 가이드
                  </div>

                  {/* 설치 타입 표시 */}
                  <div className={styles.slotGuidePopupSection}>
                    <div className={styles.slotGuidePopupLabel}>
                      {isSurround ? '서라운드' : '노서라운드'} · {installLabel}
                    </div>
                  </div>

                  {/* 내경 계산 */}
                  <div className={styles.slotGuidePopupSection}>
                    <div className={styles.slotGuidePopupLabel}>내경 계산</div>
                    <p className={styles.slotGuidePopupDesc}>
                      전체 너비({totalW}mm)에서 {hasReduction ? (<>{leftLabel} + {rightLabel}를 빼서</>) : '양쪽 차감이 없어'} <strong>내경 {internalW}mm</strong>{hasReduction ? '를 구합니다.' : '가 전체 너비와 동일합니다.'}
                    </p>
                    <p className={styles.slotGuidePopupDesc}>
                      <span className={styles.slotGuidePopupFormula}>
                        {totalW} − {leftReduction} − {rightReduction} = {internalW}mm
                      </span>
                    </p>
                  </div>

                  <div className={styles.slotGuidePopupDivider} />

                  {hasDropped ? (
                    <>
                      {/* 단내림 — 구간별 슬롯 계산 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>메인 구간 ({droppedPos === 'right' ? '좌' : '우'})</div>
                        <p className={styles.slotGuidePopupDesc}>
                          메인 {mainOuterW}mm에서 {droppedPos === 'right' ? leftLabel : rightLabel} + 중간이격 {gapM}mm를 빼서 <strong>슬롯 영역 {fmtSlot(normalW)}mm</strong>
                        </p>
                        <p className={styles.slotGuidePopupDesc}>
                          <span className={styles.slotGuidePopupFormula}>
                            ({mainOuterW} − {droppedPos === 'right' ? leftReduction : rightReduction} − {gapM}) ÷ {normalCols} = {fmtSlot(normalRawSlot)}mm
                          </span>
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupDivider} />

                      {/* 단내림 구간 슬롯 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>단내림 구간 ({droppedPos === 'left' ? '좌' : '우'})</div>
                        <p className={styles.slotGuidePopupDesc}>
                          단내림 {droppedW}mm + 중간이격 {gapM}mm − {droppedPos === 'right' ? rightLabel : leftLabel}로 <strong>슬롯 영역 {fmtSlot(droppedSlotW)}mm</strong>
                        </p>
                        <p className={styles.slotGuidePopupDesc}>
                          <span className={styles.slotGuidePopupFormula}>
                            ({droppedW} + {gapM} − {droppedPos === 'right' ? rightReduction : leftReduction}) ÷ {droppedCols} = {fmtSlot(droppedRawSlot)}mm
                          </span>
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupDivider} />

                      {/* 내림 규칙 — 구간별 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>가구 너비 결정 (내림 규칙)</div>
                        <p className={styles.slotGuidePopupDesc}>가구 제작 오차를 고려해 내림 처리합니다.</p>
                      </div>

                      <div className={styles.slotGuidePopupExample}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>일반 구간</div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>싱글 (1칸)</span>
                          <span>{normalSingleW}mm</span>
                        </div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>듀얼 (2칸)</span>
                          <span>{fmtDual(normalDualW)}mm</span>
                        </div>
                      </div>
                      <div className={styles.slotGuidePopupExample} style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>단내림 구간</div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>싱글 (1칸)</span>
                          <span>{droppedSingleW}mm</span>
                        </div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>듀얼 (2칸)</span>
                          <span>{fmtDual(droppedDualW)}mm</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* 단내림 없음 — 기존 로직 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>슬롯 분할</div>
                        <p className={styles.slotGuidePopupDesc}>
                          내경 {internalW}mm를 {normalCols}개 컬럼으로 나누면 각 슬롯은 <strong>{fmtSlot(normalRawSlot)}mm</strong>입니다.
                        </p>
                        <p className={styles.slotGuidePopupDesc}>
                          <span className={styles.slotGuidePopupFormula}>
                            {internalW} ÷ {normalCols} = {fmtSlot(normalRawSlot)}mm
                          </span>
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupDivider} />

                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>가구 너비 결정 (내림 규칙)</div>
                        <p className={styles.slotGuidePopupDesc}>
                          {isSurround
                            ? <>프레임/엔드패널 차감으로 슬롯이 {normalRawSlot % 1 === 0 ? '정수' : '소수점'}이므로, 가구 제작 오차를 고려해 내림 처리합니다.</>
                            : hasReduction
                              ? <>이격거리로 인해 슬롯이 {normalRawSlot % 1 === 0 ? '정수' : '소수점'}이므로, 가구 제작 오차를 고려해 내림 처리합니다.</>
                              : '가구 제작 시 오차를 고려하여 슬롯 너비를 내림 처리합니다.'}
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupExample}>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>싱글 가구 (1칸)</span>
                          <span>{normalSingleW}mm (정수 내림)</span>
                        </div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>듀얼 가구 (2칸)</span>
                          <span>{fmtDual(normalDualW)}mm (0.5 단위 내림)</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* 측면뷰용 슬롯 선택 버튼 */}
            {!spaceInfo.customGuideMode && <SlotSelector />}
          </div>
          {isMobile && <div className={responsiveStyles.mobileViewerDivider} aria-hidden="true" />}

        </div>

        {/* 우측 패널 폴드/언폴드 버튼 - 읽기 전용 모드에서는 숨김 */}
        {!isReadOnly && (
          <button
            className={`${styles.rightPanelToggle} ${isRightPanelOpen ? styles.open : ''}`}
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            title={isRightPanelOpen ? "우측 패널 접기" : "우측 패널 펼치기"}
          >
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d={isRightPanelOpen ? "M1 1L6 6L1 11" : "M6 1L1 6L6 11"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* 3D 모드 전용: 스캔 아이콘 — 활성 시 primary 배경 + 흰 아이콘 (?와 동일 패턴) */}
        {!isReadOnly && viewMode === '3D' && (
          <button
            className="canvas-icon-btn"
            onClick={toggleLiveDimensionMode}
            title="3D 스캔"
            style={{
              position: 'absolute',
              right: isRightPanelOpen ? 'calc(var(--right-panel-width, 320px) + 12px)' : '12px',
              top: '96px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: isLiveDimensionMode
                ? '1.5px solid var(--theme-primary)'
                : '1.5px solid var(--theme-border, #d1d5db)',
              background: isLiveDimensionMode ? 'var(--theme-primary)' : 'transparent',
              backgroundColor: isLiveDimensionMode ? 'var(--theme-primary)' : 'transparent',
              outline: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              color: isLiveDimensionMode ? '#ffffff' : 'var(--theme-text-muted, #6b7280)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isLiveDimensionMode
                ? '0 2px 8px color-mix(in srgb, var(--theme-primary) 35%, transparent)'
                : 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              zIndex: 20,
              transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isLiveDimensionMode) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--theme-primary)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLiveDimensionMode) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--theme-border, #d1d5db)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-text-muted, #6b7280)';
              }
            }}
          >
            <TbZoomScan size={14} />
          </button>
        )}
        {/* 3D 모드 전용: 줄자 아이콘 — 활성 시 primary 배경 + 흰 아이콘 */}
        {!isReadOnly && viewMode === '3D' && (
          <button
            className="canvas-icon-btn"
            onClick={toggleTapeMeasureMode}
            title="3D 줄자"
            style={{
              position: 'absolute',
              right: isRightPanelOpen ? 'calc(var(--right-panel-width, 320px) + 12px)' : '12px',
              top: '136px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: isTapeMeasureMode
                ? '1.5px solid var(--theme-primary)'
                : '1.5px solid var(--theme-border, #d1d5db)',
              background: isTapeMeasureMode ? 'var(--theme-primary)' : 'transparent',
              backgroundColor: isTapeMeasureMode ? 'var(--theme-primary)' : 'transparent',
              outline: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              color: isTapeMeasureMode ? '#ffffff' : 'var(--theme-text-muted, #6b7280)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isTapeMeasureMode
                ? '0 2px 8px color-mix(in srgb, var(--theme-primary) 35%, transparent)'
                : 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              zIndex: 20,
              transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isTapeMeasureMode) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--theme-primary)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isTapeMeasureMode) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--theme-border, #d1d5db)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-text-muted, #6b7280)';
              }
            }}
          >
            <RulerDimensionLine size={14} />
          </button>
        )}

        {/* 우측 패널 컨테이너 - 읽기 전용 모드에서는 숨김 */}
        {!isReadOnly && (
          <div
            className={styles.rightPanelContainer}
            style={{
              width: isRightPanelOpen ? 'var(--right-panel-width, 320px)' : '0',
              visibility: isRightPanelOpen ? 'visible' : 'hidden',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear ' + (isRightPanelOpen ? '0s' : '0.3s')
            }}
          >

            {/* 우측 패널 */}
            <div
              className={styles.rightPanel}
              style={{
                transform: isRightPanelOpen ? 'translateX(0)' : 'translateX(100%)',
                opacity: isRightPanelOpen ? 1 : 0,
                pointerEvents: isRightPanelOpen ? 'auto' : 'none'
              }}
            >
              {/* 미리보기 뷰어 - 2D/3D 모드 전환 */}
              <PreviewViewer />

              {/* 패널 컨텐츠 */}
              <div className={styles.rightPanelContent}>
                {renderRightPanelContent()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 가구 편집 창들 - 기존 기능 유지 */}
      <ModulePropertiesPanel />
      <PlacedModulePropertiesPanel />
      <CustomizablePropertiesPanel />
      <SurroundEditPanel />

      {/* 기둥 편집 모달 */}
      <ColumnEditModal
        columnId={activePopup.type === 'columnEdit' ? activePopup.id : null}
        isOpen={activePopup.type === 'columnEdit'}
        onClose={closeAllPopups}
      />

      {/* 컨버팅 모달 */}
      <ConvertModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        showAll={showAll}
        setShowAll={setShowAll}
      />

      {/* PDF 템플릿 미리보기 */}
      <PDFTemplatePreview
        isOpen={showPDFPreview}
        onClose={() => setShowPDFPreview(false)}
        capturedViews={capturedViews}
      />

      {/* 공유 링크 모달 */}
      {isShareModalOpen && currentProjectId && (
        <ShareLinkModal
          projectId={currentProjectId}
          projectName={urlProjectName || basicInfo.title || "프로젝트"}
          designFileId={currentDesignFileId || undefined}
          designFileName={currentDesignFileName || undefined}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {/* 보링 데이터 내보내기 대화상자 */}
      <BoringExportDialog
        isOpen={showBoringExportDialog}
        onClose={() => setShowBoringExportDialog(false)}
        panels={boringPanels}
      />

      {/* 새 디자인 생성 모달 */}
      {isNewDesignModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsNewDesignModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ padding: '24px', maxWidth: '420px' }}>
            <button className={styles.modalCloseButton} onClick={() => setIsNewDesignModalOpen(false)}>×</button>
            <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: 'var(--theme-text)' }}>새 디자인</h3>

            {/* 프로젝트 선택 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: '6px' }}>프로젝트</label>
              <select
                value={newDesignProjectId || ''}
                onChange={e => setNewDesignProjectId(e.target.value || null)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid var(--theme-border)',
                  borderRadius: '6px', background: 'var(--theme-surface)', color: 'var(--theme-text)',
                  fontSize: '13px', outline: 'none',
                }}
              >
                <option value="">프로젝트를 선택하세요</option>
                {newDesignProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            {/* 디자인 이름 */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: '6px' }}>디자인 이름</label>
              <input
                type="text"
                value={newDesignName}
                onChange={e => setNewDesignName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isCreatingNewDesign && handleNewDesignSubmit()}
                placeholder="디자인 이름을 입력하세요"
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid var(--theme-border)',
                  borderRadius: '6px', background: 'var(--theme-surface)', color: 'var(--theme-text)',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsNewDesignModalOpen(false)}
                style={{
                  padding: '8px 20px', border: '1px solid var(--theme-border)', borderRadius: '6px',
                  background: 'var(--theme-surface)', color: 'var(--theme-text)', fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleNewDesignSubmit}
                disabled={!newDesignName.trim() || !newDesignProjectId || isCreatingNewDesign}
                style={{
                  padding: '8px 20px', border: 'none', borderRadius: '6px',
                  background: !newDesignName.trim() || !newDesignProjectId || isCreatingNewDesign ? '#ccc' : 'var(--theme-primary)',
                  color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {isCreatingNewDesign ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공간 설정 팝업 (isSpaceConfigured === false 일 때) */}
      {showSpaceConfigPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: '90vw',
            maxWidth: '1200px',
            height: '85vh',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          }}>
            <Step2SpaceAndCustomization
              mode="configure"
              designFileId={currentDesignFileId || undefined}
              projectId={currentProjectId || undefined}
              onPrevious={() => { }}
              onClose={() => setShowSpaceConfigPopup(false)}
              onComplete={() => {
// console.log('✅ 공간 설정 팝업 완료');
                setShowSpaceConfigPopup(false);
              }}
            />
          </div>
        </div>
      )}

      {/* 모바일 읽기 전용 모드 전용 UI */}
      {isReadOnly && (
        <>
          {/* 하단 재질 선택 패널 */}
          <div className={responsiveStyles.materialPanel}>
            <MaterialPanel />
          </div>

          {/* 하단 네비게이션 바 */}
          <div className={responsiveStyles.bottomNav}>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>홈</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              <span>도면</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>달력</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-primary)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>추가</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>계정</span>
            </button>
          </div>
        </>
      )}

      {/* 모바일 전용 UI (편집 모드) */}
      {isMobile && !isReadOnly && (
        <>
          {/* 하단 탭바 */}
          <MobileBottomBar
            activeTab={activeMobileTab}
            onTabChange={handleMobileTabChange}
            onSettingsClick={handleMobileMenuToggle}
          />

          {/* 모듈/기둥/기타 패널 */}
          <MobilePanel
            activeTab={activeMobileTab}
            isOpen={activeMobileTab === 'modules' || activeMobileTab === 'column'}
          />

          {/* 바텀시트 - 재질 */}
          <MobileBottomSheet
            isOpen={mobileSheetOpen && activeMobileTab === 'material'}
            onClose={() => { setMobileSheetOpen(false); setActiveMobileTab(null); }}
            title="재질 선택"
          >
            <MaterialPanel />
          </MobileBottomSheet>

        </>
      )}

      {/* 모바일 우측 메뉴 (Drawer) */}
      {isMobile && (
        <>
          <div className={`${responsiveStyles.mobileRightPanel} ${isMobileMenuOpen ? responsiveStyles.mobileRightPanelOpen : ''}`}>
            <div className={responsiveStyles.mobileRightPanelHeader}>
              <h2>설정</h2>
              <button
                className={responsiveStyles.mobileRightPanelClose}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="설정 닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className={responsiveStyles.mobileRightPanelContent}>
              {renderRightPanelContent()}
            </div>
          </div>
          <div
            className={`${responsiveStyles.mobileBackdrop} ${isMobileMenuOpen ? responsiveStyles.mobileBackdropOpen : ''}`}
            onClick={() => setIsMobileMenuOpen(false)}
          />
        </>
      )}

      {/* 아일랜드 설계 모달 — create: 새 디자인 생성 / edit: 현재 디자인의 사이즈 편집 */}
      <IslandSetupModal
        isOpen={islandSetupOpen}
        mode={islandSetupMode}
        initialValues={
          islandSetupMode === 'edit'
            ? {
                name: currentDesignFileName || '',
                width: spaceInfo.width,
                depth: spaceInfo.depth,
                height: spaceInfo.height,
              }
            : undefined
        }
        onCancel={() => setIslandSetupOpen(false)}
        onConfirm={async (values: IslandSetupValues) => {
          setIslandSetupOpen(false);
          if (islandSetupMode === 'edit') {
            setSpaceInfo({
              width: values.width,
              depth: values.depth,
              height: values.height,
            });
            return;
          }

          try {
            let projectIdToUse = currentProjectId;
            if (!projectIdToUse) {
              const { id: newProjectId, error: projectError } = await createProject({
                title: basicInfo.title || '새 프로젝트',
              });
              if (projectError || !newProjectId) {
                alert('프로젝트 생성 실패: ' + (projectError || ''));
                return;
              }
              projectIdToUse = newProjectId;
              setCurrentProjectId(newProjectId);
            }

            const islandSpaceConfig = {
              ...spaceInfo,
              width: values.width,
              depth: values.depth,
              height: values.height,
              isIsland: true,
              installType: 'freestanding' as const,
              wallConfig: { left: false, right: false },
              surroundType: 'no-surround' as const,
              hasFloorFinish: false,
              droppedCeiling: { ...(spaceInfo.droppedCeiling || {}), enabled: false },
            };

            const { id: designFileId, error } = await createDesignFile({
              name: values.name,
              projectId: projectIdToUse,
              spaceConfig: removeUndefinedValues(stripSessionOnlyFields(islandSpaceConfig)),
              furniture: { placedModules: [] },
              thumbnail: null as any,
            });

            if (error || !designFileId) {
              alert('아일랜드 디자인 생성 실패: ' + (error || ''));
              return;
            }

            navigate(`/configurator?projectId=${projectIdToUse}&designFileId=${designFileId}`, { replace: true });
          } catch (err) {
            console.error('아일랜드 디자인 생성 오류:', err);
            alert('아일랜드 디자인 생성 중 오류가 발생했습니다.');
          }
        }}
      />

      {/* 키큰장 우클릭 EP 메뉴 (Canvas 바깥) */}
      <TallEpContextMenu />
    </div>
  );
};

export default Configurator;
