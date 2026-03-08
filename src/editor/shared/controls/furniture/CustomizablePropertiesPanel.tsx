import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { CustomFurnitureConfig, CustomSection, CustomElement, AreaSubSplit } from '@/editor/shared/furniture/types';
import { getCustomizableCategory } from './CustomizableFurnitureLibrary';
import styles from './CustomizablePropertiesPanel.module.css';

/**
 * 커스터마이징 가구 편집 패널
 * activePopup.type === 'customizableEdit' 일 때 렌더링
 */
const CustomizablePropertiesPanel: React.FC = () => {
  const { activePopup, closeAllPopups, openCustomizableEditPopup, setHighlightedSection } = useUIStore();
  const { placedModules, updatePlacedModule, removeModule } = useFurnitureStore();
  const { saveCabinet } = useMyCabinetStore();

  const moduleId = activePopup.id;
  const placedModule = placedModules.find((m) => m.id === moduleId);
  // sectionIndex가 있으면 톱니 아이콘 클릭 → 해당 섹션 세부설정만 표시
  const focusedSectionIndex = activePopup.sectionIndex;
  // areaSide가 있으면 칸막이 좌/우 중 특정 영역만 편집
  const focusedAreaSide = activePopup.areaSide;
  // 편집용 로컬 상태 (customConfig 복사본)
  const [config, setConfig] = useState<CustomFurnitureConfig | null>(null);

  // 너비/깊이 입력용 문자열 상태 (기존 가구 패턴과 동일)
  const [widthInput, setWidthInput] = useState<string>('');
  const [depthInput, setDepthInput] = useState<string>('');
  const [widthError, setWidthError] = useState<string>('');
  const [depthError, setDepthError] = useState<string>('');
  // 섹션 높이 입력용 문자열 상태 (직접 바인딩 시 입력 불가 문제 방지)
  const [sectionHeightInputs, setSectionHeightInputs] = useState<Record<number, string>>({});
  // 선반/서랍 높이 입력용 문자열 상태 (숫자 입력 시 전체 삭제 가능하도록)
  const [heightInputs, setHeightInputs] = useState<Record<string, string>>({});
  // 선반 위치 기준 (위에서/아래에서) - 키: "sIdx-side-hIdx"
  const [shelfRefDir, setShelfRefDir] = useState<Record<string, 'top' | 'bottom'>>({});
  // 칸막이 좌/우 거리 입력용 문자열 상태 - 키: "sIdx-left" / "sIdx-right"
  const [partitionInputs, setPartitionInputs] = useState<Record<string, string>>({});
  // 영역 서브분할 높이 입력 - 키: "sIdx-areaKey"
  const [subSplitHeightInputs, setSubSplitHeightInputs] = useState<Record<string, string>>({});

  // 팝업 열릴 때 config 및 입력값 초기화
  useEffect(() => {
    if (placedModule?.customConfig) {
      const cfg = JSON.parse(JSON.stringify(placedModule.customConfig)) as CustomFurnitureConfig;
      setConfig(cfg);
      // 섹션 높이 입력 초기화
      const sectionHInputs: Record<number, string> = {};
      cfg.sections.forEach((s, i) => { sectionHInputs[i] = s.height.toString(); });
      setSectionHeightInputs(sectionHInputs);
      // 선반/서랍 높이 입력 초기화
      const hInputs: Record<string, string> = {};
      cfg.sections.forEach((s, sIdx) => {
        const initElements = (elements: CustomElement[] | undefined, prefix: string) => {
          elements?.forEach((el, eIdx) => {
            if ((el.type === 'shelf' || el.type === 'drawer') && 'heights' in el) {
              el.heights.forEach((h, hIdx) => {
                hInputs[`${prefix}-${eIdx}-${hIdx}`] = h.toString();
              });
            }
          });
        };
        initElements(s.elements, `${sIdx}-full`);
        initElements(s.leftElements, `${sIdx}-left`);
        initElements(s.rightElements, `${sIdx}-right`);
      });
      setHeightInputs(hInputs);
      setShelfRefDir({});
      // 칸막이 좌/우 입력 초기화
      const pInputs: Record<string, string> = {};
      const iW = (placedModule?.freeWidth || placedModule?.moduleWidth || 600) - 2 * (cfg.panelThickness || 18);
      cfg.sections.forEach((s, sIdx) => {
        if (s.hasPartition && s.partitionPosition) {
          pInputs[`${sIdx}-left`] = s.partitionPosition.toString();
          pInputs[`${sIdx}-right`] = Math.round(iW - s.partitionPosition).toString();
        }
      });
      setPartitionInputs(pInputs);
    }
    if (placedModule) {
      const w = placedModule.freeWidth || placedModule.moduleWidth || 600;
      const d = placedModule.freeDepth || 580;
      setWidthInput(w.toString());
      setDepthInput(d.toString());
      setWidthError('');
      setDepthError('');
    }
  }, [placedModule?.id]);

  // config 업데이트 + 즉시 store 반영 (useCallback은 조건부 return 전에 호출해야 함)
  const applyConfig = useCallback(
    (newConfig: CustomFurnitureConfig) => {
      setConfig(newConfig);
      if (moduleId) {
        updatePlacedModule(moduleId, { customConfig: newConfig });
      }
    },
    [moduleId, updatePlacedModule],
  );

  // 팝업 닫힐 때 하이라이트 해제
  useEffect(() => {
    return () => setHighlightedSection(null);
  }, [setHighlightedSection]);

  // screenX/screenY가 있으면 가구 우측에 붙여서 표시 (hooks는 조건부 return 전에 호출)
  const panelStyle = useMemo<React.CSSProperties>(() => {
    const sx = activePopup.screenX;
    const sy = activePopup.screenY;
    const isMainPopup = activePopup.sectionIndex === undefined;
    if (sx != null) {
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(sx, window.innerWidth - 350));
      if (isMainPopup) {
        // 메인 팝업: 가구 우측, 화면 세로 중앙
        return { top: '50%', left, right: 'auto', transform: 'translateY(-50%)', maxHeight: vh - 24 };
      }
      // 섹션 팝업: 아이콘 Y 기준
      const top = Math.max(8, Math.min(sy ?? vh / 2, vh - 200));
      const maxHeight = vh - top - 8;
      return { top, left, right: 'auto', transform: 'none', maxHeight };
    }
    return {};
  }, [activePopup.screenX, activePopup.screenY, activePopup.sectionIndex]);

  // 렌더링 조건 체크 (모든 hooks 호출 이후)
  if (activePopup.type !== 'customizableEdit' || !moduleId || !placedModule || !config) {
    return null;
  }

  const furnitureWidth = placedModule.freeWidth || placedModule.moduleWidth || 600;
  const furnitureHeight = placedModule.freeHeight || 2000;
  const furnitureDepth = placedModule.freeDepth || 580;
  const panelThickness = config.panelThickness || 18;

  // 내부 유효 높이 (상하판 두께 제외)
  const innerHeight = furnitureHeight - 2 * panelThickness;

  // 너비/깊이 범위 (기존 가구와 동일 패턴)
  const MIN_WIDTH = 150;
  const MAX_WIDTH = 2400;
  const MIN_DEPTH = 200;
  const MAX_DEPTH = 800;

  // 너비 입력 핸들러 (숫자와 빈 문자열만 허용)
  const handleWidthInputChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setWidthInput(value);
      setWidthError('');
    }
  };

  // 너비 확정 (onBlur / Enter)
  const handleWidthInputBlur = () => {
    if (widthInput === '') {
      setWidthInput(furnitureWidth.toString());
      return;
    }
    const num = parseInt(widthInput, 10);
    if (num < MIN_WIDTH) {
      setWidthError(`최소 ${MIN_WIDTH}mm`);
      setWidthInput(furnitureWidth.toString());
    } else if (num > MAX_WIDTH) {
      setWidthError(`최대 ${MAX_WIDTH}mm`);
      setWidthInput(furnitureWidth.toString());
    } else {
      setWidthError('');
      updatePlacedModule(moduleId, { freeWidth: num, moduleWidth: num });
    }
  };

  // 깊이 입력 핸들러
  const handleDepthInputChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setDepthInput(value);
      setDepthError('');
    }
  };

  // 깊이 확정 (onBlur / Enter)
  const handleDepthInputBlur = () => {
    if (depthInput === '') {
      setDepthInput(furnitureDepth.toString());
      return;
    }
    const num = parseInt(depthInput, 10);
    if (num < MIN_DEPTH) {
      setDepthError(`최소 ${MIN_DEPTH}mm`);
      setDepthInput(furnitureDepth.toString());
    } else if (num > MAX_DEPTH) {
      setDepthError(`최대 ${MAX_DEPTH}mm`);
      setDepthInput(furnitureDepth.toString());
    } else {
      setDepthError('');
      updatePlacedModule(moduleId, { freeDepth: num });
    }
  };

  // Enter 키 핸들러
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  // 섹션 높이 ArrowUp/ArrowDown 키 핸들러 (1mm 단위, Shift 10mm)
  const handleSectionHeightKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    if (config.sections.length !== 2) return;

    const step = e.shiftKey ? 10 : 1;
    const delta = e.key === 'ArrowUp' ? step : -step;
    const availableHeight = furnitureHeight - 4 * panelThickness;
    const current = config.sections[idx].height;
    const clamped = Math.max(100, Math.min(availableHeight - 100, current + delta));
    if (clamped === current) return;

    const otherH = availableHeight - clamped;
    const sections = [...config.sections];
    sections[idx] = { ...sections[idx], height: clamped };
    sections[1 - idx] = { ...sections[1 - idx], height: otherH };

    // 서랍 높이 재계산
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const sec = sections[sIdx];
      const el = sec.elements?.[0];
      if (el?.type === 'drawer' && 'heights' in el) {
        const newH = sections[sIdx].height;
        const gapTotal = 23.6 * (el.heights.length + 1);
        const usable = Math.max(newH - gapTotal, el.heights.length * 80);
        const perDrawer = Math.round(usable / el.heights.length);
        sections[sIdx] = {
          ...sec,
          elements: [{ type: 'drawer', heights: Array.from({ length: el.heights.length }, () => perDrawer) }],
        };
      }
    }

    applyConfig({ ...config, sections });
    setSectionHeightInputs({ [idx]: clamped.toString(), [1 - idx]: otherH.toString() });
  };

  // 섹션 분할 (상/하 분할만 지원)
  const handleSectionSplit = (split: boolean) => {
    if (split) {
      const availableHeight = furnitureHeight - 4 * panelThickness;
      const halfH = Math.round(availableHeight / 2);
      applyConfig({
        ...config,
        splitDirection: 'topBottom',
        splitPosition: halfH,
        sections: [
          { id: 'section-lower', height: halfH, elements: [{ type: 'open' }] },
          { id: 'section-upper', height: availableHeight - halfH, elements: [{ type: 'open' }] },
        ],
      });
      setSectionHeightInputs({ 0: halfH.toString(), 1: (availableHeight - halfH).toString() });
    } else {
      // 분할 해제 → 단일 섹션
      applyConfig({
        ...config,
        splitDirection: undefined,
        splitPosition: undefined,
        sections: [{ id: 'section-0', height: innerHeight, elements: config.sections[0]?.elements || [{ type: 'open' }] }],
      });
      setSectionHeightInputs({ 0: innerHeight.toString() });
    }
  };

  // 섹션 높이 입력 변경 (문자열 state만 업데이트, 확정은 blur에서)
  const handleSectionHeightInputChange = (idx: number, value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setSectionHeightInputs((prev) => ({ ...prev, [idx]: value }));
    }
  };

  // 섹션 높이 확정 (onBlur / Enter)
  const handleSectionHeightBlur = (idx: number) => {
    if (config.sections.length !== 2) return;
    const availableHeight = furnitureHeight - 4 * panelThickness;
    const raw = sectionHeightInputs[idx] ?? '';
    if (raw === '') {
      // 빈 값이면 원래 값으로 복원
      setSectionHeightInputs((prev) => ({ ...prev, [idx]: config.sections[idx].height.toString() }));
      return;
    }
    const num = parseInt(raw, 10);
    const clamped = Math.max(100, Math.min(availableHeight - 100, num));
    const otherH = availableHeight - clamped;
    const sections = [...config.sections];
    sections[idx] = { ...sections[idx], height: clamped };
    sections[1 - idx] = { ...sections[1 - idx], height: otherH };

    // 서랍이 설정된 섹션의 높이가 변경되면 서랍 높이 재계산
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const sec = sections[sIdx];
      const el = sec.elements?.[0];
      if (el?.type === 'drawer' && 'heights' in el) {
        const newH = sIdx === idx ? clamped : otherH;
        const gapTotal = 23.6 * (el.heights.length + 1);
        const usable = Math.max(newH - gapTotal, el.heights.length * 80);
        const perDrawer = Math.round(usable / el.heights.length);
        sections[sIdx] = {
          ...sec,
          elements: [{ type: 'drawer', heights: Array.from({ length: el.heights.length }, () => perDrawer) }],
        };
      }
    }

    applyConfig({ ...config, sections });
    setSectionHeightInputs({ [idx]: clamped.toString(), [1 - idx]: otherH.toString() });
  };

  // 기존 모듈 기준 서랍 단수별 표준 사양 (shelving.ts FURNITURE_SPECS 참조)
  // sectionHeight는 외경(패널 포함) 기준
  const DRAWER_STANDARD: Record<number, { sectionHeight: number; heights: number[] }> = {
    1: { sectionHeight: 321, heights: [255] },
    2: { sectionHeight: 600, heights: [255, 255] },
    3: { sectionHeight: 800, heights: [255, 255, 176] },
    4: { sectionHeight: 1000, heights: [255, 255, 176, 176] },
  };

  // 섹션 타입 변경 (연필 메뉴용) — 서랍 선택 시 단수도 함께 처리
  const handleSectionTypeChange = (sIdx: number, elementType: CustomElement['type'], drawerCount?: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };

    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(sec.height / 2)] };
        break;
      case 'drawer': {
        const count = drawerCount || 2;
        const standard = DRAWER_STANDARD[count] || DRAWER_STANDARD[2];
        // 서랍 단수에 따라 하부 섹션 높이 자동 조절 (2단 분할 시)
        // sectionHeight는 외경(패널 포함)이므로 내경(sec.height)으로 변환: 외경 - 2 * panelThickness
        if (config.sections.length === 2 && sIdx === 0) {
          const availableHeight = furnitureHeight - 4 * panelThickness;
          const lowerInner = standard.sectionHeight - 2 * panelThickness;
          const lowerH = Math.min(lowerInner, availableHeight - 100);
          const upperH = availableHeight - lowerH;
          sec.height = lowerH;
          sections[1] = { ...sections[1], height: upperH };
          setSectionHeightInputs({ 0: lowerH.toString(), 1: upperH.toString() });
        }
        // 기존 모듈과 동일한 개별 서랍 높이 적용
        newElement = { type: 'drawer', heights: [...standard.heights] };
        break;
      }
      case 'rod':
        newElement = { type: 'rod', height: Math.round(sec.height * 0.85) };
        break;
      case 'pants':
        newElement = { type: 'pants', height: Math.round(sec.height * 0.85) };
        break;
      default:
        newElement = { type: 'open' };
    }

    sec.elements = [newElement];
    sec.hasPartition = false;
    sec.partitionPosition = undefined;
    sec.leftElements = undefined;
    sec.rightElements = undefined;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
    // heightInputs 동기화
    if ('heights' in newElement) {
      const newHInputs: Record<string, string> = {};
      newElement.heights.forEach((h, hIdx) => {
        newHInputs[`${sIdx}-full-0-${hIdx}`] = h.toString();
      });
      setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
    }
  };

  // 현재 섹션의 주요 타입과 서랍 단수 추출
  const getSectionTypeInfo = (section: CustomSection) => {
    const el = section.elements?.[0] || section.leftElements?.[0] || { type: 'open' as const };
    const type = el.type;
    const drawerCount = type === 'drawer' && 'heights' in el ? el.heights.length : 0;
    return { type, drawerCount };
  };

  // 칸막이 토글
  const handlePartitionToggle = (sIdx: number, hasPartition: boolean) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    if (hasPartition) {
      const innerW = furnitureWidth - 2 * panelThickness;
      const halfW = Math.round(innerW / 2);
      sec.hasPartition = true;
      sec.partitionPosition = halfW;
      sec.leftElements = sec.elements || [{ type: 'open' }];
      sec.rightElements = [{ type: 'open' }];
      sec.elements = undefined;
      // 칸막이 좌/우 입력 초기화
      setPartitionInputs((prev) => ({
        ...prev,
        [`${sIdx}-left`]: halfW.toString(),
        [`${sIdx}-right`]: (innerW - halfW).toString(),
      }));
    } else {
      sec.hasPartition = false;
      sec.partitionPosition = undefined;
      sec.elements = sec.leftElements || [{ type: 'open' }];
      sec.leftElements = undefined;
      sec.rightElements = undefined;
    }
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 칸막이 위치 변경
  const handlePartitionPosition = (sIdx: number, pos: number) => {
    const sections = [...config.sections];
    sections[sIdx] = { ...sections[sIdx], partitionPosition: pos };
    applyConfig({ ...config, sections });
  };

  // 영역별 상하 서브분할 토글
  const handleAreaSubSplitToggle = (sIdx: number, areaKey: 'full' | 'left' | 'right', enabled: boolean) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    if (enabled) {
      const halfH = Math.round(sec.height / 2);
      // 기존 요소를 하부로 이동
      const existingElements = areaKey === 'full'
        ? sec.elements || [{ type: 'open' as const }]
        : areaKey === 'left'
          ? sec.leftElements || [{ type: 'open' as const }]
          : sec.rightElements || [{ type: 'open' as const }];
      subSplits[areaKey] = {
        enabled: true,
        lowerHeight: halfH,
        lowerElements: existingElements,
        upperElements: [{ type: 'open' }],
      };
    } else {
      // 서브분할 해제: 하부 요소를 원래 영역으로 복원
      const sub = subSplits[areaKey];
      const restoredElements = sub?.lowerElements || [{ type: 'open' as const }];
      if (areaKey === 'full') {
        sec.elements = restoredElements;
      } else if (areaKey === 'left') {
        sec.leftElements = restoredElements;
      } else {
        sec.rightElements = restoredElements;
      }
      delete subSplits[areaKey];
    }
    sec.areaSubSplits = Object.keys(subSplits).length > 0 ? subSplits : undefined;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 영역별 서브분할 높이 변경
  const handleAreaSubSplitHeight = (sIdx: number, areaKey: string, lowerHeight: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    const sub = subSplits[areaKey];
    if (sub) {
      subSplits[areaKey] = { ...sub, lowerHeight };
      sec.areaSubSplits = subSplits;
      sections[sIdx] = sec;
      applyConfig({ ...config, sections });
    }
  };

  // 서브분할 요소 변경
  const handleSubSplitElementChange = (
    sIdx: number,
    areaKey: string,
    subPart: 'upper' | 'lower',
    elementType: CustomElement['type'],
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    const sub = subSplits[areaKey];
    if (!sub) return;

    const subHeight = subPart === 'lower' ? sub.lowerHeight : sec.height - sub.lowerHeight;
    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(subHeight / 2)] };
        break;
      case 'drawer': {
        const gapTotal = 23.6 * 2;
        const usable = Math.max(subHeight - gapTotal, 80);
        newElement = { type: 'drawer', heights: [Math.round(usable)] };
        break;
      }
      case 'rod':
        newElement = { type: 'rod', height: Math.round(subHeight * 0.85) };
        break;
      case 'pants':
        newElement = { type: 'pants', height: Math.round(subHeight * 0.85) };
        break;
      default:
        newElement = { type: 'open' };
    }
    subSplits[areaKey] = {
      ...sub,
      [subPart === 'upper' ? 'upperElements' : 'lowerElements']: [newElement],
    };
    sec.areaSubSplits = subSplits;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 요소 타입 변경
  const handleElementChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    elementType: CustomElement['type'],
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const sectionHeight = sec.height;

    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(sectionHeight / 2)] };
        break;
      case 'drawer': {
        const gapTotal = 23.6 * 2; // 1단 서랍 기본: 상하 gap
        const usable = Math.max(sectionHeight - gapTotal, 80);
        newElement = { type: 'drawer', heights: [Math.round(usable)] };
        break;
      }
      case 'rod':
        newElement = { type: 'rod', height: Math.round(sectionHeight * 0.85) };
        break;
      case 'pants':
        newElement = { type: 'pants', height: Math.round(sectionHeight * 0.85) };
        break;
      default:
        newElement = { type: 'open' };
    }

    if (side === 'full') {
      sec.elements = [newElement];
    } else if (side === 'left') {
      sec.leftElements = [newElement];
    } else {
      sec.rightElements = [newElement];
    }
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
    // heightInputs 동기화
    if ('heights' in newElement) {
      const newHInputs: Record<string, string> = {};
      newElement.heights.forEach((h, hIdx) => {
        newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
      });
      setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
    }
  };

  // 선반/서랍 높이 입력 변경 (문자열 상태만 업데이트, 확정은 blur에서)
  const handleHeightInputChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    value: string,
  ) => {
    if (value === '' || /^\d+$/.test(value)) {
      const key = `${sIdx}-${side}-0-${heightIdx}`;
      setHeightInputs((prev) => ({ ...prev, [key]: value }));
    }
  };

  // 선반/서랍 높이 확정 (onBlur / Enter)
  const handleHeightInputBlur = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    sectionHeight: number,
  ) => {
    const key = `${sIdx}-${side}-0-${heightIdx}`;
    const raw = heightInputs[key] ?? '';

    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];
    const el = elements[0];

    if (!el || (el.type !== 'shelf' && el.type !== 'drawer')) return;

    if (raw === '') {
      // 빈 값이면 원래 값으로 복원
      setHeightInputs((prev) => ({ ...prev, [key]: el.heights[heightIdx]?.toString() || '0' }));
      return;
    }

    let num = parseInt(raw, 10);

    // 선반 "위에서" 기준일 경우 변환
    const refKey = `${sIdx}-${side}-${heightIdx}`;
    const refDir = shelfRefDir[refKey] || 'bottom';
    if (el.type === 'shelf' && refDir === 'top') {
      num = sectionHeight - num;
    }

    if (el.type === 'drawer') {
      // 서랍: 개별 높이 변경 시 나머지 서랍에 잔여 높이 재분배
      const gapPerDrawer = 23.6; // DrawerRenderer의 gapHeight와 동일
      const totalGap = gapPerDrawer * (el.heights.length + 1);
      const usableHeight = sectionHeight - totalGap;
      const minDrawerH = 80;
      const clamped = Math.max(minDrawerH, Math.min(usableHeight - minDrawerH * (el.heights.length - 1), num));

      const heights = [...el.heights];
      heights[heightIdx] = clamped;

      // 나머지 서랍에 잔여 높이 균등 재분배
      const othersCount = heights.length - 1;
      if (othersCount > 0) {
        const remaining = usableHeight - clamped;
        const perOther = Math.max(minDrawerH, Math.round(remaining / othersCount));
        for (let i = 0; i < heights.length; i++) {
          if (i !== heightIdx) heights[i] = perOther;
        }
      }

      elements[0] = { ...el, heights };

      if (side === 'full') sec.elements = elements;
      else if (side === 'left') sec.leftElements = elements;
      else sec.rightElements = elements;

      sections[sIdx] = sec;
      applyConfig({ ...config, sections });

      // heightInputs 전체 갱신
      const newHInputs: Record<string, string> = {};
      heights.forEach((h, hIdx) => {
        newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
      });
      setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
      return;
    }

    const clamped = Math.max(50, Math.min(sectionHeight, num));
    const heights = [...el.heights];
    heights[heightIdx] = clamped;
    elements[0] = { ...el, heights };

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });

    // 표시값도 갱신 (기준 방향에 따라)
    const displayVal = el.type === 'shelf' && refDir === 'top' ? sectionHeight - clamped : clamped;
    setHeightInputs((prev) => ({ ...prev, [key]: displayVal.toString() }));
  };

  // 선반 위치 기준 토글 (위에서 ↔ 아래에서)
  const handleShelfRefDirChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    dir: 'top' | 'bottom',
    storedValue: number,
    sectionHeight: number,
  ) => {
    const refKey = `${sIdx}-${side}-${heightIdx}`;
    const inputKey = `${sIdx}-${side}-0-${heightIdx}`;
    setShelfRefDir((prev) => ({ ...prev, [refKey]: dir }));
    // 표시값 변환
    const displayVal = dir === 'top' ? sectionHeight - storedValue : storedValue;
    setHeightInputs((prev) => ({ ...prev, [inputKey]: displayVal.toString() }));
  };

  // 선반/서랍 추가
  const handleAddHeight = (sIdx: number, side: 'full' | 'left' | 'right') => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    const el = elements[0];
    if (el && (el.type === 'shelf' || el.type === 'drawer')) {
      if (el.type === 'shelf') {
        // 선반: 균등 간격으로 재분배
        const newCount = el.heights.length + 1;
        const newHeights = Array.from({ length: newCount }, (_, i) =>
          Math.round(sec.height * (i + 1) / (newCount + 1))
        );
        elements[0] = { ...el, heights: newHeights };
        // heightInputs 전체 갱신
        const newHInputs: Record<string, string> = {};
        newHeights.forEach((h, hIdx) => {
          newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
        });
        setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
      } else {
        // 서랍: 기존 방식 (마지막 높이 + 200)
        const lastH = el.heights[el.heights.length - 1] || Math.round(sec.height / 3);
        const newH = lastH + 200;
        const newIdx = el.heights.length;
        elements[0] = { ...el, heights: [...el.heights, newH] };
        const key = `${sIdx}-${side}-0-${newIdx}`;
        setHeightInputs((prev) => ({ ...prev, [key]: newH.toString() }));
      }
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반/서랍 제거
  const handleRemoveHeight = (sIdx: number, side: 'full' | 'left' | 'right', heightIdx: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    const el = elements[0];
    if (el && (el.type === 'shelf' || el.type === 'drawer') && el.heights.length > 1) {
      if (el.type === 'shelf') {
        // 선반: 제거 후 균등 간격으로 재분배
        const newCount = el.heights.length - 1;
        const newHeights = Array.from({ length: newCount }, (_, i) =>
          Math.round(sec.height * (i + 1) / (newCount + 1))
        );
        elements[0] = { ...el, heights: newHeights };
        // heightInputs 전체 갱신
        const newHInputs: Record<string, string> = {};
        newHeights.forEach((h, hIdx) => {
          newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
        });
        setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
      } else {
        const heights = el.heights.filter((_, i) => i !== heightIdx);
        elements[0] = { ...el, heights };
      }
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반 옷봉 토글
  const handleShelfRodToggle = (sIdx: number, side: 'full' | 'left' | 'right', hasRod: boolean) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    if (elements[0]?.type === 'shelf') {
      elements[0] = { ...elements[0], hasRod };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // My캐비닛에 저장
  const handleSaveToCabinet = async () => {
    const name = window.prompt('My캐비닛에 저장할 이름을 입력하세요:', config.sections.length > 1 ? '커스텀 2단 캐비닛' : '커스텀 캐비닛');
    if (!name) return;

    const category = getCustomizableCategory(placedModule.moduleId);
    const { error } = await saveCabinet({
      name,
      category,
      width: furnitureWidth,
      height: furnitureHeight,
      depth: furnitureDepth,
      customConfig: config,
    });

    if (error) {
      alert(error);
    } else {
      alert('My캐비닛에 저장되었습니다.');
    }
  };

  // 가구 삭제
  const handleDelete = () => {
    removeModule(moduleId);
    closeAllPopups();
  };

  // 요소 편집 UI 렌더링
  const renderElementEditor = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    elements: CustomElement[] | undefined,
    sectionHeight: number,
  ) => {
    const el = elements?.[0] || { type: 'open' as const };
    const currentType = el.type;

    // 상부섹션(sIdx===1, 2단분할)에는 서랍 불가
    const isUpperSection = config.sections.length > 1 && sIdx === 1;
    const availableTypes = isUpperSection
      ? (['open', 'shelf', 'rod'] as const)
      : (['open', 'shelf', 'drawer', 'rod', 'pants'] as const);

    return (
      <div>
        <div className={styles.elementSelector}>
          {availableTypes.map((type) => (
            <button
              key={type}
              className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
              onClick={() => handleElementChange(sIdx, side, type)}
            >
              {type === 'open' ? '비움' : type === 'shelf' ? '선반' : type === 'drawer' ? '서랍' : type === 'rod' ? '옷봉' : '바지걸이'}
            </button>
          ))}
        </div>

        {/* 선반/서랍 높이 목록 */}
        {(currentType === 'shelf' || currentType === 'drawer') && 'heights' in el && (
          <div>
            <div className={styles.heightList}>
              {el.heights.map((h, hi) => {
                const inputKey = `${sIdx}-${side}-0-${hi}`;
                const refKey = `${sIdx}-${side}-${hi}`;
                const refDir = shelfRefDir[refKey] || 'bottom';
                const displayVal = heightInputs[inputKey] ?? (
                  currentType === 'shelf' && refDir === 'top'
                    ? (sectionHeight - h).toString()
                    : h.toString()
                );

                return (
                  <div key={hi} className={styles.heightItem}>
                    <span className={styles.heightIndex}>{hi + 1}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`${styles.input} ${styles.inputSmall}`}
                      value={displayVal}
                      onChange={(e) => handleHeightInputChange(sIdx, side, hi, e.target.value)}
                      onBlur={() => handleHeightInputBlur(sIdx, side, hi, sectionHeight)}
                      onKeyDown={handleInputKeyDown}
                    />
                    <span className={styles.unit}>mm</span>
                    {/* 선반: 위에서/아래에서 기준 선택 */}
                    {currentType === 'shelf' && (
                      <div className={styles.refDirToggle}>
                        <button
                          className={`${styles.refDirButton} ${refDir === 'bottom' ? styles.active : ''}`}
                          onClick={() => handleShelfRefDirChange(sIdx, side, hi, 'bottom', h, sectionHeight)}
                          title="아래에서"
                        >
                          ↑
                        </button>
                        <button
                          className={`${styles.refDirButton} ${refDir === 'top' ? styles.active : ''}`}
                          onClick={() => handleShelfRefDirChange(sIdx, side, hi, 'top', h, sectionHeight)}
                          title="위에서"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                    {el.heights.length > 1 && (
                      <button className={styles.removeButton} onClick={() => handleRemoveHeight(sIdx, side, hi)}>
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button className={styles.addButton} onClick={() => handleAddHeight(sIdx, side)}>
              + {currentType === 'shelf' ? '선반' : '서랍'} 추가
            </button>
          </div>
        )}

        {/* 옷봉: 상판 바로 아래에 자동 배치 (높이 입력 불필요) */}
        {currentType === 'rod' && (
          <div className={styles.row} style={{ color: '#888', fontSize: '12px' }}>
            상판 바로 아래에 설치됩니다
          </div>
        )}

        {/* 바지걸이: 상판 바로 아래에 자동 배치 */}
        {currentType === 'pants' && (
          <div className={styles.row} style={{ color: '#888', fontSize: '12px' }}>
            상판 바로 아래에 설치됩니다
          </div>
        )}

        {/* 선반 + 옷봉 토글 */}
        {currentType === 'shelf' && el.type === 'shelf' && (
          <>
            <div className={styles.row} style={{ marginTop: '6px' }}>
              <span className={styles.label}>옷봉</span>
              <div className={styles.toggleGroup}>
                <button
                  className={`${styles.toggleButton} ${!el.hasRod ? styles.active : ''}`}
                  onClick={() => handleShelfRodToggle(sIdx, side, false)}
                >
                  없음
                </button>
                <button
                  className={`${styles.toggleButton} ${el.hasRod ? styles.active : ''}`}
                  onClick={() => handleShelfRodToggle(sIdx, side, true)}
                >
                  추가
                </button>
              </div>
            </div>
            {el.hasRod && (
              <div className={styles.row} style={{ color: '#888', fontSize: '12px' }}>
                최상단 선반 바로 아래에 옷봉이 설치됩니다
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // 서브분할 영역 요소 편집기 (상부/하부)
  const renderSubSplitElementEditor = (
    sIdx: number,
    areaKey: string,
    subPart: 'upper' | 'lower',
    elements: CustomElement[] | undefined,
    subHeight: number,
  ) => {
    const el = elements?.[0] || { type: 'open' as const };
    const currentType = el.type;

    // 상부에는 서랍 불가
    const availableTypes = subPart === 'upper'
      ? (['open', 'shelf', 'rod'] as const)
      : (['open', 'shelf', 'drawer', 'rod', 'pants'] as const);

    return (
      <div>
        <div className={styles.elementSelector}>
          {availableTypes.map((type) => (
            <button
              key={type}
              className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
              onClick={() => handleSubSplitElementChange(sIdx, areaKey, subPart, type)}
            >
              {type === 'open' ? '비움' : type === 'shelf' ? '선반' : type === 'drawer' ? '서랍' : type === 'rod' ? '옷봉' : '바지걸이'}
            </button>
          ))}
        </div>

        {/* 옷봉 자동 배치 안내 */}
        {currentType === 'rod' && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
            상판 바로 아래에 설치됩니다
          </div>
        )}

        {/* 선반 + 옷봉 추가 안내 */}
        {currentType === 'shelf' && el.type === 'shelf' && el.hasRod && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
            최상단 선반 바로 아래에 옷봉이 설치됩니다
          </div>
        )}
      </div>
    );
  };

  // 섹션 편집 UI 렌더링
  const renderSectionEditor = (section: CustomSection, sIdx: number, areaSide?: 'left' | 'right') => {
    const innerW = furnitureWidth - 2 * panelThickness;
    const hasPartition = section.hasPartition || false;

    // areaSide가 지정되면 해당 영역의 요소 편집 + 상하 서브분할 표시
    if (areaSide) {
      const elements = areaSide === 'left' ? section.leftElements : section.rightElements;
      const areaLabel = areaSide === 'left' ? '좌측' : '우측';
      const subSplit = section.areaSubSplits?.[areaSide];
      const isSubSplit = subSplit?.enabled || false;
      const subSplitKey = `${sIdx}-${areaSide}`;

      return (
        <div key={`${sIdx}-${areaSide}`}>
          {/* 내부 요소 편집 (칸막이 영역에서는 섹션분할 없이 요소 편집만) */}
          <div className={styles.section}>
            <div className={styles.areaCard}>
              {renderElementEditor(sIdx, areaSide, elements, section.height)}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={sIdx} className={styles.section}>
        <div className={styles.sectionTitle}>
          {config.sections.length > 1 ? (sIdx === 0 ? '하부 섹션' : '상부 섹션') : '내부 구조'}
        </div>

        {/* 섹션 높이 (2단 분할 시) */}
        {config.sections.length > 1 && (
          <div className={styles.row}>
            <span className={styles.label}>높이</span>
            <input
              type="text"
              inputMode="numeric"
              className={`${styles.input} ${styles.inputSmall}`}
              value={sectionHeightInputs[sIdx] ?? section.height.toString()}
              onChange={(e) => handleSectionHeightInputChange(sIdx, e.target.value)}
              onBlur={() => handleSectionHeightBlur(sIdx)}
              onKeyDown={(e) => handleSectionHeightKeyDown(e, sIdx)}
            />
            <span className={styles.unit}>mm</span>
          </div>
        )}

        {/* 칸막이 토글 */}
        <div className={styles.row}>
          <span className={styles.label}>칸막이</span>
          <div className={styles.toggleGroup}>
            <button
              className={`${styles.toggleButton} ${!hasPartition ? styles.active : ''}`}
              onClick={() => handlePartitionToggle(sIdx, false)}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${hasPartition ? styles.active : ''}`}
              onClick={() => handlePartitionToggle(sIdx, true)}
            >
              추가
            </button>
          </div>
        </div>

        {/* 칸막이 좌/우 거리 입력 */}
        {hasPartition && (
          <>
            <div className={styles.row}>
              <span className={styles.label}>좌</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputSmall}`}
                value={partitionInputs[`${sIdx}-left`] ?? (section.partitionPosition || Math.round(innerW / 2)).toString()}
                onChange={(e) => {
                  setPartitionInputs((prev) => ({ ...prev, [`${sIdx}-left`]: e.target.value }));
                }}
                onBlur={() => {
                  const val = parseInt(partitionInputs[`${sIdx}-left`] || '0');
                  const minV = 100;
                  const maxV = innerW - 100;
                  const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(innerW / 2) : val));
                  handlePartitionPosition(sIdx, clamped);
                  setPartitionInputs((prev) => ({
                    ...prev,
                    [`${sIdx}-left`]: clamped.toString(),
                    [`${sIdx}-right`]: (innerW - clamped).toString(),
                  }));
                }}
                style={{ width: '70px' }}
              />
              <span className={styles.unit}>mm</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>우</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputSmall}`}
                value={partitionInputs[`${sIdx}-right`] ?? (innerW - (section.partitionPosition || Math.round(innerW / 2))).toString()}
                onChange={(e) => {
                  setPartitionInputs((prev) => ({ ...prev, [`${sIdx}-right`]: e.target.value }));
                }}
                onBlur={() => {
                  const val = parseInt(partitionInputs[`${sIdx}-right`] || '0');
                  const minV = 100;
                  const maxV = innerW - 100;
                  const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(innerW / 2) : val));
                  const newPos = innerW - clamped;
                  handlePartitionPosition(sIdx, newPos);
                  setPartitionInputs((prev) => ({
                    ...prev,
                    [`${sIdx}-left`]: newPos.toString(),
                    [`${sIdx}-right`]: clamped.toString(),
                  }));
                }}
                style={{ width: '70px' }}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </>
        )}

        {/* 내부 요소 편집 */}
        {hasPartition ? (
          <>
            <div className={styles.areaCard}>
              <div className={styles.areaTitle}>좌측 영역</div>
              {renderElementEditor(sIdx, 'left', section.leftElements, section.height)}
            </div>
            <div className={styles.areaCard}>
              <div className={styles.areaTitle}>우측 영역</div>
              {renderElementEditor(sIdx, 'right', section.rightElements, section.height)}
            </div>
          </>
        ) : (
          <div className={styles.areaCard}>
            <div className={styles.areaTitle}>전체 영역</div>
            {renderElementEditor(sIdx, 'full', section.elements, section.height)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} style={panelStyle}>
        {/* 헤더 */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            {focusedSectionIndex !== undefined
              ? focusedAreaSide
                ? config.sections.length === 1
                  ? `섹션 (${focusedAreaSide === 'left' ? '좌측영역' : '우측영역'})`
                  : `${focusedSectionIndex === 0 ? '하부섹션' : '상부섹션'} (${focusedAreaSide === 'left' ? '좌측영역' : '우측영역'})`
                : config.sections.length === 1
                  ? '섹션 설정'
                  : `${focusedSectionIndex === 0 ? '하부' : '상부'} 섹션 설정`
              : '커스터마이징 가구 편집'}
          </span>
          <button className={styles.closeButton} onClick={closeAllPopups}>
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className={styles.body}>
          {focusedSectionIndex !== undefined ? (
            focusedAreaSide ? (
              /* 칸막이 좌/우 영역 톱니 아이콘 클릭: 해당 영역만 편집 */
              config.sections[focusedSectionIndex] &&
                renderSectionEditor(config.sections[focusedSectionIndex], focusedSectionIndex, focusedAreaSide)
            ) : (
            /* 톱니 아이콘 클릭: 해당 섹션 세부설정 (칸막이 + 내부 요소) */
            config.sections[focusedSectionIndex] &&
              renderSectionEditor(config.sections[focusedSectionIndex], focusedSectionIndex)
            )
          ) : (
            /* 연필 아이콘 클릭: 치수 + 섹션 분할/크기 + 전체 섹션 편집 */
            <>
              {/* 기본 치수 */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>치수</div>
                <div className={styles.row}>
                  <span className={styles.label}>너비</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${widthError ? styles.inputError : ''}`}
                    value={widthInput}
                    placeholder={`${MIN_WIDTH}-${MAX_WIDTH}`}
                    onChange={(e) => handleWidthInputChange(e.target.value)}
                    onBlur={handleWidthInputBlur}
                    onKeyDown={handleInputKeyDown}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
                {widthError && <div className={styles.errorMessage}>{widthError}</div>}
                <div className={styles.row}>
                  <span className={styles.label}>높이</span>
                  <span className={styles.input} style={{ cursor: 'default', opacity: 0.7 }}>
                    {furnitureHeight}
                  </span>
                  <span className={styles.unit}>mm</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>깊이</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${depthError ? styles.inputError : ''}`}
                    value={depthInput}
                    placeholder={`${MIN_DEPTH}-${MAX_DEPTH}`}
                    onChange={(e) => handleDepthInputChange(e.target.value)}
                    onBlur={handleDepthInputBlur}
                    onKeyDown={handleInputKeyDown}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
                {depthError && <div className={styles.errorMessage}>{depthError}</div>}
              </div>

              <div className={styles.divider} />

              {/* 섹션 분할 (상/하만 지원) */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>섹션 분할</div>
                <div className={styles.row}>
                  <span className={styles.label}>상,하</span>
                  <div className={styles.toggleGroup}>
                    <button
                      className={`${styles.toggleButton} ${!config.splitDirection ? styles.active : ''}`}
                      onClick={() => {
                        if (config.splitDirection) handleSectionSplit(false);
                      }}
                    >
                      없음
                    </button>
                    <button
                      className={`${styles.toggleButton} ${config.splitDirection === 'topBottom' ? styles.active : ''}`}
                      onClick={() => handleSectionSplit(true)}
                    >
                      분할
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.divider} />

              {/* 섹션 설정: 높이 + 타입 */}
              {config.sections.length > 1 ? (
                /* 2단 분할: 상부→하부 순서 */
                [...config.sections].reverse().map((section, _i) => {
                  const realIdx = config.sections.length - 1 - _i;
                  const isUpper = realIdx === 1;
                  const { type: currentType, drawerCount } = getSectionTypeInfo(section);
                  const typeOptions = isUpper
                    ? (['open', 'shelf', 'rod'] as const)
                    : (['open', 'shelf', 'drawer', 'rod'] as const);

                  return (
                    <div
                      key={realIdx}
                      className={styles.section}
                      onMouseEnter={() => moduleId && setHighlightedSection(`${moduleId}-${realIdx}`)}
                      onMouseLeave={() => setHighlightedSection(null)}
                    >
                      <div className={styles.sectionTitle}>
                        {isUpper ? '상부 섹션' : '하부 섹션'}
                      </div>
                      <div className={styles.row}>
                        <span className={styles.label}>높이</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`${styles.input} ${styles.inputSmall}`}
                          value={sectionHeightInputs[realIdx] ?? section.height.toString()}
                          onChange={(e) => handleSectionHeightInputChange(realIdx, e.target.value)}
                          onBlur={() => handleSectionHeightBlur(realIdx)}
                          onKeyDown={(e) => handleSectionHeightKeyDown(e, realIdx)}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                      <div className={styles.row} style={{ marginTop: '8px' }}>
                        <span className={styles.label}>타입</span>
                      </div>
                      <div className={styles.elementSelector}>
                        {typeOptions.map((type) => (
                          <button
                            key={type}
                            className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
                            onClick={() => handleSectionTypeChange(realIdx, type, type === 'drawer' ? 2 : undefined)}
                          >
                            {type === 'open' ? '비움' : type === 'shelf' ? '선반장' : type === 'drawer' ? '서랍장' : '옷장'}
                          </button>
                        ))}
                      </div>
                      {/* 서랍장: 단수 선택 (하부만) */}
                      {currentType === 'drawer' && !isUpper && (
                        <div style={{ marginTop: '8px' }}>
                          <div className={styles.elementSelector}>
                            {[1, 2, 3, 4].map((count) => (
                              <button
                                key={count}
                                className={`${styles.elementButton} ${drawerCount === count ? styles.active : ''}`}
                                onClick={() => handleSectionTypeChange(realIdx, 'drawer', count)}
                              >
                                {count}단
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                /* 단일 섹션 타입 선택 */
                (() => {
                  const section = config.sections[0];
                  const { type: currentType, drawerCount } = getSectionTypeInfo(section);
                  return (
                    <div className={styles.section}>
                      <div className={styles.sectionTitle}>내부 구조</div>
                      <div className={styles.elementSelector}>
                        {(['open', 'shelf', 'drawer', 'rod'] as const).map((type) => (
                          <button
                            key={type}
                            className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
                            onClick={() => handleSectionTypeChange(0, type, type === 'drawer' ? 2 : undefined)}
                          >
                            {type === 'open' ? '비움' : type === 'shelf' ? '선반장' : type === 'drawer' ? '서랍장' : '옷장'}
                          </button>
                        ))}
                      </div>
                      {/* 서랍장: 단수 선택 */}
                      {currentType === 'drawer' && (
                        <div style={{ marginTop: '8px' }}>
                          <div className={styles.elementSelector}>
                            {[1, 2, 3, 4].map((count) => (
                              <button
                                key={count}
                                className={`${styles.elementButton} ${drawerCount === count ? styles.active : ''}`}
                                onClick={() => handleSectionTypeChange(0, 'drawer', count)}
                              >
                                {count}단
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              <div className={styles.divider} />

              {/* 안내 */}
              <div className={styles.section}>
                <p className={styles.helpText} style={{ margin: '0', fontSize: '12px', color: '#999' }}>
                  각 섹션의 세부 구조(칸막이, 선반 높이, 서랍 높이 등)는 3D 뷰에서 해당 섹션의 ⚙️ 아이콘을 클릭하여 설정하세요.
                </p>
              </div>
            </>
          )}
        </div>

        {/* 섹션 설정 하단 버튼 (톱니 메뉴에서 표시) */}
        {focusedSectionIndex !== undefined && moduleId && (
          <div className={styles.footer}>
            <button
              className={`${styles.footerButton} ${styles.secondaryButton}`}
              onClick={() => openCustomizableEditPopup(moduleId)}
            >
              취소
            </button>
            <button
              className={`${styles.footerButton} ${styles.primaryButton}`}
              onClick={() => openCustomizableEditPopup(moduleId)}
            >
              확인
            </button>
          </div>
        )}

        {/* My캐비닛 저장 + 하단 버튼 (연필 메뉴에서만 표시) */}
        {focusedSectionIndex === undefined && (
          <>
            <div style={{ padding: '0 20px 8px', flexShrink: 0 }}>
              <button className={styles.saveButton} onClick={handleSaveToCabinet}>
                My캐비닛에 저장
              </button>
            </div>
            <div className={styles.footer}>
              <button className={`${styles.footerButton} ${styles.secondaryButton}`} onClick={handleDelete}>
                취소
              </button>
              <button className={`${styles.footerButton} ${styles.primaryButton}`} onClick={closeAllPopups}>
                확인
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CustomizablePropertiesPanel;
