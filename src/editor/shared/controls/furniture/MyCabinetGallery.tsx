import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SavedCabinet } from '@/firebase/types';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { createCustomizableModuleId } from './CustomizableFurnitureLibrary';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { generateCabinetThumbnail } from '@/editor/shared/utils/cabinetThumbnailGenerator';
import moduleStyles from './ModuleGallery.module.css';
import myStyles from './MyCabinetGallery.module.css';
import libStyles from './CustomizableFurnitureLibrary.module.css';

interface MyCabinetGalleryProps {
  filter?: 'full' | 'upper' | 'lower' | 'all';
  editMode?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  full: '전체장',
  upper: '상부장',
  lower: '하부장',
};

// ── Canvas 기반 투명 배경 섬네일 ──
const CabinetCanvasThumbnail: React.FC<{
  config: CustomFurnitureConfig;
  width: number;
  height: number;
}> = React.memo(({ config, width, height }) => {
  const dataUrl = useMemo(
    () => generateCabinetThumbnail(config, width, height),
    [config, width, height],
  );

  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      alt="cabinet"
      style={{ maxWidth: '130%', maxHeight: '130%', objectFit: 'contain' }}
      draggable={false}
    />
  );
});

CabinetCanvasThumbnail.displayName = 'CabinetCanvasThumbnail';

const MyCabinetGallery: React.FC<MyCabinetGalleryProps> = ({ filter = 'all', editMode = false }) => {
  const { savedCabinets, isLoading, fetchCabinets, deleteCabinet, updateCabinet, uploadThumbnail, setPendingPlacement, setEditingCabinetId } = useMyCabinetStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode, setCurrentDragData } = useFurnitureStore();
  const { spaceInfo } = useSpaceConfigStore();

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  useEffect(() => {
    fetchCabinets();
  }, [fetchCabinets]);

  const filteredCabinets = filter === 'all'
    ? savedCabinets
    : savedCabinets.filter((c) => c.category === filter);

  // ── 핸들러 ──
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

    // 슬롯 배치용 currentDragData 설정
    const indexing = calculateSpaceIndexing(spaceInfo);
    const colW = indexing.columnWidth;
    const isDual = cabinet.width > colW * 1.5;
    const slotWidth = isDual ? colW * 2 : colW;

    setCurrentDragData({
      type: 'furniture',
      zone: 'normal',
      moduleData: {
        id: moduleId,
        name: cabinet.name || 'My캐비넷',
        dimensions: {
          width: slotWidth,
          height: cabinet.height,
          depth: cabinet.depth,
        },
        type: 'default',
        color: '#C8B69E',
        hasDoor: false,
      }
    });
  }, [editingNameId, editMode, setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode, setCurrentDragData, spaceInfo]);

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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadThumbnail]);

  // ── 로딩/빈 상태 ──
  if (isLoading) {
    return (
      <div className={libStyles.container}>
        <p className={libStyles.helpText}>불러오는 중...</p>
      </div>
    );
  }

  if (filteredCabinets.length === 0) {
    return (
      <div className={libStyles.container}>
        <p className={libStyles.helpText}>
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

      {/* 2열 그리드 */}
      <div className={moduleStyles.thumbnailGrid}>
        {filteredCabinets.map((cabinet) => (
          <div
            key={cabinet.id}
            className={myStyles.tooltipWrapper}
            onMouseEnter={() => setHoveredId(cabinet.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div
              className={moduleStyles.thumbnailItem}
              style={{
                cursor: editMode ? 'default' : 'pointer',
                borderColor: editMode ? 'var(--theme-primary, #4a90d9)' : undefined,
              }}
              onClick={() => handleItemClick(cabinet)}
            >
              {/* 섬네일: 업로드 이미지 또는 Canvas 렌더 (투명 배경, 가구만) */}
              <div className={moduleStyles.thumbnailImage}>
                {cabinet.thumbnail ? (
                  <img
                    src={cabinet.thumbnail}
                    alt={cabinet.name}
                    style={{ maxWidth: '130%', maxHeight: '130%', objectFit: 'contain' }}
                    draggable={false}
                  />
                ) : (
                  <CabinetCanvasThumbnail
                    config={cabinet.customConfig}
                    width={cabinet.width}
                    height={cabinet.height}
                  />
                )}
              </div>

              {/* 인라인 이름 편집 */}
              {editingNameId === cabinet.id && (
                <input
                  className={myStyles.renameInput}
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
                />
              )}

              {/* 편집 모드: 액션 버튼 */}
              {editMode && (
                <div className={myStyles.editOverlay}>
                  <button
                    className={myStyles.overlayBtn}
                    onClick={(e) => handleThumbnailClick(e, cabinet.id)}
                    title="섬네일 이미지 변경"
                    disabled={uploadingId === cabinet.id}
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
                  <button className={myStyles.overlayBtn} onClick={(e) => handleStartRename(e, cabinet)} title="이름 변경">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                  </button>
                  <button className={myStyles.overlayBtn} onClick={(e) => handleEdit(e, cabinet)} title="내부구조 수정">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                  </button>
                  <button className={`${myStyles.overlayBtn} ${myStyles.overlayBtnDanger}`} onClick={(e) => handleDelete(e, cabinet.id)} title="삭제">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* 호버 툴팁 (아이템 아래 팝업) */}
            <div className={`${myStyles.tooltip} ${hoveredId === cabinet.id && !editMode ? myStyles.tooltipVisible : ''}`}>
              <div className={myStyles.tooltipName}>{cabinet.name}</div>
              <div className={myStyles.tooltipDims}>
                {CATEGORY_LABELS[cabinet.category]} · {cabinet.width}×{cabinet.height}×{cabinet.depth}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!editMode && (
        <p className={libStyles.helpText} style={{ textAlign: 'center', marginTop: '8px' }}>
          클릭하여 배치
        </p>
      )}
    </>
  );
};

export default MyCabinetGallery;
