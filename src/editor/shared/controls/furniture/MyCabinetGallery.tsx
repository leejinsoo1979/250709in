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

// ── SVG 기반 섬네일 ──
const CabinetThumbnail: React.FC<{
  config: CustomFurnitureConfig;
  width: number;
  height: number;
  depth: number;
  svgWidth?: number;
  svgHeight?: number;
}> = ({
  config, width: furW, height: furH, svgWidth = 120, svgHeight = 90,
}) => {
  const pad = 6;
  const maxInnerW = svgWidth - pad * 2;
  const maxInnerH = svgHeight - pad * 2;
  const aspectRatio = furW / furH;
  let innerW: number, innerH: number;
  if (aspectRatio > maxInnerW / maxInnerH) {
    innerW = maxInnerW;
    innerH = maxInnerW / aspectRatio;
  } else {
    innerH = maxInnerH;
    innerW = maxInnerH * aspectRatio;
  }
  const offsetX = (svgWidth - innerW) / 2;
  const offsetY = (svgHeight - innerH) / 2;
  const panelT = 2;

  const renderElements = (
    elements: CustomElement[] | undefined,
    x: number, y: number, w: number, h: number,
  ): React.ReactNode[] => {
    if (!elements || elements.length === 0) return [];
    const el = elements[0];
    const nodes: React.ReactNode[] = [];
    const key = `${Math.round(x)}-${Math.round(y)}`;

    if (el.type === 'shelf') {
      const count = el.heights.length;
      for (let i = 0; i < count; i++) {
        const ratio = el.heights[i] / furH;
        const sy = y + h - ratio * h;
        nodes.push(
          <line key={`${key}-shelf-${i}`} x1={x + 2} y1={sy} x2={x + w - 2} y2={sy}
            stroke="#9B8B75" strokeWidth={1.5} />
        );
      }
      if (el.hasRod) {
        nodes.push(
          <circle key={`${key}-rod`} cx={x + w / 2} cy={y + h * 0.3} r={2.5}
            fill="none" stroke="#777" strokeWidth={1} />
        );
        nodes.push(
          <line key={`${key}-rod-l`} x1={x + 4} y1={y + h * 0.3} x2={x + w - 4} y2={y + h * 0.3}
            stroke="#aaa" strokeWidth={0.6} strokeDasharray="2,1.5" />
        );
      }
    } else if (el.type === 'drawer') {
      const count = el.heights.length;
      const totalH = el.heights.reduce((s, v) => s + v, 0);
      const gap = 1.5;
      let cy = y + h;
      for (let i = count - 1; i >= 0; i--) {
        const dh = (el.heights[i] / totalH) * (h - gap * (count - 1));
        cy -= dh;
        nodes.push(
          <rect key={`${key}-dr-${i}`} x={x + 2.5} y={cy} width={w - 5} height={dh - gap}
            fill="#DDD0BA" stroke="#9B8B75" strokeWidth={0.7} rx={1} />
        );
        const handleY = cy + (dh - gap) / 2;
        const handleW = Math.min(w * 0.25, 12);
        nodes.push(
          <line key={`${key}-dh-${i}`}
            x1={x + w / 2 - handleW} y1={handleY}
            x2={x + w / 2 + handleW} y2={handleY}
            stroke="#888" strokeWidth={0.8} strokeLinecap="round" />
        );
        cy -= gap;
      }
    } else if (el.type === 'rod') {
      nodes.push(
        <circle key={`${key}-rod`} cx={x + w / 2} cy={y + h * 0.3} r={3}
          fill="none" stroke="#777" strokeWidth={1} />
      );
      nodes.push(
        <line key={`${key}-rod-l`} x1={x + 4} y1={y + h * 0.3} x2={x + w - 4} y2={y + h * 0.3}
          stroke="#aaa" strokeWidth={0.6} strokeDasharray="2,1.5" />
      );
    } else if (el.type === 'pants') {
      const barCount = Math.min(5, Math.max(3, Math.floor(w / 6)));
      for (let i = 0; i < barCount; i++) {
        const lx = x + w * 0.15 + i * (w * 0.7 / (barCount - 1));
        nodes.push(
          <line key={`${key}-pants-${i}`} x1={lx} y1={y + 4} x2={lx} y2={y + h - 3}
            stroke="#aaa" strokeWidth={0.7} />
        );
      }
    }
    return nodes;
  };

  const renderSection = (section: CustomSection, sx: number, sy: number, sw: number, sh: number, idx: number) => {
    const nodes: React.ReactNode[] = [];
    const sKey = `sec-${idx}`;

    if (section.hasPartition && section.partitionPosition != null) {
      const totalSectionW = furW - (config.panelThickness || 18) * 2;
      const ratio = section.partitionPosition / totalSectionW;
      const partX = sx + ratio * sw;

      nodes.push(
        <line key={`${sKey}-part`} x1={partX} y1={sy} x2={partX} y2={sy + sh}
          stroke="#9B8B75" strokeWidth={1.5} />
      );

      nodes.push(...renderElements(section.leftElements, sx, sy, partX - sx, sh));
      nodes.push(...renderElements(section.rightElements, partX, sy, sx + sw - partX, sh));
    } else {
      nodes.push(...renderElements(section.elements, sx, sy, sw, sh));
    }

    return nodes;
  };

  const sections = config.sections || [];
  const totalSectionH = sections.reduce((s, sec) => s + sec.height, 0);

  return (
    <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      style={{ borderRadius: 6 }}>
      <rect width={svgWidth} height={svgHeight} fill="#F7F3EE" rx={6} />
      <rect x={offsetX + 1} y={offsetY + 1} width={innerW} height={innerH}
        fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={panelT} rx={1.5} />
      <rect x={offsetX} y={offsetY} width={innerW} height={innerH}
        fill="#EDE4D6" stroke="#8B7355" strokeWidth={panelT} rx={1.5} />

      {sections.map((section, i) => {
        let aboveH = 0;
        for (let j = 0; j < i; j++) aboveH += sections[j].height;
        const sy = offsetY + panelT + (aboveH / totalSectionH) * (innerH - panelT * 2);
        const sh = (section.height / totalSectionH) * (innerH - panelT * 2);
        const sx = offsetX + panelT;
        const sw = innerW - panelT * 2;

        const nodes: React.ReactNode[] = [];

        if (i > 0) {
          nodes.push(
            <line key={`div-${i}`} x1={offsetX + 2} y1={sy} x2={offsetX + innerW - 2} y2={sy}
              stroke="#9B8B75" strokeWidth={1.5} />
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

  const [editMode, setEditMode] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  useEffect(() => {
    fetchCabinets();
  }, [fetchCabinets]);

  const filteredCabinets = filter === 'all'
    ? savedCabinets
    : savedCabinets.filter((c) => c.category === filter);

  const handleItemClick = useCallback((cabinet: SavedCabinet) => {
    if (editingNameId) return;
    if (editMode) return; // 편집 모드에서는 배치 안 함

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
  }, [editingNameId, editMode, setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode]);

  const handleEdit = useCallback((e: React.MouseEvent, cabinet: SavedCabinet) => {
    e.stopPropagation();
    setEditingCabinetId(cabinet.id);
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
    setEditMode(false); // 편집모드 해제
  }, [setEditingCabinetId, setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode]);

  const handleStartRename = useCallback((e: React.MouseEvent, cabinet: SavedCabinet) => {
    e.stopPropagation();
    setEditingNameId(cabinet.id);
    setEditNameValue(cabinet.name);
  }, []);

  const handleSaveRename = useCallback(async (cabinetId: string) => {
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== savedCabinets.find(c => c.id === cabinetId)?.name) {
      await updateCabinet(cabinetId, { name: trimmed });
    }
    setEditingNameId(null);
    setEditNameValue('');
  }, [editNameValue, savedCabinets, updateCabinet]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
      {filteredCabinets.map((cabinet) => (
        <div
          key={cabinet.id}
          onClick={() => handleItemClick(cabinet)}
          style={{
            border: editMode ? '1px solid var(--theme-primary, #4a90d9)' : '1px solid var(--theme-border, #e0e0e0)',
            borderRadius: '10px',
            cursor: editMode ? 'default' : 'pointer',
            transition: 'all 0.2s',
            background: 'var(--theme-surface, #fff)',
            overflow: 'hidden',
          }}
          onMouseEnter={(e) => {
            if (!editMode) {
              e.currentTarget.style.borderColor = 'var(--theme-primary, #4a90d9)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }
          }}
          onMouseLeave={(e) => {
            if (!editMode) {
              e.currentTarget.style.borderColor = 'var(--theme-border, #e0e0e0)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          {/* 섬네일 */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '10px 10px 6px',
          }}>
            <CabinetThumbnail
              config={cabinet.customConfig}
              width={cabinet.width}
              height={cabinet.height}
              depth={cabinet.depth}
              svgWidth={160}
              svgHeight={100}
            />
          </div>

          {/* 하단 정보 */}
          <div style={{
            padding: '4px 10px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--theme-text, #333)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {cabinet.name}
                </div>
              )}
              <div style={{
                fontSize: '10px',
                color: 'var(--theme-text-secondary, #999)',
                marginTop: '1px',
              }}>
                {CATEGORY_LABELS[cabinet.category]} · {cabinet.width}×{cabinet.height}×{cabinet.depth}
              </div>
            </div>

            {/* 편집모드일 때만 액션 버튼 표시 */}
            {editMode && (
              <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                <button
                  onClick={(e) => handleStartRename(e, cabinet)}
                  title="이름 변경"
                  style={actionBtnStyle}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                  </svg>
                </button>
                <button
                  onClick={(e) => handleEdit(e, cabinet)}
                  title="내부구조 수정"
                  style={actionBtnStyle}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </button>
                <button
                  onClick={(e) => handleDelete(e, cabinet.id)}
                  title="삭제"
                  style={{ ...actionBtnStyle, color: 'var(--theme-error, #ef4444)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 하단 안내 텍스트 */}
      {!editMode && (
        <p className={styles.helpText} style={{ textAlign: 'center', marginTop: '4px' }}>
          클릭하여 배치
        </p>
      )}

      {/* 하단 편집 모드 토글 버튼 */}
      <button
        onClick={() => {
          setEditMode(!editMode);
          if (editMode) {
            // 편집 모드 해제 시 이름편집 취소
            setEditingNameId(null);
            setEditNameValue('');
          }
        }}
        style={{
          marginTop: '4px',
          padding: '8px 12px',
          border: editMode ? '1px solid var(--theme-primary, #4a90d9)' : '1px solid var(--theme-border, #e0e0e0)',
          borderRadius: '8px',
          background: editMode ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-surface, #fff)',
          color: editMode ? '#fff' : 'var(--theme-text-secondary, #666)',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {editMode ? (
            <><polyline points="20 6 9 17 4 12"/></>
          ) : (
            <>
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </>
          )}
        </svg>
        {editMode ? '편집 완료' : '설정 · 삭제'}
      </button>
    </div>
  );
};

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--theme-text-tertiary)',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '4px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export default MyCabinetGallery;
