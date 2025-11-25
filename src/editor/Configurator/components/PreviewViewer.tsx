import React from 'react';
import styles from './PreviewViewer.module.css';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';

interface PreviewViewerProps {
  className?: string;
}

/**
 * 미리보기 뷰어 컴포넌트
 * 메인 뷰어가 2D면 3D 미리보기를, 3D면 2D 미리보기를 표시
 */
const PreviewViewer: React.FC<PreviewViewerProps> = ({ className }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { viewMode } = useUIStore();

  // 미리보기는 현재 모드의 반대
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  return (
    <div className={`${styles.previewContainer} ${className || ''}`}>
      <div className={styles.previewHeader}>
        <span className={styles.previewLabel}>{previewMode} 미리보기</span>
      </div>
      <div className={styles.previewContent}>
        <div className={styles.viewerWrapper}>
          <Space3DView
            spaceInfo={spaceInfo}
            viewMode={previewMode}
            renderMode={previewMode === '3D' ? 'solid' : 'wireframe'}
            showDimensions={false}
            showAll={false}
            showFurniture={true}
            showFrame={false}
            isEmbedded={true}
            readOnly={true}
            hideEdges={true}
          />
        </div>
      </div>
    </div>
  );
};

export default PreviewViewer;
