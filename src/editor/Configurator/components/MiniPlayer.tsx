import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import styles from './MiniPlayer.module.css';

interface MiniPlayerProps {
  onClose: () => void;
}

/**
 * 유튜브 스타일 미니 플레이어
 * 메인 뷰어의 스냅샷을 표시 (WebGL 컨텍스트 충돌 방지)
 * 우측 하단에 플로팅되며 드래그로 이동, 리사이즈 가능
 */
const MiniPlayer: React.FC<MiniPlayerProps> = ({ onClose }) => {
  const { viewMode } = useUIStore();

  // 미리보기는 현재 모드의 반대
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  // 플레이어 상태
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(true);

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

  // 메인 뷰어에서 스냅샷 캡처
  const captureSnapshot = useCallback(() => {
    setIsCapturing(true);

    // 메인 뷰어의 캔버스 찾기
    const mainCanvas = document.querySelector('[data-main-viewer] canvas') as HTMLCanvasElement;

    if (mainCanvas) {
      try {
        const dataUrl = mainCanvas.toDataURL('image/png');
        setSnapshotUrl(dataUrl);
      } catch (error) {
        console.error('스냅샷 캡처 실패:', error);
      }
    }

    setIsCapturing(false);
  }, []);

  // 컴포넌트 마운트 시 스냅샷 캡처
  useEffect(() => {
    // 약간의 지연 후 캡처 (렌더링 완료 대기)
    const timer = setTimeout(() => {
      captureSnapshot();
    }, 100);

    return () => clearTimeout(timer);
  }, [captureSnapshot]);

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

  // 전체화면 토글
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
        <span className={styles.title}>{previewMode} 미리보기 (스냅샷)</span>
        <div className={styles.controls}>
          {/* 새로고침 버튼 */}
          <button
            className={styles.controlButton}
            onClick={captureSnapshot}
            title="스냅샷 새로고침"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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

      {/* 스냅샷 컨텐츠 */}
      <div className={styles.content}>
        {isCapturing ? (
          <div className={styles.loadingPlaceholder}>
            <span>캡처 중...</span>
          </div>
        ) : snapshotUrl ? (
          <img
            src={snapshotUrl}
            alt="뷰어 스냅샷"
            className={styles.snapshotImage}
          />
        ) : (
          <div className={styles.loadingPlaceholder}>
            <span>스냅샷을 캡처할 수 없습니다</span>
            <button
              onClick={captureSnapshot}
              className={styles.retryButton}
            >
              다시 시도
            </button>
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
