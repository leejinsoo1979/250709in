import React, { useCallback } from 'react';
import styles from './PreviewViewer.module.css';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';

interface PreviewViewerProps {
  className?: string;
}

/**
 * 미리보기 뷰어 컴포넌트
 * 현재 2D 모드면 3D 미리보기를, 3D 모드면 2D 미리보기를 표시
 * 클릭하면 뷰 모드가 전환됨
 */
const PreviewViewer: React.FC<PreviewViewerProps> = ({ className }) => {
  const { viewMode, setViewMode, setRenderMode, view2DDirection } = useUIStore();
  const { spaceInfo } = useSpaceConfigStore();

  // 미리보기에 표시할 뷰 모드 (현재의 반대)
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  // 클릭하면 뷰 모드 전환
  const handleClick = useCallback(() => {
    const newMode = viewMode === '2D' ? '3D' : '2D';
    setViewMode(newMode);
    // 렌더 모드도 같이 변경
    if (newMode === '2D') {
      setRenderMode('wireframe');
    } else {
      setRenderMode('solid');
    }
  }, [viewMode, setViewMode, setRenderMode]);

  return (
    <div className={`${styles.previewContainer} ${className || ''}`}>
      <div className={styles.previewHeader}>
        <span className={styles.previewLabel}>
          {previewMode === '3D' ? '3D 미리보기' : '2D 미리보기'}
        </span>
        <span className={styles.previewHint}>클릭하여 전환</span>
      </div>
      <div className={styles.previewContent} onClick={handleClick}>
        <div className={styles.viewerWrapper}>
          <Space3DView
            spaceInfo={spaceInfo}
            viewMode={previewMode}
            renderMode={previewMode === '3D' ? 'solid' : 'wireframe'}
            showDimensions={false}
            showAll={true}
            showFrame={true}
            isEmbedded={true}
            readOnly={true}
            hideEdges={previewMode === '2D'}
          />
        </div>
        <div className={styles.clickOverlay}>
          <div className={styles.switchIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4M7 4L3 8M7 4L11 8" />
              <path d="M17 8V20M17 20L21 16M17 20L13 16" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewViewer;
