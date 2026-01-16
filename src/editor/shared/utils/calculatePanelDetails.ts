import { ModuleData } from '@/data/modules';

// 패널 정보 계산 함수 - 상부장/하부장 구분하여 표시
export const calculatePanelDetails = (
  moduleData: ModuleData,
  customWidth: number,
  customDepth: number,
  hasDoor: boolean = false,
  t: any = (key: string) => key,
  originalWidth?: number // 도어용 원래 너비 (기둥 조정 전)
) => {
  const panels = {
    upper: [],     // 상부장 패널
    lower: [],     // 하부장 패널
    door: []       // 도어 패널
  };

  // 도어는 커버도어이므로 원래 너비 사용, 없으면 customWidth 사용
  const doorWidth = originalWidth || customWidth;
  
  // 실제 3D 렌더링과 동일한 두께 값들 (BaseFurnitureShell.tsx와 DrawerRenderer.tsx 참조)
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;
  const backPanelThickness = 9; // 백패널 두께
  const drawerHandleThickness = 18; // 서랍 손잡이판 두께 (SPECIAL_PANEL_THICKNESS)
  const drawerSideThickness = 15; // 서랍 측면 두께 (DRAWER_SIDE_THICKNESS) 
  const drawerBottomThickness = 5; // 서랍 바닥판 두께
  
  const height = moduleData.dimensions.height;
  const innerWidth = customWidth - (basicThickness * 2);
  const innerHeight = height - (basicThickness * 2);
  
  // 섹션 정보 가져오기
  // 듀얼 타입5,6 특별 처리 (leftSections/rightSections 구조)
  let sections;
  if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
    // leftSections를 기준으로 처리 (서랍 + 옷장)
    sections = moduleData.modelConfig?.leftSections || [];
  } else {
    sections = moduleData.modelConfig?.sections || [];
  }
  
  // availableHeight는 mm 단위로 사용 (내경이 아닌 전체 높이 기준)
  const availableHeightMm = height;
  
  
  // 전체 가구의 기본 구조는 일단 저장하지만 표시하지 않음
  // 나중에 필요시 사용할 수 있도록 보관
  
  // === 섹션별 패널 계산 ===
  if (sections && sections.length > 0) {
    // 섹션 높이 계산 함수 (전체 높이 기준으로 계산)
    const calculateSectionHeight = (section) => {
      const heightType = section.heightType || 'percentage';

      if (heightType === 'absolute') {
        // 절대값인 경우 section.height를 그대로 사용
        return section.height || 0;
      } else {
        // 비율인 경우 (사용되지 않지만 호환성 유지)
        return height * ((section.height || section.heightRatio || 100) / 100);
      }
    };

    // 고정 높이 섹션들의 총 높이
    const fixedSections = sections.filter(s => s.heightType === 'absolute');
    const totalFixedHeight = fixedSections.reduce((sum, section) => {
      return sum + calculateSectionHeight(section);
    }, 0);

    // 중간 칸막이 두께 고려 (섹션 개수 - 1개의 칸막이)
    const dividerCount = sections.length > 1 ? (sections.length - 1) : 0;
    const dividerThickness = dividerCount * basicThickness;

    // 나머지 높이 계산 (전체 - 고정높이)
    const remainingHeight = height - totalFixedHeight;

    // 각 섹션별 내부 구조 처리
    sections.forEach((section, sectionIndex) => {
      // 상부장/하부장 구분
      // 가구 타입에 따른 구분 로직
      let sectionName = '';
      let targetPanel = null;

      // 2단 옷장 (single-2hanging, dual-2hanging): 첫 번째 섹션(hanging)이 하부장, 두 번째 섹션(hanging)이 상부장
      if (moduleData.id.includes('single-2hanging') || moduleData.id.includes('dual-2hanging')) {
        if (sectionIndex === 0) {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 싱글 서랍+옷장 (single-2drawer-hanging, single-4drawer-hanging): drawer면 하부장, hanging이면 상부장
      else if (moduleData.id.includes('single-2drawer-hanging') || moduleData.id.includes('single-4drawer-hanging')) {
        if (section.type === 'drawer') {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 듀얼 서랍+옷장 타입 (dual-2drawer-hanging, dual-4drawer-hanging, dual-4drawer-pantshanger, dual-2drawer-styler)
      else if (moduleData.id.includes('dual-2drawer-hanging') ||
               moduleData.id.includes('dual-4drawer-hanging') ||
               moduleData.id.includes('dual-4drawer-pantshanger') ||
               moduleData.id.includes('dual-2drawer-styler')) {
        if (section.type === 'drawer') {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 일반 서랍장 (상하부장 구분 없음)
      else if (section.type === 'drawer') {
        targetPanel = panels.lower;
        sectionName = '';
      }
      // 기타 (옷장 등)
      else {
        targetPanel = panels.upper;
        sectionName = '';
      }

      // 실제 섹션 높이 계산 (전체 높이 기준)
      let sectionHeightMm;
      if (section.heightType === 'absolute') {
        // 절대값은 정의된 값 그대로 사용
        sectionHeightMm = section.height || 0;
      } else {
        // 비율 섹션은 남은 높이에서 계산
        const variableSections = sections.filter(s => s.heightType !== 'absolute');
        const totalPercentage = variableSections.reduce((sum, s) => sum + (s.height || s.heightRatio || 100), 0);
        const percentage = (section.height || section.heightRatio || 100) / totalPercentage;
        sectionHeightMm = remainingHeight * percentage;
      }

      // === 섹션별 측판 추가 (좌우 2개) ===
      // 측판은 섹션 높이만큼 만들어짐
      const sectionPrefix = sectionName === '상부장' ? '(상)' : sectionName === '하부장' ? '(하)' : '';

      // 상하 분리 측판 가구 여부 확인
      const isSplitSidePanelFurniture =
        moduleData.id.includes('4drawer-hanging') ||
        moduleData.id.includes('2drawer-hanging') ||
        moduleData.id.includes('2hanging');

      // BaseFurnitureShell의 측판 높이 조정 로직 적용
      let adjustedSectionHeight = sectionHeightMm;
      if (isSplitSidePanelFurniture && sections.length === 2) {
        const is4Drawer = moduleData.id.includes('4drawer-hanging');
        if (sectionIndex === 0) {
          // 하부 측판: 4drawer는 조정 없음, 2drawer/2hanging은 +18mm
          adjustedSectionHeight = is4Drawer ? sectionHeightMm : sectionHeightMm + basicThickness;
        } else {
          // 상부 측판: 4drawer는 조정 없음, 2drawer/2hanging은 -18mm
          adjustedSectionHeight = is4Drawer ? sectionHeightMm : sectionHeightMm - basicThickness;
        }
      }

      // 다중 섹션이고 상하 분리 측판 가구인 경우만 섹션별로 추가
      // 그 외는 통짜로 첫 번째 섹션에만 추가
      if (sections.length >= 2 && isSplitSidePanelFurniture) {
        // 상하 분리: 각 섹션마다 측판 추가
        targetPanel.push({
          name: `${sectionPrefix}좌측`,
          width: customDepth,
          height: adjustedSectionHeight,
          thickness: basicThickness,
          material: 'PB'
        });
        targetPanel.push({
          name: `${sectionPrefix}우측`,
          width: customDepth,
          height: adjustedSectionHeight,
          thickness: basicThickness,
          material: 'PB'
        });
      } else if (sectionIndex === 0) {
        // 통짜 측판: 첫 번째 섹션에 전체 높이로 추가
        targetPanel.push({
          name: '좌측판',
          width: customDepth,
          height: height,
          thickness: basicThickness,
          material: 'PB'
        });
        targetPanel.push({
          name: '우측판',
          width: customDepth,
          height: height,
          thickness: basicThickness,
          material: 'PB'
        });
      }

      // === 하판 (첫 번째 섹션만) - 뒤에서 26mm 줄임 ===
      if (sectionIndex === 0) {
        targetPanel.push({
          name: `${sectionPrefix}바닥`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'
        });
      }

      // === 상판 또는 중간판 - 뒤에서 26mm 줄임 ===
      const isMultiSection = sections.length >= 2;
      if (isMultiSection && sectionIndex < sections.length - 1) {
        // 다중 섹션이고 마지막이 아니면: 하부섹션 상판
        targetPanel.push({
          name: `${sectionPrefix}상판`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'
        });
      } else if (sectionIndex === sections.length - 1) {
        // 마지막 섹션
        if (isMultiSection) {
          // 다중 섹션: 상부섹션 바닥판
          targetPanel.push({
            name: `${sectionPrefix}바닥`,
            width: innerWidth,
            depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
            thickness: basicThickness,
            material: 'PB'
          });
        }
        // 상판 - 뒤에서 26mm 줄임
        targetPanel.push({
          name: `${sectionPrefix}상판`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'
        });
      }

      // === 백패널 (섹션별로 분리) ===
      // 백패널 계산:
      // - 가로: innerWidth + 10 (내경폭에서 좌우 5mm씩 확장)
      // - 세로: 섹션 내경높이 + 10 (섹션 내경높이에서 상하 5mm씩 확장)
      // 예: 가구 586×1000 → 백패널 560×974
      //     가로: 586-(18+18)+10=560, 세로: 1000-(18+18)+10=974

      // 섹션 내경 높이 = 섹션 측판 높이 - 상하판 두께(18+18)
      const sectionInnerHeight = sectionHeightMm - basicThickness * 2;
      const backPanelHeight = sectionInnerHeight + 10;

      targetPanel.push({
        name: `${sectionPrefix}백패널`,
        width: innerWidth + 10, // 내경폭 + 좌우 5mm씩 확장
        height: backPanelHeight, // 내경높이 + 상하 5mm씩 확장
        thickness: backPanelThickness, // 9mm
        material: 'MDF'
      });

      // 백패널 보강대 (상단/하단) - 60mm 높이, 15mm 깊이
      const reinforcementHeight = 60; // mm
      const reinforcementDepth = 15; // mm
      targetPanel.push({
        name: `${sectionPrefix}후면 하단보강대`,
        width: innerWidth,
        height: reinforcementHeight,
        thickness: reinforcementDepth,
        material: 'PB'
      });
      targetPanel.push({
        name: `${sectionPrefix}후면 상단보강대`,
        width: innerWidth,
        height: reinforcementHeight,
        thickness: reinforcementDepth,
        material: 'PB'
      });

      // 서랍 섹션 처리 (DrawerRenderer.tsx 참조)
      if (section.type === 'drawer' && section.count) {
        const drawerHeights = section.drawerHeights;
        
        for (let i = 0; i < section.count; i++) {
          const drawerNum = i + 1;
          
          // 개별 서랍 높이 (drawerHeights 배열에서 가져오거나 균등 분할)
          let individualDrawerHeight;
          if (drawerHeights && drawerHeights[i]) {
            individualDrawerHeight = drawerHeights[i];
          } else {
            // 균등 분할 (전체 섹션 높이 - 칸막이 두께) / 서랍 개수
            individualDrawerHeight = Math.floor((sectionHeightMm - basicThickness * (section.count - 1)) / section.count);
          }
          
          // 서랍 손잡이판 (DrawerRenderer의 HANDLE_PLATE) - PET 재질
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum}(마이다)`,
            width: customWidth,
            height: individualDrawerHeight,
            thickness: drawerHandleThickness,
            material: 'PET'  // 서랍 손잡이판은 PET 재질
          });

          // 서랍 본체 크기 계산 (DrawerRenderer 참조)
          // drawerWidth = innerWidth - 24mm (좌우 12mm 간격)
          // 앞판/뒷판: drawerWidth - 106mm (좌우 측판 안쪽에 끼워짐)
          // 좌측판/우측판: 전체 깊이 사용 (앞뒤 15mm씩 확장)
          const drawerWidth = customWidth - 24; // 서랍 전체 폭
          const drawerFrontBackWidth = drawerWidth - 106; // 앞판/뒷판 폭
          const drawerBodyHeight = individualDrawerHeight - 30; // 상하 15mm씩 감소
          const drawerBodyDepth = customDepth - 47 - drawerHandleThickness; // 앞30mm 뒤17mm 후퇴 + 손잡이판 두께

          // 서랍 앞판 (두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 앞판`,
            width: drawerFrontBackWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 뒷판 (두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 뒷판`,
            width: drawerFrontBackWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 좌측판 (전체 깊이 사용, 두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 좌측판`,
            width: drawerBodyDepth, // 전체 깊이 사용
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 우측판 (전체 깊이 사용, 두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 우측판`,
            width: drawerBodyDepth, // 전체 깊이 사용
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 바닥판 (DrawerRenderer의 Drawer Bottom)
          // DrawerRenderer: drawerWidth - 70 - 26 = drawerWidth - 96
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 바닥`,
            width: drawerWidth - 96, // drawerWidth - 70 - 26
            depth: drawerBodyDepth - 20, // drawerBodyDepth - 20
            thickness: drawerBottomThickness,
            material: 'MDF'
          });
        }
      } else if (section.type === 'hanging') {
        // 옷장 섹션 - 안전선반이 있으면 추가 (하나만)
        if (section.shelfPositions && section.shelfPositions.length > 0) {
          targetPanel.push({
            name: `${sectionPrefix}선반 1`,
            width: innerWidth,
            depth: customDepth - 8 - basicThickness, // 실제 선반 깊이 = adjustedDepthForShelves - basicThickness
            thickness: basicThickness,
            material: 'PB'
          });
        }
      } else if (section.type === 'shelf' && section.count) {
        // 선반 구역 (ShelfRenderer.tsx 참조)
        for (let i = 1; i <= section.count; i++) {
          targetPanel.push({
            name: `${sectionPrefix}선반 ${i}`,
            width: innerWidth,
            depth: customDepth - 8 - basicThickness, // 실제 선반 깊이 = adjustedDepthForShelves - basicThickness
            thickness: basicThickness,
            material: 'PB'  // 기본 재질
          });
        }
      } else if (section.type === 'open') {
        // 오픈 섹션 - 패널 없음 (빈 공간)
        // CNC 절단 목록에 추가할 항목 없음
      }
    });
  }
  

  // === 도어 패널 (커버도어이므로 원래 너비 사용) ===
  if (hasDoor) {
    const doorGap = 2;

    if (moduleData.id.includes('dual')) {
      const singleDoorWidth = Math.floor((doorWidth - doorGap * 3) / 2);
      panels.door.push({
        name: '좌측 도어',
        width: singleDoorWidth,
        height: height - doorGap * 2,
        thickness: basicThickness,
        material: 'PET'  // 도어는 PET 재질
      });
      panels.door.push({
        name: '우측 도어',
        width: singleDoorWidth,
        height: height - doorGap * 2,
        thickness: basicThickness,
        material: 'PET'  // 도어는 PET 재질
      });
    } else {
      panels.door.push({
        name: '도어',
        width: doorWidth - doorGap * 2,
        height: height - doorGap * 2,
        thickness: basicThickness,
        material: 'PET'  // 도어는 PET 재질
      });
    }
  }
  
  // 플랫 배열로 변환하여 반환
  const result = [];

  // 상부장 패널 (상부 섹션)
  if (panels.upper.length > 0) {
    result.push({ name: `=== ${t('furniture.upperSection')} ===` });
    result.push(...panels.upper);
  }

  // 하부장 패널 (하부 섹션)
  if (panels.lower.length > 0) {
    result.push({ name: `=== ${t('furniture.lowerSection')} ===` });
    result.push(...panels.lower);
  }

  // 도어 패널은 필요시 표시
  if (panels.door.length > 0 && hasDoor) {
    result.push({ name: `=== ${t('furniture.door')} ===` });
    result.push(...panels.door);
  }

  return result;
};
