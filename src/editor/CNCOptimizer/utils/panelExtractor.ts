import { Panel } from '../types';
import { ModuleData } from '@/data/modules';

// 패널 정보 계산 함수 - PlacedModulePropertiesPanel과 동일한 로직
export const calculatePanelDetails = (
  moduleData: ModuleData,
  customWidth: number,
  customDepth: number,
  hasDoor: boolean = false,
  backPanelThicknessMm?: number, // 백패널 두께 (mm, 기본값: 9)
  topFrameHeightMm?: number, // 상부프레임 높이 (mm)
  baseFrameHeightMm?: number // 하부프레임(받침대) 높이 (mm)
): Panel[] => {
  const panels: Panel[] = [];
  let panelId = 1;
  
  // 실제 3D 렌더링과 동일한 두께 값들
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;
  const rawBackPanelThickness = backPanelThicknessMm ?? 9;
  // RightPanel에서 PET 코팅 시 이미 +0.5 적용된 값(3.5/5.5/9.5)을 저장하므로
  // 소수점이 있으면 이미 적용된 것으로 판단하여 추가 +0.5 하지 않음
  const isAlreadyPETAdjusted = rawBackPanelThickness % 1 !== 0;
  const backPanelThickness = (!isAlreadyPETAdjusted && (basicThickness === 18.5 || basicThickness === 15.5))
    ? rawBackPanelThickness + 0.5
    : rawBackPanelThickness;
  const drawerHandleThickness = basicThickness; // 마이다는 외부 노출 패널이므로 도어와 동일한 basicThickness
  const drawerSideThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? 15.5 : basicThickness; // PET 코팅 시 15.5mm, 그 외 basicThickness 그대로
  const drawerBottomThickness = backPanelThickness; // MDF 재질 - 백패널과 동일
  
  const height = moduleData.dimensions.height;
  // 18.5/15.5mm는 양면 접합 두께이므로 innerWidth는 정수 두께로 계산 (슬롯폭 유지)
  const innerWidthThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? Math.floor(basicThickness) : basicThickness;
  const innerWidth = customWidth - (innerWidthThickness * 2);
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
      const dividerName = moduleData.id.includes('2hanging') ? '선반' : '중간 칸막이';
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

    // ======== 현관장 H 전용: 서랍받침대 + 서랍속장(날개벽) + 속서랍 ========
    if (moduleData.id.includes('entryway-h')) {
      const backReduction = backPanelThickness + 17; // 26mm (뒤에서 줄이는 양)
      const lowerTopOffset = 85; // 하부 상판 앞쪽 오프셋

      // 1. 서랍받침대 (하부 상판과 동일 크기, 188mm 아래)
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 서랍받침대`,
        width: innerWidth,
        height: customDepth - backReduction - lowerTopOffset,
        thickness: basicThickness,
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'HORIZONTAL'
      });

      // 2. 서랍속장(날개벽) — 수직 패널 좌/우
      const wingVertDepth = customDepth - lowerTopOffset - backReduction - 2 * basicThickness;
      ['좌', '우'].forEach(side => {
        panels.push({
          id: `panel-${panelId++}`,
          name: `${moduleData.name} - 서랍속장(${side})`,
          width: wingVertDepth,
          height: 188,
          thickness: basicThickness,
          material: 'PB',
          color: 'MW',
          quantity: 1,
          grain: 'VERTICAL'
        });
      });

      // 3. 서랍속장(날개벽) — 수평 패널 전면/후면 × 좌/우 = 4개
      const wingHorizWidth = 27 + basicThickness; // 45mm
      ['좌', '우'].forEach(side => {
        ['전면', '후면'].forEach(face => {
          panels.push({
            id: `panel-${panelId++}`,
            name: `${moduleData.name} - 서랍속장(${side}) ${face}`,
            width: wingHorizWidth,
            height: 188,
            thickness: basicThickness,
            material: 'PB',
            color: 'MW',
            quantity: 1,
            grain: 'VERTICAL'
          });
        });
      });

      // 4. 속서랍 — 날개벽 안쪽면 사이에서 좌우 5mm 갭
      const drawerAreaWidth = innerWidth - 2 * (27 + basicThickness) - 10;
      const drawerSideDepth = customDepth - lowerTopOffset - backReduction - 1.5 * basicThickness;
      const drawerInnerWidth = drawerAreaWidth - 2 * drawerSideThickness;
      const drawerBackH = 155 - 18 - backPanelThickness; // 측판높이 - 하단여유 - 바닥판두께

      // 서랍 좌측판
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 서랍1 좌측판`,
        width: drawerSideDepth,
        height: 155,
        thickness: drawerSideThickness,
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'
      });

      // 서랍 우측판
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 서랍1 우측판`,
        width: drawerSideDepth,
        height: 155,
        thickness: drawerSideThickness,
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'
      });

      // 서랍 앞판
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 서랍1 앞판`,
        width: drawerInnerWidth,
        height: 155,
        thickness: drawerSideThickness,
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'
      });

      // 서랍 뒷판
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 서랍1 뒷판`,
        width: drawerInnerWidth,
        height: Math.round(drawerBackH),
        thickness: drawerSideThickness,
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'
      });

      // 서랍 바닥판
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 서랍1 바닥`,
        width: drawerInnerWidth,
        height: Math.round(drawerSideDepth - 10),
        thickness: backPanelThickness, // MDF 9mm
        material: 'MDF',
        color: 'MW',
        quantity: 1,
        grain: 'NONE'
      });

      // 서랍 마이다 (앞판 = 하부상판~받침대 범위, 좌우 12mm 갭)
      panels.push({
        id: `panel-${panelId++}`,
        name: `${moduleData.name} - 서랍1(마이다)`,
        width: innerWidth - 24,
        height: 212,
        thickness: drawerSideThickness,
        material: 'PB',
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'
      });
    }
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
        thickness: 18.5,  // 도어는 PET 항상 18.5mm
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
        thickness: 18.5,  // 도어는 PET 항상 18.5mm
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
        thickness: 18.5,  // 도어는 PET 항상 18.5mm
        material: 'PET',  // 도어는 PET 재질
        color: 'MW',
        quantity: 1,
        grain: 'VERTICAL'  // Y축 방향이 세로결
      });
    }
  }

  // === 프레임 패널 (상부프레임 / 하부프레임) ===
  const FRAME_THICKNESS = 18.5; // 프레임(PET 재질) 항상 18.5mm

  if (topFrameHeightMm && topFrameHeightMm > 0) {
    panels.push({
      id: `panel-${panelId++}`,
      name: `${moduleData.name} - 상부프레임`,
      width: customWidth,
      height: topFrameHeightMm,
      thickness: FRAME_THICKNESS,
      material: 'PB',
      color: 'MW',
      quantity: 1,
      grain: 'HORIZONTAL'
    });
  }

  if (baseFrameHeightMm && baseFrameHeightMm > 0) {
    panels.push({
      id: `panel-${panelId++}`,
      name: `${moduleData.name} - 하부프레임`,
      width: customWidth,
      height: baseFrameHeightMm,
      thickness: FRAME_THICKNESS,
      material: 'PB',
      color: 'MW',
      quantity: 1,
      grain: 'HORIZONTAL'
    });
  }

  return panels;
};