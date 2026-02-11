import { ModuleData } from '@/data/modules';
import { calculateHingePositions, calculateHingeCount } from '@/domain/boring/calculators/hingeCalculator';
import { DEFAULT_HINGE_SETTINGS } from '@/domain/boring/constants';

// 패널 정보 계산 함수 - 상부장/하부장 구분하여 표시
export const calculatePanelDetails = (
  moduleData: ModuleData,
  customWidth: number,
  customDepth: number,
  hasDoor: boolean = false,
  t: any = (key: string) => key,
  originalWidth?: number, // 도어용 원래 너비 (기둥 조정 전)
  hingePosition?: 'left' | 'right', // 힌지 위치
  hingeType?: 'A' | 'B', // 경첩 타입 (A: 45mm, B: 48mm)
  spaceHeight?: number, // 공간 높이 (mm) - 도어 높이 계산용
  doorTopGap?: number, // 천장에서 도어 상단까지 이격거리 (mm)
  doorBottomGap?: number, // 바닥에서 도어 하단까지 이격거리 (mm)
  baseHeight?: number // 받침대 높이 (mm) - 브라켓 보링 Y오프셋 계산용
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
  const drawerHandleThickness = 15; // 서랍 손잡이판(마이다) 두께
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

      // 측판 높이는 섹션 높이 그대로 사용 (3D 렌더링의 getSectionHeights와 동일)
      const adjustedSectionHeight = sectionHeightMm;

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

      // === 수평 패널 너비 계산 (상판, 바닥판, 선반 공통) ===
      // 좌우 측판과 각각 0.5mm 갭 → 총 1mm 감소
      const horizontalPanelWidth = innerWidth - 1;

      // === 하판 (첫 번째 섹션만) - 뒤에서 26mm 줄임 ===
      if (sectionIndex === 0) {
        targetPanel.push({
          name: `${sectionPrefix}바닥`,
          width: horizontalPanelWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'
        });
      }
      const isMultiSection = sections.length >= 2;
      if (isMultiSection && sectionIndex < sections.length - 1) {
        // 다중 섹션이고 마지막이 아니면: 하부섹션 상판
        targetPanel.push({
          name: `${sectionPrefix}상판`,
          width: horizontalPanelWidth,
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
            width: horizontalPanelWidth,
            depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
            thickness: basicThickness,
            material: 'PB'
          });
        }
        // 상판 - 뒤에서 26mm 줄임
        targetPanel.push({
          name: `${sectionPrefix}상판`,
          width: horizontalPanelWidth,
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

      // 백패널 높이 계산 (BaseFurnitureShell.tsx 3D 렌더링과 동일)
      // 기본: 섹션높이 - 상하판(36) + heightExtension(10) + 상하확장(26) = 섹션높이
      // 2hanging 상부: 추가로 -basicThickness(18) = 섹션높이 - 18
      // 2hanging 하부: 추가로 +lowerHeightBonus(18) = 섹션높이 + 18
      const heightExtension = 10; // backPanelConfig.heightExtension
      const totalHeightExtension = 26; // 위아래 13mm씩
      const lowerHeightBonus = 18; // backPanelConfig.lowerHeightBonus
      const is2Hanging = moduleData.id.includes('2hanging') && !moduleData.id.includes('2drawer');
      const baseBackPanelHeight = sectionHeightMm - basicThickness * 2 + heightExtension + totalHeightExtension;
      let backPanelHeight: number;
      if (is2Hanging && sections.length === 2) {
        if (sectionIndex === 0) {
          // 하부 백패널: + lowerHeightBonus
          backPanelHeight = baseBackPanelHeight + lowerHeightBonus;
        } else {
          // 상부 백패널: - basicThickness
          backPanelHeight = baseBackPanelHeight - basicThickness;
        }
      } else {
        backPanelHeight = baseBackPanelHeight;
      }

      targetPanel.push({
        name: `${sectionPrefix}백패널`,
        width: innerWidth + 10, // 내경폭 + 좌우 5mm씩 확장
        height: backPanelHeight, // 내경높이 + 상하 5mm씩 확장
        thickness: backPanelThickness, // 9mm
        material: 'MDF'
      });

      // 백패널 보강대 (상단/하단) - 60mm 높이, 15mm 깊이
      // 양쪽 0.5mm씩 축소 (총 1mm)
      const reinforcementHeight = 60; // mm
      const reinforcementDepth = 15; // mm
      const reinforcementWidth = innerWidth - 1; // 양쪽 0.5mm씩 축소
      targetPanel.push({
        name: `${sectionPrefix}후면 보강대`,
        width: reinforcementWidth,
        height: reinforcementHeight,
        thickness: reinforcementDepth,
        material: 'PB'
      });
      targetPanel.push({
        name: `${sectionPrefix}후면 보강대`,
        width: reinforcementWidth,
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
          
          // 서랍 손잡이판 (마이다) - PB 15mm
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum}(마이다)`,
            width: customWidth,
            height: individualDrawerHeight,
            thickness: drawerHandleThickness,
            material: 'PB'
          });

          // 서랍 본체 크기 계산 (DrawerRenderer 참조)
          // drawerWidth = innerWidth - 24mm (좌우 12mm 간격)
          // 앞판/뒷판: drawerWidth - 106mm (좌우 측판 안쪽에 끼워짐)
          // 좌측판/우측판: 전체 깊이 사용 (앞뒤 15mm씩 확장)
          const drawerWidth = customWidth - 24; // 서랍 전체 폭
          const drawerFrontBackWidth = drawerWidth - 106; // 앞판/뒷판 폭
          const drawerBodyHeight = individualDrawerHeight - 30; // 상하 15mm씩 감소
          const drawerBodyDepth = customDepth - 47 - drawerHandleThickness; // 앞30mm 뒤17mm 후퇴 + 손잡이판 두께

          // 서랍 앞판/뒷판 바닥판 끼우는 홈 위치 계산
          // 바닥판은 하단에서 10mm + 5mm/2 = 12.5mm 위치
          // 홈 높이는 5mm (바닥판 두께)
          const drawerGroovePositionY = 10; // 하단에서 10mm 위치에 홈 시작
          const drawerGrooveHeight = 5; // 바닥판 두께 = 홈 높이

          // 서랍 앞판 마이다 보링 위치 계산
          // X(너비) 방향: 좌측 50mm, 중앙, 우측 50mm (3개)
          // Y(높이) 방향: 상단 50mm, 하단 50mm (2개)
          const drawerFrontBoringEdgeX = 50; // 좌우 끝에서 50mm
          const drawerFrontBoringEdgeY = 50; // 상하 끝에서 50mm
          const drawerFrontBoringXPositions = [
            drawerFrontBoringEdgeX, // 좌측에서 50mm
            drawerFrontBackWidth / 2, // 중앙
            drawerFrontBackWidth - drawerFrontBoringEdgeX // 우측에서 50mm
          ];
          const drawerFrontBoringYPositions = [
            drawerFrontBoringEdgeY, // 하단에서 30mm
            drawerBodyHeight - drawerFrontBoringEdgeY // 상단에서 30mm
          ];

          // 서랍 앞판 (두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 앞판`,
            width: drawerFrontBackWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 5 // 홈 깊이 5mm
            }],
            // 마이다 보링 위치 (서랍 측판과 연결용)
            boringPositions: drawerFrontBoringYPositions, // Y위치 (height 기준): 상하 30mm
            boringDepthPositions: drawerFrontBoringXPositions // X위치 (width 기준): 좌 50mm, 중앙, 우 50mm
          });

          // 서랍 뒷판 (두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 뒷판`,
            width: drawerFrontBackWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 5 // 홈 깊이 5mm
            }]
          });

          // 서랍 측판 보링 위치 계산 (DrawerRenderer와 동일)
          // Y위치: 위/중간/아래 3개, 끝에서 20mm (height 기준)
          const drawerEdgeOffsetY = 20;
          const drawerBoringYPositions = [
            drawerEdgeOffsetY, // 아래쪽
            drawerBodyHeight / 2, // 중간
            drawerBodyHeight - drawerEdgeOffsetY // 위쪽
          ];
          // X위치: 앞판/뒷판 중간 2개 (width=깊이 기준)
          // DrawerRenderer: frontPanelZ = depth/2 - sideThickness/2 = 앞끝에서 sideThickness/2
          //                 backPanelZ = -depth/2 + sideThickness/2 = 뒤끝에서 sideThickness/2
          const drawerBoringXPositions = [
            drawerSideThickness / 2, // 앞쪽 끝에서 7.5mm
            drawerBodyDepth - drawerSideThickness / 2 // 뒤쪽 끝에서 7.5mm
          ];

          // 서랍 좌측판 (전체 깊이 사용, 두께 15mm)
          // 바닥판 홈 가공 + 앞판/뒷판 보링
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 좌측판`,
            width: drawerBodyDepth, // 전체 깊이 사용
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            boringPositions: drawerBoringYPositions, // Y위치 (height 기준)
            boringDepthPositions: drawerBoringXPositions, // X위치 (width 기준)
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 5 // 홈 깊이 5mm
            }]
          });

          // 서랍 우측판 (전체 깊이 사용, 두께 15mm)
          // 바닥판 홈 가공 + 앞판/뒷판 보링
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 우측판`,
            width: drawerBodyDepth, // 전체 깊이 사용
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            boringPositions: drawerBoringYPositions, // Y위치 (height 기준)
            boringDepthPositions: drawerBoringXPositions, // X위치 (width 기준)
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 5 // 홈 깊이 5mm
            }]
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
        // 2단 옷장 하부장의 shelfPositions: [0]은 치수 표시용이므로 제외
        const is2HangingLower = (moduleData.id.includes('single-2hanging') || moduleData.id.includes('dual-2hanging')) && sectionIndex === 0;
        if (section.shelfPositions && section.shelfPositions.length > 0 && !is2HangingLower) {
          targetPanel.push({
            name: `${sectionPrefix}선반 1`,
            width: horizontalPanelWidth, // 좌우 0.5mm씩 갭
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
            width: horizontalPanelWidth, // 좌우 0.5mm씩 갭
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
    // 도어 높이 = 공간높이 - 천장이격 - 바닥이격 (가구편집창 입력값)
    // spaceHeight가 제공되면 실제 도어 높이 공식 사용, 아니면 기존 방식 fallback
    const actualDoorH = spaceHeight
      ? spaceHeight - (doorTopGap ?? 5) - (doorBottomGap ?? 25)
      : height - doorGap * 2;

    // 도어 보링 데이터 생성 헬퍼
    const createDoorBoringData = (doorW: number, doorH: number, isLeftHinge: boolean) => {
      const hingePositions = calculateHingePositions(doorH);
      // 힌지컵 X 위치 (도어 가장자리에서 cupEdgeDistance)
      const cupX = isLeftHinge
        ? DEFAULT_HINGE_SETTINGS.cupEdgeDistance
        : doorW - DEFAULT_HINGE_SETTINGS.cupEdgeDistance;
      // 나사홀 X 위치 (힌지컵 중심에서 도어 안쪽으로 screwRowDistance만큼)
      const screwX = isLeftHinge
        ? cupX + DEFAULT_HINGE_SETTINGS.screwRowDistance
        : cupX - DEFAULT_HINGE_SETTINGS.screwRowDistance;
      // 나사홀 Y 오프셋 (힌지컵 중심에서 상하)
      const screwHoleSpacing = hingeType === 'B' ? 48 : 45;
      const screwYOffset = screwHoleSpacing / 2; // A: 22.5mm, B: 24mm

      return {
        // boringPositions: 힌지컵 Y좌표 배열 (상단 기준)
        boringPositions: hingePositions,
        // boringDepthPositions: 힌지컵 X좌표
        boringDepthPositions: [cupX],
        // 나사홀 정보
        screwPositions: hingePositions.flatMap(y => [y - screwYOffset, y + screwYOffset]),
        screwDepthPositions: [screwX],
        screwHoleSpacing,
        hingeCount: calculateHingeCount(doorH),
        isLeftHinge,
      };
    };

    if (moduleData.id.includes('dual')) {
      const singleDoorWidth = Math.floor((doorWidth - doorGap * 3) / 2);
      const doorH = actualDoorH;
      const leftDoorBoring = createDoorBoringData(singleDoorWidth, doorH, true);
      const rightDoorBoring = createDoorBoringData(singleDoorWidth, doorH, false);

      panels.door.push({
        name: '좌측 도어',
        width: singleDoorWidth,
        height: doorH,
        thickness: basicThickness,
        material: 'PET',
        boringPositions: leftDoorBoring.boringPositions,
        boringDepthPositions: leftDoorBoring.boringDepthPositions,
        screwPositions: leftDoorBoring.screwPositions,
        screwDepthPositions: leftDoorBoring.screwDepthPositions,
        screwHoleSpacing: leftDoorBoring.screwHoleSpacing,
        isDoor: true,
        isLeftHinge: true,
      });
      panels.door.push({
        name: '우측 도어',
        width: singleDoorWidth,
        height: doorH,
        thickness: basicThickness,
        material: 'PET',
        boringPositions: rightDoorBoring.boringPositions,
        boringDepthPositions: rightDoorBoring.boringDepthPositions,
        screwPositions: rightDoorBoring.screwPositions,
        screwDepthPositions: rightDoorBoring.screwDepthPositions,
        screwHoleSpacing: rightDoorBoring.screwHoleSpacing,
        isDoor: true,
        isLeftHinge: false,
      });
    } else {
      const doorW = doorWidth - doorGap * 2;
      const doorH = actualDoorH;
      const isLeftHinge = (hingePosition ?? 'left') === 'left';
      const doorBoring = createDoorBoringData(doorW, doorH, isLeftHinge);

      panels.door.push({
        name: '도어',
        width: doorW,
        height: doorH,
        thickness: basicThickness,
        material: 'PET',
        boringPositions: doorBoring.boringPositions,
        boringDepthPositions: doorBoring.boringDepthPositions,
        screwPositions: doorBoring.screwPositions,
        screwDepthPositions: doorBoring.screwDepthPositions,
        screwHoleSpacing: doorBoring.screwHoleSpacing,
        isDoor: true,
        isLeftHinge,
      });
    }

    // === 측판에 힌지 브라켓 타공 데이터 주입 ===
    // 도어는 상부+하부 섹션 전체를 한장으로 덮는 구조
    // → 상부+하부 합산 높이를 한몸통으로 계산하여 타공점 결정
    // → 분리 측판이면 각 측판의 Y범위에 해당하는 타공점을 상대좌표로 변환
    // 브라켓 보링: 도어 힌지 Y위치를 측판 기준으로 변환
    // 도어 높이 = actualDoorH (위에서 이미 계산됨)
    const hingeYPositions = calculateHingePositions(actualDoorH);
    // 도어 하단(바닥에서 doorBottomGap) → 측판 하단(바닥에서 baseHeight)
    // 측판 기준 Y = 힌지Y + (doorBottomGap - baseHeight)
    const bracketYOffset = spaceHeight
      ? (doorBottomGap ?? 25) - (baseHeight ?? 65)
      : 2; // fallback: 기존 doorGap
    const bracketYPositions = hingeYPositions.map(y => y + bracketYOffset);

    const allSidePanels = [...panels.upper, ...panels.lower];
    const isLeftSidePanel = (name: string) =>
      (name.includes('좌측') || name.includes('좌측판')) && !name.includes('서랍');
    const isRightSidePanel = (name: string) =>
      (name.includes('우측') || name.includes('우측판')) && !name.includes('서랍');

    // 분리 측판 가구 여부
    const isSplitSidePanelForBracket =
      moduleData.id.includes('4drawer-hanging') ||
      moduleData.id.includes('2drawer-hanging') ||
      moduleData.id.includes('2hanging');

    // 하부 섹션 높이 계산 (분리 측판에서 Y좌표 변환용)
    let lowerSectionHeight = 0;
    if (isSplitSidePanelForBracket && sections.length >= 2) {
      const lowerSection = sections[0];
      if (lowerSection.heightType === 'absolute') {
        lowerSectionHeight = lowerSection.height || 0;
      } else {
        const variableSecs = sections.filter(s => s.heightType !== 'absolute');
        const totalPct = variableSecs.reduce((sum, s) => sum + (s.height || s.heightRatio || 100), 0);
        const pct = (lowerSection.height || lowerSection.heightRatio || 100) / totalPct;
        const fixedSecs = sections.filter(s => s.heightType === 'absolute');
        const totalFixed = fixedSecs.reduce((sum, s) => sum + (s.height || 0), 0);
        lowerSectionHeight = (height - totalFixed) * pct;
      }
    }

    // 측판에 브라켓 타공 주입
    // 좌측판/우측판에 따라 앞 가장자리 방향이 대칭
    // 우측판: 앞=X=width → bracketX = width - distance
    // 좌측판: 앞=X=0 → bracketX = distance
    const injectBracketBoring = (panel: any) => {
      const panelWidth = panel.width || customDepth;
      const bracketXFromFront = [20, 52]; // 앞 가장자리에서의 거리
      const isLeftPanel = panel.name.includes('좌측');
      const bracketXPositions = isLeftPanel
        ? bracketXFromFront // 좌측판: 앞=X=0, 그대로
        : bracketXFromFront.map(d => panelWidth - d); // 우측판: 앞=X=width, 뒤집기

      if (isSplitSidePanelForBracket && sections.length >= 2) {
        // 분리 측판: 전체 기준 Y좌표를 해당 섹션 범위로 필터링 후 상대좌표 변환
        const isLowerPanel = panel.name.includes('(하)');
        const isUpperPanel = panel.name.includes('(상)');

        if (isLowerPanel) {
          // 하부 측판: 0 ~ lowerSectionHeight 범위
          const filtered = bracketYPositions.filter(y => y < lowerSectionHeight);
          if (filtered.length > 0) {
            panel.bracketBoringPositions = filtered;
            panel.bracketBoringDepthPositions = bracketXPositions;
            panel.isBracketSide = true;
          }
        } else if (isUpperPanel) {
          // 상부 측판: lowerSectionHeight 이상 → 상대좌표로 변환
          const filtered = bracketYPositions
            .filter(y => y >= lowerSectionHeight)
            .map(y => y - lowerSectionHeight);
          if (filtered.length > 0) {
            panel.bracketBoringPositions = filtered;
            panel.bracketBoringDepthPositions = bracketXPositions;
            panel.isBracketSide = true;
          }
        }
      } else {
        // 통짜 측판: 전체 기준 Y좌표 그대로
        panel.bracketBoringPositions = bracketYPositions;
        panel.bracketBoringDepthPositions = bracketXPositions;
        panel.isBracketSide = true;
      }
    };

    if (moduleData.id.includes('dual')) {
      allSidePanels.forEach((panel: any) => {
        if (isLeftSidePanel(panel.name) || isRightSidePanel(panel.name)) {
          injectBracketBoring(panel);
        }
      });
    } else {
      const isLeftHinge = (hingePosition ?? 'left') === 'left';
      allSidePanels.forEach((panel: any) => {
        if (isLeftHinge && isLeftSidePanel(panel.name)) {
          injectBracketBoring(panel);
        } else if (!isLeftHinge && isRightSidePanel(panel.name)) {
          injectBracketBoring(panel);
        }
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
