import React, { useEffect, useState } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import styles from './PreviewPopout.module.css';

const CHANNEL_NAME = 'preview-sync';

/**
 * 팝아웃 미리보기 창 컴포넌트
 * 별도 창에서 렌더링되는 미리보기 뷰어
 * BroadcastChannel을 통해 메인 창과 실시간 동기화
 */
const PreviewPopout: React.FC = () => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules, setPlacedModules } = useFurnitureStore();
  const { viewMode } = useUIStore();
  const [isReady, setIsReady] = useState(false);

  // 미리보기는 현재 모드의 반대
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  // BroadcastChannel을 통한 상태 동기화
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('BroadcastChannel not supported');
      return;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);

    // 메인 창에서 오는 상태 업데이트 수신
    channel.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === 'STATE_UPDATE' || type === 'STATE_RESPONSE') {
        if (payload?.spaceInfo) {
          setSpaceInfo(payload.spaceInfo);
        }
        if (payload?.placedModules) {
          setPlacedModules(payload.placedModules);
        }
        setIsReady(true);
      }
    };

    // 메인 창에 상태 요청
    channel.postMessage({ type: 'REQUEST_STATE' });

    // 창 제목 업데이트
    document.title = `${previewMode} 미리보기`;

    return () => {
      channel.close();
    };
  }, [setSpaceInfo, setPlacedModules, previewMode]);

  // 창 제목 업데이트
  useEffect(() => {
    document.title = `${previewMode} 미리보기`;
  }, [previewMode]);

  return (
    <div className={styles.popoutContainer}>
      <div className={styles.popoutHeader}>
        <span className={styles.popoutLabel}>{previewMode} 미리보기</span>
        <span className={styles.popoutHint}>
          {isReady ? '메인 창과 실시간 동기화' : '연결 중...'}
        </span>
      </div>
      <div className={styles.popoutContent}>
        {isReady ? (
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
        ) : (
          <div className={styles.loading}>
            <span>메인 창과 연결 중...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewPopout;
