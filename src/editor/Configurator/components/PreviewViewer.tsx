import React, { useState } from 'react';
import styles from './PreviewViewer.module.css';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import MiniPlayer from './MiniPlayer';

interface PreviewViewerProps {
  className?: string;
}

/**
 * 미리보기 뷰어 컴포넌트
 * 메인 뷰어가 2D면 3D 미리보기를, 3D면 2D 미리보기를 표시
 * 팝아웃 버튼으로 미니 플레이어로 볼 수 있음
 */
const PreviewViewer: React.FC<PreviewViewerProps> = ({ className }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { viewMode, setViewMode, setView2DDirection, setSelectedSlotIndex } = useUIStore();
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);

  // 미리보기는 현재 모드의 반대
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  // 미리보기에서 가구 클릭 시 해당 슬롯의 측면뷰로 전환
  const handleFurnitureClick = (furnitureId: string, slotIndex: number) => {
    console.log('📍 PreviewViewer - 가구 클릭:', { furnitureId, slotIndex });
    // 2D 측면뷰로 전환
    setViewMode('2D');
    setView2DDirection('left'); // 좌측 측면뷰로 전환
    setSelectedSlotIndex(slotIndex); // 해당 슬롯 선택
  };

  return (
    <>
      <div className={`${styles.previewContainer} ${className || ''}`}>
        <div className={styles.previewHeader}>
          <span className={styles.previewLabel}>{previewMode} 미리보기</span>
          <button
            className={styles.popoutButton}
            onClick={() => setShowMiniPlayer(true)}
            title="미니 플레이어로 열기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>
        <div className={styles.previewContent}>
          <div className={styles.viewerWrapper}>
            <Space3DView
              spaceInfo={spaceInfo}
              viewMode={previewMode}
              renderMode={previewMode === '3D' ? 'solid' : 'wireframe'}
              showDimensions={false}
              showAll={true}
              showFurniture={true}
              showFrame={false}
              isEmbedded={true}
              readOnly={true}
              hideEdges={true}
              onFurnitureClick={handleFurnitureClick}
            />
          </div>
        </div>
      </div>

      {/* 미니 플레이어 */}
      {showMiniPlayer && (
        <MiniPlayer onClose={() => setShowMiniPlayer(false)} />
      )}
    </>
  );
};

export default PreviewViewer;
