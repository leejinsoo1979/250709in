import React, { useEffect } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import styles from './PreviewPopout.module.css';

/**
 * 팝아웃 미리보기 창 컴포넌트
 * 별도 창에서 렌더링되는 미리보기 뷰어
 */
const PreviewPopout: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { viewMode } = useUIStore();

  // 미리보기는 현재 모드의 반대
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  // 창 제목 업데이트
  useEffect(() => {
    document.title = `${previewMode} 미리보기`;
  }, [previewMode]);

  return (
    <div className={styles.popoutContainer}>
      <div className={styles.popoutHeader}>
        <span className={styles.popoutLabel}>{previewMode} 미리보기</span>
        <span className={styles.popoutHint}>메인 창과 실시간 동기화</span>
      </div>
      <div className={styles.popoutContent}>
        <Space3DView
          spaceInfo={spaceInfo}
          viewMode={previewMode}
          renderMode={previewMode === '3D' ? 'solid' : 'wireframe'}
          showDimensions={false}
          showAll={false}
          showFurniture={true}
          showFrame={false}
          isEmbedded={false}
          readOnly={true}
          hideEdges={true}
        />
      </div>
    </div>
  );
};

export default PreviewPopout;
