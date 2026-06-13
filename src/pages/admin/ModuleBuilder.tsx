import { Fragment, useEffect, useMemo, useState } from 'react';
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
  resolveLowerCabinetStandardDrawerNotches,
  type LowerCabinetDrawerFamily
} from '@/editor/shared/utils/lowerCabinetMaidaGeometry';
import { useUIStore } from '@/store/uiStore';
import {
  getExcludedPanelAliases,
  useExcludedPanelsStore
} from '@/editor/shared/viewer3d/context/ExcludedPanelsContext';
import {
  ArrowLeft,
  Box,
  ClipboardCopy,
  Copy,
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react';
import { FURNITURE_ICONS, isShoeModuleId } from '@/editor/shared/controls/furniture/ModuleGallery';
import AdminModulePreview, { ADMIN_PREVIEW_FURNITURE_ID } from './AdminModulePreview';
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

const notchRowsToConfig = (rows: NotchRow[], bodyHeightMm: number, bodyDepthMm: number) => (
  rows
    .filter(row => row.height > 0 && row.depth > 0 && row.fromBottom >= 0)
    .map(row => {
      // 목찬넬/따내기는 몸통 외곽을 벗어날 수 없음 — 높이/깊이/위치를 몸통 치수로 클램프
      const y = Math.min(row.height, bodyHeightMm);
      const z = Math.min(row.depth, bodyDepthMm);
      const fromBottom = Math.min(Math.max(0, row.fromBottom), Math.max(0, bodyHeightMm - y));
      return { y, z, fromBottom };
    })
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
  id: `section-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
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

/** 키큰장 기본 구조 — 빈 깡통: 하부/상부 빈 칸(오픈) 각 1개, 높이는 비율 반반 (고정값 없음) */
const createDefaultFullSections = (): BuilderSection[] => [
  { ...createSection(0), type: 'open', height: 100, heightType: 'percentage', count: 0 },
  { ...createSection(1), type: 'open', height: 100, heightType: 'percentage', count: 0 }
];

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

/** 분류별 갤러리 노출 카테고리(탭) 옵션 — 첫 항목이 기본값 */
const GALLERY_CATEGORY_OPTIONS: Record<ModuleCategory, Array<{ value: string; label: string }>> = {
  full: [
    { value: 'clothing', label: '의류장 (키큰장)' },
    { value: 'kitchen-tall', label: '주방 키큰장' },
    { value: 'shoes', label: '선반장' }
  ],
  upper: [
    { value: 'upper', label: '상부장' }
  ],
  lower: [
    { value: 'kitchen-basic', label: '주방 기본장' },
    { value: 'kitchen-door-raise', label: '도어올림' },
    { value: 'kitchen-top-down', label: '상판내림' }
  ]
};

const defaultGalleryCategory = (category: ModuleCategory) => GALLERY_CATEGORY_OPTIONS[category][0].value;

const lowerDrawerFamilyForGalleryCategory = (galleryCategory: string): LowerCabinetDrawerFamily => {
  if (galleryCategory === 'kitchen-door-raise') return 'doorLift';
  if (galleryCategory === 'kitchen-top-down') return 'topDown';
  return 'basic';
};

/** 분류별 표준 치수 — 표준 모듈 생성 코드와 동일 (상부장 785/D300, 하부장 캐비넷 780/D600, 키큰장 2400/D600) */
const CATEGORY_DEFAULT_DIMENSIONS: Record<ModuleCategory, { height: number; depth: number }> = {
  full: { height: 2400, depth: 600 },
  upper: { height: 785, depth: 300 },
  lower: { height: 780, depth: 600 }
};

/** 갤러리 탭 라벨 — 모듈관리 필터/태그 공용 */
const GALLERY_CATEGORY_LABELS: Record<string, string> = {
  clothing: '의류장',
  shoes: '선반장',
  'kitchen-tall': '주방 키큰장',
  upper: '상부장',
  'kitchen-basic': '기본장',
  'kitchen-door-raise': '도어올림',
  'kitchen-top-down': '상판내림'
};

/** 표준 모듈의 갤러리 탭 판별 — ModuleGallery 탭 필터와 동일 규칙 */
const standardGalleryCategoryOf = (module: ModuleData): string => {
  if (module.category === 'upper') return 'upper';
  if (module.category === 'lower') {
    if (module.id.includes('door-lift') || module.id.includes('door-raise')) return 'kitchen-door-raise';
    if (module.id.includes('top-down')) return 'kitchen-top-down';
    return 'kitchen-basic';
  }
  if (
    module.id.includes('pull-out-cabinet') || module.id.includes('pantry-cabinet')
    || module.id.includes('fridge-cabinet') || module.id.includes('built-in-fridge')
    || module.id.includes('insert-frame') || module.id.includes('glass-cabinet')
  ) return 'kitchen-tall';
  if (isShoeModuleId(module.id)) return 'shoes';
  return 'clothing';
};

interface CatalogItem {
  module: ModuleData & { thumbnail?: string };
  source: 'standard' | 'admin';
  enabled?: boolean;
  updatedAt?: number;
  galleryCat: string;
  thumbnail?: string;
}

const sectionLabels: Record<SectionType, string> = {
  open: '오픈',
  shelf: '선반',
  hanging: '행거',
  drawer: '서랍'
};

const parseNumberList = (value: string) => (
  value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0) // 빈 토큰 제외 — ''가 0으로 파싱돼 유령 패널(칸막이/선반 0mm)을 만들던 버그
    .map(item => Number(item))
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

/**
 * 비율(%) 칸 정규화 — 합계가 100이 되도록 비율 분배.
 * 3D 렌더러(calculateSectionHeight)는 %를 '남은 높이의 리터럴 %'로 해석하므로
 * 사용자가 비율값(100,100 등)으로 입력해도 저장 시 50/50처럼 정규화해야 렌더가 일치한다.
 */
const normalizePercentSections = (configs: SectionConfig[]): SectionConfig[] => {
  const pctTotal = configs
    .filter(config => (config.heightType || 'percentage') === 'percentage')
    .reduce((sum, config) => sum + Math.max(config.height || 0, 0), 0);
  if (pctTotal <= 0 || Math.abs(pctTotal - 100) < 0.01) return configs;
  return configs.map(config => (
    (config.heightType || 'percentage') === 'percentage'
      ? { ...config, height: Math.round((Math.max(config.height || 0, 0) / pctTotal) * 1000) / 10 }
      : config
  ));
};

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
  // 베이스 모델(템플릿) 선택 상태 — '직접 만들기'('') 선택 시 폼 초기화와 함께 표시도 비움
  const [templateSelection, setTemplateSelection] = useState('');
  const [category, setCategory] = useState<ModuleCategory>('full');
  // 갤러리 노출 카테고리(탭) — 분류 변경 시 해당 분류 기본 탭으로 재설정
  const [galleryCategory, setGalleryCategory] = useState<string>(defaultGalleryCategory('full'));
  const [layoutMode, setLayoutMode] = useState<BuilderLayoutMode>('single');
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(2400);
  const [depth, setDepth] = useState(600);
  const [hasDoor, setHasDoor] = useState(false);
  const [isDynamic, setIsDynamic] = useState(true);
  const [thumbnail, setThumbnail] = useState('');
  // 업로드 원본 보관 — 분류/구조 변경 시 표준 규격으로 재변환
  const [originalThumbnail, setOriginalThumbnail] = useState('');
  // 키큰장은 하부/상부 섹션 분리 구조로 시작 (빈 깡통)
  const [sections, setSections] = useState<BuilderSection[]>(createDefaultFullSections());
  // 키큰장 하부/상부 경계 — sections 앞에서 몇 개가 하부인지 (3D 메시·패널목록 그룹과 공유)
  const [lowerSectionCount, setLowerSectionCount] = useState(1);
  const [rightSections, setRightSections] = useState<BuilderSection[]>([createSection(0)]);
  const [rightAbsoluteWidth, setRightAbsoluteWidth] = useState(0);
  const [rightAbsoluteDepth, setRightAbsoluteDepth] = useState(0);
  const [hasSharedMiddlePanel, setHasSharedMiddlePanel] = useState(false);
  const [hasSharedSafetyShelf, setHasSharedSafetyShelf] = useState(false);

  // 측판 목찬넬 따내기 — 좌우 동일(공통, 가로전대 자동) 또는 좌/우 개별
  const [notchSidesLinked, setNotchSidesLinked] = useState(true);
  const [leftNotches, setLeftNotches] = useState<NotchRow[]>([]);
  const [rightNotches, setRightNotches] = useState<NotchRow[]>([]);
  // 상판 포함 여부 — 사용자가 직접 결정
  // 끄면(상판 없음): 표준 반통 구조 — 측판 상단 60×40 따내기 + 가로전대 (하부장은 목찬넬 PET 프레임 포함)
  const [hasTopPanel, setHasTopPanel] = useState(true);

  // 상단 모서리 따내기 (키큰장/상부장 + 상판 있음일 때) — 기본 OFF, 사용자가 체크할 때만 생성
  const [topNotchEnabled, setTopNotchEnabled] = useState(false);
  const [topNotchHeight, setTopNotchHeight] = useState(60);
  const [topNotchDepth, setTopNotchDepth] = useState(40);

  // 하부장 외부서랍 — 일반(마이다+레일) 또는 레그라박스(터치)
  const [useExternalDrawers, setUseExternalDrawers] = useState(false);
  const [extDrawerType, setExtDrawerType] = useState<'external' | 'legrabox'>('external');
  // 레그라박스 서랍별 [종류, 바닥판 위 이격] (아래→위) — M 117 / L 164 / F 228
  const [legraRows, setLegraRows] = useState<Array<{ id: string; type: 'M' | 'L' | 'F' | 'N'; offsetMm: number }>>([
    { id: 'legra-0', type: 'F', offsetMm: 28 },
    { id: 'legra-1', type: 'F', offsetMm: 406 }
  ]);
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

  // 모듈관리 뷰 — 목록(기본) / 상세(빌더)
  const [view, setView] = useState<'list' | 'builder'>('list');
  // 표준 모듈 상세 = 열람 전용 (수정 불가 — 파생 제작은 명시적 버튼으로)
  const [readOnlyDetail, setReadOnlyDetail] = useState(false);

  // 미리보기 뷰 — 3D(다크 스테이지) / 입면(front) / 평면(top) / 측면(left, 좌측면)
  const [previewView, setPreviewView] = useState<'3D' | 'front' | 'top' | 'left'>('3D');
  const previewViewMode: '2D' | '3D' = previewView === '3D' ? '3D' : '2D';
  useEffect(() => {
    if (view !== 'builder' || previewView === '3D') return;
    const ui = useUIStore.getState();
    const prevDirection = ui.view2DDirection;
    const prevTheme = ui.view2DTheme;
    ui.setView2DDirection?.(previewView);
    ui.setView2DTheme?.('dark'); // 2D = CAD 다크모드
    return () => {
      ui.setView2DDirection?.(prevDirection);
      ui.setView2DTheme?.(prevTheme);
    };
  }, [previewView, view]);

  // 수직 칸막이 — 좌측판 안쪽면 기준 X(mm), 쉼표 구분 (선반 위치와 동일한 입력 방식)
  const [dividersText, setDividersText] = useState('');
  // 상단 목찬넬 따내기 — 기본 OFF, 사용자가 켰을 때만 측판 60×40 따내기 + 가로전대(+하부장 PET 프레임)
  const [topChannelEnabled, setTopChannelEnabled] = useState(false);
  // 판재 두께 — 18(표준 PB) / 18.5(PET 래핑 등). 가로판 갭(18=1mm, 18.5=0)·패널목록 두께에 반영
  const [panelThickness, setPanelThickness] = useState<18 | 18.5>(18);
  // 상판 앞 옵셋(mm) — 상판 깊이를 앞에서 후퇴
  const [topPanelOffset, setTopPanelOffset] = useState(0);
  // 레그라박스 마이다 상/하단 갭 — 목찬넬 동반 표준 -20/5 (마이다 상단 = H−20, 목찬넬 아래)
  const [legraTopGap, setLegraTopGap] = useState(-20);
  const [legraBottomGap, setLegraBottomGap] = useState(5);
  // 마이다 사이갭 — 일반 외부서랍 표준 20(따내기65−40−5), 레그라 표준 3
  const [extMaidaGap, setExtMaidaGap] = useState(20);
  const [legraMaidaGap, setLegraMaidaGap] = useState(20); // 따내기 경계 표준: 윗선−25/−5 = 사이갭 20
  // 패널 스캔 — 뷰어에서 패널 클릭 시 에디터 스캔모드와 동일한 치수 표시
  const [scanMode, setScanMode] = useState(false);
  // 신규 모듈 추가 — 분류를 먼저 고르기 전엔 폼/프리뷰를 띄우지 않음 (임의 기본 분류 금지)
  const [categoryPicked, setCategoryPicked] = useState(true);

  // 미리보기 도어 열림/닫힘 — 전역 doorsOpen을 빌더 화면 동안만 제어, 떠날 때 복원
  const [previewDoorsOpen, setPreviewDoorsOpen] = useState(false);
  useEffect(() => {
    if (view !== 'builder') return;
    useUIStore.getState().setDoorsOpen(previewDoorsOpen ? true : null);
    return () => {
      useUIStore.getState().setDoorsOpen(null);
    };
  }, [previewDoorsOpen, view]);

  // 빌더 화면 동안 에디터용 치수 표시(도어 폭 치수 등) 끄기 — 프리뷰는 자체 W/H/D 가이드 사용
  useEffect(() => {
    if (view !== 'builder') return;
    const ui = useUIStore.getState();
    const prevShowDimensions = ui.showDimensions;
    const prevShowDimensionsText = ui.showDimensionsText;
    ui.setShowDimensions(false);
    ui.setShowDimensionsText(false);
    return () => {
      ui.setShowDimensions(prevShowDimensions);
      ui.setShowDimensionsText(prevShowDimensionsText);
    };
  }, [view]);
  const [listMode, setListMode] = useState<'gallery' | 'list'>('gallery');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'standard' | 'admin'>('all');
  // 전시/작업 분리 — 전시: 표준 + 게시된 관리자 모듈, 작업: 비공개(초안) 관리자 모듈
  const [statusTab, setStatusTab] = useState<'published' | 'draft'>('published');
  const [searchQuery, setSearchQuery] = useState('');
  // 대량 모듈 대비 — 한 번에 60개씩 렌더, '더 보기'로 확장
  const [visibleCount, setVisibleCount] = useState(60);
  useEffect(() => {
    setVisibleCount(60);
  }, [statusTab, categoryFilter, sourceFilter, searchQuery]);

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

  // 모듈관리 카탈로그 — 관리자 모듈 + 표준 모듈 전체
  const catalogItems = useMemo<CatalogItem[]>(() => {
    const adminItems: CatalogItem[] = savedDocs.map(doc => ({
      module: doc.module,
      source: 'admin',
      enabled: doc.enabled,
      updatedAt: doc.updatedAt ? doc.updatedAt.getTime() : 0,
      galleryCat: (doc.module as ModuleData & { galleryCategory?: string }).galleryCategory
        || defaultGalleryCategory(doc.module.category as ModuleCategory),
      thumbnail: doc.module.thumbnail
    }));
    // 최근 수정 모듈이 맨 앞 — 수천 개여도 방금 작업한 게 항상 첫 화면
    adminItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const standardItems: CatalogItem[] = templateModules.map(module => ({
      module,
      source: 'standard',
      galleryCat: standardGalleryCategoryOf(module),
      thumbnail: FURNITURE_ICONS[module.id.replace(/-[\d.]+$/, '')]
    }));
    return [...adminItems, ...standardItems];
  }, [savedDocs, templateModules]);

  const filteredCatalog = useMemo(() => (
    catalogItems.filter(item => {
      if (categoryFilter !== 'all' && item.galleryCat !== categoryFilter) return false;
      if (statusTab === 'published') {
        if (item.source === 'admin' && item.enabled === false) return false;
      } else {
        if (!(item.source === 'admin' && item.enabled === false)) return false;
      }
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      const query = searchQuery.trim().toLowerCase();
      if (query && !item.module.name.toLowerCase().includes(query) && !item.module.id.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    })
  ), [catalogItems, categoryFilter, searchQuery, sourceFilter, statusTab]);

  const visibleCatalog = useMemo(
    () => filteredCatalog.slice(0, visibleCount),
    [filteredCatalog, visibleCount]
  );

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
    const commonNotchConfig = notchRowsToConfig(leftNotches, height, depth);
    const rightNotchConfig = notchRowsToConfig(rightNotches, height, depth);
    const notchModelConfig = notchSidesLinked
      ? (commonNotchConfig.length > 0 ? { sideNotches: commonNotchConfig } : {})
      : {
          ...(commonNotchConfig.length > 0 ? { leftSideNotches: commonNotchConfig } : {}),
          ...(rightNotchConfig.length > 0 ? { rightSideNotches: rightNotchConfig } : {})
        };

    const baseModelConfig = {
      basicThickness: panelThickness,
      hasOpenFront: !hasDoor,
      hasShelf: sections.some(section => section.type === 'shelf') || rightSections.some(section => section.type === 'shelf'),
      shelfCount: sections.filter(section => section.type === 'shelf').length,
      // 상판 유무 — 사용자가 직접 결정 (undefined = 카테고리 표준: 하부장 없음 / 키큰장·상부장 있음)
      ...(category === 'lower' && hasTopPanel ? { hideTopPanel: false } : {}),
      ...(category !== 'lower' && !hasTopPanel ? { hideTopPanel: true } : {}),
      // 상단 모서리 따내기 (키큰장/상부장, 상판 있을 때만 — 상판 없음은 자체 따내기 포함)
      ...(category !== 'lower' && hasTopPanel && topNotchEnabled && topNotchHeight > 0 && topNotchDepth > 0
        ? { topNotch: { y: Math.min(topNotchHeight, height), z: Math.min(topNotchDepth, depth) } }
        : {}),
      // 키큰장 하부/상부 경계 — 3D (하)/(상) 메시 이름과 패널목록 그룹이 공유
      ...(category === 'full' ? { lowerSectionCount: Math.max(0, Math.min(lowerSectionCount, sections.length)) } : {}),
      // 패널목록에서 체크 해제한 패널 = 모듈에서 기본 제거 (배치 시 빠진 상태, CNC 제외)
      ...(hiddenPanelNames.size > 0 ? { panelExclusions: Array.from(hiddenPanelNames) } : {}),
      // 수직 칸막이 — 좌우 분할 (섹션 모델은 상하 분할만 가능), 내경 범위로 클램프
      ...((() => {
        const maxX = Math.max(1, width - panelThickness * 2 - panelThickness); // 내경폭 − 칸막이 두께
        const dividerList = parseNumberList(dividersText).map(x => Math.min(Math.max(1, x), maxX));
        return dividerList.length > 0 ? { verticalDividers: dividerList } : {};
      })()),
      // 상단 목찬넬 따내기 — 상판 없음 + 사용자가 켰을 때만
      ...(!hasTopPanel && topChannelEnabled ? { topChannelNotch: true } : {}),
      // 상판 앞 옵셋 — 상판 있을 때만
      ...(hasTopPanel && topPanelOffset > 0 ? { topPanelFrontOffsetMm: Math.min(topPanelOffset, depth) } : {}),
      ...notchModelConfig,
      // 하부장: 외부서랍 (일반 / 레그라박스)
      // 목찬넬(손잡이) 동반 시 마이다 상단은 목찬넬 아래(H−20)를 못 넘음 — 상단갭 상한 -20
      ...(category === 'lower' && useExternalDrawers ? {
        externalDrawers: extDrawerType === 'legrabox'
          ? {
              count: legraRows.length,
              drawerType: 'legrabox' as const,
              // 이격 클램프 — 서랍(측판 높이 포함)이 몸통 내경을 벗어날 수 없음
              legraSpecs: (() => {
                const LEGRA_SIDE_H: Record<'M' | 'L' | 'F' | 'N', number> = { N: 66.5, M: 128.5, L: 177, F: 241 };
                const legraInnerH = Math.max(1, height - panelThickness * 2);
                return legraRows.map(row => ({
                  type: row.type,
                  offsetMm: Math.min(
                    Math.max(0, row.offsetMm),
                    Math.max(0, legraInnerH - LEGRA_SIDE_H[row.type])
                  )
                }));
              })(),
              topGap: !hasTopPanel && topChannelEnabled ? Math.min(legraTopGap, -20) : legraTopGap,
              bottomGap: legraBottomGap,
              maidaGapMm: legraMaidaGap
            }
          : {
              count: Math.max(1, extDrawerCount),
              drawerType: 'external' as const,
              ...(parseNumberList(extMaidaHeights).length > 0 ? { maidaHeights: parseNumberList(extMaidaHeights) } : {}),
              ...((extSideAll > 0 || extSideFirst > 0 || extSideRest > 0) ? {
                sideHeights: {
                  ...(extSideAll > 0 ? { all: extSideAll } : {}),
                  ...(extSideFirst > 0 ? { first: extSideFirst } : {}),
                  ...(extSideRest > 0 ? { rest: extSideRest } : {})
                }
              } : {}),
              topGap: !hasTopPanel && topChannelEnabled ? Math.min(extTopGap, -20) : extTopGap,
              bottomGap: extBottomGap,
              maidaGapMm: extMaidaGap
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
      color: '#FFFFFF',
      thumbnail: thumbnail || undefined,
      hasDoor,
      type: 'box' as const,
      galleryCategory,
      isDynamic,
      ...(isDynamic ? { widthOptions: [width] } : {}),
      defaultDepth: depth,
      ...(layoutMode === 'dual' ? { slotWidths: [Math.round(width / 2), Math.round(width / 2)] } : {}),
      modelConfig: layoutMode === 'dual'
        ? {
            ...baseModelConfig,
            leftSections: normalizePercentSections(sections.map(builderSectionToConfig)),
            rightSections: normalizePercentSections(rightSections.map(builderSectionToConfig)),
            ...(rightAbsoluteWidth > 0 ? { rightAbsoluteWidth } : {}),
            ...(rightAbsoluteDepth > 0 ? { rightAbsoluteDepth } : {}),
            hasSharedMiddlePanel,
            hasSharedSafetyShelf
          }
        : {
            ...baseModelConfig,
            sections: normalizePercentSections(sections.map(builderSectionToConfig))
          }
    };
  }, [category, depth, extBottomGap, extDrawerCount, extDrawerType, extMaidaGap, extMaidaHeights, extSideAll, extSideFirst, extSideRest, extTopGap, galleryCategory, hasDoor, hasSharedMiddlePanel, hasSharedSafetyShelf, hasTopPanel, height, hiddenPanelNames, isDynamic, layoutMode, leftNotches, legraRows, lowerSectionCount, name, notchSidesLinked, rightAbsoluteDepth, rightAbsoluteWidth, rightNotches, rightSections, sections, slug, thumbnail, dividersText, legraBottomGap, legraMaidaGap, legraTopGap, panelThickness, topChannelEnabled, topNotchDepth, topPanelOffset, topNotchEnabled, topNotchHeight, useExternalDrawers, width]);

  // 실시간 패널목록 — 실배치/CNC와 동일한 calculatePanelDetails 사용
  const panelList = useMemo(() => {
    const translateGroupLabel = (key: string) => (
      key === 'furniture.upperSection' ? '상부장'
        : key === 'furniture.lowerSection' ? '하부장'
          : key === 'furniture.door' ? '도어'
            : key
    );
    try {
      return calculatePanelDetails(moduleDraft as ModuleData, width, depth, hasDoor, translateGroupLabel) as Array<{
        name?: string;
        width?: number;
        height?: number;
        depth?: number;
        thickness?: number;
        material?: string;
        quantity?: number;
        sideNotches?: Array<{ y: number; z: number; fromBottom: number }>;
        groovePositions?: Array<{ y: number; height: number; depth: number }>;
        boringPositions?: number[];
        hingeCount?: number;
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

  // 하부/상부 섹션 실측 높이 (mm) — 고정(mm)은 그대로, 비율(%)은 남은 높이를 비율 분배
  const sectionHeightsMm = useMemo(() => {
    const absTotal = sections.filter(s => s.heightType === 'absolute').reduce((sum, s) => sum + Math.max(s.height, 0), 0);
    const pctTotal = sections.filter(s => s.heightType === 'percentage').reduce((sum, s) => sum + Math.max(s.height, 0), 0);
    const remaining = Math.max(height - absTotal, 0);
    return sections.map(s => (
      s.heightType === 'absolute' ? Math.max(s.height, 0) : (pctTotal > 0 ? remaining * (Math.max(s.height, 0) / pctTotal) : 0)
    ));
  }, [sections, height]);

  const lowerZoneHeightMm = Math.round(sectionHeightsMm.slice(0, lowerSectionCount).reduce((sum, h) => sum + h, 0));
  const upperZoneHeightMm = Math.round(sectionHeightsMm.slice(lowerSectionCount).reduce((sum, h) => sum + h, 0));

  // 우측(듀얼) 칸 실측 높이
  const rightSectionHeightsMm = useMemo(() => {
    const absTotal = rightSections.filter(s => s.heightType === 'absolute').reduce((sum, s) => sum + Math.max(s.height, 0), 0);
    const pctTotal = rightSections.filter(s => s.heightType === 'percentage').reduce((sum, s) => sum + Math.max(s.height, 0), 0);
    const remaining = Math.max(height - absTotal, 0);
    return rightSections.map(s => (
      s.heightType === 'absolute' ? Math.max(s.height, 0) : (pctTotal > 0 ? remaining * (Math.max(s.height, 0) / pctTotal) : 0)
    ));
  }, [rightSections, height]);

  /** 기본정보에서 하부 섹션 높이 직접 입력 — 하부가 단일 칸일 때 그 칸을 고정(mm)으로 설정 */
  const setLowerZoneHeight = (valueMm: number) => {
    if (lowerSectionCount !== 1 || sections.length === 0) return;
    const lowerId = sections[0].id;
    setSections(current => current.map(section => (
      section.id === lowerId
        ? { ...section, heightType: 'absolute' as const, height: Math.max(1, valueMm) }
        : section
    )));
  };

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

  /** 키큰장 영역별 칸 추가 — 하부에 추가하면 경계도 함께 이동 */
  const addZoneSection = (zone: 'lower' | 'upper') => {
    setSections(current => {
      const next = [...current];
      const newSection = createSection(next.length);
      if (zone === 'lower') {
        next.splice(Math.min(lowerSectionCount, next.length), 0, newSection);
      } else {
        next.push(newSection);
      }
      return next;
    });
    if (zone === 'lower') {
      setLowerSectionCount(count => count + 1);
    }
  };

  const removeMainSection = (sectionId: string) => {
    const index = sections.findIndex(section => section.id === sectionId);
    if (index < 0 || sections.length <= 1) return;
    if (category === 'full' && index < lowerSectionCount) {
      setLowerSectionCount(count => Math.max(0, count - 1));
    }
    setSections(current => current.filter(section => section.id !== sectionId));
  };

  const removeSection = (side: SectionSide, sectionId: string) => {
    if (side === 'main') {
      removeMainSection(sectionId);
      return;
    }
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

  // ── 서랍 높이 편집 (서랍별 개별 입력) ──────────────────────
  /** 서랍 개수에 맞춘 높이 배열 — 부족하면 마지막 값(없으면 255)으로 채움 */
  const getDrawerHeightsArray = (section: BuilderSection): number[] => {
    const parsed = parseNumberList(section.drawerHeights);
    const count = Math.max(1, section.count || 1);
    if (parsed.length >= count) return parsed.slice(0, count);
    const fill = parsed.length > 0 ? parsed[parsed.length - 1] : 255;
    return [...parsed, ...Array(count - parsed.length).fill(fill)];
  };

  const setDrawerHeightAt = (side: SectionSide, section: BuilderSection, drawerIndex: number, valueMm: number) => {
    const heights = getDrawerHeightsArray(section);
    heights[drawerIndex] = Math.max(0, valueMm);
    updateSection(side, section.id, 'drawerHeights', heights.join(', '));
  };

  /** 서랍 개수 변경 — 높이 배열 길이도 함께 동기화 */
  const setDrawerCount = (side: SectionSide, section: BuilderSection, count: number) => {
    const nextCount = Math.max(1, Math.min(6, Math.round(count)));
    const heights = getDrawerHeightsArray({ ...section, count: nextCount });
    setSectionsForSide(side, current => current.map(item => (
      item.id === section.id
        ? { ...item, count: nextCount, drawerHeights: heights.join(', ') }
        : item
    )));
  };

  /** 균등 분배 — 칸 실측 높이에서 간격을 빼고 서랍 수로 나눔 */
  const distributeDrawerHeights = (side: SectionSide, section: BuilderSection, zoneHeightMm: number) => {
    const count = Math.max(1, section.count || 1);
    const gap = Math.max(0, section.gapHeight || 0);
    const usable = Math.max(0, zoneHeightMm - gap * (count + 1));
    const each = Math.max(1, Math.floor(usable / count));
    updateSection(side, section.id, 'drawerHeights', Array(count).fill(each).join(', '));
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

    setCategoryPicked(true);
    setCategory(module.category as ModuleCategory);
    setGalleryCategory(
      (module as ModuleData & { galleryCategory?: string }).galleryCategory
      || defaultGalleryCategory(module.category as ModuleCategory)
    );
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

    // 상판 유무 복원 — undefined는 카테고리 표준 (하부장: 없음, 키큰장/상부장: 있음)
    if ((module.category as string) === 'lower') {
      setHasTopPanel(module.modelConfig?.hideTopPanel === false);
    } else {
      setHasTopPanel(module.modelConfig?.hideTopPanel !== true);
    }

    // 상단 모서리 따내기 복원 (키큰장/상부장)
    setTopNotchEnabled(!!module.modelConfig?.topNotch);
    setTopNotchHeight(module.modelConfig?.topNotch?.y || 60);
    setTopNotchDepth(module.modelConfig?.topNotch?.z || 40);

    // 기본 제거 패널 복원 (패널목록 체크 해제 상태)
    setHiddenPanelNames(new Set(module.modelConfig?.panelExclusions || []));
    setDividersText((module.modelConfig?.verticalDividers || []).join(', '));
    setTopChannelEnabled(module.modelConfig?.topChannelNotch === true);
    setPanelThickness(module.modelConfig?.basicThickness === 18.5 ? 18.5 : 18);
    setTopPanelOffset(module.modelConfig?.topPanelFrontOffsetMm || 0);
    setHighlightedPanelName(null);

    // 외부서랍 복원 (일반 / 레그라박스)
    const externalDrawers = module.modelConfig?.externalDrawers;
    setUseExternalDrawers(!!externalDrawers);
    setExtDrawerType(externalDrawers?.drawerType === 'legrabox' ? 'legrabox' : 'external');
    setLegraRows(
      externalDrawers?.legraSpecs?.length
        ? externalDrawers.legraSpecs.map((spec, index) => ({ id: `legra-${Date.now()}-${index}`, type: spec.type, offsetMm: spec.offsetMm }))
        : [
          { id: `legra-${Date.now()}-0`, type: 'F', offsetMm: 28 },
          { id: `legra-${Date.now()}-1`, type: 'F', offsetMm: 406 }
        ]
    );
    setExtDrawerCount(externalDrawers?.count || 2);
    setExtMaidaHeights(externalDrawers?.maidaHeights?.join(', ') || '');
    setExtSideAll(externalDrawers?.sideHeights?.all || 0);
    setExtSideFirst(externalDrawers?.sideHeights?.first || 0);
    setExtSideRest(externalDrawers?.sideHeights?.rest || 0);
    if (externalDrawers?.drawerType === 'legrabox') {
      setLegraTopGap(externalDrawers?.topGap ?? -20);
      setLegraBottomGap(externalDrawers?.bottomGap ?? 5);
      setLegraMaidaGap(externalDrawers?.maidaGapMm ?? 20);
      setExtTopGap(-20);
      setExtBottomGap(5);
      setExtMaidaGap(20);
    } else {
      setExtTopGap(externalDrawers?.topGap ?? -20);
      setExtBottomGap(externalDrawers?.bottomGap ?? 5);
      setExtMaidaGap(externalDrawers?.maidaGapMm ?? 20);
      setLegraTopGap(-20);
      setLegraBottomGap(5);
      setLegraMaidaGap(20);
    }
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

    // 하부/상부 경계 복원 — 미지정(표준 모듈)은 첫 섹션이 하부
    setLowerSectionCount(module.modelConfig?.lowerSectionCount ?? 1);
  };

  /** '직접 만들기' — 불러온 베이스 모델을 완전히 비우고 초기 상태로 */
  const resetFormToBlank = () => {
    setName('신규 모듈');
    // 고유 식별자 자동 부여 — 한글 모듈명은 식별자에 반영되지 않아 기본값이 겹치면 기존 모듈을 덮어쓰게 됨
    setSlug(`module-${Date.now().toString(36)}`);
    setCategory('full');
    setGalleryCategory(defaultGalleryCategory('full'));
    setLayoutMode('single');
    setWidth(600);
    setHeight(2400);
    setDepth(600);
    setHasDoor(false);
    setIsDynamic(true);
    setHasTopPanel(true);
    setTopNotchEnabled(false);
    setTopNotchHeight(60);
    setTopNotchDepth(40);
    setThumbnail('');
    setOriginalThumbnail('');
    setSections(createDefaultFullSections());
    setLowerSectionCount(1);
    setRightSections([createSection(0)]);
    setRightAbsoluteWidth(0);
    setRightAbsoluteDepth(0);
    setHasSharedMiddlePanel(false);
    setHasSharedSafetyShelf(false);
    setNotchSidesLinked(true);
    setLeftNotches([]);
    setRightNotches([]);
    setUseExternalDrawers(false);
    setExtDrawerType('external');
    setLegraRows([
      { id: `legra-${Date.now()}-0`, type: 'F', offsetMm: 28 },
      { id: `legra-${Date.now()}-1`, type: 'F', offsetMm: 406 }
    ]);
    setExtDrawerCount(2);
    setExtMaidaHeights('');
    setExtSideAll(0);
    setExtSideFirst(0);
    setExtSideRest(0);
    setExtTopGap(-20);
    setExtBottomGap(5);
    setLegraTopGap(-20);
    setLegraBottomGap(5);
    setExtMaidaGap(20);
    setLegraMaidaGap(20);
    setPanelThickness(18);
    setTopPanelOffset(0);
    setHiddenPanelNames(new Set());
    setDividersText('');
    setTopChannelEnabled(false);
    setHighlightedPanelName(null);
    setLoadedModuleId(null);
  };

  const applyTemplate = (templateId: string) => {
    if (!templateId) {
      // '직접 만들기' 선택 — 이전에 불러온 베이스 모델 제거
      resetFormToBlank();
      return;
    }
    const template = templateModules.find(module => module.id === templateId);
    if (!template) return;
    loadModuleIntoForm(template);
  };

  const loadSavedModule = (module: ModuleData & { thumbnail?: string }) => {
    setTemplateSelection('');
    loadModuleIntoForm(module, { asSaved: true });
  };

  /** 보기 — 카드 클릭/보기 버튼: 구조 열람 전용 (입력 잠금) */
  const openModuleView = (item: CatalogItem) => {
    if (item.source === 'admin') {
      loadSavedModule(item.module);
    } else {
      setTemplateSelection(item.module.id);
      loadModuleIntoForm(item.module);
    }
    setReadOnlyDetail(true);
    setView('builder');
  };

  /** 수정 — 관리자 모듈: 그대로 편집(수정 저장) / 표준 모듈: 구조를 편집 시작 (저장 시 관리자 모듈 생성) */
  const openModuleEdit = (item: CatalogItem) => {
    if (item.source === 'admin') {
      loadSavedModule(item.module);
    } else {
      setTemplateSelection(item.module.id);
      loadModuleIntoForm(item.module);
    }
    setReadOnlyDetail(false);
    setView('builder');
  };

  /** 분류 표준값 적용: 치수 / 상판 / 노출 탭 / 기본 칸 구조 */
  const applyCategory = (nextCategory: ModuleCategory) => {
    setCategory(nextCategory);
    const dims = CATEGORY_DEFAULT_DIMENSIONS[nextCategory];
    setHeight(dims.height);
    setDepth(dims.depth);
    setHasTopPanel(nextCategory !== 'lower');
    setGalleryCategory(defaultGalleryCategory(nextCategory));
    if (nextCategory === 'full') {
      setSections(createDefaultFullSections());
      setLowerSectionCount(1);
    } else {
      // 상부장/하부장: 단일 빈 칸 (오픈)
      setSections([{ ...createSection(0), type: 'open', height: 100, heightType: 'percentage', count: 0 }]);
      setLowerSectionCount(1);
    }
  };

  /** 복제 — 구성을 그대로 복사해 새 모듈(고유 식별자, 비공개 초안)로 제작 시작 */
  const duplicateModule = (item: CatalogItem) => {
    loadModuleIntoForm(item.module);
    setName(`${item.module.name} 복사본`);
    setSlug(`module-${Date.now().toString(36)}`); // 고유 식별자 — 원본 덮어쓰기 불가
    setLoadedModuleId(null);
    setCategoryPicked(true);
    setReadOnlyDetail(false);
    setView('builder');
  };

  const openNewModule = () => {
    resetFormToBlank();
    setReadOnlyDetail(false);
    setCategoryPicked(false); // 분류 선택 게이트 — 사용자가 고르기 전엔 모듈을 만들지 않음
    setView('builder');
  };

  /** 열람 중인 표준 모듈 구조를 복사해 신규 관리자 모듈 제작 시작 */
  const deriveFromReadOnly = () => {
    setReadOnlyDetail(false);
    setLoadedModuleId(null);
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
      if (extDrawerType === 'legrabox') {
        if (legraRows.length < 1) return '레그라박스 서랍을 1단 이상 추가하세요.';
        // 이격 초과는 차단하지 않음 — 직렬화에서 내경(이격+측판 ≤ H−상하판)으로 자동 클램프됨
      } else {
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

  /** 중간 따내기 개수 변경 — 늘리면 가구 높이 기준 균등 분배 위치로 추가, 줄이면 뒤에서 제거 */
  const setNotchCount = (count: number) => {
    const target = Math.max(0, Math.min(8, Math.round(count)));
    setLeftNotches(current => {
      if (target === current.length) return current;
      if (target < current.length) return current.slice(0, target);
      const next = [...current];
      for (let i = current.length; i < target; i += 1) {
        next.push(createNotchRow(Math.round((height * (i + 1)) / (target + 1))));
      }
      return next;
    });
  };

  /**
   * 외부서랍 단수 → 중간 따내기 자동 동기화 (표준 공식)
   * 사용 가능 높이 = H − 상단따내기60 − (N−1)×65, zone 균등 분할
   * 예: H780 2단 → 따내기 1개 @ (H−125)/2 = 327.5 (표준 lower-drawer-2tier와 동일)
   */
  const syncExternalDrawerNotches = (
    drawerCount: number,
    bodyHeight = height,
    family = lowerDrawerFamilyForGalleryCategory(galleryCategory)
  ) => {
    const count = Math.max(1, Math.round(drawerCount));
    const standardNotches = resolveLowerCabinetStandardDrawerNotches({
      family,
      drawerCount: count,
      moduleHeightMm: bodyHeight,
      stoneTopThicknessMm: 20
    });
    setNotchSidesLinked(true);
    if (standardNotches) {
      setLeftNotches(standardNotches.map(notch => ({
        ...createNotchRow(Math.round(notch.fromBottom * 10) / 10),
        height: notch.y,
        depth: notch.z
      })));
      return;
    }

    const notchH = 65;
    const topNotchH = hasTopPanel ? 0 : 60;
    const usable = Math.max(1, bodyHeight - topNotchH - (count - 1) * notchH);
    const zone = usable / count;
    setLeftNotches(Array.from({ length: count - 1 }, (_, i) => ({
      ...createNotchRow(Math.round((zone * (i + 1) + notchH * i) * 10) / 10),
      height: notchH,
      depth: 40
    })));
  };

  /**
   * 가구 높이 변경 — 외부서랍 중간 따내기를 zone 비례로 재계산.
   * 표준 모듈과 동일 원리: 따내기 높이(65)는 고정, 서랍 zone들이 비례 확장/축소.
   * 균등 분할 상태면 결과가 표준 공식((H−125)/2 등)과 정확히 일치, 사용자 수정 위치는 비율 유지.
   */
  const [heightInput, setHeightInput] = useState(String(2400));
  useEffect(() => { setHeightInput(String(height)); }, [height]);
  const commitHeightInput = () => {
    const next = Number(heightInput);
    if (!Number.isFinite(next) || next <= 0) { setHeightInput(String(height)); return; }
    if (next !== height) handleHeightChange(next);
  };
  const handleHeightInputChange = (value: string) => {
    setHeightInput(value);
    const next = Number(value);
    if (Number.isFinite(next) && next > 0 && next !== height) {
      handleHeightChange(next);
    }
  };

  const handleHeightChange = (nextHeight: number) => {
    const prevHeight = height;
    setHeight(nextHeight);
    if (nextHeight <= 0 || prevHeight <= 0 || nextHeight === prevHeight) return;
    // 레그라: 맨 아래 서랍 고정, 위 서랍/마이다 묶음은 높이 변화량만큼 평행이동
    if (useExternalDrawers && extDrawerType === 'legrabox') {
      const deltaH = nextHeight - prevHeight;
      const shiftNotchRows = (rows: NotchRow[]) => rows.map(row => ({
        ...row,
        fromBottom: Math.round(
          Math.min(
            Math.max(0, row.fromBottom + deltaH),
            Math.max(0, nextHeight - row.height)
          ) * 10
        ) / 10
      }));
      setLegraRows(rows => rows.map((row, i) => (
        i === 0 ? row : { ...row, offsetMm: Math.round((row.offsetMm + deltaH) * 10) / 10 }
      )));
      setLeftNotches(shiftNotchRows);
      if (!notchSidesLinked) setRightNotches(shiftNotchRows);
      return;
    }
    if (!useExternalDrawers || !notchSidesLinked) return;
    const standardNotches = extDrawerType === 'external'
      ? resolveLowerCabinetStandardDrawerNotches({
          family: lowerDrawerFamilyForGalleryCategory(galleryCategory),
          drawerCount: extDrawerCount,
          moduleHeightMm: nextHeight,
          stoneTopThicknessMm: 20
        })
      : null;
    if (standardNotches) {
      setLeftNotches(standardNotches.map(notch => ({
        ...createNotchRow(Math.round(notch.fromBottom * 10) / 10),
        height: notch.y,
        depth: notch.z
      })));
      return;
    }
    setLeftNotches(current => {
      if (current.length === 0) return current;
      const sorted = [...current].sort((a, b) => a.fromBottom - b.fromBottom);
      const topNotchH = hasTopPanel ? 0 : 60;
      const notchSum = sorted.reduce((sum, row) => sum + row.height, 0);
      const oldUsable = prevHeight - topNotchH - notchSum;
      const newUsable = nextHeight - topNotchH - notchSum;
      if (oldUsable <= 0 || newUsable <= 0) return current;
      // 기존 zone(따내기 사이 구간) 비율대로 새 높이에 재배치
      const zones: number[] = [];
      let cursor = 0;
      sorted.forEach(row => {
        zones.push(Math.max(0, row.fromBottom - cursor));
        cursor = row.fromBottom + row.height;
      });
      const scale = newUsable / oldUsable;
      let nextBottom = 0;
      return sorted.map((row, i) => {
        nextBottom += zones[i] * scale;
        const fromBottom = Math.round(nextBottom * 10) / 10;
        nextBottom += row.height;
        return { ...row, fromBottom };
      });
    });
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

  /**
   * 하부장 노출 카테고리 = 구조 패밀리 — 측판 상단 모서리 구조 프리셋 동시 적용
   * - 기본장: 상판 없음 + 상단 60×40 따내기 + 목찬넬 (표준 반통)
   * - 도어올림: 상판 있음, 상단 따내기 없음
   * - 상판내림: 상판 있음 + 상단 가로전대 아래 65×40 따내기 (H − 120 위치, 표준 반통 규칙)
   */
  const applyGalleryCategoryPreset = (value: string) => {
    setGalleryCategory(value);
    if (category !== 'lower') return;

    setNotchSidesLinked(true);
    setRightNotches([]);
    if (value === 'kitchen-basic') {
      setHasTopPanel(false);
      setTopChannelEnabled(true); // 기본장 구조 패밀리 = 상단 목찬넬 포함
      if (useExternalDrawers && extDrawerType === 'external') {
        syncExternalDrawerNotches(extDrawerCount, height, 'basic');
      } else {
        setLeftNotches([]);
      }
    } else if (value === 'kitchen-door-raise') {
      setHasTopPanel(true);
      setTopChannelEnabled(false);
      if (useExternalDrawers && extDrawerType === 'external') {
        syncExternalDrawerNotches(extDrawerCount, height, 'doorLift');
      } else {
        setLeftNotches([]);
      }
    } else if (value === 'kitchen-top-down') {
      setHasTopPanel(true);
      setTopChannelEnabled(false);
      if (useExternalDrawers && extDrawerType === 'external') {
        syncExternalDrawerNotches(extDrawerCount, height, 'topDown');
      } else {
        setLeftNotches([{
          ...createNotchRow(Math.max(1, height - 120)),
          height: 65,
          depth: 40
        }]);
      }
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
        if (exists && !confirm(
          `동일 ID(${moduleDraft.id})의 모듈이 이미 있습니다.\n` +
          '확인을 누르면 기존 모듈이 이 내용으로 영구히 덮어써집니다 (복구 불가).\n' +
          '별도 모듈로 저장하려면 취소 후 식별자를 바꾸세요.'
        )) {
          return;
        }
      }
      const published = await saveAdminFurnitureModule(moduleDraft);
      setLoadedModuleId(moduleDraft.id);
      // 목록으로 돌아가면 방금 저장한 모듈이 보이는 탭이 열려 있도록
      setStatusTab(published ? 'published' : 'draft');
      alert(published
        ? '수정 사항이 저장되었습니다. (게시 중 — 가구 갤러리에 즉시 반영)'
        : '비공개 초안으로 저장되었습니다. "작업중" 탭에 있습니다 — "게시"를 켜면 가구 갤러리에 공개됩니다.');
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
          <p>sbbc212@gmail.com 슈퍼어드민만 모듈 관리에 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  // ─── 모듈 관리 목록 (기본 화면) ───────────────────────────────
  if (view === 'list') {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <h1 className={styles.title}>모듈 관리</h1>
            <span className={styles.countChip}>{filteredCatalog.length} / {catalogItems.length}개</span>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.saveButton} onClick={openNewModule}>
              <Plus size={16} />
              <span>신규 모듈 추가</span>
            </button>
          </div>
        </header>

        {/* 전시 / 작업 분리 탭 */}
        <div className={styles.statusTabs}>
          <button
            type="button"
            className={statusTab === 'published' ? styles.statusTabActive : ''}
            onClick={() => setStatusTab('published')}
          >
            게시중
            <em>{catalogItems.filter(item => !(item.source === 'admin' && item.enabled === false)).length}</em>
          </button>
          <button
            type="button"
            className={statusTab === 'draft' ? styles.statusTabActive : ''}
            onClick={() => setStatusTab('draft')}
          >
            작업중
            <em>{catalogItems.filter(item => item.source === 'admin' && item.enabled === false).length}</em>
          </button>
        </div>

        {/* 상단 필터 바 — 카테고리 / 출처 / 검색 / 갤러리·리스트 전환 */}
        <div className={styles.filterBar}>
          <div className={styles.filterChips}>
            <button
              type="button"
              className={`${styles.filterChip} ${categoryFilter === 'all' ? styles.filterChipActive : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              전체
            </button>
            {Object.entries(GALLERY_CATEGORY_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`${styles.filterChip} ${categoryFilter === value ? styles.filterChipActive : ''}`}
                onClick={() => setCategoryFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.filterRight}>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as 'all' | 'standard' | 'admin')}
              className={styles.filterSelect}
            >
              <option value="all">전체 출처</option>
              <option value="standard">표준</option>
              <option value="admin">관리자</option>
            </select>
            <input
              className={styles.filterSearch}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="이름 · ID 검색"
            />
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={listMode === 'gallery' ? styles.viewToggleActive : ''}
                onClick={() => setListMode('gallery')}
                title="갤러리형"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={listMode === 'list' ? styles.viewToggleActive : ''}
                onClick={() => setListMode('list')}
                title="리스트형"
              >
                <ListIcon size={15} />
              </button>
            </div>
          </div>
        </div>

        {filteredCatalog.length > visibleCount && (
          <div className={styles.loadMoreRow}>
            <button type="button" className={styles.copyButton} onClick={() => setVisibleCount(count => count + 120)}>
              더 보기 ({visibleCount} / {filteredCatalog.length})
            </button>
          </div>
        )}

        {filteredCatalog.length === 0 && (
          <p className={styles.thumbnailHint}>조건에 맞는 모듈이 없습니다.</p>
        )}

        {listMode === 'gallery' ? (
          <div className={styles.moduleGrid}>
            {visibleCatalog.map(item => (
              <div
                key={`${item.source}-${item.module.id}`}
                className={`${styles.moduleCard} ${item.source === 'admin' && !item.enabled ? styles.moduleCardHidden : ''}`}
                onClick={() => openModuleView(item)}
              >
                <div className={styles.moduleCardThumb}>
                  {item.thumbnail
                    ? <img src={item.thumbnail} alt={item.module.name} />
                    : <span className={styles.textThumb}>{item.module.name.replace(/\s*[\d.]+mm$/, '')}</span>}
                </div>
                <div className={styles.moduleCardBody}>
                  <strong>{item.module.name}</strong>
                  <code className={styles.moduleCardId}>{item.module.id}</code>
                  <span className={styles.moduleCardMeta}>
                    {item.module.dimensions.width}×{item.module.dimensions.height}×{item.module.dimensions.depth}
                  </span>
                  <div className={styles.moduleTags}>
                    <span className={styles.moduleTag}>{GALLERY_CATEGORY_LABELS[item.galleryCat] || item.galleryCat}</span>
                    <span className={`${styles.moduleTag} ${item.source === 'admin' ? styles.moduleTagAdmin : ''}`}>
                      {item.source === 'admin' ? '관리자' : '표준'}
                    </span>
                    {item.source === 'admin' && !item.enabled && (
                      <span className={`${styles.moduleTag} ${styles.moduleTagHidden}`}>비공개</span>
                    )}
                  </div>
                </div>
                <div className={styles.moduleCardActions} onClick={(event) => event.stopPropagation()}>
                  {item.source === 'admin' && (
                    <label className={styles.checkboxInline} title="가구 갤러리 게시 여부">
                      <input
                        type="checkbox"
                        checked={item.enabled !== false}
                        onChange={(event) => toggleSavedEnabled(item.module.id, event.target.checked)}
                      />
                      <span>게시</span>
                    </label>
                  )}
                  <button type="button" className={styles.iconButton} onClick={() => openModuleView(item)} title="보기 (구조 열람)">
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => openModuleEdit(item)}
                    title={item.source === 'admin' ? '수정' : '수정 (저장 시 관리자 모듈로 생성)'}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={(event) => { event.stopPropagation(); duplicateModule(item); }}
                    title="복제 (새 모듈로 복사 — 저장 시 비공개 초안)"
                  >
                    <Copy size={14} />
                  </button>
                  {item.source === 'admin' && (
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => deleteSaved(item.module.id, item.module.name)}
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.moduleRows}>
            {visibleCatalog.map(item => (
              <div
                key={`${item.source}-${item.module.id}`}
                className={`${styles.moduleRowItem} ${item.source === 'admin' && !item.enabled ? styles.moduleCardHidden : ''}`}
                onClick={() => openModuleView(item)}
              >
                <div className={styles.moduleRowThumb}>
                  {item.thumbnail
                    ? <img src={item.thumbnail} alt={item.module.name} />
                    : <span className={styles.textThumbSmall}>{item.module.name.replace(/\s*[\d.]+mm$/, '').slice(0, 6)}</span>}
                </div>
                <div className={styles.moduleRowName}>
                  <strong>{item.module.name}</strong>
                  <code>{item.module.id}</code>
                </div>
                <span className={styles.moduleTag}>{GALLERY_CATEGORY_LABELS[item.galleryCat] || item.galleryCat}</span>
                <span className={styles.moduleRowDims}>
                  {item.module.dimensions.width}×{item.module.dimensions.height}×{item.module.dimensions.depth}
                </span>
                <span className={`${styles.moduleTag} ${item.source === 'admin' ? styles.moduleTagAdmin : ''}`}>
                  {item.source === 'admin' ? '관리자' : '표준'}
                </span>
                <div className={styles.moduleCardActions} onClick={(event) => event.stopPropagation()}>
                  {item.source === 'admin' && (
                    <label className={styles.checkboxInline} title="가구 갤러리 게시 여부">
                      <input
                        type="checkbox"
                        checked={item.enabled !== false}
                        onChange={(event) => toggleSavedEnabled(item.module.id, event.target.checked)}
                      />
                      <span>게시</span>
                    </label>
                  )}
                  <button type="button" className={styles.iconButton} onClick={() => openModuleView(item)} title="보기 (구조 열람)">
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => openModuleEdit(item)}
                    title={item.source === 'admin' ? '수정' : '수정 (저장 시 관리자 모듈로 생성)'}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={(event) => { event.stopPropagation(); duplicateModule(item); }}
                    title="복제 (새 모듈로 복사 — 저장 시 비공개 초안)"
                  >
                    <Copy size={14} />
                  </button>
                  {item.source === 'admin' && (
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => deleteSaved(item.module.id, item.module.name)}
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── 모듈 상세 / 제작 (빌더) ───────────────────────────────
  // 신규 모듈: 분류 선택 게이트 — 분류를 정하기 전엔 폼/프리뷰 없음
  if (!categoryPicked) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <button type="button" className={styles.copyButton} onClick={() => setView('list')} title="모듈 목록으로">
              <ArrowLeft size={16} />
              <span>목록</span>
            </button>
            <h1 className={styles.title}>모듈 제작</h1>
          </div>
        </header>
        <div className={styles.categoryGate}>
          <div className={styles.categoryGateTitleBlock}>
            <h2>분류 선택</h2>
            <p>분류에 따라 표준 치수와 측판 구조가 달라집니다. 선택 후 모든 값을 수정할 수 있습니다.</p>
          </div>
          <div className={styles.categoryGateGrid}>
            {([
              // 아이콘 = 갤러리와 동일한 대표 모듈 이미지
              { value: 'full' as ModuleCategory, label: '키큰장', dims: 'H 2400 · D 600', desc: '하부/상부 섹션 분리', icon: FURNITURE_ICONS['single-2drawer-hanging'] },
              { value: 'upper' as ModuleCategory, label: '상부장', dims: 'H 785 · D 300', desc: '벽 상부 부착', icon: FURNITURE_ICONS['upper-cabinet-shelf'] },
              { value: 'lower' as ModuleCategory, label: '하부장', dims: 'H 780 · D 600', desc: '상판 없음 · 상단 따내기 표준', icon: FURNITURE_ICONS['lower-half-cabinet'] }
            ]).map(option => (
              <button
                key={option.value}
                type="button"
                className={styles.categoryGateCard}
                onClick={() => {
                  applyCategory(option.value);
                  setCategoryPicked(true);
                }}
              >
                <span className={styles.gateSketchArea}>
                  {option.icon && <img src={option.icon} alt={option.label} />}
                </span>
                <strong>{option.label}</strong>
                <code>{option.dims}</code>
                <span className={styles.gateDesc}>{option.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${styles.containerBuilder}`}>
      <header className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <button type="button" className={styles.copyButton} onClick={() => setView('list')} title="모듈 목록으로">
            <ArrowLeft size={16} />
            <span>목록</span>
          </button>
          <h1 className={styles.title}>
            {readOnlyDetail ? (loadedModuleId ? '모듈 열람' : '모듈 열람 (표준)') : loadedModuleId ? '모듈 수정' : '모듈 제작'}
          </h1>
          <code className={styles.idChip} title="모듈 ID">
            {readOnlyDetail ? templateSelection || moduleDraft.id : moduleDraft.id}
          </code>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.copyButton} onClick={copyDraft}>
            <ClipboardCopy size={16} />
            <span>JSON</span>
          </button>
          <button
            type="button"
            className={styles.copyButton}
            onClick={() => {
              const raw = prompt('모듈 JSON을 붙여넣으세요 (JSON 복사로 내보낸 형식)');
              if (!raw) return;
              try {
                const mod = JSON.parse(raw);
                if (!mod?.dimensions || !mod?.category) throw new Error('형식 오류');
                loadModuleIntoForm(mod);
                setCategoryPicked(true);
                setReadOnlyDetail(false);
                alert('JSON을 불러왔습니다. 확인 후 저장하세요 (식별자가 기존과 같으면 덮어쓰기 확인창이 뜹니다).');
              } catch {
                alert('JSON 파싱에 실패했습니다. "JSON" 버튼으로 복사한 형식 그대로 붙여넣어 주세요.');
              }
            }}
          >
            <span>가져오기</span>
          </button>
          {readOnlyDetail ? (
            loadedModuleId ? (
              <button type="button" className={styles.saveButton} onClick={() => setReadOnlyDetail(false)}>
                수정하기
              </button>
            ) : (
              <button type="button" className={styles.saveButton} onClick={deriveFromReadOnly}>
                이 구조로 신규 모듈 만들기
              </button>
            )
          ) : (
            <button type="button" className={styles.saveButton} onClick={saveDraft} disabled={saving}>
              {saving ? '저장 중…' : (loadedModuleId === moduleDraft.id ? '수정 저장' : '저장')}
            </button>
          )}
        </div>
      </header>

      <div className={styles.layout}>
        {/* 열람 모드(표준 모듈): 모든 입력 잠금 — fieldset disabled */}
        <fieldset className={styles.formColumn} disabled={readOnlyDetail}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <Box size={20} />
            <h2>기본 정보</h2>
          </div>

          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.fullField}`}>
              <span>베이스 모델 (기존 모듈 템플릿)</span>
              <select
                value={templateSelection}
                onChange={(event) => {
                  setTemplateSelection(event.target.value);
                  applyTemplate(event.target.value);
                }}
              >
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
              <select
                value={category}
                onChange={(event) => applyCategory(event.target.value as ModuleCategory)}
              >
                <option value="full">키큰장</option>
                <option value="upper">상부장</option>
                <option value="lower">하부장</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>노출 카테고리 {category === 'lower' ? '(구조 패밀리)' : '(갤러리 탭)'}</span>
              <select
                value={galleryCategory}
                onChange={(event) => applyGalleryCategoryPreset(event.target.value)}
                disabled={GALLERY_CATEGORY_OPTIONS[category].length === 1}
              >
                {GALLERY_CATEGORY_OPTIONS[category].map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
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
              <input
                type="number"
                min={1}
                value={heightInput}
                onChange={(event) => handleHeightInputChange(event.target.value)}
                onBlur={commitHeightInput}
                onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
              />
            </label>

            <label className={styles.field}>
              <span>깊이(mm)</span>
              <input type="number" min={1} value={depth} onChange={(event) => setDepth(Number(event.target.value))} />
            </label>

            <label className={styles.field}>
              <span>판재 두께</span>
              <select value={panelThickness} onChange={(event) => setPanelThickness(Number(event.target.value) === 18.5 ? 18.5 : 18)}>
                <option value={18}>18T (가로판 좌우 0.5mm 갭)</option>
                <option value={18.5}>18.5T (갭 없음)</option>
              </select>
            </label>

            {category === 'full' && (
              <>
                <label className={styles.field}>
                  <span>하부 섹션 높이(mm)</span>
                  <input
                    type="number"
                    min={1}
                    value={lowerZoneHeightMm}
                    disabled={lowerSectionCount !== 1}
                    title={lowerSectionCount !== 1 ? '하부 칸이 여러 개이거나 없으면 각 칸에서 조정하세요' : '하부 칸을 고정(mm) 높이로 설정'}
                    onChange={(event) => setLowerZoneHeight(Number(event.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  <span>상부 섹션 높이(mm)</span>
                  <input
                    type="number"
                    value={upperZoneHeightMm}
                    disabled
                    title="전체 높이 − 하부 섹션 (자동)"
                  />
                </label>
              </>
            )}
          </div>

          <label className={styles.checkbox}>
            <input type="checkbox" checked={hasDoor} onChange={(event) => setHasDoor(event.target.checked)} />
            <span>도어 포함</span>
          </label>

          <label className={styles.checkbox}>
            <input type="checkbox" checked={hasTopPanel} onChange={(event) => setHasTopPanel(event.target.checked)} />
            <span>상판 포함</span>
          </label>

          {hasTopPanel && (
            <label className={styles.compactField}>
              <span>상판 앞 옵셋(mm) — 상판 깊이를 앞에서 후퇴 (0 = 없음)</span>
              <input
                type="number"
                min={0}
                value={topPanelOffset}
                onChange={(event) => setTopPanelOffset(Math.max(0, Number(event.target.value)))}
              />
            </label>
          )}

          {!hasTopPanel && (
            <label className={styles.checkbox}>
              <input type="checkbox" checked={topChannelEnabled} onChange={(event) => setTopChannelEnabled(event.target.checked)} />
              <span>상단 목찬넬 따내기 (측판 60×40 + 가로전대{category === 'lower' ? ' + 목찬넬 PET 프레임' : ''})</span>
            </label>
          )}

          <label className={styles.checkbox}>
            <input type="checkbox" checked={isDynamic} onChange={(event) => setIsDynamic(event.target.checked)} />
            <span>동적 폭 (배치 시 슬롯 폭에 맞춰 자동 조정, 키큰장은 높이도 내경에 맞춤)</span>
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
            <h2>내부 구성 {category === 'full' ? '— 하부/상부 섹션' : '— 칸 (아래 → 위)'}</h2>
            {category !== 'full' && (
              <button type="button" className={styles.iconButton} onClick={() => addSection('main')} title="칸 추가">
                <Plus size={18} />
              </button>
            )}
          </div>

          <label className={styles.compactField}>
            <span>칸막이 위치(mm, 좌측판 안쪽 기준 · 쉼표 구분, 선택)</span>
            <input
              type="text"
              value={dividersText}
              onChange={(event) => setDividersText(event.target.value)}
              placeholder="예: 282 (칸막이 = 풀하이트 세로판, 좌우 분할)"
            />
          </label>

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

          {layoutMode === 'dual' && <h3 className={styles.sectionGroupTitle}>좌측 칸 구성</h3>}

          {/* 키큰장: 하부/상부 영역 — 각자 칸 추가 버튼, 경계는 lowerSectionCount */}
          {category === 'full' && (
            <div className={styles.sectionGroupHeader}>
              <h3 className={styles.sectionGroupTitle}>하부 섹션 ({lowerSectionCount})</h3>
              <button type="button" className={styles.iconButton} onClick={() => addZoneSection('lower')} title="하부 칸 추가">
                <Plus size={16} />
              </button>
            </div>
          )}
          {category === 'full' && lowerSectionCount === 0 && (
            <p className={styles.thumbnailHint}>하부 섹션 없음 — 위 + 버튼으로 추가</p>
          )}

          <div className={styles.sectionList}>
            {sections.map((section, index) => {
              const isFullCategory = category === 'full';
              const isLowerZone = isFullCategory && index < lowerSectionCount;
              const badge = isFullCategory
                ? (isLowerZone
                  ? (lowerSectionCount > 1 ? `하부 칸 ${index + 1}` : '하부 섹션')
                  : (sections.length - lowerSectionCount > 1 ? `상부 칸 ${index - lowerSectionCount + 1}` : '상부 섹션'))
                : `칸 ${index + 1}`;
              return (
                <Fragment key={section.id}>
                  {isFullCategory && index === lowerSectionCount && (
                    <div className={styles.sectionGroupHeader}>
                      <h3 className={styles.sectionGroupTitle}>상부 섹션 ({sections.length - lowerSectionCount})</h3>
                      <button type="button" className={styles.iconButton} onClick={() => addZoneSection('upper')} title="상부 칸 추가">
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                  <div className={styles.sectionCard}>
                    <div className={styles.sectionCardHeader}>
                      <div>
                        <span className={styles.sectionBadge}>{badge}</span>
                        <strong>{sectionLabels[section.type]}</strong>
                      </div>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => removeSection('main', section.id)}
                        disabled={sections.length === 1}
                        title="칸 삭제"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className={styles.sectionFields}>
                      <label className={styles.compactField}>
                        <span>칸 구성</span>
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

                      {section.type === 'shelf' && (
                        <>
                          <label className={styles.compactField}>
                            <span>선반 개수</span>
                            <input
                              type="number"
                              min={0}
                              value={section.count}
                              onChange={(event) => updateSection('main', section.id, 'count', Number(event.target.value))}
                            />
                          </label>
                          <label className={styles.compactField}>
                            <span>선반 위치(mm, 선택)</span>
                            <input
                              value={section.shelfPositions}
                              onChange={(event) => updateSection('main', section.id, 'shelfPositions', event.target.value)}
                              placeholder="비우면 균등 분배"
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
                        </>
                      )}

                      {section.type === 'drawer' && (() => {
                        const drawerHeights = getDrawerHeightsArray(section);
                        const zoneMm = Math.round(sectionHeightsMm[index] || 0);
                        const drawerSumMm = drawerHeights.reduce((sum, value) => sum + value, 0);
                        return (
                          <>
                            <label className={styles.compactField}>
                              <span>서랍 개수</span>
                              <input
                                type="number"
                                min={1}
                                max={6}
                                value={Math.max(1, section.count)}
                                onChange={(event) => setDrawerCount('main', section, Number(event.target.value))}
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
                            {drawerHeights.map((drawerHeightMm, drawerIndex) => (
                              <label key={`drawer-h-${drawerIndex}`} className={styles.compactField}>
                                <span>서랍 {drawerIndex + 1} 높이{drawerIndex === 0 ? ' (맨 아래)' : ''}</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={drawerHeightMm}
                                  onChange={(event) => setDrawerHeightAt('main', section, drawerIndex, Number(event.target.value))}
                                />
                              </label>
                            ))}
                            <div className={styles.drawerSummary}>
                              <button
                                type="button"
                                className={styles.textButton}
                                onClick={() => distributeDrawerHeights('main', section, zoneMm)}
                              >
                                균등 분배
                              </button>
                              <span className={drawerSumMm > zoneMm ? styles.drawerSumWarn : ''}>
                                서랍 합계 {drawerSumMm}mm / 칸 {zoneMm}mm
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <label className={styles.checkboxInline}>
                      <input
                        type="checkbox"
                        checked={section.hasBackPanel}
                        onChange={(event) => updateSection('main', section.id, 'hasBackPanel', event.target.checked)}
                      />
                      <span>백패널</span>
                    </label>
                  </div>
                </Fragment>
              );
            })}
          </div>

          {category === 'full' && sections.length - lowerSectionCount <= 0 && (
            <>
              <div className={styles.sectionGroupHeader}>
                <h3 className={styles.sectionGroupTitle}>상부 섹션 (0)</h3>
                <button type="button" className={styles.iconButton} onClick={() => addZoneSection('upper')} title="상부 칸 추가">
                  <Plus size={16} />
                </button>
              </div>
              <p className={styles.thumbnailHint}>상부 섹션 없음 — 위 + 버튼으로 추가</p>
            </>
          )}

          {layoutMode === 'dual' && (
            <>
              <div className={styles.sectionGroupHeader}>
                <h3 className={styles.sectionGroupTitle}>우측 칸 구성</h3>
                <button type="button" className={styles.iconButton} onClick={() => addSection('right')} title="우측 칸 추가">
                  <Plus size={18} />
                </button>
              </div>
              <div className={styles.sectionList}>
                {rightSections.map((section, index) => {
                  const hasSplit = category === 'full' && rightSections.length >= 2;
                  const badge = hasSplit
                    ? (index === 0 ? '하부 섹션' : (rightSections.length > 2 ? `상부 섹션 ${index}` : '상부 섹션'))
                    : `칸 ${index + 1}`;
                  return (
                    <Fragment key={section.id}>
                      {hasSplit && index === 0 && <h3 className={styles.sectionGroupTitle}>하부</h3>}
                      {hasSplit && index === 1 && <h3 className={styles.sectionGroupTitle}>상부</h3>}
                      <div className={styles.sectionCard}>
                        <div className={styles.sectionCardHeader}>
                          <div>
                            <span className={styles.sectionBadge}>{badge}</span>
                            <strong>{sectionLabels[section.type]}</strong>
                          </div>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => removeSection('right', section.id)}
                            disabled={rightSections.length === 1}
                            title="칸 삭제"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>

                        <div className={styles.sectionFields}>
                          <label className={styles.compactField}>
                            <span>칸 구성</span>
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

                          {section.type === 'shelf' && (
                            <>
                              <label className={styles.compactField}>
                                <span>선반 개수</span>
                                <input type="number" min={0} value={section.count} onChange={(event) => updateSection('right', section.id, 'count', Number(event.target.value))} />
                              </label>
                              <label className={styles.compactField}>
                                <span>선반 위치(mm, 선택)</span>
                                <input value={section.shelfPositions} onChange={(event) => updateSection('right', section.id, 'shelfPositions', event.target.value)} placeholder="비우면 균등 분배" />
                              </label>
                            </>
                          )}

                          {section.type === 'drawer' && (() => {
                            const drawerHeights = getDrawerHeightsArray(section);
                            const zoneMm = Math.round(rightSectionHeightsMm[index] || 0);
                            const drawerSumMm = drawerHeights.reduce((sum, value) => sum + value, 0);
                            return (
                              <>
                                <label className={styles.compactField}>
                                  <span>서랍 개수</span>
                                  <input type="number" min={1} max={6} value={Math.max(1, section.count)} onChange={(event) => setDrawerCount('right', section, Number(event.target.value))} />
                                </label>
                                <label className={styles.compactField}>
                                  <span>서랍 간격(mm)</span>
                                  <input type="number" min={0} value={section.gapHeight} onChange={(event) => updateSection('right', section.id, 'gapHeight', Number(event.target.value))} />
                                </label>
                                {drawerHeights.map((drawerHeightMm, drawerIndex) => (
                                  <label key={`right-drawer-h-${drawerIndex}`} className={styles.compactField}>
                                    <span>서랍 {drawerIndex + 1} 높이{drawerIndex === 0 ? ' (맨 아래)' : ''}</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={drawerHeightMm}
                                      onChange={(event) => setDrawerHeightAt('right', section, drawerIndex, Number(event.target.value))}
                                    />
                                  </label>
                                ))}
                                <div className={styles.drawerSummary}>
                                  <button
                                    type="button"
                                    className={styles.textButton}
                                    onClick={() => distributeDrawerHeights('right', section, zoneMm)}
                                  >
                                    균등 분배
                                  </button>
                                  <span className={drawerSumMm > zoneMm ? styles.drawerSumWarn : ''}>
                                    서랍 합계 {drawerSumMm}mm / 칸 {zoneMm}mm
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        <label className={styles.checkboxInline}>
                          <input
                            type="checkbox"
                            checked={section.hasBackPanel}
                            onChange={(event) => updateSection('right', section.id, 'hasBackPanel', event.target.checked)}
                          />
                          <span>백패널</span>
                        </label>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}

          {/* === 측판 목찬넬 따내기 === */}
          <details className={styles.collapse}>
            <summary className={styles.collapseSummary}>
              <span>측판 목찬넬 따내기</span>
              <em>
                {(() => {
                  const hasAutoTop = !hasTopPanel;
                  const hasManualTop = category !== 'lower' && hasTopPanel && topNotchEnabled;
                  const parts: string[] = [];
                  if (hasAutoTop) parts.push('상단 1 (자동)');
                  else if (hasManualTop) parts.push('상단 1');
                  if (leftNotches.length > 0) parts.push(`${notchSidesLinked ? '중간' : '좌/우 중간'} ${leftNotches.length}`);
                  return parts.length > 0 ? parts.join(' · ') : '없음';
                })()}
              </em>
            </summary>
            <div className={styles.collapseBody}>

          {/* ① 상단 모서리 따내기 — 상판 없음 구조는 자동 생성된 따내기 정보 표시 */}
          {!hasTopPanel ? (
            <div className={styles.autoNotchInfo}>
              <span className={styles.sectionBadge}>상단 따내기 · 자동</span>
              <span className={styles.autoNotchDims}>
                위치 {Math.max(0, height - 60)}mm (상단 기준 H−60) · 높이 60 · 깊이 40
              </span>
              <span className={styles.autoNotchNote}>
                목찬넬 ㄱ자 프레임(PET) + 가로전대(PB) 자동 포함 — 기본정보의 '상판 포함' 체크로 제어
              </span>
            </div>
          ) : category !== 'lower' && (
            <label className={styles.checkboxInline}>
              <input
                type="checkbox"
                checked={topNotchEnabled}
                onChange={(event) => setTopNotchEnabled(event.target.checked)}
              />
              <span>상단 모서리 따내기 — 가구 상단에 자동 위치 (높이 변경 추종)</span>
            </label>
          )}

          {category !== 'lower' && hasTopPanel && topNotchEnabled && (
            <div className={styles.sectionFields} style={{ marginTop: 8 }}>
              <label className={styles.compactField}>
                <span>상단 따내기 높이(mm)</span>
                <input type="number" min={1} value={topNotchHeight} onChange={(event) => setTopNotchHeight(Number(event.target.value))} />
              </label>
              <label className={styles.compactField}>
                <span>상단 따내기 깊이(mm)</span>
                <input type="number" min={1} value={topNotchDepth} onChange={(event) => setTopNotchDepth(Number(event.target.value))} />
              </label>
            </div>
          )}

          {/* ② 중간 따내기 — 개수 지정 (균등 분배 기본 위치) + 행별 위치/치수 편집 */}
          <div className={styles.collapseToolbar} style={{ marginTop: 14 }}>
            <label className={styles.compactField}>
              <span>중간 따내기 개수</span>
              <input
                type="number"
                min={0}
                max={8}
                value={leftNotches.length}
                onChange={(event) => setNotchCount(Number(event.target.value))}
              />
            </label>
            <label className={styles.checkboxInline} style={{ marginTop: 0 }}>
              <input
                type="checkbox"
                checked={notchSidesLinked}
                onChange={(event) => toggleNotchSidesLinked(event.target.checked)}
              />
              <span>좌우측판 동일 적용</span>
            </label>
            <button type="button" className={styles.iconButton} onClick={() => addNotch('left')} title="따내기 추가">
              <Plus size={16} />
            </button>
          </div>

          <p className={styles.thumbnailHint}>
            개수를 올리면 높이 기준 균등 위치로 추가되고, 각 따내기의 바닥 기준 위치·높이·깊이를 아래에서
            수정할 수 있습니다. 따내기마다 목찬넬 ㄱ자 프레임(PET) + 가로전대(PB)가 자동 포함됩니다.
            (표준 목찬넬 65×40 · 좌우 개별 모드는 따내기만 생성)
          </p>

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

          {/* === 하부장 외부서랍 (일반 / 레그라박스) === */}
          {category === 'lower' && (
            <details className={styles.collapse}>
              <summary className={styles.collapseSummary}>
                <span>외부서랍</span>
                <em>
                  {useExternalDrawers
                    ? (extDrawerType === 'legrabox' ? `레그라박스 ${legraRows.length}단` : `일반 ${extDrawerCount}단`)
                    : '미사용'}
                </em>
              </summary>
              <div className={styles.collapseBody}>
              <label className={styles.checkboxInline}>
                <input
                  type="checkbox"
                  checked={useExternalDrawers}
                  onChange={(event) => {
                    setUseExternalDrawers(event.target.checked);
                    if (event.target.checked) {
                      // 외부서랍장 표준 구조: 마이다 공식이 상단 따내기(목찬넬)를 전제 — 켜면 자동 동반
                      if (!hasTopPanel) setTopChannelEnabled(true);
                      // 단수만큼 zone이 나뉘도록 중간 따내기 자동 동기화
                      if (extDrawerType !== 'legrabox') syncExternalDrawerNotches(extDrawerCount);
                    }
                  }}
                />
                <span>외부서랍 사용</span>
              </label>

              {useExternalDrawers && (
                <div className={styles.sectionFields} style={{ marginTop: 10 }}>
                  <label className={styles.compactField}>
                    <span>서랍 타입</span>
                    <select value={extDrawerType} onChange={(event) => setExtDrawerType(event.target.value as 'external' | 'legrabox')}>
                      <option value="external">일반 외부서랍 (마이다 + 레일)</option>
                      <option value="legrabox">레그라박스 (터치)</option>
                    </select>
                  </label>
                </div>
              )}

              {useExternalDrawers && extDrawerType === 'legrabox' && (
                <div className={styles.sectionCard} style={{ marginTop: 10 }}>
                  <div className={styles.sectionCardHeader}>
                    <div>
                      <span className={styles.sectionBadge}>레그라박스 서랍 (아래 → 위)</span>
                    </div>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => setLegraRows(rows => {
                        const last = rows[rows.length - 1];
                        const lastHeight = last ? (last.type === 'N' ? 55 : last.type === 'M' ? 117 : last.type === 'L' ? 164 : 228) : 0;
                        const sideH = (last?.type || 'F') === 'N' ? 66.5 : (last?.type || 'F') === 'M' ? 128.5 : (last?.type || 'F') === 'L' ? 177 : 241;
                        const maxOffset = Math.max(0, height - panelThickness * 2 - sideH);
                        return [...rows, {
                          id: `legra-${Date.now()}-${rows.length}`,
                          type: last?.type || 'F',
                          offsetMm: Math.min(last ? last.offsetMm + lastHeight + 150 : 28, maxOffset)
                        }];
                      })}
                      title="서랍 추가"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className={styles.sectionFields}>
                    {legraRows.map((row, rowIndex) => (
                      <Fragment key={row.id}>
                        <label className={styles.compactField}>
                          <span>서랍 {rowIndex + 1} 레그라 종류</span>
                          <select
                            value={row.type}
                            onChange={(event) => setLegraRows(rows => rows.map(item => (
                              item.id === row.id ? { ...item, type: event.target.value as 'M' | 'L' | 'F' | 'N' } : item
                            )))}
                          >
                            <option value="N">특소 (N) — 본체 55 · 측판 66.5</option>
                            <option value="M">소 (M) — 본체 117 · 측판 128.5</option>
                            <option value="L">중 (L) — 본체 164 · 측판 177</option>
                            <option value="F">대 (F) — 본체 228 · 측판 241</option>
                          </select>
                        </label>
                        <label className={styles.compactField}>
                          <span>서랍 {rowIndex + 1} 이격(mm, 바닥판 위)</span>
                          <input
                            type="number"
                            min={0}
                            value={row.offsetMm}
                            onChange={(event) => setLegraRows(rows => rows.map(item => (
                              item.id === row.id ? { ...item, offsetMm: Number(event.target.value) } : item
                            )))}
                          />
                        </label>
                        <div className={styles.compactField} style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            disabled={legraRows.length <= 1}
                            onClick={() => setLegraRows(rows => rows.length > 1 ? rows.filter(item => item.id !== row.id) : rows)}
                            title="서랍 삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                  <div className={styles.sectionFields}>
                    <label className={styles.compactField}>
                      <span>마이다 상단갭(mm)</span>
                      <input type="number" value={legraTopGap} onChange={(event) => setLegraTopGap(Number(event.target.value))} />
                    </label>
                    <label className={styles.compactField}>
                      <span>마이다 하단갭(mm)</span>
                      <input type="number" value={legraBottomGap} onChange={(event) => setLegraBottomGap(Number(event.target.value))} />
                    </label>
                    <label className={styles.compactField}>
                      <span>마이다 사이갭(mm)</span>
                      <input type="number" min={0} value={legraMaidaGap} onChange={(event) => setLegraMaidaGap(Math.max(0, Number(event.target.value)))} />
                    </label>
                  </div>
                  <p className={styles.thumbnailHint}>
                    마이다는 서랍 본체 높이 비례로 자동 분할됩니다. 표준 예 — 터치 2단: F+F, 이격 28/406 ·
                    터치 3단: F+M+M, 이격 28/357/587. 갭 표준 -20/5 — 마이다 상단 = H−20 (목찬넬 아래).
                    도어올림형(본체 위로 올림)을 원하면 상단갭 +30.
                  </p>
                </div>
              )}

              {useExternalDrawers && extDrawerType === 'external' && (
                <div className={styles.sectionCard}>
                  <div className={styles.sectionFields}>
                    <label className={styles.compactField}>
                      <span>서랍 단수</span>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={extDrawerCount}
                        onChange={(event) => {
                          const nextCount = Number(event.target.value);
                          setExtDrawerCount(nextCount);
                          // 단수만큼 zone이 나뉘도록 중간 따내기를 표준 공식 위치로 자동 동기화
                          syncExternalDrawerNotches(nextCount);
                        }}
                      />
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
                    <label className={styles.compactField}>
                      <span>마이다 사이갭(mm)</span>
                      <input type="number" min={0} value={extMaidaGap} onChange={(event) => setExtMaidaGap(Math.max(0, Number(event.target.value)))} />
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

        </fieldset>

        <section className={styles.previewPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>실시간 미리보기</h2>
              <p className={styles.panelHint}>실제 뷰어 렌더러로 표시됩니다 — 배치 결과와 동일</p>
            </div>
            <div className={styles.previewControls}>
              <button
                type="button"
                className={`${styles.scanButton} ${scanMode ? styles.scanButtonActive : ''}`}
                onClick={() => setScanMode(mode => {
                  if (mode) useUIStore.getState().setLiveDimensionSelectedKey(null);
                  return !mode;
                })}
                title="뷰어에서 패널 클릭 = 패널/따내기/홈 치수 표시 (에디터 스캔모드와 동일)"
              >
                패널 스캔
              </button>
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={previewView === '3D' ? styles.viewToggleActive : ''}
                  onClick={() => setPreviewView('3D')}
                >
                  3D
                </button>
                <button
                  type="button"
                  className={previewView === 'front' ? styles.viewToggleActive : ''}
                  onClick={() => setPreviewView('front')}
                  title="입면 (정면)"
                >
                  입면
                </button>
                <button
                  type="button"
                  className={previewView === 'top' ? styles.viewToggleActive : ''}
                  onClick={() => setPreviewView('top')}
                  title="평면 (위)"
                >
                  평면
                </button>
                <button
                  type="button"
                  className={previewView === 'left' ? styles.viewToggleActive : ''}
                  onClick={() => setPreviewView('left')}
                  title="측면 (좌측)"
                >
                  측면
                </button>
              </div>
              <label className={styles.checkboxInline}>
                <input
                  type="checkbox"
                  checked={hasDoor}
                  onChange={(event) => setHasDoor(event.target.checked)}
                />
                <span>도어 설치</span>
              </label>
              <label className={styles.checkboxInline}>
                <input
                  type="checkbox"
                  checked={previewDoorsOpen}
                  disabled={!hasDoor && !useExternalDrawers}
                  onChange={(event) => setPreviewDoorsOpen(event.target.checked)}
                />
                <span>도어·서랍 열림</span>
              </label>
            </div>
          </div>

          <div className={styles.livePreviewArea}>
            <div className={styles.previewMeta}>
              <strong>{moduleDraft.name}</strong>
              <span>W {width} · H {height} · D {depth}{isDynamic ? ' · 동적 폭' : ''}</span>
            </div>


            <div className={styles.threePreviewFrame}>
              <AdminModulePreview
                moduleData={moduleDraft as ModuleData}
                highlightedPanelName={highlightedPanelName}
                viewMode={previewViewMode}
                direction2D={previewView === '3D' ? 'front' : previewView}
                scanMode={scanMode}
              />
            </div>

          </div>
        </section>

        {/* 패널목록 — 우측 좁은 컬럼 (행 클릭: 뷰어 강조 / 체크박스 해제: 뷰어에서 숨김) */}
        <aside className={styles.panelListColumn}>
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
                  onClick={() => {
                    // 행 클릭 = 뷰어 강조 + 스캔모드 치수 표시 (뷰어에서 클릭한 것과 동일)
                    if (isActive) {
                      setHighlightedPanelName(null);
                      useUIStore.getState().setLiveDimensionSelectedKey(null);
                      return;
                    }
                    setHighlightedPanelName(name);
                    setScanMode(true);
                    useUIStore.getState().setLiveDimensionSelectedKey(`${ADMIN_PREVIEW_FURNITURE_ID}::${name}`);
                  }}
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
        </aside>
      </div>
    </div>
  );
};

export default ModuleBuilder;
