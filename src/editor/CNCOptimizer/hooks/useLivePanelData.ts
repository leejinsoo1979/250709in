import { useEffect, useState, useMemo } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculatePanelDetails as calculatePanelDetailsShared } from '@/editor/shared/utils/calculatePanelDetails';
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
      
      // 가구가 배치되지 않은 경우 빈 배열 반환
      if (!placedModules || placedModules.length === 0) {
        console.log('No modules placed, returning empty panels');
        setPanels([]);
        setIsLoading(false);
        return;
      }
      
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


        // Extract panel details using shared calculatePanelDetails (same as PlacedModulePropertiesPanel)
        const t = (key: string) => key; // 간단한 번역 함수
        const allPanelsList = calculatePanelDetailsShared(moduleData, width, depth, hasDoor, t);

        console.log(`Module ${moduleIndex}: All panels list received:`, allPanelsList);
        console.log(`Module ${moduleIndex}: Total panel count:`, allPanelsList.length);

        // calculatePanelDetailsShared는 평면 배열을 반환함 (섹션 헤더 포함)
        // 섹션 헤더("=== xxx ===")를 제외하고 실제 패널만 필터링
        // 또한 width나 depth 속성이 있어야 실제 패널로 간주
        const modulePanels = allPanelsList.filter((item: any) => {
          const isNotHeader = item.name && !item.name.includes('===');
          const hasValidDimensions = item.width !== undefined || item.depth !== undefined;
          return isNotHeader && hasValidDimensions;
        });

        console.log(`Module ${moduleIndex}: Filtered ${modulePanels.length} actual panels (excluding ${allPanelsList.length - modulePanels.length} section headers)`);

        // 패널 결방향 정보 가져오기
        const panelGrainDirections = placedModule.panelGrainDirections || {};
        console.log(`Module ${moduleIndex}: panelGrainDirections:`, panelGrainDirections);

        // Panel 타입으로 변환하고 고유 ID 할당
        const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
          // 패널 이름으로 결방향 찾기
          const grainDirection = panelGrainDirections[panel.name];
          // horizontal -> HORIZONTAL, vertical -> VERTICAL
          const grainValue = grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

          console.log(`  Panel ${panelIndex}: "${panel.name}" - grain: ${grainDirection} -> ${grainValue}`);

          return {
            id: `m${moduleIndex}_p${panelIndex}`,
            name: panel.name,
            width: panel.width || 0,
            height: panel.height || panel.depth || 0, // depth가 height로 사용될 수 있음
            thickness: panel.thickness,
            material: panel.material || material,
            color: color,
            quantity: 1,
            grain: grainValue
          };
        });

        console.log(`Module ${moduleIndex}: Converted ${convertedPanels.length} panels`);
        allPanels.push(...convertedPanels);
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
    // 가구가 배치되지 않은 경우 빈 배열 콜백
    if (!placedModules || placedModules.length === 0) {
      callback([]);
      return;
    }
    
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

      // Extract panel details using shared calculatePanelDetails (same as PlacedModulePropertiesPanel)
      const t = (key: string) => key; // 간단한 번역 함수
      const allPanelsList = calculatePanelDetailsShared(moduleData, width, depth, hasDoor, t);

      // calculatePanelDetailsShared는 평면 배열을 반환함 (섹션 헤더 포함)
      // 섹션 헤더("=== xxx ===")를 제외하고 실제 패널만 필터링
      // 또한 width나 depth 속성이 있어야 실제 패널로 간주
      const modulePanels = allPanelsList.filter((item: any) => {
        const isNotHeader = item.name && !item.name.includes('===');
        const hasValidDimensions = item.width !== undefined || item.depth !== undefined;
        return isNotHeader && hasValidDimensions;
      });

      // 패널 결방향 정보 가져오기
      const panelGrainDirections = placedModule.panelGrainDirections || {};

      // Panel 타입으로 변환하고 고유 ID 할당
      const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
        // 패널 이름으로 결방향 찾기
        const grainDirection = panelGrainDirections[panel.name];
        // horizontal -> HORIZONTAL, vertical -> VERTICAL
        const grainValue = grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

        return {
          id: `m${moduleIndex}_p${panelIndex}`,
          name: panel.name,
          width: panel.width || 0,
          height: panel.height || panel.depth || 0, // depth가 height로 사용될 수 있음
          thickness: panel.thickness,
          material: panel.material || material,
          color: color,
          quantity: 1,
          grain: grainValue
        };
      });

      allPanels.push(...convertedPanels);
    });

    callback(allPanels);
  }, [placedModules, spaceInfo, callback]);
}