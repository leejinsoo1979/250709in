import React, { useCallback, useEffect, useRef } from 'react';
import styles from './PreviewViewer.module.css';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';

const CHANNEL_NAME = 'preview-sync';

interface PreviewViewerProps {
  className?: string;
}

/**
 * 미리보기 뷰어 컴포넌트
 * 메인 뷰어가 2D면 3D 미리보기를, 3D면 2D 미리보기를 표시
 * 팝아웃 버튼으로 별도 창에서 볼 수 있음
 * BroadcastChannel을 통해 팝아웃 창과 실시간 동기화
 */
const PreviewViewer: React.FC<PreviewViewerProps> = ({ className }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { viewMode } = useUIStore();
  const channelRef = useRef<BroadcastChannel | null>(null);

  // 미리보기는 현재 모드의 반대
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  // BroadcastChannel 설정 및 상태 동기화
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    // 팝아웃 창의 상태 요청 처리
    channel.onmessage = (event) => {
      if (event.data.type === 'REQUEST_STATE') {
        // 현재 상태 전송
        channel.postMessage({
          type: 'STATE_RESPONSE',
          payload: {
            spaceInfo,
            placedModules,
            viewMode,
          },
        });
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // 상태 변경 시 팝아웃 창에 업데이트 전송
  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'STATE_UPDATE',
        payload: {
          spaceInfo,
          placedModules,
          viewMode,
        },
      });
    }
  }, [spaceInfo, placedModules, viewMode]);

  // 팝아웃 창 열기
  const handlePopout = useCallback(() => {
    const width = 800;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      '/preview-popout',
      'preview-popout',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );
  }, []);

  return (
    <div className={`${styles.previewContainer} ${className || ''}`}>
      <div className={styles.previewHeader}>
        <span className={styles.previewLabel}>{previewMode} 미리보기</span>
        <button
          className={styles.popoutButton}
          onClick={handlePopout}
          title="별도 창으로 열기"
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
