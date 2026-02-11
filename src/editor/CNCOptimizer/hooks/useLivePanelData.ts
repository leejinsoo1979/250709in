import { useEffect, useState, useMemo } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculatePanelDetails as calculatePanelDetailsShared } from '@/editor/shared/utils/calculatePanelDetails';
import { Panel } from '../types';
import { normalizePanels, NormalizedPanel } from '@/utils/cutlist/normalize';
import { calculateShelfBoringPositions } from '@/domain/boring/utils/calculateShelfBoringPositions';

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
      // 가구 배치 높이 = 공간 높이 - 상부프레임 - 하부프레임(받침대)
      const frameTop = spaceInfo.frameSize?.top || 0;
      const baseHeight = spaceInfo.baseConfig?.height || 0;
      const furnitureHeight = spaceInfo.height - frameTop - baseHeight;
      const internalSpace = {
        width: spaceInfo.width - 36,
        height: furnitureHeight,
        depth: spaceInfo.depth
      };

      console.log('internalSpace:', internalSpace, `(공간 ${spaceInfo.height} - 상부프레임 ${frameTop} - 하부 ${baseHeight} = ${furnitureHeight})`);

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
        const moduleHingePosition = (placedModule as any).hingePosition || 'right';
        const moduleHingeType = (placedModule as any).hingeType || 'A';
        const moduleDoorTopGap = (placedModule as any).doorTopGap ?? 5;
        const moduleDoorBottomGap = (placedModule as any).doorBottomGap ?? 25;


        // Extract panel details using shared calculatePanelDetails (same as PlacedModulePropertiesPanel)
        const t = (key: string) => key; // 간단한 번역 함수
        const allPanelsList = calculatePanelDetailsShared(moduleData, width, depth, hasDoor, t, undefined, moduleHingePosition, moduleHingeType, spaceInfo.height, moduleDoorTopGap, moduleDoorBottomGap, baseHeight);

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

        // 분리 측판용 섹션 높이 계산 (allBoringPositions에서 직접 분리)
        const halfThicknessMm = basicThicknessMm / 2; // 9mm
        let lowerSectionHeightForBoring = 0;
        if (sections.length >= 2) {
          const sec0 = sections[0];
          if (sec0.heightType === 'absolute') {
            lowerSectionHeightForBoring = sec0.height;
          } else {
            const availH = furnitureHeight - basicThicknessMm * 2;
            const varSecs = sections.filter(s => s.heightType !== 'absolute');
            const totalPct = varSecs.reduce((sum, s) => sum + (s.height || 100), 0);
            lowerSectionHeightForBoring = availH * ((sec0.height || 100) / totalPct);
          }
        }
        // 하부 측판 범위: 0 ~ lowerSectionHeight (절대좌표)
        // 하부 상판 중심 = 18 + lowerSectionHeight - 18 - 9 = lowerSectionHeight - 9
        // 상부 바닥판 중심 = 18 + lowerSectionHeight - 18 + 9 = lowerSectionHeight + 9
        // 하부 측판 범위: 보링 ≤ lowerSectionHeight (하부 상판까지)
        // 상부 측판 범위: 보링 > lowerSectionHeight (상부 바닥판부터)
        // 상부 측판의 로컬좌표 변환: 보링 - (18 + lowerSectionHeight - 18) = 보링 - lowerSectionHeight
        // 하지만 하부 상판의 절대위치와 상부 바닥판의 절대위치 사이에 칸막이가 있음
        // 칸막이 중심 = basicThickness(18) + lowerSectionHeight - basicThickness(18) = lowerSectionHeight
        // 하부 상판 중심: lowerSectionHeight - halfThickness (하부 측판에 속함)
        // 상부 바닥판 중심: lowerSectionHeight + halfThickness (상부 측판에 속함)
        const lowerCutoff = lowerSectionHeightForBoring; // 이 값 이하면 하부, 초과면 상부
        // 상부 측판의 panelBottom (절대좌표): 칸막이 하면 = lowerSectionHeight
        // 하부는 panelBottom = 0

        console.log(`[BORING DEBUG] Module ${moduleIndex}: allBoringPositions:`, allBoringPositions);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: lowerSectionHeightForBoring=${lowerSectionHeightForBoring}`);

        // Panel 타입으로 변환하고 고유 ID 할당
        const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
          // 패널 이름으로 결방향 찾기
          const grainDirection = panelGrainDirections[panel.name];
          const grainValue = grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

          // 측판인지 확인
          const isDrawerSidePanel = panel.name.includes('서랍') && (panel.name.includes('좌측판') || panel.name.includes('우측판'));
          const isDrawerFrontPanel = panel.name.includes('서랍') && panel.name.includes('앞판');
          const isDoorPanel = panel.isDoor === true || panel.name.includes('도어') || panel.name.includes('Door');
          const isFurnitureSidePanel = (
            panel.name.includes('좌측') ||
            panel.name.includes('우측') ||
            panel.name.includes('좌측판') ||
            panel.name.includes('우측판') ||
            panel.name.includes('Left') ||
            panel.name.includes('Right') ||
            panel.name.includes('측판')
          );
          const isSidePanel = isFurnitureSidePanel;

          // 측판의 보링 위치 결정
          let panelBoringPositions: number[] | undefined = undefined;

          if (isSidePanel) {
            if (isDrawerSidePanel) {
              // 서랍 본체 측판
              if (panel.boringPositions && panel.boringPositions.length > 0) {
                panelBoringPositions = panel.boringPositions;
              } else {
                const drawerHeight = panel.height || 0;
                const edgeOffsetY = 20;
                if (drawerHeight > 0) {
                  panelBoringPositions = [edgeOffsetY, drawerHeight / 2, drawerHeight - edgeOffsetY];
                }
              }
            } else {
              // 가구 본체 측판
              const isUpperSection = panel.name.includes('(상)');
              const isLowerSection = panel.name.includes('(하)');
              const isSplitPanel = isUpperSection || isLowerSection;
              const panelHeight = panel.height || panel.depth || furnitureHeight;

              if (isSplitPanel) {
                // 분리 측판: allBoringPositions에서 직접 섹션 범위 필터링
                // (2D 뷰어 SidePanelBoring과 동일한 소스 데이터 사용)
                if (isLowerSection) {
                  // 하부: 절대좌표 <= lowerCutoff 범위, 로컬좌표 = 그대로 (panelBottom=0)
                  panelBoringPositions = allBoringPositions
                    .filter(pos => pos <= lowerCutoff);
                } else {
                  // 상부: 절대좌표 > lowerCutoff 범위, 로컬좌표 = pos - lowerCutoff
                  panelBoringPositions = allBoringPositions
                    .filter(pos => pos > lowerCutoff)
                    .map(pos => pos - lowerCutoff);
                }
                panelBoringPositions.sort((a, b) => a - b);
                console.log(`  [BORING] 분리 측판 "${panel.name}" (${isLowerSection ? '하부' : '상부'}): allBoringPositions에서 직접 분리 → ${panelBoringPositions.length}개:`, panelBoringPositions);
              } else {
                // 통짜 측판: 전체 보링 그대로
                panelBoringPositions = allBoringPositions
                  .filter(pos => pos >= 0 && pos <= panelHeight);
                console.log(`  [BORING] 통짜 측판 "${panel.name}": ${panelBoringPositions.length}개:`, panelBoringPositions);
              }
            }
          }

          // ★★★ 서랍 앞판 마이다 보링 처리 ★★★
          // calculatePanelDetails에서 이미 계산된 boringPositions/boringDepthPositions 사용
          let panelBoringDepthPositions: number[] | undefined = undefined;

          if (isDrawerFrontPanel) {
            if (panel.boringPositions && panel.boringPositions.length > 0) {
              panelBoringPositions = panel.boringPositions;
              panelBoringDepthPositions = panel.boringDepthPositions;
              console.log(`[BORING] ★ 서랍 앞판 감지! "${panel.name}" - boringPositions:`, panelBoringPositions);
              console.log(`[BORING]   boringDepthPositions:`, panelBoringDepthPositions);
            } else {
              console.log(`[BORING] 서랍 앞판 "${panel.name}": boringPositions 없음 (calculatePanelDetails에서 계산 안됨)`);
            }
          } else if (isDrawerSidePanel) {
            // 서랍 측판은 이미 위에서 panelBoringPositions 처리됨
            panelBoringDepthPositions = panel.boringDepthPositions;
          }

          // ★★★ 도어 패널 보링 처리 ★★★
          let screwPositions: number[] | undefined = undefined;
          let screwDepthPositions: number[] | undefined = undefined;

          if (isDoorPanel) {
            // 도어 패널: 힌지컵 보링 + 나사홀
            if (panel.boringPositions && panel.boringPositions.length > 0) {
              panelBoringPositions = panel.boringPositions;
              panelBoringDepthPositions = panel.boringDepthPositions;
              console.log(`[BORING] ★ 도어 패널 감지! "${panel.name}" - 힌지컵 boringPositions:`, panelBoringPositions);
            }
            if (panel.screwPositions && panel.screwPositions.length > 0) {
              screwPositions = panel.screwPositions;
              screwDepthPositions = panel.screwDepthPositions;
              console.log(`[BORING]   나사홀 screwPositions:`, screwPositions);
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
            boringDepthPositions: panelBoringDepthPositions, // 서랍 측판/앞판만
            groovePositions: panel.groovePositions, // 서랍 앞판/뒷판 바닥판 홈
            // 도어 전용 필드
            screwPositions: isDoorPanel ? screwPositions : undefined,
            screwDepthPositions: isDoorPanel ? screwDepthPositions : undefined,
            isDoor: isDoorPanel || undefined,
            isLeftHinge: isDoorPanel ? panel.isLeftHinge : undefined,
            screwHoleSpacing: isDoorPanel ? panel.screwHoleSpacing : undefined,
            // 측판 힌지 브라켓 타공 필드
            bracketBoringPositions: panel.bracketBoringPositions,
            bracketBoringDepthPositions: panel.bracketBoringDepthPositions,
            isBracketSide: panel.isBracketSide,
          };
        });

        console.log(`Module ${moduleIndex}: Converted ${convertedPanels.length} panels`);
        allPanels.push(...convertedPanels);
      });

      console.log('========================================');
      console.log('📊 패널 추출 완료 요약:');
      console.log(`   - 배치된 가구 수: ${placedModules.length}`);
      console.log(`   - 총 추출된 패널 수: ${allPanels.length}`);
      console.log('   - 가구별 패널 수:');
      const panelCountByModule = new Map<number, number>();
      allPanels.forEach(p => {
        const moduleIdx = parseInt(p.id.split('_')[0].replace('m', ''));
        panelCountByModule.set(moduleIdx, (panelCountByModule.get(moduleIdx) || 0) + 1);
      });
      panelCountByModule.forEach((count, moduleIdx) => {
        console.log(`     가구 ${moduleIdx}: ${count}개 패널`);
      });
      console.log('========================================');
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
    
    // 가구 배치 높이 = 공간 높이 - 상부프레임 - 하부프레임(받침대)
    const frameTop2 = spaceInfo.frameSize?.top || 0;
    const baseHeight2 = spaceInfo.baseConfig?.height || 0;
    const furnitureHeight2 = spaceInfo.height - frameTop2 - baseHeight2;
    const internalSpace = {
      width: spaceInfo.width - 36,
      height: furnitureHeight2,
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
      const moduleHingePosition = (placedModule as any).hingePosition || 'right';
      const moduleHingeType = (placedModule as any).hingeType || 'A';
      const moduleDoorTopGap = (placedModule as any).doorTopGap ?? 5;
      const moduleDoorBottomGap = (placedModule as any).doorBottomGap ?? 25;

      // Extract panel details using shared calculatePanelDetails (same as PlacedModulePropertiesPanel)
      const t = (key: string) => key; // 간단한 번역 함수
      const allPanelsList = calculatePanelDetailsShared(moduleData, width, depth, hasDoor, t, undefined, moduleHingePosition, moduleHingeType, spaceInfo.height, moduleDoorTopGap, moduleDoorBottomGap, baseHeight2);

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

      // 분리 측판용 섹션 높이 계산 (allBoringPositions에서 직접 분리)
      let lowerSectionHeightForBoring2 = 0;
      if (sections.length >= 2) {
        const sec0 = sections[0];
        if (sec0.heightType === 'absolute') {
          lowerSectionHeightForBoring2 = sec0.height;
        } else {
          const availH = furnitureHeight - basicThicknessMm * 2;
          const varSecs = sections.filter(s => s.heightType !== 'absolute');
          const totalPct = varSecs.reduce((sum, s) => sum + (s.height || 100), 0);
          lowerSectionHeightForBoring2 = availH * ((sec0.height || 100) / totalPct);
        }
      }
      const lowerCutoff2 = lowerSectionHeightForBoring2;

      console.log(`[OPT BORING DEBUG] lowerSectionHeightForBoring=${lowerSectionHeightForBoring2}, lowerCutoff=${lowerCutoff2}`);

      // Panel 타입으로 변환하고 고유 ID 할당
      const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
        // 패널 이름으로 결방향 찾기
        const grainDirection = panelGrainDirections[panel.name];
        // horizontal -> HORIZONTAL, vertical -> VERTICAL
        const grainValue = grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

        // 측판인지 확인 (가구 측판 + 서랍 본체 측판 모두 포함)
        const isDrawerSidePanel = panel.name.includes('서랍') && (panel.name.includes('좌측판') || panel.name.includes('우측판'));
        // 서랍 앞판: "서랍1 앞판" 등 - 마이다 보링 대상
        const isDrawerFrontPanel = panel.name.includes('서랍') && panel.name.includes('앞판');
        // 도어 패널 여부
        const isDoorPanel = panel.isDoor === true || panel.name.includes('도어') || panel.name.includes('Door');
        const isFurnitureSidePanel = (
          panel.name.includes('좌측') ||
          panel.name.includes('우측') ||
          panel.name.includes('좌측판') ||
          panel.name.includes('우측판') ||
          panel.name.includes('측판')
        );
        // 가구 측판 또는 서랍 측판 모두 보링 대상
        const isSidePanel = isFurnitureSidePanel;

        console.log(`[OPT PANEL CHECK] "${panel.name}": isDrawerSidePanel=${isDrawerSidePanel}, isDrawerFrontPanel=${isDrawerFrontPanel}, isSidePanel=${isSidePanel}, panel=`, panel);

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

          if (isSplitPanel) {
            // 분리 측판: allBoringPositions에서 직접 섹션 범위 필터링
            // (2D 뷰어 SidePanelBoring과 동일한 소스 데이터 사용)
            if (isLowerSection) {
              // 하부: 절대좌표 <= lowerCutoff 범위
              panelBoringPositions = allBoringPositions
                .filter(pos => pos <= lowerCutoff2);
            } else {
              // 상부: 절대좌표 > lowerCutoff 범위, 로컬좌표 = pos - lowerCutoff
              panelBoringPositions = allBoringPositions
                .filter(pos => pos > lowerCutoff2)
                .map(pos => pos - lowerCutoff2);
            }
            panelBoringPositions.sort((a, b) => a - b);
            console.log(`[OPT BORING] 분리 측판 "${panel.name}" (${isLowerSection ? '하부' : '상부'}): allBoringPositions에서 직접 분리 → ${panelBoringPositions.length}개:`, panelBoringPositions);
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

        // ★★★ 서랍 앞판 마이다 보링 처리 ★★★
        // calculatePanelDetails에서 이미 계산된 boringPositions/boringDepthPositions 사용
        let panelBoringDepthPositions: number[] | undefined = undefined;

        if (isDrawerFrontPanel) {
          if (panel.boringPositions && panel.boringPositions.length > 0) {
            panelBoringPositions = panel.boringPositions;
            panelBoringDepthPositions = panel.boringDepthPositions;
            console.log(`[OPT BORING] ★ 서랍 앞판 감지! "${panel.name}" - boringPositions:`, panelBoringPositions);
            console.log(`[OPT BORING]   boringDepthPositions:`, panelBoringDepthPositions);
          } else {
            console.log(`[OPT BORING] 서랍 앞판 "${panel.name}": boringPositions 없음`);
          }
        } else if (isDrawerSidePanel) {
          // 서랍 측판은 이미 위에서 panelBoringPositions 처리됨
          panelBoringDepthPositions = panel.boringDepthPositions;
        }

        // ★★★ 도어 패널 보링 처리 ★★★
        let screwPositions: number[] | undefined = undefined;
        let screwDepthPositions: number[] | undefined = undefined;

        if (isDoorPanel) {
          // 도어 패널: 힌지컵 보링 + 나사홀
          if (panel.boringPositions && panel.boringPositions.length > 0) {
            panelBoringPositions = panel.boringPositions;
            panelBoringDepthPositions = panel.boringDepthPositions;
            console.log(`[OPT BORING] ★ 도어 패널 감지! "${panel.name}" - 힌지컵 boringPositions:`, panelBoringPositions);
          }
          if (panel.screwPositions && panel.screwPositions.length > 0) {
            screwPositions = panel.screwPositions;
            screwDepthPositions = panel.screwDepthPositions;
            console.log(`[OPT BORING]   나사홀 screwPositions:`, screwPositions);
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
          boringDepthPositions: panelBoringDepthPositions, // 서랍 측판/앞판만
          groovePositions: panel.groovePositions, // 서랍 앞판/뒷판 바닥판 홈
          // 도어 전용 필드
          screwPositions: isDoorPanel ? screwPositions : undefined,
          screwDepthPositions: isDoorPanel ? screwDepthPositions : undefined,
          isDoor: isDoorPanel || undefined,
          isLeftHinge: isDoorPanel ? panel.isLeftHinge : undefined,
          screwHoleSpacing: isDoorPanel ? panel.screwHoleSpacing : undefined,
          // 측판 힌지 브라켓 타공 필드
          bracketBoringPositions: panel.bracketBoringPositions,
          bracketBoringDepthPositions: panel.bracketBoringDepthPositions,
          isBracketSide: panel.isBracketSide,
        };
      });

      allPanels.push(...convertedPanels);
    });

    callback(allPanels);
  }, [placedModules, spaceInfo, callback]);
}