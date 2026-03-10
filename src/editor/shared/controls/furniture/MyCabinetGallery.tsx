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
  filter?: 'full' | 'upper' | 'lower';
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

const MyCabinetGallery: React.FC<MyCabinetGalleryProps> = ({ filter = 'full', editMode = false }) => {
  const { savedCabinets, isLoading, fetchCabinets, deleteCabinet, setPendingPlacement, setEditingCabinetId, setEditBackup } = useMyCabinetStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode, setCurrentDragData, placedModules, clearAllModules } = useFurnitureStore();
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCabinets();
  }, [fetchCabinets]);

  // 편집 모드 해제 시 선택 초기화
  useEffect(() => {
    if (!editMode) setSelectedIds(new Set());
  }, [editMode]);

  const filteredCabinets = savedCabinets.filter((c) => c.category === filter);

  // ── 일반 모드: 클릭 → 배치 ──
  const handleItemClick = useCallback((cabinet: SavedCabinet) => {
    if (editMode) return;
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

    const indexing = calculateSpaceIndexing(spaceInfo);
    const colW = indexing.columnWidth;
    const isDual = cabinet.width > colW * 1.5;
    const slotWidth = isDual ? colW * 2 : colW;

    setCurrentDragData({
      type: 'furniture',
      zone: 'normal',
      isDualSlot: isDual,
      moduleData: {
        id: moduleId,
        name: cabinet.name || '커스텀 캐비넷',
        dimensions: { width: slotWidth, height: cabinet.height, depth: cabinet.depth },
        type: 'default',
        color: '#C8B69E',
        hasDoor: false,
      }
    });
  }, [editMode, setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode, setCurrentDragData, spaceInfo]);

  // ── 편집 모드: 체크박스 토글 ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── 액션: 수정 (단일 선택만) ──
  const handleEditSelected = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const cabinetId = [...selectedIds][0];
    const cabinet = savedCabinets.find(c => c.id === cabinetId);
    if (!cabinet) return;

    // 기존 배치 상태 백업 (수정 완료/취소 시 복원용)
    setEditBackup({
      modules: [...placedModules],
      layoutMode: spaceInfo.layoutMode || 'equal-division',
    });

    // 기존 가구 모두 제거 → 빈 공간에서 시작
    clearAllModules();

    // 자유배치 모드로 전환
    if (spaceInfo.layoutMode !== 'free-placement') {
      setSpaceInfo({ layoutMode: 'free-placement' });
    }

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
    setSelectedIds(new Set());
  }, [selectedIds, savedCabinets, spaceInfo.layoutMode, setSpaceInfo, setEditingCabinetId, setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode, placedModules, clearAllModules, setEditBackup]);

  // ── 액션: 삭제 (다중 선택 가능) ──
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`선택한 캐비닛 ${count}개를 삭제하시겠습니까?`)) return;

    for (const id of selectedIds) {
      await deleteCabinet(id);
    }
    setSelectedIds(new Set());
  }, [selectedIds, deleteCabinet]);

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
          커스텀 캐비닛을 편집한 후 "커스텀에 저장"을 눌러 저장하세요.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 2열 그리드 */}
      <div className={moduleStyles.thumbnailGrid}>
        {filteredCabinets.map((cabinet) => {
          const isSelected = selectedIds.has(cabinet.id);
          return (
            <div
              key={cabinet.id}
              className={myStyles.tooltipWrapper}
              onMouseEnter={() => setHoveredId(cabinet.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div
                className={moduleStyles.thumbnailItem}
                style={{
                  cursor: editMode ? 'pointer' : 'pointer',
                  borderColor: isSelected ? 'var(--theme-primary, #4a90d9)' : undefined,
                  borderWidth: isSelected ? '2px' : undefined,
                  boxShadow: isSelected ? '0 0 0 1px var(--theme-primary, #4a90d9)' : undefined,
                }}
                onClick={() => editMode ? toggleSelect(cabinet.id) : handleItemClick(cabinet)}
              >
                {/* 섬네일 */}
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

                {/* 편집 모드: 좌측 상단 체크박스 */}
                {editMode && (
                  <div
                    className={myStyles.checkbox}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(cabinet.id); }}
                  >
                    <div className={`${myStyles.checkboxInner} ${isSelected ? myStyles.checkboxChecked : ''}`}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 호버 툴팁 */}
              <div className={`${myStyles.tooltip} ${hoveredId === cabinet.id ? myStyles.tooltipVisible : ''}`}>
                <div className={myStyles.tooltipName}>{cabinet.name}</div>
                <div className={myStyles.tooltipDims}>
                  {CATEGORY_LABELS[cabinet.category]} · {cabinet.width}×{cabinet.height}×{cabinet.depth}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 편집 모드: 하단 액션 바 */}
      {editMode && selectedIds.size > 0 && (
        <div className={myStyles.actionBar}>
          <span className={myStyles.actionBarCount}>
            {selectedIds.size}개 선택
          </span>
          <div className={myStyles.actionBarButtons}>
            {selectedIds.size === 1 && (
              <button className={myStyles.actionBtn} onClick={handleEditSelected}>
                수정
              </button>
            )}
            <button className={`${myStyles.actionBtn} ${myStyles.actionBtnDanger}`} onClick={handleDeleteSelected}>
              삭제
            </button>
          </div>
        </div>
      )}

      {!editMode && (
        <p className={libStyles.helpText} style={{ textAlign: 'center', marginTop: '8px' }}>
          클릭하여 배치
        </p>
      )}
    </>
  );
};

export default MyCabinetGallery;
