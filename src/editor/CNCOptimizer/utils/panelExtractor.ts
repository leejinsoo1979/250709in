import { Panel } from '../types';
import { ModuleData } from '@/data/modules';

// 패널 정보 계산 함수 - PlacedModulePropertiesPanel과 동일한 로직
export const calculatePanelDetails = (
  moduleData: ModuleData, 
  customWidth: number, 
  customDepth: number, 
  hasDoor: boolean = false
): Panel[] => {
  const panels: Panel[] = [];
  let panelId = 1;
  
  // 실제 3D 렌더링과 동일한 두께 값들
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;
  const backPanelThickness = 9;
  const drawerHandleThickness = 15;
  const drawerSideThickness = 15;
  const drawerBottomThickness = 5;
  
  const height = moduleData.dimensions.height;
  const innerWidth = customWidth - (basicThickness * 2);
  const innerHeight = height - (basicThickness * 2);
  
  // 섹션 정보 가져오기
  let sections;
  if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
    sections = moduleData.modelConfig?.leftSections || [];
  } else {
    sections = moduleData.modelConfig?.sections || [];
  }
  
  const availableHeightMm = height;
  
  // 섹션별 패널 계산
  if (sections && sections.length > 0) {
    const actualAvailableHeight = height - (basicThickness * 2);
    
    const calculateSectionHeight = (section: any, availableHeightMm: number) => {
      const heightType = section.heightType || 'percentage';
      
      if (heightType === 'absolute') {
        return Math.min(section.height || 0, availableHeightMm);
      } else {
        return availableHeightMm * ((section.height || section.heightRatio || 100) / 100);
      }
    };
    
    const fixedSections = sections.filter((s: any) => s.heightType === 'absolute');
    const totalFixedHeight = fixedSections.reduce((sum: number, section: any) => {
      return sum + calculateSectionHeight(section, actualAvailableHeight);
    }, 0);
    
    const dividerCount = sections.length > 1 ? (sections.length - 1) : 0;
    const dividerThickness = dividerCount * basicThickness;
    const remainingHeight = actualAvailableHeight - totalFixedHeight - dividerThickness;
    
    // 섹션 사이 구분판 (안전선반/칸막이)
    if (sections.length > 1) {
      const dividerName = moduleData.id.includes('2hanging') ? '안전선반' : '중간 칸막이';
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - ${dividerName}`,
        width: innerWidth,
        height: customDepth - backPanelThickness - 17,
        thickness: basicThickness,  // 18mm
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'HORIZONTAL'  // X축 방향이 세로결
      });
    }
    
    // 각 섹션별 처리
    sections.forEach((section: any, sectionIndex: number) => {
      let sectionName = '';
      
      // 섹션 구분 로직
      if (moduleData.id.includes('2hanging')) {
        sectionName = sectionIndex === 0 ? '하부장' : '상부장';
      } else if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
        sectionName = section.type === 'drawer' ? '하부장' : '상부장';
      } else if (section.type === 'drawer') {
        sectionName = '하부장';
      } else if (section.type === 'hanging') {
        sectionName = '상부장';
      } else {
        sectionName = sectionIndex === 0 ? '상부장' : '하부장';
      }
      
      const sectionHeightMm = section.heightType === 'absolute' 
        ? calculateSectionHeight(section, actualAvailableHeight)
        : calculateSectionHeight(section, remainingHeight);
      
      // 섹션 좌우측판
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 좌측판`,
        width: customDepth,
        height: Math.round(sectionHeightMm),
        thickness: basicThickness,  // 18mm
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'  // Y축 방향이 세로결
      });

      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 우측판`,
        width: customDepth,
        height: Math.round(sectionHeightMm),
        thickness: basicThickness,  // 18mm
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'  // Y축 방향이 세로결
      });

      // 섹션 상판 (마지막 섹션에만)
      if (sectionIndex === sections.length - 1) {
        panels.push({
          id: `panel-${panelId++}`,
          name: `${moduleData.name} - 상판`,
          width: innerWidth,
          height: customDepth,
          thickness: basicThickness,  // 18mm
          material: 'PB',
          color: 'MW',
          quantity: 1,
          grain: 'HORIZONTAL'  // X축 방향이 세로결
        });
      }

      // 섹션 하판
      const depthAdjustment = sectionIndex === 0 ? 0 : (backPanelThickness + 17);
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 하판`,
        width: innerWidth,
        height: customDepth - depthAdjustment,
        thickness: basicThickness,  // 18mm
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'HORIZONTAL'  // X축 방향이 세로결
      });

      // 섹션 뒷판
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 뒷판`,
        width: innerWidth + 10,
        height: Math.round(sectionHeightMm) + 10,
        thickness: backPanelThickness,  // 9mm
        material: 'MDF',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'  // Y축 방향이 세로결
      });
      
      // 서랍 섹션 처리
      if (section.type === 'drawer' && section.count) {
        const drawerHeights = section.drawerHeights || [];
        
        for (let i = 0; i < section.count; i++) {
          const drawerNum = i + 1;
          
          let individualDrawerHeight;
          if (drawerHeights && drawerHeights[i]) {
            individualDrawerHeight = drawerHeights[i];
          } else {
            individualDrawerHeight = Math.floor((sectionHeightMm - basicThickness * (section.count - 1)) / section.count);
          }
          
          const drawerBodyWidth = customWidth - 76;
          const drawerBodyHeight = individualDrawerHeight - 30;
          const drawerBodyDepth = customDepth - 47 - drawerHandleThickness;
          
          // 서랍 손잡이판 (도어와 같은 역할이므로 PET 재질)
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍${drawerNum} 손잡이판`,
            width: customWidth,
            height: individualDrawerHeight,
            thickness: drawerHandleThickness,  // 15mm
            material: 'PB',  // 서랍 손잡이판(마이다)
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'  // 서랍도 세로 결방향
          });
          
          // 서랍 앞판
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍${drawerNum} 앞판`,
            width: drawerBodyWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness,  // 15mm
            material: 'PB',
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'  // 서랍도 세로 결방향
          });
          
          // 서랍 뒷판
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍${drawerNum} 뒷판`,
            width: drawerBodyWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness,  // 15mm
            material: 'PB',
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'  // 서랍도 세로 결방향
          });
          
          // 서랍 좌우측판
          const drawerSideDepth = drawerBodyDepth - basicThickness * 2;
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍${drawerNum} 좌측판`,
            width: drawerSideDepth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness,  // 15mm
            material: 'PB',
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'  // 서랍도 세로 결방향
          });
          
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍${drawerNum} 우측판`,
            width: drawerSideDepth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness,  // 15mm
            material: 'PB',
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'  // 서랍도 세로 결방향
          });
          
          // 서랍 바닥판
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍${drawerNum} 바닥판`,
            width: drawerBodyWidth - 26,
            height: drawerBodyDepth - 26,
            thickness: drawerBottomThickness,  // 5mm
            material: 'MDF',
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'  // 서랍도 세로 결방향
          });
        }
        
        // 서랍 칸막이
        for (let i = 1; i < section.count; i++) {
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍 칸막이 ${i}`,
            width: innerWidth,
            height: customDepth - backPanelThickness - 17,
            thickness: basicThickness,  // 18mm
            material: 'PB',
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'  // 서랍도 세로 결방향
          });
        }
      } else if (section.type === 'hanging') {
        // 옷장 섹션
        if (section.shelfPositions && section.shelfPositions.length > 0) {
          section.shelfPositions.forEach((pos: any, i: number) => {
            panels.push({
              id: `panel-${panelId++}`,
              name: `${moduleData.name} - 선반 ${i + 1}`,
              width: innerWidth,
              height: customDepth - 8,
              thickness: basicThickness,  // 18mm
              material: 'PB',
              color: 'MW',
              quantity: 1,
              grain: 'HORIZONTAL'  // X축 방향이 세로결
            });
          });
        }
      } else if (section.type === 'shelf' && section.count) {
        // 선반 섹션
        for (let i = 1; i <= section.count; i++) {
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 선반 ${i}`,
            width: innerWidth,
            height: customDepth - 8,
            thickness: basicThickness,  // 18mm
            material: 'PB',
            color: 'MW',
            quantity: 1,
            grain: 'HORIZONTAL'  // X축 방향이 세로결
          });
        }
      }
    });
  } else {
    // 섹션이 없는 기본 구조 (오픈박스 등)
    // 좌우측판
    panels.push({
      id: `panel-${panelId++}`,
      name: `${moduleData.name} - 좌측판`,
      width: customDepth,
      height: height,
      thickness: basicThickness,  // 18mm
      material: 'PB',
      color: 'MW',
      quantity: 1,
      grain: 'VERTICAL'  // 기본값을 세로로 설정
    });
    
    panels.push({
      id: `panel-${panelId++}`,
      name: `${moduleData.name} - 우측판`,
      width: customDepth,
      height: height,
      thickness: basicThickness,  // 18mm
      material: 'PB',
      color: 'MW',
      quantity: 1,
      grain: 'VERTICAL'  // 기본값을 세로로 설정
    });
    
    // 상하판
    panels.push({
      id: `panel-${panelId++}`,
      name: `${moduleData.name} - 상판`,
      width: innerWidth,
      height: customDepth,
      thickness: basicThickness,  // 18mm
      material: 'PB',
      color: 'MW',
      quantity: 1,
      grain: 'HORIZONTAL'  // X축 방향이 세로결
    });

    panels.push({
      id: `panel-${panelId++}`,
      name: `${moduleData.name} - 하판`,
      width: innerWidth,
      height: customDepth,
      thickness: basicThickness,  // 18mm
      material: 'PB',
      color: 'MW',
      quantity: 1,
      grain: 'HORIZONTAL'  // X축 방향이 세로결
    });

    // 뒷판
    panels.push({
      id: `panel-${panelId++}`,
      name: `${moduleData.name} - 뒷판`,
      width: innerWidth,
      height: innerHeight,
      thickness: backPanelThickness,  // 9mm
      material: 'MDF',
      color: 'MW',
      quantity: 1,
      grain: 'VERTICAL'  // Y축 방향이 세로결
    });
  }
  
  // 도어 패널 (PET 재질)
  if (hasDoor) {
    const doorGap = 2;

    if (moduleData.id.includes('dual')) {
      const doorWidth = Math.floor((customWidth - doorGap * 3) / 2);
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 좌측 도어`,
        width: doorWidth,
        height: height - doorGap * 2,
        thickness: basicThickness,  // 18mm
        material: 'PET',  // 도어는 PET 재질
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'  // Y축 방향이 세로결
      });
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 우측 도어`,
        width: doorWidth,
        height: height - doorGap * 2,
        thickness: basicThickness,  // 18mm
        material: 'PET',  // 도어는 PET 재질
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'  // Y축 방향이 세로결
      });
    } else {
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 도어`,
        width: customWidth - doorGap * 2,
        height: height - doorGap * 2,
        thickness: basicThickness,  // 18mm
        material: 'PET',  // 도어는 PET 재질
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'  // Y축 방향이 세로결
      });
    }
  }
  
  return panels;
};