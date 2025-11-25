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
  const { viewMode: mainViewMode } = useUIStore();
  const [isReady, setIsReady] = useState(false);

  // 로컬 뷰어 설정 상태
  const [localViewMode, setLocalViewMode] = useState<'2D' | '3D'>(mainViewMode === '2D' ? '3D' : '2D');
  const [renderMode, setRenderMode] = useState<'solid' | 'wireframe'>('solid');
  const [showDimensions, setShowDimensions] = useState(false);
  const [showFurniture, setShowFurniture] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showFrame, setShowFrame] = useState(true);

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
    document.title = `${localViewMode} 미리보기`;

    return () => {
      channel.close();
    };
  }, [setSpaceInfo, setPlacedModules]);

  // 창 제목 업데이트
  useEffect(() => {
    document.title = `${localViewMode} 미리보기`;
  }, [localViewMode]);

  // 뷰 모드 변경 시 렌더 모드 자동 조정
  useEffect(() => {
    if (localViewMode === '2D') {
      setRenderMode('wireframe');
    } else {
      setRenderMode('solid');
    }
  }, [localViewMode]);

  return (
    <div className={styles.popoutContainer}>
      {/* 헤더 */}
      <div className={styles.popoutHeader}>
        <span className={styles.popoutLabel}>{localViewMode} 미리보기</span>
        <span className={styles.popoutHint}>
          {isReady ? '메인 창과 실시간 동기화' : '연결 중...'}
        </span>
      </div>

      {/* 서브헤더 - 컨트롤 버튼들 */}
      <div className={styles.toolbar}>
        {/* 뷰 모드 토글 */}
        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>뷰 모드</span>
          <div className={styles.buttonGroup}>
            <button
              className={`${styles.toolButton} ${localViewMode === '3D' ? styles.active : ''}`}
              onClick={() => setLocalViewMode('3D')}
            >
              3D
            </button>
            <button
              className={`${styles.toolButton} ${localViewMode === '2D' ? styles.active : ''}`}
              onClick={() => setLocalViewMode('2D')}
            >
              2D
            </button>
          </div>
        </div>

        {/* 렌더 모드 */}
        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>렌더</span>
          <div className={styles.buttonGroup}>
            <button
              className={`${styles.toolButton} ${renderMode === 'solid' ? styles.active : ''}`}
              onClick={() => setRenderMode('solid')}
            >
              솔리드
            </button>
            <button
              className={`${styles.toolButton} ${renderMode === 'wireframe' ? styles.active : ''}`}
              onClick={() => setRenderMode('wireframe')}
            >
              와이어
            </button>
          </div>
        </div>

        {/* 구분선 */}
        <div className={styles.divider} />

        {/* 토글 버튼들 */}
        <button
          className={`${styles.toggleButton} ${showDimensions ? styles.active : ''}`}
          onClick={() => setShowDimensions(!showDimensions)}
          title="치수 표시"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
            <path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
            <path d="M4 12h16" />
          </svg>
          <span>치수</span>
        </button>

        <button
          className={`${styles.toggleButton} ${showFurniture ? styles.active : ''}`}
          onClick={() => setShowFurniture(!showFurniture)}
          title="가구 표시"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <span>가구</span>
        </button>

        <button
          className={`${styles.toggleButton} ${showFrame ? styles.active : ''}`}
          onClick={() => setShowFrame(!showFrame)}
          title="프레임 표시"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
          <span>프레임</span>
        </button>

        <button
          className={`${styles.toggleButton} ${showAll ? styles.active : ''}`}
          onClick={() => setShowAll(!showAll)}
          title="전체 보기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2v20M2 12h20" />
          </svg>
          <span>전체</span>
        </button>
      </div>

      {/* 뷰어 컨텐츠 */}
      <div className={styles.popoutContent}>
        {isReady ? (
          <Space3DView
            spaceInfo={spaceInfo}
            viewMode={localViewMode}
            renderMode={renderMode}
            showDimensions={showDimensions}
            showAll={showAll}
            showFurniture={showFurniture}
            showFrame={showFrame}
            isEmbedded={false}
            readOnly={true}
            hideEdges={localViewMode === '3D'}
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
