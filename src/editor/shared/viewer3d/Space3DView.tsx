import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { RxDimensions } from 'react-icons/rx';
import { LuEraser } from 'react-icons/lu';
import { Sun, Moon } from 'lucide-react';
import { Space3DViewProps } from './types';
import { Space3DViewProvider } from './context/Space3DViewContext';
import { ViewerThemeProvider } from './context/ViewerThemeContext';
import ThreeCanvas from './components/base/ThreeCanvas';
import Room from './components/elements/Room';
import ColumnAsset from './components/elements/space/ColumnAsset';
import WallAsset from './components/elements/space/WallAsset';
import ColumnDistanceLabels from './components/elements/space/ColumnDistanceLabels';
import ColumnGhostPreview from './components/elements/space/ColumnGhostPreview';
import ColumnCreationMarkers from './components/elements/space/ColumnCreationMarkers';
import PanelBAsset from './components/elements/space/PanelBAsset';
import PanelBCreationMarkers from './components/elements/space/PanelBCreationMarkers';

import ColumnGuides from './components/elements/ColumnGuides';
import CleanCAD2D from './components/elements/CleanCAD2D';
import CADDimensions2D from './components/elements/CADDimensions2D';
import CADGrid from './components/elements/CADGrid';
import DroppedCeilingSpace from './components/elements/DroppedCeilingSpace';
import { MeasurementTool } from './components/elements/MeasurementTool';
import LiveDimensionInspector from './components/elements/LiveDimensionInspector';
import TapeMeasureInspector from './components/elements/TapeMeasureInspector';

import SlotDropZonesSimple from './components/elements/SlotDropZonesSimple';
import SlotPlacementIndicators from './components/elements/SlotPlacementIndicators';
import FurniturePlacementPlane from './components/elements/FurniturePlacementPlane';
import FreePlacementDropZone from './components/elements/FreePlacementDropZone';
import { getModuleBoundsX, getInternalSpaceBoundsX, checkFreeCollision, checkColumnCollision, getModuleCategory } from '../utils/freePlacementUtils';
import FurnitureItem from './components/elements/furniture/FurnitureItem';
import BackPanelBetweenCabinets from './components/elements/furniture/BackPanelBetweenCabinets';
import UpperCabinetIndirectLight from './components/elements/furniture/UpperCabinetIndirectLight';
import InternalDimensionDisplay from './components/elements/InternalDimensionDisplay';
import SlotSelector from '@/editor/Configurator/components/SlotSelector';
import { useFurniturePlacement } from './components/elements/furniture/hooks/useFurniturePlacement';


import { useLocation } from 'react-router-dom';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import type { PanelSimulationLayout, PanelSimulationSheetLayout, PanelSimulationSummary } from '@/store/uiStore';
import { useFrame } from '@react-three/fiber';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateOptimalDistance, mmToThreeUnits, calculateCameraTarget, threeUnitsToMm } from './components/base/utils/threeUtils';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/contexts/ThemeContext';
import { getModuleById } from '@/data/modules';
import { useThrottle } from '@/editor/shared/hooks/useThrottle';
import { useResponsive } from '@/hooks/useResponsive';
import { getCanonicalPanelNameCandidates } from '@/editor/shared/utils/panelNameCanonical';
import { useLivePanelData } from '@/editor/CNCOptimizer/hooks/useLivePanelData';
import { optimizePanelsMultiple } from '@/editor/CNCOptimizer/utils/optimizer';
import type { Panel as OptimizerPanel, OptimizedResult, StockPanel } from '@/editor/CNCOptimizer/types';
import { getExcludedPanelAliases } from './context/ExcludedPanelsContext';
import { clearPanelSimulationSources, getPanelSimulationSources } from './utils/panelSimulationRegistry';
import {
  buildFlatPanelQuaternion,
  easeInOutCubic,
  easeOutCubic,
  getPanelAssemblySequence,
  getFlatPanelAxes,
  PANEL_SIMULATION_ASSEMBLY_DELAY_STEP,
  PANEL_SIMULATION_DELAY_STEP,
  PANEL_SIMULATION_DURATION,
  PANEL_SIMULATION_FINAL_STAGE_ORDER,
  PANEL_SIMULATION_FURNITURE_SPAN,
  smootherStep
} from './utils/panelSimulationMotion';

const PANEL_SIMULATION_MM_TO_WORLD = 0.006;
const PANEL_SIMULATION_SOURCE_MM_TO_WORLD = 0.01;
const PANEL_SIMULATION_SCALE = PANEL_SIMULATION_MM_TO_WORLD / PANEL_SIMULATION_SOURCE_MM_TO_WORLD;
const PANEL_SIMULATION_SHEET_GAP_WORLD = 1.2;
const PANEL_SIMULATION_LAYOUT_DELAY_STEP = 0.0045;

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getPanelSimulationExportOrder = (
  panelName: string | undefined,
  layoutOrder: number,
  sourceIndex: number,
  sameTypeIndex: number
) => {
  const name = panelName || '';
  let groupBase = 4000;
  if (name.includes('도어')) {
    groupBase = 0;
  } else if (name.includes('걸레받이') || name.includes('걸래받이') || name === 'base-frame') {
    groupBase = 68;
  } else if (name.includes('상단몰딩') || name === 'top-frame') {
    groupBase = 86;
  } else if (name.includes('서랍') || name.includes('마이다')) {
    groupBase = 112;
  } else if (name.includes('(상)') || name.includes('상부')) {
    groupBase = 146;
  } else if (name.includes('(하)') || name.includes('하부')) {
    groupBase = 178;
  } else {
    groupBase = 210;
  }
  const stagger = name.includes('도어')
    ? sameTypeIndex * 12
    : (sourceIndex % 90);
  return groupBase + stagger + layoutOrder * 0.15;
};

type CutlistGrain = 'H' | 'V' | 'NONE';

interface SimulationCutPanel {
  id: string;
  label: string;
  width: number;
  length: number;
  thickness: number;
  quantity: number;
  material?: string;
  grain?: CutlistGrain;
  canRotate?: boolean;
  boringPositions?: number[];
  boringDepthPositions?: number[];
  groovePositions?: any[];
  screwPositions?: number[];
  screwDepthPositions?: number[];
  isDoor?: boolean;
  isLeftHinge?: boolean;
  screwHoleSpacing?: number;
  bracketBoringPositions?: number[];
  bracketBoringDepthPositions?: number[];
  isBracketSide?: boolean;
  cornerNotch?: { width: number; depth: number; side: 'left' | 'right' };
  sideNotches?: Array<{ y: number; z: number; fromBottom: number }>;
  rebate?: { width: number; height: number; position: string };
  meshName?: string;
  furnitureId?: string;
  sourceFurnitureIds?: string[];
}

interface SimulationSettings {
  kerf: number;
  trimTop: number;
  trimBottom: number;
  trimLeft: number;
  trimRight: number;
  singleSheetOnly: boolean;
  considerMaterial: boolean;
  considerGrain: boolean;
  alignVerticalCuts: boolean;
  optimizationType: 'OPTIMAL_L' | 'OPTIMAL_W' | 'BY_LENGTH' | 'BY_WIDTH' | 'OPTIMAL_CNC';
}

interface SimulationStockSheet {
  label: string;
  width: number;
  length: number;
  thickness: number;
  quantity: number;
  material: string;
}

const getPanelSimulationSettings = (): SimulationSettings => {
  const defaults: SimulationSettings = {
    kerf: 5,
    trimTop: 5,
    trimBottom: 5,
    trimLeft: 5,
    trimRight: 5,
    singleSheetOnly: false,
    considerMaterial: true,
    considerGrain: true,
    alignVerticalCuts: true,
    optimizationType: 'OPTIMAL_L',
  };

  try {
    const saved = localStorage.getItem('cnc_settings');
    if (!saved) return defaults;
    return { ...defaults, ...JSON.parse(saved), optimizationType: 'OPTIMAL_L' };
  } catch {
    return defaults;
  }
};

const getPanelSimulationStock = (panels: SimulationCutPanel[]): SimulationStockSheet[] => {
  const isPET = panels.some(p => [18.5, 15.5, 9.5, 5.5].includes(p.thickness));
  const stock: SimulationStockSheet[] = isPET ? [
    { label: 'PB_18.5T_2440x1220', width: 1220, length: 2440, thickness: 18.5, quantity: 999, material: 'PB' },
    { label: 'PET_18.5T_2440x1220', width: 1220, length: 2440, thickness: 18.5, quantity: 999, material: 'PET' },
    { label: 'PB_15.5T_2440x1220', width: 1220, length: 2440, thickness: 15.5, quantity: 999, material: 'PB' },
    { label: 'MDF_15.5T_2440x1220', width: 1220, length: 2440, thickness: 15.5, quantity: 999, material: 'MDF' },
    { label: 'MDF_9.5T_2440x1220', width: 1220, length: 2440, thickness: 9.5, quantity: 999, material: 'MDF' },
    { label: 'MDF_5.5T_2440x1220', width: 1220, length: 2440, thickness: 5.5, quantity: 999, material: 'MDF' },
  ] : [
    { label: 'PB_18T_2440x1220', width: 1220, length: 2440, thickness: 18, quantity: 999, material: 'PB' },
    { label: 'PET_18.5T_2440x1220', width: 1220, length: 2440, thickness: 18.5, quantity: 999, material: 'PET' },
    { label: 'PB_15T_2440x1220', width: 1220, length: 2440, thickness: 15, quantity: 999, material: 'PB' },
    { label: 'MDF_15T_2440x1220', width: 1220, length: 2440, thickness: 15, quantity: 999, material: 'MDF' },
    { label: 'MDF_9T_2440x1220', width: 1220, length: 2440, thickness: 9, quantity: 999, material: 'MDF' },
    { label: 'MDF_5T_2440x1220', width: 1220, length: 2440, thickness: 5, quantity: 999, material: 'MDF' },
  ];

  panels.forEach(panel => {
    if (panel.material !== '인조대리석') return;
    if (stock.some(s => s.material === '인조대리석' && s.thickness === panel.thickness)) return;
    stock.push({
      label: `인조대리석_${panel.thickness}T_3680x760`,
      width: 760,
      length: 3680,
      thickness: panel.thickness,
      quantity: 999,
      material: '인조대리석',
    });
  });

  return stock;
};

const toSimulationCutPanel = (panel: OptimizerPanel): SimulationCutPanel => {
  const panelName = (panel.name || '').toLowerCase();
  const isBackPanel = panelName.includes('백패널');
  const isStoneTop = panel.material === '인조대리석';
  const width = isBackPanel || panel.grain === 'VERTICAL' ? panel.width : panel.height;
  const length = isBackPanel || panel.grain === 'VERTICAL' ? panel.height : panel.width;
  let material = panel.material || 'PB';

  if (isStoneTop) {
    material = '인조대리석';
  } else if (panelName.includes('백패널')) {
    material = 'MDF';
  } else if (
    panelName.includes('도어') ||
    panelName.includes('door') ||
    panelName.includes('엔드') ||
    panelName.includes('end') ||
    panelName.includes('프레임') ||
    panelName.includes('서라운드')
  ) {
    material = 'PET';
  }

  return {
    id: panel.id,
    label: panel.name || `Panel_${panel.id}`,
    width,
    length,
    thickness: panel.thickness || (isStoneTop ? panel.thickness || 18 : material === 'PET' ? 18.5 : 18),
    quantity: panel.quantity || 1,
    material,
    grain: isBackPanel ? 'H' : isStoneTop ? 'NONE' : panel.grain === 'NONE' ? 'NONE' : 'H',
    canRotate: true,
    boringPositions: panel.boringPositions,
    boringDepthPositions: panel.boringDepthPositions,
    groovePositions: panel.groovePositions,
    screwPositions: panel.screwPositions,
    screwDepthPositions: panel.screwDepthPositions,
    isDoor: panel.isDoor,
    isLeftHinge: panel.isLeftHinge,
    screwHoleSpacing: panel.screwHoleSpacing,
    bracketBoringPositions: panel.bracketBoringPositions,
    bracketBoringDepthPositions: panel.bracketBoringDepthPositions,
    isBracketSide: panel.isBracketSide,
    cornerNotch: panel.cornerNotch,
    sideNotches: panel.sideNotches,
    rebate: panel.rebate,
    meshName: panel.meshName,
    furnitureId: panel.furnitureId,
    sourceFurnitureIds: panel.sourceFurnitureIds,
  };
};

const toOptimizerPanel = (panel: SimulationCutPanel): OptimizerPanel => ({
  id: panel.id,
  name: panel.label,
  width: panel.width,
  height: panel.length,
  thickness: panel.thickness,
  quantity: panel.quantity,
  material: panel.material || 'PB',
  color: 'MW',
  grain: panel.grain === 'H' ? 'HORIZONTAL' : panel.grain === 'V' ? 'VERTICAL' : 'VERTICAL',
  boringPositions: panel.boringPositions,
  boringDepthPositions: panel.boringDepthPositions,
  groovePositions: panel.groovePositions,
  screwPositions: panel.screwPositions,
  screwDepthPositions: panel.screwDepthPositions,
  isDoor: panel.isDoor,
  isLeftHinge: panel.isLeftHinge,
  screwHoleSpacing: panel.screwHoleSpacing,
  bracketBoringPositions: panel.bracketBoringPositions,
  bracketBoringDepthPositions: panel.bracketBoringDepthPositions,
  isBracketSide: panel.isBracketSide,
  cornerNotch: panel.cornerNotch,
  sideNotches: panel.sideNotches,
  rebate: panel.rebate,
  meshName: panel.meshName,
  furnitureId: panel.furnitureId,
  sourceFurnitureIds: panel.sourceFurnitureIds,
} as OptimizerPanel);

const fitsInSimulationBoard = (width: number, length: number, canRotate: boolean, stockWidth: number, stockLength: number) => {
  const shortSide = Math.min(width, length);
  const longSide = Math.max(width, length);
  if (shortSide <= stockWidth && longSide <= stockLength) return true;
  if (canRotate) return false;
  return width <= stockWidth && length <= stockLength;
};

const buildPanelSimulationResults = async (
  panels: SimulationCutPanel[],
  settings: SimulationSettings,
  stock: SimulationStockSheet[]
): Promise<OptimizedResult[]> => {
  const stdW = 1220;
  const stdL = 2440;
  const ext2750 = 2750;
  const ext3050 = 3050;
  const results: OptimizedResult[] = [];
  const regularList: SimulationCutPanel[] = [];
  const ext2750List: SimulationCutPanel[] = [];
  const ext3050List: SimulationCutPanel[] = [];

  panels.forEach(panel => {
    const hasGrain = panel.grain && panel.grain !== 'NONE';
    const canRotate = !hasGrain;
    if (fitsInSimulationBoard(panel.width, panel.length, canRotate, stdW, stdL)) {
      regularList.push(panel);
    } else if (fitsInSimulationBoard(panel.width, panel.length, canRotate, stdW, ext2750)) {
      ext2750List.push(panel);
    } else if (fitsInSimulationBoard(panel.width, panel.length, canRotate, stdW, ext3050)) {
      ext3050List.push(panel);
    } else {
      regularList.push(panel);
    }
  });

  const optimizeGroup = async (groupPanels: SimulationCutPanel[], stockWidth: number, stockLength: number, oversized = false) => {
    const groups = new Map<string, SimulationCutPanel[]>();
    groupPanels.forEach(panel => {
      const hasGrain = panel.grain && panel.grain !== 'NONE';
      const processed = { ...panel, canRotate: !hasGrain };
      const key = settings.considerMaterial
        ? `${processed.material || 'PB'}_${processed.thickness || 18}`
        : `THICKNESS_${processed.thickness || 18}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(processed);
    });

    for (const [key, group] of groups) {
      const keyParts = key.split('_');
      const material = key.startsWith('THICKNESS_') ? undefined : keyParts[0];
      const thickness = parseFloat(keyParts[keyParts.length - 1]) || 18;
      let matchingStock = material
        ? stock.find(s => s.material === material && s.thickness === thickness && s.width === stockWidth && s.length === stockLength)
        : undefined;
      if (!matchingStock) matchingStock = stock.find(s => s.thickness === thickness && s.width === stockWidth && s.length === stockLength);
      if (!matchingStock && stockWidth === stdW && stockLength === stdL) matchingStock = stock.find(s => s.thickness === thickness);

      const stockPanel: StockPanel = {
        id: matchingStock?.label || `${material || 'PB'}_${thickness}T_${stockLength}x${stockWidth}`,
        width: matchingStock?.width || stockWidth,
        height: matchingStock?.length || stockLength,
        material: material || matchingStock?.material || 'PB',
        color: 'MW',
        price: 0,
        stock: matchingStock?.quantity || 999,
        thickness,
      };
      const adjustedStockPanel: StockPanel = {
        ...stockPanel,
        width: stockPanel.width - (settings.trimLeft || 10) - (settings.trimRight || 10),
        height: stockPanel.height - (settings.trimTop || 10) - (settings.trimBottom || 10),
      };

      const optimized = await optimizePanelsMultiple(
        group.map(toOptimizerPanel),
        adjustedStockPanel,
        settings.singleSheetOnly ? 1 : 999,
        settings.alignVerticalCuts !== false,
        settings.kerf || 5,
        settings.optimizationType as any
      );

      optimized.forEach(result => {
        result.panels.forEach(panel => {
          panel.x += (settings.trimLeft || 10);
          panel.y += (settings.trimBottom || 10);
        });
        result.stockPanel = stockPanel;
        result.isOversized = oversized;
      });
      results.push(...optimized);
    }
  };

  await optimizeGroup(regularList, stdW, stdL);
  await optimizeGroup(ext2750List, stdW, ext2750, true);
  await optimizeGroup(ext3050List, stdW, ext3050, true);

  return results;
};

const buildPanelSimulationTargets = (
  results: OptimizedResult[],
  boardCenterY: number
): {
  layouts: Record<string, PanelSimulationLayout>;
  sheet: PanelSimulationSheetLayout | null;
} => {
  if (results.length === 0) {
    return { layouts: {}, sheet: null };
  }

  const maxSheetWidth = Math.max(...results.map(result => result.stockPanel.width || 1220));
  const maxSheetHeight = Math.max(...results.map(result => result.stockPanel.height || 2440));
  const sheetWidthWorld = maxSheetWidth * PANEL_SIMULATION_MM_TO_WORLD;
  const sheetHeightWorld = maxSheetHeight * PANEL_SIMULATION_MM_TO_WORLD;
  const sheetGapWorld = PANEL_SIMULATION_SHEET_GAP_WORLD;
  const sheetCount = results.length;
  const totalWidthWorld = results.reduce((sum, result, index) => {
    const width = (result.stockPanel.width || maxSheetWidth) * PANEL_SIMULATION_MM_TO_WORLD;
    return sum + width + (index === results.length - 1 ? 0 : sheetGapWorld);
  }, 0);
  const startX = -totalWidthWorld / 2;
  const layouts: Record<string, PanelSimulationLayout> = {};
  const sheets: NonNullable<PanelSimulationSheetLayout['sheets']> = [];
  const panels: NonNullable<PanelSimulationSheetLayout['panels']> = [];
  let currentSheetLeft = startX;
  let order = 0;

  const addLayoutAliases = (panel: OptimizerPanel, layout: PanelSimulationLayout) => {
    const furnitureIds = new Set<string>();
    if (panel.furnitureId) furnitureIds.add(panel.furnitureId);
    panel.sourceFurnitureIds?.forEach(id => {
      if (id) furnitureIds.add(id);
    });
    if (furnitureIds.size === 0) return;

    const names = new Set<string>();
    if (panel.meshName) names.add(panel.meshName);
    if (panel.name) {
      names.add(panel.name);
      const parts = panel.name.split(/\s+/).filter(Boolean);
      for (let index = 1; index < parts.length; index += 1) {
        names.add(parts.slice(index).join(' '));
      }
    }
    Array.from(names).forEach(name => {
      getExcludedPanelAliases(name).forEach(alias => names.add(alias));
      getCanonicalPanelNameCandidates(name).forEach(candidate => names.add(candidate));
    });
    const assignLayout = (baseKey: string) => {
      if (!layouts[baseKey]) {
        layouts[baseKey] = layout;
        return;
      }
      let duplicateIndex = 2;
      let duplicateKey = `${baseKey}#${duplicateIndex}`;
      while (layouts[duplicateKey]) {
        duplicateIndex += 1;
        duplicateKey = `${baseKey}#${duplicateIndex}`;
      }
      layouts[duplicateKey] = layout;
    };

    furnitureIds.forEach(furnitureId => {
      names.forEach(name => {
        if (name) assignLayout(`${furnitureId}::${name}`);
      });
    });
  };

  results.forEach((result, sheetIndex) => {
    const stockWidth = result.stockPanel.width || maxSheetWidth;
    const stockHeight = result.stockPanel.height || maxSheetHeight;
    const sheetWidth = stockWidth * PANEL_SIMULATION_MM_TO_WORLD;
    const sheetHeight = stockHeight * PANEL_SIMULATION_MM_TO_WORLD;
    const sheetLeft = currentSheetLeft;
    sheets.push({
      centerX: sheetLeft + sheetWidth / 2,
      widthWorld: sheetWidth,
      heightWorld: sheetHeight,
      label: result.stockPanel.id,
      material: result.stockPanel.material,
      thickness: result.stockPanel.thickness,
      widthMm: result.stockPanel.width,
      heightMm: result.stockPanel.height,
    });

    result.panels.forEach(panel => {
      const footprintWidth = (panel.rotated ? panel.height : panel.width) || panel.width;
      const footprintHeight = (panel.rotated ? panel.width : panel.height) || panel.height;
      const centerXmm = clampNumber(
        panel.x + footprintWidth / 2,
        footprintWidth / 2,
        Math.max(footprintWidth / 2, stockWidth - footprintWidth / 2)
      );
      const centerYmm = clampNumber(
        panel.y + footprintHeight / 2,
        footprintHeight / 2,
        Math.max(footprintHeight / 2, stockHeight - footprintHeight / 2)
      );
      const layout = {
        worldX: sheetLeft + centerXmm * PANEL_SIMULATION_MM_TO_WORLD,
        worldY: boardCenterY,
        worldZ: sheetHeight / 2 - centerYmm * PANEL_SIMULATION_MM_TO_WORLD,
        rotationZ: panel.rotated ? Math.PI / 2 : 0,
        scale: PANEL_SIMULATION_SCALE,
        widthWorld: footprintWidth * PANEL_SIMULATION_MM_TO_WORLD,
        heightWorld: footprintHeight * PANEL_SIMULATION_MM_TO_WORLD,
        order,
        sheetIndex,
      };
      addLayoutAliases(panel, layout);
      panels.push({
        key: `${sheetIndex}:${order}:${panel.id || panel.name || 'panel'}`,
        label: panel.name || panel.label || '패널',
        material: panel.material || result.stockPanel.material,
        worldX: layout.worldX,
        worldY: layout.worldY,
        worldZ: layout.worldZ,
        widthWorld: layout.widthWorld,
        heightWorld: layout.heightWorld,
        thicknessWorld: (panel.thickness || result.stockPanel.thickness || 18) * PANEL_SIMULATION_MM_TO_WORLD,
        rotationZ: layout.rotationZ,
        sheetIndex,
        order,
      });
      order += 1;
    });

    currentSheetLeft += sheetWidth + sheetGapWorld;
  });

  return {
    layouts,
    sheet: {
      centerX: 0,
      centerY: boardCenterY,
      centerZ: 0,
      sheetWidthWorld,
      sheetHeightWorld,
      sheetGapWorld,
      sheetCount,
      sheets,
      panels,
    },
  };
};

/**
 * SunLight — sunAngle에 따라 부드럽게 회전하는 메인 조명
 * useRef로 light 인스턴스를 직접 조작하여 shadow map 재생성 없이 위치 변경
 */
const SunLight: React.FC<{ sunAngle: number; castShadow: boolean }> = ({ sunAngle, castShadow }) => {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const currentAngle = useRef(sunAngle);

  useFrame(() => {
    if (!lightRef.current) return;
    // lerp로 부드러운 보간 (현재 → 목표)
    currentAngle.current += (sunAngle - currentAngle.current) * 0.35;
    const rad = (currentAngle.current * Math.PI) / 180;
    lightRef.current.position.set(
      Math.sin(rad) * 22,
      15,
      Math.cos(rad) * 22
    );
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={2.5}
      color="#ffffff"
      castShadow={castShadow}
      shadow-mapSize-width={4096}
      shadow-mapSize-height={4096}
      shadow-camera-far={50}
      shadow-camera-left={-25}
      shadow-camera-right={25}
      shadow-camera-top={25}
      shadow-camera-bottom={-25}
      shadow-bias={-0.0005}
      shadow-radius={12}
      shadow-normalBias={0.02}
    />
  );
};

const DUPLICATE_FURNITURE_EVENT_HANDLED_FLAG = '__configuratorDuplicateFurnitureHandled';
let lastDuplicateFurnitureRequest: { furnitureId: string; at: number } | null = null;

const PanelSimulationBoard: React.FC = () => {
  const panelSimulationPhase = useUIStore(state => state.panelSimulationPhase);
  const panelSimulationSheet = useUIStore(state => state.panelSimulationSheet);
  const panelSimulationViewBackup = useUIStore(state => state.panelSimulationViewBackup);
  const createGridPositions = useCallback((width: number, height: number) => {
    const cols = 12;
    const rows = 24;
    const values: number[] = [];
    const pushLine = (x1: number, y1: number, x2: number, y2: number) => {
      values.push(x1, y1, 0.006, x2, y2, 0.006);
    };

    for (let i = 0; i <= cols; i += 1) {
      const x = -width / 2 + (width * i) / cols;
      pushLine(x, -height / 2, x, height / 2);
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = -height / 2 + (height * i) / rows;
      pushLine(-width / 2, y, width / 2, y);
    }

    return new Float32Array(values);
  }, []);
  if ((panelSimulationPhase !== 'layout' && !panelSimulationViewBackup) || !panelSimulationSheet) return null;

  const {
    centerY,
    centerZ,
    sheetWidthWorld,
    sheetHeightWorld,
    sheetGapWorld,
    sheetCount,
  } = panelSimulationSheet;
  const sheets = panelSimulationSheet.sheets?.length
    ? panelSimulationSheet.sheets
    : Array.from({ length: sheetCount }).map((_, index) => {
      const totalWidth = sheetCount * sheetWidthWorld + Math.max(0, sheetCount - 1) * sheetGapWorld;
      return {
        centerX: panelSimulationSheet.centerX - totalWidth / 2 + sheetWidthWorld / 2 + index * (sheetWidthWorld + sheetGapWorld),
        widthWorld: sheetWidthWorld,
        heightWorld: sheetHeightWorld,
      };
    });
  return (
    <group userData={{ panelSimulationBoard: true }}>
      {sheets.map((sheet, index) => (
        <group
          key={index}
          position={[sheet.centerX, centerY, centerZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <mesh renderOrder={9990}>
            <planeGeometry args={[sheet.widthWorld, sheet.heightWorld]} />
            <meshBasicMaterial
              color="#f1f5f9"
              transparent
              opacity={0.52}
              depthWrite={false}
              depthTest={true}
              side={2}
            />
          </mesh>
          <lineSegments renderOrder={9991}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[createGridPositions(sheet.widthWorld, sheet.heightWorld), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#64748b" transparent opacity={0.72} depthTest={true} depthWrite={false} />
          </lineSegments>
          <lineSegments renderOrder={9992}>
            <edgesGeometry attach="geometry" args={[new THREE.PlaneGeometry(sheet.widthWorld, sheet.heightWorld)]} />
            <lineBasicMaterial color="#334155" transparent opacity={0.9} depthTest={true} depthWrite={false} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
};

const buildPanelSimulationSummary = (
  revision: number,
  sheet: PanelSimulationSheetLayout,
): PanelSimulationSummary => {
  const sheets = sheet.sheets?.length
    ? sheet.sheets
    : Array.from({ length: Math.max(0, sheet.sheetCount) }).map(() => ({
      centerX: sheet.centerX,
      widthWorld: sheet.sheetWidthWorld,
      heightWorld: sheet.sheetHeightWorld,
      material: '미지정',
      widthMm: Math.round(sheet.sheetWidthWorld / PANEL_SIMULATION_MM_TO_WORLD),
      heightMm: Math.round(sheet.sheetHeightWorld / PANEL_SIMULATION_MM_TO_WORLD),
    }));
  const stockBySpec = new Map<string, PanelSimulationSummary['stockSpecs'][number]>();
  const materialByName = new Map<string, number>();

  sheets.forEach(item => {
    const material = (item.material || '미지정').trim() || '미지정';
    const width = Math.round(item.widthMm || item.widthWorld / PANEL_SIMULATION_MM_TO_WORLD);
    const height = Math.round(item.heightMm || item.heightWorld / PANEL_SIMULATION_MM_TO_WORLD);
    const thickness = Number.isFinite(item.thickness) ? item.thickness : undefined;
    const key = `${material}|${thickness ?? ''}|${width}|${height}|${item.label || ''}`;
    const existing = stockBySpec.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      stockBySpec.set(key, {
        label: item.label,
        material,
        thickness,
        width,
        height,
        count: 1,
      });
    }
    materialByName.set(material, (materialByName.get(material) || 0) + 1);
  });

  const materialRank = (material: string) => {
    const normalized = material.toUpperCase();
    if (normalized === 'PB') return 0;
    if (normalized === 'MDF') return 1;
    if (normalized === 'PET') return 2;
    return 3;
  };

  return {
    revision,
    sheetCount: sheets.length,
    panelCount: sheet.panels?.length || 0,
    stockSpecs: Array.from(stockBySpec.values()).sort((a, b) => {
      const materialDiff = materialRank(a.material) - materialRank(b.material);
      if (materialDiff !== 0) return materialDiff;
      return (a.thickness || 0) - (b.thickness || 0) || a.height - b.height || a.width - b.width;
    }),
    materialCounts: Array.from(materialByName.entries())
      .map(([material, count]) => ({ material, count }))
      .sort((a, b) => materialRank(a.material) - materialRank(b.material) || a.material.localeCompare(b.material)),
  };
};

const PanelSimulationSummaryPopup: React.FC = () => {
  const summary = useUIStore(state => state.panelSimulationSummary);
  const setPanelSimulationSummary = useUIStore(state => state.setPanelSimulationSummary);

  if (!summary) return null;

  const formatThickness = (value?: number) => {
    if (!Number.isFinite(value)) return '두께미지정';
    return `${Number(value).toFixed(1).replace(/\.0$/, '')}mm`;
  };
  const materialThicknessCounts = Array.from(
    summary.stockSpecs.reduce((map, item) => {
      const key = `${item.material}|${item.thickness ?? ''}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += item.count;
      } else {
        map.set(key, {
          material: item.material,
          thickness: item.thickness,
          count: item.count,
        });
      }
      return map;
    }, new Map<string, { material: string; thickness?: number; count: number }>())
      .values()
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        pointerEvents: 'none',
        color: '#f8fafc',
        fontFamily: 'Pretendard, Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 'min(430px, calc(100% - 40px))',
          pointerEvents: 'auto',
          background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.9))',
          border: '1px solid rgba(248, 250, 252, 0.16)',
          borderRadius: 8,
          boxShadow: '0 24px 70px rgba(2, 6, 23, 0.42)',
          padding: '16px',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#38bdf8', fontWeight: 800 }}>PANEL LAYOUT</div>
            <div style={{ marginTop: 2, fontSize: 20, fontWeight: 900, letterSpacing: 0 }}>
              레이아웃 계산 완료
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setPanelSimulationSummary(null)}
            style={{
              flex: '0 0 auto',
              width: 30,
              height: 30,
              border: '1px solid rgba(226, 232, 240, 0.18)',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.07)',
              color: '#e2e8f0',
              fontSize: 18,
              lineHeight: '26px',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
          <div style={{ borderRadius: 8, background: 'rgba(248, 250, 252, 0.08)', border: '1px solid rgba(248, 250, 252, 0.08)', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>원장 수량</div>
            <div style={{ marginTop: 2, fontSize: 24, fontWeight: 900 }}>{summary.sheetCount}</div>
          </div>
          <div style={{ borderRadius: 8, background: 'rgba(248, 250, 252, 0.08)', border: '1px solid rgba(248, 250, 252, 0.08)', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>패널 수량</div>
            <div style={{ marginTop: 2, fontSize: 24, fontWeight: 900 }}>{summary.panelCount}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {materialThicknessCounts.map(item => (
            <div
              key={`${item.material}-${item.thickness ?? ''}`}
              style={{
                borderRadius: 7,
                background: 'rgba(14, 165, 233, 0.12)',
                border: '1px solid rgba(125, 211, 252, 0.18)',
                color: '#f8fafc',
                padding: '7px 9px',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {item.material} {formatThickness(item.thickness)} {item.count}장
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: 'grid', gap: 0, maxHeight: 164, overflowY: 'auto' }}>
          {summary.stockSpecs.map(item => (
            <div
              key={`${item.material}-${item.thickness ?? ''}-${item.width}-${item.height}-${item.label ?? ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: 12,
                fontSize: 12,
                color: '#cbd5e1',
                borderTop: '1px solid rgba(226, 232, 240, 0.1)',
                padding: '8px 0',
              }}
            >
              <span>
                <strong style={{ color: '#ffffff' }}>{item.material}</strong>
                {' '}{formatThickness(item.thickness)} · {item.width}×{item.height}
              </span>
              <strong style={{ color: '#ffffff' }}>{item.count}장</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PanelSimulationSourcePrimitive: React.FC<{ source: ReturnType<typeof getPanelSimulationSources>[number] }> = ({ source }) => {
  const clone = useMemo(() => {
    if (!source.objectClone) return null;
    const nextClone = source.objectClone.clone(true);
    nextClone.visible = true;
    nextClone.traverse(child => {
      child.visible = true;
    });
    return nextClone;
  }, [source.objectClone]);
  if (!clone) return null;
  return <primitive object={clone} />;
};

const PanelSimulationAccessoryVisual: React.FC<{ source: ReturnType<typeof getPanelSimulationSources>[number] }> = ({ source }) => {
  if (source.objectClone) {
    return <PanelSimulationSourcePrimitive source={source} />;
  }

  const materialProps = {
    color: source.color,
    roughness: 0.62,
    metalness: source.panelName.includes('옷봉') || source.panelName.includes('조절발') || source.panelName.includes('레그라') || source.panelName.includes('금속') ? 0.35 : 0.02,
    transparent: source.opacity < 1,
    opacity: source.opacity,
    depthTest: true,
    depthWrite: true,
  };

  if (source.shape === 'adjustableFoot') {
    const plateHeight = Math.min(source.args[1] * 0.24, 0.07);
    const cylinderHeight = Math.max(0.02, source.args[1] - plateHeight);
    const cylinderRadius = source.args[0] * 0.44;
    return (
      <>
        <mesh renderOrder={9998} position={[0, source.args[1] / 2 - plateHeight / 2, 0]}>
          <boxGeometry args={[source.args[0], plateHeight, source.args[2]]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        <mesh renderOrder={9998} position={[0, -plateHeight / 2, 0]}>
          <cylinderGeometry args={[cylinderRadius, cylinderRadius, cylinderHeight, 32]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <mesh renderOrder={9998}>
        <boxGeometry args={source.args} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <lineSegments renderOrder={9999}>
        <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(...source.args)]} />
        <lineBasicMaterial color="#475569" transparent opacity={0.78} depthTest={true} depthWrite={false} />
      </lineSegments>
    </>
  );
};

const getPanelSimulationCinematicPosition = (
  fromPosition: THREE.Vector3,
  toPosition: THREE.Vector3,
  progress: number,
  sourceIndex: number
) => {
  const distance = fromPosition.distanceTo(toPosition);
  const liftHeight = Math.min(4.6, Math.max(1.35, distance * 0.2));
  const drift = new THREE.Vector3(
    Math.sin(sourceIndex * 1.37) * Math.min(1.2, distance * 0.08),
    0,
    Math.cos(sourceIndex * 0.91) * Math.min(1.0, distance * 0.06)
  );

  const liftStart = fromPosition.clone().add(new THREE.Vector3(0, liftHeight * 0.75, 0)).add(drift.clone().multiplyScalar(0.35));
  if (progress < 0.24) {
    return fromPosition.clone().lerp(liftStart, easeOutCubic(progress / 0.24));
  }
  const sheetApproach = toPosition.clone().add(new THREE.Vector3(0, liftHeight * 0.48, 0)).sub(drift.clone().multiplyScalar(0.25));
  if (progress < 0.82) {
    const t = smootherStep((progress - 0.24) / 0.58);
    const control = fromPosition.clone().lerp(toPosition, 0.52).add(new THREE.Vector3(0, liftHeight * 1.1, 0)).add(drift);
    const a = liftStart.clone().lerp(control, t);
    const b = control.clone().lerp(sheetApproach, t);
    return a.lerp(b, t);
  }
  return sheetApproach.lerp(toPosition, smootherStep((progress - 0.82) / 0.18));
};

const getPanelSimulationAssemblyDropPosition = (
  fromPosition: THREE.Vector3,
  toPosition: THREE.Vector3,
  progress: number,
  sourceIndex: number
) => {
  const distance = fromPosition.distanceTo(toPosition);
  const liftHeight = Math.min(4.2, Math.max(1.45, distance * 0.18));
  const aboveTarget = toPosition.clone().add(new THREE.Vector3(0, liftHeight, 0));
  const takeoff = fromPosition.clone().add(new THREE.Vector3(0, liftHeight * 0.42, 0));

  if (progress < 0.18) {
    return fromPosition.clone().lerp(takeoff, easeOutCubic(progress / 0.18));
  }
  if (progress < 0.72) {
    const t = smootherStep((progress - 0.18) / 0.54);
    const control = fromPosition
      .clone()
      .lerp(aboveTarget, 0.48)
      .add(new THREE.Vector3(0, liftHeight * 0.38, 0));
    const sideOffset = new THREE.Vector3(
      Math.sin(sourceIndex * 0.73) * Math.min(0.22, distance * 0.018),
      0,
      Math.cos(sourceIndex * 0.61) * Math.min(0.18, distance * 0.014)
    );
    control.add(sideOffset);
    const a = takeoff.clone().lerp(control, t);
    const b = control.clone().lerp(aboveTarget, t);
    return a.lerp(b, t);
  }
  return aboveTarget.lerp(toPosition, smootherStep((progress - 0.72) / 0.28));
};

const PanelSimulationAccessoryItem: React.FC<{
  source: ReturnType<typeof getPanelSimulationSources>[number];
  sourceIndex: number;
  startPosition: THREE.Vector3;
  stagingQuaternion: THREE.Quaternion;
  assemblyOrder: number;
  phase: 'assembled' | 'layout';
  startTimeRef: React.MutableRefObject<number>;
}> = ({ source, sourceIndex, startPosition, stagingQuaternion, assemblyOrder, phase, startTimeRef }) => {
  const groupRef = useRef<THREE.Group>(null);
  const sourcePosition = source.worldPosition;
  const sourceQuaternion = source.worldQuaternion;

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const layoutScale = PANEL_SIMULATION_SCALE;
    if (phase === 'layout') {
      group.position.copy(startPosition);
      group.quaternion.copy(stagingQuaternion);
      group.scale.setScalar(layoutScale);
      return;
    }

    const elapsedBase = performance.now() / 1000 - startTimeRef.current;
    const delay = assemblyOrder * PANEL_SIMULATION_ASSEMBLY_DELAY_STEP;
    const rawProgress = Math.max(0, Math.min(1, (elapsedBase - delay) / PANEL_SIMULATION_DURATION));
    const progress = easeInOutCubic(rawProgress);
    const position = getPanelSimulationAssemblyDropPosition(startPosition, sourcePosition, progress, sourceIndex);
    const quaternion = stagingQuaternion.clone().slerp(sourceQuaternion, progress);
    group.position.copy(position);
    group.quaternion.copy(quaternion);
    group.scale.setScalar(THREE.MathUtils.lerp(layoutScale, 1, progress));
  });

  return (
    <group
      ref={groupRef}
      position={phase === 'layout' ? startPosition : startPosition}
      quaternion={stagingQuaternion}
      scale={phase === 'layout' ? PANEL_SIMULATION_SCALE : PANEL_SIMULATION_SCALE}
      renderOrder={9998}
      userData={{
        furnitureId: source.furnitureId,
        panelName: source.panelName,
        liveDimensionKey: `panel-simulation::${source.key}`,
        liveDimension: {
          widthMm: Math.round(source.args[0] * 100),
          heightMm: Math.round(source.args[1] * 100),
          depthMm: Math.round(source.args[2] * 100),
          sizeThree: [
            Math.max(0.001, source.args[0]),
            Math.max(0.001, source.args[1]),
            Math.max(0.001, source.args[2]),
          ],
        },
      }}
    >
      <PanelSimulationAccessoryVisual source={source} />
    </group>
  );
};

const PanelSimulationMovingPanels: React.FC = () => {
  const panelSimulationPhase = useUIStore(state => state.panelSimulationPhase);
  const panelSimulationRevision = useUIStore(state => state.panelSimulationRevision);
  const panelSimulationLayouts = useUIStore(state => state.panelSimulationLayouts);
  const panelSimulationSheet = useUIStore(state => state.panelSimulationSheet);
  const panelSimulationViewBackup = useUIStore(state => state.panelSimulationViewBackup);
  const completePanelSimulationAssembly = useUIStore(state => state.completePanelSimulationAssembly);
  const setPanelSimulationSummary = useUIStore(state => state.setPanelSimulationSummary);
  const startTimeRef = useRef(0);
  const shownSummaryRevisionRef = useRef(0);
  const [sourcesSnapshot, setSourcesSnapshot] = useState<ReturnType<typeof getPanelSimulationSources>>([]);

  useEffect(() => {
    if (panelSimulationRevision <= 0) return;
    if (Object.keys(panelSimulationLayouts).length === 0) return;
    const cameraSettleDelay = panelSimulationPhase === 'layout' ? 1.05 : 1.35;
    startTimeRef.current = performance.now() / 1000 + cameraSettleDelay;
    const updateSources = () => {
      const next = getPanelSimulationSources().filter(source => source.assemblyOnly);
      setSourcesSnapshot(prev => {
        if (prev.length === next.length && prev.every((source, index) => source === next[index])) {
          return prev;
        }
        return next;
      });
    };
    updateSources();
    const intervalId = window.setInterval(() => {
      updateSources();
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [panelSimulationPhase, panelSimulationRevision, panelSimulationLayouts]);

  useEffect(() => {
    if (panelSimulationPhase !== 'layout' || panelSimulationRevision <= 0 || !panelSimulationSheet) return;
    if (shownSummaryRevisionRef.current === panelSimulationRevision) return;
    const panelCount = panelSimulationSheet.panels?.length || 0;
    if (panelCount === 0) return;

    const maxOrder = panelSimulationSheet.panels?.reduce((max, panel) => Math.max(max, panel.order || 0), 0) ?? 0;
    const completeMs = Math.ceil((1.05 + maxOrder * PANEL_SIMULATION_DELAY_STEP + PANEL_SIMULATION_DURATION + 0.45) * 1000);
    const timeoutId = window.setTimeout(() => {
      shownSummaryRevisionRef.current = panelSimulationRevision;
      setPanelSimulationSummary(buildPanelSimulationSummary(panelSimulationRevision, panelSimulationSheet));
    }, completeMs);

    return () => window.clearTimeout(timeoutId);
  }, [panelSimulationPhase, panelSimulationRevision, panelSimulationSheet, setPanelSimulationSummary]);

  useEffect(() => {
    if (panelSimulationPhase !== 'assembled' || panelSimulationRevision <= 0 || !panelSimulationViewBackup) return;
    const sources = getPanelSimulationSources();
    const modules = useFurnitureStore.getState().placedModules;
    const furnitureCount = Math.max(1, modules.filter(module => !module.isSurroundPanel).length);
    const sourceMaxOrder = sources.reduce((maxOrder, source, sourceIndex) => {
      const order = getPanelAssemblySequence(
        source.furnitureId,
        source.panelName,
        [source.worldPosition.x, source.worldPosition.y, source.worldPosition.z],
        null,
        source.panelName.includes('옷봉')
      ) + (sourceIndex % 5);
      return Math.max(maxOrder, order);
    }, 0);
    const expectedLastOrder = Math.max(
      sourceMaxOrder,
      furnitureCount * PANEL_SIMULATION_FURNITURE_SPAN + PANEL_SIMULATION_FINAL_STAGE_ORDER + 160
    );
    const completeMs = Math.ceil((1.35 + expectedLastOrder * PANEL_SIMULATION_ASSEMBLY_DELAY_STEP + PANEL_SIMULATION_DURATION + 0.65) * 1000);
    const timeoutId = window.setTimeout(() => {
      completePanelSimulationAssembly(panelSimulationRevision);
    }, completeMs);
    return () => window.clearTimeout(timeoutId);
  }, [panelSimulationPhase, panelSimulationRevision, panelSimulationViewBackup, completePanelSimulationAssembly, panelSimulationLayouts]);

  if (panelSimulationRevision <= 0 || Object.keys(panelSimulationLayouts).length === 0) return null;

  const sources = sourcesSnapshot;
  const sameTypeIndexBySourceKey = new Map<string, number>();
  const assemblyOnlyIndexBySourceKey = new Map<string, number>();
  const assemblyOnlyCategoryIndexBySourceKey = new Map<string, number>();
  const assemblyOnlyCategoryBySourceKey = new Map<string, string>();
  const assemblyOnlyCategoryOrders = new Map<string, number>();
  const assemblyOnlySortedSources: ReturnType<typeof getPanelSimulationSources> = [];
  const furnitureDoorCounts = new Map<string, number>();
  const furniturePanelCounts = new Map<string, number>();
  const getAssemblyOnlyCategory = (panelName: string) => {
    if (panelName.includes('조절발')) return 'feet';
    if (panelName.includes('레그라')) return 'legra';
    if (panelName.includes('옷봉')) return 'rod';
    if (panelName.includes('유리장') || panelName.includes('금속도어') || panelName.includes('유리') || panelName.includes('타일')) return 'glass';
    return 'other';
  };
  const getAssemblyOnlySortWeight = (panelName: string) => {
    const category = getAssemblyOnlyCategory(panelName);
    if (category === 'feet') return 0;
    if (category === 'legra') return 1;
    if (category === 'rod') return 2;
    if (category === 'glass') return 3;
    return 4;
  };
  const getGlassAccessoryGroup = (panelName: string) => {
    if (panelName.includes('도어')) return 'door';
    if (panelName.includes('선반')) return 'shelf';
    if (panelName.includes('브라켓')) return 'bracket';
    if (panelName.includes('백패널') || panelName.includes('타일')) return 'back';
    return 'other';
  };
  const getGlassAccessorySortWeight = (panelName: string) => {
    const group = getGlassAccessoryGroup(panelName);
    if (group === 'door') return 0;
    if (group === 'shelf') return 1;
    if (group === 'bracket') return 2;
    if (group === 'back') return 3;
    return 4;
  };
  sources.forEach(source => {
    const furnitureKey = source.furnitureId || 'unknown';
    const isDoor = source.panelName.includes('도어');
    const counterKey = furnitureKey;
    const map = isDoor ? furnitureDoorCounts : furniturePanelCounts;
    const nextIndex = map.get(counterKey) || 0;
    sameTypeIndexBySourceKey.set(source.key, nextIndex);
    map.set(counterKey, nextIndex + 1);
    if (source.assemblyOnly) {
      assemblyOnlySortedSources.push(source);
    }
  });
  assemblyOnlySortedSources
    .sort((a, b) => {
      const weightDiff = getAssemblyOnlySortWeight(a.panelName) - getAssemblyOnlySortWeight(b.panelName);
      if (weightDiff !== 0) return weightDiff;
      if (getAssemblyOnlyCategory(a.panelName) === 'glass') {
        const glassWeightDiff = getGlassAccessorySortWeight(a.panelName) - getGlassAccessorySortWeight(b.panelName);
        if (glassWeightDiff !== 0) return glassWeightDiff;
      }
      const furnitureDiff = (a.furnitureId || '').localeCompare(b.furnitureId || '');
      if (furnitureDiff !== 0) return furnitureDiff;
      return a.panelName.localeCompare(b.panelName);
    })
    .forEach((source, index) => {
      const category = getAssemblyOnlyCategory(source.panelName);
      const categoryIndex = assemblyOnlyCategoryOrders.get(category) || 0;
      assemblyOnlyIndexBySourceKey.set(source.key, index);
      assemblyOnlyCategoryIndexBySourceKey.set(source.key, categoryIndex);
      assemblyOnlyCategoryBySourceKey.set(source.key, category);
      assemblyOnlyCategoryOrders.set(category, categoryIndex + 1);
    });
  const glassAssemblyPositionsBySourceKey = new Map<string, THREE.Vector3>();
  const glassAssemblySources = assemblyOnlySortedSources.filter(source => getAssemblyOnlyCategory(source.panelName) === 'glass');
  const glassGroups = ['door', 'shelf', 'bracket', 'back', 'other'];
  const glassGroupRows = glassGroups
    .map(group => glassAssemblySources.filter(source => getGlassAccessoryGroup(source.panelName) === group))
    .filter(groupSources => groupSources.length > 0);
  const glassRowMetrics = glassGroupRows.map(groupSources => {
    const footprints = groupSources.map(source => {
      const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(source.args);
      return {
        source,
        width: source.args[widthAxis.index] * PANEL_SIMULATION_SCALE,
        length: source.args[lengthAxis.index] * PANEL_SIMULATION_SCALE,
        thickness: source.args[thicknessAxis.index] * PANEL_SIMULATION_SCALE,
      };
    });
    return {
      footprints,
      maxLength: Math.max(1.05, ...footprints.map(footprint => footprint.length)),
      maxThickness: Math.max(0.04, ...footprints.map(footprint => footprint.thickness)),
    };
  });
  const glassTotalDepth = glassRowMetrics.reduce((sum, row, index) => (
    sum + row.maxLength + (index === glassRowMetrics.length - 1 ? 0 : 0.82)
  ), 0);
  const claimedLayoutKeys = new Set<string>();
  const getAssemblyOnlyStartPosition = (
    source: ReturnType<typeof getPanelSimulationSources>[number],
    assemblyIndex: number,
    category: string,
    categoryIndex: number
  ) => {
    const sheets = panelSimulationSheet?.sheets || [];
    const rightEdge = sheets.length
      ? Math.max(...sheets.map(sheet => sheet.centerX + sheet.widthWorld / 2))
      : (panelSimulationSheet?.centerX || 0) + (panelSimulationSheet?.sheetWidthWorld || 8) / 2;

    if (category === 'glass') {
      const cachedPosition = glassAssemblyPositionsBySourceKey.get(source.key);
      if (cachedPosition) return cachedPosition.clone();

      let cursorZ = -glassTotalDepth / 2;
      glassRowMetrics.forEach(row => {
        let cursorX = rightEdge + 1.55;
        row.footprints.forEach(footprint => {
          const position = new THREE.Vector3(
            cursorX + footprint.width / 2,
            (panelSimulationSheet?.centerY || 0) + Math.max(0.12, footprint.thickness * 0.5 + 0.08),
            cursorZ + row.maxLength / 2
          );
          glassAssemblyPositionsBySourceKey.set(footprint.source.key, position);
          cursorX += footprint.width + 0.86;
        });
        cursorZ += row.maxLength + 0.82;
      });

      return glassAssemblyPositionsBySourceKey.get(source.key)?.clone() || new THREE.Vector3(
        rightEdge + 1.55 + categoryIndex * 1.35,
        panelSimulationSheet?.centerY || 0,
        0
      );
    }

    const columns = 4;
    const rowGap = 1.05;
    const colGap = 1.15;
    const column = assemblyIndex % columns;
    const row = Math.floor(assemblyIndex / columns);
    const rowCount = Math.ceil(Math.max(1, assemblyOnlySortedSources.length) / columns);
    const zStart = -((rowCount - 1) * rowGap) / 2;
    return new THREE.Vector3(
      rightEdge + 1.25 + column * colGap,
      (panelSimulationSheet?.centerY || 0) + Math.max(0.35, source.args[1] * 0.5 + 0.08),
      zStart + row * rowGap
    );
  };
  const getCinematicPosition = (
    fromPosition: THREE.Vector3,
    toPosition: THREE.Vector3,
    progress: number,
    isAssembling: boolean,
    sourceIndex: number
  ) => {
    const distance = fromPosition.distanceTo(toPosition);
    const liftHeight = Math.min(4.6, Math.max(1.35, distance * 0.2));
    const drift = new THREE.Vector3(
      Math.sin(sourceIndex * 1.37) * Math.min(1.2, distance * 0.08),
      0,
      Math.cos(sourceIndex * 0.91) * Math.min(1.0, distance * 0.06)
    );

    if (isAssembling) {
      const travelEnd = toPosition.clone().add(new THREE.Vector3(0, liftHeight, 0));
      if (progress < 0.66) {
        const t = smootherStep(progress / 0.66);
        const controlA = fromPosition.clone().add(new THREE.Vector3(0, liftHeight * 0.65, 0)).add(drift);
        const controlB = travelEnd.clone().add(new THREE.Vector3(0, liftHeight * 0.28, 0)).sub(drift.clone().multiplyScalar(0.28));
        const a = fromPosition.clone().lerp(controlA, t);
        const b = controlA.clone().lerp(controlB, t);
        const c = controlB.clone().lerp(travelEnd, t);
        const d = a.lerp(b, t);
        const e = b.lerp(c, t);
        return d.lerp(e, t);
      }
      const settle = smootherStep((progress - 0.66) / 0.34);
      return travelEnd.lerp(toPosition, settle);
    }

    const liftStart = fromPosition.clone().add(new THREE.Vector3(0, liftHeight * 0.75, 0)).add(drift.clone().multiplyScalar(0.35));
    if (progress < 0.24) {
      return fromPosition.clone().lerp(liftStart, easeOutCubic(progress / 0.24));
    }
    const sheetApproach = toPosition.clone().add(new THREE.Vector3(0, liftHeight * 0.48, 0)).sub(drift.clone().multiplyScalar(0.25));
    if (progress < 0.82) {
      const t = smootherStep((progress - 0.24) / 0.58);
      const control = fromPosition.clone().lerp(toPosition, 0.52).add(new THREE.Vector3(0, liftHeight * 1.1, 0)).add(drift);
      const a = liftStart.clone().lerp(control, t);
      const b = control.clone().lerp(sheetApproach, t);
      return a.lerp(b, t);
    }
    return sheetApproach.lerp(toPosition, smootherStep((progress - 0.82) / 0.18));
  };
  const getAssemblyDropPosition = (
    fromPosition: THREE.Vector3,
    toPosition: THREE.Vector3,
    progress: number,
    sourceIndex: number
  ) => {
    const distance = fromPosition.distanceTo(toPosition);
    const liftHeight = Math.min(4.2, Math.max(1.45, distance * 0.18));
    const aboveTarget = toPosition.clone().add(new THREE.Vector3(0, liftHeight, 0));
    const takeoff = fromPosition.clone().add(new THREE.Vector3(0, liftHeight * 0.42, 0));

    if (progress < 0.18) {
      return fromPosition.clone().lerp(takeoff, easeOutCubic(progress / 0.18));
    }
    if (progress < 0.72) {
      const t = smootherStep((progress - 0.18) / 0.54);
      const control = fromPosition
        .clone()
        .lerp(aboveTarget, 0.48)
        .add(new THREE.Vector3(0, liftHeight * 0.38, 0));
      const sideOffset = new THREE.Vector3(
        Math.sin(sourceIndex * 0.73) * Math.min(0.22, distance * 0.018),
        0,
        Math.cos(sourceIndex * 0.61) * Math.min(0.18, distance * 0.014)
      );
      control.add(sideOffset);
      const a = takeoff.clone().lerp(control, t);
      const b = control.clone().lerp(aboveTarget, t);
      return a.lerp(b, t);
    }
    return aboveTarget.lerp(toPosition, smootherStep((progress - 0.72) / 0.28));
  };
  const getFallbackLayoutPosition = (source: ReturnType<typeof getPanelSimulationSources>[number], fallbackIndex: number) => {
    const sheets = panelSimulationSheet?.sheets || [];
    const rightEdge = sheets.length
      ? Math.max(...sheets.map(sheet => sheet.centerX + sheet.widthWorld / 2))
      : (panelSimulationSheet?.centerX || 0) + (panelSimulationSheet?.sheetWidthWorld || 8) / 2;
    return new THREE.Vector3(
      rightEdge + 1.25 + (fallbackIndex % 4) * 1.15,
      (panelSimulationSheet?.centerY || 0) + Math.max(0.35, source.args[1] * 0.5 + 0.08),
      -2.1 + Math.floor(fallbackIndex / 4) * 1.05
    );
  };
  const renderAssemblyOnlySource = (source: ReturnType<typeof getPanelSimulationSources>[number]) => {
    if (source.objectClone) {
      return <PanelSimulationSourcePrimitive source={source} />;
    }

    const materialProps = {
      color: source.color,
      roughness: 0.62,
      metalness: source.panelName.includes('옷봉') || source.panelName.includes('조절발') || source.panelName.includes('레그라') || source.panelName.includes('금속') ? 0.35 : 0.02,
      transparent: source.opacity < 1,
      opacity: source.opacity,
      depthTest: true,
      depthWrite: true,
    };

    if (source.shape === 'adjustableFoot') {
      const plateHeight = Math.min(source.args[1] * 0.24, 0.07);
      const cylinderHeight = Math.max(0.02, source.args[1] - plateHeight);
      const cylinderRadius = source.args[0] * 0.44;
      return (
        <>
          <mesh renderOrder={9998} position={[0, source.args[1] / 2 - plateHeight / 2, 0]}>
            <boxGeometry args={[source.args[0], plateHeight, source.args[2]]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
          <mesh renderOrder={9998} position={[0, -plateHeight / 2, 0]}>
            <cylinderGeometry args={[cylinderRadius, cylinderRadius, cylinderHeight, 32]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        </>
      );
    }

    if (source.shape === 'glassDoor') {
      const [width, height, depth] = source.args;
      const frame = Math.min(width, height) * 0.08;
      const glassWidth = Math.max(0.01, width - frame * 2);
      const glassHeight = Math.max(0.01, height - frame * 2);
      return (
        <>
          <mesh renderOrder={9998} position={[0, height / 2 - frame / 2, 0]}>
            <boxGeometry args={[width, frame, depth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
          <mesh renderOrder={9998} position={[0, -height / 2 + frame / 2, 0]}>
            <boxGeometry args={[width, frame, depth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
          <mesh renderOrder={9998} position={[-width / 2 + frame / 2, 0, 0]}>
            <boxGeometry args={[frame, glassHeight, depth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
          <mesh renderOrder={9998} position={[width / 2 - frame / 2, 0, 0]}>
            <boxGeometry args={[frame, glassHeight, depth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
          <mesh renderOrder={9997}>
            <boxGeometry args={[glassWidth, glassHeight, Math.max(0.01, depth * 0.28)]} />
            <meshPhysicalMaterial
              color="#8a6f52"
              roughness={0.18}
              metalness={0}
              transparent
              opacity={0.28}
              depthTest={true}
              depthWrite={false}
            />
          </mesh>
        </>
      );
    }

    return (
      <>
        <mesh renderOrder={9998}>
          <boxGeometry args={source.args} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        <lineSegments renderOrder={9999}>
          <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(...source.args)]} />
          <lineBasicMaterial color="#475569" transparent opacity={0.78} depthTest={true} depthWrite={false} />
        </lineSegments>
      </>
    );
  };

  return (
    <group userData={{ panelSimulationMovingPanels: true }}>
      {sources.map((source, sourceIndex) => {
        const sourcePosition = source.worldPosition.clone();
        if (source.assemblyOnly) {
          const assemblyOnlyIndex = assemblyOnlyIndexBySourceKey.get(source.key) || 0;
          const assemblyCategory = assemblyOnlyCategoryBySourceKey.get(source.key) || getAssemblyOnlyCategory(source.panelName);
          const assemblyCategoryIndex = assemblyOnlyCategoryIndexBySourceKey.get(source.key) || 0;
          const startPosition = getAssemblyOnlyStartPosition(source, assemblyOnlyIndex, assemblyCategory, assemblyCategoryIndex);
          const stagingQuaternion = source.shape === 'adjustableFoot'
            ? new THREE.Quaternion()
            : buildFlatPanelQuaternion(source.args, 0);
          const sameTypeIndex = sameTypeIndexBySourceKey.get(source.key) || 0;
          const assemblyOrder = getPanelAssemblySequence(
            source.furnitureId,
            source.panelName,
            [sourcePosition.x, sourcePosition.y, sourcePosition.z],
            null,
            source.panelName.includes('옷봉')
          ) + sameTypeIndex * 12;
          return (
            <PanelSimulationAccessoryItem
              key={source.key}
              source={source}
              sourceIndex={sourceIndex}
              startPosition={startPosition}
              stagingQuaternion={stagingQuaternion}
              assemblyOrder={assemblyOrder}
              phase={panelSimulationPhase}
              startTimeRef={startTimeRef}
            />
          );
        }
        const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(source.args);
        const layoutCandidates = Object.entries(panelSimulationLayouts)
          .filter(([key]) => key === source.layoutKey || key.startsWith(`${source.layoutKey}#`))
          .filter(([key]) => !claimedLayoutKeys.has(key))
          .sort(([, a], [, b]) => {
            const aWidth = a.widthWorld / Math.max(a.scale, 0.001);
            const aHeight = a.heightWorld / Math.max(a.scale, 0.001);
            const bWidth = b.widthWorld / Math.max(b.scale, 0.001);
            const bHeight = b.heightWorld / Math.max(b.scale, 0.001);
            const sourceWidth = source.args[widthAxis.index];
            const sourceHeight = source.args[lengthAxis.index];
            const aDiff = Math.abs(aWidth - sourceWidth) + Math.abs(aHeight - sourceHeight);
            const bDiff = Math.abs(bWidth - sourceWidth) + Math.abs(bHeight - sourceHeight);
            return aDiff - bDiff;
          });
        const selectedCandidate = layoutCandidates[0];
        const fallbackLayoutIndex = sourceIndex;
        const fallbackPosition = getFallbackLayoutPosition(source, fallbackLayoutIndex);
        let selectedLayoutKey: string | undefined;
        let layout = selectedCandidate?.[1];
        if (selectedCandidate) {
          [selectedLayoutKey, layout] = selectedCandidate;
          claimedLayoutKeys.add(selectedLayoutKey);
        }

        const sameTypeIndex = sameTypeIndexBySourceKey.get(source.key) || 0;
        const isDoorPanel = source.panelName.includes('도어');
        const assemblyOrder = getPanelAssemblySequence(
          source.furnitureId,
          source.panelName,
          [sourcePosition.x, sourcePosition.y, sourcePosition.z],
          null,
          source.panelName.includes('옷봉')
        ) + (isDoorPanel ? sameTypeIndex * 28 : (sourceIndex % 5));
        const exportOrder = getPanelSimulationExportOrder(source.panelName, layout.order, sourceIndex, sameTypeIndex);
        const delay = panelSimulationPhase === 'layout'
          ? exportOrder * PANEL_SIMULATION_LAYOUT_DELAY_STEP
          : assemblyOrder * PANEL_SIMULATION_ASSEMBLY_DELAY_STEP;
        const duration = panelSimulationPhase === 'layout' ? 1.05 : PANEL_SIMULATION_DURATION;
        const rawProgress = Math.max(0, Math.min(1, (elapsedBase - delay) / duration));
        const progress = easeInOutCubic(rawProgress);
        const targetScale = new THREE.Vector3(1, 1, 1);
        const layoutScale = layout?.scale ?? 1;
        targetScale.setComponent(thicknessAxis.index, layoutScale);
        targetScale.setComponent(widthAxis.index, layout ? layout.widthWorld / Math.max(source.args[widthAxis.index], 0.001) : 1);
        targetScale.setComponent(lengthAxis.index, layout ? layout.heightWorld / Math.max(source.args[lengthAxis.index], 0.001) : 1);

        const thickness = Math.min(source.args[0], source.args[1], source.args[2]);
        const targetPosition = new THREE.Vector3(
          layout?.worldX ?? fallbackPosition.x,
          layout ? layout.worldY + thickness * layout.scale * 0.5 + 0.03 : fallbackPosition.y,
          layout?.worldZ ?? fallbackPosition.z
        );
        const targetQuaternion = buildFlatPanelQuaternion(source.args, layout?.rotationZ ?? 0);
        const fromPosition = panelSimulationPhase === 'layout' ? sourcePosition : targetPosition;
        const toPosition = panelSimulationPhase === 'layout' ? targetPosition : sourcePosition;
        const fromQuaternion = panelSimulationPhase === 'layout' ? sourceQuaternion : targetQuaternion;
        const toQuaternion = panelSimulationPhase === 'layout' ? targetQuaternion : sourceQuaternion;
        const fromScale = panelSimulationPhase === 'layout' ? new THREE.Vector3(1, 1, 1) : targetScale;
        const toScale = panelSimulationPhase === 'layout' ? targetScale : new THREE.Vector3(1, 1, 1);
        const currentPosition = panelSimulationPhase === 'assembled'
          ? getAssemblyDropPosition(fromPosition, toPosition, progress, sourceIndex)
          : getCinematicPosition(fromPosition, toPosition, progress, false, sourceIndex);
        const currentQuaternion = fromQuaternion.clone().slerp(toQuaternion, progress);
        const currentScale = fromScale.clone().lerp(toScale, progress);
        const liveDimensionData = {
          widthMm: Math.round(source.args[0] * 100),
          heightMm: Math.round(source.args[1] * 100),
          depthMm: Math.round(source.args[2] * 100),
          useObjectBounds: true,
        };

        return (
          <group
            key={source.key}
            position={currentPosition}
            quaternion={currentQuaternion}
            scale={currentScale}
            renderOrder={9998}
            userData={{
              furnitureId: source.furnitureId,
              panelName: source.panelName,
              liveDimensionKey: `panel-simulation::${source.key}`,
              liveDimension: liveDimensionData,
            }}
          >
            <mesh
              name={`panel-simulation-mesh-${source.panelName}`}
              renderOrder={9998}
              userData={{
                furnitureId: source.furnitureId,
                panelName: source.panelName,
                liveDimensionKey: `panel-simulation::${source.key}`,
                liveDimension: liveDimensionData,
              }}
            >
              <boxGeometry args={source.args} />
              <meshStandardMaterial
                color={source.color}
                roughness={0.62}
                metalness={0.02}
                transparent={source.opacity < 1}
                opacity={source.opacity}
                depthTest={true}
                depthWrite={true}
              />
            </mesh>
            <lineSegments renderOrder={9999}>
              <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(...source.args)]} />
              <lineBasicMaterial color="#475569" transparent opacity={0.78} depthTest={true} depthWrite={false} />
            </lineSegments>
          </group>
        );
      })}
    </group>
  );
};

/**
 * Space3DView 컴포넌트
 * 공간 정보를 3D로 표시하는 Three.js 뷰어
 * 2D 모드에서는 orthographic 카메라로 정면 뷰 제공
 */
const Space3DView: React.FC<Space3DViewProps> = (props) => {
  const { spaceInfo, svgSize, viewMode = '3D', setViewMode, renderMode = 'solid', showAll = true, showFrame = true, showDimensions: showDimensionsProp, isEmbedded, isStep2, activeZone, hideEdges = false, readOnly = false, sceneRef, showFurniture: showFurnitureProp, onFurnitureClick, islandViewSide } = props;
  const location = useLocation();
  const { spaceInfo: storeSpaceInfo, updateColumn, removeColumn, updateWall, removeWall, addWall, removePanelB, updatePanelB } = useSpaceConfigStore();
  const { placedModules, updateFurnitureForColumns } = useFurnitureStore();
  const { view2DDirection, showDimensions: storeShowDimensions, showDimensionsText, showGuides, showAxis, activePopup, setView2DDirection, setViewMode: setUIViewMode, isColumnCreationMode, isWallCreationMode, isPanelBCreationMode, view2DTheme, showFurniture: storeShowFurniture, isMeasureMode, toggleMeasureMode, isEraserMode, selectedSlotIndex, setSelectedSlotIndex, cameraMode, isLayoutBuilderOpen, sunAngle, selectedColumnId, isLiveDimensionMode, isTapeMeasureMode, panelSimulationPhase, panelSimulationRevision, panelSimulationSheet, panelSimulationViewBackup, setPanelSimulationLayouts } = useUIStore();
  const { panels: livePanelsForSimulation } = useLivePanelData();

  // props로 전달된 showFurniture가 있으면 사용, 없으면 store 값 사용
  const showFurniture = showFurnitureProp !== undefined ? showFurnitureProp : storeShowFurniture;
  const { colors } = useThemeColors(); // Move this to top level to follow rules of hooks
  const { theme } = useTheme();
  const { placeFurniture: originalPlaceFurniture } = useFurniturePlacement();
  const { isMobile } = useResponsive();

  // 줌 슬라이더용 OrbitControls 참조
  const orbitControlsRef = useRef<any>(null);
  const [zoomSliderValue, setZoomSliderValue] = useState(50);
  // 초기 카메라 거리 저장 (슬라이더 범위 기준으로 사용)
  const initialCameraDistRef = useRef<number | null>(null);
  // 슬라이더 드래그 중 피드백 루프 방지 플래그
  const isSliderDraggingRef = useRef(false);
  // 3D 줌 애니메이션용
  const zoomAnimationRef = useRef<number | null>(null);
  const targetCameraDistRef = useRef<number | null>(null);
  // 슬라이더 쓰로틀링용 (성능 최적화)
  const zoomSliderValueRef = useRef(50);
  const sliderRafRef = useRef<number | null>(null);

  // 읽기 전용 모드 체크를 포함한 placeFurniture wrapper
  const placeFurniture = useCallback((slotIndex: number, zone?: 'normal' | 'dropped') => {
    if (readOnly) {
      console.log('🚫 읽기 전용 모드 - 가구 배치 차단');
      alert('읽기 전용 모드에서는 가구를 배치할 수 없습니다.');
      return;
    }
    originalPlaceFurniture(slotIndex, zone);
  }, [readOnly, originalPlaceFurniture]);

  // 기둥 위치 업데이트를 8ms(120fps)로 제한하여 부드러운 움직임
  const throttledUpdateColumn = useThrottle((id: string, updates: any) => {
    updateColumn(id, updates);
  }, 8);

  // 컴포넌트 마운트시 재질 설정 초기화 제거 (Firebase 로드 색상 유지)

  // 재질 설정 가져오기
  const materialConfig = storeSpaceInfo.materialConfig || {
    interiorColor: '#FFFFFF',
    doorColor: '#FFFFFF'  // 기본값도 흰색으로 변경 (테스트용)
  };
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : storeShowDimensions;
  const isPanelSimulationPresentation = viewMode === '3D' && (panelSimulationPhase === 'layout' || !!panelSimulationViewBackup);
  const effectiveShowDimensions = isPanelSimulationPresentation ? false : showDimensions;
  const effectiveShowDimensionsText = isPanelSimulationPresentation ? false : showDimensionsText;
  const effectiveShowGuides = isPanelSimulationPresentation ? false : showGuides;
  const effectiveShowAxis = isPanelSimulationPresentation ? false : showAxis;
  const dimensionDisplayEnabled = effectiveShowDimensions && effectiveShowDimensionsText;
  const clearedPanelSimulationRevisionRef = useRef(panelSimulationRevision);

  useEffect(() => {
    if (panelSimulationRevision <= 0 || clearedPanelSimulationRevisionRef.current === panelSimulationRevision) return;
    clearPanelSimulationSources();
    clearedPanelSimulationRevisionRef.current = panelSimulationRevision;
  }, [panelSimulationRevision]);

  // ESC 키 이벤트 리스너 - selectedFurnitureId 해제
  // (E 키 지우개 토글은 Configurator의 단축키 핸들러에서 처리)
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const { selectedFurnitureId, setSelectedFurnitureId } = useUIStore.getState();
        if (selectedFurnitureId) {
          setSelectedFurnitureId(null);
        }
      }
    };
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, []);

  // 가구 복제 이벤트 리스너
  useEffect(() => {
    console.log('복제 이벤트 리스너 등록됨');
    const handleDuplicateFurniture = (e: Event) => {
      if ((e as any)[DUPLICATE_FURNITURE_EVENT_HANDLED_FLAG]) return;
      (e as any)[DUPLICATE_FURNITURE_EVENT_HANDLED_FLAG] = true;

      console.log('복제 이벤트 수신됨');
      const customEvent = e as CustomEvent<{ furnitureId: string }>;
      const { furnitureId } = customEvent.detail;
      if (!furnitureId) return;

      const now = Date.now();
      if (
        lastDuplicateFurnitureRequest?.furnitureId === furnitureId &&
        now - lastDuplicateFurnitureRequest.at < 250
      ) {
        return;
      }
      lastDuplicateFurnitureRequest = { furnitureId, at: now };

      const { placedModules: latestPlacedModules, addModule: addModuleFn, setSelectedPlacedModuleId } = useFurnitureStore.getState();
      const { spaceInfo: latestSpaceInfo } = useSpaceConfigStore.getState();
      const setSelectedFurnitureId = useUIStore.getState().setSelectedFurnitureId;

      const activeSpaceInfo = latestSpaceInfo || spaceInfo;

      const furniture = latestPlacedModules.find(m => m.id === furnitureId);
      if (!furniture) {
        console.log('복제 실패: 가구를 찾을 수 없습니다', furnitureId);
        console.log('현재 배치된 가구들:', latestPlacedModules.map(m => m.id));
        return;
      }

      if (!activeSpaceInfo) {
        console.log('복제 실패: 공간 정보가 없습니다');
        return;
      }

      // 잠긴 가구는 복제 불가
      if (furniture.isLocked) {
        console.log('복제 실패: 잠긴 가구는 복제할 수 없습니다');
        return;
      }

      // 자유배치 가구 복제 처리
      if (furniture.isFreePlacement) {
        const newId = `${furniture.moduleId}-free-${Date.now()}`;
        const { adjustedPosition, adjustedWidth, columnSlotInfo, ...furnitureData } = furniture;

        // 겹치지 않는 위치 찾기
        const widthMm = furniture.freeWidth || furniture.moduleWidth || 450;
        const currentXmm = furniture.position.x * 100;
        const spaceBounds = getInternalSpaceBoundsX(activeSpaceInfo);
        const category = getModuleCategory(furniture);
        const halfW = widthMm / 2;

        // 우측 → 좌측 순으로 빈 공간 탐색 (1mm 단위)
        let targetXmm: number | null = null;
        const dupColumns = activeSpaceInfo.columns || [];

        // 우측 탐색: 원본 오른쪽 끝부터
        for (let x = currentXmm + widthMm; x <= spaceBounds.endX - halfW; x += 1) {
          const testBounds = { left: x - halfW, right: x + halfW, category };
          if (!checkFreeCollision(latestPlacedModules, testBounds) && !checkColumnCollision(dupColumns, testBounds)) {
            targetXmm = x;
            break;
          }
        }

        // 우측에 공간 없으면 좌측 탐색
        if (targetXmm === null) {
          for (let x = currentXmm - widthMm; x >= spaceBounds.startX + halfW; x -= 1) {
            const testBounds = { left: x - halfW, right: x + halfW, category };
            if (!checkFreeCollision(latestPlacedModules, testBounds) && !checkColumnCollision(dupColumns, testBounds)) {
              targetXmm = x;
              break;
            }
          }
        }

        if (targetXmm === null) {
          console.log('복제 실패: 자유배치 빈 공간이 없습니다');
          return;
        }

        const newFurniture = {
          ...furnitureData,
          id: newId,
          position: {
            x: targetXmm * 0.01, // mm → Three.js units
            y: furniture.position.y,
            z: furniture.position.z
          }
        };

        console.log('복제 성공: 자유배치 가구', newId, '위치:', targetXmm, 'mm');
        setSelectedPlacedModuleId(null);
        setSelectedFurnitureId(null);
        addModuleFn(newFurniture);
        setTimeout(() => {
          setSelectedPlacedModuleId(newId);
          setSelectedFurnitureId(newId);
        }, 100);
        return;
      }

      // 듀얼 가구인지 확인
      console.log('🔍 복제 - 가구 정보:', {
        id: furniture.id,
        moduleId: furniture.moduleId,
        baseModuleType: furniture.baseModuleType,
        isDualSlot: furniture.isDualSlot
      });

      const isDual = furniture.baseModuleType?.includes('dual-') || furniture.isDualSlot;

      // 빈 슬롯 찾기 (듀얼 가구는 2개 슬롯 차지)
      const indexing = calculateSpaceIndexing(activeSpaceInfo, []);
      const totalSlotsRaw = indexing.columnCount
        || activeSpaceInfo?.mainDoorCount
        || activeSpaceInfo?.customColumnCount
        || indexing.threeUnitPositions.length
        || 2;
      const totalSlots = Math.max(1, Math.floor(totalSlotsRaw));

      const getSlotCenterPosition = (slotIndex: number, dual: boolean) => {
        const zoneType = furniture.zone ?? 'normal';

        if (dual) {
          const zoneDualPositions = zoneType === 'dropped'
            ? indexing.zones?.dropped?.threeUnitDualPositions
            : indexing.zones?.normal?.threeUnitDualPositions;

          if (zoneDualPositions && zoneDualPositions[slotIndex] !== undefined) {
            return zoneDualPositions[slotIndex];
          }

          if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
            return indexing.threeUnitDualPositions[slotIndex];
          }
        } else {
          const zonePositions = zoneType === 'dropped'
            ? indexing.zones?.dropped?.threeUnitPositions
            : indexing.zones?.normal?.threeUnitPositions;

          if (zonePositions && zonePositions[slotIndex] !== undefined) {
            return zonePositions[slotIndex];
          }

          if (indexing.threeUnitPositions && indexing.threeUnitPositions[slotIndex] !== undefined) {
            return indexing.threeUnitPositions[slotIndex];
          }
        }

        // fall back to 기본 threeUnitPositions (듀얼/싱글 공용) 또는 0
        if (indexing.threeUnitPositions && indexing.threeUnitPositions[slotIndex] !== undefined) {
          return indexing.threeUnitPositions[slotIndex];
        }

        return 0;
      };

      const occupiedSlots = new Set<number>();
      const targetZone = furniture.zone ?? 'normal';
      latestPlacedModules.forEach(m => {
        if (m.slotIndex === undefined) return;

        const moduleZone = m.zone ?? 'normal';
        if (moduleZone !== targetZone) {
          return;
        }

        occupiedSlots.add(m.slotIndex);
        // 듀얼 가구는 다음 슬롯도 차지
        if (m.baseModuleType?.includes('dual-') || m.isDualSlot) {
          occupiedSlots.add(m.slotIndex + 1);
        }
      });

      const availableSlots: number[] = [];
      for (let i = 0; i < totalSlots; i++) {
        if (!occupiedSlots.has(i)) {
          availableSlots.push(i);
        }
      }

      // 현재 가구의 슬롯 인덱스
      const currentSlotIndex = furniture.slotIndex ?? 0;

      console.log('복제 시도:', {
        furnitureId: furniture.id,
        isDual,
        currentSlotIndex,
        totalSlots,
        occupiedSlots: Array.from(occupiedSlots),
        availableSlots
      });

      // 듀얼 가구의 경우 연속된 빈 슬롯 2개 필요
      if (isDual) {
        // 현재 슬롯 옆 슬롯 우선 확인 (우측 → 좌측 순서)
        let targetSlot: number | undefined;

        // 사용 가능한 연속 슬롯(2칸) 목록 계산
        const consecutivePairs: number[] = [];
        for (let i = 0; i < availableSlots.length - 1; i++) {
          const slot = availableSlots[i];
          if (availableSlots[i + 1] === slot + 1) {
            consecutivePairs.push(slot);
          }
        }

        // 우측으로 배치 가능한 연속 슬롯 중 가장 가까운 슬롯을 우선 사용
        const rightCandidate = consecutivePairs.find(slot => slot >= currentSlotIndex + 2);

        if (rightCandidate !== undefined) {
          targetSlot = rightCandidate;
        } else {
          // 좌측으로 배치 가능한 연속 슬롯을 탐색 (가장 가까운 슬롯 우선)
          const leftCandidate = [...consecutivePairs]
            .reverse()
            .find(slot => slot <= currentSlotIndex - 2);

          if (leftCandidate !== undefined) {
            targetSlot = leftCandidate;
          } else {
            // 어느 방향도 없으면 첫 번째 연속 슬롯 사용
            targetSlot = consecutivePairs[0];
          }
        }

        if (targetSlot === undefined) {
          console.log('복제 실패: 듀얼 가구를 위한 연속된 빈 슬롯이 없습니다');
          return;
        }

        // 복제 실행 - 슬롯에 맞는 정확한 위치 계산
        const slotCenterX = getSlotCenterPosition(targetSlot, true);

        const newId = `${furniture.baseModuleType}-${Date.now()}`;
        const { adjustedPosition, adjustedWidth, columnSlotInfo, ...furnitureData } = furniture;
        const newFurniture = {
          ...furnitureData,
          id: newId,
          slotIndex: targetSlot,
          position: {
            x: slotCenterX,
            y: furniture.position.y,
            z: furniture.position.z
          }
        };

        console.log('복제 성공: 듀얼 가구', newId, '슬롯:', targetSlot);
        // 먼저 기존 선택 해제
        setSelectedPlacedModuleId(null);
        setSelectedFurnitureId(null);
        // 가구 추가
        addModuleFn(newFurniture);
        // 복제된 가구 선택
        setTimeout(() => {
          setSelectedPlacedModuleId(newId);
          setSelectedFurnitureId(newId);
          console.log('복제된 가구 선택:', newId);
        }, 100);
      } else {
        // 싱글 가구
        if (availableSlots.length === 0) {
          console.log('복제 실패: 빈 슬롯이 없습니다');
          return;
        }

        const leftSlot = currentSlotIndex - 1;
        const rightSlot = currentSlotIndex + 1;
        const leftAvailable = leftSlot >= 0 && availableSlots.includes(leftSlot);
        const rightAvailable = rightSlot < totalSlots && availableSlots.includes(rightSlot);

        console.log('[Single Duplicate] 슬롯 확인', {
          currentSlotIndex,
          leftSlot,
          rightSlot,
          leftAvailable,
          rightAvailable,
          availableSlots,
          totalSlots
        });

        let targetSlot: number | undefined;
        if (leftAvailable && !rightAvailable) {
          targetSlot = leftSlot;
        } else if (!leftAvailable && rightAvailable) {
          targetSlot = rightSlot;
        } else if (leftAvailable && rightAvailable) {
          targetSlot = leftSlot; // 양쪽 모두 가능하면 좌측을 우선 사용
        }

        if (targetSlot === undefined) {
          console.log('복제 실패: 인접한 빈 슬롯이 없습니다 (싱글 가구)');
          return;
        }

        // 슬롯에 맞는 정확한 위치 계산
        const slotCenterX = getSlotCenterPosition(targetSlot, false);

        const newId = `${furniture.baseModuleType}-${Date.now()}`;
        const { adjustedPosition, adjustedWidth, columnSlotInfo, ...furnitureData } = furniture;
        const newFurniture = {
          ...furnitureData,
          id: newId,
          slotIndex: targetSlot,
          position: {
            x: slotCenterX,
            y: furniture.position.y,
            z: furniture.position.z
          }
        };

        console.log('복제 성공: 싱글 가구', newId, '슬롯:', targetSlot);
        // 먼저 기존 선택 해제
        setSelectedPlacedModuleId(null);
        setSelectedFurnitureId(null);
        // 가구 추가
        addModuleFn(newFurniture);
        // 복제된 가구 선택
        setTimeout(() => {
          setSelectedPlacedModuleId(newId);
          setSelectedFurnitureId(newId);
          console.log('복제된 가구 선택:', newId);
        }, 100);
      }
    };

    window.addEventListener('duplicate-furniture', handleDuplicateFurniture);

    // 기둥 복제 이벤트
    const handleDuplicateColumn = (event: any) => {
      const { columnId } = event.detail || {};
      if (!columnId) return;
      const columns = useSpaceConfigStore.getState().spaceInfo.columns || [];
      const column = columns.find((c: any) => c.id === columnId);
      if (!column) return;
      const newId = `column-${Date.now()}`;
      // 약간 우측(+200mm)으로 이동시켜 복제
      const newPosition: [number, number, number] = [
        (column.position[0] || 0) + 0.2,
        column.position[1] || 0,
        column.position[2] || 0,
      ];
      const newColumn = { ...column, id: newId, position: newPosition };
      useSpaceConfigStore.getState().setSpaceInfo({ columns: [...columns, newColumn] });
    };
    window.addEventListener('duplicate-column', handleDuplicateColumn);

    return () => {
      window.removeEventListener('duplicate-furniture', handleDuplicateFurniture);
      window.removeEventListener('duplicate-column', handleDuplicateColumn);
    };
    // 핸들러 내부에서 useFurnitureStore.getState() / useSpaceConfigStore.getState()로
    // 최신 상태를 직접 읽으므로 deps는 비워둠. (이전엔 [spaceInfo]였는데, spaceInfo가 자주
    // 바뀌면 useEffect가 cleanup→재등록을 반복하다 strict mode/빠른 state 업데이트 시
    // 한 시점에 핸들러가 중복 등록되어 복사·붙여넣기 1번 시 2개 가구가 생성되는 버그가
    // 발생했음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기둥 변경 감지하여 즉시 리렌더링 및 가구 업데이트
  useEffect(() => {
    if (spaceInfo) {
      console.log('🔄 Space3DView - 기둥 상태 변경 감지:', {
        columnsCount: spaceInfo.columns?.length || 0,
        columnsData: spaceInfo.columns?.map(col => ({ id: col.id, position: col.position, depth: col.depth }))
      });

      // 기둥 변경 시 가구의 adjustedWidth 업데이트
      updateFurnitureForColumns(spaceInfo);
    }
    // Three.js 씬 강제 업데이트는 ThreeCanvas에서 자동으로 처리됨
  }, [spaceInfo?.columns]); // updateFurnitureForColumns는 dependency에서 제외 (무한 루프 방지)

  // 가구 배치 시에도 adjustedWidth 업데이트
  useEffect(() => {
    console.log('🔄 [Space3DView] placedModules 변경 감지:', {
      count: placedModules.length,
      spaceInfo: !!spaceInfo,
      columns: spaceInfo?.columns?.length || 0
    });
    if (spaceInfo) {
      console.log('🔄 [Space3DView] updateFurnitureForColumns 호출');
      updateFurnitureForColumns(spaceInfo);
    }
  }, [placedModules.length, spaceInfo, updateFurnitureForColumns]); // 가구 개수 변경 시에만 호출


  const baseDistanceMultiplier = useMemo(() => {
    if (isEmbedded) return 5.0;
    // 모바일 2D: 3배 거리
    if (isMobile) {
      return 3.0;
    }
    return 2.0;
  }, [isEmbedded, isMobile]);

  // 카메라 타겟 Y 좌표 계산 (모바일에서는 화면을 위로 올리기 위해 타겟을 낮춤)
  const targetY = useMemo(() => {
    const height = spaceInfo?.height || 2400;
    // 모바일에서는 0.42 (약간 아래), 데스크탑은 0.5 (중앙)
    const ratio = isMobile ? 0.42 : 0.5;
    return mmToThreeUnits(height * ratio);
  }, [spaceInfo?.height, isMobile]);

  // 3D 슬라이더 거리 범위 계산 (초기 카메라 거리 기준)
  const getDistanceRange = useCallback(() => {
    const initDist = initialCameraDistRef.current || 30;
    // 슬라이더 50 = 초기 거리, 0 = 2배 멀리, 100 = 최대 줌인
    const minD = Math.max(2, initDist * 0.15); // 줌인 한계
    const maxD = initDist * 2;                   // 줌아웃 한계
    return { minD, maxD };
  }, []);

  // OrbitControls 준비 콜백 - 줌 슬라이더 동기화를 위해 change 이벤트 리스닝
  const handleControlsReady = useCallback((controls: any) => {
    orbitControlsRef.current = controls;
    // 초기 카메라 거리 저장
    if (controls?.object && !controls.object.isOrthographicCamera) {
      initialCameraDistRef.current = controls.object.position.distanceTo(controls.target);
    }
    // 초기 슬라이더 값 설정
    updateSliderFromCamera(controls);
    // change 이벤트로 휠/트랙패드 줌 시 슬라이더 동기화 (throttle로 성능 최적화)
    let rafPending = false;
    const onChange = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        updateSliderFromCamera(controls);
        rafPending = false;
      });
    };
    controls.addEventListener('change', onChange);
    // cleanup은 컴포넌트 unmount 시
    return () => {
      controls.removeEventListener('change', onChange);
      if (zoomAnimationRef.current) {
        cancelAnimationFrame(zoomAnimationRef.current);
      }
    };
  }, [viewMode]);

  // 카메라 상태에서 슬라이더 값 계산
  const updateSliderFromCamera = useCallback((controls: any) => {
    // 슬라이더 드래그 중이면 피드백 루프 방지
    if (isSliderDraggingRef.current) return;
    if (!controls?.object) return;
    const cam = controls.object;
    if (cam.isOrthographicCamera) {
      // 2D: zoom 0.5~10 → slider 0~100 (로그 스케일)
      const minZ = 0.5, maxZ = 10;
      const logMin = Math.log(minZ), logMax = Math.log(maxZ);
      const logVal = Math.log(Math.max(minZ, Math.min(maxZ, cam.zoom)));
      const val = ((logVal - logMin) / (logMax - logMin)) * 100;
      zoomSliderValueRef.current = val;
      setZoomSliderValue(val);
    } else {
      // 3D: 카메라 거리 → slider (근거리=100, 원거리=0), 초기 거리 기준 동적 범위
      const dist = cam.position.distanceTo(controls.target);
      const { minD, maxD } = getDistanceRange();
      const clamped = Math.max(minD, Math.min(maxD, dist));
      const val = 100 - ((clamped - minD) / (maxD - minD)) * 100;
      zoomSliderValueRef.current = val;
      setZoomSliderValue(val);
    }
  }, [getDistanceRange]);

  // 슬라이더 값 변경 → 카메라 줌 즉시 적용 (피드백 루프만 차단)
  const handleZoomSliderChange = useCallback((value: number) => {
    isSliderDraggingRef.current = true;
    zoomSliderValueRef.current = value;

    // 카메라는 즉시 업데이트 (지연 없이)
    const controls = orbitControlsRef.current;
    if (controls?.object) {
      const cam = controls.object;
      if (cam.isOrthographicCamera) {
        const minZ = 0.5, maxZ = 10;
        const logMin = Math.log(minZ), logMax = Math.log(maxZ);
        const logVal = logMin + (value / 100) * (logMax - logMin);
        cam.zoom = Math.exp(logVal);
        cam.updateProjectionMatrix();
      } else {
        const { minD, maxD } = getDistanceRange();
        const targetDist = maxD - (value / 100) * (maxD - minD);
        const direction = cam.position.clone().sub(controls.target).normalize();
        cam.position.copy(controls.target.clone().add(direction.multiplyScalar(targetDist)));
      }
      controls.update();
    }

    // React 상태 업데이트는 RAF로 쓰로틀링 (리렌더 최소화)
    if (!sliderRafRef.current) {
      sliderRafRef.current = requestAnimationFrame(() => {
        setZoomSliderValue(zoomSliderValueRef.current);
        sliderRafRef.current = null;
      });
    }
  }, [getDistanceRange]);

  // 슬라이더 드래그 종료 시 플래그 해제
  const handleZoomSliderEnd = useCallback(() => {
    // 드래그 종료 시 최종 값 동기화
    if (sliderRafRef.current) {
      cancelAnimationFrame(sliderRafRef.current);
      sliderRafRef.current = null;
    }
    setZoomSliderValue(zoomSliderValueRef.current);
    setTimeout(() => { isSliderDraggingRef.current = false; }, 50);
  }, []);

  // +/- 버튼용 줌 스텝 함수 (부드러운 애니메이션)
  const handleZoomStep = useCallback((delta: number) => {
    const startValue = zoomSliderValue;
    const endValue = Math.max(0, Math.min(100, startValue + delta));
    if (startValue === endValue) return;

    isSliderDraggingRef.current = true;
    if (zoomAnimationRef.current) cancelAnimationFrame(zoomAnimationRef.current);

    const duration = 200; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * eased;

      zoomSliderValueRef.current = currentValue;
      setZoomSliderValue(currentValue);
      const controls = orbitControlsRef.current;
      if (controls?.object) {
        const cam = controls.object;
        if (cam.isOrthographicCamera) {
          const minZ = 0.5, maxZ = 10;
          const logMin = Math.log(minZ), logMax = Math.log(maxZ);
          cam.zoom = Math.exp(logMin + (currentValue / 100) * (logMax - logMin));
          cam.updateProjectionMatrix();
        } else {
          const { minD, maxD } = getDistanceRange();
          const dist = maxD - (currentValue / 100) * (maxD - minD);
          const dir = cam.position.clone().sub(controls.target).normalize();
          cam.position.copy(controls.target.clone().add(dir.multiplyScalar(dist)));
        }
        controls.update();
      }

      if (progress < 1) {
        zoomAnimationRef.current = requestAnimationFrame(animate);
      } else {
        zoomAnimationRef.current = null;
        setTimeout(() => { isSliderDraggingRef.current = false; }, 50);
      }
    };

    zoomAnimationRef.current = requestAnimationFrame(animate);
  }, [zoomSliderValue, getDistanceRange]);

  // 2D 뷰 방향별 카메라 위치 계산 - threeUtils의 최적화된 거리 사용
  const cameraPosition = useMemo(() => {
    if (!spaceInfo) {
      return [0, 10, 20] as [number, number, number]; // 기본 카메라 위치
    }
    const { width, height, depth = 600 } = spaceInfo; // 기본 깊이 600mm

    // threeUtils의 calculateOptimalDistance 사용 (3D와 동일한 계산)
    const distance = calculateOptimalDistance(width, height, depth, placedModules.length);
    const centerX = 0;
    const centerY = targetY;
    const centerZ = 0;

    // 2D front 위치 계산 - 3D와 동일한 거리 사용
    const frontPosition = [centerX, centerY, distance] as [number, number, number];

    // 3D 모드에서는 원근 모드 기존 유지
    if (viewMode === '3D') {
      // 모바일에서는 1.5배 거리
      if (isMobile) {
        return [centerX, centerY, distance * 1.5] as [number, number, number];
      }
      return frontPosition;
    }

    // 2D 모드에서는 방향별 카메라 위치 - 각 방향에 최적화된 거리 사용
    // 임베디드(미리보기) 또는 모바일에서는 더 줌아웃해서 전체가 보이도록
    const distanceMultiplier = baseDistanceMultiplier;
    switch (view2DDirection) {
      case 'front':
        // 정면: Z축에서 깊이를 고려한 최적 거리
        return [centerX, centerY, distance * distanceMultiplier] as [number, number, number];
      case 'left':
        // 좌측: X축에서 너비를 고려한 최적 거리
        const leftDistance = calculateOptimalDistance(depth, height, width, placedModules.length);
        return [-leftDistance * distanceMultiplier, centerY, centerZ] as [number, number, number];
      case 'right':
        // 우측: X축에서 너비를 고려한 최적 거리
        const rightDistance = calculateOptimalDistance(depth, height, width, placedModules.length);
        return [rightDistance * distanceMultiplier, centerY, centerZ] as [number, number, number];
      case 'top':
        // 상단: Y축에서 너비와 깊이를 고려한 최적 거리
        const topDistance = calculateOptimalDistance(width, depth, height, placedModules.length);
        // 상부뷰는 위에서 아래를 내려다보므로 centerY에 거리를 더함
        return [centerX, centerY + topDistance * distanceMultiplier, centerZ] as [number, number, number];
      case 'all':
        // 전체 뷰에서는 정면 카메라 위치 사용 (4분할은 별도 처리)
        return frontPosition;
      default:
        return frontPosition;
    }
  }, [spaceInfo?.width, spaceInfo?.height, spaceInfo?.depth, viewMode, view2DDirection, placedModules.length, baseDistanceMultiplier, targetY, isMobile]);

  // 카메라 타겟 배열 memoization (하위 컴포넌트의 불필요한 useEffect 재실행 방지)
  const cameraTargetArr = useMemo<[number, number, number]>(() => [0, targetY, 0], [targetY]);

  useEffect(() => {
    let cancelled = false;

    if (panelSimulationPhase !== 'layout') {
      if (!panelSimulationViewBackup) {
        setPanelSimulationLayouts({}, null);
      }
      return () => {
        cancelled = true;
      };
    }

    const excludedByFurniture = new Map<string, Set<string>>();
    placedModules.forEach((module: any) => {
      if (!module?.id || !Array.isArray(module.panelExclusions)) return;
      const aliases = new Set<string>();
      module.panelExclusions.forEach((panelName: string) => {
        getExcludedPanelAliases(panelName).forEach(alias => aliases.add(alias));
      });
      if (aliases.size > 0) excludedByFurniture.set(module.id, aliases);
    });

    const includedPanels = livePanelsForSimulation
      .filter(panel => {
        if (!panel.furnitureId || !panel.meshName) return true;
        const excluded = excludedByFurniture.get(panel.furnitureId);
        return !excluded?.has(panel.meshName);
      })
      .map(toSimulationCutPanel);

    if (includedPanels.length === 0) {
      setPanelSimulationLayouts({}, null);
      return () => {
        cancelled = true;
      };
    }

    const boardCenterY = mmToThreeUnits(spaceInfo?.height || 2400) + 3;

    (async () => {
      const settings = getPanelSimulationSettings();
      const stock = getPanelSimulationStock(includedPanels);
      const results = await buildPanelSimulationResults(includedPanels, settings, stock);
      if (cancelled) return;
      const { layouts, sheet } = buildPanelSimulationTargets(results, boardCenterY);
      setPanelSimulationLayouts(layouts, sheet);
    })().catch(error => {
      console.error('[PanelSimulation] optimizer layout failed:', error);
      if (!cancelled) {
        setPanelSimulationLayouts({}, null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    panelSimulationPhase,
    panelSimulationRevision,
    livePanelsForSimulation,
    placedModules,
    spaceInfo?.height,
    panelSimulationViewBackup,
    setPanelSimulationLayouts,
  ]);

  useEffect(() => {
    if (panelSimulationPhase !== 'layout') {
      const controls = orbitControlsRef.current;
      if (controls?.object) {
        if (panelSimulationRevision > 0 && viewMode === '3D') {
          const camera = controls.object;
          const startPosition = camera.position.clone();
          const startTarget = controls.target.clone();
          const endPosition = new THREE.Vector3(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
          const endTarget = new THREE.Vector3(cameraTargetArr[0], cameraTargetArr[1], cameraTargetArr[2]);
          const duration = 1450;
          const startTime = performance.now();
          let rafId = 0;

          const animate = (now: number) => {
            const progress = Math.min(1, (now - startTime) / duration);
            const eased = progress < 0.5
              ? 4 * progress * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            camera.position.lerpVectors(startPosition, endPosition, eased);
            controls.target.lerpVectors(startTarget, endTarget, eased);
            camera.up.set(0, 1, 0);
            camera.lookAt(controls.target);
            controls.update();
            updateSliderFromCamera(controls);

            if (progress < 1) {
              rafId = requestAnimationFrame(animate);
            }
          };

          rafId = requestAnimationFrame(animate);
          return () => cancelAnimationFrame(rafId);
        }

        controls.object.up.set(0, 1, 0);
        controls.update();
      }
      return;
    }
    const controls = orbitControlsRef.current;
    if (!controls?.object) return;

    const camera = controls.object;
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(
      panelSimulationSheet?.centerX ?? 0,
      panelSimulationSheet?.centerY ?? targetY,
      panelSimulationSheet?.centerZ ?? 0
    );
    const fallbackWidth = Math.max(8, mmToThreeUnits(spaceInfo?.width || 2400));
    const fallbackHeight = Math.max(8, mmToThreeUnits(spaceInfo?.height || 2400));
    const sheetWorldWidth = panelSimulationSheet
      ? ((panelSimulationSheet.sheets || []).reduce((sum, sheet, index) => (
        sum + sheet.widthWorld + (index === (panelSimulationSheet.sheets?.length || 0) - 1 ? 0 : panelSimulationSheet.sheetGapWorld)
      ), 0) || panelSimulationSheet.sheetWidthWorld)
      : fallbackWidth;
    const sheetWorldHeight = panelSimulationSheet?.sheetHeightWorld ?? fallbackHeight;
    const distance = Math.max(26, sheetWorldHeight * 1.45, sheetWorldWidth * 1.08);
    const endPosition = new THREE.Vector3(
      (panelSimulationSheet?.centerX ?? 0) - distance * 0.52,
      (panelSimulationSheet?.centerY ?? targetY) + distance * 0.78,
      (panelSimulationSheet?.centerZ ?? 0) + distance * 0.68
    );
    const duration = 1200;
    const startTime = performance.now();
    let rafId = 0;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(startPosition, endPosition, eased);
      controls.target.lerpVectors(startTarget, endTarget, eased);
      camera.up.set(0, 1, 0);
      camera.lookAt(controls.target);
      controls.update();
      updateSliderFromCamera(controls);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    panelSimulationPhase,
    panelSimulationRevision,
    panelSimulationSheet,
    cameraPosition,
    cameraTargetArr,
    spaceInfo?.width,
    spaceInfo?.height,
    targetY,
    viewMode,
    updateSliderFromCamera,
  ]);

  // Canvas key를 완전히 제거하여 재생성 방지
  // viewMode나 view2DDirection 변경 시에도 Canvas를 재생성하지 않음

  // 드롭 이벤트 핸들러
  const handleDrop = (e: React.DragEvent) => {
    console.log('🎯 [Space3DView] handleDrop 호출됨!');
    e.preventDefault();
    e.stopPropagation();

    // Canvas 요소 찾기
    const canvas = e.currentTarget.querySelector('canvas');
    if (!canvas) {
      console.log('❌ [Space3DView] Canvas 요소를 찾을 수 없음');
      return;
    }

    // 드래그 데이터 확인
    const dragData = e.dataTransfer.getData('application/json');
    console.log('🎯 [Space3DView] Drag data:', dragData);
    if (!dragData) {
      console.log('❌ [Space3DView] Drag data가 없음');
      return;
    }

    try {
      const parsedData = JSON.parse(dragData);
      console.log('🎯 [Space3DView] Parsed drag data:', parsedData);

      // 기둥 드롭 처리
      if (parsedData.type === 'column') {
        handleColumnDrop(e, parsedData);
        return;
      }

      // 가벽 드롭 처리
      if (parsedData.type === 'wall') {
        handleWallDrop(e, parsedData);
        return;
      }

      // 패널B 드롭 처리
      if (parsedData.type === 'panelB') {
        handlePanelBDrop(e, parsedData);
        return;
      }

      // 자유배치 모드: handleFreeDrop 우선 호출
      const currentSpaceInfo = useSpaceConfigStore.getState().spaceInfo;
      if (currentSpaceInfo.layoutMode === 'free-placement' && typeof (window as any).handleFreeDrop === 'function') {
        console.log('🎯 Space3DView - handleFreeDrop 호출 (자유배치 모드)');
        try {
          const result = (window as any).handleFreeDrop(e.nativeEvent, canvas);
          console.log('🎯 Space3DView handleFreeDrop - result:', result);
        } catch (error) {
          console.error('❌ handleFreeDrop 실행 중 에러:', error);
        }
        return;
      }

      // 균등분할 모드: 기존 가구 드롭 처리
      const handleSlotDrop = window.handleSlotDrop;
      console.log('🎯 Space3DView - window.handleSlotDrop 확인:', {
        hasHandleSlotDrop: !!handleSlotDrop,
        typeofHandleSlotDrop: typeof handleSlotDrop,
        activeZone
      });

      if (typeof handleSlotDrop === 'function') {
        console.log('🎯 Space3DView handleDrop - activeZone:', activeZone);
        try {
          // activeZone은 항상 전달 (undefined일 수도 있음)
          const result = handleSlotDrop(e.nativeEvent, canvas, activeZone);
          console.log('🎯 Space3DView handleDrop - result:', result);
        } catch (error) {
          console.error('❌ handleSlotDrop 실행 중 에러:', error);
          console.error('에러 스택:', error.stack);
        }
      } else {
        console.error('❌ window.handleSlotDrop이 없습니다! 기본 가구 배치 처리를 시도합니다.');

        // 간단한 폴백 처리
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        console.log('🎯 간단한 가구 배치 시도:', {
          mouseX: x,
          mouseY: y,
          moduleData: parsedData.moduleData
        });

        // 첫 번째 빈 슬롯에 배치
        const placedModules = useFurnitureStore.getState().placedModules;
        const addModule = useFurnitureStore.getState().addModule;
        const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
        const hasFurniture = placedModules.length > 0 || true; // 가구를 추가하려고 하므로 true
        const indexing = calculateSpaceIndexing(spaceInfo, hasFurniture);

        // 첫 번째 빈 슬롯 찾기
        let availableSlot = -1;
        for (let i = 0; i < indexing.columnCount; i++) {
          const isOccupied = placedModules.some(m => m.slotIndex === i);
          if (!isOccupied) {
            availableSlot = i;
            break;
          }
        }

        if (availableSlot >= 0) {
          const customWidth = indexing.slotWidths?.[availableSlot] || indexing.columnWidth;
          const newModule = {
            id: `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            moduleId: parsedData.moduleData.id,
            position: {
              x: indexing.threeUnitPositions[availableSlot],
              y: 0,
              z: 0
            },
            rotation: 0,
            hasDoor: false,
            customDepth: Math.min(580, spaceInfo.depth * 0.9),
            slotIndex: availableSlot,
            isDualSlot: parsedData.moduleData.id.startsWith('dual-'),
            isValidInCurrentSpace: true,
            adjustedWidth: parsedData.moduleData.dimensions.width,
            hingePosition: 'right' as const,
            customWidth: customWidth
          };

          addModule(newModule);
          console.log('✅ 폴백 가구 배치 성공:', newModule);
        }
      }
    } catch (error) {
      console.error('드롭 데이터 파싱 오류:', error);
      console.error('에러 스택:', error.stack);
    }
  };

  // 기둥 드롭 핸들러
  const handleColumnDrop = (e: React.DragEvent, columnData: any) => {
    // 캔버스 중앙에 기둥 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산

    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const columnDepthM = (columnData.depth || 730) * 0.01; // columnData에서 깊이 가져오기
    const zPosition = -(spaceDepthM / 2) + (columnDepthM / 2); // 뒷벽에 맞닿도록

    // 기둥 생성 (바닥 기준으로 위치 설정)
    const newColumn = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: columnData.width || 300, // columnData에서 폭 가져오기
      height: spaceInfo?.height || 2400, // 항상 공간 높이 사용
      depth: columnData.depth || 730, // columnData에서 깊이 가져오기
      color: columnData.color || '#888888',
      material: columnData.material || 'concrete'
    };

    console.log('🏗️ 기둥 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      columnDepthM,
      column: newColumn
    });

    // 스토어에 기둥 추가
    const { addColumn } = useSpaceConfigStore.getState();
    addColumn(newColumn);
  };

  // 가벽 드롭 핸들러
  const handleWallDrop = (e: React.DragEvent, wallData: any) => {
    // 캔버스 중앙에 가벽 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산

    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const wallDepthM = (wallData.depth || 730) * 0.01; // 730mm를 Three.js 단위로 변환
    const zPosition = -(spaceDepthM / 2) + (wallDepthM / 2); // 뒷벽에 맞닿도록

    // 가벽 생성 (바닥 기준으로 위치 설정)
    const newWall = {
      id: `wall-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: wallData.width || 120, // 120mm 
      height: wallData.height || spaceInfo?.height || 2400, // 공간 높이와 동일 (2400mm)
      depth: wallData.depth || 730, // 730mm
      color: wallData.color || '#888888',
      material: wallData.material || 'concrete'
    };

    console.log('🧱 가벽 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      wallDepthM,
      wall: newWall
    });

    // 스토어에 가벽 추가
    addWall(newWall);
  };

  // 패널B 드롭 핸들러
  const handlePanelBDrop = (e: React.DragEvent, panelBData: any) => {
    // 캔버스 중앙에 패널B 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산

    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const panelDepthM = (panelBData.depth || 730) * 0.01; // panelBData에서 깊이 가져오기
    const zPosition = -(spaceDepthM / 2) + (panelDepthM / 2); // 뒷벽에 맞닿도록

    // 패널B 생성 (바닥 기준으로 위치 설정)
    const newPanelB = {
      id: `panelB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: panelBData.width || 600, // panelBData에서 폭 가져오기
      height: 18, // 18mm 고정
      depth: panelBData.depth || 730, // panelBData에서 깊이 가져오기
      color: panelBData.color || '#8B4513',
      material: panelBData.material || 'wood',
      orientation: 'horizontal' as const
    };

    console.log('🪵 패널B 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      panelDepthM,
      panelB: newPanelB
    });

    // 스토어에 패널B 추가
    const { addPanelB } = useSpaceConfigStore.getState();
    addPanelB(newPanelB);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // 드롭 허용
    // 너무 많은 로그를 방지하기 위해 throttle (100ms마다 한 번만 로그)
    const now = Date.now();
    if (!window._lastDragOverLog || now - window._lastDragOverLog > 100) {
      console.log('🔥 [Space3DView] handleDragOver called');
      window._lastDragOverLog = now;
    }
  };

  // 컴포넌트 언마운트 시 정리
  // ⚠️ canvas.getContext()를 어떤 type으로든 호출하면 그 canvas는 영구적으로 그 type으로 잠김
  // R3F가 자체적으로 WebGL 정리하므로 여기서 수동 정리 불필요 → no-op으로 변경
  useEffect(() => {
    return () => {
      const cleanupCanvases = () => {
        // 의도적으로 비워둠 — getContext 호출 시 다음 렌더의 WebGL 생성이 실패함
      };

      cleanupCanvases();
    };
  }, []);


  // 가구의 경계 계산 함수
  const calculateFurnitureBounds = useMemo(() => {
    if (!spaceInfo || placedModules.length === 0) {
      return null;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    placedModules.forEach(module => {
      const moduleData = getModuleById(module.moduleId);
      if (!moduleData) return;

      const width = mmToThreeUnits(module.customWidth || moduleData.width);
      const height = mmToThreeUnits(module.customHeight || moduleData.height);
      const depth = mmToThreeUnits(module.customDepth || moduleData.depth);

      const x = module.position.x;
      const y = module.position.y;
      const z = module.position.z;

      minX = Math.min(minX, x - width / 2);
      maxX = Math.max(maxX, x + width / 2);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);
      minZ = Math.min(minZ, z - depth / 2);
      maxZ = Math.max(maxZ, z + depth / 2);
    });

    // 공간의 경계도 포함
    const spaceWidth = mmToThreeUnits(spaceInfo.width);
    const spaceHeight = mmToThreeUnits(spaceInfo.height);
    const spaceDepth = mmToThreeUnits(spaceInfo.depth || 1500);

    minX = Math.min(minX, -spaceWidth / 2);
    maxX = Math.max(maxX, spaceWidth / 2);
    minY = 0;
    maxY = Math.max(maxY, spaceHeight);
    minZ = Math.min(minZ, -spaceDepth / 2);
    maxZ = Math.max(maxZ, spaceDepth / 2);

    return {
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
      },
      size: {
        width: maxX - minX,
        height: maxY - minY,
        depth: maxZ - minZ
      }
    };
  }, [spaceInfo, placedModules]);

  // 각 뷰에 최적화된 카메라 위치 계산
  const getOptimizedCameraForView = (viewDirection: 'front' | 'left' | 'right' | 'top') => {
    const bounds = calculateFurnitureBounds;

    // 가구가 없을 때도 공간 기준으로 계산
    const spaceWidth = spaceInfo?.width || 3000;
    const spaceHeight = spaceInfo?.height || 2400;
    const spaceDepth = spaceInfo?.depth || 1500;

    if (!bounds) {
      // 가구가 없을 때는 공간 중심과 크기 사용
      // calculateCameraTarget과 동일한 계산 사용
      const center = {
        x: 0,
        y: mmToThreeUnits(spaceHeight * 0.5), // calculateCameraTarget과 동일
        z: 0
      };
      const size = {
        width: mmToThreeUnits(spaceWidth),
        height: mmToThreeUnits(spaceHeight),
        depth: mmToThreeUnits(spaceDepth)
      };

      let distance;
      let position;
      let up: [number, number, number] = [0, 1, 0];
      const distanceMultiplier = 2.0; // 2D 모드 카메라 거리를 2배로

      switch (viewDirection) {
        case 'front':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceWidth, spaceHeight, spaceDepth, placedModules.length) * distanceMultiplier;
          position = [center.x, center.y, center.z + distance];
          up = [0, 1, 0];
          break;

        case 'top':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceWidth, spaceDepth, spaceHeight, placedModules.length) * distanceMultiplier;
          position = [center.x, center.y + distance, center.z];
          up = [0, 0, -1];
          break;

        case 'left':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceDepth, spaceHeight, spaceWidth, placedModules.length) * distanceMultiplier;
          position = [center.x - distance, center.y, center.z];
          up = [0, 1, 0];
          break;

        case 'right':
          // calculateOptimalDistance와 동일한 방식으로 거리 계산
          distance = calculateOptimalDistance(spaceDepth, spaceHeight, spaceWidth, placedModules.length) * distanceMultiplier;
          position = [center.x + distance, center.y, center.z];
          up = [0, 1, 0];
          break;
      }

      return {
        position: position as [number, number, number],
        target: [center.x, center.y, center.z] as [number, number, number],
        up: up
      };
    }

    // target은 공간 중심 사용
    const center = { x: 0, y: mmToThreeUnits((spaceInfo?.height || 2400) * 0.5), z: 0 };
    const size = bounds.size;

    // mm 단위로 역변환 (size는 Three.js 단위이므로)
    const sizeInMm = {
      width: threeUnitsToMm(size.width),
      height: threeUnitsToMm(size.height),
      depth: threeUnitsToMm(size.depth)
    };

    let distance;
    let position;
    let up: [number, number, number] = [0, 1, 0]; // 기본 up vector
    const distanceMultiplier = 2.0; // 2D 모드 카메라 거리를 2배로

    switch (viewDirection) {
      case 'front':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.width, sizeInMm.height, sizeInMm.depth, placedModules.length) * distanceMultiplier;
        position = [center.x, center.y, center.z + distance];
        up = [0, 1, 0]; // Y축이 위
        break;

      case 'top':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.width, sizeInMm.depth, sizeInMm.height, placedModules.length) * distanceMultiplier;
        position = [center.x, center.y + distance, center.z];
        up = [0, 0, -1]; // 상부뷰에서는 -Z축이 위 (앞쪽이 위)
        break;

      case 'left':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.depth, sizeInMm.height, sizeInMm.width, placedModules.length) * distanceMultiplier;
        position = [center.x - distance, center.y, center.z];
        up = [0, 1, 0]; // Y축이 위
        break;

      case 'right':
        // calculateOptimalDistance와 동일한 방식으로 거리 계산
        distance = calculateOptimalDistance(sizeInMm.depth, sizeInMm.height, sizeInMm.width, placedModules.length) * distanceMultiplier;
        position = [center.x + distance, center.y, center.z];
        up = [0, 1, 0]; // Y축이 위
        break;
    }

    return {
      position: position as [number, number, number],
      target: [center.x, center.y, center.z] as [number, number, number],
      up: up
    };
  };

  // 현재 활성화된 섬네일 추적
  const [activeQuadrant, setActiveQuadrant] = React.useState<'front' | 'top' | 'left' | 'right' | null>(null);

  // 전환 애니메이션 처리 함수 - 전체화면 확장 버튼 클릭 시에만 사용
  const handleQuadrantExpand = (direction: 'front' | 'top' | 'left' | 'right') => {
    // 전체화면으로 전환
    setView2DDirection(direction);
    setUIViewMode('2D');
  };

  // 임베디드(미리보기) 모드에서의 줌 조절 - early return 전에 선언 (Rules of Hooks 준수)
  const embeddedZoomMultiplier = useMemo(() => {
    if (isEmbedded && viewMode === '2D') {
      // 우측 미리보기처럼 좁은 뷰포트에서는 더 멀리서 바라보도록 줌을 줄인다
      return 0.26;
    }
    return undefined;
  }, [isEmbedded, viewMode]);

  const mobileViewerZoomMultiplier = useMemo(() => {
    if (!isEmbedded && isMobile) {
      // 2D 모드 또는 3D 직교 모드일 때 동일한 줌 적용
      if (viewMode === '2D' || (viewMode === '3D' && cameraMode === 'orthographic')) {
        return 0.35; // 2D와 3D 직교 동일 크기
      }
    }
    return undefined;
  }, [isEmbedded, isMobile, viewMode, cameraMode]);

  const shouldShowGrid = useMemo(() => {
    if (isPanelSimulationPresentation) {
      return false;
    }
    if (isEmbedded && viewMode === '2D') {
      return true;
    }
    return effectiveShowDimensions && effectiveShowGuides;
  }, [isPanelSimulationPresentation, isEmbedded, viewMode, effectiveShowDimensions, effectiveShowGuides]);

  const shouldShowAxis = useMemo(() => {
    if (isPanelSimulationPresentation) {
      return false;
    }
    if (isEmbedded && viewMode === '2D') {
      return true;
    }
    return effectiveShowDimensions && effectiveShowAxis;
  }, [isPanelSimulationPresentation, isEmbedded, viewMode, effectiveShowDimensions, effectiveShowAxis]);

  const previewGhostSlotIndex = useMemo(() => {
    if (isEmbedded && viewMode === '3D') {
      return selectedSlotIndex;
    }
    return null;
  }, [isEmbedded, viewMode, selectedSlotIndex]);

  // 4분할 뷰에서 가구 클릭 시 해당 슬롯을 측면뷰에 표시
  const handleFurnitureClickInSplitView = useCallback((furnitureId: string, slotIndex: number) => {
    console.log('📍 4분할 뷰 - 가구 클릭:', { furnitureId, slotIndex });
    setSelectedSlotIndex(slotIndex);
  }, [setSelectedSlotIndex]);

  const handleEmbeddedFurnitureClick = useCallback((furnitureId: string, slotIndex: number) => {
    if (!isEmbedded || viewMode !== '3D') {
      return;
    }
    setSelectedSlotIndex(slotIndex);
  }, [isEmbedded, viewMode, setSelectedSlotIndex]);

  // 4분할 뷰 렌더링
  if (viewMode === '2D' && view2DDirection === 'all') {
    return (
      <ViewerThemeProvider viewMode={viewMode}>
        <Space3DViewProvider spaceInfo={spaceInfo} svgSize={svgSize} renderMode={renderMode} viewMode={viewMode} activeZone={activeZone}>
          <div
            style={{
              width: '100%',
              height: '100%',
              minHeight: '400px',
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              gap: '0',
              backgroundColor: colors.primary || '#4CAF50',
              overflow: 'hidden'
            }}
          >
            {/* 가로 중앙선 */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
              zIndex: 10,
              transform: 'translateY(-50%)'
            }} />

            {/* 세로 중앙선 */}
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '50%',
              width: '1px',
              backgroundColor: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
              zIndex: 10,
              transform: 'translateX(-50%)'
            }} />
            {/* 좌측 상단: 정면 뷰 */}
            <div
              onClick={() => setActiveQuadrant(activeQuadrant === 'front' ? null : 'front')}
              style={{
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                border: activeQuadrant === 'front' ? '3px solid #00ffcc' : '1px solid transparent',
                transition: 'border 0.3s ease',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}>
              <ThreeCanvas
                cameraPosition={getOptimizedCameraForView('front').position}
                cameraTarget={getOptimizedCameraForView('front').target}
                cameraUp={getOptimizedCameraForView('front').up}
                viewMode="2D"
                view2DDirection="front"
                renderMode={renderMode}
                isSplitView={true}
              >
                <QuadrantContent
                  viewDirection="front"
                  spaceInfo={spaceInfo}
                  materialConfig={materialConfig}
                  showAll={showAll}
                  showFrame={showFrame}
                  activeZone={activeZone}
                  showDimensions={showDimensions}
                  showDimensionsText={showDimensionsText}
                  showGuides={showGuides}
                  showAxis={showAxis}
                  isStep2={isStep2}
                  showFurniture={showFurniture}
                  readOnly={readOnly}
                  renderMode={renderMode}
                  onFurnitureClick={handleFurnitureClickInSplitView}
                />
              </ThreeCanvas>
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>front</div>
              <button
                onClick={() => handleQuadrantExpand('front')}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(18,18,18,0.7)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                title="전체화면으로 보기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
            </div>

            {/* 우측 상단: 상부 뷰 */}
            <div
              onClick={() => setActiveQuadrant(activeQuadrant === 'top' ? null : 'top')}
              style={{
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                border: activeQuadrant === 'top' ? '3px solid #00ffcc' : '1px solid transparent',
                transition: 'border 0.3s ease',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}>
              <ThreeCanvas
                cameraPosition={getOptimizedCameraForView('top').position}
                cameraTarget={getOptimizedCameraForView('top').target}
                cameraUp={getOptimizedCameraForView('top').up}
                viewMode="2D"
                view2DDirection="top"
                renderMode={renderMode}
                isSplitView={true}
              >
                <QuadrantContent
                  viewDirection="top"
                  spaceInfo={spaceInfo}
                  materialConfig={materialConfig}
                  showAll={showAll}
                  showFrame={showFrame}
                  activeZone={activeZone}
                  showDimensions={showDimensions}
                  showDimensionsText={showDimensionsText}
                  showGuides={showGuides}
                  showAxis={showAxis}
                  isStep2={isStep2}
                  showFurniture={showFurniture}
                  readOnly={readOnly}
                  renderMode={renderMode}
                  onFurnitureClick={handleFurnitureClickInSplitView}
                />
              </ThreeCanvas>
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>top</div>
              <button
                onClick={() => handleQuadrantExpand('top')}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(18,18,18,0.7)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                title="전체화면으로 보기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
            </div>

            {/* 좌측 하단: 좌측면 뷰 */}
            <div
              onClick={(e) => {
                // SlotSelector 영역 클릭 시 무시
                if ((e.target as HTMLElement).closest('[data-slot-selector]')) return;
                setActiveQuadrant(activeQuadrant === 'left' ? null : 'left');
              }}
              style={{
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                border: activeQuadrant === 'left' ? '3px solid #00ffcc' : '1px solid transparent',
                transition: 'border 0.3s ease',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}>
              <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
                <ThreeCanvas
                  cameraPosition={getOptimizedCameraForView('left').position}
                  cameraTarget={getOptimizedCameraForView('left').target}
                  cameraUp={getOptimizedCameraForView('left').up}
                  viewMode="2D"
                  view2DDirection="left"
                  renderMode={renderMode}
                  isSplitView={true}
                >
                  <QuadrantContent
                    viewDirection="left"
                    spaceInfo={spaceInfo}
                    materialConfig={materialConfig}
                    showAll={showAll}
                    showFrame={showFrame}
                    activeZone={activeZone}
                    showDimensions={showDimensions}
                    showDimensionsText={showDimensionsText}
                    showGuides={showGuides}
                    showAxis={showAxis}
                    isStep2={isStep2}
                    showFurniture={showFurniture}
                    readOnly={readOnly}
                    renderMode={renderMode}
                    onFurnitureClick={handleFurnitureClickInSplitView}
                  />
                </ThreeCanvas>
              </div>
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.1)',
                zIndex: 10
              }}>left</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuadrantExpand('left');
                }}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(18,18,18,0.7)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s ease',
                  zIndex: 10
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                title="전체화면으로 보기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
              {/* 좌측 패널용 SlotSelector */}
              <div
                data-slot-selector="true"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: '8px',
                  transform: 'translateX(-50%)',
                  zIndex: 100,
                  pointerEvents: 'auto'
                }}
              >
                <SlotSelector forSplitView={true} splitViewDirection="left" compact={true} />
              </div>
            </div>

            {/* 우측 하단: 우측면 뷰 */}
            <div
              onClick={(e) => {
                // SlotSelector 영역 클릭 시 무시
                if ((e.target as HTMLElement).closest('[data-slot-selector]')) return;
                setActiveQuadrant(activeQuadrant === 'right' ? null : 'right');
              }}
              style={{
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                border: activeQuadrant === 'right' ? '3px solid #00ffcc' : '1px solid transparent',
                transition: 'border 0.3s ease',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}>
              <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
                <ThreeCanvas
                  cameraPosition={getOptimizedCameraForView('right').position}
                  cameraTarget={getOptimizedCameraForView('right').target}
                  cameraUp={getOptimizedCameraForView('right').up}
                  viewMode="2D"
                  view2DDirection="right"
                  renderMode={renderMode}
                  isSplitView={true}
                >
                  <QuadrantContent
                    viewDirection="right"
                    spaceInfo={spaceInfo}
                    materialConfig={materialConfig}
                    showAll={showAll}
                    showFrame={showFrame}
                    activeZone={activeZone}
                    showDimensions={showDimensions}
                    showDimensionsText={showDimensionsText}
                    showGuides={showGuides}
                    showAxis={showAxis}
                    isStep2={isStep2}
                    readOnly={readOnly}
                    showFurniture={showFurniture}
                    renderMode={renderMode}
                    onFurnitureClick={handleFurnitureClickInSplitView}
                  />
                </ThreeCanvas>
              </div>
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                backgroundColor: 'rgba(18,18,18,0.7)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.1)',
                zIndex: 10
              }}>right</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuadrantExpand('right');
                }}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(18,18,18,0.7)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s ease',
                  zIndex: 10
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(18,18,18,0.7)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                title="전체화면으로 보기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
              {/* 우측 패널용 SlotSelector */}
              <div
                data-slot-selector="true"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: '8px',
                  transform: 'translateX(-50%)',
                  zIndex: 100,
                  pointerEvents: 'auto'
                }}
              >
                <SlotSelector forSplitView={true} splitViewDirection="right" compact={true} />
              </div>
            </div>
          </div>
        </Space3DViewProvider>
      </ViewerThemeProvider>
    );
  }

  return (
    <ViewerThemeProvider viewMode={viewMode}>
      <Space3DViewProvider spaceInfo={spaceInfo} svgSize={svgSize} renderMode={renderMode} viewMode={viewMode} activeZone={activeZone}>
        <div
          style={{
            width: '100%',
            height: '100%',
            minHeight: readOnly ? 'unset' : '400px',
            position: 'relative'
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          data-viewer-container="true"
        >
          <ThreeCanvas
            cameraPosition={cameraPosition}
            cameraTarget={cameraTargetArr}
            viewMode={viewMode}
            view2DDirection={view2DDirection}
            renderMode={renderMode}
            sceneRef={sceneRef}
            zoomMultiplier={embeddedZoomMultiplier ?? mobileViewerZoomMultiplier}
            onControlsReady={handleControlsReady}
          >
            <React.Suspense fallback={null}>
              {/* 배경 클릭 감지용 평면 - selectedFurnitureId 해제 */}
              <mesh
                position={[0, 0, -100]}
                onClick={(e) => {
                  e.stopPropagation();
                  const { selectedFurnitureId, setSelectedFurnitureId } = useUIStore.getState();
                  if (selectedFurnitureId) {
                    console.log('🔵 [Space3DView] 배경 클릭 - selectedFurnitureId 해제:', selectedFurnitureId);
                    setSelectedFurnitureId(null);
                  }
                }}
              >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} />
              </mesh>
              {/* 확실히 작동하는 CAD 그리드 - 2D와 3D 모두에서 작동 */}
              <CADGrid viewMode={viewMode} view2DDirection={view2DDirection} enabled={shouldShowGrid} showAxis={shouldShowAxis} />

              {/* 조명 시스템 - 2D 모드에서는 그림자 없음 */}

              {/* 메인 자연광 - 3D 모드에서만 그림자 생성, sunAngle로 위치 조절 */}
              <SunLight sunAngle={sunAngle ?? 45} castShadow={viewMode === '3D'} />

              {/* 부드러운 필 라이트 - 그림자 대비 조절 */}
              <directionalLight
                position={[-8, 10, 15]}
                intensity={0.6}
                color="#ffffff"
              />
              <directionalLight
                position={[8, 10, 15]}
                intensity={0.6}
                color="#ffffff"
              />

              {/* 환경광 - 2D 모드에서는 더 밝게 */}
              <ambientLight intensity={viewMode === '2D' ? 0.8 : 0.5} color="#ffffff" />

              {/* HDRI 환경맵 제거 - 순수 조명만 사용 */}
              {/* Environment 컴포넌트가 렌더링을 방해할 수 있으므로 비활성화 */}

              {/* 기본 요소들 */}
              <Room
                spaceInfo={spaceInfo}
                viewMode={viewMode}
                view2DDirection={view2DDirection}
                renderMode={renderMode}
                materialConfig={materialConfig}
                showAll={showAll}
                showFrame={showFrame}
                showDimensions={effectiveShowDimensions}
                showGuides={effectiveShowGuides}
                isStep2={isStep2}
                activeZone={activeZone}
                showFurniture={showFurniture}
                hideEdges={hideEdges}
                readOnly={readOnly}
                onFurnitureClick={onFurnitureClick || (isEmbedded ? handleEmbeddedFurnitureClick : undefined)}
                ghostHighlightSlotIndex={previewGhostSlotIndex}
                islandSideFilter={islandViewSide}
              />

              <LiveDimensionInspector enabled={viewMode === '3D' && isLiveDimensionMode} />
              <TapeMeasureInspector enabled={viewMode === '3D' && isTapeMeasureMode} />
              <PanelSimulationBoard />
              <PanelSimulationMovingPanels />

              {/* 단내림 공간 렌더링 */}
              {!isPanelSimulationPresentation && <DroppedCeilingSpace spaceInfo={spaceInfo} />}

              {/* 상하부장 사이 백패널 렌더링 */}
              {!isPanelSimulationPresentation && (
                <BackPanelBetweenCabinets
                  placedModules={placedModules}
                  spaceInfo={spaceInfo}
                />
              )}

              {/* 상부장 간접조명 및 띄워서 배치 간접조명 렌더링 */}
              {!isPanelSimulationPresentation && (
                <UpperCabinetIndirectLight
                  placedModules={placedModules}
                  spaceInfo={spaceInfo}
                />
              )}

              {/* 기둥 에셋 렌더링 */}
              {!isPanelSimulationPresentation && (spaceInfo?.columns || []).map((column) => {
                // 기둥이 단내림 영역에 있는지 확인
                let columnHeight = spaceInfo.height || column.height || 2400; // 항상 공간 높이 우선
                if (spaceInfo.droppedCeiling?.enabled && spaceInfo.layoutMode !== 'free-placement') {
                  const totalWidth = spaceInfo.width;
                  const droppedWidth = spaceInfo.droppedCeiling.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
                  const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
                  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;

                  // 기둥의 X 좌표 (mm 단위로 변환)
                  const columnXMm = column.position[0] * 100; // Three.js 단위를 mm로 변환
                  const centerX = 0; // 공간 중심
                  const leftBoundary = centerX - totalWidth / 2;
                  const rightBoundary = centerX + totalWidth / 2;

                  // 단내림 영역 경계 계산
                  let droppedStartX, droppedEndX;
                  if (droppedPosition === 'left') {
                    droppedStartX = leftBoundary;
                    droppedEndX = leftBoundary + droppedWidth;
                  } else {
                    droppedStartX = rightBoundary - droppedWidth;
                    droppedEndX = rightBoundary;
                  }

                  // 기둥이 단내림 영역에 있으면 높이 조정
                  if (columnXMm >= droppedStartX && columnXMm <= droppedEndX) {
                    columnHeight = columnHeight - dropHeight;
                  }
                }

                return (
                  <React.Fragment key={column.id}>
                    <ColumnAsset
                      id={column.id}
                      position={column.position}
                      width={column.width} // mm 단위 그대로 전달
                      height={columnHeight}
                      depth={column.depth}
                      color={column.color}
                      hasBackPanelFinish={column.hasBackPanelFinish}
                      hasFrontPanelFinish={column.hasFrontPanelFinish}
                      spaceInfo={spaceInfo}
                      renderMode={renderMode}
                      onPositionChange={(id, newPosition) => {
                        throttledUpdateColumn(id, { position: newPosition });
                      }}
                      onRemove={(id) => {
                        removeColumn(id);
                      }}
                      onColumnUpdate={(id, updates) => {
                        throttledUpdateColumn(id, updates);
                      }}
                    />
                    {/* 기둥 벽면 간격 라벨 (기둥 선택/팝업/편집 모달 중 하나라도 활성) */}
                    {(
                      selectedColumnId === column.id ||
                      ((activePopup.type === 'column' || activePopup.type === 'columnEdit') && activePopup.id === column.id)
                    ) && (
                      <ColumnDistanceLabels
                        column={column}
                        spaceInfo={spaceInfo}
                        onPositionChange={(columnId, newPosition) => {
                          throttledUpdateColumn(columnId, { position: newPosition });
                        }}
                        onColumnUpdate={(columnId, updates) => {
                          updateColumn(columnId, updates);
                        }}
                        showLabels={true}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {/* 가벽 에셋 렌더링 */}
              {!isPanelSimulationPresentation && (spaceInfo?.walls || []).map((wall) => {
                // 가벽이 단내림 영역에 있는지 확인
                let wallHeight = wall.height;
                if (spaceInfo.droppedCeiling?.enabled && spaceInfo.layoutMode !== 'free-placement') {
                  const totalWidth = spaceInfo.width;
                  const droppedWidth = spaceInfo.droppedCeiling.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
                  const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
                  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;

                  // 가벽의 X 좌표 (mm 단위로 변환)
                  const wallXMm = wall.position[0] * 100; // Three.js 단위를 mm로 변환
                  const centerX = 0; // 공간 중심
                  const leftBoundary = centerX - totalWidth / 2;
                  const rightBoundary = centerX + totalWidth / 2;

                  // 단내림 영역 경계 계산
                  let droppedStartX, droppedEndX;
                  if (droppedPosition === 'left') {
                    droppedStartX = leftBoundary;
                    droppedEndX = leftBoundary + droppedWidth;
                  } else {
                    droppedStartX = rightBoundary - droppedWidth;
                    droppedEndX = rightBoundary;
                  }

                  // 가벽이 단내림 영역에 있으면 높이 조정
                  if (wallXMm >= droppedStartX && wallXMm <= droppedEndX) {
                    wallHeight = wall.height - dropHeight;
                  }
                }

                return (
                  <WallAsset
                    key={wall.id}
                    id={wall.id}
                    position={wall.position}
                    width={wall.width} // mm 단위 그대로 전달
                    height={wallHeight}
                    depth={wall.depth}
                    color={wall.color}
                    spaceInfo={spaceInfo}
                    renderMode={renderMode}
                    onPositionChange={(id, newPosition) => {
                      updateWall(id, { position: newPosition });
                    }}
                    onRemove={(id) => {
                      removeWall(id);
                    }}
                  />
                );
              })}

              {/* 패널B 렌더링 */}
              {!isPanelSimulationPresentation && spaceInfo?.panelBs?.map((panelB) => (
                <PanelBAsset
                  key={panelB.id}
                  id={panelB.id}
                  position={panelB.position}
                  width={panelB.width}
                  height={panelB.height}
                  depth={panelB.depth}
                  color={panelB.color}
                  renderMode={viewMode === '3D' ? 'solid' : 'wireframe'}
                  onPositionChange={(id, newPos) => updatePanelB(id, { position: newPos })}
                  onRemove={removePanelB}
                  spaceInfo={spaceInfo}
                />
              ))}

              {/* 패널B 생성 마커 */}
              {isPanelBCreationMode && viewMode === '3D' && (
                <PanelBCreationMarkers
                  spaceInfo={spaceInfo}
                />
              )}

              {/* 기둥 드래그 시 고스트 프리뷰 */}
              <ColumnGhostPreview spaceInfo={spaceInfo} />


              {/* 기둥 생성 마커는 드래그 앤 드롭 방식으로 대체됨 */}

              {/* Configurator에서 표시되는 요소들 */}
              {/* 컬럼 가이드 표시 - 2D와 3D 모두에서 showDimensions와 showAll(가이드)이 모두 true일 때만 */}
              {!isPanelSimulationPresentation && effectiveShowDimensions && showAll && <ColumnGuides viewMode={viewMode} />}

              {/* CAD 스타일 치수/가이드 표시 - 3D 모드 또는 2D 정면/탑뷰에서 표시 */}
              {effectiveShowDimensions && effectiveShowDimensionsText && (viewMode === '3D' || (viewMode === '2D' && view2DDirection !== 'left' && view2DDirection !== 'right')) && (
                <CleanCAD2D
                  viewDirection={viewMode === '3D' ? '3D' : view2DDirection}
                  showDimensions={dimensionDisplayEnabled}
                  isStep2={isStep2}
                  readOnly={readOnly}
                />
              )}

              {/* 측면뷰 전용 치수 표시 - 2D 측면뷰에서만 (Configurator 전용, 자유배치모드에서는 가구 배치 후 표시) */}
              {effectiveShowDimensions && effectiveShowDimensionsText && !isStep2 && viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') && (spaceInfo?.layoutMode !== 'free-placement' || placedModules.length > 0) && (
                <CADDimensions2D
                  viewDirection={view2DDirection}
                  showDimensions={dimensionDisplayEnabled}
                  isSplitView={true}
                />
              )}

              {/* PlacedFurniture는 Room 내부에서 렌더링되므로 중복 제거 */}

              {!isPanelSimulationPresentation && (
                <SlotDropZonesSimple spaceInfo={spaceInfo} showAll={showAll} showDimensions={effectiveShowDimensions} viewMode={viewMode} view2DDirection={view2DDirection} />
              )}

              {/* 자유배치 모드 드롭존 */}
              {!isPanelSimulationPresentation && <FreePlacementDropZone />}

              {/* 슬롯 배치 인디케이터 - 가구 선택 시 + 아이콘 표시 */}
              {!isPanelSimulationPresentation && <SlotPlacementIndicators onSlotClick={placeFurniture} />}

              {/* 내경 치수 표시 - showDimensions 상태에 따라 표시/숨김 */}
              {!isPanelSimulationPresentation && <InternalDimensionDisplay />}

              {/* CAD 측정 도구 - 2D 모드에서만 표시 */}
              {!isPanelSimulationPresentation && viewMode === '2D' && <MeasurementTool viewDirection={view2DDirection} />}
            </React.Suspense>
          </ThreeCanvas>
          <PanelSimulationSummaryPopup />

          {/* 분할 모드 버튼 - 2D 모드에서만 표시 (임베디드 모드에서는 숨김) */}
          {!isEmbedded && viewMode === '2D' && view2DDirection !== 'all' && (
            <button
              onClick={() => {
                setView2DDirection('all');
              }}
              style={{
                position: 'absolute',
                top: '10px',
                right: isLayoutBuilderOpen ? '390px' : '10px',
                width: '36px',
                height: '36px',
                backgroundColor: view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)',
                border: `1px solid ${view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                borderRadius: '4px',
                color: view2DTheme === 'dark' ? '#ffffff' : '#000000',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 20,
                padding: '0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.9)' : 'rgba(255,255,255,1)';
                e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)';
                e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="4분할 뷰로 보기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="8" height="8" />
                <rect x="13" y="3" width="8" height="8" />
                <rect x="3" y="13" width="8" height="8" />
                <rect x="13" y="13" width="8" height="8" />
              </svg>
            </button>
          )}

          {/* 측정 도구 버튼 - 2D 모드에서만 표시 (임베디드 모드에서는 숨김) */}
          {!isEmbedded && viewMode === '2D' && view2DDirection !== 'all' && (
            <>
              <button
                onClick={() => {
                  const { setEraserMode } = useUIStore.getState();
                  console.log('📏 측정 모드 토글:', !isMeasureMode);
                  // 측정 모드 활성화 시 지우개 모드 비활성화
                  setEraserMode(false);
                  toggleMeasureMode();
                }}
                style={{
                  position: 'absolute',
                  top: '56px', // 분할 버튼(36px) + 간격(10px) + 상단 여백(10px)
                  right: isLayoutBuilderOpen ? '390px' : '10px',
                  width: '36px',
                  height: '36px',
                  backgroundColor: isMeasureMode
                    ? colors.primary
                    : (view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)'),
                  border: `1px solid ${isMeasureMode
                    ? colors.primary
                    : (view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)')}`,
                  borderRadius: '4px',
                  color: isMeasureMode ? '#ffffff' : (view2DTheme === 'dark' ? '#ffffff' : '#000000'),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  zIndex: 20,
                  padding: '0',
                  boxShadow: isMeasureMode ? `0 2px 8px ${colors.primary}40` : '0 2px 4px rgba(0,0,0,0.1)'
                }}
                onMouseEnter={(e) => {
                  if (!isMeasureMode) {
                    e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.9)' : 'rgba(255,255,255,1)';
                    e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
                  }
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isMeasureMode) {
                    e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)';
                    e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                  }
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="CAD 스타일 치수 측정"
              >
                <RxDimensions size={20} />
              </button>

              {/* 치수 지우개 버튼 - 측정 도구 버튼 바로 아래 */}
              <button
                onClick={() => {
                  const { toggleEraserMode, setMeasureMode } = useUIStore.getState();
                  console.log('🗑️ 지우개 모드 토글');
                  // 지우개 모드 활성화 시 측정 모드 비활성화
                  setMeasureMode(false);
                  toggleEraserMode();
                }}
                style={{
                  position: 'absolute',
                  top: '102px', // 측정 버튼(56px + 36px) + 간격(10px)
                  right: isLayoutBuilderOpen ? '390px' : '10px',
                  width: '36px',
                  height: '36px',
                  backgroundColor: isEraserMode
                    ? colors.primary
                    : (view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)'),
                  border: `1px solid ${isEraserMode
                    ? colors.primary
                    : (view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)')}`,
                  borderRadius: '4px',
                  color: isEraserMode ? '#ffffff' : (view2DTheme === 'dark' ? '#ffffff' : '#000000'),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  zIndex: 20,
                  padding: '0',
                  boxShadow: isEraserMode ? `0 2px 8px ${colors.primary}40` : '0 2px 4px rgba(0,0,0,0.1)'
                }}
                onMouseEnter={(e) => {
                  if (!isEraserMode) {
                    e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.9)' : 'rgba(255,255,255,1)';
                    e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
                  }
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isEraserMode) {
                    e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)';
                    e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                  }
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="치수 지우개 (클릭하여 삭제 모드 활성화)"
              >
                <LuEraser size={20} />
              </button>

              {/* 2D 다크/라이트 모드 토글 버튼 - 지우개 버튼 아래 */}
              <button
                onClick={() => {
                  const { toggleView2DTheme } = useUIStore.getState();
                  toggleView2DTheme();
                }}
                style={{
                  position: 'absolute',
                  top: '148px',
                  right: isLayoutBuilderOpen ? '390px' : '10px',
                  width: '36px',
                  height: '36px',
                  backgroundColor: view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)',
                  border: `1px solid ${view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                  borderRadius: '4px',
                  color: view2DTheme === 'dark' ? '#ffffff' : '#000000',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  zIndex: 20,
                  padding: '0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.9)' : 'rgba(255,255,255,1)';
                  e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = view2DTheme === 'dark' ? 'rgba(18,18,18,0.7)' : 'rgba(255,255,255,0.9)';
                  e.currentTarget.style.borderColor = view2DTheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title={view2DTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              >
                {view2DTheme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </>
          )}

          {/* 줌 슬라이더 - 숨김 처리 */}
          {false && !isEmbedded && view2DDirection !== 'all' && viewMode !== '2D' && (<>
            <style>{`
              .zoom-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #666;
                cursor: pointer;
                border: 2px solid #fff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              }
              .zoom-slider::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #666;
                cursor: pointer;
                border: 2px solid #fff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              }
            `}</style>
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '10px',
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: viewMode === '2D'
                  ? (view2DTheme === 'dark' ? 'rgba(18,18,18,0.75)' : 'rgba(255,255,255,0.9)')
                  : 'rgba(255,255,255,0.9)',
                border: `1px solid ${viewMode === '2D'
                  ? (view2DTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)')
                  : 'rgba(0,0,0,0.15)'}`,
                borderRadius: '20px',
                padding: '4px 8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* - 줌아웃 버튼 */}
              <button
                onClick={() => handleZoomStep(-8)}
                style={{
                  width: '24px',
                  height: '24px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: viewMode === '2D'
                    ? (view2DTheme === 'dark' ? '#ccc' : '#555')
                    : '#555',
                  fontSize: '16px',
                  fontWeight: 700,
                  borderRadius: '50%',
                  padding: 0,
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = viewMode === '2D'
                    ? (view2DTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
                    : 'rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="줌 아웃"
              >
                −
              </button>

              {/* 슬라이더 */}
              <input
                type="range"
                min={0}
                max={100}
                value={zoomSliderValue}
                onChange={(e) => handleZoomSliderChange(Number(e.target.value))}
                onPointerDown={() => { isSliderDraggingRef.current = true; }}
                onPointerUp={handleZoomSliderEnd}
                onPointerLeave={handleZoomSliderEnd}
                className="zoom-slider"
                style={{
                  width: '120px',
                  height: '4px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: viewMode === '2D'
                    ? (view2DTheme === 'dark'
                      ? `linear-gradient(to right, #888 ${zoomSliderValue}%, #444 ${zoomSliderValue}%)`
                      : `linear-gradient(to right, #888 ${zoomSliderValue}%, #ddd ${zoomSliderValue}%)`)
                    : `linear-gradient(to right, #888 ${zoomSliderValue}%, #ddd ${zoomSliderValue}%)`,
                  borderRadius: '2px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />

              {/* + 줌인 버튼 */}
              <button
                onClick={() => handleZoomStep(8)}
                style={{
                  width: '24px',
                  height: '24px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: viewMode === '2D'
                    ? (view2DTheme === 'dark' ? '#ccc' : '#555')
                    : '#555',
                  fontSize: '16px',
                  fontWeight: 700,
                  borderRadius: '50%',
                  padding: 0,
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = viewMode === '2D'
                    ? (view2DTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
                    : 'rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="줌 인"
              >
                +
              </button>
            </div>
          </>)}

        </div>
      </Space3DViewProvider>
    </ViewerThemeProvider>
  );
};

// 4분할 뷰를 위한 별도 컴포넌트
const QuadrantContent: React.FC<{
  viewDirection: 'front' | 'left' | 'right' | 'top';
  spaceInfo: any;
  materialConfig: any;
  showAll: boolean;
  showFrame: boolean;
  activeZone?: 'normal' | 'dropped';
  showDimensions: boolean;
  showDimensionsText: boolean;
  showGuides: boolean;
  showAxis: boolean;
  isStep2?: boolean;
  throttledUpdateColumn?: (id: string, updates: any) => void;
  showFurniture?: boolean;
  readOnly?: boolean;
  renderMode?: 'solid' | 'wireframe';
  onFurnitureClick?: (furnitureId: string, slotIndex: number) => void;
}> = ({ viewDirection, spaceInfo, materialConfig, showAll, showFrame, showDimensions, showDimensionsText, showGuides, showAxis, isStep2, throttledUpdateColumn, activeZone, showFurniture, readOnly = false, renderMode = 'wireframe', onFurnitureClick }) => {
  const { placedModules } = useFurnitureStore();
  const { updateColumn, removeColumn, updateWall, removeWall } = useSpaceConfigStore();
  const { activePopup } = useUIStore();
  const dimensionDisplayEnabled = showDimensions && showDimensionsText;

  // throttledUpdateColumn이 전달되지 않으면 기본 updateColumn 사용
  const handleUpdateColumn = throttledUpdateColumn || updateColumn;

  return (
    <React.Suspense fallback={null}>
      {/* CAD 그리드 */}
      <CADGrid viewMode="2D" view2DDirection={viewDirection} enabled={showDimensions && showGuides} showAxis={showDimensions && showAxis} />

      {/* 조명 시스템 */}
      <directionalLight
        position={[5, 15, 20]}
        intensity={2.5}
        color="#ffffff"
      />
      <directionalLight
        position={[-8, 10, 15]}
        intensity={0.6}
        color="#ffffff"
      />
      <directionalLight
        position={[8, 10, 15]}
        intensity={0.6}
        color="#ffffff"
      />
      <ambientLight intensity={0.8} color="#ffffff" />

      {/* 컬럼 가이드 표시 */}
      {showDimensions && showAll && <ColumnGuides viewMode="2D" />}

      {/* CAD 스타일 치수/가이드 표시 (측면뷰 제외) */}
      {showDimensions && showDimensionsText && viewDirection !== 'left' && viewDirection !== 'right' && (
        <CleanCAD2D
          viewDirection={viewDirection}
          showDimensions={dimensionDisplayEnabled}
          isStep2={isStep2}
          readOnly={readOnly}
        />
      )}

      {/* 측면뷰 전용 치수 표시 - 4분할 뷰에서도 표시 (자유배치모드에서는 가구 배치 후 표시) */}
      {showDimensions && showDimensionsText && (viewDirection === 'left' || viewDirection === 'right') && (spaceInfo?.layoutMode !== 'free-placement' || placedModules.length > 0) && (
        <CADDimensions2D
          viewDirection={viewDirection}
          showDimensions={dimensionDisplayEnabled}
          isSplitView={true}
        />
      )}

      {/* 투명 슬롯매쉬 - 탑뷰에서는 제외 */}
      {viewDirection !== 'top' && <FurniturePlacementPlane spaceInfo={spaceInfo} />}

      {/* 슬롯 드롭존 */}
      <SlotDropZonesSimple spaceInfo={spaceInfo} showAll={showAll} showDimensions={showDimensions} viewMode="2D" view2DDirection={viewDirection} />

      {/* 자유배치 모드 드롭존 */}
      <FreePlacementDropZone />

      {/* Room 컴포넌트 - 프레임, 도어, 가구를 포함 */}
      {console.log('🔵 QuadrantContent - Room 렌더링:', {
        viewDirection,
        spaceInfo: !!spaceInfo,
        showFrame,
        placedModulesCount: placedModules?.length || 0
      })}
      <Room
        spaceInfo={spaceInfo}
        viewMode="2D"
        view2DDirection={viewDirection}
        renderMode={renderMode}
        showDimensions={showDimensions}
        showAll={showAll}
        isStep2={isStep2}
        showFrame={showFrame}
        materialConfig={materialConfig}
        activeZone={activeZone}
        showFurniture={showFurniture}
        readOnly={readOnly}
        onFurnitureClick={onFurnitureClick}
      />
    </React.Suspense>
  );
};

export default React.memo(Space3DView); 
