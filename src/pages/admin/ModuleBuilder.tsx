import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { isSuperAdmin } from '@/firebase/admins';
import {
  adminFurnitureModuleExists,
  deleteAdminFurnitureModule,
  saveAdminFurnitureModule,
  setAdminFurnitureModuleEnabled,
  subscribeAllAdminFurnitureModules,
  type AdminFurnitureModuleDoc
} from '@/firebase/adminFurnitureModules';
import { generateShelvingModules } from '@/data/modules/shelving';
import type { ModuleData, SectionConfig } from '@/data/modules';
import { calculatePanelDetails } from '@/editor/shared/utils/calculatePanelDetails';
import {
  getExcludedPanelAliases,
  useExcludedPanelsStore
} from '@/editor/shared/viewer3d/context/ExcludedPanelsContext';
import {
  Box,
  ClipboardCopy,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react';
import AdminModulePreview from './AdminModulePreview';
import styles from './ModuleBuilder.module.css';

type ModuleCategory = 'full' | 'upper' | 'lower';
type SectionType = 'open' | 'shelf' | 'hanging' | 'drawer';
type BuilderLayoutMode = 'single' | 'dual';
type SectionSide = 'main' | 'left' | 'right';

interface BuilderSection {
  id: string;
  type: SectionType;
  height: number;
  heightType: 'percentage' | 'absolute';
  count: number;
  shelfPositions: string;
  drawerHeights: string;
  gapHeight: number;
  hasBackPanel: boolean;
  fixedTopZoneMm: number;
}

/** 측판 목찬넬 따내기 한 줄 — 표준 목찬넬: 높이 65 / 깊이 40 */
interface NotchRow {
  id: string;
  fromBottom: number; // 따내기 하단의 바닥 기준 위치 (mm)
  height: number;     // 따내기 높이 (mm)
  depth: number;      // 따내기 깊이 — 측판 앞면에서 뒤로 (mm)
}

const createNotchRow = (fromBottom = 300): NotchRow => ({
  id: `notch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  fromBottom,
  height: 65,
  depth: 40
});

const notchRowsToConfig = (rows: NotchRow[]) => (
  rows
    .filter(row => row.height > 0 && row.depth > 0 && row.fromBottom >= 0)
    .map(row => ({ y: row.height, z: row.depth, fromBottom: row.fromBottom }))
);

const notchConfigToRows = (notches?: Array<{ y: number; z: number; fromBottom: number }>): NotchRow[] => (
  (notches || []).map(notch => ({
    id: `notch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fromBottom: notch.fromBottom,
    height: notch.y,
    depth: notch.z
  }))
);

const createSection = (index: number): BuilderSection => ({
  id: `section-${Date.now()}-${index}`,
  type: 'shelf',
  height: index === 0 ? 100 : 300,
  heightType: index === 0 ? 'percentage' : 'absolute',
  count: 1,
  shelfPositions: '',
  drawerHeights: '',
  gapHeight: 24,
  hasBackPanel: true,
  fixedTopZoneMm: 0
});

const normalizeSlug = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
);

const getCategoryPrefix = (category: ModuleCategory, layoutMode: BuilderLayoutMode) => {
  if (category === 'upper') return layoutMode === 'dual' ? 'dual-upper-cabinet-admin' : 'upper-cabinet-admin';
  if (category === 'lower') return layoutMode === 'dual' ? 'dual-lower-cabinet-admin' : 'lower-cabinet-admin';
  if (layoutMode === 'dual') return 'dual-admin';
  return 'single-admin';
};

const ADMIN_ID_PREFIXES = [
  'dual-upper-cabinet-admin',
  'upper-cabinet-admin',
  'dual-lower-cabinet-admin',
  'lower-cabinet-admin',
  'dual-admin',
  'single-admin'
];

/** 저장된 admin 모듈 ID에서 slug 추출 — `${prefix}-${slug}-${width}` 역변환 */
const extractSlugFromAdminId = (id: string) => {
  const base = id.replace(/-[\d.]+$/, '');
  const prefix = ADMIN_ID_PREFIXES.find(p => base.startsWith(`${p}-`));
  return prefix ? base.slice(prefix.length + 1) : base;
};

/**
 * 표준 모듈 ID 게이트(렌더 라우팅/패널목록/CNC 분류)에 사용되는 토큰들.
 * slug에 포함되면 다른 가구 타입으로 오인될 수 있어 저장 전 경고한다.
 */
const RESERVED_ID_TOKENS = [
  'single', 'dual', 'upper', 'lower', 'cabinet', 'shelf', 'hanging', 'drawer',
  'styler', 'pantshanger', 'custom', 'dummy', 'fridge', 'pantry', 'glass',
  'entryway', 'pull-out', 'door-lift', 'top-down', 'sink', 'dishwasher', 'induction'
];

/**
 * 카테고리별 표준 섬네일 규격 — 기존 갤러리 썸네일(public/images/furniture-thumbnails)과 동일.
 * 업로드 이미지는 이 규격으로 자동 변환된다 (비율 유지 + 투명 여백).
 */
const THUMBNAIL_SPECS: Record<ModuleCategory, Record<BuilderLayoutMode, { width: number; height: number }>> = {
  full: {
    single: { width: 256, height: 512 },
    dual: { width: 256, height: 512 }
  },
  upper: {
    single: { width: 182, height: 134 },
    dual: { width: 243, height: 134 }
  },
  lower: {
    single: { width: 600, height: 750 },
    dual: { width: 600, height: 750 }
  }
};

/** 이미지를 표준 규격 캔버스에 contain 방식으로 그려 PNG dataURL로 변환 */
const resizeThumbnail = (sourceDataUrl: string, targetWidth: number, targetHeight: number): Promise<string> => (
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('캔버스 컨텍스트 생성 실패'));
        return;
      }
      const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      context.drawImage(
        image,
        (targetWidth - drawWidth) / 2,
        (targetHeight - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('이미지 로드 실패'));
    image.src = sourceDataUrl;
  })
);

const sectionLabels: Record<SectionType, string> = {
  open: '오픈',
  shelf: '선반',
  hanging: '행거',
  drawer: '서랍'
};

const parseNumberList = (value: string) => (
  value
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item) && item >= 0)
);

const sectionConfigToBuilderSection = (section: SectionConfig, index: number): BuilderSection => ({
  id: `section-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
  type: section.type,
  height: section.height,
  heightType: section.heightType || 'percentage',
  count: section.count || 0,
  shelfPositions: section.shelfPositions?.join(', ') || '',
  drawerHeights: section.drawerHeights?.join(', ') || '',
  gapHeight: section.gapHeight || 24,
  hasBackPanel: section.hasBackPanel !== false,
  fixedTopZoneMm: section.fixedTopZoneMm || 0
});

const builderSectionToConfig = (section: BuilderSection): SectionConfig => {
  const config: SectionConfig = {
    type: section.type,
    height: section.height,
    heightType: section.heightType,
    count: section.count > 0 ? section.count : undefined
  };

  const shelfPositions = parseNumberList(section.shelfPositions);
  const drawerHeights = parseNumberList(section.drawerHeights);

  if (shelfPositions.length > 0) config.shelfPositions = shelfPositions;
  if (drawerHeights.length > 0) config.drawerHeights = drawerHeights;
  if (section.type === 'drawer' && section.gapHeight > 0) config.gapHeight = section.gapHeight;
  if (!section.hasBackPanel) config.hasBackPanel = false;
  if (section.fixedTopZoneMm > 0) config.fixedTopZoneMm = section.fixedTopZoneMm;

  return config;
};

const ModuleBuilder = () => {
  const { user } = useAuth();
  const allowed = isSuperAdmin(user?.email);
  const [name, setName] = useState('신규 모듈');
  const [slug, setSlug] = useState('custom-module');
  const [category, setCategory] = useState<ModuleCategory>('full');
  const [layoutMode, setLayoutMode] = useState<BuilderLayoutMode>('single');
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(2400);
  const [depth, setDepth] = useState(600);
  const [hasDoor, setHasDoor] = useState(false);
  const [isDynamic, setIsDynamic] = useState(true);
  const [thumbnail, setThumbnail] = useState('');
  // 업로드 원본 보관 — 분류/구조 변경 시 표준 규격으로 재변환
  const [originalThumbnail, setOriginalThumbnail] = useState('');
  const [sections, setSections] = useState<BuilderSection[]>([createSection(0)]);
  const [rightSections, setRightSections] = useState<BuilderSection[]>([createSection(0)]);
  const [rightAbsoluteWidth, setRightAbsoluteWidth] = useState(0);
  const [rightAbsoluteDepth, setRightAbsoluteDepth] = useState(0);
  const [hasSharedMiddlePanel, setHasSharedMiddlePanel] = useState(false);
  const [hasSharedSafetyShelf, setHasSharedSafetyShelf] = useState(false);

  // 측판 목찬넬 따내기 — 좌우 동일(공통, 가로전대 자동) 또는 좌/우 개별
  const [notchSidesLinked, setNotchSidesLinked] = useState(true);
  const [leftNotches, setLeftNotches] = useState<NotchRow[]>([]);
  const [rightNotches, setRightNotches] = useState<NotchRow[]>([]);
  // 하부장 상판 포함 여부 — 기본 OFF (표준 하부장처럼 상판 없음 + 상단 60 따내기 + 목찬넬)
  const [lowerHasTopPanel, setLowerHasTopPanel] = useState(false);

  // 하부장 외부서랍 (레그라박스) — 서랍 구역은 공통 따내기 위치로 분할
  const [useExternalDrawers, setUseExternalDrawers] = useState(false);
  const [extDrawerCount, setExtDrawerCount] = useState(2);
  const [extMaidaHeights, setExtMaidaHeights] = useState('');
  const [extSideAll, setExtSideAll] = useState(0);
  const [extSideFirst, setExtSideFirst] = useState(0);
  const [extSideRest, setExtSideRest] = useState(0);
  const [extTopGap, setExtTopGap] = useState(-20);
  const [extBottomGap, setExtBottomGap] = useState(5);

  // 저장된 모듈 관리
  const [savedDocs, setSavedDocs] = useState<AdminFurnitureModuleDoc[]>([]);
  const [loadedModuleId, setLoadedModuleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 패널목록 — 행 클릭 강조 / 체크박스 해제 시 뷰어에서 숨김
  const [highlightedPanelName, setHighlightedPanelName] = useState<string | null>(null);
  const [hiddenPanelNames, setHiddenPanelNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!allowed) return;
    const unsubscribe = subscribeAllAdminFurnitureModules(setSavedDocs, (error) => {
      console.error('[ModuleBuilder] 저장된 모듈 구독 실패:', error);
    });
    return unsubscribe;
  }, [allowed]);

  const templateModules = useMemo<ModuleData[]>(() => (
    generateShelvingModules({ width: 2400, height: 2400, depth: 600 })
      .filter(module => !module.id.includes('dummy'))
  ), []);

  // 숨김 패널 → ExcludedPanelsStore (BoxWithEdges가 매 프레임 읽어 visible 토글)
  useEffect(() => {
    const { setExcludedKeys, clearExcludedKeys } = useExcludedPanelsStore.getState();
    const keys = new Set<string>();
    hiddenPanelNames.forEach(name => {
      getExcludedPanelAliases(name).forEach(alias => keys.add(alias));
    });
    setExcludedKeys(keys, 'admin-module-builder');
    return () => clearExcludedKeys('admin-module-builder');
  }, [hiddenPanelNames]);

  const moduleDraft = useMemo(() => {
    const normalizedSlug = normalizeSlug(slug || name) || 'custom-module';
    const moduleId = `${getCategoryPrefix(category, layoutMode)}-${normalizedSlug}-${width}`;
    // 측판 목찬넬 따내기 — 공통(sideNotches: 가로전대 자동) 또는 좌/우 개별
    const commonNotchConfig = notchRowsToConfig(leftNotches);
    const rightNotchConfig = notchRowsToConfig(rightNotches);
    const notchModelConfig = notchSidesLinked
      ? (commonNotchConfig.length > 0 ? { sideNotches: commonNotchConfig } : {})
      : {
          ...(commonNotchConfig.length > 0 ? { leftSideNotches: commonNotchConfig } : {}),
          ...(rightNotchConfig.length > 0 ? { rightSideNotches: rightNotchConfig } : {})
        };

    const baseModelConfig = {
      basicThickness: 18,
      hasOpenFront: !hasDoor,
      hasShelf: sections.some(section => section.type === 'shelf') || rightSections.some(section => section.type === 'shelf'),
      shelfCount: sections.filter(section => section.type === 'shelf').length,
      // 하부장: 상판 포함 선택 시에만 false (기본 = 표준 하부장처럼 상판 없음 + 상단 따내기 + 목찬넬)
      ...(category === 'lower' && lowerHasTopPanel ? { hideTopPanel: false } : {}),
      // 패널목록에서 체크 해제한 패널 = 모듈에서 기본 제거 (배치 시 빠진 상태, CNC 제외)
      ...(hiddenPanelNames.size > 0 ? { panelExclusions: Array.from(hiddenPanelNames) } : {}),
      ...notchModelConfig,
      // 하부장: 외부서랍 (레그라박스)
      ...(category === 'lower' && useExternalDrawers ? {
        externalDrawers: {
          count: Math.max(1, extDrawerCount),
          ...(parseNumberList(extMaidaHeights).length > 0 ? { maidaHeights: parseNumberList(extMaidaHeights) } : {}),
          ...((extSideAll > 0 || extSideFirst > 0 || extSideRest > 0) ? {
            sideHeights: {
              ...(extSideAll > 0 ? { all: extSideAll } : {}),
              ...(extSideFirst > 0 ? { first: extSideFirst } : {}),
              ...(extSideRest > 0 ? { rest: extSideRest } : {})
            }
          } : {}),
          topGap: extTopGap,
          bottomGap: extBottomGap
        }
      } : {})
    };

    return {
      id: moduleId,
      name: name.trim() || '신규 모듈',
      category,
      dimensions: {
        width,
        height,
        depth
      },
      color: '#C8B69E',
      thumbnail: thumbnail || undefined,
      hasDoor,
      type: 'box' as const,
      isDynamic,
      ...(isDynamic ? { widthOptions: [width] } : {}),
      defaultDepth: depth,
      ...(layoutMode === 'dual' ? { slotWidths: [Math.round(width / 2), Math.round(width / 2)] } : {}),
      modelConfig: layoutMode === 'dual'
        ? {
            ...baseModelConfig,
            leftSections: sections.map(builderSectionToConfig),
            rightSections: rightSections.map(builderSectionToConfig),
            ...(rightAbsoluteWidth > 0 ? { rightAbsoluteWidth } : {}),
            ...(rightAbsoluteDepth > 0 ? { rightAbsoluteDepth } : {}),
            hasSharedMiddlePanel,
            hasSharedSafetyShelf
          }
        : {
            ...baseModelConfig,
            sections: sections.map(builderSectionToConfig)
          }
    };
  }, [category, depth, extBottomGap, extDrawerCount, extMaidaHeights, extSideAll, extSideFirst, extSideRest, extTopGap, hasDoor, hasSharedMiddlePanel, hasSharedSafetyShelf, height, hiddenPanelNames, isDynamic, layoutMode, leftNotches, lowerHasTopPanel, name, notchSidesLinked, rightAbsoluteDepth, rightAbsoluteWidth, rightNotches, rightSections, sections, slug, thumbnail, useExternalDrawers, width]);

  // 실시간 패널목록 — 실배치/CNC와 동일한 calculatePanelDetails 사용
  const panelList = useMemo(() => {
    try {
      return calculatePanelDetails(moduleDraft as ModuleData, width, depth, hasDoor) as Array<{
        name?: string;
        width?: number;
        height?: number;
        depth?: number;
        thickness?: number;
        material?: string;
        quantity?: number;
      }>;
    } catch (error) {
      console.error('[ModuleBuilder] 패널목록 계산 실패:', error);
      return [];
    }
  }, [moduleDraft, width, depth, hasDoor]);

  const panelRowCount = useMemo(
    () => panelList.filter(panel => panel.name && !panel.name.startsWith('===')).length,
    [panelList]
  );

  const togglePanelHidden = (panelName: string) => {
    setHiddenPanelNames(current => {
      const next = new Set(current);
      if (next.has(panelName)) next.delete(panelName);
      else next.add(panelName);
      return next;
    });
  };

  const setSectionsForSide = (side: SectionSide, updater: (current: BuilderSection[]) => BuilderSection[]) => {
    if (side === 'right') {
      setRightSections(updater);
      return;
    }
    setSections(updater);
  };

  const addSection = (side: SectionSide) => {
    setSectionsForSide(side, current => [...current, createSection(current.length)]);
  };

  const removeSection = (side: SectionSide, sectionId: string) => {
    setSectionsForSide(side, current => current.length > 1 ? current.filter(section => section.id !== sectionId) : current);
  };

  const updateSection = <K extends keyof BuilderSection>(
    side: SectionSide,
    sectionId: string,
    key: K,
    value: BuilderSection[K]
  ) => {
    setSectionsForSide(side, current => current.map(section => (
      section.id === sectionId ? { ...section, [key]: value } : section
    )));
  };

  /** ModuleData → 빌더 폼 상태 복원 (템플릿 적용 + 저장 모듈 수정 공용) */
  const loadModuleIntoForm = (module: ModuleData & { thumbnail?: string }, options?: { asSaved?: boolean }) => {
    if (options?.asSaved) {
      setName(module.name);
      setSlug(extractSlugFromAdminId(module.id));
      setLoadedModuleId(module.id);
    } else {
      setName(module.name.replace(/\s+\d+(?:\.\d+)?mm$/, ''));
      setSlug(module.id.replace(/-[\d.]+$/, ''));
      setLoadedModuleId(null);
    }

    setCategory(module.category as ModuleCategory);
    setWidth(module.dimensions.width);
    setHeight(module.dimensions.height);
    setDepth(module.dimensions.depth);
    setHasDoor(module.hasDoor === true);
    setIsDynamic(module.isDynamic === true);
    setThumbnail(module.thumbnail || '');
    setOriginalThumbnail('');
    setRightAbsoluteWidth(module.modelConfig?.rightAbsoluteWidth || 0);
    setRightAbsoluteDepth(module.modelConfig?.rightAbsoluteDepth || 0);
    setHasSharedMiddlePanel(module.modelConfig?.hasSharedMiddlePanel === true);
    setHasSharedSafetyShelf(module.modelConfig?.hasSharedSafetyShelf === true);

    // 측판 목찬넬 따내기 복원
    setLowerHasTopPanel(module.modelConfig?.hideTopPanel === false);

    // 기본 제거 패널 복원 (패널목록 체크 해제 상태)
    setHiddenPanelNames(new Set(module.modelConfig?.panelExclusions || []));
    setHighlightedPanelName(null);

    // 외부서랍 (레그라박스) 복원
    const externalDrawers = module.modelConfig?.externalDrawers;
    setUseExternalDrawers(!!externalDrawers);
    setExtDrawerCount(externalDrawers?.count || 2);
    setExtMaidaHeights(externalDrawers?.maidaHeights?.join(', ') || '');
    setExtSideAll(externalDrawers?.sideHeights?.all || 0);
    setExtSideFirst(externalDrawers?.sideHeights?.first || 0);
    setExtSideRest(externalDrawers?.sideHeights?.rest || 0);
    setExtTopGap(externalDrawers?.topGap ?? -20);
    setExtBottomGap(externalDrawers?.bottomGap ?? 5);
    const savedLeft = module.modelConfig?.leftSideNotches;
    const savedRight = module.modelConfig?.rightSideNotches;
    if (savedLeft || savedRight) {
      setNotchSidesLinked(false);
      setLeftNotches(notchConfigToRows(savedLeft));
      setRightNotches(notchConfigToRows(savedRight));
    } else {
      setNotchSidesLinked(true);
      setLeftNotches(notchConfigToRows(module.modelConfig?.sideNotches));
      setRightNotches([]);
    }

    if (module.modelConfig?.leftSections || module.modelConfig?.rightSections) {
      setLayoutMode('dual');
      setSections((module.modelConfig.leftSections || [{ type: 'open', height: 100, heightType: 'percentage' }]).map(sectionConfigToBuilderSection));
      setRightSections((module.modelConfig.rightSections || [{ type: 'open', height: 100, heightType: 'percentage' }]).map(sectionConfigToBuilderSection));
    } else {
      setLayoutMode(module.id.includes('dual-') ? 'dual' : 'single');
      const nextSections = (module.modelConfig?.sections || [{ type: 'open', height: 100, heightType: 'percentage' }]).map(sectionConfigToBuilderSection);
      setSections(nextSections);
      setRightSections(nextSections.map((section, index) => ({ ...section, id: `right-${section.id}-${index}` })));
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = templateModules.find(module => module.id === templateId);
    if (!template) return;
    loadModuleIntoForm(template);
  };

  /** 저장 전 검증 — 실패 사유 문자열, 통과 시 null */
  const validateDraft = (): string | null => {
    if (!name.trim()) return '모듈명을 입력하세요.';
    if (!normalizeSlug(slug || name)) return '식별자를 입력하세요.';
    if (width < 1 || height < 1 || depth < 1) return '폭/높이/깊이는 1mm 이상이어야 합니다.';

    const sides: Array<[string, BuilderSection[]]> = layoutMode === 'dual'
      ? [['좌측', sections], ['우측', rightSections]]
      : [['', sections]];

    for (const [label, sideSections] of sides) {
      const absoluteTotal = sideSections
        .filter(section => section.heightType === 'absolute')
        .reduce((sum, section) => sum + Math.max(section.height, 0), 0);
      if (absoluteTotal > height) {
        return `${label ? `${label} ` : ''}패널의 고정 높이 합(${absoluteTotal}mm)이 전체 높이(${height}mm)를 초과합니다.`;
      }
      const hasPercentage = sideSections.some(section => section.heightType === 'percentage');
      if (!hasPercentage && absoluteTotal !== height) {
        return `${label ? `${label} ` : ''}패널이 모두 고정 높이인데 합(${absoluteTotal}mm)이 전체 높이(${height}mm)와 다릅니다.`;
      }
    }

    // 외부서랍 검증
    if (category === 'lower' && useExternalDrawers) {
      if (extDrawerCount < 1) return '외부서랍 단수는 1 이상이어야 합니다.';
      const maidaHeightList = parseNumberList(extMaidaHeights);
      if (maidaHeightList.length > 0 && maidaHeightList.length !== extDrawerCount) {
        return `마이다 높이 개수(${maidaHeightList.length})가 서랍 단수(${extDrawerCount})와 다릅니다.`;
      }
      if (!notchSidesLinked && extDrawerCount > 1) {
        return '외부서랍은 좌우 동일 따내기 기준으로 구역이 나뉩니다. 따내기를 "좌우 동일 적용"으로 설정하세요.';
      }
      if (notchSidesLinked && leftNotches.length < extDrawerCount - 1) {
        return `서랍 ${extDrawerCount}단에는 구역을 나눌 따내기가 최소 ${extDrawerCount - 1}개 필요합니다 (현재 ${leftNotches.length}개).`;
      }
    }

    // 측판 따내기 검증 — 가구 높이/깊이 안에 있어야 함
    const notchSides: Array<[string, NotchRow[]]> = notchSidesLinked
      ? [['공통', leftNotches]]
      : [['좌측', leftNotches], ['우측', rightNotches]];
    for (const [label, rows] of notchSides) {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (row.height <= 0 || row.depth <= 0) {
          return `${label} 따내기 ${i + 1}: 높이/깊이는 1mm 이상이어야 합니다.`;
        }
        if (row.fromBottom + row.height > height) {
          return `${label} 따내기 ${i + 1}: 상단(${row.fromBottom + row.height}mm)이 가구 높이(${height}mm)를 초과합니다.`;
        }
        if (row.depth >= depth) {
          return `${label} 따내기 ${i + 1}: 깊이(${row.depth}mm)가 가구 깊이(${depth}mm) 이상입니다.`;
        }
      }
    }

    return null;
  };

  const addNotch = (side: 'left' | 'right') => {
    const setter = side === 'right' ? setRightNotches : setLeftNotches;
    setter(current => [...current, createNotchRow(current.length > 0 ? current[current.length - 1].fromBottom + 200 : 300)]);
  };

  const removeNotch = (side: 'left' | 'right', notchId: string) => {
    const setter = side === 'right' ? setRightNotches : setLeftNotches;
    setter(current => current.filter(row => row.id !== notchId));
  };

  const updateNotch = (side: 'left' | 'right', notchId: string, key: 'fromBottom' | 'height' | 'depth', value: number) => {
    const setter = side === 'right' ? setRightNotches : setLeftNotches;
    setter(current => current.map(row => (row.id === notchId ? { ...row, [key]: value } : row)));
  };

  const toggleNotchSidesLinked = (linked: boolean) => {
    setNotchSidesLinked(linked);
    if (!linked && rightNotches.length === 0) {
      // 개별 모드 진입 시 좌측 값을 우측에 복사해 시작
      setRightNotches(leftNotches.map(row => ({ ...row, id: `right-${row.id}` })));
    }
  };

  const reservedTokensInSlug = () => {
    const normalizedSlug = normalizeSlug(slug || name);
    return RESERVED_ID_TOKENS.filter(token => normalizedSlug.includes(token));
  };

  const copyDraft = async () => {
    await navigator.clipboard.writeText(JSON.stringify(moduleDraft, null, 2));
    alert('모듈 초안 JSON이 복사되었습니다.');
  };

  const saveDraft = async () => {
    const validationError = validateDraft();
    if (validationError) {
      alert(validationError);
      return;
    }

    const reservedTokens = reservedTokensInSlug();
    if (reservedTokens.length > 0) {
      const proceed = confirm(
        `식별자에 예약어(${reservedTokens.join(', ')})가 포함되어 있습니다.\n` +
        '표준 모듈의 렌더링/패널목록/CNC 분류 규칙에 오인 매칭될 수 있습니다. 계속 저장할까요?'
      );
      if (!proceed) return;
    }

    setSaving(true);
    try {
      if (moduleDraft.id !== loadedModuleId) {
        const exists = await adminFurnitureModuleExists(moduleDraft.id);
        if (exists && !confirm(`동일 ID(${moduleDraft.id})의 모듈이 이미 있습니다. 덮어쓸까요?`)) {
          return;
        }
      }
      await saveAdminFurnitureModule(moduleDraft);
      setLoadedModuleId(moduleDraft.id);
      alert('관리자 모듈이 저장되었습니다. 가구 목록에 자동 반영됩니다.');
    } catch (error) {
      console.error('[ModuleBuilder] 저장 실패:', error);
      alert('저장에 실패했습니다. 콘솔을 확인하세요.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSavedEnabled = async (moduleId: string, enabled: boolean) => {
    try {
      await setAdminFurnitureModuleEnabled(moduleId, enabled);
    } catch (error) {
      console.error('[ModuleBuilder] 활성화 변경 실패:', error);
      alert('활성화 상태 변경에 실패했습니다.');
    }
  };

  const deleteSaved = async (moduleId: string, moduleName: string) => {
    if (!confirm(`'${moduleName}' (${moduleId}) 모듈을 삭제할까요?\n이미 배치된 프로젝트에서는 해당 가구를 더 이상 불러올 수 없습니다.`)) return;
    try {
      await deleteAdminFurnitureModule(moduleId);
      if (loadedModuleId === moduleId) setLoadedModuleId(null);
    } catch (error) {
      console.error('[ModuleBuilder] 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const thumbnailSpec = THUMBNAIL_SPECS[category][layoutMode];

  const handleThumbnailChange = (file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setOriginalThumbnail(dataUrl);
      try {
        setThumbnail(await resizeThumbnail(dataUrl, thumbnailSpec.width, thumbnailSpec.height));
      } catch (error) {
        console.error('[ModuleBuilder] 섬네일 변환 실패, 원본 사용:', error);
        setThumbnail(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // 분류/구조 변경 시 원본 이미지를 새 표준 규격으로 재변환
  useEffect(() => {
    if (!originalThumbnail) return;
    let cancelled = false;
    resizeThumbnail(originalThumbnail, thumbnailSpec.width, thumbnailSpec.height)
      .then(resized => {
        if (!cancelled) setThumbnail(resized);
      })
      .catch(error => console.error('[ModuleBuilder] 섬네일 재변환 실패:', error));
    return () => {
      cancelled = true;
    };
  }, [originalThumbnail, thumbnailSpec.width, thumbnailSpec.height]);

  const clearThumbnail = () => {
    setThumbnail('');
    setOriginalThumbnail('');
  };

  if (!allowed) {
    return (
      <div className={styles.container}>
        <div className={styles.accessDenied}>
          <h2>접근 권한 없음</h2>
          <p>sbbc212@gmail.com 슈퍼어드민만 모듈 빌더에 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>모듈 빌더</h1>
          <code className={styles.idChip} title="모듈 ID (식별자·폭에서 자동 생성)">{moduleDraft.id}</code>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.copyButton} onClick={copyDraft}>
            <ClipboardCopy size={16} />
            <span>JSON</span>
          </button>
          <button type="button" className={styles.saveButton} onClick={saveDraft} disabled={saving}>
            {saving ? '저장 중…' : (loadedModuleId === moduleDraft.id ? '수정 저장' : '저장')}
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.formColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <Box size={20} />
            <h2>기본 정보</h2>
          </div>

          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.fullField}`}>
              <span>기존 모듈 템플릿</span>
              <select defaultValue="" onChange={(event) => applyTemplate(event.target.value)}>
                <option value="">직접 만들기</option>
                {templateModules.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} / {template.id}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>모듈명</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>식별자</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>분류</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as ModuleCategory)}>
                <option value="full">전체장</option>
                <option value="upper">상부장</option>
                <option value="lower">하부장</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>구조</span>
              <select value={layoutMode} onChange={(event) => setLayoutMode(event.target.value as BuilderLayoutMode)}>
                <option value="single">단일 구조(sections)</option>
                <option value="dual">좌우 분할(left/right)</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>폭(mm)</span>
              <input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} />
            </label>

            <label className={styles.field}>
              <span>높이(mm)</span>
              <input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} />
            </label>

            <label className={styles.field}>
              <span>깊이(mm)</span>
              <input type="number" min={1} value={depth} onChange={(event) => setDepth(Number(event.target.value))} />
            </label>
          </div>

          <label className={styles.checkbox}>
            <input type="checkbox" checked={hasDoor} onChange={(event) => setHasDoor(event.target.checked)} />
            <span>도어 포함</span>
          </label>

          <label className={styles.checkbox}>
            <input type="checkbox" checked={isDynamic} onChange={(event) => setIsDynamic(event.target.checked)} />
            <span>동적 폭 (배치 시 슬롯 폭에 맞춰 자동 조정, 전체장은 높이도 내경에 맞춤)</span>
          </label>

          <details className={styles.collapse}>
            <summary className={styles.collapseSummary}>
              <ImageIcon size={15} />
              <span>섬네일</span>
              <em>{thumbnailSpec.width}×{thumbnailSpec.height}px{thumbnail ? ' · 등록됨' : ''}</em>
            </summary>
            <div className={styles.collapseBody}>
              <div className={styles.thumbnailUploader}>
                <p className={styles.thumbnailHint}>
                  표준 규격 {thumbnailSpec.width}×{thumbnailSpec.height}px (PNG, 투명 배경 권장)
                  — 업로드 시 자동으로 규격에 맞게 변환됩니다.
                </p>
                <label className={styles.thumbnailDrop}>
                  {thumbnail ? (
                    <img src={thumbnail} alt="등록된 섬네일" />
                  ) : (
                    <span>이미지 선택</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleThumbnailChange(event.target.files?.[0])}
                  />
                </label>
                {thumbnail && (
                  <button type="button" className={styles.textButton} onClick={clearThumbnail}>
                    섬네일 제거
                  </button>
                )}
              </div>
            </div>
          </details>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>패널별 세부설정</h2>
            <button type="button" className={styles.iconButton} onClick={() => addSection('main')} title="섹션 추가">
              <Plus size={18} />
            </button>
          </div>

          {layoutMode === 'dual' && (
            <div className={styles.dualOptions}>
              <label className={styles.compactField}>
                <span>우측 고정폭(mm)</span>
                <input type="number" min={0} value={rightAbsoluteWidth} onChange={(event) => setRightAbsoluteWidth(Number(event.target.value))} />
              </label>
              <label className={styles.compactField}>
                <span>우측 고정깊이(mm)</span>
                <input type="number" min={0} value={rightAbsoluteDepth} onChange={(event) => setRightAbsoluteDepth(Number(event.target.value))} />
              </label>
              <label className={styles.checkboxInline}>
                <input type="checkbox" checked={hasSharedMiddlePanel} onChange={(event) => setHasSharedMiddlePanel(event.target.checked)} />
                <span>중단선반 공유</span>
              </label>
              <label className={styles.checkboxInline}>
                <input type="checkbox" checked={hasSharedSafetyShelf} onChange={(event) => setHasSharedSafetyShelf(event.target.checked)} />
                <span>안전선반 공유</span>
              </label>
            </div>
          )}

          {layoutMode === 'dual' && <h3 className={styles.sectionGroupTitle}>좌측 패널</h3>}
          <div className={styles.sectionList}>
            {sections.map((section, index) => (
              <div key={section.id} className={styles.sectionCard}>
                <div className={styles.sectionCardHeader}>
                  <div>
                    <span className={styles.sectionBadge}>패널 {index + 1}</span>
                    <strong>{sectionLabels[section.type]}</strong>
                  </div>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => removeSection('main', section.id)}
                    disabled={sections.length === 1}
                    title="패널 삭제"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className={styles.sectionFields}>
                  <label className={styles.compactField}>
                    <span>구성 타입</span>
                    <select
                      value={section.type}
                      onChange={(event) => updateSection('main', section.id, 'type', event.target.value as SectionType)}
                    >
                      <option value="open">오픈</option>
                      <option value="shelf">선반</option>
                      <option value="hanging">행거</option>
                      <option value="drawer">서랍</option>
                    </select>
                  </label>

                  <label className={styles.compactField}>
                    <span>높이값</span>
                    <input
                      type="number"
                      min={1}
                      value={section.height}
                      onChange={(event) => updateSection('main', section.id, 'height', Number(event.target.value))}
                    />
                  </label>

                  <label className={styles.compactField}>
                    <span>높이 방식</span>
                    <select
                      value={section.heightType}
                      onChange={(event) => updateSection('main', section.id, 'heightType', event.target.value as BuilderSection['heightType'])}
                    >
                      <option value="percentage">비율(%)</option>
                      <option value="absolute">고정(mm)</option>
                    </select>
                  </label>

                  <label className={styles.compactField}>
                    <span>내부 수량</span>
                    <input
                      type="number"
                      min={0}
                      value={section.count}
                      onChange={(event) => updateSection('main', section.id, 'count', Number(event.target.value))}
                    />
                  </label>

                  <label className={styles.compactField}>
                    <span>선반 위치(mm)</span>
                    <input
                      value={section.shelfPositions}
                      onChange={(event) => updateSection('main', section.id, 'shelfPositions', event.target.value)}
                      placeholder="예: 318, 646"
                    />
                  </label>

                  <label className={styles.compactField}>
                    <span>서랍 높이(mm)</span>
                    <input
                      value={section.drawerHeights}
                      onChange={(event) => updateSection('main', section.id, 'drawerHeights', event.target.value)}
                      placeholder="예: 255, 255"
                    />
                  </label>

                  <label className={styles.compactField}>
                    <span>서랍 간격(mm)</span>
                    <input
                      type="number"
                      min={0}
                      value={section.gapHeight}
                      onChange={(event) => updateSection('main', section.id, 'gapHeight', Number(event.target.value))}
                    />
                  </label>

                  <label className={styles.compactField}>
                    <span>고정 상부영역(mm)</span>
                    <input
                      type="number"
                      min={0}
                      value={section.fixedTopZoneMm}
                      onChange={(event) => updateSection('main', section.id, 'fixedTopZoneMm', Number(event.target.value))}
                    />
                  </label>

                  <label className={styles.checkboxInline}>
                    <input
                      type="checkbox"
                      checked={section.hasBackPanel}
                      onChange={(event) => updateSection('main', section.id, 'hasBackPanel', event.target.checked)}
                    />
                    <span>백패널</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {layoutMode === 'dual' && (
            <>
              <div className={styles.sectionGroupHeader}>
                <h3 className={styles.sectionGroupTitle}>우측 패널</h3>
                <button type="button" className={styles.iconButton} onClick={() => addSection('right')} title="우측 패널 추가">
                  <Plus size={18} />
                </button>
              </div>
              <div className={styles.sectionList}>
                {rightSections.map((section, index) => (
                  <div key={section.id} className={styles.sectionCard}>
                    <div className={styles.sectionCardHeader}>
                      <div>
                        <span className={styles.sectionBadge}>우측 {index + 1}</span>
                        <strong>{sectionLabels[section.type]}</strong>
                      </div>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => removeSection('right', section.id)}
                        disabled={rightSections.length === 1}
                        title="패널 삭제"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className={styles.sectionFields}>
                      <label className={styles.compactField}>
                        <span>구성 타입</span>
                        <select value={section.type} onChange={(event) => updateSection('right', section.id, 'type', event.target.value as SectionType)}>
                          <option value="open">오픈</option>
                          <option value="shelf">선반</option>
                          <option value="hanging">행거</option>
                          <option value="drawer">서랍</option>
                        </select>
                      </label>
                      <label className={styles.compactField}>
                        <span>높이값</span>
                        <input type="number" min={1} value={section.height} onChange={(event) => updateSection('right', section.id, 'height', Number(event.target.value))} />
                      </label>
                      <label className={styles.compactField}>
                        <span>높이 방식</span>
                        <select value={section.heightType} onChange={(event) => updateSection('right', section.id, 'heightType', event.target.value as BuilderSection['heightType'])}>
                          <option value="percentage">비율(%)</option>
                          <option value="absolute">고정(mm)</option>
                        </select>
                      </label>
                      <label className={styles.compactField}>
                        <span>내부 수량</span>
                        <input type="number" min={0} value={section.count} onChange={(event) => updateSection('right', section.id, 'count', Number(event.target.value))} />
                      </label>
                      <label className={styles.compactField}>
                        <span>선반 위치(mm)</span>
                        <input value={section.shelfPositions} onChange={(event) => updateSection('right', section.id, 'shelfPositions', event.target.value)} />
                      </label>
                      <label className={styles.compactField}>
                        <span>서랍 높이(mm)</span>
                        <input value={section.drawerHeights} onChange={(event) => updateSection('right', section.id, 'drawerHeights', event.target.value)} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* === 측판 목찬넬 따내기 === */}
          <details className={styles.collapse}>
            <summary className={styles.collapseSummary}>
              <span>측판 목찬넬 따내기</span>
              <em>{leftNotches.length > 0 ? `${notchSidesLinked ? '공통' : '좌/우 개별'} ${leftNotches.length}개` : '없음'}</em>
            </summary>
            <div className={styles.collapseBody}>
            <div className={styles.collapseToolbar}>
              <p className={styles.thumbnailHint}>
                바닥 기준 위치에서 위로 [높이], 측판 앞면에서 뒤로 [깊이]만큼 따냅니다. 표준 목찬넬 65×40.
                좌우 동일 적용 시 목찬넬 ㄱ자 프레임(PET)과 그 뒤 가로전대(PB)가 자동 포함됩니다.
              </p>
              <button type="button" className={styles.iconButton} onClick={() => addNotch('left')} title="따내기 추가">
                <Plus size={16} />
              </button>
            </div>

          {category === 'lower' && (
            <label className={styles.checkboxInline}>
              <input
                type="checkbox"
                checked={lowerHasTopPanel}
                onChange={(event) => setLowerHasTopPanel(event.target.checked)}
              />
              <span>상판 포함 (체크 해제 시 표준 하부장처럼 상단 60 따내기 + 목찬넬 프레임)</span>
            </label>
          )}

          <label className={styles.checkboxInline}>
            <input
              type="checkbox"
              checked={notchSidesLinked}
              onChange={(event) => toggleNotchSidesLinked(event.target.checked)}
            />
            <span>좌우측판 동일 적용</span>
          </label>

          <div className={styles.sectionList}>
            {leftNotches.length === 0 && (
              <p className={styles.thumbnailHint}>추가 따내기 없음 — 우측 상단 + 버튼으로 추가</p>
            )}
            {leftNotches.map((row, index) => (
              <div key={row.id} className={styles.sectionCard}>
                <div className={styles.sectionCardHeader}>
                  <div>
                    <span className={styles.sectionBadge}>{notchSidesLinked ? '공통' : '좌측'} 따내기 {index + 1}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => removeNotch('left', row.id)}
                    title="따내기 삭제"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className={styles.sectionFields}>
                  <label className={styles.compactField}>
                    <span>바닥에서 위치(mm)</span>
                    <input type="number" min={0} value={row.fromBottom} onChange={(event) => updateNotch('left', row.id, 'fromBottom', Number(event.target.value))} />
                  </label>
                  <label className={styles.compactField}>
                    <span>따내기 높이(mm)</span>
                    <input type="number" min={1} value={row.height} onChange={(event) => updateNotch('left', row.id, 'height', Number(event.target.value))} />
                  </label>
                  <label className={styles.compactField}>
                    <span>따내기 깊이(mm)</span>
                    <input type="number" min={1} value={row.depth} onChange={(event) => updateNotch('left', row.id, 'depth', Number(event.target.value))} />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {!notchSidesLinked && (
            <>
              <div className={styles.sectionGroupHeader}>
                <h3 className={styles.sectionGroupTitle}>우측판 따내기</h3>
                <button type="button" className={styles.iconButton} onClick={() => addNotch('right')} title="우측 따내기 추가">
                  <Plus size={18} />
                </button>
              </div>
              <div className={styles.sectionList}>
                {rightNotches.length === 0 && (
                  <p className={styles.thumbnailHint}>우측판 따내기 없음</p>
                )}
                {rightNotches.map((row, index) => (
                  <div key={row.id} className={styles.sectionCard}>
                    <div className={styles.sectionCardHeader}>
                      <div>
                        <span className={styles.sectionBadge}>우측 따내기 {index + 1}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => removeNotch('right', row.id)}
                        title="따내기 삭제"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className={styles.sectionFields}>
                      <label className={styles.compactField}>
                        <span>바닥에서 위치(mm)</span>
                        <input type="number" min={0} value={row.fromBottom} onChange={(event) => updateNotch('right', row.id, 'fromBottom', Number(event.target.value))} />
                      </label>
                      <label className={styles.compactField}>
                        <span>따내기 높이(mm)</span>
                        <input type="number" min={1} value={row.height} onChange={(event) => updateNotch('right', row.id, 'height', Number(event.target.value))} />
                      </label>
                      <label className={styles.compactField}>
                        <span>따내기 깊이(mm)</span>
                        <input type="number" min={1} value={row.depth} onChange={(event) => updateNotch('right', row.id, 'depth', Number(event.target.value))} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
            </div>
          </details>

          {/* === 하부장 외부서랍 (레그라박스) === */}
          {category === 'lower' && (
            <details className={styles.collapse}>
              <summary className={styles.collapseSummary}>
                <span>외부서랍 (레그라박스)</span>
                <em>{useExternalDrawers ? `${extDrawerCount}단 사용` : '미사용'}</em>
              </summary>
              <div className={styles.collapseBody}>
              <label className={styles.checkboxInline}>
                <input
                  type="checkbox"
                  checked={useExternalDrawers}
                  onChange={(event) => setUseExternalDrawers(event.target.checked)}
                />
                <span>외부서랍 사용 — 서랍 구역은 위 측판 따내기(공통) 위치로 나뉩니다</span>
              </label>

              {useExternalDrawers && (
                <div className={styles.sectionCard}>
                  <div className={styles.sectionFields}>
                    <label className={styles.compactField}>
                      <span>서랍 단수</span>
                      <input type="number" min={1} max={5} value={extDrawerCount} onChange={(event) => setExtDrawerCount(Number(event.target.value))} />
                    </label>
                    <label className={styles.compactField}>
                      <span>마이다 높이(mm)</span>
                      <input
                        value={extMaidaHeights}
                        onChange={(event) => setExtMaidaHeights(event.target.value)}
                        placeholder="예: 228, 228 (비우면 자동)"
                      />
                    </label>
                    <label className={styles.compactField}>
                      <span>측판 높이-전체(mm)</span>
                      <input type="number" min={0} value={extSideAll} onChange={(event) => setExtSideAll(Number(event.target.value))} placeholder="0 = 자동" />
                    </label>
                    <label className={styles.compactField}>
                      <span>측판 높이-1단(mm)</span>
                      <input type="number" min={0} value={extSideFirst} onChange={(event) => setExtSideFirst(Number(event.target.value))} />
                    </label>
                    <label className={styles.compactField}>
                      <span>측판 높이-나머지(mm)</span>
                      <input type="number" min={0} value={extSideRest} onChange={(event) => setExtSideRest(Number(event.target.value))} />
                    </label>
                    <label className={styles.compactField}>
                      <span>마이다 상단 갭(mm)</span>
                      <input type="number" value={extTopGap} onChange={(event) => setExtTopGap(Number(event.target.value))} />
                    </label>
                    <label className={styles.compactField}>
                      <span>마이다 하단 갭(mm)</span>
                      <input type="number" value={extBottomGap} onChange={(event) => setExtBottomGap(Number(event.target.value))} />
                    </label>
                  </div>
                  <p className={styles.thumbnailHint}>
                    표준 레그라박스 예시 — 2단: 따내기 1개 + 마이다 228,228 / 측판 180(높이 673 초과 시 240).
                    측판 높이 0은 표준 자동값. 마이다를 비우면 따내기 위치 기반으로 자동 계산됩니다.
                  </p>
                </div>
              )}
              </div>
            </details>
          )}
        </section>

        <section className={`${styles.panel} ${styles.managementPanel}`}>
          <div className={styles.panelHeader}>
            <h2>저장된 모듈 ({savedDocs.length})</h2>
          </div>

          {savedDocs.length === 0 ? (
            <p className={styles.panelHint}>저장된 관리자 모듈이 없습니다.</p>
          ) : (
            <div className={styles.savedList}>
              {savedDocs.map(({ module, enabled, updatedAt }) => (
                <div key={module.id} className={`${styles.savedItem} ${loadedModuleId === module.id ? styles.savedItemActive : ''}`}>
                  <div className={styles.savedThumb}>
                    {module.thumbnail
                      ? <img src={module.thumbnail} alt={module.name} />
                      : <Box size={22} />}
                  </div>
                  <div className={styles.savedInfo}>
                    <strong>{module.name}</strong>
                    <span className={styles.savedId}>{module.id}</span>
                    <span className={styles.savedMeta}>
                      {module.dimensions.width}W x {module.dimensions.height}H x {module.dimensions.depth}D
                      {module.isDynamic ? ' · 동적 폭' : ''}
                      {updatedAt ? ` · ${updatedAt.toLocaleDateString('ko-KR')}` : ''}
                    </span>
                  </div>
                  <div className={styles.savedActions}>
                    <label className={styles.checkboxInline} title="가구 목록 노출">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => toggleSavedEnabled(module.id, event.target.checked)}
                      />
                      <span>노출</span>
                    </label>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => loadModuleIntoForm(module, { asSaved: true })}
                      title="불러와서 수정"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => deleteSaved(module.id, module.name)}
                      title="모듈 삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>

        <section className={styles.previewPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>실시간 미리보기</h2>
              <p className={styles.panelHint}>실제 뷰어 렌더러로 표시됩니다 — 배치 결과와 동일</p>
            </div>
          </div>

          <div className={styles.livePreviewArea}>
            <div className={styles.threePreviewFrame}>
              <AdminModulePreview
                moduleData={moduleDraft as ModuleData}
                highlightedPanelName={highlightedPanelName}
              />
              <div className={styles.previewMeta}>
                <strong>{moduleDraft.name}</strong>
                <span>W {width} · H {height} · D {depth}{isDynamic ? ' · 동적 폭' : ''}</span>
              </div>
            </div>

            {/* 패널목록 — 행 클릭: 뷰어 강조 / 체크박스 해제: 뷰어에서 숨김 */}
            <div className={styles.panelListArea}>
              <div className={styles.panelListHeader}>
                <h3>패널 목록 ({panelRowCount})</h3>
                <div className={styles.panelListActions}>
                  {highlightedPanelName && (
                    <button type="button" className={styles.textButton} onClick={() => setHighlightedPanelName(null)}>
                      강조 해제
                    </button>
                  )}
                  {hiddenPanelNames.size > 0 && (
                    <button type="button" className={styles.textButton} onClick={() => setHiddenPanelNames(new Set())}>
                      모두 표시 ({hiddenPanelNames.size})
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.panelListScroll}>
                {panelList.map((panel, index) => {
                  const name = panel.name || '';
                  if (!name) return null;
                  if (name.startsWith('===')) {
                    return (
                      <div key={`group-${index}`} className={styles.panelGroupLabel}>
                        {name.replace(/=/g, '').trim()}
                      </div>
                    );
                  }
                  const secondDim = panel.height ?? panel.depth;
                  const isHidden = hiddenPanelNames.has(name);
                  const isActive = highlightedPanelName === name;
                  return (
                    <div
                      key={`panel-${index}-${name}`}
                      className={`${styles.panelRow} ${isActive ? styles.panelRowActive : ''} ${isHidden ? styles.panelRowHidden : ''}`}
                      onClick={() => setHighlightedPanelName(isActive ? null : name)}
                    >
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => togglePanelHidden(name)}
                        title={isHidden ? '패널을 모듈에 다시 포함' : '체크 해제 = 모듈에서 기본 제거 (배치 시 빠진 상태로 저장, CNC 제외)'}
                      />
                      <span className={styles.panelRowName}>{name}</span>
                      <span className={styles.panelDims}>
                        {panel.width ?? '-'}×{secondDim ?? '-'}
                        {panel.thickness ? ` · ${panel.thickness}T` : ''}
                        {panel.material ? ` · ${panel.material}` : ''}
                        {panel.quantity && panel.quantity > 1 ? ` · ${panel.quantity}EA` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ModuleBuilder;
