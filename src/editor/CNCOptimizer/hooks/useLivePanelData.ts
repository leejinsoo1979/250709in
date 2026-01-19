import { useEffect, useState, useMemo } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculatePanelDetails as calculatePanelDetailsShared } from '@/editor/shared/utils/calculatePanelDetails';
import { Panel } from '../types';
import { normalizePanels, NormalizedPanel } from '@/utils/cutlist/normalize';
import { calculateShelfBoringPositions, calculateSectionBoringPositions } from '@/domain/boring/utils/calculateShelfBoringPositions';

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
        // 배치된 가구의 moduleData가 있으면 그것을 사용 (높이 변경 등 반영), 없으면 원본 가져오기
        let moduleData = placedModule.moduleData || getModuleById(moduleId, internalSpace, spaceInfo);
        if (!moduleData) {
          console.warn(`Module ${moduleIndex}: No module data found for ${moduleId}`);
          return;
        }

        // customSections가 있으면 modelConfig.sections를 대체 (섹션 높이 변경, 안전선반 제거 등 반영)
        if (placedModule.customSections && moduleData.modelConfig) {
          moduleData = {
            ...moduleData,
            modelConfig: {
              ...moduleData.modelConfig,
              sections: placedModule.customSections
            }
          };
          console.log(`Module ${moduleIndex}: Using customSections from placed module`, placedModule.customSections);
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

        // 보링 위치 계산 (2D 뷰어와 동일한 데이터)
        // sections가 없으면 leftSections 사용 (듀얼 비대칭 가구 대응)
        const modelConfig = moduleData.modelConfig;
        const sections = modelConfig?.sections || modelConfig?.leftSections || [];
        const furnitureHeight = placedModule.customHeight || moduleData.dimensions.height;
        const basicThicknessMm = 18; // 기본 패널 두께

        console.log(`[BORING DEBUG] Module ${moduleIndex}: moduleData.id=${moduleData.id}`);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: sections=`, sections);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: sections.length=`, sections?.length);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: leftSections=`, modelConfig?.leftSections);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: rightSections=`, modelConfig?.rightSections);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: furnitureHeight=${furnitureHeight}`);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: modelConfig=`, modelConfig);

        // 전체 가구 보링 위치 계산
        const boringResult = calculateShelfBoringPositions({
          sections,
          totalHeightMm: furnitureHeight,
          basicThicknessMm,
        });
        const allBoringPositions = boringResult.positions;

        // 섹션별 보링 위치 계산 (상/하 분리 측판용)
        const sectionBoringResult = calculateSectionBoringPositions({
          sections,
          totalHeightMm: furnitureHeight,
          basicThicknessMm,
        });

        console.log(`[BORING DEBUG] Module ${moduleIndex}: allBoringPositions:`, allBoringPositions);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: sectionBoringResult:`, sectionBoringResult);

        // Panel 타입으로 변환하고 고유 ID 할당
        const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
          // 패널 이름으로 결방향 찾기
          const grainDirection = panelGrainDirections[panel.name];
          // horizontal -> HORIZONTAL, vertical -> VERTICAL
          const grainValue = grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

          // 측판인지 확인 (가구 측판 + 서랍 본체 측판 모두 포함)
          // 가구 측판: "(하)좌측", "(상)우측", "좌측판", "우측판" 등 - 가구 본체의 좌우 측판
          // 서랍 측판: "서랍1 좌측판", "서랍1 우측판" 등 - 서랍 본체의 좌우측 패널
          const isDrawerSidePanel = panel.name.includes('서랍') && (panel.name.includes('좌측판') || panel.name.includes('우측판'));
          const isFurnitureSidePanel = (
            panel.name.includes('좌측') ||
            panel.name.includes('우측') ||
            panel.name.includes('좌측판') ||
            panel.name.includes('우측판') ||
            panel.name.includes('Left') ||
            panel.name.includes('Right') ||
            panel.name.includes('측판')
          );
          // 가구 측판 또는 서랍 측판 모두 보링 대상
          const isSidePanel = isFurnitureSidePanel;

          console.log(`[BORING CHECK] Panel "${panel.name}": isDrawerSidePanel=${isDrawerSidePanel}, isSidePanel=${isSidePanel}, panel=`, panel);

          // 측판의 보링 위치 결정
          let panelBoringPositions: number[] | undefined = undefined;

          if (isSidePanel) {
            console.log(`[BORING] ★ 측판 감지! "${panel.name}" isDrawerSidePanel=${isDrawerSidePanel}`);
          } else {
            console.log(`[BORING] 측판 아님: "${panel.name}"`);
          }

          if (isSidePanel) {
            // 서랍 본체 측판인 경우: calculatePanelDetails에서 이미 계산된 boringPositions 사용
            if (isDrawerSidePanel) {
              if (panel.boringPositions && panel.boringPositions.length > 0) {
                panelBoringPositions = panel.boringPositions;
                console.log(`  [BORING CALC] 서랍 측판 "${panel.name}": 이미 계산된 boringPositions 사용`, panelBoringPositions);
              } else {
                // fallback: 직접 계산
                const drawerHeight = panel.height || 0;
                const edgeOffsetY = 20;
                if (drawerHeight > 0) {
                  panelBoringPositions = [edgeOffsetY, drawerHeight / 2, drawerHeight - edgeOffsetY];
                  console.log(`  [BORING CALC] 서랍 측판 "${panel.name}": fallback 계산`, panelBoringPositions);
                }
              }
            } else {
              // 가구 본체 측판
              const isUpperSection = panel.name.includes('(상)');
              const isLowerSection = panel.name.includes('(하)');
              const isSplitPanel = isUpperSection || isLowerSection;
              // 측판 높이: panel.height 또는 panel.depth, 없으면 가구 전체 높이 사용
              const panelHeight = panel.height || panel.depth || furnitureHeight; // 측판 높이 (mm)
              const halfThickness = basicThicknessMm / 2; // 9mm

              console.log(`  [BORING CALC] "${panel.name}": isUpper=${isUpperSection}, isLower=${isLowerSection}, isSplit=${isSplitPanel}, panelHeight=${panelHeight}, furnitureHeight=${furnitureHeight}`);
            console.log(`  [BORING CALC] allBoringPositions:`, allBoringPositions);
            console.log(`  [BORING CALC] sectionBoringResult:`, sectionBoringResult);

            if (isSplitPanel && sectionBoringResult.sectionPositions.length >= 2) {
              // 상/하 분리 측판: 패널 높이 기준으로 보링 위치 계산
              //
              // 중요: sectionInfo.positions는 sectionRanges 기준으로 변환된 좌표이므로
              // 실제 패널 높이(panel.height)와 다를 수 있음
              //
              // 따라서 패널 높이 기준으로 직접 계산:
              // - 지판보링: 9mm (패널 하단에서 9mm)
              // - 상판보링: panelHeight - 9mm (패널 상단에서 9mm 아래)
              // - 선반보링: 선반 위치 (섹션 내 선반이 있는 경우)
              const sectionInfo = isLowerSection
                ? sectionBoringResult.sectionPositions[0]
                : sectionBoringResult.sectionPositions[1];

              console.log(`  [BORING CALC] sectionInfo for ${isLowerSection ? 'lower' : 'upper'}:`, sectionInfo);
              console.log(`  [BORING CALC] panelHeight=${panelHeight}, sectionInfo.height=${sectionInfo?.height}`);

              if (sectionInfo) {
                // 패널 높이 기준으로 보링 위치 재계산
                // 지판보링: 패널 하단에서 9mm (halfThickness)
                // 상판보링: 패널 상단에서 9mm 아래 (panelHeight - halfThickness)
                const bottomBoring = halfThickness; // 9mm
                const topBoring = panelHeight - halfThickness; // panelHeight - 9mm

                // 선반보링: sectionInfo.positions에서 지판/상판 제외한 중간 값들
                // (sectionInfo.positions의 값들을 패널 높이 비율로 변환)
                const shelfBorings: number[] = [];
                if (sectionInfo.positions.length > 2) {
                  // 선반이 있는 경우 (지판, 상판 외의 보링)
                  const sectionHeight = sectionInfo.height || panelHeight;
                  const ratio = panelHeight / sectionHeight;

                  sectionInfo.positions.forEach(pos => {
                    // 지판(약 9mm)이나 상판(약 sectionHeight-9mm) 근처가 아닌 중간 값
                    if (pos > halfThickness + 5 && pos < sectionHeight - halfThickness - 5) {
                      shelfBorings.push(Math.round(pos * ratio));
                    }
                  });
                }

                panelBoringPositions = [bottomBoring, ...shelfBorings, topBoring].sort((a, b) => a - b);
                console.log(`  [BORING CALC] recalculated positions:`, panelBoringPositions);
              }
            } else if (isSplitPanel) {
              // 상/하 분리 측판이지만 sectionPositions가 부족한 경우
              // 패널 높이 기준으로 기본 보링 위치 계산 (상판/바닥판 위치)
              console.log(`  [BORING CALC] 분리 측판이지만 sectionPositions 부족 - 패널 높이 기준 기본 보링 계산`);
              const bottomBoring = halfThickness; // 9mm
              const topBoring = panelHeight - halfThickness; // panelHeight - 9mm
              panelBoringPositions = [bottomBoring, topBoring];
              console.log(`  [BORING CALC] fallback positions:`, panelBoringPositions);
            } else {
              // 통짜 측판: 전체 가구 보링 위치를 패널 로컬 좌표로 변환
              // allBoringPositions는 가구 바닥 기준 절대 좌표
              // 측판 하단(=바닥판 하면=0) 기준으로는 그대로 사용
              // 가장자리(0 또는 panelHeight)에 있는 보링도 포함하도록 >= 및 <= 사용
              console.log(`  [BORING CALC] 통짜 측판 - filtering allBoringPositions for height <= ${panelHeight}`);
              panelBoringPositions = allBoringPositions
                .filter(pos => pos >= 0 && pos <= panelHeight);
              console.log(`  [BORING CALC] result:`, panelBoringPositions);
            }

            console.log(`  [BORING FINAL] "${panel.name}" - boringPositions:`, panelBoringPositions);
            }
          }

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
            grain: grainValue,
            boringPositions: panelBoringPositions,
            boringDepthPositions: panel.boringDepthPositions, // 서랍 측판 보링 X위치
            groovePositions: panel.groovePositions // 서랍 앞판/뒷판 바닥판 홈
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

      // 배치된 가구의 moduleData가 있으면 그것을 사용 (높이 변경 등 반영), 없으면 원본 가져오기
      let moduleData = placedModule.moduleData || getModuleById(moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;

      // customSections가 있으면 modelConfig.sections를 대체 (섹션 높이 변경, 안전선반 제거 등 반영)
      if (placedModule.customSections && moduleData.modelConfig) {
        moduleData = {
          ...moduleData,
          modelConfig: {
            ...moduleData.modelConfig,
            sections: placedModule.customSections
          }
        };
      }

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

      // 보링 위치 계산 (2D 뷰어와 동일한 데이터)
      // sections가 없으면 leftSections 사용 (듀얼 비대칭 가구 대응)
      const modelConfig = moduleData.modelConfig;
      const sections = modelConfig?.sections || modelConfig?.leftSections || [];
      const furnitureHeight = placedModule.customHeight || moduleData.dimensions.height;
      const basicThicknessMm = 18; // 기본 패널 두께

      console.log(`[OPT BORING DEBUG] moduleId=${moduleId}, sections=`, sections);

      // 전체 가구 보링 위치 계산
      const boringResult = calculateShelfBoringPositions({
        sections,
        totalHeightMm: furnitureHeight,
        basicThicknessMm,
      });
      const allBoringPositions = boringResult.positions;

      console.log(`[OPT BORING DEBUG] allBoringPositions=`, allBoringPositions);

      // 섹션별 보링 위치 계산 (상/하 분리 측판용)
      const sectionBoringResult = calculateSectionBoringPositions({
        sections,
        totalHeightMm: furnitureHeight,
        basicThicknessMm,
      });

      // Panel 타입으로 변환하고 고유 ID 할당
      const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
        // 패널 이름으로 결방향 찾기
        const grainDirection = panelGrainDirections[panel.name];
        // horizontal -> HORIZONTAL, vertical -> VERTICAL
        const grainValue = grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

        // 측판인지 확인 (가구 측판 + 서랍 본체 측판 모두 포함)
        const isDrawerSidePanel = panel.name.includes('서랍') && (panel.name.includes('좌측판') || panel.name.includes('우측판'));
        const isFurnitureSidePanel = (
          panel.name.includes('좌측') ||
          panel.name.includes('우측') ||
          panel.name.includes('좌측판') ||
          panel.name.includes('우측판') ||
          panel.name.includes('측판')
        );
        // 가구 측판 또는 서랍 측판 모두 보링 대상
        const isSidePanel = isFurnitureSidePanel;

        console.log(`[OPT PANEL CHECK] "${panel.name}": isDrawerSidePanel=${isDrawerSidePanel}, isSidePanel=${isSidePanel}, panel=`, panel);

        // 측판의 보링 위치 결정
        let panelBoringPositions: number[] | undefined = undefined;

        if (isSidePanel) {
          // 서랍 본체 측판인 경우: calculatePanelDetails에서 이미 계산된 boringPositions 사용
          if (isDrawerSidePanel) {
            if (panel.boringPositions && panel.boringPositions.length > 0) {
              panelBoringPositions = panel.boringPositions;
              console.log(`[OPT BORING] 서랍 측판 "${panel.name}": 이미 계산된 boringPositions 사용`, panelBoringPositions);
            } else {
              // fallback: 직접 계산
              const drawerHeight = panel.height || 0;
              const edgeOffsetY = 20; // 끝에서 20mm

              if (drawerHeight > 0) {
                const topBoring = drawerHeight - edgeOffsetY;
                const middleBoring = drawerHeight / 2;
                const bottomBoring = edgeOffsetY;
                panelBoringPositions = [bottomBoring, middleBoring, topBoring];
                console.log(`[OPT BORING] 서랍 측판 "${panel.name}": fallback 계산`, panelBoringPositions);
              }
            }
          } else {
            // 가구 본체 측판
            const isUpperSection = panel.name.includes('(상)');
            const isLowerSection = panel.name.includes('(하)');
            const isSplitPanel = isUpperSection || isLowerSection;
            // 측판 높이: panel.height 또는 panel.depth, 없으면 가구 전체 높이 사용
            const panelHeight = panel.height || panel.depth || furnitureHeight; // 측판 높이 (mm)
            const halfThickness = basicThicknessMm / 2; // 9mm

            console.log(`[OPT BORING] "${panel.name}": isUpper=${isUpperSection}, isLower=${isLowerSection}, isSplit=${isSplitPanel}, panelHeight=${panelHeight}, furnitureHeight=${furnitureHeight}`);

          if (isSplitPanel && sectionBoringResult.sectionPositions.length >= 2) {
            // 상/하 분리 측판: 패널 높이 기준으로 보링 위치 직접 계산
            const sectionInfo = isLowerSection
              ? sectionBoringResult.sectionPositions[0]
              : sectionBoringResult.sectionPositions[1];

            console.log(`[OPT BORING] sectionInfo:`, sectionInfo);

            if (sectionInfo) {
              // 패널 높이 기준으로 보링 위치 재계산
              // 지판보링: 패널 하단에서 9mm (halfThickness)
              // 상판보링: 패널 상단에서 9mm 아래 (panelHeight - halfThickness)
              const bottomBoring = halfThickness; // 9mm
              const topBoring = panelHeight - halfThickness; // panelHeight - 9mm

              // 선반보링: sectionInfo.positions에서 지판/상판 제외한 중간 값들
              const shelfBorings: number[] = [];
              if (sectionInfo.positions.length > 2) {
                const sectionHeight = sectionInfo.height || panelHeight;
                const ratio = panelHeight / sectionHeight;

                sectionInfo.positions.forEach(pos => {
                  if (pos > halfThickness + 5 && pos < sectionHeight - halfThickness - 5) {
                    shelfBorings.push(Math.round(pos * ratio));
                  }
                });
              }

              panelBoringPositions = [bottomBoring, ...shelfBorings, topBoring].sort((a, b) => a - b);
              console.log(`[OPT BORING] recalculated:`, panelBoringPositions);
            }
          } else if (isSplitPanel) {
            // 상/하 분리 측판이지만 sectionPositions가 부족한 경우
            // 패널 높이 기준으로 기본 보링 위치 계산 (상판/바닥판 위치)
            console.log(`[OPT BORING] 분리 측판이지만 sectionPositions 부족 - 패널 높이 기준 기본 보링 계산`);
            const bottomBoring = halfThickness; // 9mm
            const topBoring = panelHeight - halfThickness; // panelHeight - 9mm
            panelBoringPositions = [bottomBoring, topBoring];
            console.log(`[OPT BORING] fallback positions:`, panelBoringPositions);
          } else {
            // 통짜 측판: 전체 가구 보링 위치를 패널 로컬 좌표로 변환
            // allBoringPositions는 가구 바닥 기준 절대 좌표
            // 가장자리 보링도 포함하도록 >= 및 <= 사용
            console.log(`[OPT BORING] 통짜 측판 - allBoringPositions:`, allBoringPositions);
            panelBoringPositions = allBoringPositions
              .filter(pos => pos >= 0 && pos <= panelHeight);
            console.log(`[OPT BORING] result:`, panelBoringPositions);
          }

          console.log(`[OPT BORING FINAL] "${panel.name}" - boringPositions:`, panelBoringPositions);
          }
        }

        return {
          id: `m${moduleIndex}_p${panelIndex}`,
          name: panel.name,
          width: panel.width || 0,
          height: panel.height || panel.depth || 0, // depth가 height로 사용될 수 있음
          thickness: panel.thickness,
          material: panel.material || material,
          color: color,
          quantity: 1,
          grain: grainValue,
          boringPositions: panelBoringPositions,
          boringDepthPositions: panel.boringDepthPositions, // 서랍 측판 보링 X위치
          groovePositions: panel.groovePositions // 서랍 앞판/뒷판 바닥판 홈
        };
      });

      allPanels.push(...convertedPanels);
    });

    callback(allPanels);
  }, [placedModules, spaceInfo, callback]);
}