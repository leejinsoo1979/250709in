import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { Column } from '@/types/space';
import ColumnThumbnail from './ColumnThumbnail';
import { useTranslation } from '@/i18n/useTranslation';
import { getModuleBoundsX } from '@/editor/shared/utils/freePlacementUtils';
import styles from './ColumnControl.module.css';

interface ColumnControlProps {
  columns: Column[];
  onColumnsChange: (columns: Column[]) => void;
  onOpenEditModal?: (id: string) => void;
}

const ColumnControl: React.FC<ColumnControlProps> = ({ columns, onColumnsChange, onOpenEditModal }) => {
  const { t } = useTranslation();
  const spaceConfig = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);

  // 기둥 생성 모드는 제거하고 드래그 앤 드롭 방식으로 대체
  const handleThumbnailDragStart = (e: React.DragEvent) => {
    console.log('🎯 기둥 썸네일 드래그 시작');
  };

  // 더블클릭 핸들러 추가
  const handleThumbnailDoubleClick = (columnData: any) => {
    // 공간 정보 가져오기
    const spaceInfo = spaceConfig.spaceInfo;
    if (!spaceInfo) return;

    // 공간 중앙에 기둥 배치
    // 가구(의류장/키큰장)와 동일한 Z 정렬: 가구 공식 기준 뒷면을 맞춤
    // furnitureZOffset = zOffset + (panelDepth - furnitureDepth)/2
    // 가구 뒷면 Z = furnitureZOffset - furnitureDepth/2 - doorThickness
    // 기둥 중심 Z = 가구 뒷면 Z + columnDepth/2
    const centerX = 0;
    const panelDepthM = (spaceInfo.depth || 1500) * 0.01;
    const furnitureDepthM = Math.min(panelDepthM, 6); // 600mm
    const doorThicknessM = 0.2; // 20mm
    const zOffset = -panelDepthM / 2;
    const furnitureZOffset = zOffset + (panelDepthM - furnitureDepthM) / 2;
    const furnitureBackZ = furnitureZOffset - furnitureDepthM / 2 - doorThicknessM;
    const centerZ = furnitureBackZ + (columnData.depth * 0.01) / 2;

    const newColumn: Column = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, centerZ],
      width: columnData.width,
      height: spaceInfo.height || 2400,
      depth: columnData.depth,
      color: columnData.color || '#888888',
      material: columnData.material || 'concrete'
    };

    // 자유배치 모드에서 기둥-가구 충돌 체크
    if (spaceInfo.layoutMode === 'free-placement') {
      const colCenterXmm = centerX * 100;
      const colHalfW = newColumn.width / 2;
      for (const mod of placedModules) {
        if (!mod.isFreePlacement || mod.isSurroundPanel) continue;
        const modBounds = getModuleBoundsX(mod);
        if (colCenterXmm - colHalfW < modBounds.right && colCenterXmm + colHalfW > modBounds.left) {
          console.warn('기둥 배치 실패: 가구와 겹칩니다');
          return;
        }
      }
    }

    onColumnsChange([...columns, newColumn]);
  };

  return (
    <div className={styles.columnControl}>

      {/* 기둥 썸네일 드래그 앤 드롭 */}
      <div className={styles.thumbnailSection}>
        <h4>{t('sidebar.structureTypes')}</h4>
        <div className={styles.thumbnailGrid}>
          <ColumnThumbnail
            width={300}
            height={2400}
            depth={600}
            material="concrete"
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.columnA')}
          />
          <ColumnThumbnail
            width={120}
            height={2400}
            depth={730}
            material="concrete"
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.columnB')}
          />
          <ColumnThumbnail
            width={300}
            height={2400}
            depth={300}
            material="concrete"
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.columnC')}
          />
          <ColumnThumbnail
            width={120}
            height={2400}
            depth={730}
            material="concrete"
            color="#E0E0E0"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.partition')}
          />
        </div>
      </div>

    </div>
  );
};

export default ColumnControl;
