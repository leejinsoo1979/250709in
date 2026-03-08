import React, { useEffect, useCallback, useState } from 'react';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { SavedCabinet } from '@/firebase/types';
import { CustomFurnitureConfig, CustomSection, CustomElement } from '@/editor/shared/furniture/types';
import { createCustomizableModuleId } from './CustomizableFurnitureLibrary';
import styles from './CustomizableFurnitureLibrary.module.css';

interface MyCabinetGalleryProps {
  filter?: 'full' | 'upper' | 'lower' | 'all';
}

const CATEGORY_LABELS: Record<string, string> = {
  full: '전체장',
  upper: '상부장',
  lower: '하부장',
};

// ── SVG 기반 미니 섬네일 ──
const CabinetThumbnail: React.FC<{ config: CustomFurnitureConfig; width: number; height: number; depth: number }> = ({
  config, width: furW, height: furH,
}) => {
  const svgW = 56;
  const svgH = 56;
  const pad = 3;
  const innerW = svgW - pad * 2;
  const innerH = svgH - pad * 2;
  const panelT = 1.5; // 패널 두께 (px)

  // 섹션별로 내부 요소를 그린다
  const renderElements = (
    elements: CustomElement[] | undefined,
    x: number, y: number, w: number, h: number,
  ): React.ReactNode[] => {
    if (!elements || elements.length === 0) return [];
    const el = elements[0];
    const nodes: React.ReactNode[] = [];
    const key = `${x}-${y}`;

    if (el.type === 'shelf') {
      // 선반 높이 비율로 라인 그리기
      const count = el.heights.length;
      for (let i = 0; i < count; i++) {
        const ratio = el.heights[i] / furH;
        const sy = y + h - ratio * h;
        nodes.push(
          <line key={`${key}-shelf-${i}`} x1={x + 1} y1={sy} x2={x + w - 1} y2={sy}
            stroke="#8B7355" strokeWidth={panelT} />
        );
      }
      if (el.hasRod) {
        // 옷봉 표시 (원)
        nodes.push(
          <circle key={`${key}-rod`} cx={x + w / 2} cy={y + h * 0.35} r={1.5}
            fill="none" stroke="#666" strokeWidth={0.8} />
        );
      }
    } else if (el.type === 'drawer') {
      // 서랍 박스 그리기
      const count = el.heights.length;
      const totalH = el.heights.reduce((s, v) => s + v, 0);
      const gap = 1;
      let cy = y + h; // 하단부터 위로
      for (let i = count - 1; i >= 0; i--) {
        const dh = (el.heights[i] / totalH) * (h - gap * (count - 1));
        cy -= dh;
        nodes.push(
          <rect key={`${key}-dr-${i}`} x={x + 1.5} y={cy} width={w - 3} height={dh - gap}
            fill="#D4C4A8" stroke="#8B7355" strokeWidth={0.5} rx={0.5} />
        );
        // 손잡이 라인
        const handleY = cy + (dh - gap) / 2;
        nodes.push(
          <line key={`${key}-dh-${i}`} x1={x + w * 0.35} y1={handleY} x2={x + w * 0.65} y2={handleY}
            stroke="#666" strokeWidth={0.6} />
        );
        cy -= gap;
      }
    } else if (el.type === 'rod') {
      // 옷봉
      nodes.push(
        <circle key={`${key}-rod`} cx={x + w / 2} cy={y + h * 0.3} r={2}
          fill="none" stroke="#666" strokeWidth={0.8} />
      );
      nodes.push(
        <line key={`${key}-rod-l`} x1={x + 2} y1={y + h * 0.3} x2={x + w - 2} y2={y + h * 0.3}
          stroke="#999" strokeWidth={0.5} strokeDasharray="1,1" />
      );
    } else if (el.type === 'pants') {
      // 바지걸이
      for (let i = 0; i < 3; i++) {
        const lx = x + w * 0.2 + i * (w * 0.3);
        nodes.push(
          <line key={`${key}-pants-${i}`} x1={lx} y1={y + 3} x2={lx} y2={y + h - 2}
            stroke="#999" strokeWidth={0.5} />
        );
      }
    }
    // 'open' → 그냥 비워둠
    return nodes;
  };

  const renderSection = (section: CustomSection, sx: number, sy: number, sw: number, sh: number, idx: number) => {
    const nodes: React.ReactNode[] = [];
    const sKey = `sec-${idx}`;

    if (section.hasPartition && section.partitionPosition != null) {
      // 칸막이 비율 계산
      const totalSectionW = furW - (config.panelThickness || 18) * 2; // 좌우 측판 제외
      const ratio = section.partitionPosition / totalSectionW;
      const partX = sx + ratio * sw;

      // 칸막이 세로선
      nodes.push(
        <line key={`${sKey}-part`} x1={partX} y1={sy} x2={partX} y2={sy + sh}
          stroke="#8B7355" strokeWidth={panelT} />
      );

      // 좌측 영역
      nodes.push(...renderElements(section.leftElements, sx, sy, partX - sx, sh));
      // 우측 영역
      nodes.push(...renderElements(section.rightElements, partX, sy, sx + sw - partX, sh));
    } else {
      // 전체 영역
      nodes.push(...renderElements(section.elements, sx, sy, sw, sh));
    }

    return nodes;
  };

  // 섹션들의 총 높이
  const sections = config.sections || [];
  const totalSectionH = sections.reduce((s, sec) => s + sec.height, 0);

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ borderRadius: 4, background: '#F5F0EB' }}>
      {/* 외곽 프레임 */}
      <rect x={pad} y={pad} width={innerW} height={innerH}
        fill="#EDE4D6" stroke="#8B7355" strokeWidth={panelT} rx={1} />

      {/* 섹션 렌더링 (상단→하단 순서) */}
      {sections.map((section, i) => {
        // 이 섹션 위에 있는 섹션들의 높이 합산
        let aboveH = 0;
        for (let j = 0; j < i; j++) aboveH += sections[j].height;
        const sy = pad + panelT + (aboveH / totalSectionH) * (innerH - panelT * 2);
        const sh = (section.height / totalSectionH) * (innerH - panelT * 2);
        const sx = pad + panelT;
        const sw = innerW - panelT * 2;

        const nodes: React.ReactNode[] = [];

        // 섹션 구분선 (첫 번째 제외)
        if (i > 0) {
          nodes.push(
            <line key={`div-${i}`} x1={pad + 1} y1={sy} x2={pad + innerW - 1} y2={sy}
              stroke="#8B7355" strokeWidth={panelT} />
          );
        }

        nodes.push(...renderSection(section, sx, sy, sw, sh, i));
        return nodes;
      })}
    </svg>
  );
};

const MyCabinetGallery: React.FC<MyCabinetGalleryProps> = ({ filter = 'all' }) => {
  const { savedCabinets, isLoading, fetchCabinets, deleteCabinet, updateCabinet, setPendingPlacement, setEditingCabinetId } = useMyCabinetStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode } = useFurnitureStore();

  // 이름 수정 인라인 편집 상태
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  useEffect(() => {
    fetchCabinets();
  }, [fetchCabinets]);

  const filteredCabinets = filter === 'all'
    ? savedCabinets
    : savedCabinets.filter((c) => c.category === filter);

  const handleItemClick = useCallback((cabinet: SavedCabinet) => {
    // 이름 편집 중이면 배치하지 않음
    if (editingNameId) return;

    // pendingPlacement에 저장된 설정 세팅
    setPendingPlacement({
      customConfig: cabinet.customConfig,
      width: cabinet.width,
      height: cabinet.height,
      depth: cabinet.depth,
      category: cabinet.category,
    });

    // 해당 카테고리의 커스터마이징 가구 모듈 ID 생성
    const moduleId = createCustomizableModuleId(cabinet.category, cabinet.width);
    setSelectedFurnitureId(moduleId);
    setFurniturePlacementMode(true);
  }, [editingNameId, setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode]);

  // 수정 버튼: 배치 + 편집 패널 자동 오픈을 위해 editingCabinetId 설정
  const handleEdit = useCallback((e: React.MouseEvent, cabinet: SavedCabinet) => {
    e.stopPropagation();

    // editingCabinetId 설정 (나중에 저장 시 업데이트에 사용)
    setEditingCabinetId(cabinet.id);

    // 배치 모드 활성화
    setPendingPlacement({
      customConfig: cabinet.customConfig,
      width: cabinet.width,
      height: cabinet.height,
      depth: cabinet.depth,
      category: cabinet.category,
    });

    const moduleId = createCustomizableModuleId(cabinet.category, cabinet.width);
    setSelectedFurnitureId(moduleId);
    setFurniturePlacementMode(true);
  }, [setEditingCabinetId, setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode]);

  // 이름 수정 시작
  const handleStartRename = useCallback((e: React.MouseEvent, cabinet: SavedCabinet) => {
    e.stopPropagation();
    setEditingNameId(cabinet.id);
    setEditNameValue(cabinet.name);
  }, []);

  // 이름 수정 저장
  const handleSaveRename = useCallback(async (cabinetId: string) => {
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== savedCabinets.find(c => c.id === cabinetId)?.name) {
      await updateCabinet(cabinetId, { name: trimmed });
    }
    setEditingNameId(null);
    setEditNameValue('');
  }, [editNameValue, savedCabinets, updateCabinet]);

  // 이름 수정 취소
  const handleCancelRename = useCallback(() => {
    setEditingNameId(null);
    setEditNameValue('');
  }, []);

  const handleDelete = useCallback(async (e: React.MouseEvent, cabinetId: string) => {
    e.stopPropagation();
    if (window.confirm('이 캐비닛을 삭제하시겠습니까?')) {
      await deleteCabinet(cabinetId);
    }
  }, [deleteCabinet]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.helpText}>불러오는 중...</p>
      </div>
    );
  }

  if (filteredCabinets.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.helpText}>
          저장된 캐비닛이 없습니다.
          <br />
          커스텀 캐비닛을 편집한 후 "My캐비닛에 저장"을 눌러 저장하세요.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {filteredCabinets.map((cabinet) => (
        <div
          key={cabinet.id}
          className={styles.item}
          onClick={() => handleItemClick(cabinet)}
        >
          <div className={styles.itemIcon} style={{ background: 'transparent', padding: 0 }}>
            <CabinetThumbnail
              config={cabinet.customConfig}
              width={cabinet.width}
              height={cabinet.height}
              depth={cabinet.depth}
            />
          </div>
          <div className={styles.itemInfo}>
            {editingNameId === cabinet.id ? (
              <input
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={() => handleSaveRename(cabinet.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename(cabinet.id);
                  if (e.key === 'Escape') handleCancelRename();
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: '2px 4px',
                  border: '1px solid var(--theme-primary)',
                  borderRadius: '4px',
                  background: 'var(--theme-background)',
                  color: 'var(--theme-text)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            ) : (
              <span className={styles.itemLabel}>{cabinet.name}</span>
            )}
            <span className={styles.itemDimension}>
              {CATEGORY_LABELS[cabinet.category]} | {cabinet.width} x {cabinet.height} x {cabinet.depth} mm
            </span>
          </div>
          {/* 액션 버튼 그룹 */}
          <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto', flexShrink: 0 }}>
            {/* 이름 수정 */}
            <button
              onClick={(e) => handleStartRename(e, cabinet)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--theme-text-tertiary)',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '13px',
                borderRadius: '4px',
                lineHeight: 1,
              }}
              title="이름 변경"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
            {/* 내부구조 수정 (배치 후 편집) */}
            <button
              onClick={(e) => handleEdit(e, cabinet)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--theme-text-tertiary)',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '13px',
                borderRadius: '4px',
                lineHeight: 1,
              }}
              title="내부구조 수정 (배치 후 편집)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </button>
            {/* 삭제 */}
            <button
              onClick={(e) => handleDelete(e, cabinet.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--theme-text-tertiary)',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '13px',
                borderRadius: '4px',
                lineHeight: 1,
              }}
              title="삭제"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
      <p className={styles.helpText}>
        클릭하여 배치 | 연필: 이름 변경 | 공구: 내부구조 수정 | 휴지통: 삭제
      </p>
    </div>
  );
};

export default MyCabinetGallery;
