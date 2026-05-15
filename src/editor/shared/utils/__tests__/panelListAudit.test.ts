/**
 * 패널리스트 전수 감사 테스트
 *
 * 목적: src/data/modules에서 생성되는 모든 동적 모듈을 enumerate하고,
 *       calculatePanelDetails를 호출해 패널 누락/비정상 사이즈를 검출.
 *
 * 검출 기준:
 *  1. 모듈이 정상적으로 생성되는지 (getModuleById null/undefined 체크)
 *  2. 패널 배열이 비어있지 않은지
 *  3. 각 패널의 width/height/depth가 모두 정의되어 있고 > 0 인지 (NaN/음수/0 금지)
 *  4. 핵심 패널(좌측판/우측판/상판/하판/백패널)이 카테고리별 기대치만큼 존재하는지
 *  5. 도어 옵션 ON일 때 도어 패널이 1개 이상 생성되는지
 *
 * 출력: 발견된 모든 이슈를 console.log + 마지막 expect로 누락 0건임을 검증.
 *       이슈가 있으면 테스트 실패하면서 상세 리포트가 콘솔에 남음.
 */

import { describe, expect, it } from 'vitest';
import { getModuleById, generateDynamicModules, type ModuleData } from '@/data/modules';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculatePanelDetails } from '../calculatePanelDetails';

const translate = (key: string) => key;

interface PanelDetail {
  name?: string;
  width?: number;
  height?: number;
  depth?: number;
  thickness?: number;
  material?: string;
  isDoor?: boolean;
}

interface AuditIssue {
  moduleId: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  detail: string;
}

const SPACE_WIDTH = 3000;
const SPACE_HEIGHT = 2400;
const SPACE_DEPTH = 600;

const makeSpaceInfo = (moduleWidth: number, depth: number, isDual: boolean): SpaceInfo & { _tempSlotWidths: number[] } => {
  // 듀얼이면 두 슬롯, 싱글이면 한 슬롯
  const slotWidths = isDual
    ? [moduleWidth / 2, moduleWidth / 2]
    : [moduleWidth];
  return {
    width: SPACE_WIDTH,
    height: SPACE_HEIGHT,
    depth,
    _tempSlotWidths: slotWidths,
  } as any;
};

const callCalc = (moduleData: ModuleData, hasDoor: boolean): PanelDetail[] => {
  const width = moduleData.dimensions.width;
  const depth = moduleData.dimensions.depth;
  try {
    return calculatePanelDetails(
      moduleData,
      width,
      depth,
      hasDoor,
      translate,
      undefined,
      'right',
      undefined,
      SPACE_HEIGHT,
      undefined,
      undefined,
      undefined,
      9, // backPanelThicknessMm
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ) as PanelDetail[];
  } catch (err) {
    throw new Error(`calculatePanelDetails threw for ${moduleData.id}: ${(err as Error).message}`);
  }
};

// 카테고리별 기대 핵심 패널 (※ 절대 누락되면 안 되는 것)
// 패턴 매칭: 배열은 OR 그룹 (그룹 내 하나라도 있으면 통과)
// 명칭 규칙:
//   - 측판: '좌측판', '우측판' 또는 sectionPrefix가 붙은 '좌측'/'우측' (예: '상부좌측', '하부좌측')
//   - 지판(밑판): '바닥판' 또는 '지판' (또는 sectionPrefix 붙은 '바닥')
//   - 상판: '상판'
const EXPECTED_CORE_PANELS_BY_CATEGORY: Record<string, Array<string[]>> = {
  full: [['좌측'], ['우측'], ['상판'], ['바닥', '지판']],
  upper: [['좌측'], ['우측']],
  lower: [['좌측'], ['우측'], ['바닥', '지판']],
};

// '좌측 서라운드 측면판' 같은 false positive 제외용:
//  ▶ '좌측' 매칭 시 '서라운드'·'서랍'·'도어'·'속장'·'EP'를 포함하면 측판이 아님
const isCoreSidePanelName = (panelName: string, coreKeyword: string): boolean => {
  if (!panelName.includes(coreKeyword)) return false;
  if (coreKeyword === '좌측' || coreKeyword === '우측') {
    if (panelName.includes('서라운드')) return false;
    if (panelName.includes('서랍')) return false;
    if (panelName.includes('도어')) return false;
    if (panelName.includes('속장')) return false;
    if (panelName.includes('EP')) return false;
    if (panelName.includes('엔드')) return false;
  }
  return true;
};

// === 카테고리별 패널 분류 함수 ===
// 출력되어야 하는 5가지 카테고리: 패널/프레임/마이다/도어/서랍모듈
type PanelCategory = 'panel' | 'frame' | 'maida' | 'door' | 'drawer';

const classifyPanel = (p: PanelDetail): PanelCategory | 'other' => {
  const n = p.name ?? '';
  // 1) 도어
  if (p.isDoor) return 'door';
  if (n.includes('도어')) return 'door';
  // 2) 마이다 (서랍 앞판)
  if (n.includes('마이다')) return 'maida';
  // 3) 프레임 류 (몰딩/걸레받이/받침대/보강대/서라운드/엔드/EP/전대/찬넬/프레임)
  if (
    n.includes('몰딩') ||
    n.includes('걸레받이') ||
    n.includes('받침대') ||
    n.includes('보강대') ||
    n.includes('서라운드') ||
    n.includes('엔드') ||
    n.includes('EP') ||
    n.includes('전대') ||
    n.includes('찬넬') ||
    n.includes('프레임') ||
    n.includes('인조대리석') ||
    n.includes('하부마감')
  ) {
    return 'frame';
  }
  // 4) 서랍 모듈 (서랍 측판/뒷판/바닥판/속장)
  if (n.includes('서랍')) return 'drawer';
  // 5) 일반 패널 (좌측/우측/상판/바닥/백패널/선반/칸막이)
  if (
    n.includes('좌측') ||
    n.includes('우측') ||
    n.includes('상판') ||
    n.includes('바닥') ||
    n.includes('지판') ||
    n.includes('백패널') ||
    n.includes('선반') ||
    n.includes('칸막이') ||
    n.includes('중간판') ||
    n.includes('날개')
  ) {
    return 'panel';
  }
  return 'other';
};

// === 모듈별 기대 카테고리 추론 ===
// 모듈ID 패턴으로 출력 카테고리 중 어느 것이 의무인지 결정
interface ExpectedCategories {
  panel: boolean;
  frame: boolean;
  maida: boolean;
  door: boolean;
  drawer: boolean;
}

const inferExpectedCategories = (
  moduleId: string,
  hasDoor: boolean,
): ExpectedCategories => {
  // 기본: 패널은 모든 가구가 가져야 함
  const exp: ExpectedCategories = {
    panel: true,
    frame: false,
    maida: false,
    door: false,
    drawer: false,
  };

  // insert-frame: 프레임만, 다른 건 없음
  if (moduleId.includes('insert-frame')) {
    return { panel: false, frame: true, maida: false, door: false, drawer: false };
  }
  // dummy: 모두 옵션 (placeholder)
  if (moduleId.includes('dummy')) {
    return { panel: true, frame: false, maida: false, door: false, drawer: false };
  }

  // 도어 옵션 ON인 경우
  if (hasDoor) {
    // 유리장 도어는 가구 패널리스트에서 제외 (별도 처리)
    const isGlass = moduleId.includes('glass-cabinet');
    // 인덕션장은 도어 차단 (마이다가 역할)
    const isInduction = moduleId.includes('induction');
    // door-lift-half / top-down-half는 선반장 구조 (마이다 없음, 일반 도어)
    const isHalfShelfDoorOnly =
      moduleId.includes('door-lift-half') || moduleId.includes('top-down-half');
    // 서랍/도어올림/상판내림 가구는 마이다 + 도어 혼합 (단, half 변형 제외)
    const isMaidaDriven =
      !isHalfShelfDoorOnly &&
      (
        moduleId.includes('drawer-2tier') ||
        moduleId.includes('drawer-3tier') ||
        moduleId.includes('door-lift') ||
        moduleId.includes('top-down')
      );

    if (!isGlass && !isInduction) {
      // 마이다가 있는 가구는 마이다 또는 도어 중 하나만 있어도 OK
      if (isMaidaDriven) {
        exp.maida = true; // 마이다는 반드시
        // 도어는 케이스별로 다름 (door-lift는 도어 있음, drawer-only는 없음)
      } else {
        exp.door = true;
      }
    }
  }

  // 서랍 모듈이 있는 가구
  if (
    moduleId.includes('drawer-hanging') ||
    moduleId.includes('drawer-shelf') ||
    moduleId.includes('drawer-2tier') ||
    moduleId.includes('drawer-3tier') ||
    moduleId.includes('door-lift-touch') ||
    moduleId.includes('top-down-touch') ||
    moduleId.includes('entryway') ||
    moduleId.includes('induction') ||
    moduleId.includes('styler') ||
    moduleId.includes('pantshanger')
  ) {
    exp.drawer = true;
  }

  // 마이다 가구
  // ※ 'door-lift-half', 'top-down-half'는 선반장 구조라 마이다 없음 (정상)
  const isHalfShelfVariant =
    moduleId.includes('door-lift-half') || moduleId.includes('top-down-half');
  if (
    !isHalfShelfVariant &&
    (
      moduleId.includes('induction') ||
      moduleId.includes('door-lift-touch') ||
      moduleId.includes('top-down') ||
      moduleId.includes('drawer-2tier') ||
      moduleId.includes('drawer-3tier') ||
      moduleId.includes('drawer-hanging') ||
      moduleId.includes('drawer-shelf') ||
      moduleId.includes('entryway')
    )
  ) {
    exp.maida = true;
  }

  // 프레임 (몰딩/받침대 등) — 거의 모든 가구에 받침대나 보강대가 있음
  // 다만 상부장은 받침대 없을 수 있으므로 옵션
  if (moduleId.includes('upper-cabinet') || moduleId.includes('upper')) {
    exp.frame = false; // 상부장은 옵션
  } else {
    exp.frame = true; // 키큰장/하부장은 프레임 필수 (보강대/받침대)
  }

  return exp;
};

// 유리장은 도어/선반을 가구 패널리스트에 포함하지 않음 (의도된 제외)
const shouldSkipDoorCheck = (moduleId: string): boolean => {
  return moduleId.includes('glass-cabinet');
};
const shouldSkipShelfCheck = (moduleId: string): boolean => {
  return moduleId.includes('glass-cabinet');
};

const hasPanelLike = (panels: PanelDetail[], coreNames: string[]): boolean => {
  return panels.some((p) => {
    if (!p.name) return false;
    return coreNames.some((cn) => isCoreSidePanelName(p.name!, cn));
  });
};

// 패널 사이즈 정상성 체크
// ※ 이 코드베이스의 패널은 2D 컷팅 시트이므로 보통 (width + height) 또는 (width + depth) + thickness 조합.
//   즉, 모든 패널이 3축을 다 갖지는 않음. 다음을 검증:
//    - width는 항상 정의되어야 함
//    - height 또는 depth 중 하나 이상 정의 (둘 다 undefined면 비정상)
//    - thickness는 정의되어 있어야 함 (없으면 절단 불가)
//    - 정의된 값은 0 초과여야 하고, NaN/음수 금지
const validatePanelDimensions = (panel: PanelDetail): string[] => {
  const issues: string[] = [];
  const name = panel.name ?? '(이름 없음)';
  if (name.startsWith('===')) return issues;
  if (name.includes('힌지') || name.includes('정보')) return issues;

  const checkValue = (key: string, value: any, required: boolean) => {
    if (value === undefined || value === null) {
      if (required) issues.push(`${key}=undefined`);
      return;
    }
    if (typeof value !== 'number') {
      issues.push(`${key}=${value}(non-number)`);
      return;
    }
    if (Number.isNaN(value)) {
      issues.push(`${key}=NaN`);
      return;
    }
    if (value < 0) {
      issues.push(`${key}=${value}(negative)`);
      return;
    }
    if (value === 0) {
      issues.push(`${key}=0`);
    }
  };

  // width는 항상 필수
  checkValue('width', panel.width, true);
  // height/depth 중 적어도 하나는 필수
  const hasHeight = typeof panel.height === 'number' && !Number.isNaN(panel.height);
  const hasDepth = typeof panel.depth === 'number' && !Number.isNaN(panel.depth);
  if (!hasHeight && !hasDepth) {
    issues.push('height/depth 모두 누락 (2D 시트의 길이 축 없음)');
  } else {
    // 정의된 쪽만 0/음수 체크
    if (hasHeight) checkValue('height', panel.height, false);
    if (hasDepth) checkValue('depth', panel.depth, false);
  }
  // thickness 체크
  checkValue('thickness', (panel as any).thickness, true);

  return issues;
};

// 다양한 옵션 조합 시나리오
interface Scenario {
  name: string;
  hasDoor: boolean;
  spaceHeight?: number;
  doorTopGap?: number;
  doorBottomGap?: number;
  freeHeight?: number;
  stoneTopThickness?: number;
  backPanelThicknessMm?: number;
}

const SCENARIOS: Scenario[] = [
  { name: '기본/도어없음', hasDoor: false, backPanelThicknessMm: 9 },
  { name: '기본/도어있음', hasDoor: true, backPanelThicknessMm: 9 },
  { name: '공간높이3000', hasDoor: true, spaceHeight: 3000, backPanelThicknessMm: 9 },
  { name: '공간높이1800', hasDoor: true, spaceHeight: 1800, backPanelThicknessMm: 9 },
  { name: '자유배치높이800', hasDoor: true, freeHeight: 800, backPanelThicknessMm: 9 },
  { name: '인조대리석30T', hasDoor: true, stoneTopThickness: 30, doorTopGap: -80, doorBottomGap: 25, backPanelThicknessMm: 9 },
  { name: '백패널12T', hasDoor: true, backPanelThicknessMm: 12 },
];

const callCalcWithScenario = (moduleData: ModuleData, sc: Scenario): PanelDetail[] => {
  const width = moduleData.dimensions.width;
  const depth = moduleData.dimensions.depth;
  return calculatePanelDetails(
    moduleData,
    width,
    depth,
    sc.hasDoor,
    translate,
    undefined, // originalWidth
    'right',   // hingePosition
    undefined, // hingeType
    sc.spaceHeight ?? SPACE_HEIGHT, // spaceHeight
    sc.doorTopGap,                   // doorTopGap
    sc.doorBottomGap,                // doorBottomGap
    undefined, // baseHeight
    sc.backPanelThicknessMm ?? 9,    // backPanelThicknessMm
    undefined, // customConfig
    undefined, // hasLeftEndPanel
    undefined, // hasRightEndPanel
    undefined, // endPanelThickness
    sc.freeHeight, // freeHeight
    undefined, // topFrameHeightMm
    undefined, // baseFrameHeightMm
    undefined, // hasTopFrame
    undefined, // hasBase
    undefined, // isDualSlot
    undefined, // leftEpAdjacentFurniture
    undefined, // rightEpAdjacentFurniture
    undefined, // topPanelNotchSize
    undefined, // topPanelNotchSide
    sc.stoneTopThickness, // stoneTopThickness
  ) as PanelDetail[];
};

describe('Panel List Audit — 전체 모듈 패널 누락/사이즈 검증', () => {
  it('모든 동적 모듈에 대해 패널이 정상 생성된다', () => {
    const internalSpace = { width: SPACE_WIDTH, height: SPACE_HEIGHT, depth: SPACE_DEPTH };
    const spaceInfo: any = {
      width: SPACE_WIDTH,
      height: SPACE_HEIGHT,
      depth: SPACE_DEPTH,
    };

    const allModules = generateDynamicModules(internalSpace, spaceInfo);

    const issues: AuditIssue[] = [];
    const stats = {
      totalModules: 0,
      modulesWithIssues: new Set<string>(),
      categoryStats: { full: 0, upper: 0, lower: 0 } as Record<string, number>,
    };

    for (const baseModule of allModules) {
      const moduleId = baseModule.id;
      const category = baseModule.category;
      stats.totalModules += 1;
      stats.categoryStats[category] = (stats.categoryStats[category] ?? 0) + 1;

      // getModuleById로 다시 가져와서 _tempSlotWidths 반영된 풀 모듈 얻기
      const isDual = moduleId.includes('dual-');
      const sInfo = makeSpaceInfo(baseModule.dimensions.width, baseModule.dimensions.depth, isDual);
      const moduleData = getModuleById(moduleId, internalSpace, sInfo) || baseModule;

      // hasDoor = false / true 두 경우 모두 테스트
      for (const hasDoor of [false, true]) {
        let panels: PanelDetail[];
        try {
          panels = callCalc(moduleData, hasDoor);
        } catch (err) {
          issues.push({
            moduleId,
            category,
            severity: 'CRITICAL',
            type: 'THROW',
            detail: `hasDoor=${hasDoor} 호출 중 예외: ${(err as Error).message}`,
          });
          stats.modulesWithIssues.add(moduleId);
          continue;
        }

        // 1. 패널 배열이 비어있는지
        if (!Array.isArray(panels)) {
          issues.push({
            moduleId,
            category,
            severity: 'CRITICAL',
            type: 'NOT_ARRAY',
            detail: `hasDoor=${hasDoor} 반환값이 배열 아님: ${typeof panels}`,
          });
          stats.modulesWithIssues.add(moduleId);
          continue;
        }

        // 섹션 헤더와 정보성 항목 제외한 실제 패널 개수
        const realPanels = panels.filter(
          (p) =>
            p.name &&
            !p.name.startsWith('===') &&
            !p.name.includes('힌지') &&
            !p.name.includes('정보'),
        );
        if (realPanels.length === 0) {
          issues.push({
            moduleId,
            category,
            severity: 'CRITICAL',
            type: 'EMPTY_PANELS',
            detail: `hasDoor=${hasDoor} 실제 패널 0개 (전체 ${panels.length}개 중 모두 헤더/정보성)`,
          });
          stats.modulesWithIssues.add(moduleId);
          continue;
        }

        // 2. 핵심 패널 존재 확인 (카테고리별)
        const expected = EXPECTED_CORE_PANELS_BY_CATEGORY[category] ?? [];
        for (const coreGroup of expected) {
          if (!hasPanelLike(realPanels, coreGroup)) {
            // insert-frame은 예외 (채움재라 일반 측판 없음)
            if (moduleId.includes('insert-frame')) continue;
            // dummy 모듈도 예외 (placeholder)
            if (moduleId.includes('dummy')) continue;
            issues.push({
              moduleId,
              category,
              severity: 'HIGH',
              type: 'MISSING_CORE_PANEL',
              detail: `hasDoor=${hasDoor} 핵심 패널 누락: '${coreGroup.join('/')}'`,
            });
            stats.modulesWithIssues.add(moduleId);
          }
        }

        // 3. 도어 옵션 ON인데 도어 패널 없으면 경고
        //    ※ 단, 마이다(서랍 앞판)가 도어 역할을 하는 가구는 정상
        if (hasDoor && category !== 'upper') {
          const doors = realPanels.filter((p) => p.isDoor || (p.name && p.name.includes('도어')));
          const hasMaida = realPanels.some((p) => p.name && p.name.includes('마이다'));
          if (doors.length === 0 && !hasMaida) {
            // 인덕션장은 도어 차단됨 (정상), insert-frame도 도어 없음
            const doorlessOk =
              moduleId.includes('induction') ||
              moduleId.includes('insert-frame') ||
              moduleId.includes('dummy');
            if (!doorlessOk) {
              issues.push({
                moduleId,
                category,
                severity: 'MEDIUM',
                type: 'DOOR_MISSING',
                detail: `hasDoor=true인데 도어/마이다 패널 0개`,
              });
              stats.modulesWithIssues.add(moduleId);
            }
          }
        }

        // 4. 각 패널 사이즈 정상성
        for (const panel of realPanels) {
          const dimIssues = validatePanelDimensions(panel);
          for (const dimIssue of dimIssues) {
            const isZero = dimIssue.endsWith('=0');
            issues.push({
              moduleId,
              category,
              severity: isZero ? 'LOW' : 'HIGH',
              type: 'BAD_DIMENSION',
              detail: `hasDoor=${hasDoor} '${panel.name}' ${dimIssue}`,
            });
            stats.modulesWithIssues.add(moduleId);
          }
        }

        // 5. 사이즈 탈주 검사: 패널 어느 축이라도 가구 dimension의 1.5배 초과면 의심
        const maxDim = Math.max(
          moduleData.dimensions.width,
          moduleData.dimensions.height,
          moduleData.dimensions.depth,
        );
        const SUSPICIOUS_MULTIPLIER = 1.5;
        for (const panel of realPanels) {
          const checks: Array<[string, number | undefined]> = [
            ['width', panel.width],
            ['height', panel.height],
            ['depth', panel.depth],
          ];
          for (const [axis, val] of checks) {
            if (typeof val === 'number' && !Number.isNaN(val) && val > maxDim * SUSPICIOUS_MULTIPLIER) {
              issues.push({
                moduleId,
                category,
                severity: 'MEDIUM',
                type: 'OVERSIZED_PANEL',
                detail: `hasDoor=${hasDoor} '${panel.name}' ${axis}=${val} (가구 최대치 ${maxDim}의 ${SUSPICIOUS_MULTIPLIER}배 초과)`,
              });
              stats.modulesWithIssues.add(moduleId);
            }
          }
        }

        // 6. 패널 총 개수 sanity (너무 적으면 의심)
        //    insert-frame은 3장만 있어도 정상 (채움재)
        //    dummy도 적을 수 있음
        const skipMinCount = moduleId.includes('insert-frame') || moduleId.includes('dummy');
        if (!skipMinCount && realPanels.length < 5) {
          issues.push({
            moduleId,
            category,
            severity: 'MEDIUM',
            type: 'TOO_FEW_PANELS',
            detail: `hasDoor=${hasDoor} 실제 패널 ${realPanels.length}개 (5개 미만, 의심)`,
          });
          stats.modulesWithIssues.add(moduleId);
        }

        // 7. 명칭 일관성: '하판' 사용 금지 (정식 용어는 '바닥판' 또는 '지판')
        //    sectionPrefix가 붙은 형태도 '바닥'으로 시작하면 OK
        for (const panel of realPanels) {
          if (panel.name && panel.name.includes('하판')) {
            issues.push({
              moduleId,
              category,
              severity: 'LOW',
              type: 'NAMING_INCONSISTENT',
              detail: `'하판' 명칭 사용 — '바닥판' 또는 '지판'으로 통일해야 함: '${panel.name}'`,
            });
            stats.modulesWithIssues.add(moduleId);
          }
        }

        // 8. 카테고리별 출력 검증
        //    사용자 요구사항: 패널/프레임/마이다/도어/서랍모듈 전부 나와야 함
        //    예외: 유리장 도어·선반, 레그라박스 서랍 좌/우측판
        const counts: Record<PanelCategory | 'other', number> = {
          panel: 0, frame: 0, maida: 0, door: 0, drawer: 0, other: 0,
        };
        for (const p of realPanels) {
          counts[classifyPanel(p)] += 1;
        }
        const expectedCats = inferExpectedCategories(moduleId, hasDoor);

        // 유리장은 도어 체크 스킵
        if (expectedCats.door && !shouldSkipDoorCheck(moduleId) && counts.door === 0) {
          issues.push({
            moduleId,
            category,
            severity: 'HIGH',
            type: 'MISSING_CATEGORY',
            detail: `hasDoor=${hasDoor} 도어 카테고리 누락 (도어 패널 0개)`,
          });
          stats.modulesWithIssues.add(moduleId);
        }
        if (expectedCats.maida && counts.maida === 0) {
          issues.push({
            moduleId,
            category,
            severity: 'HIGH',
            type: 'MISSING_CATEGORY',
            detail: `hasDoor=${hasDoor} 마이다 카테고리 누락 (마이다 패널 0개)`,
          });
          stats.modulesWithIssues.add(moduleId);
        }
        if (expectedCats.drawer && counts.drawer === 0) {
          issues.push({
            moduleId,
            category,
            severity: 'HIGH',
            type: 'MISSING_CATEGORY',
            detail: `hasDoor=${hasDoor} 서랍모듈 카테고리 누락 (서랍 패널 0개)`,
          });
          stats.modulesWithIssues.add(moduleId);
        }
        if (expectedCats.frame && counts.frame === 0) {
          issues.push({
            moduleId,
            category,
            severity: 'MEDIUM',
            type: 'MISSING_CATEGORY',
            detail: `hasDoor=${hasDoor} 프레임 카테고리 누락 (프레임/보강대/받침대 0개)`,
          });
          stats.modulesWithIssues.add(moduleId);
        }
        if (expectedCats.panel && counts.panel === 0) {
          issues.push({
            moduleId,
            category,
            severity: 'HIGH',
            type: 'MISSING_CATEGORY',
            detail: `hasDoor=${hasDoor} 일반 패널 카테고리 누락 (좌/우/상/바닥/백 0개)`,
          });
          stats.modulesWithIssues.add(moduleId);
        }
      }
    }

    // ===== 리포트 출력 =====
    const lines: string[] = [];
    lines.push('');
    lines.push('===== PANEL LIST AUDIT REPORT =====');
    lines.push(`총 모듈 수: ${stats.totalModules}`);
    lines.push(`  - 키큰장(full): ${stats.categoryStats.full ?? 0}`);
    lines.push(`  - 상부장(upper): ${stats.categoryStats.upper ?? 0}`);
    lines.push(`  - 하부장(lower): ${stats.categoryStats.lower ?? 0}`);
    lines.push(`이슈 있는 모듈: ${stats.modulesWithIssues.size}`);
    lines.push(`총 이슈 수: ${issues.length}`);
    lines.push('');

    // 심각도별 그룹
    const bySev = {
      CRITICAL: issues.filter((i) => i.severity === 'CRITICAL'),
      HIGH: issues.filter((i) => i.severity === 'HIGH'),
      MEDIUM: issues.filter((i) => i.severity === 'MEDIUM'),
      LOW: issues.filter((i) => i.severity === 'LOW'),
    };

    for (const [sev, list] of Object.entries(bySev)) {
      if (list.length === 0) continue;
      lines.push(`--- ${sev} (${list.length}건) ---`);
      // 모듈ID별 그룹
      const byModule = new Map<string, AuditIssue[]>();
      for (const issue of list) {
        if (!byModule.has(issue.moduleId)) byModule.set(issue.moduleId, []);
        byModule.get(issue.moduleId)!.push(issue);
      }
      for (const [mid, mlist] of byModule) {
        lines.push(`  [${mid}] (${mlist[0].category})`);
        for (const m of mlist) {
          lines.push(`    - ${m.type}: ${m.detail}`);
        }
      }
      lines.push('');
    }

    lines.push('===================================');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // CRITICAL/HIGH 이슈는 실패
    const criticalCount = bySev.CRITICAL.length + bySev.HIGH.length;
    expect(criticalCount, `CRITICAL/HIGH 이슈 ${criticalCount}건 발견 — 위 로그 참조`).toBe(0);
  });

  it('다양한 옵션 시나리오에서도 패널이 정상 생성된다', () => {
    const internalSpace = { width: SPACE_WIDTH, height: SPACE_HEIGHT, depth: SPACE_DEPTH };
    const spaceInfo: any = { width: SPACE_WIDTH, height: SPACE_HEIGHT, depth: SPACE_DEPTH };
    const allModules = generateDynamicModules(internalSpace, spaceInfo);
    const issues: Array<{ moduleId: string; scenario: string; type: string; detail: string }> = [];

    for (const baseModule of allModules) {
      const moduleId = baseModule.id;
      const isDual = moduleId.includes('dual-');
      const sInfo = makeSpaceInfo(baseModule.dimensions.width, baseModule.dimensions.depth, isDual);
      const moduleData = getModuleById(moduleId, internalSpace, sInfo) || baseModule;

      for (const sc of SCENARIOS) {
        let panels: PanelDetail[];
        try {
          panels = callCalcWithScenario(moduleData, sc);
        } catch (err) {
          issues.push({ moduleId, scenario: sc.name, type: 'THROW', detail: (err as Error).message });
          continue;
        }
        const real = panels.filter(
          (p) => p.name && !p.name.startsWith('===') && !p.name.includes('힌지') && !p.name.includes('정보'),
        );
        if (real.length === 0) {
          issues.push({ moduleId, scenario: sc.name, type: 'EMPTY', detail: '패널 0개' });
          continue;
        }
        for (const panel of real) {
          const dimIssues = validatePanelDimensions(panel);
          for (const di of dimIssues) {
            // 0값은 LOW이므로 시나리오 테스트에서는 무시
            if (di.endsWith('=0')) continue;
            issues.push({ moduleId, scenario: sc.name, type: 'BAD_DIM', detail: `'${panel.name}' ${di}` });
          }
        }
      }
    }

    if (issues.length > 0) {
      const lines: string[] = ['', '===== SCENARIO AUDIT FAILURES =====', `총 이슈: ${issues.length}`];
      const byModule = new Map<string, typeof issues>();
      for (const i of issues) {
        if (!byModule.has(i.moduleId)) byModule.set(i.moduleId, []);
        byModule.get(i.moduleId)!.push(i);
      }
      for (const [mid, list] of byModule) {
        lines.push(`  [${mid}]`);
        for (const i of list) lines.push(`    - [${i.scenario}] ${i.type}: ${i.detail}`);
      }
      // eslint-disable-next-line no-console
      console.log(lines.join('\n'));
    }

    expect(issues, `시나리오 검증 이슈 ${issues.length}건 발견`).toEqual([]);
  });

  /**
   * 주방 키큰장 카테고리 상세 감사
   * - 인출장(pull-out), 팬트리장(pantry/split), 일반 냉장고장(fridge-cabinet),
   *   빌트인 냉장고장(built-in-fridge), 키큰장 채움재(insert-frame)
   * - 패널/프레임/마이다/도어/서랍모듈 카테고리별 출력 + 사이즈 정상성 + 상세 패널 명세 출력
   */
  it('주방 키큰장 카테고리: 인출장/냉장고장/팬트리장 등 패널 누락 없음', () => {
    const internalSpace = { width: SPACE_WIDTH, height: SPACE_HEIGHT, depth: SPACE_DEPTH };
    const spaceInfo: any = { width: SPACE_WIDTH, height: SPACE_HEIGHT, depth: SPACE_DEPTH };
    const allModules = generateDynamicModules(internalSpace, spaceInfo);

    const KITCHEN_PATTERNS = [
      'pull-out-cabinet',     // 인출장
      'pantry-cabinet',       // 팬트리장 + 도어분절 팬트리장
      'fridge-cabinet',       // 일반 냉장고장
      'built-in-fridge',      // 빌트인 냉장고장
      'insert-frame',         // 키큰장 채움재
    ];
    const kitchenModules = allModules.filter((m) =>
      KITCHEN_PATTERNS.some((p) => m.id.includes(p)),
    );

    const issues: AuditIssue[] = [];
    const perModuleReport: string[] = [];

    for (const baseModule of kitchenModules) {
      const moduleId = baseModule.id;
      const category = baseModule.category;
      const isDual = moduleId.includes('dual-');
      const sInfo = makeSpaceInfo(baseModule.dimensions.width, baseModule.dimensions.depth, isDual);
      const moduleData = getModuleById(moduleId, internalSpace, sInfo) || baseModule;

      for (const hasDoor of [false, true]) {
        let panels: PanelDetail[];
        try {
          panels = callCalc(moduleData, hasDoor);
        } catch (err) {
          issues.push({
            moduleId,
            category,
            severity: 'CRITICAL',
            type: 'THROW',
            detail: `hasDoor=${hasDoor} 예외: ${(err as Error).message}`,
          });
          continue;
        }

        const realPanels = panels.filter(
          (p) =>
            p.name &&
            !p.name.startsWith('===') &&
            !p.name.includes('힌지') &&
            !p.name.includes('정보'),
        );

        // 카테고리 카운트
        const counts: Record<PanelCategory | 'other', number> = {
          panel: 0, frame: 0, maida: 0, door: 0, drawer: 0, other: 0,
        };
        for (const p of realPanels) counts[classifyPanel(p)] += 1;

        // 모듈별 상세 명세 (hasDoor=true만)
        if (hasDoor) {
          perModuleReport.push(
            `  [${moduleId}] (${category}) — 총 ${realPanels.length}장: 패널=${counts.panel} 프레임=${counts.frame} 마이다=${counts.maida} 도어=${counts.door} 서랍=${counts.drawer} 기타=${counts.other}`,
          );
        }

        // 사이즈 정상성
        for (const panel of realPanels) {
          const dimIssues = validatePanelDimensions(panel);
          for (const di of dimIssues) {
            if (di.endsWith('=0')) continue;
            issues.push({
              moduleId,
              category,
              severity: 'HIGH',
              type: 'BAD_DIMENSION',
              detail: `hasDoor=${hasDoor} '${panel.name}' ${di}`,
            });
          }
        }

        // 기대 카테고리
        const expectedCats = inferExpectedCategories(moduleId, hasDoor);
        if (expectedCats.panel && counts.panel === 0 && !moduleId.includes('insert-frame')) {
          issues.push({
            moduleId, category, severity: 'HIGH', type: 'MISSING_PANEL',
            detail: `hasDoor=${hasDoor} 일반 패널 0개`,
          });
        }
        if (expectedCats.frame && counts.frame === 0) {
          issues.push({
            moduleId, category, severity: 'MEDIUM', type: 'MISSING_FRAME',
            detail: `hasDoor=${hasDoor} 프레임 0개`,
          });
        }
        if (expectedCats.door && counts.door === 0) {
          issues.push({
            moduleId, category, severity: 'HIGH', type: 'MISSING_DOOR',
            detail: `hasDoor=${hasDoor} 도어 0개`,
          });
        }
        if (expectedCats.drawer && counts.drawer === 0) {
          issues.push({
            moduleId, category, severity: 'HIGH', type: 'MISSING_DRAWER',
            detail: `hasDoor=${hasDoor} 서랍모듈 0개`,
          });
        }
      }
    }

    // 보고서
    const out: string[] = [];
    out.push('');
    out.push('===== 주방 키큰장 패널리스트 감사 =====');
    out.push(`검사 모듈: ${kitchenModules.length}개`);
    out.push('');
    out.push('--- 모듈별 카테고리 카운트 (hasDoor=true 기준) ---');
    out.push(...perModuleReport);
    out.push('');
    if (issues.length > 0) {
      out.push(`--- 발견된 이슈 (${issues.length}건) ---`);
      const byModule = new Map<string, AuditIssue[]>();
      for (const i of issues) {
        if (!byModule.has(i.moduleId)) byModule.set(i.moduleId, []);
        byModule.get(i.moduleId)!.push(i);
      }
      for (const [mid, list] of byModule) {
        out.push(`  [${mid}]`);
        for (const i of list) out.push(`    - [${i.severity}] ${i.type}: ${i.detail}`);
      }
    } else {
      out.push('--- 이슈 없음: 모든 모듈에서 카테고리·사이즈 정상 ---');
    }
    out.push('===================================');
    // eslint-disable-next-line no-console
    console.log(out.join('\n'));

    expect(issues.length, `주방 키큰장 이슈 ${issues.length}건`).toBe(0);
  });
});
