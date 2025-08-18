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
    console.log('=== useLivePanelData extracting panels ===');
    console.log('placedModules:', placedModules);
    console.log('placedModules.length:', placedModules.length);
    console.log('spaceInfo:', spaceInfo);
    
    // Debug: Check if placedModules is actually an array
    if (!Array.isArray(placedModules)) {
      console.error('placedModules is not an array:', typeof placedModules, placedModules);
      return;
    }

    const extractPanels = () => {
      setIsLoading(true);
      const allPanels: Panel[] = [];
      
      // Internal space calculation
      const internalSpace = {
        width: spaceInfo.width - 36,
        height: spaceInfo.height,
        depth: spaceInfo.depth
      };

      console.log('internalSpace:', internalSpace);

      placedModules.forEach((placedModule, moduleIndex) => {
        // Get module ID
        const moduleId = placedModule.moduleId || placedModule.moduleType;
        console.log(`Module ${moduleIndex}: moduleId = ${moduleId}`);
        if (!moduleId) {
          console.warn(`Module ${moduleIndex} has no moduleId`);
          return;
        }
        
        
        // Find module data with dynamic sizing
        const moduleData = getModuleById(moduleId, internalSpace, spaceInfo);
        if (!moduleData) {
          console.warn(`Module ${moduleIndex}: No module data found for ${moduleId}`);
          return;
        }
        console.log(`Module ${moduleIndex}: Found module data`, moduleData);

        // Get actual module configuration
        const width = placedModule.width || moduleData.dimensions.width;
        const depth = placedModule.depth || moduleData.dimensions.depth;
        const hasDoor = placedModule.hasDoor || false;
        const material = placedModule.material || 'PB';
        const color = placedModule.color || 'MW';


        // Extract panel details using the panel extractor
        const modulePanels = calculatePanelDetails(moduleData, width, depth, hasDoor);
        console.log(`Module ${moduleIndex}: Extracted ${modulePanels.length} panels`);
        
        
        // Update material, color info and ensure unique IDs
        modulePanels.forEach((panel, panelIndex) => {
          // panelExtractor에서 설정한 재질이 있으면 유지, 없으면 placedModule의 재질 사용
          // MDF(뒷판, 서랍바닥 등)는 panelExtractor에서 이미 설정됨
          if (!panel.material || panel.material === 'PB') {
            panel.material = material;
          }
          panel.color = color;
          // 가구 인덱스와 패널 인덱스를 조합하여 고유 ID 생성
          panel.id = `m${moduleIndex}_p${panelIndex}`;
        });

        allPanels.push(...modulePanels);
      });

      console.log('Total panels extracted:', allPanels.length);
      console.log('All panels:', allPanels);

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