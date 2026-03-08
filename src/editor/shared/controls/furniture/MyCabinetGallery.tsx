import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { SavedCabinet } from '@/firebase/types';
import { CustomFurnitureConfig, CustomSection, CustomElement } from '@/editor/shared/furniture/types';
import { createCustomizableModuleId } from './CustomizableFurnitureLibrary';
import moduleStyles from './ModuleGallery.module.css';
import styles from './CustomizableFurnitureLibrary.module.css';

interface MyCabinetGalleryProps {
  filter?: 'full' | 'upper' | 'lower' | 'all';
  editMode?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  full: '전체장',
  upper: '상부장',
  lower: '하부장',
};

// ── SVG 기반 섬네일 (업로드 이미지 없을 때 폴백) ──
const CabinetSvgThumbnail: React.FC<{
  config: CustomFurnitureConfig;
  width: number;
  height: number;
}> = ({ config, width: furW, height: furH }) => {
  // SVG는 부모 100% 채움
  const svgW = 100;
  const svgH = 133; // 3:4 비율
  const pad = 8;
  const maxInnerW = svgW - pad * 2;
  const maxInnerH = svgH - pad * 2;
  const aspectRatio = furW / furH;
  let innerW: number, innerH: number;
  if (aspectRatio > maxInnerW / maxInnerH) {
    innerW = maxInnerW;
    innerH = maxInnerW / aspectRatio;
  } else {
    innerH = maxInnerH;
    innerW = maxInnerH * aspectRatio;
  }
  const offsetX = (svgW - innerW) / 2;
  const offsetY = (svgH - innerH) / 2;
  const panelT = 1.8;

  const renderElements = (
    elements: CustomElement[] | undefined,
    x: number, y: number, w: number, h: number,
  ): React.ReactNode[] => {
    if (!elements || elements.length === 0) return [];
    const el = elements[0];
    const nodes: React.ReactNode[] = [];
    const key = `${Math.round(x * 10)}-${Math.round(y * 10)}`;

    if (el.type === 'shelf') {
      for (let i = 0; i < el.heights.length; i++) {
        const ratio = el.heights[i] / furH;
        const sy = y + h - ratio * h;
        nodes.push(<line key={`${key}-s${i}`} x1={x + 1.5} y1={sy} x2={x + w - 1.5} y2={sy} stroke="#9B8B75" strokeWidth={1.2} />);
      }
      if (el.hasRod) {
        nodes.push(<circle key={`${key}-r`} cx={x + w / 2} cy={y + h * 0.3} r={2} fill="none" stroke="#777" strokeWidth={0.8} />);
      }
    } else if (el.type === 'drawer') {
      const totalH = el.heights.reduce((s, v) => s + v, 0);
      const gap = 1.2;
      let cy = y + h;
      for (let i = el.heights.length - 1; i >= 0; i--) {
        const dh = (el.heights[i] / totalH) * (h - gap * (el.heights.length - 1));
        cy -= dh;
        nodes.push(<rect key={`${key}-d${i}`} x={x + 2} y={cy} width={w - 4} height={dh - gap} fill="#DDD0BA" stroke="#9B8B75" strokeWidth={0.6} rx={0.8} />);
        const handleY = cy + (dh - gap) / 2;
        nodes.push(<line key={`${key}-h${i}`} x1={x + w * 0.35} y1={handleY} x2={x + w * 0.65} y2={handleY} stroke="#888" strokeWidth={0.7} strokeLinecap="round" />);
        cy -= gap;
      }
    } else if (el.type === 'rod') {
      nodes.push(<circle key={`${key}-r`} cx={x + w / 2} cy={y + h * 0.3} r={2.5} fill="none" stroke="#777" strokeWidth={0.8} />);
      nodes.push(<line key={`${key}-rl`} x1={x + 3} y1={y + h * 0.3} x2={x + w - 3} y2={y + h * 0.3} stroke="#aaa" strokeWidth={0.5} strokeDasharray="1.5,1" />);
    } else if (el.type === 'pants') {
      for (let i = 0; i < 3; i++) {
        const lx = x + w * 0.2 + i * (w * 0.3);
        nodes.push(<line key={`${key}-p${i}`} x1={lx} y1={y + 3} x2={lx} y2={y + h - 2} stroke="#aaa" strokeWidth={0.6} />);
      }
    }
    return nodes;
  };

  const renderSection = (section: CustomSection, sx: number, sy: number, sw: number, sh: number, idx: number) => {
    const nodes: React.ReactNode[] = [];
    if (section.hasPartition && section.partitionPosition != null) {
      const totalSectionW = furW - (config.panelThickness || 18) * 2;
      const ratio = section.partitionPosition / totalSectionW;
      const partX = sx + ratio * sw;
      nodes.push(<line key={`p${idx}`} x1={partX} y1={sy} x2={partX} y2={sy + sh} stroke="#9B8B75" strokeWidth={1.2} />);
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
    <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
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
          nodes.push(<line key={`div${i}`} x1={offsetX + 1.5} y1={sy} x2={offsetX + innerW - 1.5} y2={sy} stroke="#9B8B75" strokeWidth={1.2} />);
        }
        nodes.push(...renderSection(section, sx, sy, sw, sh, i));
        return nodes;
      })}
    </svg>
  );
};

const MyCabinetGallery: React.FC<MyCabinetGalleryProps> = ({ filter = 'all', editMode = false }) => {
  const { savedCabinets, isLoading, fetchCabinets, deleteCabinet, updateCabinet, uploadThumbnail, setPendingPlacement, setEditingCabinetId } = useMyCabinetStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode } = useFurnitureStore();

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  useEffect(() => {
    fetchCabinets();
  }, [fetchCabinets]);

  const filteredCabinets = filter === 'all'
    ? savedCabinets
    : savedCabinets.filter((c) => c.category === filter);

  const handleItemClick = useCallback((cabinet: SavedCabinet) => {
    if (editingNameId || editMode) return;
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

  // 섬네일 업로드
  const handleThumbnailClick = useCallback((e: React.MouseEvent, cabinetId: string) => {
    e.stopPropagation();
    uploadTargetId.current = cabinetId;
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const cabinetId = uploadTargetId.current;
    if (!file || !cabinetId) return;

    setUploadingId(cabinetId);
    const { error } = await uploadThumbnail(cabinetId, file);
    if (error) alert(error);
    setUploadingId(null);
    uploadTargetId.current = null;
    // input 초기화
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadThumbnail]);

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
    <>
      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* 2열 그리드 (ModuleGallery와 동일) */}
      <div className={moduleStyles.thumbnailGrid}>
        {filteredCabinets.map((cabinet) => (
          <div
            key={cabinet.id}
            className={moduleStyles.thumbnailItem}
            style={{
              cursor: editMode ? 'default' : 'pointer',
              borderColor: editMode ? 'var(--theme-primary, #4a90d9)' : undefined,
              position: 'relative',
            }}
            onClick={() => handleItemClick(cabinet)}
          >
            {/* 섬네일 이미지 or SVG */}
            <div className={moduleStyles.thumbnailImage}>
              {cabinet.thumbnail ? (
                <img
                  src={cabinet.thumbnail}
                  alt={cabinet.name}
                  style={{ maxWidth: '130%', maxHeight: '130%', objectFit: 'contain' }}
                />
              ) : (
                <CabinetSvgThumbnail
                  config={cabinet.customConfig}
                  width={cabinet.width}
                  height={cabinet.height}
                />
              )}
            </div>

            {/* 하단 이름/치수 오버레이 */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '3px 4px',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
              borderRadius: '0 0 3px 3px',
            }}>
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
                    padding: '1px 3px',
                    border: '1px solid var(--theme-primary)',
                    borderRadius: '3px',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    fontSize: '10px',
                    outline: 'none',
                  }}
                />
              ) : (
                <div style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  lineHeight: 1.3,
                }}>
                  {cabinet.name}
                </div>
              )}
              <div style={{
                fontSize: '8px',
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.2,
              }}>
                {CATEGORY_LABELS[cabinet.category]} · {cabinet.width}×{cabinet.height}×{cabinet.depth}
              </div>
            </div>

            {/* 편집 모드: 액션 버튼 오버레이 */}
            {editMode && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '2px',
                padding: '3px',
                background: 'linear-gradient(rgba(0,0,0,0.4), transparent)',
                borderRadius: '3px 3px 0 0',
              }}>
                {/* 섬네일 이미지 업로드 */}
                <button
                  onClick={(e) => handleThumbnailClick(e, cabinet.id)}
                  title="섬네일 이미지 변경"
                  disabled={uploadingId === cabinet.id}
                  style={overlayBtnStyle}
                >
                  {uploadingId === cabinet.id ? (
                    <span style={{ fontSize: '10px' }}>...</span>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  )}
                </button>
                {/* 이름 변경 */}
                <button onClick={(e) => handleStartRename(e, cabinet)} title="이름 변경" style={overlayBtnStyle}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                  </svg>
                </button>
                {/* 내부구조 수정 */}
                <button onClick={(e) => handleEdit(e, cabinet)} title="내부구조 수정" style={overlayBtnStyle}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </button>
                {/* 삭제 */}
                <button onClick={(e) => handleDelete(e, cabinet.id)} title="삭제" style={{ ...overlayBtnStyle, color: '#ff6b6b' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!editMode && (
        <p className={styles.helpText} style={{ textAlign: 'center', marginTop: '8px' }}>
          클릭하여 배치
        </p>
      )}
    </>
  );
};

const overlayBtnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  padding: '3px',
  borderRadius: '4px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(4px)',
};

export default MyCabinetGallery;
