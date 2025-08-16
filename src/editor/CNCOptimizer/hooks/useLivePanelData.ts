import { useEffect, useState, useMemo } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculatePanelDetails } from '../utils/panelExtractor';
import { Panel } from '../types';
import { normalizePanels, NormalizedPanel } from '@/utils/cutlist/normalize';

/**
 * Hook for live panel data binding from Configurator
 * Subscribes to furniture store changes and provides normalized panels
 */
export function useLivePanelData() {
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Extract panels from placed modules
  useEffect(() => {
    console.log('🔄 Live panel data update triggered:', {
      modulesCount: placedModules.length,
      spaceInfo: spaceInfo,
      placedModules: placedModules
    });

    const extractPanels = () => {
      setIsLoading(true);
      const allPanels: Panel[] = [];
      
      // Internal space calculation
      const internalSpace = {
        width: spaceInfo.width - 36,
        height: spaceInfo.height,
        depth: spaceInfo.depth
      };

      console.log('📐 Internal space:', internalSpace);

      placedModules.forEach((placedModule, moduleIndex) => {
        // Get module ID
        const moduleId = placedModule.moduleId || placedModule.moduleType;
        if (!moduleId) {
          console.warn(`Module ${moduleIndex} ID missing:`, placedModule);
          return;
        }
        
        console.log(`🪑 Processing module ${moduleIndex + 1}:`, {
          moduleId,
          position: placedModule.position,
          dimensions: { width: placedModule.width, depth: placedModule.depth }
        });
        
        // Find module data with dynamic sizing
        const moduleData = getModuleById(moduleId, internalSpace, spaceInfo);
        if (!moduleData) {
          console.warn('Module not found:', moduleId);
          return;
        }

        // Get actual module configuration
        const width = placedModule.width || moduleData.dimensions.width;
        const depth = placedModule.depth || moduleData.dimensions.depth;
        const hasDoor = placedModule.hasDoor || false;
        const material = placedModule.material || 'PB';
        const color = placedModule.color || 'MW';

        console.log(`  Module config:`, { width, depth, hasDoor, material, color });

        // Extract panel details using the panel extractor
        const modulePanels = calculatePanelDetails(moduleData, width, depth, hasDoor);
        
        console.log(`  Extracted ${modulePanels.length} panels from module ${moduleData.name}`);
        
        // Update material, color info and ensure unique IDs
        modulePanels.forEach((panel, panelIndex) => {
          panel.material = material;
          panel.color = color;
          // 가구 인덱스와 패널 인덱스를 조합하여 고유 ID 생성
          panel.id = `m${moduleIndex}_p${panelIndex}`;
        });

        allPanels.push(...modulePanels);
      });

      console.log('📊 Total live panels extracted:', {
        count: allPanels.length,
        materials: [...new Set(allPanels.map(p => p.material))],
        colors: [...new Set(allPanels.map(p => p.color))],
        panels: allPanels.map(p => ({ 
          name: p.name, 
          width: p.width, 
          height: p.height,
          quantity: p.quantity 
        }))
      });

      setPanels(allPanels);
      setIsLoading(false);
    };

    extractPanels();
  }, [placedModules, spaceInfo]);

  // Normalize panels for CutList compatibility
  const normalizedPanels = useMemo(() => {
    return normalizePanels(panels, 'mm');
  }, [panels]);

  // Panel statistics
  const stats = useMemo(() => {
    const materialGroups = new Map<string, { count: number; area: number }>();
    
    panels.forEach(panel => {
      const key = `${panel.material}-${panel.color}`;
      const current = materialGroups.get(key) || { count: 0, area: 0 };
      const area = (panel.width * panel.height * panel.quantity) / 1000000; // to m²
      
      materialGroups.set(key, {
        count: current.count + panel.quantity,
        area: current.area + area
      });
    });

    return {
      totalPanels: panels.length,
      totalQuantity: panels.reduce((sum, p) => sum + p.quantity, 0),
      totalArea: panels.reduce((sum, p) => sum + (p.width * p.height * p.quantity / 1000000), 0),
      materialGroups: Array.from(materialGroups.entries()).map(([key, data]) => ({
        key,
        material: key.split('-')[0],
        color: key.split('-')[1],
        ...data
      }))
    };
  }, [panels]);

  return {
    panels,
    normalizedPanels,
    stats,
    isLoading,
    // Utility function to get panels by material/color
    getPanelsByMaterial: (material?: string, color?: string) => {
      return panels.filter(panel => {
        if (material && panel.material !== material) return false;
        if (color && panel.color !== color) return false;
        return true;
      });
    },
    // Utility function to get normalized panels by material/color
    getNormalizedPanelsByMaterial: (material?: string, color?: string) => {
      return normalizedPanels.filter(panel => {
        if (material && panel.material !== material) return false;
        if (color && panel.color !== color) return false;
        return true;
      });
    }
  };
}

/**
 * Hook to subscribe to live panel updates with callback
 */
export function usePanelSubscription(callback: (panels: Panel[]) => void) {
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);

  useEffect(() => {
    // Extract panels and call callback
    const allPanels: Panel[] = [];
    
    const internalSpace = {
      width: spaceInfo.width - 36,
      height: spaceInfo.height,
      depth: spaceInfo.depth
    };

    placedModules.forEach((placedModule, moduleIndex) => {
      const moduleId = placedModule.moduleId || placedModule.moduleType;
      if (!moduleId) return;
      
      const moduleData = getModuleById(moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;

      const width = placedModule.width || moduleData.dimensions.width;
      const depth = placedModule.depth || moduleData.dimensions.depth;
      const hasDoor = placedModule.hasDoor || false;
      const material = placedModule.material || 'PB';
      const color = placedModule.color || 'MW';

      const modulePanels = calculatePanelDetails(moduleData, width, depth, hasDoor);
      
      modulePanels.forEach((panel, panelIndex) => {
        panel.material = material;
        panel.color = color;
        // 가구 인덱스와 패널 인덱스를 조합하여 고유 ID 생성
        panel.id = `m${moduleIndex}_p${panelIndex}`;
      });

      allPanels.push(...modulePanels);
    });

    callback(allPanels);
  }, [placedModules, spaceInfo, callback]);
}