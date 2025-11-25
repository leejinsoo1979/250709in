import React from 'react';
import styles from './PreviewViewer.module.css';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';

interface PreviewViewerProps {
  className?: string;
}

const directionLabels: Record<string, string> = {
  front: '정면',
  left: '좌측면',
  right: '우측면',
  top: '평면'
};

/**
 * 미리보기 뷰어 컴포넌트
 * 2D 뷰를 표시하며 마우스로 조작 가능
 */
const PreviewViewer: React.FC<PreviewViewerProps> = ({ className }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { view2DDirection } = useUIStore();

  return (
    <div className={`${styles.previewContainer} ${className || ''}`}>
      <div className={styles.previewHeader}>
        <span className={styles.previewLabel}>2D {directionLabels[view2DDirection] || '정면'}뷰</span>
      </div>
      <div className={styles.previewContent}>
        <div className={styles.viewerWrapper}>
          <Space3DView
            spaceInfo={spaceInfo}
            viewMode="2D"
            renderMode="wireframe"
            showDimensions={false}
            showAll={true}
            showFrame={true}
            isEmbedded={true}
            readOnly={false}
            hideEdges={true}
          />
        </div>
      </div>
    </div>
  );
};

export default PreviewViewer;
