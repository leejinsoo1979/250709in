import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import styles from './MiniPlayer.module.css';

interface MiniPlayerProps {
  onClose: () => void;
}

/**
 * 유튜브 스타일 미니 플레이어
 * 실시간 3D/2D 미리보기를 플로팅 윈도우로 표시
 * 우측 하단에 플로팅되며 드래그로 이동, 리사이즈 가능
 */
const MiniPlayer: React.FC<MiniPlayerProps> = ({ onClose }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { viewMode } = useUIStore();

  // 미리보기는 현재 모드의 반대
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  // 플레이어 상태
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // 우측 하단에서 여백을 두고 시작
  const [position, setPosition] = useState({
    x: Math.max(20, window.innerWidth - 520),
    y: Math.max(20, window.innerHeight - 400)
  });
  const [size, setSize] = useState({ width: 480, height: 360 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // 컴포넌트 마운트 후 약간의 지연을 두고 뷰어 렌더링 (안정성)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 드래그 시작
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isFullscreen) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position, isFullscreen]);

  // 리사이즈 시작
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isFullscreen) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  }, [size, isFullscreen]);

  // 마우스 이동 처리
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - size.width, dragStartRef.current.posX + deltaX)),
          y: Math.max(0, Math.min(window.innerHeight - size.height, dragStartRef.current.posY + deltaY)),
        });
      }
      if (isResizing) {
        const deltaX = e.clientX - resizeStartRef.current.x;
        const deltaY = e.clientY - resizeStartRef.current.y;
        setSize({
          width: Math.max(300, Math.min(window.innerWidth - position.x, resizeStartRef.current.width + deltaX)),
          height: Math.max(200, Math.min(window.innerHeight - position.y, resizeStartRef.current.height + deltaY)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, size.width, size.height, position.x, position.y]);

  // 새 창에서 열기
  const openInNewWindow = useCallback(() => {
    const width = 1200;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    window.open(
      '/preview-popout',
      'preview-window',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );
  }, []);

  // 전체화면 토글 (현재 창 내에서)
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // ESC 키로 전체화면 해제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Portal을 사용해서 document.body에 직접 렌더링
  const miniPlayerContent = (
    <div
      ref={playerRef}
      className={`${styles.miniPlayer} ${isFullscreen ? styles.fullscreen : ''}`}
      style={isFullscreen ? {} : {
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* 헤더 - 드래그 영역 */}
      <div
        className={styles.header}
        onMouseDown={handleDragStart}
      >
        <span className={styles.title}>{previewMode} 미리보기</span>
        <div className={styles.controls}>
          {/* 새 창에서 열기 버튼 */}
          <button
            className={styles.controlButton}
            onClick={openInNewWindow}
            title="새 창에서 열기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          {/* 전체화면 버튼 */}
          <button
            className={styles.controlButton}
            onClick={toggleFullscreen}
            title={isFullscreen ? '전체화면 해제 (ESC)' : '전체화면'}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
          {/* 닫기 버튼 */}
          <button
            className={styles.controlButton}
            onClick={onClose}
            title="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 실시간 뷰어 컨텐츠 */}
      <div className={styles.content}>
        {isReady ? (
          <div className={styles.viewerWrapper}>
            <Space3DView
              key={`miniplayer-${previewMode}`}
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
        ) : (
          <div className={styles.loadingPlaceholder}>
            <span>로딩 중...</span>
          </div>
        )}
      </div>

      {/* 리사이즈 핸들 */}
      {!isFullscreen && (
        <div
          className={styles.resizeHandle}
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );

  // document.body에 Portal로 렌더링
  return createPortal(miniPlayerContent, document.body);
};

export default MiniPlayer;
